/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// =====================================================================
// 🧹 secoursBalayage.js — découpage en secteurs + parcours de balayage
// =====================================================================
// Lot C1 de l'audit Secours (docs/audits/2026-09-29_audit-secours-v1.md §5),
// décisions KARMA du 15/10/2026 (QCM) : un seul découpage sur tout le réseau,
// jonctions comprises ; deux modes de parcours, « ossature » (sans culs-de-sac,
// reconnaissance) et « complet » (fouille).
//
// Pourquoi : un balayage saisi en étapes ne couvrait que 62 à 72 % des galeries
// d'un secteur (mesuré) — le plus court chemin entre deux étapes saute les
// boucles. Ici on calcule un CIRCUIT qui passe sur chaque galerie au moins une
// fois (postier chinois rural : appariement des carrefours impairs puis circuit
// eulérien), les culs-de-sac en aller-retour d'office.
//
// Calcul PUR sur le graphe de `Pathfinder.buildNetworkGraph()` : aucune
// interface, aucun état. Garde-fou : scripts/check-secours-balayage.js.
//
// Le graphe garde ses segments d'origine et AJOUTE des nœuds aux croisements et
// aux T (reliés aux deux extrémités du segment coupé). Une « pièce » = un bout
// de galerie entre deux nœuds consécutifs d'un même segment : c'est l'unité à
// couvrir et l'unité de charge d'un secteur.
//
// API : window.SecoursBalayage = { pieces, decouper, parcours }
(function() {
  "use strict";

  // ---------- File de priorité (tas binaire) ----------
  function _Tas() { this.k = []; this.v = []; }
  _Tas.prototype.push = function(cle, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(cle); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= cle) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = cle; v[i] = val;
  };
  _Tas.prototype.pop = function() {
    const k = this.k, v = this.v;
    const top = v[0], kl = k.pop(), vl = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= kl) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = kl; v[i] = vl;
    }
    return top;
  };
  _Tas.prototype.vide = function() { return this.k.length === 0; };

  // Dijkstra depuis une ou plusieurs sources, sur toutes les arêtes du graphe.
  // `stop(n)` rend true pour arrêter (nœud cible atteint, quota rempli…).
  function _dijkstra(graph, sources, stop) {
    const N = graph.nodes.length;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const tas = new _Tas();
    sources.forEach(function(s) { dist[s] = 0; tas.push(0, s); });
    while (!tas.vide()) {
      const d = tas.k[0], u = tas.pop();
      if (d > dist[u]) continue;
      if (stop && stop(u, d)) break;
      const adj = _adj(graph)[u];
      for (let i = 0; i < adj.length; i++) {
        const e = adj[i], nd = d + e.weight;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; tas.push(nd, e.to); }
      }
    }
    return { dist: dist, prev: prev };
  }
  function _chemin(prev, cible) {
    const out = [];
    for (let n = cible; n >= 0; n = prev[n]) out.push(n);
    return out.reverse();
  }

  // ---------- Pièces de galerie ----------
  // Rend [{ a, b, len, seg }] : `seg` = index dans graph.segments (dont `road`,
  // le tracé d'origine, et `level`). Mémo par graphe (le graphe de roadGraph.js
  // est mis en cache tant que les tracés ne bougent pas).
  const _memoPieces = new WeakMap();
  function pieces(graph) {
    if (!graph || !Array.isArray(graph.segments)) return [];
    const m = _memoPieces.get(graph);
    if (m) return m;
    const voisins = graph.edges.map(function(adj) {
      const s = new Set();
      adj.forEach(function(e) { s.add(e.to); });
      return s;
    });
    const out = [];
    graph.segments.forEach(function(sg, si) {
      const A = graph.nodes[sg.a], B = graph.nodes[sg.b];
      const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy;
      const L = Math.sqrt(L2);
      // Poids du segment dans le graphe (une jonction pèse son dénivelé réel).
      let w = Infinity;
      graph.edges[sg.a].forEach(function(e) { if (e.to === sg.b && e.weight < w) w = e.weight; });
      if (!isFinite(w)) w = L;
      // Nœuds posés SUR ce segment par l'enrichissement : reliés à ses deux extrémités.
      const sur = [];
      if (L2 > 0) {
        voisins[sg.a].forEach(function(n) {
          if (n === sg.b || !voisins[sg.b].has(n)) return;
          const P = graph.nodes[n];
          const t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / L2;
          if (t <= 1e-6 || t >= 1 - 1e-6) return;
          const d = Math.abs((P.x - A.x) * dy - (P.y - A.y) * dx) / L;
          if (d <= 2) sur.push({ n: n, t: t });
        });
      }
      sur.sort(function(p, q) { return p.t - q.t; });
      let prevN = sg.a, prevT = 0;
      sur.concat([{ n: sg.b, t: 1 }]).forEach(function(c) {
        if (c.n !== prevN) out.push({ a: prevN, b: c.n, len: w * (c.t - prevT), seg: si });
        prevN = c.n; prevT = c.t;
      });
    });
    _memoPieces.set(graph, out);
    return out;
  }

  // Réseau PROPRE pour tous les calculs : les pièces, plus les raccords du graphe
  // (T, extrémités voisines) — SANS les arêtes d'origine qui enjambent un
  // croisement (a → b d'un segment coupé) : elles feraient sauter un secteur
  // par-dessus le voisin et sauter des carrefours au parcours.
  const _memoAdj = new WeakMap();
  function _adj(graph) {
    const m = _memoAdj.get(graph);
    if (m) return m;
    const P = pieces(graph);
    const N = graph.nodes.length;
    const adj = [], segsDe = [];
    for (let i = 0; i < N; i++) { adj.push([]); segsDe.push(null); }
    const cle = function(u, v) { return u < v ? u + ":" + v : v + ":" + u; };
    const estPiece = new Set();
    P.forEach(function(p, i) {
      adj[p.a].push({ to: p.b, weight: p.len, p: i });
      adj[p.b].push({ to: p.a, weight: p.len, p: i });
      estPiece.add(cle(p.a, p.b));
      [p.a, p.b].forEach(function(n) { (segsDe[n] = segsDe[n] || new Set()).add(p.seg); });
    });
    const vus = new Set();
    for (let u = 0; u < N; u++) {
      graph.edges[u].forEach(function(e) {
        const v = e.to, k = cle(u, v);
        if (estPiece.has(k) || vus.has(k)) return;
        vus.add(k);
        // Raccourci le long d'un segment coupé : les deux bouts sont sur le même segment.
        if (segsDe[u] && segsDe[v]) for (const sg of segsDe[u]) if (segsDe[v].has(sg)) return;
        adj[u].push({ to: v, weight: e.weight });
        adj[v].push({ to: u, weight: e.weight });
      });
    }
    _memoAdj.set(graph, adj);
    return adj;
  }

  function _nodeLePlusProche(graph, p) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < graph.nodes.length; i++) {
      if (!_adj(graph)[i].length) continue;
      const n = graph.nodes[i], d = (n.x - p.x) * (n.x - p.x) + (n.y - p.y) * (n.y - p.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Croissance : un Dijkstra par secteur, avancé pas à pas ; à chaque pas, le
  // secteur le moins chargé prend les pièces libres du nœud le plus proche de son
  // germe. Rend { secteurs, proprio }.
  function _croitre(graph, P, incid, germes) {
    const N = graph.nodes.length;
    const proprio = new Int32Array(P.length).fill(-1);
    const secteurs = germes.map(function(g, idx) {
      const dist = new Float64Array(N).fill(Infinity);
      const tas = new _Tas();
      const par = new Int32Array(N).fill(-1);   // pièce empruntée pour arriver (−1 : germe ou raccord)
      dist[g] = 0; tas.push(0, g);
      return { idx: idx, germe: g, dist: dist, par: par, tas: tas, charge: 0, pieces: [] };
    });
    let actifs = secteurs.length;
    while (actifs > 0) {
      // Le moins chargé de ceux qui peuvent encore grandir.
      let s = null;
      secteurs.forEach(function(x) { if (!x.fini && (!s || x.charge < s.charge)) s = x; });
      let pris = false;
      while (!s.tas.vide() && !pris) {
        const d = s.tas.k[0], u = s.tas.pop();
        if (d > s.dist[u]) continue;
        // Arrivé par une pièce qu'un voisin a prise entre-temps : ce nœud n'est plus
        // relié au secteur par ses galeries — on l'oublie (il pourra être rejoint autrement).
        if (s.par[u] >= 0 && proprio[s.par[u]] !== s.idx && proprio[s.par[u]] !== -1) { s.dist[u] = Infinity; continue; }
        // Les pièces libres de ce nœud reviennent au secteur ; on ne traverse
        // que ce qui est libre ou à soi (un secteur ne passe pas chez le voisin).
        incid[u].forEach(function(pi) {
          if (proprio[pi] === -1) {
            proprio[pi] = s.idx;
            s.pieces.push(pi); s.charge += P[pi].len; pris = true;
          }
        });
        _adj(graph)[u].forEach(function(e) {
          const nd = d + e.weight;
          if (nd >= s.dist[e.to]) return;
          // Passage permis : par une pièce libre ou à soi, ou par un raccord vers un nœud
          // qui touche une pièce libre / à soi (jamais à travers la galerie d'un voisin).
          if (e.p !== undefined) {
            if (proprio[e.p] !== -1 && proprio[e.p] !== s.idx) return;
          } else if (incid[e.to].length && !incid[e.to].some(function(pi) {
            return proprio[pi] === -1 || proprio[pi] === s.idx;
          })) return;
          s.dist[e.to] = nd; s.par[e.to] = (e.p !== undefined) ? e.p : -1; s.tas.push(nd, e.to);
        });
      }
      if (!pris) { s.fini = true; actifs--; }
    }
    return { secteurs: secteurs, proprio: proprio };
  }

  // ---------- Découpage en N secteurs ----------
  // opts = { n, depart?: {x, y} }. Croissance équilibrée SUR LE GRAPHE : à chaque
  // pas, le secteur le moins chargé prend la pièce libre la plus proche de son
  // germe (secteurs continus par les galeries). Germes écartés au maximum
  // (le plus loin du départ, puis le plus loin des germes déjà posés).
  // Rend { secteurs: [{ pieces: [idx], longueur }], horsReseau: [idx], total }
  // `horsReseau` = pièces qu'aucun chemin ne relie au départ (inatteignables).
  function decouper(graph, opts) {
    opts = opts || {};
    const P = pieces(graph);
    const N = graph.nodes.length;
    const nb = Math.max(1, Math.floor(opts.n || 1));
    const incid = [];
    for (let i = 0; i < N; i++) incid.push([]);
    P.forEach(function(p, i) { incid[p.a].push(i); incid[p.b].push(i); });
    const depart = (opts.depart && typeof opts.depart.x === "number") ? _nodeLePlusProche(graph, opts.depart)
      : (P.length ? P[0].a : -1);
    if (depart < 0 || !P.length) return { secteurs: [], horsReseau: P.map(function(_, i) { return i; }), total: 0 };
    const d0 = _dijkstra(graph, [depart]).dist;
    // Germes : nœuds porteurs de pièces, atteignables.
    let germes = [];
    let minD = d0.slice();
    for (let s = 0; s < nb; s++) {
      let best = -1, bd = -1;
      for (let i = 0; i < N; i++) {
        if (!incid[i].length || !isFinite(minD[i])) continue;
        if (minD[i] > bd) { bd = minD[i]; best = i; }
      }
      if (best < 0 || (s > 0 && bd <= 0)) break;
      germes.push(best);
      const di = _dijkstra(graph, [best]).dist;
      for (let i = 0; i < N; i++) if (di[i] < minD[i]) minD[i] = di[i];
    }
    // Recentrage (Lloyd sur le graphe) : des germes posés en bout de réseau
    // s'y enferment (mesuré : secteurs de 4,5 à 19,6 km sur un réseau de 87 km).
    // Après chaque croissance, chaque germe va au nœud de son secteur le plus
    // proche du centre de gravité de ses galeries ; on garde le plus équilibré.
    let meilleur = null, meilleurRatio = Infinity;
    for (let tour = 0; tour < 12; tour++) {
      const essai = _croitre(graph, P, incid, germes);
      const ch = essai.secteurs.map(function(x) { return x.charge; });
      const ratio = Math.max.apply(null, ch) / Math.max(1e-9, Math.min.apply(null, ch));
      if (ratio < meilleurRatio) { meilleur = essai; meilleurRatio = ratio; }
      if (ratio < 1.15) break;
      const nouveaux = essai.secteurs.map(function(x) {
        let sx = 0, sy = 0, sw = 0;
        x.pieces.forEach(function(pi) {
          const A = graph.nodes[P[pi].a], B = graph.nodes[P[pi].b], w = P[pi].len;
          sx += w * (A.x + B.x) / 2; sy += w * (A.y + B.y) / 2; sw += w;
        });
        if (!sw) return x.germe;
        const cx = sx / sw, cy = sy / sw;
        let best = x.germe, bd = Infinity;
        x.pieces.forEach(function(pi) {
          [P[pi].a, P[pi].b].forEach(function(n) {
            const q = graph.nodes[n], d = (q.x - cx) * (q.x - cx) + (q.y - cy) * (q.y - cy);
            if (d < bd) { bd = d; best = n; }
          });
        });
        return best;
      });
      if (nouveaux.every(function(n, i) { return n === germes[i]; })) break;
      germes = nouveaux;
    }
    const secteurs = meilleur.secteurs, proprio = meilleur.proprio;
    const horsReseau = [];
    proprio.forEach(function(o, i) { if (o === -1) horsReseau.push(i); });
    const total = P.reduce(function(t, p) { return t + p.len; }, 0);
    return {
      secteurs: secteurs.map(function(x) { return { pieces: x.pieces, longueur: x.charge, germe: x.germe }; }),
      horsReseau: horsReseau, total: total
    };
  }

  // ---------- Parcours de balayage d'un ensemble de pièces ----------
  // opts = { depart: {x, y}, arrivee?: {x, y} (défaut : retour au départ),
  //          mode: "complet" | "ossature" }
  // Rend { path: [{x, y, level}], longueur, couvert, aCouvrir, nbPieces } ou null.
  function parcours(graph, piecesIdx, opts) {
    opts = opts || {};
    const P = pieces(graph);
    let req = (piecesIdx || []).filter(function(i) { return P[i]; });
    if (!req.length || !opts.depart) return null;
    // Ossature : on retire les culs-de-sac (2-cœur du réseau du secteur). Un
    // secteur sans boucle n'a pas d'ossature : on garde alors tout.
    if (opts.mode === "ossature") {
      const deg = {};
      req.forEach(function(i) { deg[P[i].a] = (deg[P[i].a] || 0) + 1; deg[P[i].b] = (deg[P[i].b] || 0) + 1; });
      let vivants = new Set(req), change = true;
      while (change) {
        change = false;
        vivants.forEach(function(i) {
          const p = P[i];
          if (deg[p.a] <= 1 || deg[p.b] <= 1) {
            vivants.delete(i); deg[p.a]--; deg[p.b]--; change = true;
          }
        });
      }
      if (vivants.size) req = Array.from(vivants);
    }
    const s = _nodeLePlusProche(graph, opts.depart);
    const t = opts.arrivee ? _nodeLePlusProche(graph, opts.arrivee) : s;
    if (s < 0 || t < 0) return null;
    // Multigraphe à parcourir : arêtes { u, v, w } — pièces requises + raccords.
    const aretes = req.map(function(i) { return { u: P[i].a, v: P[i].b, w: P[i].len }; });
    const ajouterChemin = function(noeuds) {
      for (let k = 1; k < noeuds.length; k++) {
        const u = noeuds[k - 1], v = noeuds[k];
        let w = Infinity;
        _adj(graph)[u].forEach(function(e) { if (e.to === v && e.weight < w) w = e.weight; });
        aretes.push({ u: u, v: v, w: w });
      }
    };
    // 1. Connexité : on relie chaque morceau au morceau qui contient le départ.
    const comp = {};
    const unir = function(x) { while (comp[x] !== undefined && comp[x] !== x) x = comp[x]; return x; };
    const lier = function(x, y) { const a = unir(x), b = unir(y); if (a !== b) comp[a] = b; };
    const noter = function(x) { if (comp[x] === undefined) comp[x] = x; };
    noter(s); noter(t);
    aretes.forEach(function(e) { noter(e.u); noter(e.v); lier(e.u, e.v); });
    if (t !== s) lier(s, t);   // l'arête fictive arrivée → départ (retirée à la fin)
    for (;;) {
      const racine = unir(s);
      const dedans = Object.keys(comp).map(Number).filter(function(x) { return unir(x) === racine; });
      const dehors = new Set(Object.keys(comp).map(Number).filter(function(x) { return unir(x) !== racine; }));
      if (!dehors.size) break;
      let cible = -1;
      const r = _dijkstra(graph, dedans, function(u) { if (dehors.has(u)) { cible = u; return true; } return false; });
      if (cible < 0) {
        // Morceaux injoignables : on les abandonne (le résultat le dit : couvert < aCouvrir).
        dehors.forEach(function(x) { delete comp[x]; });
        for (let k = aretes.length - 1; k >= 0; k--) if (comp[aretes[k].u] === undefined) aretes.splice(k, 1);
        break;
      }
      const ch = _chemin(r.prev, cible);
      ajouterChemin(ch);
      ch.forEach(function(x) { noter(x); lier(x, s); });
      lier(cible, s);
    }
    // 2. Parité : les nœuds de degré impair sont appariés par les plus courts chemins
    // (glouton sur les paires les plus proches — à 1,0x-1,1x de l'optimum en pratique).
    const deg = {};
    const compter = function(x) { deg[x] = (deg[x] || 0) + 1; };
    aretes.forEach(function(e) { compter(e.u); compter(e.v); });
    if (t !== s) { compter(s); compter(t); }   // arête fictive t → s
    const impairs = Object.keys(deg).map(Number).filter(function(x) { return deg[x] % 2 === 1; });
    const restants = new Set(impairs);
    const paires = [];
    const VOISINS = 8;
    impairs.forEach(function(o) {
      let trouves = 0;
      _dijkstra(graph, [o], function(u, d) {
        if (u !== o && restants.has(u)) { paires.push({ a: o, b: u, d: d }); if (++trouves >= VOISINS) return true; }
        return false;
      });
    });
    paires.sort(function(p, q) { return p.d - q.d; });
    const apparier = function(a, b) {
      const r = _dijkstra(graph, [a], function(u) { return u === b; });
      if (!isFinite(r.dist[b])) return false;
      ajouterChemin(_chemin(r.prev, b));
      restants.delete(a); restants.delete(b);
      return true;
    };
    paires.forEach(function(p) { if (restants.has(p.a) && restants.has(p.b)) apparier(p.a, p.b); });
    // Reste (voisins tous pris) : appariement au plus proche restant.
    while (restants.size > 1) {
      const a = restants.values().next().value;
      restants.delete(a);
      let cible = -1;
      const r = _dijkstra(graph, [a], function(u) { if (restants.has(u)) { cible = u; return true; } return false; });
      if (cible < 0) break;
      ajouterChemin(_chemin(r.prev, cible));
      restants.delete(cible);
    }
    // 3. Circuit eulérien (Hierholzer, itératif) depuis le départ.
    const fictive = (t !== s) ? aretes.push({ u: t, v: s, w: 0, fictive: true }) - 1 : -1;
    const adj = {};
    aretes.forEach(function(e, i) {
      (adj[e.u] = adj[e.u] || []).push(i);
      (adj[e.v] = adj[e.v] || []).push(i);
    });
    const utilisee = new Uint8Array(aretes.length);
    const ptr = {};
    const pile = [{ n: s, e: -1 }], circuit = [];
    while (pile.length) {
      const top = pile[pile.length - 1], l = adj[top.n] || [];
      let i = ptr[top.n] || 0;
      while (i < l.length && utilisee[l[i]]) i++;
      ptr[top.n] = i;
      if (i === l.length) { circuit.push(pile.pop()); continue; }
      const ei = l[i];
      utilisee[ei] = 1;
      const e = aretes[ei];
      pile.push({ n: e.u === top.n ? e.v : e.u, e: ei });
    }
    circuit.reverse();   // [{n, e: arête empruntée pour ARRIVER en n}], commence en s
    let noeuds = circuit.map(function(c) { return c.n; });
    if (fictive >= 0) {
      // Rotation : le circuit finit par l'arête fictive t → s ; on la retire.
      // noeuds = [c0 = s, c1, …, cm = s] ; la fictive relie c(k-1) et ck. Chemin ouvert :
      // ck, c(k+1), …, cm (= c0), c1, …, c(k-1) — de ck à c(k-1), soit {s, t} : on l'oriente s → t.
      const k = circuit.findIndex(function(c) { return c.e === fictive; });
      if (k > 0) {
        const seq = noeuds.slice(k).concat(noeuds.slice(1, k));
        noeuds = (seq[0] === s) ? seq : seq.reverse();
      }
    }
    // Sortie : coordonnées + niveau (null si ambigu : jonction, nœud multi-niveaux).
    const niveauDe = function(n) {
      const L = graph.nodeLevels && graph.nodeLevels[n];
      if (!L || L.size !== 1) return null;
      const v = L.values().next().value;
      return Number.isInteger(v) ? v : null;
    };
    const path = [];
    noeuds.forEach(function(n) {
      const last = path[path.length - 1], N = graph.nodes[n];
      if (last && last.x === N.x && last.y === N.y) return;
      path.push({ x: N.x, y: N.y, level: niveauDe(n) });
    });
    let longueur = 0;
    aretes.forEach(function(e) { if (!e.fictive && isFinite(e.w)) longueur += e.w; });
    const aCouvrir = (piecesIdx || []).reduce(function(x, i) { return x + (P[i] ? P[i].len : 0); }, 0);
    const couvert = req.reduce(function(x, i) { return x + (comp[P[i].a] !== undefined ? P[i].len : 0); }, 0);
    return { path: path, longueur: longueur, couvert: couvert, aCouvrir: aCouvrir, nbPieces: req.length };
  }

  window.SecoursBalayage = { pieces: pieces, decouper: decouper, parcours: parcours };
})();
