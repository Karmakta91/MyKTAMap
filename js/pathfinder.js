/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// PATHFINDER — itinéraire sur le réseau de routes du plan
// =========================
// Dijkstra sur un graphe construit à la volée depuis les polylines (session getRoads() + embarquées
// getAllEmbeddedRoads()), waypoints calés orthogonalement sur le segment le plus proche.
// Expose window.Pathfinder : computeRoute (async, 2 passes), computeRouteOnRoads (sync, réseau fourni),
//   computeReachable (isochrone du Mode Perdu), buildNetworkGraph / snapPointToGraph (roadGraph.js),
//   resolvePointById, aDesTraces, carrefoursSurChemin. Et window.getAvoidableZoneTypes (modale itinéraire).
// ⚠️ computeRoute → { path:[{x, y, level}], totalDistance, segmentCount, snappedPoints, raccords, carrefours }.
//   `level` = entier du niveau s'il est UNIVOQUE, sinon null (nœud fusionné multi-niveaux, milieu de jonction).
// Coordonnées en système image (x, y plan) ; la conversion Leaflet se fait au rendu (road.js > renderRoads).
// Doc : docs/architecture/multilevel-pathfinding.md
// =========================

(function() {
  "use strict";

  // Deux nœuds à ≤ 1,5 px = le MÊME nœud : joint les routes qui se touchent ou se croisent quasi exactement.
  const SPATIAL_MERGE_THRESHOLD = 1.5;

  // Jonctions imparfaites (T et extrémité↔extrémité). Plus permissif que les 8 px du DESSIN des cercles
  // d'intersection : les tracés à la main ont 5-10 px de jitter aux jonctions.
  const PROXIMITY_TOLERANCE = 15;

  // ── Géométrie ──────────
  function _dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  // Projection orthogonale clampée aux extrémités → {x, y, t ∈ [0,1], dist}.
  function _projectOnSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) {
      return { x: a.x, y: a.y, t: 0, dist: _dist(p, a) };
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    return { x: px, y: py, t: t, dist: Math.hypot(p.x - px, p.y - py) };
  }

  // Intersection stricte de [p1,p2] et [p3,p4] dans [0,1], sinon null (cohérent avec road.js).
  function _segmentIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-9) return null; // parallèles ou colinéaires

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }

  // ── Zones inaccessibles (contrainte DURE) ──────────
  // Tout segment qui entre ou traverse le bord d'un polygone "inaccessible" n'est PAS ajouté au graphe.
  // Multi-niveau : la zone ne bloque que les segments de SON niveau (multiLevel off → tout au niveau 0).

  // Ray-casting standard, O(n).
  function _pointInPolygon(p, poly) {
    let inside = false;
    const x = p.x, y = p.y;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) &&
                        (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Contact si une extrémité est dedans OU si le segment croise une arête.
  function _segmentTraversePolygon(p1, p2, poly) {
    if (_pointInPolygon(p1, poly)) return true;
    if (_pointInPolygon(p2, poly)) return true;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (_segmentIntersection(p1, p2, a, b)) return true;
    }
    return false;
  }

  // Zones d'un autre niveau ignorées (sauf multiLevel off). Les segments "transit" (milieu de jonction)
  // ne sont jamais bloqués : ce sont des points « en l'air » dans un puits.
  function _segmentBloqueParZoneInaccess(p1, p2, segLevel, zonesInacc) {
    if (segLevel === "transit") return false;
    if (!zonesInacc || zonesInacc.length === 0) return false;
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    for (let i = 0; i < zonesInacc.length; i++) {
      const z = zonesInacc[i];
      if (mlOn && z.level !== segLevel) continue;  // niveau different → pas bloquant
      if (_segmentTraversePolygon(p1, p2, z.points)) return true;
    }
    return false;
  }

  // ── Évitement de points (contrainte SOUPLE) ──────────
  // Le graphe exclut les segments à moins de `avoidRadius` d'un point à éviter. Sans chemin, computeRoute
  // repasse sans évitements et rend les points contournés (« Impossible d'éviter : X, Y »).

  // Distance au SEGMENT (projection clampée), pas à sa droite support.
  function _segmentTraverseProxiPoint(p1, p2, avoidPoint, radius) {
    const proj = _projectOnSegment(avoidPoint, p1, p2);
    return proj.dist < radius;
  }

  // Toujours false si avoidPoints vide ou radius ≤ 0.
  function _segmentBloqueParAvoidance(p1, p2, avoidPoints, radius) {
    if (!avoidPoints || avoidPoints.length === 0 || !radius || radius <= 0) return false;
    for (let i = 0; i < avoidPoints.length; i++) {
      if (_segmentTraverseProxiPoint(p1, p2, avoidPoints[i], radius)) return true;
    }
    return false;
  }

  // Après la passe 2 : les évitements que le chemin final n'a pas pu respecter.
  function _pathPassesNearPoint(pathPts, ap, radius) {
    if (!Array.isArray(pathPts) || pathPts.length < 2 || !radius || radius <= 0) return false;
    for (let i = 1; i < pathPts.length; i++) {
      const proj = _projectOnSegment(ap, pathPts[i - 1], pathPts[i]);
      if (proj.dist < radius) return true;
    }
    return false;
  }

  // Tags → points porteurs (SearchPoints.getAllPoints, async ; retours [{point, …}] → `.point`).
  // SearchPoints absent → [].
  async function _expandAvoidTagsEnPoints(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return [];
    if (typeof window.SearchPoints !== "object" ||
        typeof window.SearchPoints.getAllPoints !== "function") {
      return [];
    }
    let allItems;
    try { allItems = await window.SearchPoints.getAllPoints(); }
    catch(e) { return []; }
    if (!Array.isArray(allItems)) return [];
    return allItems
      .filter(function(it) {
        const p = it && it.point;
        if (!p || !Array.isArray(p.tags)) return false;
        return p.tags.some(function(t) { return tags.indexOf(t) >= 0; });
      })
      .map(function(it) {
        const p = it.point;
        return {
          x:     p.x,
          y:     p.y,
          label: p.nom || p.id || "(tag " + (p.tags[0] || "?") + ")",
          tags:  p.tags
        };
      });
  }

  // Zones inaccessibles du plan : session (getZones) + embarquées (_ktaDataPolygons).
  // → [{ points: [{x,y}], level }].
  function _collecterZonesInaccessibles() {
    const out = [];
    if (typeof window.getZones === "function") {
      const session = window.getZones();
      if (Array.isArray(session)) {
        for (let i = 0; i < session.length; i++) {
          const z = session[i];
          if (z && z.type === "inaccessible" &&
              Array.isArray(z.points) && z.points.length >= 3) {
            out.push({
              points: z.points,
              level:  Number.isInteger(z.level) ? z.level : 0
            });
          }
        }
      }
    }
    if (Array.isArray(window._ktaDataPolygons)) {
      for (let i = 0; i < window._ktaDataPolygons.length; i++) {
        const e = window._ktaDataPolygons[i];
        if (e && e.type === "inaccessible" &&
            Array.isArray(e.points) && e.points.length >= 3) {
          out.push({
            points: e.points,
            level:  Number.isInteger(e.level) ? e.level : 0
          });
        }
      }
    }
    return out;
  }

  // ── Évitement de zones par TYPE (contrainte SOUPLE) ──────────
  // Libellé d'un type : cust-… → entrée de légende via findCustomEntry (getLabel ne lit PAS
  // customEntries) ; built-in → getLabel "zones".
  function _zoneTypeLabel(type) {
    var LC = window.LegendCustomization;
    if (LC && typeof LC.findCustomEntry === "function") {
      try { var e = LC.findCustomEntry(type); if (e && e.label) return e.label; } catch(_e) {}
    }
    if (LC && typeof LC.getLabel === "function") {
      try { var lbl = LC.getLabel("zones", type); if (lbl) return lbl; } catch(_e2) {}
    }
    return type || "?";
  }

  // Types évitables distincts, SAUF "inaccessible" (bloqué d'office) → [{ type, label, count }].
  function _listerTypesZonesEvitables() {
    var counts = {};
    function _compter(z) {
      if (!z || z.type === "inaccessible" || !Array.isArray(z.points) || z.points.length < 3) return;
      counts[z.type] = (counts[z.type] || 0) + 1;
    }
    if (typeof window.getZones === "function") {
      var s = window.getZones();
      if (Array.isArray(s)) s.forEach(_compter);
    }
    if (Array.isArray(window._ktaDataPolygons)) window._ktaDataPolygons.forEach(_compter);
    return Object.keys(counts).map(function(type) {
      return { type: type, label: _zoneTypeLabel(type), count: counts[type] };
    }).sort(function(a, b) { return String(a.label).localeCompare(String(b.label)); });
  }
  window.getAvoidableZoneTypes = _listerTypesZonesEvitables;

  // Même forme que _collecterZonesInaccessibles → même test géométrique niveau-aware.
  function _collecterZonesAEviter(avoidTypes) {
    if (!Array.isArray(avoidTypes) || avoidTypes.length === 0) return [];
    var set = {};
    avoidTypes.forEach(function(t) { set[t] = 1; });
    var out = [];
    function _pousser(z) {
      if (!z || z.type === "inaccessible" || !set[z.type] || !Array.isArray(z.points) || z.points.length < 3) return;
      out.push({ points: z.points, level: Number.isInteger(z.level) ? z.level : 0 });
    }
    if (typeof window.getZones === "function") {
      var s = window.getZones();
      if (Array.isArray(s)) s.forEach(_pousser);
    }
    if (Array.isArray(window._ktaDataPolygons)) window._ktaDataPolygons.forEach(_pousser);
    return out;
  }

  // ── Construction du graphe ──────────
  // Buckets spatiaux : existence d'un nœud proche en O(1).
  function _bucketKey(x, y) {
    const s = SPATIAL_MERGE_THRESHOLD * 2;
    return Math.floor(x / s) + "," + Math.floor(y / s);
  }

  function _newGraph() {
    return {
      nodes:      [],   // [{x, y, virtual?:true}]
      edges:      [],   // edges[i] = [{to: nodeIdx, weight: number}, ...]
      segments:   [],   // [{a: nodeIdx, b: nodeIdx, roadType: string, level: number|"transit"}]
      buckets:    {},   // bucketKey → [nodeIdx, ...]
      // Set<niveau> par nœud : 1 niveau pour un nœud de route, plusieurs pour un nœud fusionné,
      // ["transit"] pour le milieu d'une jonction. Décide des connexions à l'enrichissement.
      nodeLevels: []    // nodeLevels[i] = Set<number|"transit">
    };
  }

  function _ajouterNiveauNode(graph, idx, lvl) {
    while (graph.nodeLevels.length <= idx) graph.nodeLevels.push(new Set());
    graph.nodeLevels[idx].add(lvl);
  }

  // 🩸 `lvl` (multi-niveau) : seul un nœud qui porte DÉJÀ ce niveau numérique est réutilisé. Sans ce filtre, un
  // sommet du 0 posé sur un sommet du −1 (deux galeries qui arrivent au même puits) devenait UN nœud à deux
  // niveaux : l'itinéraire changeait d'étage là, sans jonction, à coût nul. Un point "transit" (milieu de
  // jonction, en l'air dans un puits) ne fusionne avec rien. `lvl` absent ou multi-niveau coupé : fusion libre.
  function _getOrAddNode(graph, x, y, lvl) {
    const filtre = (lvl !== undefined && lvl !== null &&
                    !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true));
    if (filtre && lvl === "transit") return _nouveauNode(graph, x, y);
    // Bucket courant + 8 voisins (point juste au-delà d'une frontière de bucket).
    const ks = _bucketKey(x, y).split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bk = (ks[0] + dx) + "," + (ks[1] + dy);
        const bucket = graph.buckets[bk];
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const idx = bucket[i];
          const n = graph.nodes[idx];
          if (Math.hypot(n.x - x, n.y - y) <= SPATIAL_MERGE_THRESHOLD &&
              (!filtre || (graph.nodeLevels[idx] && graph.nodeLevels[idx].has(lvl)))) {
            return idx;
          }
        }
      }
    }
    return _nouveauNode(graph, x, y);
  }

  function _nouveauNode(graph, x, y) {
    const idx = graph.nodes.length;
    graph.nodes.push({ x: x, y: y });
    graph.edges.push([]);
    const bk = _bucketKey(x, y);
    if (!graph.buckets[bk]) graph.buckets[bk] = [];
    graph.buckets[bk].push(idx);
    return idx;
  }

  function _addEdge(graph, a, b, weight) {
    if (a === b) return;
    graph.edges[a].push({ to: b, weight: weight });
    graph.edges[b].push({ to: a, weight: weight });
  }

  // Trace de diagnostic en mode debug seulement : une jonction dont la longueur change mérite d'être vue.
  const _diagJonction = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);

  // `ctxPoids` = { echelle, profondeurs } du plan du RÉSEAU quand ce n'est pas le plan ouvert
  // (itinéraire inter-plans). 🩸 Une table fournie fait foi, même vide : le repli sur le plan ouvert
  // n'a lieu que SANS table, sinon une étape distante pèserait ses puits avec le mauvais plan.
  function _profondeurPourPoids(niveau, ctxPoids) {
    const table = ctxPoids && ctxPoids.profondeurs;
    if (table && typeof table === "object") {
      const v = table[String(niveau)];
      return (typeof v === "number" && Number.isFinite(v)) ? v : null;
    }
    if (typeof window.getProfondeurNiveau !== "function") return null;
    return window.getProfondeurNiveau(niveau);
  }

  // Poids en pixels plan = distance 2D, SAUF jonction dont les deux niveaux ont une profondeur.
  // `part` (0..1) = part du dénivelé portée par CE segment (prorata de la longueur 2D, cf
  // _partsDenivJonction) : somme des hypoténuses = hypot(longueur 2D totale, dénivelé) — une jonction
  // pèse pareil quel que soit son nombre de points et dans les deux sens.
  function _poidsSegment(a, b, road, ctxPoids, part) {
    const plan = _dist(a, b);
    if (!road || road.type !== "jonction") return plan;
    const zA = _profondeurPourPoids(road.fromLevel, ctxPoids);
    const zB = _profondeurPourPoids(road.toLevel, ctxPoids);
    if (zA === null || zB === null) return plan;   // non renseigné → inchangé
    const echelle = _echelleReseau(ctxPoids && ctxPoids.echelle, 0);
    if (!echelle) return plan;                     // plan non calibré → inchangé
    const p = (typeof part === "number" && Number.isFinite(part)) ? part : 1;
    const denivPx = Math.abs(zB - zA) * echelle * p;
    return Math.hypot(plan, denivPx);
  }

  // Part i = longueur 2D de [points[i], points[i+1]] / longueur totale ; longueur nulle → parts égales.
  function _partsDenivJonction(points) {
    const n = points.length - 1;
    const longueurs = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const l = _dist(points[i], points[i + 1]);
      longueurs.push(l);
      total += l;
    }
    return longueurs.map(function(l) { return total > 0 ? l / total : 1 / n; });
  }

  // `ctxPoids` facultatif (cf _profondeurPourPoids) ; absent = plan ouvert.
  function _buildGraph(roads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones, ctxPoids) {
    zonesInacc  = zonesInacc  || [];
    avoidPoints = avoidPoints || [];
    avoidRadius = avoidRadius || 0;
    avoidZones  = avoidZones  || [];   // zones à éviter (souple), même test géométrique que les inaccessibles
    const graph = _newGraph();

    for (let r = 0; r < roads.length; r++) {
      const road = roads[r];
      if (!road || !Array.isArray(road.points) || road.points.length < 2) continue;
      if (road.type === "itinerary") continue;

      const isJonction = (road.type === "jonction");
      // Jonctions toujours autorisées (ponts entre niveaux) ; les autres suivent allowedTypes.
      if (!isJonction && allowedTypes && allowedTypes.indexOf(road.type) < 0) continue;

      // Route : segments et nœuds au même `level`. Jonction : segments "transit" (exclus de
      // l'enrichissement), mais premier nœud = fromLevel, dernier = toLevel → raccord
      // extrémité↔extrémité avec les routes cibles malgré le jitter.
      const segLevel = isJonction
        ? "transit"
        : (Number.isInteger(road.level) ? road.level : 0);
      const fromLvl = isJonction
        ? (Number.isInteger(road.fromLevel) ? road.fromLevel : 0)
        : null;
      const toLvl = isJonction
        ? (Number.isInteger(road.toLevel) ? road.toLevel : 0)
        : null;
      const lastPointIdxInRoad = road.points.length - 1;
      const partsDeniv = isJonction ? _partsDenivJonction(road.points) : null;

      let prevIdx = _getOrAddNode(graph, road.points[0].x, road.points[0].y, isJonction ? fromLvl : segLevel);
      _ajouterNiveauNode(graph, prevIdx, isJonction ? fromLvl : segLevel);

      for (let i = 1; i < road.points.length; i++) {
        const p = road.points[i];
        const prevP = road.points[i - 1];
        const isLast = (i === lastPointIdxInRoad);
        const nodeLvl = isJonction
          ? (isLast ? toLvl : "transit")
          : segLevel;
        const idx = _getOrAddNode(graph, p.x, p.y, nodeLvl);
        _ajouterNiveauNode(graph, idx, nodeLvl);

        // Segment exclu (nœud sans arête) si une zone inaccessible le traverse (DUR, jamais relâché)
        // ou si un point d'évitement est à moins de `avoidRadius` (SOUPLE, relâché en passe 2).
        if (!_segmentBloqueParZoneInaccess(prevP, p, segLevel, zonesInacc) &&
            !_segmentBloqueParAvoidance(prevP, p, avoidPoints, avoidRadius) &&
            !_segmentBloqueParZoneInaccess(prevP, p, segLevel, avoidZones)) { // zones à éviter (souple)
          // 🩸 UNE JONCTION EST UN PUITS, PAS UN TRAIT : sa longueur dans le plan (3 px pour 12 m de
          // dénivelé) sous-compterait les distances et ferait toujours préférer le puits au détour.
          // Avec profondeurs saisies, le poids est l'hypoténuse, le dénivelé converti en PIXELS par
          // l'échelle (sinon on additionnerait des mètres à des pixels). Sans profondeur : longueur 2D.
          const w = _poidsSegment(prevP, p, road, ctxPoids, partsDeniv ? partsDeniv[i - 1] : 1);
          if (_diagJonction && road.type === "jonction") {
            console.log("[Pathfinder] jonction 3D : plan", _dist(prevP, p).toFixed(1),
              "px → réel", w.toFixed(1), "px");
          }
          _addEdge(graph, prevIdx, idx, w);
          graph.segments.push({
            a:        prevIdx,
            b:        idx,
            roadType: road.type,
            level:    segLevel,  // numeric pour road, "transit" pour jonction
            road:     road       // tracé d'origine (secteurs du Secours → zone « tracés »)
          });
        }
        prevIdx = idx;
      }
    }
    return graph;
  }

  // ── Enrichissement : nœuds virtuels aux croisements ──────────
  // Sans lui, le graphe a une composante par route dont les points ne sont pas EXACTEMENT partagés :
  // Dijkstra ne passe pas d'une route à l'autre même si elles se croisent. On insère un nœud virtuel
  // (a) aux croisements stricts, (b) aux T imparfaits, (c) entre extrémités proches.
  // Compatibilité de niveau (multiLevel off → tout compatible) :
  //   - 2 segments : même niveau NUMÉRIQUE ; un segment "transit" n'est compatible avec rien ;
  //   - 2 nœuds (extrémité↔extrémité) : au moins 1 niveau numérique commun (transit exclu) ;
  //   - nœud vs segment (T) : le nœud porte le niveau du segment.
  function _segmentsCompatibleNiveau(segA, segB, mlOn) {
    if (!mlOn) return true;
    if (segA.level === "transit" || segB.level === "transit") return false;
    return segA.level === segB.level;
  }
  function _nodesCompatibleNiveau(setA, setB, mlOn) {
    if (!mlOn) return true;
    if (!setA || !setB) return false;
    for (const l of setA) {
      if (l === "transit") continue;
      if (setB.has(l)) return true;
    }
    return false;
  }
  function _nodeSurSegmentCompatible(nodeSet, segLevel, mlOn) {
    if (!mlOn) return true;
    if (segLevel === "transit") return false;
    return !!(nodeSet && nodeSet.has(segLevel));
  }

  // Grille spatiale de l'enrichissement : chaque test n'aboutit que pour des objets PROCHES, la grille
  // écarte d'avance les paires lointaines (O(S²) = ~40 s par itinéraire sur un grand relevé).
  // 🩸 RÉSULTAT IDENTIQUE AU BIT PRÈS : les candidats sont TRIÉS par indice croissant, donc les nœuds
  // virtuels naissent dans le même ordre, avec les mêmes indices, qu'en comparaison exhaustive.
  const GRILLE_ENRICH_PX = 64;

  function _cellulesDe(x0, y0, x1, y1, cell, rappel) {
    const cx0 = Math.floor(x0 / cell), cx1 = Math.floor(x1 / cell);
    const cy0 = Math.floor(y0 / cell), cy1 = Math.floor(y1 / cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) rappel(cx + "," + cy);
    }
  }

  // Chaque segment dans toutes les cellules de sa bbox élargie de `marge`.
  function _grilleSegments(graph, segs, marge) {
    const g = new Map();
    for (let i = 0; i < segs.length; i++) {
      const a = graph.nodes[segs[i].a], b = graph.nodes[segs[i].b];
      _cellulesDe(Math.min(a.x, b.x) - marge, Math.min(a.y, b.y) - marge,
                  Math.max(a.x, b.x) + marge, Math.max(a.y, b.y) + marge, GRILLE_ENRICH_PX, function(k) {
        let l = g.get(k);
        if (!l) g.set(k, l = []);
        l.push(i);
      });
    }
    return g;
  }

  // Candidats triés, sans doublon, des cellules couvrant une bbox.
  function _candidatsGrille(g, x0, y0, x1, y1) {
    const vus = new Set();
    _cellulesDe(x0, y0, x1, y1, GRILLE_ENRICH_PX, function(k) {
      const l = g.get(k);
      if (l) for (let n = 0; n < l.length; n++) vus.add(l[n]);
    });
    return Array.from(vus).sort(function(p, q) { return p - q; });
  }

  function _enrichirGrapheAvecCroisements(graph) {
    // Snapshot AVANT enrichissement, sinon boucle infinie sur les segments virtuels ajoutés.
    const segs = graph.segments.slice();
    // Deux index : bbox brute (+1 px) pour les croisements, bbox élargie de la tolérance pour les T.
    const grilleCroise = _grilleSegments(graph, segs, 1);
    const grilleProxi  = _grilleSegments(graph, segs, PROXIMITY_TOLERANCE + 1);
    let nbCroisements = 0;
    let nbProximites  = 0;
    // Lu une fois : boucles chaudes sur les gros plans.
    const _mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    let _nbSkipNiveau = 0;

    // ── 1. Croisements stricts ──
    for (let i = 0; i < segs.length; i++) {
      const segA = segs[i];
      const a1 = graph.nodes[segA.a];
      const a2 = graph.nodes[segA.b];
      const candA = _candidatsGrille(grilleCroise, Math.min(a1.x, a2.x), Math.min(a1.y, a2.y),
                                     Math.max(a1.x, a2.x), Math.max(a1.y, a2.y));

      for (let c = 0; c < candA.length; c++) {
        const j = candA[c];
        if (j <= i) continue;
        const segB = segs[j];
        // Nœud partagé : déjà connectés.
        if (segA.a === segB.a || segA.a === segB.b ||
            segA.b === segB.a || segA.b === segB.b) continue;

        // Niveaux incompatibles : croisement visuel 2D entre étages, ou milieu de jonction.
        if (!_segmentsCompatibleNiveau(segA, segB, _mlOn)) {
          _nbSkipNiveau++;
          continue;
        }

        const b1 = graph.nodes[segB.a];
        const b2 = graph.nodes[segB.b];

        const inter = _segmentIntersection(a1, a2, b1, b2);
        if (!inter) continue;

        // Bucket-merge si un nœud existe déjà (croisements à 3+ routes).
        const newIdx = _getOrAddNode(graph, inter.x, inter.y, segA.level);
        // Le nœud virtuel hérite du niveau commun (nécessaire aux tests nœud↔segment suivants).
        if (_mlOn && segA.level !== "transit") {
          _ajouterNiveauNode(graph, newIdx, segA.level);
        }
        _addEdge(graph, newIdx, segA.a, Math.hypot(a1.x - inter.x, a1.y - inter.y));
        _addEdge(graph, newIdx, segA.b, Math.hypot(a2.x - inter.x, a2.y - inter.y));
        _addEdge(graph, newIdx, segB.a, Math.hypot(b1.x - inter.x, b1.y - inter.y));
        _addEdge(graph, newIdx, segB.b, Math.hypot(b2.x - inter.x, b2.y - inter.y));
        nbCroisements++;
      }
    }

    // ── 2. T par proximité : extrémité projetée à l'INTÉRIEUR d'un autre segment, sous la tolérance ──
    for (let i = 0; i < segs.length; i++) {
      const segA = segs[i];
      const endpoints = [
        { nodeIdx: segA.a, point: graph.nodes[segA.a] },
        { nodeIdx: segA.b, point: graph.nodes[segA.b] }
      ];
      const pa = endpoints[0].point, pb = endpoints[1].point;
      const candB = _candidatsGrille(grilleProxi, Math.min(pa.x, pb.x), Math.min(pa.y, pb.y),
                                     Math.max(pa.x, pb.x), Math.max(pa.y, pb.y));

      for (let c = 0; c < candB.length; c++) {
        const j = candB[c];
        if (j === i) continue;
        const segB = segs[j];

        // Pas de T vers un segment "transit" ; le niveau de chaque extrémité est vérifié plus bas.
        if (_mlOn && segB.level === "transit") {
          _nbSkipNiveau++;
          continue;
        }

        for (const ep of endpoints) {
          if (segB.a === ep.nodeIdx || segB.b === ep.nodeIdx) continue;

          // L'extrémité doit porter le niveau du segment cible (permet aux bouts de jonction
          // fromLevel/toLevel de s'accrocher malgré le jitter).
          if (_mlOn && !_nodeSurSegmentCompatible(graph.nodeLevels[ep.nodeIdx], segB.level, _mlOn)) {
            _nbSkipNiveau++;
            continue;
          }

          const b1 = graph.nodes[segB.a];
          const b2 = graph.nodes[segB.b];
          const proj = _projectOnSegment(ep.point, b1, b2);

          // t ∈ ]0,05 ; 0,95[ : évite le double comptage avec les croisements aux extrémités.
          if (proj.dist < PROXIMITY_TOLERANCE && proj.t > 0.05 && proj.t < 0.95) {
            const projIdx = _getOrAddNode(graph, proj.x, proj.y, segB.level);
            if (_mlOn) _ajouterNiveauNode(graph, projIdx, segB.level);
            _addEdge(graph, ep.nodeIdx, projIdx, proj.dist);
            _addEdge(graph, projIdx, segB.a, Math.hypot(b1.x - proj.x, b1.y - proj.y));
            _addEdge(graph, projIdx, segB.b, Math.hypot(b2.x - proj.x, b2.y - proj.y));
            nbProximites++;
          }
        }
      }
    }

    // ── 3. Extrémité↔extrémité : derniers points décalés de quelques px (jitter), trop loin pour
    // SPATIAL_MERGE_THRESHOLD au build → arête directe pondérée ──
    const endpointSet = new Set();
    for (let i = 0; i < segs.length; i++) {
      endpointSet.add(segs[i].a);
      endpointSet.add(segs[i].b);
    }
    const endpoints = Array.from(endpointSet);
    let nbEndpoints = 0;
    // Pas ≥ tolérance : deux extrémités assez proches sont forcément dans des cellules voisines (3×3).
    const pasExt = Math.max(GRILLE_ENRICH_PX, PROXIMITY_TOLERANCE);
    const grilleExt = new Map();
    for (let i = 0; i < endpoints.length; i++) {
      const p = graph.nodes[endpoints[i]];
      const k = Math.floor(p.x / pasExt) + "," + Math.floor(p.y / pasExt);
      let l = grilleExt.get(k);
      if (!l) grilleExt.set(k, l = []);
      l.push(i);
    }

    for (let i = 0; i < endpoints.length; i++) {
      const idxA = endpoints[i];
      const pA = graph.nodes[idxA];
      const candE = [];
      const gx = Math.floor(pA.x / pasExt), gy = Math.floor(pA.y / pasExt);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const l = grilleExt.get((gx + dx) + "," + (gy + dy));
          if (l) for (let n = 0; n < l.length; n++) if (l[n] > i) candE.push(l[n]);
        }
      }
      candE.sort(function(p, q) { return p - q; });
      for (let c = 0; c < candE.length; c++) {
        const j = candE[c];
        const idxB = endpoints[j];

        // Aucun niveau numérique commun → pas de lien (deux milieux de jonction ne se relient pas).
        if (_mlOn && !_nodesCompatibleNiveau(graph.nodeLevels[idxA], graph.nodeLevels[idxB], _mlOn)) {
          _nbSkipNiveau++;
          continue;
        }

        const pB = graph.nodes[idxB];
        const d = Math.hypot(pB.x - pA.x, pB.y - pA.y);
        // Au-dessus du seuil de fusion (sinon déjà fusionnés au build).
        if (d > SPATIAL_MERGE_THRESHOLD && d < PROXIMITY_TOLERANCE) {
          _addEdge(graph, idxA, idxB, d);
          nbEndpoints++;
        }
      }
    }

    if (_mlOn) {
      console.log("[Pathfinder] Multi-niveau : " + _nbSkipNiveau + " paires skip (niveaux incompatibles)");
    }

    console.log("[Pathfinder] Graphe enrichi —",
      "nœuds:", graph.nodes.length, "/",
      "segments:", segs.length, "/",
      "croisements stricts:", nbCroisements, "/",
      "T-junctions:", nbProximites, "/",
      "endpoint↔endpoint:", nbEndpoints);
  }

  // ── Calage d'un point externe sur le graphe ──────────
  // Projette le point sur le segment le plus proche et y INSÈRE un nœud virtuel (départ/arrivée exacts).
  // 🩸 Le niveau du point compte : le segment le plus proche DE SON NIVEAU est préféré s'il n'est pas à
  // plus de NIVEAU_TOLERANCE_PX au-delà du plus proche tous niveaux confondus (sinon le niveau du point
  // est sans doute faux). Le plus proche en 2D seul accrochait des clics à un autre étage.
  // Point sans niveau : plus proche en 2D.
  const NIVEAU_TOLERANCE_PX = 40;
  function _insertVirtualNode(graph, p) {
    let bestSegIdx = -1;
    let bestProj   = null;
    let bestDist   = Infinity;
    const niv = (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true && p && Number.isInteger(p.level))
                ? p.level : null;
    let nivIdx = -1, nivProj = null, nivDist = Infinity;

    for (let i = 0; i < graph.segments.length; i++) {
      const seg = graph.segments[i];
      const a = graph.nodes[seg.a];
      const b = graph.nodes[seg.b];
      const proj = _projectOnSegment(p, a, b);
      if (proj.dist < bestDist) {
        bestDist   = proj.dist;
        bestProj   = proj;
        bestSegIdx = i;
      }
      if (niv !== null && seg.level === niv && proj.dist < nivDist) {
        nivDist = proj.dist; nivProj = proj; nivIdx = i;
      }
    }
    if (nivIdx >= 0 && nivIdx !== bestSegIdx && nivDist <= bestDist + NIVEAU_TOLERANCE_PX) {
      bestSegIdx = nivIdx; bestProj = nivProj; bestDist = nivDist;
    }

    if (bestSegIdx < 0) return null;

    const seg = graph.segments[bestSegIdx];
    const a   = graph.nodes[seg.a];
    const b   = graph.nodes[seg.b];

    // Projeté sur une extrémité → ce nœud, pas de nœud virtuel.
    const dToA = Math.hypot(a.x - bestProj.x, a.y - bestProj.y);
    if (dToA < SPATIAL_MERGE_THRESHOLD) {
      return { nodeIdx: seg.a, projection: { x: a.x, y: a.y }, snapDist: bestDist };
    }
    const dToB = Math.hypot(b.x - bestProj.x, b.y - bestProj.y);
    if (dToB < SPATIAL_MERGE_THRESHOLD) {
      return { nodeIdx: seg.b, projection: { x: b.x, y: b.y }, snapDist: bestDist };
    }

    // Nœud virtuel + arêtes A↔V et V↔B ; l'arête A↔B d'origine reste (Dijkstra choisit).
    const newIdx = graph.nodes.length;
    graph.nodes.push({ x: bestProj.x, y: bestProj.y, virtual: true });
    graph.edges.push([]);
    // Le nœud virtuel hérite du niveau du segment, sinon Dijkstra partirait sans contrainte de niveau.
    if (graph.nodeLevels) {
      _ajouterNiveauNode(graph, newIdx, seg.level);
    }
    _addEdge(graph, newIdx, seg.a, dToA);
    _addEdge(graph, newIdx, seg.b, dToB);

    // 🩸 Le nœud virtuel doit aussi être relié aux nœuds de croisement posés SUR son segment (sur
    // l'arête d'origine, gardée) — le plus proche de chaque côté. Relié aux seules extrémités, le
    // chemin partait vers l'extrémité puis revenait (aller-retour invisible, « demi-tour » annoncé).
    // Multi-niveau : seulement un nœud du MÊME niveau, sinon deux étages superposés communiqueraient.
    const _mlOnV = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const tV = bestProj.t;
    let avant = null, apres = null;
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    for (let k = 0; k < newIdx && lenSq > 1e-9 && seg.level !== "transit"; k++) {
      if (k === seg.a || k === seg.b) continue;
      if (_mlOnV && !(graph.nodeLevels && graph.nodeLevels[k] && graph.nodeLevels[k].has(seg.level))) continue;
      const n = graph.nodes[k];
      const tk = ((n.x - a.x) * dx + (n.y - a.y) * dy) / lenSq;
      if (tk <= 0 || tk >= 1) continue;
      const px = a.x + tk * dx, py = a.y + tk * dy;
      if (Math.hypot(n.x - px, n.y - py) > SPATIAL_MERGE_THRESHOLD) continue;
      if (tk < tV && (!avant || tk > avant.t)) avant = { idx: k, t: tk };
      if (tk > tV && (!apres || tk < apres.t)) apres = { idx: k, t: tk };
    }
    const lenSeg = Math.sqrt(lenSq);
    if (avant) _addEdge(graph, newIdx, avant.idx, (tV - avant.t) * lenSeg);
    if (apres) _addEdge(graph, newIdx, apres.idx, (apres.t - tV) * lenSeg);

    return {
      nodeIdx:    newIdx,
      projection: { x: bestProj.x, y: bestProj.y },
      snapDist:   bestDist
    };
  }

  // ── Dijkstra ──────────
  // Tas binaire (O(E log V)) : le balayage O(V²) coûtait ~40 s sur un grand relevé.
  // 🩸 Tas ordonné sur (distance, indice) : à égalité de distance, le plus petit indice sort d'abord,
  // comme le balayage — donc mêmes chemins. Entrées périmées ignorées.
  function _tasPousser(tas, d, i) {
    tas.push(d, i);
    let k = (tas.length >> 1) - 1;
    while (k > 0) {
      const p = ((k - 1) >> 1);
      if (tas[2 * p] < tas[2 * k] || (tas[2 * p] === tas[2 * k] && tas[2 * p + 1] <= tas[2 * k + 1])) break;
      const d0 = tas[2 * p], i0 = tas[2 * p + 1];
      tas[2 * p] = tas[2 * k]; tas[2 * p + 1] = tas[2 * k + 1];
      tas[2 * k] = d0; tas[2 * k + 1] = i0;
      k = p;
    }
  }
  function _tasExtraire(tas) {   // → [d, i] du minimum ; tas non vide
    const d = tas[0], i = tas[1];
    const iDernier = tas.pop(), dDernier = tas.pop();   // paires [d, i] à plat : l'indice sort en premier
    const n = tas.length >> 1;
    if (n > 0) {
      tas[0] = dDernier; tas[1] = iDernier;
      let k = 0;
      for (;;) {
        const g = 2 * k + 1, dr = g + 1;
        let m = k;
        if (g < n && (tas[2 * g] < tas[2 * m] || (tas[2 * g] === tas[2 * m] && tas[2 * g + 1] < tas[2 * m + 1]))) m = g;
        if (dr < n && (tas[2 * dr] < tas[2 * m] || (tas[2 * dr] === tas[2 * m] && tas[2 * dr + 1] < tas[2 * m + 1]))) m = dr;
        if (m === k) break;
        const d0 = tas[2 * m], i0 = tas[2 * m + 1];
        tas[2 * m] = tas[2 * k]; tas[2 * m + 1] = tas[2 * k + 1];
        tas[2 * k] = d0; tas[2 * k + 1] = i0;
        k = m;
      }
    }
    return [d, i];
  }

  function _dijkstra(graph, start, end) {
    const N    = graph.nodes.length;
    const dist = new Array(N).fill(Infinity);
    const prev = new Array(N).fill(-1);
    const fait = new Uint8Array(N);
    dist[start] = 0;
    const tas = [];
    _tasPousser(tas, 0, start);

    while (tas.length) {
      const e = _tasExtraire(tas);
      const u = e[1];
      if (fait[u] || e[0] !== dist[u]) continue;   // entrée périmée
      if (u === end) break;
      fait[u] = 1;

      const neigh = graph.edges[u];
      for (let i = 0; i < neigh.length; i++) {
        const v = neigh[i].to;
        if (fait[v]) continue;
        const alt = dist[u] + neigh[i].weight;
        if (alt < dist[v]) {
          dist[v] = alt;
          prev[v] = u;
          _tasPousser(tas, alt, v);
        }
      }
    }

    if (dist[end] === Infinity) return null;

    const pathIdx = [];
    let u = end;
    while (u >= 0) {
      pathIdx.unshift(u);
      u = prev[u];
    }
    return { nodeIndices: pathIdx, totalDistance: dist[end] };
  }

  // ── Calcul interne, une passe ──────────
  // build + enrichissement + calage + Dijkstra ; computeRoute l'appelle en passe 1 puis 2 si besoin.
  // `echelle` (px/m) et `profondeurs` ({ "<niveau>": m|null }) facultatifs : ceux du plan du RÉSEAU
  // quand ce n'est pas le plan ouvert (sinon APP_CONFIG.scale / getProfondeurNiveau). Ils servent aux
  // carrefours ET au poids des jonctions.
  function _computeRouteInterne(waypoints, allRoads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones,
                                echelle, profondeurs) {
    const graph = _buildGraph(allRoads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones,
                              { echelle: echelle, profondeurs: profondeurs });
    if (graph.nodes.length === 0) {
      // i18n : code + params, localisé au rendu (interfaceItineraire.js).
      const e = new Error("Aucune route correspondant aux types sélectionnés (" + allowedTypes.join(", ") + ")");
      e.code = "NO_ROUTE_TYPES";
      e.i18nKey = "iti.err.aucuneRouteTypes";
      e.i18nParams = { types: allowedTypes.join(", ") };
      throw e;
    }
    _enrichirGrapheAvecCroisements(graph);

    const snapResults = [];
    for (let i = 0; i < waypoints.length; i++) {
      const snap = _insertVirtualNode(graph, waypoints[i]);
      if (!snap) {
        const e = new Error("Impossible de snap le waypoint #" + (i + 1) + " sur le réseau");
        e.code = "SNAP_FAILED";
        e.i18nKey = "iti.err.snapImpossible";
        e.i18nParams = { n: (i + 1) };
        throw e;
      }
      snapResults.push(snap);
    }

    const fullPath    = [];
    let totalDistance = 0;
    let segmentCount  = 0;

    for (let i = 0; i < snapResults.length - 1; i++) {
      const a = snapResults[i].nodeIdx;
      const b = snapResults[i + 1].nodeIdx;
      const result = _dijkstra(graph, a, b);
      if (!result) {
        const e = new Error(
          "Aucun chemin trouvé entre le waypoint #" + (i + 1) + " et le waypoint #" + (i + 2) +
          " (le réseau est probablement déconnecté entre ces 2 points)"
        );
        e.code = "NO_PATH";
        e.i18nKey = "iti.err.pasDeChemin";
        e.i18nParams = { a: (i + 1), b: (i + 2) };
        throw e;
      }
      // 🩸 LE NIVEAU VOYAGE AVEC LE CHEMIN (nécessaire au profil en long). `levels` peut avoir plusieurs
      // entrées (nœud fusionné) ou « transit » (milieu de jonction, ENTRE deux étages) : on ne rend un
      // niveau qu'univoque, sinon null (« indéterminé ») et le profil interpole.
      const segPoints = result.nodeIndices.map(function(idx) {
        const n = graph.nodes[idx];
        // 🩸 Les niveaux vivent dans le tableau parallèle `graph.nodeLevels[idx]`, PAS sur le nœud :
        // `n.levels` vaut toujours undefined → null partout, sans erreur, profil plat.
        const set = graph.nodeLevels && graph.nodeLevels[idx];
        let lvl = null;
        if (set && typeof set.forEach === "function") {
          const nums = [];
          set.forEach(function (v) { if (Number.isInteger(v)) nums.push(v); });
          if (nums.length === 1) lvl = nums[0];
        }
        return { x: n.x, y: n.y, level: lvl };
      });
      if (i > 0) segPoints.shift();
      for (let k = 0; k < segPoints.length; k++) fullPath.push(segPoints[k]);
      totalDistance += result.totalDistance;
      segmentCount  += result.nodeIndices.length - 1;
    }

    return {
      path:           fullPath,
      totalDistance:  totalDistance,
      segmentCount:   segmentCount,
      snappedPoints:  snapResults.map(function(s) { return s.projection; }),
      // Champs du guidage (`path`/`totalDistance` restent le trajet SUR tracé) :
      //   • raccords : trajet à vol d'oiseau entre chaque waypoint et son tracé (dessiné ET compté) ;
      //   • carrefours : nœuds SUR le chemin d'où partent ≥ 3 directions, cherchés géométriquement —
      //     l'arête d'origine restant dans le graphe, un chemin tout droit peut éviter le nœud de croisement.
      raccords: snapResults.map(function(s, i) {
        const w = waypoints[i];
        return {
          index:  i,
          role:   (i === 0) ? "depart" : (i === snapResults.length - 1 ? "arrivee" : "etape"),
          label:  (w && w.label) ? String(w.label) : null,
          de:     { x: w.x, y: w.y },
          vers:   { x: s.projection.x, y: s.projection.y },
          distPx: s.snapDist
        };
      }),
      carrefours: _carrefoursSurChemin(graph, fullPath, echelle)
    };
  }

  // ── Carrefours le long d'un chemin (guidage) ──────────
  // [{x, y, sorties:[cap°]}] par nœud posé sur le chemin (≤ CARREFOUR_TOL_PX) d'où partent au moins 3
  // directions DISTINCTES. Cap : 0 = haut du plan, sens horaire (convention de tracking.js).
  // 🩸 Compter les voisins d'un nœud ment (arêtes doublées, extrémités proches reliées, tremblement) :
  // on regarde la GÉOMÉTRIE — chaque traversée d'un cercle de ~3 m autour du nœud est une sortie, les
  // directions proches (SORTIE_ECART_DEG) se regroupent. Une amorce < 3 m (défaut de dessin) ne compte pas.
  const CARREFOUR_TOL_PX  = 3;
  const SORTIE_ECART_DEG  = 25;
  const GRILLE_CHEMIN_PX  = 24;

  // Rayon de sortie : ~3 m, jamais moins de 8 px.
  // Échelle (px/m) : celle de l'appelant (réseau d'un AUTRE plan), sinon le plan ouvert, sinon `repli`
  // (0 = pas calibré).
  function _echelleReseau(echelle, repli) {
    if (Number(echelle) > 0) return Number(echelle);
    return (window.APP_CONFIG && Number(window.APP_CONFIG.scale) > 0) ? Number(window.APP_CONFIG.scale) : repli;
  }

  function _rayonSortiePx(echelle) {
    return Math.max(8, 3 * _echelleReseau(echelle, 0));
  }

  function _capDeg(a, b) {
    const d = Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI;
    return (d + 360) % 360;
  }

  function _voisinsUniques(graph, idx) {
    const vus = {};
    const out = [];
    const neigh = graph.edges[idx] || [];
    for (let i = 0; i < neigh.length; i++) {
      const v = neigh[i].to;
      if (v === idx || vus[v]) continue;
      vus[v] = 1;
      out.push(v);
    }
    return out;
  }

  function _grilleAretes(graph, cell) {
    const g = {};
    for (let i = 0; i < graph.edges.length; i++) {
      const vus = {};
      const neigh = graph.edges[i] || [];
      for (let k = 0; k < neigh.length; k++) {
        const j = neigh[k].to;
        if (j <= i || vus[j]) continue;
        vus[j] = 1;
        const a = graph.nodes[i], b = graph.nodes[j];
        const x0 = Math.floor(Math.min(a.x, b.x) / cell), x1 = Math.floor(Math.max(a.x, b.x) / cell);
        const y0 = Math.floor(Math.min(a.y, b.y) / cell), y1 = Math.floor(Math.max(a.y, b.y) / cell);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) continue;   // arête aberrante : ignorée
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const key = cx + "," + cy;
            (g[key] || (g[key] = [])).push(i, j);
          }
        }
      }
    }
    return g;
  }

  // `c` : centre du cercle — un nœud, ou le centre d'une ZONE de carrefour.
  function _capsDeSortie(graph, c, grille, cell, R) {
    const caps = [];
    const vus = {};
    const cx0 = Math.floor((c.x - R) / cell), cx1 = Math.floor((c.x + R) / cell);
    const cy0 = Math.floor((c.y - R) / cell), cy1 = Math.floor((c.y + R) / cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const lst = grille[cx + "," + cy];
        if (!lst) continue;
        for (let k = 0; k < lst.length; k += 2) {
          const i = lst[k], j = lst[k + 1];
          const key = i + "," + j;
          if (vus[key]) continue;
          vus[key] = 1;
          const a = graph.nodes[i], b = graph.nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const fx = a.x - c.x, fy = a.y - c.y;
          const A = dx * dx + dy * dy;
          if (A < 1e-9) continue;
          const B = 2 * (fx * dx + fy * dy);
          const C = fx * fx + fy * fy - R * R;
          const disc = B * B - 4 * A * C;
          if (disc < 0) continue;
          const r = Math.sqrt(disc);
          [(-B - r) / (2 * A), (-B + r) / (2 * A)].forEach(function(t) {
            if (t >= 0 && t <= 1) caps.push(_capDeg(c, { x: a.x + t * dx, y: a.y + t * dy }));
          });
        }
      }
    }
    // Regroupement circulaire (le dernier groupe peut rejoindre le premier via 0°), moyenne VECTORIELLE
    // (359° et 1° font 0°, pas 180°).
    caps.sort(function(a, b) { return a - b; });
    const groupes = [];
    caps.forEach(function(c) {
      const g = groupes[groupes.length - 1];
      if (g && c - g[g.length - 1] <= SORTIE_ECART_DEG) g.push(c);
      else groupes.push([c]);
    });
    if (groupes.length > 1 &&
        groupes[0][0] + 360 - groupes[groupes.length - 1].slice(-1)[0] <= SORTIE_ECART_DEG) {
      groupes[0] = groupes.pop().concat(groupes[0]);
    }
    return groupes.map(function(g) {
      let sx = 0, sy = 0;
      g.forEach(function(c) { sx += Math.sin(c * Math.PI / 180); sy += Math.cos(c * Math.PI / 180); });
      return Math.round((Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360);
    });
  }

  function _carrefoursSurChemin(graph, path, echelle) {
    if (!graph || !Array.isArray(path) || path.length < 2) return [];
    const grille = {};
    function _cle(cx, cy) { return cx + "," + cy; }
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const x0 = Math.floor((Math.min(a.x, b.x) - CARREFOUR_TOL_PX) / GRILLE_CHEMIN_PX);
      const x1 = Math.floor((Math.max(a.x, b.x) + CARREFOUR_TOL_PX) / GRILLE_CHEMIN_PX);
      const y0 = Math.floor((Math.min(a.y, b.y) - CARREFOUR_TOL_PX) / GRILLE_CHEMIN_PX);
      const y1 = Math.floor((Math.max(a.y, b.y) + CARREFOUR_TOL_PX) / GRILLE_CHEMIN_PX);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = _cle(cx, cy);
          (grille[k] || (grille[k] = [])).push(i);
        }
      }
    }
    const R = _rayonSortiePx(echelle);
    const cellA = Math.max(16, 2 * R);
    let grilleA = null;   // grille des arêtes : construite au premier candidat seulement
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + _dist(path[i - 1], path[i]));
    const out = [];
    for (let idx = 0; idx < graph.nodes.length; idx++) {
      const n = graph.nodes[idx];
      const segs = grille[_cle(Math.floor(n.x / GRILLE_CHEMIN_PX), Math.floor(n.y / GRILLE_CHEMIN_PX))];
      if (!segs) continue;
      if (_voisinsUniques(graph, idx).length < 3) continue;
      let sN = null;
      for (let k = 0; k < segs.length; k++) {
        const i = segs[k];
        const pr = _projectOnSegment(n, path[i - 1], path[i]);
        if (pr.dist <= CARREFOUR_TOL_PX && (sN === null || cum[i - 1] + pr.t * (cum[i] - cum[i - 1]) < sN)) {
          sN = cum[i - 1] + pr.t * (cum[i] - cum[i - 1]);
        }
      }
      if (sN === null) continue;
      if (!grilleA) grilleA = _grilleAretes(graph, cellA);
      const sorties = _capsDeSortie(graph, n, grilleA, cellA, R);
      if (sorties.length >= 3) out.push({ x: n.x, y: n.y, sorties: sorties, _s: sN });
    }
    _zonesDeCarrefour(graph, out, grilleA, cellA, R, echelle);
    out.forEach(function(c) { delete c._s; });
    return out;
  }

  // Grands carrefours : une ZONE de croisements proches (les galeries n'arrivent pas au même point du
  // dessin). Des croisements consécutifs sur le trajet à ≤ ZONE_ECART_M forment une zone ; ses sorties se
  // mesurent sur un cercle qui l'englobe (rayon de zone + rayon de sortie). Chaque membre reçoit la
  // MÊME `zone` : { x, y, r, sorties }. 5 m (décision produit : 20 m regroupait trop).
  const ZONE_ECART_M = 5;   // (décision produit, cf plus haut)
  function _zonesDeCarrefour(graph, carrefours, grilleA, cellA, R, echelle) {
    if (carrefours.length < 2 || !grilleA) return;
    const e = _echelleReseau(echelle, 1);
    const ecart = ZONE_ECART_M * e;
    const tries = carrefours.slice().sort(function(a, b) { return a._s - b._s; });
    const groupes = [];
    tries.forEach(function(c) {
      const g = groupes[groupes.length - 1];
      if (g && c._s - g[g.length - 1]._s <= ecart) g.push(c);
      else groupes.push([c]);
    });
    groupes.forEach(function(g) {
      if (g.length < 2) return;
      let cx = 0, cy = 0;
      g.forEach(function(c) { cx += c.x; cy += c.y; });
      const centre = { x: cx / g.length, y: cy / g.length };
      let r = 0;
      g.forEach(function(c) { r = Math.max(r, _dist(centre, c)); });
      const zone = {
        x: centre.x, y: centre.y, r: r,
        sorties: _capsDeSortie(graph, centre, grilleA, cellA, r + R)
      };
      g.forEach(function(c) { c.zone = zone; });
    });
  }

  // ── computeRoute (2 passes) ──────────
  // opts : allowedTypes (défaut principal/secondaire/chemin) · avoidPoints [{x, y, label?}] · avoidTags
  //   (développés en points via SearchPoints) · avoidRadius px (défaut 100) · avoidZones (types) ·
  //   respecterInaccessibles (false = SUSPEND la seule contrainte dure ; absent = respecter).
  // Passe 1 : zones inaccessibles (dur) + évitements (souple). Échec avec évitements → passe 2 sans eux ;
  // si elle aboutit : `usedFallback: true` + `avoidedThrough` (points traversés) pour l'UI. Échec de la
  // passe 2 → vraie absence de chemin, l'erreur remonte.
  // ⚠️ ASYNC (SearchPoints.getAllPoints) : `await Pathfinder.computeRoute(…)`.
  async function computeRoute(waypoints, opts) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      throw new Error("Au moins 2 waypoints sont requis");
    }
    opts = opts || {};
    const allowedTypes = opts.allowedTypes || ["principal", "secondaire", "chemin"];

    // ⚠️ getAllEmbeddedRoads (visibles ET masquées), pas getEmbeddedRoads : masquer le calque des routes
    // (souvent déjà dessinées sur le PNG) ne doit pas casser le pathfinder.
    const sessionRoads = (typeof window.getRoads === "function") ? window.getRoads() : [];
    let embeddedRoads;
    if (typeof window.getAllEmbeddedRoads === "function") {
      embeddedRoads = window.getAllEmbeddedRoads();
    } else if (typeof window.getEmbeddedRoads === "function") {
      embeddedRoads = window.getEmbeddedRoads();
    } else {
      embeddedRoads = [];
    }
    const allRoads = sessionRoads.concat(embeddedRoads);

    console.log("[Pathfinder] Roads en entrée —",
      "session:", sessionRoads.length, "/",
      "embedded (toutes):", embeddedRoads.length, "/",
      "total:", allRoads.length,
      "| types autorisés:", allowedTypes.join(","));

    if (allRoads.length === 0) {
      const e = new Error("Aucune route disponible pour calculer un itinéraire");
      e.code = "NO_ROUTE";
      e.i18nKey = "iti.err.aucuneRoute";
      throw e;
    }

    // Zones inaccessibles : SEULE contrainte dure, jamais relâchée même en passe 2 — un polygone typé
    // « inaccessible » par erreur ferme un passage sans recours, d'où la case de la modale (cochée par
    // défaut : la suspendre est un geste explicite).
    // ⚠️ Limité à computeRoute : computeReachable (Secours / Perdu) les garde toujours — une préférence
    // de confort n'élargit pas un périmètre de secours.
    const zonesInacc = (opts.respecterInaccessibles === false)
      ? [] : _collecterZonesInaccessibles();
    if (opts.respecterInaccessibles === false) {
      console.log("[Pathfinder] zones inaccessibles IGNORÉES (choix utilisateur)");
    }
    if (zonesInacc.length > 0) {
      console.log("[Pathfinder] " + zonesInacc.length + " zone(s) inaccessible(s) — contrainte dure");
    }

    // Évitements souples : points explicites + avoidTags développés.
    const explicitAvoid    = Array.isArray(opts.avoidPoints) ? opts.avoidPoints.slice() : [];
    const avoidTags        = Array.isArray(opts.avoidTags)   ? opts.avoidTags.slice()   : [];
    const expandedFromTags = await _expandAvoidTagsEnPoints(avoidTags);
    const allAvoidPts      = explicitAvoid.concat(expandedFromTags);
    const avoidRadius      = (Number.isFinite(opts.avoidRadius) && opts.avoidRadius > 0)
                              ? opts.avoidRadius : 100;
    const avoidZones       = _collecterZonesAEviter(Array.isArray(opts.avoidZones) ? opts.avoidZones : []);
    if (avoidZones.length > 0) {
      console.log("[Pathfinder] " + avoidZones.length + " zone(s) a eviter — contrainte souple");
    }
    const hasAvoidances    = (allAvoidPts.length > 0) || (avoidZones.length > 0);
    if (allAvoidPts.length > 0) {
      console.log("[Pathfinder] " + allAvoidPts.length +
                  " point(s) a eviter (rayon " + avoidRadius + "px) — contrainte souple, fallback possible");
    }

    let result          = null;
    let usedFallback    = false;
    let avoidedThrough  = [];

    try {
      result = _computeRouteInterne(
        waypoints, allRoads, allowedTypes,
        zonesInacc, allAvoidPts, avoidRadius, avoidZones
      );
    } catch(e1) {
      // Sans évitements, c'est une vraie absence de chemin → on relance.
      if (!hasAvoidances) throw e1;

      console.log("[Pathfinder] Passe 1 echec — tentative passe 2 sans evitements (fallback)");
      try {
        result = _computeRouteInterne(
          waypoints, allRoads, allowedTypes,
          zonesInacc, [], 0, []
        );
        usedFallback = true;
        // Points évités que le chemin final traverse quand même (« Impossible d'éviter : X, Y »).
        avoidedThrough = allAvoidPts.filter(function(ap) {
          return _pathPassesNearPoint(result.path, ap, avoidRadius);
        });
        console.log("[Pathfinder] Passe 2 ok — " + avoidedThrough.length +
                    " evitement(s) traverse(s) malgre la preference");
      } catch(e2) {
        throw e2;
      }
    }

    return Object.assign({}, result, {
      usedFallback:    usedFallback,
      avoidedThrough:  avoidedThrough,
      avoidRadius:     avoidRadius
    });
  }

  // ── computeRouteOnRoads : itinéraire inter-plans ──────────
  // Dijkstra sur des ROADS FOURNIES (plan NON chargé, lues par InterPlanLinks.collectRoutingDataForPlan).
  // SYNCHRONE : pas d'avoidTags — l'appelant résout ses évitements, les données distantes ne sont pas
  // dans les globales.
  // opts : allowedTypes · zones [{type, points, level?}] (les "inaccessible" = contrainte DURE) ·
  //   avoidPoints · avoidZonesResolved (zones objets, souple) · avoidRadius (px, 100) ·
  //   echelle (px/m de CE réseau : carrefours 3 m / 5 m et dénivelé) ·
  //   profondeurs ({ "<niveau>": m|null } de CE réseau ; fournie, même {}, fait foi ; absente = plan ouvert).
  // Retour : même forme que computeRoute (+ usedFallback / avoidedThrough).
  function computeRouteOnRoads(waypoints, roads, opts) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      throw new Error("Au moins 2 waypoints sont requis");
    }
    opts = opts || {};
    const allowedTypes = opts.allowedTypes || ["principal", "secondaire", "chemin"];
    if (!Array.isArray(roads) || roads.length === 0) {
      const e = new Error("Aucune route disponible pour calculer un itinéraire");
      e.code = "NO_ROUTE";
      e.i18nKey = "iti.err.aucuneRoute";
      throw e;
    }
    const zonesInacc = (Array.isArray(opts.zones) ? opts.zones : []).filter(function(z) {
      return z && z.type === "inaccessible" && Array.isArray(z.points) && z.points.length >= 3;
    }).map(function(z) {
      return { points: z.points, level: Number.isInteger(z.level) ? z.level : 0 };
    });
    const avoidPts    = Array.isArray(opts.avoidPoints) ? opts.avoidPoints : [];
    const avoidRadius = (Number.isFinite(opts.avoidRadius) && opts.avoidRadius > 0) ? opts.avoidRadius : 100;
    const avoidZones  = Array.isArray(opts.avoidZonesResolved) ? opts.avoidZonesResolved : [];
    const hasAvoid    = avoidPts.length > 0 || avoidZones.length > 0;

    let result = null, usedFallback = false, avoidedThrough = [];
    try {
      result = _computeRouteInterne(waypoints, roads, allowedTypes,
                                    zonesInacc, avoidPts, avoidRadius, avoidZones, opts.echelle, opts.profondeurs);
    } catch(e1) {
      if (!hasAvoid) throw e1;
      result = _computeRouteInterne(waypoints, roads, allowedTypes,
                                    zonesInacc, [], 0, [], opts.echelle, opts.profondeurs);
      usedFallback = true;
      avoidedThrough = avoidPts.filter(function(ap) {
        return _pathPassesNearPoint(result.path, ap, avoidRadius);
      });
    }
    return Object.assign({}, result, {
      usedFallback:   usedFallback,
      avoidedThrough: avoidedThrough,
      avoidRadius:    avoidRadius
    });
  }

  // Point par id ou nom (insensible à la casse) : points éditeur, puis cache de searchPoints.js.
  function resolvePointById(idOrName) {
    if (!idOrName) return null;
    const target = String(idOrName).trim().toLowerCase();
    if (!target) return null;

    const editorPoints = (typeof window.getEditorPoints === "function") ? window.getEditorPoints() : [];
    for (let i = 0; i < editorPoints.length; i++) {
      const p = editorPoints[i];
      if (!p) continue;
      if ((p.id   && String(p.id).trim().toLowerCase()   === target) ||
          (p.nom  && String(p.nom).trim().toLowerCase()  === target)) {
        return { x: p.x, y: p.y, source: "editor", point: p };
      }
    }

    if (window.PLAN_CONFIG && Array.isArray(window.PLAN_CONFIG.dataLayers)) {
      // Lecture synchrone du cache seulement : sinon l'appelant passe par des coordonnées (clic).
    }

    return null;
  }

  // ── computeReachable : isochrone du Mode Perdu ──────────
  // Segments atteignables depuis un point dans un budget de distance (vitesse × temps), pour que
  // lostMode.js restreigne la zone de recherche au réseau réel plutôt qu'à un cercle.
  // Dijkstra « budget » depuis le nœud de calage → fullSegments (2 extrémités dans le budget) et
  // partialSegments (tronqués par interpolation au point où le budget s'épuise).
  // Les jonctions sont traversables : le calcul s'étend aux autres niveaux.
  // Départ loin de tout tracé : exceedsBudget=true + snapPoint/snapDistance, listes vides (LostMode trace
  // alors pointillé + cercle seul). `opts` : réservé, inutilisé.
  function computeReachable(startPoint, budgetPx, opts) {
    if (!startPoint || typeof startPoint.x !== "number" || typeof startPoint.y !== "number") {
      throw new Error("computeReachable : startPoint = {x, y} requis");
    }
    if (!isFinite(budgetPx) || budgetPx <= 0) {
      throw new Error("computeReachable : budgetPx > 0 requis (= rayon en pixels)");
    }

    // Même collecte que computeRoute (visibles ET masquées) : tout le réseau est couvert.
    const sessionRoads = (typeof window.getRoads === "function" ? window.getRoads() : []) || [];
    const embeddedRoads = (typeof window.getAllEmbeddedRoads === "function"
      ? window.getAllEmbeddedRoads() : []) || [];
    const allRoads = sessionRoads.concat(embeddedRoads);

    if (allRoads.length === 0) {
      return {
        fullSegments: [], partialSegments: [],
        snapPoint: null, snapDistance: Infinity,
        exceedsBudget: true, reason: "no-roads",
        totalReachableDistance: 0
      };
    }

    const allowedTypes = ["principal", "secondaire", "chemin"];
    const zonesInacc = _collecterZonesInaccessibles();

    // Sans évitements (propres à l'itinéraire).
    const graph = _buildGraph(allRoads, allowedTypes, zonesInacc, [], 0);
    _enrichirGrapheAvecCroisements(graph);

    if (graph.nodes.length === 0) {
      return {
        fullSegments: [], partialSegments: [],
        snapPoint: null, snapDistance: Infinity,
        exceedsBudget: true, reason: "empty-graph",
        totalReachableDistance: 0
      };
    }

    const snap = _insertVirtualNode(graph, startPoint);
    if (!snap) {
      return {
        fullSegments: [], partialSegments: [],
        snapPoint: null, snapDistance: Infinity,
        exceedsBudget: true, reason: "no-snap",
        totalReachableDistance: 0
      };
    }

    // Calage déjà hors budget → aucune route atteignable.
    if (snap.snapDist >= budgetPx) {
      return {
        fullSegments: [], partialSegments: [],
        snapPoint: snap.projection,
        snapDistance: snap.snapDist,
        exceedsBudget: true, reason: "snap-too-far",
        totalReachableDistance: 0
      };
    }

    const remainingBudget = budgetPx - snap.snapDist;

    const distances = _dijkstraReachable(graph, snap.nodeIdx, remainingBudget);

    const fullSegments = [];
    const partialSegments = [];
    let totalDist = 0;

    for (let i = 0; i < graph.segments.length; i++) {
      const seg = graph.segments[i];
      const dA = distances[seg.a];
      const dB = distances[seg.b];

      if (dA === Infinity && dB === Infinity) continue;

      const pA = graph.nodes[seg.a];
      const pB = graph.nodes[seg.b];
      const segLen = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      if (segLen < 0.01) continue;  // segment dégénéré

      const inA = dA <= remainingBudget;
      const inB = dB <= remainingBudget;

      if (inA && inB) {
        fullSegments.push([{ x: pA.x, y: pA.y }, { x: pB.x, y: pB.y }]);
        totalDist += segLen;
      } else if (inA) {
        // A atteint, B hors budget → tronqué de A vers B.
        const rem = remainingBudget - dA;
        const ratio = Math.min(1, rem / segLen);
        if (ratio > 0.001) {
          const cut = {
            x: pA.x + (pB.x - pA.x) * ratio,
            y: pA.y + (pB.y - pA.y) * ratio
          };
          partialSegments.push([{ x: pA.x, y: pA.y }, cut]);
          totalDist += segLen * ratio;
        }
      } else if (inB) {
        // B atteint, A hors budget → tronqué de B vers A.
        const rem = remainingBudget - dB;
        const ratio = Math.min(1, rem / segLen);
        if (ratio > 0.001) {
          const cut = {
            x: pB.x + (pA.x - pB.x) * ratio,
            y: pB.y + (pA.y - pB.y) * ratio
          };
          partialSegments.push([{ x: pB.x, y: pB.y }, cut]);
          totalDist += segLen * ratio;
        }
      }
    }

    return {
      fullSegments:           fullSegments,
      partialSegments:        partialSegments,
      snapPoint:              snap.projection,
      snapDistance:           snap.snapDist,
      exceedsBudget:          false,
      totalReachableDistance: totalDist
    };
  }

  // dist[] par nodeIdx (Infinity si non atteint).
  function _dijkstraReachable(graph, start, budget) {
    const N = graph.nodes.length;
    const dist = new Array(N).fill(Infinity);
    const fait = new Uint8Array(N);
    dist[start] = 0;
    // Même tas (distance, indice) que `_dijkstra` : mêmes distances.
    const tas = [];
    _tasPousser(tas, 0, start);

    while (tas.length) {
      const e = _tasExtraire(tas);
      const u = e[1], minD = e[0];
      if (fait[u] || minD !== dist[u]) continue;   // entrée périmée
      // Extraction croissante : le minimum dépasse le budget → tous les suivants aussi.
      if (minD > budget) break;
      fait[u] = 1;

      const neigh = graph.edges[u];
      for (let i = 0; i < neigh.length; i++) {
        const v = neigh[i].to;
        if (fait[v]) continue;
        const alt = dist[u] + neigh[i].weight;
        // dist[v] gardé même > budget : les segments partiels doivent savoir que B a été « vu ».
        if (alt < dist[v]) {
          dist[v] = alt;
          _tasPousser(tas, alt, v);
        }
      }
    }

    return dist;
  }

  // ── Graphe réseau réutilisable (navigation intelligente) ──────────
  // Même moteur (_buildGraph + enrichissement) pour le map-matching ; cache et invalidation dans
  // js/roadGraph.js. computeRoute / computeReachable gardent leur build par requête.

  // Session + embarquées, comme computeRoute.
  function _collecterToutesLesRoads() {
    const sessionRoads = (typeof window.getRoads === "function" ? window.getRoads() : []) || [];
    let embeddedRoads;
    if (typeof window.getAllEmbeddedRoads === "function") {
      embeddedRoads = window.getAllEmbeddedRoads();
    } else if (typeof window.getEmbeddedRoads === "function") {
      embeddedRoads = window.getEmbeddedRoads();
    } else {
      embeddedRoads = [];
    }
    return sessionRoads.concat(embeddedRoads || []);
  }

  // Graphe complet SANS évitements. Zones inaccessibles exclues par défaut : la nav dit où l'utilisateur
  // EST, une zone ne change pas la géométrie (opts.includeZones = true pour les respecter).
  function buildNetworkGraph(opts) {
    opts = opts || {};
    const allowedTypes = opts.allowedTypes || ["principal", "secondaire", "chemin"];
    const allRoads = _collecterToutesLesRoads();
    if (allRoads.length === 0) return _newGraph();
    const zonesInacc = opts.includeZones ? _collecterZonesInaccessibles() : [];
    const graph = _buildGraph(allRoads, allowedTypes, zonesInacc, [], 0);
    _enrichirGrapheAvecCroisements(graph);
    return graph;
  }

  // Calage LECTURE SEULE (ne mute pas le graphe, contrairement à _insertVirtualNode).
  // → { segIdx, seg, projection:{x,y}, t, dist } | null.
  function snapPointToGraph(graph, p) {
    if (!graph || !Array.isArray(graph.segments) || graph.segments.length === 0) return null;
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") return null;
    let best = null;
    for (let i = 0; i < graph.segments.length; i++) {
      const seg = graph.segments[i];
      const a = graph.nodes[seg.a];
      const b = graph.nodes[seg.b];
      const proj = _projectOnSegment(p, a, b);
      if (!best || proj.dist < best.dist) {
        best = { segIdx: i, seg: seg, projection: { x: proj.x, y: proj.y }, t: proj.t, dist: proj.dist };
      }
    }
    return best;
  }

  // Le plan a-t-il un tracé exploitable ? Pour AVERTIR au lancement plutôt qu'échouer sur un message
  // technique. L'itinéraire lui-même ne compte pas (c'est un calcul, pas un tracé).
  function aDesTraces() {
    const s = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    const e = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || [])
      : (typeof window.getEmbeddedRoads === "function") ? (window.getEmbeddedRoads() || []) : [];
    return s.concat(e).some(function(r) {
      return r && r.type !== "itinerary" && Array.isArray(r.points) && r.points.length >= 2;
    });
  }

  // ── Export ──────────
  window.Pathfinder = {
    aDesTraces:        aDesTraces,
    computeRoute:      computeRoute,
    computeRouteOnRoads: computeRouteOnRoads,   // roads fournies (plan non chargé)
    computeReachable:  computeReachable,
    resolvePointById:  resolvePointById,
    buildNetworkGraph: buildNetworkGraph,
    snapPointToGraph:  snapPointToGraph,
    // Carrefours d'un chemin calculé ailleurs (parcours de balayage) : mêmes règles, même guidage.
    carrefoursSurChemin: function(graph, path, echelle) { return _carrefoursSurChemin(graph, path, echelle); }
  };
})();
