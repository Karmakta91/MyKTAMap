/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// PATHFINDER — itinéraire sur le réseau de routes du plan
// =========================
// Calcule un trajet en suivant les polylines existantes (session via getRoads()
// + embarquées via getAllEmbeddedRoads()). Algorithme : Dijkstra sur un graphe
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

  // Tolérance pour les jonctions imparfaites (T-junction par projection
  // ET endpoint↔endpoint). 15 px est plus permissif que les 8 px utilisés
  // pour le DESSIN des cercles d'intersection — pour le pathfinding, on
  // veut max de connexions logiques même si elles ne se voient pas (les
  // roads hand-tracés ont souvent 5-10 px de jitter aux jonctions).
  const PROXIMITY_TOLERANCE = 15;

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
  // ZONES INACCESSIBLES — geometrie polygone
  // =========================
  // 🚫 v169 (Karma_dev) : une zone de type "inaccessible" bloque le pathfinder.
  // Tout segment de route qui passe a l'interieur ou traverse le bord d'un
  // polygone inaccessible n'est PAS ajoute au graphe (= contrainte dure).
  // Multi-niveau : la zone bloque uniquement les segments du MEME niveau
  // (sauf si multiLevel = false, auquel cas tout est "level 0" implicite).

  // Ray-casting standard : retourne true si le point (p.x, p.y) est dans
  // le polygone defini par l'array `poly` ({x, y}). Algo classique en O(n).
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

  // Test : le segment [p1, p2] entre-t-il en contact avec le polygone `poly` ?
  //   - Si l'un des 2 endpoints est dans le polygone → oui
  //   - Si le segment croise l'une des aretes du polygone → oui
  // (Si les 2 endpoints sont a l'exterieur ET le segment ne croise aucune arete,
  //  alors le segment est entierement hors polygone → non bloque.)
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

  // Helper : le segment doit-il etre exclu du graphe a cause d'une zone
  // inaccessible ? Filtre niveau-aware : on ignore les zones d'un niveau
  // different du segment (sauf si multiLevel = false → comparaison plate).
  // Les segments "transit" (middle de jonction) sont jamais bloques car
  // physiquement ce sont des points "en l'air" dans un escalier vertical.
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

  // =========================
  // EVITEMENTS DE POINTS (preferences souples) — depuis v169 (Karma_dev)
  // =========================
  // Contrainte SOUPLE : si possible, le pathfinder evite les segments qui
  // passent a moins de `avoidRadius` d'un point a eviter. Si aucun chemin
  // n'est trouve avec ces contraintes, on bascule en fallback (passe 2)
  // qui calcule sans les evitements et renvoie la liste des points
  // contournes pour affichage utilisateur ("Impossible d'eviter : X, Y").

  // Vrai si la distance du point `avoidPoint` au segment [p1, p2] < radius.
  // Utilise la projection orthogonale clampee aux extremites (= distance min
  // d'un point a un segment, pas a sa droite support).
  function _segmentTraverseProxiPoint(p1, p2, avoidPoint, radius) {
    const proj = _projectOnSegment(avoidPoint, p1, p2);
    return proj.dist < radius;
  }

  // Vrai si le segment doit etre exclu du graphe a cause d'au moins un point
  // d'evitement. Si avoidPoints vide ou radius<=0 → toujours false.
  function _segmentBloqueParAvoidance(p1, p2, avoidPoints, radius) {
    if (!avoidPoints || avoidPoints.length === 0 || !radius || radius <= 0) return false;
    for (let i = 0; i < avoidPoints.length; i++) {
      if (_segmentTraverseProxiPoint(p1, p2, avoidPoints[i], radius)) return true;
    }
    return false;
  }

  // Vrai si le path final passe a moins de `radius` du point `ap` au moins
  // une fois. Utilise apres la passe 2 (fallback) pour detecter les
  // evitements n'ont pas pu etre respectes.
  function _pathPassesNearPoint(pathPts, ap, radius) {
    if (!Array.isArray(pathPts) || pathPts.length < 2 || !radius || radius <= 0) return false;
    for (let i = 1; i < pathPts.length; i++) {
      const proj = _projectOnSegment(ap, pathPts[i - 1], pathPts[i]);
      if (proj.dist < radius) return true;
    }
    return false;
  }

  // Expand les tags a eviter en liste de points. Pour chaque tag, on
  // recupere tous les points du plan portant ce tag (via SearchPoints qui
  // expose getAllPoints() ASYNC). La structure SearchPoints retourne
  // [{point, source, layerId}, ...] — on lit `.point.{x,y,nom,id,tags}`.
  // Si SearchPoints absent → array vide (degraded gracieusement).
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

  // Collecte toutes les zones inaccessibles actives sur le plan courant :
  //   - Zones de session (via window.getZones())
  //   - Zones embarquees dans les data layers (via window._ktaDataPolygons)
  // Retourne [{ points: [{x,y}, ...], level: number }, ...].
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

  // 🆕 v1.48.0 — ÉVITEMENT DE ZONES NOMMÉES (contrainte SOUPLE)
  // Label user-facing d'un TYPE de zone (comme les autres filtres) :
  //  - type custom (cust-…) → label de l'entrée legend ("galerie basse") via
  //    findCustomEntry (getLabel ne consulte PAS customEntries) ;
  //  - type built-in → getLabel "zones" ("Eau", "Effondrement"…).
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

  // Liste des TYPES de zones ÉVITABLES (distincts, SAUF "inaccessible" déjà
  // bloquée d'office). Session (getZones) + embarquées (_ktaDataPolygons).
  // 1 entrée PAR TYPE (comme les filtres) : [{ type, label, count }, ...].
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

  // Polygones de TOUTES les zones dont le type est coché (évitement souple).
  // Même forme que _collecterZonesInaccessibles → réutilise le test géométrique
  // niveau-aware (une zone ne bloque que les segments de son niveau).
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
      nodes:      [],   // [{x, y, virtual?:true}]
      edges:      [],   // edges[i] = [{to: nodeIdx, weight: number}, ...]
      segments:   [],   // [{a: nodeIdx, b: nodeIdx, roadType: string, level: number|"transit"}]
      buckets:    {},   // bucketKey → [nodeIdx, ...]
      // 🏗️ Multi-niveau (v148) : Set<level> par nœud.
      // Pour les nodes normaux road : 1 élément (le niveau de la road).
      // Pour les nodes spatial-mergés (ex: jonction first sur road) : multiple éléments.
      // Pour jonction middle : ["transit"] (pas de niveau réel).
      // Utilisé par l'enrichissement pour décider si on peut connecter 2 nodes
      // (endpoint-endpoint) ou un endpoint à un segment (T-junction).
      nodeLevels: []    // nodeLevels[i] = Set<number|"transit">
    };
  }

  // Helper : ajoute un niveau a la Set du node (cree la Set si absente).
  function _ajouterNiveauNode(graph, idx, lvl) {
    while (graph.nodeLevels.length <= idx) graph.nodeLevels.push(new Set());
    graph.nodeLevels[idx].add(lvl);
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

  function _buildGraph(roads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones) {
    zonesInacc  = zonesInacc  || [];
    avoidPoints = avoidPoints || [];
    avoidRadius = avoidRadius || 0;
    avoidZones  = avoidZones  || [];   // 🆕 v1.48.0 : zones à éviter (souple), même test géométrique que les inaccessibles
    const graph = _newGraph();

    for (let r = 0; r < roads.length; r++) {
      const road = roads[r];
      if (!road || !Array.isArray(road.points) || road.points.length < 2) continue;
      if (road.type === "itinerary") continue;

      const isJonction = (road.type === "jonction");
      // Jonctions toujours autorisees (ce sont les bridges interniveau).
      // Pour les roads normales, on respecte allowedTypes.
      if (!isJonction && allowedTypes && allowedTypes.indexOf(road.type) < 0) continue;

      // 🏗️ Multi-niveau (v148) : niveau des segments + des nodes.
      //   Road normale : tous les segments + tous les nodes ont le meme `level`.
      //   Jonction     : tous les segments sont "transit" (interdits a l'enrichissement
      //                  intersection/T-junction). MAIS le first node porte fromLevel
      //                  et le last node porte toLevel → permet endpoint-endpoint
      //                  avec les roads cibles meme s'il y a un peu de jitter.
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

      let prevIdx = _getOrAddNode(graph, road.points[0].x, road.points[0].y);
      // Niveau du first node : fromLvl pour jonction, segLevel pour road normale.
      _ajouterNiveauNode(graph, prevIdx, isJonction ? fromLvl : segLevel);

      for (let i = 1; i < road.points.length; i++) {
        const p = road.points[i];
        const prevP = road.points[i - 1];
        const idx = _getOrAddNode(graph, p.x, p.y);
        const isLast = (i === lastPointIdxInRoad);
        // Pour jonction : middle = "transit", last = toLvl. Pour road normale : segLevel.
        const nodeLvl = isJonction
          ? (isLast ? toLvl : "transit")
          : segLevel;
        _ajouterNiveauNode(graph, idx, nodeLvl);

        // 🚫 v169 (Karma_dev) : 2 raisons possibles d'exclure un segment du graphe :
        //   - Zone inaccessible le traverse (contrainte DURE, jamais relachee)
        //   - Point d'evitement a moins de `avoidRadius` du segment (contrainte
        //     SOUPLE, relachee par computeRoute si passe 1 fail → passe 2 sans
        //     avoidances, message "Impossible d'eviter : X" affiche au user)
        // Quand exclu, le node existe quand meme mais sans edge → impossible
        // d'emprunter ce troncon dans Dijkstra.
        if (!_segmentBloqueParZoneInaccess(prevP, p, segLevel, zonesInacc) &&
            !_segmentBloqueParAvoidance(prevP, p, avoidPoints, avoidRadius) &&
            !_segmentBloqueParZoneInaccess(prevP, p, segLevel, avoidZones)) { // 🆕 zones à éviter (souple)
          const w = _dist(prevP, p);
          _addEdge(graph, prevIdx, idx, w);
          graph.segments.push({
            a:        prevIdx,
            b:        idx,
            roadType: road.type,
            level:    segLevel   // numeric pour road, "transit" pour jonction
          });
        }
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
  // 🏗️ Multi-niveau (v148) : helpers de compatibilite niveau.
  // Si feature OFF (multiLevel = false) → tout est compatible (v147 strict).
  // Si ON →
  //   - 2 segments compatibles ssi tous deux ont le meme niveau NUMERIQUE.
  //     Les segments "transit" (jonction middle) ne sont JAMAIS compatibles
  //     avec quoi que ce soit (les middle nodes d'une jonction ne croisent
  //     rien — ce sont des points en l'air dans un escalier vertical).
  //   - 2 nodes compatibles (pour endpoint-endpoint) ssi ils partagent au
  //     moins 1 niveau numerique (transit exclu de la comparaison).
  //   - Endpoint vs segment (T-junction) : le node doit contenir le niveau
  //     numerique du segment.
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

  function _enrichirGrapheAvecCroisements(graph) {
    // Snapshot des segments AVANT l'enrichissement (sinon boucle infinie sur
    // les segments virtuels qu'on ajoute).
    const segs = graph.segments.slice();
    let nbCroisements = 0;
    let nbProximites  = 0;
    // 🏗️ Multi-niveau : flag lu une fois pour eviter de relire APP_CONFIG
    // a chaque iteration des boucles enrichissement (chaud sur gros plans).
    const _mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    let _nbSkipNiveau = 0;

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

        // 🏗️ Multi-niveau : skip si niveaux incompatibles. Cela couvre :
        //   - Croisement visuel 2D d'une road niveau 0 et road niveau 1
        //     (ne se touchent pas physiquement → pas d'intersection valide)
        //   - Tout pair impliquant une jonction transit (les middle segments
        //     d'une jonction ne croisent rien — bridge vertical)
        if (!_segmentsCompatibleNiveau(segA, segB, _mlOn)) {
          _nbSkipNiveau++;
          continue;
        }

        const b1 = graph.nodes[segB.a];
        const b2 = graph.nodes[segB.b];

        const inter = _segmentIntersection(a1, a2, b1, b2);
        if (!inter) continue;

        // Insère un nœud virtuel à l'intersection (spatial-bucket-merge si
        // déjà existant à cet endroit, ce qui gère les croisements à 3+ roads).
        const newIdx = _getOrAddNode(graph, inter.x, inter.y);
        // Le node virtuel herite du niveau commun des 2 segments (forcement
        // egal sinon on aurait skip plus haut). Important pour les futurs
        // checks node-vs-segment (T-junction propagation).
        if (_mlOn && segA.level !== "transit") {
          _ajouterNiveauNode(graph, newIdx, segA.level);
        }
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

        // 🏗️ Multi-niveau : on saute si segB est transit (jonction middle —
        // pas de T-junction VERS un segment de jonction interne, c'est en l'air).
        // Pour le check niveau du node endpoint ↔ segment cible, on utilise
        // _nodeSurSegmentCompatible plus bas (par endpoint).
        if (_mlOn && segB.level === "transit") {
          _nbSkipNiveau++;
          continue;
        }

        for (const ep of endpoints) {
          // Skip si l'endpoint est déjà sur ce segment B
          if (segB.a === ep.nodeIdx || segB.b === ep.nodeIdx) continue;

          // 🏗️ Multi-niveau : skip si le node endpoint ne porte pas le niveau
          // du segment cible (ex: endpoint level-0 vs segment level-1). Permet
          // les jonction endpoints (first portant fromLevel, last portant toLevel)
          // de faire un T-junction avec leur road cible meme avec du jitter.
          if (_mlOn && !_nodeSurSegmentCompatible(graph.nodeLevels[ep.nodeIdx], segB.level, _mlOn)) {
            _nbSkipNiveau++;
            continue;
          }

          const b1 = graph.nodes[segB.a];
          const b2 = graph.nodes[segB.b];
          const proj = _projectOnSegment(ep.point, b1, b2);

          // Tolérance courte ET projection clairement à l'intérieur
          // (t entre 0.05 et 0.95 — évite double-comptage avec les croisements
          // déjà gérés ci-dessus aux extrémités)
          if (proj.dist < PROXIMITY_TOLERANCE && proj.t > 0.05 && proj.t < 0.95) {
            const projIdx = _getOrAddNode(graph, proj.x, proj.y);
            if (_mlOn) _ajouterNiveauNode(graph, projIdx, segB.level);
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

    // ===== 3. Endpoint-endpoint proximity =====
    // Cas typique : 2 roads se rejoignent visuellement à un endroit, mais leur
    // dernier point respectif est décalé de quelques pixels (jitter hand-trace).
    // SPATIAL_MERGE_THRESHOLD (1.5 px) est trop strict pour les fusionner au
    // build du graphe ; on les relie ici par une arête directe pondérée.
    const endpointSet = new Set();
    for (let i = 0; i < segs.length; i++) {
      endpointSet.add(segs[i].a);
      endpointSet.add(segs[i].b);
    }
    const endpoints = Array.from(endpointSet);
    let nbEndpoints = 0;

    for (let i = 0; i < endpoints.length; i++) {
      const idxA = endpoints[i];
      const pA = graph.nodes[idxA];
      for (let j = i + 1; j < endpoints.length; j++) {
        const idxB = endpoints[j];

        // 🏗️ Multi-niveau : skip si les niveaux des 2 nodes n'ont aucun
        // niveau numerique en commun (transit ne compte pas car deux
        // jonction-middle ne se connectent pas par proximite — ce sont
        // des points en l'air dans des escaliers différents).
        if (_mlOn && !_nodesCompatibleNiveau(graph.nodeLevels[idxA], graph.nodeLevels[idxB], _mlOn)) {
          _nbSkipNiveau++;
          continue;
        }

        const pB = graph.nodes[idxB];
        const d = Math.hypot(pB.x - pA.x, pB.y - pA.y);
        // Inférieur à la tolérance ET supérieur au seuil de fusion (sinon
        // déjà mergés au build) → 2 endpoints distincts mais proches.
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
    // 🏗️ Multi-niveau (v148) : le node virtuel herite du niveau du segment
    // snapped (numeric pour road, "transit" pour jonction). Sans ca, Dijkstra
    // partirait d'un node sans niveau → traverserait tout le graphe sans
    // contrainte. Avec, le node est sur le bon niveau et les contraintes des
    // edges (deja niveau-aware via l'enrichissement) le maintiennent.
    if (graph.nodeLevels) {
      _ajouterNiveauNode(graph, newIdx, seg.level);
    }
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
  // CALCUL INTERNE — 1 passe (avec contraintes donnees)
  // =========================
  // Factorise la logique build+enrich+snap+Dijkstra. Appele par computeRoute
  // pour la passe 1 (avec contraintes) puis si necessaire pour la passe 2
  // (sans avoidances). Throw avec messages clairs si echec.
  function _computeRouteInterne(waypoints, allRoads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones) {
    const graph = _buildGraph(allRoads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones);
    if (graph.nodes.length === 0) {
      // 🌍 i18n : code + params, localisé côté rendu (interfaceItineraire.js).
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
      const segPoints = result.nodeIndices.map(function(idx) {
        return { x: graph.nodes[idx].x, y: graph.nodes[idx].y };
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
      snappedPoints:  snapResults.map(function(s) { return s.projection; })
    };
  }

  // =========================
  // API PUBLIQUE — computeRoute (avec fallback 2 passes pour evitements)
  // =========================
  // opts :
  //   - allowedTypes : ['principal','secondaire','chemin'] par defaut
  //   - avoidPoints  : [{x, y, label?}, ...] — points a eviter (souple)
  //   - avoidTags    : ["pa", "danger", ...] — tags a eviter (expansion auto
  //                    via SearchPoints.getAllPoints + filtre par tag)
  //   - avoidRadius  : px (defaut 100). Tout segment a moins de cette distance
  //                    d'un point d'evitement est exclu du graphe.
  //
  // ALGO 2 PASSES
  //   Passe 1 : avec zones inaccessibles (dur) + evitements (souple)
  //   Si echec ET avoidances non vides → Passe 2 : zones uniquement.
  //   Si passe 2 trouve un chemin → detection des points evites qui ont quand
  //   meme ete traverses par le path final (proximite < avoidRadius). Retour
  //   enrichi avec `usedFallback: true` + `avoidedThrough: [...]` pour que
  //   l'UI puisse afficher "⚠️ Impossible d'eviter : ..."
  //   Si passe 2 echoue aussi → on relance l'erreur (vraie absence de chemin
  //   = zone inaccessible bloquante ou reseau disconnect).
  // ⚠️ ASYNC depuis v169 (Karma_dev) : _expandAvoidTagsEnPoints utilise
  // SearchPoints.getAllPoints qui est async (cache fetch + data layers).
  // Les appelants doivent utiliser `await Pathfinder.computeRoute(...)` ou
  // `.then(...)`. Sans avoidTags, l'await est immediat (resolve sync).
  async function computeRoute(waypoints, opts) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      throw new Error("Au moins 2 waypoints sont requis");
    }
    opts = opts || {};
    const allowedTypes = opts.allowedTypes || ["principal", "secondaire", "chemin"];

    // 1. Collecte des roads disponibles.
    // ⚠️ On utilise getAllEmbeddedRoads (TOUTES les embedded, visibles ET masquees)
    // au lieu de getEmbeddedRoads (visibles uniquement) — cela permet a l'utilisateur
    // de masquer le calque des routes (routes parfois dessinees en dur sur le PNG du
    // plan) pour gagner en perf de rendu, tout en gardant un pathfinder fonctionnel.
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

    // 🚫 v169 (Karma_dev) : collecte des zones "inaccessibles" (contrainte dure).
    const zonesInacc = _collecterZonesInaccessibles();
    if (zonesInacc.length > 0) {
      console.log("[Pathfinder] " + zonesInacc.length + " zone(s) inaccessible(s) — contrainte dure");
    }

    // 🚫 v169 (Karma_dev) : preferences d'evitement (contrainte souple).
    // avoidPoints explicites + expansion des avoidTags en points.
    const explicitAvoid    = Array.isArray(opts.avoidPoints) ? opts.avoidPoints.slice() : [];
    const avoidTags        = Array.isArray(opts.avoidTags)   ? opts.avoidTags.slice()   : [];
    const expandedFromTags = await _expandAvoidTagsEnPoints(avoidTags);
    const allAvoidPts      = explicitAvoid.concat(expandedFromTags);
    const avoidRadius      = (Number.isFinite(opts.avoidRadius) && opts.avoidRadius > 0)
                              ? opts.avoidRadius : 100;
    // 🆕 v1.48.0 : zones a eviter (souple) — resolues depuis opts.avoidZones (ids derives).
    const avoidZones       = _collecterZonesAEviter(Array.isArray(opts.avoidZones) ? opts.avoidZones : []);
    if (avoidZones.length > 0) {
      console.log("[Pathfinder] " + avoidZones.length + " zone(s) a eviter — contrainte souple");
    }
    const hasAvoidances    = (allAvoidPts.length > 0) || (avoidZones.length > 0);
    if (allAvoidPts.length > 0) {
      console.log("[Pathfinder] " + allAvoidPts.length +
                  " point(s) a eviter (rayon " + avoidRadius + "px) — contrainte souple, fallback possible");
    }

    // ===== PASSE 1 : avec contraintes dures + souples =====
    let result          = null;
    let usedFallback    = false;
    let avoidedThrough  = [];

    try {
      result = _computeRouteInterne(
        waypoints, allRoads, allowedTypes,
        zonesInacc, allAvoidPts, avoidRadius, avoidZones
      );
    } catch(e1) {
      // Passe 1 echoue. Si on n'avait pas d'avoidances, c'est une vraie absence
      // de chemin (= zone inaccessible bloque ou reseau disconnect) → on relance.
      if (!hasAvoidances) throw e1;

      // Sinon, tentative passe 2 sans avoidances (= seulement zones dures).
      console.log("[Pathfinder] Passe 1 echec — tentative passe 2 sans evitements (fallback)");
      try {
        result = _computeRouteInterne(
          waypoints, allRoads, allowedTypes,
          zonesInacc, [], 0, []
        );
        usedFallback = true;
        // Detecter quels points evites sont traverses par le chemin final
        // (proximite < avoidRadius). Permet a l'UI d'afficher "Impossible
        // d'eviter : X, Y" pour informer l'user.
        avoidedThrough = allAvoidPts.filter(function(ap) {
          return _pathPassesNearPoint(result.path, ap, avoidRadius);
        });
        console.log("[Pathfinder] Passe 2 ok — " + avoidedThrough.length +
                    " evitement(s) traverse(s) malgre la preference");
      } catch(e2) {
        // Passe 2 echoue aussi → vraie absence de chemin
        throw e2;
      }
    }

    return Object.assign({}, result, {
      usedFallback:    usedFallback,
      avoidedThrough:  avoidedThrough,
      avoidRadius:     avoidRadius
    });
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
  // =========================
  // ISOCHRONE / REACHABILITY (depuis v173 — mode urgence "Je suis perdu")
  // =========================
  // Calcule tous les segments de roads atteignables depuis un point de départ
  // dans la limite d'un budget de distance (= vitesse × temps écoulé).
  // Utilisé par lostMode.js pour restreindre visuellement la zone de recherche
  // au réseau physique réel (galeries/chemins) au lieu d'un simple cercle.
  //
  // Algorithme : Dijkstra "budget" (variante one-to-all avec coupure à budget).
  // - On part du nœud snap (projection du startPoint sur le road le plus proche)
  // - On relaxe les voisins tant que leur distance accumulée ≤ budget
  // - Sortie : 3 catégories de segments :
  //   * fullSegments : les 2 endpoints sont dans le budget → highlight complet
  //   * partialSegments : seulement A (ou B) dans le budget → highlight tronqué
  //     via interpolation linéaire au point d'arrêt exact (= où le budget est épuisé)
  //   * (non retournés) : aucun endpoint dans le budget → skip
  //
  // Multi-niveau : les jonctions sont traversables (choix 5b validé KARMA),
  // donc le calcul peut s'étendre sur d'autres niveaux via les bridges. Géré
  // automatiquement par _buildGraph + _enrichirGrapheAvecCroisements existants.
  //
  // Cas dégénéré (départ loin de tout road) : retourne exceedsBudget=true avec
  // snapPoint + snapDistance, mais fullSegments/partialSegments vides. Le caller
  // (LostMode) trace alors une ligne pointillée + cercle seul.
  //
  // opts (optionnel, réservé pour évolutions Phase 2) — actuellement aucun.
  function computeReachable(startPoint, budgetPx, opts) {
    if (!startPoint || typeof startPoint.x !== "number" || typeof startPoint.y !== "number") {
      throw new Error("computeReachable : startPoint = {x, y} requis");
    }
    if (!isFinite(budgetPx) || budgetPx <= 0) {
      throw new Error("computeReachable : budgetPx > 0 requis (= rayon en pixels)");
    }

    // 1) Collecte de toutes les roads (session + embedded data layers) cohérente
    // avec computeRoute pour que le mode urgence couvre TOUT le réseau visible
    // par Pathfinder (visible ET masqué — cf §15 du CLAUDE.md).
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

    // Types autorisés : tous (principal/secondaire/chemin/jonction), idem computeRoute.
    const allowedTypes = ["principal", "secondaire", "chemin"];
    const zonesInacc = _collecterZonesInaccessibles();

    // 2) Construction graphe + enrichissement croisements (idem computeRoute,
    //    sans avoidances qui sont propres à l'itinéraire).
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

    // 3) Snap du point de départ sur le road le plus proche.
    const snap = _insertVirtualNode(graph, startPoint);
    if (!snap) {
      return {
        fullSegments: [], partialSegments: [],
        snapPoint: null, snapDistance: Infinity,
        exceedsBudget: true, reason: "no-snap",
        totalReachableDistance: 0
      };
    }

    // 4) Si le snap est déjà hors budget → impossible d'atteindre une route.
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

    // 5) Dijkstra "budget" depuis le node snap.
    const distances = _dijkstraReachable(graph, snap.nodeIdx, remainingBudget);

    // 6) Catégorisation des segments (full vs partial).
    const fullSegments = [];
    const partialSegments = [];
    let totalDist = 0;

    for (let i = 0; i < graph.segments.length; i++) {
      const seg = graph.segments[i];
      const dA = distances[seg.a];
      const dB = distances[seg.b];

      // Ni A ni B atteints → segment non emprunté
      if (dA === Infinity && dB === Infinity) continue;

      const pA = graph.nodes[seg.a];
      const pB = graph.nodes[seg.b];
      const segLen = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      if (segLen < 0.01) continue;  // segment dégénéré

      const inA = dA <= remainingBudget;
      const inB = dB <= remainingBudget;

      if (inA && inB) {
        // Cas 1 : les 2 endpoints atteints sous le budget → segment complet
        fullSegments.push([{ x: pA.x, y: pA.y }, { x: pB.x, y: pB.y }]);
        totalDist += segLen;
      } else if (inA) {
        // Cas 2 : A atteint, B hors budget → tronquer de A vers B
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
        // Cas 3 : B atteint, A hors budget → tronquer de B vers A
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
      // Cas 4 (A et B hors budget) : aucun highlight (le segment était entre 2
      // sub-trees dépassés, peu intéressant pour l'user perdu).
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

  // Dijkstra one-to-all avec coupure à budget. Renvoie un array dist[] indexé
  // par nodeIdx (Infinity si non atteint ou hors budget).
  function _dijkstraReachable(graph, start, budget) {
    const N = graph.nodes.length;
    const dist = new Array(N).fill(Infinity);
    dist[start] = 0;

    const remaining = new Set();
    for (let i = 0; i < N; i++) remaining.add(i);

    while (remaining.size > 0) {
      let u = -1;
      let minD = Infinity;
      remaining.forEach(function(i) {
        if (dist[i] < minD) { minD = dist[i]; u = i; }
      });
      if (u < 0 || minD === Infinity) break;
      // Optimisation : si le nœud minimum dépasse déjà le budget, tous les
      // suivants aussi (Dijkstra extraction par ordre croissant) → on peut sortir.
      if (minD > budget) break;
      remaining.delete(u);

      const neigh = graph.edges[u];
      for (let i = 0; i < neigh.length; i++) {
        const v = neigh[i].to;
        if (!remaining.has(v)) continue;
        const alt = dist[u] + neigh[i].weight;
        // On garde dist[v] même si > budget : utile pour le calcul des
        // partial segments (cas 2/3 ci-dessus où on a besoin de savoir
        // que B a été "vu" avec une certaine distance même si > budget).
        if (alt < dist[v]) {
          dist[v] = alt;
        }
      }
    }

    return dist;
  }

  // =========================
  // API GRAPHE RÉSEAU — réutilisable hors pathfinding (Nav Intelligente C1)
  // =========================
  // Expose le moteur de graphe DÉJÀ ÉPROUVÉ (_buildGraph + enrichissement) pour
  // réutilisation par la navigation intelligente (map-matching). Le cache et
  // l'invalidation sont gérés par js/roadGraph.js — ici on fournit juste le
  // constructeur + un snap LECTURE SEULE. Aucune modification de computeRoute /
  // computeReachable (qui gardent leur propre build par-requête avec avoidances).

  // Collecte session + embedded (même logique que computeRoute/computeReachable).
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

  // Construit le graphe réseau complet (build + enrichissement croisements),
  // SANS évitements (propres à l'itinéraire). Zones inaccessibles exclues par
  // défaut : la nav indique où l'utilisateur EST physiquement, une zone "inacc"
  // ne change pas la géométrie des galeries. opts.includeZones = true pour les
  // respecter quand même.
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

  // Snap LECTURE SEULE d'un point sur le graphe (NE MUTE PAS le graphe, par
  // opposition à _insertVirtualNode qui insère un nœud). Pour le map-matching
  // par pas : on veut juste le segment le plus proche + la projection.
  // Retourne { segIdx, seg, projection:{x,y}, t, dist } | null.
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

  // =========================
  // EXPORT
  // =========================
  window.Pathfinder = {
    computeRoute:      computeRoute,
    computeReachable:  computeReachable,
    resolvePointById:  resolvePointById,
    // 🆕 Nav Intelligente C1 — graphe réseau réutilisable (cf js/roadGraph.js)
    buildNetworkGraph: buildNetworkGraph,
    snapPointToGraph:  snapPointToGraph
  };
})();
