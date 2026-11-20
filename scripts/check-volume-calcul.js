#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// check-volume-calcul.js — le calcul du Volume exploité ne dérive pas.
// Exécute le VRAI js/volumeExploite.js (vm, faux window) et le confronte à un ORACLE : l'algorithme en bandes
// verticales d'avant le découpage par amas, recopié plus bas tel quel (référence de test, jamais servie à l'app).
// - ~100 plans aléatoires à graine fixe (piliers concaves qui se chevauchent, se touchent ou débordent, Comblé,
//   masses au sol de parts mêlées, non exploitées, sols abaissés) : calculerAires ET calculer comparés à 1e-9 de
//   l'emprise du secteur ;
// - quelques cas exacts calculés à la main ;
// - 🔒 falsifications (amas cassé, tranches de masses confondues) dans une copie du fichier → le test doit rougir.
// 🩸 Les booléens de lignes (masseSol, remblai…) suivent le seuil d'arrondi du calcul actuel (1e-9 × secteur) :
// comparés à l'oracle passé par ce même seuil, pas à son « > 0 ».
// Branché au pre-commit (donc en CI). Usage : node scripts/check-volume-calcul.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RACINE = path.join(__dirname, "..");
const SOURCE = fs.readFileSync(path.join(RACINE, "js/volumeExploite.js"), "utf8");
let ok = 0, ko = 0;
function t(nom, cond, detail) {
  if (cond) { ok++; return; }
  ko++;
  console.log("  ❌ " + nom + (detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 300) : ""));
}

// Charge le module réel (ou une copie falsifiée) dans un bac à sable ; → window.KtaVolumeExploite.
function charger(source) {
  const win = { console: { log() {}, warn() {}, error() {} }, I18n: { t: k => k, has: () => false },
    document: { createElement: () => ({}) }, navigator: {} };
  win.window = win;
  vm.runInContext("var window = this; var document = this.document;" + source, vm.createContext(win));
  return win.KtaVolumeExploite;
}

