/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// UNLOCK GATE — barrière communautaire d'accès (depuis v173)
// =====================================================================
// 🔓 Depuis le 04/10/2026 (décision KARMA) : PLUS DE MOT DE PASSE CODÉ EN DUR.
// Deux écrans selon l'instance :
//   - instance qui publie un mot de passe (`index.json > config.accessHash`,
//     posé par ConfAdmin — c'est le cas de myktamap.fr) : champ mot de passe,
//     comme avant. C'est le SEUL mot de passe qui ouvre.
//   - sinon (usage local, ZIP, Docker community) : « Continuer », retenu sur
//     l'appareil. Plus d'import de licence ici (retiré le 09/10/2026) : une licence
//     importée n'activait aucune fonction pro (règle E : licence SERVEUR exigée).
// Re-demandé après un reset complet (viderCacheAppli purge le localStorage).
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
// Le mot de passe d'une instance est communiqué hors-bande par son
// déployeur ; seul son hash SHA-256 est publié dans l'index.
// =====================================================================

(function() {
  "use strict";

  // Hash SHA-256 du mot de passe communautaire. Pour bumper le mdp :
  //   echo -n "<nouveau-mdp>" | openssl dgst -sha256
  // → mettre le résultat ici, l'app redemandera au prochain boot des users
  //   qui avaient l'ancien (le hash en localStorage ne matchera plus).
  // Valeur mémorisée quand l'utilisateur continue sans licence (ou entre par
  // une licence pro) sur une instance SANS mot de passe.
  const ACCES_LIBRE = "libre-v1";
  // 🩸 MIGRATION SEULEMENT — hash de l'ancien code communautaire (supprimé le
  // 04/10/2026). Il n'est JAMAIS comparé à une saisie : il sert à reconnaître
  // un appareil déjà déverrouillé avec l'ancien code, qui vaut « déjà choisi »
  // (décision KARMA, reco 3) au lieu de lui remontrer l'écran.
  const HASH_HERITE = "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae";

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
  // `LS_UNLOCK`. Hors ligne, l'index n'est pas joignable : `isUnlocked()` n'a
  // rien d'autre pour reconnaître un accès légitime par mot de passe d'instance.
  // D'où cette seconde clé : elle se souvient du hash d'instance accepté, sans
  // quoi l'utilisateur serait REVERROUILLÉ au premier démarrage hors ligne.
  const LS_UNLOCK_KIOSQUE = "myktamap_unlock_instance_v1";
  const RE_HASH = /^[0-9a-f]{64}$/;

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
    try {
      const v = localStorage.getItem(LS_UNLOCK);
      if (v === ACCES_LIBRE) return true;
      // Ancien code communautaire sans mémoire d'instance : vaut accès libre.
      // 🩸 LECTURE SEULE — isUnlocked() est appelée dès le chargement du module,
      // AVANT revaliderInstance : convertir ici effaçait l'ancien hash, qui
      // n'était alors plus reconnu par une instance au même mot de passe
      // (mesuré le 04/10/2026, accès révoqué à tort). Une instance qui impose
      // un AUTRE mot de passe le révoque au démarrage en ligne (revaliderInstance).
      if (v === HASH_HERITE && !localStorage.getItem(LS_UNLOCK_KIOSQUE)) return true;
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
      // 🏛️ v2.6.0 (chantier 2) — l'index n'est plus relu ici : on lit la config
      // d'instance chargée UNE fois au démarrage, avant les gates
      // (js/ktaInstance.js). Index injoignable → dernière config connue : hors
      // ligne, une instance protégée garde son mot de passe (avant, le fetch
      // échouait → null → le code communautaire l'ouvrait).
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
        // Pas (ou plus) de mot de passe d'instance : un accès entré via le mot
        // de passe d'instance (mémoire présente) est révoqué — au prochain
        // démarrage, l'écran propose « Continuer sans licence ».
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

  // mode : "instance" (mot de passe publié par l'index) | "libre" (aucun).
  function _creerOverlay(mode) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const libre = mode === "libre";
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
        '<div class="kta-unlock-icon">' + (libre ? '🧭' : '🗝️') + '</div>' +
        '<div class="kta-unlock-titre">' + t(libre ? "gate.libre.titre" : "gate.titre") + '</div>' +
        // 14/10/2026 (KARMA) : plus de phrase sous le titre en mode libre ; le mode mot de passe garde la sienne.
        (libre ? '' : '<p class="kta-unlock-info">' + t("gate.info") + '</p>') +
        // 🆕 v1.28.0 — Vrais canaux de contact (avant : « contacte l'auteur »
        // sans aucun canal). Liens sortants uniquement → aucun impact CSP.
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
    // 🔓 04/10/2026 : plus de code communautaire. Seul le mot de passe publié
    // par l'instance ouvre (le champ n'est affiché que s'il existe).
    const okInstance   = !!(hashInstance && hashed === hashInstance);

    if (okInstance) {
      // ✅ Succès
      try {
        localStorage.setItem(LS_UNLOCK, hashed);
        // 🩸 Mémoriser le hash d'instance est ce qui rend l'accès utilisable
        // HORS LIGNE : `isUnlocked()` n'a alors rien d'autre pour reconnaître
        // un déverrouillage légitime.
        localStorage.setItem(LS_UNLOCK_KIOSQUE, hashInstance);
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
    // 🔓 04/10/2026 — le mode dépend de l'instance : on lit son hash AVANT de
    // dessiner (config d'instance déjà chargée et mémorisée : instantané).
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

      // 🔓 Instance sans mot de passe : « Continuer » (choix retenu sur l'appareil).
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

      // Si déjà en lockout au boot (tentatives épuisées), l'écran du verrou
      // remplace le formulaire — seulement quand un mot de passe est demandé.
      if (!libre && isLockedOut()) {
        _afficherLockout(overlay);
        return;
      }

      const input = overlay.querySelector("#kta-unlock-input");
      const form  = overlay.querySelector("#kta-unlock-form");
      const fb    = overlay.querySelector("#kta-unlock-feedback");

      // Focus champ après animation fade-in
      if (input) setTimeout(function() { input.focus(); }, 100);

      if (form) form.addEventListener("submit", function(e) {
        e.preventDefault();
        _onSubmit(overlay, input, fb);
      });

      // 🆕 v1.28.1 — Bouton 📖 Documentation (mode gate normale, pas lockout).
      const btnDoc = overlay.querySelector("#kta-unlock-readme-btn");
      if (btnDoc) btnDoc.addEventListener("click", _ouvrirDocReadme);

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
  // détectée — licence SERVEUR uniquement (/Licence-pro.json de l'installation ;
  // l'import d'une licence par l'utilisateur n'existe plus depuis le 09/10/2026).
  // Appelé par main.js juste après la résolution async de proLicense.isPro().
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
    revaliderInstance: revaliderInstance,   // 🔑 v1.90.6 (appelé par main.js)
    instanceRequiertMotDePasse: instanceRequiertMotDePasse   // 🔒 v1.90.8
  };

  console.log("[UnlockGate] Module chargé — unlock state :", isUnlocked());
})();
