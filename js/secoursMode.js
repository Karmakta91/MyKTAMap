/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 */

// =========================
// secoursMode.js — Mode Secours : préparer et conduire une recherche de personne par équipes.
// =========================
// Le PC secours assigne à chaque équipe une portion du réseau (entrée, sortie, étapes, zone en polygone ou en
// tracés, itinéraire suggéré, durée estimée), lance l'exécution terrain (phases, étapes à statut, photos,
// suivi live), échange des fichiers .mkmsec avec les téléphones et produit les rapports PDF/KMZ.
// Orchestre : recherche unifiée, Pathfinder, zones, tracés, multi-niveau, Lost Mode, favoris.
// Expose : window.SecoursMode = { ouvrir, fermer, isOpen, getCurrentScenarioId, list, get, create, update,
//   delete, duplicate, addGroupe, updateGroupe, removeGroupe, recalculerItineraires, exporterPDF,
//   exporterKMZ, renderOverlay, clearOverlay, setFocus, onChange, PALETTE, … }
// Persistance : localStorage["myktamap_secours_v1_<planId>"] = tableau de scénarios (10 par plan, FIFO
//   protégé, cf _saveScenarios). Format d'un scénario et de scenario.execution : docs/architecture/secours.md.
// 🩸 Un point de passage est identifié par son `wid` (calculé, pas tiré au hasard : cf _widDeterministe) ;
//    c'est la seule clé qui relie les étapes entre appareils et entre phases.
// 🩸 Ne jamais relire `zoneRoadIds` à la main : passer par `_tracesZone(g)` (ce ne sont pas des road.id).
// Garde-fous : scripts/check-secours-relais.js, check-secours-balayage.js, check-extensions.js, check-uid.js.
// Doc : docs/architecture/secours.md.

(function() {
  "use strict";

  // CSS du Mode Secours (css/style-secours.css, hors style.css pour alléger le boot) préchargé dès l'init,
  // sans attendre la Promise : il est appliqué avant la première ouverture. Échec (hors ligne, cache vide) :
  // rendu dégradé sur style.css, pas de blocage. Idempotent.
  if (typeof window._loadCssOnce === "function") {
    window._loadCssOnce("css/style-secours.css", "kta-css-style-secours");
  }

  // ── i18n ────────────────────────────────────────────────────────────
  // À appeler AU RENDU (jamais au load) : les dicos lang/<code>.json arrivent après I18n.init().
  // Repli = la clé brute si I18n absent. t("secours.x", { param }) remplace {param}.
  const t = (k, p) => (window.I18n ? window.I18n.t(k, p) : k);

  // Libellé i18n d'un statut TABLEAU_STATUTS (résolu au rendu ; `.label` = repli FR).
  function _statutLabel(statutId) {
    const info = _getStatutInfo(statutId);
    return t("secours.statut." + info.id, {}) !== "secours.statut." + info.id
      ? t("secours.statut." + info.id)
      : info.label;
  }
  // Numéro unique d'une étape, le même à l'écran, sur la carte et dans les PDF : entrée « E », étapes 1…N,
  // sortie « S ».
  function _numEtape(et, idx) {
    return (et && et.type === "entree") ? "E" : (et && et.type === "sortie") ? "S" : String(idx);
  }
  function _nomEtape(et, idx) {
    return (et && et.type === "entree") ? t("secours.num.entree")
         : (et && et.type === "sortie") ? t("secours.num.sortie")
         : t("secours.num.etape", { n: idx });
  }
  // Libellé de statut pour un PDF : accents gardés (la police les affiche), seuls les caractères hors police
  // sont retirés (window.ktaTextePdf, utils.js).
  function _statutLabelPdf(statutId) {
    return window.ktaTextePdf(_statutLabel(statutId));
  }

  // ── Constantes ──────────────────────────────────────────────────────

  // Palette fixe de 10 couleurs lisibles en sombre comme en clair, contrastées entre voisines (pas de
  // confusion en briefing). Ordre = alphabet OTAN (Alpha, Bravo, Charlie…).
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

  // Au-delà de 10 scénarios par plan, le plus ancien non protégé part (cf _saveScenarios).
  const MAX_SCENARIOS = 10;

  // Vitesse de fouille par défaut en m/s, gardée pour l'API publique (SecoursMode.VITESSE_MPS_DEFAUT) et
  // alignée sur DUREE_DEFAUT (1,5 km/h). 🩸 Le calcul ne la lit pas : il lit les réglages du scénario
  // (`reglagesDuree`) — une valeur divergente ici tromperait un intégrateur.
  const VITESSE_MPS_DEFAUT = 1.5 / 3.6;   // = DUREE_DEFAUT.vitesseKmh (déclaré plus bas)

  // Statuts d'étape de la vue Exécution : 4 de base + 3 critiques. Ajouter une entrée ici suffit (rendu,
  // couleurs, PDF et rapport JSON suivent).
  // ⚠️ id = ASCII minuscule sans accent (stocké) ; severity sert au tri/escalade de la vue Opérateur
  // (0 neutre, 1 attention, 2 alerte, 3 urgence absolue).
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
    // 🩸 « Étape suivante » sans statut ne doit pas valoir RAS : une étape SAUTÉE deviendrait « fouillée, rien
    // à signaler » dans le rapport. Statut posé par l'app seulement (`auto` : jamais proposé en bouton).
    {
      id: "non-renseigne",
      emoji: "⚪",
      label: "Passée, non renseignée",
      color: "#8892a4",
      severity: 0,
      auto: true
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

  // Entrée du tableau par id (repli : pending).
  function _getStatutInfo(statutId) {
    return TABLEAU_STATUTS.find(function(st) { return st.id === statutId; })
        || TABLEAU_STATUTS[0];   // fallback pending
  }

  // ── État du module ──────────────────────────────────────────────────

  // Scénarios du plan courant : lus par _loadScenarios, mutés par le CRUD, persistés après chaque mutation.
  let _scenarios = [];
  // Clé de stockage dont _scenarios est le reflet (posée par _loadScenarios, effacée par reset). 🩸 Sans elle, une
  // écriture plan fermé (accueil) partait de la liste vidée par reset et écrasait le stockage du plan : un
  // scénario reçu en temps réel effaçait les brouillons de l'utilisateur.
  let _cleChargee = null;

  // Scénario édité dans la modale (null si fermée ou en liste) ; renderOverlay s'en sert.
  let _currentScenarioId = null;

  // Racine DOM de la modale (null si fermée). ouvrir() ferme l'ancienne avant d'en créer une.
  let _modal = null;
  // Vue active (mise à jour par _switchView) : _afficherModalePhase re-rend la bonne vue après une mutation
  // (« Ajouter une phase » existe en Édition ET en Live).
  let _activeView = null;

  // Couche Leaflet des zones d'équipes : créée par renderOverlay, nettoyée par clearOverlay (et au
  // changement de plan).
  let _overlayLayer = null;

  // Groupe focalisé (null = tous) : en focus, les zones des autres équipes sont masquées.
  let _focusedGroupeId = null;
  // Listener Échap de la modale Phase, gardé au scope module pour le retirer si on la rouvre sans l'avoir
  // fermée (oldModal.remove() retire le DOM, pas le listener sur document).
  let _phaseModalEsc = null;

  // Échap des sous-modales : un seul listener actif à la fois ; en ouvrir une retire l'éventuel orphelin.
  // Usage : const unbindEsc = _bindSubModalEsc(_close); … puis unbindEsc() dans _close().
  // La modale principale a son propre `_onKeyDown`, plus large.
  let _activeSubModalEsc = null;
  function _bindSubModalEsc(closeFn) {
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

  // Listeners onChange, appelés après chaque mutation persistée.
  const _changeListeners = [];

  // ── Persistance localStorage ───────────────────────────────────────

  // Clé localStorage du plan courant, ou null sans plan chargé.
  function _storageKey() {
    const planId = window._currentLoadedPlanId;
    if (!planId || typeof planId !== "string") return null;
    return "myktamap_secours_v1_" + planId;
  }

  // ── Multi-phases (modèle + migration) ──────────────────────────────
  // Ex. phase 1 : balayage des axes principaux, retour, debrief PC ; phase 2 : quelques équipes en chambres.
  // Choix de conception :
  //   · équipes définies au scénario, cochées par phase (phase.groupeIds[]) ;
  //   · transition assistée (auto-détection + toast), décidée par l'opérateur ;
  //   · parcours modifiables entre phases ; mêmes statuts d'étape ;
  //   · PDF global avec sections par phase + debriefs ; « Terminer la phase » réservé à l'opérateur.
  // ⚠️ Un scénario sans phases[] est migré au chargement vers 1 phase implicite couvrant tous ses groupes
  // (pas de changement de format).

  const PHASE_DEFAULT_NOM = "Phase 1";

  // Phase vide (id unique, idx, libellé, équipes) : migration, createScenario, ajout de phase.
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

  // Migration vers multi-phases, idempotente. Cas :
  //   · pas de phases[] → 1 phase implicite avec tous les groupes (et startedAt/endedAt de l'exécution
  //     éventuelle, pour les rapports) ;
  //   · execution sans currentPhaseIdx → 0 ;
  //   · phases[0] sans groupeIds valides alors que le scénario a des groupes → tous les groupes (filet).
  function _migrateScenarioV1ToPhases(s) {
    if (!s || typeof s !== "object") return;
    if (!Array.isArray(s.phases) || s.phases.length === 0) {
      const allGroupeIds = (Array.isArray(s.groupes) ? s.groupes : [])
        .map(function(g) { return g && g.id; })
        .filter(function(id) { return typeof id === "string"; });
      const phase0 = _construirePhase(0, PHASE_DEFAULT_NOM, allGroupeIds);
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
    if (s.execution && typeof s.execution === "object"
        && typeof s.execution.currentPhaseIdx !== "number") {
      s.execution.currentPhaseIdx = 0;
    }
    if (s.phases.length === 1
        && (!Array.isArray(s.phases[0].groupeIds) || s.phases[0].groupeIds.length === 0)
        && Array.isArray(s.groupes) && s.groupes.length > 0) {
      s.phases[0].groupeIds = s.groupes
        .map(function(g) { return g && g.id; })
        .filter(function(id) { return typeof id === "string"; });
    }
  }

  // Phase active (execution.currentPhaseIdx) ; sans exécution ou sans phases → phases[0] ; sinon null.
  function _getCurrentPhase(s) {
    if (!s || !Array.isArray(s.phases) || s.phases.length === 0) return null;
    const idx = (s.execution && typeof s.execution.currentPhaseIdx === "number")
                ? s.execution.currentPhaseIdx
                : 0;
    return s.phases[idx] || s.phases[0] || null;
  }

  // Groupes ASSIGNÉS à une phase ; les groupeIds qui ne correspondent plus à une équipe sont ignorés.
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

  // Vrai si l'équipe est dans phases[phaseIdx].groupeIds (faux si phase ou id invalide).
  function _groupeParticipeAPhase(s, equipeId, phaseIdx) {
    if (!s || !Array.isArray(s.phases) || typeof equipeId !== "string") return false;
    const phase = s.phases[phaseIdx];
    if (!phase || !Array.isArray(phase.groupeIds)) return false;
    return phase.groupeIds.indexOf(equipeId) !== -1;
  }

  // ── Mutations des phases (garantissent les invariants) ─────────────

  // Ajoute une phase en fin de tableau ; nom par défaut « Phase N+1 », groupeIds éventuellement vide.
  // Retourne la phase créée, ou null si scénario introuvable.
  function creerPhase(scenarioId, nom, groupeIds) {
    const s = get(scenarioId);
    if (!s) return null;
    if (!Array.isArray(s.phases)) s.phases = [];
    const nextIdx = s.phases.length;
    const safeName = (typeof nom === "string" && nom.trim())
                     ? nom.trim().slice(0, 80)
                     : "Phase " + (nextIdx + 1);
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

  // Renomme une phase. Retourne true si OK.
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

  // Supprime une phase, sauf : la dernière, la phase ACTIVE de l'exécution (passer par
  // terminerPhase/lancerPhaseSuivante), une phase déjà démarrée (historique préservé). Renumérote les idx.
  function supprimerPhase(scenarioId, phaseIdx) {
    const s = get(scenarioId);
    if (!s || !Array.isArray(s.phases)) return false;
    if (s.phases.length <= 1) {
      console.warn("[SecoursMode] Refus suppression : au moins 1 phase doit exister.");
      return false;
    }
    const phase = s.phases[phaseIdx];
    if (!phase) return false;
    if (s.execution && s.execution.active === true
        && s.execution.currentPhaseIdx === phaseIdx) {
      console.warn("[SecoursMode] Refus suppression : phase active. Utiliser terminerPhase (C3).");
      return false;
    }
    if (phase.startedAt) {
      console.warn("[SecoursMode] Refus suppression : phase déjà démarrée (historique préservé).");
      return false;
    }
    s.phases.splice(phaseIdx, 1);
    s.phases.forEach(function(p, i) { p.idx = i; });
    // Supprimer une phase située AVANT la phase active décale currentPhaseIdx d'un cran.
    if (s.execution && typeof s.execution.currentPhaseIdx === "number"
        && s.execution.currentPhaseIdx > phaseIdx) {
      s.execution.currentPhaseIdx--;
    }
    _commitMutation(s);
    return true;
  }

  // ── Transitions, debrief, auto-détection ───────────────────────────

  // Phase active « prête à clore » : AU MOINS UNE équipe participante a une étape sortie et toutes celles qui
  // en ont une l'ont complétée. Une équipe sans sortie est ignorée (l'opérateur décide de toute façon).
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
      const sortie = arr.find(function(e) { return e && e.type === "sortie"; });
      if (!sortie) continue;
      auMoinsUneSortie = true;
      if (!sortie.completedAt) return false;
    }
    return auMoinsUneSortie;
  }

  // Archive les étapes de la phase courante dans s.execution.etapesArchive[phaseIdx] (copie profonde) :
  // les rapports retrouvent l'historique par phase sans marquer chaque étape.
  function _archivePhaseEtapes(s, phaseIdx) {
    if (!s || !s.execution) return;
    if (!s.execution.etapesArchive) s.execution.etapesArchive = {};
    // ⚠️ Copie JSON : une étape archivée ne doit plus évoluer (contrat de l'historique).
    try {
      s.execution.etapesArchive[String(phaseIdx)] =
        JSON.parse(JSON.stringify(s.execution.etapes || {}));
      // Les signalements hors parcours de la phase restent avec son historique.
      if (s.execution._etapesRetirees) {
        s.execution.etapesArchive[String(phaseIdx)]._retirees =
          JSON.parse(JSON.stringify(s.execution._etapesRetirees));
      }
    } catch(e) {
      console.warn("[SecoursMode] _archivePhaseEtapes échec :", e);
    }
  }

  // Étapes archivées d'une équipe pour une phase, ou null (phase active ou absente de l'archive : l'appelant
  // retombe sur s.execution.etapes via _getEtapesEquipe).
  function _getArchivedEtapes(s, phaseIdx, equipeId) {
    if (!s || !s.execution || !s.execution.etapesArchive) return null;
    const archive = s.execution.etapesArchive[String(phaseIdx)];
    if (!archive || !Array.isArray(archive[equipeId])) return null;
    return archive[equipeId];
  }

  // Termine la phase active : archive les étapes, pose endedAt, enregistre opts.debrief (+ debriefAt).
  // ⚠️ Ne lance PAS la phase suivante : l'auto-détection assiste, debrief et lancerPhaseSuivante restent
  // des gestes explicites. Retourne le scénario, ou null.
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
    _archivePhaseEtapes(s, phaseIdx);
    // Le PARCOURS PRÉVU de chaque équipe est copié : replanifier la phase suivante ne l'efface pas (le rapport
    // montre le parcours de chaque phase).
    _archivePhaseParcours(s, phaseIdx);
    phase.endedAt = _nowIso();
    _journaliser(s, "secours.mc.phaseClose", { phase: phase.nom || String(phaseIdx + 1) });
    if (opts && typeof opts.debrief === "string") {
      phase.debrief = opts.debrief.slice(0, 5000);
      phase.debriefAt = _nowIso();
    }
    _commitMutation(s);
    return s;
  }

  // Lance la phase suivante. Pré-conditions : exécution active, phase actuelle terminée (endedAt), phase
  // suivante existante. Les étapes des équipes participantes sont reconstruites depuis leur parcours ACTUEL
  // (modifiable entre phases) ; celles des non-participantes quittent s.execution.etapes (la vue Live
  // n'affiche que les équipes concernées) et restent dans etapesArchive. Retourne la phase, ou null.
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
    const newEtapes = {};
    const participants = _listerEquipesPhase(s, nextIdx);
    participants.forEach(function(g) {
      newEtapes[g.id] = _buildEtapesPourEquipe(g);
    });
    // _notes_libres (mode secouriste, hors équipes) est préservé.
    if (s.execution.etapes && s.execution.etapes._notes_libres) {
      newEtapes._notes_libres = s.execution.etapes._notes_libres;
    }
    // L'archive des étapes retirées appartient à la phase close : une étape remise en phase 2 ne doit pas
    // récupérer les saisies de la phase 1.
    delete s.execution._etapesRetirees;
    s.execution.etapes = newEtapes;
    s.execution.currentPhaseIdx = nextIdx;
    nextPhase.startedAt = _nowIso();
    _journaliser(s, "secours.mc.phaseLancee", { phase: nextPhase.nom || String(nextIdx + 1) });
    // Réarme l'auto-détection pour la nouvelle phase.
    if (s.execution._phaseReadyToastShownForIdx === currentIdx) {
      delete s.execution._phaseReadyToastShownForIdx;
    }
    _liveEquipeFocusIdx     = 0;
    _liveEquipeFreshSession = true;
    _commitMutation(s);
    return nextPhase;
  }

  // Participation d'une équipe à une phase (ajout / retrait), idempotent. Retourne true si modifié.
  function affecterEquipeAPhase(scenarioId, equipeId, phaseIdx, participe) {
    const s = get(scenarioId);
    if (!s || !Array.isArray(s.phases) || typeof equipeId !== "string") return false;
    const phase = s.phases[phaseIdx];
    if (!phase) return false;
    if (!Array.isArray(phase.groupeIds)) phase.groupeIds = [];
    const pos = phase.groupeIds.indexOf(equipeId);
    let changed = false;
    if (participe && pos === -1) {
      if (s.groupes.some(function(g) { return g.id === equipeId; })) {
        phase.groupeIds.push(equipeId);
        changed = true;
      }
    } else if (!participe && pos !== -1) {
      phase.groupeIds.splice(pos, 1);
      changed = true;
    }
    // 🩸 Équipe cochée dans la phase EN COURS : il lui faut ses étapes tout de suite.
    if (changed && participe && s.execution && s.execution.currentPhaseIdx === phaseIdx) {
      const g = s.groupes.find(function(x) { return x.id === equipeId; });
      _resyncEtapesEquipe(s, g);
    }
    if (changed) _commitMutation(s);
    return changed;
  }

  // Charge les scénarios du plan courant ; absent → vide, corrompu → reset + warn. Migration multi-phases
  // appliquée à chacun (idempotente).
  function _loadScenarios() {
    const key = _storageKey();
    _cleChargee = key;
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
      _scenarios = parsed.filter(function(s) {
        return s && typeof s === "object" && typeof s.id === "string" && typeof s.nom === "string";
      });
      _scenarios.forEach(_migrateScenarioV1ToPhases);
      // Durées recalculées avec les réglages Secours propres.
      if (_scenarios.map(_migrerDurees).some(Boolean)) {
        try { localStorage.setItem(key, JSON.stringify(_scenarios)); } catch(e) {}
      }
    } catch(e) {
      console.warn("[SecoursMode] Échec parse storage :", e);
      _scenarios = [];
    }
  }

  // Persiste dans localStorage (synchrone : les CRUD viennent de gestes utilisateur), limite MAX_SCENARIOS.
  function _saveScenarios() {
    const key = _storageKey();
    if (!key) return false;
    // ⚠️ Jamais par-dessus des scénarios qui ne sont pas en mémoire (plan fermé, ou changé sans init) : l'écriture
    // est refusée ; un scénario reçu entre-temps revient du serveur à la réouverture du plan.
    if (key !== _cleChargee) {
      console.warn("[SecoursMode] écriture refusée : scénarios de ce plan non chargés (plan fermé ?)");
      return false;
    }
    // Limite FIFO : on retire les plus anciens.
    // 🩸 JAMAIS un scénario en exécution, ni celui ouvert, ni le plus récent (sinon créer un 11ᵉ scénario
    // pendant une intervention l'effacerait). Si tout l'excédent est protégé, on dépasse la limite.
    // 🩸 Âge FIFO = la plus récente de la création et de l'arrivée sur CET appareil : un scénario IMPORTÉ garde
    // le `createdAt` du PC et serait purgé dans le commit même de son import.
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
        // 🩸 Intervention TERMINÉE dont aucun rapport n'est sorti de l'appareil : la purger effacerait ses
        // saisies et ses photos.
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
      // Toast si quota dépassé (comme sessionPersist).
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

  // ── Helpers internes ────────────────────────────────────────────────

  // ID unique (scénario, groupe, point clé).
  function _genId(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  function _nowIso() { return new Date().toISOString(); }

  // updatedAt + listeners + sauvegarde + rafraîchissement de l'overlay.
  function _commitMutation(scenario) {
    if (scenario && typeof scenario === "object") {
      scenario.updatedAt = _nowIso();
    }
    _saveScenarios();
    _notify();
    _majFooterSecours();
    try { _majRoadSuivi(scenario); } catch(e) {}   // étapes faites → itinéraire suivi
    if (_overlayLayer && scenario && scenario.id === _currentScenarioId) {
      renderOverlay(scenario.id);
    }
    // Événement `mktm:secours-scenario-mutated` (scenarioId, planExternalId, updatedAt) pour un module
    // extérieur qui veut un traitement différentiel, sans la liste complète de _changeListeners.
    // No-op sans écouteur (aucun côté community).
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
      // Navigateur sans constructeur CustomEvent : ignoré.
    }
  }

  function _notify() {
    _changeListeners.forEach(function(cb) {
      try { cb(_scenarios); } catch(e) { /* swallow handler errors */ }
    });
  }

  // ── CRUD des scénarios ──────────────────────────────────────────────

  // Copie défensive (pas la référence interne).
  function list() {
    return _scenarios.slice();
  }

  function get(id) {
    _assurerCharge();
    return _scenarios.find(function(s) { return s.id === id; }) || null;
  }

  // Liste en mémoire alignée sur le stockage du plan courant avant toute lecture ou modification : après reset
  // (plan fermé) ou avant init, un scénario reçu ou créé s'ajoute aux scénarios ENREGISTRÉS, jamais à une liste vide.
  function _assurerCharge() {
    const key = _storageKey();
    if (key && key !== _cleChargee) _loadScenarios();
  }

  // Nouveau scénario vide ; nom vide → « Scénario du <date> ».
  function createScenario(nom) {
    _assurerCharge();
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
      // 1 phase vide : addGroupe y pousse les équipes par défaut.
      phases: [_construirePhase(0, PHASE_DEFAULT_NOM, [])]
    };
    _scenarios.push(scenario);
    _commitMutation(scenario);
    return scenario;
  }

  // Mise à jour partielle (fusion superficielle, champs en liste blanche). Retourne le scénario ou null.
  function updateScenario(id, partial) {
    const s = get(id);
    if (!s || !partial || typeof partial !== "object") return null;
    if ("nom" in partial && typeof partial.nom === "string") s.nom = partial.nom;
    if ("context" in partial && partial.context && typeof partial.context === "object") {
      // context : fusion superficielle (les champs absents du partial restent).
      Object.keys(partial.context).forEach(function(k) {
        s.context[k] = partial.context[k];
      });
    }
    if ("pointsCles" in partial && Array.isArray(partial.pointsCles)) {
      s.pointsCles = partial.pointsCles.slice();
    }
    // Types de POI exclus de « POI de la zone » (chaînes courtes, 100 au plus).
    if ("tagsExclusPoiZone" in partial && Array.isArray(partial.tagsExclusPoiZone)) {
      s.tagsExclusPoiZone = partial.tagsExclusPoiZone.filter(function(x) { return typeof x === "string"; })
        .map(function(x) { return x.slice(0, 60); }).slice(0, 100);
    }
    if ("reglagesDuree" in partial && partial.reglagesDuree && typeof partial.reglagesDuree === "object") {
      const r = partial.reglagesDuree;
      s.reglagesDuree = {
        vitesseKmh: Math.max(0.2, Math.min(8, Number(r.vitesseKmh) || DUREE_DEFAUT.vitesseKmh)),
        vitesseApprocheKmh: Math.max(0.2, Math.min(8, Number(r.vitesseApprocheKmh) || DUREE_DEFAUT.vitesseApprocheKmh)),
        pauseMin:   Math.max(0, Math.min(120, Number(r.pauseMin) || 0)),
        margeRetardMin: Math.max(0, Math.min(240, Number.isFinite(Number(r.margeRetardMin)) && r.margeRetardMin !== ""
                          ? Number(r.margeRetardMin) : DUREE_DEFAUT.margeRetardMin))
      };
    }
    _commitMutation(s);
    return s;
  }

  // Les photos d'un scénario qui disparaît (supprimé, purgé par la limite) ou d'une exécution relancée
  // partent avec lui : restées en base sous les mêmes ids, elles compteraient dans le quota de 5 par étape.
  function _purgerPhotosScenario(id) {
    const P = window.MyKTAMapSecoursPhotos;
    if (!id || !P || typeof P.deletePhotosForScenario !== "function") return;
    P.deletePhotosForScenario(id).catch(function(e) { console.warn("[SecoursMode] photos :", e); });
  }

  function deleteScenario(id) {
    _assurerCharge();
    const idx = _scenarios.findIndex(function(s) { return s.id === id; });
    if (idx < 0) return false;
    _scenarios.splice(idx, 1);
    _purgerPhotosScenario(id);
    if (_currentScenarioId === id) {
      _currentScenarioId = null;
      clearOverlay();
    }
    _saveScenarios();
    _notify();
    // Pendant de `mktm:secours-scenario-mutated` : une suppression VOULUE seulement (pas la purge FIFO, simple
    // limite de stockage local). No-op sans écouteur.
    try {
      window.dispatchEvent(new CustomEvent("mktm:secours-scenario-deleted", {
        detail: { scenarioId: id, planExternalId: window._currentLoadedPlanId || null, ts: _nowIso() }
      }));
    } catch(e) { /* anciens navigateurs : rien */ }
    return true;
  }

  // ── Exécution (mode terrain) ────────────────────────────────────────
  // Format de scenario.execution (active, startedAt/endedAt, pause, role, currentEquipeId, etapes par équipe,
  // _notes_libres du rôle secouriste) : docs/architecture/secours.md. Persisté dans le scénario (même clé
  // localStorage). Changer de plan ne ferme PAS l'exécution active.

  // Étapes d'une équipe depuis son parcours actuel (entrée + intermédiaires + sortie), toutes « pending ».
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

  // 🩸 Équipe ajoutée ou parcours modifié PENDANT une phase : les étapes sont reconstruites depuis le parcours
  // actuel, et ce qui est déjà saisi est reporté sur l'étape appariée (`_apparierEtapes`). Une étape retirée
  // porteuse de données n'est pas jetée : `execution._etapesRetirees[gid]`, restaurée si elle revient ; les
  // photos suivent leur étape en IndexedDB (`setStepIdx`, -2 = retirée) ; le focus live est recalé.
  const ETAPE_CHAMPS_SAISIS = ["statut", "observations", "photoIds", "startedAt", "completedAt", "_importedFrom",
    "_obsImport", "victimePos"];   // _obsImport : dernier texte reçu ; victimePos : position précisée
  function _etapeADesDonnees(e) {
    return !!e && (e.statut !== "pending" || !!(e.observations || "").trim()
                   || (e.photoIds || []).length > 0 || !!e.startedAt);
  }
  function _cleWaypoint(wp) {
    if (!wp || typeof wp.x !== "number" || typeof wp.y !== "number") return null;
    return Math.round(wp.x) + "," + Math.round(wp.y) + "," + (Number.isInteger(wp.level) ? wp.level : 0);
  }
  // 🩸 Identité d'un point de passage : `wid`, posé à sa création (updateGroupe, export, lancement) et porté
  // par chaque étape. C'est la seule clé fiable : apparier par libellé relie des étapes sans rapport
  // (homonymes, aller-retour par le même carrefour).
  // 🩸 Un wid manquant est CALCULÉ (équipe + rôle + position + rang d'occurrence), jamais tiré au hasard :
  // deux appareils qui ont le même parcours trouvent le même wid sans rien échanger. Tiré au hasard, chaque
  // téléphone aurait le sien et le rapport fusionné dupliquerait les étapes.
  function _widDeterministe(gid, role, wp, rang) {
    const src = String(gid || "") + "|" + role + "|" + (_cleWaypoint(wp) || "") + "|" + rang;
    let h = 0x811c9dc5;
    for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return "W" + h.toString(36) + "r" + rang;
  }
  // Pose les wid manquants d'un parcours [{role, wp}] (dans l'ordre). Le rang compte TOUS les points de même
  // rôle et même position, avec ou sans wid.
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
  // Étapes construites sans wid : elles correspondent une à une au parcours ACTUEL (toute modification en
  // exécution resynchronise), on leur rattache donc le wid.
  function _rattacherWidEtapes(s, g) {
    const ex = s && s.execution;
    const et = ex && ex.etapes && g && ex.etapes[g.id];
    if (!Array.isArray(et) || et.every(function(e) { return e && e.wid; })) return;
    const liste = [];
    if (g.entree) liste.push(g.entree);
    (g.intermediaires || []).forEach(function(w) { liste.push(w); });
    if (g.sortie) liste.push(g.sortie);
    if (liste.length !== et.length) return;
    // 🩸 Exécution ancienne : étapes possiblement décalées du parcours → rattachement seulement si type ET
    // libellé concordent.
    const roles = _parcoursRoles(g.entree, g.intermediaires, g.sortie);
    et.forEach(function(e, i) {
      const w = liste[i];
      if (!w || e.type !== roles[i].role || e.label !== (w.label || _fmtPoint(w))) return;
      if (!e.wid && w.wid) e.wid = w.wid;
      if (!e.cle) e.cle = _cleWaypoint(w);
    });
  }
  // Mêmes conditions pour la resynchronisation ET la garde de retrait.
  function _resyncApplicable(s, g) {
    const ex = s && s.execution;
    if (!ex || !ex.active || !ex.etapes || !g) return false;
    if (ex.role === "secouriste" && !Array.isArray(ex.etapes[g.id])
        && !Object.keys(ex.etapes).some(function(k) { return k !== "_notes_libres"; })) return false;
    const phaseIdx = (typeof ex.currentPhaseIdx === "number") ? ex.currentPhaseIdx : 0;
    if (Array.isArray(s.phases) && s.phases.length > 0 && !_groupeParticipeAPhase(s, g.id, phaseIdx)) return false;
    return true;
  }
  // Pour chaque cible, la source appariée (ou null) ; chaque source ne sert qu'une fois.
  // Passe 1 : même wid. Passe 2 (l'un des deux sans wid) : même type + même position. Passe 3 (cible sans wid
  // ni position, données anciennes) : même type + même libellé, dans l'ordre. Passe 4 : cible sans libellé →
  // même numéro.
  function _apparierEtapes(sources, cibles) {
    // 🩸 Un wid INCONNU de l'autre côté (tiré ailleurs, ou ancien) ne vaut rien : on retombe sur la position,
    // puis le libellé.
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
    // 1. Saisies des étapes conservées.
    const paires = _apparierEtapes(anciennes, nouvelles);
    nouvelles.forEach(function(n, i) {
      const o = paires[i];
      if (!o) return;
      _reporterSaisies(o, n);
      if (o.idx !== n.idx) _photosVersEtape(n.photoIds, n.idx);
    });
    // 2. Étape qui revient : restaurée depuis l'archive.
    const orphelines = nouvelles.filter(function(n, i) { return !paires[i]; });
    const restaurees = _apparierEtapes(archive, orphelines);
    orphelines.forEach(function(n, i) {
      const a = restaurees[i];
      if (!a) return;
      _reporterSaisies(a, n);
      delete n.retireeAt;
      _photosVersEtape(n.photoIds, n.idx);
    });
    // 3. Étapes retirées porteuses de données → archive (photos hors rapport : -2).
    const gardeArchive = archive.filter(function(a) { return restaurees.indexOf(a) < 0; });
    anciennes.forEach(function(o) {
      if (paires.indexOf(o) >= 0 || !_etapeADesDonnees(o)) return;
      gardeArchive.push(Object.assign({}, o, { retireeAt: _nowIso() }));
      _photosVersEtape(o.photoIds, -2);
    });
    ex._etapesRetirees = ex._etapesRetirees || {};
    if (gardeArchive.length > 0) ex._etapesRetirees[g.id] = gardeArchive;
    else delete ex._etapesRetirees[g.id];
    // 4. Étape affichée recalée (équipe en cours sur cet appareil).
    if (ex.currentEquipeId === g.id) {
      const vue = anciennes[_liveEquipeFocusIdx];
      const k = vue ? paires.indexOf(vue) : -1;
      _liveEquipeFocusIdx = (k >= 0) ? k : Math.min(_liveEquipeFocusIdx, Math.max(0, nouvelles.length - 1));
    }
    ex.etapes[g.id] = nouvelles;
    return true;
  }

  // Lance l'exécution : s.execution avec les étapes de chaque équipe, active = true, startedAt = maintenant.
  // Rôle « secouriste » : pas d'équipes, un tableau _notes_libres. Retourne le scénario, ou null.
  function lancerExecution(scenarioId, opts) {
    const s = get(scenarioId);
    if (!s) return null;
    opts = opts || {};
    const role = opts.role || "operateur";
    const currentEquipeId = opts.currentEquipeId || null;

    // Exécution déjà active : on ne l'écrase pas (l'arrêter d'abord) ; seuls rôle et équipe changent.
    if (s.execution && s.execution.active === true) {
      s.execution.role = role;
      s.execution.currentEquipeId = currentEquipeId;
      _commitMutation(s);
      return s;
    }

    if (s.execution) _purgerPhotosScenario(s.id);     // exécution relancée : photos de l'ancienne
    (s.groupes || []).forEach(_normaliserParcours);   // identités des points (wid)
    const etapes = {};
    if (role !== "secouriste") {
      (s.groupes || []).forEach(function(g) {
        etapes[g.id] = _buildEtapesPourEquipe(g);
      });
    } else {
      // Secouriste libre : pas d'équipes structurées.
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
      currentPhaseIdx: 0
    };
    _journaliser(s, "secours.mc.lancement", {});   // main courante
    // 🩸 Nouveau lancement = nouvelles heures de phase : le départ par défaut d'une équipe est le début de
    // phase, et un scénario rejoué le lendemain mettrait toutes les équipes « en retard de 9 à 12 h » dès la
    // première seconde. Le debrief écrit reste (texte de l'utilisateur).
    if (Array.isArray(s.phases)) {
      s.phases.forEach(function(p, i) {
        if (!p) return;
        p.startedAt = i === 0 ? s.execution.startedAt : null;
        p.endedAt = null;
      });
    }
    // Focus remis à zéro + marque de session neuve : saut initial vers la 1re étape pending, puis la
    // navigation de l'utilisateur prend le relais.
    _liveEquipeFocusIdx     = 0;
    _liveEquipeFreshSession = true;
    _commitMutation(s);
    return s;
  }

  // Arrête l'exécution en la gardant comme historique (active = false, endedAt) : le rapport final reste
  // consultable avec ses observations.
  function arreterExecution(scenarioId) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.active) return null;
    // En pause : on compte le dernier segment avant d'arrêter.
    if (s.execution.pausedAt) {
      const pauseDur = Date.now() - Date.parse(s.execution.pausedAt);
      if (pauseDur > 0) s.execution.pausedTotalMs += pauseDur;
      s.execution.pausedAt = null;
    }
    s.execution.active = false;
    s.execution.endedAt = _nowIso();
    _journaliser(s, "secours.mc.fin", {});   // main courante
    // endedAt sur la phase active si l'utilisateur arrête sans « Terminer la phase » (déjà posé : intact).
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

  // Pause / reprise. pausedTotalMs garde le chronomètre juste (temps écoulé − pauses cumulées).
  function pauseExecution(scenarioId, paused) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.active) return null;
    if (paused && !s.execution.pausedAt) {
      s.execution.pausedAt = _nowIso();
    } else if (!paused && s.execution.pausedAt) {
      const pauseDur = Date.now() - Date.parse(s.execution.pausedAt);
      if (pauseDur > 0) s.execution.pausedTotalMs += pauseDur;
      s.execution.pausedAt = null;
    }
    _commitMutation(s);
    return s;
  }

  // ── Installation reliée : prises NEUTRES ────────────────────────────
  // Sans extension : aucun bouton, aucun texte, tout est permis, aucun événement n'a d'écouteur.
  const _actionsExt = new Map(); let _actionsExtSeq = 0;
  function _X() { return window.KtaExtensions || null; }
  function _htmlActionsExt(ctx) {
    const X = _X();
    if (!X || typeof X.secoursActions !== "function") return "";
    const liste = X.secoursActions(ctx);
    if (!liste.length) return "";
    return '<div class="kta-secours-ext-actions">' + liste.map(function(a) {
      const id = "x" + (++_actionsExtSeq);
      _actionsExt.set(id, a.action);
      if (_actionsExt.size > 300) _actionsExt.delete(_actionsExt.keys().next().value);
      return '<button type="button" class="kta-btn kta-btn-xs ' + (a.danger ? "kta-btn-danger" : "kta-btn-secondary") +
        '" data-kta-secours-ext="' + id + '">' + _escHtml(a.libelle) + '</button>';
    }).join("") + '</div>';
  }
  function _htmlInfoEquipeExt(scenarioId, equipeId) {
    const X = _X();
    const txt = (X && typeof X.secoursInfoEquipe === "function") ? X.secoursInfoEquipe(scenarioId, equipeId) : "";
    return txt ? '<div class="kta-secours-ext-info">' + _escHtml(txt) + '</div>' : "";
  }
  document.addEventListener("click", function(e) {
    const b = e.target && e.target.closest && e.target.closest("[data-kta-secours-ext]");
    if (!b) return;
    const f = _actionsExt.get(b.getAttribute("data-kta-secours-ext"));
    if (typeof f !== "function") return;
    e.preventDefault(); e.stopPropagation();
    try { f(); } catch (err) { console.warn("[SecoursMode] action d'extension :", err); }
  });
  // Garde : l'extension peut réserver une action (ex. seul le chef déclare la rentrée). Refus = dit.
  function _peut(scenarioId, equipeId, quoi) {
    const X = _X();
    if (!X || typeof X.secoursPeutAvancer !== "function" || X.secoursPeutAvancer(scenarioId, equipeId, quoi)) return true;
    _toast(t("secours.ext.refuse"), "warn");
    return false;
  }
  let _appliqueDistant = false;   // changement reçu d'un autre appareil : pas de ré-émission
  function _emettre(nom, detail) {
    if (_appliqueDistant) return;
    try { window.dispatchEvent(new CustomEvent(nom, { detail: detail })); } catch (e) { /* rien */ }
  }
  function _copieEtape(et) {
    return { idx: et.idx, wid: et.wid || null, type: et.type, statut: et.statut, observations: et.observations || "",
      startedAt: et.startedAt || null, completedAt: et.completedAt || null, victimePos: et.victimePos || null,
      photoIds: Array.isArray(et.photoIds) ? et.photoIds.slice() : [], majAt: et.majAt || null };
  }
  function _emettreSuivi(s, gid) {
    const su = _suiviEquipe(s, gid) || {};
    _emettre("mktm:secours-suivi-change", { scenarioId: s.id, equipeId: gid, phase: _phaseCour(s),
      suivi: { departAt: su.departAt || null, rentreeAt: su.rentreeAt || null, rappelAt: su.rappelAt || null,
        remontes: Number.isInteger(su.remontes) ? su.remontes : null, majAt: _nowIso() } });
  }
  // Re-rendu après un changement reçu, sauf si l'utilisateur est en train d'écrire dans la fenêtre.
  function _rafraichirApresDistant(scenarioId) {
    if (!_modal || scenarioId !== _currentScenarioId) return;
    const a = document.activeElement;
    if (a && _modal.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    if (_activeView === "live" || _activeView === "edit") _switchView(_activeView);
  }
  // Étape reçue (relais d'une installation reliée) : la plus récente (majAt) gagne ; photos unies.
  function appliquerEtapeDistante(scenarioId, equipeId, etape) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.etapes || !etape) return false;
    const arr = s.execution.etapes[equipeId];
    if (!Array.isArray(arr)) return false;
    const et = (etape.wid && arr.find(function(x) { return x && x.wid === etape.wid; })) ||
               (Number.isInteger(etape.idx) ? arr[etape.idx] : null);
    if (!et) return false;
    const tl = Date.parse(et.majAt || "") || 0, tr = Date.parse(etape.majAt || "") || 0;
    if (tr && tl && tr <= tl) {
      // Plus ancienne ici : seules ses photos peuvent compléter l'étape.
      const plus = (etape.photoIds || []).filter(function(id) { return (et.photoIds || []).indexOf(id) < 0; });
      if (!plus.length) return false;
      et.photoIds = (et.photoIds || []).concat(plus);
    } else {
      const info = TABLEAU_STATUTS.find(function(x) { return x.id === etape.statut; });
      if (info) et.statut = info.id;
      if (typeof etape.observations === "string") et.observations = etape.observations.slice(0, 2000);
      ["startedAt", "completedAt"].forEach(function(k) { if (k in etape) et[k] = etape[k] || null; });
      if ("victimePos" in etape) et.victimePos = etape.victimePos || null;
      et.photoIds = Array.from(new Set((et.photoIds || []).concat(Array.isArray(etape.photoIds) ? etape.photoIds : [])));
      et.majAt = etape.majAt || _nowIso();
    }
    _appliqueDistant = true;
    try { _commitMutation(s); } finally { _appliqueDistant = false; }
    _rafraichirApresDistant(scenarioId);
    return true;
  }
  // Suivi d'équipe reçu (départ / rentrée / rappel / remontés) : un horodatage déjà posé ici n'est pas effacé.
  function appliquerSuiviDistant(scenarioId, equipeId, phase, suivi) {
    const s = get(scenarioId);
    if (!s || !s.execution || !suivi) return false;
    const ex = s.execution, k = String(Number.isInteger(phase) ? phase : _phaseCour(s));
    ex.suivi = ex.suivi || {}; ex.suivi[k] = ex.suivi[k] || {};
    const su = ex.suivi[k][equipeId] = ex.suivi[k][equipeId] || {};
    ["departAt", "rentreeAt", "rappelAt"].forEach(function(c) { if (suivi[c] && !su[c]) su[c] = suivi[c]; });
    if (Number.isInteger(suivi.remontes)) su.remontes = suivi.remontes;
    _appliqueDistant = true;
    try { _commitMutation(s); } finally { _appliqueDistant = false; }
    _rafraichirApresDistant(scenarioId);
    return true;
  }
  // Rejoindre son poste (intervention déclenchée sur une installation reliée) : ouvre le scénario, lance
  // (ou reprend) l'exécution avec ce rôle et cette équipe, vue Live.
  function rejoindre(scenarioId, opts) {
    if (!get(scenarioId)) return false;
    opts = opts || {};
    const role = ["operateur", "equipe", "secouriste"].indexOf(opts.role) >= 0 ? opts.role : "operateur";
    // Geste explicite (« Rejoindre », « Déclencher ») et appelant synchrone (le pro lit l'exécution juste après) :
    // pas de question, l'autre intervention est arrêtée (gardée dans l'historique) et on le dit.
    const autre = _autreEnCours(scenarioId);
    if (autre) {
      arreterExecution(autre.id);
      _toast(t("secours.lancer.autreArretee", { nom: autre.nom || "" }), "warn");
    }
    ouvrir(scenarioId);
    lancerExecution(scenarioId, { role: role, currentEquipeId: role === "equipe" ? (opts.equipeId || null) : null });
    _switchView("live");
    return true;
  }

  // Mise à jour partielle d'une étape (liste blanche : observations, statut, photoIds, startedAt,
  // completedAt).
  function updateEtape(scenarioId, equipeId, etapeIdx, partial) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.etapes) return null;
    const arr = s.execution.etapes[equipeId];
    if (!Array.isArray(arr) || etapeIdx < 0 || etapeIdx >= arr.length) return null;
    const et = arr[etapeIdx];
    if (!partial || typeof partial !== "object") return et;
    if (!_peut(scenarioId, equipeId, "etape")) return null;   // réservable (installation reliée)
    if ("observations" in partial && typeof partial.observations === "string") {
      et.observations = partial.observations.slice(0, 2000);
    }
    if ("statut" in partial && typeof partial.statut === "string") {
      const info = TABLEAU_STATUTS.find(function(st) { return st.id === partial.statut; });
      if (info && info.id !== et.statut && info.id !== "pending") {
        _journaliser(s, "secours.mc.statut", { equipe: _nomEquipe(s, equipeId), etape: _lblEtape(et.label) || "?", statut: info.id });
      }
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
    // Horodatage de la dernière modification : départage deux appareils qui touchent la même étape (relais
    // en direct d'une installation reliée, cf _fusionnerExecutionDirect).
    et.majAt = _nowIso();
    if ("victimePos" in partial) {   // position précisée de la victime (ou null)
      const v = partial.victimePos;
      et.victimePos = (v && typeof v.x === "number" && typeof v.y === "number")
        ? { x: v.x, y: v.y, level: Number.isInteger(v.level) ? v.level : 0, at: v.at || _nowIso() } : null;
      if (et.victimePos) _journaliser(s, "secours.mc.victimePos", { equipe: _nomEquipe(s, equipeId), pos: _lblPos(et.victimePos) });
    }
    _commitMutation(s);
    _emettre("mktm:secours-etape-changee", { scenarioId: s.id, equipeId: equipeId, etape: _copieEtape(et) });
    // Auto-détection : l'étape sortie qui vient d'être complétée termine-t-elle la phase active ? Toast
    // « Phase prête à clore » une seule fois par phase (_phaseReadyToastShownForIdx), seulement pour
    // l'opérateur et en multi-phases (phases.length >= 2).
    try {
      const phaseIdx = s.execution.currentPhaseIdx || 0;
      const isOp = (s.execution.role === "operateur");
      const isMulti = Array.isArray(s.phases) && s.phases.length >= 2;
      const alreadyShown = (s.execution._phaseReadyToastShownForIdx === phaseIdx);
      if (isOp && isMulti && !alreadyShown && _phaseEstPretAClore(s)) {
        s.execution._phaseReadyToastShownForIdx = phaseIdx;
        _commitMutation(s);
        // Toast non bloquant : l'opérateur ouvre lui-même le debrief (confirmation volontaire).
        _toast(t("secours.toast.phasePretAClore"), "info");
      }
    } catch(e) { /* swallow watcher errors */ }
    return et;
  }

  // Statut d'une étape + completedAt si non pending. L'étape précédente sans completedAt en reçoit un aussi
  // (l'équipe l'a forcément passée).
  function marquerEtapeStatut(scenarioId, equipeId, etapeIdx, statutId) {
    const partial = { statut: statutId };
    const info = TABLEAU_STATUTS.find(function(st) { return st.id === statutId; });
    if (info && !info.isPending) {
      partial.completedAt = _nowIso();
    }
    const updated = updateEtape(scenarioId, equipeId, etapeIdx, partial);
    // startedAt posé sur l'étape courante si absent.
    if (updated && !updated.startedAt) {
      updateEtape(scenarioId, equipeId, etapeIdx, { startedAt: _nowIso() });
    }
    return updated;
  }

  // Temps écoulé depuis le lancement (ms), pauses exclues ; figé pendant une pause.
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

  // ── Victime : une position ──────────────────────────────────────────
  // La victime est au point de son étape (niveau compris) ou à la position précisée sur la carte
  // (`etape.victimePos`, qui voyage dans le rapport et se fusionne). Source unique : _victimesDe (vues,
  // carte, rapports).
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
  // « Départ 14:02 · rentrée 16:12 · rappelée 15:50 » pour les rapports.
  function _ligneSuiviRapport(ed) {
    const su = (ed && ed.suivi) || {};
    const parts = [];
    if (su.departAt)  parts.push(t("secours.retour.depart", { h: _heureCourte(su.departAt) }));
    if (su.rappelAt)  parts.push(t("secours.retour.rappeleeA", { h: _heureCourte(su.rappelAt) }));
    if (su.rentreeAt) parts.push(t("secours.retour.rentreeA", { h: _heureCourte(su.rentreeAt) }));
    const effR = _effectif(ed && ed.equipe);
    if (Number.isInteger(su.remontes)) {
      parts.push(effR && su.remontes < effR ? t("secours.b9.manquantsCourt", { n: effR - su.remontes, remontes: su.remontes, effectif: effR })
                                            : t("secours.b9.remontesOk", { n: su.remontes, effectif: effR || "?" }));
    }
    return parts.join(" · ");
  }
  // Texte libre vers un PDF : window.ktaTextePdf (utils.js). Accents gardés, flèches et coches
  // converties (-> et OK), emojis et symboles hors police retirés ; espaces resserrés.
  function _stripPourPdf(txt) {
    return window.ktaTextePdf(txt).replace(/\s{2,}/g, " ").trim();
  }
  // Texte saisi par l'utilisateur (nom, note, observation) vers un PDF : filtré D'ABORD, puis
  // repli sur `defaut` s'il ne reste rien (un nom 100 % emoji donnerait un titre vide).
  function _pdfLibre(txt, defaut) {
    const s = _stripPourPdf(txt);
    return s || (defaut == null ? "" : String(defaut));
  }
  function _heureCourte(iso) {
    return iso ? new Date(iso).toLocaleTimeString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
  }

  // ── Départ, retour prévu, retard ────────────────────────────────────
  // Chaque équipe engagée dans la phase en cours a un suivi (s.execution.suivi[phase][gid]) : départ
  // (bouton, sinon début de phase / lancement), rentrée. Retour prévu = départ + durée estimée ; orange
  // passé l'heure, rouge après la marge réglable.
  // ⚠️ Pas de réseau entre appareils : chacun calcule SES alertes ; les heures voyagent dans le rapport
  // d'équipe et se fusionnent.
  function _phaseCour(s) {
    return (s && s.execution && typeof s.execution.currentPhaseIdx === "number") ? s.execution.currentPhaseIdx : 0;
  }
  function _suiviEquipe(s, gid, creer) {
    const ex = s && s.execution;
    if (!ex) return null;
    const k = String(_phaseCour(s));
    if (creer) {
      ex.suivi = ex.suivi || {};
      ex.suivi[k] = ex.suivi[k] || {};
      ex.suivi[k][gid] = ex.suivi[k][gid] || {};
    }
    return (ex.suivi && ex.suivi[k] && ex.suivi[k][gid]) || null;
  }
  function _equipeEngagee(s, g) { return _getEtapesEquipe(s, g.id).length > 0; }
  // Effectif = personnes qui DESCENDENT (décision produit). Saisi s'il l'est ; sinon le plus grand de
  // « membres nommés » et « comptes reliés ». 🩸 Jamais déduit des seuls comptes quand une saisie existe :
  // une équipe de 4 avec un seul téléphone a 1 compte mais 4 personnes à remonter.
  function _scenarioDuGroupe(g) {
    for (let i = 0; i < _scenarios.length; i++) if ((_scenarios[i].groupes || []).indexOf(g) >= 0) return _scenarios[i];
    return null;
  }
  function _nbComptesEquipe(g) {
    const X = _X();
    if (!g || !X || typeof X.secoursNbComptesEquipe !== "function") return 0;
    const s = _scenarioDuGroupe(g);
    return s ? X.secoursNbComptesEquipe(s.id, g.id) : 0;
  }
  // { n, source: "saisi"|"comptes"|"membres"|null, membres, comptes }
  function _effectifDetail(g) {
    const membres = (g && Array.isArray(g.membres)) ? g.membres.length : 0;
    const comptes = _nbComptesEquipe(g);
    if (g && Number.isInteger(g.effectif) && g.effectif > 0) return { n: g.effectif, source: "saisi", membres: membres, comptes: comptes };
    if (!membres && !comptes) return { n: null, source: null, membres: 0, comptes: 0 };
    return comptes > membres ? { n: comptes, source: "comptes", membres: membres, comptes: comptes }
                             : { n: membres, source: "membres", membres: membres, comptes: comptes };
  }
  function _effectif(g) { return _effectifDetail(g).n; }
  // Ligne sous le champ : d'où vient le chiffre, et alerte si la saisie est plus basse que ce qu'on sait.
  function _htmlAideEffectif(g) {
    const d = _effectifDetail(g);
    let txt, cls = "kta-tx-muted";
    if (d.source === "saisi") {
      const connu = Math.max(d.membres, d.comptes);
      if (connu > d.n) {
        cls = "kta-tx-warn";
        txt = t("secours.b9.effAlerte", { n: d.n, m: connu, quoi: t(d.comptes >= d.membres ? "secours.b9.effQuoiComptes" : "secours.b9.effQuoiMembres") });
      } else txt = t("secours.b9.effSaisi", { n: d.n });
    } else if (d.source === "comptes") txt = t("secours.b9.effComptes", { n: d.n });
    else if (d.source === "membres") txt = t("secours.b9.effMembres", { n: d.n });
    else txt = t("secours.b9.effInconnu");
    return '<div class="kta-secours-effectif-aide ' + cls + '" data-effectif-aide="' + _escAttr(g.id) + '">' + _escHtml(txt) + '</div>';
  }
  function _majAideEffectif(scenarioId, gid) {
    const s = get(scenarioId);
    const g = s && (s.groupes || []).find(function(x) { return x.id === gid; });
    const el = g && document.querySelector('[data-effectif-aide="' + gid.replace(/"/g, "") + '"]');
    if (el) el.outerHTML = _htmlAideEffectif(g);
    const inp = g && document.querySelector('[data-action="edit-effectif"][data-gid="' + gid.replace(/"/g, "") + '"]');
    if (inp) inp.placeholder = String(Math.max(g.membres ? g.membres.length : 0, _nbComptesEquipe(g)) || "");
  }
  function _chef(g) {
    const m = (g && Array.isArray(g.membres)) ? g.membres : [];
    // Sans liste de membres, le chef se saisit librement (sinon aucune équipe sans membres n'aurait de chef).
    if (g && g.chef && (!m.length || m.indexOf(g.chef) >= 0)) return g.chef;
    return m[0] || null;
  }
  // Contrôle des engagés pour la vue opérateur : équipes de la phase en cours ; effectif inconnu compté à
  // part.
  function _bilanEngages(s) {
    const r = { engages: 0, sousTerre: 0, manquants: 0, inconnus: [] };
    const ph = _phaseCour(s);
    (s.groupes || []).forEach(function(g) {
      if (!_groupeParticipeAPhase(s, g.id, ph)) return;
      const eff = _effectif(g), su = _suiviEquipe(s, g.id) || {};
      if (!eff) { if (!su.rentreeAt) r.inconnus.push(g.nom); return; }
      r.engages += eff;
      if (!su.rentreeAt) r.sousTerre += eff;
      else { const m = _manquants(g, su); r.manquants += m; r.sousTerre += m; }
    });
    return r;
  }
  function _renderBilanEngages(s) {
    const b = _bilanEngages(s);
    const alerte = b.manquants > 0 || b.inconnus.length > 0;
    return '<div class="kta-secours-bilan ' + (b.manquants > 0 ? 'kta-tx-err' : alerte ? 'kta-tx-warn' : '') + '">' +
             '👥 ' + _escHtml(t("secours.bilan.ligne", { engages: b.engages, sousTerre: b.sousTerre, manquants: b.manquants })) +
             (b.inconnus.length ? ' · ' + _escHtml(t("secours.bilan.inconnus", { n: b.inconnus.length, noms: b.inconnus.join(", ") })) : '') +
           '</div>';
  }
  // Personnes manquantes à la rentrée (0 si tout le monde est remonté ou effectif inconnu).
  function _manquants(g, su) {
    const eff = _effectif(g);
    if (!su || !su.rentreeAt || !Number.isInteger(su.remontes) || !eff) return 0;
    return Math.max(0, eff - su.remontes);
  }
  function _fmtMinutes(m) {
    m = Math.max(0, Math.round(m));
    return m >= 60 ? Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") : m + " min";
  }
  // { etat: "rentree"|"inconnu"|"ok"|"orange"|"rouge", departIso, departExplicite, retourMs, ecartMin }
  function _etatRetour(s, g) {
    const su = _suiviEquipe(s, g.id) || {};
    const phase = Array.isArray(s.phases) ? s.phases[_phaseCour(s)] : null;
    const departIso = su.departAt || (phase && phase.startedAt) || (s.execution && s.execution.startedAt) || null;
    const base = { departIso: departIso, departExplicite: !!su.departAt, rentreeAt: su.rentreeAt || null, rappelAt: su.rappelAt || null };
    if (su.rentreeAt) {
      const manque = _manquants(g, su);
      return Object.assign(base, { etat: manque > 0 ? "manquant" : "rentree", manquants: manque,
                                   remontes: su.remontes, effectif: _effectif(g) });
    }
    const duree = (typeof g.dureeEstimeeMin === "number" && g.dureeEstimeeMin > 0) ? g.dureeEstimeeMin : null;
    const imperatif = _heureRetourMs(g, departIso);   // prime sur l'estimation
    if (!imperatif && (!duree || !departIso)) return Object.assign(base, { etat: "inconnu" });
    const retourMs = imperatif || (Date.parse(departIso) + duree * 60000);
    base.imperatif = !!imperatif;
    const now = Date.now();
    const marge = _reglagesDuree(s).margeRetardMin * 60000;
    const etat = now > retourMs + marge ? "rouge" : (now > retourMs ? "orange" : "ok");
    return Object.assign(base, { etat: etat, retourMs: retourMs, ecartMin: (now - retourMs) / 60000 });
  }
  // « HH:MM » → instant : le prochain HH:MM à partir du départ (une consigne à 01:00
  // pour un départ à 22:00 tombe le lendemain). null si pas de consigne.
  function _heureRetourMs(g, departIso) {
    if (!g || typeof g.heureRetour !== "string" || !/^\d{2}:\d{2}$/.test(g.heureRetour)) return null;
    const dep = departIso ? new Date(departIso) : new Date();
    const d = new Date(dep.getTime());
    d.setHours(Number(g.heureRetour.slice(0, 2)), Number(g.heureRetour.slice(3, 5)), 0, 0);
    if (d.getTime() <= dep.getTime()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  function _texteRetour(s, g) {
    const e = _etatRetour(s, g);
    if (e.etat === "manquant") return t("secours.b9.manquants", { n: e.manquants, remontes: e.remontes, effectif: e.effectif, h: _heureCourte(e.rentreeAt) });
    if (e.etat === "rentree") return t("secours.retour.rentreeA", { h: _heureCourte(e.rentreeAt) }) +
      (Number.isInteger(e.remontes) && e.effectif ? " · " + t("secours.b9.remontesOk", { n: e.remontes, effectif: e.effectif }) : "");
    const dep = e.departIso ? t("secours.retour.depart", { h: _heureCourte(e.departIso) }) +
                (e.departExplicite ? "" : " " + t("secours.retour.departDefaut")) : "";
    if (e.etat === "inconnu") return dep + " · " + t("secours.retour.sansDuree");
    const prevu = t(e.imperatif ? "secours.retour.imperatif" : "secours.retour.prevu", { h: _heureCourte(new Date(e.retourMs).toISOString()) });
    const reste = e.ecartMin > 0 ? t("secours.retour.retard", { duree: _fmtMinutes(e.ecartMin) })
                                 : t("secours.retour.dans", { duree: _fmtMinutes(-e.ecartMin) });
    return dep + " · " + prevu + " · " + reste;
  }
  // Ligne « départ / retour » + boutons, dans la vue équipier et sur les cartes opérateur.
  function _renderLigneRetour(s, g) {
    const e = _etatRetour(s, g);
    const estOp = s.execution && s.execution.role === "operateur";
    return '<div class="kta-secours-retour kta-secours-retour--' + e.etat + '" data-live-retour="' + _escAttr(g.id) + '">' +
             (e.rappelAt ? '<span class="kta-secours-rappel-badge">' + _escHtml(t("secours.retour.rappeleeA", { h: _heureCourte(e.rappelAt) })) + '</span>' : '') +
             '<span class="kta-secours-retour-txt">' + _escHtml(_texteRetour(s, g)) + '</span>' +
             (e.etat === "manquant"
               ? '<span class="kta-secours-retour-btns"><button class="kta-btn kta-btn-danger kta-btn-xs" data-action="retour-remontes" data-gid="' + _escAttr(g.id) + '">' + t("secours.b9.corriger") + '</button></span>'
               : '') +
             (e.etat !== "rentree" && e.etat !== "manquant"
               ? '<span class="kta-secours-retour-btns">' +
                   (!e.departExplicite ? '<button class="kta-btn kta-btn-secondary kta-btn-xs" data-action="retour-depart" data-gid="' + _escAttr(g.id) + '">' + t("secours.retour.btnDepart") + '</button>' : '') +
                   (estOp && !e.rappelAt ? '<button class="kta-btn kta-btn-secondary kta-btn-xs" data-action="rappel-equipe" data-gid="' + _escAttr(g.id) + '">' + t("secours.rappel.btnEquipe") + '</button>' : '') +
                   '<button class="kta-btn kta-btn-secondary kta-btn-xs" data-action="retour-rentree" data-gid="' + _escAttr(g.id) + '">' + t("secours.retour.btnRentree") + '</button>' +
                 '</span>'
               : '') +
           '</div>';
  }
  // ── Rappel ──────────────────────────────────────────────────────────
  // ⚠️ Aucun réseau entre appareils : l'app NE PRÉVIENT PAS les équipes. Le rappel est un ÉTAT tenu par
  // l'opérateur (qui, à quelle heure), transmis par radio ou à la voix, affiché en violet et consigné dans
  // le rapport. La confirmation le dit (décision produit).
  function _equipesARappeler(s) {
    return (s.groupes || []).filter(function(g) {
      const su = _suiviEquipe(s, g.id) || {};
      return _equipeEngagee(s, g) && !su.rentreeAt && !su.rappelAt;
    });
  }
  async function _rappeler(sid, gids) {
    const s = get(sid);
    if (!s || !gids.length) { _toast(t("secours.rappel.aucune"), "info"); return false; }
    if (!_peut(sid, null, "rappel")) return false;   // PC seulement (installation reliée)
    const noms = (s.groupes || []).filter(function(g) { return gids.indexOf(g.id) >= 0; })
                                  .map(function(g) { return _escHtml(g.nom); }).join(", ");
    const msg = t("secours.rappel.confirm", { n: gids.length, equipes: noms, h: _heureCourte(_nowIso()) });
    const ok = await window.ktaConfirm(msg, {
      titre: t("secours.rappel.confirmTitre"), okLabel: t("secours.rappel.confirmOk")
    });
    if (!ok) return false;
    const s2 = get(sid);
    if (!s2 || !_estExecutionActive(s2)) return false;
    const h = _nowIso();
    gids.forEach(function(gid) {
      _suiviEquipe(s2, gid, true).rappelAt = h;
      _journaliser(s2, "secours.mc.rappel", { equipe: _nomEquipe(s2, gid) });
    });
    _commitMutation(s2);
    gids.forEach(function(gid) { _emettreSuivi(s2, gid); });
    _toast(t("secours.rappel.fait", { n: gids.length }), "info");
    return true;
  }

  // « Rentrée » demande COMBIEN sont remontés. En dessous de l'effectif : alerte rouge « N personne(s)
  // manquante(s) » tant que ce n'est pas corrigé — le contrôle le plus important sur le terrain.
  async function _demanderRemontes(sid, gid) {
    const s = get(sid);
    const g = s && (s.groupes || []).find(function(x) { return x.id === gid; });
    if (!g) return false;
    if (!_peut(sid, gid, "rentree")) return false;   // chef de l'équipe ou PC (installation reliée)
    const eff = _effectif(g);
    const su0 = _suiviEquipe(s, gid) || {};
    const nombre = { label: t("secours.b9.remontesLabel", { effectif: eff || "?" }),
                     // 🩸 Jamais prérempli avec l'effectif : un seul « Valider » donnerait « 3/3 » sans que
                     // personne n'ait compté.
                     valeur: Number.isInteger(su0.remontes) ? su0.remontes : null, min: 0, max: 99 };
    const msg = t("secours.b9.remontesQuestion", { equipe: _escHtml(g.nom) });
    const ok = (typeof window.ktaConfirm === "function")
      ? await window.ktaConfirm(msg, { titre: t("secours.b9.remontesTitre"), okLabel: t("secours.b9.remontesOk2"), nombre: nombre })
      : false;
    if (!ok) return false;
    const compte = (Number.isInteger(nombre.valeur) && nombre.valeur >= 0) ? nombre.valeur : null;
    // Effectif connu : le compte est obligatoire. Inconnu : on peut valider sans compte
    // (sinon une équipe aux membres non nommés ne pourrait jamais être déclarée rentrée).
    if (compte === null && eff) { _toast(t("secours.b9.compteRequis"), "warn"); return false; }
    const s2 = get(sid);
    if (!s2 || !_estExecutionActive(s2)) return false;
    const su = _suiviEquipe(s2, gid, true);
    const premiere = !su.rentreeAt;
    if (premiere) su.rentreeAt = _nowIso();
    if (compte !== null) su.remontes = compte;
    const manque = _manquants(g, su);
    _journaliser(s2, manque > 0 ? "secours.mc.manquants" : (premiere ? "secours.mc.rentree" : "secours.mc.remontesCorrige"),
                 { equipe: g.nom, n: manque, remontes: su.remontes, effectif: eff || "?" });
    _commitMutation(s2);
    _emettreSuivi(s2, gid);
    if (manque > 0) {
      _toast(t("secours.b9.toastManquants", { equipe: g.nom, n: manque }), "error");
      // Soumis au réglage Vibration ; seules les alertes de survie passent outre (kta_vibrate.urgence).
      if (window.kta_vibrate) window.kta_vibrate([400, 150, 400, 150, 400]);
    }
    return true;
  }

  function marquerSuivi(scenarioId, gid, champ) {
    const s = get(scenarioId);
    if (!s || !_estExecutionActive(s) || ["departAt", "rentreeAt", "rappelAt"].indexOf(champ) < 0) return;
    if (!_peut(scenarioId, gid, { departAt: "depart", rentreeAt: "rentree", rappelAt: "rappel" }[champ])) return;
    _suiviEquipe(s, gid, true)[champ] = _nowIso();
    _journaliser(s, { departAt: "secours.mc.depart", rentreeAt: "secours.mc.rentree", rappelAt: "secours.mc.rappel" }[champ],
                 { equipe: _nomEquipe(s, gid) });
    _commitMutation(s);
    _emettreSuivi(s, gid);
  }
  // Rang d'affichage : les équipes en retard d'abord.
  const RANG_RETOUR = { manquant: -1, rouge: 0, orange: 1, ok: 2, inconnu: 3, rentree: 4 };

  // Veille des retards, fenêtre fermée comprise : pastille du footer + toast et vibration au franchissement
  // d'un seuil (une fois par équipe et par seuil).
  let _veilleRetardsId = null;
  const _seuilsNotifies = {};
  function _veilleRetards() {
    const s = _scenarioEnCours();
    if (!s) return;
    const eqId = (s.execution.role === "equipe") ? s.execution.currentEquipeId : null;
    // Un seul toast pour tous les seuils franchis ensemble : un toast chasse le précédent, la première équipe
    // en retard disparaîtrait.
    const messages = [];
    let rouge = false;
    (s.groupes || []).forEach(function(g) {
      if (eqId && g.id !== eqId) return;
      if (!_equipeEngagee(s, g)) return;
      const e = _etatRetour(s, g);
      const cle = s.id + "|" + _phaseCour(s) + "|" + g.id;
      const avant = _seuilsNotifies[cle] || "ok";
      if ((e.etat === "orange" || e.etat === "rouge") && RANG_RETOUR[e.etat] < RANG_RETOUR[avant]) {
        _seuilsNotifies[cle] = e.etat;
        if (e.etat === "rouge") rouge = true;
        messages.push(e.etat === "rouge" ? t("secours.retour.toastRouge", { equipe: g.nom, duree: _fmtMinutes(e.ecartMin) })
                                         : t("secours.retour.toastOrange", { equipe: g.nom }));
      }
    });
    if (messages.length) {
      _toast(messages.join(" · "), rouge ? "error" : "warn");
      if (window.kta_vibrate) window.kta_vibrate(rouge ? [300, 150, 300, 150, 300] : [200]);
    }
    _majFooterSecours(true);
  }

  // Notes du secouriste libre → main courante du PC, à leur heure, signées « Secouriste », sans doublon
  // (id de la note). Photos non importées (elles restent dans son rapport PDF). Retourne le nombre ajouté.
  function _importerNotesSecouriste(payload) {
    const s = get(_currentScenarioId);
    if (!s || !s.execution) return 0;
    const deja = {};
    (s.execution.mainCourante || []).forEach(function(e) { if (e.p && e.p.noteId) deja[e.p.noteId] = true; });
    let n = 0;
    (payload.notesLibres || []).forEach(function(note) {
      if (!note || isNaN(Date.parse(note.ts)) || (note.id && deja[note.id])) return;
      _journaliser(s, "secours.mc.secouriste",
        { texte: String(note.texte || "").slice(0, 2000), statut: typeof note.statut === "string" ? note.statut : "ras", noteId: note.id || null },
        { at: note.ts, source: t("secours.secouriste.source") });
      n++;
    });
    _journaliser(s, "secours.mc.importSecouriste", { n: n });
    _commitMutation(s);
    return n;
  }

  // ── Hors-ligne au lancement ─────────────────────────────────────────
  // Plan SERVEUR pas entièrement disponible hors ligne sur cet appareil = carte peut-être incomplète sous
  // terre : on prévient sans bloquer (un plan importé en ZIP est déjà là). Rend le texte de l'avertissement
  // (ou null), glissé dans le message UNIQUE du lancement (plusieurs messages successifs masquent les
  // boutons).
  async function _verifierHorsLigne() {
    try {
      const id = window._currentLoadedPlanId;
      const R = window.PlanRegistry, PO = window.PlanOffline;
      const e = (id && R && typeof R.findById === "function") ? R.findById(id) : null;
      if (!e || e.type !== "server" || !PO || !PO.supporte()) return null;
      const st = await PO.statut(id);
      if (st && st.etat === "complet") return null;
      const s = _scenarioEnCours();
      if (s) { _journaliser(s, "secours.mc.pasHorsLigne", {}); _commitMutation(s); }
      return t("secours.b10.pasHorsLigne");
    } catch(err) { console.warn("[SecoursMode] contrôle hors-ligne :", err); return null; }
  }

  // ── Niveau des zones ────────────────────────────────────────────────
  // Une zone polygone vaut au niveau où elle a été DESSINÉE (niveau de ses sommets, sinon celui de l'équipe),
  // ou sur tous les niveaux si l'équipe le demande (`zoneTousNiveaux`). 🩸 Sans cette règle, un niveau
  // inférieur est annoncé « couvert à 80 % » alors que 5 % en sont parcourus.
  function _mlvlActif() { return !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true); }
  function _niveauZone(g) {   // null = tous niveaux
    if (!_mlvlActif() || !g || g.zoneTousNiveaux) return null;
    const v = (g.zonePolygon || []).find(function(p) { return p && Number.isInteger(p.level); });
    return v ? v.level : (Number.isInteger(g.level) ? g.level : 0);
  }
  function _dansZonePolygone(g, pt, niveau) {
    if (!g || g.zoneType !== "polygon" || !Array.isArray(g.zonePolygon) || g.zonePolygon.length < 3) return false;
    const nz = _niveauZone(g);
    if (nz !== null && (Number.isInteger(niveau) ? niveau : 0) !== nz) return false;
    return _pointInPolygon(pt, g.zonePolygon);
  }
  // Galeries SOUS le polygone d'une équipe, à un niveau où ni sa zone ni son parcours ne vont :
  // [{ niveau, m, horsZone }] (≥ 50 m). `horsZone` : niveau exclu de la zone (dessinée ailleurs) ; sinon niveau
  // de la zone que l'itinéraire ne visite pas.
  function _niveauxNonParcourus(g) {
    if (!_mlvlActif() || !g || g.zoneType !== "polygon" || !Array.isArray(g.zonePolygon) || g.zonePolygon.length < 3) return [];
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    const visites = {};
    (g.itineraireSuggere || []).forEach(function(p) { if (p && Number.isInteger(p.level)) visites[p.level] = true; });
    const nz = _niveauZone(g);
    const parNiveau = {};
    _tousLesTraces().forEach(function(r) {
      const lvl = Number.isInteger(r.level) ? r.level : 0;
      if (visites[lvl]) return;
      const pts = r.points;
      for (let i = 1; i < pts.length; i++) {
        const m = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 };
        if (_pointInPolygon(m, g.zonePolygon)) parNiveau[lvl] = (parNiveau[lvl] || 0) + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      }
    });
    return Object.keys(parNiveau).map(Number).sort(function(a, b) { return a - b; })
      .map(function(l) { return { niveau: l, m: parNiveau[l] / pxParM, horsZone: nz !== null && l !== nz }; })
      .filter(function(x) { return x.m >= 50; });
  }
  function _texteNiveauxNonParcourus(g, liste) {
    if (!liste.length) return "";
    const fmt = function(m) { return (typeof window.formatDistance === "function") ? window.formatDistance(m, 1) : Math.round(m) + " m"; };
    return t("secours.niv.sousZone", { equipe: g.nom, liste: liste.map(function(x) {
      return t(x.horsZone ? "secours.niv.itemHorsZone" : "secours.niv.itemSansParcours", { niveau: x.niveau, long: fmt(x.m) });
    }).join(" · ") });
  }

  // ── Couverture ──────────────────────────────────────────────────────
  // Aide à la lecture, sans affectation automatique : (1) POI DANS la zone d'une équipe mais hors de son
  // parcours, (2) POI visités par plusieurs équipes, (3) part des galeries couverte par les zones (tracés
  // sélectionnés ou segments dont le milieu tombe dans un polygone). Zones polygone testées au niveau de la
  // zone ; zones « tracés » sans filtre de niveau (ordre de grandeur).
  function _calculerCouverture(s) {
    const groupes = (s && s.groupes) || [];
    // L'uid d'abord : deux POI homonymes ne sont pas « le même ».
    const cle = function(w) { return w && (w.pointUid || w.pointId || (Math.round(w.x) + "," + Math.round(w.y))); };
    const parcoursDe = function(g) {
      return [g.entree].concat(g.intermediaires || [], [g.sortie]).filter(function(w) { return w && typeof w.x === "number"; });
    };
    const visites = {};
    groupes.forEach(function(g) {
      const vus = {};
      parcoursDe(g).forEach(function(w) {
        const k = cle(w);
        if (vus[k]) return;          // boucle entrée = sortie : une seule fois
        vus[k] = true;
        (visites[k] = visites[k] || { nom: w.label || _lblEtape(_fmtPoint(w)), equipes: [] }).equipes.push(g.nom);
      });
    });
    const doublons = Object.keys(visites).map(function(k) { return visites[k]; })
                           .filter(function(v) { return v.equipes.length > 1; });
    const pois = (typeof window.getAllEmbeddedPoints === "function") ? (window.getAllEmbeddedPoints() || []) : [];
    const horsParcours = [];
    groupes.forEach(function(g) {
      if (!g.zoneType) return;
      const dans = {};
      parcoursDe(g).forEach(function(w) { dans[cle(w)] = true; });
      const traces = g.zoneType === "roads" ? _tracesZone(g) : [];
      const noms = [];
      pois.forEach(function(p) {
        if (!p || typeof p.x !== "number" || !p.nom) return;
        if (dans[p.id] || dans[Math.round(p.x) + "," + Math.round(p.y)]) return;
        let inside = false;
        if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
          inside = _dansZonePolygone(g, p, p.level);   // 8b : au niveau de la zone
        } else if (g.zoneType === "roads") {
          inside = traces.some(function(r) { return r && Array.isArray(r.points) && _distPointPolyline(p, r.points) <= 30; });
        }
        if (inside) noms.push(p.nom);
      });
      if (noms.length) horsParcours.push({ equipe: g.nom, noms: noms });
    });
    const tous = _tousLesTraces();
    const clesZones = {};
    groupes.forEach(function(g) { if (g.zoneType === "roads") _tracesZone(g).forEach(function(r) { clesZones[_cleTrace(r)] = true; }); });
    const zonesPoly = groupes.filter(function(g) { return g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3; });
    let total = 0, couvert = 0;
    tous.forEach(function(r) {
      const pts = r.points;
      const entier = !!clesZones[_cleTrace(r)];
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        total += d;
        if (entier) { couvert += d; continue; }
        const m = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 };
        if (zonesPoly.some(function(g) { return _dansZonePolygone(g, m, r.level); })) couvert += d;   // 8b : niveau
      }
    });
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    return { doublons: doublons, horsParcours: horsParcours, totalM: total / pxParM, couvertM: couvert / pxParM };
  }
  // Couverture par niveau : longueur, part dans une zone, part SUR UN PARCOURS (tronçon dont le milieu est
  // à < 3 m de l'itinéraire calculé d'une équipe, même niveau), longueur affectée à 2 équipes ou plus.
  // 🩸 « Sous une zone » ≠ « parcouru » : seule la part sur parcours dit ce qui sera vraiment fouillé.
  // Itinéraires indexés dans une grille (des dizaines de km de galeries × plusieurs parcours).
  function _couvertureParNiveau(s) {
    const groupes = (s && s.groupes) || [];
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    const tol = 3 * pxParM, cell = 20 * pxParM;
    const grille = {};
    groupes.forEach(function(g) {
      const it = g.itineraireSuggere;
      if (!Array.isArray(it)) return;
      for (let i = 1; i < it.length; i++) {
        const a = it[i - 1], b = it[i];
        const lvl = Number.isInteger(b.level) ? b.level : 0;
        const x0 = Math.floor(Math.min(a.x, b.x) / cell), x1 = Math.floor(Math.max(a.x, b.x) / cell);
        const y0 = Math.floor(Math.min(a.y, b.y) / cell), y1 = Math.floor(Math.max(a.y, b.y) / cell);
        for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
          (grille[lvl + ":" + cx + ":" + cy] = grille[lvl + ":" + cx + ":" + cy] || []).push([a, b]);
        }
      }
    });
    const surParcours = function(m, lvl) {
      const cx = Math.floor(m.x / cell), cy = Math.floor(m.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const segs = grille[lvl + ":" + (cx + dx) + ":" + (cy + dy)];
        if (segs && segs.some(function(sg) { return _distPointPolyline(m, sg) <= tol; })) return true;
      }
      return false;
    };
    const clesParEquipe = groupes.map(function(g) {
      const k = {};
      if (g.zoneType === "roads") _tracesZone(g).forEach(function(r) { k[_cleTrace(r)] = true; });
      return k;
    });
    const niveaux = {}, horsParcours = [];
    _tousLesTraces().forEach(function(r) {
      const lvl = Number.isInteger(r.level) ? r.level : 0;
      const cleR = _cleTrace(r);
      const n = niveaux[lvl] = niveaux[lvl] || { total: 0, zone: 0, parcours: 0, double: 0 };
      const pts = r.points;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        const m = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 };
        n.total += d;
        let nbZones = 0;
        groupes.forEach(function(g, gi) { if (clesParEquipe[gi][cleR] || _dansZonePolygone(g, m, lvl)) nbZones++; });
        if (nbZones > 0) n.zone += d;
        if (nbZones > 1) n.double += d;
        if (surParcours(m, lvl)) n.parcours += d;
        else horsParcours.push({ level: lvl, a: pts[i - 1], b: pts[i] });
      }
    });
    Object.keys(niveaux).forEach(function(k) {
      const n = niveaux[k];
      n.total /= pxParM; n.zone /= pxParM; n.parcours /= pxParM; n.double /= pxParM;
    });
    const alertes = groupes.map(function(g) { return _texteNiveauxNonParcourus(g, _niveauxNonParcourus(g)); }).filter(Boolean);
    const sansIti = groupes.filter(function(g) { return !(Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2); })
                           .map(function(g) { return g.nom; });
    return { niveaux: niveaux, horsParcours: horsParcours, alertes: alertes, sansIti: sansIti };
  }
  let _couvDerniere = null, _couvCalque = null;
  // Surligne sur la carte les galeries hors parcours du niveau affiché (préparer la
  // phase suivante). Second appel = on retire.
  function _basculerSurlignageCouverture(s) {
    if (_couvCalque) {
      try { window.map.removeLayer(_couvCalque); } catch(e) {}
      _couvCalque = null;
      _toast(t("secours.couv.surlignageRetire"), "info");
      return false;
    }
    if (!window.map || !_couvDerniere) return false;
    const niveau = _mlvlActif() ? (Number.isInteger(window.APP_CONFIG.activeLevel) ? window.APP_CONFIG.activeLevel : 0) : null;
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    let m = 0;
    const segs = [];
    _couvDerniere.horsParcours.forEach(function(sg) {
      if (niveau !== null && sg.level !== niveau) return;
      m += Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y) / pxParM;
      segs.push([_planToLatLng(sg.a), _planToLatLng(sg.b)]);
    });
    // UNE polyligne multiple : des milliers de tronçons, un calque chacun pèserait sur mobile.
    _couvCalque = L.polyline(segs, { color: "#ff6b6b", weight: 5, opacity: 0.85, interactive: false });
    _couvCalque.addTo(window.map);
    fermer();
    const fmt = (typeof window.formatDistance === "function") ? window.formatDistance(m, 1) : Math.round(m) + " m";
    _toast(t("secours.couv.surlignageOk", { long: fmt, niveau: niveau === null ? "—" : niveau }), "warn");
    return true;
  }
  function _renderCouverture(s) {
    const c = _calculerCouverture(s);
    const fmt = function(m) { return (typeof window.formatDistance === "function") ? window.formatDistance(m, 1) : Math.round(m) + " m"; };
    const cp = _couvDerniere = _couvertureParNiveau(s);
    const pctDe = function(a, b) { return b > 0 ? Math.round(100 * a / b) + " %" : "—"; };
    const tot = { total: 0, zone: 0, parcours: 0, double: 0 };
    const ligne = function(lbl, n, cls) {
      return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + lbl + '</td><td>' + fmt(n.total) + '</td>' +
             '<td>' + pctDe(n.zone, n.total) + '</td><td><strong>' + pctDe(n.parcours, n.total) + '</strong></td>' +
             '<td>' + (n.double > 0 ? fmt(n.double) : "—") + '</td></tr>';
    };
    let lignes = '';
    Object.keys(cp.niveaux).map(Number).sort(function(a, b) { return b - a; }).forEach(function(l) {
      const n = cp.niveaux[l];
      ["total", "zone", "parcours", "double"].forEach(function(k) { tot[k] += n[k]; });
      lignes += ligne(_mlvlActif() ? t("secours.couv.niveauN", { n: l }) : t("secours.couv.plan"), n, n.parcours < 0.5 * n.total ? "kta-tx-warn" : "");
    });
    if (Object.keys(cp.niveaux).length > 1) lignes += ligne('<strong>' + t("secours.couv.total") + '</strong>', tot, "kta-secours-couv-total");
    let html = '<table class="kta-secours-couv-table"><thead><tr>' +
                 '<th>' + t("secours.couv.colNiveau") + '</th><th>' + t("secours.couv.colGaleries") + '</th>' +
                 '<th>' + t("secours.couv.colZone") + '</th><th>' + t("secours.couv.colParcours") + '</th>' +
                 '<th>' + t("secours.couv.colDouble") + '</th></tr></thead><tbody>' + lignes + '</tbody></table>';
    if (cp.sansIti.length) html += '<p class="kta-tx-warn kta-secours-couv-note">' + _escHtml(t("secours.couv.sansIti", { noms: cp.sansIti.join(", ") })) + '</p>';
    cp.alertes.forEach(function(a) { html += '<p class="kta-tx-warn kta-secours-couv-note">⚠️ ' + _escHtml(a) + '</p>'; });
    html += '<p><button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="couv-surligner">' +
              (_couvCalque ? t("secours.couv.btnMasquer") : t("secours.couv.btnSurligner")) + '</button></p>';
    html += '<p class="kta-secours-couv-titre">' + t("secours.couv.horsParcoursTitre") + '</p>';
    html += c.horsParcours.length
      ? '<ul class="kta-secours-couv-liste">' + c.horsParcours.map(function(h) {
          return '<li><strong>' + _escHtml(h.equipe) + '</strong> (' + h.noms.length + ') : ' +
                 _escHtml(h.noms.slice(0, 12).join(", ")) + (h.noms.length > 12 ? " …" : "") + '</li>';
        }).join('') + '</ul>'
      : '<p class="kta-tx-muted">' + t("secours.couv.aucun") + '</p>';
    html += '<p class="kta-secours-couv-titre">' + t("secours.couv.doublonsTitre") + '</p>';
    html += c.doublons.length
      ? '<ul class="kta-secours-couv-liste">' + c.doublons.map(function(d) {
          return '<li>' + _escHtml(d.nom) + ' — ' + _escHtml(d.equipes.join(", ")) + '</li>';
        }).join('') + '</ul>'
      : '<p class="kta-tx-muted">' + t("secours.couv.aucun") + '</p>';
    html += '<p class="kta-tx-muted kta-secours-couv-note">' + t("secours.couv.note") + '</p>';
    return html;
  }

  // ── Un parcours par phase ───────────────────────────────────────────
  // s.execution.parcoursArchive[phase][gid] = { etapes: [libellés], distanceM, dureeEstimeeMin } (copie
  // légère : ce qu'un chef d'intervention relit dans le rapport).
  function _archivePhaseParcours(s, phaseIdx) {
    if (!s || !s.execution) return;
    const ex = s.execution;
    ex.parcoursArchive = ex.parcoursArchive || {};
    const copie = {};
    (s.groupes || []).forEach(function(g) {
      if (!_getEtapesEquipe(s, g.id).length) return;   // pas engagée dans la phase
      copie[g.id] = {
        etapes: [g.entree].concat(g.intermediaires || [], [g.sortie])
                  .filter(function(w) { return w && typeof w.x === "number"; })
                  .map(function(w) { return w.label || _lblEtape(_fmtPoint(w)); }),
        distanceM: (typeof g.distanceM === "number") ? g.distanceM : null,
        dureeEstimeeMin: (typeof g.dureeEstimeeMin === "number") ? g.dureeEstimeeMin : null
      };
    });
    ex.parcoursArchive[String(phaseIdx)] = copie;
  }
  function _parcoursPhase(s, phaseIdx, gid) {
    const a = s && s.execution && s.execution.parcoursArchive && s.execution.parcoursArchive[String(phaseIdx)];
    return (a && a[gid]) || null;
  }

  // ── Main courante ───────────────────────────────────────────────────
  // Journal horodaté AUTOMATIQUE pour le RETEX (lancement, statuts, victime, départ / rentrée / rappel,
  // remontés, imports, phases, fin) + notes libres. Stocké en { at, cle, p, source? } et traduit À
  // L'AFFICHAGE (langue courante). Voyage dans le rapport d'équipe ; fusion sans doublon.
  const MC_MAX = 2000;
  function _journaliser(s, cle, p, extra) {
    if (!s || !s.execution) return;
    const ex = s.execution;
    ex.mainCourante = Array.isArray(ex.mainCourante) ? ex.mainCourante : [];
    ex.mainCourante.push(Object.assign({ at: _nowIso(), cle: cle, p: p || {} }, extra || {}));
    if (ex.mainCourante.length > MC_MAX) ex.mainCourante.splice(0, ex.mainCourante.length - MC_MAX);
  }
  function _texteMc(e) {
    const p = Object.assign({}, (e && e.p) || {});
    if (p.statut) p.statut = _statutLabel(p.statut);
    const txt = t(e.cle, p);
    return (e.source ? "[" + e.source + "] " : "") + txt;
  }
  function _mcTriee(s) {
    const arr = (s && s.execution && Array.isArray(s.execution.mainCourante)) ? s.execution.mainCourante.slice() : [];
    return arr.sort(function(a, b) { return Date.parse(a.at) - Date.parse(b.at); });
  }
  function _nomEquipe(s, gid) {
    const g = (s && s.groupes || []).find(function(x) { return x.id === gid; });
    return g ? g.nom : "?";
  }
  function _renderMainCourante(s) {
    const liste = _mcTriee(s).reverse();
    return '<details class="kta-secours-section kta-secours-mc"' + (liste.length ? '' : ' open') + '>' +
             '<summary class="kta-secours-section-titre">' + t("secours.mc.titre", { n: liste.length }) + '</summary>' +
             '<div class="kta-secours-section-body">' +
               '<div class="kta-secours-mc-saisie">' +
                 '<textarea id="kta-secours-mc-texte" rows="2" maxlength="1000" placeholder="' + _escAttr(t("secours.mc.placeholder")) + '"></textarea>' +
                 '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="mc-ajouter">' + t("secours.mc.ajouter") + '</button>' +
               '</div>' +
               (liste.length
                 ? '<ol class="kta-secours-mc-liste">' + liste.slice(0, 300).map(function(e) {
                     return '<li class="kta-secours-mc-' + _escAttr(String(e.cle).split(".").pop()) + '"><span class="kta-secours-mc-h">' +
                              _heureCourte(e.at) + '</span> ' + _escHtml(_texteMc(e)) + '</li>';
                   }).join('') + '</ol>'
                 : '<p class="kta-tx-muted">' + t("secours.mc.vide") + '</p>') +
             '</div>' +
           '</details>';
  }

  // Au lancement en mode équipe, le suivi est placé à l'ENTRÉE de l'équipe : automatique si la position
  // n'a jamais été confirmée, sinon on demande (téléporter sans prévenir effacerait une position juste).
  // `teleport` : le saut ne compte pas comme trajet parcouru.
  // 🩸 Une étape validée avec un statut qui SUPPOSE d'y être vaut « Je suis ici » : sans recalage, la
  // position dérive d'étape en étape et le guidage se bâtit dessus. Recalage silencieux sous
  // RECALAGE_SILENCE_M, question au-delà (la position peut être juste et l'étape mal posée). Jamais pour
  // « bloqué » / « demi-tour » (pas arrivé), ni pour l'opérateur qui relaie une équipe depuis la surface.
  const RECALAGE_SILENCE_M = 30;
  const STATUTS_SUR_PLACE = ["ras", "suspect", "indice", "aide", "victime"];
  function _recalerSurEtape(sid, gid, idx, statutId) {
    const s = get(sid);
    if (!s || !s.execution || s.execution.role !== "equipe" || s.execution._previousRole) return;
    if (STATUTS_SUR_PLACE.indexOf(statutId) < 0 || typeof window.recalerTrackerSurPoint !== "function") return;
    const g = (s.groupes || []).find(function(x) { return x.id === gid; });
    const et = _getEtapesEquipe(s, gid)[idx];
    if (!g || !et) return;
    const wps = [g.entree].concat(g.intermediaires || [], [g.sortie]);
    const w = (et.wid && wps.find(function(x) { return x && x.wid === et.wid; })) || wps[idx];
    if (!w || typeof w.x !== "number") return;
    const recaler = function() { window.recalerTrackerSurPoint(w.x, w.y, Number.isInteger(w.level) ? w.level : undefined, { sansReplan: true }); };
    const pos = (typeof window.getTrackingPosition === "function") ? window.getTrackingPosition() : null;
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    const ecartM = (pos && typeof pos.x === "number") ? Math.hypot(pos.x - w.x, pos.y - w.y) / pxParM : 0;
    if (ecartM <= RECALAGE_SILENCE_M || typeof window.ktaConfirm !== "function") { recaler(); return; }
    const fmt = (typeof window.formatDistance === "function") ? window.formatDistance(ecartM, 0) : Math.round(ecartM) + " m";
    window.ktaConfirm(t("secours.recalage.question", { dist: _escHtml(fmt), etape: _escHtml(_nomEtape(et, idx)) }),
      { titre: t("secours.recalage.titre"), okLabel: t("secours.recalage.ok"), cancelLabel: t("secours.recalage.non") })
      .then(function(ok) { if (ok) recaler(); });
  }

  // Placement automatique → rend le texte à glisser dans le message du lancement.
  // Question (position déjà confirmée) → rend null, et le message suit la réponse.
  function _placerAEntree(sid, gid) {
    const s = get(sid);
    const g = s && (s.groupes || []).find(function(x) { return x.id === gid; });
    const e = g && g.entree;
    if (!e || typeof e.x !== "number" || typeof window.recalerTrackerSurPoint !== "function") return null;
    const nom = e.label || _lblEtape(_fmtPoint(e));
    const placer = function() {
      window.recalerTrackerSurPoint(e.x, e.y, Number.isInteger(e.level) ? e.level : undefined, { teleport: true });
      return t("secours.entree.place", { entree: nom });
    };
    const etat = (typeof window.getTrackingPositionEtat === "function") ? window.getTrackingPositionEtat() : null;
    if (!etat || (!etat.confirmee && !etat.suiviActif) || typeof window.ktaConfirm !== "function") return placer();
    window.ktaConfirm(t("secours.entree.proposer", { entree: _escHtml(nom) }),
                      { titre: t("secours.entree.titre"), okLabel: t("secours.entree.ok"), cancelLabel: t("secours.entree.non") })
      .then(function(ok) { if (ok) _toast(placer(), "warn"); });   // warn : visible en « Essentielles »
    return null;
  }

  // Le scénario dont l'intervention tourne sur ce plan. ⚠️ contrat : une seule à la fois (veille des retards,
  // pastille et affichage carte ne suivent que celle-ci) — lancer une autre arrête d'abord celle-ci
  // (_ouvrirLancement demande, rejoindre arrête et le dit). 🩸 Une intervention jamais arrêtée (exercice de la
  // veille) reste active : sans ce contrat, la vraie démarrait à côté et ses retards ne sonnaient pas.
  function _scenarioEnCours() {
    for (let i = 0; i < _scenarios.length; i++) {
      if (_estExecutionActive(_scenarios[i])) return _scenarios[i];
    }
    return null;
  }
  // Intervention en cours sur ce plan AUTRE que `sid`, ou null.
  function _autreEnCours(sid) {
    for (let i = 0; i < _scenarios.length; i++) {
      if (_scenarios[i].id !== sid && _estExecutionActive(_scenarios[i])) return _scenarios[i];
    }
    return null;
  }
  function _lanceLe(s) {
    const d = s && s.execution && Date.parse(s.execution.startedAt);
    return d ? new Date(d).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR",
      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "?";
  }

  // Intervention en cours : pastille dans la barre d'état du mode carte, un toucher rouvre le plan. Retirée
  // dès que plus rien ne tourne.
  function _majFooterSecours(depuisVeille) {
    const barre = document.getElementById("kta-refonte-statusbar-content");
    let pastille = document.getElementById("kta-refonte-stat-secours");
    const s = _scenarioEnCours();
    // La veille des retards tourne tant qu'une intervention est en cours.
    if (typeof setInterval === "function") {   // (harnais Node : pas de minuterie)
      if (s && !_veilleRetardsId) _veilleRetardsId = setInterval(_veilleRetards, 20000);
      if (!s && _veilleRetardsId) { clearInterval(_veilleRetardsId); _veilleRetardsId = null; }
      if (s && !depuisVeille) setTimeout(_veilleRetards, 0);
    }
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
    // La pastille prend la couleur du pire retard (son équipe, ou toutes pour l'opérateur).
    let pire = "ok";
    (eq ? [eq] : (s.groupes || [])).forEach(function(g) {
      if (!_equipeEngagee(s, g)) return;
      const e = _etatRetour(s, g).etat;
      if (RANG_RETOUR[e] < RANG_RETOUR[pire]) pire = e;
    });
    pastille.classList.toggle("kta-secours-footer-pastille--orange", pire === "orange");
    pastille.classList.toggle("kta-secours-footer-pastille--rouge", pire === "rouge" || pire === "manquant");
    pastille.innerHTML = '<span class="kta-refonte-stat-icon">🚑</span><span class="kta-refonte-stat-val">' + _escHtml(texte) + '</span>' +
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

  // Secouriste libre : note en vrac dans _notes_libres, { id, ts, statut, texte, photoIds }.
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

  // Mise à jour d'une note libre par id (liste blanche : statut, texte, photoIds).

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

  // Plan multi-niveau : « + Ajouter une équipe » demande nom + niveau ; mono-niveau : ajout direct, nom
  // automatique.
  // « Auto : 1 équipe par niveau » ne prend que les niveaux qui portent quelque chose (availableLevels vaut
  // -2..+2 par défaut quand le plan n'en déclare pas) ; le 0 = plan principal, toujours gardé. Sans le
  // module de scan : tous les niveaux.
  // Équipes repliables (un parcours avec tous ses POI fait une longue page). État par appareil (confort de
  // lecture, pas une donnée du scénario) : localStorage, try/catch.
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

  // Un niveau qui ne porte rien est marqué « (vide) » dans les listes : choisissable (préparer un niveau pas
  // encore relevé) mais distingué d'un niveau réel. 0 = plan principal.
  function _suffixeNiveauVide(lvl) {
    if (lvl === 0 || typeof window.ktaNiveauxOccupes !== "function") return "";
    return window.ktaNiveauxOccupes().indexOf(lvl) >= 0 ? "" : " " + t("secours.level.vide");
  }

  // ── Ce que le guidage attend du calcul ─────────────────────────────
  // Le pathfinder rend `carrefours` (croisements du trajet) et `raccords` (vol d'oiseau étape → tracé) :
  // gardés sur l'équipe (`g.guidage`) et transmis dans le .mkmsec, le téléphone guide sans recalculer.
  // `n` = nombre de points du tracé, pour reconnaître des données périmées (recalcul au besoin).
  // Toutes les étapes à plus de SEUIL_ETAPE_LOIN_M de la galerie la plus proche sont signalées (pas
  // seulement la pire), numérotées comme sur la carte (E, 1…N, S), d'après les raccords du dernier calcul.
  const SEUIL_ETAPE_LOIN_M = 25;   // 15 m (proposé par l'audit) signalait les POI posés dans une salle, à 16-19 m de l'axe tracé
  function _etapesLoin(raccords) {
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    const arr = Array.isArray(raccords) ? raccords : [];
    return arr.map(function(r, i) {
      const idx = Number.isInteger(r && r.index) ? r.index : i;
      const num = (r && r.role === "depart") ? "E" : (r && r.role === "arrivee") ? "S" : String(idx);
      return { num: num, nom: (r && r.label) ? _lblEtape(r.label) : "", distM: ((r && Number(r.distPx)) || 0) / pxParM };
    }).filter(function(e) { return e.distM >= SEUIL_ETAPE_LOIN_M; });
  }
  function _texteEtapesLoin(liste) {
    if (!liste.length) return "";
    const fmt = function(m) { return (typeof window.formatDistance === "function") ? window.formatDistance(m, 0) : Math.round(m) + " m"; };
    const items = liste.slice(0, 6).map(function(e) {
      return e.num + (e.nom ? " « " + e.nom + " »" : "") + " " + fmt(e.distM);
    }).join(" · ") + (liste.length > 6 ? " …" : "");
    return t("secours.loin.liste", { n: liste.length, liste: items });
  }
  function _donneesGuidage(r) {
    return {
      carrefours: Array.isArray(r && r.carrefours) ? r.carrefours : [],
      raccords:   Array.isArray(r && r.raccords)   ? r.raccords   : [],
      n:          (r && Array.isArray(r.path)) ? r.path.length : 0
    };
  }

  // ── Suivre mon parcours ─────────────────────────────────────────────
  // Le parcours de l'équipe devient l'itinéraire de l'app (type "itinerary" + `secours` : scénario, équipe,
  // évitements) : bandeau de guidage, feuille de route et écran XL marchent tels quels. Étapes faites =
  // waypoints `done` (tenus à jour à chaque mutation) : « Recalculer » repart vers la prochaine étape NON
  // faite, avec les évitements du Secours (interfaceItineraire > _replanifierDepuis).
  function _roadSuiviActive(sid) {
    const roads = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    return roads.find(function(r) { return r && r.type === "itinerary" && r.secours && (!sid || r.secours.scenarioId === sid); }) || null;
  }
  function _etapeFaite(e) { return !!(e && e.completedAt && e.statut && e.statut !== "pending"); }
  function _waypointsSuivi(s, g) {
    const etapes = _getEtapesEquipe(s, g.id);
    return [g.entree].concat(g.intermediaires || [], [g.sortie]).filter(function(w) {
      return w && typeof w.x === "number" && typeof w.y === "number";
    }).map(function(w) {
      const e = w.wid ? etapes.find(function(x) { return x.wid === w.wid; }) : null;
      return { x: w.x, y: w.y, level: w.level, label: w.label || _lblEtape(_fmtPoint(w)),
               source: "secours", wid: w.wid || null, done: _etapeFaite(e) };
    });
  }
  async function _suivreParcours(sid, gid) {
    const s = get(sid);
    const g = s && (s.groupes || []).find(function(x) { return x.id === gid; });
    if (!g) return;
    if (!Array.isArray(g.itineraireSuggere) || g.itineraireSuggere.length < 2) {
      _toast(t("secours.suivre.aucunIti"), "warn");
      return;
    }
    if (typeof window.itineraireActiverRoad !== "function") return;
    const waypoints = _waypointsSuivi(s, g);
    const avoidPoints = _collecterAvoidPointsAutresEquipes(sid, gid);
    let points = g.itineraireSuggere, gd = g.guidage;
    // Données absentes (scénario ancien) ou périmées : on recalcule ici.
    if (!gd || gd.n !== points.length) {
      try {
        const r = await window.Pathfinder.computeRoute(waypoints.map(function(w) { return Object.assign({}, w, { done: false }); }),
          avoidPoints.length ? { avoidPoints: avoidPoints, avoidRadius: 30 } : {});
        if (r && Array.isArray(r.path) && r.path.length >= 2) { points = r.path; gd = _donneesGuidage(r); }
      } catch(e) { console.warn("[SecoursMode] Suivre : recalcul du guidage échoué :", e); }
    }
    const road = {
      type: "itinerary", points: points, waypoints: waypoints,
      raccords: (gd && gd.raccords) || [], carrefours: (gd && gd.carrefours) || [],
      secours: { scenarioId: sid, equipeId: gid, avoidPoints: avoidPoints, avoidRadius: 30 }
    };
    // Parcours de balayage : le guidage le garde (un écart le fait rejoindre plus loin).
    if (_estBalayage(g)) {
      road.secours.balayage = points.map(function(p) { return { x: p.x, y: p.y, level: p.level }; });
      road.secours.balayageIdx = 0;
    }
    window.itineraireActiverRoad(road, { confirmer: true, onDone: function() {
      fermer();   // la carte, le bandeau de guidage — la zone reste affichée
      _toast(t("secours.suivre.lance"), "info");
      const actif = (typeof window.getTrackingActif === "function") && window.getTrackingActif();
      if (!actif) setTimeout(function() { _toast(t("secours.suivre.trackerOff"), "warn"); }, 2500);
      // Des étapes déjà faites : on repart d'ici vers la prochaine.
      if (actif && waypoints.some(function(w) { return w.done; }) && typeof window.itineraireReplanifierDepuis === "function") {
        const pos = window.getTrackingPosition && window.getTrackingPosition();
        if (pos) window.itineraireReplanifierDepuis(pos.x, pos.y);
      }
      _armerVeilleArrivee();
    } });
  }
  // Étapes validées ↔ waypoints `done` de l'itinéraire suivi (appelé à chaque mutation).
  function _majRoadSuivi(s) {
    const road = s && _roadSuiviActive(s.id);
    if (!road || !Array.isArray(road.waypoints)) return;
    const etapes = _getEtapesEquipe(s, road.secours.equipeId);
    let change = false;
    road.waypoints.forEach(function(w) {
      if (!w.wid) return;
      const d = _etapeFaite(etapes.find(function(x) { return x.wid === w.wid; }));
      if (!!w.done !== d) { w.done = d; change = true; }
    });
    if (change && typeof window.setRoads === "function") window.setRoads(window.getRoads());
  }
  // Progression sur un parcours de BALAYAGE : point du circuit atteint (à 15 m près, dans les 400 m qui
  // suivent ; à égalité le plus tôt — un cul-de-sac repasse par les mêmes points à l'aller et au retour).
  // Sert au recalcul après un écart, qui repart d'ici (interfaceItineraire > _replanifierDepuis).
  function _avancerBalayage(road, pos) {
    const sec = road && road.secours;
    if (!sec || !Array.isArray(sec.balayage) || sec.balayage.length < 2) return;
    const B = sec.balayage;
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    const i0 = Number.isInteger(sec.balayageIdx) ? sec.balayageIdx : 0;
    let cumul = 0, best = -1, bd = 15 * pxParM;
    for (let i = i0; i < B.length && cumul <= 400 * pxParM; i++) {
      if (i > i0) cumul += Math.hypot(B[i].x - B[i - 1].x, B[i].y - B[i - 1].y);
      const d = Math.hypot(B[i].x - pos.x, B[i].y - pos.y);
      if (d < bd - 2 * pxParM || (best < 0 && d <= bd)) { bd = d; best = i; }
    }
    if (best > i0) sec.balayageIdx = best;
  }
  // Arrivée sur la prochaine étape : un toast, et la vue live s'ouvrira dessus.
  let _veilleArriveeId = null;
  const _arriveesNotifiees = {};
  function _armerVeilleArrivee() {
    if (_veilleArriveeId || typeof setInterval !== "function") return;
    _veilleArriveeId = setInterval(_veilleArrivee, 3000);
  }
  function _veilleArrivee() {
    const road = _roadSuiviActive();
    if (!road) { clearInterval(_veilleArriveeId); _veilleArriveeId = null; return; }
    if (!(typeof window.getTrackingActif === "function" && window.getTrackingActif())) return;
    const pos = window.getTrackingPosition && window.getTrackingPosition();
    const s = get(road.secours.scenarioId);
    if (pos) _avancerBalayage(road, pos);
    if (!pos || !s || !_estExecutionActive(s)) return;
    const prochain = (road.waypoints || []).find(function(w) { return w.source === "secours" && !w.done; });
    if (!prochain || !prochain.wid || _arriveesNotifiees[prochain.wid]) return;
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    if (Math.hypot(pos.x - prochain.x, pos.y - prochain.y) > 12 * pxParM) return;
    _arriveesNotifiees[prochain.wid] = true;
    const etapes = _getEtapesEquipe(s, road.secours.equipeId);
    const idx = etapes.findIndex(function(e) { return e.wid === prochain.wid; });
    if (idx >= 0 && s.execution.currentEquipeId === road.secours.equipeId) {
      _liveEquipeFocusIdx = idx;
      _liveEquipeFreshSession = false;
    }
    _toast(t("secours.suivre.arrivee", { etape: prochain.label || "?" }), "info");
    if (window.kta_vibrate) window.kta_vibrate([120, 80, 120]);
  }

  // Feuille de route d'une équipe, en texte, pour le PDF. null sans itinéraire calculé (le PDF le dit), []
  // si le moteur de guidage manque. Données de guidage périmées ou absentes → null plutôt qu'une feuille
  // fausse (consignes sans carrefours).
  function _feuilleDeRouteLignes(s, g) {
    if (!g || !Array.isArray(g.itineraireSuggere) || g.itineraireSuggere.length < 2) return null;
    if (!g.guidage || g.guidage.n !== g.itineraireSuggere.length) return null;
    const G = window.ItiGuidage;
    if (!G || typeof G.construire !== "function") return [];
    const road = { type: "itinerary", points: g.itineraireSuggere, waypoints: _waypointsSuivi(s, g),
                   raccords: g.guidage.raccords || [], carrefours: g.guidage.carrefours || [] };
    let guide = null;
    try { guide = G.construire(road); } catch(e) { console.warn("[SecoursMode] feuille de route :", e); }
    if (!guide) return [];
    const e = guide.echelle || 1;
    const fmt = function(m) { return (typeof window.formatDistance === "function") ? window.formatDistance(m, 0) : Math.round(m) + " m"; };
    const lignes = [];
    if (guide.depart) lignes.push(t("guid.feuille.rejoindre", { dist: fmt(guide.depart.distPx / e) }));
    let sPrec = 0;
    (guide.consignes || []).forEach(function(c) {
      const apres = (c.s - sPrec) / e;
      sPrec = c.s;
      const txt = G.texteAction(c);
      lignes.push(apres >= 1 ? t("guid.feuille.apres", { dist: fmt(apres), action: txt }) : G.majuscule(txt));
    });
    return lignes;
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

  // Options brancard de « Évacuer » : les types de zones du plan (session + embarquées) sont proposés, eau et
  // remblais cochés d'office. Les zones inaccessibles restent infranchissables sauf case cochée (dernier
  // recours, décochée). ⚠️ Évitements SOUPLES : sans chemin qui les respecte, le moteur les traverse et la
  // fenêtre de la sortie le dit. Rappel : onChoix({ avoidZones, respecterInaccessibles }).
  const BRANCARD_COCHES = ["eau", "remblais"];
  // « POI de la zone » : types (tags) à exclure des étapes, avec leur nombre. Un POI reste s'il a au moins un
  // type gardé ; sans type = « Sans type ». Choix gardé dans le scénario (s.tagsExclusPoiZone) pour toutes
  // les équipes. Un seul type présent : pas de question.
  function _demanderTagsPoiZone(s, candidats, onChoix) {
    const cleDe = function(c) { return (c.tags && c.tags.length) ? c.tags.map(function(x) { return String(x || "").trim().toLowerCase(); }) : [""]; };
    const compte = {};
    candidats.forEach(function(c) { cleDe(c).forEach(function(k) { compte[k] = (compte[k] || 0) + 1; }); });
    const tags = Object.keys(compte).sort(function(a, b) { return compte[b] - compte[a]; });
    const exclus = Array.isArray(s.tagsExclusPoiZone) ? s.tagsExclusPoiZone : [];
    const filtrer = function(ex) {
      return candidats.filter(function(c) { return cleDe(c).some(function(k) { return ex.indexOf(k) < 0; }); });
    };
    if (tags.length < 2) { onChoix(filtrer(exclus)); return; }
    const libelle = function(k) {
      if (!k) return t("secours.poiZone.sansType");
      return (window.I18n && window.I18n.has && window.I18n.has("editor.tag." + k)) ? t("editor.tag." + k) : k;
    };
    const old = document.getElementById("kta-secours-tags-modal");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const overlay = document.createElement("div");
    overlay.id = "kta-secours-tags-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-newequipe-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _escHtml(t("secours.poiZone.titre")) + '</span>' +
          '<button class="kta-panneau-close" data-action="cancel" type="button">&times;</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<div class="kta-secours-form-hint">' + _escHtml(t("secours.poiZone.intro", { n: candidats.length })) + '</div>' +
          tags.map(function(k) {
            return '<label class="kta-secours-brancard-ligne"><input type="checkbox" data-tag="' + _escAttr(k) + '"' +
              (exclus.indexOf(k) < 0 ? " checked" : "") + '> ' + _escHtml(libelle(k)) +
              ' <span class="kta-tx-muted">(' + compte[k] + ')</span></label>';
          }).join("") +
          '<div class="kta-secours-form-actions">' +
            '<button class="kta-btn kta-btn-ghost" data-action="cancel">' + _escHtml(t("secours.btn.annuler")) + '</button>' +
            '<button class="kta-btn kta-btn-primary" data-action="confirm">' + _escHtml(t("secours.poiZone.ajouter")) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    function _close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    overlay.querySelectorAll('[data-action="cancel"]').forEach(function(b) { b.addEventListener("click", _close); });
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", function() {
      const ex = [].slice.call(overlay.querySelectorAll("input[data-tag]")).filter(function(i) { return !i.checked; })
        .map(function(i) { return i.getAttribute("data-tag"); });
      _close();
      updateScenario(s.id, { tagsExclusPoiZone: ex });
      onChoix(filtrer(ex));
    });
  }

  function _demanderOptionsBrancard(onChoix) {
    const types = typeof window.getAvoidableZoneTypes === "function" ? (window.getAvoidableZoneTypes() || []) : [];
    const nbInacc = [].concat(typeof window.getZones === "function" ? (window.getZones() || []) : [],
                              Array.isArray(window._ktaDataPolygons) ? window._ktaDataPolygons : [])
      .filter(function(z) { return z && z.type === "inaccessible"; }).length;
    const old = document.getElementById("kta-secours-brancard-modal");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const overlay = document.createElement("div");
    overlay.id = "kta-secours-brancard-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001";
    const lignes = types.map(function(z) {
      return '<label class="kta-secours-brancard-ligne"><input type="checkbox" data-ztype="' + _escAttr(z.type) + '"' +
        (BRANCARD_COCHES.indexOf(z.type) >= 0 ? " checked" : "") + '> ' +
        _escHtml(t("secours.brancard.eviter", { label: z.label || z.type, n: z.count })) + '</label>';
    }).join("");
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-secours-newequipe-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _escHtml(t("secours.brancard.titre")) + '</span>' +
          '<button class="kta-panneau-close" data-action="cancel" type="button">&times;</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<div class="kta-secours-form-hint">' + _escHtml(t("secours.brancard.intro")) + '</div>' +
          (lignes || '<div class="kta-secours-form-hint kta-tx-muted">' + _escHtml(t("secours.brancard.aucuneZone")) + '</div>') +
          (nbInacc ? '<label class="kta-secours-brancard-ligne kta-tx-warn"><input type="checkbox" data-inacc="1"> ' +
            _escHtml(t("secours.brancard.inacc", { n: nbInacc })) + '</label>' : '') +
          '<div class="kta-secours-form-actions">' +
            '<button class="kta-btn kta-btn-ghost" data-action="cancel">' + _escHtml(t("secours.btn.annuler")) + '</button>' +
            '<button class="kta-btn kta-btn-primary" data-action="confirm">' + _escHtml(t("secours.brancard.calculer")) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    function _close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    overlay.querySelectorAll('[data-action="cancel"]').forEach(function(b) { b.addEventListener("click", _close); });
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", function() {
      const zones = [].slice.call(overlay.querySelectorAll("input[data-ztype]:checked"))
        .map(function(i) { return i.getAttribute("data-ztype"); });
      const inacc = overlay.querySelector("input[data-inacc]");
      _close();
      onChoix({ avoidZones: zones, respecterInaccessibles: !(inacc && inacc.checked) });
    });
  }

  // Depuis la recherche unifiée (bouton d'un résultat point) : assigner le POI à une équipe + un rôle en
  // deux sélections, sans perdre le focus de la recherche.
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
    const existing = document.getElementById("kta-secours-assign-modal");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const nomPoint = point.nom || point.id || ("x=" + Math.round(point.x) + " y=" + Math.round(point.y));
    const overlay = document.createElement("div");
    overlay.id = "kta-secours-assign-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100002";   // au-dessus de la modale Recherche (99999)

    // Options équipes, préfixées d'un emoji de couleur.
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
          '<div class="kta-secours-form-actions">' +
            '<button class="kta-btn kta-btn-ghost" data-action="cancel">' + t("secours.btn.annuler") + '</button>' +
            '<button class="kta-btn kta-btn-primary" data-action="confirm">' + t("secours.btn.assigner") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    // 🩸 Rôle par défaut selon l'équipe choisie : « Entrée » seulement si elle n'en a pas encore. Coché
    // d'office, un oubli écraserait l'entrée de l'équipe sans rien dire.
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
          pointUid: point.uid || null,
          label:   point.nom || point.id || null
        };
        // idx = null : ignoré pour entrée/sortie (un seul emplacement), ajout en fin pour un intermédiaire
        // (cf _appliquerWaypoint).
        _appliquerWaypoint(equipeId, role, null, wp);
        const equipe = s.groupes.find(function(g) { return g.id === equipeId; });
        const equipeNom = equipe ? equipe.nom : equipeId;
        const roleLbl = role === "entree" ? t("secours.roleShort.entree")
                      : role === "sortie" ? t("secours.roleShort.sortie")
                      : t("secours.roleShort.intermediaire");
        _toast(t("secours.toast.pointAssigne", { point: nomPoint, equipe: equipeNom, role: roleLbl }), "info");
        _close();
        // Re-rendu de l'édition si la modale est visible (sinon on est sur l'overlay carte : rien à faire).
        if (_modal && _modal.style.display !== "none" && _currentScenarioId) {
          _switchView("edit");
        }
      });
    });
    setTimeout(function() {
      const sel = document.getElementById("kta-sec-assign-equipe");
      if (sel) sel.focus();
    }, 50);
  }

  // Depuis le Mode Perdu (« Lancer un plan de secours ») : scénario pré-rempli — nom « Recherche - <date> »,
  // incidentAt = maintenant − elapsedMinutes, lastKnownPoint (avec libellé si POI), zoneIncertitude (cercle),
  // notes (vitesse + indices saisis). Ouvre ensuite l'édition pour ajouter les équipes.
  function creerDepuisLostMode(lostState) {
    if (!lostState || !lostState.lastKnownPos) {
      _toast(t("secours.toast.aucunePositionLost"), "warn");
      return null;
    }
    const now = new Date();
    const nomAuto = t("secours.lost.nomAuto", {
      date: now.toLocaleDateString(window.ktaLocale ? window.ktaLocale() : "fr-FR"),
      heure: now.toLocaleTimeString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { hour: "2-digit", minute: "2-digit" })
    });
    const elapsed = (typeof lostState.elapsedMinutes === "number") ? lostState.elapsedMinutes : 0;
    const incidentTs = Date.now() - elapsed * 60 * 1000;
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
    const scenario = createScenario(nomAuto);
    updateScenario(scenario.id, {
      context: {
        incidentAt: new Date(incidentTs).toISOString(),
        lastKnownPoint: {
          x:     lostState.lastKnownPos.x,
          y:     lostState.lastKnownPos.y,
          // Niveau du point lui-même, à défaut celui affiché.
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
    ouvrir(scenario.id);
    return scenario;
  }

  // ── Export / import d'un scénario autonome (.mkmsec.json) ──────────
  // Transmettre un plan de secours à un autre appareil sans exporter toute la session (opérateur de surface,
  // téléphones des équipes). Contenu : métadonnées (type, version, exportedAt, appVersion), plan minimal (id,
  // nom, version, dimensions, multi-niveau) pour vérifier qu'il correspond au plan ouvert, scénario complet.

  const MKMSEC_FORMAT_VERSION = 1;

  function exporterScenario(scenarioId) {
    const s = get(scenarioId || _currentScenarioId);
    if (!s) {
      _toast(t("secours.toast.scenarioIntrouvable"), "error");
      return null;
    }
    // 🩸 Identités des points posées AVANT le départ vers les équipes : sinon PC et téléphones en tireraient
    // chacun de différentes.
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
      // Copie profonde (pas de référence partagée).
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

  // Parse + validation SEULE : ne touche pas à _scenarios, pour que `_ouvrirImportMkmsecPicker` montre un
  // aperçu AVANT l'injection (pas de confirm() natif). Retourne { ok, payload?, warning?, error? }.
  // 🩸 Autre plan ? Le même plan n'a pas le même id selon qu'il est importé (« local_… ») ou servi
  // (« server_… ») : autre plan = ids différents ET (nom ou dimensions différents). Un plan REGÉNÉRÉ (autre
  // version, autres dimensions) est signalé aussi : positions d'étapes, zones et empreintes de tracés
  // peuvent ne plus tomber au bon endroit. Retourne un avertissement ou null.
  function _autrePlan(planFichier) {
    const f = planFichier || {};
    const idCourant = window._currentLoadedPlanId;
    if (!f.id || !idCourant || f.id === idCourant) return false;
    const pl = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) || {};
    const nom = function(x) { return String(x || "").trim().toLowerCase(); };
    const memeNom = !!nom(f.name) && nom(f.name) === nom(pl.name);
    const memesDims = Number(f.imageWidth) > 0 && Number(f.imageWidth) === Number(pl.imageWidth) &&
                      Number(f.imageHeight) === Number(pl.imageHeight);
    return !(memeNom && memesDims);
  }
  function _ecartVersionPlan(planFichier) {
    const pl = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) || {};
    const f = planFichier || {};
    if (_autrePlan(f)) return null;   // autre plan : déjà signalé ailleurs
    const verF = String(f.version || ""), verC = String(pl.version || "");
    const dimsDiff = (Number(f.imageWidth) > 0 && Number(pl.imageWidth) > 0 && Number(f.imageWidth) !== Number(pl.imageWidth))
                  || (Number(f.imageHeight) > 0 && Number(pl.imageHeight) > 0 && Number(f.imageHeight) !== Number(pl.imageHeight));
    if (!(verF && verC && verF !== verC) && !dimsDiff) return null;
    return t("secours.import.warnVersionPlan", {
      avant: verF || (f.imageWidth + "×" + f.imageHeight),
      maintenant: verC || (pl.imageWidth + "×" + pl.imageHeight)
    });
  }
  // 🩸 Un plan regénéré SANS changer de version perd les tracés de zone (empreintes de géométrie) sans un
  // mot : on compte les clés de zone que le plan chargé ne résout plus. Autre plan → rien (signalé ailleurs).
  function _blocTracesIntrouvables(planFichier, groupes) {
    const f = planFichier || {};
    if (_autrePlan(f)) return "";
    const connues = {};
    _tousLesTraces().forEach(function(r) { if (r.id) connues[r.id] = true; connues[_cleTrace(r)] = true; });
    let n = 0;
    (groupes || []).forEach(function(g) {
      if (!g || g.zoneType !== "roads" || !Array.isArray(g.zoneRoadIds)) return;
      g.zoneRoadIds.forEach(function(k) { if (!connues[k]) n++; });
    });
    return n ? '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.10); border:1px solid rgba(255,140,0,0.55); border-radius:6px;' +
               ' padding:10px 12px; margin:14px 0; color:var(--kta-avert); font-size:13px; line-height:1.5;">⚠️ ' +
               _escHtml(t("secours.import.warnTracesIntrouvables", { n: n })) + '</div>'
             : "";
  }
  function _blocEcartVersion(planFichier) {
    const w = _ecartVersionPlan(planFichier);
    return w ? '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.10); border:1px solid rgba(255,140,0,0.55); border-radius:6px;' +
               ' padding:10px 12px; margin:14px 0; color:var(--kta-avert); font-size:13px; line-height:1.5;">⚠️ ' + _escHtml(w) + '</div>'
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

    // Autre plan = avertissement, pas erreur : la modale d'aperçu décide.
    let warning = null;
    if (_autrePlan(payload.plan)) {
      const importedPlanName = (payload.plan && payload.plan.name) || t("secours.import.planInconnu");
      warning = t("secours.import.warnPlanDifferent", { plan: importedPlanName });
    }

    return { ok: true, payload: payload, warning: warning };
  }

  // Injection depuis un payload déjà validé (après confirmation dans l'aperçu) : filtre défensif, push,
  // commit. Retourne { ok, scenario } (pas d'erreur possible ici).
  // 🩸 LES IDS D'ORIGINE SONT GARDÉS : le rapport d'un téléphone n'est accepté que si scénario + équipe sont
  // identiques (`_parsePayloadReport`). Régénérés, aucun rapport ne pourrait être consolidé.
  // `mode` ne compte que si le scénario est DÉJÀ sur l'appareil :
  //   "remplacer" → même place, mêmes ids (plan mis à jour, rapports acceptés) ;
  //   "copie" (défaut) → nouveaux ids, non destructif.
  // Relais en direct (installation reliée) : le scénario reçu ne doit pas effacer l'intervention en cours
  // ici. Fusion :
  //   • champs de l'APPAREIL (rôle, équipe suivie…) : jamais repris de l'autre ;
  //   • étapes : par équipe et par étape (wid, sinon idx), la modification la plus récente (majAt) gagne ;
  //     sans horodatage, le statut le plus grave ;
  //   • main courante et notes libres : union sans doublon ;
  //   • le reste (phase, pause, fin) : la version reçue, la plus récente.
  // Sans exécution ici, rien n'est créé (l'appareil choisit lui-même de rejoindre l'intervention).
  const _CHAMPS_APPAREIL = ["role", "currentEquipeId", "_previousRole", "_previousEquipeId",
    "_phaseReadyToastShownForIdx", "rapportExporteAt"];
  function _fusionnerEtape(a, b) {
    if (!a) return b; if (!b) return a;
    const ta = Date.parse(a.majAt || "") || 0, tb = Date.parse(b.majAt || "") || 0;
    if (ta !== tb) return tb > ta ? b : a;
    const ga = _getStatutInfo(a.statut).severity || 0, gb = _getStatutInfo(b.statut).severity || 0;
    return gb > ga ? b : a;
  }
  function _fusionnerEtapesEquipe(loc, rec) {
    if (!Array.isArray(rec)) return loc;
    if (!Array.isArray(loc)) return rec;
    return rec.map(function(e, i) {
      const l = (e && e.wid) ? loc.find(function(x) { return x && x.wid === e.wid; }) : loc[i];
      return _fusionnerEtape(l || null, e);
    });
  }
  function _unionPar(cle, a, b) {
    const vus = {}, out = [];
    (Array.isArray(a) ? a : []).concat(Array.isArray(b) ? b : []).forEach(function(x) {
      const k = cle(x);
      if (!vus[k]) { vus[k] = true; out.push(x); }
    });
    return out;
  }
  function _fusionnerExecutionDirect(locale, recue) {
    if (!locale) return null;
    if (!recue || typeof recue !== "object") return locale;
    const out = JSON.parse(JSON.stringify(recue));
    _CHAMPS_APPAREIL.forEach(function(k) { if (k in locale) out[k] = locale[k]; else delete out[k]; });
    const et = {}, le = locale.etapes || {}, re = recue.etapes || {};
    Object.keys(le).concat(Object.keys(re)).forEach(function(gid) {
      if (gid in et) return;
      if (gid === "_notes_libres") {
        et[gid] = _unionPar(function(n) { return (n && n.id) || JSON.stringify(n); }, le[gid], re[gid]);
      } else {
        et[gid] = _fusionnerEtapesEquipe(le[gid], re[gid]);
      }
    });
    out.etapes = et;
    out.mainCourante = _unionPar(function(m) { return JSON.stringify([m && m.at, m && m.cle, m && m.p]); },
      locale.mainCourante, recue.mainCourante)
      .sort(function(x, y) { return String(x.at).localeCompare(String(y.at)); }).slice(-MC_MAX);
    return out;
  }

  function _appliquerPayloadImport(payload, mode, opts) {
    _assurerCharge();
    const garderExecution = !!(opts && opts.garderExecution);
    const sc = payload.scenario;
    const idxExistant = (typeof sc.id === "string" && sc.id)
      ? _scenarios.findIndex(function(s) { return s.id === sc.id; })
      : -1;
    const remplacer = idxExistant >= 0 && mode === "remplacer";
    const regenerer = !(typeof sc.id === "string" && sc.id) || (idxExistant >= 0 && !remplacer);
    if (regenerer) sc.id = _genId("secours");
    sc.updatedAt = _nowIso();
    // phase.groupeIds[] suivent les g.id. Un id d'équipe n'est régénéré que pour une copie, ou s'il est
    // absent / en double.
    const idMap = Object.create(null);   // oldId → newId (sans prototype)
    const vus = {};
    if (Array.isArray(sc.groupes)) {
      sc.groupes.forEach(function(g) {
        const oldId = g.id;
        const valide = typeof oldId === "string" && oldId && !vus[oldId];
        if (regenerer || !valide) g.id = _genId("G");
        vus[g.id] = true;
        // 🩸 Un id en DOUBLE ne doit pas écraser la 1re entrée : la phase suivrait l'équipe régénérée et la 1re
        // sortirait de sa phase.
        if (typeof oldId === "string" && !(oldId in idMap)) idMap[oldId] = g.id;
      });
    }
    let importedPhases = null;
    if (Array.isArray(sc.phases) && sc.phases.length > 0) {
      importedPhases = sc.phases.map(function(p, i) {
        const mapped = (Array.isArray(p.groupeIds) ? p.groupeIds : [])
          .map(function(oldGid) { return idMap[oldGid] || oldGid; })
          .filter(function(id) {
            // Seulement les ids d'une équipe importée.
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
      tagsExclusPoiZone: Array.isArray(sc.tagsExclusPoiZone)
        ? sc.tagsExclusPoiZone.filter(function(x) { return typeof x === "string"; }).map(function(x) { return x.slice(0, 60); }).slice(0, 100)
        : [],
      reglagesDuree: (sc.reglagesDuree && typeof sc.reglagesDuree === "object") ? {
        vitesseKmh: Math.max(0.2, Math.min(8, Number(sc.reglagesDuree.vitesseKmh) || DUREE_DEFAUT.vitesseKmh)),
        vitesseApprocheKmh: Math.max(0.2, Math.min(8, Number(sc.reglagesDuree.vitesseApprocheKmh) || DUREE_DEFAUT.vitesseApprocheKmh)),
        pauseMin:   Math.max(0, Math.min(120, Number(sc.reglagesDuree.pauseMin) || 0)),
        margeRetardMin: Math.max(0, Math.min(240, Number.isFinite(Number(sc.reglagesDuree.margeRetardMin))
                          ? Number(sc.reglagesDuree.margeRetardMin) : DUREE_DEFAUT.margeRetardMin))
      } : undefined   // mêmes bornes que updateScenario
      // phases ajouté juste après s'il existe (sinon la migration le crée).
    };
    if (importedPhases) cleanScenario.phases = importedPhases;
    _migrerDurees(cleanScenario);   // .mkmsec sans reglagesDuree → durées recalculées
    // Migration après push : un payload sans phases[] reçoit sa phase implicite (idempotent sinon).
    _migrateScenarioV1ToPhases(cleanScenario);
    // Remplacer = même place dans la liste ; l'exécution locale éventuelle part avec l'ancienne version
    // (l'aperçu l'a annoncé).
    if (remplacer && garderExecution && _scenarios[idxExistant].execution) {
      // Relais en direct : l'exécution en cours est fusionnée, ses photos restent.
      cleanScenario.execution = _fusionnerExecutionDirect(_scenarios[idxExistant].execution, sc.execution);
      _scenarios[idxExistant] = cleanScenario;
    } else if (remplacer) {
      // 🩸 Les photos de l'exécution effacée partent avec elle : gardées sous les mêmes ids, elles
      // reviendraient dans le rapport suivant et compteraient dans le quota de 5 par étape.
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

  // Import programmatique (window.SecoursMode.importerScenario, File ou chaîne JSON) : parse + injection sans
  // aperçu interactif (l'interface passe par _ouvrirImportMkmsecPicker).
  // ⚠️ Plan différent : confirmation (ktaConfirm). `opts.mode` ("remplacer" | "copie") : cf
  // `_appliquerPayloadImport` — sans lui, un scénario déjà présent est importé en copie (jamais d'écrasement
  // implicite). `opts.garderExecution` (avec "remplacer") : l'intervention en cours ici est FUSIONNÉE avec
  // celle reçue au lieu d'être effacée (relais en direct).
  // Retourne { ok, scenario?, remplace?, warning?, error? }
  async function importerScenario(input, opts) {
    const parsed = await _parsePayloadMkmsec(input);
    if (!parsed.ok) return parsed;
    if (parsed.warning) {
      const currentPlanName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || t("secours.import.planCourant");
      const importedPlanName = (parsed.payload.plan && parsed.payload.plan.name) || t("secours.import.planInconnu");
      // 🔒 ktaConfirm rend du HTML : les noms viennent du fichier, donc échappés.
      const confirmMsg = t("secours.import.confirmPlanDifferent", {
        planSource: _escHtml(importedPlanName),
        planCourant: _escHtml(currentPlanName)
      });
      const ok = await window.ktaConfirm(confirmMsg);
      if (!ok) {
        return { ok: false, error: t("secours.import.errAnnuleUser") };
      }
    }
    const applied = _appliquerPayloadImport(parsed.payload, opts && opts.mode,
      { garderExecution: !!(opts && opts.garderExecution) });
    return { ok: true, scenario: applied.scenario, remplace: applied.remplace, warning: parsed.warning };
  }

  // Import .mkmsec.json depuis la vue Liste : <input type="file"> volatile, parse, aperçu, puis résultat
  // (succès avec avertissement éventuel ou erreur détaillée) et rafraîchissement de la liste.
  function _ouvrirImportMkmsecPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.mkmsec,.mkmsec.json,application/json";
    input.style.display = "none";
    input.addEventListener("change", async function() {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      // Parse seul, AVANT injection.
      let parsed;
      try {
        parsed = await _parsePayloadMkmsec(file);
      } catch(e) {
        console.warn("[SecoursMode] _ouvrirImportMkmsecPicker exception :", e);
        parsed = { ok: false, error: t("secours.import.errException", { message: (e && e.message ? e.message : String(e)) }) };
      }
      if (!parsed.ok) {
        _afficherResultatImport({ ok: false, error: parsed.error }, file.name);
        return;
      }
      _afficherPreviewImport(parsed.payload, parsed.warning, file.name, function(confirmer, mode) {
        if (!confirmer) return;  // user a annulé
        const applied = _appliquerPayloadImport(parsed.payload, mode);
        _afficherResultatImport({
          ok:       true,
          scenario: applied.scenario,
          remplace: applied.remplace,
          warning:  parsed.warning
        }, file.name);
        _switchView("list");
      });
    });
    document.body.appendChild(input);
    input.click();
  }

  // Aperçu AVANT injection d'un .mkmsec.json (modale charte, pas de confirm() natif) : nom, date d'export,
  // version, plan source, équipes (niveau, membres, zone ?), bandeau orange si autre plan, Annuler / Importer.
  // Args : payload (validé par _parsePayloadMkmsec), warning (string|null), sourceFilename, onDone(confirmer).
  function _afficherPreviewImport(payload, warning, sourceFilename, onDone) {
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
    boite.style.borderLeft = "6px solid var(--kta-interaction)";

    const sc = payload.scenario || {};
    const planSrc = payload.plan || {};
    const dateExport = payload.exportedAt
                       ? new Date(payload.exportedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR")
                       : t("secours.import.dateInconnue");
    const appVer = payload.appVersion || t("secours.import.versionInconnue");

    // Résumé des équipes (8 au plus, puis « +N autres »).
    const groupes = Array.isArray(sc.groupes) ? sc.groupes : [];
    let equipesHtml = "";
    if (groupes.length === 0) {
      equipesHtml = '<p style="color:var(--kta-texte-3); font-style:italic; margin:8px 0 0;">' + t("secours.import.aucuneEquipe") + '</p>';
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
        equipesHtml += '<li style="color:var(--kta-texte-3); font-style:italic;">' + t("secours.import.autres", { n: (groupes.length - 8) }) + '</li>';
      }
      equipesHtml += '</ul>';
    }

    let warningBlock = "";
    if (warning) {
      const currentPlanName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || t("secours.import.planCourant");
      const importedPlanName = planSrc.name || t("secours.import.planInconnu");
      warningBlock = '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.12); border:1px solid rgba(255,140,0,0.55); border-radius:6px; padding:10px 12px; margin:14px 0; color:var(--kta-avert);">' +
                       '⚠️ <strong>' + t("secours.import.warnTitre") + '</strong><br>' +
                       '<span style="font-size:13px; line-height:1.5;">' +
                         t("secours.import.warnBody", { planSource: _escHtml(importedPlanName), planCourant: _escHtml(currentPlanName) }) +
                       '</span>' +
                     '</div>';
    }

    // 🩸 Scénario déjà sur l'appareil (même id) : choix « Remplacer » (garde le lien avec les rapports des
    // équipes) ou « Copie ».
    const existant = (typeof sc.id === "string" && sc.id) ? get(sc.id) : null;
    let existeBlock = "";
    if (existant) {
      // Des saisies d'intervention (en cours OU terminée) existent ici : « Remplacer » les efface.
      const enCours = !!existant.execution;
      existeBlock = '<div style="background:rgba(140,180,255,0.10); border:1px solid rgba(140,180,255,0.45);' +
                    ' border-radius:6px; padding:10px 12px; margin:14px 0; color:var(--kta-texte-2); font-size:13px; line-height:1.5;">' +
                      '<strong class="kta-tx-info" style="color:var(--kta-interaction);">' + t("secours.import.existeTitre") + '</strong><br>' +
                      t("secours.import.existeBody", { nom: _escHtml(existant.nom || t("secours.import.sansNom")) }) +
                      (enCours ? '<br><span class="kta-tx-warn" style="color:var(--kta-avert);">⚠️ ' + t("secours.import.existeExecution") +
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
                    '<h2 class="kta-tx-info" style="margin:0; color:var(--kta-interaction);">' + t("secours.import.previewTitre") + '</h2>' +
                    '<button class="kta-readme-modal-close" data-action="cancel-preview" aria-label="' + _escAttr(t("secours.btn.annulerAria")) + '">✕</button>' +
                  '</div>' +
                  '<div class="kta-readme-modal-corps">' +

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
                      '<h3 style="margin:14px 0 6px 0; color:var(--kta-accent-texte);">' + t("secours.import.equipesIncluses", { n: groupes.length }) + '</h3>' +
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

  // Format court d'un niveau (0 → « RDC » traduit, >0 → « +N », <0 → « -N »), suivi de la profondeur si
  // elle est renseignée : « -2 · -35 m » dit combien de corde, quelle équipe, quelle durée d'évacuation.
  // ⚠️ Source unique du relevé texte (`secours.txt.niveau`), du PDF et des cartes de scénario : ne pas le
  // dupliquer, une des copies dériverait. Rien si la profondeur manque (une fiche de secours ne devine pas).
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

  // Résultat d'import : succès en vert (+ « Ouvrir le scénario » → édition), échec en rouge avec l'erreur
  // détaillée, avertissement (autre plan) en bandeau orange.
  function _afficherResultatImport(result, sourceFilename) {
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
    boite.style.borderLeft = ok ? "6px solid var(--kta-ok)" : "6px solid var(--kta-erreur)";

    let inner = '<div class="kta-readme-modal-header">' +
                  '<h2 class="' + (ok ? 'kta-tx-ok' : 'kta-tx-err') + '" style="margin:0;">' +
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
               '<p style="color:var(--kta-texte-3); font-size:13px;">' +
                 t("secours.import.resOkSource", { fichier: _escHtml(sourceFilename || t("secours.import.fichierDefault")) }) + '<br>' +
                 t("secours.import.resOkEquipes", { n: nbGroupes }) +
               '</p>';
      if (result.warning) {
        inner += '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.12); border:1px solid rgba(255,140,0,0.5); border-radius:6px; padding:10px 12px; margin:12px 0; color:var(--kta-avert);">' +
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
               '<div class="kta-tx-err" style="background:rgba(255,140,140,0.10); border:1px solid rgba(255,140,140,0.45); border-radius:6px; padding:10px 12px; margin:12px 0; font-family:monospace; font-size:13px; word-break:break-word;">' +
                 _escHtml(errMsg) +
               '</div>' +
               '<p style="color:var(--kta-texte-3); font-size:13px;">' +
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

  // ── Import d'un rapport d'équipe .mkmsec.report.json ───────────────
  // L'opérateur FUSIONNE le rapport d'un équipier (scope « equipe ») dans son scenario.execution :
  // observations, statuts, photos. Le rapport arrive par fichier (mail, AirDrop, USB…).
  // Fusion :
  //   - observations : concaténées sous un séparateur « Import Équipier <ts> » ;
  //   - statut : le PLUS SÉVÈRE (TABLEAU_STATUTS.severity) ;
  //   - photos : ajoutées, dédoublonnées par id ;
  //   - horodatages : startedAt le plus ancien, completedAt le plus récent ;
  //   - `_importedFrom` sur chaque étape touchée, journal `s.execution._importLog`,
  //     sauvegarde SessionBackups AVANT (annulation = restauration).
  // Refus : scope inattendu, scenario.id ≠ celui ouvert, équipe inconnue, pas d'exécution active ici.
  // Autre plan → avertissement (pas erreur), l'aperçu décide.

  const REPORT_FORMAT_VERSION_MAX = 1; // version max supportée à l'import

  // Parse + validation seule (pendant de _parsePayloadMkmsec). Retourne { ok, payload?, equipeId?,
  // conflits?, warning?, error? } ; `conflits` = étapes déjà renseignées ici (statut ≠ pending ou
  // observations) qui seront fusionnées.
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

    if (!payload || typeof payload !== "object") {
      return { ok: false, error: t("secours.import.errPayload") };
    }
    if (payload.type !== "myktamap-secours-report") {
      return { ok: false, error: t("secours.report.errType", { type: (payload.type || t("secours.report.absent")) }) };
    }
    if (typeof payload.version !== "number" || payload.version < 1 || payload.version > REPORT_FORMAT_VERSION_MAX) {
      return { ok: false, error: t("secours.report.errVersion", { version: payload.version, max: REPORT_FORMAT_VERSION_MAX }) };
    }

    if (payload.scope !== "equipe") {
      if (payload.scope === "operateur") {
        return { ok: false, error: t("secours.report.errScopeOperateur") };
      }
      if (payload.scope === "secouriste") {
        // Le rapport du secouriste libre est accepté : ses notes entrent dans la main courante (mêmes contrôles
        // de scénario).
        const sc = get(_currentScenarioId);
        if (!sc) return { ok: false, error: t("secours.report.errAucunScenario") };
        if (!sc.execution || !sc.execution.active) return { ok: false, error: t("secours.report.errPasExecution") };
        if (payload.scenario && payload.scenario.id && payload.scenario.id !== sc.id) {
          return { ok: false, error: t("secours.report.errScenarioDifferent", { nom: (payload.scenario.nom || t("secours.import.sansNom")),
            id: payload.scenario.id.slice(0, 8), nomActif: sc.nom }) };
        }
        if (!Array.isArray(payload.notesLibres)) return { ok: false, error: t("secours.report.errScopeSecouriste") };
        return { ok: true, payload: payload, secouriste: true };
      }
      return { ok: false, error: t("secours.report.errScopeInconnu", { scope: payload.scope }) };
    }

    // equipesData doit contenir exactement 1 équipe.
    if (!Array.isArray(payload.equipesData) || payload.equipesData.length !== 1) {
      return { ok: false, error: t("secours.report.errEquipesData", { n: (Array.isArray(payload.equipesData) ? payload.equipesData.length : t("secours.report.nonArray")) }) };
    }
    const ed = payload.equipesData[0];
    if (!ed.equipe || typeof ed.equipe !== "object" || typeof ed.equipe.id !== "string") {
      return { ok: false, error: t("secours.report.errEquipeInvalide") };
    }

    const currentScenario = get(_currentScenarioId);
    if (!currentScenario) {
      return { ok: false, error: t("secours.report.errAucunScenario") };
    }
    if (!currentScenario.execution || !currentScenario.execution.active) {
      return { ok: false, error: t("secours.report.errPasExecution") };
    }

    if (payload.scenario && payload.scenario.id && payload.scenario.id !== currentScenario.id) {
      return { ok: false, error: t("secours.report.errScenarioDifferent", { nom: (payload.scenario.nom || t("secours.import.sansNom")), id: payload.scenario.id.slice(0, 8), nomActif: currentScenario.nom }) };
    }

    const equipeOp = currentScenario.groupes.find(function(g) { return g.id === ed.equipe.id; });
    if (!equipeOp) {
      return { ok: false, error: t("secours.report.errEquipeAbsente", { nom: (ed.equipe.nom || t("secours.import.sansNom")), id: ed.equipe.id.slice(0, 8) }) };
    }

    // Conflits (information pour l'aperçu). 🩸 Mêmes préparatifs que la fusion (identités posées et
    // rattachées, étapes de la phase visée — phase close → son historique), sinon l'aperçu annonce autre chose
    // que ce qui sera fusionné.
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

    let warning = null;
    if (_autrePlan(payload.plan)) {
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

  // Injection depuis un payload validé : fusion dans s.execution.etapes[equipeId], `_importedFrom`, journal.
  // Async (photos en IndexedDB). Retourne { ok, stats: { etapesFusionnees, etapesSkipped, photosImportees,
  // photosSkipped, warnings } }.
  // 🩸 Un rapport de phase 1 importé APRÈS le passage en phase 2 ne doit pas remplir les étapes de la phase 2
  // (équipe reconduite) : des galeries paraîtraient fouillées sans que personne n'y soit allé. Phase du
  // rapport = celle qu'il déclare ; rapport sans phase : déduite des horodatages (tout terminé avant le
  // début de la phase en cours → phase précédente). Retourne l'index de phase du rapport.
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

    // Sauvegarde AVANT pour annuler (SessionBackups) ; module absent : on continue.
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
    // Rapport d'une phase CLOSE : fusion dans l'historique de CETTE phase, jamais dans la phase en cours ; pas
    // de remise de point (le parcours actuel n'est pas le sien).
    const phaseClose = !!(archPhase && Array.isArray(archPhase[equipeId]));
    let etapesOp;
    if (phaseClose) {
      etapesOp = archPhase[equipeId];
    } else {
      // Pas d'entrée vide créée pour une équipe hors de la phase en cours (la fusion n'ajoute jamais d'étape).
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
      alertes: [],  // affichées en clair, jamais repliées
      avis: []      // avertissements orange en clair (rapport de phase close…)
    };

    // Photos importées indexées par stepIdx, pour le rattachement.
    const photosByStep = {};
    photosImportees.forEach(function(p) {
      if (typeof p.stepIdx !== "number") return;
      if (!photosByStep[p.stepIdx]) photosByStep[p.stepIdx] = [];
      photosByStep[p.stepIdx].push(p);
    });

    const tsLabel = new Date(payload.exportedAt || importedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    // 🩸 « Aide » ou « victime » signalée sur une étape que le PC a retirée entre-temps : le point est REMIS
    // dans le parcours de l'équipe, à sa place (après le point importé précédent), puis fusionné ; une alerte
    // rouge le dit. Jamais une ligne repliée.
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
    // Identités posées et rattachées AVANT d'apparier.
    if (gEq) { _normaliserParcours(gEq); _rattacherWidEtapes(s, gEq); }
    const preApp = _apparierEtapes(etapesOp, etapesImportees);
    // Remise SEULEMENT si le point a vraiment quitté le parcours (ni son wid ni sa position n'y sont) et si
    // l'équipe est dans la phase en cours ; sinon alerte rouge sans remise (aussi pour un rapport sans
    // position).
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
    const remis = new Map();   // étape importée → wid du point remis
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
        preApp[iImp] = { type: "interm", wid: wp.wid };   // repère « avant » des remises suivantes
        stats.alertes.push(t("secours.report.alerteRemise", { statut: _statutLabel(e.statut), label: e.label || "?" }));
      });
      _resyncEtapesEquipe(s, gEq);
      etapesOp = s.execution.etapes[equipeId];
    }

    // Fusion étape par étape, séquentielle (écritures IndexedDB des photos). Appariement : cf _apparierEtapes.
    const pairesFusion = _apparierEtapes(etapesOp, etapesImportees);
    for (let i = 0; i < etapesImportees.length; i++) {
      const etImp = etapesImportees[i];
      // Point remis : retrouvé par son wid, quel que soit son ancien type.
      const etapeOp = pairesFusion[i] || (remis.has(etImp)
        ? etapesOp.find(function(x) { return x.wid === remis.get(etImp); }) || null : null);
      if (!etapeOp) {
        stats.etapesSkipped++;
        stats.warnings.push(t("secours.report.warnEtapeAbsente", { idx: etImp.idx, label: (etImp.label || "?") }));
        // Ses saisies ne sont pas jetées : archivées avec les étapes retirées.
        if (_etapeADesDonnees(etImp)) {
          // Un indice / une observation / une photo sur une étape que le PC n'a plus reste visible : avis orange,
          // photos importées (hors rapport, stepIdx -2) et comptées dans l'archive.
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
          // 🩸 Une étape déjà archivée (même point) est MISE À JOUR, pas ré-ajoutée à chaque import.
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

      // Concaténation des observations (sauf import vide).
      // 🩸 Chaque ré-import (et le rapport final, qui reprend l'intermédiaire) DUPLIQUERAIT les observations.
      // L'étape mémorise le dernier texte reçu de l'équipe (`_obsImport`) : identique → rien ; prolongé → seule
      // la partie nouvelle ; déjà présent au PC → rien.
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

      // Statut : le plus sévère ; un import « pending » n'écrase jamais.
      // 🩸 Un statut reçu bat « en attente » (sinon « RAS », de sévérité 0 comme « en attente », serait perdu) ;
      // à sévérité égale, le plus récent gagne (completedAt, lu AVANT la fusion des horodatages ci-dessous).
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

      // Horodatages : startedAt le plus ancien, completedAt le plus récent.
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

      const photosCetteEtape = photosByStep[etImp.idx] || [];
      etapeOp.photoIds = etapeOp.photoIds || [];
      for (let j = 0; j < photosCetteEtape.length; j++) {
        const photo = photosCetteEtape[j];
        // Dédoublonnage par id (collision très rare, par sûreté).
        if (etapeOp.photoIds.indexOf(photo.id) >= 0) {
          stats.photosDejaPresentes++;
          continue;
        }
        // Photo sans dataUrl (non autonome) : ignorée.
        if (!photo.dataUrl) {
          stats.photosSkipped++;
          stats.warnings.push(t("secours.report.warnPhotoSansData", { id: photo.id }));
          continue;
        }
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

      // Position précisée de la victime : la plus récente gagne.
      if (etImp.victimePos && typeof etImp.victimePos.x === "number" && typeof etImp.victimePos.y === "number") {
        const tImp = Date.parse(etImp.victimePos.at || 0) || 0;
        const tOp = etapeOp.victimePos ? (Date.parse(etapeOp.victimePos.at || 0) || 0) : -1;
        if (tImp >= tOp) etapeOp.victimePos = etImp.victimePos;
      }

      // Traçabilité (chip d'interface + journal).
      etapeOp._importedFrom = {
        sourceScenarioId: sourceScenarioId,
        sourceAppVersion: sourceAppVersion,
        importedAt:       importedAt
      };

      stats.etapesFusionnees++;
    }

    // Heures de départ / rentrée venues du téléphone de l'équipe (phase du rapport).
    if (ed.suivi && typeof ed.suivi === "object") {
      s.execution.suivi = s.execution.suivi || {};
      const kPh = String(phaseRap);
      s.execution.suivi[kPh] = s.execution.suivi[kPh] || {};
      const su = s.execution.suivi[kPh][equipeId] = s.execution.suivi[kPh][equipeId] || {};
      const tot = function(a, b) { return !a ? b : !b ? a : (Date.parse(a) <= Date.parse(b) ? a : b); };
      ["departAt", "rentreeAt", "rappelAt"].forEach(function(k) {
        if (ed.suivi[k] && !isNaN(Date.parse(ed.suivi[k]))) su[k] = tot(su[k], ed.suivi[k]);
      });
      // Compte des remontés fait par l'équipe elle-même, si le PC n'en a pas.
      if (Number.isInteger(ed.suivi.remontes) && !Number.isInteger(su.remontes)) su.remontes = ed.suivi.remontes;
    }

    // Main courante : les entrées du téléphone (vraies heures) rejoignent celle du PC,
    // sans doublon, signées de l'équipe ; puis la trace de l'import lui-même.
    if (Array.isArray(payload.mainCourante)) {
      const vu = {};
      (s.execution.mainCourante || []).forEach(function(e) { vu[e.at + "|" + e.cle + "|" + JSON.stringify(e.p || {})] = true; });
      payload.mainCourante.forEach(function(e) {
        if (!e || typeof e.cle !== "string" || e.cle.indexOf("secours.mc.") !== 0 || isNaN(Date.parse(e.at))) return;
        const k = e.at + "|" + e.cle + "|" + JSON.stringify(e.p || {});
        if (vu[k]) return;
        vu[k] = true;
        s.execution.mainCourante = s.execution.mainCourante || [];
        s.execution.mainCourante.push({ at: e.at, cle: e.cle, p: e.p || {}, source: e.source || (ed.equipe.nom || "?") });
      });
    }
    _journaliser(s, "secours.mc.import", { equipe: ed.equipe.nom || "?", n: stats.etapesFusionnees });

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

  // Aperçu AVANT injection d'un rapport d'équipe (pendant de _afficherPreviewImport) : équipe cible, nombre
  // d'étapes, de photos et de conflits.
  function _afficherPreviewImportRapport(parseResult, sourceFilename, onDone) {
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
    boite.style.borderLeft = "6px solid var(--kta-ok)"; // vert = action de fusion

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
      const extra = conflits.length > 6 ? '<li style="color:var(--kta-texte-3); font-style:italic;">' + t("secours.conflit.autres", { n: (conflits.length - 6) }) + '</li>' : "";
      conflitsBlock =
        '<div style="background:rgba(255,140,0,0.10); border:1px solid rgba(255,140,0,0.45); border-radius:6px; padding:10px 12px; margin:14px 0; color:var(--kta-texte);">' +
          '<strong style="color:var(--kta-accent-texte);">' + t("secours.conflit.titre", { n: conflits.length }) + '</strong> ' + t("secours.conflit.intro") +
          '<ul style="margin:8px 0 4px 18px; padding:0; font-size:13px; line-height:1.6;">' + lignes + extra + '</ul>' +
          '<div style="font-size:12px; color:var(--kta-texte-3); margin-top:6px;">' +
            t("secours.conflit.politique") +
          '</div>' +
        '</div>';
    }

    let warningBlock = "";
    if (warning) {
      warningBlock =
        '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.10); border:1px solid rgba(255,140,0,0.55); border-radius:6px; padding:10px 12px; margin:14px 0; color:var(--kta-avert);">' +
          '⚠️ <strong>' + _escHtml(warning) + '</strong>' +
        '</div>';
    }

    const inner =
      '<div class="kta-readme-modal-header">' +
        '<h2 class="kta-tx-ok" style="margin:0; color:var(--kta-ok);">' + t("secours.rapportPreview.titre") + '</h2>' +
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
          '<h3 style="margin:14px 0 6px 0; color:var(--kta-accent-texte);">' + t("secours.rapportPreview.contenuTitre") + '</h3>' +
          '<ul style="margin:0; padding-left:20px; line-height:1.7;">' +
            '<li>' + t("secours.rapportPreview.nbEtapes", { n: nbEtapes }) + '</li>' +
            '<li>' + t("secours.rapportPreview.nbPhotos", { n: nbPhotos }) + '</li>' +
          '</ul>' +
        '</div>' +

        conflitsBlock +
        warningBlock +
        _blocEcartVersion(payload.plan) +

        '<div style="background:rgba(140, 180, 255, 0.06); border-left:3px solid var(--kta-interaction); padding:10px 12px; margin:14px 0 0; border-radius:0 4px 4px 0; font-size:12px; color:var(--kta-texte-2);">' +
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

  // Résultat d'import d'un rapport (succès = statistiques, échec = erreur).
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
    boite.style.borderLeft = ok ? "6px solid var(--kta-ok)" : "6px solid var(--kta-erreur)";

    let inner = '<div class="kta-readme-modal-header">' +
                  '<h2 class="' + (ok ? 'kta-tx-ok' : 'kta-tx-err') + '" style="margin:0;">' +
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
                 ((stats.photosDejaPresentes || 0) > 0 ? ' <span style="color:var(--kta-texte-3);">' + t("secours.rapportRes.photosDejaPresentes", { n: stats.photosDejaPresentes }) + '</span>' : '') + '<br>' +
                 ((stats.etapesSkipped || 0) > 0 ? '⏭️ ' + t("secours.rapportRes.etapesSkipped", { n: stats.etapesSkipped }) + '<br>' : '') +
                 ((stats.photosSkipped || 0) > 0 ? '⚠️ ' + t("secours.rapportRes.photosSkipped", { n: stats.photosSkipped }) + '<br>' : '') +
               '</div>';
      // Alertes « aide / victime » en clair, avant tout le reste.
      if (Array.isArray(stats.alertes) && stats.alertes.length > 0) {
        inner += '<div class="kta-tx-err" style="background:rgba(255,68,68,0.14); border:1px solid var(--kta-erreur); border-radius:6px;' +
                 ' padding:10px 12px; margin:10px 0; font-size:13px; line-height:1.5;">🚨 ' +
                 stats.alertes.map(_escHtml).join('<br>🚨 ') + '</div>';
      }
      if (Array.isArray(stats.avis) && stats.avis.length > 0) {
        inner += '<div class="kta-tx-warn" style="background:rgba(255,140,0,0.10); border:1px solid rgba(255,140,0,0.55); border-radius:6px;' +
                 ' padding:10px 12px; margin:10px 0; color:var(--kta-avert); font-size:13px; line-height:1.5;">⚠️ ' +
                 stats.avis.map(_escHtml).join('<br>⚠️ ') + '</div>';
      }
      if (Array.isArray(stats.warnings) && stats.warnings.length > 0) {
        const lis = stats.warnings.map(function(w) { return '<li>' + _escHtml(w) + '</li>'; }).join("");
        inner += '<details style="margin:10px 0; font-size:13px;">' +
                   '<summary style="cursor:pointer; color:var(--kta-accent-texte);">' + t("secours.rapportRes.warningsSummary", { n: stats.warnings.length }) + '</summary>' +
                   '<ul style="margin:8px 0 0 20px; padding:0; color:var(--kta-texte-2); line-height:1.6;">' + lis + '</ul>' +
                 '</details>';
      }
      inner += '<div style="margin-top:18px; display:flex; gap:10px; justify-content:flex-end;">' +
                 '<button class="kta-btn kta-btn-primary" data-action="close-rapport-result">' + t("secours.btn.ok") + '</button>' +
               '</div>';
    } else {
      const errMsg = (result && result.error) || t("secours.import.erreurInconnue");
      inner += '<p>' + t("secours.import.resKoBody", { fichier: _escHtml(sourceFilename || t("secours.import.fichierDefault")) }) + '</p>' +
               '<div class="kta-tx-err" style="background:rgba(255,140,140,0.10); border:1px solid rgba(255,140,140,0.45); border-radius:6px; padding:10px 12px; margin:12px 0; font-size:13px; line-height:1.5; word-break:break-word;">' +
                 _escHtml(errMsg) +
               '</div>' +
               '<p style="color:var(--kta-texte-3); font-size:13px;">' +
                 t("secours.rapportRes.koHint") +
               '</p>' +
               '<div style="margin-top:18px; display:flex; justify-content:flex-end;">' +
                 '<button class="kta-btn kta-btn-primary" data-action="close-rapport-result">' + t("secours.btn.jaiCompris") + '</button>' +
               '</div>';
    }
    inner += '</div>';

    boite.innerHTML = inner;
    overlay.appendChild(boite);

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

  // Import .mkmsec.report.json depuis la vue Live Opérateur (pendant de _ouvrirImportMkmsecPicker).
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
      if (parsed.secouriste) {   // notes du secouriste → main courante
        const n = parsed.payload.notesLibres.length;
        const ok = (typeof window.ktaConfirm === "function")
          ? await window.ktaConfirm(t("secours.secouriste.importConfirm", { n: n }), { titre: t("secours.secouriste.importTitre") })
          : false;
        if (!ok) return;
        const ajoutees = _importerNotesSecouriste(parsed.payload);
        _toast(t("secours.secouriste.importFait", { n: ajoutees }), "info");
        if (_modal) _switchView("live");
        return;
      }
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
        // Re-rendu de la vue Live opérateur (chips _importedFrom). ⚠️ Appeler une fonction qui existe : un typeof
        // sur un nom absent masquerait l'échec et figerait les cartes sur l'état d'avant.
        try {
          if (_modal) _switchView("live");
          if (_overlayLayer) renderOverlay(_currentScenarioId);
        } catch(e) { console.warn("[SecoursMode] re-render post-import :", e); }
      });
    });
    document.body.appendChild(input);
    input.click();
  }

  // Duplique un scénario (copie profonde, nouvel id) : pour une variante « et si Alpha sort par le Sud ».
  function duplicateScenario(id) {
    const src = get(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = _genId("secours");
    copy.nom = t("secours.scenario.copieSuffix", { nom: src.nom });
    copy.createdAt = _nowIso();
    copy.updatedAt = _nowIso();
    // Ids des groupes régénérés (sinon collisions).
    // 🩸 Une variante est un plan NEUF : phases remappées et remises à zéro, pas d'exécution. Recopier
    // l'exécution en cours avec les anciens ids ferait naître une variante « en cours », protégée de la purge,
    // sans étapes.
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

  // ── CRUD des groupes (équipes) ──────────────────────────────────────

  // Ajoute un groupe vide ; couleurIdx = prochaine couleur libre de la palette (cyclique au-delà de 10).
  // `level` (number | null) : niveau de référence à la création, sinon APP_CONFIG.activeLevel.
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
      // Niveau de RÉFÉRENCE de l'équipe : number | null (null = plan mono-niveau, ou équipe qui traverse
      // plusieurs étages par des jonctions). Sert au rendu de l'overlay et au filtre de niveau.
      level:             (level != null) ? level
                       : (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true
                          && typeof window.APP_CONFIG.activeLevel === "number")
                         ? window.APP_CONFIG.activeLevel : null,
      // Parcours = entree + intermediaires[] + sortie ; le Pathfinder enchaîne [entree, …intermediaires, sortie]
      // pour ratisser la zone. Boucle = même POI en entrée et en sortie. Format commun des points :
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
      // Position GPS de surface de l'équipe (PC, rendez-vous pompiers…), facultative : {lat, lng} WGS84 ou null.
      // Exportée dans le .mkmsec.json, utilisée par le briefing pompiers PDF (lien OSM, marqueur).
      surfaceGps:        null
    };
    s.groupes.push(groupe);
    // Nouvelle équipe affectée à la phase courante (phase 0 sans exécution), sans doublon ; on peut la
    // décocher d'une phase ultérieure.
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

  // Mise à jour partielle d'un groupe (liste blanche).
  function updateGroupe(scenarioId, groupeId, partial) {
    const s = get(scenarioId);
    if (!s) return null;
    const g = s.groupes.find(function(x) { return x.id === groupeId; });
    if (!g || !partial || typeof partial !== "object") return null;
    // 🩸 Retirer du parcours, pendant l'intervention, une étape qui porte des saisies : confirmation ; REFUS si
    // elle porte « aide demandée » ou « victime » (l'info ne doit pas quitter le stepper).
    const touchePar = ("entree" in partial || "sortie" in partial || "intermediaires" in partial);
    if (touchePar) {
      // Identité des points : un point NOUVEAU (ou remplacé) reçoit un nouveau wid ; les étapes sans wid sont
      // rattachées au parcours actuel.
      _normaliserParcours(g);
      _rattacherWidEtapes(s, g);
      // Un point fourni SANS wid mais au même endroit et dans le même rôle qu'un point existant EST ce point : il
      // hérite de son wid. Seul un point nouveau ou déplacé reçoit une identité neuve (un homonyme placé
      // ailleurs reste un autre point).
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
      // 🩸 Le refus aide/victime est RE-VÉRIFIÉ au ré-appel après confirmation : seule la question est sautée,
      // pas le contrôle.
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
        } else {
          // Sans fenêtre de confirmation : le retrait est REFUSÉ (jamais d'étape perdue sans question).
          console.warn("[SecoursMode] retrait d'étapes refusé : confirmation indisponible");
        }
        return null;
      }
    }
    if ("nom" in partial && typeof partial.nom === "string") g.nom = partial.nom;
    if ("couleurIdx" in partial && Number.isInteger(partial.couleurIdx)) {
      g.couleurIdx = ((partial.couleurIdx % PALETTE.length) + PALETTE.length) % PALETTE.length;
    }
    if ("membres" in partial && Array.isArray(partial.membres)) {
      g.membres = partial.membres.slice();
    }
    // Chef d'équipe (un des membres), effectif (personnes). L'heure de retour IMPÉRATIVE (autonomie des
    // éclairages, relève) est une consigne du chef, pas une estimation : « HH:MM » ou null.
    if ("zoneTousNiveaux" in partial) g.zoneTousNiveaux = partial.zoneTousNiveaux === true;
    if ("heureRetour" in partial) g.heureRetour = (typeof partial.heureRetour === "string" && /^\d{2}:\d{2}$/.test(partial.heureRetour)) ? partial.heureRetour : null;
    if ("chef" in partial) g.chef = (typeof partial.chef === "string" && partial.chef.trim()) ? partial.chef.trim().slice(0, 60) : null;
    if ("effectif" in partial) {
      const n = parseInt(partial.effectif, 10);
      g.effectif = (Number.isFinite(n) && n > 0 && n < 100) ? n : null;
    }
    if ("entree" in partial) g.entree = partial.entree;       // {x,y,level?,pointId?,label?} | null
    if ("sortie" in partial) g.sortie = partial.sortie;
    if ("intermediaires" in partial && Array.isArray(partial.intermediaires)) {
      g.intermediaires = partial.intermediaires.slice();
    }
    // Niveau de référence de l'équipe (number | null).
    if ("level" in partial) {
      g.level = (typeof partial.level === "number" && Number.isInteger(partial.level))
                ? partial.level : null;
    }
    if ("zoneType" in partial) g.zoneType = partial.zoneType;  // "polygon"|"roads"|null
    if ("zonePolygon" in partial) g.zonePolygon = partial.zonePolygon;
    if ("zoneRoadIds" in partial) g.zoneRoadIds = partial.zoneRoadIds;
    // Mode de parcours : "court" (défaut : plus court chemin par les étapes) | "complet" | "ossature".
    if ("approcheM" in partial) g.approcheM = (typeof partial.approcheM === "number" && partial.approcheM >= 0) ? partial.approcheM : null;
    if ("parcoursMode" in partial) {
      g.parcoursMode = (partial.parcoursMode === "complet" || partial.parcoursMode === "ossature") ? partial.parcoursMode : null;
    }
    if ("itineraireSuggere" in partial) g.itineraireSuggere = partial.itineraireSuggere;
    if ("guidage" in partial) g.guidage = partial.guidage;   // carrefours / raccords du calcul
    if ("distanceM" in partial) g.distanceM = partial.distanceM;
    if ("dureeEstimeeMin" in partial) g.dureeEstimeeMin = partial.dureeEstimeeMin;
    if ("statut" in partial && typeof partial.statut === "string") g.statut = partial.statut;
    if ("observations" in partial && typeof partial.observations === "string") {
      g.observations = partial.observations;
    }
    // Position GPS de surface : {lat, lng} numériques bornés, sinon null ; null explicite = effacer.
    if ("surfaceGps" in partial) {
      const p = partial.surfaceGps;
      if (p === null) {
        g.surfaceGps = null;
      } else if (p && typeof p === "object"
                 && typeof p.lat === "number" && typeof p.lng === "number"
                 && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180) {
        g.surfaceGps = { lat: p.lat, lng: p.lng };
      }
      // Sinon : valeur invalide ignorée (pas d'écrasement).
    }
    if ("entree" in partial || "sortie" in partial || "intermediaires" in partial) {
      _resyncEtapesEquipe(s, g);   // parcours modifié en cours de phase
    }
    _commitMutation(s);
    return g;
  }

  function removeGroupe(scenarioId, groupeId) {
    const s = get(scenarioId);
    if (!s) return false;
    const idx = s.groupes.findIndex(function(g) { return g.id === groupeId; });
    if (idx < 0) return false;
    s.groupes.splice(idx, 1);
    if (_focusedGroupeId === groupeId) _focusedGroupeId = null;
    // Retire l'id des groupeIds[] de toutes les phases (sinon équipe fantôme dans l'interface).
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

  // Stub de l'API publique : non implémenté (journalise et rend null).
  function recalculerItineraires(scenarioId) {
    console.warn("[SecoursMode] recalculerItineraires : pas encore implémenté (commit 4/9)");
    return null;
  }

  // ── Overlay carte ───────────────────────────────────────────────────
  // Zones, entrées/sorties et itinéraires des équipes d'un scénario, aux couleurs de PALETTE (polygones à
  // fillOpacity 0.30 : lisible en briefing sans masquer le fond). Avec _focusedGroupeId : cette équipe seule.
  function renderOverlay(scenarioId) {
    clearOverlay();
    const s = get(scenarioId || _currentScenarioId);
    if (!s || !window.map) return;
    _currentScenarioId = s.id;
    _overlayLayer = L.layerGroup().addTo(window.map);
    // Contexte du Mode Perdu (marqueur de dernière position + cercle d'incertitude), posé AVANT les équipes
    // pour ne pas masquer les zones.
    if (s.context) {
      _renderContextOverlay(s.context);
    }
    // Filtrage selon le rôle quand l'exécution est active : un équipier ne voit que SA zone (prime sur le
    // focus), opérateur et secouriste voient tout ; ✓ vert sur les points passés.
    const execActive = _estExecutionActive(s);
    const isEquipier = execActive && s.execution.role === "equipe" && s.execution.currentEquipeId;
    s.groupes.forEach(function(g) {
      if (isEquipier && g.id !== s.execution.currentEquipeId) return;
      // Focus manuel.
      if (!isEquipier && _focusedGroupeId && g.id !== _focusedGroupeId) return;
      const couleur = PALETTE[g.couleurIdx % PALETTE.length].hex;
      _renderGroupeOverlay(g, couleur, s);
    });
    // Chaque victime a son marqueur ✚, visible de TOUS, équipier compris (sécurité).
    _victimesDe(s).forEach(function(v) {
      if (!v.pos) return;
      L.marker(_planToLatLng(v.pos), {
        icon: L.divIcon({ className: "kta-secours-victime-marker", html: "<span>✚</span>", iconSize: [30, 30], iconAnchor: [15, 15] }),
        zIndexOffset: 2000, keyboard: false
      }).bindTooltip("🚨 " + _escHtml(t("secours.victime.titre")) + " — " + _escHtml(v.g.nom), { direction: "top" })
        .addTo(_overlayLayer);
    });
  }

  // Étape d'exécution d'un point de parcours, ou null (pas d'exécution, ou étape absente car parcours
  // ajusté après lancement). Correspondance : entrée = 0, intermédiaires = 1..N, sortie = N+1.
  function _getEtapeForWaypoint(s, equipeId, waypointType, intermIdx) {
    if (!_estExecutionActive(s) && !(s.execution && s.execution.endedAt)) {
      // Une exécution terminée compte aussi : les ✓ restent visibles dans le bandeau PLAN TERMINÉ.
      return null;
    }
    const etapes = _getEtapesEquipe(s, equipeId);
    if (!Array.isArray(etapes) || etapes.length === 0) return null;
    // 🩸 Appariement par IDENTITÉ d'étape (wid) d'abord : par rang seul, le ✓ glisse sur le mauvais point dès
    // que les étapes ne sont plus resynchronisées (équipe sortie de la phase, puis parcours modifié).
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
      const interms = etapes.filter(function(e) { return e.type === "interm"; });
      return interms[intermIdx] || null;
    }
    return null;
  }

  // Badge ✓ (L.marker divIcon) en haut à droite du marqueur d'une étape faite (completedAt + statut non
  // pending), à la couleur du statut (RAS vert, bloqué gris, victime rouge…).
  function _addCheckBadgeIfDone(etape, latlng) {
    if (!etape || !etape.completedAt || etape.statut === "pending") return;
    const info = _getStatutInfo(etape.statut);
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

  // Contexte importé du Mode Perdu : marqueur sur lastKnownPoint, cercle pointillé rouge sur zoneIncertitude.
  function _renderContextOverlay(ctx) {
    if (!ctx) return;
    if (ctx.zoneIncertitude && typeof ctx.zoneIncertitude.x === "number"
        && typeof ctx.zoneIncertitude.radiusMeters === "number") {
      const scale = (window.APP_CONFIG && window.APP_CONFIG.scale > 0)
                    ? window.APP_CONFIG.scale : 1;
      const radiusPx = ctx.zoneIncertitude.radiusPx
                       || (ctx.zoneIncertitude.radiusMeters * scale);
      const center = _planToLatLng(ctx.zoneIncertitude);
      // ⚠️ En CRS.Simple, L.circle prend un rayon en PIXELS (en mètres seulement en CRS standard) : d'où la
      // conversion par APP_CONFIG.scale (px/m).
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
    if (ctx.lastKnownPoint && typeof ctx.lastKnownPoint.x === "number") {
      const cm = L.circleMarker(_planToLatLng(ctx.lastKnownPoint), {
        radius:      12,
        color:       "#ff4444",
        weight:      4,
        fillColor:   "#fff",
        fillOpacity: 0.95
      });
      const lbl = ctx.lastKnownPoint.label
                  ? t("secours.overlay.dernierePositionLabel", { label: _escHtml(ctx.lastKnownPoint.label) })
                  : t("secours.overlay.dernierePosition");
      cm.bindTooltip(lbl, { permanent: false });
      cm.addTo(_overlayLayer);
    }
  }

  // Enveloppe d'une zone « tracés » (SecoursBalayage.enveloppe), mémorisée par zone :
  // cellule 5 m, galeries voisines réunies jusqu'à 40 m, 12 m de marge.
  const _enveloppes = {};
  function _enveloppeZone(g, traces) {
    if (!window.SecoursBalayage || typeof window.SecoursBalayage.enveloppe !== "function" || !traces.length) return [];
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    const cle = g.id + "|" + pxParM + "|" + traces.map(_cleTrace).join(",");
    if (_enveloppes[g.id] && _enveloppes[g.id].cle === cle) return _enveloppes[g.id].anneaux;
    const segs = [];
    traces.forEach(function(r) { for (let i = 1; i < r.points.length; i++) segs.push([r.points[i - 1], r.points[i]]); });
    const anneaux = window.SecoursBalayage.enveloppe(segs, { cellule: 5 * pxParM, fermeture: 40 * pxParM, marge: 12 * pxParM });
    _enveloppes[g.id] = { cle: cle, anneaux: anneaux };
    return anneaux;
  }
  // Teinte plus foncée d'une couleur #rrggbb (f = part de noir).
  function _assombrir(hex, f) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
    if (!m) return hex;
    return "#" + [m[1], m[2], m[3]].map(function(h) {
      const v = Math.round(Number.parseInt(h, 16) * (1 - f));
      return (v < 16 ? "0" : "") + v.toString(16);
    }).join("");
  }

  function _renderGroupeOverlay(g, couleur, s) {
    // `s` facultatif : sans lui, pas de badges ✓.
    // Zone polygone : fillOpacity 30 %, bord 3 px.
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
    // Zone « tracés » : un POLYGONE sous tout le secteur (enveloppe des galeries, couleur de l'équipe en
    // transparence) et ses galeries en teinte plus foncée, en une seule ligne.
    if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds)) {
      const traces = _tracesZone(g).filter(function(r) { return r && Array.isArray(r.points) && r.points.length >= 2; });
      const env = _enveloppeZone(g, traces);
      if (env.length) {
        const poly = L.polygon(env.map(function(r) { return [r.map(_planToLatLng)]; }), {
          color: couleur, weight: 2, opacity: 0.8, fillColor: couleur, fillOpacity: 0.18, interactive: true
        });
        poly.bindTooltip("🚨 " + _escHtml(g.nom), { permanent: false, direction: "center" });
        poly.addTo(_overlayLayer);
      }
      if (traces.length) {
        L.polyline(traces.map(function(r) { return r.points.map(_planToLatLng); }), {
          color: _assombrir(couleur, 0.35), weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round",
          interactive: !env.length
        }).bindTooltip("🚨 " + _escHtml(g.nom), { permanent: false, direction: "center" }).addTo(_overlayLayer);
      }
    }
    // Entrée : cercle vert, halo couleur équipe.
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
      _addCheckBadgeIfDone(_getEtapeForWaypoint(s, g.id, "entree"), latlng);
    }
    // Intermédiaires : petits ronds couleur équipe, bord blanc, numérotés en tooltip.
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
        _addCheckBadgeIfDone(_getEtapeForWaypoint(s, g.id, "interm", i), latlng);
      });
    }
    // Sortie : carré (divIcon) couleur équipe, bord rouge.
    if (g.sortie && typeof g.sortie.x === "number" && typeof g.sortie.y === "number") {
      const latlng = _planToLatLng(g.sortie);
      // Boucle (entrée = sortie) : double bordure vert + rouge.
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
      _addCheckBadgeIfDone(_getEtapeForWaypoint(s, g.id, "sortie"), latlng);
    }
    // Itinéraire suggéré en pointillé couleur équipe, découpé par niveau : un tronçon d'un niveau non affiché
    // est atténué (comme les positions des autres, ktaPresences.js) — sinon il traverse la vue sans galerie.
    if (Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2) {
      const mlvl = _mlvlActif() && typeof window.passeFiltreNiveau === "function";
      const visible = function(lvl) { return !mlvl || window.passeFiltreNiveau({ level: lvl }); };
      const tracer = function(run, lvl) {
        if (run.length < 2) return;
        const vu = visible(lvl);
        const ligne = L.polyline(run.map(_planToLatLng), {
          color:     couleur,
          weight:    vu ? 5 : 3,
          opacity:   vu ? 0.90 : 0.22,
          dashArray: "10 6",
          lineCap:   "round",
          lineJoin:  "round"
        });
        ligne.bindTooltip(t("secours.overlay.itineraire", { equipe: _escHtml(g.nom) }), { permanent: false });
        ligne.addTo(_overlayLayer);
      };
      let run = [], niv = g.itineraireSuggere[0].level;
      g.itineraireSuggere.forEach(function(q) {
        if (mlvl && q.level !== niv) {
          const dernier = run[run.length - 1];
          tracer(run, niv);
          run = dernier ? [dernier] : [];
          niv = q.level;
        }
        run.push(q);
      });
      tracer(run, niv);
    }
  }
  function clearOverlay() {
    if (_overlayLayer && window.map) {
      try { window.map.removeLayer(_overlayLayer); } catch(e) {}
    }
    _overlayLayer = null;
    // Retire le bouton flottant de retour à la modale (fermeture par Échap ou changement de plan).
    if (typeof _removeOverlayFloater === "function") _removeOverlayFloater();
  }
  function setFocus(groupeId) {
    _focusedGroupeId = groupeId || null;
    if (_overlayLayer && _currentScenarioId) {
      renderOverlay(_currentScenarioId);
    }
  }

  // ── Rapport au fil des étapes ───────────────────────────────────────
  // 3 formats (PDF jsPDF, .mkmsec.report.json, texte presse-papier) × 3 scopes : "operateur" (toutes les
  // équipes), "equipe" (currentEquipeId), "secouriste" (notes libres). Disponible pendant l'exécution et
  // après l'arrêt ; indisponible si le scénario n'a JAMAIS été lancé.

  const REPORT_FORMAT_VERSION = 1;

  // Objet commun aux 3 formats (async : photos résolues en data:base64 si includePhotos).
  // Retourne { type, version, exportedAt, appVersion, scope, plan, scenario, execution, equipesData,
  // notesLibres }.
  async function genererRapportData(scenarioId, scope, opts) {
    opts = opts || {};
    const s = get(scenarioId);
    if (!s) return null;
    if (!s.execution) return null;  // pas lancé → pas de rapport
    const includePhotos = (opts.includePhotos !== false);   // true par défaut

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

    // Exécution nettoyée (sans les drapeaux internes _previous*).
    const executionClean = {
      active:        !!s.execution.active,
      startedAt:     s.execution.startedAt,
      endedAt:       s.execution.endedAt,
      pausedAt:      s.execution.pausedAt,
      pausedTotalMs: s.execution.pausedTotalMs || 0,
      role:          s.execution.role,
      currentEquipeId: s.execution.currentEquipeId,
      // La phase du rapport, pour ne pas le verser dans une autre.
      currentPhaseIdx: (typeof s.execution.currentPhaseIdx === "number") ? s.execution.currentPhaseIdx : 0,
      dureeMs:       getExecutionDureeMs(scenarioId)
    };

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
        observations: g.observations || "",
        chef:       _chef(g),                                            
        effectif:   Number.isInteger(g.effectif) ? g.effectif : null     // sinon : nombre de membres
      };
      let photosResolved = [];
      if (includePhotos) {
        photosResolved = await _resolverPhotosEquipe(scenarioId, g.id);
      } else {
        // Ids seuls (compact, non autonome).
        photosResolved = await _listerPhotoIdsEquipe(scenarioId, g.id);
      }
      // Signalements hors parcours (phase en cours + phases closes).
      const horsParcours = [].concat((s.execution._etapesRetirees && s.execution._etapesRetirees[g.id]) || []);
      Object.keys(s.execution.etapesArchive || {}).forEach(function(k) {
        const r = s.execution.etapesArchive[k] && s.execution.etapesArchive[k]._retirees;
        (r && r[g.id] || []).forEach(function(e) {
          if (!horsParcours.some(function(x) { return x.wid && x.wid === e.wid && x.retireeAt === e.retireeAt; })) horsParcours.push(e);
        });
      });
      // Étapes des phases CLOSES aussi (le rapport final garde déjà leurs photos).
      const historique = Object.keys(s.execution.etapesArchive || {}).map(Number).sort(function(a, b) { return a - b; })
        .map(function(k) {
          const arr = s.execution.etapesArchive[String(k)] && s.execution.etapesArchive[String(k)][g.id];
          return Array.isArray(arr) && arr.length > 0
            ? { phaseIdx: k, nom: (s.phases && s.phases[k] && s.phases[k].nom) || String(k + 1), etapes: arr.slice(),
                parcours: _parcoursPhase(s, k, g.id) }   // parcours prévu de la phase
            : null;
        }).filter(Boolean);
      equipesData.push({
        equipe: equipeClean,
        etapes: etapes.slice(),    // shallow copy (étapes déjà clean)
        suivi: Object.assign({}, _suiviEquipe(s, g.id) || {}),   // départ / rentrée / rappel
        photos: photosResolved,
        horsParcours: horsParcours,
        historique: historique
      });
    }

    let notesLibres = [];
    if (scope === "secouriste"
        && s.execution.etapes
        && Array.isArray(s.execution.etapes._notes_libres)) {
      notesLibres = s.execution.etapes._notes_libres.slice();
      // Photos des notes libres : stockées avec equipeId = "_notes_libres", stepIdx = -1.
      if (includePhotos && notesLibres.length > 0) {
        try {
          const photosNotes = await _resolverPhotosEquipe(scenarioId, "_notes_libres");
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
      notesLibres:  notesLibres,
      mainCourante: _mcTriee(s)   
    };
  }

  // 🩸 Numéro d'étape d'une photo = celui de l'étape qui la DÉTIENT (`photoIds`), à défaut celui stocké en
  // base : une étape renumérotée par `_resyncEtapesEquipe` garde ses photos sans réécrire IndexedDB.
  // Rend aussi la phase de cette étape (null = en cours ou inconnue), pour « Phase k · Étape N » dans le PDF.
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
    // Une étape d'une phase CLOSE détient aussi ses photos (l'équipe reconduite repart d'étapes vierges).
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
    // 🩸 Photo qu'AUCUNE étape ne détient = exécution précédente (scénario supprimé puis réimporté, exécution
    // relancée : mêmes ids) → hors rapport. Les notes libres (-1) ne sont pas des étapes.
    if (Array.isArray(etapes) && rec.stepIdx !== -1) return null;
    return rec.stepIdx;
  }

  // Toutes les photos d'une équipe en data:base64 : [{id, mime, sizeBytes, dataUrl, stepIdx}, …].
  async function _resolverPhotosEquipe(scenarioId, equipeId) {
    if (!window.MyKTAMapSecoursPhotos
        || !window.MyKTAMapSecoursPhotos.isAvailable()) return [];
    try {
      const records = await window.MyKTAMapSecoursPhotos.getPhotosForEquipe(scenarioId, equipeId);
      if (!Array.isArray(records) || records.length === 0) return [];
      // Conversion séquentielle (RAM mobile).
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

  // Ids seuls des photos d'une équipe (compact).
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
          // Pas de dataUrl : référence seule.
        };
      });
    } catch(e) {
      return [];
    }
  }

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

  // Rapport en texte brut façon markdown : bouton « Copier texte » et base du PDF.
  function _lignesMcRapport(r) {
    return (r && Array.isArray(r.mainCourante) ? r.mainCourante : []).map(function(e) {
      return _heureCourte(e.at) + " — " + _texteMc(e);
    });
  }
  function genererRapportTexte(reportData) {
    if (!reportData) return "";
    const r = reportData;
    const sep = "─".repeat(60);
    let out = "";

    // ── En-tête ──
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
    _victimesDuRapport(r).forEach(function(v) {   
      out += "🚨 " + t("secours.victime.ligneRapport", { equipe: v.nom, etape: v.label, pos: _lblPos(v.pos), heure: _heureCourte(v.at) }) + "\n";
    });
    out += sep + "\n\n";

    // ── Équipes (opérateur ou équipe) ──
    if (Array.isArray(r.equipesData) && r.equipesData.length > 0) {
      r.equipesData.forEach(function(ed, idx) {
        const g = ed.equipe;
        const couleur = PALETTE[g.couleurIdx % PALETTE.length] || PALETTE[0];
        out += t("secours.txt.equipeHeader", { n: (idx + 1), total: r.equipesData.length, nom: g.nom, couleur: couleur.nom }) + "\n";
        out += sep + "\n";
        if (_ligneSuiviRapport(ed)) out += _ligneSuiviRapport(ed) + "\n";   
        if (g.membres && g.membres.length > 0) {
          out += t("secours.txt.membres", { membres: g.membres.join(", ") }) + "\n";
        }
        if (typeof g.level === "number") {
          out += t("secours.txt.niveau", { niveau: _formatLevelShort(g.level) }) + "\n";
        }
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

    // ── Notes libres (secouriste) ──
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
    const mcLignes = _lignesMcRapport(reportData);   // main courante en annexe
    if (mcLignes.length) {
      out += t("secours.mc.titreRapport", { n: mcLignes.length }) + "\n";
      mcLignes.forEach(function(l) { out += "  " + l + "\n"; });
      out += "\n";
    }

    out += sep + "\n";
    out += t("secours.txt.genereePar", { version: (r.appVersion || "") }) + "\n";
    out += "© 2026 Flavien VIDAL · CC BY-NC-SA 4.0\n";
    return out;
  }

  function _formatRoleLabel(scope) {
    if (scope === "operateur")  return t("secours.roleLabel.operateur");
    if (scope === "equipe")     return t("secours.roleLabel.equipe");
    if (scope === "secouriste") return t("secours.roleLabel.secouriste");
    return "(?)";
  }

  // Un rapport (JSON ou PDF) sorti de l'appareil lève la protection FIFO d'une intervention terminée. Rien à
  // marquer si elle est en cours.
  function _marquerRapportExporte(r) {
    const s = r && r.scenario ? get(r.scenario.id) : null;
    if (!s || !s.execution || !s.execution.endedAt) return;
    s.execution.rapportExporteAt = _nowIso();
    _saveScenarios();
  }

  // .mkmsec.report.json téléchargé (photos en base64 si demandées : autonome mais volumineux). Rend le nom de
  // fichier ou null.
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

  // Copie le rapport texte au presse-papier via le helper commun (utils.js : navigator.clipboard,
  // repli execCommand en HTTP local). Retourne Promise<boolean> ; le toast reste chez l'appelant.
  function copierRapportTexte(reportData) {
    const text = genererRapportTexte(reportData);
    if (!text) return Promise.resolve(false);
    return window.ktaCopierTexte(text);
  }

  // ── Vue OSM depuis le Mode Secours ─────────────────────────────────
  // Bouton des bandeaux PLAN ACTIF / PLAN TERMINÉ : réutilise window.OsmView (opt-in, navigation privée, en
  // ligne, modale plein écran, POI/tracés/zones projetés). Indisponible → toast qui dit pourquoi
  // (calibrage GPS manquant, opt-in désactivé, mode bloqué).
  function _ouvrirVueOsmDepuisSecours() {
    if (!window.OsmView || typeof window.OsmView.open !== "function") {
      _toast(t("secours.osm.nonDisponible"), "warn");
      return;
    }
    // Diagnostic : OsmView.isAvailable() ne rend qu'un booléen, on inspecte les raisons une à une.
    const reasons = [];
    try {
      // Plan géoréférencé requis (PLAN_CONFIG.plan.georef ou session dérivée).
      const planCfg  = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
      const hasInline = !!(planCfg && planCfg.georef
        && planCfg.georef.pointA && planCfg.georef.pointB);
      // La session est lue par OsmView.isAvailable (pas de logique dupliquée) ; sans georef inline ni session
      // valide, on nomme la raison.
      if (!hasInline && (!window.OsmView.isAvailable || !window.OsmView.isAvailable())) {
        // Les autres cas (opt-in, navigation privée, en ligne) sont tranchés par OsmView.isAvailable.
        reasons.push(t("secours.osm.raisonGeoref"));
      }
      if (window.OsmView.isOptedIn && typeof window.OsmView.isOptedIn === "function"
          && !window.OsmView.isOptedIn()) {
        reasons.push(t("secours.osm.raisonOptin"));
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
    try {
      window.OsmView.open();
    } catch(e) {
      console.warn("[secoursMode] Ouverture Vue OSM échouée :", e);
      _toast(t("secours.osm.erreurOuverture"), "error");
    }
  }

  // ── Modale du rapport ───────────────────────────────────────────────
  // « Rapport au fil des étapes » : aperçu compact + 3 formats. Scope donné par l'appelant (vue Live ou
  // bandeau Édition).
  function _afficherModaleRapport(scenarioId, scope) {
    const s = get(scenarioId);
    if (!s) return;
    if (!s.execution) {
      _toast(t("secours.toast.aucunPlanLance"), "warn");
      return;
    }
    const existing = document.getElementById("kta-secours-rapport-modale");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

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

    // Photos présentes ? (information de la case à cocher)
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
      '<div class="kta-readme-modal-boite kta-secours-rapport-boite" style="max-width:540px; height:auto; max-height:90vh; border-left:6px solid var(--kta-interaction);">' +
        '<div class="kta-readme-modal-header">' +
          '<h2 class="kta-tx-info" style="margin:0; color:var(--kta-interaction);">📤 ' + _escHtml(apercuTitre) + '</h2>' +
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

          // Chaque format : icône (flex-shrink:0) + colonne (flex:1, min-width:0) libellé puis description — en
          // ligne, un libellé long (« .mkmsec.report.json ») et sa description se chevaucheraient.
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
          '</div>' +


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

    // Génère les données puis appelle le format demandé.
    function _handleExport(formatType) {
      // Les 3 boutons d'export sont désactivés pendant la génération (async et lourde) : sinon un double clic,
      // ou un clic sur un AUTRE format, lance plusieurs exports concurrents.
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
          // genererRapportPDF est async (mini-carte par équipe).
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
        // Pas de _restoreBtns() : _close() retire l'overlay et ses boutons.
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

    document.addEventListener("keydown", _onKey);
    document.body.appendChild(overlay);
  }

  // PDF du rapport (jsPDF), async (mini-cartes : rendu canvas du plan). Rend le nom de fichier ou null.
  // Mise en page : page 1 briefing (en-tête, scénario, plan, rôle, durée, dates), page briefing surface, puis
  // par équipe une page d'étapes, une mini-carte paysage et une page de photos s'il y en a ; en mode
  // secouriste, les notes libres chronologiques (+ photos). Main courante en annexe.
  // ⚠️ Pas d'emoji dans pdf.text() (Helvetica latin1 → mojibake) ; les emojis ne vont que dans les textes
  // canvas/Blob.
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

      // ── Page 1 : briefing global ──
      _drawRapportPDFHeader(pdf, r, pageW, margin);
      let y = margin + 30;

      pdf.setFontSize(11); pdf.setFont(undefined, "bold");
      pdf.text(t("secours.pdf.contexte"), margin, y); y += 6;
      pdf.setFontSize(9); pdf.setFont(undefined, "normal");
      pdf.text(t("secours.pdf.scenario", { nom: _pdfLibre(r.scenario.nom, t("secours.pdf.sansNom")) }),
               margin, y); y += 4;
      pdf.text(t("secours.pdf.plan", { plan: _pdfLibre(r.plan && r.plan.name, "(?)") }), margin, y); y += 4;
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
        y = _pdfWrapText(pdf, window.ktaTextePdf(r.scenario.context.notes), margin, y, pageW - 2 * margin, 4);
      }
      const victimesPdf = _victimesDuRapport(r);   
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

      // Page « Briefing surface » (partagée avec genererBriefingPompiersPDF), juste après le briefing global,
      // textes adaptés au rapport (overlayContext = "rapport").
      try {
        pdf.addPage();
        // 🩸 r.scenario n'est qu'un en-tête (sans équipes) : on passe le scénario stocké, sinon la page annonce
        // « aucune équipe définie ».
        await _drawBriefingSurfacePage(pdf, (r.scenario && get(r.scenario.id)) || r.scenario, r.plan,
                                       pageW, pageH, margin, null, "rapport");
        _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
      } catch (e) {
        console.warn("[Rapport] Page Briefing surface échouée : " + (e && e.message));
      }

      // ── Pages équipes ou notes libres ──
      if (Array.isArray(r.equipesData) && r.equipesData.length > 0) {
        // Boucle async (mini-carte par équipe) ; chaque mini-carte rend sa seule zone.
        for (let i = 0; i < r.equipesData.length; i++) {
          const ed = r.equipesData[i];
          // 1. Page texte des étapes.
          pdf.addPage();
          _drawRapportPDFEquipeTextePage(pdf, ed, r, pageW, pageH, margin);
          // 2. Mini-carte A4 paysage (si l'équipe a des points, une zone ou un itinéraire). Un échec est ignoré :
          // le PDF reste valide.
          try {
            await _drawRapportPDFEquipeMiniaturePage(pdf, ed, r);
          } catch (e) {
            console.warn("[Rapport] Mini-carte équipe " + (ed.equipe && ed.equipe.nom) + " échouée : " + (e && e.message));
          }
          // 3. Page photos s'il y en a.
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

      // Main courante en annexe (ordre chronologique).
      const mcPdf = _lignesMcRapport(r);
      if (mcPdf.length) {
        pdf.addPage();
        _drawRapportPDFHeader(pdf, r, pageW, margin);
        let ym = margin + 22;
        pdf.setFontSize(12); pdf.setFont(undefined, "bold");
        pdf.text(_stripPourPdf(t("secours.mc.titreRapport", { n: mcPdf.length })), margin, ym); ym += 6;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
        mcPdf.forEach(function(l) {
          pdf.splitTextToSize(_stripPourPdf(l), pageW - 2 * margin).forEach(function(ligne) {
            if (ym > pageH - 18) { _drawRapportPDFFooter(pdf, r, pageW, pageH, margin); pdf.addPage(); _drawRapportPDFHeader(pdf, r, pageW, margin); ym = margin + 22; pdf.setFontSize(9); pdf.setFont(undefined, "normal"); }
            pdf.text(ligne, margin, ym); ym += 4;
          });
        });
        _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
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

  // ── Capture OSM pour le briefing pompiers ──────────────────────────
  // Vue OSM ouverte sous un overlay opaque puis capturée (html2canvas), sinon repli offscreen (tuiles OSM +
  // rectangle du plan + équipes GPS). Rend null si html2canvas manque, sans géoréférencement ou en cas
  // d'exception : _drawBriefingSurfacePage retombe alors sur le texte et les liens.
  // Thème clair actif ? (cf themeManager.js), pour les styles inline des overlays.
  function _isLightTheme() {
    try {
      return document.body.classList.contains("kta-theme-light") ||
             document.documentElement.classList.contains("kta-theme-light");
    } catch(e) { return false; }
  }

  // Dimensions natives d'une dataURL image ({w, h} ou null), pour garder le ratio dans pdf.addImage.
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

  // Applique les options de couches sur les cases du bandeau Vue OSM (clic simulé seulement si l'état
  // diffère : idempotent).
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

    // Textes de l'overlay selon l'appelant : "briefing" (défaut, bouton Briefing pompiers) ou "rapport".
    const _ctx = (overlayContext === "rapport")
      ? { icon: "📤", title: t("secours.capture.rapportTitle"),
          sub: t("secours.capture.rapportSub") }
      : { icon: "🚒", title: t("secours.capture.briefingTitle"),
          sub: t("secours.capture.briefingSub") };

    // Ouvrir puis fermer la Vue OSM sous un overlay opaque : la capture du DOM Leaflet a tout (plan orienté,
    // calques, zones, tracés, équipes) sans dupliquer le code de la Vue OSM, et l'utilisateur ne la voit
    // jamais clignoter (juste « Génération en cours… »).
    // Cas 1 : Vue OSM DÉJÀ ouverte → capture directe (on respecte les filtres de l'utilisateur).
    // Cas 2 : fermée (cas normal) → overlay, ouverture derrière, attente des tuiles, capture, fermeture.

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
        // Sinon : ouverture masquée ci-dessous.
      }
    }

    // Cas 2 : Vue OSM fermée → ouverte sous overlay opaque.
    if (!window.OsmView || typeof window.OsmView.open !== "function") {
      console.warn("[Briefing] OsmView.open indisponible — fallback offscreen");
    } else if (!window.OsmView.isAvailable || !window.OsmView.isAvailable()) {
      console.warn("[Briefing] OsmView non disponible (pas de georef ?) — fallback offscreen");
    } else if (!window.OsmView.isOptedIn || !window.OsmView.isOptedIn()) {
      console.warn("[Briefing] OsmView pas opt-in — fallback offscreen (user doit accepter OSM 1×)");
    } else {
      const isLightOv = _isLightTheme();
      const ovBg     = isLightOv ? "#fdf8eb" : "#0a0d18";
      const ovAccent = isLightOv ? "#b8860b" : "#f4c542";
      const ovMuted  = isLightOv ? "#6b6354" : "#8892a4";

      // Overlay opaque au-dessus des modales (99999) et de la Vue OSM.
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
        '<div class="kta-charge-tourne" style="font-size:42px;animation:kta-spin 1.4s linear infinite;">🛰️</div>' +
        '<div style="font-weight:700;">' + _ctx.icon + ' ' + _escHtml(_ctx.title) + '</div>' +
        '<div style="font-size:12px;color:' + ovMuted + ';max-width:340px;text-align:center;">' +
          _escHtml(_ctx.sub) +
        '</div>';
      if (!document.getElementById("kta-briefing-spin-kf")) {
        const st = document.createElement("style");
        st.id = "kta-briefing-spin-kf";
        st.textContent = "@keyframes kta-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }";
        document.head.appendChild(st);
      }
      document.body.appendChild(overlay);

      let captured = null;
      try {
        // Ouvre la Vue OSM sous l'overlay (invisible pour l'utilisateur).
        window.OsmView.open();

        // Options de couches : 400 ms d'attente, le temps qu'OsmView.open() injecte ses cases, puis clics simulés.
        if (options) {
          await new Promise(function(r) { setTimeout(r, 400); });
          try { _applyOsmLayerOptions(options); }
          catch(e) { console.warn("[Briefing] _applyOsmLayerOptions échec :", e.message); }
        }

        // Attente : tuiles chargées + plan orienté rendu + petit délai.
        await new Promise(function(resolve) {
          const startedAt = Date.now();
          const tick = function() {
            const map = document.getElementById("kta-osm-map");
            if (map) {
              const hasTiles    = !!map.querySelector(".leaflet-tile-loaded");
              const hasOverlay  = !!map.querySelector(".leaflet-image-layer, .leaflet-overlay-pane svg path, .leaflet-marker-icon");
              if (hasTiles && hasOverlay) {
                // +1,5 s pour le rendu final (marqueurs, polylignes).
                setTimeout(resolve, 1500);
                return;
              }
              if (hasTiles && (Date.now() - startedAt > 4000)) {
                // Tuiles là mais pas d'overlay après 4 s : on capture quand même (plan peut-être sans calques).
                setTimeout(resolve, 800);
                return;
              }
            }
            // Sécurité : 12 s.
            if (Date.now() - startedAt > 12000) { resolve(); return; }
            setTimeout(tick, 200);
          };
          tick();
        });

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
        // Ferme la Vue OSM quel que soit le résultat.
        try { window.OsmView.close && window.OsmView.close(); } catch(e) {}
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }

      if (captured) return captured;
      // Sinon : repli offscreen ci-dessous.
    }

    // Repli offscreen : tuiles OSM + rectangle du plan + équipes GPS, sans plan orienté ni POI/tracés/zones.
    // Pour une capture complète, ouvrir la Vue OSM AVANT le briefing.
    if (!window.OsmView || typeof window.OsmView.getPlanGpsBbox !== "function") {
      return null;
    }
    const bbox = window.OsmView.getPlanGpsBbox();
    if (!bbox || typeof bbox.getCenter !== "function") {
      console.warn("[Briefing] Pas de bbox georef — capture skip");
      return null;
    }

    const cont = document.createElement("div");
    cont.style.cssText = "position:fixed;left:-99999px;top:0;width:1200px;height:800px;background:#fff;z-index:-1;pointer-events:none;"; // couleur-inline-ok : rendu hors écran exporté en image, hors thème
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

      // Rectangle du plan (jaune charte semi-transparent).
      L.rectangle(bbox, {
        color: "#f4c542",
        weight: 3,
        fillColor: "#f4c542",
        fillOpacity: 0.15,
        interactive: false
      }).addTo(map);

      const center = bbox.getCenter();
      const planName = (plan && plan.name) || "Site";
      L.marker(center, {
        icon: L.divIcon({
          className: "",
          // Couleurs portées par la classe : suit le thème clair (style-secours.css).
          html: '<div class="kta-secours-osm-etiquette">📍 ' + _escHtml(planName) + '</div>',
          iconSize: [10, 10],
          iconAnchor: [60, 5]
        }),
        interactive: false
      }).addTo(map);

      // Marqueurs GPS de surface des équipes.
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
                html: '<div style="background:' + hex + ';color:#fff;' + // couleur-inline-ok : étiquette de carte, blanc sur la couleur de l'équipe
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

      // Attente des tuiles (événement « load » + 600 ms de rendu), sécurité 7 s pour un réseau mobile lent.
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

  // ── Briefing surface (page PDF partagée) ───────────────────────────
  // Page A4 : carte et tableau des accès, capture OSM (briefing seulement), infos, liens OSM et Google Maps,
  // équipes avec leur GPS de surface, POI critiques (accès ouverts puis fermés).
  // Utilisée par genererRapportPDF (rapport post-mission) et genererBriefingPompiersPDF (PDF dédié).
  // ⚠️ Helvetica latin1 : pas d'emoji dans pdf.text().
  // `options` pilote les couches OSM ; `overlayContext` ("briefing" | "rapport") adapte les textes de
  // l'overlay de capture.
  async function _drawBriefingSurfacePage(pdf, scenario, plan, pageW, pageH, margin, options, overlayContext) {
    let y = margin + 8;

    pdf.setFontSize(15); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.surf.titre"), margin, y); y += 7;
    pdf.setFontSize(9); pdf.setFont(undefined, "italic"); pdf.setTextColor(120);
    pdf.text(t("secours.surf.sousTitre"), margin, y);
    pdf.setTextColor(0); pdf.setFont(undefined, "normal"); y += 8;

    // Ce qu'un pompier cherche en surface : OÙ engager chaque équipe. Carte des accès (tirée du plan, hors
    // ligne) + tableau GPS/liens en tête de page — le plan entier sur un A4 serait illisible.
    y = await _dessinerAccesSurface(pdf, scenario, y, pageW, pageH, margin);

    // Capture OSM (options { showPlan, showPoi, … }) : pas dans le rapport (la carte des accès la remplace) ;
    // dans le briefing, après les accès, sur sa propre page si la place manque. Échec → mise en page texte.
    if (overlayContext !== "rapport") try {
      if (y > pageH * 0.45) { pdf.addPage(); y = margin + 8; }
      const imgData = await _captureOsmCanvasForBriefing(scenario, plan, options, overlayContext);
      if (imgData) {
        // Ratio réel de l'image capturée : un ratio figé (3:2) déformerait une capture de la modale (16:9,
        // mobile…). Vaut pour la capture offscreen (1200×800) comme pour le DOM.
        const realDims = await _getImageDataUrlDims(imgData);
        const ratio = (realDims && realDims.w > 0 && realDims.h > 0)
                      ? (realDims.w / realDims.h)
                      : (1200 / 800);  // fallback ratio offscreen

        const availW = pageW - 2 * margin;                // largeur dispo
        const availH = pageH - y - 80;                    // garde 80mm pour reste
        // On contraint la largeur OU la hauteur, selon la première atteinte.
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

    // ── Infos ──
    pdf.setFontSize(11); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.surf.infos"), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");
    pdf.text(t("secours.surf.scenario", { nom: _pdfLibre(scenario && scenario.nom, t("secours.pdf.sansNom")) }),
             margin, y); y += 4;
    pdf.text(t("secours.surf.plan", { plan: _pdfLibre(plan && plan.name, t("secours.surf.planNonRenseigne")) }),
             margin, y); y += 4;
    pdf.text(t("secours.surf.genereLe", { date: new Date().toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }), margin, y); y += 6;

    // ── Localisation (liens OSM + Google Maps) ──
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

      const osmUrl = "https://www.openstreetmap.org/?mlat=" + latStr
                   + "&mlon=" + lngStr + "#map=16/" + latStr + "/" + lngStr;
      pdf.setTextColor(60, 110, 220);
      pdf.textWithLink(t("secours.surf.lienOsm"), margin + 4, y,
                       { url: osmUrl }); y += 4;
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

    // ── Équipes + GPS de surface ──
    pdf.setFontSize(11); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.surf.equipesSurPlace"), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");
    const groupes = (scenario && Array.isArray(scenario.groupes)) ? scenario.groupes : [];
    // Sans GPS de surface, on renvoie au numéro d'accès du tableau plutôt qu'écrire « non renseigné » sous
    // le GPS de cet accès.
    const numAcces = {};
    _accesSurface(scenario).forEach(function(a, i) {
      a.equipes.forEach(function(g) { (numAcces[g.id] = numAcces[g.id] || []).push(i + 1); });
    });
    if (groupes.length === 0) {
      pdf.setTextColor(120); pdf.setFont(undefined, "italic");
      pdf.text(t("secours.surf.aucuneEquipe"), margin, y);
      pdf.setTextColor(0); pdf.setFont(undefined, "normal"); y += 6;
    } else {
      groupes.forEach(function(g) {
        if (y > pageH - 25) { pdf.addPage(); y = margin + 8; }
        pdf.setFont(undefined, "bold");
        pdf.text("- " + _pdfLibre(g.nom, t("secours.surf.equipeDefaut")), margin, y); y += 4;
        pdf.setFont(undefined, "normal");
        const membresStr = _pdfLibre((Array.isArray(g.membres) && g.membres.length > 0) ? g.membres.join(", ") : "",
                                     t("secours.surf.membresNonRenseignes"));
        pdf.text(t("secours.surf.membresLigne", { membres: membresStr }), margin + 2, y); y += 4;
        pdf.text(t("secours.pdf.chefEffectif", { chef: _pdfLibre(_chef(g), t("secours.pdf.nonRenseigne")),
                                                 effectif: _effectif(g) || t("secours.pdf.nonRenseigne") }), margin + 2, y); y += 4;
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
        } else if (numAcces[g.id]) {
          pdf.text(t("secours.surf.voirAcces", { n: numAcces[g.id].join(", ") }), margin + 2, y); y += 4;
        } else {
          pdf.setTextColor(150); pdf.setFont(undefined, "italic");
          pdf.text(t("secours.surf.gpsNonRenseigne"), margin + 2, y); y += 4;
          pdf.setTextColor(0); pdf.setFont(undefined, "normal");
        }
        y += 1;
      });
    }
    y += 4;

    // ── POI critiques ──
    if (y > pageH - 50) { pdf.addPage(); y = margin + 8; }
    pdf.setFontSize(11); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.surf.poiCritiques"), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");

    // 🩸 Sources des POI : session + calques du plan (comme `sortieUrgence.js`), champ `tags[]` (pas `p.tag`),
    // jamais `window.listePoints` (un `let` d'editor.js, absent de `window`). Accès OUVERTS d'abord (mêmes
    // tags que la Sortie d'urgence), puis FERMÉS — que pompiers ou exploitant peuvent ouvrir. Un POI n'apparaît
    // qu'une fois.
    const critTags = CRIT_TAGS;
    const critLabels = _critLabels();
    const critByTag = {};
    _poisAcces().forEach(function(a) {
      if (!critByTag[a.tag]) critByTag[a.tag] = [];
      critByTag[a.tag].push(a.p);
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
        pdf.text("  - " + _pdfLibre(p.nom || p.id, t("secours.pdf.sansNom")) + lvl, margin, y); y += 4;
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

  // Options AVANT le PDF Briefing : couches Vue OSM à inclure (Plan / POI / Tracé / Routes / Iti / Zones /
  // Struct / Secours), comme dans le bandeau Vue OSM. « Générer » → genererBriefingPompiersPDF(scenarioId,
  // options).
  function _afficherModaleBriefingOptions(scenarioId) {
    const s = get(scenarioId);
    if (!s) { _toast(t("secours.toast.scenarioIntrouvableAscii"), "error"); return; }

    const existing = document.getElementById("kta-briefing-options-modal");
    if (existing) existing.remove();


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
        '</div>' +
      '</div>' +
      '<div style="background:' + pal.sectionBg + ';border-radius:8px;padding:14px 16px;margin-bottom:14px;">' +
        '<div style="font-size:13px;font-weight:600;color:' + pal.sectionTitle + ';margin-bottom:10px;">' + t("secours.briefing.couchesTitre") + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px;">' +
          _renderToggleOpt("opt-plan",    t("secours.briefing.optPlan"),    true) +
          _renderToggleOpt("opt-poi",     t("secours.briefing.optPoi"),     false) +   // tous les POI : illisible
          _renderToggleOpt("opt-tracker", t("secours.briefing.optTracker"), true) +
          _renderToggleOpt("opt-road",    t("secours.briefing.optRoad"),    true) +
          _renderToggleOpt("opt-iti",     t("secours.briefing.optIti"),     true) +
          _renderToggleOpt("opt-zone",    t("secours.briefing.optZone"),    true) +
          _renderToggleOpt("opt-struct",  t("secours.briefing.optStruct"),  true) +
          _renderToggleOpt("opt-secours", t("secours.briefing.optSecours"), true) +
        '</div>' +
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
      // Bouton désactivé AVANT la génération (html2canvas + jsPDF, plusieurs secondes) : un double clic
      // lancerait deux générations qui se marchent dessus sur le canvas (+ double téléchargement).
      const btnGen = this;
      btnGen.disabled = true;
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
      // L'overlay est déjà retiré : la désactivation ne couvre que l'intervalle clic → overlay.remove(), ce qui
      // suffit.
      genererBriefingPompiersPDF(scenarioId, opts);
    });
    // Clic sur le fond = Annuler.
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  function _renderToggleOpt(id, label, checked) {
    return '<label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;user-select:none;padding:4px 0;">' +
             '<input type="checkbox" id="kta-bo-' + id + '"' + (checked ? " checked" : "") + ' style="margin:0;cursor:pointer;">' +
             _escHtml(label) +
           '</label>';
  }

  // PDF « Briefing pompiers » dédié (la page Briefing surface seule), bouton [data-action="briefing-pompiers"].
  // `options` : { showPlan, showPoi, showTracker, showRoad, showIti, showZone, showStruct, showSecours },
  // transmises à la capture OSM via _drawBriefingSurfacePage.
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
      // 🩸 APP_CONFIG.name n'existe pas (donnerait « Plan : (plan) ») : nom lu dans PLAN_CONFIG.
      const planMeta = {
        name: (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name)
              || (window.APP_CONFIG && window.APP_CONFIG.name) || "(plan)"
      };
      await _drawBriefingSurfacePage(pdf, s, planMeta, pageW, pageH, margin, options, "briefing");
      // Pied de page minimal (_drawRapportPDFFooter exige un reportData complet).
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

  // POI d'accès du plan (session + calques), classés par tag — mêmes tags que la
  // Sortie d'urgence. Partagé par « POI critiques » et « Accès surface ».
  const CRIT_TAGS = ["entree_plan", "cao", "peo", "eso", "caf", "pef", "esf", "psf"];
  const CRIT_FERMES = ["caf", "pef", "esf", "psf"];
  function _critLabels() {
    return {
      entree_plan: t("secours.surf.critEntree"), cao: t("secours.surf.critCao"), peo: t("secours.surf.critPeo"),
      eso: t("secours.surf.critEso"), caf: t("secours.surf.critCaf"), pef: t("secours.surf.critPef"),
      esf: t("secours.surf.critEsf"), psf: t("secours.surf.critPsf")
    };
  }
  function _poisAcces() {
    const ALIAS_ENTREE = ["entree_plan", "entrée", "entree"];
    const vus = {};
    return [].concat(
      (typeof window.getEditorPoints === "function" ? window.getEditorPoints() : []) || [],
      (typeof window.getAllEmbeddedPoints === "function" ? window.getAllEmbeddedPoints() : []) || []
    ).map(function(p) {
      if (!p || !Array.isArray(p.tags) || typeof p.x !== "number") return null;
      const tags = p.tags.map(function(x) { return String(x || "").trim().toLowerCase(); });
      const tg = tags.some(function(x) { return ALIAS_ENTREE.indexOf(x) >= 0; }) ? "entree_plan"
               : CRIT_TAGS.find(function(c) { return tags.indexOf(c) >= 0; });
      if (!tg) return null;
      const k = p.id || (Math.round(p.x) + "," + Math.round(p.y));
      if (vus[k]) return null;
      vus[k] = true;
      return { p: p, tag: tg };
    }).filter(Boolean);
  }

  // ── Découper en secteurs ────────────────────────────────────────────
  // N équipes « Secteur k » d'un coup : zone « tracés » (chaque tracé va au secteur qui en porte le plus),
  // entrée = sortie = accès OUVERT le plus proche par les galeries. Niveau : celui du secteur s'il n'en couvre qu'un,
  // sinon aucun (tous niveaux, `zoneTousNiveaux`) — 🩸 le niveau dominant annonçait « RDC » une équipe qui
  // descend. Les
  // équipes existantes ne sont jamais touchées. Un seul découpage sur tout le réseau, jonctions comprises
  // (décision produit). Calcul : js/secoursBalayage.js (garde-fou check-secours-balayage.js).
  async function _decouperEnSecteurs(sid) {
    const s = get(sid);
    if (!s || !window.SecoursBalayage || !window.Pathfinder) return;
    const opts = { titre: t("secours.secteurs.titre"), okLabel: t("secours.secteurs.ok"),
      nombre: { label: t("secours.secteurs.combien"), valeur: 6, min: 2, max: 20 } };
    const msg = t("secours.secteurs.confirm") +
      (s.groupes.length ? "\n\n" + t("secours.secteurs.existantes", { n: s.groupes.length }) : "");
    if (!(await window.ktaConfirm(msg, opts))) return;
    const n = Math.max(2, Math.min(20, Math.round(Number(opts.nombre.valeur) || 6)));
    _toast(t("secours.secteurs.calcul"), "info");
    await new Promise(function(r) { setTimeout(r, 30); });   // laisser le toast s'afficher
    const SB = window.SecoursBalayage;
    const graph = window.Pathfinder.buildNetworkGraph({ includeZones: true });
    const acces = _poisAcces().filter(function(a) { return CRIT_FERMES.indexOf(a.tag) < 0; });
    const D = SB.decouper(graph, { n: n, departs: acces.map(function(a) { return { x: a.p.x, y: a.p.y }; }) });
    if (!D.secteurs.length) { _toast(t("secours.secteurs.aucun"), "warn"); return; }
    const P = SB.pieces(graph);
    // Chaque tracé → le secteur qui en porte la plus grande longueur.
    const parTrace = {};
    D.secteurs.forEach(function(x, si) {
      x.pieces.forEach(function(pi) {
        const k = _cleTrace(graph.segments[P[pi].seg].road);
        if (!k) return;
        const e = parTrace[k] = parTrace[k] || {};
        e[si] = (e[si] || 0) + P[pi].len;
      });
    });
    const traces = D.secteurs.map(function() { return []; });
    Object.keys(parTrace).forEach(function(k) {
      let best = -1, bl = -1;
      Object.keys(parTrace[k]).forEach(function(si) { if (parTrace[k][si] > bl) { bl = parTrace[k][si]; best = Number(si); } });
      if (best >= 0) traces[best].push(k);
    });
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    D.secteurs.forEach(function(x, si) {
      const parNiv = {};
      x.pieces.forEach(function(pi) {
        const l = graph.segments[P[pi].seg].level;
        if (Number.isInteger(l)) parNiv[l] = (parNiv[l] || 0) + P[pi].len;
      });
      let niv = null, nl = -1;
      Object.keys(parNiv).forEach(function(l) { if (parNiv[l] > nl) { nl = parNiv[l]; niv = Number(l); } });
      const plusieurs = _mlvlActif() && Object.keys(parNiv).length > 1;
      const g = addGroupe(sid, t("secours.secteurs.nom", { n: si + 1 }), (_mlvlActif() && !plusieurs) ? niv : null);
      if (!g) return;
      const a = x.acces >= 0 ? acces[x.acces] : null;
      const point = function() {
        return { x: a.p.x, y: a.p.y, level: Number.isInteger(a.p.level) ? a.p.level : niv,
                 pointId: a.p.id || null, pointUid: a.p.uid || null, label: a.p.nom || null };
      };
      // `niv` (dominant) ne sert plus qu'à l'accès sans niveau propre.
      const partiel = { zoneType: "roads", zoneRoadIds: traces[si], parcoursMode: "complet" };
      // 🩸 addGroupe remplace un niveau absent par le niveau AFFICHÉ (souvent le RDC) : on l'efface ici.
      if (plusieurs) { partiel.zoneTousNiveaux = true; partiel.level = null; }
      if (a) { partiel.entree = point(); partiel.sortie = point(); }
      updateGroupe(sid, g.id, partiel);
      if (a) _appliquerBalayage(sid, g.id, { silencieux: true });
    });
    const fmt = function(px) { return (typeof window.formatDistance === "function") ? window.formatDistance(px / pxParM, 1) : Math.round(px / pxParM) + " m"; };
    const lg = D.secteurs.map(function(x) { return x.longueur; });
    const lignes = [t("secours.secteurs.fait", { n: D.secteurs.length,
      min: fmt(Math.min.apply(null, lg)), max: fmt(Math.max.apply(null, lg)) })];
    const hors = D.horsReseau.reduce(function(tt, i) { return tt + P[i].len; }, 0);
    if (hors > 0) lignes.push(t("secours.secteurs.horsReseau", { long: fmt(hors) }));
    if (!acces.length) lignes.push(t("secours.secteurs.sansAcces"));
    else if (acces.length === 1) lignes.push(t("secours.secteurs.unAcces"));
    _toast(lignes.join("\n"), lignes.length > 1 ? "warn" : "info");
    if (_modal) _switchView("edit");
    if (_overlayLayer) renderOverlay(sid);
  }

  // ── Accès surface ───────────────────────────────────────────────────
  // Entrées/sorties des équipes, dédoublonnées (même accès = _memeAcces) :
  // [{ pt, nom, equipes: [g], entree: bool, sortie: bool }].
  function _accesSurface(s) {
    const acces = [];
    ((s && s.groupes) || []).forEach(function(g) {
      [["entree", g.entree], ["sortie", g.sortie]].forEach(function(p) {
        const w = p[1];
        if (!w || typeof w.x !== "number" || typeof w.y !== "number") return;
        let a = acces.find(function(x) { return _memeAcces(x.pt, w); });
        if (!a) { a = { pt: w, nom: null, equipes: [], entree: false, sortie: false }; acces.push(a); }
        if (!a.nom && w.label) a.nom = w.label;
        if (a.equipes.indexOf(g) < 0) a.equipes.push(g);
        a[p[0]] = true;
      });
    });
    // Un accès posé à la main (« Accès sans nom ») est souvent un accès du plan : le POI d'accès à moins de
    // 15 m (même niveau) donne son nom, son type et son état — « escalier fermé » = à ouvrir par la surface.
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    const pois = _poisAcces();
    acces.forEach(function(a) {
      let best = null, bestD = 15 * pxParM;
      pois.forEach(function(c) {
        if (Number.isInteger(a.pt.level) && Number.isInteger(c.p.level) && a.pt.level !== c.p.level) return;
        const d = Math.hypot(c.p.x - a.pt.x, c.p.y - a.pt.y);
        if (d <= bestD) { bestD = d; best = c; }
      });
      a.poi = best;
    });
    return acces;
  }
  // Accès du scénario comme candidats d'évacuation (SortieUrgence, `sortiesSupp`).
  function _sortiesScenario(s) {
    return _accesSurface(s).map(function(a, i) {
      const ferme = !!(a.poi && CRIT_FERMES.indexOf(a.poi.tag) >= 0);
      const nom = (a.nom || (a.poi && a.poi.p.nom) || t("secours.acces.accesN", { n: i + 1 })) +
                  " (" + a.equipes.map(function(g) { return g.nom; }).join(", ") + ")" +
                  (ferme ? " — " + t("secours.acces.aOuvrir") : "");
      return { x: a.pt.x, y: a.pt.y, level: Number.isInteger(a.pt.level) ? a.pt.level : undefined, nom: nom, tags: [] };
    });
  }
  // Carte des accès (recadrée sur eux, sans POI) + tableau. Rend le nouveau y.
  async function _dessinerAccesSurface(pdf, s, y, pageW, pageH, margin) {
    const acces = _accesSurface(s);
    pdf.setFontSize(11); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.acces.titre"), margin, y); y += 5;
    pdf.setFontSize(8.5); pdf.setFont(undefined, "italic"); pdf.setTextColor(110);
    pdf.text(t("secours.acces.sousTitre"), margin, y); y += 5;
    pdf.setTextColor(0); pdf.setFont(undefined, "normal");
    if (!acces.length) {
      pdf.setFontSize(9); pdf.text(t("secours.acces.aucun"), margin, y);
      return y + 8;
    }
    try {
      const img = await _canvasAcces(s, acces);
      if (img) {
        const availW = pageW - 2 * margin, maxH = Math.min(120, pageH - y - 70);
        let w = availW, h = w * img.height / img.width;
        if (h > maxH) { h = maxH; w = h * img.width / img.height; }
        const x = margin + (availW - w) / 2;
        pdf.addImage(img.toDataURL("image/jpeg", 0.85), "JPEG", x, y, w, h);
        pdf.setDrawColor(150); pdf.rect(x, y, w, h);
        y += h + 5;
      }
    } catch (e) { console.warn("[Briefing] carte des accès :", e && e.message); }
    const cols = [margin, margin + 9, margin + 70, margin + 130];
    const ligneEntete = function() {
      pdf.setFontSize(8.5); pdf.setFont(undefined, "bold");
      pdf.text(t("secours.acces.colN"), cols[0], y);
      pdf.text(t("secours.acces.colAcces"), cols[1], y);
      pdf.text(t("secours.acces.colEquipes"), cols[2], y);
      pdf.text(t("secours.acces.colGps"), cols[3], y);
      pdf.setFont(undefined, "normal");
      pdf.setDrawColor(180); pdf.line(margin, y + 1.5, pageW - margin, y + 1.5);
      y += 5;
    };
    ligneEntete();
    let sansGps = false;
    acces.forEach(function(a, i) {
      const role = a.entree && a.sortie ? t("secours.acces.entreeSortie")
                 : a.entree ? t("secours.acces.entree") : t("secours.acces.sortie");
      const lbl = _critLabels();
      const nomPoi = a.poi ? (a.poi.p.nom || "") : "";
      const typePoi = a.poi ? lbl[a.poi.tag] + (CRIT_FERMES.indexOf(a.poi.tag) >= 0 ? " — " + t("secours.acces.aOuvrir") : "") : "";
      const nom = _stripPourPdf((a.nom || nomPoi || t("secours.acces.sansNom")) + " — " + role + (typePoi ? " · " + typePoi : ""));
      const eq = _stripPourPdf(a.equipes.map(function(g) { return g.nom; }).join(", "));
      const lNom = pdf.splitTextToSize(nom, cols[2] - cols[1] - 2);
      const lEq = pdf.splitTextToSize(eq, cols[3] - cols[2] - 2);
      const hLigne = Math.max(lNom.length, lEq.length, 1) * 3.6 + 1.5;
      if (y + hLigne > pageH - 12) { pdf.addPage(); y = margin + 8; ligneEntete(); }
      pdf.setFont(undefined, "bold"); pdf.text(String(i + 1), cols[0], y); pdf.setFont(undefined, "normal");
      pdf.text(lNom, cols[1], y);
      pdf.text(lEq, cols[2], y);
      const ll = _gpsDe(a.pt.x, a.pt.y);
      if (ll) {
        const lat = ll.lat.toFixed(6), lng = ll.lng.toFixed(6);
        pdf.text(ll.lat.toFixed(5) + ", " + ll.lng.toFixed(5), cols[3], y);
        pdf.setTextColor(60, 110, 220);
        pdf.textWithLink(t("secours.acces.lien"), cols[3], y + 3.6,
          { url: "https://www.openstreetmap.org/?mlat=" + lat + "&mlon=" + lng + "#map=19/" + lat + "/" + lng });
        pdf.setTextColor(0);
      } else { pdf.text("—", cols[3], y); sansGps = true; }
      y += Math.max(hLigne, ll ? 8.2 : 0);
    });
    if (sansGps) {
      pdf.setFontSize(8); pdf.setTextColor(140); pdf.text(t("secours.acces.sansGeoref"), margin, y); pdf.setTextColor(0);
      y += 4;
    }
    return y + 4;
  }
  // Rendu : le plan recadré sur les accès (+ marge), zones des équipes en filigrane,
  // un repère numéroté par accès (numéros = lignes du tableau).
  async function _canvasAcces(s, acces) {
    const xs = acces.map(function(a) { return a.pt.x; }), ys = acces.map(function(a) { return a.pt.y; });
    let x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    let y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    // Marge : 12 % de la plus grande dimension, au moins ~150 m autour d'un accès seul.
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    const pad = Math.max((Math.max(x1 - x0, y1 - y0)) * 0.12, 150 * pxParM);
    const rect = _rogner(x0 - pad, y0 - pad, x1 + pad, y1 + pad);
    if (!rect || rect.w < 10 || rect.h < 10) return null;
    // Rendu de la seule région des accès, pleine résolution (cf _rendreRegionPlan).
    const src = await _rendreRegionPlan(rect, 2400);
    if (!src) return null;
    const out = src.canvas;
    x0 = rect.x; y0 = rect.y;
    const sw = rect.w, sh = rect.h;
    const ctx = out.getContext("2d");
    const k = Math.max(1, Math.max(out.width, out.height) / 1000);
    const vers = function(p) { return { x: (p.x - x0) * out.width / sw, y: (p.y - y0) * out.height / sh }; };
    // Zones en filigrane (repère d'orientation, pas le sujet de la page)
    (s.groupes || []).forEach(function(g) {
      if (g.zoneType !== "polygon" || !Array.isArray(g.zonePolygon) || g.zonePolygon.length < 3) return;
      const hex = PALETTE[g.couleurIdx % PALETTE.length].hex, c = _hexToRgb(hex);
      ctx.beginPath();
      g.zonePolygon.forEach(function(p, i) { const q = vers(p); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
      ctx.closePath();
      ctx.fillStyle = "rgba(" + c.r + "," + c.g + "," + c.b + ",0.12)"; ctx.fill();
      ctx.strokeStyle = hex; ctx.lineWidth = 2 * k; ctx.stroke();
    });
    // Accès numérotés, couleur de la 1re équipe
    acces.forEach(function(a, i) {
      const q = vers(a.pt);
      const hex = PALETTE[a.equipes[0].couleurIdx % PALETTE.length].hex;
      ctx.beginPath(); ctx.arc(q.x, q.y, 15 * k, 0, 2 * Math.PI);
      ctx.fillStyle = hex; ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3.5 * k; ctx.stroke();
      ctx.fillStyle = "#ffffff"; ctx.font = "bold " + Math.round(16 * k) + "px Arial, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 3 * k;
      ctx.strokeText(String(i + 1), q.x, q.y); ctx.fillText(String(i + 1), q.x, q.y);
    });
    return out;
  }

  // En-tête commun à toutes les pages du rapport.
  function _drawRapportPDFHeader(pdf, r, pageW, margin) {
    pdf.setTextColor(0);   // sinon gris hérité du pied de page précédent
    pdf.setFontSize(16); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.pdf.headerTitre"), margin, margin + 6);
    pdf.setFontSize(9); pdf.setFont(undefined, "italic"); pdf.setTextColor(120);
    pdf.text(t("secours.pdf.headerSub", { version: (r.appVersion || ""), date: new Date(r.exportedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }),
             margin, margin + 11);
    pdf.setTextColor(0); pdf.setFont(undefined, "normal");
    pdf.setFillColor(244, 197, 66);   // #f4c542
    pdf.rect(margin, margin + 14, pageW - 2 * margin, 1.5, "F");
  }

  function _drawRapportPDFFooter(pdf, r, pageW, pageH, margin) {
    pdf.setFontSize(7); pdf.setTextColor(120);
    const txt = "MyKTAMap " + (r.appVersion || "") +
                " - " + _pdfLibre(r.scenario.nom) +
                " - " + new Date().toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR");
    pdf.text(txt, margin, pageH - 6);
    pdf.setTextColor(0);
  }

  // Section « Signalements hors parcours » : étapes retirées du parcours alors que l'équipe y avait saisi
  // quelque chose. Rend le nouveau y.
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
      pdf.text("  - " + _pdfLibre(_lblEtape(e.label), "(?)") + " : " + _statutLabelPdf(e.statut), margin, y); y += 4;
      pdf.setFont(undefined, "normal");
      if (e.observations && String(e.observations).trim()) {
        const obsE = window.ktaTextePdf(String(e.observations).trim());
        y = _pdfWrapText(pdf, "     " + t("secours.pdf.obsLigne", { obs: obsE }), margin, y, pageW - 2 * margin, 4);
      }
      if (Array.isArray(e.photoIds) && e.photoIds.length > 0) {
        pdf.text("     " + t("secours.pdf.photosAttachees", { n: e.photoIds.length }), margin, y); y += 4;
      }
      y += 2;
    });
    return y;
  }

  // Étapes des phases closes, en version compacte.
  function _pdfSectionHistorique(pdf, ed, r, y, pageW, pageH, margin) {
    (ed && Array.isArray(ed.historique) ? ed.historique : []).forEach(function(h) {
      if (y > pageH - 40) {
        _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
        pdf.addPage(); _drawRapportPDFHeader(pdf, r, pageW, margin); y = margin + 22;
      }
      y += 3;
      pdf.setFontSize(11); pdf.setFont(undefined, "bold");
      pdf.text(t("secours.pdf.historiquePhaseTitre", { phase: _pdfLibre(h.nom), n: h.etapes.length }),
               margin, y); y += 6;
      pdf.setFontSize(9); pdf.setFont(undefined, "normal");
      if (h.parcours && Array.isArray(h.parcours.etapes) && h.parcours.etapes.length) {   
        const dist = (typeof h.parcours.distanceM === "number" && typeof window.formatDistance === "function")
          ? " (" + window.formatDistance(h.parcours.distanceM, 0) + ")" : "";
        pdf.setFont(undefined, "italic");
        y = _pdfWrapText(pdf, _stripPourPdf(t("secours.pdf.parcoursPrevu", { liste: h.parcours.etapes.join(" > ") }) + dist),
                         margin, y, pageW - 2 * margin, 4);
        pdf.setFont(undefined, "normal");
        y += 1;
      }
      h.etapes.forEach(function(et, i) {
        if (y > pageH - 25) {
          _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
          pdf.addPage(); _drawRapportPDFHeader(pdf, r, pageW, margin); y = margin + 22;
        }
        pdf.text("  " + (i + 1) + ". " + _pdfLibre(_lblEtape(et.label), "(?)") + " : " + _statutLabelPdf(et.statut),
                 margin, y); y += 4;
        if (et.observations && String(et.observations).trim()) {
          const obsH = window.ktaTextePdf(String(et.observations).trim());
          y = _pdfWrapText(pdf, "     " + t("secours.pdf.obsLigne", { obs: obsH }), margin, y, pageW - 2 * margin, 4);
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

    pdf.setFontSize(14); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.pdf.equipeTitre", { nom: _pdfLibre(g.nom, t("secours.pdf.equipeDefautAscii")) }),
             margin, y); y += 4;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal"); pdf.setTextColor(100);
    pdf.text(t("secours.pdf.couleurOtan", { couleur: couleur.nom }) +
             (typeof g.level === "number" ? t("secours.pdf.niveauSuffix", { niveau: _formatLevelShort(g.level) }) : "") + ")",
             margin, y); y += 6;
    pdf.setTextColor(0);

    const rgb = _hexToRgb(couleur.hex);
    pdf.setFillColor(rgb.r, rgb.g, rgb.b);
    pdf.rect(margin, y, pageW - 2 * margin, 5, "F");
    y += 9;

    if (Array.isArray(g.membres) && g.membres.length > 0) {
      pdf.setFontSize(10); pdf.setFont(undefined, "bold");
      pdf.text(t("secours.pdf.membresTitre"), margin, y); y += 4;
      pdf.setFont(undefined, "normal");
      y = _pdfWrapText(pdf, _pdfLibre(g.membres.join(", ")), margin, y, pageW - 2 * margin, 4);
      y += 3;
    }
    if (_ligneSuiviRapport(ed)) {   
      pdf.setFontSize(9); pdf.setFont(undefined, "normal");
      y = _pdfWrapText(pdf, _stripPourPdf(_ligneSuiviRapport(ed)), margin, y, pageW - 2 * margin, 4);
      y += 2;
    }

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
      if (y > pageH - 30) {
        _drawRapportPDFFooter(pdf, r, pageW, pageH, margin);
        pdf.addPage();
        _drawRapportPDFHeader(pdf, r, pageW, margin);
        y = margin + 22;
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.equipeTitreSuite", { nom: _pdfLibre(g.nom, t("secours.pdf.equipeDefautAscii")) }),
                 margin, y); y += 6;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
      }
      const info = _getStatutInfo(et.statut);
      const typeLabel = (et.type === "entree") ? t("secours.pdf.typeEntree")
                      : (et.type === "sortie") ? t("secours.pdf.typeSortie")
                      : t("secours.pdf.typeEtape", { idx: i });
      const ts = et.completedAt ? new Date(et.completedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR")
               : et.startedAt   ? t("secours.pdf.tsEnCours", { date: new Date(et.startedAt).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") })
               : "—";
      const statutRgb = _hexToRgb(info.color);
      pdf.setDrawColor(statutRgb.r, statutRgb.g, statutRgb.b);
      pdf.setLineWidth(0.6);
      pdf.line(margin, y - 3, margin, y + 6);
      pdf.setLineWidth(0.2);
      pdf.setDrawColor(0);

      pdf.setFont(undefined, "bold");
      pdf.text("  " + (i + 1) + ". " + typeLabel + " - " + _pdfLibre(_lblEtape(et.label), "(?)"), margin, y); y += 4;
      pdf.setFont(undefined, "normal");
      pdf.text("     " + t("secours.pdf.statutLigne", { statut: _statutLabelPdf(et.statut), ts: ts }), margin, y); y += 4;
      if (et.observations && et.observations.trim()) {
        const obsT = window.ktaTextePdf(et.observations.trim());
        y = _pdfWrapText(pdf, "     " + t("secours.pdf.obsLigne", { obs: obsT }), margin, y, pageW - 2 * margin, 4);
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

  // ── Mini-carte par équipe (page A4 paysage) ─────────────────────────

  /**
   * Rectangle englobant des points, zone et itinéraire d'une équipe, marge 15 %.
   * @param {object} eq - équipe SecoursMode
   * @returns {object|null} {x, y, w, h} en coordonnées plan, ou null si rien à dessiner
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

    // Marge : 15 % du grand côté, au moins 60 px (zones minuscules).
    const pad = Math.max(60, Math.max(maxX - minX, maxY - minY) * 0.15);
    return {
      x: minX - pad,
      y: minY - pad,
      w: (maxX - minX) + 2 * pad,
      h: (maxY - minY) + 2 * pad
    };
  }

  /** "#RRGGBB" → "rgba(R,G,B,alpha)" ; repli sur l'ambre de la charte si hex invalide. */
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
   * Overlay d'une équipe sur le canvas de la mini-carte : zone (fond teinté + bord), itinéraire (pointillé),
   * entrée (bord vert), sortie (bord rouge), intermédiaires numérotés.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} eq - équipe
   * @param {Function} planToCanvas - (x, y) → {x, y} en coordonnées du canvas
   * @param {object} couleur - {hex} de la palette
   */
  function _drawEquipeOverlayOnCanvas(ctx, eq, planToCanvas, couleur) {
    const hex = (couleur && couleur.hex) || "#f4c542";

    // 1) Zone polygone : fond teinté + bordure.
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

    // 2) Itinéraire en pointillé.
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

    // 3) Intermédiaires numérotés (avant entrée/sortie, pour l'ordre d'affichage).
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

    const accesUnique = _memeAcces(eq.entree, eq.sortie);
    // 4) Entrée : bord vert + « E » (un seul repère « E/S » si même accès).
    if (eq.entree && typeof eq.entree.x === "number" && !accesUnique) {
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

    // 5) Sortie : bord rouge + « S » (orange si boucle).
    if (eq.sortie && typeof eq.sortie.x === "number") {
      // 🩸 Même accès = même point OU < 10 m : un seul repère « E/S ». Comparer le seul pointId cacherait
      // l'entrée quand on clique deux fois au même endroit.
      const isLoop = accesUnique;
      const c = planToCanvas(eq.sortie.x, eq.sortie.y);
      const cx = c.x;
      const cy = c.y;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
      ctx.fillStyle   = hex;
      ctx.fill();
      ctx.strokeStyle = isLoop ? "#ff8c00" : "#cc0000";
      ctx.lineWidth   = 5;
      ctx.stroke();
      ctx.fillStyle   = "#ffffff";
      ctx.font        = isLoop ? "bold 12px Arial, sans-serif" : "bold 16px Arial, sans-serif";
      ctx.textAlign   = "center";
      ctx.textBaseline= "middle";
      ctx.fillText(isLoop ? "E/S" : "S", cx, cy);
    }
  }

  /**
   * Page A4 paysage avec la mini-carte d'une équipe (async) : bounds de l'équipe → rendu de sa seule zone
   * (_rendreRegionPlan, pleine résolution) → canvas au ratio A4 (bandes blanches) → overlay de l'équipe →
   * page + image + en-tête/pied. Sautée sans bruit si l'équipe n'a rien à dessiner ou sans plan chargé.
   * @param {jsPDF} pdf
   * @param {object} ed - reportData.equipesData[i] = {equipe, etapes, photos}
   * @param {object} r  - reportData complet (métadonnées)
   */
  async function _drawRapportPDFEquipeMiniaturePage(pdf, ed, r) {
    if (!ed || !ed.equipe) return false;
    // 🩸 `ed.equipe` est la copie ALLÉGÉE du rapport (id, nom, couleur, membres…) : ni entrée, ni étapes, ni
    // zone, ni itinéraire → `_calculerBoundsEquipe` rendrait null et la page serait sautée sans un mot. Le PDF
    // se génère sur l'appareil qui détient le scénario : on y reprend l'équipe complète.
    const sLoc = (r && r.scenario && r.scenario.id) ? get(r.scenario.id) : null;
    const gLoc = sLoc ? (sLoc.groupes || []).find(function(g) { return g.id === ed.equipe.id; }) : null;
    const eq = gLoc ? Object.assign({}, ed.equipe, gLoc) : ed.equipe;

    const bounds = _calculerBoundsEquipe(eq);
    if (!bounds) return false; // Pas d'éléments dessinables — skip silent

    if (!window.MyKTAMapExporterGenererCanvas) {
      console.warn("[Rapport] MyKTAMapExporterGenererCanvas indispo — mini-carte skip");
      return false;
    }

    // 2) Rendu de la SEULE zone de l'équipe, pleine résolution (cf _rendreRegionPlan). Annotations de session
    // désactivées : l'overlay de l'équipe est dessiné par-dessus.
    const rect = _rogner(bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h);
    if (!rect) {
      console.warn("[Rapport] Bounds équipe hors du plan — mini-carte skip");
      return false;
    }
    let src = null;
    try { src = await _rendreRegionPlan(rect, 1800); }
    catch (e) {
      console.warn("[Rapport] Génération canvas plan échouée : " + (e && e.message));
      return false;
    }
    if (!src) return false;

    // 3) Canvas final au ratio A4 paysage (297/210 = 1,414) : 1800×1273 px ≈ 150 dpi, compromis qualité/RAM.
    const TARGET_W = 1800;
    const TARGET_H = Math.round(TARGET_W * 210 / 297);
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width  = TARGET_W;
    finalCanvas.height = TARGET_H;
    const ctx = finalCanvas.getContext("2d");

    // Bandes blanches pour garder la forme.
    const srcRatio = rect.w / rect.h;
    const dstRatio = TARGET_W / TARGET_H;
    let dx, dy, dw, dh;
    if (srcRatio > dstRatio) {
      dw = TARGET_W;
      dh = dw / srcRatio;
      dx = 0;
      dy = (TARGET_H - dh) / 2;
    } else {
      dh = TARGET_H;
      dw = dh * srcRatio;
      dy = 0;
      dx = (TARGET_W - dw) / 2;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TARGET_W, TARGET_H);
    ctx.drawImage(src.canvas, 0, 0, src.canvas.width, src.canvas.height, dx, dy, dw, dh);

    // 4) Overlay : projection plan → canvas.
    // 🩸 Projeter avec la source RÉELLEMENT dessinée (rognée au bord du plan), pas avec les bounds bruts —
    // sinon l'équipe se décale du fond dès que sa zone touche un bord du plan.
    const srcX = rect.x, srcY = rect.y, srcW = rect.w, srcH = rect.h;
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

    // 5) Page paysage + image + en-tête/pied (⚠️ pdf.text en Helvetica latin1 : pas d'emoji).
    pdf.addPage("a4", "landscape");
    const pageW = pdf.internal.pageSize.getWidth();   // 297 mm
    const pageH = pdf.internal.pageSize.getHeight();  // 210 mm
    const m     = 12;

    // En-tête : pastille couleur + titre de l'équipe.
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
    // Nom de l'équipe : accents gardés, emojis et symboles hors police retirés (ktaTextePdf).
    // ⚠️ Majuscules D'ABORD (une capitale peut sortir de la police), filtre ENSUITE, défaut si rien ne reste
    // (un nom 100 % emoji donnerait un titre vide).
    const nomPdf = _pdfLibre(String(eq.nom || "").toUpperCase(),
                             window.ktaTextePdf(t("secours.pdf.equipeDefautAscii").toUpperCase()));
    pdf.text(t("secours.pdf.carteTitre", { nom: nomPdf }), m + 12, 14);

    const availW = pageW - 2 * m;
    const availH = pageH - 22 - 12;  // - header (22) - footer (12)
    const imgX = m;
    const imgY = 18;
    const dataUrl = finalCanvas.toDataURL("image/jpeg", 0.82);
    pdf.addImage(dataUrl, "JPEG", imgX, imgY, availW, availH);

    // Pied : distance + durée + type de zone.
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

  // Page photos d'une équipe (grille 2 colonnes).
  function _drawRapportPDFEquipePhotosPage(pdf, ed, r, pageW, pageH, margin) {
    _drawRapportPDFHeader(pdf, r, pageW, margin);
    const g = ed.equipe;
    let y = margin + 22;

    pdf.setFontSize(12); pdf.setFont(undefined, "bold");
    pdf.text(t("secours.pdf.photosTitre",
               { nom: _pdfLibre(g.nom, t("secours.pdf.equipeDefautAscii")), n: ed.photos.length }),
             margin, y); y += 8;
    pdf.setFontSize(8); pdf.setFont(undefined, "normal");

    const cols = 2;
    const gapMm = 4;
    const cellW = (pageW - 2 * margin - gapMm) / cols;
    const cellH = cellW * 3 / 4;  // ratio 4:3
    let col = 0;

    ed.photos.forEach(function(p, idx) {
      if (!p.dataUrl) return;
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

  // Page des notes libres (mode secouriste).
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
      const ts = new Date(note.ts).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR");
      pdf.setFont(undefined, "bold");
      pdf.text("  " + (i + 1) + ". " + _statutLabelPdf(note.statut) + "  |  " + ts, margin, y); y += 4;
      pdf.setFont(undefined, "normal");
      if (note.texte) {
        y = _pdfWrapText(pdf, "     " + window.ktaTextePdf(note.texte), margin, y, pageW - 2 * margin, 4);
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

  // Libellé du rôle en ASCII (pdf.text supporte mal les emojis).
  function _formatRoleLabelAscii(scope) {
    if (scope === "operateur")  return t("secours.roleAscii.operateur");
    if (scope === "equipe")     return t("secours.roleAscii.equipe");
    if (scope === "secouriste") return t("secours.roleAscii.secouriste");
    return "(?)";
  }

  function _formatKB(bytes) {
    if (!bytes || bytes < 0) return "0 KB";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  // ── Export PDF des équipes (briefing papier) ───────────────────────
  // Une page A4 par équipe : carte de sa zone (région du plan + overlay couleur + repères), contexte,
  // membres, mission, étapes, feuille de route, cadre d'observations à remplir au retour.
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
    // Chaque page rend SA carte (région de l'équipe, pleine résolution) ; en cas d'échec, la page sort sans
    // carte.
    try {
      const pdf = new window.jspdf.jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 14;
      const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || t("secours.pdf.planDefault");
      for (let idx = 0; idx < s.groupes.length; idx++) {
        const g = s.groupes[idx];
        if (idx > 0) pdf.addPage();
        pdf.setTextColor(0);   // sinon titre gris hérité du pied de page précédent
        const couleur = PALETTE[g.couleurIdx % PALETTE.length];
        pdf.setFontSize(18); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.planSecoursTitre", { nom: _pdfLibre(g.nom, t("secours.pdf.equipeDefautAscii")) }),
                 margin, margin + 4);
        const rgb = _hexToRgb(couleur.hex);
        pdf.setFillColor(rgb.r, rgb.g, rgb.b);
        pdf.rect(margin, margin + 7, pageW - 2 * margin, 6, "F");
        pdf.setFontSize(10); pdf.setTextColor(255, 255, 255); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.equipeBandeau", { couleur: couleur.nom, n: (idx + 1), total: s.groupes.length }),
                 margin + 2, margin + 11);
        pdf.setTextColor(0, 0, 0); pdf.setFont(undefined, "normal");
        let y = margin + 22;
        // Carte de la zone de l'équipe avec overlay (polygone, entrée/sortie, intermédiaires, itinéraire).
        {
          try {
            const cropped = await _carteEquipe(g, couleur.hex);
            if (cropped) {
              const imgWmm = pageW - 2 * margin;        // pleine largeur
              const imgHmm = imgWmm * cropped.height / cropped.width;
              const capped = Math.min(125, imgHmm);    // cap hauteur 125 mm (90 : illisible)
              const finalHmm = capped;
              const finalWmm = capped * cropped.width / cropped.height;
              const xCentered = (pageW - finalWmm) / 2;
              pdf.addImage(cropped.toDataURL("image/jpeg", 0.85), "JPEG",
                           xCentered, y, finalWmm, finalHmm);
              pdf.setDrawColor(150);
              pdf.rect(xCentered, y, finalWmm, finalHmm);
              y += finalHmm + 5;
              pdf.setFontSize(8); pdf.setTextColor(120); pdf.setFont(undefined, "italic");
              pdf.text(t("secours.pdf.carteMiniature"), pageW / 2, y, { align: "center" });
              y += 5;
              pdf.setTextColor(0, 0, 0); pdf.setFont(undefined, "normal");
            }
          } catch(e) {
            console.warn("[SecoursMode] Crop canvas échec pour équipe " + g.nom + " :", e);
          }
        }
        // ── Contexte ──
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.contexteIncident"), margin, y); y += 5;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
        pdf.text(t("secours.pdf.scenarioLigne", { nom: _pdfLibre(s.nom, t("secours.pdf.sansNom")) }),
                 margin, y); y += 4;
        pdf.text(t("secours.pdf.planLigne", { plan: _pdfLibre(planName, t("secours.pdf.planDefault")) }),
                 margin, y); y += 4;
        if (s.context && s.context.incidentAt) {
          const dt = new Date(s.context.incidentAt);
          pdf.text(t("secours.pdf.heureIncident", { date: dt.toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }), margin, y); y += 4;
        }
        if (s.context && s.context.notes) {
          y = _pdfWrapText(pdf, t("secours.pdf.notesLigne", { notes: window.ktaTextePdf(s.context.notes) }),
                           margin, y, pageW - 2 * margin, 4);
        }
        y += 4;
        // ── Membres ──
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.membresEquipe"), margin, y); y += 5;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
        pdf.text(_pdfLibre((g.membres && g.membres.length) ? g.membres.join(", ") : "", t("secours.pdf.nonRenseignes")),
                 margin, y);
        y += 4;
        pdf.text(t("secours.pdf.chefEffectif", { chef: _pdfLibre(_chef(g), t("secours.pdf.nonRenseigne")),
                                                 effectif: _effectif(g) || t("secours.pdf.nonRenseigne") }), margin, y);
        if (g.heureRetour) {
          y += 4; pdf.setFont(undefined, "bold");
          pdf.text(t("secours.pdf.retourImperatif", { h: g.heureRetour }), margin, y);
          pdf.setFont(undefined, "normal");
        }
        y += 8;
        // ── Mission ──
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.missionAssignee"), margin, y); y += 5;
        pdf.setFontSize(9); pdf.setFont(undefined, "normal");
        // Le NOM du point d'abord (« x=11682 y=9671 » ne dit rien à une équipe).
        const nomPt = function(w) {
          if (!w || typeof w.x !== "number") return _fmtPoint(w);
          const gps = _gpsTxt(w.x, w.y);
          const ou = gps ? "GPS " + gps + (typeof w.level === "number" ? " niv=" + w.level : "") : _fmtPoint(w);
          const nom = _pdfLibre(w.label);
          return nom ? nom + " (" + ou + ")" : ou;
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
        // ── Itinéraire ──
        // 🩸 On imprime les ÉTAPES, dans l'ordre du stepper, pas le nombre de points du TRACÉ (des centaines : un
        // chef d'équipe croirait à 400 arrêts). Même sans itinéraire calculé : le papier ne dépend pas du calcul.
        const etapesNoms = [g.entree].concat(g.intermediaires || [], [g.sortie])
          .filter(function(w) { return w && typeof w.x === "number"; })
          .map(function(w) { return _pdfLibre(w.label) || _lblEtape(_fmtPoint(w)); });
        if (etapesNoms.length > 0) {
          pdf.setFontSize(11); pdf.setFont(undefined, "bold");
          const aIti = Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length > 0;
          pdf.text(t(aIti ? "secours.pdf.itineraireSuggere" : "secours.pdf.etapesTitreSansIti"), margin, y); y += 5;
          pdf.setFontSize(9); pdf.setFont(undefined, "normal");
          // Liste longue (« POI de la zone » : 40 à 60 étapes) : saut de page ligne à ligne.
          pdf.splitTextToSize(t("secours.pdf.etapesLigne", { n: etapesNoms.length, liste: etapesNoms.join(" > ") }),
                              pageW - 2 * margin).forEach(function(ligne) {
            if (y > pdf.internal.pageSize.getHeight() - 15) { pdf.addPage(); y = margin + 8; }
            pdf.text(ligne, margin, y); y += 4;
          });
          y += 4;
        }
        // Feuille de route : les consignes carrefour par carrefour que le chef lira sur papier (même moteur que
        // la feuille de route de l'app).
        const feuille = _feuilleDeRouteLignes(s, g);
        if (feuille === null) {
          pdf.setFontSize(9); pdf.setFont(undefined, "italic");
          pdf.text(_stripPourPdf(t("secours.pdf.feuilleSansIti")), margin, y); y += 6;
          pdf.setFont(undefined, "normal");
        } else if (feuille.length) {
          if (y > pdf.internal.pageSize.getHeight() - 30) { pdf.addPage(); y = margin + 8; }
          pdf.setFontSize(11); pdf.setFont(undefined, "bold");
          pdf.text(_stripPourPdf(t("secours.pdf.feuilleTitre", { n: feuille.length })), margin, y); y += 5;
          pdf.setFontSize(9); pdf.setFont(undefined, "normal");
          feuille.forEach(function(l, i) {
            pdf.splitTextToSize(_stripPourPdf((i + 1) + ". " + l), pageW - 2 * margin - 4).forEach(function(ligne, k) {
              if (y > pdf.internal.pageSize.getHeight() - 15) { pdf.addPage(); y = margin + 8; }
              pdf.text(ligne, margin + (k ? 4 : 0), y); y += 4;
            });
          });
          y += 4;
        }
        // Cadre Observations : page suivante s'il ne tient plus.
        if (y + 70 > pdf.internal.pageSize.getHeight() - 10) { pdf.addPage(); y = margin + 8; }
        // Cadre Observations (rempli à la main au retour).
        pdf.setFontSize(11); pdf.setFont(undefined, "bold");
        pdf.text(t("secours.pdf.obsRetourTerrain"), margin, y); y += 5;
        pdf.setDrawColor(150);
        pdf.rect(margin, y, pageW - 2 * margin, 60);
        y += 65;
        pdf.setFontSize(7); pdf.setTextColor(120);
        pdf.text(t("secours.pdf.genereLigne", { version: ((window.__MKM__ && window.__MKM__.build) || ""), date: new Date().toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }),
                 margin, pdf.internal.pageSize.getHeight() - 6);
      }
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

  // Bbox d'une équipe (points + polygone + tracés sélectionnés) en coordonnées plan : {x, y, w, h} ou null.
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

  // ── Cartes PDF nettes sur un grand plan ────────────────────────────
  // Chaque carte rend SEULEMENT son rectangle (option `region` de l'export, fond lu dans les tuiles V2 au
  // niveau qui suffit) : pleine résolution, canvas borné par la carte (≤ 2400 px de côté), jamais par le
  // plan. 🩸 Rendre le plan entier sous 16 Mpx (limite des canvas de Safari iOS) puis recadrer donne, sur un
  // grand plan, ~27 % de sa résolution : noms de galeries illisibles.
  function _dimsPlan() {
    const pl = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) || {};
    return { w: Number(pl.imageWidth) || 0, h: Number(pl.imageHeight) || 0 };
  }
  // Rectangle (unités plan) rogné au plan ; null s'il est vide.
  function _rogner(x0, y0, x1, y1) {
    const d = _dimsPlan();
    if (d.w && d.h) { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(d.w, x1); y1 = Math.min(d.h, y1); }
    return (x1 - x0 >= 1 && y1 - y0 >= 1) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  // Rend un rectangle du plan (fond + calques image et data, sans annotations de session)
  // → { canvas, x, y, w, h }, ou null. `cote` = côté le plus long visé, en pixels ; jamais
  // plus de 2 pixels par unité plan (au-delà, le fond ne gagne rien).
  async function _rendreRegionPlan(rect, cote) {
    if (!rect || typeof window.MyKTAMapExporterGenererCanvas !== "function") return null;
    const echelle = Math.min(2, cote / Math.max(rect.w, rect.h));
    const canvas = await window.MyKTAMapExporterGenererCanvas({
      scale: echelle, region: rect, bg: "image", includeImgLayers: true, includeDataLayers: true,
      ann: { points: false, roads: false, zones: false, structures: false, jonctions: false, itineraire: false,
             pointsTags: { tagsCoches: new Set(), untaggedCoche: false, tousActifs: false } }
    });
    return canvas && canvas.width ? { canvas: canvas, x: rect.x, y: rect.y, w: rect.w, h: rect.h, planEntier: !!rect.planEntier } : null;
  }
  // Rectangle de la carte d'une équipe : sa bbox + 15 % ; plan entier si rien n'est placé.
  function _rectCarteEquipe(g) {
    const bbox = _computeTeamBbox(g);
    const d = _dimsPlan();
    if (!bbox || bbox.w < 1 || bbox.h < 1) return d.w ? { x: 0, y: 0, w: d.w, h: d.h, planEntier: true } : null;
    const pad = Math.max(bbox.w, bbox.h, 100) * 0.15;
    const r = _rogner(bbox.x - pad, bbox.y - pad, bbox.x + bbox.w + pad, bbox.y + bbox.h + pad);
    return (r && r.w >= 50 && r.h >= 50) ? r : (d.w ? { x: 0, y: 0, w: d.w, h: d.h, planEntier: true } : null);
  }
  // Carte d'une équipe pour le PDF : rendu de son rectangle + l'overlay de l'équipe.
  async function _carteEquipe(g, hexColor) {
    const rect = _rectCarteEquipe(g);
    const src = await _rendreRegionPlan(rect, rect && rect.planEntier ? 1200 : 2400);
    return src ? _cropCanvasForTeam(src, g, hexColor) : null;
  }

  // Dessine l'overlay de l'équipe (polygone, entrée / sortie, intermédiaires, itinéraire)
  // sur la région rendue `src` ({ canvas, x, y, w, h }, unités plan). y = 0 en HAUT, comme
  // l'export : pas d'inversion. Rend un nouveau canvas.
  function _cropCanvasForTeam(src, g, hexColor) {
    if (!src || !src.canvas) return null;
    if (src.planEntier || !_computeTeamBbox(g)) return _resizeCanvasFit(src.canvas, 800, 600);
    const sx = src.x, sy = src.y, sw = src.w, sh = src.h;
    const out = document.createElement("canvas");
    out.width = src.canvas.width;
    out.height = src.canvas.height;
    const ctx = out.getContext("2d");
    // Fond blanc (au cas où l'image source a de l'alpha).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src.canvas, 0, 0);

    // Repères, traits et textes suivent la taille de l'image (base 1000 px) : sinon, plus la carte est nette,
    // plus les numéros d'étape rapetissent sur la page.
    const k = Math.max(1, Math.max(out.width, out.height) / 1000);
    const sX = out.width  / sw;
    const sY = out.height / sh;
    function _toCanvas(p) {
      return { x: (p.x - sx) * sX, y: (p.y - sy) * sY };
    }
    const rgb = _hexToRgb(hexColor);

    // 1. Zone polygone (remplissage 30 %, bord 3 px).
    if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
      ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.30)";
      ctx.strokeStyle = hexColor;
      ctx.lineWidth = 3 * k;
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
    // 2. Zone « tracés » (halo couleur sur chaque tracé sélectionné).
    if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds)) {
      ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.55)";
      ctx.lineWidth = 8 * k;
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
    // 3. Itinéraire suggéré (pointillé couleur équipe, épaisseur 4).
    if (Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2) {
      ctx.strokeStyle = hexColor;
      ctx.lineWidth = 4 * k;
      ctx.setLineDash([10 * k, 6 * k]);
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
    // 4. Intermédiaires (cercles couleur équipe + numéro).
    if (Array.isArray(g.intermediaires)) {
      g.intermediaires.forEach(function(w, i) {
        if (!w || typeof w.x !== "number") return;
        const c = _toCanvas(w);
        _drawTeamMarker(ctx, c.x, c.y, 7 * k, "#ffffff", hexColor);
        ctx.fillStyle = "#000";
        ctx.font = "bold " + Math.round(12 * k) + "px sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3 * k; ctx.lineJoin = "round";   // lisible sur plan sombre
        ctx.strokeText(String(i + 1), c.x + 9 * k, c.y);
        ctx.fillText(String(i + 1), c.x + 9 * k, c.y);
      });
    }
    const accesUnique = _memeAcces(g.entree, g.sortie);
    // 5. Entrée (bord vert, fond couleur équipe) ; un seul repère si même accès.
    if (g.entree && typeof g.entree.x === "number" && !accesUnique) {
      const c = _toCanvas(g.entree);
      _drawTeamMarker(ctx, c.x, c.y, 9 * k, "#00cc44", hexColor);
      ctx.fillStyle = "#00cc44";
      ctx.font = "bold " + Math.round(11 * k) + "px sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3 * k;
      const lblEntree = t("secours.carte.entree");
      ctx.strokeText(lblEntree, c.x + 12 * k, c.y);
      ctx.fillText(lblEntree, c.x + 12 * k, c.y);
    }
    // 6. Sortie (bord rouge, ou orange si boucle).
    if (g.sortie && typeof g.sortie.x === "number") {
      const c = _toCanvas(g.sortie);
      const isBoucle = accesUnique;
      _drawTeamMarker(ctx, c.x, c.y, (isBoucle ? 11 : 9) * k,
                      isBoucle ? "#ffaa00" : "#cc0000", hexColor);
      ctx.fillStyle = isBoucle ? "#ffaa00" : "#cc0000";
      ctx.font = "bold " + Math.round(11 * k) + "px sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3 * k;
      const lbl = isBoucle ? t("secours.carte.entreeSortie") : t("secours.carte.sortie");
      const dx = (isBoucle ? 14 : 12) * k;
      const dy = 0;
      ctx.strokeText(lbl, c.x + dx, c.y + dy);
      ctx.fillText(lbl, c.x + dx, c.y + dy);
    }
    // Mini-légende en bas à droite : la carte s'explique seule sur le terrain.
    _drawTeamLegende(ctx, out.width, out.height, g, hexColor);
    return out;
  }

  // Mini-légende (carré couleur + libellé) des SEULS éléments présents pour cette équipe.
  function _drawTeamLegende(ctx, canvasW, canvasH, g, hexColor) {
    const items = [];
    if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
      items.push({ type: "zone-poly", label: t("secours.legende.zonePolygone") });
    }
    if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds) && g.zoneRoadIds.length > 0) {
      items.push({ type: "zone-roads", label: t("secours.legende.zoneTraces") });
    }
    const accesUnique = _memeAcces(g.entree, g.sortie);
    if (g.entree && typeof g.entree.x === "number" && !accesUnique) {
      items.push({ type: "entree", label: t("secours.legende.entree") });
    }
    if (g.sortie && typeof g.sortie.x === "number") {
      const isBoucle = accesUnique;
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

    const boxX = canvasW - boxW - 8;
    const boxY = canvasH - boxH - 8;

    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.lineWidth = 1;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    const rgb = _hexToRgb(hexColor);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    items.forEach(function(it, i) {
      const cy = boxY + pad + i * lineH + lineH / 2 - 2;
      const swX = boxX + pad;
      const swY = cy - 7;
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
      ctx.fillStyle = "#1a1f2e";
      ctx.fillText(it.label, swX + swatchW + swatchGap, cy);
    });
  }

  // Repère : disque couleur équipe + bord coloré (entrée, sortie…).
  function _drawTeamMarker(ctx, x, y, r, borderColor, fillColor) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = Math.max(3, r * 0.35);   // suit la taille du repère
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
  // Un point sans nom s'AFFICHE en GPS quand le plan est géoréférencé (plan-config OU calage saisi dans les
  // Réglages — même cascade que la Vue OSM) : « SORTIE — x=15347 y=5085 niv=0 » ne dit rien aux pompiers.
  // ⚠️ Affichage seulement : le libellé stocké reste _fmtPoint (« x=… y=… niv=… »), identité des étapes sans
  // nom entre PC et téléphones (appariement par libellé) — le changer casserait la fusion.
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
  function _gpsDe(x, y) {
    const tr = _transformGeoref();
    const ll = tr ? window.KmzExport.planToGps(tr, x, y) : null;
    return (ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng)) ? ll : null;
  }
  function _gpsTxt(x, y) {
    const ll = _gpsDe(x, y);
    return ll ? ll.lat.toFixed(5) + ", " + ll.lng.toFixed(5) : null;
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

  // ── Export KMZ ──────────────────────────────────────────────────────
  // Polygones KML par équipe (zones polygone, ou polylignes pour les tracés), placemarks entrée/sortie,
  // dossier « Secours — <nom du scénario> », secoursPlan dans myktamap-extras.json (ré-import natif), plan en
  // GroundOverlay à 60 % (image lue dans RUNTIME_ASSETS, sinon en HTTP, comme sessionExporter.js).
  // Pré-requis : calibrage KMZ fait (sinon on guide vers Export sessions, onglet KMZ).
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
    // ⚠️ Format RÉEL stocké par KmzExport.setCalibration, À PLAT : { pointA: {x, y, lat, lng}, pointB: {…} }.
    // Il n'existe pas de forme imbriquée pointA.plan / pointA.gps : buildTransform recevrait undefined et
    // répondrait « Calibrage incomplet ». Même lecture que sessionExporter.js et createConf.js.
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
      transform = window.KmzExport.buildTransformCalib(calib);   // pointC optionnel propagé (affine)
    } catch(e) {
      _toast(t("secours.toast.calibrageCorrompu", { message: e.message }), "error");
      return null;
    }
    // Itinéraires manquants (entrée + sortie mais pas d'itineraireSuggere) calculés avant l'export, en
    // parallèle : export complet en un clic.
    const groupesACalc = (s.groupes || []).filter(function(g) {
      return g.entree && g.sortie && !Array.isArray(g.itineraireSuggere);
    });
    if (groupesACalc.length > 0) {
      _toast(t("secours.toast.calcAutoIti", { n: groupesACalc.length }), "info");
      await Promise.allSettled(groupesACalc.map(function(g) {
        return _recalculerItineraireGroupeAsync(s.id, g.id);
      }));
      // Relecture de s pour les itineraireSuggere fraîchement écrits.
      const sFrais = get(s.id);
      if (sFrais) {
        s.groupes = sFrais.groupes;
      }
    }

    _toast(t("secours.toast.generationKmz"), "info");
    // Le plan en fond (GroundOverlay 60 %) donne aux équipes le contexte spatial (puits, galeries, structures)
    // en plus des zones.
    const pc = window.PLAN_CONFIG;
    let imageBlob = null;
    let imageFilename = null;
    if (pc && pc.plan && pc.plan.baseImage) {
      const baseImagePath = pc.plan.baseImage;
      const fullPath = baseImagePath.indexOf("/") >= 0 ? baseImagePath : ("data/" + baseImagePath);
      imageFilename = baseImagePath;
      // 1. RUNTIME_ASSETS (plan importé en ZIP).
      if (window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[fullPath]) {
        const asset = window.RUNTIME_ASSETS[fullPath];
        if (asset.file instanceof Blob) {
          imageBlob = asset.file;
        } else if (asset.url) {
          try { const r = await fetch(asset.url); if (r.ok) imageBlob = await r.blob(); } catch(e) {}
        }
      }
      // 2. Fetch direct (plan servi en HTTP).
      if (!imageBlob) {
        try { const r = await fetch(fullPath); if (r.ok) imageBlob = await r.blob(); } catch(e) {}
      }
      if (!imageBlob) {
        console.warn("[SecoursMode] Image plan introuvable → KMZ généré sans GroundOverlay");
        imageFilename = null;
      }
    }

    // KmzExport.genererKmz : GroundOverlay 60 %, données de session vides (nos polygones passent par les
    // extras secoursPlan), secoursPlan + secoursPalette (dossier KML visible).
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
      // secoursPlan dans les extras (ré-import natif).
      secoursPlan:   s,
      // Dossier KML lisible par d'autres apps (Polygons + Placemarks + LineStrings).
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

  // ── Interface : modale ──────────────────────────────────────────────

  // Ouvre la modale : édition directe si scenarioId, sinon la liste.
  function ouvrir(scenarioId) {
    if (_modal) { fermer(); }
    // Relecture du stockage (un autre onglet a pu modifier).
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
    // scenarioId → éditeur, sinon liste. Intervention en cours sur ce scénario → directement la vue LIVE, où
    // l'on valide les étapes.
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
    // Intervention active : l'affichage carte reste après fermeture de la fenêtre (équipier : son équipe
    // seule, filtre de renderOverlay ; opérateur : toutes). reset() (changement de plan) nettoie.
    const enCours = _scenarioEnCours();
    if (enCours && window.map) {
      try { renderOverlay(enCours.id); } catch(e) { console.warn("[SecoursMode] overlay en cours :", e); }
    }
    _majFooterSecours();
    // Arrêt du timer (sinon il tourne pour rien après fermeture).
    _stopLiveTimer();
    // Heatmap encore active (fenêtre fermée sans la couper) : nettoyée.
    if (_secoursHeatmapActive && window.MyKTAMapHeatmap
        && typeof window.MyKTAMapHeatmap.effacer === "function") {
      try { window.MyKTAMapHeatmap.effacer(); } catch(e) {}
      _secoursHeatmapActive = false;
    }
    // Révocation des ObjectURL des photos Live (_hydraterPhotosLive) : sinon la RAM fuit à chaque
    // ouverture/fermeture.
    _revokeLivePhotoUrls();
  }

  function _onKeyDown(e) {
    if (e.key === "Escape" && _modal) fermer();
  }

  // Squelette HTML : en-tête + corps (rempli par _switchView).
  // 🩸 En vue live, l'en-tête Opérateur SORT de la zone qui défile et se pose entre le titre et le contenu :
  // Safari iOS peint un en-tête `sticky` SOUS le contenu qui défile (fond opaque, z-index, isolation n'y
  // changent rien). Il ne porte aucun bouton (handlers sur `corps`) ; chrono mis à jour par sélecteur global
  // (data-live-timer).
  function _placerEnteteLive(corps, view) {
    const ancien = document.getElementById("kta-secours-live-slot");
    if (ancien && ancien.parentNode) ancien.parentNode.removeChild(ancien);
    if (view !== "live" || !corps || !corps.parentNode) return;
    const entete = corps.querySelector(".kta-secours-live-header");
    if (!entete) return;
    const slot = document.createElement("div");
    slot.id = "kta-secours-live-slot";
    slot.className = "kta-secours-live-slot";
    corps.parentNode.insertBefore(slot, corps);
    slot.appendChild(entete);
  }

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

  // Bascule entre les 4 vues : "list" (scénarios) | "create" (stepper) | "edit" (libre) | "live" (terrain).
  function _switchView(view) {
    const corps = document.getElementById("kta-secours-corps");
    if (!corps) return;
    _activeView = view;  // vue active, pour re-rendre après une mutation de phase
    if (view === "list")   corps.innerHTML = _renderListView();
    if (view === "create") corps.innerHTML = _renderCreateView();
    if (view === "edit")   corps.innerHTML = _renderEditView();
    if (view === "live")   corps.innerHTML = _renderLiveView();   // Phase 3
    _bindViewHandlers(view);
    _placerEnteteLive(corps, view);
    // Le timer tourne dès qu'une exécution est active sur le scénario courant, quelle que soit la vue (live, ou
    // édition avec le bandeau PLAN ACTIF) ; arrêté à la fermeture (la veille des retards, elle, continue).
    const s = _currentScenarioId ? get(_currentScenarioId) : null;
    const execActive = s && _estExecutionActive(s);
    if (view === "live" || execActive) _startLiveTimer();
    else                               _stopLiveTimer();
  }

  // Timer de la vue Live (chrono d'en-tête + dernière observation), 1 tick/s.
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
  // Met à jour les seuls nœuds data-live-timer, sans re-rendu (pas de flash, pas de perte de focus dans une
  // observation en cours de saisie).
  function _majLiveTimers() {
    if (!_currentScenarioId) return;
    const dureeMs = getExecutionDureeMs(_currentScenarioId);
    const dureeStr = _formatDureeMs(dureeMs);
    document.querySelectorAll('[data-live-timer="duree"]').forEach(function(el) {
      el.textContent = dureeStr;
    });
    // Lignes départ / retour, sans re-rendu (garde la saisie en cours).
    const sCour = get(_currentScenarioId);
    if (sCour && _estExecutionActive(sCour)) {
      document.querySelectorAll("[data-live-retour]").forEach(function(el) {
        const g = (sCour.groupes || []).find(function(x) { return x.id === el.getAttribute("data-live-retour"); });
        if (!g) return;
        const e = _etatRetour(sCour, g).etat;
        el.className = "kta-secours-retour kta-secours-retour--" + e;
        const txt = el.querySelector(".kta-secours-retour-txt");
        if (txt) txt.textContent = _texteRetour(sCour, g);
      });
    }
  }

  // ── Vue Liste ───────────────────────────────────────────────────────
  function _renderListView() {
    let html = '<div class="kta-secours-list-header">' +
                 '<div class="kta-secours-list-header-actions">' +
                   '<button class="kta-btn kta-btn-primary" data-action="new-scenario">' +
                     t("secours.list.btnNouveau") +
                   '</button>' +
                   '<button class="kta-btn kta-btn-secondary" data-action="import-mkmsec" title="' + _escAttr(t("secours.list.btnImporterTitle")) + '">' +
                     t("secours.list.btnImporter") +
                   '</button>' +
                 '</div>' +
               '</div>';
    if (_scenarios.length === 0) {
      html += '<div class="kta-secours-empty">' +
                '<div class="kta-secours-empty-icon">🚑</div>' +
                '<p>' + t("secours.list.emptyTitre") + '</p>' +
                '<p class="kta-secours-empty-hint">' + t("secours.list.emptyHint") + '</p>' +
              '</div>';
    } else {
      html += '<div class="kta-secours-list">';
      // Plus récent en haut.
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
        html += '<p class="kta-secours-hint" style="margin-top:12px; color:var(--kta-avert);">' +
                  t("secours.list.limiteAtteinte", { max: MAX_SCENARIOS }) +
                '</p>';
      }
    }
    return html;
  }

  // ── Vue Création ────────────────────────────────────────────────────
  // Stepper volontairement léger : nom + contexte + équipes (nom seul). Zones, entrées/sorties et itinéraires
  // se définissent ensuite dans l'Édition (ils demandent la carte).
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
             '<div class="kta-secours-form-actions">' +
               '<button class="kta-btn kta-btn-ghost" data-action="cancel-create">' + t("secours.btn.annuler") + '</button>' +
               '<button class="kta-btn kta-btn-primary" data-action="confirm-create">' + t("secours.btn.creerContinuer") + '</button>' +
             '</div>' +
           '</div>';
  }

  // ── Vue Édition (Contexte / Équipes / Export) ──────────────────────
  // Section Phases : « Ajouter une phase » toujours présent ; 1 phase → indice + bouton, 2 et plus → liste
  // éditable. La phase 0 n'est jamais supprimable depuis l'interface.
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
      html += '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="add-phase">' +
                t("secours.phases.btnAjouter") +
              '</button>';
    } else {
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
        // Suppression désactivée si phase active, démarrée, ou seule.
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

  // Modale de création / édition d'une phase : nom (défaut « Phase N+1 »), équipes participantes, Annuler /
  // Valider. editPhaseIdx = null → création, nombre → édition.
  function _afficherModalePhase(scenarioId, editPhaseIdx) {
    const s = get(scenarioId);
    if (!s) return;
    const isEdit = (typeof editPhaseIdx === "number");
    const existingPhase = isEdit ? s.phases[editPhaseIdx] : null;
    if (isEdit && !existingPhase) {
      _toast(t("secours.toast.phaseIntrouvable"), "error");
      return;
    }
    // Nettoyage d'une modale précédente (DOM + listener Échap orphelin).
    const oldModal = document.getElementById("kta-secours-phase-modal");
    if (oldModal) oldModal.remove();
    if (_phaseModalEsc) {
      document.removeEventListener("keydown", _phaseModalEsc);
      _phaseModalEsc = null;
    }

    const defaultNom = isEdit ? existingPhase.nom : t("secours.phaseModal.defaultNom", { n: (s.phases.length + 1) });
    const initialGroupeIds = isEdit ? (existingPhase.groupeIds || []).slice() : [];

    const titre = isEdit ? t("secours.phaseModal.titreEdit") : t("secours.phaseModal.titreCreate");

    // kta-secours-sub-modal : z-index 100050, au-dessus de la modale principale (99999).
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
      html += '<p class="kta-secours-hint" style="color:var(--kta-accent-texte);">' + t("secours.phaseModal.aucuneEquipe") + '</p>';
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
                   '<div class="kta-readme-modal-footer" style="display:flex; gap:8px; justify-content:flex-end; padding:12px 18px; border-top:1px solid var(--kta-bordure);">' +
                     '<button class="kta-btn kta-btn-ghost" data-action="cancel-phase-modal">' + t("secours.btn.annulerSimple") + '</button>' +
                     '<button class="kta-btn kta-btn-primary" data-action="confirm-phase-modal" data-edit-idx="' + (isEdit ? editPhaseIdx : "") + '">' +
                       (isEdit ? t("secours.btn.enregistrer") : t("secours.btn.creerPhase")) +
                     '</button>' +
                   '</div>' +
                 '</div>' +
               '</div>';
    // ⚠️ Attachée à <html>, pas à <body> : la modale principale est sur documentElement (ouvrir()) ; dans
    // body, une sous-modale serait rendue AVANT elle, donc cachée.
    document.documentElement.insertAdjacentHTML("beforeend", html);
    const modal = document.getElementById("kta-secours-phase-modal");
    if (!modal) return;

    const nomInput = modal.querySelector("#kta-sec-phase-nom");
    if (nomInput) {
      nomInput.focus();
      nomInput.select();
    }

    function _closeModal() {
      if (modal && modal.parentNode) modal.remove();
      document.removeEventListener("keydown", _onEsc);
      // Libère la référence module si c'est bien NOTRE listener.
      if (_phaseModalEsc === _onEsc) _phaseModalEsc = null;
    }
    function _onEsc(e) { if (e.key === "Escape") _closeModal(); }
    _phaseModalEsc = _onEsc;
    document.addEventListener("keydown", _onEsc);

    modal.addEventListener("click", function(e) {
      if (e.target === modal) _closeModal();
    });

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
        const cbs = modal.querySelectorAll('input[type="checkbox"][data-equipe-id]');
        const selectedIds = [];
        cbs.forEach(function(cb) {
          if (cb.checked) selectedIds.push(cb.getAttribute("data-equipe-id"));
        });
        if (isEdit) {
          renommerPhase(scenarioId, editPhaseIdx, nom);
          // Participation alignée sur les cases, pour TOUTES les équipes du scénario.
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
        if (_modal && _activeView) _switchView(_activeView);
      }
    });
  }

  // Modale « Debrief de la phase », depuis « Phase terminée » (pied de la vue Live opérateur) ou le toast
  // d'auto-détection. Texte libre (5000 caractères) ; « Terminer la phase » enchaîne sur « Lancer la phase
  // suivante ? » s'il y en a une, sinon propose l'arrêt complet.
  function _afficherModaleDebrief(scenarioId) {
    const s = get(scenarioId);
    if (!s || !s.execution || !s.execution.active) return;
    if (!Array.isArray(s.phases)) return;
    const phaseIdx = s.execution.currentPhaseIdx || 0;
    const phase = s.phases[phaseIdx];
    if (!phase) return;

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
                     '<div class="kta-secours-form-row">' +
                       '<label for="kta-sec-debrief-text"><strong>' + t("secours.debrief.notesLabel") + '</strong>' +
                         ' <span class="kta-secours-hint" style="font-weight:normal;">' + t("secours.debrief.notesHint") + '</span>' +
                       '</label>' +
                       '<textarea id="kta-sec-debrief-text" rows="8" maxlength="5000" style="width:100%;box-sizing:border-box;" placeholder="' + _escAttr(t("secours.debrief.placeholder")) + '">' + _escHtml(existingDebrief) + '</textarea>' +
                     '</div>' +
                     '<div class="kta-secours-debrief-equipes" style="margin-top:14px;">' +
                       '<div style="font-size:13px;color:var(--kta-texte-3);margin-bottom:6px;">' +
                         '<strong>' + t("secours.debrief.equipesActuelles", { n: equipesActuelles.length }) + '</strong>' +
                       '</div>' +
                       '<div style="font-size:12px;color:var(--kta-texte-3);">' +
                         (equipesActuelles.length > 0
                           ? equipesActuelles.map(function(g) { return _escHtml(g.nom); }).join(" · ")
                           : '<em>' + t("secours.debrief.aucuneEquipe") + '</em>') +
                       '</div>';
    if (aSuivante) {
      html += '<div style="margin-top:10px;padding:10px;background:rgba(140,180,255,0.10);border-left:3px solid rgba(140,180,255,0.55);border-radius:4px;">' +
                '<div class="kta-tx-info" style="font-size:13px;color:var(--kta-interaction);margin-bottom:4px;">' +
                  '➡️ <strong>' + t("secours.debrief.phaseSuivante") + '</strong> ' + _escHtml(nextPhase.nom) +
                '</div>' +
                '<div style="font-size:12px;color:var(--kta-texte-3);">' +
                  t("secours.debrief.equipesAssignees", { n: equipesSuivantes.length }) + ' ' +
                  (equipesSuivantes.length > 0
                    ? equipesSuivantes.map(function(g) { return _escHtml(g.nom); }).join(" · ")
                    : '<em>' + t("secours.debrief.aucuneEquipeSuivante") + '</em>') +
                '</div>' +
              '</div>';
    } else {
      html += '<div style="margin-top:10px;padding:10px;background:rgba(244,197,66,0.10);border-left:3px solid rgba(244,197,66,0.55);border-radius:4px;font-size:12px;color:var(--kta-accent-texte);">' +
                t("secours.debrief.pasDeSuivante") +
              '</div>';
    }
    html += '</div></div>' +
                   '<div class="kta-readme-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;border-top:1px solid var(--kta-bordure);">' +
                     '<button class="kta-btn kta-btn-ghost" data-action="cancel-debrief-modal">' + t("secours.btn.annulerSimple") + '</button>' +
                     '<button class="kta-btn kta-btn-primary" data-action="confirm-debrief-modal">' +
                       (aSuivante ? t("secours.btn.terminerPhase") : t("secours.btn.terminerPlan")) +
                     '</button>' +
                   '</div>' +
                 '</div>' +
               '</div>';
    // ⚠️ Attachée à <html> (cf _afficherModalePhase), sinon cachée sous la modale principale.
    document.documentElement.insertAdjacentHTML("beforeend", html);
    const modal = document.getElementById("kta-secours-debrief-modal");
    if (!modal) return;
    const textArea = modal.querySelector("#kta-sec-debrief-text");
    if (textArea) textArea.focus();

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
        // 1. Termine la phase (archive + endedAt + debrief).
        terminerPhase(scenarioId, { debrief: debriefText });
        _closeModal();
        if (aSuivante) {
          // 2a. Enchaîne sur « Lancer la phase suivante ? ».
          _afficherModaleLancerPhaseSuivante(scenarioId);
        } else {
          // 2b. Pas de phase suivante : proposer l'arrêt complet.
          window.ktaConfirm(t("secours.debrief.confirmArret", { phase: window.ktaEsc(phase.nom) }))
            .then(function(ok) {
              if (ok) {
                arreterExecution(scenarioId);
                _toast(t("secours.toast.planTermine"), "info");
              } else {
                _toast(t("secours.toast.phaseTermineeManuel", { phase: phase.nom }), "info");
              }
              if (_activeView) _switchView(_activeView);
            });
        }
      }
    });
  }

  // Mini-modale « Lancer la phase suivante ? » après le debrief : récapitulatif + Plus tard / Démarrer.
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
                       '<div style="font-size:15px;color:var(--kta-texte);margin-bottom:6px;">' +
                         '<strong>' + _escHtml(nextPhase.nom) + '</strong>' +
                       '</div>' +
                       '<div style="font-size:13px;color:var(--kta-texte-3);">' +
                         t("secours.launchNext.equipesParticipantes", { n: equipes.length }) +
                       '</div>' +
                     '</div>';
    if (equipes.length === 0) {
      html += '<div style="padding:10px;background:rgba(244,197,66,0.10);border-left:3px solid rgba(244,197,66,0.55);border-radius:4px;font-size:12px;color:var(--kta-accent-texte);">' +
                t("secours.launchNext.aucuneEquipe") +
              '</div>';
    } else {
      html += '<div style="font-size:12px;color:var(--kta-texte-3);margin-bottom:6px;">' + t("secours.launchNext.equipesLabel") + '</div>' +
              '<div style="font-size:13px;color:var(--kta-texte);">' +
                equipes.map(function(g) {
                  const couleur = PALETTE[g.couleurIdx % PALETTE.length] || PALETTE[0];
                  return '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;">' +
                           '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + couleur.hex + ';"></span>' +
                           _escHtml(g.nom) +
                         '</span>';
                }).join("") +
              '</div>';
    }
    html += '</div>' +
                   '<div class="kta-readme-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;border-top:1px solid var(--kta-bordure);">' +
                     '<button class="kta-btn kta-btn-ghost" data-action="cancel-launchnext">' + t("secours.btn.plusTard") + '</button>' +
                     '<button class="kta-btn kta-btn-primary" data-action="confirm-launchnext"' + (equipes.length === 0 ? ' disabled' : '') + '>' +
                       t("secours.btn.demarrerPhase", { phase: _escHtml(nextPhase.nom) }) +
                     '</button>' +
                   '</div>' +
                 '</div>' +
               '</div>';
    // ⚠️ Attachée à <html> (cf _afficherModalePhase), sinon cachée sous la modale principale.
    document.documentElement.insertAdjacentHTML("beforeend", html);
    const modal = document.getElementById("kta-secours-launchnext-modal");
    if (!modal) return;

    function _closeModal() {
      if (modal && modal.parentNode) modal.remove();
      _unbindEsc();
      // Re-rendu dans tous les cas (phase lancée, ou « terminée » en attente).
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

    // Bandeau : exécution active → vert (« Reprendre la vue Live », « Arrêter le plan ») ; sinon bouton jaune
    // « Lancer le plan de secours ».
    html += _renderLancerBandeau(s);
    html += _htmlActionsExt({ scenarioId: s.id, vue: "edition" });   // installation reliée

    // Section 1 : Contexte.
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
                // Dernière position + zone d'incertitude si pré-remplies depuis le Mode Perdu.
                _renderContextImportedBlock(s) +
                // Heatmap des zones probables (timeline tracker + annotations).
                _renderHeatmapToolBlock() +
                // Pause par point (partagée avec l'itinéraire principal, cf interface.js > _getItiPauseEnabled /
                // _getItiPauseMinutes) ; un changement recalcule les durées de toutes les équipes.
                _renderPauseToolBlock() +
              '</div>' +
            '</details>';

    // Section 2 : Équipes (liste + ajout) ; en multi-niveau, création automatique par niveau.
    const mlvlActive = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const availableLevels = mlvlActive ? _niveauxPourEquipesAuto() : [];
    const autoMLVLBtn = (mlvlActive && availableLevels.length > 1)
      ? '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="auto-equipes-mlvl" ' +
        'title="' + _escAttr(t("secours.edit.autoMlvlTitle", { n: availableLevels.length })) + '">' +
        t("secours.edit.autoMlvlBtn", { n: availableLevels.length }) + '</button>'
      : '';
    // Découpage du réseau en secteurs (une équipe par secteur).
    const decoupeBtn = (window.SecoursBalayage && window.Pathfinder && typeof window.Pathfinder.aDesTraces === "function" &&
                        window.Pathfinder.aDesTraces())
      ? '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="decouper-secteurs" ' +
        'title="' + _escAttr(t("secours.secteurs.btnTitle")) + '">' + t("secours.secteurs.btn") + '</button>'
      : '';
    html += '<details class="kta-secours-section" open>' +
              '<summary class="kta-secours-section-titre">' + t("secours.edit.equipesTitre", { n: s.groupes.length }) + '</summary>' +
              '<div class="kta-secours-section-body">' +
                '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
                  '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="add-groupe">' + t("secours.edit.btnAjouterEquipe") + '</button>' +
                  autoMLVLBtn +
                  decoupeBtn +
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

    // Couverture : calculée à l'ouverture du bloc (des centaines de tracés).
    html += '<details class="kta-secours-section" id="kta-secours-couverture">' +
              '<summary class="kta-secours-section-titre">' + t("secours.couv.titre") + '</summary>' +
              '<div class="kta-secours-section-body" id="kta-secours-couverture-corps"></div>' +
            '</details>';

    // Section Phases, toujours présente (1 phase : le seul bouton « Ajouter une phase » ; 2 et plus : liste).
    // Le même bouton existe en vue Live opérateur (création à chaud).
    html += _renderPhasesSection(s);

    // Section 3 : Export.
    html += '<details class="kta-secours-section">' +
              '<summary class="kta-secours-section-titre">' + t("secours.edit.exportTitre") + '</summary>' +
              '<div class="kta-secours-section-body">' +
                '<div class="kta-secours-export-actions">' +
                  '<button class="kta-btn kta-btn-primary" data-action="export-pdf">' + t("secours.edit.exportPdf") + '</button>' +
                  '<button class="kta-btn kta-btn-primary" data-action="export-kmz">' + t("secours.edit.exportKmz") + '</button>' +
                  '<button class="kta-btn kta-btn-secondary" data-action="export-mkmsec" title="' + _escAttr(t("secours.edit.exportMkmsecTitle")) + '">' + t("secours.edit.exportMkmsec") + '</button>' +
                '</div>' +
              '</div>' +
            '</details>';

    return html;
  }

  // Liste des équipes (vue Édition).
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
      // Puce « Niv X » si g.level est défini (0 → RDC, ±N, null → « Sans niveau »).
      const lvlChip = (typeof g.level === "number")
                      ? '<span class="kta-secours-groupe-level-chip" title="' + _escAttr(t("secours.groupe.levelChipTitle")) + '">' +
                        '🏗️ ' + _lblNiveau(g.level) +
                        '</span>'
                      : '';
      // Niveau de référence modifiable (multi-niveau avec availableLevels).
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
                  '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="del-groupe" data-gid="' + _escAttr(g.id) + '" title="' + _escAttr(t("secours.list.supprimerTitle")) + '">🗑️</button>' +
                  '<span class="kta-secours-groupe-resume kta-tx-muted">' + t("secours.groupe.resumeReplie", { n: nbEtapesG }) + '</span>' +
                '</div>' +
                '<div class="kta-secours-groupe-body">' +
                  '<div class="kta-secours-groupe-row">' +
                    '<label>' + t("secours.groupe.membresLabel") + '</label>' +
                    '<input type="text" data-action="edit-membres" data-gid="' + _escAttr(g.id) + '" value="' + _escAttr((g.membres || []).join(", ")) + '" placeholder="' + _escAttr(t("secours.groupe.membresPlaceholder")) + '" maxlength="200">' +
                  '</div>' +
                  // Chef d'équipe (parmi les membres), effectif, retour impératif : une ligne chacun, comme « Membres »
                  // (sur une seule ligne, ils se replient n'importe où sur téléphone).
                  '<div class="kta-secours-groupe-row">' +
                    '<label>' + t("secours.b9.chefLabel") + '</label>' +
                    ((g.membres || []).length
                      ? '<select data-action="edit-chef" data-gid="' + _escAttr(g.id) + '">' +
                          (g.membres || []).map(function(m) {
                            return '<option value="' + _escAttr(m) + '"' + (m === _chef(g) ? ' selected' : '') + '>' + _escHtml(m) + '</option>';
                          }).join('') + '</select>'
                      : '<input type="text" data-action="edit-chef" data-gid="' + _escAttr(g.id) + '" maxlength="60"' +
                        ' value="' + _escAttr(g.chef || "") + '" placeholder="' + _escAttr(t("secours.b9.chefPlaceholder")) + '">') +
                  '</div>' +
                  '<div class="kta-secours-groupe-row">' +
                    '<label>' + t("secours.b9.effectifLabel") + '</label>' +
                    '<input type="number" data-action="edit-effectif" data-gid="' + _escAttr(g.id) + '" min="1" max="99" step="1"' +
                      ' value="' + (Number.isInteger(g.effectif) ? g.effectif : '') + '" placeholder="' +
                      (Math.max((g.membres || []).length, _nbComptesEquipe(g)) || '') + '">' +
                  '</div>' +
                  _htmlAideEffectif(g) +
                  '<div class="kta-secours-groupe-row">' +
                    '<label title="' + _escAttr(t("secours.retour.imperatifTitle")) + '">' + t("secours.retour.imperatifLabel") + '</label>' +
                    '<input type="time" data-action="edit-heure-retour" data-gid="' + _escAttr(g.id) + '" value="' + _escAttr(g.heureRetour || "") + '">' +
                  '</div>' +
                  // GPS de surface de l'équipe (PC, rendez-vous pompiers…), saisi « lat, lng » (WGS84), stocké
                  // {lat, lng}, facultatif ; utilisé par le briefing pompiers PDF.
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
                  // Niveau de la zone (multi-niveau, zone polygone).
                  ((_mlvlActif() && g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3)
                    ? '<div class="kta-secours-groupe-row kta-secours-zone-niv">' +
                        '<span>' + _escHtml(g.zoneTousNiveaux ? t("secours.niv.zoneTous") : t("secours.niv.zoneAuNiveau", { niveau: _niveauZone(g) })) + '</span>' +
                        '<label><input type="checkbox" data-action="zone-tous-niveaux" data-gid="' + _escAttr(g.id) + '"' + (g.zoneTousNiveaux ? ' checked' : '') + '> ' +
                          t("secours.niv.caseTous") + '</label>' +
                      '</div>'
                    : '') +
                  // Étapes loin des galeries, gardées en vue après le calcul.
                  ((Array.isArray(g.itineraireSuggere) && g.guidage)
                    ? (function() { const txt = _texteEtapesLoin(_etapesLoin(g.guidage.raccords));
                        return txt ? '<div class="kta-secours-groupe-loin kta-tx-warn">⚠️ ' + _escHtml(txt) + '</div>' : ''; })()
                    : '') +
                  // Parcours : entrée + intermédiaires[] + sortie.
                  _renderParcoursSection(g) +
                  _htmlInfoEquipeExt(scenario.id, g.id) +
                  _htmlActionsExt({ scenarioId: scenario.id, vue: "edition", equipeId: g.id }) +
                  // Mode de parcours : plus court chemin ou balayage de la zone.
                  '<label class="kta-secours-parcours-mode">' + t("secours.balayage.label") + ' ' +
                    '<select data-action="parcours-mode" data-gid="' + _escAttr(g.id) + '">' +
                      ['court', 'complet', 'ossature'].map(function(m) {
                        return '<option value="' + m + '"' + ((g.parcoursMode || "court") === m ? ' selected' : '') + '>' +
                               t("secours.balayage.mode." + m) + '</option>';
                      }).join('') +
                    '</select></label>' +
                  '<div class="kta-secours-groupe-actions">' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="def-zone" data-gid="' + _escAttr(g.id) + '">' + t("secours.groupe.btnDefZone") + '</button>' +
                    // Tous les POI de la zone en intermédiaires, triés par proximité.
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="add-pois-zone" data-gid="' + _escAttr(g.id) + '" title="' + _escAttr(t("secours.groupe.btnPoisZoneTitle")) + '">' + t("secours.groupe.btnPoisZone") + '</button>' +
                    '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="calc-iti" data-gid="' + _escAttr(g.id) + '">' + t("secours.groupe.btnCalcIti") + '</button>' +
                  '</div>' +
                '</div>' +
              '</div>';
    });
    return html;
  }

  // Heatmap d'activité (timeline tracker + annotations) dans la section Contexte : aide à dessiner les zones
  // de recherche. ⚠️ Sources LOCALES seulement (cet appareil) : utile si le disparu a exporté sa session
  // (importée au PC), ou si le PC a déjà parcouru le réseau (zones connues vs zones blanches).
  let _secoursHeatmapActive = false;

  // ── Bandeau « Lancer le plan » + modale de rôle ────────────────────

  // Bandeau d'état : exécution active → « PLAN ACTIF » vert + Reprendre / Arrêter ; sinon bouton « Lancer le
  // plan de secours ». Rien sans équipes.
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
                   // data-live-timer="duree" : _majLiveTimers le rafraîchit chaque seconde (pas seulement au re-rendu).
                   t("secours.bandeau.lanceDepuis") + ' <span data-live-timer="duree">' + _escHtml(dureeStr) + '</span>' +
                   (exec.pausedAt ? ' · ' + t("secours.bandeau.enPause") : '') +
                 '</div>' +
               '</div>' +
               '<div class="kta-secours-lancer-bandeau-actions">' +
                 '<button class="kta-btn kta-btn-primary" data-action="reprendre-live">' +
                   t("secours.bandeau.reprendreLive") +
                 '</button>' +
                 // Vue OSM depuis le bandeau : le plan géoréférencé sur OpenStreetMap, pour briefer un secours
                 // extérieur (conditions d'accès : cf _ouvrirVueOsmDepuisSecours).
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="ouvrir-vue-osm" title="' + _escAttr(t("secours.bandeau.vueOsmTitle")) + '">' +
                   t("secours.bandeau.vueOsm") +
                 '</button>' +
                 // Briefing pompiers PDF (vue surface + équipes GPS + POI critiques).
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="briefing-pompiers" title="' + _escAttr(t("secours.bandeau.briefingTitle")) + '">' +
                   t("secours.bandeau.briefing") +
                 '</button>' +
                 // Rapport depuis l'Édition tant que l'exécution est active ; scope = rôle courant.
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="edit-rapport" data-scope="' + _escAttr(exec.role) + '" title="' + _escAttr(t("secours.bandeau.rapportTitle")) + '">' +
                   t("secours.bandeau.rapport") +
                 '</button>' +
                 '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="arreter-plan" title="' + _escAttr(t("secours.bandeau.arreterTitle")) + '">' +
                   t("secours.bandeau.arreter") +
                 '</button>' +
               '</div>' +
             '</div>';
    }
    // Exécution terminée : bandeau gris, « Voir le rapport » + relance possible.
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
                 // Vue OSM aussi pour le debrief.
                 '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="ouvrir-vue-osm" title="' + _escAttr(t("secours.bandeau.vueOsmTitleDebrief")) + '">' +
                   t("secours.bandeau.vueOsm") +
                 '</button>' +
                 // Briefing pompiers aussi après la mission.
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
             '</div>' +
             '<button class="kta-btn kta-btn-primary kta-btn-lg" data-action="ouvrir-lancer-modale">' +
               t("secours.bandeau.ctaBtn") +
             '</button>' +
           '</div>';
  }

  // Durée en ms → « Xh YYmin », « YYmin » ou « Ss ».
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

  // Modale « Lancer » puis lancement (bouton du scénario, ou fichier reçu à l'accueil avec
  // `pre = { role: "equipe" }`).
  function _ouvrirLancement(sid, pre) {
    _afficherModaleLancer(sid, function(opts) {
      const lancer = async function() {
        lancerExecution(sid, opts);
        _switchView("live");
        const lignes = [t("secours.toast.planLance")];
        // En mode équipe : se retrouver à l'entrée de son équipe.
        const place = (opts && opts.role === "equipe" && opts.currentEquipeId) ? _placerAEntree(sid, opts.currentEquipeId) : null;
        if (place) lignes.push(place);
        const horsLigne = await _verifierHorsLigne();   // prévenir sans bloquer
        if (horsLigne) lignes.push(horsLigne);
        // Contrôle des engagés : sans effectif, la rentrée ne compte personne.
        let sansEff = null;
        if (opts && opts.role === "operateur") {
          const inc = _bilanEngages(get(sid)).inconnus;
          if (inc.length) { sansEff = t("secours.bilan.lancementSansEffectif", { n: inc.length, noms: inc.join(", ") }); lignes.push(sansEff); }
        }
        _toast(lignes.join("\n"), (place || horsLigne || sansEff) ? "warn" : "info");
      };
      // Relancer efface l'intervention précédente ET ses photos (reçues des équipes comprises) : on le dit
      // avant. 🩸 Sans fenêtre de confirmation (ktaConfirm absent) : REFUS, jamais d'effacement sans question.
      const relancer = function() {
        if (get(sid) && get(sid).execution) {
          if (typeof window.ktaConfirm !== "function") {
            console.warn("[SecoursMode] relance refusée : confirmation indisponible");
            return;
          }
          window.ktaConfirm(t("secours.lancer.relanceConfirme")).then(function(ok) { if (ok) lancer(); });
        } else {
          lancer();
        }
      };
      // Une seule intervention à la fois sur un plan (cf _scenarioEnCours) : l'autre s'arrête d'abord, sur accord.
      const autre = _autreEnCours(sid);
      if (!autre) { relancer(); return; }
      if (typeof window.ktaConfirm !== "function") {
        console.warn("[SecoursMode] lancement refusé : une autre intervention tourne, confirmation indisponible");
        return;
      }
      const question = t("secours.lancer.autreEnCours", { nom: _escHtml(autre.nom || ""), quand: _escHtml(_lanceLe(autre)) });
      window.ktaConfirm(question, { okLabel: t("secours.lancer.autreArreterOk") }).then(function(ok) {
        if (!ok) return;
        arreterExecution(autre.id);
        relancer();
      });
    }, pre);
  }

  // Modale rôle + équipe avant lancement : onConfirm({role, currentEquipeId}) si validé, rien sinon.
  // `pre` (facultatif) : { role } présélectionné (« Équipe » quand on arrive d'un fichier reçu).
  function _afficherModaleLancer(scenarioId, onConfirm, pre) {
    const s = get(scenarioId);
    if (!s) return;
    const roleInitial = (pre && ["operateur", "equipe", "secouriste"].indexOf(pre.role) >= 0) ? pre.role : "operateur";
    const coche = function(r) { return r === roleInitial ? " checked" : ""; };
    const existing = document.getElementById("kta-secours-lancer-modale");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const groupesOpts = (s.groupes || []).map(function(g) {
      const couleur = PALETTE[g.couleurIdx % PALETTE.length];
      return '<option value="' + _escAttr(g.id) + '">' +
               _escHtml(g.nom) + ' (' + _escHtml(couleur.nom) + ')' +
             '</option>';
    }).join('');

    const overlay = document.createElement("div");
    overlay.id = "kta-secours-lancer-modale";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100012";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:90vh; border-left:6px solid var(--kta-accent);">' +
        '<div class="kta-readme-modal-header">' +
          '<h2 class="kta-tx-accent" style="margin:0; color:var(--kta-accent-texte);">' + t("secours.lancer.titre") + '</h2>' +
          '<button class="kta-readme-modal-close" data-action="cancel-lancer" aria-label="' + _escAttr(t("secours.btn.annulerAria")) + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="margin:0 0 14px 0;">' + t("secours.lancer.intro") + '</p>' +
          '<div class="kta-secours-lancer-roles">' +
            '<label class="kta-secours-lancer-role-row">' +
              '<input type="radio" name="kta-lancer-role" value="operateur"' + coche("operateur") + '>' +
              '<div class="kta-secours-lancer-role-info">' +
                '<div class="kta-secours-lancer-role-titre">' + t("secours.lancer.opTitre") + '</div>' +
                '<div class="kta-secours-lancer-role-desc">' +
                  t("secours.lancer.opDesc") +
                '</div>' +
              '</div>' +
            '</label>' +
            '<label class="kta-secours-lancer-role-row">' +
              '<input type="radio" name="kta-lancer-role" value="equipe"' + coche("equipe") + '>' +
              '<div class="kta-secours-lancer-role-info">' +
                '<div class="kta-secours-lancer-role-titre">' + t("secours.lancer.equipeTitre") + '</div>' +
                '<div class="kta-secours-lancer-role-desc">' +
                  t("secours.lancer.equipeDesc") +
                '</div>' +
                '<select id="kta-lancer-equipe-select" class="kta-secours-lancer-equipe-select"' + (roleInitial === "equipe" ? "" : " disabled") + '>' +
                  groupesOpts +
                '</select>' +
              '</div>' +
            '</label>' +
            '<label class="kta-secours-lancer-role-row">' +
              '<input type="radio" name="kta-lancer-role" value="secouriste"' + coche("secouriste") + '>' +
              '<div class="kta-secours-lancer-role-info">' +
                '<div class="kta-secours-lancer-role-titre">' + t("secours.lancer.secTitre") + '</div>' +
                '<div class="kta-secours-lancer-role-desc">' +
                  t("secours.lancer.secDesc") +
                '</div>' +
              '</div>' +
            '</label>' +
          '</div>' +
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
    // Le select équipe suit le rôle.
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

  // ── Vue Live (exécution terrain) ────────────────────────────────────
  // Aiguillage selon le rôle ; sans exécution active (le bandeau l'empêche normalement), retour à l'édition
  // avec un toast.
  function _renderLiveView() {
    const s = get(_currentScenarioId);
    if (!s || !_estExecutionActive(s)) {
      setTimeout(function() { _switchView("edit"); }, 100);
      return '<div class="kta-secours-live-error">' +
               '<p>' + t("secours.live.aucunPlanActif") + '</p>' +
             '</div>';
    }
    const role = s.execution.role;
    const ext = _htmlActionsExt({ scenarioId: s.id, vue: "live", role: role,
      equipeId: role === "equipe" ? s.execution.currentEquipeId : null });   // installation reliée
    if (role === "equipe")     return ext + _renderLiveViewEquipe(s);
    if (role === "operateur")  return ext + _renderLiveViewOperateur(s);
    if (role === "secouriste") return ext + _renderLiveViewSecouriste(s);
    return '<div class="kta-secours-live-error"><p>' + t("secours.live.roleInconnu", { role: _escHtml(role) }) + '</p></div>';
  }

  // Étape focalisée de la vue Live Équipe (défaut : 1re pending), réinitialisée par _liveEquipeInitFocus.
  let _liveEquipeFocusIdx = 0;

  // 🩸 Distingue l'arrivée dans la vue Live (saut vers la prochaine pending permis) de la navigation de
  // l'utilisateur (focus respecté). Sans lui, chaque « Étape précédente » re-rend, voit l'étape complétée et
  // ressaute en avant : retour impossible. Remis à true seulement par lancerExecution (reprendre à la bonne
  // étape au rechargement).
  let _liveEquipeFreshSession = true;

  // Badge « Phase X/N » des 3 en-têtes Live, MASQUÉ pour un scénario à une seule phase.
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
                  ' · ' + t("secours.live.etapeCompteur", { nom: _nomEtape(etapes[idx], idx), n: (idx + 1), total: etapes.length }) +
                '</span>' +
              '</div>' +
              '<div class="kta-secours-live-header-timer">' +
                '<span class="kta-secours-live-header-timer-icon">⏱️</span>' +
                ' <span data-live-timer="duree">' + _escHtml(dureeStr) + '</span>' +
                (s.execution.pausedAt ? ' <span class="kta-secours-live-pause-tag">⏸️ PAUSE</span>' : '') +
              '</div>' +
            '</div>';
    html += _renderLigneRetour(s, g);   
    // L'opérateur de surface qui « prend la main » sur une équipe la RELAIE (saisie radio) : il n'est pas sous
    // terre. Guidage et raccourcis de sécurité agissent sur l'appareil qui les affiche : masqués pour lui.
    const relaisSurface = !!s.execution._previousRole;
    // Suivre le parcours (guidage pas à pas), ou y revenir s'il est déjà suivi.
    if (!relaisSurface && Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2) {
      const suivi = _roadSuiviActive(s.id);
      html += (suivi && suivi.secours.equipeId === g.id)
        ? '<button class="kta-btn kta-btn-secondary kta-secours-suivre-btn" data-action="suivre-voir-carte">' + t("secours.suivre.actif") + '</button>'
        : '<button class="kta-btn kta-btn-primary kta-secours-suivre-btn" data-action="suivre-parcours" data-gid="' + _escAttr(g.id) + '">' + t("secours.suivre.btn") + '</button>';
    }
    // Raccourcis de sécurité, à un toucher depuis la vue de l'équipe.
    if (!relaisSurface) html += '<div class="kta-secours-raccourcis">' +
              '<button class="kta-btn kta-btn-danger kta-btn-sm" data-action="raccourci-sortie">' + t("secours.b10.sortie") + '</button>' +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="raccourci-xl">' + t("secours.b10.xl") + '</button>' +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="raccourci-perdu">' + t("secours.b10.perdu") + '</button>' +
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
                '<span class="kta-secours-live-step-idx">' + _numEtape(et, i) + '</span>' +
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
                  TABLEAU_STATUTS.filter(function(st) { return !st.isPending && !st.auto; }).map(function(st) {
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

              _renderLiveEtapePhotos(s, equipeId, idx) +

            '</div>';

    // ─── Navigation prev/next ───
    html += '<div class="kta-secours-live-nav">' +
              '<button class="kta-btn kta-btn-ghost" data-action="live-prev"' +
                (idx === 0 ? ' disabled' : '') + '>' + t("secours.live.etapePrecedente") + '</button>' +
              '<button class="kta-btn kta-btn-primary" data-action="live-next"' +
                (idx === etapes.length - 1 ? ' disabled' : '') + '>' + t("secours.live.etapeSuivante") + '</button>' +
            '</div>';

    // ─── Actions : Pause + Terminer + Retour édition ───
    // « Retour Opérateur » si on est arrivé par « Prendre la main » (_previousRole, persisté dans s.execution :
    // survit au rechargement).
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
              '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="live-rapport" data-scope="equipe" title="' + _escAttr(t("secours.live.rapportEquipeTitle")) + '">' +
                t("secours.bandeau.rapport") +
              '</button>' +
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
                t("secours.btn.terminerPlan") +
              '</button>' +
            '</div>';

    return html;
  }

  // Sous une étape « Victime trouvée » : où elle est + préciser + évacuer.
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
  // Bandeau en tête de la vue opérateur, une ligne par victime.
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

  // Focus sur la 1re étape pending (sinon la dernière). Saut automatique SEULEMENT à l'arrivée dans la vue
  // (_liveEquipeFreshSession) ; ensuite le focus de l'utilisateur est respecté.
  function _liveEquipeInitFocus(etapes) {
    if (!Array.isArray(etapes) || etapes.length === 0) {
      _liveEquipeFocusIdx = 0;
      return;
    }
    if (_liveEquipeFocusIdx < 0 || _liveEquipeFocusIdx >= etapes.length) {
      _liveEquipeFocusIdx = 0;
    }
    if (_liveEquipeFreshSession &&
        etapes[_liveEquipeFocusIdx] && etapes[_liveEquipeFocusIdx].completedAt) {
      const nextPending = etapes.findIndex(function(et, i) {
        return i > _liveEquipeFocusIdx && !et.completedAt;
      });
      if (nextPending >= 0) _liveEquipeFocusIdx = nextPending;
    }
    _liveEquipeFreshSession = false;
  }

  // ─── Vue Live Opérateur de surface ───
  // Une carte par équipe : couleur, statut courant, extrait de la dernière observation, dernière
  // modification. Victime = rouge clignotant, aide = orange, terminée = grise.
  function _renderLiveViewOperateur(s) {
    const dureeStr = _formatDureeMs(getExecutionDureeMs(s.id));
    const groupes = s.groupes || [];

    let html = '';
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
    html += _renderBilanEngages(s);   // engagés · sous terre · manquants

    if (groupes.length === 0) {
      html += '<div class="kta-secours-empty"><div class="kta-secours-empty-icon">🚨</div>' +
                '<p>' + t("secours.liveOp.aucuneEquipe") + '</p></div>';
    } else {
      html += '<div class="kta-secours-live-op-grid">';
      // Ordre : victime trouvée d'abord, puis les retards.
      const avecVictime = {};
      _victimesDe(s).forEach(function(v) { avecVictime[v.g.id] = true; });
      groupes.slice().sort(function(a, b) {
        return ((avecVictime[b.id] ? 1 : 0) - (avecVictime[a.id] ? 1 : 0)) ||
               (RANG_RETOUR[_etatRetour(s, a).etat] - RANG_RETOUR[_etatRetour(s, b).etat]);
      }).forEach(function(g) {
        html += _renderOperateurCard(s, g);
      });
      html += '</div>';
    }

    html += _renderMainCourante(s);   

    html += '<div class="kta-secours-live-footer">' +
              '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="live-toggle-pause">' +
                (s.execution.pausedAt ? t("secours.live.reprendre") : t("secours.live.pause")) +
              '</button>' +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="live-op-carte-globale">' +
                t("secours.liveOp.carteGlobale") +
              '</button>' +
              // Rappel général : un état tenu par l'opérateur, pas un message envoyé.
              '<button class="kta-btn kta-btn-rappel kta-btn-sm" data-action="rappel-general" title="' + _escAttr(t("secours.rappel.generalTitle")) + '">' +
                t("secours.rappel.btnGeneral") +
              '</button>' +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="ouvrir-vue-osm" title="' + _escAttr(t("secours.liveOp.vueOsmTitle")) + '">' +
                t("secours.bandeau.vueOsm") +
              '</button>' +
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="briefing-pompiers" title="' + _escAttr(t("secours.bandeau.briefingTitlePost")) + '">' +
                t("secours.bandeau.briefing") +
              '</button>' +
              '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="live-rapport" data-scope="operateur" title="' + _escAttr(t("secours.liveOp.rapportGlobalTitle")) + '">' +
                t("secours.liveOp.rapportGlobal") +
              '</button>' +
              // Import d'un rapport d'équipe (consolidation entre appareils).
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="live-op-import-rapport" title="' + _escAttr(t("secours.liveOp.importRapportTitle")) + '">' +
                t("secours.liveOp.importRapport") +
              '</button>' +
              // Ajout de phase à chaud, sans passer par l'Édition.
              '<button class="kta-btn kta-btn-secondary kta-btn-sm" data-action="add-phase" title="' + _escAttr(t("secours.liveOp.ajouterPhaseTitle")) + '">' +
                t("secours.phases.btnAjouter") +
              '</button>' +
              // « Phase terminée » → debrief : multi-phases seulement, vue opérateur seulement (prérogative du PC).
              // Liseré vert si la phase est détectée prête à clore.
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

  // Carte d'une équipe (vue Opérateur) : étape courante (plus grand idx avec startedAt), statut le plus
  // sévère, dernière observation non vide, progression.
  function _renderOperateurCard(s, g) {
    const couleur = PALETTE[g.couleurIdx % PALETTE.length];
    const etapes = _getEtapesEquipe(s, g.id);
    const nbEtapes = etapes.length;
    if (nbEtapes === 0) {
      return '<div class="kta-secours-op-card kta-secours-op-card-empty" style="border-left:4px solid ' + couleur.hex + ';">' +
               '<div class="kta-secours-op-card-titre">' +
                 '<span class="kta-secours-op-card-swatch" style="background:' + couleur.hex + ';"></span>' +
                 _escHtml(g.nom) +
               '</div>' + _htmlInfoEquipeExt(s.id, g.id) +
               '<div class="kta-secours-op-card-meta">' + t("secours.opCard.parcoursNonDefini") + '</div>' +
             '</div>';
    }

    let currentIdx = 0;
    for (let i = etapes.length - 1; i >= 0; i--) {
      if (etapes[i].startedAt || etapes[i].completedAt) { currentIdx = i; break; }
    }
    const nbDone = etapes.filter(function(e) { return !!e.completedAt; }).length;
    const isTerminee = (nbDone === nbEtapes);
    const pctDone = Math.round((nbDone / nbEtapes) * 100);

    let highestStatut = TABLEAU_STATUTS[0];   // pending
    etapes.forEach(function(et) {
      const info = _getStatutInfo(et.statut);
      if (info.severity > highestStatut.severity) highestStatut = info;
    });

    let lastObs = "";
    for (let i = etapes.length - 1; i >= 0; i--) {
      if (etapes[i].observations && etapes[i].observations.trim()) {
        lastObs = etapes[i].observations.trim();
        break;
      }
    }
    const obsSnippet = lastObs.length > 80 ? lastObs.slice(0, 77) + "…" : lastObs;

    let cls = "kta-secours-op-card";
    if (isTerminee) cls += " kta-secours-op-card-terminee";
    if (highestStatut.id === "victime") cls += " kta-secours-op-card-victime";
    if (highestStatut.id === "aide")    cls += " kta-secours-op-card-aide";

    // Dernière modification = max(completedAt, startedAt).
    let lastTs = null;
    etapes.forEach(function(et) {
      if (et.completedAt && (!lastTs || Date.parse(et.completedAt) > Date.parse(lastTs))) lastTs = et.completedAt;
      else if (et.startedAt && (!lastTs || Date.parse(et.startedAt) > Date.parse(lastTs))) lastTs = et.startedAt;
    });
    const lastTsStr = lastTs ? new Date(lastTs).toLocaleTimeString(window.ktaLocale ? window.ktaLocale() : "fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";

    const hasImported = etapes.some(function(et) { return et && et._importedFrom; });

    let html = '<div class="' + cls + '" data-equipe-id="' + _escAttr(g.id) + '" style="border-left:4px solid ' + couleur.hex + ';">' +
                 '<div class="kta-secours-op-card-titre">' +
                   '<span class="kta-secours-op-card-swatch" style="background:' + couleur.hex + ';"></span>' +
                   _escHtml(g.nom) +
                   (isTerminee ? ' <span class="kta-secours-op-card-badge-terminee">' + t("secours.opCard.badgeTerminee") + '</span>' : '') +
                   (hasImported ? ' <span class="kta-secours-imported-chip" title="' + _escAttr(t("secours.opCard.importeChipTitle")) + '">' + t("secours.opCard.importeChip") + '</span>' : '') +
                 '</div>' + _htmlInfoEquipeExt(s.id, g.id) +
                 '<div class="kta-secours-op-card-progress">' +
                   '<div class="kta-secours-op-card-progress-bar" style="width:' + pctDone + '%; background:' + couleur.hex + ';"></div>' +
                   '<span class="kta-secours-op-card-progress-label">' +
                     t("secours.opCard.etapeProgress", { nom: _nomEtape(etapes[currentIdx], currentIdx), n: (currentIdx + 1), total: nbEtapes, pct: pctDone }) +
                   '</span>' +
                 '</div>' +
                 '<div class="kta-secours-op-card-statut" style="color:' + highestStatut.color + ';">' +
                   highestStatut.emoji + ' ' + _escHtml(_statutLabel(highestStatut.id)) +
                 '</div>' +
                 (obsSnippet
                   ? '<div class="kta-secours-op-card-obs">« ' + _escHtml(obsSnippet) + ' »</div>'
                   : '<div class="kta-secours-op-card-obs kta-secours-op-card-obs-empty">' + t("secours.opCard.aucuneObs") + '</div>') +
                 '<div class="kta-secours-op-card-meta">⏱️ ' + lastTsStr + '</div>' +
                 _renderLigneRetour(s, g) +
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

  // ─── Vue Live Secouriste libre ───
  // Notes horodatées + statuts rapides, sans équipe ni étapes (renforts, reconnaissance).
  function _renderLiveViewSecouriste(s) {
    const dureeStr = _formatDureeMs(getExecutionDureeMs(s.id));
    const notes = (s.execution.etapes && s.execution.etapes._notes_libres) || [];

    let html = '';
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

    html += '<div class="kta-secours-live-etape">' +
              '<div class="kta-secours-live-etape-titre">' + t("secours.liveSec.ajouterNote") + '</div>' +
              '<div class="kta-secours-live-etape-textarea-wrap">' +
                '<textarea id="kta-sec-newnote-texte" class="kta-secours-live-etape-textarea" rows="3" maxlength="2000" placeholder="' + _escAttr(t("secours.liveSec.notePlaceholder")) + '"></textarea>' +
              '</div>' +
              '<div class="kta-secours-live-etape-statuts-rapides">' +
                '<div class="kta-secours-live-etape-statuts-titre">' + t("secours.liveSec.statutAssocie") + '</div>' +
                '<div class="kta-secours-live-etape-statuts-row">' +
                  TABLEAU_STATUTS.filter(function(st) { return !st.isPending && !st.auto; }).map(function(st) {
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

    // Notes, la plus récente en haut.
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

    html += '<div class="kta-secours-live-footer">' +
              '<button class="kta-btn kta-btn-ghost kta-btn-sm" data-action="live-toggle-pause">' +
                (s.execution.pausedAt ? t("secours.live.reprendre") : t("secours.live.pause")) +
              '</button>' +
              '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="live-rapport" data-scope="secouriste" title="' + _escAttr(t("secours.liveSec.rapportTitle")) + '">' +
                t("secours.bandeau.rapport") +
              '</button>' +
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

  // Miniatures des photos d'une étape (ouvrent le viewer plein écran, ✕ pour supprimer).
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
    if (!window.MyKTAMapHeatmap || typeof window.MyKTAMapHeatmap.afficher !== "function") {
      return "";
    }
    // « Régler » est TOUJOURS visible tant que le module Heatmap est chargé (on peut régler les sources avant
    // d'afficher) : le conditionner à l'état local + global serait fragile — la heatmap effacée depuis sa
    // propre modale ferait disparaître le bouton dont on a besoin. « Afficher/Masquer » reste dynamique.
    const isActive = _secoursHeatmapActive && window.MyKTAMapHeatmap.isVisible &&
                     window.MyKTAMapHeatmap.isVisible();
    return '<div class="kta-secours-tool-block">' +
             '<div class="kta-secours-tool-block-titre">' + t("secours.heatmap.titre") + '</div>' +
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

  // Bloc « durée estimée » : vitesse de fouille + pause par étape, propres au SCÉNARIO (`reglagesDuree`),
  // indépendants de l'itinéraire principal. Un changement recalcule les durées de toutes les équipes.
  function _renderPauseToolBlock() {
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
                 '<label for="kta-sec-vitesse-app">' + t("secours.duree.vitesseApprocheLabel") + '</label>' +
                 '<input type="number" id="kta-sec-vitesse-app" min="0.2" max="8" step="0.1" value="' + r.vitesseApprocheKmh + '">' +
                 '<span class="kta-secours-pause-unit">km/h</span>' +
               '</div>' +
               '<div class="kta-secours-pause-input-wrap">' +
                 '<label for="kta-sec-pause-min">' + t("secours.duree.pauseLabel") + '</label>' +
                 '<input type="number" id="kta-sec-pause-min" min="0" max="120" step="1" value="' + Math.round(r.pauseMin) + '">' +
                 '<span class="kta-secours-pause-unit">min</span>' +
               '</div>' +
               '<div class="kta-secours-pause-input-wrap">' +
                 '<label for="kta-sec-marge">' + t("secours.duree.margeLabel") + '</label>' +
                 '<input type="number" id="kta-sec-marge" min="0" max="240" step="5" value="' + Math.round(r.margeRetardMin) + '">' +
                 '<span class="kta-secours-pause-unit">min</span>' +
               '</div>' +
             '</div>' +
           '</div>';
  }

  // 🩸 Réglages de durée propres au Secours (décision produit) : la vitesse de l'itinéraire (5 km/h) et sa
  // pause commune ajoutée à CHAQUE étape donnent des durées absurdes (pauses > trajet). Ils voyagent dans le
  // .mkmsec. L'approche (hors de la zone de l'équipe) se marche, seule la zone se fouille : deux vitesses.
  const DUREE_DEFAUT = { vitesseKmh: 1.5, vitesseApprocheKmh: 3, pauseMin: 0, margeRetardMin: 30 };   // marge : seuil du retard rouge
  function _reglagesDuree(s) {
    const r = (s && s.reglagesDuree) || {};
    return {
      vitesseKmh: (typeof r.vitesseKmh === "number" && r.vitesseKmh > 0) ? r.vitesseKmh : DUREE_DEFAUT.vitesseKmh,
      vitesseApprocheKmh: (typeof r.vitesseApprocheKmh === "number" && r.vitesseApprocheKmh > 0) ? r.vitesseApprocheKmh : DUREE_DEFAUT.vitesseApprocheKmh,
      pauseMin:   (typeof r.pauseMin === "number" && r.pauseMin >= 0) ? r.pauseMin : DUREE_DEFAUT.pauseMin,
      margeRetardMin: (typeof r.margeRetardMin === "number" && r.margeRetardMin >= 0) ? r.margeRetardMin : DUREE_DEFAUT.margeRetardMin
    };
  }
  // `geo` (facultatif) = { path, raccords, g } : sépare approche et fouille, compte les raccords à vol
  // d'oiseau (départ et arrivée une fois, étape en aller-retour) à la vitesse de fouille. Sans zone
  // polygone, tout le trajet compte en fouille.
  function _dureeEquipeMin(s, distM, nbWaypoints, geo) {
    if (typeof distM !== "number" || distM <= 0) return 0;
    const r = _reglagesDuree(s);
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    let fouilleM = distM, approcheM = 0;
    const g = geo && geo.g, path = geo && geo.path;
    if (g && g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3 &&
        Array.isArray(path) && path.length >= 2) {
      let dedans = 0, total = 0;
      for (let i = 1; i < path.length; i++) {
        const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
        total += d;
        if (_dansZonePolygone(g, { x: (path[i].x + path[i - 1].x) / 2, y: (path[i].y + path[i - 1].y) / 2 }, path[i].level)) dedans += d;
      }
      if (total > 0) { fouilleM = distM * dedans / total; approcheM = distM - fouilleM; }
    }
    // Balayage : le trajet HORS des galeries de la zone (approche, retour, liaisons) compte à la vitesse
    // d'approche.
    if (geo && typeof geo.approcheM === "number" && geo.approcheM >= 0) {
      approcheM = Math.min(distM, geo.approcheM); fouilleM = distM - approcheM;
    }
    let raccordsM = 0;
    ((geo && geo.raccords) || []).forEach(function(rc) {
      raccordsM += ((Number(rc && rc.distPx) || 0) / pxParM) * ((rc && rc.role === "etape") ? 2 : 1);
    });
    return (fouilleM + raccordsM) / (r.vitesseKmh * 1000 / 60) + approcheM / (r.vitesseApprocheKmh * 1000 / 60) +
           Math.max(0, (nbWaypoints || 0) - 2) * r.pauseMin;
  }
  function _geoDuree(g) {
    return { g: g, path: g && g.itineraireSuggere, raccords: g && g.guidage && g.guidage.raccords,
             approcheM: (_estBalayage(g) && typeof g.approcheM === "number") ? g.approcheM : undefined };
  }

  // Scénario sans `reglagesDuree` : réglages par défaut posés (migration idempotente) et durées recalculées
  // (sinon cartes, PDF et KMZ gardent les anciennes durées). Rend true si le scénario a changé.
  function _migrerDurees(s) {
    if (!s || typeof s !== "object" || s.reglagesDuree) return false;
    s.reglagesDuree = { vitesseKmh: DUREE_DEFAUT.vitesseKmh, pauseMin: DUREE_DEFAUT.pauseMin };
    (s.groupes || []).forEach(function(g) {
      if (typeof g.distanceM !== "number" || g.distanceM <= 0) return;
      const nbWp = (g.entree ? 1 : 0) + (Array.isArray(g.intermediaires) ? g.intermediaires.length : 0) + (g.sortie ? 1 : 0);
      g.dureeEstimeeMin = _dureeEquipeMin(s, g.distanceM, nbWp, _geoDuree(g));
    });
    return true;
  }

  // Recalcule les durées des équipes dont l'itinéraire est calculé (distanceM connue) : cartes, PDF, KMZ.
  function _recalculerToutesDureesEquipes(scenarioId) {
    const s = get(scenarioId);
    if (!s || !Array.isArray(s.groupes) || s.groupes.length === 0) return 0;
    let updated = 0;
    s.groupes.forEach(function(g) {
      if (typeof g.distanceM !== "number" || g.distanceM <= 0) return;
      const nbWp = (g.entree ? 1 : 0)
                 + (Array.isArray(g.intermediaires) ? g.intermediaires.length : 0)
                 + (g.sortie ? 1 : 0);
      const newDuree = _dureeEquipeMin(s, g.distanceM, nbWp, _geoDuree(g));
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

  // Dernière position + zone d'incertitude venues du Mode Perdu (lecture seule) : Recentrer, Retirer.
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

  function _renderParcoursSection(g) {
    let html = '<div class="kta-secours-parcours">';
    html += '<div class="kta-secours-parcours-titre">' + t("secours.parcours.titre") + '</div>';
    html += '<div class="kta-secours-parcours-list">';
    // Boucle entrée = sortie : bordure orange sur ces deux lignes (comme le marqueur « Boucle » de la carte).
    const isBoucle = _samePoint(g.entree, g.sortie);
    html += _renderWaypointRow(g, "entree", g.entree, null, "📍", t("secours.parcours.entree"), isBoucle);
    (g.intermediaires || []).forEach(function(w, i) {
      html += _renderWaypointRow(g, "intermediaire", w, i, "▾", t("secours.parcours.etape", { n: (i + 1) }), false);
    });
    html += '<button class="kta-btn kta-btn-ghost kta-btn-sm kta-secours-parcours-add"' +
            ' data-action="add-intermediaire" data-gid="' + _escAttr(g.id) + '">' +
            t("secours.parcours.btnAjouterEtape") + '</button>';
    html += _renderWaypointRow(g, "sortie", g.sortie, null, "🚪", t("secours.parcours.sortie"), isBoucle);
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
    // data-loop="1" sur entrée + sortie en boucle (bordure orange en CSS).
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

  // Même accès = même point, ou même niveau à moins de 10 m. 🩸 Entrée et sortie posées à 1 m (deux clics)
  // ne seraient sinon pas « le même point » : la sortie se dessinerait PAR-DESSUS l'entrée sur les cartes.
  function _memeAcces(a, b) {
    if (_samePoint(a, b)) return true;
    if (!a || !b || typeof a.x !== "number" || typeof b.x !== "number") return false;
    if ((a.level == null ? null : a.level) !== (b.level == null ? null : b.level)) return false;
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    return Math.hypot(a.x - b.x, a.y - b.y) / pxParM < 10;
  }
  function _samePoint(a, b) {
    if (!a || !b) return false;
    // L'uid d'abord (deux POI homonymes ne sont pas le même point), puis le pointId (nom), puis les
    // coordonnées à 0,5 px près.
    if (a.pointUid && b.pointUid) return a.pointUid === b.pointUid;
    if (a.pointId && b.pointId) return a.pointId === b.pointId;
    return Math.abs((a.x || 0) - (b.x || 0)) < 0.5
        && Math.abs((a.y || 0) - (b.y || 0)) < 0.5;
  }

  // Un tracé passe-t-il au niveau `lvl` ? Tracé : son level (0 par défaut, comme pathfinder.js) ; jonction : ses deux
  // extrémités.
  function _traceAuNiveau(road, lvl) {
    if (road && road.type === "jonction") {
      return (Number.isInteger(road.fromLevel) ? road.fromLevel : 0) === lvl ||
             (Number.isInteger(road.toLevel) ? road.toLevel : 0) === lvl;
    }
    return (road && Number.isInteger(road.level) ? road.level : 0) === lvl;
  }

  // Géométrie de « POI de la zone ». Ray-casting (comme pathfinder.js > _pointInPolygon).
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

  // Distance d'un point à un segment AB (pixels).
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

  // ── Handlers par vue ────────────────────────────────────────────────
  function _bindViewHandlers(view) {
    const corps = document.getElementById("kta-secours-corps");
    if (!corps) return;

    if (view === "list") {
      corps.querySelectorAll('[data-action="new-scenario"]').forEach(function(btn) {
        btn.addEventListener("click", function() { _switchView("create"); });
      });
      corps.querySelectorAll('[data-action="open-scenario"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _currentScenarioId = btn.getAttribute("data-id");
          _switchView("edit");
        });
      });
      corps.querySelectorAll('[data-action="dup-scenario"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const newS = duplicateScenario(btn.getAttribute("data-id"));
          if (newS) _switchView("list");
        });
      });
      corps.querySelectorAll('[data-action="del-scenario"]').forEach(function(btn) {
        btn.addEventListener("click", async function() {
          const id = btn.getAttribute("data-id");
          const s = get(id);
          if (!s) return;
          if (await window.ktaConfirm(t("secours.confirm.supprimerScenario", { nom: window.ktaEsc(s.nom) }))) {
            deleteScenario(id);
            _switchView("list");
          }
        });
      });
      corps.querySelectorAll('[data-action="import-mkmsec"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _ouvrirImportMkmsecPicker();
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
      corps.querySelectorAll('[data-action="back-to-list"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          clearOverlay();
          _currentScenarioId = null;
          _switchView("list");
        });
      });
      // Bandeau « Lancer le plan ».
      corps.querySelectorAll('[data-action="ouvrir-lancer-modale"]').forEach(function(btn) {
        btn.addEventListener("click", function() { _ouvrirLancement(s.id); });
      });
      corps.querySelectorAll('[data-action="reprendre-live"]').forEach(function(btn) {
        btn.addEventListener("click", function() { _switchView("live"); });
      });
      corps.querySelectorAll('[data-action="arreter-plan"]').forEach(function(btn) {
        btn.addEventListener("click", async function() {
          if (!(await window.ktaConfirm(t("secours.confirm.arreterPlan")))) return;
          arreterExecution(s.id);
          _toast(t("secours.toast.planArrete"), "info");
          _switchView("edit");
        });
      });
      // Rapport depuis le bandeau de l'Édition (exécution active ou terminée) ; scope lu dans data-scope.
      corps.querySelectorAll('[data-action="edit-rapport"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const scope = btn.getAttribute("data-scope") || (s.execution && s.execution.role) || "operateur";
          _afficherModaleRapport(s.id, scope);
        });
      });
      corps.querySelectorAll('[data-action="ouvrir-vue-osm"]').forEach(function(btn) {
        btn.addEventListener("click", _ouvrirVueOsmDepuisSecours);
      });
      // Briefing pompiers : modale d'options (couches OSM) AVANT la génération.
      corps.querySelectorAll('[data-action="briefing-pompiers"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _afficherModaleBriefingOptions(s.id);
        });
      });
      // Bascule de l'overlay carte : masque la modale (plein écran, elle cache la carte) et affiche un bouton
      // flottant « Retour » pour la rouvrir.
      corps.querySelectorAll('[data-action="toggle-overlay"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (_overlayLayer) {
            clearOverlay();
            if (_modal) _modal.style.display = "";
            _removeOverlayFloater();
            btn.textContent = t("secours.edit.voirCarte");
          } else {
            renderOverlay(_currentScenarioId);
            if (_modal) _modal.style.display = "none";
            _showOverlayFloater();
            btn.textContent = t("secours.edit.masquer");
          }
        });
      });
      // Nom du scénario : enregistré au blur.
      const nomInput = document.getElementById("kta-sec-edit-nom");
      if (nomInput) {
        nomInput.addEventListener("blur", function() {
          updateScenario(s.id, { nom: nomInput.value });
        });
      }
      // Champs de contexte : enregistrés au change.
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
      corps.querySelectorAll('[data-action="clear-lostpos"]').forEach(function(btn) {
        btn.addEventListener("click", async function() {
          if (!(await window.ktaConfirm(t("secours.confirm.retirerLostpos")))) return;
          updateScenario(s.id, {
            context: { lastKnownPoint: null, zoneIncertitude: null }
          });
          _switchView("edit");
        });
      });
      corps.querySelectorAll('[data-action="toggle-heatmap-secours"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (!window.MyKTAMapHeatmap) { _toast(t("secours.toast.heatmapIndisponible"), "error"); return; }
          if (_secoursHeatmapActive && window.MyKTAMapHeatmap.isVisible()) {
            window.MyKTAMapHeatmap.effacer();
            _secoursHeatmapActive = false;
            _toast(t("secours.toast.heatmapMasquee"), "info");
          } else {
            // Overlay activé s'il ne l'est pas (sinon la modale cache tout).
            if (!_overlayLayer) {
              renderOverlay(_currentScenarioId);
              if (_modal) _modal.style.display = "none";
              _showOverlayFloater();
            }
            // Toutes les sources principales (la timeline du tracker = principal indice du passage du disparu).
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
      // Réglages avancés dans la modale Heatmap classique : un MutationObserver détecte sa disparition (✕,
      // Échap, fond, Effacer) et réaffiche la modale Mode Secours — sinon elle resterait cachée.
      corps.querySelectorAll('[data-action="config-heatmap-secours"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          if (!window.MyKTAMapHeatmap || typeof window.MyKTAMapHeatmap.ouvrirModale !== "function") {
            _toast(t("secours.toast.heatmapModaleIndispo"), "error");
            return;
          }
          if (_modal) _modal.style.display = "none";
          window.MyKTAMapHeatmap.ouvrirModale();
          // Id de la modale : "kta-heatmap-modal" (js/heatmap.js).
          const hmModal = document.getElementById("kta-heatmap-modal");
          if (!hmModal) {
            // ouvrirModale n'a pas pu l'ajouter : on réaffiche tout de suite.
            if (_modal) _modal.style.display = "";
            return;
          }
          const obs = new MutationObserver(function() {
            if (!document.body.contains(hmModal)) {
              if (_modal) _modal.style.display = "";
              // Re-rendu (libellé Afficher/Masquer : _secoursHeatmapActive a pu changer).
              if (_currentScenarioId) _switchView("edit");
              obs.disconnect();
            }
          });
          obs.observe(hmModal.parentNode || document.body, { childList: true });
        });
      });
      // Réglages de durée du scénario : un changement recalcule les durées de toutes les équipes.
      const vitesseInput = document.getElementById("kta-sec-vitesse");
      const vitesseAppInput = document.getElementById("kta-sec-vitesse-app");
      const pauseMinInput = document.getElementById("kta-sec-pause-min");
      const margeInput = document.getElementById("kta-sec-marge");
      const majDurees = function() {
        updateScenario(_currentScenarioId, { reglagesDuree: {
          vitesseKmh: parseFloat(vitesseInput && vitesseInput.value),
          vitesseApprocheKmh: parseFloat(vitesseAppInput && vitesseAppInput.value),
          pauseMin:   parseFloat(pauseMinInput && pauseMinInput.value),
          margeRetardMin: parseFloat(margeInput && margeInput.value)
        } });
        const updated = _recalculerToutesDureesEquipes(_currentScenarioId);
        _toast(t("secours.toast.dureesMaj", { n: updated }), "info");
        _switchView("edit");
      };
      // « change » (blur + Entrée), pas « input » : pas de recalcul à chaque chiffre.
      if (vitesseInput) vitesseInput.addEventListener("change", majDurees);
      if (pauseMinInput) pauseMinInput.addEventListener("change", majDurees);
      if (margeInput) margeInput.addEventListener("change", majDurees);
      // « + Ajouter une équipe » : en multi-niveau, mini-prompt nom + niveau ; sinon ajout direct, nom auto.
      corps.querySelectorAll('[data-action="add-groupe"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const isMlvl = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
          if (!isMlvl) {
            addGroupe(s.id, null);
            _switchView("edit");
            return;
          }
          _ouvrirCreerEquipeMlvlPrompt(s.id);
        });
      });
      // Création automatique d'une équipe par niveau.
      corps.querySelectorAll('[data-action="auto-equipes-mlvl"]').forEach(function(btn) {
        btn.addEventListener("click", async function() {
          if (!window.APP_CONFIG || window.APP_CONFIG.multiLevel !== true) {
            _toast(t("secours.toast.mlvlNonActif"), "warn");
            return;
          }
          const levels = _niveauxPourEquipesAuto();
          if (levels.length < 2) {
            _toast(t("secours.toast.auMoins2Niveaux"), "warn");
            return;
          }
          // Confirmation si des équipes existent déjà.
          if (s.groupes.length > 0) {
            if (!(await window.ktaConfirm(t("secours.confirm.autoEquipes",
              { existant: s.groupes.length, nouveau: levels.length })))) return;
          }
          // Une équipe par niveau (« Niveau X », RDC pour 0), level passé explicitement à addGroupe (sinon
          // APP_CONFIG.activeLevel l'écraserait).
          levels.forEach(function(lvl) {
            const nom = t("secours.level.niveau", { label: _lblNiveau(lvl) });
            const g = addGroupe(s.id, nom, lvl);
            // Pas de point fictif d'entrée (des coordonnées (0,0) pollueraient le parcours) : le niveau n'est qu'un
            // indice, le vrai point et son niveau se posent au clic.
          });
          _toast(t("secours.toast.equipesCreees", { n: levels.length }), "info");
          _switchView("edit");
        });
      });
      corps.querySelectorAll('[data-action="decouper-secteurs"]').forEach(function(btn) {
        btn.addEventListener("click", function() { _decouperEnSecteurs(s.id); });
      });
      // Phases : add / edit / delete, en Édition ET dans le pied de la vue Live opérateur.
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
        btn.addEventListener("click", async function() {
          if (btn.hasAttribute("disabled")) return;
          const idxAttr = btn.getAttribute("data-phase-idx");
          const idx = parseInt(idxAttr, 10);
          if (!Number.isInteger(idx)) return;
          const phase = s.phases[idx];
          if (!phase) return;
          const confirmMsg = t("secours.confirm.supprimerPhase", { nom: window.ktaEsc(phase.nom) });
          if (!(await window.ktaConfirm(confirmMsg))) return;
          const ok = supprimerPhase(s.id, idx);
          if (ok) {
            _toast(t("secours.toast.phaseSupprimee"), "info");
            _switchView(_activeView || "edit");
          } else {
            _toast(t("secours.toast.phaseSuppressionImpossible"), "error");
          }
        });
      });
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
      corps.querySelectorAll('[data-action="rename-groupe"]').forEach(function(inp) {
        inp.addEventListener("blur", function() {
          updateGroupe(s.id, inp.getAttribute("data-gid"), { nom: inp.value });
        });
      });
      // Couverture, calculée à l'ouverture.
      const couv = document.getElementById("kta-secours-couverture");
      if (couv) couv.addEventListener("toggle", function() {
        if (!couv.open) return;
        const corpsCouv = document.getElementById("kta-secours-couverture-corps");
        if (!corpsCouv) return;
        corpsCouv.innerHTML = _renderCouverture(get(s.id));
        const btnS = corpsCouv.querySelector('[data-action="couv-surligner"]');
        if (btnS) btnS.addEventListener("click", function() { _basculerSurlignageCouverture(get(s.id)); if (_modal) _switchView("edit"); });
      });
      corps.querySelectorAll('[data-action="edit-chef"]').forEach(function(sel) {
        sel.addEventListener("change", function() { updateGroupe(s.id, sel.getAttribute("data-gid"), { chef: sel.value }); });
      });
      corps.querySelectorAll('[data-action="zone-tous-niveaux"]').forEach(function(cb) {
        cb.addEventListener("change", function() {
          updateGroupe(s.id, cb.getAttribute("data-gid"), { zoneTousNiveaux: cb.checked });
          _recalculerToutesDureesEquipes(s.id);   // la part « fouille » dépend du niveau de la zone
          _switchView("edit");
        });
      });
      corps.querySelectorAll('[data-action="edit-heure-retour"]').forEach(function(inp) {
        inp.addEventListener("change", function() { updateGroupe(s.id, inp.getAttribute("data-gid"), { heureRetour: inp.value || null }); });
      });
      corps.querySelectorAll('[data-action="edit-effectif"]').forEach(function(inp) {
        inp.addEventListener("change", function() {
          updateGroupe(s.id, inp.getAttribute("data-gid"), { effectif: inp.value });
          _majAideEffectif(s.id, inp.getAttribute("data-gid"));
        });
      });
      corps.querySelectorAll('[data-action="edit-membres"]').forEach(function(inp) {
        inp.addEventListener("blur", function() {
          const arr = inp.value.split(",").map(function(x) { return x.trim(); }).filter(Boolean);
          updateGroupe(s.id, inp.getAttribute("data-gid"), { membres: arr });
          _majAideEffectif(s.id, inp.getAttribute("data-gid"));
        });
      });
      // GPS de surface : « lat, lng » → {lat, lng} ; vide ou invalide → null.
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
      corps.querySelectorAll('[data-action="change-couleur"]').forEach(function(sel) {
        sel.addEventListener("change", function() {
          updateGroupe(s.id, sel.getAttribute("data-gid"), { couleurIdx: parseInt(sel.value, 10) });
          _switchView("edit");      // re-render pour update du swatch
        });
      });
      corps.querySelectorAll('[data-action="change-level"]').forEach(function(sel) {
        sel.addEventListener("change", function() {
          const v = sel.value;
          const level = (v === "" || v == null) ? null : parseInt(v, 10);
          updateGroupe(s.id, sel.getAttribute("data-gid"), { level: level });
          _switchView("edit");      // re-render pour update du chip
        });
      });
      corps.querySelectorAll('[data-action="del-groupe"]').forEach(function(btn) {
        btn.addEventListener("click", async function() {
          const gid = btn.getAttribute("data-gid");
          const g = s.groupes.find(function(x) { return x.id === gid; });
          if (!g) return;
          if (await window.ktaConfirm(t("secours.confirm.supprimerEquipe", { nom: window.ktaEsc(g.nom) }))) {
            removeGroupe(s.id, gid);
            _switchView("edit");
          }
        });
      });
      // Choix d'un point (entrée / intermédiaire / sortie) : recherche + clic carte.
      corps.querySelectorAll('[data-action="pick-waypoint"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const gid = btn.getAttribute("data-gid");
          const role = btn.getAttribute("data-role");
          const idxAttr = btn.getAttribute("data-idx");
          const idx = (idxAttr !== null && idxAttr !== "") ? parseInt(idxAttr, 10) : null;
          _ouvrirChoixWaypoint(gid, role, idx);
        });
      });
      // Intermédiaire ajouté en fin de liste, picker ouvert aussitôt.
      corps.querySelectorAll('[data-action="add-intermediaire"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const gid = btn.getAttribute("data-gid");
          const grp = s.groupes.find(function(x) { return x.id === gid; });
          if (!grp) return;
          const newIdx = (grp.intermediaires || []).length;
          _ouvrirChoixWaypoint(gid, "intermediaire", newIdx);
        });
      });
      corps.querySelectorAll('[data-action="clear-waypoint"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const gid = btn.getAttribute("data-gid");
          const role = btn.getAttribute("data-role");
          const idxAttr = btn.getAttribute("data-idx");
          const idx = (idxAttr !== null && idxAttr !== "") ? parseInt(idxAttr, 10) : null;
          _clearWaypoint(gid, role, idx);
        });
      });
      // Définir la zone (polygone ou tracés, au choix).
      corps.querySelectorAll('[data-action="def-zone"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _ouvrirChoixZoneMode(btn.getAttribute("data-gid"));
        });
      });
      corps.querySelectorAll('[data-action="add-pois-zone"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          _ajouterPoisDansZone(s.id, btn.getAttribute("data-gid"));
        });
      });
      // Mode de parcours : recalcul immédiat si un parcours existait.
      corps.querySelectorAll('[data-action="parcours-mode"]').forEach(function(sel) {
        sel.addEventListener("change", function() {
          const gid = sel.getAttribute("data-gid");
          updateGroupe(s.id, gid, { parcoursMode: sel.value });
          const g = (get(s.id).groupes || []).find(function(x) { return x.id === gid; });
          if (g && g.entree && g.sortie && Array.isArray(g.itineraireSuggere)) _recalculerItineraireGroupe(s.id, gid);
        });
      });
      corps.querySelectorAll('[data-action="calc-iti"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          const gid = btn.getAttribute("data-gid");
          // Overlay « calcul en cours » : Pathfinder.computeRoute est SYNCHRONE et bloquant, sans laisser peindre
          // l'écran fige.
          const _msg = (window.I18n && window.I18n.t) ? window.I18n.t("secours.compute.loading") : "Calcul de l'itinéraire…";
          if (window.ComputeLoader && window.ComputeLoader.wrap) {
            window.ComputeLoader.wrap(function() { return _recalculerItineraireGroupe(s.id, gid); }, _msg);
          } else {
            _recalculerItineraireGroupe(s.id, gid);
          }
        });
      });
      // Export PDF (async : rendu de la carte de chaque équipe).
      corps.querySelectorAll('[data-action="export-pdf"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          Promise.resolve(exporterPDF(s.id)).catch(function(e) {
            console.warn("[SecoursMode] exporterPDF rejected :", e);
            _toast(t("secours.toast.erreurPdf", { message: (e.message || e) }), "error");
          });
        });
      });
      corps.querySelectorAll('[data-action="export-kmz"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          // exporterKMZ est async (image du plan) : on attrape les rejets.
          Promise.resolve(exporterKMZ(s.id)).catch(function(e) {
            console.warn("[SecoursMode] exporterKMZ rejected :", e);
            _toast(t("secours.toast.erreurKmz", { message: (e.message || e) }), "error");
          });
        });
      });
      corps.querySelectorAll('[data-action="export-mkmsec"]').forEach(function(btn) {
        btn.addEventListener("click", function() { exporterScenario(s.id); });
      });
    }

    // Vue Live (3 sous-modes).
    if (view === "live") {
      const s = get(_currentScenarioId);
      if (!s || !_estExecutionActive(s)) {
        // Pas d'exécution : retour à l'édition (déjà géré par _renderLiveView).
        return;
      }
      const role = s.execution.role;

      _bindLiveCommonHandlers(corps, s);

      if (role === "equipe")     _bindLiveEquipeHandlers(corps, s);
      if (role === "operateur")  _bindLiveOperateurHandlers(corps, s);
      if (role === "secouriste") _bindLiveSecouristeHandlers(corps, s);
    }
  }

  // Handlers communs aux 3 sous-vues Live.
  function _bindLiveCommonHandlers(corps, s) {
    // Raccourcis : la fenêtre se ferme (zone et tracé restent sur la carte).
    const raccourci = function(action, fn) {
      corps.querySelectorAll('[data-action="' + action + '"]').forEach(function(btn) {
        btn.addEventListener("click", function() {
          fermer();
          try { fn(); } catch(e) { console.warn("[SecoursMode] raccourci " + action + " :", e); }
        });
      });
    };
    raccourci("raccourci-sortie", function() { if (window.SortieUrgence) window.SortieUrgence.declencher(); });
    raccourci("raccourci-xl", function() { if (window.EmergencyMode) window.EmergencyMode.activer(); });
    raccourci("raccourci-perdu", function() { if (window.LostMode) window.LostMode.open(); });
    // Main courante : note libre de l'opérateur.
    corps.querySelectorAll('[data-action="mc-ajouter"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const ta = document.getElementById("kta-secours-mc-texte");
        const txt = ta ? ta.value.trim() : "";
        if (!txt) return;
        const s2 = get(s.id);
        if (!s2 || !s2.execution) return;
        _journaliser(s2, "secours.mc.note", { texte: txt.slice(0, 1000) });
        _commitMutation(s2);
        _switchView("live");
      });
    });
    // Suivre le parcours de l'équipe / revenir à la carte.
    corps.querySelectorAll('[data-action="suivre-parcours"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        // « Suivre » démarre aussi le suivi (sinon bandeau de guidage vide), ICI dans le geste : iOS n'accorde la
        // permission des capteurs que sur un geste. Même chemin que la tuile de lancement du tracker.
        const actif = (typeof window.getTrackingActif === "function") && window.getTrackingActif();
        if (!actif && typeof window.ktaDemarrerSuivi === "function") {
          try { window.ktaDemarrerSuivi(); } catch(e) { console.warn("[SecoursMode] démarrage du suivi :", e); }
        }
        _suivreParcours(s.id, btn.getAttribute("data-gid"));
      });
    });
    corps.querySelectorAll('[data-action="suivre-voir-carte"]').forEach(function(btn) {
      btn.addEventListener("click", function() { fermer(); });
    });
    // Rappel : général (équipes engagées, ni rentrées ni déjà rappelées) ou d'une équipe.
    corps.querySelectorAll('[data-action="rappel-general"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _rappeler(s.id, _equipesARappeler(get(s.id)).map(function(g) { return g.id; })).then(function(fait) {
          if (fait && _modal) _switchView("live");
        });
      });
    });
    corps.querySelectorAll('[data-action="rappel-equipe"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _rappeler(s.id, [btn.getAttribute("data-gid")]).then(function(fait) {
          if (fait && _modal) _switchView("live");
        });
      });
    });
    // Départ / rentrée d'une équipe (vue équipier ou carte opérateur).
    corps.querySelectorAll('[data-action="retour-depart"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        marquerSuivi(s.id, btn.getAttribute("data-gid"), "departAt");
        _switchView("live");
      });
    });
    // La rentrée (et sa correction) passe par le compte des remontés.
    corps.querySelectorAll('[data-action="retour-rentree"], [data-action="retour-remontes"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _demanderRemontes(s.id, btn.getAttribute("data-gid")).then(function(fait) {
          if (fait && _modal) _switchView("live");
        });
      });
    });
    // Voir / évacuer / préciser la victime (index dans _victimesDe au rendu).
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
        // Options brancard d'abord (éviter l'eau, les remblais… ; lever les inaccessibles en
        // dernier recours), puis la Sortie d'urgence depuis la victime.
        _demanderOptionsBrancard(function(contraintes) {
          fermer();   // la zone et le tracé restent (intervention en cours)
          // Les accès du scénario (où sont déjà les moyens de surface) sont candidats à l'évacuation, pas seulement
          // les accès tagués OUVERTS du plan (parfois un seul, bien plus loin qu'un retour par l'entrée de
          // l'équipe) ; un accès tagué fermé le dit (« à ouvrir »).
          window.SortieUrgence.declencherDepuis(v.pos.x, v.pos.y, v.pos.level,
            { sortiesSupp: _sortiesScenario(s), origine: "victime", contraintes: contraintes });
        });
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
    // Retour à l'édition (l'exécution reste active).
    corps.querySelectorAll('[data-action="back-to-edit"]').forEach(function(btn) {
      btn.addEventListener("click", function() { _switchView("edit"); });
    });
    // « Ajouter une phase » dans le pied de la vue Live opérateur (création à chaud).
    corps.querySelectorAll('[data-action="add-phase"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _afficherModalePhase(s.id, null);
      });
    });
    corps.querySelectorAll('[data-action="arreter-plan-live"]').forEach(function(btn) {
      btn.addEventListener("click", async function() {
        if (!(await window.ktaConfirm(t("secours.confirm.terminerPlanLive")))) return;
        arreterExecution(s.id);
        _toast(t("secours.toast.planTermineSauv"), "info");
        _switchView("edit");
      });
    });
    corps.querySelectorAll('[data-action="live-toggle-pause"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const isPaused = !!s.execution.pausedAt;
        pauseExecution(s.id, !isPaused);
        _toast(isPaused ? t("secours.toast.reprisePlan") : t("secours.toast.planEnPause"), "info");
        _switchView("live");
      });
    });
    // Rapport (3 vues Live) : scope lu dans data-scope ("equipe" | "operateur" | "secouriste").
    corps.querySelectorAll('[data-action="live-rapport"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const scope = btn.getAttribute("data-scope") || s.execution.role;
        _afficherModaleRapport(s.id, scope);
      });
    });
    // Vue OSM (3 vues Live), conditions gérées par _ouvrirVueOsmDepuisSecours.
    corps.querySelectorAll('[data-action="ouvrir-vue-osm"]').forEach(function(btn) {
      btn.addEventListener("click", _ouvrirVueOsmDepuisSecours);
    });
    // Briefing pompiers (3 vues Live) : modale d'options de couches OSM avant la génération.
    corps.querySelectorAll('[data-action="briefing-pompiers"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _afficherModaleBriefingOptions(s.id);
      });
    });
  }

  // Handlers de la vue Live Équipe.
  function _bindLiveEquipeHandlers(corps, s) {
    const equipeId = s.execution.currentEquipeId;
    const etapes = _getEtapesEquipe(s, equipeId);
    if (etapes.length === 0) return;
    const idx = _liveEquipeFocusIdx;

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
          // 🩸 En passant à l'étape suivante, une étape encore pending devient « passée, non renseignée », jamais
          // RAS : RAS affirmerait une fouille que personne n'a déclarée.
          const cur = etapes[_liveEquipeFocusIdx];
          if (cur && (!cur.statut || cur.statut === "pending")) {
            marquerEtapeStatut(s.id, equipeId, _liveEquipeFocusIdx, "non-renseigne");
          } else if (cur && !cur.completedAt) {
            updateEtape(s.id, equipeId, _liveEquipeFocusIdx, { completedAt: _nowIso() });
          }
          // Vibration moyenne à la validation d'étape (comme un waypoint atteint en Itinéraire ; réglage et
          // support gérés par le helper).
          if (window.kta_vibrate) window.kta_vibrate.medium();
          _liveEquipeFocusIdx++;
          _switchView("live");
        }
      });
    });

    corps.querySelectorAll('[data-action="live-goto-step"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const targetIdx = parseInt(btn.getAttribute("data-step"), 10);
        if (isFinite(targetIdx) && targetIdx >= 0 && targetIdx < etapes.length) {
          _liveEquipeFocusIdx = targetIdx;
          _switchView("live");
        }
      });
    });

    // Observations enregistrées au blur (pas de re-rendu à chaque frappe).
    const obsInput = corps.querySelector('#kta-live-obs-' + idx);
    if (obsInput) {
      obsInput.addEventListener("blur", function() {
        updateEtape(s.id, equipeId, idx, { observations: obsInput.value });
        // startedAt posé à la 1re interaction avec l'étape.
        const etape = etapes[idx];
        if (etape && !etape.startedAt) {
          updateEtape(s.id, equipeId, idx, { startedAt: _nowIso() });
        }
      });
    }

    corps.querySelectorAll('[data-action="live-set-statut"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const statutId = btn.getAttribute("data-statut");
        // Enregistre aussi le texte en cours avant le re-rendu.
        if (obsInput) {
          updateEtape(s.id, equipeId, idx, { observations: obsInput.value });
        }
        marquerEtapeStatut(s.id, equipeId, idx, statutId);
        _recalerSurEtape(s.id, equipeId, idx, statutId);
        const info = _getStatutInfo(statutId);
        _toast(info.emoji + " " + t("secours.toast.etapeStatut", { nom: _nomEtape(etapes[idx], idx), statut: _statutLabel(statutId) }), "info");
        _switchView("live");
      });
    });

    corps.querySelectorAll('[data-action="live-photo"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _ajouterPhotoEtape(s.id, equipeId, idx);
      });
    });
    corps.querySelectorAll('[data-action="live-photo-del"]').forEach(function(btn) {
      btn.addEventListener("click", async function() {
        const pid = btn.getAttribute("data-photo-id");
        if (!pid) return;
        if (!(await window.ktaConfirm(t("secours.confirm.supprimerPhoto")))) return;
        _supprimerPhotoEtape(s.id, equipeId, idx, pid);
      });
    });

    // Retour au rôle précédent (Opérateur ou Secouriste) après « Prendre la main » : rôle + équipe restaurés,
    // _previousRole/_previousEquipeId effacés, re-rendu.
    corps.querySelectorAll('[data-action="live-retour-previous-role"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const prevRole = s.execution._previousRole;
        if (!prevRole) return;
        s.execution.role = prevRole;
        s.execution.currentEquipeId = s.execution._previousEquipeId || null;
        // Marqueurs internes retirés (ils ne doivent pas partir dans un export).
        delete s.execution._previousRole;
        delete s.execution._previousEquipeId;
        _commitMutation(s);
        const label = (prevRole === "operateur") ? t("secours.roleBandeau.operateur") : t("secours.roleBandeau.secouriste");
        _toast(t("secours.toast.retourRole", { role: label }), "info");
        _switchView("live");
      });
    });

    corps.querySelectorAll('[data-action="live-recentrer"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const etape = etapes[idx];
        if (!etape) return;
        // L'étape porte le libellé, pas les coordonnées (héritées du parcours du groupe).
        const g = s.groupes.find(function(gr) { return gr.id === equipeId; });
        if (!g) return;
        let pos = null;
        if (etape.type === "entree") pos = g.entree;
        else if (etape.type === "sortie") pos = g.sortie;
        else {
          // Intermédiaire idx-1 (l'entrée est l'idx 0).
          const intermIdx = idx - (g.entree ? 1 : 0);
          if (Array.isArray(g.intermediaires) && intermIdx >= 0) {
            pos = g.intermediaires[intermIdx];
          }
        }
        if (!pos || typeof pos.x !== "number" || !window.map) {
          _toast(t("secours.toast.positionIntrouvable"), "warn");
          return;
        }
        if (_modal) _modal.style.display = "none";
        if (!_overlayLayer) renderOverlay(_currentScenarioId);
        _showOverlayFloater();
        window.map.setView(_planToLatLng(pos), Math.max(0, window.map.getZoom()), { animate: true });
      });
    });

    // Miniatures des photos hydratées en async.
    _hydraterPhotosLive(corps, s.id, equipeId, idx);
  }

  // Retour vers une étape plus ancienne sans statut : on ne touche à rien (point d'extension vide).
  function _autoCompletePreviousIfNeeded(/* s, equipeId, prevIdx */) {
  }

  // Photo : sélection du fichier, compression, ajout, rafraîchissement.
  function _ajouterPhotoEtape(scenarioId, equipeId, etapeIdx) {
    if (!window.MyKTAMapSecoursPhotos || !window.MyKTAMapSecoursPhotos.isAvailable()) {
      _toast(t("secours.toast.photosIndisponible"), "error");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // capture="environment" : caméra arrière sur mobile (la galerie reste accessible).
    input.setAttribute("capture", "environment");
    input.style.display = "none";
    input.addEventListener("change", function() {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      _toast(t("secours.toast.ajoutPhoto"), "info");
      window.MyKTAMapSecoursPhotos.addPhoto(scenarioId, equipeId, etapeIdx, file).then(function(photoId) {
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

  // ObjectURL créées par _hydraterPhotosLive. 🩸 Sans ce registre, chaque hydratation recrée N URL sans
  // révoquer les précédentes (1 à 10 Mo par passage) : fuite qui fait planter la PWA sur iPhone après
  // quelques minutes. _revokeLivePhotoUrls() passe AVANT chaque hydratation et à fermer().
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

  // Remplace les emplacements photo par les vraies miniatures (ObjectURL async), après révocation des
  // précédentes.
  function _hydraterPhotosLive(corps, scenarioId, equipeId, etapeIdx) {
    if (!window.MyKTAMapSecoursPhotos) return;
    _revokeLivePhotoUrls();
    const placeholders = corps.querySelectorAll('.kta-secours-live-photo-placeholder[data-photo-id]');
    placeholders.forEach(function(ph) {
      const pid = ph.getAttribute("data-photo-id");
      if (!pid) return;
      window.MyKTAMapSecoursPhotos.getObjectUrl(pid).then(function(url) {
        if (!url || !ph.parentNode) return;
        _livePhotoUrls.add(url);
        const img = document.createElement("img");
        img.src = url;
        img.alt = t("secours.live.photoAlt");
        img.className = "kta-secours-live-photo-img";
        // Clic → viewer plein écran (MyKTAMapPhotoViewer si disponible).
        img.addEventListener("click", function() {
          if (window.MyKTAMapPhotoViewer && typeof window.MyKTAMapPhotoViewer.open === "function") {
            const etapes = _getEtapesEquipe(get(scenarioId), equipeId);
            const etape = etapes[etapeIdx];
            const ids = (etape && etape.photoIds) || [pid];
            const idx = ids.indexOf(pid);
            // Le viewer attend des objets {id, getUrl: () => Promise<string>}.
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
              // Repli : nouvel onglet.
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

  // Handlers de la vue Live Opérateur.
  function _bindLiveOperateurHandlers(corps, s) {
    // « Détails équipe » : mini-modale en lecture seule.
    corps.querySelectorAll('[data-action="live-op-details"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const equipeId = btn.getAttribute("data-equipe-id");
        _afficherModaleDetailsEquipeLive(s.id, equipeId);
      });
    });
    // « Prendre la main » : bascule en mode Équipe pour cette équipe, rôle d'origine gardé dans
    // s.execution._previousRole (persisté : le retour survit au rechargement).
    corps.querySelectorAll('[data-action="live-op-prendre-main"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const equipeId = btn.getAttribute("data-equipe-id");
        if (!equipeId) return;
        const g = s.groupes.find(function(gr) { return gr.id === equipeId; });
        if (!g) return;
        s.execution._previousRole = s.execution.role;          // "operateur" ou "secouriste"
        s.execution._previousEquipeId = s.execution.currentEquipeId;  // null normalement
        s.execution.role = "equipe";
        s.execution.currentEquipeId = equipeId;
        // 🩸 Le focus d'étape est un état du MODULE, pas de l'équipe : sans remise à zéro, relayer Bravo après
        // Alpha (étape 5) ouvrirait l'étape 5 de Bravo et le statut radio irait sur la mauvaise étape. On repart
        // sur la 1re étape non terminée.
        _liveEquipeFocusIdx = 0;
        _liveEquipeFreshSession = true;
        _commitMutation(s);
        _toast(t("secours.toast.modeEquipe", { nom: g.nom }), "info");
        _switchView("live");
      });
    });
    corps.querySelectorAll('[data-action="live-op-carte-globale"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (_modal) _modal.style.display = "none";
        if (!_overlayLayer) renderOverlay(_currentScenarioId);
        _showOverlayFloater();
      });
    });
    corps.querySelectorAll('[data-action="live-op-import-rapport"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _ouvrirImportRapportEquipePicker();
      });
    });
    // « Phase terminée » : modale de debrief, puis éventuellement lancerPhaseSuivante.
    corps.querySelectorAll('[data-action="terminer-phase"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _afficherModaleDebrief(s.id);
      });
    });
  }

  // Détails d'une équipe en lecture seule (mode Opérateur).
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
      etapesHtml = '<p style="color:var(--kta-texte-3); font-style:italic;">' + t("secours.opDetails.aucuneEtape") + '</p>';
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
        // Chip « importé » si l'étape a reçu des observations d'un rapport d'équipe (tooltip : date d'import et
        // version de l'app source).
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
          '<h2 class="kta-readme-modal-titre" style="margin:0;">' + t("secours.opDetails.titre", { nom: _escHtml(g.nom), couleur: _escHtml(couleur.nom) }) + '</h2>' +
          '<button class="kta-readme-modal-close" data-action="close-op-details" aria-label="' + _escAttr(t("secours.btn.fermerAria")) + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="margin:0 0 12px 0; color:var(--kta-texte-3); font-size:13px;">' + t("secours.opDetails.sousTitre") + '</p>' +
          etapesHtml +
          '<div style="margin-top:18px; display:flex; gap:10px; justify-content:flex-end;">' +
            '<button class="kta-btn kta-btn-secondary" data-action="close-op-details">' + t("secours.btn.fermer") + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

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

  // Handlers de la vue Live Secouriste.
  function _bindLiveSecouristeHandlers(corps, s) {
    // Ajout d'une note par l'un des 7 boutons de statut.
    corps.querySelectorAll('[data-action="sec-add-note"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const statutId = btn.getAttribute("data-statut");
        const texteInput = corps.querySelector('#kta-sec-newnote-texte');
        const texte = texteInput ? texteInput.value : "";
        ajouterNoteLibre(s.id, { statut: statutId, texte: texte });
        if (texteInput) texteInput.value = "";
        const info = _getStatutInfo(statutId);
        _toast(t("secours.toast.noteAjoutee", { emoji: info.emoji, statut: _statutLabel(statutId) }), "info");
        _switchView("live");
      });
    });
    corps.querySelectorAll('[data-action="sec-del-note"]').forEach(function(btn) {
      btn.addEventListener("click", async function() {
        const noteId = btn.getAttribute("data-note-id");
        if (!noteId) return;
        if (!(await window.ktaConfirm(t("secours.confirm.supprimerNote")))) return;
        supprimerNoteLibre(s.id, noteId);
        _toast(t("secours.toast.noteSupprimee"), "info");
        _switchView("live");
      });
    });
  }


  // ── Modes interactifs sur la carte ─────────────────────────────────
  // (1) modale masquée, (2) bandeau compact en bas avec consigne + Annuler/Terminer, (3) écoute du clic
  // carte, (4) à la fin : modale rendue, handlers reposés, écoute retirée.

  let _activeMapMode = null;     // "point" | "polygon" | "roads" | null
  let _mapModeCtx = null;        // { groupeId, role?, points?, roadIds?, layer? }

  // role ∈ "entree" | "sortie" | "intermediaire" ; idx = index d'un intermédiaire (null sinon).
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
    // Points chargés d'avance : SearchPoints.getAllPoints est async, _onMapClickPoint en a besoin en synchrone.
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

  // 🩸 Leaflet ne remonte pas le clic d'un marqueur à la carte : `map.once("click")` n'entendrait rien et la
  // popup du POI s'ouvrirait. Pendant le choix d'un point, un écouteur en CAPTURE sur le conteneur intercepte
  // le clic sur une icône de marqueur (pas de popup) et le traite comme un clic carte, avec un accrochage
  // élargi à la taille d'une icône à l'écran.
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
      // Idem en dessin de zone : un sommet posé sur un POI va au mode actif, pas à la popup.
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

  // Choisir un point sur la carte pour autre chose qu'un waypoint (position de la victime). Même mécanique
  // que _startDefiningPoint (accroche POI, capture des marqueurs, fenêtre masquée puis rendue).
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
    // Accroche au POI le plus proche dans un rayon de 30 px (comme « Cliquer sur la carte » de l'itinéraire).
    let pointId = null;
    let pointUid = null;
    let label = null;
    const snap = _trouverPoiProche(x, y, rayonSnap || 30);
    if (snap) {
      x = snap.x;
      y = snap.y;
      pointId = snap.pointId || null;
      pointUid = snap.pointUid || null;
      label = snap.nom || snap.label || null;
      // 🩸 Accroché à un POI : le niveau du POI, pas celui affiché.
      if (Number.isInteger(snap.level)) level = snap.level;
      _toast(t("secours.toast.snap", { point: (label || pointId || t("secours.map.poiDefault")) }), "info");
    }
    if (typeof _mapModeCtx.onPoint === "function") {
      const cb = _mapModeCtx.onPoint;
      _finishMapMode();
      cb({ x: x, y: y, level: level, pointId: pointId, pointUid: pointUid, label: label });
      return;
    }
    _appliquerWaypoint(_mapModeCtx.groupeId, _mapModeCtx.role, _mapModeCtx.idx,
                       { x: x, y: y, level: level, pointId: pointId, pointUid: pointUid, label: label });
    _finishMapMode();
  }

  // POI le plus proche de (x, y) en pixels plan dans radiusPx : {x, y, pointId, nom} ou null. Lit la liste
  // préchargée _mapModeCtx.allPoints (SearchPoints.getAllPoints est async, le clic est synchrone).
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
        best = { x: p.x, y: p.y, pointId: p.id, pointUid: p.uid || null, nom: p.nom, level: p.level };
      }
    });
    return best;
  }

  // Applique un waypoint (recherche ou clic) au bon endroit (entree, sortie ou intermediaires[idx]) ;
  // recalcul automatique si l'itinéraire a déjà été calculé.
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
    // Re-rendu après mutation : ce qu'on vient de saisir doit se voir sans recalculer l'itinéraire.
    _switchView("edit");
  }

  // Efface un waypoint (entrée/sortie → null, intermédiaire → retiré) ; recalcul automatique aussi.
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

  // Favoris du plan en accès rapide (chips) au-dessus de la recherche du picker ; rien sans favoris ou sans
  // module Favoris.
  function _renderFavorisBlock() {
    if (!window.Favoris || typeof window.Favoris.getAll !== "function") return "";
    let favs = [];
    try { favs = window.Favoris.getAll() || []; } catch(e) { return ""; }
    if (!Array.isArray(favs) || favs.length === 0) return "";
    let html = '<div class="kta-secours-pick-favoris">';
    html += '<div class="kta-secours-pick-favoris-titre">' + t("secours.pick.favorisTitre", { n: favs.length }) + '</div>';
    html += '<div class="kta-secours-pick-favoris-grid">';
    // 8 favoris au plus (la recherche couvre les autres).
    favs.slice(0, 8).forEach(function(f) {
      // f = { pointId, nom, x, y, level?, tag?, layerId?, … }
      if (!f || typeof f.x !== "number" || typeof f.y !== "number") return;
      const nom = f.nom || f.pointId || t("secours.pick.favoriDefault");
      html += '<button class="kta-secours-pick-favori" ' +
                'data-pid="' + _escAttr(f.pointId || "") + '" ' +
                'data-puid="' + _escAttr(f.pointUid || "") + '" ' +
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

  // Mini-modale « Choisir un point » : recherche + clic carte (même principe que la modale itinéraire).
  function _ouvrirChoixWaypoint(groupeId, role, idx) {
    const existing = document.getElementById("kta-secours-pick-modal");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    const lblRole = role === "entree" ? t("secours.roleShort.entree")
                  : role === "sortie" ? t("secours.roleShort.sortie")
                  : t("secours.parcours.etape", { n: ((idx == null ? 0 : idx) + 1) });
    const overlay = document.createElement("div");
    overlay.id = "kta-secours-pick-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100001";
    // Favoris AU-DESSUS de la recherche : ce sont les points marquants du plan (accès, escaliers), candidats
    // naturels pour les waypoints.
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
    // Clic sur un favori = waypoint appliqué directement.
    overlay.querySelectorAll('.kta-secours-pick-favori').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const wp = {
          x:       parseFloat(btn.getAttribute("data-x")),
          y:       parseFloat(btn.getAttribute("data-y")),
          level:   btn.getAttribute("data-lvl") !== "" ? parseInt(btn.getAttribute("data-lvl"), 10) : 0,
          pointId: btn.getAttribute("data-pid") || null,
          pointUid: btn.getAttribute("data-puid") || null,
          label:   btn.getAttribute("data-nom") || null
        };
        _close();
        _appliquerWaypoint(groupeId, role, idx, wp);
      });
    });

    overlay.querySelectorAll('[data-action="clic-carte"]').forEach(function(b) {
      b.addEventListener("click", function() {
        _close();
        _startDefiningPoint(groupeId, role, idx);
      });
    });

    // Recherche avec anti-rebond de 150 ms. ⚠️ SearchPoints.findByQuery rend une Promise : un jeton de requête
    // écarte les résultats obsolètes (frappe rapide).
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
                  '" data-puid="' + _escAttr(p.uid || "") +
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
              pointUid: btn.getAttribute("data-puid") || null,
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
    setTimeout(function() { input.focus(); }, 50);
    _doSearch();
  }

  function _ouvrirChoixZoneMode(groupeId) {
    // Petite modale de choix : polygone OU tracés.
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
          '<p style="color:var(--kta-texte-2);">' + t("secours.zoneMode.intro") + '</p>' +
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

  // Pendant le dessin d'une zone, celles des AUTRES équipes du scénario s'affichent en pointillé, à leur
  // couleur, avec leur nom, pour caler les zones bord à bord. Non interactives (un clic reste un clic de
  // dessin). Retirées par _finishMapMode.
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
    // Mode « tracés » :
    //   • la clé d'un tracé est l'EMPREINTE de sa géométrie (`_cleTrace`), la même sur tous les appareils qui
    //     ont le même plan, sans rien écrire dans le plan. 🩸 Pas d'id aléatoire : posé sur une COPIE
    //     (`getAllEmbeddedRoads` clone), il serait perdu au rechargement comme d'un téléphone à l'autre ;
    //   • 🩸 un clic carte prend le tracé le plus proche (tolérance écran) parmi les niveaux visibles, sans
    //     dépendre du rendu (`_ktaDataPolylines` n'a pas de `road` ni de `layer`, la session aucun calque) ;
    //   • rouvrir le mode reprend la sélection existante de l'équipe.
    _mapModeCtx.surbrillance = L.layerGroup().addTo(window.map);
    const g = _findGroupeCourant(groupeId);
    // 🩸 Une clé que CET appareil ne résout pas (tracé de session d'un autre appareil, plan différent) est
    // GARDÉE telle quelle : « Terminer » ne doit pas la retirer de la zone.
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
  // Mémo par TABLEAU de points (`getAllEmbeddedRoads` rend des copies neuves qui partagent le `points`
  // d'origine). ⚠️ Réservé aux tracés du PLAN (copies marquées `layerId`) : ceux de la session s'éditent en
  // place, un mémo y serait périmé.
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

  // ── Bouton flottant « Retour à la modale » ─────────────────────────
  // Quand « Voir sur carte » est actif, la modale est masquée ; ce bouton en bas de l'écran la rouvre sans
  // passer par la barre latérale.

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
        '🚑 <strong>' + _escHtml(s.nom) + '</strong>' +
        ' · ' + t("secours.liveOp.equipesCompteur", { n: nbGroupes }) +
      '</div>' +
      '<button class="kta-btn kta-btn-primary kta-btn-sm" data-action="reopen-modal">' +
        t("secours.floater.retourModale") +
      '</button>';
    document.body.appendChild(fl);
    fl.querySelector('[data-action="reopen-modal"]').addEventListener("click", function() {
      // Modale rendue, bouton retiré, overlay nettoyé (on peut le réafficher).
      if (_modal) _modal.style.display = "";
      _removeOverlayFloater();
      clearOverlay();
      if (_currentScenarioId) _switchView("edit");
    });
  }

  function _removeOverlayFloater() {
    const ex = document.getElementById("kta-secours-overlay-floater");
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }

  function _planToLatLng(pt) {
    // Plan (x, y) → Leaflet [lat, lng] : convertCoord, [imageHeight - y, x].
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
    // label = "sommets" | "traces" → clé i18n, pluriel selon n.
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
    if (_mapModeCtx && _mapModeCtx.previewLayer && window.map) {
      try { window.map.removeLayer(_mapModeCtx.previewLayer); } catch(e) {}
    }
    if (_mapModeCtx && _mapModeCtx.autresZones && window.map) {
      try { window.map.removeLayer(_mapModeCtx.autresZones); } catch(e) {}
    }
    if (_mapModeCtx && _mapModeCtx.surbrillance && window.map) {
      try { window.map.removeLayer(_mapModeCtx.surbrillance); } catch(e) {}
    }
    _activeMapMode = null;
    _mapModeCtx = null;
    _removeFloater();
    _showModalAfterMap();
  }

  // ── Intégration Pathfinder ──────────────────────────────────────────
  // 🩸 Le niveau de CHAQUE point, pas celui de l'entrée : écraser `level` par `g.entree.level` déclarerait
  // tout le tracé d'une équipe qui descend au niveau de l'entrée. Le pathfinder rend le niveau réel par point,
  // ou `null` s'il est ambigu (milieu d'une jonction, nœud fusionné) : on reprend alors le dernier niveau
  // connu, à défaut l'entrée.
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
    if (_estBalayage(g)) return _appliquerBalayage(scenarioId, groupeId, {});
    if (!window.Pathfinder || typeof window.Pathfinder.computeRoute !== "function") {
      _toast(t("secours.toast.pathfinderIndispo"), "error");
      return null;
    }
    // Coordonnées valides (anti-NaN).
    if (typeof g.entree.x !== "number" || typeof g.entree.y !== "number" ||
        typeof g.sortie.x !== "number" || typeof g.sortie.y !== "number") {
      _toast(t("secours.toast.coordsCorrompues"), "error");
      return null;
    }
    // Intermédiaires invalides filtrés.
    const intermediaires = (Array.isArray(g.intermediaires) ? g.intermediaires : [])
      .filter(function(w) {
        return w && typeof w.x === "number" && typeof w.y === "number";
      });
    _toast(intermediaires.length > 0
           ? t("secours.toast.calcItiViaWp", { n: intermediaires.length })
           : t("secours.toast.calcIti"), "info");
    try {
      // Pathfinder accepte [entree, …intermediaires, sortie] : un Dijkstra par paire consécutive, chemins
      // concaténés. Boucle entree = sortie → tour complet par les intermédiaires.
      const waypoints = [{ x: g.entree.x, y: g.entree.y, level: g.entree.level, label: g.entree.label || t("secours.wp.entree", { equipe: g.nom }) }]
        .concat(intermediaires.map(function(w, i) {
          return { x: w.x, y: w.y, level: w.level, label: w.label || t("secours.parcours.etape", { n: (i + 1) }) };
        }))
        .concat([{ x: g.sortie.x, y: g.sortie.y, level: g.sortie.level, label: g.sortie.label || t("secours.wp.sortie", { equipe: g.nom }) }]);
      // Évitements entre équipes : points et zones des autres équipes passés au Pathfinder, qui préfère un chemin
      // qui les contourne (pas de chevauchement involontaire). avoidRadius 30 px ≈ une galerie de large.
      const avoidPoints = _collecterAvoidPointsAutresEquipes(scenarioId, groupeId);
      const pfOpts = (avoidPoints.length > 0)
                     ? { avoidPoints: avoidPoints, avoidRadius: 30 }
                     : {};
      // ⚠️ computeRoute peut lever en synchrone (waypoints insuffisants) OU rejeter en async (chemin introuvable,
      // composantes séparées) : les deux sont gérés.
      const result = window.Pathfinder.computeRoute(waypoints, pfOpts);
      Promise.resolve(result).then(function(r) {
        if (!r || !Array.isArray(r.path) || r.path.length === 0) {
          _toast(t("secours.toast.aucunIti"), "warn");
          return;
        }
        const scale = (window.APP_CONFIG && window.APP_CONFIG.scale > 0)
                      ? window.APP_CONFIG.scale : 1;
        const distM = r.totalDistance / scale;
        // Réglages du SCÉNARIO (vitesse de fouille, pause par étape).
        const duree = Math.round(_dureeEquipeMin(s, distM, waypoints.length, { g: g, path: r.path, raccords: r.raccords }));
        updateGroupe(scenarioId, groupeId, {
          itineraireSuggere: _niveauxItineraire(r.path, g.entree.level),
          distanceM:       distM,
          dureeEstimeeMin: duree,
          guidage:         _donneesGuidage(r)
        });
        const fmtD = (typeof window.formatDistance === "function")
                     ? window.formatDistance(distM, 0) : Math.round(distM) + " m";
        // Un seul message (un 2e remplacerait le 1er). L'étape loin de toute galerie est signalée ICI, à la
        // préparation, où on peut encore la corriger.
        const lignesCalc = [t("secours.toast.itiCalcule", { distance: fmtD, duree: duree })];
        // Évitements impossibles : on dit lesquels ont été traversés.
        if (r.usedFallback === true && Array.isArray(r.avoidedThrough) && r.avoidedThrough.length > 0) {
          lignesCalc.push(t("secours.toast.itiTraverse", { n: r.avoidedThrough.length }));
        }
        const loin = _texteEtapesLoin(_etapesLoin(r.raccords));   // toutes, plus seulement la pire
        if (loin) lignesCalc.push("⚠️ " + loin);
        const gMaj = (get(scenarioId).groupes || []).find(function(x) { return x.id === groupeId; });
        const niv = _texteNiveauxNonParcourus(gMaj, _niveauxNonParcourus(gMaj));   // 8b
        if (niv) lignesCalc.push("⚠️ " + niv);
        _toast(lignesCalc.join("\n"), lignesCalc.length > 1 ? "warn" : "info");
        // Re-rendu de l'édition (statistiques, overlay si actif).
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

  // ── Parcours de balayage ────────────────────────────────────────────
  // Au lieu du plus court chemin par les étapes (qui saute les boucles : 2/3 environ des galeries d'un
  // secteur parcourues), un circuit sur CHAQUE galerie de la zone (« complet ») ou toutes sauf les
  // culs-de-sac (« ossature », reconnaissance). Les étapes saisies restent, remises dans l'ordre de passage du
  // circuit. Le guidage garde le circuit : un écart le fait REJOINDRE plus loin
  // (interfaceItineraire > _replanifierDepuis). Calcul : js/secoursBalayage.js.
  function _estBalayage(g) {
    return !!(g && (g.parcoursMode === "complet" || g.parcoursMode === "ossature") &&
              (g.zoneType === "roads" || g.zoneType === "polygon") && window.SecoursBalayage);
  }
  // Pièces de galerie de la zone d'une équipe (index dans SecoursBalayage.pieces).
  function _piecesZone(graph, g) {
    const P = window.SecoursBalayage.pieces(graph);
    const out = [];
    if (g.zoneType === "roads") {
      const cles = {};
      (g.zoneRoadIds || []).forEach(function(k) { cles[k] = true; });
      P.forEach(function(p, i) {
        const r = graph.segments[p.seg].road;
        if (r && ((r.id && cles[r.id]) || cles[_cleTrace(r)])) out.push(i);
      });
    } else if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
      P.forEach(function(p, i) {
        const A = graph.nodes[p.a], B = graph.nodes[p.b], lvl = graph.segments[p.seg].level;
        if (_dansZonePolygone(g, { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, Number.isInteger(lvl) ? lvl : 0)) out.push(i);
      });
    }
    return out;
  }
  function _appliquerBalayage(scenarioId, groupeId, opts) {
    opts = opts || {};
    const s = get(scenarioId);
    const g = s && (s.groupes || []).find(function(x) { return x.id === groupeId; });
    if (!g || !g.entree || !g.sortie || !window.Pathfinder) return null;
    const graph = window.Pathfinder.buildNetworkGraph({ includeZones: true });
    const pieces = _piecesZone(graph, g);
    if (!pieces.length) { if (!opts.silencieux) _toast(t("secours.balayage.zoneVide"), "warn"); return null; }
    const r = window.SecoursBalayage.parcours(graph, pieces, {
      depart: { x: g.entree.x, y: g.entree.y }, arrivee: { x: g.sortie.x, y: g.sortie.y }, mode: g.parcoursMode
    });
    if (!r || r.path.length < 2) { if (!opts.silencieux) _toast(t("secours.toast.aucunIti"), "warn"); return null; }
    const pxParM = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    const path = _niveauxItineraire(r.path, g.entree.level);
    // Étapes : remises dans l'ordre du premier passage du circuit (à 2 m près du plus proche).
    const passage = function(w) {
      let best = Infinity;
      const d = path.map(function(p) { const v = Math.hypot(p.x - w.x, p.y - w.y); if (v < best) best = v; return v; });
      const seuil = best + 2 * pxParM;
      for (let i = 0; i < d.length; i++) if (d[i] <= seuil) return i;
      return d.length;
    };
    const inter = (g.intermediaires || []).filter(function(w) { return w && typeof w.x === "number"; })
      .map(function(w) { return { w: w, i: passage(w) }; })
      .sort(function(a, b) { return a.i - b.i; }).map(function(x) { return x.w; });
    const raccord = function(w, p, role, index) {
      return { index: index, role: role, label: w.label || null, de: { x: w.x, y: w.y }, vers: { x: p.x, y: p.y },
               distPx: Math.hypot(w.x - p.x, w.y - p.y) };
    };
    const raccords = [raccord(g.entree, path[0], "depart", 0), raccord(g.sortie, path[path.length - 1], "arrivee", inter.length + 1)];
    const carrefours = (typeof window.Pathfinder.carrefoursSurChemin === "function")
      ? window.Pathfinder.carrefoursSurChemin(graph, path) : [];
    const distM = r.longueur / pxParM;
    // Approche = pas du circuit qui ne suivent pas une galerie de la zone (entrée hors
    // zone, retour, liaisons entre deux bouts du secteur).
    const P = window.SecoursBalayage.pieces(graph), dansZone = new Set();
    pieces.forEach(function(i) {
      const A = graph.nodes[P[i].a], B = graph.nodes[P[i].b];
      dansZone.add(A.x + "," + A.y + "|" + B.x + "," + B.y); dansZone.add(B.x + "," + B.y + "|" + A.x + "," + A.y);
    });
    let approchePx = 0;
    for (let i = 1; i < path.length; i++) {
      if (!dansZone.has(path[i - 1].x + "," + path[i - 1].y + "|" + path[i].x + "," + path[i].y)) {
        approchePx += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      }
    }
    const approcheM = approchePx / pxParM;
    const duree = Math.round(_dureeEquipeMin(s, distM, inter.length + 2, { g: g, path: path, raccords: raccords, approcheM: approcheM }));
    const partiel = { itineraireSuggere: path, distanceM: distM, dureeEstimeeMin: duree, approcheM: approcheM,
                      guidage: { carrefours: carrefours, raccords: raccords, n: path.length } };
    const avant = (g.intermediaires || []).map(function(w) { return w && w.wid; }).join("|");
    if (inter.map(function(w) { return w && w.wid; }).join("|") !== avant) partiel.intermediaires = inter;
    updateGroupe(scenarioId, groupeId, partiel);
    if (!opts.silencieux) {
      const fmt = function(m) { return (typeof window.formatDistance === "function") ? window.formatDistance(m, 1) : Math.round(m) + " m"; };
      const lignes = [t("secours.balayage.calcule", { mode: t("secours.balayage.mode." + g.parcoursMode),
        distance: fmt(distM), galeries: fmt(r.aCouvrir / pxParM), duree: duree })];
      if (r.couvert < r.aCouvrir - pxParM) {
        lignes.push(t("secours.balayage.horsAtteinte", { long: fmt((r.aCouvrir - r.couvert) / pxParM) }));
      }
      _toast(lignes.join("\n"), lignes.length > 1 ? "warn" : "info");
    }
    if (_modal) _switchView("edit");
    if (_overlayLayer) renderOverlay(scenarioId);
    return true;
  }

  // Points des AUTRES équipes du scénario, passés en `avoidPoints` au Pathfinder (contrainte souple : repli
  // s'il n'y a pas d'autre chemin) : entrée, sortie, intermédiaires, sommets du polygone ou points des tracés
  // sélectionnés. Format : [{x, y, label?, id?}, …].
  function _collecterAvoidPointsAutresEquipes(scenarioId, currentGroupeId) {
    const s = get(scenarioId);
    if (!s) return [];
    const avoid = [];
    s.groupes.forEach(function(g) {
      if (g.id === currentGroupeId) return;  // skip l'équipe courante
      const eqLabel = "Équipe " + (g.nom || "?");
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
      // 2. Sommets du polygone (évités par proximité, rayon avoidRadius).
      if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon)) {
        g.zonePolygon.forEach(function(p, i) {
          if (typeof p.x === "number") {
            avoid.push({ x: p.x, y: p.y, label: "Zone " + eqLabel + " #" + (i + 1) });
          }
        });
      }
      // 3. Points de chaque tracé sélectionné.
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

  function _toast(msg, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(msg, type || "info");
    } else {
      console.log("[SecoursMode] " + (type || "info").toUpperCase() + " — " + msg);
    }
  }

  // « POI de la zone » : TOUS les POI dans la zone de l'équipe (polygone, ou tracés + 30 px) en
  // intermédiaires, sauf ceux déjà au parcours.
  // Ordre : chaîne du plus proche voisin à vol d'oiseau (px plan), O(n²) sur quelques dizaines de POI. Le
  // niveau compte : changer d'étage coûte une jonction, à distance égale on reste au même niveau (pénalité
  // 1e6 px, ordre total).
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
    // Niveau de référence du filtre multi-niveau strict : 1er sommet du polygone → entrée → activeLevel → 0.
    // 🩸 Sans niveau de référence explicite, des POI d'autres niveaux entreraient dans la zone.
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
      // POI déjà au parcours (par pointId ou coordonnées).
      const dejaPresent = function(p) {
        if (_samePoint(p, g.entree)) return true;
        if (_samePoint(p, g.sortie)) return true;
        return (g.intermediaires || []).some(function(w) { return _samePoint(p, w); });
      };
      // Compteurs de diagnostic (journal, mode debug).
      let cntTotal = 0, cntSkipLevel = 0, cntSkipOutside = 0, cntSkipDup = 0;
      const tracesZone = _tracesZone(g);  // résolu UNE fois (empreintes), pas par POI
      let candidats = [];
      all.forEach(function(entry) {
        cntTotal++;
        const p = entry.point || entry;
        if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
        // Un POI sans level vaut niveau 0. Polygone : filtre strict sur refLevel (dessiné sur un niveau).
        // Tracés : niveau par TRACÉ — 🩸 une zone de galeries sur plusieurs niveaux ne gardait que les POI du
        // niveau de l'entrée. Jonction : ses deux niveaux.
        const pLvl = (typeof p.level === "number") ? p.level : 0;
        if (mlvlActive && g.zoneType !== "roads" && pLvl !== refLevel) { cntSkipLevel++; return; }
        let inside = false, procheAutreNiveau = false;
        if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon)) {
          inside = _pointInPolygon(p, g.zonePolygon);
        } else if (g.zoneType === "roads" && Array.isArray(g.zoneRoadIds)) {
          for (let i = 0; i < tracesZone.length; i++) {
            const road = tracesZone[i];
            if (!road || !Array.isArray(road.points)) continue;
            if (_distPointPolyline(p, road.points) > 30) continue;  // buffer 30 px
            if (mlvlActive && !_traceAuNiveau(road, pLvl)) { procheAutreNiveau = true; continue; }
            inside = true;
            break;
          }
        }
        if (!inside && procheAutreNiveau) { cntSkipLevel++; return; }
        if (!inside) { cntSkipOutside++; return; }
        if (dejaPresent({ x: p.x, y: p.y, pointId: p.id, pointUid: p.uid || null })) { cntSkipDup++; return; }
        const dx = p.x - g.entree.x, dy = p.y - g.entree.y;
        const distFromEntree = Math.sqrt(dx * dx + dy * dy);
        candidats.push({
          x:       p.x,
          y:       p.y,
          level:   typeof p.level === "number" ? p.level : refLevel,
          pointId: p.id || null,
          pointUid: p.uid || null,
          label:   p.nom || p.id || null,
          tags:    Array.isArray(p.tags) ? p.tags : (p.tag ? [p.tag] : []),
          _d:      distFromEntree
        });
      });
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
      // Types de POI à NE PAS prendre comme étapes, au choix, gardés par scénario.
      _demanderTagsPoiZone(s, candidats, function(candidats) {
      if (!candidats.length) { _toast(t("secours.toast.aucunPoiZone"), "info"); return; }
      // 🩸 Chaîne du plus proche voisin, partant de la dernière étape déjà saisie (on AJOUTE à la suite), à
      // défaut de l'entrée. Trier par distance à l'ENTRÉE ferait faire des allers-retours (+38 % de marche en
      // médiane, mesuré).
      const inter = g.intermediaires || [];
      const depart = inter.length > 0 ? inter[inter.length - 1] : g.entree;
      candidats = _ordrePlusProcheVoisin(depart, candidats);
      // Le champ _d (tri) est retiré avant l'enregistrement.
      const newIntermediaires = (g.intermediaires || []).slice().concat(
        candidats.map(function(c) {
          return { x: c.x, y: c.y, level: c.level, pointId: c.pointId, pointUid: c.pointUid || null, label: c.label };
        })
      );
      updateGroupe(scenarioId, groupeId, { intermediaires: newIntermediaires });
      _toast(t("secours.toast.poiAjoutes", { n: candidats.length }), "info");
      _switchView("edit");
      });
    }).catch(function(e) {
      console.warn("[SecoursMode] _ajouterPoisDansZone échoué :", e);
      _toast(t("secours.toast.erreurGenerique", { message: (e.message || e) }), "error");
    });
  }

  // Recalcul automatique de l'itinéraire quand les waypoints changent, anti-rebond 500 ms (plusieurs ajouts
  // rapides). Rien sans entrée ET sortie (le Pathfinder lèverait, toast inutile).
  const _autoRecalcTimers = {};   // groupeId → setTimeout handle
  function _scheduleAutoRecalc(scenarioId, groupeId) {
    if (_autoRecalcTimers[groupeId]) clearTimeout(_autoRecalcTimers[groupeId]);
    _autoRecalcTimers[groupeId] = setTimeout(function() {
      delete _autoRecalcTimers[groupeId];
      const s = get(scenarioId);
      if (!s) return;
      const g = s.groupes.find(function(x) { return x.id === groupeId; });
      // SEULEMENT si l'itinéraire a déjà été calculé une fois : sinon l'utilisateur n'a rien demandé (et
      // cliquera lui-même sur « Calculer »).
      if (!g || !g.entree || !g.sortie || !g.itineraireSuggere) return;
      _recalculerItineraireGroupe(scenarioId, groupeId);
    }, 500);
  }

  // Remplace le stub de l'API publique.
  recalculerItineraires = function(scenarioId) {
    const s = get(scenarioId);
    if (!s) return;
    s.groupes.forEach(function(g) {
      _recalculerItineraireGroupe(scenarioId, g.id);
    });
  };

  // Variante async de _recalculerItineraireGroupe pour l'export KMZ (itinéraires manquants en parallèle),
  // toast réduit. La Promise se résout en fin de calcul, succès ou échec.
  function _recalculerItineraireGroupeAsync(scenarioId, groupeId) {
    return new Promise(function(resolve) {
      const s = get(scenarioId);
      if (!s) { resolve(false); return; }
      const g = s.groupes.find(function(x) { return x.id === groupeId; });
      if (!g || !g.entree || !g.sortie) { resolve(false); return; }
      if (_estBalayage(g)) { resolve(!!_appliquerBalayage(scenarioId, groupeId, { silencieux: true })); return; }
      if (!window.Pathfinder || typeof window.Pathfinder.computeRoute !== "function") {
        resolve(false); return;
      }
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
        // Évitements entre équipes (comme la version synchrone).
        const avoidPoints = _collecterAvoidPointsAutresEquipes(scenarioId, groupeId);
        const pfOpts = (avoidPoints.length > 0)
                       ? { avoidPoints: avoidPoints, avoidRadius: 30 }
                       : {};
        Promise.resolve(window.Pathfinder.computeRoute(waypoints, pfOpts)).then(function(r) {
          if (!r || !Array.isArray(r.path) || r.path.length === 0) { resolve(false); return; }
          const scale = (window.APP_CONFIG && window.APP_CONFIG.scale > 0)
                        ? window.APP_CONFIG.scale : 1;
          const distM = r.totalDistance / scale;
          const duree = Math.round(_dureeEquipeMin(s, distM, waypoints.length, { g: g, path: r.path, raccords: r.raccords }));
          updateGroupe(scenarioId, groupeId, {
            itineraireSuggere: _niveauxItineraire(r.path, g.entree.level),
            distanceM:       distM,
            dureeEstimeeMin: duree,
            guidage:         _donneesGuidage(r)
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

  // 🔒 Échappement HTML de toute saisie utilisateur.
  function _escHtml(s) { return window.ktaEsc(s); }
  function _escAttr(s) { return window.ktaEsc(s); }
  function isOpen() { return _modal !== null; }
  function getCurrentScenarioId() { return _currentScenarioId; }

  // ── Événements ──────────────────────────────────────────────────────

  // Abonnement aux changements ; retourne la fonction de désabonnement.
  function onChange(cb) {
    if (typeof cb !== "function") return function() {};
    _changeListeners.push(cb);
    return function() {
      const i = _changeListeners.indexOf(cb);
      if (i >= 0) _changeListeners.splice(i, 1);
    };
  }

  // ── Cycle de vie ────────────────────────────────────────────────────
  // init() : charge les scénarios du plan courant ; appelé par main.js > lancerApplication après
  // onPlanLoaded ; idempotent.
  // Fichier reçu à l'accueil : un équipier dépose un .mkmsec.json (messagerie, mail) sur « Ajouter un
  // plan ». L'accueil lit le CONTENU (les messageries renomment), retrouve le plan dans le registre (id, puis
  // nom + version : l'id diffère entre local_… et server_…), le charge, puis aperçu → import (identifiants
  // d'origine gardés) → rôle « Équipe » présélectionné. 🩸 Plan absent : arrêt qui nomme plan et version
  // attendus, jamais « le plus proche ». Autre version seulement : on demande. Homonymes : l'utilisateur
  // choisit. Rapport ou observations : à importer depuis le plan ouvert (on le dit).
  // Rend une Promise : null = pas un fichier du Mode Secours (l'accueil poursuit son routage), sinon
  // { ok, message? }.
  const ACCUEIL_TTL_MS = 10 * 60 * 1000;
  let _accueilEnAttente = null;   // { texte, nom, planId, at }
  function _nomNorm(x) { return String(x || "").trim().toLowerCase(); }
  function _choisirPlanAccueil(plans, titre) {
    return new Promise(function(resolve) {
      const overlay = document.createElement("div");
      overlay.className = "kta-readme-modal-overlay";
      overlay.style.zIndex = "100001";
      const R = window.PlanRegistry;
      overlay.innerHTML =
        '<div class="kta-readme-modal-boite kta-secours-newequipe-boite">' +
          '<div class="kta-readme-modal-header">' +
            '<span class="kta-readme-modal-titre">' + _escHtml(titre) + '</span>' +
            '<button class="kta-panneau-close" data-action="cancel" type="button">&times;</button>' +
          '</div>' +
          '<div class="kta-readme-modal-corps">' +
            plans.map(function(p, i) {
              const nom = R && typeof R.displayName === "function" ? R.displayName(p) : (p.name || p.id);
              return '<button class="kta-btn kta-btn-secondary" style="display:block;width:100%;margin:6px 0;text-align:left" data-i="' + i + '">' +
                _escHtml(nom + (p.version ? " — " + p.version : "") + " (" + (p.type === "server" ? "☁️" : "📦") + ")") + '</button>';
            }).join("") +
            '<div class="kta-secours-form-actions"><button class="kta-btn kta-btn-ghost" data-action="cancel">' +
              _escHtml(t("secours.btn.annuler")) + '</button></div>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(overlay);
      function fin(v) { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(v); }
      overlay.addEventListener("click", function(e) {
        if (e.target === overlay) return fin(null);
        const b = e.target.closest && e.target.closest("[data-i],[data-action='cancel']");
        if (!b) return;
        fin(b.hasAttribute("data-i") ? plans[parseInt(b.getAttribute("data-i"), 10)] : null);
      });
    });
  }
  async function ouvrirDepuisAccueil(texte, nomFichier) {
    let payload;
    try { payload = JSON.parse(texte); } catch (e) { return null; }
    const type = payload && typeof payload.type === "string" ? payload.type : "";
    if (type.indexOf("myktamap-secours-") !== 0) return null;
    if (type !== "myktamap-secours-scenario") return { ok: false, message: t("secours.accueil.rapport") };
    const pf = payload.plan || {};
    const R = window.PlanRegistry;
    const plans = R && typeof R.getAll === "function" ? R.getAll() : [];
    let cible = pf.id ? plans.find(function(p) { return p.id === pf.id; }) : null;
    if (!cible) {
      const memeNom = plans.filter(function(p) { return !!_nomNorm(pf.name) && _nomNorm(p.name) === _nomNorm(pf.name); });
      const memeVersion = memeNom.filter(function(p) { return _nomNorm(p.version) === _nomNorm(pf.version); });
      if (memeVersion.length === 1) cible = memeVersion[0];
      else if (memeVersion.length > 1) cible = await _choisirPlanAccueil(memeVersion, t("secours.accueil.choisirHomonyme"));
      else if (memeNom.length) {
        const ok = typeof window.ktaConfirm === "function" ? await window.ktaConfirm(_escHtml(t("secours.accueil.autreVersion",
          { nom: pf.name, attendue: pf.version || "?", dispo: memeNom.map(function(p) { return p.version || "?"; }).join(", ") }))) : false;
        if (!ok) return { ok: false, message: t("secours.accueil.annule") };
        cible = memeNom.length === 1 ? memeNom[0] : await _choisirPlanAccueil(memeNom, t("secours.accueil.choisirVersion"));
      }
      if (!cible && !memeNom.length) {
        return { ok: false, message: t("secours.accueil.planAbsent", { nom: pf.name || "?", version: pf.version || "?" }) };
      }
      if (!cible) return { ok: false, message: t("secours.accueil.annule") };
    }
    if (typeof window.chargerPlanDuRegistre !== "function") return { ok: false, message: t("secours.accueil.planAbsent", { nom: pf.name || "?", version: pf.version || "?" }) };
    _accueilEnAttente = { texte: texte, nom: nomFichier || "", planId: cible.id, at: Date.now() };
    console.log("[SecoursMode] Fichier reçu à l'accueil → ouverture du plan", cible.id);
    window.chargerPlanDuRegistre(cible.id);   // plan local sans copie : passe par « Plan introuvable »
    return { ok: true, message: t("secours.accueil.ouverture", { nom: R.displayName ? R.displayName(cible) : (cible.name || cible.id) }) };
  }
  // Appelé par init() : attend la fin du splash (et la restauration de session), puis
  // aperçu → import → lancement en « Équipe ». Abandonné si un autre plan s'est ouvert.
  function _consommerAccueil() {
    const a = _accueilEnAttente;
    if (!a) return;
    // Le registre et la config du plan ne portent pas toujours le même nom : on compare l'id chargé.
    if (Date.now() - a.at > ACCUEIL_TTL_MS || window._currentLoadedPlanId !== a.planId) { _accueilEnAttente = null; return; }
    _accueilEnAttente = null;
    let essais = 0;
    (function attendre() {
      if ((document.getElementById("splashOverlay") || !window.map) && essais++ < 100) { setTimeout(attendre, 300); return; }
      setTimeout(async function() {
        let parsed;
        try { parsed = await _parsePayloadMkmsec(a.texte); }
        catch (e) { parsed = { ok: false, error: t("secours.import.errException", { message: (e && e.message) || String(e) }) }; }
        if (!parsed.ok) { _afficherResultatImport({ ok: false, error: parsed.error }, a.nom); return; }
        _afficherPreviewImport(parsed.payload, parsed.warning, a.nom, function(confirmer, mode) {
          if (!confirmer) return;
          const applied = _appliquerPayloadImport(parsed.payload, mode);
          if (!applied || !applied.scenario) { _afficherResultatImport({ ok: false, error: t("secours.accueil.echec") }, a.nom); return; }
          _currentScenarioId = applied.scenario.id;
          ouvrir(applied.scenario.id);
          _ouvrirLancement(applied.scenario.id, { role: "equipe" });
        });
      }, 800);   // après le recentrage de la restauration de session (motif InterPlanLinks)
    })();
  }

  function init() {
    _loadScenarios();
    console.log("[SecoursMode] Init — " + _scenarios.length + " scénario(s) chargé(s) pour ce plan");
    _consommerAccueil();
    // Intervention en cours sur ce plan → zone, tracé et pastille dès l'ouverture (après la main : la carte
    // et ses tracés finissent de se monter).
    setTimeout(function() {
      const enCours = _scenarioEnCours();
      if (enCours && window.map && !_modal) {
        try { renderOverlay(enCours.id); } catch(e) { console.warn("[SecoursMode] overlay au chargement :", e); }
      }
      _majFooterSecours();
      if (_roadSuiviActive()) _armerVeilleArrivee();   // parcours suivi avant le rechargement
    }, 0);
  }

  // Changement de plan (main.js > _libererRessourcesPlanPrecedent) : ferme la modale, nettoie l'overlay,
  // vide les scénarios en mémoire (ceux du nouveau plan arrivent par init).
  function reset() {
    fermer();
    clearOverlay();
    _scenarios = [];
    _cleChargee = null;
    _currentScenarioId = null;
    _focusedGroupeId = null;
    _majFooterSecours();
  }

  // ── API publique ────────────────────────────────────────────────────

  window.SecoursMode = {
    init:                   init,
    ouvrirDepuisAccueil:    ouvrirDepuisAccueil,   // fichier reçu déposé à l'accueil
    reset:                  reset,
    ouvrir:                 ouvrir,
    fermer:                 fermer,
    isOpen:                 isOpen,
    getCurrentScenarioId:   getCurrentScenarioId,
    list:                   list,
    get:                    get,
    create:                 createScenario,
    update:                 updateScenario,
    delete:                 deleteScenario,
    duplicate:              duplicateScenario,
    // Création depuis le Mode Perdu.
    creerDepuisLostMode:    creerDepuisLostMode,
    // Assigner un POI à une équipe depuis la recherche unifiée (searchPoints.js).
    ouvrirAssignerModale:   ouvrirAssignerModale,
    // Export/import d'un scénario autonome (.mkmsec.json).
    exporterScenario:       exporterScenario,
    importerScenario:       importerScenario,
    addGroupe:              addGroupe,
    updateGroupe:           updateGroupe,
    removeGroupe:           removeGroupe,
    recalculerItineraires:  recalculerItineraires,
    exporterPDF:            exporterPDF,
    exporterKMZ:            exporterKMZ,
    genererBriefingPompiersPDF: genererBriefingPompiersPDF,
    renderOverlay:          renderOverlay,
    clearOverlay:           clearOverlay,
    setFocus:               setFocus,
    // Changement de niveau : la carte du scénario affiché se redessine (atténuation hors niveau).
    redessinerOverlay:      function() { if (_overlayLayer) renderOverlay(_currentScenarioId); },
    onChange:               onChange,
    // Multi-phases : lecture seule.
    getCurrentPhase:        function(scenarioId) { return _getCurrentPhase(get(scenarioId)); },
    listerEquipesPhase:     function(scenarioId, phaseIdx) {
      return _listerEquipesPhase(get(scenarioId), phaseIdx);
    },
    groupeParticipeAPhase:  function(scenarioId, equipeId, phaseIdx) {
      return _groupeParticipeAPhase(get(scenarioId), equipeId, phaseIdx);
    },
    // Mutations.
    creerPhase:             creerPhase,
    renommerPhase:          renommerPhase,
    supprimerPhase:         supprimerPhase,
    affecterEquipeAPhase:   affecterEquipeAPhase,
    // Transitions + debrief + lecture de l'archive.
    terminerPhase:          terminerPhase,
    lancerPhaseSuivante:    lancerPhaseSuivante,
    getArchivedEtapes:      function(scenarioId, phaseIdx, equipeId) {
      return _getArchivedEtapes(get(scenarioId), phaseIdx, equipeId);
    },
    isPhasePretAClore:      function(scenarioId) {
      return _phaseEstPretAClore(get(scenarioId));
    },
    // 🩸 tracés de la zone d'une équipe (empreintes stables, cf _cleTrace).
    // Seule façon correcte de lire `zoneRoadIds` hors du module (kmzExport).
    marquerSuivi:           marquerSuivi,   // départ, rentrée, rappel
    // Installation reliée : prises neutres, appelées par une extension.
    rejoindre:              rejoindre,
    appliquerEtapeDistante: appliquerEtapeDistante,
    appliquerSuiviDistant:  appliquerSuiviDistant,
    tracesZone:             _tracesZone,
    // Constantes (lecture seule).
    PALETTE:                PALETTE,
    MAX_SCENARIOS:          MAX_SCENARIOS,
    VITESSE_MPS_DEFAUT:     VITESSE_MPS_DEFAUT,
    PHASE_DEFAULT_NOM:      PHASE_DEFAULT_NOM
  };

  console.log("[SecoursMode] Module chargé.");
})();
