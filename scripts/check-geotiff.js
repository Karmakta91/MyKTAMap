#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-geotiff.js — garde-fou pré-commit BLOQUANT de l'import GeoTIFF
// =====================================================================
// Couvre le Web Mercator (EPSG:3857) de `js/sigImport.js` et le lecteur `js/tiffGeoref.js`.
// ⚠️ Aucune table de référence (comme check-lambert93.js) : une table recopiée fausse valide le bug.
// Web Mercator : A origines exactes · B 180° = πR (linéaire en x) · C CONFORME (même échelle
// méridien / parallèle) · D aller-retour. D seul ne prouve rien (deux fonctions fausses mais
// inverses passent) : A à C ancrent.
// Lecteur : fixtures construites octet par octet ici (attendu connu par construction ; flux LZW
// calculé à la main en L3).
// 🩸 Ce qui casse en silence : le REPÈRE (pointA sud-ouest, pointB nord-est ; inversé, le plan sort
// en miroir sans erreur) · les REFUS (un format non lu donne une image en charpie ou un calage
// plausible mais faux) · les clés i18n des refus (absentes, elles s'affichent brutes).
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

// ── Chargement des modules réels ──────────────────────────────────────────
const ctx = {
  window: {}, console: { log() {}, warn() {} },
  Blob: typeof Blob !== "undefined" ? Blob : undefined,
  Response: typeof Response !== "undefined" ? Response : undefined,
  DecompressionStream: typeof DecompressionStream !== "undefined" ? DecompressionStream : undefined,
  Uint8Array, Uint8ClampedArray, DataView, Math, JSON, Promise, Error,
  isFinite, Number, Array, String, Object, RegExp
};
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ["js/sigImport.js", "js/tiffGeoref.js"]) {
  let src;
  try { src = fs.readFileSync(f, "utf8"); }
  catch (e) { console.error("❌ [check-geotiff] " + f + " illisible : " + e.message); process.exit(1); }
  try { vm.runInContext(src, ctx, { filename: f }); }
  catch (e) { console.error("❌ [check-geotiff] " + f + " n'a pas pu être chargé : " + e.message); process.exit(1); }
}
const SI = ctx.window.SigImport, TG = ctx.window.TiffGeoref;
if (!SI || !SI.WEBMERC) { console.error("❌ [check-geotiff] window.SigImport.WEBMERC absent — le Web Mercator a disparu des exports."); process.exit(1); }
if (!TG || !TG._interne) { console.error("❌ [check-geotiff] window.TiffGeoref._interne absent."); process.exit(1); }

const WM = SI.WEBMERC;

// ── Web Mercator ──────────────────────────────────────────────────────────
console.log("\n📐 Web Mercator (EPSG:3857) — propriétés définitoires");

const o = WM.versMerc(0, 0);
verif("A1. l'équateur et Greenwich tombent exactement sur (0, 0)",
  o.x === 0 && o.y === 0,
  "versMerc(0,0) doit rendre exactement {x:0,y:0} — obtenu " + JSON.stringify(o) +
  ". Un décalage ici signale un faux-est/faux-nord parasite.");

const oi = WM.versWgs84(0, 0);
verif("A2. l'inverse ramène (0, 0) sur l'équateur à Greenwich",
  oi.lat === 0 && oi.lng === 0,
  "versWgs84(0,0) doit rendre exactement {lat:0,lng:0} — obtenu " + JSON.stringify(oi));

const demi = WM.versMerc(0, 90).x, plein = WM.versMerc(0, 180).x;
verif("B1. 180° de longitude valent exactement πR",
  Math.abs(plein - Math.PI * WM.R) < 1e-6,
  "x(180°) = " + plein + " au lieu de πR = " + (Math.PI * WM.R) +
  ". Le rayon du 3857 est le demi-grand axe WGS84 (6378137 m), sphère et non ellipsoïde.");
verif("B2. x est LINÉAIRE en longitude (90° = la moitié de 180°)",
  Math.abs(demi * 2 - plein) < 1e-9,
  "x(90°)×2 = " + (demi * 2) + " ≠ x(180°) = " + plein +
  ". Mercator ne déforme QUE la latitude ; une non-linéarité en x est une faute de projection.");

