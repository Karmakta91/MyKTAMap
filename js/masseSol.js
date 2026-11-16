/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// masseSol.js — sol d'une masse au sol (zone `masse-sol`), une seule règle pour la vue 3D, la fiche de la carte et
// l'itinéraire.
// Expose window.KtaMasseSol :
//   PAS (m, maille des maillages et des morceaux de ruban), PENTE (tan 30°, seuil de raideur lisible) ;
//   sol(m, x, z) → sol (m, signé comme m.H) en un point du contour ; m = { ring, H, rampes } ;
//   atteinte(m) → hauteur la plus haute (ou profondeur la plus basse) que le sol atteint dans la zone (signée) ;
//   anneau(points, sc) → contour en m, sens positif (celui de vue3d.js > _anneau) ;
//   masse(zone, sc, H) → { ring, H, rampes, ouverts: [] } | null (les 4e et 5e paramètres d'avant sont ignorés) ;
//   masseCarte(zone) → { m, h, sc } d'après la hauteur du niveau (fiche, itinéraire : pathfinder.js > _masseDuPlan) ;
//   atteinteZone(zone) → { atteinte, H } (m, signés) ;
//   rampesValides(zone) → indices des bords bas (`zone.rampes` = [{ bord, fin? }], un bord au plus une fois) ;
//   suivreBords(zone, op, i, n) → les rampes suivent leur segment quand le contour change d'indices ;
//   rampes(zone, sc) → [{ bord, ax, az, bx, bz, nx, nz, L, fin }] (m) ;
//   chevrons(zone, sc) → [[{ x, y }…]] (px du plan) : chevrons de pente et marque de fin.
// ⚠️ contrat (décision produit, révision du 15/11/2026, docs/ETUDE_REMBLAIS.md) : SANS rampe, la masse est à pleine
// hauteur du cran partout (sol = H dans tout le contour), ses bords sont des FRONTS verticaux (vue3d.js >
// _masseBloque : monter bloqué, descendre = chute). Une RAMPE monte linéairement de son bord bas (0) jusqu'à sa fin
// (|H|) puis reste plate au cran : fin = projection de `fin` ({ x, y } px du plan, facultative) sur l'axe
// perpendiculaire
// au bord bas, sinon le point du contour le plus loin dans cet axe. Le sol est le MINIMUM des profils de toutes les
// rampes, plafonné au cran (on monte par n'importe laquelle) ; négatif : la même chose en descente.
// La vue 3D (vue3d.js > _masseDe, _solMasseDe), la fiche (utils.js > _combleHtml) et l'itinéraire lisent ces
// fonctions, jamais une copie. Garde-fou : scripts/smoke/checkup-vue-3d.js > sectionMasseSol, check-masse-sol.js.
(function () {
  "use strict";
  const PENTE = Math.tan(30 * Math.PI / 180), PAS = 0.5;

  function _dans(ring, x, z) {
    let r = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const p = ring[i], q = ring[j];
      if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) r = !r;
    }
    return r;
  }

  function sol(m, x, z) {
    const a = Math.abs(m.H);
    if (!m.rampes || !m.rampes.length) return m.H;
    let v = a;
    for (let i = 0; i < m.rampes.length; i++) {
      const r = m.rampes[i], t = ((x - r.ax) * r.nx + (z - r.az) * r.nz) / r.L;
      v = Math.min(v, a * Math.max(0, Math.min(1, t)));
    }
    return m.H < 0 ? -v : v;
  }

  // Sans rampe : le cran. Avec rampes : le plus haut du minimum des profils, sur une grille (au plus ~10 000 points).
  function atteinte(m) {
    if (!m || !m.ring || m.ring.length < 3) return 0;
    if (!m.rampes || !m.rampes.length) return m.H;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    m.ring.forEach(function (q) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]);
    });
    const w = x1 - x0, d = z1 - z0;
    const pas = Math.max(0.02, Math.min(Math.min(w, d) / 40, Math.sqrt(w * d / 10000)));
    let hMax = 0;
    for (let x = x0 + pas / 2; x < x1; x += pas) {
      for (let z = z0 + pas / 2; z < z1; z += pas) {
        if (_dans(m.ring, x, z)) hMax = Math.max(hMax, Math.abs(sol(m, x, z)));
      }
    }
    return m.H < 0 ? -hMax : hMax;
  }

  function anneau(points, sc) {
    const out = [];
    (points || []).forEach(function (p) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const x = p.x / sc, z = p.y / sc, der = out[out.length - 1];
      if (der && Math.abs(der[0] - x) < 1e-6 && Math.abs(der[1] - z) < 1e-6) return;
      out.push([x, z]);
    });
    if (out.length > 2 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-6 &&
        Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
    let aire = 0;
    for (let i = 0, j = out.length - 1; i < out.length; j = i++) aire += out[j][0] * out[i][1] - out[i][0] * out[j][1];
    if (aire < 0) out.reverse();
    return out;
  }

  // Bords bas valides d'une zone (entiers dans [0, nombre de sommets[, chacun une fois), triés.
  function rampesValides(zone) {
    const n = zone && Array.isArray(zone.points) ? zone.points.length : 0, vus = {};
    if (!zone || !Array.isArray(zone.rampes) || n < 3) return [];
    return zone.rampes.map(function (r) { return r && r.bord; }).filter(function (b) {
      if (!Number.isInteger(b) || b < 0 || b >= n || vus[b]) return false;
      vus[b] = true;
      return true;
    }).sort(function (a, b) { return a - b; });
  }

  // ⚠️ contrat : une rampe suit SON segment quand un sommet entre ou sort du contour (n = nombre de points AVANT le
  // changement, i = indice du sommet) ; à appeler à chaque écriture qui décale les indices (ajusterSommets.js,
  // tableEditor.js > dédoublonnage), avant l'entrée ⏪ (qui garde l'objet entier, rampes comprises).
  //   "insere"  : sommet posé à l'indice i, sur le côté i − 1 → i : les bords ≥ i avancent d'un ; le côté coupé garde
  //               sa rampe sur sa première moitié ;
  //   "retire"  : sommet i supprimé : ses deux côtés disparaissent (i − 1 et i, modulo n), leurs rampes avec ; les
  //               bords > i reculent d'un ;
  //   "doublon" : sommet i, confondu avec i − 1, retiré : seul le côté nul i − 1 disparaît ; les bords ≥ i reculent.
  // La fin d'une rampe, en coordonnées du plan, ne bouge pas (décision produit). Rampes vides : champ retiré.
  // → true si `zone.rampes` a changé.
  function suivreBords(zone, op, i, n) {
    if (!zone || !Array.isArray(zone.rampes) || !Number.isInteger(i) || !Number.isInteger(n) || n < 1) return false;
    const avant = JSON.stringify(zone.rampes), out = [];
    zone.rampes.forEach(function (r) {
      if (!r || !Number.isInteger(r.bord)) return;
      let b = r.bord;
      if (op === "insere") {
        if (b >= i) b++;
      } else if (op === "retire") {
        if (b === i || b === (i - 1 + n) % n) return;
        if (b > i) b--;
      } else if (op === "doublon") {
        if (b === (i - 1 + n) % n) return;
        if (b >= i) b--;
      } else return out.push(r);
      out.push(Object.assign({}, r, { bord: b }));
    });
    if (out.length) zone.rampes = out;
    else delete zone.rampes;
    return JSON.stringify(zone.rampes || []) !== avant;
  }

  // Fin d'une rampe (première entrée de ce bord) : { x, y } px du plan, ou null.
  function _fin(zone, b) {
    const e = (zone.rampes || []).filter(function (r) { return r && r.bord === b; })[0];
    const f = e && e.fin;
    return f && Number.isFinite(f.x) && Number.isFinite(f.y) ? { x: f.x, y: f.y } : null;
  }

  // Rampes en mètres : bord bas (sommets b et b + 1 du contour tel qu'il est enregistré), normale tournée vers
  // l'intérieur, longueur L de la montée = projection de la fin sur l'axe (au moins 5 cm), sinon le sommet du contour
  // le plus loin dans cet axe ; `fin` : la fin vient de la donnée.
  function rampes(zone, sc) {
    const ring = anneau(zone && zone.points, sc), out = [];
    if (ring.length < 3) return out;
    rampesValides(zone).forEach(function (b) {
      const P = zone.points, p = P[b], q = P[(b + 1) % P.length];
      if (!p || !q) return;
      const ax = p.x / sc, az = p.y / sc, bx = q.x / sc, bz = q.y / sc, l = Math.hypot(bx - ax, bz - az);
      if (l < 1e-6) return;
      let nx = -(bz - az) / l, nz = (bx - ax) / l;
      if (!_dans(ring, (ax + bx) / 2 + nx * 0.01, (az + bz) / 2 + nz * 0.01)) { nx = -nx; nz = -nz; }
      const f = _fin(zone, b);
      let L = 0;
      if (f) L = Math.max(0.05, (f.x / sc - ax) * nx + (f.y / sc - az) * nz);
      else ring.forEach(function (v) { L = Math.max(L, (v[0] - ax) * nx + (v[1] - az) * nz); });
      if (L > 1e-3) out.push({ bord: b, ax: ax, az: az, bx: bx, bz: bz, nx: nx, nz: nz, L: L, fin: !!f });
    });
    return out;
  }

  // Chevrons de pente d'une zone (carte) : pour chaque rampe, des « ^ » pointés vers le haut de la pente, sur la seule
  // longueur de pente (rangées le long de l'axe, une tous les ~4 m, 1 à 4 ; colonnes le long du bord bas, une tous les
  // ~4 m, 1 à 5), gardés dans le contour ; une rampe à fin a en plus un trait de fin (parallèle au bord bas, à L, pris
  // dans le contour) → polylignes en px du plan.
  function chevrons(zone, sc) {
    const ring = anneau(zone && zone.points, sc), out = [];
    rampes(zone, sc).forEach(function (r) {
      const w = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / w, uz = (r.bz - r.az) / w;
      const nr = Math.max(1, Math.min(4, Math.round(r.L / 4))), nc = Math.max(1, Math.min(5, Math.round(w / 4)));
      const t = Math.max(0.4, Math.min(2.5, Math.min(r.L / nr, w / nc) * 0.6));
      for (let i = 0; i < nr; i++) {
        for (let j = 0; j < nc; j++) {
          const d = r.L * (i + 0.5) / nr, c = w * (j + 0.5) / nc;
          const cx = r.ax + ux * c + r.nx * d, cz = r.az + uz * c + r.nz * d;
          const pts = [
            [cx - ux * t / 2 - r.nx * t / 4, cz - uz * t / 2 - r.nz * t / 4],
            [cx + r.nx * t / 4, cz + r.nz * t / 4],
            [cx + ux * t / 2 - r.nx * t / 4, cz + uz * t / 2 - r.nz * t / 4]
          ];
          if (!pts.every(function (q) { return _dans(ring, q[0], q[1]); })) continue;
          out.push(pts.map(function (q) { return { x: q[0] * sc, y: q[1] * sc }; }));
        }
      }
      if (!r.fin) return;
      // Trait de fin : la parallèle au bord bas à L, morceaux pris dans le contour (40 pas sur toute la largeur de la
      // zone, prolongée de part et d'autre du bord).
      let a0 = Infinity, a1 = -Infinity;
      ring.forEach(function (v) {
        const s = (v[0] - r.ax) * ux + (v[1] - r.az) * uz;
        a0 = Math.min(a0, s); a1 = Math.max(a1, s);
      });
      const k = 40, pt = function (s) { return [r.ax + ux * s + r.nx * r.L, r.az + uz * s + r.nz * r.L]; };
      let cur = null;
      for (let i = 0; i < k; i++) {
        const s0 = a0 + (a1 - a0) * i / k, s1 = a0 + (a1 - a0) * (i + 1) / k, mi = pt((s0 + s1) / 2);
        if (_dans(ring, mi[0], mi[1])) {
          if (!cur) cur = [pt(s0)];
          cur.push(pt(s1));
        } else if (cur) { out.push(cur.map(function (q) { return { x: q[0] * sc, y: q[1] * sc }; })); cur = null; }
      }
      if (cur) out.push(cur.map(function (q) { return { x: q[0] * sc, y: q[1] * sc }; }));
    });
    return out;
  }

  // Masse en mètres. `ouverts` reste vide (plus de talus automatique) ; les 4e et 5e paramètres d'avant (sonde des
  // bords, autres masses) sont ignorés : pathfinder.js les passe encore.
  function masse(zone, sc, H) {
    const ring = anneau(zone && zone.points, sc);
    if (ring.length < 3) return null;
    return { ring: ring, H: H, ouverts: [], fermes: 0, rampes: rampes(zone, sc) };
  }

  // Masse d'une zone de la carte (fiche, itinéraire) : hauteur du niveau (styleResolver.js > ktaMetresComble) →
  // { m, h (hauteur du niveau, m), sc } | null.
  function masseCarte(zone) {
    const sc = (window.APP_CONFIG || {}).scale;
    if (!zone || !(sc > 0) || typeof window.ktaMetresComble !== "function") return null;
    const c = typeof window.ktaCombleZone === "function" ? window.ktaCombleZone(zone) : 0.5;
    const mc = window.ktaMetresComble(zone, Math.max(-1, Math.min(1, c)));
    const m = masse(zone, sc, mc.m);
    return m ? { m: m, h: mc.h, sc: sc } : null;
  }

  // Hauteur atteinte d'une zone de la carte (fiche).
  function atteinteZone(zone) {
    const c = masseCarte(zone);
    return c ? { atteinte: atteinte(c.m), H: c.m.H } : null;
  }

  window.KtaMasseSol = { PENTE: PENTE, PAS: PAS, sol: sol, atteinte: atteinte, anneau: anneau, masse: masse,
    masseCarte: masseCarte, atteinteZone: atteinteZone, rampesValides: rampesValides,
    suivreBords: suivreBords, rampes: rampes,
    chevrons: chevrons };
})();
