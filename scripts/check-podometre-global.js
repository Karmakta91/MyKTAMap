#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-podometre-global.js — garde-fou pré-commit BLOQUANT : le podomètre est un réglage de l'appareil
// =====================================================================
// Taille de pas, seuil et cooldown ne sont PAS des propriétés du plan (la foulée est celle de la personne,
// seuil et cooldown ceux du téléphone) : GLOBAUX (`app_user_prefs`), réglés dans Réglages pour tous les plans.
// 🩸 Ce qui régresse sans bruit :
//   1. le Générateur ou un convertisseur réécrit ces clés dans plan-config : la foulée est figée par plan
//      et une meilleure valeur d'usine ne s'applique plus à personne ;
//   2. le chargeur relit `tracking.stepThreshold` d'un vieux plan : un seuil trop bas (1.2) fait compter
//      des pas fantômes (≈ 10 km/h à l'arrêt) ;
//   3. Réglages écrit par plan : 50 plans = 50 fois la même foulée ;
//   4. une ancienne pref PAR PLAN est perdue au lieu d'être promue en global.
// `js/config.js` est EXÉCUTÉ dans un bac à sable (localStorage en mémoire) : on prouve ce que le chargeur
// fait d'un plan-config piégé. Usage : node scripts/check-podometre-global.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

// ── 0. config.js dans un bac à sable ──────────
function bac(lsInitial) {
  const mem = Object.assign({}, lsInitial || {});
  const localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  const win = { addEventListener: function () {}, localStorage: localStorage, I18n: { t: function (k) { return k; } } };
  const sb = {
    window: win, localStorage: localStorage, console: { log: function () {}, warn: function () {}, error: function () {} },
    navigator: { userAgent: "node" }, document: { getElementById: function () { return null; }, querySelector: function () { return null; },
      querySelectorAll: function () { return []; }, addEventListener: function () {} },
    setTimeout: function () { return 0; }, clearTimeout: function () {}, URL: { createObjectURL: function () { return ""; } },
    fetch: function () { return Promise.reject(new Error("pas de réseau")); }, Blob: function () {}, File: function () {}, Image: function () {}
  };
  sb.self = sb.window; sb.globalThis = sb;
  try { vm.runInNewContext(lire("js/config.js"), sb, { filename: "config.js" }); }
  catch (e) { return { erreur: e.message, mem: mem, win: win }; }
  return { win: win, mem: mem };
}
const CFG = lire("js/config.js");
const USINE = (function () {
  const bloc = CFG.match(/let DEFAULT_CONFIG = \{[\s\S]*?\n\};/);
  const out = {};
  ["stepLength", "stepThreshold", "stepCooldown"].forEach(function (k) {
    const m = bloc && bloc[0].match(new RegExp(k + "\\s*:\\s*(-?[0-9.]+)"));
    out[k] = m ? Number(m[1]) : NaN;
  });
  return out;
})();
t("valeurs d'usine lisibles dans DEFAULT_CONFIG (" + JSON.stringify(USINE) + ")", Object.values(USINE).every(Number.isFinite));

