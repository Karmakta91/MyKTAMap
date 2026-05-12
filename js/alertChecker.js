/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.is-underground.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// ALERT CHECKER — diffusion d'alertes publiques (incendie, fermeture, etc.)
// =========================
// À chaque boot, fetch `alert.json` à la racine du site.
// Si `active: true`, affiche une modale d'alerte à l'utilisateur.
// L'auteur active/désactive l'alerte en éditant `alert.json` côté serveur :
//   - `"active": false` → aucune popup
//   - `"active": true`  → popup affichée
//
// Format alert.json :
// {
//   "active":  true|false,
//   "level":   "emergency" | "warning" | "info",
//   "title":   "🚨 ALERTE — ...",
//   "message": "Texte principal",
//   "details": ["consigne 1", "consigne 2", ...] (optionnel)
//   "released": "2026-05-13T00:00:00Z"  (timestamp = clé de "version" de l'alerte)
// }
//
// Pattern de fetch IDENTIQUE à updateChecker.js :
//   - cache-bust ?_=Date.now() + cache: "no-store" → contourne le SW
//   - alert.json N'EST PAS mis en cache par le SW (toujours network-only)
//   - Si offline / 404 → silencieux (pas de popup)
//
// Pattern de différé IDENTIQUE à updateChecker.js et OOMGuard :
//   - check() au boot stocke l'alerte dans _pendingAlert si splash actif
//   - main.js > _splashEnd() appelle notifySplashEnded() pour flush
//
// Acknowledgment :
//   - L'utilisateur peut cliquer "J'ai compris" → stocke le `released` timestamp
//     dans localStorage["myktamap_alert_seen"]
//   - Au prochain reload, si le released stocké == released distant → pas de popup
//   - Si l'auteur publie une NOUVELLE alerte (timestamp différent) → re-popup
//   - L'auteur peut aussi forcer le re-affichage en changeant juste le timestamp
//     sans toucher au reste du contenu (cas "rappel de l'alerte en cours")
//
// API exposée :
//   - window.AlertChecker.check()             — appelé au boot
//   - window.AlertChecker.notifySplashEnded() — appelé après le splash
//   - window.AlertChecker.dismiss()           — marque l'alerte courante "vue"
// =========================

(function() {
  "use strict";

  const ALERT_URL        = "alert.json";
  const LS_SEEN          = "myktamap_alert_seen";

  let _splashEnded    = false;
  let _pendingAlert   = null;

  function _showOrDefer(alert) {
    if (_splashEnded) {
      if (typeof window.afficherModaleAlerte === "function") {
        window.afficherModaleAlerte(alert);
      } else {
        console.warn("[AlertChecker] afficherModaleAlerte absente — alerte ignorée");
      }
    } else {
      _pendingAlert = alert;
      console.log("[AlertChecker] Alerte différée jusqu'à la fin du splash");
    }
  }

  function notifySplashEnded() {
    _splashEnded = true;
    if (_pendingAlert) {
      const a = _pendingAlert;
      _pendingAlert = null;
      if (typeof window.afficherModaleAlerte === "function") {
        window.afficherModaleAlerte(a);
      }
    }
  }

  function _getSeenReleased() {
    try { return localStorage.getItem(LS_SEEN); } catch(e) { return null; }
  }

  function _setSeenReleased(ts) {
    try { localStorage.setItem(LS_SEEN, ts); } catch(e) {}
  }

  function dismiss(releasedTs) {
    if (releasedTs) _setSeenReleased(releasedTs);
  }

  async function check() {
    let alert;
    try {
      const url = ALERT_URL + "?_=" + Date.now();
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) {
        // 404 → pas d'alerte configurée, comportement normal
        return { status: "no-alert" };
      }
      alert = await resp.json();
    } catch(e) {
      // Offline ou réseau KO → silencieux
      console.log("[AlertChecker] Fetch échoué (offline ?) :", e.message);
      return { status: "offline" };
    }

    if (!alert || typeof alert !== "object") {
      console.warn("[AlertChecker] alert.json invalide :", alert);
      return { status: "invalid" };
    }

    if (!alert.active) {
      console.log("[AlertChecker] Aucune alerte active (active: false)");
      return { status: "inactive" };
    }

    // Alerte active — l'a-t-on déjà vue ?
    const seen = _getSeenReleased();
    if (seen && seen === alert.released) {
      console.log("[AlertChecker] Alerte déjà acquittée (released:", alert.released, ")");
      return { status: "already-seen", alert: alert };
    }

    console.log("[AlertChecker] 🚨 Alerte active à afficher :", alert.title);
    _showOrDefer(alert);
    return { status: "shown", alert: alert };
  }

  window.AlertChecker = {
    check: check,
    notifySplashEnded: notifySplashEnded,
    dismiss: dismiss
  };
})();
