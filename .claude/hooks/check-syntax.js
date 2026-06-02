#!/usr/bin/env node
/**
 * check-syntax.js — Hook PostToolUse (matcher: Edit|Write)
 * ------------------------------------------------------------------
 * Filet de sécurité syntaxe : après chaque édition d'un fichier .js,
 * lance `node -c` dessus. Si la syntaxe est cassée, exit 2 renvoie
 * l'erreur à Claude pour qu'il corrige immédiatement (au lieu de
 * découvrir le bug au runtime dans le navigateur).
 *
 * Volontairement minimal : pas de linter, pas de reformatage, zéro
 * dépendance. Juste la garantie que le JS écrit est parsable.
 *
 * Entrée : JSON sur stdin, champ tool_input.file_path.
 * Doc : https://code.claude.com/docs/en/hooks-guide.md
 * ------------------------------------------------------------------
 */
"use strict";

const { execSync } = require("child_process");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let fp = "";
  try {
    fp = (JSON.parse(raw).tool_input || {}).file_path || "";
  } catch (_) {
    process.exit(0);
  }

  // On ne vérifie que les fichiers JavaScript
  if (!fp || !/\.js$/i.test(fp)) process.exit(0);

  try {
    execSync('node -c "' + fp + '"', { stdio: ["ignore", "ignore", "pipe"] });
    process.exit(0); // syntaxe OK
  } catch (e) {
    const err = (e.stderr ? e.stderr.toString() : e.message).trim();
    process.stderr.write("⚠️ [check-syntax] Erreur de syntaxe dans " + fp + " :\n" + err + "\n");
    process.exit(2); // renvoie l'erreur à Claude
  }
});
