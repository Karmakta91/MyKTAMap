/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// addons/mkmg/js/monde.js — ce qui vit dans la carrière pendant une partie de l'add-on « mkmg » : égarés (presque
// aussi rapides que la marche, nombreux, ils chargent à vue ; tués au fusil), silhouette (une seule, invulnérable, ne
// bouge que hors du faisceau de la lampe ; un tir la fait reculer), munitions et champignons à ramasser en passant
// dessus, tir, embuscades (surgir). Expose window.KtaAddons.mkmgMonde = { peupler, animer, tirer, dessiner, vider,
// liberer, surgir, REGLES }. Positions en px plan (comme ctx.pos), maillages en m.
// ⚠️ contrat : à moins de 25 m (et droit sur le joueur) tout pas passe la règle du pas de la vue (ctx.bloque) ; plus
// loin, hors de vue, une menace glisse de nœud en nœud des tracés (_carte : distances au joueur sur le graphe en cache
// de RoadGraph, une seule pour toutes). Pensées à 15 Hz, pas à chaque image. Rien n'est écrit ailleurs que dans l'état
// de la partie et le groupe de la greffe.
// 🩸 Reprise du contexte WebGL : les maillages d'avant sont morts (jamais dispose()) ; dessiner() les refait tous.
// Doc : docs/architecture/tracking.md § Greffe de la vue 3D

