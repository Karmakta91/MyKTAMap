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
//     // 🆕 v1.29.0 C1 — Multi-phases (Phase 1 balayage axes principaux,
//     // Phase 2 chambres d'exploitation, etc.). Rétro-compat stricte :
//     // un scénario v1 sans phases[] est migré au load vers 1 phase
//     // implicite "Phase 1" qui couvre tous ses groupes.
//     phases: [
//       {
//         id:        "P_<timestamp>_<rand>",
//         idx:       0,                   // position dans phases[]
//         nom:       "Phase 1",           // libellé custom user
//         groupeIds: ["G_..." , ...],     // équipes assignées à CETTE phase
//                                         // (hybride 1:c — checkbox "participe à
//                                         //  cette phase" par équipe et par phase)
//         startedAt: ISO | null,          // set par lancerExecution + phaseSuivante
//         endedAt:   ISO | null,          // set par terminerPhase (C3) / arret exec
//         debrief:   "",                  // texte libre (rempli en C3)
//         debriefAt: ISO | null           // timestamp debrief (C3)
//       }
//     ],
//     pointsCles: [
//       { pointId | x, y, level, role, label }
//     ],
//     execution?: {
//       // ... champs existants Phase 3 ...
//       currentPhaseIdx: 0   // 🆕 v1.29.0 C1 — index de la phase active dans phases[]
//     }
//   }
// =========================

(function() {
  "use strict";

  // ============================================================
  // 🆕 v1.31.4 (P2 progressive lazy CSS) — préchargement du chunk
  // CSS dédié Mode Secours dès l'init du module. Le CSS spécifique
  // (.kta-secours-* + .kta-mkmsec-*) est extrait de `css/style.css`
  // principal vers `css/style-secours.css` pour alléger le boot
  // (parse CSS bloquant le rendu sur mobile cold cache).
  //
  // Pattern fire-and-forget : on n'attend pas la Promise. Le browser
  // parse le CSS en parallèle de l'init du module, et il est
  // typiquement appliqué AVANT que l'user ait ouvert une modale
  // Mode Secours (clic après onboarding, exploration, etc.).
  //
  // Échec gracieux côté _loadCssOnce : si fetch échoue (offline +
  // cache vide cas marginal), la modale s'affiche avec un styling
  // dégradé sur les règles de style.css principal. Pas de blocage.
  //
  // Idempotence garantie : appels multiples no-op si déjà loaded.
  // ============================================================
  if (typeof window._loadCssOnce === "function") {
    window._loadCssOnce("css/style-secours.css", "kta-css-style-secours");
  }

  // ============================================================
  // i18n — helper de traduction (chantier multilingue v1.45+)
  // ============================================================
  // À appeler AU RENDU (jamais au load) : les dicos lang/<code>.json sont
  // chargés après I18n.init(). Fallback = la clé brute si I18n absent.
  // Interpolation : t("secours.x", { param }) → remplace {param}.
  const t = (k, p) => (window.I18n ? window.I18n.t(k, p) : k);

  // Libellé i18n d'un statut TABLEAU_STATUTS par id (résolution au rendu).
  // Le champ `.label` du tableau reste comme fallback FR de référence.
  function _statutLabel(statutId) {
    const info = _getStatutInfo(statutId);
    return t("secours.statut." + info.id, {}) !== "secours.statut." + info.id
      ? t("secours.statut." + info.id)
      : info.label;
  }
  // Version ASCII (pour PDF jsPDF latin1) — retire les accents du label i18n.
  function _statutLabelAscii(statutId) {
    return _statutLabel(statutId)
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

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

  // Vitesse de fouille par défaut, en m/s — conservée pour l'API publique
  // (SecoursMode.VITESSE_MPS_DEFAUT). Le calcul, lui, lit les réglages du scénario
  // (`reglagesDuree`, défaut DUREE_DEFAUT = 1,5 km/h). 4e relecture (R4-10) : valait
  // 0,5 m/s (1,8 km/h) sans plus rien piloter — un piège pour un intégrateur.
  const VITESSE_MPS_DEFAUT = 1.5 / 3.6;   // = DUREE_DEFAUT.vitesseKmh (déclaré plus bas)

  // 🆕 v1.24.0 Phase 3 — TABLEAU_STATUTS pour la vue EXÉCUTION terrain.
  // Statuts rapides cliquables à chaque étape d'un parcours équipe.
  // Validation KARMA terrain : 4 statuts de base + 3 critiques (pompiers/spéléo).
  // Extensibilité : ajouter une entry ici suffit (rendu UI + colors + export
  // PDF + report JSON suivent automatiquement via cette table).
  //
  // Convention : id = ASCII lowercase sans accent (clé localStorage), emoji
  // pour rendu visuel, label pour UI, color pour swatch/border, severity
  // pour tri/escalade dans la vue Opérateur surface (0=neutre, 1=warning,
  // 2=alerte, 3=urgence absolue).
  const TABLEAU_STATUTS = [
    {
      id: "pending",
      emoji: "•",
      label: "En attente",
      color: "#8892a4",
      severity: 0,
      isPending: true   // marqueur : statut implicite avant interaction user
    },
    {
      id: "ras",
      emoji: "🟢",
      label: "RAS",
      color: "#6ee287",
      severity: 0
    },
    {
      id: "suspect",
      emoji: "🟡",
      label: "Suspect",
      color: "#f4c542",
      severity: 1
    },
    {
      id: "bloque",
      emoji: "⬛",
      label: "Bloqué",
      color: "#404040",
      severity: 1
    },
    {
      id: "indice",
      emoji: "🔵",
      label: "Indice",
      color: "#4488ff",
      severity: 1
    },
    {
      id: "aide",
      emoji: "🟠",
      label: "Aide demandée",
      color: "#ff8c00",
      severity: 2
    },
    {
      id: "demi-tour",
      emoji: "🟣",
      label: "Demi-tour forcé",
      color: "#9d44ff",
      severity: 1
    },
    {
      id: "victime",
      emoji: "🚨",
      label: "Victime trouvée",
      color: "#ff4444",
      severity: 3,
      pulse: true   // marqueur : déclenche animation pulse dans vue Opérateur
    }
  ];

  // Helper d'accès — retourne l'entry du tableau par id (fallback pending).
  function _getStatutInfo(statutId) {
    return TABLEAU_STATUTS.find(function(st) { return st.id === statutId; })
        || TABLEAU_STATUTS[0];   // fallback pending
  }

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
  // 🆕 v1.29.0 C2 — Tracker de la vue active. Mis à jour par _switchView.
  // Utilisé par _afficherModalePhase pour re-render la bonne vue après une
  // mutation (le bouton "➕ Ajouter une phase" est présent en Edit ET en Live).
  let _activeView = null;

  // Layer Leaflet qui contient l'overlay des zones d'équipes sur la carte.
  // Créé à renderOverlay, nettoyé à clearOverlay (et au plan switch).
  let _overlayLayer = null;

  // ID du groupe focusé (= null pour afficher TOUS). En mode focus, l'app
  // masque les zones des autres équipes — utile navigation terrain à la
  // sortie pour une équipe spécifique.
  let _focusedGroupeId = null;
  // 🆕 v1.43.26 — Pattern A (anti-leak) : référence module au listener Esc
  // de la modale Phase, pour pouvoir le retirer si l'utilisateur ré-ouvre
  // la modale sans l'avoir fermée (cas où oldModal.remove() retire le DOM
  // mais laissait le keydown listener orphelin sur document).
  let _phaseModalEsc = null;

  // 🆕 v1.43.26 (Pattern A généralisé) — Helper mutualisé pour les sous-modales
  // de Mode Secours. Gère le bind + cleanup automatique d'un éventuel listener
  // Esc orphelin (cas ré-ouverture rapide sans close manuel). Retourne unbind().
  //
  // Usage :
  //   const unbindEsc = _bindSubModalEsc(_close);
  //   ... dans _close() : unbindEsc();
  //
  // Tracking flat (1 listener actif à la fois pour les sous-modales) :
  //   - Si une sous-modale est déjà ouverte et qu'on en ouvre une 2e par-dessus,
  //     l'ancien listener est retiré (l'ancienne modale aurait Esc inactif, mais
  //     elle est masquée derrière la nouvelle de toute manière).
  //   - Pas applicable à la modale Mode Secours PRINCIPALE (qui a son propre
  //     pattern `_onKeyDown` plus large, gérant +touches).
  let _activeSubModalEsc = null;
  function _bindSubModalEsc(closeFn) {
    // Cleanup éventuel listener orphelin d'une modale précédente
    if (_activeSubModalEsc) {
      document.removeEventListener("keydown", _activeSubModalEsc);
      _activeSubModalEsc = null;
    }
    const listener = function(e) {
      if (e.key === "Escape") {
        try { closeFn(); } catch(_) {}
      }
    };
    _activeSubModalEsc = listener;
    document.addEventListener("keydown", listener);
    return function unbind() {
      document.removeEventListener("keydown", listener);
      if (_activeSubModalEsc === listener) _activeSubModalEsc = null;
    };
  }

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

  // ============================================================
  // 🆕 v1.29.0 C1 — MULTI-PHASES (data model + migration v1)
  // ============================================================
  // KARMA validation : "Phase 1 balaye axes principaux, retour, debrief PC,
  // Phase 2 X équipes vont en chambres d'exploitation". Choix design tranchés :
  //   1:c → Équipes hybrides : définies au scénario, checkbox "participe à
  //         cette phase" par phase (phase.groupeIds[]).
  //   2:c → Transition hybride : auto-détection + toast confirmation Op (C3).
  //   3:c → Édition de parcours équipe autorisée entre phases (C3).
  //   4:a → Réutilise les 7+1 statuts existants (pas de pollution TABLEAU_STATUTS).
  //   5:b → Forwarding obs équipe→PC via relai reporté à release ultérieure.
  //   6:a → PDF global avec sections par phase + debriefs intercalés (C5).
  //   7:a → Bouton "Terminer phase" visible Op uniquement (C3).
  //
  // RÉTRO-COMPAT STRICTE : un scénario v1 (pas de phases[]) est migré au load
  // vers 1 phase implicite couvrant tous ses groupes. Pas de bump de format.

  // Libellé par défaut de la phase implicite créée à la migration.
  const PHASE_DEFAULT_NOM = "Phase 1";

  // Construit une phase vide avec un id unique + idx + libellé + équipes.
  // Utilisé par la migration ET par createScenario ET (futur C2/C3) par
  // l'ajout de phases successives.
  function _construirePhase(idx, nom, groupeIds) {
    return {
      id:        _genId("P"),
      idx:       (typeof idx === "number" && idx >= 0) ? idx : 0,
      nom:       (typeof nom === "string" && nom.trim()) ? nom.trim() : PHASE_DEFAULT_NOM,
      groupeIds: Array.isArray(groupeIds) ? groupeIds.slice() : [],
      startedAt: null,
      endedAt:   null,
      debrief:   "",
      debriefAt: null
    };
  }

  // Migration v1 → multi-phases. Idempotente — peut tourner 100 fois sans
  // dégât : si phases[] existe déjà et est valide, on ne fait rien.
  // Cas couverts :
  //   - Scénario v1 sans phases[] : crée 1 phase implicite couvrant tous les
  //     groupes. Si execution existe (Phase 3 lancée), reporte startedAt/endedAt
  //     sur cette phase implicite (pour cohérence rapport historique).
  //   - Scénario v1.29 avec phases[] mais sans currentPhaseIdx dans execution :
  //     ajoute currentPhaseIdx=0 (phase active = première).
  //   - Phases sans groupeIds ou avec groupeIds invalides : repush tous les
  //     groupes du scénario dans phases[0] (filet de sécurité).
  function _migrateScenarioV1ToPhases(s) {
    if (!s || typeof s !== "object") return;
    // Cas 1 : phases[] absente ou pas un array → crée phase implicite
    if (!Array.isArray(s.phases) || s.phases.length === 0) {
      const allGroupeIds = (Array.isArray(s.groupes) ? s.groupes : [])
        .map(function(g) { return g && g.id; })
        .filter(function(id) { return typeof id === "string"; });
      const phase0 = _construirePhase(0, PHASE_DEFAULT_NOM, allGroupeIds);
      // Si une execution existe déjà (scénario v1 lancé en Phase 3 historique),
      // reporte ses timestamps sur la phase implicite. Permet aux rapports
      // futurs (C5 PDF avec sections) d'afficher la durée correcte.
      if (s.execution && typeof s.execution === "object") {
        if (typeof s.execution.startedAt === "string") {
          phase0.startedAt = s.execution.startedAt;
        }
        if (typeof s.execution.endedAt === "string") {
          phase0.endedAt = s.execution.endedAt;
        }
      }
      s.phases = [phase0];
    }
    // Cas 2 : execution existe mais currentPhaseIdx absent → set à 0
    if (s.execution && typeof s.execution === "object"
        && typeof s.execution.currentPhaseIdx !== "number") {
      s.execution.currentPhaseIdx = 0;
    }
    // Cas 3 : filet de sécurité — si phase[0].groupeIds est vide alors qu'il
    // y a des groupes dans le scénario, on repush (cohérence avec doctrine
    // "1 phase implicite couvre tout v1").
    if (s.phases.length === 1
        && (!Array.isArray(s.phases[0].groupeIds) || s.phases[0].groupeIds.length === 0)
        && Array.isArray(s.groupes) && s.groupes.length > 0) {
      s.phases[0].groupeIds = s.groupes
        .map(function(g) { return g && g.id; })
        .filter(function(id) { return typeof id === "string"; });
    }
  }

  // Retourne la phase active du scénario (= celle d'index execution.currentPhaseIdx).
  // Si execution absente OU phases[] absente → retourne phases[0] (= phase implicite
  // après migration). Si tout est cassé → null.
  function _getCurrentPhase(s) {
    if (!s || !Array.isArray(s.phases) || s.phases.length === 0) return null;
    const idx = (s.execution && typeof s.execution.currentPhaseIdx === "number")
                ? s.execution.currentPhaseIdx
                : 0;
    return s.phases[idx] || s.phases[0] || null;
  }

  // Retourne la liste des objets groupes ASSIGNÉS à une phase donnée.
  // Si phase invalide → array vide. Filtre les groupeIds qui ne matchent plus
  // (équipe supprimée du scénario depuis = à virer du groupeIds, voir C2/C3).
  function _listerEquipesPhase(s, phaseIdx) {
    if (!s || !Array.isArray(s.phases) || !Array.isArray(s.groupes)) return [];
    const phase = s.phases[phaseIdx];
    if (!phase || !Array.isArray(phase.groupeIds)) return [];
    return phase.groupeIds
      .map(function(gid) {
        return s.groupes.find(function(g) { return g.id === gid; });
      })
      .filter(function(g) { return g != null; });
  }

  // True si l'équipe equipeId est listée dans phases[phaseIdx].groupeIds.
  // Tolère phase ou equipeId invalides → false.
  function _groupeParticipeAPhase(s, equipeId, phaseIdx) {
    if (!s || !Array.isArray(s.phases) || typeof equipeId !== "string") return false;
    const phase = s.phases[phaseIdx];
    if (!phase || !Array.isArray(phase.groupeIds)) return false;
    return phase.groupeIds.indexOf(equipeId) !== -1;
  }

  // 🆕 v1.29.0 C2 — Mutations phases (encapsulées pour garantir invariants).
  // ───────────────────────────────────────────────────────────────────

  // Crée une nouvelle phase à la fin du tableau (idx auto). Retourne la phase
  // créée OU null si scénario introuvable. nom par défaut = "Phase N+1".
  // groupeIds = équipes assignées (peut être vide, l'Op peut cocher ensuite).
  function creerPhase(scenarioId, nom, groupeIds) {
    const s = get(scenarioId);
    if (!s) return null;
    if (!Array.isArray(s.phases)) s.phases = [];
    const nextIdx = s.phases.length;
    const safeName = (typeof nom === "string" && nom.trim())
                     ? nom.trim().slice(0, 80)
                     : "Phase " + (nextIdx + 1);
    // Filtre : ne garde que les groupeIds qui matchent des équipes existantes
    const safeGroupeIds = (Array.isArray(groupeIds) ? groupeIds : [])
      .filter(function(gid) {
        return typeof gid === "string"
            && s.groupes.some(function(g) { return g.id === gid; });
      });
    const phase = _construirePhase(nextIdx, safeName, safeGroupeIds);
    s.phases.push(phase);
    _commitMutation(s);
    return phase;
  }

  // Renomme une phase (whitelist). Retourne true si OK, false sinon.
  function renommerPhase(scenarioId, phaseIdx, nouveauNom) {
    const s = get(scenarioId);
    if (!s || !Array.isArray(s.phases)) return false;
    const phase = s.phases[phaseIdx];
    if (!phase) return false;
    if (typeof nouveauNom !== "string") return false;
    const safe = nouveauNom.trim().slice(0, 80);
    if (!safe) return false;
    phase.nom = safe;
    _commitMutation(s);
    return true;
  }

  // Supprime une phase. Garde-fous :
  //   - Refuse si c'est la dernière phase (au moins 1 phase doit exister).
  //   - Refuse si la phase est ACTIVE dans l'exécution (passer par
  //     terminerPhase/lancerPhaseSuivante de C3 plutôt).
  //   - Refuse si la phase a startedAt set (historique préservé).
  // Re-numérote les idx des phases restantes.
  function supprimerPhase(scenarioId, phaseIdx) {
    const s = get(scenarioId);
    if (!s || !Array.isArray(s.phases)) return false;
    if (s.phases.length <= 1) {
      console.warn("[SecoursMode] Refus suppression : au moins 1 phase doit exister.");
      return false;
    }
    const phase = s.phases[phaseIdx];
    if (!phase) return false;
    // Refus si phase active dans l'exécution
    if (s.execution && s.execution.active === true
        && s.execution.currentPhaseIdx === phaseIdx) {
      console.warn("[SecoursMode] Refus suppression : phase active. Utiliser terminerPhase (C3).");
      return false;
    }
    // Refus si phase a déjà été démarrée (historique)
    if (phase.startedAt) {
      console.warn("[SecoursMode] Refus suppression : phase déjà démarrée (historique préservé).");
      return false;
    }
    s.phases.splice(phaseIdx, 1);
    // Re-numérote les idx
    s.phases.forEach(function(p, i) { p.idx = i; });
    // Ajuste execution.currentPhaseIdx si nécessaire (la suppression d'une
    // phase située AVANT la phase active décale d'un cran)
    if (s.execution && typeof s.execution.currentPhaseIdx === "number"
        && s.execution.currentPhaseIdx > phaseIdx) {
      s.execution.currentPhaseIdx--;
    }
    _commitMutation(s);
    return true;
  }

  // 🆕 v1.29.0 C3 — Helpers transitions / debrief / auto-détection.
  // ───────────────────────────────────────────────────────────────────

  // Détecte si la phase active est "prête à clore" (KARMA C3.2:a) :
  // toutes les équipes participantes ont leur étape SORTIE avec completedAt.
  // Si une équipe n'a pas de parcours (pas d'étape sortie) on l'IGNORE
  // (pas de critère bloquant — l'Op décide quand même).
  // Retourne true uniquement si AU MOINS UNE équipe a une sortie ET
  // toutes les équipes avec sortie l'ont complétée.
  function _phaseEstPretAClore(s) {
    if (!s || !s.execution || !s.execution.active) return false;
    if (!s.execution.etapes) return false;
    const phaseIdx = s.execution.currentPhaseIdx || 0;
    const equipes = _listerEquipesPhase(s, phaseIdx);
    if (!equipes.length) return false;
    let auMoinsUneSortie = false;
    for (let i = 0; i < equipes.length; i++) {
      const g = equipes[i];
      const arr = s.execution.etapes[g.id];
      if (!Array.isArray(arr)) continue;
      // Cherche l'étape de type "sortie"
      const sortie = arr.find(function(e) { return e && e.type === "sortie"; });
      if (!sortie) continue;
      auMoinsUneSortie = true;
      if (!sortie.completedAt) return false;
    }
    return auMoinsUneSortie;
  }

  // Archive les étapes de la phase courante avant un passage de phase.
  // Stocke dans s.execution.etapesArchive[phaseIdx] = deep clone de
  // s.execution.etapes. Permet aux rapports (C5) de remonter l'historique
  // par phase sans avoir à tagger chaque étape avec _phaseIdx.
  function _archivePhaseEtapes(s, phaseIdx) {
    if (!s || !s.execution) return;
    if (!s.execution.etapesArchive) s.execution.etapesArchive = {};
    // Deep clone via JSON pour figer l'état (les étapes ne doivent plus
    // évoluer après archivage, c'est le contrat de l'historique).
    try {
      s.execution.etapesArchive[String(phaseIdx)] =
        JSON.parse(JSON.stringify(s.execution.etapes || {}));
      // 4e relecture (R4-4) : les signalements hors parcours de la phase sont gardés
      // avec son historique (avant : effacés au passage de phase, sans trace).
      if (s.execution._etapesRetirees) {
        s.execution.etapesArchive[String(phaseIdx)]._retirees =
          JSON.parse(JSON.stringify(s.execution._etapesRetirees));
      }
    } catch(e) {
      console.warn("[SecoursMode] _archivePhaseEtapes échec :", e);
    }
  }

  // Lecture : retourne les étapes archivées d'une équipe pour une phase
  // donnée. Si la phase est encore active OU absente d'archive, retourne
  // null (le caller doit fallback sur s.execution.etapes pour la phase
  // courante via _getEtapesEquipe).
  function _getArchivedEtapes(s, phaseIdx, equipeId) {
    if (!s || !s.execution || !s.execution.etapesArchive) return null;
    const archive = s.execution.etapesArchive[String(phaseIdx)];
    if (!archive || !Array.isArray(archive[equipeId])) return null;
    return archive[equipeId];
  }

  // Termine la phase active. Archive les étapes courantes + set endedAt.
  // **Ne lance PAS automatiquement la phase suivante** (KARMA C3.2:c flow
  // hybride : auto-détection assiste mais ne décide pas — le debrief +
  // lancerPhaseSuivante sont des étapes utilisateur explicites).
  // Si opts.debrief (string) fourni → enregistre dans phase.debrief +
  // phase.debriefAt = now.
  // Retourne le scénario muté ou null si erreur.
  function terminerPhase(scenarioId, opts) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.active) return null;
    if (!Array.isArray(s.phases)) return null;
    const phaseIdx = s.execution.currentPhaseIdx || 0;
    const phase = s.phases[phaseIdx];
    if (!phase) return null;
    if (phase.endedAt) {
      console.warn("[SecoursMode] terminerPhase : phase déjà terminée.");
      return s;
    }
    // 1. Archive les étapes courantes (deep clone)
    _archivePhaseEtapes(s, phaseIdx);
    // 2. Marque la phase comme terminée
    phase.endedAt = _nowIso();
    if (opts && typeof opts.debrief === "string") {
      phase.debrief = opts.debrief.slice(0, 5000);
      phase.debriefAt = _nowIso();
    }
    _commitMutation(s);
    return s;
  }

  // Lance la phase suivante (phaseIdx + 1). Pré-conditions :
  //   - L'execution doit être active
  //   - La phase actuelle DOIT être terminée (endedAt set, via terminerPhase)
  //   - Il doit exister une phase d'index supérieur
  // Pour chaque équipe participant à la nouvelle phase, reconstruit les
  // étapes depuis le parcours ACTUEL du groupe (KARMA C3.1:b — Op peut
  // avoir modifié entree/sortie/intermediaires entre les phases).
  // Les équipes ne participant PAS à la nouvelle phase voient leur entry
  // dans s.execution.etapes supprimée (= la vue Live Op n'affiche plus
  // que les équipes pertinentes). Leurs étapes archivées restent dans
  // s.execution.etapesArchive pour les rapports.
  // Retourne la phase suivante mutée OU null si erreur.
  function lancerPhaseSuivante(scenarioId) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.active) return null;
    if (!Array.isArray(s.phases)) return null;
    const currentIdx = s.execution.currentPhaseIdx || 0;
    const nextIdx = currentIdx + 1;
    if (nextIdx >= s.phases.length) {
      console.warn("[SecoursMode] lancerPhaseSuivante : pas de phase suivante.");
      return null;
    }
    const currentPhase = s.phases[currentIdx];
    if (!currentPhase || !currentPhase.endedAt) {
      console.warn("[SecoursMode] lancerPhaseSuivante : phase actuelle non terminée. Appeler terminerPhase d'abord.");
      return null;
    }
    const nextPhase = s.phases[nextIdx];
    if (!nextPhase) return null;
    // 1. Pour chaque équipe participant à la nouvelle phase, rebuild les
    //    étapes depuis le parcours ACTUEL. KARMA C3.1:b — les modifs de
    //    parcours faites par l'Op entre P1 et P2 sont prises en compte.
    const newEtapes = {};
    const participants = _listerEquipesPhase(s, nextIdx);
    participants.forEach(function(g) {
      newEtapes[g.id] = _buildEtapesPourEquipe(g);
    });
    // Préserve _notes_libres si présent (mode secouriste libre, indépendant
    // des équipes)
    if (s.execution.etapes && s.execution.etapes._notes_libres) {
      newEtapes._notes_libres = s.execution.etapes._notes_libres;
    }
    // 2e relecture (N2) : l'archive des étapes retirées appartient à la phase close —
    // une étape remise en phase 2 ne doit pas récupérer les saisies de la phase 1.
    delete s.execution._etapesRetirees;
    s.execution.etapes = newEtapes;
    // 2. Met à jour l'index de phase active + startedAt nouvelle phase
    s.execution.currentPhaseIdx = nextIdx;
    nextPhase.startedAt = _nowIso();
    // 3. Reset flag d'auto-détection pour permettre un nouveau toast quand
    //    la nouvelle phase sera prête à clore
    if (s.execution._phaseReadyToastShownForIdx === currentIdx) {
      delete s.execution._phaseReadyToastShownForIdx;
    }
    // 4. Reset focus stepper Live (cohérent avec lancerExecution hotfix11)
    _liveEquipeFocusIdx     = 0;
    _liveEquipeFreshSession = true;
    _commitMutation(s);
    return nextPhase;
  }

  // Toggle de participation d'une équipe à une phase (modèle hybride 1:c).
  // participe=true → ajoute si absent · participe=false → retire si présent.
  // Idempotent. Retourne true si la phase a été modifiée, false sinon.
  function affecterEquipeAPhase(scenarioId, equipeId, phaseIdx, participe) {
    const s = get(scenarioId);
    if (!s || !Array.isArray(s.phases) || typeof equipeId !== "string") return false;
    const phase = s.phases[phaseIdx];
    if (!phase) return false;
    if (!Array.isArray(phase.groupeIds)) phase.groupeIds = [];
    const pos = phase.groupeIds.indexOf(equipeId);
    let changed = false;
    if (participe && pos === -1) {
      // Vérifie que l'équipe existe
      if (s.groupes.some(function(g) { return g.id === equipeId; })) {
        phase.groupeIds.push(equipeId);
        changed = true;
      }
    } else if (!participe && pos !== -1) {
      phase.groupeIds.splice(pos, 1);
      changed = true;
    }
    // 🩸 Relecture 29/09 (R6) — équipe cochée dans la phase EN COURS : ses étapes.
    if (changed && participe && s.execution && s.execution.currentPhaseIdx === phaseIdx) {
      const g = s.groupes.find(function(x) { return x.id === equipeId; });
      _resyncEtapesEquipe(s, g);
    }
    if (changed) _commitMutation(s);
    return changed;
  }

  // Charge les scénarios depuis localStorage pour le plan courant.
  // Tolère absence (= array vide) et corruption (= reset + warn).
  // 🆕 v1.29.0 C1 — applique la migration multi-phases à chaque scénario
  // chargé (idempotent — pas de cycle si déjà migré).
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
      // Migration silencieuse multi-phases (rétro-compat v1 stricte)
      _scenarios.forEach(_migrateScenarioV1ToPhases);
      // 4e relecture (R4-6) : durées recalculées avec les réglages Secours propres
      if (_scenarios.map(_migrerDurees).some(Boolean)) {
        try { localStorage.setItem(key, JSON.stringify(_scenarios)); } catch(e) {}
      }
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
    // Cap FIFO : si > MAX, on retire les plus anciens par createdAt.
    // 🩸 29/09/2026 (audit Secours, A5) — JAMAIS un scénario en cours d'exécution
    // ni celui ouvert : avant, créer un 11ᵉ scénario pendant une intervention
    // pouvait effacer celle-ci. Le plus récent non plus (sinon, 10 en cours → le
    // scénario qu'on vient de créer disparaît). Tout l'excédent protégé → on dépasse le cap.
    // 🩸 Relecture 29/09 (R1) — un scénario IMPORTÉ garde le `createdAt` du PC : trié
    // parmi les plus anciens, il était purgé dans le commit même de l'import, sur un
    // téléphone qui avait déjà 10 scénarios (« importé » annoncé, liste vide). L'âge
    // FIFO est donc la plus récente de la création et de l'arrivée sur CET appareil.
    if (_scenarios.length > MAX_SCENARIOS) {
      const age = function(x) {
        return Math.max(Date.parse(x.createdAt || 0) || 0, Date.parse(x.arriveeAt || 0) || 0);
      };
      _scenarios.sort(function(a, b) { return age(a) - age(b); });
      let excess = _scenarios.length - MAX_SCENARIOS;
      const purges = [];
      for (let i = 0; i < _scenarios.length - 1 && excess > 0; i++) {
        const s = _scenarios[i];
        if ((s.execution && s.execution.active) || s.id === _currentScenarioId) continue;
        // 4e relecture (R4-16) : intervention TERMINÉE dont aucun rapport n'est encore
        // sorti de l'appareil — la purger effaçait ses saisies et ses photos.
        if (s.execution && s.execution.endedAt && !s.execution.rapportExporteAt) continue;
        purges.push(s.id);
        excess--;
      }
      _scenarios = _scenarios.filter(function(s) { return purges.indexOf(s.id) < 0; });
      purges.forEach(_purgerPhotosScenario);
      console.log("[SecoursMode] FIFO : " + purges.length + " scénario(s) ancien(s) purgé(s)" +
                  (excess > 0 ? ", " + excess + " protégé(s) (en cours / ouvert / non rapporté)" : ""));
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
          t("secours.toast.quotaExceeded"),
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
    _majFooterSecours();
    // Auto-refresh overlay si on est en train d'afficher ce scénario sur la carte
    if (_overlayLayer && scenario && scenario.id === _currentScenarioId) {
      renderOverlay(scenario.id);
    }
    // 🆕 v1.29.0-fix5 — Event générique sur window pour permettre à des
    // modules extérieurs (intégrations tierces, plugins, déclinaisons
    // commerciales, extensions navigateur, etc.) de réagir aux mutations
    // sans avoir à passer par _changeListeners (qui transmet la liste
    // COMPLÈTE des scénarios). Ici on émet une info CIBLÉE — scenarioId,
    // planExternalId, updatedAt — suffisant pour qu'un listener fasse
    // un traitement différentiel (re-render partiel, persistance ailleurs,
    // notification, etc.).
    //
    // Aucun listener n'est attaché côté community → no-op total côté UX.
    // Convention de nommage `mktm:*` cohérente avec `mktm:license-changed`
    // émis par js/proLicense.js.
    try {
      window.dispatchEvent(new CustomEvent("mktm:secours-scenario-mutated", {
        detail: {
          scenarioId:     (scenario && scenario.id) || null,
          planExternalId: (typeof window !== "undefined" && window._currentLoadedPlanId) || null,
          updatedAt:      (scenario && scenario.updatedAt) || null,
          ts:             _nowIso()
        }
      }));
    } catch(e) {
      // Anciens browsers sans CustomEvent constructor → swallow silencieux
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
                     : t("secours.scenario.defaultNom", { date: new Date().toLocaleDateString(window.ktaLocale ? window.ktaLocale() : "fr-FR") });
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
      pointsCles: [],
      // 🆕 v1.29.0 C1 — Init avec 1 phase vide. Les équipes ajoutées via
      // addGroupe seront poussées par défaut dans phases[0].groupeIds.
      // C2 permettra de créer phases[1], phases[2], etc. avec leur propre
      // selection d'équipes (modèle hybride 1:c).
      phases: [_construirePhase(0, PHASE_DEFAULT_NOM, [])]
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
    if ("reglagesDuree" in partial && partial.reglagesDuree && typeof partial.reglagesDuree === "object") {
      const r = partial.reglagesDuree;
      s.reglagesDuree = {
        vitesseKmh: Math.max(0.2, Math.min(8, Number(r.vitesseKmh) || DUREE_DEFAUT.vitesseKmh)),
        pauseMin:   Math.max(0, Math.min(120, Number(r.pauseMin) || 0))
      };
    }
    _commitMutation(s);
    return s;
  }

  // Supprime un scénario par id. Retourne true si trouvé+supprimé.
  // 2e relecture (N10b) : les photos d'un scénario qui disparaît (supprimé, purgé par
  // la limite de 10) ou d'une exécution relancée restaient en base sous les mêmes
  // ids : exclues du rapport depuis, mais elles comptaient encore dans le quota de
  // 5 par étape. Elles partent avec leur scénario / leur exécution.
  function _purgerPhotosScenario(id) {
    const P = window.MyKTAMapSecoursPhotos;
    if (!id || !P || typeof P.deletePhotosForScenario !== "function") return;
    P.deletePhotosForScenario(id).catch(function(e) { console.warn("[SecoursMode] photos :", e); });
  }

  function deleteScenario(id) {
    const idx = _scenarios.findIndex(function(s) { return s.id === id; });
    if (idx < 0) return false;
    _scenarios.splice(idx, 1);
    _purgerPhotosScenario(id);
    // Si on supprime le scénario courant, on désactive le focus
    if (_currentScenarioId === id) {
      _currentScenarioId = null;
      clearOverlay();
    }
    _saveScenarios();
    _notify();
    return true;
  }

  // ============================================================
  // 🆕 v1.24.0 Phase 3 — CRUD EXECUTION (mode terrain)
  // ============================================================
  //
  // Modèle de données scenario.execution :
  //   {
  //     active:          boolean,             // true tant que le plan est lancé
  //     startedAt:       ISO,                 // début du déclenchement
  //     endedAt:         ISO | null,          // null = en cours
  //     pausedAt:        ISO | null,          // si pause, ISO du début de pause
  //     pausedTotalMs:   number,              // cumul des pauses (pour timer juste)
  //     role:            "operateur" | "equipe" | "secouriste",
  //     currentEquipeId: string | null,       // équipe focus si role="equipe"
  //     etapes: {
  //       [equipeId]: [
  //         {
  //           type:          "entree" | "interm" | "sortie",
  //           idx:           number,           // 0=entrée, 1..N=intermédiaires, N+1=sortie
  //           label:         string,           // hérité du parcours (POI name ou coords)
  //           observations:  string,           // user input libre
  //           statut:        "pending" | "ras" | "suspect" | ... (cf TABLEAU_STATUTS),
  //           photoIds:      [string, ...],    // ids dans MyKTAMapSecoursPhotos (IDB)
  //           startedAt:     ISO | null,       // quand l'équipe arrive à cette étape
  //           completedAt:   ISO | null        // quand elle passe à la suivante
  //         },
  //         ...
  //       ],
  //       // Pour role="secouriste" : tableau de notes libres avec timestamps
  //       _notes_libres: [
  //         { id, ts, statut, texte, photoIds }
  //       ]
  //     }
  //   }
  //
  // Persistance dans le scénario localStorage existant (myktamap_secours_v1_<planId>).
  // Pas de nouvelle DB. Le plan switch ne ferme PAS l'execution active.

  // Helper interne — construit le tableau d'étapes pour une équipe depuis son
  // parcours actuel (entree + intermediaires + sortie). À appeler au lancement.
  // Crée des étapes avec statut "pending" partout. Ne touche pas aux étapes
  // déjà existantes si l'execution a été relancée (préserve observations).
  function _buildEtapesPourEquipe(g) {
    const etapes = [];
    let idx = 0;
    if (g.entree) {
      etapes.push({
        type:         "entree",
        idx:          idx++,
        label:        g.entree.label || _fmtPoint(g.entree),
        cle:          _cleWaypoint(g.entree),
        wid:          g.entree.wid || null,
        observations: "",
        statut:       "pending",
        photoIds:     [],
        startedAt:    null,
        completedAt:  null
      });
    }
    if (Array.isArray(g.intermediaires)) {
      g.intermediaires.forEach(function(wp) {
        etapes.push({
          type:         "interm",
          idx:          idx++,
          label:        wp.label || _fmtPoint(wp),
          cle:          _cleWaypoint(wp),
          wid:          wp.wid || null,
          observations: "",
          statut:       "pending",
          photoIds:     [],
          startedAt:    null,
          completedAt:  null
        });
      });
    }
    if (g.sortie) {
      etapes.push({
        type:         "sortie",
        idx:          idx++,
        label:        g.sortie.label || _fmtPoint(g.sortie),
        cle:          _cleWaypoint(g.sortie),
        wid:          g.sortie.wid || null,
        observations: "",
        statut:       "pending",
        photoIds:     [],
        startedAt:    null,
        completedAt:  null
      });
    }
    return etapes;
  }

  // 🩸 29/09/2026 (audit Secours) — UNE ÉQUIPE AJOUTÉE OU MODIFIÉE PENDANT UNE PHASE
  // N'AVAIT PAS SES ÉTAPES. Les étapes ne se construisaient qu'au lancement et au
  // passage de phase : un renfort ajouté en cours n'avait aucun stepper, et un
  // parcours modifié gardait l'ancien. On reconstruit depuis le parcours actuel et
  // on reporte ce qui est déjà saisi sur l'étape de même type + même libellé (dans
  // l'ordre, pour les homonymes). Une étape retirée qui portait des données n'est
  // pas jetée : elle part dans `execution._etapesRetirees[gid]` (traçabilité).
  //
  // 🩸 Relecture 29/09 (R3, R4, R6, R7) — la 1re version appariait par libellé seul :
  // deux « Carrefour » échangeaient leurs saisies, une étape remise ne retrouvait
  // pas ses données, la photo d'une étape retirée passait à sa voisine, l'étape
  // affichée n'était pas recalée. Désormais : appariement par POSITION du point
  // (`cle`), puis libellé par rang d'occurrence (`_apparierEtapes`) ; une étape
  // qui revient est restaurée depuis l'archive ; les photos suivent leur étape en
  // IndexedDB (`setStepIdx`, -2 = étape retirée) ; le focus live est recalé.
  const ETAPE_CHAMPS_SAISIS = ["statut", "observations", "photoIds", "startedAt", "completedAt", "_importedFrom",
    "_obsImport", "victimePos"];   // _obsImport : R4-3 ; victimePos : A3 (position précisée)
  function _etapeADesDonnees(e) {
    return !!e && (e.statut !== "pending" || !!(e.observations || "").trim()
                   || (e.photoIds || []).length > 0 || !!e.startedAt);
  }
  function _cleWaypoint(wp) {
    if (!wp || typeof wp.x !== "number" || typeof wp.y !== "number") return null;
    return Math.round(wp.x) + "," + Math.round(wp.y) + "," + (Number.isInteger(wp.level) ? wp.level : 0);
  }
  // 🩸 2e relecture 29/09 (N1, N3, N7, N8) — le repli par LIBELLÉ reliait des étapes
  // sans rapport (« Puits » ailleurs, homonyme de remplacement, aller-retour par le
  // même carrefour). Chaque point de passage a désormais une IDENTITÉ `wid`, posée à
  // sa création (updateGroupe, export, lancement) ; chaque étape porte celle de son
  // point. C'est la seule clé ; la position ne sert qu'aux données d'avant (sans
  // wid), le libellé qu'aux rapports d'avant la v1.98.8 (ni wid ni position).
  //
  // 🩸 3e relecture (R3-1) — les wid étaient TIRÉS AU HASARD sur chaque appareil :
  // un téléphone qui lançait un .mkmsec d'avant la version s'en fabriquait d'autres
  // que le PC → au rapport, 1 étape fusionnée sur 5, victime dupliquée. Un wid manquant
  // est désormais CALCULÉ (équipe + rôle + position + rang d'occurrence) : deux
  // appareils qui ont le même parcours trouvent le même, sans échanger quoi que ce soit.
  function _widDeterministe(gid, role, wp, rang) {
    const src = String(gid || "") + "|" + role + "|" + (_cleWaypoint(wp) || "") + "|" + rang;
    let h = 0x811c9dc5;
    for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return "W" + h.toString(36) + "r" + rang;
  }
  // Pose les wid manquants d'un parcours [{role, wp}] (ordre du parcours). Le rang
  // compte TOUS les points de même rôle et même position, avec ou sans wid.
  function _poserWids(gid, parcours) {
    const pris = new Set();
    parcours.forEach(function(it) { if (it.wp && it.wp.wid) pris.add(it.wp.wid); });
    const rangs = {};
    let chg = false;
    parcours.forEach(function(it) {
      const wp = it.wp;
      if (!wp || typeof wp !== "object") return;
      const k = it.role + "|" + (_cleWaypoint(wp) || "");
      rangs[k] = (rangs[k] === undefined) ? 0 : rangs[k] + 1;
      if (wp.wid) return;
      let r = rangs[k], w = _widDeterministe(gid, it.role, wp, r);
      while (pris.has(w)) { r += 1000; w = _widDeterministe(gid, it.role, wp, r); }
      wp.wid = w; pris.add(w); chg = true;
    });
    return chg;
  }
  function _parcoursRoles(entree, intermediaires, sortie) {
    const out = [];
    if (entree) out.push({ role: "entree", wp: entree });
    (intermediaires || []).forEach(function(w) { out.push({ role: "interm", wp: w }); });
    if (sortie) out.push({ role: "sortie", wp: sortie });
    return out;
  }
  function _normaliserParcours(g) {
    if (!g) return false;
    return _poserWids(g.id, _parcoursRoles(g.entree, g.intermediaires, g.sortie));
  }
  // Étapes construites avant les wid : elles correspondent une à une au parcours
  // ACTUEL (toute modification en exécution resynchronise) → on leur rattache le wid.
  function _rattacherWidEtapes(s, g) {
    const ex = s && s.execution;
    const et = ex && ex.etapes && g && ex.etapes[g.id];
    if (!Array.isArray(et) || et.every(function(e) { return e && e.wid; })) return;
    const liste = [];
    if (g.entree) liste.push(g.entree);
    (g.intermediaires || []).forEach(function(w) { liste.push(w); });
    if (g.sortie) liste.push(g.sortie);
    if (liste.length !== et.length) return;
    // 3e relecture (R3-9) : une exécution démarrée avant les resync peut avoir des
    // étapes décalées du parcours → on ne rattache que si type ET libellé concordent.
    const roles = _parcoursRoles(g.entree, g.intermediaires, g.sortie);
    et.forEach(function(e, i) {
      const w = liste[i];
      if (!w || e.type !== roles[i].role || e.label !== (w.label || _fmtPoint(w))) return;
      if (!e.wid && w.wid) e.wid = w.wid;
      if (!e.cle) e.cle = _cleWaypoint(w);
    });
  }
  // Mêmes conditions pour la resync ET la garde de retrait (2e relecture, N4).
  function _resyncApplicable(s, g) {
    const ex = s && s.execution;
    if (!ex || !ex.active || !ex.etapes || !g) return false;
    if (ex.role === "secouriste" && !Array.isArray(ex.etapes[g.id])
        && !Object.keys(ex.etapes).some(function(k) { return k !== "_notes_libres"; })) return false;
    const phaseIdx = (typeof ex.currentPhaseIdx === "number") ? ex.currentPhaseIdx : 0;
    if (Array.isArray(s.phases) && s.phases.length > 0 && !_groupeParticipeAPhase(s, g.id, phaseIdx)) return false;
    return true;
  }
  // Pour chaque cible, la source appariée (ou null). Chaque source ne sert qu'une
  // fois. Passe 1 : même wid. Passe 2 (l'un des deux sans wid) : même type + même
  // position. Passe 3 (cible sans wid ni position : rapport d'avant v1.98.8) : même
  // type + même libellé, dans l'ordre. Passe 4 : cible sans libellé → même numéro.
  function _apparierEtapes(sources, cibles) {
    // 3e relecture (R3-1) : un wid INCONNU de l'autre côté (tiré ailleurs, ou d'avant
    // les wid calculés) ne vaut rien : on retombe sur la position, puis le libellé.
    const widsS = new Set(sources.map(function(x) { return x && x.wid; }).filter(Boolean));
    const widsC = new Set(cibles.map(function(x) { return x && x.wid; }).filter(Boolean));
    const widConnu = function(a, c) { return !!a.wid && !!c.wid && widsC.has(a.wid) && widsS.has(c.wid); };
    const pris = new Set();
    const res = cibles.map(function() { return null; });
    const passe = function(test) {
      cibles.forEach(function(c, i) {
        if (res[i] || !c) return;
        const j = sources.findIndex(function(src, k) { return src && !pris.has(k) && test(src, c); });
        if (j >= 0) { pris.add(j); res[i] = sources[j]; }
      });
    };
    passe(function(a, c) { return !!a.wid && a.wid === c.wid; });
    passe(function(a, c) { return !widConnu(a, c) && a.type === c.type && !!a.cle && a.cle === c.cle; });
    passe(function(a, c) {
      return ((!c.wid && !c.cle) || (!a.wid && !a.cle)) && a.type === c.type && !!c.label && a.label === c.label;
    });
    passe(function(a, c) { return !c.label && a.idx === c.idx; });
    return res;
  }
  function _reporterSaisies(de, vers) {
    ETAPE_CHAMPS_SAISIS.forEach(function(k) { if (k in de) vers[k] = de[k]; });
  }
  // Étapes qui PERDRAIENT leurs saisies si l'on appliquait `partial` au parcours.
  function _etapesPerduesSi(s, g, partial) {
    const ex = s && s.execution;
    if (!_resyncApplicable(s, g) || !Array.isArray(ex.etapes[g.id])) return [];
    const futur = Object.assign({}, g);
    ["entree", "sortie", "intermediaires"].forEach(function(k) { if (k in partial) futur[k] = partial[k]; });
    const anciennes = ex.etapes[g.id];
    const paires = _apparierEtapes(anciennes, _buildEtapesPourEquipe(futur));
    return anciennes.filter(function(o) { return paires.indexOf(o) < 0 && _etapeADesDonnees(o); });
  }
  function _photosVersEtape(photoIds, idx) {
    const P = window.MyKTAMapSecoursPhotos;
    if (!P || typeof P.setStepIdx !== "function" || !Array.isArray(photoIds)) return;
    photoIds.forEach(function(id) {
      P.setStepIdx(id, idx).catch(function(e) { console.warn("[SecoursMode] photo " + id + " :", e); });
    });
  }
  function _resyncEtapesEquipe(s, g) {
    const ex = s && s.execution;
    if (!_resyncApplicable(s, g)) return false;
    _normaliserParcours(g);
    const anciennes = Array.isArray(ex.etapes[g.id]) ? ex.etapes[g.id] : [];
    const nouvelles = _buildEtapesPourEquipe(g);
    const archive = (ex._etapesRetirees && ex._etapesRetirees[g.id]) || [];
    // 1. saisies des étapes conservées
    const paires = _apparierEtapes(anciennes, nouvelles);
    nouvelles.forEach(function(n, i) {
      const o = paires[i];
      if (!o) return;
      _reporterSaisies(o, n);
      if (o.idx !== n.idx) _photosVersEtape(n.photoIds, n.idx);
    });
    // 2. étape qui revient : restaurée depuis l'archive
    const orphelines = nouvelles.filter(function(n, i) { return !paires[i]; });
    const restaurees = _apparierEtapes(archive, orphelines);
    orphelines.forEach(function(n, i) {
      const a = restaurees[i];
      if (!a) return;
      _reporterSaisies(a, n);
      delete n.retireeAt;
      _photosVersEtape(n.photoIds, n.idx);
    });
    // 3. étapes retirées porteuses de données → archive (photos hors rapport : -2)
    const gardeArchive = archive.filter(function(a) { return restaurees.indexOf(a) < 0; });
    anciennes.forEach(function(o) {
      if (paires.indexOf(o) >= 0 || !_etapeADesDonnees(o)) return;
      gardeArchive.push(Object.assign({}, o, { retireeAt: _nowIso() }));
      _photosVersEtape(o.photoIds, -2);
    });
    ex._etapesRetirees = ex._etapesRetirees || {};
    if (gardeArchive.length > 0) ex._etapesRetirees[g.id] = gardeArchive;
    else delete ex._etapesRetirees[g.id];
    // 4. étape affichée recalée (équipe en cours sur cet appareil)
    if (ex.currentEquipeId === g.id) {
      const vue = anciennes[_liveEquipeFocusIdx];
      const k = vue ? paires.indexOf(vue) : -1;
      _liveEquipeFocusIdx = (k >= 0) ? k : Math.min(_liveEquipeFocusIdx, Math.max(0, nouvelles.length - 1));
    }
    ex.etapes[g.id] = nouvelles;
    return true;
  }

  // Lance l'exécution d'un scénario. Initialise s.execution avec étapes
  // par équipe construites depuis les parcours. Marque active=true +
  // startedAt = now. Cas particulier role="secouriste" : pas d'équipes
  // utilisées, juste un tableau _notes_libres pour les notes en vrac.
  // Retourne le scénario muté ou null si introuvable.
  function lancerExecution(scenarioId, opts) {
    const s = get(scenarioId);
    if (!s) return null;
    opts = opts || {};
    const role = opts.role || "operateur";
    const currentEquipeId = opts.currentEquipeId || null;

    // Si une execution existe déjà et est active → ne pas écraser (l'user
    // doit l'arrêter explicitement avant de relancer). Permettre reprise
    // via setRole/setCurrentEquipe au lieu de relance.
    if (s.execution && s.execution.active === true) {
      // Update du rôle/équipe sans casser les étapes existantes
      s.execution.role = role;
      s.execution.currentEquipeId = currentEquipeId;
      _commitMutation(s);
      return s;
    }

    // Construction initiale ou réinitialisation
    if (s.execution) _purgerPhotosScenario(s.id);     // exécution relancée : photos de l'ancienne
    (s.groupes || []).forEach(_normaliserParcours);   // identités des points (wid)
    const etapes = {};
    if (role !== "secouriste") {
      // Mode équipe/opérateur : 1 array d'étapes par équipe
      (s.groupes || []).forEach(function(g) {
        etapes[g.id] = _buildEtapesPourEquipe(g);
      });
    } else {
      // Mode secouriste libre : pas d'équipes structurées
      etapes._notes_libres = [];
    }

    s.execution = {
      active:          true,
      startedAt:       _nowIso(),
      endedAt:         null,
      pausedAt:        null,
      pausedTotalMs:   0,
      role:            role,
      currentEquipeId: currentEquipeId,
      etapes:          etapes,
      // 🆕 v1.29.0 C1 — Index de la phase active. C2 ajoutera l'UI pour
      // créer phases[1+] et naviguer entre elles. C3 ajoutera transition
      // automatique avec confirmation Op (modèle hybride 2:c).
      currentPhaseIdx: 0
    };
    // 🆕 v1.29.0 C1 — Set startedAt de la phase 0 au lancement initial.
    // Si re-lancement ultérieur (cas marginal Phase 3 hotfix11), on ne touche
    // PAS startedAt si déjà set (= préserver l'historique de la mission).
    if (Array.isArray(s.phases) && s.phases[0] && !s.phases[0].startedAt) {
      s.phases[0].startedAt = s.execution.startedAt;
    }
    // 🐛 hotfix11 — Reset focus + fresh session flag pour le nouveau lancement.
    // Permet le smart-skip initial vers la 1ère étape pending au boot,
    // tout en laissant ensuite la nav user (prev/next/stepper) prendre le relai.
    _liveEquipeFocusIdx     = 0;
    _liveEquipeFreshSession = true;
    _commitMutation(s);
    return s;
  }

  // Arrête l'exécution d'un scénario. Garde execution comme historique
  // (active=false + endedAt set). Permet le re-affichage du rapport final
  // ultérieurement sans perdre les observations.
  function arreterExecution(scenarioId) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.active) return null;
    // Si on était en pause, comptabilise le dernier segment avant d'arrêter
    if (s.execution.pausedAt) {
      const pauseDur = Date.now() - Date.parse(s.execution.pausedAt);
      if (pauseDur > 0) s.execution.pausedTotalMs += pauseDur;
      s.execution.pausedAt = null;
    }
    s.execution.active = false;
    s.execution.endedAt = _nowIso();
    // 🆕 v1.29.0 C1 — Set endedAt sur la phase active (filet pour le cas où
    // l'utilisateur arrête sans passer par "Terminer phase" de C3). Idempotent :
    // si déjà set par C3, on ne touche pas.
    if (Array.isArray(s.phases)) {
      const idx = (typeof s.execution.currentPhaseIdx === "number")
                  ? s.execution.currentPhaseIdx
                  : 0;
      const phase = s.phases[idx];
      if (phase && !phase.endedAt) {
        phase.endedAt = s.execution.endedAt;
      }
    }
    _commitMutation(s);
    return s;
  }

  // Met en pause OU reprend l'exécution. Calcule pausedTotalMs pour que
  // le timer affiché reste juste (= temps écoulé - temps de pause cumulé).
  function pauseExecution(scenarioId, paused) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.active) return null;
    if (paused && !s.execution.pausedAt) {
      // Démarre une pause
      s.execution.pausedAt = _nowIso();
    } else if (!paused && s.execution.pausedAt) {
      // Reprend
      const pauseDur = Date.now() - Date.parse(s.execution.pausedAt);
      if (pauseDur > 0) s.execution.pausedTotalMs += pauseDur;
      s.execution.pausedAt = null;
    }
    _commitMutation(s);
    return s;
  }

  // Update partiel d'une étape d'équipe (whitelist anti-pollution).
  // Champs mutables : observations, statut, photoIds, startedAt, completedAt.
  function updateEtape(scenarioId, equipeId, etapeIdx, partial) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.etapes) return null;
    const arr = s.execution.etapes[equipeId];
    if (!Array.isArray(arr) || etapeIdx < 0 || etapeIdx >= arr.length) return null;
    const et = arr[etapeIdx];
    if (!partial || typeof partial !== "object") return et;
    if ("observations" in partial && typeof partial.observations === "string") {
      et.observations = partial.observations.slice(0, 2000);
    }
    if ("statut" in partial && typeof partial.statut === "string") {
      // Valide contre TABLEAU_STATUTS
      const info = TABLEAU_STATUTS.find(function(st) { return st.id === partial.statut; });
      if (info) et.statut = info.id;
    }
    if ("photoIds" in partial && Array.isArray(partial.photoIds)) {
      et.photoIds = partial.photoIds.slice();
    }
    if ("startedAt" in partial) {
      et.startedAt = partial.startedAt;   // string ISO ou null accepté
    }
    if ("completedAt" in partial) {
      et.completedAt = partial.completedAt;
    }
    if ("victimePos" in partial) {   // A3 : position précisée de la victime (ou null)
      const v = partial.victimePos;
      et.victimePos = (v && typeof v.x === "number" && typeof v.y === "number")
        ? { x: v.x, y: v.y, level: Number.isInteger(v.level) ? v.level : 0, at: v.at || _nowIso() } : null;
    }
    _commitMutation(s);
    // 🆕 v1.29.0 C3 — Watcher auto-détection (KARMA C3.2:a + C3.2:c hybride) :
    // si la mutation vient de compléter une étape sortie ET que toutes les
    // équipes participantes de la phase active ont leur sortie completée,
    // déclenche un toast Op "Phase prête à clore" (qu'une seule fois par
    // phase pour ne pas spammer).
    // Conditions d'affichage du toast :
    //   - role Operateur (les équipiers ne peuvent pas terminer une phase)
    //   - Multi-phases (phases.length >= 2) — pas de pollution mono-phase
    //   - Pas déjà affiché pour cette phase (flag _phaseReadyToastShownForIdx)
    try {
      const phaseIdx = s.execution.currentPhaseIdx || 0;
      const isOp = (s.execution.role === "operateur");
      const isMulti = Array.isArray(s.phases) && s.phases.length >= 2;
      const alreadyShown = (s.execution._phaseReadyToastShownForIdx === phaseIdx);
      if (isOp && isMulti && !alreadyShown && _phaseEstPretAClore(s)) {
        s.execution._phaseReadyToastShownForIdx = phaseIdx;
        _commitMutation(s);
        // Toast assistant non bloquant — l'Op clique pour ouvrir le debrief.
        // Ne ferme PAS auto, important : l'Op doit volontairement confirmer.
        _toast(t("secours.toast.phasePretAClore"), "info");
      }
    } catch(e) { /* swallow watcher errors */ }
    return et;
  }

  // Raccourci avec timestamps auto : marque le statut d'une étape +
  // pose completedAt = now si non-pending (= étape effectivement traitée).
  // Si l'étape précédente n'avait pas de completedAt, on lui en pose un aussi
  // (l'équipe a logiquement passé l'étape précédente avant de marquer celle-ci).
  function marquerEtapeStatut(scenarioId, equipeId, etapeIdx, statutId) {
    const partial = { statut: statutId };
    const info = TABLEAU_STATUTS.find(function(st) { return st.id === statutId; });
    if (info && !info.isPending) {
      partial.completedAt = _nowIso();
    }
    const updated = updateEtape(scenarioId, equipeId, etapeIdx, partial);
    // Auto-fix : pose startedAt sur l'étape courante si elle n'en avait pas
    if (updated && !updated.startedAt) {
      updateEtape(scenarioId, equipeId, etapeIdx, { startedAt: _nowIso() });
    }
    return updated;
  }

  // Retourne le temps écoulé depuis le lancement (en ms), en excluant le
  // temps de pause cumulé. Si l'execution est en pause, fige la valeur à
  // l'instant du début de pause (pas de progression visuelle pendant pause).
  function getExecutionDureeMs(scenarioId) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.startedAt) return 0;
    const start = Date.parse(s.execution.startedAt);
    const end = s.execution.endedAt
                ? Date.parse(s.execution.endedAt)
                : (s.execution.pausedAt ? Date.parse(s.execution.pausedAt) : Date.now());
    const grossMs = end - start;
    return Math.max(0, grossMs - (s.execution.pausedTotalMs || 0));
  }

  // Raccourcis lecture
  // ─── A3 (vague 5, 29/09/2026) — LA VICTIME A UNE POSITION ───
  // Avant : « Victime trouvée » n'était qu'un statut d'étape, sans position ni
  // suite. Désormais la victime est au point de son étape (niveau compris), ou à
  // la position précisée sur la carte (`etape.victimePos`, qui voyage dans le
  // rapport et se fusionne). Source unique : _victimesDe (vues, carte, rapports).
  function _posDeCle(cle) {
    const c = String(cle || "").split(",").map(Number);
    return (c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      ? { x: c[0], y: c[1], level: Number.isInteger(c[2]) ? c[2] : 0 } : null;
  }
  function _posVictime(et) {
    return (et && et.victimePos && typeof et.victimePos.x === "number") ? et.victimePos : _posDeCle(et && et.cle);
  }
  // [{ g, et, idx (phase en cours, sinon null), phaseIdx, pos }] — phases closes comprises.
  function _victimesDe(s) {
    const out = [];
    if (!s || !s.execution) return out;
    const cour = (typeof s.execution.currentPhaseIdx === "number") ? s.execution.currentPhaseIdx : 0;
    const arch = s.execution.etapesArchive || {};
    (s.groupes || []).forEach(function(g) {
      Object.keys(arch).map(Number).sort(function(a, b) { return a - b; }).forEach(function(k) {
        const arr = arch[String(k)] && arch[String(k)][g.id];
        (Array.isArray(arr) ? arr : []).forEach(function(et) {
          if (et && et.statut === "victime") out.push({ g: g, et: et, idx: null, phaseIdx: k, pos: _posVictime(et) });
        });
      });
      _getEtapesEquipe(s, g.id).forEach(function(et, i) {
        if (et && et.statut === "victime") out.push({ g: g, et: et, idx: i, phaseIdx: cour, pos: _posVictime(et) });
      });
    });
    return out;
  }
  function _lblPos(pos) {
    if (!pos) return "?";
    const gps = _gpsTxt(pos.x, pos.y);
    return (gps ? "GPS " + gps : "x=" + Math.round(pos.x) + " y=" + Math.round(pos.y)) +
           " " + t("secours.ctxImport.niv", { level: pos.level });   // la clé porte ses parenthèses
  }
  // Victimes depuis un rapport (texte / PDF) : mêmes règles, sur les données du rapport.
  function _victimesDuRapport(r) {
    const out = [];
    (r && Array.isArray(r.equipesData) ? r.equipesData : []).forEach(function(ed) {
      const nom = (ed.equipe && ed.equipe.nom) || "?";
      const lots = [ed.etapes || []].concat((ed.historique || []).map(function(h) { return h.etapes || []; }));
      lots.forEach(function(arr) {
        arr.forEach(function(et) {
          if (et && et.statut === "victime") out.push({ nom: nom, label: _lblEtape(et.label) || "?", pos: _posVictime(et), at: et.completedAt || null });
        });
      });
    });
    return out;
  }
  // jsPDF (police standard) imprime les accents mais pas les emojis ni les flèches.
  function _stripPourPdf(txt) {
    return String(txt || "")
      .replace(/[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE0F]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
      .replace(/\s{2,}/g, " ").trim();
  }
  function _heureCourte(iso) {
    return iso ? new Date(iso).toLocaleTimeString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
  }

  // Le scénario dont l'intervention tourne sur ce plan (au plus un en pratique).
  function _scenarioEnCours() {
    for (let i = 0; i < _scenarios.length; i++) {
      if (_estExecutionActive(_scenarios[i])) return _scenarios[i];
    }
    return null;
  }

  // 29/09/2026 (KARMA) : « quand un plan de secours est en cours, on devrait avoir
  // l'info en footer ». Pastille dans la barre d'état du mode carte ; un toucher
  // rouvre le plan. Retirée dès que plus rien ne tourne.
  function _majFooterSecours() {
    const barre = document.getElementById("kta-refonte-statusbar-content");
    let pastille = document.getElementById("kta-refonte-stat-secours");
    const s = _scenarioEnCours();
    if (!s || !barre) {
      if (pastille && pastille.parentNode) pastille.parentNode.removeChild(pastille);
      return;
    }
    if (!pastille) {
      pastille = document.createElement("span");
      pastille.id = "kta-refonte-stat-secours";
      pastille.className = "kta-refonte-stat kta-refonte-stat-clickable kta-secours-footer-pastille";
      pastille.addEventListener("click", function() {
        const cur = _scenarioEnCours();
        if (cur) ouvrir(cur.id);
      });
      barre.insertBefore(pastille, barre.firstChild);
    }
    const eq = (s.execution.role === "equipe" && s.execution.currentEquipeId)
      ? (s.groupes || []).find(function(g) { return g.id === s.execution.currentEquipeId; }) : null;
    // Progression : étapes faites / total (son équipe, ou toutes pour l'opérateur).
    let faites = 0, total = 0;
    (eq ? [eq] : (s.groupes || [])).forEach(function(g) {
      _getEtapesEquipe(s, g.id).forEach(function(e) {
        total++;
        if (e && e.completedAt && e.statut && e.statut !== "pending") faites++;
      });
    });
    const texte = (eq ? t("secours.footer.equipe", { equipe: eq.nom })
                      : t("secours.footer.operateur", { n: (s.groupes || []).length })) +
                  (total ? " · " + faites + "/" + total : "");
    pastille.title = t("secours.footer.title", { nom: s.nom || "" });
    pastille.innerHTML = '<span class="kta-refonte-stat-icon">🚨</span><span class="kta-refonte-stat-val">' + _escHtml(texte) + '</span>' +
                         '<span class="kta-secours-footer-go" aria-hidden="true">›</span>';
  }

  function _estExecutionActive(s) {
    return !!(s && s.execution && s.execution.active === true);
  }
  function _getEtapesEquipe(s, equipeId) {
    if (!s || !s.execution || !s.execution.etapes) return [];
    const arr = s.execution.etapes[equipeId];
    return Array.isArray(arr) ? arr : [];
  }

  // Mode secouriste libre — ajoute une note en vrac dans _notes_libres.
  // Pas d'étape structurée. Note = { id, ts, statut, texte, photoIds }.
  function ajouterNoteLibre(scenarioId, opts) {
    const s = get(scenarioId);
    if (!s || !s.execution) return null;
    if (!s.execution.etapes._notes_libres) s.execution.etapes._notes_libres = [];
    opts = opts || {};
    const note = {
      id:       _genId("note"),
      ts:       _nowIso(),
      statut:   typeof opts.statut === "string" ? opts.statut : "ras",
      texte:    typeof opts.texte === "string" ? opts.texte.slice(0, 2000) : "",
      photoIds: Array.isArray(opts.photoIds) ? opts.photoIds.slice() : []
    };
    s.execution.etapes._notes_libres.push(note);
    _commitMutation(s);
    return note;
  }

  // Update une note libre par id (whitelist : statut, texte, photoIds).

  // Supprime une note libre par id.
  function supprimerNoteLibre(scenarioId, noteId) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.etapes._notes_libres) return false;
    const arr = s.execution.etapes._notes_libres;
    const idx = arr.findIndex(function(n) { return n.id === noteId; });
    if (idx < 0) return false;
    arr.splice(idx, 1);
    _commitMutation(s);
    return true;
  }

  // 🆕 v1.23.3 (KARMA "crée une équipe et lui assigné une zone sur un
  // niveau") : mini-prompt qui demande nom + niveau M-LVL avant d'ajouter
  // une équipe. Ouvert depuis "+ Ajouter une équipe" sur les plans
  // multi-niveau (M-LVL actif). Sur plan mono-niveau, on bypass et on
  // ajoute direct avec nom auto (cohérent v1.22.x).
  // 🐛 29/09/2026 (KARMA) : « Auto : 1 équipe par niveau » créait une équipe sur
  // des niveaux VIDES (availableLevels = -2..+2 par défaut quand le plan n'en
  // déclare pas). Seuls les niveaux qui portent quelque chose ; le 0 = plan
  // principal, toujours gardé. Sans le scan (module absent) : ancien comportement.
  // 29/09/2026 (KARMA) : équipes repliables — avec tous les POI d'un parcours, la
  // vue Édition devenait une longue page à faire défiler. État par appareil
  // (confort de lecture, pas une donnée du scénario) : localStorage, try/catch.
  const LS_REPLIEES = "myktamap_secours_equipes_repliees_v1";
  let _replieesCache = null;
  function _repliees() {
    if (_replieesCache) return _replieesCache;
    try { _replieesCache = JSON.parse(localStorage.getItem(LS_REPLIEES) || "{}") || {}; }
    catch(e) { _replieesCache = {}; }
    return _replieesCache;
  }
  function _estRepliee(gid) { return !!_repliees()[gid]; }
  function _setRepliee(gid, oui) {
    const r = _repliees();
    if (oui) r[gid] = 1; else delete r[gid];
    try { localStorage.setItem(LS_REPLIEES, JSON.stringify(r)); } catch(e) {}
  }
  // Bascule sans re-rendu (garde la position de défilement).
  function _appliquerRepli(card, oui) {
    if (!card) return;
    card.classList.toggle("kta-secours-groupe-card--repliee", oui);
    const b = card.querySelector('[data-action="toggle-groupe"]');
    if (b) { b.textContent = oui ? "▸" : "▾"; b.setAttribute("aria-expanded", oui ? "false" : "true"); }
  }

  // KARMA 29/09 : dans les listes de niveaux, un niveau qui ne porte rien est
  // marqué « (vide) » — gardé choisissable (préparer une équipe sur un niveau pas
  // encore relevé), mais on ne le prend plus pour un niveau réel. 0 = plan principal.
  function _suffixeNiveauVide(lvl) {
    if (lvl === 0 || typeof window.ktaNiveauxOccupes !== "function") return "";
    return window.ktaNiveauxOccupes().indexOf(lvl) >= 0 ? "" : " " + t("secours.level.vide");
  }

  function _niveauxPourEquipesAuto() {
    const dispo = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.availableLevels))
                  ? window.APP_CONFIG.availableLevels.slice().sort(function(a, b) { return a - b; }) : [];
    if (typeof window.ktaNiveauxOccupes !== "function") return dispo;
    const occ = window.ktaNiveauxOccupes();
    return dispo.filter(function(l) { return l === 0 || occ.indexOf(l) >= 0; });
  }

  function _ouvrirCreerEquipeMlvlPrompt(scenarioId) {
    if (!window.APP_CONFIG || !Array.isArray(window.APP_CONFIG.availableLevels)) {
      addGroupe(scenarioId, null);
      _switchView("edit");
      return;
    }
    const levels = window.APP_CONFIG.availableLevels.slice().sort(function(a, b) { return a - b; });
    const activeLevel = (typeof window.APP_CONFIG.activeLevel === "number")
                        ? window.APP_CONFIG.activeLevel : 0;
    const existing = document.getElementById("kta-secours-newequipe-modal");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const overlay = document.createElement("div");
    overlay.id = "kta-secours-newequipe-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001";
    const levelsHtml = levels.map(function(lvl) {
      const lbl = _lblNiveau(lvl);
      const sel = (lvl === activeLevel) ? " selected" : "";
      return '<option value="' + lvl + '"' + sel + '>' + t("secours.level.niveau", { label: lbl }) + _suffixeNiveauVide(lvl) + '</option>';
    }).join('');
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-newequipe-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + t("secours.newequipe.titre") + '</span>' +
          '<button class="kta-panneau-close" data-action="cancel" type="button">&times;</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<div class="kta-secours-form-row">' +
            '<label for="kta-sec-newequipe-nom">' + t("secours.newequipe.nomLabel") + '</label>' +
            '<input type="text" id="kta-sec-newequipe-nom" placeholder="' + _escAttr(t("secours.newequipe.nomPlaceholder")) + '" maxlength="40">' +
          '</div>' +
          '<div class="kta-secours-form-row">' +
            '<label for="kta-sec-newequipe-level">' + t("secours.newequipe.levelLabel") + '</label>' +
            '<select id="kta-sec-newequipe-level">' +
              '<option value="">' + t("secours.newequipe.levelNone") + '</option>' +
              levelsHtml +
            '</select>' +
          '</div>' +
          '<div class="kta-secours-form-hint">' +
            t("secours.newequipe.hint") +
          '</div>' +
          '<div class="kta-secours-form-actions">' +
            '<button class="kta-btn kta-btn-ghost" data-action="cancel">' + t("secours.btn.annuler") + '</button>' +
            '<button class="kta-btn kta-btn-primary" data-action="confirm">' + t("secours.btn.creerEquipe") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    function _close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    overlay.querySelectorAll('[data-action="cancel"]').forEach(function(b) {
      b.addEventListener("click", _close);
    });
    overlay.querySelectorAll('[data-action="confirm"]').forEach(function(b) {
      b.addEventListener("click", function() {
        const nomEl = document.getElementById("kta-sec-newequipe-nom");
        const lvlEl = document.getElementById("kta-sec-newequipe-level");
        const nom = nomEl ? nomEl.value.trim() : "";
        const lvlVal = lvlEl ? lvlEl.value : "";
        const level = (lvlVal === "" || lvlVal == null) ? null : parseInt(lvlVal, 10);
        addGroupe(scenarioId, nom || null, level);
        _close();
        _switchView("edit");
      });
    });
    setTimeout(function() {
      const inp = document.getElementById("kta-sec-newequipe-nom");
      if (inp) inp.focus();
    }, 50);
  }

  // 🆕 v1.23.2 Phase 2 / Feature G (KARMA roadmap §65.12 "Recherche unifiée
  // Ctrl+K → assigner à équipe en 2 clics") : mini-modale qui ouvre depuis
  // searchPoints.js quand l'user clique le bouton 📌 sur un résultat point.
  // Permet d'assigner le POI à une équipe + role en 2 sélections sans
  // perdre le focus de la recherche.
  function ouvrirAssignerModale(point, layerLabel) {
    if (!_currentScenarioId) {
      _toast(t("secours.toast.aucunScenarioActif"), "warn");
      return;
    }
    const s = get(_currentScenarioId);
    if (!s) return;
    if (!Array.isArray(s.groupes) || s.groupes.length === 0) {
      _toast(t("secours.toast.aucuneEquipeAjoute"), "warn");
      return;
    }
    if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
      _toast(t("secours.toast.pointInvalide"), "error");
      return;
    }
    // Cleanup éventuelle modale précédente (idempotency)
    const existing = document.getElementById("kta-secours-assign-modal");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const nomPoint = point.nom || point.id || ("x=" + Math.round(point.x) + " y=" + Math.round(point.y));
    const overlay = document.createElement("div");
    overlay.id = "kta-secours-assign-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100002";   // au-dessus de la modale Recherche (99999)

    // Options équipes (avec préfixe swatch via emoji couleur)
    const equipesOptions = s.groupes.map(function(g) {
      const c = PALETTE[g.couleurIdx % PALETTE.length];
      return '<option value="' + _escAttr(g.id) + '">' +
             _escHtml(g.nom) + ' (' + _escHtml(c.nom) + ')</option>';
    }).join('');

    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-assign-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + t("secours.assign.titre", { point: _escHtml(nomPoint) }) + '</span>' +
          '<button class="kta-panneau-close" data-action="cancel" type="button">&times;</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<div class="kta-secours-assign-info">' +
            '<strong>' + t("secours.assign.pointLabel") + '</strong> ' + _escHtml(nomPoint) +
            (layerLabel ? ' <span style="opacity:0.7;">(' + _escHtml(layerLabel) + ')</span>' : '') +
            '<br><small style="opacity:0.7;">x=' + Math.round(point.x) + ' y=' + Math.round(point.y) +
            (typeof point.level === "number" ? ' · ' + t("secours.assign.niv", { level: point.level }) : '') + '</small>' +
          '</div>' +
          '<div class="kta-secours-form-row">' +
            '<label for="kta-sec-assign-equipe">' + t("secours.assign.equipeLabel") + '</label>' +
            '<select id="kta-sec-assign-equipe">' + equipesOptions + '</select>' +
          '</div>' +
          '<div class="kta-secours-form-row">' +
            '<label>' + t("secours.assign.roleLabel") + '</label>' +
            '<div class="kta-secours-assign-roles">' +
              '<label class="kta-secours-assign-role"><input type="radio" name="kta-sec-assign-role" value="entree"> ' + t("secours.role.entree") + '</label>' +
              '<label class="kta-secours-assign-role"><input type="radio" name="kta-sec-assign-role" value="intermediaire"> ' + t("secours.role.intermediaire") + '</label>' +
              '<label class="kta-secours-assign-role"><input type="radio" name="kta-sec-assign-role" value="sortie"> ' + t("secours.role.sortie") + '</label>' +
            '</div>' +
          '</div>' +
          '<div class="kta-secours-form-hint">' +
            t("secours.assign.hint") +
          '</div>' +
          '<div class="kta-secours-form-actions">' +
            '<button class="kta-btn kta-btn-ghost" data-action="cancel">' + t("secours.btn.annuler") + '</button>' +
            '<button class="kta-btn kta-btn-primary" data-action="confirm">' + t("secours.btn.assigner") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    // 🩸 29/09/2026 (audit Secours) — « Entrée » était cochée d'office : oublier de
    // changer le choix ÉCRASAIT l'entrée de l'équipe, sans rien dire. Le rôle par
    // défaut suit l'équipe choisie : « Entrée » seulement si elle n'en a pas encore.
    function _roleParDefaut() {
      const sel = document.getElementById("kta-sec-assign-equipe");
      const eq = sel ? s.groupes.find(function(g) { return g.id === sel.value; }) : null;
      const role = (eq && !eq.entree) ? "entree" : "intermediaire";
      const radio = overlay.querySelector('input[name="kta-sec-assign-role"][value="' + role + '"]');
      if (radio) radio.checked = true;
    }
    _roleParDefaut();
    const _selEquipe = document.getElementById("kta-sec-assign-equipe");
    if (_selEquipe) _selEquipe.addEventListener("change", _roleParDefaut);

    function _close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    overlay.querySelectorAll('[data-action="cancel"]').forEach(function(b) {
      b.addEventListener("click", _close);
    });
    overlay.querySelectorAll('[data-action="confirm"]').forEach(function(b) {
      b.addEventListener("click", function() {
        const equipeId = (document.getElementById("kta-sec-assign-equipe") || {}).value;
        const roleEl = overlay.querySelector('input[name="kta-sec-assign-role"]:checked');
        const role = roleEl ? roleEl.value : "intermediaire";
        if (!equipeId) { _toast(t("secours.toast.selectEquipe"), "warn"); return; }
        const level = (typeof point.level === "number") ? point.level
                    : (window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number")
                      ? window.APP_CONFIG.activeLevel : 0;
        const wp = {
          x:       point.x,
          y:       point.y,
          level:   level,
          pointId: point.id || null,
          label:   point.nom || point.id || null
        };
        // idx = null pour les 3 cas :
        //   - entree/sortie : ignoré (1 seul slot)
        //   - intermediaire : append à la fin de la liste (cf _appliquerWaypoint)
        _appliquerWaypoint(equipeId, role, null, wp);
        const equipe = s.groupes.find(function(g) { return g.id === equipeId; });
        const equipeNom = equipe ? equipe.nom : equipeId;
        const roleLbl = role === "entree" ? t("secours.roleShort.entree")
                      : role === "sortie" ? t("secours.roleShort.sortie")
                      : t("secours.roleShort.intermediaire");
        _toast(t("secours.toast.pointAssigne", { point: nomPoint, equipe: equipeNom, role: roleLbl }), "info");
        _close();
        // Re-render edit si la modale Mode Secours est visible (sinon l'user
        // est en mode overlay carte, on laisse comme c'est).
        if (_modal && _modal.style.display !== "none" && _currentScenarioId) {
          _switchView("edit");
        }
      });
    });
    // Focus auto sur le select pour saisie clavier rapide
    setTimeout(function() {
      const sel = document.getElementById("kta-sec-assign-equipe");
      if (sel) sel.focus();
    }, 50);
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
      _toast(t("secours.toast.aucunePositionLost"), "warn");
      return null;
    }
    // Nom auto : "Recherche - 26/05/2026 14:32"
    const now = new Date();
    const nomAuto = t("secours.lost.nomAuto", {
      date: now.toLocaleDateString(window.ktaLocale ? window.ktaLocale() : "fr-FR"),
      heure: now.toLocaleTimeString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { hour: "2-digit", minute: "2-digit" })
    });
    // Timestamp d'incident = maintenant - elapsedMinutes
    const elapsed = (typeof lostState.elapsedMinutes === "number") ? lostState.elapsedMinutes : 0;
    const incidentTs = Date.now() - elapsed * 60 * 1000;
    // Compose les notes contextuelles
    const notesParts = [t("secours.lost.notesIntro")];
    if (elapsed > 0) {
      const h = Math.floor(elapsed / 60);
      const m = Math.round(elapsed - h * 60);
      const duree = (h > 0 ? h + "h" : "") + (m > 0 ? (m < 10 && h > 0 ? "0" : "") + m + "min" : "");
      notesParts.push(t("secours.lost.notesTempsEcoule", { duree: duree }));
    }
    if (lostState.speedKmH) {
      notesParts.push(t("secours.lost.notesVitesse", { vitesse: lostState.speedKmH }) +
                      (lostState.presetKey ? t("secours.lost.notesPreset", { preset: lostState.presetKey }) : ""));
    }
    if (lostState.radiusMeters) {
      notesParts.push(t("secours.lost.notesRayon", { rayon: Math.round(lostState.radiusMeters) }));
    }
    if (lostState.clues && lostState.clues.trim()) {
      notesParts.push(t("secours.lost.notesIndices", { indices: lostState.clues.trim() }));
    }
    // Création + remplissage du contexte
    const scenario = createScenario(nomAuto);
    updateScenario(scenario.id, {
      context: {
        incidentAt: new Date(incidentTs).toISOString(),
        lastKnownPoint: {
          x:     lostState.lastKnownPos.x,
          y:     lostState.lastKnownPos.y,
          // Niveau du point lui-même (Mode Perdu ≥ 29/09/2026), à défaut celui affiché.
          level: Number.isInteger(lostState.lastKnownPos.level) ? lostState.lastKnownPos.level
               : (window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number")
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
    _toast(t("secours.toast.scenarioCreeLost", { nom: nomAuto }), "info");
    // Ouvre la modale Mode Secours en vue Edit
    ouvrir(scenario.id);
    return scenario;
  }

  // ============================================================
  // EXPORT / IMPORT SCÉNARIO STANDALONE (.mkmsec.json) v1.23.4
  // KARMA : « on doit pouvoir exporter un plan de secour, que on poura
  // importer sur un autre appareil (sans a avoir a exporter une session
  // full) ca nous servira quoi qu'il arrive pour mode "operateur chef de
  // surface" et "secouriste" »
  // ============================================================
  // Format JSON autonome contenant :
  //  • metadata (type, version, exportedAt, appVersion)
  //  • plan minimal (id, name, version, imageWidth/Height, multiLevel,
  //    availableLevels) — pour valider que l'import correspond au plan ouvert
  //  • scenario complet (id, nom, context, groupes, pointsCles)
  //
  // Base pour Phase 3 partage cross-device (chef de surface → équipe
  // secouriste via QR code share — le contenu QR encodera ce JSON).
  //
  // Extension fichier : .mkmsec.json (clair = JSON MyKTAMap Secours)

  const MKMSEC_FORMAT_VERSION = 1;

  function exporterScenario(scenarioId) {
    const s = get(scenarioId || _currentScenarioId);
    if (!s) {
      _toast(t("secours.toast.scenarioIntrouvable"), "error");
      return null;
    }
    // Identités des points posées AVANT le départ vers les équipes : sinon PC et
    // téléphones en tireraient chacun de différentes (2e relecture).
    let widPoses = false;
    (s.groupes || []).forEach(function(g) {
      if (_normaliserParcours(g)) { widPoses = true; _rattacherWidEtapes(s, g); }
    });
    if (widPoses) _commitMutation(s);
    const pc = window.PLAN_CONFIG;
    const planInfo = pc && pc.plan ? {
      id:                window._currentLoadedPlanId || null,
      name:              pc.plan.name             || "",
      version:           pc.plan.version          || "",
      imageWidth:        pc.plan.imageWidth       || 0,
      imageHeight:       pc.plan.imageHeight      || 0,
      multiLevel:        !!pc.plan.multiLevel,
      availableLevels:   (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.availableLevels))
                         ? window.APP_CONFIG.availableLevels.slice() : null,
      scale:             (window.APP_CONFIG && typeof window.APP_CONFIG.scale === "number")
                         ? window.APP_CONFIG.scale : null
    } : null;
    const payload = {
      type:         "myktamap-secours-scenario",
      version:      MKMSEC_FORMAT_VERSION,
      exportedAt:   new Date().toISOString(),
      appVersion:   (window.__MKM__ && window.__MKM__.build) || "",
      plan:         planInfo,
      // Deep clone via JSON roundtrip pour éviter ref accidentelle
      scenario:     JSON.parse(JSON.stringify(s))
    };
    try {
      const txt = JSON.stringify(payload, null, 2);
      const blob = new Blob([txt], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const filename = "Secours_" + _slug(s.nom) + "_" + _shortDate() + ".mkmsec.json";
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      _toast(t("secours.toast.planExporte", { filename: filename }), "info");
      return filename;
    } catch(e) {
      console.warn("[SecoursMode] exporterScenario échec :", e);
      _toast(t("secours.toast.erreurExport", { message: e.message }), "error");
      return null;
    }
  }

  // 🆕 v1.23.5 — Parse + validation SEULE (pas d'injection). Retourne le
  // payload + warning éventuel sur plan différent, MAIS ne touche pas au
  // cache _scenarios. Permet à `_ouvrirImportMkmsecPicker` d'afficher une
  // modale preview AVANT injection définitive (cf §35 — confirm() natif
  // banni, modale Promise-based charte requise).
  // Retourne : { ok: bool, payload?: object, warning?: string, error?: string }
  // 🩸 29/09/2026 (audit Secours, 4.3) — MÊME plan, mais REGÉNÉRÉ depuis l'export :
  // seul l'id du plan était comparé. Un plan retracé (nouvelle version, autres
  // dimensions) passait sans un mot, alors que positions d'étapes, zones et empreintes
  // de tracés peuvent ne plus tomber au bon endroit. Retourne un avertissement ou null.
  function _ecartVersionPlan(planFichier) {
    const pl = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) || {};
    const f = planFichier || {};
    const idCourant = window._currentLoadedPlanId;
    if (f.id && idCourant && f.id !== idCourant) return null;   // autre plan : déjà signalé ailleurs
    const verF = String(f.version || ""), verC = String(pl.version || "");
    const dimsDiff = (Number(f.imageWidth) > 0 && Number(pl.imageWidth) > 0 && Number(f.imageWidth) !== Number(pl.imageWidth))
                  || (Number(f.imageHeight) > 0 && Number(pl.imageHeight) > 0 && Number(f.imageHeight) !== Number(pl.imageHeight));
    if (!(verF && verC && verF !== verC) && !dimsDiff) return null;
    return t("secours.import.warnVersionPlan", {
      avant: verF || (f.imageWidth + "×" + f.imageHeight),
      maintenant: verC || (pl.imageWidth + "×" + pl.imageHeight)
    });
  }
  // 4e relecture (R4-13) : un plan regénéré SANS changer sa version fait perdre les
  // tracés de zone (empreintes de géométrie) sans un mot. Compte les clés de zone que
  // le plan chargé ne résout plus. Autre plan → rien (déjà signalé ailleurs).
  function _blocTracesIntrouvables(planFichier, groupes) {
    const f = planFichier || {};
    const idCourant = window._currentLoadedPlanId;
    if (f.id && idCourant && f.id !== idCourant) return "";
    const connues = {};
    _tousLesTraces().forEach(function(r) { if (r.id) connues[r.id] = true; connues[_cleTrace(r)] = true; });
    let n = 0;
    (groupes || []).forEach(function(g) {
      if (!g || g.zoneType !== "roads" || !Array.isArray(g.zoneRoadIds)) return;
      g.zoneRoadIds.forEach(function(k) { if (!connues[k]) n++; });
    });
    return n ? '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.10); border:1px solid rgba(255,140,0,0.55); border-radius:6px;' +
               ' padding:10px 12px; margin:14px 0; color:#ffb380; font-size:13px; line-height:1.5;">⚠️ ' +
               _escHtml(t("secours.import.warnTracesIntrouvables", { n: n })) + '</div>'
             : "";
  }
  function _blocEcartVersion(planFichier) {
    const w = _ecartVersionPlan(planFichier);
    return w ? '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.10); border:1px solid rgba(255,140,0,0.55); border-radius:6px;' +
               ' padding:10px 12px; margin:14px 0; color:#ffb380; font-size:13px; line-height:1.5;">⚠️ ' + _escHtml(w) + '</div>'
             : "";
  }

  async function _parsePayloadMkmsec(input) {
    let text;
    try {
      if (input instanceof File || input instanceof Blob) {
        text = await input.text();
      } else if (typeof input === "string") {
        text = input;
      } else {
        return { ok: false, error: t("secours.import.errInputInvalide") };
      }
    } catch(e) {
      return { ok: false, error: t("secours.import.errLecture", { message: e.message }) };
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch(e) {
      return { ok: false, error: t("secours.import.errJson", { message: e.message }) };
    }

    // Validation stricte du format
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: t("secours.import.errPayload") };
    }
    if (payload.type !== "myktamap-secours-scenario") {
      return { ok: false, error: t("secours.import.errType", { type: payload.type }) };
    }
    if (typeof payload.version !== "number" || payload.version < 1 || payload.version > MKMSEC_FORMAT_VERSION) {
      return { ok: false, error: t("secours.import.errVersion", { version: payload.version, max: MKMSEC_FORMAT_VERSION }) };
    }
    if (!payload.scenario || typeof payload.scenario !== "object"
        || typeof payload.scenario.nom !== "string"
        || !Array.isArray(payload.scenario.groupes)) {
      return { ok: false, error: t("secours.import.errScenario") };
    }

    // Détection plan différent → renvoyé comme warning, pas comme erreur.
    // La décision finale (importer ou annuler) est prise dans la modale preview.
    let warning = null;
    const currentPlanId = window._currentLoadedPlanId;
    const importedPlanId = payload.plan && payload.plan.id;
    if (currentPlanId && importedPlanId && currentPlanId !== importedPlanId) {
      const importedPlanName = (payload.plan && payload.plan.name) || t("secours.import.planInconnu");
      warning = t("secours.import.warnPlanDifferent", { plan: importedPlanName });
    }

    return { ok: true, payload: payload, warning: warning };
  }

  // 🆕 v1.23.5 — Injection SEULE depuis un payload déjà validé. Re-génère
  // les ids (scénario + groupes) pour éviter collision, applique le filtre
  // défensif anti-pollution, push + commit. À appeler APRÈS confirmation
  // user via modale preview.
  // Retourne : { ok: bool, scenario: object } (jamais d'erreur ici car le
  // payload est déjà validé par _parsePayloadMkmsec)
  // 🩸 29/09/2026 — LES IDS D'ORIGINE SONT GARDÉS. Avant, tout import les
  // régénérait : le téléphone d'une équipe travaillait sur des ids qui n'étaient
  // plus ceux du PC, et le rapport qu'il rapportait était refusé à 100 %
  // (`_parsePayloadReport` exige scénario + équipe identiques). L'import consolidé
  // n'a jamais pu marcher entre deux appareils (audit 2026-09-29, A1).
  // `mode` ne compte que si le scénario est DÉJÀ sur l'appareil :
  //   "remplacer" → même place, mêmes ids (plan mis à jour, rapports acceptés) ;
  //   "copie" (défaut) → nouveaux ids, comme avant — non destructif.
  function _appliquerPayloadImport(payload, mode) {
    const sc = payload.scenario;
    const idxExistant = (typeof sc.id === "string" && sc.id)
      ? _scenarios.findIndex(function(s) { return s.id === sc.id; })
      : -1;
    const remplacer = idxExistant >= 0 && mode === "remplacer";
    const regenerer = !(typeof sc.id === "string" && sc.id) || (idxExistant >= 0 && !remplacer);
    if (regenerer) sc.id = _genId("secours");
    sc.updatedAt = _nowIso();
    // 🆕 v1.29.0 C1 — Remapping cross-phases : phase.groupeIds[] suivent les g.id.
    // Un id d'équipe n'est régénéré que pour une copie, ou s'il est absent/en double.
    const idMap = Object.create(null);   // oldId → newId (sans prototype : 2e relecture)
    const vus = {};
    if (Array.isArray(sc.groupes)) {
      sc.groupes.forEach(function(g) {
        const oldId = g.id;
        const valide = typeof oldId === "string" && oldId && !vus[oldId];
        if (regenerer || !valide) g.id = _genId("G");
        vus[g.id] = true;
        // Relecture 29/09 (R2) : un id en DOUBLE ne doit pas écraser la 1re entrée —
        // sinon la phase suivait l'équipe régénérée et la 1re sortait de sa phase.
        if (typeof oldId === "string" && !(oldId in idMap)) idMap[oldId] = g.id;
      });
    }
    // Remap phase.groupeIds[] avec les nouveaux IDs (sécurise re-import v1.29+)
    let importedPhases = null;
    if (Array.isArray(sc.phases) && sc.phases.length > 0) {
      importedPhases = sc.phases.map(function(p, i) {
        const mapped = (Array.isArray(p.groupeIds) ? p.groupeIds : [])
          .map(function(oldGid) { return idMap[oldGid] || oldGid; })
          .filter(function(id) {
            // Garde seulement les IDs qui matchent une équipe importée
            return sc.groupes.some(function(g) { return g.id === id; });
          });
        return {
          id:        (!regenerer && typeof p.id === "string" && p.id) ? p.id : _genId("P"),
          idx:       (typeof p.idx === "number" && p.idx >= 0) ? p.idx : i,
          nom:       (typeof p.nom === "string" && p.nom.trim()) ? p.nom.trim() : (PHASE_DEFAULT_NOM + " " + (i + 1)),
          groupeIds: mapped,
          startedAt: (typeof p.startedAt === "string") ? p.startedAt : null,
          endedAt:   (typeof p.endedAt === "string") ? p.endedAt : null,
          debrief:   (typeof p.debrief === "string") ? p.debrief.slice(0, 5000) : "",
          debriefAt: (typeof p.debriefAt === "string") ? p.debriefAt : null
        };
      });
    }
    const cleanScenario = {
      id:         sc.id,
      nom:        String(sc.nom || "").slice(0, 200),
      createdAt:  sc.createdAt || _nowIso(),
      arriveeAt:  _nowIso(),   // arrivée sur CET appareil (âge FIFO, cf _saveScenarios)
      updatedAt:  sc.updatedAt,
      context:    sc.context && typeof sc.context === "object" ? sc.context : {},
      groupes:    Array.isArray(sc.groupes) ? sc.groupes : [],
      pointsCles: Array.isArray(sc.pointsCles) ? sc.pointsCles : [],
      reglagesDuree: (sc.reglagesDuree && typeof sc.reglagesDuree === "object") ? {
        vitesseKmh: Math.max(0.2, Math.min(8, Number(sc.reglagesDuree.vitesseKmh) || DUREE_DEFAUT.vitesseKmh)),
        pauseMin:   Math.max(0, Math.min(120, Number(sc.reglagesDuree.pauseMin) || 0))
      } : undefined   // R4-12 : mêmes bornes que updateScenario
      // phases ajouté juste après si présent (sinon migration le créera)
    };
    if (importedPhases) cleanScenario.phases = importedPhases;
    _migrerDurees(cleanScenario);   // R4-6 : .mkmsec d'avant 4.1 → durées recalculées
    // 🆕 v1.29.0 C1 — Migration explicite après push : si le payload était v1
    // sans phases[], une phase implicite est créée couvrant toutes les équipes.
    // Si déjà multi-phases, idempotent.
    _migrateScenarioV1ToPhases(cleanScenario);
    // Remplacer = même place dans la liste ; l'exécution locale éventuelle part
    // avec l'ancienne version (la modale d'aperçu l'a annoncé).
    if (remplacer) {
      // 🩸 Relecture 29/09 (R8, décision KARMA 2:a) — les photos de l'exécution
      // effacée partent avec elle. Avant, mêmes ids gardés : elles revenaient dans
      // le rapport suivant et comptaient dans le quota de 5 par étape.
      const P = window.MyKTAMapSecoursPhotos;
      if (_scenarios[idxExistant].execution && P && typeof P.deletePhotosForScenario === "function") {
        P.deletePhotosForScenario(sc.id).catch(function(e) { console.warn("[SecoursMode] photos :", e); });
      }
      _scenarios[idxExistant] = cleanScenario;
    }
    else _scenarios.push(cleanScenario);
    _commitMutation(cleanScenario);
    return { ok: true, scenario: cleanScenario, remplace: remplacer };
  }

  // Import scénario depuis fichier (File ou string JSON) — API publique
  // exposée via window.SecoursMode.importerScenario. Combine parse + apply
  // pour les callers programmatiques (legacy v1.23.4) qui n'ont PAS besoin
  // de preview interactif. La modale preview est gérée séparément par
  // _ouvrirImportMkmsecPicker (déclenchée par bouton UI).
  //
  // ⚠️ Rétro-compat v1.23.4 : si plan différent, demande confirmation (modale
  // charte `ktaConfirm` depuis le 29/09/2026). Pour le flow UI complet, le picker.
  // `opts.mode` ("remplacer" | "copie") : cf `_appliquerPayloadImport` — sans lui,
  // un scénario déjà présent est importé en copie (jamais d'écrasement implicite).
  //
  // Retourne : { ok: bool, scenario?: object, remplace?: bool, warning?: string, error?: string }
  async function importerScenario(input, opts) {
    const parsed = await _parsePayloadMkmsec(input);
    if (!parsed.ok) return parsed;
    if (parsed.warning) {
      const currentPlanName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || t("secours.import.planCourant");
      const importedPlanName = (parsed.payload.plan && parsed.payload.plan.name) || t("secours.import.planInconnu");
      // ktaConfirm rend du HTML : les noms viennent du fichier → échappés.
      const confirmMsg = t("secours.import.confirmPlanDifferent", {
        planSource: _escHtml(importedPlanName),
        planCourant: _escHtml(currentPlanName)
      });
      const ok = (typeof window.ktaConfirm === "function")
        ? await window.ktaConfirm(confirmMsg)
        : window.confirm(confirmMsg);
      if (!ok) {
        return { ok: false, error: t("secours.import.errAnnuleUser") };
      }
    }
    const applied = _appliquerPayloadImport(parsed.payload, opts && opts.mode);
    return { ok: true, scenario: applied.scenario, remplace: applied.remplace, warning: parsed.warning };
  }

  // 🆕 v1.23.4 — File picker pour l'import .mkmsec.json depuis la vue LIST.
  // Crée un <input type="file"> volatile, déclenche la dialog OS, parse le
  // fichier choisi via importerScenario (async), affiche le résultat dans
  // une modale custom (succès avec warning éventuel OU erreur détaillée),
  // refresh la liste si succès.
  function _ouvrirImportMkmsecPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.mkmsec,.mkmsec.json,application/json";
    input.style.display = "none";
    input.addEventListener("change", async function() {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      // 🆕 v1.23.5 — Flow split : parse seul, AVANT injection.
      let parsed;
      try {
        parsed = await _parsePayloadMkmsec(file);
      } catch(e) {
        console.warn("[SecoursMode] _ouvrirImportMkmsecPicker exception :", e);
        parsed = { ok: false, error: t("secours.import.errException", { message: (e && e.message ? e.message : String(e)) }) };
      }
      // Si erreur de parse/validation → modale d'erreur direct (pas de preview)
      if (!parsed.ok) {
        _afficherResultatImport({ ok: false, error: parsed.error }, file.name);
        return;
      }
      // Sinon : modale preview avec callback de confirmation.
      _afficherPreviewImport(parsed.payload, parsed.warning, file.name, function(confirmer, mode) {
        if (!confirmer) return;  // user a annulé
        const applied = _appliquerPayloadImport(parsed.payload, mode);
        _afficherResultatImport({
          ok:       true,
          scenario: applied.scenario,
          remplace: applied.remplace,
          warning:  parsed.warning
        }, file.name);
        // Refresh vue liste pour montrer le nouveau scénario
        _switchView("list");
      });
    });
    document.body.appendChild(input);
    input.click();
  }

  // 🆕 v1.23.5 — Modale preview AVANT injection définitive d'un payload
  // .mkmsec.json. Charte Promise-via-callback (pattern §35 : confirm()
  // natif banni → modale custom Promise-based). Affiche détails complets :
  // nom + date export + version app + plan source + liste des équipes
  // (avec level + nb membres + zone définie ?) + warning éventuel si plan
  // différent (bandeau orange) + boutons "❌ Annuler" / "✓ Importer".
  //
  // Args : payload (validé par _parsePayloadMkmsec), warning (string|null),
  //        sourceFilename (string), onDone(confirmer: bool) callback.
  function _afficherPreviewImport(payload, warning, sourceFilename, onDone) {
    // Cleanup éventuelle modale précédente
    const existing = document.getElementById("kta-secours-import-preview");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "kta-secours-import-preview";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100010";

    const boite = document.createElement("div");
    boite.className = "kta-readme-modal-boite";
    boite.style.maxWidth = "560px";
    boite.style.height = "auto";
    boite.style.maxHeight = "90vh";
    boite.style.borderLeft = "6px solid #8cb4ff";

    const sc = payload.scenario || {};
    const planSrc = payload.plan || {};
    const dateExport = payload.exportedAt
                       ? new Date(payload.exportedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR")
                       : t("secours.import.dateInconnue");
    const appVer = payload.appVersion || t("secours.import.versionInconnue");

    // Mini-résumé des équipes (max 8 affichées, "+N autres" si plus)
    const groupes = Array.isArray(sc.groupes) ? sc.groupes : [];
    let equipesHtml = "";
    if (groupes.length === 0) {
      equipesHtml = '<p style="color:#8892a4; font-style:italic; margin:8px 0 0;">' + t("secours.import.aucuneEquipe") + '</p>';
    } else {
      const visibles = groupes.slice(0, 8);
      equipesHtml = '<ul class="kta-secours-import-preview-equipes">';
      visibles.forEach(function(g) {
        const couleur = (PALETTE[g.couleurIdx % PALETTE.length] || PALETTE[0]).hex;
        const nbMembres = Array.isArray(g.membres) ? g.membres.length : 0;
        const hasZone = g.zoneType === "polygon" || g.zoneType === "roads";
        const hasParcours = g.entree && g.sortie;
        const levelChip = (typeof g.level === "number")
                          ? ' · 🏗️ ' + _formatLevelShort(g.level)
                          : "";
        equipesHtml += '<li>' +
                         '<span class="kta-secours-import-preview-couleur" style="background:' + couleur + ';"></span>' +
                         '<strong>' + _escHtml(g.nom || t("secours.import.sansNom")) + '</strong>' +
                         '<span class="kta-secours-import-preview-meta">' +
                           ' · ' + t("secours.import.membres", { n: nbMembres }) +
                           (hasZone ? ' · ' + t("secours.import.chipZone") : '') +
                           (hasParcours ? ' · ' + t("secours.import.chipParcours") : '') +
                           levelChip +
                         '</span>' +
                       '</li>';
      });
      if (groupes.length > 8) {
        equipesHtml += '<li style="color:#8892a4; font-style:italic;">' + t("secours.import.autres", { n: (groupes.length - 8) }) + '</li>';
      }
      equipesHtml += '</ul>';
    }

    let warningBlock = "";
    if (warning) {
      const currentPlanName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || t("secours.import.planCourant");
      const importedPlanName = planSrc.name || t("secours.import.planInconnu");
      warningBlock = '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.12); border:1px solid rgba(255,140,0,0.55); border-radius:6px; padding:10px 12px; margin:14px 0; color:#ffb380;">' +
                       '⚠️ <strong>' + t("secours.import.warnTitre") + '</strong><br>' +
                       '<span style="font-size:13px; line-height:1.5;">' +
                         t("secours.import.warnBody", { planSource: _escHtml(importedPlanName), planCourant: _escHtml(currentPlanName) }) +
                       '</span>' +
                     '</div>';
    }

    // 🩸 29/09/2026 — Scénario déjà sur l'appareil (même id) : le choix entre
    // « Remplacer » (garde le lien avec les rapports des équipes) et « Copie ».
    const existant = (typeof sc.id === "string" && sc.id) ? get(sc.id) : null;
    let existeBlock = "";
    if (existant) {
      // Des saisies d'intervention (en cours OU terminée) existent ici : « Remplacer » les efface.
      const enCours = !!existant.execution;
      existeBlock = '<div style="background:rgba(140,180,255,0.10); border:1px solid rgba(140,180,255,0.45);' +
                    ' border-radius:6px; padding:10px 12px; margin:14px 0; color:#c8d0e0; font-size:13px; line-height:1.5;">' +
                      '<strong class="kta-tx-info" style="color:#8cb4ff;">' + t("secours.import.existeTitre") + '</strong><br>' +
                      t("secours.import.existeBody", { nom: _escHtml(existant.nom || t("secours.import.sansNom")) }) +
                      (enCours ? '<br><span class="kta-tx-warn" style="color:#ffb380;">⚠️ ' + t("secours.import.existeExecution") +
                                 '</span>' : '') +
                      '<label style="display:flex; gap:8px; margin-top:8px; cursor:pointer;">' +
                        '<input type="radio" name="kta-sec-import-mode" value="remplacer" checked> ' +
                        '<span>' + t("secours.import.modeRemplacer") + '</span></label>' +
                      '<label style="display:flex; gap:8px; margin-top:4px; cursor:pointer;">' +
                        '<input type="radio" name="kta-sec-import-mode" value="copie"> ' +
                        '<span>' + t("secours.import.modeCopie") + '</span></label>' +
                    '</div>';
    }

    const inner = '<div class="kta-readme-modal-header">' +
                    '<h2 class="kta-tx-info" style="margin:0; color:#8cb4ff;">' + t("secours.import.previewTitre") + '</h2>' +
                    '<button class="kta-readme-modal-close" data-action="cancel-preview" aria-label="' + _escAttr(t("secours.btn.annulerAria")) + '">✕</button>' +
                  '</div>' +
                  '<div class="kta-readme-modal-corps">' +
                    '<p style="margin:0 0 14px 0;">' + t("secours.import.previewIntro") + '</p>' +

                    '<div class="kta-secours-import-preview-card">' +
                      '<div class="kta-secours-import-preview-titre">' + _escHtml(sc.nom || t("secours.import.sansNom")) + '</div>' +
                      '<div class="kta-secours-import-preview-grid">' +
                        '<div><span class="kta-secours-import-preview-label">' + t("secours.import.labelFichier") + '</span>' +
                          '<code>' + _escHtml(sourceFilename || t("secours.import.fichierDefault")) + '</code></div>' +
                        '<div><span class="kta-secours-import-preview-label">' + t("secours.import.labelDateExport") + '</span>' +
                          _escHtml(dateExport) + '</div>' +
                        '<div><span class="kta-secours-import-preview-label">' + t("secours.import.labelVersionApp") + '</span>' +
                          '<code>' + _escHtml(appVer) + '</code></div>' +
                        '<div><span class="kta-secours-import-preview-label">' + t("secours.import.labelPlanSource") + '</span>' +
                          _escHtml(planSrc.name || t("secours.import.planInconnu")) +
                          (planSrc.version ? ' <code>' + _escHtml(planSrc.version) + '</code>' : '') +
                        '</div>' +
                      '</div>' +
                    '</div>' +

                    '<div class="kta-secours-import-preview-section">' +
                      '<h3 style="margin:14px 0 6px 0; color:#f4c542;">' + t("secours.import.equipesIncluses", { n: groupes.length }) + '</h3>' +
                      equipesHtml +
                    '</div>' +

                    warningBlock +
                    _blocEcartVersion(payload.plan) +
                    _blocTracesIntrouvables(payload.plan, groupes) +
                    existeBlock +

                    '<div style="margin-top:18px; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">' +
                      '<button class="kta-btn kta-btn-ghost" data-action="cancel-preview">' + t("secours.btn.annulerCroix") + '</button>' +
                      '<button class="kta-btn kta-btn-primary" data-action="confirm-preview">' + t("secours.btn.importerScenario") + '</button>' +
                    '</div>' +
                  '</div>';

    boite.innerHTML = inner;
    overlay.appendChild(boite);

    function _close(confirmer) {
      // Mode lu AVANT de retirer la modale ; sans bloc « existant » → copie (sans effet).
      const radio = overlay.querySelector('input[name="kta-sec-import-mode"]:checked');
      const mode = radio ? radio.value : "copie";
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener("keydown", _onKey);
      try { onDone(!!confirmer, mode); } catch(e) {}
    }
    function _onKey(e) { if (e.key === "Escape") _close(false); }
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) _close(false);
    });
    overlay.querySelectorAll('[data-action="cancel-preview"]').forEach(function(btn) {
      btn.addEventListener("click", function() { _close(false); });
    });
    overlay.querySelectorAll('[data-action="confirm-preview"]').forEach(function(btn) {
      btn.addEventListener("click", function() { _close(true); });
    });
    document.addEventListener("keydown", _onKey);
    document.body.appendChild(overlay);
  }

  // Helper local — format court d'un niveau pour la preview équipes.
  // 0 → "RDC", >0 → "+N", <0 → "-N". Idempotent avec le chip card équipe.
  // 🩸 v1.83.0 — LA PROFONDEUR ENTRE DANS LA FICHE DE SECOURS.
  //
  // Un niveau était rendu « -2 » ou « RDC ». C'est une COORDONNÉE INTERNE : elle
  // ne dit rien à qui prépare une intervention. « -2 · -35 m » dit combien de
  // corde, quel type d'équipe, quelle durée d'évacuation.
  //
  // C'est le seul usage des profondeurs qui ait un enjeu autre que le confort,
  // et c'est pourquoi il passe par CE formateur : il est la source unique du
  // relevé texte (`secours.txt.niveau`), du PDF et des cartes de scénario. Le
  // brancher ici les sert tous les trois d'un coup — l'écrire trois fois aurait
  // garanti qu'une des trois dérive.
  //
  // Silencieux si la profondeur n'est pas renseignée : une fiche de secours ne
  // devine pas.
  // Audit i18n (O7) : « RDC » était écrit en dur (5 endroits) → GF / PB en EN / ES.
  function _lblNiveau(lvl) {
    return (lvl === 0) ? t("filter.levels.ground") : ((lvl > 0 ? "+" : "") + lvl);
  }
  function _formatLevelShort(level) {
    const base = _lblNiveau(level);
    if (!Number.isInteger(level)) return base;
    if (typeof window.getProfondeurNiveau !== "function") return base;
    const z = window.getProfondeurNiveau(level);
    if (!Number.isFinite(z)) return base;
    return base + " · " + z.toFixed(0) + " m";
  }

  // 🆕 v1.23.4 — Modale de feedback post-import. Succès = vert + bouton
  // "Ouvrir le scénario" qui bascule directement en vue Edit. Échec = rouge
  // avec message d'erreur détaillé (validation, JSON malformé, etc.).
  // Warning éventuel (plan différent) affiché en bandeau orange.
  function _afficherResultatImport(result, sourceFilename) {
    // Cleanup éventuelle modale précédente
    const existing = document.getElementById("kta-secours-import-result");
    if (existing) existing.remove();

    const ok = !!(result && result.ok);
    const overlay = document.createElement("div");
    overlay.id = "kta-secours-import-result";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100010";

    const boite = document.createElement("div");
    boite.className = "kta-readme-modal-boite";
    boite.style.maxWidth = "520px";
    boite.style.height = "auto";
    boite.style.maxHeight = "90vh";
    boite.style.borderLeft = ok ? "6px solid #6ee287" : "6px solid #ff8c8c";

    let inner = '<div class="kta-readme-modal-header">' +
                  '<h2 style="margin:0; color:' + (ok ? '#6ee287' : '#ff8c8c') + ';">' +
                    (ok ? t("secours.import.resOkTitre") : t("secours.import.resKoTitre")) +
                  '</h2>' +
                  '<button class="kta-readme-modal-close" data-action="close-result" aria-label="' + _escAttr(t("secours.btn.fermerAria")) + '">✕</button>' +
                '</div>' +
                '<div class="kta-readme-modal-corps">';

    if (ok) {
      const sc = result.scenario || {};
      const nbGroupes = (sc.groupes || []).length;
      inner += '<p>' + t(result.remplace ? "secours.import.resOkRemplace" : "secours.import.resOkBody",
                         { nom: _escHtml(sc.nom || t("secours.import.sansNom")) }) + '</p>' +
               '<p style="color:#8892a4; font-size:13px;">' +
                 t("secours.import.resOkSource", { fichier: _escHtml(sourceFilename || t("secours.import.fichierDefault")) }) + '<br>' +
                 t("secours.import.resOkEquipes", { n: nbGroupes }) +
               '</p>';
      if (result.warning) {
        inner += '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.12); border:1px solid rgba(255,140,0,0.5); border-radius:6px; padding:10px 12px; margin:12px 0; color:#ffb380;">' +
                   '⚠️ <strong>' + t("secours.import.avertissement") + '</strong> ' + _escHtml(result.warning) +
                 '</div>';
      }
      inner += '<div style="margin-top:18px; display:flex; gap:10px; justify-content:flex-end;">' +
                 '<button class="kta-btn kta-btn-secondary" data-action="close-result">' + t("secours.btn.fermer") + '</button>' +
                 '<button class="kta-btn kta-btn-primary" data-action="open-imported">' + t("secours.btn.ouvrirScenario") + '</button>' +
               '</div>';
    } else {
      const errMsg = (result && result.error) || t("secours.import.erreurInconnue");
      inner += '<p>' + t("secours.import.resKoBody", { fichier: _escHtml(sourceFilename || t("secours.import.fichierDefault")) }) + '</p>' +
               '<div class="kta-tx-err" style="background:rgba(255,140,140,0.10); border:1px solid rgba(255,140,140,0.45); border-radius:6px; padding:10px 12px; margin:12px 0; color:#ffb3b3; font-family:monospace; font-size:13px; word-break:break-word;">' +
                 _escHtml(errMsg) +
               '</div>' +
               '<p style="color:#8892a4; font-size:13px;">' +
                 t("secours.import.resKoHint") +
               '</p>' +
               '<div style="margin-top:18px; display:flex; justify-content:flex-end;">' +
                 '<button class="kta-btn kta-btn-primary" data-action="close-result">' + t("secours.btn.jaiCompris") + '</button>' +
               '</div>';
    }
    inner += '</div>';

    boite.innerHTML = inner;
    overlay.appendChild(boite);

    function _close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener("keydown", _onKey);
    }
    function _onKey(e) { if (e.key === "Escape") _close(); }
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) _close();
    });
    overlay.querySelectorAll('[data-action="close-result"]').forEach(function(btn) {
      btn.addEventListener("click", _close);
    });
    overlay.querySelectorAll('[data-action="open-imported"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _close();
        if (result && result.scenario && result.scenario.id) {
          _currentScenarioId = result.scenario.id;
          _switchView("edit");
        }
      });
    });
    document.addEventListener("keydown", _onKey);
    document.body.appendChild(overlay);
  }

  // ==========================================================================
  // 🆕 v1.26.0 — Import rapport équipier .mkmsec.report.json (consolidation cross-device)
  // ==========================================================================
  // Permet à l'opérateur surface d'importer le rapport d'un équipier (export
  // .mkmsec.report.json scope=equipe généré v1.25.0) pour FUSIONNER ses
  // observations + statuts + photos dans le scenario.execution opérateur.
  //
  // Cas d'usage : équipier au retour surface partage son rapport via fichier
  // (mail, AirDrop, USB, Discord…), l'opérateur l'importe et son tableau de
  // supervision est mis à jour avec les obs terrain. Remplace fonctionnellement
  // la voie QR Share Phase 4 (rollback hotfix17).
  //
  // Politique de fusion (validée KARMA v1.26.0) :
  //   - obs : concaténation `existant + "\n\n--- 📥 Import Équipier <ts> ---\n" + importé`
  //   - statut : prendre le PLUS SÉVÈRE via TABLEAU_STATUTS.severity
  //   - photos : push avec dédup par id (collision rare via genId aléatoire)
  //   - timestamps : préserve le plus ancien startedAt + plus récent completedAt
  //   - flag `_importedFrom` sur chaque étape mutée (traçabilité + chip UI)
  //   - audit log dans `s.execution._importLog: []`
  //   - snapshot SessionBackups AVANT (= undo via restauration backup)
  //
  // Refus :
  //   - scope !== "equipe" (operateur = doublon, secouriste = scope différent)
  //   - scenario.id différent de l'actif (force la cohérence opérateur ↔ équipier)
  //   - equipe.id absent du scénario actif (équipe inconnue, anti-doublon)
  //   - pas d'exécution active côté op (lancer le plan d'abord)
  //
  // Plan différent → warning (pas erreur) — décision finale dans modale preview.

  const REPORT_FORMAT_VERSION_MAX = 1; // version max supportée à l'import

  // Parse + validation seule (pas d'injection). Symétrique à _parsePayloadMkmsec.
  // Retourne : { ok, payload?, equipeId?, conflits?, warning?, error? }
  // `conflits` est un array d'étapes côté op déjà renseignées (statut !== pending
  // OU observations non-vides) qui seront fusionnées (info pour modale preview).
  async function _parsePayloadReport(input) {
    let text;
    try {
      if (input instanceof File || input instanceof Blob) {
        text = await input.text();
      } else if (typeof input === "string") {
        text = input;
      } else {
        return { ok: false, error: t("secours.import.errInputInvalide") };
      }
    } catch(e) {
      return { ok: false, error: t("secours.import.errLecture", { message: e.message }) };
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch(e) {
      return { ok: false, error: t("secours.import.errJson", { message: e.message }) };
    }

    // Validation type/version
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: t("secours.import.errPayload") };
    }
    if (payload.type !== "myktamap-secours-report") {
      return { ok: false, error: t("secours.report.errType", { type: (payload.type || t("secours.report.absent")) }) };
    }
    if (typeof payload.version !== "number" || payload.version < 1 || payload.version > REPORT_FORMAT_VERSION_MAX) {
      return { ok: false, error: t("secours.report.errVersion", { version: payload.version, max: REPORT_FORMAT_VERSION_MAX }) };
    }

    // Validation scope = equipe (MVP v1.26.0 : seuls les rapports équipiers fusionnables)
    if (payload.scope !== "equipe") {
      if (payload.scope === "operateur") {
        return { ok: false, error: t("secours.report.errScopeOperateur") };
      }
      if (payload.scope === "secouriste") {
        return { ok: false, error: t("secours.report.errScopeSecouriste") };
      }
      return { ok: false, error: t("secours.report.errScopeInconnu", { scope: payload.scope }) };
    }

    // Validation equipesData (doit contenir 1 équipe)
    if (!Array.isArray(payload.equipesData) || payload.equipesData.length !== 1) {
      return { ok: false, error: t("secours.report.errEquipesData", { n: (Array.isArray(payload.equipesData) ? payload.equipesData.length : t("secours.report.nonArray")) }) };
    }
    const ed = payload.equipesData[0];
    if (!ed.equipe || typeof ed.equipe !== "object" || typeof ed.equipe.id !== "string") {
      return { ok: false, error: t("secours.report.errEquipeInvalide") };
    }

    // Validation scénario actif côté op
    const currentScenario = get(_currentScenarioId);
    if (!currentScenario) {
      return { ok: false, error: t("secours.report.errAucunScenario") };
    }
    if (!currentScenario.execution || !currentScenario.execution.active) {
      return { ok: false, error: t("secours.report.errPasExecution") };
    }

    // Validation scenario.id correspond
    if (payload.scenario && payload.scenario.id && payload.scenario.id !== currentScenario.id) {
      return { ok: false, error: t("secours.report.errScenarioDifferent", { nom: (payload.scenario.nom || t("secours.import.sansNom")), id: payload.scenario.id.slice(0, 8), nomActif: currentScenario.nom }) };
    }

    // Validation equipe.id existe côté op
    const equipeOp = currentScenario.groupes.find(function(g) { return g.id === ed.equipe.id; });
    if (!equipeOp) {
      return { ok: false, error: t("secours.report.errEquipeAbsente", { nom: (ed.equipe.nom || t("secours.import.sansNom")), id: ed.equipe.id.slice(0, 8) }) };
    }

    // Détection des conflits (info pour preview, pas une erreur).
    // 4e relecture (R4-9) : mêmes préparatifs que la fusion — identités posées et
    // rattachées, et étapes de la phase visée (phase close → son historique) —
    // sinon l'aperçu annonçait autre chose que ce qui serait fusionné.
    const gPrev = currentScenario.groupes.find(function(x) { return x.id === ed.equipe.id; });
    if (gPrev) { _normaliserParcours(gPrev); _rattacherWidEtapes(currentScenario, gPrev); }
    const phCour = (typeof currentScenario.execution.currentPhaseIdx === "number") ? currentScenario.execution.currentPhaseIdx : 0;
    const phRap = _phaseDuRapport(currentScenario, payload);
    const archPrev = (phRap !== phCour && currentScenario.execution.etapesArchive)
      ? currentScenario.execution.etapesArchive[String(phRap)] : null;
    const etapesOp = (archPrev && Array.isArray(archPrev[ed.equipe.id])) ? archPrev[ed.equipe.id]
      : ((currentScenario.execution.etapes && currentScenario.execution.etapes[ed.equipe.id]) || []);
    const conflits = [];
    const etapesImp = Array.isArray(ed.etapes) ? ed.etapes : [];
    const pairesImp = _apparierEtapes(etapesOp, etapesImp);
    etapesImp.forEach(function(etImp, iImp) {
      const etOp = pairesImp[iImp];
      if (!etOp) return; // sera signalé comme skipped, pas conflit
      const opHasObs = etOp.observations && String(etOp.observations).trim().length > 0;
      const opHasStatus = etOp.statut && etOp.statut !== "pending";
      if (opHasObs || opHasStatus) {
        conflits.push({
          idx: etImp.idx,
          label: etImp.label || etOp.label || t("secours.etape.fallback", { idx: etImp.idx }),
          opStatut: etOp.statut || "pending",
          impStatut: etImp.statut || "pending"
        });
      }
    });

    // Plan différent → warning (pas erreur)
    let warning = null;
    const currentPlanId = window._currentLoadedPlanId;
    const importedPlanId = payload.plan && payload.plan.id;
    if (currentPlanId && importedPlanId && currentPlanId !== importedPlanId) {
      const importedPlanName = (payload.plan && payload.plan.name) || t("secours.import.planInconnu");
      warning = t("secours.report.warnPlanDifferent", { plan: importedPlanName });
    }

    return {
      ok: true,
      payload: payload,
      equipeId: ed.equipe.id,
      equipeNom: ed.equipe.nom || t("secours.import.sansNom"),
      nbEtapes: etapesImp.length,
      nbPhotos: Array.isArray(ed.photos) ? ed.photos.length : 0,
      conflits: conflits,
      warning: warning
    };
  }

  // Injection seule depuis payload déjà validé. Mute s.execution.etapes[equipeId][...]
  // avec fusion + flag _importedFrom + audit log. Async (écriture photos IDB).
  // Retourne : { ok, stats: { etapesFusionnees, etapesSkipped, photosImportees,
  //                           photosSkipped, warnings: [string] } }
  // 🩸 4e relecture (R4-2, décision KARMA a) — UN RAPPORT DE PHASE 1 IMPORTÉ APRÈS LE
  // PASSAGE EN PHASE 2 remplissait en silence les étapes de la phase 2 (équipe
  // reconduite) : des galeries paraissaient fouillées alors que personne n'y était
  // allé. Phase du rapport = celle qu'il déclare ; rapport d'avant (sans phase) :
  // déduite des horodatages (tout terminé avant le début de la phase en cours →
  // phase précédente). Retourne l'index de phase du rapport.
  function _phaseDuRapport(s, payload) {
    const ex = s.execution || {};
    const cour = (typeof ex.currentPhaseIdx === "number") ? ex.currentPhaseIdx : 0;
    const dec = payload && payload.execution && payload.execution.currentPhaseIdx;
    if (typeof dec === "number") return dec;
    const debut = cour > 0 && Array.isArray(s.phases) && s.phases[cour] && Date.parse(s.phases[cour].startedAt || "");
    if (!debut) return cour;
    const ed = payload.equipesData && payload.equipesData[0];
    const dates = ((ed && ed.etapes) || []).map(function(e) { return Date.parse(e.completedAt || e.startedAt || ""); })
      .filter(function(d) { return d > 0; });
    return (dates.length > 0 && dates.every(function(d) { return d < debut; })) ? cour - 1 : cour;
  }

  async function _appliquerImportRapportEquipe(payload) {
    const s = get(_currentScenarioId);
    if (!s) return { ok: false, error: t("secours.report.errScenarioDisparu") };

    const ed = payload.equipesData[0];
    const equipeId = ed.equipe.id;
    const importedAt = _nowIso();
    const sourceScenarioId = (payload.scenario && payload.scenario.id) || null;
    const sourceAppVersion = payload.appVersion || null;

    // Snapshot AVANT pour undo (cf SessionBackups v1.16.0 step 4).
    // Si le module n'est pas dispo, on continue quand même (best-effort).
    try {
      if (window.SessionBackups && typeof window.SessionBackups.snapshot === "function") {
        window.SessionBackups.snapshot(t("secours.report.snapshotLabel", { equipe: (ed.equipe.nom || t("secours.import.sansNom")) }));
      }
    } catch(e) {
      console.warn("[SecoursMode] snapshot avant import :", e);
    }

    const phaseCour = (typeof s.execution.currentPhaseIdx === "number") ? s.execution.currentPhaseIdx : 0;
    const phaseRap = _phaseDuRapport(s, payload);
    const archPhase = (phaseRap !== phaseCour && s.execution.etapesArchive)
      ? s.execution.etapesArchive[String(phaseRap)] : null;
    // Rapport d'une phase CLOSE : fusion dans l'historique de CETTE phase, jamais dans
    // la phase en cours ; pas de remise de point (le parcours actuel n'est pas le sien).
    const phaseClose = !!(archPhase && Array.isArray(archPhase[equipeId]));
    let etapesOp;
    if (phaseClose) {
      etapesOp = archPhase[equipeId];
    } else {
      // 4e relecture (R4-18) : ne plus CRÉER d'entrée vide pour une équipe hors de la
      // phase en cours (la fusion n'ajoute jamais d'étape : elle ne ferait que traîner
      // dans la structure de la phase).
      s.execution.etapes = s.execution.etapes || {};
      etapesOp = s.execution.etapes[equipeId] || [];
    }

    const etapesImportees = Array.isArray(ed.etapes) ? ed.etapes : [];
    const photosImportees = Array.isArray(ed.photos) ? ed.photos : [];

    const stats = {
      etapesFusionnees: 0,
      etapesSkipped: 0,
      photosImportees: 0,
      photosSkipped: 0,
      photosDejaPresentes: 0,
      warnings: [],
      alertes: [],  // 2e relecture (N11) : affichées en clair, jamais repliées
      avis: []      // 4e relecture : avertissements orange en clair (rapport de phase close…)
    };

    // Index photos importées par stepIdx pour rattachement
    const photosByStep = {};
    photosImportees.forEach(function(p) {
      if (typeof p.stepIdx !== "number") return;
      if (!photosByStep[p.stepIdx]) photosByStep[p.stepIdx] = [];
      photosByStep[p.stepIdx].push(p);
    });

    // Timestamp formaté pour le séparateur de concat
    const tsLabel = new Date(payload.exportedAt || importedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    // 🩸 2e relecture (N11, décision KARMA a) — « aide » ou « victime » signalée par
    // l'équipe sur une étape que le PC a retirée entre-temps : le point est REMIS
    // dans le parcours de l'équipe, à sa place (après le point importé précédent),
    // puis fusionné normalement ; une alerte rouge le dit. Jamais une ligne repliée.
    const gEq = phaseClose ? null : s.groupes.find(function(x) { return x.id === equipeId; });
    if (phaseClose) {
      const nomPh = (s.phases && s.phases[phaseRap] && s.phases[phaseRap].nom) || String(phaseRap + 1);
      stats.avis.push(t("secours.report.avisPhaseClose", { phase: nomPh }));
      etapesImportees.forEach(function(e) {
        if (_getStatutInfo(e.statut).severity >= 2) {
          stats.alertes.push(t("secours.report.alertePhaseClose", { statut: _statutLabel(e.statut), label: e.label || "?", phase: nomPh }));
        }
      });
    }
    // 3e relecture (R3-1) : identités posées et rattachées AVANT d'apparier.
    if (gEq) { _normaliserParcours(gEq); _rattacherWidEtapes(s, gEq); }
    const preApp = _apparierEtapes(etapesOp, etapesImportees);
    // Remise SEULEMENT si le point a vraiment quitté le parcours (ni son wid ni sa
    // position n'y sont) et si l'équipe est dans la phase en cours (R3-2) ; sinon
    // alerte rouge sans remise (R3-2, R3-6 : rapport sans position).
    const dansParcours = function(e) {
      return _parcoursRoles(gEq.entree, gEq.intermediaires, gEq.sortie).some(function(it) {
        return (e.wid && it.wp.wid === e.wid) || (e.cle && _cleWaypoint(it.wp) === e.cle);
      });
    };
    const graves = phaseClose ? [] : etapesImportees.filter(function(e, i) {
      return !preApp[i] && _getStatutInfo(e.statut).severity >= 2;
    });
    const remettable = function(e) {
      return !!gEq && typeof e.cle === "string" && _resyncApplicable(s, gEq) && !dansParcours(e);
    };
    graves.filter(function(e) { return !remettable(e); }).forEach(function(e) {
      stats.alertes.push(t("secours.report.alerteNonRemise", { statut: _statutLabel(e.statut), label: e.label || "?" }));
    });
    const aRemettre = graves.filter(remettable);
    const remis = new Map();   // étape importée → wid du point remis (R3-5)
    if (gEq && aRemettre.length > 0) {
      aRemettre.forEach(function(e) {
        const c = e.cle.split(",").map(Number);
        const wp = { x: c[0], y: c[1], level: c[2] || 0, label: e.label || "", wid: e.wid || null };
        const iImp = etapesImportees.indexOf(e);
        let avant = null;
        for (let k = iImp - 1; k >= 0 && !avant; k--) avant = preApp[k];
        const arr = (gEq.intermediaires || []).slice();
        let pos = 0;
        if (avant && avant.type === "interm") {
          const j = arr.findIndex(function(w) { return w && w.wid === avant.wid; });
          pos = (j >= 0) ? j + 1 : arr.length;
        } else if (avant && avant.type === "sortie") {
          pos = arr.length;
        }
        arr.splice(pos, 0, wp);
        gEq.intermediaires = arr;
        _poserWids(gEq.id, _parcoursRoles(gEq.entree, gEq.intermediaires, gEq.sortie));
        remis.set(e, wp.wid);
        preApp[iImp] = { type: "interm", wid: wp.wid };   // R3-4 : « avant » des remises suivantes
        stats.alertes.push(t("secours.report.alerteRemise", { statut: _statutLabel(e.statut), label: e.label || "?" }));
      });
      _resyncEtapesEquipe(s, gEq);
      etapesOp = s.execution.etapes[equipeId];
    }

    // Fusion étape par étape (sequential car écritures IDB photos)
    // Appariement global (position, puis libellé par rang, puis numéro) : cf _apparierEtapes.
    const pairesFusion = _apparierEtapes(etapesOp, etapesImportees);
    for (let i = 0; i < etapesImportees.length; i++) {
      const etImp = etapesImportees[i];
      // Point remis (R3-5) : retrouvé par son wid, quel que soit son ancien type.
      const etapeOp = pairesFusion[i] || (remis.has(etImp)
        ? etapesOp.find(function(x) { return x.wid === remis.get(etImp); }) || null : null);
      if (!etapeOp) {
        stats.etapesSkipped++;
        stats.warnings.push(t("secours.report.warnEtapeAbsente", { idx: etImp.idx, label: (etImp.label || "?") }));
        // 2e relecture (N11) : ses saisies ne sont pas jetées — archivées avec les
        // étapes retirées (photos non importées : l'étape n'existe plus ici).
        if (_etapeADesDonnees(etImp)) {
          // 4e relecture (R4-4) : un indice / une observation / une photo sur une étape
          // que le PC n'a plus n'est plus invisible : avis orange en clair, photos
          // importées (hors rapport, stepIdx -2) et comptées dans l'archive.
          const photosHp = [];
          const P = window.MyKTAMapSecoursPhotos;
          for (const ph of (photosByStep[etImp.idx] || [])) {
            if (!ph.dataUrl || !P || typeof P.importPhotoFromDataUrl !== "function") continue;
            try {
              await P.importPhotoFromDataUrl({ id: ph.id, scenarioId: s.id, equipeId: equipeId, stepIdx: -2,
                mime: ph.mime || "image/jpeg", dataUrl: ph.dataUrl, sourceScenarioId: sourceScenarioId });
              photosHp.push(ph.id);
              stats.photosImportees++;
            } catch(e) {
              stats.warnings.push(t("secours.report.warnPhotoErreur", { id: (ph.id || "?"), message: (e && e.message) || String(e) }));
            }
          }
          if (_getStatutInfo(etImp.statut).severity < 2) {
            stats.avis.push(t("secours.report.avisHorsParcours", { statut: _statutLabel(etImp.statut), label: etImp.label || "?" }));
          }
          s.execution._etapesRetirees = s.execution._etapesRetirees || {};
          // R4-3 : une étape déjà archivée (même point) est MISE À JOUR, pas ré-ajoutée
          // à chaque import (archive 2 → 4 → 6 mesurée).
          const arch = (s.execution._etapesRetirees[equipeId] || []).filter(function(x) {
            return !((etImp.wid && x.wid === etImp.wid) || (!etImp.wid && etImp.cle && x.cle === etImp.cle
              && x.type === etImp.type) || (!etImp.wid && !etImp.cle && x.label === etImp.label && x.type === etImp.type));
          });
          s.execution._etapesRetirees[equipeId] = arch.concat([
            Object.assign({}, etImp, { photoIds: photosHp, retireeAt: importedAt,
              _importedFrom: { sourceScenarioId: sourceScenarioId, importedAt: importedAt } })
          ]);
        }
        continue;
      }

      // Concaténation observations (sauf si import vide).
      // 🩸 4e relecture (R4-3) — chaque ré-import (et le rapport final, qui reprend
      // l'intermédiaire) DUPLIQUAIT les observations (« trace » ×3 mesuré). L'étape
      // mémorise le dernier texte reçu de l'équipe (`_obsImport`) : identique → rien ;
      // prolongé → seule la partie nouvelle ; déjà présent au PC → rien.
      const importedObs = String(etImp.observations || "").trim();
      const dejaRecu = String(etapeOp._obsImport || "");
      let aAjouter = importedObs;
      if (importedObs === dejaRecu) {
        aAjouter = "";
      } else if (dejaRecu && importedObs.indexOf(dejaRecu) === 0) {
        aAjouter = importedObs.slice(dejaRecu.length).trim();
      }
      if (aAjouter && String(etapeOp.observations || "").indexOf(aAjouter) >= 0) aAjouter = "";
      if (aAjouter.length > 0) {
        const existingObs = String(etapeOp.observations || "").trim();
        const separator = "\n\n" + t("secours.report.separator", { ts: tsLabel }) + "\n";
        etapeOp.observations = existingObs.length > 0
          ? (existingObs + separator + aAjouter)
          : aAjouter;
      }
      if (importedObs) etapeOp._obsImport = importedObs;

      // Statut : plus sévère (sauf si import = pending, qui n'écrase jamais).
      // 🩸 29/09/2026 (audit Secours) — l'égalité gardait TOUJOURS le statut du PC :
      // « RAS » (sévérité 0, comme « en attente ») rapporté par l'équipe était perdu,
      // et entre bloqué / indice / demi-tour (tous 1) le premier arrivé gagnait.
      // Désormais : un statut reçu bat « en attente » ; à sévérité égale, le plus
      // récent (completedAt, lu AVANT la fusion des horodatages ci-dessous) gagne.
      if (etImp.statut && etImp.statut !== "pending") {
        const statutOp = etapeOp.statut || "pending";
        const sevOp = _getStatutInfo(statutOp).severity;
        const sevImp = _getStatutInfo(etImp.statut).severity;
        const tOp = etapeOp.completedAt ? Date.parse(etapeOp.completedAt) || 0 : 0;
        const tImp = etImp.completedAt ? Date.parse(etImp.completedAt) || 0 : 0;
        if (statutOp === "pending" || sevImp > sevOp || (sevImp === sevOp && tImp >= tOp)) {
          etapeOp.statut = etImp.statut;
        }
      }

      // Timestamps : préserver le plus ancien startedAt + le plus récent completedAt
      if (etImp.startedAt) {
        if (!etapeOp.startedAt || new Date(etImp.startedAt) < new Date(etapeOp.startedAt)) {
          etapeOp.startedAt = etImp.startedAt;
        }
      }
      if (etImp.completedAt) {
        if (!etapeOp.completedAt || new Date(etImp.completedAt) > new Date(etapeOp.completedAt)) {
          etapeOp.completedAt = etImp.completedAt;
        }
      }

      // Photos rattachées à cette étape
      const photosCetteEtape = photosByStep[etImp.idx] || [];
      etapeOp.photoIds = etapeOp.photoIds || [];
      for (let j = 0; j < photosCetteEtape.length; j++) {
        const photo = photosCetteEtape[j];
        // Dédup par id (très rare collision via generateId aléatoire mais safety)
        if (etapeOp.photoIds.indexOf(photo.id) >= 0) {
          stats.photosDejaPresentes++;
          continue;
        }
        // Vérif autonome (dataUrl présent) sinon skip
        if (!photo.dataUrl) {
          stats.photosSkipped++;
          stats.warnings.push(t("secours.report.warnPhotoSansData", { id: photo.id }));
          continue;
        }
        // Écriture IDB via secoursPhotos
        try {
          if (window.MyKTAMapSecoursPhotos
              && typeof window.MyKTAMapSecoursPhotos.importPhotoFromDataUrl === "function") {
            const res = await window.MyKTAMapSecoursPhotos.importPhotoFromDataUrl({
              id:               photo.id,
              scenarioId:       s.id,
              equipeId:         equipeId,
              stepIdx:          etapeOp.idx,   // numéro LOCAL (cf _apparierEtapes)
              mime:             photo.mime || "image/jpeg",
              dataUrl:          photo.dataUrl,
              sourceScenarioId: sourceScenarioId
            });
            etapeOp.photoIds.push(photo.id);
            if (res && res.status === "already-present") {
              stats.photosDejaPresentes++;
            } else {
              stats.photosImportees++;
            }
          } else {
            stats.photosSkipped++;
            stats.warnings.push(t("secours.report.warnModulePhotos", { id: photo.id }));
          }
        } catch(e) {
          stats.photosSkipped++;
          stats.warnings.push(t("secours.report.warnPhotoErreur", { id: (photo.id || "?"), message: (e && e.message ? e.message : String(e)) }));
        }
      }

      // A3 : position précisée de la victime — la plus récente gagne.
      if (etImp.victimePos && typeof etImp.victimePos.x === "number" && typeof etImp.victimePos.y === "number") {
        const tImp = Date.parse(etImp.victimePos.at || 0) || 0;
        const tOp = etapeOp.victimePos ? (Date.parse(etapeOp.victimePos.at || 0) || 0) : -1;
        if (tImp >= tOp) etapeOp.victimePos = etImp.victimePos;
      }

      // Flag traçabilité (UI chip + audit)
      etapeOp._importedFrom = {
        sourceScenarioId: sourceScenarioId,
        sourceAppVersion: sourceAppVersion,
        importedAt:       importedAt
      };

      stats.etapesFusionnees++;
    }

    // Audit log scenario-level
    s.execution._importLog = s.execution._importLog || [];
    s.execution._importLog.push({
      at:                  importedAt,
      sourceScenarioId:    sourceScenarioId,
      sourceAppVersion:    sourceAppVersion,
      sourceExportedAt:    payload.exportedAt || null,
      equipeId:            equipeId,
      equipeNom:           ed.equipe.nom || "(sans nom)",
      etapesFusionnees:    stats.etapesFusionnees,
      etapesSkipped:       stats.etapesSkipped,
      photosImportees:     stats.photosImportees,
      photosSkipped:       stats.photosSkipped,
      photosDejaPresentes: stats.photosDejaPresentes,
      warningsCount:       stats.warnings.length
    });

    _commitMutation(s);
    return { ok: true, stats: stats };
  }

  // Modale preview AVANT injection. Symétrique à _afficherPreviewImport mais
  // pour rapports équipiers (highlight équipe cible + n étapes + n photos +
  // n conflits si applicable).
  function _afficherPreviewImportRapport(parseResult, sourceFilename, onDone) {
    // Cleanup éventuelle modale précédente
    const existing = document.getElementById("kta-secours-import-rapport-preview");
    if (existing) existing.remove();

    const payload = parseResult.payload;
    const overlay = document.createElement("div");
    overlay.id = "kta-secours-import-rapport-preview";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100010";

    const boite = document.createElement("div");
    boite.className = "kta-readme-modal-boite";
    boite.style.maxWidth = "580px";
    boite.style.height = "auto";
    boite.style.maxHeight = "92vh";
    boite.style.borderLeft = "6px solid #6ee287"; // vert = action de fusion

    const dateExport = payload.exportedAt
                       ? new Date(payload.exportedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR")
                       : t("secours.import.dateInconnue");
    const appVer = payload.appVersion || t("secours.import.versionInconnue");
    const planSrc = payload.plan || {};
    const equipeNom = parseResult.equipeNom;
    const nbEtapes = parseResult.nbEtapes;
    const nbPhotos = parseResult.nbPhotos;
    const conflits = parseResult.conflits || [];
    const warning = parseResult.warning;

    let conflitsBlock = "";
    if (conflits.length > 0) {
      const lignes = conflits.slice(0, 6).map(function(c) {
        const opInfo = _getStatutInfo(c.opStatut);
        const impInfo = _getStatutInfo(c.impStatut);
        return '<li>' +
                 '<strong>' + _escHtml(c.label) + '</strong> · ' +
                 '<span style="color:' + opInfo.color + ';">' + opInfo.emoji + ' ' + _escHtml(_statutLabel(c.opStatut)) + '</span>' +
                 ' ' + t("secours.conflit.op") + ' → ' +
                 '<span style="color:' + impInfo.color + ';">' + impInfo.emoji + ' ' + _escHtml(_statutLabel(c.impStatut)) + '</span>' +
                 ' ' + t("secours.conflit.import") +
               '</li>';
      }).join("");
      const extra = conflits.length > 6 ? '<li style="color:#8892a4; font-style:italic;">' + t("secours.conflit.autres", { n: (conflits.length - 6) }) + '</li>' : "";
      conflitsBlock =
        '<div style="background:rgba(255,140,0,0.10); border:1px solid rgba(255,140,0,0.45); border-radius:6px; padding:10px 12px; margin:14px 0; color:#e8eaf0;">' +
          '<strong style="color:#f4c542;">' + t("secours.conflit.titre", { n: conflits.length }) + '</strong> ' + t("secours.conflit.intro") +
          '<ul style="margin:8px 0 4px 18px; padding:0; font-size:13px; line-height:1.6;">' + lignes + extra + '</ul>' +
          '<div style="font-size:12px; color:#a8b3c8; margin-top:6px;">' +
            t("secours.conflit.politique") +
          '</div>' +
        '</div>';
    }

    let warningBlock = "";
    if (warning) {
      warningBlock =
        '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.10); border:1px solid rgba(255,140,0,0.55); border-radius:6px; padding:10px 12px; margin:14px 0; color:#ffb380;">' +
          '⚠️ <strong>' + _escHtml(warning) + '</strong>' +
        '</div>';
    }

    const inner =
      '<div class="kta-readme-modal-header">' +
        '<h2 class="kta-tx-ok" style="margin:0; color:#6ee287;">' + t("secours.rapportPreview.titre") + '</h2>' +
        '<button class="kta-readme-modal-close" data-action="cancel-rapport-preview" aria-label="' + _escAttr(t("secours.btn.annulerAria")) + '">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="margin:0 0 14px 0;">' + t("secours.rapportPreview.intro") + '</p>' +

        '<div class="kta-secours-import-preview-card">' +
          '<div class="kta-secours-import-preview-titre">🚨 ' + _escHtml(equipeNom) + '</div>' +
          '<div class="kta-secours-import-preview-grid">' +
            '<div><span class="kta-secours-import-preview-label">' + t("secours.import.labelFichier") + '</span>' +
              '<code>' + _escHtml(sourceFilename || t("secours.import.fichierDefault")) + '</code></div>' +
            '<div><span class="kta-secours-import-preview-label">' + t("secours.import.labelDateExport") + '</span>' +
              _escHtml(dateExport) + '</div>' +
            '<div><span class="kta-secours-import-preview-label">' + t("secours.import.labelVersionApp") + '</span>' +
              '<code>' + _escHtml(appVer) + '</code></div>' +
            '<div><span class="kta-secours-import-preview-label">' + t("secours.import.labelPlanSource") + '</span>' +
              _escHtml(planSrc.name || t("secours.import.planInconnu")) +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="kta-secours-import-preview-section">' +
          '<h3 style="margin:14px 0 6px 0; color:#f4c542;">' + t("secours.rapportPreview.contenuTitre") + '</h3>' +
          '<ul style="margin:0; padding-left:20px; line-height:1.7;">' +
            '<li>' + t("secours.rapportPreview.nbEtapes", { n: nbEtapes }) + '</li>' +
            '<li>' + t("secours.rapportPreview.nbPhotos", { n: nbPhotos }) + '</li>' +
          '</ul>' +
        '</div>' +

        conflitsBlock +
        warningBlock +
        _blocEcartVersion(payload.plan) +

        '<div style="background:rgba(140, 180, 255, 0.06); border-left:3px solid #8cb4ff; padding:10px 12px; margin:14px 0 0; border-radius:0 4px 4px 0; font-size:12px; color:#c8d0e0;">' +
          t("secours.rapportPreview.snapshotHint") +
        '</div>' +

        '<div style="margin-top:18px; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">' +
          '<button class="kta-btn kta-btn-ghost" data-action="cancel-rapport-preview">' + t("secours.btn.annulerCroix") + '</button>' +
          '<button class="kta-btn kta-btn-primary" data-action="confirm-rapport-preview">' + t("secours.btn.importerFusionner") + '</button>' +
        '</div>' +
      '</div>';

    boite.innerHTML = inner;
    overlay.appendChild(boite);

    function _close(confirmer) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener("keydown", _onKey);
      try { onDone(!!confirmer); } catch(e) {}
    }
    function _onKey(e) { if (e.key === "Escape") _close(false); }
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) _close(false);
    });
    overlay.querySelectorAll('[data-action="cancel-rapport-preview"]').forEach(function(btn) {
      btn.addEventListener("click", function() { _close(false); });
    });
    overlay.querySelectorAll('[data-action="confirm-rapport-preview"]').forEach(function(btn) {
      btn.addEventListener("click", function() { _close(true); });
    });
    document.addEventListener("keydown", _onKey);
    document.body.appendChild(overlay);
  }

  // Modale résultat post-import (succès = stats détaillées, échec = error).
  function _afficherResultatImportRapport(result, sourceFilename) {
    const existing = document.getElementById("kta-secours-import-rapport-result");
    if (existing) existing.remove();

    const ok = !!(result && result.ok);
    const overlay = document.createElement("div");
    overlay.id = "kta-secours-import-rapport-result";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100010";

    const boite = document.createElement("div");
    boite.className = "kta-readme-modal-boite";
    boite.style.maxWidth = "520px";
    boite.style.height = "auto";
    boite.style.maxHeight = "90vh";
    boite.style.borderLeft = ok ? "6px solid #6ee287" : "6px solid #ff8c8c";

    let inner = '<div class="kta-readme-modal-header">' +
                  '<h2 style="margin:0; color:' + (ok ? '#6ee287' : '#ff8c8c') + ';">' +
                    (ok ? t("secours.rapportRes.okTitre") : t("secours.import.resKoTitre")) +
                  '</h2>' +
                  '<button class="kta-readme-modal-close" data-action="close-rapport-result" aria-label="' + _escAttr(t("secours.btn.fermerAria")) + '">✕</button>' +
                '</div>' +
                '<div class="kta-readme-modal-corps">';

    if (ok) {
      const stats = result.stats || {};
      inner += '<p>' + t("secours.rapportRes.okBody", { fichier: _escHtml(sourceFilename || t("secours.import.fichierDefault")) }) + '</p>' +
               '<div style="background:rgba(110, 226, 138, 0.08); border:1px solid rgba(110, 226, 138, 0.35); border-radius:6px; padding:12px 14px; margin:12px 0; font-size:14px; line-height:1.7;">' +
                 '✅ ' + t("secours.rapportRes.etapesFusionnees", { n: (stats.etapesFusionnees || 0) }) + '<br>' +
                 '📷 ' + t("secours.rapportRes.photosImportees", { n: (stats.photosImportees || 0) }) +
                 ((stats.photosDejaPresentes || 0) > 0 ? ' <span style="color:#8892a4;">' + t("secours.rapportRes.photosDejaPresentes", { n: stats.photosDejaPresentes }) + '</span>' : '') + '<br>' +
                 ((stats.etapesSkipped || 0) > 0 ? '⏭️ ' + t("secours.rapportRes.etapesSkipped", { n: stats.etapesSkipped }) + '<br>' : '') +
                 ((stats.photosSkipped || 0) > 0 ? '⚠️ ' + t("secours.rapportRes.photosSkipped", { n: stats.photosSkipped }) + '<br>' : '') +
               '</div>';
      // 2e relecture (N11) : alertes « aide / victime » en clair, avant tout le reste
      if (Array.isArray(stats.alertes) && stats.alertes.length > 0) {
        inner += '<div class="kta-tx-err" style="background:rgba(255,68,68,0.14); border:1px solid #ff4444; border-radius:6px;' +
                 ' padding:10px 12px; margin:10px 0; color:#ffb3b3; font-size:13px; line-height:1.5;">🚨 ' +
                 stats.alertes.map(_escHtml).join('<br>🚨 ') + '</div>';
      }
      if (Array.isArray(stats.avis) && stats.avis.length > 0) {
        inner += '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.10); border:1px solid rgba(255,140,0,0.55); border-radius:6px;' +
                 ' padding:10px 12px; margin:10px 0; color:#ffb380; font-size:13px; line-height:1.5;">⚠️ ' +
                 stats.avis.map(_escHtml).join('<br>⚠️ ') + '</div>';
      }
      // Warnings détaillés en dépliable
      if (Array.isArray(stats.warnings) && stats.warnings.length > 0) {
        const lis = stats.warnings.map(function(w) { return '<li>' + _escHtml(w) + '</li>'; }).join("");
        inner += '<details style="margin:10px 0; font-size:13px;">' +
                   '<summary style="cursor:pointer; color:#f4c542;">' + t("secours.rapportRes.warningsSummary", { n: stats.warnings.length }) + '</summary>' +
                   '<ul style="margin:8px 0 0 20px; padding:0; color:#c8d0e0; line-height:1.6;">' + lis + '</ul>' +
                 '</details>';
      }
      inner += '<div style="margin-top:18px; display:flex; gap:10px; justify-content:flex-end;">' +
                 '<button class="kta-btn kta-btn-primary" data-action="close-rapport-result">' + t("secours.btn.ok") + '</button>' +
               '</div>';
    } else {
      const errMsg = (result && result.error) || t("secours.import.erreurInconnue");
      inner += '<p>' + t("secours.import.resKoBody", { fichier: _escHtml(sourceFilename || t("secours.import.fichierDefault")) }) + '</p>' +
               '<div class="kta-tx-err" style="background:rgba(255,140,140,0.10); border:1px solid rgba(255,140,140,0.45); border-radius:6px; padding:10px 12px; margin:12px 0; color:#ffb3b3; font-size:13px; line-height:1.5; word-break:break-word;">' +
                 _escHtml(errMsg) +
               '</div>' +
               '<p style="color:#8892a4; font-size:13px;">' +
                 t("secours.rapportRes.koHint") +
               '</p>' +
               '<div style="margin-top:18px; display:flex; justify-content:flex-end;">' +
                 '<button class="kta-btn kta-btn-primary" data-action="close-rapport-result">' + t("secours.btn.jaiCompris") + '</button>' +
               '</div>';
    }
    inner += '</div>';

    boite.innerHTML = inner;
    overlay.appendChild(boite);

    // 🆕 v1.43.26 — Pattern A : helper mutualisé _bindSubModalEsc()
    function _close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      _unbindEsc();
    }
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) _close();
    });
    overlay.querySelectorAll('[data-action="close-rapport-result"]').forEach(function(btn) {
      btn.addEventListener("click", _close);
    });
    const _unbindEsc = _bindSubModalEsc(_close);
    document.body.appendChild(overlay);
  }

  // File picker pour l'import .mkmsec.report.json depuis la vue Live Opérateur.
  // Symétrique à _ouvrirImportMkmsecPicker mais ciblé rapport équipier.
  function _ouvrirImportRapportEquipePicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.mkmsec.report.json,application/json";
    input.style.display = "none";
    input.addEventListener("change", async function() {
      const file = input.files && input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) return;

      let parsed;
      try {
        parsed = await _parsePayloadReport(file);
      } catch(e) {
        console.warn("[SecoursMode] _ouvrirImportRapportEquipePicker exception :", e);
        parsed = { ok: false, error: t("secours.import.errException", { message: (e && e.message ? e.message : String(e)) }) };
      }
      if (!parsed.ok) {
        _afficherResultatImportRapport({ ok: false, error: parsed.error }, file.name);
        return;
      }
      // Modale preview avec callback de confirmation
      _afficherPreviewImportRapport(parsed, file.name, async function(confirmer) {
        if (!confirmer) return;
        let applied;
        try {
          applied = await _appliquerImportRapportEquipe(parsed.payload);
        } catch(e) {
          console.warn("[SecoursMode] _appliquerImportRapportEquipe exception :", e);
          applied = { ok: false, error: t("secours.import.errException", { message: (e && e.message ? e.message : String(e)) }) };
        }
        _afficherResultatImportRapport(applied, file.name);
        // Refresh vue live op pour afficher les chips _importedFrom.
        // 4e relecture (R4-8) : appelait _renderInline, qui n'a jamais existé (le
        // typeof masquait l'absence) → cartes opérateur figées sur l'état d'avant.
        try {
          if (_modal) _switchView("live");
          if (_overlayLayer) renderOverlay(_currentScenarioId);
        } catch(e) { console.warn("[SecoursMode] re-render post-import :", e); }
      });
    });
    document.body.appendChild(input);
    input.click();
  }

  // Duplique un scénario (= deep clone via JSON roundtrip + nouveau id).
  // Pratique pour "et si l'équipe Alpha sort par le Sud au lieu de l'Est" :
  // dupliquer puis modifier l'équipe sans perdre l'original.
  function duplicateScenario(id) {
    const src = get(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = _genId("secours");
    copy.nom = t("secours.scenario.copieSuffix", { nom: src.nom });
    copy.createdAt = _nowIso();
    copy.updatedAt = _nowIso();
    // Régénère aussi les IDs internes des groupes (sinon collisions)
    // 🩸 Relecture 29/09 (H1) — les phases n'étaient pas remappées (la copie
    // n'avait aucune équipe dans ses phases) et l'exécution EN COURS était recopiée
    // avec les anciens ids : la « variante et si » d'une intervention naissait
    // « en cours », protégée de la purge, sans étapes. Une variante est un plan
    // neuf : phases remappées et remises à zéro, pas d'exécution.
    const idMap = {};
    if (Array.isArray(copy.groupes)) {
      copy.groupes.forEach(function(g) { const ancien = g.id; g.id = _genId("G"); idMap[ancien] = g.id; });
    }
    if (Array.isArray(copy.phases)) {
      copy.phases = copy.phases.map(function(p) {
        return Object.assign({}, p, {
          id:        _genId("P"),
          groupeIds: (p.groupeIds || []).map(function(x) { return idMap[x]; }).filter(Boolean),
          startedAt: null, endedAt: null, debrief: "", debriefAt: null
        });
      });
    }
    delete copy.execution;
    delete copy.arriveeAt;
    _scenarios.push(copy);
    _commitMutation(copy);
    return copy;
  }

  // ============================================================
  // CRUD — GROUPES (équipes) au sein d'un scénario
  // ============================================================

  // Ajoute un groupe vide à un scénario. couleurIdx auto-assigné au prochain
  // libre dans la palette (cyclique si > 10 équipes).
  // 🆕 v1.23.3 — accept un 3e arg `level` (number | null) pour assigner
  // directement le niveau M-LVL de référence à la création (sinon récupéré
  // depuis APP_CONFIG.activeLevel par défaut dans le constructor du groupe).
  function addGroupe(scenarioId, nom, level) {
    const s = get(scenarioId);
    if (!s) return null;
    const safeName = (typeof nom === "string" && nom.trim())
                     ? nom.trim()
                     : t("secours.equipe.defaultNom", { nom: PALETTE[s.groupes.length % PALETTE.length].nom });
    const groupe = {
      id:                _genId("G"),
      nom:               safeName,
      couleurIdx:        s.groupes.length % PALETTE.length,
      membres:           [],
      // 🆕 v1.23.3 (KARMA "on doit pouvoir crée une équipe et lui assigné
      // une zone sur un niveau") : niveau M-LVL de RÉFÉRENCE de l'équipe.
      // Type : number | null (null = équipe pas assignée à un niveau, cas
      // plan mono-niveau ou équipe traversant plusieurs étages via jonctions).
      // Cohérent avec rendu overlay carte + filtre M-LVL au render.
      // Défini par défaut depuis APP_CONFIG.activeLevel si M-LVL actif.
      level:             (level != null) ? level
                       : (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true
                          && typeof window.APP_CONFIG.activeLevel === "number")
                         ? window.APP_CONFIG.activeLevel : null,
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
      observations:      "",
      // 🆕 v1.41.0 E — Position GPS surface de l'équipe (où elle est en
      // surface = PC secours, lieu de rdv pompiers, etc.). Optionnel.
      // Format {lat, lng} décimal (WGS84). null = non renseigné.
      // Sérialisé naturellement dans export JSON .mkmsec.json + utilisé
      // par le Briefing pompiers PDF (lien OSM clickable, marker carte).
      surfaceGps:        null
    };
    s.groupes.push(groupe);
    // 🆕 v1.29.0 C1 — Affecte automatiquement le nouvel équipage à la phase
    // courante (ou phase 0 si pas d'exécution lancée). Modèle hybride 1:c :
    // l'utilisateur pourra décocher cette équipe d'une phase ultérieure via
    // l'UI C2 si elle n'y participe pas. Garde-fou idempotent : pas de doublon
    // si l'ID y est déjà.
    if (Array.isArray(s.phases) && s.phases.length > 0) {
      const targetIdx = (s.execution && typeof s.execution.currentPhaseIdx === "number")
                        ? s.execution.currentPhaseIdx
                        : 0;
      const targetPhase = s.phases[targetIdx] || s.phases[0];
      if (targetPhase) {
        if (!Array.isArray(targetPhase.groupeIds)) targetPhase.groupeIds = [];
        if (targetPhase.groupeIds.indexOf(groupe.id) === -1) {
          targetPhase.groupeIds.push(groupe.id);
        }
      }
    }
    _resyncEtapesEquipe(s, groupe);   // renfort ajouté en cours de phase
    _commitMutation(s);
    return groupe;
  }

  // Update partiel d'un groupe. Whitelist des champs mutables.
  function updateGroupe(scenarioId, groupeId, partial) {
    const s = get(scenarioId);
    if (!s) return null;
    const g = s.groupes.find(function(x) { return x.id === groupeId; });
    if (!g || !partial || typeof partial !== "object") return null;
    // 🩸 Relecture 29/09 (R4, décision KARMA 1:a) — retirer du parcours, pendant
    // l'intervention, une étape qui porte des saisies : confirmation ; REFUS si elle
    // porte « aide demandée » ou « victime » (l'info ne doit pas quitter le stepper).
    const touchePar = ("entree" in partial || "sortie" in partial || "intermediaires" in partial);
    if (touchePar) {
      // Identité des points : un point NOUVEAU (ou remplacé) reçoit un nouveau wid ;
      // les étapes d'avant les wid sont rattachées au parcours actuel.
      _normaliserParcours(g);
      _rattacherWidEtapes(s, g);
      // Un point fourni SANS wid (objet neuf d'un appelant) mais au même endroit et
      // dans le même rôle qu'un point existant EST ce point : il hérite de son wid.
      // Seul un point nouveau ou déplacé reçoit une identité neuve (un homonyme
      // placé ailleurs reste un autre point : N3).
      const heriter = function(liste, anciens) {
        const pris = new Set(liste.map(function(w) { return w && w.wid; }).filter(Boolean));
        liste.forEach(function(w) {
          if (!w || w.wid) return;
          const cle = _cleWaypoint(w);
          const src = anciens.find(function(o) {
            return o && o.wid && !pris.has(o.wid) && (o.cle || _cleWaypoint(o)) === cle;
          });
          if (src) { w.wid = src.wid; pris.add(src.wid); }
        });
      };
      // … y compris un point RETIRÉ puis remis au même endroit : il reprend l'identité
      // de son étape archivée, donc ses saisies (et reste reconnu à la fusion).
      const arch = (s.execution && s.execution._etapesRetirees && s.execution._etapesRetirees[g.id]) || [];
      const archDe = function(type) { return arch.filter(function(e) { return e.type === type; }); };
      if ("entree" in partial) heriter([partial.entree], [g.entree].concat(archDe("entree")));
      if ("sortie" in partial) heriter([partial.sortie], [g.sortie].concat(archDe("sortie")));
      if (Array.isArray(partial.intermediaires)) {
        heriter(partial.intermediaires, (g.intermediaires || []).concat(archDe("interm")));
      }
      _poserWids(g.id, _parcoursRoles(
        ("entree" in partial) ? partial.entree : g.entree,
        Array.isArray(partial.intermediaires) ? partial.intermediaires : g.intermediaires,
        ("sortie" in partial) ? partial.sortie : g.sortie));
      // Le refus aide/victime est RE-VÉRIFIÉ au ré-appel après confirmation (N5) :
      // seule la question est sautée, pas le contrôle.
      const perdues = _etapesPerduesSi(s, g, partial);
      if (perdues.some(function(e) { return _getStatutInfo(e.statut).severity >= 2; })) {
        _toast(t("secours.etape.retraitRefuse"), "error");
        return null;
      }
      if (perdues.length > 0 && !partial._confirmeRetrait) {
        if (typeof window.ktaConfirm === "function") {
          const noms = perdues.map(function(e) { return "• " + _escHtml(_lblEtape(e.label) || ""); }).join("\n");
          window.ktaConfirm(t("secours.etape.retraitConfirme", { n: perdues.length, liste: noms })).then(function(ok) {
            if (!ok) return;
            updateGroupe(scenarioId, groupeId, Object.assign({}, partial, { _confirmeRetrait: true }));
            _scheduleAutoRecalc(scenarioId, groupeId);
            if (_modal) _switchView("edit");
          });
        }
        return null;
      }
    }
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
    // 🆕 v1.23.3 — niveau M-LVL de référence de l'équipe (number | null)
    if ("level" in partial) {
      g.level = (typeof partial.level === "number" && Number.isInteger(partial.level))
                ? partial.level : null;
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
    // 🆕 v1.41.0 E — Position GPS surface équipe. Validation : {lat, lng}
    // numériques bornés, sinon null. Accepte aussi explicit null pour reset.
    if ("surfaceGps" in partial) {
      const p = partial.surfaceGps;
      if (p === null) {
        g.surfaceGps = null;
      } else if (p && typeof p === "object"
                 && typeof p.lat === "number" && typeof p.lng === "number"
                 && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180) {
        g.surfaceGps = { lat: p.lat, lng: p.lng };
      }
      // sinon : valeur invalide ignorée (pas d'écrasement)
    }
    if ("entree" in partial || "sortie" in partial || "intermediaires" in partial) {
      _resyncEtapesEquipe(s, g);   // parcours modifié en cours de phase
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
    // 🆕 v1.29.0 C1 — Nettoyage cross-phases : retire l'id de tous les
    // groupeIds[] de toutes les phases (sinon affichage de phantôme dans
    // l'UI C2). Idempotent — splice ne fait rien si pas trouvé.
    if (Array.isArray(s.phases)) {
      s.phases.forEach(function(phase) {
        if (!phase || !Array.isArray(phase.groupeIds)) return;
        const phaseIdx = phase.groupeIds.indexOf(groupeId);
        if (phaseIdx >= 0) phase.groupeIds.splice(phaseIdx, 1);
      });
    }
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
    // 🆕 hotfix3 (KARMA "si mode équipier en cours, on dit afficher sa zone
    // de recherche en mode edit, si opérateur toutes les zone, si secours
    // toutes les zones, avec un petit ✓ vert quand le point a été passé") :
    // Filtrage selon le rôle d'exécution si execution active. Sinon
    // comportement v1.25.x strict (toutes équipes + focus optionnel).
    const execActive = _estExecutionActive(s);
    const isEquipier = execActive && s.execution.role === "equipe" && s.execution.currentEquipeId;
    s.groupes.forEach(function(g) {
      // Mode équipier en cours → afficher SEULEMENT son équipe (override focus)
      if (isEquipier && g.id !== s.execution.currentEquipeId) return;
      // Mode focus manuel (legacy) → respecter
      if (!isEquipier && _focusedGroupeId && g.id !== _focusedGroupeId) return;
      const couleur = PALETTE[g.couleurIdx % PALETTE.length].hex;
      _renderGroupeOverlay(g, couleur, s);
    });
    // A3 : chaque victime a son marqueur ✚, visible de TOUS (sécurité), équipier compris.
    _victimesDe(s).forEach(function(v) {
      if (!v.pos) return;
      L.marker(_planToLatLng(v.pos), {
        icon: L.divIcon({ className: "kta-secours-victime-marker", html: "<span>✚</span>", iconSize: [30, 30], iconAnchor: [15, 15] }),
        zIndexOffset: 2000, keyboard: false
      }).bindTooltip("🚨 " + _escHtml(t("secours.victime.titre")) + " — " + _escHtml(v.g.nom), { direction: "top" })
        .addTo(_overlayLayer);
    });
  }

  // 🆕 hotfix3 — Helper pour récupérer l'étape execution correspondant à
  // un waypoint d'une équipe. Retourne null si pas d'execution active OU
  // si l'étape n'existe pas dans l'execution (cas où parcours ajusté après
  // lancement). Mapping : entrée=idx 0, intermédiaires=idx 1..N, sortie=idx N+1.
  function _getEtapeForWaypoint(s, equipeId, waypointType, intermIdx) {
    if (!_estExecutionActive(s) && !(s.execution && s.execution.endedAt)) {
      // Considère aussi execution terminée (rapport historique) pour
      // que les ✓ verts restent visibles dans bandeau PLAN TERMINÉ
      return null;
    }
    const etapes = _getEtapesEquipe(s, equipeId);
    if (!Array.isArray(etapes) || etapes.length === 0) return null;
    // 4e relecture (R4-15) : appariement par IDENTITÉ d'étape (wid) d'abord. Par
    // rang seul, le ✓ glissait sur le mauvais point dès que les étapes n'étaient plus
    // resynchronisées (équipe sortie de la phase, puis parcours modifié).
    const g = (s.groupes || []).find(function(x) { return x.id === equipeId; });
    const wp = !g ? null : waypointType === "entree" ? g.entree : waypointType === "sortie" ? g.sortie
             : (waypointType === "interm" && Array.isArray(g.intermediaires)) ? g.intermediaires[intermIdx] : null;
    if (wp && wp.wid && etapes.some(function(e) { return !!e.wid; })) {
      return etapes.find(function(e) { return e.wid === wp.wid; }) || null;
    }
    if (waypointType === "entree") {
      return etapes.find(function(e) { return e.type === "entree"; }) || null;
    }
    if (waypointType === "sortie") {
      return etapes.find(function(e) { return e.type === "sortie"; }) || null;
    }
    if (waypointType === "interm" && typeof intermIdx === "number") {
      // Les intermédiaires sont indexés dans l'ordre d'apparition
      const interms = etapes.filter(function(e) { return e.type === "interm"; });
      return interms[intermIdx] || null;
    }
    return null;
  }

  // 🆕 hotfix3 — Ajoute un badge ✓ vert (L.marker divIcon) en top-right
  // du marker d'étape si l'étape a été effectuée (completedAt set + statut
  // non-pending). Utilise la couleur du statut pour différencier RAS (vert)
  // vs Bloqué (gris) vs Victime (rouge) etc.
  function _addCheckBadgeIfDone(etape, latlng) {
    if (!etape || !etape.completedAt || etape.statut === "pending") return;
    const info = _getStatutInfo(etape.statut);
    // Petit badge circulaire avec l'emoji du statut (très petit)
    const icon = L.divIcon({
      className: "kta-secours-overlay-check-badge",
      html:      '<span class="kta-secours-overlay-check-badge-inner" ' +
                 'style="background:' + info.color + ';">' +
                 (etape.statut === "ras" ? "✓" : info.emoji) +
                 '</span>',
      iconSize:   [20, 20],
      iconAnchor: [-6, 16]   // décalage top-right vs le centre du marker
    });
    const badge = L.marker(latlng, { icon: icon, interactive: false, keyboard: false });
    badge.addTo(_overlayLayer);
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
        t("secours.overlay.zoneIncertitude", { rayon: Math.round(ctx.zoneIncertitude.radiusMeters) }),
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
                  ? t("secours.overlay.dernierePositionLabel", { label: ctx.lastKnownPoint.label })
                  : t("secours.overlay.dernierePosition");
      cm.bindTooltip(lbl, { permanent: false });
      cm.addTo(_overlayLayer);
    }
  }

  function _renderGroupeOverlay(g, couleur, s) {
    // 🆕 hotfix3 — Param `s` optionnel pour récupérer les étapes execution
    // et afficher les ✓ verts sur les waypoints effectués. Si s absent
    // (legacy callers), pas de badges (comportement v1.25.x strict).
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
      _tracesZone(g).forEach(function(road) {
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
      const latlng = _planToLatLng(g.entree);
      const cm = L.circleMarker(latlng, {
        radius:      9,
        color:       "#00cc44",
        weight:      3,
        fillColor:   couleur,
        fillOpacity: 0.85
      });
      cm.bindTooltip(t("secours.overlay.entree", { equipe: _escHtml(g.nom) }), { permanent: false });
      cm.addTo(_overlayLayer);
      // 🆕 hotfix3 — Badge ✓ si étape entrée effectuée
      _addCheckBadgeIfDone(_getEtapeForWaypoint(s, g.id, "entree"), latlng);
    }
    // 🆕 v1.22.0-fix2 — Intermédiaires : markers ronds plus petits couleur équipe
    // avec border blanc fin, numérotés via tooltip
    if (Array.isArray(g.intermediaires)) {
      g.intermediaires.forEach(function(w, i) {
        if (!w || typeof w.x !== "number" || typeof w.y !== "number") return;
        const latlng = _planToLatLng(w);
        const cm = L.circleMarker(latlng, {
          radius:      7,
          color:       "#fff",
          weight:      2,
          fillColor:   couleur,
          fillOpacity: 0.85
        });
        cm.bindTooltip(t("secours.overlay.etape", { n: (i + 1), equipe: _escHtml(g.nom) }) +
                       (w.label ? " — " + _escHtml(w.label) : ""),
                       { permanent: false });
        cm.addTo(_overlayLayer);
        // 🆕 hotfix3 — Badge ✓ si étape intermédiaire effectuée
        _addCheckBadgeIfDone(_getEtapeForWaypoint(s, g.id, "interm", i), latlng);
      });
    }
    // Sortie — marker square (via divIcon) couleur équipe avec bord rouge
    if (g.sortie && typeof g.sortie.x === "number" && typeof g.sortie.y === "number") {
      const latlng = _planToLatLng(g.sortie);
      // Si entrée === sortie (boucle), marker double bordure (vert + rouge superposés)
      const isBoucle = _samePoint(g.entree, g.sortie);
      const cm = L.circleMarker(latlng, {
        radius:      isBoucle ? 11 : 9,
        color:       isBoucle ? "#ffaa00" : "#cc0000",
        weight:      isBoucle ? 4 : 3,
        fillColor:   couleur,
        fillOpacity: 0.85
      });
      cm.bindTooltip(
        (isBoucle ? t("secours.overlay.boucle", { equipe: _escHtml(g.nom) })
                  : t("secours.overlay.sortie", { equipe: _escHtml(g.nom) })),
        { permanent: false }
      );
      cm.addTo(_overlayLayer);
      // 🆕 hotfix3 — Badge ✓ si étape sortie effectuée
      _addCheckBadgeIfDone(_getEtapeForWaypoint(s, g.id, "sortie"), latlng);
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
      ligne.bindTooltip(t("secours.overlay.itineraire", { equipe: _escHtml(g.nom) }), { permanent: false });
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
  // 🆕 v1.25.0 Phase 3 — RAPPORT AU FIL DES ÉTAPES
  // ============================================================
  //
  // 3 formats : 📄 PDF (jsPDF) + 📦 .mkmsec.report.json + 📋 Texte presse-papier
  // 3 scopes : "operateur" (toutes équipes) | "equipe" (currentEquipeId seul)
  //          | "secouriste" (notes libres uniquement)
  //
  // Disponible à tout moment pendant l'exécution + après l'arrêt du plan
  // (rapport final consultable tant que le scénario existe). Indisponible
  // si le scénario n'a JAMAIS été lancé (pas d'execution).

  const REPORT_FORMAT_VERSION = 1;

  // Génère l'objet structuré commun aux 3 formats. Async car les photos
  // sont résolues en data:base64 si includePhotos=true.
  // Retourne : { type, version, exportedAt, appVersion, scope, plan, scenario,
  //              execution, equipesData: [...], notesLibres: [...] }
  async function genererRapportData(scenarioId, scope, opts) {
    opts = opts || {};
    const s = get(scenarioId);
    if (!s) return null;
    if (!s.execution) return null;  // pas lancé → pas de rapport
    const includePhotos = (opts.includePhotos !== false);   // true par défaut

    // Métadonnées plan source
    const pc = window.PLAN_CONFIG;
    const planInfo = pc && pc.plan ? {
      id:          window._currentLoadedPlanId || null,
      name:        pc.plan.name    || "",
      version:     pc.plan.version || "",
      imageWidth:  pc.plan.imageWidth  || 0,
      imageHeight: pc.plan.imageHeight || 0,
      multiLevel:  !!pc.plan.multiLevel,
      scale:       (window.APP_CONFIG && typeof window.APP_CONFIG.scale === "number")
                   ? window.APP_CONFIG.scale : null
    } : null;

    // Snapshot execution clean (retire les flags internes _previous*)
    const executionClean = {
      active:        !!s.execution.active,
      startedAt:     s.execution.startedAt,
      endedAt:       s.execution.endedAt,
      pausedAt:      s.execution.pausedAt,
      pausedTotalMs: s.execution.pausedTotalMs || 0,
      role:          s.execution.role,
      currentEquipeId: s.execution.currentEquipeId,
      // 4e relecture (R4-2) : la phase du rapport, pour ne pas le verser dans une autre.
      currentPhaseIdx: (typeof s.execution.currentPhaseIdx === "number") ? s.execution.currentPhaseIdx : 0,
      dureeMs:       getExecutionDureeMs(scenarioId)
    };

    // Sélection des équipes selon scope
    let equipesACibler = [];
    if (scope === "operateur") {
      equipesACibler = (s.groupes || []).slice();
    } else if (scope === "equipe") {
      const eqId = s.execution.currentEquipeId;
      const g = (s.groupes || []).find(function(gr) { return gr.id === eqId; });
      if (g) equipesACibler = [g];
    } else if (scope === "secouriste") {
      equipesACibler = [];  // mode notes libres uniquement
    }

    // Construction equipesData : équipe + étapes + photos résolues
    const equipesData = [];
    for (const g of equipesACibler) {
      const etapes = _getEtapesEquipe(s, g.id);
      const equipeClean = {
        id:         g.id,
        nom:        g.nom,
        couleurIdx: g.couleurIdx,
        membres:    (g.membres || []).slice(),
        level:      (typeof g.level === "number") ? g.level : null,
        statut:     g.statut || null,
        observations: g.observations || ""
      };
      // Résolution photos
      let photosResolved = [];
      if (includePhotos) {
        photosResolved = await _resolverPhotosEquipe(scenarioId, g.id);
      } else {
        // Juste les IDs (compact, pas autonome)
        photosResolved = await _listerPhotoIdsEquipe(scenarioId, g.id);
      }
      // 4e relecture (R4-4) : signalements hors parcours (phase en cours + phases closes).
      const horsParcours = [].concat((s.execution._etapesRetirees && s.execution._etapesRetirees[g.id]) || []);
      Object.keys(s.execution.etapesArchive || {}).forEach(function(k) {
        const r = s.execution.etapesArchive[k] && s.execution.etapesArchive[k]._retirees;
        (r && r[g.id] || []).forEach(function(e) {
          if (!horsParcours.some(function(x) { return x.wid && x.wid === e.wid && x.retireeAt === e.retireeAt; })) horsParcours.push(e);
        });
      });
      // 4e relecture (R4-7) : étapes des phases CLOSES (avant, le rapport final
      // n'avait que la phase en cours, mais gardait les photos des phases closes).
      const historique = Object.keys(s.execution.etapesArchive || {}).map(Number).sort(function(a, b) { return a - b; })
        .map(function(k) {
          const arr = s.execution.etapesArchive[String(k)] && s.execution.etapesArchive[String(k)][g.id];
          return Array.isArray(arr) && arr.length > 0
            ? { phaseIdx: k, nom: (s.phases && s.phases[k] && s.phases[k].nom) || String(k + 1), etapes: arr.slice() }
            : null;
        }).filter(Boolean);
      equipesData.push({
        equipe: equipeClean,
        etapes: etapes.slice(),    // shallow copy (étapes déjà clean)
        photos: photosResolved,
        horsParcours: horsParcours,
        historique: historique
      });
    }

    // Notes libres (mode secouriste)
    let notesLibres = [];
    if (scope === "secouriste"
        && s.execution.etapes
        && Array.isArray(s.execution.etapes._notes_libres)) {
      notesLibres = s.execution.etapes._notes_libres.slice();
      // Résolution photos des notes libres (stockées avec equipeId="_notes_libres", stepIdx=-1)
      if (includePhotos && notesLibres.length > 0) {
        try {
          const photosNotes = await _resolverPhotosEquipe(scenarioId, "_notes_libres");
          // Ajouter au rapport sous une clé dédiée pour distinction
          notesLibres = notesLibres.map(function(note) {
            const noteWithPhotos = Object.assign({}, note);
            noteWithPhotos.photosResolved = photosNotes.filter(function(p) {
              return Array.isArray(note.photoIds) && note.photoIds.indexOf(p.id) >= 0;
            });
            return noteWithPhotos;
          });
        } catch(e) {
          console.warn("[SecoursMode] Résolution photos notes libres échec :", e);
        }
      }
    }

    return {
      type:         "myktamap-secours-report",
      version:      REPORT_FORMAT_VERSION,
      exportedAt:   _nowIso(),
      appVersion:   (window.__MKM__ && window.__MKM__.build) || "",
      scope:        scope,
      plan:         planInfo,
      scenario: {
        id:         s.id,
        nom:        s.nom,
        createdAt:  s.createdAt,
        updatedAt:  s.updatedAt,
        context:    s.context || {}
      },
      execution:    executionClean,
      equipesData:  equipesData,
      notesLibres:  notesLibres
    };
  }

  // 🩸 29/09/2026 — Numéro d'étape d'une photo = celui de l'étape qui la DÉTIENT
  // (`photoIds`), à défaut celui stocké en base. Une étape renumérotée par
  // `_resyncEtapesEquipe` garde ses photos sans réécrire IndexedDB.
  // 4e relecture (R4-7) : phase de l'étape qui détient la photo (null = phase en
  // cours ou inconnue) — pour libeller « Phase k · Étape N » dans le PDF.
  function _phasePhoto(scenarioId, equipeId, rec) {
    const s = get(scenarioId);
    const ex = s && s.execution;
    if (!ex) return null;
    const cour = Array.isArray(ex.etapes && ex.etapes[equipeId]) && ex.etapes[equipeId].some(function(x) {
      return Array.isArray(x.photoIds) && x.photoIds.indexOf(rec.id) >= 0;
    });
    if (cour) return null;
    const arch = ex.etapesArchive || {};
    for (const k in arch) {
      const arr = arch[k] && arch[k][equipeId];
      if (Array.isArray(arr) && arr.some(function(x) { return Array.isArray(x.photoIds) && x.photoIds.indexOf(rec.id) >= 0; })) {
        return Number(k);
      }
    }
    return null;
  }

  function _stepIdxPhoto(scenarioId, equipeId, rec) {
    const s = get(scenarioId);
    const etapes = s && s.execution && s.execution.etapes && s.execution.etapes[equipeId];
    if (Array.isArray(etapes)) {
      const e = etapes.find(function(x) { return Array.isArray(x.photoIds) && x.photoIds.indexOf(rec.id) >= 0; });
      if (e) return e.idx;
    }
    // 3e relecture (R3-3) : une étape d'une phase CLOSE détient aussi ses photos
    // (l'équipe reconduite en phase 2 repart d'étapes vierges).
    const phases = (s && s.execution && s.execution.etapesArchive) || {};
    for (const k in phases) {
      const arrPh = phases[k] && phases[k][equipeId];
      const e = Array.isArray(arrPh) && arrPh.find(function(x) {
        return Array.isArray(x.photoIds) && x.photoIds.indexOf(rec.id) >= 0;
      });
      if (e) return e.idx;
    }
    // Photo d'une étape retirée (confirmée par l'utilisateur) : hors rapport.
    const arch = s && s.execution && s.execution._etapesRetirees && s.execution._etapesRetirees[equipeId];
    if (rec.stepIdx === -2 || (Array.isArray(arch) && arch.some(function(x) {
      return Array.isArray(x.photoIds) && x.photoIds.indexOf(rec.id) >= 0;
    }))) return null;
    // 2e relecture (N9, N10b) : une photo qu'AUCUNE étape ne détient vient d'une
    // exécution précédente (scénario supprimé puis réimporté, exécution relancée —
    // mêmes ids) → hors rapport. Les notes libres (-1) ne sont pas des étapes.
    if (Array.isArray(etapes) && rec.stepIdx !== -1) return null;
    return rec.stepIdx;
  }

  // Helper interne — résout toutes les photos d'une équipe en data:base64.
  // Retourne [{id, mime, sizeBytes, dataUrl, stepIdx}, ...].
  async function _resolverPhotosEquipe(scenarioId, equipeId) {
    if (!window.MyKTAMapSecoursPhotos
        || !window.MyKTAMapSecoursPhotos.isAvailable()) return [];
    try {
      const records = await window.MyKTAMapSecoursPhotos.getPhotosForEquipe(scenarioId, equipeId);
      if (!Array.isArray(records) || records.length === 0) return [];
      // Convertir chaque blob en data URL (séquentiel pour économiser RAM mobile)
      const out = [];
      for (const rec of records) {
        if (_stepIdxPhoto(scenarioId, equipeId, rec) === null) continue;   // étape retirée
        try {
          const dataUrl = await _blobToDataUrl(rec.blob);
          out.push({
            id:        rec.id,
            mime:      rec.mime,
            sizeBytes: rec.size,
            stepIdx:   _stepIdxPhoto(scenarioId, equipeId, rec),
            phaseIdx:  _phasePhoto(scenarioId, equipeId, rec),
            dataUrl:   dataUrl
          });
        } catch(e) {
          console.warn("[SecoursMode] _resolverPhotosEquipe : skip photo " + rec.id, e);
        }
      }
      return out;
    } catch(e) {
      console.warn("[SecoursMode] _resolverPhotosEquipe échec :", e);
      return [];
    }
  }

  // Helper interne — liste juste les IDs des photos d'une équipe (compact).
  async function _listerPhotoIdsEquipe(scenarioId, equipeId) {
    if (!window.MyKTAMapSecoursPhotos
        || !window.MyKTAMapSecoursPhotos.isAvailable()) return [];
    try {
      const records = await window.MyKTAMapSecoursPhotos.getPhotosForEquipe(scenarioId, equipeId);
      if (!Array.isArray(records)) return [];
      return records.filter(function(rec) {
        return _stepIdxPhoto(scenarioId, equipeId, rec) !== null;   // étape retirée
      }).map(function(rec) {
        return {
          id:        rec.id,
          mime:      rec.mime,
          sizeBytes: rec.size,
          stepIdx:   _stepIdxPhoto(scenarioId, equipeId, rec),
          phaseIdx:  _phasePhoto(scenarioId, equipeId, rec)
          // pas de dataUrl → non autonome (référence seule)
        };
      });
    } catch(e) {
      return [];
    }
  }

  // Helper interne — convertit un Blob en data URL (base64) via FileReader.
  function _blobToDataUrl(blob) {
    return new Promise(function(resolve, reject) {
      if (!blob || !(blob instanceof Blob)) {
        reject(new Error("blob invalide"));
        return;
      }
      const reader = new FileReader();
      reader.onload  = function() { resolve(reader.result); };
      reader.onerror = function() { reject(new Error("FileReader error")); };
      reader.readAsDataURL(blob);
    });
  }

  // Helper interne — format texte plain markdown-like d'un rapport.
  // Utilisé pour le bouton "📋 Copier texte" + comme base du PDF.
  function genererRapportTexte(reportData) {
    if (!reportData) return "";
    const r = reportData;
    const sep = "─".repeat(60);
    let out = "";

    // ─── Header ───
    out += t("secours.txt.header", { version: (r.appVersion || "") }) + "\n";
    out += sep + "\n";
    out += t("secours.txt.scenario", { nom: (r.scenario.nom || t("secours.import.sansNom")) }) + "\n";
    out += t("secours.txt.plan", { plan: (r.plan ? r.plan.name : "(?)") }) + "\n";
    out += t("secours.txt.role", { role: _formatRoleLabel(r.scope) }) + "\n";
    out += t("secours.txt.exporte", { date: new Date(r.exportedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }) + "\n";
    out += t("secours.txt.lance", { date: (r.execution.startedAt
                            ? new Date(r.execution.startedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR")
                            : "(?)") }) + "\n";
    if (r.execution.endedAt) {
      out += t("secours.txt.termine", { date: new Date(r.execution.endedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }) + "\n";
    } else if (r.execution.active) {
      out += t("secours.txt.statutEnCours", { duree: _formatDureeMs(r.execution.dureeMs) }) + "\n";
    }

    if (r.scenario.context && r.scenario.context.incidentAt) {
      out += t("secours.txt.incident", { date: new Date(r.scenario.context.incidentAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }) + "\n";
    }
    if (r.scenario.context && r.scenario.context.notes) {
      out += t("secours.txt.notes", { notes: r.scenario.context.notes }) + "\n";
    }
    _victimesDuRapport(r).forEach(function(v) {   // A3
      out += "🚨 " + t("secours.victime.ligneRapport", { equipe: v.nom, etape: v.label, pos: _lblPos(v.pos), heure: _heureCourte(v.at) }) + "\n";
    });
    out += sep + "\n\n";

    // ─── Équipes (mode opérateur OU équipe) ───
    if (Array.isArray(r.equipesData) && r.equipesData.length > 0) {
      r.equipesData.forEach(function(ed, idx) {
        const g = ed.equipe;
        const couleur = PALETTE[g.couleurIdx % PALETTE.length] || PALETTE[0];
        out += t("secours.txt.equipeHeader", { n: (idx + 1), total: r.equipesData.length, nom: g.nom, couleur: couleur.nom }) + "\n";
        out += sep + "\n";
        if (g.membres && g.membres.length > 0) {
          out += t("secours.txt.membres", { membres: g.membres.join(", ") }) + "\n";
        }
        if (typeof g.level === "number") {
          out += t("secours.txt.niveau", { niveau: _formatLevelShort(g.level) }) + "\n";
        }
        // Étapes
        if (Array.isArray(ed.etapes) && ed.etapes.length > 0) {
          out += "\n" + t("secours.txt.etapesTitre") + "\n";
          ed.etapes.forEach(function(et, i) {
            const info = _getStatutInfo(et.statut);
            const typeLabel = (et.type === "entree") ? t("secours.txt.typeEntree")
                            : (et.type === "sortie") ? t("secours.txt.typeSortie")
                            : t("secours.txt.typeEtape", { idx: i });
            const ts = et.completedAt ? new Date(et.completedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR")
                     : et.startedAt   ? t("secours.txt.tsEnCours", { date: new Date(et.startedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") })
                     : "—";
            out += "  " + (i + 1) + ". " + typeLabel + " — " + (_lblEtape(et.label) || "(?)") + "\n";
            out += "     " + info.emoji + " " + _statutLabel(et.statut) + " · ⏱️ " + ts + "\n";
            if (et.observations && et.observations.trim()) {
              out += "     " + t("secours.txt.obs", { obs: et.observations.trim() }) + "\n";
            }
            if (Array.isArray(et.photoIds) && et.photoIds.length > 0) {
              out += "     " + t("secours.txt.photosAttachees", { n: et.photoIds.length }) + "\n";
            }
          });
        } else {
          out += t("secours.txt.aucuneEtape") + "\n";
        }
        out += "\n";
      });
    }

    // ─── Notes libres (mode secouriste) ───
    if (Array.isArray(r.notesLibres) && r.notesLibres.length > 0) {
      out += t("secours.txt.notesLibresTitre", { n: r.notesLibres.length }) + "\n";
      out += sep + "\n";
      const sorted = r.notesLibres.slice().sort(function(a, b) {
        return Date.parse(a.ts) - Date.parse(b.ts);   // chronologique ASC dans le rapport
      });
      sorted.forEach(function(note, i) {
        const info = _getStatutInfo(note.statut);
        const ts = new Date(note.ts).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR");
        out += "  " + (i + 1) + ". " + info.emoji + " " + _statutLabel(note.statut) + " · ⏱️ " + ts + "\n";
        if (note.texte) {
          out += "     " + t("secours.txt.obs", { obs: note.texte }) + "\n";
        }
        if (Array.isArray(note.photoIds) && note.photoIds.length > 0) {
          out += "     " + t("secours.txt.photos", { n: note.photoIds.length }) + "\n";
        }
      });
      out += "\n";
    } else if (r.scope === "secouriste") {
      out += t("secours.txt.aucuneNote") + "\n\n";
    }

    out += sep + "\n";
    out += t("secours.txt.genereePar", { version: (r.appVersion || "") }) + "\n";
    out += "© 2026 Flavien VIDAL · CC BY-NC-SA 4.0\n";
    return out;
  }

  // Helper interne — label lisible du rôle.
  function _formatRoleLabel(scope) {
    if (scope === "operateur")  return t("secours.roleLabel.operateur");
    if (scope === "equipe")     return t("secours.roleLabel.equipe");
    if (scope === "secouriste") return t("secours.roleLabel.secouriste");
    return "(?)";
  }

  // R4-16 : un rapport (JSON ou PDF) est sorti de l'appareil → l'intervention
  // terminée perd sa protection FIFO. Rien à marquer si elle est encore en cours.
  function _marquerRapportExporte(r) {
    const s = r && r.scenario ? get(r.scenario.id) : null;
    if (!s || !s.execution || !s.execution.endedAt) return;
    s.execution.rapportExporteAt = _nowIso();
    _saveScenarios();
  }

  // Génère le fichier JSON .mkmsec.report.json + télécharge.
  // Si includePhotos était true dans genererRapportData, les photos sont
  // incluses en base64 dans le JSON → autonome mais volumineux.
  // Retourne le filename généré OU null si échec.
  function exporterRapportJSON(reportData) {
    if (!reportData) return null;
    try {
      const txt = JSON.stringify(reportData, null, 2);
      const blob = new Blob([txt], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const slug = _slug(reportData.scenario.nom || "rapport");
      const filename = "Rapport_" + slug + "_" + reportData.scope + "_" + _shortDate() + ".mkmsec.report.json";
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      _marquerRapportExporte(reportData);
      return filename;
    } catch(e) {
      console.warn("[SecoursMode] exporterRapportJSON échec :", e);
      return null;
    }
  }

  // Copie le rapport texte au presse-papier. Async (navigator.clipboard).
  // Fallback execCommand pour browsers non-HTTPS / vieux contexte.
  // Retourne Promise<boolean>.
  function copierRapportTexte(reportData) {
    const text = genererRapportTexte(reportData);
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text)
        .then(function() { return true; })
        .catch(function(e) {
          console.warn("[SecoursMode] clipboard.writeText échec, fallback execCommand :", e);
          return _copyFallback(text);
        });
    }
    return Promise.resolve(_copyFallback(text));
  }
  // Fallback : textarea hors écran + execCommand("copy")
  function _copyFallback(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch(e) {
      console.warn("[SecoursMode] _copyFallback échec :", e);
      return false;
    }
  }

  // 🆕 v1.40.33 (Synergie A v1) ─────────────────────────────────
  // Ouverture de la Vue OSM depuis le Mode Secours (bouton "🌍 Vue OSM"
  // dans les bandeaux PLAN ACTIF et PLAN TERMINÉ). Réutilise complètement
  // window.OsmView (osmView.js) : gating natif (opt-in, strict offline,
  // incognito, navigateur online), modale plein écran, POI/roads/zones du
  // plan automatiquement projetés sur OpenStreetMap.
  //
  // En cas d'indisponibilité : toast diagnostique précis pour guider l'user
  // vers la résolution (calibration GPS manquante, opt-in désactivé,
  // mode bloqué).
  //
  // Évolutions futures envisagées (B → E, step-by-step) : page Vue OSM dans
  // le rapport PDF, export "🚒 Briefing pompiers" dédié, POI "🚪 Point
  // d'entrée du plan" spécial, position GPS surface des équipes.
  function _ouvrirVueOsmDepuisSecours() {
    if (!window.OsmView || typeof window.OsmView.open !== "function") {
      _toast(t("secours.osm.nonDisponible"), "warn");
      return;
    }
    // Pré-diagnostic explicite pour message clair à l'user.
    // window.OsmView.isAvailable() existe mais retourne juste true/false :
    // on inspecte les raisons individuelles pour un toast diagnostic.
    const reasons = [];
    try {
      // Plan georef requis (=  PLAN_CONFIG.plan.georef ou session LS dérivée)
      const planCfg  = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
      const hasInline = !!(planCfg && planCfg.georef
        && planCfg.georef.pointA && planCfg.georef.pointB);
      // Côté session : OsmView lit aussi le LS — déléguons via OsmView.isAvailable
      // pour ne pas dupliquer la logique. Mais si NI inline NI sessions valides,
      // on tag la raison explicitement.
      if (!hasInline && (!window.OsmView.isAvailable || !window.OsmView.isAvailable())) {
        // On laisse OsmView.isAvailable trancher pour les autres cas (opt-in,
        // strict, incognito, online). Ce branch couvre juste "pas georef du tout".
        reasons.push(t("secours.osm.raisonGeoref"));
      }
      if (window.OsmView.isOptedIn && typeof window.OsmView.isOptedIn === "function"
          && !window.OsmView.isOptedIn()) {
        reasons.push(t("secours.osm.raisonOptin"));
      }
      if (window.NetworkAudit
          && typeof window.NetworkAudit.isStrictOfflineEnabled === "function"
          && window.NetworkAudit.isStrictOfflineEnabled()) {
        reasons.push(t("secours.osm.raisonStrict"));
      }
      if (window.IncognitoMode
          && window.IncognitoMode.isActive
          && window.IncognitoMode.isActive()) {
        reasons.push(t("secours.osm.raisonIncognito"));
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        reasons.push(t("secours.osm.raisonOffline"));
      }
    } catch(e) { /* fallback : on tente quand même l'ouverture ci-dessous */ }

    if (reasons.length > 0) {
      _toast(t("secours.osm.indisponible", { raisons: reasons.join(" · ") }), "warn");
      return;
    }
    // Tout OK → ouverture standard. OsmView gère sa propre stack modale.
    try {
      window.OsmView.open();
    } catch(e) {
      console.warn("[secoursMode] Ouverture Vue OSM échouée :", e);
      _toast(t("secours.osm.erreurOuverture"), "error");
    }
  }

  // ─── Modale UI rapport ──────────────────────────────────────
  // Ouvre la modale "Rapport au fil des étapes" avec aperçu compact + 3
  // formats au choix. Scope passé par l'appelant (vue Live ou bandeau Edit).
  function _afficherModaleRapport(scenarioId, scope) {
    const s = get(scenarioId);
    if (!s) return;
    if (!s.execution) {
      _toast(t("secours.toast.aucunPlanLance"), "warn");
      return;
    }
    // Cleanup éventuelle modale précédente
    const existing = document.getElementById("kta-secours-rapport-modale");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    // Calcul aperçu compact selon scope
    const exec = s.execution;
    const dureeStr = _formatDureeMs(getExecutionDureeMs(scenarioId));
    let apercuTitre, apercuLines;
    if (scope === "operateur") {
      const nbEquipes = (s.groupes || []).length;
      let nbDone = 0, nbTotal = 0;
      (s.groupes || []).forEach(function(g) {
        const etapes = _getEtapesEquipe(s, g.id);
        nbTotal += etapes.length;
        etapes.forEach(function(et) { if (et.completedAt) nbDone++; });
      });
      const pct = nbTotal > 0 ? Math.round((nbDone / nbTotal) * 100) : 0;
      apercuTitre = t("secours.rapport.titreOperateur");
      apercuLines = [
        t("secours.rapport.apercuEquipes", { n: nbEquipes }),
        t("secours.rapport.apercuEtapesPct", { done: nbDone, total: nbTotal, pct: pct }),
        t("secours.rapport.apercuDuree", { duree: dureeStr })
      ];
    } else if (scope === "equipe") {
      const g = (s.groupes || []).find(function(gr) { return gr.id === exec.currentEquipeId; });
      const eqNom = g ? g.nom : t("secours.rapport.equipeInconnue");
      const etapes = g ? _getEtapesEquipe(s, g.id) : [];
      const nbDone = etapes.filter(function(et) { return !!et.completedAt; }).length;
      apercuTitre = t("secours.rapport.titreEquipier", { equipe: _escHtml(eqNom) });
      apercuLines = [
        t("secours.rapport.apercuEtapes", { done: nbDone, total: etapes.length }),
        t("secours.rapport.apercuDuree", { duree: dureeStr })
      ];
    } else if (scope === "secouriste") {
      const notes = (exec.etapes && exec.etapes._notes_libres) || [];
      apercuTitre = t("secours.rapport.titreSecouriste");
      apercuLines = [
        t("secours.rapport.apercuNotes", { n: notes.length }),
        t("secours.rapport.apercuDuree", { duree: dureeStr })
      ];
    } else {
      apercuTitre = t("secours.rapport.titreDefault");
      apercuLines = [t("secours.rapport.apercuDuree", { duree: dureeStr })];
    }

    // Détection présence photos pour info checkbox
    let totalPhotosInfo = null;
    if (window.MyKTAMapSecoursPhotos && window.MyKTAMapSecoursPhotos.isAvailable()) {
      window.MyKTAMapSecoursPhotos.countPhotosForScenario(scenarioId).then(function(n) {
        const hint = document.getElementById("kta-rapport-photos-hint");
        if (hint) {
          hint.textContent = n > 0
            ? t("secours.rapport.photosInclut", { n: n })
            : t("secours.rapport.photosAucune");
        }
      }).catch(function() {});
    }

    const overlay = document.createElement("div");
    overlay.id = "kta-secours-rapport-modale";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100014";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-rapport-boite" style="max-width:540px; height:auto; max-height:90vh; border-left:6px solid #8cb4ff;">' +
        '<div class="kta-readme-modal-header">' +
          '<h2 class="kta-tx-info" style="margin:0; color:#8cb4ff;">📤 ' + _escHtml(apercuTitre) + '</h2>' +
          '<button class="kta-readme-modal-close" data-action="cancel-rapport" aria-label="' + _escAttr(t("secours.btn.fermerAria")) + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +

          '<div class="kta-secours-rapport-apercu">' +
            '<div class="kta-secours-rapport-apercu-titre">' + t("secours.rapport.apercuTitre") + '</div>' +
            '<ul class="kta-secours-rapport-apercu-lines">' +
              apercuLines.map(function(l) { return '<li>' + _escHtml(l) + '</li>'; }).join('') +
            '</ul>' +
          '</div>' +

          '<label class="kta-secours-rapport-checkbox">' +
            '<input type="checkbox" id="kta-rapport-include-photos" checked>' +
            ' <span><strong>' + t("secours.rapport.inclurePhotos") + '</strong></span>' +
            '<div id="kta-rapport-photos-hint" class="kta-secours-rapport-photos-hint">' + t("secours.rapport.comptagePhotos") + '</div>' +
          '</label>' +

          // 🐛 hotfix5 (KARMA "dans Rapport Equipier, le .mkmsec.report.json
          // le titre va sur la description") : structure HTML revue —
          // wrapper label + sub dans un div column pour empiler verticalement.
          // Avant : button flex row avec icon + label + sub côte à côte →
          // label long (".mkmsec.report.json") + sub long se chevauchaient
          // ou wrappaient mal. Fix : icon (flex-shrink:0) + div column
          // (flex:1 min-width:0) contenant label puis sub.
          '<div class="kta-secours-rapport-formats">' +
            '<button class="kta-btn kta-btn-primary kta-secours-rapport-fmt-btn" data-action="rapport-export-pdf">' +
              '<span class="kta-secours-rapport-fmt-icon">📄</span>' +
              '<span class="kta-secours-rapport-fmt-content">' +
                '<span class="kta-secours-rapport-fmt-label">' + t("secours.rapport.fmtPdfLabel") + '</span>' +
                '<span class="kta-secours-rapport-fmt-sub">' + t("secours.rapport.fmtPdfSub") + '</span>' +
              '</span>' +
            '</button>' +
            '<button class="kta-btn kta-btn-secondary kta-secours-rapport-fmt-btn" data-action="rapport-export-json">' +
              '<span class="kta-secours-rapport-fmt-icon">📦</span>' +
              '<span class="kta-secours-rapport-fmt-content">' +
                '<span class="kta-secours-rapport-fmt-label">.mkmsec.report.json</span>' +
                '<span class="kta-secours-rapport-fmt-sub">' + t("secours.rapport.fmtJsonSub") + '</span>' +
              '</span>' +
            '</button>' +
            '<button class="kta-btn kta-btn-secondary kta-secours-rapport-fmt-btn" data-action="rapport-copy-text">' +
              '<span class="kta-secours-rapport-fmt-icon">📋</span>' +
              '<span class="kta-secours-rapport-fmt-content">' +
                '<span class="kta-secours-rapport-fmt-label">' + t("secours.rapport.fmtTextLabel") + '</span>' +
                '<span class="kta-secours-rapport-fmt-sub">' + t("secours.rapport.fmtTextSub") + '</span>' +
              '</span>' +
            '</button>' +
            /* ⛔ Phase 4 (QR Share) ROLLBACK hotfix17 — bouton rapport-share-qr retiré.
               Le partage briefing depuis Live se fera via "💾 Exporter mes obs"
               (hotfix18) au format .mkmsec.observations.json. */
          '</div>' +

          '<p style="margin-top:14px; color:#8892a4; font-size:12px; font-style:italic;">' +
            t("secours.rapport.footerHint") +
          '</p>' +

          '<div style="margin-top:14px; display:flex; justify-content:flex-end;">' +
            '<button class="kta-btn kta-btn-ghost" data-action="cancel-rapport">' + t("secours.btn.fermer") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    function _close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener("keydown", _onKey);
    }
    function _onKey(e) { if (e.key === "Escape") _close(); }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    overlay.querySelectorAll('[data-action="cancel-rapport"]').forEach(function(btn) {
      btn.addEventListener("click", _close);
    });

    // Handler factorisé : génère data + appelle la fonction de format demandée
    function _handleExport(formatType) {
      // 🆕 v1.43.27 (Pattern D) — Disable les 3 boutons d'export pendant la
      // génération (genererRapportData = async lourd + chaque format est lui
      // aussi async pour pdf/text). Sans ça, l'user qui double-clique ou clique
      // un AUTRE format pendant la génération relance N exports concurrents.
      const exportBtns = overlay.querySelectorAll('[data-action^="rapport-export"], [data-action="rapport-copy-text"]');
      exportBtns.forEach(function(b) { b.disabled = true; });
      function _restoreBtns() {
        exportBtns.forEach(function(b) { b.disabled = false; });
      }
      const cb = document.getElementById("kta-rapport-include-photos");
      const includePhotos = !!(cb && cb.checked);
      _toast(t("secours.toast.generationRapport"), "info");
      genererRapportData(scenarioId, scope, { includePhotos: includePhotos }).then(function(data) {
        if (!data) {
          _toast(t("secours.toast.aucuneDonnee"), "error");
          _restoreBtns();
          return;
        }
        if (formatType === "pdf") {
          // 🆕 v1.26.0 Phase 4 C5 — genererRapportPDF est désormais async
          // (await sur la mini-carte par équipe). Gère la Promise.
          genererRapportPDF(data).then(function(fn) {
            if (fn) _toast(t("secours.toast.pdfGenere", { filename: fn }), "info");
          }).catch(function(err) {
            console.warn("[SecoursMode] genererRapportPDF échec :", err);
            _toast(t("secours.toast.erreurPdf", { message: (err && err.message) }), "error");
          });
        } else if (formatType === "json") {
          const fn = exporterRapportJSON(data);
          if (fn) _toast(t("secours.toast.jsonExporte", { filename: fn }), "info");
        } else if (formatType === "text") {
          copierRapportTexte(data).then(function(ok) {
            _toast(ok ? t("secours.toast.rapportCopie") : t("secours.toast.copieEchouee"), ok ? "info" : "error");
          });
        }
        _close();
        // Pas besoin de _restoreBtns() : _close() retire l'overlay (et les btns).
      }).catch(function(e) {
        console.warn("[SecoursMode] genererRapportData échec :", e);
        _toast(t("secours.toast.erreurGenerationRapport", { message: (e && e.message ? e.message : "") }), "error");
        _restoreBtns();
      });
    }

    overlay.querySelectorAll('[data-action="rapport-export-pdf"]').forEach(function(btn) {
      btn.addEventListener("click", function() { _handleExport("pdf"); });
    });
    overlay.querySelectorAll('[data-action="rapport-export-json"]').forEach(function(btn) {
      btn.addEventListener("click", function() { _handleExport("json"); });
    });
    overlay.querySelectorAll('[data-action="rapport-copy-text"]').forEach(function(btn) {
      btn.addEventListener("click", function() { _handleExport("text"); });
    });
    /* ⛔ Phase 4 (QR Share) ROLLBACK hotfix17 — handler rapport-share-qr retiré. */

    document.addEventListener("keydown", _onKey);
    document.body.appendChild(overlay);
  }

  // Génère le PDF rapport via jsPDF. Sync (pas async — toutes les data
  // sont déjà résolues par genererRapportData). Retourne le filename
  // généré OU null si échec.
  //
  // Layout :
  //   • Page 1 : briefing (en-tête + scénario + plan + role + dureeMs + dates)
  //   • Pour chaque équipe (modes opérateur/équipier) :
  //       - 1 page texte : étapes avec statuts/obs/ts
  //       - 1 page photos si applicable (grille jpeg compressées)
  //   • Pour mode secouriste : 1 page liste chronologique des notes libres
  //                            + 1 page photos si applicable
  //
  // ⚠️ Pas d'emoji dans pdf.text() (jsPDF Helvetica latin1 → mojibake).
  // Les emojis sont gardés UNIQUEMENT pour les chaînes texte canvas/Blob.
  // 🆕 v1.26.0 Phase 4 C5 — Devenu ASYNC pour permettre l'await sur
  // _drawRapportPDFEquipeMiniaturePage qui appelle l'helper exporter
  // (génération canvas du plan, async via Image() onload + toDataURL).
  // Caller `_handleExport` adapté pour gérer la Promise.
  async function genererRapportPDF(reportData) {
    if (!reportData) return null;
    if (!window.jspdf || !window.jspdf.jsPDF) {
      _toast(t("secours.toast.pdfIndisponible"), "error");
      return null;
    }
    try {
      const pdf = new window.jspdf.jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const r = reportData;

      // ─── PAGE 1 : Briefing global ───
      _drawRapportPDFHeader(pdf, r, pageW, margin);
      let y = margin + 30;

      pdf.setFontSize(11); pdf.setFont(undefined, "bold");
      pdf.text(t("secours.pdf.contexte"), margin, y); y += 6;
      pdf.setFontSize(9); pdf.setFont(undefined, "normal");
      pdf.text(t("secours.pdf.scenario", { nom: (r.scenario.nom || t("secours.pdf.sansNom")) }), margin, y); y += 4;
      pdf.text(t("secours.pdf.plan", { plan: (r.plan ? r.plan.name : "(?)") }), margin, y); y += 4;
      pdf.text(t("secours.pdf.role", { role: _formatRoleLabelAscii(r.scope) }), margin, y); y += 4;
      if (r.execution.startedAt) {
        pdf.text(t("secours.pdf.lance", { date: new Date(r.execution.startedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }), margin, y); y += 4;
      }
      if (r.execution.endedAt) {
        pdf.text(t("secours.pdf.termine", { date: new Date(r.execution.endedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }), margin, y); y += 4;
      } else if (r.execution.active) {
        pdf.text(t("secours.pdf.statutEnCours", { duree: _formatDureeMs(r.execution.dureeMs) }), margin, y); y += 4;
      }
      if (r.scenario.context && r.scenario.context.incidentAt) {
        pdf.text(t("secours.pdf.incident", { date: new Date(r.scenario.context.incidentAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }), margin, y); y += 4;
      }
      if (r.scenario.context && r.scenario.context.notes) {
        y += 2;
        pdf.setFont(undefined, "bold"); pdf.text(t("secours.pdf.notesTitre"), margin, y); y += 5;
        pdf.setFont(undefined, "normal");
        y = _pdfWrapText(pdf, r.scenario.context.notes, margin, y, pageW - 2 * margin, 4);
      }
      const victimesPdf = _victimesDuRapport(r);   // A3
      if (victimesPdf.length) {
        y += 3;
        pdf.setTextColor(180, 20, 20);
        pdf.setFont(undefined, "bold"); pdf.text(_stripPourPdf(t("secours.victime.titrePdf", { n: victimesPdf.length })), margin, y); y += 5;
        pdf.setFont(undefined, "normal");
        victimesPdf.forEach(function(v) {
          y = _pdfWrapText(pdf, _stripPourPdf("- " + t("secours.victime.ligneRapport",
            { equipe: v.nom, etape: v.label, pos: _lblPos(v.pos), heure: _heureCourte(v.at) })), margin, y, pageW - 2 * margin, 4);
        });
        pdf.setTextColor(0);
      }

      _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);

      // 🆕 v1.41.0 B — Page "Briefing surface" (Vue OSM + équipes GPS + POI
      // critiques). Utile pour debrief post-mission et briefing secours externes
      // après mission. Insérée juste après le briefing global, avant les
      // pages équipes. Fonction utilitaire partagée avec genererBriefingPompiersPDF.
      // 🆕 v1.42.5 — async (capture OSM via html2canvas)
      // 🆕 v1.42.13 — passe overlayContext="rapport" pour textes adaptés
      try {
        pdf.addPage();
        // Relecture PDF (29/09) : r.scenario n'est qu'un en-tête (sans équipes) → la page
        // annonçait « aucune équipe définie ». Le PDF se génère là où vit le scénario.
        await _drawBriefingSurfacePage(pdf, (r.scenario && get(r.scenario.id)) || r.scenario, r.plan,
                                       pageW, pageH, margin, null, "rapport");
        _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
      } catch (e) {
        console.warn("[Rapport] Page Briefing surface échouée : " + (e && e.message));
      }

      // ─── Pages équipes ou notes libres ───
      if (Array.isArray(r.equipesData) && r.equipesData.length > 0) {
        // 🆕 v1.26.0 Phase 4 C5 — Boucle async pour permettre l'await
        // sur la mini-carte par équipe (génération canvas exporter).
        // Relecture 29/09 (R12) : le fond du plan (16 Mpx) est rendu UNE fois
        // pour tout le rapport, pas une fois par équipe.
        const cacheFond = { canvas: null };
        for (let i = 0; i < r.equipesData.length; i++) {
          const ed = r.equipesData[i];
          // 1. Page texte étapes (synchrone, inchangé)
          pdf.addPage();
          _drawRapportPDFEquipeTextePage(pdf, ed, r, pageW, pageH, margin);
          // 2. 🆕 Mini-carte page paysage A4 (uniquement si l'équipe a des
          //    waypoints/zone/iti à afficher). Async = peut échouer
          //    silencieusement et passer à la suite (PDF reste valide).
          try {
            await _drawRapportPDFEquipeMiniaturePage(pdf, ed, r, cacheFond);
          } catch (e) {
            console.warn("[Rapport] Mini-carte équipe " + (ed.equipe && ed.equipe.nom) + " échouée : " + (e && e.message));
          }
          // 3. Page photos si applicable (synchrone, inchangé)
          if (Array.isArray(ed.photos) && ed.photos.length > 0 && ed.photos[0].dataUrl) {
            pdf.addPage();
            _drawRapportPDFEquipePhotosPage(pdf, ed, r, pageW, pageH, margin);
          }
        }
      }
      if (r.scope === "secouriste" && Array.isArray(r.notesLibres) && r.notesLibres.length > 0) {
        pdf.addPage();
        _drawRapportPDFNotesLibresPage(pdf, r, pageW, pageH, margin);
      }

      const slug = _slug(r.scenario.nom || "rapport");
      const filename = "Rapport_" + slug + "_" + r.scope + "_" + _shortDate() + ".pdf";
      pdf.save(filename);
      _marquerRapportExporte(r);
      return filename;
    } catch(e) {
      console.warn("[SecoursMode] genererRapportPDF échec :", e);
      _toast(t("secours.toast.erreurGenerationPdf", { message: e.message }), "error");
      return null;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 🆕 v1.42.5 — CAPTURE OSM POUR PDF BRIEFING POMPIERS
  // ════════════════════════════════════════════════════════════════════════
  //
  // Render Leaflet offscreen + html2canvas → dataURL JPEG q85 pour injection
  // dans le PDF Briefing. Marche TOUJOURS (n'a pas besoin que la Vue OSM
  // modale soit ouverte).
  //
  // Stratégie :
  //   1. Container hidden 1200×800 + Leaflet map dedans
  //   2. Tile layer OSM avec crossOrigin (CORS OK sur tile.openstreetmap.org)
  //   3. Rectangle bbox plan (jaune charte) + label centre
  //   4. Markers GPS surface équipes (couleur palette OTAN)
  //   5. Wait tiles load (event "load" ou safety 7s)
  //   6. html2canvas capture → dataURL JPEG
  //   7. Cleanup map + container
  //
  // Fail-safe : retourne null si lib html2canvas pas chargée OU pas de
  // georef OU exception. Le caller (_drawBriefingSurfacePage) fallback
  // automatiquement sur l'affichage texte/lien (= comportement v1.41.x).
  //
  // ⚠️ Pas de plan rotated superposé dans la capture (complexe, nécessite
  // accès à l'image source du plan). MVP : juste tuiles OSM + bbox visible.
  // 🆕 v1.42.14 — Helper : détecte si le thème clair est actif (cf themeManager.js).
  // Utilisé par les modales/overlays récents pour adapter leurs styles inline.
  function _isLightTheme() {
    try {
      return document.body.classList.contains("kta-theme-light") ||
             document.documentElement.classList.contains("kta-theme-light");
    } catch(e) { return false; }
  }

  // 🆕 v1.42.12 — Helper : récupère les dimensions natives d'une dataURL
  // image (chargée dans une Image temporaire). Retourne {w, h} ou null.
  // Utilisé pour préserver le ratio image dans pdf.addImage.
  function _getImageDataUrlDims(dataUrl) {
    return new Promise(function(resolve) {
      if (!dataUrl) { resolve(null); return; }
      const img = new Image();
      img.onload = function() {
        resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      };
      img.onerror = function() { resolve(null); };
      img.src = dataUrl;
    });
  }

  // 🆕 v1.42.11 — Helper : applique les options de couches Vue OSM sur les
  // checkboxes du bandeau (simulate clic si l'état checked diffère de l'option).
  // Idempotent : ne re-clique que si nécessaire.
  function _applyOsmLayerOptions(opts) {
    if (!opts) return;
    const map = {
      "kta-osm-plan-toggle":    opts.showPlan,
      "kta-osm-poi-toggle":     opts.showPoi,
      "kta-osm-tracker-toggle": opts.showTracker,
      "kta-osm-road-toggle":    opts.showRoad,
      "kta-osm-iti-toggle":     opts.showIti,
      "kta-osm-zone-toggle":    opts.showZone,
      "kta-osm-struct-toggle":  opts.showStruct,
      "kta-osm-secours-toggle": opts.showSecours
    };
    for (const id in map) {
      const want = map[id];
      if (typeof want !== "boolean") continue;  // skip si option non définie
      const cb = document.getElementById(id);
      if (!cb) continue;  // toggle absent (cas Secours sans scénario actif)
      if (cb.checked !== want) {
        cb.click();  // déclenche le change listener qui applique le toggle
      }
    }
  }

  async function _captureOsmCanvasForBriefing(scenario, plan, options, overlayContext) {
    if (typeof window.html2canvas !== "function") {
      console.warn("[Briefing] html2canvas non chargé — capture skip (fallback liens)");
      return null;
    }
    if (typeof window.L === "undefined") return null;

    // 🆕 v1.42.13 — Textes overlay paramétrables selon le contexte d'appel :
    //   - "briefing" (default) : appel depuis bouton 🚒 Briefing pompiers
    //   - "rapport"            : appel depuis bouton 📤 Rapport global
    const _ctx = (overlayContext === "rapport")
      ? { icon: "📤", title: t("secours.capture.rapportTitle"),
          sub: t("secours.capture.rapportSub") }
      : { icon: "🚒", title: t("secours.capture.briefingTitle"),
          sub: t("secours.capture.briefingSub") };

    // 🆕 v1.42.10 — Approche "open/close masqué" : ouvre Vue OSM sous un
    // overlay opaque, capture le DOM Leaflet complet (plan rotated + data
    // layers + zones + tracés + équipes), puis ferme. L'user ne voit JAMAIS
    // la Vue OSM clignoter — juste l'overlay "Génération en cours…".
    // Réutilise 100% du code Vue OSM existant (pas de duplication).
    //
    // CAS 1 : modale Vue OSM DÉJÀ OUVERTE (cas rare hors Mode Secours) →
    //         capture DOM direct sans toucher à l'overlay (le user a déjà
    //         ajusté ses filtres, on respecte).
    // CAS 2 : modale Vue OSM FERMÉE (cas normal depuis Mode Secours) →
    //         pose overlay opaque, ouvre Vue OSM derrière, attend tile load,
    //         capture, ferme Vue OSM, retire overlay.

    const mapDivExisting = document.getElementById("kta-osm-map");
    if (mapDivExisting && mapDivExisting.querySelector(".leaflet-tile-loaded")) {
      try {
        console.log("[Briefing] Vue OSM déjà ouverte → capture DOM direct");
        const canvas = await window.html2canvas(mapDivExisting, {
          useCORS: true, allowTaint: false, backgroundColor: "#ffffff",
          logging: false, scale: 1,
          ignoreElements: function(el) { return !!(el.classList && el.classList.contains("leaflet-control-container")); }
        });
        return canvas.toDataURL("image/jpeg", 0.85);
      } catch(e) {
        console.warn("[Briefing] Capture DOM directe échec :", e.message);
        // Continue vers approche open/close masqué ↓
      }
    }

    // CAS 2 : Vue OSM fermée → on l'ouvre sous overlay opaque
    if (!window.OsmView || typeof window.OsmView.open !== "function") {
      console.warn("[Briefing] OsmView.open indisponible — fallback offscreen");
    } else if (!window.OsmView.isAvailable || !window.OsmView.isAvailable()) {
      console.warn("[Briefing] OsmView non disponible (pas de georef ?) — fallback offscreen");
    } else if (!window.OsmView.isOptedIn || !window.OsmView.isOptedIn()) {
      console.warn("[Briefing] OsmView pas opt-in — fallback offscreen (user doit accepter OSM 1×)");
    } else {
      // 🆕 v1.42.14 — Palette adaptée au thème actif
      const isLightOv = _isLightTheme();
      const ovBg     = isLightOv ? "#fdf8eb" : "#0a0d18";
      const ovAccent = isLightOv ? "#b8860b" : "#f4c542";
      const ovMuted  = isLightOv ? "#6b6354" : "#8892a4";

      // Overlay opaque z-index TRÈS haut (au-dessus modales 99999 et OSM 99999+)
      const overlay = document.createElement("div");
      overlay.id = "kta-briefing-capture-overlay";
      overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:1000000",
        "background:" + ovBg, "color:" + ovAccent,
        "display:flex", "align-items:center", "justify-content:center",
        "flex-direction:column", "gap:18px",
        "font-family:system-ui,-apple-system,sans-serif",
        "font-size:16px"
      ].join(";");
      overlay.innerHTML =
        '<div style="font-size:42px;animation:kta-spin 1.4s linear infinite;">🛰️</div>' +
        '<div style="font-weight:700;">' + _ctx.icon + ' ' + _escHtml(_ctx.title) + '</div>' +
        '<div style="font-size:12px;color:' + ovMuted + ';max-width:340px;text-align:center;">' +
          _escHtml(_ctx.sub) +
        '</div>';
      // Inject keyframe spin si pas déjà
      if (!document.getElementById("kta-briefing-spin-kf")) {
        const st = document.createElement("style");
        st.id = "kta-briefing-spin-kf";
        st.textContent = "@keyframes kta-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }";
        document.head.appendChild(st);
      }
      document.body.appendChild(overlay);

      let captured = null;
      try {
        // Ouvre Vue OSM (modale s'affiche sous l'overlay — invisible à l'user)
        window.OsmView.open();

        // 🆕 v1.42.11 — Applique les options de couches choisies dans la modale
        // Briefing options. Petite attente 400ms pour que le DOM des toggles
        // soit injecté par OsmView.open(), puis simule les clics nécessaires.
        if (options) {
          await new Promise(function(r) { setTimeout(r, 400); });
          try { _applyOsmLayerOptions(options); }
          catch(e) { console.warn("[Briefing] _applyOsmLayerOptions échec :", e.message); }
        }

        // Attente robuste : poll tile-loaded + plan rotated rendu + petit délai
        await new Promise(function(resolve) {
          const startedAt = Date.now();
          const tick = function() {
            const map = document.getElementById("kta-osm-map");
            if (map) {
              const hasTiles    = !!map.querySelector(".leaflet-tile-loaded");
              const hasOverlay  = !!map.querySelector(".leaflet-image-layer, .leaflet-overlay-pane svg path, .leaflet-marker-icon");
              if (hasTiles && hasOverlay) {
                // +1.5s pour render final (markers/polylines/etc.)
                setTimeout(resolve, 1500);
                return;
              }
              if (hasTiles && (Date.now() - startedAt > 4000)) {
                // Tiles OK mais pas d'overlay détecté après 4s → on capture
                // quand même (plan peut-être sans data layers).
                setTimeout(resolve, 800);
                return;
              }
            }
            // Safety 12s
            if (Date.now() - startedAt > 12000) { resolve(); return; }
            setTimeout(tick, 200);
          };
          tick();
        });

        // Capture
        const map = document.getElementById("kta-osm-map");
        if (map) {
          const canvas = await window.html2canvas(map, {
            useCORS: true, allowTaint: false, backgroundColor: "#ffffff",
            logging: false, scale: 1,
          ignoreElements: function(el) { return !!(el.classList && el.classList.contains("leaflet-control-container")); }
          });
          captured = canvas.toDataURL("image/jpeg", 0.85);
          console.log("[Briefing] Capture Vue OSM via open/close masqué : OK");
        }
      } catch(eCap) {
        console.warn("[Briefing] Capture via open/close échec :", eCap.message);
      } finally {
        // Ferme Vue OSM (peu importe le résultat)
        try { window.OsmView.close && window.OsmView.close(); } catch(e) {}
        // Retire overlay
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }

      if (captured) return captured;
      // Sinon → fallback offscreen ↓
    }

    // Fallback offscreen : tuiles OSM + bbox + équipes GPS seulement.
    // Pas de plan rotated ni POI/tracés/zones (= MVP v1.42.5).
    // Recommander à KARMA d'ouvrir Vue OSM AVANT le Briefing pour capture complète.
    if (!window.OsmView || typeof window.OsmView.getPlanGpsBbox !== "function") {
      return null;
    }
    const bbox = window.OsmView.getPlanGpsBbox();
    if (!bbox || typeof bbox.getCenter !== "function") {
      console.warn("[Briefing] Pas de bbox georef — capture skip");
      return null;
    }

    const cont = document.createElement("div");
    cont.style.cssText = "position:fixed;left:-99999px;top:0;width:1200px;height:800px;background:#fff;z-index:-1;pointer-events:none;";
    document.body.appendChild(cont);

    let map = null;
    try {
      map = L.map(cont, {
        attributionControl: false,
        zoomControl: false,
        preferCanvas: true,
        keyboard: false,
        scrollWheelZoom: false,
        dragging: false
      });
      map.fitBounds(bbox, { padding: [60, 60], maxZoom: 17 });

      const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        crossOrigin: "anonymous"
      });
      tileLayer.addTo(map);

      // Rectangle bbox plan (jaune charte semi-transparent)
      L.rectangle(bbox, {
        color: "#f4c542",
        weight: 3,
        fillColor: "#f4c542",
        fillOpacity: 0.15,
        interactive: false
      }).addTo(map);

      // Label centre du plan
      const center = bbox.getCenter();
      const planName = (plan && plan.name) || "Site";
      L.marker(center, {
        icon: L.divIcon({
          className: "",
          html: '<div style="background:#1a1f2e;color:#f4c542;padding:6px 14px;' +
                'border-radius:6px;font-size:14px;font-weight:700;' +
                'border:2px solid #f4c542;white-space:nowrap;' +
                'box-shadow:0 2px 8px rgba(0,0,0,0.4);">📍 ' +
                _escHtml(planName) + '</div>',
          iconSize: [10, 10],
          iconAnchor: [60, 5]
        }),
        interactive: false
      }).addTo(map);

      // Markers GPS surface équipes
      if (scenario && Array.isArray(scenario.groupes)) {
        for (const g of scenario.groupes) {
          if (g.surfaceGps && typeof g.surfaceGps.lat === "number"
              && typeof g.surfaceGps.lng === "number") {
            const pal = PALETTE[(g.couleurIdx || 0) % PALETTE.length];
            const hex = (pal && pal.hex) || "#8cb4ff";
            L.circleMarker([g.surfaceGps.lat, g.surfaceGps.lng], {
              radius: 10, color: "#fff", weight: 3,
              fillColor: hex, fillOpacity: 1, interactive: false
            }).addTo(map);
            L.marker([g.surfaceGps.lat, g.surfaceGps.lng], {
              icon: L.divIcon({
                className: "",
                html: '<div style="background:' + hex + ';color:#fff;' +
                      'padding:3px 8px;border-radius:4px;font-size:11px;' +
                      'font-weight:600;white-space:nowrap;' +
                      'box-shadow:0 1px 4px rgba(0,0,0,0.5);">' +
                      _escHtml(g.nom || t("secours.surf.equipeDefaut")) + '</div>',
                iconSize: [10, 10],
                iconAnchor: [-12, 8]
              }),
              interactive: false
            }).addTo(map);
          }
        }
      }

      // Attente fin de chargement des tuiles (event "load" tileLayer +
      // 600ms de marge pour render final). Safety timeout 7s pour cellular lent.
      await new Promise(function(resolve) {
        let done = false;
        const finish = function() {
          if (done) return;
          done = true;
          setTimeout(resolve, 600);
        };
        tileLayer.on("load", finish);
        setTimeout(function() { if (!done) { done = true; resolve(); } }, 7000);
      });

      const canvas = await window.html2canvas(cont, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        width: 1200,
        height: 800,
        logging: false,
        scale: 1
      });

      return canvas.toDataURL("image/jpeg", 0.85);
    } catch(e) {
      console.warn("[Briefing] Capture canvas exception :", e.message);
      return null;
    } finally {
      if (map) { try { map.remove(); } catch(e) {} }
      if (cont.parentNode) { try { cont.parentNode.removeChild(cont); } catch(e) {} }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 🆕 v1.41.0 B + C — Briefing surface (page PDF partagée)
  // ════════════════════════════════════════════════════════════════════════
  //
  // Dessine une page A4 "Briefing surface" avec :
  //   • [v1.42.5] Image capture OSM en haut de page (si lib html2canvas dispo
  //     et georef OK) — sinon fallback texte/lien comme v1.41.x
  //   • Titre + nom du scenario + nom du plan
  //   • Lien OSM bbox (centre + zoom) si Vue OSM georef dispo
  //   • Lien Google Maps en backup
  //   • Liste équipes avec leur GPS surface (lien individuel OSM)
  //   • POI critiques : Point d'entrée (tag 'entree_plan') + Sorties urgence
  //     (tag 'sortieurgence' si exists) + Cavages (tags 'cao'/'caf')
  //
  // Réutilisée :
  //   - dans genererRapportPDF (page insérée dans le rapport post-mission, B)
  //   - dans genererBriefingPompiersPDF (PDF dédié export bouton bandeau, C)
  //
  // ⚠️ Helvetica latin1 → pas d'emoji dans pdf.text(). Textes ASCII pur.
  // 🆕 v1.42.5 — Devenue ASYNC pour permettre await sur _captureOsmCanvasForBriefing.
  // 🆕 v1.42.11 — Accepte 7e arg `options` pour piloter les couches OSM.
  // 🆕 v1.42.13 — Accepte 8e arg `overlayContext` ("briefing"|"rapport") pour
  // adapter les textes de l'overlay de capture.
  async function _drawBriefingSurfacePage(pdf, scenario, plan, pageW, pageH, margin, options, overlayContext) {
    let y = margin + 8;

    // En-tête de la page
    pdf.setFontSize(15); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.surf.titre"), margin, y); y += 7;
    pdf.setFontSize(9); pdf.setFont(undefined, "italic"); pdf.setTextColor(120);
    pdf.text(t("secours.surf.sousTitre"), margin, y);
    pdf.setTextColor(0); pdf.setFont(undefined, "normal"); y += 8;

    // 🆕 v1.42.5 — Tentative capture rendu OSM (offscreen Leaflet + html2canvas)
    // injection en haut de page. Fail-safe : si KO, on garde la mise en page
    // texte/lien standard (= comportement v1.41.x).
    // 🆕 v1.42.11 — options { showPlan, showPoi, … } propagées à la capture
    try {
      const imgData = await _captureOsmCanvasForBriefing(scenario, plan, options, overlayContext);
      if (imgData) {
        // 🆕 v1.42.12 — Récupère les vraies dims de l'image capturée pour
        // préserver son ratio dans le PDF. Sinon ratio hardcoded 3:2 = image
        // déformée si la modale Vue OSM a un viewport différent (16:9, mobile,
        // etc.). Compatible avec capture offscreen (1200×800) ET DOM modale.
        const realDims = await _getImageDataUrlDims(imgData);
        const ratio = (realDims && realDims.w > 0 && realDims.h > 0)
                      ? (realDims.w / realDims.h)
                      : (1200 / 800);  // fallback ratio offscreen

        const availW = pageW - 2 * margin;                // largeur dispo
        const availH = pageH - y - 80;                    // garde 80mm pour reste
        // On contraint width OU height selon ce qui touche en premier
        let finalW = availW;
        let finalH = finalW / ratio;
        if (finalH > availH) {
          finalH = availH;
          finalW = finalH * ratio;
        }
        const offsetX = margin + (availW - finalW) / 2;   // centré horizontalement

        pdf.addImage(imgData, "JPEG", offsetX, y, finalW, finalH);
        y += finalH + 3;
        pdf.setFontSize(7); pdf.setTextColor(140);
        pdf.text(t("secours.surf.osmCaption"),
                 margin, y);
        pdf.setTextColor(0); y += 6;
      }
    } catch(eCap) {
      console.warn("[Briefing] Capture OSM PDF skip :", eCap.message);
    }

    // Bloc INFOS
    pdf.setFontSize(11); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.surf.infos"), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");
    pdf.text(t("secours.surf.scenario", { nom: ((scenario && scenario.nom) || t("secours.pdf.sansNom")) }), margin, y); y += 4;
    pdf.text(t("secours.surf.plan", { plan: ((plan && plan.name) || t("secours.surf.planNonRenseigne")) }), margin, y); y += 4;
    pdf.text(t("secours.surf.genereLe", { date: new Date().toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }), margin, y); y += 6;

    // Bloc LOCALISATION (lien OSM + Google Maps)
    pdf.setFontSize(11); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.surf.localisation"), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");

    let bbox = null;
    if (window.OsmView && typeof window.OsmView.getPlanGpsBbox === "function") {
      try { bbox = window.OsmView.getPlanGpsBbox(); } catch(e) { bbox = null; }
    }
    if (bbox && typeof bbox.getCenter === "function") {
      const c = bbox.getCenter();
      const south = bbox.getSouth(), north = bbox.getNorth();
      const west = bbox.getWest(), east = bbox.getEast();
      const latStr = c.lat.toFixed(6), lngStr = c.lng.toFixed(6);
      pdf.text(t("secours.surf.centrePlan", { lat: latStr, lng: lngStr }), margin, y); y += 4;
      pdf.text(t("secours.surf.bbox", { sw: south.toFixed(5) + ", " + west.toFixed(5), ne: north.toFixed(5) + ", " + east.toFixed(5) }),
               margin, y); y += 5;

      // Lien OSM (osm.org centre + zoom 16)
      const osmUrl = "https://www.openstreetmap.org/?mlat=" + latStr
                   + "&mlon=" + lngStr + "#map=16/" + latStr + "/" + lngStr;
      pdf.setTextColor(60, 110, 220);
      pdf.textWithLink(t("secours.surf.lienOsm"), margin + 4, y,
                       { url: osmUrl }); y += 4;
      // Lien Google Maps backup
      const gmUrl = "https://www.google.com/maps/@" + latStr + "," + lngStr + ",17z";
      pdf.textWithLink(t("secours.surf.lienGmaps"), margin + 4, y,
                       { url: gmUrl }); y += 4;
      pdf.setTextColor(0); y += 2;
    } else {
      pdf.setTextColor(180, 80, 0);
      pdf.text(t("secours.surf.osmNonInit"), margin, y); y += 4;
      pdf.setFontSize(8); pdf.setTextColor(120);
      pdf.text(t("secours.surf.osmNonInitHint1"), margin, y); y += 3;
      pdf.text(t("secours.surf.osmNonInitHint2"), margin, y); y += 4;
      pdf.setFontSize(9); pdf.setTextColor(0);
    }
    y += 4;

    // Bloc EQUIPES + GPS SURFACE
    pdf.setFontSize(11); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.surf.equipesSurPlace"), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");
    const groupes = (scenario && Array.isArray(scenario.groupes)) ? scenario.groupes : [];
    if (groupes.length === 0) {
      pdf.setTextColor(120); pdf.setFont(undefined, "italic");
      pdf.text(t("secours.surf.aucuneEquipe"), margin, y);
      pdf.setTextColor(0); pdf.setFont(undefined, "normal"); y += 6;
    } else {
      groupes.forEach(function(g) {
        if (y > pageH - 25) { pdf.addPage(); y = margin + 8; }
        pdf.setFont(undefined, "bold");
        pdf.text("- " + (g.nom || t("secours.surf.equipeDefaut")), margin, y); y += 4;
        pdf.setFont(undefined, "normal");
        const membresStr = (Array.isArray(g.membres) && g.membres.length > 0)
                           ? g.membres.join(", ") : t("secours.surf.membresNonRenseignes");
        pdf.text(t("secours.surf.membresLigne", { membres: membresStr }), margin + 2, y); y += 4;
        if (g.surfaceGps && typeof g.surfaceGps.lat === "number"
            && typeof g.surfaceGps.lng === "number") {
          const gLat = g.surfaceGps.lat.toFixed(6);
          const gLng = g.surfaceGps.lng.toFixed(6);
          pdf.text(t("secours.surf.gpsSurface", { lat: gLat, lng: gLng }), margin + 2, y); y += 4;
          const eqOsm = "https://www.openstreetmap.org/?mlat=" + gLat
                      + "&mlon=" + gLng + "#map=17/" + gLat + "/" + gLng;
          pdf.setTextColor(60, 110, 220);
          pdf.textWithLink(t("secours.surf.voirPositionEquipe"), margin + 4, y,
                           { url: eqOsm }); y += 4;
          pdf.setTextColor(0);
        } else {
          pdf.setTextColor(150); pdf.setFont(undefined, "italic");
          pdf.text(t("secours.surf.gpsNonRenseigne"), margin + 2, y); y += 4;
          pdf.setTextColor(0); pdf.setFont(undefined, "normal");
        }
        y += 1;
      });
    }
    y += 4;

    // Bloc POI CRITIQUES (entree_plan + sorties urgence + cavages)
    if (y > pageH - 50) { pdf.addPage(); y = margin + 8; }
    pdf.setFontSize(11); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.surf.poiCritiques"), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");

    // 🩸 29/09/2026 (audit Secours) — CE BLOC ÉTAIT TOUJOURS VIDE. Il lisait
    // `window.listePoints` (un `let` racine d'editor.js, jamais sur `window`), le
    // champ `p.tag` (les POI portent `tags[]`) et un tag `sortieurgence` qui n'existe
    // pas. Désormais : session + calques du plan (comme `sortieUrgence.js`), accès
    // OUVERTS d'abord (mêmes tags que la Sortie d'urgence), puis FERMÉS — que les
    // pompiers ou l'IGC peuvent ouvrir. Un POI n'apparaît qu'une fois.
    const poiList = [].concat(
      (typeof window.getEditorPoints === "function" ? window.getEditorPoints() : []) || [],
      (typeof window.getAllEmbeddedPoints === "function" ? window.getAllEmbeddedPoints() : []) || []
    );
    const critTags = ["entree_plan", "cao", "peo", "eso", "caf", "pef", "esf"];
    const ALIAS_ENTREE = ["entree_plan", "entrée", "entree"];
    const critLabels = {
      entree_plan:    t("secours.surf.critEntree"),
      cao:            t("secours.surf.critCao"),
      peo:            t("secours.surf.critPeo"),
      eso:            t("secours.surf.critEso"),
      caf:            t("secours.surf.critCaf"),
      pef:            t("secours.surf.critPef"),
      esf:            t("secours.surf.critEsf")
    };
    const critByTag = {};
    poiList.forEach(function(p) {
      if (!p || !Array.isArray(p.tags)) return;
      const tags = p.tags.map(function(x) { return String(x || "").trim().toLowerCase(); });
      const tg = tags.some(function(x) { return ALIAS_ENTREE.indexOf(x) >= 0; }) ? "entree_plan"
               : critTags.find(function(c) { return tags.indexOf(c) >= 0; });
      if (!tg) return;
      if (!critByTag[tg]) critByTag[tg] = [];
      critByTag[tg].push(p);
    });
    let critFound = false;
    critTags.forEach(function(tg) {
      const arr = critByTag[tg] || [];
      if (arr.length === 0) return;
      critFound = true;
      if (y > pageH - 20) { pdf.addPage(); y = margin + 8; }
      pdf.setFont(undefined, "bold");
      pdf.text(critLabels[tg] + t("secours.pdf.critCount", { n: arr.length }), margin, y); y += 4;
      pdf.setFont(undefined, "normal");
      arr.forEach(function(p) {
        if (y > pageH - 15) { pdf.addPage(); y = margin + 8; }
        const lvl = (typeof p.level === "number") ? t("secours.pdf.niveauParen", { level: p.level }) : "";
        pdf.text("  - " + (p.nom || p.id || t("secours.pdf.sansNom")) + lvl, margin, y); y += 4;
      });
      y += 1;
    });
    if (!critFound) {
      pdf.setTextColor(120); pdf.setFont(undefined, "italic");
      pdf.text(t("secours.surf.aucunPoiCritique"), margin, y);
      pdf.setTextColor(0); pdf.setFont(undefined, "normal"); y += 4;
      pdf.setFontSize(8); pdf.setTextColor(150);
      pdf.text(t("secours.surf.astuceTag", { tag: critLabels.entree_plan }), margin, y); y += 3;
      pdf.text(t("secours.surf.astuceTag2"), margin, y); y += 3;
      pdf.setFontSize(9); pdf.setTextColor(0);
    }
  }

  // 🆕 v1.42.11 — Modale d'options affichée AVANT génération du PDF Briefing.
  // Permet à l'user de choisir quels layers Vue OSM inclure dans la capture
  // (Plan / POI / Tracé / Routes / Iti / Zones / Struct / Secours), comme dans
  // le bandeau Vue OSM modale/Home. Au "Générer" → appel
  // genererBriefingPompiersPDF(scenarioId, options).
  function _afficherModaleBriefingOptions(scenarioId) {
    const s = get(scenarioId);
    if (!s) { _toast(t("secours.toast.scenarioIntrouvableAscii"), "error"); return; }

    // Si une instance existe déjà, la retirer
    const existing = document.getElementById("kta-briefing-options-modal");
    if (existing) existing.remove();

    // 🧹 v1.77.0 (audit code mort) : le flag constant hasSecours=true et ses
    // branches inatteignables sont inlines (on est TOUJOURS dans Mode Secours ici).

    // 🆕 v1.42.14 — Palette adaptée au thème actif (dark / light cataphile)
    const isLight = _isLightTheme();
    const pal = isLight ? {
      backdrop:  "rgba(245,235,208,0.85)",
      boxBg:     "linear-gradient(135deg, #fdf8eb 0%, #f5ecd6 100%)",
      boxBorder: "1px solid rgba(154,135,84,0.40)",
      boxShadow: "0 8px 32px rgba(80,60,30,0.18)",
      textMain:  "#2a2620",
      textMuted: "#6b6354",
      accent:    "#b8860b",
      sectionBg: "rgba(255,255,255,0.55)",
      sectionTitle: "#5a4f40"
    } : {
      backdrop:  "rgba(10,13,24,0.85)",
      boxBg:     "linear-gradient(135deg, #1f2a47 0%, #161e35 100%)",
      boxBorder: "1px solid rgba(140,180,255,0.30)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      textMain:  "#e8eaf0",
      textMuted: "#8892a4",
      accent:    "#f4c542",
      sectionBg: "rgba(0,0,0,0.25)",
      sectionTitle: "#c0c8d8"
    };

    const overlay = document.createElement("div");
    overlay.id = "kta-briefing-options-modal";
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:100001",
      "background:" + pal.backdrop, "backdrop-filter:blur(3px)",
      "display:flex", "align-items:center", "justify-content:center",
      "padding:20px", "font-family:system-ui,-apple-system,sans-serif"
    ].join(";");

    const box = document.createElement("div");
    box.style.cssText = [
      "max-width:520px", "width:100%",
      "background:" + pal.boxBg,
      "border:" + pal.boxBorder, "border-radius:12px",
      "box-shadow:" + pal.boxShadow,
      "color:" + pal.textMain, "padding:24px 28px"
    ].join(";");

    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
        '<div style="font-size:32px;">🚒</div>' +
        '<div>' +
          '<div style="font-size:18px;font-weight:700;color:' + pal.accent + ';">' + t("secours.briefing.titre") + '</div>' +
          '<div style="font-size:12px;color:' + pal.textMuted + ';margin-top:2px;">' + t("secours.briefing.sousTitre") + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="background:' + pal.sectionBg + ';border-radius:8px;padding:14px 16px;margin-bottom:14px;">' +
        '<div style="font-size:13px;font-weight:600;color:' + pal.sectionTitle + ';margin-bottom:10px;">' + t("secours.briefing.couchesTitre") + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px;">' +
          _renderToggleOpt("opt-plan",    t("secours.briefing.optPlan"),    true) +
          _renderToggleOpt("opt-poi",     t("secours.briefing.optPoi"),     true) +
          _renderToggleOpt("opt-tracker", t("secours.briefing.optTracker"), true) +
          _renderToggleOpt("opt-road",    t("secours.briefing.optRoad"),    true) +
          _renderToggleOpt("opt-iti",     t("secours.briefing.optIti"),     true) +
          _renderToggleOpt("opt-zone",    t("secours.briefing.optZone"),    true) +
          _renderToggleOpt("opt-struct",  t("secours.briefing.optStruct"),  true) +
          _renderToggleOpt("opt-secours", t("secours.briefing.optSecours"), true) +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:' + pal.textMuted + ';margin-bottom:14px;line-height:1.5;">' +
        t("secours.briefing.sectionsTexteHint") +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;">' +
        '<button class="kta-btn kta-btn-ghost" data-act="cancel" style="padding:9px 18px;">' + t("secours.btn.annulerSimple") + '</button>' +
        '<button class="kta-btn kta-btn-primary" data-act="generate" style="padding:9px 20px;font-weight:700;">' + t("secours.btn.genererPdf") + '</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector('[data-act="cancel"]').addEventListener("click", function() {
      overlay.remove();
    });
    box.querySelector('[data-act="generate"]').addEventListener("click", function() {
      // 🆕 v1.43.27 (Pattern D) — Disable le bouton AVANT de lancer la génération
      // PDF (lourd : html2canvas + jsPDF, plusieurs secondes). Sans ça, l'user
      // qui double-clique nerveusement déclenche 2 générations parallèles qui
      // se marchent dessus sur le canvas + double download.
      const btnGen = this;
      btnGen.disabled = true;
      const originalText = btnGen.textContent;
      btnGen.textContent = t("secours.briefing.generation");
      const opts = {
        showPlan:    box.querySelector("#kta-bo-opt-plan").checked,
        showPoi:     box.querySelector("#kta-bo-opt-poi").checked,
        showTracker: box.querySelector("#kta-bo-opt-tracker").checked,
        showRoad:    box.querySelector("#kta-bo-opt-road").checked,
        showIti:     box.querySelector("#kta-bo-opt-iti").checked,
        showZone:    box.querySelector("#kta-bo-opt-zone").checked,
        showStruct:  box.querySelector("#kta-bo-opt-struct").checked,
        showSecours: box.querySelector("#kta-bo-opt-secours").checked
      };
      overlay.remove();
      // Note : overlay déjà retiré → le bouton n'est plus dans le DOM, le
      // disable est cosmétique mais le ralentit la fenêtre de double-clic
      // entre clic et overlay.remove(). C'est suffisant pour le cas réel.
      genererBriefingPompiersPDF(scenarioId, opts);
    });
    // Click backdrop = Annuler
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  // Helper template pour chip toggle Briefing options
  function _renderToggleOpt(id, label, checked) {
    return '<label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;user-select:none;padding:4px 0;">' +
             '<input type="checkbox" id="kta-bo-' + id + '"' + (checked ? " checked" : "") + ' style="margin:0;cursor:pointer;">' +
             _escHtml(label) +
           '</label>';
  }

  // 🆕 v1.41.0 C — Genere un PDF "Briefing pompiers" dedie (page unique
  // Briefing surface ci-dessus, exportee comme PDF separe).
  // Appele depuis le handler bouton [data-action="briefing-pompiers"].
  // 🆕 v1.42.11 — Accepte un 2e arg `options` : { showPlan, showPoi, showTracker,
  // showRoad, showIti, showZone, showStruct, showSecours } pour piloter
  // les couches Vue OSM lors de la capture. Passé à _captureOsmCanvasForBriefing
  // via _drawBriefingSurfacePage.
  async function genererBriefingPompiersPDF(scenarioId, options) {
    const s = get(scenarioId);
    if (!s) { _toast(t("secours.toast.scenarioIntrouvableAscii"), "error"); return null; }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      _toast(t("secours.toast.pdfIndisponible"), "error");
      return null;
    }
    try {
      const pdf = new window.jspdf.jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 14;
      // Relecture PDF (29/09) : APP_CONFIG.name n'existe pas → « Plan : (plan) ».
      const planMeta = {
        name: (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name)
              || (window.APP_CONFIG && window.APP_CONFIG.name) || "(plan)"
      };
      // 🆕 v1.42.5 — await pour la capture OSM via html2canvas
      // 🆕 v1.42.11 — passe les options de layers à la capture
      // 🆕 v1.42.13 — overlayContext="briefing" (= défaut), explicite pour lisibilité
      await _drawBriefingSurfacePage(pdf, s, planMeta, pageW, pageH, margin, options, "briefing");
      // Footer simple (pas de réutilisation du _drawRapportPDFFooter qui
      // nécessite un objet reportData complet — on fait minimaliste ici).
      pdf.setFontSize(7); pdf.setTextColor(140);
      pdf.text(t("secours.briefing.footer", { version: ((window.__MKM__ && window.__MKM__.build) || "") }),
               margin, pageH - 6);
      pdf.setTextColor(0);
      const filename = "Briefing_pompiers_" + _slug(s.nom || "scenario") + "_" + _shortDate() + ".pdf";
      pdf.save(filename);
      _toast(t("secours.toast.briefingExporte", { filename: filename }), "success");
      return filename;
    } catch(e) {
      console.warn("[SecoursMode] genererBriefingPompiersPDF échec :", e);
      _toast(t("secours.toast.erreurPdfBriefing", { message: e.message }), "error");
      return null;
    }
  }

  // Helpers PDF rapport — header commun à toutes les pages
  function _drawRapportPDFHeader(pdf, r, pageW, margin) {
    pdf.setTextColor(0);   // relecture PDF : le pied de page précédent laissait du gris
    pdf.setFontSize(16); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.pdf.headerTitre"), margin, margin + 6);
    pdf.setFontSize(9); pdf.setFont(undefined, "italic"); pdf.setTextColor(120);
    pdf.text(t("secours.pdf.headerSub", { version: (r.appVersion || ""), date: new Date(r.exportedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }),
             margin, margin + 11);
    pdf.setTextColor(0); pdf.setFont(undefined, "normal");
    // Bandeau jaune décoratif sous l'en-tête
    pdf.setFillColor(244, 197, 66);   // #f4c542
    pdf.rect(margin, margin + 14, pageW - 2 * margin, 1.5, "F");
  }

  function _drawRapportPDFFooter(pdf, r, pageW, pageH, margin) {
    pdf.setFontSize(7); pdf.setTextColor(120);
    const txt = "MyKTAMap " + (r.appVersion || "") +
                " - " + (r.scenario.nom || "") +
                " - " + new Date().toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR");
    pdf.text(txt, margin, pageH - 6);
    pdf.setTextColor(0);
  }

  // Page texte étapes d'une équipe
  // 4e relecture (R4-4) — section « Signalements hors parcours » (étapes retirées du
  // parcours alors que l'équipe y avait saisi quelque chose). Retourne le nouveau y.
  function _pdfSectionHorsParcours(pdf, ed, r, y, pageW, pageH, margin) {
    const liste = (ed && Array.isArray(ed.horsParcours)) ? ed.horsParcours : [];
    if (liste.length === 0) return y;
    if (y > pageH - 40) {
      _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
      pdf.addPage(); _drawRapportPDFHeader(pdf, r, pageW, margin); y = margin + 22;
    }
    y += 3;
    pdf.setFontSize(11); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.pdf.horsParcoursTitre", { n: liste.length }), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");
    liste.forEach(function(e) {
      if (y > pageH - 25) {
        _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
        pdf.addPage(); _drawRapportPDFHeader(pdf, r, pageW, margin); y = margin + 22;
      }
      pdf.setFont(undefined, "bold");
      pdf.text("  - " + (_lblEtape(e.label) || "(?)") + " : " + _statutLabelAscii(e.statut), margin, y); y += 4;
      pdf.setFont(undefined, "normal");
      if (e.observations && String(e.observations).trim()) {
        y = _pdfWrapText(pdf, "     " + t("secours.pdf.obsLigne", { obs: String(e.observations).trim() }), margin, y, pageW - 2 * margin, 4);
      }
      if (Array.isArray(e.photoIds) && e.photoIds.length > 0) {
        pdf.text("     " + t("secours.pdf.photosAttachees", { n: e.photoIds.length }), margin, y); y += 4;
      }
      y += 2;
    });
    return y;
  }

  // 4e relecture (R4-7) — étapes des phases closes, en version compacte.
  function _pdfSectionHistorique(pdf, ed, r, y, pageW, pageH, margin) {
    (ed && Array.isArray(ed.historique) ? ed.historique : []).forEach(function(h) {
      if (y > pageH - 40) {
        _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
        pdf.addPage(); _drawRapportPDFHeader(pdf, r, pageW, margin); y = margin + 22;
      }
      y += 3;
      pdf.setFontSize(11); pdf.setFont(undefined, "bold");
      pdf.text(t("secours.pdf.historiquePhaseTitre", { phase: h.nom, n: h.etapes.length }), margin, y); y += 6;
      pdf.setFontSize(9); pdf.setFont(undefined, "normal");
      h.etapes.forEach(function(et, i) {
        if (y > pageH - 25) {
          _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
          pdf.addPage(); _drawRapportPDFHeader(pdf, r, pageW, margin); y = margin + 22;
        }
        pdf.text("  " + (i + 1) + ". " + (_lblEtape(et.label) || "(?)") + " : " + _statutLabelAscii(et.statut), margin, y); y += 4;
        if (et.observations && String(et.observations).trim()) {
          y = _pdfWrapText(pdf, "     " + t("secours.pdf.obsLigne", { obs: String(et.observations).trim() }), margin, y, pageW - 2 * margin, 4);
        }
      });
    });
    return y;
  }

  function _drawRapportPDFEquipeTextePage(pdf, ed, r, pageW, pageH, margin) {
    _drawRapportPDFHeader(pdf, r, pageW, margin);
    const g = ed.equipe;
    const couleur = PALETTE[g.couleurIdx % PALETTE.length] || PALETTE[0];
    let y = margin + 22;

    // Titre équipe
    pdf.setFontSize(14); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.pdf.equipeTitre", { nom: g.nom }), margin, y); y += 4;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal"); pdf.setTextColor(100);
    pdf.text(t("secours.pdf.couleurOtan", { couleur: couleur.nom }) +
             (typeof g.level === "number" ? t("secours.pdf.niveauSuffix", { niveau: _formatLevelShort(g.level) }) : "") + ")",
             margin, y); y += 6;
    pdf.setTextColor(0);

    // Bandeau couleur équipe
    const rgb = _hexToRgb(couleur.hex);
    pdf.setFillColor(rgb.r, rgb.g, rgb.b);
    pdf.rect(margin, y, pageW - 2 * margin, 5, "F");
    y += 9;

    // Membres
    if (Array.isArray(g.membres) && g.membres.length > 0) {
      pdf.setFontSize(10); pdf.setFont(undefined, "bold");
      pdf.text(t("secours.pdf.membresTitre"), margin, y); y += 4;
      pdf.setFont(undefined, "normal");
      y = _pdfWrapText(pdf, g.membres.join(", "), margin, y, pageW - 2 * margin, 4);
      y += 3;
    }

    // Étapes
    pdf.setFontSize(11); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.pdf.etapesTitre", { n: (ed.etapes || []).length }), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");

    if (!Array.isArray(ed.etapes) || ed.etapes.length === 0) {
      pdf.setFont(undefined, "italic");
      pdf.text(t((ed.historique && ed.historique.length) ? "secours.pdf.horsPhaseCourante" : "secours.pdf.aucuneEtape"), margin, y);
      pdf.setFont(undefined, "normal");
      _pdfSectionHistorique(pdf, ed, r, _pdfSectionHorsParcours(pdf, ed, r, y + 6, pageW, pageH, margin), pageW, pageH, margin);
      _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
      return;
    }

    ed.etapes.forEach(function(et, i) {
      // Saut de page si on dépasse le bas
      if (y > pageH - 30) {
        _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
        pdf.addPage();
        _drawRapportPDFHeader(pdf, r, pageW, margin);
        y = margin + 22;
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.equipeTitreSuite", { nom: g.nom }), margin, y); y += 6;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
      }
      const info = _getStatutInfo(et.statut);
      const typeLabel = (et.type === "entree") ? t("secours.pdf.typeEntree")
                      : (et.type === "sortie") ? t("secours.pdf.typeSortie")
                      : t("secours.pdf.typeEtape", { idx: i });
      const ts = et.completedAt ? new Date(et.completedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR")
               : et.startedAt   ? t("secours.pdf.tsEnCours", { date: new Date(et.startedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") })
               : "—";
      // Encadré statut couleur
      const statutRgb = _hexToRgb(info.color);
      pdf.setDrawColor(statutRgb.r, statutRgb.g, statutRgb.b);
      pdf.setLineWidth(0.6);
      pdf.line(margin, y - 3, margin, y + 6);
      pdf.setLineWidth(0.2);
      pdf.setDrawColor(0);

      pdf.setFont(undefined, "bold");
      pdf.text("  " + (i + 1) + ". " + typeLabel + " - " + (_lblEtape(et.label) || "(?)"), margin, y); y += 4;
      pdf.setFont(undefined, "normal");
      pdf.text("     " + t("secours.pdf.statutLigne", { statut: _statutLabelAscii(et.statut), ts: ts }), margin, y); y += 4;
      if (et.observations && et.observations.trim()) {
        y = _pdfWrapText(pdf, "     " + t("secours.pdf.obsLigne", { obs: et.observations.trim() }), margin, y, pageW - 2 * margin, 4);
      }
      if (Array.isArray(et.photoIds) && et.photoIds.length > 0) {
        pdf.setFont(undefined, "italic"); pdf.setTextColor(120);
        pdf.text("     " + t("secours.pdf.photosAttachees", { n: et.photoIds.length }), margin, y);
        pdf.setTextColor(0); pdf.setFont(undefined, "normal");
        y += 4;
      }
      y += 3;
    });
    y = _pdfSectionHorsParcours(pdf, ed, r, y, pageW, pageH, margin);
    y = _pdfSectionHistorique(pdf, ed, r, y, pageW, pageH, margin);
    _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 🆕 v1.26.0 Phase 4 C5 — Mini-carte par équipe (page A4 paysage dédiée)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Calcule le rectangle englobant de tous les waypoints / zone / itinéraire
   * d'une équipe. Padding 15% pour respiration visuelle.
   *
   * @param {object} eq - équipe SecoursMode
   * @returns {object|null} {x, y, w, h} en coord plan, ou null si rien à dessiner
   */
  function _calculerBoundsEquipe(eq) {
    if (!eq) return null;
    const pts = [];
    if (eq.entree) pts.push(eq.entree);
    if (eq.sortie) pts.push(eq.sortie);
    if (Array.isArray(eq.intermediaires)) {
      eq.intermediaires.forEach(function(p) { if (p) pts.push(p); });
    }
    if (eq.zoneType === "polygon" && Array.isArray(eq.zonePolygon)) {
      eq.zonePolygon.forEach(function(p) { if (p) pts.push(p); });
    }
    if (Array.isArray(eq.itineraireSuggere)) {
      eq.itineraireSuggere.forEach(function(p) { if (p) pts.push(p); });
    }
    if (pts.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(function(p) {
      if (typeof p.x === "number" && typeof p.y === "number") {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    });
    if (!isFinite(minX)) return null;

    // Padding 15% du grand côté (= zone + entrée + sortie + iti restent dans la vue)
    // Plancher de 60 px pour les zones très petites (1-2 waypoints proches)
    const pad = Math.max(60, Math.max(maxX - minX, maxY - minY) * 0.15);
    return {
      x: minX - pad,
      y: minY - pad,
      w: (maxX - minX) + 2 * pad,
      h: (maxY - minY) + 2 * pad
    };
  }

  /**
   * Convertit un hex "#RRGGBB" en string "rgba(R,G,B,alpha)".
   * Fallback couleur ambre charte si hex invalide.
   */
  function _hexToRgbaCss(hex, alpha) {
    const m = /^#?([a-fA-F0-9]{6})$/.exec(hex || "");
    if (!m) return "rgba(244, 197, 66, " + alpha + ")";
    const h = m[1];
    return "rgba(" + parseInt(h.substring(0, 2), 16) +
           "," + parseInt(h.substring(2, 4), 16) +
           "," + parseInt(h.substring(4, 6), 16) +
           "," + alpha + ")";
  }

  /**
   * Dessine l'overlay équipe sur le canvas final de la mini-carte.
   * Tracé : zone polygon (fond teinté + bord), itinéraire (dashed),
   * entrée (cercle bord vert), sortie (cercle bord rouge), intermédiaires
   * (cercles numérotés).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} eq - équipe
   * @param {Function} planToCanvas - (x, y) → {x, y} en coords canvas final
   * @param {object} couleur - {hex} palette OTAN
   */
  function _drawEquipeOverlayOnCanvas(ctx, eq, planToCanvas, couleur) {
    const hex = (couleur && couleur.hex) || "#f4c542";

    // 1) Zone polygon : fond teinté + bordure
    if (eq.zoneType === "polygon" && Array.isArray(eq.zonePolygon) && eq.zonePolygon.length >= 3) {
      ctx.beginPath();
      eq.zonePolygon.forEach(function(p, i) {
        if (typeof p.x !== "number") return;
        const c = planToCanvas(p.x, p.y);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else         ctx.lineTo(c.x, c.y);
      });
      ctx.closePath();
      ctx.fillStyle   = _hexToRgbaCss(hex, 0.22);
      ctx.fill();
      ctx.strokeStyle = hex;
      ctx.lineWidth   = 4;
      ctx.stroke();
    }

    // 2) Itinéraire : polyline dashed
    if (Array.isArray(eq.itineraireSuggere) && eq.itineraireSuggere.length >= 2) {
      ctx.beginPath();
      eq.itineraireSuggere.forEach(function(p, i) {
        if (typeof p.x !== "number") return;
        const c = planToCanvas(p.x, p.y);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else         ctx.lineTo(c.x, c.y);
      });
      ctx.strokeStyle = hex;
      ctx.lineWidth   = 6;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.setLineDash([14, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3) Intermédiaires : cercles numérotés (avant entrée/sortie pour z-order)
    if (Array.isArray(eq.intermediaires)) {
      eq.intermediaires.forEach(function(p, i) {
        if (typeof p.x !== "number") return;
        const c = planToCanvas(p.x, p.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, 14, 0, 2 * Math.PI);
        ctx.fillStyle   = hex;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth   = 3;
        ctx.stroke();
        ctx.fillStyle   = "#1a1f2e";
        ctx.font        = "bold 14px Arial, sans-serif";
        ctx.textAlign   = "center";
        ctx.textBaseline= "middle";
        ctx.fillText(String(i + 1), c.x, c.y);
      });
    }

    // 4) Entrée : cercle border vert + "E"
    if (eq.entree && typeof eq.entree.x === "number") {
      const c = planToCanvas(eq.entree.x, eq.entree.y);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 18, 0, 2 * Math.PI);
      ctx.fillStyle   = hex;
      ctx.fill();
      ctx.strokeStyle = "#00cc44";
      ctx.lineWidth   = 5;
      ctx.stroke();
      ctx.fillStyle   = "#ffffff";
      ctx.font        = "bold 16px Arial, sans-serif";
      ctx.textAlign   = "center";
      ctx.textBaseline= "middle";
      ctx.fillText("E", c.x, c.y);
    }

    // 5) Sortie : cercle border rouge + "S" (orange si boucle entrée=sortie)
    if (eq.sortie && typeof eq.sortie.x === "number") {
      // Détection boucle : sortie = entrée (même pointId ou coords ~)
      const isLoop = eq.entree && eq.sortie.pointId && eq.entree.pointId &&
                     eq.sortie.pointId === eq.entree.pointId;
      const c = planToCanvas(eq.sortie.x, eq.sortie.y);
      // Si boucle, on décale visuellement de 6px pour ne pas écraser l'entrée
      const cx = isLoop ? c.x + 22 : c.x;
      const cy = c.y;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
      ctx.fillStyle   = hex;
      ctx.fill();
      ctx.strokeStyle = isLoop ? "#ff8c00" : "#cc0000";
      ctx.lineWidth   = 5;
      ctx.stroke();
      ctx.fillStyle   = "#ffffff";
      ctx.font        = "bold 16px Arial, sans-serif";
      ctx.textAlign   = "center";
      ctx.textBaseline= "middle";
      ctx.fillText("S", cx, cy);
    }
  }

  /**
   * Ajoute une page A4 paysage avec mini-carte de l'équipe.
   * Pipeline :
   *   1. Bounds englobants équipe (waypoints + zone + iti)
   *   2. Canvas plan complet via MyKTAMapExporterGenererCanvas (scale 0.5)
   *   3. Crop sur les bounds → canvas final (ratio A4 paysage)
   *   4. Dessin overlay équipe par-dessus (zone, iti, entrée, sortie, interms)
   *   5. addPage paysage + addImage du canvas final + header/footer texte
   *
   * Skip silencieux si :
   *   - équipe sans waypoints/zone/iti
   *   - MyKTAMapExporterGenererCanvas indispo (plan pas chargé ?)
   *   - PLAN_CONFIG absent
   *
   * Async (canvas exporter est async).
   *
   * @param {jsPDF} pdf
   * @param {object} ed - reportData.equipesData[i] = {equipe, etapes, photos}
   * @param {object} r  - reportData complet (pour metadata)
   */
  async function _drawRapportPDFEquipeMiniaturePage(pdf, ed, r, cacheFond) {
    if (!ed || !ed.equipe) return false;
    // 🩸 29/09/2026 (audit Secours) — LA MINI-CARTE NE S'EST JAMAIS DESSINÉE.
    // `ed.equipe` est la copie ALLÉGÉE du rapport (id, nom, couleur, membres…) :
    // ni entrée, ni étapes, ni zone, ni itinéraire → `_calculerBoundsEquipe` rendait
    // null et la page était sautée sans un mot. Le PDF se génère sur l'appareil
    // qui détient le scénario : on y reprend l'équipe complète.
    const sLoc = (r && r.scenario && r.scenario.id) ? get(r.scenario.id) : null;
    const gLoc = sLoc ? (sLoc.groupes || []).find(function(g) { return g.id === ed.equipe.id; }) : null;
    const eq = gLoc ? Object.assign({}, ed.equipe, gLoc) : ed.equipe;

    // 1) Bounds englobants
    const bounds = _calculerBoundsEquipe(eq);
    if (!bounds) return false; // Pas d'éléments dessinables — skip silent

    if (!window.MyKTAMapExporterGenererCanvas) {
      console.warn("[Rapport] MyKTAMapExporterGenererCanvas indispo — mini-carte skip");
      return false;
    }

    // 2) Canvas plan complet (scale 0.5 pour limiter la RAM mobile)
    let planCanvas = cacheFond && cacheFond.canvas;
    try {
      if (!planCanvas) planCanvas = await window.MyKTAMapExporterGenererCanvas({
        scale: _echelleCanvasPlan(0.5),   // plafonné sous la limite iOS
        bg:    "image",
        // Annotations session désactivées (mini-carte = juste plan + data
        // layers + icones permanentes ; les overlays équipe sont dessinés
        // par-dessus en Canvas 2D natif via _drawEquipeOverlayOnCanvas)
        ann: {
          points:     false,
          roads:      false,
          zones:      false,
          structures: false,
          pointsTags: { tagsCoches: new Set(), untaggedCoche: false, tousActifs: false }
        }
      });
    } catch (e) {
      console.warn("[Rapport] Génération canvas plan échouée : " + (e && e.message));
      return false;
    }
    if (!planCanvas || !planCanvas.width) return false;
    if (cacheFond) cacheFond.canvas = planCanvas;

    // 3) Nouveau canvas final paysage A4 ratio (297/210 = 1.414)
    // Cible 1800×1273 px (= ~150 dpi A4 paysage utile, bon compromis qualité/RAM)
    const TARGET_W = 1800;
    const TARGET_H = Math.round(TARGET_W * 210 / 297);
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width  = TARGET_W;
    finalCanvas.height = TARGET_H;
    const ctx = finalCanvas.getContext("2d");

    // Mapping bounds plan → coords canvas plan (échelle MESURÉE, cf _echelleCanvasPlan)
    const SCALE_PLAN = _echelleDuCanvas(planCanvas);
    let sx = bounds.x * SCALE_PLAN;
    let sy = bounds.y * SCALE_PLAN;
    let sw = bounds.w * SCALE_PLAN;
    let sh = bounds.h * SCALE_PLAN;

    // Clamp source au canvas plan (anti-overflow si bounds dépasse)
    if (sx < 0) { sw += sx; sx = 0; }
    if (sy < 0) { sh += sy; sy = 0; }
    if (sx + sw > planCanvas.width)  sw = planCanvas.width  - sx;
    if (sy + sh > planCanvas.height) sh = planCanvas.height - sy;
    if (sw <= 0 || sh <= 0) {
      console.warn("[Rapport] Bounds équipe hors du plan — mini-carte skip");
      return false;
    }

    // Ratio src/dst : letterbox (bandes blanches) pour préserver la forme
    const srcRatio = sw / sh;
    const dstRatio = TARGET_W / TARGET_H;
    let dx, dy, dw, dh;
    if (srcRatio > dstRatio) {
      // src plus large → bandes haut/bas
      dw = TARGET_W;
      dh = dw / srcRatio;
      dx = 0;
      dy = (TARGET_H - dh) / 2;
    } else {
      // src plus haute → bandes gauche/droite
      dh = TARGET_H;
      dw = dh * srcRatio;
      dy = 0;
      dx = (TARGET_W - dw) / 2;
    }

    // Fond blanc + drawImage croppé
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TARGET_W, TARGET_H);
    ctx.drawImage(planCanvas, sx, sy, sw, sh, dx, dy, dw, dh);

    // 4) Overlay équipe : helper coord plan → coord canvas final
    // Relecture 29/09 (R11) : projeter avec la source RÉELLEMENT dessinée (rognée au
    // bord du plan), pas avec les bounds bruts — sinon l'équipe dessinée par-dessus
    // se décalait du fond dès que la zone touchait un bord du plan.
    const srcX = sx / SCALE_PLAN, srcY = sy / SCALE_PLAN, srcW = sw / SCALE_PLAN, srcH = sh / SCALE_PLAN;
    function _planToFinal(x, y) {
      const ratioX = (x - srcX) / srcW;
      const ratioY = (y - srcY) / srcH;
      return {
        x: dx + ratioX * dw,
        y: dy + ratioY * dh
      };
    }
    const couleur = PALETTE[(eq.couleurIdx || 0) % PALETTE.length] || { hex: "#f4c542" };
    _drawEquipeOverlayOnCanvas(ctx, eq, _planToFinal, couleur);

    // 5) Ajout page PDF paysage + addImage + header/footer texte (ASCII only
    //    pour pdf.text — cf §44.6 jsPDF Helvetica latin1)
    pdf.addPage("a4", "landscape");
    const pageW = pdf.internal.pageSize.getWidth();   // 297 mm
    const pageH = pdf.internal.pageSize.getHeight();  // 210 mm
    const m     = 12;

    // Header : pastille couleur + titre équipe (ASCII)
    const rgb = (function() {
      const mh = /^#?([a-fA-F0-9]{6})$/.exec(couleur.hex);
      if (!mh) return [244, 197, 66];
      const h = mh[1];
      return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
    })();
    pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
    pdf.rect(m, 8, 8, 8, "F");
    pdf.setTextColor(40);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    // ASCII-normalize le nom : retire accents (NFD + diacritics) + non-Latin-1
    // (jsPDF Helvetica latin1 = mojibake sur emojis/Unicode)
    const nomAscii = String(eq.nom || t("secours.pdf.equipeDefautAscii"))
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")    // diacritics
      .replace(/[^\x20-\x7E]/g, "");       // non-Latin1 (emojis, etc.)
    pdf.text(t("secours.pdf.carteTitre", { nom: nomAscii.toUpperCase() }), m + 12, 14);

    // Image canvas — couvre la zone disponible
    const availW = pageW - 2 * m;
    const availH = pageH - 22 - 12;  // - header (22) - footer (12)
    const imgX = m;
    const imgY = 18;
    const dataUrl = finalCanvas.toDataURL("image/jpeg", 0.82);
    pdf.addImage(dataUrl, "JPEG", imgX, imgY, availW, availH);

    // Footer : info distance + durée + zone type (ASCII)
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(90);
    const lines = [];
    if (typeof eq.distanceM === "number")       lines.push(t("secours.carte.distance", { distance: (typeof window.formatDistance === "function")
      ? window.formatDistance(eq.distanceM, 0) : Math.round(eq.distanceM) + " m" }));
    if (typeof eq.dureeEstimeeMin === "number") lines.push(t("secours.carte.duree", { duree: Math.round(eq.dureeEstimeeMin) }));
    if (eq.zoneType === "polygon")              lines.push(t("secours.carte.zonePolygone", { n: (eq.zonePolygon ? eq.zonePolygon.length : 0) }));
    else if (eq.zoneType === "roads")           lines.push(t("secours.carte.zoneTraces", { n: (eq.zoneRoadIds ? eq.zoneRoadIds.length : 0) }));
    const nbWp = (eq.entree ? 1 : 0) + (eq.sortie ? 1 : 0) +
                 (Array.isArray(eq.intermediaires) ? eq.intermediaires.length : 0);
    lines.push(t("secours.carte.waypoints", { n: nbWp }));
    pdf.text(lines.join("  -  "), m, pageH - 6);

    return true;
  }

  // Page photos d'une équipe (grille)
  function _drawRapportPDFEquipePhotosPage(pdf, ed, r, pageW, pageH, margin) {
    _drawRapportPDFHeader(pdf, r, pageW, margin);
    const g = ed.equipe;
    let y = margin + 22;

    pdf.setFontSize(12); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.pdf.photosTitre", { nom: g.nom, n: ed.photos.length }), margin, y); y += 8;
    pdf.setFontSize(8); pdf.setFont(undefined, "normal");

    // Grille 2 colonnes, hauteur fixe par cellule
    const cols = 2;
    const gapMm = 4;
    const cellW = (pageW - 2 * margin - gapMm) / cols;
    const cellH = cellW * 3 / 4;  // ratio 4:3
    let col = 0;

    ed.photos.forEach(function(p, idx) {
      if (!p.dataUrl) return;
      // Saut de page si dépasse
      if (y + cellH + 8 > pageH - 12) {
        _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
        pdf.addPage();
        _drawRapportPDFHeader(pdf, r, pageW, margin);
        y = margin + 22;
        col = 0;
      }
      const x = margin + col * (cellW + gapMm);
      try {
        pdf.addImage(p.dataUrl, "JPEG", x, y, cellW, cellH, undefined, "FAST");
        pdf.setDrawColor(150);
        pdf.rect(x, y, cellW, cellH);
        // Label sous photo
        pdf.setFontSize(7); pdf.setTextColor(80);
        let stepLabel = (p.stepIdx === -1) ? t("secours.pdf.noteLibre") : t("secours.pdf.typeEtape", { idx: (p.stepIdx + 1) });
        if (typeof p.phaseIdx === "number") stepLabel = t("secours.pdf.phaseCourte", { n: p.phaseIdx + 1 }) + " - " + stepLabel;
        pdf.text(stepLabel + " - " + _formatKB(p.sizeBytes), x, y + cellH + 4);
        pdf.setTextColor(0);
      } catch(e) {
        console.warn("[SecoursMode] addImage photo " + p.id + " échec :", e);
        pdf.setDrawColor(200);
        pdf.rect(x, y, cellW, cellH);
        pdf.setFontSize(8);
        pdf.text(t("secours.pdf.photoErreur", { id: p.id }), x + 2, y + cellH / 2, { align: "left" });
      }
      col++;
      if (col >= cols) {
        col = 0;
        y += cellH + 8;
      }
    });
    _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
  }

  // Page notes libres (mode secouriste)
  function _drawRapportPDFNotesLibresPage(pdf, r, pageW, pageH, margin) {
    _drawRapportPDFHeader(pdf, r, pageW, margin);
    let y = margin + 22;

    pdf.setFontSize(14); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.pdf.notesLibresTitre", { n: r.notesLibres.length }), margin, y); y += 8;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");

    const sorted = r.notesLibres.slice().sort(function(a, b) {
      return Date.parse(a.ts) - Date.parse(b.ts);   // chronologique ASC
    });
    sorted.forEach(function(note, i) {
      if (y > pageH - 25) {
        _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
        pdf.addPage();
        _drawRapportPDFHeader(pdf, r, pageW, margin);
        y = margin + 22;
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.notesLibresSuite"), margin, y); y += 6;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
      }
      const info = _getStatutInfo(note.statut);
      const ts = new Date(note.ts).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR");
      pdf.setFont(undefined, "bold");
      pdf.text("  " + (i + 1) + ". " + _statutLabelAscii(note.statut) + "  |  " + ts, margin, y); y += 4;
      pdf.setFont(undefined, "normal");
      if (note.texte) {
        y = _pdfWrapText(pdf, "     " + note.texte, margin, y, pageW - 2 * margin, 4);
      }
      if (Array.isArray(note.photoIds) && note.photoIds.length > 0) {
        pdf.setFont(undefined, "italic"); pdf.setTextColor(120);
        pdf.text("     " + t("secours.pdf.photosAttacheesShort", { n: note.photoIds.length }), margin, y);
        pdf.setTextColor(0); pdf.setFont(undefined, "normal");
        y += 4;
      }
      y += 3;
    });
    _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
  }

  // Helper local — label rôle en ASCII (pour pdf.text qui supporte mal les emojis)
  function _formatRoleLabelAscii(scope) {
    if (scope === "operateur")  return t("secours.roleAscii.operateur");
    if (scope === "equipe")     return t("secours.roleAscii.equipe");
    if (scope === "secouriste") return t("secours.roleAscii.secouriste");
    return "(?)";
  }

  // Helper local — format taille bytes en KB/MB
  function _formatKB(bytes) {
    if (!bytes || bytes < 0) return "0 KB";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
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
      _toast(t("secours.toast.scenarioIntrouvable"), "error");
      return null;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      _toast(t("secours.toast.pdfIndisponible"), "error");
      return null;
    }
    if (!s.groupes || s.groupes.length === 0) {
      _toast(t("secours.toast.aucuneEquipeScenario"), "warn");
      return null;
    }
    _toast(t("secours.toast.generationPdfCanvas"), "info");
    // 🆕 v1.22.0-fix5 — Génère UNE fois le canvas plan complet avec calques
    // image + data layers visibles. Sera croppé par équipe. Si échec → PDF
    // text-only (fallback MVP).
    let fullCanvas = null;
    if (window.MyKTAMapExporterGenererCanvas && typeof window.MyKTAMapExporterGenererCanvas === "function") {
      try {
        fullCanvas = await window.MyKTAMapExporterGenererCanvas({
          scale:             _echelleCanvasPlan(1),
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
      const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || t("secours.pdf.planDefault");
      s.groupes.forEach(function(g, idx) {
        if (idx > 0) pdf.addPage();
        pdf.setTextColor(0);   // relecture PDF : titre gris hérité du pied de page précédent
        const couleur = PALETTE[g.couleurIdx % PALETTE.length];
        // En-tête
        pdf.setFontSize(18); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.planSecoursTitre", { nom: g.nom }), margin, margin + 4);
        // Bandeau couleur équipe
        const rgb = _hexToRgb(couleur.hex);
        pdf.setFillColor(rgb.r, rgb.g, rgb.b);
        pdf.rect(margin, margin + 7, pageW - 2 * margin, 6, "F");
        pdf.setFontSize(10); pdf.setTextColor(255, 255, 255); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.equipeBandeau", { couleur: couleur.nom, n: (idx + 1), total: s.groupes.length }),
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
              pdf.text(t("secours.pdf.carteMiniature"), pageW / 2, y, { align: "center" });
              y += 5;
              pdf.setTextColor(0, 0, 0); pdf.setFont(undefined, "normal");
            }
          } catch(e) {
            console.warn("[SecoursMode] Crop canvas échec pour équipe " + g.nom + " :", e);
          }
        }
        // Section Contexte
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.contexteIncident"), margin, y); y += 5;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
        pdf.text(t("secours.pdf.scenarioLigne", { nom: (s.nom || t("secours.pdf.sansNom")) }), margin, y); y += 4;
        pdf.text(t("secours.pdf.planLigne", { plan: planName }), margin, y); y += 4;
        if (s.context && s.context.incidentAt) {
          const dt = new Date(s.context.incidentAt);
          pdf.text(t("secours.pdf.heureIncident", { date: dt.toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }), margin, y); y += 4;
        }
        if (s.context && s.context.notes) {
          y = _pdfWrapText(pdf, t("secours.pdf.notesLigne", { notes: s.context.notes }), margin, y, pageW - 2 * margin, 4);
        }
        y += 4;
        // Section Membres
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.membresEquipe"), margin, y); y += 5;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
        pdf.text((g.membres && g.membres.length) ? g.membres.join(", ") : t("secours.pdf.nonRenseignes"), margin, y);
        y += 8;
        // Section Mission
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.missionAssignee"), margin, y); y += 5;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
        // Relecture PDF : le NOM du point d'abord (« x=11682 y=9671 » ne dit rien à une équipe).
        const nomPt = function(w) {
          if (!w || typeof w.x !== "number") return _fmtPoint(w);
          const gps = _gpsTxt(w.x, w.y);
          const ou = gps ? "GPS " + gps + (typeof w.level === "number" ? " niv=" + w.level : "") : _fmtPoint(w);
          return w.label ? w.label + " (" + ou + ")" : ou;
        };
        pdf.text(t("secours.pdf.entreeLigne", { point: nomPt(g.entree) }), margin, y); y += 4;
        pdf.text(t("secours.pdf.sortieLigne", { point: nomPt(g.sortie) }), margin, y); y += 4;
        const zoneTxt = g.zoneType === "polygon" ? t("secours.pdf.zonePolygone", { n: (g.zonePolygon ? g.zonePolygon.length : 0) })
                      : g.zoneType === "roads"   ? t("secours.pdf.zoneRoads", { n: (g.zoneRoadIds ? g.zoneRoadIds.length : 0) })
                      : t("secours.pdf.zoneNonDefinie");
        pdf.text(t("secours.pdf.zoneRatisser", { zone: zoneTxt }), margin, y); y += 4;
        if (g.distanceM) {
          const distFmt = (typeof window.formatDistance === "function")
                          ? window.formatDistance(g.distanceM, 0) : Math.round(g.distanceM) + " m";
          pdf.text(t("secours.pdf.distanceItineraire", { distance: distFmt }), margin, y); y += 4;
        }
        if (g.dureeEstimeeMin) {
          pdf.text(t("secours.pdf.dureeEstimee", { duree: Math.round(g.dureeEstimeeMin) }), margin, y); y += 4;
        }
        y += 4;
        // Section Itinéraire (waypoints)
        // 🩸 29/09/2026 (audit Secours) — la ligne disait « N waypoints » avec N =
        // points du TRACÉ (220 à 480 mesurés), pas les étapes (une quinzaine) : un
        // chef d'équipe lisant le papier croyait à 400 arrêts. On imprime les ÉTAPES,
        // dans l'ordre, telles qu'il les verra dans le stepper — même sans itinéraire
        // calculé (2e relecture, D-b : le papier ne doit pas dépendre du calcul).
        const etapesNoms = [g.entree].concat(g.intermediaires || [], [g.sortie])
          .filter(function(w) { return w && typeof w.x === "number"; })
          .map(function(w) { return w.label || _lblEtape(_fmtPoint(w)); });
        if (etapesNoms.length > 0) {
          pdf.setFontSize(11); pdf.setFont(undefined, "bold");
          const aIti = Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length > 0;
          pdf.text(t(aIti ? "secours.pdf.itineraireSuggere" : "secours.pdf.etapesTitreSansIti"), margin, y); y += 5;
          pdf.setFontSize(9); pdf.setFont(undefined, "normal");
          // Liste longue (« POI de la zone » : 40-60 étapes) : saut de page ligne à ligne.
          pdf.splitTextToSize(t("secours.pdf.etapesLigne", { n: etapesNoms.length, liste: etapesNoms.join(" > ") }),
                              pageW - 2 * margin).forEach(function(ligne) {
            if (y > pdf.internal.pageSize.getHeight() - 15) { pdf.addPage(); y = margin + 8; }
            pdf.text(ligne, margin, y); y += 4;
          });
          y += 4;
        }
        // Cadre Observations : page suivante s'il ne tient plus (liste d'étapes longue)
        if (y + 70 > pdf.internal.pageSize.getHeight() - 10) { pdf.addPage(); y = margin + 8; }
        // Cadre Observations (rempli papier au retour terrain)
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.obsRetourTerrain"), margin, y); y += 5;
        pdf.setDrawColor(150);
        pdf.rect(margin, y, pageW - 2 * margin, 60);
        y += 65;
        // Footer
        pdf.setFontSize(7); pdf.setTextColor(120);
        pdf.text(t("secours.pdf.genereLigne", { version: ((window.__MKM__ && window.__MKM__.build) || ""), date: new Date().toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }),
                 margin, pdf.internal.pageSize.getHeight() - 6);
      });
      const filename = "Secours_" + _slug(s.nom) + "_" + _shortDate() + ".pdf";
      pdf.save(filename);
      if (window.OOMGuard) {
        window.OOMGuard.showToast(t("secours.toast.pdfGenerePages", { n: s.groupes.length }), "info");
      }
      return filename;
    } catch(e) {
      console.warn("[SecoursMode] exporterPDF échoué :", e);
      if (window.OOMGuard) window.OOMGuard.showToast(t("secours.toast.erreurGenerationPdf", { message: e.message }), "error");
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
      _tracesZone(g).forEach(function(road) {
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
  // 🩸 29/09/2026 (audit Secours) — LE FOND DES PDF SECOURS SE RENDAIT EN TAILLE
  // RÉELLE : briefing à l'échelle 1 (16 332 × 13 820 = 226 Mpx, ~860 Mo de canvas),
  // mini-carte du rapport à 0,5 (56 Mpx, ~225 Mo). Au-delà de 16,7 Mpx, Safari iOS
  // refuse le canvas et le PDF sortait sans carte. On plafonne SOUS cette limite :
  // Contrepartie assumée (relecture R10) : une petite zone (< ~3 700 unités plan sur un
  // plan de 16 332 px) est agrandie jusqu'à ×3,8 dans son recadrage → fond moins net.
  const PX_MAX_CANVAS_PLAN = 16000000;
  function _echelleCanvasPlan(voulue) {
    const pl = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) || {};
    const w = Number(pl.imageWidth) || 0, h = Number(pl.imageHeight) || 0;
    if (!w || !h) return voulue;
    return Math.min(voulue, Math.sqrt(PX_MAX_CANVAS_PLAN / (w * h)));
  }
  // Échelle RÉELLE d'un canvas plan (mesurée, pas supposée).
  function _echelleDuCanvas(canvas) {
    const pl = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) || {};
    const w = Number(pl.imageWidth) || 0;
    return (w && canvas && canvas.width) ? canvas.width / w : 1;
  }

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
    // sx/sy/sw/sh en UNITÉS PLAN ; `r` les convertit en pixels du canvas réduit.
    const r = _echelleDuCanvas(fullCanvas);
    let sx = Math.max(0, bbox.x - pad);
    let sy = Math.max(0, bbox.y - pad);
    let sw = Math.min(fullCanvas.width / r  - sx, bbox.w + 2 * pad);
    let sh = Math.min(fullCanvas.height / r - sy, bbox.h + 2 * pad);
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
    ctx.drawImage(fullCanvas, sx * r, sy * r, sw * r, sh * r, 0, 0, out.width, out.height);

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
      ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.55)";
      ctx.lineWidth = 8;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      _tracesZone(g).forEach(function(road) {
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
      const lblEntree = t("secours.carte.entree");
      ctx.strokeText(lblEntree, c.x + 12, c.y);
      ctx.fillText(lblEntree, c.x + 12, c.y);
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
      const lbl = isBoucle ? t("secours.carte.boucle") : t("secours.carte.sortie");
      // Décale l'étiquette pour ne pas chevaucher celle de l'entrée si même point
      const dx = isBoucle ? 14 : 12;
      const dy = isBoucle ? 14 : 0;
      ctx.strokeText(lbl, c.x + dx, c.y + dy);
      ctx.fillText(lbl, c.x + dx, c.y + dy);
    }
    // 🆕 v1.23.5 — Mini-légende intégrée bas-droite, rend la carte auto-
    // explicative au terrain (le secouriste n'a pas à lire la doc app).
    // Liste uniquement les éléments effectivement présents pour cette équipe.
    _drawTeamLegende(ctx, out.width, out.height, g, hexColor);
    return out;
  }

  // 🆕 v1.23.5 — Dessine une mini-légende compacte dans le coin bas-droit
  // du canvas carte miniature. Lignes : carré couleur + libellé.
  // N'affiche QUE les éléments présents pour cette équipe (évite légende
  // inutile pleine d'items non utilisés).
  function _drawTeamLegende(ctx, canvasW, canvasH, g, hexColor) {
    const items = [];
    if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
      items.push({ type: "zone-poly", label: t("secours.legende.zonePolygone") });
    }
    if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds) && g.zoneRoadIds.length > 0) {
      items.push({ type: "zone-roads", label: t("secours.legende.zoneTraces") });
    }
    if (g.entree && typeof g.entree.x === "number") {
      items.push({ type: "entree", label: t("secours.legende.entree") });
    }
    if (g.sortie && typeof g.sortie.x === "number") {
      const isBoucle = _samePoint(g.entree, g.sortie);
      items.push({
        type:  isBoucle ? "boucle" : "sortie",
        label: isBoucle ? t("secours.legende.boucle") : t("secours.legende.sortie")
      });
    }
    if (Array.isArray(g.intermediaires) && g.intermediaires.length > 0) {
      items.push({ type: "interm", label: t("secours.legende.intermediaires", { n: g.intermediaires.length }) });
    }
    if (Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2) {
      items.push({ type: "iti", label: t("secours.legende.itineraire") });
    }
    if (items.length === 0) return;

    // Dimensions légende
    ctx.font = "11px sans-serif";
    const lineH = 16;
    const swatchW = 16;
    const swatchGap = 6;
    const pad = 8;
    let maxTextW = 0;
    items.forEach(function(it) {
      const w = ctx.measureText(it.label).width;
      if (w > maxTextW) maxTextW = w;
    });
    const boxW = pad + swatchW + swatchGap + maxTextW + pad;
    const boxH = pad + items.length * lineH + pad - 4;

    // Position bas-droite avec marge 8px
    const boxX = canvasW - boxW - 8;
    const boxY = canvasH - boxH - 8;

    // Background blanc semi-opaque + border léger
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.lineWidth = 1;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    // Items
    const rgb = _hexToRgb(hexColor);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    items.forEach(function(it, i) {
      const cy = boxY + pad + i * lineH + lineH / 2 - 2;
      const swX = boxX + pad;
      const swY = cy - 7;
      // Dessin du swatch selon type
      if (it.type === "zone-poly") {
        ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.30)";
        ctx.fillRect(swX, swY, swatchW, 14);
        ctx.strokeStyle = hexColor; ctx.lineWidth = 2;
        ctx.strokeRect(swX + 1, swY + 1, swatchW - 2, 12);
      } else if (it.type === "zone-roads") {
        ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.55)";
        ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(swX + 2, cy);
        ctx.lineTo(swX + swatchW - 2, cy);
        ctx.stroke();
      } else if (it.type === "iti") {
        ctx.strokeStyle = hexColor;
        ctx.lineWidth = 3; ctx.setLineDash([4, 3]); ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(swX + 1, cy);
        ctx.lineTo(swX + swatchW - 1, cy);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (it.type === "entree") {
        _drawTeamMarker(ctx, swX + swatchW / 2, cy, 5, "#00cc44", hexColor);
      } else if (it.type === "sortie") {
        _drawTeamMarker(ctx, swX + swatchW / 2, cy, 5, "#cc0000", hexColor);
      } else if (it.type === "boucle") {
        _drawTeamMarker(ctx, swX + swatchW / 2, cy, 6, "#ffaa00", hexColor);
      } else if (it.type === "interm") {
        _drawTeamMarker(ctx, swX + swatchW / 2, cy, 4, "#ffffff", hexColor);
      }
      // Label
      ctx.fillStyle = "#1a1f2e";
      ctx.fillText(it.label, swX + swatchW + swatchGap, cy);
    });
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
  // 29/09/2026 (KARMA) : « 🚪 SORTIE — x=15347 y=5085 niv=0 » ne dit rien à une
  // équipe ni aux pompiers. Quand le plan est géoréférencé (plan-config OU calage
  // saisi dans ⚙️ Réglages — même cascade que la Vue OSM), un point sans nom
  // s'AFFICHE en GPS. ⚠️ Affichage seulement : le libellé stocké reste _fmtPoint
  // (« x=… y=… niv=… »), car il sert d'identité aux étapes sans nom entre le PC et
  // les téléphones (appariement par libellé) — le changer casserait la fusion.
  function _transformGeoref() {
    const K = window.KmzExport;
    if (!K || typeof K.buildTransformCalib !== "function" || typeof K.planToGps !== "function") return null;
    const valide = function(g) {
      return !!(g && g.pointA && g.pointB && [g.pointA.x, g.pointA.y, g.pointA.lat, g.pointA.lng,
        g.pointB.x, g.pointB.y, g.pointB.lat, g.pointB.lng].every(Number.isFinite));
    };
    let g = window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.georef;
    if (!valide(g) && typeof K.getCalibration === "function") {
      g = K.getCalibration(window._currentLoadedPlanId || "default");
    }
    if (!valide(g)) return null;
    try { return K.buildTransformCalib(g); } catch(e) { return null; }
  }
  function _gpsTxt(x, y) {
    const tr = _transformGeoref();
    const ll = tr ? window.KmzExport.planToGps(tr, x, y) : null;
    return (ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng))
      ? ll.lat.toFixed(5) + ", " + ll.lng.toFixed(5) : null;
  }
  const RE_LBL_BRUT = /^x=(-?\d+(?:\.\d+)?) y=(-?\d+(?:\.\d+)?)(?: niv=(-?\d+))?$/;
  function _lblEtape(label) {
    const m = RE_LBL_BRUT.exec(String(label || ""));
    if (!m) return label;
    const g = _gpsTxt(Number(m[1]), Number(m[2]));
    return g ? "GPS " + g + (m[3] != null ? " " + t("secours.ctxImport.niv", { level: m[3] }) : "") : label;
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
      _toast(t("secours.toast.scenarioIntrouvable"), "error");
      return null;
    }
    if (!window.KmzExport || typeof window.KmzExport.genererKmz !== "function") {
      _toast(t("secours.toast.kmzModuleManquant"), "error");
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
        t("secours.toast.planNonCalibre"),
        "warn"
      );
      return null;
    }
    let transform;
    try {
      transform = window.KmzExport.buildTransformCalib(calib);   // 📐 v1.73.0 : pointC optionnel propagé (affine)
    } catch(e) {
      _toast(t("secours.toast.calibrageCorrompu", { message: e.message }), "error");
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
      _toast(t("secours.toast.calcAutoIti", { n: groupesACalc.length }), "info");
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

    _toast(t("secours.toast.generationKmz"), "info");
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
      planName:      (pc && pc.plan && pc.plan.name)    || t("secours.pdf.planDefault"),
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
        if (window.OOMGuard) window.OOMGuard.showToast(t("secours.toast.kmzEchouee"), "error");
        return;
      }
      const filename = "Secours_" + _slug(s.nom) + "_" + _shortDate() + ".kmz";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      if (window.OOMGuard) {
        window.OOMGuard.showToast(t("secours.toast.kmzExporte", { filename: filename }), "info");
      }
    }).catch(function(e) {
      console.warn("[SecoursMode] exporterKMZ échoué :", e);
      if (window.OOMGuard) window.OOMGuard.showToast(t("secours.toast.erreurKmz", { message: e.message }), "error");
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
    // 29/09/2026 (KARMA « retour rapide au module pour valider des étapes ») :
    // intervention en cours sur ce scénario → directement la vue LIVE, où l'on
    // valide les étapes (avant : l'éditeur, puis un toucher sur « reprendre »).
    const sOuvert = _currentScenarioId ? get(_currentScenarioId) : null;
    if (sOuvert && _estExecutionActive(sOuvert)) {
      _switchView("live");
    } else if (_currentScenarioId) {
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
    // 29/09/2026 (KARMA) : « j'ai lancé un plan, affecté à une équipe, je devrais
    // voir ma zone en mode carte avec mon tracé ». Fermer la fenêtre effaçait tout.
    // Intervention active → l'affichage reste (équipier : son équipe seule, filtre
    // de renderOverlay ; opérateur : toutes). reset() (changement de plan) nettoie.
    const enCours = _scenarioEnCours();
    if (enCours && window.map) {
      try { renderOverlay(enCours.id); } catch(e) { console.warn("[SecoursMode] overlay en cours :", e); }
    }
    _majFooterSecours();
    // 🐛 hotfix1 — Cleanup du setInterval timer (sinon fuite mémoire :
    // le timer continuait à tourner après fermeture modale sans plus
    // rien à update — _currentScenarioId=null + DOM modale retirée).
    _stopLiveTimer();
    // 🆕 v1.23.0 Feature D — Cleanup heatmap si encore active (l'user a
    // fermé la modale sans toggler off)
    if (_secoursHeatmapActive && window.MyKTAMapHeatmap
        && typeof window.MyKTAMapHeatmap.effacer === "function") {
      try { window.MyKTAMapHeatmap.effacer(); } catch(e) {}
      _secoursHeatmapActive = false;
    }
    // 🐛 v1.34.15 (Pack RAM #3) — Revoke des ObjectURL des photos Live
    // créées par _hydraterPhotosLive. Sans ce revoke, sortie de la modale
    // sans libérer les Blob backings → fuite RAM cumulative à chaque
    // ouverture/fermeture du Live.
    _revokeLivePhotoUrls();
  }

  function _onKeyDown(e) {
    if (e.key === "Escape" && _modal) fermer();
  }

  // Squelette HTML — header + corps (rempli dynamiquement par _switchView)
  function _renderModalHTML() {
    return '<div class="kta-readme-modal-boite kta-secours-modal-boite">' +
             '<div class="kta-readme-modal-header">' +
               '<span class="kta-readme-modal-titre">' + t("secours.modal.titre") + '</span>' +
               '<button class="kta-panneau-close" id="kta-secours-close" type="button" aria-label="' + _escAttr(t("secours.btn.fermerAria")) + '">&times;</button>' +
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

  // Bascule entre les 4 vues : "list" (scénarios) | "create" (stepper) |
  // "edit" (free-form) | "live" (mode terrain v1.24.0 Phase 3)
  function _switchView(view) {
    const corps = document.getElementById("kta-secours-corps");
    if (!corps) return;
    _activeView = view;  // 🆕 v1.29.0 C2 — tracker pour re-render après mutation phase
    if (view === "list")   corps.innerHTML = _renderListView();
    if (view === "create") corps.innerHTML = _renderCreateView();
    if (view === "edit")   corps.innerHTML = _renderEditView();
    if (view === "live")   corps.innerHTML = _renderLiveView();   // 🆕 v1.24.0 Phase 3
    _bindViewHandlers(view);
    // 🆕 v1.24.0 Phase 3 — Timer global pour rafraîchir l'affichage des durées
    // 🐛 hotfix1 (KARMA "le timer après avoir démarré doit continuer à
    // tourner même si modal secour fermer") : démarre le timer dès qu'une
    // execution est active sur le scénario courant, peu importe la vue
    // (live OU edit avec bandeau PLAN ACTIF). Avant : timer ne tournait
    // qu'en vue "live" → bandeau Edit affichait une durée stale.
    const s = _currentScenarioId ? get(_currentScenarioId) : null;
    const execActive = s && _estExecutionActive(s);
    if (view === "live" || execActive) _startLiveTimer();
    else                               _stopLiveTimer();
  }

  // 🆕 v1.24.0 Phase 3 — Timer global pour rafraîchir l'affichage des durées
  // dans la vue Live (header timer + dernière obs). 1 tick/sec.
  let _liveTimerId = null;
  function _startLiveTimer() {
    _stopLiveTimer();
    _liveTimerId = setInterval(_majLiveTimers, 1000);
  }
  function _stopLiveTimer() {
    if (_liveTimerId) {
      clearInterval(_liveTimerId);
      _liveTimerId = null;
    }
  }
  // Met à jour uniquement les nœuds DOM marqués data-live-timer (sans
  // re-render complet de la vue, évite les flash + perte focus dans
  // textarea observations en cours de saisie).
  function _majLiveTimers() {
    if (!_currentScenarioId) return;
    const dureeMs = getExecutionDureeMs(_currentScenarioId);
    const dureeStr = _formatDureeMs(dureeMs);
    document.querySelectorAll('[data-live-timer="duree"]').forEach(function(el) {
      el.textContent = dureeStr;
    });
  }

  // ============================================================
  // VUE LISTE — scénarios existants + bouton "Nouveau"
  // ============================================================
  function _renderListView() {
    let html = '<div class="kta-secours-list-header">' +
                 '<p class="kta-secours-hint">' +
                   t("secours.list.intro") +
                 '</p>' +
                 '<div class="kta-secours-list-header-actions">' +
                   '<button class="kta-btn kta-btn-primary" data-action="new-scenario">' +
                     t("secours.list.btnNouveau") +
                   '</button>' +
                   '<button class="kta-btn kta-btn-secondary" data-action="import-mkmsec" title="' + _escAttr(t("secours.list.btnImporterTitle")) + '">' +
                     t("secours.list.btnImporter") +
                   '</button>' +
                   /* ⛔ Phase 4 (QR Share) ROLLBACK hotfix17 — bouton retiré.
                      Le partage briefings se fait désormais 100% via .mkmsec.json
                      (cf bouton "📥 Importer un plan" ci-dessus). */
                 '</div>' +
               '</div>';
    if (_scenarios.length === 0) {
      html += '<div class="kta-secours-empty">' +
                '<div class="kta-secours-empty-icon">🚨</div>' +
                '<p>' + t("secours.list.emptyTitre") + '</p>' +
                '<p class="kta-secours-empty-hint">' + t("secours.list.emptyHint") + '</p>' +
              '</div>';
    } else {
      html += '<div class="kta-secours-list">';
      // Tri par updatedAt DESC (le plus récent en haut)
      const sorted = _scenarios.slice().sort(function(a, b) {
        return (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0);
      });
      sorted.forEach(function(s) {
        const nbGroupes = (s.groupes || []).length;
        const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString(window.ktaLocale ? window.ktaLocale() : "fr-FR") : "?";
        html += '<div class="kta-secours-list-row" data-id="' + _escAttr(s.id) + '">' +
                  '<div class="kta-secours-list-info">' +
                    '<div class="kta-secours-list-nom">' + _escHtml(s.nom) + '</div>' +
                    '<div class="kta-secours-list-meta">' +
                      t("secours.list.metaEquipes", { n: nbGroupes }) +
                      ' · 📅 ' + date +
                    '</div>' +
                  '</div>' +
                  '<div class="kta-secours-list-actions">' +
                    '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="open-scenario" data-id="' + _escAttr(s.id) + '" title="' + _escAttr(t("secours.list.ouvrirTitle")) + '">' + t("secours.btn.ouvrir") + '</button>' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="dup-scenario" data-id="' + _escAttr(s.id) + '" title="' + _escAttr(t("secours.list.dupliquerTitle")) + '">🗐</button>' +
                    '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="del-scenario" data-id="' + _escAttr(s.id) + '" title="' + _escAttr(t("secours.list.supprimerTitle")) + '">🗑️</button>' +
                  '</div>' +
                '</div>';
      });
      html += '</div>';
      if (_scenarios.length >= MAX_SCENARIOS) {
        html += '<p class="kta-secours-hint" style="margin-top:12px; color:#ff8c00;">' +
                  t("secours.list.limiteAtteinte", { max: MAX_SCENARIOS }) +
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
             '<h3 class="kta-secours-form-titre">' + t("secours.create.titre") + '</h3>' +
             '<div class="kta-secours-form-row">' +
               '<label for="kta-sec-create-nom">' + t("secours.create.nomLabel") + '</label>' +
               '<input type="text" id="kta-sec-create-nom" placeholder="' + _escAttr(t("secours.create.nomPlaceholder")) + '" maxlength="80">' +
             '</div>' +
             '<div class="kta-secours-form-row">' +
               '<label for="kta-sec-create-notes">' + t("secours.create.notesLabel") + '</label>' +
               '<textarea id="kta-sec-create-notes" rows="3" maxlength="500" placeholder="' + _escAttr(t("secours.create.notesPlaceholder")) + '"></textarea>' +
             '</div>' +
             '<div class="kta-secours-form-row">' +
               '<label for="kta-sec-create-incident">' + t("secours.create.incidentLabel") + '</label>' +
               '<input type="datetime-local" id="kta-sec-create-incident">' +
             '</div>' +
             '<div class="kta-secours-form-hint">' +
               t("secours.create.hint") +
             '</div>' +
             '<div class="kta-secours-form-actions">' +
               '<button class="kta-btn kta-btn-ghost" data-action="cancel-create">' + t("secours.btn.annuler") + '</button>' +
               '<button class="kta-btn kta-btn-primary" data-action="confirm-create">' + t("secours.btn.creerContinuer") + '</button>' +
             '</div>' +
           '</div>';
  }

  // ============================================================
  // VUE ÉDITION — free-form editor (3 sections : Contexte / Équipes / Export)
  // ============================================================
  // 🆕 v1.29.0 C2 — Section "📋 Phases" pour la vue Edit.
  // KARMA C2.2:c — bouton "➕ Ajouter une phase" toujours présent en Edit.
  // Si 1 seule phase → hint + bouton. Si 2+ phases → liste éditable.
  // La phase 0 n'est jamais supprimable depuis l'UI (filet vs _migration).
  function _renderPhasesSection(s) {
    if (!s || !Array.isArray(s.phases)) return "";
    const nbPhases = s.phases.length;
    const execActive = !!(s.execution && s.execution.active === true);
    const currentIdx = (s.execution && typeof s.execution.currentPhaseIdx === "number")
                       ? s.execution.currentPhaseIdx : 0;
    let html = '<details class="kta-secours-section"' + (nbPhases >= 2 ? ' open' : '') + '>' +
                 '<summary class="kta-secours-section-titre">' + t("secours.phases.sectionTitre", { n: nbPhases }) + '</summary>' +
                 '<div class="kta-secours-section-body">';
    if (nbPhases <= 1) {
      // 1 phase → juste un hint + bouton
      html += '<p class="kta-secours-hint">' +
                t("secours.phases.hint1") +
              '</p>' +
              '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="add-phase">' +
                t("secours.phases.btnAjouter") +
              '</button>';
    } else {
      // 2+ phases → liste éditable
      html += '<div class="kta-secours-phases-list">';
      s.phases.forEach(function(p, i) {
        const isActive = (execActive && i === currentIdx);
        const isStarted = !!p.startedAt;
        const isEnded = !!p.endedAt;
        const nbEquipes = (Array.isArray(p.groupeIds) ? p.groupeIds.length : 0);
        let statutLabel = '';
        if (isEnded) statutLabel = '<span class="kta-secours-phase-status-end">' + t("secours.phases.statutTerminee") + '</span>';
        else if (isActive) statutLabel = '<span class="kta-secours-phase-status-active">' + t("secours.phases.statutActive") + '</span>';
        else if (isStarted) statutLabel = '<span class="kta-secours-phase-status-paused">' + t("secours.phases.statutDemarree") + '</span>';
        else statutLabel = '<span class="kta-secours-phase-status-pending">' + t("secours.phases.statutNonDemarree") + '</span>';
        // Bouton supprimer désactivé si phase active, démarrée, ou si c'est la seule
        const canDelete = !isActive && !isStarted;
        const delTitle = isActive ? t("secours.phases.delTitleActive")
                       : isStarted ? t("secours.phases.delTitleStarted")
                       : t("secours.phases.delTitleDefault");
        html += '<div class="kta-secours-phase-row" data-phase-idx="' + i + '">' +
                  '<div class="kta-secours-phase-row-head">' +
                    '<span class="kta-secours-phase-row-icon">📋</span>' +
                    '<span class="kta-secours-phase-row-nom"><strong>' + _escHtml(p.nom) + '</strong></span>' +
                    statutLabel +
                  '</div>' +
                  '<div class="kta-secours-phase-row-meta">' +
                    t("secours.phases.equipesAssignees", { n: nbEquipes }) +
                  '</div>' +
                  '<div class="kta-secours-phase-row-actions">' +
                    '<button class="kta-btn kta-btn-secondary kta-btn-xs" data-action="edit-phase" data-phase-idx="' + i + '" title="' + _escAttr(t("secours.phases.editTitle")) + '">' +
                      t("secours.btn.editer") +
                    '</button>' +
                    '<button class="kta-btn kta-btn-danger kta-btn-xs" data-action="delete-phase" data-phase-idx="' + i + '"' +
                      (canDelete ? '' : ' disabled') + ' title="' + _escAttr(delTitle) + '">' +
                      '🗑️' +
                    '</button>' +
                  '</div>' +
                '</div>';
      });
      html += '</div>' +
              '<div style="margin-top:10px;">' +
                '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="add-phase">' +
                  t("secours.phases.btnAjouter") +
                '</button>' +
              '</div>';
    }
    html += '</div></details>';
    return html;
  }

  // 🆕 v1.29.0 C2 — Modale création / édition d'une phase. Format :
  //   - Input texte pour le nom (par défaut "Phase N+1")
  //   - Liste de checkboxes pour les équipes participantes (modèle hybride 1:c)
  //   - 2 boutons : Annuler / ✓ Valider
  // editPhaseIdx = null → création · = number → édition
  function _afficherModalePhase(scenarioId, editPhaseIdx) {
    const s = get(scenarioId);
    if (!s) return;
    const isEdit = (typeof editPhaseIdx === "number");
    const existingPhase = isEdit ? s.phases[editPhaseIdx] : null;
    if (isEdit && !existingPhase) {
      _toast(t("secours.toast.phaseIntrouvable"), "error");
      return;
    }
    // Cleanup d'une modale précédente (DOM + listener Esc orphelin v1.43.26)
    const oldModal = document.getElementById("kta-secours-phase-modal");
    if (oldModal) oldModal.remove();
    if (_phaseModalEsc) {
      document.removeEventListener("keydown", _phaseModalEsc);
      _phaseModalEsc = null;
    }

    const defaultNom = isEdit ? existingPhase.nom : t("secours.phaseModal.defaultNom", { n: (s.phases.length + 1) });
    const initialGroupeIds = isEdit ? (existingPhase.groupeIds || []).slice() : [];

    const titre = isEdit ? t("secours.phaseModal.titreEdit") : t("secours.phaseModal.titreCreate");

    // 🐛 v1.29.0-fix1 — Classe kta-secours-sub-modal pour z-index 100050
    // (au-dessus de la modale Mode Secours principale à 99999).
    let html = '<div class="kta-readme-modal-overlay kta-secours-sub-modal" id="kta-secours-phase-modal">' +
                 '<div class="kta-readme-modal-boite" style="max-width:520px;height:auto;max-height:90vh;">' +
                   '<div class="kta-readme-modal-header">' +
                     '<span class="kta-readme-modal-titre">' + titre + '</span>' +
                     '<button class="kta-panneau-close" data-action="close-phase-modal">✕</button>' +
                   '</div>' +
                   '<div class="kta-readme-modal-corps" style="padding:14px 18px;">' +
                     '<div class="kta-secours-form-row">' +
                       '<label for="kta-sec-phase-nom"><strong>' + t("secours.phaseModal.nomLabel") + '</strong></label>' +
                       '<input type="text" id="kta-sec-phase-nom" maxlength="80" value="' + _escAttr(defaultNom) + '" placeholder="' + _escAttr(t("secours.phaseModal.nomPlaceholder")) + '" style="width:100%;">' +
                     '</div>' +
                     '<div style="margin-top:14px;">' +
                       '<label><strong>' + t("secours.phaseModal.equipesLabel") + '</strong></label>' +
                       '<p class="kta-secours-hint" style="margin:4px 0 8px;">' +
                         t("secours.phaseModal.equipesHint") +
                       '</p>';
    if (s.groupes.length === 0) {
      html += '<p class="kta-secours-hint" style="color:#f4c542;">' + t("secours.phaseModal.aucuneEquipe") + '</p>';
    } else {
      html += '<div class="kta-secours-phase-equipes-list">';
      s.groupes.forEach(function(g) {
        const checked = initialGroupeIds.indexOf(g.id) !== -1;
        const couleur = PALETTE[g.couleurIdx % PALETTE.length] || PALETTE[0];
        html += '<label class="kta-secours-phase-equipe-cb">' +
                  '<input type="checkbox" data-equipe-id="' + g.id + '"' + (checked ? ' checked' : '') + '>' +
                  '<span class="kta-secours-phase-equipe-swatch" style="background:' + couleur.hex + ';"></span>' +
                  '<span class="kta-secours-phase-equipe-nom">' + _escHtml(g.nom) + '</span>' +
                  (typeof g.level === "number" ? ' <span class="kta-secours-phase-equipe-level">' + t("secours.phaseModal.nivChip", { level: g.level }) + '</span>' : '') +
                '</label>';
      });
      html += '</div>';
    }
    html += '</div>' +
                   '</div>' +
                   '<div class="kta-readme-modal-footer" style="display:flex; gap:8px; justify-content:flex-end; padding:12px 18px; border-top:1px solid rgba(255,255,255,0.08);">' +
                     '<button class="kta-btn kta-btn-ghost" data-action="cancel-phase-modal">' + t("secours.btn.annulerSimple") + '</button>' +
                     '<button class="kta-btn kta-btn-primary" data-action="confirm-phase-modal" data-edit-idx="' + (isEdit ? editPhaseIdx : "") + '">' +
                       (isEdit ? t("secours.btn.enregistrer") : t("secours.btn.creerPhase")) +
                     '</button>' +
                   '</div>' +
                 '</div>' +
               '</div>';
    // 🐛 v1.29.0-fix1 — attache à <html> (pas à <body>) pour passer AU-DESSUS
    // de la modale Mode Secours principale (qui est sibling de body, attachée
    // ligne 4800 via documentElement.appendChild). Sinon mes modales secondaires
    // sont dans body donc rendues AVANT la modale Secours principale → cachées.
    document.documentElement.insertAdjacentHTML("beforeend", html);
    const modal = document.getElementById("kta-secours-phase-modal");
    if (!modal) return;

    // Focus auto sur le champ nom
    const nomInput = modal.querySelector("#kta-sec-phase-nom");
    if (nomInput) {
      nomInput.focus();
      nomInput.select();
    }

    function _closeModal() {
      if (modal && modal.parentNode) modal.remove();
      document.removeEventListener("keydown", _onEsc);
      // 🆕 v1.43.26 — Libère la ref module si c'est bien NOTRE listener.
      if (_phaseModalEsc === _onEsc) _phaseModalEsc = null;
    }
    function _onEsc(e) { if (e.key === "Escape") _closeModal(); }
    _phaseModalEsc = _onEsc;
    document.addEventListener("keydown", _onEsc);

    // Backdrop click = annuler
    modal.addEventListener("click", function(e) {
      if (e.target === modal) _closeModal();
    });

    // Handlers boutons
    modal.addEventListener("click", function(e) {
      const action = e.target.getAttribute && e.target.getAttribute("data-action");
      if (!action) return;
      if (action === "close-phase-modal" || action === "cancel-phase-modal") {
        _closeModal();
      } else if (action === "confirm-phase-modal") {
        const nom = nomInput ? nomInput.value.trim() : "";
        if (!nom) {
          _toast(t("secours.toast.phaseNomObligatoire"), "error");
          if (nomInput) nomInput.focus();
          return;
        }
        // Récupère les équipes cochées
        const cbs = modal.querySelectorAll('input[type="checkbox"][data-equipe-id]');
        const selectedIds = [];
        cbs.forEach(function(cb) {
          if (cb.checked) selectedIds.push(cb.getAttribute("data-equipe-id"));
        });
        if (isEdit) {
          renommerPhase(scenarioId, editPhaseIdx, nom);
          // Sync participation : on parcourt TOUTES les équipes du scénario
          // et on aligne avec les checkboxes.
          s.groupes.forEach(function(g) {
            const wantParticipate = selectedIds.indexOf(g.id) !== -1;
            affecterEquipeAPhase(scenarioId, g.id, editPhaseIdx, wantParticipate);
          });
          _toast(t("secours.toast.phaseMaj", { nom: nom }), "info");
        } else {
          const created = creerPhase(scenarioId, nom, selectedIds);
          if (created) {
            _toast(t("secours.toast.phaseCreee", { nom: nom }), "info");
          } else {
            _toast(t("secours.toast.phaseEchecCreation"), "error");
          }
        }
        _closeModal();
        // Re-render la vue active pour refléter la nouvelle phase
        if (_modal && _activeView) _switchView(_activeView);
      }
    });
  }

  // 🆕 v1.29.0 C3 — Modale "📝 Debrief de la phase". Affichée depuis
  // (a) le bouton "✓ Phase terminée" du footer Live Op
  // (b) le toast auto-détection "phase prête à clore" (KARMA C3.2:c)
  //
  // Flow :
  //  1. Textarea pour debrief libre (5000 chars max)
  //  2. Boutons : Annuler / "✓ Terminer la phase"
  //  3. Si terminer + il existe une phase suivante → enchaîne sur modale
  //     "🚀 Lancer la phase suivante ?"
  //  4. Si terminer + pas de phase suivante → confirme arrêt complet ?
  function _afficherModaleDebrief(scenarioId) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.active) return;
    if (!Array.isArray(s.phases)) return;
    const phaseIdx = s.execution.currentPhaseIdx || 0;
    const phase = s.phases[phaseIdx];
    if (!phase) return;

    // Cleanup d'une modale précédente
    const oldModal = document.getElementById("kta-secours-debrief-modal");
    if (oldModal) oldModal.remove();

    const aSuivante = (phaseIdx + 1 < s.phases.length);
    const nextPhase = aSuivante ? s.phases[phaseIdx + 1] : null;
    const equipesActuelles = _listerEquipesPhase(s, phaseIdx);
    const equipesSuivantes = nextPhase ? _listerEquipesPhase(s, phaseIdx + 1) : [];

    const existingDebrief = phase.debrief || "";

    let html = '<div class="kta-readme-modal-overlay kta-secours-sub-modal" id="kta-secours-debrief-modal">' +
                 '<div class="kta-readme-modal-boite" style="max-width:600px;height:auto;max-height:90vh;">' +
                   '<div class="kta-readme-modal-header">' +
                     '<span class="kta-readme-modal-titre">' + t("secours.debrief.titre", { phase: _escHtml(phase.nom) }) + '</span>' +
                     '<button class="kta-panneau-close" data-action="close-debrief-modal">✕</button>' +
                   '</div>' +
                   '<div class="kta-readme-modal-corps" style="padding:14px 18px;">' +
                     '<p class="kta-secours-hint" style="margin-top:0;">' +
                       t("secours.debrief.intro") +
                     '</p>' +
                     '<div class="kta-secours-form-row">' +
                       '<label for="kta-sec-debrief-text"><strong>' + t("secours.debrief.notesLabel") + '</strong>' +
                         ' <span class="kta-secours-hint" style="font-weight:normal;">' + t("secours.debrief.notesHint") + '</span>' +
                       '</label>' +
                       '<textarea id="kta-sec-debrief-text" rows="8" maxlength="5000" style="width:100%;box-sizing:border-box;" placeholder="' + _escAttr(t("secours.debrief.placeholder")) + '">' + _escHtml(existingDebrief) + '</textarea>' +
                     '</div>' +
                     '<div class="kta-secours-debrief-equipes" style="margin-top:14px;">' +
                       '<div style="font-size:13px;color:#8892a4;margin-bottom:6px;">' +
                         '<strong>' + t("secours.debrief.equipesActuelles", { n: equipesActuelles.length }) + '</strong>' +
                       '</div>' +
                       '<div style="font-size:12px;color:#a8b3c8;">' +
                         (equipesActuelles.length > 0
                           ? equipesActuelles.map(function(g) { return _escHtml(g.nom); }).join(" · ")
                           : '<em>' + t("secours.debrief.aucuneEquipe") + '</em>') +
                       '</div>';
    if (aSuivante) {
      html += '<div style="margin-top:10px;padding:10px;background:rgba(140,180,255,0.10);border-left:3px solid rgba(140,180,255,0.55);border-radius:4px;">' +
                '<div class="kta-tx-info" style="font-size:13px;color:#8cb4ff;margin-bottom:4px;">' +
                  '➡️ <strong>' + t("secours.debrief.phaseSuivante") + '</strong> ' + _escHtml(nextPhase.nom) +
                '</div>' +
                '<div style="font-size:12px;color:#a8b3c8;">' +
                  t("secours.debrief.equipesAssignees", { n: equipesSuivantes.length }) + ' ' +
                  (equipesSuivantes.length > 0
                    ? equipesSuivantes.map(function(g) { return _escHtml(g.nom); }).join(" · ")
                    : '<em>' + t("secours.debrief.aucuneEquipeSuivante") + '</em>') +
                '</div>' +
              '</div>';
    } else {
      html += '<div style="margin-top:10px;padding:10px;background:rgba(244,197,66,0.10);border-left:3px solid rgba(244,197,66,0.55);border-radius:4px;font-size:12px;color:#f4c542;">' +
                t("secours.debrief.pasDeSuivante") +
              '</div>';
    }
    html += '</div></div>' +
                   '<div class="kta-readme-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;border-top:1px solid rgba(255,255,255,0.08);">' +
                     '<button class="kta-btn kta-btn-ghost" data-action="cancel-debrief-modal">' + t("secours.btn.annulerSimple") + '</button>' +
                     '<button class="kta-btn kta-btn-primary" data-action="confirm-debrief-modal">' +
                       (aSuivante ? t("secours.btn.terminerPhase") : t("secours.btn.terminerPlan")) +
                     '</button>' +
                   '</div>' +
                 '</div>' +
               '</div>';
    // 🐛 v1.29.0-fix1 — attache à <html> (pas à <body>) pour passer AU-DESSUS
    // de la modale Mode Secours principale (qui est sibling de body, attachée
    // ligne 4800 via documentElement.appendChild). Sinon mes modales secondaires
    // sont dans body donc rendues AVANT la modale Secours principale → cachées.
    document.documentElement.insertAdjacentHTML("beforeend", html);
    const modal = document.getElementById("kta-secours-debrief-modal");
    if (!modal) return;
    const textArea = modal.querySelector("#kta-sec-debrief-text");
    if (textArea) textArea.focus();

    // 🆕 v1.43.26 — Pattern A : helper mutualisé _bindSubModalEsc()
    function _closeModal() {
      if (modal && modal.parentNode) modal.remove();
      _unbindEsc();
    }
    const _unbindEsc = _bindSubModalEsc(_closeModal);
    modal.addEventListener("click", function(e) { if (e.target === modal) _closeModal(); });

    modal.addEventListener("click", function(e) {
      const action = e.target.getAttribute && e.target.getAttribute("data-action");
      if (!action) return;
      if (action === "close-debrief-modal" || action === "cancel-debrief-modal") {
        _closeModal();
      } else if (action === "confirm-debrief-modal") {
        const debriefText = textArea ? textArea.value : "";
        // 1. Termine la phase actuelle (archive + endedAt + debrief)
        terminerPhase(scenarioId, { debrief: debriefText });
        _closeModal();
        if (aSuivante) {
          // 2a. Enchaîne sur "Lancer phase suivante ?" via une 2e modale courte
          _afficherModaleLancerPhaseSuivante(scenarioId);
        } else {
          // 2b. Pas de phase suivante → propose d'arrêter complètement
          if (window.confirm(t("secours.debrief.confirmArret", { phase: phase.nom }))) {
            arreterExecution(scenarioId);
            _toast(t("secours.toast.planTermine"), "info");
          } else {
            _toast(t("secours.toast.phaseTermineeManuel", { phase: phase.nom }), "info");
          }
          if (_activeView) _switchView(_activeView);
        }
      }
    });
  }

  // 🆕 v1.29.0 C3 — Mini-modale "🚀 Lancer la phase suivante ?" enchaînée
  // après le debrief. Affiche un récap de la phase qui va démarrer + 2
  // boutons (Plus tard / Démarrer).
  function _afficherModaleLancerPhaseSuivante(scenarioId) {
    const s = get(scenarioId);
    if (!s || !s.execution) return;
    const currentIdx = s.execution.currentPhaseIdx || 0;
    const nextIdx = currentIdx + 1;
    if (nextIdx >= s.phases.length) return;
    const nextPhase = s.phases[nextIdx];
    if (!nextPhase) return;
    const equipes = _listerEquipesPhase(s, nextIdx);

    const oldModal = document.getElementById("kta-secours-launchnext-modal");
    if (oldModal) oldModal.remove();

    let html = '<div class="kta-readme-modal-overlay kta-secours-sub-modal" id="kta-secours-launchnext-modal">' +
                 '<div class="kta-readme-modal-boite" style="max-width:480px;height:auto;max-height:90vh;">' +
                   '<div class="kta-readme-modal-header">' +
                     '<span class="kta-readme-modal-titre">' + t("secours.launchNext.titre") + '</span>' +
                     '<button class="kta-panneau-close" data-action="close-launchnext">✕</button>' +
                   '</div>' +
                   '<div class="kta-readme-modal-corps" style="padding:14px 18px;">' +
                     '<div style="margin-bottom:12px;">' +
                       '<div style="font-size:15px;color:#e8eaf0;margin-bottom:6px;">' +
                         '<strong>' + _escHtml(nextPhase.nom) + '</strong>' +
                       '</div>' +
                       '<div style="font-size:13px;color:#8892a4;">' +
                         t("secours.launchNext.equipesParticipantes", { n: equipes.length }) +
                       '</div>' +
                     '</div>';
    if (equipes.length === 0) {
      html += '<div style="padding:10px;background:rgba(244,197,66,0.10);border-left:3px solid rgba(244,197,66,0.55);border-radius:4px;font-size:12px;color:#f4c542;">' +
                t("secours.launchNext.aucuneEquipe") +
              '</div>';
    } else {
      html += '<div style="font-size:12px;color:#a8b3c8;margin-bottom:6px;">' + t("secours.launchNext.equipesLabel") + '</div>' +
              '<div style="font-size:13px;color:#e8eaf0;">' +
                equipes.map(function(g) {
                  const couleur = PALETTE[g.couleurIdx % PALETTE.length] || PALETTE[0];
                  return '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;">' +
                           '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + couleur.hex + ';"></span>' +
                           _escHtml(g.nom) +
                         '</span>';
                }).join("") +
              '</div>' +
              '<p class="kta-secours-hint" style="margin-top:10px;">' +
                t("secours.launchNext.hint") +
              '</p>';
    }
    html += '</div>' +
                   '<div class="kta-readme-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;border-top:1px solid rgba(255,255,255,0.08);">' +
                     '<button class="kta-btn kta-btn-ghost" data-action="cancel-launchnext">' + t("secours.btn.plusTard") + '</button>' +
                     '<button class="kta-btn kta-btn-primary" data-action="confirm-launchnext"' + (equipes.length === 0 ? ' disabled' : '') + '>' +
                       t("secours.btn.demarrerPhase", { phase: _escHtml(nextPhase.nom) }) +
                     '</button>' +
                   '</div>' +
                 '</div>' +
               '</div>';
    // 🐛 v1.29.0-fix1 — attache à <html> (pas à <body>) pour passer AU-DESSUS
    // de la modale Mode Secours principale (qui est sibling de body, attachée
    // ligne 4800 via documentElement.appendChild). Sinon mes modales secondaires
    // sont dans body donc rendues AVANT la modale Secours principale → cachées.
    document.documentElement.insertAdjacentHTML("beforeend", html);
    const modal = document.getElementById("kta-secours-launchnext-modal");
    if (!modal) return;

    // 🆕 v1.43.26 — Pattern A : helper mutualisé _bindSubModalEsc()
    function _closeModal() {
      if (modal && modal.parentNode) modal.remove();
      _unbindEsc();
      // Quoi qu'il arrive, re-render la vue pour refléter la nouvelle phase
      // (si lancée) ou l'état "phase terminée" en attente.
      if (_activeView) _switchView(_activeView);
    }
    const _unbindEsc = _bindSubModalEsc(_closeModal);
    modal.addEventListener("click", function(e) { if (e.target === modal) _closeModal(); });

    modal.addEventListener("click", function(e) {
      const action = e.target.getAttribute && e.target.getAttribute("data-action");
      if (!action) return;
      if (action === "close-launchnext" || action === "cancel-launchnext") {
        _toast(t("secours.toast.phaseTermineePret"), "info");
        _closeModal();
      } else if (action === "confirm-launchnext") {
        const launched = lancerPhaseSuivante(scenarioId);
        if (launched) {
          _toast(t("secours.toast.phaseDemarree", { nom: launched.nom }), "info");
        } else {
          _toast(t("secours.toast.phaseEchecLancement"), "error");
        }
        _closeModal();
      }
    });
  }

  function _renderEditView() {
    const s = get(_currentScenarioId);
    if (!s) {
      return '<div class="kta-secours-error">' +
               '<p>' + t("secours.edit.scenarioIntrouvableListe") + '</p>' +
             '</div>';
    }
    const incidentStr = s.context && s.context.incidentAt
                        ? new Date(s.context.incidentAt).toISOString().slice(0, 16)
                        : "";
    let html = '<div class="kta-secours-edit-header">' +
                 '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="back-to-list">' + t("secours.btn.liste") + '</button>' +
                 '<input type="text" class="kta-secours-edit-titre" id="kta-sec-edit-nom" value="' + _escAttr(s.nom) + '" maxlength="80">' +
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="toggle-overlay" id="kta-sec-toggle-overlay" title="' + _escAttr(t("secours.edit.toggleOverlayTitle")) + '">' +
                   (_overlayLayer ? t("secours.edit.masquer") : t("secours.edit.voirCarte")) +
                 '</button>' +
               '</div>';

    // 🆕 v1.24.0 Phase 3 — Bandeau "Lancer le plan" / "Plan actif".
    // Si execution active → bandeau vert avec bouton "Reprendre la vue Live"
    //                       + bouton "Arrêter le plan"
    // Sinon                → bouton CTA jaune "🚀 Lancer le plan de secours"
    html += _renderLancerBandeau(s);

    // Section 1 — Contexte
    html += '<details class="kta-secours-section" open>' +
              '<summary class="kta-secours-section-titre">' + t("secours.edit.contexteTitre") + '</summary>' +
              '<div class="kta-secours-section-body">' +
                '<div class="kta-secours-form-row">' +
                  '<label for="kta-sec-edit-incident">' + t("secours.edit.heureIncident") + '</label>' +
                  '<input type="datetime-local" id="kta-sec-edit-incident" value="' + _escAttr(incidentStr) + '">' +
                '</div>' +
                '<div class="kta-secours-form-row">' +
                  '<label for="kta-sec-edit-notes">' + t("secours.edit.notes") + '</label>' +
                  '<textarea id="kta-sec-edit-notes" rows="3" maxlength="500">' + _escHtml(s.context.notes || "") + '</textarea>' +
                '</div>' +
                // 🆕 v1.23.0 Phase 2 / Feature C — Affichage du lastKnownPoint
                // + zoneIncertitude si pré-rempli depuis Lost Mode.
                _renderContextImportedBlock(s) +
                // 🆕 v1.23.0 Phase 2 / Feature D — Toggle Heatmap pour visualiser
                // les zones probables d'activité (timeline tracker + annotations).
                _renderHeatmapToolBlock() +
                // 🆕 v1.23.6 — Réglage de la pause par point (partage avec
                // l'itinéraire principal — cf interface.js > _getItiPauseEnabled
                // + _getItiPauseMinutes). Au change → recalcul auto des durées
                // estimées de toutes les équipes du scénario.
                _renderPauseToolBlock() +
              '</div>' +
            '</details>';

    // Section 2 — Équipes (liste + add)
    // 🆕 v1.23.0 Phase 2 / Feature E — Bouton auto-creation par niveau si M-LVL
    const mlvlActive = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const availableLevels = mlvlActive ? _niveauxPourEquipesAuto() : [];
    const autoMLVLBtn = (mlvlActive && availableLevels.length > 1)
      ? '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="auto-equipes-mlvl" ' +
        'title="' + _escAttr(t("secours.edit.autoMlvlTitle", { n: availableLevels.length })) + '">' +
        t("secours.edit.autoMlvlBtn", { n: availableLevels.length }) + '</button>'
      : '';
    html += '<details class="kta-secours-section" open>' +
              '<summary class="kta-secours-section-titre">' + t("secours.edit.equipesTitre", { n: s.groupes.length }) + '</summary>' +
              '<div class="kta-secours-section-body">' +
                '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
                  '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="add-groupe">' + t("secours.edit.btnAjouterEquipe") + '</button>' +
                  autoMLVLBtn +
                  (s.groupes.length > 1
                    ? '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="toggle-toutes-equipes">' +
                        (s.groupes.every(function(g) { return _estRepliee(g.id); })
                          ? t("secours.edit.toutDeplier") : t("secours.edit.toutReplier")) + '</button>'
                    : '') +
                '</div>' +
                '<div class="kta-secours-groupes-list" style="margin-top:10px;">' +
                  _renderGroupesList(s) +
                '</div>' +
              '</div>' +
            '</details>';

    // 🆕 v1.29.0 C2 — Section Phases. Toujours présente, mais le contenu
    // s'adapte : 1 seule phase = juste le bouton "➕ Ajouter une phase" en hint
    // (pas de liste à afficher). 2+ phases = liste avec ✏️ / 🗑️.
    // KARMA C2.2:c — bouton "➕" présent en vue Edit (planification) ET en
    // vue Live Op (création à chaud, ajouté dans _renderLiveViewOperateur).
    html += _renderPhasesSection(s);

    // Section 3 — Export
    html += '<details class="kta-secours-section">' +
              '<summary class="kta-secours-section-titre">' + t("secours.edit.exportTitre") + '</summary>' +
              '<div class="kta-secours-section-body">' +
                '<p class="kta-secours-hint">' + t("secours.edit.exportHint") + '</p>' +
                '<div class="kta-secours-export-actions">' +
                  '<button class="kta-btn kta-btn-primary" data-action="export-pdf">' + t("secours.edit.exportPdf") + '</button>' +
                  '<button class="kta-btn kta-btn-primary" data-action="export-kmz">' + t("secours.edit.exportKmz") + '</button>' +
                  // 🆕 v1.23.4 — Export scénario standalone .mkmsec.json
                  '<button class="kta-btn kta-btn-secondary" data-action="export-mkmsec" title="' + _escAttr(t("secours.edit.exportMkmsecTitle")) + '">' + t("secours.edit.exportMkmsec") + '</button>' +
                '</div>' +
              '</div>' +
            '</details>';

    return html;
  }

  // Rendu de la liste des équipes (utilisé par _renderEditView)
  function _renderGroupesList(scenario) {
    if (!scenario.groupes || scenario.groupes.length === 0) {
      return '<div class="kta-secours-empty-small">' + t("secours.edit.aucuneEquipeListe") + '</div>';
    }
    let html = '';
    scenario.groupes.forEach(function(g) {
      const couleur = PALETTE[g.couleurIdx % PALETTE.length];
      const distFmt = g.distanceM
                      ? (typeof window.formatDistance === "function"
                         ? window.formatDistance(g.distanceM, 0)
                         : Math.round(g.distanceM) + " m")
                      : "—";
      const dureeFmt = g.dureeEstimeeMin ? t("secours.groupe.dureeMin", { n: Math.round(g.dureeEstimeeMin) }) : "—";
      const zoneFmt = g.zoneType === "polygon" ? t("secours.groupe.zonePolygone", { n: (g.zonePolygon ? g.zonePolygon.length : 0) })
                    : g.zoneType === "roads"   ? t("secours.groupe.zoneTraces", { n: (g.zoneRoadIds ? g.zoneRoadIds.length : 0) })
                    : t("secours.groupe.zoneNonDefinie");
      // 🆕 v1.23.3 — chip "Niv X" dans le header de la card si g.level défini
      // (formatage cohérent : 0 → RDC, +1/-1 → "+1"/"-1", null → "Sans niveau")
      const lvlChip = (typeof g.level === "number")
                      ? '<span class="kta-secours-groupe-level-chip" title="' + _escAttr(t("secours.groupe.levelChipTitle")) + '">' +
                        '🏗️ ' + _lblNiveau(g.level) +
                        '</span>'
                      : '';
      // 🆕 v1.23.3 — Select éditable pour changer le niveau de référence
      // (uniquement visible si M-LVL actif et availableLevels disponible)
      let levelSelectRow = '';
      const mlvlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
      if (mlvlOn) {
        const availLevels = (Array.isArray(window.APP_CONFIG.availableLevels))
                            ? window.APP_CONFIG.availableLevels.slice().sort(function(a, b) { return a - b; })
                            : [];
        const levelOptions = '<option value=""' + (g.level == null ? ' selected' : '') +
                             '>' + t("secours.groupe.sansNiveau") + '</option>' +
                             availLevels.map(function(lvl) {
                               const lbl = _lblNiveau(lvl);
                               const sel = (lvl === g.level) ? ' selected' : '';
                               return '<option value="' + lvl + '"' + sel + '>' + t("secours.level.niveau", { label: lbl }) + _suffixeNiveauVide(lvl) + '</option>';
                             }).join('');
        levelSelectRow = '<div class="kta-secours-groupe-row">' +
                           '<label>' + t("secours.groupe.niveauMlvl") + '</label>' +
                           '<select data-action="change-level" data-gid="' + _escAttr(g.id) + '">' +
                             levelOptions +
                           '</select>' +
                         '</div>';
      }
      const repliee = _estRepliee(g.id);
      const nbEtapesG = (g.entree ? 1 : 0) + (Array.isArray(g.intermediaires) ? g.intermediaires.length : 0) + (g.sortie ? 1 : 0);
      html += '<div class="kta-secours-groupe-card' + (repliee ? ' kta-secours-groupe-card--repliee' : '') + '" data-gid="' + _escAttr(g.id) + '" style="border-left:4px solid ' + couleur.hex + ';">' +
                '<div class="kta-secours-groupe-header">' +
                  '<button type="button" class="kta-secours-groupe-replier" data-action="toggle-groupe" data-gid="' + _escAttr(g.id) + '" ' +
                    'aria-expanded="' + (repliee ? 'false' : 'true') + '" title="' + _escAttr(t("secours.groupe.replierTitle")) + '">' +
                    (repliee ? '▸' : '▾') + '</button>' +
                  '<span class="kta-secours-groupe-swatch" style="background:' + couleur.hex + ';"></span>' +
                  '<input type="text" class="kta-secours-groupe-nom" data-action="rename-groupe" data-gid="' + _escAttr(g.id) + '" value="' + _escAttr(g.nom) + '" maxlength="40">' +
                  lvlChip +
                  /* ⛔ Phase 4 (QR Share) ROLLBACK hotfix17 — bouton 📲 retiré.
                     Le partage briefing se fait via "📥 Importer un plan"
                     (vue list) qui consomme le .mkmsec.json complet. */
                  '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="del-groupe" data-gid="' + _escAttr(g.id) + '" title="' + _escAttr(t("secours.list.supprimerTitle")) + '">🗑️</button>' +
                  '<span class="kta-secours-groupe-resume kta-tx-muted">' + t("secours.groupe.resumeReplie", { n: nbEtapesG }) + '</span>' +
                '</div>' +
                '<div class="kta-secours-groupe-body">' +
                  '<div class="kta-secours-groupe-row">' +
                    '<label>' + t("secours.groupe.membresLabel") + '</label>' +
                    '<input type="text" data-action="edit-membres" data-gid="' + _escAttr(g.id) + '" value="' + _escAttr((g.membres || []).join(", ")) + '" placeholder="' + _escAttr(t("secours.groupe.membresPlaceholder")) + '" maxlength="200">' +
                  '</div>' +
                  // 🆕 v1.41.0 E — Position GPS surface équipe (PC secours, lieu rdv pompiers...).
                  //    Format saisi : "lat, lng" décimal WGS84 (ex: "48.8566, 2.3522").
                  //    Sérialisé en {lat, lng} dans le data model. Optionnel.
                  //    Utilisé par Briefing pompiers PDF (lien OSM + marker carte).
                  '<div class="kta-secours-groupe-row">' +
                    '<label>' + t("secours.groupe.gpsSurfaceLabel") + '</label>' +
                    '<input type="text" data-action="edit-surface-gps" data-gid="' + _escAttr(g.id) + '" ' +
                      'value="' + _escAttr(g.surfaceGps ? (g.surfaceGps.lat + ", " + g.surfaceGps.lng) : "") + '" ' +
                      'placeholder="' + _escAttr(t("secours.groupe.gpsPlaceholder")) + '" ' +
                      'pattern="^\\s*-?\\d+\\.?\\d*\\s*,\\s*-?\\d+\\.?\\d*\\s*$" ' +
                      'maxlength="50" title="' + _escAttr(t("secours.groupe.gpsTitle")) + '">' +
                  '</div>' +
                  '<div class="kta-secours-groupe-row">' +
                    '<label>' + t("secours.groupe.couleurLabel") + '</label>' +
                    '<select data-action="change-couleur" data-gid="' + _escAttr(g.id) + '">' +
                      PALETTE.map(function(c, i) {
                        return '<option value="' + i + '"' + (i === g.couleurIdx ? ' selected' : '') + '>' +
                               c.nom + ' (' + c.hex + ')</option>';
                      }).join('') +
                    '</select>' +
                  '</div>' +
                  levelSelectRow +
                  '<div class="kta-secours-groupe-stats">' +
                    '<span>' + t("secours.groupe.statZone", { zone: zoneFmt }) + '</span>' +
                    '<span>' + t("secours.groupe.statDistance", { distance: distFmt }) + '</span>' +
                    '<span>' + t("secours.groupe.statDuree", { duree: dureeFmt }) + '</span>' +
                  '</div>' +
                  // 🆕 v1.22.0-fix2 : section Parcours avec entrée + intermédiaires[] + sortie
                  _renderParcoursSection(g) +
                  '<div class="kta-secours-groupe-actions">' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="def-zone" data-gid="' + _escAttr(g.id) + '">' + t("secours.groupe.btnDefZone") + '</button>' +
                    // 🆕 v1.22.0-fix4 (KARMA "on peut avoir un bouton tous les
                    // points dans la zone de recherche") — ajoute tous les POI
                    // dans la zone comme intermédiaires triés par proximité.
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="add-pois-zone" data-gid="' + _escAttr(g.id) + '" title="' + _escAttr(t("secours.groupe.btnPoisZoneTitle")) + '">' + t("secours.groupe.btnPoisZone") + '</button>' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="calc-iti" data-gid="' + _escAttr(g.id) + '">' + t("secours.groupe.btnCalcIti") + '</button>' +
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

  // ============================================================
  // 🆕 v1.24.0 Phase 3 — BANDEAU "LANCER LE PLAN" + MODALE SÉLECTION RÔLE
  // ============================================================

  // Affiche le bandeau d'état d'exécution. 2 modes :
  //   • execution active → bandeau vert "🟢 PLAN ACTIF" + boutons Reprendre/Arrêter
  //   • sinon            → bouton CTA "🚀 Lancer le plan de secours"
  // Skip silencieux si pas d'équipes (= rien à lancer).
  function _renderLancerBandeau(s) {
    if (!s || !Array.isArray(s.groupes) || s.groupes.length === 0) {
      return '<div class="kta-secours-lancer-bandeau kta-secours-lancer-bandeau-disabled">' +
               '<span class="kta-secours-lancer-bandeau-icon">🚀</span>' +
               '<span>' + t("secours.bandeau.ajouteEquipe") + '</span>' +
             '</div>';
    }
    if (_estExecutionActive(s)) {
      const exec = s.execution;
      const roleLabel = (exec.role === "operateur") ? t("secours.roleBandeau.operateur")
                      : (exec.role === "secouriste") ? t("secours.roleBandeau.secouriste")
                      : t("secours.roleBandeau.equipe");
      const dureeMs = getExecutionDureeMs(s.id);
      const dureeStr = _formatDureeMs(dureeMs);
      return '<div class="kta-secours-lancer-bandeau kta-secours-lancer-bandeau-active">' +
               '<div class="kta-secours-lancer-bandeau-info">' +
                 '<div class="kta-secours-lancer-bandeau-titre">' +
                   '<span class="kta-secours-lancer-bandeau-dot"></span>' +
                   ' ' + t("secours.bandeau.planActif", { role: _escHtml(roleLabel) }) +
                 '</div>' +
                 '<div class="kta-secours-lancer-bandeau-sub">' +
                   // 🐛 hotfix1 (KARMA "le timer après avoir démarré doit
                   // continuer à tourner même si modal secour fermer") :
                   // data-live-timer="duree" pour que _majLiveTimers refresh
                   // ce texte toutes les 1s (cohérent avec le timer de la
                   // vue Live). Avant : string statique qui ne s'updatait
                   // qu'au re-render de la vue.
                   t("secours.bandeau.lanceDepuis") + ' <span data-live-timer="duree">' + _escHtml(dureeStr) + '</span>' +
                   (exec.pausedAt ? ' · ' + t("secours.bandeau.enPause") : '') +
                 '</div>' +
               '</div>' +
               '<div class="kta-secours-lancer-bandeau-actions">' +
                 '<button class="kta-btn kta-btn-primary" data-action="reprendre-live">' +
                   t("secours.bandeau.reprendreLive") +
                 '</button>' +
                 // 🆕 v1.40.33 (Synergie A v1) — Bouton "🌍 Vue OSM" depuis bandeau
                 // Mode Secours actif. Au clic : ouvre la modale Vue OSM existante
                 // (osmView.js) avec le plan georef projeté sur OpenStreetMap.
                 // Utile pour briefer un secours externe qui ne connaît pas le site.
                 // Gating natif (opt-in, strict offline, incognito, online) géré par
                 // OsmView.isAvailable() — voir _ouvrirVueOsmDepuisSecours.
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="ouvrir-vue-osm" title="' + _escAttr(t("secours.bandeau.vueOsmTitle")) + '">' +
                   t("secours.bandeau.vueOsm") +
                 '</button>' +
                 // 🆕 v1.41.0 C — Briefing pompiers PDF dédié (vue surface + équipes GPS + POI critiques).
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="briefing-pompiers" title="' + _escAttr(t("secours.bandeau.briefingTitle")) + '">' +
                   t("secours.bandeau.briefing") +
                 '</button>' +
                 // 🆕 v1.25.0 — Bouton Rapport accessible depuis vue Edit
                 // tant que execution active. Scope choisi = rôle courant.
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="edit-rapport" data-scope="' + _escAttr(exec.role) + '" title="' + _escAttr(t("secours.bandeau.rapportTitle")) + '">' +
                   t("secours.bandeau.rapport") +
                 '</button>' +
                 '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="arreter-plan" title="' + _escAttr(t("secours.bandeau.arreterTitle")) + '">' +
                   t("secours.bandeau.arreter") +
                 '</button>' +
               '</div>' +
             '</div>';
    }
    // 🆕 v1.25.0 — Si execution existe mais inactive (= plan TERMINÉ),
    // bandeau gris avec bouton "📤 Voir le rapport historique" + relance possible.
    if (s.execution && !s.execution.active && s.execution.endedAt) {
      const dureeStr = _formatDureeMs(getExecutionDureeMs(s.id));
      const finStr = new Date(s.execution.endedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR");
      const roleLabel = (s.execution.role === "operateur") ? t("secours.roleBandeau.operateur")
                      : (s.execution.role === "secouriste") ? t("secours.roleBandeau.secouriste")
                      : t("secours.roleBandeau.equipe");
      return '<div class="kta-secours-lancer-bandeau kta-secours-lancer-bandeau-archived">' +
               '<div class="kta-secours-lancer-bandeau-info">' +
                 '<div class="kta-secours-lancer-bandeau-titre">' + t("secours.bandeau.planTermine", { role: _escHtml(roleLabel) }) + '</div>' +
                 '<div class="kta-secours-lancer-bandeau-sub">' +
                   t("secours.bandeau.dureeFin", { duree: dureeStr, fin: _escHtml(finStr) }) +
                 '</div>' +
               '</div>' +
               '<div class="kta-secours-lancer-bandeau-actions">' +
                 '<button class="kta-btn kta-btn-primary" data-action="edit-rapport" data-scope="' + _escAttr(s.execution.role) + '">' +
                   t("secours.bandeau.voirRapportHisto") +
                 '</button>' +
                 // 🆕 v1.40.33 (Synergie A v1) — Vue OSM accessible aussi pour debrief
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="ouvrir-vue-osm" title="' + _escAttr(t("secours.bandeau.vueOsmTitleDebrief")) + '">' +
                   t("secours.bandeau.vueOsm") +
                 '</button>' +
                 // 🆕 v1.41.0 C — Briefing pompiers accessible aussi post-mortem.
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="briefing-pompiers" title="' + _escAttr(t("secours.bandeau.briefingTitlePost")) + '">' +
                   t("secours.bandeau.briefing") +
                 '</button>' +
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="ouvrir-lancer-modale" title="' + _escAttr(t("secours.bandeau.relancerTitle")) + '">' +
                   t("secours.bandeau.relancer") +
                 '</button>' +
               '</div>' +
             '</div>';
    }
    return '<div class="kta-secours-lancer-bandeau kta-secours-lancer-bandeau-cta">' +
             '<div class="kta-secours-lancer-bandeau-info">' +
               '<div class="kta-secours-lancer-bandeau-titre">' + t("secours.bandeau.ctaTitre") + '</div>' +
               '<div class="kta-secours-lancer-bandeau-sub">' +
                 t("secours.bandeau.ctaSub") +
               '</div>' +
             '</div>' +
             '<button class="kta-btn kta-btn-primary kta-btn-lg" data-action="ouvrir-lancer-modale">' +
               t("secours.bandeau.ctaBtn") +
             '</button>' +
           '</div>';
  }

  // Formate une durée en ms en "Xh YYmin" ou "YYmin" ou "Ss".
  function _formatDureeMs(ms) {
    if (!ms || ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return h + "h " + String(m).padStart(2, "0") + "min";
    if (m > 0) return m + "min " + String(s).padStart(2, "0") + "s";
    return s + "s";
  }

  // Modale de sélection rôle + équipe avant lancement.
  // onConfirm({role, currentEquipeId}) appelé si user valide ; sinon noop au cancel.
  function _afficherModaleLancer(scenarioId, onConfirm) {
    const s = get(scenarioId);
    if (!s) return;
    const existing = document.getElementById("kta-secours-lancer-modale");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const groupesOpts = (s.groupes || []).map(function(g) {
      const couleur = PALETTE[g.couleurIdx % PALETTE.length];
      return '<option value="' + _escAttr(g.id) + '">' +
               _escHtml(g.nom) + ' (' + _escHtml(couleur.nom) + ')' +
             '</option>';
    }).join('');
    const defaultEquipeId = (s.groupes && s.groupes.length > 0) ? s.groupes[0].id : "";

    const overlay = document.createElement("div");
    overlay.id = "kta-secours-lancer-modale";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100012";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:90vh; border-left:6px solid #f4c542;">' +
        '<div class="kta-readme-modal-header">' +
          '<h2 style="margin:0; color:#f4c542;">' + t("secours.lancer.titre") + '</h2>' +
          '<button class="kta-readme-modal-close" data-action="cancel-lancer" aria-label="' + _escAttr(t("secours.btn.annulerAria")) + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="margin:0 0 14px 0;">' + t("secours.lancer.intro") + '</p>' +
          '<div class="kta-secours-lancer-roles">' +
            '<label class="kta-secours-lancer-role-row">' +
              '<input type="radio" name="kta-lancer-role" value="operateur" checked>' +
              '<div class="kta-secours-lancer-role-info">' +
                '<div class="kta-secours-lancer-role-titre">' + t("secours.lancer.opTitre") + '</div>' +
                '<div class="kta-secours-lancer-role-desc">' +
                  t("secours.lancer.opDesc") +
                '</div>' +
              '</div>' +
            '</label>' +
            '<label class="kta-secours-lancer-role-row">' +
              '<input type="radio" name="kta-lancer-role" value="equipe">' +
              '<div class="kta-secours-lancer-role-info">' +
                '<div class="kta-secours-lancer-role-titre">' + t("secours.lancer.equipeTitre") + '</div>' +
                '<div class="kta-secours-lancer-role-desc">' +
                  t("secours.lancer.equipeDesc") +
                '</div>' +
                '<select id="kta-lancer-equipe-select" class="kta-secours-lancer-equipe-select" disabled>' +
                  groupesOpts +
                '</select>' +
              '</div>' +
            '</label>' +
            '<label class="kta-secours-lancer-role-row">' +
              '<input type="radio" name="kta-lancer-role" value="secouriste">' +
              '<div class="kta-secours-lancer-role-info">' +
                '<div class="kta-secours-lancer-role-titre">' + t("secours.lancer.secTitre") + '</div>' +
                '<div class="kta-secours-lancer-role-desc">' +
                  t("secours.lancer.secDesc") +
                '</div>' +
              '</div>' +
            '</label>' +
          '</div>' +
          '<p style="margin-top:14px; color:#8892a4; font-size:13px; font-style:italic;">' +
            t("secours.lancer.hint") +
          '</p>' +
          '<div style="margin-top:18px; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">' +
            '<button class="kta-btn kta-btn-ghost" data-action="cancel-lancer">' + t("secours.btn.annulerCroix") + '</button>' +
            '<button class="kta-btn kta-btn-primary" data-action="confirm-lancer">' + t("secours.btn.demarrerMaintenant") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    function _close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener("keydown", _onKey);
    }
    function _onKey(e) { if (e.key === "Escape") _close(); }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });

    overlay.querySelectorAll('[data-action="cancel-lancer"]').forEach(function(btn) {
      btn.addEventListener("click", _close);
    });
    // Toggle activation du select équipe selon role
    const selectEquipe = overlay.querySelector('#kta-lancer-equipe-select');
    overlay.querySelectorAll('input[name="kta-lancer-role"]').forEach(function(r) {
      r.addEventListener("change", function() {
        const isEquipe = (overlay.querySelector('input[name="kta-lancer-role"]:checked').value === "equipe");
        if (selectEquipe) selectEquipe.disabled = !isEquipe;
      });
    });
    overlay.querySelectorAll('[data-action="confirm-lancer"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const role = overlay.querySelector('input[name="kta-lancer-role"]:checked').value;
        const equipeId = (role === "equipe" && selectEquipe) ? selectEquipe.value : null;
        if (role === "equipe" && !equipeId) {
          _toast(t("secours.toast.selectEquipe"), "warn");
          return;
        }
        _close();
        try { onConfirm({ role: role, currentEquipeId: equipeId }); } catch(e) {
          console.warn("[SecoursMode] onConfirm exception :", e);
        }
      });
    });
    document.addEventListener("keydown", _onKey);
    document.body.appendChild(overlay);
  }

  // ============================================================
  // 🆕 v1.24.0 Phase 3 — VUE LIVE (mode exécution terrain)
  // ============================================================
  //
  // Dispatcher principal selon le rôle de l'execution.active. Si pas
  // d'execution active (cas impossible normalement car le bandeau pousse
  // l'user vers la vue edit), fallback explicite vers la vue edit avec
  // toast d'erreur.
  function _renderLiveView() {
    const s = get(_currentScenarioId);
    if (!s || !_estExecutionActive(s)) {
      // Cas dégénéré : on est arrivé sur la vue live sans execution active
      setTimeout(function() { _switchView("edit"); }, 100);
      return '<div class="kta-secours-live-error">' +
               '<p>' + t("secours.live.aucunPlanActif") + '</p>' +
             '</div>';
    }
    const role = s.execution.role;
    if (role === "equipe")     return _renderLiveViewEquipe(s);
    if (role === "operateur")  return _renderLiveViewOperateur(s);
    if (role === "secouriste") return _renderLiveViewSecouriste(s);
    return '<div class="kta-secours-live-error"><p>' + t("secours.live.roleInconnu", { role: _escHtml(role) }) + '</p></div>';
  }

  // 🆕 v1.24.0 Phase 3 — State module-level pour vue Live Équipe
  // Stocke l'étape courante focalisée (par défaut : 1ère étape pending).
  // Réinitialisé à chaque _switchView("live") via _liveEquipeInitFocus.
  let _liveEquipeFocusIdx = 0;

  // 🐛 hotfix11 (KARMA "le bouton étape précédente ne marche pas") —
  // Flag pour distinguer "boot de la vue Live" (= smart-skip vers prochaine
  // pending autorisé) de "navigation manuelle user" (= respect strict du
  // focus défini par le clic prev/next/stepper).
  // Sans ce flag, après chaque clic "← Étape précédente", le re-render
  // appelait _liveEquipeInitFocus qui voyait l'étape comme déjà complétée
  // → smart-skip avant à la prochaine pending → retour impossible.
  // Reset à true uniquement au lancerExecution (= 1ère entrée dans la vue
  // Live pour une exécution donnée), pour préserver le comportement initial
  // "reprendre à la bonne étape au reload".
  let _liveEquipeFreshSession = true;

  // 🆕 v1.29.0 C2 — Badge "Phase X/N" pour les 3 headers Live.
  // KARMA C2.1:a : MASQUÉ si scénario a 1 seule phase (préserve UX v1.28.5).
  // Le badge apparaît dès la création de phases[1+] via le bouton "➕".
  function _renderPhaseBadgeHTML(s) {
    if (!s || !Array.isArray(s.phases) || s.phases.length < 2) return "";
    const total = s.phases.length;
    const idx = (s.execution && typeof s.execution.currentPhaseIdx === "number")
                ? s.execution.currentPhaseIdx
                : 0;
    const phase = s.phases[idx];
    const nomPhase = phase ? phase.nom : t("secours.phaseModal.defaultNom", { n: (idx + 1) });
    return '<span class="kta-secours-live-phase-badge" title="' +
             _escAttr(t("secours.phaseBadge.title", { nom: nomPhase, n: (idx + 1), total: total })) + '">' +
             '<span class="kta-secours-live-phase-badge-icon">📋</span>' +
             '<span class="kta-secours-live-phase-badge-label">' +
               _escHtml(nomPhase) + ' <span class="kta-secours-live-phase-badge-pos">' +
                 (idx + 1) + '/' + total +
               '</span>' +
             '</span>' +
           '</span>';
  }

  function _renderLiveViewEquipe(s) {
    const equipeId = s.execution.currentEquipeId;
    const g = (s.groupes || []).find(function(gr) { return gr.id === equipeId; });
    if (!g) {
      return '<div class="kta-secours-live-error">' +
               '<p>' + t("secours.live.equipeIntrouvable") + '</p>' +
             '</div>';
    }
    const couleur = PALETTE[g.couleurIdx % PALETTE.length];
    const etapes = _getEtapesEquipe(s, equipeId);
    if (etapes.length === 0) {
      return '<div class="kta-secours-live-error">' +
               '<p>' + t("secours.live.aucuneEtape") + '</p>' +
               '<button class="kta-btn kta-btn-primary" data-action="back-to-edit">' + t("secours.live.btnRetourEdition") + '</button>' +
             '</div>';
    }
    // Init focus : 1ère étape pending sinon dernière
    _liveEquipeInitFocus(etapes);
    const idx = _liveEquipeFocusIdx;
    const etape = etapes[idx];
    const statutInfo = _getStatutInfo(etape.statut);
    const photosCount = Array.isArray(etape.photoIds) ? etape.photoIds.length : 0;
    const dureeStr = _formatDureeMs(getExecutionDureeMs(s.id));

    let html = '';

    // ─── Header sticky avec timer + équipe ───
    html += '<div class="kta-secours-live-header" style="border-left:6px solid ' + couleur.hex + ';">' +
              '<div class="kta-secours-live-header-titre">' +
                '<span class="kta-secours-live-header-swatch" style="background:' + couleur.hex + ';"></span>' +
                '<strong>' + _escHtml(g.nom) + '</strong>' +
                _renderPhaseBadgeHTML(s) +
                '<span class="kta-secours-live-header-meta">' +
                  ' · ' + t("secours.live.etapeCompteur", { n: (idx + 1), total: etapes.length }) +
                '</span>' +
              '</div>' +
              '<div class="kta-secours-live-header-timer">' +
                '<span class="kta-secours-live-header-timer-icon">⏱️</span>' +
                ' <span data-live-timer="duree">' + _escHtml(dureeStr) + '</span>' +
                (s.execution.pausedAt ? ' <span class="kta-secours-live-pause-tag">⏸️ PAUSE</span>' : '') +
              '</div>' +
            '</div>';

    // ─── Stepper visuel cliquable ───
    html += '<div class="kta-secours-live-stepper">';
    etapes.forEach(function(et, i) {
      const isCurrent = (i === idx);
      const stInfo = _getStatutInfo(et.statut);
      const cls = isCurrent ? 'kta-secours-live-step kta-secours-live-step-current'
                : (et.completedAt ? 'kta-secours-live-step kta-secours-live-step-done'
                                  : 'kta-secours-live-step kta-secours-live-step-pending');
      const labelType = (et.type === "entree") ? t("secours.live.stepEntree")
                      : (et.type === "sortie") ? t("secours.live.stepSortie")
                      : ("📍 " + (i));
      html += '<button class="' + cls + '" data-action="live-goto-step" data-step="' + i + '" ' +
                'title="' + _escAttr(labelType + " — " + _lblEtape(et.label)) + '" ' +
                'style="--kta-step-color:' + stInfo.color + ';">' +
                '<span class="kta-secours-live-step-emoji">' + stInfo.emoji + '</span>' +
                '<span class="kta-secours-live-step-idx">' + (i + 1) + '</span>' +
              '</button>';
    });
    html += '</div>';

    // ─── Bloc étape courante ───
    const typeLabel = (etape.type === "entree") ? t("secours.live.typeEntree")
                    : (etape.type === "sortie") ? t("secours.live.typeSortie")
                    : t("secours.live.typeEtape", { idx: idx });
    html += '<div class="kta-secours-live-etape">' +
              '<div class="kta-secours-live-etape-titre">' +
                typeLabel +
                ' — ' + _escHtml(_lblEtape(etape.label) || t("secours.live.sansLabel")) +
              '</div>' +
              '<div class="kta-secours-live-etape-statut" style="border-color:' + statutInfo.color + ';">' +
                '<span style="font-size:14px;">' + t("secours.live.statutActuel") + '</span> ' +
                '<strong style="color:' + statutInfo.color + ';">' +
                  statutInfo.emoji + ' ' + _escHtml(_statutLabel(etape.statut)) +
                '</strong>' +
              '</div>' +
              _renderBlocVictimeEquipe(s, equipeId, idx, etape) +
              '<div class="kta-secours-live-etape-textarea-wrap">' +
                '<label for="kta-live-obs-' + idx + '">' + t("secours.live.obsLabel") + '</label>' +
                '<textarea id="kta-live-obs-' + idx + '" class="kta-secours-live-etape-textarea" ' +
                  'rows="3" maxlength="2000" placeholder="' + _escAttr(t("secours.live.obsPlaceholder")) + '">' +
                  _escHtml(etape.observations || "") +
                '</textarea>' +
              '</div>' +

              '<div class="kta-secours-live-etape-statuts-rapides">' +
                '<div class="kta-secours-live-etape-statuts-titre">' + t("secours.live.saisieRapide") + '</div>' +
                '<div class="kta-secours-live-etape-statuts-row">' +
                  TABLEAU_STATUTS.filter(function(st) { return !st.isPending; }).map(function(st) {
                    const isSel = (st.id === etape.statut);
                    const stLbl = _statutLabel(st.id);
                    return '<button class="kta-secours-live-statut-btn' + (isSel ? ' kta-secours-live-statut-btn-sel' : '') + '" ' +
                           'data-action="live-set-statut" data-statut="' + _escAttr(st.id) + '" ' +
                           'style="--kta-statut-color:' + st.color + ';" ' +
                           'title="' + _escAttr(stLbl) + '">' +
                             st.emoji + ' ' + _escHtml(stLbl) +
                           '</button>';
                  }).join('') +
                '</div>' +
              '</div>' +

              '<div class="kta-secours-live-etape-actions-row">' +
                '<button class="kta-btn kta-btn-secondary" data-action="live-photo" ' +
                  'title="' + _escAttr(t("secours.live.photoTitle")) + '">' +
                  t("secours.live.photoBtn", { n: photosCount }) +
                '</button>' +
                '<button class="kta-btn kta-btn-secondary" data-action="live-recentrer">' +
                  t("secours.live.recentrerBtn") +
                '</button>' +
              '</div>' +

              // Mini-grille des photos déjà attachées
              _renderLiveEtapePhotos(s, equipeId, idx) +

            '</div>';

    // ─── Navigation prev/next ───
    html += '<div class="kta-secours-live-nav">' +
              '<button class="kta-btn kta-btn-ghost" data-action="live-prev"' +
                (idx === 0 ? ' disabled' : '') + '>' + t("secours.live.etapePrecedente") + '</button>' +
              '<button class="kta-btn kta-btn-primary" data-action="live-next"' +
                (idx === etapes.length - 1 ? ' disabled' : '') + '>' + t("secours.live.etapeSuivante") + '</button>' +
            '</div>';

    // ─── Actions bas : Pause + Terminer + Retour édition ───
    // 🆕 v1.24.1 — Bouton « 👤 Retour Opérateur » si on est arrivé ici via
    // "Prendre la main" depuis la vue Opérateur (_previousRole stocké).
    // Cohérent persistance : survit au reload car _previousRole est dans
    // s.execution (localStorage).
    const previousRole = s.execution._previousRole;
    const retourPreviousBtn = previousRole
      ? '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="live-retour-previous-role" ' +
        'title="' + _escAttr(previousRole === "operateur" ? t("secours.live.retourPrevTitleOp") : t("secours.live.retourPrevTitleSec")) + '">' +
          (previousRole === "operateur" ? t("secours.live.retourOperateur") : t("secours.live.retourSecouriste")) +
        '</button>'
      : '';
    html += '<div class="kta-secours-live-footer">' +
              '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="live-toggle-pause">' +
                (s.execution.pausedAt ? t("secours.live.reprendre") : t("secours.live.pause")) +
              '</button>' +
              retourPreviousBtn +
              // 🆕 v1.25.0 — Bouton Rapport (mode Équipe : scope = "equipe")
              '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="live-rapport" data-scope="equipe" title="' + _escAttr(t("secours.live.rapportEquipeTitle")) + '">' +
                t("secours.bandeau.rapport") +
              '</button>' +
              // 🆕 v1.41.1 — Vue OSM + Briefing pompiers accessibles depuis vue Équipier.
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="ouvrir-vue-osm" title="' + _escAttr(t("secours.live.vueOsmTitle")) + '">' +
                t("secours.bandeau.vueOsm") +
              '</button>' +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="briefing-pompiers" title="' + _escAttr(t("secours.bandeau.briefingTitlePost")) + '">' +
                t("secours.bandeau.briefing") +
              '</button>' +
              /* ⛔ Phase 4 (QR Share) ROLLBACK hotfix17 — bouton retiré.
                 Sera remplacé hotfix18 par "💾 Exporter mes obs (.json)"
                 + import via le bouton "📥 Importer" en haut vue Live
                 (équivalent fichier classique sans QR). */
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="back-to-edit">' +
                t("secours.live.voirEdition") +
              '</button>' +
              '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="arreter-plan-live">' +
                t("secours.btn.terminerPlan") +
              '</button>' +
            '</div>';

    return html;
  }

  // A3 : sous une étape « Victime trouvée », où elle est + préciser + évacuer.
  function _renderBlocVictimeEquipe(s, equipeId, idx, etape) {
    if (!etape || etape.statut !== "victime") return "";
    const liste = _victimesDe(s);
    const v = liste.findIndex(function(x) { return x.g.id === equipeId && x.idx === idx; });
    if (v < 0) return "";
    const pos = liste[v].pos;
    return '<div class="kta-secours-victime-bloc">' +
             '<div class="kta-secours-victime-pos">🚨 <strong>' + t("secours.victime.titre") + '</strong> : ' +
               _escHtml(_lblPos(pos)) + (etape.victimePos ? ' <em>' + t("secours.victime.precisee") + '</em>' : '') + '</div>' +
             '<div class="kta-secours-victime-actions">' +
               '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="victime-preciser" data-v="' + v + '">' + t("secours.victime.preciser") + '</button>' +
               '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="victime-evacuer" data-v="' + v + '">' + t("secours.victime.evacuer") + '</button>' +
             '</div>' +
           '</div>';
  }
  // A3 : bandeau en tête de la vue opérateur, une ligne par victime.
  function _renderBandeauVictimesOp(s) {
    const liste = _victimesDe(s);
    if (!liste.length) return "";
    return '<div class="kta-secours-victime-bandeau">' + liste.map(function(v, i) {
      return '<div class="kta-secours-victime-ligne">' +
               '<span>🚨 <strong>' + t("secours.victime.titre") + '</strong> — ' + _escHtml(v.g.nom) + ' · ' +
                 _escHtml(_lblEtape(v.et.label) || "?") + ' · ' + _heureCourte(v.et.completedAt) + '</span>' +
               '<span class="kta-secours-victime-actions">' +
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="victime-voir" data-v="' + i + '">' + t("secours.victime.voir") + '</button>' +
                 '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="victime-evacuer" data-v="' + i + '">' + t("secours.victime.evacuer") + '</button>' +
               '</span>' +
             '</div>';
    }).join('') + '</div>';
  }

  // Init le focus sur la 1ère étape pending (sinon dernière étape).
  // 🐛 hotfix11 : smart-skip vers prochaine pending UNIQUEMENT en fresh session
  // (= 1ère entrée dans la vue Live pour cette exécution). Après navigation
  // manuelle user (clic prev/next/stepper), le flag passe à false → respect
  // strict du focus user, ce qui permet le retour en arrière fonctionnel.
  function _liveEquipeInitFocus(etapes) {
    if (!Array.isArray(etapes) || etapes.length === 0) {
      _liveEquipeFocusIdx = 0;
      return;
    }
    // Reset à 0 si focus actuel hors range
    if (_liveEquipeFocusIdx < 0 || _liveEquipeFocusIdx >= etapes.length) {
      _liveEquipeFocusIdx = 0;
    }
    // Smart-skip vers prochaine pending UNIQUEMENT en fresh session
    // (Sans ce garde-fou, après chaque clic "← Étape précédente",
    // le re-render avancerait auto à la prochaine pending → retour impossible.)
    if (_liveEquipeFreshSession &&
        etapes[_liveEquipeFocusIdx] && etapes[_liveEquipeFocusIdx].completedAt) {
      const nextPending = etapes.findIndex(function(et, i) {
        return i > _liveEquipeFocusIdx && !et.completedAt;
      });
      if (nextPending >= 0) _liveEquipeFocusIdx = nextPending;
    }
    // L'init initial a fait son boulot — désormais la nav user prend le relai
    _liveEquipeFreshSession = false;
  }

  // ─── Vue Live Mode Opérateur surface ──────────────────────────
  // Affiche une grille de cards par équipe avec : couleur OTAN + statut
  // courant + dernière obs snippet + dernière modif timestamp.
  // Card victime trouvée = rouge clignotant. Card aide = orange.
  // Card terminée = grise. Cliquable pour détails read-only.
  function _renderLiveViewOperateur(s) {
    const dureeStr = _formatDureeMs(getExecutionDureeMs(s.id));
    const groupes = s.groupes || [];

    let html = '';
    // Header
    html += '<div class="kta-secours-live-header kta-secours-live-header-op">' +
              '<div class="kta-secours-live-header-titre">' +
                '<strong>' + t("secours.liveOp.titre") + '</strong>' +
                _renderPhaseBadgeHTML(s) +
                '<span class="kta-secours-live-header-meta">' +
                  ' · ' + _escHtml(s.nom) +
                  ' · ' + t("secours.liveOp.equipesCompteur", { n: groupes.length }) +
                '</span>' +
              '</div>' +
              '<div class="kta-secours-live-header-timer">' +
                '<span class="kta-secours-live-header-timer-icon">⏱️</span>' +
                ' <span data-live-timer="duree">' + _escHtml(dureeStr) + '</span>' +
                (s.execution.pausedAt ? ' <span class="kta-secours-live-pause-tag">⏸️ PAUSE</span>' : '') +
              '</div>' +
            '</div>';
    html += _renderBandeauVictimesOp(s);

    // Grille cards équipes
    if (groupes.length === 0) {
      html += '<div class="kta-secours-empty"><div class="kta-secours-empty-icon">🚨</div>' +
                '<p>' + t("secours.liveOp.aucuneEquipe") + '</p></div>';
    } else {
      html += '<div class="kta-secours-live-op-grid">';
      groupes.forEach(function(g) {
        html += _renderOperateurCard(s, g);
      });
      html += '</div>';
    }

    // Actions footer
    html += '<div class="kta-secours-live-footer">' +
              '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="live-toggle-pause">' +
                (s.execution.pausedAt ? t("secours.live.reprendre") : t("secours.live.pause")) +
              '</button>' +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="live-op-carte-globale">' +
                t("secours.liveOp.carteGlobale") +
              '</button>' +
              // 🆕 v1.41.1 — Vue OSM + Briefing pompiers accessibles depuis vue Opérateur.
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="ouvrir-vue-osm" title="' + _escAttr(t("secours.liveOp.vueOsmTitle")) + '">' +
                t("secours.bandeau.vueOsm") +
              '</button>' +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="briefing-pompiers" title="' + _escAttr(t("secours.bandeau.briefingTitlePost")) + '">' +
                t("secours.bandeau.briefing") +
              '</button>' +
              // 🆕 v1.25.0 — Bouton Rapport (mode Opérateur : scope = "operateur" → toutes équipes)
              '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="live-rapport" data-scope="operateur" title="' + _escAttr(t("secours.liveOp.rapportGlobalTitle")) + '">' +
                t("secours.liveOp.rapportGlobal") +
              '</button>' +
              // 🆕 v1.26.0 — Bouton Import rapport équipier (consolidation cross-device)
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="live-op-import-rapport" title="' + _escAttr(t("secours.liveOp.importRapportTitle")) + '">' +
                t("secours.liveOp.importRapport") +
              '</button>' +
              // 🆕 v1.29.0 C2 — Ajout phase à chaud (KARMA C2.2:c). Permet à
              // l'Op de planifier la phase suivante pendant que la phase courante
              // tourne, sans passer par la vue Edit.
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="add-phase" title="' + _escAttr(t("secours.liveOp.ajouterPhaseTitle")) + '">' +
                t("secours.phases.btnAjouter") +
              '</button>' +
              // 🆕 v1.29.0 C3 — "✓ Phase terminée" : ouvre la modale debrief.
              // Visible UNIQUEMENT si multi-phase (KARMA C2.1:a — pas de
              // pollution UI si scénario mono-phase) et UNIQUEMENT en vue Op
              // (KARMA 7:a — prérogative PC). Liseré vert discret si la phase
              // est détectée prête à clore (auto-détection KARMA C3.2:a).
              (Array.isArray(s.phases) && s.phases.length >= 2
                ? '<button class="kta-btn kta-btn-phase-end kta-btn-sm' +
                  (_phaseEstPretAClore(s) ? ' kta-btn-phase-end-ready' : '') +
                  '" data-action="terminer-phase" title="' + _escAttr(t("secours.liveOp.phaseTermineeTitle")) + '">' +
                    t("secours.liveOp.phaseTerminee") +
                  '</button>'
                : '') +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="back-to-edit">' +
                t("secours.live.voirEdition") +
              '</button>' +
              '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="arreter-plan-live">' +
                t("secours.btn.terminerPlan") +
              '</button>' +
            '</div>';
    return html;
  }

  // Rendu d'une card équipe pour la vue Opérateur.
  // Détermine : étape courante (max idx avec startedAt), statut le + sévère
  // (parmi toutes les étapes), dernière obs non-vide, % progression.
  function _renderOperateurCard(s, g) {
    const couleur = PALETTE[g.couleurIdx % PALETTE.length];
    const etapes = _getEtapesEquipe(s, g.id);
    const nbEtapes = etapes.length;
    if (nbEtapes === 0) {
      return '<div class="kta-secours-op-card kta-secours-op-card-empty" style="border-left:4px solid ' + couleur.hex + ';">' +
               '<div class="kta-secours-op-card-titre">' +
                 '<span class="kta-secours-op-card-swatch" style="background:' + couleur.hex + ';"></span>' +
                 _escHtml(g.nom) +
               '</div>' +
               '<div class="kta-secours-op-card-meta">' + t("secours.opCard.parcoursNonDefini") + '</div>' +
             '</div>';
    }

    // Détermine étape courante = max idx avec startedAt (sinon 0)
    let currentIdx = 0;
    for (let i = etapes.length - 1; i >= 0; i--) {
      if (etapes[i].startedAt || etapes[i].completedAt) { currentIdx = i; break; }
    }
    const nbDone = etapes.filter(function(e) { return !!e.completedAt; }).length;
    const isTerminee = (nbDone === nbEtapes);
    const pctDone = Math.round((nbDone / nbEtapes) * 100);

    // Statut le + sévère parmi toutes les étapes
    let highestStatut = TABLEAU_STATUTS[0];   // pending
    etapes.forEach(function(et) {
      const info = _getStatutInfo(et.statut);
      if (info.severity > highestStatut.severity) highestStatut = info;
    });

    // Dernière obs non-vide
    let lastObs = "";
    for (let i = etapes.length - 1; i >= 0; i--) {
      if (etapes[i].observations && etapes[i].observations.trim()) {
        lastObs = etapes[i].observations.trim();
        break;
      }
    }
    const obsSnippet = lastObs.length > 80 ? lastObs.slice(0, 77) + "…" : lastObs;

    // Classes selon état
    let cls = "kta-secours-op-card";
    if (isTerminee) cls += " kta-secours-op-card-terminee";
    if (highestStatut.id === "victime") cls += " kta-secours-op-card-victime";
    if (highestStatut.id === "aide")    cls += " kta-secours-op-card-aide";

    // Last modif timestamp (= max completedAt OU startedAt)
    let lastTs = null;
    etapes.forEach(function(et) {
      if (et.completedAt && (!lastTs || Date.parse(et.completedAt) > Date.parse(lastTs))) lastTs = et.completedAt;
      else if (et.startedAt && (!lastTs || Date.parse(et.startedAt) > Date.parse(lastTs))) lastTs = et.startedAt;
    });
    const lastTsStr = lastTs ? new Date(lastTs).toLocaleTimeString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";

    // 🆕 v1.26.0 — détection import : au moins une étape avec _importedFrom
    const hasImported = etapes.some(function(et) { return et && et._importedFrom; });

    let html = '<div class="' + cls + '" data-equipe-id="' + _escAttr(g.id) + '" style="border-left:4px solid ' + couleur.hex + ';">' +
                 '<div class="kta-secours-op-card-titre">' +
                   '<span class="kta-secours-op-card-swatch" style="background:' + couleur.hex + ';"></span>' +
                   _escHtml(g.nom) +
                   (isTerminee ? ' <span class="kta-secours-op-card-badge-terminee">' + t("secours.opCard.badgeTerminee") + '</span>' : '') +
                   (hasImported ? ' <span class="kta-secours-imported-chip" title="' + _escAttr(t("secours.opCard.importeChipTitle")) + '">' + t("secours.opCard.importeChip") + '</span>' : '') +
                 '</div>' +
                 '<div class="kta-secours-op-card-progress">' +
                   '<div class="kta-secours-op-card-progress-bar" style="width:' + pctDone + '%; background:' + couleur.hex + ';"></div>' +
                   '<span class="kta-secours-op-card-progress-label">' +
                     t("secours.opCard.etapeProgress", { n: (currentIdx + 1), total: nbEtapes, pct: pctDone }) +
                   '</span>' +
                 '</div>' +
                 '<div class="kta-secours-op-card-statut" style="color:' + highestStatut.color + ';">' +
                   highestStatut.emoji + ' ' + _escHtml(_statutLabel(highestStatut.id)) +
                 '</div>' +
                 (obsSnippet
                   ? '<div class="kta-secours-op-card-obs">« ' + _escHtml(obsSnippet) + ' »</div>'
                   : '<div class="kta-secours-op-card-obs kta-secours-op-card-obs-empty">' + t("secours.opCard.aucuneObs") + '</div>') +
                 '<div class="kta-secours-op-card-meta">⏱️ ' + lastTsStr + '</div>' +
                 '<div class="kta-secours-op-card-actions">' +
                   '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="live-op-details" data-equipe-id="' + _escAttr(g.id) + '">' +
                     t("secours.opCard.details") +
                   '</button>' +
                   '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="live-op-prendre-main" data-equipe-id="' + _escAttr(g.id) + '" title="' + _escAttr(t("secours.opCard.prendreMainTitle")) + '">' +
                     t("secours.opCard.prendreMain") +
                   '</button>' +
                 '</div>' +
               '</div>';
    return html;
  }

  // ─── Vue Live Mode Secouriste libre ──────────────────────────
  // Notes en vrac avec timestamps + statuts rapides. Pas d'équipe assignée,
  // pas d'étapes structurées. Utile pour renforts/reconnaissance.
  function _renderLiveViewSecouriste(s) {
    const dureeStr = _formatDureeMs(getExecutionDureeMs(s.id));
    const notes = (s.execution.etapes && s.execution.etapes._notes_libres) || [];

    let html = '';
    // Header
    html += '<div class="kta-secours-live-header kta-secours-live-header-sec">' +
              '<div class="kta-secours-live-header-titre">' +
                '<strong>' + t("secours.liveSec.titre") + '</strong>' +
                _renderPhaseBadgeHTML(s) +
                '<span class="kta-secours-live-header-meta">' +
                  ' · ' + t("secours.liveSec.notesCompteur", { n: notes.length }) +
                '</span>' +
              '</div>' +
              '<div class="kta-secours-live-header-timer">' +
                '<span class="kta-secours-live-header-timer-icon">⏱️</span>' +
                ' <span data-live-timer="duree">' + _escHtml(dureeStr) + '</span>' +
                (s.execution.pausedAt ? ' <span class="kta-secours-live-pause-tag">⏸️ PAUSE</span>' : '') +
              '</div>' +
            '</div>';

    // Bloc création nouvelle note
    html += '<div class="kta-secours-live-etape">' +
              '<div class="kta-secours-live-etape-titre">' + t("secours.liveSec.ajouterNote") + '</div>' +
              '<div class="kta-secours-live-etape-textarea-wrap">' +
                '<textarea id="kta-sec-newnote-texte" class="kta-secours-live-etape-textarea" rows="3" maxlength="2000" placeholder="' + _escAttr(t("secours.liveSec.notePlaceholder")) + '"></textarea>' +
              '</div>' +
              '<div class="kta-secours-live-etape-statuts-rapides">' +
                '<div class="kta-secours-live-etape-statuts-titre">' + t("secours.liveSec.statutAssocie") + '</div>' +
                '<div class="kta-secours-live-etape-statuts-row">' +
                  TABLEAU_STATUTS.filter(function(st) { return !st.isPending; }).map(function(st) {
                    const stLbl = _statutLabel(st.id);
                    return '<button class="kta-secours-live-statut-btn" ' +
                           'data-action="sec-add-note" data-statut="' + _escAttr(st.id) + '" ' +
                           'style="--kta-statut-color:' + st.color + ';" ' +
                           'title="' + _escAttr(t("secours.liveSec.ajouterNoteStatut", { statut: stLbl })) + '">' +
                             st.emoji + ' ' + _escHtml(stLbl) +
                           '</button>';
                  }).join('') +
                '</div>' +
              '</div>' +
            '</div>';

    // Liste chronologique des notes (DESC = la + récente en haut)
    html += '<div class="kta-secours-live-notes-list">';
    if (notes.length === 0) {
      html += '<div class="kta-secours-empty-small">' + t("secours.liveSec.aucuneNote") + '</div>';
    } else {
      const sorted = notes.slice().sort(function(a, b) {
        return Date.parse(b.ts) - Date.parse(a.ts);
      });
      sorted.forEach(function(note) {
        const info = _getStatutInfo(note.statut);
        const tsStr = new Date(note.ts).toLocaleTimeString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        html += '<div class="kta-secours-live-note" style="border-left:4px solid ' + info.color + ';">' +
                  '<div class="kta-secours-live-note-header">' +
                    '<span style="color:' + info.color + ';"><strong>' + info.emoji + ' ' + _escHtml(_statutLabel(note.statut)) + '</strong></span>' +
                    '<span class="kta-secours-live-note-ts">⏱️ ' + _escHtml(tsStr) + '</span>' +
                    '<button class="kta-secours-live-note-del" data-action="sec-del-note" data-note-id="' + _escAttr(note.id) + '" title="' + _escAttr(t("secours.list.supprimerTitle")) + '">✕</button>' +
                  '</div>' +
                  (note.texte ? '<div class="kta-secours-live-note-texte">' + _escHtml(note.texte) + '</div>' : '') +
                '</div>';
      });
    }
    html += '</div>';

    // Footer
    html += '<div class="kta-secours-live-footer">' +
              '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="live-toggle-pause">' +
                (s.execution.pausedAt ? t("secours.live.reprendre") : t("secours.live.pause")) +
              '</button>' +
              // 🆕 v1.25.0 — Bouton Rapport (mode Secouriste : scope = "secouriste" → notes libres)
              '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="live-rapport" data-scope="secouriste" title="' + _escAttr(t("secours.liveSec.rapportTitle")) + '">' +
                t("secours.bandeau.rapport") +
              '</button>' +
              // 🆕 v1.41.1 — Vue OSM + Briefing pompiers accessibles depuis vue Secouriste.
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="ouvrir-vue-osm" title="' + _escAttr(t("secours.live.vueOsmTitle")) + '">' +
                t("secours.bandeau.vueOsm") +
              '</button>' +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="briefing-pompiers" title="' + _escAttr(t("secours.bandeau.briefingTitlePost")) + '">' +
                t("secours.bandeau.briefing") +
              '</button>' +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="back-to-edit">' +
                t("secours.live.voirEdition") +
              '</button>' +
              '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="arreter-plan-live">' +
                t("secours.liveSec.terminerMission") +
              '</button>' +
            '</div>';
    return html;
  }

  // Rendu mini-grille des photos d'une étape (miniatures cliquables ouvrant
  // le viewer plein écran existant + bouton ✕ pour supprimer).
  function _renderLiveEtapePhotos(s, equipeId, etapeIdx) {
    const etape = (_getEtapesEquipe(s, equipeId) || [])[etapeIdx];
    if (!etape || !Array.isArray(etape.photoIds) || etape.photoIds.length === 0) {
      return '';
    }
    let html = '<div class="kta-secours-live-photos-grid">';
    etape.photoIds.forEach(function(pid) {
      html += '<div class="kta-secours-live-photo-slot" data-photo-id="' + _escAttr(pid) + '">' +
                '<div class="kta-secours-live-photo-placeholder" data-photo-id="' + _escAttr(pid) + '">📸</div>' +
                '<button class="kta-secours-live-photo-del" data-action="live-photo-del" data-photo-id="' + _escAttr(pid) + '" title="' + _escAttr(t("secours.live.supprimerPhoto")) + '">✕</button>' +
              '</div>';
    });
    html += '</div>';
    return html;
  }

  function _renderHeatmapToolBlock() {
    // Skip si le module Heatmap n'est pas chargé (rétro-compat)
    if (!window.MyKTAMapHeatmap || typeof window.MyKTAMapHeatmap.afficher !== "function") {
      return "";
    }
    // 🐛 v1.23.4-fix (KARMA "afficher le heatmap n'affiche plus le réglage
    // pourtant ça fonctionnait") :
    // Avant la fix, le bouton "⚙️ Régler" était conditionnel sur la double
    // condition `_secoursHeatmapActive && MyKTAMapHeatmap.isVisible()`.
    // Problème : sync fragile entre state local + state global heatmap.
    // L'user peut effacer la heatmap depuis sa modale dédiée → désync →
    // bouton Régler disparaît alors qu'on en a besoin pour ré-activer.
    //
    // Fix : bouton "⚙️ Régler" TOUJOURS visible tant que le module Heatmap
    // est chargé. Plus UX-friendly aussi : l'user peut Régler AVANT même
    // d'avoir cliqué Afficher (pour configurer ses sources en amont).
    //
    // Le bouton "🔥 Afficher/Masquer" garde son toggle dynamique.
    const isActive = _secoursHeatmapActive && window.MyKTAMapHeatmap.isVisible &&
                     window.MyKTAMapHeatmap.isVisible();
    return '<div class="kta-secours-tool-block">' +
             '<div class="kta-secours-tool-block-titre">' + t("secours.heatmap.titre") + '</div>' +
             '<div class="kta-secours-tool-block-desc">' +
               t("secours.heatmap.desc") +
             '</div>' +
             '<div class="kta-secours-tool-block-actions">' +
               '<button class="kta-btn kta-btn-' + (isActive ? "primary" : "secondary") +
                 ' kta-btn-sm" data-action="toggle-heatmap-secours">' +
                 (isActive ? t("secours.heatmap.masquer") : t("secours.heatmap.afficher")) +
               '</button>' +
               '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="config-heatmap-secours" ' +
                 'title="' + _escAttr(t("secours.heatmap.reglerTitle")) + '">' +
                 t("secours.heatmap.regler") +
               '</button>' +
             '</div>' +
           '</div>';
  }

  // Bloc UI « durée estimée » : vitesse de fouille + pause par étape, propres au
  // SCÉNARIO (`reglagesDuree`, 4.1) — indépendants de la modale Itinéraire.
  // Au changement → recalcul des durées estimées de toutes les équipes.
  function _renderPauseToolBlock() {
    // 4.1 : réglages du SCÉNARIO (plus ceux de l'itinéraire principal).
    const r = _reglagesDuree(get(_currentScenarioId));
    return '<div class="kta-secours-tool-block">' +
             '<div class="kta-secours-tool-block-titre">' + t("secours.duree.titre") + '</div>' +
             '<div class="kta-secours-tool-block-desc">' + t("secours.duree.desc") + '</div>' +
             '<div class="kta-secours-pause-row">' +
               '<div class="kta-secours-pause-input-wrap">' +
                 '<label for="kta-sec-vitesse">' + t("secours.duree.vitesseLabel") + '</label>' +
                 '<input type="number" id="kta-sec-vitesse" min="0.2" max="8" step="0.1" value="' + r.vitesseKmh + '">' +
                 '<span class="kta-secours-pause-unit">km/h</span>' +
               '</div>' +
               '<div class="kta-secours-pause-input-wrap">' +
                 '<label for="kta-sec-pause-min">' + t("secours.duree.pauseLabel") + '</label>' +
                 '<input type="number" id="kta-sec-pause-min" min="0" max="120" step="1" value="' + Math.round(r.pauseMin) + '">' +
                 '<span class="kta-secours-pause-unit">min</span>' +
               '</div>' +
             '</div>' +
           '</div>';
  }

  // 🩸 29/09/2026 (audit Secours, 4.1 — décision KARMA : réglages Secours propres).
  // Les durées reprenaient la vitesse de l'itinéraire (5 km/h) et la pause commune
  // (15 min) ajoutée à CHAQUE étape : ~971 min affichées dont 795 de pauses pour un
  // secteur réel, contre ~586 réalistes. Le scénario porte désormais ses propres
  // réglages (voyagent dans le .mkmsec) : vitesse de fouille, pause par étape.
  const DUREE_DEFAUT = { vitesseKmh: 1.5, pauseMin: 0 };
  function _reglagesDuree(s) {
    const r = (s && s.reglagesDuree) || {};
    return {
      vitesseKmh: (typeof r.vitesseKmh === "number" && r.vitesseKmh > 0) ? r.vitesseKmh : DUREE_DEFAUT.vitesseKmh,
      pauseMin:   (typeof r.pauseMin === "number" && r.pauseMin >= 0) ? r.pauseMin : DUREE_DEFAUT.pauseMin
    };
  }
  function _dureeEquipeMin(s, distM, nbWaypoints) {
    if (typeof distM !== "number" || distM <= 0) return 0;
    const r = _reglagesDuree(s);
    return distM / (r.vitesseKmh * 1000 / 60) + Math.max(0, (nbWaypoints || 0) - 2) * r.pauseMin;
  }

  // 🩸 4e relecture (R4-6, décision KARMA a) — un scénario d'avant 4.1 gardait ses
  // durées à 5 km/h + 15 min/étape (cartes, PDF, KMZ) alors que le bloc ⏱️ affichait
  // 1,5 km/h. Pas encore de réglages → réglages par défaut posés (= migration faite,
  // idempotente) et durées recalculées. Retourne true si le scénario a changé.
  function _migrerDurees(s) {
    if (!s || typeof s !== "object" || s.reglagesDuree) return false;
    s.reglagesDuree = { vitesseKmh: DUREE_DEFAUT.vitesseKmh, pauseMin: DUREE_DEFAUT.pauseMin };
    (s.groupes || []).forEach(function(g) {
      if (typeof g.distanceM !== "number" || g.distanceM <= 0) return;
      const nbWp = (g.entree ? 1 : 0) + (Array.isArray(g.intermediaires) ? g.intermediaires.length : 0) + (g.sortie ? 1 : 0);
      g.dureeEstimeeMin = _dureeEquipeMin(s, g.distanceM, nbWp);
    });
    return true;
  }

  // 🆕 v1.23.6 — Recalcule les durées estimées de toutes les équipes du scénario
  // qui ont un itinéraire déjà calculé (distanceM connue) : cards, PDF, KMZ.
  function _recalculerToutesDureesEquipes(scenarioId) {
    const s = get(scenarioId);
    if (!s || !Array.isArray(s.groupes) || s.groupes.length === 0) return 0;
    let updated = 0;
    s.groupes.forEach(function(g) {
      if (typeof g.distanceM !== "number" || g.distanceM <= 0) return;
      const nbWp = (g.entree ? 1 : 0)
                 + (Array.isArray(g.intermediaires) ? g.intermediaires.length : 0)
                 + (g.sortie ? 1 : 0);
      const newDuree = _dureeEquipeMin(s, g.distanceM, nbWp);
      if (Math.abs((g.dureeEstimeeMin || 0) - newDuree) > 0.01) {
        g.dureeEstimeeMin = newDuree;
        updated++;
      }
    });
    if (updated > 0) {
      s.updatedAt = _nowIso();
      _commitMutation(s);
    }
    return updated;
  }

  // 🆕 v1.23.0 Phase 2 / Feature C — Bloc lecture seule lastKnownPoint +
  // zoneIncertitude si pré-rempli depuis Lost Mode. Boutons "Recentrer carte"
  // + "✕ Retirer" si l'user veut nettoyer.
  function _renderContextImportedBlock(s) {
    const c = s.context || {};
    if (!c.lastKnownPoint && !c.zoneIncertitude) return "";
    let html = '<div class="kta-secours-context-imported">';
    html += '<div class="kta-secours-context-imported-titre">' + t("secours.ctxImport.titre") + '</div>';
    if (c.lastKnownPoint) {
      const lp = c.lastKnownPoint;
      const lbl = lp.label || ("x=" + Math.round(lp.x) + " y=" + Math.round(lp.y));
      html += '<div class="kta-secours-context-imported-row">' +
                '<span>' + t("secours.ctxImport.dernierePosition") + '</span> <strong>' + _escHtml(lbl) + '</strong>' +
                (typeof lp.level === "number" && window.APP_CONFIG && window.APP_CONFIG.multiLevel
                  ? ' <span class="kta-secours-parcours-lvl">' + t("secours.ctxImport.niv", { level: lp.level }) + '</span>'
                  : '') +
              '</div>';
    }
    if (c.zoneIncertitude) {
      html += '<div class="kta-secours-context-imported-row">' +
                '<span>' + t("secours.ctxImport.zoneIncertitude") + '</span> <strong>' +
                t("secours.ctxImport.rayon", { rayon: Math.round(c.zoneIncertitude.radiusMeters || 0) }) + '</strong>' +
              '</div>';
    }
    html += '<div class="kta-secours-context-imported-actions">' +
              '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="recentrer-lostpos">' + t("secours.ctxImport.recentrer") + '</button>' +
              '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="clear-lostpos" title="' + _escAttr(t("secours.ctxImport.retirerTitle")) + '">' + t("secours.ctxImport.retirer") + '</button>' +
            '</div>';
    html += '</div>';
    return html;
  }

  // 🆕 v1.22.0-fix2 — Section Parcours d'une équipe (entree + intermediaires + sortie)
  function _renderParcoursSection(g) {
    let html = '<div class="kta-secours-parcours">';
    html += '<div class="kta-secours-parcours-titre">' + t("secours.parcours.titre") + '</div>';
    html += '<div class="kta-secours-parcours-list">';
    // Entrée
    // 🐛 v1.23.2-fix (KARMA audit UX P2 — cohérence boucle modale vs carte) :
    // détecte la boucle entrée=sortie pour passer un flag aux rows entrée
    // et sortie (border-left orange au lieu de vert/rouge, cohérent avec
    // l'overlay carte qui rend un marker orange "↻ Boucle").
    const isBoucle = _samePoint(g.entree, g.sortie);
    html += _renderWaypointRow(g, "entree", g.entree, null, "📍", t("secours.parcours.entree"), isBoucle);
    // Intermédiaires
    (g.intermediaires || []).forEach(function(w, i) {
      html += _renderWaypointRow(g, "intermediaire", w, i, "▾", t("secours.parcours.etape", { n: (i + 1) }), false);
    });
    // Bouton "Ajouter étape intermédiaire"
    html += '<button class="kta-btn kta-btn-ghost kta-btn-sm kta-secours-parcours-add"' +
            ' data-action="add-intermediaire" data-gid="' + _escAttr(g.id) + '">' +
            t("secours.parcours.btnAjouterEtape") + '</button>';
    // Sortie
    html += _renderWaypointRow(g, "sortie", g.sortie, null, "🚪", t("secours.parcours.sortie"), isBoucle);
    // Hint si entrée === sortie (boucle)
    if (g.entree && g.sortie && _samePoint(g.entree, g.sortie)) {
      html += '<div class="kta-secours-parcours-hint">' + t("secours.parcours.boucleHint") + '</div>';
    }
    html += '</div>';
    html += '</div>';
    return html;
  }

  function _renderWaypointRow(g, role, w, idx, emoji, defaultLabel, isBoucle) {
    const gid = _escAttr(g.id);
    const isInter = (role === "intermediaire");
    const idxAttr = isInter ? ' data-idx="' + idx + '"' : '';
    let label = "";
    if (w) {
      label = w.label ? _escHtml(w.label)
            : (_gpsTxt(w.x, w.y) ? "GPS " + _gpsTxt(w.x, w.y) : ("x=" + Math.round(w.x) + " y=" + Math.round(w.y)));
      if (typeof w.level === "number" && window.APP_CONFIG && window.APP_CONFIG.multiLevel) {
        label += " <span class='kta-secours-parcours-lvl'>" + t("secours.ctxImport.niv", { level: w.level }) + "</span>";
      }
    } else {
      label = '<em class="kta-secours-parcours-todo">' + t("secours.parcours.nonDefini") + '</em>';
    }
    // 🆕 v1.23.2-fix UX P2 — data-loop="1" sur entrée+sortie si boucle
    // (border-left orange via CSS, cohérent avec l'overlay carte)
    const loopAttr = (isBoucle && (role === "entree" || role === "sortie"))
                     ? ' data-loop="1"' : '';
    let html = '<div class="kta-secours-parcours-row" data-role="' + role + '"' + idxAttr + loopAttr + '>' +
                 '<span class="kta-secours-parcours-emoji">' + emoji + '</span>' +
                 '<span class="kta-secours-parcours-label">' +
                   '<strong>' + defaultLabel + '</strong> : ' + label +
                 '</span>' +
                 '<span class="kta-secours-parcours-btns">' +
                   '<button class="kta-btn kta-btn-ghost kta-btn-xs" data-action="pick-waypoint"' +
                   ' data-gid="' + gid + '" data-role="' + role + '"' + idxAttr +
                   ' title="' + _escAttr(t("secours.parcours.pickTitle")) + '">' +
                   (w ? '✏️' : '📍') + '</button>';
    if (isInter || w) {
      html += '<button class="kta-btn kta-btn-ghost kta-btn-xs" data-action="clear-waypoint"' +
              ' data-gid="' + gid + '" data-role="' + role + '"' + idxAttr +
              ' title="' + _escAttr(isInter ? t("secours.parcours.retirerEtape") : t("secours.parcours.effacer")) + '">🗑️</button>';
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
          if (window.confirm(t("secours.confirm.supprimerScenario", { nom: s.nom }))) {
            deleteScenario(id);
            _switchView("list");
          }
        });
      });
      // 🆕 v1.23.4 — Import .mkmsec.json (file picker + appel importerScenario)
      corps.querySelectorAll('[data-action="import-mkmsec"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _ouvrirImportMkmsecPicker();
        });
      });
      /* ⛔ Phase 4 (QR Share) ROLLBACK hotfix17 — handler scan-qr-briefing retiré. */
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
      // 🆕 v1.24.0 Phase 3 — Handlers du bandeau "Lancer le plan"
      corps.querySelectorAll('[data-action="ouvrir-lancer-modale"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _afficherModaleLancer(s.id, function(opts) {
            const lancer = function() {
              lancerExecution(s.id, opts);
              _toast(t("secours.toast.planLance"), "info");
              _switchView("live");
            };
            // 3e relecture (R3-7) : relancer efface l'intervention précédente ET ses
            // photos (reçues des équipes comprises) — on le dit avant.
            if (s.execution && typeof window.ktaConfirm === "function") {
              window.ktaConfirm(t("secours.lancer.relanceConfirme")).then(function(ok) { if (ok) lancer(); });
            } else {
              lancer();
            }
          });
        });
      });
      corps.querySelectorAll('[data-action="reprendre-live"]').forEach(function(btn) {
        btn.addEventListener("click", function() { _switchView("live"); });
      });
      corps.querySelectorAll('[data-action="arreter-plan"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (!window.confirm(t("secours.confirm.arreterPlan"))) return;
          arreterExecution(s.id);
          _toast(t("secours.toast.planArrete"), "info");
          _switchView("edit");
        });
      });
      // 🆕 v1.25.0 — Bouton "📤 Rapport" depuis le bandeau vue Edit
      // (accessible si execution active OU terminée). Le scope est lu depuis
      // data-scope (= rôle de l'execution = "operateur" | "equipe" | "secouriste").
      corps.querySelectorAll('[data-action="edit-rapport"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const scope = btn.getAttribute("data-scope") || (s.execution && s.execution.role) || "operateur";
          _afficherModaleRapport(s.id, scope);
        });
      });
      // 🆕 v1.40.33 (Synergie A v1) — Bouton "🌍 Vue OSM" : ouvre la modale
      // Vue OSM (osmView.js) avec le plan georef projeté sur OpenStreetMap.
      // Utile pour briefer des secours externes, debriefer post-mission, ou
      // situer le site géographiquement.
      corps.querySelectorAll('[data-action="ouvrir-vue-osm"]').forEach(function(btn) {
        btn.addEventListener("click", _ouvrirVueOsmDepuisSecours);
      });
      // 🆕 v1.41.0 C — Bouton "🚒 Briefing pompiers" : exporte un PDF dédié
      // (vue surface OSM + équipes GPS + POI critiques). Utile pour transmettre
      // aux secours externes avant ou pendant intervention.
      // 🆕 v1.42.11 — Ouvre une modale d'options (choix des couches OSM à
      // inclure dans la capture) AVANT la génération PDF.
      corps.querySelectorAll('[data-action="briefing-pompiers"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _afficherModaleBriefingOptions(s.id);
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
            btn.textContent = t("secours.edit.voirCarte");
          } else {
            // Toggle ON : masque modale + render overlay + affiche floater retour
            renderOverlay(_currentScenarioId);
            if (_modal) _modal.style.display = "none";
            _showOverlayFloater();
            btn.textContent = t("secours.edit.masquer");
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
          if (!window.confirm(t("secours.confirm.retirerLostpos"))) return;
          updateScenario(s.id, {
            context: { lastKnownPoint: null, zoneIncertitude: null }
          });
          _switchView("edit");
        });
      });
      // 🆕 v1.23.0 Feature D — Toggle heatmap d'activité Mode Secours
      corps.querySelectorAll('[data-action="toggle-heatmap-secours"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (!window.MyKTAMapHeatmap) { _toast(t("secours.toast.heatmapIndisponible"), "error"); return; }
          if (_secoursHeatmapActive && window.MyKTAMapHeatmap.isVisible()) {
            window.MyKTAMapHeatmap.effacer();
            _secoursHeatmapActive = false;
            _toast(t("secours.toast.heatmapMasquee"), "info");
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
              _toast(t("secours.toast.heatmapAffichee"), "info");
            } catch(e) {
              console.warn("[SecoursMode] Heatmap échec :", e);
              _toast(t("secours.toast.erreurHeatmap", { message: e.message }), "error");
            }
          }
          _switchView("edit");   // re-render pour update label bouton
        });
      });
      // 🆕 v1.23.0 Feature D — Ouvre la modale Heatmap classique pour réglages avancés
      // 🐛 v1.23.0-fix1 (KARMA "si je fais regler, il ferme le modal secours
      // et me regle le heatmap en mode normal") : MutationObserver qui détecte
      // la disparition de la modale Heatmap du DOM (close via ✕, Escape,
      // backdrop, ou ❌ Effacer) → restore display de la modale Mode Secours.
      // Sans ça, la modale Mode Secours restait cachée pour de bon.
      corps.querySelectorAll('[data-action="config-heatmap-secours"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (!window.MyKTAMapHeatmap || typeof window.MyKTAMapHeatmap.ouvrirModale !== "function") {
            _toast(t("secours.toast.heatmapModaleIndispo"), "error");
            return;
          }
          if (_modal) _modal.style.display = "none";
          window.MyKTAMapHeatmap.ouvrirModale();
          // Observer la disparition de #kta-heatmap-modal pour restore Mode Secours
          // (cf js/heatmap.js — id de la modale = "kta-heatmap-modal")
          const hmModal = document.getElementById("kta-heatmap-modal");
          if (!hmModal) {
            // ouvrirModale n'a pas pu append → restaure direct
            if (_modal) _modal.style.display = "";
            return;
          }
          const obs = new MutationObserver(function() {
            if (!document.body.contains(hmModal)) {
              if (_modal) _modal.style.display = "";
              // Re-render edit pour update du label bouton "🔥 Masquer/Afficher"
              // (l'état _secoursHeatmapActive peut avoir changé)
              if (_currentScenarioId) _switchView("edit");
              obs.disconnect();
            }
          });
          obs.observe(hmModal.parentNode || document.body, { childList: true });
        });
      });
      // 🆕 v1.23.6 — Handlers du bloc Pause configurable.
      // Au change → persiste localStorage (via setters globaux exposés par
      // interface.js) + recalcule durées de toutes les équipes du scénario
      // courant (via _recalculerToutesDureesEquipes) + re-render edit pour
      // update visuel des chips durée dans les cards équipes + toast feedback.
      // 4.1 : réglages de durée du scénario → recalcul des durées de toutes les équipes.
      const vitesseInput = document.getElementById("kta-sec-vitesse");
      const pauseMinInput = document.getElementById("kta-sec-pause-min");
      const majDurees = function() {
        updateScenario(_currentScenarioId, { reglagesDuree: {
          vitesseKmh: parseFloat(vitesseInput && vitesseInput.value),
          pauseMin:   parseFloat(pauseMinInput && pauseMinInput.value)
        } });
        const updated = _recalculerToutesDureesEquipes(_currentScenarioId);
        _toast(t("secours.toast.dureesMaj", { n: updated }), "info");
        _switchView("edit");
      };
      // « change » (blur + Entrée), pas « input » : pas de recalcul à chaque chiffre.
      if (vitesseInput) vitesseInput.addEventListener("change", majDurees);
      if (pauseMinInput) pauseMinInput.addEventListener("change", majDurees);
      // 🆕 v1.23.3 (KARMA "crée une équipe et lui assigné une zone sur un
      // niveau") : "+ Ajouter une équipe" ouvre désormais un mini-prompt qui
      // demande nom + niveau (dropdown des availableLevels). Si plan
      // mono-niveau (M-LVL OFF), comportement v1.22.x strict préservé (juste
      // addGroupe avec nom auto).
      corps.querySelectorAll('[data-action="add-groupe"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const isMlvl = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
          if (!isMlvl) {
            // Plan mono-niveau : ajout direct avec nom auto (cohérent v1.22.x)
            addGroupe(s.id, null);
            _switchView("edit");
            return;
          }
          // Plan multi-niveau : ouvre la mini-prompt
          _ouvrirCreerEquipeMlvlPrompt(s.id);
        });
      });
      // 🆕 v1.23.0 Phase 2 / Feature E — Auto-création 1 équipe par niveau M-LVL
      corps.querySelectorAll('[data-action="auto-equipes-mlvl"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (!window.APP_CONFIG || window.APP_CONFIG.multiLevel !== true) {
            _toast(t("secours.toast.mlvlNonActif"), "warn");
            return;
          }
          const levels = _niveauxPourEquipesAuto();
          if (levels.length < 2) {
            _toast(t("secours.toast.auMoins2Niveaux"), "warn");
            return;
          }
          // Confirme si des équipes existent déjà (anti-doublon massif)
          if (s.groupes.length > 0) {
            if (!window.confirm(t("secours.confirm.autoEquipes", { existant: s.groupes.length, nouveau: levels.length }))) return;
          }
          // Crée 1 équipe par niveau, nom = "Niveau X" (avec convention RDC pour 0)
          // 🆕 v1.23.3 : passe le level explicitement à addGroupe → g.level
          // est correctement set (pas écrasé par APP_CONFIG.activeLevel défaut).
          levels.forEach(function(lvl) {
            const nom = t("secours.level.niveau", { label: _lblNiveau(lvl) });
            const g = addGroupe(s.id, nom, lvl);
            // Pré-set le level de l'entrée à ce niveau (sera défini via clic carte
            // ensuite, mais le level par défaut est posé pour cohérence Pathfinder).
            // L'user peut overrider si besoin. On ne crée PAS de waypoint placeholder
            // pour éviter de polluer le parcours avec des coords (0,0).
            // Le level est juste un indice contextuel — l'user clique 📍 Entrée
            // pour définir le vrai point qui aura son level réel via APP_CONFIG.activeLevel
            // au moment du clic.
            // Note dans le nom déjà suffisamment explicite.
          });
          _toast(t("secours.toast.equipesCreees", { n: levels.length }), "info");
          _switchView("edit");
        });
      });
      // 🆕 v1.29.0 C2 — Multi-phases : handlers add-phase / edit-phase / delete-phase.
      // Présents en vue Edit (section "📋 Phases") ET en vue Live Op (footer ➕).
      corps.querySelectorAll('[data-action="add-phase"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _afficherModalePhase(s.id, null);
        });
      });
      corps.querySelectorAll('[data-action="edit-phase"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const idxAttr = btn.getAttribute("data-phase-idx");
          const idx = parseInt(idxAttr, 10);
          if (Number.isInteger(idx)) _afficherModalePhase(s.id, idx);
        });
      });
      corps.querySelectorAll('[data-action="delete-phase"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (btn.hasAttribute("disabled")) return;
          const idxAttr = btn.getAttribute("data-phase-idx");
          const idx = parseInt(idxAttr, 10);
          if (!Number.isInteger(idx)) return;
          const phase = s.phases[idx];
          if (!phase) return;
          const confirmMsg = t("secours.confirm.supprimerPhase", { nom: phase.nom });
          if (!window.confirm(confirmMsg)) return;
          const ok = supprimerPhase(s.id, idx);
          if (ok) {
            _toast(t("secours.toast.phaseSupprimee"), "info");
            _switchView(_activeView || "edit");
          } else {
            _toast(t("secours.toast.phaseSuppressionImpossible"), "error");
          }
        });
      });
      // Replier / déplier une équipe, ou toutes
      corps.querySelectorAll('[data-action="toggle-groupe"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const gid = btn.getAttribute("data-gid");
          const oui = !_estRepliee(gid);
          _setRepliee(gid, oui);
          _appliquerRepli(btn.closest(".kta-secours-groupe-card"), oui);
        });
      });
      corps.querySelectorAll('[data-action="toggle-toutes-equipes"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const oui = !s.groupes.every(function(g) { return _estRepliee(g.id); });
          s.groupes.forEach(function(g) { _setRepliee(g.id, oui); });
          corps.querySelectorAll(".kta-secours-groupe-card").forEach(function(c) { _appliquerRepli(c, oui); });
          btn.textContent = oui ? t("secours.edit.toutDeplier") : t("secours.edit.toutReplier");
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
      // 🆕 v1.41.0 E — Edit GPS surface équipe. Parse "lat, lng" → {lat, lng}.
      //    Vide ou format invalide → null (équipe sans GPS surface assigné).
      corps.querySelectorAll('[data-action="edit-surface-gps"]').forEach(function(inp) {
        inp.addEventListener("blur", function() {
          const raw = (inp.value || "").trim();
          let gps = null;
          if (raw) {
            const m = raw.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
            if (m) {
              const lat = parseFloat(m[1]);
              const lng = parseFloat(m[2]);
              if (Number.isFinite(lat) && Number.isFinite(lng)
                  && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                gps = { lat: lat, lng: lng };
              }
            }
            if (!gps) {
              _toast(t("secours.toast.gpsInvalide"), "error");
              return;
            }
          }
          updateGroupe(s.id, inp.getAttribute("data-gid"), { surfaceGps: gps });
        });
      });
      // Change couleur
      corps.querySelectorAll('[data-action="change-couleur"]').forEach(function(sel) {
        sel.addEventListener("change", function() {
          updateGroupe(s.id, sel.getAttribute("data-gid"), { couleurIdx: parseInt(sel.value, 10) });
          _switchView("edit");      // re-render pour update du swatch
        });
      });
      // 🆕 v1.23.3 — Change level M-LVL de référence de l'équipe
      corps.querySelectorAll('[data-action="change-level"]').forEach(function(sel) {
        sel.addEventListener("change", function() {
          const v = sel.value;
          const level = (v === "" || v == null) ? null : parseInt(v, 10);
          updateGroupe(s.id, sel.getAttribute("data-gid"), { level: level });
          _switchView("edit");      // re-render pour update du chip
        });
      });
      /* ⛔ Phase 4 (QR Share) ROLLBACK hotfix17 — handler share-qr retiré. */
      // Delete groupe
      corps.querySelectorAll('[data-action="del-groupe"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const gid = btn.getAttribute("data-gid");
          const g = s.groupes.find(function(x) { return x.id === gid; });
          if (!g) return;
          if (window.confirm(t("secours.confirm.supprimerEquipe", { nom: g.nom }))) {
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
          const gid = btn.getAttribute("data-gid");
          // 🌀 v1.55.1 : overlay « calcul en cours » (Pathfinder.computeRoute
          // est SYNC bloquant → sans yield-to-paint l'écran fige).
          const _msg = (window.I18n && window.I18n.t) ? window.I18n.t("secours.compute.loading") : "Calcul de l'itinéraire…";
          if (window.ComputeLoader && window.ComputeLoader.wrap) {
            window.ComputeLoader.wrap(function() { return _recalculerItineraireGroupe(s.id, gid); }, _msg);
          } else {
            _recalculerItineraireGroupe(s.id, gid);
          }
        });
      });
      // Export PDF — async depuis fix5 (génère canvas plan + crop par équipe)
      corps.querySelectorAll('[data-action="export-pdf"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          Promise.resolve(exporterPDF(s.id)).catch(function(e) {
            console.warn("[SecoursMode] exporterPDF rejected :", e);
            _toast(t("secours.toast.erreurPdf", { message: (e.message || e) }), "error");
          });
        });
      });
      // Export KMZ
      corps.querySelectorAll('[data-action="export-kmz"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          // 🆕 v1.23.0 — exporterKMZ est async (fetch plan image) — catch les rejets
          Promise.resolve(exporterKMZ(s.id)).catch(function(e) {
            console.warn("[SecoursMode] exporterKMZ rejected :", e);
            _toast(t("secours.toast.erreurKmz", { message: (e.message || e) }), "error");
          });
        });
      });
      // 🆕 v1.23.4 — Export scénario standalone (.mkmsec.json) pour partage
      corps.querySelectorAll('[data-action="export-mkmsec"]').forEach(function(btn) {
        btn.addEventListener("click", function() { exporterScenario(s.id); });
      });
    }

    // 🆕 v1.24.0 Phase 3 — Handlers de la vue Live (3 sous-modes)
    if (view === "live") {
      const s = get(_currentScenarioId);
      if (!s || !_estExecutionActive(s)) {
        // Fallback : pas d'execution → retour edit (déjà géré dans _renderLiveView)
        return;
      }
      const role = s.execution.role;

      // Handlers communs aux 3 sous-vues
      _bindLiveCommonHandlers(corps, s);

      // Handlers spécifiques au sous-rôle
      if (role === "equipe")     _bindLiveEquipeHandlers(corps, s);
      if (role === "operateur")  _bindLiveOperateurHandlers(corps, s);
      if (role === "secouriste") _bindLiveSecouristeHandlers(corps, s);
    }
  }

  // Handlers communs aux 3 sous-vues Live
  function _bindLiveCommonHandlers(corps, s) {
    // A3 : voir / évacuer / préciser la victime (index dans _victimesDe au rendu).
    const victime = function(btn) { return _victimesDe(get(s.id))[parseInt(btn.getAttribute("data-v"), 10)] || null; };
    corps.querySelectorAll('[data-action="victime-voir"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const v = victime(btn);
        if (!v || !v.pos || !window.map) return;
        fermer();
        window.map.setView(_planToLatLng(v.pos), Math.max(window.map.getZoom(), 0));
      });
    });
    corps.querySelectorAll('[data-action="victime-evacuer"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const v = victime(btn);
        if (!v || !v.pos) return;
        if (!window.SortieUrgence || typeof window.SortieUrgence.declencherDepuis !== "function") {
          _toast(t("secours.victime.sortieIndispo"), "error");
          return;
        }
        fermer();   // la zone et le tracé restent (intervention en cours)
        window.SortieUrgence.declencherDepuis(v.pos.x, v.pos.y, v.pos.level);
      });
    });
    corps.querySelectorAll('[data-action="victime-preciser"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const v = victime(btn);
        if (!v || v.idx == null) return;
        const sid = s.id, gid = v.g.id, idx = v.idx;
        _startPickPoint(t("secours.victime.preciserInstr"), function(pt) {
          updateEtape(sid, gid, idx, { victimePos: { x: pt.x, y: pt.y, level: pt.level } });
          if (_modal) _switchView("live");   // la fenêtre revient avec la position à jour
          _toast(t("secours.victime.preciseeToast"), "info");
        });
      });
    });
    // Retour à la vue Edit (préserve l'execution active)
    corps.querySelectorAll('[data-action="back-to-edit"]').forEach(function(btn) {
      btn.addEventListener("click", function() { _switchView("edit"); });
    });
    // 🆕 v1.29.0 C2 — Bouton "➕ Ajouter une phase" dans le footer Live Op
    // (KARMA C2.2:c — création à chaud pendant l'exécution).
    corps.querySelectorAll('[data-action="add-phase"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _afficherModalePhase(s.id, null);
      });
    });
    // Arrêter le plan depuis la vue Live
    corps.querySelectorAll('[data-action="arreter-plan-live"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (!window.confirm(t("secours.confirm.terminerPlanLive"))) return;
        arreterExecution(s.id);
        _toast(t("secours.toast.planTermineSauv"), "info");
        _switchView("edit");
      });
    });
    // Toggle pause
    corps.querySelectorAll('[data-action="live-toggle-pause"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const isPaused = !!s.execution.pausedAt;
        pauseExecution(s.id, !isPaused);
        _toast(isPaused ? t("secours.toast.reprisePlan") : t("secours.toast.planEnPause"), "info");
        _switchView("live");
      });
    });
    // 🆕 v1.25.0 — Bouton "📤 Rapport" (commun aux 3 vues Live)
    // Le scope est lu depuis data-scope sur le bouton (= "equipe" |
    // "operateur" | "secouriste" selon le footer qui l'a posé).
    corps.querySelectorAll('[data-action="live-rapport"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const scope = btn.getAttribute("data-scope") || s.execution.role;
        _afficherModaleRapport(s.id, scope);
      });
    });
    // 🆕 v1.41.1 — Bouton "🌍 Vue OSM" (commun aux 3 vues Live).
    //    Réutilise _ouvrirVueOsmDepuisSecours qui gère le gating natif
    //    (opt-in, strict offline, incognito, online, georef présent...).
    corps.querySelectorAll('[data-action="ouvrir-vue-osm"]').forEach(function(btn) {
      btn.addEventListener("click", _ouvrirVueOsmDepuisSecours);
    });
    // 🆕 v1.41.1 — Bouton "🚒 Briefing pompiers" (commun aux 3 vues Live).
    //    Exporte un PDF dédié (vue surface OSM + équipes GPS + POI critiques).
    // 🆕 v1.42.11 — Ouvre modale d'options de couches OSM avant génération.
    corps.querySelectorAll('[data-action="briefing-pompiers"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _afficherModaleBriefingOptions(s.id);
      });
    });
    /* ⛔ Phase 4 (QR Share) ROLLBACK hotfix17 — handler live-share-obs-qr retiré.
       Le remplaçant fichier (`💾 Exporter mes obs`) sera ajouté hotfix18. */
  }

  // Handlers vue Live Mode Équipe
  function _bindLiveEquipeHandlers(corps, s) {
    const equipeId = s.execution.currentEquipeId;
    const etapes = _getEtapesEquipe(s, equipeId);
    if (etapes.length === 0) return;
    const idx = _liveEquipeFocusIdx;

    // Navigation entre étapes via boutons prev/next
    corps.querySelectorAll('[data-action="live-prev"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (_liveEquipeFocusIdx > 0) {
          _autoCompletePreviousIfNeeded(s, equipeId, _liveEquipeFocusIdx - 1);
          _liveEquipeFocusIdx--;
          _switchView("live");
        }
      });
    });
    corps.querySelectorAll('[data-action="live-next"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (_liveEquipeFocusIdx < etapes.length - 1) {
          // En passant à l'étape suivante, marque l'étape actuelle comme
          // "passée" si elle est encore pending (= l'user n'a pas explicitement
          // mis un statut). Pose un statut RAS par défaut + completedAt.
          const cur = etapes[_liveEquipeFocusIdx];
          if (cur && (!cur.statut || cur.statut === "pending")) {
            marquerEtapeStatut(s.id, equipeId, _liveEquipeFocusIdx, "ras");
          } else if (cur && !cur.completedAt) {
            updateEtape(s.id, equipeId, _liveEquipeFocusIdx, { completedAt: _nowIso() });
          }
          // 🆕 v1.34.27 — Vibration medium pour confirmer la validation d'étape
          // par l'équipe. Cohérent avec waypoint atteint Mode Itinéraire (même
          // pattern). Pref + support gérés par helper.
          if (window.kta_vibrate) window.kta_vibrate.medium();
          _liveEquipeFocusIdx++;
          _switchView("live");
        }
      });
    });

    // Clic sur un step du stepper
    corps.querySelectorAll('[data-action="live-goto-step"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const targetIdx = parseInt(btn.getAttribute("data-step"), 10);
        if (isFinite(targetIdx) && targetIdx >= 0 && targetIdx < etapes.length) {
          _liveEquipeFocusIdx = targetIdx;
          _switchView("live");
        }
      });
    });

    // Save observations au blur (évite re-render entre chaque keystroke)
    const obsInput = corps.querySelector('#kta-live-obs-' + idx);
    if (obsInput) {
      obsInput.addEventListener("blur", function() {
        updateEtape(s.id, equipeId, idx, { observations: obsInput.value });
        // Pose startedAt si pas encore set (= 1ère interaction sur l'étape)
        const etape = etapes[idx];
        if (etape && !etape.startedAt) {
          updateEtape(s.id, equipeId, idx, { startedAt: _nowIso() });
        }
      });
    }

    // Boutons de saisie rapide statut
    corps.querySelectorAll('[data-action="live-set-statut"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const statutId = btn.getAttribute("data-statut");
        // Save aussi le textarea actuel avant le re-render
        if (obsInput) {
          updateEtape(s.id, equipeId, idx, { observations: obsInput.value });
        }
        marquerEtapeStatut(s.id, equipeId, idx, statutId);
        const info = _getStatutInfo(statutId);
        _toast(info.emoji + " " + t("secours.toast.etapeStatut", { n: (idx + 1), statut: _statutLabel(statutId) }), "info");
        _switchView("live");
      });
    });

    // Photo
    corps.querySelectorAll('[data-action="live-photo"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _ajouterPhotoEtape(s.id, equipeId, idx);
      });
    });
    corps.querySelectorAll('[data-action="live-photo-del"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const pid = btn.getAttribute("data-photo-id");
        if (!pid) return;
        if (!window.confirm(t("secours.confirm.supprimerPhoto"))) return;
        _supprimerPhotoEtape(s.id, equipeId, idx, pid);
      });
    });

    // 🆕 v1.24.1 (KARMA "je peux pas revenir en arrière pour continuer") —
    // Retour au rôle précédent (vue Opérateur ou Secouriste) après une
    // « Prendre la main » sur cette équipe. Restore role + currentEquipeId,
    // clear les flags _previousRole/_previousEquipeId, re-render live.
    corps.querySelectorAll('[data-action="live-retour-previous-role"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const prevRole = s.execution._previousRole;
        if (!prevRole) return;
        s.execution.role = prevRole;
        s.execution.currentEquipeId = s.execution._previousEquipeId || null;
        // Clean : retire les marqueurs internes (anti-pollution payload export)
        delete s.execution._previousRole;
        delete s.execution._previousEquipeId;
        _commitMutation(s);
        const label = (prevRole === "operateur") ? t("secours.roleBandeau.operateur") : t("secours.roleBandeau.secouriste");
        _toast(t("secours.toast.retourRole", { role: label }), "info");
        _switchView("live");
      });
    });

    // Recentrer carte sur l'étape
    corps.querySelectorAll('[data-action="live-recentrer"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const etape = etapes[idx];
        if (!etape) return;
        // L'étape stocke le label mais pas les coords (héritées du parcours).
        // Récupère les coords depuis le groupe original
        const g = s.groupes.find(function(gr) { return gr.id === equipeId; });
        if (!g) return;
        let pos = null;
        if (etape.type === "entree") pos = g.entree;
        else if (etape.type === "sortie") pos = g.sortie;
        else {
          // intermédiaire idx-1 (car entree = idx 0)
          const intermIdx = idx - (g.entree ? 1 : 0);
          if (Array.isArray(g.intermediaires) && intermIdx >= 0) {
            pos = g.intermediaires[intermIdx];
          }
        }
        if (!pos || typeof pos.x !== "number" || !window.map) {
          _toast(t("secours.toast.positionIntrouvable"), "warn");
          return;
        }
        // Masque modale + centre carte
        if (_modal) _modal.style.display = "none";
        if (!_overlayLayer) renderOverlay(_currentScenarioId);
        _showOverlayFloater();
        window.map.setView(_planToLatLng(pos), Math.max(0, window.map.getZoom()), { animate: true });
      });
    });

    // Hydrate les miniatures photos en async
    _hydraterPhotosLive(corps, s.id, equipeId, idx);
  }

  // Auto-complete une étape si l'user navigue vers une plus ancienne
  // sans avoir marqué de statut (= il revient en arrière, on ne touche pas).
  // Pas d'effet pour l'instant — placeholder pour future amélioration UX.
  function _autoCompletePreviousIfNeeded(/* s, equipeId, prevIdx */) {
    // Volontairement vide : retour en arrière préserve l'état tel quel
  }

  // Helper photo : ouvre file picker + compress + add + refresh
  function _ajouterPhotoEtape(scenarioId, equipeId, etapeIdx) {
    if (!window.MyKTAMapSecoursPhotos || !window.MyKTAMapSecoursPhotos.isAvailable()) {
      _toast(t("secours.toast.photosIndisponible"), "error");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // capture="environment" → ouvre la caméra arrière sur mobile (la galerie reste accessible via UI native)
    input.setAttribute("capture", "environment");
    input.style.display = "none";
    input.addEventListener("change", function() {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      _toast(t("secours.toast.ajoutPhoto"), "info");
      window.MyKTAMapSecoursPhotos.addPhoto(scenarioId, equipeId, etapeIdx, file).then(function(photoId) {
        // Update etape.photoIds dans le scenario
        const etapes = _getEtapesEquipe(get(scenarioId), equipeId);
        const etape = etapes[etapeIdx];
        if (!etape) return;
        const newPhotoIds = (etape.photoIds || []).concat([photoId]);
        updateEtape(scenarioId, equipeId, etapeIdx, { photoIds: newPhotoIds });
        _toast(t("secours.toast.photoAjoutee"), "info");
        _switchView("live");
      }).catch(function(e) {
        console.warn("[SecoursMode] _ajouterPhotoEtape échec :", e);
        const msg = e && e.code === "QUOTA_PER_ETAPE"
                    ? t("secours.toast.photoQuota")
                    : t("secours.toast.erreurAjoutPhoto", { message: (e && e.message ? e.message : "") });
        _toast(msg, "error");
      });
    });
    document.body.appendChild(input);
    input.click();
  }

  function _supprimerPhotoEtape(scenarioId, equipeId, etapeIdx, photoId) {
    if (!window.MyKTAMapSecoursPhotos) return;
    window.MyKTAMapSecoursPhotos.deletePhoto(photoId).then(function() {
      const etapes = _getEtapesEquipe(get(scenarioId), equipeId);
      const etape = etapes[etapeIdx];
      if (!etape) return;
      const newPhotoIds = (etape.photoIds || []).filter(function(pid) { return pid !== photoId; });
      updateEtape(scenarioId, equipeId, etapeIdx, { photoIds: newPhotoIds });
      _toast(t("secours.toast.photoSupprimee"), "info");
      _switchView("live");
    }).catch(function(e) {
      console.warn("[SecoursMode] _supprimerPhotoEtape échec :", e);
      _toast(t("secours.toast.erreurSuppressionPhoto"), "error");
    });
  }

  // 🐛 v1.34.15 (Pack RAM #3) — Set des ObjectURL créées par _hydraterPhotosLive.
  // Sans ce registre, chaque appel à _hydraterPhotosLive créait N nouvelles
  // ObjectURL via getObjectUrl() sans revoke des précédentes → fuite mémoire à
  // chaque ouverture de la vue Live (1-10 Mo par hydrate selon nb photos).
  // Sur iPhone PWA, ça contribuait au crash après quelques minutes d'usage.
  // _revokeLivePhotoUrls() est appelé AVANT chaque _hydraterPhotosLive (= au
  // moment où on remplace les anciens placeholders) et au fermer() du module
  // (= sortie définitive). Le Set est partagé entre appels via la closure du
  // module IIFE.
  const _livePhotoUrls = new Set();
  function _revokeLivePhotoUrls() {
    if (_livePhotoUrls.size === 0) return;
    _livePhotoUrls.forEach(function(u) {
      try { URL.revokeObjectURL(u); } catch(e) {}
    });
    if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
      console.log("[SecoursMode] _revokeLivePhotoUrls : " + _livePhotoUrls.size + " ObjectURL libérées");
    }
    _livePhotoUrls.clear();
  }

  // Hydrate les placeholders photo avec les vraies miniatures (ObjectURL async).
  // Pattern v1.10.0 §42 (popup POI photos) adapté ici.
  // 🐛 v1.34.15 (Pack RAM #3) — Revoke des URLs précédentes AVANT de créer les
  // nouvelles. Évite fuite à chaque réouverture de la vue Live.
  function _hydraterPhotosLive(corps, scenarioId, equipeId, etapeIdx) {
    if (!window.MyKTAMapSecoursPhotos) return;
    _revokeLivePhotoUrls();
    const placeholders = corps.querySelectorAll('.kta-secours-live-photo-placeholder[data-photo-id]');
    placeholders.forEach(function(ph) {
      const pid = ph.getAttribute("data-photo-id");
      if (!pid) return;
      window.MyKTAMapSecoursPhotos.getObjectUrl(pid).then(function(url) {
        if (!url || !ph.parentNode) return;
        // 🐛 v1.34.15 — Track la nouvelle URL pour revoke ultérieur.
        _livePhotoUrls.add(url);
        const img = document.createElement("img");
        img.src = url;
        img.alt = t("secours.live.photoAlt");
        img.className = "kta-secours-live-photo-img";
        // Click → ouvre viewer plein écran réutilisant MyKTAMapPhotoViewer si dispo
        img.addEventListener("click", function() {
          if (window.MyKTAMapPhotoViewer && typeof window.MyKTAMapPhotoViewer.open === "function") {
            // Construit la liste des photos de l'étape pour navigation
            const etapes = _getEtapesEquipe(get(scenarioId), equipeId);
            const etape = etapes[etapeIdx];
            const ids = (etape && etape.photoIds) || [pid];
            const idx = ids.indexOf(pid);
            // Doit fournir des objets avec {id, getUrl: () => Promise<string>}
            const photosForViewer = ids.map(function(id) {
              return {
                id: id,
                getUrl: function() {
                  return window.MyKTAMapSecoursPhotos.getObjectUrl(id);
                }
              };
            });
            try {
              window.MyKTAMapPhotoViewer.open(photosForViewer, Math.max(0, idx));
            } catch(e) {
              // Fallback : ouvre dans nouvel onglet
              window.open(url, "_blank", "noopener,noreferrer");
            }
          } else {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        });
        ph.innerHTML = "";
        ph.appendChild(img);
      }).catch(function(e) {
        console.warn("[SecoursMode] _hydraterPhotosLive échec photo " + pid + " :", e);
      });
    });
  }

  // Handlers vue Live Mode Opérateur surface
  function _bindLiveOperateurHandlers(corps, s) {
    // "Détails équipe" → ouvre une mini-modale read-only sur l'équipe
    corps.querySelectorAll('[data-action="live-op-details"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const equipeId = btn.getAttribute("data-equipe-id");
        _afficherModaleDetailsEquipeLive(s.id, equipeId);
      });
    });
    // "Prendre la main" → bascule en mode Équipe pour cette équipe
    // 🆕 v1.24.1 (KARMA "je rentre sur le tableau alpha [...] je peux pas
    // revenir en arrière pour continuer") : mémorise le rôle d'origine
    // dans s.execution._previousRole pour permettre le retour. Persisté
    // dans le scénario localStorage → survit au reload.
    corps.querySelectorAll('[data-action="live-op-prendre-main"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const equipeId = btn.getAttribute("data-equipe-id");
        if (!equipeId) return;
        const g = s.groupes.find(function(gr) { return gr.id === equipeId; });
        if (!g) return;
        // Stocke le rôle d'origine pour permettre le retour ultérieur
        s.execution._previousRole = s.execution.role;          // "operateur" ou "secouriste"
        s.execution._previousEquipeId = s.execution.currentEquipeId;  // null normalement
        s.execution.role = "equipe";
        s.execution.currentEquipeId = equipeId;
        // 🩸 29/09/2026 (audit Secours) — le focus d'étape est un état du MODULE,
        // pas de l'équipe : l'opérateur qui relayait Alpha (étape 5) puis prenait
        // Bravo atterrissait sur l'étape 5 de Bravo → statut radio saisi sur la
        // mauvaise étape. On repart comme à l'ouverture : 1ʳᵉ étape non terminée.
        _liveEquipeFocusIdx = 0;
        _liveEquipeFreshSession = true;
        _commitMutation(s);
        _toast(t("secours.toast.modeEquipe", { nom: g.nom }), "info");
        _switchView("live");
      });
    });
    // "Voir carte globale" → masque modale + render overlay
    corps.querySelectorAll('[data-action="live-op-carte-globale"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (_modal) _modal.style.display = "none";
        if (!_overlayLayer) renderOverlay(_currentScenarioId);
        _showOverlayFloater();
      });
    });
    // 🆕 v1.26.0 — "📥 Importer rapport équipier" → file picker + preview + fusion
    corps.querySelectorAll('[data-action="live-op-import-rapport"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _ouvrirImportRapportEquipePicker();
      });
    });
    // 🆕 v1.29.0 C3 — "✓ Phase terminée" : ouvre la modale debrief, puis
    // si OK + phase suivante existante → enchaîne sur lancerPhaseSuivante.
    corps.querySelectorAll('[data-action="terminer-phase"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _afficherModaleDebrief(s.id);
      });
    });
  }

  // Mini-modale read-only détails équipe pour mode Opérateur
  function _afficherModaleDetailsEquipeLive(scenarioId, equipeId) {
    const s = get(scenarioId);
    if (!s) return;
    const g = (s.groupes || []).find(function(gr) { return gr.id === equipeId; });
    if (!g) return;
    const couleur = PALETTE[g.couleurIdx % PALETTE.length];
    const etapes = _getEtapesEquipe(s, equipeId);

    const existing = document.getElementById("kta-secours-op-details-modale");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    let etapesHtml = '';
    if (etapes.length === 0) {
      etapesHtml = '<p style="color:#8892a4; font-style:italic;">' + t("secours.opDetails.aucuneEtape") + '</p>';
    } else {
      etapesHtml = '<ol class="kta-secours-op-details-etapes">';
      etapes.forEach(function(et) {
        const info = _getStatutInfo(et.statut);
        const tsStr = et.completedAt ? new Date(et.completedAt).toLocaleTimeString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { hour: "2-digit", minute: "2-digit" })
                    : et.startedAt   ? t("secours.live.tsEnCours", { time: new Date(et.startedAt).toLocaleTimeString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { hour: "2-digit", minute: "2-digit" }) })
                    : "—";
        const obsHtml = et.observations
                        ? '<div class="kta-secours-op-details-obs">« ' + _escHtml(et.observations) + ' »</div>'
                        : '';
        // 🆕 v1.26.0 — Chip "📥 importé" si l'étape contient des obs venues
        // d'un rapport équipier (fusion via _appliquerImportRapportEquipe).
        // Tooltip avec date d'import + version app source pour traçabilité.
        let importedChip = '';
        if (et._importedFrom) {
          const impDate = et._importedFrom.importedAt
                          ? new Date(et._importedFrom.importedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR")
                          : t("secours.import.dateInconnue");
          const impVer = et._importedFrom.sourceAppVersion || t("secours.import.versionInconnue");
          importedChip = ' <span class="kta-secours-imported-chip" title="' + _escAttr(t("secours.opDetails.importeChipTitle", { date: impDate, version: impVer })) + '">' + t("secours.opCard.importeChip") + '</span>';
        }
        etapesHtml += '<li>' +
                        '<div class="kta-secours-op-details-row">' +
                          '<span style="color:' + info.color + ';">' + info.emoji + ' <strong>' + _escHtml(_statutLabel(et.statut)) + '</strong></span>' +
                          ' · ' + _escHtml(_lblEtape(et.label) || "(?)") +
                          ' · <span class="kta-secours-op-details-ts">⏱️ ' + _escHtml(tsStr) + '</span>' +
                          importedChip +
                        '</div>' +
                        obsHtml +
                      '</li>';
      });
      etapesHtml += '</ol>';
    }

    const overlay = document.createElement("div");
    overlay.id = "kta-secours-op-details-modale";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100013";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:600px; height:auto; max-height:90vh; border-left:6px solid ' + couleur.hex + ';">' +
        '<div class="kta-readme-modal-header">' +
          '<h2 style="margin:0;">' + t("secours.opDetails.titre", { nom: _escHtml(g.nom), couleur: _escHtml(couleur.nom) }) + '</h2>' +
          '<button class="kta-readme-modal-close" data-action="close-op-details" aria-label="' + _escAttr(t("secours.btn.fermerAria")) + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="margin:0 0 12px 0; color:#8892a4; font-size:13px;">' + t("secours.opDetails.sousTitre") + '</p>' +
          etapesHtml +
          '<div style="margin-top:18px; display:flex; gap:10px; justify-content:flex-end;">' +
            '<button class="kta-btn kta-btn-secondary" data-action="close-op-details">' + t("secours.btn.fermer") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // 🆕 v1.43.26 — Pattern A : helper mutualisé _bindSubModalEsc()
    function _close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      _unbindEsc();
    }
    const _unbindEsc = _bindSubModalEsc(_close);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    overlay.querySelectorAll('[data-action="close-op-details"]').forEach(function(btn) {
      btn.addEventListener("click", _close);
    });
    document.body.appendChild(overlay);
  }

  // Handlers vue Live Mode Secouriste libre
  function _bindLiveSecouristeHandlers(corps, s) {
    // Ajout d'une note via un des 7 boutons statut
    corps.querySelectorAll('[data-action="sec-add-note"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const statutId = btn.getAttribute("data-statut");
        const texteInput = corps.querySelector('#kta-sec-newnote-texte');
        const texte = texteInput ? texteInput.value : "";
        ajouterNoteLibre(s.id, { statut: statutId, texte: texte });
        // Vide le textarea
        if (texteInput) texteInput.value = "";
        const info = _getStatutInfo(statutId);
        _toast(t("secours.toast.noteAjoutee", { emoji: info.emoji, statut: _statutLabel(statutId) }), "info");
        _switchView("live");
      });
    });
    // Suppression d'une note
    corps.querySelectorAll('[data-action="sec-del-note"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const noteId = btn.getAttribute("data-note-id");
        if (!noteId) return;
        if (!window.confirm(t("secours.confirm.supprimerNote"))) return;
        supprimerNoteLibre(s.id, noteId);
        _toast(t("secours.toast.noteSupprimee"), "info");
        _switchView("live");
      });
    });
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
    const lbl = role === "entree" ? t("secours.defPoint.entree")
              : role === "sortie" ? t("secours.defPoint.sortie")
              : t("secours.defPoint.etape", { n: ((idx == null ? 0 : idx) + 1) });
    _showFloater(
      t("secours.defPoint.instr", { label: lbl }) +
      "<br><span style=\"font-size:11px; opacity:0.85;\">" + t("secours.defPoint.astuce") + "</span>",
      [{ label: t("secours.btn.annulerSimple"), action: "cancel" }]
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
    _armerCaptureMarqueurs();
  }

  // 🐛 29/09/2026 (KARMA) : cliquer sur un POI pour en faire l'entrée ou la sortie
  // OUVRAIT LE POI. Leaflet ne remonte pas le clic d'un marqueur à la carte : le
  // `map.once("click")` n'entendait rien et la popup s'ouvrait. Pendant le choix
  // d'un point, un écouteur en CAPTURE sur le conteneur intercepte le clic sur une
  // icône de marqueur avant elle (pas de popup) et le traite comme un clic carte,
  // avec un accrochage élargi à la taille d'une icône à l'écran.
  let _captureMarqueur = null;
  function _armerCaptureMarqueurs() {
    _desarmerCaptureMarqueurs();
    const c = window.map && window.map.getContainer && window.map.getContainer();
    if (!c) return;
    _captureMarqueur = function(ev) {
      if (!_activeMapMode || !_mapModeCtx) return;
      const icone = ev.target && ev.target.closest ? ev.target.closest(".leaflet-marker-icon") : null;
      if (!icone) return;
      ev.preventDefault();
      ev.stopPropagation();
      const e = { latlng: window.map.mouseEventToLatLng(ev) };
      // Même défaut en dessin de zone (constaté au test) : un sommet posé sur un POI
      // ouvrait le POI. Le clic va au mode actif.
      if (_activeMapMode === "polygon") { _onMapClickPolygon(e); return; }
      if (_activeMapMode === "roads") { _onMapClickRoads(e); return; }
      window.map.off("click", _onMapClickPoint);
      const rayon = Math.max(30, 28 / Math.pow(2, window.map.getZoom()));   // 28 px écran → unités plan
      _onMapClickPoint(e, rayon);
    };
    c.addEventListener("click", _captureMarqueur, true);
  }
  function _desarmerCaptureMarqueurs() {
    if (_captureMarqueur && window.map && window.map.getContainer) {
      window.map.getContainer().removeEventListener("click", _captureMarqueur, true);
    }
    _captureMarqueur = null;
  }

  // Choisir un point sur la carte pour autre chose qu'un waypoint (A3 : position de
  // la victime). Même mécanique que _startDefiningPoint (snap POI, capture des
  // marqueurs, fenêtre masquée puis rendue).
  function _startPickPoint(instrHtml, onPoint) {
    if (_activeMapMode) _cancelMapMode();
    if (!window.map) return;
    _activeMapMode = "point";
    _mapModeCtx = { onPoint: onPoint, allPoints: [] };
    _hideModalForMap();
    _showFloater(instrHtml, [{ label: t("secours.btn.annulerSimple"), action: "cancel" }]);
    if (window.SearchPoints && typeof window.SearchPoints.getAllPoints === "function") {
      Promise.resolve(window.SearchPoints.getAllPoints()).then(function(all) {
        if (_mapModeCtx) _mapModeCtx.allPoints = Array.isArray(all) ? all : [];
      }).catch(function() {});
    }
    window.map.once("click", _onMapClickPoint);
    _armerCaptureMarqueurs();
  }

  function _onMapClickPoint(e, rayonSnap) {
    if (!_mapModeCtx) return;
    let x = e.latlng.lng;
    let y = (window.APP_CONFIG && window.APP_CONFIG.imageHeight)
            ? window.APP_CONFIG.imageHeight - e.latlng.lat
            : e.latlng.lat;
    let level = (window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number")
                ? window.APP_CONFIG.activeLevel : 0;
    // 🆕 v1.22.0-fix2 — snap auto sur POI le plus proche dans un rayon de 30 px
    // (cohérent avec le mode "Cliquer sur la carte" de l'itinéraire existant).
    // Réutilise SearchPoints.getAllPoints si dispo.
    let pointId = null;
    let label = null;
    const snap = _trouverPoiProche(x, y, rayonSnap || 30);
    if (snap) {
      x = snap.x;
      y = snap.y;
      pointId = snap.pointId || null;
      label = snap.nom || snap.label || null;
      // 4e relecture (R4-1) : accroché à un POI → le niveau du POI, pas celui affiché.
      if (Number.isInteger(snap.level)) level = snap.level;
      _toast(t("secours.toast.snap", { point: (label || pointId || t("secours.map.poiDefault")) }), "info");
    }
    if (typeof _mapModeCtx.onPoint === "function") {
      const cb = _mapModeCtx.onPoint;
      _finishMapMode();
      cb({ x: x, y: y, level: level, pointId: pointId, label: label });
      return;
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
        best = { x: p.x, y: p.y, pointId: p.id, nom: p.nom, level: p.level };
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
    // 🐛 v1.42.15 (KARMA "quand on ajoute une entrée sortie à un groupe de secours,
    // ça ne se met pas à jour de suite, il faut calculer itinéraire pour voir
    // ce qu'on a saisi") : oubli historique du re-render après mutation.
    // Cohérent avec _clearWaypoint qui appelait déjà _switchView("edit") en fin.
    _switchView("edit");
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

  // 🆕 v1.23.0 Phase 2 / Feature F — Rendu du bloc Favoris dans la modale
  // picker waypoint. Affiche les favoris du plan en accès rapide (chips
  // cliquables) au-dessus de la recherche autocomplete. Skip si pas de
  // favoris OU module Favoris pas chargé (rétro-compat).
  function _renderFavorisBlock() {
    if (!window.Favoris || typeof window.Favoris.getAll !== "function") return "";
    let favs = [];
    try { favs = window.Favoris.getAll() || []; } catch(e) { return ""; }
    if (!Array.isArray(favs) || favs.length === 0) return "";
    let html = '<div class="kta-secours-pick-favoris">';
    html += '<div class="kta-secours-pick-favoris-titre">' + t("secours.pick.favorisTitre", { n: favs.length }) + '</div>';
    html += '<div class="kta-secours-pick-favoris-grid">';
    // Max 8 favoris affichés (sinon l'UI s'allonge trop — l'user peut
    // toujours utiliser la recherche pour les autres)
    favs.slice(0, 8).forEach(function(f) {
      // f a la forme { pointId, nom, x, y, level?, tag?, layerId?, ... }
      if (!f || typeof f.x !== "number" || typeof f.y !== "number") return;
      const nom = f.nom || f.pointId || t("secours.pick.favoriDefault");
      html += '<button class="kta-secours-pick-favori" ' +
                'data-pid="' + _escAttr(f.pointId || "") + '" ' +
                'data-x="' + f.x + '" data-y="' + f.y + '" ' +
                'data-lvl="' + (typeof f.level === "number" ? f.level : "") + '" ' +
                'data-nom="' + _escAttr(nom) + '" ' +
                'title="' + _escAttr(nom + " (x=" + Math.round(f.x) + " y=" + Math.round(f.y) + ")") + '">' +
                '⭐ ' + _escHtml(nom) +
              '</button>';
    });
    html += '</div>';
    if (favs.length > 8) {
      html += '<div class="kta-secours-pick-favoris-more">' + t("secours.pick.favorisMore", { n: (favs.length - 8) }) + '</div>';
    }
    html += '</div>';
    return html;
  }

  // 🆕 v1.22.0-fix2 — mini-modale "Choisir un point" avec autocomplete +
  // bouton clic carte. Pattern hérité de la modale itinéraire (cf §14 CLAUDE.md).
  function _ouvrirChoixWaypoint(groupeId, role, idx) {
    // Cleanup éventuelle modale précédente (idempotency)
    const existing = document.getElementById("kta-secours-pick-modal");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    const lblRole = role === "entree" ? t("secours.roleShort.entree")
                  : role === "sortie" ? t("secours.roleShort.sortie")
                  : t("secours.parcours.etape", { n: ((idx == null ? 0 : idx) + 1) });
    const overlay = document.createElement("div");
    overlay.id = "kta-secours-pick-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001";
    // 🆕 v1.23.0 Phase 2 / Feature F (KARMA roadmap §65.12 "Favoris →
    // import auto des favoris taggés entrée/sortie") : section ⭐ favoris
    // en accès rapide AU-DESSUS de la recherche autocomplete. Les favoris
    // sont par essence les points cliché du plan (accès, escaliers, POI
    // marquants) → candidats naturels pour les waypoints d'équipes secours.
    const favorisHtml = _renderFavorisBlock();

    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-pick-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + t("secours.pick.titre", { role: _escHtml(lblRole) }) + '</span>' +
          '<button class="kta-panneau-close" data-action="cancel" type="button">&times;</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          favorisHtml +
          '<div class="kta-secours-pick-search-wrap">' +
            '<input type="text" id="kta-secours-pick-search" placeholder="' + _escAttr(t("secours.pick.searchPlaceholder")) + '" autocomplete="off">' +
            '<div class="kta-secours-pick-results" id="kta-secours-pick-results"></div>' +
          '</div>' +
          '<div class="kta-secours-pick-or">' + t("secours.pick.ou") + '</div>' +
          '<button class="kta-btn kta-btn-primary kta-secours-pick-clic" data-action="clic-carte">' +
            t("secours.pick.cliquerCarte") + '<br>' +
            '<small style="opacity:0.85; font-weight:normal;">' + t("secours.pick.snapHint") + '</small>' +
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
    // 🆕 v1.23.0 Feature F — Click sur un favori = applique en waypoint direct
    overlay.querySelectorAll('.kta-secours-pick-favori').forEach(function(btn) {
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
        results.innerHTML = '<div class="kta-secours-pick-hint">' + t("secours.pick.hintMin") + '</div>';
        return;
      }
      if (!window.SearchPoints || typeof window.SearchPoints.findByQuery !== "function") {
        results.innerHTML = '<div class="kta-secours-pick-hint">' + t("secours.pick.hintModuleIndispo") + '</div>';
        return;
      }
      const mySeq = ++_searchSeq;
      results.innerHTML = '<div class="kta-secours-pick-hint">' + t("secours.pick.hintRecherche") + '</div>';
      Promise.resolve(window.SearchPoints.findByQuery(q)).then(function(found) {
        // Si une nouvelle query a été lancée entre-temps, ignore ce résultat
        if (mySeq !== _searchSeq) return;
        if (!Array.isArray(found)) found = [];
        if (found.length === 0) {
          results.innerHTML = '<div class="kta-secours-pick-hint">' + t("secours.pick.hintAucun", { q: _escHtml(q) }) + '</div>';
          return;
        }
        let html = '';
        found.slice(0, 20).forEach(function(entry) {
          const p = entry.point || entry;
          if (!p) return;
          const nom = p.nom || p.id || t("secours.import.sansNom");
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
                  (typeof p.level === "number" ? ' · ' + t("secours.assign.niv", { level: p.level }) : '') +
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
        results.innerHTML = '<div class="kta-secours-pick-hint">' + t("secours.pick.hintErreur", { message: _escHtml(e.message || String(e)) }) + '</div>';
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
          '<span class="kta-readme-modal-titre">' + t("secours.zoneMode.titre") + '</span>' +
          '<button class="kta-panneau-close" data-action="cancel" type="button">&times;</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="color:#c8d0e0;">' + t("secours.zoneMode.intro") + '</p>' +
          '<div style="display:flex; flex-direction:column; gap:10px; margin-top:14px;">' +
            '<button class="kta-btn kta-btn-primary" data-mode="polygon" style="text-align:left;">' +
              '<strong>' + t("secours.zoneMode.polygoneTitre") + '</strong><br>' +
              '<small style="opacity:0.85;">' + t("secours.zoneMode.polygoneDesc") + '</small>' +
            '</button>' +
            '<button class="kta-btn kta-btn-primary" data-mode="roads" style="text-align:left;">' +
              '<strong>' + t("secours.zoneMode.roadsTitre") + '</strong><br>' +
              '<small style="opacity:0.85;">' + t("secours.zoneMode.roadsDesc") + '</small>' +
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
      t("secours.floater.polygonInstr") + '<br>' +
      '<span id="kta-sec-poly-count">' + t("secours.floater.sommets", { n: 0 }) + '</span>',
      [
        { label: t("secours.btn.annulerSimple"), action: "cancel" },
        { label: t("secours.btn.terminer"), action: "finish" }
      ]
    );
    _afficherZonesAutresEquipes(groupeId);
    _armerCaptureMarqueurs();
    window.map.on("click", _onMapClickPolygon);
    window.map.on("dblclick", _onMapDblClickPolygon);
  }

  // 🐛 29/09/2026 (KARMA) : en dessinant la zone de l'équipe 2, on ne voyait pas
  // celle de l'équipe 1 — impossible de caler les zones bord à bord. Pendant le
  // dessin, les zones des AUTRES équipes du scénario sont affichées en pointillé,
  // à leur couleur, avec leur nom. Non interactives : un clic dessus reste un clic
  // de dessin. Retirées par _finishMapMode.
  function _afficherZonesAutresEquipes(groupeId) {
    const s = get(_currentScenarioId);
    if (!s || !window.map || !_mapModeCtx) return;
    const couche = L.layerGroup().addTo(window.map);
    _mapModeCtx.autresZones = couche;
    s.groupes.forEach(function(g) {
      if (!g || g.id === groupeId) return;
      const coul = PALETTE[g.couleurIdx % PALETTE.length].hex;
      if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
        L.polygon(g.zonePolygon.map(_planToLatLng), {
          color: coul, weight: 2, opacity: 0.9, dashArray: "6 5",
          fillColor: coul, fillOpacity: 0.15, interactive: false
        }).bindTooltip(_escHtml(g.nom), { permanent: true, direction: "center", className: "kta-secours-zone-autre-label" })
          .addTo(couche);
      } else if (g.zoneType === "roads") {
        _tracesZone(g).forEach(function(road) {
          if (!road || !Array.isArray(road.points)) return;
          L.polyline(road.points.map(_planToLatLng), {
            color: coul, weight: 8, opacity: 0.35, dashArray: "8 6", lineCap: "round", interactive: false
          }).addTo(couche);
        });
      }
    });
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
    _updateFloaterCount(_mapModeCtx.points.length, "sommets");
    _redrawPolygonPreview();
  }

  function _onMapDblClickPolygon(e) {
    if (!_mapModeCtx || !_mapModeCtx.points || _mapModeCtx.points.length < 3) {
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(t("secours.toast.min3Sommets"), "warn");
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
    _mapModeCtx = { groupeId: groupeId, roadIds: new Set(), surbrillance: null };
    _hideModalForMap();
    _showFloater(
      t("secours.floater.roadsInstr") + '<br>' +
      '<span id="kta-sec-poly-count">' + t("secours.floater.traces", { n: 0 }) + '</span>',
      [
        { label: t("secours.btn.annulerSimple"), action: "cancel" },
        { label: t("secours.btn.terminer"), action: "finish" }
      ]
    );
    // 🩸 29/09/2026 (audit Secours, A2) — LE MODE « TRACÉS » NE SÉLECTIONNAIT RIEN.
    // Il cherchait `entry.road` / `entry.layer` dans `_ktaDataPolylines` (qui n'a
    // que `polyline`, `points`…) et écartait les tracés de session, passés sans
    // calque : zéro clic branché. Et l'id qu'il aurait posé était aléatoire, sur une
    // COPIE (`getAllEmbeddedRoads` clone) : perdu au rechargement comme d'un
    // téléphone à l'autre. Désormais :
    //   • la clé d'un tracé est l'EMPREINTE de sa géométrie (`_cleTrace`) : la même
    //     sur tous les appareils qui ont le même plan, sans rien écrire dans le plan ;
    //   • un clic carte prend le tracé le plus proche (tolérance écran), parmi les
    //     niveaux visibles — comme le mode polygone, sans dépendre du rendu ;
    //   • rouvrir le mode reprend la sélection existante de l'équipe.
    _mapModeCtx.surbrillance = L.layerGroup().addTo(window.map);
    const g = _findGroupeCourant(groupeId);
    // Relecture (D2) : une clé que CET appareil ne résout pas (tracé de session d'un
    // autre appareil, plan différent) est GARDÉE telle quelle — avant, « Terminer »
    // la supprimait de la zone.
    const resolus = _tracesZone(g);
    resolus.forEach(function(r) { _mapModeCtx.roadIds.add(_cleTrace(r)); });
    ((g && g.zoneType === "roads" && g.zoneRoadIds) || []).forEach(function(k) {
      const connu = resolus.some(function(r) { return r.id === k || _cleTrace(r) === k; });
      if (!connu) _mapModeCtx.roadIds.add(k);
    });
    _redessinerSelectionTraces();
    _afficherZonesAutresEquipes(groupeId);
    _armerCaptureMarqueurs();
    window.map.on("click", _onMapClickRoads);
  }

  // FNV-1a 32 bits sur les coordonnées (au 1/10 de px) : stable, sans état.
  // Mémo par TABLEAU de points : `getAllEmbeddedRoads` rend des copies neuves à
  // chaque appel, mais elles partagent le `points` d'origine (Object.assign).
  // Réservé aux tracés du PLAN (copies marquées `layerId`) : ceux de la session
  // s'éditent en place (points ajoutés / déplacés), un mémo y serait périmé.
  const _clesTraces = new WeakMap();
  function _cleTrace(road) {
    if (!road || !Array.isArray(road.points) || road.points.length < 2) return null;
    const figee = Object.prototype.hasOwnProperty.call(road, "layerId");
    const memo = figee ? _clesTraces.get(road.points) : null;
    if (memo) return memo;
    let h = 0x811c9dc5;
    for (let i = 0; i < road.points.length; i++) {
      const p = road.points[i];
      const s = Math.round(p.x * 10) + "," + Math.round(p.y * 10) + ";";
      for (let j = 0; j < s.length; j++) {
        h ^= s.charCodeAt(j);
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    const cle = "tr_" + road.points.length + "_" + h.toString(36);
    if (figee) _clesTraces.set(road.points, cle);
    return cle;
  }

  // Tracés sélectionnables : session + plan, hors itinéraire.
  function _tousLesTraces() {
    const sess = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    const emb = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : [];
    return sess.concat(emb).filter(function(r) {
      return r && r.type !== "itinerary" && Array.isArray(r.points) && r.points.length >= 2;
    });
  }

  // Résout les tracés de la zone d'une équipe. SEUL lecteur de `zoneRoadIds` :
  // overlay, PDF, avoidances, « POI de la zone » et KMZ passent par ici.
  // Accepte aussi un ancien `road.id` (tracé de session qui en porte un).
  function _tracesZone(g) {
    if (!g || g.zoneType !== "roads" || !Array.isArray(g.zoneRoadIds) || g.zoneRoadIds.length === 0) return [];
    const voulus = {};
    g.zoneRoadIds.forEach(function(k) { voulus[k] = true; });
    return _tousLesTraces().filter(function(r) {
      return (r.id && voulus[r.id]) || voulus[_cleTrace(r)];
    });
  }

  function _findGroupeCourant(groupeId) {
    const s = get(_currentScenarioId);
    return s ? (s.groupes || []).find(function(g) { return g.id === groupeId; }) : null;
  }

  function _onMapClickRoads(e) {
    if (!_mapModeCtx || _activeMapMode !== "roads") return;
    const p = {
      x: e.latlng.lng,
      y: (window.APP_CONFIG && window.APP_CONFIG.imageHeight)
         ? window.APP_CONFIG.imageHeight - e.latlng.lat : e.latlng.lat
    };
    // 14 px écran → unités plan (CRS.Simple : 1 unité = 2^zoom px).
    const tol = 14 / Math.pow(2, window.map.getZoom());
    const filtre = (typeof window.passeFiltreNiveau === "function")
                   ? window.passeFiltreNiveau : function() { return true; };
    let meilleur = null, dMin = Infinity;
    _tousLesTraces().forEach(function(r) {
      if (!filtre(r)) return;
      const d = _distPointPolyline(p, r.points);
      if (d < dMin) { dMin = d; meilleur = r; }
    });
    if (!meilleur || dMin > tol) return;
    // Un tracé de session ouvre sa popup de note au même clic : on la referme.
    try { window.map.closePopup(); } catch(err) {}
    const cle = _cleTrace(meilleur);
    if (_mapModeCtx.roadIds.has(cle)) _mapModeCtx.roadIds.delete(cle);
    else _mapModeCtx.roadIds.add(cle);
    _redessinerSelectionTraces();
  }

  function _redessinerSelectionTraces() {
    if (!_mapModeCtx || !_mapModeCtx.surbrillance) return;
    const couche = _mapModeCtx.surbrillance;
    couche.clearLayers();
    const voulus = _mapModeCtx.roadIds;
    _tousLesTraces().forEach(function(r) {
      if (!voulus.has(_cleTrace(r))) return;
      L.polyline(r.points.map(_planToLatLng), {
        color: "#ff4444", weight: 8, opacity: 0.85, interactive: false
      }).addTo(couche);
    });
    _updateFloaterCount(voulus.size, "traces");
  }

  function _finishRoads() {
    if (!_mapModeCtx) return;
    const ctx = _mapModeCtx;
    if (ctx.roadIds.size === 0) {
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(t("secours.toast.aucunTrace"), "warn");
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
        ' · ' + t("secours.liveOp.equipesCompteur", { n: nbGroupes }) +
      '</div>' +
      '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="reopen-modal">' +
        t("secours.floater.retourModale") +
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
    // label = "sommets" | "traces" → clé i18n avec pluralisation gérée par la valeur
    if (el) el.textContent = t("secours.floater." + label, { n: n });
  }

  function _cancelMapMode() {
    _finishMapMode();
  }
  function _finishMapMode() {
    _desarmerCaptureMarqueurs();
    if (window.map) {
      window.map.off("click", _onMapClickPoint);
      window.map.off("click", _onMapClickPolygon);
      window.map.off("dblclick", _onMapDblClickPolygon);
      window.map.off("click", _onMapClickRoads);
    }
    // Cleanup preview polygon
    if (_mapModeCtx && _mapModeCtx.previewLayer && window.map) {
      try { window.map.removeLayer(_mapModeCtx.previewLayer); } catch(e) {}
    }
    if (_mapModeCtx && _mapModeCtx.autresZones && window.map) {
      try { window.map.removeLayer(_mapModeCtx.autresZones); } catch(e) {}
    }
    // Cleanup surbrillance du mode tracés
    if (_mapModeCtx && _mapModeCtx.surbrillance && window.map) {
      try { window.map.removeLayer(_mapModeCtx.surbrillance); } catch(e) {}
    }
    _activeMapMode = null;
    _mapModeCtx = null;
    _removeFloater();
    _showModalAfterMap();
  }

  // ============================================================
  // PATHFINDER intégration (depuis v1.22.0 commit 4/9)
  // ============================================================
  // 🩸 29/09/2026 (audit Secours) — LE NIVEAU DE CHAQUE POINT, PAS CELUI DE L'ENTRÉE.
  // Les deux calculs écrasaient `level` par `g.entree.level` : une équipe qui descend
  // au −1 voyait tout son tracé déclaré au niveau de l'entrée. Le pathfinder rend le
  // niveau réel par point, ou `null` quand il est ambigu (milieu d'une jonction,
  // nœud fusionné) : on reprend alors le dernier niveau connu, à défaut l'entrée.
  function _niveauxItineraire(path, niveauEntree) {
    let courant = Number.isInteger(niveauEntree) ? niveauEntree : 0;
    const premier = (path || []).find(function(p) { return p && Number.isInteger(p.level); });
    if (premier) courant = premier.level;
    return (path || []).map(function(p) {
      if (Number.isInteger(p.level)) courant = p.level;
      return { x: p.x, y: p.y, level: courant };
    });
  }

  function _recalculerItineraireGroupe(scenarioId, groupeId) {
    const s = get(scenarioId);
    if (!s) return null;
    const g = s.groupes.find(function(x) { return x.id === groupeId; });
    if (!g) {
      _toast(t("secours.toast.equipeIntrouvable"), "error");
      return null;
    }
    if (!g.entree || !g.sortie) {
      _toast(t("secours.toast.defEntreeSortie"), "warn");
      return null;
    }
    if (!window.Pathfinder || typeof window.Pathfinder.computeRoute !== "function") {
      _toast(t("secours.toast.pathfinderIndispo"), "error");
      return null;
    }
    // 🐛 v1.22.0-fix1 : vérifier que les coords sont valides (anti-NaN)
    if (typeof g.entree.x !== "number" || typeof g.entree.y !== "number" ||
        typeof g.sortie.x !== "number" || typeof g.sortie.y !== "number") {
      _toast(t("secours.toast.coordsCorrompues"), "error");
      return null;
    }
    // 🆕 v1.22.0-fix2 : valider aussi les intermédiaires + filtrer les invalides
    const intermediaires = (Array.isArray(g.intermediaires) ? g.intermediaires : [])
      .filter(function(w) {
        return w && typeof w.x === "number" && typeof w.y === "number";
      });
    _toast(intermediaires.length > 0
           ? t("secours.toast.calcItiViaWp", { n: intermediaires.length })
           : t("secours.toast.calcIti"), "info");
    try {
      // 🆕 v1.22.0-fix2 : Pathfinder accepte [entree, ...intermediaires, sortie]
      // (multi-waypoints natif depuis v1.5.x). Chaque pair de waypoints
      // consécutifs déclenche un Dijkstra séparé puis les paths sont
      // concaténés (cf §14 CLAUDE.md). Boucle entree=sortie → Pathfinder
      // calcule le tour complet via les intermédiaires (sinon retour direct).
      const waypoints = [{ x: g.entree.x, y: g.entree.y, level: g.entree.level, label: g.entree.label || t("secours.wp.entree", { equipe: g.nom }) }]
        .concat(intermediaires.map(function(w, i) {
          return { x: w.x, y: w.y, level: w.level, label: w.label || t("secours.parcours.etape", { n: (i + 1) }) };
        }))
        .concat([{ x: g.sortie.x, y: g.sortie.y, level: g.sortie.level, label: g.sortie.label || t("secours.wp.sortie", { equipe: g.nom }) }]);
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
          _toast(t("secours.toast.aucunIti"), "warn");
          return;
        }
        const scale = (window.APP_CONFIG && window.APP_CONFIG.scale > 0)
                      ? window.APP_CONFIG.scale : 1;
        const distM = r.totalDistance / scale;
        // 4.1 : réglages du SCÉNARIO (vitesse de fouille, pause par étape).
        const duree = Math.round(_dureeEquipeMin(s, distM, waypoints.length));
        updateGroupe(scenarioId, groupeId, {
          itineraireSuggere: _niveauxItineraire(r.path, g.entree.level),
          distanceM:       distM,
          dureeEstimeeMin: duree
        });
        const fmtD = (typeof window.formatDistance === "function")
                     ? window.formatDistance(distM, 0) : Math.round(distM) + " m";
        _toast(t("secours.toast.itiCalcule", { distance: fmtD, duree: duree }), "info");
        // 🆕 v1.23.0 Phase 2 / Feature B — Feedback fallback avoidances
        if (r.usedFallback === true && Array.isArray(r.avoidedThrough) && r.avoidedThrough.length > 0) {
          _toast(t("secours.toast.itiTraverse", { n: r.avoidedThrough.length }), "warn");
        }
        // 🐛 v1.22.0-fix1 : re-render edit pour update stats visibles + refresh overlay si actif
        if (_modal) _switchView("edit");
        if (_overlayLayer) renderOverlay(scenarioId);
      }).catch(function(err) {
        console.warn("[SecoursMode] Pathfinder error :", err);
        const msg = (err && err.message) ? err.message : String(err);
        _toast(t("secours.toast.erreurCalcIti", { message: msg }), "error");
      });
    } catch(e) {
      console.warn("[SecoursMode] Calcul itinéraire échoué (sync) :", e);
      _toast(t("secours.toast.erreurSync", { message: (e.message || e) }), "error");
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
        _tracesZone(g).forEach(function(road) {
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
  // Ordre : chaîne du plus proche voisin (cf `_ordrePlusProcheVoisin`).
  // Chaîne du plus proche voisin, à vol d'oiseau (plan px) : O(n²), n = POI d'une
  // zone (quelques dizaines). Le niveau compte : changer d'étage coûte une jonction,
  // donc à distance égale on reste au même niveau (pénalité 1e6 px, ordre total).
  function _ordrePlusProcheVoisin(depart, pts) {
    const reste = pts.slice();
    const out = [];
    let cur = depart;
    const niv = function(p) { return (p && typeof p.level === "number") ? p.level : 0; };
    while (reste.length > 0) {
      let iBest = 0, dBest = Infinity;
      for (let i = 0; i < reste.length; i++) {
        const dx = reste[i].x - cur.x, dy = reste[i].y - cur.y;
        const d = Math.sqrt(dx * dx + dy * dy) + (niv(reste[i]) !== niv(cur) ? 1e6 : 0);
        if (d < dBest) { dBest = d; iBest = i; }
      }
      cur = reste.splice(iBest, 1)[0];
      out.push(cur);
    }
    return out;
  }

  function _ajouterPoisDansZone(scenarioId, groupeId) {
    const s = get(scenarioId);
    if (!s) return;
    const g = s.groupes.find(function(x) { return x.id === groupeId; });
    if (!g) return;
    if (!g.zoneType) {
      _toast(t("secours.toast.defZone"), "warn");
      return;
    }
    if (!g.entree) {
      _toast(t("secours.toast.defEntreePoi"), "warn");
      return;
    }
    if (!window.SearchPoints || typeof window.SearchPoints.getAllPoints !== "function") {
      _toast(t("secours.toast.rechercheIndispo"), "error");
      return;
    }
    _toast(t("secours.toast.recherchePoi"), "info");
    // 🐛 hotfix4 (KARMA "des points sont détectés dans la zone alors qu'il
    // sont en dehors") : pré-calcul du niveau de référence pour le filtre
    // M-LVL strict. Priorité : level du 1er sommet du polygon → level entrée
    // → level activeLevel APP_CONFIG → 0. Garantit qu'on filtre les POI au
    // BON niveau (avant : si entree.level absent ET p.level défini, on ne
    // filtrait PAS → POI d'autres niveaux ajoutés à tort).
    const mlvlActive = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    let refLevel = 0;
    if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon)
        && g.zonePolygon.length > 0 && typeof g.zonePolygon[0].level === "number") {
      refLevel = g.zonePolygon[0].level;
    } else if (g.entree && typeof g.entree.level === "number") {
      refLevel = g.entree.level;
    } else if (window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number") {
      refLevel = window.APP_CONFIG.activeLevel;
    }
    Promise.resolve(window.SearchPoints.getAllPoints()).then(function(all) {
      if (!Array.isArray(all)) all = [];
      // Set des POI déjà présents dans le parcours (par pointId OU coords)
      const dejaPresent = function(p) {
        if (_samePoint(p, g.entree)) return true;
        if (_samePoint(p, g.sortie)) return true;
        return (g.intermediaires || []).some(function(w) { return _samePoint(p, w); });
      };
      // Compteurs debug (visibles dans 🐛 Logs si debugMode ON)
      let cntTotal = 0, cntSkipLevel = 0, cntSkipOutside = 0, cntSkipDup = 0;
      const tracesZone = _tracesZone(g);  // résolu UNE fois (empreintes), pas par POI
      // Filtre les POI dans la zone
      let candidats = [];
      all.forEach(function(entry) {
        cntTotal++;
        const p = entry.point || entry;
        if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
        // 🐛 hotfix4 — Filtre M-LVL STRICT : POI sans level traité comme
        // level 0 implicite (cohérent rétro-compat plans v147+). Skip si
        // niveau du POI != refLevel calculé ci-dessus.
        if (mlvlActive) {
          const pLvl = (typeof p.level === "number") ? p.level : 0;
          if (pLvl !== refLevel) { cntSkipLevel++; return; }
        }
        // Test zone
        let inside = false;
        if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon)) {
          inside = _pointInPolygon(p, g.zonePolygon);
        } else if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds)) {
          for (let i = 0; i < tracesZone.length; i++) {
            const road = tracesZone[i];
            if (!road || !Array.isArray(road.points)) continue;
            if (_distPointPolyline(p, road.points) <= 30) {  // buffer 30 px
              inside = true;
              break;
            }
          }
        }
        if (!inside) { cntSkipOutside++; return; }
        if (dejaPresent({ x: p.x, y: p.y, pointId: p.id })) { cntSkipDup++; return; }
        // Distance à l'entrée pour le tri
        const dx = p.x - g.entree.x, dy = p.y - g.entree.y;
        const distFromEntree = Math.sqrt(dx * dx + dy * dy);
        candidats.push({
          x:       p.x,
          y:       p.y,
          level:   typeof p.level === "number" ? p.level : refLevel,
          pointId: p.id || null,
          label:   p.nom || p.id || null,
          _d:      distFromEntree
        });
      });
      // Log debug (visible dans 🐛 Logs si debugMode ON)
      console.log("[SecoursMode] POI dans zone — refLevel=" + refLevel +
                  " mlvl=" + mlvlActive + " total=" + cntTotal +
                  " skipLevel=" + cntSkipLevel +
                  " skipOutside=" + cntSkipOutside +
                  " skipDup=" + cntSkipDup +
                  " retained=" + candidats.length);
      if (candidats.length === 0) {
        _toast(t("secours.toast.aucunPoiZone"), "info");
        return;
      }
      // 🩸 29/09/2026 (audit Secours) — le commentaire promettait « greedy nearest
      // neighbor », le code triait par distance à l'ENTRÉE : l'équipe faisait des
      // allers-retours (mesuré sur 6 secteurs réels : +8 à +84 % de marche, ~+38 %
      // en médiane). Chaîne du plus proche voisin, partant de la dernière étape
      // déjà saisie (on AJOUTE à la suite), à défaut de l'entrée.
      const inter = g.intermediaires || [];
      const depart = inter.length > 0 ? inter[inter.length - 1] : g.entree;
      candidats = _ordrePlusProcheVoisin(depart, candidats);
      // Strip le _d helper avant save
      const newIntermediaires = (g.intermediaires || []).slice().concat(
        candidats.map(function(c) {
          return { x: c.x, y: c.y, level: c.level, pointId: c.pointId, label: c.label };
        })
      );
      updateGroupe(scenarioId, groupeId, { intermediaires: newIntermediaires });
      _toast(t("secours.toast.poiAjoutes", { n: candidats.length }), "info");
      _switchView("edit");
    }).catch(function(e) {
      console.warn("[SecoursMode] _ajouterPoisDansZone échoué :", e);
      _toast(t("secours.toast.erreurGenerique", { message: (e.message || e) }), "error");
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
        const waypoints = [{ x: g.entree.x, y: g.entree.y, level: g.entree.level, label: g.entree.label || t("secours.wp.entree", { equipe: g.nom }) }]
          .concat(intermediaires.map(function(w, i) {
            return { x: w.x, y: w.y, level: w.level, label: w.label || t("secours.parcours.etape", { n: (i + 1) }) };
          }))
          .concat([{ x: g.sortie.x, y: g.sortie.y, level: g.sortie.level, label: g.sortie.label || t("secours.wp.sortie", { equipe: g.nom }) }]);
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
          const duree = Math.round(_dureeEquipeMin(s, distM, waypoints.length));
          updateGroupe(scenarioId, groupeId, {
            itineraireSuggere: _niveauxItineraire(r.path, g.entree.level),
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
    // Intervention en cours sur ce plan → zone, tracé et pastille dès l'ouverture
    // (après la main : la carte et ses tracés finissent de se monter).
    setTimeout(function() {
      const enCours = _scenarioEnCours();
      if (enCours && window.map && !_modal) {
        try { renderOverlay(enCours.id); } catch(e) { console.warn("[SecoursMode] overlay au chargement :", e); }
      }
      _majFooterSecours();
    }, 0);
  }

  // Reset au plan switch — appelé par main.js > _libererRessourcesPlanPrecedent.
  // Ferme la modale, cleanup overlay, vide les scénarios in-memory (les
  // scénarios du nouveau plan seront re-chargés via init au boot du nouveau).
  function reset() {
    fermer();
    clearOverlay();
    _scenarios = [];
    _currentScenarioId = null;
    _focusedGroupeId = null;
    _majFooterSecours();
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
    // 🆕 v1.23.2 Phase 2 / Feature G — Mini-modale assigner POI à équipe
    // depuis la recherche unifiée Ctrl+K (searchPoints.js)
    ouvrirAssignerModale:   ouvrirAssignerModale,
    // 🆕 v1.23.4 — Export/import scénario standalone (.mkmsec.json) pour
    // partage cross-device (base Phase 3 chef de surface / secouriste)
    exporterScenario:       exporterScenario,
    importerScenario:       importerScenario,
    // CRUD groupes
    addGroupe:              addGroupe,
    updateGroupe:           updateGroupe,
    removeGroupe:           removeGroupe,
    // Tools (stubs en commit 1, impl dans commits suivants)
    recalculerItineraires:  recalculerItineraires,
    exporterPDF:            exporterPDF,
    exporterKMZ:            exporterKMZ,
    // 🆕 v1.41.0 C — Briefing pompiers PDF dedie (Vue OSM × Mode Secours).
    genererBriefingPompiersPDF: genererBriefingPompiersPDF,
    // Map overlay
    renderOverlay:          renderOverlay,
    clearOverlay:           clearOverlay,
    setFocus:               setFocus,
    // Events
    onChange:               onChange,
    // 🆕 v1.29.0 C1 + C2 — Multi-phases.
    // Lecture seule (helpers C1) :
    getCurrentPhase:        function(scenarioId) { return _getCurrentPhase(get(scenarioId)); },
    listerEquipesPhase:     function(scenarioId, phaseIdx) {
      return _listerEquipesPhase(get(scenarioId), phaseIdx);
    },
    groupeParticipeAPhase:  function(scenarioId, equipeId, phaseIdx) {
      return _groupeParticipeAPhase(get(scenarioId), equipeId, phaseIdx);
    },
    // Mutations (C2) :
    creerPhase:             creerPhase,
    renommerPhase:          renommerPhase,
    supprimerPhase:         supprimerPhase,
    affecterEquipeAPhase:   affecterEquipeAPhase,
    // 🆕 v1.29.0 C3 — Transitions + debrief + lecture archive
    terminerPhase:          terminerPhase,
    lancerPhaseSuivante:    lancerPhaseSuivante,
    getArchivedEtapes:      function(scenarioId, phaseIdx, equipeId) {
      return _getArchivedEtapes(get(scenarioId), phaseIdx, equipeId);
    },
    isPhasePretAClore:      function(scenarioId) {
      return _phaseEstPretAClore(get(scenarioId));
    },
    // 🩸 29/09/2026 — tracés de la zone d'une équipe (empreintes stables, cf _cleTrace).
    // Seule façon correcte de lire `zoneRoadIds` hors du module (kmzExport).
    tracesZone:             _tracesZone,
    // Constantes (lecture seule, exposées pour UI)
    PALETTE:                PALETTE,
    MAX_SCENARIOS:          MAX_SCENARIOS,
    VITESSE_MPS_DEFAUT:     VITESSE_MPS_DEFAUT,
    PHASE_DEFAULT_NOM:      PHASE_DEFAULT_NOM
  };

  console.log("[SecoursMode] Module chargé.");
})();
