/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// swRegister.js — enregistrement du Service Worker, kill switch ?killsw=1, nettoyage du
// cache-buster ?_=. Script externe (pas de <script> inline : CSP script-src 'self'), chargé en fin
// de body, sans defer.
// Doc : docs/architecture/infra-versioning.md

if ("serviceWorker" in navigator) {
  // Nouveau SW aux commandes pendant la session (nouveau CACHE_NAME) : log, toast en debugMode.
  // Le PREMIER controllerchange d'une page sans controller (1re installation) est ignoré.
  let _swIsInitialControl = !navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", function() {
    if (_swIsInitialControl) {
      _swIsInitialControl = false;
      return;
    }
    console.log("[PWA] 🔄 Nouveau SW a pris le contrôle (cache mis à jour)");
    // Toast en debugMode seulement (décision produit) : sinon un toast à chaque nouvelle version.
    const debugOn = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode === true);
    if (debugOn && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
      window.OOMGuard.showToast(
        _t("home.misc.swUpdateToast"),
        "info"
      );
    }
  });

  // Kill switch d'urgence « /?killsw=1 » : désinscrit TOUS les SW, vide TOUS les caches, alerte
  // puis recharge sans le paramètre — sans charger l'app (SW coincé qui sert un cache cassé).
  // ⚠️ localStorage et IndexedDB sont PRÉSERVÉS (plans, sessions, photos).
  (function _killSwIfRequested() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("killsw")) return;
    } catch (e) { return; }
    console.warn("[PWA] 🆘 Kill switch SW + caches activé via ?killsw=1");
    const tasks = [];
    if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
      tasks.push(
        navigator.serviceWorker.getRegistrations()
          .then(function(regs) {
            return Promise.all(regs.map(function(r) {
              console.log("[PWA] Unregister SW :", r.scope);
              return r.unregister();
            }));
          })
          .catch(function(e) { console.warn("[PWA] unregister SW :", e); })
      );
    }
    if (window.caches && caches.keys) {
      tasks.push(
        caches.keys()
          .then(function(keys) {
            return Promise.all(keys.map(function(k) {
              console.log("[PWA] Delete cache :", k);
              return caches.delete(k);
            }));
          })
          .catch(function(e) { console.warn("[PWA] delete caches :", e); })
      );
    }
    Promise.all(tasks).then(function() {
      const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
      // alert() natif voulu : utils.js (defer) n'est pas chargé, et il bloque avant le replace.
      try { alert(_t("home.misc.killSwUrlDone")); } catch (e) {}   // popup-native-ok : kill switch avant utils.js
      // Même URL SANS le paramètre.
      const cleanUrl = window.location.pathname +
                       (window.location.hash || "");
      window.location.replace(cleanUrl);
    });
    // Court-circuite l'enregistrement normal (le rechargement le refera).
    throw new Error("[PWA] kill switch — short-circuit normal load");
  })();

  // Cache-buster `?_=<timestamp>` de killsw.html (purger le SW ne vide pas le cache HTTP) : la
  // requête fraîche a eu lieu, on l'efface — sinon il se fige dans un favori ou le start_url.
  // replaceState (pas d'entrée d'historique sale) ; autres paramètres et hash PRÉSERVÉS.
  (function _nettoyerCacheBuster() {
    try {
      if (!window.history || typeof history.replaceState !== "function") return;
      if (window.location.search.indexOf("_=") === -1) return;
      const params = new URLSearchParams(window.location.search);
      if (!params.has("_")) return;
      params.delete("_");
      const q = params.toString();
      history.replaceState(null, "",
        window.location.pathname + (q ? "?" + q : "") + (window.location.hash || ""));
    } catch (e) { /* cosmétique : jamais bloquant pour le boot */ }
  })();

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js")
      .then(function (reg) {
        console.log("[PWA] Service Worker enregistré", reg);

        // Trace updatefound / statechange : diagnostique un SW qui s'installe sans jamais s'activer.
        reg.addEventListener("updatefound", function() {
          const newSw = reg.installing;
          if (!newSw) return;
          console.log("[PWA] 📥 Nouveau SW détecté en installation");
          newSw.addEventListener("statechange", function() {
            console.log("[PWA] 📥 État SW installing :", newSw.state);
          });
        });
      })
      .catch(function (err) {
        console.warn("[PWA] Erreur SW :", err);
      });
  });
}
