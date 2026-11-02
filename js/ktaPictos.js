/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ktaPictos.js — pictogrammes au trait (SVG 24 × 24, contour seul) partagés par l'écran Bienvenue et la barre de
// droite de la carte (bouton cube de la vue 3D) : un picto dessiné une fois, jamais recopié d'un module à l'autre.
// Expose : window.ktaPicto(nom, classe) → chaîne `<svg …>` (vide si le nom est inconnu) ; window.KTA_PICTOS (tracés).
// ⚠️ contrat : le trait suit `currentColor` sauf si la classe passée le redéfinit (bienvenue.css > .kta-bv-picto),
// remplissage nul, épaisseur 1,8. Chargé en synchrone avant unlockGate.js : l'écran Bienvenue s'en sert avant
// les scripts différés.

(function () {
  "use strict";

  const PICTOS = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>',
    boussole: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
    chemin: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
    danger: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17v.5"/>',
    bouee: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>' +
      '<path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>',
    bouclier: '<path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z"/>',
    exports: '<path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4"/>',
    imports: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>',
    carte: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
    globe: '<circle cx="12" cy="12" r="9"/>' +
      '<path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
    groupe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/>' +
      '<path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
    point: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    trace: '<path d="M4 19 9 9l5 6 6-10"/><path d="M4 5h5v5"/>',
    regle: '<path d="m3 16 13-13 5 5L8 21l-5-5Z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/>',
    retour: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    livre: '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"/>' +
      '<path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z"/>',
    carnet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    loupe: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
    sirene: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 18h14v3H5zM12 3v2M4.5 6.5 6 8M19.5 6.5 18 8"/>',
    oeil: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/>' +
      '<circle cx="12" cy="12" r="3"/>',
    session: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'
  };

  function ktaPicto(nom, classe) {
    if (!Object.prototype.hasOwnProperty.call(PICTOS, nom)) return "";
    return '<svg' + (classe ? ' class="' + classe + '"' : "") + ' viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + PICTOS[nom] + '</svg>';
  }

  window.KTA_PICTOS = PICTOS;
  window.ktaPicto = ktaPicto;
})();
