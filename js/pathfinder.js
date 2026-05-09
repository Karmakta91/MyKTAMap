// =========================
// PATHFINDER — itinéraire sur le réseau de routes du plan
// =========================
// Calcule un trajet en suivant les polylines existantes (session via getRoads()
// + embarquées via getEmbeddedRoads()). Algorithme : Dijkstra sur un graphe
// dynamique construit à la volée, avec snap orthogonal des waypoints sur le
// segment le plus proche du réseau.
//
// API : window.Pathfinder
//   - computeRoute(waypoints, opts) → { path, totalDistance, segmentCount, snappedPoints }
//     waypoints : [{x, y}, ...] (≥ 2 points)
//     opts.allowedTypes : ['principal', 'secondaire', 'chemin'] par défaut
//   - resolvePointById(idOrName) → {x, y, source, point} | null
//
// Coordonnées en système image (x, y plan) — la conversion Leaflet se fait
// au rendu (cf. road.js > renderRoads et le type "itinerary").
// =========================

(function() {
  "use strict";

  // Tolérance de fusion spatiale : 2 nœuds à <= 1.5 px sont considérés comme
  // le MÊME nœud → permet de joindre les routes qui se touchent par les
  // extrémités OU se croisent quasi exactement (T-junctions, croisements).
  const SPATIAL_MERGE_THRESHOLD = 1.5;

  // Tolérance pour les T-junctions imparfaites : si une extrémité d'un
  // segment est à ≤ 8 px de l'intérieur d'un autre segment, on les
  // considère connectés (cohérent avec road.js > _calculerIntersectionsRoads).
  const PROXIMITY_TOLERANCE = 8;

  // =========================
  // HELPERS GÉOMÉTRIQUES
  // =========================
  function _dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  // Projection orthogonale du point p sur le segment [a, b], clampé aux extrémités.
  // Retourne {x, y, t, dist} : x/y = projeté, t ∈ [0,1] = paramètre, dist = à p.
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

  // Intersection stricte de 2 segments (paramétrique). Retourne {x, y} si
  // les segments [p1,p2] et [p3,p4] se coupent dans leur intervalle [0,1],
  // sinon null. Cohérent avec road.js > _segmentIntersection.
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

  // =========================
  // CONSTRUCTION DU GRAPHE
  // =========================
  // Spatial bucketing : O(1) pour vérifier si un nœud existe déjà près d'une position.
  function _bucketKey(x, y) {
    const s = SPATIAL_MERGE_THRESHOLD * 2;
    return Math.floor(x / s) + "," + Math.floor(y / s);
  }

  function _newGraph() {
    return {
      nodes:    [],   // [{x, y, virtual?:true}]
      edges:    [],   // edges[i] = [{to: nodeIdx, weight: number}, ...]
      segments: [],   // [{a: nodeIdx, b: nodeIdx, roadType: string}]
      buckets:  {}    // bucketKey → [nodeIdx, ...]
    };
  }

  function _getOrAddNode(graph, x, y) {
    // Recherche dans le bucket courant + 8 voisins (pour gérer le cas où un
    // point est juste au-delà d'une frontière de bucket)
    const ks = _bucketKey(x, y).split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bk = (ks[0] + dx) + "," + (ks[1] + dy);
        const bucket = graph.buckets[bk];
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const idx = bucket[i];
          const n = graph.nodes[idx];
          if (Math.hypot(n.x - x, n.y - y) <= SPATIAL_MERGE_THRESHOLD) {
            return idx;
          }
        }
      }
    }
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
    // Symétrique (graphe non-orienté)
    graph.edges[a].push({ to: b, weight: weight });
    graph.edges[b].push({ to: a, weight: weight });
  }

  function _buildGraph(roads, allowedTypes) {
    const graph = _newGraph();
    for (let r = 0; r < roads.length; r++) {
      const road = roads[r];
      if (!road || !Array.isArray(road.points) || road.points.length < 2) continue;
      // Skip si le type n'est pas autorisé. Skip aussi le type "itinerary"
      // (anciens itinéraires calculés ne doivent pas alimenter le graphe).
      if (road.type === "itinerary") continue;
      if (allowedTypes && allowedTypes.indexOf(road.type) < 0) continue;

      let prevIdx = _getOrAddNode(graph, road.points[0].x, road.points[0].y);
      for (let i = 1; i < road.points.length; i++) {
        const p = road.points[i];
        const idx = _getOrAddNode(graph, p.x, p.y);
        const w = _dist(road.points[i - 1], p);
        _addEdge(graph, prevIdx, idx, w);
        graph.segments.push({ a: prevIdx, b: idx, roadType: road.type });
        prevIdx = idx;
      }
    }
    return graph;
  }

  // =========================
  // ENRICHISSEMENT DU GRAPHE — NŒUDS VIRTUELS AUX CROISEMENTS
  // =========================
  // Sans cette étape, le graphe est composé de N composantes déconnectées
  // (une par road dont les points ne sont pas EXACTEMENT partagés avec une
  // autre road). Conséquence : Dijkstra échoue à passer d'un type à l'autre
  // même quand les roads se croisent visuellement.
  // Solution : pour chaque paire de segments (a) qui se croisent strictement,
  // ou (b) dont une extrémité d'un segment est à ≤ 8 px de l'intérieur d'un
  // autre segment (T-junction imparfaite), on insère un nœud virtuel et on
  // crée des arêtes qui relient les 2 roads.
  function _enrichirGrapheAvecCroisements(graph) {
    // Snapshot des segments AVANT l'enrichissement (sinon boucle infinie sur
    // les segments virtuels qu'on ajoute).
    const segs = graph.segments.slice();
    let nbCroisements = 0;
    let nbProximites  = 0;

    // ===== 1. Croisements stricts (segment-segment) =====
    for (let i = 0; i < segs.length; i++) {
      const segA = segs[i];
      const a1 = graph.nodes[segA.a];
      const a2 = graph.nodes[segA.b];

      for (let j = i + 1; j < segs.length; j++) {
        const segB = segs[j];
        // Skip si les segments partagent un nœud (déjà connectés)
        if (segA.a === segB.a || segA.a === segB.b ||
            segA.b === segB.a || segA.b === segB.b) continue;

        const b1 = graph.nodes[segB.a];
        const b2 = graph.nodes[segB.b];

        const inter = _segmentIntersection(a1, a2, b1, b2);
        if (!inter) continue;

        // Insère un nœud virtuel à l'intersection (spatial-bucket-merge si
        // déjà existant à cet endroit, ce qui gère les croisements à 3+ roads).
        const newIdx = _getOrAddNode(graph, inter.x, inter.y);
        // Connecte aux 4 extrémités des 2 segments
        _addEdge(graph, newIdx, segA.a, Math.hypot(a1.x - inter.x, a1.y - inter.y));
        _addEdge(graph, newIdx, segA.b, Math.hypot(a2.x - inter.x, a2.y - inter.y));
        _addEdge(graph, newIdx, segB.a, Math.hypot(b1.x - inter.x, b1.y - inter.y));
        _addEdge(graph, newIdx, segB.b, Math.hypot(b2.x - inter.x, b2.y - inter.y));
        nbCroisements++;
      }
    }

    // ===== 2. T-junctions par proximité (extrémités proches d'un autre segment) =====
    // Pour chaque endpoint de chaque segment, projeter sur les autres segments
    // et vérifier la distance. Si < tolérance ET projection à l'intérieur du
    // segment cible (pas à un endpoint), on crée un nœud virtuel.
    for (let i = 0; i < segs.length; i++) {
      const segA = segs[i];
      const endpoints = [
        { nodeIdx: segA.a, point: graph.nodes[segA.a] },
        { nodeIdx: segA.b, point: graph.nodes[segA.b] }
      ];

      for (let j = 0; j < segs.length; j++) {
        if (j === i) continue;
        const segB = segs[j];

        for (const ep of endpoints) {
          // Skip si l'endpoint est déjà sur ce segment B
          if (segB.a === ep.nodeIdx || segB.b === ep.nodeIdx) continue;

          const b1 = graph.nodes[segB.a];
          const b2 = graph.nodes[segB.b];
          const proj = _projectOnSegment(ep.point, b1, b2);

          // Tolérance courte ET projection clairement à l'intérieur
          // (t entre 0.05 et 0.95 — évite double-comptage avec les croisements
          // déjà gérés ci-dessus aux extrémités)
          if (proj.dist < PROXIMITY_TOLERANCE && proj.t > 0.05 && proj.t < 0.95) {
            const projIdx = _getOrAddNode(graph, proj.x, proj.y);
            // Lie l'endpoint vers la projection (distance courte = pénalité minime)
            _addEdge(graph, ep.nodeIdx, projIdx, proj.dist);
            // Lie la projection aux 2 extrémités du segment B
            _addEdge(graph, projIdx, segB.a, Math.hypot(b1.x - proj.x, b1.y - proj.y));
            _addEdge(graph, projIdx, segB.b, Math.hypot(b2.x - proj.x, b2.y - proj.y));
            nbProximites++;
          }
        }
      }
    }

    console.log("[Pathfinder] Graphe enrichi —", nbCroisements, "croisements,", nbProximites, "T-junctions par proximité");
  }

  // =========================
  // SNAP D'UN POINT EXTERNE SUR LE GRAPHE
  // =========================
  // Trouve le segment le plus proche, projette le point dessus, INSÈRE un
  // nœud virtuel à la projection (split du segment original) pour que
  // Dijkstra puisse partir/arriver exactement à ce point.
  function _insertVirtualNode(graph, p) {
    let bestSegIdx = -1;
    let bestProj   = null;
    let bestDist   = Infinity;

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
    }

    if (bestSegIdx < 0) return null;

    const seg = graph.segments[bestSegIdx];
    const a   = graph.nodes[seg.a];
    const b   = graph.nodes[seg.b];

    // Si le projeté coïncide avec une extrémité, on retourne directement ce nœud
    // (pas besoin d'insérer un node virtuel — pénible et inutile).
    const dToA = Math.hypot(a.x - bestProj.x, a.y - bestProj.y);
    if (dToA < SPATIAL_MERGE_THRESHOLD) {
      return { nodeIdx: seg.a, projection: { x: a.x, y: a.y }, snapDist: bestDist };
    }
    const dToB = Math.hypot(b.x - bestProj.x, b.y - bestProj.y);
    if (dToB < SPATIAL_MERGE_THRESHOLD) {
      return { nodeIdx: seg.b, projection: { x: b.x, y: b.y }, snapDist: bestDist };
    }

    // Sinon, insère un nouveau nœud virtuel et 2 nouvelles arêtes A↔V et V↔B.
    // L'arête A↔B originale n'est PAS supprimée (Dijkstra trouvera le
    // meilleur chemin de toute façon ; supprimer compliquerait la gestion).
    const newIdx = graph.nodes.length;
    graph.nodes.push({ x: bestProj.x, y: bestProj.y, virtual: true });
    graph.edges.push([]);
    _addEdge(graph, newIdx, seg.a, dToA);
    _addEdge(graph, newIdx, seg.b, dToB);

    return {
      nodeIdx:    newIdx,
      projection: { x: bestProj.x, y: bestProj.y },
      snapDist:   bestDist
    };
  }

  // =========================
  // DIJKSTRA
  // =========================
  // Implémentation simple à priorité-queue tableau (O(V²) mais OK pour
  // graphes typiques < 10k nœuds, ce qui est largement suffisant pour
  // un plan terrain).
  function _dijkstra(graph, start, end) {
    const N    = graph.nodes.length;
    const dist = new Array(N).fill(Infinity);
    const prev = new Array(N).fill(-1);
    dist[start] = 0;

    // Set des nœuds non encore traités
    const remaining = new Set();
    for (let i = 0; i < N; i++) remaining.add(i);

    while (remaining.size > 0) {
      // Extraire le nœud avec la plus petite distance
      let u = -1;
      let minD = Infinity;
      remaining.forEach(function(i) {
        if (dist[i] < minD) { minD = dist[i]; u = i; }
      });
      if (u < 0 || u === end) break;
      if (minD === Infinity) break;  // graphe disconnecté
      remaining.delete(u);

      // Relaxer les voisins
      const neigh = graph.edges[u];
      for (let i = 0; i < neigh.length; i++) {
        const v = neigh[i].to;
        if (!remaining.has(v)) continue;
        const alt = dist[u] + neigh[i].weight;
        if (alt < dist[v]) {
          dist[v] = alt;
          prev[v] = u;
        }
      }
    }

    if (dist[end] === Infinity) return null;

    // Reconstruction du chemin (indices de nœuds)
    const pathIdx = [];
    let u = end;
    while (u >= 0) {
      pathIdx.unshift(u);
      u = prev[u];
    }
    return { nodeIndices: pathIdx, totalDistance: dist[end] };
  }

  // =========================
  // API PUBLIQUE
  // =========================
  function computeRoute(waypoints, opts) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      throw new Error("Au moins 2 waypoints sont requis");
    }
    opts = opts || {};
    const allowedTypes = opts.allowedTypes || ["principal", "secondaire", "chemin"];

    // 1. Collecte des roads disponibles
    const sessionRoads  = (typeof window.getRoads        === "function") ? window.getRoads()        : [];
    const embeddedRoads = (typeof window.getEmbeddedRoads === "function") ? window.getEmbeddedRoads() : [];
    const allRoads      = sessionRoads.concat(embeddedRoads);

    if (allRoads.length === 0) {
      throw new Error("Aucune route disponible pour calculer un itinéraire");
    }

    // 2. Construction du graphe
    const graph = _buildGraph(allRoads, allowedTypes);
    if (graph.nodes.length === 0) {
      throw new Error("Aucune route correspondant aux types sélectionnés (" + allowedTypes.join(", ") + ")");
    }

    // 2bis. Enrichissement avec les croisements & T-junctions — sans ça,
    // les roads qui se croisent visuellement mais n'ont pas de point exact
    // commun restent dans des composantes graphe disjointes (cas typique
    // des roads hand-tracés).
    _enrichirGrapheAvecCroisements(graph);

    // 3. Snap de chaque waypoint sur le réseau (insertion de nœuds virtuels)
    const snapResults = [];
    for (let i = 0; i < waypoints.length; i++) {
      const snap = _insertVirtualNode(graph, waypoints[i]);
      if (!snap) {
        throw new Error("Impossible de snap le waypoint #" + (i + 1) + " sur le réseau");
      }
      snapResults.push(snap);
    }

    // 4. Dijkstra entre paires consécutives, concaténation des chemins
    const fullPath     = [];
    let totalDistance  = 0;
    let segmentCount   = 0;

    for (let i = 0; i < snapResults.length - 1; i++) {
      const a = snapResults[i].nodeIdx;
      const b = snapResults[i + 1].nodeIdx;
      const result = _dijkstra(graph, a, b);
      if (!result) {
        throw new Error(
          "Aucun chemin trouvé entre le waypoint #" + (i + 1) + " et le waypoint #" + (i + 2) +
          " (le réseau est probablement déconnecté entre ces 2 points)"
        );
      }
      const segPoints = result.nodeIndices.map(function(idx) {
        return { x: graph.nodes[idx].x, y: graph.nodes[idx].y };
      });
      // Évite de dupliquer le point de jonction (sauf pour le premier segment)
      if (i > 0) segPoints.shift();
      for (let k = 0; k < segPoints.length; k++) fullPath.push(segPoints[k]);
      totalDistance += result.totalDistance;
      segmentCount  += result.nodeIndices.length - 1;
    }

    return {
      path:           fullPath,
      totalDistance:  totalDistance,    // en unités plan (px image)
      segmentCount:   segmentCount,
      snappedPoints:  snapResults.map(function(s) { return s.projection; })
    };
  }

  // Recherche un point existant par id ou par nom (case-insensitive).
  // Cherche d'abord dans les editor points, puis dans le cache de recherche
  // si dispo (rempli par searchPoints.js au boot).
  function resolvePointById(idOrName) {
    if (!idOrName) return null;
    const target = String(idOrName).trim().toLowerCase();
    if (!target) return null;

    // 1. Editor points (session)
    const editorPoints = (typeof window.getEditorPoints === "function") ? window.getEditorPoints() : [];
    for (let i = 0; i < editorPoints.length; i++) {
      const p = editorPoints[i];
      if (!p) continue;
      if ((p.id   && String(p.id).trim().toLowerCase()   === target) ||
          (p.nom  && String(p.nom).trim().toLowerCase()  === target)) {
        return { x: p.x, y: p.y, source: "editor", point: p };
      }
    }

    // 2. Points des data layers (via cache searchPoints si exposé, sinon fetch direct)
    if (window.PLAN_CONFIG && Array.isArray(window.PLAN_CONFIG.dataLayers)) {
      // Best effort : lecture synchrone du cache si dispo. Sinon, l'appelant
      // devra utiliser un waypoint par coordonnées (clic) plutôt que par ID.
      // (Une recherche async dans tous les calques serait plus complète mais
      // nécessite une API séparée — Phase 2 si besoin.)
    }

    return null;
  }

  // =========================
  // EXPORT
  // =========================
  window.Pathfinder = {
    computeRoute:     computeRoute,
    resolvePointById: resolvePointById
  };
})();
