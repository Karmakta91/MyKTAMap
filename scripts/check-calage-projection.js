#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-calage-projection.js — garde-fou pré-commit BLOQUANT du calage A / B (C)
// =====================================================================
// Le VRAI moteur (js/kmzExport.js) tourne en VM, confronté à des vérités FICTIVES calculées ici par une
// géodésie indépendante (ECEF + latitude itérative, pas la formule de Bowring du moteur) et par le Lambert 93
// de js/sigImport.js (ancré par check-lambert93.js) :
//   M. modèle "local" (plan tangent) : relevé terrain sous 1 cm, GeoTIFF Lambert 93 sous 0,5 m, aux coins et
//      sur une grille, plans de 1 et 6 km, 43° / 49°, nord en haut et tourné, 2 et 3 points ; le modèle
//      historique y dépasse 10 m (le test n'est pas vide) ;
//   H. sans `modele`, planToGps / gpsToPlan rendent EXACTEMENT les valeurs figées du modèle historique :
//      aucun plan déjà calé ne bouge ;
//   R. aller-retour planToGps → gpsToPlan sous 1 mm, dans le plan et à 5 km ;
//   G. géodésie : decalerGps, distanceM, metresParDegre contre la vérité indépendante ;
//   S. memesPoints / modeleSaisie / ecartRecalage / precisionCalage ;
//   C. une seule source : 111320 / 110540 / GRS80 nulle part ailleurs dans js/ (sauf les projections de
//      sigImport.js) ; écrivains du calage branchés sur le modèle "local", import KMZ laissé au modèle historique.
// Doc : docs/ETUDE_CALAGE_PROJECTION.md · docs/architecture/vue-osm.md §2.2
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const echecs = [];
function verif(nom, cond, explication) {
  if (cond) { console.log("   ✅ " + nom); return; }
  console.log("   ❌ " + nom);
  echecs.push(nom + "\n     → " + explication);
}

const ctx = { console: { log() {}, warn() {}, error() {} }, I18n: { t: (k) => k }, Math, JSON, Number, Error,
              Object, Array, String, isFinite };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["js/kmzExport.js", "js/sigImport.js"]) {
  try { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); }
  catch (e) { console.error("❌ [check-calage-projection] " + f + " : " + e.message); process.exit(1); }
}
const KE = ctx.KmzExport, L93 = ctx.SigImport && ctx.SigImport.L93;
if (!KE || !KE.buildTransformCalib || !KE.MODELE_LOCAL || !L93) {
  console.error("❌ [check-calage-projection] KmzExport (avec MODELE_LOCAL) ou SigImport.L93 absent."); process.exit(1);
}

// ── Vérité indépendante (GRS80) ──
const D = Math.PI / 180, A = 6378137, F = 1 / 298.257222101, E2 = F * (2 - F);
const Nr = (p) => A / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
function ecef(lat, lng) {
  const p = lat * D, l = lng * D, N = Nr(p);
  return [N * Math.cos(p) * Math.cos(l), N * Math.cos(p) * Math.sin(l), N * (1 - E2) * Math.sin(p)];
}
function geod(X, Y, Z) {
  const pp = Math.hypot(X, Y);
  let p = Math.atan2(Z, pp * (1 - E2));
  for (let k = 0; k < 12; k++) p = Math.atan2(Z + E2 * Nr(p) * Math.sin(p), pp);
  return { lat: p / D, lng: Math.atan2(Y, X) / D };
}
const dist = (a, b) => { const p = ecef(a.lat, a.lng), q = ecef(b.lat, b.lng);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
// Plan tangent au centre (relevé en vraies distances) : point du plan → normale → ellipsoïde.
function sol(lat0, lng0) {
  const p = lat0 * D, l = lng0 * D, O = ecef(lat0, lng0);
  const E = [-Math.sin(l), Math.cos(l), 0], N = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)];
  return { fwd: () => null, inv: (x, y) => geod(O[0] + x * E[0] + y * N[0], O[1] + x * E[1] + y * N[1],
                                                 O[2] + x * E[2] + y * N[2]), c: { X: 0, Y: 0 } };
}
function lambert(lat0, lng0) {
  const c = L93.versL93(lat0, lng0);
  return { inv: (x, y) => L93.versWgs84(x, y), c: { X: c.x, Y: c.y } };
}
// Pixel 0,25 m, carré de côté L, tourné de rot ; nord = vrai nord (SOL) ou nord de la grille (L93).
function verite(base, L, rot) {
  const W = Math.round(L / 0.25), H = W, r = rot * D;
  return { W, H, f: (x, y) => { const u = (x - W / 2) * 0.25, v = -(y - H / 2) * 0.25;
    return base.inv(base.c.X + u * Math.cos(r) - v * Math.sin(r), base.c.Y + u * Math.sin(r) + v * Math.cos(r)); } };
}
function pireEcart(T, cal) {
  const t = KE.buildTransformCalib(cal);
  let m = 0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const x = i / 8 * T.W, y = j / 8 * T.H; m = Math.max(m, dist(KE.planToGps(t, x, y), T.f(x, y)));
  }
  return m;
}
function calage(T, nb, modele) {
  const pt = (x, y) => Object.assign({ x, y }, T.f(x, y));
  const c = { pointA: pt(0, T.H), pointB: pt(T.W, 0) };
  if (nb === 3) c.pointC = pt(0, 0);
  if (modele) c.modele = modele;
  return c;
}

