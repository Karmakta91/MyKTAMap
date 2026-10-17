/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// DEVMODE.JS — Mode Développeur (section « Debug » de la ⚙️ Configuration de l'accueil)
// =========================
//   - 🔒 Activation protégée par MOT DE PASSE à la première fois (hash SHA-256 en dur, jamais le mot de passe ;
//     5 tentatives puis temporisation de 60 s ; déverrouillage mémorisé par appareil) + avertissement.
//   - Contenu : logs détaillés (pilote setDebugMode global), « Afficher les logs », ConfAdmin, inspecteur Service
//     Worker (js/swInspector.js), outils d'extension (prise « outilsDev »).
//   - 🩸 PAS de bibliothèque de docs : lire README.md et docs/ sur le serveur obligerait à les DÉPLOYER, donc à les
//     publier (le mot de passe ne protège que la liste, pas les fichiers). Les sites ne reçoivent que
//     docs/applications/. Garde-fou : scripts/check-devmode-docs.js.
// Accueil seulement : rien en mode carte.

(function() {
  "use strict";

  // 🔒 Hash SHA-256 du mot de passe (le changer : echo -n "<mdp>" | openssl dgst -sha256 ; les appareils déjà
  // déverrouillés le redemanderont).
  const DEV_HASH   = "cf54ce09daddca0545b4bf38455cacc2fef9f52379d187e0023228b84077db49";
  const LS_UNLOCK  = "myktamap_devmode_unlock_v1";   // hash validé
  const LS_ACTIVE  = "myktamap_devmode_active_v1";   // "1" = mode actif
  const LS_TRIES   = "myktamap_devmode_tries_v1";    // JSON {n, until}
  const MAX_TRIES  = 5;
  const LOCK_MS    = 60000;

  function t(k, p) { return (window.I18n && window.I18n.t) ? window.I18n.t(k, p) : k; }

  async function _sha256(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function isUnlocked() {
    try { return localStorage.getItem(LS_UNLOCK) === DEV_HASH; } catch(e) { return false; }
  }
  function isActive() {
    try { return isUnlocked() && localStorage.getItem(LS_ACTIVE) === "1"; } catch(e) { return false; }
  }

  function _lireTries() {
    try { return JSON.parse(localStorage.getItem(LS_TRIES) || "{}"); } catch(e) { return {}; }
  }
  function _ecrireTries(o) {
    try { localStorage.setItem(LS_TRIES, JSON.stringify(o)); } catch(e) {}
  }

  // ── Modale mot de passe (1re activation) ──
  function _demanderMdp() {
    return new Promise(function(resolve) {
      const ov = document.createElement("div");
      ov.className = "kta-readme-modal-overlay";
      ov.style.zIndex = "100002";
      ov.innerHTML = '' +
        '<div class="kta-readme-modal-boite" style="max-width:440px; height:auto; max-height:85vh;">' +
          '<div class="kta-readme-modal-entete">' +
            '<span class="kta-readme-modal-titre">🛠️ ' + t("devmode.gate.titre") + '</span>' +
            '<button class="kta-panneau-close" id="kta-dev-gate-close">✕</button>' +
          '</div>' +
          '<div class="kta-readme-modal-corps" style="font-size:13px;">' +
            '<div style="border:1px solid rgba(255,120,80,0.5); background:rgba(255,120,80,0.08); border-radius:8px; padding:10px 12px; margin-bottom:12px; line-height:1.5;">' +
              '⚠️ ' + t("devmode.gate.avertissement") +
            '</div>' +
            '<label class="kta-cfg-label" for="kta-dev-gate-input">' + t("devmode.gate.label") + '</label>' +
            '<input class="kta-cfg-input" id="kta-dev-gate-input" type="password" autocomplete="off" style="width:100%; margin-top:4px;">' +
            '<div id="kta-dev-gate-err" style="display:none; color:#ff7850; font-size:12px; margin-top:6px;"></div>' +
            '<div class="kta-conv-actions" style="margin-top:14px;">' +
              '<button class="kta-btn kta-btn-ghost"   id="kta-dev-gate-annuler">' + t("ui.confirm.cancel") + '</button>' +
              '<button class="kta-btn kta-btn-primary" id="kta-dev-gate-ok">' + t("devmode.gate.btn") + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(ov);
      const input = ov.querySelector("#kta-dev-gate-input");
      const errEl = ov.querySelector("#kta-dev-gate-err");
      const finir = function(ok) { ov.remove(); resolve(ok); };
      ov.querySelector("#kta-dev-gate-close").addEventListener("click", function() { finir(false); });
      ov.querySelector("#kta-dev-gate-annuler").addEventListener("click", function() { finir(false); });
      ov.addEventListener("click", function(e) { if (e.target === ov) finir(false); });
      const valider = async function() {
        const tries = _lireTries();
        if (tries.until && Date.now() < tries.until) {
          errEl.style.display = "";
          errEl.textContent = t("devmode.gate.lockout", { s: Math.ceil((tries.until - Date.now()) / 1000) });
          return;
        }
        const h = await _sha256(input.value || "");
        if (h === DEV_HASH) {
          try { localStorage.setItem(LS_UNLOCK, DEV_HASH); localStorage.removeItem(LS_TRIES); } catch(e) {}
          finir(true);
          return;
        }
        const n = (tries.until ? 0 : (tries.n || 0)) + 1;
        _ecrireTries(n >= MAX_TRIES ? { n: 0, until: Date.now() + LOCK_MS } : { n: n });
        errEl.style.display = "";
        errEl.textContent = (n >= MAX_TRIES)
          ? t("devmode.gate.lockout", { s: LOCK_MS / 1000 })
          : t("devmode.gate.mauvais", { rest: MAX_TRIES - n });
        input.value = "";
      };
      ov.querySelector("#kta-dev-gate-ok").addEventListener("click", valider);
      input.addEventListener("keydown", function(e) { if (e.key === "Enter") valider(); });
      setTimeout(function() { try { input.focus(); } catch(e) {} }, 30);
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
          '🛠️ ' + t("devmode.toggleLabel") + ' : <strong>' + (actif ? "ON" : "OFF") + '</strong>' +
        '</button>' +
        (actif ? (
          '<button class="loader-btn-secondary kta-debug-toggle" type="button" id="kta-devmode-logs-toggle" style="width:100%; margin-top:8px;">' +
            '🐛 ' + t("home.debug.logsLabel") + ' <strong>' + ((window.APP_CONFIG && window.APP_CONFIG.debugMode) ? "ON" : "OFF") + '</strong>' +
          '</button>' +
          '<button class="loader-btn-secondary" type="button" id="kta-devmode-logs-show" style="width:100%; margin-top:8px;">' + t("home.debug.showLogs") + '</button>' +
          '<button class="loader-btn-secondary" type="button" id="kta-devmode-confadmin" style="width:100%; margin-top:8px;">🏗️ ' + t("devmode.confadmin") + '</button>' +
          '<button class="loader-btn-secondary" type="button" id="loaderSwInspectorBtn" style="width:100%; margin-top:8px;">' + t("home.inspector.swBtn") + '</button>' +
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
        if (!isUnlocked()) {
          const ok = await _demanderMdp();
          if (!ok) return;
        }
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
    isUnlocked: isUnlocked,
    initSection: initSection
  };
})();
