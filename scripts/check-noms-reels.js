#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🗺️ check-noms-reels.js — garde-fou pre-commit + commit-msg + CI BLOQUANT
// =====================================================================
// Refuse la réintroduction d'un nom réel lié aux relevés de terrain (nom du
// département des relevés, ses variantes, son gentilé) dans un fichier suivi,
// un chemin de fichier ou un message de commit.
//
// POURQUOI (12/10/2026) : le dépôt est public depuis le 11/10/2026. Le nom du
// département des relevés réels traînait dans des commentaires `js/`, des
// tests `scripts/`, le journal et `docs/architecture/` — en exemple d'étiquette,
// de dossier, de sous-titre de kiosque, de mesure. Neutralisé partout le
// 12/10 ; rien n'empêchait de le réécrire au prochain exemple.
//
// 🔐 LE NOM N'EST PAS ÉCRIT ICI : le contrôle compare l'EMPREINTE sha256 de
// chaque mot (normalisé : accents ôtés, minuscules, camelCase et `_`/`-`
// découpés) à une liste d'empreintes. Limite assumée : une empreinte de mot
// courant se retrouve en essayant une liste de candidats (une centaine de
// départements) — elle évite la lecture et le `grep`, pas la déduction. Le nom
// reste de toute façon dans l'historique Git d'avant le 12/10.
// Pour un nom qu'on ne veut même pas exposer en empreinte : liste HORS DÉPÔT,
// facultative, `~/.myktamap/noms-interdits.txt` (un mot par ligne, `#` =
// commentaire), hachée au chargement. Elle protège le poste ; la CI ne la voit
// pas.
//
// AJOUTER UN MOT À LA LISTE PUBLIQUE :
//   node -e "console.log(require('./scripts/check-noms-reels.js').empreinte('Mot'))"
//
// PORTÉE :
//   - pre-commit : fichiers indexés (contenu de l'INDEX) ; KTA_FICHIERS_CI
//     (liste de fichiers) si posée ;
//   - CI (`CI` posé par GitHub Actions) ou `--tout` : TOUS les fichiers suivis ;
//   - `--message <fichier>` : le message de commit (commit-msg, ci-commits.sh).
//   Hors portée : `data/` (jamais publié, cf check-data-hors-git.js), `lib/`
//   (tiers), binaires.
//
// Pas de dérogation : un nom réel n'a aucune raison légitime d'être publié.
// =====================================================================
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

// Département des relevés réels : nom, gentilé (4 formes).
const EMPREINTES = [
  "c7952202475c602e69a9a0c415068969811aed2284c205da10a80341fb71d6ca",
  "8a39acd3528ca3a8342c0596ef71324fb87892438c2afadbe96f8da6bfb1f10c",
  "dd11fffd7e6f8825ab12e5eab367bd88d10ceca5919f876c1a143e89eebeded3",
  "5eea13e2a372b09ee93e46b173516b7b6cdfdb0070c82aabe7881dab8f6502e6",
  "b80c5a59ec16115c16f44f7738acb781d92b45426dcb16329e03bf373d39cba5"
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

// Mots d'un texte : découpe sur tout ce qui n'est pas une lettre, et sur les
// frontières camelCase (« dossierXyz » → « dossier », « Xyz »).
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

// Renvoie [{ ligne, mot }] pour chaque mot interdit du texte.
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

// Auto-test : la normalisation doit attraper les formes qui l'ont fait naître
// (casse, accents, camelCase, identifiant `f_xxx`), sur un mot fictif.
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
