/*!
 * MyKTAMap — voiceTts.js (E2 v1.34.18)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// VOICETTS — Lecture vocale des notes POI via Web Speech Synthesis API
// =========================
// E2 v1.34.18 — Complément de E1 (commande vocale Web Speech Recognition v1.34.0).
// E2 = sortie audio (lire les notes), E1 = entrée audio (commandes vocales).
//
// Cas d'usage : user sous terre, mains/yeux occupés → click bouton 🔊 dans
// popup POI = l'app lit la note à haute voix. Pas d'auto-lecture, mode
// strictement manuel (anti-pollution sonore + respecte le contexte cataphile).
//
// Stack : Web Speech Synthesis API native (0 dépendance). Voix système.
// Langue auto via navigator.language (FR/EN/autre selon browser de l'user).
//
// API publique :
//   window.VoiceTts.init()                  — auto-call au DOMContentLoaded
//   window.VoiceTts.isSupported()           — bool, false si API absente
//   window.VoiceTts.isSpeaking()            — bool, true si lecture en cours
//   window.VoiceTts.speak(text, opts)       — lance la lecture
//   window.VoiceTts.cancel()                — stop immédiat
//   window.VoiceTts.toggle(text, opts)      — play si stop, stop si play
//
// opts (optionnel) :
//   { lang: "fr-FR", rate: 1.0, pitch: 1.0, volume: 1.0 }
//
// Pièges iOS Safari (cf docs/architecture/gotchas.md à enrichir) :
//   - getVoices() peut renvoyer [] au boot, listener voiceschanged nécessaire.
//   - Doit être déclenché par un user gesture (click = OK).
//   - cancel() parfois inefficace sur iOS si lecture longue, fallback pause+cancel.
//   - Si app backgroundée, lecture s'arrête (comportement OS, on n'y peut rien).
// =========================

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
    // iOS Safari + Chrome : voices peuvent arriver async via voiceschanged.
    // On écoute pour mettre à jour _voices quand elles sont prêtes.
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

    // Cancel toute lecture en cours (override)
    cancel();

    const u = new SpeechSynthesisUtterance(str);

    // Langue : opts.lang > navigator.language > fallback fr-FR
    const lang = (opts && opts.lang) || navigator.language || "fr-FR";
    u.lang = lang;

    // Tente de matcher une voix avec la langue (ex: lang="fr-FR" → voix fr)
    // Match sur le préfixe court (fr, en, es...) pour tolérance régions.
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
      // L'erreur "canceled" arrive normalement quand on appelle cancel() →
      // pas la peine de bruiter la console.
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
      // iOS Safari : pause + cancel combo pour fiabilité (cancel seul parfois
      // inefficace, surtout si la lecture vient juste de démarrer).
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
      return false;  // = on a stoppé
    }
    speak(text, opts);
    return true;     // = on a démarré
  }

  // ========== ÉVÉNEMENTS ==========
  // Listeners pour permettre à l'UI de réagir aux changements d'état
  // (ex: changer l'icône bouton 🔊 ↔ ⏹️ pendant la lecture).
  const _listeners = [];
  function onStateChange(cb) {
    if (typeof cb === "function") _listeners.push(cb);
  }
  function _emitState(state) {
    _listeners.forEach(function(fn) {
      try { fn(state); } catch(e) { console.warn("[VoiceTts] listener throw :", e); }
    });
  }

  // ========== EXPORT API ==========
  TTS.init           = init;
  TTS.speak          = speak;
  TTS.cancel         = cancel;
  TTS.toggle         = toggle;
  TTS.isSpeaking     = isSpeaking;
  TTS.isSupported    = isSupported;
  TTS.onStateChange  = onStateChange;

  window.VoiceTts = TTS;

  // ========== AUTO-INIT ==========
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
