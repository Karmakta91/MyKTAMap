/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// addons/mkmg/js/monde.js — ce qui vit dans la carrière pendant une partie de l'add-on « mkmg » : égarés (presque
// aussi rapides que la marche, nombreux, ils chargent à vue ; tués au fusil, ils tombent et restent au sol), rampants
// (dès la vague 3 : au ras du sol, rapides, fragiles), hurleurs (dès la vague 5 : lents ; à vue, ils crient et les
// égarés proches accourent), gardien (vagues boss : garde le point B, encaisse en reculant, lâche santé et cartouches),
// silhouette (une seule, invulnérable, ne bouge que hors du faisceau de la lampe ; un tir la fait reculer), munitions,
// piles et champignons à ramasser en passant dessus, tir, embuscades (surgir). L'eau ralentit tout le monde. Un monde
// par niveau : changer de niveau range celui qu'on quitte (ses menaces attendent là, elles ne prennent pas l'escalier).
// Expose window.KtaAddons.mkmgMonde = { peupler, animer, tirer, dessiner, vider, liberer, surgir, poserGardien,
// changerNiveau, nouveau, dansEau, zonesDe, angle, REGLES }. Positions en px plan (comme ctx.pos), maillages en m.
// ⚠️ contrat : à moins de 25 m (et droit sur le joueur) tout pas passe la règle du pas de la vue (ctx.bloque) ; plus
// loin, hors de vue, une menace glisse de nœud en nœud des tracés (_carte : distances au joueur sur le graphe en cache
// de RoadGraph, une seule pour toutes). Pensées à 15 Hz, pas à chaque image. Rien n'est écrit ailleurs que dans l'état
// de la partie et le groupe de la greffe.
// 🩸 Reprise du contexte WebGL : les maillages d'avant sont morts (jamais dispose()) ; dessiner() les refait tous.
// Doc : docs/architecture/addons.md

