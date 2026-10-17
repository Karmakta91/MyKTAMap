#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// check-commentaires.js — garde-fou pré-commit BLOQUANT (rejoué en CI), à CLIQUET
// =====================================================================
// Le code décrit l'ÉTAT ACTUEL (convention « Commentaires » de CLAUDE.md) : l'historique vit dans le
// commit et README.md. Scan GLOBAL (pas l'index : KTA_FICHIERS_CI est sans objet) des commentaires de
// js/*.js (sauf copyright.js, bloc canonique), sw.js, css/style.css, index.html (<!-- -->) et scripts/**/*.js. Refuse :
//   (a) un commentaire qui COMMENCE par un tag de version ou une date (« 🆕 vX.Y.Z — », « JJ/MM/AAAA : ») ;
//       exemptés : la ligne qui CONTINUE la phrase du commentaire précédent, et le tag sans emoji ni
//       séparateur suivi d'un verbe (« vX.Y.Z cassait… ») — les deux se réécrivent à la main ;
//   (b) un renvoi à un numéro de ligne (« ligne N », « l.N ») : il ment dès la première retouche.
//       Écrire `fichier.js > fonction` ;
//   (c) un renvoi `scripts/check-<nom>.js` vers un fichier absent.
// CLIQUET : le nombre de lignes de commentaire qui citent une version (vX.Y.Z, n'importe où) ne peut que
// baisser (≤ PLAFOND). Après une baisse, abaisser PLAFOND ci-dessous dans le même commit (le script le rappelle).
// Les chaînes, gabarits et regex ne sont pas des commentaires (tokenizer, pas de regex ligne à ligne).
// Ancres d'outils (`🏷️ ancre:`) et marqueurs d'exemption (`popup-native-ok`…) : jamais signalés.
// Usage : node scripts/check-commentaires.js [--liste]   (--liste : lignes du cliquet, par fichier)
// =====================================================================
"use strict";
const fs = require("fs");
const path = require("path");

const PLAFOND = 0;

// ── Tokenizer : repère les commentaires d'un source JS (ou CSS : blocs seuls) ──────────
function commentaires(src, cssSeul) {
  const res = [];
  let i = 0, dernier = "", mot = "";
  const n = src.length, gabarits = [];
  const regexPossible = () => !dernier || /[(,=:[!&|?{};+\-*%<>~^]/.test(dernier) ||
    /^(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(mot);
  function lireGabarit(j) {
    while (j < n) {
      if (src[j] === "\\") { j += 2; continue; }
      if (src[j] === "`") return { j: j, fin: true };
      if (src[j] === "$" && src[j + 1] === "{") return { j: j, fin: false };
      j++;
    }
    return { j: j, fin: true };
  }
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2), fin = e < 0 ? n : e + 2;
      res.push({ type: "bloc", debut: i, fin: fin });
      i = fin; continue;
    }
    if (!cssSeul && c === "/" && d === "/") {
      let e = src.indexOf("\n", i); if (e < 0) e = n;
      if (src[e - 1] === "\r") e--;
      res.push({ type: "ligne", debut: i, fin: e });
      i = e; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === "\\") j++; if (src[j] === "\n" && !cssSeul) break; j++; }
      i = j + 1; dernier = c; mot = ""; continue;
    }
    if (cssSeul) { i++; continue; }
    if (c === "`" || (c === "}" && gabarits.length && gabarits[gabarits.length - 1] === 0)) {
      if (c === "}") gabarits.pop();
      const r = lireGabarit(i + 1);
      if (r.fin) { i = r.j + 1; dernier = "`"; mot = ""; continue; }
      i = r.j + 2; gabarits.push(0); dernier = "{"; mot = ""; continue;
    }
    if (c === "{" && gabarits.length) gabarits[gabarits.length - 1]++;
    if (c === "}" && gabarits.length) gabarits[gabarits.length - 1]--;
    if (c === "/" && regexPossible()) {
      let j = i + 1, classe = false;
      while (j < n) {
        const e = src[j];
        if (e === "\\") { j += 2; continue; }
        if (e === "\n") break;
        if (e === "[") classe = true; else if (e === "]") classe = false; else if (e === "/" && !classe) break;
        j++;
      }
      j++; while (j < n && /[a-z]/i.test(src[j])) j++;
      i = j; dernier = ")"; mot = ""; continue;
    }
    if (/[A-Za-z_$0-9]/.test(c)) {
      let j = i; while (j < n && /[A-Za-z_$0-9]/.test(src[j])) j++;
      mot = src.slice(i, j); dernier = "a"; i = j; continue;
    }
    if (!/\s/.test(c)) { dernier = c; mot = ""; }
    i++;
  }
  return res;
}

