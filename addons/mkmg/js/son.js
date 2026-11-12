/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// addons/mkmg/js/son.js — sons de l'add-on « mkmg », fabriqués par WebAudio (aucun fichier, aucun réseau). Expose
// window.KtaAddons.mkmgSon = { demarrer(), arreter(), reveiller(), jouer(nom, force, angle), coeur(intensite),
// proximite(intensite), ambiance(actif), etat() }. Noms : tir, pompe, recharge, vide, ramasse, soin, blesse, grogne,
// mort, vague, fin, pas, hurle, rugit, gresille, eclabousse, eboulis, goutte, pile.
// angle (degrés, 0 = devant, 90 = à droite) : le son vient de là (gauche / droite), étouffé quand il vient de derrière.
// 🩸 Un navigateur ne joue rien avant un geste de l'utilisateur : demarrer() est appelé dans le geste qui lance la
// partie. iOS suspend (« interrupted ») le son sur une notification, un appel, l'écran verrouillé : reveiller() le
// relance à chaque geste de la partie (le jeu l'appelle sur pointerdown / keydown / retour à l'écran).
// 🩸 arreter() ne suspend qu'après un délai : « Rejouer » enchaîne arrêt puis démarrage, et une suspension qui passait
// après la reprise (Safari) laissait la nouvelle partie muette.
// Doc : docs/architecture/addons.md

