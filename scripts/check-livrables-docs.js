#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📦 check-livrables-docs.js — garde-fou pré-commit BLOQUANT (rejoué en CI)
// =====================================================================
// Audit CD du 09/10/2026, F1 : la documentation interne (BACKLOG, audits, porte de release,
// architecture) et le README.md racine (journal de dev) partaient dans TOUT ce qui se livre — sites
// dev et prod, image Docker (donc aussi pro.myktamap.fr, construit avec ce Dockerfile), ZIP
// d'auto-hébergement des Releases. Règle unique : de docs/, seul docs/applications/ (ce que l'app
// lit) est livré, et le README.md racine ne l'est pas.
//
// Ce script vérifie que les trois listes d'exclusion du DÉPÔT portent cette règle :
//   • Dockerfile (rsync de l'étape assets) ;
//   • .github/workflows/release.yml (rsync du ZIP selfhost) ;
//   • .dockerignore (contexte envoyé au build).
// Les scripts de déploiement des sites vivent HORS dépôt : leurs motifs sont décrits dans
// docs/architecture/infra-versioning.md §85, et etat-sites.ps1 vérifie ce qui est réellement servi.
// =====================================================================

const fs = require("fs");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// rsync : l'ordre compte — l'inclusion de docs/applications/ doit précéder l'exclusion de docs/*.
const REGLES_RSYNC = [
  "--include='/docs/'",
  "--include='/docs/applications/***'",
  "--exclude='/docs/*'",
  "--exclude='/README.md'"
];
function verifierRsync(fichier) {
  const src = fs.readFileSync(fichier, "utf8");
  const positions = REGLES_RSYNC.map(r => src.indexOf(r));
  t(fichier + " : les 4 règles docs/ et README.md sont présentes", positions.every(p => p >= 0));
  t(fichier + " : dans l'ordre (inclusions avant l'exclusion de docs/*)",
    positions.every(p => p >= 0) && positions.every((p, i) => i === 0 || p > positions[i - 1]));
  // Les règles doivent précéder la copie elle-même (même commande rsync).
  const iRsync = src.indexOf("rsync -a");
  t(fichier + " : règles posées dans la commande rsync -a", iRsync >= 0 && positions[0] > iRsync);
}
verifierRsync("Dockerfile");
verifierRsync(".github/workflows/release.yml");

// .dockerignore : motifs ligne à ligne
{
  const lignes = fs.readFileSync(".dockerignore", "utf8").split(/\r?\n/).map(l => l.trim());
  const iDocs = lignes.indexOf("docs/*");
  const iApps = lignes.indexOf("!docs/applications");
  t(".dockerignore : docs/* exclu", iDocs >= 0);
  t(".dockerignore : docs/applications réintégré APRÈS docs/*", iApps > iDocs && iDocs >= 0);
  t(".dockerignore : README.md exclu", lignes.indexOf("README.md") >= 0);
}

console.log(ko === 0 ? "\n🎉 livrables : seule la doc de l'app part" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
