#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// check-readme-modules.js — garde-fou pré-commit BLOQUANT : l'architecture du README.md suit les fichiers réels
// =====================================================================
// Confronte, dans les deux sens, les tables du README.md aux fichiers présents (suivis ou nouveaux, hors ignorés) :
//   1. « 📦 Modules JS » : les modules des groupes = les <script src="js/…"> d'index.html, DANS LE MÊME ORDRE ;
//      la sous-section « Hors index.html » = les autres js/*.js, chacun cité par un fichier du dépôt (sinon code
//      mort) ; le compte du titre = le nombre de lignes ;
//   2. « 🏗️ Structure du projet » : table css/ = css/*.css ; tables scripts/ = scripts/**/*.{js,sh,ps1} ; colonne
//      « Branché » des check-*.js = les hooks qui les appellent (.githooks/pre-commit, commit-msg, ci-commits.sh) ;
//   3. « 📚 Documentation d'architecture » : table = docs/architecture/*.
// 🩸 Lit des FICHIERS, jamais l'index : passe identique en CI (rien n'y est indexé) et en local.
// Le message d'échec dit quoi ajouter ou retirer, et dans quelle table.
// Usage : node scripts/check-readme-modules.js [racine]   (appelé par .githooks/pre-commit)
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RACINE = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8").replace(/\r\n/g, "\n");

