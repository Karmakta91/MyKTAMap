#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-export-sig.js — garde-fou pré-commit BLOQUANT des exports GeoTIFF et GeoJSON
// =====================================================================
// Les VRAIS modules tournent en VM (sigImport, tiffGeoref, kmzExport, styleResolver, geotiffExport,
// geojsonExport). Aucune valeur attendue recopiée : l'écriture est relue par NOTRE lecteur
// (js/tiffGeoref.js), le calage est confronté aux points GPS d'origine reprojetés par SigImport.L93.
//   T. fichier TIFF : en-tête, IFD trié, tuiles 256 (pavage, offsets dans le fichier, sans chevauchement),
//      pixels relus à l'identique en brut ET en Deflate + prédicteur, ordre d'écriture par blocs ;
//   G. GeoKeys (2154 projeté / 4326 géographique, PixelIsArea) ;
//   C. calage : les points A, B, C du calage retombent à < 1 m, les 4 coins relus aussi ; plan nord en
//      haut → tiepoint + pixelscale relu par l'IMPORT de l'app ; plan tourné → matrice, RÉIMPORTÉE (A, B,
//      C, coins à < 1 m) ; la même matrice cisaillée est refusée ;
//   J. GeoJSON : familles, filtres et niveaux du KMZ, couleurs résolues, anneaux fermés, Lambert 93 avec
//      `crs`, WGS84 conforme RFC 7946 (sans `crs`, [lng, lat]) ;
//   B. branchements : index.html, précache sw.js, tuiles du lanceur, clés i18n fr/en/es.
// 🩸 Ce qui casse en silence : un tag hors ordre (GDAL avertit, d'autres lecteurs ignorent la suite), le
// prédicteur à cheval sur les tuiles (image qui « bave »), des offsets rangés dans l'ordre d'index alors
// que les tuiles sont écrites par bloc (mosaïque mélangée), le `crs` oublié (QGIS lit des degrés).
// =====================================================================

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const echecs = [];
function verif(nom, cond, explication) {
  if (cond) { console.log("   ✅ " + nom); return; }
  console.log("   ❌ " + nom);
  echecs.push(nom + "\n     → " + explication);
}

const ctx = {
  console: { log() {}, warn() {}, error() {} },
  I18n: { t: (k) => k, has: () => false },
  Blob, Response, CompressionStream, DecompressionStream,
  Uint8Array, Uint8ClampedArray, ArrayBuffer, DataView, Math, JSON, Promise, Error, Date, Set, Map,
  isFinite, Number, Array, String, Object, RegExp
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ["js/sigImport.js", "js/tiffGeoref.js", "js/kmzExport.js", "js/styleResolver.js",
                 "js/geotiffExport.js", "js/geojsonExport.js"]) {
  try { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); }
  catch (e) { console.error("❌ [check-export-sig] " + f + " n'a pas pu être chargé : " + e.message); process.exit(1); }
}
const L93 = ctx.SigImport && ctx.SigImport.L93, TG = ctx.TiffGeoref, KE = ctx.KmzExport;
const GT = ctx.GeotiffExport, GJ = ctx.GeojsonExport;
if (!L93 || !TG || !KE || !GT || !GT._interne || !GJ) {
  console.error("❌ [check-export-sig] un module n'expose pas son API (SigImport.L93, TiffGeoref, KmzExport, " +
                "GeotiffExport._interne, GeojsonExport)."); process.exit(1);
}
const I = GT._interne;

// Distance au sol (m) entre deux points WGS84 proches : celle du moteur du calage (corde de l'ellipsoïde,
// vérifiée par check-calage-projection.js), pas les constantes du modèle historique.
function distM(a, b) { return KE.distanceM(a, b); }

