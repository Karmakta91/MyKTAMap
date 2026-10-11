#!/usr/bin/env node
// =====================================================================
// sonde-integrite.js — le code SERVI par un site est-il celui du dépôt ? (11/10/2026)
// =====================================================================
// Pourquoi : le chiffrement protège ce qui est stocké (base, sauvegardes), pas une page modifiée sur le serveur. Après
// un piratage du VPS, le vrai risque est un fichier .js ou .html changé en place : il faut le SAVOIR vite. Cette sonde
// tourne HORS du serveur (poste, GitHub Action planifiée) : elle lit /deploiement.json (commit déployé), vérifie que ce
// commit existe dans le dépôt local et descend de la branche annoncée, puis télécharge chaque fichier de code suivi par
// Git à ce commit et compare son empreinte SHA-256 au contenu du dépôt.
// Limite : on ne voit que ce que le serveur nous sert (un attaquant peut viser d'autres visiteurs).
//
//   node scripts/release/sonde-integrite.js https://myktamap.fr [--branche main] [--depot <chemin du clone>]
//   Sortie 0 = conforme ; 1 = écart (fichier modifié, commit inconnu ou hors branche) ; 2 = sonde impossible.
"use strict";
const { execFileSync } = require("child_process");
const crypto = require("crypto");

const args = process.argv.slice(2);
const opt = (nom, defaut) => { const i = args.indexOf(nom); return i >= 0 && args[i + 1] ? args[i + 1] : defaut; };
const site = String(args.find((a) => /^https?:\/\//.test(a)) || "").replace(/\/+$/, "");
const depot = opt("--depot", process.cwd());
const brancheAttendue = opt("--branche", null);
if (!site) { console.log("Usage : node scripts/release/sonde-integrite.js <https://site> [--branche b] [--depot d]"); process.exit(2); }

// Fichiers de CODE servis : ce qui s'exécute ou se charge dans la page. Hors : données, tests, outillage, doc.
const CODE = /\.(html|js|mjs|css|json|webmanifest)$/;
const HORS = /^(data|tests|scripts|docs|\.github|\.githooks|\.claude)\//;
const git = (...a) => execFileSync("git", ["-C", depot, ...a], { maxBuffer: 64 * 1024 * 1024 });
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function lire(url) {
  const r = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(20000) });
  return { s: r.status, buf: r.status === 200 ? Buffer.from(await r.arrayBuffer()) : null };
}

(async () => {
  let dep;
  try { dep = JSON.parse((await lire(site + "/deploiement.json?_=" + Date.now())).buf.toString("utf8")); }
  catch (e) { console.log("❌ " + site + "/deploiement.json illisible : " + e.message); process.exit(2); }
  const commit = String(dep.commit || "");
  const ecarts = [];
  if (!/^[0-9a-f]{40}$/.test(commit)) { console.log("❌ commit déployé invalide : " + JSON.stringify(dep)); process.exit(1); }
  try { git("cat-file", "-e", commit + "^{commit}"); }
  catch { console.log("❌ commit déployé " + commit.slice(0, 7) + " INCONNU du dépôt (git fetch fait ?)"); process.exit(1); }
  const branche = brancheAttendue || dep.branche;
  if (branche) {
    try { git("merge-base", "--is-ancestor", commit, "origin/" + branche); }
    catch { ecarts.push("commit " + commit.slice(0, 7) + " hors de origin/" + branche); }
  }

  const fichiers = git("ls-tree", "-r", "--name-only", commit).toString("utf8").split("\n")
    .filter((f) => f && CODE.test(f) && !HORS.test(f));
  let conformes = 0, nonServis = 0, i = 0;
  async function travailleur() {
    while (i < fichiers.length) {
      const f = fichiers[i++];
      let r;
      try { r = await lire(site + "/" + f.split("/").map(encodeURIComponent).join("/")); }
      catch (e) { ecarts.push(f + " : lecture impossible (" + e.message + ")"); continue; }
      if (r.s !== 200) { nonServis++; continue; }   // refusé par le serveur (doc interne, etc.) : rien d'exécuté
      if (sha(r.buf) === sha(git("show", commit + ":" + f))) conformes++;
      else ecarts.push(f + " : contenu servi ≠ dépôt");
    }
  }
  await Promise.all(Array.from({ length: 8 }, travailleur));

  console.log("[Sonde] " + site + " · commit " + commit.slice(0, 7) + " (" + (dep.branche || "?") + ", " +
    (dep.version || "?") + ") · " + conformes + " conformes, " + nonServis + " non servis, " + ecarts.length + " écart(s)");
  ecarts.sort().forEach((e) => console.log("  ❌ " + e));
  process.exit(ecarts.length ? 1 : 0);
})().catch((e) => { console.log("❌ sonde impossible : " + e.message); process.exit(2); });
