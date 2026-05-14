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

  // 🧱 Tiling V2 (v149) : si le plan-config indique `plan.tiledV2: true` ET
  // contient une section `tiling` (manifest), on bascule sur le runtime
  // Option B : N L.imageOverlay par niveau de zoom, swap on zoomend.
  // Cf createConf.js > _genererTuilesV2 pour la génération côté planner.
  const pc = window.PLAN_CONFIG;
  if (pc && pc.plan && pc.plan.tiledV2 === true && pc.tiling) {
    console.log("[Tiling] Mode V2 (Option B : multi-imageOverlay swap on zoom)");
    return _chargerImageV2OptionB(bounds, map, pc.tiling);
  }

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
// 🧱 RUNTIME V2 — Option B (multi-imageOverlay swap on zoom)
// =========================
// Le plan-config contient :
//   plan.imageWidth/imageHeight = dims du plan (post-crop)
//   plan.tiledV2 = true (flag de mode)
//   tiling = { version: 2, tileSize: 512, format: "jpeg",
//              minNativeZoom: -3, maxNativeZoom: 0 }
//
// Les tuiles sont dans RUNTIME_ASSETS[`data/tiles/z<N>/x<col>_y<-k>.jpg`].
// Au runtime, on choisit le niveau z correspondant au zoom Leaflet courant
// (clamp entre min/maxNativeZoom), on enlève les overlays du niveau précédent,
// on ajoute les nouveaux. Chaque overlay = L.imageOverlay avec bounds calcules
// depuis la position de la tuile dans la grille.
//
// Pas de GridLayer, pas de TileLayer.extend, pas de coord math complexe :
// Leaflet positionne les imageOverlay via leurs bounds (latLng), et gère
// le scaling CSS naturellement (même primitive que le mode V1 classique).
//
// Pour les tuiles PARTIELLES (image non multiple de tileSize) au niveau le
// plus haut, la tuile est paddée avec du noir (canvas 512×512). Les bounds
// FULL la placent au-dessus du plan (lat > imageHeight). Le black border
// visible si l'utilisateur dezoome très loin. Acceptable pour v1.
function _chargerImageV2OptionB(bounds, map, tilingManifest) {
  const H = bounds[1][0];
  const W = bounds[1][1];

  const TILE_SIZE = tilingManifest.tileSize || 512;
  const MIN_NATIVE = (Number.isInteger(tilingManifest.minNativeZoom)) ? tilingManifest.minNativeZoom : -3;
  const MAX_NATIVE = (Number.isInteger(tilingManifest.maxNativeZoom)) ? tilingManifest.maxNativeZoom : 0;

  // État du runtime V2 — exposé en window pour cleanup côté main.js plan switch
  const state = {
    currentLevel: null,   // z courant
    activeOverlays: [],   // [L.imageOverlay] actuellement affichés
    blobUrlsCreated: []   // [string] pour revoke au cleanup
  };
  window._tilingV2State = state;

  // Helper : résout l'URL d'une tuile (z, col, k=-row). Lazy → crée la blob URL
  // au premier appel et la réutilise ensuite (asset.url cached).
  function _resoudreUrlTuile(z, col, k) {
    const path = "data/tiles/z" + z + "/x" + col + "_y" + (-k) + ".jpg";
    const asset = window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[path];
    if (!asset) return null;  // tuile manquante (edge case ou erreur génération)
    if (!asset.url && asset.file) {
      asset.url = URL.createObjectURL(asset.file);
      state.blobUrlsCreated.push(asset.url);
    }
    return asset.url || path;  // fallback path (mode serveur HTTP, futur)
  }

  // Helper : choix du niveau z à afficher selon le zoom courant de la map.
  // Clamp aux niveaux générés (min/maxNativeZoom). round() pour un comportement
  // équilibré entre netteté (z élevé) et perf (z bas = moins de tuiles).
  function _choisirNiveau(mapZoom) {
    const z = Math.max(MIN_NATIVE, Math.min(MAX_NATIVE, Math.round(mapZoom)));
    return z;
  }

  // Helper : génère les overlays d'un niveau z donné.
  function _renderNiveau(z) {
    // Cleanup overlays précédents
    state.activeOverlays.forEach(function(o) { try { o.remove(); } catch(e) {} });
    state.activeOverlays = [];

    const scale = Math.pow(2, -z);       // z=0 → 1, z=-1 → 2, z=-2 → 4, z=-3 → 8
    const lvlW  = Math.ceil(W / scale);
    const lvlH  = Math.ceil(H / scale);
    const cols  = Math.ceil(lvlW / TILE_SIZE);
    const rows  = Math.ceil(lvlH / TILE_SIZE);

    let added = 0, missing = 0;
    for (let k = 1; k <= rows; k++) {
      for (let col = 0; col < cols; col++) {
        const url = _resoudreUrlTuile(z, col, k);
        if (!url) { missing++; continue; }

        // Bounds Leaflet (CRS.Simple, lat = H_image - y_source).
        //   lat_min (south) = (k-1) * TILE_SIZE * scale
        //   lat_max (north) = k * TILE_SIZE * scale   (peut dépasser H si tuile partielle)
        //   lng_min (west)  = col * TILE_SIZE * scale
        //   lng_max (east)  = (col+1) * TILE_SIZE * scale  (peut dépasser W si dernière col partielle)
        const latMin = (k - 1) * TILE_SIZE * scale;
        const latMax = k       * TILE_SIZE * scale;
        const lngMin = col       * TILE_SIZE * scale;
        const lngMax = (col + 1) * TILE_SIZE * scale;

        const tileBounds = [[latMin, lngMin], [latMax, lngMax]];
        const overlay = L.imageOverlay(url, tileBounds, {
          interactive: false,
          // pane "tilePane" → s'affiche SOUS les overlays vectoriels et icons
          // (cohérent avec le rendu Leaflet standard)
          pane: "tilePane"
        });
        overlay.addTo(map);
        state.activeOverlays.push(overlay);
        added++;
      }
    }
    state.currentLevel = z;
    console.log("[Tiling V2] Niveau z=" + z + " — " + added + " tuiles affichées" +
                (missing > 0 ? " (" + missing + " manquantes)" : ""));
  }

  // Écoute des changements de zoom : swap de niveau si nécessaire.
  function _onZoom() {
    const z = _choisirNiveau(map.getZoom());
    if (z !== state.currentLevel) _renderNiveau(z);
  }
  map.on("zoomend", _onZoom);

  // Rendu initial (avant tout zoom, on prend le zoom courant de la map)
  _renderNiveau(_choisirNiveau(map.getZoom()));

  // Retourne les overlays courants pour API compat (main.js > _libererRessourcesPlanPrecedent
  // appelle libererTuiles sur ce retour). Pour V2, on a aussi besoin du cleanup
  // du listener zoomend + revoke des blob URLs créées. Le state est dans
  // window._tilingV2State, _libererRessourcesPlanPrecedent gère le cleanup global.
  state.zoomHandler = _onZoom;
  return state.activeOverlays;
}