// ── Lecture du README ──────────────────────────────────────────────────
// Une section = du titre « ## <motif> » au « ## » suivant ; une ligne de table = « | `nom` | rôle | … ».
function section(md, motif) {
  const lignes = md.split("\n");
  const debut = lignes.findIndex((l) => l.startsWith("## ") && l.indexOf(motif) >= 0);
  if (debut < 0) return null;
  let fin = lignes.length;
  for (let i = debut + 1; i < lignes.length; i++) {
    if (/^## /.test(lignes[i])) { fin = i; break; }
  }
  return lignes.slice(debut, fin);
}

function lignesDeTable(lignes) {
  const out = [];
  lignes.forEach((l) => {
    const m = l.match(/^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/);
    if (!m) return;
    const cellules = m[2].split("|").map((c) => c.trim());
    out.push({ nom: m[1], cellules: cellules });
  });
  return out;
}

// Découpe une section en sous-sections « ### » : [{ titre, lignes }]
function sousSections(lignes) {
  const out = [];
  let cur = { titre: "", lignes: [] };
  lignes.forEach((l) => {
    if (/^### /.test(l)) { out.push(cur); cur = { titre: l, lignes: [] }; } else cur.lignes.push(l);
  });
  out.push(cur);
  return out;
}

// ── Contrôles purs (exécutés aussi par l'auto-test) ─────────────────────
// Rend la liste des problèmes ; vide = accord.
function comparerEnsembles(attendus, listes, ou, quoi) {
  const pb = [];
  const vus = new Set();
  listes.forEach((n) => {
    if (vus.has(n)) pb.push("ligne en double dans " + ou + " : `" + n + "` → n'en garder qu'une");
    vus.add(n);
  });
  attendus.forEach((n) => {
    if (vus.has(n)) return;
    pb.push(quoi + " sans ligne dans " + ou + " : `" + n + "` → ajouter « | `" + n + "` | <rôle> | »");
  });
  listes.forEach((n) => {
    if (attendus.indexOf(n) >= 0) return;
    pb.push("ligne de " + ou + " sans fichier : `" + n + "` → retirer la ligne (ou corriger le nom)");
  });
  return pb;
}

function comparerOrdre(attendus, listes, ou) {
  const communs = listes.filter((n) => attendus.indexOf(n) >= 0);
  const ref = attendus.filter((n) => communs.indexOf(n) >= 0);
  for (let i = 0; i < ref.length; i++) {
    if (ref[i] !== communs[i]) {
      return ["ordre de " + ou + " différent d'index.html : `" + communs[i] + "` est listé là où index.html charge `" +
        ref[i] + "` → ranger les lignes dans l'ordre des <script>"];
    }
  }
  return [];
}

function rolesVides(rows, ou) {
  return rows.filter((r) => !r.cellules[0]).map((r) => "rôle vide dans " + ou + " : `" + r.nom + "`");
}

// ── Auto-test : le contrôle doit rougir sur une table sabotée ──────────
(function autoTest() {
  const att = ["a.js", "b.js", "c.js"];
  const ko = [];
  if (comparerEnsembles(att, att, "T", "fichier").length) ko.push("une table exacte doit passer");
  const manque = comparerEnsembles(att, ["a.js", "c.js"], "T", "fichier");
  if (manque.length !== 1 || manque[0].indexOf("`b.js`") < 0) ko.push("une ligne manquante doit être nommée");
  const enTrop = comparerEnsembles(att, ["a.js", "b.js", "c.js", "z.js"], "T", "fichier");
  if (enTrop.length !== 1 || enTrop[0].indexOf("`z.js`") < 0) ko.push("une ligne en trop doit être nommée");
  if (comparerEnsembles(att, ["a.js", "a.js", "b.js", "c.js"], "T", "fichier").length !== 1) ko.push("doublon");
  if (comparerOrdre(att, ["b.js", "a.js", "c.js"], "T").length !== 1) ko.push("un ordre inversé doit rougir");
  if (comparerOrdre(att, att, "T").length) ko.push("le bon ordre doit passer");
  if (ko.length) {
    console.error("❌ [check-readme-modules] auto-test en échec : " + ko.join(" ; "));
    process.exit(1);
  }
})();

// ── Fichiers réels ─────────────────────────────────────────────────────
function fichiers(motifs) {
  try {
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--"].concat(motifs),
      { cwd: RACINE, encoding: "utf8" }).split("\n").filter(Boolean)
      .filter((f) => fs.existsSync(path.join(RACINE, f)));
  } catch (e) {
    console.error("❌ [check-readme-modules] git ls-files impossible : " + e.message);
    process.exit(1);
  }
}

const problemes = [];
const md = lire("README.md");

// 1. Modules JS
const secMod = section(md, "Modules JS");
if (!secMod) {
  problemes.push("section « ## 📦 Modules JS » introuvable dans README.md");
} else {
  const index = lire("index.html");
  const charges = [];
  const re = /<script\b[^>]*\bsrc="js\/([^"?]+)(?:\?[^"]*)?"/g;
  let m;
  while ((m = re.exec(index))) charges.push(m[1]);
  const tousJs = fichiers(["js/*.js"]).map((f) => f.replace(/^js\//, "")).filter((f) => f.indexOf("/") < 0);
  const horsIndex = tousJs.filter((f) => charges.indexOf(f) < 0).sort();

  const ss = sousSections(secMod);
  const horsSs = ss.filter((s) => /Hors `?index\.html/.test(s.titre));
  const groupes = ss.filter((s) => s.titre && !/Hors `?index\.html/.test(s.titre));
  const rowsGroupes = [].concat.apply([], groupes.map((s) => lignesDeTable(s.lignes)));
  const rowsHors = horsSs.length ? lignesDeTable(horsSs[0].lignes) : [];
  if (!horsSs.length && horsIndex.length) problemes.push("sous-section « ### 📥 Hors `index.html` » introuvable");

  const ouG = "« Modules JS » (groupes)";
  const ouH = "« Modules JS » (Hors index.html)";
  problemes.push.apply(problemes, comparerEnsembles(charges, rowsGroupes.map((r) => r.nom), ouG,
    "module chargé par index.html"));
  problemes.push.apply(problemes, comparerOrdre(charges, rowsGroupes.map((r) => r.nom), ouG));
  problemes.push.apply(problemes, comparerEnsembles(horsIndex, rowsHors.map((r) => r.nom), ouH,
    "fichier de js/ absent d'index.html"));
  problemes.push.apply(problemes, rolesVides(rowsGroupes, ouG), rolesVides(rowsHors, ouH));

  // Un module hors index.html doit être cité par un autre fichier servi ou une page, sinon il n'est jamais chargé.
  const citants = fichiers(["js/*.js", "*.html", "sw.js"]).map((f) => ({ f: f, t: lire(f) }));
  horsIndex.forEach((n) => {
    const cite = citants.some((c) => c.f !== "js/" + n && c.t.indexOf("js/" + n) >= 0 &&
      !/^sw\.js$/.test(c.f));
    if (!cite) problemes.push("`js/" + n + "` n'est chargé ni par index.html ni par aucun fichier (code mort ?)");
  });

  const titre = secMod[0].match(/\((\d+) modules?\)/);
  const total = rowsGroupes.length + rowsHors.length;
  if (!titre) problemes.push("titre « Modules JS » sans « (N modules) »");
  else if (+titre[1] !== total || total !== tousJs.length) {
    problemes.push("titre « Modules JS » : « (" + titre[1] + " modules) » alors que js/ en compte " + tousJs.length +
      " et la table " + total + " → corriger le compte du titre");
  }
}

// 2. Structure du projet : css/ et scripts/
const secStruct = section(md, "Structure du projet");
if (!secStruct) {
  problemes.push("section « ## 🏗️ Structure du projet » introuvable dans README.md");
} else {
  const ss = sousSections(secStruct);
  const ssCss = ss.find((s) => s.titre.indexOf("`css/`") >= 0);
  const ssScripts = ss.find((s) => s.titre.indexOf("`scripts/`") >= 0);
  if (!ssCss) problemes.push("sous-section « ### 🎨 `css/` » introuvable");
  else {
    const css = fichiers(["css/*.css"]).map((f) => f.replace(/^css\//, "")).filter((f) => f.indexOf("/") < 0);
    const rows = lignesDeTable(ssCss.lignes);
    problemes.push.apply(problemes, comparerEnsembles(css, rows.map((r) => r.nom), "la table `css/`", "feuille"));
    problemes.push.apply(problemes, rolesVides(rows, "la table `css/`"));
  }
  if (!ssScripts) problemes.push("sous-section « ### 🛠️ `scripts/` » introuvable");
  else {
    const scr = fichiers(["scripts/*.js", "scripts/*.sh", "scripts/*.ps1"])
      .filter((f) => f.indexOf("/node_modules/") < 0).map((f) => f.replace(/^scripts\//, ""));
    const rows = lignesDeTable(ssScripts.lignes);
    problemes.push.apply(problemes, comparerEnsembles(scr, rows.map((r) => r.nom), "les tables `scripts/`",
      "script"));
    problemes.push.apply(problemes, rolesVides(rows, "les tables `scripts/`"));

    // Colonne « Branché » des garde-fous : recalculée depuis les hooks.
    const hooks = {
      pre: lire(".githooks/pre-commit"), msg: lire(".githooks/commit-msg"), ci: lire("scripts/ci-commits.sh"),
    };
    const appel = (texte, n) => texte.split("\n").filter((l) => !/^\s*#/.test(l) &&
      l.indexOf("scripts/" + n) >= 0 && /\bnode\b/.test(l));
    rows.filter((r) => /^check-.*\.js$/.test(r.nom)).forEach((r) => {
      const pre = appel(hooks.pre, r.nom);
      const parts = [];
      if (pre.length) parts.push(pre.some((l) => /\|\|\s*exit/.test(l)) ? "pre-commit" : "pre-commit (consultatif)");
      if (appel(hooks.msg, r.nom).length) parts.push("commit-msg");
      if (appel(hooks.ci, r.nom).length) parts.push("ci-commits");
      const attendu = parts.join(" + ") || "aucun";
      if (parts.length === 0) {
        problemes.push("`scripts/" + r.nom + "` n'est appelé par aucun hook → le brancher (.githooks/pre-commit) " +
          "ou le dire dans sa ligne");
      }
      const dit = (r.cellules[1] || "").trim();
      if (parts.length && dit !== attendu) {
        problemes.push("colonne « Branché » de `" + r.nom + "` : « " + dit + " » alors que les hooks disent « " +
          attendu + " » → écrire « " + attendu + " »");
      }
    });
  }
}

// 3. Documentation d'architecture
const secDoc = section(md, "Documentation d'architecture");
if (!secDoc) {
  problemes.push("section « ## 📚 Documentation d'architecture » introuvable dans README.md");
} else {
  const docs = fichiers(["docs/architecture/*"]).map((f) => f.replace(/^docs\/architecture\//, ""))
    .filter((f) => f.indexOf("/") < 0);
  const rows = lignesDeTable(secDoc);
  problemes.push.apply(problemes, comparerEnsembles(docs, rows.map((r) => r.nom),
    "« Documentation d'architecture »", "fichier de docs/architecture/"));
  problemes.push.apply(problemes, rolesVides(rows, "« Documentation d'architecture »"));
}

if (problemes.length) {
  console.error("❌ [check-readme-modules] README.md ne décrit plus les fichiers réels (" + problemes.length + ") :");
  problemes.forEach((p) => console.error("   - " + p));
  console.error("   → mettre à jour la ligne dans README.md (rôle lu dans l'en-tête du fichier), à la bonne place.");
  process.exit(1);
}
console.log("✅ [check-readme-modules] README.md : modules js/ (ordre d'index.html), css/, scripts/ et " +
  "docs/architecture/ d'accord avec les fichiers.");
