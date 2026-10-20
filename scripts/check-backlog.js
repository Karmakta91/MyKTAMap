#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// check-backlog.js — garde-fou pré-commit en AVERTISSEMENT (jamais bloquant), rejoué en CI
// =====================================================================
// Contrôle la forme de docs/BACKLOG.md (format décrit dans son préambule) : sections connues (Avant de traiter une
// entrée, Maintenant, Ensuite, Plus tard, Entrant), plafond de Maintenant, une entrée = une puce en gras de 3 lignes
// au plus suivie de ses métadonnées `qui · action · fini · depuis · taille` (facultatives dans Entrant), valeurs
// permises. Il ne juge pas le fond : une entrée bien formée peut être périmée (le tri le voit, pas lui).
// ⚠️ Contrat : le même format est lu par la vue du backlog ; changer une règle ici = changer le préambule du
// backlog dans le même commit.
// Usage : node scripts/check-backlog.js [fichier]   (défaut : docs/BACKLOG.md ; sortie 0 même s'il avertit)
//         node scripts/check-backlog.js --strict    (sortie 1 s'il avertit)
//         node scripts/check-backlog.js --sabotages (chaque défaut simulé doit être signalé ; sortie 1 sinon)
// =====================================================================
"use strict";
const fs = require("fs");
const path = require("path");

const PLAFOND_MAINTENANT = 10;
const PREAMBULE = "avant de traiter une entree";
const HORIZONS = ["maintenant", "ensuite", "plus tard", "entrant"];
const CHAMPS = ["qui", "action", "fini", "depuis", "taille"];
const FACULTATIFS = ["lot"];
const QUI = ["KARMA", "Claude"];
const TAILLES = ["XS", "S", "M", "L"];
const MAX_LIGNES_CORPS = 3;

// « ## 🧭 Plus tard » → « plus tard » (emoji, ponctuation et accents retirés) : le titre peut porter un pictogramme.
function nomSection(titre) {
  return titre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

function dateValide(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || "");
  if (!m) return false;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getTime() <= Date.now() + 864e5;
}

// Métadonnées : un bloc entre accents graves, sur une ou plusieurs lignes, champs « clé: valeur » séparés par « · ».
function lireMeta(brut) {
  const champs = {};
  brut.replace(/^`|`$/g, "").split(/\s+·\s+/).forEach(function (morceau) {
    const m = /^([\p{L}]+)\s*:\s*([\s\S]*)$/u.exec(morceau.trim());
    if (m) champs[m[1].toLowerCase()] = m[2].trim();
    else if (morceau.trim()) champs["?" + morceau.trim().slice(0, 20)] = "";
  });
  return champs;
}

