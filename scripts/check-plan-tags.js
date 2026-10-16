#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🏷️ check-plan-tags.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Étiquettes de plan écrites À LA GÉNÉRATION (16/09/2026, KARMA : « affecter
// des tags directement à la génération, rétro-compat comme d'hab »).
//
// 🩸 CE QUI RÉGRESSE SANS BRUIT :
//   1. Deux normalisations divergent (ℹ️ Infos d'un côté, Générateur de
//      l'autre) : un tag accepté ici est refusé là, silencieusement.
//   2. Le fichier ÉCRASE l'utilisateur : réimporter une nouvelle version du
//      ZIP effacerait les étiquettes posées à la main — le ping-pong déjà
//      corrigé sur `version` (v1.88.0) et sur l'index serveur (v1.90.1).
//   3. Un convertisseur (KMZ, GPX, SIG) oublie le champ : un plan converti
//      n'a jamais d'étiquettes, personne ne sait pourquoi.
//   4. Le champ est écrit même vide : le JSON d'un plan sans étiquettes
//      change, et la promesse « rétro-compat = zéro diff » est rompue.
//   5. L'import multiple entre les plans SANS lire leurs étiquettes : elles
//      n'apparaîtraient qu'à la première ouverture.
//
// ON EXÉCUTE la normalisation et la règle d'application (extraites du code),
// on ne se contente pas de grep. Usage : node scripts/check-plan-tags.js [racine]
//
// 🏷️ REPÈRES DE DÉCOUPE : marqueurs explicites `// 🏷️ ancre:debut-tags-config` /
// `// 🏷️ ancre:fin-tags-config` posés dans la source (forme commune à tous les
// garde-fous : `// 🏷️ ancre:<nom>`, jamais un commentaire libre ni un tag de
// version). Repère introuvable = ÉCHEC.
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

const PR   = lire("js/planRegistry.js");
const MAIN = lire("js/main.js");
const GEN  = lire("js/createConf.js");
const IMPM = lire("js/importMasse.js");

