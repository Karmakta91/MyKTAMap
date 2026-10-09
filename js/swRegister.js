/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// SWREGISTER.JS — enregistrement du Service Worker (ex-bloc <script> inline d'index.html)
// =========================
// Sorti d'index.html le 07/10/2026 pour la CSP stricte (script-src sans 'unsafe-inline'). Code INCHANGÉ,
// chargé au même endroit (fin de body), sans defer.

// Enregistrement Service Worker (PWA)
if ("serviceWorker" in navigator) {
  // 🆕 v1.20.0 — Hook "controllerchange" pour notifier l'user quand un
  // nouveau SW prend le contrôle pendant la session. Cas typique : on a
  // bumpé CACHE_NAME côté serveur (ex: -fixes2), le SW s'install + activate
  // + skipWaiting + clients.claim → controllerchange fire → on affiche
  // un toast non-bloquant pour expliquer pourquoi le reload a fetché des
  // nouveaux assets. Sans ce hook, l'user ne voit rien et peut se demander
  // pourquoi "ça réagit différemment d'un coup".
  //
  // Garde-fou : on skip le PREMIER controllerchange si la page n'avait pas
  // de controller au load (= cas du tout premier install PWA). On ne veut
  // notifier que les "vraies" updates (= ancien controller → nouveau).
  let _swIsInitialControl = !navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", function() {
    if (_swIsInitialControl) {
      _swIsInitialControl = false;
      // Premier install — pas de toast, c'est normal
      return;
    }
    // Vraie update : un ancien controller a été remplacé.
    // Log console TOUJOURS (utile pour debug + traçabilité dans 🐛 Logs).
    console.log("[PWA] 🔄 Nouveau SW a pris le contrôle (cache mis à jour)");
    // 🆕 v1.25.1 (KARMA "popup style log de dev en mode mise à jour") :
    // Toast UNIQUEMENT en debugMode. En prod, l'user ne voit rien — le
    // log console reste pour les devs qui inspectent. Avant : toast à
    // CHAQUE bump cache → spam visuel sur les cycles dev fréquents
    // (v1.23.x → v1.24.0 → v1.24.1 ... 10+ updates en 24h).
    const debugOn = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode === true);
    if (debugOn && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
      window.OOMGuard.showToast(
        _t("home.misc.swUpdateToast"),
        "info"
      );
    }
  });

  // 🆘 hotfix19 — Kill switch d'urgence pour les users avec SW/cache coincés.
  // Usage : taper "https://<domaine>/?killsw=1" dans la barre d'adresse.
  // Au load, le script détecte le param, unregister TOUS les SW + caches.delete()
  // TOUS les caches, puis affiche un alert + reload propre vers la même URL
  // sans le param. Équivalent fonctionnel du "💥 Tout réinitialiser" loader
  // mais sans devoir charger l'app (utile quand l'app elle-même refuse de
  // boot à cause d'un SW coincé qui sert un cache cassé).
  //
  // KARMA quote : "bon rien a faire sur mobile [...] j'ai supprimer l'icone
  // du PWA, rester cache depuis chrome, restart de l'appareil, utilisation
  // de la wifi plutot que 4g, j'ai meme tout roalback ce qui fonctionne
  // aujourd'hui en prod et pareil"
  //
  // localStorage / IndexedDB SONT PRÉSERVÉS — ce kill switch ne supprime
  // QUE le SW et les caches HTTP/PWA. Les plans mémorisés, sessions,
  // photos, etc. restent intacts.
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
      // Natif voulu : kill switch lancé pendant le parsing (utils.js est en defer) dans une app
      // supposée cassée ; alert() bloque, donc le message est lu AVANT le location.replace.
      try { alert(_t("home.misc.killSwUrlDone")); } catch (e) {}   // popup-native-ok : kill switch avant utils.js
      // Reload vers la même URL SANS le param killsw, force = true pour bypass
      // tout cache HTTP résiduel.
      const cleanUrl = window.location.pathname +
                       (window.location.hash || "");
      window.location.replace(cleanUrl);
    });
    // Court-circuit l'enregistrement SW normal (le reload va le re-registrer
    // proprement via le code ci-dessous)
    throw new Error("[PWA] kill switch — short-circuit normal load");
  })();

  // 🧹 v1.75.0 — Nettoyage du cache-buster `?_=<timestamp>` (retour KARMA
  // « pourquoi j'ai un truc comme ça qui s'ajoute à mon URL »).
  //
  // POURQUOI IL EXISTE : `killsw.html` recharge via `/?_=<timestamp>` parce
  // que purger le Service Worker et ses caches NE VIDE PAS le cache HTTP du
  // navigateur — sans URL unique, le reload pouvait re-servir depuis le
  // disque l'`index.html` périmé qu'on venait justement de fuir.
  //
  // POURQUOI ON L'EFFACE ENSUITE : une fois ce script exécuté, la requête
  // fraîche a EU LIEU — le paramètre n'a plus aucune utilité. Le laisser
  // inquiète l'utilisateur, et surtout il se FIGE dans un favori ou dans le
  // `start_url` si quelqu'un ajoute l'app à son écran d'accueil depuis cette
  // URL. Aligne aussi le comportement sur celui de `?killsw=1`, qui nettoie
  // déjà son paramètre (cf. plus haut).
  //
  // `replaceState` : on remplace l'entrée d'historique au lieu d'en ajouter
  // une — sinon le bouton Retour ramènerait sur l'URL sale.
  // Les autres paramètres (`incognito`…) et le hash sont PRÉSERVÉS.
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

        // 🆕 v1.20.0 — Log updatefound pour traçabilité (visible dans
        // 🐛 Logs détaillés si debugMode ON). Aide à diagnostiquer le cas
        // où un nouveau SW s'install mais n'arrive jamais à activate
        // (ex: bug du SW lui-même).
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
