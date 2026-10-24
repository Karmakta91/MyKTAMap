/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// LegendCustomization — personnalisation de la légende (libellés, visibilité, couleurs, entrées custom)
// =========================
// Cascade : session (overrides de l'utilisateur, SessionPersist, propre au plan) > plan
// (PLAN_CONFIG.plan.customLegend, auteur du plan) > défaut (DEFAULT_LABELS). Visibilité :
// true / false explicites, undefined = suivre le niveau supérieur.
// Expose window.LegendCustomization : getLabel, isVisible, getSource, getColor/getBorderColor, listEntries,
//   listCustomEntries, findCustomEntry, setSession*, add/update/removeCustomEntry, countUsages,
//   listOrphanTypes, resetSession, onCustomEntriesChange, ouvrirEditeur, ouvrirAddDialog ;
//   hooks loadSessionState / getSessionState (SessionPersist), loadPlanState (main.js après PLAN_CONFIG),
//   lireAvecEtats (lecture d'une légende d'un plan non chargé).
// Catégories : icones · traces · zones · structures.
// ⚠️ Format (session ET plan) : { labels: {"<cat>.<key>": str}, hidden: {"<cat>.<key>": bool},
//   colors, borders, removedPlan, customEntries: [{ id, category, label, geometry, lineColor?, fillColor?,
//   borderColor?, iconUrl? }] }. Changement de structure → bumper SCHEMA_VERSION.
// 🩸 getColor / getBorderColor sont appelées par window.ktaResolveStyle : lecture PURE, jamais de rappel
//   au résolveur (réentrance).
// Garde-fous : scripts/check-icon-catalog.js (DEFAULT_LABELS.icones), scripts/check-style-canon.js

