/*!
 * MyKTAMap — Wake Lock API (écran toujours allumé)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// WAKELOCK.JS — Empêche l'écran de s'éteindre (depuis Karma_dev pending)
// =========================
// Utilise navigator.wakeLock.request("screen") pour empêcher l'écran de
// se mettre en veille quand l'user utilise l'app en cavité (ou en démo).
// Utile pour cataphile : pas de timeout d'écran qui force à débloquer
// son téléphone toutes les 30s en pleine progression.
//
// COMPATIBILITÉ :
//   ✅ Chrome 84+ (Android, PC)
//   ✅ Edge 84+
//   ✅ Safari iOS 16.4+ (PWA standalone)
//   ❌ Firefox (Bug 1589554, pas encore en 2026)
//   ❌ Safari < 16.4
//
// PERSISTANCE :
//   localStorage["myktamap_wake_lock_v1"] = "1" | "0" (default "0" = off)
//   Au boot du module, si "1" → tente d'acquire (peut échouer si user
//   gesture pas requis sur certains browsers — auto-retry au prochain
//   visibilitychange→visible).
//
// CYCLE DE VIE :
//   Le wakeLock est AUTO-RELEASE par le browser quand l'onglet devient
//   caché (visibilitychange→hidden). Donc le module re-acquire à chaque
//   visibilitychange→visible si l'user a activé l'option.
//
// API : window.WakeLock = {
//   init(),              // boot async (lit pref + applique si activée)
//   isSupported(),       // bool — API native dispo dans le browser
//   isActive(),          // bool — wake lock actuellement actif
//   isEnabled(),         // bool — préférence user activée (peut être true
//                           sans isActive si l'onglet est caché)
//   setEnabled(bool),    // active/désactive + persiste + acquire/release
//   onChange(cb)         // notifie les listeners au change d'état
// };
// =========================

(function() {
  "use strict";

  const LS_KEY = "myktamap_wake_lock_v1";

  let _enabled  = false;   // pref user (peut être true sans active si caché)
  let _sentinel = null;    // WakeLockSentinel actif (null si pas acquis)
  const _listeners = [];

  function isSupported() {
    return !!(navigator && "wakeLock" in navigator
              && navigator.wakeLock
              && typeof navigator.wakeLock.request === "function");
  }

  function isActive() {
    return _sentinel !== null;
  }

  function isEnabled() {
    return _enabled === true;
  }

  function _readPref() {
    try { return localStorage.getItem(LS_KEY) === "1"; }
    catch(e) { return false; }
  }

  function _writePref(v) {
    try { localStorage.setItem(LS_KEY, v ? "1" : "0"); }
    catch(e) {}
  }

  function _notify() {
    const state = { enabled: _enabled, active: isActive(), supported: isSupported() };
    _listeners.forEach(function(cb) {
      try { cb(state); } catch(e) {}
    });
  }

  async function _acquire() {
    if (!isSupported()) return false;
    if (_sentinel !== null) return true;  // déjà acquis
    try {
      _sentinel = await navigator.wakeLock.request("screen");
      // Hook release event (browser peut release sans demande — ex: batterie
      // critique, onglet caché). On reset notre sentinel pour permettre le
      // re-acquire automatique au visibilitychange→visible.
      _sentinel.addEventListener("release", function() {
        _sentinel = null;
        _notify();
      });
      _notify();
      return true;
    } catch(e) {
      console.warn("[WakeLock] _acquire échec :", e && e.message);
      _sentinel = null;
      _notify();
      return false;
    }
  }

  async function _release() {
    if (_sentinel === null) return;
    try {
      await _sentinel.release();
    } catch(e) {}
    _sentinel = null;
    _notify();
  }

  // 🩸 v1.85.2 — REND LE RESULTAT REEL. Avant, la fonction ne rendait rien :
  // l appelant affichait « 🔆 Ecran maintenu allume » sans savoir si le verrou
  // avait ete pose. Quand le navigateur refuse — pas de geste utilisateur,
  // batterie faible, ou implementation qui accepte puis ignore — l app MENTAIT.
  // C est ce mensonge qui a fait chercher la panne du mauvais cote.
  async function setEnabled(v) {
    const newVal = !!v;
    if (newVal === _enabled) return isActive();
    _enabled = newVal;
    _writePref(newVal);
    if (newVal) {
      const ok = await _acquire();
      if (!ok) _reprendreAuPremierGeste();
      return ok;
    }
    await _release();
    return false;
  }

  async function init() {
    _enabled = _readPref();
    if (_enabled && !document.hidden) {
      // Tente d'acquire au boot. Si l'app vient juste de boot, document
      // est visible → ok. Si caché ou si la pref demande user-gesture sur
      // certains browsers, on retentera au visibilitychange→visible.
      const ok = await _acquire();
      // Refuse faute de geste utilisateur : on arme le rattrapage au 1er tap.
      if (!ok) _reprendreAuPremierGeste();
    }
  }

  function onChange(cb) {
    if (typeof cb !== "function") return function() {};
    _listeners.push(cb);
    return function() {
      const i = _listeners.indexOf(cb);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  // ─── Reprise au PREMIER GESTE utilisateur ───
  // 🩸 Un `wakeLock.request()` au boot peut etre refuse faute de geste
  // utilisateur : au lancement a froid, personne ne bascule d onglet, donc le
  // filet `visibilitychange` ne se declenche jamais et la preference reste
  // lettre morte. Le premier tap sur l ecran sert de rattrapage. Une seule
  // fois : le listener se retire des qu il a servi.
  function _reprendreAuPremierGeste() {
    if (!_enabled || isActive()) return;
    const rattraper = function () {
      document.removeEventListener("pointerdown", rattraper, true);
      document.removeEventListener("touchstart", rattraper, true);
      if (_enabled && !isActive()) _acquire();
    };
    document.addEventListener("pointerdown", rattraper, true);
    document.addEventListener("touchstart", rattraper, true);
  }

  // ─── Re-acquire au retour visibility ───
  // Le wakeLock est auto-release par le browser quand l'onglet devient
  // caché. On le ré-acquire au retour si l'user l'avait activé.
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
      // Le browser a déjà release (ou va le faire). On reset le sentinel
      // pour cohérence (la release event fera le reset officiellement,
      // mais on est défensif au cas où il ne fire pas sur tous les browsers).
      _sentinel = null;
    } else if (_enabled && !isActive()) {
      // Onglet revenu visible + pref activée + plus de sentinel → re-acquire
      _acquire();
    }
  });

  // ─── EXPORT API ───
  window.WakeLock = {
    init:         init,
    isSupported:  isSupported,
    isActive:     isActive,
    isEnabled:    isEnabled,
    setEnabled:   setEnabled,
    onChange:     onChange
  };

  // Boot auto-init au load. Si la pref est "0" (default), no-op silencieux.
  // Si "1", _acquire() est tenté.
  init();

  console.log("[WakeLock] Module chargé — supported:", isSupported(), " pref enabled:", _readPref());
})();
