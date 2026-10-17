/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// unlockGate.js — gate d'accès au premier lancement (re-demandée après un reset complet).
// Expose : window.UnlockGate (isUnlocked, isLockedOut, ouvrirGate, lock, markUnlockedViaLicensePro,
//   revaliderInstance, instanceRequiertMotDePasse).
// Deux écrans : instance qui publie `index.json > config.accessHash` → champ mot de passe, seul ce
//   mot de passe ouvre ; sinon → « Continuer », retenu sur l'appareil. Aucun mot de passe codé en dur,
//   aucun import de licence ici (seule une licence SERVEUR active le pro).
// ⚠️ Barrière SOCIALE, pas une authentification : le code est public, le hash se lit, le
//   localStorage se force en F12. Elle écarte les passants et les robots, pas un attaquant motivé.
// ⚠️ Verrou JAMAIS définitif (décision produit) : 5 échecs → temporisé, escaladé, comme pinLock.js.
// Garde-fous : scripts/check-gate-instance.js, scripts/check-filets-donnees.js ·
//   Doc : docs/architecture/security-legal.md

(function() {
  "use strict";

  // Mémorisé quand l'utilisateur continue sur une instance SANS mot de passe (ou par licence pro).
  const ACCES_LIBRE = "libre-v1";
  // 🩸 Migration seulement : hash de l'ancien code communautaire. JAMAIS comparé à une saisie ;
  // il reconnaît un appareil déjà déverrouillé, qui vaut « déjà choisi ».
  const HASH_HERITE = "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae";

  const LS_UNLOCK   = "myktamap_unlock_v1";       // hash accepté
  const LS_ATTEMPTS = "myktamap_unlock_attempts"; // tentatives échouées
  const MAX_ATTEMPTS = 5;
  // 🔒 Paliers 10 min → 1 h → 6 h → 24 h, persistés ; un code juste remet tout à zéro.
  const LS_LOCK        = "myktamap_unlock_lock_v1";   // { until, start, level }
  const LOCK_DELAYS_MS = [10 * 60 * 1000, 60 * 60 * 1000, 6 * 3600 * 1000, 24 * 3600 * 1000];
  let _lockTimer = null;
  function _fmtDuree(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return h + " h " + (m < 10 ? "0" + m : m) + " min";
    if (m > 0) return m + " min " + (sec < 10 ? "0" + sec : sec) + " s";
    return sec + " s";
  }
  function _getLock() {
    try { const o = JSON.parse(localStorage.getItem(LS_LOCK) || "null"); return (o && typeof o === "object") ? o : null; }
    catch(e) { return null; }
  }
  function _setLock(o) {
    try { if (o) localStorage.setItem(LS_LOCK, JSON.stringify(o)); else localStorage.removeItem(LS_LOCK); } catch(e) {}
  }
  function getLockRemainingMs() {
    const l = _getLock();
    if (!l || !l.until) return 0;
    return Math.max(0, l.until - Date.now());
  }

  // Mot de passe d'instance : son hash est publié dans `data/index.json > config.accessHash`.
  // ⚠️ Fichier PUBLIC : n'importe qui peut le télécharger et le brute-forcer hors ligne.
  // Barrière SOCIALE, jamais une authentification — ne jamais la présenter autrement.
  // 🩸 Seconde clé : mémorise le hash d'instance accepté. Hors ligne, l'index est injoignable et
  // isUnlocked() n'a rien d'autre ; sans elle, l'utilisateur serait reverrouillé hors ligne.
  const LS_UNLOCK_KIOSQUE = "myktamap_unlock_instance_v1";
  const RE_HASH = /^[0-9a-f]{64}$/;

  let _resolveGate = null;  // résout la Promise attendue par main.js

  async function _sha256(s) {
    if (!crypto || !crypto.subtle) {
      // Contexte non sécurisé (HTTP) : échouer plutôt qu'un hash bidon.
      throw new Error("Crypto SubtleCrypto indisponible — contexte non sécurisé (HTTP) ?");
    }
    const buf = new TextEncoder().encode(s);
    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hashBuf))
      .map(function(b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  function isUnlocked() {
    try {
      const v = localStorage.getItem(LS_UNLOCK);
      if (v === ACCES_LIBRE) return true;
      // Ancien code communautaire sans mémoire d'instance : vaut accès libre.
      // 🩸 LECTURE SEULE : appelée au chargement, AVANT revaliderInstance. Convertir ici effacerait
      // l'ancien hash, alors refusé par une instance au même mot de passe. Une instance qui en
      // impose un autre le révoque au démarrage en ligne (revaliderInstance).
      if (v === HASH_HERITE && !localStorage.getItem(LS_UNLOCK_KIOSQUE)) return true;
      // 🩸 Les deux valeurs doivent être non vides : deux `null` seraient « égaux » et ouvriraient tout.
      const k = localStorage.getItem(LS_UNLOCK_KIOSQUE);
      return !!(v && k && RE_HASH.test(k) && v === k);
    } catch(e) { return false; }
  }

  // Hash publié par l'instance. Lu seulement quand la gate s'ouvre : rien pour un appareil déverrouillé.
  // 🩸 La FORME (64 hexa) est validée : un mot de passe collé en clair ou un hash tronqué ne doit pas
  // devenir une valeur acceptée.
  async function _hashInstance() {
    try {
      // Config d'instance chargée une fois avant les gates (js/ktaInstance.js). Index injoignable →
      // dernière config connue : hors ligne, une instance protégée garde son mot de passe.
      let cfg = null;
      if (window.KtaInstance && typeof window.KtaInstance.charger === "function") {
        const st = await window.KtaInstance.charger();
        cfg = st ? st.config : null;
      } else {
        const r = await fetch("data/index.json", { cache: "no-store" });   // repli : module absent
        if (!r.ok) return null;
        const idx = await r.json();
        cfg = idx ? idx.config : null;
      }
      const h = cfg ? cfg.accessHash : null;
      if (typeof h !== "string") return null;
      const propre = h.trim().toLowerCase();
      if (!RE_HASH.test(propre)) {
        console.warn("[UnlockGate] config.accessHash ignoré : ce n'est pas un SHA-256 (64 hexa)");
        return null;
      }
      return propre;
    } catch(e) { return null; }
  }

  // 🔒 accessHash publié et valide ? Lu par main.js pour refuser le contournement par licence pro
  // LOCALE. 🩸 Échec réseau → false : fermer par défaut bloquerait un accès légitime au 1ᵉʳ contact
  // hors ligne ; le Service Worker sert l'index en cache dès la 2ᵉ visite.
  async function instanceRequiertMotDePasse() {
    return !!(await _hashInstance());
  }

  // Mot de passe d'instance changé ou retiré : l'ancien accès est oublié, ressaisie au PROCHAIN
  // démarrage — jamais de rechargement en pleine session (décision produit).
  function revaliderInstance(hashPublie, indexRepondu) {
    // 🩸 `null` a deux sens incompatibles : mot de passe retiré (reverrouiller) ou index injoignable
    // (ne rien toucher). L'appelant le DIT par `indexRepondu` ; sinon une coupure réseau reverrouillerait.
    if (indexRepondu !== true) return;
    try {
      const propre = (typeof hashPublie === "string") ? hashPublie.trim().toLowerCase() : null;
      const valide = !!(propre && RE_HASH.test(propre));
      const v = localStorage.getItem(LS_UNLOCK);
      if (!v) return;   // pas déverrouillé : rien à révoquer

      if (valide) {
        // 🔒 Seul le mot de passe de l'instance vaut : tout autre accès mémorisé (ancien code
        // communautaire, ancien mot de passe) est RÉVOQUÉ, sinon il survivrait à la fermeture.
        if (v !== propre) {
          localStorage.removeItem(LS_UNLOCK);
          localStorage.removeItem(LS_UNLOCK_KIOSQUE);
          console.log("[UnlockGate] accès révoqué : cette instance impose son propre mot de passe — ressaisie au prochain démarrage");
        } else {
          localStorage.setItem(LS_UNLOCK_KIOSQUE, propre);   // mémoire alignée sur l'accès en cours
        }
      } else {
        // Plus de mot de passe : un accès entré par l'ancien est révoqué, l'écran proposera « Continuer ».
        const memo = localStorage.getItem(LS_UNLOCK_KIOSQUE);
        if (memo) {
          localStorage.removeItem(LS_UNLOCK_KIOSQUE);
          if (v === memo) localStorage.removeItem(LS_UNLOCK);
          console.log("[UnlockGate] mot de passe d'instance retiré — ressaisie au prochain démarrage");
        }
      }
    } catch(e) {}
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
    const l = _getLock();
    if (!l || !l.until) return false;
    const now = Date.now();
    if (l.start && now < l.start) return true;   // horloge reculée → toujours verrouillé
    return now < l.until;
  }

  // 🏷️ ancre:gate-fin-isLockedOut
  // ── Rendu ──────────────────────────────
  // Libellés de langue = métadonnées de I18n.available(), rien à traduire.
  function _langsHtml() {
    if (!window.I18n || typeof window.I18n.available !== "function") return "";
    const active = (typeof window.I18n.getLang === "function") ? window.I18n.getLang() : "fr";
    return window.I18n.available().map(function(l) {
      return '<button type="button" class="kta-unlock-lang-btn' + (l.code === active ? " kta-actif" : "") +
             '" data-lang="' + l.code + '" title="' + l.label + '">' + l.flag + " " + l.code.toUpperCase() + '</button>';
    }).join("");
  }

  // mode : "instance" (mot de passe publié par l'index) | "libre" (aucun).
  function _creerOverlay(mode) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const libre = mode === "libre";
    const o = document.createElement("div");
    o.id = "kta-unlock-overlay";
    o.innerHTML =
      '<div class="kta-unlock-box">' +
        // Première gate du parcours : la langue choisie ici est la langue GLOBALE (I18n.setLang).
        '<div class="kta-unlock-langs" role="group" aria-label="Language">' + _langsHtml() + '</div>' +
        '<div class="kta-unlock-icon">' + (libre ? '🧭' : '🗝️') + '</div>' +
        '<div class="kta-unlock-titre">' + t(libre ? "gate.libre.titre" : "gate.titre") + '</div>' +
        (libre ? '' : '<p class="kta-unlock-info">' + t("gate.info") + '</p>') +
        // Liens sortants seulement : aucun impact CSP.
        '<div class="kta-unlock-contact" style="margin:0 0 14px; font-size:12px; color:#a8b3c8; line-height:1.7;">' +
          t("gate.contact") +
        '</div>' +
        (libre
          ? '<button type="button" id="kta-unlock-libre-btn" class="kta-btn kta-btn-primary kta-unlock-libre-btn">' +
              t("gate.libre.continuer") +
            '</button>'
          : '<form id="kta-unlock-form" autocomplete="off">' +
              '<input type="password" id="kta-unlock-input" placeholder="' + t("gate.placeholder") + '" ' +
                     'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
              '<button type="submit" id="kta-unlock-btn" class="kta-btn kta-btn-primary">' +
                t("gate.unlockBtn") +
              '</button>' +
            '</form>') +
        '<div class="kta-unlock-feedback" id="kta-unlock-feedback"></div>' +
        '<button type="button" id="kta-unlock-readme-btn" class="kta-gate-readme-btn" title="' + t("gate.docTitle") + '">' +
          t("gate.docBtn") +
        '</button>' +
        '<div class="kta-unlock-signature">' +
          '© 2026 Flavien VIDAL (alias KARMA) — CC BY-NC-SA 4.0' +
        '</div>' +
      '</div>';
    document.body.appendChild(o);
    return o;
  }

  // Doc au-dessus de la gate (overLocker : z-index 100200 > 100100), sans le tutoriel (hideOnboarding).
  // interface.js pas encore chargé : no-op.
  function _ouvrirDocReadme() {
    if (typeof window.afficherReadme === "function") {
      window.afficherReadme({ hideOnboarding: true, overLocker: true });
    } else {
      console.warn("[UnlockGate] afficherReadme indisponible (interface.js pas encore chargé)");
    }
  }

  // Verrou temporisé : champ caché, compte à rebours, puis _monterGate (la Promise survit).
  // 🩸 AUCUN bouton de reset ici (décision produit) : un reset relancerait la gate et contournerait
  // le verrou. Qui n'a pas le code attend ou vide lui-même le navigateur.
  function _afficherLockout(overlay) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const form = overlay.querySelector("#kta-unlock-form");
    const fb   = overlay.querySelector("#kta-unlock-feedback");
    if (form) form.style.display = "none";
    if (_lockTimer) { clearInterval(_lockTimer); _lockTimer = null; }
    _lockTimer = setInterval(function() {
      if (!isLockedOut()) {
        clearInterval(_lockTimer); _lockTimer = null;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        _monterGate();
        return;
      }
      const cd = overlay.querySelector("#kta-unlock-lock-countdown");
      if (cd) cd.textContent = _fmtDuree(getLockRemainingMs());
    }, 1000);
    if (fb) {
      fb.innerHTML =
        '<div class="kta-unlock-lockout">' +
          '<div class="kta-unlock-lockout-titre">' + t("gate.lockout.titre") + '</div>' +
          '<div class="kta-unlock-lockout-msg">' + t("gate.lockout.msg") + '</div>' +
          '<p style="margin:8px 0 2px; font-size:12px; color:#a8b3c8;">' + t("gate.lockout.attente") + '</p>' +
          '<div class="kta-unlock-lockout-countdown" id="kta-unlock-lock-countdown">' + _fmtDuree(getLockRemainingMs()) + '</div>' +
          '<div class="kta-unlock-lockout-hint">' +
            t("gate.lockout.hint") +
          '</div>' +
          '<div class="kta-unlock-lockout-contact" style="margin-top:10px; font-size:12px; color:#a8b3c8; line-height:1.7;">' +
            t("gate.contact") +
          '</div>' +
          // Doc lisible pendant le verrou ; ne change rien au verrouillage.
          '<button type="button" id="kta-unlock-readme-btn-lockout" class="kta-gate-readme-btn" style="margin-top:14px;" title="' + t("gate.docTitle") + '">' +
            t("gate.docBtn") +
          '</button>' +
        '</div>';
      const btnDocLockout = overlay.querySelector("#kta-unlock-readme-btn-lockout");
      if (btnDocLockout) btnDocLockout.addEventListener("click", _ouvrirDocReadme);
    }
  }

  // ── Saisie ──────────────────────────────
  async function _onSubmit(overlay, input, fb) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const value = (input.value || "").trim();
    if (!value) {
      fb.innerHTML = '<div class="kta-unlock-error">' + t("gate.err.empty") + '</div>';
      return;
    }

    let hashed;
    try {
      hashed = await _sha256(value);
    } catch (e) {
      fb.innerHTML = '<div class="kta-unlock-error">' + t("gate.err.crypto", { err: (e.message || e) }) + '</div>';
      return;
    }

    // 🔒 Seul le mot de passe publié par l'instance ouvre : un code largement distribué ouvrirait
    // toute instance privée. Le hash est relu à chaque tentative (négligeable : la gate est rare ;
    // hors ligne, le Service Worker sert l'index en cache).
    const hashInstance = await _hashInstance();
    const okInstance   = !!(hashInstance && hashed === hashInstance);

    if (okInstance) {
      try {
        localStorage.setItem(LS_UNLOCK, hashed);
        // 🩸 Sans cette mémoire, isUnlocked() ne reconnaît plus l'accès hors ligne.
        localStorage.setItem(LS_UNLOCK_KIOSQUE, hashInstance);
        localStorage.removeItem(LS_ATTEMPTS);
        localStorage.removeItem(LS_LOCK);
      } catch(e) {}
      fb.innerHTML = '<div class="kta-unlock-success">' + t("gate.success") + '</div>';
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
      const attempts = _getAttempts() + 1;
      _setAttempts(attempts);
      input.value = "";
      input.focus();

      if (attempts >= MAX_ATTEMPTS) {
        // Palier suivant, compteur remis à zéro ; la Promise reste en attente jusqu'au bon code.
        const prev  = _getLock();
        const lvl   = (prev && prev.level) || 0;
        const delai = LOCK_DELAYS_MS[Math.min(lvl, LOCK_DELAYS_MS.length - 1)];
        const now   = Date.now();
        _setLock({ until: now + delai, start: now, level: lvl + 1 });
        _setAttempts(0);
        console.warn("[UnlockGate] Verrou temporisé :", _fmtDuree(delai), "(palier", (lvl + 1) + ")");
        _afficherLockout(overlay);
      } else {
        const reste = MAX_ATTEMPTS - attempts;
        fb.innerHTML =
          '<div class="kta-unlock-error">' +
            t("gate.err.incorrect", { n: reste }) +
          '</div>';
      }
    }
  }

  // ── API ──────────────────────────────
  // Promise résolue `true` au déverrouillage ; pendant un verrou, elle attend. main.js l'attend.
  // ⚠️ _monterGate redessine (langue, fin de verrou) SANS toucher la Promise : _resolveGate survit.
  function ouvrirGate() {
    return new Promise(function(resolve) {
      _resolveGate = resolve;
      _monterGate();
    });
  }

  function _monterGate() {
    // Le mode dépend du hash d'instance, lu avant de dessiner (config déjà en mémoire).
    _hashInstance().catch(function() { return null; }).then(function(h) { _monterGateMode(h); });
  }

  // Sortie commune : fondu, retrait de l'écran, promesse résolue.
  function _libererGate(overlay, delai) {
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
    }, delai);
  }

  function _monterGateMode(hashInstance) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    (function() {
      const libre = !hashInstance;
      const overlay = _creerOverlay(libre ? "libre" : "instance");

      overlay.querySelectorAll(".kta-unlock-lang-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const code = btn.dataset.lang;
          if (!window.I18n || typeof window.I18n.setLang !== "function") return;
          window.I18n.setLang(code).then(function() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            _monterGate();
          }).catch(function(e) { console.warn("[UnlockGate] setLang :", e); });
        });
      });

      if (libre) {
        const btnLibre = overlay.querySelector("#kta-unlock-libre-btn");
        if (btnLibre) {
          setTimeout(function() { btnLibre.focus(); }, 100);
          btnLibre.addEventListener("click", function() {
            try {
              localStorage.setItem(LS_UNLOCK, ACCES_LIBRE);
              localStorage.removeItem(LS_UNLOCK_KIOSQUE);
              localStorage.removeItem(LS_ATTEMPTS);
            } catch(e) {}
            btnLibre.disabled = true;
            _libererGate(overlay, 0);
          });
        }
      }

      // Le verrou ne s'applique qu'à l'écran avec mot de passe.
      if (!libre && isLockedOut()) {
        _afficherLockout(overlay);
        return;
      }

      const input = overlay.querySelector("#kta-unlock-input");
      const form  = overlay.querySelector("#kta-unlock-form");
      const fb    = overlay.querySelector("#kta-unlock-feedback");

      if (input) setTimeout(function() { input.focus(); }, 100);

      if (form) form.addEventListener("submit", function(e) {
        e.preventDefault();
        _onSubmit(overlay, input, fb);
      });

      const btnDoc = overlay.querySelector("#kta-unlock-readme-btn");
      if (btnDoc) btnDoc.addEventListener("click", _ouvrirDocReadme);

      const ap = _getAttempts();
      if (ap > 0 && ap < MAX_ATTEMPTS) {
        fb.innerHTML =
          '<div class="kta-unlock-warn">' +
            t("gate.warn.remaining", { n: (MAX_ATTEMPTS - ap) }) +
          '</div>';
      }
    })();
  }

  // Appelé par la réinitialisation du cache : la gate sera redemandée.
  function lock() {
    try {
      localStorage.removeItem(LS_UNLOCK);
      localStorage.removeItem(LS_ATTEMPTS);
    } catch(e) {}
  }

  // Licence pro SERVEUR détectée (/Licence-pro.json de l'installation) ; appelé par main.js après isPro().
  function markUnlockedViaLicensePro() {
    try {
      localStorage.setItem(LS_UNLOCK, ACCES_LIBRE);
      localStorage.removeItem(LS_ATTEMPTS);
    } catch(e) {}
  }

  window.UnlockGate = {
    isUnlocked:  isUnlocked,
    isLockedOut: isLockedOut,
    ouvrirGate:  ouvrirGate,
    lock:        lock,
    markUnlockedViaLicensePro: markUnlockedViaLicensePro,
    revaliderInstance: revaliderInstance,
    instanceRequiertMotDePasse: instanceRequiertMotDePasse
  };

  console.log("[UnlockGate] Module chargé — unlock state :", isUnlocked());
})();
