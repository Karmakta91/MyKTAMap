#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-release-docs.js — BLOQUANT (commit-msg) : un bump de version = sources cohérentes + docs suivies
// (règle des 4 axes de CLAUDE.md, skill `release`).
// Déclencheur : la clé `version` de version.json diffère entre HEAD et l'INDEX (pas le message : un préfixe
// `release(...)` peut manquer). Sans bump, sortie silencieuse.
// Deux niveaux, comme le RELEASE_GATE :
//   🔒 NOYAU, jamais dérogeable : les 3 sources de version concordent. Un CACHE_NAME oublié = le service
//      worker ressert l'ancien cache, la mise à jour n'atteint jamais les clients.
//   DOC, dérogeable : README, Audit réseau (md + html générés) et AI_CONTEXT suivent. Sans AI_CONTEXT
//      à jour, la modale Aide IA nie les features livrées.
// ⚠️ Déroger = ligne `Docs-deroge: <motif · risque accepté · rattrapage>` dans le message (décision humaine,
//    jamais écrite par l'IA), qui reste dans l'historique.
// Limites : un `--amend` sur un commit déjà bumpé ne redéclenche rien ; le script lit le dépôt, pas le
// serveur (l'item 13 du smoke attrape les uploads partiels).
// =====================================================================

const { execFileSync } = require("child_process");

const msgPath = process.argv[2];
if (!msgPath) {
  console.error("❌ [check-release-docs] chemin du message de commit manquant (argument 1)");
  process.exit(2);
}

const fs = require("fs");

// ── Utilitaires ──────
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function gitOuNull(args) {
  try { return git(args); } catch (e) { return null; }
}
// Contenu tel qu'il sera COMMITÉ (index), pas tel qu'il est sur le disque.
const depuisIndex = (p) => gitOuNull(["show", ":" + p]);

// ── 1. Détection du bump ──────
const brutIndex = depuisIndex("version.json");
if (brutIndex === null) process.exit(0); // version.json absent du dépôt : rien à contrôler

let vNouvelle;
try {
  vNouvelle = JSON.parse(brutIndex).version;
} catch (e) {
  // JSON illisible = conflit de merge le plus souvent ; pas à ce garde-fou de le trancher.
  console.log("ℹ️  [release-docs] version.json illisible dans l'index — contrôle passé.");
  process.exit(0);
}

let vAncienne = null;
const brutHead = gitOuNull(["show", "HEAD:version.json"]);
if (brutHead !== null) {
  try { vAncienne = JSON.parse(brutHead).version; } catch (e) { vAncienne = null; }
}

if (!vNouvelle || vNouvelle === vAncienne) process.exit(0); // pas un bump → silence total

// ── 2. Dérogation déclarée dans le message ──────
// 🩸 Lignes `#` retirées AVANT la recherche : elles disparaissent du commit final, donc ne laissent pas de trace.
let message = "";
try { message = fs.readFileSync(msgPath, "utf8"); } catch (e) { message = ""; }
const messageUtile = message.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n");
const mDero = /^\s*Docs-d[ée]roge\s*:\s*(.+?)\s*$/im.exec(messageUtile);
const motifDero = mDero && mDero[1].length >= 5 ? mDero[1] : null;

// ── 3. Contrôles ──────
const V = vNouvelle;
const reV = new RegExp(esc(V));
const echecsNoyau = [];
const echecsDoc = [];

function noyau(nom, ok, aide) {
  console.log((ok ? "✅" : "❌") + " 🔒 " + nom);
  if (!ok) echecsNoyau.push(aide);
}
function doc(nom, ok, aide) {
  console.log((ok ? "✅" : (motifDero ? "⚠️ " : "❌")) + " 📄 " + nom);
  if (!ok) echecsDoc.push(aide);
}

// Ligne (dans un contenu) qui contient un repère, ou "" si absente.
function ligneAvec(contenu, repere) {
  if (!contenu) return "";
  const l = contenu.split(/\r?\n/).find((x) => x.indexOf(repere) !== -1);
  return l || "";
}

console.log("\n🚦 Bump détecté : " + (vAncienne || "(inconnue)") + " → " + V + " — contrôle des sources et des docs\n");

// 🔒 NOYAU — les 3 sources de version
const sw = depuisIndex("sw.js");
const mCache = sw && /CACHE_NAME\s*=\s*"([^"]+)"/.exec(sw);
noyau(
  "sw.js > CACHE_NAME porte " + V + (mCache ? "  (lu : " + mCache[1] + ")" : ""),
  !!mCache && reV.test(mCache[1]),
  "sw.js > CACHE_NAME — sans lui le service worker ressert l'ancien cache : la mise à jour n'atteint jamais les clients."
);

const cr = depuisIndex("js/copyright.js");
const mBuild = cr && /build:\s*"([^"]+)"/.exec(cr);
noyau(
  "js/copyright.js > __MKM__.build porte " + V + (mBuild ? "  (lu : " + mBuild[1] + ")" : ""),
  !!mBuild && mBuild[1] === V,
  "js/copyright.js > build — c'est le badge de version du footer, il mentirait à l'utilisateur."
);

