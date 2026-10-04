/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 *
 * MODULE : photos.js (introduit en B1.a — phase B "Enrichissement contenu")
 * =========================================================================
 *
 * Backend de stockage des photos attachées aux POI (Points Of Interest).
 * Stocke les blobs photo en IndexedDB (~50 MB+ disponible sur mobile vs
 * ~5 MB limit du localStorage), avec API asynchrone propre.
 *
 * Architecture :
 *   - 1 Database IndexedDB : "myktamap_photos"
 *   - 1 Object store : "photos" (keyPath = photoId)
 *   - 2 Index :
 *       • "by_plan"       : planId (lookup all photos d'un plan)
 *       • "by_plan_point" : [planId, pointId] (lookup photos d'un POI)
 *
 * Format d'un record :
 *   {
 *     id:        "a1b2c3d4",        // photoId (short UUID-ish)
 *     planId:    "test1",            // plan owner
 *     pointId:   "p1",               // POI owner (= id du point editor)
 *     blob:      Blob,               // binary JPEG/PNG
 *     mime:      "image/jpeg",       // MIME type
 *     size:      234567,             // bytes (= blob.size, cache)
 *     createdAt: 1700000000000,      // Date.now() à l'ajout
 *     meta:      { caption: "..." }  // metadata user optionnelle
 *   }
 *
 * Décisions de design KARMA-validées (B1.a) :
 *   - Source : caméra + galerie (UI géré en B1.b)
 *   - Max 10 photos / POI (garde-fou anti-OOM)
 *   - Compression auto à l'ajout : max 1920 px côté long, JPEG 0.85
 *     → ~200-400 Ko par photo au lieu de 3-5 MB raw smartphone
 *   - Stockage IndexedDB (vs localStorage trop limité)
 *   - Rétrocompat ZIP : dossier photos/ optionnel + champ photoIds
 *     dans editor.json (cf. B1.d pour le code session/ZIP)
 *
 * API publique (window.MyKTAMapPhotos) :
 *   - init()                                → Promise (ouverture IDB)
 *   - addPhoto(planId, pointId, blob, opts) → Promise<photoId>
 *   - getPhoto(photoId)                     → Promise<record | null>
 *   - getBlob(photoId)                      → Promise<Blob | null>
 *   - getObjectUrl(photoId)                 → Promise<string | null>
 *     (créé un blob URL réutilisable, attention à revokeObjectURL après usage)
 *   - getPhotosForPoint(planId, pointId)    → Promise<Array<record>>
 *   - getAllPhotosForPlan(planId)           → Promise<Array<record>>
 *   - countPhotosForPoint(planId, pointId)  → Promise<number>
 *   - countPhotosForPlan(planId)            → Promise<number>
 *   - deletePhoto(photoId)                  → Promise<boolean>
 *   - deletePhotosForPoint(planId, pointId) → Promise<number>
 *   - deletePhotosForPlan(planId)           → Promise<number>
 *   - clearAll()                            → Promise<void> (reset complet)
 *   - compressBlob(blob, opts)              → Promise<Blob> (resize + JPEG)
 *   - generateId()                          → string (photoId neuf)
 *   - isAvailable()                         → boolean (IDB supporté ?)
 *   - getStorageInfo()                      → Promise<{used, quota}> approx.
 *
 * Toutes les fonctions retournent des Promises (asynchrones). Gestion
 * gracieuse des erreurs : on log warn + return null/false/array vide
 * plutôt que de throw, pour ne pas casser le flow UI consommateur.
 * =========================================================================
 */

(function() {
  "use strict";

  const DB_NAME    = "myktamap_photos";
  const DB_VERSION = 1;
  const STORE      = "photos";

  // Limites (anti-OOM, anti-quota)
  // 🆕 v1.9.3-B1b (KARMA "7: 5 par point") : abaissé de 10 → 5 photos par POI.
  // 5 = compromis ergonomie (l'user voit toutes les photos en 1 grille 3 cols
  // sans scroll, soit 1 ligne complète + 1 photo seule sur la 2e ligne) +
  // capacité (5 × 500 Ko ≈ 2.5 Mo par point, raisonnable sur quota mobile
  // de ~50-100 Mo IDB). Si retour terrain veut plus → bump ici + adapter
  // compteur "N/5" et messages dans editor.js.
  const MAX_PHOTOS_PER_POINT  = 5;
  const COMPRESS_MAX_DIMENSION = 1920;  // px côté long après compression
  const COMPRESS_JPEG_QUALITY  = 0.85;  // qualité JPEG (0-1)
  // 🔒 v1.63.0 (A8) : qualité haute pour les photos DÉJÀ petites — elles ne
  // sont plus retournées telles quelles (leur EXIF, dont le GPS, survivait)
  // mais re-encodées sans resize. 0.92 = dégradation imperceptible.
  const COMPRESS_JPEG_QUALITY_SMALL = 0.92;

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
  // 8 caractères hex via crypto.randomUUID si dispo (collisions
  // statistiquement impossibles à cette taille pour notre usage),
  // sinon fallback Math.random.
  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      // crypto.randomUUID retourne 36 chars (UUID v4), on prend les 8 premiers
      // hex de la première section (suffit largement pour différencier les
      // photos d'un même plan).
      return window.crypto.randomUUID().split("-")[0];
    }
    // Fallback : 8 chars hex via Math.random
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  }

  // ============================================================
  // OUVERTURE DE LA DATABASE
  // ============================================================
  // Idempotent : si déjà ouverte, retourne la même promise/db. Sinon
  // ouvre + crée les stores au besoin (onupgradeneeded).
  function init() {
    if (!isAvailable()) {
      console.warn("[Photos] IndexedDB non disponible — module désactivé");
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
          // Index pour lookup rapide par plan
          store.createIndex("by_plan", "planId", { unique: false });
          // Index composé pour lookup par (plan, point)
          store.createIndex("by_plan_point", ["planId", "pointId"], { unique: false });
          console.log("[Photos] Schema IDB créé : store '" + STORE + "' + 2 indexes");
        }
      };

      req.onsuccess = function(e) {
        _db = e.target.result;
        // Gestion de la fermeture propre si le navigateur veut purger
        _db.onclose = function() {
          console.warn("[Photos] IDB connection fermée (système).");
          _db = null;
          _initPromise = null;
        };
        _db.onerror = function(ev) {
          console.warn("[Photos] IDB erreur runtime :", ev.target ? ev.target.error : ev);
        };
        console.log("[Photos] IDB ouverte (" + DB_NAME + " v" + DB_VERSION + ")");
        resolve(_db);
      };

      req.onerror = function(e) {
        console.error("[Photos] IDB ouverture échouée :", e.target ? e.target.error : e);
        _initPromise = null;  // permettre une re-tentative ultérieure
        reject(e.target ? e.target.error : new Error("IDB open failed"));
      };

      req.onblocked = function() {
        console.warn("[Photos] IDB blocked (autre onglet a une vieille version ?)");
      };
    });

    return _initPromise;
  }

  // ============================================================
  // HELPER TRANSACTION
  // ============================================================
  // Wrapper pour exécuter une opération dans une transaction. Reject
  // en cas d'erreur, resolve avec le résultat de `op`.
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
          // Si op retourne une Promise, on attend ; sinon on resolve direct
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

  // Wrap une IDBRequest en Promise pour utilisation à l'intérieur de _tx
  function _reqPromise(req) {
    return new Promise(function(resolve, reject) {
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror   = function(e) { reject(e.target ? e.target.error : new Error("req error")); };
    });
  }

  // ============================================================
  // COMPRESSION D'UN BLOB IMAGE
  // ============================================================
  // Pipeline : Blob → Image → Canvas redimensionné → Blob JPEG compressé.
  // Si la photo source est déjà petite (< maxDim sur les 2 côtés),
  // on garde le blob original pour éviter une recompression destructive.
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

        // 🔒 v1.63.0 (A8) : le bypass « déjà petite → blob original » est
        // SUPPRIMÉ — le blob original peut porter des métadonnées EXIF
        // (dont les coordonnées GPS de la prise de vue !). Toute photo est
        // re-encodée via canvas = strip EXIF garanti (drawImage applique
        // l'orientation EXIF, l'image reste droite). Petite photo → pas de
        // resize, qualité haute (0.92) pour une dégradation imperceptible.
        const petite = (W <= maxDim && H <= maxDim && srcBlob.size < 500 * 1024);
        const q = petite ? Math.max(quality, COMPRESS_JPEG_QUALITY_SMALL) : quality;

        // Calcul du ratio de redimensionnement
        const ratio = Math.min(maxDim / W, maxDim / H, 1);
        const newW = Math.round(W * ratio);
        const newH = Math.round(H * ratio);

        const canvas = document.createElement("canvas");
        canvas.width  = newW;
        canvas.height = newH;
        const ctx = canvas.getContext("2d");
        // Background blanc pour JPEG (sinon transparent → noir en JPEG)
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
  // Retourne le photoId généré. Compression auto sauf opts.skipCompress.
  // Vérifie le quota MAX_PHOTOS_PER_POINT (rejet si dépassé).
  function addPhoto(planId, pointId, srcBlob, opts) {
    opts = opts || {};
    if (!planId || !pointId) {
      return Promise.reject(new Error("addPhoto : planId et pointId requis"));
    }
    if (!srcBlob || !(srcBlob instanceof Blob)) {
      return Promise.reject(new Error("addPhoto : srcBlob doit être un Blob"));
    }

    // Check quota max par point
    return countPhotosForPoint(planId, pointId).then(function(n) {
      if (n >= MAX_PHOTOS_PER_POINT) {
        const err = new Error("Maximum " + MAX_PHOTOS_PER_POINT + " photos par point (déjà " + n + ").");
        err.code = "QUOTA_PER_POINT";
        throw err;
      }

      // Compression (sauf si opts.skipCompress = true ou non-image)
      const isImage = srcBlob.type && srcBlob.type.indexOf("image/") === 0;
      const compressPromise = (opts.skipCompress || !isImage)
        ? Promise.resolve(srcBlob)
        : compressBlob(srcBlob, opts).catch(function(e) {
            console.warn("[Photos] compression échouée, fallback blob original :", e);
            return srcBlob;
          });

      return compressPromise.then(function(finalBlob) {
        const record = {
          id:        generateId(),
          planId:    String(planId),
          pointId:   String(pointId),
          blob:      finalBlob,
          mime:      finalBlob.type || "image/jpeg",
          size:      finalBlob.size,
          createdAt: Date.now(),
          meta:      opts.meta || {}
        };

        return _tx("readwrite", function(store) {
          return _reqPromise(store.add(record)).then(function() {
            console.log("[Photos] add OK :", record.id, "(" + Math.round(finalBlob.size / 1024) + " Ko)");
            // 📔 v1.69.0 — Le Carnet référence les photos PRISES pendant la
            // sortie. Hook posé ici et PAS dans restorePhoto() : réimporter une
            // session ne doit pas gonfler le compteur photos de la sortie
            // en cours (ce sont des photos d'une autre sortie, d'un autre jour).
            if (window.Journal && typeof window.Journal.onPhotoAdded === "function") {
              try { window.Journal.onPhotoAdded(record.id, record.planId, record.pointId); } catch(e) {}
            }
            return record.id;
          });
        });
      });
    }).catch(function(err) {
      // Quota DB navigateur
      if (err && (err.name === "QuotaExceededError" || /quota/i.test(err.message || ""))) {
        // 🌍 i18n : message user localisé côté rendu (editor.js, via err.code).
        // Le texte ci-dessous est un fallback dev-facing, jamais affiché.
        const e = new Error("QUOTA_DEVICE: device storage full");
        e.code = "QUOTA_DEVICE";
        throw e;
      }
      throw err;
    });
  }

  // ============================================================
  // LECTURE
  // ============================================================
  function getPhoto(photoId) {
    if (!photoId) return Promise.resolve(null);
    return _tx("readonly", function(store) {
      return _reqPromise(store.get(photoId)).then(function(rec) {
        return rec || null;
      });
    }).catch(function(e) {
      console.warn("[Photos] getPhoto erreur :", e);
      return null;
    });
  }

  function getBlob(photoId) {
    return getPhoto(photoId).then(function(rec) {
      return rec ? rec.blob : null;
    });
  }

  function getObjectUrl(photoId) {
    return getBlob(photoId).then(function(blob) {
      if (!blob) return null;
      return URL.createObjectURL(blob);
    });
  }

  function getPhotosForPoint(planId, pointId) {
    if (!planId || !pointId) return Promise.resolve([]);
    return _tx("readonly", function(store) {
      const idx = store.index("by_plan_point");
      const range = IDBKeyRange.only([String(planId), String(pointId)]);
      return _reqPromise(idx.getAll(range)).then(function(arr) {
        return Array.isArray(arr) ? arr : [];
      });
    }).catch(function(e) {
      console.warn("[Photos] getPhotosForPoint erreur :", e);
      return [];
    });
  }

  function getAllPhotosForPlan(planId) {
    if (!planId) return Promise.resolve([]);
    return _tx("readonly", function(store) {
      const idx = store.index("by_plan");
      const range = IDBKeyRange.only(String(planId));
      return _reqPromise(idx.getAll(range)).then(function(arr) {
        return Array.isArray(arr) ? arr : [];
      });
    }).catch(function(e) {
      console.warn("[Photos] getAllPhotosForPlan erreur :", e);
      return [];
    });
  }

  function countPhotosForPoint(planId, pointId) {
    if (!planId || !pointId) return Promise.resolve(0);
    return _tx("readonly", function(store) {
      const idx = store.index("by_plan_point");
      const range = IDBKeyRange.only([String(planId), String(pointId)]);
      return _reqPromise(idx.count(range)).then(function(n) {
        return Number.isFinite(n) ? n : 0;
      });
    }).catch(function(e) {
      console.warn("[Photos] countPhotosForPoint erreur :", e);
      return 0;
    });
  }

  function countPhotosForPlan(planId) {
    if (!planId) return Promise.resolve(0);
    return _tx("readonly", function(store) {
      const idx = store.index("by_plan");
      const range = IDBKeyRange.only(String(planId));
      return _reqPromise(idx.count(range)).then(function(n) {
        return Number.isFinite(n) ? n : 0;
      });
    }).catch(function(e) {
      console.warn("[Photos] countPhotosForPlan erreur :", e);
      return 0;
    });
  }

  // ============================================================
  // SUPPRESSION
  // ============================================================
  function deletePhoto(photoId) {
    if (!photoId) return Promise.resolve(false);
    return _tx("readwrite", function(store) {
      return _reqPromise(store.delete(photoId)).then(function() {
        return true;
      });
    }).catch(function(e) {
      console.warn("[Photos] deletePhoto erreur :", e);
      return false;
    });
  }

  function deletePhotosForPoint(planId, pointId) {
    return getPhotosForPoint(planId, pointId).then(function(arr) {
      if (arr.length === 0) return 0;
      return _tx("readwrite", function(store) {
        const promises = arr.map(function(rec) {
          return _reqPromise(store.delete(rec.id));
        });
        return Promise.all(promises).then(function() { return arr.length; });
      });
    }).catch(function(e) {
      console.warn("[Photos] deletePhotosForPoint erreur :", e);
      return 0;
    });
  }

  function deletePhotosForPlan(planId) {
    return getAllPhotosForPlan(planId).then(function(arr) {
      if (arr.length === 0) return 0;
      return _tx("readwrite", function(store) {
        const promises = arr.map(function(rec) {
          return _reqPromise(store.delete(rec.id));
        });
        return Promise.all(promises).then(function() {
          console.log("[Photos] deletePhotosForPlan :", arr.length, "supprimées pour planId=" + planId);
          return arr.length;
        });
      });
    }).catch(function(e) {
      console.warn("[Photos] deletePhotosForPlan erreur :", e);
      return 0;
    });
  }

  // ============================================================
  // RESTORE D'UN RECORD COMPLET (v1.9.3-B1d, pour import session ZIP)
  // ============================================================
  // Cas d'usage : l'user importe un ZIP de session qui contient des
  // photos précédemment exportées avec leurs photoIds. On veut conserver
  // ces ids pour que les `point.photos: [photoId, ...]` continuent de
  // pointer sur les bons records.
  //
  // Contrairement à addPhoto qui génère un nouvel id et compresse, ce
  // helper :
  //   - Préserve l'id du record (donc l'index by_plan_point reste cohérent)
  //   - Bypass la compression (le blob est déjà au format final)
  //   - Bypass le quota MAX_PHOTOS_PER_POINT (le record vient d'un export
  //     déjà accepté par l'user au moment de la création)
  //   - Utilise store.put → upsert (overwrite si id existe déjà)
  //
  // Le `record` doit contenir au moins : {id, planId, pointId, blob}. Les
  // autres champs (mime, size, createdAt, meta) sont passés si présents,
  // sinon valeurs par défaut.
  function restorePhoto(record) {
    if (!record || !record.id || !record.planId || !record.pointId || !record.blob) {
      return Promise.reject(new Error("restorePhoto : record incomplet"));
    }
    const rec = {
      id:        String(record.id),
      planId:    String(record.planId),
      pointId:   String(record.pointId),
      blob:      record.blob,
      mime:      record.mime      || (record.blob.type) || "image/jpeg",
      size:      record.size      || record.blob.size || 0,
      createdAt: record.createdAt || Date.now(),
      meta:      record.meta      || {}
    };
    return _tx("readwrite", function(store) {
      return _reqPromise(store.put(rec)).then(function() {
        return rec.id;
      });
    });
  }

  // ============================================================
  // RENAME / MIGRATION D'UN POINT ID (v1.9.3-B1b)
  // ============================================================
  // Cas d'usage : l'user édite un point qui a des photos et change son
  // nom. Comme `point.id === point.nom` dans l'éditeur (rétro-compat
  // avec tout le reste de l'app), changer le nom = changer l'id = perdre
  // l'association avec les photos IDB indexées sous l'ancien id.
  //
  // Solution : re-tagger en place chaque record IDB du point en swappant
  // pointId via cursor (atomique dans 1 transaction readwrite). Les
  // photoIds individuels ne changent PAS — seul le pointId est mis à
  // jour, donc tout viewer qui aurait gardé un photoId en mémoire
  // continue de marcher.
  //
  // Retourne le nombre de records migrés (0 si rien à faire).
  function renamePointId(planId, oldPointId, newPointId) {
    if (!planId || !oldPointId || !newPointId) {
      return Promise.resolve(0);
    }
    if (oldPointId === newPointId) return Promise.resolve(0);

    return _tx("readwrite", function(store) {
      const idx = store.index("by_plan_point");
      const range = IDBKeyRange.only([String(planId), String(oldPointId)]);
      return new Promise(function(resolve, reject) {
        let count = 0;
        const req = idx.openCursor(range);
        req.onsuccess = function(ev) {
          const cursor = ev.target.result;
          if (!cursor) {
            resolve(count);
            return;
          }
          const rec = cursor.value;
          rec.pointId = String(newPointId);
          const put = cursor.update(rec);
          put.onsuccess = function() {
            count++;
            cursor.continue();
          };
          put.onerror = function() {
            console.warn("[Photos] renamePointId : update échoué pour", rec.id);
            cursor.continue();
          };
        };
        req.onerror = function() {
          reject(req.error);
        };
      });
    }).then(function(n) {
      if (n > 0) console.log("[Photos] renamePointId :", n, "photos migrées",
                              oldPointId, "→", newPointId);
      return n;
    }).catch(function(e) {
      console.warn("[Photos] renamePointId erreur :", e);
      return 0;
    });
  }

  // ============================================================
  // 🆔 v2.3.0 — PHOTOS RATTACHÉES À L'UID DU POINT (ETUDE_UID lot C1)
  // ============================================================
  // Avant : une photo est rangée sous le NOM du point (pointId = nom), qui
  // change au renommage et n'est pas unique. Désormais les nouvelles photos
  // sont rangées sous l'uid du point. Pour ne RIEN casser, la lecture est
  // DOUBLE : une photo appartient à un point si sa clé vaut son uid, OU, à
  // défaut, son nom. Les photos trouvées par le nom portent `_parNom: true`
  // (l'appelant décide si c'est ambigu : plusieurs points du même nom).
  function getPhotosForPointRef(planId, ref) {
    const uid = ref && typeof ref.uid === "string" && ref.uid ? ref.uid : null;
    const nom = ref && ref.id != null && String(ref.id) ? String(ref.id) : null;
    if (!planId || (!uid && !nom)) return Promise.resolve([]);
    const parUid = uid ? getPhotosForPoint(planId, uid) : Promise.resolve([]);
    const parNom = (nom && nom !== uid) ? getPhotosForPoint(planId, nom) : Promise.resolve([]);
    return Promise.all([parUid, parNom]).then(function(r) {
      const vus = new Set(), out = [];
      r[0].forEach(function(rec) { vus.add(rec.id); out.push(rec); });
      r[1].forEach(function(rec) {
        if (vus.has(rec.id)) return;
        vus.add(rec.id);
        rec._parNom = !!uid;   // rangée par nom alors que le point a un uid
        out.push(rec);
      });
      return out;
    });
  }

  // Rattache UNE photo à une clé (geste « C'est ce point », migration).
  // Ne supprime jamais rien : seul `pointId` change.
  function setPhotoPointId(photoId, pointId) {
    if (!photoId || !pointId) return Promise.resolve(false);
    // Lecture et écriture dans les RAPPELS de la requête (pas de .then entre
    // les deux) : la transaction reste active, comme dans renamePointId.
    return _tx("readwrite", function(store) {
      return new Promise(function(resolve, reject) {
        const g = store.get(String(photoId));
        g.onsuccess = function() {
          const rec = g.result;
          if (!rec) { resolve(false); return; }
          rec.pointId = String(pointId);
          const put = store.put(rec);
          put.onsuccess = function() { resolve(true); };
          put.onerror = function() { reject(put.error); };
        };
        g.onerror = function() { reject(g.error); };
      });
    }).catch(function(e) {
      console.warn("[Photos] setPhotoPointId erreur :", e);
      return false;
    });
  }

  // Migration douce, idempotente. `points` = TOUS les points du plan
  // ({ uid?, id }), session ET calques — les points sans uid comptent pour
  // l'ambiguïté. Une photo rangée sous un nom porté par UN SEUL point, qui a
  // un uid, passe sous cet uid. Nom ambigu, point sans uid, aucun point :
  // la photo reste sous le nom (la double lecture la retrouve). 🩸 Jamais de
  // suppression ici. Rend { migrees, ambigues }.
  function migrerPhotosPlan(planId, points) {
    if (!planId || !Array.isArray(points)) return Promise.resolve({ migrees: 0, ambigues: 0 });
    const uids = new Set(), parNom = new Map();
    points.forEach(function(pt) {
      if (!pt) return;
      if (typeof pt.uid === "string" && pt.uid) uids.add(pt.uid);
      const n = pt.id != null ? String(pt.id) : "";
      if (!n) return;
      if (!parNom.has(n)) parNom.set(n, []);
      parNom.get(n).push(pt);
    });
    return getAllPhotosForPlan(planId).then(function(recs) {
      let ambigues = 0;
      const ops = [];
      recs.forEach(function(rec) {
        const cle = String(rec.pointId || "");
        if (!cle || uids.has(cle)) return;
        const c = parNom.get(cle) || [];
        if (c.length === 1 && typeof c[0].uid === "string" && c[0].uid) ops.push(setPhotoPointId(rec.id, c[0].uid));
        else if (c.length > 1) ambigues++;
      });
      return Promise.all(ops).then(function(r) {
        const migrees = r.filter(Boolean).length;
        if (migrees || ambigues) {
          console.log("[Photos] migration v2.3.0 : " + migrees + " photo(s) rattachée(s) à l'uid de leur point" +
                      (ambigues ? ", " + ambigues + " à rattacher (nom porté par plusieurs points)" : ""));
        }
        return { migrees: migrees, ambigues: ambigues };
      });
    }).catch(function(e) {
      console.warn("[Photos] migrerPhotosPlan erreur :", e);
      return { migrees: 0, ambigues: 0 };
    });
  }

  function clearAll() {
    return _tx("readwrite", function(store) {
      return _reqPromise(store.clear()).then(function() {
        console.log("[Photos] clearAll : toutes les photos supprimées");
      });
    }).catch(function(e) {
      console.warn("[Photos] clearAll erreur :", e);
    });
  }

  // ============================================================
  // INFO STOCKAGE (approx)
  // ============================================================
  // navigator.storage.estimate() retourne {usage, quota} en bytes.
  // Ne discrimine pas par origine ni par module — c'est global pour l'app.
  // Utile pour afficher à l'utilisateur "vous utilisez X Mo sur Y Mo".
  function getStorageInfo() {
    if (!navigator.storage || typeof navigator.storage.estimate !== "function") {
      return Promise.resolve(null);
    }
    return navigator.storage.estimate().then(function(est) {
      return {
        used:  est.usage  || 0,
        quota: est.quota  || 0
      };
    }).catch(function() {
      return null;
    });
  }

  // ============================================================
  // CLEANUP AU PLAN SWITCH (hook depuis main.js)
  // ============================================================
  // NOTE : on NE supprime PAS les photos automatiquement quand on change
  // de plan — elles restent en IDB associées à leur planId. Le user les
  // retrouve quand il recharge le plan. La suppression DOIT être
  // explicite (via UI delete photo, "Tout réinitialiser" reset session,
  // ou suppression d'un plan dans PlanRegistry).

  // ============================================================
  // EXPORT GLOBAL
  // ============================================================
  window.MyKTAMapPhotos = {
    init:                    init,
    isAvailable:             isAvailable,
    generateId:              generateId,
    compressBlob:            compressBlob,
    addPhoto:                addPhoto,
    getPhoto:                getPhoto,
    getBlob:                 getBlob,
    getObjectUrl:            getObjectUrl,
    getPhotosForPoint:       getPhotosForPoint,
    getAllPhotosForPlan:     getAllPhotosForPlan,
    countPhotosForPoint:     countPhotosForPoint,
    countPhotosForPlan:      countPhotosForPlan,
    deletePhoto:             deletePhoto,
    deletePhotosForPoint:    deletePhotosForPoint,
    deletePhotosForPlan:     deletePhotosForPlan,
    renamePointId:           renamePointId,
    getPhotosForPointRef:    getPhotosForPointRef,   // 🆔 v2.3.0
    setPhotoPointId:         setPhotoPointId,
    migrerPhotosPlan:        migrerPhotosPlan,
    restorePhoto:            restorePhoto,
    clearAll:                clearAll,
    getStorageInfo:          getStorageInfo,
    // Constantes exposées pour l'UI (B1.b) qui peut afficher les limites
    MAX_PHOTOS_PER_POINT:    MAX_PHOTOS_PER_POINT,
    COMPRESS_MAX_DIMENSION:  COMPRESS_MAX_DIMENSION,
    COMPRESS_JPEG_QUALITY:   COMPRESS_JPEG_QUALITY
  };

  // Init paresseuse : on attend que main.js / un autre module appelle
  // explicitement MyKTAMapPhotos.init() (= lazy load IDB connection).
  // Cohérent avec les autres modules de l'app (config.js, planRegistry).
  console.log("[Photos] Module chargé (init différé, " +
              MAX_PHOTOS_PER_POINT + " photos max/POI, " +
              COMPRESS_MAX_DIMENSION + "px max compress)");
})();
