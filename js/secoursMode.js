/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 */

// =========================
// SECOURSMODE.JS — Mode Secours (depuis v1.22.0)
// =========================
// Outil opérationnel pour assigner méthodiquement des équipes de secours à
// des zones de recherche sur un plan cataphile. Cas d'usage : une personne
// est portée disparue, plusieurs équipes arrivent en surface, le PC secours
// doit assigner chaque équipe à une portion du réseau avec point d'entrée,
// point de sortie, itinéraire suggéré, durée estimée. Au retour terrain,
// chaque équipe rapporte ses observations.
//
// Le mode Secours orchestre les briques existantes :
//   • 🔍 Recherche unifiée — sélection rapide des points d'accès
//   • 🗺️ Pathfinder       — calcul itinéraire entre waypoints
//   • 🔥 Heatmap          — visualisation zones probables (Phase 2)
//   • ⬛ Zones polygones  — délimitation visuelle d'une zone d'équipe
//   • 🛣️ Tracés           — sélection multi-clic des galeries d'une zone
//   • 🏗️ M-LVL            — assignement par étage
//   • 📍 Lost Mode        — pré-fill du contexte (Phase 2)
//   • ⭐ Favoris          — points clés taggés (Phase 2)
//
// PERSISTANCE :
//   localStorage["myktamap_secours_v1_<planId>"] = JSON array de scénarios
//   Multi-scénarios par plan (cap 10 FIFO). Permet à l'user de préparer
//   plusieurs hypothèses ("si Marc parti par l'Est" vs "si par le Sud").
//
// API publique :
//   window.SecoursMode = {
//     ouvrir, fermer, isOpen, getCurrentScenarioId,
//     list, get, create, update, delete, duplicate,
//     addGroupe, updateGroupe, removeGroupe,
//     recalculerItineraires, exporterPDF, exporterKMZ,
//     renderOverlay, clearOverlay, setFocus,
//     onChange, PALETTE
//   }
//
// FORMAT d'un scénario :
//   {
//     id:        "secours_<timestamp>_<rand>",
//     nom:       "Recherche Marc — 15/06/2026",
//     createdAt: "2026-06-15T14:32:00.000Z",
//     updatedAt: "2026-06-15T14:50:12.000Z",
//     context: {
//       incidentAt:       "2026-06-15T13:45:00.000Z",
//       lastKnownPoint:   { x, y, level, ts } | null,
//       zoneIncertitude: { x, y, radius } | null,
//       notes:           "Marc parti vers 14h..."
//     },
//     groupes: [
//       {
//         id:               "G_<timestamp>",
//         nom:              "Équipe Alpha",
//         couleurIdx:       0,            // index dans PALETTE
//         membres:          ["Léa", "Tom"],
//         entree:           { x, y, level, pointId? } | null,
//         sortie:           { x, y, level, pointId? } | null,
//         zoneType:         "polygon" | "roads",
//         zonePolygon:      [{x, y, level}, ...] | null,    // si polygon
//         zoneRoadIds:      ["roadId1", ...] | null,         // si roads
//         itineraireSuggere: [{x, y, level}, ...] | null,    // calc Pathfinder
//         distanceM:        45.3,                            // calc auto
//         dureeEstimeeMin:  15,                              // = distM ÷ vitesse
//         statut:           "non_demarré"|"en_cours"|"terminé"|"rappelé", // Phase 3
//         observations:     ""
//       }
//     ],
//     pointsCles: [
//       { pointId | x, y, level, role, label }
//     ]
//   }
// =========================

