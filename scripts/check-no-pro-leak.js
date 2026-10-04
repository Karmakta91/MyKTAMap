#!/usr/bin/env node
/**
 * 🛡️ check-no-pro-leak.js — Garde-fou anti-fuite code PRO côté community
 * ====================================================================
 *
 * Lance ce script avant chaque commit côté community (MyKTAMap public)
 * pour vérifier qu'aucun fichier ou pattern appartenant au repo
 * MyKTAMap-pro (privé, propriétaire) ne s'y glisse par erreur.
 *
 * Branché en pre-commit hook via .githooks/pre-commit (cf README pour
 * l'install : `git config core.hooksPath .githooks` une fois).
 *
 * Politique (frontière révisée le 04/10/2026, cf
 * docs/architecture/community-server-line.md §1, §3 et §4) : la frontière
 * est « zéro FICHIER pro », plus « zéro trace ». Les points d'extension
 * neutres (interrupteur `config.serverConnection`, état OFF/ON/DOWN, garde,
 * événements `mktm:*`) sont autorisés ici. Restent interdits : le code
 * serveur (*.php, backend/), le dossier pro/ et tout module JS qui parle
 * à un backend, même en mode "no-op" ou "mort". C'est donc surtout la règle
 * de CHEMIN qui protège : les motifs de contenu ci-dessous ne connaissent
 * que les noms d'un module pro déjà écrit, un renommage leur échappe.
 *
 * Patterns détectés (regex appliqués aux fichiers STAGED uniquement) :
 *   - Modules pro : MyKTAMapCloudSync, MyKTAMapCloudSyncUI
 *   - Config opt-in : cloudSyncEnabled
 *   - Storage keys : mktm_pro_cloud_*, mktm_pro_user_optin_cloud
 *   - Format wire : MKTM-CLOUD-v[N]
 *   - Headers auth : X-Mock-Token, X-MKTM-Token
 *   - Endpoints backend : /v1/secours, /v1/health
 *
 * Fichiers interdits (chemin) :
 *   - *.php, où qu'il soit (aucun code serveur dans ce repo)
 *   - pro/** (dossier des modules greffés par une instance)
 *   - js/cloudSync.js, js/cloudSyncUI.js
 *   - backend/** (toute l'arbo backend Fastify+Prisma)
 *   - DRIFT.md, CHARTE.md, LICENSE_PRO.md, README_PRO.md, ROADMAP_PRO.md
 *   - Licence-pro.json (nominatif client)
 *
 * Pour bypass en urgence (NE PAS abuser) :
 *   git commit --no-verify ...
 *
 * Pour ajouter une exception (rare, ex: doc qui mentionne le pro
 * dans un commentaire pédagogique) → ajouter dans EXEMPT_FILES ci-dessous.
 *
 * Code de retour :
 *   0  : OK, aucune fuite détectée
 *   1  : Fuite détectée, commit bloqué
 *   2  : Erreur d'exécution (git introuvable, etc.)
 */

"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ============================================================
// PATTERNS INTERDITS — contenu de fichiers
// ============================================================

const FORBIDDEN_PATTERNS = [
  { rx: /MyKTAMapCloudSync(UI)?\b/g,      label: "module pro cloudSync"       },
  { rx: /\bcloudSyncEnabled\b/g,          label: "config opt-in cloud pro"    },
  { rx: /\bmktm_pro_cloud_\w+/g,          label: "storage key cloud pro"      },
  { rx: /\bmktm_pro_user_optin_cloud\b/g, label: "storage key opt-in pro"     },
  { rx: /\bMKTM-CLOUD-v\d+/g,             label: "format wire protocole pro"  },
  { rx: /\bX-Mock-Token\b/g,              label: "header auth mock pro"       },
  { rx: /\bX-MKTM-Token\b/g,              label: "header auth jwt pro"        },
  { rx: /\/v1\/secours\b/g,               label: "endpoint backend pro"       },
  { rx: /\/v1\/health\b/g,                label: "endpoint backend pro"       },
];

// ============================================================
// FICHIERS INTERDITS — chemin (regex sur le chemin git-style)
// ============================================================

