#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-plan-folders.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Dossiers de « Mes plans ». Le vrai js/planRegistry.js est EXÉCUTÉ dans un bac
// à sable (localStorage en mémoire) ; l'écran est vérifié dans le source.
// 🩸 Régressions silencieuses visées :
//   1. l'index serveur reprend un plan que l'utilisateur a déplacé à la main ;
//   2. un dossier de l'index renommé/supprimé localement revient au boot ;
//   3. supprimer un dossier emporte ses plans ;
//   4. deux « Secteur » après un import de profil ou de liste ;
//   5. folderId orphelin qui plante la liste au lieu de valoir « Non classés » ;
//   6. mise à jour d'un plan (addOrUpdate, même id) qui perd son dossier ;
//   7. glisser actif au doigt sans appui long, ou écran qui gagne en hauteur.
// Usage : node scripts/check-plan-folders.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

// ── 0. Charger le registre réel dans un bac à sable ──────────────────
function registre(lsInitial) {
  const mem = Object.assign({}, lsInitial || {});
  const localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  const win = { I18n: { t: function (k) { return k; } } };
  const sb = { window: win, localStorage: localStorage, console: { warn: function () {}, log: function () {}, error: function () {} },
               navigator: {}, URL: { createObjectURL: function () { return ""; }, revokeObjectURL: function () {} },
               Blob: function () {}, document: { createElement: function () { return { click: function () {}, style: {} }; }, body: { appendChild: function () {}, removeChild: function () {} } },
               setTimeout: function (f) { f(); } };
  sb.window.localStorage = localStorage;
  vm.runInNewContext(lire("js/planRegistry.js"), sb, { filename: "planRegistry.js" });
  const PR = win.PlanRegistry;
  t("le registre se charge dans le bac à sable et expose l'API dossiers",
    PR && ["getFolders", "createFolder", "renameFolder", "deleteFolder", "moveFolder", "setPlanFolder", "planFolderId",
           "getPlansView", "setPlansView", "hasPlansViewChoice", "applyIndexFolders", "fusionnerDossiers"].every(function (k) { return typeof PR[k] === "function"; }));
  return { PR: PR, mem: mem };
}

