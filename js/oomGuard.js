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
//   - showToast(msg, type, opts): notif courte, file d'attente derrière le splash
//       opts.important : survit au réglage « Silence » (batterie 10 %, capteurs refusés)
//       opts.groupe    : les toasts d'un même groupe émis à quelques ms d'écart
//                        (restauration au chargement) sortent en UN seul toast
//   - toastAutorise(type, opts) : la même décision, pour un toast maison (osmView)
//   - niveauNotifs() / setNiveauNotifs(n) : réglage « all » | « essential » | « silent »
//   - flushPendingToasts(): vide la file (appelée depuis _splashEnd)
//
// 🔕 17/09/2026 (KARMA : « beaucoup de popups d'information inutiles ») —
// UN SEUL GOULOT pour tous les toasts de l'app, et une décision PURE
// (_decisionToast, exécutée par scripts/check-notifs.js) :
//   • « all »       : tout, vibration sur warn/error (comportement d'avant) ;
//   • « essential » : plus de toasts « info » (ils confirment un geste que
//                     l'utilisateur vient de faire et voit à l'écran), les
//                     « warn » restent, sans vibration ;
//   • « silent »    : seuls les warn marqués important et les erreurs.
// Les alertes serveur (alertChecker) et les modales qui demandent une décision
// ne passent PAS par ici : hors de portée du réglage par construction.
// =========================