// Texte du backlog → { sections, entrees, avertissements }.
function analyser(texte) {
  const lignes = texte.replace(/\r\n/g, "\n").split("\n");
  const avert = [];
  const entrees = [];
  const vues = [];
  let section = null;
  let cur = null;
  let dansCode = false;
  const fermer = function () {
    if (!cur) return;
    const meta = cur.lignes.findIndex(function (l) { return /^\s+`qui\s*:/.test(l); });
    cur.corps = meta < 0 ? cur.lignes : cur.lignes.slice(0, meta);
    cur.meta = meta < 0 ? null : lireMeta(cur.lignes.slice(meta).map(function (l) { return l.trim(); }).join(" "));
    entrees.push(cur);
    cur = null;
  };
  lignes.forEach(function (l, i) {
    const n = i + 1;
    if (/^\s*```/.test(l)) dansCode = !dansCode;
    if (dansCode) return;
    const h = /^(#{2,6})\s+(.*)$/.exec(l);
    if (h) {
      fermer();
      if (h[1] !== "##") {
        if (section && section !== PREAMBULE) avert.push(n + ": sous-section « " + h[2] + " » dans un horizon (une entrée = une puce)");
        return;
      }
      section = nomSection(h[2]);
      vues.push(section);
      if (section !== PREAMBULE && HORIZONS.indexOf(section) < 0) avert.push(n + ": section inconnue « " + h[2] + " »");
      return;
    }
    if (!section || section === PREAMBULE || HORIZONS.indexOf(section) < 0) return;
    if (/^- /.test(l)) { fermer(); cur = { section: section, ligne: n, titre: l, lignes: [] }; return; }
    if (cur && /^\s{2,}\S/.test(l)) { cur.lignes.push(l); return; }
    if (!l.trim()) { fermer(); return; }
    fermer();
    if (/^\s*\|/.test(l)) avert.push(n + ": tableau dans « " + section + " » (une entrée = une puce)");
    else if (!/^>/.test(l)) avert.push(n + ": texte hors entrée dans « " + section + " »");
  });
  fermer();

  HORIZONS.forEach(function (h) { if (vues.indexOf(h) < 0) avert.push("section « " + h + " » absente"); });
  const ordre = vues.filter(function (s) { return HORIZONS.indexOf(s) >= 0; });
  if (ordre.join("|") !== HORIZONS.filter(function (h) { return ordre.indexOf(h) >= 0; }).join("|")) {
    avert.push("horizons dans le désordre (attendu : Maintenant, Ensuite, Plus tard, Entrant)");
  }

  entrees.forEach(function (e) {
    const ou = e.ligne + ": ";
    const titre = /^- \*\*([^*]+)\*\*/.exec(e.titre);
    e.nom = titre ? titre[1].trim() : e.titre.slice(2, 50);
    if (!titre) avert.push(ou + "entrée sans titre en gras (« - **Titre** — corps »)");
    if (1 + e.corps.length > MAX_LIGNES_CORPS) {
      avert.push(ou + "« " + e.nom + " » : corps de " + (1 + e.corps.length) + " lignes (" + MAX_LIGNES_CORPS +
        " au plus : renvoyer vers l'étude ou la doc)");
    }
    if (!e.meta) {
      if (e.section !== "entrant") avert.push(ou + "« " + e.nom + " » : métadonnées absentes (`qui: … · taille: …`)");
      return;
    }
    const exiges = e.section === "entrant" ? [] : CHAMPS;
    exiges.forEach(function (c) { if (!e.meta[c]) avert.push(ou + "« " + e.nom + " » : champ « " + c + " » manquant"); });
    Object.keys(e.meta).forEach(function (c) {
      if (CHAMPS.indexOf(c) < 0 && FACULTATIFS.indexOf(c) < 0) avert.push(ou + "« " + e.nom + " » : champ inconnu « " + c + " »");
    });
    if (e.meta.qui && QUI.indexOf(e.meta.qui) < 0) avert.push(ou + "« " + e.nom + " » : qui « " + e.meta.qui + " » (" + QUI.join(" | ") + ")");
    if (e.meta.taille && TAILLES.indexOf(e.meta.taille) < 0) avert.push(ou + "« " + e.nom + " » : taille « " + e.meta.taille + " » (" + TAILLES.join(" | ") + ")");
    if (e.meta.depuis && !dateValide(e.meta.depuis)) avert.push(ou + "« " + e.nom + " » : depuis « " + e.meta.depuis + " » (JJ/MM/AAAA, passée)");
  });

  const nbMaintenant = entrees.filter(function (e) { return e.section === "maintenant"; }).length;
  if (nbMaintenant > PLAFOND_MAINTENANT) avert.push("Maintenant : " + nbMaintenant + " entrées (plafond " + PLAFOND_MAINTENANT + ")");
  return { entrees: entrees, nbMaintenant: nbMaintenant, avertissements: avert };
}

// Défauts simulés : chacun doit produire au moins un avertissement dont le texte contient « attendu ».
function sabotages() {
  const meta = "  `qui: Claude · action: faire · fini: fait · depuis: 01/10/2026 · taille: S`";
  const sain = ["# B", "", "## Avant de traiter une entrée", "", "- règle", "", "## Maintenant", "",
    "- **A** — corps.", meta, "", "## Ensuite", "", "## Plus tard", "", "## Entrant", ""].join("\n");
  const cas = [
    ["sain", sain, null],
    ["plafond", sain.replace("## Ensuite", Array.from({ length: 11 }, function (_, k) {
      return "- **E" + k + "** — c.\n" + meta; }).join("\n") + "\n\n## Ensuite"), "plafond"],
    ["section inconnue", sain.replace("## Plus tard", "## Dettes"), "section inconnue"],
    ["champ manquant", sain.replace(" · fini: fait", ""), "« fini » manquant"],
    ["métadonnées absentes", sain.replace(meta + "\n", ""), "métadonnées absentes"],
    ["qui inconnu", sain.replace("qui: Claude", "qui: Bob"), "qui « Bob »"],
    ["taille inconnue", sain.replace("taille: S", "taille: S-M"), "taille « S-M »"],
    ["date invalide", sain.replace("01/10/2026", "2026-10-01"), "depuis « 2026-10-01 »"],
    ["corps trop long", sain.replace("- **A** — corps.", "- **A** — 1\n  2\n  3\n  4"), "corps de 4 lignes"],
    ["tableau", sain.replace("## Ensuite\n", "## Ensuite\n\n| a | b |\n|---|---|\n| c | d |\n"), "tableau"],
    ["champ inconnu", sain.replace("taille: S", "taille: S · priorité: haute"), "champ inconnu"],
  ];
  let echecs = 0;
  cas.forEach(function (c) {
    const a = analyser(c[1]).avertissements;
    const ok = c[2] === null ? a.length === 0 : a.some(function (x) { return x.indexOf(c[2]) >= 0; });
    const attendu = c[2] === null ? "sans avertissement" : "signalé";
    console.log((ok ? "✅" : "❌") + " [check-backlog] cas « " + c[0] + " » " + (ok ? attendu : "FAUX : " + a.join(" ; ")));
    if (!ok) echecs++;
  });
  return echecs;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.indexOf("--sabotages") >= 0) process.exit(sabotages() ? 1 : 0);
  const strict = args.indexOf("--strict") >= 0;
  const fichier = args.filter(function (a) { return !/^--/.test(a); })[0] ||
    path.join(__dirname, "..", "docs", "BACKLOG.md");
  if (!fs.existsSync(fichier)) { console.log("⚠️  [check-backlog] absent : " + fichier); process.exit(0); }
  const r = analyser(fs.readFileSync(fichier, "utf8"));
  r.avertissements.forEach(function (a) { console.log("⚠️  [check-backlog] " + a); });
  const bilan = r.entrees.length + " entrées, Maintenant " + r.nbMaintenant + "/" + PLAFOND_MAINTENANT;
  if (r.avertissements.length) console.log("⚠️  [check-backlog] " + r.avertissements.length + " avertissement(s) — " + bilan);
  else console.log("✅ [check-backlog] " + bilan);
  process.exit(strict && r.avertissements.length ? 1 : 0);
}

module.exports = { analyser: analyser, nomSection: nomSection, lireMeta: lireMeta };
