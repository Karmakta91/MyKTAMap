/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// DEBUG.JS — Capture des logs + modale plein écran (⚙️ → Afficher les logs)
// =========================

(function() {

  let _logBuffer = [];

  // Logs de la session précédente (survivent à un crash).
  try {
    const prev = localStorage.getItem("kta_debug_logs");
    if (prev) _logBuffer = JSON.parse(prev);
  } catch(e) {}

  // ── Capture des logs ──────────
  function _format(args) {
    const now = new Date();
    const ts  = now.getHours().toString().padStart(2,"0") + ":" +
                now.getMinutes().toString().padStart(2,"0") + ":" +
                now.getSeconds().toString().padStart(2,"0") + "." +
                now.getMilliseconds().toString().padStart(3,"0");
    const msg = Array.from(args).map(function(a) {
      if (a === null || a === undefined) return String(a);
      if (typeof a === "object") { try { return JSON.stringify(a); } catch(e) { return String(a); } }
      return String(a);
    }).join(" ");
    return ts + " " + msg;
  }

  function _save(type, args) {
    const entry = "[" + type.toUpperCase() + "] " + _format(args);
    _logBuffer.push(entry);
    if (_logBuffer.length > 300) _logBuffer.shift();
    try { localStorage.setItem("kta_debug_logs", JSON.stringify(_logBuffer)); } catch(e) {}
    _refreshModal();
  }

  const _origLog   = console.log.bind(console);
  const _origInfo  = console.info ? console.info.bind(console) : _origLog;
  const _origWarn  = console.warn.bind(console);
  const _origError = console.error.bind(console);

  // Filtrage à deux niveaux : log/info derrière debugMode, dans la console ET dans le buffer (modale Logs) ;
  // warn/error toujours visibles et toujours bufferisés (diagnostic post-mortem).
  // 🩸 Le buffer est filtré lui aussi : tracking.js (60 logs/s en suivi actif) chasserait les warn/error utiles hors
  // du buffer (300 entrées) et remplirait le localStorage.
  // APP_CONFIG n'existe pas encore au tout début du démarrage : défaut silencieux.
  function _isDebug() {
    return !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);
  }

  console.log = function() {
    if (_isDebug()) {
      _origLog.apply(console, arguments);
      _save("log", arguments);
    }
  };
  console.info = function() {
    if (_isDebug()) {
      _origInfo.apply(console, arguments);
      _save("info", arguments);
    }
  };
  console.warn = function() {
    _origWarn.apply(console, arguments);
    _save("warn", arguments);
  };
  console.error = function() {
    _origError.apply(console, arguments);
    _save("error", arguments);
  };

  window.addEventListener("error", function(e) {
    _save("error", ["[UNCAUGHT] " + e.message + " — " + (e.filename||"") + ":" + (e.lineno||"")]);
  });
  window.addEventListener("unhandledrejection", function(e) {
    _save("error", ["[PROMISE] " + (e.reason?.message || e.reason || "rejection")]);
  });

  // ── Modale plein écran ──────────
  function _refreshModal() {
    const zone = document.getElementById("kta-debug-logzone");
    if (!zone) return;
    // Classes CSS plutôt que couleurs inline, pour le thème clair (css/style.css > `.kta-debug-log-line`).
    zone.innerHTML = _logBuffer.map(function(entry) {
      let cls = "kta-debug-log-line";
      if (entry.includes("[ERROR]") || entry.includes("[UNCAUGHT]") || entry.includes("[PROMISE]")) cls += " kta-debug-log-error";
      else if (entry.includes("[WARN]")) cls += " kta-debug-log-warn";
      else if (entry.includes("CRASH"))  cls += " kta-debug-log-crash";
      return '<div class="' + cls + '">' +
             window.ktaEsc(entry) + '</div>';
    }).join("");
    zone.scrollTop = zone.scrollHeight;
  }

  window.afficherLogsDebug = function() {
    // Ferme la modale de configuration si ouverte.
    const cfg = document.getElementById("kta-cfg-modal");
    if (cfg) cfg.remove();

    const existing = document.getElementById("kta-debug-modal");
    if (existing) { existing.remove(); return; }

    const modal = document.createElement("div");
    modal.id = "kta-debug-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:680px;">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${window.I18n.t("debug.title")}</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="kta-btn kta-btn-ghost" id="kta-debug-vider" style="font-size:11px;padding:4px 10px;">${window.I18n.t("debug.btnClear")}</button>
            <button class="kta-btn kta-btn-primary" id="kta-debug-copier" style="font-size:11px;padding:4px 10px;">${window.I18n.t("debug.btnCopy")}</button>
            <button class="kta-panneau-close" id="kta-debug-fermer">✕</button>
          </div>
        </div>
        <div class="kta-readme-modal-corps" style="padding:0;">
          <div id="kta-debug-logzone" style="
            font-family:'Courier New',monospace;
            font-size:11px;
            padding:10px 14px;
            height:100%;
            overflow-y:auto;
            background:#0d1117;
          "></div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(modal);
    _refreshModal();

    document.getElementById("kta-debug-fermer").addEventListener("click", function() { modal.remove(); });
    modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById("kta-debug-vider").addEventListener("click", function() {
      _logBuffer = [];
      try { localStorage.removeItem("kta_debug_logs"); } catch(e) {}
      _refreshModal();
    });

    document.getElementById("kta-debug-copier").addEventListener("click", function() {
      const text = _logBuffer.join("\n");
      // Copie réussie : toast « info » (masqué en Essentielles, voulu).
      const _toastCopie = function() {
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(window.I18n.t("debug.logsCopied"), "info");
        }
      };
      // Helper commun (utils.js) : presse-papier puis execCommand ; double échec → début du journal affiché pour
      // une copie à la main.
      const _copieManuelle = function() {
        window.ktaAlerte(window.I18n.t("debug.copyManual", { text: text.slice(0,200) }));
      };
      if (typeof window.ktaCopierTexte !== "function") { _copieManuelle(); return; }
      window.ktaCopierTexte(text).then(function(ok) { if (ok) _toastCopie(); else _copieManuelle(); });
    });
  };

})();
