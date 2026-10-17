/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// voiceTts.js — lecture à voix haute des notes POI (bouton 🔊 de la popup), Web Speech Synthesis,
// voix système. Jamais de lecture automatique (décision produit). Sortie audio ; l'entrée
// (commandes vocales) est voiceCommand.js.
// Expose : window.VoiceTts { init (auto au DOMContentLoaded), isSupported, isSpeaking,
//   speak(text, opts), cancel, toggle(text, opts) → true si démarré, onStateChange(cb) }
//   opts : { lang (défaut navigator.language), rate, pitch, volume }
// 🩸 iOS Safari : getVoices() peut rendre [] au boot (voiceschanged) ; il faut un geste
//   utilisateur ; cancel() seul est parfois inopérant (pause + cancel) ; l'arrière-plan coupe.

(function() {
  "use strict";

  const TTS = {};

  let _isSupported = false;
  let _voices = [];
  let _activeUtterance = null;
  let _initDone = false;

  function init() {
    if (_initDone) return;
    _initDone = true;

    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance === "undefined") {
      _isSupported = false;
      console.log("[VoiceTts] Web Speech Synthesis API non supportée par ce navigateur");
      return;
    }
    _isSupported = true;

    function _loadVoices() {
      _voices = window.speechSynthesis.getVoices() || [];
      if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
        console.log("[VoiceTts] " + _voices.length + " voix chargées");
      }
    }
    _loadVoices();
    // Les voix peuvent arriver plus tard (voiceschanged), iOS Safari et Chrome.
    if ("onvoiceschanged" in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = _loadVoices;
    }

    console.log("[VoiceTts] Module chargé (E2 v1.34.18 — TTS notes via Web Speech Synthesis). Supporté :", _isSupported);
  }

  function isSupported() {
    return _isSupported;
  }

  function isSpeaking() {
    return _isSupported && _activeUtterance !== null && window.speechSynthesis.speaking;
  }

  function speak(text, opts) {
    if (!_isSupported) return null;
    const str = String(text || "").trim();
    if (!str) return null;

    cancel();

    const u = new SpeechSynthesisUtterance(str);

    const lang = (opts && opts.lang) || navigator.language || "fr-FR";
    u.lang = lang;

    // Voix choisie sur le préfixe court (fr, en…) : tolère les variantes régionales.
    const langPrefix = lang.split("-")[0].toLowerCase();
    const matchingVoice = _voices.find(function(v) {
      return v.lang.toLowerCase().indexOf(langPrefix) === 0;
    });
    if (matchingVoice) u.voice = matchingVoice;

    u.rate   = (opts && typeof opts.rate   === "number") ? opts.rate   : 1.0;
    u.pitch  = (opts && typeof opts.pitch  === "number") ? opts.pitch  : 1.0;
    u.volume = (opts && typeof opts.volume === "number") ? opts.volume : 1.0;

    u.onend = function() {
      if (_activeUtterance === u) _activeUtterance = null;
      _emitState("ended");
    };
    u.onerror = function(e) {
      // "canceled" / "interrupted" suivent un cancel() normal : pas de bruit console.
      if (e && e.error !== "canceled" && e.error !== "interrupted") {
        console.warn("[VoiceTts] SpeechSynthesisUtterance error :", e.error || e);
      }
      if (_activeUtterance === u) _activeUtterance = null;
      _emitState("error");
    };
    u.onstart = function() {
      _emitState("started");
    };

    _activeUtterance = u;
    try {
      window.speechSynthesis.speak(u);
    } catch(e) {
      console.warn("[VoiceTts] speak() throw :", e);
      _activeUtterance = null;
      return null;
    }
    return u;
  }

  function cancel() {
    if (!_isSupported) return;
    try {
      // 🩸 iOS Safari : pause puis cancel, cancel seul rate parfois une lecture qui démarre.
      if (window.speechSynthesis.paused || window.speechSynthesis.speaking) {
        try { window.speechSynthesis.pause(); } catch(e) {}
        window.speechSynthesis.cancel();
      }
    } catch(e) {}
    _activeUtterance = null;
    _emitState("canceled");
  }

  function toggle(text, opts) {
    if (isSpeaking()) {
      cancel();
      return false;
    }
    speak(text, opts);
    return true;
  }

  // ── Événements (icône 🔊 ↔ ⏹️ de l'UI) ──────────────
  const _listeners = [];
  function onStateChange(cb) {
    if (typeof cb === "function") _listeners.push(cb);
  }
  function _emitState(state) {
    _listeners.forEach(function(fn) {
      try { fn(state); } catch(e) { console.warn("[VoiceTts] listener throw :", e); }
    });
  }

  TTS.init           = init;
  TTS.speak          = speak;
  TTS.cancel         = cancel;
  TTS.toggle         = toggle;
  TTS.isSpeaking     = isSpeaking;
  TTS.isSupported    = isSupported;
  TTS.onStateChange  = onStateChange;

  window.VoiceTts = TTS;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
