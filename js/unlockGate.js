/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// UNLOCK GATE — barrière communautaire d'accès (depuis v173)
// =====================================================================
// Mot de passe unique partagé entre utilisateurs autorisés. Vérifié 1 fois
// à la 1ère installation puis mémorisé en localStorage. Re-demandé après
// un reset complet (viderCacheAppli purge le localStorage).
//
// ⚠️ NIVEAU DE SÉCURITÉ : c'est une barrière SOCIALE / COMMUNAUTAIRE, pas
// une vraie authentification. Le code source HTML/JS est servi en clair
// par Nginx ET disponible publiquement sur GitHub. Quelqu'un de motivé
// peut :
//   - Lire le hash dans ce fichier (mais pas le mdp lui-même grâce à SHA-256)
//   - Brute force le hash (mais ralenti par 5 tentatives max + lockout)
//   - Bypass via `localStorage.setItem("myktamap_unlock_v1", "<hash>")` en F12
//   - Cloner le repo GitHub et obtenir le mdp en clair via brute-force offline
//
// Cette gate sert à :
//   ✅ Décourager les passants / robots d'indexation
//   ✅ Cadrer "communauté" → "il faut connaître le code"
//   ❌ NE PAS empêcher un attaquant motivé de bypass
//
// Hash SHA-256 hardcodé : on évite le mdp en clair dans le code. Le mdp
// lui-même est communiqué hors-bande aux utilisateurs (forum, message
// direct, etc.).
// =====================================================================

