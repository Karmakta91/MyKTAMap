/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 *
 * MODULE : networkAudit.js (introduit en v1.8.0 — Privacy & Audit)
 * =========================================================================
 *
 * Pourquoi ce module ?
 * --------------------
 * MyKTAMap est une PWA 100% client-side : tout vit dans le navigateur de
 * l'utilisateur (localStorage + IndexedDB). Aucun backend applicatif, aucune
 * DB serveur. Nginx ne fait que servir des fichiers statiques.
 *
 * Mais le milieu cataphile est ce qu'il est : la méfiance vis-à-vis d'une app
 * qui aurait une backdoor pour exfiltrer les plans est légitime. L'archi rend
 * la collecte techniquement impossible, mais l'utilisateur doit pouvoir le
 * vérifier par lui-même sans avoir à nous croire sur parole.
 *
 * Ce module :
 *   1. Instrumente TOUTES les API réseau du navigateur (fetch, XHR,
 *      sendBeacon, WebSocket, EventSource).
 *   2. Logge chaque requête dans un buffer en mémoire (max 500 entries).
 *   3. Permet à l'utilisateur de voir le journal en temps réel via la
 *      modale 📋 Voir le journal réseau (UI dans loaderConfigModal).
 *
 * Le module OBSERVE, il ne bloque rien : chaque requête part normalement et
 * est consignée. La seule requête vers un tiers que l'app peut émettre est le
 * fond de carte OpenStreetMap de la Vue OSM, coupé par la case 🗺️ Vue OSM
 * (OsmView.isOptedIn) et par le mode incognito — pas par ce module.
 * ⚠️ Les tuiles posées en <img> (Leaflet) ne passent pas par fetch/XHR :
 * elles n'apparaissent pas dans ce journal, seulement dans l'onglet Réseau
 * de F12.
 *
 * Origines attendues (WHITELIST_HUMAN, affichées dans la modale doc audit) :
 *   - Même origine (l'app elle-même servie depuis location.origin), dont
 *     le ping santé serveur <origin>/ping.html (body "OK").
 *   - blob: et data: (références locales au navigateur, aucun réseau).
 *
 * Ordre de chargement critique
 * ----------------------------
 * Ce script DOIT être chargé en premier dans <body> (avant tous les autres
 * modules JS qui pourraient appeler fetch/XHR au boot). L'ordre actuel dans
 * index.html :
 *   1. copyright.js   (watermark + console.log uniquement, pas de fetch)
 *   2. networkAudit.js ← ICI, avant tout reste
 *   3. debug.js       (proxy console)
 *   4. unlockGate.js  (gate communautaire)
 *   5. ... reste de l'app
 *
 * Si on inverse 1 et 2, ça ne change rien (copyright.js n'émet aucune
 * requête réseau). Mais networkAudit.js DOIT être avant debug.js, sw.register
 * et tout le reste, sinon les premiers fetch passent sous le radar.
 *
 * API publique exposée : window.NetworkAudit
 * ------------------------------------------
 *   getLog()        → Array<Entry>  — copie du buffer (snapshot)
 *   clear()         → void          — vide le buffer
 *   onLog(cb)       → unsubscribe   — callback appelé à chaque nouvel event
 *   WHITELIST_HUMAN → Array<string> — descriptions lisibles des origines attendues
 *   exportJson()    → string        — journal exporté (bouton 📥)
 *
 * Structure Entry :
 *   {
 *     timestamp: number,        // Date.now() à l'émission
 *     kind:      "fetch" | "xhr" | "beacon" | "websocket" | "eventsource",
 *     url:       string,
 *     method:    string,        // GET, POST, WS, SSE, etc.
 *     hasBody:   boolean,       // true si payload envoyé (POST/PUT/PATCH avec body)
 *     category:  string,        // classification (cf. _classify)
 *     status:    number | string | null   // HTTP status, "SENT", "FAIL", "OPEN"
 *   }
 * =========================================================================
 */

(function() {
  "use strict";

  // ============================================================
  // CONFIGURATION
  // ============================================================
  const BUFFER_MAX  = 500;

  // ============================================================
  // ORIGINES ATTENDUES (visibles à l'UI via WHITELIST_HUMAN)
  // ============================================================
  // Descriptions human-readable (affichées dans la modale doc audit).
  // Construites AU RENDU (jamais au load) → dicos i18n prêts. Exposées via
  // un getter `WHITELIST_HUMAN` sur l'API : chaque accès rebâtit l'array dans
  // la langue courante. Fallback FR si I18n absent.
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
      "data: URLs (base64 inline — icônes SVG embarquées dans le code, exports image ; aucune fuite réseau possible)"
    ];
    const sameOrigin = _t("netaudit.whitelist.sameOrigin", { origin: origin });
    const blob       = _t("netaudit.whitelist.blob");
    const data       = _t("netaudit.whitelist.data");
    return [
      sameOrigin != null ? sameOrigin : fr[0],
      blob       != null ? blob       : fr[1],
      data       != null ? data       : fr[2]
    ];
  }

  // ============================================================
  // STATE
  // ============================================================
  let _logBuffer = [];
  let _listeners = [];

  // ============================================================
  // HELPERS
  // ============================================================
  // Classification automatique pour l'affichage UI (label coloré)
  function _classify(url) {
    if (!url) return "unknown";
    // 🆕 v1.9.3-B-side + fix : ping santé serveur MyKTAMap = same-origin
    // /ping.html (chemin <origin>/ping.html). Garde le label "ping" pour
    // distinction visuelle dans le journal réseau.
    try {
      const u = new URL(url, location.origin);
      if (u.origin === location.origin && u.pathname === "/ping.html") return "ping";
    } catch(e) { /* skip */ }
    // Les blob URLs sont 100% LOCALES au navigateur (créées via
    // URL.createObjectURL à partir de Blob déjà en mémoire — typiquement
    // les tuiles V2 du tiling). Aucune fuite réseau possible : c'est juste
    // un déréférencement de donnée déjà présente. Catégorie dédiée pour
    // ne pas afficher en rouge "external" et inquiéter l'user.
    if (typeof url === "string" && url.indexOf("blob:") === 0) return "local-blob";
    // Idem pour data: URLs (base64 inline)
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
    // Buffer circulaire : on garde les BUFFER_MAX dernières entrées
    if (_logBuffer.length > BUFFER_MAX) _logBuffer.shift();
    // Notifications aux listeners (UI live)
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

  // ============================================================
  // INSTRUMENTATION fetch()
  // ============================================================
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

  // ============================================================
  // INSTRUMENTATION XMLHttpRequest
  // ============================================================
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

  // ============================================================
  // INSTRUMENTATION navigator.sendBeacon
  // ============================================================
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

  // ============================================================
  // INSTRUMENTATION WebSocket
  // ============================================================
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
    // Copie des constantes et du prototype
    _PatchedWS.CONNECTING = _OrigWS.CONNECTING;
    _PatchedWS.OPEN       = _OrigWS.OPEN;
    _PatchedWS.CLOSING    = _OrigWS.CLOSING;
    _PatchedWS.CLOSED     = _OrigWS.CLOSED;
    _PatchedWS.prototype  = _OrigWS.prototype;
    window.WebSocket = _PatchedWS;
  }

  // ============================================================
  // INSTRUMENTATION EventSource (Server-Sent Events)
  // ============================================================
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

  // ============================================================
  // API PUBLIQUE
  // ============================================================
  window.NetworkAudit = {
    // Lecture du buffer (copie, immutable pour le caller)
    getLog: function() { return _logBuffer.slice(); },

    // Vidage manuel du buffer
    clear: function() { _logBuffer = []; },

    // Souscription aux events live (UI journal)
    onLog: function(cb) {
      if (typeof cb !== "function") return function(){};
      _listeners.push(cb);
      return function unsubscribe() {
        const i = _listeners.indexOf(cb);
        if (i >= 0) _listeners.splice(i, 1);
      };
    },

    // Whitelist visible (pour l'UI doc audit). Getter → reconstruite à l'accès
    // dans la langue courante (appelé au rendu de la modale doc audit).
    get WHITELIST_HUMAN() { return _buildWhitelistHuman(); },

    // Export structuré pour le bouton 📥 Exporter JSON
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

  // ============================================================
  // BANNIÈRE CONSOLE (visible à F12, bypass debug.js proxy car
  // ce script tourne AVANT debug.js — console natif)
  // ============================================================
  console.info(
    "%c[NetworkAudit]%c Instrumentation active. " +
    "Audit accessible via ⚙️ Configuration → 🔒 Audit réseau.",
    "background:#8cb4ff;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px;",
    "color:#8cb4ff;"
  );

})();
