#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// garde-fous-tableau.js — tableau de bord des garde-fous (NON bloquant)
// =====================================================================
// Lance un par un chaque script appelé par .githooks/pre-commit (liste LUE dans le hook, seule source de
// vérité), mesure durée et résultat, écrit un tableau Markdown (`--json` : la même chose en JSON).
// Le pre-commit s'arrête au premier rouge ; ce tableau montre TOUS les résultats et où part le temps
// (CI : résumé du job). Sort toujours en 0 (sauf hook illisible) : le verdict reste celui du pre-commit.
// Statuts : OK · ÉCHEC (bloquant rouge) · AVERTI (consultatif rouge : appelé sans `|| exit`).
// Usage : node scripts/garde-fous-tableau.js [--json]
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RACINE = path.resolve(__dirname, "..");
const HOOK = path.join(RACINE, ".githooks", "pre-commit");
const JSON_OUT = process.argv.includes("--json");

function lireGardeFous() {
  const lignes = fs.readFileSync(HOOK, "utf8").split(/\r?\n/);
  const liste = [];
  lignes.forEach(function (l) {
    const m = l.match(/^\s*node\s+(scripts\/[\w.-]+\.js)(.*)$/);
    if (!m) return;
    liste.push({ script: m[1], bloquant: /\|\|\s*exit/.test(m[2]) });
  });
  return liste;
}

// Première ligne parlante d'une sortie en échec (colonne « détail »)
function detail(sortie) {
  const l = String(sortie || "").split(/\r?\n/).map(function (s) { return s.trim(); })
    .filter(function (s) { return s && /❌|⛔|erreur|error|échec|refus/i.test(s); })[0] || "";
  return l.slice(0, 140);
}

let gardeFous;
try {
  gardeFous = lireGardeFous();
} catch (e) {
  console.error("[garde-fous-tableau] hook illisible : " + HOOK + " (" + e.message + ")");
  process.exit(2);
}
if (!gardeFous.length) {
  console.error("[garde-fous-tableau] aucun `node scripts/….js` trouvé dans " + HOOK);
  process.exit(2);
}

const resultats = gardeFous.map(function (g) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [g.script], {
    cwd: RACINE, encoding: "utf8", env: process.env, maxBuffer: 32 * 1024 * 1024
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const code = r.error ? -1 : r.status;
  const statut = code === 0 ? "OK" : (g.bloquant ? "ÉCHEC" : "AVERTI");
  return {
    nom: path.basename(g.script, ".js"),
    script: g.script,
    bloquant: g.bloquant,
    dureeMs: Math.round(ms),
    code: code,
    statut: statut,
    detail: code === 0 ? "" : (r.error ? String(r.error.message)
      : (detail((r.stderr || "") + "\n" + (r.stdout || "")) || "code de sortie " + code))
  };
});

const total = resultats.reduce(function (s, r) { return s + r.dureeMs; }, 0);
const bilan = {
  total: resultats.length,
  ok: resultats.filter(function (r) { return r.statut === "OK"; }).length,
  echecs: resultats.filter(function (r) { return r.statut === "ÉCHEC"; }).length,
  avertis: resultats.filter(function (r) { return r.statut === "AVERTI"; }).length,
  dureeTotaleMs: total
};

if (JSON_OUT) {
  console.log(JSON.stringify({ bilan: bilan, garde_fous: resultats }, null, 2));
  process.exit(0);
}

const ICONE = { "OK": "✅ OK", "ÉCHEC": "❌ ÉCHEC", "AVERTI": "⚠️ AVERTI" };
const sec = function (ms) { return (ms / 1000).toFixed(2) + " s"; };
const lents = resultats.slice().sort(function (a, b) { return b.dureeMs - a.dureeMs; }).slice(0, 5);

console.log("## 📊 Garde-fous du pre-commit — tableau de bord");
console.log("");
console.log("**" + bilan.ok + "/" + bilan.total + " OK** · " + bilan.echecs + " échec(s) bloquant(s) · " +
  bilan.avertis + " avertissement(s) · durée cumulée " + sec(total) +
  " · 5 plus lents : " + lents.map(function (r) { return r.nom + " (" + sec(r.dureeMs) + ")"; }).join(", "));
console.log("");
console.log("| # | Garde-fou | Type | Durée | Statut | Détail |");
console.log("|---:|---|---|---:|---|---|");
resultats.forEach(function (r, i) {
  console.log("| " + (i + 1) + " | `" + r.nom + "` | " + (r.bloquant ? "bloquant" : "consultatif") + " | " +
    sec(r.dureeMs) + " | " + ICONE[r.statut] + " | " + r.detail.replace(/\|/g, "\\|") + " |");
});
console.log("");
console.log("_Tableau indicatif, non bloquant : le verdict reste celui de `.githooks/pre-commit`._");
process.exit(0);
