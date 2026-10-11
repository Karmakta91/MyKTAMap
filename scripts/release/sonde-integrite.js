#!/usr/bin/env node
// =====================================================================
// sonde-integrite.js — le code SERVI par un site est-il celui du dépôt ? (11/10/2026)
// =====================================================================
// Pourquoi : le chiffrement protège ce qui est stocké (base, sauvegardes), pas une page modifiée sur le serveur. Après
// un piratage du VPS, le vrai risque est un fichier .js ou .html changé en place : il faut le SAVOIR vite. Cette sonde
// tourne HORS du serveur (poste, GitHub Action planifiée) : elle lit le repère de déploiement du site (commit
// déployé), vérifie que ce commit existe dans le dépôt local et descend de la branche annoncée, puis télécharge chaque
// fichier de code suivi par Git à ce commit et compare son empreinte SHA-256 au contenu du dépôt.
// Limite : on ne voit que ce que le serveur nous sert (un attaquant peut viser d'autres visiteurs).
//
//   node scripts/release/sonde-integrite.js https://myktamap.fr [--branche main] [--depot <chemin du clone>]
//   Sortie 0 = conforme ; 1 = écart (fichier modifié, commit inconnu ou hors branche) ; 2 = sonde impossible.
// Réutilisable (module) : sonder(site, { marqueur, sources }) — un site qui sert, sous un préfixe, des fichiers venus
// d'un AUTRE dépôt déclare une source de plus { depot, champCommit, champBranche, prefixeServi, prefixeDepot }.
"use strict";
const { execFileSync } = require("child_process");
const crypto = require("crypto");

// Fichiers de CODE servis : ce qui s'exécute ou se charge dans la page. Hors : données, tests, outillage, doc.
const CODE = /\.(html|js|mjs|css|json|webmanifest)$/;
const HORS = /^(data|tests|scripts|docs|\.github|\.githooks|\.claude)\//;
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function lire(url) {
  const r = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(20000) });
  return { s: r.status, buf: r.status === 200 ? Buffer.from(await r.arrayBuffer()) : null };
}

// sources : [{ depot, champCommit = "commit", champBranche = "branche", branche?, prefixeServi = "",
//             prefixeDepot = "", hors = HORS }]. Rend { lignes, ecarts } (ecarts vide = conforme).
async function sonder(site, { marqueur = "deploiement.json", sources }) {
  site = String(site).replace(/\/+$/, "");
  let dep;
  try { dep = JSON.parse((await lire(site + "/" + marqueur + "?_=" + Date.now())).buf.toString("utf8")); }
  catch (e) { throw new Error(site + "/" + marqueur + " illisible : " + e.message); }
  const ecarts = [], lignes = [];
  for (const src of sources) {
    const git = (...a) => execFileSync("git", ["-C", src.depot, ...a], { maxBuffer: 64 * 1024 * 1024 });
    const commit = String(dep[src.champCommit || "commit"] || "");
    const branche = src.branche || dep[src.champBranche || "branche"];
    const nom = (src.prefixeServi || "/") + " ← " + commit.slice(0, 7) + " (" + (branche || "?") + ")";
    if (!/^[0-9a-f]{40}$/.test(commit)) { ecarts.push(nom + " : commit déployé invalide"); continue; }
    try { git("cat-file", "-e", commit + "^{commit}"); }
    catch { ecarts.push(nom + " : commit INCONNU du dépôt " + src.depot + " (git fetch fait ?)"); continue; }
    if (branche) {
      try { git("merge-base", "--is-ancestor", commit, "origin/" + branche); }
      catch { ecarts.push(nom + " : commit hors de origin/" + branche); }
    }
    const pd = src.prefixeDepot || "", ps = src.prefixeServi || "", hors = src.hors || HORS;
    const fichiers = git("ls-tree", "-r", "--name-only", commit).toString("utf8").split("\n")
      .filter((f) => f && f.startsWith(pd) && CODE.test(f) && !hors.test(f.slice(pd.length)));
    let conformes = 0, nonServis = 0, i = 0;
    const travailleur = async () => {
      while (i < fichiers.length) {
        const f = fichiers[i++];
        const servi = ps + f.slice(pd.length);
        let r;
        try { r = await lire(site + "/" + servi.split("/").map(encodeURIComponent).join("/")); }
        catch (e) { ecarts.push(servi + " : lecture impossible (" + e.message + ")"); continue; }
        if (r.s !== 200) { nonServis++; continue; }   // refusé par le serveur (doc interne, etc.) : rien d'exécuté
        if (sha(r.buf) === sha(git("show", commit + ":" + f))) conformes++;
        else ecarts.push(servi + " : contenu servi ≠ dépôt");
      }
    };
    await Promise.all(Array.from({ length: 8 }, travailleur));
    lignes.push(nom + " · " + conformes + " conformes, " + nonServis + " non servis");
  }
  return { lignes, ecarts: ecarts.sort() };
}

function rapporter(site, res) {
  console.log("[Sonde] " + site + " · " + res.ecarts.length + " écart(s)");
  res.lignes.forEach((l) => console.log("  " + l));
  res.ecarts.forEach((e) => console.log("  ❌ " + e));
  return res.ecarts.length ? 1 : 0;
}

module.exports = { sonder, rapporter };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (nom, defaut) => { const i = args.indexOf(nom); return i >= 0 && args[i + 1] ? args[i + 1] : defaut; };
  const site = String(args.find((a) => /^https?:\/\//.test(a)) || "");
  if (!site) { console.log("Usage : node scripts/release/sonde-integrite.js <https://site> [--branche b] [--depot d]"); process.exit(2); }
  sonder(site, { sources: [{ depot: opt("--depot", process.cwd()), branche: opt("--branche", null) }] })
    .then((res) => process.exit(rapporter(site, res)))
    .catch((e) => { console.log("❌ sonde impossible : " + e.message); process.exit(2); });
}
