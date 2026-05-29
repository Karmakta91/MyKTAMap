/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// PRO LICENSE DETECTOR — js/proLicense.js (depuis v1.28.2)
// =========================
//
// 🎯 Rôle : détecter si l'instance MyKTAMap déployée tourne sous licence pro
// (= une instance d'un client mode A auto-hébergé OU mode B managé) par la
// PRÉSENCE d'un fichier `Licence-pro.json` à la racine du serveur.
//
// 🛡️ Côté communautaire : 100 % transparent. Le fichier `Licence-pro.json`
// n'existe pas sur myktamap.fr (community) → fetch 404 → mode community par
// défaut → aucun changement visible pour l'utilisateur.
//
// 🏷️ Côté pro : le déployeur (client mode A ou KARMA mode B) pose le fichier
// `Licence-pro.json` à la racine du serveur web, avec un contenu JSON minimal :
//
//   { "instance": "pro" }
//
// ou enrichi (extensible pour le futur) :
//
//   {
//     "instance":    "pro",
//     "client":      "Acme SpéléoSecours",
//     "license_id":  "MKTM-2026-001",
//     "valid_until": "2027-05-30"
//   }
//
// 📌 Mécanisme :
//   1. Au chargement très tôt, lecture du cache localStorage
//      `__mktm_pro_license__` : si `pro` → on applique IMMÉDIATEMENT la classe
//      `kta-instance-pro` sur <html>, évitant tout flash visuel au boot 2+.
//   2. En parallèle, fetch async `Licence-pro.json?_=<ts>` (cache-bust) pour
//      confirmer/invalider le cache local.
//   3. Si fetch succès + JSON valide avec `instance: "pro"` → mode pro activé
//      (classe appliquée + flag global + cache localStorage maj).
//   4. Si fetch échoue (404 community, network down, parse error) → cache
//      localStorage purgé + classe retirée si présente → mode community.
//
// 🚧 Sécurité : ce mécanisme est PUREMENT COSMÉTIQUE. Un user community qui
// pose un faux `Licence-pro.json` chez lui peut afficher le mode pro mais
// n'a pas la licence réelle. Le copyright légal reste dans LICENSE (racine).
// Pas pire que UnlockGate (cf §36 CLAUDE.md "barrière sociale").
//
// API exposée :
//   - window.__MKTM_PRO_LICENSE__ : objet JSON parsé OU null si community
//   - window.MyKTAMapProLicense.isPro() : boolean
//   - window.MyKTAMapProLicense.getData() : objet ou null
//
// =========================