// ── Oracle : volumeExploite.js d'avant le découpage par amas (géométrie, calculer, _masses), tel quel ──
// ⚠️ Référence de test : ne pas « corriger » ce code, il fixe ce que le calcul doit rendre.
function _oracle() {

  const HAUTEUR_DEFAUT = 2.0;   // mètres

  // ── Géométrie pure (coordonnées plan, px) ──────────

  // Contour propre : nombres finis, sans point de fermeture répété ; null sous 3 sommets.
  function _anneau(points) {
    if (!Array.isArray(points)) return null;
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p) continue;
      const x = Number(p.x), y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const d = out[out.length - 1];
      if (d && d.x === x && d.y === y) continue;
      out.push({ x: x, y: y });
    }
    if (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop();
    return out.length >= 3 ? out : null;
  }

  function _boite(r) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    r.forEach(function (p) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    });
    return { x0: x0, x1: x1, y0: y0, y1: y1 };
  }

  function _seCoupent(a, b) {
    return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
  }

  // Arêtes NON verticales (une verticale n'a pas de largeur : elle ne coupe jamais le milieu d'une bande).
  function _aretes(r) {
    const out = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (a.x === b.x) continue;
      out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y,
                 x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x),
                 y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
    }
    return out;
  }

  // x du croisement INTÉRIEUR de deux segments, ou null (parallèles, colinéaires, ou contact en un bout : un bout
  // est déjà un sommet, donc déjà une coupure).
  function _xCroisement(e, f) {
    const rx = e.bx - e.ax, ry = e.by - e.ay;
    const sx = f.bx - f.ax, sy = f.by - f.ay;
    const den = rx * sy - ry * sx;
    if (den === 0) return null;
    const qx = f.ax - e.ax, qy = f.ay - e.ay;
    const t = (qx * sy - qy * sx) / den;
    const u = (qx * ry - qy * rx) / den;
    if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
    return e.ax + t * rx;
  }

  // Coupe verticale d'un contour en x = m (m n'est jamais l'abscisse d'un sommet) → intervalles [y0, y1] triés,
  // disjoints, au sens pair-impair.
  function _coupe(aretes, m) {
    const ys = [];
    for (let i = 0; i < aretes.length; i++) {
      const e = aretes[i];
      if (m <= e.x0 || m >= e.x1) continue;
      ys.push(e.ay + (m - e.ax) * (e.by - e.ay) / (e.bx - e.ax));
    }
    ys.sort(function (a, b) { return a - b; });
    const out = [];
    for (let i = 0; i + 1 < ys.length; i += 2) {
      if (ys[i + 1] > ys[i]) out.push([ys[i], ys[i + 1]]);
    }
    return out;
  }

  function _union(listes) {
    const tous = [];
    listes.forEach(function (l) { l.forEach(function (iv) { tous.push(iv); }); });
    if (!tous.length) return [];
    tous.sort(function (a, b) { return a[0] - b[0]; });
    const out = [[tous[0][0], tous[0][1]]];
    for (let i = 1; i < tous.length; i++) {
      const d = out[out.length - 1];
      if (tous[i][0] <= d[1]) { if (tous[i][1] > d[1]) d[1] = tous[i][1]; }
      else out.push([tous[i][0], tous[i][1]]);
    }
    return out;
  }

  function _inter(a, b) {
    const out = [];
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
      if (hi > lo) out.push([lo, hi]);
      if (a[i][1] < b[j][1]) i++; else j++;
    }
    return out;
  }

  function _longueur(l) {
    let s = 0;
    for (let i = 0; i < l.length; i++) s += l[i][1] - l[i][0];
    return s;
  }

  // ⚠️ Aires en px² : secteur, secteur ∩ ∪piliers, (secteur ∩ ∪remblais) − ∪piliers, et la part de CHAQUE pilier
  // dans le secteur (parPilier, même ordre que `piliers`, 0 pour un pilier hors secteur ou réduit à un contact).
  function calculerAires(secteur, piliers, remblais) {
    const S = _anneau(secteur);
    const res = { secteurPx2: 0, piliersPx2: 0, remblaisPx2: 0, parPilier: (piliers || []).map(function () { return 0; }) };
    if (!S) return res;
    const bS = _boite(S);
    const polys = [{ role: "S", aretes: _aretes(S), b: bS, r: S }];
    (piliers || []).forEach(function (pts, i) {
      const r = _anneau(pts);
      if (!r) return;
      const b = _boite(r);
      if (_seCoupent(b, bS)) polys.push({ role: "P", i: i, aretes: _aretes(r), b: b, r: r });
    });
    (remblais || []).forEach(function (pts) {
      const r = _anneau(pts);
      if (!r) return;
      const b = _boite(r);
      if (_seCoupent(b, bS)) polys.push({ role: "R", aretes: _aretes(r), b: b, r: r });
    });

    // Coupures : sommets + croisements d'arêtes (tous contours confondus), bornées à l'emprise du secteur.
    const xs = [];
    polys.forEach(function (p) { p.r.forEach(function (pt) { if (pt.x >= bS.x0 && pt.x <= bS.x1) xs.push(pt.x); }); });
    const toutes = [];
    polys.forEach(function (p) { p.aretes.forEach(function (e) { if (e.x1 > bS.x0 && e.x0 < bS.x1) toutes.push(e); }); });
    toutes.sort(function (a, b) { return a.x0 - b.x0; });
    for (let i = 0; i < toutes.length; i++) {
      const e = toutes[i];
      for (let j = i + 1; j < toutes.length && toutes[j].x0 < e.x1; j++) {
        const f = toutes[j];
        if (f.y0 > e.y1 || e.y0 > f.y1) continue;
        const x = _xCroisement(e, f);
        if (x !== null && x > bS.x0 && x < bS.x1) xs.push(x);
      }
    }
    xs.push(bS.x0, bS.x1);
    xs.sort(function (a, b) { return a - b; });

    for (let k = 0; k + 1 < xs.length; k++) {
      const w = xs[k + 1] - xs[k];
      if (!(w > 0)) continue;
      const m = (xs[k] + xs[k + 1]) / 2;
      // 🩸 Le milieu d'une bande de largeur ~arrondi peut retomber sur l'abscisse d'un sommet et fausser la parité
      // de sa coupe : l'erreur est bornée par largeur × hauteur, négligeable (~1e-16 de l'emprise).
      let iS = null;
      const cP = [], cR = [], idxP = [];
      for (let p = 0; p < polys.length; p++) {
        const q = polys[p];
        if (m <= q.b.x0 || m >= q.b.x1) continue;
        const c = _coupe(q.aretes, m);
        if (!c.length) continue;
        if (q.role === "S") iS = c;
        else if (q.role === "P") { cP.push(c); idxP.push(q.i); }
        else cR.push(c);
      }
      if (!iS) continue;
      res.secteurPx2 += w * _longueur(iS);
      const uP = _union(cP);
      const sP = _inter(iS, uP);
      res.piliersPx2 += w * _longueur(sP);
      for (let n = 0; n < cP.length; n++) res.parPilier[idxP[n]] += w * _longueur(_inter(iS, cP[n]));
      if (cR.length) {
        const sR = _inter(iS, _union(cR));
        // (S ∩ R) − P = |S ∩ R| − |S ∩ R ∩ P|
        res.remblaisPx2 += w * (_longueur(sR) - _longueur(_inter(sR, uP)));
      }
    }
    return res;
  }

  function _niveauDe(o) {
    return Number.isInteger(o && o.level) ? o.level : 0;
  }

  // ⚠️ Calcul complet, pur. `o` = { secteur, structures, zones, niveau (null = tous), scale (px/m), hauteur (m),
  // estLigne(type), combleDe(zone)? (part d'une masse au sol, window.ktaCombleZone par défaut), nonExploiteeDe(zone)?
  // (window.ktaMasseNonExploitee par défaut) }.
  // → { ok:false, raison:"secteur"|"echelle" } ou { ok:true, …m², m³, % }. Volumes null si la hauteur n'est pas un
  // nombre > 0. Volume exploité = exploité × h − masses non exploitées + sols abaissés ; vide (volume) = (exploité −
  // Comblé) × h − toutes les masses positives (remblai et non exploitée) + sols abaissés ; surfaces inchangées.
  function calculer(o) {
    o = o || {};
    const S = _anneau(o.secteur);
    if (!S) return { ok: false, raison: "secteur" };
    const scale = Number(o.scale);
    if (!Number.isFinite(scale) || scale <= 0) return { ok: false, raison: "echelle" };
    const estLigne = (typeof o.estLigne === "function") ? o.estLigne : function () { return false; };
    const auNiveau = function (x) { return o.niveau === null || o.niveau === undefined || _niveauDe(x) === o.niveau; };

    const piliers = (o.structures || []).filter(function (s) {
      return s && Array.isArray(s.points) && s.points.length >= 3 && !estLigne(s.type) && auNiveau(s);
    }).map(function (s) { return s.points; });
    // Remblais sur plusieurs niveaux : compté sur chacun des siens (poiJonction.js > ktaNiveauxObjet).
    const zoneAuNiveau = function (z) {
      const N = (typeof window !== "undefined") && window.ktaNiveauxObjet;
      if (o.niveau === null || o.niveau === undefined || typeof N !== "function") return auNiveau(z);
      return N(z).indexOf(o.niveau) >= 0;
    };
    const remblais = (o.zones || []).filter(function (z) {
      return z && z.type === "remblais" && Array.isArray(z.points) && z.points.length >= 3 && zoneAuNiveau(z);
    }).map(function (z) { return z.points; });

    const a = calculerAires(S, piliers, remblais);
    const k = scale * scale;
    const masses = (o.zones || []).filter(function (z) {
      return z && z.type === "masse-sol" && Array.isArray(z.points) && z.points.length >= 3 && zoneAuNiveau(z);
    });
    const ms = _masses(S, piliers, remblais, masses, o.combleDe, a.remblaisPx2);
    // Masses non exploitées seules (leurs paliers à elles) : la part retirée de l'exploité. Le reste des masses
    // positives est du remblai ; où les deux se chevauchent, la non exploitée l'emporte (rien compté deux fois).
    const estNe = (typeof o.nonExploiteeDe === "function") ? o.nonExploiteeDe
      : (typeof window !== "undefined" && typeof window.ktaMasseNonExploitee === "function")
        ? window.ktaMasseNonExploitee : function () { return false; };
    const ne = _masses(S, piliers, remblais, masses.filter(function (z) { return estNe(z); }), o.combleDe,
      a.remblaisPx2);
    // Seuil de comptage d'un pilier : un contact par un bord (aire nulle aux arrondis près) ne compte pas.
    const seuilPx2 = 1e-9 * Math.max(1, a.secteurPx2);
    const secteurM2  = a.secteurPx2 / k;
    const piliersM2  = a.piliersPx2 / k;
    const exploiteM2 = secteurM2 - piliersM2;
    const remblaisM2 = Math.max(0, a.remblaisPx2 / k);
    const videM2     = Math.max(0, exploiteM2 - remblaisM2);
    const h = Number(o.hauteur);
    const hOk = Number.isFinite(h) && h > 0;
    // Hauteur équivalente (m² × part) : volume = × h, comme les autres lignes, recalculé tel quel à la saisie.
    const masseEqM2 = ms.massePartPx2 / k, abaisseEqM2 = ms.abaissePartPx2 / k;
    const neEqM2 = ne.massePartPx2 / k;
    const videEqM2 = ms.aucune ? videM2 : videM2 - masseEqM2 + abaisseEqM2;
    // ⚠️ Plan sans masse : volume exploité = exploité × h au bit près (aucune soustraction de zéro).
    const volumeEqM2 = ms.aucune ? exploiteM2 : exploiteM2 - neEqM2 + abaisseEqM2;
    const remblaiEqM2 = Math.max(0, masseEqM2 - neEqM2), remblaiM2 = Math.max(0, (ms.massePx2 - ne.massePx2) / k);
    return {
      ok: true,
      niveau: (o.niveau === undefined) ? null : o.niveau,
      secteurM2: secteurM2,
      piliersM2: piliersM2,
      nbPiliers: a.parPilier.filter(function (v) { return v > seuilPx2; }).length,
      exploiteM2: exploiteM2,
      tauxPct: secteurM2 > 0 ? (exploiteM2 / secteurM2) * 100 : 0,
      hauteurM: hOk ? h : null,
      volumeM3: hOk ? volumeEqM2 * h : null,
      volumeEqM2: volumeEqM2,
      remblaisM2: remblaisM2,
      remblaisM3: hOk ? remblaisM2 * h : null,
      videM2: videM2,
      videM3: hOk ? videEqM2 * h : null,
      videEqM2: videEqM2,
      // Lignes de la fenêtre seulement quand une masse ou un sol abaissé touche le vide du secteur.
      // masse* = toutes les masses positives (retranchées du vide) ; remblai* et nonExploitee* = leur partage.
      masseSol: ms.massePx2 > 0,
      masseM2: ms.massePx2 / k,
      masseEqM2: masseEqM2,
      masseM3: hOk ? masseEqM2 * h : null,
      remblai: remblaiM2 > 0,
      remblaiM2: remblaiM2,
      remblaiEqM2: remblaiEqM2,
      remblaiM3: hOk ? remblaiEqM2 * h : null,
      nonExploitee: ne.massePx2 > 0,
      nonExploiteeM2: ne.massePx2 / k,
      nonExploiteeEqM2: neEqM2,
      nonExploiteeM3: hOk ? neEqM2 * h : null,
      abaisse: ms.abaissePx2 > 0,
      abaisseM2: ms.abaissePx2 / k,
      abaisseEqM2: abaisseEqM2,
      abaisseM3: hOk ? abaisseEqM2 * h : null
    };
  }

  // ⚠️ Masses au sol par PALIERS (docs/ETUDE_REMBLAIS.md § 9) : la part d'une masse (styleResolver.js >
  // ktaCombleZone, la même que la fiche et la 3D) × la hauteur du calcul = sa hauteur, à bords verticaux (talus
  // négligé, dit dans la fenêtre). Parts distinctes triées p1 < p2 < … ; tranche i = union des masses de part ≥ pi,
  // épaisseur pi − pi−1. Aire d'une tranche dans le vide, hors Comblé (le Comblé l'emporte : rien n'est retranché
  // deux fois) : |(S ∩ (R ∪ M)) − P| − |(S ∩ R) − P|, deux appels à calculerAires, exact. Sol abaissé (part < 0) :
  // même calcul sur |part|, volume ajouté. Part ≥ 1 bornée à 1 (au plus la hauteur de galerie).
  function _masses(S, piliers, remblais, zones, combleDe, remblaisPx2) {
    const res = { aucune: true, massePx2: 0, massePartPx2: 0, abaissePx2: 0, abaissePartPx2: 0 };
    const part = (typeof combleDe === "function") ? combleDe
      : (typeof window !== "undefined" && typeof window.ktaCombleZone === "function") ? window.ktaCombleZone : null;
    if (!zones.length || !part) return res;
    res.aucune = false;
    const lues = zones.map(function (z) {
      const c = Number(part(z));
      return { pts: z.points, c: Number.isFinite(c) ? Math.max(-1, Math.min(1, c)) : 0 };
    });
    [1, -1].forEach(function (signe) {
      const ici = lues.filter(function (m) { return m.c * signe > 0; });
      if (!ici.length) return;
      const paliers = Array.from(new Set(ici.map(function (m) { return m.c * signe; }))).sort(function (x, y) {
        return x - y;
      });
      let bas = 0;
      paliers.forEach(function (p, i) {
        const tranche = ici.filter(function (m) { return m.c * signe >= p; }).map(function (m) { return m.pts; });
        const aire = Math.max(0, calculerAires(S, piliers, remblais.concat(tranche)).remblaisPx2 - remblaisPx2);
        if (i === 0) res[signe > 0 ? "massePx2" : "abaissePx2"] = aire;
        res[signe > 0 ? "massePartPx2" : "abaissePartPx2"] += aire * (p - bas);
        bas = p;
      });
    });
    return res;
  }
  return { calculerAires: calculerAires, calculer: calculer };
}
const ORACLE = _oracle();