// C. d(x)/d(lng) et d(y)/d(lat) portent le MÊME facteur d'échelle au sol : c'est ce qu'une
// formule fausse (log(tan(φ)) au lieu de log(tan(π/4+φ/2))) casse immédiatement.
let confOk = true, pireConf = 0;
for (let lat = -75; lat <= 75; lat += 5) {
  const d = 1e-6;
  const dxdlng = (WM.versMerc(lat, d).x - WM.versMerc(lat, -d).x) / (2 * d);
  const dydlat = (WM.versMerc(lat + d, 0).y - WM.versMerc(lat - d, 0).y) / (2 * d);
  // Au sol : un degré de longitude vaut cos(lat) fois un degré de latitude.
  const echelleParallele = dxdlng / Math.cos(lat * Math.PI / 180);
  const ecart = Math.abs(echelleParallele - dydlat) / dydlat;
  pireConf = Math.max(pireConf, ecart);
  if (ecart > 1e-6) confOk = false;
}
verif("C. la projection est CONFORME (même échelle méridien / parallèle)",
  confOk,
  "écart relatif max " + pireConf.toExponential(2) + " entre les deux échelles. " +
  "Une conformité rompue = mauvaise formule de latitude (le piège classique : " +
  "log(tan(φ)) au lieu de log(tan(π/4 + φ/2))).");

let pireAR = 0;
for (let lat = -84; lat <= 84; lat += 3.7) {
  for (let lng = -179; lng <= 179; lng += 13.3) {
    const p = WM.versMerc(lat, lng), q = WM.versWgs84(p.x, p.y);
    pireAR = Math.max(pireAR, Math.abs(q.lat - lat), Math.abs(q.lng - lng));
  }
}
verif("D. aller-retour WGS84 → 3857 → WGS84 sur une grille mondiale",
  pireAR < 1e-9,
  "écart max " + pireAR.toExponential(2) + "° (toléré < 1e-9).");

const pole = WM.versMerc(89.9, 0), borne = WM.versMerc(85.051129, 0);
verif("E. la latitude est bornée à ±85,051129° (sinon y → ∞)",
  Number.isFinite(pole.y) && Math.abs(pole.y - borne.y) < 1e-6,
  "versMerc(89.9°) doit être écrêté sur la borne du 3857, pas partir à l'infini — obtenu y=" + pole.y);

// ── Lecteur GeoTIFF ───────────────────────────────────────────────────────
console.log("\n🗺️ Lecteur GeoTIFF — fixtures construites octet par octet");

// TIFF classique minimal : en-tête (8 o) + IFD + valeurs longues + pixels.
const TYPE_TAILLE = { 1: 1, 3: 2, 4: 4, 12: 8 };
function construireTiff(opts) {
  const le = opts.le !== false;
  const entrees = opts.entrees.slice().sort((a, b) => a.tag - b.tag);
  const pixels = opts.pixels || new Uint8Array(0);

  const tailleIfd = 2 + entrees.length * 12 + 4;
  const debutValeurs = 8 + tailleIfd;
  let curseur = debutValeurs;
  for (const e of entrees) {
    e._taille = TYPE_TAILLE[e.type] * e.valeurs.length;
    if (e._taille > 4) { e._offset = curseur; curseur += e._taille + (e._taille % 2); }
  }
  const offsetPixels = curseur;
  const total = offsetPixels + pixels.length;

  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setUint8(0, le ? 0x49 : 0x4D); dv.setUint8(1, le ? 0x49 : 0x4D);
  dv.setUint16(2, opts.magic || 42, le);
  dv.setUint32(4, 8, le);
  dv.setUint16(8, entrees.length, le);

  const ecrire = (off, type, vals) => {
    vals.forEach((v, i) => {
      if (type === 1) dv.setUint8(off + i, v);
      else if (type === 3) dv.setUint16(off + i * 2, v, le);
      else if (type === 4) dv.setUint32(off + i * 4, v, le);
      else if (type === 12) dv.setFloat64(off + i * 8, v, le);
    });
  };

  entrees.forEach((e, i) => {
    const p = 10 + i * 12;
    dv.setUint16(p, e.tag, le);
    dv.setUint16(p + 2, e.type, le);
    dv.setUint32(p + 4, e.valeurs.length, le);
    const vals = e.valeurs.map(v => (v === "@PIXELS" ? offsetPixels : v));
    if (e._taille > 4) { dv.setUint32(p + 8, e._offset, le); ecrire(e._offset, e.type, vals); }
    else ecrire(p + 8, e.type, vals);   // valeur EN PLACE, cadrée à gauche
  });
  dv.setUint32(10 + entrees.length * 12, 0, le);
  new Uint8Array(buf).set(pixels, offsetPixels);
  return buf;
}

