// =========================
// 🏷️ LegendCustomization (v1.16.0 step 2)
// =========================
//
// Module de personnalisation de la légende (libellés + visibilité +
// entrées custom). Cascade à 3 niveaux :
//
//   1. session  (overrides de l'utilisateur, persisté dans SessionPersist
//                — lié au plan courant, perdu si l'user change de plan
//                et y revient avec une session différente)
//   2. plan     (PLAN_CONFIG.customLegend — défini par l'auteur du plan)
//   3. default  (libellés hardcodés ci-dessous, charte MKM)
//
// Le resolver applique la cascade en order croissant : session > plan >
// default. Pour la visibilité : explicit-true / explicit-false / undefined
// = suivre le niveau supérieur.
//
// API publique :
//   window.LegendCustomization.getLabel(category, key)        → string
//   window.LegendCustomization.isVisible(category, key)       → bool
//   window.LegendCustomization.getSource(category, key)       → "session"|"plan"|"default"
//   window.LegendCustomization.listEntries(category)          → Entry[]
//   window.LegendCustomization.listCustomEntries(category)    → CustomEntry[]
//   window.LegendCustomization.setSessionLabel(cat, key, lbl) → void
//   window.LegendCustomization.setSessionVisibility(cat, key, vis)
//   window.LegendCustomization.addCustomEntry(entry)          → string (id)
//   window.LegendCustomization.removeCustomEntry(id)
//   window.LegendCustomization.resetSession()
//
//   Hooks SessionPersist :
//     window.LegendCustomization.loadSessionState(state)
//     window.LegendCustomization.getSessionState()        → serializable
//
//   Hook plan switch (appelé par main.js après PLAN_CONFIG load) :
//     window.LegendCustomization.loadPlanState()
//
// Catégories supportées :
//   - icones      (puits, signalétique, etc.)
//   - traces      (principal, secondaire, chemin, jonction)
//   - zones       (eau, remblais, effondrement, inaccessible)
//   - structures  (pilier-1, pilier-2, mur, front-1, front-2)
//
// Format de stockage (session ET plan) :
//   {
//     labels: { "<cat>.<key>": "Libellé override" },
//     hidden: { "<cat>.<key>": true/false },
//     customEntries: [
//       { id, category, label, lineColor?, fillColor?, borderColor?, iconUrl? }
//     ]
//   }
//
// Hash de version : si on change la structure, bumper SCHEMA_VERSION pour
// invalider gracieusement les anciennes sessions.

