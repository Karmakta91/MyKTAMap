/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 🪫 BATTERY GUARD — v1.11.1 (cible V2)
// =========================
// Module qui expose l'état batterie via Battery Status API native
// (`navigator.getBattery()`) et émet warnings graduels en sous-sol.
//
// Choix de design (KARMA "1:a · 2:d · 3:b · 4:a · 5:c · 6:d · 7:b · 8:a") :
//   1:a → Battery Status API native uniquement (pas d'heuristique).
//         Si pas dispo (Safari iOS, Firefox desktop récents) → fallback
//         "indisponible" et tous les indicateurs UI sont masqués (8:a).
//   2:d → Indicateur dans header bar refondue ET status bar (cf
//         refonteInterface.js qui s'abonne via onChange).
//   3:b → 3 seuils : 20% (info bleu), 10% (warning orange), 5% (modale
//         rouge critique).
//   4:a → Code couleur : >50% vert · 20-50% jaune · 10-20% orange · <10% rouge.
//   5:c → Charge : ajoute icône ⚡ ET passe en bleu fixe (override).
//   6:d → À 20% propose Perf ULTRA, à 10% propose aussi de fermer tracker.
//   7:b → localStorage `myktamap_battery_warnings_seen_v1` = {level20, level10,
//         level5, cycleId}. Reset à chaque transition décharge → charge.
//   8:a → API indispo (Safari) → indicateurs masqués gracieusement.
//
// API publique :
//   window.BatteryGuard = {
//     isAvailable()    → bool (Battery Status API supportée)
//     getLevel()       → number 0-100 (pourcentage), ou null si indispo
//     isCharging()     → bool, ou null si indispo
//     getColor()       → string ("#27c97e" | "#f4c542" | "#ff9933" | "#ef4444" | "#8cb4ff" charge)
//     getEmoji()       → string ("🪫" | "🔋" selon niveau, "⚡" si charge)
//     formatLabel()    → string ex. "87%" ou "⚡ 87%" (avec ⚡ si charge)
//     onChange(cb)     → callback {level, charging, color, emoji, label}
//                        return : unsubscribe()
//     forceCheck()     → re-trigger un onChange immédiat (utile au boot UI)
//   }
// =========================

