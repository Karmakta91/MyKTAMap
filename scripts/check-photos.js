#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-photos.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Une photo n'est JAMAIS effacée sans confirmation, et un point garde 5 photos
// au plus (décision produit).
// 🩸 Ce qui casse en silence :
//   1. réimport de session qui purge les photos du plan (dont les « sans
//      point » gardées pour récupération) : il doit FUSIONNER
//      (`restorePhoto(…, { siAbsente: true })`) ;
//   2. rattachement depuis 📸 Mes photos sans la limite de 5 ;
//   3. fiche du point absente des ZIP de session : une photo orpheline n'est
//      plus récupérable (♻️ Recréer) après réimport ;
//   4. analyse depuis l'accueil qui charge toute l'archive en RAM ;
//   5. date de prise de vue (EXIF) : parseur qui lève ou lit hors du tampon sur un fichier tronqué ou forgé,
//      date lue APRÈS le ré-encodage (toujours vide), ou perdue en route (index des ZIP, profil, restauration).
// Le vrai js/photos.js tourne dans un `vm` sur une fausse IndexedDB (Map,
// requêtes asynchrones, transaction close quand rien n'attend) ; le câblage de
// l'import et de la galerie est vérifié dans le source.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c, info) => {
  console.log((c ? "✅" : "❌") + " " + n);
  if (!c) { ko++; if (info !== undefined) console.log("   ↳", JSON.stringify(info)); }
};