(function () {
  "use strict";

  let _ac = null, _maitre = null, _bruit = null, _coeur = null, _actif = false, _veille = null;
  let _dest = null, _fond = null;   // _dest : sortie du son en cours (situé), sinon _maitre
  // Fond : gouttes et éboulis lointains au hasard (s). Pas de respiration du joueur (décision produit).
  // 🩸 Un son répété à intervalle fixe se lit comme un bip ou un métronome : tout ce qui revient est tiré au hasard.
  const FOND = { goutte: [4, 11], eboulis: [25, 50] };
  const VEILLE_MS = 1500;   // délai avant de suspendre le son une fois la partie arrêtée

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
    _actif = true;
    clearTimeout(_veille);
    reveiller();
    return true;
  }

  function reveiller() {
    if (!_ac || !_actif || _ac.state === "running" || _ac.state === "closed") return;
    try { _ac.resume().catch(function () { /* pas de geste : réessayé au suivant */ }); } catch (e) { /* idem */ }
  }

  function arreter() {
    coeur(0);
    ambiance(false);
    _actif = false;
    clearTimeout(_veille);
    _veille = setTimeout(function () {
      if (!_actif && _ac && _ac.state === "running") _ac.suspend();
    }, VEILLE_MS);
  }

  function etat() { return { contexte: _ac ? _ac.state : null, actif: _actif }; }

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
    s.connect(f); f.connect(g); g.connect(sortie || _dest || _maitre);
    s.start(t, Math.random() * 0.5, d + 0.05);
    return f;
  }

  function _ton(t, type, f0, f1, v, a, d) {
    const o = _ac.createOscillator(), g = _ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d);
    _env(g, t, v, a, d);
    o.connect(g); g.connect(_dest || _maitre);
    o.start(t); o.stop(t + d + 0.05);
  }

  const SONS = {
    // Fusil à pompe : détonation grave et longue (claquement, souffle, queue qui roule dans la galerie).
    tir: function (t, k) {
      _bruite(t, "highpass", 2500, 0.7, 0.5 * k, 0.001, 0.04);
      const f = _bruite(t, "lowpass", 2400, 0.8, 1.0 * k, 0.002, 0.6);
      f.frequency.exponentialRampToValueAtTime(300, t + 0.5);
      _ton(t, "sine", 90, 32, 0.9 * k, 0.002, 0.4);
    },
    // Pompe : glissière tirée puis renvoyée (« tchk-tchak »), chaque course = frottement + choc métallique.
    pompe: function (t) {
      [[0.32, 1900, 0.35], [0.5, 2600, 0.45]].forEach(function (c) {
        _bruite(t + c[0], "bandpass", 1200, 2, 0.12, 0.005, 0.07);
        _bruite(t + c[0] + 0.06, "bandpass", c[1], 9, c[2], 0.001, 0.05);
        _ton(t + c[0] + 0.06, "square", 420, 380, 0.04, 0.001, 0.03);
      });
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
    vague: function (t) {
      _ton(t, "triangle", 392, 392, 0.2, 0.01, 0.25);
      _ton(t + 0.18, "triangle", 523, 523, 0.22, 0.01, 0.4);
    },
    fin: function (t) {
      _ton(t, "sawtooth", 220, 55, 0.25, 0.05, 2.2);
      _bruite(t, "lowpass", 300, 1, 0.3, 0.3, 2.4);
    },
    pas: function (t, k) {
      _bruite(t, "lowpass", 160 + Math.random() * 180, 0.7 + Math.random(), 0.25 * k * (0.7 + Math.random() * 0.6),
        0.004, 0.08 + Math.random() * 0.08);
    },
    hurle: function (t, k) {
      const f = _bruite(t, "bandpass", 700, 4, 0.5 * k, 0.08, 1.6);
      f.frequency.linearRampToValueAtTime(1300, t + 0.5);
      f.frequency.linearRampToValueAtTime(500, t + 1.6);
      _ton(t, "sawtooth", 330, 520, 0.12 * k, 0.1, 1.4);
    },
    rugit: function (t, k) {
      const f = _bruite(t, "lowpass", 300, 3, 0.7 * k, 0.2, 2.0);
      f.frequency.linearRampToValueAtTime(120, t + 2.0);
      _ton(t, "sawtooth", 55, 38, 0.25 * k, 0.25, 1.9);
    },
    // Présence de la silhouette : souffle sourd qui enfle, éclats de grésillement par-dessus ; durée, hauteur et
    // nombre d'éclats tirés au hasard à chaque fois.
    gresille: function (t, k) {
      const d = 1.1 + Math.random() * 0.9;
      const f = _bruite(t, "bandpass", 500 + Math.random() * 300, 1.2, 0.3 * k, d * 0.45, d);
      f.frequency.linearRampToValueAtTime(1100 + Math.random() * 500, t + d);
      for (let i = 3 + Math.floor(Math.random() * 5); i > 0; i--) {
        _bruite(t + Math.random() * d, "highpass", 4500, 0.7, 0.14 * k, 0.001, 0.012 + Math.random() * 0.02);
      }
    },
    eclabousse: function (t, k) {
      _bruite(t, "highpass", 1800 + Math.random() * 900, 0.8, 0.22 * k, 0.01, 0.18);
      _bruite(t + 0.05, "bandpass", 900, 2, 0.12 * k, 0.01, 0.12);
    },
    eboulis: function (t, k) {
      _bruite(t, "lowpass", 160, 1, 0.8 * k, 0.15, 2.6);
      for (let i = 0; i < 6; i++) {
        _bruite(t + 0.2 + Math.random() * 1.8, "bandpass", 500 + Math.random() * 900, 3, 0.25 * k, 0.005, 0.1);
      }
    },
    // Goutte : « plic » dont la hauteur MONTE très vite (une goutte qui tombe dans une flaque), puis son écho.
    goutte: function (t, k) {
      const f = 450 + Math.random() * 500, v = 0.045 * k, e = 0.14 + Math.random() * 0.12;
      _ton(t, "sine", f, f * (2.5 + Math.random()), v, 0.001, 0.045);
      _bruite(t, "highpass", 3000, 0.7, v * 0.25, 0.001, 0.015);
      _ton(t + e, "sine", f * 0.9, f * 2.4, v * 0.3, 0.001, 0.04);
    },
    pile: function (t) {
      _ton(t, "square", 880, 880, 0.08, 0.005, 0.06);
      _ton(t + 0.1, "square", 660, 660, 0.08, 0.005, 0.06);
    }
  };

  // Sortie située : panoramique gauche / droite et passe-bas quand le son vient de derrière (angle en degrés).
  // Sans StereoPanner (vieux Safari), le son reste au centre.
  function _situer(angle) {
    const a = angle * Math.PI / 180, f = _ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = Math.cos(a) < 0 ? 900 + 4000 * (1 + Math.cos(a)) : 12000;
    if (typeof _ac.createStereoPanner !== "function") { f.connect(_maitre); return f; }
    const pan = _ac.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, Math.sin(a) * 0.9));
    f.connect(pan); pan.connect(_maitre);
    return f;
  }

  // force : 0 à 1 (distance pour un ennemi) ; angle : d'où il vient (facultatif, sinon au centre).
  function jouer(nom, force, angle) {
    if (!_ac || _ac.state !== "running" || !SONS[nom]) return;
    const k = force === undefined ? 1 : Math.max(0.05, Math.min(1, force));
    try {
      _dest = Number.isFinite(angle) ? _situer(angle) : null;
      SONS[nom](_ac.currentTime + 0.005, k);
    } catch (e) {
      console.warn("[Mkmg] son « " + nom + " » :", e.message);
    } finally { _dest = null; }
  }

  // Bruits de fond (gouttes, éboulis lointains), au hasard et d'un côté ou de l'autre, tant que la partie dure.
  function ambiance(actif) {
    if (_fond) { clearTimeout(_fond.goutte); clearTimeout(_fond.eboulis); _fond = null; }
    if (!actif || !_ac) return;
    _fond = {};
    const hasard = function (b) { return (b[0] + Math.random() * (b[1] - b[0])) * 1000; };
    const goutte = function () {
      if (!_fond) return;
      jouer("goutte", 0.4 + Math.random() * 0.6, Math.random() * 360);
      _fond.goutte = setTimeout(goutte, hasard(FOND.goutte));
    };
    const eboulis = function () {
      if (!_fond) return;
      jouer("eboulis", 0.2 + Math.random() * 0.25, Math.random() * 360);
      _fond.eboulis = setTimeout(eboulis, hasard(FOND.eboulis));
    };
    _fond.goutte = setTimeout(goutte, hasard(FOND.goutte));
    _fond.eboulis = setTimeout(eboulis, hasard(FOND.eboulis));
  }

  // Battement de cœur : intensité 0 (rien) à 1 (à bout de souffle), rythme et volume montent avec elle.
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

  // Réglage de l'intensité sans relancer le rythme (appelé à chaque image).
  function proximite(p) {
    if (!(p > 0)) { if (_coeur) coeur(0); return; }
    if (!_coeur) coeur(p); else _coeur.p = p;
  }

  window.KtaAddons = window.KtaAddons || {};
  window.KtaAddons.mkmgSon = { demarrer: demarrer, arreter: arreter, reveiller: reveiller, jouer: jouer, coeur: coeur,
    proximite: proximite, ambiance: ambiance, etat: etat };
})();
