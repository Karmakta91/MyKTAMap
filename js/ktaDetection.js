/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ktaDetection.js — détection des masses pleines (piliers) sur l'image d'un plan : calcul PUR, sans DOM ni carte.
// Chargé par index.html (mode plan, Générateur), par js/ktaDetectionWorker.js (importScripts) et par Node (tests).
// Méthode : chaque pixel → classe de couleur (écart ΔE en Lab aux exemples de la pipette), ouverture morphologique
// (carré de côté `ouverture` : retire moucheté, traits creux, appendices), composantes d'aire ≥ `aireMin`, contour
// extérieur suivi sur les BORDS des pixels (aire exacte), Douglas-Peucker à `simplification`.
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
    const classer = _tableClasses(o.classes);
    const cls = new Uint8Array(N);
    for (let i = 0, k = 0; i < N; i++, k += 4) {
      if (d[k + 3] < 128) continue;   // transparent : hors image
      cls[i] = classer(d[k], d[k + 1], d[k + 2]);
    }
    const coeur = o.coeur || { x: 0, y: 0, w: W, h: H }, bords = o.bords || { g: true, h: true, d: true, b: true };
    const masses = [], tropGrands = [];
    let ignorees = 0;
    const m = new Uint8Array(N), tmp = new Uint8Array(N), vu = new Uint8Array(N), pile = new Int32Array(N);
    const trouMax = Math.max(0, Math.round((o.reglages.trouMax === undefined ? REGLAGES.trouMax : o.reglages.trouMax) *
      e * e));
    for (let c = 1; c <= o.classes.length; c++) {
      for (let i = 0; i < N; i++) m[i] = cls[i] === c ? 1 : 0;
      if (trouMax > 0) _comblerTrous(m, W, H, trouMax);
      _passe(m, tmp, W, H, R, true);
      _passe(tmp, m, W, H, R, false);
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
        if (coupee) { tropGrands.push({ classe: o.classes[c - 1].id, boite: boite }); continue; }
        const s = _simplifierFerme(_contour(m, W, H, p % W, (p - p % W) / W), eps);
        if (s.length < 3) { ignorees++; continue; }
        masses.push({
          classe: o.classes[c - 1].id,
          aire: _aire(s) / (e * e),
          boite: boite,
          points: s.map(function (q) {
            return { x: Math.round((o.x0 + q[0] / e) * 10) / 10, y: Math.round((o.y0 + q[1] / e) * 10) / 10 };
          })
        });
      }
    }
    return { masses: masses, tropGrands: tropGrands, ignorees: ignorees };
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
    const res = { masses: [], tropGrands: [], ignorees: 0, blocs: blocs.length };
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
      if (opts.onProgres) opts.onProgres(i + 1, blocs.length);
    }
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
