/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// OSM TILES CACHE — Cache offline persistant des tuiles OpenStreetMap (v1.43.0)
// =========================
// Permet à l'user de télécharger une fois les tuiles d'une zone (typiquement
// la bbox d'un plan georef) pour pouvoir consulter la Vue OSM SANS réseau
// par la suite. Cas d'usage clé : sortie terrain Mode Secours avec cellular
// faible/coupé — on a quand même la carte OSM en fond.
//
// ARCHITECTURE :
//   • Stockage : IndexedDB store "myktamap_osm_tiles_v1"
//                Schéma : { key: "z/x/y", blob: Blob, addedAt: ISO }
//   • Granularité : GLOBALE (cache partagé entre tous les plans —
//                   tile.openstreetmap.org sert les mêmes tuiles pour
//                   tout le monde, pas de duplication par planId).
//   • Interception : Service Worker (sw.js) — si URL matche
//                    tile.openstreetmap.org → check IDB → sert le blob
//                    en priorité, fallback fetch réseau.
//   • UI : bouton "💾 Cacher pour offline" dans bandeau Vue OSM
//          (modale + widget Home) — toast progress + stats persistantes.
//
// PRIVACY :
//   • Tuiles téléchargées via le navigateur (= comme une consultation
//     normale de la carte). OSM ne sait pas que c'est pour "cacher
//     offline", c'est juste une suite de GET tile sur quelques secondes.
//   • Le cache IDB est local, jamais transmis ailleurs.
//
// ⚠️ POLITIQUE D'USAGE OSM :
//   https://operations.osmfoundation.org/policies/tiles/
//   Pré-cache acceptable pour usage personnel modéré (< 200 tuiles à la
//   fois). On limite donc à 200 tuiles par opération (cf MAX_TILES_PER_CACHE).
//
// API publique :
//   window.OsmTilesCache = {
//     init,                              // ouvre la connexion IDB
//     cacheVisibleTiles(map, opts),       // télécharge les tuiles visibles + zoom ±1
//     getCachedTile(z, x, y),             // récupère blob d'une tuile cached
//     hasCachedTile(z, x, y),             // boolean check rapide
//     getStats(),                         // { count, sizeBytes }
//     hasCacheForBbox(bbox, zoom),        // au moins quelques tuiles pour cette bbox ?
//     clear(),                            // vide le cache
//     enumerateTilesForBbox(bbox, zoom)   // liste les {z,x,y} pour une bbox/zoom
//   }
// =========================

