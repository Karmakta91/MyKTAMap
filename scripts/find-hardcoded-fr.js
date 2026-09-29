#!/usr/bin/env node
/*!
 * MyKTAMap — find-hardcoded-fr.js
 * Détecteur HEURISTIQUE des chaînes FR user-facing codées EN DUR (jamais passées
 * en clé i18n). Comble l'angle mort de check-i18n.js (qui ne voit que la parité
 * + les clés appelées, PAS le FR hors-dico).
 *
 * Heuristique : dans js/*.js + index.html (scripts inline), repère les littéraux
 * de chaîne contenant un caractère accentué FR, hors :
 *   - commentaires (bloc, ligne, HTML),
 *   - lignes de log (console.*),
 *   - lignes contenant `I18n.t(` ou `data-i18n` (déjà i18n),
 *   - lignes du fallback HTML statique annoté data-i18n.
 * + signale TOUS les alert()/confirm() natifs avec une chaîne (jamais i18n,
 *   user-facing par nature).
 *
 * Faux positifs possibles (à trier) : libellés non user-facing, accents dans des
 * données. Faux négatifs : FR sans accent (« Code incorrect »). C'est un FILET,
 * pas une preuve — le tri fin reste humain/agent.
 *
 * Usage : node scripts/find-hardcoded-fr.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const JS_DIR = path.join(ROOT, "js");

const ACCENT = /[àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ]/;
const STRING_LIT = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

// Fichiers HORS-SCOPE i18n (systèmes de langue propres / data) → exclus du scan.
const EXCLUDE = new Set([
  // (audit i18n 29/09, O10 : tutorial.js et interfaceDocs.js RÉINTÉGRÉS — leur motif
  //  « bilingue CARDS_FR/EN, _aideHtmlFr/En » était périmé : tout passe par I18n.t.)
  // 🆕 passe B8 (v1.60.x) — bruit connu exclu :
  "js/voiceCommand.js",    // mots-clés de RECONNAISSANCE vocale FR (données de matching, pas de l'affichage)
  "js/legalGate.js"        // textes de loi + titres du doc légal FR VOLONTAIRE (décision KARMA, cf security-legal.md §87)
]);
// Un littéral "données" probable : un seul token snake_case/identifiant (statut
// sérialisé, ex. "non_demarré", "terminé") sans espace → bruit, on ignore.
function looksLikeDataToken(v) {
  return /^[a-zàâäçéèêëîïôöùûü0-9_]+$/i.test(v) && !/\s/.test(v) && v.length <= 14;
}

// Retire les commentaires en gardant le découpage par ligne (pour les n° de ligne).
function stripCommentsKeepLines(src) {
  const out = [];
  let inBlock = false;
  for (let line of src.split("\n")) {
    let l = line;
    if (inBlock) {
      const end = l.indexOf("*/");
      if (end === -1) { out.push(""); continue; }
      l = l.slice(end + 2); inBlock = false;
    }
    // bloc /* */ sur la ligne (peut en ouvrir un)
    let guard = 0;
    while (true) {
      const s = l.indexOf("/*");
      if (s === -1) break;
      const e = l.indexOf("*/", s + 2);
      if (e === -1) { l = l.slice(0, s); inBlock = true; break; }
      l = l.slice(0, s) + " " + l.slice(e + 2);
      if (++guard > 50) break;
    }
    // commentaire HTML <!-- --> (mono-ligne, cas courant)
    l = l.replace(/<!--[\s\S]*?-->/g, " ");
    // commentaire ligne // (hors http:// — approx : précédé d'un espace/début)
    l = l.replace(/(^|[^:])\/\/.*$/, "$1");
    out.push(l);
  }
  return out;
}

function scanFile(file, rel) {
  const lines = stripCommentsKeepLines(fs.readFileSync(file, "utf8"));
  const hits = [];
  lines.forEach(function(l, i) {
    if (/\bconsole\.(log|warn|error|info|debug|trace)\b/.test(l)) return;
    if (/data-i18n/.test(l)) return;
    const n = i + 1;
    // 1) alert()/confirm() natifs avec une chaîne
    let m = /\b(alert|confirm)\s*\(\s*(["'`])/.exec(l);
    if (m) hits.push({ n: n, kind: m[1] + "()", txt: l.trim().slice(0, 110) });
    // 2) littéraux avec accent FR (hors clés I18n.t)
    let mm;
    STRING_LIT.lastIndex = 0;
    while ((mm = STRING_LIT.exec(l)) !== null) {
      const val = mm[2];
      if (!ACCENT.test(val)) continue;
      if (val.length < 4) continue;
      if (looksLikeDataToken(val)) continue;
      // exclut si c'est l'argument-clé d'un I18n.t( juste avant ce littéral
      const before = l.slice(0, mm.index);
      if (/I18n\.t\(\s*$/.test(before)) continue;
      // évite de re-signaler une ligne déjà prise par alert()/confirm()
      if (m && mm.index < (l.indexOf("(") + 30)) { /* possible doublon, on garde quand même si différent */ }
      hits.push({ n: n, kind: "str", txt: ('"' + val + '"').slice(0, 110) });
    }
  });
  return hits;
}

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith(".js")) acc.push([p, "js/" + path.relative(JS_DIR, p).replace(/\\/g, "/")]);
  }
}

const files = [[path.join(ROOT, "index.html"), "index.html"]];
walk(JS_DIR, files);

const perFile = [];
let total = 0, alertCount = 0;
for (const [abs, rel] of files) {
  if (EXCLUDE.has(rel)) continue;
  const hits = scanFile(abs, rel);
  if (hits.length) {
    perFile.push([rel, hits]);
    total += hits.length;
    alertCount += hits.filter(h => h.kind !== "str").length;
  }
}
perFile.sort((a, b) => b[1].length - a[1].length);

console.log("🔎 Candidats FR codés en dur (heuristique — à trier) : " + total +
            " sur " + perFile.length + " fichier(s) · dont " + alertCount + " alert()/confirm() natifs\n");
const SHOW = process.argv.includes("--full") ? Infinity : 6;
for (const [rel, hits] of perFile) {
  console.log("📄 " + rel + "  (" + hits.length + ")");
  hits.slice(0, SHOW).forEach(h => console.log("   L" + h.n + " [" + h.kind + "] " + h.txt));
  if (hits.length > SHOW) console.log("   … +" + (hits.length - SHOW) + " (voir --full)");
  console.log("");
}
