/*!
 * MyKTAMap — Memory Inspector
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// MEMINSPECTOR.JS — Topo lisible de ce qui est chargé en mémoire (depuis v1.19.0)
// =========================
// Outil de transparence + debug pour comprendre l'état mémoire local de
// l'application : localStorage, IndexedDB, Cache PWA (Service Worker),
// Storage estimate navigateur, Runtime (PLAN_CONFIG, session active, modules
// chargés). Pratique pour :
//   - Diagnostiquer un bug "ma session disparaît" / "mes photos ne sont pas là"
//   - Vérifier qu'un reset complet a bien purgé tout
//   - Voir la consommation mémoire avant un export volumineux
//   - Partager un rapport par DM au mainteneur (bouton 📋 Copier)
//
// Accessible depuis le loader home : ⚙️ Configuration → section
// 📊 Inspecteur → bouton 📊 État mémoire.
// =========================

(function() {
  "use strict";

  // 🆕 v1.31.5 (P2 progressive lazy CSS) — préchargement du chunk CSS dédié.
  // Cf perf-memory §87 (helper window._loadCssOnce posé par js/cssLazy.js).
  if (typeof window._loadCssOnce === "function") {
    window._loadCssOnce("css/style-meminspector.css", "kta-css-style-meminspector");
  }

  const MODAL_ID = "kta-mem-inspector-modal";

  // 🆕 v1.44.0 — Pilote ModalLifecycle : centralise timers + listeners +
  // blob URLs de la modale principale (cleanup auto au close). Le helper est
  // chargé avant memInspector dans index.html, donc on peut compter sur lui.
  let _lc = null;

  // ========== HELPER : FORMAT BYTES ==========
  function _formatBytes(n) {
    if (n == null || isNaN(n)) return "—";
    const num = Number(n);
    if (num < 0) return "—";
    if (num === 0) return "0 B";
    if (num < 1024) return num + " B";
    if (num < 1024 * 1024) return (num / 1024).toFixed(1) + " KB";
    if (num < 1024 * 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + " MB";
    return (num / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  function _escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function(c) {
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" })[c];
    });
  }

  // ========== COLLECTE : localStorage ==========
  function _collectLocalStorage() {
    const result = { keys: [], totalBytes: 0, error: null };
    try {
      const interesting = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k == null) continue;
        // Filter sur prefix MyKTAMap + quelques clés app pertinentes
        const isOurs = /^myktamap_/i.test(k)
                    || /^app_user_prefs$/i.test(k)
                    || /^kta_/i.test(k);
        if (!isOurs) continue;
        try {
          const v = localStorage.getItem(k) || "";
          // UTF-16 = ~2 bytes per char, approximation suffisante pour un topo
          const sizeBytes = v.length * 2;
          interesting.push({ key: k, sizeBytes: sizeBytes, sizePretty: _formatBytes(sizeBytes) });
          result.totalBytes += sizeBytes;
        } catch(e) { /* skip clé inaccessible */ }
      }
      interesting.sort(function(a, b) { return b.sizeBytes - a.sizeBytes; });
      result.keys = interesting;
    } catch(e) {
      result.error = String(e.message || e);
    }
    return result;
  }

  // ========== COLLECTE : IndexedDB ==========
  // Bases MyKTAMap connues. Si indexedDB.databases() est dispo (Chrome,
  // Firefox récent), on scan aussi pour détecter d'autres bases potentielles.
  const KNOWN_IDB_DBS = [
    { name: "myktamap_handles", stores: ["handles", "blobs"] },
    { name: "myktamap_backups", stores: ["backups"] },
    { name: "myktamap_photos",  stores: ["photos"] },
    // 🆕 v1.20.0 — Crash Reports (cf js/crashReports.js)
    { name: "myktamap_crashes", stores: ["crashes"] },
    // 🆕 v1.69.0 — Le Carnet : archive des sorties (cf js/journal.js)
    { name: "myktamap_journal", stores: ["sorties"] },
    // 🆕 v1.69.0 — Documents PDF du Mode Histoire (N par plan depuis v1.69.0).
    // Absente de cette liste depuis v1.34.20 : les PDF pesaient sans apparaître.
    { name: "myktamap_histoire_pdfs", stores: ["pdfs"] }
  ];

  function _openDb(name) {
    return new Promise(function(resolve, reject) {
      let req;
      try { req = indexedDB.open(name); } catch(e) { reject(e); return; }
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error || new Error("open " + name + " failed")); };
      req.onblocked = function() { reject(new Error("open " + name + " blocked")); };
    });
  }

  function _countStore(db, storeName) {
    return new Promise(function(resolve) {
      let tx, store;
      try {
        tx = db.transaction([storeName], "readonly");
        store = tx.objectStore(storeName);
      } catch(e) { resolve({ ok: false, error: String(e.message || e) }); return; }
      const req = store.count();
      req.onsuccess = function() { resolve({ ok: true, count: req.result }); };
      req.onerror   = function() { resolve({ ok: false, error: "count failed" }); };
    });
  }

  async function _collectIndexedDB() {
    const result = { databases: [], scanError: null };

    // Tente d'abord la découverte native (Chrome 71+, Firefox 126+)
    let discoveredNames = null;
    try {
      if (indexedDB && typeof indexedDB.databases === "function") {
        const list = await indexedDB.databases();
        discoveredNames = list.map(function(d) { return d.name; }).filter(Boolean);
      }
    } catch(e) {
      result.scanError = _t("collect.err.idbDatabasesUnsupported", { detail: String(e.message || e) });
    }

    // Union avec les bases connues (au cas où discoveredNames soit incomplet
    // sur certains navigateurs, ou si la base existe pas — open la crée à vide
    // ce qu'on ne veut PAS faire ici, on filtre uniquement les connues qui ont
    // été détectées au scan natif si dispo)
    const namesToInspect = [];
    KNOWN_IDB_DBS.forEach(function(kdb) {
      // Si discoveredNames est dispo, on ne traite que celles présentes
      if (discoveredNames) {
        if (discoveredNames.indexOf(kdb.name) >= 0) namesToInspect.push(kdb);
      } else {
        // Fallback : on tente d'ouvrir toutes les connues
        // (peut créer une base vide si elle n'existait pas — accepté)
        namesToInspect.push(kdb);
      }
    });

    // Bases découvertes mais pas dans KNOWN_IDB_DBS (= bases tierces qui
    // pourraient être pollution d'extensions ou de session précédente)
    if (discoveredNames) {
      discoveredNames.forEach(function(name) {
        const known = KNOWN_IDB_DBS.some(function(k) { return k.name === name; });
        if (!known) {
          namesToInspect.push({ name: name, stores: null });
        }
      });
    }

    for (const desc of namesToInspect) {
      const dbInfo = { name: desc.name, version: null, stores: [], totalEntries: 0, error: null };
      let db = null;
      try {
        db = await _openDb(desc.name);
        dbInfo.version = db.version;
        const storeNames = desc.stores || Array.from(db.objectStoreNames);
        for (const sn of storeNames) {
          if (!db.objectStoreNames.contains(sn)) {
            dbInfo.stores.push({ name: sn, count: 0, missing: true });
            continue;
          }
          const c = await _countStore(db, sn);
          if (c.ok) {
            dbInfo.stores.push({ name: sn, count: c.count });
            dbInfo.totalEntries += c.count;
          } else {
            dbInfo.stores.push({ name: sn, count: -1, error: c.error });
          }
        }
      } catch(e) {
        dbInfo.error = String(e.message || e);
      } finally {
        try { if (db) db.close(); } catch(e) {}
      }
      result.databases.push(dbInfo);
    }

    return result;
  }

  // ========== COLLECTE : Cache PWA (Service Worker) ==========
  async function _collectCachePWA() {
    const result = { cacheNames: [], activeCache: null, error: null };
    try {
      if (!("caches" in window)) {
        result.error = _t("collect.err.cacheApiUnsupported");
        return result;
      }
      result.cacheNames = await caches.keys();
      // Détection du cache courant : celui qui correspond à __MKM__.build
      const buildVer = window.__MKM__ && window.__MKM__.build;
      let activeName = null;
      if (buildVer) {
        const guess = "myktamap-cache-" + buildVer;
        if (result.cacheNames.indexOf(guess) >= 0) activeName = guess;
      }
      if (!activeName && result.cacheNames.length > 0) {
        // Fallback : prendre le 1er qui commence par myktamap-cache
        activeName = result.cacheNames.find(function(n) { return /^myktamap-cache-/.test(n); }) || result.cacheNames[0];
      }
      if (activeName) {
        const c = await caches.open(activeName);
        const reqs = await c.keys();
        result.activeCache = {
          name:        activeName,
          assetCount:  reqs.length,
          assetSample: reqs.slice(0, 12).map(function(r) {
            try { return new URL(r.url).pathname; } catch(e) { return r.url; }
          })
        };
      }
    } catch(e) {
      result.error = String(e.message || e);
    }
    return result;
  }

  // ========== COLLECTE : Storage Estimate ==========
  async function _collectStorageEstimate() {
    const result = { usage: null, quota: null, usagePct: null, error: null };
    try {
      if (!(navigator.storage && typeof navigator.storage.estimate === "function")) {
        result.error = _t("collect.err.storageEstimateUnsupported");
        return result;
      }
      const est = await navigator.storage.estimate();
      result.usage = est.usage || 0;
      result.quota = est.quota || 0;
      result.usagePct = result.quota > 0 ? (result.usage / result.quota * 100) : 0;
    } catch(e) {
      result.error = String(e.message || e);
    }
    return result;
  }

  // ========== COLLECTE : Runtime ==========
  // Liste des modules window.* MyKTAMap qu'on s'attend à voir. Présence
  // = chargé OK, absence = problème de chargement ou intentionnellement skip.
  const KNOWN_MODULES = [
    "PlanRegistry", "SessionPersist", "SessionBackups", "MyKTAMapPhotos",
    "MyKTAMapPhotoViewer", "LegendCustomization", "Favoris", "KmzExport",
    "KmzImport", "GpxIO", "GpxImport", "ThemeManager", "BatteryGuard",
    "HistoryManager", "MyKTAMapPinLock", "UnlockGate", "OOMGuard",
    "NetworkAudit", "UpdateChecker", "AlertChecker", "PerfUltra",
    // 🐛 v1.79.3 (KARMA « 31/32, pourquoi ? ») — le module s'expose sous
    // MyKTAMapTrackerReplay depuis toujours : « TrackerReplay » n'a JAMAIS
    // existé sur window, le compteur ne pouvait pas atteindre 32/32.
    "CompassWidget", "MyKTAMapTrackerReplay", "Pathfinder", "SearchPoints",
    "MyKTAMapPdfExport", "RefonteInterface", "MemInspector",
    // 🆕 v1.20.0
    "CrashReports", "StatsGlobales",
    // 🆕 v1.21.0
    "Tutorial",
    // 🆕 v1.22.0
    "ProfileExportImport"
  ];

  function _collectRuntime() {
    const result = {
      appVersion:   (window.__MKM__ && window.__MKM__.build) || "?",
      planLoaded:   null,
      sessionStats: null,
      appConfig:    {},
      modulesLoaded:   [],
      modulesMissing:  []
    };

    // Modules chargés
    KNOWN_MODULES.forEach(function(name) {
      if (window[name] != null) result.modulesLoaded.push(name);
      else                       result.modulesMissing.push(name);
    });

    // Plan chargé
    try {
      const pc = window.PLAN_CONFIG;
      if (pc && pc.plan) {
        result.planLoaded = {
          name:       pc.plan.name || (window.I18n ? window.I18n.t("stats.plan.noName") : "(sans nom)"),
          version:    pc.plan.version || "—",
          author:     pc.plan.author || "—",
          imageW:     pc.plan.imageWidth || null,
          imageH:     pc.plan.imageHeight || null,
          multiLevel: pc.plan.multiLevel === true,
          tiledV2:    pc.plan.tiledV2 === true,
          hasCustomLegend: !!(pc.plan.customLegend && typeof pc.plan.customLegend === "object"),
          imageLayersCount: (pc.imageLayers || []).length,
          dataLayersCount:  (pc.dataLayers  || []).length
        };
      }
    } catch(e) { /* skip */ }

    // Session active (= compteurs des annotations actuellement en RAM)
    try {
      const points  = typeof window.getEditorPoints  === "function" ? (window.getEditorPoints()  || []).length : 0;
      const roads   = typeof window.getRoads         === "function" ? (window.getRoads()         || []).length : 0;
      const zones   = typeof window.getZones         === "function" ? (window.getZones()         || []).length : 0;
      const structs = typeof window.getStructures    === "function" ? (window.getStructures()    || []).length : 0;
      const measure = typeof window.getMeasurePoints === "function" ? (window.getMeasurePoints() || []).length : 0;
      const trackingOn = typeof window.getTrackingActif === "function" ? !!window.getTrackingActif() : false;
      let itiActive = false;
      if (typeof window.getRoads === "function") {
        itiActive = (window.getRoads() || []).some(function(r) { return r && r.type === "itinerary"; });
      }
      result.sessionStats = {
        editorPoints:  points,
        roads:         roads,
        zones:         zones,
        structures:    structs,
        measurePoints: measure,
        trackingActif: trackingOn,
        itineraireActif: itiActive
      };
    } catch(e) { /* skip */ }

    // APP_CONFIG : champs pertinents uniquement (pas tout, pour rester lisible)
    try {
      const ac = window.APP_CONFIG || {};
      result.appConfig = {
        debugMode:              ac.debugMode === true,
        perfPreset:             ac.perfPreset || "?",
        scaledMarkers:          ac.scaledMarkers !== false,
        showRoadIntersections:  ac.showRoadIntersections === true,   // défaut OFF (config.js)
        multiLevel:             ac.multiLevel === true,
        activeLevel:            ac.activeLevel != null ? ac.activeLevel : null
      };
    } catch(e) { /* skip */ }

    return result;
  }

  // ========== COLLECTE : Crash Reports (v1.20.0) ==========
  async function _collectCrashReports() {
    const result = { reports: [], error: null };
    try {
      if (!window.CrashReports || typeof window.CrashReports.listAll !== "function") {
        result.error = _t("collect.err.crashReportsNotLoaded");
        return result;
      }
      result.reports = await window.CrashReports.listAll();
    } catch(e) {
      result.error = String(e.message || e);
    }
    return result;
  }

  // ========== COLLECTE GLOBALE ==========
  // ========== 🧹 v1.79.3 — DONNÉES ORPHELINES (demande KARMA : « un profil
  // historique a plein de données IDB liées à des plans qui n'existent
  // plus ») : compare la liste de plans à date (registre) aux entrées
  // par-plan du stockage local, et PROPOSE la suppression (jamais auto —
  // une session orpheline redevient utile si l'user réimporte le ZIP).
  // Scanné : sessions auto (LS), géoref/calib KMZ (LS), archives ZIP +
  // handles (IDB), photos (IDB), backups (IDB). EXCLUS par design : Carnet
  // et récits du Mode Histoire (l'HISTOIRE survit aux plans, v1.69).
  async function _collectOrphelins() {
    const out = { plans: [], totalBytes: 0, error: null };
    try {
      const vivants = new Set(
        (window.PlanRegistry && window.PlanRegistry.getAll ? window.PlanRegistry.getAll() : [])
          .map(function(p) { return p.id; })
      );
      const parId = {};   // planId → { session, calib, blobBytes, handles, photos, backups, nom }
      const entree = function(id) {
        return parId[id] || (parId[id] = { id: id, sessionBytes: 0, calib: false, blobBytes: 0, handle: false, photos: 0, photoBytes: 0, backups: 0, nom: null });
      };
      // LS : sessions + calibs
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        let id = null, type = null;
        if (k.indexOf("myktamap_session_v1_") === 0) { id = k.slice("myktamap_session_v1_".length); type = "session"; }
        else if (k.indexOf("myktamap_kmz_calib_") === 0) { id = k.slice("myktamap_kmz_calib_".length); type = "calib"; }
        if (!id || id === "default" || vivants.has(id)) continue;
        const e = entree(id);
        const val = localStorage.getItem(k) || "";
        if (type === "session") {
          e.sessionBytes = val.length;
          try { const p = JSON.parse(val); if (p && p.planName) e.nom = p.planName; } catch(err) {}
        } else e.calib = true;
      }
      // IDB myktamap_handles : blobs (archives ZIP) + handles FS
      try {
        const db = await _openDb("myktamap_handles");
        for (const st of ["blobs", "handles"]) {
          if (!db.objectStoreNames.contains(st)) continue;
          const cles = await new Promise(function(resolve) {
            const req = db.transaction([st], "readonly").objectStore(st).getAllKeys();
            req.onsuccess = function() { resolve(req.result || []); };
            req.onerror   = function() { resolve([]); };
          });
          for (const id of cles) {
            if (typeof id !== "string" || vivants.has(id)) continue;
            const e = entree(id);
            if (st === "handles") e.handle = true;
            else {
              const blob = await new Promise(function(resolve) {
                const req = db.transaction([st], "readonly").objectStore(st).get(id);
                req.onsuccess = function() { resolve(req.result || null); };
                req.onerror   = function() { resolve(null); };
              });
              e.blobBytes = (blob && blob.size) || 0;
            }
          }
        }
        db.close();
      } catch(e) { /* base absente : rien à scanner */ }
      // IDB photos
      try {
        const db = await _openDb("myktamap_photos");
        if (db.objectStoreNames.contains("photos")) {
          const toutes = await new Promise(function(resolve) {
            const req = db.transaction(["photos"], "readonly").objectStore("photos").getAll();
            req.onsuccess = function() { resolve(req.result || []); };
            req.onerror   = function() { resolve([]); };
          });
          toutes.forEach(function(ph) {
            if (!ph || !ph.planId || vivants.has(ph.planId)) return;
            const e = entree(ph.planId);
            e.photos++;
            e.photoBytes += (ph.size || (ph.blob && ph.blob.size) || 0);
          });
        }
        db.close();
      } catch(e) {}
      // IDB backups (via l'API : léger, payloads en RAM le temps du scan)
      if (window.SessionBackups && typeof window.SessionBackups.listAll === "function") {
        try {
          const backs = await window.SessionBackups.listAll();
          backs.forEach(function(b) {
            if (!b || !b.planId || vivants.has(b.planId)) return;
            const e = entree(b.planId);
            e.backups++;
            if (!e.nom && b.planName) e.nom = b.planName;
          });
        } catch(e) {}
      }
      out.plans = Object.values(parId);
      out.plans.forEach(function(e) { out.totalBytes += e.sessionBytes + e.blobBytes + e.photoBytes; });
    } catch(e) {
      out.error = String(e && e.message || e);
    }
    return out;
  }

  // Purge d'UN plan orphelin : données associées + archive/handle IDB.
  async function _purgerOrphelin(id) {
    if (window.PlanRegistry) {
      try { await window.PlanRegistry.purgeAssociatedData(id); } catch(e) {}
      try { await window.PlanRegistry.removeBlob(id); } catch(e) {}
      try { await window.PlanRegistry.removeHandle(id); } catch(e) {}
    }
  }

  async function collecter() {
    const ts = new Date().toISOString();
    const runtime = _collectRuntime();
    const localS = _collectLocalStorage();
    const [idb, cachePwa, storageEst, crashes, orphelins] = await Promise.all([
      _collectIndexedDB(),
      _collectCachePWA(),
      _collectStorageEstimate(),
      _collectCrashReports(),
      _collectOrphelins()
    ]);
    return {
      timestamp:       ts,
      runtime:         runtime,
      localStorage:    localS,
      indexedDB:       idb,
      cachePWA:        cachePwa,
      storageEstimate: storageEst,
      crashReports:    crashes,
      orphelins:       orphelins
    };
  }

  // ========== RAPPORT TEXTE (pour bouton 📋 Copier) ==========
  function getReportText(rep) {
    if (!rep) return "";
    const lines = [];
    lines.push("=========================================");
    lines.push(_t("report.titre"));
    lines.push("=========================================");
    lines.push(_t("report.timestamp", { ts: rep.timestamp }));
    lines.push(_t("report.version", { version: rep.runtime.appVersion }));
    lines.push("");

    // Runtime
    lines.push(_t("report.runtime"));
    lines.push("─────────────────────────────────────────");
    if (rep.runtime.planLoaded) {
      const p = rep.runtime.planLoaded;
      lines.push(_t("report.plan", { name: p.name, version: p.version, w: (p.imageW || "?"), h: (p.imageH || "?") }));
      lines.push("  " + _t("report.plan.author", { author: p.author }));
      lines.push("  " + _t("report.plan.flags", { mlvl: (p.multiLevel ? "ON" : "OFF"), tiled: (p.tiledV2 ? "ON" : "OFF") }));
      lines.push("  " + _t("report.plan.layers", { image: p.imageLayersCount, data: p.dataLayersCount }));
      lines.push("  " + _t("report.plan.legend", { val: (p.hasCustomLegend ? _t("report.yes") : _t("report.no")) }));
    } else {
      lines.push(_t("report.plan.none"));
    }
    if (rep.runtime.sessionStats) {
      const s = rep.runtime.sessionStats;
      lines.push(_t("report.session", { points: s.editorPoints, roads: s.roads, zones: s.zones, structures: s.structures }));
      lines.push("  " + _t("report.session.detail", { measure: s.measurePoints, tracker: (s.trackingActif ? "ON" : "OFF"), iti: (s.itineraireActif ? "ON" : "OFF") }));
    }
    const ac = rep.runtime.appConfig;
    lines.push("APP_CONFIG : debug=" + ac.debugMode + ", perfPreset=" + ac.perfPreset + ", scaledMarkers=" + ac.scaledMarkers + ", intersections=" + ac.showRoadIntersections + ", M-LVL=" + ac.multiLevel);
    lines.push(_t("report.modules", { loaded: rep.runtime.modulesLoaded.length, total: (rep.runtime.modulesLoaded.length + rep.runtime.modulesMissing.length), list: rep.runtime.modulesLoaded.join(", ") }));
    if (rep.runtime.modulesMissing.length > 0) {
      lines.push(_t("report.modules.missing", { list: rep.runtime.modulesMissing.join(", ") }));
    }
    lines.push("");

    // localStorage
    lines.push(_t("report.ls"));
    lines.push("─────────────────────────────────────────");
    if (rep.localStorage.error) {
      lines.push(_t("report.error", { detail: rep.localStorage.error }));
    } else {
      lines.push(_t("report.ls.total", { count: rep.localStorage.keys.length, size: _formatBytes(rep.localStorage.totalBytes) }));
      rep.localStorage.keys.forEach(function(k) {
        lines.push("  " + k.sizePretty.padStart(10, " ") + "  " + k.key);
      });
    }
    lines.push("");

    // IndexedDB
    lines.push(_t("report.idb"));
    lines.push("─────────────────────────────────────────");
    if (rep.indexedDB.scanError) {
      lines.push(_t("report.idb.scanError", { detail: rep.indexedDB.scanError }));
    }
    if (rep.indexedDB.databases.length === 0) {
      lines.push(_t("report.idb.empty"));
    }
    rep.indexedDB.databases.forEach(function(db) {
      lines.push("• " + db.name + (db.version != null ? " (v" + db.version + ")" : "") + (db.error ? "  ⚠️ " + db.error : ""));
      db.stores.forEach(function(s) {
        if (s.missing) {
          lines.push("    └─ " + s.name + " : " + _t("report.idb.storeMissing"));
        } else if (s.count < 0) {
          lines.push("    └─ " + s.name + " : ⚠️ " + (s.error || _t("report.idb.countError")));
        } else {
          lines.push("    └─ " + s.name + " : " + _t("idb.store.entries", { count: s.count }));
        }
      });
    });
    lines.push("");

    // Cache PWA
    lines.push(_t("report.cache"));
    lines.push("─────────────────────────────────────────");
    if (rep.cachePWA.error) {
      lines.push("⚠️ " + rep.cachePWA.error);
    } else {
      lines.push(_t("report.cache.existing", { count: rep.cachePWA.cacheNames.length }));
      rep.cachePWA.cacheNames.forEach(function(n) {
        const mark = (rep.cachePWA.activeCache && rep.cachePWA.activeCache.name === n) ? "★ " : "  ";
        lines.push(mark + n);
      });
      if (rep.cachePWA.activeCache) {
        lines.push("");
        lines.push(_t("report.cache.active", { name: rep.cachePWA.activeCache.name, count: rep.cachePWA.activeCache.assetCount }));
        if (rep.cachePWA.activeCache.assetSample.length > 0) {
          lines.push(_t("report.cache.sample"));
          rep.cachePWA.activeCache.assetSample.forEach(function(u) { lines.push("  " + u); });
        }
      }
    }
    lines.push("");

    // Storage estimate
    lines.push(_t("report.storage"));
    lines.push("─────────────────────────────────────────");
    if (rep.storageEstimate.error) {
      lines.push("⚠️ " + rep.storageEstimate.error);
    } else {
      lines.push(_t("report.storage.usage", { val: _formatBytes(rep.storageEstimate.usage) }));
      lines.push(_t("report.storage.quota", { val: _formatBytes(rep.storageEstimate.quota) }));
      lines.push(_t("report.storage.used", { val: (rep.storageEstimate.usagePct != null ? rep.storageEstimate.usagePct.toFixed(2) + " %" : "—") }));
    }
    lines.push("");

    // 🆕 v1.20.0 — Crash Reports
    const cr = rep.crashReports || { reports: [], error: null };
    lines.push(_t("report.crash"));
    lines.push("─────────────────────────────────────────");
    if (cr.error) {
      lines.push("⚠️ " + cr.error);
    } else if (cr.reports.length === 0) {
      lines.push(_t("report.crash.empty"));
    } else {
      cr.reports.forEach(function(entry) {
        const dateTxt = new Date(entry.timestamp).toISOString();
        const planTxt = entry.killInfo && entry.killInfo.planId ? entry.killInfo.planId : _t("crash.noPlan");
        const ageSec  = entry.killInfo && entry.killInfo.ageSec != null ? entry.killInfo.ageSec + "s" : "?";
        const logsN   = (entry.logs || []).length;
        lines.push("• #" + entry.id + "  " + dateTxt +
                   "  v" + (entry.appVersion || "?") +
                   "  plan=" + planTxt +
                   "  age=" + ageSec +
                   "  logs=" + logsN);
      });
      lines.push(_t("report.crash.detailsHint"));
    }
    lines.push("");
    lines.push("=========================================");

    return lines.join("\n");
  }

  // ========== UI : MODALE ==========
  // ========== HELPER I18N ==========
  // Appelé AU RENDU uniquement (jamais au load) → les dicos sont prêts.
  function _t(key, params) {
    return (window.I18n && typeof window.I18n.t === "function")
      ? window.I18n.t("meminsp." + key, params)
      : key;
  }
  function _locale() {
    return (window.I18n && typeof window.I18n.getLang === "function") ? window.I18n.getLang() : "fr";
  }

  function _buildModalHtml() {
    return ''
      + '<div class="kta-readme-modal-boite kta-mem-inspector-boite">'
      +   '<div class="kta-readme-modal-header">'
      +     '<span class="kta-readme-modal-titre">' + _t("titre") + '</span>'
      +     '<button type="button" class="kta-panneau-close" id="kta-mem-close" aria-label="' + _t("close") + '">✕</button>'
      +   '</div>'
      +   '<div class="kta-readme-modal-corps" id="kta-mem-corps">'
      +     '<div class="kta-mem-loading">' + _t("loading") + '</div>'
      +   '</div>'
      +   '<div class="kta-readme-modal-footer kta-mem-footer">'
      +     '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-mem-refresh">' + _t("btn.refresh") + '</button>'
      +     '<button type="button" class="kta-btn kta-btn-primary" id="kta-mem-copy">' + _t("btn.copy") + '</button>'
      +   '</div>'
      + '</div>';
  }

  function _renderReport(rep) {
    const r = rep.runtime;
    const ls = rep.localStorage;
    const idb = rep.indexedDB;
    const cp = rep.cachePWA;
    const se = rep.storageEstimate;

    let html = "";

    // === Header ===
    html += '<div class="kta-mem-header-stamp">';
    html += _t("stamp", { date: _escapeHtml(new Date(rep.timestamp).toLocaleString(_locale())), version: _escapeHtml(r.appVersion) });
    html += '</div>';

    // === Section RUNTIME ===
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">' + _t("runtime.titre") + '</div>';
    if (r.planLoaded) {
      const p = r.planLoaded;
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("runtime.plan") + '</span>';
      html += '<span class="kta-mem-val">' + _escapeHtml(p.name) + ' ' + _escapeHtml(p.version) +
              ' <span class="kta-mem-dim">(' + (p.imageW || "?") + '×' + (p.imageH || "?") + ' px)</span></span></div>';
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("runtime.author") + '</span><span class="kta-mem-val">' + _escapeHtml(p.author) + '</span></div>';
      const flags = [];
      if (p.multiLevel) flags.push('<span class="kta-mem-tag">' + _t("runtime.tag.mlvl") + '</span>');
      if (p.tiledV2)    flags.push('<span class="kta-mem-tag">' + _t("runtime.tag.tiled") + '</span>');
      if (p.hasCustomLegend) flags.push('<span class="kta-mem-tag">' + _t("runtime.tag.legend") + '</span>');
      flags.push('<span class="kta-mem-tag-dim">' + _t("runtime.tag.imageLayers", { count: p.imageLayersCount }) + '</span>');
      flags.push('<span class="kta-mem-tag-dim">' + _t("runtime.tag.dataLayers", { count: p.dataLayersCount }) + '</span>');
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("runtime.flags") + '</span><span class="kta-mem-val kta-mem-flags">' + flags.join(" ") + '</span></div>';
    } else {
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("runtime.plan") + '</span><span class="kta-mem-val kta-mem-dim">' + _t("runtime.plan.none") + '</span></div>';
    }

    if (r.sessionStats) {
      const s = r.sessionStats;
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("runtime.session") + '</span>';
      html += '<span class="kta-mem-val">' +
                '📍 ' + s.editorPoints + ' · 🛣️ ' + s.roads + ' · ⬛ ' + s.zones + ' · 🏛️ ' + s.structures +
                ' <span class="kta-mem-dim">' + _t("runtime.session.hint") + '</span></span></div>';
      const liveTags = [];
      if (s.measurePoints > 0) liveTags.push('<span class="kta-mem-tag">' + _t("runtime.tag.measure", { count: s.measurePoints }) + '</span>');
      if (s.trackingActif)     liveTags.push('<span class="kta-mem-tag kta-mem-tag-on">' + _t("runtime.tag.trackerOn") + '</span>');
      else                     liveTags.push('<span class="kta-mem-tag-dim">' + _t("runtime.tag.trackerOff") + '</span>');
      if (s.itineraireActif)   liveTags.push('<span class="kta-mem-tag kta-mem-tag-on">' + _t("runtime.tag.itiActive") + '</span>');
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("runtime.live") + '</span><span class="kta-mem-val kta-mem-flags">' + liveTags.join(" ") + '</span></div>';
    }

    const ac = r.appConfig;
    const cfgTags = [];
    if (ac.debugMode) cfgTags.push('<span class="kta-mem-tag kta-mem-tag-warn">' + _t("runtime.tag.debugOn") + '</span>');
    cfgTags.push('<span class="kta-mem-tag-dim">' + _t("runtime.tag.perf", { preset: _escapeHtml(ac.perfPreset) }) + '</span>');
    if (!ac.scaledMarkers)         cfgTags.push('<span class="kta-mem-tag-dim">' + _t("runtime.tag.scaledOff") + '</span>');
    if (!ac.showRoadIntersections) cfgTags.push('<span class="kta-mem-tag-dim">' + _t("runtime.tag.intersectionsOff") + '</span>');
    if (ac.multiLevel)             cfgTags.push('<span class="kta-mem-tag">' + _t("runtime.tag.mlvlActive", { level: (ac.activeLevel != null ? ac.activeLevel : "?") }) + '</span>');
    html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("runtime.config") + '</span><span class="kta-mem-val kta-mem-flags">' + cfgTags.join(" ") + '</span></div>';

    html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("runtime.modules") + '</span>';
    html += '<span class="kta-mem-val"><strong>' + r.modulesLoaded.length + '</strong> / ' + (r.modulesLoaded.length + r.modulesMissing.length) +
            ' <span class="kta-mem-dim">(' + r.modulesLoaded.slice(0, 8).join(", ") + (r.modulesLoaded.length > 8 ? ", …" : "") + ')</span></span></div>';
    if (r.modulesMissing.length > 0) {
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("runtime.missing") + '</span><span class="kta-mem-val kta-mem-warn">⚠️ ' + _escapeHtml(r.modulesMissing.join(", ")) + '</span></div>';
    }
    html += '</div>';

    // === Section LOCALSTORAGE ===
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">' + _t("ls.titre") + ' <span class="kta-mem-total">' +
              _t("ls.count", { count: ls.keys.length, size: _formatBytes(ls.totalBytes) }) +
            '</span></div>';
    if (ls.error) {
      html += '<div class="kta-mem-warn">⚠️ ' + _escapeHtml(ls.error) + '</div>';
    } else if (ls.keys.length === 0) {
      html += '<div class="kta-mem-dim">' + _t("ls.empty") + '</div>';
    } else {
      html += '<table class="kta-mem-table">';
      html += '<thead><tr><th>' + _t("ls.col.key") + '</th><th class="kta-mem-num">' + _t("ls.col.size") + '</th></tr></thead><tbody>';
      ls.keys.forEach(function(k) {
        const pct = ls.totalBytes > 0 ? (k.sizeBytes / ls.totalBytes * 100) : 0;
        html += '<tr>';
        html += '<td><code>' + _escapeHtml(k.key) + '</code>';
        html += '<div class="kta-mem-bar-wrap"><div class="kta-mem-bar-fill" style="width:' + pct.toFixed(1) + '%"></div></div>';
        html += '</td>';
        html += '<td class="kta-mem-num">' + _escapeHtml(k.sizePretty) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    // === Section INDEXEDDB ===
    html += '<div class="kta-mem-section">';
    const totalIdbEntries = idb.databases.reduce(function(acc, d) { return acc + (d.totalEntries || 0); }, 0);
    html += '<div class="kta-mem-section-titre">' + _t("idb.titre") + ' <span class="kta-mem-total">' +
              _t("idb.count", { dbs: idb.databases.length, entries: totalIdbEntries }) +
            '</span></div>';
    if (idb.scanError) {
      html += '<div class="kta-mem-dim">ℹ️ ' + _escapeHtml(idb.scanError) + '</div>';
    }
    if (idb.databases.length === 0) {
      html += '<div class="kta-mem-dim">' + _t("idb.empty") + '</div>';
    }
    idb.databases.forEach(function(db) {
      html += '<div class="kta-mem-db">';
      html += '<div class="kta-mem-db-titre"><code>' + _escapeHtml(db.name) + '</code>';
      if (db.version != null) html += ' <span class="kta-mem-dim">v' + db.version + '</span>';
      html += '</div>';
      if (db.error) {
        html += '<div class="kta-mem-warn">⚠️ ' + _escapeHtml(db.error) + '</div>';
      } else {
        db.stores.forEach(function(s) {
          html += '<div class="kta-mem-store">';
          html += '<span class="kta-mem-store-name">└─ ' + _escapeHtml(s.name) + '</span>';
          if (s.missing) {
            html += '<span class="kta-mem-dim">' + _t("idb.store.missing") + '</span>';
          } else if (s.count < 0) {
            html += '<span class="kta-mem-warn">⚠️ ' + _escapeHtml(s.error || _t("idb.store.error")) + '</span>';
          } else {
            html += '<span class="kta-mem-num">' + _t("idb.store.entries", { count: s.count }) + '</span>';
          }
          html += '</div>';
        });
      }
      html += '</div>';
    });
    html += '</div>';

    // === Section CACHE PWA ===
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">' + _t("cache.titre");
    if (cp.activeCache) {
      html += ' <span class="kta-mem-total">' + _t("cache.assets", { count: cp.activeCache.assetCount }) + '</span>';
    }
    html += '</div>';
    if (cp.error) {
      html += '<div class="kta-mem-warn">⚠️ ' + _escapeHtml(cp.error) + '</div>';
    } else if (cp.cacheNames.length === 0) {
      html += '<div class="kta-mem-dim">' + _t("cache.empty") + '</div>';
    } else {
      cp.cacheNames.forEach(function(n) {
        const isActive = cp.activeCache && cp.activeCache.name === n;
        html += '<div class="kta-mem-cache-row' + (isActive ? ' kta-mem-cache-active' : '') + '">';
        html += isActive ? '<span class="kta-mem-cache-star">★</span> ' : '<span class="kta-mem-cache-star kta-mem-dim">○</span> ';
        html += '<code>' + _escapeHtml(n) + '</code>';
        if (isActive) html += ' <span class="kta-mem-tag-dim">' + _t("cache.active") + '</span>';
        html += '</div>';
      });
      if (cp.activeCache && cp.activeCache.assetSample.length > 0) {
        html += '<div class="kta-mem-cache-sample">';
        html += '<div class="kta-mem-sample-titre">' + _t("cache.sample.titre") + '</div>';
        cp.activeCache.assetSample.forEach(function(u) {
          html += '<div class="kta-mem-asset">' + _escapeHtml(u) + '</div>';
        });
        if (cp.activeCache.assetCount > 12) {
          html += '<div class="kta-mem-dim">' + _t("cache.sample.more", { count: (cp.activeCache.assetCount - 12) }) + '</div>';
        }
        html += '</div>';
      }
    }
    html += '</div>';

    // === Section STORAGE ESTIMATE ===
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">' + _t("storage.titre") + '</div>';
    if (se.error) {
      html += '<div class="kta-mem-warn">⚠️ ' + _escapeHtml(se.error) + '</div>';
    } else {
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("storage.usage") + '</span><span class="kta-mem-val kta-mem-num"><strong>' + _formatBytes(se.usage) + '</strong></span></div>';
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("storage.quota") + '</span><span class="kta-mem-val kta-mem-num">' + _formatBytes(se.quota) + '</span></div>';
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' + _t("storage.used") + '</span><span class="kta-mem-val">';
      html += '<div class="kta-mem-quota-bar"><div class="kta-mem-quota-fill" style="width:' + (se.usagePct || 0).toFixed(2) + '%"></div></div>';
      html += '<span class="kta-mem-num">' + (se.usagePct != null ? se.usagePct.toFixed(2) + " %" : "—") + '</span>';
      html += '</span></div>';
      html += '<div class="kta-mem-dim" style="margin-top:6px;">' + _t("storage.hint") + '</div>';
    }
    html += '</div>';

    // === Section 🧹 DONNÉES ORPHELINES (v1.79.3) ===
    const orph = rep.orphelins || { plans: [], totalBytes: 0, error: null };
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">' + _t("orph.titre");
    if (orph.plans.length > 0) html += ' <span class="kta-mem-total">' + orph.plans.length + ' · ' + _formatBytes(orph.totalBytes) + '</span>';
    html += '</div>';
    if (orph.error) {
      html += '<div class="kta-mem-warn">⚠️ ' + _escapeHtml(orph.error) + '</div>';
    } else if (orph.plans.length === 0) {
      html += '<div class="kta-mem-dim">' + _t("orph.aucun") + '</div>';
    } else {
      html += '<div class="kta-mem-dim" style="margin-bottom:6px;">' + _t("orph.intro") + '</div>';
      orph.plans.forEach(function(e) {
        const parts = [];
        if (e.sessionBytes) parts.push(_t("orph.session", { taille: _formatBytes(e.sessionBytes) }));
        if (e.calib)        parts.push(_t("orph.calib"));
        if (e.blobBytes)    parts.push(_t("orph.archive", { taille: _formatBytes(e.blobBytes) }));
        if (e.handle)       parts.push(_t("orph.handle"));
        if (e.photos)       parts.push(_t("orph.photos", { n: e.photos, taille: _formatBytes(e.photoBytes) }));
        if (e.backups)      parts.push(_t("orph.backups", { n: e.backups }));
        html += '<div class="kta-mem-row"><span class="kta-mem-lbl">' +
                _escapeHtml(e.nom || e.id) +
                (e.nom ? ' <span class="kta-mem-dim">(' + _escapeHtml(e.id) + ')</span>' : '') +
                '</span><span class="kta-mem-val">' + _escapeHtml(parts.join(" · ") || "—") + '</span></div>';
      });
      html += '<div style="margin-top:8px;">' +
              '<button type="button" class="kta-btn kta-btn-danger kta-btn-small" id="kta-mem-orph-clean">🧹 ' + _t("orph.btnClean") + '</button>' +
              '</div>';
      html += '<div class="kta-mem-dim" style="margin-top:6px;">' + _t("orph.note") + '</div>';
    }
    html += '</div>';

    // === Section CRASH REPORTS (v1.20.0) ===
    const cr = rep.crashReports || { reports: [], error: null };
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">' + _t("crash.titre");
    if (cr.reports.length > 0) {
      html += ' <span class="kta-mem-total">' + cr.reports.length + ' / 5</span>';
    }
    html += '</div>';
    if (cr.error) {
      html += '<div class="kta-mem-warn">⚠️ ' + _escapeHtml(cr.error) + '</div>';
    } else if (cr.reports.length === 0) {
      html += '<div class="kta-mem-dim">' + _t("crash.empty") + '</div>';
    } else {
      cr.reports.forEach(function(entry) {
        const planTxt = entry.killInfo && entry.killInfo.planId ? entry.killInfo.planId : _t("crash.noPlan");
        const dateTxt = new Date(entry.timestamp).toLocaleString(_locale());
        const ageSec = entry.killInfo && entry.killInfo.ageSec;
        const logsCount = (entry.logs || []).length;
        html += '<div class="kta-mem-crash-row" data-crash-id="' + entry.id + '">';
        html += '<div class="kta-mem-crash-head">';
        html += '<span class="kta-mem-crash-icon">💥</span>';
        html += '<span class="kta-mem-crash-date">' + _escapeHtml(dateTxt) + '</span>';
        if (entry.appVersion) html += ' <span class="kta-mem-tag-dim">' + _escapeHtml(entry.appVersion) + '</span>';
        html += '</div>';
        html += '<div class="kta-mem-crash-meta">';
        html += '🗂️ ' + _escapeHtml(planTxt);
        if (ageSec != null) html += ' &middot; ' + _t("crash.meta.age", { sec: ageSec });
        html += ' &middot; ' + _t("crash.meta.logs", { count: logsCount });
        if (entry.sessionSnapMeta) html += ' &middot; ' + _t("crash.meta.snap");
        html += '</div>';
        html += '<div class="kta-mem-crash-actions">';
        html += '<button type="button" class="kta-btn kta-btn-ghost kta-mem-crash-view" data-crash-id="' + entry.id + '">' + _t("crash.btn.view") + '</button>';
        html += '<button type="button" class="kta-btn kta-btn-ghost kta-mem-crash-copy" data-crash-id="' + entry.id + '">' + _t("crash.btn.copy") + '</button>';
        html += '<button type="button" class="kta-btn kta-btn-ghost kta-mem-crash-del"  data-crash-id="' + entry.id + '" title="' + _t("crash.btn.del") + '">🗑️</button>';
        html += '</div>';
        html += '</div>';
      });
      html += '<div style="margin-top:10px; text-align:right;">';
      html += '<button type="button" class="kta-btn kta-btn-ghost" id="kta-mem-crash-clear-all" style="font-size:11px;">' + _t("crash.btn.clearAll") + '</button>';
      html += '</div>';
    }
    html += '</div>';

    return html;
  }

  // ───────── HANDLERS CRASH REPORTS (v1.20.0) ─────────
  // 🆕 v1.44.0 — Refacto event delegation via _lc.delegate (UN listener par
  // type d'event au lieu de N listeners ré-attachés à chaque rafraîchissement).
  // Avant : à chaque _refreshAndRender(), forEach + addEventListener × ~30
  // boutons = accumulation transitoire de closures + zombies sur DOM ancien.
  // Maintenant : 1 listener click délégué sur #kta-mem-corps (jamais remplacé,
  // seul son innerHTML l'est) qui dispatch via e.target.matches.
  let _crashHandlersBound = false;
  function _bindCrashHandlers() {
    if (_crashHandlersBound || !_lc) return;
    const corps = document.getElementById("kta-mem-corps");
    if (!corps) return;
    _crashHandlersBound = true;
    // 🧹 v1.79.3 — nettoyage des données orphelines (ktaConfirm, jamais
    // silencieux : une session orpheline redevient utile si l'user
    // réimporte le ZIP — c'est LUI qui tranche).
    _lc.delegate(corps, "click", "#kta-mem-orph-clean", async function() {
      const btn = this;
      const rep = _lastReport;
      const plans = (rep && rep.orphelins && rep.orphelins.plans) || [];
      if (!plans.length) return;
      const msg = _t("orph.confirm", { n: plans.length, taille: _formatBytes(rep.orphelins.totalBytes) });
      const ok = (typeof window.ktaConfirm === "function")
        ? await window.ktaConfirm(msg, { okLabel: _t("orph.btnClean") })
        : confirm(msg);
      if (!ok) return;
      btn.disabled = true; btn.textContent = "⏳";
      for (const e of plans) {
        try { await _purgerOrphelin(e.id); } catch(err) { console.warn("[MemInspector] purge orphelin " + e.id + " :", err); }
      }
      _refreshAndRender();
    });
    _lc.delegate(corps, "click", ".kta-mem-crash-view", function() {
      const id = parseInt(this.dataset.crashId, 10);
      _afficherCrashDetail(id);
    });
    _lc.delegate(corps, "click", ".kta-mem-crash-copy", function() {
      const id = parseInt(this.dataset.crashId, 10);
      _copierCrashReport(id, this);
    });
    _lc.delegate(corps, "click", ".kta-mem-crash-del", function() {
      const id = parseInt(this.dataset.crashId, 10);
      if (!confirm(_t("crash.confirm.del"))) return;
      if (window.CrashReports && typeof window.CrashReports.remove === "function") {
        window.CrashReports.remove(id).then(_refreshAndRender);
      }
    });
    _lc.delegate(corps, "click", "#kta-mem-crash-clear-all", function() {
      if (!confirm(_t("crash.confirm.clearAll"))) return;
      if (window.CrashReports && typeof window.CrashReports.clearAll === "function") {
        window.CrashReports.clearAll().then(_refreshAndRender);
      }
    });
    // Reset le flag au close (au cas où la modale est ré-ouverte)
    _lc.onClose(function() { _crashHandlersBound = false; });
  }

  function _afficherCrashDetail(id) {
    if (!_lastReport || !_lastReport.crashReports) return;
    const entry = (_lastReport.crashReports.reports || []).find(function(e) { return e.id === id; });
    if (!entry) return;
    if (!window.CrashReports || typeof window.CrashReports.formatReportText !== "function") return;
    const txt = window.CrashReports.formatReportText(entry);
    // Modale simple : un <pre> avec le rapport texte intégral
    const overlay = document.createElement("div");
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.zIndex = "100100"; // au-dessus de la modale MemInspector
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:760px; height:auto; max-height:88vh;">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _t("crash.detail.titre", { id: id }) + '</span>' +
          '<button type="button" class="kta-panneau-close kta-mem-crash-detail-close" aria-label="' + _t("close") + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<pre class="kta-mem-crash-detail-pre">' + _escapeHtml(txt) + '</pre>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    // 🆕 v1.44.0 — Sous-lifecycle dédié pour cette sous-modale (au-dessus
    // de la modale MemInspector principale). Cleanup auto au close().
    const subLc = window.ModalLifecycle.attach(overlay, { label: "MemCrashDetail" });
    const close = function() {
      subLc.close();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    subLc.on(overlay.querySelector(".kta-mem-crash-detail-close"), "click", close);
    subLc.bindBackdropClick(close);
    subLc.bindEscape(close);
  }

  function _copierCrashReport(id, btn) {
    if (!_lastReport || !_lastReport.crashReports) return;
    const entry = (_lastReport.crashReports.reports || []).find(function(e) { return e.id === id; });
    if (!entry) return;
    if (!window.CrashReports || typeof window.CrashReports.formatReportText !== "function") return;
    const txt = window.CrashReports.formatReportText(entry);
    _copyToClipboard(txt).then(function() {
      if (!btn || !_lc || !_lc.alive) return;
      const orig = btn.textContent;
      btn.textContent = _t("btn.copied");
      // 🆕 v1.44.0 — setTimeout tracked : cleared si modale fermée avant 1.8s.
      _lc.setTimeout(function() {
        if (btn.isConnected) btn.textContent = orig;
      }, 1800);
    }).catch(function(e) {
      alert(_t("copy.fail", { detail: (e.message || e) }));
    });
  }

  let _lastReport = null;

  async function _refreshAndRender() {
    const corps = document.getElementById("kta-mem-corps");
    if (!corps) return;
    corps.innerHTML = '<div class="kta-mem-loading">' + _t("loading") + '</div>';
    try {
      // 🆕 v1.44.0 — Pattern C via _lc.guard : throw ModalClosedError si la
      // modale a été fermée pendant l'await collecter() (200-800 ms typiques).
      // On catch silencieusement plus bas.
      const report = await (_lc ? _lc.guard(collecter()) : collecter());
      _lastReport = report;
      corps.innerHTML = _renderReport(_lastReport);
      // 🆕 v1.20.0 — Bind handlers de la section Crash Reports (boutons
      // dynamiques par crash). Re-bindé à chaque render (rafraîchir, suppr…).
      _bindCrashHandlers();
    } catch(e) {
      // 🆕 v1.44.0 — Modale fermée pendant l'await → silently return.
      if (e && e.name === "ModalClosedError") return;
      if (!corps.isConnected) return;
      corps.innerHTML = '<div class="kta-mem-warn">' + _t("collect.error", { detail: _escapeHtml(e.message || e) }) + '</div>';
    }
  }

  async function ouvrir() {
    fermer();
    const overlay = document.createElement("div");
    overlay.id        = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML = _buildModalHtml();
    document.documentElement.appendChild(overlay);

    // 🆕 v1.44.0 — ModalLifecycle attaché : remplace les addEventListener
    // manuels, le _onEscape custom, et le setTimeout du bouton 📋 Copier.
    // Tous les listeners + timers seront cleared automatiquement au close().
    _lc = window.ModalLifecycle.attach(overlay, {
      label: "MemInspector",
      onClose: function() {
        // 🆕 v1.43.26 — Libère le snapshot du dernier rapport (peut contenir
        // crashReports avec stacks volumineuses + photos byteCount). Sinon
        // il survit jusqu'à la prochaine ouverture.
        _lastReport = null;
      }
    });

    _lc.on(document.getElementById("kta-mem-close"), "click", fermer);
    _lc.bindBackdropClick(fermer);
    _lc.bindEscape(fermer);

    _lc.on(document.getElementById("kta-mem-refresh"), "click", _refreshAndRender);
    _lc.on(document.getElementById("kta-mem-copy"), "click", function() {
      if (!_lastReport) return;
      const txt = getReportText(_lastReport);
      _copyToClipboard(txt).then(function() {
        const btn = document.getElementById("kta-mem-copy");
        if (!btn || !_lc || !_lc.alive) return;
        const orig = btn.textContent;
        btn.textContent = _t("btn.copied");
        // 🆕 v1.44.0 — setTimeout tracked : si user ferme la modale dans les
        // 1.8s, le timer est cleared (plus de write dans bouton détaché).
        _lc.setTimeout(function() {
          if (btn.isConnected) btn.textContent = orig;
        }, 1800);
      }).catch(function(e) {
        alert(_t("copy.fail", { detail: (e.message || e) }));
      });
    });

    await _refreshAndRender();
  }

  function fermer() {
    if (_lc) { _lc.close(); _lc = null; }
    const ex = document.getElementById(MODAL_ID);
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }

  function _copyToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text);
    }
    // Fallback textarea + execCommand (anciens browsers + contextes non-sécurisés)
    return new Promise(function(resolve, reject) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve(); else reject(new Error("execCommand copy failed"));
      } catch(e) { reject(e); }
    });
  }

  // ========== EXPORT API ==========
  window.MemInspector = {
    ouvrir:        ouvrir,
    fermer:        fermer,
    collecter:     collecter,
    formatBytes:   _formatBytes,
    getReportText: getReportText
  };
})();
