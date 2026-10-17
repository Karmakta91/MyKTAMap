#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-constantes-orphelines.js — BLOQUANT (pré-commit) : constantes MAJUSCULES_AVEC_UNDERSCORES de `js/`
// utilisées mais déclarées nulle part.
// 🩸 Un nettoyage de code mort prend pour morte une constante citée une seule fois ; sa suppression lève
//    une ReferenceError à l'EXÉCUTION seulement (`node -c` ne voit rien, pas de linter), souvent sur un
//    chemin rare (export PDF) que le smoke ne traverse pas.
// Portée volontairement étroite : élargir aux fonctions/variables crierait à tort (globales
// inter-modules), et un garde-fou qui crie à tort finit ignoré.
// ⚠️ Un identifiant déclaré N'IMPORTE OÙ dans `js/` compte comme résolu : seul le cas franc est attrapé.
// =====================================================================

const fs = require("fs");
const path = require("path");

const DIR = "js";
let fichiers;
try {
  fichiers = fs.readdirSync(DIR).filter(function (n) { return n.endsWith(".js"); });
} catch (e) {
  console.error("❌ [check-constantes-orphelines] " + DIR + " illisible : " + e.message);
  process.exit(2);
}

// Retire chaînes et commentaires (une citation n'est pas un usage).
// 🩸 Préserver les retours à la ligne, sinon les numéros rapportés sont faux. Mieux vaut rater un cas
// que d'en inventer.
function nettoyer(src) {
  const garderLignes = function (s) { return s.replace(/[^\n]/g, " "); };
  return src
    .replace(/\/\*[\s\S]*?\*\//g, garderLignes)
    .replace(/\/\/[^\n]*/g, garderLignes)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, garderLignes)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, garderLignes)
    .replace(/`(?:[^`\\]|\\.)*`/g, garderLignes)
    // Regex littérales (un motif de remplacement n'est pas un identifiant) : heuristique grossière, au
    // pire elle neutralise trop, donc rate un cas sans jamais en inventer.
    .replace(/([(,=:]\s*)\/(?![*\/])(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g,
             function (s, avant) { return avant + garderLignes(s.slice(avant.length)); });
}

const RE_IDENT = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
// Formes de déclaration : `const X = …`, déclaration MULTIPLE `const A = 1, X = 2;` (le 2e n'est pas
// précédé de `const`), getter `get X()`. Chacune oubliée produit un faux positif.
const RE_DECL  = /(?:const|let|var|function)\s+([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;
const RE_DECL2 = /[,;{(]\s*([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\s*=/g;   // multiples
const RE_GETSET = /\b(?:get|set)\s+([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\s*\(/g;

// 1) identifiants déclarés, quel que soit le fichier
const declaresPartout = new Set();
const contenus = {};
fichiers.forEach(function (n) {
  const src = fs.readFileSync(path.join(DIR, n), "utf8");
  contenus[n] = nettoyer(src);
  let m;
  while ((m = RE_DECL.exec(contenus[n])) !== null) declaresPartout.add(m[1]);
  while ((m = RE_DECL2.exec(contenus[n])) !== null) declaresPartout.add(m[1]);
  while ((m = RE_GETSET.exec(contenus[n])) !== null) declaresPartout.add(m[1]);
  // Une clé d'objet (`{ MAX_X: 3 }`) et un paramètre de fonction comptent aussi comme déclaration.
  // 🩸 La clé doit être précédée de `{` ou `,` : sinon le TERNAIRE `cond ? X : 0` passe pour une
  // déclaration et le garde-fou devient aveugle au cas même qu'il vise.
  // 🩸 Garder les antislashs de `\s` : sans eux le motif exige un `s` littéral et la règle ne
  // s'applique jamais, en silence.
  const RE_PROP = /[{,]\s*([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\s*:/g;
  while ((m = RE_PROP.exec(contenus[n])) !== null) declaresPartout.add(m[1]);
  const RE_PARAM = /function\s*[\w$]*\s*\(([^)]*)\)/g;
  while ((m = RE_PARAM.exec(contenus[n])) !== null) {
    m[1].split(",").forEach(function (p) {
      const t = p.trim();
      if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(t)) declaresPartout.add(t);
    });
  }
});

// Mots réservés / globales standard qui répondent au motif.
const CONNUS = new Set([
  "NaN", "Infinity", "URL", "JSON", "Math", "Date",
  "MAX_SAFE_INTEGER", "MIN_SAFE_INTEGER", "POSITIVE_INFINITY", "NEGATIVE_INFINITY",
  "MAX_VALUE", "MIN_VALUE", "EPSILON",
  "XML_HTTP", "DOM_KEY_LOCATION_STANDARD"
]);

// 2) les usages non résolus
const orphelins = [];
fichiers.forEach(function (n) {
  const src = contenus[n];
  const vus = new Set();
  let m;
  while ((m = RE_IDENT.exec(src)) !== null) {
    const id = m[0];
    if (vus.has(id) || CONNUS.has(id) || declaresPartout.has(id)) continue;
    vus.add(id);
    // propriété (`x.MAX_Y`) : ignorée
    const avant = src.slice(Math.max(0, m.index - 1), m.index);
    if (avant === ".") continue;
    const ligne = src.slice(0, m.index).split("\n").length;
    orphelins.push({ fichier: n, id: id, ligne: ligne });
  }
});

if (!orphelins.length) {
  console.log("✅ constantes : aucun identifiant MAJUSCULE utilisé sans être déclaré");
  console.log("\n🎉 " + fichiers.length + " fichiers inspectés");
  process.exit(0);
}

console.log("============================================================");
console.log("🛑 COMMIT REFUSÉ — constante utilisée mais jamais déclarée");
console.log("============================================================");
orphelins.forEach(function (o) {
  console.log("\n   • " + o.fichier + ":" + o.ligne + "  →  " + o.id);
});
console.log("");
console.log("   Ces identifiants lèveront une ReferenceError À L'EXÉCUTION,");
console.log("   sur le chemin qui les emploie — souvent une fonction rarement");
console.log("   appelée (export PDF, mode secours…), donc invisible au smoke.");
console.log("   Cause typique : un nettoyage de code mort a pris pour morte une");
console.log("   constante qui n'était citée qu'une fois. Restaure-la avec sa");
console.log("   valeur d'origine (`git show <commit>^:<fichier>`).");
console.log("");
process.exit(1);
