/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// road.js — tracés (roads) de session : dessin, rendu Leaflet, cercles d'intersection, routes embarquées des
// calques de données, magnétisme au dessin, décimation et culling PerfUltra.
// Expose : initRoad, toggleRoadMode, renderRoads, getRoads/setRoads, registerEmbeddedRoad, clearEmbeddedRoads,
//          getAllEmbeddedRoads, ktaDecimerPointsTrace, ktaPurgerFlashSnap…
// Dépend de : styleResolver.js (window.ktaResolveStyle), LegendCustomization, HistoryManager, KtaUid, PerfUltra.
// Pièges : 🩸 Styles des types : TOUJOURS window.ktaResolveStyle, jamais de table locale (check-style-canon.js).
//          🩸 Intersections en O(N²×P²) : plafond de routes, AABB, débounce pendant le dessin.
//          🩸 initRoad rejouée à chaque plan : listeners de singletons (PerfUltra) abonnés UNE fois.
//          🩸 Deux roads de niveaux différents ne se croisent jamais (multi-niveau).
// Garde-fous : check-style-canon.js, check-map-listeners.js · Doc : docs/architecture/rendering-leaflet.md
// =========================

window.modeRoad = null;

let roadsData = [];
let currentRoad = null;
let roadLayers = [];

// Cercles d'intersection SÉPARÉS de roadLayers : leur calcul (O(N²×P²)) est débouncé pendant le dessin, les
// polylines se reconstruisent à chaque point mais les cercles survivent au teardown (_scheduleIntersectionRender).
let intersectionLayers = [];
let _interRenderTimer = null;

// État de rendu par road entre deux renderRoads() complets, pour le refresh viewport incrémental
// (_refreshRoadsViewportOnly, addTo/remove ciblé). Entrée : { road, target (layerGroup parent), layers,
// inViewport (attaché au target), bbox (AABB plan) }.
// ⚠️ bbox est un instantané : une road dont les points changent exige un renderRoads complet.
let _roadRenderState = [];

// Routes embarquées des calques de données (utils.js > ajouterPointsDepuisJSON) : non éditables mais comptées
// dans les intersections. Format [{ road, layer }] ; `layer` (LayerGroup du calque) filtre par visibilité :
// calque masqué → ses roads ET leurs intersections disparaissent.
let _embeddedRoads = [];

// Styles : js/styleResolver.js (table canonique). Ce que la valeur seule n'explique pas :
//   • smoothFactor 2.5 sur les tracés (Leaflet simplifie par Douglas-Peucker, défaut 1.0) : bien moins de points
//     au pan/zoom, perte invisible au zoom usuel.
//   • itinerary garde 1.5 (précision du chemin calculé) et un trait plus épais (au-dessus des autres).
//   • jonction relie deux niveaux (escalier, pente, puits) : toujours visible quel que soit activeLevel.

// Couleur d'un cercle d'intersection entre deux types différents : chemin > secondaire > principal.
const ROAD_INTERSECTION_PRIORITY = {
  principal:  1,
  secondaire: 2,
  chemin:     3
};
const ROAD_INTERSECTION_RADIUS = 8;  // 16px de diamètre

// Style d'un tracé, built-in ET custom (LegendCustomization), via window.ktaResolveStyle. ⚠️ Objet NEUF à chaque
// appel (le muter ne contamine pas les autres tracés) ; null si type inconnu (l'appelant garde son repli).
let _resolverManquantSignale = false;
function _resolveRoadStyle(type) {
  if (typeof window.ktaResolveStyle !== "function") {
    // Seul cas possible : cache SW incohérent. Dit UNE fois, fort, plutôt que repeindre en blanc en silence.
    if (!_resolverManquantSignale) {
      _resolverManquantSignale = true;
      console.error("[Roads] window.ktaResolveStyle absent — styles indisponibles. Cache SW incoherent ?");
    }
    return null;
  }
  return window.ktaResolveStyle("traces", type);
}

// 🩸 Abonnement PerfUltra UNIQUE : initRoad est rejouée à chaque plan mais PerfUltra est un singleton (sinon N
// re-renders par bascule après N plans). La réf pointe la closure throttle de l'init COURANTE.
let _perfUltraSubBound = false;
let _renderRoadsThrottledRef = null;