(function () {
  "use strict";

  // Réglages (m, s, points) : premiers essais, à revoir au jeu.
  const REGLES = {
    // Proches de la marche (2,8 m/s) : il faut courir pour décrocher, l'endurance devient l'enjeu (décision produit).
    egares: { base: 2, parVague: 2, max: 14, total: 18, vitesse: 1.6, vitesseParVague: 0.12, vitesseMax: 2.6,
      pv: 2, contact: 0.75, degatsParS: 25, vueDirecte: 12, vueS: 0.25, regleM: 25, carteS: 1, carteM: 2,
      charge: { m: 8, x: 1.6, s: 2, repos: 4 } },
    // Embuscade (sandwich, horde) : égarés posés autour d'un point, au-delà du plafond `total` de `enPlus` au plus.
    embuscade: { rayon: 3, enPlus: 8 },
    silhouette: { desVague: 2, vitesse: 3.2, contact: 0.8, degats: 35, faisceau: 32, vue: 30 },
    apparition: { min: 15, max: 35, essais: 40 },
    munitions: { base: 4, parDeuxVagues: 1, min: 1, gain: 4 },
    champignons: { base: 3, parTroisVagues: 1, min: 1, soin: 30, lacher: 0.25 },
    ramasser: 1, iaHz: 15,
    tir: { portee: 18, ecart: 6, pres: 8, recharge: 1.5, canon: 2 }
  };
  const COULEURS = { egare: 0x5a6650, tete: 0x6e7a62, silhouette: 0x0d0d0f, yeux: 0xd8d8d0, caisse: 0x8a6a3a,
    pied: 0xe8dcc8, chapeau: 0xb03a2e };

  function _d(a, b, sc) { return Math.hypot(a.x - b.x, a.y - b.y) / sc; }

  function _tab(f) { try { return (typeof f === "function" ? f() : []) || []; } catch (e) { return []; } }

  function _surNiveau(o, niv) {
    return niv === null || niv === undefined || (Number.isInteger(o.level) ? o.level : 0) === niv;
  }

  // Tracés du niveau (hors itinéraire et jonctions) : sommets et milieux, et bouts libres (culs-de-sac).
  function _pointsDesTraces(niv) {
    const roads = _tab(window.getRoads).concat(_tab(window.getAllEmbeddedRoads)).filter(function (r) {
      return r && r.type !== "itinerary" && r.type !== "jonction" && Array.isArray(r.points) && _surNiveau(r, niv);
    });
    const tous = [], bouts = [];
    roads.forEach(function (r) {
      const pts = r.points.filter(function (q) { return q && Number.isFinite(q.x) && Number.isFinite(q.y); });
      pts.forEach(function (q, i) {
        tous.push({ x: q.x, y: q.y });
        if (i > 0) tous.push({ x: (q.x + pts[i - 1].x) / 2, y: (q.y + pts[i - 1].y) / 2 });
      });
      if (pts.length >= 2) bouts.push(pts[0], pts[pts.length - 1]);
    });
    // Bout libre (cul-de-sac) : aucun autre sommet confondu avec lui (3 px), donc pas un carrefour.
    const libres = bouts.filter(function (b) {
      return tous.filter(function (q) { return Math.abs(q.x - b.x) < 3 && Math.abs(q.y - b.y) < 3; }).length <= 1;
    });
    return { tous: tous, bouts: libres };
  }

  function _choisir(ctx, liste, dmin, dmax, pris) {
    const pos = ctx.pos, sc = ctx.sc;
    const ok = liste.filter(function (q) {
      const d = _d(q, pos, sc);
      return d >= dmin && d <= dmax && !pris.some(function (o) { return _d(o, q, sc) < 2; });
    });
    for (let k = 0; k < REGLES.apparition.essais && ok.length; k++) {
      const i = Math.floor(Math.random() * ok.length), q = ok[i];
      ok.splice(i, 1);
      if (ctx.libre(q.x, q.y)) return { x: q.x, y: q.y };
    }
    // Repli (plan sans tracés) : un point libre au hasard dans la couronne.
    for (let k = 0; k < REGLES.apparition.essais; k++) {
      const a = Math.random() * Math.PI * 2, r = (dmin + Math.random() * (dmax - dmin)) * sc;
      const q = { x: pos.x + Math.cos(a) * r, y: pos.y + Math.sin(a) * r };
      if (ctx.libre(q.x, q.y)) return q;
    }
    return null;
  }

  // ── Population d'une vague ────────────────────────────────────────────────────────────────────────────

  function peupler(p, ctx) {
    const n = p.vague, A = REGLES.apparition, E = REGLES.egares, niv = ctx.niveau;
    const pts = _pointsDesTraces(niv), pris = p.ennemis.concat(p.objets);
    const voulus = Math.min(E.max, E.base + E.parVague * n);
    const vitesse = Math.min(E.vitesseMax, E.vitesse + E.vitesseParVague * n);
    let neufs = 0;
    for (let i = 0; i < voulus && p.ennemis.filter(_estEgare).length < E.total; i++) {
      const q = _choisir(ctx, pts.tous, A.min, A.max, pris);
      if (!q) break;
      const e = { type: "egare", x: q.x, y: q.y, pv: E.pv, vitesse: vitesse, coupT: 0,
        grogneT: Math.random() * 6 };
      p.ennemis.push(e); pris.push(e); neufs++;
    }
    if (n >= REGLES.silhouette.desVague && !p.ennemis.some(_estSilhouette)) {
      const q = _choisir(ctx, pts.tous, A.min + 10, A.max + 10, pris);
      if (q) { const s = { type: "silhouette", x: q.x, y: q.y }; p.ennemis.push(s); }
    }
    const M = REGLES.munitions, C = REGLES.champignons;
    const nm = Math.max(M.min, M.base - Math.floor(n / 2) * M.parDeuxVagues);
    const nc = Math.max(C.min, C.base - Math.floor(n / 3) * C.parTroisVagues);
    for (let i = 0; i < nm; i++) {
      const q = _choisir(ctx, pts.tous, 6, A.max, pris);
      if (q) { const o = { type: "munitions", x: q.x, y: q.y }; p.objets.push(o); pris.push(o); }
    }
    // Champignons : de préférence au bout des galeries (on quitte le chemin pour les trouver).
    for (let i = 0; i < nc; i++) {
      const q = _choisir(ctx, pts.bouts.length ? pts.bouts : pts.tous, 6, A.max + 15, pris) ||
        _choisir(ctx, pts.tous, 6, A.max, pris);
      if (q) { const o = { type: "champignon", x: q.x, y: q.y }; p.objets.push(o); pris.push(o); }
    }
    p.niveauMonde = niv;
    dessiner(p, ctx, false);
    return neufs;
  }

  function _estEgare(e) { return e.type === "egare"; }
  function _estSilhouette(e) { return e.type === "silhouette"; }

  // ── Maillages ─────────────────────────────────────────────────────────────────────────────────────────

  function _gabarits(p, ctx) {
    const T = ctx.THREE, h = ctx.hauteur, g = {};
    const lam = function (c) { return new T.MeshLambertMaterial({ color: c }); };
    const hE = Math.min(1.25, h * 0.6), hS = Math.min(2.1, h * 0.95);
    g.corpsE = new T.CylinderGeometry(0.2, 0.26, hE, 10); g.corpsE.translate(0, hE / 2, 0);
    g.teteE = new T.SphereGeometry(0.16, 10, 8); g.teteE.translate(0, hE + 0.12, 0);
    g.corpsS = new T.CylinderGeometry(0.12, 0.2, hS, 10); g.corpsS.translate(0, hS / 2, 0);
    g.oeil = new T.SphereGeometry(0.025, 6, 4);
    g.caisse = new T.BoxGeometry(0.35, 0.16, 0.22); g.caisse.translate(0, 0.08, 0);
    g.pied = new T.CylinderGeometry(0.04, 0.05, 0.14, 8); g.pied.translate(0, 0.07, 0);
    g.chapeau = new T.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.chapeau.translate(0, 0.13, 0);
    g.hS = hS;
    const m = { egare: lam(COULEURS.egare), tete: lam(COULEURS.tete), silhouette: lam(COULEURS.silhouette),
      yeux: new T.MeshBasicMaterial({ color: COULEURS.yeux }), caisse: lam(COULEURS.caisse),
      pied: lam(COULEURS.pied), chapeau: lam(COULEURS.chapeau) };
    p.gabarits = { g: g, m: m };
  }

  function _maillage(p, ctx, o) {
    const T = ctx.THREE, g = p.gabarits.g, m = p.gabarits.m, grp = new T.Group();
    if (o.type === "egare") { grp.add(new T.Mesh(g.corpsE, m.egare), new T.Mesh(g.teteE, m.tete)); }
    if (o.type === "silhouette") {
      grp.add(new T.Mesh(g.corpsS, m.silhouette));
      [-0.05, 0.05].forEach(function (dx) {
        const y = new T.Mesh(g.oeil, m.yeux); y.position.set(dx, g.hS - 0.12, 0.13); grp.add(y);
      });
    }
    if (o.type === "munitions") grp.add(new T.Mesh(g.caisse, m.caisse));
    if (o.type === "champignon") grp.add(new T.Mesh(g.pied, m.pied), new T.Mesh(g.chapeau, m.chapeau));
    o.mesh = grp;
    _placer(o, ctx);
    ctx.groupe.add(grp);
  }

  function _placer(o, ctx) {
    if (!o.mesh) return;
    o.mesh.position.set(o.x / ctx.sc, 0, o.y / ctx.sc);
    if (o.type === "egare" || o.type === "silhouette") {
      const pos = ctx.pos;
      o.mesh.rotation.y = Math.atan2(pos.x - o.x, pos.y - o.y);
    }
  }

  // neuf : true après une reprise du contexte (gabarits refaits, rien n'est libéré).
  function dessiner(p, ctx, neuf) {
    if (neuf || !p.gabarits) _gabarits(p, ctx);
    p.ennemis.concat(p.objets).forEach(function (o) {
      if (o.mesh && !neuf && o.mesh.parent === ctx.groupe) return;
      if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh);
      _maillage(p, ctx, o);
    });
  }

  function _retirer(o) { if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh); o.mesh = null; }

  function vider(p) {
    p.ennemis.concat(p.objets).forEach(_retirer);
    p.ennemis = []; p.objets = [];
  }

  // Fin de partie : gabarits libérés (maillages partagés).
  function liberer(p, contexteMort) {
    vider(p);
    if (p.gabarits && !contexteMort) {
      const g = p.gabarits.g, m = p.gabarits.m;
      Object.keys(g).forEach(function (k) { if (g[k] && g[k].dispose) g[k].dispose(); });
      Object.keys(m).forEach(function (k) { m[k].dispose(); });
    }
    p.gabarits = null;
  }

  // ── Mouvement ─────────────────────────────────────────────────────────────────────────────────────────

  // Pas vers (tx, ty) à `v` m/s. regle : la règle du pas de la vue (glisse sur un axe si le pas entier est refusé) ;
  // sans elle (menace loin, hors de vue, sur les nœuds des tracés), le pas est libre.
  function _avancer(o, ctx, tx, ty, v, dt, regle) {
    const sc = ctx.sc, dx = tx - o.x, dy = ty - o.y, l = Math.hypot(dx, dy);
    if (l < 1e-6) return false;
    const pas = Math.min(l, v * dt * sc), ux = dx / l * pas, uy = dy / l * pas;
    if (!regle) { o.x += ux; o.y += uy; return true; }
    const essais = [[ux, uy], [ux, 0], [0, uy]];
    for (let i = 0; i < essais.length; i++) {
      const nx = o.x + essais[i][0], ny = o.y + essais[i][1];
      if ((essais[i][0] || essais[i][1]) && !ctx.bloque(o.x, o.y, nx, ny)) { o.x = nx; o.y = ny; return true; }
    }
    return false;
  }

  // Tas binaire minimal de [distance, nœud] (Dijkstra de la carte).
  function _tas() {
    const a = [];
    return {
      vide: function () { return !a.length; },
      pousser: function (d, n) {
        a.push([d, n]);
        for (let i = a.length - 1; i > 0;) {
          const j = (i - 1) >> 1;
          if (a[j][0] <= a[i][0]) break;
          const x = a[i]; a[i] = a[j]; a[j] = x; i = j;
        }
      },
      tirer: function () {
        const h = a[0], q = a.pop();
        if (a.length) {
          a[0] = q;
          for (let i = 0; ;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < a.length && a[l][0] < a[m][0]) m = l;
            if (r < a.length && a[r][0] < a[m][0]) m = r;
            if (m === i) break;
            const x = a[i]; a[i] = a[m]; a[m] = x; i = m;
          }
        }
        return h;
      }
    };
  }

  // 🩸 Carte des distances au joueur sur le réseau des tracés (graphe en cache de RoadGraph, Dijkstra depuis sa
  // place), refaite au plus toutes les `carteS` s et seulement s'il a bougé de `carteM` : une seule pour toutes les
  // menaces. Une demande Pathfinder par égaré reconstruisait tout le réseau, d'où des images perdues sur un plan dense.
  function _carte(p, ctx, t) {
    const E = REGLES.egares, R = window.RoadGraph, P = window.Pathfinder, pos = ctx.pos, c = p.carte;
    if (c && (t - c.t < E.carteS * 1000 || Math.hypot(pos.x - c.x, pos.y - c.y) < E.carteM * ctx.sc)) return c;
    if (!R || typeof R.getGraph !== "function" || !P || typeof P.snapPointToGraph !== "function") return null;
    const g = R.getGraph(), s = g && g.nodes.length ? P.snapPointToGraph(g, pos) : null;
    if (!s || !s.seg) return null;
    const n = g.nodes.length, dist = new Float64Array(n).fill(Infinity), tas = _tas();
    [s.seg.a, s.seg.b].forEach(function (k) {
      const d = Math.hypot(g.nodes[k].x - s.projection.x, g.nodes[k].y - s.projection.y);
      if (d < dist[k]) { dist[k] = d; tas.pousser(d, k); }
    });
    while (!tas.vide()) {
      const h = tas.tirer(), u = h[1];
      if (h[0] > dist[u]) continue;
      (g.edges[u] || []).forEach(function (e) {
        const nd = h[0] + e.weight;
        if (nd < dist[e.to]) { dist[e.to] = nd; tas.pousser(nd, e.to); }
      });
    }
    p.carte = { t: t, x: pos.x, y: pos.y, g: g, dist: dist, a: s.seg.a, b: s.seg.b, id: (c ? c.id : 0) + 1 };
    return p.carte;
  }

  // Nœud suivant d'une menace : celui de son tronçon le plus près du joueur, puis, nœud atteint, le voisin qui
  // descend la carte ; sur le tronçon du joueur (ou sans descente), droit sur lui (-1).
  function _noeudSuivant(c, o) {
    const g = c.g;
    if (o.carteId !== c.id || o.noeud === undefined) {
      o.carteId = c.id;
      const s = window.Pathfinder.snapPointToGraph(g, o);
      if (!s || !s.seg) return -1;
      const cout = function (k) { return c.dist[k] + Math.hypot(g.nodes[k].x - o.x, g.nodes[k].y - o.y); };
      o.noeud = cout(s.seg.a) <= cout(s.seg.b) ? s.seg.a : s.seg.b;
    }
    return o.noeud;
  }

  function _versJoueur(p, ctx, o, v, dt, t) {
    const E = REGLES.egares, pos = ctx.pos, sc = ctx.sc, d = _d(o, pos, sc), proche = d <= E.regleM;
    // Vue directe relue toutes les `vueS` s seulement (un segment testé contre tout le plan).
    if (t - (o.vueT || 0) > E.vueS * 1000) {
      o.vueT = t;
      o.direct = d <= E.vueDirecte && !ctx.ligneBloquee(o.x, o.y, pos.x, pos.y);
    }
    const c = o.direct ? null : _carte(p, ctx, t);
    let k = c ? _noeudSuivant(c, o) : -1;
    if (k >= 0 && _d(o, c.g.nodes[k], sc) < 0.5) {
      // Nœud atteint : le voisin le plus près du joueur, s'il descend ; sinon droit sur lui.
      let best = -1, bd = c.dist[k];
      (c.g.edges[k] || []).forEach(function (e) { if (c.dist[e.to] < bd) { bd = c.dist[e.to]; best = e.to; } });
      o.noeud = k = (k === c.a || k === c.b) ? -1 : best;
    }
    // Charge : à vue sous `charge.m`, l'égaré fonce `charge.s` s à ×`charge.x`, puis souffle `charge.repos` s.
    const C = E.charge;
    if (o.type === "egare" && o.direct && d <= C.m && t >= (o.chargeProchaine || 0)) {
      o.chargeFin = t + C.s * 1000;
      o.chargeProchaine = o.chargeFin + C.repos * 1000;
    }
    const vit = o.chargeFin && t < o.chargeFin ? v * C.x : v;
    const cible = k >= 0 ? c.g.nodes[k] : pos;
    _avancer(o, ctx, cible.x, cible.y, vit, dt, proche || k < 0);
  }

  // Égarés surgis autour de `centre` (px) : jusqu'à `n`, sur des places libres, plafond total + embuscade.enPlus.
  // → nombre posés. Sert au sandwich (devant et derrière sur le trajet) et à la horde (chrono dépassé).
  function surgir(p, ctx, centre, n, rayonM) {
    const E = REGLES.egares, sc = ctx.sc, r = (rayonM || REGLES.embuscade.rayon) * sc;
    const vitesse = Math.min(E.vitesseMax, E.vitesse + E.vitesseParVague * p.vague);
    let poses = 0;
    for (let k = 0; k < n * 6 && poses < n; k++) {
      if (p.ennemis.filter(_estEgare).length >= E.total + REGLES.embuscade.enPlus) break;
      const a = Math.random() * Math.PI * 2, rr = Math.random() * r;
      const q = { x: centre.x + Math.cos(a) * rr, y: centre.y + Math.sin(a) * rr };
      if (_d(q, ctx.pos, sc) < 4 || !ctx.libre(q.x, q.y)) continue;
      const e = { type: "egare", x: q.x, y: q.y, pv: E.pv, vitesse: vitesse, coupT: 0, grogneT: Math.random() * 2 };
      p.ennemis.push(e);
      _maillage(p, ctx, e);
      poses++;
    }
    return poses;
  }

  // La silhouette est-elle dans le faisceau ? (distance de vue, cône de la lampe, rien entre elle et soi)
  function dansFaisceau(ctx, o) {
    const S = REGLES.silhouette, pos = ctx.pos, d = _d(o, pos, ctx.sc);
    if (d > S.vue) return false;
    const ang = Math.atan2(o.x - pos.x, -(o.y - pos.y)) * 180 / Math.PI;
    let ecart = Math.abs(((ang - ctx.cap) % 360 + 540) % 360 - 180);
    if (ecart > S.faisceau) return false;
    return !ctx.ligneBloquee(pos.x, pos.y, o.x, o.y);
  }

  // → { degats, sons: [[nom, force]], ramasse: [type] }
  function animer(p, ctx, dt) {
    const t0 = performance.now(), t = t0, pos = ctx.pos, sc = ctx.sc, E = REGLES.egares, S = REGLES.silhouette;
    const r = { degats: 0, sons: [], ramasse: [] };
    // Menaces pensées à `iaHz` par seconde (pas à chaque image) : le coût ne monte plus avec la cadence d'affichage.
    p.iaAcc = (p.iaAcc || 0) + dt;
    const pense = p.iaAcc >= 1 / REGLES.iaHz, dtIa = p.iaAcc;
    if (pense) p.iaAcc = 0;
    p.ennemis.forEach(function (o) {
      const d = _d(o, pos, sc);
      if (o.type === "egare") {
        if (d <= E.contact) r.degats += E.degatsParS * dt;
        else if (pense) _versJoueur(p, ctx, o, o.vitesse, dtIa, t);
        o.grogneT -= dt;
        if (o.grogneT <= 0 && d < 20) { r.sons.push(["grogne", 1 - d / 20]); o.grogneT = 4 + Math.random() * 5; }
      } else {
        if (pense) {
          o.vu = dansFaisceau(ctx, o);
          if (!o.vu) _versJoueur(p, ctx, o, S.vitesse, dtIa, t);
        }
        if (_d(o, pos, sc) <= S.contact) { r.degats += S.degats; r.sons.push(["blesse", 1]); _eloigner(p, ctx, o); }
      }
      if (pense) _placer(o, ctx);
    });
    p.msMonde = (p.msMonde || 0) * 0.95 + (performance.now() - t0) * 0.05;
    p.objets = p.objets.filter(function (o) {
      if (o.mesh) o.mesh.rotation.y += dt * 1.2;
      if (_d(o, pos, sc) > REGLES.ramasser) return true;
      r.ramasse.push(o.type);
      _retirer(o);
      return false;
    });
    return r;
  }

  // La silhouette touchée (tir, contact) repart loin, hors de vue.
  function _eloigner(p, ctx, o) {
    const A = REGLES.apparition, q = _choisir(ctx, _pointsDesTraces(ctx.niveau).tous, A.min + 10, A.max + 15, []);
    if (q) { o.x = q.x; o.y = q.y; }
    o.noeud = undefined;
    _placer(o, ctx);
  }

  // ── Tir ───────────────────────────────────────────────────────────────────────────────────────────────

  // Coup de fusil dans l'axe du regard → { touche: null | "egare" | "silhouette", tue, lache }
  function tirer(p, ctx) {
    const T = REGLES.tir, pos = ctx.pos, sc = ctx.sc, res = { touche: null, tue: false, lache: false };
    let cible = null, dMin = Infinity;
    p.ennemis.forEach(function (o) {
      const d = _d(o, pos, sc);
      if (d > T.portee || d >= dMin) return;
      const ang = Math.atan2(o.x - pos.x, -(o.y - pos.y)) * 180 / Math.PI;
      const ecart = Math.abs(((ang - ctx.cap) % 360 + 540) % 360 - 180);
      const tolere = Math.max(T.ecart, Math.atan2(0.35, d) * 180 / Math.PI);
      if (ecart > tolere || ctx.ligneBloquee(pos.x, pos.y, o.x, o.y)) return;
      cible = o; dMin = d;
    });
    if (!cible) return res;
    res.touche = cible.type;
    if (cible.type === "silhouette") { _eloigner(p, ctx, cible); return res; }
    cible.pv -= dMin <= T.pres ? 2 : 1;
    if (cible.pv <= 0) {
      res.tue = true;
      _retirer(cible);
      p.ennemis = p.ennemis.filter(function (o) { return o !== cible; });
      if (Math.random() < REGLES.champignons.lacher) {
        const o = { type: "champignon", x: cible.x, y: cible.y };
        p.objets.push(o);
        _maillage(p, ctx, o);
        res.lache = true;
      }
    }
    return res;
  }

  window.KtaAddons = window.KtaAddons || {};
  window.KtaAddons.mkmgMonde = { REGLES: REGLES, peupler: peupler, animer: animer, tirer: tirer, dessiner: dessiner,
    vider: vider, liberer: liberer, dansFaisceau: dansFaisceau, surgir: surgir };
})();