// ── M. Exactitude du modèle local ──
console.log("\n📐 M. Modèle local contre des vérités fictives");
{
  let pireSol = 0, pireL93 = 0, pireHist = 0;
  for (const lat of [43, 49]) for (const L of [1000, 6000]) for (const rot of [0, 30]) for (const nb of [2, 3]) {
    const tSol = verite(sol(lat, 3), L, rot), tL93 = verite(lambert(lat, 7), L, rot);
    pireSol = Math.max(pireSol, pireEcart(tSol, calage(tSol, nb, KE.MODELE_LOCAL)));
    pireL93 = Math.max(pireL93, pireEcart(tL93, calage(tL93, nb, KE.MODELE_LOCAL)));
    if (L === 6000 && nb === 2 && rot === 0) pireHist = Math.max(pireHist, pireEcart(tSol, calage(tSol, 2)));
  }
  verif("M1. relevé terrain, modèle local : < 1 cm partout (" + pireSol.toFixed(4) + " m)", pireSol < 0.01,
    "le plan tangent doit reproduire un relevé en vraies distances : la géodésie du moteur a dérivé.");
  verif("M2. GeoTIFF Lambert 93, modèle local : < 0,5 m à 6 km (" + pireL93.toFixed(3) + " m)", pireL93 < 0.5,
    "objectif du lot : coins d'un GeoTIFF importé à moins de 1 m (0,33 m mesuré par l'étude).");
  verif("M3. le modèle historique dépasse 10 m sur ces cas (" + pireHist.toFixed(1) + " m) : le test n'est pas vide",
    pireHist > 10, "si le modèle historique devient exact, c'est qu'il a changé : il doit rester bit à bit.");
}

// ── H. Modèle historique figé ──
console.log("\n🧊 H. Sans `modele`, le calcul historique rend les mêmes nombres, bit à bit");
{
  const FIGE = [
    { cal: { pointA: { x: 120, y: 3880, lat: 43, lng: 3 }, pointB: { x: 3900, y: 150, lat: 43.0135, lng: 3.0252 } },
      p: [[0, 0, 43.01665672347361, 3.002702358181831], [4000, 0, 43.014076445967575, 3.025911622170655],
          [0, 4000, 42.999564646001005, 2.999198609623588], [4000, 4000, 42.996984368494964, 3.0224078736124116],
          [2000, 2000, 43.00682054598429, 3.012555115897121], [-8000, 9000, 42.98336010417232, 2.9484003959481373]],
      inv: [43.01, 2.98, -3595.5174307508382, 2100.641463924845] },
    { cal: { pointA: { x: 300, y: 2700, lat: 49, lng: 7 }, pointB: { x: 3600, y: 400, lat: 49.00845, lng: 7.02631 },
             pointC: { x: 3500, y: 2800, lat: 48.9984, lng: 7.0256 } },
      p: [[0, 0, 49.01145832249676, 6.99749923276983], [4000, 0, 49.009983680104035, 7.029494551365409],
          [0, 4000, 48.994646879063716, 6.997649037711313], [4000, 4000, 48.99317223667099, 7.029644356306892],
          [2000, 2000, 49.002315279583875, 7.013571794538361], [-8000, 9000, 48.97658185955786, 6.93384565669701]],
      inv: [49.01, 6.98, -2190.248281840083, 539.1043898235772] }
  ];
  let diff = [];
  FIGE.forEach((c, k) => {
    const t = KE.buildTransformCalib(c.cal);
    c.p.forEach((q) => { const g = KE.planToGps(t, q[0], q[1]);
      if (g.lat !== q[2] || g.lng !== q[3]) diff.push("cas " + k + " (" + q[0] + ", " + q[1] + ")"); });
    const r = KE.gpsToPlan(t, c.inv[0], c.inv[1]);
    if (r.x !== c.inv[2] || r.y !== c.inv[3]) diff.push("cas " + k + " gpsToPlan");
    if (t.modele) diff.push("cas " + k + " : transform marqué " + t.modele);
  });
  verif("H1. 2 points et 3 points, dans et hors du plan, aller et retour : nombres identiques", diff.length === 0,
    diff.join(", ") + ". Un plan sans `modele` doit se calculer comme avant au bit près : sinon ses objets bougent.");
  const inconnu = KE.buildTransformCalib(Object.assign({}, FIGE[0].cal, { modele: "autre" }));
  verif("H2. un `modele` inconnu retombe sur le modèle historique",
    !inconnu.modele && KE.planToGps(inconnu, 0, 0).lat === FIGE[0].p[0][2],
    "seule la valeur \"local\" change de modèle.");
}