// ---------- 1. UNE normalisation, exécutée ----------
{
  const i = PR.indexOf("function normaliserTags(");
  const j = PR.indexOf("\n  }\n", i);
  const src = (i >= 0 && j > i) ? PR.slice(i, j + 4) : "";
  t("PlanRegistry.normaliserTags est extractible", src.length > 0);
  if (src) {
    const jouer = function (arr) { const sb = { out: null, arr: arr }; vm.runInNewContext(src + "\nout = normaliserTags(arr);", sb); return sb.out; };
    t("trim + vides éliminés", JSON.stringify(jouer([" secteur ", "", "  "])) === JSON.stringify(["secteur"]));
    t("doublons éliminés SANS tenir compte de la casse (« Secteur » et « SECTEUR » = une étiquette)",
      JSON.stringify(jouer(["Secteur", "SECTEUR", "secteur"])) === JSON.stringify(["Secteur"]));
    t("12 étiquettes maximum", jouer("abcdefghijklmnop".split("")).length === 12);
    t("24 caractères maximum par étiquette", jouer(["x".repeat(40)])[0].length === 24);
    t("entrée absente ou non-liste : liste vide, sans planter", jouer(null).length === 0 && jouer("a,b").length === 0);
  }
  t("🩸 setTags PASSE PAR normaliserTags (une seule normalisation dans l'app)",
    /function setTags\([\s\S]{0,300}normaliserTags\(tags\)/.test(PR));
  t("normaliserTags est exposée (le Générateur l'utilise)", /normaliserTags:\s*normaliserTags/.test(PR));
  t("setTags accepte l'origine \"config\" (pose ET retrait)",
    /tagsSrc = \(origine === "index" \|\| origine === "config"\) \? origine : "user"/.test(PR) &&
    /if \(origine === "index" \|\| origine === "config"\) delete p\.tagsSrc;/.test(PR));
}

// ---------- 2. La règle d'application, exécutée (main.js ET importMasse.js) ----------
function jouerRegle(src, vars, scenario) {
  // registre factice : on observe les appels à setTags
  const appels = [];
  const reg = {
    findById: function () { return scenario.existant || null; },
    setTags: function (id, tags, origine) { appels.push({ tags: tags, origine: origine }); }
  };
  const sb = Object.assign({ window: { PlanRegistry: reg }, console: { warn: function () {} } }, vars(scenario));
  vm.runInNewContext(src, sb);
  return appels;
}
function extraire(S, nom) {
  const i = S.indexOf("// 🏷️ ancre:debut-tags-config"), j = S.indexOf("// 🏷️ ancre:fin-tags-config");
  const src = (i >= 0 && j > i) ? S.slice(i, j) : "";
  t(nom + " : la règle d'application est extractible (repères début/fin présents)", src.length > 0);
  return src;
}
const SCENARIOS = [
  ["plan nouveau + ZIP avec tags → posés avec l'origine config",
    { zip: ["a", "b"], existant: null }, function (a) { return a.length === 1 && a[0].origine === "config" && a[0].tags.length === 2; }],
  ["🩸 tags posés À LA MAIN + ZIP avec d'autres tags → RIEN ne bouge (l'utilisateur dispose)",
    { zip: ["x"], existant: { tags: ["mien"], tagsSrc: "user" } }, function (a) { return a.length === 0; }],
  ["🩸 tags de l'INDEX serveur + ZIP avec tags → rien ne bouge (le déployeur passe avant le fichier)",
    { zip: ["x"], existant: { tags: ["idx"], tagsSrc: "index" } }, function (a) { return a.length === 0; }],
  ["ZIP réimporté SANS tags alors qu'un ZIP précédent en proposait → retirés (et seulement ceux-là)",
    { zip: [], existant: { tags: ["old"], tagsSrc: "config" } }, function (a) { return a.length === 1 && a[0].origine === "config" && a[0].tags.length === 0; }],
  ["ZIP sans tags + tags posés à la main → rien ne bouge",
    { zip: undefined, existant: { tags: ["mien"], tagsSrc: "user" } }, function (a) { return a.length === 0; }],
  ["ZIP sans tags + plan sans tags → aucun appel (rétro-compat : rien ne change)",
    { zip: undefined, existant: { name: "x" } }, function (a) { return a.length === 0; }],
  ["nouvelle version du ZIP avec d'autres tags proposés → remplace les propositions précédentes",
    { zip: ["n1"], existant: { tags: ["old"], tagsSrc: "config" } }, function (a) { return a.length === 1 && a[0].tags[0] === "n1"; }]
];
{
  const src = extraire(MAIN, "main.js");
  if (src) SCENARIOS.forEach(function ([nom, sc, ok]) {
    t("main > startImportedPlan : " + nom,
      ok(jouerRegle(src, function (s) { return { rawConfig: { plan: { tags: s.zip } }, id: "p" }; }, sc)));
  });
  const src2 = extraire(IMPM, "importMasse.js");
  if (src2) SCENARIOS.forEach(function ([nom, sc, ok]) {
    t("importMasse > importer : " + nom,
      ok(jouerRegle(src2, function (s) { return { ligne: { id: "p", info: { tags: s.zip } } }; }, sc)));
  });
  t("🩸 l'import multiple LIT plan.tags dans le plan-config (sinon les étiquettes n'arrivent qu'à l'ouverture)",
    /tags: Array\.isArray\(plan\.tags\) \? plan\.tags : \[\]/.test(IMPM));
}

// ---------- 3. Le Générateur et ses trois convertisseurs ----------
{
  t("le champ 🏷️ vit dans « Informations du plan », après l'auteur",
    /id="pl_author"[\s\S]{0,900}id="pl_tags"[\s\S]{0,1500}id="pl_width"/.test(GEN));
  t("🩸 plan.tags n'est écrit QUE si des étiquettes sont saisies (JSON identique sinon)",
    /if \(tags\.length\)\s+planObj\.tags = tags;/.test(GEN));
  t("la lecture passe par _lireTagsChamp → PlanRegistry.normaliserTags", /function _lireTagsChamp\([\s\S]{0,400}normaliserTags\(brut\)/.test(GEN));
  t("mode Modifier : le champ est prérempli depuis le ZIP rouvert", /sv\("pl_tags",\s*Array\.isArray\(plan\.tags\)/.test(GEN));
  for (const [modale, champ, appel] of [["KMZ", "kta-kmz-imp-tags", /KmzImport\.genererZipMyktamap\(\{[\s\S]{0,300}tags:\s*_lireTagsChamp\("kta-kmz-imp-tags"\)/],
                                        ["GPX", "kta-gpx-imp-tags", /GpxImport\.genererZipMyktamap\(\{[\s\S]{0,300}tags:\s*_lireTagsChamp\("kta-gpx-imp-tags"\)/],
                                        ["SIG", "kta-sig-imp-tags", /SigImport\.genererZipMyktamap\(\{[\s\S]{0,400}tags:\s*_lireTagsChamp\("kta-sig-imp-tags"\)/]]) {
    t("convertisseur " + modale + " : champ 🏷️ dans sa modale ET transmis au générateur de ZIP",
      new RegExp('id="' + champ + '"').test(GEN) && appel.test(GEN));
  }
  for (const F of ["js/sigImport.js", "js/kmzImport.js", "js/gpxImport.js"]) {
    const W = lire(F);
    t(F + " écrit plan.tags depuis opts.tags, seulement si non vide",
      /if \(Array\.isArray\(opts\.tags\) && opts\.tags\.length\) planConfig\.plan\.tags = opts\.tags\.slice\(0, 12\);/.test(W));
  }
}

// ---------- 4. Textes ×3 et format documenté ----------
{
  for (const l of ["fr", "en", "es"]) {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    t("🌍 " + l + " : gen.infos.tags / tagsPlaceholder / tagsHint",
      ["gen.infos.tags", "gen.infos.tagsPlaceholder", "gen.infos.tagsHint"].every(function (k) { return typeof d[k] === "string" && d[k].length > 0; }));
  }
  t("docs/architecture/data-formats.md documente plan.tags", /"tags"/.test(lire("docs/architecture/data-formats.md")));
}

console.log("");
if (echecs) { console.log("💥 étiquettes à la génération : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 étiquettes à la génération : une normalisation, le fichier propose, l'utilisateur dispose, quatre écrivains couverts");