// ── Init ──────────────────────
function initRoad() {
  // 🩸 Reset à chaque plan : sinon le poll SessionPersist ré-enregistre les routes de l'ancien plan sous l'id du
  // nouveau.
  roadsData = [];
  currentRoad = null;
  // Carte précédente déjà détruite : on vide seulement les références.
  roadLayers = [];
  // Débounce en vol annulé (il tirerait dans le nouveau plan).
  if (_interRenderTimer) { clearTimeout(_interRenderTimer); _interRenderTimer = null; }
  intersectionLayers = [];

  if (window.roadInitialized) return;
  window.roadInitialized = true;

  console.log("[Road] initRoad OK");

  // Calque affiché/masqué → intersections recalculées. Throttle 250 ms : bascules en rafale et burst d'événements
  // au changement de plan, sur un calcul lourd.
  let _renderRoadsTimer = null;
  function _renderRoadsThrottled() {
    if (_renderRoadsTimer) return;
    _renderRoadsTimer = setTimeout(function() {
      _renderRoadsTimer = null;
      renderRoads();
    }, 250);
  }
  window.map.on("overlayadd overlayremove", _renderRoadsThrottled);

  // PerfUltra au moveend/zoomend : décimation ON → renderRoads complet (la RDP dépend du zoom) ; culling seul →
  // _refreshRoadsViewportOnly (addTo/remove ciblé, 5-10× plus rapide sur plan dense).
  window.map.on("moveend zoomend", function() {
    if (!window.PerfUltra) return;
    const _vp = !!window.PerfUltra.get("viewportCull");
    const _dc = !!window.PerfUltra.get("decim");
    if (_dc) {
      _renderRoadsThrottled();
    } else if (_vp) {
      _refreshRoadsViewportOnly();
    }
  });

  // Bascule PerfUltra (décimation, culling, plafond d'intersections) appliquée à chaud, sans reload.
  _renderRoadsThrottledRef = _renderRoadsThrottled;
  if (!_perfUltraSubBound && window.PerfUltra && typeof window.PerfUltra.onChange === "function") {
    _perfUltraSubBound = true;
    window.PerfUltra.onChange(function(changedKeys) {
      const touchedRender = changedKeys.some(function(k) {
        return ["decim", "viewportCull", "noIntersect"].indexOf(k) >= 0;
      });
      if (touchedRender && _renderRoadsThrottledRef) _renderRoadsThrottledRef();
    });
  }

  window.map.on("mousedown", function(e) {
    if (!window.modeRoad) return;

    let x = e.latlng.lng;
    let y = APP_CONFIG.imageHeight - e.latlng.lat;

    // Magnétisme : le point cliqué s'accroche au sommet existant le plus proche. 🩸 Deux tracés joints à l'œil
    // tombent souvent à 5-10 px l'un de l'autre → deux nœuds au lieu d'un ; au-delà de la PROXIMITY_TOLERANCE du
    // Pathfinder (15 px), l'itinéraire refuse une galerie visiblement reliée.
    const _snap = _snapSurSommetProche(x, y);
    if (_snap) {
      x = _snap.x;
      y = _snap.y;
      _flashSnap(_snap.x, _snap.y);
    }

    // ⚠️ Undo/Redo : état capturé AVANT toute mutation (nouvelle road ou nouveau sommet).
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("roads") : null;
    const _isNewRoad = !currentRoad;

    if (!currentRoad) {
      currentRoad = {
        type: window.modeRoad,
        points: []
      };
      // ⚠️ Multi-niveau : jonction → fromLevel + toLevel (pas de `level`, c'est un pont) ; autres types → `level`
      // = activeLevel. Hors multi-niveau : AUCUN champ de niveau sérialisé.
      if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
        if (window.modeRoad === "jonction") {
          // Niveaux posés par interface.js avant d'activer le mode.
          const meta = window._jonctionPendingMeta || {};
          currentRoad.fromLevel = Number.isInteger(meta.fromLevel) ? meta.fromLevel : (APP_CONFIG.activeLevel || 0);
          currentRoad.toLevel   = Number.isInteger(meta.toLevel)   ? meta.toLevel   : (APP_CONFIG.activeLevel || 0);
        } else {
          currentRoad.level = APP_CONFIG.activeLevel || 0;
        }
      }
      if (window.KtaUid) window.KtaUid.ensure(currentRoad, "rd");
      roadsData.push(currentRoad);
      if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
        console.log("[Road] nouveau tracé", currentRoad.type);
      }
    }

    currentRoad.points.push({ x, y });
    if (window.KtaUid) window.KtaUid.touch(currentRoad);   // chaque sommet est une modification

    renderRoads();

    if (window.HistoryManager && _historyBefore) {
      let typeLabel;
      if (window.LegendCustomization && String(window.modeRoad).startsWith("cust-")) {
        const e = window.LegendCustomization.findCustomEntry(window.modeRoad);
        typeLabel = e ? e.label : window.modeRoad;
      } else {
        typeLabel = window.modeRoad === "principal"  ? window.I18n.t("road.type.principal")
                  : window.modeRoad === "secondaire" ? window.I18n.t("road.type.secondaire")
                  : window.modeRoad === "chemin"     ? window.I18n.t("road.type.chemin")
                  : window.modeRoad === "jonction"   ? window.I18n.t("road.type.jonction")
                  : window.modeRoad;
        // Type built-in RENOMMÉ dans la légende : son nom choisi va jusque dans le libellé d'historique.
        const _LC = window.LegendCustomization;
        if (_LC && typeof _LC.getLabel === "function" && typeof _LC.getSource === "function") {
          try {
            if (_LC.getSource("traces", window.modeRoad) !== "default") {
              const _l = _LC.getLabel("traces", window.modeRoad);
              if (_l) typeLabel = _l;
            }
          } catch(e) {}
        }
      }
      const lbl = _isNewRoad
        ? window.I18n.t("road.history.new", { type: typeLabel })
        : window.I18n.t("road.history.vertex", { type: typeLabel });
      window.HistoryManager.record(lbl, _historyBefore, "roads");
    }
  });
}