// ── R. Aller-retour ──
console.log("\n🔁 R. Aller-retour du modèle local");
{
  const T = verite(sol(46.5, 3), 3000, 23);
  let pire = 0;
  for (const nb of [2, 3]) {
    const t = KE.buildTransformCalib(calage(T, nb, KE.MODELE_LOCAL));
    for (const q of [[0, 0], [T.W, T.H], [T.W / 2, T.H / 3], [-20000, -20000], [T.W + 20000, -20000]]) {
      const g = KE.planToGps(t, q[0], q[1]), r = KE.gpsToPlan(t, g.lat, g.lng);
      pire = Math.max(pire, Math.hypot(r.x - q[0], r.y - q[1]) * t.metresParPixel);
    }
  }
  verif("R1. planToGps → gpsToPlan sous 1 mm, dans le plan et à 5 km (" + (pire * 1000).toFixed(4) + " mm)",
    pire < 0.001, "gpsToPlan doit être l'inverse exact de planToGps (import GPX, coordonnée collée, SIG).");
}

// ── G. Géodésie exposée ──
console.log("\n🌐 G. Géodésie exposée par le moteur");
{
  const a = { lat: 45, lng: 2 };
  const e = KE.decalerGps(a.lat, a.lng, 1000, 0), n = KE.decalerGps(a.lat, a.lng, 0, 1000);
  verif("G1. decalerGps : 1 000 m à l'est et au nord tombent à 1 000 m (± 1 mm), cap respecté",
    Math.abs(dist(a, e) - 1000) < 1e-3 && Math.abs(dist(a, n) - 1000) < 1e-3 &&
    Math.abs(n.lng - a.lng) < 1e-12 && e.lng > a.lng,
    "est " + dist(a, e) + " m, nord " + dist(a, n) + " m.");
  const z = KE.decalerGps(a.lat, a.lng, 0, 0);
  verif("G2. decalerGps(0, 0) rend le point lui-même",
    Math.abs(z.lat - a.lat) < 1e-12 && Math.abs(z.lng - a.lng) < 1e-12,
    JSON.stringify(z));
  const k = KE.metresParDegre(45), h = 1e-4;
  const kLat = dist({ lat: 45, lng: 2 }, { lat: 45 + h, lng: 2 }) / h;
  const kLng = dist({ lat: 45, lng: 2 }, { lat: 45, lng: 2 + h }) / h;
  verif("G3. metresParDegre(45°) = dérivée mesurée (" + k.lat.toFixed(1) + " / " + k.lng.toFixed(1) + " m)",
    Math.abs(k.lat / kLat - 1) < 1e-5 && Math.abs(k.lng / kLng - 1) < 1e-5, "rayons de l'ellipsoïde faux.");
  verif("G4. distanceM = corde ECEF indépendante", Math.abs(KE.distanceM(a, e) - dist(a, e)) < 1e-6,
    "distanceM dérive.");
}

