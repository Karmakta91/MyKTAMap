/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// photos.js — stockage des photos des POI en IndexedDB (myktamap_photos, store photos, keyPath id ;
//   index by_plan [planId] et by_plan_point [planId, pointId]).
// ⚠️ Enregistrement : { id (8 hex), planId, pointId (uid du point, ou son nom), blob, mime, size, createdAt,
//   meta, fiche?: { nom, x, y, niveau, type, maj }, priseLe? }. La fiche RETROUVE le point d'une photo s'il est
//   supprimé (ses photos passent « sans point » dans 🧰 Outils > 📸 Mes photos, js/photosGalerie.js).
// 🔒 Compression à l'ajout (1920 px max, JPEG 0.85, 5 photos max par point) : le canvas retire l'EXIF. `priseLe`
//   ("AAAA-MM-JJTHH:MM:SS", heure locale sans fuseau) = DateTimeOriginal lu AVANT, gardé à côté du fichier.
// ⚠️ Événement `mktm:photos-changees` APRÈS l'écriture : detail = { planId, photoIds, action, source? },
//   action ∈ ajout | suppression | rattachement | fiche ; source "extension" (restorePhoto sans opts.source :
//   ne pas la renvoyer au serveur) | "import" (restauration par l'app).
// 🩸 Les PURGES LOCALES (deletePhotosForPlan, clearAll) n'émettent RIEN : une extension qui les propagerait
//   effacerait les photos de l'équipe.
// Expose window.MyKTAMapPhotos : init, addPhoto, getPhoto, getBlob, getObjectUrl (penser à revokeObjectURL),
//   getPhotosForPoint/Ref, getAllPhotosForPlan, count*, deletePhoto, supprimerPhotos, deletePhotos*,
//   restorePhoto, rattacher, placesPourPoint, listerPlan/listerTout (sans blob), ficheDepuisPoint,
//   majFichesPoints, migrerPhotosPlan, compressBlob, getStorageInfo, getMeta, lireDatePriseVue, priseLeValide.
// Erreurs : warn + null/false/[] plutôt qu'un throw (ne pas casser l'UI).
// Garde-fou : scripts/check-photos.js · Doc : docs/architecture/session-data.md