// ── Définition d'un tag de version / d'une date EN TÊTE ───────────────────────────────
const EMO = "(?:[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}](?:\\uFE0F|\\u200D\\p{Extended_Pictographic})*)";
const TAG = "(?:\\(?[vV]\\d+\\.\\d+\\.(?:\\d+|x)(?:[-.][\\p{L}\\p{N}]+|/\\d+|/fix\\d*)*\\+*" +
  "(?:\\s*\\+\\s*(?:(?:hot)?fix\\w*|[A-Z]\\d[\\p{L}\\p{N}.]*|\\d+[a-z]))*" +
  "(?:\\s+(?:hot)?fix(?:\\s?#?\\d+)?(?=[\\s:—–-]))?(?:\\s+step\\s?\\d+[a-z]?(?:-[A-Za-z0-9]+)*)?\\)?)";
const UNITE = "(?:" + TAG + "|\\d{1,2}/\\d{1,2}/\\d{4})";
const TETE = new RegExp("^((?:" + EMO + "\\s*)*)(" + UNITE + "(?:\\s*(?:[/+,&]|et|→|->|puis)\\s*" + UNITE + ")*)" +
  "(\\s*(?:—|–|-|:|·|,|\\.)(?=\\s|$))?", "u");
const SUITE = /[\p{L}\p{N},('’]$/u;              // la ligne précédente s'arrête au milieu d'une phrase
const PROTEGE = /🏷️ ancre:|popup-native-ok|lint-ok-modal-lifecycle/;
const NUM_LIGNE_L = /\bl\.\d+|\bl\d{3,}\b/;        // « l.N » : minuscule seulement (« art. L.122-5 » est du droit)
const NUM_LIGNE_MOT = /\b(?:ex-)?lignes?\s*~?\d+/i;
const RENVOI_CHECK = /\bscripts\/(check-[\w-]+\.js)/g;
const VERSION = /\bv\d+\.\d+\.(?:\d+|x)\b/;

// Une ligne de commentaire : son contenu (après « // », « /* » ou « * ») et la ligne précédente du même commentaire.
function teteFautive(contenu, precedent) {
  const m = TETE.exec(contenu);
  if (!m) return false;
  const emoji = !!m[1].trim();
  const reste = contenu.slice(m[0].length).trim();
  if (!emoji && !m[3] && /^\p{Ll}/u.test(reste)) return false;      // « vX.Y.Z cassait… » : le tag est le sujet
  if (!emoji && SUITE.test((precedent || "").trim())) return false;  // suite de la phrase précédente
  return true;
}

// HTML : pas de script inline (CSP), les seuls commentaires sont les <!-- -->.
function commentairesHtml(src) {
  const res = [], re = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(src))) res.push({ type: "html", debut: m.index, fin: m.index + m[0].length });
  return res;
}

