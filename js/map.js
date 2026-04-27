// =========================
// MAP.JS — unifié serveur + import navigateur
// =========================

let map, bounds, collisionCanvas, collisionCtx;

// Icônes globales
let iconeDefault, iconeSalle, iconepa, iconepc, iconepb;
let iconeVehicule, iconeElec, iconeEpure, iconePS;
let iconeInfo, iconeChatiere, iconePassage, iconeDanger, iconepe, iconeTrack;

// =========================
// ICÔNES
// =========================
function creerIcones(iconConfig) {
  const mk = function(url, w, h, ax, ay) {
    return L.icon({ iconUrl: url, iconSize: [w, h], iconAnchor: [ax, ay] });
  };
  iconeDefault  = mk(iconConfig.default,  50, 50, 25, 25);
  iconeSalle    = mk(iconConfig.salle,    50, 50, 25, 25);
  iconepa       = mk(iconConfig.pa,       50, 50, 25, 25);
  iconepc       = mk(iconConfig.pc,       50, 50, 25, 25);
  iconepb       = mk(iconConfig.pb,       50, 50, 25, 25);
  iconeVehicule = mk(iconConfig.vehicule, 50, 25, 25, 13);
  iconeElec     = mk(iconConfig.elec,     50, 50, 25, 25);
  iconeEpure    = mk(iconConfig.epure,    50, 50, 25, 25);
  iconePS       = mk(iconConfig.ps,       50, 50, 25, 25);
  iconeInfo     = mk(iconConfig.info,     50, 50, 25, 25);
  iconeChatiere = mk(iconConfig.chatiere, 50, 50, 25, 25);
  iconePassage  = mk(iconConfig.passage,  50, 50, 25, 25);
  iconeDanger   = mk(iconConfig.danger,   50, 50, 25, 25);
  iconepe       = mk(iconConfig.pe,       50, 50, 25, 25);
  iconeTrack    = mk(iconConfig.track,    50, 50, 25, 25);

  window.iconeDefault  = iconeDefault;
  window.iconeSalle    = iconeSalle;
  window.iconepa       = iconepa;
  window.iconepc       = iconepc;
  window.iconepb       = iconepb;
  window.iconeVehicule = iconeVehicule;
  window.iconeElec     = iconeElec;
  window.iconeEpure    = iconeEpure;
  window.iconePS       = iconePS;
  window.iconeInfo     = iconeInfo;
  window.iconeChatiere = iconeChatiere;
  window.iconePassage  = iconePassage;
  window.iconeDanger   = iconeDanger;
  window.iconepe       = iconepe;
  window.iconeTrack    = iconeTrack;

  // Map dynamique : tag → L.icon — supporte tous les tags définis dans plan-config.json
  window._iconMap = {};
  Object.keys(iconConfig).forEach(function(tag) {
    if (!iconConfig[tag]) return;
    const isVehicule = (tag === "vehicule");
    window._iconMap[tag] = L.icon({
      iconUrl:    iconConfig[tag],
      iconSize:   isVehicule ? [50, 25] : [50, 50],
      iconAnchor: isVehicule ? [25, 13] : [25, 25]
    });
  });
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

  map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0
  });
  map.setMaxBounds(bounds);
  map.setMinZoom(-2);
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

  window.layerPuits    = dataLayerGroups.puits;
  window.layerVehicule = dataLayerGroups.vehicule;
  window.layerCataphile = dataLayerGroups.cataphile;
  window.layerCarry    = dataLayerGroups.carry;
  window.dataLayerGroups = dataLayerGroups;
  window.layerEditor   = dataLayerGroups.editor;

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
