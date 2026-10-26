/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// pinLock.js — code d'accès local optionnel (PIN 4-6 chiffres, biométrie), par-dessus UnlockGate.
// Expose : window.MyKTAMapPinLock (isEnabled, isUnlocked, isLockedOut, getRemainingAttempts,
//   hasBiometric, isBiometricSupported, enable, disable, unlock, unlockWithBiometric, changePin,
//   reset, ouvrirGate). Jamais proposé au lancement (décision produit) : s'active dans ⚙️ Configuration →
//   🔐 Code d'accès local.
// 🔒 Barrière UX, pas de la crypto : SHA-256(sel 16 octets + PIN) en localStorage["myktamap_pin_v1"] ;
//   DevTools la contourne. Les données IDB ne sont pas chiffrées. Pas de récupération : oubli = reset.
// 🔒 WebAuthn (plateforme seulement) sans serveur : challenge local, signature non vérifiée.
// ⚠️ Verrou JAMAIS définitif (décision produit) : 5 échecs → verrou temporisé, escaladé
//   10 min → 1 h → 6 h → 24 h ; il expire seul, un code juste remet compteur et palier à zéro.
//   Base Date.now() : reculer l'horloge sous le début du verrou ne l'ouvre pas, l'avancer le raccourcit (accepté).
// Garde-fou : scripts/check-filets-donnees.js · Doc : docs/architecture/security-legal.md

