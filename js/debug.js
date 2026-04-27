// =========================
// DEBUG.JS
// Capture des logs + modale plein écran accessible depuis les réglages
// Toujours actif — accessible via ⚙️ → Afficher les logs
// =========================

(function() {

  let _logBuffer = [];

  // Charger les logs du crash précédent
  try {
    const prev = localStorage.getItem("kta_debug_logs");
    if (prev) _logBuffer = JSON.parse(prev);
  } catch(e) {}

  // =========================
  // CAPTURE DES LOGS
  // =========================
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
    // Mettre à jour la modale si ouverte
    _refreshModal();
  }

  const _origLog   = console.log.bind(console);
  const _origWarn  = console.warn.bind(console);
  const _origError = console.error.bind(console);

  console.log   = function() { _origLog.apply(console, arguments);   _save("log",   arguments); };
  console.warn  = function() { _origWarn.apply(console, arguments);  _save("warn",  arguments); };
  console.error = function() { _origError.apply(console, arguments); _save("error", arguments); };

  window.addEventListener("error", function(e) {
    _save("error", ["[UNCAUGHT] " + e.message + " — " + (e.filename||"") + ":" + (e.lineno||"")]);
  });
  window.addEventListener("unhandledrejection", function(e) {
    _save("error", ["[PROMISE] " + (e.reason?.message || e.reason || "rejection")]);
  });

  // =========================
  // MODALE PLEIN ÉCRAN
  // =========================
  function _refreshModal() {
    const zone = document.getElementById("kta-debug-logzone");
    if (!zone) return;
    zone.innerHTML = _logBuffer.map(function(entry) {
      let color = "#c8d0e0";
      if (entry.includes("[ERROR]") || entry.includes("[UNCAUGHT]") || entry.includes("[PROMISE]")) color = "#ff6b6b";
      else if (entry.includes("[WARN]"))  color = "#ffcc00";
      else if (entry.includes("CRASH"))   color = "#888";
      return '<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.04);color:' + color + ';word-break:break-all;">' +
             entry.replace(/&/g,"&amp;").replace(/</g,"&lt;") + '</div>';
    }).join("");
    zone.scrollTop = zone.scrollHeight;
  }

  window.afficherLogsDebug = function() {
    // Fermer la modale config si ouverte
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
          <span class="kta-readme-modal-titre">🐛 Logs de débogage</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="kta-btn kta-btn-ghost" id="kta-debug-vider" style="font-size:11px;padding:4px 10px;">Vider</button>
            <button class="kta-btn kta-btn-primary" id="kta-debug-copier" style="font-size:11px;padding:4px 10px;">Copier</button>
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
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() { alert("Logs copiés !"); });
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0;top:0;left:0;width:1px;height:1px;";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand("copy"); alert("Logs copiés !"); } catch(e) { alert("Copie manuelle : " + text.slice(0,200) + "..."); }
        document.body.removeChild(ta);
      }
    });
  };

})();