// Cleanup spécifique V2 — appelé par main.js > _libererRessourcesPlanPrecedent
window._libererTuilesV2 = function() {
  const state = window._tilingV2State;
  if (!state) return;
  // Remove le listener zoomend
  if (window.map && state.zoomHandler) {
    try { window.map.off("zoomend", state.zoomHandler); } catch(e) {}
  }
  // Remove tous les overlays actifs
  state.activeOverlays.forEach(function(o) { try { o.remove(); } catch(e) {} });
  state.activeOverlays = [];
  // Revoke les blob URLs créées (économie mémoire)
  state.blobUrlsCreated.forEach(function(u) {
    try { URL.revokeObjectURL(u); } catch(e) {}
  });
  state.blobUrlsCreated = [];
  // Reset asset.url pour les tuiles qui pourraient être rechargées plus tard
  // (au plan switch, RUNTIME_ASSETS est wipé donc pas nécessaire — safety net)
  if (window.RUNTIME_ASSETS) {
    Object.keys(window.RUNTIME_ASSETS).forEach(function(k) {
      if (k.startsWith("data/tiles/")) {
        const a = window.RUNTIME_ASSETS[k];
        if (a && a.lazy === true) a.url = null;
      }
    });
  }
  window._tilingV2State = null;
  console.log("[Tiling V2] Cleanup OK");
};

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
