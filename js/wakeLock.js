/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// wakeLock.js — écran maintenu allumé (navigator.wakeLock.request("screen")) : pas de mise en veille en
// pleine progression. Absent de Firefox et de Safari < 16.4.
// Préférence : localStorage["myktamap_wake_lock_v1"] = "1" | "0" (défaut "0").
// Le navigateur relâche le verrou quand l'onglet se cache : il est repris au retour visible.
// Expose : window.WakeLock (init, isSupported, isActive, isEnabled — vrai même onglet caché,
//   setEnabled(bool) → Promise<bool> du résultat RÉEL, onChange(cb) → désabonnement).
// 🩸 Un verrou posé sans geste utilisateur peut être accepté puis ignoré (verrou fantôme) : on le repose au
// premier geste, cf init().
// Garde-fou : scripts/check-wakelock.js, scripts/check-journal-reprise.js

(function() {
  "use strict";

  const LS_KEY = "myktamap_wake_lock_v1";

  let _enabled  = false;   // préférence (vraie même sans verrou si l'onglet est caché)
  let _sentinel = null;    // WakeLockSentinel actif (null si pas acquis)
  let _reprises = 0;       // reprises consécutives après un relâchement système
  const MAX_REPRISES = 3;  // au-delà, on cesse d'insister et on attend un geste
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
      _reprises = 0;
      // 🩸 Le système peut relâcher TOUT SEUL (batterie, décision système) sans que l'onglet bouge : aucun
      // visibilitychange n'arrivera. On reprend donc ici, borné pour ne pas boucler contre un refus.
      _sentinel.addEventListener("release", function() {
        _sentinel = null;
        _notify();
        if (!_enabled || document.hidden) return;
        if (_reprises < MAX_REPRISES) {
          _reprises++;
          setTimeout(function() { if (_enabled && !isActive()) _acquire(); }, 400);
        } else {
          // Le système s'obstine : on attend le prochain geste, qui vaut autorisation fraîche.
          _reprendreAuPremierGeste();
        }
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

  // 🩸 Rend le résultat RÉEL : l'appelant n'annonce « écran maintenu allumé » qu'au vu de ce booléen, sinon
  // l'app ment quand le navigateur refuse (pas de geste, batterie faible).
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

  // 🩸 Verrou fantôme (PWA iOS) : posé au boot SANS geste utilisateur, il est accepté (request() résout,
  // isActive() vrai) puis IGNORÉ, sans erreur ni `release`. Indiscernable d'un vrai verrou, et _acquire()
  // sort aussitôt (sentinel en main) : plus aucune reprise. On refait donc nous-mêmes ce qui répare
  // (relâcher puis reprendre SOUS GESTE) au premier contact avec l'écran.
  async function init() {
    _enabled = _readPref();
    if (!_enabled) return;
    if (!document.hidden) {
      // Là où le verrou du boot tient vraiment, l'écran tient dès la première seconde.
      await _acquire();
    }
    // Reposé au premier geste QU'IL AIT L'AIR TENU OU NON : un sentinel en main ne prouve rien.
    _reprendreAuPremierGeste(true);
  }

  function onChange(cb) {
    if (typeof cb !== "function") return function() {};
    _listeners.push(cb);
    return function() {
      const i = _listeners.indexOf(cb);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  // ── Reprise au premier geste ──────────────
  // 🩸 Refusé au boot faute de geste : au lancement à froid aucun visibilitychange ne viendra, le premier tap
  // rattrape. L'écouteur se retire dès qu'il a servi. `forcer` : relâcher avant de reprendre, même sentinel
  // en main (verrou fantôme, cf init()).
  let _gesteArme = false;
  function _reprendreAuPremierGeste(forcer) {
    if (!_enabled) return;
    if (!forcer && isActive()) return;
    if (_gesteArme) return;              // un seul armement à la fois
    _gesteArme = true;
    const rattraper = async function () {
      document.removeEventListener("pointerdown", rattraper, true);
      document.removeEventListener("touchstart", rattraper, true);
      _gesteArme = false;
      if (!_enabled) return;
      if (forcer) await _release();
      const ok = await _acquire();
      // 🩸 Un refus ne condamne pas la préférence : réarmé pour le geste suivant.
      if (!ok) _reprendreAuPremierGeste(false);
    };
    document.addEventListener("pointerdown", rattraper, true);
    document.addEventListener("touchstart", rattraper, true);
  }

  // ── Retour au premier plan ──────────────
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
      // Relâché par le navigateur ; `release` ne se déclenche pas partout.
      _sentinel = null;
    } else if (_enabled) {
      // Même cas que le boot : un sentinel survivant peut être un fantôme → reprise FORCÉE au geste.
      _reprises = 0;
      if (!isActive()) _acquire();
      _reprendreAuPremierGeste(true);
    }
  });

  window.WakeLock = {
    init:         init,
    isSupported:  isSupported,
    isActive:     isActive,
    isEnabled:    isEnabled,
    setEnabled:   setEnabled,
    onChange:     onChange
  };

  // Auto-init au chargement (no-op si la préférence est "0") ; main.js le rappelle plus tard dans le boot.
  init();

  console.log("[WakeLock] Module chargé — supported:", isSupported(), " pref enabled:", _readPref());
})();