// ── Activer / désactiver un type ──────────────────────
function toggleRoadMode(type) {
  if (window.modeRoad !== type && typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;
  if (window.modeRoad === type) {
    window.modeRoad = null;
    currentRoad = null;
  } else {
    window.modeRoad = type;
    currentRoad = null;
  }

  // 🩸 Tous les layers (roads, zones, structures, data layer KMZ) resynchronisés : un mode actif doit retirer
  // ghosts et popups des trois types, sinon ils interceptent les clics du tracé (utils.js >
  // _kta_syncAllNoteUiForModeChange).
  if (typeof window._kta_syncAllNoteUiForModeChange === "function") {
    window._kta_syncAllNoteUiForModeChange();
  }

  console.log("[Road] Mode :", window.modeRoad);
}

// ── Géométrie des intersections ──────────────────────
// Point {x, y} où les segments [p1, p2] et [p3, p4] se croisent, sinon null (coordonnées image).
function _segmentIntersection(p1, p2, p3, p4) {
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;
  const x4 = p4.x, y4 = p4.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null; // segments parallèles ou colinéaires

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // Dans les deux segments, pas seulement sur les droites.
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

// Projeté de p sur [a, b], borné aux extrémités : { dist, proj: {x, y} } (jonctions en T imparfaites).
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

// Jonction en T imparfaite : extrémité d'une route à ≤ 8 px (plan) d'une autre = intersection.
// ⚠️ D'où les cercles sur des tracés qui se frôlent sans se toucher (raison du défaut OFF, config.js).
const ROAD_PROXIMITY_TOLERANCE = 8;

// Type « gagnant » : même type → lui ; sinon priorité ROAD_INTERSECTION_PRIORITY.
function _typeGagnant(typeA, typeB) {
  if (typeA === typeB) return typeA;
  const pA = ROAD_INTERSECTION_PRIORITY[typeA] || 0;
  const pB = ROAD_INTERSECTION_PRIORITY[typeB] || 0;
  return pA >= pB ? typeA : typeB;
}

// Plafond de routes (session + embarquées visibles) au-delà duquel les intersections ne sont PAS calculées
// (O(N²×P²)). 500, ou 50 avec PerfUltra.noIntersect ; relu à chaque appel. 🩸 Au-delà, un toast le dit (sinon les
// cercles disparaissent en silence). Alternative : routes dans le PNG + calque masqué (README_USER, « Optimiser
// ton plan »).
function _roadIntersectionMaxRoads() {
  if (window.PerfUltra && window.PerfUltra.get("noIntersect")) return 50;
  return 500;
}

// ── PerfUltra : décimation des polylines (Ramer-Douglas-Peucker) ──────────────────────
// Epsilon (px plan) selon le zoom : plus on est dézoomé (facteur 2^-z), plus on simplifie sans que ça se voie.
// 0 = pas de décimation.
function _decimationEpsilon() {
  if (!window.map) return 0;
  const z = window.map.getZoom();
  if (z >= 0)  return 0;        // proche : précision gardée
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

// RDP itératif (pas de récursion profonde sur les longues polylines).
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

// Même décimation pour les tracés des calques de données (utils.js), hors renderRoads : exposée, jamais recopiée.
// Rend null quand le zoom ne justifie rien (l'appelant garde la précision).
window.ktaDecimerPointsTrace = function(pts) {
  const eps = _decimationEpsilon();
  if (!(eps > 0) || !Array.isArray(pts) || pts.length <= 8) return null;
  return { epsilon: eps, points: _decimatePointsRDP(pts, eps) };
};
window.ktaEpsilonDecimation = _decimationEpsilon;

// AABB d'une road { minX, minY, maxX, maxY } : pré-test des intersections (90 %+ des paires écartées sans comparer
// un seul segment).
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

// Recouvrement de deux AABB, avec marge (jonctions en T imparfaites au bord des boîtes).
function _bboxIntersect(a, b, margin) {
  return !(a.maxX + margin < b.minX || b.maxX + margin < a.minX ||
           a.maxY + margin < b.minY || b.maxY + margin < a.minY);
}

// Toutes les intersections entre routes (même type compris) :
//   0) au-delà de _roadIntersectionMaxRoads() → rien (anti-gel) ; paire sans recouvrement d'AABB → sautée
//   1) croisement franc segment × segment
//   2) extrémité d'une route à ≤ ROAD_PROXIMITY_TOLERANCE d'un segment d'une autre (T imparfait)
//   3) dédoublonnage des intersections plus proches que la tolérance
function _calculerIntersectionsRoads(roads) {
  const raw = [];
  const isDebug = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);
  const _mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);

  // Couleur par type mémorisée : le resolver construit un objet neuf par appel et la boucle est en O(N²).
  // ⚠️ Mémo LOCAL à l'appel : une couleur custom changée à chaud doit être reprise au rendu suivant.
  const _couleurParType = {};
  function _couleurDeType(t) {
    if (!(t in _couleurParType)) {
      const s = _resolveRoadStyle(t);
      _couleurParType[t] = (s && s.color) || "#ffffff";
    }
    return _couleurParType[t];
  }

  const _maxRoads = _roadIntersectionMaxRoads();
  if (roads.length > _maxRoads) {
    console.warn("[Roads] " + roads.length + " routes > " + _maxRoads +
                 " — calcul d'intersections SKIP pour preserver la perf. " +
                 "Astuce : dessine les routes dans le PNG + masque le calque (cf doc).");
    return [];
  }

  // AABB de toutes les routes valides, une fois (O(N×P)).
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

      if (!_bboxIntersect(bboxA, bboxB, ROAD_PROXIMITY_TOLERANCE)) {
        pairsSkipped++;
        continue;
      }

      // 🩸 Niveaux différents = pas de contact physique (l'une passe au-dessus de l'autre). Road sans `level` =
      // niveau 0.
      if (_mlOn) {
        const lvlA = Number.isInteger(A.level) ? A.level : 0;
        const lvlB = Number.isInteger(B.level) ? B.level : 0;
        if (lvlA !== lvlB) {
          pairsSkipped++;
          continue;
        }
      }

      const winner = _typeGagnant(A.type, B.type);
      const color  = _couleurDeType(winner);

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

  // 3) Dédoublonnage.
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

// ── Magnétisme au dessin ──────────────────────
// Accroche le point cliqué au sommet existant le plus proche : deux galeries qui se rejoignent forment UN nœud.
// ⚠️ N'aide que ce qui est dessiné après activation : la PROXIMITY_TOLERANCE du Pathfinder reste indispensable.
// Choix :
//   • 🩸 Scan des SOMMETS des roads (session + embarquées), PAS de RoadGraph : chaque clic change la signature du
//     cache et getGraph() reconstruirait tout le réseau à chaque clic. Équivalent (un nœud = un sommet).
//   • Rayon en pixels ÉCRAN converti en unités plan au clic : « proche à l'œil », à tous les zooms.
//   • Le DERNIER point de la road en cours est exclu (un clic voisin s'y collerait) ; les précédents restent
//     éligibles (fermer une boucle marche).
//   • Multi-niveau : seulement les roads du niveau actif, sauf les jonctions (faites pour relier) — sinon
//     accrochage sur une galerie d'un autre étage superposée en x/y.
function _snapSurSommetProche(x, y) {
  const cfg = window.APP_CONFIG || {};
  if (cfg.snapDraw !== true) return null;
  if (!window.map || typeof window.map.latLngToLayerPoint !== "function") return null;

  // Rayon écran → unités plan, mesuré au CENTRE de la vue avec la projection courante (indépendant du CRS).
  const px = (Number.isFinite(cfg.snapDrawPx) && cfg.snapDrawPx > 0) ? cfg.snapDrawPx : 14;
  let tol;
  try {
    const c   = window.map.getCenter();
    const p0  = window.map.latLngToLayerPoint(c);
    const ll1 = window.map.layerPointToLatLng(L.point(p0.x + px, p0.y));
    tol = Math.abs(ll1.lng - c.lng);
  } catch(e) { return null; }
  if (!Number.isFinite(tol) || tol <= 0) return null;

  const mlOn  = cfg.multiLevel === true;
  const actif = Number.isInteger(cfg.activeLevel) ? cfg.activeLevel : 0;

  const session  = (typeof window.getRoads === "function" ? window.getRoads() : roadsData) || [];
  const embedded = (typeof window.getAllEmbeddedRoads === "function")
    ? (window.getAllEmbeddedRoads() || [])
    : ((typeof window.getEmbeddedRoads === "function") ? (window.getEmbeddedRoads() || []) : []);

  // Dernier sommet posé sur la road en cours → jamais candidat.
  let exclu = null;
  if (currentRoad && Array.isArray(currentRoad.points) && currentRoad.points.length > 0) {
    exclu = currentRoad.points[currentRoad.points.length - 1];
  }

  let best = null;
  const _scan = function(roads) {
    for (let i = 0; i < roads.length; i++) {
      const r = roads[i];
      if (!r || !Array.isArray(r.points)) continue;
      if (r.type === "itinerary") continue;        // calculé, pas cartographié
      if (mlOn && r.type !== "jonction" && Number.isInteger(r.level) && r.level !== actif) continue;
      for (let j = 0; j < r.points.length; j++) {
        const p = r.points[j];
        if (!p || p === exclu) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= tol && (!best || d < best.d)) best = { x: p.x, y: p.y, d: d };
      }
    }
  };
  _scan(session);
  _scan(embedded);

  if (best && window.APP_CONFIG && window.APP_CONFIG.debugMode) {
    console.log("[Road] 🧲 accrochage sur sommet à", best.d.toFixed(2), "px plan (tol", tol.toFixed(2), ")");
  }
  return best;
}

// Flash APRÈS l'accrochage, pas d'aperçu au survol : le survol n'existe pas au doigt, et un scan O(N) par
// mousemove coûterait cher sur réseau dense.
let _snapFlashLayer = null;
let _snapFlashTimer = null;
function _flashSnap(x, y) {
  if (!window.map || !window.L) return;
  try {
    if (_snapFlashTimer) { clearTimeout(_snapFlashTimer); _snapFlashTimer = null; }
    if (_snapFlashLayer) { window.map.removeLayer(_snapFlashLayer); _snapFlashLayer = null; }
    _snapFlashLayer = L.circleMarker(convertCoord(x, y), {
      radius: 9, color: "#f4c542", weight: 3, opacity: 0.95,
      fillColor: "#f4c542", fillOpacity: 0.25, interactive: false
    }).addTo(window.map);
    _snapFlashTimer = setTimeout(function() {
      if (_snapFlashLayer) {
        try { window.map.removeLayer(_snapFlashLayer); } catch(e) {}
        _snapFlashLayer = null;
      }
      _snapFlashTimer = null;
    }, 700);
  } catch(e) {
    // ⚠️ Jamais de catch muet ici : un flash absent doit se voir (un silence a déjà masqué une autre panne).
    console.warn("[Road] 🧲 flash d'accrochage impossible :", e);
  }
}

// Purge du flash (changement de plan, sortie de mode) : sinon layer orphelin sur la carte recréée.
window.ktaPurgerFlashSnap = function() {
  if (_snapFlashTimer) { clearTimeout(_snapFlashTimer); _snapFlashTimer = null; }
  if (_snapFlashLayer) {
    try { window.map.removeLayer(_snapFlashLayer); } catch(e) {}
    _snapFlashLayer = null;
  }
};

// ── Rendu ──────────────────────
// Cible des roads de session : window.layerEditor (calque « Mes annotations »). ⚠️ Exception : "itinerary" va sur
// window.map, avec son propre cycle de vie (modale Itinéraire), et ne doit PAS suivre ce calque.
// Le repli window.map n'est qu'un filet : map.js pose layerEditor dans initMapFromConfig(), avant initRoad() et la
// restauration, et ne le remet jamais à undefined. Un tracé qui « reste » quand on masque le calque est donc
// l'itinéraire ou une road embarquée d'un AUTRE calque.
function _targetLayerForRoad(roadType) {
  if (roadType === "itinerary") return window.map;
  return window.layerEditor || window.map;
}

// ── Cercles d'intersection ──────────────────────
// Routes éditables + embarquées VISIBLES, sans "itinerary" (suit le réseau) ni "jonction" (ponts), filtrées par
// niveaux visibles et par type. Dans intersectionLayers (hors roadLayers) : débouncés pendant le dessin sans
// clignoter.
// ⚠️ Les filtres de niveau et de type sont des MIROIRS de ceux de renderRoads : à garder alignés.

// 🩸 layer.remove() sur un circleMarker le retire de la CARTE mais PAS du FeatureGroup parent (layerEditor) : les
// cercles s'y accumulent à chaque rendu (des centaines de fantômes). Retrait par le FeatureGroup quand il le tient.
function _purgeIntersectionLayers() {
  const grp = window.layerEditor;
  intersectionLayers.forEach(layer => {
    try {
      if (grp && typeof grp.hasLayer === "function" && grp.hasLayer(layer)) {
        grp.removeLayer(layer);
      } else {
        layer.remove();
      }
    } catch(e) {}
  });
  intersectionLayers = [];
}

function _renderIntersections() {
  // Rendu à jour : un débounce en attente est annulé.
  if (_interRenderTimer) { clearTimeout(_interRenderTimer); _interRenderTimer = null; }

  _purgeIntersectionLayers();

  // Affichage par plan (config.js > getPlanShowsIntersections, défaut OFF). Le calcul reste disponible pour les
  // exports via window.computeRoadIntersections.
  const _shows = (typeof window.getPlanShowsIntersections === "function")
    ? window.getPlanShowsIntersections()
    : (window.APP_CONFIG && window.APP_CONFIG.showRoadIntersections !== false);
  if (!_shows) return;

  const _mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const _vis  = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
                  ? window.APP_CONFIG.visibleLevels : [0];
  function _passe(road) {
    if (!_mlOn) return true;
    if (road.type === "itinerary") return true;
    if (road === currentRoad) return true;
    if (road.type === "jonction") {
      const fromL = Number.isInteger(road.fromLevel) ? road.fromLevel : 0;
      const toL   = Number.isInteger(road.toLevel)   ? road.toLevel   : 0;
      return _vis.indexOf(fromL) >= 0 || _vis.indexOf(toL) >= 0;
    }
    const lvl = Number.isInteger(road.level) ? road.level : 0;
    return _vis.indexOf(lvl) >= 0;
  }

  // 🩸 Filtre par type (FilterPanel), miroir de renderRoads : un type décoché doit emporter ses cercles aussi.
  function _passeFiltreTag(road) {
    if (!window._ktaRuntimeFilters || !window._ktaRuntimeFilters.roadTypes) return true;
    if (road.type === "itinerary" || road === currentRoad) return true;
    return window._ktaRuntimeFilters.roadTypes.has(road.type);
  }

  const intersectionsTarget = window.layerEditor || window.map;
  const allRoads = roadsData.concat(_embeddedRoadsVisibles())
    .filter(function(r) {
      if (r.type === "itinerary" || r.type === "jonction") return false;
      if (!_passe(r))           return false;
      if (!_passeFiltreTag(r))  return false;
      return true;
    });
  const intersections = _calculerIntersectionsRoads(allRoads);
  intersections.forEach(({ point, color }) => {
    const latlng = convertCoord(point.x, point.y);
    // Canvas par défaut (preferCanvas).
    const cercle = L.circleMarker(latlng, {
      radius:      ROAD_INTERSECTION_RADIUS,
      color:       color,
      fillColor:   color,
      fillOpacity: 1,
      weight:      0,
      stroke:      false,
      interactive: false
    }).addTo(intersectionsTarget);
    intersectionLayers.push(cercle);
  });
}

// Throttle « trailing » pendant le dessin : au plus un calcul par 350 ms ; le 1er point arme le timer, les suivants
// sont absorbés, le tir rend l'état le PLUS RÉCENT.
function _scheduleIntersectionRender() {
  if (_interRenderTimer) return;
  _interRenderTimer = setTimeout(function() {
    _interRenderTimer = null;
    _renderIntersections();
  }, 350);
}

// 🩸 UN SEUL renderer SVG par carte pour l'itinéraire et ses raccords : un L.svg() neuf par polyline empile les
// <svg> et échappe au mode « plan orienté » (mapBearing.js > _majPaddingRenderer : trajet coupé dans les coins).
// Rangé SUR la carte : nouvelle carte = nouveau renderer, rien à purger.
function _rendererItineraire() {
  const m = window.map;
  if (!m) return L.svg();
  if (!m._ktaItiRenderer) m._ktaItiRenderer = L.svg();
  return m._ktaItiRenderer;
}

function renderRoads() {
  // ⚠️ Chemin chaud (chaque point pendant le dessin) : ne jamais logger le tableau roadsData (sérialisation, et la
  // console retient les références). Compte seulement, en debugMode.
  if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
    console.log("[Road] renderRoads — roadsData :", roadsData.length, "tracés");
  }

  // 🩸 Retrait par le FeatureGroup parent quand il tient le layer (même piège que _purgeIntersectionLayers : les
  // ronds des jonctions survivaient sinon).
  const _grpRoad = window.layerEditor;
  roadLayers.forEach(layer => {
    try {
      if (_grpRoad && typeof _grpRoad.hasLayer === "function" && _grpRoad.hasLayer(layer)) {
        _grpRoad.removeLayer(layer);
      } else {
        layer.remove();
      }
    } catch(e) {}
  });
  roadLayers = [];
  // Repeuplé ci-dessous : une entrée par road qui passe les filtres (hors viewport).
  _roadRenderState = [];

  const _decim        = !!(window.PerfUltra && window.PerfUltra.get("decim"));
  const _viewportCull = !!(window.PerfUltra && window.PerfUltra.get("viewportCull") && window.map);
  // Viewport en coordonnées plan, élargi de 10 % (pas d'apparition tardive au pan).
  let _vpBox = null;
  if (_viewportCull) {
    try {
      // 🩸 Sous rotation, getBounds() rend le rectangle NON tourné : zoneVisible() rend l'empreinte réelle de
      // l'écran (et exactement getBounds() hors mode).
      const b = (window.MapBearing && window.MapBearing.zoneVisible
                 ? window.MapBearing.zoneVisible(0) : null) || window.map.getBounds();
      const sw = b.getSouthWest(), ne = b.getNorthEast();
      const H = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
      // ⚠️ latlng → plan : x = lng, y = H - lat (le Sud est le y max du plan).
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

  // Filtre multi-niveau : level ∈ visibleLevels ; jonction visible si fromLevel OU toLevel l'est. Hors
  // multi-niveau : tout visible.
  const _multiLevelOn   = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const _visibleLevels  = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
                            ? window.APP_CONFIG.visibleLevels : [0];
  function _passeFiltreNiveau(road) {
    if (!_multiLevelOn) return true;
    if (road.type === "itinerary") return true;       // itinéraire toujours visible
    // 🩸 Road EN COURS de tracé toujours visible : créée sur activeLevel alors que le filtre montre un autre
    // niveau, elle ne grandirait pas à l'écran.
    if (road === currentRoad) return true;
    if (road.type === "jonction") {
      const fromL = Number.isInteger(road.fromLevel) ? road.fromLevel : 0;
      const toL   = Number.isInteger(road.toLevel)   ? road.toLevel   : 0;
      return _visibleLevels.indexOf(fromL) >= 0 || _visibleLevels.indexOf(toL) >= 0;
    }
    // `level` absent = 0.
    const lvl = Number.isInteger(road.level) ? road.level : 0;
    return _visibleLevels.indexOf(lvl) >= 0;
  }

  // 🩸 Tracés sur le renderer CANVAS (preferCanvas) : forcer le SVG fait planter au dézoom sur plan dense. Seul
  // l'itinéraire a son SVG (filtre CSS drop-shadow du halo, impossible en canvas).
  // Multi-niveau : tri par niveau puis type, car Leaflet empile dans l'ordre d'addTo() (premier = dessous).
  // Niveau croissant ; au même niveau chemin < secondaire < principal < jonction ; itinéraire TOUJOURS au-dessus.
  // Hors multi-niveau : ordre d'insertion.
  let _renderQueue = roadsData;
  if (_multiLevelOn) {
    const TYPE_ORDER = { chemin: 0, secondaire: 1, principal: 2, jonction: 3 };
    _renderQueue = [...roadsData].sort(function(a, b) {
      if (a.type === "itinerary" && b.type !== "itinerary") return 1;
      if (b.type === "itinerary" && a.type !== "itinerary") return -1;
      if (a.type === "itinerary" && b.type === "itinerary") return 0;
      // Jonction : max(fromLevel, toLevel), le pont passe AU-DESSUS du niveau inférieur.
      const la = (a.type === "jonction")
        ? Math.max(Number.isInteger(a.fromLevel) ? a.fromLevel : 0,
                   Number.isInteger(a.toLevel)   ? a.toLevel   : 0)
        : (Number.isInteger(a.level) ? a.level : 0);
      const lb = (b.type === "jonction")
        ? Math.max(Number.isInteger(b.fromLevel) ? b.fromLevel : 0,
                   Number.isInteger(b.toLevel)   ? b.toLevel   : 0)
        : (Number.isInteger(b.level) ? b.level : 0);
      if (la !== lb) return la - lb;
      return (TYPE_ORDER[a.type] != null ? TYPE_ORDER[a.type] : 99) -
             (TYPE_ORDER[b.type] != null ? TYPE_ORDER[b.type] : 99);
    });
  }

  _renderQueue.forEach(road => {
    if (!road.points || road.points.length === 0) return;

    if (!_passeFiltreNiveau(road)) return;

    // ⚠️ Filtre par type (FilterPanel) : window._ktaRuntimeFilters.roadTypes null = tout visible, Set = types
    // visibles. Itinéraire et road en cours passent toujours.
    if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.roadTypes
        && road.type !== "itinerary" && road !== currentRoad) {
      if (!window._ktaRuntimeFilters.roadTypes.has(road.type)) return;
    }

    // Culling : la polyline est TOUJOURS créée, seul addTo() dépend du viewport. Au moveend,
    // _refreshRoadsViewportOnly n'a qu'à attacher/détacher (5-10× plus rapide). Itinéraire jamais cullé
    // (docs/architecture/perf-memory.md).
    const _bb = (_viewportCull && road.type !== "itinerary") ? _bboxOfRoad(road) : null;
    let _isInViewport = true;
    if (_viewportCull && _vpBox && _bb) {
      if (_bb.maxX < _vpBox.minX || _bb.minX > _vpBox.maxX ||
          _bb.maxY < _vpBox.minY || _bb.minY > _vpBox.maxY) {
        _isInViewport = false;
        _culled++;
      }
    }

    // Décimation RDP (epsilon selon le zoom) : PerfUltra ON et plus de 8 points seulement.
    let workPoints = road.points;
    if (_decim && workPoints.length > 8 && road.type !== "itinerary") {
      const epsilonPx = _decimationEpsilon();
      if (epsilonPx > 0) workPoints = _decimatePointsRDP(workPoints, epsilonPx);
    }

    const latlngs = workPoints.map(p => convertCoord(p.x, p.y));
    const style = _resolveRoadStyle(road.type) || { color: "white", weight: 5, opacity: 1 };
    const target = _targetLayerForRoad(road.type);

    let polyline;
    if (road.type === "itinerary") {
      // Itinéraire : SVG + className du filtre CSS (halo).
      const opts = Object.assign({}, style, {
        renderer:  _rendererItineraire(),
        className: "kta-itinerary-polyline"
      });
      polyline = L.polyline(latlngs, opts);
    } else {
      polyline = L.polyline(latlngs, style);
    }
    // Hors viewport : polyline gardée en RAM, pas attachée ; roadLayers la garde pour le nettoyage suivant.
    if (_isInViewport) polyline.addTo(target);
    roadLayers.push(polyline);
    const _trackedLayers = [polyline];

    // Raccords de l'itinéraire : trajet À VOL D'OISEAU entre une étape et le tracé où elle s'accroche, dessiné en
    // pointillé = « pas une galerie » (le plan ne dit rien de ce qu'il y a entre les deux) (décision produit).
    if (road.type === "itinerary" && Array.isArray(road.raccords)) {
      road.raccords.forEach(function(rc) {
        if (!rc || !rc.de || !rc.vers || !(Number(rc.distPx) > 0.5)) return;
        const pointille = L.polyline(
          [convertCoord(rc.de.x, rc.de.y), convertCoord(rc.vers.x, rc.vers.y)],
          Object.assign({}, style, {
            renderer:    _rendererItineraire(),
            className:   "kta-itinerary-raccord",
            weight:      Math.max(2, Math.round((style.weight || 5) * 0.6)),
            dashArray:   "4 8",
            interactive: false
          })
        );
        if (_isInViewport) pointille.addTo(target);
        roadLayers.push(pointille);
        _trackedLayers.push(pointille);
      });
    }

    // Popup note au clic (tout sauf l'itinéraire), portée par une polyline « ghost » TRANSPARENTE plus épaisse
    // (weight + 14, mini 18) : zone tactile élargie, trait visible inchangé. Jonction : sa fiche change ses niveaux
    // (Départ / Arrivée) au lieu de Convertir (utils.js > attacherNotePopup, `opts.jonction`).
    // 🩸 Pas de ghost sur la road EN COURS (elle avalerait le clic du sommet suivant : bubblingMouseEvents false),
    // ni quand un mode d'édition est actif (elle avalerait les clics d'une nouvelle road/zone/structure).
    // renderRoads est rappelé à chaque bascule de mode.
    if (typeof window.attacherNotePopup === "function" &&
        road.type !== "itinerary" &&
        road !== currentRoad &&
        window._aucunModeEditionActif()) {
      const _roadRef = road;
      // Titre via LegendCustomization : customs ET built-in renommés.
      const _roadEmojis = { principal: "🟩", secondaire: "🟪", chemin: "🟨" };
      function _roadPopupTitle(t) {
        if (t === "jonction") {
          const _n = function(v) { return window.ktaFormatNiveau(Number.isInteger(v) ? v : 0); };
          return window.I18n.t("jonctionFiche.titre", { de: _n(_roadRef.fromLevel), vers: _n(_roadRef.toLevel) });
        }
        if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
          if (String(t).startsWith("cust-")) {
            const e = window.LegendCustomization.findCustomEntry(t);
            if (e) return "✨ " + e.label;
          }
          if (_roadEmojis[t]) {
            return _roadEmojis[t] + " " + window.LegendCustomization.getLabel("traces", t);
          }
        }
        // Repli sans LegendCustomization : clés road.popup.* au rendu, FR si I18n absent.
        const _i = window.I18n;
        const LBL = _i ? {
          principal:  _i.t("road.popup.principal"),
          secondaire: _i.t("road.popup.secondaire"),
          chemin:     _i.t("road.popup.chemin")
        } : { principal: "🟩 Tracé principal", secondaire: "🟪 Tracé secondaire", chemin: "🟨 Chemin" };
        return LBL[t] || (_i ? _i.t("road.popup.fallback", { type: t }) : ("Tracé " + t));
      }
      const ghostWeight = Math.max((style.weight || 3) + 14, 18);
      const ghost = L.polyline(latlngs, {
        weight:               ghostWeight,
        opacity:              0,           // invisible
        interactive:          true,
        bubblingMouseEvents:  false,
        // Renderer par défaut (preferCanvas).
      });
      if (_isInViewport) ghost.addTo(target);
      roadLayers.push(ghost);
      _trackedLayers.push(ghost);
      window.attacherNotePopup(
        ghost,
        function() { return _roadRef.description; },
        function(v) { _roadRef.description = v; if (window.KtaUid) window.KtaUid.touch(_roadRef); },
        _roadPopupTitle(road.type),
        // Reclassement depuis la popup (convertirObjet.js) ; une jonction n'a que ses niveaux à changer.
        { convertir: { famille: "roads", obj: _roadRef }, jonction: road.type === "jonction" }
      );
    }

    // Ronds aux extrémités des jonctions (blanc, bord de la couleur du type) : sur une carte dense, on voit où la
    // jonction commence et finit.
    if (road.type === "jonction" && workPoints.length >= 2) {
      const endpoints = [workPoints[0], workPoints[workPoints.length - 1]];
      const _colJonction = (_resolveRoadStyle("jonction") || {}).color;
      endpoints.forEach(function(pt) {
        const cm = L.circleMarker(convertCoord(pt.x, pt.y), {
          radius:      7,
          color:       _colJonction,
          fillColor:   "#ffffff",                    // intérieur blanc → contraste
          fillOpacity: 1,
          weight:      3,
          interactive: false
        });
        if (_isInViewport) cm.addTo(target);
        roadLayers.push(cm);
        _trackedLayers.push(cm);
      });
    }

    // État lu par _refreshRoadsViewportOnly. bbox null (itinéraire, ou culling OFF) = jamais rattachée/détachée.
    _roadRenderState.push({
      road:       road,
      target:     target,
      layers:     _trackedLayers,
      inViewport: _isInViewport,
      bbox:       _bb
    });
  });

  if (_viewportCull && _culled > 0) {
    console.log("[Road] 🚀 viewport-culling : " + _culled + "/" + roadsData.length + " roads skip (hors viewport)");
  }

  // Cercles : immédiats hors dessin ; pendant le dessin, différés (~350 ms) — les cercles existants restent affichés
  // en léger retard. La fin du dessin (modeRoad = null → renderRoads) rend l'état final.
  if (window.modeRoad) {
    _scheduleIntersectionRender();
  } else {
    _renderIntersections();
  }

  // Panneau « Distance totale des tracés » ouvert : surlignage et total à jour.
  if (typeof window._rdOnRoadsChanged === "function") {
    try { window._rdOnRoadsChanged(); } catch(e) {}
  }

  // 🩸 Label distance/temps de l'itinéraire mis à jour ICI, point de passage de TOUTES les mutations de roads
  // (sinon un itinéraire restauré s'affiche sans son label tant qu'on n'ouvre pas la modale). Coût quasi nul.
  if (typeof window._majLabelDistanceItineraire === "function") {
    try { window._majLabelDistanceItineraire(); } catch(e) {}
  }
}

