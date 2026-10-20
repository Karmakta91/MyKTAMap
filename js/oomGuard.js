/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// OOM GUARD — détection d'un kill mémoire mobile + goulot unique des toasts
// =========================
// iOS Safari (et Android Chrome) tuent sans événement une PWA au-delà de ~500 Mo : un témoin localStorage,
// rafraîchi par battement tant que l'app vit, est effacé à beforeunload/pagehide. Au boot suivant, témoin
// récent présent → kill brutal probable → modale d'explication.
// Expose window.OOMGuard : start() (après lancerApplication) · showToast(msg, type, opts) (file d'attente
//   derrière le splash ; opts.important survit à « Silence » ; opts.groupe fusionne les toasts émis à
//   quelques ms d'écart) · toastAutorise(type, opts) (même décision pour un toast maison) ·
//   niveauNotifs() / setNiveauNotifs("all"|"essential"|"silent") · flushPendingToasts() (depuis _splashEnd).
// ⚠️ UN SEUL GOULOT pour les toasts, décision PURE `_decisionToast` (exécutée par scripts/check-notifs.js) :
//   all = tout, vibration sur warn/error · essential = pas d'« info » (confirmation d'un geste visible),
//   warn sans vibration · silent = warn importants et erreurs seulement. Les alertes serveur (alertChecker)
//   et les modales de décision ne passent PAS ici.
// =========================

