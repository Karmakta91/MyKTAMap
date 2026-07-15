/*!
 * MyKTAMap — Orchestrateur du premier lancement (v1.56.0)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// FIRSTRUNFLOW.JS — Séquenceur des modales de premier lancement (depuis v1.56.0)
// =========================
// Problème résolu : au 1er boot, la proposition PIN, l'alerte publique et
// l'onboarding se déclenchaient via 3 setTimeout non coordonnés → superposition
// (« spam de popups », première impression non pro).
//
// Solution : une FILE SÉQUENTIELLE jouée après le splash. Chaque étape attend la
// FERMETURE de la précédente avant de s'afficher. Ordre par priorité :
//   1. 🚨 Alerte critique serveur (si publiée dans alert.json)  — sécurité d'abord
//   2. ⚖️ Conditions d'utilisation + avertissement légal (bloquant, 1re fois)
//   3. 🎓 Onboarding (1er lancement)
//   4. 🔐 Proposition d'activation du PIN (le moins urgent → en dernier)
//
// Chaque module expose désormais un signal de fin (Promise / callback onClose) :
//   - AlertChecker.notifySplashEnded(onDone)
//   - LegalGate.ouvrirGate() → Promise
//   - Tutorial.ouvrir(onClose)
//   - MyKTAMapPinLock.proposerActivation(onClose)
//
// Appelé UNE FOIS par main.js juste après le retrait du splash.
// 100 % local, aucune surface réseau.
// =========================

(function() {
  "use strict";

  let _ran = false;

  // Promisifie un déclencheur « fire + callback de fin ». Si le module est
  // absent ou l'étape non applicable, résout immédiatement (la file continue).
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

  async function run() {
    if (_ran) return;
    _ran = true;

    const inIncognito = !!(window.IncognitoMode && window.IncognitoMode.active);

    // 1) 🚨 Alerte critique serveur (si une alerte est en attente).
    //    notifySplashEnded pose le flag _splashEnded ET affiche les alertes
    //    différées ; le onDone est appelé à la fermeture de la modale (ou
    //    immédiatement s'il n'y a rien à montrer).
    await _step("alerte", function(done) {
      if (window.AlertChecker && typeof window.AlertChecker.notifySplashEnded === "function") {
        window.AlertChecker.notifySplashEnded(done);
      } else {
        done();
      }
    });

    // 2) ⚖️ Conditions d'utilisation (bloquant, 1re fois).
    //    Skip en incognito : localStorage est shimé (le flag ne persiste pas)
    //    → sinon re-prompt à chaque session incognito (cf. même parti pris que
    //    la proposition PIN). L'accès reste possible en consultation (footer).
    if (window.LegalGate && typeof window.LegalGate.ouvrirGate === "function"
        && !window.LegalGate.isAccepted() && !inIncognito) {
      try { await window.LegalGate.ouvrirGate(); }
      catch(e) { console.warn("[FirstRunFlow] LegalGate a échoué :", e); }
    }

    // 3) 🎓 Onboarding (1er lancement uniquement).
    await _step("onboarding", function(done) {
      if (window.Tutorial && typeof window.Tutorial.isFirstLaunch === "function"
          && window.Tutorial.isFirstLaunch()
          && typeof window.Tutorial.ouvrir === "function") {
        window.Tutorial.ouvrir(done);
      } else {
        done();
      }
    });

    // 4) 🔐 Proposition d'activation du PIN (en dernier, le moins urgent).
    //    proposerActivation gère lui-même ses conditions de skip (déjà activé,
    //    déjà proposé, incognito) et appelle onClose dans tous les cas.
    await _step("proposition-pin", function(done) {
      if (window.MyKTAMapPinLock && typeof window.MyKTAMapPinLock.proposerActivation === "function") {
        window.MyKTAMapPinLock.proposerActivation(done);
      } else {
        done();
      }
    });

    console.log("[FirstRunFlow] Séquence de premier lancement terminée");
  }

  window.FirstRunFlow = { run: run };

  console.log("[FirstRunFlow] Module chargé");
})();
