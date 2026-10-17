#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-export-anonyme.js — garde-fou pré-commit BLOQUANT : l'export anonymisé ne livre aucun nom réel
// =====================================================================
// 🔒 L'export « anonymisé » est fait pour être partagé publiquement : une seule clé oubliée livre le nom
// d'un réseau ou d'un point réel. 🩸 Exemple : les liaisons inter-plan portent un instantané
// { planName, pointNom } de chaque côté ; une clé ajoutée à l'export complet et oubliée par l'anonymiseur
// fuit sans bruit tant que personne n'EXÉCUTE l'anonymiseur.
// `_anonymiserSession` est EXTRAITE de js/sessionExporter.js et exécutée dans un `vm` sur une session piégée
// (chaque texte identifiant contient un marqueur). Le marqueur est cherché dans TOUT le JSON produit : une
// clé nouvelle oubliée fait échouer le script, même si personne n'a pensé à la lister ici.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const SRC = fs.readFileSync("js/sessionExporter.js", "utf8");

function extraireFonction(src, nom) {
  const debut = src.indexOf("function " + nom + "(");
  if (debut < 0) return null;
  const ouv = src.indexOf("{", debut);
  let prof = 0;
  for (let i = ouv; i < src.length; i++) {
    if (src[i] === "{") prof++;
    else if (src[i] === "}") { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  return null;
}

const code = extraireFonction(SRC, "_anonymiserSession");
t("_anonymiserSession est extractible de js/sessionExporter.js", !!code);
if (!code) process.exit(1);

const M = "SECRET";   // marqueur : tout texte identifiant le contient
const session = {
  type: "devmap-session",
  version: "1.0",
  date_export: "2026-10-04T10:00:00.000Z",
  editorPoints: [
    { id: M + " Salle", nom: M + " Salle", x: 10, y: 20, tags: ["salle"], etat: "",
      description: M + " description", profondeur: 12, date_update: "2026-10-01", source: "editor", uid: "pt_UIDMARK1", updatedAt: 1759572000000 },
    { id: M + " Puits", nom: M + " Puits", x: 30, y: 40, tags: [], description: "",
      date_update: "2026-10-02", source: "editor", photos: ["p1"] }
  ],
  roads: [{ type: "principal", points: [[1, 2], [3, 4]], label: M + " galerie", description: M + " note", uid: "rd_UIDMARK2", updatedAt: 1759572000000 }],
  zones: [{ type: "eau", points: [[1, 1], [2, 2], [3, 1]], description: M + " zone", uid: "zn_UIDMARK3", updatedAt: 1759572000000 }],
  structures: [{ type: "pilier-1", points: [[5, 5], [6, 6], [7, 5]], description: M + " pilier", uid: "st_UIDMARK4", updatedAt: 1759572000000 }],
  measure: { points: [] },
  measureSurface: { points: [] },
  tombstones: [{ uid: "pt_UIDMARK5", deletedAt: 1759572000000 }],
  interPlanLinks: [{
    id: "lk1",
    a: { planId: "server_" + M, planName: M + " Réseau", pointId: M + " Salle", pointNom: M + " Salle", x: 10, y: 20 },
    b: { planId: "local_" + M, planName: M + " Autre", pointId: M + " P", pointNom: M + " P", x: 1, y: 2 }
  }],
  tracker: { positions: [{ x: 1, y: 2, t: 1 }], label: M },
  noteLibre: M + " note libre",
  user: { nom: M }, userProfile: { surnom: M }, author: M
};

// Les photos portent la FICHE de leur point (nom, position) dans l'index des ZIP de session
const photos = [{ id: "ph1", pointId: "pt_UIDMARK1", mime: "image/jpeg", size: 1, blob: null,
  fiche: { nom: M + " Salle", x: 10, y: 20, niveau: null, type: "salle", maj: 1 } }];
const enrichir = extraireFonction(SRC, "_enrichirPointsAvecPhotos");
t("_enrichirPointsAvecPhotos est extractible de js/sessionExporter.js", !!enrichir);
const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
let out = null;
try {
  vm.runInContext(code + ";" + (enrichir || "") + "; this.__out = _anonymiserSession(__s, __p);",
    Object.assign(ctx, { __s: session, __p: photos }));
  out = ctx.__out;
} catch (e) {
  t("_anonymiserSession s'exécute — " + e.message, false);
}
t("📸 la fiche du point (nom réel, position) est retirée des photos anonymisées",
  photos.every((p) => !("fiche" in p)) && JSON.stringify(photos).indexOf(M) < 0);

if (out) {
  t("🩸 les liaisons inter-plan (vrais noms de plan et de point) sont retirées", !("interPlanLinks" in out));
  t("le tracker (géo-historique daté) est retiré", !("tracker" in out));
  t("la note libre est retirée", !("noteLibre" in out));
  t("le profil utilisateur est retiré", !("user" in out) && !("userProfile" in out) && !("author" in out));
  t("la session est marquée anonymisée", out.anonymized === true && typeof out.anonymizedAt === "string");
  t("la géométrie est conservée (x/y du 1er point)", out.editorPoints && out.editorPoints[0].x === 10 && out.editorPoints[0].y === 20);
  const json = JSON.stringify(out);
  // 🔒 un uid relierait le fichier anonymisé à la session d'origine
  t("🆔 aucun identifiant stable (uid) ne survit", json.indexOf("UIDMARK") < 0);
  t("🆔 aucun horodatage de modification (updatedAt) ne survit", json.indexOf("updatedAt") < 0);
  const i = json.indexOf(M);
  t("🔒 AUCUN texte identifiant ne survit, quelle que soit la clé" +
    (i >= 0 ? " — trouvé : …" + json.slice(Math.max(0, i - 60), i + 30) + "…" : ""), i < 0);
}

console.log("");
if (ko) {
  console.log("⚠️ " + ko + " echec(s)");
  process.exit(1);
}
console.log("🎉 export anonymisé : aucun nom réel ne sort");
