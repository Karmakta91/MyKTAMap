#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-derogations-data.js — garde-fou pre-commit BLOQUANT
// =====================================================================
// 🔒 Garde la dérogation `data/` des commits déjà poussés
// (scripts/ci-derogations-data.txt, lue par check-data-hors-git.js en CI) :
//   1. le fichier réel est bien formé (une ligne mal écrite ne déroge à rien
//      et laisserait la CI de main rouge sans dire pourquoi) ;
//   2. le contrôle s'exécute pour de vrai, sur une copie isolée du script et
//      un fichier de dérogations d'essai : SHA listé → passe ; non listé,
//      SHA abrégé, motif vide ou trop court → refusé ; ligne `Data-deroge:`
//      toujours acceptée ; commit sans `data/` → passe.
// Usage : node scripts/check-derogations-data.js   (appelé par .githooks/pre-commit)
// =====================================================================
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { lireDerogations, FICHIER_DEROGATIONS } = require("./check-data-hors-git.js");

const problemes = [];

// 1. Fichier réel.
let reel = null;
try { reel = fs.readFileSync(FICHIER_DEROGATIONS, "utf8"); } catch (e) {
  problemes.push("scripts/ci-derogations-data.txt introuvable (lu par check-data-hors-git.js en CI)");
}
if (reel !== null) {
  lireDerogations(reel).erreurs.forEach(e => problemes.push("scripts/ci-derogations-data.txt, " + e));
}

// 2. Exécution réelle sur une copie isolée (le script lit le fichier posé à côté de lui).
const SHA_LISTE = "a".repeat(40);
const SHA_AUTRE = "b".repeat(40);
const SHA_ABREGE = "c".repeat(40);
const SHA_SANS_MOTIF = "d".repeat(40);
const SHA_MOTIF_COURT = "e".repeat(40);
const essai = [
  "# commentaire ignoré",
  SHA_LISTE + " relevé fictif d'essai",
  SHA_ABREGE.slice(0, 8) + " SHA abrégé refusé",
  SHA_SANS_MOTIF,
  SHA_MOTIF_COURT + " abc",
  ""
].join("\n");

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "kta-derog-data-"));
try {
  const script = path.join(dossier, "check-data-hors-git.js");
  fs.copyFileSync(path.join(__dirname, "check-data-hors-git.js"), script);
  fs.writeFileSync(path.join(dossier, "ci-derogations-data.txt"), essai);
  const msgVide = path.join(dossier, "msg-vide.txt");
  const msgDero = path.join(dossier, "msg-dero.txt");
  fs.writeFileSync(msgVide, "feat: essai\n");
  fs.writeFileSync(msgDero, "feat: essai\n\nData-deroge: relevé fictif d'essai\n");

  const lancer = (sha, fichiers, msg) => {
    const env = Object.assign({}, process.env, { KTA_FICHIERS_CI: fichiers });
    delete env.KTA_COMMIT_CI;
    if (sha) env.KTA_COMMIT_CI = sha;
    return spawnSync(process.execPath, [script, msg], { env, encoding: "utf8" }).status;
  };
  const cas = [
    ["SHA complet listé avec motif → passe", lancer(SHA_LISTE, "data/test/a.json", msgVide), 0],
    ["SHA listé écrit en majuscules → passe", lancer(SHA_LISTE.toUpperCase(), "data/test/a.json", msgVide), 0],
    ["SHA non listé → refusé", lancer(SHA_AUTRE, "data/test/a.json", msgVide), 1],
    ["SHA listé en abrégé → refusé", lancer(SHA_ABREGE, "data/test/a.json", msgVide), 1],
    ["SHA abrégé passé au contrôle → refusé", lancer(SHA_LISTE.slice(0, 8), "data/test/a.json", msgVide), 1],
    ["SHA listé sans motif → refusé", lancer(SHA_SANS_MOTIF, "data/test/a.json", msgVide), 1],
    ["SHA listé, motif de moins de 5 caractères → refusé", lancer(SHA_MOTIF_COURT, "data/a.zip", msgVide), 1],
    ["hors CI (pas de SHA) sans Data-deroge → refusé", lancer(null, "data/test/a.json", msgVide), 1],
    ["ligne Data-deroge dans le message → passe", lancer(SHA_AUTRE, "data/test/a.json", msgDero), 0],
    ["commit sans data/ → passe", lancer(SHA_AUTRE, "js/a.js", msgVide), 0]
  ];
  cas.forEach(([nom, obtenu, attendu]) => {
    if (obtenu !== attendu) problemes.push("essai « " + nom + " » : sortie " + obtenu + ", attendu " + attendu);
  });
  if (lireDerogations(essai).erreurs.length !== 3) {
    problemes.push("essai : les 3 lignes mal formées du fichier d'essai doivent être signalées");
  }
} finally {
  fs.rmSync(dossier, { recursive: true, force: true });
}

if (problemes.length) {
  console.log("🛑 [check-derogations-data] " + problemes.length + " problème(s) :");
  problemes.forEach(p => console.log("   • " + p));
  console.log("   Format : <SHA complet, 40 caractères> <motif, 5 caractères minimum> (en-tête du fichier).");
  process.exit(1);
}
console.log("✅ [check-derogations-data] dérogations data/ des commits poussés : fichier bien formé, " +
            "contrôle vérifié");
