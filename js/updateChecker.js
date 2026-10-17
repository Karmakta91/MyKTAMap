/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// updateChecker.js — détection de mise à jour via version.json, à chaque ouverture.
// Version reçue comparée (semver) à la version connue : 1er lancement → notée sans modale ;
// plus récente → modale « Mise à jour disponible » (afficherModaleUpdateDispo, différée après le
// splash) ; hors ligne → silencieux.
// Expose : window.UpdateChecker { check (au boot), notifySplashEnded, showCurrent (badge version),
//   onCheck(cb), getCurrentVersion, getLastKnownData, compareSemver(a, b) → -1 | 0 | 1 }
// localStorage : myktamap_known_version · myktamap_last_version_data (notes, hors ligne) ·
//   myktamap_update_postponed_at (« Plus tard », 24 h)
// Doc : docs/architecture/infra-versioning.md

(function() {
  "use strict";

  const VERSION_URL  = "version.json";
  const LS_VERSION   = "myktamap_known_version";
  const LS_DATA      = "myktamap_last_version_data";
  const LS_POSTPONED = "myktamap_update_postponed_at";

  // « Plus tard » : pas de nouvelle proposition avant 24 h.
  const POSTPONE_MS = 24 * 60 * 60 * 1000;

  // Jamais par-dessus le splash : la modale attend notifySplashEnded() (main.js > _splashEnd),
  // comme OOMGuard.flushPendingToasts().
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

  // Délai court (comme proLicense.js) : sinon un réseau mobile lent retient le fetch ~30 s et
  // retarde les modales différées.
  const FETCH_TIMEOUT_MS = 1500;

  async function _fetchRemote() {
    // 🩸 Cache-bust contre le SW (cache-first) + no-store contre le cache HTTP.
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

  // 🩸 Écriture protégée : localStorage plein ferait jeter _markSeen → la modale reviendrait à
  // CHAQUE ouverture. ktaStockageLocal.ecrire émet mktm:stockage-plein (explication à l'utilisateur).
  function _ecrire(cle, valeur) {
    if (window.ktaStockageLocal) return window.ktaStockageLocal.ecrire(cle, valeur);
    try { localStorage.setItem(cle, valeur); return true; } catch (e) { return false; }
  }

  function _getKnownVersion() {
    try { return localStorage.getItem(LS_VERSION); } catch (e) { return null; }
  }

  function _setKnownVersion(version, data) {
    // La version passe en premier ; les notes ne servent qu'à l'affichage.
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
    try { since = Number.parseInt(localStorage.getItem(LS_POSTPONED) || "0", 10); } catch (e) { since = 0; }
    if (!since) return false;
    return (Date.now() - since) < POSTPONE_MS;
  }

  function _snooze() {
    _ecrire(LS_POSTPONED, String(Date.now()));
  }

  function _clearSnooze() {
    try { localStorage.removeItem(LS_POSTPONED); } catch (e) { /* rien */ }
  }

  // Comparaison semver X.Y.Z → -1 | 0 | 1. 🩸 Jamais en chaînes : "1.7.10" < "1.7.9"
  // lexicographiquement. Sert aussi à détecter une version serveur plus ancienne.
  // Formats : "vX.Y.Z", "X.Y.Z", suffixe "-…" ignoré, ancien "vNNN" → [NNN].
  function compareSemver(a, b) {
    function _parse(v) {
      if (v == null) return [0];
      const clean = String(v).replace(/^v/i, "").split("-")[0];
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

    // Premier lancement : notée sans modale.
    if (!known) {
      _setKnownVersion(remote.version, remote);
      console.log("[UpdateChecker] Première version connue :", remote.version);
      return { status: "first-run", remote };
    }

    const cmp = compareSemver(remote.version, known);

    if (cmp === 0) {
      // Notes rafraîchies (elles peuvent changer sans nouvelle version).
      _setKnownVersion(remote.version, remote);
      return { status: "up-to-date", version: remote.version };
    }

    // Serveur plus ancien (retour arrière) : jamais de « mise à jour » qui régresse, pas de modale.
    if (cmp < 0) {
      console.warn(
        "[UpdateChecker] ⚠️ Downgrade serveur détecté :",
        known, "→", remote.version,
        "(remote plus ancien que installé — skip modale)"
      );
      // La version installée reste la référence.
      return { status: "downgrade-detected", local: known, remote };
    }

    if (_isSnoozed()) {
      console.log("[UpdateChecker] Update dispo mais snoozée (< 24h) :",
                  known, "→", remote.version);
      return { status: "snoozed", local: known, remote };
    }

    console.log("[UpdateChecker] 🔔 Mise à jour détectée :", known, "→", remote.version);

    // ⚠️ Version notée AVANT le rechargement, sinon la même modale revient ; un échec se relance
    // à la main.
    function _markSeen() {
      _clearSnooze();
      _setKnownVersion(remote.version, remote);
    }

    _showOrDefer({
      localVersion: known,
      remote: remote,
      // Mise à jour douce : session gardée, seul le cache PWA est purgé.
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
    return { status: "update-available", local: known, remote };
  }

  // Rappels à chaque fin de check() (badge version du pied de page).
  const _checkListeners = [];
  function onCheck(cb) {
    if (typeof cb === "function") _checkListeners.push(cb);
  }
  function _notifyCheck(result) {
    _checkListeners.forEach(function(fn) {
      try { fn(result); } catch(e) { console.warn("[UpdateChecker] onCheck listener throw :", e); }
    });
  }

  const _checkRaw = check;
  async function checkWithNotify() {
    const r = await _checkRaw();
    _notifyCheck(r);
    return r;
  }

  // Badge version cliquable : nouvelle lecture du serveur, modale forcée (ignore « Plus tard »)
  // ou « déjà à jour ».
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

    // Serveur égal ou plus ancien → « à jour ».
    const _cmpShow = remote && remote.version ? compareSemver(remote.version, known) : 0;
    // 🩸 Version acceptée mais ANCIEN code encore chargé (badge ⏳) : pas « déjà à jour », on
    // propose de relancer la mise à jour douce.
    const charge = (window.__MKM__ && window.__MKM__.build) || null;
    if (remote && remote.version && _cmpShow <= 0 && charge && compareSemver(remote.version, charge) > 0 &&
        typeof window.ktaConfirm === "function") {
      // 🔒 ktaConfirm rend du HTML : la version vient du serveur, donc échappée.
      const ok = await window.ktaConfirm(window.I18n.t("update.attente.msg",
        { v: window.ktaEsc(remote.version), charge: window.ktaEsc(charge) }), {
        titre: window.I18n.t("update.attente.titre"), okLabel: window.I18n.t("update.attente.relancer")
      });
      if (ok && typeof window.mettreAJourCodeSeul === "function") window.mettreAJourCodeSeul();
      return { status: "pending-reload", remote: remote };
    }
    if (!remote || !remote.version || _cmpShow <= 0) {
      if (typeof window.afficherModaleAlerteAbsente === "function") {
        window.afficherModaleAlerteAbsente("up-to-date");
      } else {
        window.ktaAlerte(window.I18n.t("update.alreadyLatest", { version: (remote && remote.version || known) }));
      }
      return { status: "up-to-date", remote: remote };
    }

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
    compareSemver: compareSemver
  };
})();
