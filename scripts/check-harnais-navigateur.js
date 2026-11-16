#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-harnais-navigateur.js — garde-fou pre-commit BLOQUANT : les harnais lancent leur navigateur par le lanceur commun
// =====================================================================
// scripts/smoke/navigateur.js suit chaque navigateur lancé, le ferme sur fermerTout() et coupe un harnais bloqué au-delà
// de KTA_DELAI_HARNAIS_MS : un navigateur lancé ailleurs (chromium.launch, webkit.launchPersistentContext… en direct)
// échappe à ce filet et peut rester ouvert tant que le harnais vit (navigateurs de test qui saturent le poste).
// Règle, sur scripts/smoke/*.js hors navigateur.js : aucun appel direct à `.launch(` / `.launchPersistentContext(` /
// `.launchServer(` → lancerNavigateur / lancerMoteur / lancerPersistant (require("./navigateur.js")).
// Usage : node scripts/check-harnais-navigateur.js (appelé par .githooks/pre-commit)
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const DOSSIER = path.join(__dirname, "smoke");
const LANCEUR = "navigateur.js";
const RE_LANCEMENT = /\.(launch|launchPersistentContext|launchServer)\s*\(/;

function fautes(nom, texte) {
  const out = [];
  texte.split(/\r?\n/).forEach(function (l, i) {
    const t = l.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;   // commentaire
    if (RE_LANCEMENT.test(l)) out.push(nom + ":" + (i + 1) + "  " + t.slice(0, 100));
  });
  return out;
}

// Auto-test : chaque sabotage doit être vu, chaque cas sain laissé passer.
const SABOTAGES = [
  "const nav = await chromium.launch();",
  "const nav = await chromium.launch({ headless: true });",
  "const wk = await pw.webkit.launch(opts);",
  "const ctx = await chromium.launchPersistentContext(dossier, {});",
  "const srv = await chromium.launchServer();",
];
const SAINS = [
  "const nav = await lancerNavigateur(chromium);",
  "const nav = await lancerMoteur(\"webkit\");",
  "const ctx = await lancerPersistant(\"chromium\", dossier, {});",
  "// jamais chromium.launch() en direct : le lanceur commun",
  "page.on(\"popup\", function () {});",
];
const rate = SABOTAGES.filter(function (c) { return fautes("a.js", c).length === 0; });
const faux = SAINS.filter(function (c) { return fautes("a.js", c).length > 0; });
if (rate.length || faux.length) {
  console.error("❌ [check-harnais-navigateur] l'auto-test échoue :");
  rate.forEach(function (c) { console.error("   non vu : " + c); });
  faux.forEach(function (c) { console.error("   faux positif : " + c); });
  process.exit(1);
}

const fichiers = fs.readdirSync(DOSSIER).filter(function (f) { return /\.js$/.test(f) && f !== LANCEUR; });
const toutes = [];
fichiers.forEach(function (f) {
  fautes(f, fs.readFileSync(path.join(DOSSIER, f), "utf8")).forEach(function (x) { toutes.push(x); });
});
if (toutes.length) {
  console.error("❌ [check-harnais-navigateur] " + toutes.length + " navigateur(s) lancé(s) hors du lanceur commun :");
  toutes.forEach(function (x) { console.error("   - scripts/smoke/" + x); });
  console.error("   → lancerNavigateur / lancerMoteur / lancerPersistant (scripts/smoke/navigateur.js) : suivis, fermés à la " +
    "sortie, coupés au-delà de KTA_DELAI_HARNAIS_MS.");
  process.exit(1);
}
console.log("✅ [check-harnais-navigateur] " + fichiers.length + " harnais : navigateurs lancés par le lanceur commun.");
