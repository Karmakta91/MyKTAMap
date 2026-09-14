#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔤 check-constantes-orphelines.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Détecte les constantes en MAJUSCULES **utilisées mais jamais déclarées**
// dans le fichier qui les emploie.
//
// LE BUG QUI L'A FAIT NAÎTRE (03/09/2026) : le nettoyage de code mort du 09/08
// (commit 9834504) a supprimé `const HEADER_HEIGHT_MM = 18;` de
// `js/pdfExport.js` — alors qu'elle était utilisée vingt lignes plus bas.
// Résultat : « HEADER_HEIGHT_MM is not defined » à CHAQUE génération de PDF
// avec en-tête, pendant près d'un mois, sans que rien ne le signale.
//
// POURQUOI RIEN NE L'A VU :
//   • `node -c` ne détecte pas les identifiants non résolus — c'est une erreur
//     d'EXÉCUTION, pas de syntaxe ;
//   • le smoke traverse 8 écrans mais ne génère jamais de PDF ;
//   • aucun des garde-fous n'inspectait les identifiants ;
//   • le projet n'a pas de linter (choix assumé : pas de bundler, pas de
//     toolchain). Ce script en fait le strict minimum, sur le seul motif qui a
//     réellement mordu.
//
// PORTÉE VOLONTAIREMENT ÉTROITE : uniquement les identifiants en
// MAJUSCULES_AVEC_UNDERSCORES, soit la convention des constantes de module de
// ce projet. C'est là que le nettoyage de code mort frappe — une constante ne
// s'appelle souvent qu'une fois, elle a donc l'air morte. Élargir aux
// fonctions et variables produirait des faux positifs (globales inter-modules,
// `window.x`), et un garde-fou qui crie à tort finit ignoré.
//
// ⚠️ CE QU'IL NE VOIT PAS : une constante déclarée dans un fichier et utilisée
// dans un autre (le projet en a — `window.X` ou portée globale de script). Pour
// éviter d'inventer des erreurs, un identifiant déclaré N'IMPORTE OÙ dans `js/`
// est considéré comme résolu. On n'attrape donc que le cas franc : utilisé
// nulle part déclaré.
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

// Retire chaînes et commentaires : une constante citée dans un message d'erreur
// ou un commentaire n'est pas un usage.
// 🩸 Le nettoyage doit PRÉSERVER LES RETOURS À LA LIGNE, sinon les numéros
// rapportés sont faux — et il doit vraiment neutraliser les commentaires,
// sinon on signale des constantes qui ne sont que CITÉES dans une explication.
// Première version : deux faux positifs sur trois (`WHITELIST_HUMAN` et
// `README_USER`, tous deux en commentaire). Un garde-fou qui crie à tort finit
// ignoré — donc il vaut mieux en rater un que d'en inventer.
function nettoyer(src) {
  const garderLignes = function (s) { return s.replace(/[^\n]/g, " "); };
  return src
    .replace(/\/\*[\s\S]*?\*\//g, garderLignes)
    .replace(/\/\/[^\n]*/g, garderLignes)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, garderLignes)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, garderLignes)
    .replace(/`(?:[^`\\]|\\.)*`/g, garderLignes)
    // Regex littérales : `README_USER` apparaissait dans
    // `/\{\{README_USER\}\}/g` — c'est un motif de remplacement, pas un
    // identifiant. Heuristique volontairement grossière (une regex précédée
    // d'un `(`, `,`, `=` ou `.replace(`), suffisante ici et sans risque : au
    // pire on neutralise un peu trop, ce qui ne peut que RATER un cas,
    // jamais en inventer un.
    .replace(/([(,=:]\s*)\/(?![*\/])(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g,
             function (s, avant) { return avant + garderLignes(s.slice(avant.length)); });
}

const RE_IDENT = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
// Toutes les formes de DÉCLARATION rencontrées dans ce dépôt :
//   const X = …            (le cas courant)
//   const A = 1, X = 2;    ← déclaration MULTIPLE : le 2e identifiant n'est pas
//                            précédé de `const`, il faut le voir quand même
//   get X() { … }          ← getter d'objet (networkAudit.js)
// Chacune de ces trois formes a produit un faux positif avant d'être ajoutée.
const RE_DECL  = /(?:const|let|var|function)\s+([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;
const RE_DECL2 = /[,;{(]\s*([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\s*=/g;   // multiples
const RE_GETSET = /\b(?:get|set)\s+([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\s*\(/g;

// 1) tous les identifiants déclarés, quel que soit le fichier
const declaresPartout = new Set();
const contenus = {};
fichiers.forEach(function (n) {
  const src = fs.readFileSync(path.join(DIR, n), "utf8");
  contenus[n] = nettoyer(src);
  let m;
  while ((m = RE_DECL.exec(contenus[n])) !== null) declaresPartout.add(m[1]);
  while ((m = RE_DECL2.exec(contenus[n])) !== null) declaresPartout.add(m[1]);
  while ((m = RE_GETSET.exec(contenus[n])) !== null) declaresPartout.add(m[1]);
  // Une propriété d'objet compte aussi comme définition (`{ MAX_X: 3 }`) et
  // un paramètre de fonction également — sinon on crie sur du code sain.
  // 🩸 Une clé d objet doit etre precedee de `{` ou `,`. Sans cette borne, le
  // TERNAIRE `cond ? X : 0` faisait passer X pour une declaration - et le
  // garde-fou devenait aveugle au cas meme qui l a motive :
  //     const headerH = opts.incHeader ? HEADER_HEIGHT_MM : 0;
  // Decouvert en le falsifiant. Un garde-fou non falsifie ne garde rien.
  //
  // 🩸 BIS — les `\s` de ce motif avaient perdu leur antislash (`[{,]s*...s*:`),
  // ce qui exigeait un `s` LITTERAL : la regle « une cle d'objet compte comme
  // declaration » ne s'appliquait donc JAMAIS. Le defaut est reste invisible
  // tant qu'aucun module ne rangeait ses constantes dans un objet ; il a
  // rougi au premier qui l'a fait (la table de tags de `js/tiffGeoref.js`).
  // Verifie apres correction : le cas historique du ternaire est toujours
  // attrape a l'identique, et les 116 fichiers restent verts.
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
    // Ignorer ce qui est manifestement une propriété (`x.MAX_Y`) ou une clé.
    const avant = src.slice(Math.max(0, m.index - 1), m.index);
    if (avant === ".") continue;
    // Numéro de ligne, sur la source ORIGINALE pour rester exploitable.
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
