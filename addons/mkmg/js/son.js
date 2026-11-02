/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// addons/mkmg/js/son.js — sons de l'add-on « mkmg », fabriqués par WebAudio (aucun fichier, aucun réseau). Expose
// window.KtaAddons.mkmgSon = { demarrer(), arreter(), jouer(nom, force), coeur(proximite) }. Noms : tir, recharge,
// vide, ramasse, soin, blesse, grogne, mort, souffle, vague, fin.
// 🩸 Un navigateur ne joue rien avant un geste de l'utilisateur : demarrer() est appelé dans le geste qui lance la
// partie (bouton de la confirmation), sinon le contexte reste suspendu.
// Doc : docs/architecture/tracking.md § Greffe de la vue 3D

(function () {
  "use strict";

  let _ac = null, _maitre = null, _bruit = null, _coeur = null;

  function demarrer() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!_ac) {
      _ac = new AC();
      _maitre = _ac.createGain();
      _maitre.gain.value = 0.6;
      _maitre.connect(_ac.destination);
      // Une seconde de bruit blanc, réutilisée par tous les sons bruités.
      _bruit = _ac.createBuffer(1, _ac.sampleRate, _ac.sampleRate);
      const d = _bruit.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (_ac.state === "suspended") _ac.resume();
    return true;
  }

  function arreter() {
    coeur(0);
    if (_ac && _ac.state === "running") _ac.suspend();
  }

  // Enveloppe : montée en `a` s, tenue jusqu'à `d` s, extinction exponentielle.
  function _env(g, t, v, a, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  }

  function _bruite(t, filtre, freq, q, v, a, d, sortie) {
    const s = _ac.createBufferSource(), f = _ac.createBiquadFilter(), g = _ac.createGain();
    s.buffer = _bruit;
    f.type = filtre; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    _env(g, t, v, a, d);
    s.connect(f); f.connect(g); g.connect(sortie || _maitre);
    s.start(t, Math.random() * 0.5, d + 0.05);
    return f;
  }

  function _ton(t, type, f0, f1, v, a, d) {
    const o = _ac.createOscillator(), g = _ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d);
    _env(g, t, v, a, d);
    o.connect(g); g.connect(_maitre);
    o.start(t); o.stop(t + d + 0.05);
  }

  const SONS = {
    tir: function (t, k) {
      _bruite(t, "lowpass", 1800, 0.7, 0.9 * k, 0.003, 0.35);
      _ton(t, "sine", 120, 40, 0.8 * k, 0.003, 0.25);
    },
    recharge: function (t) {
      _bruite(t, "bandpass", 2500, 8, 0.4, 0.002, 0.05);
      _bruite(t + 0.18, "bandpass", 1800, 8, 0.5, 0.002, 0.06);
    },
    vide: function (t) { _bruite(t, "bandpass", 3200, 12, 0.3, 0.002, 0.04); },
    ramasse: function (t) { _ton(t, "triangle", 660, 990, 0.25, 0.005, 0.18); },
    soin: function (t) { _ton(t, "sine", 440, 880, 0.25, 0.02, 0.4); },
    blesse: function (t) {
      _bruite(t, "lowpass", 600, 1, 0.6, 0.005, 0.25);
      _ton(t, "sawtooth", 180, 90, 0.2, 0.005, 0.2);
    },
    grogne: function (t, k) {
      const f = _bruite(t, "bandpass", 220, 6, 0.35 * k, 0.15, 1.1);
      f.frequency.linearRampToValueAtTime(140, t + 1.1);
      _ton(t, "sawtooth", 70, 55, 0.08 * k, 0.2, 1.0);
    },
    mort: function (t) { _bruite(t, "lowpass", 400, 2, 0.5, 0.01, 0.7); },
    souffle: function (t) { _bruite(t, "bandpass", 900, 1.5, 0.25, 0.25, 0.9); },
    vague: function (t) {
      _ton(t, "triangle", 392, 392, 0.2, 0.01, 0.25);
      _ton(t + 0.18, "triangle", 523, 523, 0.22, 0.01, 0.4);
    },
    fin: function (t) {
      _ton(t, "sawtooth", 220, 55, 0.25, 0.05, 2.2);
      _bruite(t, "lowpass", 300, 1, 0.3, 0.3, 2.4);
    }
  };

  // force : 0 à 1 (distance pour un ennemi).
  function jouer(nom, force) {
    if (!_ac || _ac.state !== "running" || !SONS[nom]) return;
    const k = force === undefined ? 1 : Math.max(0.05, Math.min(1, force));
    try { SONS[nom](_ac.currentTime + 0.005, k); } catch (e) {
      console.warn("[Mkmg] son « " + nom + " » :", e.message);
    }
  }

  // Battement de cœur quand la silhouette approche : proximite 0 (rien) à 1 (sur soi), rythme et volume montent.
  function coeur(proximite) {
    clearTimeout(_coeur && _coeur.minuterie);
    if (!_ac || !(proximite > 0)) { _coeur = null; return; }
    _coeur = { p: proximite };
    const battre = function () {
      if (!_coeur || !_ac || _ac.state !== "running") return;
      const t = _ac.currentTime, v = 0.15 + 0.5 * _coeur.p;
      _ton(t, "sine", 60, 45, v, 0.01, 0.12);
      _ton(t + 0.16, "sine", 55, 40, v * 0.7, 0.01, 0.12);
      _coeur.minuterie = setTimeout(battre, 1100 - 650 * _coeur.p);
    };
    battre();
  }

  // Réglage de la proximité sans relancer le rythme (appelé à chaque image).
  function proximite(p) {
    if (!(p > 0)) { if (_coeur) coeur(0); return; }
    if (!_coeur) coeur(p); else _coeur.p = p;
  }

  window.KtaAddons = window.KtaAddons || {};
  window.KtaAddons.mkmgSon = { demarrer: demarrer, arreter: arreter, jouer: jouer, coeur: coeur, proximite: proximite };
})();
