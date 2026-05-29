/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// ROAD GRAPH — cache du graphe réseau pour la Navigation Intelligente (C1)
// =========================
// Couche de CACHE au-dessus du moteur de graphe de pathfinder.js
// (Pathfinder.buildNetworkGraph). La navigation intelligente (map-matching de
// la position estimée sur le réseau de tracés) a besoin d'un graphe topologique
// réutilisable et à jour SANS le reconstruire à chaque pas — l'enrichissement
// des croisements est en O(N²) sur le nombre de segments, donc cher sur les
// réseaux denses (cf. couverture systématique d'un grand réseau).
//
// STRATÉGIE — rebuild PARESSEUX piloté par une SIGNATURE de contenu :
//   • getGraph() ne reconstruit que si la signature des roads a changé depuis
//     le dernier build (ajout/suppression de tracé, ajout de points en dessin).
//   • Aucun timer, aucun hook fragile à chaîner : pull-based, robuste à l'ordre
//     de chargement des modules. C'est l'équivalent « débounce » du design doc,
//     en mieux : on ne rebuild que quand la nav DEMANDE le graphe ET qu'il a
//     réellement changé. Pendant le dessin (nav inactive), aucun rebuild.
//   • invalidate() force un rebuild au prochain getGraph() (plan switch, etc.).
//
// La signature somme les points des roads de SESSION (peu nombreux, coût
// négligeable) + le nombre de roads embarquées (le gros réseau GRS est
// read-only après chargement → un simple compteur suffit, on ne somme pas ses
// points pour rester O(1) côté embedded).
//
// API : window.RoadGraph
//   - getGraph(opts)   → graphe { nodes, edges, segments, buckets, nodeLevels } | null
//   - snap(x, y, opts) → { segIdx, seg, projection:{x,y}, t, dist } | null
//   - invalidate()     → force un rebuild au prochain getGraph()
//   - isReady()        → bool (un graphe non vide est en cache et à jour)
//   - stats()          → { nodes, segments, sig } (debug)
//
// opts : { allowedTypes?: string[], includeZones?: bool } — transmis tel quel
// à Pathfinder.buildNetworkGraph.