// ── 1. Rangement manuel ──────────────────────────────────────────────
{
  const { PR, mem } = registre();
  PR.addOrUpdate({ id: "a", type: "local", name: "A" });
  PR.addOrUpdate({ id: "b", type: "local", name: "B" });
  t("sans dossier : le magasin n'a pas de clé folders (rétro-compat : rien ne change)", !/"folders"/.test(mem.myktamap_plans));
  const g = PR.createFolder("  Secteur  ");
  t("créer un dossier : nom nettoyé, id lisible, couleur posée, replié par défaut, src user",
    g && g.name === "Secteur" && g.id === "f_secteur" && /^#/.test(g.color) && g.collapsed === true && g.src === "user");
  t("🩸 même nom, casse ignorée = MÊME dossier (jamais deux Secteur)", PR.createFolder("secteur").id === g.id && PR.getFolders().length === 1);
  t("nom vide refusé", PR.createFolder("   ") === null);
  t("ranger un plan à la main : folderId + folderSrc user", PR.setPlanFolder("a", g.id, "user") && PR.findById("a").folderId === g.id && PR.findById("a").folderSrc === "user");
  t("ranger vers un dossier inexistant : refusé", PR.setPlanFolder("b", "f_nope", "user") === false && !PR.findById("b").folderId);
  t("sortir un plan à la main : Non classés, et le CHOIX est mémorisé (folderSrc user sans dossier)",
    PR.setPlanFolder("a", null, "user") && !PR.findById("a").folderId && PR.findById("a").folderSrc === "user");
  PR.setPlanFolder("a", g.id, "user");
  t("renommer : ok, et refus d'un nom déjà pris par un autre dossier",
    PR.renameFolder(g.id, "Secteur Sud") && PR.createFolder("Calcaire") && PR.renameFolder(g.id, "calcaire") === false);
  const c = PR.findFolderByName("Calcaire");
  t("ordre : monter/descendre renumérote densément", PR.moveFolder(c.id, -1) && PR.getFolders()[0].id === c.id && PR.getFolders().map(function (f) { return f.order; }).join(",") === "0,1");
  t("🩸 supprimer un dossier ne supprime JAMAIS un plan : il repasse en Non classés",
    PR.deleteFolder(g.id) && PR.findById("a") && !PR.findById("a").folderId && !PR.findById("a").folderSrc && PR.getFolders().length === 1);
  t("mode d'affichage : absent = jamais choisi, puis mémorisé",
    !PR.hasPlansViewChoice() && PR.getPlansView() === "all" && PR.setPlansView("folders") === "folders" && PR.hasPlansViewChoice() && PR.getPlansView() === "folders");
  t("removeAll efface aussi dossiers et mode", (PR.removeAll(), !/"folders"|"plansView"/.test(mem.myktamap_plans)));
}

// ── 2. L'index propose, l'utilisateur dispose ────────────────────────
{
  const { PR } = registre();
  PR.addOrUpdate({ id: "s1", type: "server", name: "S1" });
  PR.addOrUpdate({ id: "s2", type: "server", name: "S2" });
  const table = PR.applyIndexFolders([{ id: "secteur", name: "Secteur", color: "#123456" }, { id: "calc", name: "Calcaire" }]);
  const g = PR.findFolder("secteur");
  t("dossiers de l'index créés sous leur id, verrouillés (src index), couleur et ordre repris",
    g && g.src === "index" && g.color === "#123456" && g.order === 0 && PR.findFolder("calc") && PR.findFolder("calc").order === 1 && table.secteur === "secteur");
  t("🩸 un dossier de l'index ne se renomme pas, ne change pas de couleur, ne se supprime pas",
    PR.renameFolder("secteur", "X") === false && PR.setFolderColor("secteur", "#000") === false && PR.deleteFolder("secteur") === false && PR.findFolder("secteur"));
  t("…mais se replie et se réordonne", PR.setFolderCollapsed("secteur", false) && PR.moveFolder("secteur", 1) && PR.getFolders()[1].id === "secteur");
  t("l'index range un plan : folderSrc index", PR.setPlanFolder("s1", "secteur", "index") && PR.findById("s1").folderSrc === "index");
  t("🩸 l'utilisateur déplace ce plan → l'index ne le reprend PLUS (ni vers un dossier, ni hors)",
    PR.setPlanFolder("s1", "calc", "user") && PR.setPlanFolder("s1", "secteur", "index") === false && PR.setPlanFolder("s1", null, "index") === false && PR.findById("s1").folderId === "calc");
  t("un plan rangé par l'index en sort si l'index ne le range plus (origine index)",
    PR.setPlanFolder("s2", "secteur", "index") && PR.setPlanFolder("s2", null, "index") && !PR.findById("s2").folderId && !PR.findById("s2").folderSrc);
  // dossier user homonyme AVANT que l'index le déclare
  const { PR: PR2 } = registre();
  const mien = PR2.createFolder("Secteur");
  const tbl = PR2.applyIndexFolders([{ id: "secteur", name: "secteur" }]);
  t("🩸 un dossier user homonyme DEVIENT celui de l'index (même id local, verrouillé), et la table traduit l'id déclaré",
    PR2.getFolders().length === 1 && PR2.findFolder(mien.id).src === "index" && tbl.secteur === mien.id);
  const lib = PR2.applyIndexFolders([]);
  t("l'index ne déclare plus le dossier → LIBÉRÉ (src user), jamais supprimé",
    Object.keys(lib).length === 0 && PR2.findFolder(mien.id) && PR2.findFolder(mien.id).src === "user" && PR2.renameFolder(mien.id, "Secteur bis"));
}

// ── 3. Fusion (liste .config / profil) et robustesse ─────────────────
{
  const { PR } = registre();
  const locaux = [{ id: "f_secteur", name: "Secteur", color: "#111", order: 0, collapsed: true, src: "index" }];
  const r = PR.fusionnerDossiers(locaux, [{ id: "g2", name: "SECTEUR" }, { id: "x", name: "Silex", src: "index" }], "merge");
  t("🩸 fusion par nom : un seul Secteur, l'id LOCAL gagne, la table traduit l'id importé",
    r.folders.length === 2 && r.table.g2 === "f_secteur" && r.table.x === "x" && r.folders[1].name === "Silex");
  t("un dossier importé arrive toujours « user » (le verrou n'a de sens que si l'index local le redéclare)", r.folders[1].src === "user");
  t("la fusion est PURE (les dossiers locaux ne sont pas mutés)", locaux[0].src === "index" && locaux.length === 1);
  const rr = PR.fusionnerDossiers(locaux, [{ id: "n", name: "Nouveau" }], "replace");
  t("mode remplacer : seuls les importés restent", rr.folders.length === 1 && rr.folders[0].name === "Nouveau");
  const { PR: PR3 } = registre({ myktamap_plans: JSON.stringify({ version: "1.0", plans: [{ id: "o", type: "local", name: "O", folderId: "f_disparu" }] }) });
  t("🩸 folderId orphelin = Non classés, pas d'erreur", PR3.planFolderId(PR3.findById("o")) === null && PR3.getFolders().length === 0);
  const { PR: PR4 } = registre();
  PR4.addOrUpdate({ id: "p", type: "local", name: "P", version: "V1" });
  const d = PR4.createFolder("Dossier");
  PR4.setPlanFolder("p", d.id, "user");
  PR4.addOrUpdate({ id: "p", type: "local", name: "P", version: "V2", fileSize: 12 });
  t("🩸 mettre à jour un plan (même id, addOrUpdate) CONSERVE son dossier et son origine",
    PR4.findById("p").folderId === d.id && PR4.findById("p").folderSrc === "user" && PR4.findById("p").version === "V2");
}

// ── 3 bis. Règles par étiquette ──────────────────────────────────────
{
  const { PR } = registre();
  PR.addOrUpdate({ id: "r1", type: "local", name: "R1", tags: ["Secteur", "calcaire"] });
  PR.addOrUpdate({ id: "r2", type: "local", name: "R2", tags: ["silex"] });
  const g = PR.createFolder("Secteur", { rule: { tags: [" secteur "] } });
  t("règle : un plan étiqueté rejoint le dossier SANS folderId (rien d'écrit sur le plan)",
    PR.planFolderId(PR.findById("r1")) === g.id && !PR.findById("r1").folderId && PR.planFolderByRule(PR.findById("r1")));
  t("règle : un plan sans l'étiquette n'y est pas", PR.planFolderId(PR.findById("r2")) === null);
  const autre = PR.createFolder("Autre");
  t("🩸 manuel > règle : rangé à la main ailleurs, il y reste", PR.setPlanFolder("r1", autre.id, "user") && PR.planFolderId(PR.findById("r1")) === autre.id && !PR.planFolderByRule(PR.findById("r1")));
  t("🩸 sorti à la main → EXCLUSION mémorisée : la règle ne le reprend pas",
    PR.setPlanFolder("r1", null, "user") && PR.planFolderId(PR.findById("r1")) === null && (PR.findById("r1").folderExclude || []).indexOf(g.id) >= 0);
  t("remis à la main dans le dossier à règle → exclusion levée", PR.setPlanFolder("r1", g.id, "user") && !PR.findById("r1").folderExclude);
  t("setFolderRule normalise, s'applique, et se vide", PR.setFolderRule(g.id, ["", " Silex "]) && PR.findFolder(g.id).rule.tags[0] === "Silex" &&
    PR.planFolderId(PR.findById("r2")) === g.id && PR.setFolderRule(g.id, []) && !PR.findFolder(g.id).rule);
  t("supprimer un dossier nettoie ses exclusions", (PR.setFolderRule(g.id, ["secteur"]), PR.setPlanFolder("r1", null, "user"), PR.deleteFolder(g.id), !PR.findById("r1").folderExclude));
  const { PR: PR2 } = registre();
  PR2.applyIndexFolders([{ id: "sec", name: "Secteur", rule: { tags: ["secteur"] } }]);
  t("l'index déclare une règle : posée, et non modifiable localement", PR2.findFolder("sec").rule.tags[0] === "secteur" && PR2.setFolderRule("sec", ["x"]) === false);
  const fus = PR2.fusionnerDossiers([], [{ id: "a", name: "A", rule: { tags: ["t"] } }], "merge");
  t("la fusion de profil transporte la règle", fus.folders[0].rule && fus.folders[0].rule.tags[0] === "t");
}

// ── 4. Ce que l'écran et les autres modules doivent respecter ────────
{
  const HOME = lire("js/homeLoader.js");
  const MAIN = lire("js/main.js");
  const PROF = lire("js/profileExportImport.js");
  const CSS  = lire("css/style.css");
  const IDX  = lire("index.html");
  t("le sélecteur TOUT / DOSSIERS vit dans la ligne de titre « Mes plans » (0 px ajouté)",
    /<div class="loader-section-head"[^>]*>\s*<span data-i18n="home\.plans\.title">[\s\S]{0,1400}id="loaderPlansViewSwitch"[\s\S]{0,400}<\/div>\s*<\/div>\s*\n\s*(<!--(?:(?!-->)[\s\S])*-->\s*)?<div class="loader-plans-filters">/
      .test(IDX));   // suivi du bloc des filtres, repéré sur le CODE (le commentaire HTML est facultatif)
  t("🩸 le glisser n'existe que pour un pointeur fin (jamais au doigt)",
    /pointer: fine/.test(HOME) && /draggable/.test(HOME));
  // 🩸 Un seuil maison arrive APRÈS celui du navigateur et annule dragstart.
  t("🩸 le glisser souris s'en remet au seuil NATIF du navigateur (aucun preventDefault sur dragstart, aucun seuil maison)",
    /addEventListener\("dragstart", function\(e\) \{\s*_dragPlanId = row\.dataset\.id;/.test(HOME) && !/SEUIL_GLISSER|_dragArme/.test(HOME));
  t("📱 au doigt, le glisser passe par un APPUI LONG (timer), et le défilement n'est bloqué (preventDefault) QUE pendant le geste",
    /APPUI_LONG/.test(HOME) && /touchstart[\s\S]{0,400}setTimeout/.test(HOME) &&
    /if \(_tDrag && _tDrag\.id === row\.dataset\.id\) \{\s*e\.preventDefault\(\)/.test(HOME) && /\{ passive: false \}/.test(HOME));
  t("📱 un doigt qui bouge avant l'appui long annule (c'est un défilement)", /TOLERANCE_APPUI/.test(HOME));
  t("📱 pendant le glisser tactile, la ligne d'origine est une EMPREINTE (pas un double) et le défilement aux bords tourne en rAF, arrêté au dépôt",
    /kta-plan-row-empreinte/.test(HOME) && /\.plan-row\.kta-plan-row-empreinte \{ opacity: 0\.12/.test(CSS) &&
    /function _defilerAuxBords\(\)[\s\S]{0,1600}requestAnimationFrame\(_defilerAuxBords\)/.test(HOME) && /cancelAnimationFrame\(d\.raf\)/.test(HOME));
  t("📱 le défilement du glisser est BORNÉ à « Mes plans » (jamais au-delà de la fin de la liste ni au-dessus de son titre)",
    /liste\.getBoundingClientRect\(\)\.bottom <= bas\) delta = 0/.test(HOME) && /boite\.getBoundingClientRect\(\)\.top >= haut\) delta = 0/.test(HOME));
  t("📱 un appui long ne sélectionne pas de texte : user-select:none sur les lignes et en-têtes, selectstart bloqué pendant le geste",
    /\.plan-row, \.kta-plans-folder-head \{ user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; \}/.test(CSS) &&
    /selectstart/.test(HOME));
  t("la découverte serveur applique les dossiers de l'index et TRADUIT l'id déclaré",
    /applyIndexFolders\(/.test(MAIN) && /setPlanFolder\([^,]+,[^,]+,\s*"index"\)/.test(MAIN));
  t("le kiosque peut forcer le mode par défaut, SEULEMENT si l'utilisateur n'a jamais choisi",
    /plansViewDefault/.test(MAIN) && /hasPlansViewChoice\(\)/.test(MAIN));
  t("l'import de profil fusionne les dossiers par nom et traduit le folderId des plans importés",
    /fusionnerDossiers\(/.test(PROF));
  t("thème clair : les en-têtes de dossier ont leur variante", /kta-theme-light[^{]*\.kta-plans-folder-head/.test(CSS));
  const IMPM = lire("js/importMasse.js");
  t("marche 2 : l'import multiple propose un dossier de destination et le pose (geste user)",
    /id="kta-impm-dossier"/.test(IMPM) && /setPlanFolder\(ligne\.id, opts\.dossier, "user"\)/.test(IMPM));
  t("marche 2 : des chips cochées proposent « 📁 Dossier depuis ces étiquettes » (dossier à règle)", /loaderPlansChipFolder/.test(HOME) && /rule: \{ tags: libelles \}/.test(HOME));
  t("marche 2 : la feuille d'un dossier porte le champ de règle", /id="kta-plans-folder-rule"/.test(HOME) && /setFolderRule\(f\.id, regle\)/.test(HOME));
  for (const l of ["fr", "en", "es"]) {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    const cles = ["home.plans.view.all", "home.plans.view.folders", "home.plans.folders.new", "home.plans.folders.unfiled",
                  "home.plans.folders.moveTo", "home.plans.folders.select", "home.plans.folders.delete", "home.plans.folders.lockedIndex",
                  "home.plans.folders.rule", "home.plans.folders.rulePlaceholder", "home.plans.folders.ruleHint", "home.plans.folders.byRule", "home.plans.folders.fromTags",
                  "impmasse.dossier.titre", "impmasse.dossier.aucun", "impmasse.dossier.nouveau", "impmasse.dossier.nomPlaceholder"];
    const manque = cles.filter(function (k) { return typeof d[k] !== "string"; });
    t("🌍 " + l + " : textes des dossiers" + (manque.length ? " — manquants : " + manque.join(", ") : ""), manque.length === 0);
  }
}

console.log("");
if (echecs) { console.log("💥 dossiers de « Mes plans » : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 dossiers : l'index propose, l'utilisateur dispose, jamais deux Secteur, jamais un plan perdu");
