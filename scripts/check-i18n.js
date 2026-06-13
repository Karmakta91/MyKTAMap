#!/usr/bin/env node
/*!
 * MyKTAMap — check-i18n.js
 * Filet de la migration multilingue (chantier v1.45.x).
 *
 * Vérifie :
 *   1. Parité des dicos : toute clé de fr.json existe en en.json et inversement.
 *   2. Clés appelées mais absentes : tout I18n.t("clé") / data-i18n[-html|-title]="clé"
 *      dans js/*.js + index.html doit exister dans fr.json ET en.json.
 *   3. (Info) Clés orphelines : présentes dans le dico mais jamais appelées.
 *
 * Exit 1 si problème BLOQUANT (parité KO OU clé appelée manquante). Les
 * orphelines sont seulement informatives (exit 0).
 *
 * Usage : node scripts/check-i18n.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LANG_DIR = path.join(ROOT, "lang");
const JS_DIR = path.join(ROOT, "js");

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { console.error("❌ JSON illisible : " + p + " — " + e.message); process.exit(2); }
}

const fr = loadJson(path.join(LANG_DIR, "fr.json"));
const en = loadJson(path.join(LANG_DIR, "en.json"));
const frKeys = new Set(Object.keys(fr));
const enKeys = new Set(Object.keys(en));

let blocking = 0;

// ---- 1. Parité ----
const missingInEn = [...frKeys].filter(k => !enKeys.has(k) && !k.startsWith("_meta"));
const missingInFr = [...enKeys].filter(k => !frKeys.has(k) && !k.startsWith("_meta"));
if (missingInEn.length) { blocking++; console.error("❌ Clés en fr.json absentes de en.json (" + missingInEn.length + ") :\n   " + missingInEn.join("\n   ")); }
if (missingInFr.length) { blocking++; console.error("❌ Clés en en.json absentes de fr.json (" + missingInFr.length + ") :\n   " + missingInFr.join("\n   ")); }
if (!missingInEn.length && !missingInFr.length) console.log("✅ Parité fr/en OK (" + frKeys.size + " clés)");

// ---- 2. Clés appelées ----
const called = new Set();
function stripComments(src) {
  // Retire commentaires bloc /* */, HTML <!-- -->, et ligne // (évite les
  // faux positifs sur les exemples en commentaire, ex. `I18n.t("cle")`).
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}
function scanFile(file) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  let m;
  const reT = /I18n\.t\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = reT.exec(src)) !== null) called.add(m[1]);
  const reAttr = /data-i18n(?:-html|-title)?\s*=\s*"([^"]+)"/g;
  while ((m = reAttr.exec(src)) !== null) called.add(m[1]);
}
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith(".js")) scanFile(p);
  }
}
walk(JS_DIR);
scanFile(path.join(ROOT, "index.html"));

// Ignore les clés à construction DYNAMIQUE : I18n.t("prefix." + var) capture le
// littéral "prefix." (terminé par un point) → ce n'est pas une vraie clé.
const calledLiteral = [...called].filter(k => !k.endsWith("."));
const dynamicPrefixes = [...called].filter(k => k.endsWith("."));
const calledMissing = calledLiteral.filter(k => !frKeys.has(k) || !enKeys.has(k));
if (calledMissing.length) {
  blocking++;
  console.error("❌ Clés appelées mais absentes d'un dico (" + calledMissing.length + ") :\n   " + calledMissing.join("\n   "));
} else {
  console.log("✅ Toutes les clés appelées (" + called.size + ") existent dans fr + en");
}

// ---- 3. Orphelines (info) ----
// Exclut les clés couvertes par un préfixe dynamique (ex. "legendui.label."
// → "legendui.label.salle" est utilisée via concat, pas orpheline).
const orphans = [...frKeys].filter(k =>
  !k.startsWith("_meta") &&
  !called.has(k) &&
  !dynamicPrefixes.some(p => k.startsWith(p))
);
if (orphans.length) {
  console.log("ℹ️  Clés dico jamais appelées (" + orphans.length + ") — info, pas bloquant" +
              (orphans.length <= 40 ? " :\n   " + orphans.join("\n   ") : " (liste tronquée)."));
}

if (blocking) { console.error("\n❌ check-i18n : " + blocking + " problème(s) bloquant(s)."); process.exit(1); }
console.log("\n✅ check-i18n : tout est cohérent.");
process.exit(0);
