/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// 🌍 I18N — Internationalisation (multi-langue)
// =========================
// Chantier v1.45.0 — Passage progressif au multi-langue.
//
// PRINCIPE : tout le texte user-facing codé en dur en français est extrait
// dans des dicos `lang/<code>.json` (clés plates "module.section.element").
// Le FR (`lang/fr.json`) est la LANGUE DE RÉFÉRENCE et le FALLBACK universel :
// toute clé absente d'une autre langue retombe sur le FR. Toute clé absente
// PARTOUT retourne la clé brute (visible = signal de dette, jamais de crash).
//
// MIGRATION PROGRESSIVE : on remplace `"Texte FR"` par `I18n.t("cle")` module
// par module, vague par vague. Un module non-migré garde son FR inline (qui
// reste correct). Aucune régression possible : migré ou pas, ça marche.
//
// LANGUE ACTIVE : lue depuis `myktamap_app_lang` — la langue GLOBALE de l'app,
// pilotée par le sélecteur de la modale ⚙️ Réglages (interfaceConfig.js).
// ⚠️ DÉCOUPLÉE de `myktamap_readme_lang` (clé de la doc + onboarding), qui ne
// pilote QUE l'affichage local de ces deux contenus. Choix KARMA v1.45.0 :
// « le changement de langue complet se fait via Configuration ; doc/onboarding
// = local au mode en cours ». Auto-détection navigator.language au 1er boot.
// Demain pour ajouter ES/RU/… : déposer `lang/es.json` + l'ajouter à
// AVAILABLE_LANGS ci-dessous (+ ASSETS_TO_CACHE du SW). Zéro code à toucher.
//
// CHARGEMENT : `I18n.init()` est AWAIT-é dans main.js AVANT lancerApplication.
// Les dicos sont précachés par le Service Worker (ASSETS_TO_CACHE) → offline
// instantané dès le 1er install. fr.json est TOUJOURS chargé (fallback).
//
// API publique (window.I18n) :
//   I18n.init()              → Promise. Précharge fr + langue active. À await au boot.
//   I18n.t(key, params)      → string. Trad langue active → fallback fr → clé brute.
//                              params : objet { nom: valeur } pour interpoler {nom}.
//   I18n.getLang()           → "fr" | "en" | … (langue active courante)
//   I18n.setLang(lang)       → Promise. Change + persiste + fetch le dico + notifie.
//   I18n.onChange(cb)        → s'abonne aux changements de langue (re-render). Retourne unbind().
//   I18n.available()         → [{ code, label, flag }] des langues déclarées.
//   I18n.has(key)            → bool. La clé existe-t-elle (langue active OU fr) ?
// =========================

