/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// BATTERYGUARD.JS — État de la batterie et avertissements gradués sous terre
// =========================
// Battery Status API native seulement (`navigator.getBattery()`, pas d'heuristique), option à activer
// (APP_CONFIG.batterieEnabled). API absente (Safari iOS, Firefox) : état « indisponible », l'UI affiche une pastille
// grisée « ? ». Indicateur dans l'en-tête et la barre d'état (refonteInterface.js, via onChange).
//   - Seuils : 20 % (info), 10 % (avertissement + proposer de fermer le tracker), 5 % (modale rouge critique) ; à
//     20 et 10 % on propose Perf ULTRA.
//   - Couleurs : > 50 % vert · 20-50 % jaune · 10-20 % orange · < 10 % rouge ; en charge : ⚡ et bleu fixe.
//   - Une fois par cycle de charge : `myktamap_battery_warnings_seen_v1` = {level20, level10, level5, cycleId},
//     remis à zéro à chaque passage décharge → charge.
// API : window.BatteryGuard = {
//   isAvailable()  → bool (API supportée)
//   getLevel()     → 0-100, ou null si indisponible
//   isCharging()   → bool, ou null
//   getColor()     → "#27c97e" | "#f4c542" | "#ff9933" | "#ef4444" | "#8cb4ff" (charge)
//   getEmoji()     → "🪫" | "🔋" selon niveau, "⚡" en charge
//   formatLabel()  → "87%"
//   onChange(cb)   → cb({level, charging, color, emoji, label}) ; rend unsubscribe()
//   forceCheck()   → onChange immédiat (démarrage de l'UI)
// }

