#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// check-entete-licence.js — garde-fou pre-commit BLOQUANT : en-tête de licence des scripts servis
// =====================================================================
// Tout script SERVI (js/*.js + sw.js) porte auteur + CC BY-NC-SA 4.0 ; le `/*!` survit à une minification.
// Sans ce contrôle, chaque nouveau module naît sans en-tête.
// Règle : dans les 15 premières lignes, « Flavien VIDAL » ET « CC BY-NC-SA » (formes courte et longue).
// En-tête à copier pour un nouveau fichier :
//   /*!
//    * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
//    * https://myktamap.fr — Licence CC BY-NC-SA 4.0
//    * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
//    */
// Usage : node scripts/check-entete-licence.js   (appelé par .githooks/pre-commit)
// =====================================================================
"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");

function aEntete(texte) {
  const tete = texte.split(/\r?\n/).slice(0, 15).join("\n");
  return tete.indexOf("Flavien VIDAL") >= 0 && tete.indexOf("CC BY-NC-SA") >= 0;
}

// Auto-test : chaque sabotage doit rougir, chaque forme valide passer
const SABOTAGES = [
  "// =========\n// MAP.JS\n",                                       // aucun en-tête
  "/*!\n * MyKTAMap (c) 2026 Flavien VIDAL\n */\n",                    // auteur sans licence
  "\n".repeat(20) + "/* Flavien VIDAL — CC BY-NC-SA */\n",            // en-tête trop bas
];
const VALIDES = [
  "/*!\n * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)\n * https://myktamap.fr — Licence CC BY-NC-SA 4.0\n */\n",
  "﻿/*!\r\n * (c) 2026 Flavien VIDAL (alias KARMA)\r\n *\r\n * Licence : CC BY-NC-SA 4.0\r\n */\r\n",
];
const autoTest = SABOTAGES.filter(aEntete).length + VALIDES.filter((v) => !aEntete(v)).length;
if (autoTest) {
  console.error("❌ [check-entete-licence] l'auto-test échoue : la règle ne distingue plus un en-tête valide.");
  process.exit(1);
}

let fichiers;
try {
  fichiers = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "js/*.js", "sw.js"],
    { encoding: "utf8" }).split("\n").filter(Boolean);
} catch (e) {
  console.error("❌ [check-entete-licence] git ls-files impossible : " + e.message);
  process.exit(1);
}

const manquants = fichiers.filter((f) => fs.existsSync(f) && !aEntete(fs.readFileSync(f, "utf8")));
if (manquants.length) {
  console.error("❌ [check-entete-licence] " + manquants.length + " fichier(s) servi(s) sans en-tête de licence :");
  manquants.forEach((f) => console.error("   - " + f));
  console.error("   → copier l'en-tête décrit en tête de scripts/check-entete-licence.js.");
  process.exit(1);
}
console.log("✅ [check-entete-licence] " + fichiers.length + " fichiers servis portent l'en-tête de licence.");