// ── Plans aléatoires à graine fixe ──
function generateur(graine) {
  let a = graine >>> 0;
  return function () {   // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
// Contour étoilé (concave dès 5 sommets) autour de (cx, cy), rayons dans [r0, r1].
function etoile(rnd, cx, cy, r0, r1, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rnd() * 0.3, r = r0 + rnd() * (r1 - r0);
    pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
  }
  return pts;
}
function rect(x, y, w, h) { return [{ x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }]; }

function planAleatoire(rnd) {
  const secteur = etoile(rnd, 500, 500, 250, 450, 5 + Math.floor(rnd() * 8));
  const structures = [];
  const nP = 5 + Math.floor(rnd() * 40);
  for (let i = 0; i < nP; i++) {
    const cx = 50 + rnd() * 900, cy = 50 + rnd() * 900;
    const pts = rnd() < 0.5 ? rect(cx, cy, 10 + rnd() * 60, 10 + rnd() * 60)
      : etoile(rnd, cx, cy, 5 + rnd() * 10, 20 + rnd() * 40, 3 + Math.floor(rnd() * 7));
    structures.push({ type: "pilier", points: pts });
    if (rnd() < 0.15) {   // pilier qui touche le précédent par un bord (contact sans aire)
      const b = pts.reduce((m, p) => Math.max(m, p.x), -Infinity);
      structures.push({ type: "pilier", points: rect(b, cy, 15, 15) });
    }
  }
  structures.push({ type: "front", points: rect(100, 100, 300, 300) });   // ligne : jamais retranchée
  const zones = [];
  const nR = Math.floor(rnd() * 4);
  for (let i = 0; i < nR; i++) {
    zones.push({ type: "remblais", points: etoile(rnd, 200 + rnd() * 600, 200 + rnd() * 600, 30, 160, 6) });
  }
  const PARTS = [0.25, 0.5, 0.5, 1, 1.5, -0.3, -1, 0.75];
  const nM = Math.floor(rnd() * 6);
  for (let i = 0; i < nM; i++) {
    zones.push({ type: "masse-sol", points: etoile(rnd, 200 + rnd() * 600, 200 + rnd() * 600, 20, 180, 7),
      part: PARTS[Math.floor(rnd() * PARTS.length)], ne: rnd() < 0.35 });
  }
  return { secteur: secteur, structures: structures, zones: zones };
}

function opts(p, h) {
  return { secteur: p.secteur, structures: p.structures, zones: p.zones, niveau: null, scale: 4, hauteur: h,
    estLigne: ty => ty === "front", combleDe: z => z.part, nonExploiteeDe: z => z.ne === true };
}
const piliersDe = p => p.structures.filter(s => s.type !== "front").map(s => s.points);
const remblaisDe = p => p.zones.filter(z => z.type === "remblais").map(z => z.points);

const proche = (a, b, tol) => Math.abs(a - b) <= tol;
const BOOL = { masseSol: o => o.masseM2, remblai: o => o.masseM2 - o.nonExploiteeM2,
  nonExploitee: o => o.nonExploiteeM2, abaisse: o => o.abaisseM2 };

// Compare un module à l'oracle sur N plans ; → liste des écarts (vide = conforme).
function comparer(VE, n) {
  const ecarts = [];
  const rnd = generateur(20261120);
  for (let i = 0; i < n; i++) {
    const p = planAleatoire(rnd);
    const A = VE.calculerAires(p.secteur, piliersDe(p), remblaisDe(p));
    const B = ORACLE.calculerAires(p.secteur, piliersDe(p), remblaisDe(p));
    const tolPx = 1e-9 * Math.max(1, B.secteurPx2);
    ["secteurPx2", "piliersPx2", "remblaisPx2"].forEach(function (k) {
      if (!proche(A[k], B[k], tolPx)) ecarts.push({ plan: i, champ: k, actuel: A[k], oracle: B[k] });
    });
    if (A.parPilier.length !== B.parPilier.length) ecarts.push({ plan: i, champ: "parPilier.length" });
    else B.parPilier.forEach(function (v, j) {
      if (!proche(A.parPilier[j], v, tolPx)) ecarts.push({ plan: i, champ: "parPilier[" + j + "]" });
    });
    const h = 1 + (i % 4);
    const rA = VE.calculer(opts(p, h)), rB = ORACLE.calculer(opts(p, h));
    const tolM = tolPx / 16;   // scale 4 : px² → m²
    Object.keys(rB).forEach(function (k) {
      const vB = rB[k], vA = rA[k];
      if (typeof vB === "number") {
        const tol = /M3$/.test(k) ? tolM * h : tolM;
        if (k === "nbPiliers" || k === "tauxPct") {
          if (!proche(vA, vB, k === "tauxPct" ? 1e-7 : 0)) ecarts.push({ plan: i, champ: k, actuel: vA, oracle: vB });
        } else if (!(typeof vA === "number" && proche(vA, vB, tol))) {
          ecarts.push({ plan: i, champ: k, actuel: vA, oracle: vB });
        }
      } else if (BOOL[k]) {
        const attendu = BOOL[k](rB) > tolM;
        if (vA !== attendu) ecarts.push({ plan: i, champ: k, actuel: vA, attendu: attendu });
      } else if (vA !== vB) {
        ecarts.push({ plan: i, champ: k, actuel: vA, oracle: vB });
      }
    });
  }
  return ecarts;
}

// ── 1. Module réel contre l'oracle ──
const VE = charger(SOURCE);
t("js/volumeExploite.js se charge et expose calculerAires / calculer",
  VE && typeof VE.calculerAires === "function" && typeof VE.calculer === "function");
const N_PLANS = 100;
const ecarts = comparer(VE, N_PLANS);
t(N_PLANS + " plans aléatoires : calculerAires et calculer égaux à l'oracle (1e-9 de l'emprise)",
  ecarts.length === 0, ecarts.slice(0, 5));

// ── 2. Cas exacts, à la main (secteur 100 × 100 px, échelle 1 px/m, hauteur 2 m) ──
{
  const S = rect(0, 0, 100, 100);
  const cas = [
    { nom: "un pilier 10 × 10 dedans", P: [rect(10, 10, 10, 10)], R: [], attendu: { piliersPx2: 100, remblaisPx2: 0 } },
    { nom: "deux piliers décalés de 5 px (union 150, jamais 200)", P: [rect(10, 10, 10, 10), rect(15, 10, 10, 10)],
      R: [], attendu: { piliersPx2: 150 } },
    { nom: "pilier à cheval sur le bord du secteur (moitié dedans)", P: [rect(95, 40, 10, 10)], R: [],
      attendu: { piliersPx2: 50 } },
    { nom: "Comblé 20 × 20 dont un pilier 10 × 10 couvre un quart", P: [rect(30, 30, 10, 10)], R: [rect(30, 30, 20, 20)],
      attendu: { piliersPx2: 100, remblaisPx2: 300 } },
    { nom: "piliers qui se touchent par un bord : aires additionnées", P: [rect(10, 10, 10, 10), rect(20, 10, 10, 10)],
      R: [], attendu: { piliersPx2: 200 } }
  ];
  cas.forEach(function (c) {
    [["module", VE], ["oracle", ORACLE]].forEach(function (m) {
      const a = m[1].calculerAires(S, c.P, c.R);
      const bon = a.secteurPx2 === 10000 && Object.keys(c.attendu).every(k => proche(a[k], c.attendu[k], 1e-9));
      t("cas exact (" + m[0] + ") : " + c.nom, bon, a);
    });
  });
  const r = VE.calculer({ secteur: S, structures: [{ type: "pilier", points: rect(10, 10, 10, 10) }],
    zones: [{ type: "masse-sol", points: rect(50, 50, 20, 20), part: 0.5, ne: true }], niveau: null, scale: 1,
    hauteur: 2, estLigne: () => false, combleDe: z => z.part, nonExploiteeDe: z => z.ne });
  t("cas exact : 10 000 − 100 m², masse non exploitée 400 m² à mi-hauteur → volume 19 800 − 400 = 19 400 m³",
    r.ok && proche(r.exploiteM2, 9900, 1e-9) && proche(r.volumeM3, 19400, 1e-9) && r.nonExploitee === true, r);
}

// ── 3. 🔒 Falsifications : une copie cassée du fichier doit faire rougir la comparaison ──
[
  { nom: "regroupement en amas cassé (piliers qui se chevauchent comptés deux fois)",
    m: ["if (b.y0 <= q.b.y1 && q.b.y0 <= b.y1) pere[racine(i)] = racine(j);", "/* amas cassé */"] },
  { nom: "tranches de masses confondues (toutes lues sur la première)",
    m: ["const aire = Math.max(0, a.groupesPx2[g] - a.remblaisPx2);",
      "const aire = Math.max(0, a.groupesPx2[0] - a.remblaisPx2);"] }
].forEach(function (x) {
  t("motif de falsification présent dans js/volumeExploite.js : " + x.nom, SOURCE.split(x.m[0]).length === 2);
  let rouge = false;
  try { rouge = comparer(charger(SOURCE.replace(x.m[0], x.m[1])), N_PLANS).length > 0; } catch (e) { rouge = true; }
  t("🔒 falsification (" + x.nom + ") : le test le voit", rouge);
});

console.log((ko ? "❌" : "🎉") + " check-volume-calcul : " + ok + " OK, " + ko + " échec(s)" +
  (ko ? "" : " — calcul du volume conforme à l'oracle, falsifications tenues"));
process.exit(ko ? 1 : 0);
