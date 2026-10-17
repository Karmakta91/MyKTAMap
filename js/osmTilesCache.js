/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// OSM TILES CACHE — cache hors ligne persistant des tuiles OpenStreetMap
// =========================
// Télécharger une fois les tuiles d'une zone (bbox d'un plan géoréférencé) pour ouvrir la Vue OSM SANS réseau
// (sortie terrain, Mode Secours en réseau faible).
// IndexedDB "myktamap_osm_tiles_v1", { key: "z/x/y", blob, addedAt } ; cache GLOBAL (tuiles identiques pour
// tous les plans). sw.js sert la tuile en IDB en priorité pour tile.openstreetmap.org, sinon le réseau.
// 🔒 Téléchargement par le navigateur comme une consultation normale ; le cache reste local.
// ⚠️ Politique d'usage OSM (https://operations.osmfoundation.org/policies/tiles/) : 200 tuiles max par
// opération (MAX_TILES_PER_CACHE).
// Expose window.OsmTilesCache : init, cacheVisibleTiles(map, opts) (tuiles visibles, zoom ±1),
//   getCachedTile / hasCachedTile(z, x, y), getStats() → { count, sizeBytes }, hasCacheForBbox(bbox, zoom?),
//   clear, enumerateTilesForBbox(bbox, zoom), formatBytes.
// Doc : docs/architecture/vue-osm.md
// =========================

(function() {
  "use strict";

  const IDB_NAME       = "myktamap_osm_tiles";
  const IDB_VERSION    = 1;
  const IDB_STORE      = "tiles";

  const TILE_URL_PATTERN = /\/(\d+)\/(\d+)\/(\d+)\.png(\?.*)?$/;
  // Politique d'usage OSM : ~200 tuiles par opération.
  const MAX_TILES_PER_CACHE = 200;

  let _dbPromise = null;

  // ── Connexion IDB ──
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

  // ── Lecture / écriture / suppression ──
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

  // ── Statistiques ──
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
        // Parcours pour la taille totale (lent si beaucoup de tuiles, borné par le plafond).
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

  // ── Tuiles d'une bbox (https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames) ──
  function _lat2tileY(lat, z) {
    const r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
  }
  function _lng2tileX(lng, z) {
    return Math.floor((lng + 180) / 360 * Math.pow(2, z));
  }

  // → [{z, x, y}] couvrant la bbox au zoom donné.
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

  // ── Cacher les tuiles visibles (bouton 💾) ──
  // bbox actuelle sur [zoom-1, zoom, zoom+1], plafonnée à MAX_TILES_PER_CACHE : fetch → blob → IDB.
  // opts.onProgress(done, total) ; → { cached, skipped, failed, totalRequested }.
  async function cacheVisibleTiles(map, opts) {
    opts = opts || {};
    if (!map || typeof map.getBounds !== "function") {
      throw new Error("cacheVisibleTiles: map Leaflet invalide");
    }
    const bbox = map.getBounds();
    const curZ = Math.round(map.getZoom() || 14);

    const zooms = [curZ - 1, curZ, curZ + 1].filter(function(z) { return z >= 0 && z <= 19; });

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

    const limited = allTiles.slice(0, MAX_TILES_PER_CACHE);
    const total = limited.length;
    if (typeof opts.onProgress === "function") opts.onProgress(0, total);

    let cached = 0, skipped = 0, failed = 0;
    for (let i = 0; i < limited.length; i++) {
      const t = limited[i];
      try {
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

  // ── Au moins une tuile en cache pour cette zone ? ──
  // Lu par le test hors ligne de la Vue OSM (cache présent → ouverture en mode cache).
  // 🩸 Le zoom du cache est celui du clic 💾 (±1) : tester un zoom fixe rendrait faux et ferait disparaître
  // le bouton 🌍 hors ligne. zoom fourni → 5 échantillons à ce zoom ; omis → centre de la bbox sur [10, 18]
  // (9 lectures IDB au pire, arrêt au premier trouvé).
  async function hasCacheForBbox(bbox, zoom) {
    if (!bbox || typeof bbox.getCenter !== "function") return false;
    const center = bbox.getCenter();
    if (typeof zoom === "number") {
      // Centre + 4 coins.
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
    for (let z = 10; z <= 18; z++) {
      const x = _lng2tileX(center.lng, z);
      const y = _lat2tileY(center.lat, z);
      if (await hasCachedTile(z, x, y)) return true;
    }
    return false;
  }

  // ── Format des tailles ──
  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    if (bytes < k) return bytes + " B";
    if (bytes < k * k) return (bytes / k).toFixed(1) + " KB";
    return (bytes / k / k).toFixed(2) + " MB";
  }

  // ── Exports ──
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
