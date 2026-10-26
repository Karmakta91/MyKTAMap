/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// bienvenue.js — écran « Bienvenue » d'une instance SANS mot de passe : petite présentation qui défile, entrée directe.
// Chargé à la demande par js/unlockGate.js (avec css/bienvenue.css), seulement quand cet écran s'affiche.
// Expose : window.KtaBienvenue.ouvrir({ surEntree(visite), surFin() }) → { fermer }.
//   surEntree : appelé au clic sur « Entrer » ou « Découvrir l'app en 1 minute » (visite = true), AVANT l'animation :
//   l'appelant mémorise l'accès tout de suite (un rechargement pendant la descente ne remontre pas l'écran).
//   surFin : animation finie, écran retiré.
// Mouvement (galeries pilotées au défilement, tête de suivi, flash des repères) : moteur de la page de présentation,
//   adapté à un écran qui défile en interne (scrollTop / clientHeight de l'overlay, pas de la fenêtre).
// ⚠️ contrat : chemins des galeries en M / V / H absolus dans 44 × 1000 ; seules les ordonnées sont réécrites.
// Mouvement réduit : fil complet, ni tête ni flash, ville immobile, « Entrer » sans descente. Une erreur du moteur
//   rend l'état final. Aucun script inline : écouteurs posés ici (CSP script-src 'self').
// Doc : docs/architecture/security-legal.md (écran d'entrée) · docs/architecture/ui.md