// ── Refresh viewport incrémental ──────────────────────
// Au moveend/zoomend, diff de `_roadRenderState` : addTo/remove ciblé, aucun layer recréé (~1-3 ms au lieu de
// 10-50 ms sur plan dense).
// ⚠️ Exigent un renderRoads complet : décimation active (dépend du zoom), toute mutation de roadsData, bascule
// PerfUltra (via PerfUltra.onChange). Itinéraire exclu (toujours visible).
function _refreshRoadsViewportOnly() {
  if (!window.map || !window.PerfUltra || !window.PerfUltra.get("viewportCull")) return;
  if (_roadRenderState.length === 0) return;

  // Mêmes formules que renderRoads (empreinte réelle, marge 10 %).
  let _vpBox;
  try {
    const b = (window.MapBearing && window.MapBearing.zoneVisible
               ? window.MapBearing.zoneVisible(0) : null) || window.map.getBounds();
    const sw = b.getSouthWest(), ne = b.getNorthEast();
    const H = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
    const padW = (ne.lng - sw.lng) * 0.1;
    const padH = (ne.lat - sw.lat) * 0.1;
    _vpBox = {
      minX: sw.lng - padW,
      maxX: ne.lng + padW,
      minY: H - (ne.lat + padH),
      maxY: H - (sw.lat - padH)
    };
  } catch(e) {
    return;
  }

  let _added = 0, _removed = 0;
  for (let i = 0; i < _roadRenderState.length; i++) {
    const entry = _roadRenderState[i];
    if (!entry.bbox) continue;

    const bb = entry.bbox;
    const shouldBeIn = !(bb.maxX < _vpBox.minX || bb.minX > _vpBox.maxX ||
                          bb.maxY < _vpBox.minY || bb.minY > _vpBox.maxY);

    if (shouldBeIn === entry.inViewport) continue;

    if (shouldBeIn) {
      for (let j = 0; j < entry.layers.length; j++) {
        try { entry.layers[j].addTo(entry.target); } catch(e) {}
      }
      entry.inViewport = true;
      _added++;
    } else {
      for (let j = 0; j < entry.layers.length; j++) {
        try { entry.layers[j].remove(); } catch(e) {}
      }
      entry.inViewport = false;
      _removed++;
    }
  }

  if (window.APP_CONFIG && window.APP_CONFIG.debugMode && (_added || _removed)) {
    console.log("[Road] 🚀 viewport-only refresh : +" + _added + " -" + _removed +
                " (cache=" + _roadRenderState.length + ")");
  }
}