(function() {
  "use strict";

  // ============================================================
  // CONSTANTES
  // ============================================================

  // Palette charte fixe — 10 couleurs distinctes lisibles sur dark + light.
  // Choix terrain : couleurs vives, contrastées entre voisines (anti-confusion
  // en briefing). Ordre = "alphabet OTAN" Alpha, Bravo, Charlie...
  const PALETTE = [
    { hex: "#ff4444", nom: "Alpha"    },  // rouge vif
    { hex: "#4488ff", nom: "Bravo"    },  // bleu
    { hex: "#44cc44", nom: "Charlie"  },  // vert
    { hex: "#ffcc00", nom: "Delta"    },  // jaune ambre (charte MyKTAMap)
    { hex: "#ff4ecb", nom: "Echo"     },  // magenta (charte jonctions)
    { hex: "#00d4ff", nom: "Foxtrot"  },  // cyan (charte itinéraire)
    { hex: "#ff8c00", nom: "Golf"     },  // orange
    { hex: "#9d44ff", nom: "Hotel"    },  // violet
    { hex: "#8b5a2b", nom: "India"    },  // brun
    { hex: "#404040", nom: "Juliet"   }   // gris foncé
  ];

  // Cap FIFO : au-delà de 10 scénarios par plan, on supprime le plus ancien
  // au create. Évite l'accumulation infinie. 10 = compromis raisonnable
  // (l'user peut nettoyer manuellement via delete).
  const MAX_SCENARIOS = 10;

  // Vitesse moyenne cataphile pour estimation durée = mètres / sec.
  // Valeur conservatrice basée sur retours terrain (cataphile en groupe avec
  // équipement, progression méthodique en cartographie = ~1 m/s en moyenne,
  // mais avec arrêts, vérifs, obstacles, on retombe vers 0.5 m/s).
  // Pas configurable en Phase 1 — pourra le devenir en Phase 2.
  const VITESSE_MPS_DEFAUT = 0.5;

  // ============================================================
  // STATE MODULE-LEVEL
  // ============================================================

  // Cache des scénarios chargés pour le plan courant. Lu au _load() initial,
  // muté par les CRUD, persisté au _save() après chaque mutation.
  let _scenarios = [];

  // ID du scénario actuellement édité dans la modale (= null si modale fermée
  // ou en mode "liste"). Permet à renderOverlay de savoir lequel afficher.
  let _currentScenarioId = null;

  // Modale DOM root (= null si fermée). Idempotency : ouvrir() ferme l'ex avant
  // de créer la nouvelle.
  let _modal = null;

  // Layer Leaflet qui contient l'overlay des zones d'équipes sur la carte.
  // Créé à renderOverlay, nettoyé à clearOverlay (et au plan switch).
  let _overlayLayer = null;

  // ID du groupe focusé (= null pour afficher TOUS). En mode focus, l'app
  // masque les zones des autres équipes — utile navigation terrain à la
  // sortie pour une équipe spécifique.
  let _focusedGroupeId = null;

  // Listeners pour onChange — appelés après chaque mutation persistée.
  const _changeListeners = [];

  // ============================================================
  // PERSISTANCE LOCALSTORAGE
  // ============================================================

  // Construit la clé localStorage pour le plan courant. Retourne null si
  // pas de plan chargé (= modale ne devrait pas être ouverte de toute façon,
  // mais defensive).
  function _storageKey() {
    const planId = window._currentLoadedPlanId;
    if (!planId || typeof planId !== "string") return null;
    return "myktamap_secours_v1_" + planId;
  }

  // Charge les scénarios depuis localStorage pour le plan courant.
  // Tolère absence (= array vide) et corruption (= reset + warn).
  function _loadScenarios() {
    const key = _storageKey();
    if (!key) { _scenarios = []; return; }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { _scenarios = []; return; }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn("[SecoursMode] Storage corrompu (pas un array) pour", key, "— reset");
        _scenarios = [];
        return;
      }
      // Filtre défensif : chaque entry doit avoir au minimum id + nom
      _scenarios = parsed.filter(function(s) {
        return s && typeof s === "object" && typeof s.id === "string" && typeof s.nom === "string";
      });
    } catch(e) {
      console.warn("[SecoursMode] Échec parse storage :", e);
      _scenarios = [];
    }
  }

  // Persiste l'état courant dans localStorage. Cap FIFO à MAX_SCENARIOS.
  // Throttle inutile : les CRUD sont user-driven, pas en boucle. Synchrone OK.
  function _saveScenarios() {
    const key = _storageKey();
    if (!key) return false;
    // Cap FIFO : si > MAX, on retire les plus anciens par createdAt
    if (_scenarios.length > MAX_SCENARIOS) {
      _scenarios.sort(function(a, b) {
        return (Date.parse(a.createdAt || 0) || 0) - (Date.parse(b.createdAt || 0) || 0);
      });
      const excess = _scenarios.length - MAX_SCENARIOS;
      _scenarios.splice(0, excess);
      console.log("[SecoursMode] FIFO : " + excess + " scénario(s) ancien(s) purgé(s)");
    }
    try {
      localStorage.setItem(key, JSON.stringify(_scenarios));
      return true;
    } catch(e) {
      console.warn("[SecoursMode] Save échoué :", e);
      // OOMGuard toast si quota dépassé (cohérent avec pattern sessionPersist)
      if (e && e.name === "QuotaExceededError" && window.OOMGuard
          && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(
          "🚨 Quota storage dépassé — exporte ton scénario de secours pour ne pas le perdre !",
          "error"
        );
      }
      return false;
    }
  }

  // ============================================================
  // HELPERS INTERNES
  // ============================================================

  // Génère un ID unique pour scénario / groupe / point clé
  function _genId(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ISO timestamp courant
  function _nowIso() { return new Date().toISOString(); }

  // Mute updatedAt + notifie les listeners + save
  function _commitMutation(scenario) {
    if (scenario && typeof scenario === "object") {
      scenario.updatedAt = _nowIso();
    }
    _saveScenarios();
    _notify();
  }

  // Notifie tous les listeners du changement d'état
  function _notify() {
    _changeListeners.forEach(function(cb) {
      try { cb(_scenarios); } catch(e) { /* swallow handler errors */ }
    });
  }

  // ============================================================
  // CRUD — SCÉNARIOS
  // ============================================================

  // Retourne une copie défensive de la liste (pas la ref interne)
  function list() {
    return _scenarios.slice();
  }

  // Retourne un scénario par id (ou null)
  function get(id) {
    return _scenarios.find(function(s) { return s.id === id; }) || null;
  }

  // Crée un nouveau scénario vide avec nom donné. Retourne l'objet créé.
  // Si nom vide → fallback "Scénario du <date>".
  function createScenario(nom) {
    const safeName = (typeof nom === "string" && nom.trim())
                     ? nom.trim()
                     : "Scénario du " + new Date().toLocaleDateString("fr-FR");
    const scenario = {
      id:        _genId("secours"),
      nom:       safeName,
      createdAt: _nowIso(),
      updatedAt: _nowIso(),
      context: {
        incidentAt:      null,
        lastKnownPoint:  null,
        zoneIncertitude: null,
        notes:           ""
      },
      groupes:    [],
      pointsCles: []
    };
    _scenarios.push(scenario);
    _commitMutation(scenario);
    return scenario;
  }

  // Update partiel d'un scénario par id. Merge shallow uniquement (pas deep).
  // Retourne le scénario muté ou null si introuvable.
  function updateScenario(id, partial) {
    const s = get(id);
    if (!s || !partial || typeof partial !== "object") return null;
    // Whitelist des champs mutables (anti-pollution)
    if ("nom" in partial && typeof partial.nom === "string") s.nom = partial.nom;
    if ("context" in partial && partial.context && typeof partial.context === "object") {
      // Merge shallow sur context (préserve champs absents du partial)
      Object.keys(partial.context).forEach(function(k) {
        s.context[k] = partial.context[k];
      });
    }
    if ("pointsCles" in partial && Array.isArray(partial.pointsCles)) {
      s.pointsCles = partial.pointsCles.slice();
    }
    _commitMutation(s);
    return s;
  }

  // Supprime un scénario par id. Retourne true si trouvé+supprimé.
  function deleteScenario(id) {
    const idx = _scenarios.findIndex(function(s) { return s.id === id; });
    if (idx < 0) return false;
    _scenarios.splice(idx, 1);
    // Si on supprime le scénario courant, on désactive le focus
    if (_currentScenarioId === id) {
      _currentScenarioId = null;
      clearOverlay();
    }
    _saveScenarios();
    _notify();
    return true;
  }

  // Duplique un scénario (= deep clone via JSON roundtrip + nouveau id).
  // Pratique pour "et si l'équipe Alpha sort par le Sud au lieu de l'Est" :
  // dupliquer puis modifier l'équipe sans perdre l'original.
  function duplicateScenario(id) {
    const src = get(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = _genId("secours");
    copy.nom = src.nom + " (copie)";
    copy.createdAt = _nowIso();
    copy.updatedAt = _nowIso();
    // Régénère aussi les IDs internes des groupes (sinon collisions)
    if (Array.isArray(copy.groupes)) {
      copy.groupes.forEach(function(g) { g.id = _genId("G"); });
    }
    _scenarios.push(copy);
    _commitMutation(copy);
    return copy;
  }

  // ============================================================
  // CRUD — GROUPES (équipes) au sein d'un scénario
  // ============================================================

  // Ajoute un groupe vide à un scénario. couleurIdx auto-assigné au prochain
  // libre dans la palette (cyclique si > 10 équipes).
  function addGroupe(scenarioId, nom) {
    const s = get(scenarioId);
    if (!s) return null;
    const safeName = (typeof nom === "string" && nom.trim())
                     ? nom.trim()
                     : "Équipe " + PALETTE[s.groupes.length % PALETTE.length].nom;
    const groupe = {
      id:                _genId("G"),
      nom:               safeName,
      couleurIdx:        s.groupes.length % PALETTE.length,
      membres:           [],
      entree:            null,
      sortie:            null,
      zoneType:          null,     // null = pas encore défini
      zonePolygon:       null,
      zoneRoadIds:       null,
      itineraireSuggere: null,
      distanceM:         null,
      dureeEstimeeMin:   null,
      statut:            "non_demarré",
      observations:      ""
    };
    s.groupes.push(groupe);
    _commitMutation(s);
    return groupe;
  }

  // Update partiel d'un groupe. Whitelist des champs mutables.
  function updateGroupe(scenarioId, groupeId, partial) {
    const s = get(scenarioId);
    if (!s) return null;
    const g = s.groupes.find(function(x) { return x.id === groupeId; });
    if (!g || !partial || typeof partial !== "object") return null;
    // Whitelist
    if ("nom" in partial && typeof partial.nom === "string") g.nom = partial.nom;
    if ("couleurIdx" in partial && Number.isInteger(partial.couleurIdx)) {
      g.couleurIdx = ((partial.couleurIdx % PALETTE.length) + PALETTE.length) % PALETTE.length;
    }
    if ("membres" in partial && Array.isArray(partial.membres)) {
      g.membres = partial.membres.slice();
    }
    if ("entree" in partial) g.entree = partial.entree;       // {x,y,level?,pointId?} | null
    if ("sortie" in partial) g.sortie = partial.sortie;
    if ("zoneType" in partial) g.zoneType = partial.zoneType;  // "polygon"|"roads"|null
    if ("zonePolygon" in partial) g.zonePolygon = partial.zonePolygon;
    if ("zoneRoadIds" in partial) g.zoneRoadIds = partial.zoneRoadIds;
    if ("itineraireSuggere" in partial) g.itineraireSuggere = partial.itineraireSuggere;
    if ("distanceM" in partial) g.distanceM = partial.distanceM;
    if ("dureeEstimeeMin" in partial) g.dureeEstimeeMin = partial.dureeEstimeeMin;
    if ("statut" in partial && typeof partial.statut === "string") g.statut = partial.statut;
    if ("observations" in partial && typeof partial.observations === "string") {
      g.observations = partial.observations;
    }
    _commitMutation(s);
    return g;
  }

  // Supprime un groupe par id
  function removeGroupe(scenarioId, groupeId) {
    const s = get(scenarioId);
    if (!s) return false;
    const idx = s.groupes.findIndex(function(g) { return g.id === groupeId; });
    if (idx < 0) return false;
    s.groupes.splice(idx, 1);
    if (_focusedGroupeId === groupeId) _focusedGroupeId = null;
    _commitMutation(s);
    return true;
  }

  // ============================================================
  // STUBS pour Phase 1 — implémentations dans les commits suivants
  // ============================================================

  // Stub Phase 1 commit 4 — pré-calcul itinéraires via Pathfinder
  function recalculerItineraires(scenarioId) {
    console.warn("[SecoursMode] recalculerItineraires : pas encore implémenté (commit 4/9)");
    return null;
  }

  // Stub Phase 1 commit 5 — overlay carte
  function renderOverlay(scenarioId) {
    console.warn("[SecoursMode] renderOverlay : pas encore implémenté (commit 5/9)");
  }
  function clearOverlay() {
    if (_overlayLayer && window.map) {
      try { window.map.removeLayer(_overlayLayer); } catch(e) {}
    }
    _overlayLayer = null;
  }
  function setFocus(groupeId) {
    _focusedGroupeId = groupeId || null;
    // Re-render uniquement si overlay existe déjà (sinon no-op)
    if (_overlayLayer && _currentScenarioId) {
      renderOverlay(_currentScenarioId);
    }
  }

  // Stub Phase 1 commit 6 — export PDF
  function exporterPDF(scenarioId) {
    console.warn("[SecoursMode] exporterPDF : pas encore implémenté (commit 6/9)");
    return null;
  }

  // Stub Phase 1 commit 7 — export KMZ
  function exporterKMZ(scenarioId) {
    console.warn("[SecoursMode] exporterKMZ : pas encore implémenté (commit 7/9)");
    return null;
  }

  // Stub Phase 1 commit 2 — modale UI
  function ouvrir(scenarioId) {
    console.warn("[SecoursMode] ouvrir : modale UI à coder (commit 2/9)");
    if (scenarioId) _currentScenarioId = scenarioId;
  }
  function fermer() {
    if (_modal && _modal.parentNode) _modal.parentNode.removeChild(_modal);
    _modal = null;
    clearOverlay();
  }
  function isOpen() { return _modal !== null; }
  function getCurrentScenarioId() { return _currentScenarioId; }

  // ============================================================
  // EVENTS
  // ============================================================

  // Subscribe aux changements. Retourne unsubscribe.
  function onChange(cb) {
    if (typeof cb !== "function") return function() {};
    _changeListeners.push(cb);
    return function() {
      const i = _changeListeners.indexOf(cb);
      if (i >= 0) _changeListeners.splice(i, 1);
    };
  }

  // ============================================================
  // CYCLE DE VIE
  // ============================================================

  // Initialisation : charge les scénarios pour le plan courant.
  // Appelé par main.js > lancerApplication après onPlanLoaded.
  // Idempotent : peut être appelé plusieurs fois sans effet de bord.
  function init() {
    _loadScenarios();
    console.log("[SecoursMode] Init — " + _scenarios.length + " scénario(s) chargé(s) pour ce plan");
  }

  // Reset au plan switch — appelé par main.js > _libererRessourcesPlanPrecedent.
  // Ferme la modale, cleanup overlay, vide les scénarios in-memory (les
  // scénarios du nouveau plan seront re-chargés via init au boot du nouveau).
  function reset() {
    fermer();
    _scenarios = [];
    _currentScenarioId = null;
    _focusedGroupeId = null;
  }

  // ============================================================
  // EXPORT API PUBLIQUE
  // ============================================================

  window.SecoursMode = {
    // Cycle de vie
    init:                   init,
    reset:                  reset,
    // UI
    ouvrir:                 ouvrir,
    fermer:                 fermer,
    isOpen:                 isOpen,
    getCurrentScenarioId:   getCurrentScenarioId,
    // CRUD scénarios
    list:                   list,
    get:                    get,
    create:                 createScenario,
    update:                 updateScenario,
    delete:                 deleteScenario,
    "delete":               deleteScenario,  // alias (delete = reserved keyword)
    duplicate:              duplicateScenario,
    // CRUD groupes
    addGroupe:              addGroupe,
    updateGroupe:           updateGroupe,
    removeGroupe:           removeGroupe,
    // Tools (stubs en commit 1, impl dans commits suivants)
    recalculerItineraires:  recalculerItineraires,
    exporterPDF:            exporterPDF,
    exporterKMZ:            exporterKMZ,
    // Map overlay
    renderOverlay:          renderOverlay,
    clearOverlay:           clearOverlay,
    setFocus:               setFocus,
    // Events
    onChange:               onChange,
    // Constantes (lecture seule, exposées pour UI)
    PALETTE:                PALETTE,
    MAX_SCENARIOS:          MAX_SCENARIOS,
    VITESSE_MPS_DEFAUT:     VITESSE_MPS_DEFAUT
  };

  console.log("[SecoursMode] Module chargé.");
})();
