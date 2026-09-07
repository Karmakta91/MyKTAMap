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
  description:  "Découpe automatiquement les plans trop grands pour être affichés d’un bloc."
};

// Métadonnées du mode "off" — rendu direct via L.imageOverlay, pas de tiling du tout
// ⚠️ Risque de crash sur Safari iOS pour images > 8192 px (drawImage qui échoue)
const PERF_OFF_META = {
  label:        "Désactivé",
  emoji:        "💤",
  description:  "Aucun découpage : image entière. Sans effet sur un plan déjà tuilé."
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

  // Mode auto : 🩸 v1.86.0 — TRANCHE SUR LES PIXELS, plus sur le poids fichier.
  // AVANT : `fileSize > 60 Mo`. Un JPEG de 100 Mpx pèse ~15 Mo → auto ne tuilait
  // PAS, texture géante, crash Safari iOS ; alors que « Qualité » l'aurait tuilé.
  // Le défaut était donc le mode le MOINS protecteur — l'inverse de ce qu'il
  // promet. Pire, sur un plan SERVEUR `fileSize` vaut toujours null (map.js le
  // cherche dans RUNTIME_ASSETS, que chargerPlanServeur ne remplit jamais) :
  // auto ne tuilait alors JAMAIS, quelle que soit la taille.
  // Le poids fichier reste en second critère (un gros fichier peu défini reste
  // coûteux à décoder), mais il n'est plus le seul.
  if (p === "auto") {
    const surfaceKO = (typeof imageW === "number" && typeof imageH === "number")
      && (imageW * imageH) > TUILING_NECESSAIRE_PIXELS;
    const poidsKO   = (typeof fileSize === "number" && fileSize > PERF_AUTO_TILE_THRESHOLD);
    const tile      = surfaceKO || poidsKO;
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

  // 🧱 Tiling V2 (v149) : si le plan-config indique `plan.tiledV2: true` ET
  // contient une section `tiling` (manifest), on bascule sur le runtime
  // Option B : N L.imageOverlay par niveau de zoom, swap on zoomend.
  // Cf createConf.js > _genererTuilesV2 pour la génération côté planner.
  //
  // 🩸 v1.86.0 (décision KARMA) — UN PLAN V2 TUILE TOUJOURS. Le contournement
  // `perfPreset === "off"` de la v151, qui rechargeait le baseImage entier en
  // un seul L.imageOverlay, est SUPPRIMÉ : c'était exactement le cas de crash
  // Safari iOS qu'on cherche à éviter, offert en un clic, sans avertissement.
  // Le baseImage reste dans le ZIP — il sert au dézip manuel et au repli
  // d'erreur ci-dessous — mais il n'est plus un MODE proposé à l'utilisateur.
  // `off` ne concerne donc plus que les plans V1.
  //
  // 🏗️ v1.67.0 : registre des overlays du plan PRINCIPAL en rendu direct
  // (non tuilé) — sans référence, le filtre multi-niveau ne pourrait pas le
  // masquer. Reset à chaque chargement (un seul plan à la fois).
  window._ktaBaseLayers = [];
  window._ktaBaseHidden = false;

  const pc = window.PLAN_CONFIG;
  if (pc && pc.plan && pc.plan.tiledV2 === true && pc.tiling) {
    if (preset === "off") {
      console.log("[Tiling] Plan V2 : « Désactivé » ignoré — un plan tuilé utilise toujours ses tuiles");
    }
    console.log("[Tiling] Mode V2 (Option B : multi-imageOverlay swap on zoom)");
    return _chargerImageV2OptionB(url, bounds, map, pc.tiling);
  }
  // ⚠️ v1.86.0 — « Désactivé » sur un plan V1 TROP GRAND : c'est exactement le
  // cas de crash Safari iOS (une seule texture > limite GPU). On ne l'interdit
  // pas — c'est un choix explicite, utile sur PC pour la qualité native — mais
  // on le DIT, ce qui n'était fait nulle part.
  if (preset === "off" && (W * H) > TUILING_NECESSAIRE_PIXELS) {
    console.warn("[Tiling] « Désactivé » sur une image de " + W + "×" + H +
                 " px (> 4096²) — rendu direct, risque de crash mémoire sur mobile.");
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(
        (window.I18n && window.I18n.t)
          ? window.I18n.t("tiling.off.grosPlan")
          : "Découpage désactivé sur un très grand plan — risque de plantage sur mobile.",
        "warn");
    }
  }
  const r = resoudrePerfPreset(preset, fileSize, W, H);

  if (r.tile && r.params) {
    console.log("[Tiling] Mode", preset, "—",
                fileSize ? Math.round(fileSize/1024/1024)+"Mo" : "taille inconnue",
                "params:", r.params.maxWorkDim+"px / tile "+r.params.tileSize+" / Q "+r.params.jpegQuality);
    return await chargerImageTuillee(url, bounds, map, sourceFile, r.params);
  }
  console.log("[Tiling] Rendu direct (mode "+preset+")");
  window._ktaBaseLayers.push(L.imageOverlay(url, bounds).addTo(map));
  return [];
}

