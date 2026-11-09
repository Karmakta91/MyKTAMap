#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// check-police-emoji.js — garde-fou pré-commit BLOQUANT (rejoué en CI), à CLIQUET : police « KTA Emoji »
// =====================================================================
// Les emoji des textes sont dessinés par une police embarquée (fonts/kta-emoji.woff2, Twemoji réduit) pour
// s'afficher pareil sur iPhone, Android et PC. Contrôle :
//   1. la police couvre le dépôt : chaque emoji du périmètre (generer-police-emoji.js > inventaire, hors caractères
//      de texte) est dans le manifeste et chacun de ses points de code dans la cmap du WOFF2 ; empreinte du WOFF2 =
//      manifeste ; unicode-range de css/kta-emoji.css = points de code du manifeste, sans aucun caractère de texte
//      (chiffres, # *, lettres, flèches…). Un emoji ajouté sans régénérer échoue, avec la commande à lancer ;
//   2. la police est branchée : feuille liée par index.html et confadmin.html, précachée par sw.js ; chaque pile
//      font-family (css/, pages, styles posés par le JS) et chaque ctx.font des canvas s'ouvre par « KTA Emoji »
//      (exception : un ctx.font suivi du dessin d'un glyphe typographique littéral, ↕ ⚑, voulu en texte) ;
//   3. CLIQUET : emoji écrits en dur dans les gabarits HTML du JS (ligne de code qui porte une balise) et dans
//      index.html, figés par fichier et par emoji (PLAFOND_HTML). Une hausse échoue : l'emploi nouveau prend une
//      icône SVG (ktaIcone, la suggestion est donnée quand le bouton existe) ou, voulu en emoji, relève le plafond en
//      connaissance de cause ; une baisse se reporte. Recalcul : --plafond.
// Usage : node scripts/check-police-emoji.js [--plafond]   · doc : docs/architecture/ui.md § Emoji dessinés par la
//   police KTA Emoji
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const G = require("./generer-police-emoji.js");