// ── S. Règles de saisie et précision ──
console.log("\n🧾 S. Modèle d'un calage enregistré, recalage, précision");
{
  const T = verite(sol(46.5, 3), 1000, 0);
  const hist = calage(T, 2), loc = calage(T, 2, KE.MODELE_LOCAL);
  const bouge = JSON.parse(JSON.stringify(hist)); bouge.pointB.lat += 1e-5;
  const avecC = calage(T, 3);
  verif("S1. memesPoints : même calage, resaisie près ; un point bougé ou un C ajouté = autre calage",
    KE.memesPoints(hist, loc) && !KE.memesPoints(hist, bouge) && !KE.memesPoints(hist, avecC) &&
    !KE.memesPoints(null, hist),
    "la comparaison décide si un plan déjà calé change de modèle.");
  verif("S2. modeleSaisie : même calage historique → rien (null) ; nouveau ou modifié → \"local\"",
    KE.modeleSaisie(hist, JSON.parse(JSON.stringify(hist))) === null && KE.modeleSaisie(hist, bouge) === "local" &&
    KE.modeleSaisie(null, hist) === "local" && KE.modeleSaisie(loc, JSON.parse(JSON.stringify(hist))) === "local",
    "réenregistrer sans rien changer ne doit pas déplacer les objets ; tout nouveau calage est exact.");
  const ec = KE.ecartRecalage(hist, T.W, T.H), pH = KE.precisionCalage(hist, T.W, T.H);
  const pL = KE.precisionCalage(loc, T.W, T.H);
  verif("S3. ecartRecalage d'un plan de 1 km : l'erreur historique (2 à 3 m mesurés), annoncée aux coins (" +
    (ec || 0).toFixed(2) + " m)", ec > 1.5 && ec < 4 && pH && pH.modele === "historique" && pH.ecartM === ec,
    "le recalage doit annoncer le déplacement réel avant d'appliquer.");
  verif("S4. precisionCalage local < 1 cm (" + (pL ? pL.ecartM.toExponential(1) : "?") + " m)",
    pL && pL.modele === "local" && pL.ecartM < 0.01, "le plan tangent ne limite pas la précision à cette taille.");
}

// ── C. Une seule source, écrivains branchés ──
console.log("\n🔌 C. Constantes à un seul endroit, écrivains du calage");
{
  const fichiers = fs.readdirSync("js").filter((f) => f.endsWith(".js")).map((f) => path.join("js", f));
  const hors = [];
  for (const f of fichiers) {
    const src = fs.readFileSync(f, "utf8"), nom = f.replace(/\\/g, "/");
    if (nom !== "js/kmzExport.js" && /111[ _]?320|110[ _]?540/.test(src)) hors.push(nom + " (111320 / 110540)");
    if (nom !== "js/kmzExport.js" && nom !== "js/sigImport.js" && /6378137|298\.257222101/.test(src)) {
      hors.push(nom + " (GRS80)");
    }
  }
  verif("C1. constantes de conversion degrés ⇄ mètres seulement dans le moteur", hors.length === 0,
    hors.join(", ") + ". Passer par KmzExport.metresParDegre / decalerGps / distanceM (ou EQUI_HISTORIQUE).");
  const lire = (f) => fs.readFileSync(f, "utf8");
  const branches = [
    ["js/createConf.js", /modeleSaisie\(_plannerGeorefCharge/],
    ["js/interfaceConfig.js", /modeleSaisie\(_ancien, c\)/],
    ["js/interfaceConfig.js", /ecartRecalage\(/],
    ["js/interfaceConfig.js", /precisionCalage\(/],
    ["js/sessionExporter.js", /modeleSaisie\(saved, calib\)/],
    ["js/sigImport.js", /(MODELE_LOCAL[\s\S]*){3}/],
    ["js/gpxImport.js", /MODELE_LOCAL[\s\S]*modele:\s+window\.KmzExport\.MODELE_LOCAL/],
    ["js/tiffGeoref.js", /modele: "local"/],
    ["js/config.js", /KE\.decalerGps\(/],
    ["js/main.js", /_accorderModeleCalage\(planId, dejaLa, georef\)/]
  ].filter(([f, re]) => !re.test(lire(f))).map(([f]) => f);
  verif("C2. Générateur, Réglages, modale KMZ, import SIG / GPX / GeoTIFF, estimation de B, propagation",
    !branches.length,
    "non branché : " + branches.join(", ") + ".");
  verif("C3. \"local\" de tiffGeoref.js = KmzExport.MODELE_LOCAL", KE.MODELE_LOCAL === "local",
    "tiffGeoref.js écrit la valeur en clair : la garder égale à la constante du moteur.");
  verif("C4. l'import KMZ garde le modèle historique (LatLonBox linéaire en degrés, décision produit)",
    !/modele/.test(lire("js/kmzImport.js").replace(/\/\/.*$/gm, "")) && /EQUI_HISTORIQUE/.test(lire("js/kmzImport.js")),
    "js/kmzImport.js ne doit ni écrire `modele` ni recopier les constantes.");
}

if (echecs.length) {
  console.error("\n❌ [check-calage-projection] " + echecs.length + " échec(s) :\n  " + echecs.join("\n  "));
  process.exit(1);
}
console.log("\n🎉 calage : modèle local exact, modèle historique figé, une seule source");
