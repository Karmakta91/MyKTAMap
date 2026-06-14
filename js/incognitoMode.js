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
    //
    // 🩹 v1.31.8-fix1 : flush SessionPersist AVANT le launch pour que la
    // session courante de la fenêtre principale soit garantie persistée
    // sur disque. Cas piégeux : l'user travaille, clique "Démarrer
    // incognito", la fenêtre principale crash/se ferme avant le prochain
    // tick auto-save → perte de la dernière modif. Le force:true bypass
    // le throttle "main thread busy".
    launch: function() {
      try {
        if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
          window.SessionPersist.save({ force: true });
        }
      } catch (e) { /* defensive — pas bloquant */ }
      try {
        var url = new URL(window.location.href);
        url.searchParams.set(URL_PARAM, "1");
        window.open(url.toString(), "_blank", "noopener");
      } catch (e) {
        // Fallback (URL constructor indispo très ancien browser)
        var sep = window.location.search ? "&" : "?";
        window.open(window.location.pathname + window.location.search + sep + URL_PARAM + "=1", "_blank", "noopener");
      }
    },
    // 🆕 v1.31.10 : garde-fou de confirmation AVANT launch. Affiche une
    // modale charte (pattern modale "Mise à jour disponible") avec
    // description + risques + boutons Annuler/Activer. Si confirmé →
    // appelle launch() (qui flush SessionPersist + ouvre nouvelle fenêtre).
    // Si annulé → no-op.
    //
    // En mode incognito DÉJÀ actif : on bypass la modale et on relance
    // direct (cas légitime : tester depuis un état "frais", l'user sait
    // déjà ce qu'est le mode incognito).
    confirmAndLaunch: function() {
      if (ACTIVE) {
        // Déjà en incognito → bypass confirm (cas légitime)
        window.IncognitoMode.launch();
        return;
      }
      // Évite double-injection si déjà ouverte
      if (document.getElementById("kta-incognito-confirm-modal")) return;

      var modal = document.createElement("div");
      modal.id = "kta-incognito-confirm-modal";
      modal.className = "kta-readme-modal-overlay";
      // HTML inspiré de afficherModaleUpdateDispo (interfaceAlerts.js)
      // pour cohérence visuelle. Couleurs adaptées : violet/lavande pour
      // l'incognito (vs ambre pour update).
      var t = window.I18n.t;
      modal.innerHTML =
        '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:85vh;">' +
          '<div class="kta-readme-modal-header">' +
            '<span class="kta-readme-modal-titre">' + t("incognito.confirm.title") + '</span>' +
            '<button class="kta-panneau-close" id="kta-incog-confirm-close" type="button">✕</button>' +
          '</div>' +
          '<div class="kta-readme-modal-corps">' +

            '<div class="kta-aide-section">' +
              '<div class="kta-aide-section-titre">' + t("incognito.confirm.changes.title") + '</div>' +
              '<ul style="margin:8px 0 0 0; padding-left:22px; color:#c8d0e0; font-size:13px; line-height:1.7;">' +
                '<li>' + t("incognito.confirm.changes.b1") + '</li>' +
                '<li>' + t("incognito.confirm.changes.b2") + '</li>' +
                '<li>' + t("incognito.confirm.changes.b3") + '</li>' +
                '<li>' + t("incognito.confirm.changes.b4") + '</li>' +
              '</ul>' +
            '</div>' +

            '<div class="kta-aide-section">' +
              '<div class="kta-aide-section-titre">' + t("incognito.confirm.warn.title") + '</div>' +
              '<div style="background:rgba(255,107,107,0.06); border:1px solid rgba(255,107,107,0.25); border-radius:8px; padding:10px 12px;">' +
                '<div style="color:#c8d0e0; font-size:12.5px; line-height:1.55;">' +
                  t("incognito.confirm.warn.body") +
                '</div>' +
              '</div>' +
            '</div>' +

            '<div class="kta-aide-section">' +
              '<div class="kta-aide-section-titre">' + t("incognito.confirm.usecases.title") + '</div>' +
              '<ul style="margin:8px 0 0 0; padding-left:22px; color:#c8d0e0; font-size:13px; line-height:1.7;">' +
                '<li>' + t("incognito.confirm.usecases.b1") + '</li>' +
                '<li>' + t("incognito.confirm.usecases.b2") + '</li>' +
                '<li>' + t("incognito.confirm.usecases.b3") + '</li>' +
                '<li>' + t("incognito.confirm.usecases.b4") + '</li>' +
              '</ul>' +
            '</div>' +

            '<div style="display:flex; gap:10px; margin-top:14px;">' +
              '<button class="kta-btn kta-btn-ghost"   id="kta-incog-confirm-cancel" type="button" style="flex:1;">' + t("incognito.confirm.cancel") + '</button>' +
              '<button class="kta-cfg-incognito-btn"   id="kta-incog-confirm-accept" type="button" style="flex:2; margin:0;">' +
                '<span style="font-size:16px;">🕵️</span>' +
                '<span><strong>' + t("incognito.confirm.accept") + '</strong></span>' +
              '</button>' +
            '</div>' +

          '</div>' +
        '</div>';
      document.documentElement.appendChild(modal);

      function _fermer() { modal.remove(); }
      document.getElementById("kta-incog-confirm-close").addEventListener("click", _fermer);
      document.getElementById("kta-incog-confirm-cancel").addEventListener("click", _fermer);
      document.getElementById("kta-incog-confirm-accept").addEventListener("click", function() {
        _fermer();
        // Appelle launch() qui flush SessionPersist + ouvre nouvelle fenêtre
        window.IncognitoMode.launch();
      });
      // Clic backdrop = cancel (équivalent Annuler)
      modal.addEventListener("click", function(e) {
        if (e.target === modal) _fermer();
      });
      // Escape ferme la modale (cohérent autres modales projet)
      document.addEventListener("keydown", function _onEsc(e) {
        if (e.key === "Escape" && document.getElementById("kta-incognito-confirm-modal")) {
          _fermer();
          document.removeEventListener("keydown", _onEsc);
        }
      });
    },

    // 🆕 v1.31.9 : quitter le mode incognito DEPUIS UN ONGLET INCOGNITO.
    // Stratégie en cascade :
    //   1. window.close() — marche uniquement si l'onglet a été ouvert par
    //      script (launch() ci-dessus). Le browser BLOQUE silencieusement
    //      les close() sur onglets ouverts manuellement par l'user.
    //   2. Fallback : navigate vers la même URL SANS ?incognito=1. Reload
    //      dans le tab courant en mode normal. L'user retrouve son contexte
    //      mais perd les données in-memory de la session incognito.
    // Si appelé hors d'un onglet incognito (= !ACTIVE), c'est un no-op
    // (cas défensif : un module qui appellerait quit() par erreur).
    quit: function() {
      if (!ACTIVE) return;
      // Tentative 1 : close
      try {
        window.close();
      } catch (_) {}
      // Tentative 2 (après court délai pour laisser close() prendre effet) :
      // si l'onglet est toujours là, on navigue en mode normal. Le browser
      // n'a pas bloqué close → ce setTimeout ne fera juste rien (le contexte
      // JS est déjà détruit).
      setTimeout(function() {
        try {
          var url = new URL(window.location.href);
          url.searchParams["delete"](URL_PARAM);
          // location.assign (pas replace) pour que le back permette retour à incognito
          window.location.assign(url.toString());
        } catch (e) {
          // Fallback ultra-vieux browser
          window.location.href = window.location.pathname;
        }
      }, 100);
    }
  };

  if (!ACTIVE) return;

  // -----------------------------------------------------------------------
  // ACTIF — installation des shims
  // -----------------------------------------------------------------------
  console.warn(
    "%c🕵️ [IncognitoMode] ACTIF",
    "color:#a78bfa;font-weight:bold;font-size:13px;",
    "— localStorage + IndexedDB en mode in-memory. Aucune trace d'activité persistée (langue d'interface conservée)."
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

    // 🆕 v1.46.4 (KARMA) — whitelist d'ÉCRITURE disque (write-through). La langue
    // d'interface n'est PAS une trace d'activité privée mais une préférence
    // d'affichage → KARMA veut qu'elle survive au relancement incognito. On
    // l'écrit donc AUSSI sur le vrai disque (en plus du shim mémoire). À garder
    // MINIMAL : seules des prefs UI non-sensibles ont le droit de persister.
    var WRITE_DISK_WHITELIST = {
      "myktamap_app_lang": 1
    };

    Storage.prototype.setItem = function(k, v) {
      var key = String(k);
      _memStorage.set(key, String(v));
      // Par défaut : PAS d'appel à _origStorage.setItem → bypass écriture disque.
      // Exception write-through : prefs UI whitelistées (langue) persistées disque.
      if (WRITE_DISK_WHITELIST[key]) {
        try { _origStorage.setItem.call(this, key, String(v)); } catch (e) {}
      }
    };

    // 🩹 v1.31.8-fix1 : whitelist clés autorisées en READ disque (writes
    // restent shimés en in-memory). Pour KARMA : on veut que la barrière
    // UnlockGate community continue de "valider quand même le mdp" sans
    // forcer l'user à re-saisir à chaque ouverture incognito. Le compteur
    // de tentatives échouées est aussi whitelisté pour ne pas casser
    // l'anti-bruteforce cross-fenêtre (sinon attaque par boucle de tabs).
    var READ_DISK_WHITELIST = {
      "myktamap_unlock_v1":       1, // UnlockGate — hash mdp community validé
      "myktamap_unlock_attempts": 1, // UnlockGate — compteur tentatives échouées
      "myktamap_app_lang":        1  // 🆕 v1.46.4 (KARMA) — langue d'interface :
      // persiste en incognito (lue au boot + write-through ci-dessus). Préférence
      // d'affichage non-sensible, pas une trace d'activité. Le thème, lui, reste
      // oublié (pas whitelisté) — seule la langue est l'exception demandée.
    };

    Storage.prototype.getItem = function(k) {
      var key = String(k);
      // 1. Si on a écrit en in-memory, retourne la valeur in-memory (priorité)
      if (_memStorage.has(key)) return _memStorage.get(key);
      // 2. Si clé whitelistée → on lit le disque réel (UX critique)
      if (READ_DISK_WHITELIST[key]) {
        try {
          return _origStorage.getItem.call(this, key);
        } catch (e) { return null; }
      }
      // 3. Sinon : null. On NE LIT PAS l'existant disque pour ne pas
      //    permettre à un module de "récupérer" des données pré-incognito
      //    (sinon l'incognito devient un demi-mesure : on lit l'historique).
      //    Conséquence : la préférence de THÈME se résette au boot incognito
      //    (cohérent avec le pattern navigation privée). La LANGUE, elle, est
      //    whitelistée (lue ici depuis le disque) + write-through → elle persiste
      //    (exception assumée v1.46.4 : préférence d'affichage non-sensible).
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

  // 4️⃣ Inject un badge "INCOGNITO" SOUS le sous-titre des conteneurs
  //    pour ne pas faire déborder le header / le titre sur mobile.
  //    Préfixe aussi le <title> du tab pour que l'onglet reflète l'état
  //    même quand l'user est sur la carte (où aucun titre app n'est visible).
  //
  //    🩹 v1.31.8-fix1 : avant on appendait le badge au #splashTitle et
  //    .loader-titre-nom (inline) → débordait du cadre sur mobile (badge =
  //    +90px de largeur en plus du nom MyKTAMap). Maintenant on inject
  //    APRÈS le subtitle/tagline dans le parent, sur sa propre ligne.
  //
  //    Cibles :
  //    - #splashBox > inject après #splashSubtitle (sa propre ligne)
  //    - .loader-titre-textes > inject après .loader-titre-tagline (sa propre ligne)
  //    - document.title (tab navigateur — permanent)
  function _injecterBadgeTitre() {
    try {
      // Préfixe le <title> du tab
      if (document.title && document.title.indexOf("🕵️") !== 0) {
        document.title = "🕵️ " + document.title;
      }
      // Helper : crée le badge avec classe block (CSS-driven layout)
      function _makeBadge() {
        // Fallback FR défensif : le badge est injecté très tôt (setTimeout boot),
        // window.I18n peut ne pas être prêt → on retombe sur le FR inline.
        function _t(key, fb) {
          try {
            if (window.I18n && typeof window.I18n.t === "function" && window.I18n.has(key)) {
              return window.I18n.t(key);
            }
          } catch (_) {}
          return fb;
        }
        var badge = document.createElement("div");
        badge.className = "kta-incognito-badge";
        badge.textContent = _t("incognito.badge.label", "🕵️ INCOGNITO");
        badge.title = _t("incognito.badge.tooltip", "Mode incognito actif — aucune donnée n'est sauvegardée");
        return badge;
      }
      // 1) Splash : inject dans #splashBox APRÈS #splashSubtitle
      var splashBox     = document.getElementById("splashBox");
      var splashSubtitle = document.getElementById("splashSubtitle");
      if (splashBox && splashSubtitle && !splashBox.querySelector(".kta-incognito-badge")) {
        splashSubtitle.insertAdjacentElement("afterend", _makeBadge());
      }
      // 2) Loader : inject dans .loader-titre-textes APRÈS .loader-titre-tagline
      document.querySelectorAll(".loader-titre-textes").forEach(function(container) {
        if (container.querySelector(".kta-incognito-badge")) return;
        var tagline = container.querySelector(".loader-titre-tagline");
        if (tagline) {
          tagline.insertAdjacentElement("afterend", _makeBadge());
        } else {
          // Fallback : pas de tagline → append en fin
          container.appendChild(_makeBadge());
        }
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
