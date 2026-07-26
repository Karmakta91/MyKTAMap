/*!
 * MyKTAMap — Itinéraire inter-plan (v1.60.0)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// INTERPLANROUTE.JS — Itinéraire à travers les portails (depuis v1.60.0)
// =========================
// « Je suis sur le plan A, je veux rejoindre un point du plan B relié par une
// liaison » → leg A (ma position → point-portail côté A, Dijkstra du plan
// courant) + traversée (0 m, décision 5:a) + leg B (point-portail côté B →
// destination, Dijkstra sur les roads du plan B lues À DISTANCE).
//
// Décisions KARMA (A6 : 1:c 2:a 3:a 4:a 5:a 6:a) :
//   - 2 entrées UX : modale Itinéraire (« 🌐 Destination sur un autre plan »)
//     + recherche multi-plans (bouton 🧭 sur un résultat distant).
//   - V1 : 1 portail max (plan adjacent). Multi-hop détecté → message
//     informatif « pas de liaison directe (chemin via <plan> existe) ».
//   - Plusieurs portails candidats → coût RÉEL comparé (≤ 5 testés, total min).
//   - Après la traversée : leg B AUTO-TRACÉ à l'arrivée (pendingRoute).
//   - Évitements : prefs du plan concerné appliquées à chaque leg
//     (myktamap_route_avoid_<planId> — points + tags + zones par type).
//   - ⚠️ Distances sommées en MÈTRES (px/scale par plan — les échelles
//     diffèrent entre plans).
//
// GESTION D'ÉCHECS (exigence KARMA « bien gérer les cas impossibles ») —
// chaque cas a son code + message i18n :
//   NO_PLAN / NO_POS       : pas de plan chargé / pas de position tracker
//   SAME_PLAN              : destination sur le plan courant (→ itinéraire classique)
//   NO_LINK                : aucune liaison entre les 2 plans
//   NO_DIRECT_LINK         : pas de liaison directe mais un chemin multi-plans existe
//   DATA_UNREACHABLE       : données routing du plan B injoignables (offline)
//   NO_ROADS_B             : le plan B n'a aucun tracé (pas de réseau)
//   ALL_FAILED             : tous les portails testés échouent (détail A/B)
//
// API : window.InterPlanRoute = { computeEtAfficher(dest), onPlanLoaded() }
//   dest = { planId, planName?, x, y, level?, label? }
// 100 % local (lecture plans same-origin/IDB déjà couverte par l'audit).
// =========================

(function() {
  "use strict";

  const MAX_CANDIDATS = 5;
  // 🌀 v1.64.0 — MULTI-HOP (décisions KARMA : 1:a 2:a 3:a 4:a, 5 = opt-in à
  // cocher dans la recherche multi-plans). Itinéraire via plusieurs plans
  // (A→B→C…) par Dijkstra sur le GRAPHE DE PORTAILS (nœuds = position,
  // côtés de portail, destination ; arêtes intra-plan = coût Dijkstra réel
  // en mètres, traversées = 0 m), avec évaluation PARESSEUSE des arêtes.
  const MAX_HOPS             = 3;    // traversées max (= 4 plans, aligné BFS)
  const MAX_PORTALS_PER_PAIR = 5;    // portails gardés par frontière de plans
  const MAX_LEGS_COMPUTE     = 60;   // borne dure de Dijkstras intra-plan
  const MULTIHOP_LS_KEY      = "myktamap_ipr_multihop_v1";

  function _multiHopEnabled() {
    try { return localStorage.getItem(MULTIHOP_LS_KEY) === "1"; } catch(e) { return false; }
  }
  function _setMultiHopEnabled(on) {
    try { localStorage.setItem(MULTIHOP_LS_KEY, on ? "1" : "0"); } catch(e) {}
    console.log("[InterPlanRoute] Multi-hop " + (on ? "activé" : "désactivé"));
  }

  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }
  function _esc(s) {
    // 🧹 v1.61.0 (B6) : délègue au helper canonique window.ktaEsc (utils.js) ;
    // fallback inline si utils pas encore chargé (ordre defer sûr, ceinture).
    if (typeof window.ktaEsc === "function") return window.ktaEsc(s);
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function _err(code, msg) {
    const e = new Error(msg);
    e.code = code;
    return e;
  }
  function _fmtDist(m) {
    return (typeof window.formatDistance === "function") ? window.formatDistance(m, 0) : (Math.round(m) + " m");
  }

  // ---------------------------------------------------------------
  // Prefs d'évitement d'un plan (même clé que la modale Itinéraire)
  // ---------------------------------------------------------------
  function _avoidPrefs(planId) {
    try {
      const raw = localStorage.getItem("myktamap_route_avoid_" + planId);
      if (raw) {
        const p = JSON.parse(raw);
        return {
          points: Array.isArray(p.points) ? p.points : [],
          tags:   Array.isArray(p.tags)   ? p.tags   : [],
          zones:  Array.isArray(p.zones)  ? p.zones  : [],
          radius: (Number.isFinite(p.radius) && p.radius > 0) ? p.radius : 100
        };
      }
    } catch(e) {}
    return { points: [], tags: [], zones: [], radius: 100 };
  }

  // ---------------------------------------------------------------
  // Méta-graphe des plans (BFS pour le message NO_DIRECT_LINK)
  // ---------------------------------------------------------------
  function _cheminDePlans(fromId, toId) {
    const links = window.InterPlanLinks.getLinksForPlan ? null : null; // (registre lu ci-dessous)
    const all = [];
    // adjacence depuis le registre complet — via getLinksForPlan de chaque
    // nœud serait circulaire ; on lit les liaisons des 2 plans + BFS global
    // simple sur l'ensemble du registre (exposé indirectement : on collecte
    // en balayant les liaisons de proche en proche).
    const seen = {};
    const queue = [[fromId]];
    seen[fromId] = true;
    while (queue.length > 0) {
      const path = queue.shift();
      const cur = path[path.length - 1];
      if (cur === toId) return path;
      if (path.length > 4) continue;   // profondeur bornée
      const voisins = {};
      (window.InterPlanLinks.getLinksForPlan(cur) || []).forEach(function(l) {
        if (l.a && l.a.planId === cur && l.b) voisins[l.b.planId] = true;
        if (l.b && l.b.planId === cur && l.a) voisins[l.a.planId] = true;
      });
      Object.keys(voisins).forEach(function(v) {
        if (!seen[v]) { seen[v] = true; queue.push(path.concat([v])); }
      });
    }
    return null;
  }

  // ---------------------------------------------------------------
  // 🌀 v1.64.0 — MOTEUR MULTI-HOP (graphe de portails, arêtes paresseuses)
  // ---------------------------------------------------------------
  // Nœuds : @start (ma position) + chaque CÔTÉ de portail + @dest.
  // Arêtes : intra-plan (coût = Dijkstra réel en mètres, calculé
  // PARESSEUSEMENT à l'expansion du nœud + mémoïsé) · traversée (0 m).
  // Le Dijkstra global couvre AUSSI le cas direct (1 traversée) — quand la
  // préférence multi-hop est cochée, ce moteur remplace entièrement le
  // moteur single-hop.

  // Adjacence du méta-graphe des plans : { planId: { voisinId: [liaisons] } }
  function _adjacencePlans() {
    const adj = {};
    const links = (window.InterPlanLinks.getAllLinks && window.InterPlanLinks.getAllLinks()) || [];
    links.forEach(function(l) {
      if (!l || !l.a || !l.b || !l.a.planId || !l.b.planId) return;
      if (l.a.planId === l.b.planId) return;
      if (!adj[l.a.planId]) adj[l.a.planId] = {};
      if (!adj[l.b.planId]) adj[l.b.planId] = {};
      (adj[l.a.planId][l.b.planId] = adj[l.a.planId][l.b.planId] || []).push(l);
      (adj[l.b.planId][l.a.planId] = adj[l.b.planId][l.a.planId] || []).push(l);
    });
    return adj;
  }

  function _bfsProfondeurs(adj, fromId) {
    const d = {};
    d[fromId] = 0;
    const q = [fromId];
    while (q.length > 0) {
      const cur = q.shift();
      Object.keys(adj[cur] || {}).forEach(function(v) {
        if (d[v] === undefined) { d[v] = d[cur] + 1; q.push(v); }
      });
    }
    return d;
  }

  // Contexte routing d'un plan (chargé UNE fois par calcul). null = plan
  // injoignable / sans réseau → écarté du graphe (4:a), consigné dans blocked.
  async function _ctxPlan(planId, planA, blocked) {
    if (planId === planA) {
      const prefs = _avoidPrefs(planA);
      return {
        planId: planA, isCurrent: true,
        planName: (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || planA,
        scale: (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1,
        prefs: prefs
      };
    }
    const plan = window.PlanRegistry ? window.PlanRegistry.findById(planId) : null;
    if (!plan) { blocked.push(planId); return null; }
    const stats = {};
    let routing = null;
    try { routing = await window.InterPlanLinks.collectRoutingDataForPlan(plan, stats); }
    catch(e) { stats.dataError = true; }
    if (!routing || stats.dataError || !routing.roads || routing.roads.length === 0) {
      blocked.push(plan.name || planId);
      return null;
    }
    // Évitements du plan distant (mêmes règles que le leg B single-hop)
    const prefs = _avoidPrefs(planId);
    let avoidPts = prefs.points.slice();
    if (prefs.tags.length > 0) {
      try {
        const pts = await window.InterPlanLinks.collectPointsForPlan(plan);
        pts.forEach(function(p) {
          if (Array.isArray(p.tags) && p.tags.some(function(t) { return prefs.tags.indexOf(t) >= 0; })) {
            avoidPts.push({ x: p.x, y: p.y, label: p.nom || p.id });
          }
        });
      } catch(e) { /* tags non résolus → points/zones seulement */ }
    }
    const avoidZones = (routing.zones || []).filter(function(z) {
      return z && z.type !== "inaccessible" && prefs.zones.indexOf(z.type) >= 0;
    });
    return {
      planId: planId, isCurrent: false,
      planName: plan.name || planId,
      roads: routing.roads, zones: routing.zones || [],
      scale: (routing.scale && routing.scale > 0) ? routing.scale : 1,
      avoidPts: avoidPts, avoidZones: avoidZones, radius: prefs.radius
    };
  }

  // Un trajet intra-plan entre 2 points (coût en MÈTRES via l'échelle du plan).
  // 🌀 v1.64.0 : `via` optionnel = points de passage OBLIGATOIRES intercalés
  // (étapes du plan A posées dans la modale Itinéraire, ordre planifié).
  function _viaWps(via) {
    return (via || []).map(function(v) {
      return { x: v.x, y: v.y, source: "search", label: v.label || "" };
    });
  }
  async function _legEntre(ctx, from, to, via) {
    const wps = [from].concat(_viaWps(via)).concat([to]);
    let r;
    if (ctx.isCurrent) {
      r = await window.Pathfinder.computeRoute(wps, {
        avoidPoints: ctx.prefs.points, avoidTags: ctx.prefs.tags,
        avoidZones: ctx.prefs.zones, avoidRadius: ctx.prefs.radius
      });
    } else {
      r = window.Pathfinder.computeRouteOnRoads(wps, ctx.roads, {
        zones: ctx.zones, avoidPoints: ctx.avoidPts,
        avoidZonesResolved: ctx.avoidZones, avoidRadius: ctx.radius
      });
    }
    return { path: r.path, distM: r.totalDistance / ctx.scale, usedFallback: !!r.usedFallback };
  }

  async function _computeMultiHop(dest, pos, planA, via) {
    const adj = _adjacencePlans();
    const dFrom = _bfsProfondeurs(adj, planA);
    if (dFrom[dest.planId] === undefined) {
      throw _err("NO_LINK", _t("ipr.err.noLink", { plan: dest.planName || dest.planId }));
    }
    if (dFrom[dest.planId] > MAX_HOPS) {
      throw _err("TOO_FAR", _t("ipr.err.tooFar", { n: MAX_HOPS }));
    }
    const dTo = _bfsProfondeurs(adj, dest.planId);
    // Plans pertinents = sur AU MOINS un chemin A→dest de longueur ≤ MAX_HOPS
    const keep = {};
    Object.keys(dFrom).forEach(function(p) {
      if (dTo[p] !== undefined && dFrom[p] + dTo[p] <= MAX_HOPS) keep[p] = true;
    });

    // Contextes routing (plans injoignables écartés — 4:a)
    const blocked = [];
    const ctxs = {};
    const keptIds = Object.keys(keep);
    for (let i = 0; i < keptIds.length; i++) {
      const pid = keptIds[i];
      ctxs[pid] = await _ctxPlan(pid, planA, blocked);
      if (!ctxs[pid]) delete keep[pid];
    }
    if (!keep[dest.planId]) {
      throw _err("DATA_UNREACHABLE", _t("ipr.err.dataUnreachable", { plan: dest.planName || dest.planId }));
    }

    // Nœuds : côtés de portail entre plans gardés (cap par frontière)
    const nodes = {};
    Object.keys(keep).forEach(function(p) {
      Object.keys(adj[p] || {}).forEach(function(q) {
        if (!keep[q] || p >= q) return;   // chaque frontière une fois
        const linksPQ = adj[p][q];
        const gardes = linksPQ.slice(0, MAX_PORTALS_PER_PAIR);
        if (linksPQ.length > gardes.length) {
          console.log("[InterPlanRoute] Multi-hop : " + (linksPQ.length - gardes.length) +
                      " portail(s) ignoré(s) entre " + p + " ↔ " + q + " (cap " + MAX_PORTALS_PER_PAIR + ")");
        }
        gardes.forEach(function(l) {
          const ida = "s:" + l.id + ":a", idb = "s:" + l.id + ":b";
          nodes[ida] = { planId: l.a.planId, x: l.a.x, y: l.a.y, side: l.a, twinId: idb };
          nodes[idb] = { planId: l.b.planId, x: l.b.x, y: l.b.y, side: l.b, twinId: ida };
        });
      });
    });
    nodes["@start"] = { planId: planA, x: pos.x, y: pos.y, side: null, twinId: null };
    nodes["@dest"]  = { planId: dest.planId, x: dest.x, y: dest.y, side: null, twinId: null };

    // Dijkstra paresseux sur le graphe de portails
    const dist = { "@start": 0 };
    const prev = {};       // nodeId → { from, type: "leg"|"traverse", leg? }
    const done = {};
    const legCache = {};
    let legsComputed = 0, budgetDepasse = false;

    while (true) {
      let u = null, du = Infinity;
      Object.keys(dist).forEach(function(id) {
        if (!done[id] && dist[id] < du) { du = dist[id]; u = id; }
      });
      if (u === null || u === "@dest") break;
      done[u] = true;
      const nu = nodes[u];

      // Traversée du portail (0 m)
      if (nu.twinId && nodes[nu.twinId] && !done[nu.twinId]) {
        if (dist[nu.twinId] === undefined || du < dist[nu.twinId]) {
          dist[nu.twinId] = du;
          prev[nu.twinId] = { from: u, type: "traverse" };
        }
      }

      // Arêtes intra-plan (paresseuses) vers les autres nœuds du même plan
      const ctx = ctxs[nu.planId];
      if (!ctx) continue;
      const cibles = Object.keys(nodes);
      for (let i = 0; i < cibles.length; i++) {
        const v = cibles[i];
        if (v === u || v === "@start" || done[v]) continue;
        const nv = nodes[v];
        if (nv.planId !== nu.planId) continue;
        if (budgetDepasse) continue;
        // 🌀 v1.64.0 : les arêtes PARTANT du départ passent par les étapes
        // `via` du plan A (points de passage obligatoires, ordre planifié)
        const depuisStart = (u === "@start");
        const key = (depuisStart ? "@start|" : "") + nu.planId + "|" +
                    Math.round(nu.x) + "," + Math.round(nu.y) +
                    "|" + Math.round(nv.x) + "," + Math.round(nv.y);
        let leg = legCache[key];
        if (leg === undefined) {
          if (legsComputed >= MAX_LEGS_COMPUTE) { budgetDepasse = true; continue; }
          legsComputed++;
          try {
            leg = await _legEntre(ctx,
              { x: nu.x, y: nu.y, source: depuisStart ? "tracker" : "portal", label: "" },
              { x: nv.x, y: nv.y, source: "portal", label: "" },
              depuisStart ? via : null);
          } catch(e) { leg = null; }
          legCache[key] = leg;
        }
        if (!leg) continue;
        const nd = du + leg.distM;
        if (dist[v] === undefined || nd < dist[v]) {
          dist[v] = nd;
          prev[v] = { from: u, type: "leg", leg: leg };
        }
      }
    }

    if (dist["@dest"] === undefined) {
      let msg = _t("ipr.err.allFailed", { n: legsComputed });
      if (blocked.length > 0) msg += "\n" + _t("ipr.err.blocked", { plans: blocked.join(", ") });
      if (budgetDepasse)      msg += "\n" + _t("ipr.err.budget");
      throw _err("ALL_FAILED", msg);
    }
    console.log("[InterPlanRoute] Multi-hop : chemin trouvé (" + Math.round(dist["@dest"]) +
                " m, " + legsComputed + " Dijkstra(s) intra-plan)");

    // Reconstruction @start → @dest → legs par plan
    const ids = [];
    let cur = "@dest";
    while (cur) { ids.unshift(cur); cur = prev[cur] ? prev[cur].from : null; }

    const legs = [];
    let curLeg = null;
    for (let i = 1; i < ids.length; i++) {
      const pr = prev[ids[i]];
      const nFrom = nodes[ids[i - 1]], nTo = nodes[ids[i]];
      if (pr.type === "leg") {
        if (!curLeg) {
          const fromLabel = (ids[i - 1] === "@start")
            ? _t("iti.wp.currentPos", { x: Math.round(nFrom.x), y: Math.round(nFrom.y) })
            : "🌀 " + ((nFrom.side && nFrom.side.pointNom) || "");
          curLeg = {
            planId: nTo.planId, planName: ctxs[nTo.planId].planName,
            path: [], distM: 0, usedFallback: false,
            fromWp: { x: nFrom.x, y: nFrom.y, source: (ids[i - 1] === "@start") ? "tracker" : "portal", label: fromLabel }
          };
        }
        curLeg.path = curLeg.path.concat(pr.leg.path);
        curLeg.distM += pr.leg.distM;
        curLeg.usedFallback = curLeg.usedFallback || pr.leg.usedFallback;
        curLeg.toNode = nTo;
        curLeg.toId = ids[i];
      } else {
        // Traversée : clôt le leg courant, portalOut = côté sortie + entrée suivante
        const sortie = nFrom.side || {};
        const entree = nTo.side || {};
        curLeg.portalOut = {
          nom: sortie.pointNom || sortie.pointId || (Math.round(sortie.x) + "," + Math.round(sortie.y)),
          entree: {
            planId: nTo.planId,
            planName: (ctxs[nTo.planId] && ctxs[nTo.planId].planName) || nTo.planId,
            x: entree.x, y: entree.y, level: entree.level, tag: entree.tag,
            pointNom: entree.pointNom || ""
          }
        };
        curLeg.toWp = { x: nFrom.x, y: nFrom.y, source: "portal", label: "🌀 " + (sortie.pointNom || "") };
        legs.push(curLeg);
        curLeg = null;
      }
    }
    if (curLeg) {
      curLeg.toWp = { x: dest.x, y: dest.y, source: "search", label: dest.label || "" };
      curLeg.portalOut = null;
      legs.push(curLeg);
    }
    legs.forEach(function(l) {
      // 🌀 v1.64.0 : le 1er leg (départ tracker) intercale les étapes `via`
      // dans ses waypoints → l'itinéraire vivant peut les valider une à une.
      const inter = (l.fromWp.source === "tracker") ? _viaWps(via) : [];
      l.waypoints = [l.fromWp].concat(inter).concat([l.toWp]);
      delete l.fromWp; delete l.toWp; delete l.toNode; delete l.toId;
    });

    return { legs: legs, totalM: dist["@dest"], dest: dest };
  }

  // ---------------------------------------------------------------
  // CŒUR — calcul du meilleur itinéraire via portail
  // ---------------------------------------------------------------
  async function _compute(dest, via) {
    const planA = window._currentLoadedPlanId || null;
    if (!planA || !window.PLAN_CONFIG || !window.PLAN_CONFIG.plan) {
      throw _err("NO_PLAN", _t("ipr.err.noPlan"));
    }
    if (dest.planId === planA) throw _err("SAME_PLAN", _t("ipr.err.samePlan"));
    if (!window.Pathfinder || typeof window.Pathfinder.computeRouteOnRoads !== "function") {
      throw _err("NO_PLAN", _t("iti.err.pathfinder"));
    }

    const pos = (typeof window.getTrackingPosition === "function") ? window.getTrackingPosition() : null;
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
      throw _err("NO_POS", _t("iti.err.trackerPos"));
    }

    // 🌀 v1.64.0 — préférence multi-hop cochée → le moteur graphe de portails
    // remplace ENTIÈREMENT le single-hop (il couvre aussi le cas direct, en
    // optimal global toutes combinaisons de portails).
    if (_multiHopEnabled()) {
      return await _computeMultiHop(dest, pos, planA, via || []);
    }

    // 1) Portails candidats A ↔ B (registre, snapshots frais grâce à A5)
    const candidats = [];
    (window.InterPlanLinks.getLinksForPlan(planA) || []).forEach(function(l) {
      if (l.a && l.b && l.a.planId === planA && l.b.planId === dest.planId) {
        candidats.push({ link: l, sortieA: l.a, entreeB: l.b });
      } else if (l.a && l.b && l.b.planId === planA && l.a.planId === dest.planId) {
        candidats.push({ link: l, sortieA: l.b, entreeB: l.a });
      }
    });

    if (candidats.length === 0) {
      // 2:a — 1 hop max en V1, mais on INFORME si un chemin multi-plans existe
      const chemin = _cheminDePlans(planA, dest.planId);
      if (chemin && chemin.length > 2) {
        const viaId = chemin[1];
        const viaPlan = window.PlanRegistry ? window.PlanRegistry.findById(viaId) : null;
        // 🌀 v1.64.0 : le calcul multi-hop existe désormais — on indique la
        // case à cocher (recherche multi-plans) au lieu d'un simple constat.
        throw _err("NO_DIRECT_LINK", _t("ipr.err.noDirectLink", {
          plan: dest.planName || dest.planId,
          via: (viaPlan && viaPlan.name) || viaId
        }) + "\n" + _t("ipr.err.noDirectLinkHint"));
      }
      throw _err("NO_LINK", _t("ipr.err.noLink", { plan: dest.planName || dest.planId }));
    }

    // Tri par distance euclidienne départ → portail (les MAX_CANDIDATS plus proches)
    candidats.sort(function(c1, c2) {
      const d1 = Math.hypot(c1.sortieA.x - pos.x, c1.sortieA.y - pos.y);
      const d2 = Math.hypot(c2.sortieA.x - pos.x, c2.sortieA.y - pos.y);
      return d1 - d2;
    });
    const testes = candidats.slice(0, MAX_CANDIDATS);

    // 2) Données routing du plan B (roads + zones + scale) — lues à distance
    const planB = window.PlanRegistry ? window.PlanRegistry.findById(dest.planId) : null;
    if (!planB) throw _err("NO_LINK", _t("ipl.err.planAbsent", { plan: dest.planName || dest.planId }));
    const statsB = {};
    const routingB = await window.InterPlanLinks.collectRoutingDataForPlan(planB, statsB);
    if (statsB.dataError) {
      throw _err("DATA_UNREACHABLE", _t("ipr.err.dataUnreachable", { plan: planB.name || planB.id }));
    }
    if (!routingB.roads || routingB.roads.length === 0) {
      throw _err("NO_ROADS_B", _t("ipr.err.noRoadsB", { plan: planB.name || planB.id }));
    }

    // 3) Évitements par plan (6:a) — leg A : prefs du plan courant (via
    // computeRoute qui résout aussi les avoidTags) ; leg B : prefs du plan B,
    // résolues ICI (tags → points du plan B, types de zones → zones objets).
    const prefsA = _avoidPrefs(planA);
    const prefsB = _avoidPrefs(dest.planId);
    let avoidPtsB = prefsB.points.slice();
    if (prefsB.tags.length > 0) {
      try {
        const ptsB = await window.InterPlanLinks.collectPointsForPlan(planB);
        ptsB.forEach(function(p) {
          if (Array.isArray(p.tags) && p.tags.some(function(t) { return prefsB.tags.indexOf(t) >= 0; })) {
            avoidPtsB.push({ x: p.x, y: p.y, label: p.nom || p.id });
          }
        });
      } catch(e) { /* tags B non résolus → on continue avec points/zones */ }
    }
    const avoidZonesB = (routingB.zones || []).filter(function(z) {
      return z && z.type !== "inaccessible" && prefsB.zones.indexOf(z.type) >= 0;
    });

    const scaleA = (window.APP_CONFIG && window.APP_CONFIG.scale > 0) ? window.APP_CONFIG.scale : 1;
    const scaleB = (routingB.scale && routingB.scale > 0) ? routingB.scale : 1;

    // 4) Coût réel par candidat (3:a) — meilleur total en MÈTRES
    let best = null;
    const echecs = [];
    for (let i = 0; i < testes.length; i++) {
      const c = testes[i];
      const nomPortail = c.sortieA.pointNom || c.sortieA.pointId || (c.sortieA.x + "," + c.sortieA.y);
      let legA = null, legB = null;
      try {
        // 🌀 v1.64.0 : étapes `via` du plan A intercalées (ordre planifié)
        legA = await window.Pathfinder.computeRoute(
          [{ x: pos.x, y: pos.y, source: "tracker", label: _t("iti.wp.currentPos", { x: Math.round(pos.x), y: Math.round(pos.y) }) }]
            .concat(_viaWps(via))
            .concat([{ x: c.sortieA.x, y: c.sortieA.y, source: "portal", label: "🌀 " + nomPortail }]),
          { avoidPoints: prefsA.points, avoidTags: prefsA.tags,
            avoidZones: prefsA.zones, avoidRadius: prefsA.radius });
      } catch(eA) {
        echecs.push({ portail: nomPortail, cote: "A", msg: eA.message || String(eA) });
        continue;
      }
      try {
        legB = window.Pathfinder.computeRouteOnRoads(
          [{ x: c.entreeB.x, y: c.entreeB.y, source: "portal", label: "🌀" },
           { x: dest.x, y: dest.y, source: "search", label: dest.label || "" }],
          routingB.roads,
          { zones: routingB.zones, avoidPoints: avoidPtsB,
            avoidZonesResolved: avoidZonesB, avoidRadius: prefsB.radius });
      } catch(eB) {
        echecs.push({ portail: nomPortail, cote: "B", msg: eB.message || String(eB) });
        continue;
      }
      const totalM = (legA.totalDistance / scaleA) + (legB.totalDistance / scaleB);
      if (!best || totalM < best.totalM) {
        best = {
          portal: c, legA: legA, legB: legB,
          distAM: legA.totalDistance / scaleA,
          distBM: legB.totalDistance / scaleB,
          totalM: totalM,
          nomPortail: nomPortail
        };
      }
    }

    if (!best) {
      const detail = echecs.map(function(e) {
        return "🌀 " + e.portail + " — " + (e.cote === "A" ? _t("ipr.err.legA") : _t("ipr.err.legB", { plan: planB.name || planB.id }));
      }).join("\n");
      throw _err("ALL_FAILED", _t("ipr.err.allFailed", { n: testes.length }) + "\n" + detail);
    }
    best.planB = planB;
    best.dest = dest;
    return best;
  }

  // ---------------------------------------------------------------
  // RENDU — chaîne de legs (🌀 v1.64.0 : généralisé multi-hop)
  // ---------------------------------------------------------------
  // _pendingChain = FILE des legs restants après le leg courant (RAM only).
  // Chaque leg : { planId, planName, path, distM, waypoints, portalOut }
  // portalOut = { nom, entree: {planId, planName, x, y, level, tag, pointNom} }
  // (null sur le dernier leg = destination atteinte).
  let _pendingChain = null;
  // 🌀 v1.64.0 (KARMA « prendre le portail n'a pas de sens, on n'est pas à
  // côté ») : le portail de SORTIE du plan courant, armé par « C'est parti »
  // et à chaque arrivée intermédiaire. Sert à re-proposer la traversée quand
  // l'user est physiquement au portail (« 📍 Je suis ici » sur le point).
  // { planId, sortie:{x,y}, portalOut, nextDistM }
  let _currentPortalOut = null;

  function _tracerItinerary(path, waypoints) {
    if (!window.getRoads || !window.setRoads) return;
    const roads = window.getRoads().filter(function(r) { return r.type !== "itinerary"; });
    roads.push({ type: "itinerary", points: path, waypoints: waypoints || [] });
    window.setRoads(roads);
  }

  // Adapte le résultat single-hop historique (préférence multi-hop OFF) au
  // format chaîne — UN SEUL renderer/consommateur pour les deux moteurs.
  // 🌀 v1.64.0 : `via` = étapes du plan A, intercalées dans les waypoints du
  // leg 0 (→ validation d'étapes par l'itinéraire vivant).
  function _chainDepuisSingleHop(res, via) {
    const planA = window._currentLoadedPlanId;
    const nomA = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || planA;
    return {
      dest: res.dest,
      totalM: res.totalM,
      legs: [
        {
          planId: planA, planName: nomA,
          path: res.legA.path, distM: res.distAM, usedFallback: !!res.legA.usedFallback,
          waypoints: [{ x: 0, y: 0, source: "tracker", label: "" }]
            .concat(_viaWps(via))
            .concat([{ x: res.portal.sortieA.x, y: res.portal.sortieA.y, source: "portal", label: "🌀 " + res.nomPortail }]),
          portalOut: {
            nom: res.nomPortail,
            entree: {
              planId: res.planB.id, planName: res.planB.name || res.planB.id,
              x: res.portal.entreeB.x, y: res.portal.entreeB.y,
              level: res.portal.entreeB.level, tag: res.portal.entreeB.tag,
              pointNom: res.portal.entreeB.pointNom || ""
            }
          }
        },
        {
          planId: res.planB.id, planName: res.planB.name || res.planB.id,
          path: res.legB.path, distM: res.distBM, usedFallback: !!res.legB.usedFallback,
          waypoints: [
            { x: res.portal.entreeB.x, y: res.portal.entreeB.y, source: "portal", label: "🌀 " + (res.portal.entreeB.pointNom || "") },
            { x: res.dest.x, y: res.dest.y, source: "search", label: res.dest.label || "" }
          ],
          portalOut: null
        }
      ]
    };
  }

  // Arme le portail de sortie du plan courant (invite flottante + re-proposition
  // au « je suis ici » sur le point-portail)
  function _armerPortailCourant(leg, nextDistM) {
    if (!leg || !leg.portalOut) { _currentPortalOut = null; return; }
    _currentPortalOut = {
      planId: leg.planId,
      sortie: leg.waypoints[leg.waypoints.length - 1],
      portalOut: leg.portalOut,
      nextDistM: nextDistM || 0
    };
    _afficherProchainPortail(leg.portalOut, _currentPortalOut.nextDistM);
  }

  // Prend le prochain portail de la chaîne : goTo + recale (traversée physique)
  function _prendrePortail(portalOut) {
    _retirerProchainPortail();
    _currentPortalOut = null;
    window.InterPlanLinks.goTo(portalOut.entree.planId, {
      x: portalOut.entree.x, y: portalOut.entree.y,
      level: portalOut.entree.level, tag: portalOut.entree.tag,
      planName: portalOut.entree.planName,
      label: portalOut.entree.pointNom || ""
    }, { confirm: false, recalerTracker: true });   // 🆕 v1.61.0 : traversée physique → tracker recalé
  }

  // 🌀 v1.64.0 (3:a) — invite flottante « Portail suivant » après chaque
  // arrivée intermédiaire (au-dessus du bouton ↩️ Retour, pas de timer :
  // une navigation est en cours, l'invite reste jusqu'au clic ou ✕).
  function _afficherProchainPortail(portalOut, distNextM) {
    _retirerProchainPortail();
    const div = document.createElement("div");
    div.id = "kta-ipr-next-float";
    div.className = "kta-ipr-next-float";
    div.innerHTML =
      '<button class="kta-ipr-next-main" type="button">🌀 ' +
        _esc(_t("ipr.next.btn", { plan: portalOut.entree.planName, dist: _fmtDist(distNextM || 0) })) +
      '</button>' +
      '<button class="kta-ipr-next-close" type="button" title="' + _esc(_t("ipr.next.closeTitle")) + '">✕</button>';
    document.body.appendChild(div);
    div.querySelector(".kta-ipr-next-main").addEventListener("click", function() {
      _prendrePortail(portalOut);
    });
    div.querySelector(".kta-ipr-next-close").addEventListener("click", _retirerProchainPortail);
  }
  function _retirerProchainPortail() {
    const el = document.getElementById("kta-ipr-next-float");
    if (el) el.remove();
  }

  function _afficherResume(chain) {
    // Étapes : Rejoindre portail (step1) · Traverser (step2) · … · Destination (step3)
    let num = 0;
    const CERCLES = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
    function _cercle() { return CERCLES[num++] || "•"; }
    let stepsHtml = "";
    let anyFallback = false;
    chain.legs.forEach(function(leg, i) {
      anyFallback = anyFallback || leg.usedFallback;
      if (leg.portalOut) {
        stepsHtml += '<div class="kta-ipr-step">' + _cercle() + ' ' +
          _esc(_t("ipr.result.step1", { portail: leg.portalOut.nom, dist: _fmtDist(leg.distM) })) + '</div>';
        stepsHtml += '<div class="kta-ipr-step">' + _cercle() + ' ' +
          _esc(_t("ipr.result.step2", { plan: leg.portalOut.entree.planName })) + '</div>';
      } else {
        stepsHtml += '<div class="kta-ipr-step">' + _cercle() + ' ' +
          _esc(_t("ipr.result.step3", { dest: chain.dest.label || "", dist: _fmtDist(leg.distM) })) + '</div>';
      }
    });

    const overlay = document.createElement("div");
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-modal" style="max-width:440px;">' +
        '<div class="kta-modal-icon" style="color:#8cb4ff;">🧭</div>' +
        '<div class="kta-modal-titre">' + _esc(_t("ipr.result.titre")) + '</div>' +
        '<div class="kta-modal-texte" style="text-align:left;">' +
          stepsHtml +
          '<div class="kta-ipr-total">' + _esc(_t("ipr.result.total", { dist: _fmtDist(chain.totalM) })) + '</div>' +
          (anyFallback
            ? '<div style="font-size:12px; color:#ff9933; margin-top:6px;">' + _esc(_t("ipr.result.fallback")) + '</div>' : '') +
          '<div style="font-size:12px; color:#8892a4; margin-top:8px;">' + _esc(_t("ipr.result.hint")) + '</div>' +
        '</div>' +
        '<div class="kta-modal-actions">' +
          '<button class="kta-btn kta-btn-ghost" id="kta-ipr-close" type="button">' + _esc(_t("ui.btn.cancel")) + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-ipr-take" type="button">🗺️ ' + _esc(_t("ipr.result.go")) + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    document.getElementById("kta-ipr-close").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
    document.getElementById("kta-ipr-take").addEventListener("click", function() {
      overlay.remove();
      // 🌀 v1.64.0 (KARMA) : PLUS de téléportation au calcul — le leg A est
      // tracé, la file est armée, et l'user MARCHE. La traversée se fait
      // quand il est au portail : invite flottante « 🌀 Portail suivant »
      // (persistante, fermable), bouton ➜ du popup du point-portail, ou
      // « 📍 Je suis ici » sur le point-portail qui re-propose l'invite.
      _pendingChain = chain.legs.slice(1);
      _armerPortailCourant(chain.legs[0], chain.legs[1] ? chain.legs[1].distM : 0);
    });
  }

  // Entrée principale : calcule (spinner) puis affiche. Les erreurs codées
  // sortent en modale d'information claire (exigence KARMA).
  async function computeEtAfficher(dest, opts) {
    opts = opts || {};
    // 🌀 v1.64.0 : étapes du plan A à visiter AVANT le portail (modale Itinéraire)
    const via = Array.isArray(opts.viaWaypoints) ? opts.viaWaypoints : [];
    let res;
    try {
      const doCompute = function() { return _compute(dest, via); };
      res = (window.ComputeLoader && window.ComputeLoader.wrap)
        ? await window.ComputeLoader.wrap(doCompute, _t("ipr.compute.loading"))
        : await doCompute();
    } catch(e) {
      _afficherErreur(e);
      return;
    }
    // 🌀 v1.64.0 : format unique « chaîne de legs » (le single-hop est adapté)
    const chain = res.legs ? res : _chainDepuisSingleHop(res, via);
    _pendingChain = null;          // reset d'une éventuelle navigation précédente
    _currentPortalOut = null;
    _retirerProchainPortail();
    // Trace le 1er leg (remplace l'itinéraire actif — même sémantique que
    // « Y aller ») + flash sur le portail à rejoindre.
    const leg0 = chain.legs[0];
    _tracerItinerary(leg0.path, leg0.waypoints);
    try {
      const cible = leg0.waypoints[1];
      const latlng = window.convertCoord(cible.x, cible.y);
      const flash = L.circleMarker(latlng, { radius: 24, color: "#8cb4ff", fillColor: "#8cb4ff",
        fillOpacity: 0, weight: 3, opacity: 0.9, interactive: false }).addTo(window.map);
      setTimeout(function() { try { window.map.removeLayer(flash); } catch(e) {} }, 3500);
    } catch(e) {}
    _afficherResume(chain);
  }

  function _afficherErreur(e) {
    const overlay = document.createElement("div");
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.style.zIndex = "100002";
    overlay.innerHTML =
      '<div class="kta-modal" style="max-width:420px;">' +
        '<div class="kta-modal-icon" style="color:#ff9933;">🧭</div>' +
        '<div class="kta-modal-titre">' + _esc(_t("ipr.err.titre")) + '</div>' +
        '<div class="kta-modal-texte" style="white-space:pre-line;">' + _esc(e.message || String(e)) + '</div>' +
        '<div class="kta-modal-actions">' +
          '<button class="kta-btn kta-btn-primary" id="kta-ipr-err-ok" type="button">OK</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    document.getElementById("kta-ipr-err-ok").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(ev) { if (ev.target === overlay) overlay.remove(); });
    console.warn("[InterPlanRoute] " + (e.code || "ERR") + " :", e.message);
  }

  // ---------------------------------------------------------------
  // Consommation de la CHAÎNE à chaque arrivée de portail (4:a + 🌀 v1.64.0)
  // ---------------------------------------------------------------
  // Appelé par main.js (fin de lancerApplication). Différé APRÈS le restore
  // de session (qui ÉCRASE les roads) — même fenêtre que la triple passe de
  // navigation (~2.6 s) + petite marge. À chaque plan atteint : le leg de CE
  // plan est tracé, puis s'il reste des plans à traverser, l'invite
  // « 🌀 Portail suivant » est proposée (3:a — zéro ressaisie).
  function onPlanLoaded() {
    _retirerProchainPortail();   // invite du plan précédent obsolète
    if (!_pendingChain || _pendingChain.length === 0) return;
    const head = _pendingChain[0];
    if ((window._currentLoadedPlanId || null) !== head.planId) return;   // autre plan → on garde
    _pendingChain = _pendingChain.slice(1);
    const reste = _pendingChain;
    setTimeout(function() {
      try {
        _tracerItinerary(head.path, head.waypoints);
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(_t("ipr.toast.legTraced", {
            dest: (head.waypoints[1] && head.waypoints[1].label) || "",
            dist: _fmtDist(head.distM)
          }), "info");
        }
        if (head.portalOut && reste.length > 0) {
          _armerPortailCourant(head, reste[0].distM);
        } else {
          _currentPortalOut = null;   // dernier leg : destination atteinte
        }
      } catch(e) { console.warn("[InterPlanRoute] tracé leg échoué :", e); }
    }, 3000);
  }

  // 🌀 v1.64.0 (2:a) — « 📍 Je suis ici » sur le point-portail de sortie du
  // plan courant → re-propose la traversée (l'invite a pu être fermée).
  // Appelé par tracking.js > _notifierRecalage, après le hook itinéraire.
  function onTrackerRecale(x, y, source) {
    if (source !== "point" || !_currentPortalOut) return;
    if ((window._currentLoadedPlanId || null) !== _currentPortalOut.planId) return;
    const s = _currentPortalOut.sortie;
    if (s && Math.round(s.x) === Math.round(x) && Math.round(s.y) === Math.round(y)) {
      _afficherProchainPortail(_currentPortalOut.portalOut, _currentPortalOut.nextDistM);
    }
  }

  window.InterPlanRoute = {
    computeEtAfficher:   computeEtAfficher,
    onPlanLoaded:        onPlanLoaded,
    onTrackerRecale:     onTrackerRecale,
    // 🌀 v1.64.0 — préférence multi-hop (case à cocher recherche multi-plans)
    isMultiHopEnabled:   _multiHopEnabled,
    setMultiHopEnabled:  _setMultiHopEnabled
  };

  console.log("[InterPlanRoute] Module chargé");
})();
