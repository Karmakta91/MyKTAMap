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
// 🔒 Même audit : data/ n'entre dans l'image que par liste blanche (relevé fictif + ZIP d'exemple), et son
// index vient de docker/index-fictif.json — jamais du data/index.json local (réel, en skip-worktree).
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
  // 🔒 data/ (audit CD du 09/10/2026) : une image construite sur le poste embarquait les relevés RÉELS.
  const iData = lignes.indexOf("data/*");
  t(".dockerignore : data/* exclu (relevés réels du poste)", iData >= 0);
  t(".dockerignore : seuls data/test et data/myktamap.zip réintégrés, APRÈS data/*",
    lignes.indexOf("!data/test") > iData && lignes.indexOf("!data/myktamap.zip") > iData && iData >= 0);
  t(".dockerignore : data/index.json JAMAIS réintégré (index réel en skip-worktree sur le poste)",
    !lignes.some(l => /^!\/?data\/(index\.json|\*|$)/.test(l) || l === "!data"));
}

// L'index de l'image = docker/index-fictif.json, identique à l'index fictif SUIVI (lu dans l'index Git :
// `git show :data/index.json` ignore la copie locale, réelle et en skip-worktree).
{
  const { execSync } = require("child_process");
  t("Dockerfile : l'index de l'image vient de docker/index-fictif.json",
    /cp \/src\/docker\/index-fictif\.json \/www\/data\/index\.json/.test(fs.readFileSync("Dockerfile", "utf8")));
  let suivi = null, copie = null;
  try { suivi = execSync("git show :data/index.json", { encoding: "utf8" }); } catch { /* hors dépôt */ }
  try { copie = fs.readFileSync("docker/index-fictif.json", "utf8"); } catch { /* absent */ }
  const norm = (s) => (s || "").replace(/\r\n/g, "\n").trim();
  t("docker/index-fictif.json identique au data/index.json suivi par Git",
    suivi !== null && copie !== null && norm(suivi) === norm(copie));
}

console.log(ko === 0 ? "\n🎉 livrables : seule la doc de l'app part" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
