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

  window.RoadGraph = {
    getGraph:   getGraph,
    snap:       snap,
    invalidate: invalidate,
    isReady:    isReady,
    stats:      stats
  };
})();
