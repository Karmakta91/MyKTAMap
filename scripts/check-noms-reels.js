#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-noms-reels.js — garde-fou pre-commit + commit-msg + CI BLOQUANT
// =====================================================================
// Refuse un nom réel lié aux relevés de terrain (département des relevés,
// variantes, gentilé) dans un fichier suivi, un chemin ou un message de
// commit : le dépôt est public, un exemple suffit à le réintroduire.
// 🔒 Le nom n'est pas écrit ici : on compare l'empreinte sha256 de chaque mot
// normalisé (sans accents, minuscules, camelCase et `_`/`-` découpés). Limite
// assumée : évite la lecture et le `grep`, pas la déduction par candidats.
// Liste facultative hors dépôt `~/.myktamap/noms-interdits.txt` (un mot par
// ligne, `#` = commentaire), hachée au chargement ; la CI ne la voit pas.
// Ajouter un mot : node -e "console.log(require('./scripts/check-noms-reels.js').empreinte('Mot'))"
// Portée : pre-commit = contenu de l'INDEX (ou KTA_FICHIERS_CI) ; CI ou
// `--tout` = tous les fichiers suivis ; `--message <fichier>` = message de
// commit (commit-msg, ci-commits.sh). Hors portée : `data/`
// (check-data-hors-git.js), `lib/`, binaires. Pas de dérogation.
// =====================================================================
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

// Département des relevés réels : nom, gentilé (4 formes) ; puis voir ci-dessous.
const EMPREINTES = [
  "c7952202475c602e69a9a0c415068969811aed2284c205da10a80341fb71d6ca",
  "8a39acd3528ca3a8342c0596ef71324fb87892438c2afadbe96f8da6bfb1f10c",
  "dd11fffd7e6f8825ab12e5eab367bd88d10ceca5919f876c1a143e89eebeded3",
  "5eea13e2a372b09ee93e46b173516b7b6cdfdb0070c82aabe7881dab8f6502e6",
  "b80c5a59ec16115c16f44f7738acb781d92b45426dcb16329e03bf373d39cba5",
  // Nom d'un plan réel (12/10/2026) puis région des relevés (4 formes).
  "cc61e6cd50aa732dc321e588f0a1a9457f14f06d163b0a53c50055d36e88421f",
  "2800e0072f7dbacb939635c08cdc3af7706a15cd6c7fcfe5865021da33c7ddb4",
  "2a726e56c80adf3acf37f5204ad1bbc111f16606d632fe4727d96510072ce5db",
  "492ca6c94c41ac1d86e7b786236f0bed60d946b11c4f0b279e73f1d74a06c116",
  "13beeaca798b0913d97a9ebc116251930049cb311a78d8c63b6d97a82c5a7d9b"
];

const LISTE_LOCALE = path.join(os.homedir(), ".myktamap", "noms-interdits.txt");

const BINAIRES = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".kmz",
  ".gz", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".mp4", ".webm", ".bin", ".tif", ".tiff"];

function normaliser(mot) {
  return String(mot).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function empreinte(mot) {
  return crypto.createHash("sha256").update(normaliser(mot), "utf8").digest("hex");
}

// Découpe sur toute non-lettre et aux frontières camelCase (« dossierXyz »).
function mots(texte) {
  const t = String(texte).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  return t.split(/[^A-Za-z]+/).filter(function (m) { return m.length >= 3; });
}

function chargerEmpreintes() {
  const set = new Set(EMPREINTES);
  try {
    fs.readFileSync(LISTE_LOCALE, "utf8").split(/\r?\n/).forEach(function (l) {
      const m = l.replace(/#.*/, "").trim();
      if (m) mots(m).forEach(function (x) { set.add(empreinte(x)); });
    });
  } catch (e) { /* liste locale facultative */ }
  return set;
}

// → [{ ligne, mot }]
function chercher(texte, set, cache) {
  const trouves = [];
  String(texte).split(/\n/).forEach(function (ligne, i) {
    mots(ligne).forEach(function (m) {
      const k = m.toLowerCase();
      let h = cache.get(k);
      if (h === undefined) { h = set.has(empreinte(k)); cache.set(k, h); }
      if (h) trouves.push({ ligne: i + 1, mot: m });
    });
  });
  return trouves;
}

function horsPortee(f) {
  const n = f.replace(/\\/g, "/");
  return n.indexOf("data/") === 0 || n.indexOf("lib/") === 0 ||
    BINAIRES.indexOf(path.extname(n).toLowerCase()) >= 0;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024 });
}

