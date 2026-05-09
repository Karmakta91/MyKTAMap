// =========================
// TILING.JS
// =========================

// Seuil legacy : utilisé par le mode "auto" pour décider quand tile (basé sur taille fichier)
const PERF_AUTO_TILE_THRESHOLD = 60 * 1024 * 1024;

// Seuil "tile nécessaire" : quand l'image dépasse cette surface, le rendu direct
// L.imageOverlay devient instable (mémoire GPU mobile) — on tile même en mode Qualité
const TUILING_NECESSAIRE_PIXELS = 4096 * 4096;

// =========================
// PRESETS DE PERFORMANCE
// =========================
// Chaque preset règle 3 leviers techniques en cascade :
//   - maxWorkDim   : taille max du canvas de travail (downscale au-dessus)
//   - tileSize     : taille des tuiles découpées
//   - jpegQuality  : qualité JPEG d'encodage des tuiles
const PERF_PRESETS = {
  quality: {
    label:        "Qualité",
    emoji:        "🌟",
    maxWorkDim:   12288,
    tileSize:     1024,
    jpegQuality:  0.95,
    description:  "Plus net. Recommandé sur PC desktop."
  },
  balanced: {
    label:        "Équilibré",
    emoji:        "🎯",
    maxWorkDim:   8192,
    tileSize:     1024,
    jpegQuality:  0.88,
    description:  "Compromis recommandé. Défaut idéal."
  },
  performance: {
    label:        "Performance",
    emoji:        "⚡",
    maxWorkDim:   6144,
    tileSize:     768,
    jpegQuality:  0.78,
    description:  "Plans très lourds, mobile faible."
  }
};

// Métadonnées du mode "auto" — pas de params propres, utilise Équilibré quand il tile
const PERF_AUTO_META = {
  label:        "Auto",
  emoji:        "🔄",
  description:  "L'app décide selon la taille du plan."
};

// Métadonnées du mode "off" — rendu direct via L.imageOverlay, pas de tiling du tout
// ⚠️ Risque de crash sur Safari iOS pour images > 8192 px (drawImage qui échoue)
const PERF_OFF_META = {
  label:        "Désactivé",
  emoji:        "💤",
  description:  "Aucun tiling. Image en direct (qualité brute, risqué sur mobile)."
};

// =========================
// RÉSOLUTION DU PRESET
// =========================
// Décide si on tile et avec quels params, à partir du preset utilisateur,
// de la taille du fichier et des dimensions de l'image.
// Retourne { tile: bool, params: {maxWorkDim, tileSize, jpegQuality} | null }
function resoudrePerfPreset(preset, fileSize, imageW, imageH) {
  const p = (typeof preset === "string") ? preset : "auto";

  // Mode off : aucun tiling, JAMAIS — rendu direct via L.imageOverlay
  // ⚠️ Choix utilisateur explicite — risque de crash sur Safari iOS pour très gros plans
  if (p === "off") {
    return { tile: false, params: null };
  }

  // Mode auto : tile uniquement si fichier > seuil legacy, avec params Équilibré
  if (p === "auto") {
    const tile = (typeof fileSize === "number" && fileSize > PERF_AUTO_TILE_THRESHOLD);
    return {
      tile:   tile,
      params: tile ? PERF_PRESETS.balanced : null
    };
  }

  // Presets explicites : tile uniquement si l'image est techniquement trop grande
  // pour un rendu direct (sécurité GPU mobile). Sinon rendu direct (qualité native).
  const params = PERF_PRESETS[p];
  if (!params) {
    console.warn("[Tiling] Preset inconnu :", p, "— fallback auto");
    return resoudrePerfPreset("auto", fileSize, imageW, imageH);
  }

  let tile = false;
  if (typeof imageW === "number" && typeof imageH === "number") {
    tile = (imageW * imageH) > TUILING_NECESSAIRE_PIXELS;
  }
  return {
    tile:   tile,
    params: tile ? params : null
  };
}

// =========================
// POINT D'ENTRÉE
// =========================
async function chargerImage(url, bounds, map, fileSize, sourceFile) {
  const W = bounds[1][1];
  const H = bounds[1][0];

  const preset = (typeof APP_CONFIG !== "undefined") ? APP_CONFIG.perfPreset : "auto";
  const r = resoudrePerfPreset(preset, fileSize, W, H);

  if (r.tile && r.params) {
    console.log("[Tiling] Mode", preset, "—",
                fileSize ? Math.round(fileSize/1024/1024)+"Mo" : "taille inconnue",
                "params:", r.params.maxWorkDim+"px / tile "+r.params.tileSize+" / Q "+r.params.jpegQuality);
    return await chargerImageTuillee(url, bounds, map, sourceFile, r.params);
  }
  console.log("[Tiling] Rendu direct (mode "+preset+")");
  L.imageOverlay(url, bounds).addTo(map);
  return [];
}

