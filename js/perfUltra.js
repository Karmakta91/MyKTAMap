/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// 🚀 PERF ULTRA — toggles d'optimisation pour gros plans / appareils faibles
// =========================
// Préset "ULTRA" qui active 6 optims simultanément, OU toggles individuels
// pour les power users qui veulent affiner. Persistance localStorage globale
// (préférence utilisateur, comme debugMode), pas par plan.
//
// Optims gérées :
//   - decim         : décimation des polylines roads au dézoom (RDP)
//   - animOff       : désactivation des animations Leaflet (zoom/fade/markerZoom)
//                     ⚠️ Lu UNIQUEMENT à l'init de la map → reload requis
//   - noIntersect   : seuil cercles d'intersection roads abaissé à 50 (vs 200)
//   - noTooltips    : skip bindPopup sur les markers des calques de données
//                     (les points de session restent interactifs)
//   - slowSave      : SessionPersist polling 30s au lieu de 1.5s
//   - viewportCull  : ne rendre que les roads dont l'AABB intersecte le viewport
//
// API exposée :
//   - window.PerfUltra.get(key) → bool
//   - window.PerfUltra.set(key, value, opts?) → bool (success)
//   - window.PerfUltra.setUltra(bool) → applique le preset
//   - window.PerfUltra.getAll() → {ultra, decim, animOff, ...}
//   - window.PerfUltra.onChange(callback) → s'inscrit aux changements
//   - window.PerfUltra.isUltra() → true si tous les toggles sont ON
// =========================

(function() {
  "use strict";

  const STORAGE_KEY = "myktamap_perf_toggles";

  // Liste des toggles individuels gérés. ultra n'est PAS dans cette liste —
  // c'est un méta-toggle qui active/désactive les autres en bloc.
  const TOGGLES = ["decim", "animOff", "noIntersect", "noTooltips", "slowSave", "viewportCull", "mobileZoomLimit"];

  // 🛡️ v173 : certains toggles sont ON par défaut (= sécurité activée par défaut).
  // `mobileZoomLimit` ON par défaut = limite mobile minZoom v172 active (anti-OOM).
  // Décocher = l'user assume le risque crash, traite mobile comme PC (= plus de
  // dézoom dispo). Cohérent avec la sémantique PerfUltra "ON = optimisation /
  // sécurité activée".
  const DEFAULTS_TRUE = ["mobileZoomLimit"];

  // Defaults : tout désactivé SAUF les toggles dans DEFAULTS_TRUE.
  // Comportement actuel v172 strictement préservé (limite mobile active).
  function _defaults() {
    const o = {};
    TOGGLES.forEach(function(k) {
      o[k] = DEFAULTS_TRUE.indexOf(k) >= 0;
    });
    return o;
  }

  // État courant (chargé du localStorage au boot)
  let _state = (function() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _defaults();
      const parsed = JSON.parse(raw);
      const out = _defaults();
      TOGGLES.forEach(function(k) {
        if (typeof parsed[k] === "boolean") out[k] = parsed[k];
      });
      return out;
    } catch(e) {
      console.warn("[PerfUltra] localStorage parse failed :", e);
      return _defaults();
    }
  })();

  // Callbacks abonnés aux changements (pour re-render à la volée)
  const _listeners = [];

  function _persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); }
    catch(e) { console.warn("[PerfUltra] localStorage save failed :", e); }
  }

  function _notify(changedKeys) {
    _listeners.forEach(function(fn) {
      try { fn(changedKeys, _state); } catch(e) {
        console.warn("[PerfUltra] listener throw :", e);
      }
    });
  }

  function get(key) {
    return !!_state[key];
  }

  function getAll() {
    return Object.assign({}, _state, { ultra: isUltra() });
  }

  // True si TOUS les toggles individuels sont ON (preset ULTRA actif)
  function isUltra() {
    return TOGGLES.every(function(k) { return _state[k]; });
  }

  function set(key, value, opts) {
    if (TOGGLES.indexOf(key) < 0) {
      console.warn("[PerfUltra] toggle inconnu :", key);
      return false;
    }
    const v = !!value;
    if (_state[key] === v) return true;
    _state[key] = v;
    _persist();
    if (!opts || !opts.silent) _notify([key]);
    return true;
  }

  // Active/désactive le preset ULTRA = applique la même valeur à tous les toggles
  function setUltra(value) {
    const v = !!value;
    const changed = [];
    TOGGLES.forEach(function(k) {
      if (_state[k] !== v) {
        _state[k] = v;
        changed.push(k);
      }
    });
    if (changed.length === 0) return;
    _persist();
    _notify(changed);
  }

  function onChange(fn) {
    if (typeof fn === "function") _listeners.push(fn);
  }

  // Diag au boot — log les toggles actifs
  const activeToggles = TOGGLES.filter(function(k) { return _state[k]; });
  if (activeToggles.length > 0) {
    console.log("[PerfUltra] Toggles actifs au boot :", activeToggles.join(", "),
                isUltra() ? "(preset ULTRA complet)" : "");
  }

  window.PerfUltra = {
    get: get,
    set: set,
    setUltra: setUltra,
    getAll: getAll,
    isUltra: isUltra,
    onChange: onChange,
    TOGGLES: TOGGLES.slice()  // exposé en lecture pour l'UI
  };
})();
