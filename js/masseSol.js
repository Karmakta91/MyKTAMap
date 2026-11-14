/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// masseSol.js — sol d'une masse au sol (zone `masse-sol`), une seule règle pour la vue 3D et la fiche de la carte.
// Expose window.KtaMasseSol :
//   PENTE (tan 30°), PAS (découpe des bords, m), SONDE (m) ;
//   bords(ring, bloque) → { ouverts: [[ax, az, bx, bz]], fermes } : chaque bord découpé par PAS, ouvert si une sonde
//     qui le franchit vers l'extérieur n'est pas arrêtée par `bloque(ax, az, bx, bz)` (m) ;
//   sol(m, x, z) → sol (m, signé comme m.H) en un point du contour ; m = { ring, H, ouverts, pente? } ;
//   atteinte(m) → hauteur la plus haute (ou profondeur la plus basse) que le sol atteint dans la zone (signée) ;
//   bloqueCarte(niveau, rendu, sc) → la sonde de la règle du pas, sans la vue 3D (fiche de la carte) ;
//   anneau(points, sc) → contour en m, sens positif (celui de vue3d.js > _anneau) ;
//   masse(zone, sc, H, bloque) → { ring, H, ouverts, fermes } | null ;
//   atteinteZone(zone) → { atteinte, H } (m, signés) d'après la hauteur du niveau, le rendu choisi du plan et la
//     sonde de la carte ; null sans contour.
// ⚠️ contrat (décision produit, docs/ETUDE_REMBLAIS.md § 6-7) : sol = min(|H|, pente × distance au bord ouvert le plus
// proche), signé comme H ; aucun bord ouvert → |H| partout. `m.pente` (tan, facultatif) : point d'entrée d'une pente
// par zone (rampe), PENTE sinon. La vue 3D (vue3d.js > _masseDe, _solMasseDe) et la fiche (utils.js > _combleHtml)
// lisent ces fonctions, jamais une copie. Garde-fou : scripts/smoke/checkup-vue-3d.js > sectionMasseSol.
(function () {
  "use strict";
  const PENTE = Math.tan(30 * Math.PI / 180), PAS = 0.5, SONDE = 0.35;

  function bords(ring, bloque) {
    const out = { ouverts: [], fermes: 0 };
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const nx = dz / l, nz = -dx / l, k = Math.max(1, Math.ceil(l / PAS));
      for (let j = 0; j < k; j++) {
        const ax = p[0] + dx * j / k, az = p[1] + dz * j / k;
        const bx = p[0] + dx * (j + 1) / k, bz = p[1] + dz * (j + 1) / k;
        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        if (bloque(cx - nx * 0.05, cz - nz * 0.05, cx + nx * SONDE, cz + nz * SONDE)) out.fermes++;
        else out.ouverts.push([ax, az, bx, bz]);
      }
    }
    return out;
  }

  // Distance (m) de (x, z) au bord ouvert le plus proche ; Infinity sans bord ouvert.
  function _distance(ouverts, x, z) {
    let d2 = Infinity;
    for (let i = 0; i < ouverts.length; i++) {
      const s = ouverts[i], dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz;
      const k = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / l2)) : 0;
      const ex = x - s[0] - dx * k, ez = z - s[1] - dz * k;
      d2 = Math.min(d2, ex * ex + ez * ez);
    }
    return Math.sqrt(d2);
  }

  function sol(m, x, z) {
    const a = Math.abs(m.H), d = _distance(m.ouverts, x, z);
    const v = d === Infinity ? a : Math.min(a, (m.pente || PENTE) * d);
    return m.H < 0 ? -v : v;
  }

  function _dans(ring, x, z) {
    let r = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const p = ring[i], q = ring[j];
      if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) r = !r;
    }
    return r;
  }

  // Grille de points dans le contour, plus loin du bord ouvert = plus haut : le plus loin donne
  // l'atteinte. Sans bord ouvert : |H|.
  function atteinte(m) {
    if (!m || !m.ring || m.ring.length < 3) return 0;
    if (!m.ouverts.length) return m.H;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    m.ring.forEach(function (q) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]);
    });
    // Pas : assez fin pour le côté court (une bande étroite), au plus ~10 000 points ; arrêt dès le cran atteint.
    const w = x1 - x0, d = z1 - z0, k = m.pente || PENTE, dCran = Math.abs(m.H) / k;
    const pas = Math.max(0.02, Math.min(Math.min(w, d) / 40, Math.sqrt(w * d / 10000)));
    // Morceaux ouverts qui se suivent sur un même bord fusionnés (même distance, beaucoup moins de segments).
    const segs = [];
    m.ouverts.forEach(function (s) {
      const p = segs[segs.length - 1];
      if (p && Math.abs(p[2] - s[0]) < 1e-9 && Math.abs(p[3] - s[1]) < 1e-9 &&
          Math.abs((p[2] - p[0]) * (s[3] - s[1]) - (p[3] - p[1]) * (s[2] - s[0])) < 1e-9) { p[2] = s[2]; p[3] = s[3]; }
      else segs.push(s.slice());
    });
    let dMax = 0;
    for (let x = x0 + pas / 2; x < x1 && dMax < dCran; x += pas) {
      for (let z = z0 + pas / 2; z < z1 && dMax < dCran; z += pas) {
        if (_dans(m.ring, x, z)) dMax = Math.max(dMax, _distance(segs, x, z));
      }
    }
    const v = Math.min(Math.abs(m.H), k * dMax);
    return m.H < 0 ? -v : v;
  }

  // Sonde de la règle du pas du rendu (mêmes appels que vue3d.js > _bloqueSonde), lue depuis la carte : bout dehors de
  // l'image, zone qui bouche, bout dans une structure du niveau (point dans son contour), galerie (bout dans la roche,
  // paroi), structures (face franchie), mixte (paroi de tube).
  function bloqueCarte(niveau, rendu, sc) {
    const G = window.KtaGalerie, n = Number.isInteger(niveau) ? niveau : undefined;
    const nv = Number.isInteger(niveau) ? niveau : 0;
    const pc = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    const tab = function (f) { try { return typeof f === "function" ? (f() || []) : []; } catch (e) { return []; } };
    const pleines = tab(window.getStructures).concat(tab(window.getAllEmbeddedStructures)).filter(function (s) {
      const lv = Number.isInteger(s && s.level) ? s.level : 0;
      return s && Array.isArray(s.points) && s.points.length >= 3 && lv === nv &&
        !/ligne|^front|^arc$/.test(String(s.type || ""));
    }).map(function (s) { return s.points.map(function (q) { return [q.x / sc, q.y / sc]; }); });
    const dansStructure = function (x, z) { return pleines.some(function (r) { return _dans(r, x, z); }); };
    return function (ax, az, bx, bz) {
      if (pc && (bx < 0 || bz < 0 || bx * sc > pc.imageWidth || bz * sc > pc.imageHeight)) return true;
      const segs = [[ax * sc, az * sc, bx * sc, bz * sc]];
      if (G && typeof G.zonesBloquent === "function" && G.zonesBloquent(segs, n, undefined, rendu)[0]) return true;
      if (dansStructure(ax, az) || dansStructure(bx, bz)) return true;
      if (rendu === "galerie") return !!(G && (!G.dedans(bx * sc, bz * sc, n) || G.segmentsBloques(segs, n)[0]));
      if (typeof window.ktaSegmentsBloquesParStructure === "function" &&
          window.ktaSegmentsBloquesParStructure(segs, n, true)[0]) return true;
      return !!(rendu === "mixte" && G && G.paroisBloquent(segs, n)[0]);
    };
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

  function masse(zone, sc, H, bloque) {
    const ring = anneau(zone && zone.points, sc);
    if (ring.length < 3) return null;
    const b = bords(ring, bloque);
    return { ring: ring, H: H, ouverts: b.ouverts, fermes: b.fermes };
  }

  // Hauteur atteinte d'une zone de la carte (fiche) : hauteur du niveau (styleResolver.js > ktaMetresComble), rendu
  // choisi du plan (mixte sans choix, comme la 3D), sonde de la carte.
  function atteinteZone(zone) {
    const sc = (window.APP_CONFIG || {}).scale;
    if (!zone || !(sc > 0) || typeof window.ktaMetresComble !== "function") return null;
    const c = typeof window.ktaCombleZone === "function" ? window.ktaCombleZone(zone) : 0.5;
    const H = window.ktaMetresComble(zone, Math.max(-1, Math.min(1, c))).m;
    const rendu = (typeof window.getPlanRenduVue3D === "function" && window.getPlanRenduVue3D()) || "mixte";
    const m = masse(zone, sc, H, bloqueCarte(zone.level, rendu, sc));
    return m ? { atteinte: atteinte(m), H: H } : null;
  }

  window.KtaMasseSol = { PENTE: PENTE, PAS: PAS, SONDE: SONDE, bords: bords, sol: sol, atteinte: atteinte,
    bloqueCarte: bloqueCarte, anneau: anneau, masse: masse, atteinteZone: atteinteZone };
})();
