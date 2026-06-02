#!/usr/bin/env node
/**
 * guard-git.js — Hook PreToolUse (matcher: Bash)
 * ------------------------------------------------------------------
 * Bloque EN DUR les commandes git destructrices ou interdites par le
 * process MyKTAMap. Le déploiement prod est 100 % manuel (FTP par KARMA) :
 * Claude ne pousse jamais sur main, ne réécrit jamais l'historique distant,
 * et ne fait jamais de reset --hard (perte de travail non commité).
 *
 * Mécanisme : exit 2 = l'appel d'outil est BLOQUÉ et le message stderr est
 * renvoyé à Claude (qui voit pourquoi et s'adapte). exit 0 = on laisse passer
 * (le flux de permission normal s'applique ensuite, ex. le "ask" sur push).
 *
 * Entrée : JSON sur stdin, champ tool_input.command (cf. doc hooks).
 * Doc : https://code.claude.com/docs/en/hooks-guide.md
 * ------------------------------------------------------------------
 */
"use strict";

const { execSync } = require("child_process");

function currentBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch (_) {
    return "";
  }
}

// Détecte si le repo CWD est bien le community public MyKTAMap.
// On lit l'URL de l'origin et on rejette tout suffixe `-pro` (ou autre fork).
// Utilité : quand Claude est ancré côté community mais qu'on opère ponctuellement
// dans le repo pro depuis le même process (ex: `cd ../MyKTAMap-pro && git push origin main`),
// on évite que la règle "push main interdit" community bloque le pro — qui a
// son propre hook local pour ses propres règles.
// Safe-by-default : en cas d'erreur (origin absent, etc.) on considère community.
function originIsCommunity() {
  try {
    const url = execSync("git config --get remote.origin.url", { encoding: "utf8" })
      .trim()
      .toLowerCase();
    // Match l'URL community SANS suffixe -pro :
    //   ✓ https://github.com/Karmakta91/MyKTAMap.git
    //   ✓ git@github.com:Karmakta91/MyKTAMap
    //   ✗ https://github.com/Karmakta91/MyKTAMap-pro.git  (suffixe -pro → pas community)
    return /myktamap(\.git)?$/.test(url);
  } catch (_) {
    return true; // safe-by-default : on suppose community
  }
}

function block(message) {
  process.stderr.write("⛔ [guard-git] " + message + "\n");
  process.exit(2);
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = (JSON.parse(raw).tool_input || {}).command || "";
  } catch (_) {
    process.exit(0); // entrée illisible : on ne bloque pas
  }

  // Normalisation : minuscule + espaces compactés pour des regex fiables
  const norm = cmd.toLowerCase().replace(/\s+/g, " ").trim();

  // 0) Branche Chig_Dev (collaborateur Chig) : INTOUCHABLE en écriture.
  //    Lecture seule autorisée (log/diff/show) ; toute mutation est bloquée.
  if (/\bchig_dev\b/.test(norm)) {
    const mutation =
      /\bgit\s+(checkout|switch|merge|rebase|cherry-pick|revert|reset|restore|push|pull|am|worktree\s+add)\b/.test(norm) ||
      /\bgit\s+branch\b.*(-d\b|-D\b|--delete\b|-m\b|-M\b|--move\b|-f\b|--force\b)/.test(norm) ||
      /\bgit\s+stash\b.*\b(pop|apply|branch)\b/.test(norm);
    if (mutation) {
      block(
        "Branche 'Chig_Dev' INTOUCHABLE (branche du collaborateur Chig). " +
        "Aucune opération git mutante dessus (checkout/switch/merge/rebase/push/branch -d/reset...). " +
        "La lecture seule (log/diff/show) reste autorisée."
      );
    }
  }

  // 1) reset --hard : perte de travail silencieuse
  if (/\bgit\s+reset\s+--hard\b/.test(norm)) {
    block("git reset --hard interdit (perte de travail non commité). Utilise un reset doux (--soft/--mixed) ou git stash.");
  }

  // Les règles suivantes ne concernent que les push
  if (/\bgit\s+push\b/.test(norm)) {
    // 2) push --force / --force-with-lease : réécriture d'historique distant
    if (/(--force-with-lease\b|--force\b|\s-f\b)/.test(norm)) {
      block("git push --force interdit (réécriture de l'historique distant). Si c'est vraiment nécessaire, fais-le toi-même.");
    }

    // 3) push vers main : déploiement = manuel, jamais par Claude
    const mentionneMain = /\bmain\b/.test(norm);
    // push "nu" : pas de refspec explicite (ex. "git push" ou "git push origin")
    const aRefspecExplicite = /\bgit\s+push\s+\S+\s+\S+/.test(norm);
    const nuSurMain = !aRefspecExplicite && currentBranch() === "main";

    if (mentionneMain || nuSurMain) {
      // Le bloc push main ne s'applique QU'AU community : c'est lui qui est
      // déployé en FTP manuel par KARMA. Les autres repos (notamment
      // MyKTAMap-pro) ont leurs propres règles via leur propre guard-git.
      if (originIsCommunity()) {
        block(
          "Push vers 'main' interdit sur le repo community. Le déploiement prod est manuel (FTP par KARMA). " +
          "Travaille sur une branche dédiée et laisse KARMA merger/déployer."
        );
      }
      // Sinon (repo pro / fork) : on laisse passer. Si on est ancré dans pro,
      // son propre hook .claude/hooks/guard-git.js prend le relais.
    }
  }

  process.exit(0);
});
