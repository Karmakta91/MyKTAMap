/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// additionnerStructures.js — « Additionner » : fondre en UNE des structures en surface voisines, du même type et du
// même niveau, que le trait d'un plan scanné (ou un dessin imprécis) a séparées. Mode ouvert depuis l'outil
// Structures et l'📊 Éditeur de données : on touche la première, puis chaque voisine (re-toucher en retire une),
// puis Valider ou Annuler ; il reste actif jusque-là. Écart comblé jusqu'à la tolérance (px de l'image, TOL_DEFAUT,
// réglable dans le bandeau), chevauchement accepté, au-delà : refus, rien de modifié.
// Géométrie (unir) : sommets aimantés au bord voisin à moins de la tolérance, puis union par bords comme
// galerieEmprise.js > _parois (bord coupé aux croisements, morceau gardé si le point juste dehors n'est pas dans
// l'autre forme), morceaux chaînés en anneaux ; seul le contour extérieur reste : un trou est perdu (décision produit).
// ⚠️ contrat : la première touchée garde uid, nom, description et ses autres champs ; les autres sont retirées (trace
//   de suppression posée par HistoryManager.record, donc synchro) ; une étape ⏪ ; textes perdus listés avant
//   (ktaConfirm) ; `mktm:objets-additionnes` annonce { famille, uid, absorbes } APRÈS l'écriture (community-server-
//   line.md §3 : une extension y rattache ce qu'elle tient par uid). Photos, favoris et liaisons : points seulement.
// 🔒 Lecture seule : ni ouverture ni Valider (ktaEditionRefusee). Objets de session seulement (calque : « Modifier »).
// 🩸 Bandeau `.kta-iti-floater` : aucune fiche ne s'ouvre au toucher (utils.js > _modeClicCarteActif) ; inscrit au
//   registre des modes (interface.js > ktaInscrireModeClic), un autre outil ou Échap le ferme.
// Expose window.KtaAdditionner = { ouvrir, fermer, valider, etat, unir, ecart, preparer, appliquer, TOL_DEFAUT }.
// Garde-fous : scripts/check-additionner.js, scripts/smoke/checkup-additionner.js · Doc : plans-loader.md § Additionner