// DOC — README (2 emplacements)
const readme = depuisIndex("README.md");
doc(
  "README.md > bloc « 📦 Version courante » à jour",
  reV.test(ligneAvec(readme, "Version courante")),
  "README.md — remplacer le bloc « 📦 Version courante » en tête (skill release, étape 3)."
);

let journalOk = false;
if (readme) {
  const lignes = readme.split(/\r?\n/);
  // Le TITRE de section, pas la première mention (le sommaire cite aussi « Journal des versions »).
  const i = lignes.findIndex((l) => /^#{1,3}\s.*Journal des versions/.test(l));
  if (i !== -1) journalOk = reV.test(lignes.slice(i, i + 40).join("\n"));
}
doc(
  "README.md > entrée en tête du journal des versions",
  journalOk,
  "README.md — ajouter l'entrée détaillée EN TÊTE de « 📋 Journal des versions » (jamais en tête de fichier)."
);

// DOC — Audit réseau (md + html), en-tête ET historique
const auditMd = depuisIndex("docs/applications/NETWORK_AUDIT.md");
doc(
  "NETWORK_AUDIT.md > en-tête « À jour pour la version »",
  reV.test(ligneAvec(auditMd, "jour pour la version")),
  "docs/applications/NETWORK_AUDIT.md — l'en-tête doit annoncer " + V + " (item 13 du smoke le vérifie côté serveur)."
);
// Les notes par version vivent dans NETWORK_AUDIT_HISTORIQUE ; l'audit ne garde que l'état actuel.
const histMd = depuisIndex("docs/applications/NETWORK_AUDIT_HISTORIQUE.md");
doc(
  "NETWORK_AUDIT_HISTORIQUE.md > titre « ### " + V + " (…) »",
  !!histMd && new RegExp("^###\\s+" + esc(V) + "\\b", "m").test(histMd),
  "docs/applications/NETWORK_AUDIT_HISTORIQUE.md — ajouter « ### " + V + " (titre) » + la note en tête de « Notes par version »."
);

// .html GÉNÉRÉS (scripts/audit-html.js ; check-audit-html.js refuse tout écart) : ici, l'oubli de régénérer.
const auditHtml = depuisIndex("docs/applications/NETWORK_AUDIT.html");
doc(
  "NETWORK_AUDIT.html > en-tête « À jour pour la version »",
  reV.test(ligneAvec(auditHtml, "jour pour la version")),
  "docs/applications/NETWORK_AUDIT.html — régénérer depuis le .md : node scripts/audit-html.js"
);
const histHtml = depuisIndex("docs/applications/NETWORK_AUDIT_HISTORIQUE.html");
doc(
  "NETWORK_AUDIT_HISTORIQUE.html > entrée de version <h3>",
  !!histHtml && new RegExp("<h3[^>]*>\\s*" + esc(V) + "\\b").test(histHtml),
  "docs/applications/NETWORK_AUDIT_HISTORIQUE.html — régénérer depuis le .md : node scripts/audit-html.js"
);

// DOC — AI_CONTEXT sans marqueur de version (rempli à la génération) : seul contrôle, « a bougé ».
const stages = (gitOuNull(["diff", "--cached", "--name-only"]) || "").split(/\r?\n/);
doc(
  "docs/applications/AI_CONTEXT.md modifié dans ce commit",
  stages.indexOf("docs/applications/AI_CONTEXT.md") !== -1,
  "docs/applications/AI_CONTEXT.md — c'est la source de la modale 🤖 Aide IA : non mise à jour, elle nie les features livrées."
);

// ── 4. Verdict ──────
const bloquant = echecsNoyau.length > 0 || (echecsDoc.length > 0 && !motifDero);

if (!bloquant) {
  if (echecsDoc.length && motifDero) {
    console.log("\n⚠️  " + echecsDoc.length + " item(s) doc NON validés — dérogation acceptée : « " + motifDero + " »");
    console.log("   Rappel : une dérogation avec rattrapage devient une entrée de docs/BACKLOG.md, sinon elle s'évapore.");
  } else {
    console.log("\n🎉 release " + V + " : sources de version cohérentes, docs à jour");
  }
  process.exit(0);
}

console.log("\n============================================================");
console.log("🛑 COMMIT REFUSÉ — bump " + V + " incomplet");
console.log("============================================================");
if (echecsNoyau.length) {
  console.log("\n🔒 NOYAU — jamais dérogeable :");
  echecsNoyau.forEach((a) => console.log("   • " + a));
}
if (echecsDoc.length && !motifDero) {
  console.log("\n📄 DOC — dérogeable (voir ci-dessous) :");
  echecsDoc.forEach((a) => console.log("   • " + a));
  console.log("\n   Pour déroger, ajouter au message de commit une ligne :");
  console.log("       Docs-deroge: <motif · risque accepté · rattrapage>");
  console.log("   (5 caractères minimum ; elle reste dans l'historique Git)");
}
console.log("\n   Détails de la règle : CLAUDE.md § « Bump = sync docs sur 4 axes » · docs/RELEASE_GATE.md");
console.log("");
process.exit(1);
