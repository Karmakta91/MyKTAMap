/*!
 * MyKTAMap — Vue « réseau de plans » (v1.65.0 — A7)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// PLANNETWORK.JS — Graphe visuel de la bibliothèque (A7)
// =========================
// Plans = nœuds, portails = arêtes (épaisseur = nb de liaisons entre les
// 2 plans). Rendu SVG vanilla (zéro lib), layout force PRÉCALCULÉ (~150
// itérations à l'ouverture, aucune animation continue = zéro coût batterie),
// nœuds déplaçables au pointeur. Décisions KARMA (reco A7 1:a 2:a 3:a 4:a) :
//   - Vue intégrée au gestionnaire « 🌀 Mes liaisons » (toggle Liste ⇄ Graphe)
//   - Clic nœud = ouvrir le plan (pipeline goTo — confirmation si plan chargé)
//   - Clic arête = détail de la frontière (le gestionnaire filtre sa liste)
//   - Nœud = pastille + nom + badges de mode + compteur de liaisons
//
// Données : PlanRegistry.getAll() (nœuds) + InterPlanLinks.getAllLinks()
// (arêtes). Les plans référencés par une liaison mais ABSENTS du registre
// deviennent des nœuds « fantômes » ⛔ (nom issu du snapshot de liaison).
// Les plans sans aucune liaison sont rangés dans une bande dédiée en bas.
//
// API : window.PlanNetwork.render(containerEl, {
//   onOpenPlan(planId, anchorSide|null),   // clic nœud présent
//   onEdgeClick(planIdA, planIdB)          // clic arête (détail frontière)
// })
// 100 % local — aucun réseau.
// =========================

(function() {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const NODE_R = 22;               // rayon pastille
  const ITERATIONS = 150;          // itérations du layout force (précalculé)
  const SPRING_LEN = 150;          // longueur de repos des arêtes (px)
  const REPULSE_K = 26000;         // constante de répulsion entre nœuds
  // Bande « plans isolés » : séparateur+titre puis rangées de pastilles.
  // 🐛 v1.65.0 (KARMA « le titre est trop proche de l'icône ») : la pastille
  // s'étend de -R au-dessus de son centre et nom+badges descendent à +47 —
  // le centre de rangée doit laisser ~30px au titre et chaque rangée ~70px.
  const ISO_TITLE_H = 30;          // hauteur séparateur + titre
  const ISO_ROW_H   = 70;          // hauteur d'une rangée de plans isolés

  function _t(k, p) {
    return (window.I18n && typeof window.I18n.t === "function") ? window.I18n.t(k, p) : k;
  }

  // ---------------------------------------------------------------
  // DONNÉES → nœuds + arêtes
  // ---------------------------------------------------------------
  function _collecter() {
    const nodes = {};   // planId → { id, name, present, badges, linkCount, anchorSide }
    const plans = (window.PlanRegistry && window.PlanRegistry.getAll)
      ? (window.PlanRegistry.getAll() || []) : [];
    plans.forEach(function(p) {
      if (!p || !p.id) return;
      const badges = [];
      if (p.tiledV2 === true)   badges.push("V2");
      if (p.multiLevel === true) badges.push("M-LVL");
      nodes[p.id] = { id: p.id, name: p.name || p.id, present: true,
                      badges: badges, linkCount: 0, anchorSide: null };
    });

    const edges = {};   // "idMin|idMax" → { a, b, count, }
    const links = (window.InterPlanLinks && window.InterPlanLinks.getAllLinks)
      ? (window.InterPlanLinks.getAllLinks() || []) : [];
    links.forEach(function(l) {
      if (!l || !l.a || !l.b || !l.a.planId || !l.b.planId) return;
      if (l.a.planId === l.b.planId) return;
      [l.a, l.b].forEach(function(side) {
        if (!nodes[side.planId]) {
          // Plan absent du registre → nœud fantôme ⛔ (nom du snapshot)
          nodes[side.planId] = { id: side.planId, name: side.planName || side.planId,
                                 present: false, badges: [], linkCount: 0, anchorSide: null };
        }
      });
      nodes[l.a.planId].linkCount++;
      nodes[l.b.planId].linkCount++;
      // Point d'ancrage pour « ouvrir le plan » : premier côté de liaison
      // rencontré sur ce plan (l'arrivée sur un portail est un repère utile)
      if (!nodes[l.a.planId].anchorSide) nodes[l.a.planId].anchorSide = l.a;
      if (!nodes[l.b.planId].anchorSide) nodes[l.b.planId].anchorSide = l.b;
      const key = (l.a.planId < l.b.planId)
        ? l.a.planId + "|" + l.b.planId
        : l.b.planId + "|" + l.a.planId;
      if (!edges[key]) edges[key] = { a: (l.a.planId < l.b.planId) ? l.a.planId : l.b.planId,
                                      b: (l.a.planId < l.b.planId) ? l.b.planId : l.a.planId,
                                      count: 0 };
      edges[key].count++;
    });

    return {
      linked:   Object.values(nodes).filter(function(n) { return n.linkCount > 0; }),
      isolated: Object.values(nodes).filter(function(n) { return n.linkCount === 0; }),
      edges:    Object.values(edges)
    };
  }

  // ---------------------------------------------------------------
  // LAYOUT FORCE (précalculé, pas d'animation)
  // ---------------------------------------------------------------
  function _layout(nodes, edges, W, H) {
    const n = nodes.length;
    if (n === 0) return;
    // Init en cercle (déterministe : pas de Math.random → rendu stable)
    nodes.forEach(function(nd, i) {
      const a = (2 * Math.PI * i) / n;
      nd.x = W / 2 + Math.cos(a) * Math.min(W, H) * 0.30;
      nd.y = H / 2 + Math.sin(a) * Math.min(W, H) * 0.30;
    });
    if (n === 1) { nodes[0].x = W / 2; nodes[0].y = H / 2; return; }
    const byId = {};
    nodes.forEach(function(nd) { byId[nd.id] = nd; });

    for (let it = 0; it < ITERATIONS; it++) {
      const cool = 1 - it / ITERATIONS;           // refroidissement linéaire
      // Répulsion entre toutes les paires
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        let fx = 0, fy = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { d2 = 1; dx = 1; dy = 0; }
          const f = REPULSE_K / d2;
          const d = Math.sqrt(d2);
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        }
        // Gravité douce vers le centre
        fx += (W / 2 - a.x) * 0.02;
        fy += (H / 2 - a.y) * 0.02;
        a._fx = fx; a._fy = fy;
      }
      // Ressorts sur les arêtes
      edges.forEach(function(e) {
        const a = byId[e.a], b = byId[e.b];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const f = (d - SPRING_LEN) * 0.06;
        const ux = dx / d, uy = dy / d;
        a._fx += ux * f; a._fy += uy * f;
        b._fx -= ux * f; b._fy -= uy * f;
      });
      // Application (amortie + clamp dans la boîte)
      const MARGIN = NODE_R + 14;
      nodes.forEach(function(nd) {
        nd.x = Math.max(MARGIN, Math.min(W - MARGIN, nd.x + nd._fx * 0.02 * cool));
        nd.y = Math.max(MARGIN + 10, Math.min(H - MARGIN - 16, nd.y + nd._fy * 0.02 * cool));
      });
    }
  }

  // ---------------------------------------------------------------
  // RENDU SVG
  // ---------------------------------------------------------------
  function _el(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function(k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function render(containerEl, callbacks) {
    callbacks = callbacks || {};
    containerEl.innerHTML = "";
    const data = _collecter();

    if (data.linked.length === 0 && data.isolated.length === 0) {
      containerEl.innerHTML = '<p class="kta-ipl-empty">' + _t("pnet.empty") + '</p>';
      return;
    }

    const W = Math.max(320, containerEl.clientWidth || 560);
    const hasIsolated = data.isolated.length > 0;
    const graphH = (data.linked.length > 0) ? Math.max(300, Math.min(460, 200 + data.linked.length * 34)) : 0;
    // 🐛 v1.65.0 : la hauteur compte TOUTES les rangées d'isolés (avant :
    // une seule → 2e rangée coupée en bas)
    const perRow  = Math.max(1, Math.floor(W / 130));
    const isoRows = hasIsolated ? Math.ceil(data.isolated.length / perRow) : 0;
    const H = graphH + (hasIsolated ? ISO_TITLE_H + isoRows * ISO_ROW_H + 10 : 0);

    _layout(data.linked, data.edges, W, graphH || 1);

    // Bande « plans isolés » en bas — centres de rangée SOUS le titre
    if (hasIsolated) {
      data.isolated.forEach(function(nd, i) {
        // 🐛 v1.77.0 (KARMA « la deuxième colonne, les titres sortent du
        // cadre ») — marges SYMÉTRIQUES : l'ancien pas (W-110) posait la
        // dernière colonne à x = W-40, et le nom centré (jusqu'à ~100 px de
        // large) débordait du viewBox à droite. W-140 → dernière colonne à
        // W-70, même marge que la première.
        nd.x = 70 + (i % perRow) * ((W - 140) / Math.max(1, perRow - 1) || 0);
        if (perRow === 1) nd.x = W / 2;
        nd.y = graphH + ISO_TITLE_H + 28 + Math.floor(i / perRow) * ISO_ROW_H;
      });
    }

    const svg = _el("svg", {
      class: "kta-pnet-svg",
      viewBox: "0 0 " + W + " " + H,
      width: "100%",
      height: H
    });

    const byId = {};
    data.linked.concat(data.isolated).forEach(function(nd) { byId[nd.id] = nd; });

    // --- Arêtes (dessous) + zone de clic élargie
    const edgeLayer = _el("g", {});
    svg.appendChild(edgeLayer);
    data.edges.forEach(function(e) {
      const a = byId[e.a], b = byId[e.b];
      if (!a || !b) return;
      const width = Math.min(1.5 + e.count, 5.5);
      const line = _el("line", {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        class: "kta-pnet-edge", "stroke-width": width
      });
      const hit = _el("line", {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        class: "kta-pnet-edge-hit", "stroke-width": 16
      });
      hit.addEventListener("click", function() {
        if (typeof callbacks.onEdgeClick === "function") callbacks.onEdgeClick(e.a, e.b);
      });
      const title = _el("title", {});
      title.textContent = _t("pnet.edgeTitle", { n: e.count });
      hit.appendChild(title);
      e._line = line; e._hit = hit;
      edgeLayer.appendChild(line);
      edgeLayer.appendChild(hit);
      if (e.count > 1) {
        const lbl = _el("text", {
          x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 5,
          class: "kta-pnet-edge-count"
        });
        lbl.textContent = String(e.count);
        e._lbl = lbl;
        edgeLayer.appendChild(lbl);
      }
    });

    // Séparateur + titre de la bande isolés
    if (hasIsolated && data.linked.length > 0) {
      svg.appendChild(_el("line", {
        x1: 12, y1: graphH + 6, x2: W - 12, y2: graphH + 6, class: "kta-pnet-sep"
      }));
      const t = _el("text", { x: 16, y: graphH + 22, class: "kta-pnet-sep-titre" });
      t.textContent = _t("pnet.isolated");
      svg.appendChild(t);
    }

    // --- Nœuds
    const currentId = window._currentLoadedPlanId || null;
    const nodeLayer = _el("g", {});
    svg.appendChild(nodeLayer);
    data.linked.concat(data.isolated).forEach(function(nd) {
      const g = _el("g", {
        class: "kta-pnet-node" + (nd.present ? "" : " kta-pnet-node-absent"),
        transform: "translate(" + nd.x + "," + nd.y + ")"
      });
      if (nd.id === currentId) {
        g.appendChild(_el("circle", { r: NODE_R + 4, class: "kta-pnet-ring" }));
      }
      g.appendChild(_el("circle", { r: NODE_R, class: "kta-pnet-disc" }));
      const ico = _el("text", { y: 1, class: "kta-pnet-ico" });
      ico.textContent = nd.present ? "🗺️" : "⛔";
      g.appendChild(ico);
      if (nd.linkCount > 0) {
        const badge = _el("g", { transform: "translate(" + (NODE_R - 4) + "," + (-NODE_R + 4) + ")" });
        badge.appendChild(_el("circle", { r: 8, class: "kta-pnet-count-disc" }));
        const ct = _el("text", { y: 1, class: "kta-pnet-count" });
        ct.textContent = String(nd.linkCount);
        badge.appendChild(ct);
        g.appendChild(badge);
      }
      const name = _el("text", { y: NODE_R + 13, class: "kta-pnet-name" });
      name.textContent = (nd.name.length > 20) ? nd.name.slice(0, 19) + "…" : nd.name;
      g.appendChild(name);
      if (nd.badges.length > 0) {
        const bt = _el("text", { y: NODE_R + 25, class: "kta-pnet-badges" });
        bt.textContent = nd.badges.join(" · ");
        g.appendChild(bt);
      }
      const title = _el("title", {});
      title.textContent = nd.present
        ? nd.name + " — " + _t("pnet.openTitle")
        : nd.name + " — " + _t("pnet.absentTitle");
      g.appendChild(title);

      // Drag (pointer events) + clic (si pas de drag significatif)
      let drag = null;
      g.addEventListener("pointerdown", function(ev) {
        ev.preventDefault();
        const pt = _svgPoint(svg, ev);
        drag = { dx: pt.x - nd.x, dy: pt.y - nd.y, moved: false, sx: ev.clientX, sy: ev.clientY };
        g.setPointerCapture(ev.pointerId);
      });
      g.addEventListener("pointermove", function(ev) {
        if (!drag) return;
        if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 6) drag.moved = true;
        if (!drag.moved) return;
        const pt = _svgPoint(svg, ev);
        nd.x = pt.x - drag.dx;
        nd.y = pt.y - drag.dy;
        g.setAttribute("transform", "translate(" + nd.x + "," + nd.y + ")");
        // Arêtes connectées suivent
        data.edges.forEach(function(e) {
          if (e.a !== nd.id && e.b !== nd.id) return;
          const a = byId[e.a], b = byId[e.b];
          [e._line, e._hit].forEach(function(ln) {
            if (!ln) return;
            ln.setAttribute("x1", a.x); ln.setAttribute("y1", a.y);
            ln.setAttribute("x2", b.x); ln.setAttribute("y2", b.y);
          });
          if (e._lbl) {
            e._lbl.setAttribute("x", (a.x + b.x) / 2);
            e._lbl.setAttribute("y", (a.y + b.y) / 2 - 5);
          }
        });
      });
      g.addEventListener("pointerup", function(ev) {
        const wasClick = drag && !drag.moved;
        drag = null;
        try { g.releasePointerCapture(ev.pointerId); } catch(e2) {}
        if (wasClick && nd.present && typeof callbacks.onOpenPlan === "function") {
          callbacks.onOpenPlan(nd.id, nd.anchorSide);
        }
      });
      nodeLayer.appendChild(g);
    });

    containerEl.appendChild(svg);
  }

  // Coordonnées pointeur → repère SVG (viewBox)
  function _svgPoint(svg, ev) {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return {
      x: (ev.clientX - r.left) * (vb.width / r.width),
      y: (ev.clientY - r.top) * (vb.height / r.height)
    };
  }

  window.PlanNetwork = { render: render };
  console.log("[PlanNetwork] Module chargé");
})();
