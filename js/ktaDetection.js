/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ktaDetection.js — détection des piliers (masses) et des fronts (traits) sur l'image d'un plan : calcul PUR.
// Chargé par index.html (mode plan, Générateur), par js/ktaDetectionWorker.js (importScripts) et par Node (tests).
// Méthode : chaque pixel → classe de couleur (écart ΔE en Lab aux exemples de la pipette), ouverture morphologique
// (carré de côté `ouverture` : retire moucheté, traits creux, appendices), composantes d'aire ≥ `aireMin`, contour
// extérieur suivi sur les BORDS des pixels (aire exacte), Douglas-Peucker à `simplification`.
// Traits (classe nature "trait") : couleur du trait MOINS les masses pleines, fermeture, squelette (Zhang-Suen),
// chemins sans ergots ni bruit, découpés au cœur du bloc puis raccordés bout à bout entre blocs.
// Expose : KtaDetection = { detecter, detecterBloc, depuisMetres, REGLAGES, executeurWorker, rgbVersLab, deltaE }.
// ⚠️ contrat : les coordonnées rendues sont en PIXELS DU PLAN (x vers la droite, y vers le bas, comme les données) ;
//   les réglages aussi (`echelle` = pixels de bloc par pixel de plan, pour lire l'image à résolution réduite).
// ⚠️ contrat : lireBloc(x, y, w, h, echelle) → Promise<{ data, w, h }> (RGBA, w × h pixels de bloc), fourni par
//   l'appelant (mode plan : lecteur de région ; Générateur : son image source).
// 🩸 Blocs avec marge : une masse est rendue par le bloc qui contient le coin haut-gauche de sa boîte ; celle qui
//   touche le bord de la marge (et non le bord du plan) est plus grande que la marge → `tropGrands`, jamais coupée.
// 🩸 Une masse coupée par le cadre demandé reste entière : la marge est lue au-delà du cadre, dans le plan.
// Garde-fou : scripts/check-detection.js · Doc : docs/architecture/plans-loader.md (Détecter les structures).
"use strict";

