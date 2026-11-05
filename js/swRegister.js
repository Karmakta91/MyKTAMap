/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// swRegister.js — inscription du Service Worker, kill switch ?killsw=1, nettoyage du cache-buster ?_=.
// Script externe (pas de <script> inline : CSP script-src 'self'), chargé en fin de body, sans defer.
// Expose : window.ktaSwAdhesion() — appelé par main.js une fois TOUTES les gates franchies (conditions, « Entrer » ou
//   code d'accès, gate déléguée d'une extension, PIN).
// ⚠️ Contrat (décision produit) : pas d'inscription avant ce geste — un visiteur de l'écran d'entrée ne stocke que la
//   page. Une inscription déjà présente (appareil déjà entré une fois) est suivie dès le chargement : ses mises à jour
//   et le hors-ligne ne dépendent pas des gates. 🩸 Juste après la première entrée, le précache n'est pas fini : une
//   coupure à ce moment-là laisse l'app sans hors-ligne (mesure : infra-versioning.md, cycle de vie du SW).
// Repère de déploiement : sw.js?d=<commit> (12 caractères), lu dans deploiement.json par la page CONTRÔLÉE (le SW
//   normalise la réponse). Commit nouveau = nouvelle adresse du script = réinstallation, sans changer CACHE_NAME.
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
  // ⚠️ localStorage et IndexedDB sont PRÉSERVÉS (plans, sessions, photos) ; les caches des plans rendus disponibles hors
  // ligne et des modules partent aussi (outil de dépannage, décision produit), comme avec /killsw.html.
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

  const SW_URL = "/sw.js";
  let _charge = false, _adhesion = false, _parti = false;

  function _tracer(reg) {
    // Trace updatefound / statechange : diagnostique un SW qui s'installe sans jamais s'activer.
    reg.addEventListener("updatefound", function() {
      const newSw = reg.installing;
      if (!newSw) return;
      console.log("[PWA] 📥 Nouveau SW détecté en installation");
      newSw.addEventListener("statechange", function() {
        console.log("[PWA] 📥 État SW installing :", newSw.state);
      });
    });
  }

  function _inscrire(url) {
    return navigator.serviceWorker.register(url)
      .then(function (reg) {
        console.log("[PWA] Service Worker enregistré", url);
        _tracer(reg);
        return reg;
      })
      .catch(function (err) {
        console.warn("[PWA] Erreur SW :", err);
      });
  }

  // Commit servi, ou null (hors ligne, page non contrôlée, installation sans repère).
  function _lireRepere() {
    if (!navigator.serviceWorker.controller || typeof fetch !== "function") return Promise.resolve(null);
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const minuteur = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
    return fetch("deploiement.json", { cache: "no-store", credentials: "omit", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        const c = j && j.commit;
        return typeof c === "string" && /^[0-9a-f]{7,40}$/.test(c) ? c.slice(0, 12) : null;
      })
      .catch(function () { return null; })
      .then(function (c) { clearTimeout(minuteur); return c; });
  }

  // Inscription existante : réinscrite sous l'adresse du commit servi quand il a changé. Sans repère, rien : le
  // navigateur revérifie seul sw.js à chaque navigation (et une adresse sans repère réinstallerait tout).
  function _suivre(reg) {
    _tracer(reg);
    return _lireRepere().then(function (commit) {
      if (!commit) return;
      const sw = reg.installing || reg.waiting || reg.active;
      let actuel = null;
      try { actuel = sw ? new URL(sw.scriptURL).searchParams.get("d") : null; } catch (e) { actuel = null; }
      if (actuel === commit) return;
      console.log("[PWA] 🔄 Nouveau déploiement (" + (actuel || "—") + " → " + commit + ") : réinstallation du SW");
      return _inscrire(SW_URL + "?d=" + commit);
    });
  }

  function _demarrer() {
    if (!_charge || _parti) return;
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (_parti) return;
      if (reg) { _parti = true; return _suivre(reg); }
      if (!_adhesion) return;
      _parti = true;
      return _inscrire(SW_URL);
    }).catch(function (err) { console.warn("[PWA] Erreur SW :", err); });
  }

  window.ktaSwAdhesion = function () {
    _adhesion = true;
    _demarrer();
  };

  window.addEventListener("load", function () {
    _charge = true;
    _demarrer();
  });
}
