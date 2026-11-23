/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// scene-galeries.js — planche FABRIQUÉE pour « Détecter les galeries » : partagée par scripts/check-detection.js
// (Node) et les checkups navigateur (chargée telle quelle dans la page). Aucune donnée réelle.
// Gauche : galeries GRISES entre des murs noirs épais (T, galerie verticale, galerie basse, couloir vers une salle).
//   Texte (6 lettres pleines) dans la galerie du haut, trait de rappel de 2 px en travers de la galerie verticale,
//   pilier POSÉ (structure, non dessiné) au milieu de la salle, tracé existant sur la moitié gauche de la galerie du
//   haut jusqu'au carrefour (sommet attendu de l'accroche).
// Droite : galeries BLANCHES (couleur du fond) entre deux traits noirs de 3 px, en T ; texte dedans et trait de
//   rappel de 2 px qui coupe toute la branche verticale.
// Expose : sceneGaleries() → { W, H, data (RGBA), gris, pilier [{x,y}], existant { type, points }, carrefour {x,y},
//   rappelGris, rappelBlanc, texteGris, texteBlanc ({x,y,w,h}), clicBlanc {x,y}, clicGris {x,y} } (px du plan) ;
//   sceneGaleries.mesurerReseau(traces, scene) → mesures d'un réseau rendu (contrôles de Node et du navigateur).
"use strict";

