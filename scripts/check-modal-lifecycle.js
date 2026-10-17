#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-modal-lifecycle.js — linter pré-commit CONSULTATIF
// =====================================================================
// Dans les modules `MIGRATED_MODULES` (cycle de vie unifié `ModalLifecycle`),
// timers, écouteurs et blob URLs passent par `lc.setTimeout` / `lc.on` /
// `lc.createObjectURL` : un natif fuit, close() ne le nettoie pas.
// Consultatif : avertit sans bloquer (faux positifs possibles : scope hors
// modale, helper local). Exemption par ligne : marqueur de TOLERANCE_MARKERS.
// Un module dont la migration est complète s'ajoute à MIGRATED_MODULES.
// Doc : docs/architecture/modal-lifecycle.md.
// =====================================================================

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const MIGRATED_MODULES = [
  "js/memInspector.js",
  "js/swInspector.js",
  // Migration partielle (helper attaché, écouteurs pas tous migrés) : non
  // listés pour éviter le bruit — lostMode, secoursMode, osmView, interfaceItineraire.
];

const NATIVE_PATTERNS = [
  { re: /(?<!_lc\.|_lc &&\s*|lc\.|window\.)\bsetTimeout\s*\(/g,        label: "setTimeout natif (utiliser lc.setTimeout)" },
  { re: /(?<!_lc\.|_lc &&\s*|lc\.|window\.)\bsetInterval\s*\(/g,       label: "setInterval natif (utiliser lc.setInterval)" },
  { re: /\.addEventListener\s*\(/g,                                     label: "addEventListener (utiliser lc.on ou lc.delegate)" },
  { re: /URL\.createObjectURL\s*\(/g,                                   label: "URL.createObjectURL (utiliser lc.createObjectURL)" },
];

// Marqueurs d'exemption par ligne (natif voulu : hors modale, download…).
const TOLERANCE_MARKERS = [
  "// lint-ok-modal-lifecycle",   // exemption explicite par l'auteur
  "/* lint-ok-modal-lifecycle */",
];

function getRepoRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch(e) {
    return process.cwd();
  }
}

function scanFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const findings = [];

  lines.forEach(function(line, idx) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (TOLERANCE_MARKERS.some(function(m) { return line.includes(m); })) return;

    NATIVE_PATTERNS.forEach(function(pat) {
      pat.re.lastIndex = 0;
      if (pat.re.test(line)) {
        findings.push({
          file: filePath,
          line: idx + 1,
          label: pat.label,
          snippet: line.trim().slice(0, 100)
        });
      }
    });
  });

  return findings;
}

function main() {
  const root = getRepoRoot();
  const allFindings = [];

  MIGRATED_MODULES.forEach(function(rel) {
    const abs = path.join(root, rel);
    const fileFindings = scanFile(abs);
    allFindings.push.apply(allFindings, fileFindings);
  });

  if (allFindings.length === 0) {
    process.exit(0);   // silencieux quand tout va bien
  }

  console.log("\n⚠️  [check-modal-lifecycle] " + allFindings.length + " usage(s) natif(s) détecté(s) dans les modales migrées :\n");
  allFindings.forEach(function(f) {
    console.log("   " + path.relative(root, f.file) + ":" + f.line + " — " + f.label);
    console.log("     │ " + f.snippet);
  });
  console.log("\n💡 Préférer les équivalents tracked sur lc.* (cf docs/architecture/modal-lifecycle.md).");
  console.log("   Si le natif est VOULU (scope hors modale, helper local…), ajouter // lint-ok-modal-lifecycle en bout de ligne.\n");

  process.exit(0);   // consultatif : n'échoue pas le commit
}

main();