(async function () {
  // ── T. Le fichier TIFF ──────────────────────────────────────────────────
  console.log("\n🗂️ Écriture TIFF tuilée, relue par js/tiffGeoref.js");
  const W = 300, H = 270;                       // 2 × 2 tuiles, les deux de bord partielles
  const src = new Uint8Array(W * H * 4);
  let graine = 7;
  for (let i = 0; i < W * H; i++) {
    graine = (graine * 1103515245 + 12345) & 0x7fffffff;
    const x = i % W, y = (i / W) | 0;
    src[i * 4] = x & 0xff; src[i * 4 + 1] = y & 0xff; src[i * 4 + 2] = (graine >> 16) & 0xff; src[i * 4 + 3] = 255;
  }
  const geoTest = { pixelScale: [0.5, 0.5, 0], tiepoint: [0, 0, 0, 700000, 6600000, 0] };

  function lireIfdBrut(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const off = dv.getUint32(4, true), nb = dv.getUint16(off, true), tags = [];
    for (let i = 0; i < nb; i++) tags.push(dv.getUint16(off + 2 + i * 12, true));
    return { off: off, tags: tags, magic: dv.getUint16(2, true), ordre: String.fromCharCode(u8[0], u8[1]) };
  }
  function pixelsIdentiques(rgba) {
    for (let p = 0; p < W * H; p++) {
      for (let c = 0; c < 3; c++) if (rgba[p * 4 + c] !== src[p * 4 + c]) return "pixel " + p + " canal " + c;
    }
    return "";
  }

  for (const compresser of [false, true]) {
    const nom = compresser ? "Deflate + prédicteur" : "brut";
    let u8 = null, ifd = null, img = null, boum = null;
    try {
      u8 = await I.ecrireTiff(src, W, H, 4, { compresser: compresser, epsg: 2154, geo: geoTest });
      ifd = TG._interne.lireIfd0(u8.buffer);
      img = await TG._interne.decoderPixels(u8.buffer, ifd);
    } catch (e) { boum = e; }
    const brut = u8 ? lireIfdBrut(u8) : null;
    verif("T1 (" + nom + "). en-tête « II », 42, IFD en tête du fichier",
      !boum && brut.ordre === "II" && brut.magic === 42 && brut.off === 8,
      boum ? boum.message : JSON.stringify(brut));
    verif("T2 (" + nom + "). tags strictement croissants",
      brut && brut.tags.every((t, i) => i === 0 || t > brut.tags[i - 1]),
      "ordre lu : " + (brut && brut.tags.join(",")) + ". La norme l'exige ; GDAL avertit, d'autres lecteurs s'arrêtent.");
    const tg = ifd ? ifd.tags : {};
    const nTuiles = Math.ceil(W / 256) * Math.ceil(H / 256);
    const offs = tg[324] || [], cnts = tg[325] || [];
    let pavage = offs.length === nTuiles && cnts.length === nTuiles && tg[322][0] === 256 && tg[323][0] === 256;
    const zones = offs.map((o, i) => [o, o + cnts[i]]).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < zones.length; i++) {
      if (zones[i][0] < (brut ? 8 : 0) || zones[i][1] > (u8 ? u8.length : 0)) pavage = false;
      if (i && zones[i][0] < zones[i - 1][1]) pavage = false;
    }
    verif("T3 (" + nom + "). " + nTuiles + " tuiles 256 × 256, dans le fichier, sans chevauchement",
      !boum && pavage, "offsets " + JSON.stringify(offs) + " tailles " + JSON.stringify(cnts));
    verif("T4 (" + nom + "). compression déclarée " + (compresser ? "8 (Deflate) + prédicteur 2" : "1 (aucune)"),
      tg[259] && tg[259][0] === (compresser ? 8 : 1) && (compresser ? tg[317] && tg[317][0] === 2 : !tg[317]),
      "259=" + tg[259] + " 317=" + tg[317]);
    const diff = img ? pixelsIdentiques(img.rgba) : "non décodé";
    verif("T5 (" + nom + "). pixels relus À L'IDENTIQUE (tuiles de bord comprises)",
      !boum && img.width === W && img.height === H && diff === "",
      (boum ? boum.message : diff) + ". Une tuile de bord mal complétée ou un prédicteur à cheval décale l'image.");
  }

  // T6. Ordre d'écriture par blocs (generer) : tuiles écrites dans un ordre ≠ index, offsets réécrits.
  {
    let ok = false, detail = "";
    try {
      const nx = Math.ceil(W / 256), ny = Math.ceil(H / 256), tuiles = [];
      for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
        tuiles.push(I.extraireTuile(src, W, H, 4, tx * 256, ty * 256));
      }
      const ordre = [3, 1, 0, 2];
      const tete = I.entete({ w: W, h: H, compression: 1, epsg: 4326, geo: geoTest,
                              octetsTuiles: tuiles.map(u => u.length) });
      I.reecrireOffsets(tete, I.offsetsDansLOrdre(tete.length, tuiles.map(u => u.length), ordre));
      const total = tete.length + tuiles.reduce((s, u) => s + u.length, 0);
      const out = new Uint8Array(total);
      out.set(tete, 0);
      let o = tete.length;
      ordre.forEach(n => { out.set(tuiles[n], o); o += tuiles[n].length; });
      const ifd = TG._interne.lireIfd0(out.buffer);
      const img = await TG._interne.decoderPixels(out.buffer, ifd);
      detail = pixelsIdentiques(img.rgba);
      ok = detail === "";
    } catch (e) { detail = e.message; }
    verif("T6. tuiles écrites dans l'ordre des blocs : offsets réécrits, image intacte",
      ok, detail + ". generer() écrit les tuiles bloc par bloc ; un offset rangé par index mélange la mosaïque.");
  }

  // ── G. GeoKeys ──────────────────────────────────────────────────────────
  console.log("\n🧭 GeoKeys");
  for (const [epsg, cleCrs, modele] of [[2154, 3072, 1], [4326, 2048, 2]]) {
    const gk = I.geoKeys(epsg);
    const cles = {};
    for (let k = 0; k < gk[3]; k++) cles[gk[4 + k * 4]] = gk[4 + k * 4 + 3];
    const lu = TG._interne.epsgDeGeoKeys(gk);
    verif("G (" + epsg + "). lu par l'import : EPSG " + lu + ", clé " + cleCrs + ", modèle " + modele + ", PixelIsArea",
      lu === epsg && cles[cleCrs] === epsg && cles[1024] === modele && cles[1025] === 1 &&
      gk.slice(4).filter((v, i) => i % 4 === 0).every((v, i, a) => i === 0 || v > a[i - 1]),
      JSON.stringify(gk) + " — clés triées par numéro, ProjectedCSTypeGeoKey (3072) pour 2154, " +
      "GeographicTypeGeoKey (2048) pour 4326.");
  }

  // ── C. Calage ───────────────────────────────────────────────────────────
  console.log("\n📍 Calage pixel → projection (points du calage à < 1 m)");
  const PW = 4000, PH = 3000;
  // Calage TOURNÉ (A, B, C), autour de l'origine du Lambert 93 (valeurs de test, pas un lieu de relevé).
  const calTourne = {
    pointA: { x: 300,  y: 2700, lat: 46.5,     lng: 3.0 },
    pointB: { x: 3600, y: 400,  lat: 46.50845, lng: 3.02631 },
    pointC: { x: 3500, y: 2800, lat: 46.49840, lng: 3.02560 }
  };
  // Calage NORD EN HAUT (rotation nulle dans le modèle de l'app, 0,25 m/px).
  // ⚠️ En Lambert 93 aucun calage réel n'est « sans rotation » : la convergence des méridiens (≈ 0,02° à
  // 2 km du méridien central) tourne la grille, d'où la matrice — vérifiée en C2. Le tiepoint se teste en WGS84.
  const dLat = PH * 0.25 / 110540, latMoy = 46.5 + dLat / 2;
  const calNord = { pointA: { x: 0, y: PH, lat: 46.5, lng: 3.0 },
                    pointB: { x: PW, y: 0, lat: 46.5 + dLat, lng: 3.0 + PW * 0.25 / (111320 * Math.cos(latMoy * Math.PI / 180)) } };

  async function exporterEtRelire(cal, epsg, r) {
    const tr = KE.buildTransformCalib(cal);
    const w = Math.round(PW * r), h = Math.round(PH * r);
    const g = I.calculerGeoref(tr, r, w, h, epsg);
    // Image minuscule mais du MÊME en-tête : seules les dimensions et le calage comptent ici.
    const px = new Uint8Array(w * h * 3);
    const u8 = await I.ecrireTiff(px, w, h, 3, { compresser: false, epsg: epsg, geo: g.geo });
    const ifd = TG._interne.lireIfd0(u8.buffer);
    const monde = TG._interne.mondeDePixel(ifd.tags, true);
    const versLl = epsg === 4326 ? (X, Y) => ({ lat: Y, lng: X }) : (X, Y) => L93.versWgs84(X, Y);
    const lu = (i, j) => { const q = monde(i, j); return versLl(q.X, q.Y); };
    return { tr, g, ifd, lu, w, h, epsg: TG._interne.epsgDeGeoKeys(ifd.tags[34735]) };
  }

  for (const epsg of [2154, 4326]) {
    const r = 0.1;   // 400 × 300 px : la géométrie seule compte
    let e = null, boum = null;
    try { e = await exporterEtRelire(calTourne, epsg, r); } catch (x) { boum = x; }
    const pts = ["pointA", "pointB", "pointC"].map(k => {
      const p = calTourne[k];
      return { k, d: e ? distM(e.lu(p.x * r, p.y * r), p) : Infinity };
    });
    verif("C1 (" + epsg + ", tourné). A, B, C du calage retombent à < 1 m dans le fichier relu",
      !boum && pts.every(p => p.d < 1),
      (boum ? boum.message : pts.map(p => p.k + " " + p.d.toFixed(3) + " m").join(", ")) +
      ". Le fichier doit redonner les points GPS saisis au calage, pas seulement un repère plausible.");
    const coins = e ? [[0, 0], [PW, 0], [0, PH], [PW, PH]].map(c =>
      distM(e.lu(c[0] * r, c[1] * r), KE.planToGps(e.tr, c[0], c[1]))) : [];
    verif("C2 (" + epsg + ", tourné). les 4 coins relus à < 1 m de planToGps, modèle matrice, EPSG relu " + epsg,
      !boum && coins.every(d => d < 1) && e.g.mode === "matrice" && !!e.ifd.tags[34264] && e.epsg === epsg,
      "coins : " + coins.map(d => d.toFixed(3)).join(" / ") + " m, mode " + (e && e.g.mode) +
      ". Un plan tourné exige ModelTransformation (34264) : tiepoint + pixelscale l'aplatirait.");
    const plafondResidu = epsg === 4326 ? 0.001 : 1;
    verif("C3 (" + epsg + "). écart max de l'affine ajustée annoncé et < " + plafondResidu + " m (" +
      (e ? e.g.residuM.toFixed(3) : "?") + " m sur un plan de ~2,5 km)",
      !boum && e.g.residuM >= 0 && e.g.residuM < plafondResidu,
      "residuM = " + (e && e.g.residuM) + " m. En WGS84 l'affine est exacte au modèle historique (en degrés) ; " +
      "en Lambert 93 c'est la courbure de la projection, à annoncer, jamais à cacher.");
  }

  // C3b. Même calage au modèle "local" (tout nouveau calage) : l'affine en Lambert 93 devient quasi exacte, celle
  // en degrés porte la courbure, mesurée et annoncée (docs/ETUDE_CALAGE_PROJECTION.md §2.6).
  for (const epsg of [2154, 4326]) {
    let e = null, boum = null;
    try { e = await exporterEtRelire(Object.assign({}, calTourne, { modele: KE.MODELE_LOCAL }), epsg, 0.1); }
    catch (x) { boum = x; }
    const plafond = epsg === 2154 ? 0.05 : 0.5;
    const coins = e ? [[0, 0], [PW, 0], [0, PH], [PW, PH]].map(c =>
      distM(e.lu(c[0] * 0.1, c[1] * 0.1), KE.planToGps(e.tr, c[0], c[1]))) : [];
    verif("C3b (" + epsg + ", calage local). résidu de l'affine < " + plafond + " m (" +
      (e ? e.g.residuM.toFixed(3) : "?") + " m), 4 coins relus à < 1 m",
      !boum && e.tr.modele === KE.MODELE_LOCAL && e.g.residuM < plafond && coins.every(d => d < 1),
      boum ? boum.message : "coins " + coins.map(d => d.toFixed(3)).join(" / ") + " m.");
  }

  {
    let e = null, cal = null, boum = null;
    try {
      e = await exporterEtRelire(calNord, 4326, 1);
      cal = TG._interne.calage(e.ifd, e.w, e.h);   // le chemin de l'IMPORT, sans option
    } catch (x) { boum = x; }
    verif("C4. plan nord en haut (WGS84) → tiepoint + pixelscale, relu par l'import de l'app",
      !boum && e.g.mode === "tiepoint" && !e.ifd.tags[34264] && !!e.ifd.tags[33550] && !!e.ifd.tags[33922],
      boum ? boum.message : "mode " + e.g.mode + ". Sans rotation, la forme simple est celle que tout SIG lit.");
    const dA = cal ? distM(cal.georef.pointA, calNord.pointA) : Infinity;
    const dB = cal ? distM(cal.georef.pointB, calNord.pointB) : Infinity;
    verif("C5. aller-retour plan → GeoTIFF → import : coins sud-ouest et nord-est à < 1 m, dimensions exactes",
      !boum && dA < 1 && dB < 1 && cal.georef.pointA.y === PH && cal.georef.pointB.x === PW,
      "écarts " + dA.toFixed(3) + " / " + dB.toFixed(3) + " m. L'import doit retrouver le calage exporté.");
  }

  // C6. Un GeoTIFF TOURNÉ exporté par l'app (calage 2 points, comme une saisie A / B) se RÉIMPORTE : l'import
  // pose A, B et C, et le calage relu redonne les 4 coins du plan à < 1 m, en Lambert 93 comme en WGS84.
  // Les 4 coins sont jugés avec le calage de l'APP reconstruit depuis A / B / C (buildTransformCalib), pas avec
  // la matrice du fichier : c'est ce que l'utilisateur obtient après l'import.
  const calA_B = (function () {
    const kL = 111320 * Math.cos(46.5 * Math.PI / 180), rot = 23 * Math.PI / 180, k = 0.3;
    const g = (x, y) => {
      const e = (x * Math.cos(rot) + y * Math.sin(rot)) * k, n = (x * Math.sin(rot) - y * Math.cos(rot)) * k;
      return { x: x, y: y, lat: 46.5 + n / 110540, lng: 3.2 + e / kL };
    };
    return { pointA: g(200, 2800), pointB: g(3800, 300) };
  })();
  const geoCisaille = [];
  for (const epsg of [2154, 4326]) {
    const r = 0.1;
    let e = null, cal = null, boum = null;
    try {
      e = await exporterEtRelire(calA_B, epsg, r);
      if (epsg === 2154) geoCisaille.push(e);
      cal = TG._interne.calage(e.ifd, e.w, e.h);   // chemin de l'IMPORT, sans option
    } catch (x) { boum = x; }
    let pire = Infinity, sansC = true;
    if (cal) {
      sansC = !cal.georef.pointC;
      const trLu = KE.buildTransformCalib(cal.georef);
      pire = Math.max.apply(null, [[0, 0], [PW, 0], [0, PH], [PW, PH], [PW / 2, PH / 2]].map(c =>
        distM(KE.planToGps(trLu, c[0] * r, c[1] * r), KE.planToGps(e.tr, c[0], c[1]))));
    }
    verif("C6 (" + epsg + "). GeoTIFF tourné de l'app réimporté : A, B et C posés, coins à < 1 m (" +
      (isFinite(pire) ? pire.toFixed(3) : "?") + " m)",
      !boum && e.g.mode === "matrice" && !sansC && pire < 1,
      (boum ? boum.message : "pointC " + (sansC ? "absent" : "présent") + ", pire " + pire) +
      ". Un export de l'app doit pouvoir revenir dans l'app : une similitude tournée est acceptée.");
  }
  {
    // C7. La même matrice, CISAILLÉE de 5 % : refusée par l'import, nommée.
    let obtenu = "(aucune erreur)";
    try {
      const e = geoCisaille[0];
      const m = e.g.geo.matrice.slice();
      m[1] += 0.05 * Math.hypot(m[0], m[4]);
      const u8 = await I.ecrireTiff(new Uint8Array(e.w * e.h * 3), e.w, e.h, 3, { compresser: false, epsg: 2154, geo: { matrice: m } });
      TG._interne.calage(TG._interne.lireIfd0(u8.buffer), e.w, e.h);
    } catch (x) { obtenu = x.message; }
    verif("C7. image cisaillée de 5 % : refusée à l'import (tiff.err.rotation)", obtenu === "tiff.err.rotation",
      "obtenu « " + obtenu + " ». Une déformation passe pour une rotation si la similitude n'est pas vérifiée.");
  }

  // ── J. GeoJSON ──────────────────────────────────────────────────────────
  console.log("\n🗺️ GeoJSON");
  ctx.APP_CONFIG = { multiLevel: true };
  const trJ = KE.buildTransformCalib(calTourne);
  const P = (x, y) => ({ x, y });
  const donnees = {
    editorPoints: [
      { x: 300, y: 2700, tags: ["puits"], nom: "P1", level: 0, uid: "u-p1", description: "note" },
      { x: 500, y: 500, tags: ["salle"], level: 1 },
      { x: 600, y: 600, tags: [], level: 0 }
    ],
    roads: [
      { type: "principal", points: [P(0, 0), P(10, 10)], level: 0, uid: "u-r1" },
      { type: "cust-abc", points: [P(0, 0), P(20, 10)], level: 0 },
      { type: "Bas", points: [P(0, 0), P(30, 10)], level: 1 },
      { type: "jonction", points: [P(1, 1), P(2, 2)], fromLevel: 0, toLevel: 1 },
      { type: "itinerary", points: [P(5, 5), P(6, 6)] }
    ],
    zones: [
      { type: "eau", points: [P(0, 0), P(100, 0), P(100, 100)], level: 0 },
      { type: "zone-brute", points: [P(0, 0), P(50, 0), P(50, 50)], level: 0 }
    ],
    structures: [
      { type: "pilier-1", points: [P(0, 0), P(5, 0), P(5, 5)], level: 0 },
      { type: "front-1", points: [P(0, 0), P(9, 9)], level: 0 },
      { type: "struct-brute", points: [P(0, 0), P(4, 0), P(4, 4)], level: 0 },
      { type: "struct-brute", points: [P(0, 0), P(4, 0), P(4, 4), P(0, 0)], level: 0 }
    ]
  };
  const tout = { points: true, roads: true, zones: true, structures: true, jonctions: true, itineraire: true };
  const familles = fc => fc.features.reduce((o, f) => { o[f.properties.famille] = (o[f.properties.famille] || 0) + 1; return o; }, {});
  let fcL = null, fcW = null, boumJ = null;
  try {
    fcL = GJ.generer({ transform: trJ, epsg: 2154, planName: "Test", include: tout, levels: new Set([0, 1]), data: donnees });
    fcW = GJ.generer({ transform: trJ, epsg: 4326, planName: "Test", include: tout, levels: new Set([0, 1]), data: donnees });
  } catch (e) { boumJ = e; }
  const f = fcL ? familles(fcL) : {};
  verif("J1. toutes les familles, types personnalisés et ids bruts compris",
    !boumJ && f.point === 3 && f.trace === 3 && f.jonction === 1 && f.itineraire === 1 && f.zone === 2 && f.structure === 4,
    (boumJ ? boumJ.message : JSON.stringify(f)) + " — attendu point 3, trace 3, jonction 1, itineraire 1, zone 2, structure 4.");
  const geom = (fc, fam, type) => fc.features.filter(x => x.properties.famille === fam && x.properties.type === type)
    .map(x => x.geometry.type).join(",");
  verif("J2. géométrie des structures = règle du KMZ (front en ligne, id brut ouvert en ligne / fermé en polygone)",
    fcL && geom(fcL, "structure", "front-1") === "LineString" && geom(fcL, "structure", "pilier-1") === "Polygon" &&
    geom(fcL, "structure", "struct-brute") === "LineString,Polygon",
    fcL ? "front-1 " + geom(fcL, "structure", "front-1") + " · struct-brute " + geom(fcL, "structure", "struct-brute") : "");
  const anneauxFermes = fcL && fcL.features.filter(x => x.geometry.type === "Polygon").every(x => {
    const c = x.geometry.coordinates[0]; return c.length >= 4 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];
  });
  verif("J3. chaque anneau de polygone est fermé, sans doubler un anneau déjà fermé", anneauxFermes &&
    fcL.features.filter(x => x.properties.type === "struct-brute" && x.geometry.type === "Polygon")[0].geometry.coordinates[0].length === 4,
    "RFC 7946 §3.1.6 : premier point = dernier.");
  const ref = (cat, type) => ctx.ktaResolveStyle(cat, type, { flat: true }).color;
  const prop = (fc, type) => (fc.features.find(x => x.properties.type === type) || {}).properties || {};
  verif("J4. couleurs résolues par ktaResolveStyle({flat}) ; un type sans légende prend le repli de la carte",
    fcL && prop(fcL, "principal").couleur === ref("traces", "principal") &&
    prop(fcL, "zone-brute").couleur === ref("zones", "remblais") &&
    prop(fcL, "struct-brute").couleur === ref("structures", "mur") &&
    prop(fcL, "eau").remplissage === ctx.ktaResolveStyle("zones", "eau", { flat: true }).fillColor,
    "principal " + prop(fcL || { features: [] }, "principal").couleur + " · zone-brute " +
    prop(fcL || { features: [] }, "zone-brute").couleur + ". Repli : zone → remblais, structure → mur (REPLI_KML).");
  const p1L = fcL && fcL.features.find(x => x.id === "u-p1");
  const attenduL = L93.versL93(calTourne.pointA.lat, calTourne.pointA.lng);
  const dP = p1L ? Math.hypot(p1L.geometry.coordinates[0] - attenduL.x, p1L.geometry.coordinates[1] - attenduL.y) : Infinity;
  verif("J5. Lambert 93 : un point posé sur A tombe à < 1 m de A reprojeté, `crs` EPSG:2154 présent",
    dP < 1 && fcL.crs && /EPSG::2154$/.test(fcL.crs.properties.name) && p1L.properties.uid === "u-p1" &&
    p1L.properties.note === "note" && p1L.properties.niveau === 0,
    "écart " + dP.toFixed(3) + " m, crs " + JSON.stringify(fcL && fcL.crs) +
    ". Sans `crs`, QGIS lit les mètres comme des degrés et pose tout hors de la Terre.");
  const p1W = fcW && fcW.features.find(x => x.id === "u-p1");
  const dW = p1W ? distM({ lng: p1W.geometry.coordinates[0], lat: p1W.geometry.coordinates[1] }, calTourne.pointA) : Infinity;
  verif("J6. WGS84 : conforme RFC 7946 (pas de `crs`, ordre [longitude, latitude]), point A à < 1 m",
    fcW && !("crs" in fcW) && dW < 1, "écart " + dW.toFixed(3) + " m, crs " + JSON.stringify(fcW && fcW.crs));
  let fcF = null;
  try {
    fcF = GJ.generer({ transform: trJ, epsg: 2154, data: donnees, levels: new Set([0]),
      include: Object.assign({}, tout, { pointTagsSet: new Set(["puits"]), roadTypesSet: new Set(["principal"]),
                                         zoneTypesSet: new Set(), structureTypesSet: null }) });
  } catch (e) { fcF = null; }
  const ff = fcF ? familles(fcF) : {};
  verif("J7. filtres du KMZ : tags, types, Set vide = rien, niveaux choisis",
    fcF && ff.point === 1 && ff.trace === 1 && !ff.zone && ff.structure === 4 && ff.jonction === 1,
    JSON.stringify(ff) + " — attendu point 1 (puits, niveau 0), trace 1 (principal), zone 0, structure 4, jonction 1.");
  ctx.APP_CONFIG = { multiLevel: false };
  const fcM = GJ.generer({ transform: trJ, epsg: 4326, data: donnees, levels: null, include: tout });
  verif("J8. plan sans multi-niveau : aucun filtre de niveau, pas de jonction",
    familles(fcM).point === 3 && !familles(fcM).jonction, JSON.stringify(familles(fcM)));
  verif("J9. nom de fichier qui dit la projection",
    /_L93\.geojson$/.test(GJ.nomFichier("Plan", 2154)) && /_WGS84\.geojson$/.test(GJ.nomFichier("Plan", 4326)),
    GJ.nomFichier("Plan", 2154));

  // ── B. Branchements ─────────────────────────────────────────────────────
  console.log("\n🔌 Branchements");
  const lire = f => fs.readFileSync(f, "utf8");
  const idx = lire("index.html");
  const pos = n => idx.indexOf('src="js/' + n + '"');
  verif("B1. index.html charge geotiffExport.js et geojsonExport.js après kmzExport, sigImport, exporter",
    pos("geotiffExport.js") > 0 && pos("geojsonExport.js") > 0 &&
    ["kmzExport.js", "sigImport.js", "tiffGeoref.js", "exporter.js"].every(n => pos(n) > 0 &&
      pos(n) < pos("geotiffExport.js") && pos(n) < pos("geojsonExport.js")),
    "ordre de chargement incorrect ou script absent.");
  const swSrc = lire("sw.js");
  verif("B2. les deux modules sont précachés (hors ligne)",
    swSrc.includes('"./js/geotiffExport.js"') && swSrc.includes('"./js/geojsonExport.js"'), "sw.js > ASSETS_TO_CACHE.");
  const ui = lire("js/interface.js");
  verif("B3. lanceur ⬆️ Exporter : GeoTIFF dans « image », GeoJSON dans « externe »",
    /titreCle: "export\.lanceur\.geotiff", section: "image"/.test(ui) &&
    /titreCle: "export\.lanceur\.geojson", section: "externe"/.test(ui),
    "les tuiles doivent vivre à côté du PNG / PDF et du KMZ / GPX.");
  const manquantes = [];
  const cles = new Set();
  for (const fsrc of ["js/geotiffExport.js", "js/geojsonExport.js", "js/sessionExporter.js", "js/interface.js"]) {
    const s = lire(fsrc);
    (s.match(/["'](geotiff\.[A-Za-z0-9.]+|export\.geojson\.[A-Za-z0-9.]+|export\.lanceur\.geo(?:tiff|json))["']/g) || [])
      .forEach(m => cles.add(m.slice(1, -1)));
  }
  for (const lang of ["fr", "en", "es"]) {
    const d = JSON.parse(lire(path.join("lang", lang + ".json")));
    cles.forEach(k => { if (!(k in d)) manquantes.push(lang + " : " + k); });
  }
  verif("B4. les " + cles.size + " clés i18n des deux exports existent en fr/en/es",
    cles.size > 10 && manquantes.length === 0, manquantes.slice(0, 10).join(", "));

  if (!echecs.length) {
    console.log("\n🎉 exports SIG : TIFF relu à l'identique, calage à < 1 m, GeoJSON conforme");
    process.exit(0);
  }
  console.log("\n============================================================");
  console.log("🛑 COMMIT REFUSÉ — export GeoTIFF / GeoJSON cassé");
  console.log("============================================================");
  echecs.forEach(a => console.log("\n   • " + a));
  console.log("");
  process.exit(1);
})().catch(function (e) {
  console.error("\n❌ [check-export-sig] le contrôle lui-même a échoué : " + (e && e.stack || e));
  process.exit(1);
});
