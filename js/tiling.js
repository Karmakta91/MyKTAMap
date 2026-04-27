// =========================
// TILING.JS
// =========================

const TILE_SIZE            = 1024;
const MAX_WORK_DIM         = 8192;  // Limite GPU mobile — au dessus drawImage JPEG échoue
const PERF_MODE_SIZE_BYTES = 60 * 1024 * 1024;

// =========================
// ACTIVATION
// =========================
function perfModeActif(fileSize) {
  if (typeof APP_CONFIG !== "undefined") {
    if (APP_CONFIG.perfMode === true)  return true;
    if (APP_CONFIG.perfMode === false) return false;
  }
  if (typeof fileSize === "number") return fileSize > PERF_MODE_SIZE_BYTES;
  return false;
}

// =========================
// POINT D'ENTRÉE
// =========================
async function chargerImage(url, bounds, map, fileSize, sourceFile) {
  if (perfModeActif(fileSize)) {
    console.log("[Tiling] Mode performance —", fileSize ? Math.round(fileSize/1024/1024)+"Mo" : "forcé");
    return await chargerImageTuillee(url, bounds, map, sourceFile);
  }
  console.log("[Tiling] Mode normal");
  L.imageOverlay(url, bounds).addTo(map);
  return [];
}

// =========================
// TILING PRINCIPAL
// =========================
async function chargerImageTuillee(url, bounds, map, sourceFile) {
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
    ? await _imageVersCanvasReduit(null, W, H, srcBlob)
    : await _imageVersCanvasReduit(url, W, H, null);

  if (!workCanvas) {
    console.warn("[Tiling] Canvas impossible — fallback imageOverlay direct");
    // Le fallback utilise l'URL originale — pas de tiling mais au moins l'image s'affiche
    L.imageOverlay(url, bounds).addTo(map);
    return [];
  }

  const overlays = await _tilerDepuisCanvas(workCanvas, W, H, map);
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
function _imageVersCanvasReduit(url, targetW, targetH, srcBlob) {
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
        if (naturalW > MAX_WORK_DIM || naturalH > MAX_WORK_DIM) {
          const ratio = Math.min(MAX_WORK_DIM / naturalW, MAX_WORK_DIM / naturalH);
          workW = Math.round(naturalW * ratio);
          workH = Math.round(naturalH * ratio);
          console.log("[Tiling] Réduction", naturalW+"×"+naturalH, "→", workW+"×"+workH);
        }

        const canvas = document.createElement('canvas');
        canvas.width  = workW;
        canvas.height = workH;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = "#ffffff";
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
            ctx.fillStyle = "#ffffff";
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
async function _tilerDepuisCanvas(srcCanvas, W, H, map) {
  const workW  = srcCanvas.width;
  const workH  = srcCanvas.height;
  const scaleX = workW / W;
  const scaleY = workH / H;
  const nbX    = Math.ceil(W / TILE_SIZE);
  const nbY    = Math.ceil(H / TILE_SIZE);

  console.log("[Tiling]", nbX+"×"+nbY, "=", nbX*nbY, "tuiles depuis canvas", workW+"×"+workH);

  const srcCtx  = srcCanvas.getContext('2d');
  const overlays = [];

  for (let row = 0; row < nbY; row++) {
    for (let col = 0; col < nbX; col++) {
      const tileW = Math.min(TILE_SIZE, W - col * TILE_SIZE);
      const tileH = Math.min(TILE_SIZE, H - row * TILE_SIZE);
      const srcX  = Math.round(col * TILE_SIZE * scaleX);
      const srcY  = Math.round(row * TILE_SIZE * scaleY);
      const srcW  = Math.max(1, Math.round(tileW * scaleX));
      const srcH  = Math.max(1, Math.round(tileH * scaleY));

      // Canvas de tuile
      const tuile  = document.createElement('canvas');
      tuile.width  = tileW;
      tuile.height = tileH;
      const tCtx   = tuile.getContext('2d');

      tCtx.fillStyle = "#ffffff";
      tCtx.fillRect(0, 0, tileW, tileH);
      tCtx.drawImage(srcCanvas, srcX, srcY, srcW, srcH, 0, 0, tileW, tileH);

      const blobUrl = await _canvasToBlob(tuile, "image/jpeg", 0.88);

      // Libérer le canvas de tuile immédiatement
      tuile.width = 0;
      tuile.height = 0;

      if (!blobUrl) continue;

      const lngMin = col * TILE_SIZE;
      const lngMax = col * TILE_SIZE + tileW;
      const latMin = H - (row * TILE_SIZE + tileH);
      const latMax = H - row * TILE_SIZE;

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
  return (imageWidth * imageHeight) > (4096 * 4096);
}

// =========================
// EXPORTS
// =========================
window.chargerImage         = chargerImage;
window.chargerImageTuillee  = chargerImageTuillee;
window.libererTuiles        = libererTuiles;
window.tuilingNecessaire    = tuilingNecessaire;
window.perfModeActif        = perfModeActif;
window.PERF_MODE_SIZE_BYTES = PERF_MODE_SIZE_BYTES;