(function() {
  "use strict";

  const MARKER_KEY        = "myktamap_session_alive";
  const HEARTBEAT_MS      = 5000;                    // refresh marker every 5s
  const KILL_FRESHNESS_MS = 60 * 60 * 1000;          // marker > 1h ignoré (probable simple "j'ai pas ouvert l'app depuis longtemps")

  let _heartbeatTimer = null;
  let _heartbeatStart = null;
  let _heartbeatPaused        = false;               // 🆕 v1.31.1 (P7) — true quand l'onglet est en BG → tick pausé
  let _visibilityHandlerBound = false;               // 🆕 v1.31.1 (P7) — idempotent : pas de double-listener si start() rappelé
  let _splashGone     = false;                       // passe à true quand _splashEnd a fini
  const _toastQueue   = [];                          // toasts en attente tant que le splash bloque l'écran
  let _pendingKillInfo    = null;                    // payload kill détecté → modale après splash
  let _pendingV2CrashInfo = null;                    // 🧱 v152 : payload kill V2 generation → modale spécifique

  // =========================
  // TOAST UI
  // =========================
  function _renderToast(message, type) {
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const existing = document.getElementById("kta-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "kta-toast";
    toast.className = "kta-toast kta-toast-" + type;

    const icon = type === "error" ? "❌" : type === "info" ? "ℹ️" : "⚠️";
    toast.innerHTML =
      '<span class="kta-toast-icon"></span>' +
      '<span class="kta-toast-msg"></span>' +
      '<button class="kta-toast-close" aria-label="' + t("oom.toast.closeAria") + '">✕</button>';
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

  // ── 🔕 Réglage des notifications ──
  const NOTIFS_KEY = "myktamap_notifs";
  const NOTIFS_NIVEAUX = ["all", "essential", "silent"];
  // 🔕 Défaut « essential » (décision KARMA 17/09/2026) : sans réglage
  // enregistré, les messages qui confirment un geste sont tus. « Toutes »
  // reste un choix explicite dans ⚙️ Configuration.
  const NOTIFS_DEFAUT = "essential";
  function niveauNotifs() {
    try { const v = localStorage.getItem(NOTIFS_KEY); return NOTIFS_NIVEAUX.indexOf(v) >= 0 ? v : NOTIFS_DEFAUT; }
    catch (e) { return NOTIFS_DEFAUT; }
  }
  function setNiveauNotifs(n) {
    if (NOTIFS_NIVEAUX.indexOf(n) < 0) return false;
    try { localStorage.setItem(NOTIFS_KEY, n); } catch (e) {}
    console.log("[OOMGuard] 🔕 notifications :", n);
    return true;
  }
  // La décision, PURE : { afficher, vibrer }. Extraite et exécutée par le garde-fou.
  function _decisionToast(niveau, type, opts) {
    type = (type === "info" || type === "error") ? type : "warn";
    const important = !!(opts && opts.important);
    if (type === "error") return { afficher: true, vibrer: true };
    if (type === "warn") {
      if (niveau === "all")       return { afficher: true, vibrer: true };
      if (niveau === "essential") return { afficher: true, vibrer: false };
      return { afficher: important, vibrer: important };   // silent
    }
    return { afficher: niveau === "all", vibrer: false };   // info
  }
  function toastAutorise(type, opts) { return _decisionToast(niveauNotifs(), type, opts).afficher; }

  // ── Regroupement : plusieurs toasts d'un même groupe à quelques ms d'écart
  // (session, filtres, photos restaurés au chargement) sortent en UN seul ──
  const GROUPE_FENETRE_MS = 1200;
  const _groupes = {};
  const POIDS = { info: 0, warn: 1, error: 2 };
  function _grouper(groupe, message, type, opts) {
    const g = _groupes[groupe] || (_groupes[groupe] = { items: [], timer: null });
    g.items.push({ message: message, type: type, opts: opts });
    clearTimeout(g.timer);
    g.timer = setTimeout(function() {
      const items = g.items; delete _groupes[groupe];
      if (!items.length) return;
      let type2 = "info", important = false;
      items.forEach(function(it) { if (POIDS[it.type] > POIDS[type2]) type2 = it.type; if (it.opts && it.opts.important) important = true; });
      _emettre(items.map(function(it) { return it.message; }).join(" · "), type2, { important: important });
    }, GROUPE_FENETRE_MS);
  }

  function _emettre(message, type, opts) {
    const d = _decisionToast(niveauNotifs(), type, opts);
    if (!d.afficher) { console.log("[OOMGuard] 🔕 toast tu (" + type + ") :", message); return; }
    // Si le splash bloque encore l'écran, on met en file pour ne pas
    // afficher un toast invisible derrière le gradient sombre.
    if (!_splashGone) {
      _toastQueue.push({ message: message, type: type, vibrer: d.vibrer });
      return;
    }
    _renderToast(message, type);
    // 🆕 v1.34.27 — Vibration haptique (warn / error) — depuis le 17/09 elle suit
    // le réglage : en « Essentiel » un warn ne vibre plus. Pref + support : kta_vibrate.
    if (d.vibrer && window.kta_vibrate) window.kta_vibrate.error();
  }

  function showToast(message, type, opts) {
    type = type || "warn";
    if (opts && opts.groupe) { _grouper(String(opts.groupe), message, type, opts); return; }
    _emettre(message, type, opts);
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
        if (t.vibrer && window.kta_vibrate) window.kta_vibrate.error();   // 🔕 vibration décidée à l'émission
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
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const existing = document.getElementById("kta-oom-modal");
    if (existing) existing.remove();

    const ageSec = info && info.ageSec ? info.ageSec : null;
    const planTxt = info && info.planId ? info.planId : "(plan inconnu)";
    const modeTxt = window.matchMedia('(display-mode: standalone)').matches
      ? t("oom.kill.tech.modePwa")
      : t("oom.kill.tech.modeBrowser");

    const overlay = document.createElement("div");
    overlay.id = "kta-oom-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-oom-modal-boite">' +
        '<div class="kta-readme-modal-header kta-oom-header">' +
          '<span class="kta-oom-titre-big">' +
            '<span class="kta-oom-warn-side">⚠️</span>' +
            '<span class="kta-oom-titre-text">' + t("oom.kill.titre") + '</span>' +
            '<span class="kta-oom-warn-side">⚠️</span>' +
          '</span>' +
          '<button class="kta-panneau-close" id="kta-oom-fermer" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-oom-corps">' +
          '<div class="kta-oom-intro">' +
            t("oom.kill.intro") +
          '</div>' +

          '<div class="kta-oom-section">' +
            '<div class="kta-oom-section-titre">' + t("oom.kill.whyTitle") + '</div>' +
            '<p>' +
              t("oom.kill.whyBody") +
            '</p>' +
          '</div>' +

          '<div class="kta-oom-section">' +
            '<div class="kta-oom-section-titre">' + t("oom.kill.howTitle") + '</div>' +
            '<ul class="kta-oom-list">' +
              '<li>' + t("oom.kill.tip.closeApps") + '</li>' +
              '<li>' + t("oom.kill.tip.perf") + '</li>' +
              '<li>' + t("oom.kill.tip.tabs") + '</li>' +
              '<li>' + t("oom.kill.tip.update") + '</li>' +
              '<li>' + t("oom.kill.tip.optimize") + '</li>' +
              '<li>' + t("oom.kill.tip.export") + '</li>' +
            '</ul>' +
          '</div>' +

          '<div class="kta-oom-section kta-oom-tech">' +
            '<div class="kta-oom-section-titre">' + t("oom.kill.techTitle") + '</div>' +
            '<p style="font-size:11px; color:#8892a4; margin:0;">' +
              t("oom.kill.tech.plan") + ' <code>' + planTxt + '</code><br>' +
              (ageSec ? t("oom.kill.tech.lastActivity", { n: ageSec }) + '<br>' : '') +
              t("oom.kill.tech.mode") + ' ' + modeTxt +
            '</p>' +
          '</div>' +
        '</div>' +
        '<div class="kta-oom-actions">' +
          '<button class="kta-btn kta-btn-primary" id="kta-oom-ok" type="button">' + t("oom.kill.ok") + '</button>' +
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

    // 🆕 v1.20.0 — Archive automatique du crash en IDB via CrashReports.
    // L'appel est fire-and-forget (Promise non awaited) car _checkPreviousKill
    // est appelé synchrone au boot du module. Le crash report sera consultable
    // depuis Memory Inspector (⚙️ Configuration → 📊 Inspecteur) → section
    // « 📋 Derniers crashs ». Pratique pour diagnostiquer les patterns
    // récurrents et partager au mainteneur.
    if (window.CrashReports && typeof window.CrashReports.saveCrash === "function") {
      try {
        window.CrashReports.saveCrash(_pendingKillInfo);
      } catch(e) {
        console.warn("[OOMGuard] CrashReports.saveCrash échec :", e);
      }
    }

    _clearMarker();
  }

  // =========================
  // 🆕 v1.31.1 (P7) — VISIBILITY-AWARE HEARTBEAT
  // =========================
  // Le heartbeat 5s écrivait dans localStorage en continu, même onglet en
  // arrière-plan (mobile lockscreen, autre app au premier plan, etc.). Sur
  // mobile, ça représentait des dizaines d'écritures inutiles par minute en
  // BG → drain batterie léger constant.
  //
  // Fix : pause complète du tick quand document.hidden, reprise + tick
  // immédiat au reveal pour rafraîchir le timestamp marker (= éviter un
  // faux positif "kill détecté" si l'app a passé 30 min en BG).
  //
  // ⚠️ On ne se base PAS sur le fait que le browser peut suspendre tout le
  // JS en BG (iOS Safari le fait agressivement, Android Doze aussi). Pourquoi :
  // on ne contrôle pas ce comportement, il varie selon mobile/version/état
  // batterie. Notre pause explicite garantit l'économie quel que soit le
  // comportement browser.
  function _onVisibilityChange() {
    // Si pas démarré (start() pas encore appelé), rien à faire
    if (_heartbeatStart === null) return;

    if (document.hidden) {
      // Onglet en arrière-plan → on suspend le tick. Le marker reste posé en
      // l'état : si l'app est killée pendant ce temps (mobile aggressif), le
      // boot suivant détectera bien le crash via la fenêtre KILL_FRESHNESS_MS.
      if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
        _heartbeatPaused = true;
      }
    } else {
      // Onglet revenu au premier plan → tick immédiat + reprise du polling.
      // Le _setMarker() au reveal rafraîchit le timestamp pour éviter qu'un
      // long séjour en BG (ex: 30 min en lockscreen) déclenche à tort la
      // modale "kill détecté" au prochain reload (KILL_FRESHNESS_MS = 1h).
      if (_heartbeatPaused) {
        _heartbeatPaused = false;
        _setMarker();
        _heartbeatTimer = setInterval(_setMarker, HEARTBEAT_MS);
      }
    }
  }

  function _bindVisibilityHandlerOnce() {
    // Idempotent : protège contre un double-bind si start() est rappelé
    if (_visibilityHandlerBound) return;
    _visibilityHandlerBound = true;
    document.addEventListener("visibilitychange", _onVisibilityChange);
  }

  // =========================
  // CONTRÔLE
  // =========================
  function start() {
    _heartbeatStart = Date.now();
    _setMarker();
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(_setMarker, HEARTBEAT_MS);

    // 🆕 v1.31.1 (P7) — bind du handler visibilitychange + check immédiat
    // si l'onglet est DÉJÀ en BG au moment du démarrage (cas marginal mais
    // possible : user lance l'app puis bascule très vite sur une autre).
    _bindVisibilityHandlerOnce();
    if (document.hidden) _onVisibilityChange();
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
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
    const overlay = document.createElement("div");
    overlay.id = "kta-v2-crash-modal";
    overlay.className = "kta-readme-modal-overlay";
    const sizeTxt = info.imageSizeMB ? info.imageSizeMB + " Mo" : t("oom.v2.unknownSize");
    const nomTxt = String(info.planName).replace(/[<>&]/g, function(c){return {"<":"&lt;",">":"&gt;","&":"&amp;"}[c];});
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-v2-error-boite">' +
        '<div class="kta-readme-modal-header kta-v2-error-header">' +
          '<span class="kta-readme-modal-titre">' + t("oom.v2.titre") + '</span>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p class="kta-v2-error-message">' +
            t("oom.v2.intro", { nom: nomTxt, taille: sizeTxt }) +
          '</p>' +
          '<p style="font-size:13px; color:#c8d0e0; line-height:1.5; margin:10px 0;">' +
            t("oom.v2.explain") +
          '</p>' +
          '<div class="kta-v2-warn-section kta-v2-warn-section-good">' +
            '<div class="kta-v2-warn-section-titre">' + t("oom.v2.solutionsTitle") + '</div>' +
            '<ul style="margin:6px 0 0; padding-left:22px; font-size:13px; color:#c8d0e0; line-height:1.6;">' +
              '<li>' + t("oom.v2.sol.pc") + '</li>' +
              '<li>' + t("oom.v2.sol.resize") + '</li>' +
              '<li>' + t("oom.v2.sol.closeApps") + '</li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
        '<div class="kta-oom-actions">' +
          '<button class="kta-btn kta-btn-primary" id="kta-v2-crash-ok" type="button">' + t("oom.v2.ok") + '</button>' +
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
        if (t.vibrer && window.kta_vibrate) window.kta_vibrate.error();   // 🔕 vibration décidée à l'émission
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
    toastAutorise:       toastAutorise,     // 🔕 pour les toasts maison (osmView)
    niveauNotifs:        niveauNotifs,
    setNiveauNotifs:     setNiveauNotifs,
    flushPendingToasts:  flushPendingToasts
  };
})();
