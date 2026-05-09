// =========================
// ROADS / TRACÉS
// =========================

window.modeRoad = null;

let roadsData = [];
let currentRoad = null;
let roadLayers = [];

// Routes embarquées dans les calques de données (chargées par utils.js > ajouterPointsDepuisJSON).
// Elles ne sont pas éditables MAIS doivent participer au calcul des intersections
// pour afficher des cercles aux croisements avec les routes éditables.
// Format : [{ road, layer }] — layer = LayerGroup Leaflet du calque, sert à
// filtrer par visibilité (toggle dans le contrôle des calques) → quand un
// calque est masqué, ses roads disparaissent ET leurs intersections aussi.
let _embeddedRoads = [];

// styles par type
const ROAD_STYLES = {
  principal:   { color: "#00ff00", weight: 5, opacity: 1 },
  secondaire:  { color: "#b000ff", weight: 5, opacity: 1 },
  chemin:      { color: "#ffff00", weight: 5, opacity: 1 },
  // Type "itinéraire" calculé par Pathfinder : couleur cyan distinctive,
  // tracé plus épais pour bien se voir par-dessus les autres roads.
  itinerary:   { color: "#00d4ff", weight: 7, opacity: 0.9, dashArray: "12 6" }
};

// Priorité couleur des intersections : chemin (jaune) > secondaire (violet) > principal (vert)
// Quand 2 roads de types différents se croisent, un cercle plein est dessiné à l'intersection
// avec la couleur du type de plus haute priorité.
const ROAD_INTERSECTION_PRIORITY = {
  principal:  1,
  secondaire: 2,
  chemin:     3
};
const ROAD_INTERSECTION_RADIUS = 8;  // 16px de diamètre

// =========================
// INIT
// =========================
function initRoad() {
  // Reset complet (cohérence avec initZones / initMeasure) — sans ce reset,
  // roadsData survit au switch de plan via le plan switcher et le polling
  // SessionPersist ré-enregistre les routes de l'ancien plan sous l'ID du
  // nouveau plan (cross-pollination entre plans).
  roadsData = [];
  currentRoad = null;
  // roadLayers : la map précédente est détruite avant lancerApplication,
  // donc removeLayer n'a rien à faire — on vide juste la liste de références.
  roadLayers = [];

  if (window.roadInitialized) return;
  window.roadInitialized = true;

  console.log("[Road] initRoad OK");

  // Re-render quand l'utilisateur toggle la visibilité d'un calque dans le
  // contrôle des couches Leaflet (overlayadd/overlayremove). Ça force le
  // recalcul des intersections en fonction des calques visibles.
  window.map.on("overlayadd overlayremove", function() {
    renderRoads();
  });

  window.map.on("mousedown", function(e) {
    if (!window.modeRoad) return;

    const x = e.latlng.lng;
    const y = APP_CONFIG.imageHeight - e.latlng.lat;

    if (!currentRoad) {
      currentRoad = {
        type: window.modeRoad,
        points: []
      };
      roadsData.push(currentRoad);
      console.log("[Road] nouveau tracé", currentRoad);
    }

    currentRoad.points.push({ x, y });
    console.log("[Road] point ajouté", x, y);

    renderRoads();
  });
}

// =========================
// ACTIVER / DÉSACTIVER UN TYPE
// =========================
function toggleRoadMode(type) {
  if (window.modeRoad === type) {
    window.modeRoad = null;
    currentRoad = null;
  } else {
    window.modeRoad = type;
    currentRoad = null;
  }

  console.log("[Road] Mode :", window.modeRoad);
}

