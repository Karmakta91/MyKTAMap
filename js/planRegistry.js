/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.is-underground.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// PLAN REGISTRY — Gestion des plans connus
// =========================
// Stocke et gère la liste des plans (serveur découverts + locaux ZIP) avec :
//   • Persistance localStorage
//   • Stockage des FileSystemFileHandle dans IndexedDB pour ré-ouverture rapide
//   • Export / import de la liste (fichier MAIN.config)
//
// Format storage :
// {
//   version: "1.0",
//   lastPlanId: "server_data_test1" | "local_planmarseille_v1" | null,
//   plans: [
//     { id, type:"server", path, name, version, author, discovered, lastOpened, addedAt, perfPreset? },
//     { id, type:"local",  name, version, originalFilename, fileSize, fsHandleId?, lastOpened, addedAt, perfPreset? }
//   ]
// }
//
// `perfPreset` (optionnel) : "auto" | "quality" | "balanced" | "performance"
//   → choix de mode performance mémorisé pour CE plan (champ ajouté en v2).
//   → absent = aucun choix mémorisé, le loader affichera "auto" par défaut.
//
// API publique : window.PlanRegistry
// =========================

(function() {
  "use strict";

  const STORAGE_KEY = "myktamap_plans";
  const IDB_NAME    = "myktamap_handles";
  const IDB_STORE   = "handles";
  const IDB_BLOBS   = "blobs"; // store séparé pour les fichiers ZIP stockés en local

  let _data = null;

  // ========== INIT ==========
  function init() {
    if (_data) return _data;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _data = JSON.parse(raw);
        if (!_data.plans) _data.plans = [];
        if (!_data.version) _data.version = "1.0";
      }
    } catch(e) {
      console.warn("[PlanRegistry] localStorage corrompu, reset", e);
    }
    if (!_data) {
      _data = { version: "1.0", lastPlanId: null, plans: [] };
    }
    return _data;
  }

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    } catch(e) {
      console.error("[PlanRegistry] save échoué", e);
    }
  }

  // ========== ID GENERATORS ==========
  function _slug(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "plan";
  }

  function genServerId(path) {
    return "server_" + _slug(path);
  }

  function genLocalId(planName, version) {
    const base = _slug(planName) + (version ? "_" + _slug(version) : "");
    return "local_" + base;
  }

  // ========== ACCESSEURS ==========
  function getAll() {
    init();
    return _data.plans.slice();
  }

  function findById(id) {
    init();
    return _data.plans.find(function(p) { return p.id === id; }) || null;
  }

  function getRecents(n) {
    init();
    n = n || 5;
    return _data.plans
      .filter(function(p) { return p.lastOpened; })
      .sort(function(a, b) {
        return (b.lastOpened || "").localeCompare(a.lastOpened || "");
      })
      .slice(0, n);
  }

  function getLastOpened() {
    init();
    if (!_data.lastPlanId) return null;
    return findById(_data.lastPlanId);
  }

  function setLastPlanId(id) {
    init();
    _data.lastPlanId = id || null;
    _save();
  }

  // ========== ADD / UPDATE ==========
  function addOrUpdate(plan) {
    init();
    if (!plan || !plan.id) {
      console.warn("[PlanRegistry] addOrUpdate sans id ignoré");
      return null;
    }
    const idx = _data.plans.findIndex(function(p) { return p.id === plan.id; });
    if (idx >= 0) {
      // Merge en préservant addedAt et lastOpened existants si non fournis
      _data.plans[idx] = Object.assign({}, _data.plans[idx], plan);
    } else {
      if (!plan.addedAt) plan.addedAt = new Date().toISOString();
      _data.plans.push(plan);
    }
    _save();
    return findById(plan.id);
  }

  function markOpened(id) {
    init();
    const p = findById(id);
    if (!p) return false;
    p.lastOpened = new Date().toISOString();
    _data.lastPlanId = id;
    _save();
    return true;
  }

  function remove(id) {
    init();
    const idx = _data.plans.findIndex(function(p) { return p.id === id; });
    if (idx < 0) return false;
    _data.plans.splice(idx, 1);
    if (_data.lastPlanId === id) _data.lastPlanId = null;
    _save();
    // Aussi supprimer le handle FS et le blob ZIP associés
    removeHandle(id);
    removeBlob(id);
    return true;
  }

  function removeAll() {
    init();
    _data.plans = [];
    _data.lastPlanId = null;
    _save();
  }

  // ========== PERF PRESET (PAR PLAN) ==========
  const _PERF_VALID = ["off", "auto", "quality", "balanced", "performance"];

  // Récupère le preset perf mémorisé pour un plan, ou null si jamais réglé.
  function getPerfPreset(id) {
    init();
    const p = findById(id);
    return (p && typeof p.perfPreset === "string" && _PERF_VALID.indexOf(p.perfPreset) >= 0)
      ? p.perfPreset
      : null;
  }

  // Mémorise le preset perf pour un plan. Retourne true si modification appliquée.
  function setPerfPreset(id, preset) {
    init();
    if (_PERF_VALID.indexOf(preset) < 0) {
      console.warn("[PlanRegistry] perfPreset invalide :", preset, "— ignoré");
      return false;
    }
    const p = findById(id);
    if (!p) {
      console.warn("[PlanRegistry] setPerfPreset : plan introuvable", id);
      return false;
    }
    if (p.perfPreset === preset) return true; // pas de changement
    p.perfPreset = preset;
    _save();
    return true;
  }

  // ========== EXPORT / IMPORT ==========
  function exportToFile() {
    init();
    const exported = {
      type: "myktamap-plans-list",
      version: _data.version,
      exported_at: new Date().toISOString(),
      // Retirer les fsHandleId (non portables)
      plans: _data.plans.map(function(p) {
        const clone = Object.assign({}, p);
        delete clone.fsHandleId;
        return clone;
      })
    };
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    a.href = url;
    a.download = "myktamap_plans_" + stamp + ".config";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  // mode: "replace" | "merge"
  async function importFromFile(file, mode) {
    if (!file) throw new Error("Aucun fichier fourni");
    const text = await file.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch(e) { throw new Error("Fichier JSON invalide"); }

    if (payload.type !== "myktamap-plans-list") {
      throw new Error("Ce fichier n'est pas une liste de plans MyKTAMap");
    }
    if (!Array.isArray(payload.plans)) {
      throw new Error("Format de liste invalide (champ 'plans' manquant)");
    }

    init();

    if (mode === "replace") {
      _data.plans = payload.plans.slice();
    } else {
      // merge : pour chaque plan importé, ajouter ou ignorer si id déjà présent
      payload.plans.forEach(function(p) {
        if (!p || !p.id) return;
        const existing = findById(p.id);
        if (!existing) {
          _data.plans.push(p);
        }
        // Si existe déjà, on ne touche pas (on garde notre version)
      });
    }
    _save();
    return { count: payload.plans.length };
  }

  function statsImport(file) {
    return file.text().then(function(text) {
      let payload;
      try { payload = JSON.parse(text); }
      catch(e) { return { ok: false, error: "JSON invalide" }; }
      if (payload.type !== "myktamap-plans-list") {
        return { ok: false, error: "Pas une liste MyKTAMap" };
      }
      const total = (payload.plans || []).length;
      init();
      const newOnes = (payload.plans || []).filter(function(p) {
        return p && p.id && !findById(p.id);
      }).length;
      const duplicates = total - newOnes;
      return { ok: true, total: total, newOnes: newOnes, duplicates: duplicates };
    });
  }

  // ========== INDEXED DB POUR FILE SYSTEM HANDLES + BLOBS ZIP ==========
  function _openIDB() {
    return new Promise(function(resolve, reject) {
      if (!("indexedDB" in window)) { resolve(null); return; }
      // Version 2 : on ajoute le store "blobs" pour le stockage mobile
      const req = indexedDB.open(IDB_NAME, 2);
      req.onupgradeneeded = function() {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
        if (!db.objectStoreNames.contains(IDB_BLOBS)) {
          db.createObjectStore(IDB_BLOBS);
        }
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { resolve(null); };
    });
  }

  async function saveHandle(id, handle) {
    if (!handle) return false;
    const db = await _openIDB();
    if (!db) return false;
    return new Promise(function(resolve) {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(handle, id);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  }

  async function getHandle(id) {
    const db = await _openIDB();
    if (!db) return null;
    return new Promise(function(resolve) {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror   = function() { resolve(null); };
    });
  }

  async function removeHandle(id) {
    const db = await _openIDB();
    if (!db) return false;
    return new Promise(function(resolve) {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  }

  function hasFsAccess() {
    return typeof window.showOpenFilePicker === "function";
  }

  // Demande la permission de lecture sur un handle. Retourne true/false.
  async function ensureHandlePermission(handle) {
    if (!handle || !handle.queryPermission) return false;
    try {
      let p = await handle.queryPermission({ mode: "read" });
      if (p === "granted") return true;
      p = await handle.requestPermission({ mode: "read" });
      return p === "granted";
    } catch(e) {
      return false;
    }
  }

  // ========== STOCKAGE BLOB ZIP (mobile + fallback) ==========

  // Demande au navigateur de marquer le stockage comme "persistant"
  // → empêche la purge automatique sur iOS Safari et Chrome Android
  async function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    try {
      const persisted = await navigator.storage.persisted();
      if (persisted) return true;
      return await navigator.storage.persist();
    } catch(e) { return false; }
  }

  // Stocke un Blob (le ZIP entier) dans IndexedDB
  // Retourne un objet { ok: true } ou { ok: false, error: "..." }
  async function saveBlob(id, blob) {
    if (!blob) return { ok: false, error: "Aucun fichier" };
    const db = await _openIDB();
    if (!db) return { ok: false, error: "IndexedDB indisponible" };

    return new Promise(function(resolve) {
      try {
        const tx = db.transaction(IDB_BLOBS, "readwrite");
        tx.objectStore(IDB_BLOBS).put(blob, id);
        tx.oncomplete = function() { resolve({ ok: true }); };
        tx.onerror = function(e) {
          resolve({ ok: false, error: (tx.error && tx.error.name) || "Erreur IDB" });
        };
        tx.onabort = function() {
          // Souvent déclenché par QuotaExceededError
          const err = tx.error;
          if (err && err.name === "QuotaExceededError") {
            resolve({ ok: false, error: "Quota dépassé — l'espace de stockage du navigateur est plein" });
          } else {
            resolve({ ok: false, error: (err && err.name) || "Stockage refusé" });
          }
        };
      } catch(e) {
        resolve({ ok: false, error: e.message || "Erreur inattendue" });
      }
    });
  }

  async function getBlob(id) {
    const db = await _openIDB();
    if (!db) return null;
    return new Promise(function(resolve) {
      const tx = db.transaction(IDB_BLOBS, "readonly");
      const req = tx.objectStore(IDB_BLOBS).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror   = function() { resolve(null); };
    });
  }

  async function removeBlob(id) {
    const db = await _openIDB();
    if (!db) return false;
    return new Promise(function(resolve) {
      const tx = db.transaction(IDB_BLOBS, "readwrite");
      tx.objectStore(IDB_BLOBS).delete(id);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { resolve(false); };
    });
  }

  // Estimation du quota disponible (utile pour avertir avant de stocker)
  async function getStorageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      return await navigator.storage.estimate();
    } catch(e) { return null; }
  }

  // ========== EXPORTS ==========
  window.PlanRegistry = {
    init:                 init,
    getAll:               getAll,
    findById:             findById,
    getRecents:           getRecents,
    getLastOpened:        getLastOpened,
    setLastPlanId:        setLastPlanId,
    addOrUpdate:          addOrUpdate,
    markOpened:           markOpened,
    remove:               remove,
    removeAll:            removeAll,
    getPerfPreset:        getPerfPreset,
    setPerfPreset:        setPerfPreset,
    exportToFile:         exportToFile,
    importFromFile:       importFromFile,
    statsImport:          statsImport,
    genServerId:          genServerId,
    genLocalId:           genLocalId,
    saveHandle:           saveHandle,
    getHandle:            getHandle,
    removeHandle:         removeHandle,
    hasFsAccess:          hasFsAccess,
    ensureHandlePermission: ensureHandlePermission,
    // Stockage Blob (mobile + fallback)
    saveBlob:             saveBlob,
    getBlob:              getBlob,
    removeBlob:           removeBlob,
    requestPersistentStorage: requestPersistentStorage,
    getStorageEstimate:   getStorageEstimate
  };

})();