window.LegendCustomization = (function() {
  "use strict";

  const SCHEMA_VERSION = 1;

  // ─────────────────────────────────────────────
  // Libellés défaut (charte MKM — synchro exporter.js > _dessinerLegende)
  // ─────────────────────────────────────────────
  const DEFAULT_LABELS = {
    icones: {
      salle: "Salle", pa: "Puits Aération", pc: "Puits Comblé",
      pb: "Puits Bouché", pe: "Puits au sol / Bassin", ps: "Puits extraction",
      peo: "Puits à échelon ouvert", pef: "Puits à échelon fermé",
      eso: "Escalier service ouvert", esf: "Escalier service fermé",
      cao: "Cavage ouvert", caf: "Cavage fermé",
      passage: "Passage", chatiere: "Chatière", vehicule: "Véhicule",
      danger: "Danger", info: "Information", elec: "Électricité", epure: "Épure",
      plaque: "Plaque indication",
      portail: "Portail (liaison inter-plan)",  // 🆕 v1.59.0
      // 🐛 v1.76.0 — trois tags built-in MANQUAIENT ici depuis leur création :
      // dès que la légende passait par getLabel (LC présent = toujours), ils
      // s'affichaient en clé brute (« entree_plan » au lieu de « Point
      // d'entrée du plan »). Le fallback historique LEGENDE_LABELS
      // d'interfaceLegende.js les avait, mais il n'est lu que SANS LC.
      entree_plan: "Point d'entrée du plan",    // v1.41.0 D
      track: "Position du tracker",
      "default": "Point sans tag (défaut)"
    },
    traces: {
      principal:  "Route principale",
      secondaire: "Route secondaire",
      chemin:     "Chemin",
      jonction:   "Jonction interniveau"
    },
    zones: {
      eau:          "Eau",
      remblais:     "Remblais",
      effondrement: "Effondrement",
      inaccessible: "Inaccessible"
    },
    structures: {
      "pilier-1":  "Pilier 1ère masse",
      "pilier-2":  "Pilier 2e masse",
      "mur":       "Mur",
      "front-1":   "Front de taille 1ère",
      "front-2":   "Front de taille 2e"
    }
  };

  // 🎨 v1.76.0 — la table DEFAULT_RENDERS est supprimée.
  // C'était LA plus dangereuse des ~25 tables : elle décrivait les pastilles
  // de l'éditeur de légende et était TOTALEMENT INDÉPENDANTE de celle du rendu
  // carte. Les deux coïncidaient par chance ; le jour où l'une bougeait, la
  // légende aurait menti sur la carte sans qu'aucun test ne le voie.
  //
  // Le rendu par défaut d'une entrée BUILT-IN est désormais dérivé du style
  // réel, via `js/styleResolver.js` :
  //   • une ligne (tracé, front de taille) → `lineColor`
  //   • un polygone (zone, pilier, mur)    → `fillColor` + `borderColor`
  // C'est exactement la normalisation appliquée aux entrées CUSTOM à leur
  // création (cf. `addCustomEntry`), donc les deux familles se décrivent enfin
  // de la même façon.
  // `{ flat: true }` : une pastille ne sait pas peindre un motif SVG.
  function _renduDefaut(category, key) {
    if (typeof window.ktaResolveStyle !== "function") return {};
    const s = window.ktaResolveStyle(category, key, { flat: true });
    if (!s) return {};
    // Ligne : pas de remplissage à montrer. Le canon donne un `fillColor` aux
    // fronts (plusieurs consommateurs le lisent) — on ne le propage PAS ici,
    // sinon la pastille afficherait un polygone pour un tracé.
    const estLigne = (category === "traces") || !!s.isPolyline;
    if (estLigne) return { lineColor: s.color };
    return { fillColor: s.fillColor, borderColor: s.color };
  }

  const CATEGORIES = ["icones", "traces", "zones", "structures"];
  const CATEGORY_TITLES = {
    icones:     "🏷️ Icônes",
    traces:     "🛣️ Tracés",
    zones:      "⬛ Zones",
    structures: "🏛️ Structures"
  };

  // ─────────────────────────────────────────────
  // États session + plan (cascade)
  // ─────────────────────────────────────────────
  // 🎨 v1.76.1 — `borders` : couleur de BORDURE choisie pour un type built-in
  // polygone (zones, piliers/mur), map séparée de `colors` et non un objet
  // {fond, bordure} : une session v1.76.0 qui n'a que `colors` reste valide
  // telle quelle, zéro migration de format. Absente → bordure dérivée (zones)
  // ou noire (structures), comme avant.
  // 🪦 v1.77.0 — removedPlan : TOMBSTONES des entrées PLAN-LEVEL supprimées
  // par l'utilisateur (bug KARMA : un « Bas » embarqué dans le plan-config
  // d'un ZIP régénéré revenait à chaque chargement, insupprimable côté
  // session depuis la résurrection de la légende plan-level — fix C4).
  // LOCAL à la session de ce plan sur cet appareil : ne voyage pas dans les
  // exports (comme un masquage, pas une donnée).
  function _emptyState() {
    return { labels: {}, hidden: {}, colors: {}, borders: {}, customEntries: [], removedPlan: [] };
  }

  let _sessionState = _emptyState();
  let _planState    = _emptyState();

  // 🎨 v1.76.0 — `colors` : couleur choisie par l'utilisateur pour un type
  // BUILT-IN, indexée comme `labels` et `hidden` (clé "<catégorie>.<type>").
  // UNE seule couleur par type — cf. `_appliquerOverride` dans styleResolver.js
  // pour la façon dont elle est appliquée selon la géométrie.
  // Les types CUSTOM ne passent pas par là : leurs couleurs sont déjà dans
  // l'entrée elle-même, éditables via la dialog de modification.
  //
  // 🧹 v1.76.0 (F22) — `hidden` existe dans la nature sous DEUX formes : objet
  // ({ "traces.principal": true }) et TABLEAU de clés (["traces.principal"]) —
  // createConf teste `Array.isArray(cl.hidden)` à 3 endroits, preuve que la
  // forme tableau a réellement circulé. Or un tableau passait le test
  // `typeof === "object"` d'ici et TOUS les lookups `hidden[k]` rendaient
  // `undefined` en silence : les masquages venus d'un plan au format tableau
  // étaient perdus sans un log. On MIGRE le tableau vers la forme objet au
  // chargement — un seul format en mémoire, tous les producteurs acceptés.
  function _hiddenEnObjet(h) {
    if (Array.isArray(h)) {
      const o = {};
      h.forEach(function(k) { if (typeof k === "string" && k) o[k] = true; });
      return o;
    }
    return (h && typeof h === "object") ? h : {};
  }

  function _normalize(state) {
    // `state` peut venir d'un localStorage corrompu, d'un plan-config forgé ou
    // d'un calque importé malformé : tout champ est suspect. Sans le filtre
    // ci-dessous, UNE entrée `null` dans customEntries suffisait à faire
    // planter listCustomEntries (TypeError sur e.category) → plus de légende
    // NI de sidebar au boot. Trouvé par le checkup destructif M3 (05/08),
    // avant qu'un utilisateur ne le trouve.
    const s = (state && typeof state === "object") ? state : {};
    // 🔒 05/10/2026 (audit XSS) : libellés, couleurs et icônes finissent dans du HTML (pastilles,
    // légende, filtres) ; un plan ou une session partagés ne sont pas crus sur parole.
    const texte = function(v) { return typeof window.ktaTexteSur === "function" ? window.ktaTexteSur(v, 120) : String(v).replace(/[<>"`]/g, ""); };
    const couleur = function(v) {
      if (typeof window.ktaCouleurSure === "function") return window.ktaCouleurSure(v);
      return (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim())) ? v.trim() : null;
    };
    const dict = function(o, fn) {
      const out = {};
      if (o && typeof o === "object" && !Array.isArray(o)) {
        Object.keys(o).forEach(function(k) { const v = fn(o[k]); if (v !== null && v !== undefined && v !== "") out[k] = v; });
      }
      return out;
    };
    const ID_SUR = /^[\w.:-]{1,80}$/;
    return {
      labels:        dict(s.labels, function(v) { return typeof v === "string" ? texte(v) : null; }),
      hidden:        _hiddenEnObjet(s.hidden),
      colors:        dict(s.colors, couleur),
      borders:       dict(s.borders, couleur),
      removedPlan:   Array.isArray(s.removedPlan) ? s.removedPlan.filter(function(x) { return typeof x === "string"; }) : [],
      customEntries: (Array.isArray(s.customEntries) ? s.customEntries : []).filter(function(e) {
        // une entrée exploitable a AU MINIMUM un id sûr (il sert de clé et d'attribut)
        return e && typeof e === "object" && typeof e.id === "string" && ID_SUR.test(e.id) &&
          (e.category === undefined || ID_SUR.test(String(e.category)));
      }).map(function(e) {
        const c = Object.assign({}, e);
        if (c.label !== undefined) c.label = texte(c.label);
        ["lineColor", "fillColor", "borderColor", "color"].forEach(function(k) {
          if (c[k] !== undefined && c[k] !== null) c[k] = couleur(c[k]);
        });
        if (c.iconUrl !== undefined && c.iconUrl !== null &&
            !(typeof window.ktaCheminIconePlausible === "function" && window.ktaCheminIconePlausible(c.iconUrl))) {
          delete c.iconUrl;
        }
        return c;
      })
    };
  }

  function loadSessionState(state) {
    _sessionState = _normalize(state);
  }

  function getSessionState() {
    // Retourne un snapshot sérialisable (deep copy minimale)
    return {
      schemaVersion: SCHEMA_VERSION,
      labels:        Object.assign({}, _sessionState.labels),
      hidden:        Object.assign({}, _sessionState.hidden),
      colors:        Object.assign({}, _sessionState.colors),
      borders:       Object.assign({}, _sessionState.borders),
      removedPlan:   _sessionState.removedPlan.slice(),
      customEntries: _sessionState.customEntries.map(function(e) { return Object.assign({}, e); })
    };
  }

  function isSessionStateEmpty() {
    return Object.keys(_sessionState.labels).length === 0
        && Object.keys(_sessionState.hidden).length === 0
        && Object.keys(_sessionState.colors).length === 0
        && Object.keys(_sessionState.borders).length === 0
        && _sessionState.removedPlan.length === 0
        && _sessionState.customEntries.length === 0;
  }

  function loadPlanState() {
    const config = window.PLAN_CONFIG;
    // 🐛 v1.76.1 — LA LIGNE QUI A TUÉ LA LÉGENDE PLAN-LEVEL DEPUIS SON
    // INTRODUCTION (24/05, commit 613517b8). Ce lecteur cherchait
    // `PLAN_CONFIG.customLegend` (racine) alors que TOUS les producteurs
    // (createConf, kmzImport, gpxImport) écrivent `plan.customLegend`
    // (sous-objet). `_planState` était donc structurellement toujours vide :
    // une légende définie au Générateur n'a JAMAIS été appliquée au runtime,
    // et toute la chaîne F2/F3 « la légende voyage » aboutissait dans un champ
    // que personne ne lisait. Trouvé par l'audit indépendant du 06/08.
    // On lit les DEUX formes (racine en priorité, rétro-compat d'éventuels
    // fichiers édités à la main).
    _planState = _normalize(
      (config && config.customLegend) ||
      (config && config.plan && config.plan.customLegend)
    );
  }

  // ─────────────────────────────────────────────
  // Cascade resolvers
  // ─────────────────────────────────────────────
  function _key(category, key) {
    return category + "." + key;
  }

  function getDefaultLabel(category, key) {
    // i18n au RUNTIME : si une clé "legend.label.<cat>.<key>" existe, on la
    // sert traduite ; sinon fallback sur la constante FR (DEFAULT_LABELS),
    // qui reste la source de vérité structurelle (clés built-in). DEFAULT_LABELS
    // ne peut pas être traduit au load (I18n pas garanti chargé au top-level).
    const i18nKey = "legend.label." + category + "." + key;
    if (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(i18nKey)) {
      return window.I18n.t(i18nKey);
    }
    return (DEFAULT_LABELS[category] && DEFAULT_LABELS[category][key]) || key;
  }

  function getLabel(category, key) {
    const k = _key(category, key);
    if (_sessionState.labels[k] != null && _sessionState.labels[k] !== "") return _sessionState.labels[k];
    if (_planState.labels[k]    != null && _planState.labels[k]    !== "") return _planState.labels[k];
    return getDefaultLabel(category, key);
  }

  function isVisible(category, key) {
    const k = _key(category, key);
    // session a la priorité (true = caché, false = explicite show, undefined = fallthrough)
    if (_sessionState.hidden[k] === true)  return false;
    if (_sessionState.hidden[k] === false) return true;
    if (_planState.hidden[k]    === true)  return false;
    if (_planState.hidden[k]    === false) return true;
    return true; // défaut visible
  }

  function getSource(category, key) {
    const k = _key(category, key);
    if (_sessionState.labels[k] != null && _sessionState.labels[k] !== "") return "session";
    if (_planState.labels[k]    != null && _planState.labels[k]    !== "") return "plan";
    return "default";
  }

  // 🎨 v1.76.0 — couleur choisie pour un type BUILT-IN. Même cascade que les
  // libellés : session > plan > aucune (auquel cas le style canonique
  // s'applique tel quel). Rend `null` s'il n'y a pas d'override.
  // ⚠️ Lecture PURE : appelée depuis `ktaResolveStyle`, qui est lui-même
  // appelé depuis ce module (`_renduDefaut`). Ne jamais y appeler le résolveur.
  function getColor(category, key) {
    const k = _key(category, key);
    const s = _sessionState.colors[k];
    if (typeof s === "string" && s) return s;
    const p = _planState.colors[k];
    if (typeof p === "string" && p) return p;
    return null;
  }

  // `color` = null / "" → retire l'override et rend la couleur d'origine.
  function setColor(category, key, color) {
    const k = _key(category, key);
    if (!color) delete _sessionState.colors[k];
    else _sessionState.colors[k] = String(color);
    _persistSession();
    _repeindreCarte();
  }

  // 🎨 v1.76.0 — REPEINDRE APRÈS UN CHANGEMENT DE COULEUR.
  // Sans ça la feature ne « marche » pas : le style est bien résolu à la
  // nouvelle couleur, mais les objets Leaflet déjà dessinés gardent l'ancienne
  // jusqu'au prochain rendu — l'utilisateur choisirait une couleur et ne
  // verrait rien changer avant de recharger le plan.
  // Le listener `onCustomEntriesChange` existant ne suffit PAS : son unique
  // abonné (interface.js) ne rafraîchit que les boutons de la sidebar.
  // 🎨 v1.76.0 (N1) — les CALQUES DE DONNÉES sont désormais repeints eux
  // aussi (window._ktaRestyleDataLayers, cf. utils.js) : la limite « recharge
  // le plan pour voir les couleurs sur les calques » est levée.
  function _repeindreCarte() {
    ["renderRoads", "renderZones", "renderStructures", "_ktaRestyleDataLayers"].forEach(function(fn) {
      if (typeof window[fn] === "function") {
        try { window[fn](); } catch(e) { console.warn("[LegendCustomization] " + fn + " a échoué :", e); }
      }
    });
  }

  function hasColorOverride(category, key) {
    return getColor(category, key) !== null || getBorderColor(category, key) !== null;
  }

  // 🎨 v1.76.1 — bordure indépendante du remplissage (décision KARMA : « une
  // zone ou une structure pouvait avoir un contour et un remplissage
  // différents, on garde »). Même cascade que getColor. Null = pas d'override
  // → bordure dérivée (zones) ou noire (structures), comme avant.
  function getBorderColor(category, key) {
    const k = _key(category, key);
    const s = _sessionState.borders[k];
    if (typeof s === "string" && s) return s;
    const p = _planState.borders[k];
    if (typeof p === "string" && p) return p;
    return null;
  }

  function setBorderColor(category, key, color) {
    const k = _key(category, key);
    if (!color) delete _sessionState.borders[k];
    else _sessionState.borders[k] = String(color);
    _persistSession();
    _repeindreCarte();
  }

  // ─────────────────────────────────────────────
  // Liste des entrées (cascade appliquée)
  // ─────────────────────────────────────────────
  function listEntries(category) {
    const out = [];
    Object.keys(DEFAULT_LABELS[category] || {}).forEach(function(key) {
      const r = _renduDefaut(category, key);
      out.push({
        category:     category,
        key:          key,
        label:        getLabel(category, key),
        defaultLabel: getDefaultLabel(category, key),
        planLabel:    _planState.labels[_key(category, key)] || null,
        visible:      isVisible(category, key),
        source:       getSource(category, key),
        // 🎨 v1.76.0 — vrai si l'utilisateur (ou le plan) a choisi une couleur.
        // Sert à n'afficher le bouton « remettre la couleur d'origine » que
        // lorsqu'il a un sens.
        hasColor:     hasColorOverride(category, key),
        lineColor:    r.lineColor,
        fillColor:    r.fillColor,
        borderColor:  r.borderColor,
        isCustom:     false
      });
    });
    return out;
  }

  function listCustomEntries(category) {
    // Custom entries provenant des 2 niveaux (plan + session).
    // 🧹 v1.76.0 (F21) — DÉDUPLICATION par id, session prioritaire. Les ids
    // `cust-<ts36>-<rnd36>` sont probabilistes, pas structurellement uniques :
    // si un plan et une session déclarent le même id (collision, ou plan
    // regénéré depuis la session — cas courant depuis F2/F3), on affichait
    // DEUX lignes de légende et DEUX boutons de sidebar identiques. La session
    // gagne : c'est déjà la règle de `findCustomEntry`, les deux résolveurs
    // doivent raconter la même chose.
    // Ordre d'affichage historique conservé : plan d'abord, session ensuite.
    // En cas de doublon d'id, la ligne du plan est REMPLACÉE par la variante
    // session, à sa place.
    const sessionParId = new Map();
    _sessionState.customEntries.forEach(function(e) {
      if (!category || e.category === category) sessionParId.set(e.id, e);
    });
    const out = [];
    const emis = new Set();
    _planState.customEntries.forEach(function(e) {
      if (category && e.category !== category) return;
      if (emis.has(e.id)) return;
      if (_sessionState.removedPlan.indexOf(e.id) >= 0) return;   // 🪦 supprimée par l'utilisateur   // audit 06/08 : deux entrées de même id DANS le plan = une seule ligne
      const src = sessionParId.get(e.id) || e;
      const source = sessionParId.has(e.id) ? "session" : "plan";
      emis.add(e.id);
      out.push(Object.assign({}, src, { isCustom: true, source: source, visible: isCustomVisible(src.id) }));
    });
    _sessionState.customEntries.forEach(function(e) {
      if (category && e.category !== category) return;
      if (emis.has(e.id)) return;
      out.push(Object.assign({}, e, { isCustom: true, source: "session", visible: isCustomVisible(e.id) }));
    });
    return out;
  }

  function isCustomVisible(id) {
    // Visibilité d'une entrée custom : même mécanisme via hidden map avec
    // clé spéciale "custom.<id>". Permet à un user de masquer une custom
    // entry du plan sans la supprimer.
    const k = "custom." + id;
    if (_sessionState.hidden[k] === true)  return false;
    if (_sessionState.hidden[k] === false) return true;
    if (_planState.hidden[k]    === true)  return false;
    return true;
  }

  // ─────────────────────────────────────────────
  // Setters (session uniquement, le plan n'est éditable que dans createConf)
  // ─────────────────────────────────────────────
  // 🐛 v1.76.1 (annexe 6, audit 06/08) — le Générateur édite la légende du
  // PLAN en la « swappant » temporairement dans _sessionState. Chaque mutation
  // déclenchait alors _persistSession → la légende du plan s'écrivait dans le
  // slot de SESSION du plan courant (fuite : entrées cust-… fantômes en
  // session). Le Générateur suspend la persistance pendant le swap.
  let _persistSuspendu = false;
  function suspendPersist(on) { _persistSuspendu = !!on; }

  function _persistSession() {
    if (_persistSuspendu) return;
    // Sauvegarde immédiate via SessionPersist si dispo. Sinon no-op (la
    // session sera sauvée à la prochaine save automatique).
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch(e) {}
    }
  }

  function setSessionLabel(category, key, label) {
    const k = _key(category, key);
    if (label == null) {
      delete _sessionState.labels[k];
    } else {
      const trimmed = String(label).trim();
      // Si l'user efface le champ OU saisit exactement le defaultLabel/planLabel,
      // on retire l'override (= retour propre à la cascade niveau supérieur).
      const planLabel = _planState.labels[k];
      const defLabel  = getDefaultLabel(category, key);
      if (trimmed === "" || trimmed === planLabel || trimmed === defLabel) {
        delete _sessionState.labels[k];
      } else {
        _sessionState.labels[k] = trimmed;
      }
    }
    _persistSession();
  }

  function setSessionVisibility(category, key, visible) {
    const k = _key(category, key);
    const wantHidden = (visible === false);
    const planHidden = _planState.hidden[k] === true;
    if (wantHidden === planHidden) {
      // Aligné avec le plan → pas besoin d'override session
      delete _sessionState.hidden[k];
    } else {
      _sessionState.hidden[k] = wantHidden;
    }
    _persistSession();
  }

  function setCustomEntryVisibility(id, visible) {
    const k = "custom." + id;
    const wantHidden = (visible === false);
    const planHidden = _planState.hidden[k] === true;
    if (wantHidden === planHidden) {
      delete _sessionState.hidden[k];
    } else {
      _sessionState.hidden[k] = wantHidden;
    }
    _persistSession();
  }

  function _newId() {
    // ID stable et lisible pour debug (pas besoin d'UUID full RFC4122)
    return "cust-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  // ─────────────────────────────────────────────
  // Listeners de mutation des customs
  // ─────────────────────────────────────────────
  //
  // Permet à d'autres modules (interface.js pour la sidebar dynamique,
  // road.js / structures.js / zones.js pour invalider d'éventuels caches
  // de style) de réagir quand un custom est ajouté/supprimé/modifié.
  //
  // Usage :
  //   const unsubscribe = LegendCustomization.onCustomEntriesChange(function() {
  //     // re-render UI
  //   });
  //   ...
  //   unsubscribe();
  const _customChangeListeners = [];
  function onCustomEntriesChange(fn) {
    if (typeof fn !== "function") return function() {};
    _customChangeListeners.push(fn);
    return function() {
      const idx = _customChangeListeners.indexOf(fn);
      if (idx >= 0) _customChangeListeners.splice(idx, 1);
    };
  }
  function _fireCustomChange() {
    _customChangeListeners.forEach(function(fn) {
      try { fn(); } catch(e) { console.warn("[LegendCustomization] listener custom-change erreur :", e); }
    });
  }

  // 🐛 v1.76.0 (F8) — COMPTE LES OBJETS QUI UTILISENT UN TYPE.
  // Supprimer une entrée custom la retirait sans un mot, et tous les objets
  // dessinés de ce type basculaient instantanément en repli : blanc pour un
  // tracé, gris remblais pour une zone, bleu mur pour une structure — et un
  // FRONT custom, perdant sa géométrie déclarée, se refermait en polygone
  // plein. Rien ne prévenait, rien ne permettait de revenir en arrière.
  // On compte session ET calques de données : les seconds ne sont pas
  // modifiables, donc leurs objets resteraient orphelins pour de bon.
  function countUsages(id) {
    if (!id) return { session: 0, calques: 0, total: 0 };
    let session = 0, calques = 0;
    function _compter(liste) {
      let n = 0;
      (liste || []).forEach(function(o) { if (o && o.type === id) n++; });
      return n;
    }
    [["getRoads", "getAllEmbeddedRoads"],
     ["getZones", "getAllEmbeddedZones"],
     ["getStructures", "getAllEmbeddedStructures"]].forEach(function(paire) {
      if (typeof window[paire[0]] === "function") {
        try { session += _compter(window[paire[0]]()); } catch(e) {}
      }
      if (typeof window[paire[1]] === "function") {
        try { calques += _compter(window[paire[1]]()); } catch(e) {}
      }
    });
    return { session: session, calques: calques, total: session + calques };
  }

  // 🧹 v1.76.0 (F23) — TYPES ORPHELINS : objets dessinés dont le type `cust-…`
  // n'existe dans AUCUNE légende (entrée supprimée, calque importé sans sa
  // définition avant F2/F3…). C'était la cause racine commune des symptômes
  // « objets blancs/gris sans ligne de légende » : le problème existait mais
  // RIEN ne le rendait visible. ≡ Légende affiche désormais un avertissement.
  // Retourne [{ type, categorie, nb }] — vide si tout va bien.
  function listOrphanTypes() {
    const orphelins = new Map();
    [["traces", "getRoads", "getAllEmbeddedRoads"],
     ["zones", "getZones", "getAllEmbeddedZones"],
     ["structures", "getStructures", "getAllEmbeddedStructures"]].forEach(function(trio) {
      const cat = trio[0];
      [trio[1], trio[2]].forEach(function(fn) {
        if (typeof window[fn] !== "function") return;
        let liste;
        try { liste = window[fn]() || []; } catch(e) { return; }
        liste.forEach(function(o) {
          if (!o || typeof o.type !== "string" || !o.type) return;
          // 🐛 v1.76.1 — le filtre `cust-` d'origine rendait INVISIBLES les
          // types bruts hérités d'anciennes versions ou écrits à la main
          // (« Bas ») : renommer un cust- orphelin en type brut faisait TAIRE
          // le bandeau sans rien résoudre (vécu par KARMA le 05/08). Règle
          // désormais : est orphelin tout type NON built-in de sa catégorie
          // sans entrée de légende, quel que soit son nom.
          if (typeof window.ktaStyleBuiltins === "function" &&
              window.ktaStyleBuiltins(cat).indexOf(o.type) >= 0) return;
          if (findCustomEntry(o.type)) return;
          const k = cat + "|" + o.type;
          if (!orphelins.has(k)) orphelins.set(k, { type: o.type, categorie: cat, nb: 0 });
          orphelins.get(k).nb++;
        });
      });
    });
    return Array.from(orphelins.values());
  }

  // Lookup d'une entrée custom par ID (session OU plan).
  function findCustomEntry(id) {
    if (!id) return null;
    const fromSession = _sessionState.customEntries.find(function(e) { return e.id === id; });
    if (fromSession) return Object.assign({}, fromSession, { source: "session" });
    if (_sessionState.removedPlan.indexOf(id) >= 0) return null;   // 🪦 supprimée par l'utilisateur
    const fromPlan = _planState.customEntries.find(function(e) { return e.id === id; });
    if (fromPlan) return Object.assign({}, fromPlan, { source: "plan" });
    return null;
  }

  // Géométrie par catégorie : détermine la nature géométrique de l'entrée
  // custom pour qu'elle soit DESSINABLE sur la carte.
  //   - traces      → toujours "polyline" (les routes sont des lignes)
  //   - zones       → toujours "polygon"  (les zones sont des surfaces)
  //   - structures  → "polyline" (front de taille) OU "polygon" (pilier/mur)
  //                   ← user choix à la création
  //   - icones      → "marker" (n/a pour le dessin, juste pour la légende)
  //
  // Si entry.geometry est manquant à la création, on déduit le défaut.
  function _defaultGeometry(category, providedGeometry) {
    if (category === "traces")    return "polyline";
    if (category === "zones")     return "polygon";
    if (category === "icones")    return "marker";
    if (category === "structures") {
      if (providedGeometry === "polyline" || providedGeometry === "polygon") return providedGeometry;
      return "polygon"; // défaut structure = polygone (pilier/mur)
    }
    return "polyline";
  }

  function addCustomEntry(entry) {
    if (!entry || !entry.category) return null;
    if (CATEGORIES.indexOf(entry.category) < 0) return null;
    const id = entry.id || _newId();
    // 🧷 v1.76.1 — un id EXPLICITE déjà présent en session (double-clic sur le
    // bouton du bandeau orphelins, re-liaison) REMPLACE l'entrée au lieu d'en
    // empiler une seconde du même id.
    if (entry.id) {
      const dejaIdx = _sessionState.customEntries.findIndex(function(e) { return e.id === id; });
      if (dejaIdx >= 0) _sessionState.customEntries.splice(dejaIdx, 1);
    }
    const geom = _defaultGeometry(entry.category, entry.geometry);
    // 🐛 v1.16.0 step2-drawable-fix (KARMA "il me fait les deux, le polygone
    // et un trait en plus") : on NORMALISE les champs de couleur en fonction
    // de la géométrie pour éviter qu'une entrée polygone stocke aussi un
    // lineColor (qui était ensuite rendu comme TRAIT dans la légende, en
    // double avec le polygone sur la carte).
    //   - polyline  → lineColor seul (fillColor & borderColor = null)
    //   - polygon   → fillColor + borderColor (lineColor = null)
    //   - marker    → iconUrl (pas de couleurs)
    let lineColor   = entry.lineColor   || null;
    let fillColor   = entry.fillColor   || null;
    let borderColor = entry.borderColor || null;
    if (geom === "polyline") {
      fillColor   = null;
      borderColor = null;
    } else if (geom === "polygon") {
      // Si l'utilisateur a fourni lineColor mais pas borderColor (cas du
      // dialog où la checkbox "trait" était cochée pour un polygone), on
      // promeut lineColor en borderColor pour la bordure du polygone. Puis
      // on retire lineColor (sinon le swatch légende le lirait en priorité
      // et afficherait un trait fantôme à côté du polygone).
      if (!borderColor && lineColor) borderColor = lineColor;
      if (!borderColor && fillColor) borderColor = fillColor;
      lineColor = null;
    }
    const clean = {
      id:          id,
      category:    entry.category,
      // 🆕 v1.16.0 step2-drawable : geometry pour rendre les entrées custom
      // DESSINABLES (toggleXMode + render appliquent le bon style selon la
      // géométrie). Si non fourni, on déduit du category.
      geometry:    geom,
      label:       String(entry.label || "").trim() || ((window.I18n && window.I18n.t) ? window.I18n.t("legend.entry.unnamed") : "Sans nom"),
      // Renders optionnels — normalisés par géométrie ci-dessus
      lineColor:   lineColor,
      fillColor:   fillColor,
      borderColor: borderColor,
      iconUrl:     entry.iconUrl     || null
    };
    _sessionState.customEntries.push(clean);
    _persistSession();
    _fireCustomChange();
    // 🐛 v1.76.1 (C1 audit 06/08) — LE chaînon manquant de l'intermittence :
    // toutes les autres mutations repeignaient, PAS l'ajout. Lier un type
    // depuis le bandeau ⚠️ colorait (rattrapage manuel dans interfaceLegende),
    // créer la même entrée depuis ✏️ Modifier → ➕ ne colorait RIEN jusqu'à la
    // mutation suivante — deux chemins d'UI identiques en apparence, deux
    // comportements. Un objet dessiné du type ajouté doit se lier TOUT DE SUITE.
    _repeindreCarte();
    return id;
  }

  function removeCustomEntry(id) {
    let touche = false;
    const idx = _sessionState.customEntries.findIndex(function(e) { return e.id === id; });
    if (idx >= 0) { _sessionState.customEntries.splice(idx, 1); touche = true; }
    // 🪦 v1.77.0 — l'entrée existe AUSSI (ou seulement) au niveau PLAN : la
    // retirer de la session ne suffit pas, elle reviendrait du plan-config à
    // chaque chargement (vécu KARMA avec son « Bas » embarqué dans un ZIP
    // régénéré). On pose une pierre tombale en session : l'entrée plan est
    // filtrée partout (liste, résolveur via findCustomEntry). resetSession
    // ou réimport de la légende la font revenir — c'est voulu et dit.
    const dansPlan = _planState.customEntries.some(function(e) { return e.id === id; });
    if (dansPlan && _sessionState.removedPlan.indexOf(id) < 0) {
      _sessionState.removedPlan.push(id);
      touche = true;
    }
    if (touche) {
      _persistSession();
      _fireCustomChange();
      // Les objets du type supprimé doivent basculer en repli TOUT DE SUITE
      // (et le bandeau orphelins de ≡ Légende devenir exact au prochain open).
      _repeindreCarte();
      return true;
    }
    // Si c'est une entrée du PLAN (non éditable), on la cache via hidden
    // plutôt que la supprimer.
    const planEntry = _planState.customEntries.find(function(e) { return e.id === id; });
    if (planEntry) {
      setCustomEntryVisibility(id, false);
      _fireCustomChange();
      return true;
    }
    return false;
  }

  // 🩸 v1.82.0 — RENOMMER OU RECOLORER UNE ENTRÉE DU *PLAN* NE FAISAIT RIEN.
  // Cette fonction ne cherchait que dans `_sessionState.customEntries` et
  // sortait sur `return false` sans rien dire. Or les entrées d'un plan
  // IMPORTÉ vivent dans `_planState` : celles que l'import SIG fabrique par
  // niveau y sont toutes. L'éditeur les LISTAIT (`listCustomEntries` émet les
  // deux niveaux) mais aucune modification ne prenait — signalé par KARMA sur
  // « +1 (historique) » : « ça ne fait rien, même sur le plan en cours ».
  // Le renommage ET les trois couleurs passent par ici : les quatre étaient
  // mortes sur une entrée de plan.
  //
  // `removeCustomEntry` avait déjà rencontré le problème et l'avait traité
  // (pierre tombale, v1.77.0). Le mécanisme est donc déjà là et déjà dit : la
  // SESSION se superpose au PLAN, et une entrée de session GAGNE sur celle du
  // plan à id égal — c'est la règle de `listCustomEntries` comme de
  // `findCustomEntry`. On promeut donc l'entrée du plan en session, patch
  // appliqué. Elle passe alors en source « session », ce qui est exact :
  // l'utilisateur l'a reprise. `resetSession` rend l'originale du plan.
  function updateCustomEntry(id, patch) {
    let idx = _sessionState.customEntries.findIndex(function(e) { return e.id === id; });
    if (idx < 0) {
      const dePlan = _planState.customEntries.find(function(e) { return e.id === id; });
      if (!dePlan) return false;
      // Copie : le state du plan vient de PLAN_CONFIG, il ne se mute pas.
      _sessionState.customEntries.push(Object.assign({}, dePlan));
      idx = _sessionState.customEntries.length - 1;
    }
    const e = _sessionState.customEntries[idx];
    if (patch.label != null)       e.label       = String(patch.label).trim() || e.label;
    if (patch.lineColor   !== undefined) e.lineColor   = patch.lineColor   || null;
    if (patch.fillColor   !== undefined) e.fillColor   = patch.fillColor   || null;
    if (patch.borderColor !== undefined) e.borderColor = patch.borderColor || null;
    if (patch.iconUrl     !== undefined) e.iconUrl     = patch.iconUrl     || null;
    if (patch.geometry === "polyline" || patch.geometry === "polygon") e.geometry = patch.geometry;
    _persistSession();
    _fireCustomChange();
    // Une couleur/géométrie de custom modifiée doit se voir sans redémarrage,
    // comme l'override des built-in (setColor fait pareil).
    _repeindreCarte();
    return true;
  }

  function resetSession() {
    _sessionState = _emptyState();
    _persistSession();
    _fireCustomChange();
    // 🐛 v1.76.0 — sans repeinture, les couleurs override restaient affichées
    // jusqu'au redémarrage : le reset vidait bien l'état, mais les objets
    // Leaflet déjà dessinés gardaient leur style (bug remonté par KARMA).
    _repeindreCarte();
  }

  // ─────────────────────────────────────────────
  // Helpers exposés pour exporter.js
  // ─────────────────────────────────────────────
  function categoryTitle(category) {
    // i18n au RUNTIME (clé "legend.cat.<category>"), fallback constante FR.
    const i18nKey = "legend.cat." + category;
    if (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(i18nKey)) {
      return window.I18n.t(i18nKey);
    }
    return CATEGORY_TITLES[category] || category;
  }

  function listCategories() {
    return CATEGORIES.slice();
  }

  // ─────────────────────────────────────────────
  // ÉDITEUR STANDALONE (modale dédiée)
  // ─────────────────────────────────────────────
  //
  // Ouvre une modale charte MKM qui contient le même panneau de personnalisation
  // que la modale Export PNG, mais utilisable depuis n'importe où dans l'UI
  // (typiquement : bouton « ✏️ Modifier » dans la fenêtre Légende mode carte).
  //
  // L'editeur appelle les setters de session du module → SessionPersist.save
  // se déclenche automatiquement via _persistSession.
  //
  // opts = { onChange: () => void }    (callback à chaque modification)
  //        { onClose:  () => void }    (callback à la fermeture)
  function ouvrirEditeur(opts) {
    opts = opts || {};

    // Si déjà ouvert → close (toggle)
    const existing = document.getElementById("kta-legend-editor-modal");
    if (existing) { existing.remove(); if (opts.onClose) opts.onClose(); return; }

    function _esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const modal = document.createElement("div");
    modal.id = "kta-legend-editor-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.zIndex = "100050";  // au-dessus de la modale Légende (qui est à 99999)
    modal.innerHTML =
      '<div class="kta-readme-modal-boite" style="width:auto; max-width:560px; height:auto; max-height:90vh; padding:0; overflow:hidden; display:flex; flex-direction:column;">' +
        '<div class="kta-readme-modal-header" style="padding:14px 16px;">' +
          '<span class="kta-readme-modal-titre">' + window.I18n.t("legend.editor.title") + '</span>' +
          '<button class="kta-panneau-close" id="kta-legend-editor-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" id="kta-legend-editor-body" style="padding:14px 16px; overflow-y:auto; flex:1 1 auto;">' +
          '<p style="font-size:12px; color:#8892a4; margin:0 0 12px 0; line-height:1.5;">' +
            window.I18n.t("legend.editor.intro") +
          '</p>' +
          // 🎨 v1.76.0 (F6) — lève l'ambiguïté historique de la case à cocher.
          // Elle n'a JAMAIS masqué quoi que ce soit de la carte : elle ne
          // retire l'entrée que de la BOÎTE de légende. Le masquage carte
          // existe déjà, dans 🔍 Filtres — étendre celle-ci au rendu aurait
          // créé deux contrôles concurrents sur la même chose. On l'explique
          // au lieu de la changer.
          '<p style="font-size:12px; color:#8892a4; margin:0 0 12px 0; line-height:1.5;">' +
            window.I18n.t("legend.editor.hintVisibilite") +
          '</p>' +
          '<div id="kta-legend-editor-list"></div>' +
        '</div>' +
        '<div style="padding:12px 16px; border-top:1px solid rgba(255,255,255,0.08); display:flex; gap:8px; flex-wrap:wrap; justify-content:space-between;">' +
          '<div style="display:flex; gap:8px;">' +
            '<button class="kta-btn kta-btn-ghost kta-btn-small" type="button" id="kta-legend-editor-add">' +
              window.I18n.t("legend.editor.add") +
            '</button>' +
            '<button class="kta-btn kta-btn-ghost kta-btn-small" type="button" id="kta-legend-editor-reset" title="' + window.I18n.t("legend.editor.resetTitle") + '">' +
              window.I18n.t("legend.editor.reset") +
            '</button>' +
          '</div>' +
          '<button class="kta-btn kta-btn-primary kta-btn-small" type="button" id="kta-legend-editor-done">' +
            window.I18n.t("legend.editor.done") +
          '</button>' +
        '</div>' +
      '</div>';

    document.documentElement.appendChild(modal);

    function _sourceBadge(source) {
      if (source === "session") return '<span class="kta-legend-src kta-legend-src-session" title="' + window.I18n.t("legend.editor.srcSession") + '">✏️</span>';
      if (source === "plan")    return '<span class="kta-legend-src kta-legend-src-plan"    title="' + window.I18n.t("legend.editor.srcPlan") + '">📋</span>';
      return                          '<span class="kta-legend-src kta-legend-src-default" title="' + window.I18n.t("legend.editor.srcDefault") + '">·</span>';
    }

    function _renderEntryRow(e, isCustomEntry) {
      // Pour les icones standard, essaie de résoudre l'iconUrl via _iconePourTag
      // (helper global d'exporter.js — peut être absent si l'utilisateur a
      // ouvert cet éditeur sans avoir d'abord chargé exporter.js).
      let iconUrl = e.iconUrl;
      if (!iconUrl && e.category === "icones" && typeof window._iconePourTag === "function") {
        try { iconUrl = window._iconePourTag(e.key); } catch(err) { iconUrl = null; }
      } else if (!iconUrl && e.category === "icones") {
        // Fallback : essaie PLAN_CONFIG.icons puis window._iconMap directement
        const cfg = window.PLAN_CONFIG;
        if (cfg && cfg.icons && cfg.icons[e.key]) iconUrl = cfg.icons[e.key];
        else if (window._iconMap && window._iconMap[e.key]) {
          const iobj = window._iconMap[e.key];
          iconUrl = iobj._kta_iconUrl || (iobj.options && iobj.options.iconUrl) || null;
        }
      }

      // 🐛 v1.16.0 step2-drawable-fix : utilise GEOMETRY comme discriminator
      // primaire pour le swatch (au lieu de "lineColor first"). Évite qu'un
      // polygon avec lineColor stocké en accident soit affiché en trait.
      let swatch = '';
      if (iconUrl) {
        swatch = '<img src="' + _esc(iconUrl) + '" alt="" style="width:16px;height:16px;object-fit:contain;flex:0 0 16px;">';
      } else if (e.geometry === "polyline" || (!e.geometry && e.lineColor && !e.fillColor)) {
        // Polyline (front custom) ou legacy entry avec lineColor seul
        const col = e.lineColor || e.fillColor || "#888";
        swatch = '<span style="display:inline-block;width:16px;height:3px;background:' + _esc(col) + ';flex:0 0 16px;border-radius:1px;"></span>';
      } else if (e.geometry === "polygon" || e.fillColor) {
        // Polygone (zones, structures pilier/mur) ou legacy avec fillColor
        const fill   = e.fillColor || e.lineColor || "#888";
        const border = e.borderColor || e.lineColor || fill;
        swatch = '<span style="display:inline-block;width:14px;height:14px;background:' + _esc(fill) + ';border:1px solid ' + _esc(border) + ';flex:0 0 14px;border-radius:2px;"></span>';
      } else {
        swatch = '<span style="display:inline-block;width:14px;height:14px;flex:0 0 14px;"></span>';
      }

      const dataAttrs = isCustomEntry
        ? 'data-custom-id="' + _esc(e.id) + '"'
        : 'data-cat="' + _esc(e.category) + '" data-key="' + _esc(e.key) + '"';

      const placeholder = isCustomEntry ? _esc(e.label) : _esc(e.defaultLabel);
      const value = (e.label === e.defaultLabel && !isCustomEntry) ? "" : _esc(e.label);

      const btnRm = isCustomEntry
        ? '<button type="button" class="kta-legend-rm" title="' + window.I18n.t("legend.editor.rmCustomTitle") + '" ' + dataAttrs + '>🗑️</button>'
        : '';

      // 🎨 v1.76.0 — sélecteur de couleur sur les types BUILT-IN dessinables.
      // Les entrées CUSTOM ont déjà leurs couleurs dans l'entrée elle-même, et
      // les ICÔNES sont des images : ni l'une ni l'autre n'a de couleur à
      // choisir ici. Pour ces deux familles on garde la pastille statique.
      // La couleur affichée vient de `listEntries`, donc du style RÉEL — elle
      // reflète déjà l'override, sans calcul en double.
      // 🎨 v1.76.1 (S3 audit 06/08) — les entrées CUSTOM sont éditables comme
      // les built-in (« iso », demande KARMA) : mêmes carrés de couleur, à
      // chaud. Avant, leurs couleurs n'étaient choisies qu'à la CRÉATION —
      // pastille statique ensuite, deux principes de fonctionnement pour deux
      // familles de lignes dans le même éditeur.
      const estColorable = e.category !== "icones";
      let champCouleur = "";
      if (estColorable) {
        // Un POLYGONE expose DEUX carrés : fond + bordure. Une ligne, un seul.
        // Built-in : la géométrie se lit au style résolu (fillColor présent) ;
        // custom : à la géométrie DÉCLARÉE (plus fiable que la présence d'un
        // champ couleur, cf. audit).
        const estPolygone = isCustomEntry ? (e.geometry === "polygon") : !!e.fillColor;
        const curFond = estPolygone ? (e.fillColor || "#888888") : (e.lineColor || "#888888");
        champCouleur =
          '<input type="color" class="kta-legend-color" value="' + _esc(curFond) + '" ' +
            'title="' + window.I18n.t("legend.editor.colorTitle") + '" ' + dataAttrs + '>' +
          (estPolygone
            ? '<input type="color" class="kta-legend-border" value="' + _esc(e.borderColor || (isCustomEntry ? curFond : "#000000")) + '" ' +
                'title="' + window.I18n.t("legend.editor.borderTitle") + '" ' + dataAttrs + '>'
            : '') +
          // ↺ n'a de sens que pour un built-in (retour au canon). Un custom
          // n'a pas de couleur « d'origine ».
          (!isCustomEntry && e.hasColor
            ? '<button type="button" class="kta-legend-color-reset" ' +
                'title="' + window.I18n.t("legend.editor.colorResetTitle") + '" ' + dataAttrs + '>↺</button>'
            : '');
      }

      return '<div class="kta-legend-row" ' + dataAttrs + '>' +
               '<label class="kta-legend-vis" title="' + window.I18n.t("legend.editor.visTitle") + '">' +
                 '<input type="checkbox" class="kta-legend-vis-cb" ' +
                   (e.visible ? "checked" : "") + ' ' + dataAttrs + '>' +
               '</label>' +
               (estColorable ? champCouleur : swatch) +
               '<input type="text" class="kta-legend-label" placeholder="' + placeholder + '" ' +
                 'value="' + value + '" ' + dataAttrs + '>' +
               _sourceBadge(e.source) +
               btnRm +
             '</div>';
    }

    function _render() {
      const cont = document.getElementById("kta-legend-editor-list");
      if (!cont) return;
      let html = "";
      CATEGORIES.forEach(function(cat) {
        const title = categoryTitle(cat);
        const entries = listEntries(cat);
        const customs = listCustomEntries(cat);
        const isIcones = (cat === "icones");
        const sectionOpen = isIcones ? "" : "open";
        html += '<details class="kta-legend-cat" ' + sectionOpen + '>' +
                  '<summary>' + _esc(title) +
                    ' <span class="kta-legend-count">(' + (entries.length + customs.length) + ')</span>' +
                  '</summary>' +
                  '<div class="kta-legend-cat-body">';
        entries.forEach(function(e) { html += _renderEntryRow(e, false); });
        customs.forEach(function(e) { html += _renderEntryRow(e, true); });
        html += '</div></details>';
      });
      cont.innerHTML = html;
    }

    _render();

    function _applyFromUI(target) {
      const cat = target.getAttribute("data-cat");
      const key = target.getAttribute("data-key");
      const customId = target.getAttribute("data-custom-id");

      if (target.classList.contains("kta-legend-vis-cb")) {
        if (customId) setCustomEntryVisibility(customId, target.checked);
        else if (cat && key) setSessionVisibility(cat, key, target.checked);
      } else if (target.classList.contains("kta-legend-label")) {
        if (customId) updateCustomEntry(customId, { label: target.value });
        else if (cat && key) setSessionLabel(cat, key, target.value);
      } else if (target.classList.contains("kta-legend-color")) {
        // S3 (audit 06/08) : un custom se route par son id — sur sa géométrie
        // déclarée (polyline → trait, polygon → fond). updateCustomEntry
        // persiste ET repeint déjà.
        if (customId) {
          const ent = findCustomEntry(customId);
          updateCustomEntry(customId, (ent && ent.geometry === "polyline")
            ? { lineColor: target.value } : { fillColor: target.value });
        }
        else if (cat && key) setColor(cat, key, target.value);
      } else if (target.classList.contains("kta-legend-border")) {
        if (customId) updateCustomEntry(customId, { borderColor: target.value });
        else if (cat && key) setBorderColor(cat, key, target.value);
      }
      if (opts.onChange) opts.onChange();
    }

    // 🐛 v1.77.0 — insertion ciblée du bouton ↺ après un changement de
    // couleur (remplace le _render destructeur, cf. handler change). Les
    // customs n'ont pas de ↺ (pas de couleur « d'origine »).
    function _majBoutonReset(input) {
      if (!input || input.getAttribute("data-custom-id")) return;
      const cellule = input.parentNode;
      if (!cellule || cellule.querySelector(".kta-legend-color-reset")) return;
      const cat = input.getAttribute("data-cat"), key = input.getAttribute("data-key");
      if (!cat || !key) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kta-legend-color-reset";
      btn.title = window.I18n.t("legend.editor.colorResetTitle");
      btn.setAttribute("data-cat", cat);
      btn.setAttribute("data-key", key);
      btn.textContent = "↺";
      cellule.appendChild(btn);   // le clic est géré par la délégation existante
    }

    const body = document.getElementById("kta-legend-editor-list");
    if (body) {
      body.addEventListener("change", function(e) {
        if (e.target.matches(".kta-legend-vis-cb")) _applyFromUI(e.target);
        // 🎨 v1.76.0 — la couleur est appliquée sur `change`, PAS sur `input`.
        // WebKit émet un `input` à CHAQUE mouvement du curseur dans le
        // sélecteur natif : sur `input` on écrirait la session des dizaines de
        // fois par glissement. C'est exactement le mécanisme qui avait rendu
        // les Blob du fond d'écran illisibles le 02/08 — même piège, autre
        // module. `change` ne tire qu'à la validation.
        if (e.target.matches(".kta-legend-color") || e.target.matches(".kta-legend-border")) {
          _applyFromUI(e.target);
          // 🐛 v1.77.0 (bug KARMA PC : « le picker ne sauvegarde rien ») —
          // NE JAMAIS _render() ici : sur desktop le sélecteur natif reste
          // OUVERT après chaque `change` (panneau persistant, contrairement à
          // la feuille modale iOS qui ferme) ; le re-render détruisait
          // l'input pendant que le picker le tenait encore → tous les choix
          // suivants partaient dans un élément DÉTACHÉ, jamais appliqués.
          // Le seul but du _render était le bouton ↺ : on l'insère de façon
          // CIBLÉE, sans toucher au reste du DOM.
          _majBoutonReset(e.target);
        }
      });
      body.addEventListener("input", function(e) {
        if (e.target.matches(".kta-legend-label")) _applyFromUI(e.target);
      });
      body.addEventListener("click", function(e) {
        if (e.target.matches(".kta-legend-rm")) {
          const id = e.target.getAttribute("data-custom-id");
          if (id) {
            // 🐛 v1.76.0 (F8) — on prévient AVANT, avec le décompte réel.
            // Un type supprimé laisse ses objets orphelins, sans retour arrière.
            const u = countUsages(id);
            if (u.total > 0) {
              const ent = findCustomEntry(id);
              const msg = window.I18n.t("legend.editor.rmUsedConfirm", {
                nom:      (ent && ent.label) || id,
                total:    u.total,
                calques:  u.calques
              });
              if (!window.confirm(msg)) return;
            }
            removeCustomEntry(id);
            _render();
            if (opts.onChange) opts.onChange();
          }
        } else if (e.target.matches(".kta-legend-color-reset")) {
          const c = e.target.getAttribute("data-cat");
          const k = e.target.getAttribute("data-key");
          if (c && k) {
            setColor(c, k, null);        // null = retour à la couleur d'origine
            setBorderColor(c, k, null);  // 🎨 v1.76.1 — ↺ remet AUSSI la bordure
            _render();
            if (opts.onChange) opts.onChange();
          }
        }
      });
    }

    document.getElementById("kta-legend-editor-add").addEventListener("click", function() {
      _ouvrirAddDialog(function() {
        _render();
        if (opts.onChange) opts.onChange();
      });
    });

    document.getElementById("kta-legend-editor-reset").addEventListener("click", function() {
      const ok = window.confirm(window.I18n.t("legend.editor.resetConfirm"));
      if (!ok) return;
      resetSession();
      _render();
      if (opts.onChange) opts.onChange();
    });

    function fermer() {
      try { modal.remove(); } catch(e) {}
      if (opts.onClose) opts.onClose();
    }
    document.getElementById("kta-legend-editor-close").addEventListener("click", fermer);
    document.getElementById("kta-legend-editor-done").addEventListener("click", fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });
  }

  // Mini-modale « Ajouter une entrée custom » — utilisée par ouvrirEditeur.
  // Reprend la même structure que la version inline d'exporter.js mais en
  // version standalone (= peut être appelée hors contexte Export PNG).
  // 🧷 v1.76.1 — `prefill` optionnel { id, category, label } : mode « lier un
  // type existant ». Utilisé par le bandeau orphelins de ≡ Légende : l'entrée
  // créée porte l'ID EXACT du type déjà présent dans les données (`Bas`,
  // `cust-perdu`, …) au lieu d'un id neuf qui ne se lierait jamais — c'était
  // le mur rencontré par KARMA (recréer l'entrée à la main = nouvel id).
  // La catégorie est verrouillée (l'orphelin la connaît), l'id n'est jamais
  // montré ni saisi à la main.
  // `prefill` sans id = création ordinaire, catégorie verrouillée (flyout
  // ➕ Nouveau type de interface.js) ; `prefill.titre` remplace le titre.
  // `onAdded(id)` reçoit l'id de l'entrée créée.
  function _ouvrirAddDialog(onAdded, prefill) {
    const wrap = document.createElement("div");
    wrap.className = "kta-readme-modal-overlay";
    wrap.style.zIndex = "100100";  // au-dessus de l'éditeur (100050)
    wrap.innerHTML =
      '<div class="kta-readme-modal-boite" style="width:auto; max-width:420px; height:auto; max-height:90vh; padding:20px; overflow-y:auto;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:8px;">' +
          '<h3 style="margin:0; font-size:16px; color:#e8eaf0;">' +
            ((prefill && prefill.titre) || window.I18n.t("legend.add.title")) + '</h3>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" type="button" id="kta-lc-add-close" style="padding:2px 8px;">✕</button>' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
          '<label class="kta-cfg-label">' + window.I18n.t("legend.add.category") + '</label>' +
          '<select class="kta-cfg-input" id="kta-lc-add-cat">' +
            '<option value="traces">' + window.I18n.t("legend.add.catTraces") + '</option>' +
            '<option value="zones">' + window.I18n.t("legend.add.catZones") + '</option>' +
            '<option value="structures">' + window.I18n.t("legend.add.catStructures") + '</option>' +
            '<option value="icones">' + window.I18n.t("legend.add.catIcones") + '</option>' +
          '</select>' +
        '</div>' +
        // 🆕 v1.16.0 step2-drawable : pour les STRUCTURES uniquement, ajout
        // d'un choix de géométrie polyline/polygon pour différencier "front
        // de taille" (= polyline, comme front-1/front-2 built-in) de
        // "pilier/mur" (= polygon, comme pilier-1/pilier-2/mur built-in).
        // Pour les autres catégories, la géométrie est implicite (traces =
        // polyline, zones = polygon).
        '<div style="margin-bottom:10px; display:none;" id="kta-lc-add-geom-wrap">' +
          '<label class="kta-cfg-label">' + window.I18n.t("legend.add.structType") + '</label>' +
          '<div style="display:flex; gap:6px;">' +
            '<label class="kta-export-radio-row" style="flex:1;">' +
              '<input type="radio" name="kta-lc-add-geom" value="polygon" checked>' +
              '<span>' + window.I18n.t("legend.add.polygon") + ' <span style="color:#8892a4; font-size:11px;">' + window.I18n.t("legend.add.polygonHint") + '</span></span>' +
            '</label>' +
            '<label class="kta-export-radio-row" style="flex:1;">' +
              '<input type="radio" name="kta-lc-add-geom" value="polyline">' +
              '<span>' + window.I18n.t("legend.add.polyline") + ' <span style="color:#8892a4; font-size:11px;">' + window.I18n.t("legend.add.polylineHint") + '</span></span>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
          '<label class="kta-cfg-label">' + window.I18n.t("legend.add.label") + '</label>' +
          '<input class="kta-cfg-input" id="kta-lc-add-label" type="text" placeholder="' + window.I18n.t("legend.add.labelPlaceholder") + '">' +
        '</div>' +
        '<div style="margin-bottom:10px;" id="kta-lc-add-line-wrap">' +
          '<label class="kta-cfg-label">' + window.I18n.t("legend.add.lineColor") + '</label>' +
          '<input class="kta-cfg-input" id="kta-lc-add-line" type="color" value="#00ff00" style="height:32px; padding:2px;">' +
          '<label class="kta-export-cb-row" style="margin-top:4px;">' +
            '<input type="checkbox" id="kta-lc-add-line-on" checked>' +
            '<span>' + window.I18n.t("legend.add.lineToggle") + '</span>' +
          '</label>' +
        '</div>' +
        '<div style="margin-bottom:10px;" id="kta-lc-add-fill-wrap">' +
          '<label class="kta-cfg-label">' + window.I18n.t("legend.add.fillColor") + '</label>' +
          '<input class="kta-cfg-input" id="kta-lc-add-fill" type="color" value="#3aa9e8" style="height:32px; padding:2px;">' +
          '<label class="kta-export-cb-row" style="margin-top:4px;">' +
            '<input type="checkbox" id="kta-lc-add-fill-on">' +
            '<span>' + window.I18n.t("legend.add.fillToggle") + '</span>' +
          '</label>' +
        '</div>' +
        // 🎨 v1.76.1 — bordure INDÉPENDANTE du remplissage (zones + piliers/mur).
        // Décochée = comportement historique (bordure = fond). Le sélecteur
        // « trait » de v1.16 avait été caché pour les polygones avec la note
        // « un éditeur plus tard » — c'est ce bloc, 60 versions après.
        '<div style="margin-bottom:10px; display:none;" id="kta-lc-add-border-wrap">' +
          '<label class="kta-cfg-label">' + window.I18n.t("legend.add.borderColor") + '</label>' +
          '<input class="kta-cfg-input" id="kta-lc-add-border" type="color" value="#000000" style="height:32px; padding:2px;">' +
          '<label class="kta-export-cb-row" style="margin-top:4px;">' +
            '<input type="checkbox" id="kta-lc-add-border-on">' +
            '<span>' + window.I18n.t("legend.add.borderToggle") + '</span>' +
          '</label>' +
        '</div>' +
        '<div style="margin-bottom:10px; display:none;" id="kta-lc-add-icon-wrap">' +
          '<label class="kta-cfg-label">' + window.I18n.t("legend.add.iconUrl") + '</label>' +
          '<input class="kta-cfg-input" id="kta-lc-add-icon" type="text" placeholder="' + window.I18n.t("legend.add.iconPlaceholder") + '">' +
        '</div>' +
        '<div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">' +
          '<button class="kta-btn kta-btn-ghost"   type="button" id="kta-lc-add-cancel">' + window.I18n.t("legend.add.cancel") + '</button>' +
          '<button class="kta-btn kta-btn-primary" type="button" id="kta-lc-add-ok">' + window.I18n.t("legend.add.ok") + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);

    function fermerAdd() { try { wrap.remove(); } catch(e) {} }

    document.getElementById("kta-lc-add-close").addEventListener("click", fermerAdd);
    document.getElementById("kta-lc-add-cancel").addEventListener("click", fermerAdd);
    wrap.addEventListener("click", function(e) { if (e.target === wrap) fermerAdd(); });

    const catSel = document.getElementById("kta-lc-add-cat");
    const geomWrap = document.getElementById("kta-lc-add-geom-wrap");
    const lineWrap = document.getElementById("kta-lc-add-line-wrap");
    const fillWrap = document.getElementById("kta-lc-add-fill-wrap");
    const iconWrap = document.getElementById("kta-lc-add-icon-wrap");
    const borderWrap = document.getElementById("kta-lc-add-border-wrap");

    // Mode « lier un type existant » (cf. en-tête de la fonction)
    if (prefill && prefill.category) {
      catSel.value = prefill.category;
      catSel.disabled = true;
    }
    if (prefill && prefill.label) {
      document.getElementById("kta-lc-add-label").value = prefill.label;
    }

    function _getStructGeometry() {
      const r = wrap.querySelector('input[name="kta-lc-add-geom"]:checked');
      return r ? r.value : "polygon";
    }

    function _majChamps() {
      const cat = catSel.value;
      if (cat === "icones") {
        geomWrap.style.display = "none";
        lineWrap.style.display = "none";
        fillWrap.style.display = "none";
        borderWrap.style.display = "none";
        iconWrap.style.display = "block";
      } else {
        iconWrap.style.display = "none";
        if (cat === "traces") {
          geomWrap.style.display = "none";
          lineWrap.style.display = "block";
          fillWrap.style.display = "none";
          borderWrap.style.display = "none";
        } else if (cat === "zones") {
          geomWrap.style.display = "none";
          lineWrap.style.display = "none";
          fillWrap.style.display = "block";
          document.getElementById("kta-lc-add-fill-on").checked = true;
          // 🐛 v1.76.0 — DÉCOCHER le trait, pas seulement le masquer. La case
          // est `checked` dans le HTML ; la cacher ne la décoche pas, donc
          // `lineOn` restait vrai et `lineColor` prenait la valeur par défaut
          // du color picker jamais affiché (#00ff00). `addCustomEntry` la
          // promouvait ensuite en `borderColor` → TOUTE zone custom naissait
          // avec un contour VERT FLUO que l'utilisateur n'avait pas choisi.
          document.getElementById("kta-lc-add-line-on").checked = false;
          borderWrap.style.display = "block";   // 🎨 v1.76.1 bordure optionnelle
        } else {
          // structures → afficher le sélecteur de géométrie + ajuster
          // les champs de couleur selon le choix.
          // 🐛 v1.16.0 step2-drawable-fix : pour POLYGONE, on cache le
          // selecteur "trait" pour éviter que l'utilisateur saisisse une
          // couleur de trait par méprise (qui sera ensuite ignorée par le
          // resolver et l'addCustomEntry normalise — mais autant nettoyer
          // l'UI). Pour la BORDURE d'un polygone, l'utilisateur peut
          // utiliser un éditeur plus tard (ou on prend fillColor par défaut).
          geomWrap.style.display = "block";
          const geom = _getStructGeometry();
          if (geom === "polyline") {
            // Front de taille : couleur trait obligatoire, pas de fill
            lineWrap.style.display = "block";
            fillWrap.style.display = "none";
            borderWrap.style.display = "none";
            document.getElementById("kta-lc-add-line-on").checked = true;
          } else {
            // Pilier/mur : couleur fill obligatoire, pas de trait séparé
            // (la bordure prend fillColor par défaut au render).
            lineWrap.style.display = "none";
            fillWrap.style.display = "block";
            document.getElementById("kta-lc-add-fill-on").checked = true;
            // 🐛 v1.76.0 — même correctif que pour les zones : sans ce
            // décochage, un pilier/mur custom naissait avec une bordure verte
            // fluo au lieu du noir des piliers built-in.
            document.getElementById("kta-lc-add-line-on").checked = false;
            borderWrap.style.display = "block";   // 🎨 v1.76.1 bordure optionnelle
          }
        }
      }
    }
    catSel.addEventListener("change", _majChamps);
    // Re-render quand l'user change la géométrie d'une structure
    wrap.querySelectorAll('input[name="kta-lc-add-geom"]').forEach(function(r) {
      r.addEventListener("change", _majChamps);
    });
    _majChamps();

    document.getElementById("kta-lc-add-ok").addEventListener("click", function() {
      const cat   = catSel.value;
      const label = (document.getElementById("kta-lc-add-label").value || "").trim();
      if (!label) { alert(window.I18n.t("legend.add.errNoLabel")); return; }
      const entry = { category: cat, label: label };
      // Mode « lier un type existant » : l'id EST le type des objets déjà
      // dessinés — c'est toute la liaison (addCustomEntry accepte entry.id).
      if (prefill && prefill.id) entry.id = prefill.id;

      // 🆕 v1.16.0 step2-drawable : géométrie. Pour structures = choix user,
      // sinon implicite via category.
      if (cat === "structures") {
        entry.geometry = _getStructGeometry();
      } else if (cat === "traces") {
        entry.geometry = "polyline";
      } else if (cat === "zones") {
        entry.geometry = "polygon";
      } else {
        entry.geometry = "marker";
      }

      if (cat === "icones") {
        const url = (document.getElementById("kta-lc-add-icon").value || "").trim();
        if (!url) { alert(window.I18n.t("legend.add.errIconUrl")); return; }
        entry.iconUrl = url;
      } else {
        const lineOn = document.getElementById("kta-lc-add-line-on").checked;
        const fillOn = document.getElementById("kta-lc-add-fill-on").checked;
        if (lineOn) entry.lineColor = document.getElementById("kta-lc-add-line").value;
        if (fillOn) {
          entry.fillColor = document.getElementById("kta-lc-add-fill").value;
          // 🎨 v1.76.1 — bordure EXPLICITE si cochée ; sinon comportement
          // historique (bordure = fond).
          const bordOn = document.getElementById("kta-lc-add-border-on").checked;
          if (bordOn && (cat === "zones" || (cat === "structures" && entry.geometry === "polygon"))) {
            entry.borderColor = document.getElementById("kta-lc-add-border").value;
          } else if ((cat === "zones" || (cat === "structures" && entry.geometry === "polygon")) && !lineOn) {
            // Polygones : bordure par défaut = même couleur que fill
            entry.borderColor = entry.fillColor;
          }
        }
        // Pour les structures polyline (front), lineColor est obligatoire.
        // Pour les polygones, fillColor est obligatoire.
        if (entry.geometry === "polyline" && !entry.lineColor) {
          alert(window.I18n.t("legend.add.errPolyline"));
          return;
        }
        if (entry.geometry === "polygon" && !entry.fillColor) {
          alert(window.I18n.t("legend.add.errPolygon"));
          return;
        }
        if (!entry.lineColor && !entry.fillColor) {
          alert(window.I18n.t("legend.add.errNoColor"));
          return;
        }
      }
      const newId = addCustomEntry(entry);
      fermerAdd();
      // L'id sert au flyout ➕ Nouveau type (interface.js) : il sélectionne le
      // type créé et arme l'outil. Les autres appelants l'ignorent.
      if (typeof onAdded === "function") onAdded(newId);
    });
  }

  // ─────────────────────────────────────────────
  // API publique
  // ─────────────────────────────────────────────
  return {
    SCHEMA_VERSION:        SCHEMA_VERSION,
    DEFAULT_LABELS:        DEFAULT_LABELS,
    // DEFAULT_RENDERS retiré en v1.76.0 : le rendu par défaut d'une entrée
    // built-in se demande à `window.ktaResolveStyle` (aucun consommateur
    // externe ne lisait cette table — vérifié par grep sur js/).
    CATEGORIES:            CATEGORIES,

    // Hooks de cycle de vie
    loadSessionState:      loadSessionState,
    getSessionState:       getSessionState,
    isSessionStateEmpty:   isSessionStateEmpty,
    loadPlanState:         loadPlanState,

    // Resolvers (cascade)
    getLabel:              getLabel,
    isVisible:             isVisible,
    getSource:             getSource,
    getDefaultLabel:       getDefaultLabel,
    // 🎨 v1.76.0 — override de couleur des types built-in.
    // `getColor` est appelée par window.ktaResolveStyle : lecture PURE,
    // ne jamais y rappeler le résolveur (réentrance).
    getColor:              getColor,
    hasColorOverride:      hasColorOverride,
    // 🎨 v1.76.1 — bordure indépendante (getBorderColor est appelée par
    // window.ktaResolveStyle : lecture PURE, jamais de rappel au résolveur).
    getBorderColor:        getBorderColor,
    setBorderColor:        setBorderColor,
    listEntries:           listEntries,
    listCustomEntries:     listCustomEntries,
    isCustomVisible:       isCustomVisible,

    // Setters session
    setSessionLabel:       setSessionLabel,
    setSessionVisibility:  setSessionVisibility,
    setColor:              setColor,
    setCustomEntryVisibility: setCustomEntryVisibility,
    addCustomEntry:        addCustomEntry,
    removeCustomEntry:     removeCustomEntry,
    updateCustomEntry:     updateCustomEntry,
    resetSession:          resetSession,
    findCustomEntry:       findCustomEntry,
    countUsages:           countUsages,
    // 🧹 v1.76.0 (F19) — dialog « ajouter une entrée » exposée : exporter.js
    // en avait un clone intégral, supprimé au profit de cette API.
    ouvrirAddDialog:       _ouvrirAddDialog,
    // 🐛 v1.76.1 (annexe 6) — pour le swap du Générateur uniquement.
    suspendPersist:        suspendPersist,
    // 🧹 v1.76.0 (F23) — diagnostic des types orphelins, lu par ≡ Légende.
    listOrphanTypes:       listOrphanTypes,

    // Hook listener (sidebar dynamique, invalidation styles, etc.)
    onCustomEntriesChange: onCustomEntriesChange,

    // UI helpers
    categoryTitle:         categoryTitle,
    listCategories:        listCategories,

    // Éditeur standalone (modale dédiée — utilisée depuis la fenêtre
    // Légende en mode carte, mais réutilisable de n'importe quel endroit
    // de l'UI). opts = { onChange, onClose }
    ouvrirEditeur:         ouvrirEditeur
  };
})();
