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
          if (e.key === "Escape" && configModal.style.display !== "none") {
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
        _refresh();
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
            alert("Module IncognitoMode indisponible. Recharge la page.");
            return;
          }
          if (window.IncognitoMode.active) {
            if (confirm("Quitter le mode incognito ?\n\nTous les points/notes/tracker accumulés dans cette fenêtre seront perdus.")) {
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

      // === BOUTON 🔒 VERROUILLER L'APPLICATION (v1.14.11) ===
      // KARMA : « plutôt que éteindre qui sert à rien, on fait verrouiller
      // (si password actif) ».
      //
      // Remplace l'ancien bouton 🔌 Shutdown (v1.14.8-v1.14.10) qui était
      // largement bloqué par window.close() refusé sur les onglets web
      // classiques.
      //
      // Flow :
      //   1. Si PinLock pas activé → modale info « Aucun mot de passe »
      //      avec bouton qui ouvre la modale ⚙️ Configuration.
      //   2. Si PinLock activé → modale confirm « Verrouiller MyKTAMap ? » →
      //      si oui → cleanup modules actifs → location.reload() → au boot,
      //      la gate PIN s'affiche (cf. js/main.js qui appelle
      //      MyKTAMapPinLock.ouvrirGate si isEnabled && !isUnlocked).

      // Modale d'info « pas de PIN configuré » — pattern charte MyKTAMap.
      function _afficherLockNoPinInfo() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        const old = document.getElementById("kta-lock-nopin-modal");
        if (old) old.remove();

        const modal = document.createElement("div");
        modal.id = "kta-lock-nopin-modal";
        modal.className = "kta-readme-modal-overlay kta-lock-nopin-overlay";
        modal.innerHTML =
          '<div class="kta-readme-modal-boite kta-lock-nopin-boite">' +
            '<div class="kta-readme-modal-header">' +
              '<span class="kta-readme-modal-titre">' + _t("home.lock.noPinTitle") + '</span>' +
              '<button class="kta-panneau-close" id="kta-lock-nopin-close" type="button" aria-label="' + _t("home.lock.close") + '">✕</button>' +
            '</div>' +
            '<div class="kta-readme-modal-corps kta-lock-nopin-corps">' +
              '<div class="kta-lock-nopin-icone">🔐</div>' +
              '<p class="kta-lock-nopin-msg">' +
                _t("home.lock.noPinMsg") +
              '</p>' +
              '<p class="kta-lock-nopin-hint">' +
                '<em>' + _t("home.lock.noPinHint") + '</em>' +
              '</p>' +
            '</div>' +
            '<div class="kta-lock-nopin-actions">' +
              '<button class="kta-btn kta-btn-ghost" id="kta-lock-nopin-cancel" type="button">' + _t("home.lock.close") + '</button>' +
              '<button class="kta-btn kta-btn-primary kta-lock-nopin-ok" id="kta-lock-nopin-config" type="button">' +
                _t("home.lock.openConfig") +
              '</button>' +
            '</div>' +
          '</div>';
        document.documentElement.appendChild(modal);

        function _close() {
          modal.remove();
          document.removeEventListener("keydown", _onKey);
        }
        function _onKey(e) {
          if (e.key === "Escape" || e.key === "Enter") _close();
        }
        document.getElementById("kta-lock-nopin-close").addEventListener("click", _close);
        document.getElementById("kta-lock-nopin-cancel").addEventListener("click", _close);
        document.getElementById("kta-lock-nopin-config").addEventListener("click", function() {
          _close();
          if (typeof _ouvrirLoaderConfig === "function") _ouvrirLoaderConfig();
        });
        modal.addEventListener("click", function(e) { if (e.target === modal) _close(); });
        document.addEventListener("keydown", _onKey);

        setTimeout(function() {
          const okBtn = document.getElementById("kta-lock-nopin-config");
          if (okBtn) okBtn.focus();
        }, 50);
      }

      // Modale confirm « Verrouiller MyKTAMap ? » — pattern charte, accent
      // bleu (action neutre/sécurité, pas destructive comme l'ancien shutdown).
      function _confirmLock() {
        const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
        return new Promise(function(resolve) {
          const old = document.getElementById("kta-lock-confirm-modal");
          if (old) old.remove();

          const modal = document.createElement("div");
          modal.id = "kta-lock-confirm-modal";
          modal.className = "kta-readme-modal-overlay kta-lock-confirm-overlay";
          modal.innerHTML =
            '<div class="kta-readme-modal-boite kta-lock-confirm-boite">' +
              '<div class="kta-readme-modal-header">' +
                '<span class="kta-readme-modal-titre">' + _t("home.lock.confirmTitle") + '</span>' +
                '<button class="kta-panneau-close" id="kta-lock-confirm-close" type="button" aria-label="' + _t("home.lock.cancel") + '">✕</button>' +
              '</div>' +
              '<div class="kta-readme-modal-corps kta-lock-confirm-corps">' +
                '<div class="kta-lock-confirm-icone">🔒</div>' +
                '<p class="kta-lock-confirm-msg">' +
                  _t("home.lock.confirmMsg") +
                '</p>' +
                '<p class="kta-lock-confirm-hint">' +
                  '<em>' + _t("home.lock.confirmHint") + '</em>' +
                '</p>' +
              '</div>' +
              '<div class="kta-lock-confirm-actions">' +
                '<button class="kta-btn kta-btn-ghost" id="kta-lock-confirm-cancel" type="button">' + _t("home.lock.cancel") + '</button>' +
                '<button class="kta-btn kta-btn-primary kta-lock-confirm-ok" id="kta-lock-confirm-ok" type="button">' +
                  _t("home.lock.confirmOk") +
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
          document.getElementById("kta-lock-confirm-close").addEventListener("click", function() { _close(false); });
          document.getElementById("kta-lock-confirm-cancel").addEventListener("click", function() { _close(false); });
          document.getElementById("kta-lock-confirm-ok").addEventListener("click", function() { _close(true); });
          modal.addEventListener("click", function(e) { if (e.target === modal) _close(false); });
          document.addEventListener("keydown", _onKey);

          setTimeout(function() {
            const okBtn = document.getElementById("kta-lock-confirm-ok");
            if (okBtn) okBtn.focus();
          }, 50);
        });
      }

      const lockBtn = document.getElementById("loaderLockBtn");
      if (lockBtn) {
        lockBtn.addEventListener("click", function() {
          const pinActif = !!(window.MyKTAMapPinLock && window.MyKTAMapPinLock.isEnabled && window.MyKTAMapPinLock.isEnabled());
          if (!pinActif) {
            _afficherLockNoPinInfo();
            return;
          }
          _confirmLock().then(function(ok) {
            if (!ok) return;
            // Cleanup défensif des modules potentiellement actifs (mêmes que
            // l'ancien shutdown — on coupe avant reload pour éviter qu'un
            // intervalle de tracker continue à écrire pendant le teardown).
            function _safeCall(fn, label) {
              try { if (typeof fn === "function") fn(); }
              catch(e) { console.warn("[Lock] cleanup " + label + " :", e); }
            }
            _safeCall(window.Tracker && window.Tracker.stop, "Tracker.stop");
            _safeCall(window.EmergencyMode && window.EmergencyMode.desactiver, "EmergencyMode.desactiver");
            // 🐛 v1.79.3 — visait window.TrackerReplay.arreter : mauvais nom
            // (MyKTAMapTrackerReplay) ET méthode inexistante (l'API est
            // ouvrirModale/fermer) → no-op silencieux depuis sa naissance.
            // Impact réel nul (location.reload() suit), corrigé pour que le
            // cleanup fasse ce qu'il annonce.
            _safeCall(window.MyKTAMapTrackerReplay && window.MyKTAMapTrackerReplay.fermer, "MyKTAMapTrackerReplay.fermer");
            _safeCall(window.OOMGuard && window.OOMGuard.stop, "OOMGuard.stop");
            _safeCall(window.LostMode && window.LostMode.desactiver, "LostMode.desactiver");

            // Reload → main.js détecte isEnabled() && !isUnlocked() → affiche
            // la gate PIN avant la suite de l'init. L'user devra saisir le
            // code pour reprendre.
            location.reload();
          });
        });
      }

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

      // === SYNC TOGGLES PERF ULTRA dans le loader (drawer perf) ===
      // À l'ouverture du loader, on synchronise les checkboxes avec l'état
      // PerfUltra actuel. Au clic d'un toggle, on appelle PerfUltra.set() qui
      // persiste + notify les modules consommateurs. Le master "ULTRA" est
      // sync auto via isUltra() (coché si les 6 individuels le sont).
      (function _initPerfUltraToggles() {
        if (!window.PerfUltra) return;
        const ultraEl = document.getElementById("loader_perf_ultra");
        const map = {
          "loader_perf_decim":           "decim",
          "loader_perf_animOff":         "animOff",
          "loader_perf_noIntersect":     "noIntersect",
          "loader_perf_noTooltips":      "noTooltips",
          "loader_perf_slowSave":        "slowSave",
          "loader_perf_viewportCull":    "viewportCull",
          // 🆕 v1.9.2-hotfix-loader-zoom : 7e toggle ajouté pour parité
          // avec la modale Configuration in-map (cf. interface.js
          // _bindPerfUltraToggles ligne ~1571).
          "loader_perf_mobileZoomLimit": "mobileZoomLimit"
        };
        // Sync visuel initial
        Object.keys(map).forEach(function(id) {
          const el = document.getElementById(id);
          if (el) el.checked = window.PerfUltra.get(map[id]);
        });
        if (ultraEl) ultraEl.checked = window.PerfUltra.isUltra();
        // Bind master ULTRA
        if (ultraEl) {
          ultraEl.addEventListener("change", function() {
            window.PerfUltra.setUltra(ultraEl.checked);
            // Re-sync visuel des 6 toggles
            Object.keys(map).forEach(function(id) {
              const el = document.getElementById(id);
              if (el) el.checked = window.PerfUltra.get(map[id]);
            });
          });
        }
        // Bind toggles individuels
        Object.keys(map).forEach(function(id) {
          const el = document.getElementById(id);
          if (!el) return;
          el.addEventListener("change", function() {
            window.PerfUltra.set(map[id], el.checked);
            // Re-sync visuel du master (coché si les 6 le sont)
            if (ultraEl) ultraEl.checked = window.PerfUltra.isUltra();
          });
        });
      })();

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
        el.textContent = installed;
        el.title = "Version installée : " + installed + " — clique pour voir les notes ou vérifier les mises à jour";

        function _evaluerEtAfficher(remoteVersion) {
          if (!remoteVersion || remoteVersion === installed) {
            // Pas d'update dispo → état normal (mais toujours cliquable)
            el.classList.remove("kta-loader-copyright-version-update");
            el.textContent = installed;
            el.title = "Version installée : " + installed + " — clique pour voir les notes ou vérifier les mises à jour";
            return;
          }
          // Update disponible → badge bleu clignotant
          el.classList.add("kta-loader-copyright-version-update");
          el.textContent = installed + " → " + remoteVersion;
          el.title = "Nouvelle version disponible : " + remoteVersion + " — clique pour mettre à jour";
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

      // v1.7.3 : section "Plus d'options" retirée du loader (boutons
      // déplacés dans la modale ⚙️ Configuration). Les IDs #advancedHead,
      // #advancedBox, #advancedChevron n'existent plus dans le DOM.
      // Le bloc collapse handler est retiré aussi (devenu inutile).

      // === BOUTON "💥 TOUT RÉINITIALISER" ===
      const resetBtn = document.getElementById("loaderResetBtn");
      if (resetBtn) {
        resetBtn.addEventListener("click", function() {
          if (typeof window.viderCacheAppli === "function") {
            window.viderCacheAppli();
          } else {
            setStatus("Fonction de réinitialisation indisponible", true);
          }
        });
      }

      // === BOUTON "🔄 FORCER LA MISE À JOUR" (v1.7.3) ===
      // "Reset lite" : purge cache SW + reload → récupère la dernière
      // version. Préserve TOUTES les données user (localStorage,
      // IndexedDB, sessions). Helper window.mettreAJourCodeSeul existe
      // déjà depuis l'UpdateChecker — on le réutilise tel quel.
      //
      // 🆕 v1.7.3 (fix KARMA) : garde-fou de confirmation. Avant : un seul
      // clic déclenchait le pipeline (ping → purge cache → reload). Trop
      // facile à déclencher par erreur, et l'action implique un reload
      // immédiat. Maintenant : modale custom (pattern `kta-readme-modal-
      // overlay`) qui explique ce qui se passe + ce qui est préservé,
      // demande confirmation explicite. Reste plus léger que le double
      // confirm du Reset complet — c'est cohérent avec la sémantique
      // "douce" de l'action (rien n'est supprimé).
      //
      // Note : on ne réplique PAS le ping internet ici — il existe déjà
      // dans `mettreAJourCodeSeul()` (cf. js/interface.js ligne 1859)
      // qui affiche `_softUpdateOfflineWarning()` si offline.
      const forceUpdateBtn = document.getElementById("loaderForceUpdateBtn");
      if (forceUpdateBtn) {
        forceUpdateBtn.addEventListener("click", function() {
          _afficherConfirmForceUpdate().then(function(ok) {
            if (!ok) return;
            if (typeof window.mettreAJourCodeSeul === "function") {
              window.mettreAJourCodeSeul();
            } else {
              setStatus("Fonction de mise à jour indisponible", true);
            }
          });
        });
      }

      // 🆘 v1.37.0 — Bouton "Désinscrire le Service Worker" (kill SW).
      // Double garde-fou :
      //   1. Ping Internet AVANT la modale — refus immédiat si offline ou
      //      serveur KO (car re-download des assets requis au prochain boot).
      //      Sans Internet l'app deviendrait inutilisable après le kill.
      //   2. Modale de confirmation (pattern Promise-based aligné sur
      //      _afficherConfirmForceUpdate) — l'user doit valider explicitement.
      const killSwBtn = document.getElementById("loaderKillSwBtn");
      if (killSwBtn) {
        killSwBtn.addEventListener("click", async function() {
          // 🆘 v1.37.0 — Overlay "Vérification…" pendant le ping (5s max).
          // Sinon l'user ne voit RIEN se passer entre clic et résultat
          // (KARMA "l'user sais pas qu'il se passe un truc"). Pattern
          // overlay simple créé inline + auto-remove dans le finally.
          const waitOverlay = document.createElement("div");
          waitOverlay.className = "kta-modal-overlay";
          waitOverlay.style.cssText = "z-index:100050;";  // au-dessus de la modale Config
          waitOverlay.innerHTML =
            '<div class="kta-modal" style="max-width:340px;">' +
              '<div class="kta-modal-icon" style="font-size:32px;">⏳</div>' +
              '<div class="kta-modal-titre">Vérification de la connexion…</div>' +
              '<div class="kta-modal-texte" style="font-size:13px; color:#8892a4;">Test du serveur MyKTAMap (jusqu\'à 5 s).</div>' +
            '</div>';
          document.documentElement.appendChild(waitOverlay);

          // Garde-fou 1 : ping Internet. Refuser si offline.
          // Si _pingInternet n'est pas exposé (timing de chargement),
          // fallback sur navigator.onLine (moins fiable, juste OS-level).
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
        });
      }

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

      // 🆕 v1.43.12 — 🔧 Inspecteur Service Worker. Ouvre la modale de
      // diagnostic du cache PWA : compare ASSETS_TO_CACHE (attendus) avec
      // le contenu réel du cache. Verdict + bouton récupération manuels.
      // Module js/swInspector.js chargé à proximité de memInspector.
      const swInspectBtn = document.getElementById("loaderSwInspectorBtn");
      if (swInspectBtn) {
        swInspectBtn.addEventListener("click", function() {
          if (window.SwInspector && typeof window.SwInspector.ouvrir === "function") {
            window.SwInspector.ouvrir();
          } else {
            setStatus("Module SwInspector indisponible — recharge la page", true);
          }
        });
      }

      // 🆕 v1.43.13 — Auto-heal silencieux du cache SW. Tire ~5s après le
      // boot pour laisser le SW finir son install. Garde-fous internes
      // (online, SW ready, pas incognito/strict-offline, 1x par session,
      // cap 100 fetches). Output en console uniquement, pas de toast user.
      // Concept : si l'install initial a foiré sur 44 assets, l'user n'a
      // plus à le savoir — le cache se répare tout seul au prochain boot.
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
      const loaderWlRow = document.getElementById("loaderWakeLockRow");
      const loaderWlCb  = document.getElementById("loaderWakeLockCb");
      if (loaderWlRow && loaderWlCb && window.WakeLock) {
        if (window.WakeLock.isSupported()) {
          loaderWlRow.style.display = "";  // révèle (default = none)
          loaderWlCb.checked = window.WakeLock.isEnabled();
          loaderWlCb.addEventListener("change", function() {
            window.WakeLock.setEnabled(loaderWlCb.checked);
            if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
              window.OOMGuard.showToast(
                loaderWlCb.checked
                  ? "🔆 Écran maintenu allumé tant que l'app est ouverte"
                  : "🔅 Mise en veille écran ré-activée",
                "info"
              );
            }
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
      // 3 boutons + 1 toggle dans la section "🔒 Confidentialité & Audit"
      // de la modale Configuration :
      //   - 📋 Voir le journal réseau → ouvre #loaderNetLogModal (live)
      //   - 📖 Que fait l'app sur le réseau ? → ouvre #loaderNetDocModal
      //   - 🔒 Mode hors-ligne strict → toggle window.NetworkAudit
      //
      // Le badge "MODE HORS-LIGNE STRICT" dans le footer est mis à jour via
      // window._kta_majBadgeParanoia (appelé par NetworkAudit.setParanoia).

      // ── Helper : maj du badge paranoia + sync checkbox ──────────────
      window._kta_majBadgeParanoia = function() {
        const isOn = !!(window.NetworkAudit && window.NetworkAudit.isParanoia());
        const badge = document.getElementById("loaderParanoiaBadge");
        if (badge) badge.style.display = isOn ? "block" : "none";
        const cb = document.getElementById("loaderNetParanoiaCb");
        if (cb) cb.checked = isOn;
      };

      // ── Init : sync checkbox + badge depuis l'état actuel ───────────
      try { window._kta_majBadgeParanoia(); } catch(e) {}

      // ── Badge cliquable → ouvre la modale Configuration ─────────────
      const paranoiaBadge = document.getElementById("loaderParanoiaBadge");
      if (paranoiaBadge) {
        paranoiaBadge.addEventListener("click", function() {
          _ouvrirLoaderConfig();
        });
      }

      // ── Toggle "🔒 Mode hors-ligne strict" ──────────────────────────
      const paranoiaCb = document.getElementById("loaderNetParanoiaCb");
      if (paranoiaCb) {
        paranoiaCb.addEventListener("change", function() {
          if (window.NetworkAudit) {
            window.NetworkAudit.setParanoia(paranoiaCb.checked);
          }
        });
      }

      // 🆕 v1.39.0 — Toggle "🗺️ Autoriser la Vue OSM"
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
          // donc toujours dispo offline. Path same-origin → passe la CSP
          // et le mode paranoia.
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
