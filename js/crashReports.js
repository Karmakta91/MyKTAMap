/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// CRASHREPORTS.JS — Archive automatique des kills mémoire détectés
// =========================
// Quand OOMGuard détecte au démarrage un kill (marqueur heartbeat non nettoyé : pagehide / beforeunload jamais
// émis, OOM mobile très probable), on archive : killInfo (timestamp, ageSec, planId, userAgent), les 50 derniers
// logs de debug.js (en localStorage, ils survivent au crash), les méta-infos du dernier instantané SessionBackups
// du même plan.
// IDB `myktamap_crashes` v1, store `crashes`, FIFO 5 entrées. Consultable dans l'inspecteur mémoire (« Derniers
// crashs » : détails, suppression, rapport texte à partager).

(function() {
  "use strict";

  const DB_NAME    = "myktamap_crashes";
  const DB_VERSION = 1;
  const STORE      = "crashes";
  const MAX_KEEP   = 5;

  // ── Helpers IndexedDB ──────────
  function _openDb() {
    return new Promise(function(resolve, reject) {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch(e) { reject(e); return; }
      req.onupgradeneeded = function() {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error || new Error("indexedDB.open failed")); };
      req.onblocked = function() { reject(new Error("indexedDB.open blocked")); };
    });
  }

  function _withStore(mode, fn) {
    return _openDb().then(function(db) {
      return new Promise(function(resolve, reject) {
        let tx;
        try { tx = db.transaction([STORE], mode); } catch(e) { db.close(); reject(e); return; }
        const store = tx.objectStore(STORE);
        let result;
        try { result = fn(store); } catch(e) { reject(e); return; }
        tx.oncomplete = function() { db.close(); resolve(result); };
        tx.onerror    = function() { db.close(); reject(tx.error || new Error("tx error")); };
        tx.onabort    = function() { db.close(); reject(tx.error || new Error("tx aborted")); };
      });
    });
  }

  // ── API ──────────

  // Sauve un crash avec son contexte. killInfo = { ageSec, planId, userAgent } (OOMGuard) ; rend Promise de l'entrée
  // sauvée, ou null.
  async function saveCrash(killInfo) {
    if (!killInfo) return null;

    // 1. Logs récents (buffer debug.js en localStorage).
    let logs = [];
    try {
      const raw = localStorage.getItem("kta_debug_logs");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) logs = parsed.slice(-50);
      }
    } catch(e) {
      console.warn("[CrashReports] lecture kta_debug_logs échec :", e);
    }

    // 2. Dernier instantané SessionBackups du même plan.
    let sessionSnap = null;
    try {
      if (window.SessionBackups && typeof window.SessionBackups.listAll === "function" && killInfo.planId) {
        const all = await window.SessionBackups.listAll();
        sessionSnap = all.find(function(b) { return b.planId === killInfo.planId; }) || null;
      }
    } catch(e) {
      console.warn("[CrashReports] lecture SessionBackups échec :", e);
    }

    const now = Date.now();
    const entry = {
      id:         now,
      timestamp:  now,
      crashAt:    now - (killInfo.ageSec || 0) * 1000,  // timestamp estimé du crash
      killInfo:   {
        ageSec:    killInfo.ageSec    || null,
        planId:    killInfo.planId    || null,
        userAgent: killInfo.userAgent || (navigator.userAgent || "?")
      },
      appVersion: (window.__MKM__ && window.__MKM__.build) || "?",
      logs:       logs,
      // Méta-infos seulement (le payload peut être gros) ; le contenu s'ouvre depuis l'inspecteur mémoire.
      sessionSnapMeta: sessionSnap ? {
        id:        sessionSnap.id,
        createdAt: sessionSnap.createdAt,
        reason:    sessionSnap.reason,
        planId:    sessionSnap.planId,
        planName:  sessionSnap.planName
      } : null
    };

    try {
      await _withStore("readwrite", function(store) { return store.put(entry); });
    } catch(e) {
      console.warn("[CrashReports] saveCrash IDB échec :", e);
      return null;
    }

    // FIFO : 5 au plus.
    try { await _enforceLimit(); } catch(e) {}

    console.warn("[CrashReports] 📋 Crash report archivé (id=" + entry.id +
                 ", planId=" + entry.killInfo.planId + ", logs=" + logs.length + ")");

    return entry;
  }

  // Tous les crashs, par horodatage décroissant (Promise<Array>).
  function listAll() {
    return _withStore("readonly", function(store) {
      return new Promise(function(resolve, reject) {
        const req = store.getAll();
        req.onsuccess = function() {
          const arr = req.result || [];
          arr.sort(function(a, b) { return (b.id || 0) - (a.id || 0); });
          resolve(arr);
        };
        req.onerror = function() { reject(req.error); };
      });
    }).catch(function(e) {
      console.warn("[CrashReports] listAll échec :", e);
      return [];
    });
  }

  function remove(id) {
    return _withStore("readwrite", function(store) { store.delete(id); });
  }

  function clearAll() {
    return _withStore("readwrite", function(store) { store.clear(); });
  }

  // FIFO : garde les MAX_KEEP plus récents.
  function _enforceLimit() {
    return listAll().then(function(arr) {
      if (arr.length <= MAX_KEEP) return;
      const toDelete = arr.slice(MAX_KEEP);
      return Promise.all(toDelete.map(function(e) { return remove(e.id); }));
    });
  }

  // Un crash en texte brut, à copier-coller (messagerie, mail).
  function formatReportText(entry) {
    if (!entry) return "";
    const lines = [];
    lines.push("=========================================");
    lines.push("MyKTAMap — Crash Report #" + entry.id);
    lines.push("=========================================");
    lines.push("📅 Archivé    : " + new Date(entry.timestamp).toISOString());
    lines.push("💥 Crash ~    : " + new Date(entry.crashAt).toISOString() +
                "  (il y a " + (entry.killInfo.ageSec || "?") + "s avant détection)");
    lines.push("📦 Version    : " + entry.appVersion);
    lines.push("🗂️  Plan       : " + (entry.killInfo.planId || "(aucun)"));
    lines.push("🌐 User-Agent : " + (entry.killInfo.userAgent || "?"));
    if (entry.sessionSnapMeta) {
      const s = entry.sessionSnapMeta;
      lines.push("");
      lines.push("📦 DERNIER SNAPSHOT SESSION (avant le crash)");
      lines.push("─────────────────────────────────────────");
      lines.push("ID        : " + s.id);
      lines.push("Créé le   : " + new Date(s.createdAt).toISOString());
      lines.push("Raison    : " + (s.reason || "?"));
      lines.push("Plan name : " + (s.planName || "?"));
    } else {
      lines.push("");
      lines.push("📦 Aucun snapshot session du plan disponible");
    }
    lines.push("");
    lines.push("📋 DERNIERS LOGS (" + (entry.logs || []).length + ")");
    lines.push("─────────────────────────────────────────");
    (entry.logs || []).forEach(function(l) { lines.push(String(l)); });
    lines.push("=========================================");
    return lines.join("\n");
  }

  // ── Export ──────────
  window.CrashReports = {
    saveCrash:        saveCrash,
    listAll:          listAll,
    remove:           remove,
    clearAll:         clearAll,
    formatReportText: formatReportText
  };
})();