function analyser(src, cssSeul, html) {
  const fautes = [], cliquet = [];
  const lignesSrc = src.split("\n");
  const numLigne = (pos) => src.slice(0, pos).split("\n").length;
  (html ? commentairesHtml(src) : commentaires(src, cssSeul)).forEach((c) => {
    const texte = src.slice(c.debut, c.fin);
    if (c.type === "bloc" && texte.startsWith("/*!")) return;
    const l0 = numLigne(c.debut);
    const morceaux = texte.split("\n");
    morceaux.forEach((seg, k) => {
      const no = l0 + k;
      if (PROTEGE.test(seg)) return;
      if (VERSION.test(seg)) cliquet.push(no);
      let contenu, precedent = "";
      if (c.type === "html") {
        contenu = seg.replace(/^\s*<!--\s*/, "").replace(/\s*-->\s*$/, "");
        if (k > 0) precedent = morceaux[k - 1].replace(/^\s*<!--\s*/, "").trim();
      } else if (c.type === "ligne") {
        contenu = seg.replace(/^\/\/+\s*/, "");
        const avant = lignesSrc[no - 2] || "";
        const debutLigne = lignesSrc[no - 1] || "";
        if (/^\s*\/\//.test(avant) && /^\s*\/\//.test(debutLigne)) precedent = avant.replace(/^\s*\/\/+\s*/, "");
      } else {
        contenu = k === 0 ? seg.replace(/^\/\*+\s*/, "") : seg.replace(/^\s*(?:\*(?!\/)\s*)?/, "");
        if (k > 0) precedent = morceaux[k - 1].replace(/^\s*(?:\/\*+|\*)?\s*/, "");
      }
      contenu = contenu.replace(/\s*\*\/\s*$/, "").replace(/\r$/, "");
      if (teteFautive(contenu, precedent)) fautes.push({ no: no, quoi: "tag de version / date en tête", txt: seg });
      if (NUM_LIGNE_MOT.test(seg) || NUM_LIGNE_L.test(seg)) {
        fautes.push({ no: no, quoi: "renvoi à un numéro de ligne", txt: seg });
      }
      let r;
      RENVOI_CHECK.lastIndex = 0;
      while ((r = RENVOI_CHECK.exec(seg))) {
        if (!fs.existsSync(path.join("scripts", r[1]))) {
          fautes.push({ no: no, quoi: "renvoi vers un garde-fou absent (scripts/" + r[1] + ")", txt: seg });
        }
      }
    });
  });
  return { fautes: fautes, cliquet: cliquet };
}

// ── Auto-test (chaque passage) : un motif qui ne voit plus une forme connue = garde-fou à vide ──
const DOIT_VOIR = [
  "// 🆕 v9.9.9 — test", "/* 🐛 v1.2.3-fix2 : x */", "// 16/10/2026 (KARMA) : x", "x(); // 🆔 v2.1.0",
  "/**\n * 🔧 v1.13.0-fix12 — BANNIÈRE\n */", "// v1.14.20-hotfix6 — route KMZ", "// voir ligne 42",
  "// cf l.42", "// cf scripts/check-nexiste-pas-xyz.js", "// (~ligne 790)"
];
const NE_DOIT_PAS_VOIR = [
  "x = \"// 🆕 v9.9.9 — dans une chaîne\";", "y = `// 🆕 v9.9.9 — ${a} gabarit`;", "// 🏷️ ancre:v1.2.3",
  "// corrigé en\n// v1.2.3 — suite de phrase", "// v1.35.0 cassait l'image", "// CPI art. L.122-5",
  "// rien à signaler", "// la 2e ligne du bandeau", "/*! licence v1.2.3 — x */",
  "// cf scripts/check-popups-natives.js", "const r = /\\/\\/ 🆕 v9.9.9 —/;"
];
const ratesVoir = DOIT_VOIR.filter((s) => analyser(s, false).fautes.length === 0);
const ratesPas = NE_DOIT_PAS_VOIR.filter((s) => analyser(s, false).fautes.length !== 0);
if (analyser("<!-- 🆕 v9.9.9 — test -->", false, true).fautes.length === 0) ratesVoir.push("<!-- 🆕 v9.9.9 — test -->");
if (analyser("<p title=\"v9.9.9\">x</p><!-- rien -->", false, true).fautes.length !== 0) ratesPas.push("<!-- rien -->");
if (ratesVoir.length || ratesPas.length) {
  console.log("❌ check-commentaires : le motif a régressé" +
    (ratesVoir.length ? "\n     ne voit plus : " + ratesVoir.map((s) => JSON.stringify(s)).join(" · ") : "") +
    (ratesPas.length ? "\n     voit à tort : " + ratesPas.map((s) => JSON.stringify(s)).join(" · ") : ""));
  process.exit(1);
}

// ── Fichiers ─────────────────────────────────────────────────────────────────────────
function jsDe(dossier, recursif) {
  if (!fs.existsSync(dossier)) return [];
  let out = [];
  fs.readdirSync(dossier, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) { if (recursif && e.name !== "node_modules") out = out.concat(jsDe(p, true)); }
    else if (e.name.endsWith(".js")) out.push(p);
  });
  return out;
}
const fichiers = jsDe("js", false).filter((f) => path.basename(f) !== "copyright.js")
  .concat(["sw.js", path.join("css", "style.css"), "index.html"], jsDe("scripts", true))
  .filter((f) => fs.existsSync(f)).sort();

const liste = process.argv.indexOf("--liste") >= 0;
let total = 0;
const fautes = [], parFichier = [];
fichiers.forEach((f) => {
  const r = analyser(fs.readFileSync(f, "utf8"), f.endsWith(".css"), f.endsWith(".html"));
  r.fautes.forEach((x) => fautes.push(f.replace(/\\/g, "/") + ":" + x.no + "  " + x.quoi + "\n       " +
    x.txt.trim().slice(0, 110)));
  if (r.cliquet.length) { total += r.cliquet.length; parFichier.push([r.cliquet.length, f.replace(/\\/g, "/")]); }
});
parFichier.sort((a, b) => b[0] - a[0]);
if (liste) { parFichier.forEach(([n, f]) => console.log(String(n).padStart(5) + "  " + f)); process.exit(0); }

if (fautes.length) {
  console.log("❌ commentaires : " + fautes.length + " faute(s) — convention « Commentaires » de CLAUDE.md");
  fautes.slice(0, 25).forEach((x) => console.log("     " + x));
  if (fautes.length > 25) console.log("     … et " + (fautes.length - 25) + " autre(s)");
  process.exit(1);
}
const detail = parFichier.slice(0, 8).map(([n, f]) => n + " " + f).join(" · ");
if (total > PLAFOND) {
  console.log("❌ commentaires : " + total + " lignes citent une version > plafond " + PLAFOND +
    " — l'historique va dans le commit et README.md, pas dans le code\n     " + detail);
  process.exit(1);
}
console.log("✅ commentaires : aucun tag de version en tête, aucun renvoi « ligne N », garde-fous cités présents ; " +
  total + " lignes citent encore une version (plafond " + PLAFOND + ", ne peut que baisser)\n     " + detail);
if (total < PLAFOND) {
  console.log("   ↳ " + (PLAFOND - total) + " de moins : abaisse PLAFOND à " + total +
    " dans scripts/check-commentaires.js (cliquet)");
}