(function() {
  "use strict";

  let _graph    = null;   // dernier graphe construit
  let _sig      = null;   // signature de contenu du dernier build
  let _optsKey  = null;   // clé des options du dernier build

  function _optsToKey(opts) {
    opts = opts || {};
    const types = (opts.allowedTypes || ["principal", "secondaire", "chemin"]).join(",");
    return types + "|" + (opts.includeZones ? "z1" : "z0");
  }

  // Signature de contenu bon marché : compte des roads session + total de leurs
  // points (capte le dessin) + compte des roads embarquées (capte le plan
  // switch ; embedded read-only → pas de somme de points).
  function _computeSig() {
    let sessionCount = 0;
    let sessionPts   = 0;
    if (typeof window.getRoads === "function") {
      const s = window.getRoads() || [];
      sessionCount = s.length;
      for (let i = 0; i < s.length; i++) {
        sessionPts += (s[i] && Array.isArray(s[i].points)) ? s[i].points.length : 0;
      }
    }
    let embeddedCount = 0;
    if (typeof window.getAllEmbeddedRoads === "function") {
      const e = window.getAllEmbeddedRoads() || [];
      embeddedCount = e.length;
    } else if (typeof window.getEmbeddedRoads === "function") {
      const e = window.getEmbeddedRoads() || [];
      embeddedCount = e.length;
    }
    return sessionCount + ":" + sessionPts + ":" + embeddedCount;
  }

  function invalidate() {
    _sig = null;   // force le rebuild au prochain getGraph()
  }

  function getGraph(opts) {
    if (typeof window.Pathfinder !== "object" ||
        typeof window.Pathfinder.buildNetworkGraph !== "function") {
      return null;  // pathfinder.js pas (encore) chargé
    }
    const sig = _computeSig();
    const key = _optsToKey(opts);
    if (!_graph || sig !== _sig || key !== _optsKey) {
      try {
        _graph   = window.Pathfinder.buildNetworkGraph(opts);
        _sig     = sig;
        _optsKey = key;
        if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
          console.log("[RoadGraph] (re)build —",
            _graph ? _graph.nodes.length : 0, "nœuds /",
            _graph ? _graph.segments.length : 0, "segments");
        }
      } catch(e) {
        console.warn("[RoadGraph] build échoué :", e);
        return null;
      }
    }
    return _graph;
  }

  function snap(x, y, opts) {
    const g = getGraph(opts);
    if (!g) return null;
    return window.Pathfinder.snapPointToGraph(g, { x: x, y: y });
  }

  function isReady() {
    return !!(_graph && Array.isArray(_graph.nodes) && _graph.nodes.length > 0 &&
              _sig === _computeSig());
  }

  function stats() {
    return {
      nodes:    _graph ? _graph.nodes.length : 0,
      segments: _graph ? _graph.segments.length : 0,
      sig:      _sig
    };
  }

  // =========================
  // MAP-MATCHING (Nav Intelligente C3)
  // =========================
  // Cale une position BRUTE (issue du dead-reckoning PDR) sur le réseau de
  // tracés. Greedy + « stickiness » (hystérésis) :
  //   1. On PRÉFÈRE rester sur le segment courant tant que la position brute
  //      reste dans rayon × STICKY_FACTOR → anti-saut entre galeries parallèles
  //      + anti-jitter aux croisements.
  //   2. Sinon, on bascule sur le segment le plus proche s'il est dans le rayon.
  //   3. Au-delà → off-network : le caller (tracking.js) bascule en repli PDR
  //      raster (mode HYBRIDE).
  //
  // ⚠️ Paramètres TERRAIN-SENSIBLES (premier jet, à affiner après test réel) :
  //   • rayon = max(MATCH_RADIUS_MIN_PX, échelle_px_par_m × MATCH_RADIUS_M)
  //   • STICKY_FACTOR : le segment courant est toléré jusqu'à rayon × ce facteur
  // Surchageables à chaud via APP_CONFIG.smartNavRadiusM (sinon défaut 6 m).
  const MATCH_RADIUS_M      = 6;    // ~6 m de tolérance latérale par défaut
  const MATCH_RADIUS_MIN_PX = 25;   // plancher si l'échelle est petite
  const STICKY_FACTOR       = 2.5;  // hystérésis : on colle au segment courant

  function _projectOnSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) {
      return { x: a.x, y: a.y, t: 0, dist: Math.hypot(p.x - a.x, p.y - a.y) };
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const px = a.x + t * dx, py = a.y + t * dy;
    return { x: px, y: py, t: t, dist: Math.hypot(p.x - px, p.y - py) };
  }

  function _matchRadiusPx() {
    const scale = (window.APP_CONFIG && Number.isFinite(window.APP_CONFIG.scale))
      ? window.APP_CONFIG.scale : 4.9;
    const m = (window.APP_CONFIG && Number.isFinite(window.APP_CONFIG.smartNavRadiusM) &&
               window.APP_CONFIG.smartNavRadiusM > 0)
      ? window.APP_CONFIG.smartNavRadiusM : MATCH_RADIUS_M;
    return Math.max(MATCH_RADIUS_MIN_PX, scale * m);
  }

  // matchPosition(rawX, rawY, prevSegIdx)
  //   → { onNetwork:bool, matched:{x,y}, segIdx:int, dist:number }
  function matchPosition(rawX, rawY, prevSegIdx) {
    const off = { onNetwork: false, matched: { x: rawX, y: rawY }, segIdx: -1, dist: Infinity };
    const g = getGraph();
    if (!g || !Array.isArray(g.segments) || g.segments.length === 0) return off;

    const raw = { x: rawX, y: rawY };
    const R = _matchRadiusPx();

    // 1) Stickiness : on tente de rester sur le segment courant.
    if (Number.isInteger(prevSegIdx) && prevSegIdx >= 0 && prevSegIdx < g.segments.length) {
      const seg = g.segments[prevSegIdx];
      const a = g.nodes[seg.a], b = g.nodes[seg.b];
      if (a && b) {
        const pc = _projectOnSeg(raw, a, b);
        if (pc.dist <= R * STICKY_FACTOR) {
          return { onNetwork: true, matched: { x: pc.x, y: pc.y }, segIdx: prevSegIdx, dist: pc.dist };
        }
      }
    }

    // 2) Sinon : segment le plus proche (snap lecture seule du pathfinder).
    const near = (window.Pathfinder && typeof window.Pathfinder.snapPointToGraph === "function")
      ? window.Pathfinder.snapPointToGraph(g, raw)
      : null;
    if (near && near.dist <= R) {
      return { onNetwork: true, matched: { x: near.projection.x, y: near.projection.y }, segIdx: near.segIdx, dist: near.dist };
    }

    // 3) Trop loin de tout → off-network (repli PDR raster côté caller).
    return off;
  }

  window.RoadGraph = {
    getGraph:      getGraph,
    snap:          snap,
    matchPosition: matchPosition,
    invalidate:    invalidate,
    isReady:       isReady,
    stats:         stats
  };
})();
