#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🚦 check-release-docs.js — garde-fou commit-msg BLOQUANT
// =====================================================================
// LE PROBLÈME : la règle des 4 axes de CLAUDE.md (« un bump = les docs
// suivent ») n'était vérifiée par RIEN. Constaté : AI_CONTEXT.md n'avait
// jamais reçu les nouveautés v1.73.0 — pendant une version entière, la
// modale 🤖 Aide IA répondait « ça n'existe pas » sur deux features
// livrées. Et personne ne vérifiait non plus que les 3 sources de version
// disent la MÊME chose : un CACHE_NAME oublié = le service worker ressert
// l'ancien cache, donc la mise à jour n'atteint JAMAIS les clients.
//
// DÉCLENCHEUR : le bump lui-même, pas le message de commit. On compare la
// clé `version` de version.json entre HEAD et l'INDEX. Un commit qui ne
// bumpe pas sort en silence (zéro impact sur le quotidien). Se fier au
// préfixe `release(...)` du message serait plus faible : le commit
// 2751ff5 s'appelait `fix(v1.73.1-dev)`.
//
// DEUX NIVEAUX, comme le RELEASE_GATE :
//   🔒 NOYAU (jamais dérogeable) — les 3 sources de version concordent.
//      Un échec ici = l'app ne se met pas à jour chez l'utilisateur.
//   📄 DOC (dérogeable) — README, Audit réseau et AI_CONTEXT portent la
//      nouvelle version / ont bougé. Le hotfix « bump de cache seul »
//      (type v1.75.1) est le cas légitime de dérogation.
//
// DÉROGER : ajouter au message de commit une ligne
//      Docs-deroge: <motif · risque accepté · rattrapage>
// Elle reste dans l'historique Git — une dérogation ne s'évapore pas.
//
// LIMITES ASSUMÉES :
//   - `git commit --amend` sur un commit de release déjà bumpé ne
//     redéclenche pas le contrôle (HEAD porte déjà la nouvelle version).
//     Le commit d'origine, lui, est passé par la porte.
//   - Ce script lit le REPO, pas le serveur : il ne remplace pas l'item 13
//     du smoke (marche 2 du gate), qui attrape les uploads FTP partiels.
// =====================================================================

const { execFileSync } = require("child_process");

const msgPath = process.argv[2];
if (!msgPath) {
  console.error("❌ [check-release-docs] chemin du message de commit manquant (argument 1)");
  process.exit(2);
}

const fs = require("fs");

// --- utilitaires ------------------------------------------------------
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function gitOuNull(args) {
  try { return git(args); } catch (e) { return null; }
}
// Contenu tel qu'il sera COMMITÉ (index), pas tel qu'il est sur le disque.
const depuisIndex = (p) => gitOuNull(["show", ":" + p]);

// --- 1. Détection du bump --------------------------------------------
const brutIndex = depuisIndex("version.json");
if (brutIndex === null) process.exit(0); // version.json absent du dépôt : rien à contrôler

let vNouvelle;
try {
  vNouvelle = JSON.parse(brutIndex).version;
} catch (e) {
  // JSON illisible = merge en conflit le plus souvent. Ce n'est pas à ce
  // garde-fou de trancher un conflit — il a ses propres filets.
  console.log("ℹ️  [release-docs] version.json illisible dans l'index — contrôle passé.");
  process.exit(0);
}

let vAncienne = null;
const brutHead = gitOuNull(["show", "HEAD:version.json"]);
if (brutHead !== null) {
  try { vAncienne = JSON.parse(brutHead).version; } catch (e) { vAncienne = null; }
}

if (!vNouvelle || vNouvelle === vAncienne) process.exit(0); // pas un bump → silence total

// --- 2. Dérogation déclarée dans le message ---------------------------
// Les lignes commentées sont retirées AVANT la recherche : une dérogation
// écrite dans une zone `#` disparaîtrait du commit final, donc elle ne
// compte pas comme trace.
let message = "";
try { message = fs.readFileSync(msgPath, "utf8"); } catch (e) { message = ""; }
const messageUtile = message.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n");
const mDero = /^\s*Docs-d[ée]roge\s*:\s*(.+?)\s*$/im.exec(messageUtile);
const motifDero = mDero && mDero[1].length >= 5 ? mDero[1] : null;

// --- 3. Les contrôles -------------------------------------------------
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

// 📄 DOC — README (2 emplacements)
const readme = depuisIndex("README.md");
doc(
  "README.md > bloc « 📦 Version courante » à jour",
  reV.test(ligneAvec(readme, "Version courante")),
  "README.md — remplacer le bloc « 📦 Version courante » en tête (skill release, étape 3)."
);

let journalOk = false;
if (readme) {
  const lignes = readme.split(/\r?\n/);
  // Le TITRE de section, pas la première mention : le sommaire et le résumé
  // de tête citent tous les deux « Journal des versions » (lignes 41 et 53),
  // et viser l'un d'eux ferait échouer un README pourtant correct.
  const i = lignes.findIndex((l) => /^#{1,3}\s.*Journal des versions/.test(l));
  if (i !== -1) journalOk = reV.test(lignes.slice(i, i + 40).join("\n"));
}
doc(
  "README.md > entrée en tête du journal des versions",
  journalOk,
  "README.md — ajouter l'entrée détaillée EN TÊTE de « 📋 Journal des versions » (jamais en tête de fichier)."
);

// 📄 DOC — Audit réseau (md + html), en-tête ET historique
const auditMd = depuisIndex("docs/applications/NETWORK_AUDIT.md");
doc(
  "NETWORK_AUDIT.md > en-tête « À jour pour la version »",
  reV.test(ligneAvec(auditMd, "jour pour la version")),
  "docs/applications/NETWORK_AUDIT.md — l'en-tête doit annoncer " + V + " (item 13 du smoke le vérifie côté serveur)."
);
// Depuis le 07/10/2026, les notes par version vivent dans une page à part (NETWORK_AUDIT_HISTORIQUE) : l'audit
// lui-même ne garde que l'état actuel et son en-tête « À jour pour la version ».
const histMd = depuisIndex("docs/applications/NETWORK_AUDIT_HISTORIQUE.md");
doc(
  "NETWORK_AUDIT_HISTORIQUE.md > titre « ### " + V + " (…) »",
  !!histMd && new RegExp("^###\\s+" + esc(V) + "\\b", "m").test(histMd),
  "docs/applications/NETWORK_AUDIT_HISTORIQUE.md — ajouter « ### " + V + " (titre) » + la note en tête de « Notes par version »."
);

// Les .html sont GÉNÉRÉS depuis les .md (scripts/audit-html.js) et check-audit-html.js (pre-commit) refuse tout
// écart : les deux contrôles ci-dessous n'attrapent que l'oubli de régénérer, avec un message propre au bump.
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

// 📄 DOC — AI_CONTEXT n'a pas de marqueur de version ({{BUILD}} est rempli
// à la génération) : le seul contrôle possible est « a bougé dans ce commit ».
const stages = (gitOuNull(["diff", "--cached", "--name-only"]) || "").split(/\r?\n/);
doc(
  "docs/applications/AI_CONTEXT.md modifié dans ce commit",
  stages.indexOf("docs/applications/AI_CONTEXT.md") !== -1,
  "docs/applications/AI_CONTEXT.md — c'est la source de la modale 🤖 Aide IA : non mise à jour, elle nie les features livrées."
);

// --- 4. Verdict -------------------------------------------------------
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
