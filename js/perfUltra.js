/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// PERF ULTRA — optimisations pour gros plans / appareils faibles
// =========================
// Préset « ULTRA » (toutes les optimisations) ou réglages individuels, persistés PAR PLAN
// (`myktamap_perf_toggles_v2_<planId>`) : jamais activés par défaut, c'est l'utilisateur qui coche pour CE
// plan (décision produit). Au HOME (aucun plan) : défauts purs, non persistés.
// Optimisations : decim (décimation RDP des routes au dézoom) · animOff (animations Leaflet ; ⚠️ lu à l'init
// de la carte, rechargement requis) · noIntersect (seuil des cercles d'intersection à 50 au lieu de 200) ·
// noTooltips (pas de bindPopup sur les points des calques ; ceux de session restent interactifs) · slowSave
// (SessionPersist toutes les 30 s au lieu de 1,5 s) · viewportCull (routes hors écran non rendues, piloté par
// ULTRA seul).
// Expose window.PerfUltra : get(key), set(key, value, opts?), setUltra(bool), getAll(), onChange(cb), isUltra().
// Doc : docs/architecture/perf-memory.md
// =========================

(function() {
  "use strict";

  // Slot PAR PLAN ; l'ancienne clé globale "myktamap_perf_toggles" n'est plus lue (laissée en place).
  const STORAGE_PREFIX = "myktamap_perf_toggles_v2_";

  // Réglages individuels ; `ultra` est un méta-réglage qui les bascule en bloc.
  const TOGGLES = ["decim", "animOff", "noIntersect", "noTooltips", "slowSave", "viewportCull", "mobileZoomLimit"];

  // « Afficher tous les niveaux au lancement » : réglage de CHARGE (un relevé à six étages multiplie ce que la
  // carte peint), ON par défaut.
  // ⚠️ VOLONTAIREMENT HORS DE `TOGGLES`, donc hors d'ULTRA : « activer toutes les optimisations » qui
  // afficherait plus de niveaux ALOURDIRAIT l'app.
  const HORS_ULTRA = ["tousNiveaux"];
  const HORS_ULTRA_DEFAUT_TRUE = ["tousNiveaux"];

  // Réglages de sécurité ON par défaut : `mobileZoomLimit` (plancher de dézoom mobile anti-OOM). Décocher =
  // l'utilisateur assume le risque et le mobile est traité comme un PC.
  const DEFAULTS_TRUE = ["mobileZoomLimit"];

  // Défauts : tout OFF sauf DEFAULTS_TRUE.
  function _defaults() {
    const o = {};
    TOGGLES.forEach(function(k) {
      o[k] = DEFAULTS_TRUE.indexOf(k) >= 0;
    });
    HORS_ULTRA.forEach(function(k) {
      o[k] = HORS_ULTRA_DEFAUT_TRUE.indexOf(k) >= 0;
    });
    return o;
  }

  // État PAR PLAN résolu au runtime : _resolve() détecte le changement de plan (window._currentLoadedPlanId,
  // posé AVANT initMapFromConfig sur tous les chemins, donc animOff lu à l'init voit le bon slot). HOME →
  // défauts purs, non persistés.
  let _cachePlanId = "__uninit__";
  let _state = _defaults();

  function _loadFor(planId) {
    if (!planId) return _defaults();
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + planId);
      if (!raw) return _defaults();
      const parsed = JSON.parse(raw);
      const out = _defaults();
      TOGGLES.forEach(function(k) {
        if (typeof parsed[k] === "boolean") out[k] = parsed[k];
      });
      // 🩸 Les réglages HORS ULTRA doivent être RELUS aussi, sinon « tous les niveaux » revient à true à chaque
      // chargement.
      HORS_ULTRA.forEach(function(k) {
        if (typeof parsed[k] === "boolean") out[k] = parsed[k];
      });
      return out;
    } catch(e) {
      console.warn("[PerfUltra] localStorage parse failed :", e);
      return _defaults();
    }
  }

  function _resolve() {
    const pid = window._currentLoadedPlanId || null;
    if (pid === _cachePlanId) return;
    _cachePlanId = pid;
    _state = _loadFor(pid);
    const actifs = TOGGLES.filter(function(k) { return _state[k] && DEFAULTS_TRUE.indexOf(k) < 0; });
    if (actifs.length > 0) {
      console.log("[PerfUltra] Slot plan « " + pid + " » : toggles actifs :", actifs.join(", "));
    }
  }

  // Abonnés aux changements (re-rendu à la volée).
  const _listeners = [];

  function _persist() {
    const pid = window._currentLoadedPlanId || null;
    if (!pid) {
      console.warn("[PerfUltra] Aucun plan chargé — réglage non persisté (RAM uniquement)");
      return;
    }
    try { localStorage.setItem(STORAGE_PREFIX + pid, JSON.stringify(_state)); }
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
    _resolve();
    return !!_state[key];
  }

  function getAll() {
    _resolve();
    return Object.assign({}, _state, { ultra: isUltra() });
  }

  // True si TOUS les réglages individuels sont ON.
  function isUltra() {
    _resolve();
    return TOGGLES.every(function(k) { return _state[k]; });
  }

  function set(key, value, opts) {
    _resolve();
    if (TOGGLES.indexOf(key) < 0 && HORS_ULTRA.indexOf(key) < 0) {
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

  // Même valeur appliquée à tous les réglages individuels.
  function setUltra(value) {
    _resolve();
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

  // Pas de diagnostic au boot (aucun plan chargé, toujours les défauts) : le log par plan vit dans _resolve().

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