// { fichiers, depuisIndex }
function cibles(argv) {
  if (process.env.KTA_FICHIERS_CI !== undefined) {
    return { fichiers: process.env.KTA_FICHIERS_CI.split(/\r?\n/).map(function (s) { return s.trim(); })
      .filter(function (f) { return f && fs.existsSync(f); }), depuisIndex: false };
  }
  if (argv.indexOf("--tout") >= 0 || process.env.CI) {
    return { fichiers: git(["ls-files", "-z"]).split("\0").filter(Boolean), depuisIndex: false };
  }
  return { fichiers: git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
    .split("\0").filter(Boolean), depuisIndex: true };
}

function lire(f, depuisIndex) {
  if (depuisIndex) {
    try { return git(["show", ":" + f]); } catch (e) { /* repli worktree */ }
  }
  try { return fs.readFileSync(f, "utf8"); } catch (e) { return null; }
}

// Auto-test sur un mot fictif : casse, accents, camelCase, identifiant `f_xxx`.
function autoTest() {
  const set = new Set([empreinte("Valbrume")]);
  const c = new Map();
  const ok = chercher("VALBRUME", set, c).length === 1 &&
    chercher("« Valbrumé »", set, c).length === 1 &&
    chercher("dossierValbrume", set, c).length === 1 &&
    chercher('id: "f_valbrume"', set, c).length === 1 &&
    chercher("Valbrumes et valbrum", set, c).length === 0 &&
    EMPREINTES.every(function (h) { return /^[0-9a-f]{64}$/.test(h); });
  if (!ok) {
    console.error("❌ [check-noms-reels] auto-test en échec : la normalisation ne détecte plus.");
    process.exit(2);
  }
}

function main() {
  autoTest();
  const argv = process.argv.slice(2);
  const set = chargerEmpreintes();
  const cache = new Map();
  const fautes = [];

  const iMsg = argv.indexOf("--message");
  if (iMsg >= 0) {
    const fic = argv[iMsg + 1];
    let msg = "";
    try { msg = fs.readFileSync(fic, "utf8"); } catch (e) { /* message illisible : rien à voir */ }
    // Les lignes `#` du gabarit git ne partent pas dans le commit.
    msg = msg.split(/\r?\n/).filter(function (l) { return l.charAt(0) !== "#"; }).join("\n");
    chercher(msg, set, cache).forEach(function (t) {
      fautes.push("message de commit, ligne " + t.ligne);
    });
  } else {
    const c = cibles(argv);
    c.fichiers.forEach(function (f) {
      if (horsPortee(f)) return;
      chercher(f, set, cache).forEach(function () { fautes.push(f + " (chemin)"); });
      const txt = lire(f, c.depuisIndex);
      if (txt === null || txt.indexOf("\0") >= 0) return;
      chercher(txt, set, cache).forEach(function (t) { fautes.push(f + ":" + t.ligne); });
    });
  }

  if (fautes.length) {
    console.error("❌ [check-noms-reels] nom réel lié aux relevés de terrain (" + fautes.length + ") :");
    fautes.slice(0, 40).forEach(function (f) { console.error("   " + f); });
    console.error("   Le dépôt est public : remplacer par une formulation neutre (« Secteur »,");
    console.error("   « relevé réel », « département des relevés »…). Pas de dérogation.");
    process.exit(1);
  }
  console.log("✅ [check-noms-reels] aucun nom réel de relevé");
}

if (require.main === module) main();
module.exports = { empreinte: empreinte, mots: mots };
