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

  // Mute updatedAt + notifie les listeners + save + auto-refresh overlay
  function _commitMutation(scenario) {
    if (scenario && typeof scenario === "object") {
      scenario.updatedAt = _nowIso();
    }
    _saveScenarios();
    _notify();
    // Auto-refresh overlay si on est en train d'afficher ce scénario sur la carte
    if (_overlayLayer && scenario && scenario.id === _currentScenarioId) {
      renderOverlay(scenario.id);
    }
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

  // 🆕 v1.23.0 Phase 2 / Feature C (KARMA "Lost Mode → auto pre-fill context") :
  // Crée un nouveau scénario Mode Secours pré-rempli avec les infos du
  // Lost Mode en cours. Workflow : user en Lost Mode (cherche quelqu'un) →
  // clic "🚨 Lancer un plan de secours" → scénario créé direct avec :
  //   • nom = "Recherche - <date>"
  //   • context.incidentAt = now - lostState.elapsedMinutes
  //   • context.lastKnownPoint = lostState.lastKnownPos (avec label si POI)
  //   • context.zoneIncertitude = { x, y, radiusMeters } (cercle Lost)
  //   • context.notes = preset vitesse + indices saisis dans Lost Mode
  // Puis ouvre la modale en vue Edit pour que l'user ajoute les équipes.
  function creerDepuisLostMode(lostState) {
    if (!lostState || !lostState.lastKnownPos) {
      _toast("⚠️ Aucune position connue dans Lost Mode.", "warn");
      return null;
    }
    // Nom auto : "Recherche - 26/05/2026 14:32"
    const now = new Date();
    const nomAuto = "Recherche - " + now.toLocaleDateString("fr-FR") +
                    " " + now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    // Timestamp d'incident = maintenant - elapsedMinutes
    const elapsed = (typeof lostState.elapsedMinutes === "number") ? lostState.elapsedMinutes : 0;
    const incidentTs = Date.now() - elapsed * 60 * 1000;
    // Compose les notes contextuelles
    const notesParts = ["Importé depuis ⛑️ Mode urgence Je suis perdu."];
    if (elapsed > 0) {
      const h = Math.floor(elapsed / 60);
      const m = Math.round(elapsed - h * 60);
      notesParts.push("Temps écoulé estimé : " + (h > 0 ? h + "h" : "") + (m > 0 ? (m < 10 && h > 0 ? "0" : "") + m + "min" : ""));
    }
    if (lostState.speedKmH) {
      notesParts.push("Vitesse de marche estimée : " + lostState.speedKmH + " km/h" +
                      (lostState.presetKey ? " (preset " + lostState.presetKey + ")" : ""));
    }
    if (lostState.radiusMeters) {
      notesParts.push("Rayon d'incertitude calculé : " + Math.round(lostState.radiusMeters) + " m");
    }
    if (lostState.clues && lostState.clues.trim()) {
      notesParts.push("Indices saisis : " + lostState.clues.trim());
    }
    // Création + remplissage du contexte
    const scenario = createScenario(nomAuto);
    updateScenario(scenario.id, {
      context: {
        incidentAt: new Date(incidentTs).toISOString(),
        lastKnownPoint: {
          x:     lostState.lastKnownPos.x,
          y:     lostState.lastKnownPos.y,
          level: (window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number")
                 ? window.APP_CONFIG.activeLevel : 0,
          label: lostState.lastKnownPos.label || null
        },
        zoneIncertitude: lostState.radiusMeters ? {
          x:            lostState.lastKnownPos.x,
          y:            lostState.lastKnownPos.y,
          radiusMeters: lostState.radiusMeters,
          radiusPx:     lostState.radiusPx || null
        } : null,
        notes: notesParts.join("\n")
      }
    });
    _toast("✓ Scénario créé : " + nomAuto + ". Ajoute maintenant les équipes 🚨.", "info");
    // Ouvre la modale Mode Secours en vue Edit
    ouvrir(scenario.id);
    return scenario;
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
      // 🆕 v1.22.0-fix2 (KARMA "je dois pouvoir entrer par le même point de
      // sortie et balayer la zone, avoir des points intermédiaires") :
      // parcours = entree + intermediaires[] + sortie. Pathfinder itère
      // [entree, ...intermediaires, sortie] pour calc itinéraire complet
      // qui ratisse la zone méthodiquement. Boucle = entree = sortie (même
      // POI choisi 2 fois). Tous les waypoints partagent le format
      // {x, y, level, pointId?, label?}.
      entree:            null,
      intermediaires:    [],
      sortie:            null,
      zoneType:          null,
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
    if ("entree" in partial) g.entree = partial.entree;       // {x,y,level?,pointId?,label?} | null
    if ("sortie" in partial) g.sortie = partial.sortie;
    if ("intermediaires" in partial && Array.isArray(partial.intermediaires)) {
      g.intermediaires = partial.intermediaires.slice();
    }
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

  // ============================================================
  // MAP OVERLAY (depuis v1.22.0 commit 5/9)
  // ============================================================
  // Rendu Leaflet des zones + entrées/sorties + itinéraires de toutes les
  // équipes d'un scénario sur la carte. Couleurs PALETTE par équipe.
  //
  // KARMA validation : "Overlay par couleur d'équipe (transparent)"
  //   → fillOpacity 0.30 pour les polygons (briefing clair sans masquer fond)
  //
  // Si _focusedGroupeId est set, on n'affiche QUE cette équipe (mode focus
  // navigation terrain, masque les autres pour réduire la pollution visuelle).
  function renderOverlay(scenarioId) {
    clearOverlay();
    const s = get(scenarioId || _currentScenarioId);
    if (!s || !window.map) return;
    _currentScenarioId = s.id;
    _overlayLayer = L.layerGroup().addTo(window.map);
    // 🆕 v1.23.0 Phase 2 / Feature C — Rendu du contexte Lost Mode si présent
    // (lastKnownPoint marker urgence + zoneIncertitude cercle pointillé).
    // Affiché AVANT les équipes (z-index bas) pour ne pas masquer les overlays
    // d'assignation.
    if (s.context) {
      _renderContextOverlay(s.context);
    }
    s.groupes.forEach(function(g) {
      // Skip si mode focus actif et pas l'équipe focusée
      if (_focusedGroupeId && g.id !== _focusedGroupeId) return;
      const couleur = PALETTE[g.couleurIdx % PALETTE.length].hex;
      _renderGroupeOverlay(g, couleur);
    });
  }

  // 🆕 v1.23.0 Feature C — Overlay du contexte importé Lost Mode :
  // marker rouge ⛑️ sur lastKnownPoint + cercle pointillé rouge sur zoneIncertitude
  function _renderContextOverlay(ctx) {
    if (!ctx) return;
    // Cercle zone d'incertitude (rayon en mètres → px via APP_CONFIG.scale)
    if (ctx.zoneIncertitude && typeof ctx.zoneIncertitude.x === "number"
        && typeof ctx.zoneIncertitude.radiusMeters === "number") {
      const scale = (window.APP_CONFIG && window.APP_CONFIG.scale > 0)
                    ? window.APP_CONFIG.scale : 1;
      const radiusPx = ctx.zoneIncertitude.radiusPx
                       || (ctx.zoneIncertitude.radiusMeters * scale);
      const center = _planToLatLng(ctx.zoneIncertitude);
      // L.circle prend un rayon en mètres pour CRS standard mais en pixels
      // pour CRS.Simple. Ici APP_CONFIG.scale est px/m → on a déjà radiusPx.
      const circle = L.circle(center, {
        radius:      radiusPx,
        color:       "#ff4444",
        weight:      2,
        opacity:     0.85,
        dashArray:   "8 6",
        fillColor:   "#ff4444",
        fillOpacity: 0.10
      });
      circle.bindTooltip(
        "⛑️ Zone d'incertitude (rayon " + Math.round(ctx.zoneIncertitude.radiusMeters) + " m)",
        { permanent: false }
      );
      circle.addTo(_overlayLayer);
    }
    // Marker dernière position connue
    if (ctx.lastKnownPoint && typeof ctx.lastKnownPoint.x === "number") {
      const cm = L.circleMarker(_planToLatLng(ctx.lastKnownPoint), {
        radius:      12,
        color:       "#ff4444",
        weight:      4,
        fillColor:   "#fff",
        fillOpacity: 0.95
      });
      const lbl = ctx.lastKnownPoint.label
                  ? "⛑️ Dernière position connue — " + ctx.lastKnownPoint.label
                  : "⛑️ Dernière position connue";
      cm.bindTooltip(lbl, { permanent: false });
      cm.addTo(_overlayLayer);
    }
  }

  function _renderGroupeOverlay(g, couleur) {
    // Zone polygone — fillOpacity 30 % + border 3px (briefing visible)
    if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
      const latlngs = g.zonePolygon.map(_planToLatLng);
      const poly = L.polygon(latlngs, {
        color:       couleur,
        weight:      3,
        opacity:     0.85,
        fillColor:   couleur,
        fillOpacity: 0.30,
        interactive: true
      });
      poly.bindTooltip("🚨 " + _escHtml(g.nom), { permanent: false, direction: "center" });
      poly.addTo(_overlayLayer);
    }
    // Zone roads — repère chaque road sélectionnée avec halo couleur équipe
    if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds)) {
      const allRoads = ((typeof window.getRoads === "function") ? (window.getRoads() || []) : [])
                       .concat((typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : []);
      g.zoneRoadIds.forEach(function(rid) {
        const road = allRoads.find(function(r) { return r.id === rid; });
        if (!road || !Array.isArray(road.points)) return;
        const latlngs = road.points.map(_planToLatLng);
        const halo = L.polyline(latlngs, {
          color:   couleur,
          weight:  10,
          opacity: 0.55,
          lineCap: "round",
          lineJoin: "round"
        });
        halo.bindTooltip("🚨 " + _escHtml(g.nom), { permanent: false, direction: "center" });
        halo.addTo(_overlayLayer);
      });
    }
    // Entrée — marker circle vert avec halo couleur équipe
    if (g.entree && typeof g.entree.x === "number" && typeof g.entree.y === "number") {
      const cm = L.circleMarker(_planToLatLng(g.entree), {
        radius:      9,
        color:       "#00cc44",
        weight:      3,
        fillColor:   couleur,
        fillOpacity: 0.85
      });
      cm.bindTooltip("📍 Entrée " + _escHtml(g.nom), { permanent: false });
      cm.addTo(_overlayLayer);
    }
    // 🆕 v1.22.0-fix2 — Intermédiaires : markers ronds plus petits couleur équipe
    // avec border blanc fin, numérotés via tooltip
    if (Array.isArray(g.intermediaires)) {
      g.intermediaires.forEach(function(w, i) {
        if (!w || typeof w.x !== "number" || typeof w.y !== "number") return;
        const cm = L.circleMarker(_planToLatLng(w), {
          radius:      7,
          color:       "#fff",
          weight:      2,
          fillColor:   couleur,
          fillOpacity: 0.85
        });
        cm.bindTooltip("▾ Étape " + (i + 1) + " (" + _escHtml(g.nom) + ")" +
                       (w.label ? " — " + _escHtml(w.label) : ""),
                       { permanent: false });
        cm.addTo(_overlayLayer);
      });
    }
    // Sortie — marker square (via divIcon) couleur équipe avec bord rouge
    if (g.sortie && typeof g.sortie.x === "number" && typeof g.sortie.y === "number") {
      // Si entrée === sortie (boucle), marker double bordure (vert + rouge superposés)
      const isBoucle = _samePoint(g.entree, g.sortie);
      const cm = L.circleMarker(_planToLatLng(g.sortie), {
        radius:      isBoucle ? 11 : 9,
        color:       isBoucle ? "#ffaa00" : "#cc0000",
        weight:      isBoucle ? 4 : 3,
        fillColor:   couleur,
        fillOpacity: 0.85
      });
      cm.bindTooltip(
        (isBoucle ? "↻ Boucle (entrée/sortie) " : "🚪 Sortie ") + _escHtml(g.nom),
        { permanent: false }
      );
      cm.addTo(_overlayLayer);
    }
    // Itinéraire suggéré — polyline dashed couleur équipe
    if (Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2) {
      const latlngs = g.itineraireSuggere.map(_planToLatLng);
      const ligne = L.polyline(latlngs, {
        color:     couleur,
        weight:    5,
        opacity:   0.90,
        dashArray: "10 6",
        lineCap:   "round",
        lineJoin:  "round"
      });
      ligne.bindTooltip("🗺️ Itinéraire " + _escHtml(g.nom), { permanent: false });
      ligne.addTo(_overlayLayer);
    }
  }
  function clearOverlay() {
    if (_overlayLayer && window.map) {
      try { window.map.removeLayer(_overlayLayer); } catch(e) {}
    }
    _overlayLayer = null;
    // 🆕 v1.22.0-fix1 : cleanup floater retour modale (au cas où l'user
    // ferme via Échap ou plan switch sans repasser par le toggle).
    if (typeof _removeOverlayFloater === "function") _removeOverlayFloater();
  }
  function setFocus(groupeId) {
    _focusedGroupeId = groupeId || null;
    // Re-render uniquement si overlay existe déjà (sinon no-op)
    if (_overlayLayer && _currentScenarioId) {
      renderOverlay(_currentScenarioId);
    }
  }

  // ============================================================
  // EXPORT PDF (depuis v1.22.0 commit 6/9)
  // ============================================================
  // 1 page A4 par équipe avec briefing texte. La carte miniature avec
  // overlay sera ajoutée en Phase 2 (nécessite render canvas du plan + zone).
  // MVP : texte structuré + cadre observations vide pour impression papier.
  // 🆕 v1.22.0-fix5 (KARMA "on n'a pas une image de chaque zone dans le pdf
  // exporter") : exporterPDF est désormais async pour générer un canvas du
  // plan + cropper la zone de chaque équipe avec overlay couleur + markers.
  async function exporterPDF(scenarioId) {
    const s = get(scenarioId || _currentScenarioId);
    if (!s) {
      _toast("⚠️ Scénario introuvable.", "error");
      return null;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      _toast("⚠️ jsPDF non chargé.", "error");
      return null;
    }
    if (!s.groupes || s.groupes.length === 0) {
      _toast("⚠️ Aucune équipe dans ce scénario.", "warn");
      return null;
    }
    _toast("⏳ Génération du PDF (canvas du plan en cours)…", "info");
    // 🆕 v1.22.0-fix5 — Génère UNE fois le canvas plan complet avec calques
    // image + data layers visibles. Sera croppé par équipe. Si échec → PDF
    // text-only (fallback MVP).
    let fullCanvas = null;
    if (window.MyKTAMapExporterGenererCanvas && typeof window.MyKTAMapExporterGenererCanvas === "function") {
      try {
        fullCanvas = await window.MyKTAMapExporterGenererCanvas({
          scale:             1,
          bg:                "image",
          includeImgLayers:  true,
          includeDataLayers: true,
          ann: {
            points: false, roads: false, zones: false, structures: false,
            jonctions: false, itineraire: false
          }
        });
      } catch(e) {
        console.warn("[SecoursMode] Canvas plan échec, fallback text-only :", e);
      }
    }
    try {
      const pdf = new window.jspdf.jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 14;
      const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "Plan";
      s.groupes.forEach(function(g, idx) {
        if (idx > 0) pdf.addPage();
        const couleur = PALETTE[g.couleurIdx % PALETTE.length];
        // En-tête
        pdf.setFontSize(18); pdf.setFont(undefined, "bold");
        pdf.text("PLAN DE SECOURS — " + g.nom, margin, margin + 4);
        // Bandeau couleur équipe
        const rgb = _hexToRgb(couleur.hex);
        pdf.setFillColor(rgb.r, rgb.g, rgb.b);
        pdf.rect(margin, margin + 7, pageW - 2 * margin, 6, "F");
        pdf.setFontSize(10); pdf.setTextColor(255, 255, 255); pdf.setFont(undefined, "bold");
        pdf.text("Equipe " + couleur.nom + " (#" + (idx + 1) + "/" + s.groupes.length + ")",
                 margin + 2, margin + 11);
        pdf.setTextColor(0, 0, 0); pdf.setFont(undefined, "normal");
        let y = margin + 22;
        // 🆕 v1.22.0-fix5 — Insère une carte miniature de la zone de l'équipe
        // avec overlay (polygone + markers entrée/sortie + intermédiaires + itinéraire)
        if (fullCanvas) {
          try {
            const cropped = _cropCanvasForTeam(fullCanvas, g, couleur.hex);
            if (cropped) {
              const imgWmm = pageW - 2 * margin;        // pleine largeur
              const imgHmm = imgWmm * cropped.height / cropped.width;
              const capped = Math.min(90, imgHmm);     // cap hauteur 90 mm
              const finalHmm = capped;
              const finalWmm = capped * cropped.width / cropped.height;
              const xCentered = (pageW - finalWmm) / 2;
              pdf.addImage(cropped.toDataURL("image/jpeg", 0.85), "JPEG",
                           xCentered, y, finalWmm, finalHmm);
              // Petit cadre autour de l'image
              pdf.setDrawColor(150);
              pdf.rect(xCentered, y, finalWmm, finalHmm);
              y += finalHmm + 5;
              // Légende sous l'image
              pdf.setFontSize(8); pdf.setTextColor(120); pdf.setFont(undefined, "italic");
              pdf.text("Carte miniature — zone de recherche assignee", pageW / 2, y, { align: "center" });
              y += 5;
              pdf.setTextColor(0, 0, 0); pdf.setFont(undefined, "normal");
            }
          } catch(e) {
            console.warn("[SecoursMode] Crop canvas échec pour équipe " + g.nom + " :", e);
          }
        }
        // Section Contexte
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text("CONTEXTE DE L'INCIDENT", margin, y); y += 5;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
        pdf.text("Scenario : " + (s.nom || "(sans nom)"), margin, y); y += 4;
        pdf.text("Plan : " + planName, margin, y); y += 4;
        if (s.context && s.context.incidentAt) {
          const dt = new Date(s.context.incidentAt);
          pdf.text("Heure d'incident : " + dt.toLocaleString("fr-FR"), margin, y); y += 4;
        }
        if (s.context && s.context.notes) {
          y = _pdfWrapText(pdf, "Notes : " + s.context.notes, margin, y, pageW - 2 * margin, 4);
        }
        y += 4;
        // Section Membres
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text("MEMBRES DE L'EQUIPE", margin, y); y += 5;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
        pdf.text((g.membres && g.membres.length) ? g.membres.join(", ") : "(non renseignes)", margin, y);
        y += 8;
        // Section Mission
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text("MISSION ASSIGNEE", margin, y); y += 5;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
        pdf.text("Entree : " + _fmtPoint(g.entree), margin, y); y += 4;
        pdf.text("Sortie : " + _fmtPoint(g.sortie), margin, y); y += 4;
        const zoneTxt = g.zoneType === "polygon" ? "Polygone (" + (g.zonePolygon ? g.zonePolygon.length : 0) + " sommets)"
                      : g.zoneType === "roads"   ? (g.zoneRoadIds ? g.zoneRoadIds.length : 0) + " traces selectionnes"
                      : "(non definie)";
        pdf.text("Zone a ratisser : " + zoneTxt, margin, y); y += 4;
        if (g.distanceM) {
          const distFmt = (typeof window.formatDistance === "function")
                          ? window.formatDistance(g.distanceM, 0) : Math.round(g.distanceM) + " m";
          pdf.text("Distance itineraire : " + distFmt, margin, y); y += 4;
        }
        if (g.dureeEstimeeMin) {
          pdf.text("Duree estimee : ~" + Math.round(g.dureeEstimeeMin) + " min", margin, y); y += 4;
        }
        y += 4;
        // Section Itinéraire (waypoints)
        if (Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length > 0) {
          pdf.setFontSize(11); pdf.setFont(undefined, "bold");
          pdf.text("ITINERAIRE SUGGERE", margin, y); y += 5;
          pdf.setFontSize(9); pdf.setFont(undefined, "normal");
          pdf.text(g.itineraireSuggere.length + " waypoints sur le reseau de galeries existant.", margin, y); y += 4;
          y += 4;
        }
        // Cadre Observations (rempli papier au retour terrain)
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text("OBSERVATIONS AU RETOUR TERRAIN", margin, y); y += 5;
        pdf.setDrawColor(150);
        pdf.rect(margin, y, pageW - 2 * margin, 60);
        y += 65;
        // Footer
        pdf.setFontSize(7); pdf.setTextColor(120);
        pdf.text("Genere par MyKTAMap " + ((window.__MKM__ && window.__MKM__.build) || "") +
                 " - " + new Date().toLocaleString("fr-FR"),
                 margin, pdf.internal.pageSize.getHeight() - 6);
      });
      const filename = "Secours_" + _slug(s.nom) + "_" + _shortDate() + ".pdf";
      pdf.save(filename);
      if (window.OOMGuard) {
        window.OOMGuard.showToast("✓ PDF généré (" + s.groupes.length + " page" + (s.groupes.length > 1 ? "s" : "") + ")", "info");
      }
      return filename;
    } catch(e) {
      console.warn("[SecoursMode] exporterPDF échoué :", e);
      if (window.OOMGuard) window.OOMGuard.showToast("⚠️ Erreur génération PDF : " + e.message, "error");
      return null;
    }
  }

  // 🆕 v1.22.0-fix5 — Calcule la bbox d'une équipe (waypoints + zone polygon + roads
  // sélectionnés) en coordonnées plan. Retourne {x, y, w, h} ou null si rien.
  function _computeTeamBbox(g) {
    const xs = [], ys = [];
    function _add(p) {
      if (p && typeof p.x === "number" && typeof p.y === "number") {
        xs.push(p.x); ys.push(p.y);
      }
    }
    if (g.entree) _add(g.entree);
    if (g.sortie) _add(g.sortie);
    (g.intermediaires || []).forEach(_add);
    (g.itineraireSuggere || []).forEach(_add);
    if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon)) {
      g.zonePolygon.forEach(_add);
    }
    if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds)) {
      const allRoads = ((typeof window.getRoads === "function") ? (window.getRoads() || []) : [])
                       .concat((typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : []);
      g.zoneRoadIds.forEach(function(rid) {
        const road = allRoads.find(function(r) { return r.id === rid; });
        if (road && Array.isArray(road.points)) road.points.forEach(_add);
      });
    }
    if (xs.length === 0) return null;
    const minX = Math.min.apply(null, xs);
    const maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys);
    const maxY = Math.max.apply(null, ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // 🆕 v1.22.0-fix5 — Crop le canvas plan pour la zone de l'équipe + dessine
  // l'overlay (polygone + markers entrée/sortie + intermédiaires + itinéraire).
  // Retourne un nouveau canvas ou null si bbox invalide.
  function _cropCanvasForTeam(fullCanvas, g, hexColor) {
    const bbox = _computeTeamBbox(g);
    if (!bbox || bbox.w < 1 || bbox.h < 1) {
      // Fallback : si pas de bbox utilisable, retourne un mini canvas du plan entier
      return _resizeCanvasFit(fullCanvas, 800, 600);
    }
    // ⚠️ Convention plan → canvas : pas d'inversion Y ici car exporter.js
    // génère son canvas avec y=0 au TOP (orientation image standard).
    // _computeTeamBbox retourne des coords plan (y=0 au top de l'image
    // exportée). Donc bbox.x/y/w/h sont directement utilisables.
    //
    // Padding 15 % autour de la bbox pour respirer
    const pad = Math.max(bbox.w, bbox.h, 100) * 0.15;
    let sx = Math.max(0, bbox.x - pad);
    let sy = Math.max(0, bbox.y - pad);
    let sw = Math.min(fullCanvas.width  - sx, bbox.w + 2 * pad);
    let sh = Math.min(fullCanvas.height - sy, bbox.h + 2 * pad);
    if (sw < 50 || sh < 50) return _resizeCanvasFit(fullCanvas, 800, 600);

    // Canvas de sortie : ratio préservé, max 1000 px de côté
    const maxOut = 1000;
    let outW, outH;
    if (sw >= sh) {
      outW = Math.min(maxOut, sw);
      outH = outW * sh / sw;
    } else {
      outH = Math.min(maxOut, sh);
      outW = outH * sw / sh;
    }
    const out = document.createElement("canvas");
    out.width = Math.round(outW);
    out.height = Math.round(outH);
    const ctx = out.getContext("2d");
    // Background blanc (au cas où l'image source a un alpha)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, out.width, out.height);

    // Helpers pour mapper plan → canvas de sortie
    const sX = out.width  / sw;
    const sY = out.height / sh;
    function _toCanvas(p) {
      return { x: (p.x - sx) * sX, y: (p.y - sy) * sY };
    }
    // RGB pour fill semi-transparent
    const rgb = _hexToRgb(hexColor);

    // 1. Zone polygon (fill 30 % + border 3 px)
    if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
      ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.30)";
      ctx.strokeStyle = hexColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      g.zonePolygon.forEach(function(p, i) {
        const c = _toCanvas(p);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // 2. Zone roads (halo couleur sur chaque road sélectionnée)
    if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds)) {
      const allRoads = ((typeof window.getRoads === "function") ? (window.getRoads() || []) : [])
                       .concat((typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : []);
      ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.55)";
      ctx.lineWidth = 8;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      g.zoneRoadIds.forEach(function(rid) {
        const road = allRoads.find(function(r) { return r.id === rid; });
        if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
        ctx.beginPath();
        road.points.forEach(function(p, i) {
          const c = _toCanvas(p);
          if (i === 0) ctx.moveTo(c.x, c.y);
          else ctx.lineTo(c.x, c.y);
        });
        ctx.stroke();
      });
    }
    // 3. Itinéraire suggéré (dashed couleur équipe, weight 4)
    if (Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2) {
      ctx.strokeStyle = hexColor;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 6]);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      g.itineraireSuggere.forEach(function(p, i) {
        const c = _toCanvas(p);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);   // reset
    }
    // 4. Intermédiaires (cercles couleur équipe + numéro)
    if (Array.isArray(g.intermediaires)) {
      g.intermediaires.forEach(function(w, i) {
        if (!w || typeof w.x !== "number") return;
        const c = _toCanvas(w);
        _drawTeamMarker(ctx, c.x, c.y, 7, "#ffffff", hexColor);
        ctx.fillStyle = "#000";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), c.x + 9, c.y);
      });
    }
    // 5. Entrée (cercle border vert + fill couleur équipe)
    if (g.entree && typeof g.entree.x === "number") {
      const c = _toCanvas(g.entree);
      _drawTeamMarker(ctx, c.x, c.y, 9, "#00cc44", hexColor);
      ctx.fillStyle = "#00cc44";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
      ctx.strokeText("ENTREE", c.x + 12, c.y);
      ctx.fillText("ENTREE", c.x + 12, c.y);
    }
    // 6. Sortie (cercle border rouge OU orange si boucle)
    if (g.sortie && typeof g.sortie.x === "number") {
      const c = _toCanvas(g.sortie);
      const isBoucle = _samePoint(g.entree, g.sortie);
      _drawTeamMarker(ctx, c.x, c.y, isBoucle ? 11 : 9,
                      isBoucle ? "#ffaa00" : "#cc0000", hexColor);
      ctx.fillStyle = isBoucle ? "#ffaa00" : "#cc0000";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
      const lbl = isBoucle ? "BOUCLE" : "SORTIE";
      // Décale l'étiquette pour ne pas chevaucher celle de l'entrée si même point
      const dx = isBoucle ? 14 : 12;
      const dy = isBoucle ? 14 : 0;
      ctx.strokeText(lbl, c.x + dx, c.y + dy);
      ctx.fillText(lbl, c.x + dx, c.y + dy);
    }
    return out;
  }

  // Helper canvas marker : disque couleur équipe + bord coloré (entrée/sortie/etc)
  function _drawTeamMarker(ctx, x, y, r, borderColor, fillColor) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Fallback : redimensionne le canvas plan entier dans maxW × maxH (préserve ratio).
  function _resizeCanvasFit(src, maxW, maxH) {
    const ratio = Math.min(maxW / src.width, maxH / src.height);
    const out = document.createElement("canvas");
    out.width = Math.round(src.width * ratio);
    out.height = Math.round(src.height * ratio);
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0, out.width, out.height);
    return out;
  }

  // Helpers PDF
  function _pdfWrapText(pdf, text, x, y, maxW, lineH) {
    const lines = pdf.splitTextToSize(text, maxW);
    lines.forEach(function(line) { pdf.text(line, x, y); y += lineH; });
    return y;
  }
  function _hexToRgb(hex) {
    const v = hex.replace("#", "");
    return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
  }
  function _fmtPoint(pt) {
    if (!pt || typeof pt.x !== "number") return "(non definie)";
    return "x=" + Math.round(pt.x) + " y=" + Math.round(pt.y) +
           (typeof pt.level === "number" ? " niv=" + pt.level : "");
  }
  function _slug(s) { return String(s || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40); }
  function _shortDate() {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  }

  // ============================================================
  // EXPORT KMZ (depuis v1.22.0 commit 7/9)
  // ============================================================
  // Génère un KMZ avec :
  //  • Polygons KML par équipe (zones polygon ou roads → polylines)
  //  • Placemarks entrée/sortie de chaque équipe
  //  • Folder global "🚨 Secours — <nom scénario>"
  //  • myktamap-extras.json étendu avec secoursPlan (re-import MyKTAMap natif)
  //
  // Pré-requis : calibrage KMZ déjà fait (via modale KMZ Export classique).
  // Sinon → guide l'user vers la modale Export sessions onglet 🌍 KMZ.
  // 🆕 v1.23.0 (KARMA "il faudrai avoir le plan en fond a 60%") : exporterKMZ
  // devient ASYNC pour fetch l'image plan (RUNTIME_ASSETS si dispo, sinon
  // fetch HTTP) avant de la passer en GroundOverlay 60 % opacity. Pattern
  // strictement identique à sessionExporter.js:2906-2930.
  async function exporterKMZ(scenarioId) {
    const s = get(scenarioId || _currentScenarioId);
    if (!s) {
      _toast("⚠️ Scénario introuvable.", "error");
      return null;
    }
    if (!window.KmzExport || typeof window.KmzExport.genererKmz !== "function") {
      _toast("⚠️ Module KmzExport non chargé.", "error");
      return null;
    }
    // 🐛 v1.23.0-fixB (KARMA "georef pas pris en compte dans mode secour
    // malgré que le reglage est bien effectuée") :
    //
    // Le format RÉEL stocké par KmzExport.setCalibration est FLAT :
    //   { pointA: {x, y, lat, lng}, pointB: {x, y, lat, lng} }
    //
    // J'utilisais à tort un format NESTÉ pointA.plan / pointA.gps qui n'a
    // jamais existé → buildTransform recevait undefined × 4 → erreur
    // "Calibrage incomplet" interprétée à tort comme "Calibrage corrompu".
    //
    // Format correct cohérent avec sessionExporter.js:2878-2883 + createConf.js
    // + interface.js:2537. Doc §32.7 CLAUDE.md à corriger (trompeuse).
    const planId = window._currentLoadedPlanId;
    const calib = planId ? window.KmzExport.getCalibration(planId) : null;
    if (!calib || !calib.pointA || !calib.pointB
        || typeof calib.pointA.x !== "number" || typeof calib.pointA.y !== "number"
        || typeof calib.pointA.lat !== "number" || typeof calib.pointA.lng !== "number"
        || typeof calib.pointB.x !== "number" || typeof calib.pointB.y !== "number"
        || typeof calib.pointB.lat !== "number" || typeof calib.pointB.lng !== "number") {
      _toast(
        "⚠️ Plan non calibré (ou calibrage incomplet). Ouvre la modale 💾 Enregistrer session > 🌍 KMZ pour définir 2 points GPS de référence.",
        "warn"
      );
      return null;
    }
    let transform;
    try {
      transform = window.KmzExport.buildTransform(
        { x: calib.pointA.x, y: calib.pointA.y },
        { x: calib.pointB.x, y: calib.pointB.y },
        { lat: calib.pointA.lat, lng: calib.pointA.lng },
        { lat: calib.pointB.lat, lng: calib.pointB.lng }
      );
    } catch(e) {
      _toast("⚠️ Calibrage corrompu : " + e.message, "error");
      return null;
    }
    // 🆕 v1.23.0 (KARMA "rajoute les itineraire de chaque équipe") :
    // Auto-calc des itinéraires manquants avant export. Si une équipe a
    // entrée + sortie définies mais pas encore d'itineraireSuggere calc,
    // on déclenche un Pathfinder en arrière-plan et on attend tous les
    // résultats avant de générer le KMZ → export complet en 1 clic.
    const groupesACalc = (s.groupes || []).filter(function(g) {
      return g.entree && g.sortie && !Array.isArray(g.itineraireSuggere);
    });
    if (groupesACalc.length > 0) {
      _toast("⏳ Calcul auto de " + groupesACalc.length + " itinéraire" +
             (groupesACalc.length > 1 ? "s" : "") + " manquant" +
             (groupesACalc.length > 1 ? "s" : "") + " avant export…", "info");
      // Lance les calculs en parallèle + attend tous résultats
      await Promise.allSettled(groupesACalc.map(function(g) {
        return _recalculerItineraireGroupeAsync(s.id, g.id);
      }));
      // Re-fetch s pour avoir les itineraireSuggere fraîchement écrits
      const sFrais = get(s.id);
      if (sFrais) {
        s.groupes = sFrais.groupes;
      }
    }

    _toast("⏳ Génération KMZ en cours (fetch image plan)…", "info");
    // 🆕 v1.23.0 (KARMA "il faudrai avoir le plan en fond a 60%") : on fetch
    // l'image plan pour la passer en GroundOverlay opacity 60 %. Donne aux
    // équipes de secours le CONTEXTE SPATIAL (puits, galeries, structures
    // sur le fond) en + des zones colorées. Pattern aligné sessionExporter.
    const pc = window.PLAN_CONFIG;
    let imageBlob = null;
    let imageFilename = null;
    if (pc && pc.plan && pc.plan.baseImage) {
      const baseImagePath = pc.plan.baseImage;
      const fullPath = baseImagePath.indexOf("/") >= 0 ? baseImagePath : ("data/" + baseImagePath);
      imageFilename = baseImagePath;
      // Tentative 1 : RUNTIME_ASSETS (cas ZIP local importé)
      if (window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[fullPath]) {
        const asset = window.RUNTIME_ASSETS[fullPath];
        if (asset.file instanceof Blob) {
          imageBlob = asset.file;
        } else if (asset.url) {
          try { const r = await fetch(asset.url); if (r.ok) imageBlob = await r.blob(); } catch(e) {}
        }
      }
      // Tentative 2 : fetch direct (cas plan serveur HTTP)
      if (!imageBlob) {
        try { const r = await fetch(fullPath); if (r.ok) imageBlob = await r.blob(); } catch(e) {}
      }
      if (!imageBlob) {
        console.warn("[SecoursMode] Image plan introuvable → KMZ généré sans GroundOverlay");
        imageFilename = null;
      }
    }

    // On délègue à KmzExport.genererKmz avec :
    //   • GroundOverlay 60 % (le plan en fond pour contexte spatial — v1.23.0)
    //   • data session vides (on injecte nos polygons via secoursPlan extras)
    //   • secoursPlan + secoursPalette dans les extras (KML Folder visible)
    const opts = {
      planName:      (pc && pc.plan && pc.plan.name)    || "Plan",
      planVersion:   (pc && pc.plan && pc.plan.version) || "",
      planAuthor:    (pc && pc.plan && pc.plan.author)  || "",
      imageW:        (pc && pc.plan && pc.plan.imageWidth)  || 1000,
      imageH:        (pc && pc.plan && pc.plan.imageHeight) || 1000,
      transform:     transform,
      imageOpacity:  60,                         // 60 % = lecture sans masquer
      include: {
        image:      !!imageBlob,                  // ✓ si fetch OK
        points:     false, roads: false, zones: false, structures: false,
        jonctions:  false, itineraire: false, dataLayers: false
      },
      levels: null,
      data: { editorPoints: [], roads: [], zones: [] },
      imageBlob:     imageBlob,
      imageFilename: imageFilename,
      iconsToEmbed:  {},
      // 🆕 v1.22.0 — secoursPlan dans les extras (re-import MyKTAMap natif)
      secoursPlan:   s,
      // 🆕 v1.22.0 — injection KML Folder cross-app (Polygons + Placemarks + LineStrings)
      secoursPalette: PALETTE
    };
    Promise.resolve(window.KmzExport.genererKmz(opts)).then(function(blob) {
      if (!blob) {
        if (window.OOMGuard) window.OOMGuard.showToast("⚠️ Génération KMZ échouée.", "error");
        return;
      }
      const filename = "Secours_" + _slug(s.nom) + "_" + _shortDate() + ".kmz";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      if (window.OOMGuard) {
        window.OOMGuard.showToast("✓ KMZ exporté : " + filename, "info");
      }
    }).catch(function(e) {
      console.warn("[SecoursMode] exporterKMZ échoué :", e);
      if (window.OOMGuard) window.OOMGuard.showToast("⚠️ Erreur KMZ : " + e.message, "error");
    });
  }

  // ============================================================
  // UI — MODALE (depuis v1.22.0 commit 2/9)
  // ============================================================

  // Ouvre la modale. Si scenarioId fourni → mode édition direct.
  // Sinon → vue liste (avec bouton "Nouveau scénario").
  function ouvrir(scenarioId) {
    if (_modal) { fermer(); }
    // Reload depuis storage au cas où d'autres tabs auraient modifié
    _loadScenarios();
    if (scenarioId && get(scenarioId)) {
      _currentScenarioId = scenarioId;
    }
    _modal = document.createElement("div");
    _modal.id = "kta-secours-modal";
    _modal.className = "kta-readme-modal-overlay";
    _modal.innerHTML = _renderModalHTML();
    document.documentElement.appendChild(_modal);
    _bindModalHandlers();
    // Si scenarioId fourni, render direct l'éditeur. Sinon liste.
    if (_currentScenarioId) {
      _switchView("edit");
    } else {
      _switchView("list");
    }
  }

  function fermer() {
    document.removeEventListener("keydown", _onKeyDown);
    if (_modal && _modal.parentNode) _modal.parentNode.removeChild(_modal);
    _modal = null;
    clearOverlay();
    _currentScenarioId = null;
    // 🆕 v1.23.0 Feature D — Cleanup heatmap si encore active (l'user a
    // fermé la modale sans toggler off)
    if (_secoursHeatmapActive && window.MyKTAMapHeatmap
        && typeof window.MyKTAMapHeatmap.effacer === "function") {
      try { window.MyKTAMapHeatmap.effacer(); } catch(e) {}
      _secoursHeatmapActive = false;
    }
  }

  function _onKeyDown(e) {
    if (e.key === "Escape" && _modal) fermer();
  }

  // Squelette HTML — header + corps (rempli dynamiquement par _switchView)
  function _renderModalHTML() {
    return '<div class="kta-readme-modal-boite kta-secours-modal-boite">' +
             '<div class="kta-readme-modal-header">' +
               '<span class="kta-readme-modal-titre">🚨 Mode Secours — Plans de recherche</span>' +
               '<button class="kta-panneau-close" id="kta-secours-close" type="button" aria-label="Fermer">&times;</button>' +
             '</div>' +
             '<div class="kta-readme-modal-corps kta-secours-corps" id="kta-secours-corps">' +
               '<!-- rempli dynamiquement par _switchView -->' +
             '</div>' +
           '</div>';
  }

  function _bindModalHandlers() {
    document.addEventListener("keydown", _onKeyDown);
    const closeBtn = document.getElementById("kta-secours-close");
    if (closeBtn) closeBtn.addEventListener("click", fermer);
    _modal.addEventListener("click", function(e) {
      if (e.target === _modal) fermer();
    });
  }

  // Bascule entre les 3 vues : "list" (scénarios) | "create" (stepper) | "edit" (free-form)
  function _switchView(view) {
    const corps = document.getElementById("kta-secours-corps");
    if (!corps) return;
    if (view === "list")   corps.innerHTML = _renderListView();
    if (view === "create") corps.innerHTML = _renderCreateView();
    if (view === "edit")   corps.innerHTML = _renderEditView();
    _bindViewHandlers(view);
  }

  // ============================================================
  // VUE LISTE — scénarios existants + bouton "Nouveau"
  // ============================================================
  function _renderListView() {
    let html = '<div class="kta-secours-list-header">' +
                 '<p class="kta-secours-hint">' +
                   'Définis et partage des <strong>plans de secours</strong> pour ce plan : ' +
                   'assigne des <strong>équipes</strong> à des <strong>zones de recherche</strong> ' +
                   'précises, avec entrées/sorties, itinéraires suggérés et durées estimées. ' +
                   'Au retour terrain, les équipes peuvent rapporter leurs observations.' +
                 '</p>' +
                 '<button class="kta-btn kta-btn-primary" data-action="new-scenario">' +
                   '➕ Nouveau scénario' +
                 '</button>' +
               '</div>';
    if (_scenarios.length === 0) {
      html += '<div class="kta-secours-empty">' +
                '<div class="kta-secours-empty-icon">🚨</div>' +
                '<p>Aucun scénario de secours sauvegardé pour ce plan.</p>' +
                '<p class="kta-secours-empty-hint">Crée ton premier scénario via le bouton ci-dessus.</p>' +
              '</div>';
    } else {
      html += '<div class="kta-secours-list">';
      // Tri par updatedAt DESC (le plus récent en haut)
      const sorted = _scenarios.slice().sort(function(a, b) {
        return (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0);
      });
      sorted.forEach(function(s) {
        const nbGroupes = (s.groupes || []).length;
        const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString("fr-FR") : "?";
        html += '<div class="kta-secours-list-row" data-id="' + _escAttr(s.id) + '">' +
                  '<div class="kta-secours-list-info">' +
                    '<div class="kta-secours-list-nom">' + _escHtml(s.nom) + '</div>' +
                    '<div class="kta-secours-list-meta">' +
                      '🚨 ' + nbGroupes + ' équipe' + (nbGroupes > 1 ? 's' : '') +
                      ' · 📅 ' + date +
                    '</div>' +
                  '</div>' +
                  '<div class="kta-secours-list-actions">' +
                    '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="open-scenario" data-id="' + _escAttr(s.id) + '" title="Ouvrir">✏️ Ouvrir</button>' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="dup-scenario" data-id="' + _escAttr(s.id) + '" title="Dupliquer">🗐</button>' +
                    '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="del-scenario" data-id="' + _escAttr(s.id) + '" title="Supprimer">🗑️</button>' +
                  '</div>' +
                '</div>';
      });
      html += '</div>';
      if (_scenarios.length >= MAX_SCENARIOS) {
        html += '<p class="kta-secours-hint" style="margin-top:12px; color:#ff8c00;">' +
                  '⚠️ Limite atteinte (' + MAX_SCENARIOS + ' scénarios max par plan). ' +
                  'Le prochain "Nouveau" supprimera automatiquement le plus ancien.' +
                '</p>';
      }
    }
    return html;
  }

  // ============================================================
  // VUE CRÉATION — stepper léger "Nom + premières équipes"
  // ============================================================
  // Pour le MVP Phase 1, le stepper est volontairement SIMPLIFIÉ :
  // étape 1 = nom + notes contexte + ajouter N équipes minimales (nom seul).
  // Les zones / entrées-sorties / itinéraires sont définis ensuite dans la
  // vue Edit (mode free-form). Ça évite un stepper trop lourd qui demande
  // l'interaction map (zones polygon/roads) — ces interactions sont mieux
  // placées dans l'éditeur libre.
  function _renderCreateView() {
    return '<div class="kta-secours-create-form">' +
             '<h3 class="kta-secours-form-titre">🚨 Nouveau scénario de secours</h3>' +
             '<div class="kta-secours-form-row">' +
               '<label for="kta-sec-create-nom">Nom du scénario *</label>' +
               '<input type="text" id="kta-sec-create-nom" placeholder="ex: Recherche Marc — 15/06/2026" maxlength="80">' +
             '</div>' +
             '<div class="kta-secours-form-row">' +
               '<label for="kta-sec-create-notes">Notes de contexte (optionnel)</label>' +
               '<textarea id="kta-sec-create-notes" rows="3" maxlength="500" placeholder="ex: Marc parti vers 14h pour vérifier galerie Est, équipé d&apos;une lampe + casque, dernière nouvelle 15h30 SMS &quot;arrive&quot;…"></textarea>' +
             '</div>' +
             '<div class="kta-secours-form-row">' +
               '<label for="kta-sec-create-incident">Heure d\'incident (optionnel)</label>' +
               '<input type="datetime-local" id="kta-sec-create-incident">' +
             '</div>' +
             '<div class="kta-secours-form-hint">' +
               '💡 Tu pourras ensuite ajouter les équipes, définir leurs zones de recherche, ' +
               'leurs points d\'entrée/sortie, et exporter le plan en PDF ou KMZ.' +
             '</div>' +
             '<div class="kta-secours-form-actions">' +
               '<button class="kta-btn kta-btn-ghost" data-action="cancel-create">← Annuler</button>' +
               '<button class="kta-btn kta-btn-primary" data-action="confirm-create">✓ Créer et continuer</button>' +
             '</div>' +
           '</div>';
  }

  // ============================================================
  // VUE ÉDITION — free-form editor (3 sections : Contexte / Équipes / Export)
  // ============================================================
  function _renderEditView() {
    const s = get(_currentScenarioId);
    if (!s) {
      return '<div class="kta-secours-error">' +
               '<p>Scénario introuvable. Retour à la liste…</p>' +
             '</div>';
    }
    const incidentStr = s.context && s.context.incidentAt
                        ? new Date(s.context.incidentAt).toISOString().slice(0, 16)
                        : "";
    let html = '<div class="kta-secours-edit-header">' +
                 '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="back-to-list">← Liste</button>' +
                 '<input type="text" class="kta-secours-edit-titre" id="kta-sec-edit-nom" value="' + _escAttr(s.nom) + '" maxlength="80">' +
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="toggle-overlay" id="kta-sec-toggle-overlay" title="Afficher / masquer les zones sur la carte">' +
                   (_overlayLayer ? '🗺️ Masquer' : '🗺️ Voir sur carte') +
                 '</button>' +
               '</div>';

    // Section 1 — Contexte
    html += '<details class="kta-secours-section" open>' +
              '<summary class="kta-secours-section-titre">📝 Contexte de l\'incident</summary>' +
              '<div class="kta-secours-section-body">' +
                '<div class="kta-secours-form-row">' +
                  '<label for="kta-sec-edit-incident">Heure d\'incident</label>' +
                  '<input type="datetime-local" id="kta-sec-edit-incident" value="' + _escAttr(incidentStr) + '">' +
                '</div>' +
                '<div class="kta-secours-form-row">' +
                  '<label for="kta-sec-edit-notes">Notes</label>' +
                  '<textarea id="kta-sec-edit-notes" rows="3" maxlength="500">' + _escHtml(s.context.notes || "") + '</textarea>' +
                '</div>' +
                // 🆕 v1.23.0 Phase 2 / Feature C — Affichage du lastKnownPoint
                // + zoneIncertitude si pré-rempli depuis Lost Mode.
                _renderContextImportedBlock(s) +
                // 🆕 v1.23.0 Phase 2 / Feature D — Toggle Heatmap pour visualiser
                // les zones probables d'activité (timeline tracker + annotations).
                _renderHeatmapToolBlock() +
              '</div>' +
            '</details>';

    // Section 2 — Équipes (liste + add)
    html += '<details class="kta-secours-section" open>' +
              '<summary class="kta-secours-section-titre">🚨 Équipes (' + s.groupes.length + ')</summary>' +
              '<div class="kta-secours-section-body">' +
                '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="add-groupe">➕ Ajouter une équipe</button>' +
                '<div class="kta-secours-groupes-list" style="margin-top:10px;">' +
                  _renderGroupesList(s) +
                '</div>' +
              '</div>' +
            '</details>';

    // Section 3 — Export
    html += '<details class="kta-secours-section">' +
              '<summary class="kta-secours-section-titre">📤 Exporter ce scénario</summary>' +
              '<div class="kta-secours-section-body">' +
                '<p class="kta-secours-hint">Partage le plan de secours avec les équipes externes (GRIMP, Pompiers, etc.).</p>' +
                '<div class="kta-secours-export-actions">' +
                  '<button class="kta-btn kta-btn-primary" data-action="export-pdf">📄 Export PDF (1 page/équipe)</button>' +
                  '<button class="kta-btn kta-btn-primary" data-action="export-kmz">🌍 Export KMZ géolocalisé</button>' +
                '</div>' +
              '</div>' +
            '</details>';

    return html;
  }

  // Rendu de la liste des équipes (utilisé par _renderEditView)
  function _renderGroupesList(scenario) {
    if (!scenario.groupes || scenario.groupes.length === 0) {
      return '<div class="kta-secours-empty-small">Aucune équipe pour ce scénario. Clique "Ajouter une équipe" ci-dessus.</div>';
    }
    let html = '';
    scenario.groupes.forEach(function(g) {
      const couleur = PALETTE[g.couleurIdx % PALETTE.length];
      const distFmt = g.distanceM
                      ? (typeof window.formatDistance === "function"
                         ? window.formatDistance(g.distanceM, 0)
                         : Math.round(g.distanceM) + " m")
                      : "—";
      const dureeFmt = g.dureeEstimeeMin ? Math.round(g.dureeEstimeeMin) + " min" : "—";
      const zoneFmt = g.zoneType === "polygon" ? "⬛ Polygone (" + (g.zonePolygon ? g.zonePolygon.length : 0) + " sommets)"
                    : g.zoneType === "roads"   ? "🛣️ " + (g.zoneRoadIds ? g.zoneRoadIds.length : 0) + " tracés"
                    : "Non définie";
      html += '<div class="kta-secours-groupe-card" data-gid="' + _escAttr(g.id) + '" style="border-left:4px solid ' + couleur.hex + ';">' +
                '<div class="kta-secours-groupe-header">' +
                  '<span class="kta-secours-groupe-swatch" style="background:' + couleur.hex + ';"></span>' +
                  '<input type="text" class="kta-secours-groupe-nom" data-action="rename-groupe" data-gid="' + _escAttr(g.id) + '" value="' + _escAttr(g.nom) + '" maxlength="40">' +
                  '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="del-groupe" data-gid="' + _escAttr(g.id) + '" title="Supprimer">🗑️</button>' +
                '</div>' +
                '<div class="kta-secours-groupe-body">' +
                  '<div class="kta-secours-groupe-row">' +
                    '<label>👥 Membres</label>' +
                    '<input type="text" data-action="edit-membres" data-gid="' + _escAttr(g.id) + '" value="' + _escAttr((g.membres || []).join(", ")) + '" placeholder="ex: Léa, Tom (séparés par virgule)" maxlength="200">' +
                  '</div>' +
                  '<div class="kta-secours-groupe-row">' +
                    '<label>🎨 Couleur</label>' +
                    '<select data-action="change-couleur" data-gid="' + _escAttr(g.id) + '">' +
                      PALETTE.map(function(c, i) {
                        return '<option value="' + i + '"' + (i === g.couleurIdx ? ' selected' : '') + '>' +
                               c.nom + ' (' + c.hex + ')</option>';
                      }).join('') +
                    '</select>' +
                  '</div>' +
                  '<div class="kta-secours-groupe-stats">' +
                    '<span>📍 Zone : <strong>' + zoneFmt + '</strong></span>' +
                    '<span>📏 Distance : <strong>' + distFmt + '</strong></span>' +
                    '<span>⏱️ Durée estimée : <strong>' + dureeFmt + '</strong></span>' +
                  '</div>' +
                  // 🆕 v1.22.0-fix2 : section Parcours avec entrée + intermédiaires[] + sortie
                  _renderParcoursSection(g) +
                  '<div class="kta-secours-groupe-actions">' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="def-zone" data-gid="' + _escAttr(g.id) + '">⬛ Définir zone</button>' +
                    // 🆕 v1.22.0-fix4 (KARMA "on peut avoir un bouton tous les
                    // points dans la zone de recherche") — ajoute tous les POI
                    // dans la zone comme intermédiaires triés par proximité.
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="add-pois-zone" data-gid="' + _escAttr(g.id) + '" title="Ajoute tous les POI de la zone comme étapes (triés par proximité de l\'entrée)">✨ POI de la zone</button>' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="calc-iti" data-gid="' + _escAttr(g.id) + '">🗺️ Calc. itinéraire</button>' +
                  '</div>' +
                '</div>' +
              '</div>';
    });
    return html;
  }

  // 🆕 v1.23.0 Phase 2 / Feature D — Bloc outils d'analyse heatmap
  // dans la section Contexte de la modale Mode Secours. Permet à l'user
  // d'afficher la heatmap d'activité (timeline tracker + annotations) pour
  // visualiser les zones probables où le disparu est passé → aide à
  // dessiner les zones de recherche pertinentes pour les équipes.
  //
  // ⚠️ La heatmap utilise les sources locales (= ce qui est dans CE
  // device). Cas d'usage 1 : le disparu utilisait MyKTAMap et a exporté
  // sa session avec timeline → le PC secours importe la session, sa
  // timeline est dispo. Cas d'usage 2 : le PC secours a déjà cartographié
  // le réseau (tracker actif lors de ses sorties précédentes) → la heatmap
  // montre les zones bien connues vs les zones blanches (sous-explorées).
  let _secoursHeatmapActive = false;

  function _renderHeatmapToolBlock() {
    // Skip si le module Heatmap n'est pas chargé (rétro-compat)
    if (!window.MyKTAMapHeatmap || typeof window.MyKTAMapHeatmap.afficher !== "function") {
      return "";
    }
    const isActive = _secoursHeatmapActive && window.MyKTAMapHeatmap.isVisible &&
                     window.MyKTAMapHeatmap.isVisible();
    return '<div class="kta-secours-tool-block">' +
             '<div class="kta-secours-tool-block-titre">🔍 Outils d\'analyse</div>' +
             '<div class="kta-secours-tool-block-desc">' +
               'La heatmap visualise les zones où l\'activité a été enregistrée ' +
               '(timeline tracker, points, tracés). Utile pour identifier les ' +
               'zones probables à fouiller en priorité.' +
             '</div>' +
             '<div class="kta-secours-tool-block-actions">' +
               '<button class="kta-btn kta-btn-' + (isActive ? "primary" : "secondary") +
                 ' kta-btn-sm" data-action="toggle-heatmap-secours">' +
                 (isActive ? "🔥 Masquer la heatmap" : "🔥 Afficher la heatmap d'activité") +
               '</button>' +
               (isActive
                 ? '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="config-heatmap-secours" ' +
                   'title="Ouvre la modale Heatmap classique pour ajuster sources/rayon/intensité">' +
                   '⚙️ Régler' +
                 '</button>'
                 : '') +
             '</div>' +
           '</div>';
  }

  // 🆕 v1.23.0 Phase 2 / Feature C — Bloc lecture seule lastKnownPoint +
  // zoneIncertitude si pré-rempli depuis Lost Mode. Boutons "Recentrer carte"
  // + "✕ Retirer" si l'user veut nettoyer.
  function _renderContextImportedBlock(s) {
    const c = s.context || {};
    if (!c.lastKnownPoint && !c.zoneIncertitude) return "";
    let html = '<div class="kta-secours-context-imported">';
    html += '<div class="kta-secours-context-imported-titre">⛑️ Données importées depuis Lost Mode</div>';
    if (c.lastKnownPoint) {
      const lp = c.lastKnownPoint;
      const lbl = lp.label || ("x=" + Math.round(lp.x) + " y=" + Math.round(lp.y));
      html += '<div class="kta-secours-context-imported-row">' +
                '<span>📍 Dernière position connue :</span> <strong>' + _escHtml(lbl) + '</strong>' +
                (typeof lp.level === "number" && window.APP_CONFIG && window.APP_CONFIG.multiLevel
                  ? ' <span class="kta-secours-parcours-lvl">(niv ' + lp.level + ')</span>'
                  : '') +
              '</div>';
    }
    if (c.zoneIncertitude) {
      html += '<div class="kta-secours-context-imported-row">' +
                '<span>⭕ Zone d\'incertitude :</span> <strong>rayon ' +
                Math.round(c.zoneIncertitude.radiusMeters || 0) + ' m</strong>' +
              '</div>';
    }
    html += '<div class="kta-secours-context-imported-actions">' +
              '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="recentrer-lostpos">🎯 Recentrer la carte</button>' +
              '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="clear-lostpos" title="Retire les données Lost Mode importées (le scénario reste, seules les infos contextuelles sont effacées)">✕ Retirer</button>' +
            '</div>';
    html += '</div>';
    return html;
  }

  // 🆕 v1.22.0-fix2 — Section Parcours d'une équipe (entree + intermediaires + sortie)
  function _renderParcoursSection(g) {
    let html = '<div class="kta-secours-parcours">';
    html += '<div class="kta-secours-parcours-titre">🗺️ Parcours :</div>';
    html += '<div class="kta-secours-parcours-list">';
    // Entrée
    html += _renderWaypointRow(g, "entree", g.entree, null, "📍", "Entrée");
    // Intermédiaires
    (g.intermediaires || []).forEach(function(w, i) {
      html += _renderWaypointRow(g, "intermediaire", w, i, "▾", "Étape " + (i + 1));
    });
    // Bouton "Ajouter étape intermédiaire"
    html += '<button class="kta-btn kta-btn-ghost kta-btn-sm kta-secours-parcours-add"' +
            ' data-action="add-intermediaire" data-gid="' + _escAttr(g.id) + '">' +
            '➕ Ajouter une étape intermédiaire</button>';
    // Sortie
    html += _renderWaypointRow(g, "sortie", g.sortie, null, "🚪", "Sortie");
    // Hint si entrée === sortie (boucle)
    if (g.entree && g.sortie && _samePoint(g.entree, g.sortie)) {
      html += '<div class="kta-secours-parcours-hint">↻ <em>Boucle détectée — l\'équipe entre et sort par le même point.</em></div>';
    }
    html += '</div>';
    html += '</div>';
    return html;
  }

  function _renderWaypointRow(g, role, w, idx, emoji, defaultLabel) {
    const gid = _escAttr(g.id);
    const isInter = (role === "intermediaire");
    const idxAttr = isInter ? ' data-idx="' + idx + '"' : '';
    let label = "";
    if (w) {
      label = w.label || ("x=" + Math.round(w.x) + " y=" + Math.round(w.y));
      if (typeof w.level === "number" && window.APP_CONFIG && window.APP_CONFIG.multiLevel) {
        label += " <span class='kta-secours-parcours-lvl'>(niv " + w.level + ")</span>";
      }
    } else {
      label = '<em class="kta-secours-parcours-todo">non défini</em>';
    }
    let html = '<div class="kta-secours-parcours-row" data-role="' + role + '"' + idxAttr + '>' +
                 '<span class="kta-secours-parcours-emoji">' + emoji + '</span>' +
                 '<span class="kta-secours-parcours-label">' +
                   '<strong>' + defaultLabel + '</strong> : ' + label +
                 '</span>' +
                 '<span class="kta-secours-parcours-btns">' +
                   '<button class="kta-btn kta-btn-ghost kta-btn-xs" data-action="pick-waypoint"' +
                   ' data-gid="' + gid + '" data-role="' + role + '"' + idxAttr +
                   ' title="Choisir un point (recherche ou clic carte)">' +
                   (w ? '✏️' : '📍') + '</button>';
    if (isInter || w) {
      html += '<button class="kta-btn kta-btn-ghost kta-btn-xs" data-action="clear-waypoint"' +
              ' data-gid="' + gid + '" data-role="' + role + '"' + idxAttr +
              ' title="' + (isInter ? "Retirer cette étape" : "Effacer") + '">🗑️</button>';
    }
    html += '</span></div>';
    return html;
  }

  function _samePoint(a, b) {
    if (!a || !b) return false;
    // Match par pointId si présent, sinon par coords avec tolérance 0.5 px
    if (a.pointId && b.pointId) return a.pointId === b.pointId;
    return Math.abs((a.x || 0) - (b.x || 0)) < 0.5
        && Math.abs((a.y || 0) - (b.y || 0)) < 0.5;
  }

  // 🆕 v1.22.0-fix4 — Helpers géométrie pour "POI dans la zone"
  // Ray-casting (cohérent avec pathfinder.js > _pointInPolygon)
  function _pointInPolygon(p, poly) {
    if (!Array.isArray(poly) || poly.length < 3) return false;
    let inside = false;
    const x = p.x, y = p.y;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) &&
                        (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Distance d'un point à un segment AB (en pixels)
  function _distPointSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) {
      // Segment dégénéré = un point
      const ddx = p.x - a.x, ddy = p.y - a.y;
      return Math.sqrt(ddx * ddx + ddy * ddy);
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const ddx = p.x - cx, ddy = p.y - cy;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  // Distance min d'un point à une polyline (toutes ses sections)
  function _distPointPolyline(p, points) {
    if (!Array.isArray(points) || points.length === 0) return Infinity;
    if (points.length === 1) {
      const dx = p.x - points[0].x, dy = p.y - points[0].y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    let minD = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const d = _distPointSegment(p, points[i], points[i + 1]);
      if (d < minD) minD = d;
    }
    return minD;
  }

  // ============================================================
  // HANDLERS PAR VUE
  // ============================================================
  function _bindViewHandlers(view) {
    const corps = document.getElementById("kta-secours-corps");
    if (!corps) return;

    if (view === "list") {
      // Bouton "Nouveau scénario"
      corps.querySelectorAll('[data-action="new-scenario"]').forEach(function(btn) {
        btn.addEventListener("click", function() { _switchView("create"); });
      });
      // Ouvrir un scénario
      corps.querySelectorAll('[data-action="open-scenario"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _currentScenarioId = btn.getAttribute("data-id");
          _switchView("edit");
        });
      });
      // Dupliquer
      corps.querySelectorAll('[data-action="dup-scenario"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const newS = duplicateScenario(btn.getAttribute("data-id"));
          if (newS) _switchView("list");
        });
      });
      // Supprimer
      corps.querySelectorAll('[data-action="del-scenario"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const id = btn.getAttribute("data-id");
          const s = get(id);
          if (!s) return;
          if (window.confirm("Supprimer le scénario « " + s.nom + " » ? Cette action est irréversible.")) {
            deleteScenario(id);
            _switchView("list");
          }
        });
      });
    }

    if (view === "create") {
      corps.querySelectorAll('[data-action="cancel-create"]').forEach(function(btn) {
        btn.addEventListener("click", function() { _switchView("list"); });
      });
      corps.querySelectorAll('[data-action="confirm-create"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const nom = (document.getElementById("kta-sec-create-nom") || {}).value || "";
          const notes = (document.getElementById("kta-sec-create-notes") || {}).value || "";
          const incident = (document.getElementById("kta-sec-create-incident") || {}).value || "";
          const s = createScenario(nom);
          updateScenario(s.id, {
            context: {
              notes:      notes,
              incidentAt: incident ? new Date(incident).toISOString() : null
            }
          });
          _currentScenarioId = s.id;
          _switchView("edit");
        });
      });
    }

    if (view === "edit") {
      const s = get(_currentScenarioId);
      if (!s) { _switchView("list"); return; }
      // Back to list
      corps.querySelectorAll('[data-action="back-to-list"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          clearOverlay();
          _currentScenarioId = null;
          _switchView("list");
        });
      });
      // Toggle overlay carte — masque la modale pour voir le rendu Leaflet
      // (sinon la modale plein écran z-index 99999 cache toute la carte).
      // Floater "← Retour modale" pour réouvrir sans repasser par la sidebar.
      corps.querySelectorAll('[data-action="toggle-overlay"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (_overlayLayer) {
            // Toggle OFF : retire overlay + restore modale + retire floater
            clearOverlay();
            if (_modal) _modal.style.display = "";
            _removeOverlayFloater();
            btn.textContent = "🗺️ Voir sur carte";
          } else {
            // Toggle ON : masque modale + render overlay + affiche floater retour
            renderOverlay(_currentScenarioId);
            if (_modal) _modal.style.display = "none";
            _showOverlayFloater();
            btn.textContent = "🗺️ Masquer";
          }
        });
      });
      // Rename scénario (input header) — save au blur
      const nomInput = document.getElementById("kta-sec-edit-nom");
      if (nomInput) {
        nomInput.addEventListener("blur", function() {
          updateScenario(s.id, { nom: nomInput.value });
        });
      }
      // Context fields — save au change
      const incidentInput = document.getElementById("kta-sec-edit-incident");
      if (incidentInput) {
        incidentInput.addEventListener("change", function() {
          updateScenario(s.id, {
            context: { incidentAt: incidentInput.value ? new Date(incidentInput.value).toISOString() : null }
          });
        });
      }
      const notesInput = document.getElementById("kta-sec-edit-notes");
      if (notesInput) {
        notesInput.addEventListener("blur", function() {
          updateScenario(s.id, { context: { notes: notesInput.value } });
        });
      }
      // 🆕 v1.23.0 Feature C — Recentrer carte sur lastKnownPoint
      corps.querySelectorAll('[data-action="recentrer-lostpos"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const lp = s.context && s.context.lastKnownPoint;
          if (!lp || typeof lp.x !== "number" || !window.map) return;
          if (!_overlayLayer) {
            renderOverlay(_currentScenarioId);
            if (_modal) _modal.style.display = "none";
            _showOverlayFloater();
          }
          window.map.setView(_planToLatLng(lp), Math.max(0, window.map.getZoom()), { animate: true });
        });
      });
      // 🆕 v1.23.0 Feature C — Retirer les données Lost Mode importées
      corps.querySelectorAll('[data-action="clear-lostpos"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (!window.confirm("Retirer la dernière position connue + zone d'incertitude du contexte ? Le scénario et ses équipes restent intacts.")) return;
          updateScenario(s.id, {
            context: { lastKnownPoint: null, zoneIncertitude: null }
          });
          _switchView("edit");
        });
      });
      // 🆕 v1.23.0 Feature D — Toggle heatmap d'activité Mode Secours
      corps.querySelectorAll('[data-action="toggle-heatmap-secours"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (!window.MyKTAMapHeatmap) { _toast("⚠️ Module Heatmap indisponible.", "error"); return; }
          if (_secoursHeatmapActive && window.MyKTAMapHeatmap.isVisible()) {
            window.MyKTAMapHeatmap.effacer();
            _secoursHeatmapActive = false;
            _toast("🔥 Heatmap masquée.", "info");
          } else {
            // Active overlay si pas déjà actif (sinon la modale cache tout)
            if (!_overlayLayer) {
              renderOverlay(_currentScenarioId);
              if (_modal) _modal.style.display = "none";
              _showOverlayFloater();
            }
            // Affiche la heatmap avec toutes les sources principales activées
            // (tracker timeline = principal indice "où le disparu est passé")
            try {
              window.MyKTAMapHeatmap.afficher({
                srcTracker:    true,
                srcEditor:     true,
                srcRoads:      true,
                srcZones:      false,
                srcStructures: false,
                srcDataLayers: false,
                radius:        40,
                intensity:     1.0
              });
              _secoursHeatmapActive = true;
              _toast("🔥 Heatmap affichée — Bouton ⚙️ Régler pour ajuster sources/intensité.", "info");
            } catch(e) {
              console.warn("[SecoursMode] Heatmap échec :", e);
              _toast("⚠️ Erreur heatmap : " + e.message, "error");
            }
          }
          _switchView("edit");   // re-render pour update label bouton
        });
      });
      // 🆕 v1.23.0 Feature D — Ouvre la modale Heatmap classique pour réglages avancés
      corps.querySelectorAll('[data-action="config-heatmap-secours"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (!window.MyKTAMapHeatmap || typeof window.MyKTAMapHeatmap.ouvrirModale !== "function") {
            _toast("⚠️ Modale Heatmap indisponible.", "error");
            return;
          }
          // Ferme la modale Mode Secours temporairement (sinon stack z-index)
          if (_modal) _modal.style.display = "none";
          window.MyKTAMapHeatmap.ouvrirModale();
        });
      });
      // Ajouter équipe
      corps.querySelectorAll('[data-action="add-groupe"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          addGroupe(s.id, null);   // nom auto via PALETTE
          _switchView("edit");      // re-render
        });
      });
      // Rename groupe
      corps.querySelectorAll('[data-action="rename-groupe"]').forEach(function(inp) {
        inp.addEventListener("blur", function() {
          updateGroupe(s.id, inp.getAttribute("data-gid"), { nom: inp.value });
        });
      });
      // Edit membres
      corps.querySelectorAll('[data-action="edit-membres"]').forEach(function(inp) {
        inp.addEventListener("blur", function() {
          const arr = inp.value.split(",").map(function(x) { return x.trim(); }).filter(Boolean);
          updateGroupe(s.id, inp.getAttribute("data-gid"), { membres: arr });
        });
      });
      // Change couleur
      corps.querySelectorAll('[data-action="change-couleur"]').forEach(function(sel) {
        sel.addEventListener("change", function() {
          updateGroupe(s.id, sel.getAttribute("data-gid"), { couleurIdx: parseInt(sel.value, 10) });
          _switchView("edit");      // re-render pour update du swatch
        });
      });
      // Delete groupe
      corps.querySelectorAll('[data-action="del-groupe"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const gid = btn.getAttribute("data-gid");
          const g = s.groupes.find(function(x) { return x.id === gid; });
          if (!g) return;
          if (window.confirm("Supprimer l'équipe « " + g.nom + " » ?")) {
            removeGroupe(s.id, gid);
            _switchView("edit");
          }
        });
      });
      // 🆕 v1.22.0-fix2 : pick waypoint (entrée / intermédiaire / sortie)
      // via mini-modale Recherche autocomplete + clic carte
      corps.querySelectorAll('[data-action="pick-waypoint"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const gid = btn.getAttribute("data-gid");
          const role = btn.getAttribute("data-role");
          const idxAttr = btn.getAttribute("data-idx");
          const idx = (idxAttr !== null && idxAttr !== "") ? parseInt(idxAttr, 10) : null;
          _ouvrirChoixWaypoint(gid, role, idx);
        });
      });
      // Add intermédiaire (à la fin de la liste)
      corps.querySelectorAll('[data-action="add-intermediaire"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const gid = btn.getAttribute("data-gid");
          const grp = s.groupes.find(function(x) { return x.id === gid; });
          if (!grp) return;
          const newIdx = (grp.intermediaires || []).length;
          // Ouvre direct le picker pour le nouveau slot
          _ouvrirChoixWaypoint(gid, "intermediaire", newIdx);
        });
      });
      // Clear waypoint
      corps.querySelectorAll('[data-action="clear-waypoint"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const gid = btn.getAttribute("data-gid");
          const role = btn.getAttribute("data-role");
          const idxAttr = btn.getAttribute("data-idx");
          const idx = (idxAttr !== null && idxAttr !== "") ? parseInt(idxAttr, 10) : null;
          _clearWaypoint(gid, role, idx);
        });
      });
      // Définir zone (choix polygon | roads via mini-prompt)
      corps.querySelectorAll('[data-action="def-zone"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _ouvrirChoixZoneMode(btn.getAttribute("data-gid"));
        });
      });
      // 🆕 v1.22.0-fix4 — POI de la zone (ajoute tous les POI comme étapes)
      corps.querySelectorAll('[data-action="add-pois-zone"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _ajouterPoisDansZone(s.id, btn.getAttribute("data-gid"));
        });
      });
      // Calc itinéraire (commit 4)
      corps.querySelectorAll('[data-action="calc-iti"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _recalculerItineraireGroupe(s.id, btn.getAttribute("data-gid"));
        });
      });
      // Export PDF — async depuis fix5 (génère canvas plan + crop par équipe)
      corps.querySelectorAll('[data-action="export-pdf"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          Promise.resolve(exporterPDF(s.id)).catch(function(e) {
            console.warn("[SecoursMode] exporterPDF rejected :", e);
            _toast("⚠️ Erreur PDF : " + (e.message || e), "error");
          });
        });
      });
      // Export KMZ
      corps.querySelectorAll('[data-action="export-kmz"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          // 🆕 v1.23.0 — exporterKMZ est async (fetch plan image) — catch les rejets
          Promise.resolve(exporterKMZ(s.id)).catch(function(e) {
            console.warn("[SecoursMode] exporterKMZ rejected :", e);
            _toast("⚠️ Erreur KMZ : " + (e.message || e), "error");
          });
        });
      });
    }
  }

  // ============================================================
  // MODES INTERACTIFS MAP (depuis v1.22.0 commit 3/9)
  // ============================================================
  // Pattern : (1) cache la modale (display:none), (2) ajoute floater compact
  // en bas de l'écran avec instruction + bouton Annuler/Terminer, (3) ajoute
  // listener map.on("click"), (4) à la complétion : restore modale + re-bind
  // + cleanup listener. Inspiré du pattern itinéraire avoid-click mode.

  let _activeMapMode = null;     // "point" | "polygon" | "roads" | null
  let _mapModeCtx = null;        // { groupeId, role?, points?, roadIds?, layer? }

  // 🆕 v1.22.0-fix2 — étendu pour supporter waypoints intermédiaires
  // role ∈ "entree" | "sortie" | "intermediaire"
  // idx = index si role === "intermediaire" (null pour entree/sortie)
  function _startDefiningPoint(groupeId, role, idx) {
    if (_activeMapMode) _cancelMapMode();
    if (!window.map) return;
    _activeMapMode = "point";
    _mapModeCtx = { groupeId: groupeId, role: role, idx: idx, allPoints: [] };
    _hideModalForMap();
    const lbl = role === "entree" ? "ENTRÉE"
              : role === "sortie" ? "SORTIE"
              : "ÉTAPE " + ((idx == null ? 0 : idx) + 1);
    _showFloater(
      "📍 Clique sur la carte pour définir <strong>" + lbl + "</strong> de l'équipe" +
      "<br><span style=\"font-size:11px; opacity:0.85;\">💡 Astuce : snap auto au POI le plus proche dans un rayon de 30 px.</span>",
      [{ label: "Annuler", action: "cancel" }]
    );
    // 🐛 v1.22.0-fix3 : pré-fetch async des points pour snap sync au clic
    // (SearchPoints.getAllPoints retourne un Promise depuis v1.21.x — on
    // l'attend ICI pour pouvoir l'utiliser synchrone dans _onMapClickPoint).
    if (window.SearchPoints && typeof window.SearchPoints.getAllPoints === "function") {
      Promise.resolve(window.SearchPoints.getAllPoints()).then(function(all) {
        if (_mapModeCtx) _mapModeCtx.allPoints = Array.isArray(all) ? all : [];
      }).catch(function(e) {
        console.warn("[SecoursMode] Pre-fetch points échec :", e);
      });
    }
    window.map.once("click", _onMapClickPoint);
  }

  function _onMapClickPoint(e) {
    if (!_mapModeCtx) return;
    let x = e.latlng.lng;
    let y = (window.APP_CONFIG && window.APP_CONFIG.imageHeight)
            ? window.APP_CONFIG.imageHeight - e.latlng.lat
            : e.latlng.lat;
    const level = (window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number")
                  ? window.APP_CONFIG.activeLevel : 0;
    // 🆕 v1.22.0-fix2 — snap auto sur POI le plus proche dans un rayon de 30 px
    // (cohérent avec le mode "Cliquer sur la carte" de l'itinéraire existant).
    // Réutilise SearchPoints.getAllPoints si dispo.
    let pointId = null;
    let label = null;
    const snap = _trouverPoiProche(x, y, 30);
    if (snap) {
      x = snap.x;
      y = snap.y;
      pointId = snap.pointId || null;
      label = snap.nom || snap.label || null;
      _toast("✓ Snap sur « " + (label || pointId || "POI") + " »", "info");
    }
    _appliquerWaypoint(_mapModeCtx.groupeId, _mapModeCtx.role, _mapModeCtx.idx,
                       { x: x, y: y, level: level, pointId: pointId, label: label });
    _finishMapMode();
  }

  // Helper : cherche le POI le plus proche (x, y) en pixels plan, rayon en px.
  // Retourne {x, y, pointId, nom} ou null.
  // 🐛 v1.22.0-fix3 : utilise la liste pré-fetched dans _mapModeCtx.allPoints
  // (cf _startDefiningPoint) car SearchPoints.getAllPoints est async — pas
  // appelable directement depuis le click handler synchrone.
  function _trouverPoiProche(x, y, radiusPx) {
    const all = (_mapModeCtx && Array.isArray(_mapModeCtx.allPoints)) ? _mapModeCtx.allPoints : [];
    if (all.length === 0) return null;
    let best = null, bestD = Infinity;
    all.forEach(function(entry) {
      const p = entry.point || entry;
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
      const dx = p.x - x, dy = p.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD && d <= radiusPx) {
        bestD = d;
        best = { x: p.x, y: p.y, pointId: p.id, nom: p.nom };
      }
    });
    return best;
  }

  // 🆕 v1.22.0-fix2 — applique un waypoint sélectionné (depuis search OU clic)
  // au bon endroit dans le groupe (entree, sortie ou intermediaires[idx]).
  // 🆕 v1.22.0-fix4 — déclenche auto-recalc de l'itinéraire si déjà calc une fois.
  function _appliquerWaypoint(groupeId, role, idx, wp) {
    const s = get(_currentScenarioId);
    if (!s) return;
    const g = s.groupes.find(function(x) { return x.id === groupeId; });
    if (!g) return;
    if (role === "entree") {
      updateGroupe(_currentScenarioId, groupeId, { entree: wp });
    } else if (role === "sortie") {
      updateGroupe(_currentScenarioId, groupeId, { sortie: wp });
    } else if (role === "intermediaire") {
      const arr = Array.isArray(g.intermediaires) ? g.intermediaires.slice() : [];
      if (idx == null || idx < 0 || idx > arr.length) {
        arr.push(wp);            // append si idx invalide
      } else {
        arr[idx] = wp;           // update à l'index
      }
      updateGroupe(_currentScenarioId, groupeId, { intermediaires: arr });
    }
    _scheduleAutoRecalc(_currentScenarioId, groupeId);
  }

  // 🆕 v1.22.0-fix2 — clear un waypoint (entree, sortie → null ; intermediaire → splice)
  // 🆕 v1.22.0-fix4 — auto-recalc déclenché aussi si user enlève un waypoint
  function _clearWaypoint(groupeId, role, idx) {
    const s = get(_currentScenarioId);
    if (!s) return;
    const g = s.groupes.find(function(x) { return x.id === groupeId; });
    if (!g) return;
    if (role === "entree") {
      updateGroupe(_currentScenarioId, groupeId, { entree: null });
    } else if (role === "sortie") {
      updateGroupe(_currentScenarioId, groupeId, { sortie: null });
    } else if (role === "intermediaire" && idx != null) {
      const arr = Array.isArray(g.intermediaires) ? g.intermediaires.slice() : [];
      if (idx >= 0 && idx < arr.length) {
        arr.splice(idx, 1);
        updateGroupe(_currentScenarioId, groupeId, { intermediaires: arr });
      }
    }
    _scheduleAutoRecalc(_currentScenarioId, groupeId);
    _switchView("edit");
  }

  // 🆕 v1.22.0-fix2 — mini-modale "Choisir un point" avec autocomplete +
  // bouton clic carte. Pattern hérité de la modale itinéraire (cf §14 CLAUDE.md).
  function _ouvrirChoixWaypoint(groupeId, role, idx) {
    // Cleanup éventuelle modale précédente (idempotency)
    const existing = document.getElementById("kta-secours-pick-modal");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    const lblRole = role === "entree" ? "Entrée"
                  : role === "sortie" ? "Sortie"
                  : "Étape " + ((idx == null ? 0 : idx) + 1);
    const overlay = document.createElement("div");
    overlay.id = "kta-secours-pick-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-pick-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📍 Choisir un point — ' + _escHtml(lblRole) + '</span>' +
          '<button class="kta-panneau-close" data-action="cancel" type="button">&times;</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<div class="kta-secours-pick-search-wrap">' +
            '<input type="text" id="kta-secours-pick-search" placeholder="🔍 Rechercher un point (nom, id, tag)..." autocomplete="off">' +
            '<div class="kta-secours-pick-results" id="kta-secours-pick-results"></div>' +
          '</div>' +
          '<div class="kta-secours-pick-or">— OU —</div>' +
          '<button class="kta-btn kta-btn-primary kta-secours-pick-clic" data-action="clic-carte">' +
            '📍 Cliquer sur la carte<br>' +
            '<small style="opacity:0.85; font-weight:normal;">Snap auto au POI le plus proche dans 30 px</small>' +
          '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    const input   = overlay.querySelector("#kta-secours-pick-search");
    const results = overlay.querySelector("#kta-secours-pick-results");

    function _close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    overlay.querySelectorAll('[data-action="cancel"]').forEach(function(b) { b.addEventListener("click", _close); });
    // Clic carte
    overlay.querySelectorAll('[data-action="clic-carte"]').forEach(function(b) {
      b.addEventListener("click", function() {
        _close();
        _startDefiningPoint(groupeId, role, idx);
      });
    });

    // Autocomplete debounce 150ms
    // 🐛 v1.22.0-fix3 : SearchPoints.findByQuery est ASYNC (Promise) depuis
    // v1.21.x — pas un array. On gère le Promise via .then() avec un token
    // de query pour ignorer les résultats obsolètes (race condition si l'user
    // tape vite).
    let _searchTimer = null;
    let _searchSeq = 0;
    function _doSearch() {
      const q = input.value.trim();
      if (!q || q.length < 1) {
        results.innerHTML = '<div class="kta-secours-pick-hint">Tape au moins 1 caractère pour rechercher…</div>';
        return;
      }
      if (!window.SearchPoints || typeof window.SearchPoints.findByQuery !== "function") {
        results.innerHTML = '<div class="kta-secours-pick-hint">⚠️ Module Recherche indisponible.</div>';
        return;
      }
      const mySeq = ++_searchSeq;
      results.innerHTML = '<div class="kta-secours-pick-hint">⏳ Recherche…</div>';
      Promise.resolve(window.SearchPoints.findByQuery(q)).then(function(found) {
        // Si une nouvelle query a été lancée entre-temps, ignore ce résultat
        if (mySeq !== _searchSeq) return;
        if (!Array.isArray(found)) found = [];
        if (found.length === 0) {
          results.innerHTML = '<div class="kta-secours-pick-hint">Aucun résultat pour « ' + _escHtml(q) + ' ».</div>';
          return;
        }
        let html = '';
        found.slice(0, 20).forEach(function(entry) {
          const p = entry.point || entry;
          if (!p) return;
          const nom = p.nom || p.id || "(sans nom)";
          const tag = (Array.isArray(p.tags) && p.tags[0]) || "default";
          const layerInfo = entry.layerLabel || entry.layerId || "";
          html += '<button class="kta-secours-pick-result" data-pid="' + _escAttr(p.id || "") +
                  '" data-x="' + p.x + '" data-y="' + p.y +
                  '" data-lvl="' + (typeof p.level === "number" ? p.level : "") +
                  '" data-nom="' + _escAttr(nom) + '">' +
                  '<strong>' + _escHtml(nom) + '</strong>' +
                  '<span class="kta-secours-pick-meta">' + _escHtml(tag) +
                  (layerInfo ? ' · ' + _escHtml(layerInfo) : '') +
                  ' · x=' + Math.round(p.x) + ' y=' + Math.round(p.y) +
                  (typeof p.level === "number" ? ' · niv ' + p.level : '') +
                  '</span>' +
                  '</button>';
        });
        results.innerHTML = html;
        results.querySelectorAll('.kta-secours-pick-result').forEach(function(btn) {
          btn.addEventListener("click", function() {
            const wp = {
              x:       parseFloat(btn.getAttribute("data-x")),
              y:       parseFloat(btn.getAttribute("data-y")),
              level:   btn.getAttribute("data-lvl") !== "" ? parseInt(btn.getAttribute("data-lvl"), 10) : 0,
              pointId: btn.getAttribute("data-pid") || null,
              label:   btn.getAttribute("data-nom") || null
            };
            _close();
            _appliquerWaypoint(groupeId, role, idx, wp);
          });
        });
      }).catch(function(e) {
        if (mySeq !== _searchSeq) return;
        results.innerHTML = '<div class="kta-secours-pick-hint">⚠️ Erreur recherche : ' + _escHtml(e.message || String(e)) + '</div>';
      });
    }
    input.addEventListener("input", function() {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(_doSearch, 150);
    });
    // Focus auto sur l'input
    setTimeout(function() { input.focus(); }, 50);
    _doSearch();
  }

  function _ouvrirChoixZoneMode(groupeId) {
    // Petite modale de choix : polygon OU roads
    const overlay = document.createElement("div");
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:420px;">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">⬛ Définir la zone</span>' +
          '<button class="kta-panneau-close" data-action="cancel" type="button">&times;</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="color:#c8d0e0;">Choisis comment définir la zone à ratisser pour cette équipe :</p>' +
          '<div style="display:flex; flex-direction:column; gap:10px; margin-top:14px;">' +
            '<button class="kta-btn kta-btn-primary" data-mode="polygon" style="text-align:left;">' +
              '<strong>⬛ Polygone</strong><br>' +
              '<small style="opacity:0.85;">Trace un polygone sur la carte (clic = sommet, double-clic = fermer).</small>' +
            '</button>' +
            '<button class="kta-btn kta-btn-primary" data-mode="roads" style="text-align:left;">' +
              '<strong>🛣️ Sélection de tracés</strong><br>' +
              '<small style="opacity:0.85;">Clique chaque tracé (route) à inclure. Re-cliquer = retirer. Précis pour les zones étroites suivant les galeries.</small>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    function _close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    overlay.querySelectorAll('[data-action="cancel"]').forEach(function(b) {
      b.addEventListener("click", _close);
    });
    overlay.querySelectorAll('[data-mode]').forEach(function(b) {
      b.addEventListener("click", function() {
        const mode = b.getAttribute("data-mode");
        _close();
        if (mode === "polygon") _startDefiningZonePolygon(groupeId);
        else if (mode === "roads") _startDefiningZoneRoads(groupeId);
      });
    });
  }

  function _startDefiningZonePolygon(groupeId) {
    if (_activeMapMode) _cancelMapMode();
    if (!window.map) return;
    _activeMapMode = "polygon";
    _mapModeCtx = { groupeId: groupeId, points: [], previewLayer: null };
    _hideModalForMap();
    _showFloater(
      '⬛ Clique pour ajouter des sommets — <strong>double-clic pour FERMER le polygone</strong><br>' +
      '<span id="kta-sec-poly-count">0 sommet(s)</span>',
      [
        { label: "Annuler", action: "cancel" },
        { label: "✓ Terminer", action: "finish" }
      ]
    );
    window.map.on("click", _onMapClickPolygon);
    window.map.on("dblclick", _onMapDblClickPolygon);
  }

  function _onMapClickPolygon(e) {
    if (!_mapModeCtx) return;
    const x = e.latlng.lng;
    const y = (window.APP_CONFIG && window.APP_CONFIG.imageHeight)
              ? window.APP_CONFIG.imageHeight - e.latlng.lat
              : e.latlng.lat;
    const level = (window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number")
                  ? window.APP_CONFIG.activeLevel : 0;
    _mapModeCtx.points.push({ x: x, y: y, level: level });
    _updateFloaterCount(_mapModeCtx.points.length, "sommet");
    _redrawPolygonPreview();
  }

  function _onMapDblClickPolygon(e) {
    if (!_mapModeCtx || !_mapModeCtx.points || _mapModeCtx.points.length < 3) {
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast("⚠️ Minimum 3 sommets pour fermer le polygone.", "warn");
      }
      return;
    }
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
    _finishPolygon();
  }

  function _redrawPolygonPreview() {
    if (_mapModeCtx.previewLayer && window.map) {
      try { window.map.removeLayer(_mapModeCtx.previewLayer); } catch(e) {}
    }
    if (_mapModeCtx.points.length < 2 || !window.map) return;
    const latlngs = _mapModeCtx.points.map(_planToLatLng);
    _mapModeCtx.previewLayer = L.polyline(latlngs, {
      color: "#ff4444", weight: 3, opacity: 0.8, dashArray: "8 4"
    }).addTo(window.map);
  }

  function _finishPolygon() {
    if (!_mapModeCtx || _mapModeCtx.points.length < 3) return;
    const ctx = _mapModeCtx;
    updateGroupe(_currentScenarioId, ctx.groupeId, {
      zoneType:    "polygon",
      zonePolygon: ctx.points.slice(),
      zoneRoadIds: null   // exclusif
    });
    _finishMapMode();
  }

  function _startDefiningZoneRoads(groupeId) {
    if (_activeMapMode) _cancelMapMode();
    if (!window.map) return;
    _activeMapMode = "roads";
    _mapModeCtx = { groupeId: groupeId, roadIds: new Set(), highlightLayer: null };
    _hideModalForMap();
    _showFloater(
      '🛣️ Clique chaque <strong>TRACÉ</strong> à inclure (re-clic = retirer)<br>' +
      '<span id="kta-sec-poly-count">0 tracé(s)</span>',
      [
        { label: "Annuler", action: "cancel" },
        { label: "✓ Terminer", action: "finish" }
      ]
    );
    _bindRoadsClickListeners();
  }

  function _bindRoadsClickListeners() {
    // Hook sur toutes les polylines de roads présentes (session + embedded)
    // via les registries _ktaSessionRoadLayers / _ktaDataPolylines.
    // Approche simple : on attache un click handler à chaque polyline.
    // Au cleanup _finishMapMode, on retire ces handlers.
    if (!window.map) return;
    _mapModeCtx.attachedHandlers = [];
    // Session roads
    const sessRoads = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    sessRoads.forEach(function(road) {
      if (road.type === "itinerary") return;  // pas de pick sur itinéraire
      _attachRoadPickHandler(road);
    });
    // Embedded roads (via registry s'il existe)
    if (Array.isArray(window._ktaDataPolylines)) {
      window._ktaDataPolylines.forEach(function(entry) {
        if (!entry || !entry.road || entry.road.type === "itinerary") return;
        _attachRoadPickHandler(entry.road, entry.layer);
      });
    }
  }

  function _attachRoadPickHandler(road, layerHint) {
    // road.id obligatoire pour identifier (créé par road.js si absent)
    if (!road.id) road.id = "road_" + Math.random().toString(36).slice(2, 10);
    // Trouve le L.polyline associé. Pattern : road.js stocke ses polylines
    // dans _ktaSessionRoadLayers (session) ou via registry. On simplifie en
    // attachant directement si on a la ref layerHint.
    const layer = layerHint;
    if (!layer || typeof layer.on !== "function") return;
    const handler = function(e) {
      L.DomEvent.stopPropagation(e);
      _toggleRoadPick(road.id, layer);
    };
    layer.on("click", handler);
    _mapModeCtx.attachedHandlers.push({ layer: layer, handler: handler });
  }

  function _toggleRoadPick(roadId, layer) {
    if (!_mapModeCtx) return;
    if (_mapModeCtx.roadIds.has(roadId)) {
      _mapModeCtx.roadIds.delete(roadId);
      // Restore style
      if (layer && layer.options && layer._kta_originalStyle) {
        try { layer.setStyle(layer._kta_originalStyle); } catch(e) {}
        delete layer._kta_originalStyle;
      }
    } else {
      _mapModeCtx.roadIds.add(roadId);
      if (layer && typeof layer.setStyle === "function") {
        if (!layer._kta_originalStyle) {
          layer._kta_originalStyle = {
            color:  layer.options.color,
            weight: layer.options.weight,
            opacity: layer.options.opacity
          };
        }
        layer.setStyle({ color: "#ff4444", weight: 8, opacity: 0.9 });
      }
    }
    _updateFloaterCount(_mapModeCtx.roadIds.size, "tracé");
  }

  function _finishRoads() {
    if (!_mapModeCtx) return;
    const ctx = _mapModeCtx;
    if (ctx.roadIds.size === 0) {
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast("⚠️ Aucun tracé sélectionné.", "warn");
      }
      return;
    }
    updateGroupe(_currentScenarioId, ctx.groupeId, {
      zoneType:    "roads",
      zoneRoadIds: Array.from(ctx.roadIds),
      zonePolygon: null   // exclusif
    });
    _finishMapMode();
  }

  // ============================================================
  // Helpers map mode UI
  // ============================================================

  // ============================================================
  // Floater "Retour modale" (depuis v1.22.0-fix1)
  // ============================================================
  // Quand "Voir sur carte" est actif, la modale est masquée pour voir le
  // rendu Leaflet. Un floater compact en bas de l'écran permet de rouvrir
  // la modale sans passer par la sidebar.

  function _showOverlayFloater() {
    _removeOverlayFloater();
    const s = get(_currentScenarioId);
    if (!s || !window.map) return;
    const fl = document.createElement("div");
    fl.id = "kta-secours-overlay-floater";
    fl.className = "kta-secours-overlay-floater";
    const nbGroupes = (s.groupes || []).length;
    fl.innerHTML =
      '<div class="kta-secours-overlay-floater-info">' +
        '🚨 <strong>' + _escHtml(s.nom) + '</strong>' +
        ' · ' + nbGroupes + ' équipe' + (nbGroupes > 1 ? 's' : '') +
      '</div>' +
      '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="reopen-modal">' +
        '↩️ Retour modale' +
      '</button>';
    document.body.appendChild(fl);
    fl.querySelector('[data-action="reopen-modal"]').addEventListener("click", function() {
      // Restore modale + retire floater + clean overlay (l'user peut le re-toggler)
      if (_modal) _modal.style.display = "";
      _removeOverlayFloater();
      clearOverlay();
      // Update bouton "Voir sur carte" dans la modale (re-render edit suffit)
      if (_currentScenarioId) _switchView("edit");
    });
  }

  function _removeOverlayFloater() {
    const ex = document.getElementById("kta-secours-overlay-floater");
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }

  function _planToLatLng(pt) {
    // Plan (x, y) → Leaflet [lat, lng] via CRS.Simple convention MyKTAMap
    const lat = (window.APP_CONFIG && window.APP_CONFIG.imageHeight)
                ? window.APP_CONFIG.imageHeight - pt.y
                : pt.y;
    return L.latLng(lat, pt.x);
  }

  function _hideModalForMap() {
    if (_modal) _modal.style.display = "none";
  }
  function _showModalAfterMap() {
    if (_modal) _modal.style.display = "";
    if (_currentScenarioId) _switchView("edit");
  }

  function _showFloater(html, actions) {
    _removeFloater();
    const fl = document.createElement("div");
    fl.id = "kta-secours-floater";
    fl.className = "kta-secours-floater";
    fl.innerHTML = '<div class="kta-secours-floater-msg">' + html + '</div>' +
                   '<div class="kta-secours-floater-actions">' +
                     (actions || []).map(function(a) {
                       return '<button class="kta-btn kta-btn-' + (a.action === "finish" ? "primary" : "ghost") + ' kta-btn-sm" data-action="' + a.action + '">' + a.label + '</button>';
                     }).join('') +
                   '</div>';
    document.body.appendChild(fl);
    fl.querySelectorAll('[data-action="cancel"]').forEach(function(b) {
      b.addEventListener("click", _cancelMapMode);
    });
    fl.querySelectorAll('[data-action="finish"]').forEach(function(b) {
      b.addEventListener("click", function() {
        if (_activeMapMode === "polygon") _finishPolygon();
        else if (_activeMapMode === "roads") _finishRoads();
      });
    });
  }
  function _removeFloater() {
    const ex = document.getElementById("kta-secours-floater");
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }
  function _updateFloaterCount(n, label) {
    const el = document.getElementById("kta-sec-poly-count");
    if (el) el.textContent = n + " " + label + (n > 1 ? "s" : "");
  }

  function _cancelMapMode() {
    _finishMapMode();
  }
  function _finishMapMode() {
    if (window.map) {
      window.map.off("click", _onMapClickPoint);
      window.map.off("click", _onMapClickPolygon);
      window.map.off("dblclick", _onMapDblClickPolygon);
    }
    // Cleanup preview polygon
    if (_mapModeCtx && _mapModeCtx.previewLayer && window.map) {
      try { window.map.removeLayer(_mapModeCtx.previewLayer); } catch(e) {}
    }
    // Cleanup roads handlers
    if (_mapModeCtx && Array.isArray(_mapModeCtx.attachedHandlers)) {
      _mapModeCtx.attachedHandlers.forEach(function(h) {
        try { h.layer.off("click", h.handler); } catch(e) {}
        if (h.layer && h.layer._kta_originalStyle) {
          try { h.layer.setStyle(h.layer._kta_originalStyle); } catch(e) {}
          delete h.layer._kta_originalStyle;
        }
      });
    }
    _activeMapMode = null;
    _mapModeCtx = null;
    _removeFloater();
    _showModalAfterMap();
  }

  // ============================================================
  // PATHFINDER intégration (depuis v1.22.0 commit 4/9)
  // ============================================================
  function _recalculerItineraireGroupe(scenarioId, groupeId) {
    const s = get(scenarioId);
    if (!s) return null;
    const g = s.groupes.find(function(x) { return x.id === groupeId; });
    if (!g) {
      _toast("⚠️ Équipe introuvable.", "error");
      return null;
    }
    if (!g.entree || !g.sortie) {
      _toast("⚠️ Définis d'abord l'entrée ET la sortie de cette équipe via 📍 Entrée et 🚪 Sortie.", "warn");
      return null;
    }
    if (!window.Pathfinder || typeof window.Pathfinder.computeRoute !== "function") {
      _toast("⚠️ Pathfinder indisponible.", "error");
      return null;
    }
    // 🐛 v1.22.0-fix1 : vérifier que les coords sont valides (anti-NaN)
    if (typeof g.entree.x !== "number" || typeof g.entree.y !== "number" ||
        typeof g.sortie.x !== "number" || typeof g.sortie.y !== "number") {
      _toast("⚠️ Coordonnées entrée/sortie corrompues. Re-définis-les via 📍/🚪.", "error");
      return null;
    }
    // 🆕 v1.22.0-fix2 : valider aussi les intermédiaires + filtrer les invalides
    const intermediaires = (Array.isArray(g.intermediaires) ? g.intermediaires : [])
      .filter(function(w) {
        return w && typeof w.x === "number" && typeof w.y === "number";
      });
    _toast("⏳ Calcul itinéraire " +
           (intermediaires.length > 0 ? "(via " + intermediaires.length + " waypoint" + (intermediaires.length > 1 ? "s" : "") + ")" : "") +
           " en cours…", "info");
    try {
      // 🆕 v1.22.0-fix2 : Pathfinder accepte [entree, ...intermediaires, sortie]
      // (multi-waypoints natif depuis v1.5.x). Chaque pair de waypoints
      // consécutifs déclenche un Dijkstra séparé puis les paths sont
      // concaténés (cf §14 CLAUDE.md). Boucle entree=sortie → Pathfinder
      // calcule le tour complet via les intermédiaires (sinon retour direct).
      const waypoints = [{ x: g.entree.x, y: g.entree.y, label: g.entree.label || ("Entrée " + g.nom) }]
        .concat(intermediaires.map(function(w, i) {
          return { x: w.x, y: w.y, label: w.label || ("Étape " + (i + 1)) };
        }))
        .concat([{ x: g.sortie.x, y: g.sortie.y, label: g.sortie.label || ("Sortie " + g.nom) }]);
      // 🆕 v1.23.0 Phase 2 / Feature B — Pathfinder avoidances cross-équipes :
      // collecte les waypoints + zones des autres équipes du scénario pour
      // que Pathfinder préfère un chemin qui les contourne (pas de chevauchement
      // involontaire). avoidRadius 30 px ≈ 1 galerie de large.
      const avoidPoints = _collecterAvoidPointsAutresEquipes(scenarioId, groupeId);
      const pfOpts = (avoidPoints.length > 0)
                     ? { avoidPoints: avoidPoints, avoidRadius: 30 }
                     : {};
      // Pathfinder.computeRoute est async depuis v1.21.x (avoid expansion).
      // computeRoute peut throw sync (waypoints insuffisants) OU reject async
      // (chemin introuvable, composantes disconnect). On gère les 2.
      const result = window.Pathfinder.computeRoute(waypoints, pfOpts);
      Promise.resolve(result).then(function(r) {
        if (!r || !Array.isArray(r.path) || r.path.length === 0) {
          _toast("⚠️ Aucun itinéraire trouvé entre l'entrée et la sortie. Vérifie qu'elles sont sur le réseau de galeries.", "warn");
          return;
        }
        const scale = (window.APP_CONFIG && window.APP_CONFIG.scale > 0)
                      ? window.APP_CONFIG.scale : 1;
        const distM = r.totalDistance / scale;
        // 🆕 v1.23.0 (KARMA "rajoute un temps de pause définissable...
        // s'applique aussi au mode secours") : on utilise le helper unifié
        // window.getItiTempsMinutes (interface.js) qui lit la vitesse + la
        // pause configurables. Fallback sur vitesse cataphile 0.5 m/s si
        // helper indisponible (cas chargement modulaire alternatif).
        let duree;
        if (typeof window.getItiTempsMinutes === "function") {
          // window.getItiTempsMinutes(distM, nbWaypoints) — applique vitesse
          // + nb pauses intermédiaires selon prefs UI itinéraire.
          const nbWp = waypoints.length;   // entrée + intermédiaires + sortie
          duree = Math.round(window.getItiTempsMinutes(distM, nbWp));
        } else {
          // Fallback historique : vitesse 0.5 m/s cataphile, pas de pause
          duree = Math.round(distM / VITESSE_MPS_DEFAUT / 60);
        }
        updateGroupe(scenarioId, groupeId, {
          itineraireSuggere: r.path.map(function(p) {
            return { x: p.x, y: p.y, level: g.entree.level || 0 };
          }),
          distanceM:       distM,
          dureeEstimeeMin: duree
        });
        const fmtD = (typeof window.formatDistance === "function")
                     ? window.formatDistance(distM, 0) : Math.round(distM) + " m";
        _toast("✓ Itinéraire calculé : " + fmtD + " · ~" + duree + " min", "info");
        // 🆕 v1.23.0 Phase 2 / Feature B — Feedback fallback avoidances
        if (r.usedFallback === true && Array.isArray(r.avoidedThrough) && r.avoidedThrough.length > 0) {
          _toast("⚠️ Itinéraire traverse " + r.avoidedThrough.length +
                 " point(s) d'autres équipes (zones non-évitables). Vérifie les chevauchements.", "warn");
        }
        // 🐛 v1.22.0-fix1 : re-render edit pour update stats visibles + refresh overlay si actif
        if (_modal) _switchView("edit");
        if (_overlayLayer) renderOverlay(scenarioId);
      }).catch(function(err) {
        console.warn("[SecoursMode] Pathfinder error :", err);
        const msg = (err && err.message) ? err.message : String(err);
        _toast("⚠️ Erreur calcul itinéraire : " + msg, "error");
      });
    } catch(e) {
      console.warn("[SecoursMode] Calcul itinéraire échoué (sync) :", e);
      _toast("⚠️ Erreur sync : " + (e.message || e), "error");
    }
  }

  // 🆕 v1.23.0 Phase 2 / Feature B — Collecte les waypoints des AUTRES
  // équipes du scénario pour les passer en `avoidPoints` à Pathfinder.
  // Évite les chevauchements involontaires : si Alpha a déjà une zone +
  // un itinéraire, quand on calcule celui de Bravo, Pathfinder choisira un
  // chemin qui contourne les éléments d'Alpha (soft constraint — fallback
  // si pas d'alternative).
  //
  // Sources collectées par équipe autre :
  //  • entrée + sortie + intermédiaires (waypoints explicites)
  //  • points du polygon de zone (sommets) si zoneType="polygon"
  //  • points de toutes les roads sélectionnées si zoneType="roads"
  //
  // Format Pathfinder attendu : [{x, y, label?, id?}, ...]
  function _collecterAvoidPointsAutresEquipes(scenarioId, currentGroupeId) {
    const s = get(scenarioId);
    if (!s) return [];
    const avoid = [];
    s.groupes.forEach(function(g) {
      if (g.id === currentGroupeId) return;  // skip l'équipe courante
      const eqLabel = "Équipe " + (g.nom || "?");
      // 1. Waypoints
      if (g.entree && typeof g.entree.x === "number") {
        avoid.push({ x: g.entree.x, y: g.entree.y, label: "Entrée " + eqLabel });
      }
      if (g.sortie && typeof g.sortie.x === "number"
          && !_samePoint(g.entree, g.sortie)) {
        avoid.push({ x: g.sortie.x, y: g.sortie.y, label: "Sortie " + eqLabel });
      }
      (g.intermediaires || []).forEach(function(w, i) {
        if (w && typeof w.x === "number") {
          avoid.push({ x: w.x, y: w.y, label: "Étape " + (i + 1) + " " + eqLabel });
        }
      });
      // 2. Zone polygon — sommets du polygone (Pathfinder les évite par
      // proximité dans le rayon avoidRadius)
      if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon)) {
        g.zonePolygon.forEach(function(p, i) {
          if (typeof p.x === "number") {
            avoid.push({ x: p.x, y: p.y, label: "Zone " + eqLabel + " #" + (i + 1) });
          }
        });
      }
      // 3. Zone roads — points de chaque road sélectionnée
      if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds)) {
        const allRoads = ((typeof window.getRoads === "function") ? (window.getRoads() || []) : [])
                         .concat((typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : []);
        g.zoneRoadIds.forEach(function(rid) {
          const road = allRoads.find(function(r) { return r.id === rid; });
          if (road && Array.isArray(road.points)) {
            road.points.forEach(function(p) {
              if (typeof p.x === "number") {
                avoid.push({ x: p.x, y: p.y, label: "Tracé zone " + eqLabel });
              }
            });
          }
        });
      }
    });
    return avoid;
  }

  // Helper toast unifié (évite les checks répétés)
  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(msg, type || "info");
    } else {
      console.log("[SecoursMode] " + (type || "info").toUpperCase() + " — " + msg);
    }
  }

  // 🆕 v1.22.0-fix4 (KARMA "on peut avoir aussi un bouton tous les points
  // dans la zone de recherche") : ajoute en intermédiaires TOUS les POI
  // qui tombent dans la zone définie de l'équipe (polygon ou roads buffer
  // 30 px). Skip les POI déjà présents en entrée/sortie/intermédiaires.
  // Tri par distance croissante à l'entrée → l'itinéraire suggéré est plus
  // efficace (greedy nearest neighbor approximation).
  function _ajouterPoisDansZone(scenarioId, groupeId) {
    const s = get(scenarioId);
    if (!s) return;
    const g = s.groupes.find(function(x) { return x.id === groupeId; });
    if (!g) return;
    if (!g.zoneType) {
      _toast("⚠️ Définis d'abord une zone (polygone ou tracés) via ⬛ Définir zone.", "warn");
      return;
    }
    if (!g.entree) {
      _toast("⚠️ Définis d'abord une entrée pour ordonner les POI par proximité.", "warn");
      return;
    }
    if (!window.SearchPoints || typeof window.SearchPoints.getAllPoints !== "function") {
      _toast("⚠️ Module Recherche indisponible.", "error");
      return;
    }
    _toast("⏳ Recherche des POI dans la zone…", "info");
    Promise.resolve(window.SearchPoints.getAllPoints()).then(function(all) {
      if (!Array.isArray(all)) all = [];
      // Set des POI déjà présents dans le parcours (par pointId OU coords)
      const dejaPresent = function(p) {
        if (_samePoint(p, g.entree)) return true;
        if (_samePoint(p, g.sortie)) return true;
        return (g.intermediaires || []).some(function(w) { return _samePoint(p, w); });
      };
      // Filtre les POI dans la zone
      const candidats = [];
      all.forEach(function(entry) {
        const p = entry.point || entry;
        if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
        // Skip si M-LVL actif et niveau différent de l'entrée (cohérent pathfinder)
        if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true
            && typeof p.level === "number" && typeof g.entree.level === "number"
            && p.level !== g.entree.level) return;
        // Test zone
        let inside = false;
        if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon)) {
          inside = _pointInPolygon(p, g.zonePolygon);
        } else if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds)) {
          const allRoads = ((typeof window.getRoads === "function") ? (window.getRoads() || []) : [])
                           .concat((typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : []);
          for (let i = 0; i < g.zoneRoadIds.length; i++) {
            const road = allRoads.find(function(r) { return r.id === g.zoneRoadIds[i]; });
            if (!road || !Array.isArray(road.points)) continue;
            if (_distPointPolyline(p, road.points) <= 30) {  // buffer 30 px
              inside = true;
              break;
            }
          }
        }
        if (!inside) return;
        if (dejaPresent({ x: p.x, y: p.y, pointId: p.id })) return;
        // Distance à l'entrée pour le tri
        const dx = p.x - g.entree.x, dy = p.y - g.entree.y;
        const distFromEntree = Math.sqrt(dx * dx + dy * dy);
        candidats.push({
          x:       p.x,
          y:       p.y,
          level:   typeof p.level === "number" ? p.level : (g.entree.level || 0),
          pointId: p.id || null,
          label:   p.nom || p.id || null,
          _d:      distFromEntree
        });
      });
      if (candidats.length === 0) {
        _toast("ℹ️ Aucun POI trouvé dans la zone (qui ne soit pas déjà dans le parcours).", "info");
        return;
      }
      // Tri par distance croissante à l'entrée (greedy nearest neighbor)
      candidats.sort(function(a, b) { return a._d - b._d; });
      // Strip le _d helper avant save
      const newIntermediaires = (g.intermediaires || []).slice().concat(
        candidats.map(function(c) {
          return { x: c.x, y: c.y, level: c.level, pointId: c.pointId, label: c.label };
        })
      );
      updateGroupe(scenarioId, groupeId, { intermediaires: newIntermediaires });
      _toast("✓ " + candidats.length + " POI ajouté" + (candidats.length > 1 ? "s" : "") +
             " comme étapes intermédiaires (triés par proximité de l'entrée).", "info");
      _switchView("edit");
    }).catch(function(e) {
      console.warn("[SecoursMode] _ajouterPoisDansZone échoué :", e);
      _toast("⚠️ Erreur : " + (e.message || e), "error");
    });
  }

  // 🆕 v1.22.0-fix4 (KARMA "quand j'ajoute un point il ne s'ajoute pas à
  // l'itinéraire") : auto-recalc de l'itinéraire au changement de waypoints.
  // Debounce 500 ms pour éviter N calc consécutifs si l'user ajoute plusieurs
  // points rapidement. Skip si entrée OU sortie manquante (Pathfinder
  // throw sinon → toast bruyant inutile).
  const _autoRecalcTimers = {};   // groupeId → setTimeout handle
  function _scheduleAutoRecalc(scenarioId, groupeId) {
    if (_autoRecalcTimers[groupeId]) clearTimeout(_autoRecalcTimers[groupeId]);
    _autoRecalcTimers[groupeId] = setTimeout(function() {
      delete _autoRecalcTimers[groupeId];
      const s = get(scenarioId);
      if (!s) return;
      const g = s.groupes.find(function(x) { return x.id === groupeId; });
      // Auto-recalc UNIQUEMENT si l'itinéraire avait déjà été calculé une fois
      // (= itineraireSuggere non null). Sinon l'user n'a pas encore demandé
      // de calc, on respecte ce choix. Évite aussi le toast progress au premier
      // ajout (l'user va cliquer "Calc itinéraire" lui-même).
      if (!g || !g.entree || !g.sortie || !g.itineraireSuggere) return;
      _recalculerItineraireGroupe(scenarioId, groupeId);
    }, 500);
  }

  // Override stub commit 1
  recalculerItineraires = function(scenarioId) {
    const s = get(scenarioId);
    if (!s) return;
    s.groupes.forEach(function(g) {
      _recalculerItineraireGroupe(scenarioId, g.id);
    });
  };

  // 🆕 v1.23.0 (KARMA "rajoute les itineraire de chaque équipe") :
  // Version async/await de _recalculerItineraireGroupe utilisée par
  // l'export KMZ pour calculer les iti manquants en parallèle avant
  // génération du KMZ. Toast simplifié (pas de spam si batch). Retourne
  // une Promise qui résout quand le calcul est terminé (success ou échec).
  function _recalculerItineraireGroupeAsync(scenarioId, groupeId) {
    return new Promise(function(resolve) {
      const s = get(scenarioId);
      if (!s) { resolve(false); return; }
      const g = s.groupes.find(function(x) { return x.id === groupeId; });
      if (!g || !g.entree || !g.sortie) { resolve(false); return; }
      if (!window.Pathfinder || typeof window.Pathfinder.computeRoute !== "function") {
        resolve(false); return;
      }
      // Coords valides ?
      if (typeof g.entree.x !== "number" || typeof g.entree.y !== "number" ||
          typeof g.sortie.x !== "number" || typeof g.sortie.y !== "number") {
        resolve(false); return;
      }
      try {
        const intermediaires = (Array.isArray(g.intermediaires) ? g.intermediaires : [])
          .filter(function(w) { return w && typeof w.x === "number" && typeof w.y === "number"; });
        const waypoints = [{ x: g.entree.x, y: g.entree.y, label: g.entree.label || ("Entrée " + g.nom) }]
          .concat(intermediaires.map(function(w, i) {
            return { x: w.x, y: w.y, label: w.label || ("Étape " + (i + 1)) };
          }))
          .concat([{ x: g.sortie.x, y: g.sortie.y, label: g.sortie.label || ("Sortie " + g.nom) }]);
        // 🆕 v1.23.0 Phase 2 / Feature B — Avoidances cross-équipes (idem
        // _recalculerItineraireGroupe sync). Batch auto-calc à l'export prend
        // en compte les zones des autres équipes.
        const avoidPoints = _collecterAvoidPointsAutresEquipes(scenarioId, groupeId);
        const pfOpts = (avoidPoints.length > 0)
                       ? { avoidPoints: avoidPoints, avoidRadius: 30 }
                       : {};
        Promise.resolve(window.Pathfinder.computeRoute(waypoints, pfOpts)).then(function(r) {
          if (!r || !Array.isArray(r.path) || r.path.length === 0) { resolve(false); return; }
          const scale = (window.APP_CONFIG && window.APP_CONFIG.scale > 0)
                        ? window.APP_CONFIG.scale : 1;
          const distM = r.totalDistance / scale;
          let duree;
          if (typeof window.getItiTempsMinutes === "function") {
            const nbWp = waypoints.length;
            duree = Math.round(window.getItiTempsMinutes(distM, nbWp));
          } else {
            duree = Math.round(distM / VITESSE_MPS_DEFAUT / 60);
          }
          updateGroupe(scenarioId, groupeId, {
            itineraireSuggere: r.path.map(function(p) {
              return { x: p.x, y: p.y, level: g.entree.level || 0 };
            }),
            distanceM:       distM,
            dureeEstimeeMin: duree
          });
          resolve(true);
        }).catch(function(err) {
          console.warn("[SecoursMode] Auto-calc iti " + g.nom + " échec :", err);
          resolve(false);
        });
      } catch(e) {
        console.warn("[SecoursMode] Auto-calc iti sync error :", e);
        resolve(false);
      }
    });
  }

  // Helpers HTML escape (anti-XSS sur user input)
  function _escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function _escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;");
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
    // 🆕 v1.23.0 Phase 2 / Feature C — Création depuis Lost Mode
    creerDepuisLostMode:    creerDepuisLostMode,
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
