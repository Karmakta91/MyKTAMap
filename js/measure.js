// =========================
// MESURE — Distance (polyline) + Surface (polygone)
// 🆕 v1.12.0-fix (KARMA "en footer, on peux afficher a la fois, une mesure
// de surface, et une comme avant de distance") : refonte des 2 modes en
// 2 mesures INDÉPENDANTES qui coexistent simultanément.
// =========================
// 2 états séparés, 2 layers Leaflet visibles en même temps :
//   - _pointsDistance[] + _polylineMesure  (rouge, polyline ouverte)
//   - _pointsSurface[]  + _polygonMesure   (rouge fill semi-transp, polygone)
//
// Le bouton actif (_activeMode = "distance" | "surface" | null) détermine
// vers QUEL array vont les clics de la souris. Les 2 layers restent
// affichés ensemble sur la map tant qu'ils ont au moins 1 point.
//
// Le label bas-gauche affiche 2 lignes simultanément si les 2 mesures
// existent :
//   📐 Distance : 152 m
//   ⬛ Surface  : 1234 m²
//
// SessionPersist sauve les 2 arrays + le mode actif.
// =========================

window.modeMesure = false;
let _pointsDistance = [];   // 🆕 v1.12.0-fix : points polyline distance
let _pointsSurface  = [];   // 🆕 v1.12.0-fix : points polygone surface
let polylineMesure  = null;
let polygonMesure   = null;
let _measureClickHandler = null;
let _activeMode = "distance";  // mode du bouton actif → cible les clics

// Labels segment + angle (mode distance uniquement)
let _segmentLabels = [];
let _angleLabels   = [];

