/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 * Tracés tirés de Lucide, licence ISC : (c) Lucide Contributors, en partie (c) Cole Bemis (Feather, MIT).
 * Icônes métier préfixées « m- » : MyKTAMap.
 */

// ktaIcones.js — icônes de l'interface au trait (SVG 24 × 24), les mêmes sur iPhone, Android et PC.
// Expose : window.ktaIcone(nom[, opts]) → chaîne `<svg class="kta-ico" …>` (vide + avertissement si le nom est
//   inconnu ; opts.classe ajoute une classe) · window.KtaIcones = { TRACES, noms(), existe(nom), poser(racine),
//   DOC, AUTRE_SENS, REPERES, GARDE, classerDoc(texte), substituerDoc(texte[, opts]), jetonsEnSvg(html) }.
//   Lisible par node (générateur de doc.myktamap.fr).
// ⚠️ contrat : un seul système de noms, celui des icônes (Lucide ou « m-… »), jamais celui des notions. Trait
//   `currentColor` : l'icône prend la couleur du bouton (doré quand il est actif) ; aria-hidden, le bouton garde
//   son title / aria-label. `data-kta-ico="nom"` sur un élément statique : rempli par poser() au chargement.
// Doc : la Documentation, l'Aide et le tutoriel affichent chaque emoji en SVG (substitution à l'affichage, les
//   .md et les dicos gardent l'emoji) : l'icône du bouton qu'il désigne (DOC), sinon celle de sa notion
//   (REPERES) ; seules les exceptions GARDE restent en emoji. 🩸 Un emoji a souvent plusieurs sens
//   (🧭 Tracker / Boussole) : les règles lisent l'emoji + le libellé voisin, AUTRE_SENS écarte le bouton.
// Garde-fou : scripts/check-icones-ui.js (noms connus, table de doc exhaustive) · doc : docs/architecture/ui.md
//   § Icônes de l'interface.

