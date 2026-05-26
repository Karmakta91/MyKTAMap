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
                  '<div class="kta-secours-groupe-actions">' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="def-entree" data-gid="' + _escAttr(g.id) + '">📍 Entrée' + (g.entree ? ' ✓' : '') + '</button>' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="def-sortie" data-gid="' + _escAttr(g.id) + '">🚪 Sortie' + (g.sortie ? ' ✓' : '') + '</button>' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="def-zone" data-gid="' + _escAttr(g.id) + '">⬛ Définir zone</button>' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="calc-iti" data-gid="' + _escAttr(g.id) + '">🗺️ Calc. itinéraire</button>' +
                  '</div>' +
                '</div>' +
              '</div>';
    });
    return html;
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
          _currentScenarioId = null;
          _switchView("list");
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
      // Buttons "Définir entrée / sortie / zone / itinéraire" — stubs commits 3+4
      corps.querySelectorAll('[data-action="def-entree"], [data-action="def-sortie"], [data-action="def-zone"], [data-action="calc-iti"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast("🚧 Outil à coder dans le commit suivant — patience !", "info");
          }
        });
      });
      // Export PDF / KMZ — stubs commits 6+7
      corps.querySelectorAll('[data-action="export-pdf"], [data-action="export-kmz"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast("🚧 Export à coder dans le commit suivant — patience !", "info");
          }
        });
      });
    }
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