// =========================
// TILING PRINCIPAL
// =========================
async function chargerImageTuillee(url, bounds, map, sourceFile, params) {
  // Sécurité : si appelé sans params (legacy), retombe sur Équilibré
  if (!params) params = PERF_PRESETS.balanced;

  const W = bounds[1][1];
  const H = bounds[1][0];

  let srcBlob = null;
  if (sourceFile instanceof File || sourceFile instanceof Blob) {
    srcBlob = sourceFile;
  } else if (url.startsWith("blob:")) {
    const asset = Object.values(window.RUNTIME_ASSETS || {}).find(function(a) {
      return a.url === url;
    });
    if (asset?.file) srcBlob = asset.file;
  }

  // Passer le blob directement — la Blob URL sera créée ET révoquée
  // à l'intérieur de _imageVersCanvasReduit, après chargement complet
  const workCanvas = srcBlob
    ? await _imageVersCanvasReduit(null, W, H, srcBlob, params.maxWorkDim)
    : await _imageVersCanvasReduit(url, W, H, null, params.maxWorkDim);

  if (!workCanvas) {
    console.warn("[Tiling] Canvas impossible — fallback imageOverlay direct");
    // Le fallback utilise l'URL originale — pas de tiling mais au moins l'image s'affiche
    L.imageOverlay(url, bounds).addTo(map);
    return [];
  }

  const overlays = await _tilerDepuisCanvas(workCanvas, W, H, map, params);
  workCanvas.width  = 0;
  workCanvas.height = 0;

  console.log("[Tiling]", overlays.length, "tuiles chargées");
  return overlays;
}

// =========================
// CHARGER IMAGE → CANVAS RÉDUIT
// Utilise un <img> HTML — Safari iOS gère mieux la mémoire
// via l'élément img que via createImageBitmap sur les JPEG volumineux
// =========================
function _imageVersCanvasReduit(url, targetW, targetH, srcBlob, maxWorkDim) {
  const dimMax = (typeof maxWorkDim === "number") ? maxWorkDim : 8192;
  return new Promise(function(resolve) {
    // Créer la Blob URL ICI — elle vivra jusqu'à la fin du onload
    let localUrl = url;
    if (srcBlob) {
      localUrl = URL.createObjectURL(srcBlob);
      console.log("[Tiling] Blob URL créée depuis", srcBlob.name || "blob");
    }

    const img = new Image();

    img.onload = function() {
      // Révoquer uniquement APRÈS que l'image est chargée en mémoire
      if (srcBlob) URL.revokeObjectURL(localUrl);

      try {
        const naturalW = img.naturalWidth  || targetW;
        const naturalH = img.naturalHeight || targetH;

        let workW = naturalW;
        let workH = naturalH;
        if (naturalW > dimMax || naturalH > dimMax) {
          const ratio = Math.min(dimMax / naturalW, dimMax / naturalH);
          workW = Math.round(naturalW * ratio);
          workH = Math.round(naturalH * ratio);
          console.log("[Tiling] Réduction", naturalW+"×"+naturalH, "→", workW+"×"+workH, "(max "+dimMax+")");
        }

        const canvas = document.createElement('canvas');
        canvas.width  = workW;
        canvas.height = workH;
        const ctx = canvas.getContext('2d');

        // Fond charte sombre #0a0d18 (au lieu de blanc) — apparait pendant le
        // tile loading et autour des bords de l'image si elle ne couvre pas tout.
        // Cohérent avec le fond de la map (.leaflet-container = #000000) et la
        // charte loader. ⚠️ NE PAS mettre #000000 strict : la detection
        // "canvas noir" plus bas check pixel (0,0,0) — un fond noir pur ferait
        // un faux positif. #0a0d18 est visuellement equivalent mais distinct.
        ctx.fillStyle = "#0a0d18";
        ctx.fillRect(0, 0, workW, workH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, workW, workH);

        // Détection canvas noir — drawImage JPEG échoué silencieusement
        let estNoir = false;
        try {
          const px = ctx.getImageData(1, 1, 1, 1).data;
          estNoir = (px[0] === 0 && px[1] === 0 && px[2] === 0);
        } catch(e) {}

        if (estNoir) {
          console.warn("[Tiling] Canvas noir — re-essai dans 100ms");
          setTimeout(function() {
            ctx.fillStyle = "#0a0d18";
            ctx.fillRect(0, 0, workW, workH);
            ctx.drawImage(img, 0, 0, workW, workH);
            // Vérifier à nouveau
            let encoreNoir = false;
            try {
              const px2 = ctx.getImageData(1, 1, 1, 1).data;
              encoreNoir = (px2[0] === 0 && px2[1] === 0 && px2[2] === 0);
            } catch(e) {}
            if (encoreNoir) {
              console.error("[Tiling] Canvas toujours noir après re-essai — image non dessinable à cette taille");
            }
            img.src = "";
            resolve(encoreNoir ? null : canvas);
          }, 100);
          return;
        }

        img.src = "";
        resolve(canvas);

      } catch(err) {
        console.error("[Tiling] Erreur canvas :", err);
        img.src = "";
        resolve(null);
      }
    };

    img.onerror = function() {
      if (srcBlob) URL.revokeObjectURL(localUrl);
      console.error("[Tiling] Impossible de charger :", localUrl);
      resolve(null);
    };

    requestAnimationFrame(function() { img.src = localUrl; });
  });
}