(function() {
  "use strict";

  // Hash SHA-256 du mot de passe communautaire. Pour bumper le mdp :
  //   echo -n "<nouveau-mdp>" | openssl dgst -sha256
  // → mettre le résultat ici, l'app redemandera au prochain boot des users
  //   qui avaient l'ancien (le hash en localStorage ne matchera plus).
  const HASH_VALIDE = "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae";

  // Clés localStorage
  const LS_UNLOCK   = "myktamap_unlock_v1";       // hash validé (= mdp accepté)
  const LS_ATTEMPTS = "myktamap_unlock_attempts"; // compteur tentatives échouées
  const MAX_ATTEMPTS = 5;

  // État interne
  let _resolveGate = null;  // Promise resolver pour main.js qui attend

  // =========================================================================
  // HELPERS HASH (SubtleCrypto SHA-256)
  // =========================================================================
  async function _sha256(s) {
    if (!crypto || !crypto.subtle) {
      // Très vieux navigateur ou contexte non sécurisé (HTTP plain) — pas
      // de subtle crypto dispo. On échoue plutôt que d'utiliser un hash bidon.
      throw new Error("Crypto SubtleCrypto indisponible — contexte non sécurisé (HTTP) ?");
    }
    const buf = new TextEncoder().encode(s);
    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hashBuf))
      .map(function(b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  // =========================================================================
  // ÉTAT PUBLIC
  // =========================================================================
  function isUnlocked() {
    try { return localStorage.getItem(LS_UNLOCK) === HASH_VALIDE; }
    catch(e) { return false; }
  }

  function _getAttempts() {
    try {
      const v = parseInt(localStorage.getItem(LS_ATTEMPTS) || "0", 10);
      return isFinite(v) ? Math.max(0, v) : 0;
    } catch(e) { return 0; }
  }

  function _setAttempts(n) {
    try { localStorage.setItem(LS_ATTEMPTS, String(n)); } catch(e) {}
  }

  function isLockedOut() {
    return _getAttempts() >= MAX_ATTEMPTS;
  }

  // =========================================================================
  // RENDU OVERLAY
  // =========================================================================
  // Crée l'overlay plein écran avec champ de saisie, bouton et signature.
  // Style charte MyKTAMap (gradient noir, accent jaune #f4c542).
  function _creerOverlay() {
    const o = document.createElement("div");
    o.id = "kta-unlock-overlay";
    o.innerHTML =
      '<div class="kta-unlock-box">' +
        '<div class="kta-unlock-icon">🗝️</div>' +
        '<div class="kta-unlock-titre">Accès restreint</div>' +
        '<p class="kta-unlock-info">' +
          'Cette application est privée. Saisis le code d\'accès qui t\'a été ' +
          'communiqué. Si tu n\'as pas le code, contacte l\'auteur via :' +
        '</p>' +
        // 🆕 v1.28.0 — Vrais canaux de contact (avant : « contacte l'auteur »
        // sans aucun canal). Liens sortants uniquement → aucun impact CSP.
        '<div class="kta-unlock-contact" style="margin:0 0 14px; font-size:12px; color:#a8b3c8; line-height:1.7;">' +
          '📷 <a href="https://instagram.com/karma_kta" target="_blank" rel="noopener noreferrer" style="color:#f4c542;">@karma_kta</a>' +
          ' &middot; ✉️ <a href="mailto:contact@myktamap.fr" style="color:#f4c542;">contact@myktamap.fr</a>' +
          // 🆕 v1.28.2 : lien "Licence pro" wrappé en .kta-licence-community
          // pour être masqué sur instance pro (où c'est déjà le cas, lien inutile).
          ' <span class="kta-licence-community">&middot; 💼 <a href="https://pro.myktamap.fr" target="_blank" rel="noopener noreferrer" style="color:#f4c542;">Licence pro</a></span>' +
        '</div>' +
        '<form id="kta-unlock-form" autocomplete="off">' +
          '<input type="password" id="kta-unlock-input" placeholder="Code d\'accès" ' +
                 'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
          '<button type="submit" id="kta-unlock-btn" class="kta-btn kta-btn-primary">' +
            '🔓 Déverrouiller' +
          '</button>' +
        '</form>' +
        '<div class="kta-unlock-feedback" id="kta-unlock-feedback"></div>' +
        // 🆕 v1.28.5 — Voie alternative d'accès via licence pro. Un user
        // qui détient une licence pro valide n'a pas à connaître le code
        // d'accès communautaire (qui sert juste à filtrer les passants).
        // L'import d'une licence locale activée le mode pro ET débloque
        // simultanément l'UnlockGate (équivalent à un unlock réussi),
        // car détenir une licence émise par MyKTAMap = canal légitime.
        // Bloc wrappé en .kta-licence-community → masqué côté instance pro
        // (cohérent : si déjà pro côté serveur, pas besoin de proposer l'import).
        '<div class="kta-unlock-separator kta-licence-community" aria-hidden="true">' +
          '<span class="kta-unlock-separator-line"></span>' +
          '<span class="kta-unlock-separator-text">ou</span>' +
          '<span class="kta-unlock-separator-line"></span>' +
        '</div>' +
        '<div class="kta-unlock-licence-block kta-licence-community">' +
          '<p class="kta-unlock-licence-info">' +
            'Tu as reçu un fichier de <strong>licence professionnelle</strong>&nbsp;? ' +
            'Importe-le ci-dessous pour activer l\'édition pro sur cet appareil&nbsp;: ' +
            'aucun code requis.' +
          '</p>' +
          '<button type="button" id="kta-unlock-licence-btn" class="kta-btn kta-btn-secondary kta-unlock-licence-btn">' +
            '📂 Importer ma licence pro' +
          '</button>' +
          '<input type="file" id="kta-unlock-licence-input" accept=".json,application/json" style="display:none;">' +
        '</div>' +
        // 🆕 v1.28.1 — Bouton 📖 Documentation accessible depuis l'écran de
        // verrouillage. Permet à un user qui doute (« c'est quoi ce projet ? »,
        // « pourquoi un code ? ») de lire le README utilisateur sans devoir
        // entrer. L'onboarding (🎓) est volontairement masqué : sans accès à
        // l'app, le tutoriel n'a pas de sens.
        '<button type="button" id="kta-unlock-readme-btn" class="kta-gate-readme-btn" title="Consulter la documentation utilisateur">' +
          '📖 Lire la documentation' +
        '</button>' +
        '<div class="kta-unlock-signature">' +
          '© 2026 Flavien VIDAL (alias KARMA) — CC BY-NC-SA 4.0' +
        '</div>' +
      '</div>';
    document.body.appendChild(o);
    return o;
  }

  // 🆕 v1.28.1 — Helper d'ouverture de la modale Doc README au-dessus du
  // lockeur. opts.hideOnboarding masque le bouton 🎓 (incohérent dans un
  // contexte verrouillé) et opts.overLocker boost le z-index de la modale
  // à 100200 pour passer au-dessus de l'overlay UnlockGate (z-index 100100).
  // Si interface.js n'est pas encore chargé (cas très tôt au boot), no-op
  // gracieux — le bouton ne fera rien plutôt que de crasher.
  function _ouvrirDocReadme() {
    if (typeof window.afficherReadme === "function") {
      window.afficherReadme({ hideOnboarding: true, overLocker: true });
    } else {
      console.warn("[UnlockGate] afficherReadme indisponible (interface.js pas encore chargé)");
    }
  }

  // Bloque l'app dans l'état "lockout" : champ caché, message permanent.
  //
  // 🚨 v173 fix incohérence remontée KARMA : on ne propose AUCUN bouton de
  // reset depuis le lockout. Sinon l'user fait :
  //   1. Saisit 5 fois faux → lockout
  //   2. Clique "Reset complet" → modale confirmation → voit le mdp affiché
  //   3. Reset → relance → re-saisit le mdp → bypass complet du lockout
  //
  // → Lockout vraiment bloquant. L'user qui ne connaît pas le code DOIT
  // désinstaller l'app (vider cache navigateur manuellement, désinstaller
  // la PWA, etc.). C'est sa responsabilité — l'app ne lui mâche pas le
  // travail. Cohérent avec le warning "barrière sociale" : qui n'a pas
  // le code n'a rien à faire ici.
  function _afficherLockout(overlay) {
    const form = overlay.querySelector("#kta-unlock-form");
    const fb   = overlay.querySelector("#kta-unlock-feedback");
    if (form) form.style.display = "none";
    if (fb) {
      fb.innerHTML =
        '<div class="kta-unlock-lockout">' +
          '<div class="kta-unlock-lockout-titre">🚫 Trop de tentatives</div>' +
          '<div class="kta-unlock-lockout-msg">Accès verrouillé par sécurité.</div>' +
          '<div class="kta-unlock-lockout-hint">' +
            'Si tu connais légitimement le code, contacte l\'auteur :' +
          '</div>' +
          // 🆕 v1.28.0 — Canaux explicites (avant : « contacte l'auteur » sans canal).
          '<div class="kta-unlock-lockout-contact" style="margin-top:10px; font-size:12px; color:#a8b3c8; line-height:1.7;">' +
            '📷 <a href="https://instagram.com/karma_kta" target="_blank" rel="noopener noreferrer" style="color:#f4c542;">@karma_kta</a>' +
            ' &middot; ✉️ <a href="mailto:contact@myktamap.fr" style="color:#f4c542;">contact@myktamap.fr</a>' +
            // 🆕 v1.28.2 : lien "Licence pro" wrappé en .kta-licence-community
          // pour être masqué sur instance pro (où c'est déjà le cas, lien inutile).
          ' <span class="kta-licence-community">&middot; 💼 <a href="https://pro.myktamap.fr" target="_blank" rel="noopener noreferrer" style="color:#f4c542;">Licence pro</a></span>' +
          '</div>' +
          // 🆕 v1.28.1 — Accès doc utilisateur même en lockout : si l'user est
          // bloqué et veut comprendre ce qu'est l'app avant de réinstaller
          // OU contacter l'auteur, il peut lire le README. Ne touche en rien
          // au verrouillage : ouvre juste un modal info par-dessus.
          '<button type="button" id="kta-unlock-readme-btn-lockout" class="kta-gate-readme-btn" style="margin-top:14px;" title="Consulter la documentation utilisateur">' +
            '📖 Lire la documentation' +
          '</button>' +
        '</div>';
      // Bind du bouton 📖 doc (le HTML vient juste d'être injecté).
      const btnDocLockout = overlay.querySelector("#kta-unlock-readme-btn-lockout");
      if (btnDocLockout) btnDocLockout.addEventListener("click", _ouvrirDocReadme);
    }
  }

  // =========================================================================
  // SUBMIT FLOW
  // =========================================================================
  async function _onSubmit(overlay, input, fb) {
    const value = (input.value || "").trim();
    if (!value) {
      fb.innerHTML = '<div class="kta-unlock-error">Champ vide.</div>';
      return;
    }

    // Hash de la saisie + comparaison
    let hashed;
    try {
      hashed = await _sha256(value);
    } catch (e) {
      fb.innerHTML = '<div class="kta-unlock-error">Erreur crypto : ' + (e.message || e) + '</div>';
      return;
    }

    if (hashed === HASH_VALIDE) {
      // ✅ Succès
      try {
        localStorage.setItem(LS_UNLOCK, HASH_VALIDE);
        localStorage.removeItem(LS_ATTEMPTS);
      } catch(e) {}
      fb.innerHTML = '<div class="kta-unlock-success">✓ Accès autorisé</div>';
      // Petite pause pour que l'user voie la confirmation, puis on libère
      setTimeout(function() {
        overlay.classList.add("kta-unlock-fading");
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (_resolveGate) {
            const r = _resolveGate;
            _resolveGate = null;
            r(true);
          }
        }, 250);
      }, 400);
    } else {
      // ❌ Échec — incrémente compteur
      const attempts = _getAttempts() + 1;
      _setAttempts(attempts);
      input.value = "";
      input.focus();

      if (attempts >= MAX_ATTEMPTS) {
        // Lockout définitif (jusqu'au reset)
        _afficherLockout(overlay);
        // ⚠️ On ne résout PAS la Promise → main.js reste bloqué pour toujours
        // jusqu'à ce que l'user clique sur reset (qui reload la page).
      } else {
        const reste = MAX_ATTEMPTS - attempts;
        fb.innerHTML =
          '<div class="kta-unlock-error">' +
            '❌ Code incorrect. Tentatives restantes : <strong>' + reste + '</strong>' +
          '</div>';
      }
    }
  }

  // =========================================================================
  // API PUBLIQUE
  // =========================================================================
  // ouvrirGate() retourne une Promise qui résout `true` à l'unlock, OU
  // qui ne résout JAMAIS si lockout (5 tentatives ratées). Le caller
  // (main.js > initApp) await ça → l'app reste bloquée tant que pas auth.
  function ouvrirGate() {
    return new Promise(function(resolve) {
      _resolveGate = resolve;

      // Si déjà en lockout au boot (= localStorage attempts ≥ 5), afficher
      // l'overlay directement en mode lockout (pas de form).
      const overlay = _creerOverlay();

      if (isLockedOut()) {
        _afficherLockout(overlay);
        return;
      }

      const input = overlay.querySelector("#kta-unlock-input");
      const form  = overlay.querySelector("#kta-unlock-form");
      const fb    = overlay.querySelector("#kta-unlock-feedback");

      // Focus champ après animation fade-in
      setTimeout(function() { if (input) input.focus(); }, 100);

      form.addEventListener("submit", function(e) {
        e.preventDefault();
        _onSubmit(overlay, input, fb);
      });

      // 🆕 v1.28.1 — Bouton 📖 Documentation (mode gate normale, pas lockout).
      const btnDoc = overlay.querySelector("#kta-unlock-readme-btn");
      if (btnDoc) btnDoc.addEventListener("click", _ouvrirDocReadme);

      // 🆕 v1.28.5 — Voie alternative "Ou importer ma licence pro".
      // L'user clique sur le bouton → file picker .json → import via
      // MyKTAMapProLicense.importFile() (réutilise tout le pipeline de
      // validation hash + storage local + bascule mode pro).
      // Si import OK : on set le flag unlock communautaire (= bypass définitif
      // pour les boots suivants) ET on résout la Promise de la gate
      // (équivalent à un unlock réussi via code).
      const btnLicence = overlay.querySelector("#kta-unlock-licence-btn");
      const inputLicence = overlay.querySelector("#kta-unlock-licence-input");
      if (btnLicence && inputLicence) {
        btnLicence.addEventListener("click", function() {
          inputLicence.value = ""; // permet de re-picker le même fichier
          inputLicence.click();
        });
        inputLicence.addEventListener("change", function() {
          const file = inputLicence.files && inputLicence.files[0];
          if (!file) return;
          if (!window.MyKTAMapProLicense || typeof window.MyKTAMapProLicense.importFile !== "function") {
            fb.innerHTML =
              '<div class="kta-unlock-error">' +
                '❌ Module de gestion des licences indisponible. Recharge la page.' +
              '</div>';
            return;
          }
          window.MyKTAMapProLicense.importFile(file).then(function(result) {
            if (result && result.ok) {
              // Set le flag unlock (= bypass définitif pour les boots suivants).
              // Cohérent : détenir une licence pro = canal légitime, pas besoin
              // de re-saisir le code partagé à chaque reload.
              try {
                localStorage.setItem(LS_UNLOCK, HASH_VALIDE);
                localStorage.removeItem(LS_ATTEMPTS);
              } catch(e) {}
              fb.innerHTML =
                '<div class="kta-unlock-success">' +
                  '✓ Licence pro acceptée — accès accordé' +
                '</div>';
              // Même flow de fade-out + résolve que l'unlock par code.
              setTimeout(function() {
                overlay.classList.add("kta-unlock-fading");
                setTimeout(function() {
                  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                  if (_resolveGate) {
                    const r = _resolveGate;
                    _resolveGate = null;
                    r(true);
                  }
                }, 250);
              }, 600);
            } else {
              const msg = (result && result.error) ? result.error : "Erreur inconnue.";
              fb.innerHTML =
                '<div class="kta-unlock-error">' +
                  '❌ Licence refusée : ' + msg.replace(/</g, "&lt;") +
                '</div>';
            }
          });
        });
      }

      // Si l'user avait déjà des tentatives ratées avant ce boot, on l'informe
      const ap = _getAttempts();
      if (ap > 0 && ap < MAX_ATTEMPTS) {
        fb.innerHTML =
          '<div class="kta-unlock-warn">' +
            '⚠️ Tentatives restantes : <strong>' + (MAX_ATTEMPTS - ap) + '</strong>' +
          '</div>';
      }
    });
  }

  // Retire la flag unlock du localStorage. Utilisé par viderCacheAppli
  // pour s'assurer qu'au reset l'app redemande bien le mdp.
  function lock() {
    try {
      localStorage.removeItem(LS_UNLOCK);
      localStorage.removeItem(LS_ATTEMPTS);
    } catch(e) {}
  }

  window.UnlockGate = {
    isUnlocked:  isUnlocked,
    isLockedOut: isLockedOut,
    ouvrirGate:  ouvrirGate,
    lock:        lock
  };

  console.log("[UnlockGate] Module chargé — unlock state :", isUnlocked());
})();
