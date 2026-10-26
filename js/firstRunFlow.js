/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// FIRSTRUNFLOW.JS — Séquenceur des modales de premier lancement
// =========================
// Une FILE SÉQUENTIELLE jouée après le splash (sinon PIN, alerte et onboarding se superposent) : chaque étape
// attend la FERMETURE de la précédente. Ordre :
//   1. Alerte critique serveur (alert.json) : sécurité d'abord
//   2. Conditions d'utilisation + avertissement légal (filet)
//   3. Onboarding (1er lancement)
// Le PIN n'est jamais proposé au lancement (décision produit) : il s'active dans ⚙️ Configuration.
// Signaux de fin : AlertChecker.notifySplashEnded(onDone), LegalGate.ouvrirGate() → Promise, Tutorial.ouvrir(onClose).
// Appelé UNE FOIS par main.js après le retrait du splash. 100 % local.

(function() {
  "use strict";

  let _ran = false;

  // Promisifie un déclencheur « lancer + callback de fin ». Module absent ou étape non applicable : résolu tout de
  // suite (la file continue).
  function _step(label, fn) {
    return new Promise(function(resolve) {
      let done = false;
      const finish = function() {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        fn(finish);
      } catch(e) {
        console.warn("[FirstRunFlow] étape « " + label + " » a échoué :", e);
        finish();
      }
    });
  }

  // La file attend que les GATES DE BOOT (légale → unlock → PIN) soient TOUTES franchies : run() part ~500 ms après
  // le début du fondu du splash, potentiellement PENDANT une gate bloquante.
  // 🩸 Signal EXPLICITE (notifyBootGatesDone, appelé par main.js après le bloc des gates), pas un sondage du DOM :
  // entre deux gates il existe des fenêtres sans overlay (attente du check licence entre la gate légale et
  // l'UnlockGate) où un sondage croirait la voie libre. En temporisation (unlock / PIN), le signal n'arrive jamais :
  // la file ne démarre pas (voulu). Sondage du DOM gardé en second rideau après le signal.
  const _BOOT_GATES_SEL = "#kta-legal-gate-overlay, #kta-unlock-overlay, #kta-pin-gate-overlay";
  let _bootGatesDone = false;
  let _bootGatesWaiters = [];
  function notifyBootGatesDone() {
    _bootGatesDone = true;
    const w = _bootGatesWaiters;
    _bootGatesWaiters = [];
    w.forEach(function(r) { try { r(); } catch(e) {} });
  }
  function _attendreSignalGates() {
    if (_bootGatesDone) return Promise.resolve();
    return new Promise(function(resolve) { _bootGatesWaiters.push(resolve); });
  }
  function _attendreGatesBootDom() {
    return new Promise(function(resolve) {
      (function check() {
        if (!document.querySelector(_BOOT_GATES_SEL)) { resolve(); return; }
        setTimeout(check, 250);
      })();
    });
  }

  async function run() {
    if (_ran) return;
    _ran = true;

    await _attendreSignalGates();
    await _attendreGatesBootDom();

    const inIncognito = !!(window.IncognitoMode && window.IncognitoMode.active);

    // 1) Alerte critique serveur : notifySplashEnded pose _splashEnded ET affiche les alertes différées ; onDone à
    //    la fermeture de la modale (ou tout de suite s'il n'y a rien).
    await _step("alerte", function(done) {
      if (window.AlertChecker && typeof window.AlertChecker.notifySplashEnded === "function") {
        window.AlertChecker.notifySplashEnded(done);
      } else {
        done();
      }
    });

    // 2) Conditions d'utilisation : FILET seulement (la gate légale passe dans main.js AVANT l'UnlockGate) ; no-op
    //    si isAccepted(). Ignorée en incognito : localStorage y est simulé, le drapeau ne persisterait pas et la
    //    question reviendrait à chaque session (consultation possible depuis le pied de page).
    if (window.LegalGate && typeof window.LegalGate.ouvrirGate === "function"
        && !window.LegalGate.isAccepted() && !inIncognito) {
      try { await window.LegalGate.ouvrirGate(); }
      catch(e) { console.warn("[FirstRunFlow] LegalGate a échoué :", e); }
    }

    // 3) Onboarding (1er lancement seulement).
    await _step("onboarding", function(done) {
      if (window.Tutorial && typeof window.Tutorial.isFirstLaunch === "function"
          && window.Tutorial.isFirstLaunch()
          && typeof window.Tutorial.ouvrir === "function") {
        window.Tutorial.ouvrir(done);
      } else {
        done();
      }
    });

    console.log("[FirstRunFlow] Séquence de premier lancement terminée");
  }

  window.FirstRunFlow = { run: run, notifyBootGatesDone: notifyBootGatesDone };

  console.log("[FirstRunFlow] Module chargé");
})();
