#!/usr/bin/env node
/*!
 * MyKTAMap — merge-es-frags.js
 * Fusion des fragments de traduction ESPAGNOLE (chantier ES, WIP) produits par
 * les sous-agents. Chaque agent écrit lang/_esfrag_*.json au format PLAT
 * { "prefixe.cle": "valor ES", ... } (string par clé, PAS d'objet {fr,en}).
 * Ce script :
 *   1. lit es.json (partiel) + fr.json (référence),
 *   2. applique chaque fragment dans es.json,
 *   3. GARDE-FOUS : valeur non-string → erreur ; clé absente de fr.json
 *      (fantôme) → ignorée + warn ; {param} divergent de fr → warn (non bloquant
 *      ici, check-i18n le re-vérifiera),
 *   4. réécrit es.json trié (_meta en tête, format identique à fr/en),
 *   5. supprime les fragments consommés.
 *
 * Usage : node scripts/merge-es-frags.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LANG = path.join(ROOT, "lang");

function load(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function params(str) {
  const set = new Set();
  if (typeof str !== "string") return set;
  let m; const re = /\{(\w+)\}/g;
  while ((m = re.exec(str)) !== null) set.add(m[1]);
  return set;
}

const esPath = path.join(LANG, "es.json");
const es = load(esPath);
const fr = load(path.join(LANG, "fr.json"));

const frags = fs.readdirSync(LANG).filter(f => /^_esfrag_.*\.json$/.test(f));
if (!frags.length) { console.log("ℹ️  Aucun fragment _esfrag_*.json à fusionner."); process.exit(0); }

let added = 0, ghosts = 0, paramWarn = 0;
const ghostList = [], paramList = [];

for (const f of frags) {
  let obj;
  try { obj = load(path.join(LANG, f)); }
  catch (e) { console.error("❌ Fragment illisible : " + f + " — " + e.message); process.exit(1); }
  let n = 0;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val !== "string") {
      console.error("❌ " + f + " : clé \"" + key + "\" mal formée (string ES requise, reçu " + typeof val + ")."); process.exit(1);
    }
    if (fr[key] === undefined) { ghosts++; ghostList.push(f + " : " + key); continue; }
    const pf = params(fr[key]), pe = params(val);
    if ([...pf].some(x => !pe.has(x)) || [...pe].some(x => !pf.has(x))) { paramWarn++; paramList.push(key); }
    if (es[key] === undefined) added++;
    es[key] = val; n++;
  }
  console.log("  · " + f + " → " + n + " clés");
}

function sortKeys(o) {
  const keys = Object.keys(o).sort(function(a, b) {
    const am = a.startsWith("_meta"), bm = b.startsWith("_meta");
    if (am && !bm) return -1;
    if (!am && bm) return 1;
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  const out = {};
  for (const k of keys) out[k] = o[k];
  return out;
}

fs.writeFileSync(esPath, JSON.stringify(sortKeys(es), null, 2) + "\n", "utf8");
for (const f of frags) fs.unlinkSync(path.join(LANG, f));

console.log("\n✅ Fusion ES : +" + added + " nouvelles clés · " + Object.keys(es).length + " total · " + frags.length + " fragment(s) consommé(s).");
if (ghosts)    console.warn("⚠️  " + ghosts + " clé(s) fantôme(s) (absente(s) de fr.json) ignorée(s) :\n   " + ghostList.slice(0, 30).join("\n   "));
if (paramWarn) console.warn("⚠️  " + paramWarn + " clé(s) avec {param} divergent vs fr (à vérifier) :\n   " + paramList.slice(0, 30).join("\n   "));
