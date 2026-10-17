#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-data-hors-git.js — garde-fou commit-msg + CI BLOQUANT
// =====================================================================
// 🔒 Refuse tout commit qui embarque un fichier de `data/` : il reçoit des
// relevés réels de terrain (galeries, entrées, nom du réseau) qui ne partent
// jamais sur le dépôt public. Seul le relevé fictif y vit, mis à jour sur
// consigne explicite seulement.
// 🩸 Le dossier d'un plan n'est pas suivi, mais `data/index.json` l'EST : un
// `git commit -a` suffit à publier le nom d'un réseau. L'interdiction d'écrire
// dans data/ ne protège pas du commit.
// Portée : tout chemin indexé sous `data/` (ou KTA_FICHIERS_CI en CI), sans
// exception automatique, relevé fictif compris.
// Dérogation (archivée dans l'historique) : ligne `Data-deroge: <motif>` dans
// le message de commit, 5 caractères minimum.
// Usage (appelé par .githooks/commit-msg et scripts/ci-commits.sh) :
//   node scripts/check-data-hors-git.js <chemin-du-message>
// =====================================================================
"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");

function indexes() {
  // CI (scripts/ci-commits.sh) : les fichiers d'UN commit poussé, son message en argument.
  if (process.env.KTA_FICHIERS_CI !== undefined) {
    return process.env.KTA_FICHIERS_CI.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
  try {
    return execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
                        { encoding: "utf8" })
      .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch (e) {
    console.error("❌ [check-data-hors-git] git indisponible : " + e.message);
    process.exit(2);
  }
}

const fautifs = indexes().filter(p => p === "data" || p.startsWith("data/"));
if (!fautifs.length) process.exit(0);

// Message illisible (amend en cours…) = pas de dérogation possible = refus.
let message = "";
const chemin = process.argv[2];
if (chemin) { try { message = fs.readFileSync(chemin, "utf8"); } catch (e) {} }

const dero = (message.match(/^\s*Data-deroge\s*:\s*(.+)$/im) || [])[1];
if (dero && dero.trim().length >= 5) {
  console.log("⚠️  [check-data-hors-git] " + fautifs.length + " fichier(s) de `data/` dans ce commit — " +
              "dérogation acceptée : « " + dero.trim() + " »");
  fautifs.forEach(p => console.log("   • " + p));
  process.exit(0);
}

console.log("");
console.log("============================================================");
console.log("🛑 COMMIT REFUSÉ — des fichiers de `data/` sont indexés");
console.log("============================================================");
fautifs.forEach(p => console.log("   • " + p));
console.log("");
console.log("   `data/` contient des relevés RÉELS de terrain : ils ne partent");
console.log("   jamais sur le dépôt public. Seul le relevé fictif y vit, et même");
console.log("   lui ne se met à jour que sur consigne explicite de KARMA.");
console.log("");
console.log("   Retirer de l'index :");
console.log("       git restore --staged data/");
console.log("");
console.log("   Si la mise à jour est VOULUE, ajouter au message de commit :");
console.log("       Data-deroge: <pourquoi>");
console.log("   (5 caractères minimum ; la raison reste dans l'historique Git)");
console.log("");
console.log("   Détails : CLAUDE.md § « Garde-fous — NE JAMAIS »");
console.log("");
process.exit(1);
