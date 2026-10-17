/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// MESURE — distance (polyline) et surface (polygone), indépendantes et simultanées
// =========================
// Deux états, deux couches visibles ensemble : _pointsDistance + _polylineMesure, _pointsSurface +
// _polygonMesure. `_activeMode` ("distance" | "surface" | null) décide où vont les clics. Le libellé
// bas-gauche montre les deux lignes s'il y a deux mesures ; SessionPersist sauve les deux tableaux et le mode.
// Expose : initMeasure, calculDistance, calculSurface, resetMesure, resetMesureMode, removeLastMeasurePoint,
//   get/setMeasurePoints (DISTANCE, format historique de SessionPersist), get/setMeasurePointsSurface,
//   get/setMeasureMode, afficherDistance.
// ⚠️ Distances : toujours window.formatDistance.
// =========================

window.modeMesure = false;
let _pointsDistance = [];   // points polyline distance
let _pointsSurface  = [];   // points polygone surface
let polylineMesure  = null;
let polygonMesure   = null;
let _measureClickHandler = null;
let _activeMode = "distance";  // mode du bouton actif → cible les clics

// Libellés de segment et d'angle (distance seulement).
let _segmentLabels = [];
let _angleLabels   = [];

// 🩸 Points consécutifs COÏNCIDENTS (sessions restaurées avec doublons, double événement click) : segments de
// 0 px (« 0.0 m » posé sur le sommet) et angles avalés (len < 1e-6). Ne retire QUE les doublons consécutifs
// (< 0,01 px), jamais un vrai point.
const _MEASURE_DUP_EPS = 0.01;  // px plan — sous ce seuil, 2 clics = 1 point
function _dedupPointsConsecutifs(points) {
  if (!Array.isArray(points) || points.length < 2) return points || [];
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const dx = points[i].x - prev.x;
    const dy = points[i].y - prev.y;
    if (Math.sqrt(dx * dx + dy * dy) >= _MEASURE_DUP_EPS) out.push(points[i]);
  }
  return out;
}

function initMeasure() {
  // Nouvelle carte = nouvelles couches + nouveau handler.
  _pointsDistance = [];
  _pointsSurface  = [];
  _segmentLabels  = [];
  _angleLabels    = [];

  polylineMesure = L.polyline([], { color: 'red', weight: 3 }).addTo(window.map);
  polygonMesure  = L.polygon([], {
    color: 'red',
    weight: 3,
    fillColor: 'red',
    fillOpacity: 0.18,
    interactive: false
  }).addTo(window.map);

  // 🩸 Retirer l'ANCIEN handler de la carte courante avant d'en poser un : sur une carte réutilisée, les
  // map.on('click') s'empilent → 1 clic = N points coïncidents. Toujours un seul handler.
  if (window.map && _measureClickHandler) {
    try { window.map.off('click', _measureClickHandler); } catch (e) {}
  }
  _measureClickHandler = function(e) {
    if (!window.modeMesure) return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const x = lng;
    const y = APP_CONFIG.imageHeight - lat;

    // Clic routé vers le tableau du mode actif (l'autre mesure reste). Point identique au DERNIER ignoré
    // (double click, tap fantôme) : un segment de 0 px casse les angles.
    const arr = (_activeMode === "surface") ? _pointsSurface : _pointsDistance;
    const last = arr[arr.length - 1];
    if (last) {
      const ddx = x - last.x, ddy = y - last.y;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < _MEASURE_DUP_EPS) return;
    }
    arr.push({ x: x, y: y });
    updateMesure();
  };

  window.map.on('click', _measureClickHandler);

  updateMesure();
  _afficherMesureValeur();
}

function updateMesure() {
  if (polylineMesure) {
    const latlngsD = _pointsDistance.map(function(p) { return convertCoord(p.x, p.y); });
    polylineMesure.setLatLngs(latlngsD);
  }
  if (polygonMesure) {
    const latlngsS = _pointsSurface.map(function(p) { return convertCoord(p.x, p.y); });
    polygonMesure.setLatLngs(latlngsS);
  }
  _afficherMesureValeur();
  _updateSegmentLabels();
  _updateAngleLabels();
}

