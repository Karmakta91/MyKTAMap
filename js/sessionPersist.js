/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// SESSION PERSIST — auto-sauvegarde de la session active
// =========================
// Stratégie :
//  - Slot unique dans localStorage (clé STORAGE_KEY)
//  - Polling périodique : compare un hash de l'état avec le dernier sauvegardé
//  - Save aussi sur beforeunload + visibilitychange (mobile mise en arrière-plan)
//  - Restore appelé par main.js après lancerApplication() via onPlanLoaded(planId)
//  - Tracker path volontairement EXCLU (expérimental, restaurer une trail morte est trompeur)
//
// API : window.SessionPersist
//   - onPlanLoaded(planId)    → à appeler après chargement complet d'un plan
//   - save()                  → force une sauvegarde immédiate
//   - clear()                 → efface la session sauvegardée
//   - getSaved()              → retourne le payload mémorisé ou null
// =========================

(function() {
  "use strict";

  const STORAGE_KEY      = "myktamap_session_v1";
  const POLL_INTERVAL_MS      = 1500;   // défaut (~real-time)
  const POLL_INTERVAL_SLOW_MS = 30000;  // mode 🚀 PerfUltra.slowSave (30s)

  // Sélectionne l'intervalle de polling selon le toggle PerfUltra.slowSave.
  function _currentPollInterval() {
    if (window.PerfUltra && window.PerfUltra.get("slowSave")) {
      return POLL_INTERVAL_SLOW_MS;
    }
    return POLL_INTERVAL_MS;
  }
  const VERSION = 1;

  let _pollTimer     = null;
  let _lastHash      = null;
  let _currentPlanId = null;
  // Anti-spam toast quota : true après 1ère alerte, reset après 1er save réussi
  let _quotaWarned   = false;
  // 🆕 v1.8.1 : ID du setTimeout de la phase 2 de restore (itinéraire différé).
  // Permet d'annuler la phase 2 si l'user clique "Effacer la session" avant
  // que les 1500ms ne soient écoulés — sinon l'itinéraire réapparaissait
  // ~1.5s après l'effacement, ce qui était très perturbant.
  let _phase2TimeoutId = null;
  function _annulerPhase2() {
    if (_phase2TimeoutId !== null) {
      clearTimeout(_phase2TimeoutId);
      _phase2TimeoutId = null;
    }
  }

  // ========== ETAT COURANT ==========

  function _gatherState() {
    // 🆕 v1.8.1 (demande KARMA) : on persiste DESORMAIS aussi les roads
    // de type "itinerary". Avant (suite 29, 09/05/2026), elles etaient
    // filtrees pour eviter un crash au reload (drop-shadow CSS du halo
    // neon cyan qui saturait le GPU au boot quand applique trop tot dans
    // le cycle de vie de Leaflet + tuiles V2 en cours de chargement).
    //
    // La premiere reactivation v1.8.0 (sans precaution) reproduisait
    // exactement ce crash. Fix v1.8.1 : restore en DEUX PHASES cote
    // _restore() — immediat pour les roads classiques, differe +1500ms
    // pour les itineraires. Le timing mime celui du flow manuel d'import
    // session (qui marche sans crash car l'app est deja stabilisee).
    //
    // Le SAVE lui-meme reste simple : on sauve tout. C'est cote RESTORE
    // qu'on echelonne.
    return {
      editorPoints: window.getEditorPoints  ? (window.getEditorPoints()  || []) : [],
      roads:        window.getRoads         ? (window.getRoads()         || []) : [],
      zones:        window.getZones         ? (window.getZones()         || []) : [],
      // 🆕 v1.9.3-A1.a : structures (piliers + murs) — clés séparée pour
      // ne pas casser la rétrocompat (anciens payloads sans 'structures'
      // sont restaurés avec array vide via `payload.structures || []`).
      structures:   window.getStructures    ? (window.getStructures()    || []) : [],
      // 🆕 v1.12.0-fix (KARMA "en footer, on peux afficher a la fois,
      // une mesure de surface, et une comme avant de distance") : les
      // 2 mesures coexistent désormais en simultané. `measure` = la
      // polyline DISTANCE (rétrocompat avec anciennes sessions), et
      // `measureSurface` = le polygone SURFACE (nouveau).
      measure:        window.getMeasurePoints        ? (window.getMeasurePoints()        || []) : [],
      measureSurface: window.getMeasurePointsSurface ? (window.getMeasurePointsSurface() || []) : [],
      // Mode actif (drive les clics + surligne la ligne du footer).
      measureMode:  (typeof window.getMeasureMode === "function") ? window.getMeasureMode() : "distance"
      // tracker path : volontairement non persiste (cf. choix 3:b, tracker
      // experimental, ressusciter un trail fige serait trompeur sans pos.
      // recente du capteur).
    };
  }

  // Hash simple djb2-like : suffisant pour détecter un changement
  function _hashState(state) {
    const str = JSON.stringify(state);
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return h.toString(36);
  }

  function _isEmptyState(state) {
    return state.editorPoints.length === 0
        && state.roads.length        === 0
        && state.zones.length        === 0
        && (state.structures || []).length === 0
        && state.measure.length      === 0
        // 🐛 v1.12.0-fix (KARMA "une surface n'est pas persistée") : sans
        // ce check, un user qui a UNIQUEMENT dessiné un polygone surface
        // verrait son état considéré "vide" → localStorage purgé → perte
        // au reload. Surface compte aussi comme contenu.
        && (state.measureSurface || []).length === 0;
  }

  // ========== STORAGE ==========

  function _currentPlanName() {
    return (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "";
  }

  // Throttle adaptatif : le polling 1.5s peut tomber en plein milieu d'un
  // long task UI (zoom Leaflet, rendu canvas tile, etc.). Sur mobile, le
  // localStorage.setItem synchrone ajoute alors du jank perceptible. On
  // mesure le temps écoulé depuis le début du tick rAF courant : si on est
  // déjà à >100ms (= main thread déjà occupé), on skip ce save et on
  // attendra le prochain poll. Garantit qu'on n'aggrave pas la pression
  // pendant une opération coûteuse, sans rien perdre en pratique car
  // le hash-check fait que le save reprendra juste après.
  let _lastForceSave = 0;
  function _mainThreadBusy() {
    // Heuristique simple : performance.now() vs un repère local.
    // En condition normale, deux appels successifs sont à <1ms.
    // Si le browser a juste retraité un long task, perf.now() peut sauter.
    const t0 = performance.now();
    let i = 0;
    // micro-bench : ~50 µs en idle, plus si CPU contesté
    while (i < 1000) i++;
    return (performance.now() - t0) > 5;
  }

  function save(opts) {
    if (!_currentPlanId) return false;

    // Throttle : sauf si force=true (beforeunload, visibilitychange) on
    // skip si le main thread est sous pression
    const force = opts && opts.force;
    if (!force && _mainThreadBusy()) {
      // Si on a skippé plus de 6 fois (≈ 9 secondes), on force quand même
      // pour pas perdre de modif si la pression dure longtemps.
      _lastForceSave++;
      if (_lastForceSave < 6) return false;
    }
    _lastForceSave = 0;

    const state = _gatherState();
    const hash  = _hashState(state);
    if (hash === _lastHash) return false; // pas de changement depuis dernier save

    if (_isEmptyState(state)) {
      // Etat vide → on efface l'éventuelle sauvegarde existante (utile après "Effacer la session")
      try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
      _lastHash = hash;
      return false;
    }

    const payload = {
      version:      VERSION,
      planId:       _currentPlanId,
      planName:     _currentPlanName(),  // ← double-check anti-collision d'ID
      savedAt:      new Date().toISOString(),
      editorPoints: state.editorPoints,
      roads:        state.roads,
      // 🆕 v1.9.3-A1.a : structures (piliers + murs)
      structures:   state.structures || [],
      zones:        state.zones,
      measure:      state.measure,
      // 🐛 v1.12.0-fix (KARMA "une surface n'est pas persistée à la
      // différence de mesure") : le payload écrit dans localStorage
      // doit inclure measureSurface ET measureMode, sinon _gatherState
      // les remonte correctement mais save() les jette. Bug introduit
      // lors de la refonte 2 mesures coexistantes — j'avais ajouté les
      // champs dans _gatherState mais pas dans le payload final.
      measureSurface: state.measureSurface || [],
      measureMode:    state.measureMode    || "distance"
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      _lastHash = hash;
      _quotaWarned = false;  // reset si le save remarche après libération de place
      return true;
    } catch(e) {
      console.warn("[SessionPersist] save échoué :", e);
      // Détection quota dépassé : sur mobile c'est très souvent un signe que
      // le navigateur va commencer à purger / killer l'onglet. On alerte
      // l'utilisateur 1× pour l'inciter à exporter sa session manuellement
      // avant que tout soit perdu. _quotaWarned évite le spam sur les ticks
      // suivants tant que le problème dure.
      const isQuota =
        e && (e.name === "QuotaExceededError" ||
              e.code === 22 ||                       // historique Chrome/Safari
              e.code === 1014 ||                     // Firefox NS_ERROR_DOM_QUOTA_REACHED
              /quota|storage/i.test(e.message || ""));
      if (isQuota && !_quotaWarned && window.OOMGuard) {
        _quotaWarned = true;
        window.OOMGuard.showToast(
          "Espace de stockage du smartphone saturé — la session ne peut plus être sauvegardée automatiquement. " +
          "Pense à exporter ta session (💾 Enregistrer la session) pour ne rien perdre.",
          "error"
        );
      }
      return false;
    }
  }

  function getSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || payload.version !== VERSION) return null;
      return payload;
    } catch(e) {
      console.warn("[SessionPersist] read échoué :", e);
      return null;
    }
  }

  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    _lastHash = null;
    // 🆕 v1.8.1 : annule la phase 2 de restore en attente. Sans ça, si
    // l'user clique "🗑️ Effacer la session" dans la modale de feedback
    // pendant les 1500ms du setTimeout, l'itinéraire réapparaissait
    // après l'effacement (timing piège du restore différé).
    _annulerPhase2();
  }

  // ========== RESTORE ==========

  function _applyRestore(payload) {
    if (!payload) return null;
    // 🆕 v1.12.0-fix : measureSurface tracké séparément pour le compteur
    // de la modale de feedback "Session restaurée".
    const restored = { points: 0, roads: 0, zones: 0, structures: 0, measure: 0, measureSurface: 0 };
    try {
      // setEditorPoints redessine désormais en interne (depuis 09/05/2026, fix bug
      // toggle calque "Ajout" sur points restaurés) — symmetric avec setRoads/setZones
      if (window.setEditorPoints && Array.isArray(payload.editorPoints)) {
        window.setEditorPoints(payload.editorPoints);
        restored.points = payload.editorPoints.length;
      }
      // setRoads redessine en interne (renderRoads), donc juste reset + set.
      // 🆕 v1.8.1 (re-fix KARMA) : restore en DEUX PHASES pour éviter le
      // crash GPU au boot avec un itineraire actif :
      //   - Phase 1 (immédiate) : toutes les roads SAUF itinerary
      //   - Phase 2 (différée +1500ms) : les itinerary
      //
      // Pourquoi ? L'itineraire est rendu avec un CSS drop-shadow double
      // (halo néon cyan) qui est coûteux en compositing GPU. Au boot, ce
      // rendu se cumule avec :
      //   - Leaflet pas encore stabilisé (zoom/center initial)
      //   - Tuiles V2 en cours de chargement (placement progressif)
      //   - Init des autres modules (Pathfinder, label distance, etc.)
      // Le tout sature le GPU mobile → crash silencieux (= reload boucle).
      //
      // En import session MANUEL (UI sessionExporter), pas de problème :
      // l'app est déjà stabilisée, le drop-shadow s'applique sans conflit.
      // D'où ce différé qui mime le timing du flow manuel.
      //
      // Filtre defensif minimal : on garde le check r.type defini pour
      // ignorer les entrees corrompues (anciens formats, edits manuels du
      // localStorage, etc.).
      if (Array.isArray(payload.roads)) {
        const safeRoads = payload.roads.filter(function(r) {
          return r && typeof r.type === "string" && r.type.length > 0;
        });
        // Sépare itinéraires (différés) du reste (immédiat)
        const phaseImmediat = safeRoads.filter(function(r) { return r.type !== "itinerary"; });
        const phaseDifferee = safeRoads.filter(function(r) { return r.type === "itinerary"; });

        if (window.resetRoads) window.resetRoads();
        if (window.setRoads)   window.setRoads(phaseImmediat);
        restored.roads = safeRoads.length;  // on annonce le total (l'user verra l'itinéraire arriver après)

        // Phase 2 : différé. 1500ms = laisser Leaflet finir son fitBounds
        // initial + tuiles V2 se placer + autres modules s'initialiser.
        // Si entre temps l'user a tracé une nouvelle road, on la préserve
        // via concat sur getRoads() courant (pas un reset brutal).
        if (phaseDifferee.length > 0) {
          // Annuler une phase 2 en attente précédente (cas pathologique :
          // double restore dans la même session, ne devrait pas arriver
          // mais protection peu coûteuse).
          _annulerPhase2();
          _phase2TimeoutId = setTimeout(function() {
            _phase2TimeoutId = null;  // marqué comme consommé
            try {
              const current = window.getRoads ? (window.getRoads() || []) : [];
              // Sécurité : si l'user a entre-temps lancé une modale Itinéraire
              // qui a créé son propre itinéraire, on ne l'écrase pas (filter
              // sur current avant concat) — sinon on a 2 itinéraires en même
              // temps ce qui casse le label distance.
              const dejaIti = current.some(function(r) { return r && r.type === "itinerary"; });
              if (dejaIti) {
                console.info("[SessionPersist] phase 2 itinéraire : skip (un itinéraire actif existe déjà après la phase 1)");
                return;
              }
              if (window.setRoads) window.setRoads(current.concat(phaseDifferee));
              console.info("[SessionPersist] phase 2 : itinéraire restauré en mode différé");
            } catch(e) {
              console.warn("[SessionPersist] phase 2 échec restauration itinéraire :", e);
            }
          }, 1500);
        }
      }
      // setZones redessine en interne (renderZones), donc juste reset + set
      if (Array.isArray(payload.zones)) {
        if (window.resetZones) window.resetZones();
        if (window.setZones)   window.setZones(payload.zones);
        restored.zones = payload.zones.length;
      }
      // 🆕 v1.9.3-A1.a : restore des structures (piliers + murs).
      // Rétrocompat : payload.structures peut être absent dans les saves
      // antérieurs à v1.9.3 → on traite comme array vide (aucun reset
      // non plus pour ne pas écraser des structures déjà présentes via
      // un autre flow — mais en pratique resetStructures sera no-op
      // puisque initStructures vide déjà l'état au plan switch).
      if (Array.isArray(payload.structures)) {
        if (window.resetStructures) window.resetStructures();
        if (window.setStructures)   window.setStructures(payload.structures);
        restored.structures = payload.structures.length;
      }
      // 🆕 v1.12.0-fix : restore le mode actif (drive juste l'UI footer
      // active line + cible des prochains clics, n'efface plus rien).
      if (typeof window.setMeasureMode === "function" && typeof payload.measureMode === "string") {
        window.setMeasureMode(payload.measureMode);
      }
      // setMeasurePoints (= polyline distance) — rétrocompat avec anciens payloads
      if (window.setMeasurePoints && Array.isArray(payload.measure)) {
        window.setMeasurePoints(payload.measure);
        restored.measure = payload.measure.length;
      }
      // 🆕 v1.12.0-fix : restore aussi le polygone surface séparément
      if (window.setMeasurePointsSurface && Array.isArray(payload.measureSurface)) {
        window.setMeasurePointsSurface(payload.measureSurface);
        restored.measureSurface = payload.measureSurface.length;
      }
      // Mettre à jour le hash courant pour que le prochain poll ne détecte pas
      // les setters comme une modification utilisateur
      _lastHash = _hashState(_gatherState());
      return restored;
    } catch(e) {
      console.error("[SessionPersist] restore échoué :", e);
      return null;
    }
  }

  function _viderEtatCourant() {
    // 🆕 v1.8.1 : annule la phase 2 de restore en attente (même raison
    // que dans clear() — cf. commentaire). Double protection en cas
    // d'appel direct sans passer par clear().
    _annulerPhase2();
    if (window.setEditorPoints)  window.setEditorPoints([]);
    if (window.resetRoads)       window.resetRoads();
    if (window.resetZones)       window.resetZones();
    // 🆕 v1.9.3-A1.a : structures purgées aussi lors d'un vidage
    if (window.resetStructures)  window.resetStructures();
    if (window.setMeasurePoints)        window.setMeasurePoints([]);
    // 🆕 v1.12.0-fix : vide aussi la mesure de surface
    if (window.setMeasurePointsSurface) window.setMeasurePointsSurface([]);
  }

  // ========== MODALE DE FEEDBACK ==========
  // Modale centrée respectant la charte des autres modales de l'app
  // (kta-readme-modal pattern : overlay sombre + boîte centrée)

  function _afficherModaleSession(restored) {
    if (!restored) return;
    const total = restored.points + restored.roads + restored.zones
                + (restored.structures || 0) + restored.measure
                // 🆕 v1.12.0-fix : surface compte aussi pour décider d'afficher
                + (restored.measureSurface || 0);
    if (total === 0) return;

    const existing = document.getElementById("kta-session-modal");
    if (existing) existing.remove();

    const parts = [];
    if (restored.points)     parts.push(restored.points  + " point"  + (restored.points  > 1 ? "s" : ""));
    if (restored.roads)      parts.push(restored.roads   + " tracé"  + (restored.roads   > 1 ? "s" : ""));
    if (restored.zones)      parts.push(restored.zones   + " zone"   + (restored.zones   > 1 ? "s" : ""));
    // 🆕 v1.9.3-A1.a : structures dans le feedback restauration session
    if (restored.structures) parts.push(restored.structures + " structure" + (restored.structures > 1 ? "s" : ""));
    if (restored.measure)    parts.push("mesure distance");
    // 🆕 v1.12.0-fix : surface dans le feedback de restauration
    if (restored.measureSurface) parts.push("mesure surface");

    // Nom du plan en cours (échappé) pour que l'utilisateur voie clairement de quel plan vient la session
    const planName = _currentPlanName();
    const planNameSafe = planName.replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
    const planLine = planName
      ? '<div class="kta-session-modal-plan">📍 ' + planNameSafe + '</div>'
      : '';

    const modal = document.createElement("div");
    modal.id = "kta-session-modal";
    modal.className = "kta-session-modal-overlay";
    modal.innerHTML =
      '<div class="kta-session-modal-boite">' +
        '<div class="kta-session-modal-icon">↻</div>' +
        '<div class="kta-session-modal-titre">Session précédente restaurée</div>' +
        planLine +
        '<div class="kta-session-modal-detail">' + parts.join(" · ") + '</div>' +
        '<div class="kta-session-modal-actions">' +
          '<button class="kta-btn kta-btn-ghost"   type="button" data-action="clear">🗑️ Effacer la session</button>' +
          '<button class="kta-btn kta-btn-primary" type="button" data-action="keep">✓ Continuer</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    function fermer() {
      modal.classList.add("hiding");
      setTimeout(function() { modal.remove(); }, 220);
    }

    modal.querySelector('[data-action="keep"]').addEventListener("click", fermer);
    modal.querySelector('[data-action="clear"]').addEventListener("click", function() {
      _viderEtatCourant();
      clear();
      fermer();
    });
    // Click sur le backdrop = "Continuer" (pattern modal soft)
    modal.addEventListener("click", function(e) {
      if (e.target === modal) fermer();
    });
    // Échap = "Continuer"
    const onKey = function(e) {
      if (e.key === "Escape") {
        fermer();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
  }

  // ========== POLLING ==========

  function _startPolling() {
    if (_pollTimer) return;
    const interval = _currentPollInterval();
    _pollTimer = setInterval(save, interval);
    if (interval !== POLL_INTERVAL_MS) {
      console.log("[SessionPersist] 🚀 PerfUltra.slowSave actif → polling " + (interval/1000) + "s");
    }
  }

  function _stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // Hook sur changement du toggle PerfUltra.slowSave → redémarrer le polling
  // avec le nouvel intervalle (sans attendre un reload).
  if (window.PerfUltra && typeof window.PerfUltra.onChange === "function") {
    window.PerfUltra.onChange(function(changedKeys) {
      if (changedKeys.indexOf("slowSave") >= 0 && _pollTimer) {
        _stopPolling();
        _startPolling();
      }
    });
  }

  // ========== HOOK PRINCIPAL ==========

  // Appelé par main.js > lancerApplication() après init complète
  // Logique :
  //  - Si la session sauvegardée correspond à ce planId → restore + toast
  //  - Si elle correspond à un AUTRE planId → purge (cf. choix 5:a "un plan a été chargé entre temps")
  //  - Démarre le polling pour la nouvelle session
  function onPlanLoaded(planId) {
    _stopPolling();
    // 🆕 v1.8.1 : annule la phase 2 de restore en attente. Sinon, si
    // l'user a chargé une session avec itinéraire (phase 2 setTimeout
    // de 1500ms en cours) puis a fait un plan switch (🗂️) avant que
    // les 1500ms s'écoulent, le setTimeout finirait par s'exécuter sur
    // le NOUVEAU plan → l'itinéraire de l'ancien plan apparaîtrait
    // collé au nouveau. Bug subtil mais reproductible.
    _annulerPhase2();
    _currentPlanId = planId || null;
    _lastHash = null;

    if (!_currentPlanId) {
      // Pas de planId connu → on ne touche pas au stockage existant, on démarre quand même le poll
      _startPolling();
      return null;
    }

    const saved = getSaved();
    let restored = null;
    if (saved) {
      // Double-check : planId ET planName doivent matcher
      // (anti-collision : 2 plans locaux avec même nom+version produisent le même genLocalId)
      const currentName = _currentPlanName();
      const idMatch     = (saved.planId === _currentPlanId);
      const nameMatch   = (!saved.planName || !currentName)
                            ? true                              // pas de nom des deux côtés → on accepte le match d'ID seul
                            : (saved.planName === currentName); // les deux côtés ont un nom → on compare

      if (idMatch && nameMatch) {
        restored = _applyRestore(saved);
        if (restored) _afficherModaleSession(restored);
      } else {
        if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
          console.log("[SessionPersist] Session écartée — saved=", saved.planId, "/", saved.planName,
                      " current=", _currentPlanId, "/", currentName,
                      " (idMatch:", idMatch, ", nameMatch:", nameMatch, ")");
        }
        clear();
      }
    }
    _startPolling();
    return restored;
  }

  // ========== SAFETY NETS ==========

  // Save au unload (fermeture page)
  // Force=true au unload : critique de pas perdre les dernières modifs même
  // si le main thread est busy (la page va disparaître, on n'aura pas de 2e chance).
  window.addEventListener("beforeunload", function() { save({ force: true }); });

  // Save quand la page passe en arrière-plan (mobile + onglet caché)
  document.addEventListener("visibilitychange", function() {
    // Force=true quand l'app passe en arrière-plan (mobile : iOS peut tuer
    // l'onglet pour récup mémoire), même règle que beforeunload.
    if (document.visibilityState === "hidden") save({ force: true });
  });

  // ========== EXPORTS ==========
  window.SessionPersist = {
    onPlanLoaded: onPlanLoaded,
    save:         save,
    clear:        clear,
    getSaved:     getSaved
  };
})();
