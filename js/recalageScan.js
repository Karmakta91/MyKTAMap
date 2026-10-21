/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// recalageScan.js — « Recaler des données sur un autre scan » (Éditeur de données) : des fichiers .json relevés
//   sur un scan sont réécrits dans le repère d'un autre scan du même plan, téléchargés en `_conv.json`.
// Expose : window.ktaOuvrirRecalageScan() (la modale) · window.KtaRecalageScan (calcul PUR, sans DOM).
// Méthodes, de la meilleure à la pire : uid puis noms communs avec le plan ouvert (moindres carrés, homonymes aberrants
//   écartés) · repères cliqués sur le plan ouvert · rapport des résolutions (même cadrage seulement).
// Sens : coordonnées du FICHIER → plan OUVERT. Toutes remplissent une affine M = {a,b,c,d,e,f} :
//   x' = a·x + b·y + e ; y' = c·x + d·y + f.
// 🩸 Le rapport des résolutions n'est PAS l'échelle dès que le cadrage diffère entre deux scans (cas courant) :
//   le mode résolutions seul est refusé si les proportions divergent de plus de 2 %.
// ⚠️ Repère image (y vers le bas) : [cos −sin ; sin cos] tourne dans le sens HORAIRE à l'écran.
// Aperçu : calque temporaire sur la carte (convertCoord), retiré à la fermeture de l'outil.
// Garde-fou : scripts/check-resolution-convert.js · Doc : docs/architecture/ui.md (Éditeur de données).