function initMeasure() {
  // Reset complet : nouvelle map = nouveaux layers + nouveau handler
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

  _measureClickHandler = function(e) {
    if (!window.modeMesure) return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const x = lng;
    const y = APP_CONFIG.imageHeight - lat;

    // 🆕 v1.12.0-fix : route le clic vers le tableau du mode actif.
    // Les 2 mesures coexistent — clic en mode "surface" n'efface pas la
    // distance existante (et vice-versa).
    if (_activeMode === "surface") {
      _pointsSurface.push({ x: x, y: y });
    } else {
      _pointsDistance.push({ x: x, y: y });
    }
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

// =========================
// LABELS LONGUEUR PAR SEGMENT (sur la polyline distance uniquement)
// =========================
function _updateSegmentLabels() {
  _segmentLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
  _segmentLabels = [];

  if (!window.map || _pointsDistance.length < 2) return;

  for (let i = 1; i < _pointsDistance.length; i++) {
    const p1 = _pointsDistance[i - 1];
    const p2 = _pointsDistance[i];
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

// =========================
// LABELS ANGLES AUX POINTS INTERMÉDIAIRES (sur la polyline distance)
// =========================
function _updateAngleLabels() {
  _angleLabels.forEach(function(l) { try { l.remove(); } catch(e) {} });
  _angleLabels = [];

  if (!window.map || _pointsDistance.length < 3) return;

  for (let i = 1; i < _pointsDistance.length - 1; i++) {
    const a = _pointsDistance[i - 1];
    const b = _pointsDistance[i];
    const c = _pointsDistance[i + 1];
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

// =========================
// CALCUL DISTANCE / SURFACE
// =========================
function calculDistance() {
  let total = 0;
  for (let i = 1; i < _pointsDistance.length; i++) {
    const dx = _pointsDistance[i].x - _pointsDistance[i - 1].x;
    const dy = _pointsDistance[i].y - _pointsDistance[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total / APP_CONFIG.scale;  // mètres
}

// Aire du polygone via shoelace (formule des lacets). Retourne en m².
function calculSurface() {
  if (_pointsSurface.length < 3) return 0;
  if (typeof window.polygonAreaM2 === "function") {
    return window.polygonAreaM2(_pointsSurface) || 0;
  }
  // Fallback inline si utils.js pas chargé
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

// =========================
// RESET — Efface une mesure ou les 2
// =========================
function resetMesure() {
  // Reset complet (les 2 mesures). Conservé pour rétrocompat éventuelle
  // (anciens callers qui appelaient resetMesure sans paramètre).
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

// 🆕 v1.12.0-fix : reset granulaire — "distance" | "surface" | "all"
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
    // "all" ou inconnu → reset complet
    resetMesure();
    return;
  }
  _afficherMesureValeur();
}

// 🆕 v1.12.0-fix : "dernier point" cible le mode actif uniquement.
// Le bouton ❌ → "dernier point" retire le dernier point de la mesure en
// cours d'édition (selon _activeMode), pas l'autre.
function removeLastMeasurePoint() {
  const arr = (_activeMode === "surface") ? _pointsSurface : _pointsDistance;
  if (arr.length === 0) return false;
  arr.pop();
  updateMesure();
  return true;
}

// =========================
// LABEL VISUEL — 2 lignes simultanées si les 2 mesures existent
// =========================
function _afficherMesureValeur() {
  // Recréer le label si la map a changé (ex: changement de plan) ou n'existe pas
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

  // 🆕 v1.12.0-fix : 2 lignes affichées simultanément si les 2 mesures
  // ont au moins 1 point. Chaque ligne masquée si son array est vide.
  // Le mode actif est marqué visuellement par une bordure gauche colorée
  // (CSS .kta-measure-active-line) pour montrer où va le prochain clic.
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
    html += '<div class="' + cls + '"><span class="kta-measure-distance-icon">⬛</span>' + window.I18n.t("measure.label.surface", { val: txtS }) + '</div>';
  }

  // Aucune mesure en cours → libellé invitant à cliquer selon le mode actif
  if (!hasDistance && !hasSurface) {
    if (window.modeMesure) {
      const icon = (_activeMode === "surface") ? "⬛" : "📐";
      const txt  = (_activeMode === "surface")
        ? window.I18n.t("measure.hint.surface")
        : window.I18n.t("measure.hint.distance");
      html = '<div class="kta-measure-line kta-measure-active-line"><span class="kta-measure-distance-icon">' + icon + '</span>' + txt + '</div>';
    } else {
      // Aucune mesure ni mode actif : on cache le label
      html = "";
    }
  }

  label.innerHTML = html;
  // Cache le label entier si pas de contenu (évite la bordure Leaflet vide)
  label.style.display = html ? "" : "none";
}

// Compat v1 : afficherDistance(d) reste exposé pour les anciens callers
// éventuels — appelle juste le refresh global.
function afficherDistance(d) {
  _afficherMesureValeur();
}

function telechargerMesureJSON() {
  if (_pointsDistance.length === 0 && _pointsSurface.length === 0) {
    alert(window.I18n.t("measure.alert.noMeasure"));
    return;
  }

  // 🆕 v1.12.0-fix : export inclut les 2 mesures (si elles existent) dans
  // un seul fichier. Format étendu rétro-compat (l'ancien `points` est
  // gardé pour les anciens consommateurs, pointant sur la mesure du mode
  // actif). Les 2 listes complètes sont dans `distance` et `surface`.
  const activeArr = (_activeMode === "surface") ? _pointsSurface : _pointsDistance;
  const data = {
    type: "mesure",
    mode: _activeMode,
    points: activeArr.map(function(p) { return { x: Math.round(p.x), y: Math.round(p.y) }; }),
    distance: {
      points: _pointsDistance.map(function(p) { return { x: Math.round(p.x), y: Math.round(p.y) }; }),
      distance_m: Number(calculDistance().toFixed(2))
    },
    surface: {
      points: _pointsSurface.map(function(p) { return { x: Math.round(p.x), y: Math.round(p.y) }; }),
      surface_m2: Number(calculSurface().toFixed(2))
    },
    date_export: new Date().toISOString().split("T")[0]
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
window.resetMesureMode          = resetMesureMode;   // 🆕 v1.12.0-fix
window.removeLastMeasurePoint   = removeLastMeasurePoint;
window.telechargerMesureJSON    = telechargerMesureJSON;

// 🆕 v1.12.0-fix : 2 mesures coexistantes. L'API legacy continue de
// fonctionner pour la rétrocompat SessionPersist :
//   - getMeasurePoints() / setMeasurePoints() ciblent la DISTANCE
//     (comportement v1 avant introduction du mode surface)
//   - getMeasurePointsSurface() / setMeasurePointsSurface() ciblent la
//     SURFACE (nouveau, ajouté au payload SessionPersist)
window.getMeasurePoints = function() {
  return _pointsDistance;
};

window.setMeasurePoints = function(points) {
  _pointsDistance = points || [];
  updateMesure();
};

window.getMeasurePointsSurface = function() {
  return _pointsSurface;
};

window.setMeasurePointsSurface = function(points) {
  _pointsSurface = points || [];
  updateMesure();
};

// API mode actif (drive les clics, l'UI footer met en surbrillance la ligne)
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

// Helper pour la modale Détails / stats agrégées
window.getMeasureValue = function() {
  return {
    mode: _activeMode,
    distance: { distM:  calculDistance(),  points: _pointsDistance.length },
    surface:  { areaM2: calculSurface(),   points: _pointsSurface.length  }
  };
};
