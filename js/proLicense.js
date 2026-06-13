/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// PRO LICENSE DETECTOR — js/proLicense.js
// =========================
//
// 🎯 Rôle : détecter si l'instance MyKTAMap tourne sous licence pro.
// 2 sources possibles (depuis v1.28.4) :
//
//   1. SERVEUR : présence d'un fichier `/Licence-pro.json` à la racine
//      du serveur web (= déployeur a mis en place le mode pro pour
//      tous les visiteurs de l'instance).
//
//   2. LOCAL (🆕 v1.28.4) : l'utilisateur importe un fichier
//      Licence-pro.json depuis SON profil dans le home loader →
//      mode pro activé sur SON appareil uniquement, persistant dans
//      localStorage. Permet d'activer une licence reçue par mail/canal
//      privé sans dépendre d'un déploiement serveur pro.
//
// 🛡️ Côté community : 100 % transparent. Pas de Licence-pro.json sur
// myktamap.fr, pas de licence importée → mode community par défaut →
// aucun changement visible pour l'utilisateur.
//
// 🔐 Sécurité : ce mécanisme reste PUREMENT COSMÉTIQUE. La licence
// (côté serveur ou local) est stockée en clair. La validité juridique
// vient du contrat signé avec MyKTAMap, pas du contenu du fichier.
// Cohérent avec UnlockGate (cf §36 CLAUDE.md "barrière sociale").
//
// 🆔 Hash de licence (depuis v1.28.4) : chaque licence émise par KARMA
// porte un `license_hash` unique au format `MKTM-LIC-<32 hex>`. Ce hash
// est nominatif (lié à 1 client/contrat). Sa reproduction ou son
// utilisation par un tiers est une infraction contractuelle.
//
//   Backward compat : les fichiers serveur posés avant v1.28.4 (sans
//   hash) sont toujours acceptés en source serveur (warning console
//   seulement). L'IMPORT MANUEL en revanche EXIGE un hash valide
//   (= toute licence livrée à un user à partir de maintenant doit
//   en contenir un).
//
// 📦 Format Licence-pro.json :
//
//   {
//     "instance":     "pro",                                  // REQUIS
//     "license_hash": "MKTM-LIC-<32 hex>",                    // REQUIS pour import manuel, optionnel pour fetch serveur
//     "client":       "Acme SpeleSecours",                    // optionnel — futur affichage
//     "license_id":   "MKTM-2026-001",                        // optionnel — traçabilité interne
//     "license_type": "annual" | "perpetual" | "free-grimp",  // optionnel
//     "issued_at":    "2026-05-30",                           // optionnel
//     "valid_until":  "2027-05-30"                            // optionnel
//   }
//
// API publique exposée :
//   window.__MKTM_PRO_LICENSE__         : objet JSON parsé OU null
//   window.MyKTAMapProLicense.isPro()   : boolean
//   window.MyKTAMapProLicense.getData() : objet ou null
//   window.MyKTAMapProLicense.getSource() : "server" | "local" | null  🆕
//   window.MyKTAMapProLicense.importFile(file) : Promise<result>       🆕
//   window.MyKTAMapProLicense.removeLocal()    : void                  🆕
//   window.MyKTAMapProLicense.forceRecheck()   : void
//
// Event émis sur window au changement de licence :
//   "mktm:license-changed" → detail = { isPro, source, data }
//
// =========================

