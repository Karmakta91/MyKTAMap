#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🗺️ check-data-hors-git.js — garde-fou commit-msg BLOQUANT
// =====================================================================
// Refuse tout commit qui embarque un fichier de `data/`.
//
// POURQUOI (consigne KARMA, 26/09/2026) : `data/` reçoit des **relevés réels
// de terrain**. Un relevé de carrière n'a rien à faire sur un dépôt public —
// ni le tracé des galeries, ni les entrées, ni le nom du réseau. Le dépôt ne
// publie QUE le relevé fictif de démonstration, et même lui ne se met à jour
// que sur consigne explicite.
//
// 🩸 CE QUI L'A FAIT NAÎTRE : un plan réel déposé dans `data/` pour servir de
// cas de test. Le dossier lui-même n'était pas suivi — mais `data/index.json`,
// lui, l'EST : il avait été modifié pour pointer vers ce plan. Un `git commit
// -a` ou un `git add data/` aurait publié le nom du réseau et cassé la démo,
// sans que rien ne proteste. La règle « Claude ne touche pas à data/ » existait
// déjà côté ÉCRITURE (permission `deny`) ; elle ne disait rien du COMMIT, et
// c'est par là que ça passait.
//
// PORTÉE : tout chemin indexé qui commence par `data/`. Aucune exception
// automatique, pas même le relevé fictif — la consigne est « sauf consigne
// précise », donc elle doit s'écrire, et rester dans l'historique.
//
// DÉROGATION (même mécanique que `Docs-deroge:` de check-release-docs) :
//   Data-deroge: <motif>
// dans le message de commit. Elle est archivée dans Git : dans six mois, on
// saura POURQUOI un fichier de données est parti.
//
// Usage (appelé par .githooks/commit-msg) :
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

// Le message peut ne pas être lisible (amend en cours, etc.) : sans message,
// pas de dérogation possible, donc refus.
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
