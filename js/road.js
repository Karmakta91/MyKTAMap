// =========================
// ROADS / TRAÇÉS
// =========================

window.modeRoad = null;

let roadsData = [];
let currentRoad = null;
let roadLayers = [];

// styles par type
const ROAD_STYLES = {
  principal:   { color: "#00ff00", weight: 5, opacity: 1 },
  secondaire:  { color: "#b000ff", weight: 5, opacity: 1 },
  chemin:      { color: "#ffff00", weight: 5, opacity: 1 }
};

// =========================
// INIT
// =========================
function initRoad() {
  if (window.roadInitialized) return;
  window.roadInitialized = true;

  console.log("initRoad OK");

  window.map.on("mousedown", function(e) {
    console.log("clic carte road");
    console.log("modeRoad =", window.modeRoad);

    if (!window.modeRoad) return;

    const x = e.latlng.lng;
    const y = APP_CONFIG.imageHeight - e.latlng.lat;

    if (!currentRoad) {
      currentRoad = {
        type: window.modeRoad,
        points: []
      };
      roadsData.push(currentRoad);
      console.log("nouveau tracé", currentRoad);
    }

    currentRoad.points.push({ x, y });
    console.log("point ajouté", x, y);

    renderRoads();
  });
}

// =========================
// ACTIVER / DESACTIVER UN TYPE
// =========================
function toggleRoadMode(type) {
  if (window.modeRoad === type) {
    window.modeRoad = null;
    currentRoad = null;
  } else {
    window.modeRoad = type;
    currentRoad = null;
  }

  console.log("Mode road :", window.modeRoad);
}

// =========================
// RENDU
// =========================
function renderRoads() {
  console.log("renderRoads lancé");
  console.log("roadsData =", roadsData);

  roadLayers.forEach(layer => window.map.removeLayer(layer));
  roadLayers = [];

  roadsData.forEach(road => {
    if (!road.points || road.points.length === 0) return;

    const latlngs = road.points.map(p => convertCoord(p.x, p.y));
    console.log("latlngs =", latlngs);

    const style = ROAD_STYLES[road.type] || { color: "white", weight: 5, opacity: 1 };
    console.log("style =", style);

    const polyline = L.polyline(latlngs, style).addTo(window.map);
    roadLayers.push(polyline);
  });
}

// =========================
// RESET
// =========================
function resetRoads() {
  roadsData = [];
  currentRoad = null;
  window.modeRoad = null;

  roadLayers.forEach(layer => window.map.removeLayer(layer));
  roadLayers = [];
}

// =========================
// EXPORT / IMPORT
// =========================
window.getRoads = function() {
  return roadsData;
};

window.setRoads = function(roads) {
  roadsData = roads || [];
  currentRoad = null;
  renderRoads();
};

// =========================
// EXPORT GLOBAL
// =========================
window.initRoad = initRoad;
window.toggleRoadMode = toggleRoadMode;
window.resetRoads = resetRoads;
window.renderRoads = renderRoads;