window.LegendCustomization = (function() {
  "use strict";

  const SCHEMA_VERSION = 1;

  // ── Libellés par défaut (synchro exporter.js > _dessinerLegende) ──────────
  const DEFAULT_LABELS = {
    icones: {
      salle: "Salle", pa: "Puits Aération", pc: "Puits Comblé",
      pb: "Puits Bouché", pe: "Puits au sol / Bassin", ps: "Puits extraction",
      psf: "Puits extraction fermé",
      peo: "Puits à échelon ouvert", pef: "Puits à échelon fermé",
      eso: "Escalier service ouvert", esf: "Escalier service fermé",
      cao: "Cavage ouvert", caf: "Cavage fermé",
      passage: "Passage", chatiere: "Chatière", vehicule: "Véhicule",
      danger: "Danger", info: "Information", elec: "Électricité", epure: "Épure",
      plaque: "Plaque indication",
      portail: "Portail (liaison inter-plan)",
      // 🩸 Les trois tags ci-dessous doivent être ici : dès que la légende passe par getLabel (LC
      // toujours présent), une clé absente s'affiche brute (« entree_plan »). LEGENDE_LABELS
      // d'interfaceLegende.js n'est lu que SANS LC.
      entree_plan: "Point d'entrée du plan",    // D
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

  // 🩸 Pas de table de rendu locale : une table des pastilles indépendante du rendu carte ferait mentir
  // la légende le jour où l'une bouge. Le rendu par défaut d'une entrée BUILT-IN se dérive du style réel
  // (js/styleResolver.js) : ligne (tracé, front) → `lineColor` ; polygone (zone, pilier, mur) →
  // `fillColor` + `borderColor` — la même normalisation que les entrées CUSTOM (cf addCustomEntry).
  // `{ flat: true }` : une pastille ne sait pas peindre un motif SVG.
  function _renduDefaut(category, key) {
    if (typeof window.ktaResolveStyle !== "function") return {};
    const s = window.ktaResolveStyle(category, key, { flat: true });
    if (!s) return {};
    // Ligne : le canon donne un `fillColor` aux fronts (d'autres le lisent), on ne le propage PAS —
    // la pastille afficherait un polygone pour un tracé.
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

  // ── États session + plan ──────────
  // `borders` : bordure choisie pour un type built-in polygone, map séparée de `colors` (pas d'objet
  // {fond, bordure}) : une session qui n'a que `colors` reste valide sans migration. Absente → bordure
  // dérivée (zones) ou noire (structures).
  // `removedPlan` : pierres tombales des entrées du PLAN supprimées par l'utilisateur (sinon une entrée
  // embarquée dans un ZIP régénéré revient à chaque chargement). Locale à la session de ce plan sur cet
  // appareil : ne voyage pas dans les exports (comme un masquage).
  function _emptyState() {
    return { labels: {}, hidden: {}, colors: {}, borders: {}, customEntries: [], removedPlan: [] };
  }

  let _sessionState = _emptyState();
  let _planState    = _emptyState();

  // `colors` : couleur choisie pour un type BUILT-IN, clé "<catégorie>.<type>" comme `labels`/`hidden`.
  // UNE couleur par type (application selon la géométrie : styleResolver.js > _appliquerOverride).
  // Les types CUSTOM portent leurs couleurs dans l'entrée.
  // 🩸 `hidden` circule sous DEUX formes : objet ({ "traces.principal": true }) et TABLEAU de clés
  // (createConf teste Array.isArray(cl.hidden)). Un tableau passe `typeof === "object"` mais tous les
  // `hidden[k]` rendent undefined en silence → on MIGRE le tableau en objet au chargement.
  function _hiddenEnObjet(h) {
    if (Array.isArray(h)) {
      const o = {};
      h.forEach(function(k) { if (typeof k === "string" && k) o[k] = true; });
      return o;
    }
    return (h && typeof h === "object") ? h : {};
  }

  function _normalize(state) {
    // 🩸 `state` peut venir d'un localStorage corrompu, d'un plan-config forgé ou d'un calque malformé :
    // UNE entrée `null` dans customEntries fait planter listCustomEntries → plus de légende NI de sidebar.
    const s = (state && typeof state === "object") ? state : {};
    // 🔒 Libellés, couleurs et icônes finissent dans du HTML (pastilles, légende, filtres) : un plan ou
    // une session partagés ne sont pas crus sur parole.
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
        // Au minimum un id sûr (il sert de clé et d'attribut).
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
    // 🩸 Les producteurs (createConf, kmzImport, gpxImport) écrivent `plan.customLegend` (sous-objet) :
    // lire seulement `PLAN_CONFIG.customLegend` (racine) laisse _planState toujours vide et la légende du
    // Générateur jamais appliquée. On lit les DEUX formes (racine en priorité, fichiers édités à la main).
    _planState = _normalize(
      (config && config.customLegend) ||
      (config && config.plan && config.plan.customLegend)
    );
  }

  // Légende d'un AUTRE plan que celui chargé (légende en lecture seule de la carte OSM de l'accueil) : ses deux
  // états remplacent l'état live le temps de `fn`, pour que getLabel, isVisible, getColor (donc ktaResolveStyle)
  // et les entrées `cust-…` répondent pour CE plan. Restauration garantie (finally).
  // ⚠️ `fn` est SYNCHRONE et ne fait que lire : l'état réel revient dès son retour ; la persistance est
  // suspendue pendant l'appel pour qu'une écriture accidentelle ne parte pas dans la session du plan chargé.
  function lireAvecEtats(session, plan, fn) {
    const s0 = _sessionState, p0 = _planState, susp0 = _persistSuspendu;
    _sessionState = _normalize(session);
    _planState    = _normalize(plan);
    _persistSuspendu = true;
    try { return fn(); }
    finally { _sessionState = s0; _planState = p0; _persistSuspendu = susp0; }
  }

  // ── Résolveurs (cascade) ──────────
  function _key(category, key) {
    return category + "." + key;
  }

  function getDefaultLabel(category, key) {
    // i18n au RUNTIME (« legend.label.<cat>.<key> »), repli sur DEFAULT_LABELS (FR), source de vérité des
    // clés built-in — non traduisible au load (I18n pas garanti chargé).
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
    // Session prioritaire (true = caché, false = affiché explicite, undefined = niveau suivant).
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

  // Couleur d'un type BUILT-IN : session > plan > null (le style canonique s'applique).
  // ⚠️ Lecture PURE : appelée par `ktaResolveStyle`, lui-même appelé ici (`_renduDefaut`).
  function getColor(category, key) {
    const k = _key(category, key);
    const s = _sessionState.colors[k];
    if (typeof s === "string" && s) return s;
    const p = _planState.colors[k];
    if (typeof p === "string" && p) return p;
    return null;
  }

  function setColor(category, key, color) {
    const k = _key(category, key);
    if (!color) delete _sessionState.colors[k];
    else _sessionState.colors[k] = String(color);
    _persistSession();
    _repeindreCarte();
  }

  // Repeint après un changement de couleur : sinon les objets Leaflet déjà dessinés gardent l'ancienne
  // jusqu'au prochain rendu. onCustomEntriesChange ne suffit PAS (son abonné, interface.js, ne rafraîchit
  // que la sidebar). Les calques de données sont repeints aussi (window._ktaRestyleDataLayers, utils.js).
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

  // Bordure indépendante du remplissage (décision produit). Même cascade que getColor ; null → bordure
  // dérivée (zones) ou noire (structures).
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

  // ── Liste des entrées (cascade appliquée) ──────────
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
        // N'afficher « remettre la couleur d'origine » que s'il a un sens.
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
    // Entrées custom des 2 niveaux, DÉDUPLIQUÉES par id, session prioritaire : les ids
    // `cust-<ts36>-<rnd36>` ne sont pas structurellement uniques (plan régénéré depuis la session) et
    // un doublon donnerait deux lignes de légende et deux boutons. Même règle que findCustomEntry.
    // Ordre : plan puis session ; un doublon remplace la ligne du plan à sa place.
    const sessionParId = new Map();
    _sessionState.customEntries.forEach(function(e) {
      if (!category || e.category === category) sessionParId.set(e.id, e);
    });
    const out = [];
    const emis = new Set();
    _planState.customEntries.forEach(function(e) {
      if (category && e.category !== category) return;
      if (emis.has(e.id)) return;
      if (_sessionState.removedPlan.indexOf(e.id) >= 0) return;   // supprimée ; même id deux fois dans le plan = 1 ligne
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
    // Clé "custom.<id>" dans hidden : masquer une entrée du plan sans la supprimer.
    const k = "custom." + id;
    if (_sessionState.hidden[k] === true)  return false;
    if (_sessionState.hidden[k] === false) return true;
    if (_planState.hidden[k]    === true)  return false;
    return true;
  }

  // ── Setters (session uniquement ; le plan s'édite dans createConf) ──────────
  // 🩸 Le Générateur édite la légende du PLAN en la « swappant » dans _sessionState : sans suspension de
  // la persistance, elle s'écrirait dans la session du plan courant (entrées cust-… fantômes).
  let _persistSuspendu = false;
  function suspendPersist(on) { _persistSuspendu = !!on; }

  function _persistSession() {
    if (_persistSuspendu) return;
    // Sans SessionPersist : no-op (prochaine sauvegarde automatique).
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
      // Champ vide OU égal au libellé hérité → on retire l'override.
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
    return "cust-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  // ── Écouteurs de mutation des customs ──────────
  // Usage : const unsubscribe = LegendCustomization.onCustomEntriesChange(fn); … unsubscribe();
  // (sidebar dynamique d'interface.js, invalidation de caches de style).
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

  // Nombre d'objets d'un type, pour prévenir AVANT suppression : les objets d'un type supprimé basculent
  // en repli (blanc, gris, bleu ; un FRONT custom se referme en polygone), sans retour arrière. Session
  // ET calques de données (non modifiables : orphelins pour de bon).
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

  // Types orphelins : objets dont le type n'existe dans AUCUNE légende (cause des objets blancs/gris sans
  // ligne de légende) ; ≡ Légende affiche un avertissement. → [{ type, categorie, nb }].
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
          // 🩸 Orphelin = tout type NON built-in de sa catégorie sans entrée de légende, quel que soit son
          // nom : filtrer sur `cust-` laisserait invisibles les types bruts (« Bas »).
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

  function findCustomEntry(id) {
    if (!id) return null;
    const fromSession = _sessionState.customEntries.find(function(e) { return e.id === id; });
    if (fromSession) return Object.assign({}, fromSession, { source: "session" });
    if (_sessionState.removedPlan.indexOf(id) >= 0) return null;   // supprimée par l'utilisateur
    const fromPlan = _planState.customEntries.find(function(e) { return e.id === id; });
    if (fromPlan) return Object.assign({}, fromPlan, { source: "plan" });
    return null;
  }

  // Géométrie d'une entrée custom (pour qu'elle soit DESSINABLE) : traces → "polyline", zones →
  // "polygon", structures → choix à la création (front = polyline, pilier/mur = polygon),
  // icones → "marker". Déduite si absente.
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
    // Un id EXPLICITE déjà en session (double clic sur le bandeau orphelins, re-liaison) REMPLACE l'entrée.
    if (entry.id) {
      const dejaIdx = _sessionState.customEntries.findIndex(function(e) { return e.id === id; });
      if (dejaIdx >= 0) _sessionState.customEntries.splice(dejaIdx, 1);
    }
    const geom = _defaultGeometry(entry.category, entry.geometry);
    // Couleurs NORMALISÉES selon la géométrie (sinon un polygone avec lineColor s'affiche aussi en trait) :
    // polyline → lineColor seul · polygon → fillColor + borderColor · marker → iconUrl.
    let lineColor   = entry.lineColor   || null;
    let fillColor   = entry.fillColor   || null;
    let borderColor = entry.borderColor || null;
    if (geom === "polyline") {
      fillColor   = null;
      borderColor = null;
    } else if (geom === "polygon") {
      // lineColor sans borderColor → promu en bordure, puis retiré (sinon trait fantôme dans la pastille).
      if (!borderColor && lineColor) borderColor = lineColor;
      if (!borderColor && fillColor) borderColor = fillColor;
      lineColor = null;
    }
    const clean = {
      id:          id,
      category:    entry.category,
      // Déduite de category si absente.
      geometry:    geom,
      label:       String(entry.label || "").trim() || ((window.I18n && window.I18n.t) ? window.I18n.t("legend.entry.unnamed") : "Sans nom"),
      lineColor:   lineColor,
      fillColor:   fillColor,
      borderColor: borderColor,
      iconUrl:     entry.iconUrl     || null
    };
    _sessionState.customEntries.push(clean);
    _persistSession();
    _fireCustomChange();
    // 🩸 Repeindre aussi à l'AJOUT : un objet déjà dessiné du type ajouté doit se lier tout de suite,
    // quel que soit le chemin d'UI (bandeau ⚠️ ou Modifier → ➕).
    _repeindreCarte();
    return id;
  }

  function removeCustomEntry(id) {
    let touche = false;
    const idx = _sessionState.customEntries.findIndex(function(e) { return e.id === id; });
    if (idx >= 0) { _sessionState.customEntries.splice(idx, 1); touche = true; }
    // Entrée présente (aussi) au niveau PLAN : la retirer de la session ne suffit pas, elle reviendrait du
    // plan-config. Pierre tombale en session : filtrée partout (liste, findCustomEntry). resetSession ou
    // réimport de la légende la font revenir (voulu).
    const dansPlan = _planState.customEntries.some(function(e) { return e.id === id; });
    if (dansPlan && _sessionState.removedPlan.indexOf(id) < 0) {
      _sessionState.removedPlan.push(id);
      touche = true;
    }
    if (touche) {
      _persistSession();
      _fireCustomChange();
      // Les objets du type supprimé basculent en repli tout de suite.
      _repeindreCarte();
      return true;
    }
    const planEntry = _planState.customEntries.find(function(e) { return e.id === id; });
    if (planEntry) {
      setCustomEntryVisibility(id, false);
      _fireCustomChange();
      return true;
    }
    return false;
  }

  // 🩸 Les entrées d'un plan IMPORTÉ vivent dans `_planState` (l'import SIG y range celles par niveau) :
  // chercher seulement en session rend chaque renommage/recoloration muet. Une entrée du plan est donc
  // PROMUE en session, patch appliqué (la session gagne à id égal, règle de listCustomEntries et
  // findCustomEntry) ; source « session ». resetSession rend l'originale.
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
    _repeindreCarte();
    return true;
  }

  function resetSession() {
    _sessionState = _emptyState();
    _persistSession();
    _fireCustomChange();
    // Repeindre : sinon les objets déjà dessinés gardent les couleurs override jusqu'au redémarrage.
    _repeindreCarte();
  }

  // ── Helpers pour exporter.js ──────────
  function categoryTitle(category) {
    const i18nKey = "legend.cat." + category;
    if (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(i18nKey)) {
      return window.I18n.t(i18nKey);
    }
    return CATEGORY_TITLES[category] || category;
  }

  function listCategories() {
    return CATEGORIES.slice();
  }

  // ── Éditeur autonome (modale) ──────────
  // Même panneau que la modale Export PNG, ouvrable de partout (« ✏️ Modifier » de la Légende).
  // Les setters persistent via _persistSession. opts = { onChange, onClose }.
  function ouvrirEditeur(opts) {
    opts = opts || {};

    const existing = document.getElementById("kta-legend-editor-modal");
    if (existing) { existing.remove(); if (opts.onClose) opts.onClose(); return; }

    function _esc(s) { return window.ktaEsc(s); }

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
          // La case ne masque RIEN sur la carte, seulement dans la BOÎTE de légende ; le masquage carte vit
          // dans 🔍 Filtres (deux contrôles concurrents sinon). On l'explique au lieu de la changer.
          '<p style="font-size:12px; color:var(--kta-texte-3); margin:0 0 12px 0; line-height:1.5;">' +
            window.I18n.t("legend.editor.hintVisibilite") +
          '</p>' +
          '<div id="kta-legend-editor-list"></div>' +
        '</div>' +
        '<div style="padding:12px 16px; border-top:1px solid var(--kta-bordure); display:flex; gap:8px; flex-wrap:wrap; justify-content:space-between;">' +
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
      // _iconePourTag vient d'exporter.js, peut-être pas chargé.
      let iconUrl = e.iconUrl;
      if (!iconUrl && e.category === "icones" && typeof window._iconePourTag === "function") {
        try { iconUrl = window._iconePourTag(e.key); } catch(err) { iconUrl = null; }
      } else if (!iconUrl && e.category === "icones") {
        const cfg = window.PLAN_CONFIG;
        if (cfg && cfg.icons && cfg.icons[e.key]) iconUrl = cfg.icons[e.key];
        else if (window._iconMap && window._iconMap[e.key]) {
          const iobj = window._iconMap[e.key];
          iconUrl = iobj._kta_iconUrl || (iobj.options && iobj.options.iconUrl) || null;
        }
      }

      // La GÉOMÉTRIE décide de la pastille (pas « lineColor d'abord ») : un polygone avec lineColor
      // stocké par accident ne s'affiche pas en trait.
      let swatch = '';
      if (iconUrl) {
        swatch = '<img src="' + _esc(iconUrl) + '" alt="" style="width:16px;height:16px;object-fit:contain;flex:0 0 16px;">';
      } else if (e.geometry === "polyline" || (!e.geometry && e.lineColor && !e.fillColor)) {
        const col = e.lineColor || e.fillColor || "#888";
        swatch = '<span style="display:inline-block;width:16px;height:3px;background:' + _esc(col) + ';flex:0 0 16px;border-radius:1px;"></span>';
      } else if (e.geometry === "polygon" || e.fillColor) {
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

      // Sélecteurs de couleur pour les types dessinables, BUILT-IN comme CUSTOM (mêmes carrés, à chaud).
      // Les ICÔNES (images) gardent la pastille statique. La couleur affichée vient de `listEntries`,
      // donc du style RÉEL (override compris).
      const estColorable = e.category !== "icones";
      let champCouleur = "";
      if (estColorable) {
        // Polygone : fond + bordure ; ligne : un seul carré. Built-in : géométrie lue au style résolu ;
        // custom : géométrie DÉCLARÉE (plus fiable que la présence d'un champ couleur).
        const estPolygone = isCustomEntry ? (e.geometry === "polygon") : !!e.fillColor;
        const curFond = estPolygone ? (e.fillColor || "#888888") : (e.lineColor || "#888888");
        champCouleur =
          '<input type="color" class="kta-legend-color" value="' + _esc(curFond) + '" ' +
            'title="' + window.I18n.t("legend.editor.colorTitle") + '" ' + dataAttrs + '>' +
          (estPolygone
            ? '<input type="color" class="kta-legend-border" value="' + _esc(e.borderColor || (isCustomEntry ? curFond : "#000000")) + '" ' +
                'title="' + window.I18n.t("legend.editor.borderTitle") + '" ' + dataAttrs + '>'
            : '') +
          // ↺ pour un built-in seulement : un custom n'a pas de couleur « d'origine ».
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
        // Custom routé par son id, sur sa géométrie déclarée ; updateCustomEntry persiste ET repeint.
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

    // Insertion ciblée du ↺ après un changement de couleur (pas de _render, cf handler change).
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
        // 🩸 Couleur appliquée sur `change`, PAS sur `input` : WebKit émet un `input` à chaque mouvement du
        // curseur, on écrirait la session des dizaines de fois par glissement.
        if (e.target.matches(".kta-legend-color") || e.target.matches(".kta-legend-border")) {
          _applyFromUI(e.target);
          // 🩸 JAMAIS _render() ici : sur desktop le sélecteur natif reste OUVERT après `change` ; le
          // re-render détruit l'input qu'il tient → les choix suivants partent dans un élément DÉTACHÉ.
          // Le ↺ s'insère de façon ciblée.
          _majBoutonReset(e.target);
        }
      });
      body.addEventListener("input", function(e) {
        if (e.target.matches(".kta-legend-label")) _applyFromUI(e.target);
      });
      body.addEventListener("click", async function(e) {
        if (e.target.matches(".kta-legend-rm")) {
          const id = e.target.getAttribute("data-custom-id");
          if (id) {
            // On prévient AVANT, avec le décompte réel : les objets deviennent orphelins, sans retour.
            const u = countUsages(id);
            if (u.total > 0) {
              const ent = findCustomEntry(id);
              const msg = window.I18n.t("legend.editor.rmUsedConfirm", {
                nom:      window.ktaEsc((ent && ent.label) || id),
                total:    u.total,
                calques:  u.calques
              });
              if (!(await window.ktaConfirm(msg, { zIndex: 100100 }))) return;   // au-dessus de l'éditeur (100050)
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
            setBorderColor(c, k, null);  // ↺ remet AUSSI la bordure
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

    document.getElementById("kta-legend-editor-reset").addEventListener("click", async function() {
      const ok = await window.ktaConfirm(window.I18n.t("legend.editor.resetConfirm"), { zIndex: 100100 });
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

  // Mini-modale « Ajouter une entrée custom » (autonome, hors Export PNG).
  // `prefill` { id, category, label } : « lier un type existant » (bandeau orphelins de ≡ Légende) —
  // l'entrée porte l'ID EXACT du type déjà dans les données (`Bas`, `cust-perdu`…), sinon elle ne se
  // lierait jamais. Catégorie verrouillée, id jamais montré ni saisi.
  // `prefill` sans id : création ordinaire, catégorie verrouillée (flyout ➕ Nouveau type) ;
  // `prefill.titre` remplace le titre. `onAdded(id)` reçoit l'id créé.
  function _ouvrirAddDialog(onAdded, prefill) {
    const wrap = document.createElement("div");
    wrap.className = "kta-readme-modal-overlay";
    wrap.style.zIndex = "100100";  // au-dessus de l'éditeur (100050)
    wrap.innerHTML =
      '<div class="kta-readme-modal-boite" style="width:auto; max-width:420px; height:auto; max-height:90vh; padding:20px; overflow-y:auto;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:8px;">' +
          '<h3 style="margin:0; font-size:16px; color:var(--kta-texte);">' +
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
        // STRUCTURES seulement : géométrie polyline (front de taille) ou polygon (pilier/mur) ;
        // implicite ailleurs (traces = polyline, zones = polygon).
        '<div style="margin-bottom:10px; display:none;" id="kta-lc-add-geom-wrap">' +
          '<label class="kta-cfg-label">' + window.I18n.t("legend.add.structType") + '</label>' +
          '<div style="display:flex; gap:6px;">' +
            '<label class="kta-export-radio-row" style="flex:1;">' +
              '<input type="radio" name="kta-lc-add-geom" value="polygon" checked>' +
              '<span>' + window.I18n.t("legend.add.polygon") + ' <span style="color:var(--kta-texte-3); font-size:11px;">' + window.I18n.t("legend.add.polygonHint") + '</span></span>' +
            '</label>' +
            '<label class="kta-export-radio-row" style="flex:1;">' +
              '<input type="radio" name="kta-lc-add-geom" value="polyline">' +
              '<span>' + window.I18n.t("legend.add.polyline") + ' <span style="color:var(--kta-texte-3); font-size:11px;">' + window.I18n.t("legend.add.polylineHint") + '</span></span>' +
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
        // Bordure INDÉPENDANTE du remplissage (zones + piliers/mur) ; décochée = bordure = fond.
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
          // 🩸 DÉCOCHER le trait, pas seulement le masquer : la case est `checked` dans le HTML, `lineColor`
          // prendrait le défaut du picker caché (#00ff00), promu en bordure → contour vert fluo imposé.
          document.getElementById("kta-lc-add-line-on").checked = false;
          borderWrap.style.display = "block";   // bordure optionnelle
        } else {
          // Structures : sélecteur de géométrie ; en polygone, pas de champ « trait » (ignoré de toute
          // façon par le résolveur et addCustomEntry).
          geomWrap.style.display = "block";
          const geom = _getStructGeometry();
          if (geom === "polyline") {
            lineWrap.style.display = "block";
            fillWrap.style.display = "none";
            borderWrap.style.display = "none";
            document.getElementById("kta-lc-add-line-on").checked = true;
          } else {
            // Pilier/mur : remplissage obligatoire ; bordure = remplissage par défaut au rendu.
            lineWrap.style.display = "none";
            fillWrap.style.display = "block";
            document.getElementById("kta-lc-add-fill-on").checked = true;
            // Même piège que les zones : sans décochage, bordure vert fluo au lieu du noir des piliers.
            document.getElementById("kta-lc-add-line-on").checked = false;
            borderWrap.style.display = "block";   // bordure optionnelle
          }
        }
      }
    }
    catSel.addEventListener("change", _majChamps);
    wrap.querySelectorAll('input[name="kta-lc-add-geom"]').forEach(function(r) {
      r.addEventListener("change", _majChamps);
    });
    _majChamps();

    document.getElementById("kta-lc-add-ok").addEventListener("click", function() {
      const cat   = catSel.value;
      const label = (document.getElementById("kta-lc-add-label").value || "").trim();
      if (!label) { window.ktaAlerte(window.I18n.t("legend.add.errNoLabel"), { zIndex: 100150 }); return; }
      const entry = { category: cat, label: label };
      // « Lier un type existant » : l'id EST le type des objets déjà dessinés.
      if (prefill && prefill.id) entry.id = prefill.id;

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
        if (!url) { window.ktaAlerte(window.I18n.t("legend.add.errIconUrl"), { zIndex: 100150 }); return; }
        entry.iconUrl = url;
      } else {
        const lineOn = document.getElementById("kta-lc-add-line-on").checked;
        const fillOn = document.getElementById("kta-lc-add-fill-on").checked;
        if (lineOn) entry.lineColor = document.getElementById("kta-lc-add-line").value;
        if (fillOn) {
          entry.fillColor = document.getElementById("kta-lc-add-fill").value;
          // Bordure explicite si cochée, sinon bordure = fond.
          const bordOn = document.getElementById("kta-lc-add-border-on").checked;
          if (bordOn && (cat === "zones" || (cat === "structures" && entry.geometry === "polygon"))) {
            entry.borderColor = document.getElementById("kta-lc-add-border").value;
          } else if ((cat === "zones" || (cat === "structures" && entry.geometry === "polygon")) && !lineOn) {
            entry.borderColor = entry.fillColor;
          }
        }
        if (entry.geometry === "polyline" && !entry.lineColor) {
          window.ktaAlerte(window.I18n.t("legend.add.errPolyline"), { zIndex: 100150 });
          return;
        }
        if (entry.geometry === "polygon" && !entry.fillColor) {
          window.ktaAlerte(window.I18n.t("legend.add.errPolygon"), { zIndex: 100150 });
          return;
        }
        if (!entry.lineColor && !entry.fillColor) {
          window.ktaAlerte(window.I18n.t("legend.add.errNoColor"), { zIndex: 100150 });
          return;
        }
      }
      const newId = addCustomEntry(entry);
      fermerAdd();
      // L'id sert au flyout ➕ Nouveau type (interface.js), qui sélectionne le type et arme l'outil.
      if (typeof onAdded === "function") onAdded(newId);
    });
  }

  // ── API publique ──────────
  return {
    SCHEMA_VERSION:        SCHEMA_VERSION,
    DEFAULT_LABELS:        DEFAULT_LABELS,
    // Pas de DEFAULT_RENDERS : le rendu par défaut se demande à window.ktaResolveStyle.
    CATEGORIES:            CATEGORIES,

    loadSessionState:      loadSessionState,
    getSessionState:       getSessionState,
    isSessionStateEmpty:   isSessionStateEmpty,
    loadPlanState:         loadPlanState,
    // Lecture seule d'une légende d'un plan non chargé (carte OSM de l'accueil).
    lireAvecEtats:         lireAvecEtats,

    getLabel:              getLabel,
    isVisible:             isVisible,
    getSource:             getSource,
    getDefaultLabel:       getDefaultLabel,
    // getColor / getBorderColor : lecture PURE (appelées par ktaResolveStyle).
    getColor:              getColor,
    hasColorOverride:      hasColorOverride,
    getBorderColor:        getBorderColor,
    setBorderColor:        setBorderColor,
    listEntries:           listEntries,
    listCustomEntries:     listCustomEntries,
    isCustomVisible:       isCustomVisible,

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
    // Dialog partagée (exporter.js l'utilise, pas de clone).
    ouvrirAddDialog:       _ouvrirAddDialog,
    // Swap du Générateur uniquement.
    suspendPersist:        suspendPersist,
    // Types orphelins, lu par ≡ Légende.
    listOrphanTypes:       listOrphanTypes,

    onCustomEntriesChange: onCustomEntriesChange,

    categoryTitle:         categoryTitle,
    listCategories:        listCategories,

    ouvrirEditeur:         ouvrirEditeur
  };
})();
