/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// UPDATE CHECKER — détection de mise à jour via version.json
// =========================
// À chaque ouverture de l'app :
//   1. fetch version.json AVEC cache-bust (query string ?_=timestamp) pour
//      contourner le SW (qui sert tout en cache-first par défaut).
//   2. Compare version reçue vs la valeur stockée en localStorage.
//   3. Si différence + 1er lancement → stocke silencieusement (pas de modale).
//   4. Si différence + 2ème+ lancement → modale "Mise à jour disponible"
//      proposant le reset complet (qui déclenche le re-cache du SW).
//   5. Si offline / fetch KO → silencieux, on garde l'ancienne valeur.
//
// API exposée :
//   - window.UpdateChecker.check() — appelé au boot
//   - window.UpdateChecker.getCurrentVersion() — version connue localement
//   - window.UpdateChecker.getLastKnownData() — données complètes en cache
//
// État localStorage :
//   - myktamap_known_version       : string (la version qu'on a "vue")
//   - myktamap_last_version_data   : JSON (données complètes pour offline)
//   - myktamap_update_postponed_at : timestamp (snooze user — "Plus tard")
// =========================

(function() {
  "use strict";

  const VERSION_URL  = "version.json";
  const LS_VERSION   = "myktamap_known_version";
  const LS_DATA      = "myktamap_last_version_data";
  const LS_POSTPONED = "myktamap_update_postponed_at";

  // Snooze de 24h : si l'utilisateur a cliqué "Plus tard", on ne re-propose
  // pas avant 24h pour éviter le harcèlement.
  const POSTPONE_MS = 24 * 60 * 60 * 1000;

  // Différé d'affichage : on ne veut PAS montrer la modale par-dessus le splash
  // (~4s au démarrage). Pattern identique à OOMGuard.flushPendingToasts() :
  // si une modale est prête mais que le splash n'est pas encore fini, on la met
  // en attente. main.js > _splashEnd() appelle notifySplashEnded() qui la flush.
  let _splashEnded         = false;
  let _pendingModalArgs    = null;

  function _showOrDefer(args) {
    if (_splashEnded) {
      if (typeof window.afficherModaleUpdateDispo === "function") {
        window.afficherModaleUpdateDispo(args);
      } else {
        console.warn("[UpdateChecker] afficherModaleUpdateDispo absente — modale ignorée");
      }
    } else {
      _pendingModalArgs = args;
      console.log("[UpdateChecker] Modale différée jusqu'à la fin du splash");
    }
  }

  function notifySplashEnded() {
    _splashEnded = true;
    if (_pendingModalArgs) {
      const args = _pendingModalArgs;
      _pendingModalArgs = null;
      if (typeof window.afficherModaleUpdateDispo === "function") {
        window.afficherModaleUpdateDispo(args);
      }
    }
  }

  // 🚀 v1.30.0 (P6.A boot fetch timeout) : timeout 1500ms aligné avec
  // proLicense.js > FETCH_TIMEOUT_MS. Sans AbortController, un réseau
  // mobile lent pouvait laisser le fetch traîner jusqu'au timeout browser
  // (~30 s), retardant inutilement la flush des modales différées au
  // splash. 1500 ms suffit largement en réseau LAN/4G normal, et en
  // offline on échoue rapidement (silencieux côté UX).
  const FETCH_TIMEOUT_MS = 1500;

  async function _fetchRemote() {
    // Cache-bust pour contourner le SW (qui aurait servi la vieille version).
    // `cache: "no-store"` côté HTTP pour éviter aussi le cache HTTP standard.
    const url = VERSION_URL + "?_=" + Date.now();
    const opts = { cache: "no-store" };
    let timeoutId = null;
    if (typeof AbortController === "function") {
      const ctrl = new AbortController();
      timeoutId = setTimeout(function() {
        try { ctrl.abort(); } catch(e) {}
      }, FETCH_TIMEOUT_MS);
      opts.signal = ctrl.signal;
    }
    try {
      const resp = await fetch(url, opts);
      if (timeoutId) clearTimeout(timeoutId);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return await resp.json();
    } catch(e) {
      if (timeoutId) clearTimeout(timeoutId);
      throw e;
    }
  }

  // 🩸 10/10/2026 (testeur en prod : « la mise à jour m'est demandée à chaque ouverture ») : ces écritures
  // n'étaient pas protégées. localStorage plein → _markSeen jetait, la version n'était jamais notée, la
  // fenêtre revenait à CHAQUE ouverture et « Plus tard » ne faisait rien. Désormais : écriture protégée
  // (ktaStockageLocal.ecrire → événement mktm:stockage-plein, qui explique à l'utilisateur quoi faire).
  function _ecrire(cle, valeur) {
    if (window.ktaStockageLocal) return window.ktaStockageLocal.ecrire(cle, valeur);
    try { localStorage.setItem(cle, valeur); return true; } catch (e) { return false; }
  }

  function _getKnownVersion() {
    try { return localStorage.getItem(LS_VERSION); } catch (e) { return null; }
  }

  function _setKnownVersion(version, data) {
    // Les données (notes) d'abord ne servent qu'à l'affichage : la version passe en premier.
    if (_ecrire(LS_VERSION, version)) _ecrire(LS_DATA, JSON.stringify(data));
  }

  function _getLastKnownData() {
    try {
      const raw = localStorage.getItem(LS_DATA);
      return raw ? JSON.parse(raw) : null;
    } catch(e) {
      return null;
    }
  }

  function _isSnoozed() {
    let since = 0;
    try { since = parseInt(localStorage.getItem(LS_POSTPONED) || "0", 10); } catch (e) { since = 0; }
    if (!since) return false;
    return (Date.now() - since) < POSTPONE_MS;
  }

  function _snooze() {
    _ecrire(LS_POSTPONED, String(Date.now()));
  }

  function _clearSnooze() {
    try { localStorage.removeItem(LS_POSTPONED); } catch (e) { /* rien */ }
  }

  // 🆕 v1.20.0 — Comparison sémantique X.Y.Z (au lieu de comparison string).
  // Bug latent évité : "v1.7.10" en comparaison string est lexicographiquement
  // PLUS PETIT que "v1.7.9" (parce que "1" < "9" au char[5]). Donc si on
  // utilisait `<` ou `>` quelque part, on déduirait à tort que v1.7.10 est
  // plus ancien que v1.7.9. Actuellement on n'utilise que `===` qui détecte
  // n'importe quelle différence, mais on profite de ce refactor pour :
  //   1. Détecter le cas downgrade serveur (remote < known) → ne pas proposer
  //      une "mise à jour" qui régresse
  //   2. Exposer publiquement compareSemver pour usages futurs (changelog
  //      viewer entre 2 versions, MemInspector, etc.)
  //
  // Format accepté : "v1.7.10", "1.7.10", "v1.7.10-fix2" (le suffix est
  // ignoré), "v143" (vieux format pré-v1.7.1, traité comme [143]).
  function compareSemver(a, b) {
    function _parse(v) {
      if (v == null) return [0];
      // Strip prefixe "v" + tout suffix après "-" (= variantes dev "-fix2")
      const clean = String(v).replace(/^v/i, "").split("-")[0];
      // Split sur "." et coerce en int (NaN → 0)
      return clean.split(".").map(function(n) {
        const x = parseInt(n, 10);
        return isNaN(x) ? 0 : x;
      });
    }
    const pa = _parse(a);
    const pb = _parse(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return  1;
      if (na < nb) return -1;
    }
    return 0;
  }

  async function check() {
    let remote;
    try {
      remote = await _fetchRemote();
    } catch(e) {
      console.log("[UpdateChecker] Fetch échoué (offline ?) :", e.message);
      return { status: "offline" };
    }

    if (!remote || !remote.version) {
      console.warn("[UpdateChecker] version.json invalide :", remote);
      return { status: "invalid" };
    }

    const known = _getKnownVersion();

    // Premier lancement : on stocke silencieusement, pas de modale
    if (!known) {
      _setKnownVersion(remote.version, remote);
      console.log("[UpdateChecker] Première version connue :", remote.version);
      return { status: "first-run", remote };
    }

    // 🆕 v1.20.0 — Compare en vrai semver (au lieu d'égalité string).
    const cmp = compareSemver(remote.version, known);

    // Version identique (cmp === 0) : rien à faire
    if (cmp === 0) {
      // On rafraîchit la data quand même (notes peuvent avoir changé sans bump)
      _setKnownVersion(remote.version, remote);
      return { status: "up-to-date", version: remote.version };
    }

    // 🆕 v1.20.0 — Downgrade serveur détecté (remote < known) : ne PAS proposer
    // une "mise à jour" qui régresse. Cas marginal (l'auteur a roll-back une
    // release sur le CDN) mais important : éviter de surprendre l'user qui
    // verrait sa version installée régresser après un clic « Mise à jour ».
    // On rafraîchit silencieusement la known data sans modale ni snooze.
    if (cmp < 0) {
      console.warn(
        "[UpdateChecker] ⚠️ Downgrade serveur détecté :",
        known, "→", remote.version,
        "(remote plus ancien que installé — skip modale)"
      );
      // On ne touche PAS à _setKnownVersion : on garde la version installée
      // comme référence pour ne pas perdre le repère semver de l'user.
      return { status: "downgrade-detected", local: known, remote };
    }

    // Sinon cmp > 0 : vraie nouvelle version dispo côté serveur
    // Version différente — utilisateur a snoozé récemment ?
    if (_isSnoozed()) {
      console.log("[UpdateChecker] Update dispo mais snoozée (< 24h) :",
                  known, "→", remote.version);
      return { status: "snoozed", local: known, remote };
    }

    // Affichage de la modale — différé via _showOrDefer si le splash est encore
    // à l'écran. Le handler interface.js sera invoqué soit immédiatement (si le
    // splash est déjà fini), soit dès que notifySplashEnded() est appelé.
    console.log("[UpdateChecker] 🔔 Mise à jour détectée :", known, "→", remote.version);

    // Marque la version comme "connue" AVANT le reload, sinon l'utilisateur
    // verrait la même popup au reload. Si la mise à jour échoue (offline,
    // erreur), c'est pas grave, il pourra re-déclencher manuellement plus tard.
    function _markSeen() {
      _clearSnooze();
      _setKnownVersion(remote.version, remote);
    }

    _showOrDefer({
      localVersion: known,
      remote: remote,
      // 🪶 Mise à jour douce — préserve la session, ne purge que le cache PWA
      onAcceptSoft: function() {
        _markSeen();
        if (typeof window.mettreAJourCodeSeul === "function") {
          window.mettreAJourCodeSeul();
        } else {
          // Fallback minimal : reload simple (le SW gérera lui-même la transition)
          window.location.reload();
        }
      },
      // 💥 Reset complet — purge tout (fallback en cas de problème)
      onPostpone: function() {
        _snooze();
      }
    });
    return { status: "update-available", local: known, remote };
  }

  // Callbacks invoqués à chaque fin de check() — permet à l'UI (ex: badge
  // version dans le footer) de réagir au résultat sans devoir poller le LS.
  const _checkListeners = [];
  function onCheck(cb) {
    if (typeof cb === "function") _checkListeners.push(cb);
  }
  function _notifyCheck(result) {
    _checkListeners.forEach(function(fn) {
      try { fn(result); } catch(e) { console.warn("[UpdateChecker] onCheck listener throw :", e); }
    });
  }

  // Wrap check() pour notifier les listeners. On ré-affecte la référence
  // exposée plus bas pour conserver l'API publique.
  const _checkRaw = check;
  async function checkWithNotify() {
    const r = await _checkRaw();
    _notifyCheck(r);
    return r;
  }

  // Forçage manuel de la modale d'update — bypass le LS_SEEN et le snooze.
  // Utilisé par le badge version cliquable du footer loader.
  // Re-fetch frais pour être sûr d'avoir la dernière version remote, puis
  // affiche la modale via afficherModaleUpdateDispo si update dispo, sinon
  // une info "déjà à jour".
  async function showCurrent() {
    let remote;
    try {
      remote = await _fetchRemote();
    } catch(e) {
      console.log("[UpdateChecker] showCurrent fetch échoué :", e.message);
      if (typeof window.afficherModaleAlerteAbsente === "function") {
        window.afficherModaleAlerteAbsente("offline");
      }
      return { status: "offline" };
    }

    const known = _getKnownVersion() || (window.__MKM__ && window.__MKM__.build) || "?";

    // 🆕 v1.20.0 — Compare en vrai semver (au lieu d'égalité string) pour
    // gérer aussi le cas downgrade serveur (remote < known) → message neutre
    // "à jour" (= pas de fausse promesse d'upgrade qui régresserait).
    const _cmpShow = remote && remote.version ? compareSemver(remote.version, known) : 0;
    // 🩸 10/10/2026 : version acceptée mais ANCIEN code encore chargé (le badge de l'accueil montre ⏳) — on ne
    // répond plus « déjà à jour » : on propose de relancer la mise à jour douce, qui recharge le nouveau code.
    const charge = (window.__MKM__ && window.__MKM__.build) || null;
    if (remote && remote.version && _cmpShow <= 0 && charge && compareSemver(remote.version, charge) > 0 &&
        typeof window.ktaConfirm === "function") {
      const ok = await window.ktaConfirm(window.I18n.t("update.attente.msg", { v: remote.version, charge: charge }), {
        titre: window.I18n.t("update.attente.titre"), okLabel: window.I18n.t("update.attente.relancer")
      });
      if (ok && typeof window.mettreAJourCodeSeul === "function") window.mettreAJourCodeSeul();
      return { status: "pending-reload", remote: remote };
    }
    if (!remote || !remote.version || _cmpShow <= 0) {
      // Pas d'update dispo (égalité OU downgrade serveur) — message neutre
      if (typeof window.afficherModaleAlerteAbsente === "function") {
        window.afficherModaleAlerteAbsente("up-to-date");
      } else {
        window.ktaAlerte(window.I18n.t("update.alreadyLatest", { version: (remote && remote.version || known) }));
      }
      return { status: "up-to-date", remote: remote };
    }

    // Update dispo → affichage forcé de la modale, sans respecter snooze ni LS_SEEN
    if (typeof window.afficherModaleUpdateDispo === "function") {
      function _markSeen() {
        _clearSnooze();
        _setKnownVersion(remote.version, remote);
      }
      window.afficherModaleUpdateDispo({
        localVersion: known,
        remote: remote,
        onAcceptSoft: function() {
          _markSeen();
          if (typeof window.mettreAJourCodeSeul === "function") {
            window.mettreAJourCodeSeul();
          } else {
            window.location.reload();
          }
        },
        onPostpone: function() {
          _snooze();
        }
      });
    }
    return { status: "update-available", local: known, remote: remote };
  }

  window.UpdateChecker = {
    check: checkWithNotify,
    notifySplashEnded: notifySplashEnded,
    showCurrent: showCurrent,
    onCheck: onCheck,
    getCurrentVersion: _getKnownVersion,
    getLastKnownData: _getLastKnownData,
    // 🆕 v1.20.0 — Helper exposé pour usages externes (changelog viewer,
    // MemInspector, comparaisons inter-versions). Retourne -1 / 0 / +1.
    // Format accepté : "v1.7.10", "1.7.10", "v1.7.10-fix2", "v143" (legacy).
    compareSemver: compareSemver
  };
})();
