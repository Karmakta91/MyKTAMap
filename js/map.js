// =========================
// MAP.JS — unifié serveur + import navigateur
// =========================

let map, bounds, collisionCanvas, collisionCtx;

// Icônes globales — seules iconeDefault et iconeTrack sont consommées hors map.js
// (cf. utils.js, editor.js, interface.js, tracking.js). Tous les autres tags sont
// résolus via window._iconMap[tag] (cf. cascade getIconUrlForPoint dans utils.js).
let iconeDefault, iconeTrack;

// =========================
// ICÔNES
// =========================
function creerIcones(iconConfig) {
  // URL pour le tracker (toujours iconetrack.png)
  const trackUrl = iconConfig.track || "icon/iconetrack.png";

  // Si pas d'icône default fournie, on utilisera le marker natif Leaflet
  // (pin bleu standard) pour bien différencier des points custom
  const useLeafletDefault = !iconConfig.default;

  function makeDefaultIcon() {
    if (useLeafletDefault) {
      // Icône native Leaflet (pin bleu classique)
      return new L.Icon.Default();
    }
    return L.icon({
      iconUrl:    iconConfig.default,
      iconSize:   [50, 50],
      iconAnchor: [25, 25]
    });
  }

  const mk = function(url, w, h, ax, ay) {
    if (!url) return makeDefaultIcon();
    return L.icon({
      iconUrl:    url,
      iconSize:   [w, h],
      iconAnchor: [ax, ay]
    });
  };

  iconeDefault = makeDefaultIcon();
  iconeTrack   = L.icon({ iconUrl: trackUrl, iconSize: [50, 50], iconAnchor: [25, 25] });

  // Globaux exposés : iconeDefault sert de fallback ultime (utils.js, editor.js,
  // interface.js) et iconeTrack est consommé par tracking.js. Les ex-globaux
  // par-tag (iconeSalle, iconepa, iconeChatiere, etc.) ont été retirés — la
  // résolution se fait désormais via window._iconMap[tag].
  window.iconeDefault = iconeDefault;
  window.iconeTrack   = iconeTrack;

  // Map dynamique : tag → L.icon — supporte tous les tags définis dans plan-config.json
  window._iconMap = {};
  Object.keys(iconConfig).forEach(function(tag) {
    const url = iconConfig[tag];
    if (!url) {
      // Tag défini mais sans URL → icône par défaut
      window._iconMap[tag] = makeDefaultIcon();
      return;
    }
    window._iconMap[tag] = L.icon({
      iconUrl:    url,
      iconSize:   [50, 50],
      iconAnchor: [25, 25]
    });
  });

  // Tags par défaut : si le plan-config ne les déclare pas, on les ajoute quand même
  // (ils seront chargés depuis icon/<tag>.png si le PNG existe, sinon icône par défaut)
  // Permet d'utiliser ces tags sur des plans existants sans modifier leur plan-config.json
  const TAGS_BUILTIN = {
    salle:    "icon/house.png",
    pa:       "icon/pa.png",
    pc:       "icon/pc.png",
    pb:       "icon/pb.png",
    pe:       "icon/pe.png",
    ps:       "icon/ps.png",
    peo:      "icon/peo.png",
    pef:      "icon/pef.png",
    eso:      "icon/eso.png",
    esf:      "icon/esf.png",
    cao:      "icon/cao.png",
    caf:      "icon/caf.png",
    vehicule: "icon/vehicule.png",
    elec:     "icon/elec.png",
    epure:    "icon/epure.png",
    info:     "icon/info.png",
    chatiere: "icon/chatiere.png",
    passage:  "icon/passage.png",
    danger:   "icon/danger.png"
  };
  Object.keys(TAGS_BUILTIN).forEach(function(tag) {
    if (!window._iconMap[tag]) {
      window._iconMap[tag] = L.icon({
        iconUrl:    TAGS_BUILTIN[tag],
        iconSize:   [50, 50],
        iconAnchor: [25, 25]
      });
    }
  });

  // Garantir que "default" est toujours présent dans _iconMap
  if (!window._iconMap.default) {
    window._iconMap.default = iconeDefault;
  }

  console.log("[Map] Icônes créées —", Object.keys(window._iconMap).length, "tags |",
              useLeafletDefault ? "default = pin Leaflet natif" : "default = " + iconConfig.default);
}

// =========================
// NETTOYAGE CARTE EXISTANTE
// =========================
function cleanupExistingMap() {
  if (window.map) {
    try { window.map.remove(); } catch(e) {}
  }
  let mapContainer = document.getElementById("map");
  if (!mapContainer) {
    mapContainer = document.createElement("div");
    mapContainer.id = "map";
    document.body.appendChild(mapContainer);
  }
  mapContainer._leaflet_id = undefined;
  mapContainer.innerHTML   = "";
  mapContainer.style.display = "block";
  window.map = null;
  map        = null;
}

