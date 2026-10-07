/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// HOMECONFIG.JS — modale Config ⚙️ + PIN + badges alertes/paranoïa + thème + réseau
// =========================
// 🧹 B7 (v1.66.0) : extrait VERBATIM du monolithe index.html (ex-lignes
// 4643-5916 du bloc <script> inline). AUCUN refactor interne — seul ajout :
// les ponts window.* en fin de wrapper (le monolithe partageait UNE closure
// « load » ; découpé, chaque fichier expose ce que les autres consomment,
// les identifiants nus se résolvant sur l'objet global).
// ⚠️ Chargé SANS defer (exécution synchrone à l'emplacement d'origine) et
// wrappé dans window.addEventListener("load") : l'ordre d'enregistrement
// des listeners (homeLoader → homeProfile → homeConfig → résiduel inline)
// reproduit l'ordre d'exécution du bloc d'origine. Ne pas réordonner.
    window.addEventListener("load", function () {
      // === BOUTON ⚙️ CONFIGURATION (v1.7.3) ===
      // Ouvre la modale unique qui regroupe Tiling perf + ULTRA + Logs + Reset.
      // Remplace l'ancien drawer 'Réglages de performance' + la section
      // 'Plus d'options' qui étaient éparpillés dans le loader.
      const configBtn   = document.getElementById("loaderConfigBtn");
      const configModal = document.getElementById("loaderConfigModal");
      const configClose = document.getElementById("loaderConfigClose");
      function _ouvrirLoaderConfig() {
        if (configModal) configModal.style.display = "flex";
        // 🧩 Bloc « Installation » en tête (ex. gérer les comptes, pour un admin) :
        // actions fournies par l'extension de l'installation, recalculées à chaque ouverture.
        if (configModal && window.KtaExtensions && typeof window.KtaExtensions.blocActionsCompte === "function") {
          const ancien = configModal.querySelector(".kta-ext-compte");
          if (ancien) ancien.remove();
          const corpsCfg = configModal.querySelector(".kta-loader-config-corps");
          const bloc = window.KtaExtensions.blocActionsCompte("config",
            window.I18n ? window.I18n.t("config.compteTitre") : "Installation");
          if (bloc && corpsCfg) corpsCfg.insertBefore(bloc, corpsCfg.firstChild);
        }
        // 🆕 v1.10.0-hotfix1 : si on est in-app (plan chargé, loader masqué),
        // on doit aussi afficher le loader pour que la modale Config soit
        // visible dans son contexte (sinon elle apparaît au-dessus de la
        // map et l'user ferme → l'app reste en mode map sans contexte).
        const loaderOverlay = document.getElementById("planLoaderOverlay");
        if (loaderOverlay && loaderOverlay.style.display === "none") {
          loaderOverlay.style.display = "flex";
        }
      }
      function _fermerLoaderConfig() {
        if (configModal) configModal.style.display = "none";
      }
      // 🆕 v1.10.0-hotfix1 (KARMA "si on clique sur activer maintenant, ca
      // ferme juste le modal mais ouvre pas le formulaire") : expose les
      // helpers sur window pour que les modules externes (pinLock.js, etc.)
      // puissent ouvrir/fermer la modale Configuration. Avant : functions
      // locales au scope du <script> inline → window._ouvrirLoaderConfig
      // était undefined.
      window._ouvrirLoaderConfig = _ouvrirLoaderConfig;
      window._fermerLoaderConfig = _fermerLoaderConfig;
      if (configBtn && configModal) {
        configBtn.addEventListener("click", _ouvrirLoaderConfig);
      }
      if (configClose) {
        configClose.addEventListener("click", _fermerLoaderConfig);
      }
      if (configModal) {
        // Click backdrop pour fermer (mais pas si on clique sur la boîte)
        configModal.addEventListener("click", function(e) {
          if (e.target === configModal) _fermerLoaderConfig();
        });
        // Escape ferme la modale (cohérent avec autres modales projet)
        document.addEventListener("keydown", function(e) {
          if (e.key === "Escape" && configModal.style.display !== "none" &&
              !document.getElementById("kta-depannage-modal")) {
            _fermerLoaderConfig();
          }
        });
      }

      // === 🕵️ v1.31.9 BOUTON MODE INCOGNITO (home) ===
      // Section #loaderIncognitoSection dans la modale Configuration. Le
      // bouton est dynamique selon window.IncognitoMode.active :
      //   • Pas actif → "Démarrer en mode incognito" → IncognitoMode.launch()
      //   • Actif    → "Quitter le mode incognito"  → IncognitoMode.quit()
      // Le label + l'icône + le hint + la classe sont mis à jour à chaque
      // ouverture de la modale (au cas où l'état change pendant la session,
      // bien que ce soit en théorie impossible — l'état est figé au boot).
      (function _bindLoaderIncognito() {
        var btn   = document.getElementById("loaderIncognitoBtn");
        var icon  = document.getElementById("loaderIncognitoIcon");
        var label = document.getElementById("loaderIncognitoLabel");
        var hint  = document.getElementById("loaderIncognitoHint");
        if (!btn || !icon || !label || !hint) return;
        // i18n : helper de traduction avec fallback FR inline si I18n
        // indisponible (ne devrait pas arriver — l'IIFE tourne après
        // I18n.init au boot, mais on reste défensif pour ne jamais crasher).
        function _t(key, fr) {
          // 🐛 v1.46.5 — clé présente dans le dico chargé → traduction normale
          // (toute langue). Clé ABSENTE (dico SW périmé, clé ajoutée après la
          // version en cache) : le fallback FR inline n'est correct QUE si la
          // langue active est le FR. En EN/ES on laisse I18n.t HUMANISER (afficher
          // le texte français en EN/ES serait une régression — vue en v1.46.4).
          // Le VRAI fix global = dico frais (SW network-first, v1.46.5).
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
              "Cette installation est reliée à une base de données : ce que tu fais y est enregistré par le serveur. " +
              "Le mode incognito n'aurait donc pas de sens ici.");
            return;
          }
          if (actif) {
            btn.classList.add("kta-cfg-incognito-btn-quit");
            icon.textContent  = "✕";
            label.textContent = _t("home.privacy.incognitoQuitLabel", "Quitter le mode incognito");
            hint.innerHTML    = _t("home.privacy.incognitoQuitHint",
              "Ferme cette fenêtre incognito. <strong>Toutes les données accumulées</strong> " +
              "(points, tracker, notes) <strong>seront perdues</strong>. Ta session principale " +
              "reste intacte dans son onglet.<br>" +
              "<span style=\"color:#a78bfa;\">Si le navigateur bloque la fermeture, " +
              "l'onglet recharge automatiquement en mode normal.</span>");
          } else {
            btn.classList.remove("kta-cfg-incognito-btn-quit");
            icon.textContent  = "🕵️";
            label.textContent = _t("home.privacy.incognitoStartLabel", "Démarrer en mode incognito");
            hint.innerHTML    = _t("home.privacy.incognitoStartHint",
              "Ouvre une nouvelle fenêtre où <strong>aucune donnée n'est sauvegardée</strong> " +
              "(ni photos, ni tracker, ni préférences). Idéal pour explorer un plan en démo " +
              "publique, prêter ta session à un tiers ou tester sans polluer ton historique " +
              "local. Bordure violette + badge dans le titre rappellent le contexte.<br>" +
              "<span style=\"color:#a78bfa;\">Au reload : tout disparaît.</span>");
          }
        }
        // Rendu immédiat UNIQUEMENT si le dico est déjà là (cas FR, et tout cas
        // où l'IIFE passe après le chargement). Sinon on ne rend RIEN tout de
        // suite : appeler `_refresh()` à vide ferait humaniser les clés et
        // émettrait un « [I18n] Clé manquante » qui fait échouer le smoke — un
        // faux signal, puisque la clé existe et arrive une fraction de seconde
        // plus tard. La barrière ci-dessous s'en charge.
        var _dicoPret = !(window.I18n && typeof window.I18n.has === "function") ||
                        window.I18n.has("home.privacy.incognitoStartLabel");
        if (_dicoPret) _refresh();
        // 🐛 v1.80.0 — BARRIÈRE I18n.init() : ce premier _refresh() tombe AVANT
        // l'arrivée du dico quand la langue n'est pas le FR (fr.json est le dico
        // de référence, chargé en premier). `I18n.has()` répondait donc false et
        // `I18n.t()` HUMANISAIT la clé : un utilisateur EN ou ES lisait
        // « Incognito Start Label » sur le HOME — la clé technique, ni traduite
        // ni en français. Et ça ne se réparait JAMAIS : `onChange` ci-dessous ne
        // se déclenche qu'au CHANGEMENT de langue, pas à l'arrivée du dico.
        // Mesuré le 01/09/2026 sur les 3 langues : FR correct, EN et ES cassés.
        // Même barrière que `_majPinStatusUI` plus bas dans ce fichier (v1.68.1).
        if (window.I18n && typeof window.I18n.init === "function") {
          window.I18n.init().then(_refresh).catch(function () {});
        }
        // Re-render du label/hint à chaque changement de langue (live, sans
        // reload — cohérent avec _applyI18nDom appliqué au reste du HOME).
        if (window.I18n && typeof window.I18n.onChange === "function") {
          window.I18n.onChange(_refresh);
        }
        // Re-refresh à chaque ouverture de la modale Configuration (Hook
        // sur le helper exposé sur window pour rester DRY avec configBtn).
        var _origOuvrir = window._ouvrirLoaderConfig;
        if (typeof _origOuvrir === "function") {
          window._ouvrirLoaderConfig = function() {
            _origOuvrir.apply(this, arguments);
            _refresh();
          };
        }
        btn.addEventListener("click", function() {
          if (!window.IncognitoMode) {
            alert(_t("home.incognito.indispo", "Module IncognitoMode indisponible. Recharge la page."));
            return;
          }
          if (window.IncognitoMode.active) {
            if (confirm(_t("config.incognito.confirmQuit", "Quitter le mode incognito ?"))) {
              window.IncognitoMode.quit();
            }
          } else {
            // 🆕 v1.31.10 : passe par confirmAndLaunch() qui affiche la
            // modale charte de garde-fou (description + risques + buttons).
            // L'user peut Annuler dans la modale → no launch.
            _fermerLoaderConfig();
            window.IncognitoMode.confirmAndLaunch();
          }
        });
      })();

      // === BOUTON 🔔 ALERTE EN COURS ===
      // Force le re-fetch de alert.json et affiche soit la modale d'alerte
      // (même si déjà acquittée), soit une modale informative "pas d'alerte".
      // L'auteur peut désactiver l'alerte en renommant alert.json en
      // alert.lock côté serveur (fetch 404 → modale "pas d'alerte").
      const alertBtn = document.getElementById("loaderAlertBtn");
      if (alertBtn) {
        alertBtn.addEventListener("click", function() {
          if (window.AlertChecker && typeof window.AlertChecker.showCurrent === "function") {
            window.AlertChecker.showCurrent();
          } else {
            setStatus("Module Alerte indisponible", true);
          }
        });

        // v163 : badge 🚨 dynamique selon niveau max + pastille compteur si >1.
        // Le AlertChecker notifie via onChange après chaque check/dismiss.
        function _majBadgeAlert() {
          if (!window.AlertChecker || typeof window.AlertChecker.getActiveAlerts !== "function") return;
          const actives = window.AlertChecker.getActiveAlerts() || [];
          // Filtre les non-acquittées pour le badge actif visuel
          const nonAcq = actives.filter(function(a) {
            if (!a.id || !a.released) return true;
            try {
              const seen = localStorage.getItem("myktamap_alert_seen_" + a.id);
              return !(seen && seen === a.released);
            } catch(e) { return true; }
          });
          // Reset classes de niveau
          alertBtn.classList.remove(
            "loader-btn-alert-emergency",
            "loader-btn-alert-warning",
            "loader-btn-alert-info",
            "loader-btn-alert-none"
          );
          // Détecte niveau max (parmi les non acquittées)
          let maxLevel = "none";
          for (var i = 0; i < nonAcq.length; i++) {
            const lvl = nonAcq[i].level;
            if (lvl === "emergency") { maxLevel = "emergency"; break; }
            if (lvl === "warning"  && maxLevel !== "emergency") maxLevel = "warning";
            else if (lvl === "info" && maxLevel === "none")     maxLevel = "info";
          }
          alertBtn.classList.add("loader-btn-alert-" + maxLevel);
          // Pastille compteur si > 1 alerte non acquittée
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
        // Premier rendu (en cas où le check a déjà eu lieu)
        _majBadgeAlert();
      }

      // ⚠️ v1.85.3 (audit KARMA) — LE CABLAGE DES TOGGLES PERF ULTRA A ETE
      // RETIRE avec les cases correspondantes (cf. index.html). Il etait
      // null-safe, donc inoffensif — mais c est precisement ce qui le rendait
      // trompeur : du code qui a l air de brancher une interface qui n existe
      // plus. Ces reglages sont PAR PLAN depuis la v1.59.0 et se reglent dans
      // ⚙️ Reglages, une fois le plan ouvert.

      // === VERSION DANS LE FOOTER COPYRIGHT ===
      // - Le badge est TOUJOURS cliquable :
      //   · Mode normal (à jour) → modale "Déjà à jour" avec les notes de la
      //     version installée (récap pratique)
      //   · Mode update dispo → modale "🔔 Mise à jour disponible" (avec choix
      //     douce / reset complet, bypass snooze)
      // - Visuel différencié : gris discret normal vs bleu clignotant si update
      //   (mais cursor:pointer + onclick dans LES DEUX cas).
      (function _initFooterVersion() {
        const el = document.getElementById("loaderCopyrightVersion");
        if (!el) return;
        const installed = (window.__MKM__ && window.__MKM__.build) || "v?";

        // Badge cliquable dès le départ — peu importe l'état update.
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.onclick = function() {
          if (window.UpdateChecker && typeof window.UpdateChecker.showCurrent === "function") {
            window.UpdateChecker.showCurrent();
          }
        };
        // Support Entrée/Espace au clavier (accessibilité)
        el.addEventListener("keydown", function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            el.click();
          }
        });

        // État initial : affiche la version installée. Le check d'update
        // décoré ci-dessous ré-évalue au moment où le résultat du fetch
        // version.json arrive.
        // Audit i18n (O8) : infobulle traduite (était en FR dans les 3 langues).
        // 🐛 30/09/2026 (checkup-guidage : « Clé manquante home.version.titre ») : ce code
        // tourne AU CHARGEMENT, avant que les dicos soient là. L'infobulle est donc
        // calculée au SURVOL (dicos prêts, langue courante) ; l'état est mémorisé ici.
        let _titreVer = { cle: "home.version.titre", v: installed };
        const _TITRE_FR = {
          "home.version.titre":    "Version installée : {v} — clique pour voir les notes ou vérifier les mises à jour",
          "home.version.titreMaj": "Nouvelle version disponible : {v} — clique pour mettre à jour"
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
          if (!remoteVersion || remoteVersion === installed) {
            // Pas d'update dispo → état normal (mais toujours cliquable)
            el.classList.remove("kta-loader-copyright-version-update");
            el.textContent = installed;
            el.title = _tVer("home.version.titre", { v: installed });
            return;
          }
          // Update disponible → badge bleu clignotant
          el.classList.add("kta-loader-copyright-version-update");
          el.textContent = installed + " → " + remoteVersion;
          el.title = _tVer("home.version.titreMaj", { v: remoteVersion });
        }

        // Évaluation initiale via le cache LS si dispo
        try {
          const raw = localStorage.getItem("myktamap_last_version_data");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.version) _evaluerEtAfficher(parsed.version);
          }
        } catch(e) {}

        // Re-évaluation après chaque check() de UpdateChecker (fetch frais).
        // Couvre le cas où la version sur le serveur a changé entre 2 boots.
        if (window.UpdateChecker && typeof window.UpdateChecker.onCheck === "function") {
          window.UpdateChecker.onCheck(function(result) {
            if (result && result.remote && result.remote.version) {
              _evaluerEtAfficher(result.remote.version);
            }
          });
        }
      })();

      // === 📡 PASTILLE « HORS-LIGNE » (lot B, 03/10/2026) ===
      // Un point coloré accolé au badge de version (#loaderOfflineDot) MONTRE
      // l'état du cache hors-ligne, que l'auto-réparation (SwInspector.
      // autoHealIfNeeded, ~5 s après l'accueil) répare en silence :
      //   🟢 ok · 🔴 manquants (clic = tout récupérer) · 🟠 récupération en
      //   cours, ou manquants hors réseau · ⚪ pas de service worker.
      // Le rouge seul remonte dans l'en-tête (#loaderOfflineHdrBtn). Le badge de
      // version garde son clic et son état « mise à jour disponible » : la
      // pastille est un élément À CÔTÉ, jamais dedans (le badge réécrit son
      // textContent). Vérifications : au résultat de l'auto-réparation
      // (événement kta-sw-autoheal), au controllerchange, après un clic.
      // Aucune boucle, aucune minuterie. Accueil seulement : en mode carte, le
      // pied de page et l'en-tête de l'accueil sont masqués avec lui.
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
          // Dicos en cours de rechargement (I18n.reload() au controllerchange,
          // main.js) : on ne peint pas de clé humanisée, onChange repeindra.
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
          // Les titres sont traduits au rendu : on attend les dicos (un
          // controllerchange du tout premier chargement peut les devancer).
          const dicos = (window.I18n && typeof window.I18n.init === "function") ? window.I18n.init() : null;
          return Promise.all([window.SwInspector.etat(), dicos]).then(function(r) {
            _dernier = r[0];
            _peindre();
          });
        }

        // Petit message court au-dessus de tout, visible depuis l'en-tête comme
        // depuis le pied de page (les toasts d'OOMGuard attendent la fin du
        // splash de la carte et « info » est tu par défaut : pas adaptés ici).
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
            // Vert : comportement du badge de version (notes / mise à jour).
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
        // Langue changée ou dicos rechargés : les titres suivent.
        if (window.I18n && typeof window.I18n.onChange === "function") {
          window.I18n.onChange(function() { if (_dernier || _enCours) _peindre(); });
        }
        // Le réseau revient ou tombe : on ne fait que repeindre (aucune
        // vérification, l'état du cache n'a pas changé).
        window.addEventListener("online", function() { if (_dernier) _peindre(); });
        window.addEventListener("offline", function() { if (_dernier) _peindre(); });
      })();

      // v1.7.3 : section "Plus d'options" retirée du loader (boutons
      // déplacés dans la modale ⚙️ Configuration). Les IDs #advancedHead,
      // #advancedBox, #advancedChevron n'existent plus dans le DOM.
      // Le bloc collapse handler est retiré aussi (devenu inutile).

      // === 🆘 DÉPANNAGE (lot A, 03/10/2026) ===
      // Les trois outils de dépannage ne sont plus affichés en vrac dans
      // ⚙️ Configuration : un seul bouton « 🆘 Dépannage » ouvre une fenêtre
      // qui les range du plus doux au plus radical. Les trois parcours
      // ci-dessous sont les anciens écouteurs de clic, extraits TELS QUELS en
      // fonctions nommées (confirmations comprises) — aucune logique changée.

      // 💥 TOUT RÉINITIALISER — double confirmation portée par viderCacheAppli
      // (js/interfaceMaintenance.js).
      function _depannageReset() {
        if (typeof window.viderCacheAppli === "function") {
          window.viderCacheAppli();
        } else {
          setStatus(window.I18n ? window.I18n.t("home.reset.indispo") : "Fonction de réinitialisation indisponible", true);
        }
      }

      // 🔄 FORCER LA MISE À JOUR (v1.7.3) — « reset lite » : purge cache SW +
      // reload, préserve TOUTES les données user. Garde-fou : modale de
      // confirmation (js/loaderSwModals.js). Le ping internet n'est PAS
      // répliqué ici : il vit dans `mettreAJourCodeSeul()`, qui affiche
      // `_softUpdateOfflineWarning()` si offline.
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

      // 🆘 v1.37.0 — KILL SW (ouvre killsw.html). Double garde-fou :
      //   1. Ping Internet AVANT la modale — refus immédiat si offline ou
      //      serveur KO (re-download des assets requis au prochain boot).
      //   2. Modale de confirmation (Promise, js/loaderSwModals.js).
      async function _depannageKillSw() {
        // Overlay "Vérification…" pendant le ping (5s max) : sinon l'user
        // ne voit RIEN se passer entre clic et résultat.
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

        // Garde-fou 1 : ping Internet. Si _pingInternet n'est pas exposé
        // (timing de chargement), repli sur navigator.onLine.
        let online;
        try {
          if (typeof window._pingInternet === "function") {
            online = await window._pingInternet();
          } else {
            online = (typeof navigator !== "undefined") ? navigator.onLine : true;
          }
        } catch(e) { online = false; }

        // Retire l'overlay d'attente (que la suite soit refus ou modale conf)
        try { waitOverlay.remove(); } catch(e) {}

        if (!online) {
          _afficherKillSwOfflineRefus();
          return;
        }
        // Garde-fou 2 : confirmation utilisateur.
        _afficherConfirmKillSw().then(function(ok) {
          if (!ok) return;
          window.location.href = "killsw.html";
        });
      }

      // La fenêtre 🆘 Dépannage, construite à chaque ouverture : le
      // MutationObserver de js/interfaceDocs.js y pose le ❓ (fiche
      // « depannage »). Elle s'empile au-dessus de ⚙️ Configuration (même
      // z-index, ajoutée après) et SOUS les confirmations, ajoutées après
      // elle : à l'annulation, on y revient.
      function _fermerDepannage() {
        const m = document.getElementById("kta-depannage-modal");
        if (m) m.remove();
        window.removeEventListener("keydown", _depannageOnKey, true);
      }
      // Échap ne ferme la fenêtre que si elle est AU PREMIER PLAN : quand une
      // confirmation (ou la fiche d'aide) est ouverte par-dessus, c'est elle
      // qui doit partir. Écoute en capture + stopPropagation : l'Échap de
      // ⚙️ Configuration ne fermerait sinon la fenêtre parente dans la foulée
      // (il s'abstient aussi tant que la fenêtre existe).
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
        const _esc = function(s) {
          return String(s).replace(/[&<>"]/g, function(c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
          });
        };
        // Adresse de la page de secours, relative à l'origine (dev, prod, selfhost).
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

      // ═══════════════════════════════════════════════════════════════
      // 🔐 CODE D'ACCÈS LOCAL (v1.9.4 — PIN/biométrie optionnel)
      // ═══════════════════════════════════════════════════════════════
      // Affichage de l'état + boutons d'activation/modif/désactivation.
      // Le moteur (hash + WebAuthn + lockout + Gate UI) est dans
      // js/pinLock.js — ici on ne fait que les flows UI de configuration.
      //
      // Cohérent KARMA 7:b "loader uniquement" — la modale ⚙️ Réglages
      // map mode n'expose PAS cette section (pour ne pas surcharger les
      // réglages in-app focus PAR PLAN).
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
          iconEl.style.color = "#8892a4";
          textEl.innerHTML = _t("pin.setup.statusDisabled");
          actionsEl.innerHTML =
            '<button class="loader-btn-secondary" type="button" id="loaderPinEnableBtn" style="background:rgba(244,197,66,0.15); border-color:rgba(244,197,66,0.4); color:#f4c542;">' +
              _t("pin.setup.enableBtn") +
            '</button>';
          document.getElementById("loaderPinEnableBtn").addEventListener("click", _lancerActivationPin);
        }
      }

      // Helper Promise-based : demande un PIN à l'user via une modale custom.
      // Retourne Promise<string|null> (null si annulé).
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
                'text-align:center; letter-spacing:8px; background:#0a0d18; border:2px solid rgba(244,197,66,0.3); ' +
                'border-radius:8px; color:#f4c542; font-family:monospace; box-sizing:border-box;" placeholder="••••">' +
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
          // Filtre l'input : que des chiffres
          input.addEventListener("input", function() {
            input.value = input.value.replace(/[^0-9]/g, "").slice(0, 6);
          });
        });
      }

      // 🆕 v1.10.0-hotfix5 (KARMA "au lieu Annuler mettre Non plus clair") :
      // helper Promise-based pour une question Oui/Non charte (remplace
      // le confirm() natif qui affiche "OK/Annuler"). Retourne true=oui,
      // false=non (Échap, click backdrop, ou bouton Non).
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

      // Flow d'activation
      async function _lancerActivationPin() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const pin1 = await _demanderPin(
          _t("pin.setup.defineTitle"),
          _t("pin.setup.defineBody"),
          _t("pin.setup.next")
        );
        if (!pin1) return;
        // Validation basique côté UI (le backend re-valide)
        if (!/^\d{4,6}$/.test(pin1)) {
          alert(_t("pin.setup.errLength"));
          return;
        }
        const pin2 = await _demanderPin(
          _t("pin.setup.confirmTitle"),
          _t("pin.setup.confirmBody"),
          _t("pin.setup.confirm")
        );
        if (!pin2) return;
        if (pin1 !== pin2) {
          alert(_t("pin.setup.errMismatchRetry"));
          return;
        }

        // Check biométrie disponible
        // 🆕 v1.10.0-hotfix5 (KARMA) : modale Oui/Non charte au lieu du
        // confirm() natif qui affichait "OK / Annuler" (peu clair).
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

        // Activation
        try {
          await window.MyKTAMapPinLock.enable(pin1, useBio);
          alert(_t("pin.setup.okEnabled") + (useBio ? _t("pin.setup.okBioConfigured") : ""));
        } catch(e) {
          if (e && e.pinActivatedWithoutBiometric) {
            // Cas partiel : PIN OK mais biométrie a échoué
            alert(_t("pin.setup.okEnabledBioFailed") + e.message);
          } else {
            console.error("[PinSetup] enable :", e);
            alert(_t("pin.setup.errEnable") + (e.message || e));
            return;
          }
        }
        _majPinStatusUI();
      }

      // Flow de modification (9:b — biométrie OU ancien PIN → nouveau)
      async function _lancerModificationPin() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        // Vérification identité : tentative biométrie d'abord si dispo, sinon PIN
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
            alert("❌ " + (e.message || e));
            return;
          }
          if (!unlocked) {
            const remaining = window.MyKTAMapPinLock.getRemainingAttempts();
            alert(_t("pin.setup.errWrongCode", { n: remaining }));
            return;
          }
        }

        // Saisie du nouveau code (2 fois)
        const newPin1 = await _demanderPin(
          _t("pin.setup.newTitle"),
          _t("pin.setup.newBody"),
          _t("pin.setup.next")
        );
        if (!newPin1) return;
        if (!/^\d{4,6}$/.test(newPin1)) {
          alert(_t("pin.setup.errLength"));
          return;
        }
        const newPin2 = await _demanderPin(
          _t("pin.setup.newConfirmTitle"),
          _t("pin.setup.newConfirmBody"),
          _t("pin.setup.confirm")
        );
        if (!newPin2) return;
        if (newPin1 !== newPin2) {
          alert(_t("pin.setup.errMismatch"));
          return;
        }

        try {
          await window.MyKTAMapPinLock.changePin(newPin1);
          alert(_t("pin.setup.okChanged"));
        } catch(e) {
          console.error("[PinSetup] changePin :", e);
          alert(_t("pin.setup.errGeneric") + (e.message || e));
          return;
        }
        _majPinStatusUI();
      }

      // Flow de désactivation
      async function _lancerDesactivationPin() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        // 🆕 v1.10.0-hotfix5 : modale Oui/Non charte au lieu du confirm() natif
        const okDesact = await _demanderOuiNon(
          _t("pin.setup.disableAskTitle"),
          _t("pin.setup.disableAskBody"),
          _t("pin.setup.disableYes"), _t("pin.setup.disableNo"),
          "🔓"
        );
        if (!okDesact) return;

        // Vérification identité (biométrie ou PIN)
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
            alert(_t("pin.setup.okDisabled"));
            _majPinStatusUI();
            return;
          } catch(e) {
            console.error("[PinSetup] disable :", e);
            alert("❌ " + (e.message || e));
            return;
          }
        }

        // Si déverrouillé via biométrie → on peut désactiver directement
        // (la disable() backend reverif le PIN, donc on contourne en
        // appelant reset() après check biométrie OK).
        // ⚠️ Sécurité OK car la biométrie EST la preuve d'identité.
        window.MyKTAMapPinLock.reset();
        alert(_t("pin.setup.okDisabledBio"));
        _majPinStatusUI();
      }

      // Initialisation : update au load de la modale Configuration.
      // 🐛 v1.68.1 (audit clés manquantes) : derrière la barrière I18n.init()
      // (mémoïsée) — le window load peut gagner la course du fetch des dicos
      // → le statut PIN sortait « humanisé » (« Status Disabled »).
      if (window.I18n && typeof window.I18n.init === "function") {
        window.I18n.init().then(_majPinStatusUI);
      } else {
        _majPinStatusUI();
      }

      // 🆕 v1.46.4 (audit P3-LOW #7) : re-traduit la section PIN au changement
      // de langue À CHAUD. Elle est rendue par _t() inline (pas via data-i18n)
      // → non captée par _applyI18nDom. Comme la langue ET le code d'accès sont
      // dans la MÊME modale Configuration, un switch laissait le PIN en FR.
      // Abonnement UNIQUE (garde anti-double, même si ce bloc re-tourne) ;
      // _majPinStatusUI se garde déjà si les éléments DOM sont absents.
      if (window.I18n && window.I18n.onChange && !window._pinStatusI18nHooked) {
        window._pinStatusI18nHooked = true;
        window.I18n.onChange(_majPinStatusUI);
      }

      // === BOUTON "📋 AFFICHER LES LOGS" (v1.7.3 suite KARMA) ===
      // Permet de consulter le buffer des logs capturés par debug.js sans
      // avoir besoin de charger un plan d'abord. Réutilise window.afficherLogsDebug
      // exposé par debug.js qui ouvre la modale `.kta-readme-modal-overlay`
      // avec le buffer.
      //
      // Cas d'usage : bug bloquant au chargement, l'user veut envoyer un rapport
      // sans pouvoir entrer dans l'app.
      //
      // Empilement DOM : la modale Configuration et la modale Logs ont le
      // même z-index (99999 via `.kta-readme-modal-overlay`), donc c'est le
      // DOM order qui décide. La modale Logs est appendée APRÈS, elle passe
      // au-dessus. Au close des Logs, la modale Config est toujours là
      // derrière → l'user retrouve son contexte sans avoir à re-ouvrir.
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

      // 🛠️ v1.76.3 — la section Debug est devenue le MODE DÉVELOPPEUR
      // (gate mdp + logs + 📚 bibliothèque docs) : peuplée par devMode.js.
      // (loaderShowLogsBtn/loaderDebugBtn n'existent plus dans le DOM — les
      // binds ci-dessus restent if-guardés, inoffensifs.)
      if (window.DevMode && typeof window.DevMode.initSection === "function") {
        window.DevMode.initSection();
      }

      // 🆕 v1.19.0 — 📊 Inspecteur mémoire. Ouvre la modale de topo lisible
      // (localStorage / IndexedDB / Cache PWA / Storage estimate / Runtime).
      // Module js/memInspector.js chargé tôt (juste après networkAudit).
      // Même z-index que les autres modales — la modale Inspector passe
      // au-dessus de Configuration (DOM order), au close on retrouve Config.
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

      // 🔧 L'inspecteur Service Worker (#loaderSwInspectorBtn) est rendu et
      // branché par js/devMode.js (mode développeur actif seulement).

      // 🆕 v1.43.13 — Auto-heal silencieux du cache SW. Tire ~5s après le
      // boot pour laisser le SW finir son install. Garde-fous internes
      // (online, SW ready, pas incognito, 1x par session,
      // cap 100 fetches). La réparation reste silencieuse ; son résultat
      // (événement kta-sw-autoheal) repeint la pastille « hors-ligne » du
      // pied de page (cf. _initPastilleHorsLigne plus haut).
      setTimeout(function() {
        if (window.SwInspector && typeof window.SwInspector.autoHealIfNeeded === "function") {
          window.SwInspector.autoHealIfNeeded();
        }
      }, 5000);

      // ═══════════════════════════════════════════════════════════════
      // 🎨 AFFICHAGE — Toggle "Utiliser l'ancienne interface" (Legacy)
      // v1.14.19 (KARMA) : toggle « ancienne interface » retiré. La
      // nouvelle interface (refonte v1) est désormais imposée pour tout
      // le monde. Le handler du checkbox #loaderLegacyCb est supprimé
      // en même temps que la checkbox elle-même côté HTML.

      // 🗑️ v1.36.2 : handler du toggle #loaderShowIntersectionsCb supprimé.
      // L'option "afficher les ronds aux intersections" est passée de globale
      // à per-plan (Réglages map mode). Cf js/config.js > getPlanShowsIntersections.


      // 🆕 v1.13.0-fix2 (KARMA "possibilité d'activer ou non depuis le conf home") :
      // toggle thème CLAIR / SOMBRE — accessible UNIQUEMENT depuis la modale
      // Configuration home (KARMA v1.14.2 : retrait du toggle équivalent en
      // mode map). Persistance globale en localStorage ("myktamap_theme_v1").
      //
      // v1.14.2 : le changement déclenche un reload complet de l'app via
      // ThemeManager.setThemeAndReload(). Le swap "live" laissait toujours
      // des bugs résiduels sur le bandeau top / modales chargées avant le
      // toggle qu'on n'a jamais réussi à régler. Reload = état propre garanti.
      //
      // v1.14.6 (KARMA) : confirmation user avant reload — l'ancien
      // comportement déclenchait le reload instant au clic checkbox.
      // v1.14.9 (KARMA) : remplacement du confirm() natif par une modale
      // custom fidèle à la charte graphique MyKTAMap (bleu nuit / accent
      // jaune charte, variant light beige / ambre). Promise-based avec
      // Escape pour annuler et Enter pour confirmer.
      function _confirmThemeSwitch(cible) {
        return new Promise(function(resolve) {
          // Suppr modale existante éventuelle (sécurité double-clic)
          const old = document.getElementById("kta-theme-confirm-modal");
          if (old) old.remove();

          const cibleIcone   = (cible === "light") ? "☀️" : "🌙";
          const cibleColor   = (cible === "light") ? "#f4c542" : "#8cb4ff";
          // i18n : libellés + textes résolus au RENDU (langue active). I18n.t
          // n'utilise pas `this` → on peut référencer la fonction directement.
          // Fallback = clé brute si I18n indispo (très improbable, chargé au boot).
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

          // Auto-focus sur "Activer et relancer" pour permettre Enter direct
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
              // Rollback visuel — restaure l'état précédent de la checkbox.
              themeLightCb.checked = !themeLightCb.checked;
              return;
            }
            window.ThemeManager.setThemeAndReload(cible);
          });
        });
      }

      // 🆕 v1.21.1+ (KARMA "on doit pouvoir l'activer aussi depuis parametre
      // du home") : toggle Wake Lock dans Configuration home. Parité avec
      // ⚙️ Réglages map mode > 🔍 Affichage. Les 2 toggles pointent sur le
      // même window.WakeLock → state synchronisé entre les 2 modales.
      // ⚙️ v1.85.3 (audit KARMA) — QUATRE RÉGLAGES GLOBAUX rapatriés du mode
      // plan. Ils s'écrivent par le chemin CANONIQUE : c'est lui que
      // `check-prefs-survival.js` inspecte pour vérifier qu'une préférence
      // sauvegardée est bien relue au chargement d'un plan.
      (function _initReglagesGlobaux() {
        const cases = [
          ["loaderScaledMarkers",  "scaledMarkers",  true],   // défaut ON  → test `!== false`
          ["loaderPanneauxAncres", "panneauxAncres", false],  // défaut OFF → test `=== true`
          ["loaderSnapDraw",       "snapDraw",       false]
        ];
        cases.forEach(function (row) {
          const el = document.getElementById(row[0]);
          if (!el) return;
          const cfg = window.APP_CONFIG || {};
          // 🩸 L'idiome DÉPEND du défaut : `!== false` pour un défaut ON,
          // `=== true` pour un défaut OFF. Les confondre allume ou éteint
          // l'option pour tout le monde au premier lancement.
          el.checked = row[2] ? (cfg[row[1]] !== false) : (cfg[row[1]] === true);
          el.addEventListener("change", function () {
            if (!window.APP_CONFIG) window.APP_CONFIG = {};
            window.APP_CONFIG[row[1]] = !!el.checked;
            if (typeof window.sauvegarderPrefsUtilisateur === "function") {
              window.sauvegarderPrefsUtilisateur();
            }
          });
        });
        const px = document.getElementById("loaderSnapDrawPx");
        if (px) {
          const cfg = window.APP_CONFIG || {};
          px.value = Number.isFinite(Number(cfg.snapDrawPx)) ? Number(cfg.snapDrawPx) : 14;
          px.addEventListener("change", function () {
            const v = parseFloat(px.value);
            // Hors bornes = saisie fautive, pas une préférence : on ignore et
            // on remet la valeur en place plutôt que d'écrire n'importe quoi.
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

      // ❓ v1.94.0 — Aide contextuelle : le ❓ des modales se coupe ici.
      // L'état visible est mis à jour TOUT DE SUITE (modales déjà ouvertes) :
      // une case qui n'agit qu'à la prochaine ouverture passe pour inerte.
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

      // 💾 15/09/2026 — Mémoriser le plan dans l'app au premier chargement.
      // Rapatrié de l'accueil (KARMA : « alourdit pour rien le home »). La
      // source de vérité est `window.ktaMemoriserPlanActif()` (homeLoader) ;
      // on écrit la même clé, jamais une copie locale de l'état.
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

      // 🔕 17/09/2026 — niveau des notifications (Toutes / Essentielles / Silence).
      // La source de vérité est OOMGuard (le goulot) ; ici on ne fait que lire
      // et écrire par lui. Pas de toast de confirmation : ce serait ironique.
      (function _initNotifsHome() {
        const sel = document.getElementById("loaderNotifsSel");
        if (!sel || !window.OOMGuard || typeof window.OOMGuard.niveauNotifs !== "function") return;
        sel.value = window.OOMGuard.niveauNotifs();
        sel.addEventListener("change", function () { window.OOMGuard.setNiveauNotifs(sel.value); });
      })();

      // 📔 v1.92.0 — Carnet des sorties, réglage GLOBAL rapatrié du mode plan.
      // Le module est la source de vérité (clé dédiée, pas app_user_prefs) :
      // on lit et on écrit par lui, jamais en touchant localStorage ici.
      (function _initCarnetHome() {
        const cb = document.getElementById("loaderJournalCb");
        if (!cb) return;
        if (!window.Journal || typeof window.Journal.setEnabled !== "function") {
          // Module absent : la case mentirait. On la retire plutôt que de la
          // laisser cliquable sans effet.
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

      // 🛰️ v1.85.2 — Options via capteur, côté ACCUEIL (demande KARMA :
      // « elles ont plus de pertinence en HOME »). Même état que la modale du
      // mode plan — `APP_CONFIG` + `app_user_prefs` —, donc aucune divergence
      // possible entre les deux écrans.
      const batRowH = document.getElementById("loaderBatterieRow");
      const batCbH  = document.getElementById("loaderBatterieCb");
      if (batRowH && batCbH) {
        if (typeof navigator.getBattery !== "function") {
          // 🩸 Affiché et expliqué, jamais masqué : cacher la ligne laissait
          // croire que l'option n'existe pas.
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

      // 🧩 01/10/2026 — 🎬 Replay / 🔥 Heatmap (Fonctionnalités optionnelles).
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
            // 🩸 v1.85.2 — meme correctif qu en ⚙️ Parametres : on n annonce
            // le verrou qu une fois qu il est REELLEMENT pose.
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
          // Sync UI si le state change ailleurs (ex: toggle dans ⚙️ Réglages
          // map mode pendant que la home est ouverte en arrière-plan)
          window.WakeLock.onChange(function(state) {
            if (loaderWlCb && loaderWlCb.checked !== state.enabled) {
              loaderWlCb.checked = state.enabled;
            }
          });
        }
        // Sinon : row caché par défaut (display:none HTML), pas de message.
      }

      // ═══════════════════════════════════════════════════════════════
      // 🔒 NETWORK AUDIT (v1.8.0 "Privacy & Audit")
      // ═══════════════════════════════════════════════════════════════
      // Section "🔒 Confidentialité & Audit" de la modale Configuration :
      //   - 📋 Voir le journal réseau → ouvre #loaderNetLogModal (live)
      //   - 📖 Que fait l'app sur le réseau ? → ouvre #loaderNetDocModal
      //   - 🗺️ Vue OSM → OsmView.setOptedIn (seul accès à un tiers :
      //     le fond de carte OpenStreetMap)

      // Toggle "🗺️ Autoriser la Vue OSM"
      const osmOptInCb = document.getElementById("loaderOsmOptInCb");
      if (osmOptInCb && window.OsmView) {
        osmOptInCb.checked = window.OsmView.isOptedIn();
        osmOptInCb.addEventListener("change", function() {
          window.OsmView.setOptedIn(osmOptInCb.checked);
        });
      }

      // ── Bouton "📋 Voir le journal réseau" ──────────────────────────
      // Ouvre la modale journal live. Re-render initial + subscribe aux events.
      const netLogBtn = document.getElementById("loaderNetLogBtn");
      if (netLogBtn) {
        netLogBtn.addEventListener("click", function() { _ouvrirNetLogModal(); });
      }

      // ── Bouton "📖 Que fait l'app sur le réseau ?" ──────────────────
      const netDocBtn = document.getElementById("loaderNetDocBtn");
      if (netDocBtn) {
        netDocBtn.addEventListener("click", function() { _ouvrirNetDocModal(); });
      }

      // ── Modales « Journal réseau » + « Doc audit » ──────────────────
      // 🔀 Consolidation : l état (_netLogUnsub, CATEGORY_COLORS) et les
      // fonctions (_escapeHtml/_formatTime/_renderNetLogRow,
      // _refreshNetLogTable, _ouvrir/_fermerNetLogModal,
      // _ouvrir/_fermerNetDocModal) sont extraits dans js/loaderNetAudit.js
      // et exposés sur window. Le câblage ci-dessous (boutons/backdrop/Escape)
      // les appelle via ces globals.
      // Close ✕ + backdrop + Escape
      const netLogClose = document.getElementById("loaderNetLogClose");
      if (netLogClose) netLogClose.addEventListener("click", _fermerNetLogModal);
      const netLogModal = document.getElementById("loaderNetLogModal");
      if (netLogModal) {
        netLogModal.addEventListener("click", function(e) {
          if (e.target === netLogModal) _fermerNetLogModal();
        });
      }

      // Boutons d'action de la modale journal
      const netLogCopy = document.getElementById("loaderNetLogCopy");
      if (netLogCopy) {
        netLogCopy.addEventListener("click", function() {
          if (!window.NetworkAudit) return;
          const txt = window.NetworkAudit.exportJson();
          var _tNL = function(key, fr) {
            return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(key) : fr;
          };
          if (navigator.clipboard) {
            navigator.clipboard.writeText(txt).then(function() {
              netLogCopy.textContent = _tNL("home.netlog.copied", "✓ Copié");
              setTimeout(function() { netLogCopy.textContent = _tNL("home.netlog.copyBtn", "📋 Copier"); }, 1500);
            }).catch(function() {
              alert(_tNL("home.netlog.copyFail", "Copie échouée — sélectionne manuellement."));
            });
          } else {
            alert(_tNL("home.netlog.copyUnavailable", "Clipboard API indisponible. Utilise plutôt 📥 Exporter."));
          }
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

      // ── Modale « Doc audit » : fonctions dans js/loaderNetAudit.js ──
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
          // Ouvre la doc complète dans un nouvel onglet. On vise le .html
          // (page formatée standalone) PAS le .md brut. Raison : le SW
          // intercepte tout fetch et a un fallback `caches.match(index.html)`
          // pour les requests type "document" qui échouent → si on pointait
          // sur le .md et qu'il n'est pas (encore) dans le cache, le SW
          // servirait le splash index.html à la place → confusion totale
          // pour l'user. Le .html est dans ASSETS_TO_CACHE depuis v1.8.0
          // donc toujours dispo offline. Path same-origin → passe la CSP.
          window.open("docs/applications/NETWORK_AUDIT.html", "_blank", "noopener,noreferrer");
        });
      }

      // Escape global : ferme journal/doc d'abord avant les autres modales
      document.addEventListener("keydown", function(e) {
        if (e.key !== "Escape") return;
        const logM = document.getElementById("loaderNetLogModal");
        const docM = document.getElementById("loaderNetDocModal");
        if (logM && logM.style.display !== "none") { _fermerNetLogModal(); return; }
        if (docM && docM.style.display !== "none") { _fermerNetDocModal(); return; }
      });

      // ═══════════════════════════════════════════════════════════════

      // 🔀 Consolidation : modales de gestion du Service Worker
      // (_afficherConfirmForceUpdate / _afficherConfirmKillSw /
      // _afficherKillSwOfflineRefus) extraites dans js/loaderSwModals.js
      // (exposées sur window). Le câblage (boutons update/kill SW plus haut)
      // les appelle via ces globals.
      // (l'export chargerPlanDuRegistre ex-ligne 5918 vit désormais dans homeLoader.js)
    });
