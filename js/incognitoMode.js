/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 */

// =========================
// INCOGNITOMODE.JS — Mode incognito (aucune trace écrite)
// =========================
// Actif si l'URL contient ?incognito=1 (ou window._kta_incognito = true posé par un test). Alors toute écriture
// localStorage / sessionStorage reste EN MÉMOIRE (Map vivante jusqu'au unload) et toute écriture IDB (put / add /
// delete / clear) est un no-op silencieux.
// Pourquoi : explorer un plan sans laisser de trace (appareil prêté, démo, plan sensible), comme la navigation
// privée mais limité à MyKTAMap. 🔒 Rien de NOUVEAU n'est écrit, mais l'existant doit rester LISIBLE pour les
// clés nécessaires (plans selfhost importés, déverrouillage) : on intercepte les écritures, pas les lectures IDB.
// Limites assumées : un module qui écrirait dans une référence Storage pré-capturée échappe au shim ; le cache SW
// (fichiers de l'app, non identifiants) reste actif ; cookies httpOnly hors périmètre (myktamap.fr n'en pose pas).
// API : window.IncognitoMode = {
//   active:   true | false,          // état au démarrage, lecture seule
//   isActive: function() { ... },    // le même état, pour les appelants
//   launch:   function() { ... }     // ouvre une nouvelle fenêtre ?incognito=1
// }
// ⚠️ Chargé SYNCHRONE TOUT EN HAUT de index.html (copyright → incognitoMode → autres), avant tout module qui
// écrit en storage. Garde-fou : check-gate-instance.js (whitelist de lecture disque).

