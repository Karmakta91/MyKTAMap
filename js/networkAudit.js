/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// networkAudit.js — journal de TOUTES les requêtes réseau, pour que l'utilisateur VÉRIFIE lui-même qu'aucune
//   donnée ne part (PWA 100 % client-side : la collecte est impossible par construction, encore faut-il le voir).
// Instrumente fetch, XHR, sendBeacon, WebSocket, EventSource ; buffer mémoire de 500 entrées ; journal en
//   direct dans la modale 📋 Voir le journal réseau. Il OBSERVE sans rien bloquer.
// ⚠️ Seule requête vers un tiers possible : le fond OpenStreetMap de la Vue OSM, coupé par la case 🗺️ Vue OSM
//   (OsmView.isOptedIn) et le mode incognito. Les tuiles posées en <img> (Leaflet) ne passent pas par
//   fetch/XHR : absentes de ce journal, visibles seulement dans l'onglet Réseau de F12.
// Origines attendues (WHITELIST_HUMAN) : même origine (dont <origin>/ping.html, corps "OK") ; blob: et data:
//   (locales) ; tile.openstreetmap.org.
// 🩸 Chargé AVANT tout module qui pourrait appeler fetch/XHR au boot (juste après copyright.js, avant
//   debug.js et sw.register), sinon les premières requêtes passent sous le radar.
// Expose window.NetworkAudit : getLog() (copie), clear(), onLog(cb) → unsubscribe, WHITELIST_HUMAN (getter,
//   langue courante), exportJson().
// ⚠️ Entry : { timestamp, kind: "fetch"|"xhr"|"beacon"|"websocket"|"eventsource", url, method, hasBody,
//   category (_classify), status: HTTP | "SENT" | "FAIL" | "OPEN" | null }
// Doc : docs/applications/NETWORK_AUDIT.md

