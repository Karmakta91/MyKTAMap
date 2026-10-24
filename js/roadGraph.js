/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// roadGraph.js — cache du graphe réseau (Pathfinder.buildNetworkGraph) + map-matching de la
// navigation intelligente. Le graphe coûte O(N²) (croisements) : il n'est reconstruit que si la
// nav le DEMANDE et qu'une SIGNATURE de contenu a changé (pas de timer ni de hook à chaîner).
// Expose : window.RoadGraph
//   getGraph(opts) → { nodes, edges, segments, buckets, nodeLevels } | null
//   snap(x, y, opts) → { segIdx, seg, projection, t, dist } | null
//   matchPosition(rawX, rawY, prevSegIdx, headingDeg) → cf plus bas
//   invalidate() (force un rebuild) · isReady() · stats() → { nodes, segments, sig }
// opts : { allowedTypes?: string[], includeZones?: bool }, transmis à Pathfinder.
// Doc : docs/architecture/tracking.md

(function() {
  "use strict";

  let _graph    = null;
  let _sig      = null;
  let _optsKey  = null;

  function _optsToKey(opts) {
    opts = opts || {};
    const types = (opts.allowedTypes || ["principal", "secondaire", "chemin"]).join(",");
    return types + "|" + (opts.includeZones ? "z1" : "z0");
  }

  // Signature bon marché : tracés de session + total de leurs points (capte le dessin) + empreinte de leurs
  // niveaux + nombre de tracés embarqués (en lecture seule : un compteur suffit, O(1)).
  // 🩸 L'empreinte des niveaux est indispensable : changer le niveau d'un tracé (ou l'annuler par ⏪) ne change ni
  // le nombre de tracés ni celui des sommets, et le graphe périmé garderait l'ancien niveau.
  function _computeSig() {
    let sessionCount = 0;
    let sessionPts   = 0;
    let niveaux      = 0;
    if (typeof window.getRoads === "function") {
      const s = window.getRoads() || [];
      sessionCount = s.length;
      for (let i = 0; i < s.length; i++) {
        const r = s[i];
        sessionPts += (r && Array.isArray(r.points)) ? r.points.length : 0;
        if (!r) continue;
        niveaux = Math.imul(niveaux ^ (r.level & 0xff), 16777619);
        niveaux = Math.imul(niveaux ^ (r.fromLevel & 0xff), 16777619);
        niveaux = Math.imul(niveaux ^ (r.toLevel & 0xff), 16777619);
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
    // 🩸 Passages entre niveaux (POI) : valider un raccord ou cocher un niveau ne touche aucun tracé ; sans leur
    // empreinte, le map-matching garderait un graphe sans (ou avec) le puits.
    let puits = "";
    if (window.KtaPoiJonction && typeof window.KtaPoiJonction.pointsJonction === "function") {
      window.KtaPoiJonction.pointsJonction().forEach(function(p) {
        puits += p.x + "," + p.y + "," + (p.tags && p.tags[0]) + "," + JSON.stringify(p.niveaux) + "," +
                 JSON.stringify(p.accroches) + ";";
      });
    }
    let hPuits = 0;
    for (let i = 0; i < puits.length; i++) hPuits = Math.imul(hPuits ^ puits.codePointAt(i), 16777619);
    return sessionCount + ":" + sessionPts + ":" + niveaux + ":" + embeddedCount + ":" + hPuits;
  }

  function invalidate() {
    _sig = null;
  }

  function getGraph(opts) {
    if (typeof window.Pathfinder !== "object" ||
        typeof window.Pathfinder.buildNetworkGraph !== "function") {
      return null;
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

  // ── Map-matching ─────────────────────────────────────────────────────────
  // Cale une position BRUTE (PDR) sur le réseau : 1) rester sur le segment courant (hystérésis,
  // anti-saut entre galeries parallèles) ; 2) sinon meilleure branche dans le rayon ;
  // 3) au-delà, hors réseau → repli PDR raster côté tracking.js (mode hybride).
  // ⚠️ Paramètres sensibles au terrain : rayon = max(MATCH_RADIUS_MIN_PX, échelle × rayon en m),
  //   rayon surchargeable par APP_CONFIG.smartNavRadiusM.
  const MATCH_RADIUS_M       = 6;    // tolérance latérale par défaut (m)
  const MATCH_RADIUS_MIN_PX  = 25;   // plancher si l'échelle est petite
  const STICKY_FACTOR        = 2.5;  // le segment courant est toléré jusqu'à rayon × ce facteur
  // 🩸 L'hystérésis ne vaut qu'à l'INTÉRIEUR du segment (T_EDGE < t < 1 - T_EDGE) : projection
  // clampée sur une extrémité = nœud dépassé → on relâche, sinon blocage aux intersections.
  const T_EDGE               = 0.02;
  // Poids du désalignement de cap (px par degré) : départage les branches d'un croisement.
  const W_HEADING_PX_PER_DEG = 0.7;

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

  // APP_CONFIG.smartNavHeadingWeight (≥ 0, 0 = cap ignoré), réglé dans Réglages → « Verrou sur
  // tracé (avancé) ».
  function _headingWeight() {
    return (window.APP_CONFIG && Number.isFinite(window.APP_CONFIG.smartNavHeadingWeight) &&
            window.APP_CONFIG.smartNavHeadingWeight >= 0)
      ? window.APP_CONFIG.smartNavHeadingWeight : W_HEADING_PX_PER_DEG;
  }

  // ⚠️ Même convention que le PDR : cap 0 = -y (haut), 90 = +x (est).
  function _bearingDeg(a, b) {
    const h = Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI;
    return (h + 360) % 360;
  }

  // Écart ramené à [0, 90] : un segment n'est pas orienté (0° et 180° = alignés).
  function _angleDiffMod180(h1, h2) {
    let d = Math.abs(h1 - h2) % 360;
    if (d > 180) d = 360 - d;   // → [0,180]
    if (d > 90)  d = 180 - d;   // ligne non orientée → [0,90]
    return d;
  }

  // Multi-niveau : `seg.level` = entier (tracé) ou "transit" (jonction, pathfinder.js).
  // 🩸 Sans ce filtre, la position se cale sur la galerie d'un AUTRE étage superposée en x/y.
  // Éligible : multi-niveau désactivé · "transit" · niveau actif · segment PRÉCÉDENT en
  // "transit" (on traverse : tous les niveaux rouverts, sinon on ne sort jamais de la jonction ;
  // l'appelant compare le level rendu au niveau actif pour basculer).
  // Filtre STRICT, pas pondéré : mieux vaut décrocher hors réseau que caler faux en silence.
  function _levelEligible(seg, mlOn, activeLevel, prevSeg) {
    if (!mlOn) return true;
    if (!seg) return false;
    if (seg.level === "transit") return true;
    if (seg.level === activeLevel) return true;
    if (prevSeg && prevSeg.level === "transit") return true;
    return false;
  }

  // → { onNetwork, matched: {x, y}, segIdx, dist, level: number | "transit" | null }
  // headingDeg : cap VISUEL courant (_getCorrectedHeading de tracking.js).
  function matchPosition(rawX, rawY, prevSegIdx, headingDeg) {
    const off = { onNetwork: false, matched: { x: rawX, y: rawY }, segIdx: -1, dist: Infinity, level: null };
    const g = getGraph();
    if (!g || !Array.isArray(g.segments) || g.segments.length === 0) return off;

    const raw = { x: rawX, y: rawY };
    const R = _matchRadiusPx();
    const headingValid = Number.isFinite(headingDeg);
    const connectBonus = R * 0.4;

    // `multiLevel` : opt-in PAR PLAN ; false → filtre neutre.
    const cfg         = window.APP_CONFIG || {};
    const mlOn        = !!cfg.multiLevel;
    const activeLevel = Number.isInteger(cfg.activeLevel) ? cfg.activeLevel : 0;

    let prevSeg = null;
    if (Number.isInteger(prevSegIdx) && prevSegIdx >= 0 && prevSegIdx < g.segments.length) {
      prevSeg = g.segments[prevSegIdx];
    }

    // 1) Hystérésis à l'intérieur du segment courant seulement (cf T_EDGE).
    if (prevSeg) {
      const a = g.nodes[prevSeg.a], b = g.nodes[prevSeg.b];
      if (a && b) {
        const pc = _projectOnSeg(raw, a, b);
        if (pc.dist <= R * STICKY_FACTOR && pc.t > T_EDGE && pc.t < 1 - T_EDGE) {
          return { onNetwork: true, matched: { x: pc.x, y: pc.y }, segIdx: prevSegIdx,
                   dist: pc.dist, level: prevSeg.level };
        }
      }
    }

    // 2) score = distance + désalignement de cap × poids − bonus de continuité (segment relié
    //    au courant par un nœud : limite le saut vers une galerie parallèle).
    let best = null;
    for (let i = 0; i < g.segments.length; i++) {
      const seg = g.segments[i];
      const a = g.nodes[seg.a], b = g.nodes[seg.b];
      if (!a || !b) continue;
      if (!_levelEligible(seg, mlOn, activeLevel, prevSeg)) continue;
      const proj = _projectOnSeg(raw, a, b);
      if (proj.dist > R) continue;
      let score = proj.dist;
      if (headingValid) {
        score += _headingWeight() * _angleDiffMod180(headingDeg, _bearingDeg(a, b));
      }
      if (prevSeg && (seg.a === prevSeg.a || seg.a === prevSeg.b ||
                      seg.b === prevSeg.a || seg.b === prevSeg.b)) {
        score -= connectBonus;
      }
      if (!best || score < best.score) {
        best = { segIdx: i, x: proj.x, y: proj.y, dist: proj.dist, score: score, level: seg.level };
      }
    }
    if (best) {
      return { onNetwork: true, matched: { x: best.x, y: best.y }, segIdx: best.segIdx,
               dist: best.dist, level: best.level };
    }

    // 3) Hors réseau.
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
