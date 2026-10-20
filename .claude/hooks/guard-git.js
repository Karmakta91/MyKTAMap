#!/usr/bin/env node
/**
 * guard-git.js — Hook PreToolUse (matcher: Bash)
 * ------------------------------------------------------------------
 * Bloque EN DUR les commandes git destructrices ou interdites par le
 * process MyKTAMap. Un merge sur main part en ligne tout seul (déploiement
 * automatique, CI verte) et seul KARMA merge : Claude ne pousse jamais main
 * ni de tag, ne réécrit jamais l'historique distant, ne fait jamais de
 * reset --hard (perte de travail non commité) ni de staging global.
 *
 * S'applique à TOUT dépôt touché depuis une session ouverte ici : les hooks
 * d'un dépôt frère ne tournent que dans une session ouverte dans ce dépôt-là
 * (décision KARMA du 12/10/2026 : union des règles, pas d'exception par dépôt).
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

  // 2) Staging global : KARMA travaille en parallèle dans le même arbre (et data/index.json est suivi).
  //    Stager par chemins explicites.
  //    Testé commande par commande (découpe sur && ; |), pour ne pas lire le texte d'un message ou d'un echo.
  const commandes = norm.split(/&&|\|\||;|\|/).map((s) => s.trim());
  const GIT = "^git(\\s+-c\\s+\\S+)*\\s+";
  const stagingGlobal = commandes.some((s) =>
    new RegExp(GIT + "add\\b.*(\\s-a\\b|\\s--all\\b|\\s-u\\b|\\s--update\\b|\\s\\.$|\\s\\.\\s)").test(s) ||
    new RegExp(GIT + "commit\\b.*(\\s-a[a-z]*\\b|\\s--all\\b)").test(s));
  if (stagingGlobal) {
    block("Staging global interdit (git add -A / --all / -u / . , git commit -a) : KARMA travaille dans le même " +
          "arbre. Stage par chemins explicites, puis vérifie git status.");
  }

  // Les règles suivantes ne concernent que les push
  if (/\bgit\b.*\bpush\b/.test(norm)) {
    // 3) push --force / --force-with-lease : réécriture d'historique distant
    if (/(--force-with-lease\b|--force\b|\s-f\b)/.test(norm)) {
      block("git push --force interdit (réécriture de l'historique distant). Si c'est vraiment nécessaire, fais-le toi-même.");
    }

    // 4) tags : pousser un tag = publier une version (release, export client)
    if (/--tags\b|--follow-tags\b|\brefs\/tags\/|\s(v|pro-v)\d+\.\d+/.test(norm)) {
      block("Pousser des tags = publier une version : c'est KARMA qui le fait (merge-main).");
    }

    // 5) site-public / site-interne (dépôt doc) : branches publiées, écrites par la CI seule
    if (/\bsite-(public|interne)\b/.test(norm)) {
      block("Les branches 'site-public' et 'site-interne' ne sont écrites que par la CI : jamais de push à la main.");
    }

    // 6) push vers main, dans TOUT dépôt : un merge sur main part en ligne tout seul
    // Seuls les ARGUMENTS d'une commande git push comptent (12/10/2026 : « git add js/main.js && git push … » était
    // bloqué à tort). « main » = une branche : mot entier, éventuellement après « : » ou « refs/heads/ ».
    const pushs = norm.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter((s) => /^git(\s+-c\s+\S+)*\s+push\b/.test(s));
    const mentionneMain = pushs.some((s) => /(^|[\s:+])(refs\/heads\/)?main(?=\s|$|:)/.test(s.replace(/^git(\s+-c\s+\S+)*\s+push/, "")));
    // push "nu" : pas de refspec explicite (ex. "git push" ou "git push origin")
    const aRefspecExplicite = /\bgit\s+push\s+\S+\s+\S+/.test(norm);
    const nuSurMain = !aRefspecExplicite && currentBranch() === "main";
    if (mentionneMain || nuSurMain) {
      block(
        "Push vers 'main' interdit (tous dépôts) : main part en ligne automatiquement et seul KARMA merge " +
        "(merge-main). Travaille sur Karma_dev et laisse KARMA merger."
      );
    }
  }

  process.exit(0);
});
