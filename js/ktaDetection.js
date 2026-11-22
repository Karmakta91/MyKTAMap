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
// Traits (classe nature "trait") : couleur du trait MOINS les masses de sa couleur, fermeture, squelette (Zhang-Suen),
// chemins sans ergots ni bruit ni cerne de pilier gardé, découpés au cœur du bloc puis raccordés entre blocs.
// Bandes de la couleur des piliers (galerie, mur en trait) retirées par leur forme (_retirerBandes : tronçons du
// squelette d'épaisseur constante plus longs que 4 × cette épaisseur).
// Réglages déduits des exemples touchés (mesurerExemple, reglagesDepuisExemples, reglagesPourTaille) ; recalcul sur
// les blocs gardés par l'exécuteur, sans relire l'image (recalculer).
// Remplir au clic (remplir) : zone fermée par le trait autour d'un point, contour au milieu du trait, trous de
// 1 à 2 px bouchés.
// Affiner les contours (option `affiner` de remplir et des réglages, _affiner) : lissage en mètres, redressement en
// rectangle des formes presque rectangles.
// Galeries → tracés (section « Galeries ») : axes du masque d'une galerie (pipette : réglage `galerie` de detecter ;
// remplirGalerie), bouché puis percé des structures posées, et reseauGaleries (un tracé par galerie, accroché).
// Expose : KtaDetection = { detecter, detecterBloc, recalculer, mesurerExemple, reglagesDepuisExemples,
//   reglagesPourTaille, depuisMetres, REGLAGES, executeurWorker, executeurLocal, rgbVersLab, deltaE,
//   remplir, REMPLIR, plafondRemplir, toleranceAffinage, AFFINER, reseauGaleries, remplirGalerie,
//   reglagesGaleries, GALERIES }.
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
  const TROU_COMPACT = 0.35;   // part minimale de sa boîte qu'un trou doit remplir pour être comblé
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
    const n = deb.length, aire = new Float64Array(n), bord = new Uint8Array(n);
    const x0 = new Int32Array(n).fill(W), x1 = new Int32Array(n);
    const y0 = new Int32Array(n).fill(H), y1 = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const r = racine(i);
      aire[r] += fin[i] - deb[i];
      if (lig[i] === 0 || lig[i] === H - 1 || deb[i] === 0 || fin[i] === W) bord[r] = 1;
      if (deb[i] < x0[r]) x0[r] = deb[i]; if (fin[i] > x1[r]) x1[r] = fin[i];
      if (lig[i] < y0[r]) y0[r] = lig[i]; if (lig[i] + 1 > y1[r]) y1[r] = lig[i] + 1;
    }
    for (let i = 0; i < n; i++) {
      const r = racine(i);
      if (bord[r] || aire[r] > max) continue;
      // 🩸 Seulement un trou COMPACT (pastille, numéro : plus du tiers de sa boîte) : le trait fin qui cerne un pilier
      //   de la couleur du fond est aussi un « trou » fermé, en anneau ; le combler soudait le pilier au fond.
      if (aire[r] < TROU_COMPACT * (x1[r] - x0[r]) * (y1[r] - y0[r])) continue;
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

  function _aireSignee(pts) {
    let s = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    return s / 2;
  }
  function _aire(pts) { return Math.abs(_aireSignee(pts)); }

  // ── Affiner un contour (case « Affiner les contours » de la fenêtre Détecter) ──
  // ⚠️ contrat (décision produit) : lissage toujours, à une tolérance en MÈTRES (toleranceM, convertie par l'échelle
  //   du plan ; repliPx sans échelle) ; redressement en rectangle (côtés droits, angles droits, orientation gardée)
  //   seulement pour une forme presque rectangle. Un pilier rond ou irrégulier garde sa forme, lissée.
  // Mesures (planches de check-detection.js, relevé réel au trait flou) : 0,2 à 0,3 m redressent un carré au trait
  //   bruité de ± 2 px à 20 px/m sans rien changer d'autre ; 0,75 m efface déjà de vrais décrochements.
  // Forme presque rectangle : aire lissée ≥ rapportRect × celle du rectangle des côtés médians, et aucun point lissé
  //   à plus de max(ecartRectMin px, ecartRect × tolérance) de ce rectangle. Mesuré sur 40 planches bruitées : carré
  //   ≥ 0,98 et ≤ 0,87 × tolérance ; rond ≤ 0,95 ; trapèze aux côtés de 7° : 0,87 à 1,34 × tolérance.
  // 🩸 Sous 25 px de côté, un bruit de ± 2 px rend carré et rond indiscernables : le petit pilier carré n'est alors
  //   pas toujours redressé (lissé seulement), jamais un rond redressé.
  // 🩸 Tolérance bornée à √aire / plafondForme : sans cela un petit pilier serait lissé en galet.
  const AFFINER = Object.freeze({ toleranceM: 0.25, repliPx: 2, plafondForme: 6, passes: 2, rapportRect: 0.96,
                                  ecartRect: 0.9, ecartRectMin: 1.5 });
  // Tolérance du lissage en px du plan pour une échelle en px/m (absente ou nulle : repli en px).
  function toleranceAffinage(pxParM) {
    const k = Number(pxParM);
    return k > 0 ? AFFINER.toleranceM * k : AFFINER.repliPx;
  }
  // Contour [[x, y]] (px de bloc) → contour affiné ; `tol` = tolérance (px de bloc), `eps` = simplification d'avant,
  // plancher de celle qui suit le lissage.
  function _affiner(pts, tol, eps) {
    const P = [], n = pts.length;
    for (let i = 0; i < n; i++) {   // rééchantillonné au pas de 1 px : la moyenne glissante porte sur une longueur
      const a = pts[i], b = pts[(i + 1) % n], k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let j = 0; j < k; j++) P.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    }
    const N = P.length, signe = Math.sign(_aireSignee(pts));
    const t = Math.min(tol, Math.sqrt(_aire(pts)) / AFFINER.plafondForme);
    const h = Math.min(Math.max(1, Math.round(t)), Math.floor((N - 1) / 4));
    if (h < 1) return _simplifierFerme(pts, eps);
    let S = P;
    for (let passe = 0; passe < AFFINER.passes; passe++) {   // moyenne glissante circulaire sur 2h + 1 points
      const T = new Array(N);
      let sx = 0, sy = 0;
      for (let k = -h; k <= h; k++) { const q = S[(k + N) % N]; sx += q[0]; sy += q[1]; }
      for (let i = 0; i < N; i++) {
        T[i] = [sx / (2 * h + 1), sy / (2 * h + 1)];
        const sort = S[(i - h + N) % N], entre = S[(i + h + 1) % N];
        sx += entre[0] - sort[0]; sy += entre[1] - sort[1];
      }
      S = T;
    }
    // orientation dominante (côtés pondérés par leur longueur, angle × 4 : les quatre côtés d'un rectangle votent
    // ensemble), puis rectangle des côtés médians dans ce repère
    let c4 = 0, s4 = 0;
    for (let i = 0; i < N; i++) {
      const a = S[i], b = S[(i + 1) % N], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (!L) continue;
      const f = 4 * Math.atan2(dy, dx);
      c4 += L * Math.cos(f); s4 += L * Math.sin(f);
    }
    const th = Math.atan2(s4, c4) / 4, cs = Math.cos(th), sn = Math.sin(th);
    const R = S.map(function (p) { return [p[0] * cs + p[1] * sn, -p[0] * sn + p[1] * cs]; });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    R.forEach(function (p) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    });
    const cotes = [[], [], [], []];
    R.forEach(function (p) {
      const d = [p[0] - x0, x1 - p[0], p[1] - y0, y1 - p[1]];
      let k = 0;
      for (let j = 1; j < 4; j++) if (d[j] < d[k]) k = j;
      cotes[k].push(k < 2 ? p[0] : p[1]);
    });
    const med = function (v) { v.sort(function (a, b) { return a - b; }); return v.length ? v[v.length >> 1] : NaN; };
    const X0 = med(cotes[0]), X1 = med(cotes[1]), Y0 = med(cotes[2]), Y1 = med(cotes[3]);
    if (X1 - X0 > 0 && Y1 - Y0 > 0) {
      let ecart = 0;
      R.forEach(function (p) {
        const dedans = p[0] >= X0 && p[0] <= X1 && p[1] >= Y0 && p[1] <= Y1;
        const d = dedans ? Math.min(p[0] - X0, X1 - p[0], p[1] - Y0, Y1 - p[1])
          : Math.hypot(Math.max(X0 - p[0], 0, p[0] - X1), Math.max(Y0 - p[1], 0, p[1] - Y1));
        if (d > ecart) ecart = d;
      });
      if (ecart <= Math.max(AFFINER.ecartRectMin, AFFINER.ecartRect * t) &&
          _aire(S) >= AFFINER.rapportRect * (X1 - X0) * (Y1 - Y0)) {
        const coins = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]].map(function (p) {
          return [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs];
        });
        return Math.sign(_aireSignee(coins)) === signe ? coins : coins.reverse();
      }
    }
    return _coinsVifs(S, _simplifierFerme(S, Math.max(eps, 0.5 * t)), h, t);
  }
  // 🩸 La moyenne glissante arrondit les coins (jusqu'à la tolérance) : chaque côté simplifié est remplacé par la
  //   droite ajustée sur sa partie centrale lissée (2h points écartés de chaque bout), et chaque sommet par
  //   l'intersection des deux droites voisines. Côtés presque alignés (< 15°) ou intersection à plus de 2 × la
  //   tolérance du sommet : le sommet simplifié reste.
  function _coinsVifs(S, V, h, t) {
    const N = S.length, n = V.length;
    if (n < 3) return V;
    const rang = new Map();
    S.forEach(function (p, i) { rang.set(p, i); });
    const idx = V.map(function (p) { return rang.get(p); });
    if (idx.some(function (i) { return i === undefined; })) return V;
    const droites = idx.map(function (a, k) {
      const b = idx[(k + 1) % n], long = (b - a + N) % N || N, m = Math.min(2 * h, Math.floor(long / 4));
      let cx = 0, cy = 0, c = 0;
      const pts = [];
      for (let j = m; j <= long - m; j++) { const q = S[(a + j) % N]; pts.push(q); cx += q[0]; cy += q[1]; c++; }
      cx /= c; cy /= c;
      let xx = 0, yy = 0, xy = 0;
      pts.forEach(function (q) { const dx = q[0] - cx, dy = q[1] - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; });
      const ang = 0.5 * Math.atan2(2 * xy, xx - yy);
      return { x: cx, y: cy, ux: Math.cos(ang), uy: Math.sin(ang) };
    });
    const vifs = V.map(function (v, k) {
      const p = _croiser(droites[(k + n - 1) % n], droites[k]);
      return p && Math.hypot(p[0] - v[0], p[1] - v[1]) <= 2 * t ? p : v;
    });
    return _nettoyer(vifs, t);
  }
  // Intersection de deux droites { x, y, ux, uy } ; null si elles font moins de 15° entre elles.
  function _croiser(d1, d2) {
    const det = d1.ux * d2.uy - d1.uy * d2.ux;
    if (Math.abs(det) < Math.sin(Math.PI / 12)) return null;
    const u = ((d2.x - d1.x) * d2.uy - (d2.y - d1.y) * d2.ux) / det;
    return [d1.x + u * d1.ux, d1.y + u * d1.uy];
  }
  // Sommets superflus après _coinsVifs : sommet presque aligné (virage < 12°) retiré ; côté court (< 2 × tolérance)
  // entre deux côtés au moins deux fois plus longs = coin coupé, remplacé par l'intersection des côtés voisins quand
  // elle tombe à moins de 2 × la tolérance de ses deux bouts.
  // 🩸 Sans la condition des côtés longs, un petit pilier rond (côtés tous courts) finissait en quadrilatère.
  function _nettoyer(V, t) {
    const droite = function (a, b) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return { x: a[0], y: a[1], ux: (b[0] - a[0]) / L, uy: (b[1] - a[1]) / L };
    };
    const virage = function (a, b, c) {
      let d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return Math.abs(d);
    };
    let P = V.slice();
    for (let tour = 0; tour < 4 * V.length && P.length > 3; tour++) {
      const n = P.length;
      let fait = false;
      for (let k = 0; k < n && !fait; k++) {
        const a = P[(k + n - 1) % n], b = P[k], c = P[(k + 1) % n];
        if (Math.hypot(c[0] - b[0], c[1] - b[1]) < 0.5 || virage(a, b, c) < Math.PI / 15) { P.splice(k, 1); fait = true; }
      }
      for (let k = 0; k < P.length && !fait && P.length > 4; k++) {
        const m = P.length, a = P[(k + m - 1) % m], b = P[k], c = P[(k + 1) % m], d = P[(k + 2) % m];
        const court = Math.hypot(c[0] - b[0], c[1] - b[1]);
        if (court >= 2 * t || Math.hypot(b[0] - a[0], b[1] - a[1]) < 2 * court ||
            Math.hypot(d[0] - c[0], d[1] - c[1]) < 2 * court) continue;
        const p = _croiser(droite(a, b), droite(c, d));
        if (!p || Math.hypot(p[0] - b[0], p[1] - b[1]) > 2 * t || Math.hypot(p[0] - c[0], p[1] - c[1]) > 2 * t) continue;
        P[k] = p;
        P.splice((k + 1) % m, 1);
        fait = true;
      }
      if (!fait) break;
    }
    return P;
  }

  // Un bloc : { data, w, h } lu à `echelle` depuis le coin plan (x0, y0) ; `coeur` = rectangle du bloc (en px de
  // bloc) dont il rend les masses ; `bords` = { g, h, d, b } vrai quand le côté du bloc est le bord du plan.
  // → { masses: [{ classe, points, aire, boite }], tropGrands: [{ classe, boite }], ignorees }
  function detecterBloc(o) {
    if (o.reglages && o.reglages.galerie) return _galeriesBloc(o);
    const W = o.w, H = o.h, N = W * H, d = o.data, e = o.echelle || 1;
    const R = Math.max(1, Math.floor((o.reglages.ouverture * e) / 2));
    const aireMin = o.reglages.aireMin * e * e, eps = Math.max(0.5, o.reglages.simplification * e);
    // `affiner` : tolérance du lissage (px du plan, toleranceAffinage) ; absente ou nulle : contour d'avant
    const affiner = o.reglages.affiner > 0 ? o.reglages.affiner * e : 0;
    // aire maximale (curseur « Taille maximale ») : une masse plus grande est écartée et comptée à part — fond ou
    // galeries de la couleur de piliers clairs cernés d'un trait (les piliers, séparés par le trait, restent)
    const aireMax = o.reglages.aireMax > 0 ? o.reglages.aireMax * e * e : Infinity;
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
    let ignorees = 0, ecartees = 0;
    const m = new Uint8Array(N), tmp = new Uint8Array(N), vu = new Uint8Array(N), pile = new Int32Array(N);
    const pleins = clTraits.length ? new Uint8Array(N) : null;   // masses après ouverture (toutes tailles)
    const gardes = pleins ? new Uint8Array(N) : null;   // masses gardées (aireMin ≤ aire ≤ aireMax) : leur cerne
    const trouMax = Math.max(0, Math.round((o.reglages.trouMax === undefined ? REGLAGES.trouMax : o.reglages.trouMax) *
      e * e));
    for (let c = 1; c <= clMasses.length; c++) {
      for (let i = 0; i < N; i++) m[i] = cls[i] === c ? 1 : 0;
      if (trouMax > 0) _comblerTrous(m, W, H, trouMax);
      _passe(m, tmp, W, H, R, true);
      _passe(tmp, m, W, H, R, false);
      if (o.reglages.bandes !== false) _retirerBandes(m, W, H);
      if (pleins) for (let i = 0; i < N; i++) if (m[i]) pleins[i] = 1;
      vu.fill(0);
      for (let p = 0; p < N; p++) {
        if (!m[p] || vu[p]) continue;
        // composante (4-connexité) : aire et boîte ; `pile` sert de file, la composante est pile[0..aire[
        let sp = 0, aire = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
        pile[sp++] = p; vu[p] = 1;
        while (aire < sp) {
          const q = pile[aire++], qx = q % W, qy = (q - qx) / W;
          if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
          if (qx > 0 && m[q - 1] && !vu[q - 1]) { vu[q - 1] = 1; pile[sp++] = q - 1; }
          if (qx < W - 1 && m[q + 1] && !vu[q + 1]) { vu[q + 1] = 1; pile[sp++] = q + 1; }
          if (qy > 0 && m[q - W] && !vu[q - W]) { vu[q - W] = 1; pile[sp++] = q - W; }
          if (qy < H - 1 && m[q + W] && !vu[q + W]) { vu[q + W] = 1; pile[sp++] = q + W; }
        }
        // ⚠️ avant le tri par bloc : une masse rendue par le bloc voisin efface aussi son cerne dans la marge
        if (gardes && aire >= aireMin && aire <= aireMax) for (let k = 0; k < aire; k++) gardes[pile[k]] = 1;
        // rendue par le bloc qui contient le coin haut-gauche de sa boîte
        if (x0 < coeur.x || y0 < coeur.y || x0 >= coeur.x + coeur.w || y0 >= coeur.y + coeur.h) continue;
        if (aire < aireMin) { ignorees++; continue; }
        if (aire > aireMax) { ecartees++; continue; }
        const boite = { x: o.x0 + x0 / e, y: o.y0 + y0 / e, w: (x1 - x0 + 1) / e, h: (y1 - y0 + 1) / e };
        const coupee = (x0 === 0 && !bords.g) || (y0 === 0 && !bords.h) || (x1 === W - 1 && !bords.d) ||
          (y1 === H - 1 && !bords.b);
        if (coupee) { tropGrands.push({ classe: clMasses[c - 1].id, boite: boite }); continue; }
        const cont = _contour(m, W, H, p % W, (p - p % W) / W);
        const s = affiner ? _affiner(cont, affiner, eps) : _simplifierFerme(cont, eps);
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
      const retirer = pleins ? _masseDuTrait(m, pleins, W, H, vu, pile) : null;
      _traitsBloc(m, tmp, retirer, gardes, W, H, o, e).forEach(function (pts) {
        traits.push({ classe: cl.id, points: pts });
      });
    });
    return { masses: masses, tropGrands: tropGrands, ignorees: ignorees, ecartees: ecartees, traits: traits };
  }

  // ── Bandes : un trait de la couleur des piliers (galerie, mur levé en trait) n'est pas une masse ──
  // ⚠️ contrat (décision produit) : un tronçon du squelette d'épaisseur presque constante (écart-type < BANDE_ECART
  //   de la moyenne) sur une longueur > BANDE_LONGUEUR × son épaisseur est un trait ; ses pixels sont retirés de la
  //   masse (disque de rayon = distance au bord autour du tronçon). Les piliers soudés à une bande s'en détachent,
  //   les petits restent (squelette court).
  // 🩸 Par TRONÇONS, pas par branche entière : une bande qui traverse un pilier donne une seule branche (pas de
  //   carrefour), bande et pilier mêlés ; l'écart-type de la branche la rejetait en bloc (mesuré : 41 piliers sur 54).
  //   Un tronçon s'arrête où l'épaisseur s'écarte de plus de BANDE_RUPTURE de sa moyenne courante (entrée dans un
  //   pilier) ; on n'efface jamais au-delà, le pilier n'est pas entamé.
  const BANDE_ECART = 0.2, BANDE_LONGUEUR = 4, BANDE_RUPTURE = 0.3;
  function _distance(m, W, H) {   // chanfrein 3-4 (unités : 3 par pixel), 0 hors masse
    const d = new Int32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = m[i] ? 1e6 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!d[i]) continue;
      const g = x > 0 ? d[i - 1] : 0, h = y > 0 ? d[i - W] : 0;
      const hg = x > 0 && y > 0 ? d[i - W - 1] : 0, hd = x < W - 1 && y > 0 ? d[i - W + 1] : 0;
      d[i] = Math.min(d[i], g + 3, h + 3, hg + 4, hd + 4);
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!d[i]) continue;
      const dr = x < W - 1 ? d[i + 1] : 0, b = y < H - 1 ? d[i + W] : 0;
      const bd = x < W - 1 && y < H - 1 ? d[i + W + 1] : 0, bg = x > 0 && y < H - 1 ? d[i + W - 1] : 0;
      d[i] = Math.min(d[i], dr + 3, b + 3, bd + 4, bg + 4);
    }
    return d;
  }
  // 🩸 Squelette et distance coûtent cher sur tout le bloc (mesuré : jusqu'à +146 % de temps) : seules les
  //   composantes ALLONGÉES (longueur > 3 × épaisseur estimée aire / longueur) ou PEU REMPLIES (aire < moitié de leur
  //   boîte : bande oblique, pilier soudé à une bande) sont examinées, chacune dans son cadre.
  function _retirerBandes(m, W, H) {
    const N = W * H, vu = new Uint8Array(N);
    let retires = 0;
    for (let p = 0; p < N; p++) {
      if (!m[p] || vu[p]) continue;
      const px = [p];
      vu[p] = 1;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let k = 0; k < px.length; k++) {
        const q = px[k], qx = q % W, qy = (q - qx) / W;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        if (qx > 0 && m[q - 1] && !vu[q - 1]) { vu[q - 1] = 1; px.push(q - 1); }
        if (qx < W - 1 && m[q + 1] && !vu[q + 1]) { vu[q + 1] = 1; px.push(q + 1); }
        if (qy > 0 && m[q - W] && !vu[q - W]) { vu[q - W] = 1; px.push(q - W); }
        if (qy < H - 1 && m[q + W] && !vu[q + W]) { vu[q + W] = 1; px.push(q + W); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, L = Math.max(bw, bh), aire = px.length;
      if (!(L > 3 * (aire / L) || aire < 0.5 * bw * bh)) continue;   // pilier compact : rien à chercher
      // cadre de la composante, 1 px de marge
      const cw = bw + 2, chh = bh + 2, c = new Uint8Array(cw * chh);
      px.forEach(function (q) { const qx = q % W, qy = (q - qx) / W; c[(qy - y0 + 1) * cw + (qx - x0 + 1)] = 1; });
      retires += _bandesCadre(c, cw, chh, x0 - 1, y0 - 1, W, H);
      px.forEach(function (q) { const qx = q % W, qy = (q - qx) / W; m[q] = c[(qy - y0 + 1) * cw + (qx - x0 + 1)]; });
    }
    return retires;
  }
  // Une composante dans son cadre (W × H), placé en (ox, oy) dans un bloc Wb × Hb.
  function _bandesCadre(m, W, H, ox, oy, Wb, Hb) {
    const dist = _distance(m, W, H);
    const S = new Uint8Array(m);
    _squelette(S, W, H);
    let retires = 0;
    const effacer = function (i) {
      const r = Math.ceil(dist[i] / 3) + 1, cx = i % W, cy = (i - cx) / W;
      for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
        for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r && m[y * W + x]) { m[y * W + x] = 0; retires++; }
        }
      }
    };
    const auBord = function (i) {   // bord du BLOC, pas du cadre
      const x = ox + (i % W), y = oy + Math.floor(i / W);
      return x <= 1 || y <= 1 || x >= Wb - 2 || y >= Hb - 2;
    };
    // tronçon [a, b[ d'une branche : un trait si assez long pour son épaisseur et d'épaisseur régulière.
    // 🩸 Un bout qui entre dans une zone plus épaisse (pilier) ou sort par le bord du bloc rend une épaisseur à la
    //   longueur : la transition, où la bande s'élargit, est hors du tronçon (pont court entre deux piliers mesuré
    //   sous 4 ×). Un bout LIBRE ne rend rien : la pointe d'un pilier allongé reste un pilier.
    const juger = function (ch, ep, a, b) {
      const L = b - a;
      if (L < 4) return;
      let s = 0, s2 = 0;
      for (let j = a; j < b; j++) { s += ep[j]; s2 += ep[j] * ep[j]; }
      const moy = s / L, ecart = Math.sqrt(Math.max(0, s2 / L - moy * moy));
      const rendu = ((a > 0 && ep[a - 1] > moy) || (a === 0 && auBord(ch[0])) ? moy : 0) +
        ((b < ch.length && ep[b] > moy) || (b === ch.length && auBord(ch[ch.length - 1])) ? moy : 0);
      if (moy > 0 && ecart <= BANDE_ECART * moy && L + rendu > BANDE_LONGUEUR * moy) {
        for (let j = a; j < b; j++) effacer(ch[j]);
      }
    };
    _chemins(S, W, H).forEach(function (t) {
      const ch = t.ch;
      if (ch.length < 8) return;
      const ep = ch.map(function (i) { return (2 * dist[i]) / 3; });
      let a = 0, s = ep[0], n2 = 1;
      for (let j = 1; j < ch.length; j++) {
        const moy = s / n2;
        if (Math.abs(ep[j] - moy) > BANDE_RUPTURE * moy) {   // rupture : entrée ou sortie d'un pilier
          juger(ch, ep, a, j);
          a = j; s = ep[j]; n2 = 1;
        } else { s += ep[j]; n2++; }
      }
      juger(ch, ep, a, ch.length);
    });
    return retires;
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
    // troisième valeur (rayon d'une galerie, _axesMasque) interpolée comme les coordonnées
    const at = function (a, b, t) {
      const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      if (a.length > 2) p.push(a[2] + t * (b[2] - a[2]));
      return p;
    };
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
  // Masses à retirer du masque T d'un trait : les composantes de `pleins` dont la moitié au moins des pixels est dans
  // T (masse de la couleur du trait), quelle que soit leur taille. → nouveau masque ; `vu` et `pile` sont réutilisés
  // (`pile` sert de file : la composante en cours est pile[0..n[).
  // ⚠️ contrat (décision produit) : une masse ne retire d'un front que si elle en a la couleur, gardée ou non par
  //   les tailles minimale et maximale (le cerne d'un pilier gardé est écarté plus loin, _traitsBloc).
  // 🩸 Retirer toutes les masses effaçait les fronts fins d'une passe mixte : le fond et les galeries du blanc des
  //   piliers clairs cernés, dilatés de ecartMasse, mangeaient tout trait de 3 px bordé de blanc. Ne retirer que les
  //   masses gardées faisait revenir en front le squelette d'un pilier de la couleur du front écarté par un curseur.
  function _masseDuTrait(T, pleins, W, H, vu, pile) {
    const N = W * H, out = new Uint8Array(N);
    vu.fill(0);
    for (let p = 0; p < N; p++) {
      if (!pleins[p] || vu[p]) continue;
      let n = 0, h = 0, dans = 0;
      pile[n++] = p; vu[p] = 1;
      while (h < n) {
        const q = pile[h++], qx = q % W;
        if (T[q]) dans++;
        if (qx > 0 && pleins[q - 1] && !vu[q - 1]) { vu[q - 1] = 1; pile[n++] = q - 1; }
        if (qx < W - 1 && pleins[q + 1] && !vu[q + 1]) { vu[q + 1] = 1; pile[n++] = q + 1; }
        if (q >= W && pleins[q - W] && !vu[q - W]) { vu[q - W] = 1; pile[n++] = q - W; }
        if (q < N - W && pleins[q + W] && !vu[q + W]) { vu[q + W] = 1; pile[n++] = q + W; }
      }
      if (2 * dans >= n) for (let k = 0; k < n; k++) out[pile[k]] = 1;
    }
    return out;
  }
  // Traits d'un masque : moins les masses de sa couleur (dilatées), fermeture de 3 px (trous d'anticrénelage),
  // squelette, chemins sans ergots ni bruit ni cernes de piliers gardés, simplifiés, rendus en pixels du plan et
  // découpés au cœur du bloc.
  // ⚠️ contrat (décision produit) : le contour d'un pilier détecté marque la fin du pilier, ce n'est pas un mur. Un
  //   chemin couché à CERNE_PART au moins dans le halo d'une masse GARDÉE (dilatée de ecartMasse + TRAIT_FIN + 1)
  //   n'est pas un front ; un pilier écarté par un curseur rend son cerne aux fronts. Un front qui passe près d'un
  //   pilier n'y a qu'une petite part de sa longueur et reste entier.
  const CERNE_PART = 0.9;
  function _traitsBloc(T, tmp, retirer, gardes, W, H, o, e) {
    const rg = o.reglages;
    let halo = null;
    if (retirer) {
      const ecart = Math.max(1, Math.round((rg.ecartMasse === undefined ? 2 : rg.ecartMasse) * e));
      _passe(retirer, tmp, W, H, ecart, false);
      for (let i = 0; i < W * H; i++) if (tmp[i]) T[i] = 0;
      halo = new Uint8Array(W * H);
      _passe(gardes, halo, W, H, ecart + Math.round((TRAIT_FIN + 1) * e), false);
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
      if (halo) {
        let n = 0;
        for (let k = 0; k < L; k++) if (halo[t.ch[k]]) n++;
        if (n >= CERNE_PART * L) return;   // cerne d'un pilier gardé
      }
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

  // Détection sur une région du plan, bloc par bloc. opts = { lireBloc, region {x,y,w,h}, limites (emprise lisible :
  // { x0, y0, x1, y1 }, bornes négatives possibles, ou { w, h } = [0, w] × [0, h]), classes [{ id, couleurs: [[r,g,b]],
  // tolerance }], reglages, echelle, executer?, onProgres?, signal? }.
  // ⚠️ contrat : la région est ramenée dans les limites ; les « bords du plan » (masse non signalée trop grande) sont
  //   ceux des limites. 🩸 Des limites plus petites que l'image lue rognent net les masses à cheval sur leur bord.
  // `executer(bloc)` → Promise<résultat de detecterBloc> : un worker (executeurWorker), sinon le calcul ici.
  async function detecter(opts) {
    const rg = Object.assign({}, REGLAGES, opts.reglages || {}), e = opts.echelle || 1;
    const lim = _limites(opts.limites, opts.region);
    const rx0 = Math.max(lim.x0, opts.region.x), ry0 = Math.max(lim.y0, opts.region.y);
    const reg = { x: rx0, y: ry0, w: Math.min(lim.x1, opts.region.x + opts.region.w) - rx0,
                  h: Math.min(lim.y1, opts.region.y + opts.region.h) - ry0 };
    const pas = rg.bloc / e, marge = rg.marge;
    // `executeur` (objet : executeurWorker / executeurLocal) garde les blocs lus si `garder` ; `executer` (fonction)
    // calcule seulement ; à défaut, calcul dans la page, un bloc par tâche.
    const ex = opts.executeur || null;
    const executer = ex ? function (b) { return ex.executer(b, !!opts.garder); } : opts.executer || function (b) {
      return new Promise(function (ok) { setTimeout(function () { ok(detecterBloc(b)); }, 0); });
    };
    let gardes = 0;
    const blocs = [];
    for (let y = reg.y; y < reg.y + reg.h; y += pas) {
      for (let x = reg.x; x < reg.x + reg.w; x += pas) blocs.push([x, y]);
    }
    const res = { masses: [], tropGrands: [], ignorees: 0, ecartees: 0, traits: [], axes: [], blocs: blocs.length };
    for (let i = 0; i < blocs.length; i++) {
      if (opts.signal && opts.signal.aborted) throw Object.assign(new Error("annulé"), { name: "AbortError" });
      const cx = blocs[i][0], cy = blocs[i][1];
      const cw = Math.min(pas, reg.x + reg.w - cx), ch = Math.min(pas, reg.y + reg.h - cy);
      // bloc lu = cœur + marge, borné à l'image du plan
      const lx = Math.max(lim.x0, Math.floor(cx - marge)), ly = Math.max(lim.y0, Math.floor(cy - marge));
      const rx = Math.min(lim.x1, Math.ceil(cx + cw + marge)), ry = Math.min(lim.y1, Math.ceil(cy + ch + marge));
      const lu = await opts.lireBloc(lx, ly, rx - lx, ry - ly, e);
      const r = await executer({
        data: lu.data, w: lu.w, h: lu.h, x0: lx, y0: ly, echelle: e, classes: opts.classes, reglages: rg,
        coeur: { x: Math.round((cx - lx) * e), y: Math.round((cy - ly) * e),
                 w: Math.round(cw * e), h: Math.round(ch * e) },
        bords: { g: lx <= lim.x0, h: ly <= lim.y0, d: rx >= lim.x1, b: ry >= lim.y1 }
      });
      res.masses.push.apply(res.masses, r.masses);
      res.tropGrands.push.apply(res.tropGrands, r.tropGrands);
      res.ignorees += r.ignorees;
      res.ecartees += r.ecartees || 0;
      if (r.traits) res.traits.push.apply(res.traits, r.traits);
      if (r.axes) res.axes.push.apply(res.axes, r.axes);
      if (r.garde) gardes++;
      if (opts.onProgres) opts.onProgres(i + 1, blocs.length);
    }
    // traits coupés au bord des blocs : raccordés (le cœur d'un bloc touche celui du voisin)
    res.traits = _raccorder(res.traits, Math.max(1.5, 2 / e));
    // tous les blocs gardés : recalculer() peut refaire le calcul sans relire l'image
    res.recalculable = !!ex && !!opts.garder && gardes === blocs.length;
    return res;
  }

  // Limites de detecter → { x0, y0, x1, y1 } ; sans limites : [0, bout de la région] (bornes basses à 0).
  function _limites(l, reg) {
    if (l && Number.isFinite(l.x0) && Number.isFinite(l.y0) && Number.isFinite(l.x1) && Number.isFinite(l.y1)) {
      return { x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 };
    }
    if (l && Number.isFinite(l.w) && Number.isFinite(l.h)) return { x0: 0, y0: 0, x1: l.w, y1: l.h };
    return { x0: 0, y0: 0, x1: reg.x + reg.w, y1: reg.y + reg.h };
  }

  // ── Blocs gardés : recalcul sans relire l'image (curseurs de l'aperçu) ──
  // Un magasin de blocs lus (dans le worker, sinon dans la page), plafonné : au-delà, le bloc n'est pas gardé et le
  // recalcul n'est plus possible (l'appelant relit). recalculer(classes, reglages) → résultats bloc par bloc.
  const BUDGET_BLOCS = 200 * 1024 * 1024;   // octets d'image gardés au plus
  function _magasin() {
    const blocs = [];
    let octets = 0;
    return {
      garder: function (b) {
        const n = b.data ? b.data.byteLength : 0;
        if (octets + n > BUDGET_BLOCS) return false;
        blocs.push(b); octets += n;
        return true;
      },
      recalculer: function (classes, reglages) {
        return blocs.map(function (b) {
          return detecterBloc(Object.assign({}, b, { classes: classes, reglages: reglages }));
        });
      },
      vider: function () { blocs.length = 0; octets = 0; }
    };
  }
  // Fusion des résultats de blocs (même règle que detecter).
  function _fusion(resultats, e) {
    const res = { masses: [], tropGrands: [], ignorees: 0, ecartees: 0, traits: [], axes: [],
                  blocs: resultats.length };
    resultats.forEach(function (r) {
      res.masses.push.apply(res.masses, r.masses);
      res.tropGrands.push.apply(res.tropGrands, r.tropGrands);
      res.ignorees += r.ignorees;
      res.ecartees += r.ecartees || 0;
      if (r.traits) res.traits.push.apply(res.traits, r.traits);
      if (r.axes) res.axes.push.apply(res.axes, r.axes);
    });
    res.traits = _raccorder(res.traits, Math.max(1.5, 2 / (e || 1)));
    return res;
  }

  // Exécuteur par worker (js/ktaDetectionWorker.js) : un bloc à la fois, tampon d'image TRANSFÉRÉ (pas copié) et,
  // avec `garder`, conservé par le worker pour recalculer.
  // → { executer(bloc, garder) → Promise<résultat (+ garde)>, recalculer(classes, reglages) → Promise<[résultats]>,
  //     fermer() } ; null sans Worker (executeurLocal le remplace).
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
    const envoyer = function (msg, transfert) {
      return new Promise(function (ok, ko) {
        const id = suivant++;
        attente.set(id, { ok: ok, ko: ko });
        msg.id = id;
        w.postMessage(msg, transfert || []);
      });
    };
    return {
      executer: function (b, garder) {
        const tampon = b.data && b.data.buffer ? b.data.buffer : null;
        return envoyer({ bloc: b, garder: !!garder }, tampon ? [tampon] : []);
      },
      recalculer: function (classes, reglages) {
        return envoyer({ recalculer: { classes: classes, reglages: reglages } });
      },
      fermer: function () { try { w.terminate(); } catch (err) { /* déjà arrêté */ } attente.clear(); }
    };
  }
  // Même interface, dans la page (sans Worker, et dans Node pour les tests) : un bloc par tâche.
  function executeurLocal() {
    const mag = _magasin();
    return {
      executer: function (b, garder) {
        return new Promise(function (ok) {
          setTimeout(function () {
            const r = detecterBloc(b);
            r.garde = !!garder && mag.garder(b);
            ok(r);
          }, 0);
        });
      },
      recalculer: function (classes, reglages) { return Promise.resolve(mag.recalculer(classes, reglages)); },
      fermer: function () { mag.vider(); }
    };
  }
  // Recalcul de la dernière détection (blocs gardés par l'exécuteur) avec d'autres classes ou réglages.
  async function recalculer(executeur, opts) {
    const rg = Object.assign({}, REGLAGES, opts.reglages || {});
    return _fusion(await executeur.recalculer(opts.classes, rg), opts.echelle || 1);
  }

  // ── Un exemple touché à la pipette : sa composante, sa taille, l'étalement de sa couleur ──
  // mesurerExemple({ data, w, h }, px, py, { seuil, nature }) → { rgb, aire, epaisseur, etalement, ecartFond,
  //   ecartTrait, ecartAuDela, cerne, coupe }, { fond: true, rgb } (le doigt est sur le fond) ou null (rien d'opaque
  //   sous le doigt). `nature` : "trait" pour un exemple de front (jamais redirigé vers la région claire voisine).
  // La composante = pixels 4-connexes à moins du seuil (ΔE) de la couleur de départ ; épaisseur = 2 × la plus grande
  // distance au bord (chanfrein 3-4) ; étalement = 90e centile des ΔE à la couleur médiane.
  // `ecartFond` : ΔE entre cette couleur et le fond (médiane du bord de la fenêtre).
  // `ecartTrait` : ΔE au cœur du pourtour immédiat (90e centile des anneaux à 1, 2 et 3 px) ; `ecartAuDela` :
  //   ΔE à ce qu'il y a derrière (anneaux à 5–7 px) ; `cerne` : pourtour net, nettement plus loin que l'au-delà
  //   (pilier cerné d'un trait). reglagesDepuisExemples s'en sert pour les piliers clairs cernés.
  // 🩸 Seuil = la moitié de l'écart au fond, plafonné à `seuil` (28) : un bleu clair est à ΔE 26 du blanc, un seuil
  //   fixe faisait déborder la composante sur tout le fond.
  // `coupe` : la composante touche le bord de la fenêtre lue (plus grande qu'elle) ou la remplit à moitié (fond).
  const FOND_MIN = 10;     // ΔE au fond sous lequel le carré touché est du fond (pas d'objet sous le doigt)
  const CLAIR_TOL = 12;    // ΔE d'une région claire autour du doigt (bruit, JPEG, filigrane léger)
  const ENCRE_ECART = 20;  // ΔE minimal entre le clair sous le doigt et l'encre voisine pour viser le clair
  const TRAIT_FIN = 4;     // épaisseur (px) au plus d'un trait qui cerne un pilier clair
  const CERNE_MIN = 30, CERNE_ECART = 15;   // pourtour d'un pilier cerné : ΔE ≥ 30, et 15 de plus que l'au-delà
  // Épaisseur d'une composante (liste de pixels d'une image de largeur W) : transformée de distance (chanfrein 3-4)
  // dans sa boîte. → { dmax (unités : 3 par pixel), dist, x0, y0, bw }.
  function _epaisseurDe(liste, W) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    liste.forEach(function (q) {
      const x = q % W, y = (q - x) / W;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    });
    const bw = x1 - x0 + 3, bh = y1 - y0 + 3, dist = new Int32Array(bw * bh);
    liste.forEach(function (q) { const x = q % W, y = (q - x) / W; dist[(y - y0 + 1) * bw + (x - x0 + 1)] = 1e6; });
    for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) {
      const i = y * bw + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], dist[i - 1] + 3, dist[i - bw] + 3, dist[i - bw - 1] + 4, dist[i - bw + 1] + 4);
    }
    let dmax = 0;
    for (let y = bh - 2; y >= 1; y--) for (let x = bw - 2; x >= 1; x--) {
      const i = y * bw + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], dist[i + 1] + 3, dist[i + bw] + 3, dist[i + bw + 1] + 4, dist[i + bw - 1] + 4);
      if (dist[i] > dmax) dmax = dist[i];
    }
    return { dmax: dmax, dist: dist, x0: x0, y0: y0, bw: bw };
  }
  const _pxEpaisseur = function (dmax) { return Math.max(1, Math.round((2 * dmax) / 3) - 1); };
  function mesurerExemple(b, px, py, o) {
    const W = b.w, H = b.h, d = b.data, N = W * H, plafond = (o && o.seuil) || 28, nature = o && o.nature;
    px = Math.floor(px); py = Math.floor(py);
    if (px < 0 || py < 0 || px >= W || py >= H) return null;
    const cache = new Map();
    const lab = function (i) {
      const k = i * 4, c = ((d[k] >> 2) << 12) | ((d[k + 1] >> 2) << 6) | (d[k + 2] >> 2);
      let v = cache.get(c);
      if (!v) { v = rgbVersLab(d[k], d[k + 1], d[k + 2]); cache.set(c, v); }
      return v;
    };
    const opaque = function (q) { return d[q * 4 + 3] >= 128; };
    const med = function (vals) { vals.sort(function (a, b2) { return a - b2; }); return vals[vals.length >> 1]; };
    // couleur médiane (canal par canal) des pixels de `pix` à moins de `s` de `ref`
    const labMed = function (pix, ref, s) {
      const r = [], g = [], bb = [];
      pix.forEach(function (q) {
        if (deltaE(lab(q), ref) > s) return;
        const k = q * 4;
        r.push(d[k]); g.push(d[k + 1]); bb.push(d[k + 2]);
      });
      return rgbVersLab(med(r), med(g), med(bb));
    };
    // Composante 4-connexe partie de `g`, pixels à moins de `s` de `ref`.
    // `arretBord` : s'arrête dès le bord de la fenêtre (on ne veut savoir que si elle est fermée).
    const composante = function (g, ref, s, arretBord) {
      const vu = new Uint8Array(N), liste = [], pile = [g], max = Math.floor(N / 2);
      let coupe = false;
      vu[g] = 1;
      while (pile.length) {
        const q = pile.pop();
        if (!opaque(q) || deltaE(lab(q), ref) > s) continue;
        liste.push(q);
        if (liste.length > max) { coupe = true; break; }
        const qx = q % W, qy = (q - qx) / W;
        if (qx === 0 || qy === 0 || qx === W - 1 || qy === H - 1) { coupe = true; if (arretBord) break; }
        if (qx > 0 && !vu[q - 1]) { vu[q - 1] = 1; pile.push(q - 1); }
        if (qx < W - 1 && !vu[q + 1]) { vu[q + 1] = 1; pile.push(q + 1); }
        if (qy > 0 && !vu[q - W]) { vu[q - W] = 1; pile.push(q - W); }
        if (qy < H - 1 && !vu[q + W]) { vu[q + W] = 1; pile.push(q + W); }
      }
      return { liste: liste, coupe: coupe };
    };
    // Pourtour d'une composante : ΔE à `ref` des pixels opaques à 1..kmax px d'elle (8-connexité), anneau par anneau.
    const anneaux = function (liste, ref, kmax) {
      const out = [], marque = new Uint8Array(N);
      let front = liste;
      liste.forEach(function (q) { marque[q] = 1; });
      for (let k = 1; k <= kmax; k++) {
        const suiv = [], an = [];
        front.forEach(function (q) {
          const qx = q % W, qy = (q - qx) / W;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = qx + dx, y = qy + dy, t = y * W + x;
            if (x < 0 || y < 0 || x >= W || y >= H || marque[t]) continue;
            marque[t] = 1; suiv.push(t);
            if (opaque(t)) an.push(deltaE(lab(t), ref));
          }
        });
        out[k] = an;
        front = suiv;
      }
      return out;
    };
    // fond : médiane des pixels du bord de la fenêtre
    const rf = [], gf = [], bf = [];
    const bord = function (i) {
      const k = i * 4;
      if (d[k + 3] >= 128) { rf.push(d[k]); gf.push(d[k + 1]); bf.push(d[k + 2]); }
    };
    for (let x = 0; x < W; x++) { bord(x); bord((H - 1) * W + x); }
    for (let y = 1; y < H - 1; y++) { bord(y * W); bord(y * W + W - 1); }
    const labFond = rf.length ? rgbVersLab(med(rf), med(gf), med(bf)) : null;
    // 🩸 Couleur de l'exemple = celle du pixel le plus « encré » du carré 5 × 5 sous le doigt (le plus loin du fond)
    //   et de ses semblables, et la composante part de CE pixel. La médiane du carré entier valait le fond sur un
    //   trait fin ou un coin de pilier touché un peu à côté : le pixel touché était rejeté et la pipette disait
    //   « aucune image » (mesuré : trait de 2 px, 2 touchers sur 2 ; pilier de 10 px, 12 sur 100).
    const carre = [];
    for (let j = Math.max(0, py - 2); j <= Math.min(H - 1, py + 2); j++) {
      for (let i = Math.max(0, px - 2); i <= Math.min(W - 1, px + 2); i++) {
        if (opaque(j * W + i)) carre.push(j * W + i);
      }
    }
    if (!carre.length) return null;   // rien d'opaque sous le doigt : hors de l'image
    let graine = carre[0], encre = -1, presG = Infinity, clair = carre[0], lumC = -1, presC = Infinity;
    carre.forEach(function (q) {
      const e = labFond ? deltaE(lab(q), labFond) : 0;
      // à encre égale, le pixel le plus proche du doigt
      const pres = Math.abs((q % W) - px) + Math.abs(Math.floor(q / W) - py);
      if (e > encre + 0.5 || (Math.abs(e - encre) <= 0.5 && pres < presG)) { encre = e; graine = q; presG = pres; }
      const l = lab(q)[0];
      if (l > lumC + 0.5 || (Math.abs(l - lumC) <= 0.5 && pres < presC)) { lumC = l; clair = q; presC = pres; }
    });
    // Région claire autour du pixel le plus clair du carré : null si elle s'ouvre (touche le bord de la fenêtre, ou
    // en remplit la moitié) ; sinon sa couleur et l'écart à l'encre qui l'enferme (90e centile des ΔE à 1–3 px).
    // 🩸 Pas l'écart des pixels refusés juste au bord : adoucis par le flou, ils mettaient le seuil si bas que la
    //   composante perdait sa rangée de bord (pilier de 8 px mesuré à 5).
    const regionClaire = function () {
      const labC = labMed(carre, lab(clair), CLAIR_TOL), r = composante(clair, labC, CLAIR_TOL, true);
      if (r.coupe || !r.liste.length) return null;
      const a = anneaux(r.liste, labC, 3), ec = a[1].concat(a[2], a[3]).sort(function (x, y) { return x - y; });
      return { lab: labC, encre: ec.length ? ec[Math.min(ec.length - 1, Math.floor(ec.length * 0.9))] : 0 };
    };
    let lab0 = null, seuil = 0;
    const viserClair = function (rc) {
      graine = clair; lab0 = rc.lab;
      // seuil à mi-chemin de l'encre : le pilier garde ses pixels de bord adoucis, sans jamais prendre le trait
      seuil = Math.max(6, Math.min(plafond, rc.encre / 2));
    };
    if (labFond && encre < FOND_MIN) {
      // 🩸 Couleur du fond sous le doigt : un pilier BLANC cerné d'un trait sur un plan blanc en est un. Objet si la
      //   zone de cette couleur est ENFERMÉE (ne touche pas le bord de la fenêtre) ; sinon c'est le fond, on le dit.
      const rc = regionClaire();
      if (!rc) {
        const k = graine * 4;
        return { fond: true, rgb: [d[k], d[k + 1], d[k + 2]] };
      }
      viserClair(rc);
    } else if (labFond && nature !== "trait" && lab(graine)[0] > labFond[0]) {
      // 🩸 Objet PLUS CLAIR que le fond lu (plan au trait serré : la médiane du bord de la fenêtre est un gris de
      //   traits) : le seuil tiré de l'écart au fond tombait au niveau du bruit, la composante n'était qu'un
      //   lambeau du pilier. Région claire fermée : seuil tiré de l'encre qui l'enferme, comme ci-dessus.
      const rc = regionClaire();
      if (rc) viserClair(rc);
    } else if (labFond && nature !== "trait" && graine !== clair) {
      // 🩸 Doigt sur un petit pilier CLAIR, près du trait qui le cerne : le pixel le plus encré du carré est le trait,
      //   et l'exemple prenait sa couleur (petite aire, taille minimale déduite de 1 ou 2 px). Si ce pixel est un
      //   trait FIN et que le clair voisin est une région fermée, l'exemple est l'intérieur du pilier. Un pilier
      //   coloré plein (épais) touché un peu à côté reste l'exemple : coin de pilier, pilier à pastille claire.
      const labG = lab(graine), labC = lab(clair), ecart = deltaE(labC, labG);
      if (labC[0] > labG[0] && ecart > ENCRE_ECART) {
        const trait = composante(graine, labG, Math.max(6, Math.min(plafond, ecart / 2)), false);
        if (_pxEpaisseur(_epaisseurDe(trait.liste, W).dmax) <= TRAIT_FIN) {
          const rc = regionClaire();
          if (rc) viserClair(rc);
        }
      }
    }
    if (!lab0) {
      lab0 = labMed(carre, lab(graine), 12);
      seuil = Math.max(6, Math.min(plafond, (labFond ? deltaE(lab0, labFond) : 100) / 2));
    }
    const ecartFond = labFond ? deltaE(lab0, labFond) : 100;
    const comp = composante(graine, lab0, seuil, false), liste = comp.liste, coupe = comp.coupe;
    if (!liste.length) return null;
    // couleur médiane de la composante, étalement
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    liste.forEach(function (q) { const k = q * 4; hist[0][d[k]]++; hist[1][d[k + 1]]++; hist[2][d[k + 2]]++; });
    const medHist = function (h) {
      let s = 0;
      for (let v = 0; v < 256; v++) { s += h[v]; if (s * 2 >= liste.length) return v; }
      return 255;
    };
    const rgb = [medHist(hist[0]), medHist(hist[1]), medHist(hist[2])];
    const labM = rgbVersLab(rgb[0], rgb[1], rgb[2]);
    const ep = _epaisseurDe(liste, W), dist = ep.dist, bw = ep.bw, x0 = ep.x0, y0 = ep.y0;
    // 🩸 Étalement sur l'INTÉRIEUR (à 2 px au moins du bord, chanfrein ≥ 6) : les pixels du bord, mêlés au contour
    //   noir par le flou, gonflaient la tolérance jusqu'à souder des piliers voisins (mesuré : ΔE 29 → 98 piliers sur
    //   126, ΔE 24 → 123). Petit exemple sans intérieur : toute la composante.
    const dedans = liste.filter(function (q) {
      const x = q % W, y = (q - x) / W;
      return dist[(y - y0 + 1) * bw + (x - x0 + 1)] >= 6;
    });
    const base = dedans.length >= 10 ? dedans : liste;
    const ecarts = base.map(function (q) { return deltaE(lab(q), labM); }).sort(function (a, b2) { return a - b2; });
    const etalement = ecarts[Math.min(ecarts.length - 1, Math.floor(ecarts.length * 0.9))];
    // Pourtour (composante entière dans la fenêtre seulement) : trait à 1–3 px, au-delà à 5–7 px.
    const an = coupe ? null : anneaux(liste, labM, 7);
    const medA = function (v) { return v.length ? med(v) : 0; };
    const p90 = function (v) {
      v.sort(function (a, b2) { return a - b2; });
      return v.length ? v[Math.floor(v.length * 0.9)] : 0;
    };
    const ecartTrait = an ? p90(an[1].concat(an[2], an[3])) : 0;
    const ecartAuDela = an ? medA(an[5].concat(an[6], an[7])) : 0;
    const r1 = function (v) { return Math.round(v * 10) / 10; };
    return { rgb: rgb, aire: liste.length, epaisseur: _pxEpaisseur(ep.dmax),
             etalement: r1(etalement), ecartFond: r1(ecartFond), ecartTrait: r1(ecartTrait),
             ecartAuDela: r1(ecartAuDela),
             cerne: !coupe && ecartTrait >= CERNE_MIN && ecartTrait >= ecartAuDela + CERNE_ECART, coupe: coupe };
  }

  // Réglages déduits des exemples. exemples = { <classe>: [{ rgb, epaisseur?, etalement? }] }, natures = { <classe>:
  // "masse" | "trait" }. → { tolerances: { <classe>: ΔE }, taille: px | null }.
  // ⚠️ contrat (décision produit) : tolérance = étalement mesuré dans les exemples + marge, jamais sous TOL_PLANCHER
  //   (14 était trop strict : brun inégal, filigrane, JPEG flou) ; taille = plus petite épaisseur des exemples de
  //   masse.
  // 🩸 L'écart ENTRE exemples n'entre pas dans la tolérance : un pixel est comparé à l'exemple le plus proche, donc
  //   plusieurs exemples couvrent déjà leur écart. L'ajouter soudait des piliers voisins à travers le flou (mesuré :
  //   ΔE 39 → 179 piliers sur 216, ΔE 27 → 214).
  const TOL_PLANCHER = 22, TOL_MARGE = 6, TOL_MAX = 60, TOL_PART_FOND = 0.6, TOL_MIN = 6, TOL_AU_DELA = 10;
  const TOL_PART_TRAIT = 0.6;
  const TAILLE_MAX_FACTEUR = 4;
  // ⚠️ contrat (décision produit) : pilier CLAIR CERNÉ d'un trait (plan au trait : piliers et galeries blancs, le
  //   trait seul les sépare). Plafonner à 60 % de l'écart au fond y mettait la tolérance au niveau du bruit des
  //   galeries (fond lu : blanc, ou gris moyen des traits) : elles se cassaient en morceaux pris pour des piliers.
  //   Ici la tolérance va à 60 % de l'écart au cœur du trait (le plus faible des exemples : le trait le plus fin
  //   commande) : les galeries étroites, grisées par le flou en leur milieu, restent d'un seul tenant avec le fond,
  //   géantes, écartées par la taille maximale ; les piliers, séparés par le cœur du trait, restent. 🩸 Englober
  //   seulement l'au-delà (+ 10) ne suffisait pas : sur un plan réel au trait, les passages étroits coupaient encore
  //   les galeries. Il faut la place d'englober l'au-delà (+ TOL_AU_DELA) : un bleu clair cerné de bleu sur blanc
  //   (au-delà ΔE 26) ne l'a pas, il garde le plafond du fond. Jamais pour une classe de trait (front).
  function _clairCerne(x) {
    return !!x.cerne && typeof x.ecartTrait === "number" && typeof x.ecartAuDela === "number" &&
      x.ecartAuDela + TOL_AU_DELA <= x.ecartTrait * TOL_PART_TRAIT;
  }
  function reglagesDepuisExemples(exemples, natures) {
    const tolerances = {};
    let taille = null, aireMaxEx = 0;
    Object.keys(exemples).forEach(function (c) {
      const ex = (exemples[c] || []).filter(function (x) { return x && Array.isArray(x.rgb); });
      if (!ex.length) return;
      let etal = 0;
      ex.forEach(function (x) { etal = Math.max(etal, Number(x.etalement) || 0); });
      // 🩸 jamais au-delà de 60 % de l'écart à ce qui touche l'exemple : un pilier bleu clair sur blanc (ΔE 26)
      //   ferait du fond un pilier. Ce qui le touche est le fond, sauf pour un pilier clair cerné d'un trait
      //   (_clairCerne) : c'est le trait, et la tolérance va au contraire jusqu'à 60 % de son écart.
      let plafond = TOL_MAX, voulue = Math.max(TOL_PLANCHER, etal + TOL_MARGE);
      ex.forEach(function (x) {
        if (!(natures && natures[c] === "trait") && _clairCerne(x)) {
          plafond = Math.min(plafond, x.ecartTrait * TOL_PART_TRAIT);
          voulue = Math.max(voulue, x.ecartTrait * TOL_PART_TRAIT);
        } else if (typeof x.ecartFond === "number") plafond = Math.min(plafond, x.ecartFond * TOL_PART_FOND);
      });
      tolerances[c] = Math.round(Math.max(TOL_MIN, Math.min(plafond, TOL_MAX, voulue)));
      if (natures && natures[c] === "trait") return;
      ex.forEach(function (x) {
        if (x.epaisseur > 0 && !x.coupe && (taille === null || x.epaisseur < taille)) taille = x.epaisseur;
        if (x.aire > 0 && !x.coupe && x.aire > aireMaxEx) aireMaxEx = x.aire;
      });
    });
    // taille maximale = côté du carré de TAILLE_MAX_FACTEUR × l'aire du plus GRAND exemple de masse (× 4 en aire)
    const tailleMax = aireMaxEx > 0 ? Math.round(Math.sqrt(aireMaxEx * TAILLE_MAX_FACTEUR)) : null;
    return { tolerances: tolerances, taille: taille, tailleMax: tailleMax };
  }
  // Réglages pour une « taille minimale » (largeur du plus petit pilier, px du plan) : ouverture = la moitié, aire
  // minimale = la moitié du carré, trou comblé à 60 % du carré. Plan calibré (pxParM) : bornes en mètres (aire jamais
  // sous 10 × 10 cm, ouverture jamais au-delà de 60 cm), pas la règle.
  function reglagesPourTaille(taille, pxParM) {
    const t = Math.max(2, Number(taille) || 2);
    const out = { ouverture: Math.min(25, Math.max(1, Math.round(t * 0.5))),
                  aireMin: Math.min(5000, Math.max(9, Math.round(t * t * 0.5))),
                  trouMax: Math.min(2000, Math.max(20, Math.round(t * t * 0.6))) };
    const k = Number(pxParM);
    if (k > 0) {
      out.aireMin = Math.max(out.aireMin, Math.round(0.01 * k * k));
      out.ouverture = Math.max(1, Math.min(out.ouverture, Math.round(0.6 * k)));
    }
    return out;
  }

  // ── Remplir au clic : la zone du fond fermée par le trait autour d'un point ──
  // b = { data, w, h } lu à `echelle` depuis le coin plan (x0, y0) ; (px, py) = point touché, en px de bloc.
  // o = { x0, y0, echelle, tolerance (ΔE), fermeture (rayon, px de bloc), repli (défaut vrai), aireMax et coteMax
  //   (px du plan ; plafondRemplir les donne), simplification, demiTrait (px du plan), affiner (tolérance du lissage,
  //   px du plan, toleranceAffinage ; absente ou nulle : contour d'avant) }.
  // → { points, aire, boite } (px du plan) ou { refus: "hors" | "trait" | "ouvert" | "tropGrand" }.
  // Trait = tout pixel à plus de `tolerance` de la couleur sous le doigt, fermé d'abord (dilatation puis érosion
  //   d'un carré de rayon `fermeture`) : le rayon 1 bouche un trou de 1 à 2 px, un trou de 3 px et plus reste ouvert.
  //   La zone = composante 4-connexe du fond ainsi fermé, étendue jusqu'au MILIEU du trait (_jusquAuMilieu) ;
  //   contour extérieur seul (un chiffre ou une pastille dedans est englobé).
  // ⚠️ contrat (décision produit) : le trait fait partie du pilier, c'est lui qui en marque la fin ; le contour passe
  //   en son milieu. La détection automatique (detecterBloc) garde le sien : elle n'appelle pas ce chemin.
  // ⚠️ contrat (décision produit) : une zone qui touche le bord du bloc lu (bord de l'image ou de la fenêtre lue) ou
  //   dépasse `aireMax` (ou dont la boîte dépasse `coteMax` de côté) n'est pas fermée : refus, jamais une zone
  //   partielle. aireMax par défaut : le quart du bloc ; coteMax absent : pas de limite de côté.
  // 🩸 L'érosion de _passe efface la rangée du bord du bloc (voisins hors bloc comptés vides) : le trait d'origine est
  //   rajouté après la fermeture, qui ne doit jamais RETIRER de trait.
  const REMPLIR = Object.freeze({ tolerance: 20, fermeture: 1, simplification: 1, demiTrait: 6, coteMaxM: 40,
                                  plafondPx: 512 });
  // Plafond d'une zone remplie, en px du plan. ⚠️ contrat (décision produit) : plan à échelle connue (px/m) → côté de
  //   boîte et aire bornés par REMPLIR.coteMaxM (40 m, 1 600 m²) : la plus grande structure plausible, prise large
  //   pour ne jamais refuser un vrai pilier ; une galerie fermée s'étend bien au-delà et sort par son côté. Sans
  //   échelle : aire de plafondPx² (512² px), sans côté maximal. → { aireMax, coteMax }.
  function plafondRemplir(pxParM) {
    const k = Number(pxParM);
    if (k > 0) { const c = Math.round(REMPLIR.coteMaxM * k); return { aireMax: c * c, coteMax: c }; }
    return { aireMax: REMPLIR.plafondPx * REMPLIR.plafondPx, coteMax: 0 };
  }
  // Le point touché est-il du côté CLAIR de son voisinage (L* au moins à mi-chemin entre le plus sombre et le plus
  // clair des pixels à ± 3 px) ? 🩸 Pas « plus clair que le trait » : autour d'un petit pilier grisé, le masque du
  // trait compte aussi le fond blanc d'en face, et un toucher sur un pixel sombre du bord passait, remplissant un
  // morceau du trait (essai sur plan flou).
  function _coteClair(lab, labG, W, H, px, py) {
    let lo = Infinity, hi = -Infinity;
    for (let j = Math.max(0, py - 3); j <= Math.min(H - 1, py + 3); j++) {
      for (let i = Math.max(0, px - 3); i <= Math.min(W - 1, px + 3); i++) {
        const l = lab(j * W + i)[0];
        if (l < lo) lo = l;
        if (l > hi) hi = l;
      }
    }
    return hi > lo && labG[0] >= (lo + hi) / 2;
  }
  // Pixels du trait (masque F) gagnés par la zone m : ceux plus près de la zone que de l'autre côté du trait
  // (distances de chanfrein 3-4 dans le trait, égalité gagnée par la zone), à au plus `cap` px de la zone. Calcul
  // borné à la boîte de la zone élargie de 2 × cap. → nombre de pixels ajoutés à m.
  // 🩸 Sans « autre côté » à moins de 2 × cap (pilier plein sur fond uni : tout le fond est « trait » ; aplat noir
  //   épais), rien n'est gagné : la zone garderait sinon `cap` px de fond tout autour.
  function _jusquAuMilieu(m, F, hors, W, H, bx0, by0, bx1, by1, cap) {
    const M = 2 * cap + 1;
    const X0 = Math.max(0, bx0 - M), Y0 = Math.max(0, by0 - M);
    const X1 = Math.min(W - 1, bx1 + M), Y1 = Math.min(H - 1, by1 + M);
    const bw = X1 - X0 + 1, bh = Y1 - Y0 + 1, nb = bw * bh;
    const dIn = new Int16Array(nb).fill(-1), dOut = new Int16Array(nb).fill(-1);
    // distance de chanfrein 3-4 (3 par pas droit, 4 en diagonale) dans le trait, par files à seaux (poids entiers)
    const parcourir = function (dist, source, limite) {
      const seaux = [];
      for (let k = 0; k < nb; k++) {
        const x = X0 + (k % bw), y = Y0 + ((k - (k % bw)) / bw);
        if (source(y * W + x)) { dist[k] = 0; (seaux[0] = seaux[0] || []).push(k); }
      }
      for (let c = 0; c < seaux.length; c++) {
        const seau = seaux[c];
        if (!seau) continue;
        for (let i = 0; i < seau.length; i++) {
          const k = seau[i];
          if (dist[k] !== c) continue;   // déjà atteint plus court
          const kx = k % bw, ky = (k - kx) / bw;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = kx + dx, y = ky + dy;
            if ((!dx && !dy) || x < 0 || y < 0 || x >= bw || y >= bh) continue;
            const t = y * bw + x, nd = c + (dx && dy ? 4 : 3);
            if (nd > limite || (dist[t] >= 0 && dist[t] <= nd) || !F[(Y0 + y) * W + X0 + x]) continue;
            dist[t] = nd; (seaux[nd] = seaux[nd] || []).push(t);
          }
        }
      }
    };
    parcourir(dIn, function (q) { return m[q] === 1; }, 3 * cap);
    parcourir(dOut, function (q) { return !m[q] && !F[q] && !hors[q]; }, 6 * cap);
    let ajout = 0;
    for (let k = 0; k < nb; k++) {
      if (dIn[k] > 0 && dOut[k] > 0 && dIn[k] <= dOut[k]) {
        m[(Y0 + ((k - (k % bw)) / bw)) * W + X0 + (k % bw)] = 1;
        ajout++;
      }
    }
    return ajout;
  }
  // Trait autour d'un point touché (masque T, fermé en F) ; → { F, hors, g } ou { refus: "hors" | "trait" }.
  function _murs(b, px, py, o) {
    const W = b.w, H = b.h, d = b.data, N = W * H;
    px = Math.floor(px); py = Math.floor(py);
    if (px < 0 || py < 0 || px >= W || py >= H || d[(py * W + px) * 4 + 3] < 128) return { refus: "hors" };
    const tol = Number(o.tolerance) > 0 ? Number(o.tolerance) : REMPLIR.tolerance;
    const R = o.fermeture === undefined ? REMPLIR.fermeture : Math.max(0, Math.floor(o.fermeture));
    const cache = new Map();
    const lab = function (i) {
      const k = i * 4, c = ((d[k] >> 2) << 12) | ((d[k + 1] >> 2) << 6) | (d[k + 2] >> 2);
      let v = cache.get(c);
      if (!v) { v = rgbVersLab(d[k], d[k + 1], d[k + 2]); cache.set(c, v); }
      return v;
    };
    // couleur du fond touché : médiane (canal par canal) du carré 5 × 5 à moins de 12 du pixel touché (bruit JPEG)
    const g = py * W + px, labG = lab(g), r = [], v = [], bl = [];
    for (let j = Math.max(0, py - 2); j <= Math.min(H - 1, py + 2); j++) {
      for (let i = Math.max(0, px - 2); i <= Math.min(W - 1, px + 2); i++) {
        const q = j * W + i, k = q * 4;
        if (d[k + 3] < 128 || deltaE(lab(q), labG) > 12) continue;
        r.push(d[k]); v.push(d[k + 1]); bl.push(d[k + 2]);
      }
    }
    const med = function (t) { t.sort(function (a, c) { return a - c; }); return t[t.length >> 1]; };
    const lab0 = rgbVersLab(med(r), med(v), med(bl));
    const T = new Uint8Array(N), hors = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (d[i * 4 + 3] < 128) hors[i] = 1;
      else if (deltaE(lab(i), lab0) > tol) T[i] = 1;
    }
    let F = T;
    if (R > 0) {
      const tmp = new Uint8Array(N);
      F = new Uint8Array(N);
      _passe(T, tmp, W, H, R, false);
      _passe(tmp, F, W, H, R, true);
      for (let i = 0; i < N; i++) if (T[i]) F[i] = 1;
    }
    // ⚠️ contrat (décision produit) : fermeture en REPLI. Un pilier large de 2 à 3 px, ou grisé par le flou, est
    //   avalé par la fermeture (le point touché tombe dans le trait fermé) : on recommence alors sans fermeture.
    // 🩸 Seulement si le point touché est du côté CLAIR de son voisinage (_coteClair) : un toucher sur le trait
    //   (foncé) ou sur un pixel sombre du bord remplirait sinon un morceau du trait comme une zone.
    if (F[g] && !T[g] && F !== T && o.repli !== false && _coteClair(lab, labG, W, H, px, py)) F = T;
    if (F[g]) return { refus: "trait" };
    return { F: F, hors: hors, g: g };
  }
  // Composante 4-connexe du fond fermé F partie de g → { m (masque), n, premier, x0, y0, x1, y1 } ; null si elle
  // touche le bord du bloc ou un pixel hors image (zone ouverte).
  function _inonder(F, hors, W, H, g) {
    const N = W * H, m = new Uint8Array(N), file = new Int32Array(N);
    let lu = 0, n = 0, premier = g, x0 = W, y0 = H, x1 = -1, y1 = -1;
    file[n++] = g; m[g] = 1;
    while (lu < n) {
      const q = file[lu++], qx = q % W, qy = (q - qx) / W;
      if (hors[q] || qx === 0 || qy === 0 || qx === W - 1 || qy === H - 1) return null;
      if (q < premier) premier = q;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      const vois = [q - 1, q + 1, q - W, q + W];
      for (let k = 0; k < 4; k++) {
        const t = vois[k];
        if (m[t] || F[t]) continue;
        m[t] = 1; file[n++] = t;
      }
    }
    return { m: m, n: n, premier: premier, x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function remplir(b, px, py, o) {
    o = o || {};
    const W = b.w, H = b.h, N = W * H, e = o.echelle || 1;
    const aireMax = Number(o.aireMax) > 0 ? Number(o.aireMax) * e * e : Math.floor(N / 4);
    const coteMax = Number(o.coteMax) > 0 ? Number(o.coteMax) * e : Infinity;
    const mu = _murs(b, px, py, o);
    if (mu.refus) return mu;
    const F = mu.F, hors = mu.hors, z = _inonder(F, hors, W, H, mu.g);
    if (!z) return { refus: "ouvert" };
    const m = z.m;
    let n = z.n, premier = z.premier, x0 = z.x0, y0 = z.y0, x1 = z.x1, y1 = z.y1;
    // 🩸 Plafond jugé APRÈS le remplissage : une fuite vers le bord est « ouverte », pas « trop grande »
    if (n > aireMax || x1 - x0 + 1 > coteMax || y1 - y0 + 1 > coteMax) return { refus: "tropGrand" };
    const cap = Math.max(1, Math.round((o.demiTrait === undefined ? REMPLIR.demiTrait : o.demiTrait) * e));
    if (_jusquAuMilieu(m, F, hors, W, H, x0, y0, x1, y1, cap)) {
      // boîte et premier pixel (ordre de balayage) de la zone étendue, cherchés autour de l'ancienne boîte
      const X0 = Math.max(0, x0 - cap), Y0 = Math.max(0, y0 - cap);
      const X1 = Math.min(W - 1, x1 + cap), Y1 = Math.min(H - 1, y1 + cap);
      n = 0; premier = -1; x0 = W; y0 = H; x1 = -1; y1 = -1;
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
        if (!m[y * W + x]) continue;
        n++;
        if (premier < 0) premier = y * W + x;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const eps = Math.max(0.5, (o.simplification === undefined ? REMPLIR.simplification : o.simplification) * e);
    const cont = _contour(m, W, H, premier % W, (premier - premier % W) / W);
    const s = Number(o.affiner) > 0 ? _affiner(cont, Number(o.affiner) * e, eps) : _simplifierFerme(cont, eps);
    if (s.length < 3) return { refus: "trait" };
    const ox = o.x0 || 0, oy = o.y0 || 0;
    return {
      aire: n / (e * e),
      boite: { x: ox + x0 / e, y: oy + y0 / e, w: (x1 - x0 + 1) / e, h: (y1 - y0 + 1) / e },
      points: s.map(function (q) {
        return { x: Math.round((ox + q[0] / e) * 10) / 10, y: Math.round((oy + q[1] / e) * 10) / 10 };
      })
    };
  }

  // ── Galeries → tracés (fenêtre « Détecter les galeries ») ──
  // Deux sources, un moteur : pipette sur la couleur de la galerie (classe de nature "galerie", réglage `galerie`
  // de detecter → _galeriesBloc) ou remplissage au clic jusqu'aux murs (remplirGalerie). Les deux rendent des AXES
  // bruts (squelette du masque, rayon inscrit à chaque sommet) ; reseauGaleries en fait des tracés.
  // ⚠️ contrat (décision produit) : avant le squelette, le masque est BOUCHÉ (_boucher : lettres, points de repère,
  //   traits de rappel dans la galerie), puis les structures posées y sont percées (_percerObstacles) : le tracé les
  //   contourne. Un seul tracé par galerie, long et simple ; branches courtes retirées ; deux réglages seulement
  //   (simplification, branche minimale), en mètres à l'échelle du plan (reglagesGaleries).
  // ⚠️ contrat (décision produit) : réseau existant jamais modifié ; une partie à moins de `doublon` px d'un tracé
  //   existant est coupée ; un bout se pose EXACTEMENT sur un sommet existant à portée, sinon exactement sur le
  //   segment (pied de T de l'itinéraire). Aucun sommet n'est posé sur un croisement.
  const GALERIES = Object.freeze({ simplificationM: 0.5, brancheMinM: 1.5, repliSimplification: 3, repliBranche: 15,
                                   doublon: 6, fermeture: 2, longueurBouchage: 4, longueurCoupure: 3, trouLargeur: 0.6,
                                   angleSuite: 35, ergot: 2, fusion: 2.5 });
  // Réglages par défaut en px du plan pour une échelle en px/m (absente : repli en px).
  function reglagesGaleries(pxParM) {
    const k = Number(pxParM);
    if (k > 0) {
      return { simplification: Math.round(GALERIES.simplificationM * k * 10) / 10,
               brancheMin: Math.round(GALERIES.brancheMinM * k * 10) / 10 };
    }
    return { simplification: GALERIES.repliSimplification, brancheMin: GALERIES.repliBranche };
  }
  // Largeur typique d'une galerie du masque (px de bloc) : 2 × le 95e centile de la distance au bord.
  function _largeurMasque(m, W, H, dist) {
    const d = dist || _distance(m, W, H);
    let max = 0, n = 0;
    for (let i = 0; i < W * H; i++) if (d[i] > max) max = d[i];
    if (!max) return 0;
    const hist = new Uint32Array(max + 1);
    for (let i = 0; i < W * H; i++) if (d[i]) { hist[d[i]]++; n++; }
    let s = 0;
    for (let v = 1; v <= max; v++) { s += hist[v]; if (s >= 0.95 * n) return (2 * v) / 3; }
    return (2 * max) / 3;
  }
  // Composantes 8-connexes d'un masque → [{ px: [indices], x0, y0, x1, y1 }].
  function _composantes8(c, W, H) {
    const vu = new Uint8Array(W * H), out = [];
    for (let p = 0; p < W * H; p++) {
      if (!c[p] || vu[p]) continue;
      const px = [p];
      vu[p] = 1;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let k = 0; k < px.length; k++) {
        const q = px[k], qx = q % W, qy = (q - qx) / W;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = qx + dx, y = qy + dy, t = y * W + x;
          if (x < 0 || y < 0 || x >= W || y >= H || !c[t] || vu[t]) continue;
          vu[t] = 1; px.push(t);
        }
      }
      out.push({ px: px, x0: x0, y0: y0, x1: x1, y1: y1 });
    }
    return out;
  }
  // Boucher le masque d'une galerie : trous compacts plus petits que (trouLargeur × largeur)² (lettres, points),
  // puis fermeture de rayon `fermeture` dont on ne garde que les ajouts COURTS (≤ longueurBouchage × largeur).
  // 🩸 Un trait de rappel en travers d'une galerie est court (la largeur de la galerie) ; un mur fin entre deux
  //   galeries parallèles court tout du long : la fermeture le comblait et soudait les deux galeries.
  // 🩸 Un pilier dessiné, plus large que 0,6 × la galerie, reste un trou : le tracé le contourne.
  function _boucher(m, W, H, e) {
    const w = _largeurMasque(m, W, H);
    if (!(w > 0)) return;
    const N = W * H, cote = GALERIES.trouLargeur * w;
    _comblerTrous(m, W, H, Math.round(cote * cote));
    const R = Math.max(1, Math.round(GALERIES.fermeture * e)), tmp = new Uint8Array(N), c = new Uint8Array(N);
    _passe(m, tmp, W, H, R, false);
    _passe(tmp, c, W, H, R, true);
    for (let i = 0; i < N; i++) c[i] = c[i] && !m[i] ? 1 : 0;
    const L = GALERIES.longueurBouchage * w;
    _composantes8(c, W, H).forEach(function (k) {
      if (Math.max(k.x1 - k.x0 + 1, k.y1 - k.y0 + 1) <= L) k.px.forEach(function (q) { m[q] = 1; });
    });
  }
  // Structures posées percées dans le masque (px du plan → px de bloc), avec 1,5 px de marge :
  // obstacles = [{ points: [{x,y}], ferme }] (ferme : polygone ; sinon ligne).
  function _percerObstacles(m, W, H, obstacles, x0, y0, e) {
    (obstacles || []).forEach(function (ob) {
      const P = (ob && ob.points || []).map(function (p) { return [(p.x - x0) * e, (p.y - y0) * e]; });
      if (P.length < 2) return;
      const ferme = ob.ferme !== false && P.length >= 3, marge = Math.max(1, 1.5 * e);
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      P.forEach(function (p) {
        if (p[0] < bx0) bx0 = p[0]; if (p[0] > bx1) bx1 = p[0]; if (p[1] < by0) by0 = p[1]; if (p[1] > by1) by1 = p[1];
      });
      const X0 = Math.max(0, Math.floor(bx0 - marge)), X1 = Math.min(W - 1, Math.ceil(bx1 + marge));
      const Y0 = Math.max(0, Math.floor(by0 - marge)), Y1 = Math.min(H - 1, Math.ceil(by1 + marge));
      const n = ferme ? P.length : P.length - 1;
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        let dedans = false, dmin = Infinity;
        for (let i = 0; i < n; i++) {
          const a = P[i], b = P[(i + 1) % P.length];
          if (ferme && (a[1] > cy) !== (b[1] > cy) && cx < (b[0] - a[0]) * (cy - a[1]) / (b[1] - a[1]) + a[0]) {
            dedans = !dedans;
          }
          const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
          const u = L2 ? Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cy - a[1]) * dy) / L2)) : 0;
          const dd = Math.hypot(cx - a[0] - u * dx, cy - a[1] - u * dy);
          if (dd < dmin) dmin = dd;
        }
        if (dedans || dmin <= marge) m[y * W + x] = 0;
      }
    });
  }
  // Squelette du masque → axes [[{ x, y, r }]] en px du plan (r = rayon inscrit), découpés au cœur du bloc.
  function _axesMasque(m, W, H, x0, y0, e, coeur) {
    const dist = _distance(m, W, H), S = new Uint8Array(m);
    _squelette(S, W, H);
    const r1 = function (v) { return Math.round(v * 100) / 100; };
    const out = [];
    _chemins(S, W, H).forEach(function (t) {
      const pts = t.ch.map(function (i) { const x = i % W; return [x + 0.5, (i - x) / W + 0.5, dist[i] / 3]; });
      _decouper(_dp(pts, 0.75), coeur).forEach(function (mor) {
        out.push(mor.map(function (q) { return { x: r1(x0 + q[0] / e), y: r1(y0 + q[1] / e), r: r1(q[2] / e) }; }));
      });
    });
    return out;
  }
  // Un bloc en mode galerie (detecterBloc avec reglages.galerie) : masque de la couleur de la galerie, bouché,
  // obstacles percés, axes.
  function _galeriesBloc(o) {
    const W = o.w, H = o.h, N = W * H, d = o.data, e = o.echelle || 1, rg = o.reglages;
    const cl = o.classes.filter(function (c) { return c.nature === "galerie"; });
    const classer = _tableClasses(cl.length ? cl : o.classes), m = new Uint8Array(N);
    for (let i = 0, k = 0; i < N; i++, k += 4) m[i] = d[k + 3] >= 128 && classer(d[k], d[k + 1], d[k + 2]) ? 1 : 0;
    if (rg.boucher !== false) _boucher(m, W, H, e);
    _percerObstacles(m, W, H, rg.obstacles, o.x0, o.y0, e);
    return { masses: [], tropGrands: [], ignorees: 0, ecartees: 0, traits: [],
             axes: _axesMasque(m, W, H, o.x0, o.y0, e, o.coeur || { x: 0, y: 0, w: W, h: H }) };
  }

  // Remplir au clic dans une galerie de la couleur du fond, jusqu'aux murs, puis son axe.
  // b, px, py : comme remplir ; o = { x0, y0, echelle, tolerance, fermeture, obstacles, boucher, rouvrir }.
  // → { axes, aire } ou { refus: "hors" | "trait" | "ouvert" }. Pas de plafond de taille : une galerie s'étend
  //   loin, seule une zone qui touche le bord du bloc lu (ouverte) est refusée.
  function remplirGalerie(b, px, py, o) {
    o = o || {};
    const W = b.w, H = b.h, e = o.echelle || 1, x0 = o.x0 || 0, y0 = o.y0 || 0;
    const mu = _murs(b, px, py, o);
    if (mu.refus) return mu;
    let z = _inonder(mu.F, mu.hors, W, H, mu.g);
    if (!z) return { refus: "ouvert" };
    if (o.rouvrir !== false) z = _rouvrirCoupures(mu, z, W, H, e);
    if (o.boucher !== false) _boucher(z.m, W, H, e);
    _percerObstacles(z.m, W, H, o.obstacles, x0, y0, e);
    return { axes: _axesMasque(z.m, W, H, x0, y0, e, { x: 0, y: 0, w: W, h: H }), aire: z.n / (e * e) };
  }
  // Traits fins qui coupent TOUTE la galerie (trait de rappel d'un mur à l'autre) : le remplissage s'y arrête.
  // Candidats = pixels du trait à moins de TRAIT_FIN px à la fois de la zone remplie et d'une zone libre FERMÉE
  // (qui ne touche pas le bord du bloc : un mur entre la galerie et le fond extérieur n'est jamais candidat) ;
  // par composante, la plus courte d'abord, ouverte si elle ne dépasse pas longueurCoupure × la largeur et que le
  // nouveau remplissage reste fermé.
  // 🩸 Un mur fin entre deux galeries parallèles est candidat aussi, mais long : jamais ouvert.
  function _rouvrirCoupures(mu, z, W, H, e) {
    const N = W * H, cap = Math.max(2, Math.round(TRAIT_FIN * e)), hors = mu.hors;
    let F = mu.F;
    for (let tour = 0; tour < 8; tour++) {
      const m = z.m, lib = new Int32Array(N), bordLib = [0];
      let nl = 0;
      for (let p = 0; p < N; p++) {   // zones libres 4-connexes, marquées si elles touchent le bord
        if (lib[p] || F[p] || m[p] || hors[p]) continue;
        nl++; bordLib.push(0);
        const file = [p];
        lib[p] = nl;
        for (let k = 0; k < file.length; k++) {
          const q = file[k], qx = q % W, qy = (q - qx) / W;
          if (qx === 0 || qy === 0 || qx === W - 1 || qy === H - 1) bordLib[nl] = 1;
          const vois = [qx > 0 ? q - 1 : -1, qx < W - 1 ? q + 1 : -1, qy > 0 ? q - W : -1, qy < H - 1 ? q + W : -1];
          for (let j = 0; j < 4; j++) {
            const t = vois[j];
            if (t < 0 || lib[t] || F[t] || m[t] || hors[t]) continue;
            lib[t] = nl; file.push(t);
          }
        }
      }
      const dIn = _distDansTrait(F, W, H, function (q) { return m[q] === 1; }, 3 * cap);
      const dOut = _distDansTrait(F, W, H, function (q) { return lib[q] > 0 && !bordLib[lib[q]]; }, 3 * cap);
      const c = new Uint8Array(N);
      for (let p = 0; p < N; p++) {
        if (F[p] && dIn[p] > 0 && dOut[p] > 0 && dIn[p] + dOut[p] <= 3 * (cap + 1)) c[p] = 1;
      }
      const L = GALERIES.longueurCoupure * _largeurMasque(m, W, H);
      const comps = _composantes8(c, W, H).filter(function (k) {
        return Math.max(k.x1 - k.x0 + 1, k.y1 - k.y0 + 1) <= L;
      }).sort(function (a, b) { return a.px.length - b.px.length; });
      let ouvert = false;
      for (let i = 0; i < comps.length && !ouvert; i++) {
        const F2 = new Uint8Array(F);
        comps[i].px.forEach(function (q) { F2[q] = 0; });
        const z2 = _inonder(F2, hors, W, H, mu.g);
        if (z2 && z2.n > z.n) { F = F2; z = z2; ouvert = true; }
      }
      if (!ouvert) break;
    }
    return z;
  }
  // Distance de chanfrein 3-4 DANS le trait F depuis les pixels `source` (0 à la source, -1 au-delà de `limite`).
  function _distDansTrait(F, W, H, source, limite) {
    const N = W * H, dist = new Int32Array(N).fill(-1), seaux = [[]];
    for (let q = 0; q < N; q++) if (source(q)) { dist[q] = 0; seaux[0].push(q); }
    for (let c = 0; c < seaux.length; c++) {
      const seau = seaux[c];
      if (!seau) continue;
      for (let i = 0; i < seau.length; i++) {
        const q = seau[i];
        if (dist[q] !== c) continue;
        const qx = q % W, qy = (q - qx) / W;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = qx + dx, y = qy + dy;
          if ((!dx && !dy) || x < 0 || y < 0 || x >= W || y >= H) continue;
          const t = y * W + x, nd = c + (dx && dy ? 4 : 3);
          if (!F[t] || nd > limite || (dist[t] >= 0 && dist[t] <= nd)) continue;
          dist[t] = nd; (seaux[nd] = seaux[nd] || []).push(t);
        }
      }
    }
    return dist;
  }

  // ── Réseau : axes bruts → tracés ──
  // reseauGaleries(axes, o) ; o = { simplification, brancheMin (px du plan), doublon (px, défaut 6),
  //   existants: [{ points }] (tracés du même niveau), obstacles: [{ points, ferme }] }.
  // → { traces: [{ points: [{x,y}], accroches: [debut, fin] }], deja (parties coupées en doublon), accroches }.
  // Étapes : graphe (bouts à moins de `fusion` px confondus : raccord des blocs), ergots et branches courtes,
  //   nœuds proches fusionnés, petites boucles sans obstacle, enchaînement (degré 2, et à travers un carrefour sur
  //   l'arête la plus droite), doublons, accroche, simplification qui ne coupe aucun obstacle.
  function reseauGaleries(axes, o) {
    o = o || {};
    const eps = o.simplification > 0 ? o.simplification : GALERIES.repliSimplification;
    const bmin = o.brancheMin >= 0 ? o.brancheMin : GALERIES.repliBranche;
    const doublon = o.doublon > 0 ? o.doublon : GALERIES.doublon;
    const obst = _preparerObstacles(o.obstacles);
    const existants = (o.existants || []).filter(function (s) {
      return s && Array.isArray(s.points) && s.points.length >= 2;
    });
    const g = _graphe(axes || []);
    _elaguer(g, bmin);
    _fusionnerNoeuds(g);
    _elaguer(g, bmin);
    _petitesBoucles(g, bmin, obst);
    _elaguer(g, bmin);
    const coupe = _sansDoublons(_enchainer(g), existants, doublon);
    let accroches = 0;
    const traces = [];
    coupe.traces.forEach(function (t) {
      const acc = [_accrocher(t.pts, 0, existants, doublon), _accrocher(t.pts, t.pts.length - 1, existants, doublon)];
      const pts = _simplifierFixe(t.pts, t.fixes, eps, obst);
      let L = 0;
      for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (pts.length < 2 || (L < bmin && !(acc[0] && acc[1])) || L < 0.5) return;
      if (acc[0]) accroches++;
      if (acc[1]) accroches++;
      traces.push({ points: pts.map(function (p) {
        return p.exact ? { x: p.x, y: p.y } : { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
      }), accroches: acc });
    });
    return { traces: traces, deja: coupe.deja, accroches: accroches };
  }
  function _preparerObstacles(liste) {
    return (liste || []).filter(function (ob) { return ob && Array.isArray(ob.points) && ob.points.length >= 2; })
      .map(function (ob) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        ob.points.forEach(function (p) {
          if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
        });
        return { pts: ob.points, ferme: ob.ferme !== false && ob.points.length >= 3, x0: x0, y0: y0, x1: x1, y1: y1 };
      });
  }
  function _longueur(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L;
  }
  // Graphe { noeuds: [{ x, y, r, inc: Set(arêtes) }], aretes: [{ a, b, pts, vivante }] }.
  function _graphe(axes) {
    const noeuds = [], aretes = [], grille = new Map(), tol = GALERIES.fusion, C = 8;
    const noeud = function (p) {
      const cx = Math.floor(p.x / C), cy = Math.floor(p.y / C);
      let best = -1, dmin = tol;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        (grille.get((cx + dx) + "," + (cy + dy)) || []).forEach(function (i) {
          const d = Math.hypot(noeuds[i].x - p.x, noeuds[i].y - p.y);
          if (d <= dmin) { dmin = d; best = i; }
        });
      }
      if (best >= 0) { noeuds[best].r = Math.max(noeuds[best].r, p.r || 0); return best; }
      noeuds.push({ x: p.x, y: p.y, r: p.r || 0, inc: new Set() });
      const k = cx + "," + cy;
      (grille.get(k) || grille.set(k, []).get(k)).push(noeuds.length - 1);
      return noeuds.length - 1;
    };
    axes.forEach(function (ax) {
      if (!Array.isArray(ax) || ax.length < 2) return;
      const a = noeud(ax[0]), b = noeud(ax[ax.length - 1]);
      if (a === b && _longueur(ax) < 3 * tol) return;   // éclat d'un carrefour du squelette
      const id = aretes.length;
      aretes.push({ a: a, b: b, pts: ax.slice(), vivante: true });
      noeuds[a].inc.add(id); noeuds[b].inc.add(id);
    });
    const g = { noeuds: noeuds, aretes: aretes };
    for (let i = 0; i < noeuds.length; i++) _fondre(g, i);
    return g;
  }
  function _degre(g, n) {
    let d = 0;
    g.noeuds[n].inc.forEach(function (id) { const a = g.aretes[id]; d += a.a === a.b ? 2 : 1; });
    return d;
  }
  function _retirer(g, id) {
    const a = g.aretes[id];
    a.vivante = false;
    g.noeuds[a.a].inc.delete(id); g.noeuds[a.b].inc.delete(id);
  }
  // Points d'une arête orientés depuis le nœud n (bouts remplacés par la position des nœuds).
  function _depuis(g, a, n) {
    const p = a.a === n ? a.pts.slice() : a.pts.slice().reverse();
    const na = g.noeuds[a.a === n ? a.a : a.b], nb = g.noeuds[a.a === n ? a.b : a.a];
    p[0] = { x: na.x, y: na.y, r: na.r }; p[p.length - 1] = { x: nb.x, y: nb.y, r: nb.r };
    return p;
  }
  // Nœud de degré 2 entre deux arêtes distinctes : les deux arêtes n'en font qu'une.
  function _fondre(g, n) {
    const inc = Array.from(g.noeuds[n].inc);
    if (inc.length !== 2) return false;
    const e1 = g.aretes[inc[0]], e2 = g.aretes[inc[1]];
    if (e1.a === e1.b || e2.a === e2.b) return false;
    const u = e1.a === n ? e1.b : e1.a, v = e2.a === n ? e2.b : e2.a;
    const p1 = _depuis(g, e1, u), p2 = _depuis(g, e2, n);
    _retirer(g, inc[0]); _retirer(g, inc[1]);
    const id = g.aretes.length;
    g.aretes.push({ a: u, b: v, pts: p1.concat(p2.slice(1)), vivante: true });
    g.noeuds[u].inc.add(id); g.noeuds[v].inc.add(id);
    return true;
  }
  // Ergots (bout libre sur un carrefour, plus court que brancheMin ou que `ergot` × le rayon du carrefour : il ne
  // sort pas de la largeur de la galerie) et morceaux isolés courts ; du plus court au plus long, degrés relus à
  // chaque retrait (deux ergots d'un même carrefour : le second devient la suite de la galerie).
  function _elaguer(g, bmin) {
    for (let tour = 0; tour < 50; tour++) {
      const ids = [];
      g.aretes.forEach(function (a, id) { if (a.vivante && a.a !== a.b) ids.push([_longueur(a.pts), id]); });
      ids.sort(function (x, y) { return x[0] - y[0]; });
      let change = false;
      ids.forEach(function (c) {
        const a = g.aretes[c[1]];
        if (!a.vivante) return;
        const da = _degre(g, a.a), db = _degre(g, a.b), L = c[0];
        let retirer = false;
        if (da === 1 && db === 1) retirer = L < bmin;
        else if (da === 1 || db === 1) {
          const j = da === 1 ? a.b : a.a;
          if (_degre(g, j) >= 3) retirer = L < Math.max(bmin, GALERIES.ergot * g.noeuds[j].r);
        }
        if (!retirer) return;
        _retirer(g, c[1]);
        change = true;
        _fondre(g, a.a); _fondre(g, a.b);
      });
      if (!change) break;
    }
  }
  // Deux carrefours reliés par une arête plus courte que la somme de leurs rayons : un seul carrefour (milieu).
  function _fusionnerNoeuds(g) {
    for (let tour = 0; tour < 50; tour++) {
      let change = false;
      g.aretes.forEach(function (a, id) {
        if (!a.vivante || a.a === a.b) return;
        const A = g.noeuds[a.a], B = g.noeuds[a.b];
        if (_degre(g, a.a) < 3 || _degre(g, a.b) < 3) return;
        if (_longueur(a.pts) > Math.max(A.r + B.r, 3)) return;
        _retirer(g, id);
        A.x = (A.x + B.x) / 2; A.y = (A.y + B.y) / 2; A.r = Math.max(A.r, B.r);
        Array.from(B.inc).forEach(function (k) {
          const e = g.aretes[k];
          if (e.a === a.b) e.a = a.a;
          if (e.b === a.b) e.b = a.a;
          B.inc.delete(k); A.inc.add(k);
        });
        change = true;
      });
      if (!change) break;
    }
    for (let i = 0; i < g.noeuds.length; i++) _fondre(g, i);
  }
  function _dansPolygone(p, pts) {
    let d = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) d = !d;
    }
    return d;
  }
  function _aireXY(pts) {
    let s = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
    return Math.abs(s / 2);
  }
  // Boucle (arête sur elle-même, ou deux arêtes entre les mêmes nœuds) qui n'entoure aucun obstacle et d'aire sous
  // (2 × brancheMin)² : un détour du squelette autour d'un reste de bruit ; la plus longue des deux part.
  function _petitesBoucles(g, bmin, obst) {
    const vide = function (poly) {
      return !obst.some(function (ob) { return _dansPolygone(ob.pts[0], poly); }) && _aireXY(poly) < 4 * bmin * bmin;
    };
    g.aretes.forEach(function (a, id) {
      if (a.vivante && a.a === a.b && vide(a.pts)) { _retirer(g, id); _fondre(g, a.a); }
    });
    const paires = new Map();
    g.aretes.forEach(function (a, id) {
      if (!a.vivante || a.a === a.b) return;
      const k = Math.min(a.a, a.b) + "," + Math.max(a.a, a.b);
      (paires.get(k) || paires.set(k, []).get(k)).push(id);
    });
    paires.forEach(function (ids) {
      while (ids.length > 1) {
        const e1 = g.aretes[ids[0]], e2 = g.aretes[ids[1]];
        if (!vide(_depuis(g, e1, e1.a).concat(_depuis(g, e2, e1.b)))) break;
        const plusLongue = _longueur(e1.pts) >= _longueur(e2.pts) ? 0 : 1;
        const id = ids.splice(plusLongue, 1)[0], a = g.aretes[id];
        _retirer(g, id); _fondre(g, a.a); _fondre(g, a.b);
      }
    });
  }
  // Tracés : chaque carrefour apparie ses arêtes par la suite la plus droite (déviation ≤ angleSuite) ; un tracé
  // suit les arêtes appariées de bout en bout. → [{ pts: [{x,y,r}], fixes: Set(indices) }] (fixes : carrefours,
  // jamais retirés par la simplification ni déplacés : une autre galerie y finit).
  function _enchainer(g) {
    const partenaire = new Map(), cle = function (id, n) { return id + ":" + n; };
    g.noeuds.forEach(function (N, n) {
      const inc = [];
      N.inc.forEach(function (id) {
        const a = g.aretes[id];
        if (!a.vivante) return;
        // une boucle arrive deux fois au nœud : par son début (bout 0) et par sa fin (bout 1)
        const bouts = a.a === a.b ? [0, 1] : [a.a === n ? 0 : 1];
        bouts.forEach(function (b) {
          const p = b === 0 ? a.pts : a.pts.slice().reverse(), L = _longueur(p);
          const cible = Math.min(L / 2, Math.max(2 * N.r, 6));
          let s = 0, q = p[p.length - 1];
          for (let i = 1; i < p.length; i++) {
            s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
            if (s >= cible) { q = p[i]; break; }
          }
          inc.push({ k: id + ":" + b, ang: Math.atan2(q.y - N.y, q.x - N.x) });
        });
      });
      if (inc.length < 3 && !(inc.length === 2 && N.inc.size === 1)) return;
      const cand = [];
      for (let i = 0; i < inc.length; i++) for (let j = i + 1; j < inc.length; j++) {
        let d = Math.abs(inc[i].ang - inc[j].ang);
        if (d > Math.PI) d = 2 * Math.PI - d;
        const dev = Math.PI - d;   // 0 : les deux arêtes se prolongent en ligne droite
        if (dev <= (GALERIES.angleSuite * Math.PI) / 180) cand.push([dev, i, j]);
      }
      cand.sort(function (x, y) { return x[0] - y[0]; });
      const pris = new Set();
      cand.forEach(function (c) {
        if (pris.has(c[1]) || pris.has(c[2])) return;
        pris.add(c[1]); pris.add(c[2]);
        partenaire.set(inc[c[1]].k, inc[c[2]].k); partenaire.set(inc[c[2]].k, inc[c[1]].k);
      });
    });
    const utilisee = new Set(), traces = [];
    const marcher = function (id, b) {
      const pts = [], fixes = new Set([0]);
      let cur = id, bout = b;
      while (cur !== null && !utilisee.has(cur)) {
        utilisee.add(cur);
        const a = g.aretes[cur], depuis = bout === 0 ? a.a : a.b;
        let p = _depuis(g, a, depuis);
        if (a.a === a.b && bout === 1) p = p.reverse();
        if (pts.length) { fixes.add(pts.length - 1); p = p.slice(1); }
        Array.prototype.push.apply(pts, p);
        const suite = partenaire.get(cle(cur, 1 - bout));
        if (!suite) break;
        const s = suite.split(":");
        cur = Number(s[0]); bout = Number(s[1]);
      }
      fixes.add(pts.length - 1);
      traces.push({ pts: pts, fixes: fixes });
    };
    g.aretes.forEach(function (a, id) {
      if (!a.vivante || utilisee.has(id)) return;
      // départ par un bout sans partenaire : le tracé le plus long possible
      if (!partenaire.has(cle(id, 0))) marcher(id, 0);
      else if (!partenaire.has(cle(id, 1))) marcher(id, 1);
    });
    g.aretes.forEach(function (a, id) { if (a.vivante && !utilisee.has(id)) marcher(id, 0); });   // cycles
    return traces;
  }
  // Grille des segments existants (cellules de 32 px) → candidats d'un point à distance ≤ rayon.
  function _grilleExistants(existants) {
    const C = 32, g = new Map(), segs = [];
    existants.forEach(function (s) {
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1], b = s.points[i], id = segs.length;
        segs.push([a, b]);
        for (let y = Math.floor(Math.min(a.y, b.y) / C); y <= Math.floor(Math.max(a.y, b.y) / C); y++) {
          for (let x = Math.floor(Math.min(a.x, b.x) / C); x <= Math.floor(Math.max(a.x, b.x) / C); x++) {
            const k = x + "," + y;
            (g.get(k) || g.set(k, []).get(k)).push(id);
          }
        }
      }
    });
    return {
      segs: segs,
      autour: function (p, r) {
        const vus = new Set();
        for (let y = Math.floor((p.y - r) / C); y <= Math.floor((p.y + r) / C); y++) {
          for (let x = Math.floor((p.x - r) / C); x <= Math.floor((p.x + r) / C); x++) {
            (g.get(x + "," + y) || []).forEach(function (id) { vus.add(id); });
          }
        }
        return Array.from(vus).map(function (id) { return segs[id]; });
      }
    };
  }
  function _projSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const u = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    const q = { x: a.x + u * dx, y: a.y + u * dy };
    return { q: q, d: Math.hypot(p.x - q.x, p.y - q.y) };
  }
  // Parties d'un tracé à moins de `doublon` px d'un tracé existant : coupées (tracé densifié au pas de 2 px).
  // → { traces, deja (parties coupées) }.
  function _sansDoublons(traces, existants, doublon) {
    if (!existants.length) return { traces: traces, deja: 0 };
    const G = _grilleExistants(existants), out = [];
    let deja = 0;
    traces.forEach(function (t) {
      const P = [], F = [];   // points densifiés, fixe ou non
      for (let i = 0; i < t.pts.length; i++) {
        if (i) {
          const a = t.pts[i - 1], b = t.pts[i], n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 2);
          for (let k = 1; k < n; k++) {
            P.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, r: a.r + ((b.r - a.r) * k) / n });
            F.push(false);
          }
        }
        P.push(t.pts[i]); F.push(t.fixes.has(i));
      }
      const pris = P.map(function (p) {
        return G.autour(p, doublon).some(function (s) { return _projSeg(p, s[0], s[1]).d <= doublon; });
      });
      let cur = null;
      for (let i = 0; i <= P.length; i++) {
        if (i < P.length && !pris[i]) {
          if (!cur) cur = { pts: [], fixes: new Set() };
          if (F[i]) cur.fixes.add(cur.pts.length);
          cur.pts.push(P[i]);
          continue;
        }
        if (i < P.length && (i === 0 || !pris[i - 1])) deja++;
        if (cur && cur.pts.length >= 2) {
          cur.fixes.add(0); cur.fixes.add(cur.pts.length - 1);
          out.push(cur);
        }
        cur = null;
      }
    });
    return { traces: out, deja: deja };
  }
  // Bout k d'un tracé posé sur l'existant à portée (max(1,5 × doublon, rayon + doublon)) : sommet existant, sinon
  // projection sur le segment le plus proche. Le point devient `exact` (jamais arrondi). → vrai si accroché.
  function _accrocher(pts, k, existants, doublon) {
    if (!existants.length) return false;
    const p = pts[k], tol = Math.max(1.5 * doublon, (p.r || 0) + doublon);
    let best = null;
    existants.forEach(function (s) {
      s.points.forEach(function (q) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d <= tol && (!best || d < best.d)) best = { d: d, x: q.x, y: q.y };
      });
    });
    if (!best) {
      existants.forEach(function (s) {
        for (let i = 1; i < s.points.length; i++) {
          const r = _projSeg(p, s.points[i - 1], s.points[i]);
          if (r.d <= tol && (!best || r.d < best.d)) best = { d: r.d, x: r.q.x, y: r.q.y };
        }
      });
    }
    if (!best) return false;
    pts[k] = { x: best.x, y: best.y, r: p.r, exact: true };
    return true;
  }
  function _segCoupeObstacle(a, b, obst) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const sens = function (p, q, r) { return Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)); };
    return obst.some(function (ob) {
      if (ob.x1 < x0 || ob.x0 > x1 || ob.y1 < y0 || ob.y0 > y1) return false;
      const P = ob.pts, n = ob.ferme ? P.length : P.length - 1;
      for (let i = 0; i < n; i++) {
        const c = P[i], d = P[(i + 1) % P.length];
        if (sens(a, b, c) !== sens(a, b, d) && sens(c, d, a) !== sens(c, d, b)) return true;
      }
      return ob.ferme && _dansPolygone({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, P);
    });
  }
  // Douglas-Peucker entre deux sommets fixes ; un segment qui couperait un obstacle garde son point le plus loin.
  function _simplifierFixe(pts, fixes, eps, obst) {
    const garder = new Uint8Array(pts.length), bornes = [];
    for (let i = 0; i < pts.length; i++) {
      if (i === 0 || i === pts.length - 1 || fixes.has(i)) { garder[i] = 1; bornes.push(i); }
    }
    for (let k = 1; k < bornes.length; k++) {
      const pile = [[bornes[k - 1], bornes[k]]];
      while (pile.length) {
        const s = pile.pop(), a = s[0], b = s[1];
        if (b - a < 2) continue;
        const A = pts[a], B = pts[b], L = Math.hypot(B.x - A.x, B.y - A.y);
        let m = (a + b) >> 1, dm = -1;
        for (let i = a + 1; i < b; i++) {
          const d = L ? Math.abs((B.x - A.x) * (A.y - pts[i].y) - (A.x - pts[i].x) * (B.y - A.y)) / L
            : Math.hypot(pts[i].x - A.x, pts[i].y - A.y);
          if (d > dm) { dm = d; m = i; }
        }
        if (dm > eps || _segCoupeObstacle(A, B, obst)) { garder[m] = 1; pile.push([a, m], [m, b]); }
      }
    }
    return pts.filter(function (_, i) { return garder[i]; });
  }

  const api = { detecter: detecter, detecterBloc: detecterBloc, depuisMetres: depuisMetres, REGLAGES: REGLAGES,
                executeurWorker: executeurWorker, executeurLocal: executeurLocal, recalculer: recalculer,
                mesurerExemple: mesurerExemple, reglagesDepuisExemples: reglagesDepuisExemples,
                reglagesPourTaille: reglagesPourTaille, rgbVersLab: rgbVersLab, deltaE: deltaE,
                remplir: remplir, REMPLIR: REMPLIR, plafondRemplir: plafondRemplir,
                toleranceAffinage: toleranceAffinage, AFFINER: AFFINER, _magasin: _magasin,
                reseauGaleries: reseauGaleries, remplirGalerie: remplirGalerie, reglagesGaleries: reglagesGaleries,
                GALERIES: GALERIES };
  racine.KtaDetection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : globalThis);
