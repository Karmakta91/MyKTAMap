/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

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
  let _pendingKillInfo    = null;                    // payload kill détecté → modale après splash
  let _pendingV2CrashInfo = null;                    // 🧱 v152 : payload kill V2 generation → modale spécifique

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
      // 1) 🧱 v152 : Modale "V2 generation crash" prioritaire si flag détecté
      //    au boot. Spécifique car le user a une action concrète à reprendre
      //    (relancer la conversion sur PC ou réduire l'image source).
      //    NB : _checkV2GenerationCrash a déjà discardé _pendingKillInfo car
      //    les 2 modales pointent vers le même kill OOM (V2 plus spécifique).
      if (_pendingV2CrashInfo) {
        _afficherModaleV2Crash(_pendingV2CrashInfo);
        _pendingV2CrashInfo = null;
        return;  // les toasts seront flush au close de la modale V2
      }
      // 2) Modale "kill détecté" générique (OOM session normale).
      if (_pendingKillInfo) {
        _afficherModaleKill(_pendingKillInfo);
        _pendingKillInfo = null;
        return;
      }
      // 3) Toasts en attente
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
  _checkV2GenerationCrash();

  // =========================
  // 🧱 V2 GENERATION CRASH (depuis v152)
  // =========================
  // Flag posé par createConf.js > _genererTuilesV2 AVANT la génération, retiré
  // dans le `finally` APRÈS (succès ou catch). Si le flag est encore présent
  // au boot suivant → le navigateur a probablement kill la page pendant la
  // génération (OOM mobile). Modale spécifique pour expliquer + suggérer PC.
  function _checkV2GenerationCrash() {
    const FLAG = "myktamap_v2_gen_in_progress";
    let info = null;
    try {
      const raw = localStorage.getItem(FLAG);
      if (!raw) return;
      info = JSON.parse(raw);
      localStorage.removeItem(FLAG);  // one-shot : on consomme le flag immédiatement
    } catch(e) {
      try { localStorage.removeItem(FLAG); } catch(e2) {}
      return;
    }
    if (!info || !info.startedAt) return;

    // Fenêtre de fraîcheur : 1h. Au-delà, c'est probablement un vieux flag
    // qui traîne (l'user a fermé l'onglet sans crash, on a oublié de remove).
    const ageMs = Date.now() - info.startedAt;
    if (ageMs > 3600000) return;

    // Differé après splash (pareil que la modale kill standard)
    _pendingV2CrashInfo = {
      planName:    info.planName  || "(sans nom)",
      imageSizeMB: info.imageSize  ? Math.round(info.imageSize / 1024 / 1024) : null,
      ageSec:      Math.round(ageMs / 1000)
    };
    console.warn("[OOMGuard] V2 generation crash détecté —",
                 "plan:", _pendingV2CrashInfo.planName,
                 "imageSize:", _pendingV2CrashInfo.imageSizeMB + "Mo",
                 "age:", _pendingV2CrashInfo.ageSec + "s");

    // ⚠️ Important : un crash V2 laisse AUSSI le marker session_alive en place
    // (la page a été killed avant beforeunload/pagehide). _checkPreviousKill()
    // a donc probablement déjà set _pendingKillInfo. On le discard ici car la
    // modale V2 couvre déjà le sujet de manière plus spécifique (et plus utile :
    // l'user a une action concrète = relancer la conversion sur PC).
    if (_pendingKillInfo) {
      console.log("[OOMGuard] Crash V2 détecté → discard de la modale kill générique (redondante)");
      _pendingKillInfo = null;
    }
  }

  function _afficherModaleV2Crash(info) {
    if (document.getElementById("kta-v2-crash-modal")) return;
    const overlay = document.createElement("div");
    overlay.id = "kta-v2-crash-modal";
    overlay.className = "kta-readme-modal-overlay";
    const sizeTxt = info.imageSizeMB ? info.imageSizeMB + " Mo" : "taille inconnue";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-v2-error-boite">' +
        '<div class="kta-readme-modal-header kta-v2-error-header">' +
          '<span class="kta-readme-modal-titre">🧱❌ Génération V2 interrompue</span>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p class="kta-v2-error-message">' +
            'La dernière fois, tu lançais la conversion en V2 du plan <strong>' +
            String(info.planName).replace(/[<>&]/g, function(c){return {"<":"&lt;",">":"&gt;","&":"&amp;"}[c];}) +
            '</strong> (image ' + sizeTxt + ') et l\'app s\'est arrêtée brutalement avant la fin.' +
          '</p>' +
          '<p style="font-size:13px; color:#c8d0e0; line-height:1.5; margin:10px 0;">' +
            'C\'est très probablement une <strong>saturation mémoire</strong> du navigateur — la conversion V2 ' +
            'décode l\'image source à pleine résolution puis génère N tuiles, ce qui peut dépasser le plafond mémoire ' +
            'des navigateurs mobiles (~500 MB sur iOS Safari, variable sur Android).' +
          '</p>' +
          '<div class="kta-v2-warn-section kta-v2-warn-section-good">' +
            '<div class="kta-v2-warn-section-titre">💡 Solutions</div>' +
            '<ul style="margin:6px 0 0; padding-left:22px; font-size:13px; color:#c8d0e0; line-height:1.6;">' +
              '<li><strong>Fais la conversion sur PC</strong> (Windows / macOS / Linux). Pas de plafond mémoire en pratique. ' +
                'Une fois le ZIP V2 généré, importe-le sur ton téléphone — l\'import est léger (pas de décodage à pleine résolution).</li>' +
              '<li><strong>Réduis l\'image source</strong> à 6000-8000 px max avant de réessayer (GIMP / Photoshop / ' +
                '<a href="https://squoosh.app" target="_blank" rel="noopener" style="color:#8cb4ff;">Squoosh</a>).</li>' +
              '<li><strong>Ferme les autres apps</strong> en arrière-plan pour libérer de la RAM avant de retenter.</li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
        '<div class="kta-oom-actions">' +
          '<button class="kta-btn kta-btn-primary" id="kta-v2-crash-ok" type="button">✓ Compris</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    function fermer() {
      if (overlay.parentNode) overlay.remove();
      document.removeEventListener("keydown", _onKey);
      // Note : on NE ré-affiche PAS la modale kill générique ici. Si on est dans
      // ce code, _checkV2GenerationCrash a déjà discardé _pendingKillInfo (la
      // modale V2 couvre le même sujet plus spécifiquement). On flush juste les
      // toasts en attente.
      while (_toastQueue.length > 0) {
        const t = _toastQueue.shift();
        _renderToast(t.message, t.type);
        if (_toastQueue.length > 0) break;
      }
    }
    function _onKey(e) { if (e.key === "Escape") fermer(); }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) fermer(); });
    document.addEventListener("keydown", _onKey);
    document.getElementById("kta-v2-crash-ok").addEventListener("click", fermer);
  }

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
