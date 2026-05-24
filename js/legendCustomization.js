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
      plaque: "Plaque indication"
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

  // Rendus défaut (couleurs/icônes) pour les entrées non-icones.
  // Pour icones, le rendu vient de _iconePourTag dans exporter.js.
  const DEFAULT_RENDERS = {
    traces: {
      principal:  { lineColor: "#00ff00" },
      secondaire: { lineColor: "#b000ff" },
      chemin:     { lineColor: "#ffff00" },
      jonction:   { lineColor: "#ff4ecb" }
    },
    zones: {
      eau:          { fillColor: "#3aa9e8", borderColor: "#0066aa" },
      remblais:     { fillColor: "#5a5a68", borderColor: "#3a3a44" },
      effondrement: { fillColor: "#ff3333", borderColor: "#cc0000" },
      inaccessible: { fillColor: "#7a0000", borderColor: "#5a0a0a" }
    },
    structures: {
      "pilier-1":  { fillColor: "#f4c542", borderColor: "#000000" },
      "pilier-2":  { fillColor: "#ff9933", borderColor: "#000000" },
      "mur":       { fillColor: "#1e3a8a", borderColor: "#000000" },
      "front-1":   { lineColor:  "#f4c542" },
      "front-2":   { lineColor:  "#ff9933" }
    }
  };

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
  function _emptyState() {
    return { labels: {}, hidden: {}, customEntries: [] };
  }

  let _sessionState = _emptyState();
  let _planState    = _emptyState();

  function _normalize(state) {
    const s = state || {};
    return {
      labels:        (s.labels && typeof s.labels === "object") ? s.labels : {},
      hidden:        (s.hidden && typeof s.hidden === "object") ? s.hidden : {},
      customEntries: Array.isArray(s.customEntries) ? s.customEntries.slice() : []
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
      customEntries: _sessionState.customEntries.map(function(e) { return Object.assign({}, e); })
    };
  }

  function isSessionStateEmpty() {
    return Object.keys(_sessionState.labels).length === 0
        && Object.keys(_sessionState.hidden).length === 0
        && _sessionState.customEntries.length === 0;
  }

  function loadPlanState() {
    const config = window.PLAN_CONFIG;
    _planState = _normalize(config && config.customLegend);
  }

  // ─────────────────────────────────────────────
  // Cascade resolvers
  // ─────────────────────────────────────────────
  function _key(category, key) {
    return category + "." + key;
  }

  function getDefaultLabel(category, key) {
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

  // ─────────────────────────────────────────────
  // Liste des entrées (cascade appliquée)
  // ─────────────────────────────────────────────
  function listEntries(category) {
    const out = [];
    Object.keys(DEFAULT_LABELS[category] || {}).forEach(function(key) {
      const r = (DEFAULT_RENDERS[category] && DEFAULT_RENDERS[category][key]) || {};
      out.push({
        category:     category,
        key:          key,
        label:        getLabel(category, key),
        defaultLabel: getDefaultLabel(category, key),
        planLabel:    _planState.labels[_key(category, key)] || null,
        visible:      isVisible(category, key),
        source:       getSource(category, key),
        lineColor:    r.lineColor,
        fillColor:    r.fillColor,
        borderColor:  r.borderColor,
        isCustom:     false
      });
    });
    return out;
  }

  function listCustomEntries(category) {
    // Custom entries provenant des 2 niveaux (plan + session). Pas de
    // déduplication — chaque entrée a son id unique.
    const out = [];
    _planState.customEntries.forEach(function(e) {
      if (!category || e.category === category) {
        out.push(Object.assign({}, e, { isCustom: true, source: "plan", visible: isCustomVisible(e.id) }));
      }
    });
    _sessionState.customEntries.forEach(function(e) {
      if (!category || e.category === category) {
        out.push(Object.assign({}, e, { isCustom: true, source: "session", visible: isCustomVisible(e.id) }));
      }
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
  function _persistSession() {
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

  function addCustomEntry(entry) {
    if (!entry || !entry.category) return null;
    if (CATEGORIES.indexOf(entry.category) < 0) return null;
    const id = entry.id || _newId();
    const clean = {
      id:          id,
      category:    entry.category,
      label:       String(entry.label || "").trim() || "Sans nom",
      // Renders optionnels — au moins UN doit être présent pour le render
      lineColor:   entry.lineColor   || null,
      fillColor:   entry.fillColor   || null,
      borderColor: entry.borderColor || null,
      iconUrl:     entry.iconUrl     || null
    };
    _sessionState.customEntries.push(clean);
    _persistSession();
    return id;
  }

  function removeCustomEntry(id) {
    const idx = _sessionState.customEntries.findIndex(function(e) { return e.id === id; });
    if (idx >= 0) {
      _sessionState.customEntries.splice(idx, 1);
      _persistSession();
      return true;
    }
    // Si c'est une entrée du PLAN (non éditable), on la cache via hidden
    // plutôt que la supprimer.
    const planEntry = _planState.customEntries.find(function(e) { return e.id === id; });
    if (planEntry) {
      setCustomEntryVisibility(id, false);
      return true;
    }
    return false;
  }

  function updateCustomEntry(id, patch) {
    const idx = _sessionState.customEntries.findIndex(function(e) { return e.id === id; });
    if (idx < 0) return false;
    const e = _sessionState.customEntries[idx];
    if (patch.label != null)       e.label       = String(patch.label).trim() || e.label;
    if (patch.lineColor   !== undefined) e.lineColor   = patch.lineColor   || null;
    if (patch.fillColor   !== undefined) e.fillColor   = patch.fillColor   || null;
    if (patch.borderColor !== undefined) e.borderColor = patch.borderColor || null;
    if (patch.iconUrl     !== undefined) e.iconUrl     = patch.iconUrl     || null;
    _persistSession();
    return true;
  }

  function resetSession() {
    _sessionState = _emptyState();
    _persistSession();
  }

  // ─────────────────────────────────────────────
  // Helpers exposés pour exporter.js
  // ─────────────────────────────────────────────
  function categoryTitle(category) {
    return CATEGORY_TITLES[category] || category;
  }

  function listCategories() {
    return CATEGORIES.slice();
  }

  // ─────────────────────────────────────────────
  // API publique
  // ─────────────────────────────────────────────
  return {
    SCHEMA_VERSION:        SCHEMA_VERSION,
    DEFAULT_LABELS:        DEFAULT_LABELS,
    DEFAULT_RENDERS:       DEFAULT_RENDERS,
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
    listEntries:           listEntries,
    listCustomEntries:     listCustomEntries,
    isCustomVisible:       isCustomVisible,

    // Setters session
    setSessionLabel:       setSessionLabel,
    setSessionVisibility:  setSessionVisibility,
    setCustomEntryVisibility: setCustomEntryVisibility,
    addCustomEntry:        addCustomEntry,
    removeCustomEntry:     removeCustomEntry,
    updateCustomEntry:     updateCustomEntry,
    resetSession:          resetSession,

    // UI helpers
    categoryTitle:         categoryTitle,
    listCategories:        listCategories
  };
})();