(function () {
  "use strict";

  // ── Calcul (PUR) ──────────────────────────────

  const PLANCHER_PX = 3;          // seuil de rejet minimal : sous ce plancher un écart n'est jamais aberrant
  const NOM_MIN = 4;              // un nom normalisé plus court (« P1 ») est trop banal pour apparier
  const PROPORTIONS_MAX = 0.02;   // au-delà, deux images n'ont pas le même cadrage

  function matriceHomothetie(kX, kY) {
    return { a: kX, b: 0, c: 0, d: kY, e: 0, f: 0 };
  }

  // « 1 repère » saisi : échelle + rotation θ (degrés, horaire), ancreA → ancreB exactement.
  function matriceRecalage(kX, kY, thetaDeg, ancreA, ancreB) {
    if (!ancreA || !ancreB) return null;
    const t = ((Number(thetaDeg) || 0) * Math.PI) / 180;
    const co = Math.cos(t), si = Math.sin(t);
    const a = kX * co, b = -kY * si, c = kX * si, d = kY * co;
    return { a: a, b: b, c: c, d: d,
             e: ancreB.x - (a * ancreA.x + b * ancreA.y),
             f: ancreB.y - (c * ancreA.x + d * ancreA.y) };
  }

  // « 2 repères » saisis : échelle UNIFORME et rotation déduites, translation sur la paire 1.
  // null si une base fait moins de 10 px (transformation dégénérée).
  function matriceDeuxPaires(A1, B1, A2, B2) {
    const dxA = A2.x - A1.x, dyA = A2.y - A1.y;
    const dxB = B2.x - B1.x, dyB = B2.y - B1.y;
    const lenA = Math.hypot(dxA, dyA), lenB = Math.hypot(dxB, dyB);
    if (lenA < 10 || lenB < 10) return null;
    const s = lenB / lenA;
    const theta = Math.atan2(dyB, dxB) - Math.atan2(dyA, dxA);
    const co = Math.cos(theta), si = Math.sin(theta);
    const a = s * co, b = -s * si, c = s * si, d = s * co;
    return { a: a, b: b, c: c, d: d,
             e: B1.x - (a * A1.x + b * A1.y),
             f: B1.y - (c * A1.x + d * A1.y),
             _s: s, _thetaDeg: theta * 180 / Math.PI };
  }

  function appliquer(M, p) {
    return { x: M.a * p.x + M.b * p.y + M.e, y: M.c * p.x + M.d * p.y + M.f };
  }

  // Applique M à tous les champs de coordonnées (docs/architecture/data-formats.md) et compte par tableau.
  // 🩸 Le champ coordonnée OUBLIÉ est le bug classique de cette fonction : chaque tableau est éprouvé au garde-fou.
  function transformerCoordsFichier(obj, M) {
    const compte = {};
    if (!obj || typeof obj !== "object" || !M) return compte;
    const r2 = function (v) { return Math.round(v * 100) / 100; };   // centipixel : assez fin, JSON propre
    const pt = function (p) {
      if (p && typeof p.x === "number" && typeof p.y === "number") {
        const x = p.x, y = p.y;
        p.x = r2(M.a * x + M.b * y + M.e);
        p.y = r2(M.c * x + M.d * y + M.f);
        return 1;
      }
      return 0;
    };
    ["data", "editorPoints"].forEach(function (k) {
      if (!Array.isArray(obj[k])) return;
      compte[k] = obj[k].reduce(function (n, row) { return n + pt(row); }, 0);
    });
    ["roads", "zones", "structures"].forEach(function (k) {
      if (!Array.isArray(obj[k])) return;
      compte[k] = 0;
      obj[k].forEach(function (g) {
        if (g && Array.isArray(g.points)) compte[k] += g.points.reduce(function (n, p) { return n + pt(p); }, 0);
      });
    });
    // 🩸 measure a DEUX formes : calque `{points:[…]}`, session `[…]`. measureSurface : tableau direct.
    ["measure", "measureSurface"].forEach(function (k) {
      const m = obj[k];
      if (!m) return;
      const arr = Array.isArray(m) ? m : (Array.isArray(m.points) ? m.points : null);
      if (arr) compte[k] = arr.reduce(function (n, p) { return n + pt(p); }, 0);
    });
    return compte;
  }

  // Casse, accents, ponctuation et espaces ignorés : « Salle-du Puits » = « salle du puits » = « SALLE DU PUITS ».
  function normaliserNom(s) {
    if (s === null || s === undefined) return "";
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  // Points nommés d'un fichier (data / editorPoints), coordonnées numériques seulement. Nom : `nom`, sinon `id`.
  function pointsNommes(obj) {
    const out = [];
    if (!obj || typeof obj !== "object") return out;
    ["data", "editorPoints"].forEach(function (k) {
      if (!Array.isArray(obj[k])) return;
      obj[k].forEach(function (p) {
        if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        const nom = (p.nom !== undefined && p.nom !== null && String(p.nom).trim()) ? p.nom : p.id;
        if (nom === undefined || nom === null || !String(nom).trim()) return;
        const q = { nom: String(nom), x: p.x, y: p.y };
        if (typeof p.uid === "string" && p.uid) q.uid = p.uid;
        out.push(q);
      });
    });
    return out;
  }

  // Paires {nom, A (fichier), B (plan)} des noms UNIQUES des deux côtés (normalisés, ≥ NOM_MIN caractères).
  // Un nom porté deux fois d'un côté est écarté : on ne devine pas lequel est le bon.
  function apparierParNoms(ptsA, ptsB) {
    const indexer = function (pts) {
      const m = new Map();
      (pts || []).forEach(function (p) {
        const k = normaliserNom(p.nom);
        if (k.length < NOM_MIN) return;
        const l = m.get(k);
        if (l) l.push(p); else m.set(k, [p]);
      });
      return m;
    };
    const iA = indexer(ptsA), iB = indexer(ptsB);
    const paires = [];
    let ambigus = 0;
    iA.forEach(function (lA, k) {
      const lB = iB.get(k);
      if (!lB) return;
      if (lA.length !== 1 || lB.length !== 1) { ambigus++; return; }
      paires.push({ nom: lA[0].nom, A: { x: lA[0].x, y: lA[0].y }, B: { x: lB[0].x, y: lB[0].y } });
    });
    paires.sort(function (p, q) { return p.nom < q.nom ? -1 : (p.nom > q.nom ? 1 : 0); });
    return { paires: paires, ambigus: ambigus };
  }

  const _valide = function (p) {
    return p && typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y);
  };

  // Objets porteurs d'un uid (points ET tracés / zones / structures) d'un fichier ou du plan : uid → liste
  // (plus d'un élément = uid en double de ce côté, inutilisable).
  function _indexUid(obj) {
    const m = new Map();
    if (!obj || typeof obj !== "object") return m;
    const ajouter = function (uid, o) {
      if (typeof uid !== "string" || !uid) return;
      const l = m.get(uid);
      if (l) l.push(o); else m.set(uid, [o]);
    };
    ["data", "editorPoints"].forEach(function (k) {
      (Array.isArray(obj[k]) ? obj[k] : []).forEach(function (p) {
        if (!p || !_valide(p)) return;
        const nom = (p.nom !== undefined && p.nom !== null && String(p.nom).trim()) ? p.nom : (p.id || p.uid);
        ajouter(p.uid, { geo: false, nom: String(nom), pts: [{ x: p.x, y: p.y }] });
      });
    });
    ["roads", "zones", "structures"].forEach(function (k) {
      (Array.isArray(obj[k]) ? obj[k] : []).forEach(function (g) {
        if (!g || !Array.isArray(g.points)) return;
        ajouter(g.uid, { geo: true, nom: String(g.nom || g.type || k), pts: g.points.filter(_valide), n: g.points.length });
      });
    });
    return m;
  }

  // Paires par uid (même Générateur) : l'uid PRIME sur le nom. Un point = une paire ; un tracé / une zone / une
  // structure = une paire par sommet, SEULEMENT avec le même nombre de sommets des deux côtés (sinon il a été
  // retouché, ses sommets ne se correspondent plus un à un : objet ignoré). Un uid présent deux fois d'un côté est
  // ignoré. Rend { paires (source "uid"), uidsA, uidsB (uid appariés), doubles, geoIgnores }.
  function apparierParUid(objA, objB) {
    const iA = _indexUid(objA), iB = _indexUid(objB);
    const paires = [], uidsA = new Set(), uidsB = new Set();
    let doubles = 0, geoIgnores = 0;
    iA.forEach(function (lA, uid) {
      const lB = iB.get(uid);
      if (!lB) return;
      if (lA.length !== 1 || lB.length !== 1) { doubles++; return; }
      const a = lA[0], b = lB[0];
      if (a.geo !== b.geo) return;
      if (a.geo && (a.n !== b.n || a.pts.length !== a.n || b.pts.length !== b.n || a.n < 1)) { geoIgnores++; return; }
      for (let i = 0; i < a.pts.length; i++) {
        paires.push({ nom: a.geo ? a.nom + " #" + (i + 1) : a.nom, A: a.pts[i], B: b.pts[i], source: "uid" });
      }
      uidsA.add(uid); uidsB.add(uid);
    });
    return { paires: paires, uidsA: uidsA, uidsB: uidsB, doubles: doubles, geoIgnores: geoIgnores };
  }

  // Appariement complet : uid d'abord, puis noms sur les points restants (un objet apparié par uid n'est pas
  // réapparié par son nom). Rend { paires, nUid, nNoms, ambigus, doubles, geoIgnores }.
  function apparier(objA, objB) {
    const u = apparierParUid(objA, objB);
    const reste = function (obj, uids) {
      return pointsNommes(obj).filter(function (p) { return !(p.uid && uids.has(p.uid)); });
    };
    const n = apparierParNoms(reste(objA, u.uidsA), reste(objB, u.uidsB));
    n.paires.forEach(function (p) { p.source = "nom"; });
    return { paires: u.paires.concat(n.paires), nUid: u.paires.length, nNoms: n.paires.length,
             ambigus: n.ambigus, doubles: u.doubles, geoIgnores: u.geoIgnores };
  }

  // Répartition des repères (retenus) entre uid et noms, pour l'annonce de qualité.
  function compterSources(paires) {
    let uid = 0, nom = 0;
    (paires || []).forEach(function (p) { if (p.source === "uid") uid++; else nom++; });
    return { uid: uid, nom: nom };
  }

  function _centres(paires) {
    let ax = 0, ay = 0, bx = 0, by = 0;
    paires.forEach(function (p) { ax += p.A.x; ay += p.A.y; bx += p.B.x; by += p.B.y; });
    const n = paires.length;
    return { ax: ax / n, ay: ay / n, bx: bx / n, by: by / n };
  }

  // Similitude (échelle unique + rotation + translation) aux moindres carrés. null si < 2 paires ou si les
  // repères du fichier tiennent dans un rayon moyen de moins de 10 px (rotation indéterminée).
  function similitudeMC(paires) {
    if (!Array.isArray(paires) || paires.length < 2) return null;
    const c = _centres(paires);
    let den = 0, sp = 0, sq = 0;
    paires.forEach(function (p) {
      const ax = p.A.x - c.ax, ay = p.A.y - c.ay, bx = p.B.x - c.bx, by = p.B.y - c.by;
      den += ax * ax + ay * ay;
      sp += ax * bx + ay * by;
      sq += ax * by - ay * bx;
    });
    if (!(den / paires.length >= 100)) return null;
    const P = sp / den, Q = sq / den;
    const s = Math.hypot(P, Q);
    if (!(s > 0)) return null;
    return { a: P, b: -Q, c: Q, d: P,
             e: c.bx - (P * c.ax - Q * c.ay),
             f: c.by - (Q * c.ax + P * c.ay),
             _s: s, _thetaDeg: Math.atan2(Q, P) * 180 / Math.PI, _modele: "similitude" };
  }

  // Affine générale (6 paramètres) aux moindres carrés. null si < 3 paires ou repères alignés.
  function affineMC(paires) {
    if (!Array.isArray(paires) || paires.length < 3) return null;
    const c = _centres(paires);
    let sxx = 0, sxy = 0, syy = 0, sxu = 0, syu = 0, sxv = 0, syv = 0;
    paires.forEach(function (p) {
      const x = p.A.x - c.ax, y = p.A.y - c.ay, u = p.B.x - c.bx, v = p.B.y - c.by;
      sxx += x * x; sxy += x * y; syy += y * y;
      sxu += x * u; syu += y * u; sxv += x * v; syv += y * v;
    });
    const det = sxx * syy - sxy * sxy;
    // Alignés (ou presque) : le déterminant s'effondre devant le carré de la dispersion.
    if (!(det > 1e-9 * (sxx + syy) * (sxx + syy)) || !(sxx + syy >= 100 * paires.length)) return null;
    const a = (sxu * syy - syu * sxy) / det, b = (syu * sxx - sxu * sxy) / det;
    const cc = (sxv * syy - syv * sxy) / det, d = (syv * sxx - sxv * sxy) / det;
    return { a: a, b: b, c: cc, d: d,
             e: c.bx - (a * c.ax + b * c.ay),
             f: c.by - (cc * c.ax + d * c.ay),
             _s: Math.sqrt(Math.abs(a * d - b * cc)), _thetaDeg: Math.atan2(cc, a) * 180 / Math.PI,
             _modele: "affine" };
  }

  function ecarts(M, paires) {
    return (paires || []).map(function (p) {
      const q = appliquer(M, p.A);
      return Math.hypot(q.x - p.B.x, q.y - p.B.y);
    });
  }

  function _quantile(triees, q) {
    if (!triees.length) return NaN;
    const i = Math.min(triees.length - 1, Math.max(0, Math.ceil(q * triees.length) - 1));
    return triees[i];
  }

  // Médiane, 90e centile, maximum (px) et part sous 1 px.
  function statsEcarts(arr) {
    const t = (arr || []).slice().sort(function (x, y) { return x - y; });
    if (!t.length) return { n: 0, mediane: NaN, p90: NaN, max: NaN, sous1: NaN };
    const mid = t.length >> 1;
    const med = t.length % 2 ? t[mid] : (t[mid - 1] + t[mid]) / 2;
    const sous1 = t.filter(function (v) { return v < 1; }).length / t.length;
    return { n: t.length, mediane: med, p90: _quantile(t, 0.9), max: t[t.length - 1], sous1: sous1 };
  }

  // Seuil de rejet robuste : 3 × la médiane des écarts retenus, jamais sous le plancher.
  function seuilRejet(ecartsRetenus, plancher) {
    const s = statsEcarts(ecartsRetenus);
    const p = (typeof plancher === "number") ? plancher : PLANCHER_PX;
    return Math.max(3 * (Number.isFinite(s.mediane) ? s.mediane : 0), p);
  }

  // Générateur déterministe (le même fichier donne toujours le même recalage).
  function _lcg(graine) {
    let s = graine >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  // Consensus de départ : la similitude de deux paires qui met le plus de paires d'accord (tolérance large).
  // 🩸 Sans lui, un homonyme très loin tire le premier ajustement et le rejet itératif écarte les bons repères.
  function _consensus(paires, tol) {
    const n = paires.length;
    const total = n * (n - 1) / 2;
    const PLAFOND = 3000;
    const alea = _lcg(n * 7919 + 17);
    let meilleur = null, meilleurN = -1, meilleurSomme = Infinity;
    const essayer = function (i, j) {
      const M = matriceDeuxPaires(paires[i].A, paires[i].B, paires[j].A, paires[j].B);
      if (!M) return;
      let k = 0, somme = 0;
      for (let m = 0; m < n; m++) {
        const q = appliquer(M, paires[m].A);
        const r = Math.hypot(q.x - paires[m].B.x, q.y - paires[m].B.y);
        if (r <= tol) { k++; somme += r; }
      }
      if (k > meilleurN || (k === meilleurN && somme < meilleurSomme)) { meilleur = M; meilleurN = k; meilleurSomme = somme; }
    };
    if (total <= PLAFOND) {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) essayer(i, j);
    } else {
      for (let t = 0; t < PLAFOND; t++) {
        const i = Math.floor(alea() * n);
        let j = Math.floor(alea() * (n - 1));
        if (j >= i) j++;
        essayer(i, j);
      }
    }
    return meilleur;
  }

  function _boucleRejet(paires, ajuster, depart, plancher) {
    let retenus = depart;
    let M = null;
    for (let iter = 0; iter < 25; iter++) {
      const sel = paires.filter(function (_, i) { return retenus[i]; });
      M = ajuster(sel);
      if (!M) return null;
      const r = ecarts(M, paires);
      const seuil = seuilRejet(r.filter(function (_, i) { return retenus[i]; }), plancher);
      const nouveaux = r.map(function (v) { return v <= seuil; });
      const stable = nouveaux.every(function (v, i) { return v === retenus[i]; });
      if (nouveaux.filter(Boolean).length < 2) break;
      retenus = nouveaux;
      if (stable) break;
    }
    const sel = paires.filter(function (_, i) { return retenus[i]; });
    M = ajuster(sel);
    if (!M) return null;
    const r = ecarts(M, paires);
    return {
      M: M,
      retenues: sel,
      ecartees: paires.map(function (p, i) { return { nom: p.nom, ecart: r[i], garde: retenus[i] }; })
        .filter(function (e) { return !e.garde; })
        .map(function (e) { return { nom: e.nom, ecart: e.ecart }; }),
      stats: statsEcarts(r.filter(function (_, i) { return retenus[i]; }))
    };
  }

  // Estimation robuste : consensus, similitude aux moindres carrés, rejet itératif des aberrants ; l'affine est
  // calculée sur le même principe et proposée seulement si elle est NETTEMENT meilleure (90e centile ≤ 60 % de
  // celui de la similitude, et au moins 2 px de gagnés).
  // Rend { M (similitude), retenues, ecartees, stats, affine: {…}|null, affineMeilleure } ou { err }.
  function estimerRobuste(paires, opts) {
    opts = opts || {};
    const plancher = (typeof opts.plancher === "number") ? opts.plancher : PLANCHER_PX;
    const n = Array.isArray(paires) ? paires.length : 0;
    if (n < 3) return { err: "peu", n: n };
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    paires.forEach(function (p) {
      xmin = Math.min(xmin, p.B.x); xmax = Math.max(xmax, p.B.x);
      ymin = Math.min(ymin, p.B.y); ymax = Math.max(ymax, p.B.y);
    });
    const tol = Math.max(plancher * 3, 0.01 * Math.hypot(xmax - xmin, ymax - ymin));
    const M0 = _consensus(paires, tol);
    if (!M0) return { err: "degenere", n: n };
    let depart = ecarts(M0, paires).map(function (v) { return v <= tol; });
    if (depart.filter(Boolean).length < 2) depart = paires.map(function () { return true; });
    const sim = _boucleRejet(paires, similitudeMC, depart, plancher);
    if (!sim || sim.retenues.length < 3) return { err: "degenere", n: n };
    let affine = null, affineMeilleure = false;
    if (sim.retenues.length >= 4) {
      const dep = paires.map(function (p) { return sim.retenues.indexOf(p) >= 0; });
      affine = _boucleRejet(paires, affineMC, dep, plancher);
      if (affine && affine.retenues.length >= 4) {
        affineMeilleure = affine.stats.p90 <= 0.6 * sim.stats.p90 && (sim.stats.p90 - affine.stats.p90) >= 2;
      } else {
        affine = null;
      }
    }
    return { M: sim.M, retenues: sim.retenues, ecartees: sim.ecartees, stats: sim.stats,
             affine: affine, affineMeilleure: affineMeilleure, n: n };
  }

  // Repères cliqués (peu nombreux) : 🩸 aux moindres carrés sur 4 repères, UN mauvais clic se répartit sur tous et
  // aucun ne ressort. Dès 4 repères, la similitude de deux repères qui donne la plus petite MÉDIANE d'écarts
  // désigne les suspects ; la similitude finale est ajustée sans eux, et l'écart de chacun est montré (rouge =
  // suspect, laissé hors du calcul : l'utilisateur le retire ou le pointe à nouveau). À 3 repères, rien ne
  // permet de dire lequel est faux : aucun suspect, seuls les écarts parlent.
  function estimerReperes(paires, plancher) {
    if (!Array.isArray(paires) || paires.length < 2) return null;
    const p0 = (typeof plancher === "number") ? plancher : 5;
    const n = paires.length;
    let suspects = paires.map(function () { return false; });
    if (n >= 4) {
      let meilleur = null, meilleurMed = Infinity, meilleurSomme = Infinity;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const M2 = matriceDeuxPaires(paires[i].A, paires[i].B, paires[j].A, paires[j].B);
          if (!M2) continue;
          const r2 = ecarts(M2, paires);
          const st = statsEcarts(r2);
          const somme = r2.reduce(function (a, v) { return a + v; }, 0);
          if (st.mediane < meilleurMed || (st.mediane === meilleurMed && somme < meilleurSomme)) {
            meilleur = r2; meilleurMed = st.mediane; meilleurSomme = somme;
          }
        }
      }
      if (meilleur) {
        const seuil0 = Math.max(3 * 1.4826 * meilleurMed, p0);
        const s = meilleur.map(function (v) { return v > seuil0; });
        if (s.filter(function (v) { return !v; }).length >= 3) suspects = s;
      }
    }
    const bons = paires.filter(function (_, i) { return !suspects[i]; });
    const M = similitudeMC(bons);
    if (!M) return null;
    const r = ecarts(M, paires);
    const rBons = r.filter(function (_, i) { return !suspects[i]; });
    const seuil = Math.max(3 * 1.4826 * statsEcarts(rBons).mediane, p0);
    if (n >= 4) suspects = r.map(function (v) { return v > seuil; });
    return { M: M, ecarts: r, suspects: suspects, stats: statsEcarts(rBons), seuil: seuil };
  }

  // Écart relatif des proportions de deux images (0 = même rapport largeur / hauteur).
  function ecartProportions(wA, hA, wB, hB) {
    if (!(wA > 0 && hA > 0 && wB > 0 && hB > 0)) return NaN;
    const kX = wB / wA, kY = hB / hA;
    return Math.abs(kX - kY) / Math.max(kX, kY);
  }

  const CALCUL = {
    PLANCHER_PX: PLANCHER_PX, NOM_MIN: NOM_MIN, PROPORTIONS_MAX: PROPORTIONS_MAX,
    matriceHomothetie: matriceHomothetie, matriceRecalage: matriceRecalage, matriceDeuxPaires: matriceDeuxPaires,
    appliquer: appliquer, transformerCoordsFichier: transformerCoordsFichier,
    normaliserNom: normaliserNom, pointsNommes: pointsNommes, apparierParNoms: apparierParNoms,
    apparierParUid: apparierParUid, apparier: apparier, compterSources: compterSources,
    similitudeMC: similitudeMC, affineMC: affineMC, ecarts: ecarts, statsEcarts: statsEcarts,
    seuilRejet: seuilRejet, estimerRobuste: estimerRobuste, estimerReperes: estimerReperes,
    ecartProportions: ecartProportions
  };
  window.KtaRecalageScan = CALCUL;

  // ── Modale ──────────────────────────────

  const ID = "kta-recal-modal";
  const t = function (k, p) { return window.I18n.t(k, p); };
  const esc = function (s) { return window.ktaEsc(s); };
  const px = function (v) {
    if (!Number.isFinite(v)) return "—";
    return v < 10 ? (Math.round(v * 10) / 10).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR")
                  : String(Math.round(v));
  };

  function _planOuvert() {
    const affiche = (typeof window.ktaPlanAffiche === "function") ? window.ktaPlanAffiche() : !!window.PLAN_CONFIG;
    return !!(affiche && window.map && window.APP_CONFIG && window.APP_CONFIG.imageHeight);
  }

  // Le plan ouvert sous la forme d'un fichier (calques + session) : points, tracés, zones, structures.
  function _objetPlan() {
    const lire = function (nom) {
      try { return (typeof window[nom] === "function" && window[nom]()) || []; } catch (e) { return []; }
    };
    return {
      data: lire("getAllEmbeddedPoints").concat(lire("getEditorPoints")),
      roads: lire("getAllEmbeddedRoads").concat(lire("getRoads")),
      zones: lire("getAllEmbeddedZones").concat(lire("getZones")),
      structures: lire("getAllEmbeddedStructures").concat(lire("getStructures"))
    };
  }

  function _couleurApercu() {
    // Le rendu canvas (preferCanvas) ne lit pas les variables CSS : on passe la valeur calculée du jeton.
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--kta-accent").trim();
      if (v) return v;
    } catch (e) {}
    return getComputedStyle(document.body).color;
  }

  function ouvrir() {
    if (document.getElementById(ID)) return;
    const planOuvert = _planOuvert();
    const w0 = (planOuvert && window.APP_CONFIG.imageWidth) || "";
    const h0 = (planOuvert && window.APP_CONFIG.imageHeight) || "";
    const etat = {
      methode: planOuvert ? "noms" : "resol",
      fichiers: [],          // [{ name, obj }] lus une fois
      illisibles: [],
      noms: null,            // résultat estimerRobuste
      nomsPaires: null,
      utiliserAffine: false,
      reperes: [],           // [{ nom, A, B }]
      apercu: null,          // L.layerGroup
      pickActif: false
    };

    const sub = document.createElement("div");
    sub.id = ID;
    // 🩸 kta-readme-modal-overlay, PAS "kta-readme-modal" (classe inexistante → modale invisible).
    sub.className = "kta-readme-modal-overlay";
    sub.style.zIndex = "100001";
    const champRes = function (id, w, h) {
      return `<div class="kta-planner-grille kta-recal-grille">
          <label class="kta-cfg-label" for="${id}_w">${t("recalscan.resol.largeur")}</label>
          <input class="kta-cfg-input" id="${id}_w" type="number" min="1" step="1" value="${w}">
          <label class="kta-cfg-label" for="${id}_h">${t("recalscan.resol.hauteur")}</label>
          <input class="kta-cfg-input" id="${id}_h" type="number" min="1" step="1" value="${h}">
        </div>
        <label class="kta-btn kta-btn-ghost kta-btn-small kta-recal-fichier">📷 ${t("recalscan.resol.depuisImage")}
          <input type="file" id="${id}_img" accept="image/*" hidden>
        </label>`;
    };
    const champPaire = function (id, titre) {
      return `<div class="kta-cfg-label kta-recal-sous-titre">${titre}</div>
        <div class="kta-recal-paire">
          <input class="kta-cfg-input" id="${id}_xa" type="number" step="any" placeholder="xA">
          <input class="kta-cfg-input" id="${id}_ya" type="number" step="any" placeholder="yA">
          <input class="kta-cfg-input" id="${id}_xb" type="number" step="any" placeholder="xB">
          <input class="kta-cfg-input" id="${id}_yb" type="number" step="any" placeholder="yB">
        </div>`;
    };
    const onglet = function (m, ico) {
      return `<button type="button" class="kta-btn kta-btn-ghost kta-btn-small kta-recal-onglet" data-recal-methode="${m}"
        aria-pressed="false">${ico} ${t("recalscan.methode." + m)}</button>`;
    };
    sub.innerHTML = `
      <div class="kta-readme-modal-boite kta-recal-boite">
        <div class="kta-readme-modal-entete">
          <span class="kta-readme-modal-titre">🔁 ${t("recalscan.titre")}</span>
          <button class="kta-panneau-close" id="kta-recal-close" aria-label="${t("recalscan.fermer")}">✕</button>
        </div>
        <div class="kta-readme-modal-corps kta-recal-corps">
          <p class="kta-recal-note">${t(planOuvert ? "recalscan.intro" : "recalscan.introSansPlan")}</p>
          <p class="kta-recal-note kta-recal-petit">ℹ️ ${t("recalscan.nonTransforme")}</p>

          <div class="kta-cfg-label kta-recal-titre-section">1. ${t("recalscan.fichiers")}</div>
          <label class="kta-btn kta-btn-ghost kta-btn-small kta-recal-fichier">📄 ${t("recalscan.choisirFichiers")}
            <input type="file" id="kta-recal-files" accept=".json,application/json" multiple hidden>
          </label>
          <div id="kta-recal-files-liste" class="kta-recal-liste-fichiers">${t("recalscan.aucunFichier")}</div>

          <div class="kta-cfg-label kta-recal-titre-section">2. ${t("recalscan.methodeTitre")}</div>
          ${planOuvert ? `<div class="kta-recal-onglets" role="group">
            ${onglet("noms", "🔤")}${onglet("clics", "📍")}${onglet("resol", "📐")}
          </div>` : `<p class="kta-recal-note kta-recal-petit">${t("recalscan.sansPlan")}</p>`}

          <div id="kta-recal-p-noms" class="kta-recal-panneau" hidden>
            <p class="kta-recal-note kta-recal-petit">${t("recalscan.noms.aide")}</p>
            <label class="kta-recal-case" id="kta-recal-affine-wrap" hidden>
              <input type="checkbox" id="kta-recal-affine"> <span id="kta-recal-affine-txt"></span>
            </label>
          </div>

          <div id="kta-recal-p-clics" class="kta-recal-panneau" hidden>
            <p class="kta-recal-note kta-recal-petit">${t("recalscan.clics.aide")}</p>
            <div class="kta-recal-clic-choix">
              <select class="kta-cfg-input" id="kta-recal-clic-point" aria-label="${t("recalscan.clics.choisir")}"></select>
              <button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-recal-clic-go">📍 ${t("recalscan.clics.pointer")}</button>
            </div>
            <div id="kta-recal-clic-liste" class="kta-recal-liste-reperes"></div>
          </div>

          <div id="kta-recal-p-resol" class="kta-recal-panneau" hidden>
            <p class="kta-recal-note kta-recal-petit">⚠️ ${t("recalscan.resol.aide")}</p>
            <div class="kta-cfg-label kta-recal-sous-titre">${t("recalscan.resol.source")}</div>
            ${champRes("kta-recal-src", "", "")}
            <div class="kta-cfg-label kta-recal-sous-titre">${t("recalscan.resol.dest")}</div>
            ${champRes("kta-recal-dst", w0, h0)}
            <details class="kta-recal-details">
              <summary>🎯 ${t("recalscan.resol.saisieTitre")}</summary>
              <p class="kta-recal-note kta-recal-petit">${t("recalscan.resol.saisieIntro")}</p>
              ${champPaire("kta-recal-p1", t("recalscan.resol.paire1"))}
              <div class="kta-planner-grille kta-recal-grille">
                <label class="kta-cfg-label" for="kta-recal-theta">${t("recalscan.resol.rotation")}</label>
                <input class="kta-cfg-input" id="kta-recal-theta" type="number" step="any" value="0">
              </div>
              ${champPaire("kta-recal-p2", t("recalscan.resol.paire2"))}
            </details>
          </div>

          <div id="kta-recal-recap" class="kta-recal-recap" aria-live="polite">—</div>
          <div id="kta-recal-warn" class="kta-recal-warn" hidden></div>
          <div class="kta-conv-actions kta-recal-actions">
            <button class="kta-btn kta-btn-ghost"   id="kta-recal-annuler">${t("recalscan.annuler")}</button>
            ${planOuvert ? `<button class="kta-btn kta-btn-ghost" id="kta-recal-apercu" disabled>👁️ ${t("recalscan.apercu")}</button>` : ""}
            <button class="kta-btn kta-btn-primary" id="kta-recal-go" disabled>⬇️ ${t("recalscan.telecharger")}</button>
          </div>
        </div>
      </div>`;
    document.documentElement.appendChild(sub);
    const $ = function (id) { return document.getElementById(id); };

    // ── Aperçu sur la carte ──
    function retirerApercu() {
      if (etat.apercu) { try { etat.apercu.remove(); } catch (e) {} etat.apercu = null; }
      const barre = $("kta-recal-barre");
      if (barre) barre.remove();
    }
    function dessinerApercu(M) {
      retirerApercu();
      const L = window.L;
      if (!L || !window.map || typeof window.convertCoord !== "function") return 0;
      const couleur = _couleurApercu();
      const groupe = L.layerGroup();
      // Tireté : le recalé se distingue des tracés du plan, même quand il tombe pile dessus.
      const opt = { color: couleur, weight: 3, opacity: 0.95, dashArray: "8 6", fillOpacity: 0.15, interactive: false };
      let n = 0;
      etat.fichiers.forEach(function (f) {
        const obj = JSON.parse(JSON.stringify(f.obj));
        transformerCoordsFichier(obj, M);
        const ll = function (p) { return window.convertCoord(p.x, p.y); };
        const valide = function (p) { return p && typeof p.x === "number" && typeof p.y === "number"; };
        ["data", "editorPoints"].forEach(function (k) {
          (Array.isArray(obj[k]) ? obj[k] : []).forEach(function (p) {
            if (!valide(p)) return;
            L.circleMarker(ll(p), { radius: 4, color: couleur, weight: 2, fillColor: couleur, fillOpacity: 0.6,
              interactive: false }).addTo(groupe);
            n++;
          });
        });
        ["roads", "zones", "structures"].forEach(function (k) {
          (Array.isArray(obj[k]) ? obj[k] : []).forEach(function (g) {
            if (!g || !Array.isArray(g.points)) return;
            const pts = g.points.filter(valide).map(ll);
            if (pts.length < 2) return;
            const ferme = k === "zones" || (k === "structures" && pts.length >= 3
              && (g.type === "pilier-1" || g.type === "pilier-2" || g.type === "mur"));
            (ferme ? L.polygon(pts, opt) : L.polyline(pts, opt)).addTo(groupe);
            n++;
          });
        });
      });
      groupe.addTo(window.map);
      etat.apercu = groupe;
      return n;
    }
    function montrerApercu() {
      const res = construire();
      if (!res.M || res.bloquant || !etat.fichiers.length) return;
      const n = dessinerApercu(res.M);
      sub.style.display = "none";
      const barre = document.createElement("div");
      barre.id = "kta-recal-barre";
      barre.className = "kta-recal-barre";
      barre.innerHTML = '<span class="kta-recal-barre-msg"></span>' +
        '<button type="button" class="kta-btn kta-btn-ghost" id="kta-recal-barre-retour"></button>' +
        '<button type="button" class="kta-btn kta-btn-primary" id="kta-recal-barre-go"></button>';
      barre.querySelector(".kta-recal-barre-msg").textContent = t("recalscan.apercuBarre", { n: n });
      barre.querySelector("#kta-recal-barre-retour").textContent = "↩ " + t("recalscan.apercuRetour");
      barre.querySelector("#kta-recal-barre-go").textContent = "⬇️ " + t("recalscan.telecharger");
      document.body.appendChild(barre);
      barre.querySelector("#kta-recal-barre-retour").addEventListener("click", revenir);
      barre.querySelector("#kta-recal-barre-go").addEventListener("click", telecharger);
      try {
        const b = etat.apercu && etat.apercu.getLayers().length ? L_bounds(etat.apercu) : null;
        if (b && b.isValid()) window.map.fitBounds(b, { padding: [40, 40] });   // tout le résultat d'un coup d'œil
      } catch (e) {}
    }
    function L_bounds(groupe) {
      let b = null;
      groupe.eachLayer(function (l) {
        const lb = l.getBounds ? l.getBounds() : window.L.latLngBounds([l.getLatLng(), l.getLatLng()]);
        if (b) b.extend(lb); else b = window.L.latLngBounds(lb.getSouthWest(), lb.getNorthEast());
      });
      return b;
    }
    // Retour à l'outil : la barre part, le calque reste tant que le calcul ne change pas.
    function revenir() {
      const barre = $("kta-recal-barre");
      if (barre) barre.remove();
      sub.style.display = "";
    }

    function fermer() {
      if (etat.pickActif && window.ktaDemanderPositionCarte && window.ktaDemanderPositionCarte.annuler) {
        window.ktaDemanderPositionCarte.annuler();
      }
      retirerApercu();
      document.removeEventListener("keydown", surTouche, true);
      sub.remove();
    }
    function surTouche(e) {
      if (e.key !== "Escape") return;
      if (etat.pickActif) return;   // le sélecteur de position gère son Échap
      if ($("kta-recal-barre")) { e.stopPropagation(); revenir(); return; }
      if (sub.style.display !== "none") { e.stopPropagation(); fermer(); }
    }
    document.addEventListener("keydown", surTouche, true);
    $("kta-recal-close").addEventListener("click", fermer);
    $("kta-recal-annuler").addEventListener("click", fermer);
    sub.addEventListener("click", function (e) { if (e.target === sub) fermer(); });

    // ── Méthode ──
    function choisirMethode(m) {
      etat.methode = m;
      sub.querySelectorAll("[data-recal-methode]").forEach(function (b) {
        const actif = b.getAttribute("data-recal-methode") === m;
        b.setAttribute("aria-pressed", actif ? "true" : "false");
        b.classList.toggle("kta-actif", actif);
      });
      ["noms", "clics", "resol"].forEach(function (k) { $("kta-recal-p-" + k).hidden = (k !== m); });
      recap();
    }
    sub.querySelectorAll("[data-recal-methode]").forEach(function (b) {
      b.addEventListener("click", function () { choisirMethode(b.getAttribute("data-recal-methode")); });
    });

    // ── Fichiers ──
    $("kta-recal-files").addEventListener("change", function (e) {
      const liste = Array.prototype.slice.call(e.target.files || []);
      etat.fichiers = []; etat.illisibles = []; etat.reperes = [];
      Promise.all(liste.map(function (f) {
        return f.text().then(function (txt) { etat.fichiers.push({ name: f.name, obj: JSON.parse(txt) }); })
          .catch(function () { etat.illisibles.push(f.name); });
      })).then(function () {
        etat.fichiers.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
        const noms = etat.fichiers.map(function (f) { return f.name; });
        let txt = noms.length ? noms.join(" · ") : t("recalscan.aucunFichier");
        if (etat.illisibles.length) txt += " — ⚠️ " + t("recalscan.illisibles", { liste: etat.illisibles.join(", ") });
        $("kta-recal-files-liste").textContent = txt;
        calculerNoms();
        remplirChoixClic();
        recap();
      });
    });

    function pointsFichiers() {
      let pts = [];
      etat.fichiers.forEach(function (f) { pts = pts.concat(pointsNommes(f.obj)); });
      return pts;
    }

    function calculerNoms() {
      etat.noms = null; etat.nomsPaires = null; etat.utiliserAffine = false;
      if (!planOuvert || !etat.fichiers.length) return;
      const objF = { data: [], editorPoints: [], roads: [], zones: [], structures: [] };
      etat.fichiers.forEach(function (f) {
        Object.keys(objF).forEach(function (k) { if (Array.isArray(f.obj[k])) objF[k] = objF[k].concat(f.obj[k]); });
      });
      const app = apparier(objF, _objetPlan());
      etat.nomsPaires = app;
      etat.noms = estimerRobuste(app.paires);
      const wrap = $("kta-recal-affine-wrap");
      wrap.hidden = !(etat.noms && etat.noms.affine && etat.noms.affineMeilleure);
      $("kta-recal-affine").checked = false;
      if (!wrap.hidden) {
        $("kta-recal-affine-txt").textContent = t("recalscan.noms.affine", {
          med: px(etat.noms.affine.stats.mediane), p90: px(etat.noms.affine.stats.p90) });
      }
    }
    $("kta-recal-affine").addEventListener("change", function (e) { etat.utiliserAffine = !!e.target.checked; recap(); });

    // ── Repères cliqués ──
    function remplirChoixClic() {
      const sel = $("kta-recal-clic-point");
      if (!sel) return;
      const pts = pointsFichiers().slice().sort(function (a, b) {
        return a.nom.localeCompare(b.nom, window.ktaLocale ? window.ktaLocale() : "fr-FR", { numeric: true });
      });
      sel.textContent = "";
      const o0 = document.createElement("option");
      o0.value = ""; o0.textContent = pts.length ? t("recalscan.clics.choisir") : t("recalscan.clics.aucunPoint");
      sel.appendChild(o0);
      pts.forEach(function (p, i) {
        const o = document.createElement("option");
        o.value = String(i);
        o.textContent = p.nom;
        sel.appendChild(o);
      });
      sel._ktaPts = pts;
      afficherReperes();
    }
    $("kta-recal-clic-go").addEventListener("click", function () {
      const sel = $("kta-recal-clic-point");
      const p = sel._ktaPts && sel.value !== "" ? sel._ktaPts[Number(sel.value)] : null;
      if (!p) { avertir(t("recalscan.clics.errChoix")); return; }
      if (typeof window.ktaDemanderPositionCarte !== "function") return;
      retirerApercu();
      sub.style.display = "none";
      etat.pickActif = true;
      const fini = function () { etat.pickActif = false; sub.style.display = ""; };
      window.ktaDemanderPositionCarte(function (pos) {
        etat.reperes = etat.reperes.filter(function (r) { return r.nom !== p.nom; });
        etat.reperes.push({ nom: p.nom, A: { x: p.x, y: p.y }, B: { x: pos.x, y: pos.y } });
        fini();
        afficherReperes();
        recap();
      }, { recaler: false, icone: "📍", texte: t("recalscan.clics.floater", { nom: p.nom }), onCancel: fini });
    });

    function afficherReperes() {
      const boite = $("kta-recal-clic-liste");
      if (!boite) return;
      const est = estimerReperes(etat.reperes);
      boite.textContent = "";
      if (!etat.reperes.length) { boite.textContent = t("recalscan.clics.aucun"); return; }
      etat.reperes.forEach(function (r, i) {
        const ligne = document.createElement("div");
        ligne.className = "kta-recal-repere" + (est && est.suspects[i] ? " kta-recal-suspect" : "");
        const nom = document.createElement("span");
        nom.className = "kta-recal-repere-nom";
        nom.textContent = r.nom;
        const ec = document.createElement("span");
        ec.className = "kta-recal-repere-ecart";
        ec.textContent = (est && etat.reperes.length >= 3) ? t("recalscan.clics.ecart", { px: px(est.ecarts[i]) }) : "—";
        const x = document.createElement("button");
        x.type = "button";
        x.className = "kta-btn kta-btn-ghost kta-btn-small";
        x.textContent = "✕";
        x.setAttribute("aria-label", t("recalscan.clics.retirer", { nom: r.nom }));
        x.addEventListener("click", function () { etat.reperes.splice(i, 1); retirerApercu(); afficherReperes(); recap(); });
        ligne.appendChild(nom); ligne.appendChild(ec); ligne.appendChild(x);
        boite.appendChild(ligne);
      });
    }

    // ── Résolutions ──
    ["src", "dst"].forEach(function (cote) {
      $("kta-recal-" + cote + "_img").addEventListener("change", function (e) {
        const f = e.target.files && e.target.files[0];
        if (!f || typeof window.ktaLireDimensionsEntete !== "function") return;
        f.slice(0, 1048576).arrayBuffer().then(function (buf) {
          const dm = window.ktaLireDimensionsEntete(buf);
          if (dm && dm.width > 0) {
            $("kta-recal-" + cote + "_w").value = dm.width;
            $("kta-recal-" + cote + "_h").value = dm.height;
            recap();
          } else {
            window.ktaAlerte(t("recalscan.resol.errImage", { nom: f.name }), { type: "erreur" });
          }
        });
      });
    });
    function lireRes() {
      const v = function (id) { const x = parseInt($(id).value, 10); return (Number.isFinite(x) && x > 0) ? x : null; };
      return { wA: v("kta-recal-src_w"), hA: v("kta-recal-src_h"), wB: v("kta-recal-dst_w"), hB: v("kta-recal-dst_h") };
    }
    // Une paire : null = vide, {invalid:true} = partielle (refus), sinon {A,B}
    function lirePaire(id) {
      const v = function (sfx) { const x = parseFloat($(id + "_" + sfx).value); return Number.isFinite(x) ? x : null; };
      const xa = v("xa"), ya = v("ya"), xb = v("xb"), yb = v("yb");
      const remplis = [xa, ya, xb, yb].filter(function (x) { return x !== null; }).length;
      if (remplis === 0) return null;
      if (remplis < 4) return { invalid: true };
      return { A: { x: xa, y: ya }, B: { x: xb, y: yb } };
    }

    // Matrice de la méthode choisie. Rend { M, html, warn, bloquant } ; M absent = pas prêt (ou refus, err).
    function construire() {
      if (etat.methode === "noms") {
        if (!etat.fichiers.length) return { html: "—" };
        const r = etat.noms;
        const nP = etat.nomsPaires ? etat.nomsPaires.paires.length : 0;
        if (!r || r.err) return { err: t("recalscan.noms.errPeu", { n: nP }) };
        const aff = etat.utiliserAffine && r.affine;
        const st = aff ? r.affine.stats : r.stats;
        const ecartees = aff ? r.affine.ecartees : r.ecartees;
        const M = aff ? r.affine.M : r.M;
        const src = compterSources(aff ? r.affine.retenues : r.retenues);
        let html = t("recalscan.noms.qualite", { n: st.n, med: px(st.mediane), p90: px(st.p90) }) + "<br>"
          + t("recalscan.noms.sources", { uid: src.uid, noms: src.nom }) + "<br>"
          + t(aff ? "recalscan.recap.affine" : "recalscan.recap.similitude",
              { s: M._s.toFixed(4), theta: M._thetaDeg.toFixed(2) });
        if (ecartees.length) {
          html += "<br>" + t("recalscan.noms.ecartes", { n: ecartees.length,
            liste: esc(ecartees.slice(0, 6).map(function (e) { return e.nom + " (" + px(e.ecart) + " px)"; }).join(", ")
              + (ecartees.length > 6 ? "…" : "")) });
        }
        let warn = null;
        if (st.p90 > 10) warn = t("recalscan.noms.warnQualite", { p90: px(st.p90) });
        return { M: M, html: html, warn: warn };
      }
      if (etat.methode === "clics") {
        const n = etat.reperes.length;
        if (n < 3) return { html: t("recalscan.clics.manque", { n: n }) };
        const est = estimerReperes(etat.reperes);
        if (!est) return { err: t("recalscan.clics.errDegenere") };
        const html = t("recalscan.clics.qualite", { n: est.stats.n, total: n, med: px(est.stats.mediane), max: px(est.stats.max) }) + "<br>"
          + t("recalscan.recap.similitude", { s: est.M._s.toFixed(4), theta: est.M._thetaDeg.toFixed(2) });
        const nSusp = est.suspects.filter(Boolean).length;
        return { M: est.M, html: html, warn: nSusp ? t("recalscan.clics.warnSuspect", { n: nSusp }) : null };
      }
      // Résolutions (+ repères saisis à la main)
      const r = lireRes();
      const p1 = lirePaire("kta-recal-p1");
      const p2 = lirePaire("kta-recal-p2");
      if ((p1 && p1.invalid) || (p2 && p2.invalid)) return { err: t("recalscan.resol.errPaire") };
      if (p2 && !p1) return { err: t("recalscan.resol.errPaire2Seule") };
      if (p1 && p2) {
        const M = matriceDeuxPaires(p1.A, p1.B, p2.A, p2.B);
        if (!M) return { err: t("recalscan.resol.errDegenere") };
        let warn = null;
        if (r.wA && r.wB) {
          const kRes = r.wB / r.wA;
          if (Math.abs(M._s - kRes) / Math.max(M._s, kRes) > PROPORTIONS_MAX) {
            warn = t("recalscan.resol.warnEchelle2p", { deduit: M._s.toFixed(4), res: kRes.toFixed(4) });
          }
        }
        return { M: M, warn: warn,
                 html: t("recalscan.resol.mode2p") + "<br>" + t("recalscan.recap.similitude",
                   { s: M._s.toFixed(4), theta: M._thetaDeg.toFixed(2) }) };
      }
      if (!r.wA || !r.hA || !r.wB || !r.hB) return { html: "—" };
      const kX = r.wB / r.wA, kY = r.hB / r.hA;
      const ecart = ecartProportions(r.wA, r.hA, r.wB, r.hB);
      const pct = (Math.round(ecart * 1000) / 10).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR");
      if (p1) {
        const theta = parseFloat($("kta-recal-theta").value) || 0;
        return { M: matriceRecalage(kX, kY, theta, p1.A, p1.B),
                 warn: ecart > PROPORTIONS_MAX ? t("recalscan.resol.warnAspect1p", { pct: pct }) : null,
                 html: t("recalscan.resol.mode1p") + "<br>kX = <strong>" + kX.toFixed(4) + "</strong> · kY = <strong>"
                   + kY.toFixed(4) + "</strong> · θ = <strong>" + theta + "°</strong>" };
      }
      const html = t("recalscan.resol.modeHomo") + "<br>kX = <strong>" + kX.toFixed(4) + "</strong> · kY = <strong>"
        + kY.toFixed(4) + "</strong>";
      // 🩸 Proportions différentes = cadrages différents : l'homothétie décalerait tout. Refus, pas un simple avis.
      if (ecart > PROPORTIONS_MAX) {
        return { M: null, html: html, bloquant: true,
                 err: t(planOuvert ? "recalscan.resol.bloqueAspect" : "recalscan.resol.bloqueAspectSansPlan", { pct: pct }) };
      }
      return { M: matriceHomothetie(kX, kY), html: html };
    }

    function avertir(msg) {
      const w = $("kta-recal-warn");
      w.hidden = false;
      w.textContent = "⚠️ " + msg;
    }

    function recap() {
      const recapEl = $("kta-recal-recap"), warnEl = $("kta-recal-warn"), go = $("kta-recal-go");
      const res = construire();
      warnEl.hidden = true;
      warnEl.classList.remove("kta-recal-bloque");
      retirerApercu();
      recapEl.innerHTML = res.html || "—";
      if (res.err) {
        warnEl.hidden = false;
        warnEl.textContent = "⚠️ " + res.err;
        warnEl.classList.add("kta-recal-bloque");
      } else if (res.warn) {
        warnEl.hidden = false;
        warnEl.textContent = "⚠️ " + res.warn;
      }
      const pret = !!(res.M && !res.err && etat.fichiers.length);
      go.disabled = !pret;
      const ap = $("kta-recal-apercu");
      if (ap) ap.disabled = !pret;
    }
    ["src_w", "src_h", "dst_w", "dst_h", "theta",
     "p1_xa", "p1_ya", "p1_xb", "p1_yb", "p2_xa", "p2_ya", "p2_xb", "p2_yb"].forEach(function (sfx) {
      const el = $("kta-recal-" + sfx);
      if (el) el.addEventListener("input", recap);
    });
    if ($("kta-recal-apercu")) $("kta-recal-apercu").addEventListener("click", montrerApercu);

    // Chaque fichier est retéléchargé « <nom>_conv.json » (copie : l'original lu reste intact pour un autre essai).
    function telecharger() {
      const res = construire();
      if (!res.M || res.err || !etat.fichiers.length) return;   // refus, pas de clamp
      const bilans = [], echecs = [];
      etat.fichiers.forEach(function (f) {
        const obj = JSON.parse(JSON.stringify(f.obj));
        const compte = transformerCoordsFichier(obj, res.M);
        const total = Object.keys(compte).reduce(function (acc, k) { return acc + compte[k]; }, 0);
        if (!total) { echecs.push(f.name + " (" + t("recalscan.aucuneCoord") + ")"); return; }
        const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name.replace(/\.json$/i, "") + "_conv.json";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        bilans.push(f.name + " → " + total);
      });
      etat.illisibles.forEach(function (n) { echecs.push(n + " (" + t("recalscan.errLecture") + ")"); });
      let msg = t("recalscan.okMulti", { ok: bilans.length, detail: bilans.join("\n") || "—" });
      if (echecs.length) msg += "\n\n⚠️ " + t("recalscan.echecs", { n: echecs.length }) + "\n" + echecs.join("\n");
      window.ktaAlerte(msg).then(function () { if (bilans.length) fermer(); });   // bilan lu avant la fermeture
    }
    $("kta-recal-go").addEventListener("click", telecharger);

    choisirMethode(etat.methode);
  }

  window.ktaOuvrirRecalageScan = ouvrir;
})();