const RACINE = path.resolve(__dirname, "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const REGENERER = "node scripts/generer-police-emoji.js (Python + fontTools : voir son en-tête)";

let ko = 0;
const t = (n, c, detail) => {
  if (!c) { ko++; console.log("❌ " + n + (detail ? "\n   " + detail : "")); } else console.log("✅ " + n);
};

// ── 1. la police couvre les emoji du dépôt ─────────────────────────────────────────────
let man = null;
try { man = JSON.parse(lire(G.CHEMINS.manifeste)); } catch (e) { /* absent */ }
t("1. manifeste " + G.CHEMINS.manifeste + " lisible", !!man, "→ " + REGENERER);
if (man) {
  let woff2 = null;
  try { woff2 = fs.readFileSync(path.join(RACINE, G.CHEMINS.police)); } catch (e) { /* absent */ }
  t("1. " + G.CHEMINS.police + " présent, empreinte = manifeste", !!woff2 && G.sha256(woff2) === man.sortie.sha256,
    "fichier absent ou modifié hors du générateur → " + REGENERER);
  t("1. source = " + G.SOURCE.nom + " " + G.SOURCE.version + " (empreinte attendue)",
    !!man.source && man.source.sha256 === G.SOURCE.sha256, "→ " + REGENERER);
  const inv = G.inventaire();
  const dansManifeste = new Set(man.sequences || []);
  const manquants = Array.from(inv.keys()).filter(G.retenue).filter((q) => !dansManifeste.has(q))
    .map((q) => q + " (" + inv.get(q).slice(0, 2).join(", ") + ")");
  t("1. chaque emoji du dépôt est dans la police (" + inv.size + " séquences relevées)", manquants.length === 0,
    manquants.length + " emoji absent(s) de la police : " + manquants.slice(0, 12).join(" · ") + "\n   → " + REGENERER);
  if (woff2) {
    let cmap = null;
    try { cmap = G.lireCmapWoff2(woff2); } catch (e) { t("1. cmap du WOFF2 lisible", false, e.message); }
    if (cmap) {
      const trous = (man.sequences || []).filter((q) => Array.from(q).some((c) => !cmap.has(c.codePointAt(0))));
      t("1. chaque séquence du manifeste a ses points de code dans la cmap", trous.length === 0, trous.join(" "));
    }
  }
  const pts = G.points(man.sequences || []);
  const textes = pts.filter(G.texte);
  t("1. aucun caractère de texte (chiffre, # *, lettre, flèche, © ®) dans la police", textes.length === 0,
    textes.map((c) => "U+" + c.toString(16).toUpperCase()).join(" "));
  let css = "";
  try { css = lire(G.CHEMINS.css); } catch (e) { /* absent */ }
  const m = /unicode-range:\s*([^;]+);/.exec(css);
  t("1. " + G.CHEMINS.css + " : unicode-range = points de code du manifeste", !!m && m[1].trim() === G.plage(pts),
    "feuille absente ou désaccordée → " + REGENERER);
  t("1. " + G.CHEMINS.css + " : famille « KTA Emoji » servie par " + G.CHEMINS.police,
    /font-family:\s*"KTA Emoji"/.test(css) && css.indexOf("../" + G.CHEMINS.police) >= 0);
  const enTrop = (man.sequences || []).filter((q) => !inv.has(q));
  if (enTrop.length) {
    console.log("   ℹ️ " + enTrop.length + " emoji de la police ne sont plus employés (" + enTrop.join(" ") +
    ") : la régénérer allège le fichier");
  }
}

// ── 2. la police est branchée partout ──────────────────────────────────────────────────
{
  ["index.html", "confadmin.html"].forEach((f) => {
    t("2. " + f + " lie " + G.CHEMINS.css, /<link rel="stylesheet" href="css\/kta-emoji\.css">/.test(lire(f)));
  });
  const sw = lire("sw.js");
  t("2. sw.js précache " + G.CHEMINS.css + " et " + G.CHEMINS.police,
    sw.indexOf("\"./" + G.CHEMINS.css + "\"") >= 0 && sw.indexOf("\"./" + G.CHEMINS.police + "\"") >= 0);

  const lister = (d, motif, acc) => {
    if (!fs.existsSync(path.join(RACINE, d))) return acc;
    fs.readdirSync(path.join(RACINE, d), { withFileTypes: true }).forEach((e) => {
      const rel = d + "/" + e.name;
      if (e.isDirectory()) lister(rel, motif, acc); else if (motif.test(e.name)) acc.push(rel);
    });
    return acc;
  };
  const fichiers = lister("css", /\.css$/, []).filter((f) => f !== G.CHEMINS.css)
    .concat(["index.html", "confadmin.html"], lister("js", /\.js$/, []), lister("addons", /\.(css|js|html)$/, []));
  const piles = [], canvas = [];
  fichiers.forEach((f) => {
    const src = lire(f).replace(/@font-face\s*\{[^}]*\}/g, (b) => b.replace(/[^\n]/g, " "));
    const lignes = src.split("\n");
    lignes.forEach((l, i) => {
      for (const x of l.matchAll(/font-family\s*:\s*((?:[^;}"'`\n]|"[^"\n]*"|'[^'\n]*')+)/g)) {
        const v = x[1].trim();
        if (/^(inherit|initial|unset|var\()/.test(v) || /^KTA Emoji\s*,|^["']KTA Emoji["']\s*,/.test(v)) continue;
        piles.push(f + ":" + (i + 1) + "  font-family: " + v.slice(0, 60));
      }
      if (/\.font\s*=/.test(l) && /\.js$/.test(f)) {
        const expr = l.slice(l.search(/\.font\s*=/));
        const litteraux = expr.match(/"[^"]*"|'[^']*'/g) || [];
        let bon = litteraux.some((s) => /KTA Emoji/.test(s));
        if (!bon) {
          // Constante nommée (POLICE, FAMILLE_PLAQUE…) : sa définition dans le même fichier porte la famille.
          const ids = (expr.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || []);
          bon = ids.some((id) => {
            const d = new RegExp("const " + id + "\\s*=\\s*(\"[^\"]*\"|'[^']*')").exec(src);
            return !!d && /KTA Emoji/.test(d[1]);
          });
        }
        // Glyphe typographique littéral dessiné juste après (↕ d'un passage, ⚑ d'une arrivée) : voulu en texte.
        const suite = lignes.slice(i, i + 4).join("\n");
        const glyphe = /fillText\((["'])([^"'\\]{1,2})\1/.exec(suite);
        if (!bon && glyphe && !/\p{RGI_Emoji}/v.test(glyphe[2])) bon = true;
        if (!bon) canvas.push(f + ":" + (i + 1) + "  " + l.trim().slice(0, 90));
      }
    });
  });
  t("2. chaque pile font-family s'ouvre par « KTA Emoji » (" + fichiers.length + " fichiers)", piles.length === 0,
    piles.slice(0, 15).join("\n   ") +
    "\n   → ajouter \"KTA Emoji\", en tête (dans un style posé par le JS : KTA Emoji, sans guillemets)");
  t("2. chaque ctx.font nomme « KTA Emoji » (police chargée avant le dessin : window.ktaPoliceEmoji.charger())",
    canvas.length === 0, canvas.join("\n   "));
}

// ── 3. CLIQUET : emoji en dur dans les gabarits HTML du JS et dans index.html ──────────
// Figés par fichier et par emoji (forme sans U+FE0F). Ce qui est là est classé « reste voulu » (ui.md § Emoji
// dessinés par la police KTA Emoji) : toast, alerte, option, pastille de type… Recalcul : --plafond.
const PLAFOND_HTML = {
  "index.html": { "🔎": 2, "⏳": 1, "⚠": 1, "📋": 1, "🗺": 1 },
  "js/ajusterSommets.js": { "🗑": 1 },
  "js/confadmin.js": { "📦": 1, "📂": 1 },
  "js/createConf.js": { "📄": 1, "⬜": 3, "▫": 3, "⬛": 3, "📜": 3, "🫥": 1, "⚠": 5, "✅": 1, "📐": 1, "⭐": 1 },
  "js/homeLoader.js": { "💾": 1 },
  "js/homeProfile.js": { "⏳": 1, "⚠": 1 },
  "js/interface.js": { "🎯": 3 },
  "js/interfaceDocs.js": { "⏳": 1, "❌": 1, "📷": 2 },
  "js/interfaceImportExport.js": { "📁": 1 },
  "js/interfaceItineraire.js": { "⚠": 1 },
  "js/interfaceMaintenance.js": { "⚠": 6, "🗝": 1 },
  "js/itiGuidage.js": { "⚠": 1 },
  "js/kmzExport.js": { "🚑": 1, "🚨": 1, "📍": 3, "⬛": 3, "🛣": 2, "🗺": 3, "🪜": 1, "🏛": 1 },
  "js/lostMode.js": { "📍": 1 },
  "js/majPlan.js": { "📊": 1 },
  "js/measure.js": { "📐": 1, "♦": 1 },
  "js/memInspector.js": { "⚠": 8, "ℹ": 1 },
  "js/oomGuard.js": { "⚠": 2 },
  "js/osmHomePreview.js": { "📦": 1, "📁": 1 },
  "js/planDenylist.js": { "⛔": 1, "⚠": 1, "📦": 1 },
  "js/profileExportImport.js": { "⏳": 1, "❌": 1, "⚠": 1 },
  "js/profondeurNiveaux.js": { "⚠": 2 },
  "js/recalageScan.js": { "ℹ": 1, "⚠": 1 },
  "js/searchPoints.js": { "❌": 1 },
  "js/secoursMode.js": { "⚠": 9, "🚨": 1 },
  "js/sessionExporter.js": { "🔒": 1, "⚠": 2 },
  "js/sessionPersist.js": { "📍": 1 },
  "js/sessionReport.js": { "⏳": 1 },
  "js/sortieUrgence.js": { "⚠": 3, "🚪": 1 },
  "js/statsGlobales.js": { "⏳": 2, "❌": 1 },
  "js/tableEditor.js": { "ℹ": 1 },
  "js/voiceCommand.js": { "🎤": 1 }
};
{
  const TAG = /<\/?[a-zA-Z][\w-]*[\s>/]/;
  const RE = /\p{RGI_Emoji}/gv;
  const K = require(path.join(RACINE, "js", "ktaIcones.js"));
  const compte = {}, ou = {}, suggere = {};
  const fichiers = ["index.html"].concat(fs.readdirSync(path.join(RACINE, "js")).filter((f) => /\.js$/.test(f))
    .map((f) => "js/" + f).sort());
  fichiers.forEach((f) => {
    let src = lire(f);
    if (/\.html$/.test(f)) src = src.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
    src.split("\n").forEach((l, i) => {
      const tl = l.trim();
      if (/^(\/\/|\*|\/\*)/.test(tl)) return;
      if (/\.js$/.test(f) && !TAG.test(l)) return;
      let classes = null;
      for (const x of l.matchAll(RE)) {
        const e = x[0].replace(/\uFE0F/g, "");
        (compte[f] = compte[f] || {})[e] = (compte[f][e] || 0) + 1;
        ((ou[f] = ou[f] || {})[e] = ou[f][e] || []).push(i + 1);
        // Icône que la doc donnerait à cet emoji dans ce libellé (bouton DOC, sinon notion REPERES) : la suggestion.
        classes = classes || K.classerDoc(l.replace(/<[^>]*>/g, " "));
        const o = classes.filter((c) => c.emoji.replace(/\uFE0F/g, "") === e && (c.icone || c.notion))[0];
        if (o) (suggere[f] = suggere[f] || {})[e] = o.icone || o.notion;
      }
    });
  });
  if (process.argv.indexOf("--plafond") >= 0) {
    console.log("const PLAFOND_HTML = {\n" + Object.keys(compte).sort().map((f) => "  \"" + f + "\": " +
      JSON.stringify(compte[f]).replace(/,/g, ", ").replace(/:/g, ": ").replace(/^\{/, "{ ").replace(/\}$/, " }"))
      .join(",\n") + "\n};");
  }
  const ecarts = [];
  const tous = new Set(Object.keys(compte).concat(Object.keys(PLAFOND_HTML)));
  tous.forEach((f) => {
    const c = compte[f] || {}, p = PLAFOND_HTML[f] || {};
    new Set(Object.keys(c).concat(Object.keys(p))).forEach((e) => {
      const n = c[e] || 0, max = p[e] || 0;
      if (n > max) {
        const ico = suggere[f] && suggere[f][e];
        ecarts.push(f + " " + e + " : " + n + " emplois pour " + max + " figés (ligne " + ou[f][e].join(", ") + ") → " +
          (ico ? "window.ktaIcone(\"" + ico + "\")" : "une icône SVG (ktaIcone)") +
          " ; voulu en emoji : relever PLAFOND_HTML en connaissance de cause");
      } else if (n < max) {
        ecarts.push(f + " " + e + " : " + n + " < " + max + " figés → reporter " + n +
          " dans PLAFOND_HTML (--plafond)");
      }
    });
  });
  t("3. emoji en dur des gabarits HTML (JS) et d'index.html figés par fichier et par emoji (cliquet)",
    ecarts.length === 0, ecarts.join("\n   "));
}

console.log(ko === 0 ? "🎉 police KTA Emoji : couvre le dépôt, branchée partout, gabarits figés"
  : "⚠️ " + ko + " échec(s)");
process.exit(ko === 0 ? 0 : 1);
