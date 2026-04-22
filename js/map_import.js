let map;
let bounds;
let collisionCanvas;
let collisionCtx;

// =========================
// ICÔNES GLOBALS
// =========================
let iconeDefault;
let iconeSalle;
let iconepa;
let iconepc;
let iconepb;
let iconeVehicule;
let iconeElec;
let iconeEpure;
let iconePS;
let iconeInfo;
let iconeChatiere;
let iconePassage;
let iconeDanger;
let iconepe;
let iconeTrack;

// =========================
// CRÉATION DES ICÔNES
// =========================
function creerIcones(iconConfig) {
  iconeDefault = L.icon({
    iconUrl: iconConfig.default,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconeSalle = L.icon({
    iconUrl: iconConfig.salle,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconepa = L.icon({
    iconUrl: iconConfig.pa,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconepc = L.icon({
    iconUrl: iconConfig.pc,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconepb = L.icon({
    iconUrl: iconConfig.pb,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconeVehicule = L.icon({
    iconUrl: iconConfig.vehicule,
    iconSize: [50, 25],
    iconAnchor: [25, 13]
  });

  iconeElec = L.icon({
    iconUrl: iconConfig.elec,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconeEpure = L.icon({
    iconUrl: iconConfig.epure,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconePS = L.icon({
    iconUrl: iconConfig.ps,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconeInfo = L.icon({
    iconUrl: iconConfig.info,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconeChatiere = L.icon({
    iconUrl: iconConfig.chatiere,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconePassage = L.icon({
    iconUrl: iconConfig.passage,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconeDanger = L.icon({
    iconUrl: iconConfig.danger,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconepe = L.icon({
    iconUrl: iconConfig.pe,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  iconeTrack = L.icon({
    iconUrl: iconConfig.track,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  window.iconeDefault = iconeDefault;
  window.iconeSalle = iconeSalle;
  window.iconepa = iconepa;
  window.iconepc = iconepc;
  window.iconepb = iconepb;
  window.iconeVehicule = iconeVehicule;
  window.iconeElec = iconeElec;
  window.iconeEpure = iconeEpure;
  window.iconePS = iconePS;
  window.iconeInfo = iconeInfo;
  window.iconeChatiere = iconeChatiere;
  window.iconePassage = iconePassage;
  window.iconeDanger = iconeDanger;
  window.iconepe = iconepe;
  window.iconeTrack = iconeTrack;
}

// =========================
// NETTOYAGE SI RECHARGEMENT
// =========================
function cleanupExistingMap() {
  if (window.map) {
    try {
      window.map.remove();
    } catch (err) {
      console.warn("[Map] Erreur suppression :", err);
    }
  }

  // Si map.remove() a supprimé le conteneur, on le recrée
  let mapContainer = document.getElementById("map");
  if (!mapContainer) {
    console.warn("[Map] #map supprimé par Leaflet, recréation...");
    mapContainer = document.createElement("div");
    mapContainer.id = "map";
    document.body.appendChild(mapContainer);
  }

  mapContainer._leaflet_id = undefined;
  mapContainer.innerHTML = "";
  mapContainer.style.display = "block";
  mapContainer.style.width = "100%";
  mapContainer.style.height = "100%";

  window.map = null;
  map = null;
}

// =========================
// INITIALISATION DE LA CARTE
// =========================

async function initMapFromConfig() {
  console.log("[Debug] ENTREE initMapFromConfig");
  console.log("[Debug] #map à l'entrée =", document.getElementById("map"));
  console.log("[Debug] #map par querySelector =", document.querySelector("#map"));
  const config = window.PLAN_CONFIG;

  if (!config || !config.plan) {
    throw new Error("PLAN_CONFIG non chargé");
  }

  // Cleanup propre + reset des styles
  cleanupExistingMap();

  // Laisser le navigateur recalculer le layout
  await new Promise(resolve => requestAnimationFrame(resolve));

  const mapContainer = document.getElementById("map");
  if (!mapContainer) {
    throw new Error("Map container (#map) introuvable dans le DOM");
  }

  // Forcer les styles au cas où cleanupExistingMap les aurait altérés
  mapContainer.style.display = "block";
  mapContainer.style.width = "100%";
  mapContainer.style.height = "100%";

  // Appliquer APP_CONFIG
  Object.assign(APP_CONFIG, {
    imageHeight: config.plan.imageHeight,
    imageWidth: config.plan.imageWidth,
    startX: config.tracking?.startX ?? 0,
    startY: config.tracking?.startY ?? 0,
    scale: config.tracking?.scale ?? 1,
    stepLength: config.tracking?.stepLength ?? 0.7,
    stepThreshold: config.tracking?.stepThreshold ?? 13,
    stepCooldown: config.tracking?.stepCooldown ?? 400
  });

  creerIcones(config.icons);

  bounds = [[0, 0], [config.plan.imageHeight, config.plan.imageWidth]];

  console.log("[Map] Initialisation de la carte...");

  map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0
  });

  map.setMaxBounds(bounds);
  map.setMinZoom(-2);
  map.setMaxZoom(2);

  window.map = map;
  window.bounds = bounds;

  L.imageOverlay(config.plan.baseImage, bounds).addTo(map);

  const dataLayerGroups = {};
  const overlays = {};

  (config.dataLayers || []).forEach(layerConfig => {
    const group = L.layerGroup();
    if (layerConfig.visible) group.addTo(map);
    dataLayerGroups[layerConfig.id] = group;
    overlays[layerConfig.label] = group;
  });

  const sortedImageLayers = [...(config.imageLayers || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

  sortedImageLayers.forEach(layerConfig => {
    const overlay = L.imageOverlay(layerConfig.file, bounds);
    if (layerConfig.visible) overlay.addTo(map);
    overlays[layerConfig.label] = overlay;
  });

  L.control.layers(null, overlays).addTo(map);

  await initCollisionMap(config.plan.collisionImage);

  window.layerPuits = dataLayerGroups.puits;
  window.layerVehicule = dataLayerGroups.vehicule;
  window.layerCataphile = dataLayerGroups.cataphile;
  window.layerCarry = dataLayerGroups.carry;
  window.dataLayerGroups = dataLayerGroups;
  window.layerEditor = dataLayerGroups.editor;

  console.log("[Loader] Carte initialisée avec succès");
}
function initCollisionMap(imagePath) {
  return new Promise((resolve) => {
    const collisionImage = new Image();
    collisionImage.src = imagePath;

    collisionCanvas = document.createElement('canvas');
    collisionCtx = collisionCanvas.getContext('2d');

    collisionImage.onload = function() {
      collisionCanvas.width = collisionImage.width;
      collisionCanvas.height = collisionImage.height;

      collisionCtx.drawImage(collisionImage, 0, 0);

      console.log("Collision map chargée");

      window.collisionCtx = collisionCtx;
      window.collisionCanvas = collisionCanvas;

      resolve();
    };

    collisionImage.onerror = function() {
      console.warn("Impossible de charger la collision map :", imagePath);
      window.collisionCtx = null;
      window.collisionCanvas = collisionCanvas;
      resolve();
    };
  });
}

window.initMapFromConfig = initMapFromConfig;