// ── Reset complet ──────────────────────
function resetRoads() {
  roadsData = [];
  currentRoad = null;
  window.modeRoad = null;

  roadLayers.forEach(layer => { try { layer.remove(); } catch(e) {} });
  roadLayers = [];

  // Cercles et débounce purgés (sinon cercles orphelins, et un débounce en vol rendrait un état effacé).
  if (_interRenderTimer) { clearTimeout(_interRenderTimer); _interRenderTimer = null; }
  _purgeIntersectionLayers();

  // 🩸 Hooks de fin de rendu appelés directement (sans renderRoads à blanc) : sinon le label de distance de
  // l'itinéraire reste affiché après « Effacer la session ».
  if (typeof window._rdOnRoadsChanged === "function") {
    try { window._rdOnRoadsChanged(); } catch(e) {}
  }
  if (typeof window._majLabelDistanceItineraire === "function") {
    try { window._majLabelDistanceItineraire(); } catch(e) {}
  }
}

// ── Suppressions ──────────────────────
function removeLastRoad() {
  if (roadsData.length === 0) return false;
  const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("roads") : null;
  const removed = roadsData.pop();
  if (currentRoad === removed) currentRoad = null;
  renderRoads();
  if (window.HistoryManager && _historyBefore) {
    const typeLabel = removed && removed.type ? removed.type : window.I18n.t("road.history.fallbackType");
    window.HistoryManager.record(window.I18n.t("road.history.removeLast", { type: typeLabel }), _historyBefore, "roads");
  }
  return true;
}

