#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-ouvertures-enchainees.js — checkup (Playwright) : ouvertures de plan enchaînées sans erreur de page
// =====================================================================
// Parcours : le relevé fictif est ouvert N fois de suite (OUV_N, défaut 10), en repassant par l'écran de chargement
// entre deux ouvertures et à un moment varié (0 à 1,2 s après que la carte est prête), puis encore N fois sans
// attendre que la carte soit prête. Une minuterie laissée par une carte démontée (vue, zoom, redimensionnement)
// jette `_leaflet_pos` / `_getMapPanePos` : toute erreur de page fait échouer le checkup, pile comprise.
// Usage : node scripts/smoke/checkup-ouvertures-enchainees.js (SMOKE_PORT pour une autre copie)
// Doc : gotchas.md (démonter une carte en plein zoom animé)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const N = parseInt(process.env.OUV_N, 10) || 10;
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) {
    erreurs.push(String(e && e.message) + " | " + String((e && e.stack) || "").split("\n").slice(1, 6).join(" < "));
  });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () {
      return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
        window.PlanRegistry.getAll().some(function (p) { return /fictif/i.test(p.name || ""); });
    }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

    async function ouvrir() {
      await page.evaluate(function () {
        const p = window.PlanRegistry.getAll().find(function (x) { return /fictif/i.test(x.name || ""); });
        window.__ouv = { fini: false, erreur: null };
        Promise.resolve().then(function () { return window.chargerPlanDuRegistre(p.id); })
          .then(function () { window.__ouv.fini = true; }, function (e) { window.__ouv.fini = true; window.__ouv.erreur = String(e); });
      });
    }
    const pret = function () { return !!(window.__ouv && window.__ouv.fini && window.PLAN_CONFIG && window.map); };

    let ouverts = 0;
    for (let i = 0; i < N; i++) {
      const avant = erreurs.length;
      await ouvrir();
      try { await attendre(page, pret, 40000, 50); ouverts++; } catch (e) { pb("ouverture " + i + " : carte pas prête en 40 s"); }
      await page.waitForTimeout((i * 137) % 1200);
      await page.evaluate(function () { if (typeof window.afficherLoader === "function") window.afficherLoader(); });
      await page.waitForTimeout(200);
      if (erreurs.length > avant) console.log("  ⏳ ouverture " + i + " : " + erreurs.slice(avant).join(" || "));
    }
    verifier(ouverts === N, "carte prête à chaque ouverture (" + ouverts + "/" + N + ")");

    // Sans attendre la carte : une ouverture chasse la précédente en plein chargement.
    for (let i = 0; i < N; i++) {
      await ouvrir();
      await page.waitForTimeout(80 + (i * 97) % 700);
    }
    await attendre(page, pret, 40000, 100).catch(function () { pb("dernière ouverture rapide : carte pas prête"); });
    await page.waitForTimeout(2500);
    verifier(!!(await page.evaluate(function () { return window.map && window.map._loaded && !!window.map._mapPane; })),
      "la dernière carte est vivante après les ouvertures rapides");
    verifier(erreurs.length === 0, "aucune erreur de page sur " + (2 * N) + " ouvertures", erreurs.slice(0, 4));
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
  console.log("🎉 CHECKUP VERT — ouvertures enchaînées du relevé fictif sans erreur de page.");
  process.exit(0);
})();
