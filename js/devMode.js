/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// DEVMODE.JS — Mode Développeur (section « Debug » de la ⚙️ Configuration de l'accueil)
// =========================
//   - Activation libre, sans mot de passe (décision produit) : un utilisateur doit pouvoir allumer les logs
//     détaillés et envoyer son journal sans rien demander. Une confirmation (window.ktaConfirm) dit ce que fait
//     le mode à chaque passage de OFF à ON ; l'état est mémorisé par appareil (LS_ACTIVE).
//   - Contenu : logs détaillés (pilote setDebugMode global), « Afficher les logs » (Copier, Exporter (.txt),
//     js/debug.js), ConfAdmin, inspecteur Service Worker (js/swInspector.js), outils d'extension
//     (prise « outilsDev »).
//     Rien de secret : confadmin.html et les pages d'outils sont publiques, le reste lit l'appareil lui-même.
//   - 🩸 PAS de bibliothèque de docs : lire README.md et docs/ sur le serveur obligerait à les DÉPLOYER, donc à les
//     publier. Les sites ne reçoivent que docs/applications/. Garde-fou : scripts/check-devmode-docs.js.
// Accueil seulement : rien en mode carte.

(function() {
  "use strict";

  const LS_ACTIVE = "myktamap_devmode_active_v1";   // "1" = mode actif
  // Clés de l'ancienne porte à mot de passe : effacées au chargement (un appareil déjà actif le reste).
  const LS_OBSOLETES = ["myktamap_devmode_unlock_v1", "myktamap_devmode_tries_v1"];
  try { LS_OBSOLETES.forEach(function(k) { localStorage.removeItem(k); }); } catch(e) {}

  function t(k, p) { return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k; }

  function isActive() {
    try { return localStorage.getItem(LS_ACTIVE) === "1"; } catch(e) { return false; }
  }

  // Confirmation d'activation : le texte vient du dico (balisage voulu), aucune donnée d'utilisateur.
  function _confirmerActivation() {
    if (typeof window.ktaConfirm !== "function") return Promise.resolve(true);
    return window.ktaConfirm(t("devmode.activer.avertissement"), {
      titre: window.ktaIcone("code-xml") + " " + t("devmode.activer.titre"),
      okLabel: t("devmode.activer.btn"),
      id: "kta-devmode-confirm"
    });
  }

  function _outilsExt() {
    return (window.KtaExtensions && typeof window.KtaExtensions.outilsDev === "function") ? window.KtaExtensions.outilsDev() : [];
  }

  // ── Section de l'accueil (peuple le conteneur d'index.html) ──
  function initSection() {
    const wrap = document.getElementById("kta-devmode-wrap");
    if (!wrap) return;
    const rendre = function() {
      const actif = isActive();
      wrap.innerHTML = '' +
        '<button class="loader-btn-secondary kta-debug-toggle" type="button" id="kta-devmode-toggle" aria-pressed="' + (actif ? "true" : "false") + '" style="width:100%;">' +
          window.ktaIcone("code-xml") + ' ' + t("devmode.toggleLabel") + ' : <strong>' + (actif ? "ON" : "OFF") + '</strong>' +
        '</button>' +
        (actif ? (
          '<button class="loader-btn-secondary kta-debug-toggle" type="button" id="kta-devmode-logs-toggle" style="width:100%; margin-top:8px;">' +
            window.ktaIcone("bug") + ' ' + t("home.debug.logsLabel") + ' <strong>' + ((window.APP_CONFIG && window.APP_CONFIG.debugMode) ? "ON" : "OFF") + '</strong>' +
          '</button>' +
          '<button class="loader-btn-secondary" type="button" id="kta-devmode-logs-show" style="width:100%; margin-top:8px;">' +
            window.ktaIcone("scroll-text") + ' ' + t("home.debug.showLogs") + '</button>' +
          '<button class="loader-btn-secondary" type="button" id="kta-devmode-confadmin" style="width:100%; margin-top:8px;">' +
            window.ktaIcone("server-cog") + ' ' + t("devmode.confadmin") + '</button>' +
          '<button class="loader-btn-secondary" type="button" id="loaderSwInspectorBtn" style="width:100%; margin-top:8px;">' +
            window.ktaIcone("gauge") + ' ' + t("home.inspector.swBtn") + '</button>' +
          _outilsExt().map(function(o, i) {
            return '<button class="loader-btn-secondary" type="button" data-devmode-outil="' + i + '" style="width:100%; margin-top:8px;"></button>';
          }).join("")
        ) : (
          '<p class="kta-loader-perf-hint" style="margin-top:8px;">' + t("devmode.hintOff") + '</p>'
        ));
      const toggle = document.getElementById("kta-devmode-toggle");
      toggle.addEventListener("click", async function() {
        if (isActive()) {
          try { localStorage.setItem(LS_ACTIVE, "0"); } catch(e) {}
          rendre();
          return;
        }
        if (!(await _confirmerActivation())) return;
        try { localStorage.setItem(LS_ACTIVE, "1"); } catch(e) {}
        rendre();
      });
      if (actif) {
        document.getElementById("kta-devmode-logs-toggle").addEventListener("click", function() {
          if (typeof window.setDebugMode === "function") {
            window.setDebugMode(!(window.APP_CONFIG && window.APP_CONFIG.debugMode));
          }
          rendre();
        });
        document.getElementById("kta-devmode-logs-show").addEventListener("click", function() {
          if (typeof window.afficherLogsDebug === "function") window.afficherLogsDebug();
        });
        document.getElementById("kta-devmode-confadmin").addEventListener("click", function() {
          // Page statique du dépôt, dans un onglet à part : elle ne doit pas remplacer la session en cours.
          try { window.open("confadmin.html", "_blank", "noopener"); }
          catch (e) { console.warn("[DevMode] Ouverture confadmin.html :", e); }
        });
        // Inspecteur Service Worker. Pour tous, l'état du cache hors ligne est la pastille du pied de page.
        const outils = _outilsExt();
        wrap.querySelectorAll("[data-devmode-outil]").forEach(function(b) {
          const o = outils[Number(b.getAttribute("data-devmode-outil"))];
          if (!o) return;
          b.textContent = o.libelle;   // texte de l'extension : jamais en HTML
          b.addEventListener("click", function() {
            try { window.open(o.page, "_blank", "noopener"); } catch (e) { console.warn("[DevMode] outil :", e); }
          });
        });
        document.getElementById("loaderSwInspectorBtn").addEventListener("click", function() {
          if (window.SwInspector && typeof window.SwInspector.ouvrir === "function") window.SwInspector.ouvrir();
          else console.warn("[DevMode] Module SwInspector indisponible");
        });
      }
    };
    // 🩸 onChange ne se déclenche PAS au chargement initial du dico (seulement setLang / reload) : le rendu passe
    // par I18n.init().then(render) (barrière idempotente, cf. langManager) ; onChange reste pour les changements
    // de langue.
    if (window.I18n && typeof window.I18n.onChange === "function" && !window._devModeI18nHooked) {
      window._devModeI18nHooked = true;
      window.I18n.onChange(rendre);
      window.addEventListener("mktm:extensions-changees", rendre);
    }
    if (window.I18n && typeof window.I18n.init === "function") {
      window.I18n.init().then(rendre);
      return;
    }
    rendre();
  }

  window.DevMode = {
    isActive: isActive,
    initSection: initSection
  };
})();