(function (racine) {
  "use strict";

  const TOL_DEFAUT = 6, TOL_MIN = 1, TOL_MAX = 20;   // px de l'image ; une galerie est bien plus large
  const EPS = 1e-3;        // px : point de test juste hors d'un bord, bords confondus
  const NOEUD = 1e-4;      // px : deux bouts de morceaux plus proches sont un même nœud
  const MODE_CLIC = "additionner";
  const VISEE_PX = 12;     // px d'écran : toucher près du trait d'une structure en ligne (refus expliqué)

  // ── Géométrie pure (anneaux [[x, y], …], sens positif : intérieur à gauche, comme galerieEmprise.js) ──

  function _aire(P) {
    let a = 0;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1];
    return a / 2;
  }

  // Sommets doublons retirés, anneau de sens positif ; null si moins de 3 sommets ou aire nulle.
  function _anneau(liste) {
    const out = [];
    (liste || []).forEach(function (p) {
      const x = Array.isArray(p) ? p[0] : p && p.x, y = Array.isArray(p) ? p[1] : p && p.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const d = out[out.length - 1];
      if (!d || Math.hypot(d[0] - x, d[1] - y) > 1e-9) out.push([x, y]);
    });
    const fin = function () { const a = out[0], b = out[out.length - 1]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    while (out.length > 1 && fin() <= 1e-9) out.pop();
    if (out.length < 3 || Math.abs(_aire(out)) < 1e-9) return null;
    if (_aire(out) < 0) out.reverse();
    return out;
  }

  function _dedans(P, x, y) {
    let r = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[i], b = P[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) r = !r;
    }
    return r;
  }

  function _projSeg(a, b, x, y) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
    const px = a[0] + t * dx, py = a[1] + t * dy;
    return { t: t, x: px, y: py, d: Math.hypot(px - x, py - y) };
  }

  // Point du bord de P le plus proche de (x, y) → { k (bord k → k + 1), t, x, y, d }.
  function _proj(P, x, y) {
    let m = null;
    for (let k = 0; k < P.length; k++) {
      const r = _projSeg(P[k], P[(k + 1) % P.length], x, y);
      if (!m || r.d < m.d) { r.k = k; m = r; }
    }
    return m;
  }

  function _croise(a, b, c, d) {
    const o = function (p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); };
    const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  // Écart entre deux anneaux (px) : 0 s'ils se coupent ou si l'un contient l'autre, sinon la plus courte distance
  // entre leurs bords.
  function _ecart(A, B) {
    if (_dedans(B, A[0][0], A[0][1]) || _dedans(A, B[0][0], B[0][1])) return 0;
    let d = Infinity;
    for (let i = 0; i < A.length; i++) {
      const a = A[i], b = A[(i + 1) % A.length];
      for (let j = 0; j < B.length; j++) {
        const c = B[j], e = B[(j + 1) % B.length];
        if (_croise(a, b, c, e)) return 0;
        d = Math.min(d, _projSeg(c, e, a[0], a[1]).d, _projSeg(c, e, b[0], b[1]).d,
          _projSeg(a, b, c[0], c[1]).d, _projSeg(a, b, e[0], e[1]).d);
      }
    }
    return d;
  }
  function ecart(a, b) {
    const A = _anneau(a), B = _anneau(b);
    return A && B ? _ecart(A, B) : Infinity;
  }

  // Distance du point t (0 → 1) du bord a → b au segment c → d : convexe en t.
  function _distAuSeg(a, b, c, d, t) {
    return _projSeg(c, d, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t).d;
  }

  // Partie [t0, t1] du bord a → b à moins de `tol` du segment c → d, ou null (fonction convexe : minimum par
  // trichotomie, bornes par dichotomie).
  function _partieProche(a, b, c, d, tol) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (_distAuSeg(a, b, c, d, m1) <= _distAuSeg(a, b, c, d, m2)) hi = m2; else lo = m1;
    }
    const tm = (lo + hi) / 2;
    if (_distAuSeg(a, b, c, d, tm) > tol) return null;
    const borne = function (dedans, dehors) {
      if (_distAuSeg(a, b, c, d, dehors) <= tol) return dehors;
      for (let i = 0; i < 40; i++) {
        const m = (dedans + dehors) / 2;
        if (_distAuSeg(a, b, c, d, m) <= tol) dedans = m; else dehors = m;
      }
      return dedans;
    };
    return [borne(tm, 0), borne(tm, 1)];
  }

  // Enveloppe convexe (chaîne monotone) → anneau de sens positif, ou null si elle n'a pas d'aire.
  function _enveloppe(pts) {
    const p = pts.slice().sort(function (u, v) { return u[0] - v[0] || u[1] - v[1]; });
    const cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    const bas = [], haut = [];
    p.forEach(function (q) {
      while (bas.length >= 2 && cr(bas[bas.length - 2], bas[bas.length - 1], q) <= 0) bas.pop();
      bas.push(q);
    });
    for (let i = p.length - 1; i >= 0; i--) {
      while (haut.length >= 2 && cr(haut[haut.length - 2], haut[haut.length - 1], p[i]) <= 0) haut.pop();
      haut.push(p[i]);
    }
    const h = bas.slice(0, -1).concat(haut.slice(0, -1));
    return h.length >= 3 && Math.abs(_aire(h)) > 1e-6 ? _anneau(h) : null;
  }

  // Partie [t0, t1] du bord a → b qui fait FACE au segment c → d (pied de la perpendiculaire sur c → d) à moins de
  // `tol` de sa droite, ou null. Les deux conditions sont linéaires en t : intervalle exact.
  function _partieEnFace(a, b, c, d, tol) {
    const ex = d[0] - c[0], ey = d[1] - c[1], L2 = ex * ex + ey * ey, L = Math.sqrt(L2);
    if (L < 1e-9) return null;
    let lo = 0, hi = 1;
    const borner = function (v0, v1, min, max) {   // min ≤ v0 + (v1 − v0) t ≤ max
      const k = v1 - v0;
      if (Math.abs(k) < 1e-12) { if (v0 < min - 1e-12 || v0 > max + 1e-12) hi = -1; return; }
      const ta = (min - v0) / k, tb = (max - v0) / k;
      lo = Math.max(lo, Math.min(ta, tb));
      hi = Math.min(hi, Math.max(ta, tb));
    };
    const u = function (p) { return ((p[0] - c[0]) * ex + (p[1] - c[1]) * ey) / L2; };
    const sd = function (p) { return ((p[0] - c[0]) * ey - (p[1] - c[1]) * ex) / L; };
    borner(u(a), u(b), 0, 1);
    borner(sd(a), sd(b), -tol, tol);
    return (hi - lo) * Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6 ? [lo, hi] : null;
  }

  // Ponts entre deux formes : pour chaque paire de bords (un de chaque) qui ne se touchent pas, l'enveloppe des
  // parties de l'un et de l'autre qui se font face à moins de `tol`. Deux bords de part et d'autre d'un trait : le
  // pont est la bande du trait, ni plus ni moins (un chevauchement reste exact). `general` (seulement si les formes
  // ne se rejoignent pas sans lui, ex. coin contre coin en biais) : parties à moins de `tol` de l'autre bord, en
  // face ou non.
  // 🩸 Aimanter les sommets seuls ne suffit pas : un coin aimanté sans son voisin penche tout le bord (bande en
  // biseau, à moitié comblée).
  function _ponts(A, B, tol, general) {
    const out = [];
    const bb = function (a, b) {
      return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    };
    const at = function (p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    const partie = general ? _partieProche : _partieEnFace;
    for (let i = 0; i < A.length; i++) {
      const a = A[i], b = A[(i + 1) % A.length], ba = bb(a, b);
      for (let j = 0; j < B.length; j++) {
        const c = B[j], d = B[(j + 1) % B.length], bc = bb(c, d);
        if (bc[0] > ba[2] + tol || ba[0] > bc[2] + tol || bc[1] > ba[3] + tol || ba[1] > bc[3] + tol) continue;
        const contact = Math.min(_projSeg(c, d, a[0], a[1]).d, _projSeg(c, d, b[0], b[1]).d,
          _projSeg(a, b, c[0], c[1]).d, _projSeg(a, b, d[0], d[1]).d);
        if (_croise(a, b, c, d) || contact < 1e-9) continue;   // bords qui se touchent : rien à combler
        const pa = partie(a, b, c, d, tol), pc = pa && partie(c, d, a, b, tol);
        if (!pa || !pc) continue;
        const h = _enveloppe([at(a, b, pa[0]), at(a, b, pa[1]), at(c, d, pc[0]), at(c, d, pc[1])]);
        if (h) out.push(h);
      }
    }
    return out;
  }

  // Le point (x, y) est-il sur un bord de même sens (ux, uy) de Q, à EPS près ?
  function _surBordMemeSens(Q, x, y, ux, uy) {
    for (let k = 0; k < Q.length; k++) {
      const a = Q[k], b = Q[(k + 1) % Q.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 1e-9 || ((b[0] - a[0]) * ux + (b[1] - a[1]) * uy) / l < 0.999) continue;
      if (_projSeg(a, b, x, y).d < EPS) return true;
    }
    return false;
  }

  function _boite(P) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    P.forEach(function (p) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    });
    return [x0, y0, x1, y1];
  }

  // Contour de l'UNION de pièces (anneaux de sens positif, non convexes admis) → morceaux [x0, y0, x1, y1].
  // Méthode de galerieEmprise.js > _parois : chaque bord est coupé là où il croise un bord d'une autre pièce (ou le
  // longe) ; un morceau est gardé si le point juste dehors, en son milieu, n'est dans aucune autre pièce (parité).
  // Un morceau confondu avec un bord de même sens d'une pièce d'indice plus petit y est déjà pris (pas de doublon).
  function _contourUnion(pieces) {
    const boites = pieces.map(_boite), out = [];
    pieces.forEach(function (P, ip) {
      const B = boites[ip];
      const vois = [];
      pieces.forEach(function (Q, iq) {
        const C = boites[iq];
        const pres = C[0] <= B[2] + EPS && B[0] <= C[2] + EPS && C[1] <= B[3] + EPS && B[1] <= C[3] + EPS;
        if (iq !== ip && pres) vois.push(iq);
      });
      for (let k = 0; k < P.length; k++) {
        const p = P[k], q = P[(k + 1) % P.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
        if (l < 1e-9) continue;
        const ts = [0, 1];
        vois.forEach(function (iq) {
          const Q = pieces[iq];
          for (let j = 0; j < Q.length; j++) {
            const r = Q[j], s = Q[(j + 1) % Q.length], ex = s[0] - r[0], ey = s[1] - r[1];
            const rx = r[0] - p[0], ry = r[1] - p[1], d = dx * ey - dy * ex;
            if (Math.abs(d) > 1e-12 * l * Math.hypot(ex, ey)) {
              const t = (rx * ey - ry * ex) / d, u = (rx * dy - ry * dx) / d;
              if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
            } else if (Math.abs(rx * dy - ry * dx) / l < EPS) {
              [r, s].forEach(function (z) {
                const t = ((z[0] - p[0]) * dx + (z[1] - p[1]) * dy) / (l * l);
                if (t > 0 && t < 1) ts.push(t);
              });
            }
          }
        });
        ts.sort(function (a, b) { return a - b; });
        const ox = dy / l * EPS, oy = -dx / l * EPS;   // vers l'extérieur (intérieur à gauche)
        for (let n = 0; n + 1 < ts.length; n++) {
          const t0 = ts[n], t1 = ts[n + 1];
          if ((t1 - t0) * l < 1e-6) continue;
          const tm = (t0 + t1) / 2, mx = p[0] + dx * tm, my = p[1] + dy * tm;
          const couvert = vois.some(function (iq) {
            return _dedans(pieces[iq], mx + ox, my + oy) ||
              (iq < ip && _surBordMemeSens(pieces[iq], mx, my, dx / l, dy / l));
          });
          if (!couvert) out.push([p[0] + dx * t0, p[1] + dy * t0, p[0] + dx * t1, p[1] + dy * t1]);
        }
      }
    });
    return out;
  }

  // Morceaux → anneaux. Nœuds confondus à NOEUD près ; à un nœud où deux morceaux repartent (formes qui ne se
  // touchent qu'en un point), le virage le plus à droite longe l'extérieur : un seul anneau fait le tour des deux.
  function _chainer(segs) {
    const C = 1e-3, cases = new Map(), noeuds = [];
    const noeud = function (x, y) {
      const cx = Math.floor(x / C), cy = Math.floor(y / C);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const l = cases.get((cx + i) + ":" + (cy + j));
          if (!l) continue;
          for (let n = 0; n < l.length; n++) {
            const v = noeuds[l[n]];
            if (Math.abs(v[0] - x) <= NOEUD && Math.abs(v[1] - y) <= NOEUD) return l[n];
          }
        }
      }
      noeuds.push([x, y]);
      const cle = cx + ":" + cy;
      if (!cases.has(cle)) cases.set(cle, []);
      cases.get(cle).push(noeuds.length - 1);
      return noeuds.length - 1;
    };
    const aretes = [], sortants = new Map();
    segs.forEach(function (s) {
      const a = noeud(s[0], s[1]), b = noeud(s[2], s[3]);
      if (a === b) return;
      aretes.push({ a: a, b: b, dx: s[2] - s[0], dy: s[3] - s[1], pris: false });
      if (!sortants.has(a)) sortants.set(a, []);
      sortants.get(a).push(aretes.length - 1);
    });
    const anneaux = [];
    aretes.forEach(function (e0) {
      if (e0.pris) return;
      const pts = [noeuds[e0.a]];
      let e = e0;
      e.pris = true;
      for (let pas = 0; pas <= aretes.length; pas++) {
        if (e.b === e0.a) { anneaux.push(pts); return; }
        pts.push(noeuds[e.b]);
        const libres = (sortants.get(e.b) || []).filter(function (i) { return !aretes[i].pris; });
        if (!libres.length) return;   // chaîne ouverte (forme dégénérée) : écartée
        let best = null, bestA = Infinity;
        libres.forEach(function (i) {
          const c = aretes[i];
          const ang = Math.atan2(e.dx * c.dy - e.dy * c.dx, e.dx * c.dx + e.dy * c.dy);
          if (ang < bestA) { bestA = ang; best = c; }
        });
        e = best;
        e.pris = true;
      }
    });
    return anneaux;
  }

  // Sommets alignés (à moins d'un millième de px de la droite de leurs voisins) retirés, arrondi au centième.
  function _simplifier(P) {
    let pts = P.slice(), change = true;
    while (change && pts.length > 3) {
      change = false;
      for (let i = 0; i < pts.length && pts.length > 3; i++) {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        if (_projSeg(a, c, b[0], b[1]).d < EPS) { pts.splice(i, 1); change = true; i--; }
      }
    }
    pts = pts.map(function (p) { return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]; });
    return _anneau(pts);
  }

  // Union de deux formes à moins de `tol` l'une de l'autre → anneau extérieur | null. Ponts en face d'abord ; si le
  // contour obtenu laisse dehors un sommet de l'une ou de l'autre (elles ne se rejoignent pas), ponts généraux.
  function _unionDeux(R, P, tol) {
    const essai = function (general) {
      let best = null, bestA = 0;
      _chainer(_contourUnion([R, P].concat(_ponts(R, P, tol, general)))).forEach(function (ring) {
        const A = _aire(ring);
        if (A > bestA) { bestA = A; best = ring; }
      });
      return best ? _anneau(best) : null;
    };
    const U = essai(false);
    return U && _couvre(U, [R, P], tol) ? U : essai(true);
  }

  // Chaque sommet des formes est dans U ou à moins de `tol` de son bord.
  function _couvre(U, formes, tol) {
    return formes.every(function (Q) {
      return Q.every(function (v) { return _dedans(U, v[0], v[1]) || _proj(U, v[0], v[1]).d <= tol + 1e-6; });
    });
  }

  // Union des formes (listes de { x, y } ou [x, y]) dans l'ordre donné → { ok: true, points: [{ x, y }] } |
  // { ok: false, raison: "forme" | "ecart", ecart?, indice? }. La forme suivante est la plus proche de l'union déjà
  // faite ; au-delà de `tol`, refus « ecart » (indice de cette forme). Contrôle final : chaque sommet d'origine est
  // dans le résultat ou à moins de `tol` de son bord, sinon « forme ».
  function unir(formes, tol) {
    const t = Number.isFinite(tol) && tol >= 0 ? tol : TOL_DEFAUT;
    const P = (formes || []).map(_anneau);
    if (P.length < 2 || P.some(function (x) { return !x; })) return { ok: false, raison: "forme" };
    let R = P[0];
    const reste = P.map(function (x, i) { return i; }).slice(1);
    while (reste.length) {
      let iBest = -1, dBest = Infinity;
      reste.forEach(function (i, n) {
        const d = _ecart(R, P[i]);
        if (d < dBest) { dBest = d; iBest = n; }
      });
      if (dBest > t + 1e-9) return { ok: false, raison: "ecart", ecart: dBest, indice: reste[iBest] };
      const U = _unionDeux(R, P[reste[iBest]], t);
      if (!U) return { ok: false, raison: "forme" };
      R = U;
      reste.splice(iBest, 1);
    }
    R = _simplifier(R);
    if (!R) return { ok: false, raison: "forme" };
    if (!_couvre(R, P, t)) return { ok: false, raison: "forme" };
    return { ok: true, points: R.map(function (p) { return { x: p[0], y: p[1] }; }) };
  }

  // ── Données : préparer (rien d'écrit) puis appliquer ──

  function _niveau(o) { return Number.isInteger(o && o.level) ? o.level : 0; }
  function _texte(v) { return typeof v === "string" ? v.trim() : ""; }

  // `structures` : la liste de la session ; `uids` : la première d'abord ; `opts` { tol, estLigne(type) → bool }.
  // → { ok: true, garde, absorbes, points, pertes: [{ champ: "nom" | "description", valeur }] } |
  //   { ok: false, raison: "minimum" | "disparue" | "ligne" | "type" | "niveau" | "forme" | "ecart", … }.
  function preparer(structures, uids, opts) {
    const o = opts || {};
    const liste = Array.isArray(structures) ? structures : [];
    const objs = (uids || []).map(function (u) {
      return liste.find(function (s) { return s && s.uid === u; }) || null;
    });
    if (objs.length < 2) return { ok: false, raison: "minimum" };
    if (objs.some(function (s) { return !s || !Array.isArray(s.points); })) return { ok: false, raison: "disparue" };
    const estLigne = typeof o.estLigne === "function" ? o.estLigne : function () { return false; };
    const ligne = objs.find(function (s) { return estLigne(s.type); });
    if (ligne) return { ok: false, raison: "ligne", type: ligne.type };
    const garde = objs[0];
    const autre = objs.find(function (s) { return s.type !== garde.type; });
    if (autre) return { ok: false, raison: "type", type: autre.type, ref: garde.type };
    if (objs.some(function (s) { return _niveau(s) !== _niveau(garde); })) return { ok: false, raison: "niveau" };
    const u = unir(objs.map(function (s) { return s.points; }), Number.isFinite(o.tol) ? o.tol : TOL_DEFAUT);
    if (!u.ok) return Object.assign({ ok: false }, u, { uid: u.indice !== undefined ? objs[u.indice].uid : undefined });
    const pertes = [];
    objs.slice(1).forEach(function (s) {
      ["nom", "description"].forEach(function (champ) {
        const v = _texte(s[champ]);
        const deja = pertes.some(function (p) { return p.champ === champ && p.valeur === v; });
        if (v && v !== _texte(garde[champ]) && !deja) {
          pertes.push({ champ: champ, valeur: v });
        }
      });
    });
    return { ok: true, garde: garde, absorbes: objs.slice(1), points: u.points, pertes: pertes };
  }

  // Écrit une préparation dans la session : un instantané, une écriture, une entrée ⏪, puis l'événement.
  // → true | false (lecture seule, préparation périmée).
  function appliquer(prep, libelle) {
    const W = racine;
    if (!prep || !prep.ok) return false;
    if (typeof W.ktaEditionRefusee === "function" && W.ktaEditionRefusee()) return false;   // 🔒 lecture seule
    const liste = typeof W.getStructures === "function" ? (W.getStructures() || []) : [];
    const absente = function (s) { return liste.indexOf(s) < 0; };
    if (absente(prep.garde) || prep.absorbes.some(absente)) return false;   // préparation périmée
    const H = W.HistoryManager;
    const avant = H && typeof H.captureState === "function" ? H.captureState("structures") : null;
    const retires = new Set(prep.absorbes);
    prep.garde.points = prep.points.map(function (p) { return { x: p.x, y: p.y }; });
    if (W.KtaUid && typeof W.KtaUid.touch === "function") W.KtaUid.touch(prep.garde);
    W.setStructures(liste.filter(function (s) { return !retires.has(s); }));
    if (H && avant && typeof H.record === "function") H.record(libelle || "Additionner", avant, "structures");
    if (W.SessionPersist && typeof W.SessionPersist.save === "function") {
      try { W.SessionPersist.save({ force: true }); } catch (err) { /* le poll de SessionPersist rattrape */ }
    }
    try {
      if (typeof W.dispatchEvent === "function" && typeof W.CustomEvent === "function") {
        W.dispatchEvent(new W.CustomEvent("mktm:objets-additionnes", { detail: {
          famille: "structures", uid: prep.garde.uid,
          absorbes: prep.absorbes.map(function (s) { return s.uid; }).filter(Boolean) } }));
      }
    } catch (err) { console.warn("[Additionner] événement :", err); }
    return true;
  }

  const api = { unir: unir, ecart: ecart, preparer: preparer, appliquer: appliquer, TOL_DEFAUT: TOL_DEFAUT,
                TOL_MIN: TOL_MIN, TOL_MAX: TOL_MAX };
  racine.KtaAdditionner = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (!racine.document || typeof racine.document.createElement !== "function") return;

  // ── Interface : bandeau, sélection, surbrillance ──

  const _t = function (k, v) { return racine.I18n && racine.I18n.t ? racine.I18n.t(k, v) : k; };
  const _esc = function (s) { return racine.ktaEsc(s); };
  const _toast = function (msg, type) {
    if (racine.OOMGuard && typeof racine.OOMGuard.showToast === "function") racine.OOMGuard.showToast(msg, type);
  };
  let _m = null;   // { sel: [uid], tol, floater, groupe, handler, msg }

  function _estLigne(type) {
    return typeof racine.isStructurePolylineType === "function" && !!racine.isStructurePolylineType(type);
  }
  function _libelle(type) {
    try {
      const LC = racine.LegendCustomization;
      const l = LC && typeof LC.getLabel === "function" ? LC.getLabel("structures", type) : "";
      if (l) return l;
    } catch (err) { /* légende absente : clé du dico */ }
    const k = "struct.label." + type, v = _t(k);
    return v && v !== k ? v : type;
  }
  function _visible(s) {
    return typeof racine.ktaNiveauVisible === "function" ? racine.ktaNiveauVisible(s) : true;
  }
  function _session() {
    return (typeof racine.getStructures === "function" ? racine.getStructures() || [] : []).filter(function (s) {
      return s && Array.isArray(s.points) && s.points.length >= 2 && _visible(s);
    });
  }
  function _parUid(uid) {
    return (typeof racine.getStructures === "function" ? racine.getStructures() || [] : []).find(function (s) {
      return s && s.uid === uid;
    }) || null;
  }
  function _pxEnPlan(px) {
    const m = racine.map;
    let s = 0;
    try { s = m.options.crs.scale(m.getZoom()); } catch (err) { s = 0; }
    return s > 0 ? px / s : px;
  }

  // Ce qui est sous le toucher → { obj } (surface de session : la plus petite qui contient le point), { ligne }
  // (trait d'une structure en ligne à moins de VISEE_PX), { calque } (structure d'un calque) ou {}.
  function _viser(x, y) {
    let best = null, bestA = Infinity, ligne = null, dLigne = _pxEnPlan(VISEE_PX);
    _session().forEach(function (s) {
      const P = s.points.map(function (p) { return [p.x, p.y]; });
      if (_estLigne(s.type)) {
        for (let i = 0; i + 1 < P.length; i++) {
          const d = _projSeg(P[i], P[i + 1], x, y).d;
          if (d <= dLigne) { dLigne = d; ligne = s; }
        }
        return;
      }
      if (P.length >= 3 && _dedans(P, x, y)) {
        const A = Math.abs(_aire(P));
        if (A < bestA) { bestA = A; best = s; }
      }
    });
    if (best) return { obj: best };
    if (ligne) return { ligne: ligne };
    const emb = typeof racine.getAllEmbeddedStructures === "function" ? racine.getAllEmbeddedStructures() || [] : [];
    const cal = emb.some(function (s) {
      return s && Array.isArray(s.points) && s.points.length >= 3 && _visible(s) && !_estLigne(s.type) &&
        _dedans(s.points.map(function (p) { return [p.x, p.y]; }), x, y);
    });
    return cal ? { calque: true } : {};
  }

  function _dire(msg) {
    if (!_m) return;
    _m.msg = msg || "";
    _majBandeau();
  }

  function _majBandeau() {
    if (!_m || !_m.floater) return;
    const n = _m.sel.length, prem = n ? _parUid(_m.sel[0]) : null;
    const etat = n ? _t("addit.compte", { n: n, type: prem ? _libelle(prem.type) : "" }) : _t("addit.aide");
    const el = _m.floater.querySelector(".kta-addit-msg");
    const txt = _m.msg ? _m.msg : etat;
    if (el.textContent !== txt) el.textContent = txt;
    const ok = _m.floater.querySelector('[data-addit="valider"]');
    ok.disabled = n < 2;
  }

  function _repeindre() {
    if (!_m || !_m.groupe) return;
    _m.groupe.clearLayers();
    _m.sel = _m.sel.filter(function (u) { return !!_parUid(u); });
    _m.sel.forEach(function (u, i) {
      const s = _parUid(u);
      const ll = s.points.map(function (p) { return racine.convertCoord(p.x, p.y); });
      racine.L.polygon(ll, { renderer: _m.rendu, interactive: false, fill: true,
        className: "kta-addit-sel" + (i === 0 ? " kta-addit-premiere" : "") }).addTo(_m.groupe);
    });
    _majBandeau();
  }

  function _toucher(e) {
    if (!_m || !e || !e.latlng) return;
    const H = racine.APP_CONFIG && racine.APP_CONFIG.imageHeight;
    const x = e.latlng.lng, y = Number.isFinite(H) ? H - e.latlng.lat : e.latlng.lat;
    const v = _viser(x, y);
    if (v.ligne) { _dire(_t("addit.ligne", { type: _libelle(v.ligne.type) })); return; }
    if (v.calque) { _dire(_t("addit.calque")); return; }
    if (!v.obj) { _dire(_t("addit.rien")); return; }
    const s = v.obj;
    if (!s.uid && racine.KtaUid && typeof racine.KtaUid.ensure === "function") racine.KtaUid.ensure(s, "st");
    const i = _m.sel.indexOf(s.uid);
    if (i >= 0) {
      _m.sel.splice(i, 1);
      _m.msg = _t(i === 0 && _m.sel.length ? "addit.retirePremiere" : "addit.retire");
      _repeindre();
      return;
    }
    if (_m.sel.length) {
      const prem = _parUid(_m.sel[0]);
      if (prem && prem.type !== s.type) {
        _dire(_t("addit.autreType", { type: _libelle(s.type), ref: _libelle(prem.type) }));
        return;
      }
      if (prem && _niveau(prem) !== _niveau(s)) { _dire(_t("addit.autreNiveau")); return; }
      let d = Infinity;
      _m.sel.forEach(function (u) { const o = _parUid(u); if (o) d = Math.min(d, ecart(o.points, s.points)); });
      if (d > _m.tol + 1e-9) {
        _dire(_t("addit.loin", { ecart: Math.round(d * 10) / 10, tol: _m.tol }));
        return;
      }
    }
    _m.sel.push(s.uid);
    _m.msg = _m.sel.length === 1 ? _t("addit.premiere") : "";
    _repeindre();
  }

  function _surDonnees() { if (_m) _repeindre(); }

  // 🩸 Le bandeau `.kta-iti-floater` fait passer Échap avant la carte (shortcuts.js > _echapPrisAvant) : le mode le
  // prend lui-même. Une fenêtre ouverte par-dessus (confirmation des textes perdus) le garde.
  function _echap(e) {
    if (!_m || e.key !== "Escape" || e.repeat) return;
    const fen = racine.document.querySelectorAll(".kta-readme-modal-overlay, .kta-modal-overlay, [aria-modal='true']");
    // des fenêtres cachées restent au DOM : seule une fenêtre affichée garde Échap
    for (let i = 0; i < fen.length; i++) if (fen[i].getClientRects().length > 0) return;
    fermer();
  }

  // Ouvre le mode sur la carte du plan affiché. → bool.
  function ouvrir() {
    if (!racine.map || !racine.L) return false;
    if (typeof racine.ktaEditionRefusee === "function" && racine.ktaEditionRefusee()) return false;   // 🔒
    fermer();
    if (typeof racine._desactiverTousLesModes === "function") racine._desactiverTousLesModes();
    try { racine.map.closePopup(); } catch (err) { /* aucune fiche */ }
    if (!racine.map._ktaAdditRendu) racine.map._ktaAdditRendu = racine.L.svg({ padding: 0.5 });
    _m = { sel: [], tol: TOL_DEFAUT, msg: "", rendu: racine.map._ktaAdditRendu,
           groupe: racine.L.layerGroup().addTo(racine.map), handler: _toucher };
    racine.map.on("click", _m.handler);
    racine.addEventListener("kta:donneesPlanChange", _surDonnees);
    racine.document.addEventListener("keydown", _echap);
    const f = racine.document.createElement("div");
    f.id = "kta-addit-floater";
    f.className = "kta-iti-floater kta-addit-floater";
    f.setAttribute("role", "status");
    f.innerHTML =
      '<span class="kta-iti-floater-icon">' + racine.ktaIcone("blend") + "</span>" +
      '<span class="kta-iti-floater-msg kta-addit-msg"></span>' +
      '<label class="kta-addit-tol"><span>' + _esc(_t("addit.tolerance")) + "</span>" +
      '<input type="number" min="' + TOL_MIN + '" max="' + TOL_MAX + '" step="1" value="' + TOL_DEFAUT +
      '" data-addit="tol"></label>' +
      '<button type="button" class="kta-btn kta-btn-primary" data-addit="valider">' + racine.ktaIcone("check") +
      " " + _esc(_t("addit.valider")) + "</button>" +
      '<button type="button" class="kta-btn kta-btn-ghost" data-addit="annuler">' + racine.ktaIcone("x") +
      " " + _esc(_t("addit.annuler")) + "</button>";
    f.addEventListener("click", function (ev) {
      const b = ev.target.closest && ev.target.closest("[data-addit]");
      if (!b) return;
      if (b.getAttribute("data-addit") === "valider") valider();
      else if (b.getAttribute("data-addit") === "annuler") fermer();
    });
    f.querySelector('[data-addit="tol"]').addEventListener("change", function (ev) {
      const v = Math.round(Number(ev.target.value));
      if (_m) _m.tol = Number.isFinite(v) ? Math.max(TOL_MIN, Math.min(TOL_MAX, v)) : TOL_DEFAUT;
      ev.target.value = _m ? _m.tol : TOL_DEFAUT;
    });
    racine.document.body.appendChild(f);
    _m.floater = f;
    if (typeof racine.ktaInscrireModeClic === "function") racine.ktaInscrireModeClic(MODE_CLIC, fermer);
    _majBandeau();
    return true;
  }

  function fermer() {
    if (!_m) return;
    const m = _m;
    _m = null;
    if (typeof racine.ktaRetirerModeClic === "function") racine.ktaRetirerModeClic(MODE_CLIC);
    try { racine.map.off("click", m.handler); } catch (err) { /* carte détruite */ }
    racine.removeEventListener("kta:donneesPlanChange", _surDonnees);
    racine.document.removeEventListener("keydown", _echap);
    try { m.groupe.clearLayers(); racine.map.removeLayer(m.groupe); } catch (err) { /* carte détruite */ }
    if (m.floater && m.floater.parentNode) m.floater.parentNode.removeChild(m.floater);
  }

  // Valider : refus dit dans le bandeau (rien d'écrit) ; textes perdus confirmés avant ; succès = mode fermé.
  // → Promise<bool>.
  function valider() {
    if (!_m) return Promise.resolve(false);
    if (typeof racine.ktaEditionRefusee === "function" && racine.ktaEditionRefusee()) return Promise.resolve(false);
    const prep = preparer(racine.getStructures() || [], _m.sel.slice(), { tol: _m.tol, estLigne: _estLigne });
    if (!prep.ok) {
      const msg = prep.raison === "ecart" ? _t("addit.loin", { ecart: Math.round(prep.ecart * 10) / 10, tol: _m.tol })
        : prep.raison === "type" ? _t("addit.autreType", { type: _libelle(prep.type), ref: _libelle(prep.ref) })
        : prep.raison === "ligne" ? _t("addit.ligne", { type: _libelle(prep.type) })
        : prep.raison === "niveau" ? _t("addit.autreNiveau")
        : _t("addit." + prep.raison);
      _dire(msg);
      _toast(msg, "warn");
      if (prep.raison === "disparue") _repeindre();
      return Promise.resolve(false);
    }
    const n = prep.absorbes.length + 1, type = _libelle(prep.garde.type);
    const ecrire = function () {
      if (!appliquer(prep, _t("addit.histo", { n: n, type: type }))) {
        _dire(_t("addit.disparue"));
        _repeindre();
        return false;
      }
      fermer();
      _toast(_t("addit.fait", { n: n }), "success");
      return true;
    };
    if (!prep.pertes.length) return Promise.resolve(ecrire());
    const lignes = prep.pertes.map(function (p) {
      return "<li>" + _esc(_t(p.champ === "nom" ? "addit.perteNom" : "addit.perteDescription")) + " " +
        _esc(p.valeur) + "</li>";
    }).join("");
    return racine.ktaConfirm(_esc(_t("addit.confirm")) + '<ul class="kta-addit-pertes">' + lignes + "</ul>", {
      titre: _esc(_t("addit.confirmTitre")), okLabel: _esc(_t("addit.confirmOk")), id: "kta-addit-confirm"
    }).then(function (oui) { return oui && _m ? ecrire() : false; });
  }

  // Harnais : état lisible sans DOM.
  function etat() {
    return _m ? { sel: _m.sel.slice(), tol: _m.tol, msg: _m.msg } : null;
  }

  Object.assign(api, { ouvrir: ouvrir, fermer: fermer, valider: valider, etat: etat });
})(typeof window !== "undefined" ? window : globalThis);
