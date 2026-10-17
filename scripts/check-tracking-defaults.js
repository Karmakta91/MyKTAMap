#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-tracking-defaults.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Refuse un réglage de podomètre (`stepLength`, `stepThreshold`,
// `stepCooldown`) recopié en dur avec une valeur différente de l'usine,
// déclarée une seule fois dans `js/config.js > DEFAULT_CONFIG`.
// 🩸 Une copie plausible à l'œil peut être fausse d'un facteur 11 : `tracking.js`
// compare `stepThreshold` à la magnitude de `accelerationIncludingGravity`, qui
// vaut déjà ~9,81 téléphone posé. Un seuil de 1.2 est vrai en permanence et
// fabrique des pas à l'arrêt (distance fantôme dans Carnet, stats, historique).
// Portée : littéraux numériques affectés à l'une des trois clés dans `js/`
// (objet, repli `??`, `value=` d'un champ de saisie). Une valeur lue depuis
// `KTA_TRACKING_USINE` ou `DEFAULT_CONFIG` n'est pas une copie.
// =====================================================================

const fs = require("fs");
const path = require("path");

const DIR = "js";
const CLES = ["stepLength", "stepThreshold", "stepCooldown"];

// ── 1) la source de vérité ───────────────────────────────────────────────
let usine;
try {
  const cfg = fs.readFileSync(path.join(DIR, "config.js"), "utf8");
  // Le bloc `let DEFAULT_CONFIG = { … };` — le PREMIER, avant toute mutation.
  const bloc = cfg.match(/let DEFAULT_CONFIG = \{[\s\S]*?\n\};/);
  if (!bloc) throw new Error("bloc DEFAULT_CONFIG introuvable");
  usine = {};
  CLES.forEach(function (k) {
    const m = bloc[0].match(new RegExp(k + "\\s*:\\s*(-?[0-9.]+)"));
    if (!m) throw new Error("clé " + k + " absente de DEFAULT_CONFIG");
    usine[k] = parseFloat(m[1]);
  });
} catch (e) {
  console.error("❌ [check-tracking-defaults] " + e.message);
  process.exit(2);
}

// ── 2) toute autre valeur littérale doit concorder ───────────────────────
let fichiers;
try {
  fichiers = fs.readdirSync(DIR).filter(function (n) { return n.endsWith(".js"); });
} catch (e) {
  console.error("❌ [check-tracking-defaults] " + DIR + " illisible : " + e.message);
  process.exit(2);
}

// Formes : `stepLength: 0.7`, `?? 0.7`, `id="…stepLength" … value="0.7"`.
const RE_OBJ = new RegExp("\\b(" + CLES.join("|") + ")\\s*:\\s*(-?[0-9]+(?:\\.[0-9]+)?)", "g");
const RE_REPLI = new RegExp("\\b(" + CLES.join("|") + ")[^\\n]*?\\?\\?\\s*(-?[0-9]+(?:\\.[0-9]+)?)", "g");
const RE_INPUT = new RegExp("id=\"[a-z_]*(" + CLES.join("|") +
  ")\"[^\\n]*?value=\"(-?[0-9]+(?:\\.[0-9]+)?)\"", "gi");

const ecarts = [];
fichiers.forEach(function (nom) {
  if (nom === "config.js") return;   // la source elle-même
  const src = fs.readFileSync(path.join(DIR, nom), "utf8");
  const lignes = src.split(/\r?\n/);
  lignes.forEach(function (ligne, i) {
    const nu = ligne.trim();
    if (nu.startsWith("//") || nu.startsWith("*") || nu.startsWith("/*")) return;
    [RE_OBJ, RE_REPLI, RE_INPUT].forEach(function (re) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(ligne)) !== null) {
        // Id préfixé (`pl_stepLength`) : normalisé sur la clé canonique.
        const cle = CLES.find(function (k) { return m[1].toLowerCase() === k.toLowerCase(); });
        if (!cle) continue;
        const val = parseFloat(m[2]);
        if (!Number.isFinite(val) || val === usine[cle]) continue;
        ecarts.push({ fichier: nom, ligne: i + 1, cle: cle, vu: val, usine: usine[cle] });
      }
    });
  });
});

if (!ecarts.length) {
  console.log("✅ podomètre : stepLength=" + usine.stepLength +
              " · stepThreshold=" + usine.stepThreshold +
              " · stepCooldown=" + usine.stepCooldown + " — aucune copie divergente");
  console.log("\n🎉 " + fichiers.length + " fichiers inspectés");
  process.exit(0);
}

console.log("============================================================");
console.log("🛑 COMMIT REFUSÉ — réglage de podomètre divergent");
console.log("============================================================");
ecarts.forEach(function (e) {
  console.log("\n   • " + e.fichier + ":" + e.ligne + "  →  " + e.cle +
              " = " + e.vu + "   (usine : " + e.usine + ")");
});
console.log("");
console.log("   Ces valeurs ne se choisissent pas au jugé. `tracking.js` compare");
console.log("   `stepThreshold` à la magnitude de `accelerationIncludingGravity`,");
console.log("   qui vaut DÉJÀ ~9,81 téléphone posé : un seuil de 1.2 est vrai en");
console.log("   permanence et fabrique des pas à l'arrêt — c'est le bug de 2026-09-03.");
console.log("");
console.log("   Source unique : `js/config.js > DEFAULT_CONFIG`, figée dans");
console.log("   `window.KTA_TRACKING_USINE`. Dans un générateur, écris :");
console.log("       ...(window.KTA_TRACKING_USINE || { stepLength: " + usine.stepLength +
            ", stepThreshold: " + usine.stepThreshold + ", stepCooldown: " + usine.stepCooldown + " })");
console.log("");
console.log("   Si la valeur d'usine doit changer, change-la dans config.js —");
console.log("   tout le reste suivra, c'est le principe.");
console.log("");
process.exit(1);
