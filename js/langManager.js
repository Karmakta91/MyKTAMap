/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// I18N — internationalisation (window.I18n) + window.ktaLocale + window.ktaEsc
// =========================
// Textes extraits dans `lang/<code>.json` (clés plates "module.section.element"). Le FR est la référence et le
// repli universel ; une clé absente PARTOUT s'affiche humanisée (signal de dette, jamais de crash). Migration
// progressive : un module non migré garde son FR inline.
// Langue active : `myktamap_app_lang` (⚙️ Configuration de l'accueil, écran de déverrouillage ; jamais un plan).
// ⚠️ DÉCOUPLÉE de `myktamap_readme_lang` (doc + onboarding, portée locale). Auto-détection navigator.language.
// Ajouter une langue : lang/<code>.json + AVAILABLE_LANGS + ASSETS_TO_CACHE du SW, sans autre code.
// ⚠️ `I18n.init()` est AWAIT-é dans main.js AVANT lancerApplication ; appeler t() au rendu, jamais au load.
// API : init() → Promise · t(key, params) ({nom} interpolé) · getLang() · setLang(lang) → Promise ·
//   onChange(cb) → unbind · available() → [{code, label, flag}] · has(key) · ajouter(code, dico) · reload() ·
//   resolveContentLang(liste) · ensureLang(code).
// Garde-fous : scripts/check-i18n.js, scripts/check-esc.js · Doc : docs/architecture/i18n.md
// =========================

