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
// smoothFactor 2.5 : Leaflet simplifie les polylines en interne via
// Douglas-Peucker. Le defaut (1.0) garde tous les points. 2.5 reduit
// significativement le nombre de points dessines au pan/zoom (gain perf
// sur les polylines avec beaucoup de points), perte visuelle negligeable
// (les segments restent visuellement equivalents au zoom usuel). Sur
// l'itineraire on garde un facteur plus bas pour preserver la precision
// du tracé calculé.
const ROAD_STYLES = {
  principal:   { color: "#00ff00", weight: 5, opacity: 1, smoothFactor: 2.5 },
  secondaire:  { color: "#b000ff", weight: 5, opacity: 1, smoothFactor: 2.5 },
  chemin:      { color: "#ffff00", weight: 5, opacity: 1, smoothFactor: 2.5 },
  // Type "itinéraire" calculé par Pathfinder : couleur cyan distinctive,
  // tracé plus épais pour bien se voir par-dessus les autres roads.
  // smoothFactor 1.5 (un peu moins agressif) pour preserver la precision
  // du chemin calcule par le pathfinder.
  itinerary:   { color: "#00d4ff", weight: 7, opacity: 0.9, dashArray: "12 6", smoothFactor: 1.5 }
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
  // Throttle 250ms : evite les recalculs en cascade quand l'utilisateur
  // toggle plusieurs calques rapidement, ou quand Leaflet emet plusieurs
  // events en burst au plan switch. Le calcul d'intersections est lourd
  // sur les gros plans (cf _calculerIntersectionsRoads) donc on consolide.
  let _renderRoadsTimer = null;
  function _renderRoadsThrottled() {
    if (_renderRoadsTimer) return;
    _renderRoadsTimer = setTimeout(function() {
      _renderRoadsTimer = null;
      renderRoads();
    }, 250);
  }
  window.map.on("overlayadd overlayremove", _renderRoadsThrottled);

  // 🚀 PerfUltra : re-render sur moveend/zoomend si viewport culling OU
  // décimation est actif (les deux dépendent du viewport ou du zoom courant).
  // Throttle déjà géré par _renderRoadsThrottled.
  window.map.on("moveend zoomend", function() {
    if (window.PerfUltra && (window.PerfUltra.get("viewportCull") || window.PerfUltra.get("decim"))) {
      _renderRoadsThrottled();
    }
  });

  // Hook sur les changements de toggles PerfUltra → re-render à la volée
  // pour appliquer décimation / viewport culling / cap intersections sans
  // forcer l'utilisateur à reload (sauf animOff qui nécessite reload).
  if (window.PerfUltra && typeof window.PerfUltra.onChange === "function") {
    window.PerfUltra.onChange(function(changedKeys) {
      const touchedRender = changedKeys.some(function(k) {
        return ["decim", "viewportCull", "noIntersect"].indexOf(k) >= 0;
      });
      if (touchedRender) _renderRoadsThrottled();
    });
  }

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

// Au-dela de ce seuil (somme des roads session + embedded visibles), on
// SKIP completement le calcul d'intersections : O(N²×P²) explose au-dela
// d'une centaine de routes. Le user a alors la strategie "routes dans le PNG
// + calque masque + pathfinder via getAllEmbeddedRoads" comme alternative
// (cf README_USER section "Optimiser ton plan").
// Seuil dynamique selon le toggle PerfUltra.noIntersect : 50 en mode aggressive,
// 200 en mode normal. Lu à chaque appel pour réagir aux changements à chaud.
function _roadIntersectionMaxRoads() {
  if (window.PerfUltra && window.PerfUltra.get("noIntersect")) return 50;
  return 200;
}
const ROAD_INTERSECTION_MAX_ROADS = 200; // gardé pour rétro-compat des logs

// =========================
// 🚀 PerfUltra : décimation polylines (Ramer-Douglas-Peucker)
// =========================
// Epsilon (en pixels plan) selon le zoom Leaflet courant. Plus on est dézoomé
// (zoom négatif), plus on peut simplifier sans que ça se voie à l'écran.
// 0 = pas de décimation (zoom proche).
function _decimationEpsilon() {
  if (!window.map) return 0;
  const z = window.map.getZoom();
  // Échelle : 2^-z = zoom factor inverse. À zoom=-4 (le plus dézoomé), facteur = 16
  // → on peut écraser des points distants de 8 px sans qu'on les distingue.
  if (z >= 0)  return 0;        // proche : pas de décimation, garde la précision
  if (z >= -1) return 2;        // léger dézoom
  if (z >= -2) return 4;
  if (z >= -3) return 8;
  return 16;                    // très dézoomé : agressif
}

// Distance perpendiculaire d'un point au segment AB (en coords plan).
function _perpDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const dxp = p.x - a.x, dyp = p.y - a.y;
    return Math.sqrt(dxp * dxp + dyp * dyp);
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  const cx = a.x + tc * dx, cy = a.y + tc * dy;
  const ex = p.x - cx, ey = p.y - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

// RDP itératif (évite récursion profonde sur les longues polylines).
function _decimatePointsRDP(pts, epsilon) {
  if (!Array.isArray(pts) || pts.length < 3) return pts;
  const keep = new Array(pts.length); keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = _perpDist(pts[i], pts[a], pts[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > epsilon && idx > -1) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

// Calcule l'AABB (bounding box) d'une road : { minX, minY, maxX, maxY }.
// Utilise pour le pre-check rapide dans _calculerIntersectionsRoads :
// si les boxes de 2 routes ne se recouvrent pas, on skip toutes les
// comparaisons de segments. Souvent 90%+ des paires sont eliminees sans
// avoir besoin de comparer les segments un a un.
function _bboxOfRoad(road) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pts = road.points;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}

// Test rapide d'intersection de 2 AABBs (avec marge ROAD_PROXIMITY_TOLERANCE
// pour capturer les T-junctions imparfaites a la limite des bbox).
function _bboxIntersect(a, b, margin) {
  return !(a.maxX + margin < b.minX || b.maxX + margin < a.minX ||
           a.maxY + margin < b.minY || b.maxY + margin < a.minY);
}

// Calcule toutes les intersections entre toutes les routes (y compris même type).
// Détection :
//   0) PRE-CHECK : skip total si > ROAD_INTERSECTION_MAX_ROADS (garde-fou anti-freeze).
//   0bis) PRE-CHECK : pour chaque paire, AABB intersect ? Sinon skip toute la paire.
//   1) Croisement franc segment×segment (algo paramétrique strict)
//   2) Proximité d'une extrémité d'une route avec un segment d'une autre
//      (tolérance ROAD_PROXIMITY_TOLERANCE) — capture les T-junctions imparfaites.
//   3) Dedup final : on collapse les intersections distantes de < tolérance entre elles.
function _calculerIntersectionsRoads(roads) {
  const raw = [];
  const isDebug = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);

  // Garde-fou anti-freeze sur les gros plans : skip total si trop de routes.
  // Seuil dynamique : 200 en mode normal, 50 si PerfUltra.noIntersect actif.
  const _maxRoads = _roadIntersectionMaxRoads();
  if (roads.length > _maxRoads) {
    console.warn("[Roads] " + roads.length + " routes > " + _maxRoads +
                 " — calcul d'intersections SKIP pour preserver la perf. " +
                 "Astuce : dessine les routes dans le PNG + masque le calque (cf doc).");
    return [];
  }

  // Pre-calcul des bbox de toutes les routes valides (cout O(N×P), une fois)
  const validRoads = [];
  const bboxes = [];
  for (let i = 0; i < roads.length; i++) {
    const r = roads[i];
    if (r && Array.isArray(r.points) && r.points.length >= 2) {
      validRoads.push(r);
      bboxes.push(_bboxOfRoad(r));
    }
  }

  let pairsTotal = 0, pairsSkipped = 0;

  for (let i = 0; i < validRoads.length; i++) {
    const A     = validRoads[i];
    const bboxA = bboxes[i];
    for (let j = i + 1; j < validRoads.length; j++) {
      pairsTotal++;
      const B     = validRoads[j];
      const bboxB = bboxes[j];

      // PRE-CHECK AABB : si les bbox ne se recouvrent pas (avec marge), aucune
      // intersection possible → skip toute la paire (gain massif sur gros plans).
      if (!_bboxIntersect(bboxA, bboxB, ROAD_PROXIMITY_TOLERANCE)) {
        pairsSkipped++;
        continue;
      }

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
    const skipPct = pairsTotal > 0 ? Math.round(100 * pairsSkipped / pairsTotal) : 0;
    console.log("[Roads] Roads count:", roads.length,
                "→ paires testees:", pairsTotal, "(AABB skip:", pairsSkipped, "=", skipPct + "%)",
                "→ raw:", raw.length, "→ après dedup:", intersections.length);
  }
  return intersections;
}

// =========================
// RENDU
// =========================
// Cible des polylines roads de session : window.layerEditor (= calque
// "Mes annotations").
// EXCEPTION : le type "itinerary" reste sur window.map direct, car il a son
// propre cycle de vie (modale Itinéraire / ❌ Effacer / 🔄 Recalculer) et ne
// doit PAS être masque par le toggle.
// ⚠️ Note : le toggle "Mes annotations" peut ne pas masquer les polylines
// roads sur certaines configurations (bug Leaflet subtil non identifie au
// 09/05/2026). Les zones, markers et autres elements suivent bien le toggle.
// Fallback window.map si layerEditor pas encore cree (init precoce).
function _targetLayerForRoad(roadType) {
  if (roadType === "itinerary") return window.map;
  return window.layerEditor || window.map;
}

function renderRoads() {
  console.log("[Road] renderRoads — roadsData :", roadsData);

  // .remove() détache le layer où qu'il soit (map directe ou via layerGroup).
  // Plus portable que window.map.removeLayer(...) maintenant que les layers
  // peuvent vivre dans layerEditor au lieu de la map.
  roadLayers.forEach(layer => { try { layer.remove(); } catch(e) {} });
  roadLayers = [];

  // 🚀 PerfUltra : lecture des toggles avant le rendu
  const _decim        = !!(window.PerfUltra && window.PerfUltra.get("decim"));
  const _viewportCull = !!(window.PerfUltra && window.PerfUltra.get("viewportCull") && window.map);
  // Bbox du viewport actuel (en coordonnées plan x/y) — pour viewport culling.
  // On élargit légèrement (10%) pour éviter le pop-in au pan.
  let _vpBox = null;
  if (_viewportCull) {
    try {
      const b = window.map.getBounds();
      const sw = b.getSouthWest(), ne = b.getNorthEast();
      const H = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
      // Conversion latlng Leaflet → coords plan : lat = H - y, lng = x
      // donc y = H - lat, x = lng. South = y max plan, North = y min plan.
      const padW = (ne.lng - sw.lng) * 0.1;
      const padH = (ne.lat - sw.lat) * 0.1;
      _vpBox = {
        minX: sw.lng - padW,
        maxX: ne.lng + padW,
        minY: H - (ne.lat + padH),
        maxY: H - (sw.lat - padH)
      };
    } catch(e) { _vpBox = null; }
  }
  let _culled = 0;

  // Tracés — utilisent le renderer canvas par defaut (preferCanvas:true sur la
  // map). Tentative anterieure de forcer SVG (pour fixer le bug du toggle
  // "Mes annotations" sur les polylines roads) abandonnee : le forcage SVG
  // ne resolvait pas le toggle ET causait des crashes au dezoom sur les
  // plans denses. Le bug du toggle reste ouvert (cf README suite 22).
  // Seul l'itineraire garde un renderer SVG dedie : il en a besoin pour le
  // filter CSS drop-shadow (halo neon cyan), impossible sur le canvas.
  roadsData.forEach(road => {
    if (!road.points || road.points.length === 0) return;

    // 🚀 PerfUltra viewport culling : skip si AABB hors du viewport (sauf itinéraire,
    // qu'on garde toujours visible pour la navigation continue).
    if (_viewportCull && _vpBox && road.type !== "itinerary") {
      const bb = _bboxOfRoad(road);
      if (bb.maxX < _vpBox.minX || bb.minX > _vpBox.maxX ||
          bb.maxY < _vpBox.minY || bb.minY > _vpBox.maxY) {
        _culled++;
        return;
      }
    }

    // 🚀 PerfUltra décimation : appliqué uniquement quand le toggle est ON ET
    // si la road a > 8 points (sinon on garde toute la précision). Ramer-Douglas-
    // Peucker avec epsilon dynamique selon le zoom (plus on est dézoomé, plus
    // on peut simplifier sans que ça se voie).
    let workPoints = road.points;
    if (_decim && workPoints.length > 8 && road.type !== "itinerary") {
      const epsilonPx = _decimationEpsilon();
      if (epsilonPx > 0) workPoints = _decimatePointsRDP(workPoints, epsilonPx);
    }

    const latlngs = workPoints.map(p => convertCoord(p.x, p.y));
    const style = ROAD_STYLES[road.type] || { color: "white", weight: 5, opacity: 1 };
    const target = _targetLayerForRoad(road.type);

    if (road.type === "itinerary") {
      // Itineraire : SVG + className pour le filtre CSS drop-shadow (halo neon)
      const opts = Object.assign({}, style, {
        renderer:  L.svg(),
        className: "kta-itinerary-polyline"
      });
      const polyline = L.polyline(latlngs, opts).addTo(target);
      roadLayers.push(polyline);
    } else {
      // Roads session normales : canvas par defaut (preferCanvas)
      const polyline = L.polyline(latlngs, style).addTo(target);
      roadLayers.push(polyline);
    }
  });

  if (_viewportCull && _culled > 0) {
    console.log("[Road] 🚀 viewport-culling : " + _culled + "/" + roadsData.length + " roads skip (hors viewport)");
  }

  // Cercles d'intersection : on combine routes éditables (roadsData) + routes embarquées
  // VISIBLES (filtrées par visibilité du calque Leaflet) — pour que les croisements
  // disparaissent quand l'utilisateur masque un calque dans le contrôle des couches.
  // ⚠️ On exclut le type "itinerary" (calculé par Pathfinder) : il suit le réseau existant
  // donc traverserait des routes à chaque nœud → cercles redondants. Les intersections
  // RÉELLES du réseau sous-jacent restent affichées via le filtrage des autres types.
  // Cercles → layerEditor (meme cible que les polylines roads session).
  const intersectionsTarget = window.layerEditor || window.map;
  const allRoads = roadsData.concat(_embeddedRoadsVisibles()).filter(r => r.type !== "itinerary");
  const intersections = _calculerIntersectionsRoads(allRoads);
  intersections.forEach(({ point, color }) => {
    const latlng = convertCoord(point.x, point.y);
    // Cercles d'intersection : canvas par defaut (preferCanvas) pour perf.
    const cercle = L.circleMarker(latlng, {
      radius:      ROAD_INTERSECTION_RADIUS,
      color:       color,
      fillColor:   color,
      fillOpacity: 1,
      weight:      0,
      stroke:      false,
      interactive: false
    }).addTo(intersectionsTarget);
    roadLayers.push(cercle);
  });

  // Hook : si le panneau "Distance totale des tracés" est ouvert, on
  // rafraîchit le surlignage magenta + le total live (l'utilisateur peut
  // tracer/effacer une road pendant que le panneau est affiché).
  if (typeof window._rdOnRoadsChanged === "function") {
    try { window._rdOnRoadsChanged(); } catch(e) {}
  }
}

// =========================
// RESET COMPLET
// =========================
function resetRoads() {
  roadsData = [];
  currentRoad = null;
  window.modeRoad = null;

  roadLayers.forEach(layer => { try { layer.remove(); } catch(e) {} });
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

// Expose la liste des routes embarquées VISIBLES uniquement (filtrees par
// visibilite du calque dans le controle des couches). Utilise pour les
// cercles d'intersection (qui doivent disparaitre quand le calque est
// masque) et le panneau "Distance totale" (qui ne compte que les visibles).
window.getEmbeddedRoads = function() {
  return _embeddedRoadsVisibles();
};

// Expose la liste de TOUTES les routes embarquees (visibles ET masquees).
// Utilise par Pathfinder : permet a l'utilisateur de masquer le calque des
// routes (qui sont parfois dessinees en dur sur le PNG du plan) pour gagner
// en perf de rendu, tout en gardant le calcul d'itineraire fonctionnel.
// Sans ca, masquer le calque empechait le pathfinder de trouver un chemin
// car il ne voyait plus le reseau de routes.
window.getAllEmbeddedRoads = function() {
  return _embeddedRoads.map(function(e) { return e.road; });
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