(function() {
  "use strict";

  const DUREE_FLASH = 650;
  // Descente du tracker puis fondu (css/bienvenue.css > kta-bv-descente, kta-bv-voile) ; depuis le bas : fondu seul.
  const DUREE_DESCENTE = 2750;
  const DUREE_FONDU_BAS = 650;

  function t(k, p) { return window.I18n ? window.I18n.t(k, p) : k; }
  function reduit() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // ── Gabarit ─────────────────────────────────────────────────────────────
  const GAL_A = "M22 0 V210 H10 V430 H34 V650 H14 V830 H22 V1000";
  const GAL_B = "M22 0 V220 H34 V400 H12 V600 H30 V810 H22 V1000";
  const BRAS_A = " M10 330 H0 M34 540 H44";
  const BRAS_B = " M34 300 H44 M12 700 H2";

  function _img(nom, taille) {
    return '<img src="icon/' + nom + '" alt="" width="' + taille + '" height="' + taille + '">';
  }

  function _galerie(fil, bras, avecTete, courte) {
    const svg = function(d, couleur, epaisseur) {
      return '<svg viewBox="0 0 44 1000" preserveAspectRatio="none" focusable="false"><path d="' + d +
        '" fill="none" stroke="' + couleur + '" stroke-width="' + epaisseur + '" vector-effect="non-scaling-stroke"/></svg>';
    };
    return '<div class="kta-bv-galerie' + (courte ? " kta-bv-galerie-courte" : "") + '" aria-hidden="true">' +
      svg(fil + bras, "#2a3348", 10) +
      '<div class="kta-bv-fil-sec">' + svg(fil, "#f4c542", 4) + '</div>' +
      (avecTete ? '<img class="kta-bv-tete-sec" src="icon/iconetrack.png" alt="" width="30" height="30">' : "") +
    '</div>';
  }

  function _repere(nom) {
    return '<span class="kta-bv-repere" aria-hidden="true">' + _img(nom, 40) + '</span>';
  }

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
      '<path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>'
  };
  function _picto(nom) {
    return '<svg class="kta-bv-picto" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + PICTOS[nom] + '</svg>';
  }
  function _encart(couleur, picto, cle) {
    return '<p class="kta-bv-encart kta-bv-encart-' + couleur + '">' + _picto(picto) + '<span>' + t(cle) + '</span></p>';
  }
  function _atout(picto, cle, badge) {
    return '<div class="kta-bv-atout"><dt>' + _picto(picto) + t(cle + ".titre") +
      (badge ? ' <span class="kta-bv-badge">' + t(badge) + '</span>' : "") + '</dt>' +
      '<dd>' + t(cle + ".texte") + '</dd></div>';
  }
  function _liste(prefixe, n) {
    let h = '<ul class="kta-bv-liste">';
    for (let i = 1; i <= n; i++) h += '<li>' + t(prefixe + ".l" + i) + '</li>';
    return h + '</ul>';
  }

  const FLECHE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
  function _boutonEntrer() {
    return '<button type="button" class="kta-bv-btn kta-bv-btn-or" data-bv="entrer">' + t("bienvenue.entrer") + FLECHE +
      '</button>';
  }

  // Sélecteur de langue de l'app : libellés = métadonnées de I18n.available(), rien à traduire.
  function _langues() {
    if (!window.I18n || typeof window.I18n.available !== "function") return "";
    const active = (typeof window.I18n.getLang === "function") ? window.I18n.getLang() : "fr";
    return '<div class="kta-bv-langues" role="group" aria-label="' + t("bienvenue.langue") + '">' +
      window.I18n.available().map(function(l) {
        return '<button type="button" class="kta-bv-langue" data-lang="' + l.code + '" title="' + l.label +
          '" aria-pressed="' + (l.code === active ? "true" : "false") + '"><span>' + l.flag + " " +
          l.code.toUpperCase() + '</span></button>';
      }).join("") + '</div>';
  }

  function _pieton(tx, miroir, cls) {
    return '<g transform="translate(' + tx + ' 248)' + (miroir ? " scale(-1 1)" : "") + '"><g class="kta-bv-pieton' +
      (cls ? " " + cls : "") + '"><g transform="scale(1.6)" fill="#3a4560" stroke="#3a4560" stroke-linecap="round">' +
      '<circle cx="0" cy="-27" r="3.6" stroke="none"/><path d="M0 -23 V-11" stroke-width="4.5"/>' +
      '<path class="kta-bv-bras" d="M0 -21 L2 -13" stroke-width="2.5" fill="none"/>' +
      '<path class="kta-bv-jambe" d="M0 -11 L0 0" stroke-width="3" fill="none"/>' +
      '<path class="kta-bv-jambe kta-bv-jambe-2" d="M0 -11 L0 0" stroke-width="3" fill="none"/></g></g></g>';
  }
  function _voiture(tx, miroir, cls) {
    return '<g transform="translate(' + tx + ' 249)' + (miroir ? " scale(-1 1)" : "") + '"><g class="kta-bv-voiture' +
      (cls ? " " + cls : "") + '"><path d="M-12 -12 L-48 -6 V-5 L-12 -5 Z" fill="#f4c542" opacity=".18"/>' +
      '<path d="M-34 -5 V-13 Q-34 -16 -30 -16 H-20 L-12 -24 H12 L20 -16 H30 Q34 -16 34 -12 V-5 Z" fill="#2a3348" ' +
      'stroke="#3a4560" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M-9 -22 H-1 V-16 H-15 Z M2 -22 H10 L16 -16 H2 Z" fill="#151b2c"/>' +
      '<rect x="-35" y="-14" width="4" height="4" rx="1" fill="#f4c542"/>' +
      '<circle cx="-20" cy="-4" r="5" fill="#151b2c" stroke="#3a4560" stroke-width="2"/>' +
      '<circle cx="20" cy="-4" r="5" fill="#151b2c" stroke="#3a4560" stroke-width="2"/></g></g>';
  }
  const CRATERES_SCENE = [[1100.1, -55.3, 10.2], [1133.3, -24.7, 12.8], [1130.8, -60.4, 5.8], [1095, -22.1, 6.4],
    [1146.1, -45.1, 4.5], [1110.3, -37.4, 3.8]];
  const CRATERES_HAUT = [[207.4, 100.7, 12.9], [249.3, 139.3, 16.1], [246.1, 94.2, 7.2], [201, 142.6, 8.1],
    [265.4, 113.6, 5.6], [220.3, 123.2, 4.8]];
  function _crateres(liste) {
    return liste.map(function(c) {
      return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" fill="#d9ccab"/>';
    }).join("");
  }
  function _oiseaux(cls, decal) {
    const d = decal || [0, 0];
    // Oiseau = un chevron : (x, y) → (x + l/2, y + h) → (x + l, y).
    const aile = function(x, y, l, h, c) {
      return '<path class="kta-bv-aile' + (c ? " " + c : "") + '" d="M' + (x + d[0]) + " " + (y + d[1]) + " L" +
        (x + d[0] + l / 2) + " " + (y + d[1] + h) + " L" + (x + d[0] + l) + " " + (y + d[1]) + '"/>';
    };
    return '<g class="' + cls + '" fill="none" stroke="#3a4560" stroke-width="3" stroke-linecap="round" ' +
      'stroke-linejoin="round">' + aile(-9, -4, 18, 7) + aile(14, 10, 14, 5, "kta-bv-aile-2") +
      aile(-24, 14, 14, 5, "kta-bv-aile-3") + '</g>';
  }

  // Immeubles (motif répété et retourné), fenêtres, arbres : un seul bloc de 1200 unités.
  const BLOC =
    '<g fill="#151b2c" stroke="#2a3348" stroke-width="2"><path d="M0 250 h70 v-60 l20 -18 l20 18 v60 h10 Z"/>' +
    '<path d="M120 250 V150 h110 V250 Z"/><path d="M120 150 l15 -22 h80 l15 22 Z"/><path d="M245 250 V185 h80 V250 Z"/>' +
    '<path d="M340 250 V95 l35 -60 l35 60 V250 Z"/><path d="M425 250 V165 h130 V250 Z"/>' +
    '<path d="M425 165 l18 -26 h94 l18 26 Z"/><path d="M570 250 V200 h60 V250 Z"/><path d="M690 250 V140 h120 V250 Z"/>' +
    '<path d="M690 140 l15 -20 h90 l15 20 Z"/><path d="M825 250 V175 h90 V250 Z"/><path d="M930 250 V125 h140 V250 Z"/>' +
    '<path d="M930 125 l20 -26 h100 l20 26 Z"/><path d="M1085 250 V190 h115 V250 Z"/></g>' +
    '<g fill="#2a3348"><rect x="150" y="112" width="10" height="20"/><rect x="200" y="112" width="10" height="20"/>' +
    '<rect x="460" y="122" width="10" height="20"/><rect x="520" y="122" width="10" height="20"/>' +
    '<rect x="720" y="104" width="10" height="18"/><rect x="780" y="104" width="10" height="18"/>' +
    '<rect x="965" y="84" width="10" height="20"/><rect x="1035" y="84" width="10" height="20"/>' +
    '<rect x="372" y="12" width="6" height="24"/></g>' +
    '<g fill="#f4c542">' + [[138, 170, 0.7], [168, 170, 0.35], [198, 200, 0.7], [262, 200, 0.5], [296, 214, 0.7],
      [445, 180, 0.7], [480, 180, 0.35], [515, 212, 0.7], [710, 160, 0.6], [745, 196, 0.7], [780, 160, 0.35],
      [845, 196, 0.7], [880, 196, 0.5], [950, 146, 0.7], [990, 182, 0.35], [1030, 146, 0.7], [1110, 208, 0.6],
      [1150, 208, 0.7]].map(function(f) {
      return '<rect x="' + f[0] + '" y="' + f[1] + '" width="14" height="18" opacity="' + f[2] + '"/>';
    }).join("") + '<rect x="366" y="120" width="12" height="22" opacity=".6"/></g>' +
    '<g fill="#1b3a2e" stroke="#2f5a46" stroke-width="2">' + [[595, 226, 16], [650, 230, 13], [1075, 232, 12],
      [238, 228, 14], [420, 224, 17], [445, 232, 11], [820, 226, 15], [922, 230, 12], [1185, 228, 14]].map(function(a) {
      return '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="' + a[2] + '"/>';
    }).join("") + '</g>' +
    '<g stroke="#2f5a46" stroke-width="3"><path d="M595 242 V250 M650 243 V250 M1075 244 V250 M238 242 V250 ' +
    'M420 241 V250 M445 243 V250 M820 241 V250 M922 242 V250 M1185 242 V250"/></g>';

  // Icônes de l'app posées sur le réseau : puits sans échelon (jps), à échelons (jpe), puits de bouche (pb), maisons.
  const RESEAU = [["jps", -2008, 322], ["jps", -808, 322], ["jps", 192, 322], ["jps", 1392, 322], ["jps", 2592, 322],
    ["jpe", -1758, 332], ["jpe", -1518, 332], ["jpe", -558, 332], ["jpe", -318, 332], ["jpe", 442, 332],
    ["jpe", 682, 332], ["jpe", 1642, 332], ["jpe", 1882, 332], ["jpe", 2842, 332], ["jpe", 3082, 332],
    ["pb", 1042, 292], ["house", -418, 452], ["house", 342, 452], ["house", 2262, 462]];

  function _ville() {
    return '<svg class="kta-bv-ville" viewBox="-2400 -110 6000 630" preserveAspectRatio="xMidYMax slice" ' +
      'aria-hidden="true" focusable="false"><defs>' +
      '<radialGradient id="kta-bv-halo-scene"><stop offset="0.38" stop-color="#efe6cf" stop-opacity=".32"/>' +
      '<stop offset="0.6" stop-color="#efe6cf" stop-opacity=".1"/><stop offset="1" stop-color="#efe6cf" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<pattern id="kta-bv-hach" patternUnits="userSpaceOnUse" x="0" y="252" width="40" height="44">' +
      '<path d="M0 44 L40 0" stroke="#5c5444" stroke-width="2" opacity=".55"/></pattern>' +
      '<g id="kta-bv-bloc">' + BLOC + '</g></defs>' +
      '<g class="kta-bv-lune-scene" transform="translate(-260 0)">' +
      '<circle class="kta-bv-lueur" cx="1118" cy="-40" r="119.6" fill="url(#kta-bv-halo-scene)"/>' +
      '<circle cx="1118" cy="-40" r="46" fill="#efe6cf"/>' + _crateres(CRATERES_SCENE) + '</g>' +
      '<g class="kta-bv-lune-scene" transform="translate(640 -38)">' + _oiseaux("kta-bv-vol") + '</g>' +
      '<use href="#kta-bv-bloc" transform="translate(-2400 0)"/><use href="#kta-bv-bloc" transform="scale(-1 1)"/>' +
      '<use href="#kta-bv-bloc"/><use href="#kta-bv-bloc" transform="translate(2400 0) scale(-1 1)"/>' +
      '<use href="#kta-bv-bloc" transform="translate(2400 0)"/>' +
      _pieton(520, false) + _pieton(-260, false, "kta-bv-pieton-2") + _pieton(1500, true, "kta-bv-pieton-3") +
      _pieton(140, false, "kta-bv-pieton-4") +
      _voiture(900, false) + _voiture(200, true, "kta-bv-voiture-2") + _voiture(2200, false, "kta-bv-voiture-3") +
      '<path d="M-2400 250 H3600" stroke="#5c5444" stroke-width="3"/>' +
      '<rect x="-2400" y="252" width="6000" height="44" fill="#2a2620"/>' +
      '<rect x="-2400" y="252" width="6000" height="44" fill="url(#kta-bv-hach)"/>' +
      '<path fill="none" stroke="#2a3348" stroke-width="12" stroke-linejoin="miter" d="M-2400 340 H-1990 V400 H-1740 ' +
      'V350 H-1500 V430 H-1270 V370 H-1000 V340 H-790 V400 H-540 V350 H-300 V430 H-60 V340 H210 V400 H460 V350 H700 ' +
      'V430 H930 V370 H1200 V340 H1410 V400 H1660 V350 H1900 V430 H2130 V370 H2400 V340 H2610 V400 H2860 V350 H3100 ' +
      'V430 H3330 V370 H3600 M210 400 V470 H360 M460 400 V500 M700 430 V490 H840 M930 430 V480 M1060 370 V310 ' +
      'M-1740 400 V480 M-1270 430 V490 H-1120 M-540 400 V470 H-400 M1660 400 V490 M2130 430 V480 H2280 M2860 400 V470"/>' +
      '<g fill="#3aa9e8" fill-opacity=".7" stroke="#0066aa" stroke-width="3" stroke-linejoin="round">' +
      '<path d="M736 490 Q742 481 776 482 Q818 483 830 488 Q836 494 822 497 Q790 501 758 499 Q732 497 736 490 Z"/>' +
      '<path d="M-1234 490 Q-1228 481 -1194 482 Q-1152 483 -1140 488 Q-1134 494 -1148 497 Q-1180 501 -1212 499 ' +
      'Q-1238 497 -1234 490 Z"/></g>' +
      '<g class="kta-bv-reseau">' + RESEAU.map(function(r) {
        return '<image href="icon/' + r[0] + '.png" x="' + r[1] + '" y="' + r[2] + '" width="36" height="36"/>';
      }).join("") + '</g></svg>';
  }

  function _luneHaut() {
    return '<svg class="kta-bv-lune-haut" viewBox="0 0 340 240" aria-hidden="true" focusable="false"><defs>' +
      '<radialGradient id="kta-bv-halo-haut"><stop offset="0.58" stop-color="#efe6cf" stop-opacity=".3"/>' +
      '<stop offset="0.78" stop-color="#efe6cf" stop-opacity=".1"/><stop offset="1" stop-color="#efe6cf" stop-opacity="0"/>' +
      '</radialGradient></defs>' +
      '<circle class="kta-bv-lueur" cx="230" cy="120" r="96" fill="url(#kta-bv-halo-haut)"/>' +
      '<circle cx="230" cy="120" r="58" fill="#efe6cf"/>' + _crateres(CRATERES_HAUT) +
      _oiseaux("kta-bv-vol-haut", [110, 115]) + '</svg>';
  }

  function _speleos() {
    const speleo = function(cls, faisceau, fCls, tx) {
      return '<g class="kta-bv-speleo' + (cls ? " " + cls : "") + '"><path class="kta-bv-faisceau' +
        (fCls ? " " + fCls : "") + '" d="' + faisceau + '" fill="#f4c542" opacity=".2"/>' +
        '<g fill="#3a4560" stroke="#3a4560" stroke-linecap="round"><circle cx="' + tx + '" cy="' + (tx === 12 ? 10 : 12) +
        '" r="4" stroke="none"/><path d="' + (tx === 12
          ? "M12 14 V27 M12 17 L16 23 M12 17 L8 23 M12 27 L9 38 M12 27 L15 38"
          : "M33 16 V29 M33 19 L37 25 M33 19 L29 25 M33 29 L30 39 M33 29 L36 39") +
        '" stroke-width="3" fill="none"/></g><circle cx="' + (tx + 4) + '" cy="' + (tx === 12 ? 9 : 11) +
        '" r="1.8" fill="#f4c542"/></g>';
    };
    return '<svg class="kta-bv-speleos" viewBox="0 0 64 40" focusable="false">' +
      speleo("", "M16 9 L42 1 L42 17 Z", "", 12) +
      speleo("kta-bv-speleo-2", "M37 11 L62 5 L62 19 Z", "kta-bv-faisceau-2", 33) + '</svg>';
  }

  function _planche() {
    const pose = [["peo", 12, 232], ["danger", 182, 132], ["jes", 242, 92], ["chatiere", 202, 282],
      ["passage", 282, 182], ["plaque", 372, 182], ["eso", 300, 52]];
    const reseau = "M30 250 H140 V150 H260 V70 H390 M140 250 V300 H300 V200 H390 M260 150 V200 H300";
    return '<figure class="kta-bv-illus"><svg viewBox="0 0 420 330" aria-hidden="true" focusable="false">' +
      '<rect x="4" y="4" width="412" height="322" rx="10" fill="#f2ead8" stroke="#5c5444" stroke-width="2"/>' +
      '<path d="M4 110H416M4 220H416M110 4V326M220 4V326M330 4V326" fill="none" stroke="#ddd2b8" stroke-width="1.5"/>' +
      '<path d="' + reseau + '" fill="none" stroke="#2a2620" stroke-width="24" stroke-linejoin="miter" ' +
      'stroke-linecap="square"/>' +
      '<path d="' + reseau + '" fill="none" stroke="#f2ead8" stroke-width="14" stroke-linejoin="miter" ' +
      'stroke-linecap="square"/>' +
      '<path d="M30 250 H140 V150 H260 V70 H390" fill="none" stroke="#c98a00" stroke-width="4" stroke-dasharray="10 8" ' +
      'stroke-linecap="round"/>' +
      '<g transform="translate(372 70) rotate(90)"><path d="M0 0 L-8 -22 A23 23 0 0 1 8 -22 Z" fill="#1a5fd6" ' +
      'fill-opacity=".35"/><circle r="8" fill="#1a5fd6" stroke="#ffffff" stroke-width="3"/></g>' +
      pose.map(function(p) {
        return '<image href="icon/' + p[0] + '.png" x="' + p[1] + '" y="' + p[2] + '" width="36" height="36"/>';
      }).join("") +
      '<text x="18" y="30" fill="#5c5444" font-size="13" font-weight="600" letter-spacing="1">' +
      t("bienvenue.reperer.planche") + '</text></svg>' +
      '<figcaption class="kta-bv-legende">' + t("bienvenue.reperer.legende") + '</figcaption></figure>';
  }

  function _gabarit() {
    return '<div class="kta-bv-page">' +
      '<header class="kta-bv-entete">' +
        '<div class="kta-bv-barre"><p class="kta-bv-logo">MyKTAMap</p>' + _langues() + '</div>' +
        '<div class="kta-bv-hero">' +
          '<p class="kta-bv-surtitre">' + t("bienvenue.surtitre") + '</p>' +
          '<h1 id="kta-bv-titre">' + t("bienvenue.titre") + '</h1>' +
          '<p class="kta-bv-accroche">' + t("bienvenue.accroche") + '</p>' +
          '<div class="kta-bv-actions">' + _boutonEntrer() +
            '<button type="button" class="kta-bv-btn kta-bv-btn-contour" data-bv="decouvrir">' +
              t("bienvenue.decouvrir") + '</button>' +
            // Contacts de l'auteur : au pied de page seulement ; ici, la seule porte vers l'édition pro.
            '<a class="kta-bv-pastille-pro" href="https://pro.myktamap.fr/presentation/" target="_blank" ' +
              'rel="noopener noreferrer">💼 ' + t("home.footer.proLink") + '</a>' +
          '</div>' +
          _luneHaut() +
        '</div>' +
        _ville() +
        '<p class="kta-bv-mention-fictif" aria-hidden="true">' + t("bienvenue.fictif") + '</p>' +
        '<div class="kta-bv-entree" aria-hidden="true">' +
          '<div class="kta-bv-entree-galerie"></div><div class="kta-bv-fil-entree"></div>' +
          '<span class="kta-bv-repere">' + _img("peo.png", 40) + '</span>' +
          '<img class="kta-bv-tete-entree" src="icon/iconetrack.png" alt="" width="30" height="30">' +
          _speleos() +
        '</div>' +
      '</header>' +

      '<section id="kta-bv-plans" class="kta-bv-station" tabindex="-1">' +
        _galerie(GAL_A, BRAS_A, true) + _repere("plaque.png") +
        '<div class="kta-bv-contenu"><div class="kta-bv-texte">' +
          '<h2>' + t("bienvenue.plans.titre") + '</h2>' +
          '<p class="kta-bv-intro">' + t("bienvenue.plans.intro") + '</p>' +
          _liste("bienvenue.plans", 3) +
          _encart("ambre", "info", "bienvenue.plans.encart") +
        '</div></div>' +
      '</section>' +

      '<section class="kta-bv-station">' +
        _galerie(GAL_B, BRAS_B, true) + _repere("chatiere.png") +
        '<div class="kta-bv-contenu kta-bv-contenu-ligne"><div class="kta-bv-texte">' +
          '<h2>' + t("bienvenue.reperer.titre") + '</h2>' +
          '<dl class="kta-bv-atouts">' +
            _atout("boussole", "bienvenue.reperer.suivi") + _atout("chemin", "bienvenue.reperer.iti") +
            _atout("danger", "bienvenue.reperer.urgence") +
            _atout("bouee", "bienvenue.reperer.secours", "bienvenue.reperer.secours.badge") +
          '</dl>' +
        '</div>' + _planche() + '</div>' +
      '</section>' +

      '<section class="kta-bv-station">' +
        _galerie(GAL_A, BRAS_A, true) + _repere("jes.png") +
        '<div class="kta-bv-contenu"><div class="kta-bv-texte">' +
          '<h2>' + t("bienvenue.prive.titre") + '</h2>' +
          '<p class="kta-bv-intro">' + t("bienvenue.prive.intro") + '</p>' +
          _liste("bienvenue.prive", 4) +
          _encart("vert", "bouclier", "bienvenue.prive.encart") +
        '</div></div>' +
      '</section>' +

      '<section class="kta-bv-station">' +
        _galerie(GAL_B, BRAS_B, true) + _repere("passage.png") +
        '<div class="kta-bv-contenu"><div class="kta-bv-texte">' +
          '<h2>' + t("bienvenue.echanges.titre") + '</h2>' +
          '<dl class="kta-bv-atouts">' +
            _atout("exports", "bienvenue.echanges.exports") + _atout("imports", "bienvenue.echanges.imports") +
            _atout("carte", "bienvenue.echanges.osm") + _atout("globe", "bienvenue.echanges.langues") +
          '</dl>' +
          _encart("ambre", "groupe", "bienvenue.echanges.encart") +
        '</div></div>' +
      '</section>' +

      '<section class="kta-bv-station kta-bv-station-sortie">' +
        _galerie("M22 0 V1000", "", false, true) + _repere("cao.png") +
        '<div class="kta-bv-contenu"><div class="kta-bv-sortie">' +
          '<h2>' + t("bienvenue.sortie.titre") + '</h2>' +
          '<p class="kta-bv-intro">' + t("bienvenue.sortie.intro") + '</p>' +
          '<div class="kta-bv-actions">' + _boutonEntrer() +
            '<button type="button" class="kta-bv-btn kta-bv-btn-contour" data-bv="visite">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/>' +
              '<path d="m10 8.5 5 3.5-5 3.5v-7Z"/></svg>' + t("bienvenue.sortie.visite") + '</button>' +
          '</div>' +
        '</div></div>' +
      '</section>' +

      '<footer class="kta-bv-pied"><div class="kta-bv-pied-in">' +
        '<p class="kta-bv-logo">MyKTAMap</p>' +
        // ⚠️ Contacts de l'auteur : écran sans mot de passe seulement (une instance protégée est gérée par
        // quelqu'un d'autre). Liens sortants, sans script.
        '<p class="kta-bv-contacts">' + t("gate.contact") + '</p>' +
        '<p class="kta-bv-pied-note">' + t("bienvenue.pied") + '</p>' +
        // Même coin que le splash : librairies (noms propres, non traduits) et signature.
        '<div class="kta-bv-pied-credits"><p>🍃&nbsp;Leaflet · 📦&nbsp;JSZip · 📤&nbsp;jsPDF<br>' +
          '🌍&nbsp;OSM · 🧭&nbsp;Dijkstra · 📸&nbsp;html2canvas</p>' +
          '<img class="kta-bv-signature" src="icon/karma.png" alt="KARMA" height="20"></div>' +
      '</div></footer>' +
      '<div class="kta-bv-voile" aria-hidden="true"></div>' +
    '</div>';
  }

  // ── Mouvement ───────────────────────────────────────────────────────────
  // Un seul requestAnimationFrame par image. p = (milieu de l'écran − haut de la galerie) / H, borné 0…1 : le fil
  // doré est dessiné sur p × L, la tête posée par getPointAtLength et orientée selon le segment, le repère passe
  // « atteint » une fois dépassé (flash à la descente, aucun en remontant). Calculs pour les stations visibles ; une
  // station quittée est recalée une fois à son bout.
  function _mouvement(ecranEl) {
    let actif = false, image = 0, observateur = null, redim = null;
    const galeries = [], visibles = [];
    let filEntree = null, pEntree = -1;

    function defile() { return ecranEl.scrollTop; }
    function hauteurEcran() { return ecranEl.clientHeight; }
    function borner(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function chaque(liste, fn) { Array.prototype.forEach.call(liste, fn); }

    function flasher(rep) {
      rep.classList.remove("kta-bv-flash");
      void rep.offsetWidth;
      rep.classList.add("kta-bv-flash");
      clearTimeout(rep._ktaFlash);
      rep._ktaFlash = setTimeout(function() { rep.classList.remove("kta-bv-flash"); }, DUREE_FLASH);
    }
    function marquer(rep, atteint, avecFlash) {
      if (!rep || rep.classList.contains("kta-bv-atteint") === atteint) return;
      rep.classList.toggle("kta-bv-atteint", atteint);
      if (atteint && avecFlash) flasher(rep);
      if (!atteint) rep.classList.remove("kta-bv-flash");
    }

    function jetons(d) { return d.match(/[MVH]|-?\d+(?:\.\d+)?/g) || []; }
    function reecrire(d, k) {
      const tk = jetons(d), out = [];
      let i = 0;
      while (i < tk.length) {
        const c = tk[i++];
        if (c === "M") { out.push("M" + tk[i] + " " + (+tk[i + 1] * k)); i += 2; }
        else if (c === "V") { out.push("V" + (+tk[i] * k)); i += 1; }
        else if (c === "H") { out.push("H" + tk[i]); i += 1; }
      }
      return out.join(" ");
    }
    // Longueur du premier tracé jusqu'à l'ordonnée y (centre du repère) ; Infinity s'il ne l'atteint pas.
    function longueurJusqua(d, k, y) {
      const tk = jetons(d);
      let i = 0, x0 = 0, y0 = 0, l = 0, deja = false;
      while (i < tk.length) {
        const c = tk[i++];
        if (c === "M") {
          if (deja) break;
          deja = true; x0 = +tk[i]; y0 = +tk[i + 1] * k; i += 2;
          if (y0 >= y) return 0;
        } else if (c === "V") {
          const y1 = +tk[i++] * k;
          if (y1 >= y && y0 < y) return l + (y - y0);
          l += Math.abs(y1 - y0); y0 = y1;
        } else if (c === "H") {
          const x1 = +tk[i++];
          l += Math.abs(x1 - x0); x0 = x1;
        }
      }
      return Infinity;
    }

    function preparer(gal) {
      const svgs = gal.querySelectorAll("svg");
      const fond = svgs[0] ? svgs[0].querySelector("path") : null;
      const fil = gal.querySelector(".kta-bv-fil-sec path");
      if (!fond || !fil) return null;
      const station = gal.closest("section");
      return { gal: gal, station: station, svgs: svgs, chemins: [fond, fil],
        d0: [fond.getAttribute("d"), fil.getAttribute("d")], vb0: svgs[0].getAttribute("viewBox"), fil: fil,
        tete: gal.querySelector(".kta-bv-tete-sec"), repere: station ? station.querySelector(".kta-bv-repere") : null,
        haut: 0, H: 0, L: 0, lRepere: Infinity, p: -1, x: null, y: null, angle: null };
    }

    function mesurerGalerie(g) {
      const r = g.gal.getBoundingClientRect(), base = ecranEl.getBoundingClientRect().top;
      g.haut = r.top - base + defile();
      const H = Math.round(r.height);
      if (H !== g.H && H > 0) {
        g.H = H;
        chaque(g.svgs, function(s) { s.setAttribute("viewBox", "0 0 44 " + H); });
        g.chemins.forEach(function(c, i) {
          c.setAttribute("d", reecrire(g.d0[i], H / 1000));
          c.removeAttribute("vector-effect");
        });
        g.L = g.fil.getTotalLength();
        g.gal.style.setProperty("--fil-long", g.L + "px");
      }
      if (g.repere) {
        const rr = g.repere.getBoundingClientRect();
        g.lRepere = longueurJusqua(g.d0[1], g.H / 1000, rr.top + rr.height / 2 - r.top);
      }
      g.p = -1;
    }

    function rendreGalerie(g) {
      chaque(g.svgs, function(s) { s.setAttribute("viewBox", g.vb0); });
      g.chemins.forEach(function(c, i) {
        c.setAttribute("d", g.d0[i]);
        c.setAttribute("vector-effect", "non-scaling-stroke");
      });
    }

    // Angle de l'icône (pointe vers le haut au repos) : 180 = bas, 90 = droite, 270 = gauche.
    function angleEn(g, l) {
      let a = l, b = l + 0.5;
      if (b > g.L) { a = g.L - 0.5; b = g.L; }
      const p1 = g.fil.getPointAtLength(Math.max(0, a)), p2 = g.fil.getPointAtLength(b);
      const deg = Math.atan2(p2.x - p1.x, -(p2.y - p1.y)) * 180 / Math.PI;
      return Math.round((deg + 360) % 360);
    }

    // 🩸 Bas de page atteint : le dernier repère peut rester sous le milieu de l'écran, faute de quoi défiler.
    function enBas() { return defile() + hauteurEcran() >= ecranEl.scrollHeight - 2; }

    function placerGalerie(g, avecFlash) {
      const p = enBas() ? 1 : borner((hauteurEcran() / 2 - (g.haut - defile())) / (g.H || 1));
      if (p === g.p) return;
      g.p = p;
      const l = p * g.L;
      g.gal.style.setProperty("--fil-reste", (g.L - l) + "px");
      marquer(g.repere, l >= g.lRepere - 0.5, avecFlash);
      if (!g.tete) return;
      const enCours = p > 0 && p < 1;
      g.tete.classList.toggle("kta-bv-en-cours", enCours);
      if (!enCours) return;
      const pt = g.fil.getPointAtLength(l), angle = angleEn(g, l);
      const x = Math.round(pt.x * 10) / 10, y = Math.round(pt.y * 10) / 10;
      if (x !== g.x) { g.tete.style.setProperty("--x", x + "px"); g.x = x; }
      if (y !== g.y) { g.tete.style.setProperty("--y", y + "px"); g.y = y; }
      if (angle !== g.angle) { g.tete.style.setProperty("--angle", angle + "deg"); g.angle = angle; }
    }

    // Entrée (rue → première station) : vide à l'arrivée, elle se dore au défilement et se termine quand la première
    // galerie commence (son haut au milieu de l'écran) : un seul tracé continu.
    function placerEntree() {
      if (!filEntree) filEntree = ecranEl.querySelector(".kta-bv-fil-entree");
      if (!filEntree || !galeries.length) return;
      const fin = galeries[0].haut - hauteurEcran() / 2;
      const p = fin > 0 ? borner(defile() / fin) : 1;
      if (p !== pEntree) { pEntree = p; filEntree.style.setProperty("--entree", p); }
    }

    function recalerGalerie(g) {
      const bout = (g.haut - defile()) < hauteurEcran() / 2 ? 1 : 0;
      if (g.p !== bout) placerGalerie(g, false);
    }

    function mesurer() {
      if (!actif) return;
      galeries.forEach(mesurerGalerie);
      galeries.forEach(function(g) { placerGalerie(g, false); });
      placerEntree();
    }

    function cadre() {
      image = 0;
      if (!actif) return;
      galeries.forEach(function(g) {
        if (visibles.indexOf(g.station) !== -1) placerGalerie(g, true);
        else recalerGalerie(g);
      });
      placerEntree();
    }
    function demander() { if (actif && !image) image = window.requestAnimationFrame(cadre); }
    function relayout() { if (actif) window.requestAnimationFrame(mesurer); }

    function arreter() {
      actif = false;
      if (observateur) observateur.disconnect();
      if (redim) redim.disconnect();
      if (image) window.cancelAnimationFrame(image);
      image = 0;
      ecranEl.removeEventListener("scroll", demander);
      window.removeEventListener("resize", relayout);
    }
    // Retour à l'état final statique (erreur, mouvement réduit en cours de route).
    function etatFinal() {
      arreter();
      galeries.forEach(rendreGalerie);
      chaque(ecranEl.querySelectorAll(".kta-bv-repere"), function(r) { r.classList.remove("kta-bv-atteint", "kta-bv-flash"); });
      ecranEl.classList.remove("kta-bv-js-fil");
    }

    function degager() {
      const entree = ecranEl.querySelector(".kta-bv-entree");
      if (!entree) return;
      const e = entree.getBoundingClientRect(), marge = 6;
      chaque(ecranEl.querySelectorAll(".kta-bv-reseau image"), function(img) {
        img.classList.remove("kta-bv-masque");
        const r = img.getBoundingClientRect();
        img.classList.toggle("kta-bv-masque", r.left < e.right + marge && e.left - marge < r.right &&
          r.top < e.bottom + marge && e.top - marge < r.bottom);
      });
    }

    function demarrer() {
      // Icônes du réseau sous le puits d'entrée masquées (scène rognée selon la largeur) : aussi en mouvement réduit.
      degager();
      window.addEventListener("resize", degager);
      if (reduit() || !("IntersectionObserver" in window) || !window.requestAnimationFrame) return;
      try {
        ecranEl.classList.add("kta-bv-js-fil");
        chaque(ecranEl.querySelectorAll(".kta-bv-galerie"), function(gal) {
          const g = preparer(gal);
          if (g) galeries.push(g);
        });
        actif = true;
        mesurer();
        // Le puits : point de départ, atteint d'office.
        marquer(ecranEl.querySelector(".kta-bv-entree .kta-bv-repere"), true, false);
        observateur = new IntersectionObserver(function(entrees) {
          entrees.forEach(function(en) {
            const i = visibles.indexOf(en.target);
            if (en.isIntersecting && i === -1) visibles.push(en.target);
            if (!en.isIntersecting && i !== -1) {
              visibles.splice(i, 1);
              galeries.forEach(function(g) { if (g.station === en.target) placerGalerie(g, false); });
            }
          });
          demander();
        }, { root: ecranEl });
        galeries.forEach(function(g) { if (g.station) observateur.observe(g.station); });
        ecranEl.addEventListener("scroll", demander, { passive: true });
        window.addEventListener("resize", relayout);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
        if ("ResizeObserver" in window) {
          redim = new ResizeObserver(relayout);
          redim.observe(ecranEl.firstElementChild || ecranEl);
        }
      } catch (err) {
        etatFinal();
        console.warn("[Bienvenue] mouvement désactivé :", err);
      }
    }

    demarrer();
    return {
      arreter: function() { arreter(); window.removeEventListener("resize", degager); },
      etatFinal: etatFinal
    };
  }

  // ── Écran ───────────────────────────────────────────────────────────────
  function ouvrir(opts) {
    opts = opts || {};
    const ecranEl = document.createElement("div");
    ecranEl.id = "kta-unlock-overlay";
    ecranEl.className = "kta-bv";
    ecranEl.setAttribute("role", "dialog");
    ecranEl.setAttribute("aria-modal", "true");
    ecranEl.setAttribute("aria-labelledby", "kta-bv-titre");
    ecranEl.tabIndex = -1;
    let mvt = null, sortie = false, minuteur = null;
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const surReduit = function() { if (mq.matches && mvt) mvt.etatFinal(); };

    function dessiner() {
      if (mvt) mvt.arreter();
      ecranEl.innerHTML = _gabarit();
      ecranEl.scrollTop = 0;
      mvt = _mouvement(ecranEl);
      // Focus sur l'écran lui-même (dialogue) : le clavier part de là (Tab → « Entrer », flèches → défilement),
      // sans anneau de focus imposé sur un bouton au toucher.
      setTimeout(function() { try { ecranEl.focus({ preventScroll: true }); } catch (e) { ecranEl.focus(); } }, 100);
    }

    function fermer() {
      clearTimeout(minuteur);
      if (mvt) mvt.arreter();
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener("change", surReduit);
        else if (mq.removeListener) mq.removeListener(surReduit);
      }
      if (ecranEl.parentNode) ecranEl.parentNode.removeChild(ecranEl);
    }

    function entrer(visite) {
      if (sortie) return;
      sortie = true;
      ecranEl.querySelectorAll("button").forEach(function(b) { b.disabled = true; });
      try { if (typeof opts.surEntree === "function") opts.surEntree(!!visite); }
      catch (e) { console.warn("[Bienvenue] surEntree :", e); }
      const finir = function() {
        fermer();
        if (typeof opts.surFin === "function") opts.surFin();
      };
      if (reduit()) { finir(); return; }
      // Puits à l'écran : le tracker y descend ; sinon (« Entrer » du bas) fondu seul.
      const entree = ecranEl.querySelector(".kta-bv-entree");
      const r = entree ? entree.getBoundingClientRect() : null;
      const puitsVisible = !!(r && r.bottom > 0 && r.top < ecranEl.clientHeight);
      ecranEl.classList.add(puitsVisible ? "kta-bv-descend" : "kta-bv-descend-bas");
      minuteur = setTimeout(finir, puitsVisible ? DUREE_DESCENTE : DUREE_FONDU_BAS);
    }

    // Délégation : le contenu est redessiné au changement de langue.
    ecranEl.addEventListener("click", function(ev) {
      const cible = ev.target.closest ? ev.target.closest("[data-bv], [data-lang]") : null;
      if (!cible || !ecranEl.contains(cible) || sortie) return;
      if (cible.hasAttribute("data-lang")) {
        const code = cible.getAttribute("data-lang");
        if (!window.I18n || typeof window.I18n.setLang !== "function") return;
        window.I18n.setLang(code).then(dessiner).catch(function(e) { console.warn("[Bienvenue] setLang :", e); });
        return;
      }
      const action = cible.getAttribute("data-bv");
      if (action === "entrer") entrer(false);
      else if (action === "visite") entrer(true);
      else if (action === "decouvrir") {
        const cibleSection = ecranEl.querySelector("#kta-bv-plans");
        if (!cibleSection) return;
        const haut = cibleSection.getBoundingClientRect().top - ecranEl.getBoundingClientRect().top + ecranEl.scrollTop;
        try { ecranEl.scrollTo({ top: haut, behavior: reduit() ? "auto" : "smooth" }); }
        catch (e) { ecranEl.scrollTop = haut; }
        try { cibleSection.focus({ preventScroll: true }); } catch (e) { /* focus sans option */ }
      }
    });

    document.body.appendChild(ecranEl);
    dessiner();
    if (mq) {
      if (mq.addEventListener) mq.addEventListener("change", surReduit);
      else if (mq.addListener) mq.addListener(surReduit);
    }
    return { fermer: fermer };
  }

  window.KtaBienvenue = { ouvrir: ouvrir };
})();
