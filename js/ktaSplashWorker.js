/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ktaSplashWorker.js — worker du splash : dessine les galeries dans le canvas transféré par js/ktaSplash.js, au
// rythme de requestAnimationFrame du worker, sans rien demander au fil principal.
// Messages reçus : init { canvas, chemins, rythme, vue, largeur, hauteur, dpr } · go { debut } (horloge
// performance.timeOrigin + now, commune aux deux fils) · fin (image finale) · taille { largeur, hauteur, dpr }.
// Messages envoyés : pret (premier dessin fait) · echec { motif } · bilan { debut, images, pixels } (instants des
// images produites pendant le tracé, horloge commune ; taille du canvas en pixels physiques).
// ⚠️ Contrat : chemins, viewBox, durée, délais, courbe et trait arrivent du SVG et de la feuille de style
//    (js/ktaSplash.js > _lireChemins, _lireRythme) ; seul le départ du tiret est ici (DEPART).
// Garde-fou : scripts/smoke/checkup-splash.js · Doc : docs/architecture/ui.md (Splash de démarrage).
"use strict";

// ⚠️ css/style.css > @keyframes kta-splash-trace : stroke-dasharray 1 2, stroke-dashoffset 1.01 → 0 sur un chemin
//    de longueur 1 ; la part visible du chemin vaut donc 1 − offset.
const DEPART = 1.01;

let _ctx = null;
let _canvas = null;
let _chemins = null;
let _longueurs = null;
let _rythme = null;
let _courbe = null;
let _vue = null;
let _taille = { largeur: 0, hauteur: 0, dpr: 1 };
let _debut = null;
let _finTrace = 0;
let _fini = false;
let _boucle = false;
let _bilanEnvoye = false;
const _images = [];

function _horloge() { return performance.timeOrigin + performance.now(); }
// Sans requestAnimationFrame dans le worker, un minuteur garde le tracé hors du fil principal.
const _prochaine = typeof self.requestAnimationFrame === "function"
  ? function (cb) { self.requestAnimationFrame(cb); }
  : function (cb) { setTimeout(cb, 16); };

// Courbe de Bézier CSS : x(t) inversé par Newton, puis dichotomie si la pente s'annule.
function _bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  function sx(t) { return ((ax * t + bx) * t + cx) * t; }
  function sy(t) { return ((ay * t + by) * t + cy) * t; }
  function dx(t) { return (3 * ax * t + 2 * bx) * t + cx; }
  return function (x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let bas = 0, haut = 1;
    t = x;
    for (let i = 0; i < 40 && haut - bas > 1e-7; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (x > v) bas = t; else haut = t;
      t = (bas + haut) / 2;
    }
    return sy(t);
  };
}

function _cumuls(c) {
  const l = [0];
  for (let j = 2; j < c.length; j += 2) {
    l.push(l[l.length - 1] + Math.hypot(c[j] - c[j - 2], c[j + 1] - c[j - 1]));
  }
  return l;
}

function _dimensionner(m) {
  _taille = { largeur: +m.largeur || 0, hauteur: +m.hauteur || 0, dpr: +m.dpr || 1 };
  _canvas.width = Math.max(1, Math.round(_taille.largeur * _taille.dpr));
  _canvas.height = Math.max(1, Math.round(_taille.hauteur * _taille.dpr));
}

function _instant() {
  if (_fini) return Infinity;
  return _debut === null ? -Infinity : _horloge() - _debut;
}

// Part f (0 → 1) du chemin i, depuis son premier point.
function _tracer(i, f) {
  const c = _chemins[i], l = _longueurs[i];
  const cible = f * l[l.length - 1];
  _ctx.beginPath();
  _ctx.moveTo(c[0], c[1]);
  for (let j = 1; j < l.length; j++) {
    if (l[j] <= cible) { _ctx.lineTo(c[2 * j], c[2 * j + 1]); continue; }
    const seg = l[j] - l[j - 1];
    const r = seg > 0 ? (cible - l[j - 1]) / seg : 0;
    _ctx.lineTo(c[2 * j - 2] + (c[2 * j] - c[2 * j - 2]) * r, c[2 * j - 1] + (c[2 * j + 1] - c[2 * j - 1]) * r);
    break;
  }
  _ctx.stroke();
}

function _dessiner(t) {
  _ctx.setTransform(1, 0, 0, 1, 0, 0);
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  if (!_taille.largeur || !_taille.hauteur) return;
  // Recadrage du viewBox en `meet` (xMidYMid), comme le SVG.
  const s = Math.min(_taille.largeur / _vue[2], _taille.hauteur / _vue[3]);
  const ox = (_taille.largeur - _vue[2] * s) / 2 - _vue[0] * s;
  const oy = (_taille.hauteur - _vue[3] * s) / 2 - _vue[1] * s;
  const k = _taille.dpr;
  _ctx.setTransform(k * s, 0, 0, k * s, k * ox, k * oy);
  _ctx.strokeStyle = _rythme.couleur;
  _ctx.lineWidth = _rythme.largeur;
  _ctx.lineCap = _rythme.bout;
  _ctx.lineJoin = _rythme.jonction;
  _ctx.globalAlpha = _rythme.opacite;
  for (let i = 0; i < _chemins.length; i++) {
    const p = (t - _rythme.delais[i]) / _rythme.duree;
    if (!(p > 0)) continue;
    const f = Math.min(1, DEPART * _courbe(p) - (DEPART - 1));
    if (f > 0 && _longueurs[i][_longueurs[i].length - 1] > 0) _tracer(i, f);
  }
}

function _bilan() {
  if (_bilanEnvoye) return;
  _bilanEnvoye = true;
  self.postMessage({ type: "bilan", debut: _debut, images: _images, pixels: [_canvas.width, _canvas.height] });
}

function _image() {
  if (_fini) { _boucle = false; return; }
  const t = _instant();
  _images.push(_horloge());
  _dessiner(t);
  if (t >= _finTrace) { _fini = true; _boucle = false; _bilan(); return; }
  _prochaine(_image);
}

function _lancer() {
  if (_boucle || _fini) return;
  _boucle = true;
  _prochaine(_image);
}

self.onmessage = function (ev) {
  const m = ev.data || {};
  try {
    if (m.type === "init") {
      _canvas = m.canvas;
      _ctx = _canvas.getContext("2d");
      if (!_ctx) throw new Error("contexte 2d indisponible");
      _chemins = m.chemins;
      _longueurs = _chemins.map(_cumuls);
      _rythme = m.rythme;
      _vue = m.vue;
      _courbe = _bezier.apply(null, _rythme.courbe);
      _finTrace = Math.max.apply(null, _rythme.delais) + _rythme.duree;
      _dimensionner(m);
      _dessiner(_instant());
      self.postMessage({ type: "pret" });
    } else if (m.type === "go") {
      if (_debut === null) _debut = m.debut;
      _lancer();
    } else if (m.type === "fin") {
      _fini = true;
      _dessiner(Infinity);
      _bilan();
    } else if (m.type === "taille") {
      _dimensionner(m);
      _dessiner(_instant());
    }
  } catch (e) {
    self.postMessage({ type: "echec", motif: String((e && e.message) || e) });
  }
};