(function() {
  "use strict";

  var LS_KEY = "__mktm_pro_license__";
  var FETCH_PATH = "/Licence-pro.json";
  var FETCH_TIMEOUT_MS = 1500;  // si pas de réponse en 1.5s → fallback community

  // -------------------------------------------------------------------------
  // 0. Bootstrap synchrone depuis le cache localStorage
  // -------------------------------------------------------------------------
  // Évite le flash visuel au boot 2+ d'une instance pro. Le cache contient
  // soit le JSON sérialisé d'une session pro précédente, soit rien (community).
  //
  // ⚠️ On applique la classe sur `<html>` (document.documentElement), pas sur
  // body, car body n'existe pas encore à ce stade (script chargé en <head>).

  var _cachedRaw = null;
  try {
    _cachedRaw = localStorage.getItem(LS_KEY);
  } catch(e) {
    // localStorage indispo (incognito strict, désactivé, etc.) → tant pis,
    // le mécanisme fonctionne en dégradé (flash au boot 1, comme une 1ère
    // visite).
  }

  var _cachedData = null;
  if (_cachedRaw) {
    try {
      _cachedData = JSON.parse(_cachedRaw);
    } catch(e) {
      // Cache corrompu → on l'ignore
      _cachedData = null;
    }
  }

  // Application synchrone (cache hit pro)
  if (_cachedData && _cachedData.instance === "pro") {
    window.__MKTM_PRO_LICENSE__ = _cachedData;
    if (document.documentElement) {
      document.documentElement.classList.add("kta-instance-pro");
    }
  } else {
    window.__MKTM_PRO_LICENSE__ = null;
  }

  // -------------------------------------------------------------------------
  // 1. Vérification async via fetch
  // -------------------------------------------------------------------------
  // Confirme ou invalide le cache. Permet aussi de capter le passage
  // community → pro (1ère installation de la licence sur le serveur).
  //
  // Important : `cache: "no-store"` + cache-bust ?_= pour bypasser tout
  // cache navigateur. Le SW community est conçu pour servir ce fichier
  // depuis le réseau uniquement (cf sw.js : bypass dans fetch handler).

  function _appliquerEtat(data) {
    var prevIsPro = !!(window.__MKTM_PRO_LICENSE__ &&
                        window.__MKTM_PRO_LICENSE__.instance === "pro");
    var nowIsPro = !!(data && data.instance === "pro");

    if (nowIsPro) {
      // Activation pro
      window.__MKTM_PRO_LICENSE__ = data;
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      } catch(e) {}
      if (document.documentElement) {
        document.documentElement.classList.add("kta-instance-pro");
      }
      if (document.body) {
        document.body.classList.add("kta-instance-pro");
      }
    } else {
      // Retour ou maintien community
      window.__MKTM_PRO_LICENSE__ = null;
      try {
        localStorage.removeItem(LS_KEY);
      } catch(e) {}
      if (document.documentElement) {
        document.documentElement.classList.remove("kta-instance-pro");
      }
      if (document.body) {
        document.body.classList.remove("kta-instance-pro");
      }
    }

    // Notifier les éventuels listeners (futurs widgets dynamiques)
    if (prevIsPro !== nowIsPro && typeof window.CustomEvent === "function") {
      try {
        window.dispatchEvent(new CustomEvent("mktm:license-changed", {
          detail: { isPro: nowIsPro, data: data || null }
        }));
      } catch(e) {}
    }
  }

  function _checkLicensePro() {
    if (typeof fetch !== "function") {
      // Browser très ancien sans fetch → fallback community (zéro impact
      // négatif si on était en community via cache)
      return;
    }

    // Timeout via AbortController si dispo (sinon on laisse couler)
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
          // 404 (community), 5xx (serveur down) → community
          _appliquerEtat(null);
          return null;
        }
        return resp.json().catch(function() { return null; });
      })
      .then(function(data) {
        if (data === undefined) return;
        _appliquerEtat(data);
      })
      .catch(function() {
        // Network error, abort timeout, etc. → on maintient l'état cache
        // (si on avait pro en cache, on garde, on ne purge pas — l'instance
        // peut être offline temporairement).
        if (timeoutId) clearTimeout(timeoutId);
      });
  }

  // -------------------------------------------------------------------------
  // 2. API publique
  // -------------------------------------------------------------------------
  window.MyKTAMapProLicense = {
    isPro: function() {
      return !!(window.__MKTM_PRO_LICENSE__ &&
                window.__MKTM_PRO_LICENSE__.instance === "pro");
    },
    getData: function() {
      return window.__MKTM_PRO_LICENSE__ || null;
    },
    forceRecheck: function() {
      _checkLicensePro();
    }
  };

  // -------------------------------------------------------------------------
  // 3. Lancement de la vérification async
  // -------------------------------------------------------------------------
  // On lance immédiatement le fetch (pas besoin d'attendre DOMContentLoaded).
  // Si body pas encore là, _appliquerEtat() utilise documentElement seul,
  // puis re-applique à body au prochain check (mais pas urgent — le CSS sur
  // <html> couvre la propagation aux descendants).

  _checkLicensePro();

  // Au cas où body arrive après notre check initial (peu probable mais
  // safety), on re-applique l'état actuel quand DOMContentLoaded fire.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      var data = window.__MKTM_PRO_LICENSE__;
      if (data && data.instance === "pro" && document.body) {
        document.body.classList.add("kta-instance-pro");
      }
    });
  }

})();
