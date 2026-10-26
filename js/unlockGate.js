/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// unlockGate.js — gate d'accès au premier lancement (re-demandée après un reset complet).
// Expose : window.UnlockGate (isUnlocked, isLockedOut, ouvrirGate, lock, markUnlockedViaLicensePro,
//   revaliderInstance, instanceRequiertMotDePasse, visiteDemandee).
// Écran : la présentation « Bienvenue » (js/bienvenue.js + css/bienvenue.css, chargés à la demande). Instance qui
//   publie `index.json > config.accessHash` → champ « Code d'accès » dans son en-tête, seul ce mot de passe ouvre ;
//   sinon → bouton « Entrer », retenu sur l'appareil. Repli si ces fichiers manquent : la carte centrée (champ ou
//   « Entrer »). Saisie, compteur d'essais et verrou communs aux deux (_essayerCode). Aucun mot de passe codé en
//   dur, aucun import de licence ici (seule une licence SERVEUR active le pro).
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
  // « Découvrir l'app en 1 minute » choisi sur l'écran Bienvenue : lu par js/firstRunFlow.js (visite guidée).
  let _visiteDemandee = false;
  // 🔒 Vrai seulement après un code juste (_essayerCode) : la sortie de l'écran Bienvenue d'une instance protégée
  // ne résout la gate qu'à cette condition, quel que soit le bouton qui l'a déclenchée.
  let _codeAccepte = false;

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

  // Carte centrée de REPLI (écran Bienvenue introuvable). mode : "instance" (mot de passe publié par l'index, champ)
  // | "libre" (aucun : bouton « Entrer »).
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
        // ⚠️ Contacts de l'auteur seulement sur l'écran libre : une instance à mot de passe est gérée par quelqu'un
        // d'autre (auto-hébergement), le code se demande à cette personne, jamais à l'auteur. Liens sortants : sans CSP.
        (libre
          ? '<div class="kta-unlock-contact" style="margin:0 0 14px; font-size:12px; color:var(--kta-texte-3); line-height:1.7;">' +
              t("gate.contact") +
            '</div>'
          : '') +
        (libre
          ? '<button type="button" id="kta-unlock-libre-btn" class="kta-btn kta-btn-primary kta-unlock-libre-btn">' +
              t("bienvenue.entrer") +
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

  // Verrou temporisé sur la carte de repli : champ caché, compte à rebours, puis _monterGate (la Promise survit).
  // L'écran Bienvenue affiche le sien dans la zone du champ (js/bienvenue.js).
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
          '<p style="margin:8px 0 2px; font-size:12px; color:var(--kta-texte-3);">' + t("gate.lockout.attente") + '</p>' +
          '<div class="kta-unlock-lockout-countdown" id="kta-unlock-lock-countdown">' + _fmtDuree(getLockRemainingMs()) + '</div>' +
          '<div class="kta-unlock-lockout-hint">' +
            t("gate.lockout.hint") +
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
  // Un essai de code, sans interface : partagé par l'écran Bienvenue et la carte de repli.
  // Rend { etat: "ok" | "vide" | "crypto" | "faux" | "verrou", reste?, err? } ; « verrou » = ce 5ᵉ échec vient de
  // poser le verrou temporisé (la Promise de ouvrirGate reste en attente jusqu'au bon code).
  async function _essayerCode(valeur) {
    if (isLockedOut()) return { etat: "verrou" };
    const value = (valeur || "").trim();
    if (!value) return { etat: "vide" };

    let hashed;
    try {
      hashed = await _sha256(value);
    } catch (e) {
      return { etat: "crypto", err: (e.message || String(e)) };
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
      _codeAccepte = true;
      return { etat: "ok" };
    } else {
      const attempts = _getAttempts() + 1;
      _setAttempts(attempts);

      if (attempts >= MAX_ATTEMPTS) {
        // Palier suivant, compteur remis à zéro ; la Promise reste en attente jusqu'au bon code.
        const prev  = _getLock();
        const lvl   = (prev && prev.level) || 0;
        const delai = LOCK_DELAYS_MS[Math.min(lvl, LOCK_DELAYS_MS.length - 1)];
        const now   = Date.now();
        _setLock({ until: now + delai, start: now, level: lvl + 1 });
        _setAttempts(0);
        console.warn("[UnlockGate] Verrou temporisé :", _fmtDuree(delai), "(palier", (lvl + 1) + ")");
        return { etat: "verrou" };
      } else {
        return { etat: "faux", reste: MAX_ATTEMPTS - attempts };
      }
    }
  }

  // État de la saisie pour l'écran qui l'affiche : verrou en cours (et temps restant, déjà mis en forme), essais
  // restants quand une série d'échecs est entamée (sinon null).
  function _etatCode() {
    const ap = _getAttempts();
    return { verrou: isLockedOut(), attente: _fmtDuree(getLockRemainingMs()),
      restants: (ap > 0 && ap < MAX_ATTEMPTS) ? (MAX_ATTEMPTS - ap) : null };
  }

  // Carte de repli : rend le résultat d'un essai dans son propre retour.
  async function _onSubmit(overlay, input, fb) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const r = await _essayerCode(input.value);
    if (r.etat === "ok") {
      fb.innerHTML = '<div class="kta-unlock-success">' + t("gate.success") + '</div>';
      _libererGate(overlay, 400);
      return;
    }
    if (r.etat === "vide") { fb.innerHTML = '<div class="kta-unlock-error">' + t("gate.err.empty") + '</div>'; return; }
    if (r.etat === "crypto") {
      fb.innerHTML = '<div class="kta-unlock-error">' + t("gate.err.crypto", { err: r.err }) + '</div>';
      return;
    }
    input.value = "";
    input.focus();
    if (r.etat === "verrou") _afficherLockout(overlay);
    else fb.innerHTML = '<div class="kta-unlock-error">' + t("gate.err.incorrect", { n: r.reste }) + '</div>';
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

  // Accès libre retenu sur l'appareil (« Entrer ») : la mémoire d'un ancien mot de passe d'instance est effacée.
  function _memoriserAccesLibre() {
    try {
      localStorage.setItem(LS_UNLOCK, ACCES_LIBRE);
      localStorage.removeItem(LS_UNLOCK_KIOSQUE);
      localStorage.removeItem(LS_ATTEMPTS);
    } catch(e) {}
    _marquerVisiteProposee();
  }

  // Visite guidée proposée sur l'écran Bienvenue (« Découvrir l'app en 1 minute »), avec ou sans mot de passe : plus
  // jamais imposée au lancement (js/firstRunFlow.js ne l'ouvre que demandée, ou quand rien ne l'a marquée vue).
  function _marquerVisiteProposee() {
    if (window.Tutorial && typeof window.Tutorial.markAsSeen === "function") window.Tutorial.markAsSeen();
  }

  function _resoudre() {
    if (_resolveGate) {
      const r = _resolveGate;
      _resolveGate = null;
      r(true);
    }
  }

  // Écran Bienvenue : feuille de style et script chargés seulement ici, pour que ni eux ni les polices ne pèsent sur
  // l'app. Précachés (sw.js) : disponibles hors ligne.
  // 🩸 Rend false si l'un manque (cache incomplet, 404) ou tarde : la carte de repli prend le relais, jamais
  // d'écran vide qui bloquerait l'entrée.
  const DELAI_BIENVENUE_MS = 4000;
  function _chargerBienvenue() {
    if (window.KtaBienvenue && document.getElementById("kta-bv-css")) return Promise.resolve(true);
    const charger = function(el) {
      return new Promise(function(resolve) {
        el.addEventListener("load", function() { resolve(true); });
        el.addEventListener("error", function() { resolve(false); });
        document.head.appendChild(el);
      });
    };
    const css = document.createElement("link");
    css.id = "kta-bv-css";
    css.rel = "stylesheet";
    css.href = "css/bienvenue.css";
    const js = document.createElement("script");
    js.src = "js/bienvenue.js";
    const tout = Promise.all([charger(css), window.KtaBienvenue ? Promise.resolve(true) : charger(js)])
      .then(function(r) { return r[0] && r[1] && !!window.KtaBienvenue; });
    const delai = new Promise(function(resolve) { setTimeout(function() { resolve(false); }, DELAI_BIENVENUE_MS); });
    return Promise.race([tout, delai]);
  }

  // hashInstance non nul : l'écran porte le champ « Code d'accès » et n'entre qu'après un code juste.
  function _monterBienvenue(hashInstance) {
    _chargerBienvenue().catch(function() { return false; }).then(function(pret) {
      if (!pret) {
        console.warn("[UnlockGate] écran Bienvenue indisponible : carte de repli");
        _monterGateMode(hashInstance, true);
        return;
      }
      if (hashInstance) {
        // 🔒 Rien n'est mémorisé ici : l'accès l'a été par _essayerCode (hash d'instance), jamais en libre-v1.
        // Visite guidée proposée comme sans mot de passe : marquée vue à l'entrée (après un code juste).
        window.KtaBienvenue.ouvrir({
          code: { essayer: _essayerCode, etat: _etatCode },
          surDoc: _ouvrirDocReadme,
          surEntree: function(visite) {
            _visiteDemandee = !!visite;
            _marquerVisiteProposee();
          },
          surFin: function() {
            if (_codeAccepte) _resoudre();
            else _monterGate();   // sortie sans code juste (forcée) : l'écran revient, la Promise attend
          }
        });
        return;
      }
      window.KtaBienvenue.ouvrir({
        surDoc: _ouvrirDocReadme,
        surEntree: function(visite) {
          _visiteDemandee = !!visite;
          _memoriserAccesLibre();
        },
        surFin: _resoudre
      });
    });
  }

  // Sortie commune : fondu, retrait de l'écran, promesse résolue.
  function _libererGate(overlay, delai) {
    setTimeout(function() {
      overlay.classList.add("kta-unlock-fading");
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        _resoudre();
      }, 250);
    }, delai);
  }

  // repli faux : l'écran Bienvenue (avec ou sans champ). repli vrai : il n'a pas pu se charger → carte centrée,
  // champ si l'instance publie un mot de passe, « Entrer » sinon.
  function _monterGateMode(hashInstance, repli) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    if (!repli) { _monterBienvenue(hashInstance); return; }
    const libre = !hashInstance;
    const overlay = _creerOverlay(libre ? "libre" : "instance");

    overlay.querySelectorAll(".kta-unlock-lang-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const code = btn.dataset.lang;
        if (!window.I18n || typeof window.I18n.setLang !== "function") return;
        window.I18n.setLang(code).then(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          _monterGateMode(hashInstance, true);
        }).catch(function(e) { console.warn("[UnlockGate] setLang :", e); });
      });
    });

    if (libre) {
      const btnLibre = overlay.querySelector("#kta-unlock-libre-btn");
      if (btnLibre) {
        setTimeout(function() { btnLibre.focus(); }, 100);
        btnLibre.addEventListener("click", function() {
          _memoriserAccesLibre();
          btnLibre.disabled = true;
          _libererGate(overlay, 0);
        });
      }
    }

    const btnDoc = overlay.querySelector("#kta-unlock-readme-btn");
    if (btnDoc) btnDoc.addEventListener("click", _ouvrirDocReadme);

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

    const restants = _etatCode().restants;
    if (!libre && restants) {
      fb.innerHTML = '<div class="kta-unlock-warn">' + t("gate.warn.remaining", { n: restants }) + '</div>';
    }
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
    instanceRequiertMotDePasse: instanceRequiertMotDePasse,
    visiteDemandee: function() { return _visiteDemandee; }
  };

  console.log("[UnlockGate] Module chargé — unlock state :", isUnlocked());
})();
