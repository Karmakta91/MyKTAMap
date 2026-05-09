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
//   - start()             : démarre l'heartbeat (à appeler après lancerApplication)
//   - showToast(msg, type): notif courte, file d'attente derrière le splash
//   - flushPendingToasts(): vide la file (appelée depuis _splashEnd)
// =========================

(function() {
  "use strict";

  const MARKER_KEY        = "myktamap_session_alive";
  const HEARTBEAT_MS      = 5000;                    // refresh marker every 5s
  const KILL_FRESHNESS_MS = 60 * 60 * 1000;          // marker > 1h ignoré (probable simple "j'ai pas ouvert l'app depuis longtemps")

  let _heartbeatTimer = null;
  let _heartbeatStart = null;
  let _splashGone     = false;                       // passe à true quand _splashEnd a fini
  const _toastQueue   = [];                          // toasts en attente tant que le splash bloque l'écran
  let _pendingKillInfo = null;                       // payload kill détecté → modale après splash

  // =========================
  // TOAST UI
  // =========================
  function _renderToast(message, type) {
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

    // Auto-dismiss après 10s pour warn/error, 6s pour info
    const autoMs = type === "info" ? 6000 : 10000;
    setTimeout(function() {
      if (document.body.contains(toast)) dismiss();
    }, autoMs);
  }

  function showToast(message, type) {
    type = type || "warn";
    // Si le splash bloque encore l'écran, on met en file pour ne pas
    // afficher un toast invisible derrière le gradient sombre.
    if (!_splashGone) {
      _toastQueue.push({ message: message, type: type });
      return;
    }
    _renderToast(message, type);
  }

  function flushPendingToasts() {
    _splashGone = true;

    // Petit délai pour laisser la map se poser après la fin du splash.
    setTimeout(function() {
      // 1) Modale "kill détecté" prioritaire (importante, vue grand format).
      if (_pendingKillInfo) {
        _afficherModaleKill(_pendingKillInfo);
        _pendingKillInfo = null;
        return;  // les éventuels toasts s'afficheront quand l'utilisateur ferme la modale
      }
      // 2) Toasts en attente
      while (_toastQueue.length > 0) {
        const t = _toastQueue.shift();
        _renderToast(t.message, t.type);
        if (_toastQueue.length > 0) break; // un seul à la fois (le 2e replacerait le 1er)
      }
    }, 400);
  }

  // =========================
  // MODALE "KILL DÉTECTÉ"
  // =========================
  // Pleine carte centrée, style kta-readme-modal pour cohérence avec les
  // autres modales de l'app (Documentation, Réglages, etc.). Contient :
  //   - Explication factuelle
  //   - Pourquoi (cause probable mémoire)
  //   - Liste de conseils concrets pour réduire la pression mémoire
  //   - Bouton de fermeture
  function _afficherModaleKill(info) {
    const existing = document.getElementById("kta-oom-modal");
    if (existing) existing.remove();

    const ageSec = info && info.ageSec ? info.ageSec : null;
    const planTxt = info && info.planId ? info.planId : "(plan inconnu)";

    const overlay = document.createElement("div");
    overlay.id = "kta-oom-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-oom-modal-boite">' +
        '<div class="kta-readme-modal-header kta-oom-header">' +
          '<span class="kta-oom-titre-big">' +
            '<span class="kta-oom-warn-side">⚠️</span>' +
            '<span class="kta-oom-titre-text">ATTENTION — ARRÊT BRUTAL DÉTECTÉ</span>' +
            '<span class="kta-oom-warn-side">⚠️</span>' +
          '</span>' +
          '<button class="kta-panneau-close" id="kta-oom-fermer" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-oom-corps">' +
          '<div class="kta-oom-intro">' +
            'La fois précédente, l\'application s\'est arrêtée <strong>brutalement</strong> sans pouvoir sauvegarder ' +
            'sa session normalement.' +
          '</div>' +

          '<div class="kta-oom-section">' +
            '<div class="kta-oom-section-titre">🤔 Pourquoi&nbsp;?</div>' +
            '<p>' +
              'Sur smartphone (iOS et Android), le système d\'exploitation tue silencieusement les onglets et ' +
              'les apps installées qui consomment trop de mémoire vive. C\'est très souvent ce qui s\'est passé ici, ' +
              'surtout si tu utilises un plan en haute résolution ou que beaucoup d\'autres apps tournaient en parallèle.' +
            '</p>' +
          '</div>' +

          '<div class="kta-oom-section">' +
            '<div class="kta-oom-section-titre">💡 Comment éviter que ça recommence</div>' +
            '<ul class="kta-oom-list">' +
              '<li><strong>Ferme les autres applications en arrière-plan</strong> avant d\'utiliser MyKTAMap. ' +
                'Sur iPhone : double-clic Home ou swipe-up + dégage les vignettes. Sur Android : bouton multi-tâche + balaye.</li>' +
              '<li><strong>Réduis le mode performance</strong> dans le loader (icône 🚀 ou via ⚙️ Réglages). ' +
                '"Performance" charge des tuiles plus petites et utilise moins de RAM que "Qualité".</li>' +
              '<li><strong>Évite d\'ouvrir plusieurs onglets de navigateur</strong> en parallèle si tu utilises ' +
                'l\'app via Safari/Chrome — chaque onglet consomme aussi de la mémoire.</li>' +
              '<li><strong>Garde ton smartphone à jour</strong> : iOS et Android améliorent régulièrement leur ' +
                'gestion mémoire pour les PWA.</li>' +
              '<li><strong>Si le problème persiste sur un plan précis</strong>, son image principale est peut-être ' +
                'trop volumineuse — il faut alors la ré-optimiser (compression PNG ou réduction des dimensions).</li>' +
              '<li><strong>Exporte régulièrement ta session</strong> (💾 Enregistrer la session) pour ne rien ' +
                'perdre en cas d\'arrêt brutal.</li>' +
            '</ul>' +
          '</div>' +

          '<div class="kta-oom-section kta-oom-tech">' +
            '<div class="kta-oom-section-titre">🔧 Détails techniques</div>' +
            '<p style="font-size:11px; color:#8892a4; margin:0;">' +
              'Plan&nbsp;: <code>' + planTxt + '</code><br>' +
              (ageSec ? 'Dernière activité avant l\'arrêt&nbsp;: il y a ' + ageSec + 's<br>' : '') +
              'Mode&nbsp;: ' + (window.matchMedia('(display-mode: standalone)').matches ? 'PWA installée' : 'Navigateur') +
            '</p>' +
          '</div>' +
        '</div>' +
        '<div class="kta-oom-actions">' +
          '<button class="kta-btn kta-btn-primary" id="kta-oom-ok" type="button">✓ Compris</button>' +
        '</div>' +
      '</div>';

    document.documentElement.appendChild(overlay);

    function fermer() {
      overlay.classList.add("kta-oom-leaving");
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        // Une fois la modale fermée, traiter les toasts qui auraient pu s'accumuler
        if (_toastQueue.length > 0) flushPendingToasts();
      }, 220);
    }

    overlay.querySelector("#kta-oom-fermer").addEventListener("click", fermer);
    overlay.querySelector("#kta-oom-ok").addEventListener("click", fermer);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) fermer(); });
    const onKey = function(e) {
      if (e.key === "Escape") {
        fermer();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
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
    // beforeunload. Sur smartphone (iOS Safari + Android Chrome agressif)
    // c'est très souvent un OOM. On stocke l'info et on l'affiche en modale
    // pleine carte une fois le splash parti (cf. flushPendingToasts).
    const ageSec = Math.round(age / 1000);
    console.warn("[OOMGuard] Kill détecté — dernière activité il y a", ageSec,
                 "s | plan :", info.planId, "| UA :", info.userAgent);

    _pendingKillInfo = {
      ageSec:  ageSec,
      planId:  info.planId,
      userAgent: info.userAgent
    };

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
    start:               start,
    showToast:           showToast,
    flushPendingToasts:  flushPendingToasts
  };
})();
