#!/usr/bin/env node
/**
 * check-no-pro-leak.js — BLOQUANT (pre-commit et CI) : aucun fichier ni motif du dépôt privé MyKTAMap-pro
 * dans ce dépôt public. Lit les fichiers indexés (ou `KTA_FICHIERS_CI` en CI).
 *
 * Frontière « zéro FICHIER pro » (docs/architecture/community-server-line.md §1, §3, §4) : les points
 * d'extension neutres (`config.serverConnection`, états, garde, événements `mktm:*`) sont autorisés ;
 * restent interdits le code serveur (*.php, backend/), pro/, tout module JS qui parle à un backend (même
 * no-op), les fichiers propriétaires et les clés privées.
 * ⚠️ C'est surtout la règle de CHEMIN qui protège : les motifs de contenu ne connaissent que les noms d'un
 * module pro déjà écrit, un renommage leur échappe.
 *
 * Exception (rare, à justifier) : EXEMPT_FILES. Retour : 0 OK · 1 fuite, commit bloqué · 2 erreur git.
 */

"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── Motifs interdits dans le contenu ──────

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
  // Clé privée (ex. celle qui signe les licences) : n'entre JAMAIS dans ce dépôt public.
  { rx: /BEGIN (EC |RSA |ENCRYPTED )?PRIVATE KEY/g, label: "clé privée (signature des licences ?)" },
  { rx: /"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/g, label: "clé privée JWK (champ d)" },
];

// ── Chemins interdits (regex sur le chemin git-style) ──────

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
  { rx: /\.(pem|key|p8|p12|pfx)$/i,    label: "fichier de clé (jamais de clé privée ici)" },
  { rx: /(^|\/)signer-licence\.js$/,   label: "outil de signature des licences (dépôt pro interne)" },
];

// ── Exemptions du contrôle de contenu (préférer un wording neutre à un ajout ici) ──────
const EXEMPT_FILES = [
  "scripts/check-no-pro-leak.js",
  ".githooks/pre-commit",
];

function getStagedFiles() {
  // CI (scripts/ci-commits.sh) : rien n'est indexé sur GitHub — la liste vient des commits poussés.
  if (process.env.KTA_FICHIERS_CI !== undefined) {
    return process.env.KTA_FICHIERS_CI.split(/\r?\n/).map(function (s) { return s.trim(); })
      .filter(function (f) { return f && fs.existsSync(f); });
  }
  try {
    // ACMR = ce qui finit dans le commit ; -z pour les noms avec espaces/UTF-8
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
  const ext = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
          ".zip", ".kmz", ".gz", ".woff", ".woff2", ".ttf", ".otf",
          ".mp3", ".mp4", ".webm", ".bin"].includes(ext);
}

function checkFile(filePath) {
  const violations = [];

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

  if (EXEMPT_FILES.includes(filePath)) return violations;
  if (isBinaryLike(filePath)) return violations;

  let content;
  try {
    // ⚠️ Lire l'INDEX (ce qui sera commité), pas le worktree (édité peut-être après git add).
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
      const before = content.substring(0, m.index);
      const lineNum = before.split("\n").length;
      violations.push({
        kind: "CONTENT",
        file: filePath,
        line: lineNum,
        label: rule.label,
        match: m[0],
      });
      // 5 occurrences max par fichier et motif
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
