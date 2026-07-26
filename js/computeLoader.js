/*!
 * MyKTAMap — Loader générique « calcul en cours » (v1.55.1)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// COMPUTELOADER.JS — Overlay « calcul en cours » réutilisable (depuis v1.55.1)
// =========================
// Généralisation du loader d'itinéraire (interfaceItineraire.js) : un overlay
// plein écran (spinner + message) avec **yield-to-paint** avant le calcul.
// Indispensable pour les calculs SYNCHRONES bloquants (Dijkstra/Pathfinder) :
// sans une frame peinte AVANT le blocage, l'écran fige « sans rien montrer »
// et l'user croit à un bug.
//
// Consommateurs : « Je suis perdu » (zone de proba) + Mode Secours (itinéraire
// d'équipe). L'itinéraire principal garde son propre loader (historique).
//
// API : window.ComputeLoader = {
//   show(message),          // affiche l'overlay avec un message
//   hide(),                 // le retire
//   wrap(fn, message)       // show + yield-to-paint + await fn() + hide (finally)
// };
// 100 % local, aucune surface réseau.
// =========================

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

  // Enveloppe un calcul (sync ou async) : affiche l'overlay, attend une frame
  // peinte (rAF + setTimeout 0), exécute fn(), puis retire l'overlay (finally).
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
