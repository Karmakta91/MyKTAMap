#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📐 check-plan-config-borne.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Exécute `js/config.js` en bac à sable sur des plan-configs PIÉGÉS et
// vérifie qu'aucune valeur numérique hors bornes n'entre dans APP_CONFIG.
//
// POURQUOI (retour KARMA, 26/09/2026) : « j'ai pu générer des plans avec des
// valeurs délirantes à l'époque où le générateur laissait régler le tracking
// — sensibilité à 1,2 au lieu de 12. Ces valeurs ne doivent jamais être
// chargées si elles sont hors limite. »
//
// 🩸 LE POINT QUI REND CE SCRIPT NÉCESSAIRE : la règle EXISTAIT, mais pour
// les trois réglages de podomètre seulement (réparés en v1.82.0, plus lus du
// tout depuis v1.96.0). Les valeurs voisines du MÊME bloc `tracking` — et
// `plan.imageWidth`/`imageHeight` — entraient, elles, sans aucun contrôle.
// Or elles cassent plus fort :
//   • `scale: 0`  → on divise par elle : toute distance vaut l'infini ;
//   • `scale: "x"`→ NaN, et tout ce qui en découle ;
//   • `imageWidth: 0` → `convertCoord` et les bounds n'ont plus de sens ;
//   • départ hors du plan → le tracker démarre hors carte.
//
// Le critère n'est pas une opinion : ce que l'écran de saisie REFUSE ne peut
// pas être un choix de l'utilisateur (`setPlanScale` refuse tout ce qui n'est
// pas > 0 ; `cfg_scale` est `strict: true`). Une valeur hors de ces bornes
// est de la donnée corrompue, et retombe sur l'usine.
//
// ⚠️ CE QUI SE VÉRIFIE AUSSI, ET QUI COMPTE AUTANT : une valeur VALIDE doit
// être respectée. Un garde-fou qui écraserait tout par l'usine « réparerait »
// les plans corrects — ce serait pire que le défaut qu'il corrige.
//
// Usage : node scripts/check-plan-config-borne.js
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RACINE = path.resolve(__dirname, "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");

let echecs = 0;
const t = (msg, cond) => { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; };

// ---------- config.js dans un bac à sable ----------
function bac() {
  const mem = {};
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; }
  };
  const win = { addEventListener() {}, localStorage, I18n: { t: (k) => k } };
  const sb = {
    window: win, localStorage,
    console: { log() {}, warn() {}, error() {} },
    navigator: { userAgent: "node" },
    document: { getElementById: () => null, querySelector: () => null,
                querySelectorAll: () => [], addEventListener() {} },
    setTimeout: () => 0, clearTimeout() {},
    URL: { createObjectURL: () => "" },
    fetch: () => Promise.reject(new Error("pas de réseau")),
    Blob: function () {}, File: function () {}, Image: function () {}
  };
  sb.self = sb.window; sb.globalThis = sb;
  try { vm.runInNewContext(lire("js/config.js"), sb, { filename: "config.js" }); }
  catch (e) { return { erreur: e.message, win }; }
  return { win };
}

const b = bac();
t("config.js se charge dans le bac à sable" + (b.erreur ? " — " + b.erreur : ""),
  !b.erreur && typeof b.win.buildAppConfigFromPlan === "function");
if (b.erreur || typeof b.win.buildAppConfigFromPlan !== "function") process.exit(1);

const USINE = b.win.buildAppConfigFromPlan({ plan: {}, tracking: {} });
t("un plan-config vide donne les valeurs d'usine (scale " + USINE.scale + ")",
  Number.isFinite(USINE.scale) && USINE.scale > 0 &&
  Number.isFinite(USINE.imageWidth) && USINE.imageWidth > 0);

// ---------- 1. Les valeurs impossibles retombent sur l'usine ----------
const PIEGES = [
  ["scale nulle",            { tracking: { scale: 0 } },            "scale"],
  ["scale négative",         { tracking: { scale: -4.9 } },         "scale"],
  ["scale non numérique",    { tracking: { scale: "beaucoup" } },   "scale"],
  ["scale absente/nulle",    { tracking: { scale: null } },         "scale"],
  ["largeur nulle",          { plan: { imageWidth: 0 } },           "imageWidth"],
  ["hauteur négative",       { plan: { imageHeight: -100 } },       "imageHeight"],
  ["largeur non numérique",  { plan: { imageWidth: "grand" } },     "imageWidth"],
  ["départ négatif (X)",     { tracking: { startX: -50 } },         "startX"],
  ["départ non numérique",   { tracking: { startY: "ici" } },       "startY"]
];
PIEGES.forEach(function ([nom, piege, cle]) {
  const cfg = b.win.buildAppConfigFromPlan({ plan: piege.plan || {}, tracking: piege.tracking || {} });
  t(nom + " → usine (" + cle + " = " + cfg[cle] + ")", cfg[cle] === USINE[cle]);
});

// ---------- 2. Un départ hors du plan est recentré ----------
{
  const cfg = b.win.buildAppConfigFromPlan({
    plan: { imageWidth: 1000, imageHeight: 800 },
    tracking: { startX: 999999, startY: 5 }
  });
  t("départ hors du plan → recentré (" + cfg.startX + ", " + cfg.startY + ")",
    cfg.startX === 500 && cfg.startY === 400);
}

// ---------- 3. 🩸 Une valeur VALIDE doit être respectée ----------
// Le vrai risque d'un garde-fou comme celui-ci est de « réparer » ce qui
// n'est pas cassé. Ces cas-là comptent autant que les pièges.
{
  const cfg = b.win.buildAppConfigFromPlan({
    plan:     { imageWidth: 16332, imageHeight: 13820 },
    tracking: { scale: 4.073, startX: 9001, startY: 12356 }
  });
  t("un plan valide passe intact (échelle 4.073 conservée)", cfg.scale === 4.073);
  t("…ses dimensions aussi (16332 × 13820)",
    cfg.imageWidth === 16332 && cfg.imageHeight === 13820);
  t("…son départ aussi (9001, 12356)", cfg.startX === 9001 && cfg.startY === 12356);
  t("…et une échelle très petite mais POSITIVE reste (0.01)",
    b.win.buildAppConfigFromPlan({ plan: {}, tracking: { scale: 0.01 } }).scale === 0.01);
}

// ---------- 4. Le podomètre reste hors de portée du plan ----------
// (acquis v1.96.0, vérifié par check-podometre-global.js — on s'assure
// seulement que ce chantier ne l'a pas défait.)
{
  const cfg = b.win.buildAppConfigFromPlan({
    plan: {}, tracking: { stepThreshold: 1.2, stepCooldown: 280, stepLength: 0.75 }
  });
  t("les réglages de podomètre d'un plan restent ignorés",
    cfg.stepThreshold === USINE.stepThreshold &&
    cfg.stepCooldown === USINE.stepCooldown &&
    cfg.stepLength === USINE.stepLength);
}

console.log("");
if (echecs) {
  console.log("🛑 " + echecs + " contrôle(s) en échec — une valeur de plan-config hors bornes");
  console.log("   entre dans APP_CONFIG, ou une valeur valide est écrasée.");
  console.log("   Voir js/config.js > _lireNombrePlan et buildAppConfigFromPlan.");
  process.exit(1);
}
console.log("🎉 plan-config : aucune valeur hors bornes ne se charge, aucune valeur valide n'est écrasée");
process.exit(0);
