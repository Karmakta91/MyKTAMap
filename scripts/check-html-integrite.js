#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🧱 check-html-integrite.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// L'INTÉGRITÉ STRUCTURELLE de `index.html` — le seul document de l'app.
//
// 🩸 LE BUG QUI L'A FAIT NAÎTRE (KARMA, 14/09/2026 : « un truc est cassé ») :
// une retouche par index de caractères dans `index.html` a mal borné sa coupe
// et RECOPIÉ 388 lignes au milieu du fichier. Résultat à l'écran : le bloc
// « Conçu avec Claude » du splash s'affichait à l'intérieur de la zone de
// dépôt. Les 1 912 contrôles de la chaîne sont passés au vert : aucun ne
// regardait la structure du document.
//
// Un document dupliqué reste du HTML « valide » pour un navigateur, qui répare
// en silence. Ce qui se voit, en revanche, c'est le déséquilibre des balises
// et les identifiants en double — deux éléments avec le même `id`, et tout
// `getElementById` prend le premier, donc la moitié de l'app cible le mauvais
// nœud. C'est ce qu'on vérifie ici.
//
// Usage : node scripts/check-html-integrite.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

// Le HTML sans ses commentaires : `<!-- … -->` contient des exemples de
// balises et des bouts de code cités, qui fausseraient tous les comptes.
const BRUT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/\r\n/g, "\n");
const HTML = BRUT.replace(/<!--[\s\S]*?-->/g, "");

// ---------- 1. Les balises s'équilibrent ----------
// Uniquement les conteneurs : ceux qui, mal fermés, avalent la suite du
// document. Les balises auto-fermantes (`<br>`, `<input>`, `<img>`) n'ont
// rien à équilibrer.
["div", "span", "section", "aside", "nav", "ul", "ol", "li", "button", "label", "select", "table"].forEach(function (b) {
  const ouv = (HTML.match(new RegExp("<" + b + "(?=[\\s>])", "g")) || []).length;
  const fer = (HTML.match(new RegExp("</" + b + ">", "g")) || []).length;
  t("🩸 <" + b + "> : " + ouv + " ouvrant(s) / " + fer + " fermant(s)", ouv === fer);
});

// ---------- 2. Aucun identifiant en double ----------
// 🩸 Le symptôme le plus traître d'une duplication : `getElementById` rend le
// PREMIER nœud. La moitié des écouteurs se posent alors sur un élément que
// l'utilisateur ne voit pas, et rien ne le signale.
{
  const ids = (HTML.match(/\bid="[^"]+"/g) || []).map(function (s) { return s.slice(4, -1); });
  const vus = {}, doublons = [];
  ids.forEach(function (id) { if (vus[id]) { if (doublons.indexOf(id) < 0) doublons.push(id); } else vus[id] = 1; });
  t("🩸 aucun identifiant en double" + (doublons.length ? " — " + doublons.slice(0, 8).join(", ") : "") +
    " (" + ids.length + " id contrôlés)", doublons.length === 0);
}

// ---------- 3. Aucun bloc structurant recopié ----------
// Une duplication franche se reconnaît à ses repères uniques : ces marqueurs
// n'ont aucune raison d'apparaître deux fois dans un document à page unique.
{
  const UNIQUES = ["<body", "</body>", "<head", "</head>", "id=\"splashBox\"",
                   "id=\"zipDropZone\"", "class=\"zip-drop-sig\"", "id=\"map\""];
  const fautifs = UNIQUES.filter(function (m) { return HTML.split(m).length - 1 > 1; });
  t("🩸 aucun repère structurant recopié" + (fautifs.length ? " — en double : " + fautifs.join(", ") : ""),
    fautifs.length === 0);
}

// ---------- 4. Les scripts déclarés existent ----------
// Un `<script src>` vers un fichier absent casse l'app au chargement, sans
// erreur au commit.
{
  const srcs = (BRUT.match(/<script[^>]+src="([^"]+)"/g) || [])
    .map(function (s) { return (s.match(/src="([^"]+)"/) || [])[1]; })
    .filter(function (s) { return s && !/^https?:/.test(s); });
  const manquants = srcs.filter(function (s) {
    return !fs.existsSync(path.join(ROOT, s.replace(/^\.\//, "").split("?")[0]));
  });
  t("🩸 les " + srcs.length + " scripts locaux existent" + (manquants.length ? " — manquants : " + manquants.join(", ") : ""),
    manquants.length === 0);
}

console.log("");
if (echecs) { console.log("💥 intégrité HTML : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 intégrité HTML : balises équilibrées, aucun id en double, aucun bloc recopié");
