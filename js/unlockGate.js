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
  // 🔒 M2 (décision KARMA 13/09/2026, audit B7) : verrou TEMPORISÉ et escaladé
  // (10 min → 1 h → 6 h → 24 h) à la place du verrou définitif. Palier et
  // échéance persistés ; un code juste remet tout à zéro. Base de temps =
  // horloge de l'appareil (cf pinLock.js, même règle).
  const LS_LOCK        = "myktamap_unlock_lock_v1";   // { until, start, level }
  const LOCK_DELAYS_MS = [10 * 60 * 1000, 60 * 60 * 1000, 6 * 3600 * 1000, 24 * 3600 * 1000];
  let _lockTimer = null;
  // ⏳ Durée lisible pour le compte à rebours du verrou.
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

  // 🔑 v1.90.6 (demande KARMA) — MOT DE PASSE PROPRE À UNE INSTANCE SERVEUR.
  // Une instance auto-hébergée peut publier SON hash dans
  // `data/index.json > config.accessHash`. Deux mots de passe ouvrent alors
  // l'app : celui de la communauté (hardcodé ci-dessus, inchangé) et celui du
  // déployeur. Aucun ne remplace l'autre — un kiosque n'a pas à distribuer le
  // code communautaire à ses membres, et l'auteur n'a pas à connaître celui du
  // kiosque.
  //
  // ⚠️ MÊME NIVEAU DE SÉCURITÉ QUE CI-DESSUS, PAS MOINS, PAS PLUS. Le hash est
  // dans un fichier PUBLIC : n'importe qui peut le télécharger et le
  // brute-forcer hors ligne. C'est exactement la situation du hash communautaire,
  // lisible sur GitHub depuis toujours. Barrière SOCIALE, jamais une
  // authentification — et ce serait mentir que de le présenter autrement.
  //
  // 🩸 CE QUI EST MÉMORISÉ, ET POURQUOI. Le hash accepté est écrit dans
  // `LS_UNLOCK`, comme avant. Mais `isUnlocked()` compare à `HASH_VALIDE` : un
  // utilisateur entré par le mot de passe du kiosque serait donc REVERROUILLÉ
  // au premier démarrage hors-ligne, quand l'index n'est pas joignable. D'où
  // cette seconde clé : elle se souvient du hash d'instance accepté, sans quoi
  // la fonctionnalité serait inutilisable justement là où l'app sert le plus.
  const LS_UNLOCK_KIOSQUE = "myktamap_unlock_instance_v1";
  const RE_HASH = /^[0-9a-f]{64}$/;

  // État interne
  let _resolveGate = null;  // Promise resolver pour main.js qui attend

  // 🔒 v1.90.8 — Vrai quand la gate courante est montée sur une instance qui
  // publie un `accessHash` valide. Sert à RETIRER le bloc « importer ma licence
  // pro » de l'écran : sur une instance protégée, une licence importée par
  // l'utilisateur ne doit pas être un contournement du mot de passe du
  // déployeur. Remis à false à chaque (re)montage de la gate.
  let _instanceProtegeeGate = false;

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
    try {
      const v = localStorage.getItem(LS_UNLOCK);
      if (v === HASH_VALIDE) return true;
      // 🩸 Le hash d'instance mémorisé, lu SANS réseau : hors-ligne, c'est la
      // seule chose qui empêche de reverrouiller quelqu'un qui est entré
      // légitimement. La comparaison exige les deux valeurs non vides — sans
      // ce garde, deux `null` seraient « égaux » et déverrouilleraient tout.
      const k = localStorage.getItem(LS_UNLOCK_KIOSQUE);
      return !!(v && k && RE_HASH.test(k) && v === k);
    } catch(e) { return false; }
  }

  // Lit le hash publié par l'instance. Appelé UNIQUEMENT quand la gate
  // s'ouvre — c'est-à-dire à la première installation ou après un reset — donc
  // aucune requête ajoutée pour un utilisateur déjà déverrouillé.
  // 🩸 On valide la FORME (64 hexa) avant de s'en servir : un `accessHash`
  // fautif (mot de passe collé en clair, hash tronqué) ne doit pas devenir une
  // valeur acceptée par comparaison de chaînes.
  async function _hashInstance() {
    try {
      const r = await fetch("data/index.json", { cache: "no-store" });
      if (!r.ok) return null;
      const idx = await r.json();
      const h = idx && idx.config ? idx.config.accessHash : null;
      if (typeof h !== "string") return null;
      const propre = h.trim().toLowerCase();
      if (!RE_HASH.test(propre)) {
        console.warn("[UnlockGate] config.accessHash ignoré : ce n'est pas un SHA-256 (64 hexa)");
        return null;
      }
      return propre;
    } catch(e) { return null; }
  }

  // 🔒 v1.90.8 — L'instance impose-t-elle un mot de passe d'accès ? (accessHash
  // publié et valide.) Async : demande l'index. Utilisé par main.js pour
  // refuser le bypass d'une licence pro LOCALE, et par la gate pour masquer le
  // bloc d'import. 🩸 Échec réseau → false : hors-ligne au 1ᵉʳ contact, on ne
  // peut pas savoir, et fermer par défaut bloquerait un accès légitime — le
  // Service Worker sert l'index en cache dès la 2ᵉ visite.
  async function instanceRequiertMotDePasse() {
    return !!(await _hashInstance());
  }

  // 🔑 v1.90.6 — Le déployeur a changé son mot de passe : on oublie l'ancien,
  // et l'utilisateur le ressaisira au PROCHAIN démarrage. On ne recharge pas la
  // page en pleine session — couper quelqu'un au milieu de son relevé pour une
  // rotation de mot de passe serait pire que le délai d'un boot.
  // 🩸 Appelé UNIQUEMENT quand l'index a répondu : hors-ligne, on ne touche à
  // rien, sinon une coupure réseau reverrouillerait l'app.
  function revaliderInstance(hashPublie, indexRepondu) {
    // 🩸 `null` VEUT DIRE DEUX CHOSES INCOMPATIBLES : « l index a repondu et le
    // mot de passe a ete retire » (reverrouiller) et « l index est injoignable »
    // (ne toucher a rien). La fonction ne peut pas les deviner, donc l appelant
    // le DIT. Sans ce parametre, la sureté reposait sur la discipline d un site
    // d appel situe a 1800 lignes de la -- et un futur appel de bonne foi
    // reverrouillerait l app a la premiere coupure reseau.
    if (indexRepondu !== true) return;   // hors-ligne / index absent : on ne touche à rien
    try {
      const propre = (typeof hashPublie === "string") ? hashPublie.trim().toLowerCase() : null;
      const valide = !!(propre && RE_HASH.test(propre));
      const v = localStorage.getItem(LS_UNLOCK);
      if (!v) return;   // pas déverrouillé : rien à révoquer

      if (valide) {
        // 🔒 L'instance impose un mot de passe : le SEUL accès valable est le
        // sien. Tout autre déverrouillage mémorisé — le code communautaire
        // « hérité » d'avant que l'instance ne pose son mot de passe, ou un
        // ancien mot de passe d'instance — est RÉVOQUÉ. Sans ça, un accès
        // communautaire acquis quand l'instance était ouverte y survivrait,
        // rouvrant exactement le trou que le refus au submit vient de fermer.
        if (v !== propre) {
          localStorage.removeItem(LS_UNLOCK);
          localStorage.removeItem(LS_UNLOCK_KIOSQUE);
          console.log("[UnlockGate] accès révoqué : cette instance impose son propre mot de passe — ressaisie au prochain démarrage");
        } else {
          localStorage.setItem(LS_UNLOCK_KIOSQUE, propre);   // mémoire alignée sur l'accès en cours
        }
      } else {
        // Pas (ou plus) de mot de passe d'instance : seul le code communautaire
        // vaut désormais. Un accès entré via un mot de passe d'instance (mémoire
        // présente) est révoqué — retirer le mot de passe ne doit pas laisser un
        // accès dont le hash n'est plus le code communautaire.
        const memo = localStorage.getItem(LS_UNLOCK_KIOSQUE);
        if (memo) {
          localStorage.removeItem(LS_UNLOCK_KIOSQUE);
          if (v === memo && v !== HASH_VALIDE) localStorage.removeItem(LS_UNLOCK);
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

  // =========================================================================
  // RENDU OVERLAY
  // =========================================================================
  // Crée l'overlay plein écran avec champ de saisie, bouton et signature.
  // Style charte MyKTAMap (gradient noir, accent jaune #f4c542).
  // 🌍 v1.79.4 — rang de langues de la gate (drapeau + code natif, actif
  // surligné). Libellés = métadonnées de I18n.available(), rien à traduire.
  function _langsHtml() {
    if (!window.I18n || typeof window.I18n.available !== "function") return "";
    const active = (typeof window.I18n.getLang === "function") ? window.I18n.getLang() : "fr";
    return window.I18n.available().map(function(l) {
      return '<button type="button" class="kta-unlock-lang-btn' + (l.code === active ? " kta-actif" : "") +
             '" data-lang="' + l.code + '" title="' + l.label + '">' + l.flag + " " + l.code.toUpperCase() + '</button>';
    }).join("");
  }

  function _creerOverlay() {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const o = document.createElement("div");
    o.id = "kta-unlock-overlay";
    o.innerHTML =
      '<div class="kta-unlock-box">' +
        // 🌍 v1.79.4 (demande KARMA « choisir sa langue au premier
        // lancement ») — le choix de langue vit sur la TOUTE PREMIÈRE gate :
        // il pilote la langue GLOBALE (I18n.setLang, même clé que ⚙️ Config)
        // → tout le funnel suit (gate légale, tutoriel, home). Pré-sélection
        // = langue détectée (navigator.language, mécanisme existant).
        '<div class="kta-unlock-langs" role="group" aria-label="Language">' + _langsHtml() + '</div>' +
        '<div class="kta-unlock-icon">🗝️</div>' +
        '<div class="kta-unlock-titre">' + t("gate.titre") + '</div>' +
        '<p class="kta-unlock-info">' +
          t("gate.info") +
        '</p>' +
        // 🆕 v1.28.0 — Vrais canaux de contact (avant : « contacte l'auteur »
        // sans aucun canal). Liens sortants uniquement → aucun impact CSP.
        '<div class="kta-unlock-contact" style="margin:0 0 14px; font-size:12px; color:#a8b3c8; line-height:1.7;">' +
          t("gate.contact") +
        '</div>' +
        '<form id="kta-unlock-form" autocomplete="off">' +
          '<input type="password" id="kta-unlock-input" placeholder="' + t("gate.placeholder") + '" ' +
                 'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
          '<button type="submit" id="kta-unlock-btn" class="kta-btn kta-btn-primary">' +
            t("gate.unlockBtn") +
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
          '<span class="kta-unlock-separator-text">' + t("gate.separatorOr") + '</span>' +
          '<span class="kta-unlock-separator-line"></span>' +
        '</div>' +
        '<div class="kta-unlock-licence-block kta-licence-community">' +
          '<p class="kta-unlock-licence-info">' +
            t("gate.licence.info") +
          '</p>' +
          '<button type="button" id="kta-unlock-licence-btn" class="kta-btn kta-btn-secondary kta-unlock-licence-btn">' +
            t("gate.licence.importBtn") +
          '</button>' +
          '<input type="file" id="kta-unlock-licence-input" accept=".json,application/json" style="display:none;">' +
        '</div>' +
        // 🆕 v1.28.1 — Bouton 📖 Documentation accessible depuis l'écran de
        // verrouillage. Permet à un user qui doute (« c'est quoi ce projet ? »,
        // « pourquoi un code ? ») de lire le README utilisateur sans devoir
        // entrer. L'onboarding (🎓) est volontairement masqué : sans accès à
        // l'app, le tutoriel n'a pas de sens.
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

  // Verrou TEMPORISÉ (M2, 13/09/2026) : champ caché, compte à rebours ; à
  // l'expiration la gate est remontée (_monterGate, la Promise survit — même
  // mécanisme que le changement de langue). Toujours AUCUN bouton de reset :
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
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const form = overlay.querySelector("#kta-unlock-form");
    const fb   = overlay.querySelector("#kta-unlock-feedback");
    if (form) form.style.display = "none";
    // ⏳ M2 : compte à rebours ; à l'expiration, on remonte la gate.
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
          // 🆕 v1.28.0 — Canaux explicites (avant : « contacte l'auteur » sans canal).
          '<div class="kta-unlock-lockout-contact" style="margin-top:10px; font-size:12px; color:#a8b3c8; line-height:1.7;">' +
            t("gate.contact") +
          '</div>' +
          // 🆕 v1.28.1 — Accès doc utilisateur même en lockout : si l'user est
          // bloqué et veut comprendre ce qu'est l'app avant de réinstaller
          // OU contacter l'auteur, il peut lire le README. Ne touche en rien
          // au verrouillage : ouvre juste un modal info par-dessus.
          '<button type="button" id="kta-unlock-readme-btn-lockout" class="kta-gate-readme-btn" style="margin-top:14px;" title="' + t("gate.docTitle") + '">' +
            t("gate.docBtn") +
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
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const value = (input.value || "").trim();
    if (!value) {
      fb.innerHTML = '<div class="kta-unlock-error">' + t("gate.err.empty") + '</div>';
      return;
    }

    // Hash de la saisie + comparaison
    let hashed;
    try {
      hashed = await _sha256(value);
    } catch (e) {
      fb.innerHTML = '<div class="kta-unlock-error">' + t("gate.err.crypto", { err: (e.message || e) }) + '</div>';
      return;
    }

    // 🔑 v1.90.6 — QUAND UNE INSTANCE PUBLIE SON MOT DE PASSE, IL EST LE SEUL
    // QUI OUVRE. 🩸 TROU DE SÉCURITÉ CORRIGÉ (KARMA) : la première version
    // acceptait AUSSI le code communautaire. Or ce code est distribué
    // largement — il ouvre la prod qui n'héberge rien. Quiconque le connaît
    // aurait donc pu ouvrir n'importe quelle instance privée, et l'`accessHash`
    // n'aurait rien protégé. Le code communautaire ne vaut plus que là où
    // AUCUN mot de passe d'instance n'est publié.
    //
    // ⚠️ ON DEMANDE DONC L'INDEX À CHAQUE TENTATIVE : même une saisie qui égale
    // le hash communautaire doit être REFUSÉE si l'instance impose le sien. La
    // gate ne s'ouvre qu'à la 1ʳᵉ installation et après un reset — une requête
    // y est négligeable. Hors-ligne, le Service Worker sert l'index en cache
    // (network-first), donc le hash d'instance reste connu.
    const hashInstance = await _hashInstance();
    const okInstance   = !!(hashInstance && hashed === hashInstance);
    // Le code communautaire n'ouvre QUE si l'instance n'impose PAS le sien.
    const okCommunaute = (!hashInstance && hashed === HASH_VALIDE);

    if (okCommunaute || okInstance) {
      // ✅ Succès
      try {
        localStorage.setItem(LS_UNLOCK, hashed);
        // 🩸 Mémoriser le hash d'instance est ce qui rend l'accès utilisable
        // HORS LIGNE : `isUnlocked()` n'a alors rien d'autre pour reconnaître
        // un déverrouillage légitime.
        if (okInstance) localStorage.setItem(LS_UNLOCK_KIOSQUE, hashInstance);
        else            localStorage.removeItem(LS_UNLOCK_KIOSQUE);
        localStorage.removeItem(LS_ATTEMPTS);
        localStorage.removeItem(LS_LOCK);   // 🔒 M2 : palier remis à zéro
      } catch(e) {}
      fb.innerHTML = '<div class="kta-unlock-success">' + t("gate.success") + '</div>';
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
        // 🔒 M2 : verrou TEMPORISÉ au palier suivant, compteur remis à zéro.
        // La Promise n'est pas résolue ; à l'expiration la gate se remonte
        // (même Promise, cf _afficherLockout) et un code juste la résout.
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

  // =========================================================================
  // API PUBLIQUE
  // =========================================================================
  // ouvrirGate() retourne une Promise qui résout `true` à l'unlock, OU
  // qui ne résout JAMAIS si lockout (5 tentatives ratées). Le caller
  // (main.js > initApp) await ça → l'app reste bloquée tant que pas auth.
  function ouvrirGate() {
    // 🌍 v1.79.4 — corps extrait dans _monterGate : le changement de langue
    // re-monte la gate dans la nouvelle langue SANS toucher la Promise
    // (_resolveGate survit au re-render).
    return new Promise(function(resolve) {
      _resolveGate = resolve;
      _monterGate();
    });
  }

  function _monterGate() {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    (function() {

      // Si déjà en lockout au boot (= localStorage attempts ≥ 5), afficher
      // l'overlay directement en mode lockout (pas de form).
      const overlay = _creerOverlay();

      // 🌍 v1.79.4 — sélecteur de langue : setLang recharge le dico puis on
      // re-monte la gate (l'overlay actuel est remplacé, la Promise survit).
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

      // 🔒 v1.90.8 — INSTANCE PROTÉGÉE : on RETIRE le bloc « importer ma
      // licence pro ». Async (une requête d'index), donc le bloc peut clignoter
      // une fraction de seconde avant de disparaître — la gate est un écran
      // rare (1ᵉʳ lancement / reset) et le SW sert l'index en cache, donc
      // c'est instantané en pratique. Le flag `_instanceProtegeeGate` double
      // ce retrait d'un refus au clic (ci-dessous) au cas où le bloc serait
      // rendu autrement un jour.
      _instanceProtegeeGate = false;
      _hashInstance().then(function(h) {
        if (!h) return;
        _instanceProtegeeGate = true;
        overlay.querySelectorAll(".kta-licence-community").forEach(function(el) {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        });
      }).catch(function() {});

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
                t("gate.licence.moduleUnavailable") +
              '</div>';
            return;
          }
          window.MyKTAMapProLicense.importFile(file).then(function(result) {
            if (result && result.ok) {
              // 🔒 v1.90.8 — Sur une instance protégée, la licence peut activer
              // le mode pro, mais elle N'OUVRE PAS la gate : le mot de passe du
              // déployeur reste requis. On ne pose donc PAS le flag unlock.
              if (_instanceProtegeeGate) {
                fb.innerHTML = '<div class="kta-unlock-error">' +
                  t("gate.licence.instanceProtegee") + '</div>';
                return;
              }
              // Set le flag unlock (= bypass définitif pour les boots suivants).
              // Cohérent : détenir une licence pro = canal légitime, pas besoin
              // de re-saisir le code partagé à chaque reload.
              try {
                localStorage.setItem(LS_UNLOCK, HASH_VALIDE);
                localStorage.removeItem(LS_ATTEMPTS);
              } catch(e) {}
              fb.innerHTML =
                '<div class="kta-unlock-success">' +
                  t("gate.licence.accepted") +
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
              const msg = (result && result.error) ? result.error : t("gate.licence.errUnknown");
              fb.innerHTML =
                '<div class="kta-unlock-error">' +
                  t("gate.licence.refused", { msg: msg.replace(/</g, "&lt;") }) +
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
            t("gate.warn.remaining", { n: (MAX_ATTEMPTS - ap) }) +
          '</div>';
      }
    })();
  }

  // Retire la flag unlock du localStorage. Utilisé par viderCacheAppli
  // pour s'assurer qu'au reset l'app redemande bien le mdp.
  function lock() {
    try {
      localStorage.removeItem(LS_UNLOCK);
      localStorage.removeItem(LS_ATTEMPTS);
    } catch(e) {}
  }

  // 🆕 v1.29.1-fix1 — Pose le flag LS_UNLOCK car une licence pro a été
  // détectée (serveur via fetch /Licence-pro.json OU import local). Une
  // licence pro valide est un canal d'accès légitime équivalent au code
  // communautaire (= même doctrine que le bouton « 📂 Importer ma licence
  // pro » de l'UnlockGate depuis v1.28.5). Appelé par main.js juste après
  // la résolution async de proLicense.isPro().
  function markUnlockedViaLicensePro() {
    try {
      localStorage.setItem(LS_UNLOCK, HASH_VALIDE);
      localStorage.removeItem(LS_ATTEMPTS);
    } catch(e) {}
  }

  window.UnlockGate = {
    isUnlocked:  isUnlocked,
    isLockedOut: isLockedOut,
    ouvrirGate:  ouvrirGate,
    lock:        lock,
    markUnlockedViaLicensePro: markUnlockedViaLicensePro,
    revaliderInstance: revaliderInstance,   // 🔑 v1.90.6 (appelé par main.js)
    instanceRequiertMotDePasse: instanceRequiertMotDePasse   // 🔒 v1.90.8
  };

  console.log("[UnlockGate] Module chargé — unlock state :", isUnlocked());
})();
