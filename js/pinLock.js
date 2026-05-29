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
//   - 5 tentatives PIN échouées consécutives → lockout définitif
//   - Stocké en localStorage["myktamap_pin_v1"].attempts
//   - Pour sortir du lockout : reset complet (= efface aussi localStorage)
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
    if (typeof pin !== "string" && typeof pin !== "number") {
      return "Le PIN doit être un nombre.";
    }
    const s = String(pin).trim();
    if (!/^\d+$/.test(s)) return "Le PIN ne doit contenir que des chiffres.";
    if (s.length < PIN_MIN) return "Le PIN doit faire au moins " + PIN_MIN + " chiffres.";
    if (s.length > PIN_MAX) return "Le PIN ne doit pas dépasser " + PIN_MAX + " chiffres.";
    return null;  // valide
  }

  // ============================================================
  // API : ÉTAT
  // ============================================================
  function isEnabled() {
    const state = _getState();
    return !!(state && state.hashedPin && state.salt);
  }

  function isUnlocked() {
    return _unlocked;
  }

  function isLockedOut() {
    const state = _getState();
    return !!(state && (state.attempts || 0) >= MAX_ATTEMPTS);
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

    // Si verrouillé out → seul reset complet possible
    if (isLockedOut()) {
      return Promise.reject(new Error("Lockout actif : reset complet requis."));
    }

    return unlock(pin).then(function(ok) {
      if (!ok) throw new Error("PIN incorrect.");
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
      return Promise.reject(new Error("Trop de tentatives. Reset complet requis."));
    }
    const state = _getState();
    if (!state) {
      _unlocked = true;
      return Promise.resolve(true);
    }
    return _hashPin(pin, state.salt).then(function(candidate) {
      if (candidate === state.hashedPin) {
        // Reset compteur tentatives + flag unlocked
        state.attempts = 0;
        _setState(state);
        _unlocked = true;
        return true;
      }
      // Tentative ratée → incrémente compteur
      state.attempts = (state.attempts || 0) + 1;
      _setState(state);
      return false;
    });
  }

  // ============================================================
  // API : UNLOCK BIOMÉTRIE
  // ============================================================
  function unlockWithBiometric() {
    if (!hasBiometric()) {
      return Promise.reject(new Error("Biométrie non configurée."));
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
    if (!_unlocked) {
      return Promise.reject(new Error("Session non déverrouillée."));
    }
    if (!isEnabled()) {
      return Promise.reject(new Error("PIN pas activé. Utilise enable() à la place."));
    }
    const err = _validatePinInput(newPin);
    if (err) return Promise.reject(new Error(err));

    const state = _getState();
    if (!state) return Promise.reject(new Error("État PIN introuvable."));

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
      // En cas de lockout, le callback ne sera JAMAIS appelé →
      // la Promise reste pending forever (comportement délibéré,
      // cohérent avec UnlockGate).
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
      _afficherLockoutUI();
      return;
    }

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
        '<div class="kta-pin-gate-titre">Code d\'accès local</div>' +
        '<div class="kta-pin-gate-soustitre">Saisis ton code pour déverrouiller l\'app.</div>' +
        '<div class="kta-pin-gate-dots" id="kta-pin-dots"></div>' +
        '<div class="kta-pin-gate-err" id="kta-pin-err" style="display:none;"></div>' +
        '<div class="kta-pin-gate-attempts" id="kta-pin-attempts">' + remaining + ' tentative(s) restante(s)</div>' +
        (useBio
          ? '<button class="kta-pin-gate-bio-btn" id="kta-pin-bio" title="Déverrouiller via biométrie">' +
              '🔓 Déverrouiller via biométrie (Face ID / Touch ID)' +
            '</button>'
          : '') +
        '<div class="kta-pin-gate-keypad">' +
          _keypadKey("1") + _keypadKey("2") + _keypadKey("3") +
          _keypadKey("4") + _keypadKey("5") + _keypadKey("6") +
          _keypadKey("7") + _keypadKey("8") + _keypadKey("9") +
          '<button class="kta-pin-gate-key kta-pin-gate-key-erase" id="kta-pin-erase" title="Effacer">⌫</button>' +
          _keypadKey("0") +
          '<button class="kta-pin-gate-key kta-pin-gate-key-validate" id="kta-pin-validate" title="Valider" disabled>✓</button>' +
        '</div>' +
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
        el.textContent = rem + " tentative(s) restante(s)";
        if (rem <= 2) el.classList.add("kta-pin-gate-attempts-warn");
      }
    }

    function _tryUnlock() {
      if (buffer.length < PIN_MIN) {
        _showErr("Le code doit faire au moins " + PIN_MIN + " chiffres.");
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
            _afficherLockoutUI();
            return;
          }
          const rem = getRemainingAttempts();
          _showErr("❌ Code incorrect. " + rem + " tentative" + (rem > 1 ? "s" : "") + " restante" + (rem > 1 ? "s" : "") + ".");
        }
      }).catch(function(e) {
        console.error("[PinLock] unlock erreur :", e);
        _showErr("Erreur interne : " + (e.message || e));
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
          _showErr("Biométrie refusée. Saisis ton code à la place.");
        }
      }).catch(function(e) {
        console.warn("[PinLock] biométrie erreur :", e);
        _showErr("Biométrie indisponible. Utilise le code.");
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

  // Screen lockout (5 tentatives échouées) — pas de bouton sortie
  function _afficherLockoutUI() {
    // Cleanup une éventuelle gate précédente
    const old = document.getElementById("kta-pin-gate-overlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id        = "kta-pin-gate-overlay";
    overlay.className = "kta-pin-gate-overlay kta-pin-gate-overlay-lockout";
    // 🆕 v1.10.0-hotfix4 (KARMA "que la procédure soit bien plus bref :
    // réinstaller complètement l'app, ou contacter l'auteur — Instagram
    // @karma_kta / contact@myktamap.fr — qui ne pourra rien faire ne
    // connaissant pas la clef côté serveur non stocké") :
    // message simplifié au strict nécessaire. Pas d'instructions par
    // device — l'user qui en arrive là sait probablement réinstaller
    // une app, ou demande à l'auteur autrement.
    overlay.innerHTML =
      '<div class="kta-pin-gate-box kta-pin-gate-box-lockout">' +
        '<div class="kta-pin-gate-icon">🚫</div>' +
        '<div class="kta-pin-gate-titre">Trop de tentatives</div>' +
        '<div class="kta-pin-gate-soustitre">' +
          '5 codes incorrects à la suite. L\'app est verrouillée définitivement.' +
        '</div>' +
        '<div class="kta-pin-gate-lockout-explication">' +
          '<p><strong>2 solutions pour récupérer l\'accès :</strong></p>' +
          '<ol style="text-align:left; margin:6px 0 10px 20px; padding:0; line-height:1.7;">' +
            '<li><strong>Réinstaller complètement l\'app</strong> (supprime ' +
              'le PIN + la session + les plans non mémorisés).</li>' +
            '<li><strong>Contacter l\'auteur</strong> via ' +
              '<a href="https://instagram.com/karma_kta" target="_blank" rel="noopener" style="color:#8cb4ff;">Instagram @karma_kta</a>' +
              ' ou <a href="mailto:contact@myktamap.fr" style="color:#8cb4ff;">contact@myktamap.fr</a>' +
              ' — ⚠️ il ne pourra pas récupérer ton code (aucune donnée stockée côté serveur).</li>' +
          '</ol>' +
          '<p style="font-style:italic; color:#8892a4; margin-top:10px;">' +
          'Verrouillage de sécurité actif après plusieurs tentatives échouées.</p>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    console.warn("[PinLock] LOCKOUT activé (5 tentatives échouées)");
  }

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

  function proposerActivation() {
    // Skip si PIN déjà activé OU déjà proposé une fois
    if (isEnabled()) return;
    if (isProposalDone()) return;

    // Petit délai pour ne pas être trop intrusif au boot
    setTimeout(function() {
      _afficherModaleProposition();
    }, 800);
  }

  function _afficherModaleProposition() {
    const overlay = document.createElement("div");
    overlay.id        = "kta-pin-proposal-overlay";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-pin-proposal-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">🔐 Authentification renforcée disponible</span>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="font-size:14px; line-height:1.55; color:#e8eaf0; margin:0 0 14px 0;">' +
            'Bonjour 👋 Cette version ajoute la possibilité de <strong>verrouiller l\'app ' +
            'localement</strong> par un code 4-6 chiffres, et <strong>Face ID / Touch ID</strong> ' +
            'si ton appareil le supporte.' +
          '</p>' +
          '<div class="kta-pin-proposal-info">' +
            '<div class="kta-pin-proposal-info-titre">🎯 À quoi ça sert ?</div>' +
            '<p>Protège tes plans, sessions et photos en cas de perte ou de prêt de ton appareil. ' +
            'Personne ne peut ouvrir l\'app sans ton code (ou ta biométrie).</p>' +
          '</div>' +
          '<div class="kta-pin-proposal-info" style="background:rgba(244,197,66,0.06); border-color:rgba(244,197,66,0.25);">' +
            '<div class="kta-pin-proposal-info-titre" style="color:#f4c542;">⚠️ Avant d\'accepter</div>' +
            '<ul style="margin:6px 0 0 18px; padding:0; line-height:1.5; color:#c8d0e0; font-size:13px;">' +
              '<li><strong>Note bien ton code</strong> : aucune récupération n\'est possible en cas d\'oubli</li>' +
              '<li>5 codes incorrects = lockout définitif (nécessite de tout supprimer)</li>' +
              '<li>C\'est une <strong>barrière d\'usage</strong>, pas un chiffrement des données</li>' +
            '</ul>' +
          '</div>' +
          '<p style="font-size:12.5px; color:#8892a4; margin:14px 0 0 0; line-height:1.5; font-style:italic;">' +
            'Si tu refuses, cette proposition ne sera plus affichée. ' +
            'Tu pourras toujours activer plus tard depuis ' +
            '<strong>⚙️ Configuration → 🔐 Code d\'accès local</strong> sur la page d\'accueil.' +
          '</p>' +
        '</div>' +
        '<div class="kta-conv-actions" style="padding:14px 24px 18px; gap:10px;">' +
          '<button class="kta-btn kta-btn-ghost" id="kta-pin-proposal-non" type="button">' +
            'Non merci' +
          '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-pin-proposal-oui" type="button" ' +
            'style="background:rgba(244,197,66,0.18); border-color:rgba(244,197,66,0.5); color:#f4c542;">' +
            '🔐 Activer maintenant' +
          '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    function _close() {
      try { overlay.remove(); } catch(e) {}
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
        alert("Pour activer le code d'accès, ouvre ⚙️ Configuration depuis la page d'accueil → section 🔐 Code d'accès local.");
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
