#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-classement-doc.js — garde-fou pré-commit BLOQUANT, sur le poste seulement : classement par le site de doc
// =====================================================================
// Le site de documentation (dépôt voisin MyKTAMap-doc, privé) refuse de se construire dès qu'un fichier .md /
// .html / .svg suivi ici n'est classé ni par une entrée de son manifeste, ni par une règle : le site public reste
// alors figé sans que personne ne le voie (la CI de la doc rougit, ailleurs). Ce garde-fou rejoue le classement de
// la doc AU COMMIT qui ajoute, supprime ou renomme un tel fichier, avec l'inventaire du générateur lui-même
// (MyKTAMap-doc/generateur/build.js > inventorier) — aucune règle recopiée ici.
// ⚠️ Ne tourne que si le dépôt doc est à côté (ou KTA_DOC_DEPOT) : en CI et chez un contributeur, il passe sans
//    rien dire — le dépôt doc est privé, la CI de ce dépôt public ne peut pas le lire.
// 🩸 Seules les erreurs qui visent ce dépôt bloquent : une erreur du pro ou du manifeste lui-même est affichée
//    en avertissement, elle se corrige là-bas.
// Corriger : une entrée (niveau explicite) ou une règle dans MyKTAMap-doc/generateur/manifeste.js.
// =====================================================================
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DOCS = /\.(md|html?|svg)$/i;

function sortir(code, msg) { if (msg) console.log(msg); process.exit(code); }

if (process.env.CI) sortir(0);
const racine = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const depotDoc = process.env.KTA_DOC_DEPOT || path.join(racine, "..", "MyKTAMap-doc");
const build = path.join(depotDoc, "generateur", "build.js");
if (!fs.existsSync(build)) sortir(0);

// Rien d'ajouté, supprimé ou renommé parmi les fichiers documentaires indexés : rien à vérifier.
const touches = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ADR", "-z"], { encoding: "utf8" })
  .split("\0").filter((f) => DOCS.test(f));
if (!touches.length && !process.argv.includes("--tout")) sortir(0);

// L'inventaire lit CE dépôt (index compris : `git ls-files` voit un fichier ajouté mais pas encore commité).
process.env.KTA_DOC_COMMUNITY = racine;
let inv;
try {
  inv = require(build).inventorier();
} catch (e) {
  sortir(0, "[check-classement-doc] ⚠️ inventaire de la doc illisible (" + e.message + ") — classement non vérifié");
}
const ici = inv.erreurs.filter((m) => /\bcommunity:/.test(m));
const ailleurs = inv.erreurs.filter((m) => !/\bcommunity:/.test(m));
for (const m of ailleurs) console.log("[check-classement-doc] ⚠️ (hors de ce dépôt) " + m);
if (ici.length) {
  console.error("[check-classement-doc] ⛔ le site de documentation ne se construirait plus :\n  " + ici.join("\n  ") +
    "\n  → classer dans " + path.join(depotDoc, "generateur", "manifeste.js") +
    " (entrée explicite pour public/clients, sinon règle interneAuto ou ignorer)");
  process.exit(1);
}
sortir(0, "[check-classement-doc] ✅ " + (touches.length || "tous les") + " fichier(s) documentaire(s) classé(s) par le site de doc");