(function() {
  "use strict";

  const MARKER_KEY        = "myktamap_session_alive";
  const HEARTBEAT_MS      = 5000;                    // refresh marker every 5s
  const KILL_FRESHNESS_MS = 60 * 60 * 1000;          // marker > 1h ignoré (probable simple "j'ai pas ouvert l'app depuis longtemps")

  let _heartbeatTimer = null;
  let _heartbeatStart = null;
  let _heartbeatPaused        = false;               // (P7) — true quand l'onglet est en BG → tick pausé
  let _visibilityHandlerBound = false;               // (P7) — idempotent : pas de double-listener si start() rappelé
  let _splashGone     = false;                       // passe à true quand _splashEnd a fini
  const _toastQueue   = [];                          // toasts en attente tant que le splash bloque l'écran
  let _pendingKillInfo    = null;                    // payload kill détecté → modale après splash
  let _v2CrashDetecte = false;   // un plantage de génération V2 a sa modale : pas la modale générique en plus
  let _pendingV2CrashInfo = null;                    // kill pendant une génération V2 → modale spécifique

  // ── Toast ──
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

    const autoMs = type === "info" ? 6000 : 10000;
    setTimeout(function() {
      if (document.body.contains(toast)) dismiss();
    }, autoMs);
  }

  // ── Réglage des notifications ──
  const NOTIFS_KEY = "myktamap_notifs";
  const NOTIFS_NIVEAUX = ["all", "essential", "silent"];
  // Défaut « essential » (décision produit) : les messages qui confirment un geste sont tus ; « Toutes »
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
  // Décision PURE : { afficher, vibrer }. Extraite et exécutée par le garde-fou.
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

  // ── Regroupement : toasts d'un même groupe à quelques ms d'écart (restauration au chargement) → UN seul ──
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
      // Message identique affiché une fois : répéter un geste refusé n'allonge pas le toast.
      const vus = {};
      const uniques = items.map(function(it) { return it.message; })
        .filter(function(m) { if (vus[m]) return false; vus[m] = true; return true; });
      _emettre(uniques.join(" · "), type2, { important: important });
    }, GROUPE_FENETRE_MS);
  }

  function _emettre(message, type, opts) {
    const d = _decisionToast(niveauNotifs(), type, opts);
    if (!d.afficher) { console.log("[OOMGuard] 🔕 toast tu (" + type + ") :", message); return; }
    // Splash encore affiché : en file (un toast derrière le dégradé serait invisible).
    if (!_splashGone) {
      _toastQueue.push({ message: message, type: type, vibrer: d.vibrer });
      return;
    }
    _renderToast(message, type);
    // Vibration selon le réglage (pas en « Essentiel » pour un warn) ; préférence et support : kta_vibrate.
    if (d.vibrer && window.kta_vibrate) window.kta_vibrate.error();
  }

  function showToast(message, type, opts) {
    type = type || "warn";
    if (opts && opts.groupe) { _grouper(String(opts.groupe), message, type, opts); return; }
    _emettre(message, type, opts);
  }

  function flushPendingToasts() {
    _splashGone = true;

    // Délai : laisser la carte se poser après le splash.
    setTimeout(function() {
      // 1) Crash pendant une génération V2 d'abord : action concrète à proposer (PC, image réduite). Il a déjà
      //    écarté la modale de kill générique (même kill OOM).
      if (_pendingV2CrashInfo) {
        _afficherModaleV2Crash(_pendingV2CrashInfo);
        _pendingV2CrashInfo = null;
        return;  // les toasts seront flush au close de la modale V2
      }
      // 2) Kill générique.
      if (_pendingKillInfo) {
        _afficherModaleKill(_pendingKillInfo);
        _pendingKillInfo = null;
        return;
      }
      // 3) Toasts en attente.
      while (_toastQueue.length > 0) {
        const t = _toastQueue.shift();
        _renderToast(t.message, t.type);
        if (t.vibrer && window.kta_vibrate) window.kta_vibrate.error();   // vibration décidée à l'émission
        if (_toastQueue.length > 0) break; // un seul à la fois (le 2e replacerait le 1er)
      }
    }, 400);
  }

  // ── Modale « kill détecté » : constat, cause probable (mémoire), conseils concrets ──
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
            '<p style="font-size:11px; color:var(--kta-texte-3); margin:0;">' +
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
        // Modale fermée : toasts accumulés traités.
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

  // ── Cycle de vie du témoin ──
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
    // Témoin de plus d'une heure : onglet simplement déchargé après inactivité, pas un kill.
    if (age > KILL_FRESHNESS_MS) {
      _clearMarker();
      return;
    }

    // 🩸 Le témoin est PARTAGÉ par tous les onglets de l'app : un onglet resté ouvert (caché, battement en pause)
    // le garde « récent ». On demande d'abord aux autres onglets s'ils vivent ; un seul qui répond = pas de kill.
    _autreOngletVivant(function(vivant) {
      if (vivant) {
        console.log("[OOMGuard] Témoin tenu par un autre onglet encore ouvert : pas d'arrêt brutal");
        return;   // le témoin appartient à l'onglet vivant : on n'y touche pas
      }
      if (_v2CrashDetecte) { _clearMarker(); return; }   // la modale V2 couvre déjà ce plantage
      _signalerKill(info, age);
    });
  }

  // Un autre onglet répond-il ? (BroadcastChannel ne remet jamais un message à l'émetteur.) Sans
  // BroadcastChannel : « non ».
  const CANAL_VIVANT = "myktamap-oomguard";
  let _canalVivant = null;
  try {
    if (typeof BroadcastChannel === "function") {
      _canalVivant = new BroadcastChannel(CANAL_VIVANT);
      _canalVivant.addEventListener("message", function(e) {
        if (e && e.data === "ping") { try { _canalVivant.postMessage("pong"); } catch (er) {} }
      });
    }
  } catch (e) { _canalVivant = null; }
  function _autreOngletVivant(cb) {
    if (!_canalVivant) { cb(false); return; }
    let fini = false;
    const surMessage = function(e) {
      if (fini || !e || e.data !== "pong") return;
      fini = true; _canalVivant.removeEventListener("message", surMessage); cb(true);
    };
    _canalVivant.addEventListener("message", surMessage);
    try { _canalVivant.postMessage("ping"); } catch (e) {}
    setTimeout(function() {
      if (fini) return;
      fini = true; _canalVivant.removeEventListener("message", surMessage); cb(false);
    }, 400);
  }

  function _signalerKill(info, age) {
    // Kill brutal probable (beforeunload jamais atteint), souvent un OOM sur smartphone : affiché en modale
    // une fois le splash parti (cf flushPendingToasts).
    const ageSec = Math.round(age / 1000);
    console.warn("[OOMGuard] Kill détecté — dernière activité il y a", ageSec,
                 "s | plan :", info.planId, "| UA :", info.userAgent);

    _pendingKillInfo = {
      ageSec:  ageSec,
      planId:  info.planId,
      userAgent: info.userAgent
    };

    // Crash archivé en IDB (CrashReports, fire-and-forget : on est synchrone au boot), consultable dans
    // l'Inspecteur mémoire (⚙️ Configuration → 📊) → « 📋 Derniers crashs ».
    if (window.CrashReports && typeof window.CrashReports.saveCrash === "function") {
      try {
        window.CrashReports.saveCrash(_pendingKillInfo);
      } catch(e) {
        console.warn("[OOMGuard] CrashReports.saveCrash échec :", e);
      }
    }

    _clearMarker();
  }

  // ── Battement sensible à la visibilité ──
  // Pas d'écriture localStorage toutes les 5 s en arrière-plan (batterie) : tick suspendu quand
  // document.hidden, repris avec un tick immédiat au retour. Pause explicite plutôt que compter sur le
  // navigateur pour suspendre le JS (comportement variable selon l'OS, la version, la batterie).
  function _onVisibilityChange() {
    if (_heartbeatStart === null) return;

    if (document.hidden) {
      // Arrière-plan : tick suspendu, témoin laissé en place (un kill pendant ce temps sera détecté).
      if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
        _heartbeatPaused = true;
      }
    } else {
      // Retour : tick immédiat — un long séjour en arrière-plan ne doit pas passer pour un kill au prochain
      // reload (KILL_FRESHNESS_MS = 1 h).
      if (_heartbeatPaused) {
        _heartbeatPaused = false;
        _setMarker();
        _heartbeatTimer = setInterval(_setMarker, HEARTBEAT_MS);
      }
    }
  }

  function _bindVisibilityHandlerOnce() {
    // Idempotent (start() rappelé).
    if (_visibilityHandlerBound) return;
    _visibilityHandlerBound = true;
    document.addEventListener("visibilitychange", _onVisibilityChange);
  }

  // ── Contrôle ──
  function start() {
    _heartbeatStart = Date.now();
    _setMarker();
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(_setMarker, HEARTBEAT_MS);

    // Onglet déjà en arrière-plan au démarrage (bascule rapide) : vérifié tout de suite.
    _bindVisibilityHandlerOnce();
    if (document.hidden) _onVisibilityChange();
  }

  // Vérification au chargement du module, avant tout code de l'app.
  _checkPreviousKill();
  _checkV2GenerationCrash();

  // ── Crash pendant une génération V2 ──
  // Drapeau posé par createConf.js > _genererTuilesV2 AVANT la génération, retiré dans le `finally`. Encore
  // présent au boot → page probablement tuée pendant la génération (OOM mobile) : modale dédiée (suggérer PC).
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

    // Plus d'une heure : vieux drapeau oublié, pas un crash.
    const ageMs = Date.now() - info.startedAt;
    if (ageMs > 3600000) return;

    // Différé après le splash, comme la modale kill.
    _v2CrashDetecte = true;
    _pendingV2CrashInfo = {
      planName:    info.planName  || "(sans nom)",
      imageSizeMB: info.imageSize  ? Math.round(info.imageSize / 1024 / 1024) : null,
      ageSec:      Math.round(ageMs / 1000)
    };
    console.warn("[OOMGuard] V2 generation crash détecté —",
                 "plan:", _pendingV2CrashInfo.planName,
                 "imageSize:", _pendingV2CrashInfo.imageSizeMB + "Mo",
                 "age:", _pendingV2CrashInfo.ageSec + "s");

    // ⚠️ Un crash V2 laisse AUSSI le témoin de session : _checkPreviousKill() a sans doute posé _pendingKillInfo.
    // On l'écarte : la modale V2 couvre le même kill, avec une action concrète.
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
    const nomTxt = window.ktaEsc(info.planName);
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-v2-error-boite">' +
        '<div class="kta-readme-modal-header kta-v2-error-header">' +
          '<span class="kta-readme-modal-titre">' + t("oom.v2.titre") + '</span>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p class="kta-v2-error-message">' +
            t("oom.v2.intro", { nom: nomTxt, taille: sizeTxt }) +
          '</p>' +
          '<p style="font-size:13px; color:var(--kta-texte-2); line-height:1.5; margin:10px 0;">' +
            t("oom.v2.explain") +
          '</p>' +
          '<div class="kta-v2-warn-section kta-v2-warn-section-good">' +
            '<div class="kta-v2-warn-section-titre">' + t("oom.v2.solutionsTitle") + '</div>' +
            '<ul style="margin:6px 0 0; padding-left:22px; font-size:13px; color:var(--kta-texte-2); line-height:1.6;">' +
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
      // Pas de modale kill générique ici (déjà écartée) : seulement les toasts en attente.
      while (_toastQueue.length > 0) {
        const t = _toastQueue.shift();
        _renderToast(t.message, t.type);
        if (t.vibrer && window.kta_vibrate) window.kta_vibrate.error();   // vibration décidée à l'émission
        if (_toastQueue.length > 0) break;
      }
    }
    function _onKey(e) { if (e.key === "Escape") fermer(); }
    overlay.addEventListener("click", function(e) { if (e.target === overlay) fermer(); });
    document.addEventListener("keydown", _onKey);
    document.getElementById("kta-v2-crash-ok").addEventListener("click", fermer);
  }

  // Effacement aux deux fins de page : beforeunload (desktop, Android Chrome) + pagehide (iOS Safari).
  window.addEventListener("beforeunload", _clearMarker);
  window.addEventListener("pagehide",     _clearMarker);

  // ── Export ──
  window.OOMGuard = {
    start:               start,
    showToast:           showToast,
    toastAutorise:       toastAutorise,     // pour les toasts maison (osmView)
    niveauNotifs:        niveauNotifs,
    setNiveauNotifs:     setNiveauNotifs,
    flushPendingToasts:  flushPendingToasts
  };
})();
