/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 🔐 PIN LOCK — Code d'accès local optionnel (v1.9.4-V1)
// =========================
// Couche perso optionnelle par-dessus UnlockGate (qui reste la barrière
// communautaire avec mdp partagé hardcodé, cf. CLAUDE.md §36).
//
// Modèle de sécurité honnête :
//   - PIN 4-6 chiffres → SHA-256(salt + pin) stocké en localStorage
//   - Salt random 16 bytes (b64) → empêche le rainbow-tabling trivial
//   - BARRIÈRE UX, PAS PSEUDO-CRYPTO : l'app étant 100% client-side,
//     un attaquant motivé bypass via DevTools (localStorage.clear() = 5s)
//   - Les données IDB (photos, sessions) ne sont PAS chiffrées (choix
//     6:a validé KARMA, cohérent avec la promesse "no fake security")
//   - Aucune recovery si oubli → reset complet requis (choix 4:a)
//
// Biométrie Face ID/Touch ID via WebAuthn :
//   - Si dispo (`PublicKeyCredential` + platform authenticator) →
//     l'user peut opter pour la biométrie à l'activation
//   - WebAuthn ici sert juste à "garder le PIN déchiffré côté client"
//     après une authentification biométrique réussie. C'est NOT une vraie
//     crypto serveur-side car on n'a pas de serveur.
//   - Fallback PIN automatique si WebAuthn indisponible ou refusé
//
// Lockout :
//   - 5 tentatives PIN échouées consécutives → verrou TEMPORISÉ, escaladé
//     10 min → 1 h → 6 h → 24 h (décision KARMA 13/09/2026, audit B7 : le
//     verrou définitif tuait l'app sous terre, hors réseau, plan compris)
//   - Stocké en localStorage["myktamap_pin_v1"].attempts
//   - Le verrou expire tout seul ; un code juste remet le compteur ET le
//     palier à zéro. Base de temps = Date.now() (horloge de l'appareil) : reculer
//     l'horloge sous le début du verrou ne l'ouvre pas, l'avancer le raccourcit —
//     accepté et documenté (security-legal.md §36.3)
//
// API publique :
//   window.MyKTAMapPinLock = {
//     isEnabled, isUnlocked, isLockedOut, getRemainingAttempts,
//     hasBiometric, isBiometricSupported,
//     enable(pin, useBiometric), disable(),
//     unlock(pin), unlockWithBiometric(),
//     changePin(newPin),
//     reset, ouvrirGate
//   };
// =========================