(function () {
  "use strict";

  const SOURCE = "lucide-static 0.460.0 (ISC) + MyKTAMap";

  const TRACES = {
    "navigation": '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
    "pencil": '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 ' +
      '.623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    "m-galerie": '<path d="M2 9c3 0 4-3 7-3s4 3 7 3 4-2 6-2"/><path d="M2 17c3 0 4-3 7-3s4 3 7 3 4-2 6-2"/>',
    "m-zone": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4.6 11.4 11.4 4.6M4.6 19.4 19.4 4.6M12.6 ' +
      '19.4l6.8-6.8"/>',
    "m-pilier": '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M6 9h12M6 15h12M11 3v6M14 9v6M10 15v6"/>',
    "ruler": '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 ' +
      '0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 ' +
      '2-2"/><path d="m17.5 15.5 2-2"/>',
    "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "folder-open": '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 ' +
      '2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    "save": '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 ' +
      '1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    "history": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 ' +
      '7v5l4 2"/>',
    "star": '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 ' +
      '0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 ' +
      '2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 ' +
      '9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    "circle-help": '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 ' +
      '17h.01"/>',
    "settings": '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 ' +
      '0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 ' +
      '2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 ' +
      '2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 ' +
      '0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 ' +
      '0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" ' +
      'r="3"/>',
    "layers": '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 ' +
      '0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 ' +
      '12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    "box": '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 ' +
      '2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    "play": '<polygon points="6 3 20 12 6 21 6 3"/>',
    "square": '<rect width="18" height="18" x="3" y="3" rx="2"/>',
    "compass": '<path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 ' +
      '1.265-1.265z"/><circle cx="12" cy="12" r="10"/>',
    "rotate-cw": '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    "signpost": '<path d="M12 13v8"/><path d="M12 3v3"/><path d="M18 6a2 2 0 0 1 1.387.56l2.307 2.22a1 1 0 0 1 0 ' +
      '1.44l-2.307 2.22A2 2 0 0 1 18 13H6a2 2 0 0 1-1.387-.56l-2.306-2.22a1 1 0 0 1 0-1.44l2.306-2.22A2 2 0 0 1 6 ' +
      '6z"/>',
    "map-pin-check": '<path d="M19.43 12.935c.357-.967.57-1.955.57-2.935a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 ' +
      '11.799a1 1 0 0 0 1.202 0 32.197 32.197 0 0 0 .813-.728"/><circle cx="12" cy="10" r="3"/><path d="m16 18 2 2 ' +
      '4-4"/>',
    "locate-fixed": '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" ' +
      'x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle ' +
      'cx="12" cy="12" r="3"/>',
    "lock-open": '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    "route": '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>' +
      '<circle cx="18" cy="5" r="3"/>',
    "clapperboard": '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path ' +
      'd="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    "flame": '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 ' +
      '2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    "footprints": '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 ' +
      '5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 ' +
      '14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
    "life-buoy": '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/>' +
      '<path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>',
    "maximize": '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 ' +
      '2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    "ambulance": '<path d="M10 10H6"/><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path ' +
      'd="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 ' +
      '16.382 8H14"/><path d="M8 8v4"/><path d="M9 18h6"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" ' +
      'r="2"/>',
    "radio": '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle ' +
      'cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 ' +
      '19"/>',
    "square-dashed": '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/>' +
      '<path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/>' +
      '<path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>',
    "pickaxe": '<path d="M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912"/><path d="M15.686 4.314A12.5 12.5 0 ' +
      '0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393"/><path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 ' +
      '1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="M19.686 8.314a12.501 12.501 0 0 1 ' +
      '1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319"/>',
    "m-echelle": '<path d="M8 2v20M16 2v20M8 6h8M8 11h8M8 16h8"/>',
    "m-niveaux": '<rect x="3" y="3" width="13" height="4" rx="1"/><rect x="8" y="10" width="13" height="4" rx="1"/>' +
      '<rect x="3" y="17" width="13" height="4" rx="1"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "eraser": '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>' +
      '<path d="M22 21H7"/><path d="m5 11 9 9"/>',
    "trash-2": '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 ' +
      '2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    "plus": '<path d="M5 12h14"/><path d="M12 5v14"/>',
    "move": '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path ' +
      'd="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>',
    "undo-2": '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    "redo-2": '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
    "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    "arrow-up-from-line": '<path d="m18 9-6-6-6 6"/><path d="M12 3v14"/><path d="M5 21h14"/>',
    "arrow-down-to-line": '<path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>',
    "image": '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 ' +
      '15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 ' +
      '2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    "satellite": '<path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path ' +
      'd="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6"/>',
    "sliders-horizontal": '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" ' +
      'x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line ' +
      'x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/>' +
      '<line x1="16" x2="16" y1="18" y2="22"/>',
    "table": '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 ' +
      '15h18"/>',
    "refresh-cw": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path ' +
      'd="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    "globe": '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path ' +
      'd="M2 12h20"/>',
    "map-pinned": '<path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 ' +
      '0 1 12 0"/><circle cx="12" cy="8" r="2"/><path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 ' +
      '22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712"/>',
    "braces": '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 ' +
      '2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
    "copy": '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 ' +
      '2-2h10c1.1 0 2 .9 2 2"/>',
    "cloud-download": '<path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 ' +
      '8h1.79a4.5 4.5 0 0 1 2.436 8.284"/>',
    "library": '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
    "map": '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 ' +
      '1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 ' +
      '19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 ' +
      '3.236v15"/>',
    "package-plus": '<path d="M16 16h6"/><path d="M19 13v6"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 ' +
      '0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline ' +
      'points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>',
    "folder-input": '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 ' +
      '2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/>',
    "pocket-knife": '<path d="M3 2v1c0 1 2 1 2 2S3 6 3 7s2 1 2 2-2 1-2 2 2 1 2 2"/><path d="M18 6h.01"/><path ' +
      'd="M6 18h.01"/><path d="M20.83 8.83a4 4 0 0 0-5.66-5.66l-12 12a4 4 0 1 0 5.66 5.66Z"/><path d="M18 ' +
      '11.66V22a4 4 0 0 0 4-4V6"/>',
    "notebook-pen": '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/>' +
      '<path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 ' +
      '5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>',
    "waypoints": '<circle cx="12" cy="4.5" r="2.5"/><path d="m10.2 6.3-3.9 3.9"/><circle cx="4.5" cy="12" r="2.5"/>' +
      '<path d="M7 12h10"/><circle cx="19.5" cy="12" r="2.5"/><path d="m13.8 17.7 3.9-3.9"/><circle cx="12" ' +
      'cy="19.5" r="2.5"/>',
    "camera": '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 ' +
      '0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    "drafting-compass": '<path d="m12.99 6.74 1.93 3.44"/><path d="M19.136 12a10 10 0 0 1-14.271 0"/><path d="m21 ' +
      '21-2.16-3.84"/><path d="m3 21 8.02-14.26"/><circle cx="12" cy="5" r="2"/>',
    "siren": '<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 ' +
      '0-2-2H7a2 2 0 0 0-2 2z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 ' +
      '2v1"/><path d="m4.929 4.929.707.707"/><path d="M12 12v6"/>',
    "book-open": '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 ' +
      '4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    "cloud": '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    "hard-drive": '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 ' +
      '2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/>' +
      '<line x1="10" x2="10.01" y1="16" y2="16"/>',
    "folder": '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 ' +
      '0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    "folder-plus": '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 ' +
      '0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    "square-check": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
    "wifi-off": '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 ' +
      '5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path ' +
      'd="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
    "layout-grid": '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/>' +
      '<rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    "palette": '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" ' +
      'fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" ' +
      'r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 ' +
      '0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 ' +
      '5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    "bell": '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    "bell-off": '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 ' +
      '.3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
    "smartphone": '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    "sun-moon": '<path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4"/><path d="M12 2v2"/><path d="M12 20v2"/><path ' +
      'd="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 ' +
      '17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
    "vibrate": '<path d="m2 8 2 2-2 2 2 2-2 2"/><path d="m22 8-2 2 2 2-2 2 2 2"/><rect width="8" height="14" x="8" ' +
      'y="5" rx="1"/>',
    "venetian-mask": '<path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a8 8 0 0 0-5 2 8 ' +
      '8 0 0 0-5-2H2Z"/><path d="M6 11c1.5 0 3 .5 3 2-2 0-3 0-3-2Z"/><path d="M18 11c-1.5 0-3 .5-3 2 2 0 3 0 ' +
      '3-2Z"/>',
    "battery": '<rect width="16" height="10" x="2" y="7" rx="2" ry="2"/><line x1="22" x2="22" y1="11" y2="13"/>',
    "battery-low": '<rect width="16" height="10" x="2" y="7" rx="2" ry="2"/><line x1="22" x2="22" y1="11" y2="13"/>' +
      '<line x1="6" x2="6" y1="11" y2="13"/>',
    "gamepad-2": '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" ' +
      'x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 ' +
      '0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 ' +
      '2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 ' +
      '3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',
    "puzzle": '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 ' +
      '1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 ' +
      '1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 ' +
      '0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 ' +
      '1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>',
    "shield": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 ' +
      '4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    "key-round": '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 ' +
      '1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" ' +
      'cy="7.5" r=".5" fill="currentColor"/>',
    "wrench": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 ' +
      '6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    "code-xml": '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
    "gauge": '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    "scroll-text": '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 ' +
      '21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
    "languages": '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 ' +
      '22-5-10-5 10"/><path d="M14 18h6"/>',
    "magnet": '<path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"/>' +
      '<path d="m5 8 4 4"/><path d="m12 15 4 4"/>',
    "zoom-in": '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" ' +
      'y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
    "scaling": '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M14 15H9v-5"/><path ' +
      'd="M16 3h5v5"/><path d="M21 3 9 15"/>',
    "circle-check": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    "circle-x": '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    "triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path ' +
      'd="M12 9v4"/><path d="M12 17h.01"/>',
    "ban": '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    "loader-circle": '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    "info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    "sparkles": '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 ' +
      '9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 ' +
      '14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path ' +
      'd="M4 17v2"/><path d="M5 18H3"/>',
    "lightbulb": '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 ' +
      '1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "chart-column": '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 ' +
      '17v-3"/>',
    "timer": '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" ' +
      'r="8"/>',
    "calendar": '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 ' +
      '10h18"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 ' +
      '21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "user": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    "trophy": '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 ' +
      '22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 ' +
      '.55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    "tag": '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 ' +
      '2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" ' +
      'fill="currentColor"/>',
    "eye": '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 ' +
      '1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 ' +
      '0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    "list": '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/>' +
      '<path d="M8 6h13"/>',
    "sigma": '<path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 ' +
      '1 0 0 0 1-1v-2"/>',
    // Hors planche (Configuration de l'accueil, Mes plans) : Lucide 0.460.0.
    "panels-top-left": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
    "monitor-cog": '<path d="M12 17v4"/><path d="m15.2 4.9-.9-.4"/><path d="m15.2 7.1-.9.4"/><path d="m16.9 ' +
      '3.2-.4-.9"/><path d="m16.9 8.8-.4.9"/><path d="m19.5 2.3-.4.9"/><path d="m19.5 9.7-.4-.9"/><path d="m21.7 ' +
      '4.5-.9.4"/><path d="m21.7 7.5-.9-.4"/><path d="M22 13v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/>' +
      '<path d="M8 21h8"/><circle cx="18" cy="6" r="3"/>',
    "unplug": '<path d="m19 5 3-3"/><path d="m2 22 3-3"/><path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 ' +
      '2.3a2.4 2.4 0 0 0 0 3.4Z"/><path d="M7.5 13.5 10 11"/><path d="M10.5 16.5 13 14"/><path d="m12 6 6 6 ' +
      '2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"/>',
    "server-cog": '<circle cx="12" cy="12" r="3"/><path d="M4.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 ' +
      '2v4a2 2 0 0 1-2 2h-.5"/><path d="M4.5 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 ' +
      '0-2-2h-.5"/><path d="M6 6h.01"/><path d="M6 18h.01"/><path d="m15.7 13.4-.9-.3"/><path d="m9.2 ' +
      '10.9-.9-.3"/><path d="m10.6 15.7.3-.9"/><path d="m13.6 15.7-.4-1"/><path d="m10.8 9.3-.4-1"/><path d="m8.3 ' +
      '13.6 1-.4"/><path d="m14.7 10.8 1-.4"/><path d="m13.4 8.3-.3.9"/>',
    "bug": '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>' +
      '<path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/>' +
      '<path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path ' +
      'd="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
    "database": '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 ' +
      '0 21 12"/>',
    // Fenêtres d'outils de la carte (hors planche, Lucide).
    "rocket": '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 ' +
      '0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 ' +
      '0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 ' +
      '0-5"/>',
    "mouse-pointer-click": '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 ' +
      '2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 ' +
      '0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
    "circle-dot": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
    "mic": '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 ' +
      '0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    "joystick": '<path d="M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2Z"/><path d="M6 ' +
      '15v-2"/><path d="M12 15V9"/><circle cx="12" cy="6" r="3"/>',
    "presentation": '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 ' +
      '5"/>',
    "house": '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 ' +
      '2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "skip-back": '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
    "skip-forward": '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
    "pause": '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    "map-pin": '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 ' +
      '0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    "ratio": '<rect width="12" height="20" x="6" y="2" rx="2"/><rect width="20" height="12" x="2" y="6" rx="2"/>',
    "monitor": '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line ' +
      'x1="12" x2="12" y1="17" y2="21"/>',
    "flag": '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" ' +
      'y2="15"/>',
    "repeat": '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 ' +
      '13v1a4 4 0 0 1-4 4H3"/>',
    "heart": '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 ' +
      '2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    "flashlight": '<path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z"/><line ' +
      'x1="6" x2="18" y1="6" y2="6"/><line x1="12" x2="12" y1="12" y2="12"/>',
    "scissors": '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle ' +
      'cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    // Fenêtres et barres restantes (hors planche, Lucide).
    "grid-2x2": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 12h18"/><path d="M12 3v18"/>',
    "power-off": '<path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><path ' +
      'd="M12 2v4"/><path d="m2 2 20 20"/>',
    "wand-sparkles": '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 ' +
      '1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path ' +
      'd="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
    "gem": '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
    "scale": '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 ' +
      '1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    "bandage": '<path d="M10 10.01h.01"/><path d="M10 14.01h.01"/><path d="M14 10.01h.01"/><path d="M14 ' +
      '14.01h.01"/><path d="M18 6v11.5"/><path d="M6 6v12"/><rect x="2" y="6" width="20" height="12" rx="2"/>',
    "snail": '<path d="M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 0 0 4 0"/><circle cx="10" cy="13" r="8"/><path ' +
      'd="M2 21h12c4.4 0 8-3.6 8-8V7a2 2 0 1 0-4 0v6"/><path d="M18 3 19.1 5.2"/><path d="M22 3 20.9 5.2"/>',
    "person-standing": '<circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path ' +
      'd="M12 10v4"/>',
    "rabbit": '<path d="M13 16a3 3 0 0 1 2.24 5"/><path d="M18 12h.01"/><path d="M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 ' +
      '7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3"/><path d="M20 ' +
      '8.54V4a2 2 0 1 0-4 0v3"/><path d="M7.612 12.524a3 3 0 1 0-1.6 4.3"/>',
    "wifi": '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path ' +
      'd="M8.5 16.429a5 5 0 0 1 7 0"/>',
    "crosshair": '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" ' +
      'y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
    "pencil-line": '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 ' +
      '1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/><path d="m15 5 3 3"/>',
    "door-open": '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 ' +
      '12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 ' +
      '4.561Z"/>',
    "chevron-up": '<path d="m18 15-6-6-6 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "blend": '<circle cx="9" cy="9" r="7"/><circle cx="15" cy="15" r="7"/>',
    "scroll": '<path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 ' +
      '1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
    "archive": '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 ' +
      '2-2V8"/><path d="M10 12h4"/>',
    "megaphone": '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    "clipboard-list": '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 ' +
      '0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 ' +
      '11h.01"/><path d="M8 16h.01"/>',
    "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    "split": '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path ' +
      'd="m15 9 6-6"/>',
    "zap": '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 ' +
      '.78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    "hand": '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 ' +
      '2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 ' +
      '8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    "circle-dashed": '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path ' +
      'd="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 ' +
      '10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 ' +
      '2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>',
    "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    "graduation-cap": '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 ' +
      '0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    "volume-2": '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 ' +
      '1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 ' +
      '0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
    "brick-wall": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 9v6"/><path d="M16 15v6"/><path ' +
      'd="M16 3v6"/><path d="M3 15h18"/><path d="M3 9h18"/><path d="M8 15v6"/><path d="M8 3v6"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 ' +
      '1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 ' +
      '1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    "cloud-fog": '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 17H7"/><path ' +
      'd="M17 21H9"/>',
    "battery-charging": '<path d="M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><path d="M6 7H4a2 2 0 0 0-2 2v6a2 2 0 ' +
      '0 0 2 2h1"/><path d="m11 7-3 5h4l-3 5"/><line x1="22" x2="22" y1="11" y2="13"/>',
    "telescope": '<path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 ' +
      '.691-1.265l13.504-4.44"/><path d="m13.56 11.747 4.332-.924"/><path d="m16 21-3.105-6.21"/><path d="M16.485 ' +
      '5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 ' +
      '1-2.425-1.455z"/><path d="m6.158 8.633 1.114 4.456"/><path d="m8 21 3.105-6.21"/><circle cx="12" cy="13" ' +
      'r="2"/>',
    "fingerprint": '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 ' +
      '8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 ' +
      '16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path ' +
      'd="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
    "minus": '<path d="M5 12h14"/>',
    "merge": '<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"/><path d="m20 22-5-5"/>',
    "cpu": '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path ' +
      'd="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 ' +
      '9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    "rotate-ccw": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    "package": '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 ' +
      '2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 ' +
      '7"/><path d="m7.5 4.27 9 5.15"/>',
    "bot": '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 ' +
      '14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    // Profil, ConfAdmin, pied de page de l'accueil, portes d'entrée et fenêtres restantes (hors planche, Lucide).
"briefcase": '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" ' +
      'rx="2"/>',
    "building-2": '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 ' +
      '2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path ' +
      'd="M10 14h4"/><path d="M10 18h4"/>',
    "replace": '<path d="M14 4a2 2 0 0 1 2-2"/><path d="M16 10a2 2 0 0 1-2-2"/><path d="M20 2a2 2 0 0 1 2 ' +
      '2"/><path d="M22 8a2 2 0 0 1-2 2"/><path d="m3 7 3 3 3-3"/><path d="M6 10V5a3 3 0 0 1 3-3h1"/><rect x="2" ' +
      'y="14" width="8" height="8" rx="2"/>',
    "calculator": '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line ' +
      'x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path ' +
      'd="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
    "network": '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" ' +
      'rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 ' +
      '1v3"/><path d="M12 12V8"/>',
    "plug": '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 ' +
      '1-4-4V8Z"/>',
    "landmark": '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" ' +
      'y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon ' +
      'points="12 2 20 7 4 7"/>',
    "external-link": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 ' +
      '1-2-2V8a2 2 0 0 1 2-2h6"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    "keyboard": '<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path ' +
      'd="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" ' +
      'x="2" y="4" rx="2"/>',
    "leaf": '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path ' +
      'd="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    "instagram": '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 ' +
      '0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
    "mail": '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 ' +
      '7"/>',
    "type": '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" ' +
      'y1="4" y2="20"/>',
    "layout-dashboard": '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" ' +
      'rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    "toggle-right": '<rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="16" cy="12" r="2"/>'
  };

  const ATTRS = ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
    ' stroke-linejoin="round" aria-hidden="true" focusable="false">';

  function existe(nom) { return Object.prototype.hasOwnProperty.call(TRACES, nom); }

  function ktaIcone(nom, opts) {
    if (!existe(nom)) {
      if (typeof console !== "undefined") console.warn("[KtaIcones] icône inconnue :", nom);
      return "";
    }
    const classe = opts && opts.classe ? " " + String(opts.classe).replace(/[^\w -]/g, "") : "";
    // kta-ico-<nom> : l'icône se reconnaît dans le DOM (tests, CSS) sans comparer des tracés que le navigateur
    // resérialise.
    return '<svg class="kta-ico kta-ico-' + nom + classe + '"' + ATTRS + TRACES[nom] + "</svg>";
  }

  // Élément statique marqué `data-kta-ico="nom"` : l'icône remplace son contenu (une fois).
  function poser(racine) {
    const r = racine || (typeof document !== "undefined" ? document : null);
    if (!r || typeof r.querySelectorAll !== "function") return;
    r.querySelectorAll("[data-kta-ico]").forEach(function (el) {
      const nom = el.getAttribute("data-kta-ico");
      if (el.getAttribute("data-kta-ico-pose") === nom) return;
      const svg = ktaIcone(nom);
      if (!svg) return;
      el.innerHTML = svg;
      el.setAttribute("data-kta-ico-pose", nom);
    });
  }

  // ── Documentation et Aide : emoji du texte → icône du bouton ──────────────────────────────
  // DOC : { e: emoji, i: icône, a: motif du texte qui SUIT, b: motif du texte qui PRÉCÈDE }. Sans a ni b : tout
  // emploi de cet emoji (sens unique dans la doc). AUTRE_SENS : { e, s: sens, a, b } = emploi qui ne désigne PAS
  // le bouton (autre notion) : il prend l'icône de sa notion (REPERES, plus bas). Ordre : AUTRE_SENS ciblé, DOC
  // ciblé, DOC sans motif, AUTRE_SENS sans motif. Le texte voisin est lu sans balises, sans `**` ni U+FE0F, espaces
  // resserrés ; les motifs couvrent fr, en et es (les trois guides et les trois dicos). ⚠️ check-icones-ui.js
  // refuse tout emoji de la doc qui ne tombe sous aucune règle (DOC, REPERES ou GARDE).
  const DOC = [
    // Barre de la carte : boutons de groupe.
    { e: "🧭", i: "navigation", a: /^(?:Menu )?(?:Tracker|Rastreador)\b/ },
    { e: "🧭", i: "navigation", b: /\| (?:Tracker|Rastreador) \|$/ },
    { e: "🧭", i: "navigation", a: /^(?:Menú del Tracker|\((?:menu Tracker|the map's Tracker menu|el menú Tracker|menú (?:del )?Tracker))/ },
    { e: "🧭", i: "compass", a: /^(?:Boussole|Compass|Brújula)\b/ },
    { e: "🧭", i: "compass", b: /(?:La tuile|The|La ficha)$/,
      a: /^(?:affiche une rose|tile shows a compass|muestra una rosa)/ },
    { e: "✏️", i: "pencil", a: /^(?:Édition de points|Point editing|Edición de puntos)/ },
    { e: "✏️", i: "pencil", b: /\| (?:Édition de points|Point editing|Edición de puntos) \|$/ },
    { e: "✏️", i: "pencil", a: /^(?:Ajouter (?:des|un|et modifier des) points?|Add(?:ing)? (?:a |and edit(?:ing)? )?points?|Añadir (?:un |y editar )?puntos?)\b/ },
    { e: "✏️", i: "pencil", b: /(?:Mesure|Measurement|Medición),$|📐$/ },
    { e: "✏️", i: "pencil", a: /^(?:de la barre latérale|(?:button )?(?:in|on|of) the sidebar|de la barra lateral)/ },
    { e: "✏️", i: "pencil", a: /^(?:\(il se surligne\)|\(it lights up\)|\(se resalta\)|pour sortir du mode|again to leave|para salir del modo)/ },
    { e: "🛣️", i: "m-galerie" },
    { e: "⬛", i: "m-zone" },
    { e: "🏛️", i: "m-pilier" },
    { e: "📐", i: "ruler" },
    { e: "🔍", i: "search" },
    { e: "🔎", i: "search", a: /^(?:Recherche multi-plans|Multi-map search|Búsqueda multi)/ },
    { e: "🔎", i: "search", b: /(?:barre de recherche|search bar|barra de búsqueda)$/ },
    { e: "🔎", i: "search", b: /(?:Entrée ou|Enter or|Intro o)$/ },
    { e: "🔎", i: "search", a: /^(?:de l'accueil|(?:search )?bar\b|de la pantalla de inicio)/ },
    { e: "⬇️", i: "folder-open", a: /^(?:Charger \/ Import|Load \/ Import|Cargar \/ Importar)/ },
    { e: "⬇️", i: "folder-open", a: /^(?:Charger|Load|Cargar),/ },
    { e: "⬇️", i: "folder-open", b: /\| (?:Charger \/ Import|Load \/ Import|Cargar \/ Importar) \|$/ },
    { e: "⬆️", i: "save" },
    { e: "⏪", i: "history", a: /^(?:Historique|History|Historial)\b/ },
    { e: "⏪", i: "history", b: /\| (?:Historique|History|Historial) \|$/ },
    { e: "⏪", i: "history", a: /^(?:Annuler \/ Rétablir|Undo \/ Redo|Deshacer \/ Rehacer)/ },
    { e: "⏪", i: "undo-2" },
    { e: "⏩", i: "redo-2" },
    { e: "⭐", i: "star", b: /\| (?:Favoris|Favorites|Favoritos) \|$/ },
    { e: "⭐", i: "star", b: /(?:gauche|left|izquierda) ?:$/ },
    { e: "⭐", i: "star", a: /^(?:Favoris (?:—|Marque)|Favorites (?:—|Mark)|Favoritos (?:—|Marca))/ },
    { e: "📚", i: "circle-help",
      a: /^(?:Aide(?: \/ Documentation \/ Légende|, Documentation et Légende| et documentation|,)|Help(?: \/ Documentation \/ Legend|, Documentation and Legend| and documentation|,)|Ayuda(?: \/ Documentación \/ Leyenda|, Documentación y Leyenda| y documentación|,))/ },
    { e: "📚", i: "circle-help", b: /\| (?:Aide \/ Documentation \/ Légende|Help \/ Documentation \/ Legend|Ayuda \/ Documentación \/ Leyenda) \|$/ },
    { e: "📚", i: "circle-help", b: /\((?:groupe|grupo)$/ },
    { e: "📚", i: "circle-help", b: /\($/, a: /^group\)/ },
    { e: "⚙️", i: "settings" },
    // Fenêtre Tracker.
    { e: "▶️", i: "play", a: /^\/ ⏹️?/ },
    { e: "▶️", i: "play", a: /^(?:Démarrer le suivi|Start(?:ing)? (?:the )?tracking|Iniciar el seguimiento)/ },
    { e: "▶️", i: "play", a: /^(?:Suivi —|Tracking —|Seguimiento —|Démarrer ?:|Start ?:|Iniciar ?:)/ },
    { e: "▶️", i: "play", b: /(?:Touche|Tap|Toca|relance-le avec|restart it with|reinícialo con)$/ },
    { e: "⏹️", i: "square" },
    { e: "🔃", i: "rotate-cw" },
    { e: "🪧", i: "signpost", a: /^(?:Guidage de l'itinéraire|Itinerary guidance|Guiado del itinerario)/ },
    { e: "🪧", i: "signpost", b: /(?:la tuile|la ficha)$/ },
    { e: "🪧", i: "signpost", b: /the$/, a: /^tile\b/ },
    { e: "📍", i: "map-pin-check", a: /^(?:Mode recalage|Realignment mode|Modo recolocación)/ },
    { e: "📍", i: "map-pin-check", a: /^\((?:le bouton s'allume|the button lights up|el botón se ilumina)/ },
    { e: "🎯", i: "locate-fixed", a: /^(?:Ma position|My position|Mi posición)\b/ },
    { e: "🔓", i: "lock-open", a: /^(?:Suspendre le verrou|Suspend (?:the )?(?:trace )?lock|Suspender el bloqueo)/ },
    { e: "🗺️", i: "route", a: /^(?:Calculer un itinéraire|Compute a route|Computing a route|Calcular una ruta|Calcular un itinerario)/ },
    { e: "🗺️", i: "list", a: /^(?:Légende|Legend|Leyenda)\b/ },
    { e: "🎬", i: "clapperboard" },
    { e: "🔥", i: "flame" },
    { e: "⛑️", i: "life-buoy" },
    { e: "🔆", i: "maximize" },
    { e: "🚑", i: "ambulance", a: /^(?:Mode Secours|Rescue mode|Modo Rescate)\b/i },
    { e: "📡", i: "radio", a: /^(?:Partager ma position|Share my position|Compartir mi posición)/ },
    // Mesure et dessin.
    { e: "♦️", i: "square-dashed" },
    { e: "📏", i: "sigma" },
    { e: "⛏️", i: "pickaxe" },
    { e: "❌", i: "eraser", a: /^(?:Effacer (?:propose|—)|Erase (?:offers|—)|Borrar (?:propone|ofrece|—))/ },
    { e: "🧹", i: "eraser" },
    { e: "✅", i: "check",
      a: /^(?:Valider le tracé|Fermer (?:la zone|la structure|\/ Valider)|Confirm the current path|Close (?:the (?:current )?(?:zone|structure)|\/ )|Validar el trazado|Cerrar (?:la zona|la estructura|\/ Validar)|dans le menu|in the menu|en el menú)/ },
    { e: "✅", i: "check", b: /(?:se termine par|ends with|termina con)$/ },
    { e: "🪜", i: "m-echelle",
      a: /^(?:Jonction interniveau|Inter-level junction|Unión entre niveles|Tracer une jonction|Drawing an inter-level|Trazar una unión)(?!s)/ },
    { e: "🪜", i: "m-echelle", b: /(?:re-appuie sur|vuelve a pulsar)$/ },
    { e: "🪜", i: "m-echelle", b: /press$/, a: /^again\b/ },
    { e: "➕", i: "plus", a: /^(?:nouveau type|new type|nuevo tipo)/i },
    // Lanceur d'export.
    { e: "🖼️", i: "image", a: /^(?:Image|Imagen) \(PNG/ },
    { e: "🖨️", i: "file-text" },
    { e: "🛰️", i: "satellite" },
    { e: "💾", i: "save", a: /^(?:Export complet|Full export|Exportación completa)/ },
    { e: "🎨", i: "sliders-horizontal", a: /^(?:Export avancé|Advanced export|Exportación avanzada)/ },
    { e: "📊", i: "table", a: /^(?:Éditeur de données du plan|Plan data editor|Editor de datos del mapa)/ },
    { e: "🔄", i: "refresh-cw", a: /^(?:Mettre à jour le plan|Update the map|Actualizar el mapa)/ },
    { e: "❓", i: "circle-help", a: /^(?:Aide (?:\(groupe|—|Rechercher)|Help (?:window|—|Search)|Ayuda (?:\(grupo|—|Buscar))/ },
    // Accueil.
    { e: "📖", i: "book-open", a: /^(?:Documentation|Documentación)\b/ },
    { e: "📖", i: "book-open", b: /(?:à gauche de|left of|a la izquierda de|accueil \(bouton|home screen \(|inicio \(botón|fenêtre|ventana|icônes|iconos)$/ },
    { e: "📖", i: "book-open", a: /^(?:window\b|and 🆘 icons)/ },
    { e: "🚨", i: "siren", a: /^(?:Alertes publiques|Public alerts|Alertas públicas|de l'écran d'accueil|de l'accueil|(?:button )?(?:on|of) the home|de la pantalla de inicio|del inicio)/ },
    { e: "🚨", i: "siren", b: /(?:La fenêtre|The window|La ventana)$/, a: /^(?:peut proposer|can offer|puede proponer)/ },
    { e: "📥", i: "cloud-download", a: /^(?:rouge|rojo)\b/ },
    { e: "📥", i: "cloud-download", b: /\(a red$/ },
    { e: "☑", i: "square-check", a: /^(?:Sélectionner|Select|Seleccionar)\b/ },
    { e: "➕", i: "folder-plus", b: /(?:crée tes dossiers|create your folders|crea tus carpetas) \($/ },
    { e: "🧊", i: "box", a: /^(?:Vue 3D|3D view|Vista 3D)\b/ },
    // Lanceur d'export : titres de section.
    { e: "🖼️", i: "image", a: /^(?:Image|Imagen)(?: —|,| →)/ },
    { e: "🖼️", i: "image", a: /^(?:Exporter en image|Export(?:ing)? (?:as an |to an |an )?image|Exportar (?:en|como) imagen)/ },
    { e: "💾", i: "save", a: /^(?:Session|Sesión)\b(?! memory)/ },
    { e: "🗺️", i: "map", a: /^(?:Plan|Map|Mapa) \(/ },
    { e: "🌍", i: "globe", a: /^(?:Export externe|External export|Exportación externa)\b/ },
    // Accueil : titres, Outils, lignes de plan.
    { e: "📚", i: "library",
      a: /^(?:Mes plans|My (?:maps|plans)|Mis (?:mapas|planos)|(?:Voir t|T)ous mes plans|(?:See |Show |View )?[Aa]ll my (?:maps|plans)|(?:Ver t|T)odos mis (?:mapas|planos)|Ta liste de plans|Your (?:map|plan) list|Tu lista de (?:mapas|planos))/ },
    { e: "📚", i: "cloud", a: /^(?:Plans du site|Site maps|Mapas del sitio)/ },
    { e: "🌍", i: "map", b: /widget$/, a: /^(?:Vue OSM|OSM [Vv]iew|Vista OSM)/ },
    { e: "🌍", i: "map", a: /^(?:Vue OSM|OSM [Vv]iew|Vista OSM) (?:de l'accueil|widget|del inicio|de la pantalla de inicio)/ },
    { e: "📦", i: "package-plus", a: /^(?:Ajouter un plan|Add a (?:map|plan)|Añadir un (?:mapa|plano)|Charger un plan|Load(?:ing)? a (?:map|plan)|Cargar un (?:mapa|plano))/ },
    { e: "📦", i: "folder-input", a: /^(?:Importer plusieurs plans|Import(?:ing)? (?:several|multiple) (?:maps|plans)|Importar varios (?:mapas|planos))/ },
    { e: "🧰", i: "pocket-knife" },
    { e: "📔", i: "notebook-pen", a: /^(?:Mon carnet|My logbook|Mi cuaderno|Tenir un carnet|Keep a logbook|Llevar un cuaderno)/ },
    { e: "📊", i: "table", a: /^(?:Éditeur de données|Data editor|Editor de datos)/ },
    { e: "🌀", i: "waypoints", a: /^(?:Mes liaisons|My links|Mis enlaces)/ },
    { e: "📸", i: "camera", a: /^(?:Mes photos|My photos|Mis fotos)/ },
    { e: "🏗️", i: "drafting-compass",
      a: /^(?:Générer un plan|Generate a (?:map|plan)|Generar un (?:mapa|plano)|Créer ou modifier un plan|Creat(?:e|ing) or (?:edit|modify)(?:ing)? a (?:map|plan)|Crear o modificar un (?:mapa|plano)|Générateur|Generator|Generador)\b/ },
    { e: "🌐", i: "cloud",
      a: /^(?:🌐 )?(?:Afficher les plans (?:du site|serveur)|Show (?:the )?(?:site|server) (?:maps|plans)|Mostrar (?:los )?(?:mapas|planos) del? (?:sitio|servidor)|\| (?:Plan proposé par le serveur|Map (?:offered|provided) by the server|Mapa (?:propuesto|ofrecido) por el servidor))/ },
    { e: "🌐", i: "cloud", a: /^(?:serveur|server|servidor) (?:ou|or|o)\b/ },
    { e: "🌐", i: "globe", a: /^(?:Géoréférencement|GPS georeferencing|Georeferenc|Georreferenc)/ },
    { e: "💾", i: "hard-drive", a: /^(?:local\)|\| (?:Plan ZIP chargé|ZIP map loaded|Mapa ZIP cargado))/ },
    { e: "💾", i: "hard-drive", a: /^(?:Mémoriser le plan dans l'app|Store the map in the app|Memorizar el mapa en la app)/ },
    { e: "☁️", i: "database" },
    { e: "📁", i: "folder",
      a: /^(?:Ranger tes plans en dossiers|(?:Organi[sz]|Sort)(?:e|ing) your (?:maps|plans) (?:in|into) folders|Ordena(?:r)? tus (?:mapas|planos) en carpetas|(?:Dossiers|Folders|Carpetas) —|Déplacer vers|Move to|Mover a)/ },
    { e: "📁", i: "folder-plus", a: /^(?:Créer un dossier depuis|Create a folder from|Crear una carpeta desde)/ },
    // Configuration de l'accueil (groupes partagés avec les Réglages du plan) et ses fenêtres.
    { e: "🌍", i: "layout-grid", a: /^(?:Application|Aplicación) —/ },
    { e: "🎨", i: "palette", a: /^(?:Affichage|Display|Visualización)\b/ },
    { e: "🧩", i: "puzzle" },
    { e: "🔒", i: "shield",
      a: /^(?:Confidentialité (?:&|&amp;) (?:sécurité|Audit)|Privacy (?:&|&amp;) (?:security|[Aa]udit|[Nn]etwork audit)|Privacidad y (?:seguridad|[Aa]uditoría)|Confidencialidad y auditoría)/ },
    { e: "🛠️", i: "monitor-cog", a: /^(?:Système|System|Sistema) (?:&|&amp;|and|y) / },
    { e: "🛠️", i: "code-xml", a: /^(?:Mode Développeur|Developer [Mm]ode|Modo [Dd]esarrollador)/ },
    { e: "📐", i: "scaling", a: /^(?:Adapter la taille des icônes|Scale icon size|Adaptar el tamaño de los iconos)/ },
    { e: "❓", i: "circle-help", a: /^(?:Bouton d'aide dans les fenêtres|Help button inside windows|Botón de ayuda en las ventanas)/ },
    { e: "🔔", i: "bell", a: /^(?:Notifications|Notificaciones)\b/ },
    { e: "🪟", i: "panels-top-left" },
    { e: "➕", i: "zoom-in", a: /^(?:Boutons de zoom|Zoom \+\/− buttons|Botones de zoom)/ },
    { e: "🧲", i: "magnet" },
    { e: "☀️", i: "sun-moon", a: /^(?:Thème clair|Light theme|Tema claro)/ },
    { e: "📱", i: "smartphone", a: /^(?:Garder l'écran allumé|Keep (?:the )?screen on|Mantener la pantalla encendida)/ },
    { e: "🔋", i: "battery", a: /^(?:Niveau de batterie|Battery level|Nivel de batería)/ },
    { e: "📳", i: "vibrate" },
    { e: "🕵️", i: "venetian-mask" },
    { e: "🔐", i: "key-round",
      a: /^(?:Code d'accès local|Local access code|Código de acceso local|Activer le code d'accès|Enable access code|Activar código de acceso)/ },
    { e: "✏️", i: "pencil", a: /^(?:\u270F )?(?:Modifier le code|Change code|Cambiar código)/ },
    { e: "🔓", i: "lock-open", a: /^(?:Désactiver|Disable|Desactivar)\b/ },
    { e: "🗺️", i: "map", a: /^(?:Vue OSM|OSM [Vv]iew|Vista OSM)/ },
    { e: "🚫", i: "ban", a: /^(?:Ne pas charger les plans du site|Don't load the site's maps|No cargar los mapas del sitio)/ },
    { e: "📋", i: "scroll-text", a: /^(?:Voir le journal réseau|View the network log|Ver el registro de red|Journal réseau|Network log|Registro de red)/ },
    { e: "📋", i: "copy", b: /(?:ton appareil, avec|your device, with|tu dispositivo, con)$/,
      a: /^(?:Copier le rapport|Copy the report|Copiar el informe)/ },
    { e: "📖", i: "book-open", a: /^(?:Que fait l'app sur le réseau|What does the app do on the network|¿?Qué hace la app en la red)/ },
    { e: "📊", i: "gauge",
      a: /^(?:Voir l'état mémoire|View memory state|Ver el estado de (?:la )?memoria|État mémoire|Memory state|The app's memory state|Estado de (?:la )?memoria|Inspecteur|Inspector)/ },
    { e: "🔧", i: "wrench", a: /^(?:Dépannage|Troubleshooting|Resolución de problemas|En cas de problème|En caso de problema)/ },
    { e: "🔧", i: "gauge", a: /^(?:Voir l'état du cache|View cache state|Ver el estado de la caché)/ },
    { e: "🔧", i: "unplug", a: /^(?:Ouvrir l'outil Kill SW|Open the Kill SW tool|Abrir la herramienta Kill SW)/ },
    { e: "🔄", i: "refresh-cw", a: /^(?:Forcer la mise à jour|Force the update|Forzar la actualización)/ },
    { e: "💥", i: "trash-2", a: /^(?:Tout réinitialiser|Reset everything|Reiniciar(?:lo)? todo)/ },
    { e: "🐛", i: "bug" },
    // Fenêtres d'outils de la carte : rubriques des Réglages du plan, titres de fenêtre et de section.
    { e: "📐", i: "map", a: /^(?:Plan ?: |Map: |Mapa: |Plano: )/ },
    { e: "📍", i: "navigation", a: /^(?:Navigation (?:&|&amp;) tracker|Navegación y tracker)/ },
    { e: "🚀", i: "rocket", a: /^(?:Performance|Rendimiento|Mode (?:Performance )?ULTRA|ULTRA mode|Modo (?:Rendimiento )?ULTRA)\b/ },
    { e: "👣", i: "footprints", a: /^(?:Détection des pas|Step detection|Detección de pasos)/ },
    { e: "🎤", i: "mic", a: /^(?:Commandes vocales|Voice commands|Comandos de voz)/ },
    { e: "🕹️", i: "joystick", a: /^(?:Pavé classique|Classic pad|Pad clásico)/ },
    { e: "🏷️", i: "tag", a: /^(?:Tags des points|Tags →|Point tags|Tags de los puntos|Tags à éviter|Tags to avoid|Tags a evitar)/ },
    { e: "🏠", i: "house", a: /^(?:Réglés depuis l'accueil|Set from the home screen|Ajustados desde el inicio)/ },
    { e: "📉", i: "m-niveaux", a: /^(?:Niveaux ?: profondeur|Levels: depth|Niveles: profundidad|Profil en long|Elevation profile|Perfil longitudinal)/ },
    { e: "🎬", i: "presentation", a: /^(?:(?:Activer le )?[Mm]ode présentation|(?:Enable )?[Pp]resentation mode|(?:Activar el )?[Mm]odo presentación)/ },
    { e: "🪧", i: "signpost", a: /^(?:Feuille de route|Route sheet|Hoja de ruta)/ },
    { e: "📍", i: "map-pin", a: /^(?:Points · |Puntos · |Points à éviter|Points to avoid|Puntos a evitar)/ },
    { e: "📊", i: "chart-column",
      a: /^(?:Stats globales|Global stats|Estadísticas globales|Statistiques du plan|Map statistics|Estadísticas del mapa|Voir les statistiques globales|View the map's global statistics|Ver las estadísticas globales)/ },
    // Barre du haut, barre du bas, vue 3D, fiches de point, Mode Secours, Générateur, accueil.
    { e: "❓", i: "circle-help" },
    { e: "📖", i: "scroll",
      a: /^(?:Mode Histoire|Story [Mm]ode|History [Mm]ode|Modo Historia|PDF Histoire|History PDF|PDF Historia|de la barre du haut|à droite de la barre|button (?:in|on) the top bar|button on the right|on the right of the top bar|de la barra (?:de arriba|superior)|a la derecha de la barra)/ },
    { e: "📖", i: "scroll", b: /(?:à côté de|next to|junto a)$/ },
    { e: "📖", i: "file-text", a: /^(?:Récits|Stories|Relatos|L'onglet Récits|The Stories tab|La pestaña Relatos)/ },
    { e: "🌍", i: "map", a: /^(?:Vue OSM|OSM [Vv]iew|Vista OSM)\b/ },
    { e: "🌍", i: "map", a: /^(?:de la barre du haut|in the top bar|on the top bar|de la barra (?:de arriba|superior)|sur un plan|on a map|en un mapa|button (?:in|on) the top bar|button on a map)/ },
    { e: "🌍", i: "globe",
      a: /^(?:tous les plans|all (?:the )?(?:maps|plans)|todos los (?:mapas|planos)|selon la ligne|depending on the row|según la (?:fila|línea)|Exporter vers une autre app|Export(?:ing)? to another app|Exportar a otra app|Export KMZ|KMZ export|Geolocated KMZ export|Exportación KMZ|Exportar KMZ)/ },
    { e: "🌍", i: "globe", b: /\/$/ },
    { e: "🚨", i: "siren", a: /^(?:Sortie d'urgence|Emergency exit|Salida de emergencia)/i },
    { e: "🚨", i: "siren",
      a: /^(?:de la barre du haut|dans la barre du haut|in the top bar|button in the top bar|en la barra superior|de la barra superior|, ❓|, ❓)/ },
    { e: "🚨", i: "siren", b: /(?:à côté de|next to|junto a|tracé depuis|drawn from|trazada desde)$/ },
    { e: "🚨", i: "siren", b: /(?:Bouton|The|Botón)$/, a: /^(?:à droite|button on the right|a la derecha)/ },
    { e: "🚨", i: "users", a: /^(?:Équipes?\b|Field team|Teams?\b|Equipos?\b|Côté équipe|Team side|Lado del equipo)/ },
    { e: "🚨", i: "hand", a: /^(?:Prendre la main|Take over|Tomar el control)/ },
    { e: "🧭", i: "route", a: /^(?:Y aller|Go there|Ir allí|Affiner le tracé|Refine the trail|Afinar la traza)/ },
    // emoji-texte-ok (ligne suivante) : motif comparé au texte nettoyé, sans U+FE0F (_nettoyer).
    { e: "🧭", i: "navigation", a: /^(?:Suivi\b|Follow\b|Seguimiento\b|\/ 🕹|de la barre du bas|tracker \(ON|light in the bottom|tracker light|de la barra (?:de abajo|inferior)|rastreador \(ON|est grisé|is greyed|aparece en gris|grisé|greyed out|en gris)/ },
    { e: "🧭", i: "signpost", a: /^(?:Suivre mon parcours|Follow my route|Seguir mi recorrido)/ },
    { e: "✏️", i: "square-dashed",
      a: /^(?:Par zone|By area|Por zona|Effacer par zone|Erase by area|Borrar por zona|Sélectionner par zone|Select by area|Seleccionar por zona)/ },
    { e: "✏️", i: "pencil",
      a: /^(?:Modifier\b|Edit\b|Editar\b|Modificar\b|Éditer\b|Édition\b|Edición\b|Editing\b|Appliquer à la session|Apply to the current|Aplicar a la sesión|Dessiner|Drawing|Dibujar)/ },
    { e: "🗺️", i: "map",
      a: /^(?:Plan au sol|plan au sol|= le plan au sol|Plan on the ground|plan on the (?:ground|floor)|map on the floor|Plano en el suelo|plano en el suelo|= the plan on|= el plano en|Voir sur (?:la )?carte|Show on (?:the )?map|Ver en el mapa|Choisir sur la carte|Pick on the map|Elegir en el mapa|Convertir (?:depuis un|un fichier) SIG|Convert (?:from|a) GIS|Convertir (?:desde|un archivo) SIG|Surligner les galeries|Highlight galleries|Resaltar las galerías)/ },
    { e: "🗺️", i: "route",
      a: /^(?:Calc\. (?:itinéraire|route|ruta)|Itinéraire actif|Active route|Ruta activa|Parcours :|Route:|Recorrido:|itinéraire \(distance|route \(distance|itinerario \(distancia|itinéraire et ses étapes|route and its stops|itinerario y sus etapas|distance · temps|distance · time|distancia · tiempo)/ },
    { e: "🚑", i: "ambulance",
      a: /^(?:Secouriste libre|Free rescuer|Socorrista libre|secouriste libre|free rescuer|socorrista libre|Évacuer|Evacuate|Evacuar|ouvre cette étape|badge opens that step|abre esa etapa)/ },
    { e: "🗺️", i: "list", a: /^(?:du bandeau|button of the banner|del encabezado)/ },
    { e: "⭐", i: "star" },
    { e: "🎓", i: "graduation-cap" },
    { e: "🤖", i: "bot" },
    // Tutoriel (cartes substituées au rendu).
    { e: "📦", i: "archive", a: /^(?:Backups récents|Recent backups|Backups recientes)/ },
    // emoji-texte-ok (ligne suivante) : motif comparé au texte nettoyé, sans U+FE0F (_nettoyer).
    { e: "📸", i: "camera", b: /🏛$/ },
    // emoji-texte-ok (ligne suivante) : motif comparé au texte nettoyé, sans U+FE0F (_nettoyer).
    { e: "📍", i: "map-pin", a: /^🛣/ },
    { e: "📍", i: "map-pin-check", a: /^(?:Je suis ici|I am here|Estoy aquí)(?![\wÀ-ÿ])/ },
    { e: "▶️", i: "play", a: /^(?:Charger ce plan|Load this map|Cargar este mapa|Reprendre\b|Resume\b|Reanudar\b)/ },
    { e: "📚", i: "circle-help", a: /^→ (?:Légende|Legend|Leyenda)/ },
    { e: "🔭", i: "telescope", a: /^(?:Portée|Range|Alcance)\b/ },
    { e: "🧱", i: "brick-wall", a: /^(?:Textures?|Texturas?)\b/ },
    { e: "🧱", i: "grid-2x2", a: /^(?:Convertir en V2|Convert to V2|Convertir a teselas)/ },
    { e: "🌫️", i: "cloud-fog" },
    { e: "🔦", i: "flashlight" },
    { e: "📌", i: "move", a: /^(?:Repositionner|Reposition|Reposicionar)\b/ },
    { e: "📢", i: "megaphone" },
    { e: "🔊", i: "volume-2" },
    { e: "⏸️", i: "pause" },
    { e: "🚒", i: "clipboard-list", a: /^(?:Briefing pompiers|Firefighter briefing|Briefing bomberos)/ },
    { e: "👤", i: "user", a: /^(?:Opérateur|Surface operator|Operador|Chef\b|Leader\b|Jefe\b|Côté opérateur|Operator side|Lado del operador|Retour Opérateur|Back to Operator|Volver a Operador)/ },
    { e: "👥", i: "users", a: /^(?:Membres|Members|Miembros|Les équipes|Teams ➕|Los equipos)/ },
    // Fin de la refonte : profil et son export, sélection multiple, Sortie d'urgence, Mode Histoire, recalage,
    // doublon d'import, hors ligne d'un plan, maintenance, Aide IA, fiche d'un point.
    { e: "🏆", i: "trophy" },
    { e: "📅", i: "calendar", a: /^(?:Date de constat|date de constat|Date observed|date observed|Fecha de constatación|fecha de constatación)/ },
    { e: "↗️", i: "external-link", a: /^(?:Ouvrir dans un onglet|Open in a tab|Abrir en una pestaña)/ },
    { e: "👤", i: "user", a: /^(?:Mon profil|My profile|Mi perfil)\b/ },
    { e: "📤", i: "arrow-up-from-line", a: /^(?:Exporter mon profil|Export my profile|Exportar mi perfil)/ },
    { e: "📥", i: "arrow-down-to-line",
      a: /^(?:Importer un profil|Import a profile|Importar un perfil|Télécharger le contexte|Download the context|Descargar el contexto)/ },
    { e: "🔄", i: "merge", a: /^Merge\b/ },
    { e: "♻️", i: "replace", a: /^Replace\b/ },
    { e: "♻️", i: "rotate-ccw", a: /^(?:Recréer|recréer|Recreate|recreate|Recrear|recrear)\b/ },
    { e: "🔄", i: "refresh-cw", a: /^(?:Mettre à jour|Update|Actualizar) (?:—|\()/ },
    { e: "🔄", i: "refresh-cw", a: /^(?:Convertir|Convert|Conversion|Conversión)\b/ },
    { e: "💾", i: "save", a: /^(?:Sauver la note|Save the note|Guardar la nota)/ },
    { e: "➕", i: "plus", a: /^(?:Garder les deux|Keep both|Conservar ambos|Tous les « type »|All “type”|Todos los «)/ },
    { e: "⬇️", i: "cloud-download", a: /^(?:Rendre disponible hors-ligne|Make available offline|Hacer disponible sin conexión)/ },
    { e: "🧭", i: "route", a: /^(?:Tracer l'itinéraire|Plot the route|Trazar la ruta)/ },
    { e: "🌀", i: "waypoints", a: /^(?:Portail suivant|Next portal|Portal siguiente|Itinéraire via plusieurs plans|Route across multiple plans|Ruta a través de varios planos|Ruta por varios planos)/ },
    { e: "🗑️", i: "trash-2",
      a: /^(?:Effacer la session|Clear the session|Borrar la sesión|Supprimer \(N\)|Delete \(N\)|Eliminar \(N\))/ },
    { e: "🏗️", i: "m-niveaux", a: /^(?:Niveau|Level|Nivel) \(N\)/ },
    { e: "✅", i: "check",
      a: /^(?:Convertir \(N\)|Convert \(N\)|Prendre la zone|Use this area|Usar esta zona|Tomar la zona)/ },
    { e: "📝", i: "pencil-line", a: /^(?:Note libre|Free note|Nota libre)/ },
    { e: "👁️", i: "eye", a: /^(?:Aperçu|Preview|Vista previa|Tout|All|Todo)\b/ },
    { e: "↕️", i: "m-niveaux", a: /^(?:Niveaux desservis|Levels served|Niveles servidos)/ },
    { e: "📌", i: "link", a: /^(?:Photo|Foto)\b/ },
    { e: "🎯", i: "ruler", a: /^(?:Calibrer l'échelle|Calibrate the scale|Calibrar la escala)/ },
    { e: "🔁", i: "repeat", a: /^(?:Recaler des données|Realign data|Recalar datos|Tour complet|Full tour|Recorrido completo)/ },
    { e: "⌨️", i: "keyboard", a: /^(?:Raccourcis clavier|Keyboard shortcuts|Atajos de teclado)/ },
  ];

  const AUTRE_SENS = [
    { e: "🔒", s: "données gardées sur l'appareil (tutoriel)", a: /^(?:Tes plans, tes notes|Your maps, notes|Tus mapas, tus notas)/ },
    { e: "💾", s: "enregistrement automatique (tutoriel)", a: /^(?:Tout s'enregistre|Everything is saved|Todo se guarda)/ },
    { e: "📸", s: "photos d'un point (tutoriel)", a: /^(?:photos|fotos)\)/ },
    { e: "📡", s: "première ouverture avec du réseau (tutoriel)", a: /^(?:Ouvre-la une fois|Open it once|Ábrela una vez)/ },
    { e: "📱", s: "installation sur l'écran d'accueil (tutoriel)", a: /^(?:Installe l'app|Install the app|Instala la app)/ },
    { e: "🪧", s: "bandeau du guidage (tutoriel)", a: /^(?:En marchant|As you walk|Mientras caminas)/ },
    { e: "🧭", s: "position du tracker (départ d'itinéraire, réglage)", a: /^Tracker (?:start )?position/ },
    { e: "🧭", s: "réglages de navigation, rose des vents, Dijkstra, titres" },
    { e: "✏️", s: "puces de la vue Édition de la 3D (caméra, zoom, survol…), nom local, renommer" },
    { e: "🛣️", s: "rendu Galerie / Mixte de la 3D", a: /^(?:Galerie|Gallery|Galería|Tunnels|Mixte|Mixed|Mixto)\b/ },
    { e: "🛣️", s: "rendu Mixte de la 3D", b: /🏛️?$/ },
    { e: "🛣️", s: "écran de démarrage", a: /^(?:Grand réseau|Large network|Red grande)/ },
    // Compteurs de la barre du haut (en minuscules) ; les catégories de la Recherche (capitale) sont en SVG.
    { e: "🛣️", s: "compteurs de la barre du haut", b: /(?:points?|puntos?) ·$/ },
    { e: "⬛", s: "compteurs de la barre du haut", b: /(?:tracés|paths|trazados) ·$/ },
    { e: "⬛", s: "type Remblais (pastille de type), fond noir de l'export",
      a: /^(?:Remblais|Backfill|Rubble|Escombros|Noir|Black|Negro)\b/ },
    { e: "⬛", s: "zone du Secours, POI Bloqué",
      a: /^(?:Définir zone|Define (?:a )?zone|Definir zona|Bloqué|Blocked|Bloqueado)/ },
    { e: "🏛️", s: "compteurs de la barre du haut", b: /(?:zones|zonas) ·$/ },
    { e: "🏛️", s: "rendus de la 3D", a: /^(?:🛣️?|Les trois rendus|The three renderings|Las tres representaciones|Rendu|Render|Renderizado)/ },
    { e: "🏛️", s: "rendu Structures de la 3D", a: /^(?:Structures|Estructuras) ?(?:- |: structures seules|: structures only|: solo estructuras)/ },
    { e: "📐", s: "calibrage, coordonnées (la rubrique Plan des Réglages est en SVG)",
      a: /^(?:(?:Plan|Map|Mapa|Plano)\b(?! ?:)|Calibr|Point C|Punto C|Coordonnées|Coordinates|Coordenadas)/ },
    { e: "🔍", s: "recherche d'un point dans un formulaire, filtres, analyse, diagnostic",
      a: /^(?:Choisir via|Pick via|Chercher un point|recherche d'un point|recherche ou|Choose via|Search (?:for )?a point|search for an existing|search or|búsqueda de un punto|Elegir mediante|Buscar un punto|búsqueda o|L'image du plan est floue|The map image is blurry|La imagen del mapa|Outils d'analyse|Analysis tools|Herramientas de análisis|Filtres|Filters|Filtros)/ },
    { e: "🔎", s: "champs et filtres (doc, Mes plans, photos, sélection)" },
    { e: "⬇️", s: "télécharger, hors ligne, charger un plan à l'accueil" },
    { e: "⏪", s: "Annuler de la vue 3D (son propre bouton)",
      b: /(?:mêmes couleurs|same colou?rs|mismos colores|Niveau de la 3D|Level of the 3D view|Nivel de la 3D),$/ },
    { e: "📚", s: "Bonnes pratiques, documents PDF du plan, Histoire" },
    { e: "▶️", s: "lecteur du Replay, pavé de la 3D, Départ du carnet" },
    { e: "🪧", s: "bandeau et feuille de route du guidage, fiche d'aide Itinéraire et guidage" },
    { e: "📍", s: "points, Je suis ici, clic carte, réglages Navigation & tracker, GPS surface" },
    { e: "🎯", s: "précision d'un point, sélection, calibrage, zone de recherche, recentrer" },
    { e: "🔒", s: "zéro télémétrie, audit réseau, seul écran en ligne, passages interdits" },
    { e: "🗺️", s: "Légende posée à l'export", a: /^(?:Légende posée|Legend placed|Leyenda colocada)/ },
    { e: "🗺️", s: "carte, fiche Itinéraire et guidage, Plan en cours, mini-carte, Orientation, Utiliser la carte" },
    { e: "🔥", s: "heatmap du Mode Secours",
      a: /^(?:Afficher la heatmap|Show the (?:activity )?heatmap|Mostrar el mapa de calor)/ },
    { e: "🚑", s: "victime trouvée (statut), lancer un plan de secours (titre), Mode Secours garde" },
    { e: "📡", s: "hors connexion, export GPS" },
    { e: "📏", s: "marge, outil Mesurer de la Vue OSM", a: /^(?:Marge|Margin|Margen|Mesurer|Measur\w*|Medir)\b/ },
    { e: "❌", s: "ce que l'app n'est pas, refus, effacer un surlignage ou un itinéraire" },
    { e: "🧹", s: "outils du Secours et de maintenance",
      a: /^(?:Découper|Parcours|Dédoublonner|Données orphelines|Split|Route|Deduplicate|Orphan|Dividir|Recorrido|Deduplicar|Datos huérfanos|Desduplicar)/ },
    { e: "✅", s: "états (gardé, OK, accepté), rentrée, résumé" },
    { e: "🪜", s: "boutons de la zone jonction (menu Zone, bulle), affichés en emoji comme les autres types de zones",
      a: /^\**(?:(?:Nouvelle )?[Zz]one jonction|(?:New )?[Jj]unction zone|(?:Nueva )?[Zz]ona de unión|Tracer la jonction|Draw the junction|Trazar la unión|Changer les niveaux|Change the levels|Cambiar los niveles)/ },
    { e: "🪜", s: "changer de niveau dans la 3D, accès, réglage d'affichage" },
    { e: "➕", s: "ajouter (étape, équipe, phase, PDF, entrée, plan), garder les deux" },
    { e: "🖼️", s: "calques d'image, image principale, image du KMZ, galerie photo" },
    { e: "💾", s: "bouton Mémoriser d'une ligne de plan, sauvegarde, enregistrer, hors-ligne" },
    { e: "🎨", s: "fond sous le plan, légende, couleurs, export avancé de session, image vierge" },
    { e: "📊", s: "détails de la session, statistiques, calques de données" },
    { e: "🔄", s: "import d'un plan existant", a: /^(?:Mettre à jour le plan —|Update the map —|Actualizar el mapa —)/ },
    { e: "🔄", s: "modifier un calque, changer de plan, crédits" },
    { e: "🌍", s: "crédits OpenStreetMap" },
    { e: "📖", s: "topo, audit réseau, doc d'installation, documentation en ligne" },
    { e: "🚨", s: "victime trouvée (statut), alertes de survie, catégorie Secours, seuil de batterie, rubrique Urgence" },
    { e: "📥", s: "importer, installer, télécharger" },
    { e: "ℹ️", s: "fiche d'un plan" },
    { e: "🧊", s: "crédits three.js" },
    { e: "🧰", s: "préparer un scénario de Secours", a: /^1\. / },
    { e: "🧰", s: "section Outils de la fenêtre Tracker (titre sans icône)", a: /^(?:Outils|Tools|Herramientas) —/ },
    { e: "📦", s: "Backups, Générer le ZIP, JSZip, rapport du Secours, propriété des données" },
    { e: "📔", s: "Sortie en cours, Démarrer une sortie, rubrique Mes sorties et mes données" },
    { e: "🌀", s: "liaisons inter-plan, portails, Passer au plan" },
    { e: "📸", s: "photos d'un point, case Photos des exports, compteur, crédits html2canvas" },
    { e: "🏗️", s: "Niveaux, multi-niveau, bouton de la barre latérale du Générateur" },
    { e: "🌐", s: "géoréférencement, coordonnées GPS, hors-ligne par défaut, crédits GPX" },
    { e: "☁️", s: "bouton Publier (installation reliée)", a: /^(?:Publier|Publish|Publicar)/ },
    { e: "📁", s: "plan à re-sélectionner (badge), Re-sélectionner le ZIP, Ranger dans, dossier du Générateur" },
    { e: "🛠️", s: "conseils aux créateurs de plans" },
    { e: "🔔", s: "alertes et nouveautés (fenêtre 🚨)" },
    { e: "☀️", s: "éclairage Plein jour de la vue 3D" },
    { e: "📱", s: "installation sur mobile, image Max iPhone, choix d'écran allumé de la 3D" },
    { e: "🔋", s: "indicateur de batterie de la barre d'état, seuils" },
    { e: "🔐", s: "badge d'accès permanent, confidentialité des données, code désactivé par défaut" },
    { e: "💥", s: "arrêt brutal de l'application" },
    { e: "📋", s: "Copier le rapport (perdu, Secours), copier une position, résumé à copier" },
    { e: "🔧", s: "outils du Secours et de maintenance" },
    { e: "🚫", s: "interdits, refus, hors-ligne" },
    { e: "📤", s: "exporter (session, CSV, scénario, TXT), titre « Exporter et importer ton profil »" },
    { e: "🗑️", s: "supprimer un sommet (menu de sommet d'une forme)", b: /＋ (?:et|and|y)$/ },
    { e: "🗑️", s: "supprimer, retirer, effacer, tout vider" },
    { e: "🛡️", s: "anonymiser, limiter le dézoom, plans révoqués" },
    { e: "📄", s: "documents, PDF, page" },
    { e: "🚀", s: "mode performance de l'accueil, optimisations, préréglages" },
    { e: "👣", s: "pas, podomètre" },
    { e: "🎤", s: "bouton micro, dictée" },
    { e: "🕹️", s: "joystick et pavé de la vue 3D" },
    { e: "🏷️", s: "tags, étiquettes, légende personnalisée" },
    { e: "🏠", s: "accueil, retour à l'accueil" },
    { e: "📉", s: "profondeur, pente, niveaux en hauteur hors Réglages" },
    { e: "🔭", s: "titre de doc « Pour aller plus loin », barre de la 3D" },
    { e: "🧱", s: "état des textures dans une phrase, catégorie Structures, butée de la 3D" },
    { e: "📌", s: "photo à rattacher, assigner un point" },
    { e: "🚒", s: "secours extérieurs (étape de procédure)" },
    { e: "📝", s: "scénario du Mode Secours (titre, contexte), observations d'une étape" },
    { e: "👁️", s: "suivre une position, fermer, masquer une entrée, niveaux visibles, détails d'une équipe" },
    { e: "↕️", s: "passages entre niveaux (escalier, puits, tracé jonction, marque du panneau de la 3D)" },
    { e: "🔁", s: "titre « Sortie interrompue : reprise et fusion »" },
    { e: "⌨️", s: "encadrés Clavier / Au PC (raccourcis par écran)" },
    { e: "📅", s: "dates (rapports, horodatages, durée d'une sortie)" },
    { e: "↗️", s: "coin haut-droit (calage, légende du PDF)" },
    { e: "👤", s: "profil de l'accueil hors titre, pseudo" },
    { e: "👥", s: "bouton Équipe d'une installation reliée, encadrants, nombre de personnes" }
  ];

  // ── Repères de la doc : tout emoji restant → icône de sa NOTION ──────────────────────────────
  // Un emploi que DOC ne substitue pas (AUTRE_SENS, ou emoji jamais bouton : titre, fil d'Ariane, puce, encadré,
  // tableau) prend l'icône de la notion qu'il désigne, la même que dans l'interface (📍 points → map-pin, 🗑️ →
  // trash-2, 💡 conseil → lightbulb). REPERES : { e, i, a, b } comme DOC (sans motif = notion par défaut de
  // l'emoji). GARDE : { e, s: raison, a, b } = exception affichée en emoji (pastille de couleur, typographie, POI
  // du catalogue). Ordre complet : GARDE ciblé, AUTRE_SENS ciblé, DOC ciblé, DOC sans motif, REPERES ciblé,
  // REPERES sans motif, GARDE sans motif. ⚠️ check-icones-ui.js : tout emoji de la doc doit tomber sous une règle,
  // et le compte des exceptions est figé par emoji (PLAFOND_RESTE).
  const REPERES = [
    { e: "🗑️", i: "trash-2" },
    { e: "📍", i: "navigation",
      a: /^(?:Tracker de position|Position tracker|Rastreador de posición|Tracker de posición|Se repérer|Finding your way|Orientarse)/ },
    { e: "📍", i: "map-pin-check",
      a: /^(?:Recaler sa position|Realign(?:ing)? your position|Recolocar tu posición|Am I here|¿Estoy aquí)/ },
    { e: "📍", i: "map-pin-check", b: /(?:recalage manuel|[Mm]anual recalibration|recalibración manual) \($/ },
    { e: "📍", i: "mouse-pointer-click",
      a: /^(?:(?:Mode )?[Cc]lic carte|Cliquer (?:sur la )?carte|(?:Map )?[Cc]lick (?:on )?(?:the )?map|Map click|(?:Hacer |Haz )?[Cc]lic en el mapa|Modo clic|Préciser sur la carte|Refine on the map|Precisar en el mapa)/ },
    { e: "📍", i: "move", a: /^(?:Déplacer|Move|Mover)\b/ },
    { e: "📍", i: "crosshair", a: /^(?:Centrer|Centre|Center|Centrar)\b/ },
    { e: "📍", i: "map", a: /^(?:ce plan|this map|este mapa|\/🌍|Voir sur la carte|View on (?:the )?map|Ver en el mapa)/ },
    { e: "📍", i: "globe", a: /^(?:GPS surface|Surface GPS|GPS (?:de )?superficie)/ },
    { e: "📍", i: "map-pin" },
    { e: "🎯", i: "circle-dashed",
      a: /^(?:Estimer la zone|Estimate the (?:area|zone)|Estimar la zona|Calculer la zone|Compute the (?:area|zone)|Calcular la zona)/ },
    { e: "🎯", i: "route", a: /^(?:Calculer l'itinéraire|Compute (?:the )?route|Calcular la ruta|Calcular el itinerario)/ },
    { e: "🎯", i: "m-niveaux", a: /^(?:(?:Le n|N)iveau actif|(?:The a|A)ctive level|(?:El n|N)ivel activo)/ },
    { e: "🎯", i: "refresh-cw", a: /^(?:Convertir plusieurs|Convert several|Convertir varios)/ },
    { e: "🎯", i: "ruler",
      a: /^(?:calibrage|calibration|calibración|pour la (?:calibrer|calculer)|to (?:calibrate|compute) it|para (?:calibrarla|calcularla)|ci-dessus|above|más arriba|à côté de l'échelle|next to the scale|junto a la escala|Calibrating the scale|Calibrar la escala)/ },
    { e: "🎯", i: "circle-dot", a: /^(?:Désactiver cercles|Disable intersection circles|Desactivar círculos)/ },
    { e: "🎯", i: "crosshair" },
    { e: "⚠️", i: "triangle-alert" },
    { e: "💾", i: "hard-drive",
      // emoji-texte-ok (ligne suivante) : motif comparé au texte nettoyé, sans U+FE0F (_nettoyer).
      a: /^(?:de la ligne d'un plan|on a ☁ map's row|de la fila de un mapa ☁|on a map's row|of a map's row|de la línea de un mapa|de sa ligne|on its row|of its row|de su línea|de su fila|\((?:plan|map|mapa) 📁|\(📁 map|le garde sans l'ouvrir|keeps it without opening|lo guarda sin abrirlo|Mémoriser les plans|Store (?:the )?maps|Memorizar los mapas|Mémoire des sessions|Session memory|Memoria de (?:las )?sesiones)/ },
    { e: "💾", i: "cloud-download",
      a: /^(?:(?:💾 )?(?:Sauvegarder hors-ligne|Save [Oo]ffline|Guardar sin conexión)|Disponibilité hors-ligne|Offline availability|Disponibilidad sin conexión|Rendre un plan serveur disponible|Mak(?:e|ing) a server map available|Hacer (?:que un mapa de servidor esté )?disponible)/ },
    { e: "💾", i: "archive", a: /^(?:Télécharger le ZIP|Download the ZIP|Descargar el ZIP)/ },
    { e: "💾", i: "save" },
    { e: "🧭", i: "layout-dashboard",
      a: /^(?:Présentation de l'interface|Interface overview|Overview of the interface|Presentación de la interfaz)/ },
    { e: "🧭", i: "locate-fixed",
      a: /^(?:Position (?:initiale du )?tracker|Tracker (?:start )?position|Posición (?:inicial )?del tracker|Ma position|[Tt]a position|My position|[Yy]our position|Mi posición|[Tt]u posición)/ },
    { e: "🧭", i: "magnet",
      a: /^(?:Navigation intelligente|Smart navigation|Navegación inteligente|Caler la position|Snap (?:the )?position|Ajustar la posición)/ },
    { e: "🧭", i: "waypoints", a: /^(?:Itinéraire vers un autre plan|Route to another (?:map|plan)|(?:Ruta|Itinerario) hacia otro (?:mapa|plano))/ },
    { e: "🧭", i: "waypoints", b: /(?:multi-plans|multiplano|multimapa) \((?:bouton|botón)$/ },
    { e: "🧭", i: "waypoints", b: /multi-map search result \($/ },
    { e: "🧭", i: "route", a: /^(?:Algorithme de Dijkstra|Algoritmo de Dijkstra|Dijkstra|Montrer mon itinéraire|Show my route|Mostrar mi (?:ruta|itinerario))/ },
    { e: "🧭", i: "navigation",
      a: /^(?:suivi\b|tracking\b|seguimiento\b|tracker\b|rastreador\b|démarre|starts|arranca|se inicia|Le tracker dérive|The tracker drifts|El tracker deriva)/ },
    { e: "🧭", i: "rotate-cw", a: /^(?:Tourner la carte|Rotat(?:e|ing) the map|Turn(?:ing)? the map|Girar el mapa)/ },
    { e: "🧭", i: "compass" },
    { e: "📊", i: "layers", a: /^(?:Calques de données|Data layers|Capas de datos)/ },
    { e: "📊", i: "gauge", a: /^(?:Ouvrir — depuis l'accueil|Open(?:ing it)? — from the home|Abrir(?:lo)? — desde)/ },
    { e: "📊", i: "chart-column" },
    { e: "🔄", i: "replace", a: /^(?:Remplacer|Replace|Reemplazar|Sustituir)\b/ },
    { e: "🔄", i: "pencil", a: /^(?:Modifier|Edit|Editar|Modificar)\b/ },
    { e: "🔄", i: "library", a: /^(?:Changer de plan|Chang(?:e|ing) (?:the )?map|Switch(?:ing)? (?:the )?map|Cambiar de mapa)/ },
    { e: "🔄", i: "eye", a: /^(?:Tout afficher|Show all|Mostrar todo)/ },
    { e: "🔄", i: "refresh-cw" },
    { e: "🏗️", i: "drafting-compass", a: /^(?:de la barre latérale|(?:button )?(?:of|in|on) the sidebar|de la barra lateral)/ },
    { e: "🏗️", i: "drafting-compass", b: /(?:Générateur|Generator|Generador)$/ },
    { e: "🏗️", i: "m-niveaux" },
    { e: "✅", i: "check",
      a: /^(?:Ajouter|Add|Añadir|ferme|closes|cierra|ou le re-tap|or (?:the )?re-tap|o (?:el )?(?:nuevo toque|volver a tocar))/ },
    { e: "✅", i: "circle-check" },
    { e: "🗺️", i: "route", a: /^(?:Itinéraire|Routes?|Itinerarios?|Rutas?|Parcours, zone|Recorrido, zona)\b/ },
    { e: "🗺️", i: "compass", a: /^(?:Orientation|Orientación)\b/ },
    { e: "🗺️", i: "list", a: /^(?:Légende posée|Legend placed|Leyenda colocada)/ },
    { e: "🗺️", i: "satellite", a: /^(?:Partir d'un GeoTIFF|Start(?:ing)? from a GeoTIFF|Partir de un GeoTIFF)/ },
    { e: "🗺️", i: "rotate-cw", a: /^(?:« ?Plan orienté|"Oriented map|“Oriented map|« ?Mapa orientado)/ },
    { e: "🗺️", i: "map" },
    { e: "🔭", i: "telescope" },
    { e: "⛔", i: "ban",
      a: /^(?:« ?Capteur refusé|"Sensor|“Sensor|« ?Sensor|Plan révoqué|(?:Map|Plan) revoked|Revoked (?:map|plan)|Mapa revocado|si un plan manque|if a map is missing|si falta un mapa)/ },
    { e: "📤", i: "file-text", a: /^\[?jsPDF\b/ },
    { e: "📤", i: "arrow-up-from-line" },
    { e: "➕", i: "plus" },
    { e: "🪜", i: "m-echelle" },
    { e: "📦", i: "archive", a: /^Backups\b/ },
    { e: "📦", i: "flag", a: /^(?:PLAN TERMINÉ|PLAN (?:COMPLETED|ENDED|FINISHED)|MAP COMPLETED|PLAN (?:TERMINADO|FINALIZADO)|5\. )/ },
    { e: "📦", i: "drafting-compass",
      a: /^(?:Créer \/ Modifier un plan|Create \/ (?:Edit|Modify) a (?:map|plan)|Crear \/ Modificar un (?:mapa|plano))/ },
    { e: "📦", i: "package" },
    { e: "📋", i: "list", a: /^(?:Phases|Plusieurs phases|Several phases|Multiple phases|Fases|Varias fases)\b/ },
    { e: "📋", i: "copy" },
    { e: "📸", i: "camera" },
    { e: "✏️", i: "pencil" },
    { e: "🚀", i: "save", a: /^(?:Full|Completo)\b/ },
    { e: "🚀", i: "refresh-cw", a: /^(?:Recharger l'app|Reload the app|Recargar la app)/ },
    { e: "🚀", i: "zap", a: /^(?:Simple \/|Sencillo \/)/ },
    { e: "🚀", i: "rocket" },
    { e: "📥", i: "monitor",
      a: /^(?:Installer l'application sur PC|Install(?:ing)? the app(?:lication)? on (?:a )?(?:PC|computer)|Instalar la aplicación en (?:el )?(?:PC|ordenador))/ },
    { e: "📥", i: "cloud-download",
      a: /^(?:Tout garder hors ligne|Keep (?:everything|all) offline|Guardar todo sin conexión|L'app n'est pas prête hors-ligne|The app is not ready offline|La app no está lista sin conexión)/ },
    { e: "📥", i: "arrow-down-to-line" },
    { e: "🪧", i: "signpost" },
    { e: "🏁", i: "flag" },
    { e: "🖼️", i: "image" },
    { e: "🎨", i: "sliders-horizontal", a: /^(?:Avancé|Advanced|Avanzad[oa]|Mode avancé|Modo avanzado)(?![\wÀ-ÿ])/ },
    { e: "🎨", i: "palette" },
    { e: "↩️", i: "arrow-left", a: /^(?:Retour|Back|Volver|Regresar|QUITTER|EXIT|LEAVE|SALIR)\b/ },
    { e: "↩️", i: "undo-2" },
    { e: "🌀", i: "waypoints" },
    { e: "❌", i: "eraser", a: /^(?:Effacer|Erase|Clear|Borrar)\b/ },
    { e: "❌", i: "circle-x" },
    { e: "🚨", i: "battery-low", a: /^5 ?%/ },
    { e: "🚨", i: "ambulance", a: /^(?:Secours|Rescue|Rescate|Socorro)\b/ },
    { e: "🚨", i: "siren" },
    { e: "📔", i: "notebook-pen" },
    { e: "🕹️", i: "joystick" },
    { e: "🏷️", i: "tag" },
    { e: "🗂️", i: "library", a: /^(?:Changer de plan|Chang(?:e|ing) (?:the )?map|Switch(?:ing)? (?:the )?map|Cambiar de mapa)/ },
    { e: "🗂️", i: "info", a: /^(?:Fiches|Info cards|Cards|Fichas|Popups)\b/ },
    { e: "🗂️", i: "image", a: /^(?:Calques image|Image layers|Capas (?:de )?imagen)/ },
    { e: "🗂️", i: "cloud", a: /^(?:Proposer les plans du serveur|Offer(?:ing)? the server's maps|(?:Proponer|Ofrecer) los mapas del servidor)/ },
    { e: "🗂️", i: "layers" },
    { e: "▶️", i: "play" },
    { e: "🔗", i: "link" },
    { e: "🌐", i: "wifi-off", a: /^(?:100 ?% hors-ligne|100 ?% offline|100 ?% sin conexión)/ },
    { e: "🌐", i: "globe" },
    { e: "🛡️", i: "shield" },
    { e: "ℹ️", i: "info" },
    { e: "✂️", i: "scissors" },
    { e: "🔎", i: "search" },
    { e: "👁️", i: "eye" },
    { e: "🛣️", i: "m-galerie" },
    { e: "📉", i: "m-niveaux" },
    { e: "🧱", i: "m-pilier", a: /^(?:Structures|Estructuras)\b/ },
    { e: "🧱", i: "brick-wall" },
    { e: "🔍", i: "search" },
    { e: "🏛️", i: "m-pilier" },
    { e: "📂", i: "folder-open" },
    { e: "🚫", i: "ban" },
    { e: "↕️", i: "m-echelle" },
    { e: "📁", i: "folder" },
    { e: "🔒", i: "lock", a: /^(?:Ces passages|These passages|Estos pasos)/ },
    { e: "🔒", i: "shield" },
    { e: "🆘", i: "siren" },
    { e: "💡", i: "lightbulb" },
    { e: "🟦", i: "m-zone", a: /^(?:Zones|Areas|Zonas)\b/ },
    { e: "⚡", i: "battery-charging", a: /^(?:\d+ ?%|en charge|charging|cargando|en carga)/ },
    { e: "⚡", i: "zap" },
    { e: "👥", i: "users" },
    { e: "📡", i: "wifi-off", a: /^(?:Utilisation hors connexion|Using (?:it |the app )?offline|Offline use|Uso sin conexión)/ },
    { e: "📡", i: "wifi", a: /^(?:Ouvre-la une fois|Open it once|Ábrela una vez)/ },
    { e: "📡", i: "globe", a: /^(?:Export externe|External export|Exportación externa)/ },
    { e: "📡", i: "radio" },
    { e: "📚", i: "lightbulb",
      a: /^(?:(?:D'abord, les b|B)onnes pratiques|(?:First, g|G)ood practices|(?:First, (?:the )?b|B)est practices|(?:Primero, las b|B)uenas prácticas)/ },
    { e: "📚", i: "file-text", a: /^(?:Documents PDF|PDF documents|Documentos PDF|Histoire —|Story —|History —|Historia —)/ },
    { e: "📚", i: "library" },
    { e: "⏱️", i: "timer" },
    { e: "🏃", i: "rabbit" },
    // emoji-texte-ok (ligne suivante) : motif comparé au texte nettoyé, sans U+FE0F (_nettoyer).
    { e: "🚶", i: "footprints", a: /^(?:Sortie terrain|Terrain|Field|¿?Salida de campo|Salida sobre el terreno|Terreno|Campo\b|\/ 🖥)/ },
    { e: "🚶", i: "person-standing" },
    { e: "⬛", i: "m-zone", b: /(?:tracés|paths|trazados) ·$/ },
    { e: "⬛", i: "m-zone", a: /^(?:Définir zone|Define (?:a )?zone|Definir zona)/ },
    { e: "📐", i: "map", a: /^(?:Plan|Map|Mapa|Plano)\b/ },
    { e: "📐", i: "compass", a: /^Calibr/ },
    { e: "📐", i: "crosshair", a: /^(?:Point C|Punto C)\b/ },
    { e: "📐", i: "globe", a: /^(?:Coordonnées|Coordinates|Coordenadas)\b/ },
    { e: "📐", i: "ruler" },
    { e: "👤", i: "user" },
    { e: "🪫", i: "battery-low" },
    { e: "📖", i: "book-open" },
    { e: "🔐", i: "shield",
      a: /^(?:Confidentialité des données|Data (?:privacy|confidentiality)|Privacy of (?:your )?data|Privacidad de los datos|Confidencialidad de los datos)/ },
    { e: "🔐", i: "key-round" },
    { e: "☁️", i: "cloud" },
    { e: "📱", i: "smartphone" },
    { e: "🔮", i: "eye" },
    { e: "⬇️", i: "folder-open", a: /^(?:Charger|Load|Cargar)\b/ },
    { e: "⬇️", i: "cloud-download" },
    { e: "✋", i: "hand" },
    { e: "⏭️", i: "skip-forward" },
    { e: "⏮️", i: "skip-back" },
    { e: "🔴", i: "triangle-alert", a: /^(?:Avertissements importants|Important warnings|Advertencias importantes)/ },
    { e: "⚪", i: "circle-dot",
      a: /^(?:Ronds aux intersections|Afficher les ronds|(?:Show )?[Cc]ircles at intersections|Intersection (?:dots|circles)|Show (?:the )?intersection|Círculos en las|Mostrar (?:los )?círculos|Puntos en las intersecciones|Mostrar los puntos)/ },
    { e: "🖥️", i: "monitor" },
    { e: "🚑", i: "ambulance" },
    { e: "🧹", i: "split", a: /^(?:Découper|Split|Dividir)/ },
    { e: "🧹", i: "route", a: /^(?:Parcours|Route|Recorrido)\b/ },
    { e: "🧹", i: "merge", a: /^(?:Dédoublonner|Deduplicate|Deduplicar|Desduplicar|Eliminar duplicados)/ },
    { e: "🧹", i: "trash-2", a: /^(?:Données orphelines|Orphan|Datos huérfanos)/ },
    { e: "🧹", i: "eraser" },
    { e: "📄", i: "file-text" },
    { e: "🧙", i: "wand-sparkles" },
    { e: "🔌", i: "plug" },
    { e: "🎤", i: "mic" },
    { e: "🚪", i: "siren", a: /^(?:Sortie d'urgence|Emergency exit|Salida de emergencia)/ },
    { e: "🔋", i: "battery" },
    { e: "☀️", i: "sun" },
    { e: "📏", i: "ruler" },
    { e: "🕳️", i: "wifi-off", a: /^(?:Ensuite, tout marche|Then,? everything works|After that, everything works|Después, todo funciona|Luego, todo funciona)/ },
    { e: "🕳️", i: "map-pin", a: /^(?:Points en forme|Shaped points|Points as shapes|Points with a shape|Puntos con forma|Puntos en forma)/ },
    { e: "🕳️", i: "arrow-down-to-line" },
    { e: "⌨️", i: "keyboard" },
    { e: "🛠️", i: "drafting-compass" },
    { e: "📝", i: "pencil-line" },
    { e: "⚖️", i: "scale" },
    { e: "🍃", i: "leaf" },
    { e: "🧊", i: "box" },
    { e: "🌍", i: "globe" },
    { e: "📜", i: "scroll-text" },
    { e: "〰️", i: "m-galerie" },
    { e: "🤕", i: "bandage" },
    { e: "🐌", i: "snail" },
    { e: "🐢", i: "snail" },
    { e: "📆", i: "calendar" },
    { e: "⏪", i: "undo-2" },
    { e: "📕", i: "file-text" },
    { e: "📷", i: "camera" },
    { e: "🧗", i: "m-echelle" },
    { e: "💥", i: "circle-x" },
    { e: "🧰", i: "pocket-knife" },
    { e: "🗒️", i: "list" },
    { e: "🫥", i: "blend" },
    { e: "💼", i: "briefcase" },
    { e: "📗", i: "book-open" },
    { e: "🤝", i: "code-xml" },
    { e: "🙏", i: "heart" },
    { e: "🔔", i: "bell" },
    { e: "👋", i: "sparkles" },
    { e: "🎒", i: "lightbulb" },
    { e: "🖐️", i: "hand" },
    { e: "🧘", i: "heart" },
    { e: "🛑", i: "pause" },
    { e: "🎉", i: "flag" },
    { e: "🫧", i: "info" },
    { e: "🔀", i: "m-niveaux" },
    { e: "🔁", i: "repeat" },
    { e: "🔘", i: "toggle-right" },
    { e: "🔑", i: "key-round" },
    { e: "✉️", i: "mail" },
    { e: "🔥", i: "flame" },
    { e: "📌", i: "users", a: /^(?:assigne|assigns|asigna|button assigns)\b/ },
    { e: "📌", i: "link" },
    { e: "✨", i: "sparkles" },
    { e: "🚒", i: "ambulance" },
    { e: "💻", i: "monitor" },
    { e: "🐳", i: "package" },
    { e: "🏠", i: "house" },
    { e: "⏳", i: "timer" },
    { e: "🔧", i: "wrench" },
    { e: "🧨", i: "trash-2" },
    { e: "🎚️", i: "sliders-horizontal" }
  ];

  const GARDE = [
    { e: "⚠️", s: "type de POI Danger (icône du catalogue)", a: /^(?:(?:Type )?(?:Danger|Peligro)|Tipo Peligro|Danger type)\b/ },
    { e: "⚠️", s: "point posé par Je suis perdu (icône Danger du catalogue)",
      b: /(?:pose un point|plac(?:e|es|ing) a point|coloca un punto)$/ },
    { e: "⚠️", s: "point posé par Je suis perdu (icône Danger du catalogue)", b: /plac(?:e|es|ing) an?$/, a: /^point\b/ },
    { e: "▶️", s: "flèches du pavé et Précédent / Suivant : glyphes, comme sur les boutons", b: /(?:◀|Suivant|Next|Siguiente)$/ },
    { e: "◀️", s: "flèches du pavé et Précédent / Suivant : glyphes, comme sur les boutons" },
    { e: "↔️", s: "flèche typographique entre deux termes (N0 ↔ N+1, session ↔ calques)" },
    { e: "©", s: "symbole du droit d'auteur dans l'attribution citée telle quelle" },
    { e: "⛔", s: "type de zone Inaccessible : son repli dans l'interface est ce même emoji" },
    { e: "⬛", s: "pastille du type Remblais, statut Bloqué du Secours (la couleur est l'information)" },
    { e: "🚪", s: "tag POI Point d'entrée du plan (icône du catalogue)" },
    { e: "🟦", s: "pastille de couleur d'un type (la couleur est l'information)" },
    { e: "🟨", s: "pastille de couleur d'un type" },
    { e: "🟩", s: "pastille de couleur d'un type" },
    { e: "🟪", s: "pastille de couleur d'un type" },
    { e: "🟥", s: "pastille de couleur d'un type" },
    { e: "🟧", s: "pastille de couleur d'un type" },
    { e: "🟢", s: "pastille de couleur d'un type ou d'un statut d'étape du Secours (comme dans l'interface)" },
    { e: "🟡", s: "pastille de couleur d'un type ou d'un statut d'étape du Secours" },
    { e: "🟠", s: "pastille de couleur d'un type ou d'un statut d'étape du Secours" },
    { e: "🔵", s: "pastille de couleur d'un type ou d'un statut d'étape du Secours" },
    { e: "🟣", s: "pastille de couleur d'un statut d'étape du Secours" },
    { e: "⚪", s: "pastille de couleur d'un statut d'étape du Secours" },
    { e: "🔴", s: "pastille de couleur d'un statut d'étape du Secours" }
  ];

  const _PAR_EMOJI = {};
  function _base(e) { return String(e).replace(/️/g, ""); }
  const _famille = function (k) {
    return _PAR_EMOJI[k] || (_PAR_EMOJI[k] = { cible: [], defaut: null, autreCible: [], autreDefaut: null,
      repCible: [], repDefaut: null, gardeCible: [], gardeDefaut: null });
  };
  DOC.concat(AUTRE_SENS).forEach(function (r) {
    const p = _famille(_base(r.e));
    const autre = AUTRE_SENS.indexOf(r) >= 0, cible = !!(r.a || r.b);
    if (autre && cible) p.autreCible.push(r);
    else if (autre) p.autreDefaut = r;
    else if (cible) p.cible.push(r);
    else p.defaut = r;
  });
  REPERES.forEach(function (r) {
    const p = _famille(_base(r.e));
    if (r.a || r.b) p.repCible.push(r); else p.repDefaut = r;
  });
  GARDE.forEach(function (r) {
    const p = _famille(_base(r.e));
    if (r.a || r.b) p.gardeCible.push(r); else p.gardeDefaut = r;
  });
  // Tout emoji (pictogramme avec ou sans U+FE0F, teinte, séquence ZWJ, drapeau, touche 1️⃣) : un emoji absent
  // des tables est relevé « non classé » par classerDoc (check-icones-ui le refuse dans la doc).
  const _RE_EMOJI = new RegExp("\\p{Regional_Indicator}{2}|[#*0-9]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}" +
    "(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*", "gu");

  function _nettoyer(s) {
    return s.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/\*\*|`|️/g, "")
      .replace(/\s+/g, " ");
  }
  function _premier(liste, avant, apres) {
    for (let i = 0; i < liste.length; i++) {
      const r = liste[i];
      if ((!r.a || r.a.test(apres)) && (!r.b || r.b.test(avant))) return r;
    }
    return null;
  }
  // Bouton (DOC) ou autre sens (AUTRE_SENS) : le classement d'avant les repères, inchangé.
  function _regle(p, avant, apres) {
    return _premier(p.autreCible, avant, apres) || _premier(p.cible, avant, apres) || p.defaut || p.autreDefaut;
  }

  // → [{ debut, fin, emoji, icone (bouton, DOC), notion (repère, REPERES), garde (raison de l'exception), sens
  // (AUTRE_SENS) }] ; icone, notion et garde nuls = non classé. Les textes hors doc (check-icones-ui § 6) ne
  // lisent que `icone` : une notion ou une exception n'y compte pas.
  function classerDoc(texte) {
    const t = String(texte || ""), res = [];
    _RE_EMOJI.lastIndex = 0;
    let m;
    while ((m = _RE_EMOJI.exec(t)) !== null) {
      const debut = m.index, fin = debut + m[0].length, emoji = _base(m[0]);
      const o = { debut: debut, fin: fin, emoji: emoji, icone: null, notion: null, garde: null, sens: null };
      res.push(o);
      const p = _PAR_EMOJI[emoji];
      if (!p) continue;
      let avant = t.slice(Math.max(0, debut - 160), debut);
      if (avant.indexOf(">") >= 0 && (avant.indexOf("<") < 0 || avant.indexOf(">") < avant.indexOf("<"))) {
        avant = avant.slice(avant.indexOf(">") + 1);
      }
      avant = _nettoyer(avant).replace(/\s+$/, "");
      const apres = _nettoyer(t.slice(fin, fin + 160).replace(/<[^>]*$/, "")).replace(/^\s+/, "");
      const g = _premier(p.gardeCible, avant, apres);
      if (g) { o.garde = g.s; continue; }
      const r = _regle(p, avant, apres);
      if (r && AUTRE_SENS.indexOf(r) < 0) { o.icone = r.i; continue; }
      if (r) o.sens = r.s;
      const n = _premier(p.repCible, avant, apres) || p.repDefaut;
      if (n) o.notion = n.i;
      else if (p.gardeDefaut) o.garde = p.gardeDefaut.s;
    }
    return res;
  }

  // Emoji de la doc → icône du bouton (DOC) ou de la notion (REPERES) ; les exceptions (GARDE) restent en emoji.
  // opts.jeton : marque privée (U+E000 nom U+E001) qui traverse l'échappement du rendu Markdown ; jetonsEnSvg la
  // remplace après coup. Sans jeton : SVG direct (texte déjà HTML, comme les dicos aide.*).
  function substituerDoc(texte, opts) {
    const t = String(texte || "");
    let out = "", pos = 0;
    classerDoc(t).forEach(function (o) {
      const nom = o.icone || o.notion;
      if (!nom) return;
      out += t.slice(pos, o.debut) +
        (opts && opts.jeton ? "" + nom + "" : ktaIcone(nom, { classe: "kta-ico-doc" }));
      pos = o.fin;
    });
    return out + t.slice(pos);
  }
  function jetonsEnSvg(html) {
    return String(html || "").replace(/([a-z0-9-]+)/g, function (_, nom) {
      return ktaIcone(nom, { classe: "kta-ico-doc" });
    });
  }

  const api = {
    SOURCE: SOURCE, TRACES: TRACES, DOC: DOC, AUTRE_SENS: AUTRE_SENS, REPERES: REPERES, GARDE: GARDE,
    noms: function () { return Object.keys(TRACES); },
    existe: existe, icone: ktaIcone, poser: poser,
    classerDoc: classerDoc, substituerDoc: substituerDoc, jetonsEnSvg: jetonsEnSvg
  };

  if (typeof window !== "undefined") {
    window.ktaIcone = ktaIcone;
    window.KtaIcones = api;
    if (typeof document !== "undefined") {
      // Déjà analysé (crédits du splash, au-dessus de ce script) : posé tout de suite ; le reste à DOMContentLoaded.
      poser();
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { poser(); });
    }
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
