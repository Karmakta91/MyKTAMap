/*!
 * MyKTAMap — Crash Reports
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// CRASHREPORTS.JS — Archive automatique des kills mémoire détectés (depuis v1.20.0)
// =========================
// Quand OOMGuard détecte au boot qu'un kill a eu lieu (heartbeat marker pas
// nettoyé proprement = pagehide/beforeunload jamais firé = OOM mobile très
// probable), on archive ce qu'on peut récupérer :
//   - killInfo (timestamp, ageSec, planId, userAgent)
//   - 50 derniers logs du buffer debug.js (qui sont en localStorage, survivent
//     au crash)
//   - dernier snapshot SessionBackups du même plan (= état au plus récent
//     auto-backup avant le crash, peut être assez vieux mais c'est mieux que
//     rien)
//
// Stockage IDB dédié `myktamap_crashes` v1, store `crashes`, FIFO 5 entries.
// Consultable depuis Memory Inspector (📊 Voir l'état mémoire) → section
// « 📋 Derniers crashs » avec bouton « Voir détails » + « Supprimer ».
//
// Utile pour :
//   - Diagnostiquer un bug qui crashe régulièrement (= pattern dans les logs)
//   - Partager au mainteneur via un rapport texte
//   - Confirmer qu'un fix a bien réglé un crash (= plus de nouveaux crashes)
// =========================

(function() {
  "use strict";

  const DB_NAME    = "myktamap_crashes";
  const DB_VERSION = 1;
  const STORE      = "crashes";
  const MAX_KEEP   = 5;

  // ───────── IndexedDB helpers ─────────
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

  // ───────── API ─────────

  /**
   * Sauve un crash report avec collecte automatique de contexte.
   * @param {Object} killInfo - { ageSec, planId, userAgent } depuis OOMGuard
   * @returns {Promise<Object|null>} l'entry sauvée ou null si échec
   */
  async function saveCrash(killInfo) {
    if (!killInfo) return null;

    // 1. Logs récents depuis localStorage (debug.js buffer, survit au crash)
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

    // 2. Dernier snapshot SessionBackups du même plan
    let sessionSnap = null;
    try {
      if (window.SessionBackups && typeof window.SessionBackups.listAll === "function" && killInfo.planId) {
        const all = await window.SessionBackups.listAll();
        sessionSnap = all.find(function(b) { return b.planId === killInfo.planId; }) || null;
      }
    } catch(e) {
      console.warn("[CrashReports] lecture SessionBackups échec :", e);
    }

    // 3. Build entry
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
      // Pour le snapshot session, on stocke uniquement les méta-infos (pas le
      // payload complet qui peut être gros). L'user peut ouvrir le snapshot
      // depuis Memory Inspector si besoin du contenu réel.
      sessionSnapMeta: sessionSnap ? {
        id:        sessionSnap.id,
        createdAt: sessionSnap.createdAt,
        reason:    sessionSnap.reason,
        planId:    sessionSnap.planId,
        planName:  sessionSnap.planName
      } : null
    };

    // 4. Write IDB
    try {
      await _withStore("readwrite", function(store) { return store.put(entry); });
    } catch(e) {
      console.warn("[CrashReports] saveCrash IDB échec :", e);
      return null;
    }

    // 5. Enforce FIFO max 5
    try { await _enforceLimit(); } catch(e) {}

    console.warn("[CrashReports] 📋 Crash report archivé (id=" + entry.id +
                 ", planId=" + entry.killInfo.planId + ", logs=" + logs.length + ")");

    return entry;
  }

  /**
   * Liste tous les crash reports, triés desc par timestamp.
   * @returns {Promise<Array>}
   */
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

  /**
   * Supprime 1 crash report par id.
   */
  function remove(id) {
    return _withStore("readwrite", function(store) { store.delete(id); });
  }

  /**
   * Vide tous les crash reports.
   */
  function clearAll() {
    return _withStore("readwrite", function(store) { store.clear(); });
  }

  /**
   * Enforce FIFO : garde les MAX_KEEP plus récents, supprime les autres.
   */
  function _enforceLimit() {
    return listAll().then(function(arr) {
      if (arr.length <= MAX_KEEP) return;
      const toDelete = arr.slice(MAX_KEEP);
      return Promise.all(toDelete.map(function(e) { return remove(e.id); }));
    });
  }

  /**
   * Formate 1 crash report en texte plain pour copier/coller (Discord, mail).
   */
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

  // ───────── Export ─────────
  window.CrashReports = {
    saveCrash:        saveCrash,
    listAll:          listAll,
    remove:           remove,
    clearAll:         clearAll,
    formatReportText: formatReportText
  };
})();
