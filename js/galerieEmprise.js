/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// galerieEmprise.js — emprise des galeries d'un niveau : les tracés vus comme des couloirs d'une largeur par type
// (principal 2,5 m, secondaire 2 m, chemin 1,7 m, type perso 2 m ; ni l'itinéraire ni une jonction).
// Expose window.KtaGalerie : largeur(type) → m, modele(niveau) → modèle en coordonnées plan (px) | null,
//   dedans(x, y, niveau), segmentsBloques(segs, niveau) → [bool] (même forme que
//   tracking.js > ktaSegmentsBloquesParStructure), invalider().
// Modèle : graphe plan des tracés (sommets confondus à 15 cm, croisements coupés, bout libre raccordé au tracé
// voisin s'il s'arrête à moins de 0,5 m de sa paroi) ; une PIÈCE convexe par tronçon (rectangle de sa largeur,
// d'un nœud à l'autre) et, à chaque nœud de degré ≥ 2, les triangles d'un joint : coude en onglet (borné à deux
// demi-largeurs, biseau au-delà) ou dalle de carrefour (degré ≥ 3) dont les parois relient les coins des tubes.
// ⚠️ contrat : l'emprise est l'UNION des pièces ; une paroi est un bord de pièce qui n'est dans aucune autre, d'où
// des tubes coupés au bord de la dalle et aucune paroi qui en traverse une autre, même pour des tracés presque
// parallèles qui se chevauchent. Règle du pas en mode galerie (vue 3D) : rester dans l'emprise (à moins d'une
// demi-largeur d'un tracé ou dans un joint) et hors d'un remblais du niveau.
// 🩸 Le graphe de roadGraph.js ne sert pas ici : c'est un graphe d'itinéraire (croisements en arêtes virtuelles,
// tronçons non coupés, tronçon retiré s'il croise un mur en ligne, types perso exclus), pas une géométrie.
// Doc : docs/architecture/tracking.md § Vue 3D · Garde-fou : scripts/smoke/checkup-vue-3d.js

