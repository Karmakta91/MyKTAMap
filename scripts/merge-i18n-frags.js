#!/usr/bin/env node
/*!
 * MyKTAMap — merge-i18n-frags.js
 * Fusion centrale des fragments de dico produits par les sous-agents de
 * migration (chantier multilingue). Chaque agent écrit lang/_frag_*.json au
 * format { "prefixe.cle": { "fr": "...", "en": "..." }, ... }. Ce script :
 *   1. lit fr.json + en.json,
 *   2. applique tous les fragments (fr → fr.json, en → en.json),
 *   3. réécrit fr.json + en.json triés par clé (_meta en tête),
 *   4. supprime les fragments consommés.
 *
 * Sécurités : avertit sur écrasement d'une clé existante avec une valeur
 * DIFFÉRENTE (collision réelle) ; ignore silencieusement les ré-écritures
 * identiques (idempotent).
 *
 * Usage : node scripts/merge-i18n-frags.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LANG = path.join(ROOT, "lang");

function load(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

const frPath = path.join(LANG, "fr.json");
const enPath = path.join(LANG, "en.json");
const fr = load(frPath);
const en = load(enPath);

const frags = fs.readdirSync(LANG).filter(f => /^_frag_.*\.json$/.test(f));
if (!frags.length) { console.log("ℹ️  Aucun fragment _frag_*.json à fusionner."); process.exit(0); }

let added = 0, collisions = 0;
const collisionList = [];
for (const f of frags) {
  let obj;
  try { obj = load(path.join(LANG, f)); }
  catch (e) { console.error("❌ Fragment illisible : " + f + " — " + e.message); process.exit(1); }
  for (const key of Object.keys(obj)) {
    const entry = obj[key];
    if (!entry || typeof entry.fr !== "string" || typeof entry.en !== "string") {
      console.error("❌ " + f + " : clé \"" + key + "\" mal formée (fr/en string requis)."); process.exit(1);
    }
    if (fr[key] !== undefined && fr[key] !== entry.fr) { collisions++; collisionList.push(f + " : " + key + " (fr diffère)"); }
    if (en[key] !== undefined && en[key] !== entry.en) { collisions++; collisionList.push(f + " : " + key + " (en diffère)"); }
    if (fr[key] === undefined) added++;
    fr[key] = entry.fr;
    en[key] = entry.en;
  }
  console.log("  · " + f + " → " + Object.keys(obj).length + " clés");
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

fs.writeFileSync(frPath, JSON.stringify(sortKeys(fr), null, 2) + "\n", "utf8");
fs.writeFileSync(enPath, JSON.stringify(sortKeys(en), null, 2) + "\n", "utf8");

// Nettoyage des fragments consommés
for (const f of frags) fs.unlinkSync(path.join(LANG, f));

console.log("\n✅ Fusion : +" + added + " nouvelles clés · " + Object.keys(fr).length + " total · " + frags.length + " fragment(s) consommé(s).");
if (collisions) { console.warn("⚠️  " + collisions + " collision(s) (valeur écrasée) :\n   " + collisionList.join("\n   ")); }
