/*!
 * MyKTAMap — Modales « Journal réseau » + « Doc audit » du home
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// LOADERNETAUDIT.JS — Modales « Journal réseau » (live) + « Doc audit »
// =========================
// Extrait du gros <script> inline d index.html (consolidation : alléger le
// fichier). DÉPLACEMENT PUR, zéro changement de comportement. Lit
// window.NetworkAudit (log live + whitelist) et window.I18n.
//
// Le CÂBLAGE (boutons, ✕, backdrop, Escape) reste dans la closure window.load
// d index.html et appelle ces fonctions via les globals exposés ci-dessous
// (module chargé en `defer` → s exécute avant l event load).
//
// Exposé : window._ouvrirNetLogModal / _fermerNetLogModal /
//          _ouvrirNetDocModal / _fermerNetDocModal / _refreshNetLogTable
// Privé  : _escapeHtml, _formatTime, _renderNetLogRow, _netLogUnsub,
//          CATEGORY_COLORS. 100 % local, aucune surface réseau propre.
// =========================

(function() {
  "use strict";

  let _netLogUnsub = null;  // unsubscribe handle pour NetworkAudit.onLog
  const CATEGORY_COLORS = {
    "app-page":      "#8cb4ff",
    "app-script":    "#8cb4ff",
    "app-style":     "#8cb4ff",
    "image":         "#a8d4a8",
    "data":          "#d4a8d4",
    "plan-data":     "#d4a8d4",
    "version-check": "#f4c542",
    "alert-check":   "#ffb380",
    "doc":           "#c8d0e0",
    "ping":          "#888",
    "local-blob":    "#a8d4a8",  // vert : référence locale au navigateur (tiling V2)
    "local-data":    "#a8d4a8",  // vert : data URL base64 inline
    "external":      "#ff8c8c",
    "same-origin":   "#a0c8e0",
    "unknown":       "#c8d0e0"
  };

  function _escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                   .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function _formatTime(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return hh + ":" + mm + ":" + ss + "." + ms;
  }

  function _renderNetLogRow(entry) {
    const color = CATEGORY_COLORS[entry.category] || "#c8d0e0";
    const statusTxt = entry.status === null ? "…" : String(entry.status);
    const statusClass = typeof entry.status === "number" && entry.status >= 200 && entry.status < 400 ? "kta-net-status-ok"
                      : (typeof entry.status === "number" && entry.status >= 400 ? "kta-net-status-err"
                      : "kta-net-status-pending");
    // 🌍 v1.60.x (B8) : i18n au rendu, fallback FR inline (pattern projet).
    const _nt = function(k, fb) {
      return (window.I18n && typeof window.I18n.t === "function" && window.I18n.has && window.I18n.has(k))
        ? window.I18n.t(k) : fb;
    };
    const bodyBadge = entry.hasBody
      ? '<span class="kta-net-body-yes" title="' + _nt("netlog.bodyYesTitle", "Données envoyées dans le corps de la requête") + '">' + _nt("netlog.bodyYes", "OUI") + '</span>'
      : '<span class="kta-net-body-no" title="' + _nt("netlog.bodyNoTitle", "Aucune donnée envoyée") + '">' + _nt("netlog.bodyNo", "non") + '</span>';
    return '<tr>' +
      '<td class="kta-net-cell-time">' + _formatTime(entry.timestamp) + '</td>' +
      '<td class="kta-net-cell-kind">' + _escapeHtml(entry.kind) + '</td>' +
      '<td class="kta-net-cell-method">' + _escapeHtml(entry.method) + '</td>' +
      '<td class="kta-net-cell-url" title="' + _escapeHtml(entry.url) + '">' + _escapeHtml(entry.url) + '</td>' +
      '<td class="kta-net-cell-cat" style="color:' + color + ';">' + _escapeHtml(entry.category) + '</td>' +
      '<td class="kta-net-cell-body">' + bodyBadge + '</td>' +
      '<td class="kta-net-cell-status ' + statusClass + '">' + _escapeHtml(statusTxt) + '</td>' +
    '</tr>';
  }

  function _refreshNetLogTable() {
    const tbody = document.getElementById("loaderNetLogTbody");
    const meta  = document.getElementById("loaderNetLogMeta");
    if (!tbody || !window.NetworkAudit) return;
    const log = window.NetworkAudit.getLog();
    // 🌍 v1.60.x (B8) : i18n au rendu, fallback FR inline (pattern projet).
    const _nt = function(k, fb, params) {
      return (window.I18n && typeof window.I18n.t === "function" && window.I18n.has && window.I18n.has(k))
        ? window.I18n.t(k, params || {}) : fb;
    };
    if (log.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#8892a4;">' +
        _nt("netlog.empty", "Aucune requête capturée pour le moment. Utilise l'app, recharge un plan, ou ferme/rouvre cette modale.") +
        '</td></tr>';
    } else {
      // On affiche du plus récent au plus ancien (reverse)
      tbody.innerHTML = log.slice().reverse().map(_renderNetLogRow).join("");
    }
    if (meta) {
      const captured = (log.length > 1)
        ? _nt("netlog.captured.plural", '<strong>' + log.length + '</strong> requêtes capturées', { n: log.length })
        : _nt("netlog.captured.one",    '<strong>' + log.length + '</strong> requête capturée',   { n: log.length });
      meta.innerHTML = captured;
    }
  }

  function _ouvrirNetLogModal() {
    const modal = document.getElementById("loaderNetLogModal");
    if (!modal) return;
    modal.style.display = "flex";
    _refreshNetLogTable();
    // Subscribe live : chaque nouvel event re-render
    if (window.NetworkAudit && typeof window.NetworkAudit.onLog === "function") {
      _netLogUnsub = window.NetworkAudit.onLog(function(/* entry */) {
        _refreshNetLogTable();
      });
    }
  }

  function _fermerNetLogModal() {
    const modal = document.getElementById("loaderNetLogModal");
    if (modal) modal.style.display = "none";
    if (typeof _netLogUnsub === "function") {
      _netLogUnsub();
      _netLogUnsub = null;
    }
  }

  function _ouvrirNetDocModal() {
    const modal = document.getElementById("loaderNetDocModal");
    if (!modal) return;
    // Rempli la liste whitelist depuis NetworkAudit.WHITELIST_HUMAN
    const ul = document.getElementById("loaderNetDocWhitelist");
    if (ul && window.NetworkAudit && Array.isArray(window.NetworkAudit.WHITELIST_HUMAN)) {
      ul.innerHTML = window.NetworkAudit.WHITELIST_HUMAN.map(function(s) {
        return '<li>' + _escapeHtml(s) + '</li>';
      }).join("");
    }
    modal.style.display = "flex";
  }
  function _fermerNetDocModal() {
    const modal = document.getElementById("loaderNetDocModal");
    if (modal) modal.style.display = "none";
  }

  // ── Exposé pour le câblage inline d index.html (closure window.load) ──
  window._ouvrirNetLogModal  = _ouvrirNetLogModal;
  window._fermerNetLogModal  = _fermerNetLogModal;
  window._ouvrirNetDocModal  = _ouvrirNetDocModal;
  window._fermerNetDocModal  = _fermerNetDocModal;
  window._refreshNetLogTable = _refreshNetLogTable;

  console.log("[LoaderNetAudit] Module chargé (journal réseau + doc audit)");
})();
