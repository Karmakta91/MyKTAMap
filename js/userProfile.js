/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// userProfile.js — profil local (surnom + avatar facultatif + fond d'écran du HOME), affiché en bandeau du loader.
// Profil par défaut { surnom: "", photoBlob: null } : rien n'est imposé, avatar 👤 tant que rien n'est touché.
// Stockage : IDB `myktamap_profile` v1, store `profile`, entrée unique id="me" { id, surnom, photoBlob,
//   photoMime, wallBlob…, createdAt, updatedAt } ; réglages du fond en localStorage (jamais dans l'entrée IDB).
// Photo : compressée par canvas (512 px côté long, JPEG q88, EXIF retiré). ⚠️ getPhotoObjectUrl() crée une
//   nouvelle Blob URL à chaque appel : l'appelant la RÉVOQUE.
// Export / import : section "user" de profileExportImport.js.
// Expose : window.UserProfile — init, get (snapshot sync), getPhotoObjectUrl, setSurnom, setPhoto, removePhoto,
//   clear, onChange, getInitial, getAvatarColor, PALETTE, DB_NAME ; fond d'écran : setWallpaper,
//   removeWallpaper, getWallpaperBlob, getWallpaperObjectUrl, setWallpaperVoile / Cadrage / Fit.
// Garde-fou : scripts/check-api-surface.js