// =========================
// INITIALISATION CARTE
// =========================
async function initMapFromConfig() {
  const config = window.PLAN_CONFIG;
  if (!config?.plan) throw new Error("PLAN_CONFIG non chargé");

  cleanupExistingMap();
  await new Promise(function(resolve) { requestAnimationFrame(resolve); });

  const mapContainer = document.getElementById("map");
  if (!mapContainer) throw new Error("#map introuvable");

  // Afficher #map maintenant que le loader est masqué
  mapContainer.style.display = "block";
  mapContainer.style.width   = "100%";
  mapContainer.style.height  = "100%";

  // Appliquer APP_CONFIG
  Object.assign(APP_CONFIG, {
    imageHeight:   config.plan.imageHeight,
    imageWidth:    config.plan.imageWidth,
    startX:        config.tracking?.startX       ?? 0,
    startY:        config.tracking?.startY       ?? 0,
    scale:         config.tracking?.scale        ?? 1,
    stepLength:    config.tracking?.stepLength   ?? 0.7,
    stepThreshold: config.tracking?.stepThreshold ?? 13,
    stepCooldown:  config.tracking?.stepCooldown  ?? 400
  });

  creerIcones(config.icons);

  bounds = [[0, 0], [config.plan.imageHeight, config.plan.imageWidth]];

  // Sur mobile, on autorise un dezoom plus profond (-4 au lieu de -2 = 4×
  // plus zoomable arrière) pour donner de la marge autour du plan. Cas
  // d'usage : un point près du bord ouvre une popup qui sort du cadre ;
  // l'utilisateur peut alors dezoomer pour avoir plus d'espace écran libre
  // autour du marker. Desktop garde -2 (plein écran suffisant).
  const _isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  const _minZoom  = _isMobile ? -4 : -2;

  map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: _minZoom,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0,
    // Rendu canvas pour les overlays vectoriels (polylines routes, polygons zones,
    // circleMarker intersections). Évite la création de N éléments SVG/DOM, gros
    // gain perf sur mobile pour les plans denses. Markers (L.marker) restent en DOM
    // car ils utilisent des icon images — pas affectés par preferCanvas.
    preferCanvas: true
  });
  map.setMaxBounds(bounds);
  map.setMinZoom(_minZoom);
  map.setMaxZoom(2);

  window.map    = map;
  window.bounds = bounds;

  // Récupérer le File source si disponible (mode import)
  const baseAsset = Object.values(window.RUNTIME_ASSETS || {}).find(function(a) {
    return a.url === config.plan.baseImage;
  });
  const baseFile = baseAsset?.file || null;
  const baseSize = baseFile?.size  || null;

  window._baseTiles = await chargerImage(config.plan.baseImage, bounds, map, baseSize, baseFile);

  // Calques données
  const dataLayerGroups = {};
  const overlays = {};

  (config.dataLayers || []).forEach(function(layerConfig) {
    const group = L.layerGroup();
    if (layerConfig.visible) group.addTo(map);
    dataLayerGroups[layerConfig.id] = group;
    overlays[layerConfig.label]     = group;
  });

  // Calques image
  const sortedImageLayers = [...(config.imageLayers || [])].sort(function(a, b) {
    return (a.order || 0) - (b.order || 0);
  });

  sortedImageLayers.forEach(function(layerConfig) {
    const overlay = L.imageOverlay(layerConfig.file, bounds);
    if (layerConfig.visible) overlay.addTo(map);
    overlays[layerConfig.label] = overlay;
  });

  L.control.layers(null, overlays).addTo(map);

  // Collision
  await initCollisionMap(config.plan.collisionImage);

  window.layerPuits     = dataLayerGroups.puits;
  window.layerVehicule  = dataLayerGroups.vehicule;
  window.layerCataphile = dataLayerGroups.cataphile;
  window.layerCarry     = dataLayerGroups.carry;
  window.dataLayerGroups = dataLayerGroups;
  window.layerEditor    = dataLayerGroups.editor;

  console.log("[Map] Carte initialisée");
}

// =========================
// COLLISION
// =========================
function initCollisionMap(imagePath) {
  const MAX_CANVAS_DIM = 4096;
  return new Promise(function(resolve) {
    if (!imagePath) {
      window.collisionCtx = null;
      window.collisionCanvas = null;
      resolve(); return;
    }
    const img = new Image();
    requestAnimationFrame(function() { img.src = imagePath; });
    img.onload = function() {
      try {
        let w = img.width, h = img.height;
        if (w > MAX_CANVAS_DIM || h > MAX_CANVAS_DIM) {
          const r = Math.min(MAX_CANVAS_DIM / w, MAX_CANVAS_DIM / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        collisionCanvas = document.createElement('canvas');
        collisionCanvas.width  = w;
        collisionCanvas.height = h;
        collisionCtx = collisionCanvas.getContext('2d', { willReadFrequently: true });
        collisionCtx.drawImage(img, 0, 0, w, h);
        img.src = "";
        window.collisionCtx    = collisionCtx;
        window.collisionCanvas = collisionCanvas;
        resolve();
      } catch(err) {
        console.error("[Collision] OOM :", err);
        window.collisionCtx = null;
        window.collisionCanvas = null;
        resolve();
      }
    };
    img.onerror = function() {
      window.collisionCtx = null;
      window.collisionCanvas = null;
      resolve();
    };
  });
}

window.initMapFromConfig = initMapFromConfig;
