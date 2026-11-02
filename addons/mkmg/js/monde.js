/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// addons/mkmg/js/monde.js — ce qui vit dans la carrière pendant une partie de l'add-on « mkmg » : égarés (lents,
// nombreux, tués au fusil), silhouette (une seule, invulnérable, ne bouge que hors du faisceau de la lampe ; un tir
// la fait reculer), munitions et champignons à ramasser en passant dessus, tir. Expose window.KtaAddons.mkmgMonde =
// { peupler, animer, tirer, dessiner, vider, liberer, REGLES }. Positions en px plan (comme ctx.pos), maillages en m.
// ⚠️ contrat : aucun déplacement sans la règle du pas de la vue (ctx.bloque) ; les égarés suivent les galeries par
// Pathfinder.computeRoute (lecture, une demande à la fois), à vue directe ils foncent. Rien n'est écrit ailleurs que
// dans l'état de la partie et le groupe de la greffe.
// 🩸 Reprise du contexte WebGL : les maillages d'avant sont morts (jamais dispose()) ; dessiner() les refait tous.
// Doc : docs/architecture/tracking.md § Greffe de la vue 3D

(function () {
  "use strict";

  // Réglages (m, s, points) : premiers essais, à revoir au jeu.
  const REGLES = {
    egares: { base: 1, parVague: 1, max: 8, total: 10, vitesse: 1.1, vitesseParVague: 0.08, vitesseMax: 2,
      pv: 2, contact: 0.75, degatsParS: 18, vueDirecte: 12, routeS: 2 },
    silhouette: { desVague: 2, vitesse: 3.2, contact: 0.8, degats: 35, faisceau: 32, vue: 30 },
    apparition: { min: 15, max: 35, essais: 40 },
    munitions: { base: 4, parDeuxVagues: 1, min: 1, gain: 4 },
    champignons: { base: 3, parTroisVagues: 1, min: 1, soin: 30, lacher: 0.25 },
    ramasser: 1,
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
      const e = { type: "egare", x: q.x, y: q.y, pv: E.pv, vitesse: vitesse, chemin: null, cheminT: 0, coupT: 0,
        grogneT: Math.random() * 6 };
      p.ennemis.push(e); pris.push(e); neufs++;
    }
    if (n >= REGLES.silhouette.desVague && !p.ennemis.some(_estSilhouette)) {
      const q = _choisir(ctx, pts.tous, A.min + 10, A.max + 10, pris);
      if (q) { const s = { type: "silhouette", x: q.x, y: q.y, chemin: null, cheminT: 0 }; p.ennemis.push(s); }
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

  // Pas vers (tx, ty) à `v` m/s, la règle du pas de la vue ; glisse sur un axe si le pas entier est refusé.
  function _avancer(o, ctx, tx, ty, v, dt) {
    const sc = ctx.sc, dx = tx - o.x, dy = ty - o.y, l = Math.hypot(dx, dy);
    if (l < 1e-6) return false;
    const pas = Math.min(l, v * dt * sc), ux = dx / l * pas, uy = dy / l * pas;
    const essais = [[ux, uy], [ux, 0], [0, uy]];
    for (let i = 0; i < essais.length; i++) {
      const nx = o.x + essais[i][0], ny = o.y + essais[i][1];
      if ((essais[i][0] || essais[i][1]) && !ctx.bloque(o.x, o.y, nx, ny)) { o.x = nx; o.y = ny; return true; }
    }
    return false;
  }

  // Une demande de trajet à la fois (Pathfinder), la plus ancienne d'abord.
  function _demanderChemin(p, ctx, o) {
    if (p.routeEnCours || !window.Pathfinder || typeof window.Pathfinder.computeRoute !== "function") return;
    p.routeEnCours = true;
    const niv = ctx.niveau, lvl = niv === null ? undefined : niv, cible = ctx.pos, partie = p;
    window.Pathfinder.computeRoute([{ x: o.x, y: o.y, level: lvl }, { x: cible.x, y: cible.y, level: lvl }])
      .then(function (r) { o.chemin = r && Array.isArray(r.path) && r.path.length >= 2 ? r.path.slice(1) : null; })
      .catch(function () { o.chemin = null; })
      .then(function () { partie.routeEnCours = false; });
  }

  function _versJoueur(p, ctx, o, v, dt, t) {
    const pos = ctx.pos, sc = ctx.sc, d = _d(o, pos, sc);
    const direct = d <= REGLES.egares.vueDirecte && !ctx.ligneBloquee(o.x, o.y, pos.x, pos.y);
    if (direct || !window.Pathfinder) { _avancer(o, ctx, pos.x, pos.y, v, dt); return; }
    if (t - o.cheminT > REGLES.egares.routeS * 1000 && !p.routeEnCours) { o.cheminT = t; _demanderChemin(p, ctx, o); }
    while (o.chemin && o.chemin.length && _d(o, o.chemin[0], sc) < 0.5) o.chemin.shift();
    const w = o.chemin && o.chemin.length ? o.chemin[0] : pos;
    _avancer(o, ctx, w.x, w.y, v, dt);
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
    const t = performance.now(), pos = ctx.pos, sc = ctx.sc, E = REGLES.egares, S = REGLES.silhouette;
    const r = { degats: 0, sons: [], ramasse: [] };
    p.ennemis.forEach(function (o) {
      if (o.type === "egare") {
        const d = _d(o, pos, sc);
        if (d > E.contact) _versJoueur(p, ctx, o, o.vitesse, dt, t);
        else r.degats += E.degatsParS * dt;
        o.grogneT -= dt;
        if (o.grogneT <= 0 && d < 20) { r.sons.push(["grogne", 1 - d / 20]); o.grogneT = 4 + Math.random() * 5; }
      } else {
        const vu = dansFaisceau(ctx, o);
        o.vu = vu;
        if (!vu) _versJoueur(p, ctx, o, S.vitesse, dt, t);
        const d = _d(o, pos, sc);
        if (d <= S.contact) { r.degats += S.degats; r.sons.push(["blesse", 1]); _eloigner(p, ctx, o); }
      }
      _placer(o, ctx);
    });
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
    o.chemin = null;
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
    vider: vider, liberer: liberer, dansFaisceau: dansFaisceau };
})();