{
  const b = bac();
  t("config.js se charge dans le bac à sable" + (b.erreur ? " — " + b.erreur : ""), !b.erreur && typeof b.win.buildAppConfigFromPlan === "function");
  if (!b.erreur) {
    // 1. un plan-config piégé (clés podomètre présentes) est IGNORÉ
    const piege = { plan: { name: "P", imageWidth: 100, imageHeight: 100 }, tracking: { scale: 5, startX: 10, startY: 20, stepLength: 0.3, stepThreshold: 1.2, stepCooldown: 280 } };
    const c = b.win.buildAppConfigFromPlan(piege);
    t("🩸 les clés podomètre d'un plan-config sont IGNORÉES, même présentes : usine appliquée",
      c.stepLength === USINE.stepLength && c.stepThreshold === USINE.stepThreshold && c.stepCooldown === USINE.stepCooldown);
    t("…et les vraies propriétés du plan (échelle, départ) sont toujours lues", c.scale === 5 && c.startX === 10 && c.startY === 20);
    // 2. le réglage global s'applique, dans ses bornes
    t("setGlobalPodometre est exposé", typeof b.win.setGlobalPodometre === "function");
    t("hors bornes : refus sec", b.win.setGlobalPodometre({ stepThreshold: 1.2 }) === false && b.win.setGlobalPodometre({ stepLength: 9 }) === false);
    t("dans les bornes : écrit dans app_user_prefs", b.win.setGlobalPodometre({ stepLength: 0.9, stepThreshold: 16 }) === true &&
      JSON.parse(b.mem.app_user_prefs).stepLength === 0.9 && JSON.parse(b.mem.app_user_prefs).stepThreshold === 16);
    const c2 = b.win.buildAppConfigFromPlan(piege);
    t("🩸 le réglage global PRIME sur l'usine à chaque reconstruction de config (tous les plans)", c2.stepLength === 0.9 && c2.stepThreshold === 16 && c2.stepCooldown === USINE.stepCooldown);
    t("null = retour à l'usine et clé retirée", b.win.setGlobalPodometre({ stepLength: null }) === true && !("stepLength" in JSON.parse(b.mem.app_user_prefs)));
    t("setPlanTracking ne pose PLUS de podomètre par plan (startX/Y restent par plan)",
      b.win.setPlanTracking("p1", { stepLength: 0.8 }) === false && b.win.setPlanTracking("p1", { startX: 5, startY: 6 }) === true &&
      !("stepLength" in JSON.parse(b.mem["myktamap_plan_prefs_p1"])));
  }
  // 3. migration : une ancienne pref PAR PLAN est promue une fois, puis retirée
  const b2 = bac({ "myktamap_plan_prefs_p9": JSON.stringify({ stepLength: 0.85, stepCooldown: 500, startX: 1 }) });
  if (!b2.erreur) {
    b2.win._currentLoadedPlanId = "p9";
    b2.win.APP_CONFIG = b2.win.buildAppConfigFromPlan({ plan: {}, tracking: {} });
    b2.win.appliquerTrackingPerPlan();
    const g = JSON.parse(b2.mem.app_user_prefs || "{}"), pp = JSON.parse(b2.mem["myktamap_plan_prefs_p9"]);
    t("🩸 migration : la pref par plan devient le réglage global (personne ne perd sa foulée)…", g.stepLength === 0.85 && g.stepCooldown === 500 && b2.win.APP_CONFIG.stepLength === 0.85);
    t("…et quitte les prefs du plan (startX y reste)", !("stepLength" in pp) && !("stepCooldown" in pp) && pp.startX === 1);
    b2.mem["myktamap_plan_prefs_p10"] = JSON.stringify({ stepLength: 0.5 });
    b2.win._currentLoadedPlanId = "p10";
    b2.win.appliquerTrackingPerPlan();
    t("un second plan n'écrase pas le global déjà promu (première promotion seulement)", JSON.parse(b2.mem.app_user_prefs).stepLength === 0.85 && !("stepLength" in JSON.parse(b2.mem["myktamap_plan_prefs_p10"])));
  }
}

// ── 4. Les écrivains n'écrivent plus, l'écran écrit global ──────────
{
  const sansCommentaires = function (s) { return s.split("\n").filter(function (l) { return !/^\s*\/\//.test(l); }).join("\n"); };
  const GEN = sansCommentaires(lire("js/createConf.js")), UI = lire("js/interfaceConfig.js");
  t("🩸 le Générateur n'a plus de champ taille de pas / seuil / cooldown", !/pl_stepLength|pl_stepThreshold|pl_stepCooldown/.test(GEN));
  t("🩸 le Générateur n'écrit plus ces clés dans le plan-config", !/stepLength\s*:|stepThreshold\s*:|stepCooldown\s*:/.test(GEN));
  for (const F of ["js/sigImport.js", "js/kmzImport.js", "js/gpxImport.js"]) {
    const W = sansCommentaires(lire(F));
    t(F + " n'écrit plus le podomètre dans le plan-config", !/KTA_TRACKING_USINE|stepLength\s*:|stepThreshold\s*:|stepCooldown\s*:/.test(W));
  }
  t("⚙️ Réglages écrit le podomètre en GLOBAL (setGlobalPodometre), plus par plan", /window\.setGlobalPodometre\(\{\s*stepLength/.test(UI) && !/setPlanTracking\(null, \{\s*stepLength/.test(UI));
  t("⚙️ Réglages : Réinitialiser revient à l'USINE de l'app, pas aux valeurs du plan", /KTA_TRACKING_USINE/.test(UI) && /setGlobalPodometre\(\{ stepLength: null/.test(UI));
  // Le badge de portée ne doit pas dire « ce plan » au-dessus d'une section globale
  t("⚙️ Réglages : la section « Détection des pas » porte le badge 🌍 tous les plans, et son groupe est « selon la ligne »",
    /config\.steps\.titre[\s\S]{0,200}kta-cfg-scope-global[\s\S]{0,80}config\.scope\.badgeGlobal/.test(UI) &&
    /_cfgGroupeDebut\("config\.group\.navTracker", "mixte"\)/.test(UI));
  t("le chargeur ne lit plus tracking.stepLength / stepThreshold / stepCooldown", !/tracking\.step(Length|Threshold|Cooldown)\s*\?\?|_reglagePodometre\(/.test(CFG));
  for (const l of ["fr", "en", "es"]) {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    t("🌍 " + l + " : gen.tracking.taillePas/seuil/cooldown retirés, badge de portée présent",
      !d["gen.tracking.taillePas"] && !d["gen.tracking.seuil"] && !d["gen.tracking.cooldown"] && typeof d["config.scope.badgeGlobal"] === "string");
  }
}

console.log("");
if (echecs) { console.log("💥 podomètre global : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 podomètre global : le plan ne dit plus la foulée, un réglage pour tous les plans, migration sans perte");
