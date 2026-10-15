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
//     path : [{x, y, level}] — `level` est l'entier du niveau quand il est
//     UNIVOQUE, `null` sinon (nœud d'intersection multi-niveaux, ou milieu de
//     jonction qui n'est à aucun étage mais ENTRE deux). Ajouté en v1.83.0 pour
//     le profil en long : il était calculé puis jeté.
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

  // Trace de diagnostic, uniquement en mode debug : une jonction dont la
  // longueur change soudain mérite d'être visible quand on la cherche.
  const _diagJonction = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);

  // Profondeur d'un niveau pour le réseau en cours de calcul. `ctxPoids` =
  // { echelle, profondeurs } du plan du RÉSEAU quand ce n'est pas le plan
  // ouvert (étape d'un itinéraire inter-plans). Une table fournie fait foi,
  // même vide : le repli sur le plan ouvert n'a lieu que SANS table — sinon une
  // étape distante pèserait ses puits avec les profondeurs du mauvais plan.
  function _profondeurPourPoids(niveau, ctxPoids) {
    const table = ctxPoids && ctxPoids.profondeurs;
    if (table && typeof table === "object") {
      const v = table[String(niveau)];
      return (typeof v === "number" && Number.isFinite(v)) ? v : null;
    }
    if (typeof window.getProfondeurNiveau !== "function") return null;
    return window.getProfondeurNiveau(niveau);
  }

  // Poids d'un segment, en pixels plan. Identique à la distance 2D SAUF pour
  // une jonction dont les deux niveaux ont une profondeur renseignée.
  // `part` (0..1) = part du dénivelé portée par CE segment : une jonction
  // dessinée en N segments répartit son dénivelé au prorata de la longueur 2D
  // de chacun (cf _partsDenivJonction). Sans prorata, chaque segment comptait
  // le dénivelé COMPLET (680 px au lieu de 520 pour un puits en 2 segments).
  // Somme des hypoténuses = hypot(longueur 2D totale, dénivelé) : une jonction
  // pèse pareil quel que soit son nombre de points, et dans les deux sens.
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

  // Parts du dénivelé d'une jonction, segment par segment (index i = segment
  // [points[i], points[i+1]]) : longueur 2D du segment / longueur 2D totale.
  // Jonction de longueur nulle (tous ses points confondus) → parts égales.
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

  // `ctxPoids` (facultatif) : { echelle, profondeurs } du plan du réseau — cf
  // _profondeurPourPoids. Absent = plan ouvert.
  function _buildGraph(roads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones, ctxPoids) {
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
      const partsDeniv = isJonction ? _partsDenivJonction(road.points) : null;

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
          // 🩸 v1.83.0 — UNE JONCTION EST UN PUITS, PAS UN TRAIT.
          // Son coût était sa longueur DANS LE PLAN : un puits dessiné sur
          // 3 px entre deux étages distants de 12 m comptait pour 3 px. Les
          // distances d'itinéraire multi-niveaux étaient donc sous-comptées,
          // et Dijkstra préférait systématiquement le puits au détour à plat —
          // parfois à tort.
          //
          // Avec des profondeurs saisies, la vraie longueur est l'hypoténuse.
          // Le graphe travaille en PIXELS PLAN : le dénivelé est converti par
          // l'échelle avant d'être combiné, sinon on additionnerait des mètres
          // à des pixels.
          //
          // Sans profondeur renseignée — l'état de tout plan d'avant cette
          // version — on retombe exactement sur l'ancien calcul.
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

  // ⚡ 29/09/2026 — GRILLE SPATIALE pour l'enrichissement. Les trois passes
  // ci-dessous comparaient chaque segment à TOUS les autres (O(S²)) : ~40 s
  // par itinéraire mesurés sur un relevé de 912 tracés / ~9 000 sommets.
  // Or chaque test n'aboutit que si les deux objets sont PROCHES (bbox qui se
  // touchent, ou à moins de PROXIMITY_TOLERANCE). La grille ne sert qu'à
  // écarter d'avance les paires lointaines, qui ne produisaient rien.
  // 🩸 RÉSULTAT IDENTIQUE AU BIT PRÈS, pas « équivalent » : les candidats sont
  // TRIÉS par indice croissant avant d'être traités, donc les nœuds virtuels
  // sont créés dans le même ordre, avec les mêmes indices, qu'avant.
  const GRILLE_ENRICH_PX = 64;

  function _cellulesDe(x0, y0, x1, y1, cell, rappel) {
    const cx0 = Math.floor(x0 / cell), cx1 = Math.floor(x1 / cell);
    const cy0 = Math.floor(y0 / cell), cy1 = Math.floor(y1 / cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) rappel(cx + "," + cy);
    }
  }

  // Indexe chaque segment dans toutes les cellules que couvre sa bbox
  // élargie de `marge`.
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

  // Candidats (indices triés, sans doublon) des cellules couvrant une bbox.
  function _candidatsGrille(g, x0, y0, x1, y1) {
    const vus = new Set();
    _cellulesDe(x0, y0, x1, y1, GRILLE_ENRICH_PX, function(k) {
      const l = g.get(k);
      if (l) for (let n = 0; n < l.length; n++) vus.add(l[n]);
    });
    return Array.from(vus).sort(function(p, q) { return p - q; });
  }

  function _enrichirGrapheAvecCroisements(graph) {
    // Snapshot des segments AVANT l'enrichissement (sinon boucle infinie sur
    // les segments virtuels qu'on ajoute).
    const segs = graph.segments.slice();
    // ⚡ Deux index : bbox brute (+1 px de sûreté) pour les croisements,
    // bbox élargie de la tolérance pour les T-junctions.
    const grilleCroise = _grilleSegments(graph, segs, 1);
    const grilleProxi  = _grilleSegments(graph, segs, PROXIMITY_TOLERANCE + 1);
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
      // ⚡ Seuls les segments dont la bbox touche celle de A peuvent le croiser.
      const candA = _candidatsGrille(grilleCroise, Math.min(a1.x, a2.x), Math.min(a1.y, a2.y),
                                     Math.max(a1.x, a2.x), Math.max(a1.y, a2.y));

      for (let c = 0; c < candA.length; c++) {
        const j = candA[c];
        if (j <= i) continue;
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
      // ⚡ Seuls les segments à moins de la tolérance d'une des deux extrémités
      // (index construit sur les bbox élargies) peuvent donner une T-junction.
      const pa = endpoints[0].point, pb = endpoints[1].point;
      const candB = _candidatsGrille(grilleProxi, Math.min(pa.x, pb.x), Math.min(pa.y, pb.y),
                                     Math.max(pa.x, pb.x), Math.max(pa.y, pb.y));

      for (let c = 0; c < candB.length; c++) {
        const j = candB[c];
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
    // ⚡ Grille de pas ≥ tolérance : deux extrémités à moins de
    // PROXIMITY_TOLERANCE sont forcément dans des cellules voisines (3×3).
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
  // 🩸 29/09/2026 (audit Secours, 4.2) — LE CALAGE IGNORAIT LE NIVEAU DU POINT : le
  // segment le plus proche en 2D gagnait, quel que soit son étage (mesuré : 7,8 %
  // des clics à ~2 m d'une galerie du −1 accrochés à un autre niveau). Si le point
  // porte un niveau (plan multi-niveau), le segment le plus proche DE CE NIVEAU est
  // préféré, à condition de ne pas être à plus de NIVEAU_TOLERANCE_PX au-delà du plus
  // proche tous niveaux confondus — sinon le niveau du point est sans doute faux, et
  // l'ancien comportement reste. Point sans niveau : rien ne change.
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

    // 🩸 27/09/2026 (révélé par le guidage) — LE CHEMIN PARTAIT EN ARRIÈRE.
    // Le nœud virtuel n'était relié qu'aux DEUX EXTRÉMITÉS du segment. Or
    // l'enrichissement a pu poser des nœuds de croisement ENTRE elles (sur
    // l'arête d'origine, gardée). Départ à 20 px d'une extrémité, croisement
    // au milieu : le chemin allait à l'extrémité puis revenait (+2×20 px de
    // distance, un aller-retour invisible sur la carte, et un « demi-tour »
    // annoncé au départ). On relie donc aussi le nœud virtuel aux nœuds
    // posés sur son segment — le plus proche de chaque côté suffit.
    // Multi-niveau : seul un nœud du MÊME niveau que le segment est relié —
    // sinon deux étages superposés en x/y communiqueraient par ce raccourci.
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

  // =========================
  // DIJKSTRA
  // =========================
  // ⚡ 29/09/2026 — TAS BINAIRE au lieu d'un balayage de tous les nœuds à
  // chaque extraction (O(V²) → O(E log V)). « OK pour < 10k nœuds » était
  // faux en pratique : ~40 s sur un relevé réel, dont une large part ici.
  // 🩸 Même ordre d'extraction qu'avant, donc mêmes chemins : l'ancien
  // balayage prenait la plus petite distance et, à égalité, le plus petit
  // indice (parcours croissant, comparaison stricte). Le tas est ordonné sur
  // exactement ce couple (distance, indice). Entrées périmées ignorées.
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

      // Relaxer les voisins
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
  // `echelle` (px/m) et `profondeurs` ({ "<niveau>": m|null }), facultatifs :
  // ceux du plan du RÉSEAU, quand ce n'est pas le plan ouvert (étape d'un
  // itinéraire inter-plans) — sinon APP_CONFIG.scale / getProfondeurNiveau.
  // Ils servent aux carrefours ET au poids des jonctions de niveau.
  function _computeRouteInterne(waypoints, allRoads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones,
                                echelle, profondeurs) {
    const graph = _buildGraph(allRoads, allowedTypes, zonesInacc, avoidPoints, avoidRadius, avoidZones,
                              { echelle: echelle, profondeurs: profondeurs });
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
      // 🩸 v1.83.0 — LE NIVEAU VOYAGE AVEC LE CHEMIN.
      // Il était JETÉ : les nœuds du graphe le portent (`levels: Set`), mais
      // le retour était un `{x, y}` plat. Aucun profil en long n'était donc
      // calculable, faute de savoir à quelle profondeur passe chaque point.
      //
      // `levels` peut contenir plusieurs entrées (nœud fusionné à une
      // intersection) ou « transit » (milieu d'une jonction, qui n'est à aucun
      // étage — il est ENTRE deux). On ne rend un niveau que s'il est
      // univoque : ailleurs, `null` dit honnêtement « indéterminé », et le
      // profil interpole. C'est exactement ce qu'on veut d'un puits.
      const segPoints = result.nodeIndices.map(function(idx) {
        const n = graph.nodes[idx];
        // ⚠️ Les niveaux ne sont PAS portés par le nœud : ils vivent dans le
        // tableau parallèle `graph.nodeLevels[idx]` (Set<number|"transit">).
        // Première rédaction : `n.levels` — toujours `undefined`, donc `null`
        // partout, sans la moindre erreur. Le profil serait sorti plat.
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
      // 🪧 Guidage (27/09/2026) — deux champs AJOUTÉS, aucun champ existant ne
      // change : `path` et `totalDistance` restent le seul trajet SUR tracé.
      //   • raccords : le trajet à vol d'oiseau entre chaque waypoint et le
      //     tracé où il s'accroche. Il existait (snapDist) mais était jeté —
      //     l'itinéraire commençait sur la galerie sans dire qu'il fallait
      //     d'abord la rejoindre (décision KARMA K : dessiné ET compté).
      //   • carrefours : les nœuds du graphe SITUÉS SUR le chemin d'où partent
      //     au moins 3 directions. Cherchés géométriquement : l'arête d'origine
      //     restant dans le graphe quand un croisement est inséré, un chemin
      //     qui passe tout droit peut ne pas traverser le nœud du croisement.
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

  // =========================
  // 🪧 CARREFOURS LE LONG D'UN CHEMIN (guidage, 27/09/2026)
  // =========================
  // Rend [{x, y, sorties:[cap°]}] pour chaque nœud du graphe posé sur le
  // chemin (≤ CARREFOUR_TOL_PX) d'où partent au moins 3 directions DISTINCTES.
  // Cap en degrés, 0 = haut du plan, sens horaire (convention de tracking.js).
  //
  // « Distinctes » est le cœur de l'affaire : le graphe est bruité par
  // construction (arête doublée A↔B à côté de A↔V↔B, sommets voisins d'un
  // même tracé reliés par la proximité d'extrémités, tremblement du dessin à
  // la main). Compter les voisins d'un nœud mentait sur un tracé tremblé.
  // On regarde donc la GÉOMÉTRIE : un cercle de ~3 m autour du nœud, et
  // chaque endroit où le réseau le traverse est une sortie. Les directions
  // proches (SORTIE_ECART_DEG) se regroupent. Effet voulu : une amorce de
  // moins de 3 m (défaut de dessin) n'atteint pas le cercle et ne compte pas.
  const CARREFOUR_TOL_PX  = 3;
  const SORTIE_ECART_DEG  = 25;
  const GRILLE_CHEMIN_PX  = 24;

  // Rayon du cercle de sortie : ~3 m, jamais moins de 8 px.
  // Échelle (px/m) du réseau mesuré : celle passée par l'appelant (réseau d'un
  // AUTRE plan — itinéraire inter-plans), sinon celle du plan ouvert. `repli` :
  // valeur quand aucune n'est connue (0 = pas calibré pour le rayon de sortie).
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

  // Grille des arêtes du graphe (une seule fois par calcul de carrefours).
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

  // `c` : le centre du cercle — un nœud, ou le centre d'une ZONE de carrefour.
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
          // Intersections du segment [a, b] avec le cercle (c, R)
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
    // Regroupement par angle, circulaire : le dernier groupe peut rejoindre
    // le premier en passant par 0°. Moyenne VECTORIELLE (359° et 1° font 0°,
    // pas 180°).
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
    // Grille des segments du chemin → test de proximité en O(1) par nœud
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

  // 🪧 GRANDS CARREFOURS (décision KARMA 1:a, 27/09/2026). Sur un plan réel,
  // un grand carrefour n'est pas UN nœud à 5 branches : c'est une ZONE de
  // plusieurs croisements proches (7 croisements sur moins de 20 m mesurés
  // sur l'un d'eux), les galeries n'arrivant pas toutes au même point du
  // dessin. Des croisements qui se suivent sur le trajet à ≤ ZONE_ECART_M
  // l'un du précédent forment une zone ; ses sorties se mesurent sur un
  // cercle qui l'englobe (rayon de la zone + le rayon de sortie habituel).
  // Chaque membre reçoit la MÊME `zone` : { x, y, r, sorties }.
  const ZONE_ECART_M = 5;   // KARMA : « 20 m c'est beaucoup trop, plutôt 5 »
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
  //   - respecterInaccessibles : false pour SUSPENDRE la contrainte dure des
  //                    zones "inaccessible" (v1.82.0). Absent/true = comportement
  //                    historique. Seule contrainte du moteur qui ne se relache
  //                    jamais d'elle-meme, d'ou le besoin d'un interrupteur.
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
    // 🆕 v1.82.0 — DÉBRAYABLE (demande KARMA). C'est la SEULE contrainte dure du
    // moteur : jamais relâchée, même en passe 2. Sur un relevé importé encore
    // incomplet, un polygone typé « inaccessible » par erreur ferme donc un
    // passage qui existe, sans recours. La case de la modale itinéraire permet
    // de le suspendre — cochée par défaut : le comportement sûr reste l'implicite,
    // et le lever est un geste explicite de l'utilisateur qui connaît son terrain.
    //
    // ⚠️ Volontairement limité à `computeRoute`. `computeReachable` (Mode
    // Secours / Perdu) garde les zones inaccessibles en toutes circonstances :
    // une préférence de confort n'a pas à élargir un périmètre de secours.
    const zonesInacc = (opts.respecterInaccessibles === false)
      ? [] : _collecterZonesInaccessibles();
    if (opts.respecterInaccessibles === false) {
      console.log("[Pathfinder] zones inaccessibles IGNORÉES (choix utilisateur)");
    }
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

  // ============================================================
  // 🆕 v1.60.0 (A6 — itinéraire inter-plan) — computeRouteOnRoads
  // ============================================================
  // Dijkstra sur des ROADS FOURNIES EN PARAMÈTRE (plan NON chargé — lues à
  // distance par InterPlanLinks.collectRoutingDataForPlan). Contrairement à
  // computeRoute : SYNCHRONE (pas d'expansion avoidTags — l'appelant résout
  // lui-même ses évitements en points/zones objets, car les données du plan
  // distant ne sont pas dans les globals du runtime).
  //
  // opts :
  //   - allowedTypes        : types de roads (défaut principal/secondaire/chemin)
  //   - zones               : zones du plan distant [{type, points, level?}] —
  //                           les "inaccessible" deviennent CONTRAINTE DURE
  //   - avoidPoints         : [{x, y, label?}] contrainte souple (passe 2 sans)
  //   - avoidZonesResolved  : zones OBJETS à éviter (souple)
  //   - avoidRadius         : rayon px (défaut 100)
  //   - echelle             : px/m du plan de CE réseau (défaut : plan ouvert) —
  //                           mesure des carrefours (rayon de sortie 3 m, zone 5 m)
  //                           et dénivelé des jonctions de niveau
  //   - profondeurs         : { "<niveau>": m|null } du plan de CE réseau —
  //                           poids des jonctions. Fournie (même {}) = fait foi ;
  //                           absente = plan ouvert (à réserver au plan ouvert)
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
      // Passe 2 sans évitements souples (mêmes règles que computeRoute)
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
    const fait = new Uint8Array(N);
    dist[start] = 0;
    // ⚡ 29/09/2026 — même tas (distance, indice) que `_dijkstra` : même ordre
    // d'extraction que l'ancien balayage O(V²), donc mêmes distances rendues.
    const tas = [];
    _tasPousser(tas, 0, start);

    while (tas.length) {
      const e = _tasExtraire(tas);
      const u = e[1], minD = e[0];
      if (fait[u] || minD !== dist[u]) continue;   // entrée périmée
      // Optimisation : si le nœud minimum dépasse déjà le budget, tous les
      // suivants aussi (Dijkstra extraction par ordre croissant) → on peut sortir.
      if (minD > budget) break;
      fait[u] = 1;

      const neigh = graph.edges[u];
      for (let i = 0; i < neigh.length; i++) {
        const v = neigh[i].to;
        if (fait[v]) continue;
        const alt = dist[u] + neigh[i].weight;
        // On garde dist[v] même si > budget : utile pour le calcul des
        // partial segments (cas 2/3 ci-dessus où on a besoin de savoir
        // que B a été "vu" avec une certaine distance même si > budget).
        if (alt < dist[v]) {
          dist[v] = alt;
          _tasPousser(tas, alt, v);
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

  // 🪧 Guidage (27/09/2026) — le plan a-t-il au moins un tracé exploitable ?
  // Sert à AVERTIR au lancement (modale, « Y aller », sortie d'urgence) plutôt
  // qu'à laisser le calcul échouer sur un message technique. L'itinéraire
  // lui-même ne compte pas : c'est un calcul, pas un tracé.
  function aDesTraces() {
    const s = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    const e = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || [])
      : (typeof window.getEmbeddedRoads === "function") ? (window.getEmbeddedRoads() || []) : [];
    return s.concat(e).some(function(r) {
      return r && r.type !== "itinerary" && Array.isArray(r.points) && r.points.length >= 2;
    });
  }

  // =========================
  // EXPORT
  // =========================
  window.Pathfinder = {
    aDesTraces:        aDesTraces,
    computeRoute:      computeRoute,
    computeRouteOnRoads: computeRouteOnRoads,   // 🆕 v1.60.0 (A6) — roads fournies (plan non chargé)
    computeReachable:  computeReachable,
    resolvePointById:  resolvePointById,
    // 🆕 Nav Intelligente C1 — graphe réseau réutilisable (cf js/roadGraph.js)
    buildNetworkGraph: buildNetworkGraph,
    snapPointToGraph:  snapPointToGraph
  };
})();