(function (racine) {
  // Réglages par défaut, en pixels du plan (essai du 17/11 sur un relevé réel : côté 13 px, 250 px², 1,5 px).
  // `trouMax` : trou fermé d'une masse comblé avant l'ouverture (pastille, numéro) ; au-delà, l'intérieur d'un
  // contour creux reste vide.
  const REGLAGES = Object.freeze({ ouverture: 13, aireMin: 250, simplification: 1.5, trouMax: 700, bloc: 2048,
                                   marge: 256 });

  // ── Couleurs : sRGB → Lab (D65), écart ΔE76 ──
  function _lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function _f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  function rgbVersLab(r, g, b) {
    const R = _lin(r), G = _lin(g), B = _lin(b);
    const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const fx = _f(x), fy = _f(y), fz = _f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function deltaE(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

  // Table de classes sur 6 bits par canal (262 144 cases, 255 = pas encore calculée), remplie à la demande : un
  // calcul Lab par teinte rencontrée, jamais par pixel. Classe k ≥ 1 = classes[k - 1] ; 0 = aucune.
  function _tableClasses(classes) {
    const ex = classes.map(function (c) {
      return { tol: Number(c.tolerance) > 0 ? Number(c.tolerance) : 12,
               labs: (c.couleurs || []).map(function (q) { return rgbVersLab(q[0], q[1], q[2]); }) };
    });
    const table = new Uint8Array(262144).fill(255);
    return function (r, g, b) {
      const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let v = table[k];
      if (v !== 255) return v;
      const lab = rgbVersLab((r & 252) + 2, (g & 252) + 2, (b & 252) + 2);
      let best = 0, dmin = Infinity;
      for (let i = 0; i < ex.length; i++) {
        for (let j = 0; j < ex[i].labs.length; j++) {
          const d = deltaE(lab, ex[i].labs[j]);
          if (d <= ex[i].tol && d < dmin) { dmin = d; best = i + 1; }
        }
      }
      table[k] = best;
      return best;
    };
  }

  // Érosion (tous) ou dilatation (au moins un) par un carré de rayon R, séparable, par sommes glissantes : O(pixels).
  function _passe(src, dst, W, H, R, tous) {
    const tmp = new Uint8Array(W * H), seuil = tous ? 2 * R + 1 : 1;
    for (let y = 0; y < H; y++) {
      let s = 0; const L = y * W;
      for (let x = -R; x < W; x++) {
        const a = x + R, q = x - R - 1;
        if (a < W) s += src[L + a];
        if (q >= 0) s -= src[L + q];
        if (x >= 0) tmp[L + x] = s >= seuil ? 1 : 0;
      }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = -R; y < H; y++) {
        const a = y + R, q = y - R - 1;
        if (a < H) s += tmp[a * W + x];
        if (q >= 0) s -= tmp[q * W + x];
        if (y >= 0) dst[y * W + x] = s >= seuil ? 1 : 0;
      }
    }
  }

  // 🩸 Trous fermés d'au plus `max` pixels comblés (fond 4-connexe qui ne touche pas le bord du bloc) : une pastille
  // au centre d'un pilier étroit laisse de chaque côté une bande plus fine que l'ouverture, qui l'effacerait et
  // couperait le pilier en deux. Par SEGMENTS de ligne et union-find (le fond blanc fait peu de segments) : un
  // remplissage pixel par pixel de tout le fond doublait le temps de la détection.
  function _comblerTrous(m, W, H, max) {
    const deb = [], fin = [], lig = [], par = [];
    const racine = function (i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    let precD = 0, precF = 0;   // segments de la ligne précédente : [precD, precF[
    for (let y = 0; y < H; y++) {
      const L = y * W, curD = deb.length;
      let x = 0, j = precD;
      while (x < W) {
        if (m[L + x]) { x++; continue; }
        const a = x;
        while (x < W && !m[L + x]) x++;
        const id = deb.length;
        deb.push(a); fin.push(x); lig.push(y); par.push(id);
        // 4-connexité : un segment de la ligne précédente qui chevauche [a, x[
        while (j < precF && fin[j] <= a) j++;
        for (let k = j; k < precF && deb[k] < x; k++) {
          const ra = racine(k), rb = racine(id);
          if (ra !== rb) par[rb] = ra;
        }
      }
      precD = curD; precF = deb.length;
    }
    const aire = new Float64Array(deb.length), bord = new Uint8Array(deb.length);
    for (let i = 0; i < deb.length; i++) {
      const r = racine(i);
      aire[r] += fin[i] - deb[i];
      if (lig[i] === 0 || lig[i] === H - 1 || deb[i] === 0 || fin[i] === W) bord[r] = 1;
    }
    for (let i = 0; i < deb.length; i++) {
      const r = racine(i);
      if (bord[r] || aire[r] > max) continue;
      const L = lig[i] * W;
      for (let x = deb[i]; x < fin[i]; x++) m[L + x] = 1;
    }
  }

  // Douglas-Peucker itératif sur une suite ouverte de points [x, y].
  function _dp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const garder = new Uint8Array(pts.length);
    garder[0] = garder[pts.length - 1] = 1;
    const pile = [[0, pts.length - 1]];
    while (pile.length) {
      const s = pile.pop(), a = s[0], b = s[1];
      const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1], L = Math.hypot(bx - ax, by - ay);
      let m = -1, dm = 0;
      for (let i = a + 1; i < b; i++) {
        const d = L ? Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L
          : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
        if (d > dm) { dm = d; m = i; }
      }
      if (dm > eps) { garder[m] = 1; pile.push([a, m], [m, b]); }
    }
    return pts.filter(function (_, i) { return garder[i]; });
  }

  // Contour extérieur d'une composante, sur la grille des COINS de pixels (aire du polygone = aire en pixels), en
  // 4-connexité, objet à droite du sens de marche. Départ : coin haut-gauche du premier pixel (ordre de balayage).
  function _contour(m, W, H, px, py) {
    const plein = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1; };
    // pixel du quadrant (qx, qy) autour du sommet (vx, vy)
    const quad = function (vx, vy, qx, qy) { return plein(qx < 0 ? vx - 1 : vx, qy < 0 ? vy - 1 : vy); };
    const pts = [[px, py]];
    let vx = px, vy = py, dx = 1, dy = 0, n = 0;
    for (;;) {
      vx += dx; vy += dy;
      const rx = -dy, ry = dx;
      const ad = quad(vx, vy, dx + rx, dy + ry), ag = quad(vx, vy, dx - rx, dy - ry);
      let ndx, ndy;
      if (ad) { if (ag) { ndx = -rx; ndy = -ry; } else { ndx = dx; ndy = dy; } }
      else { ndx = rx; ndy = ry; }
      if (vx === px && vy === py && ndx === 1 && ndy === 0) break;
      if (ndx !== dx || ndy !== dy) pts.push([vx, vy]);
      dx = ndx; dy = ndy;
      if (++n > 4 * W * H + 8) break;   // filet : jamais de boucle infinie sur un masque incohérent
    }
    return pts;
  }

  // Polygone fermé simplifié : coupé au sommet le plus loin du départ, chaque moitié simplifiée.
  function _simplifierFerme(pts, eps) {
    if (pts.length <= 4) return pts.slice();
    let loin = 0, dl = -1;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
      if (d > dl) { dl = d; loin = i; }
    }
    const a = _dp(pts.slice(0, loin + 1), eps), b = _dp(pts.slice(loin).concat([pts[0]]), eps);
    return a.concat(b.slice(1, -1));
  }

  function _aire(pts) {
    let s = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    return Math.abs(s) / 2;
  }

  // Un bloc : { data, w, h } lu à `echelle` depuis le coin plan (x0, y0) ; `coeur` = rectangle du bloc (en px de
  // bloc) dont il rend les masses ; `bords` = { g, h, d, b } vrai quand le côté du bloc est le bord du plan.
  // → { masses: [{ classe, points, aire, boite }], tropGrands: [{ classe, boite }], ignorees }
  function detecterBloc(o) {
    const W = o.w, H = o.h, N = W * H, d = o.data, e = o.echelle || 1;
    const R = Math.max(1, Math.floor((o.reglages.ouverture * e) / 2));
    const aireMin = o.reglages.aireMin * e * e, eps = Math.max(0.5, o.reglages.simplification * e);
    // 🩸 Un trait de front a souvent la couleur d'un pilier : les traits ne concourent pas avec les masses pour un
    //   pixel ; chacun est lu à part (couleur du trait MOINS les masses pleines, plus bas).
    const clMasses = o.classes.filter(function (c) { return c.nature !== "trait"; });
    const clTraits = o.classes.filter(function (c) { return c.nature === "trait"; });
    const classer = _tableClasses(clMasses);
    const cls = new Uint8Array(N);
    for (let i = 0, k = 0; i < N; i++, k += 4) {
      if (d[k + 3] < 128) { cls[i] = 255; continue; }   // transparent : hors image
      cls[i] = classer(d[k], d[k + 1], d[k + 2]);
    }
    const coeur = o.coeur || { x: 0, y: 0, w: W, h: H }, bords = o.bords || { g: true, h: true, d: true, b: true };
    const masses = [], tropGrands = [];
    let ignorees = 0;
    const m = new Uint8Array(N), tmp = new Uint8Array(N), vu = new Uint8Array(N), pile = new Int32Array(N);
    const pleins = clTraits.length ? new Uint8Array(N) : null;   // masses après ouverture, retirées des traits
    const trouMax = Math.max(0, Math.round((o.reglages.trouMax === undefined ? REGLAGES.trouMax : o.reglages.trouMax) *
      e * e));
    for (let c = 1; c <= clMasses.length; c++) {
      for (let i = 0; i < N; i++) m[i] = cls[i] === c ? 1 : 0;
      if (trouMax > 0) _comblerTrous(m, W, H, trouMax);
      _passe(m, tmp, W, H, R, true);
      _passe(tmp, m, W, H, R, false);
      if (pleins) for (let i = 0; i < N; i++) if (m[i]) pleins[i] = 1;
      vu.fill(0);
      for (let p = 0; p < N; p++) {
        if (!m[p] || vu[p]) continue;
        // composante (4-connexité) : aire et boîte
        let sp = 0, aire = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
        pile[sp++] = p; vu[p] = 1;
        while (sp) {
          const q = pile[--sp], qx = q % W, qy = (q - qx) / W;
          aire++;
          if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
          if (qx > 0 && m[q - 1] && !vu[q - 1]) { vu[q - 1] = 1; pile[sp++] = q - 1; }
          if (qx < W - 1 && m[q + 1] && !vu[q + 1]) { vu[q + 1] = 1; pile[sp++] = q + 1; }
          if (qy > 0 && m[q - W] && !vu[q - W]) { vu[q - W] = 1; pile[sp++] = q - W; }
          if (qy < H - 1 && m[q + W] && !vu[q + W]) { vu[q + W] = 1; pile[sp++] = q + W; }
        }
        // rendue par le bloc qui contient le coin haut-gauche de sa boîte
        if (x0 < coeur.x || y0 < coeur.y || x0 >= coeur.x + coeur.w || y0 >= coeur.y + coeur.h) continue;
        if (aire < aireMin) { ignorees++; continue; }
        const boite = { x: o.x0 + x0 / e, y: o.y0 + y0 / e, w: (x1 - x0 + 1) / e, h: (y1 - y0 + 1) / e };
        const coupee = (x0 === 0 && !bords.g) || (y0 === 0 && !bords.h) || (x1 === W - 1 && !bords.d) ||
          (y1 === H - 1 && !bords.b);
        if (coupee) { tropGrands.push({ classe: clMasses[c - 1].id, boite: boite }); continue; }
        const s = _simplifierFerme(_contour(m, W, H, p % W, (p - p % W) / W), eps);
        if (s.length < 3) { ignorees++; continue; }
        masses.push({
          classe: clMasses[c - 1].id,
          aire: _aire(s) / (e * e),
          boite: boite,
          points: s.map(function (q) {
            return { x: Math.round((o.x0 + q[0] / e) * 10) / 10, y: Math.round((o.y0 + q[1] / e) * 10) / 10 };
          })
        });
      }
    }
    const traits = [];
    clTraits.forEach(function (cl) {
      const dedans = _tableClasses([cl]);
      for (let i = 0, k = 0; i < N; i++, k += 4) m[i] = d[k + 3] >= 128 && dedans(d[k], d[k + 1], d[k + 2]) ? 1 : 0;
      _traitsBloc(m, tmp, pleins, W, H, o, e).forEach(function (pts) {
        traits.push({ classe: cl.id, points: pts });
      });
    });
    return { masses: masses, tropGrands: tropGrands, ignorees: ignorees, traits: traits };
  }

  // ── Traits (fronts) ──
  // Zhang-Suen sur la liste des pixels actifs (bord du bloc vidé : le squelette ne touche jamais le cadre).
  function _squelette(S, W, H) {
    let act = [];
    for (let i = 0; i < W * H; i++) {
      if (!S[i]) continue;
      const x = i % W, y = (i - x) / W;
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) act.push(i); else S[i] = 0;
    }
    let change = true;
    while (change) {
      change = false;
      for (let pas = 0; pas < 2; pas++) {
        const del = [];
        for (let a = 0; a < act.length; a++) {
          const i = act[a];
          if (!S[i]) continue;
          const p2 = S[i - W], p3 = S[i - W + 1], p4 = S[i + 1], p5 = S[i + W + 1], p6 = S[i + W], p7 = S[i + W - 1],
            p8 = S[i - 1], p9 = S[i - W - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let t = 0;
          for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) t++;
          if (t !== 1) continue;
          if (pas === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
          del.push(i);
        }
        if (del.length) { change = true; for (let k = 0; k < del.length; k++) S[del[k]] = 0; }
      }
      act = act.filter(function (i) { return S[i]; });
    }
  }
  // Squelette → chemins entre nœuds (bouts, carrefours) et boucles. Adjacence « m » : une diagonale ne compte que si
  // les deux 4-voisins qui la bordent sont vides (pas de faux carrefour sur les marches d'escalier du squelette).
  function _chemins(S, W, H) {
    const N = W * H;
    const vois = function (i) {
      const r = [], n = S[i - W], es = S[i + 1], so = S[i + W], ou = S[i - 1];
      if (n) r.push(i - W); if (es) r.push(i + 1); if (so) r.push(i + W); if (ou) r.push(i - 1);
      if (S[i - W + 1] && !n && !es) r.push(i - W + 1);
      if (S[i + W + 1] && !so && !es) r.push(i + W + 1);
      if (S[i + W - 1] && !so && !ou) r.push(i + W - 1);
      if (S[i - W - 1] && !n && !ou) r.push(i - W - 1);
      return r;
    };
    const vu = new Uint8Array(N), aretes = new Set(), out = [];
    const cle = function (a, b) { return a < b ? a + "," + b : b + "," + a; };
    const marcher = function (s, n) {
      const ch = [s, n];
      aretes.add(cle(s, n));
      let prec = s, cur = n;
      while (!vu[cur] && vois(cur).length === 2) {
        vu[cur] = 1;
        const v = vois(cur), suiv = v[0] === prec ? v[1] : v[0];
        aretes.add(cle(cur, suiv));
        ch.push(suiv);
        prec = cur; cur = suiv;
        if (cur === s) break;
      }
      return ch;
    };
    for (let i = 0; i < N; i++) {
      if (!S[i]) continue;
      const v = vois(i);
      if (v.length === 2) continue;
      for (let k = 0; k < v.length; k++) {
        if (aretes.has(cle(i, v[k]))) continue;
        const ch = marcher(i, v[k]);
        out.push({ ch: ch, bouts: [vois(ch[0]).length, vois(ch[ch.length - 1]).length] });
      }
    }
    for (let i = 0; i < N; i++) {
      if (!S[i] || vu[i] || vois(i).length !== 2) continue;
      vu[i] = 1;
      out.push({ ch: marcher(i, vois(i)[0]), bouts: [2, 2] });
    }
    return out;
  }
  // Morceaux d'une polyligne [x, y] à l'intérieur d'un rectangle, segment par segment (Liang-Barsky).
  // 🩸 Un segment simplifié peut traverser le rectangle de part en part, ses deux bouts dehors (trait qui court sur
  //   tout un bloc) : il faut le couper, pas l'écarter.
  function _decouper(pts, r) {
    const coupe = function (a, b) {   // → [t0, t1] de la partie du segment dans r, ou null
      let t0 = 0, t1 = 1;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const p = [-dx, dx, -dy, dy], q = [a[0] - r.x, r.x + r.w - a[0], a[1] - r.y, r.y + r.h - a[1]];
      for (let k = 0; k < 4; k++) {
        if (p[k] === 0) { if (q[k] < 0) return null; continue; }
        const u = q[k] / p[k];
        if (p[k] < 0) { if (u > t1) return null; if (u > t0) t0 = u; }
        else { if (u < t0) return null; if (u < t1) t1 = u; }
      }
      return [t0, t1];
    };
    const at = function (a, b, t) { return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
    const out = [];
    let cur = null;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], c = coupe(a, b);
      if (!c || c[1] - c[0] <= 0) { if (cur) { out.push(cur); cur = null; } continue; }
      const p0 = at(a, b, c[0]), p1 = at(a, b, c[1]);
      if (!cur || c[0] > 0) { if (cur) out.push(cur); cur = [p0]; }
      cur.push(p1);
      if (c[1] < 1) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out.filter(function (p) { return p.length >= 2; });
  }
  // Traits d'un masque : moins les masses (dilatées), fermeture de 3 px (trous d'anticrénelage), squelette, chemins
  // sans ergots ni bruit, simplifiés, rendus en pixels du plan et découpés au cœur du bloc.
  function _traitsBloc(T, tmp, pleins, W, H, o, e) {
    const rg = o.reglages;
    if (pleins) {
      _passe(pleins, tmp, W, H, Math.max(1, Math.round((rg.ecartMasse === undefined ? 2 : rg.ecartMasse) * e)), false);
      for (let i = 0; i < W * H; i++) if (tmp[i]) T[i] = 0;
    }
    _passe(T, tmp, W, H, 1, false);
    _passe(tmp, T, W, H, 1, true);
    _squelette(T, W, H);
    const spur = (rg.ergot === undefined ? 15 : rg.ergot) * e;
    const lmin = (rg.longueurMin === undefined ? 20 : rg.longueurMin) * e;
    const eps = Math.max(0.5, rg.simplification * e), coeur = o.coeur || { x: 0, y: 0, w: W, h: H };
    const out = [];
    _chemins(T, W, H).forEach(function (t) {
      const L = t.ch.length, bout = t.bouts[0] === 1 || t.bouts[1] === 1, noeud = t.bouts[0] > 2 || t.bouts[1] > 2;
      if (L < lmin && !(noeud && !bout)) return;   // bruit isolé
      if (bout && noeud && L < spur) return;          // ergot du squelette
      if (L < 4) return;
      const pts = _dp(t.ch.map(function (i) { const x = i % W; return [x + 0.5, (i - x) / W + 0.5]; }), eps);
      _decouper(pts, coeur).forEach(function (mor) {
        out.push(mor.map(function (q) {
          return { x: Math.round((o.x0 + q[0] / e) * 10) / 10, y: Math.round((o.y0 + q[1] / e) * 10) / 10 };
        }));
      });
    });
    return out;
  }
  // Morceaux de traits rendus par des blocs voisins : raccordés bout à bout (même classe, bouts à moins de `tol`).
  function _raccorder(traits, tol) {
    const t = traits.map(function (x) { return { classe: x.classe, points: x.points.slice() }; });
    const proche = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y) <= tol; };
    let fusion = true;
    while (fusion) {
      fusion = false;
      for (let i = 0; i < t.length && !fusion; i++) {
        for (let j = i + 1; j < t.length && !fusion; j++) {
          if (t[i].classe !== t[j].classe) continue;
          const A = t[i].points, B = t[j].points, a0 = A[0], a1 = A[A.length - 1], b0 = B[0], b1 = B[B.length - 1];
          let n = null;
          if (proche(a1, b0)) n = A.concat(B.slice(1));
          else if (proche(a1, b1)) n = A.concat(B.slice(0, -1).reverse());
          else if (proche(a0, b1)) n = B.concat(A.slice(1));
          else if (proche(a0, b0)) n = B.slice().reverse().concat(A.slice(1));
          if (n) { t[i].points = n; t.splice(j, 1); fusion = true; }
        }
      }
    }
    return t;
  }

  // Réglages donnés en mètres (plan calibré, APP_CONFIG.scale en px/m) → pixels du plan.
  function depuisMetres(r, pxParM) {
    const k = Number(pxParM) > 0 ? Number(pxParM) : 1;
    const out = Object.assign({}, REGLAGES);
    if (r.ouvertureM > 0) out.ouverture = r.ouvertureM * k;
    if (r.aireMinM2 > 0) out.aireMin = r.aireMinM2 * k * k;
    if (r.simplificationM > 0) out.simplification = r.simplificationM * k;
    return out;
  }

  // Détection sur une région du plan, bloc par bloc. opts = { lireBloc, region {x,y,w,h}, limites {w,h} (image du
  // plan), classes [{ id, couleurs: [[r,g,b]], tolerance }], reglages, echelle, executer?, onProgres?, signal? }.
  // `executer(bloc)` → Promise<résultat de detecterBloc> : un worker (executeurWorker), sinon le calcul ici.
  async function detecter(opts) {
    const rg = Object.assign({}, REGLAGES, opts.reglages || {}), e = opts.echelle || 1;
    const reg = opts.region, lim = opts.limites || { w: reg.x + reg.w, h: reg.y + reg.h };
    const pas = rg.bloc / e, marge = rg.marge;
    const executer = opts.executer || function (b) {
      // repli sans worker : un bloc par tâche, la page respire entre deux
      return new Promise(function (ok) { setTimeout(function () { ok(detecterBloc(b)); }, 0); });
    };
    const blocs = [];
    for (let y = reg.y; y < reg.y + reg.h; y += pas) {
      for (let x = reg.x; x < reg.x + reg.w; x += pas) blocs.push([x, y]);
    }
    const res = { masses: [], tropGrands: [], ignorees: 0, traits: [], blocs: blocs.length };
    for (let i = 0; i < blocs.length; i++) {
      if (opts.signal && opts.signal.aborted) throw Object.assign(new Error("annulé"), { name: "AbortError" });
      const cx = blocs[i][0], cy = blocs[i][1];
      const cw = Math.min(pas, reg.x + reg.w - cx), ch = Math.min(pas, reg.y + reg.h - cy);
      // bloc lu = cœur + marge, borné à l'image du plan
      const lx = Math.max(0, Math.floor(cx - marge)), ly = Math.max(0, Math.floor(cy - marge));
      const rx = Math.min(lim.w, Math.ceil(cx + cw + marge)), ry = Math.min(lim.h, Math.ceil(cy + ch + marge));
      const lu = await opts.lireBloc(lx, ly, rx - lx, ry - ly, e);
      const r = await executer({
        data: lu.data, w: lu.w, h: lu.h, x0: lx, y0: ly, echelle: e, classes: opts.classes, reglages: rg,
        coeur: { x: Math.round((cx - lx) * e), y: Math.round((cy - ly) * e),
                 w: Math.round(cw * e), h: Math.round(ch * e) },
        bords: { g: lx <= 0, h: ly <= 0, d: rx >= lim.w, b: ry >= lim.h }
      });
      res.masses.push.apply(res.masses, r.masses);
      res.tropGrands.push.apply(res.tropGrands, r.tropGrands);
      res.ignorees += r.ignorees;
      if (r.traits) res.traits.push.apply(res.traits, r.traits);
      if (opts.onProgres) opts.onProgres(i + 1, blocs.length);
    }
    // traits coupés au bord des blocs : raccordés (le cœur d'un bloc touche celui du voisin)
    res.traits = _raccorder(res.traits, Math.max(1.5, 2 / e));
    return res;
  }

  // Exécuteur par worker (js/ktaDetectionWorker.js) : un bloc à la fois, tampon d'image TRANSFÉRÉ (pas copié).
  // → { executer(bloc) → Promise, fermer() } ; null sans Worker (le calcul se fait alors dans la page).
  function executeurWorker(url) {
    if (typeof Worker === "undefined") return null;
    let w;
    try { w = new Worker(url || "js/ktaDetectionWorker.js"); } catch (err) { return null; }
    let suivant = 1;
    const attente = new Map();
    w.onmessage = function (ev) {
      const m = ev.data || {}, a = attente.get(m.id);
      if (!a) return;
      attente.delete(m.id);
      if (m.erreur) a.ko(new Error(m.erreur)); else a.ok(m.resultat);
    };
    w.onerror = function (ev) {
      attente.forEach(function (a) { a.ko(new Error((ev && ev.message) || "worker")); });
      attente.clear();
    };
    return {
      executer: function (b) {
        return new Promise(function (ok, ko) {
          const id = suivant++;
          attente.set(id, { ok: ok, ko: ko });
          const tampon = b.data && b.data.buffer ? b.data.buffer : null;
          w.postMessage({ id: id, bloc: b }, tampon ? [tampon] : []);
        });
      },
      fermer: function () { try { w.terminate(); } catch (err) { /* déjà arrêté */ } attente.clear(); }
    };
  }

  const api = { detecter: detecter, detecterBloc: detecterBloc, depuisMetres: depuisMetres, REGLAGES: REGLAGES,
                executeurWorker: executeurWorker, rgbVersLab: rgbVersLab, deltaE: deltaE };
  racine.KtaDetection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : globalThis);
