/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 */

// =========================
// INCOGNITO MODE — v1.31.8 F2
// =========================
//
// Active si URL contient ?incognito=1 (ou si window._kta_incognito = true
// posé par un test). Quand actif, tout write vers localStorage / sessionStorage
// est in-memory uniquement (Map vivante jusqu'au unload), et tout write IDB
// (put / add / delete / clear) est silencieusement no-opé.
//
// Pourquoi cette stratégie :
//   - L'utilisateur veut explorer un plan sans laisser de trace (session prêtée
//     à un tiers, démo publique, plan sensible). Pattern : "navigation privée"
//     du navigateur, mais limité à MyKTAMap.
//   - On veut RIEN écrire de nouveau, MAIS on doit pouvoir LIRE l'existant
//     (sinon les plans selfhost déjà importés, les préférences thème, etc.
//     deviennent inaccessibles → app cassée).
//   - Solution : intercepte les écritures (set + IDB writes), laisse les
//     lectures intactes. Au unload du tab, la Map in-memory disparaît.
//
// Limites assumées :
//   - Si un module legacy écrit DIRECTEMENT dans une référence Storage
//     pré-capturée (rare, anti-pattern), le shim ne le voit pas.
//   - Le cache Service Worker (assets statiques) reste actif — c'est OK,
//     ce sont des fichiers app non identifiants.
//   - Les cookies httpOnly serveur, hors scope (myktamap.fr n'en pose pas).
//
// API publique :
//   window.IncognitoMode = {
//     active:  true | false,    // état au boot, lecture seule
//     launch: function() { ... } // ouvre nouvelle fenêtre ?incognito=1
//   }
//
// Charger SYNC TOUT EN HAUT de index.html (avant tout autre module qui
// pourrait écrire en storage). Ordre : copyright → incognitoMode → autres.