(function() {
  "use strict";

  // ── Configuration ──
  const BUFFER_MAX  = 500;

  // ── Origines attendues ──
  // Descriptions construites AU RENDU (dicos prêts) : le getter `WHITELIST_HUMAN` rebâtit la liste dans la
  // langue courante à chaque accès. Repli FR sans I18n.
  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : null;
  }
  function _buildWhitelistHuman() {
    const origin = location.origin;
    const fr = [
      "Même origine — l'app elle-même servie depuis " + origin +
        " (inclut le ping santé serveur " + origin + "/ping.html, " +
        "body attendu \"OK\", utilisé avant Force update / Reset pour vérifier " +
        "DNS / SSL / Nginx en un seul appel)",
      "blob: URLs (références locales au navigateur — utilisées par le tiling V2 pour servir les tuiles d'image depuis le ZIP en mémoire ; aucune fuite réseau possible)",
      "data: URLs (base64 inline — icônes SVG embarquées dans le code, exports image ; aucune fuite réseau possible)",
      "OpenStreetMap (tile.openstreetmap.org) — fond de carte de la Vue OSM, en lecture seule, coupé si tu décoches « 🗺️ Vue OSM »"
    ];
    const sameOrigin = _t("netaudit.whitelist.sameOrigin", { origin: origin });
    const blob       = _t("netaudit.whitelist.blob");
    const data       = _t("netaudit.whitelist.data");
    const osm        = _t("netaudit.whitelist.osm");
    return [
      sameOrigin != null ? sameOrigin : fr[0],
      blob       != null ? blob       : fr[1],
      data       != null ? data       : fr[2],
      osm        != null ? osm        : fr[3]
    ];
  }

  // ── État ──
  let _logBuffer = [];
  let _listeners = [];

  // ── Classification (libellé coloré de l'UI) ──
  function _classify(url) {
    if (!url) return "unknown";
    // Ping de santé same-origin (<origin>/ping.html) : libellé « ping » à part.
    try {
      const u = new URL(url, location.origin);
      if (u.origin === location.origin && u.pathname === "/ping.html") return "ping";
    } catch(e) { /* skip */ }
    // blob: : déréférencement d'une donnée déjà en mémoire (tuiles V2), aucun réseau — catégorie dédiée pour
    // ne pas l'afficher en rouge « external ».
    if (typeof url === "string" && url.indexOf("blob:") === 0) return "local-blob";
    // Idem pour data: (base64 inline).
    if (typeof url === "string" && url.indexOf("data:") === 0) return "local-data";
    try {
      const u = new URL(url, location.origin);
      if (u.origin !== location.origin) return "external";

      const p = u.pathname;
      if (p === "/version.json" || p.endsWith("/version.json")) return "version-check";
      if (p === "/alert.json"   || p.endsWith("/alert.json"))   return "alert-check";
      if (p.startsWith("/data/") || p.includes("/data/"))       return "plan-data";
      if (p.endsWith(".md"))                                     return "doc";
      if (p === "/" || p.endsWith(".html"))                      return "app-page";
      if (p.endsWith(".js"))                                     return "app-script";
      if (p.endsWith(".css"))                                    return "app-style";
      if (p.endsWith(".png") || p.endsWith(".jpg") ||
          p.endsWith(".jpeg") || p.endsWith(".webp") ||
          p.endsWith(".svg") || p.endsWith(".gif"))              return "image";
      if (p.endsWith(".json"))                                   return "data";
      return "same-origin";
    } catch(e) { return "unknown"; }
  }

  function _log(entry) {
    entry.timestamp = Date.now();
    _logBuffer.push(entry);
    // Buffer circulaire : les BUFFER_MAX dernières entrées.
    if (_logBuffer.length > BUFFER_MAX) _logBuffer.shift();
    for (let i = 0; i < _listeners.length; i++) {
      try { _listeners[i](entry); } catch(e) { /* listener planté → on continue */ }
    }
  }

  function _resolveUrl(input) {
    try {
      if (typeof input === "string") return input;
      if (input instanceof Request)  return input.url;
      if (input && input.url)        return input.url;
      if (input && typeof input.toString === "function") return input.toString();
    } catch(e) {}
    return "(unknown)";
  }

  // ── Instrumentation fetch() ──
  const _origFetch = window.fetch;
  if (typeof _origFetch === "function") {
    window.fetch = function(input, init) {
      const url     = _resolveUrl(input);
      let   method  = "GET";
      let   hasBody = false;

      try {
        if (input instanceof Request) {
          method  = input.method || "GET";
          hasBody = ["POST","PUT","PATCH","DELETE"].indexOf(method.toUpperCase()) >= 0;
        }
        if (init) {
          if (init.method) method = init.method;
          if (init.body !== null && init.body !== undefined) hasBody = true;
        }
      } catch(e) {}

      const entry = {
        kind:     "fetch",
        url:      url,
        method:   (method || "GET").toUpperCase(),
        hasBody:  hasBody,
        category: _classify(url),
        status:   null
      };

      _log(entry);
      return _origFetch.apply(this, arguments).then(function(resp) {
        try { entry.status = resp.status; } catch(e) {}
        return resp;
      }).catch(function(err) {
        if (entry.status === null) entry.status = "FAIL";
        throw err;
      });
    };
  }

  // ── Instrumentation XMLHttpRequest ──
  if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
    const _origXhrOpen = window.XMLHttpRequest.prototype.open;
    const _origXhrSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function(method, url) {
      this._kta_url    = url;
      this._kta_method = (method || "GET").toUpperCase();
      return _origXhrOpen.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function(body) {
      const url     = this._kta_url || "(unknown)";
      const method  = this._kta_method || "GET";
      const hasBody = body !== null && body !== undefined;

      const entry = {
        kind:     "xhr",
        url:      url,
        method:   method,
        hasBody:  hasBody,
        category: _classify(url),
        status:   null
      };

      _log(entry);
      const _xhr = this;
      this.addEventListener("loadend", function() {
        try { entry.status = _xhr.status; } catch(e) {}
      });
      return _origXhrSend.apply(this, arguments);
    };
  }

  // ── Instrumentation navigator.sendBeacon ──
  if (navigator.sendBeacon) {
    const _origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      const hasBody = data !== null && data !== undefined;
      const entry = {
        kind:     "beacon",
        url:      url || "(unknown)",
        method:   "POST",  // sendBeacon est toujours POST
        hasBody:  hasBody,
        category: _classify(url),
        status:   null
      };

      _log(entry);
      const result = _origBeacon(url, data);
      entry.status = result ? "SENT" : "FAIL";
      return result;
    };
  }

  // ── Instrumentation WebSocket ──
  if (typeof WebSocket !== "undefined") {
    const _OrigWS = WebSocket;
    function _PatchedWS(url, protocols) {
      const entry = {
        kind:     "websocket",
        url:      url || "(unknown)",
        method:   "WS",
        hasBody:  false,
        category: _classify(url),
        status:   "OPEN"
      };

      _log(entry);
      return new _OrigWS(url, protocols);
    }
    // Constantes et prototype recopiés.
    _PatchedWS.CONNECTING = _OrigWS.CONNECTING;
    _PatchedWS.OPEN       = _OrigWS.OPEN;
    _PatchedWS.CLOSING    = _OrigWS.CLOSING;
    _PatchedWS.CLOSED     = _OrigWS.CLOSED;
    _PatchedWS.prototype  = _OrigWS.prototype;
    window.WebSocket = _PatchedWS;
  }

  // ── Instrumentation EventSource ──
  if (typeof EventSource !== "undefined") {
    const _OrigES = EventSource;
    function _PatchedES(url, init) {
      const entry = {
        kind:     "eventsource",
        url:      url || "(unknown)",
        method:   "SSE",
        hasBody:  false,
        category: _classify(url),
        status:   "OPEN"
      };

      _log(entry);
      return new _OrigES(url, init);
    }
    _PatchedES.CONNECTING = _OrigES.CONNECTING;
    _PatchedES.OPEN       = _OrigES.OPEN;
    _PatchedES.CLOSED     = _OrigES.CLOSED;
    _PatchedES.prototype  = _OrigES.prototype;
    window.EventSource = _PatchedES;
  }

  // ── API publique ──
  window.NetworkAudit = {
    // Copie du buffer.
    getLog: function() { return _logBuffer.slice(); },

    clear: function() { _logBuffer = []; },

    onLog: function(cb) {
      if (typeof cb !== "function") return function(){};
      _listeners.push(cb);
      return function unsubscribe() {
        const i = _listeners.indexOf(cb);
        if (i >= 0) _listeners.splice(i, 1);
      };
    },

    // Reconstruite à l'accès, dans la langue courante (rendu de la modale doc audit).
    get WHITELIST_HUMAN() { return _buildWhitelistHuman(); },

    // Export du bouton 📥.
    exportJson: function() {
      return JSON.stringify({
        exportedAt: new Date().toISOString(),
        app:        "MyKTAMap",
        appVersion: (window.__MKM__ && window.__MKM__.build) || "?",
        userAgent:  navigator.userAgent,
        origin:     location.origin,
        whitelist:  _buildWhitelistHuman(),
        bufferSize: _logBuffer.length,
        bufferMax:  BUFFER_MAX,
        entries:    _logBuffer.map(function(e) {
          return {
            timestamp: new Date(e.timestamp).toISOString(),
            kind:      e.kind,
            method:    e.method,
            url:       e.url,
            hasBody:   e.hasBody,
            category:  e.category,
            status:    e.status
          };
        })
      }, null, 2);
    }
  };

  // ── Bannière console (F12) : console native, ce script tourne AVANT le proxy de debug.js ──
  console.info(
    "%c[NetworkAudit]%c Instrumentation active. " +
    "Audit accessible via ⚙️ Configuration → 🔒 Audit réseau.",
    "background:#8cb4ff;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px;",
    "color:#8cb4ff;"
  );

})();
