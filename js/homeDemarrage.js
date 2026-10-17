/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// HOMEDEMARRAGE.JS — Fin du démarrage de l'accueil
// =========================
// Fichier séparé d'index.html pour la CSP stricte (script-src sans 'unsafe-inline'), chargé au même endroit et
// sans defer : l'ordre d'exécution est voulu.

window.addEventListener("load", function () {
  // ── Tuilage : pas de réglage ici (décision produit : « auto » partout) ──────────
  // Sur un plan V2 la branche tuiles passe AVANT le preset, qui ne pèse que sur les V1 de plus de 4096² px. Le
  // réglage vit dans ℹ️ Infos, pour les plans non tuilés V2, mémorisé par plan (cf. homeLoader.js).
  // ⚠️ Les deux fonctions restent exposées : main.js les appelle au changement de langue, homeLoader.js lit la
  // valeur à chaque chargement ; « auto » constant fait retomber ces lecteurs sur le preset MÉMORISÉ du plan.
  function getLoaderPerfPreset() { return "auto"; }
  function setLoaderPerfPreset() { /* plus de contrôle à peindre */ }
  window.getLoaderPerfPreset = getLoaderPerfPreset;
  window.setLoaderPerfPreset = setLoaderPerfPreset;

  // 🩸 La barrière i18n reste : le premier rendu de la liste des plans, plus bas, l'attend (dico peut-être pas
  // encore chargé).
  const _i18nReadyHome = (window.I18n && typeof window.I18n.init === "function")
    ? window.I18n.init() : Promise.resolve();

  // ── Bouton « Logs détaillés » (mode debug) ──────────
  const debugBtn      = document.getElementById("loaderDebugBtn");
  const debugStateEl  = document.getElementById("loaderDebugState");

  function refreshDebugBtnUI() {
    if (!debugBtn || !debugStateEl) return;
    const on = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);
    debugStateEl.textContent = on ? "ON" : "OFF";
    debugBtn.classList.toggle("active", on);
    debugBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  if (debugBtn) {
    debugBtn.addEventListener("click", function() {
      const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){return k;};
      const cur = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);
      if (typeof window.setDebugMode === "function") {
        window.setDebugMode(!cur);
      } else if (window.APP_CONFIG) {
        // Repli si setDebugMode n'est pas exposé.
        window.APP_CONFIG.debugMode = !cur;
      }
      refreshDebugBtnUI();
      setStatus(window.APP_CONFIG.debugMode ? _t("home.misc.debugLogsOn") : _t("home.misc.debugLogsOff"), false);
    });
  }

  // Init : état courant (lu par config.js au démarrage).
  refreshDebugBtnUI();

  // Premier rendu de la liste derrière la barrière i18n : sinon les infobulles des lignes sortent « humanisées ».
  _i18nReadyHome.then(function() {
    if (window.refreshPlansList) window.refreshPlansList();
  });

  // ── Pont : lu par homeLoader.js (appel window.* avec garde typeof).
  window.getLoaderPerfPreset = getLoaderPerfPreset;
});