// Fixture RGB 2×2 non compressée en Lambert 93, 10 m/px : le pixel (0,0) vaut (700000, 6600000),
// l'origine EXACTE du L93 (46,5°N ; 3°E).
const PIX = new Uint8Array([
  10, 20, 30,   40, 50, 60,     // rangée 0 : (0,0) puis (1,0)
  70, 80, 90,   100, 110, 120   // rangée 1
]);
function fixtureBase(surcharges) {
  const e = [
    { tag: 256, type: 3, valeurs: [2] },            // largeur
    { tag: 257, type: 3, valeurs: [2] },            // hauteur
    { tag: 258, type: 3, valeurs: [8, 8, 8] },      // bits par canal
    { tag: 259, type: 3, valeurs: [1] },            // compression : aucune
    { tag: 262, type: 3, valeurs: [2] },            // RGB
    { tag: 273, type: 4, valeurs: ["@PIXELS"] },    // offset de la bande
    { tag: 277, type: 3, valeurs: [3] },            // 3 canaux
    { tag: 278, type: 3, valeurs: [2] },            // lignes par bande
    { tag: 279, type: 4, valeurs: [12] },           // octets de la bande
    { tag: 284, type: 3, valeurs: [1] },            // canaux entrelacés
    { tag: 33550, type: 12, valeurs: [10, 10, 0] }, // 10 m/px
    { tag: 33922, type: 12, valeurs: [0, 0, 0, 700000, 6600000, 0] },
    { tag: 34735, type: 3, valeurs: [1, 1, 0, 1, 3072, 0, 1, 2154] }
  ];
  const o = { le: true, entrees: e, pixels: PIX };
  if (surcharges) surcharges(o);
  return construireTiff(o);
}
const remplace = (o, tag, valeurs, type) => {
  const e = o.entrees.find(x => x.tag === tag);
  if (e) { e.valeurs = valeurs; if (type) e.type = type; }
  else o.entrees.push({ tag: tag, type: type || 3, valeurs: valeurs });
};