// =========================
// TUILER DEPUIS UN CANVAS
// =========================
async function _tilerDepuisCanvas(srcCanvas, W, H, map, params) {
  if (!params) params = PERF_PRESETS.balanced;
  const tileSize    = params.tileSize;
  const jpegQuality = params.jpegQuality;

  const workW  = srcCanvas.width;
  const workH  = srcCanvas.height;
  const scaleX = workW / W;
  const scaleY = workH / H;
  const nbX    = Math.ceil(W / tileSize);
  const nbY    = Math.ceil(H / tileSize);

  console.log("[Tiling]", nbX+"×"+nbY, "=", nbX*nbY, "tuiles depuis canvas", workW+"×"+workH,
              "(tile "+tileSize+", Q "+jpegQuality+")");

  const overlays = [];

  for (let row = 0; row < nbY; row++) {
    for (let col = 0; col < nbX; col++) {
      const tileW = Math.min(tileSize, W - col * tileSize);
      const tileH = Math.min(tileSize, H - row * tileSize);
      const srcX  = Math.round(col * tileSize * scaleX);
      const srcY  = Math.round(row * tileSize * scaleY);
      const srcW  = Math.max(1, Math.round(tileW * scaleX));
      const srcH  = Math.max(1, Math.round(tileH * scaleY));

      // Canvas de tuile
      const tuile  = document.createElement('canvas');
      tuile.width  = tileW;
      tuile.height = tileH;
      const tCtx   = tuile.getContext('2d');

      tCtx.fillStyle = "#0a0d18";
      tCtx.fillRect(0, 0, tileW, tileH);
      tCtx.drawImage(srcCanvas, srcX, srcY, srcW, srcH, 0, 0, tileW, tileH);

      const blobUrl = await _canvasToBlob(tuile, "image/jpeg", jpegQuality);

      // Libérer le canvas de tuile immédiatement
      tuile.width = 0;
      tuile.height = 0;

      if (!blobUrl) continue;

      const lngMin = col * tileSize;
      const lngMax = col * tileSize + tileW;
      const latMin = H - (row * tileSize + tileH);
      const latMax = H - row * tileSize;

      const overlay = L.imageOverlay(blobUrl, [[latMin, lngMin], [latMax, lngMax]], {
        className: "kta-tile-overlay"
      });
      overlay.addTo(map);
      overlays.push({ overlay, blobUrl });
    }

    // Pause entre rangées — laisse Safari GC la mémoire
    await _pause();
  }

  return overlays;
}

// =========================
// CANVAS → BLOB URL
// =========================
function _canvasToBlob(canvas, format, quality) {
  return new Promise(function(resolve) {
    try {
      canvas.toBlob(function(blob) {
        resolve(blob ? URL.createObjectURL(blob) : null);
      }, format || 'image/png', quality || 1.0);
    } catch(err) {
      console.warn("[Tiling] toBlob échoué :", err);
      resolve(null);
    }
  });
}

function _pause() {
  return new Promise(function(resolve) { setTimeout(resolve, 16); });
}

// =========================
// LIBÉRER LES TUILES
// =========================
function libererTuiles(overlays, map) {
  if (!Array.isArray(overlays)) return;
  overlays.forEach(function(t) {
    try { map.removeLayer(t.overlay); } catch(e) {}
    try { URL.revokeObjectURL(t.blobUrl); } catch(e) {}
  });
}

function tuilingNecessaire(imageWidth, imageHeight) {
  return (imageWidth * imageHeight) > TUILING_NECESSAIRE_PIXELS;
}

// =========================
// EXPORTS
// =========================
window.chargerImage             = chargerImage;
window.chargerImageTuillee      = chargerImageTuillee;
window.libererTuiles            = libererTuiles;
window.tuilingNecessaire        = tuilingNecessaire;
window.resoudrePerfPreset       = resoudrePerfPreset;
window.PERF_PRESETS             = PERF_PRESETS;
window.PERF_AUTO_META           = PERF_AUTO_META;
window.PERF_OFF_META            = PERF_OFF_META;
window.PERF_AUTO_TILE_THRESHOLD = PERF_AUTO_TILE_THRESHOLD;

// Conservé pour rétro-compat (alias de PERF_AUTO_TILE_THRESHOLD)
window.PERF_MODE_SIZE_BYTES     = PERF_AUTO_TILE_THRESHOLD;