// =========================
// INTERSECTION DE 2 SEGMENTS
// =========================
// Retourne le point d'intersection {x, y} si les segments [p1, p2] et [p3, p4] se croisent,
// sinon null. Coordonnées en système image (x, y).
function _segmentIntersection(p1, p2, p3, p4) {
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;
  const x4 = p4.x, y4 = p4.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null; // segments parallèles ou colinéaires

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // L'intersection doit être DANS les 2 segments (pas juste sur les lignes infinies)
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

// Projeté orthogonal du point p sur le segment [a, b], clampé aux extrémités.
// Retourne { dist, proj: {x, y} } — utilisé pour détecter les T-junctions imparfaites.
function _pointSegmentProject(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    return { dist: Math.hypot(p.x - a.x, p.y - a.y), proj: { x: a.x, y: a.y } };
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return { dist: Math.hypot(p.x - projX, p.y - projY), proj: { x: projX, y: projY } };
}

// Tolérance pour les T-junctions imparfaites : si une extrémité d'une route est à
// ≤ 8 px d'une autre route, on compte ça comme une intersection.
const ROAD_PROXIMITY_TOLERANCE = 8;

// Type "gagnant" entre deux types de road :
// - Même type (vert/vert, violet/violet, jaune/jaune) → garde le type
// - Types différents → priorité chemin (jaune) > secondaire (violet) > principal (vert)
function _typeGagnant(typeA, typeB) {
  if (typeA === typeB) return typeA;
  const pA = ROAD_INTERSECTION_PRIORITY[typeA] || 0;
  const pB = ROAD_INTERSECTION_PRIORITY[typeB] || 0;
  return pA >= pB ? typeA : typeB;
}

// Calcule toutes les intersections entre toutes les routes (y compris même type).
// Détection :
//   1) Croisement franc segment×segment (algo paramétrique strict)
//   2) Proximité d'une extrémité d'une route avec un segment d'une autre
//      (tolérance ROAD_PROXIMITY_TOLERANCE) — capture les T-junctions imparfaites
//      où les routes ne se touchent pas exactement (typique des données importées).
//   3) Dedup final : on collapse les intersections distantes de < tolérance entre elles.
function _calculerIntersectionsRoads(roads) {
  const raw = [];
  const isDebug = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);

  for (let i = 0; i < roads.length; i++) {
    const A = roads[i];
    if (!A || !Array.isArray(A.points) || A.points.length < 2) continue;
    for (let j = i + 1; j < roads.length; j++) {
      const B = roads[j];
      if (!B || !Array.isArray(B.points) || B.points.length < 2) continue;

      const winner = _typeGagnant(A.type, B.type);
      const color  = ROAD_STYLES[winner]?.color || "#ffffff";

      // 1) Croisement franc segment × segment
      for (let a = 0; a < A.points.length - 1; a++) {
        for (let b = 0; b < B.points.length - 1; b++) {
          const inter = _segmentIntersection(
            A.points[a], A.points[a + 1],
            B.points[b], B.points[b + 1]
          );
          if (inter) raw.push({ point: inter, color: color });
        }
      }

      // 2) Extrémités de A proches d'un segment de B (T-junction où A finit ~sur B)
      for (let k = 0; k < A.points.length; k++) {
        const pa = A.points[k];
        for (let b = 0; b < B.points.length - 1; b++) {
          const r = _pointSegmentProject(pa, B.points[b], B.points[b + 1]);
          if (r.dist <= ROAD_PROXIMITY_TOLERANCE) {
            raw.push({ point: pa, color: color });
            break;
          }
        }
      }
      // Et symétrique : extrémités de B proches d'un segment de A
      for (let k = 0; k < B.points.length; k++) {
        const pb = B.points[k];
        for (let a = 0; a < A.points.length - 1; a++) {
          const r = _pointSegmentProject(pb, A.points[a], A.points[a + 1]);
          if (r.dist <= ROAD_PROXIMITY_TOLERANCE) {
            raw.push({ point: pb, color: color });
            break;
          }
        }
      }
    }
  }

  // 3) Dedup : on collapse les intersections distantes de < tolérance
  const intersections = [];
  for (const item of raw) {
    let dup = false;
    for (const ex of intersections) {
      const d = Math.hypot(item.point.x - ex.point.x, item.point.y - ex.point.y);
      if (d < ROAD_PROXIMITY_TOLERANCE) { dup = true; break; }
    }
    if (!dup) intersections.push(item);
  }

  if (isDebug) {
    console.log("[Roads] Roads count:", roads.length,
                "→ raw:", raw.length, " → après dedup:", intersections.length,
                intersections);
  }
  return intersections;
}

// =========================
// RENDU
// =========================
function renderRoads() {
  console.log("[Road] renderRoads — roadsData :", roadsData);

  roadLayers.forEach(layer => window.map.removeLayer(layer));
  roadLayers = [];

  // Tracés
  roadsData.forEach(road => {
    if (!road.points || road.points.length === 0) return;

    const latlngs = road.points.map(p => convertCoord(p.x, p.y));
    const style = ROAD_STYLES[road.type] || { color: "white", weight: 5, opacity: 1 };

    // Cas spécial "itinerary" : on force le renderer SVG pour pouvoir appliquer
    // un filtre CSS drop-shadow (effet "néon glow"), impossible sur le renderer
    // canvas (preferCanvas:true) qui dessine en bitmap pixel-aware.
    if (road.type === "itinerary") {
      const opts = Object.assign({}, style, {
        renderer:  L.svg(),
        className: "kta-itinerary-polyline"
      });
      const polyline = L.polyline(latlngs, opts).addTo(window.map);
      roadLayers.push(polyline);
    } else {
      const polyline = L.polyline(latlngs, style).addTo(window.map);
      roadLayers.push(polyline);
    }
  });

  // Cercles d'intersection : on combine routes éditables (roadsData) + routes embarquées
  // VISIBLES (filtrées par visibilité du calque Leaflet) — pour que les croisements
  // disparaissent quand l'utilisateur masque un calque dans le contrôle des couches.
  // ⚠️ On exclut le type "itinerary" (calculé par Pathfinder) : il suit le réseau existant
  // donc traverserait des routes à chaque nœud → cercles redondants. Les intersections
  // RÉELLES du réseau sous-jacent restent affichées via le filtrage des autres types.
  const allRoads = roadsData.concat(_embeddedRoadsVisibles()).filter(r => r.type !== "itinerary");
  const intersections = _calculerIntersectionsRoads(allRoads);
  intersections.forEach(({ point, color }) => {
    const latlng = convertCoord(point.x, point.y);
    const cercle = L.circleMarker(latlng, {
      radius:      ROAD_INTERSECTION_RADIUS,
      color:       color,
      fillColor:   color,
      fillOpacity: 1,
      weight:      0,
      stroke:      false,
      interactive: false
    }).addTo(window.map);
    roadLayers.push(cercle);
  });
}

