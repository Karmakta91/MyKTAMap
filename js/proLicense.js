/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// proLicense.js — détecte si l'installation tourne sous licence pro. Source UNIQUE : le serveur
// (`/Licence-pro.json` à la racine du site). Sans ce fichier (myktamap.fr) : mode community, rien
// ne change. Une licence importée sur l'appareil (fonction retirée) est purgée au démarrage.
// 🔒 Licence SIGNÉE (ECDSA P-256) : seule la clé PUBLIQUE vit ici ; la licence reste lisible en
//   clair, sa valeur juridique vient du contrat. `license_hash` (MKTM-LIC-<32 hex>) est nominatif.
// Format : { instance: "pro" (requis), signature, domaines, license_hash, client, license_id,
//   license_type, issued_at, valid_until } ; `license_hash` facultatif côté serveur (avertissement).
// Expose : window.__MKTM_PRO_LICENSE__ (objet | null) · window.MyKTAMapProLicense { isPro, getData,
//   getSource → "server" | null, forceRecheck }
// Événements : "mktm:license-changed" { isPro, source, data } · "mktm:license-checked"
// Garde-fou : scripts/check-licence.js · Doc : docs/architecture/security-legal.md

(function() {
  "use strict";

  var LS_KEY_SERVER = "__mktm_pro_license__";       // cache du fetch /Licence-pro.json
  var LS_KEY_LOCAL  = "__mktm_pro_license_local__"; // ancienne licence importée (retirée) : purgée au démarrage

  var FETCH_PATH = "/Licence-pro.json";

  // 🔒 Licence acceptée seulement si : `signature` (ECDSA P-256 / SHA-256, r||s brut en base64)
  //   valide pour la clé publique ci-dessous (la clé privée ne quitte jamais l'émetteur) ;
  //   `valid_until` non dépassé ; `domaines` couvrant l'adresse ouverte (`*` = tous, tests).
  // Forme signée = la licence SANS `signature`, clés triées récursivement.
  // Clé PUBLIQUE : la publier ne permet pas d'émettre de licence.
  var CLE_PUBLIQUE_JWK = {"kty":"EC","crv":"P-256","x":"4hCCKedCcwslgzb2dueMVrnw5bMCwOReHr82fYBDMbE","y":"eesWXOFd9Snk-hM9mUB8J4SbKgdWvVJWKHMAX5kdDgk"};
  var FETCH_TIMEOUT_MS = 1500;
  // 🩸 Sans licence déjà connue (1er lancement, après « Tout réinitialiser »), on attend la vraie
  // réponse : 1,5 s ne suffit pas quand le SW retélécharge l'app en même temps (instance pro
  // prise pour une app community).
  var FETCH_TIMEOUT_PREMIER_MS = 15000;

  // « MKTM-LIC- » + 32 hex (casse indifférente), généré par `openssl rand -hex 16`.
  var HASH_PATTERN = /^MKTM-LIC-[A-Fa-f0-9]{32}$/;

  // ── Outils internes ──────────────────────────────────────────────────────
  // 🩸 _validateData tourne AUSSI au boot, avant le chargement des dicos : has() évite un faux
  // « clé manquante » ; repli = clé brute.
  function t(k, p) {
    return (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(k))
      ? window.I18n.t(k, p) : k;
  }

  function _safeReadLS(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.instance === "pro") {
        // 🔒 Licence en cache EXPIRÉE purgée, même hors ligne : l'installation passe en « licence »
        // (app fermée, main.js), jamais en community sur les données de l'appareil.
        if (typeof data.valid_until === "string" && data.valid_until < new Date().toISOString().slice(0, 10)) {
          localStorage.removeItem(key);
          console.warn("[ProLicense] licence en cache expirée le " + data.valid_until + " : ignorée");
          return null;
        }
        return data;
      }
    } catch(e) {
      // Cache corrompu : ignoré.
    }
    return null;
  }

  function _safeWriteLS(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
  }

  function _safeRemoveLS(key) {
    try { localStorage.removeItem(key); } catch(e) {}
  }

  function _canonique(v) {
    if (Array.isArray(v)) return "[" + v.map(_canonique).join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).filter(function(k) { return k !== "signature"; }).sort()
        .map(function(k) { return JSON.stringify(k) + ":" + _canonique(v[k]); }).join(",") + "}";
    }
    return JSON.stringify(v);
  }
  var _clePromesse = null;
  // Promise<boolean> : signée, non expirée, domaine couvert. 🔒 Sans WebCrypto (contexte non
  // sécurisé) : refusée.
  function _verifierSignature(data) {
    try {
      if (!data || typeof data.signature !== "string" || !Array.isArray(data.domaines)) return Promise.resolve(false);
      if (typeof data.valid_until === "string" && data.valid_until < new Date().toISOString().slice(0, 10)) return Promise.resolve(false);
      var hote = (location.hostname || "").toLowerCase();
      var domaines = data.domaines.map(function(d) { return String(d).toLowerCase(); });
      if (domaines.indexOf("*") < 0 && domaines.indexOf(hote) < 0) return Promise.resolve(false);
      if (!window.crypto || !crypto.subtle) return Promise.resolve(false);
      if (!_clePromesse) _clePromesse = crypto.subtle.importKey("jwk", CLE_PUBLIQUE_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      var sig = Uint8Array.from(atob(data.signature), function(c) { return c.charCodeAt(0); });
      return _clePromesse.then(function(cle) {
        return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, cle, sig, new TextEncoder().encode(_canonique(data)));
      }).catch(function() { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  function _validateData(data, strictHash) {
    if (!data || typeof data !== "object") {
      return { ok: false, error: t("license.err.emptyOrInvalid") };
    }
    if (data.instance !== "pro") {
      return { ok: false, error: t("license.err.instanceNotPro") };
    }
    if (strictHash) {
      if (typeof data.license_hash !== "string") {
        return { ok: false, error: t("license.err.hashMissing") };
      }
      if (!HASH_PATTERN.test(data.license_hash)) {
        return { ok: false, error: t("license.err.hashInvalid") };
      }
    } else if (typeof data.license_hash === "string" && !HASH_PATTERN.test(data.license_hash)) {
      console.warn("[ProLicense] license_hash présent mais format inattendu — accepté en mode dégradé.");
    } else if (typeof data.license_hash !== "string") {
      console.warn("[ProLicense] licence sans license_hash — backward compat fetch serveur (déploiement legacy ?).");
    }
    return { ok: true, data: data };
  }

  // ── Lecture initiale synchrone (cache localStorage) : pas de flash ───────

  var _activeData = null;
  var _activeSource = null;

  // Ancienne licence importée par l'utilisateur : sans effet, purgée.
  try {
    if (localStorage.getItem(LS_KEY_LOCAL)) {
      localStorage.removeItem(LS_KEY_LOCAL);
      console.info("[ProLicense] licence importée sur l'appareil retirée : seule la licence de l'installation compte");
    }
  } catch(e) {}

  var serverCached = _safeReadLS(LS_KEY_SERVER);
  if (serverCached) {
    _activeData = serverCached;
    _activeSource = "server";
  }

  window.__MKTM_PRO_LICENSE__ = _activeData;
  if (_activeData) {
    if (document.documentElement) {
      document.documentElement.classList.add("kta-instance-pro");
    }
  }

  // ── Application de l'état + notification ─────────────────────────────────
  function _applyClasses(isPro) {
    if (document.documentElement) {
      document.documentElement.classList.toggle("kta-instance-pro", isPro);
    }
    if (document.body) {
      document.body.classList.toggle("kta-instance-pro", isPro);
    }
  }

  function _notifyChange(prevIsPro, prevSource, nextIsPro, nextSource, data) {
    if (prevIsPro === nextIsPro && prevSource === nextSource) return;
    if (typeof window.CustomEvent !== "function") return;
    try {
      window.dispatchEvent(new CustomEvent("mktm:license-changed", {
        detail: { isPro: nextIsPro, source: nextSource, data: data || null }
      }));
    } catch(e) {}
  }

  function _recomputeActive() {
    var prevIsPro = !!_activeData;
    var prevSource = _activeSource;

    var srv = _safeReadLS(LS_KEY_SERVER);

    if (srv) {
      _activeData = srv;
      _activeSource = "server";
    } else {
      _activeData = null;
      _activeSource = null;
    }

    window.__MKTM_PRO_LICENSE__ = _activeData;
    _applyClasses(!!_activeData);
    _notifyChange(prevIsPro, prevSource, !!_activeData, _activeSource, _activeData);
  }

  // ── Vérification asynchrone côté serveur ─────────────────────────────────
  function _checkServerLicense() {
    if (typeof fetch !== "function") return;

    var ctrl = null;
    var timeoutId = null;
    if (typeof AbortController === "function") {
      ctrl = new AbortController();
      var dejaConnue = false;
      try { dejaConnue = !!localStorage.getItem(LS_KEY_SERVER); } catch(e) {}
      timeoutId = setTimeout(function() {
        try { ctrl.abort(); } catch(e) {}
      }, dejaConnue ? FETCH_TIMEOUT_MS : FETCH_TIMEOUT_PREMIER_MS);
    }

    var opts = {
      cache: "no-store",
      credentials: "omit",
      redirect: "error"
    };
    if (ctrl) opts.signal = ctrl.signal;

    var url = FETCH_PATH + "?_=" + Date.now();

    fetch(url, opts)
      .then(function(resp) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!resp.ok) {
          // 🩸 Seule une ABSENCE déclarée (404 / 410) purge le cache. Hors ligne (503 du SW) ou
          // panne (5xx) : la licence connue reste, l'installation est « injoignable », pas community.
          if (resp.status === 404 || resp.status === 410) {
            _safeRemoveLS(LS_KEY_SERVER);
            _recomputeActive();
            return null;
          }
          _signalerVerifiee();
          return undefined;
        }
        return resp.json().catch(function() { return null; });
      })
      .then(function(data) {
        if (data === undefined) return;
        var v = _validateData(data, /* strictHash */ false);
        if (!v.ok) { _safeRemoveLS(LS_KEY_SERVER); _recomputeActive(); _signalerVerifiee(); return; }
        // 🔒 Signature vérifiée AVANT de mémoriser : une licence non signée n'active rien.
        return _verifierSignature(v.data).then(function(signee) {
          if (signee) _safeWriteLS(LS_KEY_SERVER, v.data);
          else { _safeRemoveLS(LS_KEY_SERVER); console.warn("[ProLicense] licence serveur refusée : signature invalide, expirée ou pour un autre domaine."); }
          _recomputeActive();
          _signalerVerifiee();
        });
      })
      .catch(function() {
        // Erreur réseau / délai : l'état en cache est maintenu.
        if (timeoutId) clearTimeout(timeoutId);
        _signalerVerifiee();
      });
  }
  // Fin de vérification (licence ou non) : le démarrage n'attend pas le délai maximal.
  function _signalerVerifiee() {
    try { window.dispatchEvent(new CustomEvent("mktm:license-checked")); } catch(e) {}
  }

  // ── API publique ─────────────────────────────────────────────────────────
  window.MyKTAMapProLicense = {
    isPro: function() {
      return !!_activeData;
    },
    getData: function() {
      return _activeData;
    },
    getSource: function() {
      return _activeSource;
    },
    forceRecheck: function() {
      _checkServerLicense();
    },
    // Diagnostic :
    _LS_KEY_SERVER: LS_KEY_SERVER,
    HASH_PATTERN: HASH_PATTERN,
    _verifierSignature: _verifierSignature   // tests (scripts/check-licence.js)
  };

  // ── Lancement ────────────────────────────────────────────────────────────
  // 🔒 Toute licence mémorisée est revérifiée à chaque démarrage : non signée (ou écrite à la
  // main) → retirée.
  [LS_KEY_SERVER, LS_KEY_LOCAL].forEach(function(cle) {
    var memo = _safeReadLS(cle);
    if (!memo) return;
    _verifierSignature(memo).then(function(signee) {
      if (!signee) { _safeRemoveLS(cle); _recomputeActive(); console.warn("[ProLicense] licence mémorisée retirée (non signée ou expirée)."); }
    });
  });

  _checkServerLicense();

  // Script chargé dans <head> : body n'existe pas encore, l'état est réappliqué au DOMContentLoaded.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      _applyClasses(!!_activeData);
    });
  }

})();
