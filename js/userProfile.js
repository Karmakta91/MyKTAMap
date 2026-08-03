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

  // ⚠️ v1.75.2 — `onblocked` + délai de garde. Sans eux, une ouverture bloquée
  // (autre onglet tenant une version différente) laissait la promesse JAMAIS
  // RÉGLÉE : l'appelant restait suspendu pour toujours APRÈS avoir consommé le
  // jeton de rendu le plus récent, donc tous les rendus suivants abandonnaient
  // et le HOME restait figé jusqu'au rechargement de l'app. Une promesse qui
  // ne se règle pas est pire qu'une erreur : elle ne remonte nulle part.
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

  // ⚠️ v1.75.2 — DISTINGUE « absent » DE « échec ».
  // Avant, les deux cas rendaient `null`. Les écrivains faisaient alors
  // `(await _readEntry()) || { id, surnom: "", createdAt }` : sur un simple
  // échec transitoire de lecture, ils écrivaient un enregistrement NEUF —
  // donc sans `photoBlob` ni `wallBlob` — et DÉTRUISAIENT l'avatar et le fond
  // d'écran en base. Mine posée dans le chemin le plus exercé.
  // Désormais : `null` = l'enregistrement n'existe pas (cas légitime d'un
  // profil neuf, le stub est alors correct) ; une ERREUR est PROPAGÉE, donc
  // l'écrivain échoue au lieu d'écraser.
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
        // 🖼️ Le BLOB reste en IDB ; les RÉGLAGES vivent en localStorage
        // (cf. bloc v1.75.2). `_hydraterWallPrefs` migre au passage les
        // réglages d'un profil créé avant ce découpage.
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
    // Le stub n'est atteint que si l'enregistrement est réellement ABSENT
    // (profil neuf) : depuis v1.75.2, un ÉCHEC de lecture est propagé par
    // `_readEntry` et fait échouer l'écriture au lieu d'écraser les blobs.
    const entry = (await _readEntry()) || { id: ENTRY_ID, surnom: "", createdAt: new Date().toISOString() };
    entry.wallBlob = compressed;
    entry.wallMime = "image/jpeg";
    entry.updatedAt = new Date().toISOString();
    if (!entry.createdAt) entry.createdAt = entry.updatedAt;
    await _writeEntry(entry);
    // Cadrage remis au centre à chaque NOUVELLE image : un réglage hérité de
    // la photo précédente n'a aucun sens sur un cadrage différent. Réglages
    // en localStorage → aucune réécriture de blob (cf. bloc v1.75.2).
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

  // ⚠️ Le caller DOIT révoquer l'URL retournée (même contrat que
  // getPhotoObjectUrl) — sinon fuite mémoire à chaque re-render du HOME.
  async function getWallpaperObjectUrl() {
    const blob = await getWallpaperBlob();
    return blob ? URL.createObjectURL(blob) : null;
  }

  // ═══════════════════════════════════════════════════════════
  // 🐛 v1.75.2 — LES RÉGLAGES D'AFFICHAGE NE TOUCHENT PLUS L'IDB
  // ═══════════════════════════════════════════════════════════
  // CAUSE RACINE du bug « j'ajoute un fond → OK ; je rouvre la modale, je
  // modifie les réglages → au retour au HOME, plus de fond ET plus de photo
  // de profil (un « ? »), il faut relancer l'app ».
  //
  // Ces 3 setters faisaient un read-modify-write de l'ENREGISTREMENT ENTIER
  // — `photoBlob` et `wallBlob` compris, soit plusieurs Mo — à CHAQUE
  // événement `change` d'un curseur. Or réécrire un record IDB contenant des
  // Blobs relâche le backing store de l'ancienne version : les Blob URL déjà
  // créées et affichées deviennent **illisibles SANS avoir été révoquées**.
  // D'où les deux symptômes simultanés (image cassée = le « ? » du
  // navigateur, et fond disparu), une base intacte, et le retour à la normale
  // au redémarrage. WebKit émet `change` à chaque déplacement du curseur, pas
  // seulement au relâchement : un seul glissement = N réécritures concurrentes.
  //
  // C'est aussi pourquoi mes 3 correctifs précédents n'ont rien changé : ils
  // traitaient tous la durée de vie de la CHAÎNE d'URL (ordre de révocation,
  // jeton anti-course, resynchronisation), jamais la validité du BLOB.
  //
  // FIX ARCHITECTURAL : ces 4 valeurs sont des réglages d'affichage minuscules
  // et purement locaux. Elles n'ont rien à faire dans le même enregistrement
  // qu'un binaire de plusieurs Mo → elles passent en localStorage. Les setters
  // ne touchent plus JAMAIS l'IDB, donc plus aucune invalidation possible.
  // Bénéfice collatéral : ils deviennent synchrones et incassables.
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

  // Applique les réglages sur `_state`, avec MIGRATION unique depuis l'ancien
  // emplacement (l'entrée IDB) pour ne pas perdre les réglages d'un user déjà
  // équipé. `entry` peut être null (appel hors init).
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