// Dernier point du dernier tracé ; un tracé vidé est retiré.
function removeLastRoadPoint() {
  if (roadsData.length === 0) return false;
  const last = roadsData[roadsData.length - 1];
  if (!last.points || last.points.length === 0) {
    roadsData.pop();
    if (currentRoad === last) currentRoad = null;
  } else {
    last.points.pop();
    if (window.KtaUid) window.KtaUid.touch(last);
    if (last.points.length === 0) {
      roadsData.pop();
      if (currentRoad === last) currentRoad = null;
    }
  }
  renderRoads();
  return true;
}

// ── Lecture / écriture ──────────────────────
window.getRoads = function() {
  return roadsData;
};

window.setRoads = function(roads) {
  roadsData = roads || [];
  // Tout tracé qui entre ressort avec un uid (ktaUid.js).
  if (window.KtaUid) window.KtaUid.ensureAll(roadsData, "rd");
  currentRoad = null;
  renderRoads();
};

// 🩸 currentRoad à travers undo/redo : setRoads() le remet à null, et le point suivant créerait un tracé
// DÉCONNECTÉ. HistoryManager capture l'index du tracé en cours et le rétablit après _applyState.
// getCurrentRoadIndex() → index ou -1 · setCurrentRoadByIndex(idx) → currentRoad, ou null si idx invalide.
window.getCurrentRoadIndex = function() {
  if (!currentRoad) return -1;
  return roadsData.indexOf(currentRoad);
};
window.setCurrentRoadByIndex = function(idx) {
  if (typeof idx === "number" && idx >= 0 && idx < roadsData.length) {
    currentRoad = roadsData[idx];
  } else {
    currentRoad = null;
  }
};

