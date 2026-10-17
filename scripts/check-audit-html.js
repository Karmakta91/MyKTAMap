#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// check-audit-html.js — garde-fou pre-commit BLOQUANT (donc CI) : pages d'audit = rendu exact de leurs .md
// =====================================================================
// NETWORK_AUDIT{,_HISTORIQUE}.html sont GÉNÉRÉES par scripts/audit-html.js. Refuse un .html qui diffère :
// .md modifié sans régénérer → la page servie ment par omission ; .html retouché à la main → retouche perdue
// à la prochaine génération. Vérifie aussi que la page ne dépend que de fichiers précachés (hors ligne).
// ⚠️ Lit l'INDEX (`git show :chemin`), repli sur le disque hors Git ; contrôle complet à chaque passage, sans
// `git diff --cached` : marche tel quel en CI, pas besoin de KTA_FICHIERS_CI.
// Réparer : node scripts/audit-html.js, puis indexer les deux .html.
// Usage : node scripts/check-audit-html.js   (appelé par .githooks/pre-commit)
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const gen = require("./audit-html.js");

const RACINE = path.join(__dirname, "..");
function lire(rel) {
  try {
    return execFileSync("git", ["show", ":" + rel], { cwd: RACINE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    const f = path.join(RACINE, rel);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  }
}

const echecs = [];
function verif(ok, msg) { if (!ok) echecs.push(msg); }

// Auto-test : un .md modifié doit changer la page, sinon la comparaison ne prouve rien.
{
  const a = gen.generer("NETWORK_AUDIT.md", "# Titre\n\n> À jour pour la version **v0.0.1**\n\nTexte.\n");
  const b = gen.generer("NETWORK_AUDIT.md", "# Titre\n\n> À jour pour la version **v0.0.2**\n\nTexte.\n");
  const c = gen.generer("NETWORK_AUDIT.md", "# Titre\n\n> À jour pour la version **v0.0.1**\n\nTexte.\n");
  if (a === b || a !== c || !/<script src="audit-pied\.js"><\/script>/.test(a) || /<style|<script>/.test(a)) {
    console.error("❌ [check-audit-html] l'auto-test échoue : la génération n'est plus déterministe ou plus sensible au .md.");
    process.exit(1);
  }
}

gen.PAGES.forEach((p) => {
  const md = lire(gen.DOSSIER + "/" + p.md);
  const html = lire(gen.DOSSIER + "/" + p.html);
  if (md === null) { echecs.push(p.md + " introuvable"); return; }
  if (html === null) { echecs.push(p.html + " introuvable — node scripts/audit-html.js"); return; }
  let attendu;
  try { attendu = gen.generer(p.md, md); } catch (e) { echecs.push(p.md + " : " + e.message); return; }
  verif(gen.lf(html) === attendu, p.html + " ne correspond pas à " + p.md +
    " (régénérer : node scripts/audit-html.js — ne jamais retoucher le .html à la main)");
});

// Hors ligne : la page et ses deux dépendances sont précachées (sw.js > ASSETS_TO_CACHE).
const sw = lire("sw.js") || "";
["audit.css", "audit-pied.js", "NETWORK_AUDIT.html", "NETWORK_AUDIT_HISTORIQUE.html"].forEach((f) => {
  verif(sw.includes('"./' + gen.DOSSIER + "/" + f + '"'), "sw.js : ./" + gen.DOSSIER + "/" + f + " absent du précache");
  verif(lire(gen.DOSSIER + "/" + f) !== null, gen.DOSSIER + "/" + f + " absent du dépôt");
});

if (echecs.length) {
  console.error("❌ [check-audit-html] pages d'audit réseau :");
  echecs.forEach((m) => console.error("   - " + m));
  process.exit(1);
}
console.log("✅ [check-audit-html] pages d'audit = rendu de leurs .md, dépendances précachées");