(function() {
  "use strict";

  const STORAGE_KEY      = "myktamap_pin_v1";
  const MAX_ATTEMPTS     = 5;
  // Paliers (ms). Palier = nombre de séries de MAX_ATTEMPTS erreurs sans code juste entre deux.
  const LOCK_DELAYS_MS   = [10 * 60 * 1000, 60 * 60 * 1000, 6 * 3600 * 1000, 24 * 3600 * 1000];
  let _lockTimer = null;   // compte à rebours de l'écran de verrou
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
  const WEBAUTHN_RP_NAME = "MyKTAMap";

  let _unlocked = false;   // déverrouillé pour la session courante (en mémoire)

  // ── Stockage ──────────────────────────────
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

  // ── Crypto (SHA-256 + base64) ──────────────────────────────
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
    const concat = new Uint8Array(saltBytes.length + pinBytes.length);
    concat.set(saltBytes, 0);
    concat.set(pinBytes, saltBytes.length);
    return window.crypto.subtle.digest("SHA-256", concat).then(function(hashBuf) {
      return _bytesToB64(new Uint8Array(hashBuf));
    });
  }

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

  // ── État ──────────────────────────────
  function isEnabled() {
    // Jamais de PIN en incognito : la session est éphémère, rien à protéger (décision produit).
    if (window.IncognitoMode && window.IncognitoMode.active) return false;
    const state = _getState();
    return !!(state && state.hashedPin && state.salt);
  }

  function isUnlocked() {
    return _unlocked;
  }

  // 🔒 Verrouillé = `lockUntil` dans le futur, ou horloge reculée sous `lockStart`.
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

  // ── Biométrie (WebAuthn) ──────────────────────────────
  // Authentificateur de plateforme exigé (Face ID, Touch ID, Windows Hello), pas une clé USB.
  function isBiometricSupported() {
    if (typeof window.PublicKeyCredential === "undefined") {
      return Promise.resolve(false);
    }
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
      return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .catch(function() { return false; });
    }
    return Promise.resolve(false);
  }

  // → Promise<credentialIdB64>. Challenge aléatoire local : sans serveur, compromis assumé.
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

  // → Promise<bool>. Sans serveur, la validation du navigateur suffit (barrière UX).
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
      return !!assertion;
    }).catch(function(e) {
      console.warn("[PinLock] biométrie échouée :", e);
      return false;
    });
  }

  // ── Activation, désactivation ──────────────────────────────
  // → Promise<bool>. Biométrie refusée : le PIN reste actif, l'erreur porte pinActivatedWithoutBiometric.
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
        _unlocked = true;
        return true;
      }

      return _enregistrerBiometrie().then(function(credId) {
        state.hasBiometric = true;
        state.credentialId = credId;
        _setState(state);
        _unlocked = true;
        return true;
      }).catch(function(e) {
        console.warn("[PinLock] enregistrement biométrie échoué :", e);
        _setState(state);
        _unlocked = true;
        const err = new Error("PIN activé sans biométrie : " + (e.message || e));
        err.pinActivatedWithoutBiometric = true;
        throw err;
      });
    });
  }

  // Exige le PIN courant ; refusé pendant un verrou.
  function disable(pin) {
    if (!isEnabled()) return Promise.resolve(true);

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

  // ── Déverrouillage ──────────────────────────────
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
        state.attempts  = 0;
        state.lockLevel = 0;
        delete state.lockUntil;
        delete state.lockStart;
        _setState(state);
        _unlocked = true;
        return true;
      }
      // 🏷️ ancre:pin-tentative-ratee
      // À MAX_ATTEMPTS : verrou au palier suivant, compteur remis à zéro.
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

  function unlockWithBiometric() {
    if (!hasBiometric()) {
      return Promise.reject(new Error(window.I18n ? window.I18n.t("pin.err.bioNotConfigured") : "pin.err.bioNotConfigured"));
    }
    const state = _getState();
    if (!state) return Promise.resolve(false);
    return _verifierBiometrie(state.credentialId).then(function(ok) {
      if (ok) {
        state.attempts = 0;
        _setState(state);
        _unlocked = true;
      }
      // ⚠️ Une biométrie ratée ne compte pas dans `attempts` : l'appareil a son propre verrou,
      // et une annulation par accident ne doit pas user les essais PIN.
      return ok;
    });
  }

  // ⚠️ Ne revérifie pas l'ancien PIN : exige une session déverrouillée, l'UI appelle unlock() avant.
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

    // Sel neuf : les hashes successifs ne se corrèlent pas.
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

  // Appelé par la réinitialisation du cache, pas par l'utilisateur.
  function reset() {
    _clearState();
    _unlocked = false;
  }

  // ── Gate plein écran ──────────────────────────────
  // Résout tout de suite si PIN inactif, sinon au déverrouillage. Verrou temporisé : la Promise
  // attend l'expiration puis le bon code. _afficherGateUI est exposée à part (mockable en test).
  function ouvrirGate() {
    if (!isEnabled()) {
      _unlocked = true;
      return Promise.resolve(true);
    }
    if (_unlocked) return Promise.resolve(true);

    return new Promise(function(resolve) {
      window.MyKTAMapPinLock._afficherGateUI(function() {
        resolve(true);
      });
    });
  }

  // Pavé maison 3×4 (⌫ / 0 / ✓ en bas) : le clavier numérique natif est peu fiable en PWA.
  // Bouton biométrie au-dessus du pavé ; ✓ actif dès PIN_MIN chiffres. Dernier chiffre visible 0,5 s.
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
        // Doc lisible depuis la gate ; l'onboarding y est masqué (pas d'accès à l'app).
        '<button type="button" id="kta-pin-readme-btn" class="kta-gate-readme-btn" title="' + t("pin.gate.docTitle") + '">' +
          t("pin.gate.docBtn") +
        '</button>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    let buffer = "";  // 🔒 chiffres saisis, en mémoire seulement, jamais loggés
    let _lastDigitTimer = null;

    function _refreshDots() {
      const dotsEl = document.getElementById("kta-pin-dots");
      if (!dotsEl) return;
      let html = "";
      for (let i = 0; i < PIN_MAX; i++) {
        const filled = i < buffer.length;
        if (filled) {
          const isLast = (i === buffer.length - 1) && _lastDigitTimer;
          if (isLast) {
            html += '<span class="kta-pin-dot kta-pin-dot-filled kta-pin-dot-visible">' + buffer[i] + '</span>';
          } else {
            html += '<span class="kta-pin-dot kta-pin-dot-filled">●</span>';
          }
        } else {
          html += '<span class="kta-pin-dot">○</span>';
        }
      }
      dotsEl.innerHTML = html;
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
      buffer = "";
      _refreshDots();
      unlock(pinTry).then(function(ok) {
        if (ok) {
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
      if (_lastDigitTimer) clearTimeout(_lastDigitTimer);
      _lastDigitTimer = setTimeout(function() {
        _lastDigitTimer = null;
        _refreshDots();
      }, 500);
      _refreshDots();
      // Validation auto seulement à PIN_MAX chiffres (un PIN de 4-5 se valide par ✓ ou Entrée),
      // après 200 ms pour laisser voir le dernier chiffre.
      if (buffer.length === PIN_MAX) {
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

    overlay.querySelectorAll(".kta-pin-gate-key[data-digit]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        _onDigit(btn.dataset.digit);
      });
    });
    const eraseBtn = document.getElementById("kta-pin-erase");
    if (eraseBtn) eraseBtn.addEventListener("click", _onErase);
    const bioBtn = document.getElementById("kta-pin-bio");
    if (bioBtn) bioBtn.addEventListener("click", _onBio);
    const validateBtn = document.getElementById("kta-pin-validate");
    if (validateBtn) validateBtn.addEventListener("click", _tryUnlock);
    // Doc au-dessus de la gate (z-index 100200, classe CSS kta-readme-over-locker).
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
        // Échap n'annule pas la gate (comme UnlockGate).
        e.preventDefault();
      }
    }
    document.addEventListener("keydown", _onKeyDown);

    // Biométrie demandée d'office, après 400 ms pour laisser la modale s'afficher.
    if (useBio) {
      setTimeout(_onBio, 400);
    }

    _refreshDots();
    _refreshAttempts();
  }

  function _keypadKey(digit) {
    return '<button class="kta-pin-gate-key" data-digit="' + digit + '">' + digit + '</button>';
  }

  // 🩸 Écran de verrou temporisé : compte à rebours, puis retour automatique au pavé.
  // `onUnlock` DOIT être repassé à _afficherGateUI, sinon la Promise de ouvrirGate ne résout
  // jamais. Sous terre, ni réinstaller ni contacter quelqu'un n'est possible.
  function _afficherLockoutUI(onUnlock) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
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
          '<p style="font-style:italic; color:var(--kta-texte-3); margin-top:10px;">' +
          t("pin.lockout.escalade") + '</p>' +
          // Doc lisible pendant le verrou ; ne change rien au verrouillage.
          '<button type="button" id="kta-pin-readme-btn-lockout" class="kta-gate-readme-btn" style="margin-top:14px;" title="' + t("pin.gate.docTitle") + '">' +
            t("pin.gate.docBtn") +
          '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    const docBtnLockout = document.getElementById("kta-pin-readme-btn-lockout");
    if (docBtnLockout) {
      docBtnLockout.addEventListener("click", function() {
        if (typeof window.afficherReadme === "function") {
          window.afficherReadme({ hideOnboarding: true, overLocker: true });
        }
      });
    }
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

  window.MyKTAMapPinLock = {
    PIN_MIN:                PIN_MIN,
    PIN_MAX:                PIN_MAX,
    MAX_ATTEMPTS:           MAX_ATTEMPTS,
    isEnabled:              isEnabled,
    isUnlocked:             isUnlocked,
    isLockedOut:            isLockedOut,
    getRemainingAttempts:   getRemainingAttempts,
    hasBiometric:           hasBiometric,
    isBiometricSupported:   isBiometricSupported,
    enable:                 enable,
    disable:                disable,
    unlock:                 unlock,
    unlockWithBiometric:    unlockWithBiometric,
    changePin:              changePin,
    reset:                  reset,
    ouvrirGate:             ouvrirGate,
    _afficherGateUI:        _afficherGateUI,
    _afficherLockoutUI:     _afficherLockoutUI
  };

  console.log("[PinLock] Module chargé (PIN activé : " + isEnabled() + ", biométrie : " + hasBiometric() + ")");
})();