// ── Fausse IndexedDB (le strict nécessaire de photos.js) ─────────────
function fausseIDB() {
  const lignes = new Map();
  const cle = { by_plan: (r) => JSON.stringify(r.planId), by_plan_point: (r) => JSON.stringify([r.planId, r.pointId]) };
  function Tx() {
    this.attente = 0;
    this.fini = false;
  }
  Tx.prototype.req = function (calcul) {
    const tx = this, r = {};
    tx.attente++;
    setTimeout(function () {
      try { r.result = calcul(); } catch (e) { r.error = e; }
      const ev = { target: r };
      if (r.error) { if (r.onerror) r.onerror(ev); } else if (r.onsuccess) r.onsuccess(ev);
      tx.attente--;
      tx.verifier();
    }, 0);
    return r;
  };
  Tx.prototype.verifier = function () {
    const tx = this;
    setTimeout(function () {
      if (tx.attente === 0 && !tx.fini) { tx.fini = true; if (tx.oncomplete) tx.oncomplete(); }
    }, 0);
  };
  Tx.prototype.objectStore = function () {
    const tx = this;
    const clone = (o) => (o ? Object.assign({}, o) : o);
    return {
      get: (id) => tx.req(() => clone(lignes.get(String(id))) || undefined),
      put: (rec) => tx.req(() => { lignes.set(String(rec.id), clone(rec)); return rec.id; }),
      delete: (id) => tx.req(() => { lignes.delete(String(id)); }),
      getAll: () => tx.req(() => Array.from(lignes.values()).map(clone)),
      index: (nom) => ({
        getAll: (range) => tx.req(() => Array.from(lignes.values())
          .filter((r) => cle[nom](r) === JSON.stringify(range.v)).map(clone))
      })
    };
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: function () { const tx = new Tx(); setTimeout(function () { tx.verifier(); }, 0); return tx; }
  };
  return {
    lignes: lignes,
    indexedDB: {
      open: function () {
        const r = {};
        setTimeout(function () { r.result = db; if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
        return r;
      }
    }
  };
}

const idb = fausseIDB();
const evenements = [];
const win = {
  console: { log() {}, warn() {}, error() {} },
  indexedDB: idb.indexedDB,
  IDBKeyRange: { only: (v) => ({ v: v }) },
  dispatchEvent: (e) => { evenements.push(e.detail); },
  CustomEvent: function (type, o) { this.type = type; this.detail = o && o.detail; },
  setTimeout: setTimeout
};
win.window = win;
const ctx = vm.createContext(win);
vm.runInContext("var window = this; var IDBKeyRange = this.IDBKeyRange; var CustomEvent = this.CustomEvent;" +
  fs.readFileSync("js/photos.js", "utf8"), ctx);
const P = win.MyKTAMapPhotos;
t("js/photos.js se charge et expose restorePhoto + placesPourPoint",
  !!P && typeof P.restorePhoto === "function" && typeof P.placesPourPoint === "function");

const blob = { size: 10, type: "image/jpeg" };
const rec = (id, pointId, extra) => Object.assign({ id: id, planId: "planA", pointId: pointId, blob: blob }, extra || {});

async function photos() {
  // État de départ : une photo rattachée à un point, une photo « sans point » (point supprimé).
  idb.lignes.set("ph1", rec("ph1", "pt_local", { fiche: { nom: "local", x: 1, y: 2, maj: 2000 } }));
  idb.lignes.set("ph2", rec("ph2", "pt_disparu"));

  // ── 1. Fusion au réimport ──
  evenements.length = 0;
  const r1 = await P.restorePhoto(rec("ph1", "pt_du_fichier", { fiche: { nom: "fichier", x: 9, y: 9, maj: 1000 } }),
    { source: "import", siAbsente: true });
  const r2 = await P.restorePhoto(rec("ph3", "pt_du_fichier"), { source: "import", siAbsente: true });
  t("📸 siAbsente : une photo déjà en base (même id) n'est PAS réécrite (rattachement et fiche gardés) → null",
    r1 === null && idb.lignes.get("ph1").pointId === "pt_local" && idb.lignes.get("ph1").fiche.nom === "local",
    idb.lignes.get("ph1"));
  t("📸 siAbsente : une photo nouvelle est ajoutée → son id", r2 === "ph3" && idb.lignes.has("ph3"));
  t("📸 rien d'existant n'est supprimé (la photo « sans point » est toujours là)",
    idb.lignes.has("ph2") && idb.lignes.size === 3);
  t("📣 un seul événement « ajout » (la photo déjà présente n'en émet pas)",
    evenements.length === 1 && evenements[0].action === "ajout" && evenements[0].photoIds[0] === "ph3", evenements);
  const r3 = await P.restorePhoto(rec("ph3", "autre"), { source: "import" });
  t("sans siAbsente, restorePhoto garde son contrat (écrase : extensions, plan ZIP, profil)",
    r3 === "ph3" && idb.lignes.get("ph3").pointId === "autre");

  // ── 2. Limite de 5 au rattachement ──
  idb.lignes.clear();
  for (let i = 1; i <= 4; i++) idb.lignes.set("q" + i, rec("q" + i, "pt_quatre"));
  idb.lignes.set("n1", rec("n1", "Salle"));   // rangée sous le NOM (ancien format)
  for (let i = 1; i <= 6; i++) idb.lignes.set("v" + i, rec("v" + i, "pt_six"));
  const a = await P.placesPourPoint("planA", { uid: "pt_quatre" }, ["x1"]);
  const b = await P.placesPourPoint("planA", { uid: "pt_quatre" }, ["x1", "x2"]);
  const c = await P.placesPourPoint("planA", { uid: "pt_quatre", id: "Salle" }, ["x1"]);
  const d = await P.placesPourPoint("planA", { uid: "pt_six" }, ["v1", "v2"]);
  const e = await P.placesPourPoint("planA", { uid: "pt_quatre" }, ["q1", "x1"]);
  const f = await P.placesPourPoint("planA", { uid: "pt_six" }, ["x1"]);
  t("🔢 4 photos + 1 → accepté (5 = la limite)", a.ok === true && a.deja === 4 && a.ajout === 1 && a.max === 5, a);
  t("🔢 4 photos + 2 → refusé, avec les chiffres pour l'expliquer (1 place libre)",
    b.ok === false && b.libres === 1 && b.ajout === 2, b);
  t("🔢 les photos rangées sous le NOM du point comptent aussi (lecture double)", c.ok === false && c.deja === 5, c);
  t("🔢 une photo déjà sur ce point ne compte pas deux fois", e.ok === true && e.ajout === 1, e);
  t("🛟 point déjà au-delà (6) : rien d'existant n'est refusé (rien à ajouter → ok)", d.ok === true && d.ajout === 0, d);
  t("🔢 point déjà au-delà (6) + 1 nouvelle → refusé", f.ok === false && f.libres === 0, f);
  t("🛟 placesPourPoint ne modifie rien", idb.lignes.size === 11);
}

function cablage() {
  const IMP = fs.readFileSync("js/interfaceImportExport.js", "utf8");
  t("🩸 le réimport de session ne purge plus les photos du plan (aucun deletePhotosForPlan)",
    IMP.indexOf("deletePhotosForPlan") < 0);
  const appels = IMP.match(/restorePhoto\([\s\S]*?\}, \{[^}]*\}\)/g) || [];
  t("📸 chaque restauration de l'import de session est une FUSION (siAbsente: true)",
    appels.length > 0 && appels.every((a) => /siAbsente:\s*true/.test(a)), appels.length);

  const GAL = fs.readFileSync("js/photosGalerie.js", "utf8");
  const corps = (nom) => {
    const i = GAL.indexOf("function " + nom + "(");
    return i < 0 ? "" : GAL.slice(i, GAL.indexOf("\n  }\n", i));
  };
  const ra = corps("_rattacherA"), sc = corps("_choisirSurCarte");
  t("🔢 galerie > 🔗 Rattacher (liste) : la limite est vérifiée AVANT P.rattacher",
    ra.indexOf("_placeSurPoint(") >= 0 && ra.indexOf("_placeSurPoint(") < ra.indexOf("P.rattacher("));
  t("🔢 galerie > 🗺️ Choisir sur la carte : la limite est vérifiée AVANT P.rattacher",
    sc.indexOf("_placeSurPoint(") >= 0 && sc.indexOf("_placeSurPoint(") < sc.indexOf("P.rattacher("));
  t("🔢 un refus est expliqué (ktaAlerte + clé photosgal.limite.refus dans les 3 dicos)",
    /ktaAlerte\(_t\("photosgal\.limite\.refus"/.test(corps("_placeSurPoint")) &&
    ["fr", "en", "es"].every((l) => !!JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"))["photosgal.limite.refus"]));
}

// ── 3. La fiche du point voyage dans les ZIP de session ──────────────
// Un seul helper pour les 3 index (Full, Avancé, Conversion) ; l'import relit
// la fiche et la passe à restorePhoto. Un ZIP sans fiche se relit comme avant.
function fiche() {
  const SE = fs.readFileSync("js/sessionExporter.js", "utf8");
  const i = SE.indexOf("function _entreeIndexPhoto(");
  let corps = null;
  if (i >= 0) {
    let prof = 0;
    for (let k = SE.indexOf("{", i); k < SE.length; k++) {
      if (SE[k] === "{") prof++;
      else if (SE[k] === "}") { prof--; if (prof === 0) { corps = SE.slice(i, k + 1); break; } }
    }
  }
  t("🧾 _entreeIndexPhoto est extractible de js/sessionExporter.js", !!corps);
  if (!corps) return;
  const f = vm.runInNewContext("(" + corps + ")");
  const fi = { nom: "Salle", x: 1, y: 2, niveau: 0, type: "salle", maj: 5 };
  const avec = f({ pointId: "pt_a", mime: "image/jpeg", size: 3, fiche: fi }, "ph.jpg");
  const sans = f({ pointId: "pt_a", mime: "image/jpeg", size: 3, fiche: null }, "ph.jpg");
  t("🧾 l'entrée d'index emporte la fiche du point quand la photo en a une",
    avec.fiche === fi && avec.pointId === "pt_a" && avec.file === "ph.jpg");
  t("🧾 sans fiche : entrée identique à l'ancien format (pas de clé fiche)",
    !("fiche" in sans) && Object.keys(sans).join() === "pointId,mime,size,file");
  t("🧾 les 3 écrivains de photos/_index.json passent par _entreeIndexPhoto (aucune entrée écrite à la main)",
    (SE.match(/idx\[p\.id\] = _entreeIndexPhoto\(p, name\);/g) || []).length === 3 && !/idx\[p\.id\] = \{/.test(SE));
  const col = SE.slice(SE.indexOf("function _collecterPhotosPlan("), SE.indexOf("function _extDepuisMime("));
  t("🧾 la collecte des photos du plan emporte leur fiche", /fiche:\s*rec\.fiche/.test(col));
  const IMP = fs.readFileSync("js/interfaceImportExport.js", "utf8");
  const parse = IMP.slice(IMP.indexOf("function _parseSessionZip("), IMP.indexOf("function chargerFichier("));
  t("🧾 l'import de session relit la fiche de l'index (info.fiche, facultative)", /fiche:\s*info\.fiche \|\| null/.test(parse));
  t("🧾 …et la passe à restorePhoto (validée là-bas par _fiche)", /fiche:\s*p\.fiche[\s\S]{0,120}siAbsente: true/.test(IMP));
}

// ── 4. Analyse depuis l'accueil : l'archive n'est PAS chargée en entier ──
// 🩸 JSZip.loadAsync(blob) lit tout le Blob en mémoire (200 Mo de RAM pour
// quelques Ko de points). `_lecteurZipPartiel` ne lit que le répertoire central
// et les entrées demandées ; on compte les octets lus par Blob.slice.
async function archivePartielle() {
  const GAL = fs.readFileSync("js/photosGalerie.js", "utf8");
  const i = GAL.indexOf("async function _lecteurZipPartiel(");
  let corps = null;
  if (i >= 0) {
    let prof = 0;
    for (let k = GAL.indexOf("{", i); k < GAL.length; k++) {
      if (GAL[k] === "{") prof++;
      else if (GAL[k] === "}") { prof--; if (prof === 0) { corps = GAL.slice(i, k + 1); break; } }
    }
  }
  t("📦 _lecteurZipPartiel est extractible de js/photosGalerie.js", !!corps);
  if (!corps) return;
  const lire = vm.runInNewContext("(" + corps + ")", {
    DecompressionStream: DecompressionStream, Response: Response, TextDecoder: TextDecoder,
    DataView: DataView, Uint8Array: Uint8Array, Map: Map, Error: Error, Math: Math
  });
  const JSZip = require("../lib/jszip.min.js");
  const zip = new JSZip();
  const points = { data: [{ id: "Salle", nom: "Salle", x: 10, y: 20, uid: "pt_a" }] };
  zip.file("plan/plan-config.json", JSON.stringify({ dataLayers: [{ id: "p", file: "data/points.json" }] }));
  zip.file("plan/data/points.json", JSON.stringify(points));
  zip.file("plan/data/légende é.json", JSON.stringify({ ok: "é" }), { compression: "STORE" });
  const image = new Uint8Array(6 * 1024 * 1024);
  for (let k = 0; k < image.length; k++) image[k] = (k * 2654435761) >>> 24;   // incompressible
  zip.file("plan/data/fond.jpg", image, { compression: "STORE" });
  for (let k = 0; k < 300; k++) zip.file("plan/data/tiles/z0/x" + k + "_y-1.jpg", image.subarray(0, 4096), { compression: "STORE" });
  const vrai = new Blob([await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })]);
  let lus = 0;
  const espion = (b) => ({
    size: b.size,
    slice: (a, z) => { const s = b.slice(a, z); lus += s.size; return s; }
  });
  const l = await lire(espion(vrai));
  t("📦 l'archive est lue sans JSZip (répertoire central + entrées demandées)",
    !!l && l.noms.filter((n) => !n.endsWith("/")).length === 304, l && l.noms.length);
  if (!l) return;
  const cfg = JSON.parse(await l.texte("plan/plan-config.json"));
  const pts = JSON.parse(await l.texte("plan/" + cfg.dataLayers[0].file));
  const leg = JSON.parse(await l.texte("plan/data/légende é.json"));
  t("📦 entrées compressées (deflate) et stockées relues à l'identique, noms UTF-8 compris",
    pts.data[0].uid === "pt_a" && leg.ok === "é" && l.a("plan/data/fond.jpg") && !l.a("absent.json"));
  const ko = Math.round(lus / 1024), total = Math.round(vrai.size / 1024);
  t("📦 octets lus : " + ko + " Ko sur " + total + " Ko d'archive (< 2 %) — les images ne sont jamais lues",
    lus < vrai.size * 0.02, { lus: lus, taille: vrai.size });
  const pasZip = await lire(new Blob([new Uint8Array(100)]));
  t("📦 un fichier qui n'est pas un ZIP → null (l'appelant retombe sur JSZip, comme avant)", pasZip === null);
  t("📦 l'analyse passe par _ouvrirArchive (lecture partielle, repli JSZip), plus par JSZip.loadAsync direct",
    /const zip = await _ouvrirArchive\(blob\);/.test(GAL) &&
    (GAL.match(/await window\.JSZip\.loadAsync\(/g) || []).length === 1 &&
    GAL.indexOf("await window.JSZip.loadAsync(") > GAL.indexOf("async function _ouvrirArchive("));
}

// ── 5. Date de prise de vue (EXIF DateTimeOriginal) ──────────────────
// JPEG fabriqués octet par octet : APP0 JFIF, APP1 Exif (IFD0 → sous-IFD Exif → 0x9003), SOS, EOI.
function jpegExif(date, opts) {
  opts = opts || {};
  const le = opts.le !== false;
  const tiff = [];
  const u16 = (v) => le ? [v & 255, v >> 8] : [v >> 8, v & 255];
  const u32 = (v) => le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24]
                        : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  tiff.push(...(le ? [0x49, 0x49] : [0x4D, 0x4D]), ...u16(42), ...u32(8));
  // IFD0 à 8 : une entrée 0x8769 (LONG) → sous-IFD Exif à 26.
  tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(opts.ptrExif || 26), ...u32(0));
  // Sous-IFD Exif à 26 : 0x9003 ASCII 20 → valeur à 44.
  tiff.push(...u16(opts.nbEntrees || 1), ...u16(opts.tag || 0x9003), ...u16(2), ...u32(20), ...u32(opts.offDate || 44), ...u32(0));
  for (let k = 0; k < 19; k++) tiff.push(date.charCodeAt(k));
  tiff.push(0);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app0 = [0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const seg = (m, corps) => [0xFF, m, (corps.length + 2) >> 8, (corps.length + 2) & 255, ...corps];
  const octets = [0xFF, 0xD8, ...seg(0xE0, app0), ...(opts.sansExif ? [] : seg(0xE1, app1)),
    ...seg(0xDB, new Array(65).fill(1)), 0xFF, 0xDA, 0, 8, 1, 1, 0, 0, 63, 0, 0x12, 0x34, 0xFF, 0xD9];
  return new Uint8Array(octets);
}
async function datePriseVue() {
  const lire = (u8) => P.datePriseVueDepuisOctets(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
  const D = "2024:05:17 14:03:09", ISO = "2024-05-17T14:03:09";
  t("📅 JPEG petit-boutiste (II) : DateTimeOriginal lue", lire(jpegExif(D)) === ISO, lire(jpegExif(D)));
  t("📅 JPEG gros-boutiste (MM) : DateTimeOriginal lue", lire(jpegExif(D, { le: false })) === ISO);
  t("📅 DateTimeDigitized (0x9004) en repli de DateTimeOriginal", lire(jpegExif(D, { tag: 0x9004 })) === ISO);
  t("📅 JPEG sans EXIF → null", lire(jpegExif(D, { sansExif: true })) === null);
  const plein = jpegExif(D);
  const FIN_DATE = 2 + 18 + 4 + 6 + 44 + 19;   // SOI, APP0, en-tête APP1, signature Exif, offset puis texte de la date
  let tronquesOk = true, leves = 0;
  for (let n = 0; n < plein.length; n++) {
    try { const r = lire(plein.subarray(0, n)); if (n < FIN_DATE && r !== null) tronquesOk = false; } catch (e) { leves++; }
  }
  t("📅 fichier tronqué à chaque octet : jamais d'exception, jamais de date avant qu'elle soit entière",
    tronquesOk && leves === 0, { leves: leves });
  t("📅 date nulle « 0000:00:00 00:00:00 » → null", lire(jpegExif("0000:00:00 00:00:00")) === null);
  t("📅 date invalide (mois 13) → null", lire(jpegExif("2024:13:01 10:00:00")) === null);
  t("📅 offset de date hors du tampon → null", lire(jpegExif(D, { offDate: 0x7FFFFFF0 })) === null);
  t("📅 pointeur d'IFD Exif hors du tampon → null", lire(jpegExif(D, { ptrExif: 0xFFFFFFF0 })) === null);
  t("📅 nombre d'entrées démesuré → null, sans boucle longue", lire(jpegExif(D, { nbEntrees: 65535 })) === null);
  // Hasard : 2 000 tampons aléatoires, dont la moitié avec un en-tête JPEG.
  let alea = 0, graine = 7;
  const rnd = () => { graine = (graine * 1103515245 + 12345) >>> 0; return graine >>> 24; };
  for (let k = 0; k < 2000; k++) {
    const u8 = new Uint8Array(1 + (rnd() * 4));
    for (let i = 0; i < u8.length; i++) u8[i] = rnd();
    if (k % 2) { u8[0] = 0xFF; if (u8.length > 1) u8[1] = 0xD8; }
    try { lire(u8); } catch (e) { alea++; }
  }
  t("📅 2 000 tampons aléatoires : aucune exception", alea === 0, alea);
  t("📅 entrée qui n'est pas un ArrayBuffer → null", P.datePriseVueDepuisOctets("x") === null && P.datePriseVueDepuisOctets(null) === null);
  // Hors JPEG (HEIC…) : « Exif\0\0 » + TIFF trouvés dans la fenêtre lue.
  const tiff = jpegExif(D).subarray(2 + 18 + 4 + 6);
  const heic = new Uint8Array(300 + tiff.length + 6);
  heic.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
  heic.set([0x45, 0x78, 0x69, 0x66, 0, 0], 300);
  heic.set(tiff, 306);
  t("📅 hors JPEG (boîte ftyp heic + bloc Exif) : date lue par recherche bornée", lire(heic) === ISO, lire(heic));
  t("📅 priseLeValide : chaîne plausible gardée, le reste refusé",
    P.priseLeValide(ISO) === ISO && P.priseLeValide("<b>") === null && P.priseLeValide("2024-05-17") === null &&
    P.priseLeValide("2024-02-30T25:00:00") === null && P.priseLeValide(12) === null);

  idb.lignes.clear();
  await P.restorePhoto(rec("d1", "pt_a", { priseLe: ISO, createdAt: 1700000000000 }), { source: "import" });
  await P.restorePhoto(rec("d2", "pt_a", { priseLe: "<img src=x>", createdAt: "hier" }), { source: "import" });
  const d1 = idb.lignes.get("d1"), d2 = idb.lignes.get("d2");
  t("📅 restorePhoto garde une date de prise de vue valide et la date d'ajout",
    d1.priseLe === ISO && d1.createdAt === 1700000000000, d1);
  t("📅 restorePhoto écarte une date de prise de vue invalide (aucune clé) et une date d'ajout non numérique",
    !("priseLe" in d2) && typeof d2.createdAt === "number" && d2.createdAt > 0, d2);
  const liste = await P.listerPlan("planA");
  t("📅 listerPlan rend priseLe (sans le blob)",
    liste.some((x) => x.id === "d1" && x.priseLe === ISO && !("blob" in x)), liste);

  const PH = fs.readFileSync("js/photos.js", "utf8");
  const add = PH.slice(PH.indexOf("function addPhoto("), PH.indexOf("// ── Lecture ──"));
  t("🔒 addPhoto lit la date sur le blob D'ORIGINE (srcBlob), pas sur le ré-encodé",
    add.indexOf("lireDatePriseVue(srcBlob)") >= 0 && add.indexOf("lireDatePriseVue(finalBlob)") < 0);
  t("🔒 le fichier reste ré-encodé par le canvas (compressBlob sur toute image)",
    add.indexOf("compressBlob(srcBlob, opts)") >= 0);
  t("🔒 compression impossible → photo REFUSÉE (PHOTO_ILLISIBLE), jamais le blob d'origine avec son EXIF",
    add.indexOf("\"PHOTO_ILLISIBLE\"") >= 0 && !/compressBlob\(srcBlob, opts\)\.catch\([\s\S]{0,400}return srcBlob;/.test(add));
  const SE = fs.readFileSync("js/sessionExporter.js", "utf8");
  const i = SE.indexOf("function _entreeIndexPhoto(");
  let prof = 0, corps = "";
  for (let k = SE.indexOf("{", i); k < SE.length; k++) {
    if (SE[k] === "{") prof++;
    else if (SE[k] === "}") { prof--; if (prof === 0) { corps = SE.slice(i, k + 1); break; } }
  }
  const f = vm.runInNewContext("(" + corps + ")");
  const e = f({ pointId: "pt_a", mime: "image/jpeg", size: 3, fiche: null, createdAt: 5, priseLe: ISO }, "a.jpg");
  t("📅 l'entrée de photos/_index.json emporte createdAt et priseLe", e.createdAt === 5 && e.priseLe === ISO, e);
  const strip = SE.slice(SE.indexOf("function _stripperExifPhotos("), SE.indexOf("function _enrichirPointsAvecPhotos("));
  t("🔒 export anonymisé : aucune date de photo recopiée (une date situe un passage)",
    strip.length > 0 && !/priseLe|createdAt/.test(strip));
  const IMP = fs.readFileSync("js/interfaceImportExport.js", "utf8");
  t("📅 l'import de session relit priseLe de l'index et la passe à restorePhoto",
    /priseLe:\s*info\.priseLe/.test(IMP) && /priseLe:\s*p\.priseLe[\s\S]{0,200}siAbsente: true/.test(IMP));
  const PRO = fs.readFileSync("js/profileExportImport.js", "utf8");
  t("📅 le profil emporte priseLe et la vraie date d'ajout (createdAt)",
    /priseLe:\s*ph\.priseLe \|\| undefined/.test(PRO) && /addedAt:\s*ph\.createdAt/.test(PRO) && /priseLe:\s*ph\.priseLe,/.test(PRO));
}

photos().then(cablage).then(fiche).then(archivePartielle).then(datePriseVue).catch(function (e) {
  t("le bac à sable photos s'exécute sans planter — " + (e && e.message), false);
}).then(function () {
  console.log("");
  if (ko) { console.log("⚠️ " + ko + " echec(s)"); process.exit(1); }
  console.log("🎉 photos : rien n'est effacé au réimport, la limite de 5 tient au rattachement, la fiche et la date voyagent");
});
