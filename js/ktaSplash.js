/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ktaSplash.js — écran de démarrage : le réseau se dessine une fois, l'écran se ferme quand l'accueil est affiché.
// Chargé juste après #splashOverlay (index.html), avant tout autre script : choisit la version avant la première
// peinture et arme le plafond de sécurité. Le rendu et les animations vivent dans css/style.css (bloc splash).
// Expose : window.KtaSplash { version, debut(), finAnimation() → Promise, fermer(pret?) → Promise, surFermeture(cb),
//   trace() → { mode: "canvas" | "svg", motif, bilan } }.
// ⚠️ Galeries : dessinées par js/ktaSplashWorker.js dans un canvas transféré (OffscreenCanvas), hors du fil
//    principal ; à défaut (API absente, worker en erreur ou muet), le SVG animé du CSS reste affiché.
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
  // 🩸 Le tracé (stroke-dashoffset) se calcule sur le fil principal : lancé pendant le démarrage de l'app (scripts,
  //    puis construction de l'accueil), il saccadait au début (iPhone ; mesuré ×4 : ~0,8 s de tâches longues dans
  //    la 1re seconde du tracé). La scène attend `.kta-splash-go`, posée quand l'ACCUEIL est prêt (fermer(pret)),
  //    ou dès qu'on attend la fin d'animation (finAnimation() : une gate va s'afficher, l'accueil ne viendra pas
  //    avant), ou au clic, ou au plus tard à DEMARRAGE_MAX_MS. Les coins (opacité seule) jouent dès l'affichage.
  const DEMARRAGE_MAX_MS = 2500;
  let _debut = null;
  let _debutPrecis = 0;
  function _demarrer() {
    if (_debut !== null) return;
    _debutPrecis = performance.now();
    _debut = Math.round(_debutPrecis);
    if (el) el.classList.add("kta-splash-go");
    if (_worker) _worker.postMessage({ type: "go", debut: performance.timeOrigin + _debutPrecis });
    setTimeout(_terminerAnimation, version === "longue" ? DUREE_LONGUE_MS : 0);
  }

  // ── Galeries dans un worker ──
  // 🩸 Même démarré accueil prêt, le tracé SVG (stroke-dashoffset) se calcule sur le fil principal : la moindre
  //    tâche longue le figeait (début saccadé sur iPhone). Le worker dessine au rythme de SON requestAnimationFrame.
  // ⚠️ Une seule source : géométrie (attribut d, viewBox) et rythme (durée, délai de chaque chemin, courbe, trait)
  //    se lisent dans le SVG et sa feuille de style ; un chemin hors « M puis L absolus », une courbe non
  //    cubic-bezier ou un preserveAspectRatio posé → SVG animé.
  // ⚠️ Le SVG des galeries n'est masqué (.kta-splash-canvas) qu'à la réponse du worker (premier dessin fait) ;
  //    jusque-là il reste affiché, en pause, donc vide : la bascule ne se voit pas.
  // 🩸 Les 300 ms d'attente ne comptent que le temps où le fil principal est libre : pendant le démarrage les
  //    scripts le bloquent, et un minuteur échu pourrait passer avant la réponse déjà arrivée du worker.
  const ATTENTE_WORKER_MS = 300;
  let _worker = null;
  let _canvas = null;
  let _rythme = null;
  let _mode = "svg";
  let _repli = false;
  let _motif = reduit ? "mouvement réduit" : null;
  let _bilan = null;
  let _taille = "";

  function _ms(v) {
    const m = /^(-?\d*\.?\d+)(m?s)$/.exec(String(v).trim());
    return m ? parseFloat(m[1]) * (m[2] === "s" ? 1000 : 1) : NaN;
  }
  function _lireChemins(chemins) {
    const out = [];
    for (let i = 0; i < chemins.length; i++) {
      const d = chemins[i].getAttribute("d") || "";
      if (!/^M[ML\d.,\s-]+$/.test(d) || d.indexOf("M", 1) !== -1) return null;
      const n = (d.match(/-?\d*\.?\d+/g) || []).map(Number);
      if (n.length < 4 || n.length % 2) return null;
      out.push(n);
    }
    return out;
  }
  function _lireRythme(chemins) {
    const cs = getComputedStyle(chemins[0]);
    const tf = cs.animationTimingFunction;
    const m = /^cubic-bezier\(([^)]+)\)$/.exec(tf);
    const courbe = m ? m[1].split(",").map(Number) : (tf === "linear" ? [0, 0, 1, 1] : null);
    const r = {
      duree: _ms(cs.animationDuration),
      delais: chemins.map(function (p) { return _ms(getComputedStyle(p).animationDelay); }),
      courbe: courbe,
      couleur: cs.stroke,
      largeur: parseFloat(cs.strokeWidth),
      opacite: parseFloat(cs.opacity),
      bout: cs.strokeLinecap,
      jonction: cs.strokeLinejoin
    };
    const nombres = [r.duree, r.largeur, r.opacite].concat(r.delais, courbe || [NaN]);
    if (!courbe || courbe.length !== 4 || !(r.duree > 0) || !nombres.every(isFinite) || !/^rgb/.test(r.couleur)) {
      return null;
    }
    return r;
  }

  // Taille en pixels CSS : celle du ResizeObserver (aucune mise en page forcée) ; la densité, relue à chaque
  // redimensionnement de la fenêtre (zoom, écran changé).
  let _css = null;
  function _envoyerTaille() {
    if (!_worker || !_css) return;
    const dpr = window.devicePixelRatio || 1;
    const cle = _css[0] + "x" + _css[1] + "@" + dpr;
    if (cle === _taille) return;
    _taille = cle;
    _worker.postMessage({ type: "taille", largeur: _css[0], hauteur: _css[1], dpr: dpr });
  }

  let _observateur = null;
  function _arreterWorker() {
    window.removeEventListener("resize", _envoyerTaille);
    if (_observateur) { _observateur.disconnect(); _observateur = null; }
    if (_worker) { try { _worker.terminate(); } catch (e) { /* déjà arrêté */ } }
    _worker = null;
  }

  // Repli sur le SVG. Après la bascule (worker tombé en route), chaque chemin reprend son animation là où le
  // tracé en était : délai négatif, l'animation CSS redémarre à l'instant voulu.
  function _abandon(motif) {
    if (_repli) return;
    _repli = true;
    _arreterWorker();
    if (_canvas && _canvas.parentNode) _canvas.parentNode.removeChild(_canvas);
    _canvas = null;
    _motif = motif;
    if (_mode === "canvas") {
      _mode = "svg";
      if (_debut !== null && el && !el.classList.contains("kta-splash-fini") && _rythme) {
        const ecoule = performance.now() - _debutPrecis;
        el.querySelectorAll(".kta-splash-galeries path").forEach(function (p, i) {
          p.style.animationDelay = Math.round(_rythme.delais[i] - ecoule) + "ms";
        });
      }
      if (el) el.classList.remove("kta-splash-canvas");
    }
    console.log("[Splash] galeries en SVG : " + motif);
  }

  function _surMessage(ev) {
    const m = ev.data || {};
    if (m.type === "pret") {
      if (!_worker || !el) return;
      _mode = "canvas";
      el.classList.add("kta-splash-canvas");
    } else if (m.type === "bilan") {
      _bilan = { debut: m.debut, images: m.images, pixels: m.pixels };
    } else if (m.type === "echec") {
      _abandon("worker : " + m.motif);
    }
  }

  function _attendreWorker() {
    let credit = 0;
    let avant = performance.now();
    (function tic() {
      if (_mode === "canvas" || !_worker) return;
      const maintenant = performance.now();
      credit += Math.min(maintenant - avant, 60);
      avant = maintenant;
      if (credit >= ATTENTE_WORKER_MS) _abandon("pas de réponse du worker en " + ATTENTE_WORKER_MS + " ms");
      else setTimeout(tic, 50);
    })();
  }

  // 🩸 Rien n'est lu ni mesuré pendant le chargement du script : un getComputedStyle ou getBoundingClientRect
  //    ici forçait le style et la mise en page de la page en cours d'analyse (~0,25 s mesuré processeur ×4,
  //    avant la première peinture). Le worker part au premier rappel du ResizeObserver, style et mise en page faits.
  function _lancerWorker(svg) {
    const chemins = Array.from(svg.querySelectorAll(".kta-splash-galeries path"));
    const geometrie = chemins.length ? _lireChemins(chemins) : null;
    _rythme = geometrie ? _lireRythme(chemins) : null;
    const vb = svg.viewBox && svg.viewBox.baseVal;
    if (!geometrie || !_rythme || !vb || !(vb.width > 0) || !(vb.height > 0) ||
        svg.hasAttribute("preserveAspectRatio")) {
      _abandon("dessin illisible");
      return;
    }
    const hors = _canvas.transferControlToOffscreen();
    _worker = new Worker("js/ktaSplashWorker.js");
    _worker.onmessage = _surMessage;
    _worker.onerror = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      _abandon("worker en erreur" + (e && e.message ? " (" + e.message + ")" : ""));
    };
    _worker.onmessageerror = function () { _abandon("message illisible du worker"); };
    const dpr = window.devicePixelRatio || 1;
    _taille = _css[0] + "x" + _css[1] + "@" + dpr;
    _worker.postMessage({
      type: "init", canvas: hors, chemins: geometrie, rythme: _rythme,
      vue: [vb.x, vb.y, vb.width, vb.height], largeur: _css[0], hauteur: _css[1], dpr: dpr
    }, [hors]);
    // Scène déjà partie (ou passée) avant le premier rappel : le worker la rattrape à l'instant voulu.
    if (_debut !== null) _worker.postMessage({ type: "go", debut: performance.timeOrigin + _debutPrecis });
    if (el.classList.contains("kta-splash-fini")) _worker.postMessage({ type: "fin" });
    window.addEventListener("resize", _envoyerTaille);
    _attendreWorker();
  }

  function _initWorker() {
    const svg = document.getElementById("splashReseau");
    if (!el || reduit || !svg) return;
    if (typeof Worker !== "function" || typeof OffscreenCanvas !== "function" ||
        typeof HTMLCanvasElement.prototype.transferControlToOffscreen !== "function" ||
        typeof ResizeObserver !== "function" || typeof performance.timeOrigin !== "number") {
      _abandon("OffscreenCanvas indisponible");
      return;
    }
    _canvas = document.createElement("canvas");
    _canvas.id = "splashReseauCanvas";
    _canvas.setAttribute("aria-hidden", "true");
    svg.parentNode.insertBefore(_canvas, svg.nextSibling);
    // 🩸 Arrêté avec le worker (_arreterWorker) : le retrait du splash redonne un rappel (taille 0) qui, sinon,
    //    relancerait un worker.
    _observateur = new ResizeObserver(function (entrees) {
      if (_repli || !_canvas || !_observateur) return;
      const r = entrees[entrees.length - 1].contentRect;
      _css = [r.width, r.height];
      if (_worker) { _envoyerTaille(); return; }
      try { _lancerWorker(svg); } catch (e) { _abandon("initialisation : " + (e && e.message || e)); }
    });
    _observateur.observe(_canvas);
  }
  _initWorker();
  setTimeout(_demarrer, Math.max(0, DEMARRAGE_MAX_MS - performance.now()));

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
      _arreterWorker();
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
      .then(_deuxImages).then(function () { _pret = true; _demarrer(); });
    _fermeture = Promise.all([_finAnim, _ecran]).then(function () { _fondu("accueil"); });
    return _fermeture;
  }

  // ── Passer l'animation ──
  function _passer() {
    if (_enFondu) return;
    if (_pret) { _terminerAnimation(); _fondu("passé"); return; }
    if (el) el.classList.add("kta-splash-fini");
    _demarrer();
    if (_worker) _worker.postMessage({ type: "fin" });
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
    debut: function () { return _debut; },   // instant (ms) où la scène démarre ; null avant
    finAnimation: function () { _demarrer(); return _finAnim; },
    fermer: fermer,
    // Galeries : "canvas" (worker) ou "svg" (repli, motif) ; bilan = instants des images du worker (preuve).
    trace: function () { return { mode: _mode, motif: _motif, bilan: _bilan }; },
    surFermeture: function (cb) {
      if (typeof cb !== "function") return;
      if (_retire) setTimeout(function () { _executer(cb); }, 0);
      else _apres.push(cb);
    }
  };
})();
