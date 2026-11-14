#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-plan-sol-portee.js — checkup (Playwright) : le plan au sol de la vue 3D suit le cadrage, pas la portée
// =====================================================================
// Vue d'édition, plan au sol allumé, zoomé de près : case 🛡️ « Limiter la portée » cochée, puis décochée (« Tout le
// plan ») au MÊME recul. La texture du plan au sol doit couvrir la même emprise (px de texture par mètre identiques)
// et, sur un plan tuilé V2, être peinte au même niveau de tuiles. Sur le relevé fictif puis sur un plan V2 FICTIF
// fabriqué par le test (planV2Fictif.js, 16 384 × 10 240 px à 5 px/m : ~3,8 km de diagonale, rien sur disque).
// 🩸 Falsifié : avec l'emprise tirée de la portée (vue3d.js > _rayonVue au lieu de _rayonPlanSol), 20 → 0,8 px/m sur
// le relevé fictif, niveau de tuiles plus grossier sur le plan V2.
// Usage : node scripts/smoke/checkup-plan-sol-portee.js (SMOKE_PORT pour une autre copie ; KTA_CAPTURES=<dossier>
// hors dépôt pour les captures cochée / décochée)
// Doc : vue3d.js > _rayonPlanSol (⚠️ contrat)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const { servirPlanV2Fictif } = require("./planV2Fictif.js");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const CAPTURES = process.env.KTA_CAPTURES || null;
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }
function verifier(c, m, d) { if (c) ok(m); else pb(m + (d !== undefined ? " " + JSON.stringify(d) : "")); }

// Plan au sol lu après sa (re)peinture : attend une texture faite à cette emprise.
async function lirePlanSol(page, nomCapture) {
  await attendre(page, function () {
    const s = (window.KtaVue3D.etat().dessin || {}).planSol;
    return !!(s && s.px && s.ok);
  }, 30000);
  await page.waitForTimeout(1500);
  if (CAPTURES) await page.screenshot({ path: path.join(CAPTURES, nomCapture + ".png") });
  return page.evaluate(function () {
    const e = window.KtaVue3D.etat(), s = e.dessin.planSol;
    return { limitee: e.portee.limitee, distance: e.portee.distance, recul: +(+e.portee.recul).toFixed(1),
      px: s.px, cote: s.cote, pxParM: +(s.px / s.cote).toFixed(2), v2: s.v2, z: s.z };
  });
}

async function scenario(page, nom, depart) {
  console.log("— " + nom + " —");
  await page.evaluate(async function (d) {
    if (!window.KtaVue3D) await window.ktaChargerVue3D();
    const K = window.KtaVue3D;
    K.gesteAnime(false);
    window.setVue3DLimiterPortee(true); window.setVue3DPorteeTout(false); window.setVue3DPortee(30);
    await K.ouvrir({ depart: d, commandes: "pave" });
    if (K.etat().vue !== "plongee") K.basculerVue();
    for (let i = 0; i < 4; i++) K.zoomer(0.7);
    const b = document.querySelector('[data-v3d="planSol"]');
    if (b && b.getAttribute("aria-pressed") !== "true") b.click();
  }, depart);
  const avant = await lirePlanSol(page, nom + "-1-cochee");
  inf("cochée : " + JSON.stringify(avant));
  await page.evaluate(async function () {
    const K = window.KtaVue3D;
    await K.limiterPortee(false, { confirme: true });
    K.reglerPortee("tout");
  });
  await attendre(page, function () {
    const e = window.KtaVue3D.etat();
    return e.portee.limitee === false && !(e.portee.tuiles.manquantes);
  }, 60000);
  const apres = await lirePlanSol(page, nom + "-2-decochee");
  inf("décochée : " + JSON.stringify(apres));
  verifier(apres.limitee === false && apres.distance > avant.distance,
    nom + " : case décochée, portée « Tout le plan » (" + avant.distance + " → " + apres.distance + " m)");
  verifier(apres.recul === avant.recul, nom + " : même recul (" + avant.recul + " m)");
  verifier(apres.cote === avant.cote && apres.pxParM === avant.pxParM,
    nom + " : plan au sol aussi net cochée et décochée (" + avant.pxParM + " px/m)", { avant: avant, apres: apres });
  verifier(avant.pxParM >= 10, nom + " : plan au sol lisible de près (≥ 10 px/m)", avant.pxParM);
  if (avant.v2 || apres.v2) {
    verifier(apres.v2 && apres.z === avant.z && Number.isInteger(avant.z),
      nom + " : même niveau de tuiles V2 (z = " + avant.z + ")", { avant: avant.z, apres: apres.z });
  }
  await page.evaluate(async function () {
    const K = window.KtaVue3D;
    await K.fermer();
    window.setVue3DLimiterPortee(true); window.setVue3DPorteeTout(false); window.setVue3DPortee(30);
  });
}

(async function main() {
  if (CAPTURES) fs.mkdirSync(CAPTURES, { recursive: true });
  const nav = await lancerNavigateur(chromium);
  const erreurs = [];
  try {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 850 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
    await page.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    const v2 = await servirPlanV2Fictif(page, { scale: 5, nom: "Plan V2 fictif (plan au sol)" });
    const ouvrirPlan = async function (nom) {
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
      await page.getByText(nom, { exact: false }).first().click();
      await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.APP_CONFIG.scale; }, 90000);
      await page.waitForTimeout(3000);
      await page.evaluate(function () {
        const m = document.getElementById("kta-session-modal");
        if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
      });
    };
    await ouvrirPlan("Relevé fictif de test");
    await scenario(page, "relevé fictif", { x: 1606, y: 1450, cap: 188 });
    await ouvrirPlan(v2.nom);
    await scenario(page, "plan V2 fictif", { x: v2.config.plan.imageWidth / 2, y: v2.config.plan.imageHeight / 2, cap: 0 });
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — plan au sol de la vue 3D aussi net, case 🛡️ cochée ou décochée, au même cadrage.");
  process.exit(0);
})();