(function() {
  "use strict";

  // Clés localStorage distinctes pour les 2 sources.
  var LS_KEY_SERVER = "__mktm_pro_license__";       // cache du fetch /Licence-pro.json
  var LS_KEY_LOCAL  = "__mktm_pro_license_local__"; // licence importée manuellement

  var FETCH_PATH = "/Licence-pro.json";
  var FETCH_TIMEOUT_MS = 1500;

  // Pattern de validation du hash de licence.
  // Format : MKTM-LIC- suivi de 32 caractères hexadécimaux (insensible à la casse).
  // Génération côté KARMA : `openssl rand -hex 16` → "MKTM-LIC-" + result.
  var HASH_PATTERN = /^MKTM-LIC-[A-Fa-f0-9]{32}$/;

  // -------------------------------------------------------------------------
  // Helpers internes
  // -------------------------------------------------------------------------

  // Helper i18n — appelé au moment de la validation/import (action user),
  // jamais au load → dicos prêts. Fallback = clé si I18n absent.
  function t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }

  function _safeReadLS(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.instance === "pro") return data;
    } catch(e) {
      // Cache corrompu → on l'ignore (laissera la suite purger)
    }
    return null;
  }

  function _safeWriteLS(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
  }

  function _safeRemoveLS(key) {
    try { localStorage.removeItem(key); } catch(e) {}
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

  // -------------------------------------------------------------------------
  // Lecture initiale synchrone (cache localStorage) — évite tout flash
  // -------------------------------------------------------------------------
  // Priorité : serveur > local (le serveur prime — c'est l'annonce du
  // déployeur, plus "officielle" que l'import individuel).

  var _activeData = null;
  var _activeSource = null;

  var serverCached = _safeReadLS(LS_KEY_SERVER);
  if (serverCached) {
    _activeData = serverCached;
    _activeSource = "server";
  } else {
    var localCached = _safeReadLS(LS_KEY_LOCAL);
    if (localCached) {
      _activeData = localCached;
      _activeSource = "local";
    }
  }

  window.__MKTM_PRO_LICENSE__ = _activeData;
  if (_activeData) {
    if (document.documentElement) {
      document.documentElement.classList.add("kta-instance-pro");
    }
  }

  // -------------------------------------------------------------------------
  // Application d'état + notification
  // -------------------------------------------------------------------------

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

    // Re-lecture : serveur > local (serveur prime sur local si les 2
    // sont actifs en même temps — annonce du déployeur > import perso).
    var srv = _safeReadLS(LS_KEY_SERVER);
    var loc = _safeReadLS(LS_KEY_LOCAL);

    if (srv) {
      _activeData = srv;
      _activeSource = "server";
    } else if (loc) {
      _activeData = loc;
      _activeSource = "local";
    } else {
      _activeData = null;
      _activeSource = null;
    }

    window.__MKTM_PRO_LICENSE__ = _activeData;
    _applyClasses(!!_activeData);
    _notifyChange(prevIsPro, prevSource, !!_activeData, _activeSource, _activeData);
  }

  // -------------------------------------------------------------------------
  // Vérification async côté serveur
  // -------------------------------------------------------------------------

  function _checkServerLicense() {
    if (typeof fetch !== "function") return;

    var ctrl = null;
    var timeoutId = null;
    if (typeof AbortController === "function") {
      ctrl = new AbortController();
      timeoutId = setTimeout(function() {
        try { ctrl.abort(); } catch(e) {}
      }, FETCH_TIMEOUT_MS);
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
          // 404 community OU 5xx → on purge le cache SERVEUR
          // (mais on TOUCHE PAS au cache LOCAL, qui reste indépendant).
          _safeRemoveLS(LS_KEY_SERVER);
          _recomputeActive();
          return null;
        }
        return resp.json().catch(function() { return null; });
      })
      .then(function(data) {
        if (data === undefined) return;
        var v = _validateData(data, /* strictHash */ false);
        if (v.ok) {
          _safeWriteLS(LS_KEY_SERVER, v.data);
        } else {
          _safeRemoveLS(LS_KEY_SERVER);
        }
        _recomputeActive();
      })
      .catch(function() {
        // Network error / timeout → maintenir l'état cache (offline temporaire).
        if (timeoutId) clearTimeout(timeoutId);
      });
  }

  // -------------------------------------------------------------------------
  // Import manuel d'un fichier (UI dans Mon profil — depuis v1.28.4)
  // -------------------------------------------------------------------------

  function _importFile(file) {
    return new Promise(function(resolve) {
      if (!file || typeof file !== "object") {
        resolve({ ok: false, error: t("license.err.noFile") });
        return;
      }
      var maxBytes = 50 * 1024; // 50 KB suffit largement pour un JSON de licence
      if (typeof file.size === "number" && file.size > maxBytes) {
        resolve({ ok: false, error: t("license.err.tooLarge") });
        return;
      }

      var reader = new FileReader();
      reader.onload = function(ev) {
        var text = ev && ev.target && typeof ev.target.result === "string"
          ? ev.target.result
          : null;
        if (!text) {
          resolve({ ok: false, error: t("license.err.readImpossible") });
          return;
        }
        var data;
        try {
          data = JSON.parse(text);
        } catch(e) {
          resolve({ ok: false, error: t("license.err.jsonInvalid", { msg: (e.message || e) }) });
          return;
        }
        // ⚠️ Strict pour l'import manuel : hash obligatoire et bien formé.
        var v = _validateData(data, /* strictHash */ true);
        if (!v.ok) {
          resolve(v);
          return;
        }
        _safeWriteLS(LS_KEY_LOCAL, v.data);
        _recomputeActive();
        resolve({ ok: true, data: v.data });
      };
      reader.onerror = function() {
        resolve({ ok: false, error: t("license.err.readError") });
      };
      reader.readAsText(file);
    });
  }

  function _removeLocal() {
    _safeRemoveLS(LS_KEY_LOCAL);
    _recomputeActive();
  }

  // -------------------------------------------------------------------------
  // API publique
  // -------------------------------------------------------------------------
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
    importFile: function(file) {
      return _importFile(file);
    },
    removeLocal: function() {
      _removeLocal();
    },
    forceRecheck: function() {
      _checkServerLicense();
    },
    // Helpers diagnostic
    _LS_KEY_SERVER: LS_KEY_SERVER,
    _LS_KEY_LOCAL: LS_KEY_LOCAL,
    HASH_PATTERN: HASH_PATTERN
  };

  // -------------------------------------------------------------------------
  // Lancement de la vérification async côté serveur
  // -------------------------------------------------------------------------

  _checkServerLicense();

  // Au cas où body arrive après le check initial (script chargé dans <head>),
  // re-applique l'état à DOMContentLoaded.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      _applyClasses(!!_activeData);
    });
  }

})();
