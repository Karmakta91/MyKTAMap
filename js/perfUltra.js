/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// 🚀 PERF ULTRA — toggles d'optimisation pour gros plans / appareils faibles
// =========================
// Préset "ULTRA" qui active 6 optims simultanément, OU toggles individuels
// pour les power users qui veulent affiner.
//
// 🆕 v1.59.0 (KARMA « on n'active jamais cette option par défaut, c'est
// l'utilisateur qui coche ») : persistance PAR PLAN (`myktamap_perf_toggles_
// v2_<planId>`). Avant : clé GLOBALE `myktamap_perf_toggles` → cocher ULTRA
// une fois sur un gros plan l'appliquait silencieusement à TOUS les plans
// (perçu comme une « activation automatique »). Désormais chaque plan repart
// sur les defaults (tout OFF sauf les toggles de sécurité DEFAULTS_TRUE) tant
// que l'user n'a pas coché POUR CE PLAN. L'ancienne clé globale est IGNORÉE
// (laissée en place, aucune donnée détruite). Au HOME (aucun plan chargé) :
// defaults purs, les réglages éventuels ne sont pas persistés.
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

  // 🆕 v1.59.0 : slot PAR PLAN. L'ancienne clé globale "myktamap_perf_toggles"
  // n'est plus lue (péremption volontaire — cf. en-tête).
  const STORAGE_PREFIX = "myktamap_perf_toggles_v2_";

  // Liste des toggles individuels gérés. ultra n'est PAS dans cette liste —
  // c'est un méta-toggle qui active/désactive les autres en bloc.
  const TOGGLES = ["decim", "animOff", "noIntersect", "noTooltips", "slowSave", "viewportCull", "mobileZoomLimit"];

  // 🏗️ v1.82.1 — « Afficher tous les niveaux au lancement » (demande KARMA).
  // Rangé ICI parce que c'est un réglage de CHARGE : sur un relevé importé à
  // six étages, tout afficher d'emblée multiplie ce que la carte doit peindre.
  //
  // ⚠️ VOLONTAIREMENT HORS DE `TOGGLES`, donc hors du méta-bouton ULTRA.
  // La sémantique d'ULTRA est « active toutes les optimisations » ; or
  // afficher plus de niveaux est exactement l'inverse. L'y inclure ferait
  // qu'« activer tout » ALOURDIRAIT l'app — absurde, et personne ne le
  // devinerait. Il se règle donc seul, et ON par défaut.
  const HORS_ULTRA = ["tousNiveaux"];
  const HORS_ULTRA_DEFAUT_TRUE = ["tousNiveaux"];

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
    HORS_ULTRA.forEach(function(k) {
      o[k] = HORS_ULTRA_DEFAUT_TRUE.indexOf(k) >= 0;
    });
    return o;
  }

  // 🆕 v1.59.0 — État PAR PLAN, résolu au runtime. _resolve() détecte le
  // changement de plan courant (window._currentLoadedPlanId, posé AVANT
  // initMapFromConfig sur tous les chemins de chargement → animOff lu à
  // l'init de la map voit déjà le bon slot) et recharge le slot correspondant.
  // Aucun plan chargé (HOME) → defaults purs, non persistés.
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

  // Callbacks abonnés aux changements (pour re-render à la volée)
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

  // True si TOUS les toggles individuels sont ON (preset ULTRA actif)
  function isUltra() {
    _resolve();
    return TOGGLES.every(function(k) { return _state[k]; });
  }

  function set(key, value, opts) {
    _resolve();
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

  // (Diag au boot retiré en v1.59.0 : au boot, aucun plan n'est chargé →
  //  l'état est toujours les defaults. Le log par plan vit dans _resolve().)

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