(function (racine) {
  function sceneGaleries() {
    const W = 640, H = 400, data = new Uint8ClampedArray(W * H * 4);
    data.fill(255);
    const GRIS = [150, 150, 150], NOIR = [20, 20, 20], BLANC = [255, 255, 255];
    const rect = function (x, y, w, h, c) {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const k = (j * W + i) * 4;
        data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
      }
    };
    // ── galeries grises dans la roche noire ──
    rect(10, 40, 300, 330, NOIR);
    rect(20, 80, 280, 24, GRIS);      // galerie du haut, axe y = 92
    rect(140, 104, 24, 236, GRIS);    // galerie verticale, axe x = 152
    rect(40, 316, 240, 24, GRIS);     // galerie basse, axe y = 328
    rect(164, 188, 32, 24, GRIS);     // couloir, axe y = 200
    rect(196, 150, 100, 100, GRIS);   // salle (pilier posé au centre)
    for (let i = 0; i < 6; i++) rect(200 + i * 9, 86, 5, 12, NOIR);   // texte
    rect(140, 230, 24, 2, NOIR);      // trait de rappel en travers
    // ── galeries blanches entre deux traits noirs de 3 px ──
    rect(327, 97, 246, 30, NOIR);
    rect(437, 97, 30, 206, NOIR);
    rect(330, 100, 240, 24, BLANC);   // axe y = 112
    rect(440, 100, 24, 200, BLANC);   // axe x = 452
    for (let i = 0; i < 4; i++) rect(360 + i * 9, 106, 5, 12, NOIR);  // texte
    rect(440, 220, 24, 2, NOIR);      // trait de rappel qui coupe la branche
    return {
      W: W, H: H, data: data, gris: GRIS,
      pilier: [{ x: 231, y: 185 }, { x: 261, y: 185 }, { x: 261, y: 215 }, { x: 231, y: 215 }],
      existant: { type: "principal", points: [{ x: 24, y: 92 }, { x: 152, y: 92 }] },
      carrefour: { x: 152, y: 92 },
      texteGris: { x: 200, y: 86, w: 50, h: 12 }, rappelGris: { x: 140, y: 230, w: 24, h: 2 },
      texteBlanc: { x: 360, y: 106, w: 32, h: 12 }, rappelBlanc: { x: 440, y: 220, w: 24, h: 2 },
      clicBlanc: { x: 500, y: 112 }, clicGris: { x: 100, y: 328 }
    };
  }
  // Mesures d'un réseau de tracés rendu sur la planche (px de la planche) : segments contre le pilier, points en
  // doublon du tracé existant, bouts près d'un trait de rappel ou d'un texte (galerie coupée puis recousue), degré
  // maximal, composantes connexes (sommet commun exact, ou bout posé exactement sur un segment : pied de T de
  // l'itinéraire), tracés plus courts que 15 px, bouts posés exactement sur le sommet du carrefour.
  const _seg = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const u = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
  };
  const _coupe = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  const _dansPoly = (p, poly) => {
    let d = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) d = !d;
    }
    return d;
  };
  const _pres = (p, r) => p.x >= r.x - 14 && p.x <= r.x + r.w + 14 && p.y >= r.y - 14 && p.y <= r.y + r.h + 14;
  function mesurerReseau(traces, sc) {
    const out = { n: traces.length, pilier: 0, doublons: 0, coupes: 0, degreMax: 0, composantes: 0, courts: 0,
                  raccordExact: 0 };
    const cle = p => p.x + "," + p.y, deg = new Map();
    const ex = sc.existant.points;
    traces.forEach(t => {
      const P = t.points;
      let L = 0;
      for (let i = 1; i < P.length; i++) {
        L += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
        for (let k = 0; k < sc.pilier.length; k++) {
          if (_coupe(P[i - 1], P[i], sc.pilier[k], sc.pilier[(k + 1) % sc.pilier.length])) out.pilier++;
        }
        if (_dansPoly(P[i], sc.pilier)) out.pilier++;
        // doublon : points denses à moins de 4 px de l'existant, hors approche d'un bout accroché (8 px)
        const n = Math.max(1, Math.ceil(Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y)));
        for (let s = 0; s <= n; s++) {
          const q = { x: P[i - 1].x + (P[i].x - P[i - 1].x) * s / n, y: P[i - 1].y + (P[i].y - P[i - 1].y) * s / n };
          if (Math.hypot(q.x - P[0].x, q.y - P[0].y) <= 8 || Math.hypot(q.x - P[P.length - 1].x,
            q.y - P[P.length - 1].y) <= 8) continue;
          if (_seg(q, ex[0], ex[1]) < 4) out.doublons++;
        }
      }
      if (L < 15) out.courts++;
      [P[0], P[P.length - 1]].forEach(b => {
        if ([sc.rappelGris, sc.rappelBlanc, sc.texteGris, sc.texteBlanc].some(r => _pres(b, r))) out.coupes++;
        if (b.x === sc.carrefour.x && b.y === sc.carrefour.y) out.raccordExact++;
      });
      P.forEach((p, i) => {
        const k = cle(p);
        deg.set(k, (deg.get(k) || 0) + (i === 0 || i === P.length - 1 ? 1 : 2));
      });
    });
    deg.forEach(v => { if (v > out.degreMax) out.degreMax = v; });
    // composantes : tracés rendus + existant ; lien = sommet commun exact ou bout exactement sur un segment
    const tous = traces.map(t => t.points).concat([ex]);
    const par = tous.map((_, i) => i), rac = i => par[i] === i ? i : (par[i] = rac(par[i]));
    const touche = (A, B) => {
      const sa = new Set(A.map(cle));
      if (B.some(p => sa.has(cle(p)))) return true;
      const bouts = [A[0], A[A.length - 1]], boutsB = [B[0], B[B.length - 1]];
      for (let i = 1; i < B.length; i++) if (bouts.some(b => _seg(b, B[i - 1], B[i]) < 0.06)) return true;
      for (let i = 1; i < A.length; i++) if (boutsB.some(b => _seg(b, A[i - 1], A[i]) < 0.06)) return true;
      return false;
    };
    for (let i = 0; i < tous.length; i++) for (let j = i + 1; j < tous.length; j++) {
      if (touche(tous[i], tous[j])) par[rac(i)] = rac(j);
    }
    out.composantes = new Set(tous.map((_, i) => rac(i))).size;
    return out;
  }
  sceneGaleries.mesurerReseau = mesurerReseau;
  racine.sceneGaleries = sceneGaleries;
  if (typeof module !== "undefined" && module.exports) module.exports = sceneGaleries;
})(typeof window !== "undefined" ? window : globalThis);
