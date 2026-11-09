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
// Renfort de rotation (option allegerRotation, ON) : sur un plan lourd laissé en automatique, la carte tournée
// force en mémoire RENFORT_ROTATION (mapBearing.js > _verrouiller), jamais persisté ni montré dans les réglages :
// `get` le voit, `getAll` / `isUltra` rendent le choix de l'utilisateur seul.
// Expose window.PerfUltra : get(key), set(key, value, opts?), setUltra(bool), getAll(), onChange(cb), isUltra(),
// poidsPlan(), planLourd(), renfortRotation(actif).
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
  // « Alléger la carte tournée » (allegerRotation) : autorise le renfort de rotation, ON par défaut ; hors ULTRA
  // (ULTRA force déjà ces leviers en permanence).
  const HORS_ULTRA = ["tousNiveaux", "allegerRotation"];
  const HORS_ULTRA_DEFAUT_TRUE = ["tousNiveaux", "allegerRotation"];

  // Réglages de sécurité ON par défaut : `mobileZoomLimit` (plancher de dézoom mobile anti-OOM). Décocher =
  // l'utilisateur assume le risque et le mobile est traité comme un PC.
  const DEFAULTS_TRUE = ["mobileZoomLimit"];

  // Leviers que la rotation force sur un plan lourd. Mesuré sous rotation (téléphone 393 × 852) : chaque POI
  // posé en DOM est un calque composité ; viewportCull ne garde que ceux de l'écran (÷ 25 sur un relevé réel),
  // tracés compris. decim et noIntersect allègent le dessin du canvas à chaque zoom.
  // ⚠️ Jamais noTooltips (décision produit) : les POI restent touchables pendant la rotation. Ni animOff ni
  // mobileZoomLimit (lus à l'init de la carte), ni slowSave (sans rapport avec le rendu).
  const RENFORT_ROTATION = ["viewportCull", "decim", "noIntersect"];
  // Objets du plan (POI, tracés, zones, structures des calques) à partir desquels il est lourd. Le coût de la
  // rotation suit le nombre d'objets, pas la taille de l'image : sur un plan tuilé, les tuiles posées dépendent
  // de l'écran (12 à plat, 25 tournées, quel que soit le plan).
  const SEUIL_PLAN_LOURD = 2000;
  let _renfort = [];

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
    _renfort = [];   // nouvelle carte : la rotation repart droite
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
    return !!_state[key] || _renfort.indexOf(key) >= 0;
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
    _relacherRenfortSiRefuse();
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
    _relacherRenfortSiRefuse();
  }

  // Choix fait carte tournée (option coupée, levier coché) : le renfort se retire sans attendre le retour au nord.
  function _relacherRenfortSiRefuse() {
    if (!_renfort.length || (_state.allegerRotation && _choixAutomatique())) return;
    const rendus = _renfort;
    _renfort = [];
    _notify(rendus);
  }

  function poidsPlan() {
    let n = 0;
    ["_ktaDataMarkers", "_ktaDataPolylines", "_ktaDataPolygons", "_ktaDataStructurePolygons"].forEach(function(k) {
      if (Array.isArray(window[k])) n += window[k].length;
    });
    return n;
  }

  function planLourd() { return poidsPlan() >= SEUIL_PLAN_LOURD; }

  // Automatique = preset du plan laissé à « auto » ET aucun levier ULTRA écarté de son défaut. Un choix de
  // l'utilisateur (même un seul levier) n'est jamais complété ni écrasé.
  function _choixAutomatique() {
    const preset = (typeof APP_CONFIG !== "undefined" && APP_CONFIG) ? APP_CONFIG.perfPreset : "auto";
    if (preset && preset !== "auto") return false;
    return TOGGLES.every(function(k) { return _state[k] === (DEFAULTS_TRUE.indexOf(k) >= 0); });
  }

  // actif = carte tournée. Rend true si des leviers sont forcés. Les abonnés reçoivent les clés basculées.
  function renfortRotation(actif) {
    _resolve();
    const voulu = (actif && window._currentLoadedPlanId && _state.allegerRotation && _choixAutomatique() &&
                   planLourd())
      ? RENFORT_ROTATION.filter(function(k) { return !_state[k]; }) : [];
    const bascules = voulu.filter(function(k) { return _renfort.indexOf(k) < 0; })
      .concat(_renfort.filter(function(k) { return voulu.indexOf(k) < 0; }));
    _renfort = voulu;
    if (bascules.length) _notify(bascules);
    return _renfort.length > 0;
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
    poidsPlan: poidsPlan,
    planLourd: planLourd,
    renfortRotation: renfortRotation,
    TOGGLES: TOGGLES.slice()  // exposé en lecture pour l'UI
  };
})();
