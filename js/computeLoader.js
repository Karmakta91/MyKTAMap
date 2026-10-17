/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// COMPUTELOADER.JS — Overlay « calcul en cours » réutilisable
// =========================
// Overlay plein écran (spinner + message) avec YIELD-TO-PAINT avant le calcul. 🩸 Indispensable pour les calculs
// SYNCHRONES bloquants (Dijkstra / Pathfinder) : sans une frame peinte AVANT, l'écran fige sans rien montrer.
// Utilisé par « Je suis perdu » (zone de probabilité) et le Mode Secours (itinéraire d'équipe) ; l'itinéraire
// principal a son propre loader.
// API : window.ComputeLoader = {
//   show(message),     // affiche l'overlay
//   hide(),            // le retire
//   wrap(fn, message)  // show + yield-to-paint + await fn() + hide (finally)
// };

(function() {
  "use strict";

  const OVERLAY_ID = "kta-compute-overlay";

  function show(message) {
    let ov = document.getElementById(OVERLAY_ID);
    if (!ov) {
      ov = document.createElement("div");
      ov.id = OVERLAY_ID;
      ov.className = "kta-compute-overlay";
      ov.innerHTML =
        '<div class="kta-load-spinner"></div>' +
        '<div class="kta-compute-msg"></div>';
      document.documentElement.appendChild(ov);
    }
    const msgEl = ov.querySelector(".kta-compute-msg");
    if (msgEl) msgEl.textContent = message || "";  // textContent = anti-XSS
    ov.style.display = "flex";
    return ov;
  }

  function hide() {
    const ov = document.getElementById(OVERLAY_ID);
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  }

  // Enveloppe un calcul (sync ou async) : overlay, une frame peinte (rAF + setTimeout 0), fn(), retrait (finally).
  async function wrap(fn, message) {
    show(message);
    await new Promise(function(r) { requestAnimationFrame(function() { setTimeout(r, 0); }); });
    try {
      return await fn();
    } finally {
      hide();
    }
  }

  window.ComputeLoader = { show: show, hide: hide, wrap: wrap };

  console.log("[ComputeLoader] Module chargé");
})();
