/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// HOMEDEMARRAGE.JS — fin du démarrage du HOME (ex-bloc <script> inline d'index.html)
// =========================
// Sorti d'index.html le 07/10/2026 pour la CSP stricte (script-src sans 'unsafe-inline'). Code INCHANGÉ,
// chargé au même endroit, sans defer : même ordre d'exécution qu'avant.

window.addEventListener("load", function () {
  // ════════════════════════════════════════════════════════
  // 🖼️ TUILAGE — PLUS DE RÉGLAGE ICI (v1.90.2, décision KARMA)
  // ════════════════════════════════════════════════════════
  // « On est en auto tout le temps. La majorité des plans sont en V2 et
  //   c'est le process conseillé. Ne concernant que peu de cas je veux pas
  //   ce réglage ici. »
  //
  // 🩸 CE QUE LE SÉLECTEUR FAISAIT VRAIMENT. Sur un plan V2 — le cas
  // courant — la branche tuiles est prise AVANT lui : « Désactivé » n'y
  // changeait rien, il était seulement journalisé. Il ne pesait donc que
  // sur les plans V1 au-dessus de 4096² px, et il occupait une place de
  // choix juste au-dessus du bouton « Charger ce plan ».
  //
  // Le réglage n'est pas SUPPRIMÉ, il est DÉPLACÉ là où il a un sens :
  // dans ℹ️ Infos, et seulement pour un plan qui n'est PAS tuilé V2
  // (cf. homeLoader.js). Il y est en plus MÉMORISÉ par plan, ce que la
  // carte de chargement ne savait pas faire.
  //
  // Les deux fonctions restent exposées : `main.js` les appelle au
  // changement de langue, et `homeLoader.js` lit la valeur à chaque
  // chargement de plan. Rendre « auto » constant fait retomber ces
  // lecteurs sur le preset MÉMORISÉ du plan — le comportement voulu.
  function getLoaderPerfPreset() { return "auto"; }
  function setLoaderPerfPreset() { /* plus de contrôle à peindre */ }
  window.getLoaderPerfPreset = getLoaderPerfPreset;
  window.setLoaderPerfPreset = setLoaderPerfPreset;

  // 🩸 La barrière i18n reste : le premier rendu de la liste des plans,
  // plus bas, l'attend. La supprimer avec le bloc perf aurait rendu la
  // liste des plans dépendante d'un dico peut-être pas encore chargé.
  const _i18nReadyHome = (window.I18n && typeof window.I18n.init === "function")
    ? window.I18n.init() : Promise.resolve();

  // ════════════════════════════════════════════════════════
  // BOUTON 🐛 LOGS DÉTAILLÉS (toggle debug mode)
  // ════════════════════════════════════════════════════════
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
        // Fallback si setDebugMode pas exposé (ne devrait pas arriver)
        window.APP_CONFIG.debugMode = !cur;
      }
      refreshDebugBtnUI();
      setStatus(window.APP_CONFIG.debugMode ? _t("home.misc.debugLogsOn") : _t("home.misc.debugLogsOff"), false);
    });
  }

  // Init : refléter l'état courant (lu depuis localStorage par config.js au boot)
  refreshDebugBtnUI();

  // Premier rendu de la liste — derrière la barrière i18n (v1.68.1) :
  // les tooltips des lignes (Charger/Infos/Retirer, badges V1/M-LVL)
  // sortaient « humanisés » quand le load gagnait la course des dicos.
  _i18nReadyHome.then(function() {
    if (window.refreshPlansList) window.refreshPlansList();
  });

  // ── Pont B7 : lu par homeLoader.js (déjà appelé via window.* avec
  // garde typeof).
  window.getLoaderPerfPreset = getLoaderPerfPreset;
});