(function() {
  "use strict";

  const DB_NAME    = "myktamap_photos";
  const DB_VERSION = 1;
  const STORE      = "photos";

  // Limites anti-OOM / anti-quota. 5 photos par point : une grille 3 colonnes sans défilement, ~2,5 Mo par
  // point. Changer la limite = adapter aussi le compteur « N/5 » et les messages d'editor.js.
  const MAX_PHOTOS_PER_POINT  = 5;
  const COMPRESS_MAX_DIMENSION = 1920;  // px côté long après compression
  const COMPRESS_JPEG_QUALITY  = 0.85;  // qualité JPEG (0-1)
  // 🔒 Photos DÉJÀ petites : re-encodées sans redimensionnement (jamais rendues telles quelles : leur EXIF,
  // dont le GPS, survivrait). 0.92 = dégradation imperceptible.
  const COMPRESS_JPEG_QUALITY_SMALL = 0.92;

  // Connexion IDB unique, ouverte une fois.
  let _db = null;
  let _initPromise = null;

  // ── Disponibilité ──
  function isAvailable() {
    return typeof window !== "undefined" &&
           typeof window.indexedDB !== "undefined";
  }

  // ── Identifiant de photo : 8 hex (crypto.randomUUID si dispo, sinon Math.random) ──
  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID().split("-")[0];
    }
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  }

  // ── Ouverture de la base (idempotente, stores créés dans onupgradeneeded) ──
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
          store.createIndex("by_plan", "planId", { unique: false });
          store.createIndex("by_plan_point", ["planId", "pointId"], { unique: false });
          console.log("[Photos] Schema IDB créé : store '" + STORE + "' + 2 indexes");
        }
      };

      req.onsuccess = function(e) {
        _db = e.target.result;
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

  // ── Transaction : reject sur erreur, resolve avec le résultat de `op` (attendu s'il est une Promise) ──
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

  // ── Événement mktm:photos-changees (contrat community ↔ extension) ──
  // Toujours APRÈS la fin de la transaction (dans le .then de _tx) ; un écouteur en erreur ne casse jamais
  // l'écriture.
  const ACTIONS = { ajout: 1, suppression: 1, rattachement: 1, fiche: 1 };
  function _emettre(planId, photoIds, action, source) {
    const ids = (photoIds || []).filter(Boolean).map(String);
    if (!ids.length || !ACTIONS[action]) return;
    const detail = { planId: String(planId || ""), photoIds: ids, action: action };
    if (source) detail.source = source;
    try { window.dispatchEvent(new CustomEvent("mktm:photos-changees", { detail: detail })); }
    catch (e) { console.warn("[Photos] événement photos-changees :", e); }
  }

  // ── Fiche du point ──
  // Forme normalisée, ou null sans coordonnées (impossible de recréer le point).
  function _fiche(f) {
    if (!f || typeof f !== "object") return null;
    const x = Number(f.x), y = Number(f.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      nom:    String(f.nom == null ? "" : f.nom).slice(0, 200),
      x:      x,
      y:      y,
      niveau: Number.isInteger(f.niveau) ? f.niveau : null,
      type:   (typeof f.type === "string" && f.type) ? f.type.slice(0, 80) : null,
      maj:    (typeof f.maj === "number" && Number.isFinite(f.maj)) ? f.maj : Date.now()
    };
  }
  // Fiche d'un point de session ou de calque ({ nom|id, x, y, level, tags }).
  function ficheDepuisPoint(pt) {
    if (!pt || typeof pt !== "object") return null;
    return _fiche({
      nom: pt.nom || pt.id || "",
      x: pt.x, y: pt.y,
      niveau: Number.isInteger(pt.level) ? pt.level : null,
      type: Array.isArray(pt.tags) && pt.tags.length ? String(pt.tags[0]) : null,
      maj: Date.now()
    });
  }
  function _memeFiche(a, b) {
    if (!a || !b) return false;
    return a.nom === b.nom && a.x === b.x && a.y === b.y && a.niveau === b.niveau && a.type === b.type;
  }
  // Ce que rendent listerPlan / listerTout : tout sauf le blob.
  function _sansBlob(rec) {
    return {
      id: rec.id, planId: rec.planId, pointId: rec.pointId, mime: rec.mime,
      size: rec.size || 0, createdAt: rec.createdAt || 0, fiche: rec.fiche || null,
      priseLe: rec.priseLe || null
    };
  }

  // ── Date de prise de vue (EXIF DateTimeOriginal) ──
  // 🔒 Parseur minimal et BORNÉ : octets d'un fichier choisi par l'utilisateur, peut-être tronqué ou forgé. Deux
  // IFD lus au plus (IFD0, puis sous-IFD Exif), aucun saut récursif, chaque lecture vérifiée contre la fin du
  // tampon ; toute incohérence → null. JPEG : marqueurs parcourus jusqu'à l'APP1 « Exif ». Autre format (HEIC…) :
  // recherche de « Exif\0\0 » suivi d'un en-tête TIFF dans la fenêtre lue — au mieux, la date peut manquer.
  const EXIF_FENETRE     = 256 * 1024;   // l'APP1 d'un JPEG tient dans 64 Ko ; marge pour le HEIC
  const EXIF_MAX_ENTREES = 512;

  // "AAAA-MM-JJTHH:MM:SS" plausible → la chaîne ; sinon null.
  function priseLeValide(s) {
    if (typeof s !== "string") return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const a = +m[1], mo = +m[2], j = +m[3], h = +m[4], mi = +m[5], se = +m[6];
    if (a < 1900 || a > 2200 || mo < 1 || mo > 12 || j < 1 || j > 31 || h > 23 || mi > 59 || se > 59) return null;
    return s;
  }

  function _dateTiff(v, base, fin) {
    if (base < 0 || base + 8 > fin) return null;
    const bo = v.getUint16(base);
    let le;
    if (bo === 0x4949) le = true;
    else if (bo === 0x4D4D) le = false;
    else return null;
    if (v.getUint16(base + 2, le) !== 42) return null;

    // Entrées voulues d'un IFD → { tag: { type, n, val } } ; null si l'IFD sort du tampon.
    function lireIfd(off, voulus) {
      const debut = base + off;
      if (off < 8 || debut + 2 > fin) return null;
      const nb = v.getUint16(debut, le);
      if (nb > EXIF_MAX_ENTREES) return null;
      const out = {};
      for (let i = 0; i < nb; i++) {
        const e = debut + 2 + i * 12;
        if (e + 12 > fin) break;
        const tag = v.getUint16(e, le);
        if (voulus.indexOf(tag) < 0) continue;
        out[tag] = { type: v.getUint16(e + 2, le), n: v.getUint32(e + 4, le), val: v.getUint32(e + 8, le) };
      }
      return out;
    }
    // ASCII (type 2) « AAAA:MM:JJ HH:MM:SS\0 » : 20 octets, trop long pour l'entrée → toujours un offset.
    function lireDate(ent) {
      if (!ent || ent.type !== 2 || ent.n < 19 || ent.n > 64) return null;
      const o = base + ent.val;
      if (o + 19 > fin) return null;
      let txt = "";
      for (let k = 0; k < 19; k++) txt += String.fromCodePoint(v.getUint8(o + k));
      const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(txt);
      if (!m) return null;
      return priseLeValide(m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":" + m[6]);
    }

    const ifd0 = lireIfd(v.getUint32(base + 4, le), [0x8769]);
    const ptr = ifd0 && ifd0[0x8769];
    if (!ptr || ptr.type !== 4) return null;
    const exif = lireIfd(ptr.val, [0x9003, 0x9004]);
    if (!exif) return null;
    return lireDate(exif[0x9003]) || lireDate(exif[0x9004]);   // DateTimeOriginal, sinon DateTimeDigitized
  }

  // ArrayBuffer (début du fichier) → "AAAA-MM-JJTHH:MM:SS" ou null. Ne lève jamais.
  function datePriseVueDepuisOctets(buf) {
    try {
      // Étiquette plutôt qu'instanceof : un tampon d'un autre royaume (iframe, vm du garde-fou) reste lisible.
      if (Object.prototype.toString.call(buf) !== "[object ArrayBuffer]") return null;
      const v = new DataView(buf);
      const n = v.byteLength;
      if (n >= 4 && v.getUint16(0) === 0xFFD8) {
        let off = 2;
        while (off + 4 <= n) {
          if (v.getUint8(off) !== 0xFF) return null;
          const mk = v.getUint8(off + 1);
          if (mk === 0xFF) { off++; continue; }                          // octet de remplissage
          if (mk === 0xD9 || mk === 0xDA) return null;                   // fin d'image, début des données
          if ((mk >= 0xD0 && mk <= 0xD7) || mk === 0x01) { off += 2; continue; }
          const lg = v.getUint16(off + 2);
          if (lg < 2) return null;
          if (mk === 0xE1 && lg >= 16 && off + 10 <= n &&
              v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) {
            return _dateTiff(v, off + 10, Math.min(n, off + 2 + lg));
          }
          off += 2 + lg;
        }
        return null;
      }
      for (let i = 0; i + 14 <= n; i++) {
        if (v.getUint32(i) !== 0x45786966 || v.getUint16(i + 4) !== 0) continue;
        const t = v.getUint32(i + 6);
        if (t === 0x49492A00 || t === 0x4D4D002A) return _dateTiff(v, i + 6, n);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // Blob → Promise<"AAAA-MM-JJTHH:MM:SS" | null> : début du fichier seulement, ne rejette jamais.
  function lireDatePriseVue(blob) {
    if (!blob || !(blob instanceof Blob)) return Promise.resolve(null);
    const morceau = blob.slice(0, EXIF_FENETRE);
    const lecture = (typeof morceau.arrayBuffer === "function")
      ? morceau.arrayBuffer()
      : new Promise(function(res, rej) {
          const fr = new FileReader();
          fr.onload = function() { res(fr.result); };
          fr.onerror = function() { rej(fr.error); };
          fr.readAsArrayBuffer(morceau);
        });
    return lecture.then(datePriseVueDepuisOctets).catch(function() { return null; });
  }

  // ── Compression : Blob → Image → canvas redimensionné → JPEG ──
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

        // 🔒 Toute photo est re-encodée par le canvas, même petite : le blob original peut porter l'EXIF
        // (dont le GPS de la prise de vue). drawImage applique l'orientation EXIF, l'image reste droite.
        // Petite photo : pas de redimensionnement, qualité 0.92.
        const petite = (W <= maxDim && H <= maxDim && srcBlob.size < 500 * 1024);
        const q = petite ? Math.max(quality, COMPRESS_JPEG_QUALITY_SMALL) : quality;

        const ratio = Math.min(maxDim / W, maxDim / H, 1);
        const newW = Math.round(W * ratio);
        const newH = Math.round(H * ratio);

        const canvas = document.createElement("canvas");
        canvas.width  = newW;
        canvas.height = newH;
        const ctx = canvas.getContext("2d");
        // Fond blanc pour le JPEG (le transparent deviendrait noir).
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

  // ── Ajouter une photo ──
  // → photoId. Compression sauf opts.skipCompress ; rejet au-delà de MAX_PHOTOS_PER_POINT.
  function addPhoto(planId, pointId, srcBlob, opts) {
    opts = opts || {};
    if (!planId || !pointId) {
      return Promise.reject(new Error("addPhoto : planId et pointId requis"));
    }
    if (!srcBlob || !(srcBlob instanceof Blob)) {
      return Promise.reject(new Error("addPhoto : srcBlob doit être un Blob"));
    }

    return countPhotosForPoint(planId, pointId).then(function(n) {
      if (n >= MAX_PHOTOS_PER_POINT) {
        const err = new Error("Maximum " + MAX_PHOTOS_PER_POINT + " photos par point (déjà " + n + ").");
        err.code = "QUOTA_PER_POINT";
        throw err;
      }

      const isImage = srcBlob.type && srcBlob.type.indexOf("image/") === 0;
      // 🔒 Lue sur le blob D'ORIGINE (le ré-encodé n'a plus d'EXIF), gardée dans l'enregistrement seulement.
      const datePromise = isImage ? lireDatePriseVue(srcBlob) : Promise.resolve(null);
      const compressPromise = (opts.skipCompress || !isImage)
        ? Promise.resolve(srcBlob)
        : compressBlob(srcBlob, opts).catch(function(e) {
            // 🔒 FAIL-CLOSED : le blob d'origine garderait son EXIF (GPS compris). Une image que ce navigateur
            // ne sait pas décoder (fichier tronqué, HEIC hors Safari) est refusée, jamais stockée brute.
            console.warn("[Photos] compression échouée, photo refusée :", e);
            const err = new Error("PHOTO_ILLISIBLE: image not decodable");
            err.code = "PHOTO_ILLISIBLE";
            throw err;
          });

      return Promise.all([compressPromise, datePromise]).then(function(lu) {
        const finalBlob = lu[0];
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
        if (lu[1]) record.priseLe = lu[1];
        const fiche = _fiche(opts.fiche);
        if (fiche) record.fiche = fiche;

        return _tx("readwrite", function(store) {
          return _reqPromise(store.add(record)).then(function() {
            console.log("[Photos] add OK :", record.id, "(" + Math.round(finalBlob.size / 1024) + " Ko)");
            // Le Carnet compte les photos PRISES pendant la sortie : hook ici et PAS dans restorePhoto()
            // (une session réimportée ne doit pas gonfler la sortie en cours).
            if (window.Journal && typeof window.Journal.onPhotoAdded === "function") {
              try { window.Journal.onPhotoAdded(record.id, record.planId, record.pointId); } catch(e) {}
            }
            return record.id;
          });
        }).then(function(id) {
          _emettre(record.planId, [id], "ajout");
          return id;
        });
      });
    }).catch(function(err) {
      if (err && (err.name === "QuotaExceededError" || /quota/i.test(err.message || ""))) {
        // i18n : message localisé au rendu (editor.js, via err.code) ; ce texte n'est jamais affiché.
        const e = new Error("QUOTA_DEVICE: device storage full");
        e.code = "QUOTA_DEVICE";
        throw e;
      }
      throw err;
    });
  }

  // ── Lecture ──
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

  // Métadonnées d'une photo, sans le blob (visionneuse).
  function getMeta(photoId) {
    return getPhoto(photoId).then(function(rec) { return rec ? _sansBlob(rec) : null; });
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

  // ── Suppression ──
  // Suppression VOULUE (geste utilisateur, ou photo retirée de la nouvelle version d'un plan) : émet
  // « suppression », planId lu dans l'enregistrement (même transaction).
  function deletePhoto(photoId) {
    if (!photoId) return Promise.resolve(false);
    let planId = null;
    return _tx("readwrite", function(store) {
      return new Promise(function(resolve, reject) {
        const g = store.get(photoId);
        g.onsuccess = function() {
          if (g.result) planId = g.result.planId;
          const d = store.delete(photoId);
          d.onsuccess = function() { resolve(true); };
          d.onerror = function() { reject(d.error); };
        };
        g.onerror = function() { reject(g.error); };
      });
    }).then(function(ok) {
      if (planId !== null) _emettre(planId, [photoId], "suppression");
      return ok;
    }).catch(function(e) {
      console.warn("[Photos] deletePhoto erreur :", e);
      return false;
    });
  }

  // Plusieurs photos, une transaction, un événement par plan → nombre supprimé.
  function supprimerPhotos(photoIds) {
    const ids = (Array.isArray(photoIds) ? photoIds : []).filter(Boolean).map(String);
    if (!ids.length) return Promise.resolve(0);
    const parPlan = {};
    return _tx("readwrite", function(store) {
      return Promise.all(ids.map(function(id) {
        return _reqPromise(store.get(id)).then(function(rec) {
          if (!rec) return 0;
          (parPlan[rec.planId] = parPlan[rec.planId] || []).push(id);
          return _reqPromise(store.delete(id)).then(function() { return 1; });
        });
      })).then(function(r) { return r.reduce(function(a, b) { return a + b; }, 0); });
    }).then(function(n) {
      Object.keys(parPlan).forEach(function(p) { _emettre(p, parPlan[p], "suppression"); });
      return n;
    }).catch(function(e) {
      console.warn("[Photos] supprimerPhotos erreur :", e);
      return 0;
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
      }).then(function(n) {
        _emettre(planId, arr.map(function(r) { return r.id; }), "suppression");
        return n;
      });
    }).catch(function(e) {
      console.warn("[Photos] deletePhotosForPoint erreur :", e);
      return 0;
    });
  }

  // 🩸 PURGE LOCALE (plan retiré de l'appareil, déconnexion) : AUCUN événement (cf en-tête). Le réimport de
  // session ne purge pas (fusion).
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

  // ── Restauration d'un enregistrement complet (import de session, plan ZIP, profil, extension) ──
  // Les `point.photos: [photoId]` doivent continuer à pointer juste : contrairement à addPhoto, on garde
  // l'id, sans compression ni quota (déjà acceptés à la création), en store.put (upsert).
  // `record` : au minimum {id, planId, pointId, blob} ; mime, size, createdAt, meta par défaut ; `fiche` et
  // `priseLe` gardés si valides.
  // opts.source : "extension" PAR DÉFAUT (une extension dépose une photo reçue et ne doit pas la renvoyer) ;
  // l'app passe { source: "import" } ; le réimport de session ajoute { siAbsente }.
  function restorePhoto(record, opts) {
    if (!record || !record.id || !record.planId || !record.pointId || !record.blob) {
      return Promise.reject(new Error("restorePhoto : record incomplet"));
    }
    const source = (opts && typeof opts.source === "string" && opts.source) ? opts.source : "extension";
    const rec = {
      id:        String(record.id),
      planId:    String(record.planId),
      pointId:   String(record.pointId),
      blob:      record.blob,
      mime:      record.mime      || (record.blob.type) || "image/jpeg",
      size:      record.size      || record.blob.size || 0,
      createdAt: (Number.isFinite(record.createdAt) && record.createdAt > 0) ? record.createdAt : Date.now(),
      meta:      record.meta      || {}
    };
    const fiche = _fiche(record.fiche);
    if (fiche) rec.fiche = fiche;
    const priseLe = priseLeValide(record.priseLe);
    if (priseLe) rec.priseLe = priseLe;
    // opts.siAbsente (réimport = FUSION) : une photo déjà en base (même id, tout plan) n'est PAS réécrite —
    // elle a pu être rattachée ou recevoir une fiche plus récente. Lecture et écriture dans les rappels :
    // une seule transaction. → Promise<id> si écrite, Promise<null> sinon (aucun événement).
    if (opts && opts.siAbsente) {
      return _tx("readwrite", function(store) {
        return new Promise(function(resolve, reject) {
          const g = store.get(rec.id);
          g.onsuccess = function() {
            if (g.result) { resolve(null); return; }
            const put = store.put(rec);
            put.onsuccess = function() { resolve(rec.id); };
            put.onerror = function() { reject(put.error); };
          };
          g.onerror = function() { reject(g.error); };
        });
      }).then(function(id) {
        if (id) _emettre(rec.planId, [id], "ajout", source);
        return id;
      });
    }
    return _tx("readwrite", function(store) {
      return _reqPromise(store.put(rec)).then(function() {
        return rec.id;
      });
    }).then(function(id) {
      _emettre(rec.planId, [id], "ajout", source);
      return id;
    });
  }

  // ── Renommer l'id d'un point ──
  // `point.id === point.nom` dans l'éditeur : renommer le point = changer l'id = perdre ses photos.
  // Chaque enregistrement est re-tagué en place par curseur (une transaction readwrite) ; les photoIds ne
  // changent PAS (un viewer qui en garde un continue de marcher). → nombre migré.
  function renamePointId(planId, oldPointId, newPointId) {
    if (!planId || !oldPointId || !newPointId) {
      return Promise.resolve(0);
    }
    if (oldPointId === newPointId) return Promise.resolve(0);

    const migres = [];
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
            migres.push(rec.id);
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
      _emettre(planId, migres, "rattachement");
      return n;
    }).catch(function(e) {
      console.warn("[Photos] renamePointId erreur :", e);
      return 0;
    });
  }

  // ── Photos rattachées à l'uid du point ──
  // Les nouvelles photos sont rangées sous l'uid du point ; les anciennes sous son NOM (instable, non
  // unique). Lecture DOUBLE : clé = uid, OU à défaut nom ; celles trouvées par le nom portent `_parNom: true`
  // (l'appelant juge l'ambiguïté : plusieurs points du même nom). Doc : docs/ETUDE_UID.md
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

  // Rattache des photos à une clé dans UNE transaction : lecture et écriture dans les RAPPELS (pas de .then
  // entre les deux, la transaction resterait inactive). `planId` limite au plan, `fiche` remplace la fiche.
  // Ne supprime jamais rien. → Promise<[{ id, planId }]> modifiées.
  function _poserPointId(photoIds, pointId, planId, fiche) {
    const ids = (photoIds || []).filter(Boolean).map(String);
    if (!ids.length || !pointId) return Promise.resolve([]);
    const faits = [];
    return _tx("readwrite", function(store) {
      return Promise.all(ids.map(function(id) {
        return new Promise(function(resolve, reject) {
          const g = store.get(id);
          g.onsuccess = function() {
            const rec = g.result;
            if (!rec || (planId && rec.planId !== String(planId))) { resolve(); return; }
            rec.pointId = String(pointId);
            if (fiche) rec.fiche = fiche;
            const put = store.put(rec);
            put.onsuccess = function() { faits.push({ id: rec.id, planId: rec.planId }); resolve(); };
            put.onerror = function() { reject(put.error); };
          };
          g.onerror = function() { reject(g.error); };
        });
      }));
    }).then(function() { return faits; });
  }
  function _emettreParPlan(faits, action) {
    const parPlan = {};
    faits.forEach(function(f) { (parPlan[f.planId] = parPlan[f.planId] || []).push(f.id); });
    Object.keys(parPlan).forEach(function(p) { _emettre(p, parPlan[p], action); });
  }

  // UNE photo (« C'est ce point », migration) : seul `pointId` change.
  function setPhotoPointId(photoId, pointId) {
    if (!photoId || !pointId) return Promise.resolve(false);
    return _poserPointId([photoId], pointId, null, null).then(function(faits) {
      _emettreParPlan(faits, "rattachement");
      return faits.length > 0;
    }).catch(function(e) {
      console.warn("[Photos] setPhotoPointId erreur :", e);
      return false;
    });
  }

  // ⚠️ Contrat : rattache des photos d'un plan à un point (uid, ou nom à défaut) et pose sa fiche ; seules les
  // photos de CE plan sont touchées. → Promise<number>.
  function rattacher(photoIds, planId, pointId, fiche) {
    if (!planId || !pointId) return Promise.resolve(0);
    return _poserPointId(photoIds, pointId, String(planId), _fiche(fiche)).then(function(faits) {
      if (faits.length) console.log("[Photos] rattacher :", faits.length, "photo(s) →", pointId);
      _emettreParPlan(faits, "rattachement");
      return faits.length;
    }).catch(function(e) {
      console.warn("[Photos] rattacher erreur :", e);
      return 0;
    });
  }

  // Le point `ref` ({ uid, id }) peut-il recevoir ces photos sans dépasser MAX_PHOTOS_PER_POINT ? Lecture
  // double ; les photos déjà sur ce point ne comptent pas deux fois. Ne refuse que l'AJOUT : un point déjà
  // au-delà garde tout. → Promise<{ ok, deja, ajout, max, libres }> ; la galerie refuse et explique si !ok.
  function placesPourPoint(planId, ref, photoIds) {
    const ids = (Array.isArray(photoIds) ? photoIds : []).filter(Boolean).map(String);
    return getPhotosForPointRef(planId, ref).then(function(deja) {
      const dejaIds = new Set(deja.map(function(r) { return String(r.id); }));
      const ajout = ids.filter(function(id) { return !dejaIds.has(id); }).length;
      const n = dejaIds.size;
      return {
        ok: ajout === 0 || n + ajout <= MAX_PHOTOS_PER_POINT,
        deja: n, ajout: ajout, max: MAX_PHOTOS_PER_POINT,
        libres: Math.max(0, MAX_PHOTOS_PER_POINT - n)
      };
    });
  }

  // Liste SANS blob (galerie, extension, comptages).
  function listerPlan(planId) {
    return getAllPhotosForPlan(planId).then(function(arr) { return arr.map(_sansBlob); });
  }
  function listerTout() {
    return _tx("readonly", function(store) {
      return _reqPromise(store.getAll()).then(function(arr) {
        return (Array.isArray(arr) ? arr : []).map(_sansBlob);
      });
    }).catch(function(e) {
      console.warn("[Photos] listerTout erreur :", e);
      return [];
    });
  }

  // Remet à jour la fiche des photos de ces points (éditeur, tableau, suppression). Lecture double ; une clé
  // de nom portée par PLUSIEURS points de la liste n'est pas touchée (on ne devine pas). Le dernier point
  // d'une clé gagne ; seules les fiches qui CHANGENT sont écrites. → Promise<number>.
  function majFichesPoints(planId, points) {
    if (!planId || !Array.isArray(points) || !points.length) return Promise.resolve(0);
    const parUid = new Map(), parNom = new Map(), nomsVus = new Map();
    points.forEach(function(pt) {
      if (!pt) return;
      if (typeof pt.uid === "string" && pt.uid) parUid.set(pt.uid, pt);
      const n = pt.id != null ? String(pt.id) : "";
      if (!n) return;
      // Un même point passé deux fois (avant / après) n'est pas une ambiguïté.
      const cle = pt.uid || ("#" + n + "@" + pt.x + "," + pt.y);
      if (!nomsVus.has(n)) nomsVus.set(n, new Set());
      nomsVus.get(n).add(cle);
      parNom.set(n, pt);
    });
    const faits = [];
    return _tx("readwrite", function(store) {
      const idx = store.index("by_plan");
      return new Promise(function(resolve, reject) {
        const req = idx.openCursor(IDBKeyRange.only(String(planId)));
        req.onsuccess = function(ev) {
          const cursor = ev.target.result;
          if (!cursor) { resolve(); return; }
          const rec = cursor.value;
          const cle = String(rec.pointId || "");
          let pt = parUid.get(cle) || null;
          if (!pt && parNom.has(cle) && nomsVus.get(cle).size === 1) pt = parNom.get(cle);
          const f = pt ? ficheDepuisPoint(pt) : null;
          if (!f || _memeFiche(f, rec.fiche)) { cursor.continue(); return; }
          rec.fiche = f;
          const put = cursor.update(rec);
          put.onsuccess = function() { faits.push(rec.id); cursor.continue(); };
          put.onerror = function() { cursor.continue(); };
        };
        req.onerror = function() { reject(req.error); };
      });
    }).then(function() {
      _emettre(planId, faits, "fiche");
      return faits.length;
    }).catch(function(e) {
      console.warn("[Photos] majFichesPoints erreur :", e);
      return 0;
    });
  }

  // Photos d'un plan passées sous un autre id (copie locale remplacée par sa version publiée) → nombre.
  function changerPlan(ancienId, nouveauId) {
    if (!ancienId || !nouveauId || ancienId === nouveauId) return Promise.resolve(0);
    return getAllPhotosForPlan(ancienId).then(function(recs) {
      if (!recs.length) return 0;
      return _tx("readwrite", function(store) {
        return Promise.all(recs.map(function(rec) {
          rec.planId = String(nouveauId);
          return _reqPromise(store.put(rec));
        })).then(function() { return recs.length; });
      }).then(function(n) {
        _emettre(nouveauId, recs.map(function(r) { return r.id; }), "rattachement");
        return n;
      });
    }).catch(function(e) {
      console.warn("[Photos] changerPlan erreur :", e);
      return 0;
    });
  }

  // Migration douce, idempotente. `points` = TOUS les points du plan ({ uid?, id }), session ET calques (les
  // points sans uid comptent pour l'ambiguïté). Photo rangée sous un nom porté par UN SEUL point qui a un
  // uid → passe sous cet uid ; sinon elle reste (la double lecture la retrouve). 🩸 Jamais de suppression.
  // → { migrees, ambigues }.
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
        if (c.length === 1 && typeof c[0].uid === "string" && c[0].uid) ops.push(_poserPointId([rec.id], c[0].uid, null, null));
        else if (c.length > 1) ambigues++;
      });
      return Promise.all(ops).then(function(r) {
        const faits = [].concat.apply([], r);
        _emettreParPlan(faits, "rattachement");   // un seul événement pour toute la passe
        const migrees = faits.length;
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

  // 🩸 PURGE LOCALE (réinitialisation, import de profil) : AUCUN événement.
  function clearAll() {
    return _tx("readwrite", function(store) {
      return _reqPromise(store.clear()).then(function() {
        console.log("[Photos] clearAll : toutes les photos supprimées");
      });
    }).catch(function(e) {
      console.warn("[Photos] clearAll erreur :", e);
    });
  }

  // ── Stockage : navigator.storage.estimate() (global à l'origine, pas par module) ──
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

  // ⚠️ Changer de plan ne supprime PAS les photos (elles restent sous leur planId) : la suppression est
  // toujours explicite (UI, « Tout réinitialiser », suppression d'un plan du registre).

  // ── Export global ──
  window.MyKTAMapPhotos = {
    init:                    init,
    isAvailable:             isAvailable,
    generateId:              generateId,
    compressBlob:            compressBlob,
    addPhoto:                addPhoto,
    getPhoto:                getPhoto,
    getMeta:                 getMeta,
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
    getPhotosForPointRef:    getPhotosForPointRef,
    setPhotoPointId:         setPhotoPointId,
    changerPlan:             changerPlan,
    migrerPhotosPlan:        migrerPhotosPlan,
    restorePhoto:            restorePhoto,
    // Contrat community ↔ extension
    listerPlan:              listerPlan,
    listerTout:              listerTout,
    rattacher:               rattacher,
    placesPourPoint:         placesPourPoint,   // limite de 5 au rattachement
    supprimerPhotos:         supprimerPhotos,
    ficheDepuisPoint:        ficheDepuisPoint,
    majFichesPoints:         majFichesPoints,
    clearAll:                clearAll,
    getStorageInfo:          getStorageInfo,
    // Date de prise de vue (EXIF) : lecture du fichier d'origine, des octets (garde-fou), validation.
    lireDatePriseVue:        lireDatePriseVue,
    datePriseVueDepuisOctets: datePriseVueDepuisOctets,
    priseLeValide:           priseLeValide,
    // Constantes pour l'UI (limites affichées).
    MAX_PHOTOS_PER_POINT:    MAX_PHOTOS_PER_POINT,
    COMPRESS_MAX_DIMENSION:  COMPRESS_MAX_DIMENSION,
    COMPRESS_JPEG_QUALITY:   COMPRESS_JPEG_QUALITY
  };

  // Init paresseuse : MyKTAMapPhotos.init() est appelé explicitement (comme config.js, planRegistry).
  console.log("[Photos] Module chargé (init différé, " +
              MAX_PHOTOS_PER_POINT + " photos max/POI, " +
              COMPRESS_MAX_DIMENSION + "px max compress)");
})();
