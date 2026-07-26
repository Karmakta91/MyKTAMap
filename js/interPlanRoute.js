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

  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }
  function _esc(s) {
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
  // CŒUR — calcul du meilleur itinéraire via portail
  // ---------------------------------------------------------------
  async function _compute(dest) {
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
        throw _err("NO_DIRECT_LINK", _t("ipr.err.noDirectLink", {
          plan: dest.planName || dest.planId,
          via: (viaPlan && viaPlan.name) || viaId
        }));
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
        legA = await window.Pathfinder.computeRoute(
          [{ x: pos.x, y: pos.y, source: "tracker", label: _t("iti.wp.currentPos", { x: Math.round(pos.x), y: Math.round(pos.y) }) },
           { x: c.sortieA.x, y: c.sortieA.y, source: "portal", label: "🌀 " + nomPortail }],
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
  // RENDU — leg A tracé + modale résumé + pendingRoute (4:a)
  // ---------------------------------------------------------------
  let _pendingRoute = null;   // { planId, path, destLabel, distM } — RAM only

  function _tracerItinerary(path, waypoints) {
    if (!window.getRoads || !window.setRoads) return;
    const roads = window.getRoads().filter(function(r) { return r.type !== "itinerary"; });
    roads.push({ type: "itinerary", points: path, waypoints: waypoints || [] });
    window.setRoads(roads);
  }

  function _afficherResume(res) {
    const overlay = document.createElement("div");
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-modal" style="max-width:440px;">' +
        '<div class="kta-modal-icon" style="color:#8cb4ff;">🧭</div>' +
        '<div class="kta-modal-titre">' + _esc(_t("ipr.result.titre")) + '</div>' +
        '<div class="kta-modal-texte" style="text-align:left;">' +
          '<div class="kta-ipr-step">① ' + _esc(_t("ipr.result.step1", { portail: res.nomPortail, dist: _fmtDist(res.distAM) })) + '</div>' +
          '<div class="kta-ipr-step">② ' + _esc(_t("ipr.result.step2", { plan: res.planB.name || res.planB.id })) + '</div>' +
          '<div class="kta-ipr-step">③ ' + _esc(_t("ipr.result.step3", { dest: res.dest.label || "", dist: _fmtDist(res.distBM) })) + '</div>' +
          '<div class="kta-ipr-total">' + _esc(_t("ipr.result.total", { dist: _fmtDist(res.totalM) })) + '</div>' +
          ((res.legA.usedFallback || res.legB.usedFallback)
            ? '<div style="font-size:12px; color:#ff9933; margin-top:6px;">' + _esc(_t("ipr.result.fallback")) + '</div>' : '') +
          '<div style="font-size:12px; color:#8892a4; margin-top:8px;">' + _esc(_t("ipr.result.hint")) + '</div>' +
        '</div>' +
        '<div class="kta-modal-actions">' +
          '<button class="kta-btn kta-btn-ghost" id="kta-ipr-close" type="button">' + _esc(_t("ui.btn.cancel")) + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-ipr-take" type="button">🌀 ' + _esc(_t("ipr.result.takePortal")) + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    document.getElementById("kta-ipr-close").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
    document.getElementById("kta-ipr-take").addEventListener("click", function() {
      overlay.remove();
      // 4:a — pose le leg B en attente PUIS traverse (goTo sans re-confirm :
      // l'user vient de valider ce résumé).
      _pendingRoute = {
        planId: res.planB.id,
        path: res.legB.path,
        destLabel: res.dest.label || "",
        distM: res.distBM,
        waypoints: [
          { x: res.portal.entreeB.x, y: res.portal.entreeB.y, source: "portal", label: "🌀 " + (res.portal.entreeB.pointNom || "") },
          { x: res.dest.x, y: res.dest.y, source: "search", label: res.dest.label || "" }
        ]
      };
      window.InterPlanLinks.goTo(res.planB.id, {
        x: res.portal.entreeB.x, y: res.portal.entreeB.y,
        level: res.portal.entreeB.level, tag: res.portal.entreeB.tag,
        planName: res.planB.name || res.planB.id,
        label: res.portal.entreeB.pointNom || ""
      }, { confirm: false });
    });
  }

  // Entrée principale : calcule (spinner) puis affiche. Les erreurs codées
  // sortent en modale d'information claire (exigence KARMA).
  async function computeEtAfficher(dest) {
    let res;
    try {
      const doCompute = function() { return _compute(dest); };
      res = (window.ComputeLoader && window.ComputeLoader.wrap)
        ? await window.ComputeLoader.wrap(doCompute, _t("ipr.compute.loading"))
        : await doCompute();
    } catch(e) {
      _afficherErreur(e);
      return;
    }
    // Trace le leg A (remplace l'itinéraire actif — même sémantique que
    // « Y aller ») + flash sur le portail à rejoindre.
    _tracerItinerary(res.legA.path, [
      { x: 0, y: 0, source: "tracker", label: "" },
      { x: res.portal.sortieA.x, y: res.portal.sortieA.y, source: "portal", label: "🌀 " + res.nomPortail }
    ]);
    try {
      const latlng = window.convertCoord(res.portal.sortieA.x, res.portal.sortieA.y);
      const flash = L.circleMarker(latlng, { radius: 24, color: "#8cb4ff", fillColor: "#8cb4ff",
        fillOpacity: 0, weight: 3, opacity: 0.9, interactive: false }).addTo(window.map);
      setTimeout(function() { try { window.map.removeLayer(flash); } catch(e) {} }, 3500);
    } catch(e) {}
    _afficherResume(res);
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
  // Consommation du leg B à l'arrivée sur le plan cible (4:a)
  // ---------------------------------------------------------------
  // Appelé par main.js (fin de lancerApplication). Différé APRÈS le restore
  // de session (qui ÉCRASE les roads) — même fenêtre que la triple passe de
  // navigation (~2.6 s) + petite marge.
  function onPlanLoaded() {
    if (!_pendingRoute) return;
    const pr = _pendingRoute;
    if ((window._currentLoadedPlanId || null) !== pr.planId) return;   // autre plan → on garde
    _pendingRoute = null;
    setTimeout(function() {
      try {
        _tracerItinerary(pr.path, pr.waypoints);
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(_t("ipr.toast.legTraced", { dest: pr.destLabel, dist: _fmtDist(pr.distM) }), "info");
        }
      } catch(e) { console.warn("[InterPlanRoute] tracé leg B échoué :", e); }
    }, 3000);
  }

  window.InterPlanRoute = {
    computeEtAfficher: computeEtAfficher,
    onPlanLoaded:      onPlanLoaded
  };

  console.log("[InterPlanRoute] Module chargé");
})();
