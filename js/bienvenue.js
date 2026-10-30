/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// bienvenue.js — écran « Bienvenue » : petite présentation qui défile, puis l'entrée dans l'app.
// Chargé à la demande par js/unlockGate.js (avec css/bienvenue.css), seulement quand cet écran s'affiche.
// Expose : window.KtaBienvenue.ouvrir({ surEntree(visite), surFin(), surDoc(), code? }) → { fermer }.
//   surDoc : « Lire la documentation » du pied (documentation intégrée, au-dessus de l'écran).
//   avantEntree : facultatif, () → Promise, attendu au clic sur « Entrer » (ou après un code juste) AVANT surEntree et
//   la descente : conditions d'utilisation montrées à qui entre, jamais à qui ne fait que passer. Résolue à false
//   (conditions refusées) : pas d'entrée, l'écran reste ouvert et se réactive.
//   surEntree : appelé à l'entrée (« Entrer », ou « Découvrir l'app en 1 minute » : visite = true), AVANT l'animation :
//   l'appelant mémorise l'accès tout de suite (un rechargement pendant la descente ne remontre pas l'écran).
//   surFin : animation finie, écran retiré.
//   code { essayer(valeur) → Promise<{ etat, reste?, err? }>, etat() → { verrou, attente, restants } } : instance
//   protégée. L'en-tête porte le champ « Code d'accès » ; on lit tout sans code, mais seul un essai « ok » fait entrer
//   (les autres « Entrer » remontent au champ). Verrou : champ désactivé, compte à rebours dans sa zone, écran ouvert.
//   🔒 Ni contacts de l'auteur ni pastille pro sur cet écran : le code se demande à qui gère l'installation.
//   villeSeule { titre, description } (KtaExtensions.ecranAccueil, gate déléguée) : la ville seule, sans stations ni
//   défilement ni visite, un bouton « Me connecter » qui n'entre PAS : il résout contrôleur.attendreEntree() et rend
//   l'écran inerte ; l'appelant ouvre sa fenêtre par-dessus (écran sous ses fenêtres, z 99995) et ferme l'écran.
//   Textes { code: texte } déjà normalisés, choisis au rendu (langue, puis fr, puis le premier), posés en textContent.
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
  // Mouvement réduit : les animations SVG déclaratives des planches (tracker qui parcourt l'itinéraire) s'arrêtent,
  // le tracker posé au bout de son chemin. Les animations CSS, elles, sont coupées par css/bienvenue.css.
  function _figerPlanches(racine) {
    if (!reduit()) return;
    racine.querySelectorAll(".kta-bv-illus svg").forEach(function(svg) {
      try { svg.pauseAnimations(); svg.setCurrentTime(8.95); } catch (e) { /* SVG sans animation déclarative */ }
    });
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
    session: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'
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
  // Montagnes au loin (deux plans, neiges éternelles) : motif de 1200 unités raccordé bord à bord, répété.
  const MONTAGNES =
    '<path d="M0 250 L0 120 L90 70 L170 105 L260 40 L360 95 L450 60 L560 110 L650 50 L760 100 L860 70 L960 115 L1060 ' +
    '55 L1200 120 L1200 250 Z" fill="#1c2338"/><path d="M0 250 L0 165 L120 130 L230 160 L330 120 L470 170 L600 135 L7' +
    '20 165 L840 128 L980 168 L1100 140 L1200 165 L1200 250 Z" fill="#161c2d"/><path d="M90 70 L138 91 L124 82 L109 9' +
    '2 L95 82 L81 92 L66 82 L52 91 Z M260 40 L320 73 L302 58 L285 75 L267 58 L250 75 L232 58 L214 73 Z M450 60 L496 8' +
    '1 L480 72 L463 82 L446 72 L429 82 L413 72 L396 81 Z M650 50 L716 80 L698 66 L679 82 L660 66 L642 82 L624 66 L605' +
    ' 80 Z M860 70 L900 88 L883 80 L867 89 L850 80 L833 89 L817 80 L800 88 Z M1060 55 L1133 89 L1112 74 L1090 91 L106' +
    '8 74 L1047 91 L1025 74 L1003 89 Z" fill="#8e98b5" opacity=".85"/><path d="M330 120 L375 136 L361 129 L347 137 L3' +
    '32 129 L318 137 L304 129 L290 136 Z M840 128 L896 144 L878 137 L860 145 L842 137 L824 145 L806 137 L788 144 Z" f' +
    'ill="#6b7592" opacity=".8"/>';
  // Un seul chevalement de mine, derrière les immeubles du bloc central (entier au téléphone, hors de la lune) :
  // dessiné en x = 500, agrandi de 25 % autour de ce pied ; acier teinté de rouille, quelques coulures. Balise rouge
  // sous la molette (clignote : css/bienvenue.css > .kta-bv-balise).
  const CHEVALEMENT =
    '<g transform="translate(-125 -62.5) scale(1.25)">' +
    '<g fill="none" stroke="#4e4552" stroke-linecap="square"><path d="M470 250 L486 40 M530 250 L514 40 M514 40 L61' +
    '5 250" stroke-width="5"/><path d="M473.4 205 H526.6 M476.9 160 H523.1 M480.3 115 H519.7 M483.3 75 H516.7 M486.' +
    '0 40 H514.0 M470.0 250 L526.6 205 M530.0 250 L473.4 205 M473.4 205 L523.1 160 M526.6 205 L476.9 160 M476.9 160' +
    ' L519.7 115 M523.1 160 L480.3 115 M480.3 115 L516.7 75 M519.7 115 L483.3 75 M483.3 75 L514.0 40 M516.7 75 L486' +
    '.0 40 M516.7 75 L547.7 110 M519.7 115 L571.7 160 M523.1 160 L593.4 205" stroke-width="2.5"/><path d="M476 40 H' +
    '526 M476 32 H526 M476 32 V40 M526 32 V40 M488 32 V40 M514 32 V40" stroke-width="3"/><path d="M478 24 H524 M478' +
    ' 24 V32 M501 24 V32 M524 24 V32" stroke-width="1.5"/></g><circle cx="500" cy="14" r="20" fill="#1a1719" stroke' +
    '="#675a5c" stroke-width="3.5"/><circle cx="500" cy="14" r="15" fill="none" stroke="#675a5c" stroke-width="1"/>' +
    '<path d="M505.0 14.0 L517.0 14.0 M503.5 17.5 L512.0 26.0 M500.0 19.0 L500.0 31.0 M496.5 17.5 L488.0 26.0 M495.' +
    '0 14.0 L483.0 14.0 M496.5 10.5 L488.0 2.0 M500.0 9.0 L500.0 -3.0 M503.5 10.5 L512.0 2.0" stroke="#675a5c" stro' +
    'ke-width="2"/><circle cx="500" cy="14" r="3.5" fill="#675a5c"/><path d="M500 14 V40 M496 22 L504 32" stroke="#' +
    '4e4552" stroke-width="2.5"/><path d="M520 14 L700 150 M518 22 L700 160" stroke="#675a5c" stroke-width="1.3" op' +
    'acity=".8"/>' +
    '<path d="M476 120 l-2 22 M480 70 l-1 14 M519 95 l1 18 M524 170 l1 20 M550 140 l2 14 M473 210 l-1 16" ' +
    'stroke="#a8653a" stroke-width="2" stroke-linecap="round" opacity=".35"/>' +
    '<path d="M486 30 h6 v4 h-6 Z M508 34 h5 v4 h-5 Z" fill="#5a3a2c" opacity=".7"/></g>' +
    '<circle class="kta-bv-balise" cx="500" cy="-12" r="6" fill="#ff5a4a" opacity=".25"/>' +
    '<circle class="kta-bv-balise" cx="500" cy="-12" r="3" fill="#ff5a4a"/>';
  // Ciel : transparent en haut (se fond dans l'en-tête, aucune démarcation, même quand le dessin déborde au
  // téléphone), étoiles qui s'effacent vers le haut ; second rang d'immeubles et brume entre montagnes et rue.
  function _ciel() {
    let graine = 7;
    const alea = function() { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
    let etoiles = "";
    for (let k = 0; k < 380; k++) {
      const x = Math.round(-2400 + alea() * 6000), y = Math.round(-185 + alea() * 300), r = alea() < 0.15 ? 1.8 : 1;
      const bord = Math.max(0, Math.min(1, (y + 110) / 90));
      etoiles += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" opacity="' +
        ((0.25 + alea() * 0.55) * bord).toFixed(2) + '"/>';
    }
    return '<rect x="-2400" y="-190" width="6000" height="442" fill="url(#kta-bv-ciel)"/>' +
      '<g fill="#e8eaf0">' + etoiles + '</g>';
  }
  const ARRIERE = '<g opacity=".55">' + [-2700, -1500, -300, 900, 2100, 3300].map(function(x) {
    return '<use href="#kta-bv-bloc" transform="translate(' + x + ' 40) scale(.85)"/>';
  }).join("") + '</g><rect x="-2400" y="120" width="6000" height="132" fill="url(#kta-bv-brume)"/>';

  // Un lampadaire (pied en x = 0) : halo chaud sous la lanterne, sans animation.
  const LAMPADAIRE =
    '<circle cx="13" cy="193" r="30" fill="url(#kta-bv-lampe)"/><path d="M0 250 V184 Q0 176 8 176 H13" fill="none" st' +
    'roke="#3a4560" stroke-width="3"/><path d="M-4 250 H4" stroke="#3a4560" stroke-width="4"/><path d="M7 176 H19 L16' +
    ' 183 H10 Z" fill="#3a4560"/><path d="M10 183 H16 L15 186 H11 Z" fill="#ffd98a"/>';
  // Trois par bloc, un élément chacun (retournés avec les blocs en miroir) : celui qui tombe au-dessus des spéléos
  // du puits est masqué selon le cadrage (_mouvement > degager).
  const LAMPES =
    '<use href="#kta-bv-lampadaire" class="kta-bv-lampe" transform="translate(-2225 0)"/><use href="#kta-bv-lampadair' +
    'e" class="kta-bv-lampe" transform="translate(-1760 0)"/><use href="#kta-bv-lampadaire" class="kta-bv-lampe" tran' +
    'sform="translate(-1390 0)"/><use href="#kta-bv-lampadaire" class="kta-bv-lampe" transform="translate(-175 0) sca' +
    'le(-1 1)"/><use href="#kta-bv-lampadaire" class="kta-bv-lampe" transform="translate(-640 0) scale(-1 1)"/><use h' +
    'ref="#kta-bv-lampadaire" class="kta-bv-lampe" transform="translate(-1010 0) scale(-1 1)"/><use href="#kta-bv-lam' +
    'padaire" class="kta-bv-lampe" transform="translate(175 0)"/><use href="#kta-bv-lampadaire" class="kta-bv-lampe" ' +
    'transform="translate(640 0)"/><use href="#kta-bv-lampadaire" class="kta-bv-lampe" transform="translate(1010 0)"/' +
    '><use href="#kta-bv-lampadaire" class="kta-bv-lampe" transform="translate(2225 0) scale(-1 1)"/><use href="#kta-' +
    'bv-lampadaire" class="kta-bv-lampe" transform="translate(1760 0) scale(-1 1)"/><use href="#kta-bv-lampadaire" cl' +
    'ass="kta-bv-lampe" transform="translate(1390 0) scale(-1 1)"/><use href="#kta-bv-lampadaire" class="kta-bv-lampe' +
    '" transform="translate(2575 0)"/><use href="#kta-bv-lampadaire" class="kta-bv-lampe" transform="translate(3040 0' +
    ')"/><use href="#kta-bv-lampadaire" class="kta-bv-lampe" transform="translate(3410 0)"/>';

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
      '<radialGradient id="kta-bv-lampe"><stop offset="0" stop-color="#ffd98a" stop-opacity=".45"/>' +
      '<stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="kta-bv-ciel" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#141b30" stop-opacity="0"/><stop offset=".2" stop-color="#141b30" stop-opacity="0"/>' +
      '<stop offset=".45" stop-color="#141b30" stop-opacity=".35"/>' +
      '<stop offset=".7" stop-color="#18203a" stop-opacity=".8"/><stop offset="1" stop-color="#1f2740"/></linearGradient>' +
      '<linearGradient id="kta-bv-brume" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8e98b5" stop-opacity="0"/><stop offset=".6" stop-color="#8e98b5" stop-opacity=".16"/>' +
      '<stop offset="1" stop-color="#8e98b5" stop-opacity=".05"/></linearGradient>' +
      '<g id="kta-bv-bloc">' + BLOC + '</g><g id="kta-bv-lampadaire">' + LAMPADAIRE + '</g></defs>' +
      _ciel() +
      '<g class="kta-bv-lune-scene" transform="translate(-260 0)">' +
      '<circle class="kta-bv-lueur" cx="1118" cy="-40" r="119.6" fill="url(#kta-bv-halo-scene)"/>' +
      '<circle cx="1118" cy="-40" r="46" fill="#efe6cf"/>' + _crateres(CRATERES_SCENE) + '</g>' +
      '<g class="kta-bv-lune-scene" transform="translate(640 -38)">' + _oiseaux("kta-bv-vol") + '</g>' +
      // Montagnes à mi-hauteur, posées sur la même ligne : un pays minier, pas la haute montagne.
      '<g transform="translate(0 125) scale(1 .5)"><g id="kta-bv-montagnes">' + MONTAGNES + '</g>' +
      '<use href="#kta-bv-montagnes" transform="translate(-2400 0)"/><use href="#kta-bv-montagnes" transform="translate(-1200 0)"/>' +
      '<use href="#kta-bv-montagnes" transform="translate(1200 0)"/><use href="#kta-bv-montagnes" transform="translate(2400 0)"/>' +
      '</g>' + ARRIERE + CHEVALEMENT +
      '<use href="#kta-bv-bloc" transform="translate(-2400 0)"/><use href="#kta-bv-bloc" transform="scale(-1 1)"/>' +
      '<use href="#kta-bv-bloc"/><use href="#kta-bv-bloc" transform="translate(2400 0) scale(-1 1)"/>' +
      '<use href="#kta-bv-bloc" transform="translate(2400 0)"/>' +
      '<g class="kta-bv-lampes">' + LAMPES + '</g>' +
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

  // Fond commun des planches fictives : papier, quadrillage, galeries, et structures de carrière telles que l'app
  // les dessine (styleResolver.js > CANON.structures) — piliers tournés jaunes à contour noir, fronts de taille en
  // trait épais (jaune 1re masse, orange 2e masse). Les annotations posées dessus reprennent aussi ses styles.
  function _fondPlanche(reseau, piliers, fronts) {
    return '<rect x="4" y="4" width="412" height="322" rx="10" fill="#f2ead8" stroke="#5c5444" stroke-width="2"/>' +
      '<path d="M4 110H416M4 220H416M110 4V326M220 4V326M330 4V326" fill="none" stroke="#ddd2b8" stroke-width="1.5"/>' +
      '<path d="' + piliers + '" fill="#f4c542" fill-opacity=".85" stroke="#000000" stroke-width="3" ' +
      'stroke-linejoin="round"/>' +
      '<path d="' + reseau + '" fill="none" stroke="#2a2620" stroke-width="24" stroke-linejoin="miter" ' +
      'stroke-linecap="square"/>' +
      '<path d="' + reseau + '" fill="none" stroke="#f2ead8" stroke-width="14" stroke-linejoin="miter" ' +
      'stroke-linecap="square"/>' +
      fronts.map(function(f) {
        return '<path d="' + f[0] + '" stroke="' + f[1] + '" stroke-width="10" stroke-linecap="butt"/>';
      }).join("");
  }

  function _planche() {
    const pose = [["peo", 12, 232], ["danger", 182, 132], ["jes", 242, 92], ["chatiere", 202, 282],
      ["passage", 282, 182], ["plaque", 372, 182], ["eso", 300, 52]];
    const reseau = "M30 250 H140 V150 H260 V70 H390 M140 250 V300 H300 V200 H390 M260 150 V200 H300";
    return '<figure class="kta-bv-illus"><svg viewBox="0 0 420 330" aria-hidden="true" focusable="false">' +
      _fondPlanche(reseau, "M152 162 H248 V212 H288 V288 H152 Z",
        [["M407 56 V84", "#f4c542"], ["M407 186 V214", "#ff9933"]]) +
      // Itinéraire au style de l'app (CANON.traces.itinerary : cyan, tirets).
      '<path d="M30 250 H140 V150 H260 V70 H390" fill="none" stroke="#00d4ff" stroke-width="6" stroke-dasharray="12 6" ' +
      'stroke-opacity=".9"/>' +
      // Position suivie : l'icône du tracker de l'app (pointe vers le haut au repos) parcourt l'itinéraire, tournée
      // dans le sens de marche (animateMotion : SVG déclaratif, aucun script ; figé en mouvement réduit par
      // _figerPlanches).
      '<g class="kta-bv-suivi"><animateMotion dur="9s" repeatCount="indefinite" rotate="auto" ' +
      'path="M30 250 H140 V150 H260 V70 H390"/>' +
      '<image href="icon/iconetrack.png" x="-18" y="-18" width="36" height="36" transform="rotate(90)"/></g>' +
      pose.map(function(p) {
        return '<image href="icon/' + p[0] + '.png" x="' + p[1] + '" y="' + p[2] + '" width="36" height="36"/>';
      }).join("") +
      '<text x="18" y="30" fill="#5c5444" font-size="13" font-weight="600" letter-spacing="1">' +
      t("bienvenue.reperer.planche") + '</text></svg>' +
      '<figcaption class="kta-bv-legende">' + t("bienvenue.reperer.legende") + '</figcaption></figure>';
  }

  // Planche fictive de la station « Annoter » : carrière à piliers tournés et fronts de taille, un tracé principal
  // qui se dessine (css/bienvenue.css > .kta-bv-trace-anim), une zone inaccessible, des points posés — aux styles
  // de l'app (tracé principal vert, zone inaccessible hachurée comme index.html > #kta-pattern-inaccessible).
  function _plancheAnnoter() {
    const reseau = "M30 260 H160 V120 H300 V60 H390 V180 M160 260 V300 H400 M330 300 V180 H390 M230 120 V300";
    // Icônes centrées sur leur point, comme les marqueurs de la carte (ancre au centre), toutes sur une galerie.
    const pose = [["jes", 330, 42], ["danger", 342, 282], ["pa", 90, 242], ["passage", 182, 102]];
    return '<figure class="kta-bv-illus"><svg viewBox="0 0 420 330" aria-hidden="true" focusable="false">' +
      '<defs><pattern id="kta-bv-inaccessible" patternUnits="userSpaceOnUse" width="14" height="14" ' +
      'patternTransform="rotate(45)"><rect width="14" height="14" fill="#5a0a0a"/>' +
      '<rect width="14" height="14" fill="#cc0000" opacity="0.45"/>' +
      '<path d="M0 0 V14" stroke="#1a1f2e" stroke-width="4"/></pattern></defs>' +
      _fondPlanche(reseau, "M172 132 H218 V288 H172 Z M242 132 H312 V72 H378 V168 H318 V288 H242 Z",
        [["M18 244 V276", "#f4c542"], ["M407 284 V316", "#ff9933"]]) +
      '<rect x="248" y="288" width="58" height="24" fill="url(#kta-bv-inaccessible)" stroke="#5a0a0a" ' +
      'stroke-width="3"/>' +
      // Tracés de l'utilisateur (CANON.traces) : secondaire violet, principal vert qui se dessine.
      '<path d="M230 120 V300 H330" fill="none" stroke="#b000ff" stroke-width="5" stroke-linecap="round" ' +
      'stroke-linejoin="round"/>' +
      '<path class="kta-bv-trace-anim" d="M30 260 H160 V120 H300 V60 H390 V180" fill="none" stroke="#00ff00" ' +
      'stroke-width="5" stroke-linecap="round" stroke-linejoin="round" pathLength="100"/>' +
      pose.map(function(p) {
        return '<image href="icon/' + p[0] + '.png" x="' + p[1] + '" y="' + p[2] + '" width="36" height="36"/>';
      }).join("") +
      '<text x="18" y="30" fill="#5c5444" font-size="13" font-weight="600" letter-spacing="1">' +
      t("bienvenue.reperer.planche") + '</text></svg>' +
      '<figcaption class="kta-bv-legende">' + t("bienvenue.annoter.legende") + '</figcaption></figure>';
  }

  // Instance protégée : formulaire du code (zone remplie par ouvrir > rendreZoneCode), « Découvrir », puis à qui
  // demander le code. Sinon : « Entrer », « Découvrir » et la seule porte vers l'édition pro (contacts au pied).
  function _actionsHaut(protege) {
    const decouvrir = '<button type="button" class="kta-bv-btn kta-bv-btn-contour" data-bv="decouvrir">' +
      t("bienvenue.decouvrir") + '</button>';
    if (protege) {
      return '<form class="kta-bv-code" data-bv-code novalidate>' +
          '<div class="kta-bv-code-ligne">' +
            '<input type="password" class="kta-bv-code-champ" id="kta-bv-code-champ" aria-label="' +
              t("gate.placeholder") + '" placeholder="' + t("gate.placeholder") + '" autocomplete="off" ' +
              'autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="kta-bv-code-retour">' +
            '<button type="submit" class="kta-bv-btn kta-bv-btn-or kta-bv-code-entrer">' + t("bienvenue.entrer") +
              FLECHE + '</button>' +
          '</div>' +
          '<div class="kta-bv-code-retour" id="kta-bv-code-retour" aria-live="polite"></div>' +
        '</form>' +
        '<div class="kta-bv-actions">' + decouvrir + '</div>' +
        '<p class="kta-bv-code-note">' + t("gate.info") + '</p>';
    }
    return '<div class="kta-bv-actions">' + _boutonEntrer() + decouvrir +
      // Contacts de l'auteur : au pied de page seulement ; ici, la seule porte vers l'édition pro.
      '<a class="kta-bv-pastille-pro" href="https://pro.myktamap.fr/?presentation" target="_blank" ' +
        'rel="noopener noreferrer">💼 ' + t("home.footer.proLink") + '</a>' +
    '</div>';
  }

  function _gabarit(protege) {
    return '<div class="kta-bv-page">' +
      '<header class="kta-bv-entete">' +
        '<div class="kta-bv-barre"><p class="kta-bv-logo">MyKTAMap</p>' + _langues() + '</div>' +
        '<div class="kta-bv-hero">' +
          '<p class="kta-bv-surtitre">' + t("bienvenue.surtitre") + '</p>' +
          '<h1 id="kta-bv-titre">' + t("bienvenue.titre") + '</h1>' +
          '<p class="kta-bv-accroche">' + t("bienvenue.accroche") + '</p>' +
          _actionsHaut(protege) +
          _luneHaut() +
        '</div>' +
        _ville() +
        '<div class="kta-bv-entree" aria-hidden="true">' +
          '<div class="kta-bv-entree-galerie"></div><div class="kta-bv-fil-entree"></div>' +
          '<span class="kta-bv-repere">' + _img("peo.png", 40) + '</span>' +
          '<img class="kta-bv-tete-entree" src="icon/iconetrack.png" alt="" width="30" height="30">' +
          _speleos() +
        '</div>' +
      '</header>' +

      // Stations : ce que l'app FAIT, une ligne par fonction, d'après le guide (le « comment » est dans la doc).
      // « Découvrir » amène à la première (#kta-bv-topo).
      '<section id="kta-bv-topo" class="kta-bv-station" tabindex="-1">' +
        _galerie(GAL_A, BRAS_A, true) + _repere("entree_plan.png") +
        '<div class="kta-bv-contenu"><div class="kta-bv-texte">' +
          '<h2>' + t("bienvenue.topo.titre") + '</h2>' +
          '<p class="kta-bv-intro">' + t("bienvenue.topo.intro") + '</p>' +
          '<p class="kta-bv-intro">' + t("bienvenue.topo.complement") + '</p>' +
          '<h3 class="kta-bv-h3">' + t("bienvenue.topo.nest") + '</h3>' +
          _liste("bienvenue.topo", 4) +
        '</div></div>' +
      '</section>' +

      '<section class="kta-bv-station">' +
        _galerie(GAL_B, BRAS_B, true) + _repere("plaque.png") +
        '<div class="kta-bv-contenu"><div class="kta-bv-texte">' +
          '<h2>' + t("bienvenue.plans.titre") + '</h2>' +
          '<p class="kta-bv-intro">' + t("bienvenue.plans.intro") + '</p>' +
          _liste("bienvenue.plans", 4) +
          _encart("ambre", "info", "bienvenue.plans.encart") +
        '</div></div>' +
      '</section>' +

      '<section class="kta-bv-station">' +
        _galerie(GAL_A, BRAS_A, true) + _repere("pa.png") +
        '<div class="kta-bv-contenu kta-bv-contenu-ligne"><div class="kta-bv-texte">' +
          '<h2>' + t("bienvenue.annoter.titre") + '</h2>' +
          '<dl class="kta-bv-atouts">' +
            _atout("point", "bienvenue.annoter.points") + _atout("trace", "bienvenue.annoter.traces") +
            _atout("regle", "bienvenue.annoter.mesure") + _atout("retour", "bienvenue.annoter.corriger") +
            _atout("livre", "bienvenue.annoter.histoire") + _atout("carnet", "bienvenue.annoter.carnet") +
          '</dl>' +
        '</div>' + _plancheAnnoter() + '</div>' +
      '</section>' +

      '<section class="kta-bv-station">' +
        _galerie(GAL_B, BRAS_B, true) + _repere("chatiere.png") +
        '<div class="kta-bv-contenu kta-bv-contenu-ligne"><div class="kta-bv-texte">' +
          '<h2>' + t("bienvenue.reperer.titre") + '</h2>' +
          '<dl class="kta-bv-atouts">' +
            _atout("boussole", "bienvenue.reperer.suivi") + _atout("chemin", "bienvenue.reperer.iti") +
            _atout("danger", "bienvenue.reperer.urgence") + _atout("oeil", "bienvenue.reperer.xl") +
            _atout("loupe", "bienvenue.reperer.perdu") + _atout("sirene", "bienvenue.reperer.alertes") +
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
            _atout("session", "bienvenue.echanges.session") +
            _atout("exports", "bienvenue.echanges.exports") + _atout("imports", "bienvenue.echanges.imports") +
            _atout("carte", "bienvenue.echanges.osm") + _atout("globe", "bienvenue.echanges.langues") +
          '</dl>' +
          _encart("ambre", "groupe", "bienvenue.echanges.encart") +
        '</div></div>' +
      '</section>' +

      '<section class="kta-bv-station">' +
        _galerie(GAL_A, BRAS_A, true) + _repere("house.png") +
        '<div class="kta-bv-contenu"><div class="kta-bv-texte">' +
          '<h2>' + t("bienvenue.merci.titre") + '</h2>' +
          '<p class="kta-bv-intro">' + t("bienvenue.merci.intro") + '</p>' +
          _liste("bienvenue.merci", 5) +
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
          // Documentation (guide intégré, site public) et code source : aussi sur une instance protégée (ce ne sont
          // pas des contacts de l'auteur).
          '<div class="kta-bv-sortie-docs">' +
            '<button type="button" class="kta-bv-lien-pied" data-bv="doc" title="' + t("gate.docTitle") + '">' +
              t("gate.docBtn") + '</button>' +
            '<a class="kta-bv-lien-pied" href="https://doc.myktamap.fr/" target="_blank" rel="noopener noreferrer">' +
              '🌐 doc.myktamap.fr</a>' +
            '<a class="kta-bv-lien-pied kta-bv-github" href="https://github.com/Karmakta91/MyKTAMap" target="_blank" rel="noopener noreferrer">' +
              '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 ' +
              '6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-' +
              '.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-' +
              '3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 ' +
              '2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25' +
              '.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>' +
              t("bienvenue.github") + '</a>' +
          '</div>' +
        '</div></div>' +
      '</section>' +

      '<footer class="kta-bv-pied"><div class="kta-bv-pied-in">' +
        '<p class="kta-bv-logo">MyKTAMap</p>' +
        // ⚠️ Contacts de l'auteur : écran sans mot de passe seulement (une instance protégée est gérée par
        // quelqu'un d'autre, le code se demande à cette personne). Liens sortants, sans script.
        (protege ? '<p class="kta-bv-pied-note">' + t("bienvenue.pied.prive") + '</p>'
          : '<p class="kta-bv-contacts">' + t("gate.contact") + '</p>') +
        '<p class="kta-bv-pied-note">' + t("bienvenue.pied") + '</p>' +
        // Signature comme au splash ; les librairies sont remerciées dans la station « Merci ».
        '<div class="kta-bv-pied-credits">' +
          '<img class="kta-bv-signature" src="icon/karma.png" alt="KARMA" height="20"></div>' +
      '</div></footer>' +
      // Sortie d'urgence (bouton 🚨 de l'app) : remonte en haut, montrée une fois l'en-tête dépassé.
      '<button type="button" class="kta-bv-sortie-urgence" data-bv="remonter" aria-label="' + t("bienvenue.urgence") +
        '" title="' + t("bienvenue.urgence") + '"><span aria-hidden="true">🚨</span></button>' +
      '<div class="kta-bv-voile" aria-hidden="true"></div>' +
    '</div>';
  }

  // Ville seule : en-tête de l'écran (barre, ville, puits) sans stations ni pied. Titre et description posés ensuite
  // en textContent (ouvrir > dessiner) : jamais de HTML venu de l'installation.
  function _gabaritVille() {
    return '<div class="kta-bv-page">' +
      '<header class="kta-bv-entete">' +
        '<div class="kta-bv-barre"><p class="kta-bv-logo">MyKTAMap</p>' + _langues() + '</div>' +
        '<div class="kta-bv-hero">' +
          '<h1 id="kta-bv-titre"></h1>' +
          '<p class="kta-bv-accroche"></p>' +
          '<div class="kta-bv-actions">' +
            '<button type="button" class="kta-bv-btn kta-bv-btn-or" data-bv="entrer">' + t("bienvenue.connecter") +
              FLECHE + '</button>' +
            '<button type="button" class="kta-bv-btn kta-bv-btn-contour" data-bv="doc" title="' + t("gate.docTitle") +
              '">' + t("gate.docBtn") + '</button>' +
          '</div>' +
          _luneHaut() +
        '</div>' +
        _ville() +
        '<div class="kta-bv-entree" aria-hidden="true">' +
          '<div class="kta-bv-entree-galerie"></div>' +
          '<span class="kta-bv-repere">' + _img("peo.png", 40) + '</span>' +
          _speleos() +
        '</div>' +
      '</header>' +
    '</div>';
  }
  // { code: texte } → texte de la langue de l'app, sinon fr, sinon le premier ; "" si rien.
  function _texteLangue(v) {
    if (!v || typeof v !== "object") return "";
    const l = (window.I18n && typeof window.I18n.getLang === "function") ? window.I18n.getLang() : "fr";
    const cles = Object.keys(v);
    return String(v[l] || v.fr || (cles.length ? v[cles[0]] : "") || "");
  }

  // ── Mouvement ───────────────────────────────────────────────────────────
  // Un seul requestAnimationFrame par image. p = (milieu de l'écran − haut de la galerie) / H, borné 0…1 : le fil
  // doré est dessiné sur p × L, la tête posée par getPointAtLength et orientée selon le segment, le repère passe
  // « atteint » une fois dépassé (flash à la descente, aucun en remontant). Calculs pour les stations visibles ; une
  // station quittée est recalée une fois à son bout.
  function _mouvement(ecranEl) {
    let actif = false, image = 0, observateur = null, redim = null;
    const galeries = [], visibles = [];
    let filEntree = null, teteEntree = null, pEntree = -1;

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
      if (!teteEntree) teteEntree = ecranEl.querySelector(".kta-bv-tete-entree");
      if (!filEntree || !galeries.length) return;
      const fin = galeries[0].haut - hauteurEcran() / 2;
      const p = fin > 0 ? borner(defile() / fin) : 1;
      if (p === pEntree) return;
      pEntree = p;
      // Sur le parent : le fil et la tête de suivi lisent la même progression.
      filEntree.parentNode.style.setProperty("--entree", p);
      if (teteEntree) teteEntree.classList.toggle("kta-bv-en-cours", p > 0 && p < 1);
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
      // Lampadaire au-dessus des spéléos (ou du puits) : masqué, en largeur seulement (il est au-dessus d'eux).
      const sp = ecranEl.querySelector(".kta-bv-speleos");
      const g = Math.min(e.left, sp ? sp.getBoundingClientRect().left : e.left) - marge;
      const d = Math.max(e.right, sp ? sp.getBoundingClientRect().right : e.right) + marge;
      chaque(ecranEl.querySelectorAll(".kta-bv-lampe"), function(l) {
        l.classList.remove("kta-bv-masque");
        const r = l.getBoundingClientRect();
        l.classList.toggle("kta-bv-masque", r.left < d && g < r.right);
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
        if (document.fonts && "ready" in document.fonts) document.fonts.ready.then(relayout);
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
    // Instance protégée : l'appelant fournit la vérification (unlockGate.js > _essayerCode), jamais réécrite ici.
    const code = (opts.code && typeof opts.code.essayer === "function" && typeof opts.code.etat === "function")
      ? opts.code : null;
    const ville = (!code && opts.villeSeule && typeof opts.villeSeule === "object") ? opts.villeSeule : null;
    const ecranEl = document.createElement("div");
    ecranEl.id = "kta-unlock-overlay";
    ecranEl.className = "kta-bv" + (code ? " kta-bv-protege" : "") + (ville ? " kta-bv-ville-seule" : "");
    ecranEl.setAttribute("role", "dialog");
    ecranEl.setAttribute("aria-modal", "true");
    ecranEl.setAttribute("aria-labelledby", "kta-bv-titre");
    ecranEl.tabIndex = -1;
    let mvt = null, sortie = false, minuteur = null, rebours = null, essaiEnCours = false;
    // « Découvrir l'app en 1 minute » touché avant le code : la visite est demandée à l'entrée.
    let visiteVoulue = false;
    let vigieEntete = null, remontee = null;
    // Ville seule : clic sur « Me connecter » en attente d'attendreEntree() (demandee) ou attente posée (attente).
    let ferme = false, demandee = false, attente = null;
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const surReduit = function() { if (mq.matches && mvt) mvt.etatFinal(); _figerPlanches(ecranEl); };

    function champ() { return ecranEl.querySelector(".kta-bv-code-champ"); }
    function retour(html, classe) {
      const el = ecranEl.querySelector(".kta-bv-code-retour");
      if (el) el.innerHTML = html ? '<p class="kta-bv-code-msg kta-bv-code-' + classe + '">' + html + '</p>' : "";
    }

    // Zone du champ selon l'état de la saisie. Verrou : champ et bouton désactivés, compte à rebours à la place du
    // texte saisi, revérifié chaque seconde ; à l'échéance, le champ revient (même écran, la Promise attend toujours).
    function rendreZoneCode() {
      if (!code) return;
      clearInterval(rebours); rebours = null;
      const input = champ(), bouton = ecranEl.querySelector(".kta-bv-code-entrer");
      if (!input || !bouton) return;
      const etat = code.etat();
      input.disabled = bouton.disabled = !!etat.verrou;
      ecranEl.classList.toggle("kta-bv-verrou", !!etat.verrou);
      if (!etat.verrou) {
        input.placeholder = t("gate.placeholder");
        retour(etat.restants ? t("gate.warn.remaining", { n: etat.restants }) : "", "avert");
        return;
      }
      input.value = "";
      const ecrire = function(attente) {
        input.placeholder = "🔒 " + attente;
        retour('<strong class="kta-bv-code-titre">' + t("gate.lockout.titre") + '</strong> ' + t("gate.lockout.msg") +
          '<br>' + t("gate.lockout.attente") + ' <span class="kta-bv-code-rebours">' + attente + '</span>' +
          '<span class="kta-bv-code-aide">' + t("gate.lockout.hint") + '</span>', "erreur");
      };
      ecrire(etat.attente);
      rebours = setInterval(function() {
        const e = code.etat();
        if (!e.verrou) { rendreZoneCode(); return; }
        const cd = ecranEl.querySelector(".kta-bv-code-rebours");
        if (cd) cd.textContent = e.attente;
        input.placeholder = "🔒 " + e.attente;
      }, 1000);
    }

    // Sortie d'urgence : remontée progressive (durée selon la distance, bornée), le fil se rétracte en chemin ;
    // toute action de l'utilisateur l'arrête. Mouvement réduit : saut direct.
    const REMONTEE_MIN = 1500, REMONTEE_MAX = 4000, REMONTEE_PAR_PX = 0.4;
    const GESTES = ["wheel", "touchstart", "keydown", "mousedown"];
    function douce(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function interrompreRemontee() {
      if (!remontee) return;
      window.cancelAnimationFrame(remontee.image);
      remontee = null;
      GESTES.forEach(function(g) { ecranEl.removeEventListener(g, interrompreRemontee); });
    }
    function focusHaut() { try { ecranEl.focus({ preventScroll: true }); } catch (e) { ecranEl.focus(); } }
    function remonter() {
      interrompreRemontee();
      const depart = ecranEl.scrollTop;
      if (depart <= 0) return;
      if (reduit() || !window.requestAnimationFrame) { ecranEl.scrollTop = 0; focusHaut(); return; }
      const duree = Math.min(REMONTEE_MAX, Math.max(REMONTEE_MIN, depart * REMONTEE_PAR_PX));
      let debut = 0;
      const pas = function(maintenant) {
        if (!remontee) return;
        if (!debut) debut = maintenant;
        const x = Math.min(1, (maintenant - debut) / duree);
        ecranEl.scrollTop = Math.round(depart * (1 - douce(x)));
        if (x < 1) { remontee.image = window.requestAnimationFrame(pas); return; }
        interrompreRemontee();
        focusHaut();
      };
      remontee = { image: window.requestAnimationFrame(pas) };
      GESTES.forEach(function(g) { ecranEl.addEventListener(g, interrompreRemontee, { passive: true }); });
    }
    function surveillerEntete() {
      if (vigieEntete) vigieEntete.disconnect();
      vigieEntete = null;
      const bouton = ecranEl.querySelector(".kta-bv-sortie-urgence"), entete = ecranEl.querySelector(".kta-bv-entete");
      if (!bouton || !entete) return;
      if (!("IntersectionObserver" in window)) { bouton.classList.add("kta-bv-montre"); return; }
      vigieEntete = new IntersectionObserver(function(entrees) {
        bouton.classList.toggle("kta-bv-montre", !entrees[entrees.length - 1].isIntersecting);
      }, { root: ecranEl });
      vigieEntete.observe(entete);
    }

    function dessinerVille() {
      ecranEl.innerHTML = _gabaritVille();
      ecranEl.scrollTop = 0;
      ecranEl.querySelector("#kta-bv-titre").textContent = _texteLangue(ville.titre) || "MyKTAMap";
      const desc = ecranEl.querySelector(".kta-bv-accroche");
      desc.textContent = _texteLangue(ville.description);
      desc.hidden = !desc.textContent;
      _figerPlanches(ecranEl);
      if (ecranEl.inert) ecranEl.querySelectorAll("button").forEach(function(b) { b.disabled = true; });
      setTimeout(function() { try { ecranEl.focus({ preventScroll: true }); } catch (e) { ecranEl.focus(); } }, 100);
    }

    // Ville seule : écran inerte, boutons désactivés, le temps que l'appelant ait la main (fenêtre par-dessus).
    function bloquerVille(oui) {
      ecranEl.inert = oui;
      ecranEl.querySelectorAll("button").forEach(function(b) { b.disabled = oui; });
      if (!oui) { try { ecranEl.focus({ preventScroll: true }); } catch (e) { ecranEl.focus(); } }
    }
    function entreeVille() {
      if (ferme || ecranEl.inert) return;
      bloquerVille(true);
      if (attente) { const r = attente; attente = null; r(); } else demandee = true;
    }
    function attendreEntree() {
      if (ferme) return Promise.resolve();
      if (demandee) { demandee = false; return Promise.resolve(); }
      bloquerVille(false);
      return new Promise(function(r) { attente = r; });
    }

    function dessiner() {
      interrompreRemontee();
      if (mvt) mvt.arreter();
      if (ville) { dessinerVille(); return; }
      ecranEl.innerHTML = _gabarit(!!code);
      ecranEl.scrollTop = 0;
      mvt = _mouvement(ecranEl);
      _figerPlanches(ecranEl);
      rendreZoneCode();
      surveillerEntete();
      // Focus sur l'écran lui-même (dialogue) : le clavier part de là (Tab → « Entrer », flèches → défilement),
      // sans anneau de focus imposé sur un bouton au toucher, ni clavier virtuel ouvert sur le champ du code.
      // Instance protégée sur PC (souris, pas de clavier virtuel) : focus sur le champ, le code se tape directement.
      setTimeout(function() {
        const input = champ();
        const pc = !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
        const cible = (code && pc && input && !input.disabled) ? input : ecranEl;
        try { cible.focus({ preventScroll: true }); } catch (e) { cible.focus(); }
      }, 100);
    }

    function fermer() {
      ferme = true;
      if (attente) { const r = attente; attente = null; r(); }
      interrompreRemontee();
      if (vigieEntete) vigieEntete.disconnect();
      clearTimeout(minuteur);
      clearInterval(rebours);
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
      interrompreRemontee();
      clearInterval(rebours);
      const actifs = Array.prototype.filter.call(ecranEl.querySelectorAll("button, input"),
        function(b) { return !b.disabled; });
      actifs.forEach(function(b) { b.disabled = true; });
      const avant = typeof opts.avantEntree === "function"
        ? Promise.resolve().then(opts.avantEntree).catch(function(e) { console.warn("[Bienvenue] avantEntree :", e); })
        : Promise.resolve();
      avant.then(function(ok) {
        if (ok !== false) { descendre(visite); return; }
        sortie = false;
        actifs.forEach(function(b) { b.disabled = false; });
        const input = champ();
        if (input) input.value = "";
        retour("", "");
      });
    }

    function descendre(visite) {
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

    // Instance protégée : « Entrer » du bas et la visite remontent au champ, qui prend le focus (ouvre le clavier au
    // toucher, voulu : la personne a choisi d'entrer). Pendant un verrou, le focus va au compte à rebours.
    function allerAuChamp(visite) {
      if (visite) visiteVoulue = true;
      try { ecranEl.scrollTo({ top: 0, behavior: reduit() ? "auto" : "smooth" }); }
      catch (e) { ecranEl.scrollTop = 0; }
      const input = champ();
      const cible = (input && !input.disabled) ? input : ecranEl.querySelector(".kta-bv-code-retour");
      if (!cible) return;
      if (cible !== input) cible.tabIndex = -1;
      try { cible.focus({ preventScroll: true }); } catch (e) { cible.focus(); }
    }

    function soumettre() {
      const input = champ();
      if (!code || !input || input.disabled || essaiEnCours || sortie) return;
      essaiEnCours = true;
      code.essayer(input.value).then(function(r) {
        essaiEnCours = false;
        if (r.etat === "ok") {
          retour(t("gate.success"), "ok");
          entrer(visiteVoulue);
          return;
        }
        if (r.etat === "vide") { retour(t("gate.err.empty"), "erreur"); input.focus(); return; }
        if (r.etat === "crypto") { retour(t("gate.err.crypto", { err: r.err }), "erreur"); return; }
        input.value = "";
        if (r.etat === "verrou") { rendreZoneCode(); return; }
        retour(t("gate.err.incorrect", { n: r.reste }), "erreur");
        input.focus();
      }).catch(function(e) {
        essaiEnCours = false;
        console.warn("[Bienvenue] essai du code :", e);
      });
    }

    // Délégation : le contenu est redessiné au changement de langue.
    ecranEl.addEventListener("submit", function(ev) {
      if (!ev.target.closest || !ev.target.closest("[data-bv-code]")) return;
      ev.preventDefault();
      soumettre();
    });
    ecranEl.addEventListener("click", function(ev) {
      const cible = ev.target.closest ? ev.target.closest("[data-bv], [data-lang]") : null;
      if (!cible || !ecranEl.contains(cible) || sortie) return;
      if (cible.hasAttribute("data-lang")) {
        const lang = cible.getAttribute("data-lang");
        if (!window.I18n || typeof window.I18n.setLang !== "function") return;
        window.I18n.setLang(lang).then(dessiner).catch(function(e) { console.warn("[Bienvenue] setLang :", e); });
        return;
      }
      const action = cible.getAttribute("data-bv");
      if (action === "remonter") remonter();
      else if (action === "doc") { if (typeof opts.surDoc === "function") opts.surDoc(); }
      else if (action === "entrer" && ville) entreeVille();
      else if (action === "entrer") { if (code) allerAuChamp(false); else entrer(false); }
      else if (action === "visite") { if (code) allerAuChamp(true); else entrer(true); }
      else if (action === "decouvrir") {
        const cibleSection = ecranEl.querySelector("#kta-bv-topo");
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
    if (ville) {
      // Un clic avant le premier attendreEntree() est gardé (demandee) : l'appel suivant se résout aussitôt.
      return { fermer: fermer, attendreEntree: attendreEntree, ouverte: function() { return !ferme; } };
    }
    return { fermer: fermer };
  }

  window.KtaBienvenue = { ouvrir: ouvrir };
})();
