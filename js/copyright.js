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
// COPYRIGHT.JS — Watermark + banniere console au boot
// =========================
// Ce module est charge EN PREMIER dans index.html (avant tous les autres scripts).
// Il fait 2 choses :
//   1. Pose un watermark global accessible via window.__MKM__ (signature de build,
//      utile pour prouver l'origine du code en cas de copie)
//   2. Affiche une banniere copyright dans la console au boot (visible quand un
//      developpeur ouvre F12 — message clair sur la licence)
//
// NB : la detection DevTools par heuristique outerWidth/innerWidth a ete retiree
// (depuis 09/05/2026) car elle generait des faux positifs au moment des
// transitions de modales (ex : clic "Appliquer" dans le formulaire d'ajout de
// point declenchait le toast a tort). Le banner console + watermark suffisent
// pour transmettre le message copyright a un inspecteur, sans risque de bug UX.
// =========================

(function() {
  "use strict";

  // ========== WATERMARK GLOBAL ==========
  // Permet de prouver qu'une copie deployee ailleurs est bien derivee de ce code.
  // Si un site tiers expose window.__MKM__, c'est un derive de MyKTAMap.
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
  // ⚠️ Bypass volontaire du proxy debug.js : copyright.js est charge AVANT
  // debug.js, donc console.log appelle ici la version native (non gatee par
  // debugMode). Le banner reste donc visible meme en prod (mode debug OFF).
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
})();