(function() {
  "use strict";

  const DB_NAME    = "myktamap_profile";
  const DB_VERSION = 1;
  const STORE_NAME = "profile";
  const ENTRY_ID   = "me";

  const MAX_DIMENSION_PX = 512;
  const JPEG_QUALITY     = 0.88;

  // Palette de l'avatar par défaut : couleur choisie par hash du surnom (même surnom → même couleur).
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

  // ── État en mémoire ──────────────

  let _state = {
    surnom:     "",
    hasPhoto:   false,
    photoMime:  null,
    createdAt:  null,
    updatedAt:  null,
    // fond d'écran du HOME (cf. bloc dédié en bas de fichier)
    hasWallpaper: false,
    wallVoile:    55,
    wallPosX:     50,
    wallPosY:     50,
    wallFit:      "cover"
  };
  let _initialized = false;
  const _listeners = [];

  // ── Hash / palette ──────────────

  // djb2 : index déterministe à partir d'une chaîne.
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
    // Première lettre (spread : gère un emoji simple)
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

  // ── IDB ──────────────

  // ⚠️ `onblocked` + délai de garde : une ouverture bloquée (autre onglet sur une autre version) laisserait la
  // promesse JAMAIS réglée, l'appelant suspendu après avoir consommé le jeton de rendu, et le HOME figé.
  const OPEN_TIMEOUT_MS = 8000;
  function _openDb() {
    return new Promise(function(resolve, reject) {
      let regle = false;
      const finir = function(fn, arg) { if (regle) return; regle = true; fn(arg); };
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch(e) { finir(reject, e); return; }
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = function() { finir(resolve, req.result); };
      req.onerror   = function() { finir(reject, req.error || new Error("IDB open error")); };
      req.onblocked = function() { finir(reject, new Error("IDB open bloquée (autre onglet ?)")); };
      setTimeout(function() { finir(reject, new Error("IDB open : délai dépassé")); }, OPEN_TIMEOUT_MS);
    });
  }

  // ⚠️ Distingue « absent » de « échec » : `null` = l'enregistrement n'existe pas (profil neuf, le stub est
  // correct) ; une ERREUR est PROPAGÉE. 🩸 Rendre null sur un échec ferait écrire un stub neuf, sans photoBlob ni
  // wallBlob : avatar et fond d'écran détruits en base.
  async function _readEntry() {
    const db = await _openDb();          // rejette si l'ouverture échoue
    return new Promise(function(resolve, reject) {
      try {
        const tx = db.transaction([STORE_NAME], "readonly");
        const st = tx.objectStore(STORE_NAME);
        const req = st.get(ENTRY_ID);
        req.onsuccess = function() {
          resolve(req.result || null);   // null = ABSENT, pas « échec »
          try { db.close(); } catch(e) {}
        };
        req.onerror = function() {
          reject(req.error || new Error("IDB read error"));
          try { db.close(); } catch(e) {}
        };
      } catch(e) {
        reject(e);
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

  // ── Compression photo ──────────────

  // Compresseur partagé avatar / fond d'écran ; le canvas RETIRE l'EXIF (GPS de prise de vue compris).
  // `opts` : un NOMBRE = plafond du côté long (avatar), ou { maxLong, maxShort }.
  // ⚠️ Plafond sur le côté COURT : en portrait avec `background-size: cover`, c'est lui qui couvre la hauteur de
  // l'écran ; ne borner que le côté long rend l'image molle. Jamais de sur-échantillonnage (ratio ≤ 1).
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

  // ── API publique ──────────────

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
        // Le BLOB reste en IDB, les RÉGLAGES en localStorage ; `_hydraterWallPrefs` migre ceux d'un ancien profil.
        _state.hasWallpaper = !!entry.wallBlob;
      }
      _hydraterWallPrefs(entry);
    } catch(e) {
      console.warn("[UserProfile] init() IDB lecture échouée :", e);
      _hydraterWallPrefs(null);
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
    // Entrée brute limitée à 50 Mo (une image RAW géante ferait planter le compresseur).
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


  // ── Fond d'écran du HOME ──────────────
  // Dans la MÊME entrée IDB que l'avatar : il vit et meurt avec le profil.
  // ⚠️ Le sujet est la LISIBILITÉ : un VOILE de la couleur du thème recouvre l'image, intensité réglable
  // (0 = image nue, 100 = fond uni). Préféré à `backdrop-filter: blur()`, coûteux sur mobile et inégalement
  // supporté.
  // Compression : 1920 px / JPEG q88, côté COURT ≥ 1440 (netteté portrait), côté long ≤ 3840 ; EXIF retiré.
  const WALLPAPER_MAX_SHORT = 1440;
  const WALLPAPER_MAX_LONG  = 3840;
  const VOILE_DEFAUT        = 55;   // %, testé lisible sur photo claire ET sombre
  // Cadrage : position du fond en % sur les 2 axes. Avec `cover`, seul l'axe qui DÉBORDE bouge ; les 2 sont
  // exposés pour couvrir les deux orientations.
  const CADRAGE_DEFAUT      = 50;   // % (centre)
  // Mode d'affichage : "cover" remplit l'écran et ROGNE (défaut) ; "contain" montre l'image ENTIÈRE, le reste
  // prend la couleur du thème — seule réponse correcte à une photo portrait dans un cadre large.
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
    // Stub seulement si l'enregistrement est ABSENT (profil neuf) : un échec de lecture fait échouer l'écriture.
    const entry = (await _readEntry()) || { id: ENTRY_ID, surnom: "", createdAt: new Date().toISOString() };
    entry.wallBlob = compressed;
    entry.wallMime = "image/jpeg";
    entry.updatedAt = new Date().toISOString();
    if (!entry.createdAt) entry.createdAt = entry.updatedAt;
    await _writeEntry(entry);
    // Cadrage remis au centre à chaque NOUVELLE image ; réglages en localStorage, aucune réécriture de blob.
    _state.wallPosX = CADRAGE_DEFAUT;
    _state.wallPosY = CADRAGE_DEFAUT;
    if (!Number.isFinite(_state.wallVoile)) _state.wallVoile = VOILE_DEFAUT;
    _ecrireWallPrefs({ wallPosX: CADRAGE_DEFAUT, wallPosY: CADRAGE_DEFAUT, wallVoile: _state.wallVoile });
    _state.hasWallpaper = true;
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

  // ⚠️ L'appelant DOIT révoquer l'URL (comme getPhotoObjectUrl), sinon fuite à chaque rendu du HOME.
  async function getWallpaperObjectUrl() {
    const blob = await getWallpaperBlob();
    return blob ? URL.createObjectURL(blob) : null;
  }

  // ── Réglages d'affichage : localStorage, JAMAIS l'IDB ──────────────
  // 🩸 Réécrire un record IDB qui contient des Blobs relâche le backing store de l'ancienne version : les Blob
  // URL déjà affichées deviennent illisibles SANS avoir été révoquées (avatar « ? », fond disparu, base intacte,
  // retour à la normale au redémarrage). WebKit émet `change` à chaque mouvement de curseur → N réécritures.
  // Ces réglages minuscules vivent donc en localStorage : les setters ne touchent jamais l'IDB (et sont synchrones).
  const LS_WALL_PREFS = "myktamap_wallpaper_prefs_v1";

  function _lireWallPrefs() {
    try {
      const o = JSON.parse(localStorage.getItem(LS_WALL_PREFS) || "{}");
      return (o && typeof o === "object") ? o : {};
    } catch(e) { return {}; }
  }

  function _ecrireWallPrefs(patch) {
    try {
      const o = Object.assign(_lireWallPrefs(), patch || {});
      localStorage.setItem(LS_WALL_PREFS, JSON.stringify(o));
      return true;
    } catch(e) {
      console.warn("[UserProfile] réglages fond d'écran non enregistrés :", e);
      return false;
    }
  }

  // Applique les réglages sur `_state`, avec MIGRATION unique depuis l'ancien emplacement (entrée IDB).
  // `entry` peut être null (appel hors init).
  function _hydraterWallPrefs(entry) {
    const p = _lireWallPrefs();
    const migre = {};
    const _prendre = function(cle, valide, defaut) {
      if (valide(p[cle])) { _state[cle] = p[cle]; return; }
      if (entry && valide(entry[cle])) {          // legacy IDB → on migre
        _state[cle] = entry[cle]; migre[cle] = entry[cle]; return;
      }
      _state[cle] = defaut;
    };
    const estPct = function(v) { return Number.isFinite(v) && v >= 0 && v <= 100; };
    _prendre("wallVoile", estPct, VOILE_DEFAUT);
    _prendre("wallPosX",  estPct, CADRAGE_DEFAUT);
    _prendre("wallPosY",  estPct, CADRAGE_DEFAUT);
    _prendre("wallFit",   function(v) { return FITS_VALIDES.indexOf(v) >= 0; }, FIT_DEFAUT);
    if (Object.keys(migre).length > 0) _ecrireWallPrefs(migre);
  }

  async function setWallpaperVoile(pct) {
    if (!_initialized) await init();
    const v = Math.max(0, Math.min(100, Math.round(Number(pct))));
    if (!Number.isFinite(v)) return false;
    _state.wallVoile = v;
    _ecrireWallPrefs({ wallVoile: v });
    _notify();
    return true;
  }

  async function setWallpaperFit(mode) {
    if (!_initialized) await init();
    const m = (FITS_VALIDES.indexOf(mode) >= 0) ? mode : FIT_DEFAUT;
    _state.wallFit = m;
    _ecrireWallPrefs({ wallFit: m });
    _notify();
    return true;
  }

  // Cadrage : `axe` ∈ {"x","y"}, `pct` 0-100.
  async function setWallpaperCadrage(axe, pct) {
    if (!_initialized) await init();
    const v = Math.max(0, Math.min(100, Math.round(Number(pct))));
    if (!Number.isFinite(v)) return false;
    const champ = (axe === "y") ? "wallPosY" : "wallPosX";
    _state[champ] = v;
    const patch = {}; patch[champ] = v;
    _ecrireWallPrefs(patch);
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
    // fond d'écran du HOME
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
