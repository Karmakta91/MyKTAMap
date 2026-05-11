/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.is-underground.fr — Licence CC BY-NC-SA 4.0
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

  async function _fetchRemote() {
    // Cache-bust pour contourner le SW (qui aurait servi la vieille version).
    // `cache: "no-store"` côté HTTP pour éviter aussi le cache HTTP standard.
    const url = VERSION_URL + "?_=" + Date.now();
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return await resp.json();
  }

  function _getKnownVersion() {
    return localStorage.getItem(LS_VERSION);
  }

  function _setKnownVersion(version, data) {
    localStorage.setItem(LS_VERSION, version);
    try {
      localStorage.setItem(LS_DATA, JSON.stringify(data));
    } catch(e) {
      // Quota — pas critique
    }
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
    const since = parseInt(localStorage.getItem(LS_POSTPONED) || "0", 10);
    if (!since) return false;
    return (Date.now() - since) < POSTPONE_MS;
  }

  function _snooze() {
    localStorage.setItem(LS_POSTPONED, String(Date.now()));
  }

  function _clearSnooze() {
    localStorage.removeItem(LS_POSTPONED);
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

    // Version identique : rien à faire
    if (known === remote.version) {
      // On rafraîchit la data quand même (notes peuvent avoir changé sans bump)
      _setKnownVersion(remote.version, remote);
      return { status: "up-to-date", version: remote.version };
    }

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
      onAcceptHard: function() {
        _markSeen();
        if (typeof window.viderCacheAppli === "function") {
          window.viderCacheAppli();
        } else {
          window.location.reload();
        }
      },
      onPostpone: function() {
        _snooze();
      }
    });
    return { status: "update-available", local: known, remote };
  }

  window.UpdateChecker = {
    check: check,
    notifySplashEnded: notifySplashEnded,
    getCurrentVersion: _getKnownVersion,
    getLastKnownData: _getLastKnownData
  };
})();