(function() {
  "use strict";

  // ── Seuils et couleurs ──────────
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
    charging: "#8cb4ff"   // pendant la charge
  };

  // ── État interne ──────────
  let _battery = null;     // BatteryManager natif si dispo
  let _available = false;  // a-t-on accès à l'API ?
  const _listeners = [];   // callbacks abonnés via onChange

  // État précédent : détecte la transition décharge → charge (remise à zéro des avertissements vus).
  let _prevCharging = null;

  // ── Init ──────────
  function _init() {
    // Capteur refusable : on sort AVANT `getBattery()` (couper seulement l'icône laisserait l'écoute en place, et
    // c'est l'écoute qu'on ne veut pas imposer).
    if (!window.APP_CONFIG || window.APP_CONFIG.batterieEnabled !== true) {
      _available = false;
      console.log("[BatteryGuard] Désactivé par l'utilisateur — aucun capteur écouté.");
      return;
    }
    if (typeof navigator === "undefined" || typeof navigator.getBattery !== "function") {
      _available = false;
      console.log("[BatteryGuard] navigator.getBattery indispo — fallback chip grisé '?' (KARMA option B v1.11.1).");
      // Pas de notification ici : refonteInterface appelle forceCheck() au démarrage de l'UI, qui rend l'état
      // « indisponible » (pastille grisée « ? » plutôt que rien).
      return;
    }
    navigator.getBattery().then(function(bat) {
      _battery = bat;
      _available = true;
      _prevCharging = bat.charging;
      bat.addEventListener("levelchange",    _onUpdate);
      bat.addEventListener("chargingchange", _onChargingChange);
      console.log("[BatteryGuard] Init OK — level :", Math.round(bat.level * 100) + "%, charging :", bat.charging);
      _notify();   // notify initial pour que l'UI rende le chip dès le boot
      _checkWarnings();
    }).catch(function(err) {
      _available = false;
      console.warn("[BatteryGuard] getBattery rejected — fallback chip grisé '?' :", err);
      // Même chose : l'UI obtient l'état « indisponible » par forceCheck().
    });
  }

  // ── Événements natifs ──────────
  function _onUpdate() {
    _notify();
    _checkWarnings();
  }

  function _onChargingChange() {
    // Décharge → charge : avertissements remis à zéro pour ce cycle.
    if (_battery && _battery.charging && _prevCharging === false) {
      _resetWarningsSeen();
      console.log("[BatteryGuard] Charge détectée — warnings reset.");
    }
    _prevCharging = _battery ? _battery.charging : null;
    _notify();
  }

  // ── État exposé ──────────
  function _state() {
    if (!_available || !_battery) {
      // État explicite « indisponible » : `available: false` distingue « API absente » de « pas encore résolue ».
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
    // En charge : bleu fixe (sauf critique < 5 %).
    if (chg && lvl >= THRESHOLDS.critical) return COLORS.charging;
    if (lvl < THRESHOLDS.critical) return COLORS.critical;
    if (lvl < THRESHOLDS.warning)  return COLORS.low;
    if (lvl < 50)                   return COLORS.medium;
    return COLORS.full;
  }

  function _computeEmoji(lvl, chg) {
    if (chg) return "⚡";
    if (lvl < THRESHOLDS.critical) return "🪫";  // batterie quasi vide
    if (lvl < 30)                  return "🪫";
    return "🔋";  // batterie pleine ou suffisante
  }

  function _formatLabel(lvl, chg) {
    if (lvl === null) return "";
    // Pas de ⚡ dans le libellé : l'emoji est rendu à côté (_computeEmoji), sinon double éclair « ⚡ ⚡ 92% ».
    return lvl + "%";
  }

  // ── Avertissements gradués ──────────
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

  // Avertissement du seuil franchi, UNE fois par cycle de charge (idempotent).
  function _checkWarnings() {
    if (!_available || !_battery) return;
    if (_battery.charging) return;  // en charge → pas de warning de décharge
    const lvl = Math.round(_battery.level * 100);
    const seen = _getWarningsSeen();

    // 5 % → modale rouge
    if (lvl <= THRESHOLDS.critical && !seen.level5) {
      _setWarningSeen("level5");
      _afficherModaleCritique(lvl);
      return;
    }

    // 10 % → toast + Perf ULTRA + fermer le tracker
    if (lvl <= THRESHOLDS.warning && !seen.level10) {
      _setWarningSeen("level10");
      _toastWarning10(lvl);
      return;
    }

    // 20 % → toast + Perf ULTRA
    if (lvl <= THRESHOLDS.info && !seen.level20) {
      _setWarningSeen("level20");
      _toastInfo20(lvl);
      return;
    }
  }

  // ── UX : toasts et modales ──────────
  // 🩸 Course au démarrage : _init() tourne au chargement et _notify() évalue tout de suite ; sur un appareil déjà
  // ≤ 20 %, le toast partirait AVANT le dico i18n (« Clé manquante : battery.toast.info20 »). Barrière I18n.init()
  // avant tout émetteur UX. `fn` est appelée aussi si l'init échoue : la modale critique 5 % doit sortir même sans
  // dico (clé brute plutôt que silence).
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
        window.OOMGuard.showToast(msg, "warn", { important: true });   // survit au mode Silence
      } else {
        console.warn("[BatteryGuard] " + msg);
      }
    });
  }

  // Modale critique 5 % : overlay rouge plein écran, fermée seulement par l'utilisateur (sous terre, une batterie
  // faible ignorée coûte cher).
  function _afficherModaleCritique(lvl) {
    // Même barrière i18n que les toasts ; l'anti-doublon vit dans _construireModaleCritique (valable après le détour).
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
        '<div class="kta-readme-modal-corps" style="padding:18px; color:var(--kta-texte-2); line-height:1.6;">' +
          '<p style="font-size:14px; color:#ff8a8a; font-weight:600;">' + t("battery.critical.intro") + '</p>' +
          '<p style="font-size:13.5px;">' + t("battery.critical.actionLabel") + '</p>' +
          '<ul style="font-size:13px; margin:8px 0 14px 4px; padding-left:18px; line-height:1.7;">' +
            '<li>' + t("battery.critical.tip.save") + '</li>' +
            '<li>' + t("battery.critical.tip.notePos") + '</li>' +
            '<li>' + t("battery.critical.tip.eco") + '</li>' +
            '<li>' + t("battery.critical.tip.surface") + '</li>' +
          '</ul>' +
          '<p style="font-size:12.5px; color:var(--kta-texte-3); font-style:italic;">' + t("battery.critical.note") + '</p>' +
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
      // Ouvre la modale Réglages (ou Configuration de l'accueil).
      if (typeof window.afficherConfig === "function") {
        try { window.afficherConfig(); } catch (e) {}
      } else if (typeof window._ouvrirLoaderConfig === "function") {
        try { window._ouvrirLoaderConfig(); } catch (e) {}
      }
    });
    modal.addEventListener("click", function(e) { if (e.target === modal) _close(); });
  }

  // ── Notification des listeners ──────────
  function _notify() {
    const s = _state();
    _listeners.forEach(function(cb) {
      try { cb(s); } catch (e) { console.warn("[BatteryGuard] listener throw :", e); }
    });
  }

  // ── API publique ──────────
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
    // Debug : seuils et état brut.
    _peek:        function() {
      return {
        thresholds: THRESHOLDS,
        state:      _state(),
        seen:       _getWarningsSeen()
      };
    }
  };

  _init();

  console.log("[BatteryGuard] Module chargé.");
})();
