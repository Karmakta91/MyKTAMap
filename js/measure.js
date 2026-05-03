// =========================
// MESURE DISTANCE
// =========================

window.modeMesure = false;
let pointsMesure = [];
let polylineMesure;

function initMeasure() {
  polylineMesure = L.polyline([], { color: 'red', weight: 3 }).addTo(window.map);

  window.map.on('click', function(e) {
    if (!window.modeMesure) return;

    let lat = e.latlng.lat;
    let lng = e.latlng.lng;

    let x = lng;
    let y = APP_CONFIG.imageHeight - lat;

    pointsMesure.push({ x, y });

    updateMesure();
  });
}

function updateMesure() {
  if (!polylineMesure) return;

  let latlngs = pointsMesure.map(p => convertCoord(p.x, p.y));
  polylineMesure.setLatLngs(latlngs);

  let distance = calculDistance();
  afficherDistance(distance);
}

function calculDistance() {
  let total = 0;

  for (let i = 1; i < pointsMesure.length; i++) {
    let dx = pointsMesure[i].x - pointsMesure[i - 1].x;
    let dy = pointsMesure[i].y - pointsMesure[i - 1].y;

    let distPx = Math.sqrt(dx * dx + dy * dy);
    total += distPx;
  }

  return total / APP_CONFIG.scale;
}

function resetMesure() {
  pointsMesure = [];

  if (polylineMesure) {
    polylineMesure.setLatLngs([]);
  }

  afficherDistance(0);
}

// =========================
// SUPPRIMER LE DERNIER POINT DE MESURE
// =========================
function removeLastMeasurePoint() {
  if (pointsMesure.length === 0) return false;
  pointsMesure.pop();
  updateMesure();
  return true;
}

function afficherDistance(d) {
  if (!window.measureLabel) {
    window.measureLabel = L.control({ position: 'bottomleft' });

    window.measureLabel.onAdd = function() {
      let div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      div.id = "measureLabel";
      div.style.background = "rgba(0,0,0,0.8)";
      div.style.color = "white";
      div.style.padding = "8px";
      div.style.fontSize = "16px";
      div.innerHTML = "Distance : 0 m";
      return div;
    };

    window.measureLabel.addTo(window.map);
  }

  const label = document.getElementById("measureLabel");
  if (label) {
    label.innerHTML = "Distance : " + d.toFixed(2) + " m";
  }
}

function telechargerMesureJSON() {
  if (pointsMesure.length === 0) {
    alert("Aucune mesure à exporter");
    return;
  }

  const data = {
    type: "mesure",
    distance_m: Number(calculDistance().toFixed(2)),
    date_export: new Date().toISOString().split("T")[0],
    points: pointsMesure.map(p => ({
      x: Math.round(p.x),
      y: Math.round(p.y)
    }))
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "mesure_trace.json";
  a.click();

  URL.revokeObjectURL(url);
}

// EXPORT GLOBAL
window.initMeasure              = initMeasure;
window.resetMesure              = resetMesure;
window.removeLastMeasurePoint   = removeLastMeasurePoint;
window.telechargerMesureJSON    = telechargerMesureJSON;

window.getMeasurePoints = function() {
  return pointsMesure;
};

window.setMeasurePoints = function(points) {
  pointsMesure = points || [];
  updateMesure();
};
