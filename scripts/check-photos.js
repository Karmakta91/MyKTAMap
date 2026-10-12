#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📸 check-photos.js — garde-fou pré-commit BLOQUANT (12/10/2026)
// =====================================================================
// Règle produit (KARMA, 10/10/2026) : une photo n'est JAMAIS effacée sans
// confirmation, et un point garde 5 photos au plus.
//
// 🩸 LES CAS RÉELS :
//   1. Réimporter une session ZIP effaçait TOUTES les photos du plan
//      (`deletePhotosForPlan` puis restauration du fichier) — y compris les
//      photos « sans point » gardées pour récupération. Désormais : FUSION
//      (`restorePhoto(…, { siAbsente: true })`), rien d'existant n'est touché.
//   2. Le rattachement depuis 📸 Mes photos ne vérifiait pas la limite de 5.
//   3. La fiche du point (nom, position) ne voyageait pas dans les ZIP de
//      session : une photo dont le point avait disparu n'était plus
//      récupérable (♻️ Recréer) après un réimport.
//
// COMMENT : le VRAI js/photos.js est chargé dans un `vm` sur une fausse
// IndexedDB (Map en mémoire, requêtes asynchrones, transaction qui se ferme
// quand plus rien n'est en attente). On exécute restorePhoto et
// placesPourPoint ; le câblage de l'import et de la galerie est vérifié dans
// le source.
// Falsification : retirer `siAbsente` de l'import, ou la garde de la galerie,
// ou écrire la photo existante dans restorePhoto → rouge.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c, info) => {
  console.log((c ? "✅" : "❌") + " " + n);
  if (!c) { ko++; if (info !== undefined) console.log("   ↳", JSON.stringify(info)); }
};

// ───────── Fausse IndexedDB (le strict nécessaire de photos.js) ─────────
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
  idb.lignes.set("n1", rec("n1", "Salle"));   // rangée sous le NOM (avant la v2.3.0)
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

// ───────── 3. La fiche du point voyage dans les ZIP de session ─────────
// Écriture : un seul helper pour les 3 index (Full, Avancé, Conversion) ; la
// collecte emporte la fiche. Relecture : l'import la lit et la passe à
// restorePhoto. Un ZIP sans fiche (d'avant le 12/10/2026) se relit comme avant.
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

// ───────── 4. Analyse depuis l'accueil : l'archive n'est PAS chargée en entier ─────────
// 🩸 JSZip.loadAsync(blob) lit tout le Blob en mémoire : un plan de 200 Mo coûtait
// 200 Mo de RAM pour lire quelques Ko de points. `_lecteurZipPartiel` (extrait du
// vrai photosGalerie.js) ne lit que le répertoire central et les entrées demandées.
// Mesure : on compte les octets réellement lus par Blob.slice.
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

photos().then(cablage).then(fiche).then(archivePartielle).catch(function (e) {
  t("le bac à sable photos s'exécute sans planter — " + (e && e.message), false);
}).then(function () {
  console.log("");
  if (ko) { console.log("⚠️ " + ko + " echec(s)"); process.exit(1); }
  console.log("🎉 photos : rien n'est effacé au réimport, la limite de 5 tient au rattachement, la fiche voyage");
});