(function() {
  "use strict";

  const IDB_NAME       = "myktamap_osm_tiles";
  const IDB_VERSION    = 1;
  const IDB_STORE      = "tiles";

  const TILE_URL_PATTERN = /\/(\d+)\/(\d+)\/(\d+)\.png(\?.*)?$/;
  // Limite politique d'usage OSM (https://operations.osmfoundation.org/policies/tiles/)
  // Max ~200 tuiles par cache one-shot pour rester respectueux.
  const MAX_TILES_PER_CACHE = 200;

  let _dbPromise = null;

  // ============================================================
  // IDB CONNECTION
  // ============================================================
  function _openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function(resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB non disponible"));
        return;
      }
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error); };
    });
    return _dbPromise;
  }

  async function init() {
    try { await _openDB(); return true; }
    catch(e) {
      console.warn("[OsmTilesCache] init échec :", e.message);
      return false;
    }
  }

  // ============================================================
  // GET / PUT / DELETE
  // ============================================================
  async function getCachedTile(z, x, y) {
    try {
      const db = await _openDB();
      return new Promise(function(resolve) {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(z + "/" + x + "/" + y);
        req.onsuccess = function() {
          const rec = req.result;
          resolve(rec && rec.blob ? rec.blob : null);
        };
        req.onerror = function() { resolve(null); };
      });
    } catch(e) { return null; }
  }

  async function hasCachedTile(z, x, y) {
    const blob = await getCachedTile(z, x, y);
    return !!blob;
  }

  async function _putTile(z, x, y, blob) {
    try {
      const db = await _openDB();
      return new Promise(function(resolve) {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put({
          key: z + "/" + x + "/" + y,
          blob: blob,
          addedAt: new Date().toISOString()
        });
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      });
    } catch(e) { return false; }
  }

  async function clear() {
    try {
      const db = await _openDB();
      return new Promise(function(resolve) {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      });
    } catch(e) { return false; }
  }

  // ============================================================
  // STATS
  // ============================================================
  async function getStats() {
    try {
      const db = await _openDB();
      return new Promise(function(resolve) {
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const countReq = store.count();
        let count = 0;
        let sizeBytes = 0;
        countReq.onsuccess = function() { count = countReq.result || 0; };
        // Iterate pour calculer la taille totale (lent si beaucoup de tuiles,
        // mais OK car on cap à ~200-300 tuiles max).
        const curReq = store.openCursor();
        curReq.onsuccess = function(e) {
          const cur = e.target.result;
          if (cur) {
            if (cur.value && cur.value.blob && typeof cur.value.blob.size === "number") {
              sizeBytes += cur.value.blob.size;
            }
            cur.continue();
          } else {
            resolve({ count: count, sizeBytes: sizeBytes });
          }
        };
        curReq.onerror = function() { resolve({ count: 0, sizeBytes: 0 }); };
      });
    } catch(e) { return { count: 0, sizeBytes: 0 }; }
  }

  // ============================================================
  // ENUMERATE TILES FOR BBOX/ZOOM (slippy map tile names)
  // ============================================================
  // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
  function _lat2tileY(lat, z) {
    const r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
  }
  function _lng2tileX(lng, z) {
    return Math.floor((lng + 180) / 360 * Math.pow(2, z));
  }

  // Retourne [{z, x, y}] couvrant la bbox au zoom donné.
  function enumerateTilesForBbox(bbox, zoom) {
    if (!bbox || typeof bbox.getNorth !== "function") return [];
    const z = Math.max(0, Math.min(19, Math.floor(zoom)));
    const minX = _lng2tileX(bbox.getWest(),  z);
    const maxX = _lng2tileX(bbox.getEast(),  z);
    const minY = _lat2tileY(bbox.getNorth(), z);  // Y inversé : nord = Y min
    const maxY = _lat2tileY(bbox.getSouth(), z);
    const tiles = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push({ z: z, x: x, y: y });
      }
    }
    return tiles;
  }

  // ============================================================
  // CACHE VISIBLE TILES (= action principale du bouton 💾)
  // ============================================================
  // Énumère les tuiles couvrant la bbox actuelle de la map, sur la
  // plage de zoom [zoomActuel-1, zoomActuel, zoomActuel+1] (= 3 niveaux),
  // capés à MAX_TILES_PER_CACHE. Pour chaque : fetch HTTP → blob → IDB.
  //
  // Callbacks options.onProgress(done, total) pour UI progress bar.
  // Retourne : { cached: N, skipped: M, failed: K, totalRequested: T }
  async function cacheVisibleTiles(map, opts) {
    opts = opts || {};
    if (!map || typeof map.getBounds !== "function") {
      throw new Error("cacheVisibleTiles: map Leaflet invalide");
    }
    const bbox = map.getBounds();
    const curZ = Math.round(map.getZoom() || 14);

    // 3 niveaux : actuel ±1
    const zooms = [curZ - 1, curZ, curZ + 1].filter(function(z) { return z >= 0 && z <= 19; });

    // Collecte tous les tiles + dedup
    const seen = {};
    const allTiles = [];
    for (const z of zooms) {
      const list = enumerateTilesForBbox(bbox, z);
      for (const t of list) {
        const k = t.z + "/" + t.x + "/" + t.y;
        if (!seen[k]) {
          seen[k] = true;
          allTiles.push(t);
        }
      }
    }

    // Cap MAX_TILES_PER_CACHE (politique OSM)
    const limited = allTiles.slice(0, MAX_TILES_PER_CACHE);
    const total = limited.length;
    if (typeof opts.onProgress === "function") opts.onProgress(0, total);

    let cached = 0, skipped = 0, failed = 0;
    for (let i = 0; i < limited.length; i++) {
      const t = limited[i];
      try {
        // Skip si déjà en cache
        const existing = await getCachedTile(t.z, t.x, t.y);
        if (existing) {
          skipped++;
        } else {
          const url = "https://tile.openstreetmap.org/" + t.z + "/" + t.x + "/" + t.y + ".png";
          const resp = await fetch(url, { mode: "cors", credentials: "omit" });
          if (resp.ok) {
            const blob = await resp.blob();
            const ok = await _putTile(t.z, t.x, t.y, blob);
            if (ok) cached++; else failed++;
          } else {
            failed++;
          }
        }
      } catch(e) {
        failed++;
      }
      if (typeof opts.onProgress === "function") opts.onProgress(i + 1, total);
    }
    return {
      cached: cached, skipped: skipped, failed: failed,
      totalRequested: total, capped: allTiles.length > MAX_TILES_PER_CACHE
    };
  }

  // ============================================================
  // HAS CACHE FOR BBOX (= au moins 1 tuile cachée pour cette zone ?)
  // ============================================================
  // Utilisé par le gate _isOnline() de Vue OSM : si offline mais cache
  // présent pour la bbox du plan, autoriser ouverture en mode cache.
  // Bug v1.43.2 (KARMA "mode avion → icône OSM disparaît") :
  // l'ancienne version testait UNIQUEMENT au zoom hardcoded `14`. Or
  // cacheVisibleTiles cache à [curZ-1, curZ, curZ+1] avec curZ = zoom
  // courant de la map au moment du clic 💾. Si l'user clic 💾 à zoom 16,
  // on cache 15/16/17 — JAMAIS 14 → `hasCacheForBbox(bbox, 14)` retournait
  // false → flag _planHasCachedTiles=false → bouton 🌍 disparu offline.
  //
  // Fix : 2 modes
  //  - zoom fourni → ancien comportement (5 samples au zoom donné)
  //  - zoom omis → "any-zoom" : test le centre du bbox sur tous les zooms
  //    [10, 18]. 9 lookups IDB ≈ 50ms, transparent. Stop dès le 1er hit.
  async function hasCacheForBbox(bbox, zoom) {
    if (!bbox || typeof bbox.getCenter !== "function") return false;
    const center = bbox.getCenter();
    if (typeof zoom === "number") {
      // Mode zoom spécifique — 5 samples (centre + 4 coins)
      const samples = [
        { lat: center.lat, lng: center.lng },
        { lat: bbox.getNorth(), lng: bbox.getWest() },
        { lat: bbox.getNorth(), lng: bbox.getEast() },
        { lat: bbox.getSouth(), lng: bbox.getWest() },
        { lat: bbox.getSouth(), lng: bbox.getEast() }
      ];
      for (const s of samples) {
        const x = _lng2tileX(s.lng, zoom);
        const y = _lat2tileY(s.lat, zoom);
        if (await hasCachedTile(zoom, x, y)) return true;
      }
      return false;
    }
    // Mode "any-zoom" — test le centre du plan sur tous les zooms typiques.
    // 9 lookups IDB worst-case. Robuste indépendamment du zoom auquel
    // l'user a cliqué 💾.
    for (let z = 10; z <= 18; z++) {
      const x = _lng2tileX(center.lng, z);
      const y = _lat2tileY(center.lat, z);
      if (await hasCachedTile(z, x, y)) return true;
    }
    return false;
  }

  // ============================================================
  // FORMAT BYTES (helper UI)
  // ============================================================
  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    if (bytes < k) return bytes + " B";
    if (bytes < k * k) return (bytes / k).toFixed(1) + " KB";
    return (bytes / k / k).toFixed(2) + " MB";
  }

  // ============================================================
  // EXPORTS
  // ============================================================
  window.OsmTilesCache = {
    init:                  init,
    cacheVisibleTiles:     cacheVisibleTiles,
    getCachedTile:         getCachedTile,
    hasCachedTile:         hasCachedTile,
    getStats:              getStats,
    hasCacheForBbox:       hasCacheForBbox,
    clear:                 clear,
    enumerateTilesForBbox: enumerateTilesForBbox,
    formatBytes:           formatBytes,
    TILE_URL_PATTERN:      TILE_URL_PATTERN,
    MAX_TILES_PER_CACHE:   MAX_TILES_PER_CACHE
  };

  console.log("[OsmTilesCache] Module chargé (v1.43.0). IDB store : " + IDB_NAME + "/" + IDB_STORE);
})();
