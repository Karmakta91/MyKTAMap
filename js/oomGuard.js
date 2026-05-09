// =========================
// OOM GUARD — détection kill mémoire mobile + toast utilisateur
// =========================
// iOS Safari (et Android Chrome aggressif) tuent silencieusement les PWA
// qui dépassent ~500 MB de RAM. La page redémarre sans aucun event ni
// erreur en console. Pour donner un signal explicite à l'utilisateur, on
// pose un marker localStorage rafraîchi par heartbeat tant que l'app est
// vivante, et on l'efface au beforeunload/pagehide. Au boot suivant :
//   - Marker absent → shutdown propre (rien à signaler)
//   - Marker présent récent → kill brutal probable → toast d'avertissement
//
// API : window.OOMGuard
//   - start()    : démarre l'heartbeat (à appeler après lancerApplication)
//   - showToast(message, type) : exposé pour les autres modules
// =========================

(function() {
  "use strict";

  const MARKER_KEY        = "myktamap_session_alive";
  const HEARTBEAT_MS      = 5000;                    // refresh marker every 5s
  const KILL_FRESHNESS_MS = 60 * 60 * 1000;          // marker > 1h ignoré (probable simple "j'ai pas ouvert l'app depuis longtemps")

  let _heartbeatTimer = null;
  let _heartbeatStart = null;

  // =========================
  // TOAST UI
  // =========================
  function showToast(message, type) {
    type = type || "warn";
    const existing = document.getElementById("kta-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "kta-toast";
    toast.className = "kta-toast kta-toast-" + type;

    const icon = type === "error" ? "❌" : type === "info" ? "ℹ️" : "⚠️";
    toast.innerHTML =
      '<span class="kta-toast-icon"></span>' +
      '<span class="kta-toast-msg"></span>' +
      '<button class="kta-toast-close" aria-label="Fermer">✕</button>';
    toast.querySelector(".kta-toast-icon").textContent = icon;
    toast.querySelector(".kta-toast-msg").textContent  = message;

    document.body.appendChild(toast);

    function dismiss() {
      toast.classList.add("kta-toast-leaving");
      setTimeout(function() { toast.remove(); }, 250);
    }

    toast.querySelector(".kta-toast-close").addEventListener("click", dismiss);

    // Auto-dismiss après 10s pour "warn", 6s pour "info"
    const autoMs = type === "info" ? 6000 : 10000;
    setTimeout(function() {
      if (document.body.contains(toast)) dismiss();
    }, autoMs);
  }

  // =========================
  // MARKER LIFECYCLE
  // =========================
  function _setMarker() {
    try {
      localStorage.setItem(MARKER_KEY, JSON.stringify({
        startedAt: _heartbeatStart || Date.now(),
        lastSeen:  Date.now(),
        planId:    window._currentLoadedPlanId || null,
        userAgent: navigator.userAgent.slice(0, 120)
      }));
    } catch(e) { /* quota / private mode → tant pis */ }
  }

  function _clearMarker() {
    try { localStorage.removeItem(MARKER_KEY); } catch(e) {}
  }

  function _checkPreviousKill() {
    let info = null;
    try {
      const raw = localStorage.getItem(MARKER_KEY);
      if (!raw) return;
      info = JSON.parse(raw);
    } catch(e) { return; }

    if (!info || !info.lastSeen) return;

    const age = Date.now() - info.lastSeen;
    // Si le marker date de plus d'une heure, c'est probablement juste que
    // l'utilisateur n'avait pas rouvert l'app depuis longtemps (le tab a été
    // suspendu/déchargé "normalement" après inactivité). On ne crie pas au loup.
    if (age > KILL_FRESHNESS_MS) {
      _clearMarker();
      return;
    }

    // Kill brutal probable : l'app était active et n'a pas atteint son
    // beforeunload. Sur iPhone PWA c'est très souvent un OOM.
    console.warn("[OOMGuard] Kill détecté — dernière activité il y a", Math.round(age/1000),
                 "s | plan :", info.planId, "| UA :", info.userAgent);

    // Toast affiché après le splash (1s de délai pour pas chevaucher l'animation)
    setTimeout(function() {
      showToast(
        "⚠️ L'application a été arrêtée brutalement la dernière fois (probablement par iOS pour libérer de la mémoire). " +
        "Si ça se reproduit souvent, baisse le mode performance dans le loader.",
        "warn"
      );
    }, 1000);

    _clearMarker();
  }

  // =========================
  // CONTRÔLE
  // =========================
  function start() {
    _heartbeatStart = Date.now();
    _setMarker();
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(_setMarker, HEARTBEAT_MS);
  }

  // Vérification au chargement du module (avant tout app code)
  _checkPreviousKill();

  // Effacement aux 2 events de fin de page : beforeunload (desktop / Android Chrome
  // qui le firea avant de killer) + pagehide (iOS Safari qui préfère pagehide).
  window.addEventListener("beforeunload", _clearMarker);
  window.addEventListener("pagehide",     _clearMarker);

  // =========================
  // EXPORT
  // =========================
  window.OOMGuard = {
    start:     start,
    showToast: showToast
  };
})();