// =========================
// RESET COMPLET
// =========================
function resetRoads() {
  roadsData = [];
  currentRoad = null;
  window.modeRoad = null;

  roadLayers.forEach(layer => window.map.removeLayer(layer));
  roadLayers = [];
}

// =========================
// SUPPRIMER LE DERNIER TRACÉ ENTIER
// =========================
function removeLastRoad() {
  if (roadsData.length === 0) return false;
  const removed = roadsData.pop();
  if (currentRoad === removed) currentRoad = null;
  renderRoads();
  return true;
}

// =========================
// SUPPRIMER LE DERNIER POINT DU DERNIER TRACÉ
// =========================
function removeLastRoadPoint() {
  if (roadsData.length === 0) return false;
  const last = roadsData[roadsData.length - 1];
  if (!last.points || last.points.length === 0) {
    // Tracé vide → supprimer le tracé entier
    roadsData.pop();
    if (currentRoad === last) currentRoad = null;
  } else {
    last.points.pop();
    // Si plus aucun point dans ce tracé, le retirer aussi
    if (last.points.length === 0) {
      roadsData.pop();
      if (currentRoad === last) currentRoad = null;
    }
  }
  renderRoads();
  return true;
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
// ROUTES EMBARQUÉES (depuis calques de données)
// =========================
// Permet à utils.js > ajouterPointsDepuisJSON d'enregistrer les routes lues
// dans un calque de données, afin qu'elles participent au calcul des intersections.
window.registerEmbeddedRoad = function(road, layer) {
  if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
  _embeddedRoads.push({ road: road, layer: layer || null });
  // Re-render pour ajouter / mettre à jour les cercles d'intersection
  if (window.map && window.roadInitialized) renderRoads();
};

// À appeler avant le chargement d'un nouveau plan, pour vider le registre des routes
// embarquées du plan précédent.
window.clearEmbeddedRoads = function() {
  _embeddedRoads = [];
  if (window.map && window.roadInitialized) renderRoads();
};

// Helper : retourne uniquement les roads embarquées dont le calque est ACTUELLEMENT
// visible sur la map. Si la road n'a pas de layer associé (ancien format ou contexte
// import), elle est considérée visible par défaut.
function _embeddedRoadsVisibles() {
  if (!window.map) return _embeddedRoads.map(function(e) { return e.road; });
  return _embeddedRoads
    .filter(function(e) { return !e.layer || window.map.hasLayer(e.layer); })
    .map(function(e) { return e.road; });
}

// Expose la liste des routes embarquées (visibles uniquement) pour les modules qui
// ont besoin de l'ensemble du réseau actif (Pathfinder construit le graphe à partir
// des roads session ET embedded).
window.getEmbeddedRoads = function() {
  return _embeddedRoadsVisibles();
};

// =========================
// HELPER PUBLIC : calcul des intersections (utilisé par les exports image)
// =========================
// Reçoit un tableau de routes ({type, points: [{x, y}, ...]}, types principal/secondaire/chemin)
// Retourne [{point: {x, y}, color: "#xxx"}, ...] — coords en système image, prêtes à dessiner
// (par utils.js > telechargerPlan et exporter.js > export).
// Le rayon des cercles est défini par window.ROAD_INTERSECTION_RADIUS (8 par défaut).
window.computeRoadIntersections = function(roads) {
  return _calculerIntersectionsRoads(roads || []);
};
window.ROAD_INTERSECTION_RADIUS = ROAD_INTERSECTION_RADIUS;

// =========================
// EXPORT GLOBAL
// =========================
window.initRoad             = initRoad;
window.toggleRoadMode       = toggleRoadMode;
window.resetRoads           = resetRoads;
window.removeLastRoad       = removeLastRoad;
window.removeLastRoadPoint  = removeLastRoadPoint;
window.renderRoads          = renderRoads;
