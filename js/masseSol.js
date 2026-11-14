/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// masseSol.js — sol d'une masse au sol (zone `masse-sol`), une seule règle pour la vue 3D et la fiche de la carte.
// Expose window.KtaMasseSol :
//   PENTE (tan 30°), PAS (découpe des bords, m), SONDE (m) ;
//   bords(ring, bloque, autres) → { ouverts: [[ax, az, bx, bz]], fermes } : chaque bord découpé par PAS, ouvert
//     seulement s'il donne sur du vide libre (_ferme : sondes courte et longue, contour lui-même, autres masses) ;
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
  const PENTE = Math.tan(30 * Math.PI / 180), PAS = 0.5, SONDE = 0.35, LOIN = 1.2;

  // Segments AB et CD (m) se coupent-ils (intérieurs) ?
  function _coupe(ax, az, bx, bz, cx, cz, dx, dz) {
    const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
    if (Math.abs(d) < 1e-12) return false;
    const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
    const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
  }

  // La sonde (sx, sz) → (lx, lz) recoupe-t-elle le contour lui-même (hors du bord i) ?
  function _recoupe(ring, i, sx, sz, lx, lz) {
    for (let k = 0; k < ring.length; k++) {
      if (k === i) continue;
      const p = ring[k], q = ring[(k + 1) % ring.length];
      if (_coupe(sx, sz, lx, lz, p[0], p[1], q[0], q[1])) return true;
    }
    return false;
  }

  // ⚠️ contrat (décision produit) : un bord est FERMÉ (pas de talus, le sol arrive à plat contre lui, comme contre une
  // paroi) si :
  //   - la sonde courte (SONDE) ou la sonde longue (LOIN, l'écart qu'on laisse entre un contour et un pilier ou un mur
  //     voisin), droit devant, est arrêtée par la règle du pas (`bloque`) ;
  //   - l'une des sondes longues droit devant ou en biais (±45°) recoupe le contour lui-même (une encoche autour d'un
  //     pilier, la zone qui revient) ou, en biais, touche une structure (`bloque.structure`, facultatif : les biais
  //     ne lisent pas les parois des tubes, une vraie extrémité près d'une paroi reste ouverte) ;
  //   - le bout de la sonde courte est dans une autre masse au sol du niveau (`autres`, contours en m : deux masses
  //     jointives forment un seul remblai).
  // Seules les vraies extrémités (le remblai s'arrête dans la galerie libre) restent ouvertes.
  function _ferme(ring, i, cx, cz, nx, nz, bloque, autres) {
    const sx = cx + nx * 0.05, sz = cz + nz * 0.05;
    if (bloque(cx - nx * 0.05, cz - nz * 0.05, cx + nx * SONDE, cz + nz * SONDE)) return true;
    const lx = cx + nx * LOIN, lz = cz + nz * LOIN;
    if (bloque(sx, sz, lx, lz) || _recoupe(ring, i, sx, sz, lx, lz)) return true;
    const c = Math.SQRT1_2, st = typeof bloque.structure === "function" ? bloque.structure : null;
    for (let s = -1; s <= 1; s += 2) {
      const ux = (nx - s * nz) * c, uz = (nz + s * nx) * c, bx = cx + ux * LOIN, bz = cz + uz * LOIN;
      if (_recoupe(ring, i, sx, sz, bx, bz) || (st && st(sx, sz, bx, bz))) return true;
    }
    const ex = cx + nx * SONDE, ez = cz + nz * SONDE;
    return !!(autres && autres.some(function (r) { return _dans(r, ex, ez); }));
  }

  function bords(ring, bloque, autres) {
    const out = { ouverts: [], fermes: 0 };
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      const nx = dz / l, nz = -dx / l, k = Math.max(1, Math.ceil(l / PAS));
      for (let j = 0; j < k; j++) {
        const ax = p[0] + dx * j / k, az = p[1] + dz * j / k;
        const bx = p[0] + dx * (j + 1) / k, bz = p[1] + dz * (j + 1) / k;
        const cx = (ax + bx) / 2, cz = (az + bz) / 2;
        if (_ferme(ring, i, cx, cz, nx, nz, bloque, autres)) out.fermes++;
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
    const sonde = function (ax, az, bx, bz) {
      if (pc && (bx < 0 || bz < 0 || bx * sc > pc.imageWidth || bz * sc > pc.imageHeight)) return true;
      const segs = [[ax * sc, az * sc, bx * sc, bz * sc]];
      if (G && typeof G.zonesBloquent === "function" && G.zonesBloquent(segs, n, undefined, rendu)[0]) return true;
      if (dansStructure(ax, az) || dansStructure(bx, bz)) return true;
      if (rendu === "galerie") return !!(G && (!G.dedans(bx * sc, bz * sc, n) || G.segmentsBloques(segs, n)[0]));
      if (typeof window.ktaSegmentsBloquesParStructure === "function" &&
          window.ktaSegmentsBloquesParStructure(segs, n, true)[0]) return true;
      return !!(rendu === "mixte" && G && G.paroisBloquent(segs, n)[0]);
    };
    // Structures seules (sondes en biais de _ferme) : bout dans une structure, face franchie ; rien en galerie.
    sonde.structure = function (ax, az, bx, bz) {
      if (rendu === "galerie") return false;
      if (dansStructure(bx, bz)) return true;
      return typeof window.ktaSegmentsBloquesParStructure === "function" &&
        !!window.ktaSegmentsBloquesParStructure([[ax * sc, az * sc, bx * sc, bz * sc]], n, true)[0];
    };
    return sonde;
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

  function masse(zone, sc, H, bloque, autres) {
    const ring = anneau(zone && zone.points, sc);
    if (ring.length < 3) return null;
    const b = bords(ring, bloque, autres);
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
    const nv = Number.isInteger(zone.level) ? zone.level : 0;
    const tab = function (f) { try { return typeof f === "function" ? (f() || []) : []; } catch (e) { return []; } };
    const autres = tab(window.getZones).concat(tab(window.getAllEmbeddedZones)).filter(function (z) {
      return z && z.type === "masse-sol" && z.points !== zone.points &&
        (Number.isInteger(z.level) ? z.level : 0) === nv;
    }).map(function (z) { return anneau(z.points, sc); }).filter(function (r) { return r.length >= 3; });
    const m = masse(zone, sc, H, bloqueCarte(zone.level, rendu, sc), autres);
    return m ? { atteinte: atteinte(m), H: H } : null;
  }

  window.KtaMasseSol = { PENTE: PENTE, PAS: PAS, SONDE: SONDE, LOIN: LOIN, bords: bords, sol: sol, atteinte: atteinte,
    bloqueCarte: bloqueCarte, anneau: anneau, masse: masse, atteinteZone: atteinteZone };
})();
