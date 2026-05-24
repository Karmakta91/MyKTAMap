// =========================
// ⭐ Favoris (v1.16.0 step 3)
// =========================
//
// Permet à l'utilisateur de marquer des POINTS (POI) comme favoris pour y
// revenir rapidement. Stockage par plan dans localStorage. Affichage dans
// un nouveau groupe sidebar "⭐ Favoris" (flyout) : clic sur un favori →
// centre la carte dessus + flash visuel.
//
// Format de stockage (localStorage key "myktamap_favoris_v1") :
//   {
//     version: 1,
//     byPlan: {
//       "<planId>": [
//         {
//           uid:        "fav-...",     // ID unique du favori
//           pointId:    "...",          // ID du point d'origine
//           nom:        "...",          // libellé snapshot
//           x: 1234, y: 5678,           // coords plan x/y (snapshot)
//           tag:        "puits"|...,   // tag principal (pour icône)
//           layerId:    "editor"|...,  // calque d'origine (pour info)
//           layerLabel: "...",          // libellé du calque (pour info)
//           addedAt:    1716552000     // timestamp ajout
//         }
//       ]
//     }
//   }
//
// API publique :
//   window.Favoris.loadPlan(planId)     → switch active plan (appelé par main.js)
//   window.Favoris.getAll()             → list of favoris for current plan
//   window.Favoris.isFav(pointId)       → bool
//   window.Favoris.findByPointId(id)    → favori entry or null
//   window.Favoris.add(snapshot)        → adds, returns true if added
//   window.Favoris.remove(pointId)      → removes, returns true if removed
//   window.Favoris.toggle(snapshot)     → { action: "added"|"removed", changed }
//   window.Favoris.onChange(fn)         → listener (sidebar refresh)
//
// Pourquoi snapshot complet plutôt que juste l'ID :
//   1. Résilience : si le point est supprimé/déplacé du data layer, le
//      favori continue de fonctionner (centre sur les coords snapshot).
//   2. Performance : pas besoin de scanner getEditorPoints + data layers
//      à chaque ouverture du flyout pour résoudre les libellés/icônes.
//   3. Si le point est édité (renommé) après ajout en favori, le snapshot
//      est obsolète — trade-off acceptable, l'utilisateur peut retirer
//      et re-ajouter pour rafraîchir.

window.Favoris = (function() {
  "use strict";

  const STORAGE_KEY = "myktamap_favoris_v1";
  const VERSION     = 1;

  let _currentPlanId = null;
  let _store         = { version: VERSION, byPlan: {} };
  const _listeners   = [];

  // ─────────────────────────────────────────────
  // Persistance localStorage
  // ─────────────────────────────────────────────
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === VERSION && parsed.byPlan && typeof parsed.byPlan === "object") {
        _store = parsed;
      }
    } catch(e) {
      console.warn("[Favoris] _load échec :", e);
    }
  }

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_store));
    } catch(e) {
      console.warn("[Favoris] _save échec :", e);
      // Quota dépassé sur mobile → on alerte une fois via OOMGuard si dispo
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function" &&
          e && (e.name === "QuotaExceededError" || /quota/i.test(e.message || ""))) {
        window.OOMGuard.showToast(
          "Stockage saturé — favoris non sauvegardés. Pense à exporter ta session.",
          "error"
        );
      }
    }
  }

  function _emit() {
    _listeners.forEach(function(fn) {
      try { fn(); } catch(e) { console.warn("[Favoris] listener erreur :", e); }
    });
  }

  // ─────────────────────────────────────────────
  // Cycle de vie : switch de plan
  // ─────────────────────────────────────────────
  function loadPlan(planId) {
    _currentPlanId = planId || null;
    if (_currentPlanId && !_store.byPlan[_currentPlanId]) {
      _store.byPlan[_currentPlanId] = [];
    }
    _emit();
  }

  function _currentList() {
    if (!_currentPlanId) return [];
    return _store.byPlan[_currentPlanId] || [];
  }

  // ─────────────────────────────────────────────
  // Lookup / state
  // ─────────────────────────────────────────────
  function getAll() {
    return _currentList().slice();
  }

  function findByPointId(pointId) {
    if (!pointId) return null;
    const list = _currentList();
    for (let i = 0; i < list.length; i++) {
      if (list[i].pointId === pointId) return list[i];
    }
    return null;
  }

  function isFav(pointId) {
    return !!findByPointId(pointId);
  }

  // ─────────────────────────────────────────────
  // Mutations
  // ─────────────────────────────────────────────
  function _newUid() {
    return "fav-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function add(snapshot) {
    if (!_currentPlanId) return false;
    if (!snapshot || !snapshot.pointId) return false;
    // Anti-doublon
    if (isFav(snapshot.pointId)) return false;
    if (!_store.byPlan[_currentPlanId]) _store.byPlan[_currentPlanId] = [];
    const entry = {
      uid:        _newUid(),
      pointId:    String(snapshot.pointId),
      nom:        String(snapshot.nom || "(sans nom)"),
      x:          Number(snapshot.x) || 0,
      y:          Number(snapshot.y) || 0,
      tag:        snapshot.tag        || "default",
      layerId:    snapshot.layerId    || "editor",
      layerLabel: snapshot.layerLabel || "",
      addedAt:    Date.now()
    };
    _store.byPlan[_currentPlanId].push(entry);
    _save();
    _emit();
    return true;
  }

  function remove(pointId) {
    if (!_currentPlanId) return false;
    const list = _store.byPlan[_currentPlanId];
    if (!list) return false;
    const idx = list.findIndex(function(f) { return f.pointId === pointId; });
    if (idx < 0) return false;
    list.splice(idx, 1);
    _save();
    _emit();
    return true;
  }

  function toggle(snapshot) {
    if (!snapshot || !snapshot.pointId) return { action: "none", changed: false };
    if (isFav(snapshot.pointId)) {
      const ok = remove(snapshot.pointId);
      return { action: "removed", changed: ok };
    }
    const ok = add(snapshot);
    return { action: "added", changed: ok };
  }

  // ─────────────────────────────────────────────
  // Listeners pour UI (sidebar flyout refresh)
  // ─────────────────────────────────────────────
  function onChange(fn) {
    if (typeof fn !== "function") return function() {};
    _listeners.push(fn);
    return function() {
      const i = _listeners.indexOf(fn);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  // Lecture immédiate au boot — main.js > startApp appellera loadPlan(planId)
  // pour pointer sur le bon plan après load de PLAN_CONFIG.
  _load();

  return {
    loadPlan:        loadPlan,
    getAll:          getAll,
    isFav:           isFav,
    findByPointId:   findByPointId,
    add:             add,
    remove:          remove,
    toggle:          toggle,
    onChange:        onChange,
    // Exposé pour debug
    _STORAGE_KEY:    STORAGE_KEY,
    _VERSION:        VERSION
  };
})();
