#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-emoji-vs16.js — garde-fou pré-commit BLOQUANT (rejoué en CI)
// =====================================================================
// Un pictogramme dont la présentation par défaut est « texte » (🛣 🗂 👁 ⏸ ⏹ ⏭ 🗑 🏗…) doit être suivi du
// sélecteur U+FE0F pour s'afficher en emoji. Sans lui, Windows et une partie des Android le dessinent en
// glyphe noir et blanc : la même icône change d'aspect d'un écran à l'autre, parfois sur le même appareil.
// Périmètre : js/, lang/, css/, addons/, docs/applications/, index.html, confadmin.html.
// Non concernés : les symboles typographiques voulus en texte (flèches, triangles ▶ ◀, ©, ™, coches…, liste
// TYPO) et toute ligne marquée « emoji-texte-ok » (ex. clé d'une table de remplacement, CSS `content:`),
// ou précédée d'une ligne « emoji-texte-ok (ligne suivante) » quand la marque ne tient pas sur la ligne.
// Corriger : node scripts/check-emoji-vs16.js --corriger (ajoute U+FE0F, hors lignes marquées).
// =====================================================================

const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const DOSSIERS = ["js", "lang", "css", "addons", "docs/applications"];
const FICHIERS = ["index.html", "confadmin.html"];
const TYPO = new Set([..."©®™↔↕↖↗↘↙↩↪▶◀⬆⬇⬅➡⤴⤵✔✓☑▫▪◻◼⬛⬜✦✂ℹ〰➖➕➗✳✴❇‼⁉"]);
const MARQUE = "emoji-texte-ok";
// Pictogramme à présentation texte NON suivi d'un sélecteur, d'un ZWJ ou d'une couleur de peau.
const NU = /(?=\p{Extended_Pictographic})(?!\p{Emoji_Presentation})(\P{M})(?![️︎‍\u{1F3FB}-\u{1F3FF}])/gu;
const IGNORE = /[\\/](node_modules|\.git|data|lib)[\\/]|NETWORK_AUDIT[^\\/]*\.html$/;

function lister(dossier, acc) {
  if (!fs.existsSync(dossier)) return acc;
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (IGNORE.test(p + path.sep)) continue;
    if (e.isDirectory()) lister(p, acc);
    else if (/\.(js|json|css|html|md)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function aCorriger(c) {
  return !TYPO.has(c) && c.codePointAt(0) >= 0x2000;
}

const corriger = process.argv.includes("--corriger");
const fichiers = DOSSIERS.flatMap((d) => lister(path.join(RACINE, d), []))
  .concat(FICHIERS.map((f) => path.join(RACINE, f)).filter((f) => fs.existsSync(f)));
const fautes = [];
for (const f of fichiers) {
  const src = fs.readFileSync(f, "utf8");
  let modifie = false;
  const brut = src.split("\n");
  const lignes = brut.map((l, i) => {
    if (l.includes(MARQUE) || (i > 0 && brut[i - 1].includes(MARQUE + " (ligne suivante)"))) return l;
    return l.replace(NU, (m, c) => {
      if (!aCorriger(c)) return m;
      fautes.push(path.relative(RACINE, f).split(path.sep).join("/") + ":" + (i + 1) + "  " + c +
        " (U+" + c.codePointAt(0).toString(16).toUpperCase() + ")");
      modifie = true;
      return c + "️";
    });
  });
  if (corriger && modifie) fs.writeFileSync(f, lignes.join("\n"));
}

if (corriger) {
  console.log("[check-emoji-vs16] " + fautes.length + " pictogramme(s) complété(s) par U+FE0F.");
  process.exit(0);
}
if (fautes.length) {
  console.error("[check-emoji-vs16] ❌ " + fautes.length + " pictogramme(s) sans U+FE0F (rendu texte noir et blanc " +
    "sur Windows / Android) :");
  fautes.slice(0, 30).forEach((x) => console.error("  " + x));
  if (fautes.length > 30) console.error("  … et " + (fautes.length - 30) + " autre(s)");
  console.error("  → node scripts/check-emoji-vs16.js --corriger, ou « " + MARQUE + " » sur une ligne voulue en texte.");
  process.exit(1);
}
console.log("[check-emoji-vs16] ✅ pictogrammes complets (U+FE0F).");