(function() {
  "use strict";

  // ============================================================
  // SEUILS & COULEURS (cf KARMA 3:b + 4:a)
  // ============================================================
  const THRESHOLDS = {
    info:    20,   // seuil bleu info → suggestion Perf ULTRA
    warning: 10,   // seuil orange warning → +suggestion fermer tracker
    critical: 5    // seuil rouge critique → modale dédiée
  };
  const COLORS = {
    full:     "#27c97e",  // > 50%
    medium:   "#f4c542",  // 20-50%
    low:      "#ff9933",  // 10-20%
    critical: "#ef4444",  // < 10%
    charging: "#8cb4ff"   // override pendant charge (KARMA 5:c)
  };

  // ============================================================
  // ÉTAT INTERNE
  // ============================================================
  let _battery = null;     // BatteryManager natif si dispo
  let _available = false;  // a-t-on accès à l'API ?
  const _listeners = [];   // callbacks abonnés via onChange

  // Cache état précédent pour détecter les transitions décharge → charge
  // (utile pour reset le localStorage des warnings vus)
  let _prevCharging = null;

  // ============================================================
  // INIT
  // ============================================================
  function _init() {
    // 🔕 v1.85.2 (KARMA) — l'utilisateur peut refuser ce capteur. On sort
    // AVANT `getBattery()` : couper seulement l'icône laisserait l'écoute en
    // place, et c'est justement l'écoute qu'on ne veut pas imposer.
    if (window.APP_CONFIG && window.APP_CONFIG.batterieEnabled === false) {
      _available = false;
      console.log("[BatteryGuard] Désactivé par l'utilisateur — aucun capteur écouté.");
      return;
    }
    if (typeof navigator === "undefined" || typeof navigator.getBattery !== "function") {
      _available = false;
      console.log("[BatteryGuard] navigator.getBattery indispo — fallback chip grisé '?' (KARMA option B v1.11.1).");
      // 🆕 v1.11.1 (KARMA "option B debug") : on notifie quand même les
      // listeners pour qu'ils affichent un chip grisé avec '?' au lieu de
      // tout masquer. Permet de voir l'emplacement même sur Safari/FF.
      // Notify différé via setTimeout 0 pour laisser le module finir son
      // init avant de tirer (les listeners ne sont pas encore accroché à
      // ce moment, c'est OK : refonteInterface fera son forceCheck() au
      // boot UI qui re-notifie le state actuel = indispo).
      return;
    }
    navigator.getBattery().then(function(bat) {
      _battery = bat;
      _available = true;
      _prevCharging = bat.charging;
      // Listeners natifs sur le BatteryManager
      bat.addEventListener("levelchange",    _onUpdate);
      bat.addEventListener("chargingchange", _onChargingChange);
      console.log("[BatteryGuard] Init OK — level :", Math.round(bat.level * 100) + "%, charging :", bat.charging);
      _notify();   // notify initial pour que l'UI rende le chip dès le boot
      _checkWarnings();
    }).catch(function(err) {
      _available = false;
      console.warn("[BatteryGuard] getBattery rejected — fallback chip grisé '?' :", err);
      // Same comme ci-dessus : notifier avec state "indispo" via forceCheck()
      // depuis l'UI (le state retourne déjà available:false).
    });
  }

  // ============================================================
  // EVENT HANDLERS NATIFS
  // ============================================================
  function _onUpdate() {
    _notify();
    _checkWarnings();
  }

  function _onChargingChange() {
    // Transition décharge → charge : reset les warnings vus pour ce cycle.
    if (_battery && _battery.charging && _prevCharging === false) {
      _resetWarningsSeen();
      console.log("[BatteryGuard] Charge détectée — warnings reset.");
    }
    _prevCharging = _battery ? _battery.charging : null;
    _notify();
  }

  // ============================================================
  // CALCUL ÉTAT EXPOSÉ
  // ============================================================
  function _state() {
    if (!_available || !_battery) {
      // 🆕 v1.11.1 (KARMA option B) : retourne un state explicite "indispo"
      // pour que l'UI puisse afficher un chip grisé avec '?' au lieu de
      // tout masquer. Le flag `available: false` permet à l'UI de
      // distinguer "API pas supportée" vs "pas encore résolue".
      return {
        level:     null,
        charging:  null,
        available: false,    // ← nouveau flag pour l'UI
        color:     "#8892a4", // gris charte
        emoji:     "🪫",
        label:     "?"
      };
    }
    const lvl = Math.round(_battery.level * 100);
    const chg = _battery.charging;
    return {
      level:     lvl,
      charging:  chg,
      available: true,
      color:     _computeColor(lvl, chg),
      emoji:     _computeEmoji(lvl, chg),
      label:     _formatLabel(lvl, chg)
    };
  }

  function _computeColor(lvl, chg) {
    // KARMA 5:c — en charge, override bleu fixe (sauf si critique <5%)
    if (chg && lvl >= THRESHOLDS.critical) return COLORS.charging;
    if (lvl < THRESHOLDS.critical) return COLORS.critical;
    if (lvl < THRESHOLDS.warning)  return COLORS.low;
    if (lvl < 50)                   return COLORS.medium;
    return COLORS.full;
  }

  function _computeEmoji(lvl, chg) {
    if (chg) return "⚡";
    // Emoji selon le niveau
    if (lvl < THRESHOLDS.critical) return "🪫";  // batterie quasi vide
    if (lvl < 30)                  return "🪫";
    return "🔋";  // batterie pleine ou suffisante
  }

  function _formatLabel(lvl, chg) {
    if (lvl === null) return "";
    // 🔧 v1.11.1-fix (KARMA "deux éclairs ?") : ne pas inclure ⚡ dans le
    // label car l'emoji est déjà rendu en parallèle via _computeEmoji
    // ("⚡" si charge, "🔋" / "🪫" sinon). Avant : double éclair "⚡ ⚡ 92%".
    return lvl + "%";
  }

  // ============================================================
  // WARNINGS GRADUELS (cf KARMA 3:b + 6:d + 7:b)
  // ============================================================
  const LS_WARNINGS_KEY = "myktamap_battery_warnings_seen_v1";

  function _getWarningsSeen() {
    try {
      const raw = localStorage.getItem(LS_WARNINGS_KEY);
      if (!raw) return { level20: false, level10: false, level5: false };
      const parsed = JSON.parse(raw);
      return {
        level20: !!parsed.level20,
        level10: !!parsed.level10,
        level5:  !!parsed.level5
      };
    } catch (e) {
      return { level20: false, level10: false, level5: false };
    }
  }

  function _setWarningSeen(key) {
    try {
      const seen = _getWarningsSeen();
      seen[key] = true;
      localStorage.setItem(LS_WARNINGS_KEY, JSON.stringify(seen));
    } catch (e) { /* silent — quota plein, on s'en fout */ }
  }

  function _resetWarningsSeen() {
    try { localStorage.removeItem(LS_WARNINGS_KEY); } catch (e) {}
  }

  // Vérifie si on doit déclencher un warning sur le seuil franchi.
  // Idempotent : ne tire qu'UNE fois par cycle de charge (cf 7:b).
  function _checkWarnings() {
    if (!_available || !_battery) return;
    if (_battery.charging) return;  // en charge → pas de warning de décharge
    const lvl = Math.round(_battery.level * 100);
    const seen = _getWarningsSeen();

    // Niveau critique 5% → modale rouge
    if (lvl <= THRESHOLDS.critical && !seen.level5) {
      _setWarningSeen("level5");
      _afficherModaleCritique(lvl);
      return;
    }

    // Niveau warning 10% → toast + suggestion Perf ULTRA + fermer tracker
    if (lvl <= THRESHOLDS.warning && !seen.level10) {
      _setWarningSeen("level10");
      _toastWarning10(lvl);
      return;
    }

    // Niveau info 20% → toast + suggestion Perf ULTRA
    if (lvl <= THRESHOLDS.info && !seen.level20) {
      _setWarningSeen("level20");
      _toastInfo20(lvl);
      return;
    }
  }

  // ============================================================
  // UX : TOASTS + MODALES
  // ============================================================
  // 🐛 v1.77.0 — COURSE AU BOOT : _init() tourne au chargement du module et
  // _notify() évalue tout de suite → sur un appareil déjà ≤20 %, le toast
  // partait AVANT l'arrivée du dico i18n (« Clé manquante : battery.toast.
  // info20 », attrapé par le smoke sur un laptop déchargé). Même famille que
  // la course du Mode Dev — même remède : barrière I18n.init() avant tout
  // émetteur UX. `fn` est appelée aussi en cas d'échec d'init (une modale
  // critique 5 % doit sortir même si les dicos plantent — clé brute plutôt
  // que silence).
  function _quandI18nPret(fn) {
    if (window.I18n && typeof window.I18n.init === "function") {
      try { window.I18n.init().then(fn, fn); return; } catch(e) {}
    }
    fn();
  }

  function _toastInfo20(lvl) {
    _quandI18nPret(function() {
      const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
      const msg = t("battery.toast.info20", { n: lvl });
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(msg, "warn");
      } else {
        console.warn("[BatteryGuard] " + msg);
      }
    });
  }

  function _toastWarning10(lvl) {
    _quandI18nPret(function() {
      const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };
      const msg = t("battery.toast.warn10", { n: lvl });
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(msg, "warn", { important: true });   // 🔕 survit au mode Silence
      } else {
        console.warn("[BatteryGuard] " + msg);
      }
    });
  }

  // Modale critique 5% — overlay rouge plein écran, ne se ferme qu'à
  // l'action utilisateur (pas de auto-close), car c'est une situation
  // qui mérite l'attention (en sous-sol, batterie faible = grosse perte
  // de temps si tu ne réagis pas).
  function _afficherModaleCritique(lvl) {
    // 🐛 v1.77.0 — même barrière i18n que les toasts (cf _quandI18nPret).
    // Le garde anti-doublon vit dans _construireModaleCritique : valable
    // aussi après le détour par la barrière.
    _quandI18nPret(function() { _construireModaleCritique(lvl); });
  }

  function _construireModaleCritique(lvl) {
    if (document.getElementById("kta-battery-critical-modal")) return;
    const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };

    const modal = document.createElement("div");
    modal.id = "kta-battery-critical-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.style.zIndex = "100003";  // au-dessus des modales standard

    modal.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:480px; border:2px solid #ef4444; box-shadow:0 0 32px rgba(239,68,68,0.45);">' +
        '<div class="kta-readme-modal-header" style="border-bottom:1px solid rgba(239,68,68,0.35);">' +
          '<span class="kta-readme-modal-titre" style="color:#ff8a8a;">' + t("battery.critical.titre", { n: lvl }) + '</span>' +
          '<button class="kta-panneau-close" id="kta-bat-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" style="padding:18px; color:#c8d0e0; line-height:1.6;">' +
          '<p style="font-size:14px; color:#ff8a8a; font-weight:600;">' + t("battery.critical.intro") + '</p>' +
          '<p style="font-size:13.5px;">' + t("battery.critical.actionLabel") + '</p>' +
          '<ul style="font-size:13px; margin:8px 0 14px 4px; padding-left:18px; line-height:1.7;">' +
            '<li>' + t("battery.critical.tip.save") + '</li>' +
            '<li>' + t("battery.critical.tip.notePos") + '</li>' +
            '<li>' + t("battery.critical.tip.eco") + '</li>' +
            '<li>' + t("battery.critical.tip.surface") + '</li>' +
          '</ul>' +
          '<p style="font-size:12.5px; color:#8892a4; font-style:italic;">' + t("battery.critical.note") + '</p>' +
        '</div>' +
        '<div class="kta-conv-actions" style="padding:14px 18px 18px; gap:8px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-bat-perf" type="button">' + t("battery.critical.btnConfig") + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-bat-ok"   type="button">' + t("battery.critical.ok") + '</button>' +
        '</div>' +
      '</div>';

    document.documentElement.appendChild(modal);

    function _close() { try { modal.remove(); } catch(e) {} }
    document.getElementById("kta-bat-close").addEventListener("click", _close);
    document.getElementById("kta-bat-ok").addEventListener("click", _close);
    document.getElementById("kta-bat-perf").addEventListener("click", function() {
      _close();
      // Ouvrir la modale Réglages (ou Configuration loader si possible)
      if (typeof window.afficherConfig === "function") {
        try { window.afficherConfig(); } catch (e) {}
      } else if (typeof window._ouvrirLoaderConfig === "function") {
        try { window._ouvrirLoaderConfig(); } catch (e) {}
      }
    });
    modal.addEventListener("click", function(e) { if (e.target === modal) _close(); });
  }

  // ============================================================
  // NOTIFY LISTENERS
  // ============================================================
  function _notify() {
    const s = _state();
    _listeners.forEach(function(cb) {
      try { cb(s); } catch (e) { console.warn("[BatteryGuard] listener throw :", e); }
    });
  }

  // ============================================================
  // API PUBLIQUE
  // ============================================================
  window.BatteryGuard = {
    isAvailable:  function() { return _available; },
    getLevel:     function() { return _available && _battery ? Math.round(_battery.level * 100) : null; },
    isCharging:   function() { return _available && _battery ? _battery.charging : null; },
    getColor:     function() { return _state().color; },
    getEmoji:     function() { return _state().emoji; },
    formatLabel:  function() { return _state().label; },
    onChange:     function(cb) {
      if (typeof cb !== "function") return function() {};
      _listeners.push(cb);
      return function() {
        const i = _listeners.indexOf(cb);
        if (i >= 0) _listeners.splice(i, 1);
      };
    },
    forceCheck:   function() { _notify(); _checkWarnings(); },
    // Pour debug uniquement — expose les seuils et l'état brut
    _peek:        function() {
      return {
        thresholds: THRESHOLDS,
        state:      _state(),
        seen:       _getWarningsSeen()
      };
    }
  };

  // Démarrage automatique au chargement du module
  _init();

  console.log("[BatteryGuard] Module chargé.");
})();