(function() {
  "use strict";

  // Clé localStorage de la langue GLOBALE de l'app, pilotée par le sélecteur
  // de ⚙️ Réglages. DISTINCTE de `myktamap_readme_lang` (doc + onboarding) :
  // changer la langue de l'app n'impose PAS la langue de la doc et vice-versa.
  const LANG_STORAGE_KEY = "myktamap_app_lang";

  // Langues déclarées. Pour en ajouter une : déposer lang/<code>.json,
  // ajouter l'entrée ici, et ajouter "./lang/<code>.json" à ASSETS_TO_CACHE
  // (sw.js). C'est TOUT.
  const AVAILABLE_LANGS = [
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "en", label: "English",  flag: "🇬🇧" },
    { code: "es", label: "Español",  flag: "🇪🇸" }
  ];

  // Langue de référence / fallback universel. fr.json est toujours chargé.
  const FALLBACK_LANG = "fr";

  // Dicos chargés en mémoire : { fr: {...}, en: {...} }
  const _dicts = {};
  // Callbacks abonnés au changement de langue (re-render des modales ouvertes).
  const _onChangeCbs = [];
  let _initialized = false;

  function _isKnownLang(code) {
    return AVAILABLE_LANGS.some(function(l) { return l.code === code; });
  }

  // 🆕 v1.46.4 (audit M2) : mémoïsation de la langue active. getLang() est
  // appelé à CHAQUE t() (= des milliers de fois au rendu d'un gros plan) et
  // relisait localStorage à chaque appel. La langue ne change QU'AU setLang
  // (seul écrivain de LANG_STORAGE_KEY) → on cache le résultat et on l'invalide
  // dans setLang. Comportement inchangé, juste moins de getItem() répétés.
  let _cachedLang = null;

  // Langue active : lit la clé partagée, fallback navigator.language puis FR.
  function getLang() {
    if (_cachedLang) return _cachedLang;
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (_isKnownLang(saved)) { _cachedLang = saved; return saved; }
    } catch(e) {}
    const navLang = (navigator.language || navigator.userLanguage || "").toLowerCase();
    // On ne mappe que sur une langue DÉCLARÉE ; sinon FR.
    const guess = navLang.split("-")[0];
    _cachedLang = _isKnownLang(guess) ? guess : FALLBACK_LANG;
    return _cachedLang;
  }

  // Fetch + parse un dico de langue. Résout {} en cas d'échec (jamais reject :
  // une langue manquante doit dégrader vers le fallback, pas casser l'app).
  function _loadDict(code) {
    if (_dicts[code]) return Promise.resolve(_dicts[code]);
    return fetch("lang/" + code + ".json", { cache: "no-cache" })
      .then(function(r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function(json) {
        _dicts[code] = (json && typeof json === "object") ? json : {};
        return _dicts[code];
      })
      .catch(function(e) {
        console.warn("[I18n] Échec chargement lang/" + code + ".json :", e.message || e);
        _dicts[code] = {};
        return _dicts[code];
      });
  }

  // Garantit qu'un dico de langue est chargé (lazy). Le FR est toujours préchargé.
  function ensureLang(code) {
    if (!_isKnownLang(code)) return Promise.resolve({});
    return _loadDict(code);
  }

  // Init au boot : charge le FALLBACK (fr, obligatoire) + la langue active.
  function init() {
    if (_initialized) return Promise.resolve();
    const active = getLang();
    const toLoad = [FALLBACK_LANG];
    if (active !== FALLBACK_LANG) toLoad.push(active);
    return Promise.all(toLoad.map(_loadDict)).then(function() {
      _initialized = true;
      console.log("[I18n] Module chargé (v1.45.0) — langue active : " + getLang() +
                  " · dicos : " + Object.keys(_dicts).join(", "));
    });
  }

  // Interpolation : remplace {nom} par params.nom dans la chaîne.
  function _interpolate(str, params) {
    if (!params || typeof str !== "string") return str;
    return str.replace(/\{(\w+)\}/g, function(match, key) {
      return (params[key] != null) ? String(params[key]) : match;
    });
  }

  // 🆕 Dégradation gracieuse d'une clé manquante : "module.section.changeBtn"
  // → "Change Btn" (dernier segment, camelCase/_/- éclatés en mots, 1ère
  // majuscule). Évite d'afficher la clé technique brute à l'user si une clé
  // manque (dico périmé via cache SW, oubli, faute) — lisible plutôt que cassé.
  function _humanizeKey(key) {
    if (typeof key !== "string") return "";
    const last = key.split(".").pop() || key;
    const words = last.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
  }

  // Cœur : traduction d'une clé. langue active → fallback fr → clé brute.
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
      // Clé inconnue partout : retourne la clé brute (signal de dette, pas de crash).
      // En dev on log une fois par clé pour repérer les trous.
      if (!t._warned) t._warned = {};
      if (!t._warned[key]) {
        t._warned[key] = true;
        console.warn("[I18n] Clé manquante : \"" + key + "\" (langue " + lang + ")");
      }
      // 🆕 H1 (audit 2026-06-14) : au lieu de la clé brute (« pin.setup.changeBtn »
      // — moche si une clé manque côté user, ex. dico périmé), on humanise →
      // « Change Btn ». Couvre du même coup les ~39 helpers `_t` inline d'index.html.
      return _humanizeKey(key);
    }
    return _interpolate(val, params);
  }

  function has(key) {
    const lang = getLang();
    return !!((_dicts[lang] && Object.prototype.hasOwnProperty.call(_dicts[lang], key)) ||
              (_dicts[FALLBACK_LANG] && Object.prototype.hasOwnProperty.call(_dicts[FALLBACK_LANG], key)));
  }

  // Change la langue : persiste, charge le dico si besoin, notifie les abonnés.
  function setLang(code) {
    if (!_isKnownLang(code)) return Promise.resolve();
    try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch(e) {}
    _cachedLang = code; // 🆕 v1.46.4 (M2) : invalide/rafraîchit le cache getLang.
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

  function available() {
    return AVAILABLE_LANGS.slice();
  }

  // Résout la langue à PRÉSÉLECTIONNER pour un contenu localisé (doc, onboarding)
  // dont les langues réellement disponibles sont passées en argument (ex.
  // ["fr","en"] aujourd'hui, ["fr","en","ru"] le jour où le contenu RU existe).
  // Règle : langue active de l'app si elle est dispo pour ce contenu, sinon
  // "en" (fallback universel non-FR), sinon le 1er dispo (fr en pratique).
  // NE LIT PAS myktamap_readme_lang : ne fournit QUE le défaut dérivé de l'app ;
  // la mémoire du choix manuel est gérée par le module appelant.
  function resolveContentLang(availableList) {
    const avail = (Array.isArray(availableList) && availableList.length) ? availableList : [FALLBACK_LANG];
    const app = getLang();
    if (avail.indexOf(app) >= 0) return app;
    if (avail.indexOf("en") >= 0) return "en";
    if (avail.indexOf(FALLBACK_LANG) >= 0) return FALLBACK_LANG;
    return avail[0];
  }

  window.I18n = {
    init:       init,
    t:          t,
    has:        has,
    getLang:    getLang,
    setLang:    setLang,
    ensureLang: ensureLang,
    onChange:   onChange,
    available:  available,
    resolveContentLang: resolveContentLang,
    _STORAGE_KEY: LANG_STORAGE_KEY
  };
})();