// Road en cours (ou null) : interface.js ferme le mode quand une suppression l'a effacée (sinon bouton « actif »
// sans effet).
window.getCurrentRoad = function() {
  return currentRoad || null;
};

// Filtre de niveau partagé par les exports (utils.js > telechargerPlan, exporter.js) : on exporte ce qu'on voit.
// Hors multi-niveau → true ; sinon level ∈ visibleLevels (jonction : fromLevel OU toLevel). `level` absent = 0.
window.passeFiltreNiveau = function(item) {
  const _ml = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  if (!_ml) return true;
  const _visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
    ? window.APP_CONFIG.visibleLevels : [0];
  if (item && item.type === "jonction") {
    const fromL = Number.isInteger(item.fromLevel) ? item.fromLevel : 0;
    const toL   = Number.isInteger(item.toLevel)   ? item.toLevel   : 0;
    return _visibles.indexOf(fromL) >= 0 || _visibles.indexOf(toL) >= 0;
  }
  const lvl = Number.isInteger(item && item.level) ? item.level : 0;
  return _visibles.indexOf(lvl) >= 0;
};

// ── Routes embarquées (calques de données) ──────────────────────
// Enregistrée par utils.js > ajouterPointsDepuisJSON pour compter dans les intersections.
// 🩸 En lot, passer skipRender = true puis appeler renderRoads() UNE fois à la fin : sinon un renderRoads complet
// par route (des centaines au boot).
window.registerEmbeddedRoad = function(road, layer, skipRender) {
  if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
  _embeddedRoads.push({ road: road, layer: layer || null });
  if (skipRender !== true && window.map && window.roadInitialized) renderRoads();
};

