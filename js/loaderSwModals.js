/*!
 * MyKTAMap — Modales de gestion du Service Worker (force-update / kill SW)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// LOADERSWMODALS.JS — Modales SW « Forcer la mise à jour » + « Réinitialiser
// le cache (kill SW) » du home
// =========================
// Extrait du gros <script> inline d index.html (consolidation). DÉPLACEMENT
// PUR, zéro changement de comportement. 3 modales de confirmation Promise-based
// (résolvent un booléen) auto-contenues : ne touchent que des globals
// (window.I18n, navigator.serviceWorker, caches, location).
//
// Le CÂBLAGE (boutons « Forcer la mise à jour » / « Réinitialiser le cache »
// du panneau SW) reste dans la closure window.load d index.html et appelle ces
// fonctions via les globals exposés (module chargé en `defer`).
//
// Exposé : window._afficherConfirmForceUpdate / _afficherConfirmKillSw /
//          _afficherKillSwOfflineRefus. 100 % local.
// =========================

(function() {
  "use strict";

  // Modale de confirmation pour Force update douce.
  // Promise<boolean> : true = continuer, false = annuler.
  // Pattern Promise-based identique aux modales de re-sélection ZIP
  // (cf. CLAUDE.md §35) — fermable via ✕ / backdrop / Échap / Annuler.
  function _afficherConfirmForceUpdate() {
    const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
    return new Promise(function(resolve) {
      // Cleanup éventuel d'une instance précédente
      const existing = document.getElementById("kta-force-update-confirm");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.id = "kta-force-update-confirm";
      overlay.className = "kta-readme-modal-overlay";
      overlay.style.display = "flex";

      // Accent bleu (info, action non-destructive) — différencie de la
      // modale de Reset qui est rouge (action destructive).
      overlay.innerHTML =
        // ajout de height:auto + max-height:92vh pour
        // que la modale ne prenne plus toute la hauteur de l'écran sur
        // PC (KARMA : "prend toute longueur pour rien, bcp de vide").
        // La base CSS .kta-readme-modal-boite donne désormais min(92vh,
        // 1100px) sur PC — utile pour les modales avec contenu long
        // (Doc, Aide), mais pas pour cette modale de confirmation
        // courte. height:auto rend la modale à la taille de son contenu.
        '<div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:92vh; border:1px solid rgba(140,180,255,0.4); box-shadow:0 0 32px rgba(140,180,255,0.18);">' +
          '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(140,180,255,0.25);">' +
            '<div class="kta-readme-modal-titre" style="color:#8cb4ff;">' + _t("home.maint.forceUpdate.title") + '</div>' +
            '<button class="kta-panneau-close" type="button" id="kta-fu-close" aria-label="' + _t("home.maint.cancel") + '">✕</button>' +
          '</div>' +
          '<div class="kta-readme-modal-corps" style="color:#c8d0e0;">' +
            '<p style="margin:0 0 14px 0; line-height:1.55;">' +
              _t("home.maint.forceUpdate.body") +
            '</p>' +
            '<div style="background:rgba(140,180,255,0.06); border:1px solid rgba(140,180,255,0.22); border-radius:8px; padding:10px 14px; margin-bottom:12px;">' +
              '<div style="font-weight:600; color:#8cb4ff; margin-bottom:6px;">' + _t("home.maint.forceUpdate.kept") + '</div>' +
              '<ul style="margin:0; padding-left:20px; line-height:1.6;">' +
                '<li>' + _t("home.maint.keptPlans") + '</li>' +
                '<li>' + _t("home.maint.keptSessions") + '</li>' +
                '<li>' + _t("home.maint.keptPrefs") + '</li>' +
                '<li>' + _t("home.maint.keptCode") + '</li>' +
              '</ul>' +
            '</div>' +
            '<div style="background:rgba(255,180,128,0.06); border:1px solid rgba(255,180,128,0.22); border-radius:8px; padding:10px 14px; margin-bottom:14px;">' +
              '<div style="font-weight:600; color:#ffb380; margin-bottom:6px;">' + _t("home.maint.forceUpdate.conditions") + '</div>' +
              '<ul style="margin:0; padding-left:20px; line-height:1.6;">' +
                '<li>' + _t("home.maint.forceUpdate.condInternet") + '</li>' +
                '<li>' + _t("home.maint.forceUpdate.condReload") + '</li>' +
              '</ul>' +
            '</div>' +
            '<p style="margin:0; font-style:italic; color:#8892a4; font-size:13px;">' +
              _t("home.maint.forceUpdate.hint") +
            '</p>' +
          '</div>' +
          '<div class="kta-readme-modal-footer" style="display:flex; gap:10px; justify-content:flex-end;">' +
            '<button class="kta-btn kta-btn-ghost" type="button" id="kta-fu-cancel">' + _t("home.maint.cancel") + '</button>' +
            '<button class="kta-btn kta-btn-primary" type="button" id="kta-fu-ok">' + _t("home.maint.forceUpdate.continue") + '</button>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(overlay);

      function _close(result) {
        try { overlay.remove(); } catch(e) {}
        document.removeEventListener("keydown", _onKey);
        resolve(result);
      }
      function _onKey(e) {
        if (e.key === "Escape") _close(false);
      }
      document.addEventListener("keydown", _onKey);

      overlay.addEventListener("click", function(e) {
        if (e.target === overlay) _close(false);
      });
      document.getElementById("kta-fu-close").addEventListener("click", function() { _close(false); });
      document.getElementById("kta-fu-cancel").addEventListener("click", function() { _close(false); });
      document.getElementById("kta-fu-ok").addEventListener("click", function() { _close(true); });
    });
  }

  // Modale de confirmation pour le bouton "Kill SW"
  // (ouverture de killsw.html depuis Configuration home). Calque du
  // pattern _afficherConfirmForceUpdate ci-dessus. Accent orange (entre
  // bleu info et rouge danger) car action plus impactante que la mise à
  // jour douce (re-download complet au prochain boot) mais pas
  // destructive pour les données utilisateur. Promise<bool>.
  function _afficherConfirmKillSw() {
    const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
    return new Promise(function(resolve) {
      const existing = document.getElementById("kta-killsw-confirm");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.id = "kta-killsw-confirm";
      overlay.className = "kta-readme-modal-overlay";
      overlay.style.display = "flex";

      overlay.innerHTML =
        '<div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:92vh; border:1px solid rgba(255,180,128,0.4); box-shadow:0 0 32px rgba(255,180,128,0.18);">' +
          '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,180,128,0.25);">' +
            '<div class="kta-readme-modal-titre" style="color:#ffb380;">' + _t("home.maint.killSw.title") + '</div>' +
            '<button class="kta-panneau-close" type="button" id="kta-ks-close" aria-label="' + _t("home.maint.cancel") + '">✕</button>' +
          '</div>' +
          '<div class="kta-readme-modal-corps" style="color:#c8d0e0;">' +
            '<p style="margin:0 0 14px 0; line-height:1.55;">' +
              _t("home.maint.killSw.body") +
            '</p>' +
            '<div style="background:rgba(140,180,255,0.06); border:1px solid rgba(140,180,255,0.22); border-radius:8px; padding:10px 14px; margin-bottom:12px;">' +
              '<div style="font-weight:600; color:#8cb4ff; margin-bottom:6px;">' + _t("home.maint.killSw.kept") + '</div>' +
              '<ul style="margin:0; padding-left:20px; line-height:1.6;">' +
                '<li>' + _t("home.maint.keptPlans") + '</li>' +
                '<li>' + _t("home.maint.keptSessions") + '</li>' +
                '<li>' + _t("home.maint.keptPrefs") + '</li>' +
                '<li>' + _t("home.maint.keptCode") + '</li>' +
                '<li>' + _t("home.maint.killSw.keptPhotos") + '</li>' +
              '</ul>' +
            '</div>' +
            '<div style="background:rgba(255,180,128,0.06); border:1px solid rgba(255,180,128,0.22); border-radius:8px; padding:10px 14px; margin-bottom:14px;">' +
              '<div style="font-weight:600; color:#ffb380; margin-bottom:6px;">' + _t("home.maint.killSw.effects") + '</div>' +
              '<ul style="margin:0; padding-left:20px; line-height:1.6;">' +
                '<li>' + _t("home.maint.killSw.effectRedownload") + '</li>' +
                '<li>' + _t("home.maint.killSw.effectInternet") + '</li>' +
                '<li>' + _t("home.maint.killSw.effectOffline") + '</li>' +
              '</ul>' +
            '</div>' +
            '<p style="margin:0; font-style:italic; color:#8892a4; font-size:13px;">' +
              _t("home.maint.killSw.hint") +
            '</p>' +
          '</div>' +
          '<div class="kta-readme-modal-footer" style="display:flex; gap:10px; justify-content:flex-end;">' +
            '<button class="kta-btn kta-btn-ghost" type="button" id="kta-ks-cancel">' + _t("home.maint.cancel") + '</button>' +
            '<button class="kta-btn kta-btn-primary" type="button" id="kta-ks-ok" style="background:#ffb380; color:#1a1f2e;">' + _t("home.maint.killSw.continue") + '</button>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(overlay);

      function _close(result) {
        try { overlay.remove(); } catch(e) {}
        document.removeEventListener("keydown", _onKey);
        resolve(result);
      }
      function _onKey(e) {
        if (e.key === "Escape") _close(false);
      }
      document.addEventListener("keydown", _onKey);

      overlay.addEventListener("click", function(e) {
        if (e.target === overlay) _close(false);
      });
      document.getElementById("kta-ks-close").addEventListener("click", function() { _close(false); });
      document.getElementById("kta-ks-cancel").addEventListener("click", function() { _close(false); });
      document.getElementById("kta-ks-ok").addEventListener("click", function() { _close(true); });
    });
  }

  // Modale de refus offline pour Kill SW.
  // Équivalent compact de _softUpdateOfflineWarning (interfaceMaintenance.js)
  // adapté au cas Kill SW : action ANNULÉE car re-download des assets
  // requis au prochain boot. Sans Internet → app inutilisable post-kill.
  // Pas de bouton "Continuer quand même" (cas trop dangereux). L'user
  // doit retrouver une connexion avant de relancer la désinscription.
  function _afficherKillSwOfflineRefus() {
    const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
    const existing = document.getElementById("kta-killsw-offline");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "kta-killsw-offline";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";

    overlay.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:92vh; border:1px solid rgba(255,107,107,0.4); box-shadow:0 0 32px rgba(255,107,107,0.18);">' +
        '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,107,107,0.25);">' +
          '<div class="kta-readme-modal-titre" style="color:#ff6b6b;">' + _t("home.maint.killSw.offlineTitle") + '</div>' +
          '<button class="kta-panneau-close" type="button" id="kta-kso-close" aria-label="' + _t("home.maint.cancel") + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" style="color:#c8d0e0;">' +
          '<p style="margin:0 0 14px 0; line-height:1.55;">' +
            _t("home.maint.killSw.offlineBody") +
          '</p>' +
          '<div style="background:rgba(140,180,255,0.06); border:1px solid rgba(140,180,255,0.22); border-radius:8px; padding:10px 14px; margin-bottom:14px;">' +
            '<div style="font-weight:600; color:#8cb4ff; margin-bottom:6px;">' + _t("home.maint.killSw.offlineNoLoss") + '</div>' +
            '<p style="margin:0; line-height:1.55;">' + _t("home.maint.killSw.offlineNoLossBody") + '</p>' +
          '</div>' +
          '<p style="margin:0; font-style:italic; color:#8892a4; font-size:13px;">' +
            _t("home.maint.killSw.offlineRetryHint") +
          '</p>' +
        '</div>' +
        '<div class="kta-readme-modal-footer" style="display:flex; gap:10px; justify-content:flex-end;">' +
          '<button class="kta-btn kta-btn-primary" type="button" id="kta-kso-ok">' + _t("home.maint.killSw.offlineOk") + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    function _close() {
      try { overlay.remove(); } catch(e) {}
      document.removeEventListener("keydown", _onKey);
    }
    function _onKey(e) {
      if (e.key === "Escape") _close();
    }
    document.addEventListener("keydown", _onKey);

    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) _close();
    });
    document.getElementById("kta-kso-close").addEventListener("click", _close);
    document.getElementById("kta-kso-ok").addEventListener("click", _close);
  }

  // ── Exposé pour le câblage inline d index.html (closure window.load) ──
  window._afficherConfirmForceUpdate = _afficherConfirmForceUpdate;
  window._afficherConfirmKillSw      = _afficherConfirmKillSw;
  window._afficherKillSwOfflineRefus = _afficherKillSwOfflineRefus;

  console.log("[LoaderSwModals] Module chargé (force-update + kill SW)");
})();
