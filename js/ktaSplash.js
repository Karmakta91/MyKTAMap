/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ktaSplash.js — écran de démarrage : le réseau se dessine une fois, l'écran se ferme quand l'accueil est affiché.
// Chargé juste après #splashOverlay (index.html), avant tout autre script : choisit la version avant la première
// peinture et arme le plafond de sécurité. Le rendu et les animations vivent dans css/style.css (bloc splash).
// Expose : window.KtaSplash { version, finAnimation() → Promise, fermer(pret?) → Promise, surFermeture(cb) }.
// ⚠️ Fermeture = au plus tard de (fin d'animation, écran prêt) : fermer(pret) attend les deux, puis deux images (le
//    HOME est peint). Quoi qu'il arrive, fondu PLAFOND_MS après le début de la navigation (performance.now()).
// ⚠️ Versions : « longue » à CHAQUE ouverture (décision produit : pas de version raccourcie) ; mouvement réduit =
//    image finale directe, puis fondu.
// ⚠️ Un clic ou Échap passe l'animation : fondu si l'accueil est prêt, sinon image finale et attente de l'accueil.
// 🩸 Au clic, jamais au pointerdown : le clic qui suit traverserait le fondu (pointer-events: none) et toucherait
//    l'accueil dessous.
// Garde-fou : scripts/smoke/checkup-splash.js · Doc : docs/architecture/ui.md (Splash de démarrage).

(function () {
  "use strict";

  const DUREE_LONGUE_MS = 4000;   // tracé complet à ~3,4 s (css), puis l'image finale reste un instant
  const PLAFOND_MS      = 12000;  // depuis le début de la navigation
  const FONDU_MS        = 500;    // transition d'opacité (0,4 s) + marge avant le retrait du DOM
  // Clé d'une version courte abandonnée, encore présente chez des testeurs : retirée, elle ne sert plus.
  const LS_ANCIENNE     = "myktamap_splash_jour_v1";

  const el = document.getElementById("splashOverlay");
  try { localStorage.removeItem(LS_ANCIENNE); } catch (e) { /* stockage bloqué : rien à retirer */ }

  let reduit = false;
  try { reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* pas de media query */ }
  const version = reduit ? "reduite" : "longue";
  if (el && version === "reduite") el.classList.add("kta-splash-fini");

  // ── Fin d'animation ──
  let _finAnimFaite = false;
  let _resoudreFinAnim = null;
  const _finAnim = new Promise(function (r) { _resoudreFinAnim = r; });
  function _terminerAnimation() {
    if (_finAnimFaite) return;
    _finAnimFaite = true;
    _resoudreFinAnim();
  }
  setTimeout(_terminerAnimation, version === "longue" ? DUREE_LONGUE_MS : 0);

  // ── Fondu et retrait ──
  let _pret = false;
  let _enFondu = false;
  let _retire = !el;
  const _apres = [];
  function _executer(cb) {
    try { cb(); } catch (e) { console.warn("[Splash] rappel de fermeture en échec :", e); }
  }
  function _fondu(motif) {
    if (_enFondu || !el) return;
    _enFondu = true;
    console.log("[Splash] fondu (" + motif + ") à " + Math.round(performance.now()) + " ms");
    el.classList.add("fading");
    document.removeEventListener("keydown", _surTouche, true);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      _retire = true;
      _apres.splice(0).forEach(_executer);
    }, FONDU_MS);
  }

  function _deuxImages() {
    return new Promise(function (r) {
      // Onglet en arrière-plan : requestAnimationFrame ne tourne pas, le délai prend le relais.
      const t = setTimeout(r, 200);
      requestAnimationFrame(function () { requestAnimationFrame(function () { clearTimeout(t); r(); }); });
    });
  }

  let _fermeture = null;
  function fermer(pret) {
    if (_fermeture) return _fermeture;
    const _ecran = Promise.resolve(pret).catch(function () { /* écran en échec : on ferme quand même */ })
      .then(_deuxImages).then(function () { _pret = true; });
    _fermeture = Promise.all([_finAnim, _ecran]).then(function () { _fondu("accueil"); });
    return _fermeture;
  }

  // ── Passer l'animation ──
  function _passer() {
    if (_enFondu) return;
    if (_pret) { _terminerAnimation(); _fondu("passé"); return; }
    if (el) el.classList.add("kta-splash-fini");
    _terminerAnimation();
  }
  function _surTouche(ev) {
    if (ev.key === "Escape" && el && el.parentNode) _passer();
  }
  if (el) {
    el.addEventListener("click", _passer);
    document.addEventListener("keydown", _surTouche, true);
  }

  // ── Plafond de sécurité ──
  setTimeout(function () {
    _terminerAnimation();
    _fondu("plafond");
  }, Math.max(0, PLAFOND_MS - performance.now()));

  window.KtaSplash = {
    version: version,
    finAnimation: function () { return _finAnim; },
    fermer: fermer,
    surFermeture: function (cb) {
      if (typeof cb !== "function") return;
      if (_retire) setTimeout(function () { _executer(cb); }, 0);
      else _apres.push(cb);
    }
  };
})();