(function() {
  "use strict";

  var URL_PARAM = "incognito";

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

  // ── API publique (posée même inactive : le bouton des Réglages appelle .launch()) ──────────
  window.IncognitoMode = {
    active: ACTIVE,
    // 🩸 Vue OSM, son widget, Mode Secours et réparation du cache appellent `isActive()` : sans elle l'incognito
    // ne les couperait pas. Rend l'état du démarrage.
    isActive: function() { return ACTIVE; },
    // Sur une INSTALLATION RELIÉE (connexion serveur configurée), l'incognito n'a pas de sens : tout est synchronisé
    // et noté par le serveur, et le coffre chiffré / les plans hors ligne ont besoin d'IndexedDB, que ce mode bloque.
    // Vrai dès que l'état de connexion n'est ni « off » ni « invalide ». Lu à l'appel (ktaExtensions se charge après).
    indisponible: function() {
      try {
        var e = window.KtaExtensions && typeof window.KtaExtensions.etat === "function" ? window.KtaExtensions.etat().etat : "off";
        return e !== "off" && e !== "invalide";
      } catch (err) { return false; }
    },
    // Nouvelle fenêtre de même origine avec ?incognito=1, autres paramètres conservés (?selfhost=…).
    // 🩸 SessionPersist est vidé (force:true, contourne le throttle) AVANT : si la fenêtre principale se ferme avant
    // le prochain auto-save, la dernière modification serait perdue.
    launch: function() {
      if (window.IncognitoMode.indisponible()) {
        console.warn("[Incognito] indisponible sur une installation reliée");
        return;
      }
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
        // Repli sans constructeur URL (très vieux navigateur).
        var sep = window.location.search ? "&" : "?";
        window.open(window.location.pathname + window.location.search + sep + URL_PARAM + "=1", "_blank", "noopener");
      }
    },
    // Confirmation AVANT launch : modale charte (description, risques, Annuler / Activer) ; confirmé → launch().
    // Déjà en incognito : relance directe, sans modale.
    confirmAndLaunch: function() {
      if (window.IncognitoMode.indisponible()) return;   // installation reliée : cf indisponible()
      if (ACTIVE) {
        window.IncognitoMode.launch();
        return;
      }
      if (document.getElementById("kta-incognito-confirm-modal")) return;

      var modal = document.createElement("div");
      modal.id = "kta-incognito-confirm-modal";
      modal.className = "kta-readme-modal-overlay";
      // Même gabarit que afficherModaleUpdateDispo (interfaceAlerts.js), teintes violet/lavande.
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
        window.IncognitoMode.launch();
      });
      // Clic sur le fond = Annuler.
      modal.addEventListener("click", function(e) {
        if (e.target === modal) _fermer();
      });
      document.addEventListener("keydown", function _onEsc(e) {
        if (e.key === "Escape" && document.getElementById("kta-incognito-confirm-modal")) {
          _fermer();
          document.removeEventListener("keydown", _onEsc);
        }
      });
    },

    // Quitter le mode DEPUIS UN ONGLET INCOGNITO, en cascade :
    //   1. window.close() : ne marche que pour un onglet ouvert par script (launch()) ; le navigateur bloque en
    //      silence les autres ;
    //   2. repli : même URL SANS ?incognito=1 dans l'onglet courant (les données en mémoire sont perdues).
    // Hors incognito (!ACTIVE) : no-op défensif.
    quit: function() {
      if (!ACTIVE) return;
      try {
        window.close();
      } catch (_) {}
      // 2. Après un court délai : si l'onglet est encore là, navigation en mode normal (sinon le contexte JS est
      // déjà détruit et rien ne se passe).
      setTimeout(function() {
        try {
          var url = new URL(window.location.href);
          url.searchParams["delete"](URL_PARAM);
          // assign (pas replace) : le bouton Retour ramène à l'incognito.
          window.location.assign(url.toString());
        } catch (e) {
          window.location.href = window.location.pathname;
        }
      }, 100);
    }
  };

  if (!ACTIVE) return;

  // ── Actif : installation des shims ──────────
  console.warn(
    "%c🕵️ [IncognitoMode] ACTIF",
    "color:#a78bfa;font-weight:bold;font-size:13px;",
    "— localStorage + IndexedDB en mode in-memory. Aucune trace d'activité persistée (langue d'interface conservée)."
  );

  // 1. Marqueur CSS sur <html> (la racine : sélecteurs valables avant l'apparition de <body>).
  function _markDom() {
    try { document.documentElement.classList.add("kta-incognito"); } catch (_) {}
  }
  if (document.documentElement) {
    _markDom();
  } else {
    document.addEventListener("DOMContentLoaded", _markDom);
  }

  // 2. Shim Storage.prototype (localStorage et sessionStorage partagent le prototype).
  //    En mémoire plutôt que no-op : un module qui set("k","v") puis get("k") attend "v" (sinon faux négatifs
  //    partout). La Map disparaît avec le contexte JS au unload.
  try {
    var _memStorage = new Map();

    var _origStorage = {
      setItem:    Storage.prototype.setItem,
      getItem:    Storage.prototype.getItem,
      removeItem: Storage.prototype.removeItem,
      clear:      Storage.prototype.clear,
      key:        Storage.prototype.key
    };

    // Écriture disque (write-through) autorisée pour des préférences d'affichage NON sensibles seulement (la
    // langue survit au relancement, décision produit). À garder MINIMAL.
    var WRITE_DISK_WHITELIST = {
      "myktamap_app_lang": 1
    };

    Storage.prototype.setItem = function(k, v) {
      var key = String(k);
      _memStorage.set(key, String(v));
      // Pas d'appel à _origStorage.setItem (pas d'écriture disque), sauf préférences whitelistées.
      if (WRITE_DISK_WHITELIST[key]) {
        try { _origStorage.setItem.call(this, key, String(v)); } catch (e) {}
      }
    };

    // 🔒 Clés relues sur le DISQUE (les écritures restent en mémoire) : le déverrouillage de l'instance n'est pas
    // redemandé à chaque ouverture incognito, et le compteur d'échecs reste partagé (sinon brute-force par
    // boucle d'onglets).
    var READ_DISK_WHITELIST = {
      "myktamap_unlock_v1":          1, // UnlockGate — hash mdp community validé
      // Mémoire du déverrouillage par mot de passe d'INSTANCE : sans elle, `isUnlocked()` lit le hash accepté
      // (`myktamap_unlock_v1`) mais pas cette mémoire, son test `v && k && v === k` échoue et la gate se
      // réaffiche sur une instance à `accessHash`.
      "myktamap_unlock_instance_v1": 1, // UnlockGate — hash mdp d'instance validé
      "myktamap_unlock_attempts": 1, // UnlockGate — compteur tentatives échouées
      "myktamap_app_lang":        1  // langue d'interface :
      // Préférence d'affichage non sensible (lue au démarrage + write-through). Le thème, lui, est oublié.
    };

    Storage.prototype.getItem = function(k) {
      var key = String(k);
      // 1. Valeur écrite en mémoire : prioritaire.
      if (_memStorage.has(key)) return _memStorage.get(key);
      // 2. Clé whitelistée : disque réel.
      if (READ_DISK_WHITELIST[key]) {
        try {
          return _origStorage.getItem.call(this, key);
        } catch (e) { return null; }
      }
      // 3. Sinon null : on NE LIT PAS l'existant disque (sinon un module récupérerait l'historique et l'incognito
      //    ne serait qu'une demi-mesure). Le thème repart du défaut ; la langue est l'exception (whitelist).
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

    // `length` est un GETTER de Storage.prototype : defineProperty requis.
    Object.defineProperty(Storage.prototype, "length", {
      get: function() { return _memStorage.size; },
      configurable: true
    });

    // Exposé pour le debug (invisible dans DevTools sinon).
    window.IncognitoMode._memStorage = _memStorage;
    window.IncognitoMode._origStorage = _origStorage;
  } catch (e) {
    console.warn("🕵️ [IncognitoMode] Impossible de shim Storage :", e);
  }

  // 3. Shim des écritures IDBObjectStore.prototype (put/add/delete/clear). Lectures intactes (handles selfhost,
  //    photos existantes). Une écriture rend un faux IDBRequest qui RÉUSSIT tout de suite (les appelants attendent
  //    onsuccess).
  try {
    function _makeFakeIDBRequest(name) {
      // Objet assez proche d'IDBRequest pour `req.onsuccess = …` / `req.result` ; setTimeout 0 : événement
      // asynchrone comme l'API native.
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

  // 4. Badge « INCOGNITO » SOUS le sous-titre, sur sa propre ligne (accolé au titre, il déborde sur mobile), et
  //    préfixe du <title> de l'onglet (visible aussi en mode carte).
  //    Cibles : #splashBox (après #splashSubtitle), .loader-titre-textes (après .loader-titre-tagline),
  //    document.title.
  function _injecterBadgeTitre() {
    try {
      if (document.title && document.title.indexOf("🕵️") !== 0) {
        document.title = "🕵️ " + document.title;
      }
      function _makeBadge() {
        // Repli FR : le badge est injecté très tôt, window.I18n peut ne pas être prêt.
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
      var splashBox     = document.getElementById("splashBox");
      var splashSubtitle = document.getElementById("splashSubtitle");
      if (splashBox && splashSubtitle && !splashBox.querySelector(".kta-incognito-badge")) {
        splashSubtitle.insertAdjacentElement("afterend", _makeBadge());
      }
      document.querySelectorAll(".loader-titre-textes").forEach(function(container) {
        if (container.querySelector(".kta-incognito-badge")) return;
        var tagline = container.querySelector(".loader-titre-tagline");
        if (tagline) {
          tagline.insertAdjacentElement("afterend", _makeBadge());
        } else {
          // Pas de tagline : ajout en fin.
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
  // Nouvelle tentative tardive : loader et splash apparaissent souvent après le démarrage.
  setTimeout(_injecterBadgeTitre, 1500);
})();
