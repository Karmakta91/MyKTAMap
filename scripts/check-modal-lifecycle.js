#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🧰 check-modal-lifecycle.js — pré-commit advisory linter
// =====================================================================
// Sprint v1.44.0 — Sur les modules `MIGRATED_MODULES` (qui ont opt-in
// au cycle de vie unifié `ModalLifecycle`), on VEUT que les opérations
// soient routées via `lc.setTimeout` / `lc.on` / `lc.createObjectURL`
// et non via les natifs. Sinon = leak résiduel non-géré par close().
//
// Politique : ⚠️ ADVISORY (avertit mais ne bloque pas) — chaque WARN
// peut être un faux positif (ex: scope hors modale, helper local…).
// L'auteur du commit décide. Le hook pre-commit affiche les WARN puis
// continue. Pour rendre bloquant : `process.exit(1)` au lieu de `0`.
//
// Pour étendre : ajouter le file dans MIGRATED_MODULES quand tu finis
// une migration v1.44.x.
// =====================================================================

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Fichiers JS de modale qui ont opt-in à ModalLifecycle.
// Les natifs setTimeout/addEventListener/createObjectURL dans ces fichiers
// déclenchent un WARN (à éviter, préférer lc.*).
const MIGRATED_MODULES = [
  "js/memInspector.js",       // ✅ v1.44.0 — migration complète (timers, listeners, delegation crash handlers)
  "js/swInspector.js",        // ✅ v1.44.0 — migration complète (timers, listeners, lockButton, guard)
  // Migration partielle (close + setTimeout du bouton copy) — listeners pas
  // encore tous migrés. À promouvoir dans la liste quand la migration complète
  // sera faite (v1.44.x). En attendant, le linter ne flag pas pour éviter le
  // bruit (mais le helper EST attaché et le _lc.close() au fermer fonctionne).
  // "js/lostMode.js",
  // "js/secoursMode.js",     // v1.43.26-27 OK (pattern A/D appliqué, migration full ModalLifecycle pas critique)
  // "js/osmView.js",
  // "js/interfaceItineraire.js",
  // ...
];

// Patterns natifs à signaler (regex + label).
const NATIVE_PATTERNS = [
  { re: /(?<!_lc\.|_lc &&\s*|lc\.|window\.)\bsetTimeout\s*\(/g,        label: "setTimeout natif (utiliser lc.setTimeout)" },
  { re: /(?<!_lc\.|_lc &&\s*|lc\.|window\.)\bsetInterval\s*\(/g,       label: "setInterval natif (utiliser lc.setInterval)" },
  { re: /\.addEventListener\s*\(/g,                                     label: "addEventListener (utiliser lc.on ou lc.delegate)" },
  { re: /URL\.createObjectURL\s*\(/g,                                   label: "URL.createObjectURL (utiliser lc.createObjectURL)" },
];

// Lignes de tolérance : si la ligne contient un de ces marqueurs, on skip
// (ex: code volontairement hors modale, helper local, blob URL pour download).
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
    // Skip si commentaire pur (commence par // ou *)
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    // Skip si marqueur de tolérance
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
    // Silencieux quand tout va bien — pas de bruit pour les commits propres.
    process.exit(0);
  }

  console.log("\n⚠️  [check-modal-lifecycle] " + allFindings.length + " usage(s) natif(s) détecté(s) dans les modales migrées :\n");
  allFindings.forEach(function(f) {
    console.log("   " + path.relative(root, f.file) + ":" + f.line + " — " + f.label);
    console.log("     │ " + f.snippet);
  });
  console.log("\n💡 Préférer les équivalents tracked sur lc.* (cf docs/architecture/modal-lifecycle.md).");
  console.log("   Si le natif est VOULU (scope hors modale, helper local…), ajouter // lint-ok-modal-lifecycle en bout de ligne.\n");

  // Advisory : on n'échoue PAS le commit. Pour bloquer : exit(1).
  process.exit(0);
}

main();
