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
    updatedAt:  null,
    // 🖼️ v1.74.0 — fond d'écran du HOME (cf. bloc dédié en bas de fichier)
    hasWallpaper: false,
    wallVoile:    55,
    wallPosX:     50,
    wallPosY:     50,
    wallFit:      "cover"
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

  // 🖼️ v1.74.0 — compresseur partagé avatar / fond d'écran. Le passage par
  // canvas STRIPPE L'EXIF, ce qui compte doublement pour un fond d'écran :
  // c'est souvent une photo perso qui embarque les coordonnées GPS de prise
  // de vue.
  //
  // `opts` : un NOMBRE = plafond sur le côté long (cas avatar, historique),
  //          ou { maxLong, maxShort }.
  //
  // ⚠️ POURQUOI UN PLAFOND SUR LE CÔTÉ COURT (constat KARMA sur la vue
  // mobile) : en portrait, avec `background-size: cover`, c'est le côté
  // COURT de l'image qui doit couvrir la HAUTEUR de l'écran. Plafonner le
  // côté long garantit donc la mauvaise dimension — une photo 1920×1080 sur
  // un téléphone (390×844 @DPR3) se retrouve agrandie ×2,3 et visiblement
  // molle. En bornant le côté court à 1440, le portrait reste net ; le côté
  // long garde son propre plafond pour qu'un panorama ne devienne pas un
  // fichier démesuré. On ne SUR-échantillonne jamais (ratio plafonné à 1).
  function _compressImageToBlob(fileOrBlob, opts) {
    let maxLong  = MAX_DIMENSION_PX;
    let maxShort = 0;                       // 0 = pas de contrainte (avatar)
    if (Number.isFinite(opts) && opts > 0) {
      maxLong = opts;
    } else if (opts && typeof opts === "object") {
      if (Number.isFinite(opts.maxLong)  && opts.maxLong  > 0) maxLong  = opts.maxLong;
      if (Number.isFinite(opts.maxShort) && opts.maxShort > 0) maxShort = opts.maxShort;
    }
    return new Promise(function(resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(fileOrBlob);
      img.onload = function() {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { reject(new Error(window.I18n.t("profile.err.dimsNull"))); return; }
        const cotéLong  = Math.max(w, h);
        const cotéCourt = Math.min(w, h);
        // Le ratio le PLUS restrictif gagne, et jamais d'agrandissement.
        let ratio = Math.min(
          maxLong / cotéLong,
          maxShort > 0 ? (maxShort / cotéCourt) : Infinity,
          1
        );
        if (ratio < 1) {
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
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
        // 🖼️ v1.74.0 — fond d'écran. `wallVoile` absent = profil antérieur
        // au fond d'écran → on garde le défaut, jamais 0 (0 = image nue,
        // ce serait illisible sur une entrée qui n'a même pas d'image).
        _state.hasWallpaper = !!entry.wallBlob;
        if (Number.isFinite(entry.wallVoile)) _state.wallVoile = entry.wallVoile;
        if (Number.isFinite(entry.wallPosX))  _state.wallPosX  = entry.wallPosX;
        if (Number.isFinite(entry.wallPosY))  _state.wallPosY  = entry.wallPosY;
        if (typeof entry.wallFit === "string")  _state.wallFit   = entry.wallFit;
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
      updatedAt: _state.updatedAt,
      hasWallpaper: _state.hasWallpaper,
      wallVoile:    _state.wallVoile,
      wallPosX:     _state.wallPosX,
      wallPosY:     _state.wallPosY,
      wallFit:      _state.wallFit
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
    if (!fileOrBlob) throw new Error(window.I18n ? window.I18n.t("profile.err.noImage") : "Aucune image fournie");
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

  // ═══════════════════════════════════════════════════════════
  // 🖼️ FOND D'ÉCRAN DU HOME (v1.74.0 — demande KARMA « un peu comme Windows »)
  // ═══════════════════════════════════════════════════════════
  // Rangé dans la MÊME entrée IDB que l'avatar (`me`) : c'est de la
  // personnalisation de profil, ça vit et meurt avec lui.
  //
  // ⚠️ LE VRAI SUJET N'EST PAS LE STOCKAGE, C'EST LA LISIBILITÉ. Une photo
  // derrière les cards du HOME rend les textes illisibles. D'où le VOILE :
  // une couche semi-opaque de la couleur du thème par-dessus l'image, dont
  // l'utilisateur règle l'intensité (0 = image nue, 100 = fond uni comme
  // avant). Choisi contre `backdrop-filter: blur()` : coûteux sur mobile et
  // inégalement supporté, alors qu'un voile est gratuit et marche partout.
  //
  // Compressé à 1920 px / JPEG q88 : un fond en 12 Mpx ne se voit pas mieux
  // et ralentirait le boot. Le canvas strippe l'EXIF au passage (GPS inclus).
  // Côté COURT ≥ 1440 (netteté en portrait, cf. _compressImageToBlob), côté
  // long borné à 3840 pour qu'un panorama ne parte pas en fichier démesuré.
  const WALLPAPER_MAX_SHORT = 1440;
  const WALLPAPER_MAX_LONG  = 3840;
  const VOILE_DEFAUT        = 55;   // %, testé lisible sur photo claire ET sombre
  // Cadrage : position du fond en %, sur les 2 axes. Avec `cover`, seul l'axe
  // qui DÉBORDE bouge réellement — en portrait avec une photo paysage, c'est
  // X ; en paysage avec une photo portrait, c'est Y. Les 2 sont exposés pour
  // couvrir les 2 orientations sans que l'user ait à comprendre lequel agit.
  const CADRAGE_DEFAUT      = 50;   // % (centre)
  // 🖼️ v1.75.0 — MODE D'AFFICHAGE (retour KARMA : « une image verticale, il
  // va la zoomer et la cropper en vue horizontale alors qu'on pourrait
  // presque l'afficher telle quelle »).
  //   "cover"   → remplit tout l'écran, ROGNE ce qui dépasse (défaut historique)
  //   "contain" → image ENTIÈRE, l'espace restant prend la couleur du thème
  // `cover` agrandit jusqu'à couvrir les DEUX dimensions : plus le format de
  // l'image s'éloigne de celui de l'écran, plus il rogne. Une photo portrait
  // dans un cadre large n'en laisse voir qu'une bande. `contain` est la seule
  // réponse correcte à ce cas.
  const FIT_DEFAUT          = "cover";
  const FITS_VALIDES        = ["cover", "contain"];

  async function setWallpaper(fileOrBlob) {
    if (!_initialized) await init();
    if (!fileOrBlob) throw new Error(window.I18n ? window.I18n.t("profile.err.noImage") : "Aucune image fournie");
    if (fileOrBlob.size > 50 * 1024 * 1024) throw new Error(window.I18n.t("profile.err.tooLarge"));
    const compressed = await _compressImageToBlob(fileOrBlob, {
      maxShort: WALLPAPER_MAX_SHORT,
      maxLong:  WALLPAPER_MAX_LONG
    });
    const entry = (await _readEntry()) || { id: ENTRY_ID, surnom: "", createdAt: new Date().toISOString() };
    entry.wallBlob = compressed;
    entry.wallMime = "image/jpeg";
    if (!Number.isFinite(entry.wallVoile)) entry.wallVoile = VOILE_DEFAUT;
    // Cadrage remis au centre à chaque NOUVELLE image : un réglage hérité de
    // la photo précédente n'a aucun sens sur un cadrage différent.
    entry.wallPosX = CADRAGE_DEFAUT;
    entry.wallPosY = CADRAGE_DEFAUT;
    entry.updatedAt = new Date().toISOString();
    if (!entry.createdAt) entry.createdAt = entry.updatedAt;
    await _writeEntry(entry);
    _state.hasWallpaper = true;
    _state.wallVoile    = entry.wallVoile;
    _state.wallPosX     = entry.wallPosX;
    _state.wallPosY     = entry.wallPosY;
    _state.updatedAt    = entry.updatedAt;
    _notify();
    return { ok: true, size: compressed.size };
  }

  async function removeWallpaper() {
    if (!_initialized) await init();
    const entry = await _readEntry();
    if (!entry) return false;
    delete entry.wallBlob;
    delete entry.wallMime;
    entry.updatedAt = new Date().toISOString();
    await _writeEntry(entry);
    _state.hasWallpaper = false;
    _state.updatedAt    = entry.updatedAt;
    _notify();
    return true;
  }

  async function getWallpaperBlob() {
    if (!_initialized) await init();
    try {
      const entry = await _readEntry();
      if (entry && entry.wallBlob) return entry.wallBlob;
    } catch(e) { console.warn("[UserProfile] getWallpaperBlob() échec :", e); }
    return null;
  }

  // ⚠️ Le caller DOIT révoquer l'URL retournée (même contrat que
  // getPhotoObjectUrl) — sinon fuite mémoire à chaque re-render du HOME.
  async function getWallpaperObjectUrl() {
    const blob = await getWallpaperBlob();
    return blob ? URL.createObjectURL(blob) : null;
  }

  async function setWallpaperVoile(pct) {
    if (!_initialized) await init();
    const v = Math.max(0, Math.min(100, Math.round(Number(pct))));
    if (!Number.isFinite(v)) return false;
    const entry = (await _readEntry()) || { id: ENTRY_ID, surnom: "", createdAt: new Date().toISOString() };
    entry.wallVoile = v;
    entry.updatedAt = new Date().toISOString();
    await _writeEntry(entry);
    _state.wallVoile = v;
    _notify();
    return true;
  }

  // Cadrage : `axe` ∈ {"x","y"}, `pct` 0-100.
  async function setWallpaperFit(mode) {
    if (!_initialized) await init();
    const m = (FITS_VALIDES.indexOf(mode) >= 0) ? mode : FIT_DEFAUT;
    const entry = (await _readEntry()) || { id: ENTRY_ID, surnom: "", createdAt: new Date().toISOString() };
    entry.wallFit = m;
    entry.updatedAt = new Date().toISOString();
    await _writeEntry(entry);
    _state.wallFit = m;
    _notify();
    return true;
  }

  async function setWallpaperCadrage(axe, pct) {
    if (!_initialized) await init();
    const v = Math.max(0, Math.min(100, Math.round(Number(pct))));
    if (!Number.isFinite(v)) return false;
    const champ = (axe === "y") ? "wallPosY" : "wallPosX";
    const entry = (await _readEntry()) || { id: ENTRY_ID, surnom: "", createdAt: new Date().toISOString() };
    entry[champ] = v;
    entry.updatedAt = new Date().toISOString();
    await _writeEntry(entry);
    _state[champ] = v;
    _notify();
    return true;
  }

  window.UserProfile = {
    init:               init,
    get:                get,
    getPhotoBlob:       getPhotoBlob,
    getPhotoObjectUrl:  getPhotoObjectUrl,
    setSurnom:          setSurnom,
    setPhoto:           setPhoto,
    removePhoto:        removePhoto,
    // 🖼️ v1.74.0 — fond d'écran du HOME
    setWallpaper:          setWallpaper,
    removeWallpaper:       removeWallpaper,
    getWallpaperBlob:      getWallpaperBlob,
    getWallpaperObjectUrl: getWallpaperObjectUrl,
    setWallpaperVoile:     setWallpaperVoile,
    setWallpaperCadrage:   setWallpaperCadrage,
    setWallpaperFit:       setWallpaperFit,
    WALLPAPER_MAX_SHORT:   WALLPAPER_MAX_SHORT,
    WALLPAPER_MAX_LONG:    WALLPAPER_MAX_LONG,
    clear:              clear,
    onChange:           onChange,
    getInitial:         getInitial,
    getAvatarColor:     getAvatarColor,
    PALETTE:            PALETTE,
    DB_NAME:            DB_NAME
  };

  console.log("[UserProfile] Module chargé (DB " + DB_NAME + " v" + DB_VERSION + ")");
})();