(async function () {

  let img = null, cal = null, boum = null;
  try {
    const ab = fixtureBase();
    const ifd = TG._interne.lireIfd0(ab);
    cal = TG._interne.calage(ifd, 2, 2);
    img = await TG._interne.decoderPixels(ab, ifd);
  } catch (e) { boum = e; }

  verif("L1. les pixels sortent EXACTEMENT tels qu'écrits (RGB → RGBA)",
    !boum && img && img.width === 2 && img.height === 2 &&
    [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14].every((r, i) => img.rgba[r] === PIX[i]) &&
    [3, 7, 11, 15].every(r => img.rgba[r] === 255),
    "décodage non conforme" + (boum ? " (" + boum.message + ")" : "") +
    ". La conversion RGB→RGBA doit recopier les 3 canaux et forcer alpha=255.");

  // ── L2. Le repère ── pointA = coin BAS-GAUCHE (sud-ouest), pointB = HAUT-DROIT (nord-est) ;
  // par construction pointB est à 46,5°N et strictement à l'est de 3°E.
  verif("L2a. pointA = coin bas-gauche du plan (x=0, y=hauteur)",
    cal && cal.georef.pointA.x === 0 && cal.georef.pointA.y === 2,
    "obtenu " + JSON.stringify(cal && cal.georef.pointA) +
    ". Le y d'un plan se compte depuis le HAUT (convertCoord = [imageHeight - y, x]).");
  verif("L2b. pointB = coin haut-droit du plan (x=largeur, y=0)",
    cal && cal.georef.pointB.x === 2 && cal.georef.pointB.y === 0,
    "obtenu " + JSON.stringify(cal && cal.georef.pointB));
  verif("L2c. A est au SUD-OUEST de B (repère non miroir)",
    cal && cal.georef.pointA.lat < cal.georef.pointB.lat &&
          cal.georef.pointA.lng < cal.georef.pointB.lng,
    "A=" + JSON.stringify(cal && cal.georef.pointA) + " B=" + JSON.stringify(cal && cal.georef.pointB) +
    ". Inverser le repère ne lève AUCUNE erreur : le plan sort simplement en miroir sur la carte, " +
    "et ça ne se voit que si on connaît le terrain.");
  verif("L2d. le tiepoint est honoré : le pixel (0,0) tombe sur l'origine L93 (46,5°N / 3°E)",
    cal && Math.abs(cal.georef.pointB.lat - 46.5) < 1e-9 && cal.georef.pointB.lng > 3,
    "coin haut-droit obtenu " + JSON.stringify(cal && cal.georef.pointB) +
    " — attendu lat = 46,5 exactement (le tiepoint EST l'origine de la projection) et lng > 3.");
  verif("L2e. l'emprise en mètres se déduit de l'échelle (2 px × 10 m)",
    cal && Math.abs(cal.largeurM - 20) < 1e-9 && Math.abs(cal.hauteurM - 20) < 1e-9,
    "obtenu " + (cal && cal.largeurM) + " × " + (cal && cal.hauteurM) + " m, attendu 20 × 20.");

  // 🩸 L2f. Le tiepoint est un COUPLE (pixel → monde). QGIS y met presque toujours (0,0) : le terme
  // `(px - i)` peut disparaître sans qu'un fichier courant bronche. On référence le pixel (1,1).
  let calDecale = null;
  try {
    const ab = fixtureBase(o => { remplace(o, 33922, [1, 1, 0, 700000, 6600000, 0], 12); });
    calDecale = TG._interne.calage(TG._interne.lireIfd0(ab), 2, 2);
  } catch (e) { calDecale = null; }
  // ⇒ le coin haut-droit (2,0) vaut (700010, 6600010) : strictement au nord de 46,5°.
  verif("L2f. le pixel de référence du tiepoint est honoré (pas supposé nul)",
    calDecale && calDecale.georef.pointB.lat > 46.5 &&
    Math.abs(calDecale.georef.pointB.lat - 46.5) > 1e-5,
    "avec un tiepoint sur le pixel (1,1), le coin haut-droit doit remonter au nord de 46,5° — " +
    "obtenu " + JSON.stringify(calDecale && calDecale.georef.pointB) + ". " +
    "QGIS écrivant presque toujours (0,0), le terme `(px - i)` peut disparaître sans qu'aucun " +
    "fichier courant ne bronche.");

  // 🩸 L2g. Les « mètres » du 3857 sont gonflés de 1/cos(lat) : ×1,52 à 48,9°N sans correction.
  let cal3857 = null;
  try {
    const p = SI.WEBMERC.versMerc(48.9, 2.3);
    const ab = fixtureBase(o => {
      remplace(o, 33550, [1, 1, 0], 12);
      remplace(o, 33922, [0, 0, 0, p.x, p.y, 0], 12);
      remplace(o, 34735, [1, 1, 0, 1, 3072, 0, 1, 3857]);
    });
    cal3857 = TG._interne.calage(TG._interne.lireIfd0(ab), 2, 2);
  } catch (e) { cal3857 = null; }
  const attenduK = Math.cos(48.9 * Math.PI / 180);   // ≈ 0,657
  verif("L2g. en EPSG:3857 l'emprise est ramenée au sol (× cos lat), pas laissée en mètres Mercator",
    cal3857 && Math.abs(cal3857.largeurM - 2 * attenduK) < 0.02,
    "obtenu " + (cal3857 && cal3857.largeurM) + " m pour 2 px à 1 unité/px vers 48,9°N, " +
    "attendu ≈ " + (2 * attenduK).toFixed(3) + " m. Sans la correction, on annonce 1,52× trop grand.");

  // 🩸 L2h. Predictor 2 ne franchit JAMAIS une fin de ligne : à cheval, toutes les lignes sauf la
  // première se décalent (l'image « bave » vers la droite, sans erreur).
  let predOk = false, predDetail = "";
  try {
    const diff = new Uint8Array(12);
    for (let l = 0; l < 2; l++) {
      for (let c = 0; c < 6; c++) {
        const i = l * 6 + c;
        diff[i] = (c < 3) ? PIX[i] : (PIX[i] - PIX[i - 3]) & 0xff;
      }
    }
    const ab = fixtureBase(o => { remplace(o, 317, [2]); o.pixels = diff; });
    const r = await TG._interne.decoderPixels(ab, TG._interne.lireIfd0(ab));
    predOk = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14].every((p, i) => r.rgba[p] === PIX[i]);
    if (!predOk) predDetail = " obtenu [" + Array.from(r.rgba).join(",") + "]";
  } catch (e) { predDetail = " exception : " + e.message; }
  verif("L2h. le prédicteur horizontal repart à zéro à CHAQUE ligne",
    predOk,
    "l'image reconstruite diffère de l'originale." + predDetail +
    " Appliqué à cheval sur les lignes, le prédicteur décale tout sauf la première ligne — " +
    "l'image « bave » vers la droite et aucune erreur n'est levée.");

  // ── L3. LZW : flux calculé À LA MAIN ── codes 9 bits : Clear(256), 'A'(65), 'B'(66), EOI(257)
  //   256 = 100000000   65 = 001000001   66 = 001000010   257 = 100000001
  // concaténés : 100000000 001000001 001000010 100000001 (36 bits, complétés à 40)
  //   → 10000000 00010000 01001000 01010000 00010000
  //   → 0x80 0x10 0x48 0x50 0x10        attendu en sortie : [65, 66]
  let lzwOk = false, lzwDetail = "";
  try {
    const flux = new Uint8Array([0x80, 0x10, 0x48, 0x50, 0x10]);
    const r = TG._interne.lzw(flux, 2);
    lzwOk = r.length === 2 && r[0] === 65 && r[1] === 66;
    lzwDetail = "[" + Array.from(r).join(",") + "]";
  } catch (e) { lzwDetail = "exception : " + e.message; }
  verif("L3a. LZW : un flux de référence calculé à la main se décode juste",
    lzwOk,
    "obtenu " + lzwDetail + ", attendu [65,66]. Ce contrôle ancre l'ORDRE DES BITS " +
    "(MSB en tête) et la valeur des codes Clear/EOI, sans aucun encodeur de référence.");

  // 🩸 L3b/L3c. Décalage de largeur : le DÉCODEUR a une entrée de retard sur l'encodeur, il doit donc
  // basculer à 511 entrées (`dictLen + 1` du module). Sans ce +1, tout le flux se décale d'un bit.
  // Le flux court de L3a ne franchit jamais la limite : il faut un flux long.
  // ⚠️ L'encodeur d'ici partage la logique du décodeur : l'aller-retour seul ne prouve rien. Le
  // CONTRE-EXEMPLE tranche : le même contenu basculé un code plus tard doit être REJETÉ.
  // `retard` = 0 → règle TIFF (bascule quand le prochain code libre atteint 2^n) ; 1 → contre-exemple.
  function encoderLzw(data, retard) {
    const bits = [];
    let largeur = 9;
    const ecrire = (code) => { for (let i = largeur - 1; i >= 0; i--) bits.push((code >> i) & 1); };
    const dict = new Map(), cle = (arr) => arr.join(",");
    for (let i = 0; i < 256; i++) dict.set(String(i), i);   // les singletons EN font partie
    let suivant = 258;
    ecrire(256);
    let omega = [];
    for (const k of data) {
      const test = omega.concat([k]);
      if (dict.has(cle(test))) { omega = test; continue; }
      ecrire(dict.get(cle(omega)));
      dict.set(cle(test), suivant++);
      if (suivant - retard >= (1 << largeur) && largeur < 12) largeur++;
      omega = [k];
    }
    if (omega.length) ecrire(dict.get(cle(omega)));
    ecrire(257);
    const octets = new Uint8Array(Math.ceil(bits.length / 8));
    bits.forEach((b, i) => { if (b) octets[i >> 3] |= 128 >> (i & 7); });
    return octets;
  }
  // L'encodeur est lui-même ancré sur le cas calculé à la main (ordre des bits, code Clear).
  const ancre = encoderLzw([65, 66], 0);
  const ancreOk = ancre.length >= 5 && ancre[0] === 0x80 && ancre[1] === 0x10 &&
                  ancre[2] === 0x48 && ancre[3] === 0x50;
  // ~3000 octets variés : plusieurs franchissements de largeur.
  const longue = [];
  let graine = 12345;
  for (let i = 0; i < 3000; i++) {
    graine = (graine * 1103515245 + 12345) & 0x7fffffff;
    longue.push((graine >> 16) & 0xff);
    if (i % 7 === 0) longue.push(longue[i >> 1] || 0);   // des répétitions, sinon rien à compresser
  }
  const data = Uint8Array.from(longue);
  const compare = (a) => a && a.length === data.length && data.every((v, i) => a[i] === v);

  let bonOk = false, mauvaisRejete = false, detail = "";
  try { bonOk = compare(TG._interne.lzw(encoderLzw(data, 0), data.length)); }
  catch (e) { detail = " (règle TIFF → exception " + e.message + ")"; }
  try { mauvaisRejete = !compare(TG._interne.lzw(encoderLzw(data, 1), data.length)); }
  catch (e) { mauvaisRejete = true; }   // une exception est un rejet parfaitement valable

  verif("L3b. l'ancre + un flux LZW de " + data.length + " octets (plusieurs passages 9→10→11 bits) se décode juste",
    ancreOk && bonOk,
    (!ancreOk ? "l'encodeur de référence ne reproduit pas le flux calculé à la main — le contre-exemple ne vaudrait rien. "
              : "") + detail +
    " Le décodeur doit basculer de largeur alors qu'il ne détient que 511 entrées (`dictLen + 1`), " +
    "parce qu'il a toujours une entrée de retard sur l'encodeur.");
  verif("L3c. un flux dont la bascule arrive un code plus tard est bien REJETÉ (contre-exemple)",
    mauvaisRejete,
    "le décodeur relit AUSSI un flux qui bascule un code trop tard : il n'applique donc aucune " +
    "règle franchement, et un sabotage de la condition de largeur passerait inaperçu.");

  let beOk = false;
  try {
    const ab = fixtureBase(o => { o.le = false; });
    const ifd = TG._interne.lireIfd0(ab);
    const c = TG._interne.calage(ifd, 2, 2);
    beOk = Math.abs(c.georef.pointB.lat - 46.5) < 1e-9;
  } catch (e) { beOk = false; }
  verif("L4. un TIFF gros-boutiste (« MM ») se lit à l'identique",
    beOk,
    "les deux ordres d'octets sont légaux ; ne lire que « II » ferait échouer " +
    "un fichier parfaitement valide sans que la cause soit devinable.");

  // ── L4b. Image TUILÉE : une tuile 16 × 16 complétée, dont seul le coin 2 × 2 est l'image ──
  // 🩸 Les lignes d'une tuile font 16 px, pas 2 : lues à la largeur de l'image, les pixels se décalent.
  let tuileOk = false, tuileDetail = "";
  try {
    const tuile = new Uint8Array(16 * 16 * 3);
    tuile.set(PIX.subarray(0, 6), 0);            // 1re rangée de pixels
    tuile.set(PIX.subarray(6, 12), 16 * 3);      // 2e rangée : 16 px plus loin
    const ab = fixtureBase(o => {
      o.entrees = o.entrees.filter(e => [273, 278, 279].indexOf(e.tag) < 0);
      remplace(o, 322, [16]); remplace(o, 323, [16]);
      remplace(o, 324, ["@PIXELS"], 4); remplace(o, 325, [tuile.length], 4);
      o.pixels = tuile;
    });
    const r = await TG._interne.decoderPixels(ab, TG._interne.lireIfd0(ab));
    tuileOk = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14].every((p, i) => r.rgba[p] === PIX[i]);
    if (!tuileOk) tuileDetail = " obtenu [" + Array.from(r.rgba).join(",") + "]";
  } catch (e) { tuileDetail = " exception : " + e.message; }
  verif("L4b. un TIFF TUILÉ se lit, lignes de tuile comprises (tuile de bord complétée)",
    tuileOk,
    "l'image relue diffère." + tuileDetail + " L'export GeoTIFF de l'app écrit des tuiles 256 : " +
    "sans lecture des tuiles, l'aller-retour export → import échoue.");

  // ── L5. Les refus, chacun NOMMÉ ──────────────────────────────────────────
  // tiff.err.tuile : déclarée tuilée, mais sans index des tuiles (324 / 325).
  const casRefus = [
    ["tiff.err.bigTiff",       o => { o.magic = 43; }],
    ["tiff.err.tuile",         o => { remplace(o, 322, [256]); }],
    ["tiff.err.planar",        o => { remplace(o, 284, [2]); }],
    ["tiff.err.compression",   o => { remplace(o, 259, [7]); }],           // JPEG
    ["tiff.err.bits",          o => { remplace(o, 258, [16, 16, 16]); }],
    ["tiff.err.photometrie",   o => { remplace(o, 262, [3]); }],           // palette
    ["tiff.err.predictor",     o => { remplace(o, 317, [3]); }],
    ["tiff.err.pasDeCalage",   o => { o.entrees = o.entrees.filter(e => e.tag !== 33550 && e.tag !== 33922 && e.tag !== 34264); }],
    ["tiff.err.crsInconnu",    o => { remplace(o, 34735, [1, 1, 0, 1, 3072, 0, 1, 32631]); }],  // UTM 31N
    ["tiff.err.rotation",      o => {
      o.entrees = o.entrees.filter(e => e.tag !== 33550 && e.tag !== 33922);
      // matrice avec cisaillement : [1] et [4] non nuls
      remplace(o, 34264, [10, 3, 0, 700000, 3, -10, 0, 6600000, 0, 0, 0, 0, 0, 0, 0, 1], 12);
    }]
  ];
  for (const [cle, patch] of casRefus) {
    let obtenu = "(aucune erreur)";
    try {
      const ab = fixtureBase(patch);
      const ifd = TG._interne.lireIfd0(ab);
      TG._interne.calage(ifd, 2, 2);
      // ⚠️ `decoderPixels` est async : sans `await`, son rejet arrive après la lecture (faux rouge).
      await TG._interne.decoderPixels(ab, ifd);
    } catch (e) { obtenu = e.message; }
    verif("L5. refusé et NOMMÉ : " + cle,
      obtenu === cle,
      "obtenu « " + obtenu + " » au lieu de « " + cle + " ». Un refus anonyme n'apprend rien ; " +
      "un non-refus produit une image en charpie ou un calage faux.");
  }
  {

    // ── L6. Les clés de refus existent dans les 3 dictionnaires ──────────────
    const src = fs.readFileSync("js/tiffGeoref.js", "utf8");
    const clesCode = Array.from(new Set((src.match(/tiff\.err\.[A-Za-z0-9]+/g) || [])));
    const manquantes = [];
    for (const lang of ["fr", "en", "es"]) {
      let dico;
      try { dico = JSON.parse(fs.readFileSync(path.join("lang", lang + ".json"), "utf8")); }
      catch (e) { manquantes.push(lang + " (dictionnaire illisible)"); continue; }
      for (const c of clesCode) if (!(c in dico)) manquantes.push(lang + " : " + c);
    }
    verif("L6. les " + clesCode.length + " clés de refus sont traduites en fr/en/es",
      manquantes.length === 0,
      "absentes → " + manquantes.slice(0, 8).join(", ") +
      ". Une clé manquante s'affiche brute et le refus n'apprend plus rien.");

    // ── L7. Les maths de projection vivent dans sigImport.js et NULLE PART ailleurs ──
    const copie = /6378137|298\.257222101|Math\.log\(Math\.tan/.test(src);
    verif("L7. `tiffGeoref.js` ne recopie AUCUNE math de projection",
      !copie,
      "des constantes de projection (rayon, aplatissement) ou la formule de Mercator " +
      "apparaissent dans js/tiffGeoref.js. Elles doivent venir de window.SigImport.L93 / .WEBMERC — " +
      "une copie dérive en silence, exactement comme le catalogue d'icônes en v1.81.0.");

    // ── L8. Les portes d'entrée, et ce qu'elles annoncent ──────────────────
    // 🩸 Chaque porte (sélecteur d'image, zone de dépôt, accueil) doit router le .tif, et chaque
    // libellé qui énumère les formats doit le citer : une fonction que l'interface dément passe
    // pour cassée.
    const cc = fs.readFileSync("js/createConf.js", "utf8");
    verif("L8a. le sélecteur d'image accepte explicitement .tif/.tiff",
      /id="pl_baseImage"[^>]*accept="[^"]*\.tiff?/.test(cc),
      "l'input `pl_baseImage` doit lister .tif/.tiff : `image/*` seul ne les propose pas " +
      "de façon fiable selon l'OS.");
    verif("L8b. la zone de dépôt ROUTE le .tif au lieu de le rejeter",
      /TiffGeoref\s*&&\s*window\.TiffGeoref\.estTiff\(f\)/.test(cc) &&
      /id="kta-planner-zip-input"[\s\S]{0,200}accept="[^"]*\.tiff?/.test(cc),
      "`_routerFichierImport` doit avoir une branche GeoTIFF AVANT son `else`, et l'input de la " +
      "zone de dépôt doit accepter .tif — sinon le geste naturel sort « mauvaise extension » " +
      "alors que la fonction existe.");

    // 🩸 L'accueil est la porte la plus évidente : sans routage, un .tif y tombe sur « archive .zip ».
    const hl = fs.readFileSync("js/homeLoader.js", "utf8");
    const nbRoutages = (hl.match(/_estGeoTiff\(lower\)/g) || []).length;
    verif("L8d. l'accueil route le .tif par SES DEUX chemins (clic ET glisser-déposer)",
      nbRoutages >= 2 && /window\.afficherImporterGeoTiff/.test(hl) &&
      /window\.afficherImporterGeoTiff\s*=/.test(cc),
      "trouvé " + nbRoutages + " routage(s) dans homeLoader.js (2 attendus : `zipFileInput.change` " +
      "et `zipDropZone.drop`). Les deux chemins sont DISTINCTS dans ce fichier — n'en câbler qu'un " +
      "donne une fonction qui marche au clic et pas au glisser, ou l'inverse.");

    const ih = fs.readFileSync("index.html", "utf8");
    verif("L8e. l'input de l'accueil accepte .tif/.tiff",
      /id="zipFile"[^>]*accept="[^"]*\.tiff?/.test(ih),
      "`#zipFile` dans index.html doit lister .tif/.tiff, sinon le sélecteur de fichiers " +
      "de l'OS ne les propose même pas.");

    // 🩸 L'échelle vient du GeoTIFF : sinon le plan sort au défaut d'usine (4,9 px/m) et
    // `calculerCoherenceEchelleGeoref` dénonce une « incohérence critique » sur un plan bien calé.
    // On isole le HANDLER : ailleurs dans createConf.js les mêmes motifs masqueraient une suppression.
    const iDeb = cc.indexOf("function _bindGeoTiff()");
    const bloc = iDeb >= 0 ? cc.slice(iDeb, cc.indexOf("_bindUploadLabel(\"pl_baseImage\"", iDeb)) : "";
    // ⚠️ On lit ce qui PRÉCÈDE l'écriture : le message de succès, plus bas, cite les mêmes motifs
    // et garderait vert un calcul faux.
    const iPut = bloc.indexOf('put("pl_scale"');
    const amont = iPut >= 0 ? bloc.slice(Math.max(0, iPut - 600), iPut) : "";
    verif("L8f. l'échelle est renseignée depuis le GeoTIFF (1 / mètres par pixel)",
      bloc.length > 0 && iPut >= 0 &&
      /1 \/ res\.metresParPixel/.test(amont) &&
      /res\.metresParPixel > 0/.test(amont),
      "dans `_bindGeoTiff`, `pl_scale` doit recevoir `1 / res.metresParPixel` (le champ est en " +
      "PIXELS PAR MÈTRE, cf. `utils.js > scaleGps = 1 / metresParPixel`), et seulement quand la " +
      "valeur existe — en EPSG:4326 l'unité est le degré, il ne faut PAS écrire d'échelle. " +
      "Sans ça, le plan sort au défaut d'usine (4,9 px/m) et l'app affiche « Incohérence échelle " +
      "critique » sur un plan pourtant parfaitement calé.");

    // La zone de dépôt ne liste les formats qu'à un endroit : son libellé.
    const libelles = ["gen.zip.dropLabel",
                      "gen.router.badExt", "gen.images.modeUploadHint",
                      "home.add.dropSig", "home.loader.badFileType"];
    const muets = [];
    for (const lang of ["fr", "en", "es"]) {
      let dico;
      try { dico = JSON.parse(fs.readFileSync(path.join("lang", lang + ".json"), "utf8")); }
      catch (e) { muets.push(lang + " (illisible)"); continue; }
      for (const k of libelles) {
        if (!(k in dico)) { muets.push(lang + " : " + k + " absente"); continue; }
        if (!/\.tiff?\b|GeoTIFF/i.test(dico[k])) muets.push(lang + " : " + k);
      }
    }
    verif("L8c. les " + libelles.length + " libellés visibles citent le GeoTIFF (fr/en/es)",
      muets.length === 0,
      "muets → " + muets.join(", ") + ". Un libellé qui énumère les formats acceptés et " +
      "oublie celui qu'on vient d'ajouter fait conclure à l'utilisateur que ça ne marche pas.");

    // ── L9. Le calage lu doit être VISIBLE ─────────────────────────────────
    // 🩸 En mode « simple », le CSS masque les blocs `data-planner-advanced="1"` (géoréf ET échelle) :
    // écrire dans des champs invisibles est indiscernable d'une panne. D'où la bascule en Avancé.
    {
      const CC  = fs.readFileSync(path.join("js", "createConf.js"), "utf8").replace(/\r\n/g, "\n");
      const CSS = fs.readFileSync(path.join("css", "style.css"), "utf8").replace(/\r\n/g, "\n");
      const bloc = CC.slice(CC.indexOf("(function _bindGeoTiff()"),
                            CC.indexOf('_bindUploadLabel("pl_baseImage"'));

      verif("L9a. le mode simple masque les blocs avancés (la règle qui a causé le bug)",
        /#kta-planner-corps\[data-planner-mode="simple"\] \[data-planner-advanced="1"\]/.test(CSS),
        "La règle CSS a disparu : ce contrôle ne garde plus rien, il faut le revoir.");

      verif("🩸 L9b. le géoréf ET l'échelle sont dans des blocs avancés",
        (function () {
          const iS = CC.indexOf('id="pl_scale"'), iG = CC.indexOf('id="pl_geo_A_x"');
          return iS > 0 && iG > 0 &&
                 CC.lastIndexOf('data-planner-advanced="1"', iS) > 0 &&
                 CC.lastIndexOf('data-planner-advanced="1"', iG) > 0;
        })(),
        "Si ces champs cessaient d'être avancés, la bascule ci-dessous deviendrait inutile.");

      verif("🩸 L9c. un GeoTIFF lu fait basculer le Générateur en Avancé",
        /getAttribute\("data-planner-mode"\) === "simple"[\s\S]{0,240}_appliquerPlannerMode\("avance"\)/.test(bloc),
        "Sans bascule, le calage est écrit dans des champs masqués : l'utilisateur voit un Générateur vide.");

      verif("🩸 L9d. …et la bascule est DITE à l'utilisateur",
        /gen\.tiff\.modeAvance/.test(bloc) && /\+ bascule\)/.test(bloc),
        "Changer l'écran sous les yeux de quelqu'un sans un mot est le défaut qu'on corrige ailleurs.");

      verif("L9e. la bascule reste ponctuelle (préférence mémorisée intacte)",
        !/_ecrirePlannerMode/.test(bloc),
        "Le mode choisi par l'utilisateur ne doit pas être réécrit par un dépôt de fichier.");

      ["fr", "en", "es"].forEach(function (l) {
        const d = JSON.parse(fs.readFileSync(path.join("lang", l + ".json"), "utf8"));
        verif("L9f. i18n " + l + " : gen.tiff.modeAvance",
              typeof d["gen.tiff.modeAvance"] === "string", "Clé manquante en " + l + ".");
      });
    }

    if (!echecs.length) {
      console.log("\n🎉 GeoTIFF : Web Mercator conforme à ses propriétés définitoires, lecteur juste, refus nommés");
      process.exit(0);
    }
    console.log("\n============================================================");
    console.log("🛑 COMMIT REFUSÉ — l'import GeoTIFF est cassé");
    console.log("============================================================");
    echecs.forEach(a => console.log("\n   • " + a));
    console.log("");
    process.exit(1);
  }
})().catch(function (e) {
  console.error("\n❌ [check-geotiff] le contrôle lui-même a échoué : " + (e && e.stack || e));
  process.exit(1);
});
