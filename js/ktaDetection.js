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
// chemins sans ergots ni bruit, découpés au cœur du bloc puis raccordés bout à bout entre blocs.
// Bandes de la couleur des piliers (galerie, mur en trait) retirées par leur forme (_retirerBandes : tronçons du
// squelette d'épaisseur constante plus longs que 4 × cette épaisseur).
// Réglages déduits des exemples touchés (mesurerExemple, reglagesDepuisExemples, reglagesPourTaille) ; recalcul sur
// les blocs gardés par l'exécuteur, sans relire l'image (recalculer).
// Expose : KtaDetection = { detecter, detecterBloc, recalculer, mesurerExemple, reglagesDepuisExemples,
//   reglagesPourTaille, depuisMetres, REGLAGES, executeurWorker, executeurLocal, rgbVersLab, deltaE }.
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
        if (aire > aireMax) { ecartees++; continue; }
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
      const retirer = pleins ? _masseDuTrait(m, pleins, W, H, vu, pile) : null;
      _traitsBloc(m, tmp, retirer, W, H, o, e).forEach(function (pts) {
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
  // Masses à retirer du masque T d'un trait : les composantes de `pleins` dont la moitié au moins des pixels est dans
  // T (masse de la couleur du trait), quelle que soit leur taille. → nouveau masque ; `vu` et `pile` sont réutilisés
  // (`pile` sert de file : la composante en cours est pile[0..n[).
  // ⚠️ contrat (décision produit) : une masse ne retire d'un front que si elle en a la couleur, gardée ou non par
  //   les tailles minimale et maximale ; les curseurs de taille ne changent donc pas les fronts. Le trait qui cerne
  //   un pilier clair sort en front, comme dans une passe Front seule.
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
  // squelette, chemins sans ergots ni bruit, simplifiés, rendus en pixels du plan et découpés au cœur du bloc.
  function _traitsBloc(T, tmp, retirer, W, H, o, e) {
    const rg = o.reglages;
    if (retirer) {
      _passe(retirer, tmp, W, H, Math.max(1, Math.round((rg.ecartMasse === undefined ? 2 : rg.ecartMasse) * e)), false);
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
    const res = { masses: [], tropGrands: [], ignorees: 0, ecartees: 0, traits: [], blocs: blocs.length };
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
      res.ecartees += r.ecartees || 0;
      if (r.traits) res.traits.push.apply(res.traits, r.traits);
      if (r.garde) gardes++;
      if (opts.onProgres) opts.onProgres(i + 1, blocs.length);
    }
    // traits coupés au bord des blocs : raccordés (le cœur d'un bloc touche celui du voisin)
    res.traits = _raccorder(res.traits, Math.max(1.5, 2 / e));
    // tous les blocs gardés : recalculer() peut refaire le calcul sans relire l'image
    res.recalculable = !!ex && !!opts.garder && gardes === blocs.length;
    return res;
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
    const res = { masses: [], tropGrands: [], ignorees: 0, ecartees: 0, traits: [], blocs: resultats.length };
    resultats.forEach(function (r) {
      res.masses.push.apply(res.masses, r.masses);
      res.tropGrands.push.apply(res.tropGrands, r.tropGrands);
      res.ignorees += r.ignorees;
      res.ecartees += r.ecartees || 0;
      if (r.traits) res.traits.push.apply(res.traits, r.traits);
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

  const api = { detecter: detecter, detecterBloc: detecterBloc, depuisMetres: depuisMetres, REGLAGES: REGLAGES,
                executeurWorker: executeurWorker, executeurLocal: executeurLocal, recalculer: recalculer,
                mesurerExemple: mesurerExemple, reglagesDepuisExemples: reglagesDepuisExemples,
                reglagesPourTaille: reglagesPourTaille, rgbVersLab: rgbVersLab, deltaE: deltaE,
                _magasin: _magasin };
  racine.KtaDetection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : globalThis);
