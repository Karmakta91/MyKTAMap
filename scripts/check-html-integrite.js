#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-html-integrite.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Intégrité structurelle de `index.html`, le seul document de l'app.
// 🩸 Une retouche mal bornée peut recopier des centaines de lignes au milieu du
// fichier : le navigateur répare en silence et aucun autre contrôle ne regarde
// la structure. Ce qui trahit la duplication : balises déséquilibrées, `id` en
// double (`getElementById` prend le premier, la moitié de l'app vise le mauvais
// nœud), repères uniques recopiés. Vérifie aussi que chaque `<script src>` local
// existe et figure dans `sw.js > ASSETS_TO_CACHE`.
// Usage : node scripts/check-html-integrite.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

// Sans `<!-- … -->` : les exemples de balises cités fausseraient les comptes.
const BRUT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/\r\n/g, "\n");
const HTML = BRUT.replace(/<!--[\s\S]*?-->/g, "");

// ── 1. Les balises conteneurs s'équilibrent ───────────────────────────
["div", "span", "section", "aside", "nav", "ul", "ol", "li", "button", "label", "select", "table"].forEach(function (b) {
  const ouv = (HTML.match(new RegExp("<" + b + "(?=[\\s>])", "g")) || []).length;
  const fer = (HTML.match(new RegExp("</" + b + ">", "g")) || []).length;
  t("🩸 <" + b + "> : " + ouv + " ouvrant(s) / " + fer + " fermant(s)", ouv === fer);
});

// ── 2. Aucun identifiant en double ────────────────────────────────────
{
  const ids = (HTML.match(/\bid="[^"]+"/g) || []).map(function (s) { return s.slice(4, -1); });
  const vus = {}, doublons = [];
  ids.forEach(function (id) { if (vus[id]) { if (doublons.indexOf(id) < 0) doublons.push(id); } else vus[id] = 1; });
  t("🩸 aucun identifiant en double" + (doublons.length ? " — " + doublons.slice(0, 8).join(", ") : "") +
    " (" + ids.length + " id contrôlés)", doublons.length === 0);
}

// ── 3. Aucun repère unique recopié ────────────────────────────────────
{
  const UNIQUES = ["<body", "</body>", "<head", "</head>", "id=\"splashBox\"",
                   "id=\"zipDropZone\"", "class=\"zip-drop-sig\"", "id=\"map\""];
  const fautifs = UNIQUES.filter(function (m) { return HTML.split(m).length - 1 > 1; });
  t("🩸 aucun repère structurant recopié" + (fautifs.length ? " — en double : " + fautifs.join(", ") : ""),
    fautifs.length === 0);
}

// ── 4. Les scripts déclarés existent ──────────────────────────────────
{
  const srcs = (BRUT.match(/<script[^>]+src="([^"]+)"/g) || [])
    .map(function (s) { return (s.match(/src="([^"]+)"/) || [])[1]; })
    .filter(function (s) { return s && !/^https?:/.test(s); });
  const manquants = srcs.filter(function (s) {
    return !fs.existsSync(path.join(ROOT, s.replace(/^\.\//, "").split("?")[0]));
  });
  t("🩸 les " + srcs.length + " scripts locaux existent" + (manquants.length ? " — manquants : " + manquants.join(", ") : ""),
    manquants.length === 0);

  // ── 5. …et sont pré-cachés ──────────────────────────────────────────
  // 🩸 Un script chargé mais absent d'ASSETS_TO_CACHE manque à l'app ouverte
  // sans réseau, sans aucune erreur visible en ligne.
  const SW = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const i0 = SW.indexOf("const ASSETS_TO_CACHE = [");
  const bloc = i0 < 0 ? "" : SW.slice(i0, SW.indexOf("];", i0));
  const nonCaches = srcs.filter(function (s) {
    const rel = "./" + s.replace(/^\.\//, "").split("?")[0];
    return bloc.indexOf('"' + rel + '"') < 0;
  });
  t("🩸 les " + srcs.length + " scripts locaux sont dans le pré-cache du service worker" +
    (nonCaches.length ? " — ABSENTS d'ASSETS_TO_CACHE : " + nonCaches.join(", ") : ""),
    bloc.length > 0 && nonCaches.length === 0);
}

console.log("");
if (echecs) { console.log("💥 intégrité HTML : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 intégrité HTML : balises équilibrées, aucun id en double, aucun bloc recopié");
