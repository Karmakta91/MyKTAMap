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

  const MODAL_ID = "kta-mem-inspector-modal";

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
    { name: "myktamap_crashes", stores: ["crashes"] }
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
      result.scanError = "indexedDB.databases() non supporté ou bloqué : " + String(e.message || e);
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
        result.error = "Cache API non supportée par ce navigateur";
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
        result.error = "navigator.storage.estimate() non supportée";
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
    "CompassWidget", "TrackerReplay", "Pathfinder", "SearchPoints",
    "MyKTAMapPdfExport", "RefonteInterface", "MemInspector",
    // 🆕 v1.20.0
    "CrashReports", "StatsGlobales",
    // 🆕 v1.21.0
    "Tutorial", "Freehand"
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
          name:       pc.plan.name || "(sans nom)",
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
        showRoadIntersections:  ac.showRoadIntersections !== false,
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
        result.error = "Module CrashReports non chargé";
        return result;
      }
      result.reports = await window.CrashReports.listAll();
    } catch(e) {
      result.error = String(e.message || e);
    }
    return result;
  }

  // ========== COLLECTE GLOBALE ==========
  async function collecter() {
    const ts = new Date().toISOString();
    const runtime = _collectRuntime();
    const localS = _collectLocalStorage();
    const [idb, cachePwa, storageEst, crashes] = await Promise.all([
      _collectIndexedDB(),
      _collectCachePWA(),
      _collectStorageEstimate(),
      _collectCrashReports()
    ]);
    return {
      timestamp:       ts,
      runtime:         runtime,
      localStorage:    localS,
      indexedDB:       idb,
      cachePWA:        cachePwa,
      storageEstimate: storageEst,
      crashReports:    crashes
    };
  }

  // ========== RAPPORT TEXTE (pour bouton 📋 Copier) ==========
  function getReportText(rep) {
    if (!rep) return "";
    const lines = [];
    lines.push("=========================================");
    lines.push("MyKTAMap — Rapport État Mémoire");
    lines.push("=========================================");
    lines.push("📅 Timestamp : " + rep.timestamp);
    lines.push("📦 Version app : " + rep.runtime.appVersion);
    lines.push("");

    // Runtime
    lines.push("🧠 RUNTIME");
    lines.push("─────────────────────────────────────────");
    if (rep.runtime.planLoaded) {
      const p = rep.runtime.planLoaded;
      lines.push("Plan chargé : " + p.name + " " + p.version + " (" + (p.imageW || "?") + "×" + (p.imageH || "?") + ")");
      lines.push("  Auteur : " + p.author);
      lines.push("  M-LVL : " + (p.multiLevel ? "ON" : "OFF") + " | V2 tuilé : " + (p.tiledV2 ? "ON" : "OFF"));
      lines.push("  Calques image : " + p.imageLayersCount + " | Calques data : " + p.dataLayersCount);
      lines.push("  Légende custom plan : " + (p.hasCustomLegend ? "OUI" : "non"));
    } else {
      lines.push("Plan chargé : (aucun — home)");
    }
    if (rep.runtime.sessionStats) {
      const s = rep.runtime.sessionStats;
      lines.push("Session active : " + s.editorPoints + " points, " + s.roads + " tracés, " + s.zones + " zones, " + s.structures + " structures");
      lines.push("  Mesure : " + s.measurePoints + " pts | Tracker : " + (s.trackingActif ? "ON" : "OFF") + " | Itinéraire : " + (s.itineraireActif ? "ON" : "OFF"));
    }
    const ac = rep.runtime.appConfig;
    lines.push("APP_CONFIG : debug=" + ac.debugMode + ", perfPreset=" + ac.perfPreset + ", scaledMarkers=" + ac.scaledMarkers + ", intersections=" + ac.showRoadIntersections + ", M-LVL=" + ac.multiLevel);
    lines.push("Modules chargés (" + rep.runtime.modulesLoaded.length + "/" + (rep.runtime.modulesLoaded.length + rep.runtime.modulesMissing.length) + ") : " + rep.runtime.modulesLoaded.join(", "));
    if (rep.runtime.modulesMissing.length > 0) {
      lines.push("Modules MANQUANTS : " + rep.runtime.modulesMissing.join(", "));
    }
    lines.push("");

    // localStorage
    lines.push("🗂️  LOCALSTORAGE");
    lines.push("─────────────────────────────────────────");
    if (rep.localStorage.error) {
      lines.push("⚠️ Erreur : " + rep.localStorage.error);
    } else {
      lines.push("Total : " + rep.localStorage.keys.length + " clés MyKTAMap, " + _formatBytes(rep.localStorage.totalBytes));
      rep.localStorage.keys.forEach(function(k) {
        lines.push("  " + k.sizePretty.padStart(10, " ") + "  " + k.key);
      });
    }
    lines.push("");

    // IndexedDB
    lines.push("💾 INDEXEDDB");
    lines.push("─────────────────────────────────────────");
    if (rep.indexedDB.scanError) {
      lines.push("ℹ️ Scan natif : " + rep.indexedDB.scanError + " (fallback bases connues uniquement)");
    }
    if (rep.indexedDB.databases.length === 0) {
      lines.push("(aucune base MyKTAMap détectée)");
    }
    rep.indexedDB.databases.forEach(function(db) {
      lines.push("• " + db.name + (db.version != null ? " (v" + db.version + ")" : "") + (db.error ? "  ⚠️ " + db.error : ""));
      db.stores.forEach(function(s) {
        if (s.missing) {
          lines.push("    └─ " + s.name + " : (store absent)");
        } else if (s.count < 0) {
          lines.push("    └─ " + s.name + " : ⚠️ " + (s.error || "erreur count"));
        } else {
          lines.push("    └─ " + s.name + " : " + s.count + " entrée" + (s.count > 1 ? "s" : ""));
        }
      });
    });
    lines.push("");

    // Cache PWA
    lines.push("📦 CACHE PWA (SERVICE WORKER)");
    lines.push("─────────────────────────────────────────");
    if (rep.cachePWA.error) {
      lines.push("⚠️ " + rep.cachePWA.error);
    } else {
      lines.push("Caches existants : " + rep.cachePWA.cacheNames.length);
      rep.cachePWA.cacheNames.forEach(function(n) {
        const mark = (rep.cachePWA.activeCache && rep.cachePWA.activeCache.name === n) ? "★ " : "  ";
        lines.push(mark + n);
      });
      if (rep.cachePWA.activeCache) {
        lines.push("");
        lines.push("Cache actif : " + rep.cachePWA.activeCache.name + " — " + rep.cachePWA.activeCache.assetCount + " assets");
        if (rep.cachePWA.activeCache.assetSample.length > 0) {
          lines.push("Échantillon (12 premiers) :");
          rep.cachePWA.activeCache.assetSample.forEach(function(u) { lines.push("  " + u); });
        }
      }
    }
    lines.push("");

    // Storage estimate
    lines.push("📊 STORAGE ESTIMATE (NAVIGATEUR)");
    lines.push("─────────────────────────────────────────");
    if (rep.storageEstimate.error) {
      lines.push("⚠️ " + rep.storageEstimate.error);
    } else {
      lines.push("Usage : " + _formatBytes(rep.storageEstimate.usage));
      lines.push("Quota : " + _formatBytes(rep.storageEstimate.quota));
      lines.push("Utilisé : " + (rep.storageEstimate.usagePct != null ? rep.storageEstimate.usagePct.toFixed(2) + " %" : "—"));
    }
    lines.push("");

    // 🆕 v1.20.0 — Crash Reports
    const cr = rep.crashReports || { reports: [], error: null };
    lines.push("📋 DERNIERS CRASHS DÉTECTÉS");
    lines.push("─────────────────────────────────────────");
    if (cr.error) {
      lines.push("⚠️ " + cr.error);
    } else if (cr.reports.length === 0) {
      lines.push("(aucun crash détecté)");
    } else {
      cr.reports.forEach(function(entry) {
        const dateTxt = new Date(entry.timestamp).toISOString();
        const planTxt = entry.killInfo && entry.killInfo.planId ? entry.killInfo.planId : "(aucun plan)";
        const ageSec  = entry.killInfo && entry.killInfo.ageSec != null ? entry.killInfo.ageSec + "s" : "?";
        const logsN   = (entry.logs || []).length;
        lines.push("• #" + entry.id + "  " + dateTxt +
                   "  v" + (entry.appVersion || "?") +
                   "  plan=" + planTxt +
                   "  age=" + ageSec +
                   "  logs=" + logsN);
      });
      lines.push("(détails complets de chaque crash via 📋 Voir détails dans la modale Inspector)");
    }
    lines.push("");
    lines.push("=========================================");

    return lines.join("\n");
  }

  // ========== UI : MODALE ==========
  function _buildModalHtml() {
    return ''
      + '<div class="kta-readme-modal-boite kta-mem-inspector-boite">'
      +   '<div class="kta-readme-modal-header">'
      +     '<span class="kta-readme-modal-titre">📊 État mémoire — Inspecteur</span>'
      +     '<button type="button" class="kta-panneau-close" id="kta-mem-close" aria-label="Fermer">✕</button>'
      +   '</div>'
      +   '<div class="kta-readme-modal-corps" id="kta-mem-corps">'
      +     '<div class="kta-mem-loading">⏳ Collecte en cours…</div>'
      +   '</div>'
      +   '<div class="kta-readme-modal-footer kta-mem-footer">'
      +     '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-mem-refresh">🔄 Rafraîchir</button>'
      +     '<button type="button" class="kta-btn kta-btn-primary" id="kta-mem-copy">📋 Copier le rapport</button>'
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
    html += '📅 Capturé le ' + _escapeHtml(new Date(rep.timestamp).toLocaleString("fr-FR")) +
            ' &middot; 📦 ' + _escapeHtml(r.appVersion);
    html += '</div>';

    // === Section RUNTIME ===
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">🧠 Runtime</div>';
    if (r.planLoaded) {
      const p = r.planLoaded;
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">Plan chargé</span>';
      html += '<span class="kta-mem-val">' + _escapeHtml(p.name) + ' ' + _escapeHtml(p.version) +
              ' <span class="kta-mem-dim">(' + (p.imageW || "?") + '×' + (p.imageH || "?") + ' px)</span></span></div>';
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">Auteur</span><span class="kta-mem-val">' + _escapeHtml(p.author) + '</span></div>';
      const flags = [];
      if (p.multiLevel) flags.push('<span class="kta-mem-tag">🏗️ M-LVL</span>');
      if (p.tiledV2)    flags.push('<span class="kta-mem-tag">🧱 V2 tuilé</span>');
      if (p.hasCustomLegend) flags.push('<span class="kta-mem-tag">🏷️ Légende plan</span>');
      flags.push('<span class="kta-mem-tag-dim">🗂️ ' + p.imageLayersCount + ' calques image</span>');
      flags.push('<span class="kta-mem-tag-dim">📊 ' + p.dataLayersCount  + ' calques data</span>');
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">Flags</span><span class="kta-mem-val kta-mem-flags">' + flags.join(" ") + '</span></div>';
    } else {
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">Plan chargé</span><span class="kta-mem-val kta-mem-dim">(aucun — vous êtes sur la home)</span></div>';
    }

    if (r.sessionStats) {
      const s = r.sessionStats;
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">Session</span>';
      html += '<span class="kta-mem-val">' +
                '📍 ' + s.editorPoints + ' · 🛣️ ' + s.roads + ' · ⬛ ' + s.zones + ' · 🏛️ ' + s.structures +
                ' <span class="kta-mem-dim">(annotations actives en RAM)</span></span></div>';
      const liveTags = [];
      if (s.measurePoints > 0) liveTags.push('<span class="kta-mem-tag">📐 Mesure ' + s.measurePoints + ' pts</span>');
      if (s.trackingActif)     liveTags.push('<span class="kta-mem-tag kta-mem-tag-on">🧭 Tracker ON</span>');
      else                     liveTags.push('<span class="kta-mem-tag-dim">🧭 Tracker OFF</span>');
      if (s.itineraireActif)   liveTags.push('<span class="kta-mem-tag kta-mem-tag-on">🗺️ Iti actif</span>');
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">État live</span><span class="kta-mem-val kta-mem-flags">' + liveTags.join(" ") + '</span></div>';
    }

    const ac = r.appConfig;
    const cfgTags = [];
    if (ac.debugMode) cfgTags.push('<span class="kta-mem-tag kta-mem-tag-warn">🐛 debug ON</span>');
    cfgTags.push('<span class="kta-mem-tag-dim">⚡ perf=' + _escapeHtml(ac.perfPreset) + '</span>');
    if (!ac.scaledMarkers)         cfgTags.push('<span class="kta-mem-tag-dim">scaledMarkers OFF</span>');
    if (!ac.showRoadIntersections) cfgTags.push('<span class="kta-mem-tag-dim">intersections OFF</span>');
    if (ac.multiLevel)             cfgTags.push('<span class="kta-mem-tag">M-LVL niveau actif : ' + (ac.activeLevel != null ? ac.activeLevel : "?") + '</span>');
    html += '<div class="kta-mem-row"><span class="kta-mem-lbl">APP_CONFIG</span><span class="kta-mem-val kta-mem-flags">' + cfgTags.join(" ") + '</span></div>';

    html += '<div class="kta-mem-row"><span class="kta-mem-lbl">Modules chargés</span>';
    html += '<span class="kta-mem-val"><strong>' + r.modulesLoaded.length + '</strong> / ' + (r.modulesLoaded.length + r.modulesMissing.length) +
            ' <span class="kta-mem-dim">(' + r.modulesLoaded.slice(0, 8).join(", ") + (r.modulesLoaded.length > 8 ? ", …" : "") + ')</span></span></div>';
    if (r.modulesMissing.length > 0) {
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">Manquants</span><span class="kta-mem-val kta-mem-warn">⚠️ ' + _escapeHtml(r.modulesMissing.join(", ")) + '</span></div>';
    }
    html += '</div>';

    // === Section LOCALSTORAGE ===
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">🗂️ localStorage <span class="kta-mem-total">' +
              ls.keys.length + ' clé' + (ls.keys.length > 1 ? "s" : "") + ' · ' + _formatBytes(ls.totalBytes) +
            '</span></div>';
    if (ls.error) {
      html += '<div class="kta-mem-warn">⚠️ ' + _escapeHtml(ls.error) + '</div>';
    } else if (ls.keys.length === 0) {
      html += '<div class="kta-mem-dim">(aucune clé MyKTAMap trouvée — première utilisation ou reset récent)</div>';
    } else {
      html += '<table class="kta-mem-table">';
      html += '<thead><tr><th>Clé</th><th class="kta-mem-num">Taille</th></tr></thead><tbody>';
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
    html += '<div class="kta-mem-section-titre">💾 IndexedDB <span class="kta-mem-total">' +
              idb.databases.length + ' base' + (idb.databases.length > 1 ? "s" : "") + ' · ' +
              totalIdbEntries + ' entrée' + (totalIdbEntries > 1 ? "s" : "") +
            '</span></div>';
    if (idb.scanError) {
      html += '<div class="kta-mem-dim">ℹ️ ' + _escapeHtml(idb.scanError) + '</div>';
    }
    if (idb.databases.length === 0) {
      html += '<div class="kta-mem-dim">(aucune base MyKTAMap détectée — fresh install)</div>';
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
            html += '<span class="kta-mem-dim">(store absent)</span>';
          } else if (s.count < 0) {
            html += '<span class="kta-mem-warn">⚠️ ' + _escapeHtml(s.error || "erreur") + '</span>';
          } else {
            html += '<span class="kta-mem-num">' + s.count + ' entrée' + (s.count > 1 ? "s" : "") + '</span>';
          }
          html += '</div>';
        });
      }
      html += '</div>';
    });
    html += '</div>';

    // === Section CACHE PWA ===
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">📦 Cache PWA (Service Worker)';
    if (cp.activeCache) {
      html += ' <span class="kta-mem-total">' + cp.activeCache.assetCount + ' assets</span>';
    }
    html += '</div>';
    if (cp.error) {
      html += '<div class="kta-mem-warn">⚠️ ' + _escapeHtml(cp.error) + '</div>';
    } else if (cp.cacheNames.length === 0) {
      html += '<div class="kta-mem-dim">(aucun cache PWA — SW pas encore installé ou reset récent)</div>';
    } else {
      cp.cacheNames.forEach(function(n) {
        const isActive = cp.activeCache && cp.activeCache.name === n;
        html += '<div class="kta-mem-cache-row' + (isActive ? ' kta-mem-cache-active' : '') + '">';
        html += isActive ? '<span class="kta-mem-cache-star">★</span> ' : '<span class="kta-mem-cache-star kta-mem-dim">○</span> ';
        html += '<code>' + _escapeHtml(n) + '</code>';
        if (isActive) html += ' <span class="kta-mem-tag-dim">(actif)</span>';
        html += '</div>';
      });
      if (cp.activeCache && cp.activeCache.assetSample.length > 0) {
        html += '<div class="kta-mem-cache-sample">';
        html += '<div class="kta-mem-sample-titre">Échantillon (12 premiers assets) :</div>';
        cp.activeCache.assetSample.forEach(function(u) {
          html += '<div class="kta-mem-asset">' + _escapeHtml(u) + '</div>';
        });
        if (cp.activeCache.assetCount > 12) {
          html += '<div class="kta-mem-dim">…et ' + (cp.activeCache.assetCount - 12) + ' autres</div>';
        }
        html += '</div>';
      }
    }
    html += '</div>';

    // === Section STORAGE ESTIMATE ===
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">📊 Storage estimate (navigateur)</div>';
    if (se.error) {
      html += '<div class="kta-mem-warn">⚠️ ' + _escapeHtml(se.error) + '</div>';
    } else {
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">Usage</span><span class="kta-mem-val kta-mem-num"><strong>' + _formatBytes(se.usage) + '</strong></span></div>';
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">Quota</span><span class="kta-mem-val kta-mem-num">' + _formatBytes(se.quota) + '</span></div>';
      html += '<div class="kta-mem-row"><span class="kta-mem-lbl">Utilisé</span><span class="kta-mem-val">';
      html += '<div class="kta-mem-quota-bar"><div class="kta-mem-quota-fill" style="width:' + (se.usagePct || 0).toFixed(2) + '%"></div></div>';
      html += '<span class="kta-mem-num">' + (se.usagePct != null ? se.usagePct.toFixed(2) + " %" : "—") + '</span>';
      html += '</span></div>';
      html += '<div class="kta-mem-dim" style="margin-top:6px;">Quota défini par le navigateur, partagé entre localStorage + IndexedDB + Cache PWA + autres.</div>';
    }
    html += '</div>';

    // === Section CRASH REPORTS (v1.20.0) ===
    const cr = rep.crashReports || { reports: [], error: null };
    html += '<div class="kta-mem-section">';
    html += '<div class="kta-mem-section-titre">📋 Derniers crashs détectés';
    if (cr.reports.length > 0) {
      html += ' <span class="kta-mem-total">' + cr.reports.length + ' / 5</span>';
    }
    html += '</div>';
    if (cr.error) {
      html += '<div class="kta-mem-warn">⚠️ ' + _escapeHtml(cr.error) + '</div>';
    } else if (cr.reports.length === 0) {
      html += '<div class="kta-mem-dim">(aucun crash détecté — l\'app n\'a jamais été killed brutalement, ou les rapports ont été purgés)</div>';
    } else {
      cr.reports.forEach(function(entry) {
        const planTxt = entry.killInfo && entry.killInfo.planId ? entry.killInfo.planId : "(aucun plan)";
        const dateTxt = new Date(entry.timestamp).toLocaleString("fr-FR");
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
        if (ageSec != null) html += ' &middot; ⏱️ ' + ageSec + 's avant détection';
        html += ' &middot; 📋 ' + logsCount + ' log' + (logsCount > 1 ? 's' : '');
        if (entry.sessionSnapMeta) html += ' &middot; 📦 snap session présent';
        html += '</div>';
        html += '<div class="kta-mem-crash-actions">';
        html += '<button type="button" class="kta-btn kta-btn-ghost kta-mem-crash-view" data-crash-id="' + entry.id + '">📋 Voir détails</button>';
        html += '<button type="button" class="kta-btn kta-btn-ghost kta-mem-crash-copy" data-crash-id="' + entry.id + '">📋 Copier</button>';
        html += '<button type="button" class="kta-btn kta-btn-ghost kta-mem-crash-del"  data-crash-id="' + entry.id + '" title="Supprimer ce rapport">🗑️</button>';
        html += '</div>';
        html += '</div>';
      });
      html += '<div style="margin-top:10px; text-align:right;">';
      html += '<button type="button" class="kta-btn kta-btn-ghost" id="kta-mem-crash-clear-all" style="font-size:11px;">🗑️ Tout vider</button>';
      html += '</div>';
    }
    html += '</div>';

    return html;
  }

  // ───────── HANDLERS CRASH REPORTS (v1.20.0) ─────────
  // Bind après chaque render — les boutons sont dynamiques par crash report.
  function _bindCrashHandlers() {
    document.querySelectorAll(".kta-mem-crash-view").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const id = parseInt(btn.dataset.crashId, 10);
        _afficherCrashDetail(id);
      });
    });
    document.querySelectorAll(".kta-mem-crash-copy").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const id = parseInt(btn.dataset.crashId, 10);
        _copierCrashReport(id, btn);
      });
    });
    document.querySelectorAll(".kta-mem-crash-del").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const id = parseInt(btn.dataset.crashId, 10);
        if (!confirm("Supprimer ce rapport de crash ?")) return;
        if (window.CrashReports && typeof window.CrashReports.remove === "function") {
          window.CrashReports.remove(id).then(_refreshAndRender);
        }
      });
    });
    const clearAllBtn = document.getElementById("kta-mem-crash-clear-all");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", function() {
        if (!confirm("Vider TOUS les rapports de crash ?")) return;
        if (window.CrashReports && typeof window.CrashReports.clearAll === "function") {
          window.CrashReports.clearAll().then(_refreshAndRender);
        }
      });
    }
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
          '<span class="kta-readme-modal-titre">📋 Détails du crash #' + id + '</span>' +
          '<button type="button" class="kta-panneau-close kta-mem-crash-detail-close">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<pre class="kta-mem-crash-detail-pre">' + _escapeHtml(txt) + '</pre>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    const close = function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
    overlay.querySelector(".kta-mem-crash-detail-close").addEventListener("click", close);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function _esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", _esc); }
    });
  }

  function _copierCrashReport(id, btn) {
    if (!_lastReport || !_lastReport.crashReports) return;
    const entry = (_lastReport.crashReports.reports || []).find(function(e) { return e.id === id; });
    if (!entry) return;
    if (!window.CrashReports || typeof window.CrashReports.formatReportText !== "function") return;
    const txt = window.CrashReports.formatReportText(entry);
    _copyToClipboard(txt).then(function() {
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = "✅ Copié !";
        setTimeout(function() { if (btn) btn.textContent = orig; }, 1800);
      }
    }).catch(function(e) {
      alert("Échec de la copie : " + (e.message || e));
    });
  }

  let _lastReport = null;

  async function _refreshAndRender() {
    const corps = document.getElementById("kta-mem-corps");
    if (!corps) return;
    corps.innerHTML = '<div class="kta-mem-loading">⏳ Collecte en cours…</div>';
    try {
      _lastReport = await collecter();
      corps.innerHTML = _renderReport(_lastReport);
      // 🆕 v1.20.0 — Bind handlers de la section Crash Reports (boutons
      // dynamiques par crash). Re-bindé à chaque render (rafraîchir, suppr…).
      _bindCrashHandlers();
    } catch(e) {
      corps.innerHTML = '<div class="kta-mem-warn">❌ Erreur lors de la collecte : ' + _escapeHtml(e.message || e) + '</div>';
    }
  }

  async function ouvrir() {
    fermer();
    const overlay = document.createElement("div");
    overlay.id        = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML = _buildModalHtml();
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-mem-close").addEventListener("click", fermer);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) fermer(); });
    document.addEventListener("keydown", _onEscape);

    document.getElementById("kta-mem-refresh").addEventListener("click", _refreshAndRender);
    document.getElementById("kta-mem-copy").addEventListener("click", function() {
      if (!_lastReport) return;
      const txt = getReportText(_lastReport);
      _copyToClipboard(txt).then(function() {
        const btn = document.getElementById("kta-mem-copy");
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = "✅ Copié !";
          setTimeout(function() { if (btn) btn.textContent = orig; }, 1800);
        }
      }).catch(function(e) {
        alert("Échec de la copie : " + (e.message || e));
      });
    });

    await _refreshAndRender();
  }

  function _onEscape(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      fermer();
    }
  }

  function fermer() {
    document.removeEventListener("keydown", _onEscape);
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