(function() {
  "use strict";

  // Langue GLOBALE de l'app, DISTINCTE de `myktamap_readme_lang` (l'une n'impose pas l'autre).
  const LANG_STORAGE_KEY = "myktamap_app_lang";

  // Langues déclarées : lang/<code>.json + entrée ici + "./lang/<code>.json" dans ASSETS_TO_CACHE (sw.js).
  const AVAILABLE_LANGS = [
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "en", label: "English",  flag: "🇬🇧" },
    { code: "es", label: "Español",  flag: "🇪🇸" }
  ];

  // Référence / repli universel, toujours chargé.
  const FALLBACK_LANG = "fr";

  const _dicts = {};
  // Abonnés au changement de langue (re-rendu des modales ouvertes).
  const _onChangeCbs = [];
  let _initialized = false;
  // Promesse d'init MÉMOÏSÉE : deux appels concurrents (main.js + osmHomePreview au boot) ne refont pas le
  // fetch, et init() sert de barrière gratuite — un module qui rend du texte peut-être avant la fin du fetch
  // fait `I18n.init().then(render)` (résolue = microtask immédiate). Filet anti-course du boot.
  let _initPromise = null;

  function _isKnownLang(code) {
    return AVAILABLE_LANGS.some(function(l) { return l.code === code; });
  }

  // Langue active mémoïsée : getLang() est appelé à CHAQUE t() (des milliers de fois) ; seul setLang écrit la
  // clé, il invalide le cache.
  let _cachedLang = null;

  // Clé partagée, sinon navigator.language, sinon FR.
  function getLang() {
    if (_cachedLang) return _cachedLang;
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (_isKnownLang(saved)) { _cachedLang = saved; return saved; }
    } catch(e) {}
    const navLang = (navigator.language || navigator.userLanguage || "").toLowerCase();
    // Seulement une langue DÉCLARÉE ; sinon FR.
    const guess = navLang.split("-")[0];
    _cachedLang = _isKnownLang(guess) ? guess : FALLBACK_LANG;
    return _cachedLang;
  }

  // Dictionnaires d'une EXTENSION (I18n.ajouter), gardés à part et refusionnés à chaque chargement du dico.
  // 🔒 Une clé de l'app n'est JAMAIS écrasée : l'extension n'ajoute que des clés absentes (préfixe propre
  // recommandé).
  const _ajouts = {};          // code → { clé: texte }
  const _clesAjoutees = {};    // code → { clé: true } (posées par une extension, donc remplaçables par elle)
  function _fusionnerAjouts(code) {
    const d = _dicts[code], a = _ajouts[code];
    if (!d || !a) return;
    const posees = _clesAjoutees[code] = _clesAjoutees[code] || {};
    Object.keys(a).forEach(function(k) {
      if (Object.prototype.hasOwnProperty.call(d, k) && !posees[k]) return;   // clé de l'app : intouchable
      d[k] = a[k]; posees[k] = true;
    });
  }
  // → nombre de clés retenues. Textes seulement, clés [\w.-]+ ; langue inconnue : 0.
  function ajouter(code, dico) {
    if (!_isKnownLang(code) || !dico || typeof dico !== "object") return 0;
    const a = _ajouts[code] = _ajouts[code] || {};
    let n = 0;
    Object.keys(dico).forEach(function(k) {
      if (typeof dico[k] === "string" && /^[\w.-]{1,120}$/.test(k)) { a[k] = dico[k]; n++; }
    });
    _fusionnerAjouts(code);
    return n;
  }

  // Résout {} en cas d'échec, jamais reject : une langue manquante dégrade vers le repli.
  function _loadDict(code) {
    if (_dicts[code]) return Promise.resolve(_dicts[code]);
    // 🩸 Cache-buster `?v=<build>` : change à chaque release et contourne TOUTES les couches de cache (HTTP,
    // précache SW, CDN) qui serviraient un vieux dico (clés humanisées après mise à jour). Hors ligne, le SW
    // retombe en `ignoreSearch` sur le dico précaché. Sans __MKM__.build : URL nue.
    var _build = (window.__MKM__ && window.__MKM__.build) ? window.__MKM__.build : "";
    var _url = "lang/" + code + ".json" + (_build ? "?v=" + encodeURIComponent(_build) : "");
    // 🩸 `cache: "reload"`, pas "no-cache" : GET réseau qui IGNORE le cache HTTP. Sans SW (après killsw),
    // "no-cache" peut recevoir un 304 et resservir un dico périmé tant que le build ne change pas. Avec SW,
    // il intercepte avec son propre no-store.
    return fetch(_url, { cache: "reload" })
      .then(function(r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function(json) {
        _dicts[code] = (json && typeof json === "object") ? json : {};
        _clesAjoutees[code] = {};
        _fusionnerAjouts(code);
        return _dicts[code];
      })
      .catch(function(e) {
        console.warn("[I18n] Échec chargement lang/" + code + ".json :", e.message || e);
        _dicts[code] = {};
        _clesAjoutees[code] = {};
        _fusionnerAjouts(code);
        return _dicts[code];
      });
  }

  // Charge un dico à la demande (le FR est toujours préchargé).
  function ensureLang(code) {
    if (!_isKnownLang(code)) return Promise.resolve({});
    return _loadDict(code);
  }

  // Boot : repli (fr, obligatoire) + langue active.
  function init() {
    if (_initPromise) return _initPromise;
    const active = getLang();
    const toLoad = [FALLBACK_LANG];
    if (active !== FALLBACK_LANG) toLoad.push(active);
    _initPromise = Promise.all(toLoad.map(_loadDict)).then(function() {
      _initialized = true;
      console.log("[I18n] Module chargé (v1.45.0) — langue active : " + getLang() +
                  " · dicos : " + Object.keys(_dicts).join(", "));
    });
    return _initPromise;
  }

  function _interpolate(str, params) {
    if (!params || typeof str !== "string") return str;
    return str.replace(/\{(\w+)\}/g, function(match, key) {
      return (params[key] != null) ? String(params[key]) : match;
    });
  }

  // Clé manquante → "Change Btn" (dernier segment, camelCase/_/- éclatés, majuscule) plutôt que la clé
  // technique : lisible si un dico est périmé ou une clé oubliée.
  function _humanizeKey(key) {
    if (typeof key !== "string") return "";
    const last = key.split(".").pop() || key;
    const words = last.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
  }

  // Langue active → repli fr → clé humanisée.
  function t(key, params) {
    if (key == null) return "";
    const lang = getLang();
    let val = null;
    if (_dicts[lang] && Object.prototype.hasOwnProperty.call(_dicts[lang], key)) {
      val = _dicts[lang][key];
    } else if (_dicts[FALLBACK_LANG] && Object.prototype.hasOwnProperty.call(_dicts[FALLBACK_LANG], key)) {
      val = _dicts[FALLBACK_LANG][key];
    }
    if (val == null) {
      // Inconnue partout : un log par clé pour repérer les trous.
      if (!t._warned) t._warned = {};
      if (!t._warned[key]) {
        t._warned[key] = true;
        console.warn("[I18n] Clé manquante : \"" + key + "\" (langue " + lang + ")");
      }
      // Humanisée plutôt que brute (couvre aussi les helpers `_t` inline d'index.html).
      return _humanizeKey(key);
    }
    return _interpolate(val, params);
  }

  function has(key) {
    const lang = getLang();
    return !!((_dicts[lang] && Object.prototype.hasOwnProperty.call(_dicts[lang], key)) ||
              (_dicts[FALLBACK_LANG] && Object.prototype.hasOwnProperty.call(_dicts[FALLBACK_LANG], key)));
  }

  // Persiste, charge le dico si besoin, notifie les abonnés.
  function setLang(code) {
    if (!_isKnownLang(code)) return Promise.resolve();
    try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch(e) {}
    _cachedLang = code; // (M2) : invalide/rafraîchit le cache getLang.
    return ensureLang(code).then(function() {
      _onChangeCbs.forEach(function(cb) {
        try { cb(code); } catch(e) { console.warn("[I18n] onChange cb failed :", e); }
      });
    });
  }

  function onChange(cb) {
    if (typeof cb !== "function") return function() {};
    _onChangeCbs.push(cb);
    return function unbind() {
      const i = _onChangeCbs.indexOf(cb);
      if (i >= 0) _onChangeCbs.splice(i, 1);
    };
  }

  // Recharge les dicos DEPUIS LE RÉSEAU (cache mémoire vidé, fetch en `cache: "reload"`) puis notifie : si le
  // premier boot a chargé un dico périmé, rafraîchissement et re-rendu à la volée. Idempotent, → Promise.
  function reload() {
    var active = getLang();
    delete _dicts[active];
    delete _dicts[FALLBACK_LANG];
    var codes = (active === FALLBACK_LANG) ? [FALLBACK_LANG] : [active, FALLBACK_LANG];
    return Promise.all(codes.map(_loadDict)).then(function() {
      _onChangeCbs.forEach(function(cb) {
        try { cb(active); } catch(e) { console.warn("[I18n] onChange cb failed (reload) :", e); }
      });
      return true;
    });
  }

  function available() {
    return AVAILABLE_LANGS.slice();
  }

  // Langue à PRÉSÉLECTIONNER pour un contenu localisé (doc, onboarding) dont les langues dispo sont passées :
  // langue active si dispo, sinon "en", sinon la première. NE LIT PAS myktamap_readme_lang (le choix manuel est
  // géré par l'appelant).
  function resolveContentLang(availableList) {
    const avail = (Array.isArray(availableList) && availableList.length) ? availableList : [FALLBACK_LANG];
    const app = getLang();
    if (avail.indexOf(app) >= 0) return app;
    if (avail.indexOf("en") >= 0) return "en";
    if (avail.indexOf(FALLBACK_LANG) >= 0) return FALLBACK_LANG;
    return avail[0];
  }

  // Locale des dates affichées ET imprimées (rapports, PDF, stats) : jamais "fr-FR" en dur. en-GB (jj/mm/aaaa,
  // 24 h) plutôt qu'en-US : pas d'AM/PM ni d'espace fine insécable, mal imprimés par jsPDF.
  window.ktaLocale = function() {
    const l = (window.I18n && typeof window.I18n.getLang === "function") ? window.I18n.getLang() : FALLBACK_LANG;
    return ({ fr: "fr-FR", en: "en-GB", es: "es-ES" })[l] || "fr-FR";
  };

  window.I18n = {
    init:       init,
    t:          t,
    has:        has,
    getLang:    getLang,
    setLang:    setLang,
    ensureLang: ensureLang,
    onChange:   onChange,
    reload:     reload,
    available:  available,
    resolveContentLang: resolveContentLang,
    ajouter:    ajouter,
    _STORAGE_KEY: LANG_STORAGE_KEY
  };
})();

// =========================
// window.ktaEsc(s) — ÉCHAPPEMENT HTML UNIQUE de l'application
// =========================
// 🔒 & < > " ' → entités ; null / undefined → "". Sûr en texte comme en attribut entre guillemets. Posé ICI
// (2e script, sans defer) et non dans utils.js (defer) : les modules non différés s'en servent au chargement.
// Une copie locale est refusée par scripts/check-esc.js : au plus un alias
// (`function _esc(s) { return window.ktaEsc(s); }`). Exceptions motivées : voir ce contrôle.
window.ktaEsc = function(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
  });
};