// ── Longueur par segment (distance) ──
function _updateSegmentLabels() {
  _segmentLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
  _segmentLabels = [];

  // Sur la géométrie DÉDUPLIQUÉE (le tableau source n'est pas modifié).
  const pts = _dedupPointsConsecutifs(_pointsDistance);
  if (!window.map || pts.length < 2) return;

  for (let i = 1; i < pts.length; i++) {
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    const distM = distPx / APP_CONFIG.scale;
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

// ── Angles aux points intermédiaires (distance) ──
function _updateAngleLabels() {
  _angleLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
  _angleLabels = [];

  // Sur la géométrie DÉDUPLIQUÉE : avec des doublons, chaque sommet a un vecteur nul et tous les angles sautent.
  const pts = _dedupPointsConsecutifs(_pointsDistance);
  if (!window.map || pts.length < 3) return;

  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (len1 < 1e-6 || len2 < 1e-6) continue;
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

// ── Calcul distance / surface ──
function calculDistance() {
  let total = 0;
  for (let i = 1; i < _pointsDistance.length; i++) {
    const dx = _pointsDistance[i].x - _pointsDistance[i - 1].x;
    const dy = _pointsDistance[i].y - _pointsDistance[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total / APP_CONFIG.scale;  // mètres
}

// Aire par la formule des lacets, en m².
function calculSurface() {
  if (_pointsSurface.length < 3) return 0;
  if (typeof window.polygonAreaM2 === "function") {
    return window.polygonAreaM2(_pointsSurface) || 0;
  }
  // Repli si utils.js n'est pas chargé.
  let sum = 0;
  for (let i = 0; i < _pointsSurface.length; i++) {
    const a = _pointsSurface[i];
    const b = _pointsSurface[(i + 1) % _pointsSurface.length];
    sum += (a.x * b.y) - (b.x * a.y);
  }
  const areaPx2 = Math.abs(sum) / 2;
  const scale = APP_CONFIG.scale || 1;
  return areaPx2 / (scale * scale);
}

// ── Réinitialisation ──
function resetMesure() {
  // Les deux mesures (appel sans paramètre gardé pour les anciens appelants).
  _pointsDistance = [];
  _pointsSurface  = [];
  if (polylineMesure) polylineMesure.setLatLngs([]);
  if (polygonMesure)  polygonMesure.setLatLngs([]);
  _segmentLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
  _segmentLabels = [];
  _angleLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
  _angleLabels = [];
  _afficherMesureValeur();
}

// "distance" | "surface" | "all"
function resetMesureMode(mode) {
  if (mode === "distance") {
    _pointsDistance = [];
    if (polylineMesure) polylineMesure.setLatLngs([]);
    _segmentLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
    _segmentLabels = [];
    _angleLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
    _angleLabels = [];
  } else if (mode === "surface") {
    _pointsSurface = [];
    if (polygonMesure) polygonMesure.setLatLngs([]);
  } else {
    resetMesure();
    return;
  }
  _afficherMesureValeur();
}

// ❌ « dernier point » : seulement la mesure du mode actif.
function removeLastMeasurePoint() {
  const arr = (_activeMode === "surface") ? _pointsSurface : _pointsDistance;
  if (arr.length === 0) return false;
  arr.pop();
  updateMesure();
  return true;
}

// ── Libellé : deux lignes si deux mesures ──
function _afficherMesureValeur() {
  // Recréé si la carte a changé (changement de plan) ou s'il manque.
  const labelEl = document.getElementById("measureLabel");
  if (!labelEl || !window.measureLabel || !window.measureLabel._map) {
    if (window.measureLabel && window.measureLabel.remove) {
      try { window.measureLabel.remove(); } catch(e) {}
    }
    window.measureLabel = L.control({ position: 'bottomleft' });
    window.measureLabel.onAdd = function() {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control kta-measure-distance');
      div.id = "measureLabel";
      return div;
    };
    window.measureLabel.addTo(window.map);
  }

  const label = document.getElementById("measureLabel");
  if (!label) return;

  // Ligne masquée si son tableau est vide ; le mode actif porte une bordure gauche (.kta-measure-active-line)
  // pour montrer où va le prochain clic.
  let html = "";
  const hasDistance = _pointsDistance.length > 0;
  const hasSurface  = _pointsSurface.length  > 0;

  if (hasDistance) {
    const distM = calculDistance();
    const txtD = (typeof window.formatDistance === "function")
      ? window.formatDistance(distM, 2)
      : (distM.toFixed(2) + " m");
    const cls = (_activeMode === "distance") ? "kta-measure-line kta-measure-active-line" : "kta-measure-line";
    html += '<div class="' + cls + '"><span class="kta-measure-distance-icon">📐</span>' + window.I18n.t("measure.label.distance", { val: txtD }) + '</div>';
  }
  if (hasSurface) {
    const surfM2 = calculSurface();
    const txtS = (typeof window.formatSurface === "function")
      ? window.formatSurface(surfM2, 1)
      : (surfM2 < 10000 ? Math.round(surfM2) + " m²" : (surfM2 / 10000).toFixed(2) + " ha");
    const cls = (_activeMode === "surface") ? "kta-measure-line kta-measure-active-line" : "kta-measure-line";
    html += '<div class="' + cls + '"><span class="kta-measure-distance-icon">♦️</span>' + window.I18n.t("measure.label.surface", { val: txtS }) + '</div>';
  }

  // Aucune mesure : invitation à cliquer selon le mode actif.
  if (!hasDistance && !hasSurface) {
    if (window.modeMesure) {
      const icon = (_activeMode === "surface") ? "♦️" : "📐";
      const txt  = (_activeMode === "surface")
        ? window.I18n.t("measure.hint.surface")
        : window.I18n.t("measure.hint.distance");
      html = '<div class="kta-measure-line kta-measure-active-line"><span class="kta-measure-distance-icon">' + icon + '</span>' + txt + '</div>';
    } else {
      html = "";
    }
  }

  label.innerHTML = html;
  // Libellé caché sans contenu (pas de bordure Leaflet vide).
  label.style.display = html ? "" : "none";
}

// Gardé pour d'anciens appelants : rafraîchit simplement l'affichage.
function afficherDistance(d) {
  _afficherMesureValeur();
}

// ── Export global ──
window.initMeasure              = initMeasure;
window.resetMesure              = resetMesure;
window.resetMesureMode          = resetMesureMode;
window.removeLastMeasurePoint   = removeLastMeasurePoint;

// ⚠️ get/setMeasurePoints ciblent la DISTANCE (format historique de SessionPersist) ;
// get/setMeasurePointsSurface la SURFACE.
window.getMeasurePoints = function() {
  return _pointsDistance;
};

window.setMeasurePoints = function(points) {
  // Dédupliqué à la restauration : la donnée est réparée au chargement (SessionPersist ressauve la version propre).
  _pointsDistance = _dedupPointsConsecutifs(points || []);
  updateMesure();
};

window.getMeasurePointsSurface = function() {
  return _pointsSurface;
};

window.setMeasurePointsSurface = function(points) {
  _pointsSurface = _dedupPointsConsecutifs(points || []);  // idem distance
  updateMesure();
};

// Mode actif : oriente les clics, le footer surligne la ligne.
window.getMeasureMode = function() {
  return _activeMode;
};

window.setMeasureMode = function(mode) {
  if (mode !== "distance" && mode !== "surface") return false;
  if (_activeMode === mode) return false;  // no-op si déjà actif
  _activeMode = mode;
  _afficherMesureValeur();  // re-render avec la nouvelle ligne active
  return true;
};

