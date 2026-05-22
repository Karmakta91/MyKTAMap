// =========================
// MESURE DISTANCE
// =========================

window.modeMesure = false;
let pointsMesure = [];
let polylineMesure = null;
let _measureClickHandler = null;

// 🆕 v1.9.3-A1.b.2.5 (KARMA "longueur de chaque segment afficher à
// l'écran et angle en degré entre deux segments afficher").
// Markers Leaflet pour les labels visuels :
//   - _segmentLabels : 1 par segment, au milieu, affiche distance
//   - _angleLabels   : 1 par point intermédiaire, affiche l'angle
let _segmentLabels = [];
let _angleLabels = [];

function initMeasure() {
  // Reset complet : nouvelle map = nouveau polyline + nouveau handler
  pointsMesure = [];
  _segmentLabels = [];
  _angleLabels = [];

  polylineMesure = L.polyline([], { color: 'red', weight: 3 }).addTo(window.map);

  // Définir le handler une fois et le réutiliser pour pouvoir le retirer
  // (la map est nouvelle à chaque init, donc le handler est forcément frais)
  _measureClickHandler = function(e) {
    if (!window.modeMesure) return;

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    // Conversion coords Leaflet → coords plan (style GIMP)
    const x = lng;
    const y = APP_CONFIG.imageHeight - lat;

    pointsMesure.push({ x: x, y: y });
    updateMesure();
  };

  window.map.on('click', _measureClickHandler);

  // Reset l'affichage de la distance
  afficherDistance(0);
}

function updateMesure() {
  if (!polylineMesure) return;

  let latlngs = pointsMesure.map(p => convertCoord(p.x, p.y));
  polylineMesure.setLatLngs(latlngs);

  let distance = calculDistance();
  afficherDistance(distance);

  // 🆕 v1.9.3-A1.b.2.5 : labels longueur par segment + angles aux points
  // intermédiaires (KARMA demande à voir chaque détail directement sur
  // la carte, pas seulement la distance totale dans le label bas-gauche).
  _updateSegmentLabels();
  _updateAngleLabels();
}

// =========================
// LABELS LONGUEUR PAR SEGMENT
// =========================
// 1 marker par segment, placé au MILIEU du segment, affiche la distance
// du segment en mètres (formatée via window.formatDistance). Le marker
// est non-interactif (interactive: false) → pas de popup au clic.
function _updateSegmentLabels() {
  _segmentLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
  _segmentLabels = [];

  if (!window.map || pointsMesure.length < 2) return;

  for (let i = 1; i < pointsMesure.length; i++) {
    const p1 = pointsMesure[i - 1];
    const p2 = pointsMesure[i];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    const distM = distPx / APP_CONFIG.scale;
    // formatDistance avec 1 décimale = lisible et compact (ex: "12.3 m")
    const txt = (typeof window.formatDistance === "function")
      ? window.formatDistance(distM, 1)
      : (distM.toFixed(1) + " m");
    try {
      const label = L.marker(convertCoord(midX, midY), {
        icon: L.divIcon({
          className:  "kta-measure-seg-label-wrap",
          html:       '<div class="kta-measure-seg-label">' + txt + '</div>',
          iconSize:   null,
          iconAnchor: [0, 0]
        }),
        interactive: false,
        keyboard:    false
      }).addTo(window.map);
      _segmentLabels.push(label);
    } catch(e) {
      console.warn("[Mesure] erreur label segment :", e);
    }
  }
}

// =========================
// LABELS ANGLES AUX POINTS INTERMÉDIAIRES
// =========================
// 1 marker par point intermédiaire (i > 0 && i < N-1), affiche l'angle
// formé entre le segment d'arrivée et le segment de départ. Angle interne
// dans [0°, 180°] :
//   - 180° = ligne droite (alignement parfait)
//   - 90°  = virage perpendiculaire
//   - 0°   = demi-tour
// Convention : on calcule l'angle entre les vecteurs (B→A) et (B→C).
function _updateAngleLabels() {
  _angleLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
  _angleLabels = [];

  if (!window.map || pointsMesure.length < 3) return;

  for (let i = 1; i < pointsMesure.length - 1; i++) {
    const a = pointsMesure[i - 1];
    const b = pointsMesure[i];
    const c = pointsMesure[i + 1];
    // Vecteurs depuis B vers A et depuis B vers C
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (len1 < 1e-6 || len2 < 1e-6) continue;  // points superposés → skip
    const cosA = (v1x * v2x + v1y * v2y) / (len1 * len2);
    const cosClamped = Math.max(-1, Math.min(1, cosA));
    const angleDeg = Math.acos(cosClamped) * 180 / Math.PI;
    const txt = angleDeg.toFixed(0) + "°";
    try {
      const label = L.marker(convertCoord(b.x, b.y), {
        icon: L.divIcon({
          className:  "kta-measure-angle-label-wrap",
          html:       '<div class="kta-measure-angle-label">' + txt + '</div>',
          iconSize:   null,
          iconAnchor: [0, 0]
        }),
        interactive: false,
        keyboard:    false
      }).addTo(window.map);
      _angleLabels.push(label);
    } catch(e) {
      console.warn("[Mesure] erreur label angle :", e);
    }
  }
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

  // 🆕 v1.9.3-A1.b.2.5 : reset des labels segments + angles
  _segmentLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
  _segmentLabels = [];
  _angleLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
  _angleLabels = [];

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
  // Recréer le label si la map a changé (ex: changement de plan)
  // ou s'il n'existe pas encore
  const labelEl = document.getElementById("measureLabel");
  if (!labelEl || !window.measureLabel || !window.measureLabel._map) {
    if (window.measureLabel && window.measureLabel.remove) {
      try { window.measureLabel.remove(); } catch(e) {}
    }
    window.measureLabel = L.control({ position: 'bottomleft' });

    // Charte alignée avec le label itinéraire (.kta-iti-distance) — fond
    // #1a1f2e, accent jaune charte, bordure subtile + shadow standard. Le
    // styling complet vit dans css/style.css (.kta-measure-distance).
    window.measureLabel.onAdd = function() {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control kta-measure-distance');
      div.id = "measureLabel";
      div.innerHTML = '<span class="kta-measure-distance-icon">📐</span>Distance : 0 m';
      return div;
    };

    window.measureLabel.addTo(window.map);
  }

  const label = document.getElementById("measureLabel");
  if (label) {
    label.innerHTML = '<span class="kta-measure-distance-icon">📐</span>Distance : ' + window.formatDistance(d, 2);
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
