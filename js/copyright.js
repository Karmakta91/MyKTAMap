/*!
 * MyKTAMap — Application de cartographie pour cataphiles
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.is-underground.fr
 *
 * Licence : CC BY-NC-SA 4.0 (Creative Commons Attribution - NonCommercial - ShareAlike)
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 *
 * USAGE COMMERCIAL STRICTEMENT INTERDIT sans accord ecrit prealable.
 * Voir le fichier LICENSE a la racine du projet.
 */

// =========================
// COPYRIGHT.JS — Watermark + protection visible du code
// =========================
// Ce module est charge EN PREMIER dans index.html (avant tous les autres scripts).
// Il fait 3 choses :
//   1. Pose un watermark global accessible via window.__MKM__ (signature de build,
//      utile pour prouver l'origine du code en cas de copie)
//   2. Affiche une banniere copyright dans la console au boot (visible quand un
//      developpeur ouvre F12 — message clair sur la licence)
//   3. Detecte l'ouverture des DevTools et affiche un toast d'avertissement
//      (dissuasif : cassable mais transmet le message a l'inspecteur)
// =========================

(function() {
  "use strict";

  // ========== WATERMARK GLOBAL ==========
  // Permet de prouver qu'une copie deployee ailleurs est bien derivee de ce code.
  // Si un site tiers expose window.__MKM__, c'est un derivé de MyKTAMap.
  window.__MKM__ = Object.freeze({
    name:      "MyKTAMap",
    author:    "Flavien VIDAL (alias KARMA)",
    copyright: "(c) 2026 Flavien VIDAL",
    site:      "https://myktamap.is-underground.fr",
    license:   "CC BY-NC-SA 4.0",
    licenseUrl:"https://creativecommons.org/licenses/by-nc-sa/4.0/",
    build:     "2026.05.09",
    note:      "Usage commercial interdit sans accord ecrit prealable."
  });

  // ========== BANNIERE CONSOLE ==========
  // Affichee une seule fois au boot. Utilise %c pour styliser (charte app).
  // Un copieur curieux qui ouvre F12 voit immediatement le copyright.
  try {
    console.log(
      "%c MyKTAMap %c (c) 2026 Flavien VIDAL (alias KARMA) %c\n" +
      "Licence : CC BY-NC-SA 4.0 — Usage commercial INTERDIT sans accord ecrit prealable.\n" +
      "Site officiel : https://myktamap.is-underground.fr\n" +
      "Toute reproduction commerciale expose le contrevenant a des poursuites (art. L.335-2 CPI).",
      "background:#f4c542; color:#1a1f2e; font-weight:800; font-size:14px; padding:4px 8px; border-radius:4px 0 0 4px;",
      "background:#1a1f2e; color:#f4c542; font-size:13px; padding:4px 8px; border-radius:0 4px 4px 0;",
      "color:#c8d0e0; font-size:12px; line-height:1.6;"
    );
  } catch(e) {}

  // ========== DETECTION DEVTOOLS ==========
  // Heuristique : quand le panneau DevTools s'ouvre (dock cote ou bas), la
  // difference outerWidth/innerWidth ou outerHeight/innerHeight depasse ~200px.
  // Polling toutes les 2s. Premier declenchement uniquement -> 1 toast par
  // session pour ne pas spammer.
  // Limite : detection par taille pas fiable si DevTools detache (fenetre separee).
  // C'est dissuasif, pas une vraie protection — l'objectif est de transmettre
  // le message de licence a l'inspecteur.

  var _devtoolsSpotted = false;

  function _afficherToastDevtools() {
    if (document.getElementById("kta-devtools-warn")) return;
    var t = document.createElement("div");
    t.id = "kta-devtools-warn";
    t.className = "kta-devtools-warn";
    t.innerHTML =
      '<div class="kta-devtools-warn-titre">' +
        '<span class="kta-devtools-warn-icon">&#x1F441;&#xFE0F;</span> ' +
        'Inspection detectee' +
      '</div>' +
      '<div class="kta-devtools-warn-corps">' +
        '<strong>MyKTAMap</strong> &copy; 2026 Flavien VIDAL<br>' +
        'Licence : <strong>CC BY-NC-SA 4.0</strong><br>' +
        'Usage commercial <strong style="color:#ff6b6b;">INTERDIT</strong> sans accord ecrit prealable.<br>' +
        '<a href="https://myktamap.is-underground.fr" target="_blank" rel="noopener">myktamap.is-underground.fr</a>' +
      '</div>' +
      '<button class="kta-devtools-warn-close" type="button" aria-label="Fermer">&times;</button>';
    document.body.appendChild(t);

    var btn = t.querySelector(".kta-devtools-warn-close");
    if (btn) {
      btn.addEventListener("click", function() {
        if (t.parentNode) t.parentNode.removeChild(t);
      });
    }

    // Auto-dismiss apres 12s
    setTimeout(function() {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 12000);
  }

  function _checkDevTools() {
    var wd = (window.outerWidth  || 0) - (window.innerWidth  || 0);
    var hd = (window.outerHeight || 0) - (window.innerHeight || 0);
    var threshold = 200;

    if (wd > threshold || hd > threshold) {
      if (!_devtoolsSpotted) {
        _devtoolsSpotted = true;
        // Differe le toast pour laisser le splash se terminer
        setTimeout(_afficherToastDevtools, 800);
      }
    } else {
      _devtoolsSpotted = false;
    }
  }

  // Lancer le polling apres un petit delai (laisse l'app booter tranquille)
  if (typeof window !== "undefined") {
    setTimeout(function() {
      _checkDevTools();
      setInterval(_checkDevTools, 2000);
    }, 3000);
  }
})();
