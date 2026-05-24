/*!
 * MyKTAMap — Application de cartographie pour cataphiles
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0 (Creative Commons Attribution - NonCommercial - ShareAlike)
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 *
 * USAGE COMMERCIAL STRICTEMENT INTERDIT sans accord ecrit prealable.
 * Voir le fichier LICENSE a la racine du projet.
 */

// =========================
// COPYRIGHT.JS — Watermark + banniere console + detection F12 (debug only)
// =========================
// Ce module est charge EN PREMIER dans index.html (avant tous les autres scripts).
// Il fait 3 choses :
//   1. Pose un watermark global accessible via window.__MKM__ (signature de build,
//      utile pour prouver l'origine du code en cas de copie)
//   2. Affiche une banniere copyright dans la console au boot (visible quand un
//      developpeur ouvre F12 — message clair sur la licence)
//   3. Si APP_CONFIG.debugMode === true : detecte l'ouverture de DevTools par
//      heuristique outerWidth/innerWidth et affiche un toast d'avertissement.
//      ⚠️ Conditionne au mode debug ! En prod (debugMode = false) la detection
//      est totalement inactive — la heuristique generait des faux positifs au
//      moment des transitions de modales chez les utilisateurs normaux.
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
    site:      "https://myktamap.fr",
    license:   "CC BY-NC-SA 4.0",
    licenseUrl:"https://creativecommons.org/licenses/by-nc-sa/4.0/",
    build:     "v1.18.1",
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
      "Site officiel : https://myktamap.fr\n" +
      "Toute reproduction commerciale expose le contrevenant a des poursuites (art. L.335-2 CPI).",
      "background:#f4c542; color:#1a1f2e; font-weight:800; font-size:14px; padding:4px 8px; border-radius:4px 0 0 4px;",
      "background:#1a1f2e; color:#f4c542; font-size:13px; padding:4px 8px; border-radius:0 4px 4px 0;",
      "color:#c8d0e0; font-size:12px; line-height:1.6;"
    );
  } catch(e) {}

  // ========== DETECTION DEVTOOLS (debug only) ==========
  // Active uniquement si APP_CONFIG.debugMode === true (verif a chaque tick,
  // pas seulement au boot — donc toggle live du mode debug fonctionne).
  // Sinon : aucune polling, zero overhead, zero faux positif chez les
  // utilisateurs normaux.
  //
  // Heuristique : quand le panneau DevTools s'ouvre (dock cote ou bas), la
  // difference outerWidth/innerWidth ou outerHeight/innerHeight depasse ~280px.
  // Threshold un peu plus haut que la heuristique classique (200) pour reduire
  // les faux positifs sur transitions de modales meme en mode debug.
  // Limite : detection par taille pas fiable si DevTools detache (fenetre
  // separee) — c'est un outil de dissuasion, pas une vraie protection.

  var _devtoolsSpotted = false;
  // Threshold abaisse a 240 (etait 280) — compromis entre le sensible (200,
  // qui generait des faux positifs au clic Appliquer) et le strict (280, qui
  // ratait des configs DevTools dock cote sur certains ecrans). Le skip-modal
  // protege deja des transitions de modales, 240 capture la plupart des
  // ouvertures DevTools sans declenchement abusif.
  var THRESHOLD = 240;

  function _isDebugMode() {
    return !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);
  }

  function _modalOuverte() {
    // Skip si une modale charte est ouverte ou en transition (changement de
    // viewport au moment du clic, evite faux positif meme en debug).
    return !!(
      document.querySelector(".kta-readme-modal-overlay") ||
      document.getElementById("kta-poi-modal")            ||
      document.getElementById("kta-itinerary-modal")
    );
  }

  // Affiche le toast d'avertissement copyright. Avec un titre adaptatif selon
  // la cause du declenchement (activation manuelle du mode debug ou detection
  // F12 par heuristique).
  function _afficherToastDevtools(cause) {
    if (document.getElementById("kta-devtools-warn")) return;
    var titre;
    if (cause === "debug-activated") {
      titre = "Mode debug active";
    } else {
      titre = "Inspection detectee";
    }
    var t = document.createElement("div");
    t.id = "kta-devtools-warn";
    t.className = "kta-devtools-warn";
    t.innerHTML =
      '<div class="kta-devtools-warn-titre">' +
        '<span class="kta-devtools-warn-icon">&#x1F441;&#xFE0F;</span> ' +
        titre +
        '<span class="kta-devtools-warn-tag">DEBUG</span>' +
      '</div>' +
      '<div class="kta-devtools-warn-corps">' +
        '<strong>MyKTAMap</strong> &copy; 2026 Flavien VIDAL<br>' +
        'Licence : <strong>CC BY-NC-SA 4.0</strong><br>' +
        'Usage commercial <strong style="color:#ff6b6b;">INTERDIT</strong> sans accord ecrit prealable.<br>' +
        '<a href="https://myktamap.fr" target="_blank" rel="noopener">myktamap.fr</a>' +
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

  // Expose la fonction pour que setDebugMode puisse declencher le toast
  // a l'activation du mode debug, sans attendre que le polling F12 detecte
  // quelque chose (utile car le user peut activer debug sans avoir F12 ouvert).
  window.__MKM_showWarning__ = _afficherToastDevtools;

  function _checkDevTools() {
    // Garde principale : si debug OFF, on ne fait STRICTEMENT rien (pas de
    // toast, pas de calcul, pas de side-effect). Les utilisateurs normaux
    // sont 100% epargnes.
    if (!_isDebugMode()) {
      _devtoolsSpotted = false;  // reset pour le toggle live debug ON -> OFF
      return;
    }

    // Skip si une modale est ouverte (le viewport interne peut changer
    // brievement durant la transition d'ouverture/fermeture).
    if (_modalOuverte()) return;

    var wd = (window.outerWidth  || 0) - (window.innerWidth  || 0);
    var hd = (window.outerHeight || 0) - (window.innerHeight || 0);

    if (wd > THRESHOLD || hd > THRESHOLD) {
      if (!_devtoolsSpotted) {
        _devtoolsSpotted = true;
        // Differe le toast de 800ms pour laisser le splash se terminer
        // et laisser le viewport se stabiliser apres une eventuelle transition.
        setTimeout(_afficherToastDevtools, 800);
      }
    } else {
      _devtoolsSpotted = false;
    }
  }

  // Lancer le polling apres un petit delai (laisse l'app booter tranquille
  // et APP_CONFIG.debugMode etre populated par config.js).
  setTimeout(function() {
    _checkDevTools();
    setInterval(_checkDevTools, 2000);
  }, 3000);
})();
