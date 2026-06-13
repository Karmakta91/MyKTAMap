#!/usr/bin/env node
/*!
 * MyKTAMap — merge-i18n-frags3.js
 * Fusion des fragments TRI-LANGUE produits par les agents de la Phase B (rattrapage
 * du FR codé en dur). Chaque fragment lang/_frag3_*.json est au format :
 *   { "prefixe.cle": { "fr": "…", "en": "…", "es": "…" }, ... }
 * Ce script applique chaque clé dans fr.json + en.json + es.json EN MÊME TEMPS
 * (parité garantie), trie, réécrit les 3 dicos, supprime les fragments.
 *
 * Garde-fous : fr/en/es string requis ; parité des {param} entre les 3 ;
 * collision = valeur existante différente → warn (n'écrase pas silencieusement).
 *
 * Usage : node scripts/merge-i18n-frags3.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const LANG = path.resolve(__dirname, "..", "lang");

function load(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function params(str) {
  const s = new Set(); if (typeof str !== "string") return s;
  let m; const re = /\{(\w+)\}/g; while ((m = re.exec(str)) !== null) s.add(m[1]); return s;
}
function sameSet(a, b) { return a.size === b.size && [...a].every(x => b.has(x)); }

const frP = path.join(LANG, "fr.json"), enP = path.join(LANG, "en.json"), esP = path.join(LANG, "es.json");
const fr = load(frP), en = load(enP), es = load(esP);

const frags = fs.readdirSync(LANG).filter(f => /^_frag3_.*\.json$/.test(f));
if (!frags.length) { console.log("ℹ️  Aucun fragment _frag3_*.json."); process.exit(0); }

let added = 0, collisions = 0, paramErr = 0;
const colList = [], paramList = [];
for (const f of frags) {
  let obj;
  try { obj = load(path.join(LANG, f)); }
  catch (e) { console.error("❌ Fragment illisible : " + f + " — " + e.message); process.exit(1); }
  let n = 0;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("_")) continue;   // ignore _meta/_comment parasites d'agent
    const e = obj[key];
    if (!e || typeof e.fr !== "string" || typeof e.en !== "string" || typeof e.es !== "string") {
      console.error("❌ " + f + " : clé \"" + key + "\" mal formée (fr/en/es string requis)."); process.exit(1);
    }
    const pf = params(e.fr);
    if (!sameSet(pf, params(e.en)) || !sameSet(pf, params(e.es))) { paramErr++; paramList.push(f + " : " + key); }
    if (fr[key] !== undefined && fr[key] !== e.fr) { collisions++; colList.push(f + " : " + key + " (fr diffère)"); }
    if (fr[key] === undefined) { added++; n++; }
    fr[key] = e.fr; en[key] = e.en; es[key] = e.es;
  }
  console.log("  · " + f + " → " + Object.keys(obj).length + " clés (" + n + " nouvelles)");
}

function sortKeys(o) {
  const keys = Object.keys(o).sort(function(a, b) {
    const am = a.startsWith("_meta"), bm = b.startsWith("_meta");
    if (am && !bm) return -1; if (!am && bm) return 1;
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  const out = {}; for (const k of keys) out[k] = o[k]; return out;
}
fs.writeFileSync(frP, JSON.stringify(sortKeys(fr), null, 2) + "\n", "utf8");
fs.writeFileSync(enP, JSON.stringify(sortKeys(en), null, 2) + "\n", "utf8");
fs.writeFileSync(esP, JSON.stringify(sortKeys(es), null, 2) + "\n", "utf8");
for (const f of frags) fs.unlinkSync(path.join(LANG, f));

console.log("\n✅ Fusion 3-langues : +" + added + " nouvelles clés · fr/en/es à " +
            Object.keys(fr).length + "/" + Object.keys(en).length + "/" + Object.keys(es).length +
            " · " + frags.length + " fragment(s) consommé(s).");
if (paramErr)   console.warn("⚠️  " + paramErr + " clé(s) {param} divergent fr/en/es :\n   " + paramList.slice(0, 30).join("\n   "));
if (collisions) console.warn("⚠️  " + collisions + " collision(s) (valeur fr écrasée) :\n   " + colList.slice(0, 30).join("\n   "));