const FORBIDDEN_FILES = [
  { rx: /\.php$/i,                     label: "code serveur PHP (aucun code serveur ici)" },
  { rx: /^pro\//,                      label: "module greffé pro" },
  { rx: /^js\/cloudSync(UI)?\.js$/,    label: "module pro" },
  { rx: /^backend\//,                  label: "code backend Fastify/Prisma pro" },
  { rx: /^DRIFT\.md$/,                 label: "doc pro" },
  { rx: /^CHARTE\.md$/,                label: "doc gouvernance pro" },
  { rx: /^LICENSE_PRO\.md$/,           label: "licence commerciale pro" },
  { rx: /^README_PRO\.md$/,            label: "README pro" },
  { rx: /^ROADMAP_PRO\.md$/,           label: "roadmap pro privée" },
  { rx: /^Licence-pro\.json$/,         label: "licence client nominative" },
];

// ============================================================
// EXEMPTIONS — fichiers où les patterns sont autorisés
// (ex: ce script lui-même qui contient les patterns en regex)
// ============================================================

const EXEMPT_FILES = [
  "scripts/check-no-pro-leak.js",
  ".githooks/pre-commit",
  // Si un commentaire pédagogique dans la doc community parle du pro,
  // ajouter le fichier ici. Mais à éviter : préférer un wording neutre.
];

// ============================================================
// MAIN
// ============================================================

function getStagedFiles() {
  try {
    // --diff-filter=ACMR = Added, Copied, Modified, Renamed
    //   (= les fichiers qui vont vraiment finir dans le commit)
    // -z = null-separated pour gérer les noms avec espaces/UTF-8
    const out = execSync("git diff --cached --name-only --diff-filter=ACMR -z", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return out.split("\0").filter(Boolean);
  } catch (e) {
    console.error("❌ Erreur git diff --cached :", e.message);
    process.exit(2);
  }
}

function isBinaryLike(filePath) {
  // Skip les binaires (images, archives, fonts...) — pas de patterns texte dedans
  const ext = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
          ".zip", ".kmz", ".gz", ".woff", ".woff2", ".ttf", ".otf",
          ".mp3", ".mp4", ".webm", ".bin"].includes(ext);
}

function checkFile(filePath) {
  const violations = [];

  // 1. Chemin interdit ?
  for (const rule of FORBIDDEN_FILES) {
    if (rule.rx.test(filePath)) {
      violations.push({
        kind: "PATH",
        file: filePath,
        line: 0,
        label: rule.label,
        match: filePath,
      });
    }
  }

  // 2. Exempt du content-check ?
  if (EXEMPT_FILES.includes(filePath)) return violations;
  if (isBinaryLike(filePath)) return violations;

  // 3. Contenu interdit ?
  let content;
  try {
    // On lit depuis l'INDEX git (= ce qui va être commité), pas le worktree
    // (= ce qui peut être différent si l'user a édité APRÈS git add).
    content = execSync(`git show :"${filePath}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (e) {
    // Fichier nouveau ou path tordu : fallback sur le worktree
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (e2) {
      return violations; // skip silencieux si illisible
    }
  }

  const lines = content.split("\n");
  for (const rule of FORBIDDEN_PATTERNS) {
    rule.rx.lastIndex = 0; // reset state du regex global
    let m;
    while ((m = rule.rx.exec(content)) !== null) {
      // Calcule le numéro de ligne du match
      const before = content.substring(0, m.index);
      const lineNum = before.split("\n").length;
      violations.push({
        kind: "CONTENT",
        file: filePath,
        line: lineNum,
        label: rule.label,
        match: m[0],
      });
      // Limite à 5 matches par fichier+pattern pour éviter le spam
      if (violations.filter(v => v.file === filePath && v.label === rule.label).length >= 5) {
        break;
      }
    }
  }

  return violations;
}

function main() {
  const staged = getStagedFiles();
  if (staged.length === 0) {
    // Pas de fichier staged → rien à checker (commit vide, --amend sans changes, etc.)
    process.exit(0);
  }

  const allViolations = [];
  for (const f of staged) {
    allViolations.push(...checkFile(f));
  }

  if (allViolations.length === 0) {
    console.log("✅ [check-no-pro-leak] " + staged.length + " fichier(s) staged, aucune fuite pro détectée.");
    process.exit(0);
  }

  // Format de l'erreur pour être MAX lisible en console pre-commit
  console.error("");
  console.error("╔══════════════════════════════════════════════════════════════════════╗");
  console.error("║  🛡️  COMMIT BLOQUÉ — code PRO détecté dans le repo community         ║");
  console.error("╚══════════════════════════════════════════════════════════════════════╝");
  console.error("");
  console.error("Les éléments suivants n'ont PAS leur place dans MyKTAMap (community) :");
  console.error("");

  for (const v of allViolations) {
    const where = v.line > 0 ? (v.file + ":" + v.line) : v.file;
    const tag = v.kind === "PATH" ? "📂 FICHIER" : "🔍 PATTERN";
    console.error("  ❌ " + tag + "  " + where);
    console.error("       → " + v.label + "  («" + v.match + "»)");
  }

  console.error("");
  console.error("Politique : aucun fichier pro — code serveur (*.php, backend/), modules");
  console.error("greffés (pro/), JS qui parle à un backend, fichiers propriétaires");
  console.error("(CHARTE / DRIFT / LICENSE_PRO / Licence-pro.json) — dans le repo public.");
  console.error("Les points d'extension NEUTRES sont autorisés (community-server-line.md §3).");
  console.error("");
  console.error("Actions possibles :");
  console.error("  1. git restore --staged <fichier>      (annule le staging)");
  console.error("  2. déplacer le fichier dans le repo MyKTAMap-pro (privé)");
  console.error("  3. bypass en urgence : git commit --no-verify  (déconseillé)");
  console.error("");
  console.error("Pour ajouter une exception légitime : éditer EXEMPT_FILES dans");
  console.error("scripts/check-no-pro-leak.js (rare, à justifier en commit message).");
  console.error("");
  process.exit(1);
}

main();