// Avant le chargement d'un nouveau plan : registre vidé.
window.clearEmbeddedRoads = function() {
  _embeddedRoads = [];
  if (window.map && window.roadInitialized) renderRoads();
};

// Roads embarquées dont le calque est AFFICHÉ ; sans calque associé = visible.
function _embeddedRoadsVisibles() {
  if (!window.map) return _embeddedRoads.map(function(e) { return e.road; });
  return _embeddedRoads
    .filter(function(e) { return !e.layer || window.map.hasLayer(e.layer); })
    .map(function(e) { return e.road; });
}

// Routes embarquées VISIBLES seulement : cercles d'intersection et panneau « Distance totale ».
window.getEmbeddedRoads = function() {
  return _embeddedRoadsVisibles();
};

// ⚠️ TOUTES les routes embarquées, calque masqué compris : le Pathfinder doit voir le réseau même quand on masque
// le calque (routes déjà dessinées sur le PNG) pour alléger le rendu.
// 🩸 Avec `layerId` (l'export respecte ses cases « calques ») sur une COPIE : jamais de champ greffé sur l'original.
window.getAllEmbeddedRoads = function() {
  const groupes = window.dataLayerGroups || {};
  return _embeddedRoads.map(function(e) {
    let layerId = null;
    for (const id in groupes) { if (groupes[id] === e.layer) { layerId = id; break; } }
    return Object.assign({}, e.road, { layerId: layerId });
  });
};

// ── Exports ──────────────────────
// ⚠️ Intersections pour les exports image (utils.js > telechargerPlan, exporter.js) : roads
// [{type, points: [{x, y}]}] → [{point: {x, y}, color}] en coordonnées image ; rayon = window.ROAD_INTERSECTION_RADIUS.
window.computeRoadIntersections = function(roads) {
  return _calculerIntersectionsRoads(roads || []);
};
window.ROAD_INTERSECTION_RADIUS = ROAD_INTERSECTION_RADIUS;

window.initRoad             = initRoad;
window.toggleRoadMode       = toggleRoadMode;
window.resetRoads           = resetRoads;
window.removeLastRoad       = removeLastRoad;
window.removeLastRoadPoint  = removeLastRoadPoint;
window.renderRoads          = renderRoads;
