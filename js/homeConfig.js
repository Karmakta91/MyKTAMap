/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// HOMECONFIG.JS — modale Config ⚙️ + PIN + badges alertes/paranoïa + thème + réseau
// =========================
// Accueil : modale ⚙️ Configuration (réglages GLOBAUX : thème, capteurs, notifications, Carnet, aide…), code
// d'accès local (PIN), badge d'alerte, version du pied de page, pastille hors-ligne, 🆘 Dépannage, audit réseau.
// Expose : window._ouvrirLoaderConfig / _fermerLoaderConfig, ktaOuvrirDepannage.
// ⚠️ Chargé SANS defer et enveloppé dans window.addEventListener("load") : l'ordre d'enregistrement des
// listeners (homeLoader → homeProfile → homeConfig) est voulu. Ne pas réordonner.
// 🩸 Textes rendus au chargement : attendre I18n.init() avant de peindre, sinon la clé est « humanisée ».
// Garde-fous : check-prefs-survival.js, check-notifs.js, check-wakelock.js. Doc : docs/architecture/ui.md.
    window.addEventListener("load", function () {
      // ── Bouton ⚙️ Configuration ──────────
      const configBtn   = document.getElementById("loaderConfigBtn");
      const configModal = document.getElementById("loaderConfigModal");
      const configClose = document.getElementById("loaderConfigClose");
      function _ouvrirLoaderConfig() {
        if (configModal) configModal.style.display = "flex";
        // Rubriques repliables comme les Réglages du plan (même balisage, mémoire à part), liées une fois
        // (la fenêtre n'est jamais reconstruite).
        if (configModal && !configModal.dataset.groupesLies && typeof window.ktaGroupesRepliables === "function") {
          configModal.dataset.groupesLies = "1";
          window.ktaGroupesRepliables(configModal, "myktamap_home_cfg_groupes_v1");
        }
        // Bloc « Installation » en tête (ex. gestion des comptes pour un admin) : actions fournies par l'extension,
        // recalculées à chaque ouverture.
        if (configModal && window.KtaExtensions && typeof window.KtaExtensions.blocActionsCompte === "function") {
          const ancien = configModal.querySelector(".kta-ext-compte");
          if (ancien) ancien.remove();
          const corpsCfg = configModal.querySelector(".kta-loader-config-corps");
          const bloc = window.KtaExtensions.blocActionsCompte("config",
            window.I18n ? window.I18n.t("config.compteTitre") : "Installation");
          if (bloc && corpsCfg) corpsCfg.insertBefore(bloc, corpsCfg.firstChild);
        }
        // En mode carte (loader masqué), on réaffiche le loader : la modale a besoin de son contexte, sinon on
        // ferme et l'app reste en mode carte sans contexte.
        const loaderOverlay = document.getElementById("planLoaderOverlay");
        if (loaderOverlay && loaderOverlay.style.display === "none") {
          loaderOverlay.style.display = "flex";
        }
      }
      function _fermerLoaderConfig() {
        if (configModal) configModal.style.display = "none";
      }
      // Exposés pour les modules externes (pinLock.js…) qui ouvrent/ferment la modale.
      window._ouvrirLoaderConfig = _ouvrirLoaderConfig;
      window._fermerLoaderConfig = _fermerLoaderConfig;
      if (configBtn && configModal) {
        configBtn.addEventListener("click", _ouvrirLoaderConfig);
      }
      if (configClose) {
        configClose.addEventListener("click", _fermerLoaderConfig);
      }
      if (configModal) {
        configModal.addEventListener("click", function(e) {
          if (e.target === configModal) _fermerLoaderConfig();
        });
        document.addEventListener("keydown", function(e) {
          if (e.key === "Escape" && configModal.style.display !== "none" &&
              !document.getElementById("kta-depannage-modal")) {
            _fermerLoaderConfig();
          }
        });
      }

      // ── Bouton mode incognito ──────────
      // Libellé, icône, hint et classe selon window.IncognitoMode.active (Démarrer → launch(), Quitter → quit()),
      // remis à jour à chaque ouverture de la modale.
      (function _bindLoaderIncognito() {
        var btn   = document.getElementById("loaderIncognitoBtn");
        var icon  = document.getElementById("loaderIncognitoIcon");
        var label = document.getElementById("loaderIncognitoLabel");
        var hint  = document.getElementById("loaderIncognitoHint");
        if (!btn || !icon || !label || !hint) return;
        // Traduction avec repli FR inline si I18n manque (défensif, ne jamais planter).
        function _t(key, fr) {
          // Clé ABSENTE du dico chargé (dico en cache périmé) : le repli FR n'est correct QUE si la langue active
          // est le FR ; en EN/ES, I18n.t humanise (mieux que du français).
          if (window.I18n && typeof window.I18n.t === "function") {
            if (typeof window.I18n.has === "function" && window.I18n.has(key)) return window.I18n.t(key);
            if (typeof window.I18n.getLang === "function" && window.I18n.getLang() === "fr") return fr;
            return window.I18n.t(key);
          }
          return fr;
        }
        function _refresh() {
          var actif = !!(window.IncognitoMode && window.IncognitoMode.active);
          var indispo = !actif && !!(window.IncognitoMode && window.IncognitoMode.indisponible && window.IncognitoMode.indisponible());
          btn.disabled = indispo;
          btn.classList.toggle("kta-cfg-incognito-btn-indispo", indispo);
          if (indispo) {
            btn.classList.remove("kta-cfg-incognito-btn-quit");
            icon.textContent  = "🕵️";
            label.textContent = _t("home.privacy.incognitoRelieLabel", "Mode incognito indisponible ici");
            hint.textContent  = _t("home.privacy.incognitoRelieHint",
              "Cette installation est reliée à une base de données : ce que tu fais y est enregistré par le serveur.");
            return;
          }
          if (actif) {
            btn.classList.add("kta-cfg-incognito-btn-quit");
            icon.textContent  = "✕";
            label.textContent = _t("home.privacy.incognitoQuitLabel", "Quitter le mode incognito");
            hint.textContent  = _t("home.privacy.incognitoQuitHint",
              "Les points, le tracker et les notes de cette fenêtre seront perdus.");
          } else {
            btn.classList.remove("kta-cfg-incognito-btn-quit");
            icon.textContent  = "🕵️";
            label.textContent = _t("home.privacy.incognitoStartLabel", "Démarrer en mode incognito");
            // Le libellé suffit (le mode est décrit dans le Guide).
            hint.textContent  = "";
          }
        }
        // Rendu immédiat SEULEMENT si le dico est déjà là : rendre à vide humaniserait les clés et émettrait un
        // « [I18n] Clé manquante » (faux signal qui fait échouer le smoke).
        var _dicoPret = !(window.I18n && typeof window.I18n.has === "function") ||
                        window.I18n.has("home.privacy.incognitoStartLabel");
        if (_dicoPret) _refresh();
        // 🩸 BARRIÈRE I18n.init() : hors FR, le premier rendu tombe AVANT le dico (fr.json est chargé en premier)
        // et la clé technique s'afficherait (« Incognito Start Label »). `onChange` ne se déclenche qu'au
        // CHANGEMENT de langue, pas à l'arrivée du dico : sans barrière, ça ne se répare jamais. Même barrière
        // que `_majPinStatusUI`.
        if (window.I18n && typeof window.I18n.init === "function") {
          window.I18n.init().then(_refresh).catch(function () {});
        }
        // Re-rendu à chaque changement de langue.
        if (window.I18n && typeof window.I18n.onChange === "function") {
          window.I18n.onChange(_refresh);
        }
        // Rafraîchi à chaque ouverture (hook sur le helper exposé).
        var _origOuvrir = window._ouvrirLoaderConfig;
        if (typeof _origOuvrir === "function") {
          window._ouvrirLoaderConfig = function() {
            _origOuvrir.apply(this, arguments);
            _refresh();
          };
        }
        btn.addEventListener("click", function() {
          if (!window.IncognitoMode) {
            window.ktaAlerte(_t("home.incognito.indispo", "Module IncognitoMode indisponible. Recharge la page."));
            return;
          }
          if (window.IncognitoMode.active) {
            window.ktaConfirm(_t("config.incognito.confirmQuit", "Quitter le mode incognito ?")).then(function(ok) {
              if (ok) window.IncognitoMode.quit();
            });
          } else {
            // confirmAndLaunch() : modale de garde-fou (description, risques), annulable.
            _fermerLoaderConfig();
            window.IncognitoMode.confirmAndLaunch();
          }
        });
      })();

      // ── Bouton 🔔 Alerte en cours ──────────
      // Relit alert.json et affiche la modale d'alerte (même acquittée) ou « pas d'alerte ». L'auteur désactive
      // l'alerte en renommant alert.json en alert.lock (404 → « pas d'alerte »).
      const alertBtn = document.getElementById("loaderAlertBtn");
      if (alertBtn) {
        alertBtn.addEventListener("click", function() {
          if (window.AlertChecker && typeof window.AlertChecker.showCurrent === "function") {
            window.AlertChecker.showCurrent();
          } else {
            setStatus("Module Alerte indisponible", true);
          }
        });

        // Badge selon le niveau max + pastille compteur si > 1 ; AlertChecker notifie par onChange.
        function _majBadgeAlert() {
          if (!window.AlertChecker || typeof window.AlertChecker.getActiveAlerts !== "function") return;
          const actives = window.AlertChecker.getActiveAlerts() || [];
          const nonAcq = actives.filter(function(a) {
            if (!a.id || !a.released) return true;
            try {
              const seen = localStorage.getItem("myktamap_alert_seen_" + a.id);
              return !(seen && seen === a.released);
            } catch(e) { return true; }
          });
          alertBtn.classList.remove(
            "loader-btn-alert-emergency",
            "loader-btn-alert-warning",
            "loader-btn-alert-info",
            "loader-btn-alert-none"
          );
          // Niveau max parmi les non acquittées.
          let maxLevel = "none";
          for (var i = 0; i < nonAcq.length; i++) {
            const lvl = nonAcq[i].level;
            if (lvl === "emergency") { maxLevel = "emergency"; break; }
            if (lvl === "warning"  && maxLevel !== "emergency") maxLevel = "warning";
            else if (lvl === "info" && maxLevel === "none")     maxLevel = "info";
          }
          alertBtn.classList.add("loader-btn-alert-" + maxLevel);
          let counter = alertBtn.querySelector(".loader-btn-alert-counter");
          if (nonAcq.length > 1) {
            if (!counter) {
              counter = document.createElement("span");
              counter.className = "loader-btn-alert-counter";
              alertBtn.appendChild(counter);
            }
            counter.textContent = String(nonAcq.length);
          } else if (counter) {
            counter.remove();
          }
        }
        if (window.AlertChecker && typeof window.AlertChecker.onChange === "function") {
          window.AlertChecker.onChange(_majBadgeAlert);
        }
        // Premier rendu (le check a pu déjà avoir lieu).
        _majBadgeAlert();
      }

      // Pas de toggles Perf ULTRA ici : ces réglages sont PAR PLAN (⚙️ Réglages, plan ouvert).

      // ── Version dans le pied de page ──────────
      // Badge TOUJOURS cliquable : à jour → « Déjà à jour » + notes de la version installée ; mise à jour
      // disponible → « Mise à jour disponible » (douce / reset complet, sans snooze). Gris discret ou bleu
      // clignotant.
      (function _initFooterVersion() {
        const el = document.getElementById("loaderCopyrightVersion");
        if (!el) return;
        const installed = (window.__MKM__ && window.__MKM__.build) || "v?";

        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.onclick = function() {
          if (window.UpdateChecker && typeof window.UpdateChecker.showCurrent === "function") {
            window.UpdateChecker.showCurrent();
          }
        };
        el.addEventListener("keydown", function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            el.click();
          }
        });

        // État initial : version installée ; réévalué à l'arrivée de version.json. Infobulle calculée au SURVOL
        // (dicos prêts, langue courante) : ce code tourne avant les dicos.
        let _titreVer = { cle: "home.version.titre", v: installed };
        const _TITRE_FR = {
          "home.version.titre":    "Version installée : {v} — clique pour voir les notes ou vérifier les mises à jour",
          "home.version.titreMaj": "Nouvelle version disponible : {v} — clique pour mettre à jour",
          "home.version.titreAttente": "Mise à jour {v} acceptée, en cours d'installation — ferme complètement l'app puis rouvre-la"
        };
        function _tVer(k, p) {
          _titreVer = { cle: k, v: p.v };
          const I = window.I18n;
          if (I && typeof I.has === "function" && I.has(k)) return I.t(k, p);
          return _TITRE_FR[k].replace("{v}", p.v);
        }
        el.addEventListener("mouseenter", function() { el.title = _tVer(_titreVer.cle, { v: _titreVer.v }); });
        el.addEventListener("focus", function() { el.title = _tVer(_titreVer.cle, { v: _titreVer.v }); });
        el.textContent = installed;
        el.title = _tVer("home.version.titre", { v: installed });

        function _evaluerEtAfficher(remoteVersion) {
          const UC = window.UpdateChecker;
          const cmp = function (a, b) { return UC && typeof UC.compareSemver === "function" ? UC.compareSemver(a, b) : (a === b ? 0 : 1); };
          el.classList.remove("kta-loader-copyright-version-attente");
          if (!remoteVersion || cmp(remoteVersion, installed) <= 0) {
            // Pas de mise à jour (ou serveur plus ancien que le code chargé) : état normal.
            el.classList.remove("kta-loader-copyright-version-update");
            el.textContent = installed;
            el.title = _tVer("home.version.titre", { v: installed });
            return;
          }
          // 🩸 Mise à jour DÉJÀ acceptée mais ancien code encore chargé (iOS app installée, SW pas relayé) : ⏳ sans
          // clignoter, l'infobulle dit quoi faire, le clic propose de relancer (sinon on croit que la mise à jour
          // est redemandée à chaque ouverture).
          const acceptee = UC && typeof UC.getCurrentVersion === "function" ? UC.getCurrentVersion() : null;
          if (acceptee && cmp(acceptee, remoteVersion) >= 0) {
            el.classList.remove("kta-loader-copyright-version-update");
            el.classList.add("kta-loader-copyright-version-attente");
            el.textContent = installed + " ⏳";
            el.title = _tVer("home.version.titreAttente", { v: remoteVersion });
            return;
          }
          el.classList.add("kta-loader-copyright-version-update");
          el.textContent = installed + " → " + remoteVersion;
          el.title = _tVer("home.version.titreMaj", { v: remoteVersion });
        }

        // Évaluation initiale par le cache LS.
        try {
          const raw = localStorage.getItem("myktamap_last_version_data");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.version) _evaluerEtAfficher(parsed.version);
          }
        } catch(e) {}

        // Réévaluation après chaque check() de UpdateChecker (version serveur changée entre deux démarrages).
        if (window.UpdateChecker && typeof window.UpdateChecker.onCheck === "function") {
          window.UpdateChecker.onCheck(function(result) {
            if (result && result.remote && result.remote.version) {
              _evaluerEtAfficher(result.remote.version);
            }
          });
        }
      })();

      // ── Pastille « hors-ligne » ──────────
      // Point coloré à côté du badge de version (#loaderOfflineDot) : état du cache hors ligne, que
      // l'auto-réparation (SwInspector.autoHealIfNeeded, ~5 s après l'accueil) répare en silence.
      //   🟢 ok · 🔴 manquants (clic = tout récupérer) · 🟠 récupération en cours, ou manquants hors réseau ·
      //   ⚪ pas de service worker. Le rouge seul remonte dans l'en-tête (#loaderOfflineHdrBtn).
      // ⚠️ La pastille est À CÔTÉ du badge, jamais dedans (le badge réécrit son textContent). Vérifiée à
      // kta-sw-autoheal, au controllerchange et après un clic : aucune boucle ni minuterie. Accueil seulement.
      (function _initPastilleHorsLigne() {
        const dot = document.getElementById("loaderOfflineDot");
        const hdr = document.getElementById("loaderOfflineHdrBtn");
        if (!dot) return;
        const _t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
        const CLASSES = ["kta-offline-ok", "kta-offline-ko", "kta-offline-wait", "kta-offline-off"];
        let _dernier = null;        // dernier résultat de SwInspector.etat()
        let _enCours = false;       // récupération (auto ou clic) en cours
        let _progres = null;        // { faits, total } pendant un clic

        function _peindre() {
          // Dicos en rechargement (I18n.reload() au controllerchange) : pas de clé humanisée, onChange repeindra.
          if (window.I18n && typeof window.I18n.has === "function" && !window.I18n.has("home.offline.dot.ok")) return;
          const e = _dernier;
          let cls, titre;
          if (_enCours) {
            cls = "kta-offline-wait";
            titre = _progres
              ? _t("home.offline.progres", { n: _progres.faits, total: _progres.total })
              : _t("home.offline.dot.encours");
          } else if (!e || e.etat === "indisponible") {
            cls = "kta-offline-off";
            titre = _t(e && e.raison === "incognito" ? "home.offline.dot.incognito" : "home.offline.dot.sansSw");
          } else if (e.etat === "ok") {
            cls = "kta-offline-ok";
            titre = _t("home.offline.dot.ok", { v: e.version });
          } else if (navigator.onLine === false) {
            cls = "kta-offline-wait";
            titre = _t("home.offline.dot.horsReseau", { count: e.manquants });
          } else {
            cls = "kta-offline-ko";
            titre = _t("home.offline.dot.manquants", { count: e.manquants });
          }
          CLASSES.forEach(function(c) { dot.classList.remove(c); });
          dot.classList.add(cls);
          dot.title = titre;
          dot.setAttribute("aria-label", titre);
          dot.hidden = false;
          if (hdr) {
            const rouge = cls === "kta-offline-ko";
            hdr.hidden = !rouge;
            if (rouge) {
              hdr.title = titre;
              hdr.setAttribute("aria-label", titre);
            }
          }
        }

        function _verifier() {
          if (!window.SwInspector || typeof window.SwInspector.etat !== "function") return Promise.resolve();
          // Titres traduits au rendu : on attend les dicos (un controllerchange du 1er chargement peut les devancer).
          const dicos = (window.I18n && typeof window.I18n.init === "function") ? window.I18n.init() : null;
          return Promise.all([window.SwInspector.etat(), dicos]).then(function(r) {
            _dernier = r[0];
            _peindre();
          });
        }

        // Message court au-dessus de tout (les toasts d'OOMGuard attendent la fin du splash et « info » est tu
        // par défaut : pas adaptés ici).
        let _msgTimer = null;
        function _message(texte, cls, garder) {
          let m = document.getElementById("kta-offline-msg");
          if (!m) {
            m = document.createElement("div");
            m.id = "kta-offline-msg";
            m.className = "kta-offline-msg";
            m.setAttribute("role", "status");
            m.setAttribute("aria-live", "polite");
            m.addEventListener("click", function() { m.hidden = true; });
            document.body.appendChild(m);
          }
          m.textContent = texte;
          m.classList.remove("kta-offline-msg-ok", "kta-offline-msg-ko");
          if (cls) m.classList.add(cls);
          m.hidden = false;
          clearTimeout(_msgTimer);
          _msgTimer = null;
          if (!garder) _msgTimer = setTimeout(function() { m.hidden = true; }, 6000);
        }

        function _recuperer() {
          if (_enCours || !window.SwInspector || typeof window.SwInspector.recuperer !== "function") return;
          _enCours = true;
          _progres = null;
          _peindre();
          window.SwInspector.recuperer(function(faits, total) {
            _progres = { faits: faits, total: total };
            _peindre();
            _message(_t("home.offline.progres", { n: faits, total: total }), null, true);
          }).then(function(r) {
            _enCours = false;
            _progres = null;
            if (r.echecs > 0) {
              _message(_t("home.offline.msg.echecs", { count: r.echecs }), "kta-offline-msg-ko");
            } else {
              _message(_t("home.offline.msg.ok"), "kta-offline-msg-ok");
            }
            return _verifier();
          }).catch(function(err) {
            console.warn("[HomeConfig] récupération hors-ligne :", err && err.message);
            _enCours = false;
            _progres = null;
            _message(_t("home.offline.msg.erreur"), "kta-offline-msg-ko");
            return _verifier();
          });
        }

        function _clic() {
          const e = _dernier;
          if (_enCours) {
            _message(_t("home.offline.dot.encours"));
          } else if (!e || e.etat === "indisponible") {
            _message(dot.title);
          } else if (e.etat === "ok") {
            // Vert : comportement du badge de version.
            const ver = document.getElementById("loaderCopyrightVersion");
            if (ver) ver.click();
          } else if (navigator.onLine === false) {
            _message(dot.title);
          } else {
            _recuperer();
          }
        }

        dot.addEventListener("click", _clic);
        if (hdr) hdr.addEventListener("click", _recuperer);

        window.addEventListener("kta-sw-autoheal", function(ev) {
          const d = ev.detail || {};
          if (d.phase === "debut") {
            _enCours = true;
            _peindre();
            return;
          }
          _enCours = false;
          _verifier();
        });
        if (navigator.serviceWorker) {
          navigator.serviceWorker.addEventListener("controllerchange", function() { _verifier(); });
        }
        if (window.I18n && typeof window.I18n.onChange === "function") {
          window.I18n.onChange(function() { if (_dernier || _enCours) _peindre(); });
        }
        // Réseau qui revient ou tombe : on repeint seulement (le cache n'a pas changé).
        window.addEventListener("online", function() { if (_dernier) _peindre(); });
        window.addEventListener("offline", function() { if (_dernier) _peindre(); });
      })();


      // ── Dépannage ──────────
      // Un seul bouton « 🆘 Dépannage » range les trois outils du plus doux au plus radical (confirmations
      // comprises).

      // Tout réinitialiser : double confirmation portée par viderCacheAppli (js/interfaceMaintenance.js).
      function _depannageReset() {
        if (typeof window.viderCacheAppli === "function") {
          window.viderCacheAppli();
        } else {
          setStatus(window.I18n ? window.I18n.t("home.reset.indispo") : "Fonction de réinitialisation indisponible", true);
        }
      }

      // Forcer la mise à jour (« reset lite ») : purge du cache SW + reload, TOUTES les données gardées.
      // Confirmation par js/loaderSwModals.js ; le ping internet vit dans mettreAJourCodeSeul()
      // (_softUpdateOfflineWarning si hors ligne).
      function _depannageForceUpdate() {
        _afficherConfirmForceUpdate().then(function(ok) {
          if (!ok) return;
          if (typeof window.mettreAJourCodeSeul === "function") {
            window.mettreAJourCodeSeul();
          } else {
            setStatus(window.I18n ? window.I18n.t("home.maj.indispo") : "Fonction de mise à jour indisponible", true);
          }
        });
      }

      // Kill SW (killsw.html), double garde-fou : 1. ping Internet AVANT la modale (refus hors ligne ou serveur
      // KO : les assets seront retéléchargés) ; 2. confirmation (js/loaderSwModals.js).
      async function _depannageKillSw() {
        // Overlay « Vérification… » pendant le ping (5 s max), sinon rien ne se passe à l'écran.
        const waitOverlay = document.createElement("div");
        waitOverlay.className = "kta-modal-overlay";
        waitOverlay.style.cssText = "z-index:100050;";  // au-dessus de la modale Config
        waitOverlay.innerHTML =
          '<div class="kta-modal" style="max-width:340px;">' +
            '<div class="kta-modal-icon" style="font-size:32px;">⏳</div>' +
            '<div class="kta-modal-titre">' + (window.I18n ? window.I18n.t("home.connexion.titre") : "Vérification de la connexion…") + '</div>' +
            '<div class="kta-modal-texte kta-tx-muted" style="font-size:13px;">' + (window.I18n ? window.I18n.t("home.connexion.texte") : "") + '</div>' +
          '</div>';
        document.documentElement.appendChild(waitOverlay);

        // 1. Ping Internet ; _pingInternet pas encore exposé → navigator.onLine.
        let online;
        try {
          if (typeof window._pingInternet === "function") {
            online = await window._pingInternet();
          } else {
            online = (typeof navigator !== "undefined") ? navigator.onLine : true;
          }
        } catch(e) { online = false; }

        try { waitOverlay.remove(); } catch(e) {}

        if (!online) {
          _afficherKillSwOfflineRefus();
          return;
        }
        // 2. Confirmation utilisateur.
        _afficherConfirmKillSw().then(function(ok) {
          if (!ok) return;
          window.location.href = "killsw.html";
        });
      }

      // Fenêtre Dépannage, construite à chaque ouverture (le MutationObserver de js/interfaceDocs.js y pose le ❓).
      // Empilée au-dessus de ⚙️ Configuration (même z-index, ajoutée après) et SOUS les confirmations : à
      // l'annulation, on y revient.
      function _fermerDepannage() {
        const m = document.getElementById("kta-depannage-modal");
        if (m) m.remove();
        window.removeEventListener("keydown", _depannageOnKey, true);
      }
      // Échap ne ferme la fenêtre que si elle est AU PREMIER PLAN (sinon c'est la confirmation ou l'aide qui part).
      // Capture + stopPropagation : sinon l'Échap de ⚙️ Configuration fermerait aussi la fenêtre parente.
      function _depannageOnKey(e) {
        if (e.key !== "Escape") return;
        const m = document.getElementById("kta-depannage-modal");
        if (!m) return;
        for (let n = m.nextElementSibling; n; n = n.nextElementSibling) {
          if (/overlay|submodal/.test(n.className || "") && n.style.display !== "none") return;
        }
        e.stopPropagation();
        _fermerDepannage();
      }
      function _ouvrirDepannage() {
        _fermerDepannage();
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const _esc = window.ktaEsc;
        // Page de secours relative à l'origine (dev, prod, selfhost).
        let urlSecours = "killsw.html";
        try { urlSecours = new URL("killsw.html", window.location.href).href; } catch(e) {}

        const overlay = document.createElement("div");
        overlay.id = "kta-depannage-modal";
        overlay.className = "kta-readme-modal-overlay";
        overlay.style.display = "flex";
        overlay.innerHTML =
          '<div class="kta-readme-modal-boite kta-depannage-boite">' +
            '<div class="kta-readme-modal-header">' +
              '<span class="kta-readme-modal-titre">' + _t("home.cfg.depannage.title") + '</span>' +
              '<button class="kta-panneau-close" type="button" id="kta-depannage-close">✕</button>' +
            '</div>' +
            '<div class="kta-readme-modal-corps kta-depannage-corps">' +
              '<div class="kta-depannage-item">' +
                '<p class="kta-loader-perf-hint">' + _t("home.cfg.depannage.updateWhen") + '</p>' +
                '<button class="loader-btn-secondary" type="button" id="loaderForceUpdateBtn">' +
                  _t("home.cfg.forceUpdateBtn") + '</button>' +
              '</div>' +
              '<div class="kta-depannage-item">' +
                '<p class="kta-loader-perf-hint">' + _t("home.cfg.depannage.killSwWhen") + '</p>' +
                '<button class="loader-btn-secondary" type="button" id="loaderKillSwBtn">' +
                  _t("home.cfg.killSwBtn") + '</button>' +
              '</div>' +
              '<div class="kta-depannage-item">' +
                '<p class="kta-loader-perf-hint">' + _t("home.cfg.depannage.resetWhen") + '</p>' +
                '<button class="loader-btn-secondary loader-btn-danger" type="button" id="loaderResetBtn">' +
                  _t("home.cfg.resetBtn") + '</button>' +
              '</div>' +
              '<p class="kta-depannage-secours kta-tx-muted">' + _t("home.cfg.depannage.killswPage") +
                ' <code>' + _esc(urlSecours) + '</code></p>' +
            '</div>' +
          '</div>';
        document.documentElement.appendChild(overlay);

        overlay.addEventListener("click", function(e) {
          if (e.target === overlay) _fermerDepannage();
        });
        document.getElementById("kta-depannage-close").addEventListener("click", _fermerDepannage);
        document.getElementById("loaderForceUpdateBtn").addEventListener("click", _depannageForceUpdate);
        document.getElementById("loaderKillSwBtn").addEventListener("click", _depannageKillSw);
        document.getElementById("loaderResetBtn").addEventListener("click", _depannageReset);
        window.addEventListener("keydown", _depannageOnKey, true);
      }

      const depannageBtn = document.getElementById("loaderDepannageBtn");
      if (depannageBtn) depannageBtn.addEventListener("click", _ouvrirDepannage);
      // Point d'extension neutre : un écran qui précède l'accueil (gate d'une extension de connexion) peut ouvrir
      // le même Dépannage. Fenêtre ajoutée à <html> (id kta-depannage-modal), z-index 99999.
      window.ktaOuvrirDepannage = _ouvrirDepannage;

      // ── Code d'accès local (PIN / biométrie, optionnel) ──────────
      // État + activation / modification / désactivation ; le moteur (hash, WebAuthn, temporisation, gate) est
      // dans js/pinLock.js. Accueil seulement : les Réglages du plan n'exposent pas cette section.
      function _majPinStatusUI() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const iconEl    = document.getElementById("loaderPinStatusIcon");
        const textEl    = document.getElementById("loaderPinStatusText");
        const actionsEl = document.getElementById("loaderPinActions");
        if (!iconEl || !textEl || !actionsEl) return;

        if (!window.MyKTAMapPinLock) {
          iconEl.textContent = "⚠️";
          textEl.textContent = _t("pin.setup.moduleUnavailable");
          actionsEl.innerHTML = "";
          return;
        }

        const enabled = window.MyKTAMapPinLock.isEnabled();
        const hasBio  = window.MyKTAMapPinLock.hasBiometric();

        if (enabled) {
          iconEl.textContent = "✅";
          iconEl.style.color = "#6ee287";
          textEl.innerHTML = _t("pin.setup.statusEnabled") + (hasBio ? _t("pin.setup.statusBioConfigured") : "");
          actionsEl.innerHTML =
            '<button class="loader-btn-secondary kta-loader-pin-btn-modif" type="button" id="loaderPinModifBtn">' +
              _t("pin.setup.changeBtn") +
            '</button>' +
            '<button class="loader-btn-secondary loader-btn-danger" type="button" id="loaderPinDisableBtn">' +
              _t("pin.setup.disableBtn") +
            '</button>';
          document.getElementById("loaderPinModifBtn").addEventListener("click", _lancerModificationPin);
          document.getElementById("loaderPinDisableBtn").addEventListener("click", _lancerDesactivationPin);
        } else {
          iconEl.textContent = "○";
          iconEl.style.color = "var(--kta-texte-3)";
          textEl.innerHTML = _t("pin.setup.statusDisabled");
          actionsEl.innerHTML =
            '<button class="loader-btn-secondary" type="button" id="loaderPinEnableBtn" style="background:rgba(244,197,66,0.15); border-color:rgba(244,197,66,0.4); color:var(--kta-accent-texte);">' +
              _t("pin.setup.enableBtn") +
            '</button>';
          document.getElementById("loaderPinEnableBtn").addEventListener("click", _lancerActivationPin);
        }
      }

      // Demande un PIN par une modale charte. Rend Promise<string|null> (null = annulé).
      function _demanderPin(titre, message, confirmLabel) {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        return new Promise(function(resolve) {
          const overlay = document.createElement("div");
          overlay.className = "kta-modal-overlay";
          overlay.innerHTML =
            '<div class="kta-modal" style="max-width:380px;">' +
              '<div class="kta-modal-icon">🔐</div>' +
              '<div class="kta-modal-titre">' + titre + '</div>' +
              '<div class="kta-modal-texte">' + message + '</div>' +
              '<input type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" ' +
                'maxlength="6" id="ktaPinPromptInput" ' +
                'style="display:block; width:100%; margin:14px 0 6px; padding:12px; font-size:22px; ' +
                'text-align:center; letter-spacing:8px; background:var(--kta-fond); border:2px solid rgba(244,197,66,0.3); ' +
                'border-radius:8px; color:var(--kta-accent-texte); font-family:monospace; box-sizing:border-box;" placeholder="••••">' +
              '<div class="kta-modal-actions" style="margin-top:10px;">' +
                '<button class="kta-btn kta-btn-ghost"   id="ktaPinPromptCancel">' + _t("pin.setup.cancel") + '</button>' +
                '<button class="kta-btn kta-btn-primary" id="ktaPinPromptOk">' + (confirmLabel || _t("pin.setup.validate")) + '</button>' +
              '</div>' +
            '</div>';
          document.documentElement.appendChild(overlay);
          const input  = document.getElementById("ktaPinPromptInput");
          const okBtn  = document.getElementById("ktaPinPromptOk");
          const cancel = document.getElementById("ktaPinPromptCancel");
          setTimeout(function() { if (input) input.focus(); }, 50);
          function _close(val) {
            overlay.remove();
            document.removeEventListener("keydown", _onKey);
            resolve(val);
          }
          function _onKey(e) {
            if (e.key === "Escape") { e.preventDefault(); _close(null); }
            else if (e.key === "Enter") { e.preventDefault(); _close(input.value); }
          }
          document.addEventListener("keydown", _onKey);
          okBtn.addEventListener("click", function() { _close(input.value); });
          cancel.addEventListener("click", function() { _close(null); });
          input.addEventListener("input", function() {
            input.value = input.value.replace(/[^0-9]/g, "").slice(0, 6);
          });
        });
      }

      // Question Oui/Non charte (au lieu de « OK/Annuler »). Rend true = oui, false = non (Échap, fond, Non).
      function _demanderOuiNon(titre, message, ouiLabel, nonLabel, icon) {
        return new Promise(function(resolve) {
          const overlay = document.createElement("div");
          overlay.className = "kta-modal-overlay";
          overlay.innerHTML =
            '<div class="kta-modal" style="max-width:420px;">' +
              '<div class="kta-modal-icon">' + (icon || "❓") + '</div>' +
              '<div class="kta-modal-titre">' + titre + '</div>' +
              '<div class="kta-modal-texte">' + message + '</div>' +
              '<div class="kta-modal-actions" style="margin-top:14px;">' +
                '<button class="kta-btn kta-btn-ghost"   id="ktaYesNoCancel">' + (nonLabel || "Non") + '</button>' +
                '<button class="kta-btn kta-btn-primary" id="ktaYesNoOk">'    + (ouiLabel || "Oui") + '</button>' +
              '</div>' +
            '</div>';
          document.documentElement.appendChild(overlay);
          function _close(val) {
            overlay.remove();
            document.removeEventListener("keydown", _onKey);
            resolve(val);
          }
          function _onKey(e) {
            if (e.key === "Escape") { e.preventDefault(); _close(false); }
            else if (e.key === "Enter") { e.preventDefault(); _close(true); }
          }
          document.addEventListener("keydown", _onKey);
          document.getElementById("ktaYesNoOk").addEventListener("click", function() { _close(true); });
          document.getElementById("ktaYesNoCancel").addEventListener("click", function() { _close(false); });
          overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(false); });
        });
      }

      async function _lancerActivationPin() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const pin1 = await _demanderPin(
          _t("pin.setup.defineTitle"),
          _t("pin.setup.defineBody"),
          _t("pin.setup.next")
        );
        if (!pin1) return;
        // Validation basique côté UI (le moteur revalide).
        if (!/^\d{4,6}$/.test(pin1)) {
          await window.ktaAlerte(_t("pin.setup.errLength"), { type: "erreur" });
          return;
        }
        const pin2 = await _demanderPin(
          _t("pin.setup.confirmTitle"),
          _t("pin.setup.confirmBody"),
          _t("pin.setup.confirm")
        );
        if (!pin2) return;
        if (pin1 !== pin2) {
          await window.ktaAlerte(_t("pin.setup.errMismatchRetry"), { type: "erreur" });
          return;
        }

        // Biométrie disponible ? (question Oui/Non).
        let useBio = false;
        try {
          const bioSupported = await window.MyKTAMapPinLock.isBiometricSupported();
          if (bioSupported) {
            useBio = await _demanderOuiNon(
              _t("pin.setup.bioAskTitle"),
              _t("pin.setup.bioAskBody"),
              _t("pin.setup.bioYes"), _t("pin.setup.bioNo"), "🤳"
            );
          }
        } catch(e) {
          console.warn("[PinSetup] check biométrie :", e);
        }

        try {
          await window.MyKTAMapPinLock.enable(pin1, useBio);
          await window.ktaAlerte(_t("pin.setup.okEnabled") + (useBio ? _t("pin.setup.okBioConfigured") : ""));
        } catch(e) {
          if (e && e.pinActivatedWithoutBiometric) {
            // Partiel : PIN OK, biométrie échouée.
            await window.ktaAlerte(_t("pin.setup.okEnabledBioFailed") + e.message);
          } else {
            console.error("[PinSetup] enable :", e);
            await window.ktaAlerte(_t("pin.setup.errEnable") + (e.message || e), { type: "erreur" });
            return;
          }
        }
        _majPinStatusUI();
      }

      // Modification : biométrie OU ancien PIN, puis nouveau PIN.
      async function _lancerModificationPin() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        // Identité : biométrie d'abord si disponible, sinon PIN.
        let unlocked = false;
        if (window.MyKTAMapPinLock.hasBiometric()) {
          try {
            unlocked = await window.MyKTAMapPinLock.unlockWithBiometric();
          } catch(e) {
            console.warn("[PinSetup] biométrie :", e);
          }
        }
        if (!unlocked) {
          const oldPin = await _demanderPin(
            _t("pin.setup.changeTitle"),
            _t("pin.setup.changeOldBody"),
            _t("pin.setup.verify")
          );
          if (!oldPin) return;
          try {
            unlocked = await window.MyKTAMapPinLock.unlock(oldPin);
          } catch(e) {
            await window.ktaAlerte("❌ " + (e.message || e), { type: "erreur" });
            return;
          }
          if (!unlocked) {
            const remaining = window.MyKTAMapPinLock.getRemainingAttempts();
            await window.ktaAlerte(_t("pin.setup.errWrongCode", { n: remaining }), { type: "erreur" });
            return;
          }
        }

        // Nouveau code saisi 2 fois.
        const newPin1 = await _demanderPin(
          _t("pin.setup.newTitle"),
          _t("pin.setup.newBody"),
          _t("pin.setup.next")
        );
        if (!newPin1) return;
        if (!/^\d{4,6}$/.test(newPin1)) {
          await window.ktaAlerte(_t("pin.setup.errLength"), { type: "erreur" });
          return;
        }
        const newPin2 = await _demanderPin(
          _t("pin.setup.newConfirmTitle"),
          _t("pin.setup.newConfirmBody"),
          _t("pin.setup.confirm")
        );
        if (!newPin2) return;
        if (newPin1 !== newPin2) {
          await window.ktaAlerte(_t("pin.setup.errMismatch"), { type: "erreur" });
          return;
        }

        try {
          await window.MyKTAMapPinLock.changePin(newPin1);
          await window.ktaAlerte(_t("pin.setup.okChanged"));
        } catch(e) {
          console.error("[PinSetup] changePin :", e);
          await window.ktaAlerte(_t("pin.setup.errGeneric") + (e.message || e), { type: "erreur" });
          return;
        }
        _majPinStatusUI();
      }

      async function _lancerDesactivationPin() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const okDesact = await _demanderOuiNon(
          _t("pin.setup.disableAskTitle"),
          _t("pin.setup.disableAskBody"),
          _t("pin.setup.disableYes"), _t("pin.setup.disableNo"),
          "🔓"
        );
        if (!okDesact) return;

        // Identité (biométrie ou PIN).
        let unlocked = false;
        if (window.MyKTAMapPinLock.hasBiometric()) {
          try {
            unlocked = await window.MyKTAMapPinLock.unlockWithBiometric();
          } catch(e) { console.warn("[PinSetup] biométrie :", e); }
        }
        if (!unlocked) {
          const pin = await _demanderPin(
            _t("pin.setup.disableTitle"),
            _t("pin.setup.disableBody"),
            _t("pin.setup.disable")
          );
          if (!pin) return;
          try {
            await window.MyKTAMapPinLock.disable(pin);
            await window.ktaAlerte(_t("pin.setup.okDisabled"));
            _majPinStatusUI();
            return;
          } catch(e) {
            console.error("[PinSetup] disable :", e);
            await window.ktaAlerte("❌ " + (e.message || e), { type: "erreur" });
            return;
          }
        }

        // Déverrouillé par biométrie : reset() direct (disable() revérifierait le PIN).
        // 🔒 Acceptable : la biométrie EST la preuve d'identité.
        window.MyKTAMapPinLock.reset();
        await window.ktaAlerte(_t("pin.setup.okDisabledBio"));
        _majPinStatusUI();
      }

      // Init à l'ouverture de la modale, derrière la barrière I18n.init() (sinon statut « humanisé »).
      if (window.I18n && typeof window.I18n.init === "function") {
        window.I18n.init().then(_majPinStatusUI);
      } else {
        _majPinStatusUI();
      }

      // Section PIN retraduite À CHAUD au changement de langue : rendue par _t() inline, pas par data-i18n
      // (non captée par _applyI18nDom). Abonnement UNIQUE (garde anti-double).
      if (window.I18n && window.I18n.onChange && !window._pinStatusI18nHooked) {
        window._pinStatusI18nHooked = true;
        window.I18n.onChange(_majPinStatusUI);
      }

      // ── Bouton « Afficher les logs » ──────────
      // Le buffer de debug.js sans charger de plan (bug bloquant au chargement → rapport quand même), via
      // window.afficherLogsDebug. Même z-index que Configuration : la modale Logs, ajoutée APRÈS, passe
      // au-dessus ; à sa fermeture, Configuration est toujours là.
      const showLogsBtn = document.getElementById("loaderShowLogsBtn");
      if (showLogsBtn) {
        showLogsBtn.addEventListener("click", function() {
          if (typeof window.afficherLogsDebug === "function") {
            window.afficherLogsDebug();
          } else {
            setStatus("Fonction de logs indisponible", true);
          }
        });
      }

      // Section Debug = MODE DÉVELOPPEUR (mot de passe + logs + bibliothèque docs), peuplée par devMode.js.
      if (window.DevMode && typeof window.DevMode.initSection === "function") {
        window.DevMode.initSection();
      }

      // Inspecteur mémoire (js/memInspector.js) : localStorage / IndexedDB / Cache PWA / estimate / runtime.
      // Ajouté après, il passe au-dessus de Configuration.
      const memInspectBtn = document.getElementById("loaderMemInspectorBtn");
      if (memInspectBtn) {
        memInspectBtn.addEventListener("click", function() {
          if (window.MemInspector && typeof window.MemInspector.ouvrir === "function") {
            window.MemInspector.ouvrir();
          } else {
            setStatus("Module MemInspector indisponible — recharge la page", true);
          }
        });
      }

      // L'inspecteur Service Worker (#loaderSwInspectorBtn) est rendu par js/devMode.js (mode développeur).

      // Auto-réparation silencieuse du cache SW ~5 s après le démarrage (le SW finit son install). Garde-fous
      // internes : en ligne, SW prêt, pas incognito, 1× par session, 100 fetches max. Son résultat
      // (kta-sw-autoheal) repeint la pastille hors-ligne (cf. _initPastilleHorsLigne).
      setTimeout(function() {
        if (window.SwInspector && typeof window.SwInspector.autoHealIfNeeded === "function") {
          window.SwInspector.autoHealIfNeeded();
        }
      }, 5000);

      // ── Affichage ──────────

      // Ronds aux intersections : réglage PAR PLAN (config.js > getPlanShowsIntersections), pas ici.


      // Thème CLAIR / SOMBRE, seulement ici (global, "myktamap_theme_v1").
      // 🩸 Le changement RECHARGE l'app (ThemeManager.setThemeAndReload) : le basculement à chaud laissait des
      // restes sur le bandeau et les modales déjà chargées. Confirmation par une modale charte (Échap = annuler,
      // Entrée = confirmer).
      function _confirmThemeSwitch(cible) {
        return new Promise(function(resolve) {
          const old = document.getElementById("kta-theme-confirm-modal");
          if (old) old.remove();

          const cibleIcone   = (cible === "light") ? "☀️" : "🌙";
          const cibleColor   = (cible === "light") ? "#f4c542" : "#8cb4ff";
          // Textes résolus au RENDU. I18n.t n'utilise pas `this` : référence directe possible ; repli = clé brute.
          const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){ return k; };
          const cibleLibelle = _t(cible === "light" ? "theme.name.light" : "theme.name.dark");
          const cibleSpan    = '<strong style="color:' + cibleColor + ';">' + cibleLibelle + '</strong>';

          const modal = document.createElement("div");
          modal.id = "kta-theme-confirm-modal";
          modal.className = "kta-readme-modal-overlay kta-theme-confirm-overlay";
          modal.innerHTML =
            '<div class="kta-readme-modal-boite kta-theme-confirm-boite">' +
              '<div class="kta-readme-modal-header">' +
                '<span class="kta-readme-modal-titre">' + cibleIcone + ' ' + _t("theme.confirm.title", { target: cibleLibelle }) + '</span>' +
                '<button class="kta-panneau-close" id="kta-theme-confirm-close" type="button" aria-label="' + _t("theme.confirm.cancel") + '">✕</button>' +
              '</div>' +
              '<div class="kta-readme-modal-corps kta-theme-confirm-corps">' +
                '<div class="kta-theme-confirm-icone" style="color:' + cibleColor + ';">' + cibleIcone + '</div>' +
                '<p class="kta-theme-confirm-msg">' +
                  _t("theme.confirm.msg", { target: cibleSpan }) +
                '</p>' +
                '<p class="kta-theme-confirm-hint">' +
                  '<em>' + _t("theme.confirm.hint") + '</em>' +
                '</p>' +
              '</div>' +
              '<div class="kta-theme-confirm-actions">' +
                '<button class="kta-btn kta-btn-ghost" id="kta-theme-confirm-cancel" type="button">' + _t("theme.confirm.cancel") + '</button>' +
                '<button class="kta-btn kta-btn-primary kta-theme-confirm-ok" id="kta-theme-confirm-ok" type="button">' +
                  cibleIcone + ' ' + _t("theme.confirm.ok") +
                '</button>' +
              '</div>' +
            '</div>';
          document.documentElement.appendChild(modal);

          function _close(value) {
            modal.remove();
            document.removeEventListener("keydown", _onKey);
            resolve(value);
          }
          function _onKey(e) {
            if (e.key === "Escape") _close(false);
            else if (e.key === "Enter") _close(true);
          }
          document.getElementById("kta-theme-confirm-close").addEventListener("click", function() { _close(false); });
          document.getElementById("kta-theme-confirm-cancel").addEventListener("click", function() { _close(false); });
          document.getElementById("kta-theme-confirm-ok").addEventListener("click", function() { _close(true); });
          modal.addEventListener("click", function(e) { if (e.target === modal) _close(false); });
          document.addEventListener("keydown", _onKey);

          // Focus sur « Activer et relancer » (Entrée directe).
          setTimeout(function() {
            const okBtn = document.getElementById("kta-theme-confirm-ok");
            if (okBtn) okBtn.focus();
          }, 50);
        });
      }

      const themeLightCb = document.getElementById("loaderThemeLightCb");
      if (themeLightCb && window.ThemeManager) {
        try { themeLightCb.checked = window.ThemeManager.isLight(); } catch(e) {}
        themeLightCb.addEventListener("change", function() {
          const cible = themeLightCb.checked ? "light" : "dark";
          _confirmThemeSwitch(cible).then(function(ok) {
            if (!ok) {
              // Retour visuel : la case reprend son état.
              themeLightCb.checked = !themeLightCb.checked;
              return;
            }
            window.ThemeManager.setThemeAndReload(cible);
          });
        });
      }

      // Wake Lock ici aussi : même window.WakeLock que ⚙️ Réglages du plan, état synchronisé.
      // Réglages GLOBAUX écrits par le chemin CANONIQUE, celui que `check-prefs-survival.js` inspecte (une
      // préférence sauvegardée doit être relue au chargement d'un plan).
      (function _initReglagesGlobaux() {
        const cases = [
          ["loaderScaledMarkers",  "scaledMarkers",  true, "ktaMajTailleIconesOsm"],  // ON → `!== false`
          ["loaderPanneauxAncres", "panneauxAncres", false],  // défaut OFF → test `=== true`
          ["loaderSnapDraw",       "snapDraw",       false],
          ["loaderZoomBoutons",    "zoomBoutons",    false, "ktaBoutonsZoomPartout"]  // appliqué à chaud
        ];
        cases.forEach(function (row) {
          const el = document.getElementById(row[0]);
          if (!el) return;
          const cfg = window.APP_CONFIG || {};
          // 🩸 L'idiome DÉPEND du défaut : `!== false` pour un défaut ON, `=== true` pour un défaut OFF. Les
          // confondre allume ou éteint l'option pour tout le monde au premier lancement.
          el.checked = row[2] ? (cfg[row[1]] !== false) : (cfg[row[1]] === true);
          el.addEventListener("change", function () {
            if (!window.APP_CONFIG) window.APP_CONFIG = {};
            window.APP_CONFIG[row[1]] = !!el.checked;
            if (typeof window.sauvegarderPrefsUtilisateur === "function") {
              window.sauvegarderPrefsUtilisateur();
            }
            if (row[3] && typeof window[row[3]] === "function") window[row[3]]();
          });
        });
        const px = document.getElementById("loaderSnapDrawPx");
        if (px) {
          const cfg = window.APP_CONFIG || {};
          px.value = Number.isFinite(Number(cfg.snapDrawPx)) ? Number(cfg.snapDrawPx) : 14;
          px.addEventListener("change", function () {
            const v = parseFloat(px.value);
            // Hors bornes = saisie fautive : on remet la valeur en place au lieu d'écrire n'importe quoi.
            if (!Number.isFinite(v) || v < 4 || v > 40) {
              px.value = (window.APP_CONFIG && window.APP_CONFIG.snapDrawPx) || 14;
              return;
            }
            if (!window.APP_CONFIG) window.APP_CONFIG = {};
            window.APP_CONFIG.snapDrawPx = v;
            if (typeof window.sauvegarderPrefsUtilisateur === "function") {
              window.sauvegarderPrefsUtilisateur();
            }
          });
        }
      })();

      // Aide contextuelle : le ❓ des modales se coupe ici, effet IMMÉDIAT sur les modales ouvertes (sinon la case
      // passe pour inerte).
      (function _initAideCtxHome() {
        const cb = document.getElementById("loaderAideCtxCb");
        if (!cb) return;
        cb.checked = (typeof window.ktaAideContextuelleActive === "function")
          ? window.ktaAideContextuelleActive() : true;
        cb.addEventListener("change", function () {
          try { localStorage.setItem("myktamap_aide_contextuelle", cb.checked ? "1" : "0"); } catch (e) {}
          if (typeof window.ktaAideContextuelleRefresh === "function") window.ktaAideContextuelleRefresh();
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(window.I18n.t(cb.checked ? "config.aidectx.toastOn" : "config.aidectx.toastOff"), "info");
          }
        });
      })();

      // Mémoriser le plan dans l'app au premier chargement : source de vérité `window.ktaMemoriserPlanActif()`
      // (homeLoader) ; on écrit la même clé, jamais une copie de l'état.
      (function _initMemoriserHome() {
        const cb = document.getElementById("loaderMemoriserCb");
        if (!cb) return;
        cb.checked = (typeof window.ktaMemoriserPlanActif === "function") ? window.ktaMemoriserPlanActif() : true;
        cb.addEventListener("change", function () {
          try { localStorage.setItem("myktamap_memoriser_plan", cb.checked ? "1" : "0"); } catch (e) {}
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(window.I18n.t(cb.checked ? "config.memoriser.toastOn" : "config.memoriser.toastOff"), "info");
          }
        });
      })();

      // Niveau des notifications (Toutes / Essentielles / Silence) : source de vérité OOMGuard (le goulot). Pas de
      // toast de confirmation.
      (function _initNotifsHome() {
        const sel = document.getElementById("loaderNotifsSel");
        if (!sel || !window.OOMGuard || typeof window.OOMGuard.niveauNotifs !== "function") return;
        sel.value = window.OOMGuard.niveauNotifs();
        sel.addEventListener("change", function () { window.OOMGuard.setNiveauNotifs(sel.value); });
      })();

      // Carnet des sorties (global) : le module est la source de vérité (clé dédiée), jamais localStorage ici.
      (function _initCarnetHome() {
        const cb = document.getElementById("loaderJournalCb");
        if (!cb) return;
        if (!window.Journal || typeof window.Journal.setEnabled !== "function") {
          // Module absent : la ligne est retirée plutôt que cliquable sans effet.
          const row = document.getElementById("loaderJournalRow");
          if (row) row.style.display = "none";
          return;
        }
        cb.checked = window.Journal.isEnabled();
        cb.addEventListener("change", function () {
          window.Journal.setEnabled(!!cb.checked);
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(window.I18n.t(cb.checked ? "config.journal.toastOn" : "config.journal.toastOff"), "info");
          }
        });
      })();

      // Options via capteur, aussi à l'accueil : même état que le mode plan (`APP_CONFIG` + `app_user_prefs`),
      // aucune divergence possible.
      const batRowH = document.getElementById("loaderBatterieRow");
      const batCbH  = document.getElementById("loaderBatterieCb");
      if (batRowH && batCbH) {
        if (typeof navigator.getBattery !== "function") {
          // 🩸 Affiché et expliqué, jamais masqué (sinon l'option semble ne pas exister).
          if (window.ktaCapteurRefuse) {
            window.ktaCapteurRefuse(batRowH, batCbH, document.getElementById("loaderBatterieHint"));
          }
        } else {
          batCbH.checked = !!(window.APP_CONFIG && window.APP_CONFIG.batterieEnabled === true);
          batCbH.addEventListener("change", function () {
            if (!window.APP_CONFIG) window.APP_CONFIG = {};
            window.APP_CONFIG.batterieEnabled = !!batCbH.checked;
            if (typeof window.sauvegarderPrefsUtilisateur === "function") {
              window.sauvegarderPrefsUtilisateur();
            }
            if (window.OOMGuard && typeof window.OOMGuard.showToast === "function" && window.I18n) {
              window.OOMGuard.showToast(window.I18n.t(batCbH.checked
                ? "config.batterie.toastOn" : "config.batterie.toastOff"), "info");
            }
          });
        }
      }

      // Replay / Heatmap (fonctionnalités optionnelles).
      if (typeof window.ktaBrancherOptionnel === "function") {
        window.ktaBrancherOptionnel(document.getElementById("loaderReplayCb"), "replayEnabled", "config.replay");
        window.ktaBrancherOptionnel(document.getElementById("loaderHeatmapCb"), "heatmapEnabled", "config.heatmap");
      }

      const vibRowH = document.getElementById("loaderVibrationRow");
      const vibCbH  = document.getElementById("loaderVibrationCb");
      if (vibRowH && vibCbH) {
        const dispoH = !!(window.kta_vibrate && window.kta_vibrate.isSupported());
        if (!dispoH) {
          if (window.ktaCapteurRefuse) {
            window.ktaCapteurRefuse(vibRowH, vibCbH, document.getElementById("loaderVibrationHint"));
          }
        } else {
          vibCbH.checked = !!(window.APP_CONFIG && window.APP_CONFIG.vibrationEnabled === true);
          vibCbH.addEventListener("change", function () {
            if (!window.APP_CONFIG) window.APP_CONFIG = {};
            window.APP_CONFIG.vibrationEnabled = !!vibCbH.checked;
            if (typeof window.sauvegarderPrefsUtilisateur === "function") {
              window.sauvegarderPrefsUtilisateur();
            }
            if (vibCbH.checked) { window.kta_vibrate.light(); }
          });
        }
      }

      const loaderWlRow = document.getElementById("loaderWakeLockRow");
      const loaderWlCb  = document.getElementById("loaderWakeLockCb");
      if (loaderWlRow && loaderWlCb && window.WakeLock) {
        if (window.WakeLock.isSupported()) {
          loaderWlRow.style.display = "";  // révèle (default = none)
          loaderWlCb.checked = window.WakeLock.isEnabled();
          loaderWlCb.addEventListener("change", function() {
            // 🩸 On n'annonce le verrou qu'une fois RÉELLEMENT posé.
            Promise.resolve(window.WakeLock.setEnabled(loaderWlCb.checked)).then(function (ok) {
              if (!(window.OOMGuard && typeof window.OOMGuard.showToast === "function")) return;
              const t = function (k, repli) {
                return (window.I18n && window.I18n.t) ? window.I18n.t(k) : repli;
              };
              if (!loaderWlCb.checked) {
                window.OOMGuard.showToast(t("config.display.wakelock.toastOff", "🔅 Mise en veille écran ré-activée"), "info");
                return;
              }
              window.OOMGuard.showToast(
                ok ? t("config.display.wakelock.toastOn", "🔆 Écran maintenu allumé tant que l'app est ouverte")
                   : t("config.display.wakelock.toastKo", "⚠️ Ton navigateur a refusé de garder l'écran allumé"),
                ok ? "info" : "warn");
            });
          });
          // Synchro si l'état change ailleurs (⚙️ Réglages du plan, accueil en arrière-plan).
          window.WakeLock.onChange(function(state) {
            if (loaderWlCb && loaderWlCb.checked !== state.enabled) {
              loaderWlCb.checked = state.enabled;
            }
          });
        }
        // Sinon : ligne cachée par défaut (display:none), sans message.
      }

      // ── Confidentialité & audit réseau ──────────
      // Journal réseau (#loaderNetLogModal, en direct), « Que fait l'app sur le réseau ? » (#loaderNetDocModal),
      // Vue OSM (OsmView.setOptedIn : seul accès à un tiers, le fond OpenStreetMap).

      const osmOptInCb = document.getElementById("loaderOsmOptInCb");
      if (osmOptInCb && window.OsmView) {
        osmOptInCb.checked = window.OsmView.isOptedIn();
        osmOptInCb.addEventListener("change", function() {
          window.OsmView.setOptedIn(osmOptInCb.checked);
        });
      }

      // Journal réseau : rendu initial + abonnement aux événements.
      const netLogBtn = document.getElementById("loaderNetLogBtn");
      if (netLogBtn) {
        netLogBtn.addEventListener("click", function() { _ouvrirNetLogModal(); });
      }

      const netDocBtn = document.getElementById("loaderNetDocBtn");
      if (netDocBtn) {
        netDocBtn.addEventListener("click", function() { _ouvrirNetDocModal(); });
      }

      // ── Modales « Journal réseau » + « Doc audit » ──
      // État et fonctions dans js/loaderNetAudit.js (globals) ; ici le câblage (✕, fond, Échap).
      const netLogClose = document.getElementById("loaderNetLogClose");
      if (netLogClose) netLogClose.addEventListener("click", _fermerNetLogModal);
      const netLogModal = document.getElementById("loaderNetLogModal");
      if (netLogModal) {
        netLogModal.addEventListener("click", function(e) {
          if (e.target === netLogModal) _fermerNetLogModal();
        });
      }

      const netLogCopy = document.getElementById("loaderNetLogCopy");
      if (netLogCopy) {
        netLogCopy.addEventListener("click", function() {
          if (!window.NetworkAudit) return;
          const txt = window.NetworkAudit.exportJson();
          var _tNL = function(key, fr) {
            return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(key) : fr;
          };
          // Helper commun (utils.js) : presse-papier puis execCommand ; double échec → « Exporter », qui marche
          // partout.
          window.ktaCopierTexte(txt).then(function(ok) {
            if (!ok) {
              window.ktaAlerte(_tNL("home.netlog.copyUnavailable",
                "Clipboard API indisponible. Utilise plutôt 📥 Exporter."));
              return;
            }
            netLogCopy.textContent = _tNL("home.netlog.copied", "✓ Copié");
            setTimeout(function() { netLogCopy.textContent = _tNL("home.netlog.copyBtn", "📋 Copier"); }, 1500);
          });
        });
      }
      const netLogExport = document.getElementById("loaderNetLogExport");
      if (netLogExport) {
        netLogExport.addEventListener("click", function() {
          if (!window.NetworkAudit) return;
          const txt = window.NetworkAudit.exportJson();
          const blob = new Blob([txt], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "myktamap-network-audit-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
          document.documentElement.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        });
      }
      const netLogClear = document.getElementById("loaderNetLogClear");
      if (netLogClear) {
        netLogClear.addEventListener("click", function() {
          if (!window.NetworkAudit) return;
          window.NetworkAudit.clear();
          _refreshNetLogTable();
        });
      }

      const netDocClose = document.getElementById("loaderNetDocClose");
      if (netDocClose) netDocClose.addEventListener("click", _fermerNetDocModal);
      const netDocModal = document.getElementById("loaderNetDocModal");
      if (netDocModal) {
        netDocModal.addEventListener("click", function(e) {
          if (e.target === netDocModal) _fermerNetDocModal();
        });
      }
      const netDocOpenFull = document.getElementById("loaderNetDocOpenFull");
      if (netDocOpenFull) {
        netDocOpenFull.addEventListener("click", function() {
          // On ouvre le .html (page autonome), PAS le .md : le SW sert index.html en repli aux requêtes
          // « document » absentes du cache, un .md non caché afficherait le splash. Le .html est précaché (même
          // origine, passe la CSP).
          window.open("docs/applications/NETWORK_AUDIT.html", "_blank", "noopener,noreferrer");
        });
      }

      // Échap global : journal / doc d'abord.
      document.addEventListener("keydown", function(e) {
        if (e.key !== "Escape") return;
        const logM = document.getElementById("loaderNetLogModal");
        const docM = document.getElementById("loaderNetDocModal");
        if (logM && logM.style.display !== "none") { _fermerNetLogModal(); return; }
        if (docM && docM.style.display !== "none") { _fermerNetDocModal(); return; }
      });

      // Modales de gestion du SW (_afficherConfirmForceUpdate / _afficherConfirmKillSw /
      // _afficherKillSwOfflineRefus) : js/loaderSwModals.js, exposées sur window.
    });