// =========================
// 🏗️ v1.67.0 — LE PLAN PRINCIPAL EST LE NIVEAU 0 (décision KARMA)
// =========================
// Le filtre multi-niveau masquait les CALQUES image par niveau mais jamais le
// plan principal — impossible de regarder le niveau -1/+1 seul (le fond
// restait affiché et « polluait » la superposition). Le plan principal est
// désormais traité comme niveau 0 : décocher 0 dans la modale Niveaux le
// masque (net, reco 2:a), le re-cocher le réaffiche. Couvre les 3 modes de
// rendu : direct (_ktaBaseLayers), tuiles runtime V1 (_baseTiles), tuiles V2
// (_tilingV2State.activeOverlays + garde _ktaBaseHidden dans _renderNiveau
// pour les swaps de zoom). Appelé par appliquerFiltreNiveau (dispatcher).
window._applyLevelFilterToBasePlan = function() {
  if (!window.map) return;
  const cfg = window.APP_CONFIG;
  const visible = !(cfg && cfg.multiLevel === true)
    || !Array.isArray(cfg.visibleLevels)
    || cfg.visibleLevels.indexOf(0) >= 0;
  window._ktaBaseHidden = !visible;
  function _tog(ov) {
    if (!ov) return;
    try {
      if (visible) { if (!window.map.hasLayer(ov)) window.map.addLayer(ov); }
      else         { if (window.map.hasLayer(ov))  window.map.removeLayer(ov); }
    } catch(e) {}
  }
  (window._ktaBaseLayers || []).forEach(_tog);
  (window._baseTiles || []).forEach(function(t) { _tog(t && t.overlay); });
  const st = window._tilingV2State;
  if (st && Array.isArray(st.activeOverlays)) st.activeOverlays.forEach(_tog);
};

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
function _chargerImageV2OptionB(urlBase, bounds, map, tilingManifest) {
  const H = bounds[1][0];
  const W = bounds[1][1];

  const TILE_SIZE = tilingManifest.tileSize || 512;
  const MIN_NATIVE = (Number.isInteger(tilingManifest.minNativeZoom)) ? tilingManifest.minNativeZoom : -3;
  const MAX_NATIVE = (Number.isInteger(tilingManifest.maxNativeZoom)) ? tilingManifest.maxNativeZoom : 0;
  // 🫥 v1.62.0 : extension d'après le manifest (webp/png = tuiles avec alpha,
  // jpg = plans V2 historiques — rétrocompat totale via ktaTileExt)
  const TILE_EXT = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(tilingManifest) : "jpg";

  // État du runtime V2 — exposé en window pour cleanup côté main.js plan switch
  const state = {
    currentLevel: null,        // z courant
    activeOverlays: [],        // [L.imageOverlay] actuellement affichés
    blobUrlsCreated: [],       // [string] pour revoke au cleanup global (plan switch)
    // 🆕 v1.26.4 (P0-2 RAM) — LRU des tuiles décodées PAR NIVEAU de zoom.
    // Avant, chaque niveau visité gardait ses bitmaps décodés vivants toute
    // la session (asset.url jamais révoqué intra-session) → la RAM croissait
    // au fil de la navigation zoom/pan. On ne garde plus que les MAX_CACHED
    // niveaux les plus récents ; les autres sont révoqués (bitmap GC), quitte
    // à re-décoder au retour (coût CPU acceptable vs fuite RAM).
    blobAssetsByLevel: {},     // { z: [asset, ...] } — assets décodés par niveau
    levelLRU: [],              // ordre d'accès des niveaux (MRU en fin de tableau)
    repliFait: false,          // 🩸 v1.86.0 — repli baseImage déjà posé (une seule fois)
    erreursPremier: 0,         // tuiles du PREMIER rendu qui ont échoué à charger
    attendusPremier: 0         // tuiles du PREMIER rendu qu'on a demandées
  };
  window._tilingV2State = state;

  // 🌐 v1.86.0 — RACINE DES TUILES EN MODE SERVEUR.
  // `chargerPlanServeur` ne fait AUCUN registerAsset : pour un plan servi en
  // HTTP, RUNTIME_ASSETS est vide et toutes les tuiles étaient introuvables
  // → carte blanche. Or les chemins d'un plan serveur sont ABSOLUS depuis la
  // racine du site (`data/test/TestMAP.png`), alors que le manifest V2 code
  // des chemins relatifs au ZIP (`data/tiles/…`).
  // On dérive donc la racine HTTP du dossier du baseImage, sauf si le
  // plan-config fournit un `tiling.tilesDir` explicite (échappatoire pour un
  // déploiement non standard).
  // ⚠️ Un plan LOCAL a un baseImage réécrit en `blob:` (config.js) → on rend
  // null et RIEN ne change pour l'import ZIP, qui n'a jamais eu besoin de ça.
  const RACINE_SRV = (function () {
    const pc = window.PLAN_CONFIG;
    if (!pc || !pc.plan) return null;
    const dir = tilingManifest && typeof tilingManifest.tilesDir === "string" && tilingManifest.tilesDir;
    if (dir) return dir.replace(/\/+$/, "");
    const bi = pc.plan.baseImage;
    if (typeof bi !== "string" || /^(blob:|data:)/.test(bi)) return null;  // plan importé (ZIP)
    const i = bi.lastIndexOf("/");
    return (i > 0) ? bi.slice(0, i) + "/tiles" : "tiles";
  })();
  if (RACINE_SRV) console.log("[Tiling V2] Racine tuiles serveur :", RACINE_SRV);

  // Chemin d'une tuile TEL QU'IL EST DANS LE ZIP. Utilisé pour la recherche
  // dans RUNTIME_ASSETS et pour le pré-extract lazy — un seul endroit à
  // changer si le générateur change sa mise en page.
  function _cheminTuileZip(z, col, k) {
    return "data/tiles/z" + z + "/x" + col + "_y" + (-k) + "." + TILE_EXT;
  }

  // Nombre de niveaux dont on garde les bitmaps décodés en RAM. Courant + 1
  // adjacent suffit pour un zoom/dézoom fluide. Sur device riche, on peut se
  // permettre un de plus pour limiter les re-décodages.
  const _lowMem = (typeof navigator !== "undefined"
                   && ((navigator.deviceMemory && navigator.deviceMemory < 6)
                       || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "")));
  const MAX_CACHED_LEVELS = _lowMem ? 2 : 4;

  // Helper : résout l'URL d'une tuile (z, col, k=-row). Lazy → crée la blob URL
  // au premier appel et la réutilise ensuite (asset.url cached). Range l'asset
  // dans le bucket du niveau z pour le LRU.
  function _resoudreUrlTuile(z, col, k) {
    const path = _cheminTuileZip(z, col, k);
    const asset = window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[path];
    if (!asset) {
      // 🌐 v1.86.0 — pas d'asset en mémoire : plan SERVEUR, on lit en HTTP.
      // (null seulement si on n'est pas en mode serveur : vraie tuile manquante)
      return RACINE_SRV
        ? RACINE_SRV + "/z" + z + "/x" + col + "_y" + (-k) + "." + TILE_EXT
        : null;
    }
    if (!asset.url && asset.file) {
      asset.url = URL.createObjectURL(asset.file);
      state.blobUrlsCreated.push(asset.url);
      if (!state.blobAssetsByLevel[z]) state.blobAssetsByLevel[z] = [];
      state.blobAssetsByLevel[z].push(asset);
    }
    return asset.url || path;  // fallback path (mode serveur HTTP, futur)
  }

  // 🆕 v1.26.4 (P0-2 RAM) — Marque z comme niveau le plus récent et révoque
  // les bitmaps des niveaux au-delà du cap LRU (libère la RAM décodée).
  // 🐛 v1.34.11 (Pack RAM Phase 2) — Libère AUSSI asset.file pour les assets
  // qui ont un _zipPath (= stubs lazy). Au prochain accès, _extractLazyAsset
  // re-créera le File depuis window._lazyZipRef. C'est ce nullify-of-file qui
  // apporte le vrai gain RAM (sinon, le File JPEG restait pinned éternellement).
  // Pour les assets eager (sans _zipPath), on ne libère PAS le file (pas de
  // source de re-extraction → on perdrait la tuile).
  function _trimLevelsLRU(currentZ) {
    const i = state.levelLRU.indexOf(currentZ);
    if (i >= 0) state.levelLRU.splice(i, 1);
    state.levelLRU.push(currentZ);  // MRU
    while (state.levelLRU.length > MAX_CACHED_LEVELS) {
      const oldZ = state.levelLRU.shift();  // LRU
      const assets = state.blobAssetsByLevel[oldZ];
      if (!assets) continue;
      let urlsLib = 0, filesLib = 0;
      assets.forEach(function(a) {
        if (a && a.url) {
          try { URL.revokeObjectURL(a.url); } catch(e) {}
          a.url = null;  // force re-création lazy au prochain accès → bitmap GC
          urlsLib++;
        }
        // 🐛 v1.34.11 — Libère le File si l'asset peut être re-extrait via _zipPath.
        if (a && a.file && a._zipPath) {
          a.file = null;
          filesLib++;
        }
      });
      delete state.blobAssetsByLevel[oldZ];
      console.log("[Tiling V2] LRU : niveau z=" + oldZ + " révoqué (" + urlsLib + " URLs + " + filesLib + " fichiers libérés sur " + assets.length + " tuiles)");
    }
  }

  // Helper : choix du niveau z à afficher selon le zoom courant de la map.
  // Clamp aux niveaux générés (min/maxNativeZoom). round() pour un comportement
  // équilibré entre netteté (z élevé) et perf (z bas = moins de tuiles).
  function _choisirNiveau(mapZoom) {
    const z = Math.max(MIN_NATIVE, Math.min(MAX_NATIVE, Math.round(mapZoom)));
    return z;
  }

  // Helper : génère les overlays d'un niveau z donné.
  // 🐛 v1.34.11 (Pack RAM Phase 2) — Devient ASYNC. Pré-extract Promise.all
  // sur toutes les tuiles du niveau AVANT le render loop. Pour les tuiles
  // déjà extraites (asset.file présent), no-op. Pour les stubs lazy ou les
  // tuiles évincées par LRU (file = null + _zipPath), _extractLazyAsset les
  // re-extrait depuis window._lazyZipRef.
  // Level guard via token monotone : si user zoom rapidement, un appel ultérieur
  // invalide le rendu en cours (avoid wasted work + ne pas afficher un niveau
  // obsolète après un zoom plus récent).
  async function _renderNiveau(z) {
    // 🐛 v1.34.11 — Token monotone pour level guard.
    state.renderToken = (state.renderToken || 0) + 1;
    const myToken = state.renderToken;

    const scale = Math.pow(2, -z);       // z=0 → 1, z=-1 → 2, z=-2 → 4, z=-3 → 8
    const lvlW  = Math.ceil(W / scale);
    const lvlH  = Math.ceil(H / scale);
    const cols  = Math.ceil(lvlW / TILE_SIZE);
    const rows  = Math.ceil(lvlH / TILE_SIZE);

    // 🐛 v1.34.11 — Pré-extract async des tuiles lazy du niveau AVANT le cleanup
    // des anciens overlays. Tant que le pre-extract est en cours, les anciens
    // overlays restent affichés (Leaflet auto-rescale visuellement) → pas de
    // flash blanc à l'utilisateur. On collecte tous les paths, filtre ceux qui
    // ont besoin d'extraction (lazy + no file + has _zipPath), puis Promise.all().
    if (typeof window._extractLazyAsset === "function" && window.RUNTIME_ASSETS) {
      const aExtraire = [];
      for (let k = 1; k <= rows; k++) {
        for (let col = 0; col < cols; col++) {
          const path = _cheminTuileZip(z, col, k);
          const asset = window.RUNTIME_ASSETS[path];
          if (asset && !asset.file && asset._zipPath) {
            aExtraire.push(path);
          }
        }
      }
      if (aExtraire.length > 0) {
        const tDebut = Date.now();
        await Promise.all(aExtraire.map(function(p) {
          return window._extractLazyAsset(p).catch(function(e) {
            console.warn("[Tiling V2] Pre-extract failed for", p, e);
            return null;
          });
        }));
        console.log("[Tiling V2] Lazy : " + aExtraire.length + " tuile(s) extraite(s) pour z=" + z + " en " + (Date.now() - tDebut) + " ms");
      }
    }

    // 🐛 v1.34.11 — Level guard : si un autre _renderNiveau a été lancé pendant
    // notre pre-extract (zoom rapide user), on abandonne pour éviter d'afficher
    // un niveau obsolète après un zoom plus récent.
    if (myToken !== state.renderToken) {
      console.log("[Tiling V2] z=" + z + " obsolète (token " + myToken + " != " + state.renderToken + ") — render annulé");
      return;
    }

    // Cleanup overlays précédents (juste avant le render pour éviter le flash blanc)
    state.activeOverlays.forEach(function(o) { try { o.remove(); } catch(e) {} });
    state.activeOverlays = [];

    let added = 0, missing = 0;
    // Capturé AVANT la boucle : state.currentLevel sera réaffecté juste après.
    const premierRendu = (state.currentLevel === null);
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
        // 🏗️ v1.67.0 : le plan principal EST le niveau 0 — si le filtre
        // multi-niveau le masque, les tuiles du swap zoom restent hors map
        // (mais tracées dans activeOverlays pour le ré-affichage).
        // 🌐 v1.86.0 — DÉTECTION D'UN DÉPLOIEMENT SERVEUR RATÉ. En mode
        // serveur les URLs sont des chemins HTTP : elles « résolvent »
        // toujours, même si le fichier n'existe pas. `added` ne dit donc plus
        // rien — c'est l'événement `error` de Leaflet qui parle. Si TOUTES les
        // tuiles du tout premier rendu échouent, on replie sur baseImage.
        // Capturé sur `premierRendu` (local) et non sur `state.currentLevel`,
        // qui est déjà réaffecté quand l'erreur asynchrone arrive.
        overlay.on("error", function () {
          if (!premierRendu || state.repliFait) return;
          state.erreursPremier++;
          if (state.attendusPremier > 0 && state.erreursPremier >= state.attendusPremier) {
            _repliBaseImage("les " + state.attendusPremier + " tuiles du premier rendu ont échoué au chargement");
          }
        });
        if (!window._ktaBaseHidden) overlay.addTo(map);
        state.activeOverlays.push(overlay);
        added++;
      }
    }
    if (premierRendu) state.attendusPremier = added;
    state.currentLevel = z;
    // 🆕 v1.26.4 (P0-2 RAM) — marque z comme MRU + révoque les bitmaps des
    // niveaux les moins récents au-delà du cap (libère la RAM décodée).
    _trimLevelsLRU(z);
    console.log("[Tiling V2] Niveau z=" + z + " — " + added + " tuiles affichées" +
                (missing > 0 ? " (" + missing + " manquantes)" : ""));

    // 🩸 v1.86.0 — REPLI D'ERREUR (pas un mode : une récupération).
    // Un plan V2 tuile TOUJOURS (décision KARMA) — mais si les tuiles sont
    // réellement inatteignables, mieux vaut l'image entière qu'une carte
    // blanche muette. Deux déclencheurs :
    //   • aucune tuile RÉSOLUE  → ni en mémoire, ni de racine serveur ;
    //   • toutes les tuiles du premier rendu en ERREUR de chargement →
    //     déploiement serveur incorrect (tuiles ailleurs que `<plan>/tiles/`).
    // Une seule fois par chargement : sans le drapeau, chaque zoom empilerait
    // un overlay plein format de plus.
    function _repliBaseImage(motif) {
      if (state.repliFait) return;
      state.repliFait = true;
      console.error("[Tiling V2] " + motif + " — repli sur baseImage. " +
                    "Plan V2 servi en HTTP : les tuiles doivent être dans « " +
                    (RACINE_SRV || "<dossier du plan>/tiles") + " ».");
      try {
        const ovRepli = L.imageOverlay(urlBase, bounds).addTo(map);
        window._ktaBaseLayers.push(ovRepli);
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(
            (window.I18n && window.I18n.t)
              ? window.I18n.t("tiling.v2.repli")
              : "Tuiles introuvables — image entière affichée.",
            "warn");
        }
      } catch (e) {
        console.error("[Tiling V2] Repli baseImage impossible :", e);
      }
    }

    if (added === 0 && missing > 0) _repliBaseImage("AUCUNE tuile résolue (" + missing + " manquantes)");
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
  // 🆕 v1.26.4 (P0-2 RAM) — reset des structures LRU (les URLs déjà révoquées
  // ci-dessus, double-revoke inoffensif ; on vide juste les buckets).
  state.blobAssetsByLevel = {};
  state.levelLRU = [];
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

        // 🫥 v1.62.0 — Détection d'alpha AVANT de peindre : une source
        // transparente garde son canal alpha de bout en bout (pas de fond).
        const hasAlpha = (typeof window.ktaDetecterAlpha === "function")
          ? window.ktaDetecterAlpha(img)
          : false;
        canvas._ktaHasAlpha = hasAlpha;
        if (hasAlpha) console.log("[Tiling] Source transparente — alpha conservé (pas de fond)");

        // Fond charte sombre #0a0d18 (au lieu de blanc) — apparait pendant le
        // tile loading et autour des bords de l'image si elle ne couvre pas tout.
        // Cohérent avec le fond de la map (.leaflet-container = #000000) et la
        // charte loader. ⚠️ NE PAS mettre #000000 strict : la detection
        // "canvas noir" plus bas check pixel (0,0,0) opaque — un fond noir pur
        // ferait un faux positif. #0a0d18 est visuellement equivalent mais
        // distinct. 🫥 v1.62.0 : AUCUN fond si la source a de l'alpha.
        if (!hasAlpha) {
          ctx.fillStyle = "#0a0d18";
          ctx.fillRect(0, 0, workW, workH);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, workW, workH);

        // Détection canvas noir — drawImage JPEG échoué silencieusement.
        // 🫥 v1.62.0 : le pixel doit être OPAQUE (a=255) pour compter comme
        // « noir suspect » — un pixel transparent (0,0,0,0) est légitime.
        let estNoir = false;
        try {
          const px = ctx.getImageData(1, 1, 1, 1).data;
          estNoir = (px[0] === 0 && px[1] === 0 && px[2] === 0 && px[3] === 255);
        } catch(e) {}

        if (estNoir) {
          console.warn("[Tiling] Canvas noir — re-essai dans 100ms");
          setTimeout(function() {
            if (hasAlpha) {
              ctx.clearRect(0, 0, workW, workH);
            } else {
              ctx.fillStyle = "#0a0d18";
              ctx.fillRect(0, 0, workW, workH);
            }
            ctx.drawImage(img, 0, 0, workW, workH);
            // Vérifier à nouveau
            let encoreNoir = false;
            try {
              const px2 = ctx.getImageData(1, 1, 1, 1).data;
              encoreNoir = (px2[0] === 0 && px2[1] === 0 && px2[2] === 0 && px2[3] === 255);
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

  // 🫥 v1.62.0 — Canvas de travail avec alpha (flag posé par
  // _imageVersCanvasReduit) : tuiles SANS fond, encodées avec transparence
  // (WebP si encodable, sinon PNG). Sinon : JPEG + fond charte historiques.
  const hasAlpha = !!srcCanvas._ktaHasAlpha;
  const fmt = hasAlpha
    ? await window.ktaProbeAlphaTileFormat()
    : { mime: "image/jpeg", ext: "jpg", name: "jpeg" };
  const fmtQuality = (fmt.mime === "image/webp") ? 0.90
                   : (fmt.mime === "image/jpeg") ? jpegQuality
                   : undefined;

  console.log("[Tiling]", nbX+"×"+nbY, "=", nbX*nbY, "tuiles depuis canvas", workW+"×"+workH,
              "(tile "+tileSize+", " + fmt.name + (fmtQuality ? " Q "+fmtQuality : "") +
              (hasAlpha ? ", alpha conservé" : "") + ")");

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

      if (!hasAlpha) {
        tCtx.fillStyle = "#0a0d18";
        tCtx.fillRect(0, 0, tileW, tileH);
      }
      tCtx.drawImage(srcCanvas, srcX, srcY, srcW, srcH, 0, 0, tileW, tileH);

      const blobUrl = await _canvasToBlob(tuile, fmt.mime, fmtQuality);

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
    // 🐛 v1.34.16 (Pack RAM Phase 4 — Fix #B) — Clear img.src AVANT
    // removeLayer pour FORCER iOS Safari à libérer la bitmap décodée.
    // Sans ce clear, removeLayer détache le DOM mais WebKit garde le
    // bitmap décodé pinned en cache GPU/mémoire native — invisible à
    // jsHeapSizeUsed mais bien comptée dans le budget mémoire iPhone
    // PWA (~200-500 Mo selon device).
    // Sur plan V1 base tile non-V2 dense (864 tuiles × 512×512×4 =
    // jusqu'à 864 Mo de bitmaps théoriques), c'est probablement la
    // cause majeure du crash iPhone PWA répété (cf audit autonome
    // v1.34.16 fuite #9). Coût négligeable côté CPU (1 assignement
    // par tuile).
    try {
      if (t.overlay && t.overlay._image) t.overlay._image.src = "";
    } catch(e) {}
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