(function () {
  "use strict";

  const LARGEURS = { principal: 2.5, secondaire: 2, chemin: 1.7 };
  const LARGEUR_PERSO = 2;          // m : type perso, en attendant un réglage par type
  const SANS_TUBE = { itinerary: true, jonction: true };
  const FUSION_M = 0.15;            // m : deux sommets plus proches sont un même nœud
  const ACCROCHE_M = 0.5;           // m : bout libre arrêté à moins de ça de la paroi d'un autre tracé → raccordé
  const ONGLET_MAX = 2;             // en demi-largeurs : pointe d'onglet plus loin du nœud → biseau
  const DALLE_MAX_M = 4;            // m : recul maximal d'une coupe autour d'un nœud (angles très aigus)
  const CASE_M = 4;                 // m : maille des grilles de recherche
  const PAS_M = 0.05;               // m : pas d'échantillonnage d'un segment jugé par segmentsBloques
  const MEMO_MS = 250;              // signature des données relue au plus tous les MEMO_MS

  const _cache = new Map();         // niveau → { sig, modele }
  let _sig = null, _sigT = 0;

  function largeur(type) { return SANS_TUBE[type] ? 0 : (LARGEURS[type] || LARGEUR_PERSO); }

  function _echelle() {
    const sc = Number(window.APP_CONFIG && window.APP_CONFIG.scale);
    return Number.isFinite(sc) && sc > 0 ? sc : 0;
  }

  function _tab(f) { try { return (typeof f === "function" ? f() : []) || []; } catch (err) { return []; } }

  function _routes() {
    return _tab(window.getRoads).filter(function (r) { return r && !r._preview; })
      .concat(_tab(window.getAllEmbeddedRoads));
  }

  function _zones() { return _tab(window.getZones).concat(_tab(window.getAllEmbeddedZones)); }

  // Signature bon marché (comme roadGraph.js) : nombre, sommets et niveaux des tracés et zones, échelle.
  function _signature() {
    const t = performance.now();
    if (_sig !== null && t - _sigT < MEMO_MS) return _sig;
    let h = 0;
    const mel = function (v) { h = Math.imul(h ^ (v | 0), 16777619); };
    const lire = function (liste) {
      mel(liste.length);
      for (let i = 0; i < liste.length; i++) {
        const o = liste[i];
        if (!o || !Array.isArray(o.points)) continue;
        mel(o.points.length); mel(o.level); mel(String(o.type || "").length);
        const p = o.points[0], q = o.points[o.points.length - 1];
        if (p && q) { mel(p.x * 10); mel(p.y * 10); mel(q.x * 10); mel(q.y * 10); }
      }
    };
    lire(_routes());
    lire(_zones());
    _sig = h + ":" + _echelle();
    _sigT = t;
    return _sig;
  }

  function invalider() { _cache.clear(); _sig = null; }

  function _surNiveau(o, niveau) {
    return niveau === null || niveau === undefined || (Number.isInteger(o.level) ? o.level : 0) === niveau;
  }

  // ── Grille de recherche (px) ──────────────────────────────────────────────────────────────────────

  function Grille(c) { this.c = c; this.m = new Map(); }
  Grille.prototype.poser = function (i, x0, y0, x1, y1) {
    const c = this.c;
    for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
      for (let gy = Math.floor(y0 / c); gy <= Math.floor(y1 / c); gy++) {
        const k = gx + "," + gy;
        let l = this.m.get(k);
        if (!l) this.m.set(k, l = []);
        l.push(i);
      }
    }
  };
  Grille.prototype.pres = function (x0, y0, x1, y1) {
    const c = this.c, vus = new Set();
    for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
      for (let gy = Math.floor(y0 / c); gy <= Math.floor(y1 / c); gy++) {
        const l = this.m.get(gx + "," + gy);
        if (l) for (let n = 0; n < l.length; n++) vus.add(l[n]);
      }
    }
    return Array.from(vus);
  };
  Grille.prototype.case = function (x, y) {
    return this.m.get(Math.floor(x / this.c) + "," + Math.floor(y / this.c)) || [];
  };

  // ── Géométrie ────────────────────────────────────────────────────────────────────────────────────

  function _aire(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    return a / 2;
  }

  // Pièce convexe de sens positif (intérieur à gauche de chaque bord).
  function _piece(pts, type, genre) {
    if (_aire(pts) < 0) pts.reverse();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      x0 = Math.min(x0, pts[i][0]); x1 = Math.max(x1, pts[i][0]);
      y0 = Math.min(y0, pts[i][1]); y1 = Math.max(y1, pts[i][1]);
    }
    return { pts: pts, type: type, genre: genre, x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // Point dans une pièce convexe de sens positif ; `tol` (px) > 0 élargit, < 0 resserre.
  function dansPiece(P, x, y, tol) {
    const pts = P.pts, t = tol || 0;
    if (x < P.x0 - t || x > P.x1 + t || y < P.y0 - t || y > P.y1 + t) return false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const ax = pts[j][0], ay = pts[j][1], bx = pts[i][0], by = pts[i][1];
      const l = Math.hypot(bx - ax, by - ay);
      if (l < 1e-9) continue;
      if (((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / l < -t) return false;
    }
    return true;
  }

  function _dansAnneau(a, x, y) {
    let r = false;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const p = a[i], q = a[j];
      if ((p.y > y) !== (q.y > y) && x < (q.x - p.x) * (y - p.y) / (q.y - p.y) + p.x) r = !r;
    }
    return r;
  }

  // ── Construction du modèle ───────────────────────────────────────────────────────────────────────

  function _construire(niveau, sc) {
    const fusion = FUSION_M * sc, noeuds = [], gN = new Grille(CASE_M * sc);
    const noeud = function (x, y) {
      const l = gN.pres(x - fusion, y - fusion, x + fusion, y + fusion);
      for (let i = 0; i < l.length; i++) {
        const n = noeuds[l[i]];
        if (Math.hypot(n.x - x, n.y - y) <= fusion) return l[i];
      }
      noeuds.push({ x: x, y: y });
      gN.poser(noeuds.length - 1, x, y, x, y);
      return noeuds.length - 1;
    };
    // 1. Tronçons bruts.
    const segs = [];
    _routes().forEach(function (r) {
      if (!r || !Array.isArray(r.points) || r.points.length < 2 || !_surNiveau(r, niveau)) return;
      const l = largeur(r.type);
      if (!l) return;
      let prec = null;
      for (let i = 0; i < r.points.length; i++) {
        const p = r.points[i];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        const n = noeud(p.x, p.y);
        if (prec !== null && prec !== n) segs.push({ a: prec, b: n, w: l * sc / 2, type: r.type, coupes: [] });
        prec = n;
      }
    });
    const gS = new Grille(CASE_M * sc);
    const poserSeg = function (i) {
      const s = segs[i], a = noeuds[s.a], b = noeuds[s.b];
      gS.poser(i, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
    };
    for (let i = 0; i < segs.length; i++) poserSeg(i);
    // 2. Croisements : un nœud au point de croisement, les deux tronçons y seront coupés.
    const nSegs = segs.length;
    for (let i = 0; i < nSegs; i++) {
      const s = segs[i], a = noeuds[s.a], b = noeuds[s.b];
      const cand = gS.pres(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
      for (let c = 0; c < cand.length; c++) {
        const j = cand[c];
        if (j <= i) continue;
        const u = segs[j];
        if (u.a === s.a || u.a === s.b || u.b === s.a || u.b === s.b) continue;
        const p = noeuds[u.a], q = noeuds[u.b];
        const d = (b.x - a.x) * (q.y - p.y) - (b.y - a.y) * (q.x - p.x);
        if (Math.abs(d) < 1e-9) continue;
        const t = ((p.x - a.x) * (q.y - p.y) - (p.y - a.y) * (q.x - p.x)) / d;
        const v = ((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / d;
        if (t < 0 || t > 1 || v < 0 || v > 1) continue;
        const n = noeud(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y));
        if (n !== s.a && n !== s.b) s.coupes.push(n);
        if (n !== u.a && n !== u.b) u.coupes.push(n);
      }
    }
    // 3. Bouts libres raccordés au tracé voisin (dessin imprécis : arrêté juste avant ou après la paroi).
    const degre = new Array(noeuds.length).fill(0);
    segs.forEach(function (s) { degre[s.a]++; degre[s.b]++; s.coupes.forEach(function (n) { degre[n] += 2; }); });
    const ajouts = [];
    for (let i = 0; i < nSegs; i++) {
      const s = segs[i];
      [s.a, s.b].forEach(function (e) {
        if (degre[e] !== 1) return;
        const E = noeuds[e], marge = ACCROCHE_M * sc + 1.5 * sc;
        let best = null;
        gS.pres(E.x - marge, E.y - marge, E.x + marge, E.y + marge).forEach(function (j) {
          const u = segs[j];
          if (j === i || u.a === e || u.b === e) return;
          const p = noeuds[u.a], q = noeuds[u.b], dx = q.x - p.x, dy = q.y - p.y, l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((E.x - p.x) * dx + (E.y - p.y) * dy) / l2)) : 0;
          const x = p.x + t * dx, y = p.y + t * dy, d = Math.hypot(E.x - x, E.y - y);
          if (d <= u.w + ACCROCHE_M * sc && (!best || d < best.d)) best = { d: d, j: j, x: x, y: y };
        });
        if (!best) return;
        const n = noeud(best.x, best.y), u = segs[best.j];
        if (n === e) return;
        if (n !== u.a && n !== u.b) u.coupes.push(n);
        degre[e]++;
        ajouts.push({ a: e, b: n, w: s.w, type: s.type, coupes: [] });
      });
    }
    // 4. Arêtes finales : chaque tronçon coupé à ses nœuds intérieurs, doublons fusionnés (plus large gardée).
    const aretes = [], vues = new Map();
    segs.concat(ajouts).forEach(function (s) {
      const a = noeuds[s.a], b = noeuds[s.b], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const chaine = [s.a].concat(s.coupes.filter(function (n, k, t) { return t.indexOf(n) === k; })
        .sort(function (m, n) {
          const P = noeuds[m], Q = noeuds[n];
          return ((P.x - a.x) * dx + (P.y - a.y) * dy) / l2 - ((Q.x - a.x) * dx + (Q.y - a.y) * dy) / l2;
        }), [s.b]);
      for (let k = 0; k + 1 < chaine.length; k++) {
        const m = chaine[k], n = chaine[k + 1];
        if (m === n) continue;
        const cle = Math.min(m, n) + "," + Math.max(m, n);
        const deja = vues.get(cle);
        if (deja !== undefined) {
          if (s.w > aretes[deja].w) { aretes[deja].w = s.w; aretes[deja].type = s.type; }
          continue;
        }
        vues.set(cle, aretes.length);
        aretes.push({ a: m, b: n, w: s.w, type: s.type });
      }
    });
    const incid = noeuds.map(function () { return []; });
    aretes.forEach(function (r, i) {
      const A = noeuds[r.a], B = noeuds[r.b];
      r.ax = A.x; r.ay = A.y; r.bx = B.x; r.by = B.y; r.l = Math.hypot(B.x - A.x, B.y - A.y);
      incid[r.a].push(i); incid[r.b].push(i);
    });
    // 5. Pièces : rectangle par arête, joint (triangles en éventail autour du nœud) par nœud de degré ≥ 2.
    const pieces = [];
    aretes.forEach(function (r, i) {
      if (r.l < 1e-9) return;
      const nx = -(r.by - r.ay) / r.l * r.w, ny = (r.bx - r.ax) / r.l * r.w;
      const p = _piece([[r.ax - nx, r.ay - ny], [r.bx - nx, r.by - ny], [r.bx + nx, r.by + ny], [r.ax + nx, r.ay + ny]],
        r.type, "tube");
      p.arete = i;
      pieces.push(p);
    });
    let dalles = 0, coudes = 0, bouts = 0;
    for (let v = 0; v < noeuds.length; v++) {
      const k = incid[v].length;
      if (k === 1) bouts++;
      if (k < 2) continue;
      const tri = _joint(noeuds[v], incid[v].map(function (i) { return aretes[i]; }), v, sc);
      if (!tri.length) continue;
      if (k >= 3) dalles++; else coudes++;
      const larges = incid[v].map(function (i) { return aretes[i]; }).sort(function (p, q) { return q.w - p.w; });
      tri.forEach(function (t) {
        const p = _piece(t, larges[0].type, k >= 3 ? "dalle" : "coude");
        p.noeud = v;
        pieces.push(p);
      });
    }
    const gP = new Grille(CASE_M * sc), gA = new Grille(CASE_M * sc);
    pieces.forEach(function (p, i) { gP.poser(i, p.x0, p.y0, p.x1, p.y1); });
    aretes.forEach(function (r, i) {
      gA.poser(i, Math.min(r.ax, r.bx) - r.w, Math.min(r.ay, r.by) - r.w, Math.max(r.ax, r.bx) + r.w,
        Math.max(r.ay, r.by) + r.w);
    });
    // Remblais du niveau : ils bouchent la galerie (règle du pas).
    const remblais = [], gR = new Grille(CASE_M * sc);
    _zones().forEach(function (z) {
      if (!z || z.type !== "remblais" || !Array.isArray(z.points) || z.points.length < 3) return;
      if (!_surNiveau(z, niveau)) return;
      const a = z.points.filter(function (p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      a.forEach(function (p) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      });
      remblais.push(a);
      gR.poser(remblais.length - 1, x0, y0, x1, y1);
    });
    return {
      niveau: niveau, sc: sc, noeuds: noeuds, aretes: aretes, pieces: pieces,
      degres: incid.map(function (l) { return l.length; }),
      dalles: dalles, coudes: coudes, bouts: bouts,
      piecesPres: function (x0, y0, x1, y1) { return gP.pres(x0, y0, x1, y1); },
      aretesPres: function (x0, y0, x1, y1) { return gA.pres(x0, y0, x1, y1); },
      dedans: function (x, y) {
        const l = gP.case(x, y);
        for (let i = 0; i < l.length; i++) { if (dansPiece(pieces[l[i]], x, y, 1e-6)) return true; }
        return false;
      },
      enRemblais: function (x, y) {
        const l = gR.case(x, y);
        for (let i = 0; i < l.length; i++) { if (_dansAnneau(remblais[l[i]], x, y)) return true; }
        return false;
      },
      // Axe le plus proche à moins de `rayon` px → { d, x, y (projection), w, arete } | null.
      plusProche: function (x, y, rayon) {
        let best = null;
        gA.pres(x - rayon, y - rayon, x + rayon, y + rayon).forEach(function (i) {
          const r = aretes[i], dx = r.bx - r.ax, dy = r.by - r.ay, l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((x - r.ax) * dx + (y - r.ay) * dy) / l2)) : 0;
          const px = r.ax + t * dx, py = r.ay + t * dy, d = Math.hypot(x - px, y - py);
          if (d <= rayon && (!best || d < best.d)) best = { d: d, x: px, y: py, w: r.w, arete: i };
        });
        return best;
      }
    };
  }

  // Joint d'un nœud (px) → triangles convexes de sens positif autour de lui. Arêtes triées par angle ; entre deux
  // voisines : ouverture < 180° → coins au point où leurs parois se coupent (coupe reculée d'autant, bornée) ;
  // ouverture ≥ 180° → coins au nœud, plus la pointe d'onglet si elle reste à ONGLET_MAX demi-largeurs.
  // Les parois entre deux branches relient leurs coins (dalle) : elles ne traversent aucun tube voisin.
  function _joint(V, aretes, v, sc) {
    const br = aretes.map(function (r) {
      const sens = r.a === v ? 1 : -1;
      const dx = (r.bx - r.ax) * sens, dy = (r.by - r.ay) * sens, l = r.l || 1;
      return { ux: dx / l, uy: dy / l, w: r.w, l: l, ang: Math.atan2(dy, dx), recul: 0 };
    }).sort(function (p, q) { return p.ang - q.ang; });
    const k = br.length, ouv = [];
    for (let i = 0; i < k; i++) {
      const p = br[i], q = br[(i + 1) % k];
      let a = q.ang - p.ang;
      if (i === k - 1) a += 2 * Math.PI;
      ouv.push(a);
      if (a < Math.PI - 1e-3 && a > 1e-6) {
        const s = Math.sin(a), c = Math.cos(a);
        p.recul = Math.max(p.recul, (q.w + p.w * c) / s);
        q.recul = Math.max(q.recul, (p.w + q.w * c) / s);
      }
    }
    br.forEach(function (b) { b.d = Math.max(0, Math.min(b.recul, DALLE_MAX_M * sc, b.l / 2)); });
    const coin = function (b, d, cote) {   // cote +1 = côté de la branche suivante (angle croissant)
      return [V.x + d * b.ux - cote * b.w * b.uy, V.y + d * b.uy + cote * b.w * b.ux];
    };
    const pts = [];
    for (let i = 0; i < k; i++) {
      const b = br[i], avant = ouv[(i - 1 + k) % k], apres = ouv[i], q = br[(i + 1) % k];
      pts.push(coin(b, avant < Math.PI - 1e-3 ? b.d : 0, -1));
      pts.push(coin(b, apres < Math.PI - 1e-3 ? b.d : 0, 1));
      if (apres >= Math.PI - 1e-3) {
        // Pointe d'onglet : intersection des parois prolongées en arrière du nœud.
        const P = coin(b, 0, 1), Q = coin(q, 0, -1);
        const det = b.ux * (-q.uy) - b.uy * (-q.ux);
        if (Math.abs(det) > 1e-9) {
          const rx = Q[0] - P[0], ry = Q[1] - P[1];
          const s = (rx * (-q.uy) - ry * (-q.ux)) / det, t = (b.ux * ry - b.uy * rx) / det;
          const M = [P[0] + s * b.ux, P[1] + s * b.uy];
          const loin = Math.hypot(M[0] - V.x, M[1] - V.y) > ONGLET_MAX * Math.max(b.w, q.w);
          if (s <= 1e-6 && t <= 1e-6 && !loin) pts.push(M);
        }
      }
    }
    const tri = [], c = [V.x, V.y], seuil = 1e-4 * sc * sc;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const t = [c, p, q];
      if (_aire(t) > seuil) tri.push([[c[0], c[1]], [p[0], p[1]], [q[0], q[1]]]);
    }
    return tri;
  }

  // ── API ──────────────────────────────────────────────────────────────────────────────────────────

  function modele(niveau) {
    const sc = _echelle();
    if (!sc) return null;
    const n = Number.isInteger(niveau) ? niveau : null;
    const sig = _signature(), c = _cache.get(n);
    if (c && c.sig === sig) return c.modele;
    const t0 = performance.now();
    const m = _construire(n, sc);
    m.msConstruction = performance.now() - t0;
    _cache.set(n, { sig: sig, modele: m });
    return m;
  }

  function dedans(x, y, niveau) {
    const m = modele(niveau);
    return !!m && m.dedans(x, y) && !m.enRemblais(x, y);
  }

  // Segments [x0, y0, x1, y1] (px) → true si une partie sort de l'emprise ou entre dans un remblais. Niveau sans
  // galerie : rien n'arrête (true partout figerait la vue dans le vide).
  function segmentsBloques(segs, niveau) {
    const m = modele(niveau);
    if (!m || !m.pieces.length) return segs.map(function () { return false; });
    const pas = PAS_M * m.sc;
    return segs.map(function (s) {
      const l = Math.hypot(s[2] - s[0], s[3] - s[1]), n = Math.max(1, Math.ceil(l / pas));
      for (let i = 0; i <= n; i++) {
        const x = s[0] + (s[2] - s[0]) * i / n, y = s[1] + (s[3] - s[1]) * i / n;
        if (!m.dedans(x, y) || m.enRemblais(x, y)) return true;
      }
      return false;
    });
  }

  window.KtaGalerie = {
    LARGEURS: Object.assign({}, LARGEURS), LARGEUR_PERSO: LARGEUR_PERSO,
    largeur: largeur, modele: modele, dedans: dedans, segmentsBloques: segmentsBloques, invalider: invalider,
    dansPiece: dansPiece
  };
})();