(function () {
  "use strict";

  // Réglages (m, s, points) : premiers essais, à revoir au jeu.
  const REGLES = {
    // Proches de la marche (2,8 m/s) : il faut courir pour décrocher, l'endurance devient l'enjeu (décision produit).
    egares: { base: 2, parVague: 2, max: 14, total: 18, vitesse: 1.6, vitesseParVague: 0.12, vitesseMax: 2.6,
      pv: 2, contact: 0.75, degatsParS: 25, vueDirecte: 12, vueS: 0.25, regleM: 25, carteS: 1, carteM: 2,
      charge: { m: 8, x: 1.6, s: 2, repos: 4 } },
    rampants: { desVague: 3, base: 1, parDeuxVagues: 1, max: 5, vitesseX: 1.5, pv: 1 },
    // Hurleur : à vue (`vue` m), il crie ; les marcheurs à moins de `rayon` m accourent (×`enrageX` pendant
    // `enrage` s) et `renfort` égarés sortent du noir près de lui. Un cri toutes les `repos` s au plus.
    hurleurs: { desVague: 5, base: 1, parTroisVagues: 1, max: 3, vitesseX: 0.65, pv: 3, vue: 14, rayon: 30, enrage: 8,
      enrageX: 1.35, renfort: 2, repos: 15, criMs: 1200 },
    // Gardien (vagues boss) : posé à `place` m de B, y revient s'il est à plus de `garde` m sans le joueur en vue.
    gardien: { pv: 10, pvParBoss: 2, vitesse: 0.9, place: [3, 6], garde: 8, vue: 12, degatsParS: 45, reculM: 0.5 },
    // Embuscade (sandwich, horde) : égarés posés autour d'un point, au-delà du plafond `total` de `enPlus` au plus.
    embuscade: { rayon: 3, enPlus: 8 },
    silhouette: { desVague: 2, vitesse: 3.2, contact: 0.8, degats: 35, faisceau: 32, vue: 30 },
    apparition: { min: 15, max: 35, essais: 40 },
    munitions: { base: 4, parDeuxVagues: 1, min: 1, gain: 4 },
    champignons: { base: 3, parTroisVagues: 1, min: 1, soin: 30, lacher: 0.25 },
    piles: { base: 2, parTroisVagues: 1, min: 1, gain: 45 },
    // Refuge : un niveau jamais visité de la vague est peuplé à `part` seulement, sans silhouette.
    refuge: { part: 0.5 },
    eau: { x: 0.6 },
    // Pas entendus : plus près (`rayonM`), plus vite étouffés (carré de la distance), et un sur trois sauté au
    // hasard pour casser le métronome de la foulée.
    pas: { rayonM: 6, parImage: 2, saut: 0.35 },
    ramasser: 1, iaHz: 15,
    tir: { portee: 18, ecart: 6, pres: 8, recharge: 1.5, canon: 2 }
  };
  const COULEURS = { haillons: 0x5b5f4a, pantalon: 0x3a372f, peau: 0x9aa58a, casque: 0xa8842c, bottes: 0x231f1a,
    yeuxE: 0xff6a3a, silhouette: 0x0d0d0f, yeux: 0xd8d8d0, caisse: 0x8a6a3a, pied: 0xe8dcc8, chapeau: 0xb03a2e,
    flaque: 0x2a0705, pile: 0xc89a1a, pileHaut: 0x1a1a1a, borne: 0xb8b8b8,
    // Teintes des variantes (multipliées aux couleurs de l'égaré).
    rampant: 0xd8e2c4, hurleur: 0xe8a090, gardien: 0x9a8a80 };
  // Animation des égarés : foulée (rad, pas par m), recul quand le coup ne tue pas, chute, corps gardés au sol.
  // rampe : bascule du rampant vers l'avant (rad).
  const ANIM = { foulee: 0.55, pasParM: 3.2, recul: 0.45, reculMs: 250, chuteMs: 550, flaqueMs: 3000, cadavres: 16,
    rampe: 1.32 };

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

  // ⚠️ contrat (décision produit) : rien n'apparaît dans un remblais, un effondrement (ils bouchent la galerie,
  // galerieEmprise.js > ZONES_BOUCHENT) ni une zone inaccessible du niveau ; ctx.libre ne les voit pas hors des
  // tubes. Zones lues (lecture seule), relues au plus toutes les 2 s.
  const BOUCHENT = ["remblais", "effondrement", "inaccessible"];
  const _caches = {};
  // Zones du niveau des types donnés (lecture seule), relues au plus toutes les 2 s.
  function zonesDe(niv, types) {
    const cle = types.join(","), t = performance.now(), c = _caches[cle];
    if (c && c.niv === niv && t - c.t < 2000) return c.zones;
    const zones = _tab(window.getZones).concat(_tab(window.getAllEmbeddedZones)).filter(function (z) {
      return z && types.indexOf(z.type) >= 0 && Array.isArray(z.points) && z.points.length >= 3 && _surNiveau(z, niv);
    });
    _caches[cle] = { t: t, niv: niv, zones: zones };
    return zones;
  }
  function _zonesBouchent(niv) { return zonesDe(niv, BOUCHENT); }

  // Dans une zone d'eau du niveau ?
  function dansEau(ctx, x, y) {
    return zonesDe(ctx.niveau, ["eau"]).some(function (z) { return _dansPolygone(z.points, x, y); });
  }

  // D'où vient o pour le joueur (degrés, 0 = devant, 90 = à droite) : sons situés.
  function angle(ctx, o) {
    const pos = ctx.pos;
    return Math.atan2(o.x - pos.x, -(o.y - pos.y)) * 180 / Math.PI - ctx.cap;
  }

  function _dansPolygone(pts, x, y) {
    let dedans = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) dedans = !dedans;
    }
    return dedans;
  }

  // Place où poser quelque chose (cible, menace, objet) : un corps y tient, hors remblais, effondrement, inaccessible.
  function placeOk(ctx, x, y) {
    return ctx.libre(x, y) && !_zonesBouchent(ctx.niveau).some(function (z) { return _dansPolygone(z.points, x, y); });
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
      if (placeOk(ctx, q.x, q.y)) return { x: q.x, y: q.y };
    }
    // Repli (plan sans tracés) : un point libre au hasard dans la couronne.
    for (let k = 0; k < REGLES.apparition.essais; k++) {
      const a = Math.random() * Math.PI * 2, r = (dmin + Math.random() * (dmax - dmin)) * sc;
      const q = { x: pos.x + Math.cos(a) * r, y: pos.y + Math.sin(a) * r };
      if (placeOk(ctx, q.x, q.y)) return q;
    }
    return null;
  }

  // ── Population d'une vague ────────────────────────────────────────────────────────────────────────────

  // Nombre d'une variante à la vague n : base dès desVague, +1 tous les `pas` vagues, au plus max.
  function _combien(R, n, pas, par) {
    return n < R.desVague ? 0 : Math.min(R.max, R.base + Math.floor((n - R.desVague) / pas) * par);
  }

  // Menace neuve (type : egare, rampant, hurleur, gardien) à la vague de la partie.
  function nouveau(p, type, x, y) {
    const E = REGLES.egares, v = Math.min(E.vitesseMax, E.vitesse + E.vitesseParVague * (p.vague || 1));
    const o = { type: type, x: x, y: y, pv: E.pv, vitesse: v, coupT: 0, grogneT: Math.random() * 6 };
    if (type === "rampant") { o.pv = REGLES.rampants.pv; o.vitesse = v * REGLES.rampants.vitesseX; }
    if (type === "hurleur") { o.pv = REGLES.hurleurs.pv; o.vitesse = v * REGLES.hurleurs.vitesseX; }
    if (type === "gardien") {
      const G = REGLES.gardien;
      o.pv = G.pv + G.pvParBoss * Math.max(0, Math.floor((p.vague || 0) / 5) - 1);
      o.pvMax = o.pv; o.vitesse = G.vitesse;
    }
    return o;
  }

  // opts.refuge : niveau rejoint pendant la vague (escalier) : population réduite, sans silhouette.
  function peupler(p, ctx, opts) {
    const n = p.vague, A = REGLES.apparition, E = REGLES.egares, niv = ctx.niveau, refuge = !!(opts && opts.refuge);
    const pts = _pointsDesTraces(niv), pris = p.ennemis.concat(p.objets);
    const R = REGLES.rampants, H = REGLES.hurleurs, part = refuge ? REGLES.refuge.part : 1;
    const voulus = Math.ceil(Math.min(E.max, E.base + E.parVague * n) * part);
    const types = [];
    for (let i = 0; i < Math.ceil(_combien(H, n, 3, H.parTroisVagues) * part); i++) types.push("hurleur");
    for (let i = 0; i < Math.ceil(_combien(R, n, 2, R.parDeuxVagues) * part); i++) types.push("rampant");
    while (types.length < voulus) types.push("egare");
    let neufs = 0;
    for (let i = 0; i < types.length && p.ennemis.filter(_estMarcheur).length < E.total; i++) {
      const q = _choisir(ctx, pts.tous, A.min, A.max, pris);
      if (!q) break;
      const e = nouveau(p, types[i], q.x, q.y);
      p.ennemis.push(e); pris.push(e); neufs++;
    }
    if (!refuge && n >= REGLES.silhouette.desVague && !p.ennemis.some(_estSilhouette)) {
      const q = _choisir(ctx, pts.tous, A.min + 10, A.max + 10, pris);
      if (q) { const s = { type: "silhouette", x: q.x, y: q.y }; p.ennemis.push(s); }
    }
    const M = REGLES.munitions, C = REGLES.champignons, Pi = REGLES.piles;
    const nm = Math.max(M.min, M.base - Math.floor(n / 2) * M.parDeuxVagues);
    const nc = Math.max(C.min, C.base - Math.floor(n / 3) * C.parTroisVagues);
    const np = Math.max(Pi.min, Pi.base - Math.floor(n / 3) * Pi.parTroisVagues);
    [["munitions", nm], ["pile", np]].forEach(function (x) {
      for (let i = 0; i < x[1]; i++) {
        const q = _choisir(ctx, pts.tous, 6, A.max, pris);
        if (q) { const o = { type: x[0], x: q.x, y: q.y }; p.objets.push(o); pris.push(o); }
      }
    });
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

  // Marcheur : tout ce qui a le corps d'un égaré (égaré, rampant, hurleur, gardien), mortel au fusil.
  const MARCHEURS = { egare: true, rampant: true, hurleur: true, gardien: true };
  function _estMarcheur(e) { return MARCHEURS[e.type] === true; }
  function _estSilhouette(e) { return e.type === "silhouette"; }

  // Gardien de la vague boss, près de B (place libre à `place` m), qu'il garde. → posé ou non.
  function poserGardien(p, ctx, cible) {
    const G = REGLES.gardien, sc = ctx.sc;
    for (let k = 0; k < REGLES.apparition.essais; k++) {
      const a = Math.random() * Math.PI * 2, r = (G.place[0] + Math.random() * (G.place[1] - G.place[0])) * sc;
      const q = { x: cible.x + Math.cos(a) * r, y: cible.y + Math.sin(a) * r };
      if (!placeOk(ctx, q.x, q.y)) continue;
      const o = nouveau(p, "gardien", q.x, q.y);
      o.garde = { x: cible.x, y: cible.y };
      p.ennemis.push(o);
      _maillage(p, ctx, o);
      return true;
    }
    return false;
  }

  // Passage à un autre niveau (escalier) : le monde quitté est rangé tel quel (ses menaces attendent là) ; celui du
  // niveau rejoint est repris, ou peuplé en refuge s'il est neuf. → true si peuplé.
  function changerNiveau(p, ctx) {
    p.mondes = p.mondes || {};
    p.ennemis.concat(p.objets, p.cadavres || []).forEach(_retirer);
    p.mondes[p.niveauMonde] = { ennemis: p.ennemis, objets: p.objets, cadavres: p.cadavres || [] };
    const m = p.mondes[ctx.niveau];
    delete p.mondes[ctx.niveau];
    p.carte = null;
    p.niveauMonde = ctx.niveau;
    if (m) {
      p.ennemis = m.ennemis; p.objets = m.objets; p.cadavres = m.cadavres;
      p.ennemis.forEach(function (o) { o.noeud = undefined; o.carteId = undefined; });
      dessiner(p, ctx, false);
      return false;
    }
    p.ennemis = []; p.objets = []; p.cadavres = [];
    peupler(p, ctx, { refuge: true });
    return true;
  }

  // ── Maillages ─────────────────────────────────────────────────────────────────────────────────────────

  // Pièces fusionnées en UNE géométrie à couleurs de sommets : un égaré = 4 maillages (haut, yeux, deux jambes),
  // pas un par pièce (des dizaines d'égarés et de corps sur un téléphone). pieces = [[géométrie, couleur, matrice]].
  function _fusion(T, pieces) {
    const gs = pieces.map(function (pc) {
      const g = pc[0].index ? pc[0].toNonIndexed() : pc[0];
      if (g !== pc[0]) pc[0].dispose();
      g.applyMatrix4(pc[2]);
      return [g, new T.Color(pc[1])];
    });
    const n = gs.reduce(function (s, x) { return s + x[0].attributes.position.count; }, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let k = 0;
    gs.forEach(function (x) {
      const g = x[0], c = x[1], m = g.attributes.position.count;
      pos.set(g.attributes.position.array, k * 3);
      nor.set(g.attributes.normal.array, k * 3);
      for (let i = 0; i < m; i++) { col[(k + i) * 3] = c.r; col[(k + i) * 3 + 1] = c.g; col[(k + i) * 3 + 2] = c.b; }
      k += m;
      g.dispose();
    });
    const out = new T.BufferGeometry();
    out.setAttribute("position", new T.BufferAttribute(pos, 3));
    out.setAttribute("normal", new T.BufferAttribute(nor, 3));
    out.setAttribute("color", new T.BufferAttribute(col, 3));
    return out;
  }

  // Matrice : position, rotation (x, y, z), échelle (un nombre ou [x, y, z]).
  function _mx(T, x, y, z, rx, ry, rz, s) {
    const e = Array.isArray(s) ? s : [s || 1, s || 1, s || 1];
    return new T.Matrix4().compose(new T.Vector3(x, y, z),
      new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)), new T.Vector3(e[0], e[1], e[2]));
  }

  // Cylindre de a à b (m) → [géométrie, matrice].
  function _seg(T, a, b, r0, r1) {
    const va = new T.Vector3(a[0], a[1], a[2]), vb = new T.Vector3(b[0], b[1], b[2]), d = vb.clone().sub(va);
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize());
    return [new T.CylinderGeometry(r1, r0, d.length(), 8),
      new T.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new T.Vector3(1, 1, 1))];
  }

  // Égaré : mineur voûté, casque à lampe, bras tendus vers le joueur (+z = face). Haut du corps à partir des hanches.
  function _gabaritEgare(T, g, H) {
    const C = COULEURS, hanche = H * 0.46, ht = H * 0.3, epaule = 0.12 + ht - 0.04, tete = 0.12 + ht + 0.15;
    const voute = 0.35;
    g.hautE = _fusion(T, [
      [new T.BoxGeometry(0.34, 0.16, 0.2), C.pantalon, _mx(T, 0, 0.05, 0)],
      [new T.BoxGeometry(0.38, ht, 0.22), C.haillons, _mx(T, 0, 0.12 + ht / 2, 0)],
      [new T.SphereGeometry(0.13, 10, 8), C.peau, _mx(T, 0, tete, 0.02)],
      [new T.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.casque, _mx(T, 0, tete + 0.02, 0.02)],
      [new T.CylinderGeometry(0.16, 0.16, 0.02, 12), C.casque, _mx(T, 0, tete + 0.03, 0.03)],
      [new T.CylinderGeometry(0.03, 0.03, 0.03, 8), C.yeux, _mx(T, 0, tete + 0.09, 0.15, Math.PI / 2)]
    ]);
    g.hautE.rotateX(voute);
    g.yeuxE = _fusion(T, [-0.045, 0.045].map(function (dx) {
      return [new T.SphereGeometry(0.026, 6, 4), C.yeuxE, _mx(T, dx, tete + 0.005, 0.15)];
    }));
    g.yeuxE.rotateX(voute);
    // Bras à part (pivot aux épaules) : tendus vers le joueur, ils retombent le long du corps à la mort.
    const bras = function (s) {
      const sg = _seg(T, [s * 0.21, 0, 0], [s * 0.15, -0.06, 0.42], 0.058, 0.048);
      return [sg[0], C.haillons, sg[1]];
    };
    g.brasE = _fusion(T, [bras(-1), bras(1),
      [new T.SphereGeometry(0.055, 8, 6), C.peau, _mx(T, -0.15, -0.06, 0.45)],
      [new T.SphereGeometry(0.055, 8, 6), C.peau, _mx(T, 0.15, -0.06, 0.45)]]);
    g.epaule = new T.Vector3(0, epaule, 0.02).applyAxisAngle(new T.Vector3(1, 0, 0), voute);
    g.voute = voute;
    g.jambeE = _fusion(T, [
      [new T.CylinderGeometry(0.075, 0.062, hanche, 8), C.pantalon, _mx(T, 0, -hanche / 2, 0)],
      [new T.BoxGeometry(0.12, 0.08, 0.21), C.bottes, _mx(T, 0, -hanche + 0.04, 0.04)]
    ]);
    g.hanche = hanche;
  }

  // Silhouette : longue, mince, bras jusqu'aux genoux.
  function _gabaritSilhouette(T, g, hS) {
    const c = COULEURS.silhouette, j = hS * 0.48, tr = hS * 0.34, ep = j + tr;
    const seg = function (a, b, r0, r1) { const s = _seg(T, a, b, r0, r1); return [s[0], c, s[1]]; };
    g.corpsS = _fusion(T, [
      seg([-0.07, 0, 0], [-0.06, j, 0], 0.035, 0.05), seg([0.07, 0, 0], [0.06, j, 0], 0.035, 0.05),
      [new T.CylinderGeometry(0.14, 0.1, tr, 8), c, _mx(T, 0, j + tr / 2, 0)],
      seg([-0.15, ep - 0.03, 0], [-0.22, j * 0.45, 0.04], 0.035, 0.025),
      seg([0.15, ep - 0.03, 0], [0.22, j * 0.45, 0.04], 0.035, 0.025),
      [new T.SphereGeometry(0.11, 10, 8), c, _mx(T, 0, ep + 0.16, 0, 0, 0, 0, [0.9, 1.25, 0.95])]
    ]);
    g.yeuxS = _fusion(T, [-0.04, 0.04].map(function (dx) {
      return [new T.SphereGeometry(0.022, 6, 4), COULEURS.yeux, _mx(T, dx, ep + 0.18, 0.095)];
    }));
  }

  function _gabarits(p, ctx) {
    const T = ctx.THREE, h = ctx.hauteur, g = {};
    const lam = function (c) { return new T.MeshLambertMaterial({ color: c }); };
    _gabaritEgare(T, g, Math.min(1.6, h * 0.78));
    _gabaritSilhouette(T, g, Math.min(2.1, h * 0.95));
    g.caisse = new T.BoxGeometry(0.35, 0.16, 0.22); g.caisse.translate(0, 0.08, 0);
    g.pied = new T.CylinderGeometry(0.04, 0.05, 0.14, 8); g.pied.translate(0, 0.07, 0);
    g.chapeau = new T.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.chapeau.translate(0, 0.13, 0);
    g.flaque = new T.CircleGeometry(0.45, 16); g.flaque.rotateX(-Math.PI / 2); g.flaque.scale(0.9, 1, 1.3);
    g.pileE = _fusion(T, [
      [new T.CylinderGeometry(0.06, 0.06, 0.17, 12), COULEURS.pile, _mx(T, 0, 0.085, 0)],
      [new T.CylinderGeometry(0.061, 0.061, 0.05, 12), COULEURS.pileHaut, _mx(T, 0, 0.19, 0)],
      [new T.CylinderGeometry(0.02, 0.02, 0.025, 8), COULEURS.borne, _mx(T, 0, 0.225, 0)]
    ]);
    // Variantes : même corps, teinte multipliée aux couleurs des sommets.
    const teinte = function (c) { return new T.MeshLambertMaterial({ vertexColors: true, color: c }); };
    const m = { corps: new T.MeshLambertMaterial({ vertexColors: true }), rampant: teinte(COULEURS.rampant),
      hurleur: teinte(COULEURS.hurleur), gardien: teinte(COULEURS.gardien),
      yeux: new T.MeshBasicMaterial({ vertexColors: true }), caisse: lam(COULEURS.caisse),
      pied: lam(COULEURS.pied), chapeau: lam(COULEURS.chapeau),
      // 🩸 Flaque à ras du sol : décalage de profondeur, sinon elle scintille à travers le sol.
      flaque: new T.MeshLambertMaterial({ color: COULEURS.flaque, polygonOffset: true, polygonOffsetFactor: -2,
        polygonOffsetUnits: -2 }) };
    p.gabarits = { g: g, m: m };
  }

  function _maillage(p, ctx, o) {
    const T = ctx.THREE, g = p.gabarits.g, m = p.gabarits.m, grp = new T.Group();
    if (_estMarcheur(o)) {
      // corps (pivot aux pieds, pour la chute) > haut (aux hanches, yeux dedans) + deux jambes.
      const mat = m[o.type] || m.corps;
      const corps = new T.Group(), haut = new T.Mesh(g.hautE, mat), yeux = new T.Mesh(g.yeuxE, m.yeux);
      haut.position.y = g.hanche;
      const bras = new T.Mesh(g.brasE, mat);
      bras.position.copy(g.epaule);
      bras.rotation.x = g.voute;
      haut.add(yeux, bras);
      const jambes = [-0.1, 0.1].map(function (dx) {
        const j = new T.Mesh(g.jambeE, mat);
        j.position.set(dx, g.hanche, 0);
        return j;
      });
      corps.add(haut, jambes[0], jambes[1]);
      grp.add(corps);
      // Gardien : plus large et aussi haut que la galerie le permet ; hurleur un peu plus grand.
      if (o.type === "gardien") {
        const s = Math.max(1.15, Math.min(1.5, ctx.hauteur * 0.97 / (g.hanche / 0.46)));
        grp.scale.set(1.5, s, 1.5);
      }
      if (o.type === "hurleur") grp.scale.setScalar(1.1);
      o.os = { corps: corps, haut: haut, yeux: yeux, bras: bras, jambes: jambes, flaque: null, voute: g.voute,
        hanche: g.hanche };
    }
    if (o.type === "silhouette") grp.add(new T.Mesh(g.corpsS, m.corps), new T.Mesh(g.yeuxS, m.yeux));
    if (o.type === "munitions") grp.add(new T.Mesh(g.caisse, m.caisse));
    if (o.type === "champignon") grp.add(new T.Mesh(g.pied, m.pied), new T.Mesh(g.chapeau, m.chapeau));
    if (o.type === "pile") grp.add(new T.Mesh(g.pileE, m.corps));
    o.mesh = grp;
    _placer(o, ctx);
    ctx.groupe.add(grp);
    if (o.mortT) _poserMort(p, ctx, o, 1, 1);
  }

  // Pose d'un égaré vivant : foulée selon la distance parcourue, balancement, recul d'un coup qui ne tue pas.
  function _poserVivant(o, t) {
    const os = o.os, ph = o.phase || 0, a = o.marche || 0;
    if (!os) return;
    const recul = o.toucheT ? Math.max(0, 1 - (t - o.toucheT) / ANIM.reculMs) : 0;
    if (o.type === "rampant") {
      // À plat ventre (pivot aux pieds, corps basculé vers l'avant), bras qui tirent tour à tour.
      os.corps.rotation.set(ANIM.rampe, 0, Math.sin(ph) * 0.06 * a);
      os.corps.position.set(0, 0.16, -os.hanche * 1.2);
      os.jambes[0].rotation.x = Math.sin(ph) * 0.25 * a;
      os.jambes[1].rotation.x = -Math.sin(ph) * 0.25 * a;
      os.haut.rotation.set(-0.85 - recul * ANIM.recul, 0, 0);
      os.bras.rotation.set(os.voute - 0.6 + Math.sin(ph * 0.5) * 0.5 * a, 0, 0);
      return;
    }
    os.jambes[0].rotation.x = Math.sin(ph) * ANIM.foulee * a;
    os.jambes[1].rotation.x = -Math.sin(ph) * ANIM.foulee * a;
    // Cri du hurleur : tête rejetée en arrière, bras levés.
    const cri = o.criT ? Math.max(0, 1 - (t - o.criT) / REGLES.hurleurs.criMs) : 0;
    const k = cri > 0 ? Math.sin(Math.min(1, (1 - cri) * 4) * Math.PI / 2) * Math.min(1, cri * 4) : 0;
    os.haut.rotation.set(-recul * ANIM.recul - 0.6 * k, 0, Math.sin(ph) * 0.07 * a);
    os.bras.rotation.set(os.voute + Math.cos(ph * 2) * 0.08 * a - recul * 0.6 - 1.8 * k, 0, 0);
  }

  // Chute en arrière (k : 0 → 1), corps couché un peu de biais, yeux éteints, flaque qui s'étale (kf : 0 → 1).
  function _poserMort(p, ctx, o, k, kf) {
    const os = o.os;
    if (!os) return;
    const e = k * k;
    if (o.type === "rampant") {
      // Il s'écrase face contre terre ; la flaque est sous sa tête.
      os.corps.rotation.set(ANIM.rampe + (Math.PI / 2 - ANIM.rampe) * e, 0, (o.biais || 0) * e);
      os.corps.position.set(0, 0.16 - 0.05 * e, -os.hanche * 1.2);
      os.haut.rotation.set(-0.85 + 0.85 * e, 0, 0);
      os.bras.rotation.set(os.voute - 0.6 + 0.3 * e, 0, 0);
      os.yeux.visible = k < 0.5;
      _flaque(p, ctx, o, k, kf, os.hanche * 0.9);
      return;
    }
    os.corps.rotation.set(-Math.PI / 2 * e, 0, (o.biais || 0) * e);
    os.corps.position.y = 0.11 * e;
    os.haut.rotation.set(-0.35 * e, 0, 0);
    os.bras.rotation.set(os.voute + 1.3 * e, 0, 0);
    os.jambes[0].rotation.x = 0.15 * e;
    os.jambes[1].rotation.x = -0.1 * e;
    os.yeux.visible = k < 0.5;
    _flaque(p, ctx, o, k, kf, -p.gabarits.g.hanche * 1.1);
  }

  // Flaque sous le corps (z : où, en m le long du corps), qui s'étale une fois le corps au sol.
  function _flaque(p, ctx, o, k, kf, z) {
    const os = o.os;
    if (!os.flaque && k >= 1) {
      os.flaque = new ctx.THREE.Mesh(p.gabarits.g.flaque, p.gabarits.m.flaque);
      os.flaque.position.set(0, 0.012, z);
      o.mesh.add(os.flaque);
    }
    if (os.flaque) os.flaque.scale.setScalar(0.2 + 0.8 * Math.min(1, kf));
  }

  function _placer(o, ctx) {
    if (!o.mesh) return;
    o.mesh.position.set(o.x / ctx.sc, 0, o.y / ctx.sc);
    if (o.mortT) o.mesh.rotation.y = o.lacet || 0;
    else if (_estMarcheur(o) || o.type === "silhouette") {
      const pos = ctx.pos;
      o.mesh.rotation.y = Math.atan2(pos.x - o.x, pos.y - o.y);
    }
  }

  // neuf : true après une reprise du contexte (gabarits refaits, rien n'est libéré).
  function dessiner(p, ctx, neuf) {
    if (neuf || !p.gabarits) _gabarits(p, ctx);
    p.ennemis.concat(p.objets, p.cadavres || []).forEach(function (o) {
      if (o.mesh && !neuf && o.mesh.parent === ctx.groupe) return;
      if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh);
      _maillage(p, ctx, o);
    });
  }

  function _retirer(o) { if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh); o.mesh = null; o.os = null; }

  function vider(p) {
    p.ennemis.concat(p.objets, p.cadavres || []).forEach(_retirer);
    p.ennemis = []; p.objets = []; p.cadavres = []; p.mondes = {};
  }

  // Égaré tué : il tombe et reste au sol (les `ANIM.cadavres` derniers ; le plus ancien disparaît).
  function _abattre(p, o) {
    o.mortT = performance.now();
    o.lacet = o.mesh ? o.mesh.rotation.y : 0;
    o.biais = (Math.random() - 0.5) * 0.5;
    p.ennemis = p.ennemis.filter(function (e) { return e !== o; });
    p.cadavres = (p.cadavres || []).concat([o]);
    while (p.cadavres.length > ANIM.cadavres) _retirer(p.cadavres.shift());
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
    if ((o.type === "egare" || o.type === "rampant") && o.direct && d <= C.m && t >= (o.chargeProchaine || 0)) {
      o.chargeFin = t + C.s * 1000;
      o.chargeProchaine = o.chargeFin + C.repos * 1000;
    }
    let vit = o.chargeFin && t < o.chargeFin ? v * C.x : v;
    if (o.enrageFin && t < o.enrageFin) vit *= REGLES.hurleurs.enrageX;
    if (dansEau(ctx, o.x, o.y)) vit *= REGLES.eau.x;
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
      if (p.ennemis.filter(_estMarcheur).length >= E.total + REGLES.embuscade.enPlus) break;
      const a = Math.random() * Math.PI * 2, rr = Math.random() * r;
      const q = { x: centre.x + Math.cos(a) * rr, y: centre.y + Math.sin(a) * rr };
      if (_d(q, ctx.pos, sc) < 4 || !placeOk(ctx, q.x, q.y)) continue;
      const e = { type: "egare", x: q.x, y: q.y, pv: E.pv, vitesse: vitesse, coupT: 0, grogneT: Math.random() * 2 };
      p.ennemis.push(e);
      _maillage(p, ctx, e);
      poses++;
    }
    return poses;
  }

  // La silhouette est-elle dans le faisceau ? (distance de vue × lampe de 0 à 1, cône de la lampe, rien entre elle
  // et soi) ; lampe à plat, elle ne se voit plus qu'à bout portant et bouge librement.
  function dansFaisceau(ctx, o, lampe) {
    const S = REGLES.silhouette, pos = ctx.pos, d = _d(o, pos, ctx.sc);
    if (d > S.vue * Math.max(0.08, lampe === undefined ? 1 : lampe)) return false;
    const ang = Math.atan2(o.x - pos.x, -(o.y - pos.y)) * 180 / Math.PI;
    let ecart = Math.abs(((ang - ctx.cap) % 360 + 540) % 360 - 180);
    if (ecart > S.faisceau) return false;
    return !ctx.ligneBloquee(pos.x, pos.y, o.x, o.y);
  }

  // → { degats, sons: [[nom, force]], ramasse: [type] }
  function animer(p, ctx, dt) {
    const t0 = performance.now(), t = t0, pos = ctx.pos, sc = ctx.sc, E = REGLES.egares, S = REGLES.silhouette;
    const r = { degats: 0, sons: [], ramasse: [], hurle: false };
    const pas = [];
    // Menaces pensées à `iaHz` par seconde (pas à chaque image) : le coût ne monte plus avec la cadence d'affichage.
    p.iaAcc = (p.iaAcc || 0) + dt;
    const pense = p.iaAcc >= 1 / REGLES.iaHz, dtIa = p.iaAcc;
    if (pense) p.iaAcc = 0;
    p.ennemis.slice().forEach(function (o) {
      const d = _d(o, pos, sc);
      if (o.type === "gardien") _gardien(p, ctx, o, d, pense, dtIa, t, r, dt);
      else if (_estMarcheur(o)) {
        if (d <= E.contact) r.degats += E.degatsParS * dt;
        else if (pense) _versJoueur(p, ctx, o, o.vitesse, dtIa, t);
        if (o.type === "hurleur" && pense) _hurler(p, ctx, o, d, t, r);
        o.grogneT -= dt;
        if (o.grogneT <= 0 && d < 20) {
          r.sons.push(["grogne", 1 - d / 20, angle(ctx, o)]);
          o.grogneT = 4 + Math.random() * 5;
        }
      } else {
        if (pense) {
          o.vu = dansFaisceau(ctx, o, p.lampeK);
          if (!o.vu) _versJoueur(p, ctx, o, S.vitesse, dtIa, t);
        }
        if (_d(o, pos, sc) <= S.contact) {
          r.degats += S.degats; r.sons.push(["blesse", 1]); _eloigner(p, ctx, o);
        }
      }
      if (pense) _placer(o, ctx);
      // Foulée : vitesse relue à chaque pensée (la place ne change qu'alors), phase avancée à chaque image pour des
      // jambes fluides ; à l'arrêt l'amplitude s'éteint en douceur.
      if (_estMarcheur(o)) {
        if (pense) {
          const fait = o.avantX === undefined ? 0 : Math.hypot(o.x - o.avantX, o.y - o.avantY) / sc;
          o.avantX = o.x; o.avantY = o.y;
          o.vitPas = fait / Math.max(dtIa, 1e-3);
        }
        const avant = Math.floor((o.phase || 0) / Math.PI);
        o.phase = (o.phase || 0) + (o.vitPas || 0) * dt * ANIM.pasParM;
        o.marche = (o.marche || 0) + ((o.vitPas > 0.05 ? 1 : 0) - (o.marche || 0)) * Math.min(1, dt * 6);
        // Un pas posé (demi-foulée) près de soi : bruit situé, les plus proches seulement.
        if (Math.floor(o.phase / Math.PI) !== avant && d < REGLES.pas.rayonM && Math.random() >= REGLES.pas.saut) {
          pas.push([d, o]);
        }
        _poserVivant(o, t);
      }
    });
    pas.sort(function (a, b) { return a[0] - b[0]; }).slice(0, REGLES.pas.parImage).forEach(function (x) {
      const k = 1 - x[0] / REGLES.pas.rayonM;
      const f = k * k * (x[1].type === "gardien" ? 1.6 : x[1].type === "rampant" ? 0.5 : 1);
      r.sons.push(["pas", f, angle(ctx, x[1])]);
    });
    (p.cadavres || []).forEach(function (o) {
      if (o.posee) return;
      const k = Math.min(1, (t - o.mortT) / ANIM.chuteMs), kf = (t - o.mortT - ANIM.chuteMs) / ANIM.flaqueMs;
      _poserMort(p, ctx, o, k, Math.max(0, kf));
      if (kf >= 1) o.posee = true;
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

  // Gardien : reste près de B tant que le joueur n'est pas en vue (ou qu'il ne l'a pas touché), puis le poursuit.
  function _gardien(p, ctx, o, d, pense, dtIa, t, r, dt) {
    const G = REGLES.gardien, sc = ctx.sc;
    if (d <= REGLES.egares.contact * 1.3) { r.degats += G.degatsParS * dt; return; }
    if (!pense) return;
    const voit = d <= G.vue && !ctx.ligneBloquee(o.x, o.y, ctx.pos.x, ctx.pos.y);
    if (voit && !o.chasse) { o.chasse = true; r.sons.push(["rugit", 1, angle(ctx, o)]); }
    if (o.chasse && d > G.vue * 2.5) o.chasse = false;
    if (o.chasse) { _versJoueur(p, ctx, o, o.vitesse, dtIa, t); return; }
    if (o.garde && _d(o, o.garde, sc) > G.garde) _avancer(o, ctx, o.garde.x, o.garde.y, o.vitesse, dtIa, true);
  }

  // Hurleur en vue du joueur : cri, les marcheurs proches accourent, des égarés sortent du noir près de lui.
  function _hurler(p, ctx, o, d, t, r) {
    const H = REGLES.hurleurs, sc = ctx.sc;
    if (!o.direct || d > H.vue || t - (o.criT || -1e9) < H.repos * 1000) return;
    o.criT = t;
    r.hurle = true;
    r.sons.push(["hurle", Math.max(0.4, 1 - d / 30), angle(ctx, o)]);
    p.ennemis.forEach(function (e) {
      if (_estMarcheur(e) && e !== o && _d(e, o, sc) <= H.rayon) e.enrageFin = t + H.enrage * 1000;
    });
    surgir(p, ctx, o, H.renfort, 5);
  }

  // La silhouette touchée (tir, contact) repart loin, hors de vue.
  function _eloigner(p, ctx, o) {
    const A = REGLES.apparition, q = _choisir(ctx, _pointsDesTraces(ctx.niveau).tous, A.min + 10, A.max + 15, []);
    if (q) { o.x = q.x; o.y = q.y; }
    o.noeud = undefined;
    _placer(o, ctx);
  }

  // ── Tir ───────────────────────────────────────────────────────────────────────────────────────────────

  // Coup de fusil dans l'axe du regard → { touche: null | type touché, tue, lache }
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
    cible.toucheT = performance.now();
    if (cible.type === "gardien" && cible.pv > 0) {
      // Il encaisse en reculant, et ne garde plus : il poursuit.
      const l = Math.max(1e-6, dMin * sc), G = REGLES.gardien;
      const k = G.reculM * sc / l;
      _avancer(cible, ctx, cible.x + (cible.x - pos.x) * k, cible.y + (cible.y - pos.y) * k, G.reculM * 20, 0.05, true);
      cible.chasse = true;
      _placer(cible, ctx);
    }
    if (cible.pv <= 0) {
      res.tue = true;
      _abattre(p, cible);
      // Le gardien lâche toujours santé et cartouches ; un autre, parfois un champignon.
      const laches = cible.type === "gardien" ? ["champignon", "munitions"]
        : Math.random() < REGLES.champignons.lacher ? ["champignon"] : [];
      laches.forEach(function (type, i) {
        const o = { type: type, x: cible.x + (i ? 0.7 * sc : 0), y: cible.y };
        p.objets.push(o);
        _maillage(p, ctx, o);
        res.lache = true;
      });
    }
    return res;
  }

  window.KtaAddons = window.KtaAddons || {};
  window.KtaAddons.mkmgMonde = { REGLES: REGLES, peupler: peupler, animer: animer, tirer: tirer, dessiner: dessiner,
    vider: vider, liberer: liberer, dansFaisceau: dansFaisceau, surgir: surgir, placeOk: placeOk,
    poserGardien: poserGardien, changerNiveau: changerNiveau, nouveau: nouveau, dansEau: dansEau, zonesDe: zonesDe,
    angle: angle };
})();
