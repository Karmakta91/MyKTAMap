/*!
 * MyKTAMap — User Profile (surnom + avatar)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// USERPROFILE.JS — Mini profil utilisateur local (depuis v1.21.0 Karma_dev)
// =========================
// Stocke un surnom + une photo (optionnelle) dans une IDB dédiée.
// Affiché dans un bandeau en-tête du loader (au-dessus de "Mes plans") :
//   - Avatar (photo SI uploadée, sinon initiale du surnom dans cercle coloré
//     déterministe via hash du surnom)
//   - Surnom (cliquable pour éditer)
//   - Bouton ⚙️ Détails qui ouvre la modale complète
//
// RÉTRO-COMPAT : profil par défaut = { surnom: "", photoBlob: null }.
// Aucun user existant n'est forcé de configurer. L'avatar default 👤 reste
// affiché tant que rien n'est touché.
//
// STORAGE :
//   IDB `myktamap_profile` v1, store `profile`, keyPath `id`.
//   Entry unique avec id="me" : { id, surnom, photoBlob, photoMime,
//   createdAt, updatedAt }.
//
// PHOTO :
//   Compression auto au upload via canvas (max 512px côté long, JPEG q88).
//   Affichage via Blob URL créée à la demande (révoquée au cleanup pour
//   éviter les leaks). Pas de cache permanent — getPhotoObjectUrl() crée
//   une nouvelle URL à chaque appel, caller doit revoke après usage.
//
// EXPORT/IMPORT :
//   Inclus automatiquement dans le ProfileExportImport (section "user"
//   ajoutée au payload). Photo profil en base64 (JSON) ou fichier dédié
//   (ZIP). Voir profileExportImport.js pour les détails du roundtrip.
//
// API : window.UserProfile = {
//   init(),                            // boot async, lit l'IDB
//   get(),                             // sync, retourne snapshot in-memory
//   getPhotoObjectUrl(),               // async, retourne URL Blob ou null
//   setSurnom(string),                 // async, persiste + notify
//   setPhoto(File|Blob),               // async, compress + persiste + notify
//   removePhoto(),                     // async, supprime photo + notify
//   clear(),                           // async, reset complet
//   onChange(cb),                      // subscribe aux changements
//   getInitial(surnom),                // helper "Karma" → "K"
//   getAvatarColor(surnom),            // helper hash → couleur palette
//   PALETTE                            // const exposée pour cohérence UI
// };
// =========================

(function() {
  "use strict";

  const DB_NAME    = "myktamap_profile";
  const DB_VERSION = 1;
  const STORE_NAME = "profile";
  const ENTRY_ID   = "me";

  const MAX_DIMENSION_PX = 512;
  const JPEG_QUALITY     = 0.88;

  // Palette charte — couleurs vives à fond doux pour l'avatar default.
  // Choix déterministe via hash du surnom (même surnom → même couleur,
  // toujours). 10 couleurs pour couvrir une bonne diversité visuelle.
  const PALETTE = [
    { bg: "#f4c542", fg: "#1a1f2e" },  // doré charte (accent principal)
    { bg: "#8cb4ff", fg: "#0a0d18" },  // bleu charte
    { bg: "#ff8c8c", fg: "#1a1f2e" },  // rouge doux
    { bg: "#6ee287", fg: "#0a0d18" },  // vert
    { bg: "#ff4ecb", fg: "#1a1f2e" },  // magenta (jonction)
    { bg: "#00d4ff", fg: "#0a0d18" },  // cyan (itinéraire)
    { bg: "#c9b88f", fg: "#1a1f2e" },  // brun-beige (thème clair)
    { bg: "#ffb380", fg: "#1a1f2e" },  // orange warning
    { bg: "#a78bfa", fg: "#0a0d18" },  // violet
    { bg: "#34d399", fg: "#0a0d18" }   // turquoise
  ];

  // ───────── ÉTAT IN-MEMORY ─────────

  let _state = {
    surnom:     "",
    hasPhoto:   false,
    photoMime:  null,
    createdAt:  null,
    updatedAt:  null
  };
  let _initialized = false;
  const _listeners = [];

  // ───────── HELPERS HASH / PALETTE ─────────

  // djb2 — robuste pour produire un index déterministe à partir d'un string.
  function _djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return Math.abs(h | 0);
  }

  function getInitial(surnom) {
    if (!surnom || typeof surnom !== "string") return "?";
    const trimmed = surnom.trim();
    if (!trimmed) return "?";
    // Prend la première lettre (gère emoji simple via spread Array)
    const chars = Array.from(trimmed);
    return chars[0].toUpperCase();
  }

  function getAvatarColor(surnom) {
    if (!surnom || typeof surnom !== "string" || !surnom.trim()) {
      return PALETTE[0]; // fallback doré charte
    }
    const idx = _djb2(surnom.trim().toLowerCase()) % PALETTE.length;
    return PALETTE[idx];
  }

  // ───────── IDB UTILS ─────────

  function _openDb() {
    return new Promise(function(resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error); };
    });
  }

  async function _readEntry() {
    let db;
    try { db = await _openDb(); } catch(e) { return null; }
    return new Promise(function(resolve) {
      try {
        const tx = db.transaction([STORE_NAME], "readonly");
        const st = tx.objectStore(STORE_NAME);
        const req = st.get(ENTRY_ID);
        req.onsuccess = function() {
          resolve(req.result || null);
          try { db.close(); } catch(e) {}
        };
        req.onerror = function() {
          resolve(null);
          try { db.close(); } catch(e) {}
        };
      } catch(e) {
        resolve(null);
        try { db.close(); } catch(e2) {}
      }
    });
  }

  async function _writeEntry(entry) {
    const db = await _openDb();
    return new Promise(function(resolve, reject) {
      try {
        const tx = db.transaction([STORE_NAME], "readwrite");
        const st = tx.objectStore(STORE_NAME);
        const req = st.put(entry);
        req.onsuccess = function() {
          resolve(true);
          try { db.close(); } catch(e) {}
        };
        req.onerror = function() {
          reject(req.error);
          try { db.close(); } catch(e) {}
        };
      } catch(e) {
        reject(e);
        try { db.close(); } catch(e2) {}
      }
    });
  }

  async function _deleteEntry() {
    const db = await _openDb();
    return new Promise(function(resolve) {
      try {
        const tx = db.transaction([STORE_NAME], "readwrite");
        const st = tx.objectStore(STORE_NAME);
        const req = st.delete(ENTRY_ID);
        req.onsuccess = function() {
          resolve(true);
          try { db.close(); } catch(e) {}
        };
        req.onerror = function() {
          resolve(false);
          try { db.close(); } catch(e) {}
        };
      } catch(e) {
        resolve(false);
        try { db.close(); } catch(e2) {}
      }
    });
  }

  // ───────── COMPRESSION PHOTO ─────────

  function _compressImageToBlob(fileOrBlob) {
    return new Promise(function(resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(fileOrBlob);
      img.onload = function() {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { reject(new Error(window.I18n.t("profile.err.dimsNull"))); return; }
        // Resize si nécessaire (côté long ≤ MAX_DIMENSION_PX)
        const maxDim = Math.max(w, h);
        if (maxDim > MAX_DIMENSION_PX) {
          const ratio = MAX_DIMENSION_PX / maxDim;
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function(blob) {
          if (!blob) { reject(new Error(window.I18n.t("profile.err.toBlobNull"))); return; }
          resolve(blob);
        }, "image/jpeg", JPEG_QUALITY);
      };
      img.onerror = function() {
        URL.revokeObjectURL(url);
        reject(new Error(window.I18n.t("profile.err.loadFailed")));
      };
      img.src = url;
    });
  }

  // ───────── API PUBLIQUE ─────────

  async function init() {
    if (_initialized) return _stateSnapshot();
    try {
      const entry = await _readEntry();
      if (entry) {
        _state.surnom    = (typeof entry.surnom === "string") ? entry.surnom : "";
        _state.hasPhoto  = !!entry.photoBlob;
        _state.photoMime = entry.photoMime || null;
        _state.createdAt = entry.createdAt || null;
        _state.updatedAt = entry.updatedAt || null;
      }
    } catch(e) {
      console.warn("[UserProfile] init() IDB lecture échouée :", e);
    }
    _initialized = true;
    return _stateSnapshot();
  }

  function _stateSnapshot() {
    return {
      surnom:    _state.surnom,
      hasPhoto:  _state.hasPhoto,
      photoMime: _state.photoMime,
      createdAt: _state.createdAt,
      updatedAt: _state.updatedAt
    };
  }

  function get() {
    return _stateSnapshot();
  }

  async function getPhotoBlob() {
    if (!_state.hasPhoto) return null;
    try {
      const entry = await _readEntry();
      if (entry && entry.photoBlob) return entry.photoBlob;
    } catch(e) {
      console.warn("[UserProfile] getPhotoBlob() échec :", e);
    }
    return null;
  }

  async function getPhotoObjectUrl() {
    const blob = await getPhotoBlob();
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  async function setSurnom(surnom) {
    if (!_initialized) await init();
    const s = (surnom == null) ? "" : String(surnom).trim().slice(0, 40);
    const entry = (await _readEntry()) || { id: ENTRY_ID, createdAt: new Date().toISOString() };
    entry.surnom    = s;
    entry.updatedAt = new Date().toISOString();
    if (!entry.createdAt) entry.createdAt = entry.updatedAt;
    await _writeEntry(entry);
    _state.surnom    = s;
    _state.updatedAt = entry.updatedAt;
    if (!_state.createdAt) _state.createdAt = entry.createdAt;
    _notify();
    return true;
  }

  async function setPhoto(fileOrBlob) {
    if (!_initialized) await init();
    if (!fileOrBlob) throw new Error("Aucune image fournie");
    // Limite raisonnable d'entrée brute (50 MB) pour éviter de crasher
    // le compresseur sur une image RAW gigantesque.
    if (fileOrBlob.size > 50 * 1024 * 1024) {
      throw new Error(window.I18n.t("profile.err.tooLarge"));
    }
    const compressed = await _compressImageToBlob(fileOrBlob);
    const entry = (await _readEntry()) || { id: ENTRY_ID, surnom: "", createdAt: new Date().toISOString() };
    entry.photoBlob = compressed;
    entry.photoMime = "image/jpeg";
    entry.updatedAt = new Date().toISOString();
    if (!entry.createdAt) entry.createdAt = entry.updatedAt;
    await _writeEntry(entry);
    _state.hasPhoto  = true;
    _state.photoMime = "image/jpeg";
    _state.updatedAt = entry.updatedAt;
    if (!_state.createdAt) _state.createdAt = entry.createdAt;
    _notify();
    return { ok: true, size: compressed.size };
  }

  async function removePhoto() {
    if (!_initialized) await init();
    const entry = await _readEntry();
    if (!entry) return false;
    delete entry.photoBlob;
    delete entry.photoMime;
    entry.updatedAt = new Date().toISOString();
    await _writeEntry(entry);
    _state.hasPhoto  = false;
    _state.photoMime = null;
    _state.updatedAt = entry.updatedAt;
    _notify();
    return true;
  }

  async function clear() {
    await _deleteEntry();
    _state.surnom    = "";
    _state.hasPhoto  = false;
    _state.photoMime = null;
    _state.createdAt = null;
    _state.updatedAt = null;
    _notify();
    return true;
  }

  function onChange(cb) {
    if (typeof cb !== "function") return function() {};
    _listeners.push(cb);
    return function() {
      const i = _listeners.indexOf(cb);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  function _notify() {
    const snap = _stateSnapshot();
    _listeners.forEach(function(cb) {
      try { cb(snap); } catch(e) {}
    });
  }

  // ───────── EXPORT GLOBAL ─────────

  window.UserProfile = {
    init:               init,
    get:                get,
    getPhotoBlob:       getPhotoBlob,
    getPhotoObjectUrl:  getPhotoObjectUrl,
    setSurnom:          setSurnom,
    setPhoto:           setPhoto,
    removePhoto:        removePhoto,
    clear:              clear,
    onChange:           onChange,
    getInitial:         getInitial,
    getAvatarColor:     getAvatarColor,
    PALETTE:            PALETTE,
    DB_NAME:            DB_NAME
  };

  console.log("[UserProfile] Module chargé (DB " + DB_NAME + " v" + DB_VERSION + ")");
})();
