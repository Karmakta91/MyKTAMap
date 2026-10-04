#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔒 check-export-anonyme.js — garde-fou pré-commit BLOQUANT (v2.0.1)
// =====================================================================
// L'export « anonymisé » est fait pour être PARTAGÉ publiquement. Une seule
// clé oubliée suffit à livrer le nom d'un réseau ou d'un point réel.
//
// 🩸 LE CAS RÉEL (v2.0.1) : les liaisons inter-plan, ajoutées à l'export
// complet en v1.57.0, portent un instantané { planName, pointNom } de chaque
// côté. `_anonymiserSession` ne les a jamais retirées : pendant 40 versions,
// un export anonymisé contenait les vrais noms. Aucun garde-fou ne l'avait vu,
// parce qu'aucun n'exécutait l'anonymiseur.
//
// COMMENT : `_anonymiserSession` est EXTRAITE du vrai sessionExporter.js et
// exécutée dans un `vm` sur une session piégée, dont chaque texte identifiant
// contient un marqueur. Le contrôle final cherche le marqueur dans TOUT le
// JSON produit : une clé ajoutée demain à l'export complet et oubliée ici
// fera échouer le script, même si personne n'a pensé à l'y lister.
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
      description: M + " description", profondeur: 12, date_update: "2026-10-01", source: "editor" },
    { id: M + " Puits", nom: M + " Puits", x: 30, y: 40, tags: [], description: "",
      date_update: "2026-10-02", source: "editor", photos: ["p1"] }
  ],
  roads: [{ type: "principal", points: [[1, 2], [3, 4]], label: M + " galerie", description: M + " note" }],
  zones: [{ type: "eau", points: [[1, 1], [2, 2], [3, 1]], description: M + " zone" }],
  structures: [{ type: "pilier-1", points: [[5, 5], [6, 6], [7, 5]], description: M + " pilier" }],
  measure: { points: [] },
  measureSurface: { points: [] },
  interPlanLinks: [{
    id: "lk1",
    a: { planId: "server_" + M, planName: M + " Réseau", pointId: M + " Salle", pointNom: M + " Salle", x: 10, y: 20 },
    b: { planId: "local_" + M, planName: M + " Autre", pointId: M + " P", pointNom: M + " P", x: 1, y: 2 }
  }],
  tracker: { positions: [{ x: 1, y: 2, t: 1 }], label: M },
  noteLibre: M + " note libre",
  user: { nom: M }, userProfile: { surnom: M }, author: M
};

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
let out = null;
try {
  vm.runInContext(code + "; this.__out = _anonymiserSession(__s, []);", Object.assign(ctx, { __s: session }));
  out = ctx.__out;
} catch (e) {
  t("_anonymiserSession s'exécute — " + e.message, false);
}

if (out) {
  t("🩸 les liaisons inter-plan (vrais noms de plan et de point) sont retirées", !("interPlanLinks" in out));
  t("le tracker (géo-historique daté) est retiré", !("tracker" in out));
  t("la note libre est retirée", !("noteLibre" in out));
  t("le profil utilisateur est retiré", !("user" in out) && !("userProfile" in out) && !("author" in out));
  t("la session est marquée anonymisée", out.anonymized === true && typeof out.anonymizedAt === "string");
  t("la géométrie est conservée (x/y du 1er point)", out.editorPoints && out.editorPoints[0].x === 10 && out.editorPoints[0].y === 20);
  const json = JSON.stringify(out);
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