(function() {
  "use strict";

  var URL_PARAM = "incognito";

  // Détection robuste : query string OR override test global
  function _detect() {
    if (typeof window._kta_incognito === "boolean") return window._kta_incognito;
    try {
      var qp = new URLSearchParams(window.location.search);
      return qp.get(URL_PARAM) === "1";
    } catch (e) {
      return false;
    }
  }

  var ACTIVE = _detect();

  // -----------------------------------------------------------------------
  // API publique (toujours posée — même si pas actif, pour que le bouton
  // "🕵️ Démarrer mode incognito" dans Réglages puisse appeler .launch())
  // -----------------------------------------------------------------------
  window.IncognitoMode = {
    active: ACTIVE,
    // Ouvre une nouvelle fenêtre dans le même origin avec ?incognito=1.
    // Conserve les autres params (ex: ?selfhost=…) pour le workflow combiné.
    launch: function() {
      try {
        var url = new URL(window.location.href);
        url.searchParams.set(URL_PARAM, "1");
        window.open(url.toString(), "_blank", "noopener");
      } catch (e) {
        // Fallback (URL constructor indispo très ancien browser)
        var sep = window.location.search ? "&" : "?";
        window.open(window.location.pathname + window.location.search + sep + URL_PARAM + "=1", "_blank", "noopener");
      }
    }
  };

  if (!ACTIVE) return;

  // -----------------------------------------------------------------------
  // ACTIF — installation des shims
  // -----------------------------------------------------------------------
  console.warn(
    "%c🕵️ [IncognitoMode] ACTIF",
    "color:#a78bfa;font-weight:bold;font-size:13px;",
    "— localStorage + IndexedDB en mode in-memory. Aucune trace persistée."
  );

  // 1️⃣ Marker CSS sur <html> (la racine, pour que les sélecteurs body./html.
  //    fonctionnent dès l'analyse du DOM même avant l'apparition de <body>)
  function _markDom() {
    try { document.documentElement.classList.add("kta-incognito"); } catch (_) {}
  }
  if (document.documentElement) {
    _markDom();
  } else {
    document.addEventListener("DOMContentLoaded", _markDom);
  }

  // 2️⃣ Shim Storage.prototype (localStorage + sessionStorage partagent la même prototype).
  //    Pourquoi in-memory et pas pure no-op : un module qui set("k","v") puis
  //    get("k") attend de retrouver "v". Sinon faux négatifs partout (ex: pref
  //    thème mise à jour qui ne se relit pas, écouteurs visibility cassés).
  //    Au unload : la Map disparaît avec le JS context → reload propre.
  try {
    var _memStorage = new Map();

    // Sauvegarde référence aux originaux (pour debug / inspection runtime)
    var _origStorage = {
      setItem:    Storage.prototype.setItem,
      getItem:    Storage.prototype.getItem,
      removeItem: Storage.prototype.removeItem,
      clear:      Storage.prototype.clear,
      key:        Storage.prototype.key
    };

    Storage.prototype.setItem = function(k, v) {
      _memStorage.set(String(k), String(v));
      // PAS d'appel à _origStorage.setItem → bypass écriture disque.
    };

    Storage.prototype.getItem = function(k) {
      // 1. Si on a écrit en in-memory, retourne la valeur in-memory
      if (_memStorage.has(String(k))) return _memStorage.get(String(k));
      // 2. Sinon, retourne null. On NE LIT PAS l'existant disque pour ne pas
      //    permettre à un module de "récupérer" des données pré-incognito
      //    (sinon l'incognito devient un demi-mesure : on lit l'historique).
      //    Conséquence : les préférences thème / langue se résettent au boot
      //    incognito. Acceptable — c'est cohérent avec le pattern navigation
      //    privée des navigateurs.
      return null;
    };

    Storage.prototype.removeItem = function(k) {
      _memStorage.delete(String(k));
    };

    Storage.prototype.clear = function() {
      _memStorage.clear();
    };

    Storage.prototype.key = function(i) {
      var keys = Array.from(_memStorage.keys());
      return (i >= 0 && i < keys.length) ? keys[i] : null;
    };

    // length est un GETTER sur Storage.prototype — defineProperty requis
    Object.defineProperty(Storage.prototype, "length", {
      get: function() { return _memStorage.size; },
      configurable: true
    });

    // Expose pour debug (impossible d'inspecter via DevTools sinon)
    window.IncognitoMode._memStorage = _memStorage;
    window.IncognitoMode._origStorage = _origStorage;
  } catch (e) {
    console.warn("🕵️ [IncognitoMode] Impossible de shim Storage :", e);
  }

  // 3️⃣ Shim IDBObjectStore.prototype writes (put/add/delete/clear).
  //    Reads (get/getAll/openCursor/count) intacts → modules selfhost qui
  //    lisent leurs handles, photos déjà existantes, etc. marchent.
  //    Writes : on retourne un IDBRequest fake qui RÉUSSIT immédiatement
  //    (pour ne pas faire crasher les callers qui attendent un onsuccess).
  try {
    function _makeFakeIDBRequest(name) {
      // On forge un objet ressemblant assez à IDBRequest pour que les
      // callers usuels (`req.onsuccess = …`, `req.result`) tournent sans
      // exception. setTimeout 0 pour que l'event arrive en mode async,
      // cohérent avec l'API IDB native.
      var req = {
        result:     undefined,
        error:      null,
        readyState: "pending",
        source:     null,
        transaction: null,
        onsuccess:  null,
        onerror:    null
      };
      setTimeout(function() {
        req.readyState = "done";
        if (typeof req.onsuccess === "function") {
          try { req.onsuccess({ target: req, type: "success" }); } catch (_) {}
        }
      }, 0);
      return req;
    }

    var _origIdbStore = {
      put:    IDBObjectStore.prototype.put,
      add:    IDBObjectStore.prototype.add,
      delete: IDBObjectStore.prototype["delete"],
      clear:  IDBObjectStore.prototype.clear
    };

    IDBObjectStore.prototype.put = function() {
      console.debug("🕵️ [IncognitoMode] IDB put bypass :", this.name);
      return _makeFakeIDBRequest(this.name);
    };
    IDBObjectStore.prototype.add = function() {
      console.debug("🕵️ [IncognitoMode] IDB add bypass :", this.name);
      return _makeFakeIDBRequest(this.name);
    };
    IDBObjectStore.prototype["delete"] = function() {
      console.debug("🕵️ [IncognitoMode] IDB delete bypass :", this.name);
      return _makeFakeIDBRequest(this.name);
    };
    IDBObjectStore.prototype.clear = function() {
      console.debug("🕵️ [IncognitoMode] IDB clear bypass :", this.name);
      return _makeFakeIDBRequest(this.name);
    };

    window.IncognitoMode._origIdbStore = _origIdbStore;
  } catch (e) {
    console.warn("🕵️ [IncognitoMode] Impossible de shim IDBObjectStore :", e);
  }

  // 4️⃣ Inject un badge "INCOGNITO" dans les titres visibles + préfixe le
  //    <title> du tab pour que l'onglet reflète l'état même quand l'user
  //    est sur la carte (où aucun titre app n'est visible).
  //
  //    Cibles :
  //    - #splashTitle (splash de démarrage très bref)
  //    - .loader-titre-nom (vue loader / sélection plan — long séjour)
  //    - document.title (tab navigateur — permanent)
  function _injecterBadgeTitre() {
    try {
      // Préfixe le <title> du tab
      if (document.title && document.title.indexOf("🕵️") !== 0) {
        document.title = "🕵️ " + document.title;
      }
      // Inject le badge dans tous les titres visibles trouvés
      var cibles = document.querySelectorAll("#splashTitle, .loader-titre-nom");
      cibles.forEach(function(titre) {
        // Évite double-inject
        if (titre.querySelector(".kta-incognito-badge")) return;
        var badge = document.createElement("span");
        badge.className = "kta-incognito-badge";
        badge.textContent = "🕵️ INCOGNITO";
        badge.title = "Mode incognito actif — aucune donnée n'est sauvegardée";
        titre.appendChild(badge);
      });
    } catch (e) {
      console.warn("🕵️ [IncognitoMode] Badge titre KO :", e);
    }
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(_injecterBadgeTitre, 200);
  } else {
    document.addEventListener("DOMContentLoaded", function() {
      setTimeout(_injecterBadgeTitre, 200);
    });
  }
  // Re-tentative tardive pour attraper les titres injectés par modules
  // post-DOMContentLoaded (loader/splash apparaissent souvent après boot).
  setTimeout(_injecterBadgeTitre, 1500);
})();