(function() {
  "use strict";

  const STORAGE_KEY      = "myktamap_pin_v1";
  const MAX_ATTEMPTS     = 5;
  // 🔒 M2 : paliers du verrou temporisé (ms). Palier = nombre de séries de
  // MAX_ATTEMPTS erreurs consécutives sans code juste entre deux.
  const LOCK_DELAYS_MS   = [10 * 60 * 1000, 60 * 60 * 1000, 6 * 3600 * 1000, 24 * 3600 * 1000];
  let _lockTimer = null;   // compte à rebours de l'écran de verrou
  // ⏳ Durée lisible pour le compte à rebours du verrou.
  function _fmtDuree(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return h + " h " + (m < 10 ? "0" + m : m) + " min";
    if (m > 0) return m + " min " + (sec < 10 ? "0" + sec : sec) + " s";
    return sec + " s";
  }
  const SALT_BYTES       = 16;
  const PIN_MIN          = 4;
  const PIN_MAX          = 6;
  // RP ID pour WebAuthn — domain courant (la spec exige rp.id == origin sans port)
  const WEBAUTHN_RP_NAME = "MyKTAMap";

  // État runtime
  let _unlocked = false;   // déverrouillé pour la session courante (in-memory)

  // ============================================================
  // STORAGE HELPERS
  // ============================================================
  function _getState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (typeof obj !== "object" || obj === null) return null;
      return obj;
    } catch(e) {
      console.warn("[PinLock] _getState parse error :", e);
      return null;
    }
  }

  function _setState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch(e) {
      console.warn("[PinLock] _setState save error :", e);
      return false;
    }
  }

  function _clearState() {
    try { localStorage.removeItem(STORAGE_KEY); }
    catch(e) { console.warn("[PinLock] _clearState error :", e); }
  }

  // ============================================================
  // CRYPTO HELPERS (SHA-256 + base64)
  // ============================================================
  function _bytesToB64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function _b64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function _randomBytes(n) {
    const bytes = new Uint8Array(n);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      // Fallback Math.random (très improbable sur les navigateurs cibles)
      for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }

  // SHA-256 du concat (salt + utf8(pin))
  function _hashPin(pin, saltB64) {
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error("crypto.subtle indispo"));
    }
    const saltBytes = _b64ToBytes(saltB64);
    const pinBytes = new TextEncoder().encode(String(pin));
    // Concat salt + pin
    const concat = new Uint8Array(saltBytes.length + pinBytes.length);
    concat.set(saltBytes, 0);
    concat.set(pinBytes, saltBytes.length);
    return window.crypto.subtle.digest("SHA-256", concat).then(function(hashBuf) {
      return _bytesToB64(new Uint8Array(hashBuf));
    });
  }

  // ============================================================
  // VALIDATION PIN INPUT
  // ============================================================
  function _validatePinInput(pin) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    if (typeof pin !== "string" && typeof pin !== "number") {
      return t("pin.err.notNumber");
    }
    const s = String(pin).trim();
    if (!/^\d+$/.test(s)) return t("pin.err.digitsOnly");
    if (s.length < PIN_MIN) return t("pin.err.tooShort", { min: PIN_MIN });
    if (s.length > PIN_MAX) return t("pin.err.tooLong", { max: PIN_MAX });
    return null;  // valide
  }

  // ============================================================
  // API : ÉTAT
  // ============================================================
  function isEnabled() {
    // 🕵️ v1.31.9-fix1 — Skip PIN/biométrie en mode incognito. KARMA :
    // "en mode incognito, on ne doit pas avoir la popup auth renforcé".
    // Cohérent avec le pattern : la session incognito est éphémère,
    // pas de hash PIN écrit en disque possible → le re-saisir à chaque
    // ouverture incognito n'apporte rien (pas d'auth = pas de protection
    // d'une session qui se vide au close). L'user peut toujours configurer
    // un PIN depuis la fenêtre principale qui restera actif là-bas.
    if (window.IncognitoMode && window.IncognitoMode.active) return false;
    const state = _getState();
    return !!(state && state.hashedPin && state.salt);
  }

  function isUnlocked() {
    return _unlocked;
  }

  // 🔒 M2 : verrouillé = un `lockUntil` dans le futur. Horloge reculée sous
  // le début du verrou → on reste verrouillé (contournement grossier écarté).
  function isLockedOut() {
    const state = _getState();
    if (!state || !state.lockUntil) return false;
    const now = Date.now();
    if (state.lockStart && now < state.lockStart) return true;
    return now < state.lockUntil;
  }
  function getLockRemainingMs() {
    const state = _getState();
    if (!state || !state.lockUntil) return 0;
    return Math.max(0, state.lockUntil - Date.now());
  }
  function _msgVerrou() {
    return window.I18n
      ? window.I18n.t("pin.err.lockoutTemp", { duree: _fmtDuree(getLockRemainingMs()) })
      : "pin.err.lockoutTemp";
  }

  function getRemainingAttempts() {
    const state = _getState();
    if (!state) return MAX_ATTEMPTS;
    return Math.max(0, MAX_ATTEMPTS - (state.attempts || 0));
  }

  function hasBiometric() {
    const state = _getState();
    return !!(state && state.hasBiometric && state.credentialId);
  }

  // ============================================================
  // BIOMÉTRIE — WebAuthn
  // ============================================================
  // Détection : WebAuthn dispo ET il existe un platform authenticator
  // (Face ID, Touch ID, Windows Hello, etc.) — pas juste roaming USB keys.
  function isBiometricSupported() {
    if (typeof window.PublicKeyCredential === "undefined") {
      return Promise.resolve(false);
    }
    // Méthode standard : isUserVerifyingPlatformAuthenticatorAvailable
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
      return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .catch(function() { return false; });
    }
    return Promise.resolve(false);
  }

  // Enregistre une credential biométrique pour le device courant.
  // Retourne Promise<credentialIdB64>. Le challenge est random côté client
  // (sans backend, on ne peut pas faire mieux — c'est un compromis assumé,
  // cf. comment d'en-tête).
  function _enregistrerBiometrie() {
    const challenge = _randomBytes(32);
    const userId    = _randomBytes(16);
    const options = {
      publicKey: {
        challenge: challenge,
        rp: {
          name: WEBAUTHN_RP_NAME
          // id non spécifié → le navigateur utilise location.hostname
        },
        user: {
          id:          userId,
          name:        "myktamap-user",
          displayName: "Utilisateur MyKTAMap"
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7  },  // ES256 (le plus courant)
          { type: "public-key", alg: -257 }  // RS256 (Windows Hello)
        ],
        authenticatorSelection: {
          // platform : intégré au device (Face ID, Touch ID, Windows Hello)
          // — pas une clé USB externe (= cross-platform)
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred"
        },
        timeout: 60000,
        attestation: "none"
      }
    };
    return navigator.credentials.create(options).then(function(cred) {
      if (!cred || !cred.rawId) {
        throw new Error("Aucune credential créée.");
      }
      return _bytesToB64(new Uint8Array(cred.rawId));
    });
  }

  // Vérifie une biométrie existante (au unlock).
  // Retourne Promise<bool>. Sans backend pour vérifier la signature,
  // on se contente du fait que le navigateur ait validé la biométrie
  // user-side. C'est suffisant pour notre niveau "barrière UX".
  function _verifierBiometrie(credentialIdB64) {
    if (!credentialIdB64) return Promise.resolve(false);
    const challenge = _randomBytes(32);
    let credIdBytes;
    try {
      credIdBytes = _b64ToBytes(credentialIdB64);
    } catch(e) {
      return Promise.resolve(false);
    }
    const options = {
      publicKey: {
        challenge: challenge,
        allowCredentials: [{
          id: credIdBytes,
          type: "public-key",
          transports: ["internal"]  // platform authenticator only
        }],
        userVerification: "required",
        timeout: 60000
      }
    };
    return navigator.credentials.get(options).then(function(assertion) {
      // Si on arrive ici, c'est que le navigateur a validé. Pas besoin de
      // vérifier la signature (no backend → pas de challenge tracking).
      return !!assertion;
    }).catch(function(e) {
      console.warn("[PinLock] biométrie échouée :", e);
      return false;
    });
  }

  // ============================================================
  // API : ENABLE
  // ============================================================
  // Active le PIN avec ou sans biométrie. Retourne Promise<bool>.
  function enable(pin, useBiometric) {
    const err = _validatePinInput(pin);
    if (err) return Promise.reject(new Error(err));

    const saltBytes = _randomBytes(SALT_BYTES);
    const saltB64   = _bytesToB64(saltBytes);

    return _hashPin(pin, saltB64).then(function(hashedPin) {
      const state = {
        hashedPin:    hashedPin,
        salt:         saltB64,
        attempts:     0,
        createdAt:    Date.now(),
        hasBiometric: false,
        credentialId: null
      };

      if (!useBiometric) {
        _setState(state);
        _unlocked = true;  // session courante déverrouillée
        return true;
      }

      // Biométrie demandée → tentative d'enregistrement WebAuthn
      return _enregistrerBiometrie().then(function(credId) {
        state.hasBiometric = true;
        state.credentialId = credId;
        _setState(state);
        _unlocked = true;
        return true;
      }).catch(function(e) {
        console.warn("[PinLock] enregistrement biométrie échoué :", e);
        // On garde le PIN sans biométrie (fallback)
        _setState(state);
        _unlocked = true;
        // On signale l'échec biométrie au caller pour qu'il puisse informer l'user
        const err = new Error("PIN activé sans biométrie : " + (e.message || e));
        err.pinActivatedWithoutBiometric = true;
        throw err;
      });
    });
  }

  // ============================================================
  // API : DISABLE
  // ============================================================
  // Désactive le PIN. Nécessite un PIN valide OU une biométrie valide
  // (pas de bypass DevTools sans warning console).
  function disable(pin) {
    if (!isEnabled()) return Promise.resolve(true);

    // Verrou temporisé actif → on attend la fin du délai
    if (isLockedOut()) {
      return Promise.reject(new Error(_msgVerrou()));
    }

    return unlock(pin).then(function(ok) {
      if (!ok) throw new Error(window.I18n ? window.I18n.t("pin.err.incorrect") : "pin.err.incorrect");
      _clearState();
      _unlocked = false;
      return true;
    });
  }

  // ============================================================
  // API : UNLOCK PIN
  // ============================================================
  function unlock(pin) {
    if (!isEnabled()) {
      _unlocked = true;
      return Promise.resolve(true);
    }
    if (isLockedOut()) {
      return Promise.reject(new Error(_msgVerrou()));
    }
    const state = _getState();
    if (!state) {
      _unlocked = true;
      return Promise.resolve(true);
    }
    return _hashPin(pin, state.salt).then(function(candidate) {
      if (candidate === state.hashedPin) {
        // Reset compteur tentatives + palier de verrou + flag unlocked
        state.attempts  = 0;
        state.lockLevel = 0;
        delete state.lockUntil;
        delete state.lockStart;
        _setState(state);
        _unlocked = true;
        return true;
      }
      // 🏷️ ancre:pin-tentative-ratee
      // Tentative ratée → incrémente compteur ; à MAX_ATTEMPTS, verrou
      // temporisé au palier suivant et compteur remis à zéro (M2).
      state.attempts = (state.attempts || 0) + 1;
      if (state.attempts >= MAX_ATTEMPTS) {
        const lvl   = state.lockLevel || 0;
        const delai = LOCK_DELAYS_MS[Math.min(lvl, LOCK_DELAYS_MS.length - 1)];
        state.lockLevel = lvl + 1;
        state.lockStart = Date.now();
        state.lockUntil = state.lockStart + delai;
        state.attempts  = 0;
        console.warn("[PinLock] Verrou temporisé :", _fmtDuree(delai), "(palier", state.lockLevel + ")");
      }
      _setState(state);
      return false;
    });
  }

  // ============================================================
  // API : UNLOCK BIOMÉTRIE
  // ============================================================
  function unlockWithBiometric() {
    if (!hasBiometric()) {
      return Promise.reject(new Error(window.I18n ? window.I18n.t("pin.err.bioNotConfigured") : "pin.err.bioNotConfigured"));
    }
    const state = _getState();
    if (!state) return Promise.resolve(false);
    return _verifierBiometrie(state.credentialId).then(function(ok) {
      if (ok) {
        // Reset compteur tentatives + flag unlocked
        state.attempts = 0;
        _setState(state);
        _unlocked = true;
      }
      // ⚠️ Une biométrie ratée ne compte PAS dans `attempts` (la spec
      // WebAuthn gère son propre lockout natif du device, on ne veut pas
      // que les user qui annulent par accident augmentent le compteur PIN).
      return ok;
    });
  }

  // ============================================================
  // API : CHANGE PIN
  // ============================================================
  // L'user doit déjà être unlocked (via PIN ou biométrie) au moment où
  // il appelle changePin (= 9:b validé KARMA). Cette fonction ne reverif
  // pas l'ancien PIN — la garde est posée par l'UI qui appelle unlock()
  // avant d'autoriser le changement.
  function changePin(newPin) {
    const t = function(k) { return window.I18n ? window.I18n.t(k) : k; };
    if (!_unlocked) {
      return Promise.reject(new Error(t("pin.err.sessionLocked")));
    }
    if (!isEnabled()) {
      return Promise.reject(new Error(t("pin.err.notEnabled")));
    }
    const err = _validatePinInput(newPin);
    if (err) return Promise.reject(new Error(err));

    const state = _getState();
    if (!state) return Promise.reject(new Error(t("pin.err.stateMissing")));

    // On régénère un sel pour ne pas pouvoir corréler les hashes successifs
    const newSaltBytes = _randomBytes(SALT_BYTES);
    const newSaltB64   = _bytesToB64(newSaltBytes);
    return _hashPin(newPin, newSaltB64).then(function(newHash) {
      state.hashedPin = newHash;
      state.salt      = newSaltB64;
      state.attempts  = 0;
      state.updatedAt = Date.now();
      _setState(state);
      return true;
    });
  }

  // ============================================================
  // API : RESET (utilisé par viderCacheAppli, pas l'user direct)
  // ============================================================
  function reset() {
    _clearState();
    _unlocked = false;
  }

  // ============================================================
  // API : OUVRIR GATE (UI plein écran)
  // ============================================================
  // Wrapper async qui :
  //   1. Si pas activé → résout immédiatement
  //   2. Si lockout → affiche le screen lockout (ne résout JAMAIS)
  //   3. Sinon affiche la modale PIN/biométrie, résout au unlock
  //
  // L'UI est dans une fonction séparée _afficherGateUI exposée à part
  // pour pouvoir mocker en test. La logique flow est ici.
  function ouvrirGate() {
    if (!isEnabled()) {
      _unlocked = true;
      return Promise.resolve(true);
    }
    if (_unlocked) return Promise.resolve(true);

    return new Promise(function(resolve) {
      window.MyKTAMapPinLock._afficherGateUI(function() {
        // Callback appelé quand unlock réussi (PIN ou biométrie)
        resolve(true);
      });
      // En cas de verrou temporisé, l'écran de verrou repasse au pavé à
      // l'expiration et le callback finit par être appelé (M2, 13/09/2026).
    });
  }

  // ============================================================
  // UI GATE — modale plein écran (keypad + biométrie + lockout)
  // ============================================================
  // Style cohérent avec UnlockGate :
  //   - Overlay plein écran sombre #0a0d18
  //   - Boîte centrée avec ⚠️/✓ icone + titre + saisie + erreur + boutons
  //   - Si lockout : screen rouge sans bouton de sortie (force reset)
  //
  // Saisie PIN : `●●●●` dynamique (8:b = visible 0.5s puis masqué).
  // Keypad custom 3×4 (0-9 + ← + ✓) pour mobile (clavier numérique
  // natif ne marche pas toujours bien en PWA).
  function _afficherGateUI(onUnlock) {
    if (isLockedOut()) {
      _afficherLockoutUI(onUnlock);
      return;
    }

    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const remaining = getRemainingAttempts();
    const useBio    = hasBiometric();

    const overlay = document.createElement("div");
    overlay.id        = "kta-pin-gate-overlay";
    overlay.className = "kta-pin-gate-overlay";
    // 🆕 v1.10.0-hotfix3 (KARMA "je n'ai plus le bouton valider quand je
    // saisis le code") : restructure du keypad. Avant : 3×4 avec bio + 0
    // + ⌫ en dernière rangée → pas de bouton ✓ Valider tactile, l'user
    // qui saisit 4-5 chiffres n'avait que la touche Enter clavier (KO mobile).
    // Maintenant :
    //   - Bouton bio standalone AU-DESSUS du keypad (plus visible + gros)
    //   - Keypad 3×4 avec dernière rangée ⌫ / 0 / ✓
    //   - ✓ activable dès PIN_MIN (4) chiffres, désactivé sinon
    overlay.innerHTML =
      '<div class="kta-pin-gate-box">' +
        '<div class="kta-pin-gate-icon">🔐</div>' +
        '<div class="kta-pin-gate-titre">' + t("pin.gate.titre") + '</div>' +
        '<div class="kta-pin-gate-soustitre">' + t("pin.gate.soustitre") + '</div>' +
        '<div class="kta-pin-gate-dots" id="kta-pin-dots"></div>' +
        '<div class="kta-pin-gate-err" id="kta-pin-err" style="display:none;"></div>' +
        '<div class="kta-pin-gate-attempts" id="kta-pin-attempts">' + t("pin.gate.attempts", { n: remaining }) + '</div>' +
        (useBio
          ? '<button class="kta-pin-gate-bio-btn" id="kta-pin-bio" title="' + t("pin.gate.bioTitle") + '">' +
              t("pin.gate.bioBtn") +
            '</button>'
          : '') +
        '<div class="kta-pin-gate-keypad">' +
          _keypadKey("1") + _keypadKey("2") + _keypadKey("3") +
          _keypadKey("4") + _keypadKey("5") + _keypadKey("6") +
          _keypadKey("7") + _keypadKey("8") + _keypadKey("9") +
          '<button class="kta-pin-gate-key kta-pin-gate-key-erase" id="kta-pin-erase" title="' + t("pin.gate.eraseTitle") + '">⌫</button>' +
          _keypadKey("0") +
          '<button class="kta-pin-gate-key kta-pin-gate-key-validate" id="kta-pin-validate" title="' + t("pin.gate.validateTitle") + '" disabled>✓</button>' +
        '</div>' +
        // 🆕 v1.28.1 — Accès doc utilisateur depuis l'écran PIN. Cas d'usage :
        // un user qui hésite à activer le PIN, l'a activé puis oublié à quoi
        // ça sert, ou qui veut se renseigner avant de saisir. L'onboarding
        // (🎓) est masqué côté modale doc — sans accès à l'app, pas de sens.
        '<button type="button" id="kta-pin-readme-btn" class="kta-gate-readme-btn" title="' + t("pin.gate.docTitle") + '">' +
          t("pin.gate.docBtn") +
        '</button>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    let buffer = "";  // chiffres saisis (in-memory uniquement, jamais loggé)
    let _lastDigitTimer = null;

    function _refreshDots() {
      const dotsEl = document.getElementById("kta-pin-dots");
      if (!dotsEl) return;
      // 6 emplacements max. Affiche ● pour chaque chiffre saisi, ○ pour vide.
      // Pattern 8:b : le dernier chiffre est visible 0.5s puis devient ●.
      let html = "";
      for (let i = 0; i < PIN_MAX; i++) {
        const filled = i < buffer.length;
        if (filled) {
          const isLast = (i === buffer.length - 1) && _lastDigitTimer;
          if (isLast) {
            // Affiche le chiffre brièvement
            html += '<span class="kta-pin-dot kta-pin-dot-filled kta-pin-dot-visible">' + buffer[i] + '</span>';
          } else {
            html += '<span class="kta-pin-dot kta-pin-dot-filled">●</span>';
          }
        } else {
          html += '<span class="kta-pin-dot">○</span>';
        }
      }
      dotsEl.innerHTML = html;
      // 🆕 v1.10.0-hotfix3 : enable/disable du bouton ✓ Valider selon buffer
      const validateBtn = document.getElementById("kta-pin-validate");
      if (validateBtn) {
        validateBtn.disabled = (buffer.length < PIN_MIN);
      }
    }

    function _showErr(msg) {
      const el = document.getElementById("kta-pin-err");
      if (el) {
        el.textContent = msg || "";
        el.style.display = msg ? "block" : "none";
      }
    }

    function _refreshAttempts() {
      const el = document.getElementById("kta-pin-attempts");
      if (el) {
        const rem = getRemainingAttempts();
        el.textContent = t("pin.gate.attempts", { n: rem });
        if (rem <= 2) el.classList.add("kta-pin-gate-attempts-warn");
      }
    }

    function _tryUnlock() {
      if (buffer.length < PIN_MIN) {
        _showErr(t("pin.gate.errTooShort", { min: PIN_MIN }));
        return;
      }
      _showErr("");
      const pinTry = buffer;
      buffer = "";  // reset buffer immédiat (sécurité in-memory)
      _refreshDots();
      unlock(pinTry).then(function(ok) {
        if (ok) {
          // Cleanup + résolution
          overlay.remove();
          document.removeEventListener("keydown", _onKeyDown);
          console.log("[PinLock] Déverrouillé via PIN");
          if (typeof onUnlock === "function") onUnlock();
        } else {
          _refreshAttempts();
          if (isLockedOut()) {
            overlay.remove();
            document.removeEventListener("keydown", _onKeyDown);
            _afficherLockoutUI(onUnlock);
            return;
          }
          const rem = getRemainingAttempts();
          _showErr(t("pin.gate.errIncorrect", { n: rem }));
        }
      }).catch(function(e) {
        console.error("[PinLock] unlock erreur :", e);
        _showErr(t("pin.gate.errInternal", { err: (e.message || e) }));
      });
    }

    function _onDigit(d) {
      if (buffer.length >= PIN_MAX) return;
      buffer += d;
      // Pattern 8:b : visible 0.5s puis ●
      if (_lastDigitTimer) clearTimeout(_lastDigitTimer);
      _lastDigitTimer = setTimeout(function() {
        _lastDigitTimer = null;
        _refreshDots();
      }, 500);
      _refreshDots();
      // Auto-submit si pile MAX chiffres ? Non — l'user peut faire 4 ou 5
      // ou 6 chiffres, on attend qu'il valide via ⏎ ou tape un 7e qui
      // est ignoré. Mais si exact MAX, on tente direct.
      if (buffer.length === PIN_MAX) {
        // Petit délai pour que l'user voie le dernier chiffre brièvement
        setTimeout(_tryUnlock, 200);
      }
    }

    function _onErase() {
      if (buffer.length === 0) return;
      buffer = buffer.slice(0, -1);
      if (_lastDigitTimer) { clearTimeout(_lastDigitTimer); _lastDigitTimer = null; }
      _refreshDots();
    }

    function _onBio() {
      _showErr("");
      unlockWithBiometric().then(function(ok) {
        if (ok) {
          overlay.remove();
          document.removeEventListener("keydown", _onKeyDown);
          console.log("[PinLock] Déverrouillé via biométrie");
          if (typeof onUnlock === "function") onUnlock();
        } else {
          _showErr(t("pin.gate.bioRefused"));
        }
      }).catch(function(e) {
        console.warn("[PinLock] biométrie erreur :", e);
        _showErr(t("pin.gate.bioUnavailable"));
      });
    }

    // Bind handlers keypad
    overlay.querySelectorAll(".kta-pin-gate-key[data-digit]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        _onDigit(btn.dataset.digit);
      });
    });
    const eraseBtn = document.getElementById("kta-pin-erase");
    if (eraseBtn) eraseBtn.addEventListener("click", _onErase);
    const bioBtn = document.getElementById("kta-pin-bio");
    if (bioBtn) bioBtn.addEventListener("click", _onBio);
    // 🆕 v1.10.0-hotfix3 : bouton ✓ Valider explicite (activé dès PIN_MIN chiffres)
    const validateBtn = document.getElementById("kta-pin-validate");
    if (validateBtn) validateBtn.addEventListener("click", _tryUnlock);
    // 🆕 v1.28.1 : bouton 📖 Documentation. Ouvre la modale Doc README
    // (sans bouton Tutoriel — incohérent en contexte verrouillé) au-dessus
    // de la gate via z-index 100200 (cf css kta-readme-over-locker).
    const docBtn = document.getElementById("kta-pin-readme-btn");
    if (docBtn) {
      docBtn.addEventListener("click", function() {
        if (typeof window.afficherReadme === "function") {
          window.afficherReadme({ hideOnboarding: true, overLocker: true });
        } else {
          console.warn("[PinLock] afficherReadme indisponible (interface.js pas encore chargé)");
        }
      });
    }

    // Clavier physique (PC + clavier Bluetooth mobile)
    function _onKeyDown(e) {
      if (/^[0-9]$/.test(e.key)) {
        _onDigit(e.key);
        e.preventDefault();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        _onErase();
        e.preventDefault();
      } else if (e.key === "Enter") {
        _tryUnlock();
        e.preventDefault();
      } else if (e.key === "Escape") {
        // On NE PERMET PAS Escape : l'user est censé saisir son code,
        // pas annuler la gate. Cohérent avec UnlockGate.
        e.preventDefault();
      }
    }
    document.addEventListener("keydown", _onKeyDown);

    // Auto-tentative biométrie au boot si configurée
    // (= UX iOS : Face ID demandé directement sans clic explicite)
    if (useBio) {
      // Petit délai pour laisser la modale apparaître avant le prompt biométrique
      setTimeout(_onBio, 400);
    }

    _refreshDots();
    _refreshAttempts();
  }

  // Bouton du keypad — helper pour générer le HTML
  function _keypadKey(digit) {
    return '<button class="kta-pin-gate-key" data-digit="' + digit + '">' + digit + '</button>';
  }

  // Écran de verrou TEMPORISÉ (M2, 13/09/2026). Avant : « 5 codes incorrects →
  // l'app est verrouillée définitivement », sans bouton de sortie, la Promise
  // de la gate restant en attente pour toujours ; « réinstaller » ou
  // « Instagram » sont impossibles à 30 m sous terre. Désormais : compte à
  // rebours, et à l'expiration le pavé revient tout seul (`onUnlock` est
  // repassé à _afficherGateUI, la Promise de ouvrirGate résout au bon code).
  function _afficherLockoutUI(onUnlock) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    // Cleanup une éventuelle gate précédente
    const old = document.getElementById("kta-pin-gate-overlay");
    if (old) old.remove();
    if (_lockTimer) { clearInterval(_lockTimer); _lockTimer = null; }

    const overlay = document.createElement("div");
    overlay.id        = "kta-pin-gate-overlay";
    overlay.className = "kta-pin-gate-overlay kta-pin-gate-overlay-lockout";
    overlay.innerHTML =
      '<div class="kta-pin-gate-box kta-pin-gate-box-lockout">' +
        '<div class="kta-pin-gate-icon">⏳</div>' +
        '<div class="kta-pin-gate-titre">' + t("pin.lockout.titre") + '</div>' +
        '<div class="kta-pin-gate-soustitre">' +
          t("pin.lockout.soustitre") +
        '</div>' +
        '<div class="kta-pin-gate-lockout-explication">' +
          '<p>' + t("pin.lockout.attente") + '</p>' +
          '<div class="kta-pin-gate-countdown" id="kta-pin-lock-countdown">' + _fmtDuree(getLockRemainingMs()) + '</div>' +
          '<p style="font-style:italic; color:#8892a4; margin-top:10px;">' +
          t("pin.lockout.escalade") + '</p>' +
          // 🆕 v1.28.1 — Accès doc utilisateur même en lockout. Aide l'user
          // perdu à comprendre ce qu'est l'app avant de réinstaller / contacter.
          // Ouverture par-dessus le lockeur via z-index 100200 (cf css
          // .kta-readme-over-locker). Ne change rien au verrouillage.
          '<button type="button" id="kta-pin-readme-btn-lockout" class="kta-gate-readme-btn" style="margin-top:14px;" title="' + t("pin.gate.docTitle") + '">' +
            t("pin.gate.docBtn") +
          '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    // Bind du bouton 📖 (HTML vient d'être injecté).
    const docBtnLockout = document.getElementById("kta-pin-readme-btn-lockout");
    if (docBtnLockout) {
      docBtnLockout.addEventListener("click", function() {
        if (typeof window.afficherReadme === "function") {
          window.afficherReadme({ hideOnboarding: true, overLocker: true });
        }
      });
    }
    // ⏳ Compte à rebours ; à l'expiration, retour au pavé (même callback).
    _lockTimer = setInterval(function() {
      if (!isLockedOut()) {
        clearInterval(_lockTimer); _lockTimer = null;
        overlay.remove();
        _afficherGateUI(onUnlock);
        return;
      }
      const cd = document.getElementById("kta-pin-lock-countdown");
      if (cd) cd.textContent = _fmtDuree(getLockRemainingMs());
    }, 1000);
    console.warn("[PinLock] Verrou temporisé actif — reste", _fmtDuree(getLockRemainingMs()));
  }

  // 🏷️ ancre:pin-fin-lockout-ui
  // ============================================================
  // PROPOSITION D'ACTIVATION (v1.10.0 — post-update one-shot)
  // ============================================================
  // KARMA "après cette mise à jour, premier lancement, proposer activer
  // l'authentification forte, expliquer la possibilité de le faire via
  // configuration, si refus, pas reproposer (doit passer par configuration)"
  //
  // Stratégie :
  //   - Affiché UNIQUEMENT si PIN pas activé ET flag jamais set
  //   - 2 boutons : "🔐 Activer maintenant" (ouvre la modale Configuration
  //     et focus la section PIN) OU "Plus tard / Non merci" (set le flag,
  //     ne propose plus jamais)
  //   - L'user qui change d'avis doit aller dans ⚙️ Configuration manuellement
  //
  // Appelé depuis main.js après lancerApplication() pour ne pas masquer
  // le splash + ne pas bloquer le boot.
  const PROPOSAL_FLAG = "myktamap_pin_proposal_done_v1";

  function isProposalDone() {
    try { return localStorage.getItem(PROPOSAL_FLAG) === "1"; }
    catch(e) { return false; }
  }

  function markProposalDone() {
    try { localStorage.setItem(PROPOSAL_FLAG, "1"); }
    catch(e) { console.warn("[PinLock] markProposalDone :", e); }
  }

  function proposerActivation(onClose) {
    // 🆕 v1.56.0 — onClose : signal de fin pour le séquenceur de premier
    // lancement (js/firstRunFlow.js). Appelé dans TOUS les cas (skip inclus)
    // pour que la file continue. Le délai interne de 800 ms est supprimé : le
    // séquenceur garantit qu'aucune autre modale n'est ouverte à ce moment.
    const _done = (typeof onClose === "function") ? onClose : function() {};
    // 🕵️ v1.31.10-fix1 — Skip aussi la PROPOSITION d'activation en
    // incognito (modale "🔐 Authentification renforcée disponible").
    // KARMA bug : "J'ai toujours la popup authentification renforcé au
    // chargement de incognito". L'écran que KARMA voyait n'était pas le
    // gate PinLock (déjà skippé par isEnabled() en v1.31.9-fix1), mais
    // la PROPOSITION qui est appelée au boot quand PIN pas encore activé.
    // En incognito, isProposalDone() lit la clé PROPOSAL_FLAG qui n'est
    // PAS dans la whitelist → retourne null → considère "pas encore
    // proposé" → modale s'affichait à chaque boot incognito.
    if (window.IncognitoMode && window.IncognitoMode.active) { _done(); return; }
    // Skip si PIN déjà activé OU déjà proposé une fois
    if (isEnabled()) { _done(); return; }
    if (isProposalDone()) { _done(); return; }

    _afficherModaleProposition(_done);
  }

  function _afficherModaleProposition(onClose) {
    const _done = (typeof onClose === "function") ? onClose : function() {};
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const overlay = document.createElement("div");
    overlay.id        = "kta-pin-proposal-overlay";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-pin-proposal-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + t("pin.proposal.titre") + '</span>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="font-size:14px; line-height:1.55; color:#e8eaf0; margin:0 0 14px 0;">' +
            t("pin.proposal.intro") +
          '</p>' +
          '<div class="kta-pin-proposal-info">' +
            '<div class="kta-pin-proposal-info-titre">' + t("pin.proposal.usageTitre") + '</div>' +
            '<p>' + t("pin.proposal.usageDesc") + '</p>' +
          '</div>' +
          '<div class="kta-pin-proposal-info" style="background:rgba(244,197,66,0.06); border-color:rgba(244,197,66,0.25);">' +
            '<div class="kta-pin-proposal-info-titre" style="color:#f4c542;">' + t("pin.proposal.warnTitre") + '</div>' +
            '<ul style="margin:6px 0 0 18px; padding:0; line-height:1.5; color:#c8d0e0; font-size:13px;">' +
              '<li>' + t("pin.proposal.warnNoRecovery") + '</li>' +
              '<li>' + t("pin.proposal.warnLockout") + '</li>' +
              '<li>' + t("pin.proposal.warnBarrier") + '</li>' +
            '</ul>' +
          '</div>' +
          '<p style="font-size:12.5px; color:#8892a4; margin:14px 0 0 0; line-height:1.5; font-style:italic;">' +
            t("pin.proposal.laterHint") +
          '</p>' +
        '</div>' +
        '<div class="kta-conv-actions" style="padding:14px 24px 18px; gap:10px;">' +
          '<button class="kta-btn kta-btn-ghost" id="kta-pin-proposal-non" type="button">' +
            t("pin.proposal.btnNo") +
          '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-pin-proposal-oui" type="button" ' +
            'style="background:rgba(244,197,66,0.18); border-color:rgba(244,197,66,0.5); color:#f4c542;">' +
            t("pin.proposal.btnYes") +
          '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    let _closed = false;
    function _close() {
      try { overlay.remove(); } catch(e) {}
      if (!_closed) { _closed = true; try { _done(); } catch(e) {} }  // 🆕 v1.56.0 : notifie le séquenceur
    }

    document.getElementById("kta-pin-proposal-non").addEventListener("click", function() {
      markProposalDone();
      _close();
      console.log("[PinLock] Proposition d'activation refusée (ne sera plus affichée)");
    });

    document.getElementById("kta-pin-proposal-oui").addEventListener("click", function() {
      markProposalDone();
      _close();
      // 🆕 v1.10.0-hotfix1 (KARMA "si on clique sur activer maintenant, ca
      // ferme juste le modal mais ouvre pas le formulaire") : on ouvre la
      // modale Configuration via window._ouvrirLoaderConfig (exposée par
      // index.html depuis cette version). Si on est in-app (plan chargé,
      // loader masqué), l'helper affiche aussi le loader d'abord.
      // Bonus : scroll auto + flash highlight de la section PIN pour
      // guider l'user vers le bouton "Activer le code d'accès".
      if (typeof window._ouvrirLoaderConfig === "function") {
        window._ouvrirLoaderConfig();
        setTimeout(function() {
          const enableBtn = document.getElementById("loaderPinEnableBtn");
          const section = document.getElementById("loaderPinStatus");
          if (section && section.scrollIntoView) {
            try { section.scrollIntoView({ behavior: "smooth", block: "center" }); }
            catch(e) { section.scrollIntoView(); }
          }
          // Flash highlight le bouton pour attirer l'œil
          if (enableBtn) {
            enableBtn.classList.add("kta-pin-enable-flash");
            setTimeout(function() {
              enableBtn.classList.remove("kta-pin-enable-flash");
            }, 2200);
          }
        }, 150);
      } else {
        // Fallback : on log + on indique à l'user d'ouvrir Configuration
        console.warn("[PinLock] window._ouvrirLoaderConfig indisponible — l'user doit ouvrir ⚙️ Configuration manuellement");
        window.ktaAlerte(t("pin.proposal.fallbackAlert"));
      }
      console.log("[PinLock] Proposition d'activation acceptée → redirection ⚙️ Configuration");
    });
  }

  // ============================================================
  // EXPORT GLOBAL
  // ============================================================
  window.MyKTAMapPinLock = {
    // Constantes
    PIN_MIN:                PIN_MIN,
    PIN_MAX:                PIN_MAX,
    MAX_ATTEMPTS:           MAX_ATTEMPTS,
    // État
    isEnabled:              isEnabled,
    isUnlocked:             isUnlocked,
    isLockedOut:            isLockedOut,
    getRemainingAttempts:   getRemainingAttempts,
    hasBiometric:           hasBiometric,
    isBiometricSupported:   isBiometricSupported,
    // Actions
    enable:                 enable,
    disable:                disable,
    unlock:                 unlock,
    unlockWithBiometric:    unlockWithBiometric,
    changePin:              changePin,
    reset:                  reset,
    ouvrirGate:             ouvrirGate,
    // 🆕 v1.10.0 : proposition one-shot d'activation au 1er lancement
    proposerActivation:     proposerActivation,
    isProposalDone:         isProposalDone,
    markProposalDone:       markProposalDone,
    // UI plein écran (utilisée par ouvrirGate)
    _afficherGateUI:        _afficherGateUI,
    _afficherLockoutUI:     _afficherLockoutUI,
    _afficherModaleProposition: _afficherModaleProposition
  };

  console.log("[PinLock] Module chargé (PIN activé : " + isEnabled() + ", biométrie : " + hasBiometric() + ")");
})();
