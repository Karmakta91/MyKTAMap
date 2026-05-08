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
  const POLL_INTERVAL_MS = 1500;
  const VERSION = 1;

  let _pollTimer     = null;
  let _lastHash      = null;
  let _currentPlanId = null;

  // ========== ETAT COURANT ==========

  function _gatherState() {
    return {
      editorPoints: window.getEditorPoints  ? (window.getEditorPoints()  || []) : [],
      roads:        window.getRoads         ? (window.getRoads()         || []) : [],
      zones:        window.getZones         ? (window.getZones()         || []) : [],
      measure:      window.getMeasurePoints ? (window.getMeasurePoints() || []) : []
      // tracker path : volontairement non persisté (cf. choix 3:b)
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
        && state.measure.length      === 0;
  }

  // ========== STORAGE ==========

  function _currentPlanName() {
    return (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "";
  }

  function save() {
    if (!_currentPlanId) return false;
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
      zones:        state.zones,
      measure:      state.measure
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      _lastHash = hash;
      return true;
    } catch(e) {
      console.warn("[SessionPersist] save échoué :", e);
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
  }

  // ========== RESTORE ==========

  function _applyRestore(payload) {
    if (!payload) return null;
    const restored = { points: 0, roads: 0, zones: 0, measure: 0 };
    try {
      // setEditorPoints ne redessine PAS automatiquement les markers (asymétrie avec setRoads/setZones).
      // Il faut appeler renderEditorPoints() après pour que les icônes apparaissent sur la carte.
      if (window.setEditorPoints && Array.isArray(payload.editorPoints)) {
        window.setEditorPoints(payload.editorPoints);
        if (window.renderEditorPoints) window.renderEditorPoints();
        restored.points = payload.editorPoints.length;
      }
      // setRoads redessine en interne (renderRoads), donc juste reset + set
      if (Array.isArray(payload.roads)) {
        if (window.resetRoads) window.resetRoads();
        if (window.setRoads)   window.setRoads(payload.roads);
        restored.roads = payload.roads.length;
      }
      // setZones redessine en interne (renderZones), donc juste reset + set
      if (Array.isArray(payload.zones)) {
        if (window.resetZones) window.resetZones();
        if (window.setZones)   window.setZones(payload.zones);
        restored.zones = payload.zones.length;
      }
      // setMeasurePoints redessine en interne (updateMesure)
      if (window.setMeasurePoints && Array.isArray(payload.measure)) {
        window.setMeasurePoints(payload.measure);
        restored.measure = payload.measure.length;
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
    if (window.setEditorPoints)  window.setEditorPoints([]);
    if (window.resetRoads)       window.resetRoads();
    if (window.resetZones)       window.resetZones();
    if (window.setMeasurePoints) window.setMeasurePoints([]);
  }

  // ========== MODALE DE FEEDBACK ==========
  // Modale centrée respectant la charte des autres modales de l'app
  // (kta-readme-modal pattern : overlay sombre + boîte centrée)

  function _afficherModaleSession(restored) {
    if (!restored) return;
    const total = restored.points + restored.roads + restored.zones + restored.measure;
    if (total === 0) return;

    const existing = document.getElementById("kta-session-modal");
    if (existing) existing.remove();

    const parts = [];
    if (restored.points)  parts.push(restored.points  + " point"  + (restored.points  > 1 ? "s" : ""));
    if (restored.roads)   parts.push(restored.roads   + " tracé"  + (restored.roads   > 1 ? "s" : ""));
    if (restored.zones)   parts.push(restored.zones   + " zone"   + (restored.zones   > 1 ? "s" : ""));
    if (restored.measure) parts.push(restored.measure + " mesure" + (restored.measure > 1 ? "s" : ""));

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
    _pollTimer = setInterval(save, POLL_INTERVAL_MS);
  }

  function _stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ========== HOOK PRINCIPAL ==========

  // Appelé par main.js > lancerApplication() après init complète
  // Logique :
  //  - Si la session sauvegardée correspond à ce planId → restore + toast
  //  - Si elle correspond à un AUTRE planId → purge (cf. choix 5:a "un plan a été chargé entre temps")
  //  - Démarre le polling pour la nouvelle session
  function onPlanLoaded(planId) {
    _stopPolling();
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
  window.addEventListener("beforeunload", function() { save(); });

  // Save quand la page passe en arrière-plan (mobile + onglet caché)
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") save();
  });

  // ========== EXPORTS ==========
  window.SessionPersist = {
    onPlanLoaded: onPlanLoaded,
    save:         save,
    clear:        clear,
    getSaved:     getSaved
  };
})();
