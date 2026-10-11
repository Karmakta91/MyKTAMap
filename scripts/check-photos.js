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

photos().then(cablage).catch(function (e) {
  t("le bac à sable photos s'exécute sans planter — " + (e && e.message), false);
}).then(function () {
  console.log("");
  if (ko) { console.log("⚠️ " + ko + " echec(s)"); process.exit(1); }
  console.log("🎉 photos : rien n'est effacé au réimport, la limite de 5 tient au rattachement");
});
