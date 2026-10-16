/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 *
 * MODULE : secoursPhotos.js (introduit en v1.24.0 — Phase 3 Mode EXÉCUTION)
 * =========================================================================
 *
 * Backend de stockage des photos attachées aux étapes d'un parcours d'équipe
 * Mode Secours en exécution terrain. Pattern similaire à photos.js (POI)
 * mais avec key composite scenarioId + equipeId + stepIdx au lieu de
 * planId + pointId.
 *
 * Choix design KARMA validé : store IDB DÉDIÉ (myktamap_secours_photos)
 * séparé du store POI (myktamap_photos) pour :
 *  - séparation propre (cleanup indépendant, compteurs distincts)
 *  - cohérence sémantique (photos de mission vs photos d'annotation perm)
 *  - sécurité d'évolution (Phase 3 peut bouger le schema sans toucher au POI)
 *
 * Architecture :
 *   - 1 Database IndexedDB : "myktamap_secours_photos"
 *   - 1 Object store : "photos" (keyPath = photoId)
 *   - 3 Index :
 *       • "by_scenario"             : scenarioId
 *       • "by_scenario_equipe"      : [scenarioId, equipeId]
 *       • "by_scenario_equipe_step" : [scenarioId, equipeId, stepIdx]
 *
 * Format d'un record :
 *   {
 *     id:         "a1b2c3d4",        // photoId (short UUID-ish, unique)
 *     scenarioId: "secours_1234",    // scenario owner
 *     equipeId:   "G_5678",          // équipe owner (ou "_notes_libres" pour mode secouriste)
 *     stepIdx:    2,                 // étape index dans le parcours (ou pour _notes_libres,
 *                                    //   l'id de la note tronqué pour fit Number — voir note bas)
 *     blob:       Blob,              // binary JPEG/PNG
 *     mime:       "image/jpeg",      // MIME type
 *     size:       234567,            // bytes (= blob.size, cache)
 *     createdAt:  1700000000000,     // Date.now() à l'ajout
 *     meta:       { caption: "..." } // metadata user optionnelle
 *   }
 *
 * ⚠️ Note sur stepIdx pour mode "secouriste libre" :
 *   Les notes libres n'ont pas d'index numérique stable mais un id string
 *   (genre "note_1700000000_abc"). Pour rester compatible avec l'index
 *   composite IDB qui requiert un type cohérent, on stocke equipeId =
 *   "_notes_libres" et stepIdx = -1 (sentinel). Le rapprochement avec la
 *   note exacte se fait via meta.noteId stocké dans le record. Plus
 *   simple que de migrer le schema pour 1 cas d'usage.
 *
 * Limites :
 *   - MAX_PHOTOS_PER_ETAPE = 5 (cohérent avec POI photos, max ergonomie 1 grille)
 *   - Compression auto à l'ajout : max 1920 px côté long, JPEG 0.85
 *     → ~200-400 Ko par photo (vs 3-5 MB raw smartphone)
 *
 * API publique (window.MyKTAMapSecoursPhotos) :
 *   - init()                                              → Promise<IDBDatabase|null>
 *   - isAvailable()                                       → boolean
 *   - generateId()                                        → string
 *   - compressBlob(blob, opts)                            → Promise<Blob>
 *   - addPhoto(scenarioId, equipeId, stepIdx, blob, opts) → Promise<photoId>
 *   - getPhoto(photoId)                                   → Promise<record|null>
 *   - getBlob(photoId)                                    → Promise<Blob|null>
 *   - getObjectUrl(photoId)                               → Promise<string|null>
 *   - getPhotosForEtape(scenarioId, equipeId, stepIdx)    → Promise<Array<record>>
 *   - getPhotosForEquipe(scenarioId, equipeId)            → Promise<Array<record>>
 *   - getPhotosForScenario(scenarioId)                    → Promise<Array<record>>
 *   - countPhotosForEtape(scenarioId, equipeId, stepIdx)  → Promise<number>
 *   - countPhotosForScenario(scenarioId)                  → Promise<number>
 *   - deletePhoto(photoId)                                → Promise<boolean>
 *   - deletePhotosForEtape(scenarioId, equipeId, stepIdx) → Promise<number>
 *   - deletePhotosForScenario(scenarioId)                 → Promise<number>
 *   - clearAll()                                          → Promise<void>
 *
 * Toutes les fonctions retournent des Promises (asynchrones). Gestion
 * gracieuse des erreurs : log warn + return null/false/array vide plutôt
 * que throw, pour ne pas casser le flow UI consommateur.
 *
 * Confidentialité : 100% local IndexedDB. Aucun fetch externe.
 * =========================================================================
 */

(function() {
  "use strict";

  const DB_NAME    = "myktamap_secours_photos";
  const DB_VERSION = 1;
  const STORE      = "photos";

  // Sentinel pour stepIdx en mode notes libres (mode secouriste)
  const NOTES_LIBRES_STEP_IDX = -1;

  // Limites (anti-OOM, anti-quota)
  const MAX_PHOTOS_PER_ETAPE   = 5;
  const COMPRESS_MAX_DIMENSION = 1920;  // px côté long après compression
  const COMPRESS_JPEG_QUALITY  = 0.85;  // qualité JPEG (0-1)

  // Singleton connection IDB (= 1 seule fois ouverte par session)
  let _db = null;
  let _initPromise = null;

  // ============================================================
  // CHECK DISPONIBILITÉ
  // ============================================================
  function isAvailable() {
    return typeof window !== "undefined" &&
           typeof window.indexedDB !== "undefined";
  }

  // ============================================================
  // GÉNÉRATION D'ID PHOTO
  // ============================================================
  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID().split("-")[0];
    }
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  }

  // ============================================================
  // OUVERTURE DE LA DATABASE
  // ============================================================
  function init() {
    if (!isAvailable()) {
      console.warn("[SecoursPhotos] IndexedDB non disponible — module désactivé");
      return Promise.resolve(null);
    }
    if (_db) return Promise.resolve(_db);
    if (_initPromise) return _initPromise;

    _initPromise = new Promise(function(resolve, reject) {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("by_scenario", "scenarioId", { unique: false });
          store.createIndex("by_scenario_equipe",
                            ["scenarioId", "equipeId"],
                            { unique: false });
          store.createIndex("by_scenario_equipe_step",
                            ["scenarioId", "equipeId", "stepIdx"],
                            { unique: false });
          console.log("[SecoursPhotos] Schema IDB créé : store '" + STORE + "' + 3 indexes");
        }
      };

      req.onsuccess = function(e) {
        _db = e.target.result;
        _db.onclose = function() {
          console.warn("[SecoursPhotos] IDB connection fermée (système).");
          _db = null;
          _initPromise = null;
        };
        _db.onerror = function(ev) {
          console.warn("[SecoursPhotos] IDB erreur runtime :", ev.target ? ev.target.error : ev);
        };
        console.log("[SecoursPhotos] IDB ouverte (" + DB_NAME + " v" + DB_VERSION + ")");
        resolve(_db);
      };

      req.onerror = function(e) {
        console.error("[SecoursPhotos] IDB ouverture échouée :", e.target ? e.target.error : e);
        _initPromise = null;
        reject(e.target ? e.target.error : new Error("IDB open failed"));
      };

      req.onblocked = function() {
        console.warn("[SecoursPhotos] IDB blocked (autre onglet a une vieille version ?)");
      };
    });

    return _initPromise;
  }

  // ============================================================
  // HELPER TRANSACTION + REQ WRAPPER
  // ============================================================
  function _tx(mode, op) {
    return init().then(function(db) {
      if (!db) throw new Error("IDB unavailable");
      return new Promise(function(resolve, reject) {
        const tx    = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        try {
          result = op(store);
        } catch(e) {
          reject(e);
          return;
        }
        tx.oncomplete = function() {
          if (result && typeof result.then === "function") {
            result.then(resolve, reject);
          } else {
            resolve(result);
          }
        };
        tx.onerror = function(e) {
          reject(e.target ? e.target.error : new Error("IDB tx error"));
        };
        tx.onabort = function(e) {
          reject(e.target ? e.target.error : new Error("IDB tx aborted"));
        };
      });
    });
  }
  function _reqPromise(req) {
    return new Promise(function(resolve, reject) {
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror   = function(e) { reject(e.target ? e.target.error : new Error("req error")); };
    });
  }

  // ============================================================
  // COMPRESSION D'UN BLOB IMAGE
  // ============================================================
  function compressBlob(srcBlob, opts) {
    opts = opts || {};
    const maxDim  = opts.maxDimension || COMPRESS_MAX_DIMENSION;
    const quality = (typeof opts.quality === "number") ? opts.quality : COMPRESS_JPEG_QUALITY;
    const mime    = opts.mime || "image/jpeg";

    return new Promise(function(resolve, reject) {
      if (!srcBlob || !(srcBlob instanceof Blob)) {
        reject(new Error("compressBlob : srcBlob invalide"));
        return;
      }
      const url = URL.createObjectURL(srcBlob);
      const img = new Image();
      img.onload = function() {
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        URL.revokeObjectURL(url);
        // 🔒 (A8) : plus de bypass « déjà petite » — le blob original
        // peut porter de l'EXIF (GPS). Re-encodage systématique, qualité
        // haute (0.92) sans resize pour les petites (cf photos.js).
        const petite = (W <= maxDim && H <= maxDim && srcBlob.size < 500 * 1024);
        const q = petite ? Math.max(quality, 0.92) : quality;
        const ratio = Math.min(maxDim / W, maxDim / H, 1);
        const newW = Math.round(W * ratio);
        const newH = Math.round(H * ratio);
        const canvas = document.createElement("canvas");
        canvas.width  = newW;
        canvas.height = newH;
        const ctx = canvas.getContext("2d");
        if (mime === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, newW, newH);
        }
        ctx.drawImage(img, 0, 0, newW, newH);
        canvas.toBlob(function(blob) {
          if (!blob) {
            reject(new Error("compressBlob : canvas.toBlob a retourné null"));
            return;
          }
          resolve(blob);
        }, mime, q);
      };
      img.onerror = function() {
        URL.revokeObjectURL(url);
        reject(new Error("compressBlob : impossible de charger l'image source"));
      };
      img.src = url;
    });
  }

  // ============================================================
  // AJOUTER UNE PHOTO
  // ============================================================
  // stepIdx = -1 pour les notes libres (mode secouriste). Pour les étapes
  // équipe normales, stepIdx >= 0 (0=entrée, 1..N=intermédiaires, N+1=sortie).
  function addPhoto(scenarioId, equipeId, stepIdx, srcBlob, opts) {
    opts = opts || {};
    if (!scenarioId || !equipeId) {
      return Promise.reject(new Error("addPhoto : scenarioId et equipeId requis"));
    }
    if (typeof stepIdx !== "number") {
      return Promise.reject(new Error("addPhoto : stepIdx doit être un number (utiliser -1 pour notes libres)"));
    }
    if (!srcBlob || !(srcBlob instanceof Blob)) {
      return Promise.reject(new Error("addPhoto : srcBlob doit être un Blob"));
    }
    return countPhotosForEtape(scenarioId, equipeId, stepIdx).then(function(n) {
      if (n >= MAX_PHOTOS_PER_ETAPE) {
        const err = new Error("Maximum " + MAX_PHOTOS_PER_ETAPE + " photos par étape (déjà " + n + ").");
        err.code = "QUOTA_PER_ETAPE";
        throw err;
      }
      const doCompress = !opts.skipCompress;
      return (doCompress ? compressBlob(srcBlob, opts) : Promise.resolve(srcBlob));
    }).then(function(blob) {
      const photoId = generateId();
      const record = {
        id:         photoId,
        scenarioId: scenarioId,
        equipeId:   equipeId,
        stepIdx:    stepIdx,
        blob:       blob,
        mime:       blob.type || "image/jpeg",
        size:       blob.size,
        createdAt:  Date.now(),
        meta:       opts.meta || {}
      };
      return _tx("readwrite", function(store) {
        return _reqPromise(store.put(record)).then(function() { return photoId; });
      });
    });
  }

  // ============================================================
  // GETTERS / COUNTERS
  // ============================================================
  function getPhoto(photoId) {
    if (!photoId) return Promise.resolve(null);
    return _tx("readonly", function(store) {
      return _reqPromise(store.get(photoId));
    }).then(function(rec) { return rec || null; }, function(e) {
      console.warn("[SecoursPhotos] getPhoto échec :", e);
      return null;
    });
  }
  function getBlob(photoId) {
    return getPhoto(photoId).then(function(rec) { return rec ? rec.blob : null; });
  }
  function getObjectUrl(photoId) {
    return getBlob(photoId).then(function(blob) {
      return blob ? URL.createObjectURL(blob) : null;
    });
  }
  function getPhotosForEtape(scenarioId, equipeId, stepIdx) {
    if (!scenarioId || !equipeId) return Promise.resolve([]);
    return _tx("readonly", function(store) {
      const idx = store.index("by_scenario_equipe_step");
      const range = IDBKeyRange.only([scenarioId, equipeId, stepIdx]);
      return _reqPromise(idx.getAll(range));
    }).then(function(arr) { return Array.isArray(arr) ? arr : []; }, function(e) {
      console.warn("[SecoursPhotos] getPhotosForEtape échec :", e);
      return [];
    });
  }
  function getPhotosForEquipe(scenarioId, equipeId) {
    if (!scenarioId || !equipeId) return Promise.resolve([]);
    return _tx("readonly", function(store) {
      const idx = store.index("by_scenario_equipe");
      const range = IDBKeyRange.only([scenarioId, equipeId]);
      return _reqPromise(idx.getAll(range));
    }).then(function(arr) { return Array.isArray(arr) ? arr : []; }, function(e) {
      console.warn("[SecoursPhotos] getPhotosForEquipe échec :", e);
      return [];
    });
  }
  function getPhotosForScenario(scenarioId) {
    if (!scenarioId) return Promise.resolve([]);
    return _tx("readonly", function(store) {
      const idx = store.index("by_scenario");
      return _reqPromise(idx.getAll(IDBKeyRange.only(scenarioId)));
    }).then(function(arr) { return Array.isArray(arr) ? arr : []; }, function(e) {
      console.warn("[SecoursPhotos] getPhotosForScenario échec :", e);
      return [];
    });
  }
  function countPhotosForEtape(scenarioId, equipeId, stepIdx) {
    if (!scenarioId || !equipeId) return Promise.resolve(0);
    return _tx("readonly", function(store) {
      const idx = store.index("by_scenario_equipe_step");
      const range = IDBKeyRange.only([scenarioId, equipeId, stepIdx]);
      return _reqPromise(idx.count(range));
    }).then(function(n) { return n || 0; }, function(e) {
      console.warn("[SecoursPhotos] countPhotosForEtape échec :", e);
      return 0;
    });
  }
  function countPhotosForScenario(scenarioId) {
    if (!scenarioId) return Promise.resolve(0);
    return _tx("readonly", function(store) {
      const idx = store.index("by_scenario");
      return _reqPromise(idx.count(IDBKeyRange.only(scenarioId)));
    }).then(function(n) { return n || 0; }, function(e) {
      console.warn("[SecoursPhotos] countPhotosForScenario échec :", e);
      return 0;
    });
  }

  // ============================================================
  // DELETIONS
  // ============================================================
  function deletePhoto(photoId) {
    if (!photoId) return Promise.resolve(false);
    return _tx("readwrite", function(store) {
      return _reqPromise(store.delete(photoId)).then(function() { return true; });
    }).then(function(ok) { return ok; }, function(e) {
      console.warn("[SecoursPhotos] deletePhoto échec :", e);
      return false;
    });
  }
  // 🩸 (relecture Secours, R7) — une étape renumérotée par
  // secoursMode._resyncEtapesEquipe emporte ses photos : sans ça, le quota de
  // MAX_PHOTOS_PER_ETAPE (compté par stepIdx) comptait celles d'une autre étape.
  // -2 = étape retirée (photo gardée, hors rapport). Lecture + écriture dans la
  // MÊME transaction : le put part du handler de la lecture (tx encore active).
  function setStepIdx(photoId, stepIdx) {
    if (!photoId || typeof stepIdx !== "number") return Promise.resolve(false);
    return _tx("readwrite", function(store) {
      return new Promise(function(resolve) {
        const req = store.get(photoId);
        req.onsuccess = function() {
          const rec = req.result;
          if (!rec) { resolve(false); return; }
          rec.stepIdx = stepIdx;
          store.put(rec);
          resolve(true);
        };
        req.onerror = function() { resolve(false); };
      });
    });
  }
  function deletePhotosForEtape(scenarioId, equipeId, stepIdx) {
    return getPhotosForEtape(scenarioId, equipeId, stepIdx).then(function(arr) {
      if (!arr.length) return 0;
      return Promise.all(arr.map(function(rec) { return deletePhoto(rec.id); }))
        .then(function(results) {
          return results.filter(function(ok) { return ok; }).length;
        });
    });
  }
  function deletePhotosForScenario(scenarioId) {
    return getPhotosForScenario(scenarioId).then(function(arr) {
      if (!arr.length) return 0;
      return Promise.all(arr.map(function(rec) { return deletePhoto(rec.id); }))
        .then(function(results) {
          return results.filter(function(ok) { return ok; }).length;
        });
    });
  }
  function clearAll() {
    return _tx("readwrite", function(store) {
      return _reqPromise(store.clear());
    }).then(function() {}, function(e) {
      console.warn("[SecoursPhotos] clearAll échec :", e);
    });
  }

  // ============================================================
  // IMPORT PHOTO depuis dataUrl (consolidation cross-device)
  // ============================================================
  // Différences avec addPhoto :
  //   - Préserve l'id source (pour dédup à l'import par id)
  //   - Skip la compression (photo déjà compressée à l'export par genererRapportData)
  //   - Skip la quota check MAX_PHOTOS_PER_ETAPE (l'opérateur consolide ce que
  //     l'équipier a saisi sur le terrain — limite déjà respectée à la source)
  //   - Si une photo avec le même id existe déjà → no-op idempotent
  //
  // Utilisé par js/secoursMode.js > _appliquerImportRapportEquipe pour réintégrer
  // les photos d'un rapport .mkmsec.report.json scope=equipe.
  //
  // opts = { id, scenarioId, equipeId, stepIdx, mime, dataUrl }
  function importPhotoFromDataUrl(opts) {
    if (!opts || !opts.id || !opts.scenarioId || !opts.equipeId
        || typeof opts.stepIdx !== "number" || !opts.dataUrl) {
      return Promise.reject(new Error("importPhotoFromDataUrl : id, scenarioId, equipeId, stepIdx, dataUrl tous requis"));
    }
    // Check si déjà présent (idempotence)
    return getPhoto(opts.id).then(function(existing) {
      if (existing) {
        // Photo déjà en base avec cet id → no-op idempotent
        return { id: opts.id, status: "already-present" };
      }
      // Convertit dataUrl → Blob via fetch local (pattern standard navigateur)
      return fetch(opts.dataUrl).then(function(resp) {
        if (!resp.ok) throw new Error("dataUrl invalide (fetch local échoué)");
        return resp.blob();
      }).then(function(blob) {
        const record = {
          id:         opts.id,
          scenarioId: opts.scenarioId,
          equipeId:   opts.equipeId,
          stepIdx:    opts.stepIdx,
          blob:       blob,
          mime:       opts.mime || blob.type || "image/jpeg",
          size:       blob.size,
          createdAt:  Date.now(),
          meta:       { imported: true, sourceScenarioId: opts.sourceScenarioId || null }
        };
        return _tx("readwrite", function(store) {
          return _reqPromise(store.put(record)).then(function() {
            return { id: opts.id, status: "imported" };
          });
        });
      });
    });
  }

  // ============================================================
  // EXPORT API PUBLIQUE
  // ============================================================
  window.MyKTAMapSecoursPhotos = {
    init:                       init,
    isAvailable:                isAvailable,
    generateId:                 generateId,
    compressBlob:               compressBlob,
    addPhoto:                   addPhoto,
    importPhotoFromDataUrl:     importPhotoFromDataUrl,
    getPhoto:                   getPhoto,
    getBlob:                    getBlob,
    getObjectUrl:               getObjectUrl,
    getPhotosForEtape:          getPhotosForEtape,
    getPhotosForEquipe:         getPhotosForEquipe,
    getPhotosForScenario:       getPhotosForScenario,
    countPhotosForEtape:        countPhotosForEtape,
    countPhotosForScenario:     countPhotosForScenario,
    deletePhoto:                deletePhoto,
    setStepIdx:                 setStepIdx,
    deletePhotosForEtape:       deletePhotosForEtape,
    deletePhotosForScenario:    deletePhotosForScenario,
    clearAll:                   clearAll,
    // Constantes exposées pour usage externe (genre afficher le max dans UI)
    MAX_PHOTOS_PER_ETAPE:       MAX_PHOTOS_PER_ETAPE,
    NOTES_LIBRES_STEP_IDX:      NOTES_LIBRES_STEP_IDX
  };

  // Init eager au boot (non-bloquant, juste pour pre-warm la connexion IDB)
  setTimeout(function() {
    if (isAvailable()) {
      init().catch(function() {});  // swallow erreur boot
    }
  }, 0);

})();
