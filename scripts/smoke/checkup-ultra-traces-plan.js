#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🚀 checkup-ultra-traces-plan.js — checkup de RELEASE
// =====================================================================
// DEUX RÉGLAGES ULTRA NE FAISAIENT RIEN SUR LES TRACÉS D'UN PLAN.
//
// « Ne rendre que ce qui est à l'écran » (viewportCull) et « Simplifier les
// tracés au dézoom » (decim) ne parcouraient que `roadsData` de road.js — les
// annotations de l'utilisateur. Les tracés d'un plan sont créés par utils.js
// (calques de données) et n'y entrent jamais. Mesuré le 26/09/2026 sur un
// relevé de 912 tracés, cull ON à z=0 : 895 polylines sur la carte, 38 dans
// l'écran.
//
// Ce harnais mesure, sur le vrai plan, ce qui est RÉELLEMENT sur la carte
// (`polyline._map`), pas ce que le code croit avoir fait :
//   1. réglages coupés : tous les tracés du plan sont sur la carte ;
//   2. viewportCull : seuls ceux qui touchent l'écran y restent, et un
//      déplacement fait entrer les nouveaux ;
//   3. un calque DÉCOCHÉ reste décoché (le réglage ne le rallume pas) ;
//   4. decim au dézoom : moins de sommets dessinés, `entry.points` intact ;
//      rezoomé, la géométrie complète revient ;
//   5. réglages recoupés : tout revient.
// Falsification : le passage 2 échoue sur le code d'avant le 29/09 (tous
// les tracés restent sur la carte).
//
// Usage : node scripts/smoke/checkup-ultra-traces-plan.js
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:8123";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) { return { nom: "Relevé fictif de test", fictif: true }; }
}
const PLAN = planAOuvrir();

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }

(async function main() {
  let nav;
  try { nav = await chromium.launch(); }
  catch (e) {
    if (!/Executable doesn't exist/i.test(String((e && e.message) || ""))) throw e;
    nav = await chromium.launch({ channel: "chromium" });
  }
  const erreurs = [];
  try {
    if (!PLAN.fictif) inf("⚠️ le relevé fictif n'est pas dans data/index.json — checkup sur « " + PLAN.nom + " »");
    const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
    page.on("pageerror", function (e) { erreurs.push(String(e)); });
    await page.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.getByText(PLAN.nom, { exact: false }).first().click();
    await page.waitForFunction(function () {
      return !!window.map && Array.isArray(window._ktaDataPolylines) && window._ktaDataPolylines.length > 20;
    }, null, { timeout: 90000 });
    await page.waitForTimeout(3000);

    // Mesures faites DANS la page : ce qui est sur la carte, pas ce qu'on croit.
    const mesurer = function () {
      return page.evaluate(function () {
        const L0 = window._ktaDataPolylines.filter(function (e) { return e && e.polyline && Array.isArray(e.points); });
        const b = window.map.getBounds();
        const H = window.APP_CONFIG.imageHeight;
        let surCarte = 0, dansEcran = 0, sommetsDessines = 0, sommetsSource = 0, horsEcranSurCarte = 0;
        L0.forEach(function (e) {
          const on = !!e.polyline._map;
          if (on) surCarte++;
          const pts = e.points;
          const touche = pts.some(function (p) { return b.contains([H - p.y, p.x]); });
          if (touche) dansEcran++;
          if (touche && !on && e.polyline.options.opacity !== 0) horsEcranSurCarte--; // visible attendu mais absent
          sommetsDessines += e.polyline.getLatLngs().length;
          sommetsSource += pts.length;
        });
        return { total: L0.length, surCarte: surCarte, dansEcran: dansEcran, manquants: -horsEcranSurCarte,
                 sommetsDessines: sommetsDessines, sommetsSource: sommetsSource, zoom: window.map.getZoom() };
      });
    };
    const regler = function (k, v) {
      return page.evaluate(function (a) { window.PerfUltra.set(a.k, a.v); }, { k: k, v: v });
    };
    const vue = async function (fx, fy, z) {
      await page.evaluate(function (a) {
        const H = window.APP_CONFIG.imageHeight, W = window.APP_CONFIG.imageWidth;
        window.map.setView([H - H * a.fy, W * a.fx], a.z, { animate: false });
      }, { fx: fx, fy: fy, z: z });
      await page.waitForTimeout(700);
    };

    console.log("— 1 : réglages coupés —");
    await regler("viewportCull", false); await regler("decim", false);
    await vue(0.5, 0.5, 0);
    const m1 = await mesurer();
    inf(JSON.stringify(m1));
    if (m1.surCarte === m1.total) ok("tous les tracés du plan sont sur la carte (" + m1.total + ")");
    else pb("réglages coupés, " + m1.surCarte + "/" + m1.total + " tracés sur la carte");

    console.log("— 2 : viewportCull —");
    await regler("viewportCull", true);
    await page.waitForTimeout(400);
    const m2 = await mesurer();
    inf(JSON.stringify(m2));
    if (m2.surCarte < m1.total && m2.surCarte >= m2.dansEcran)
      ok("seuls les tracés proches de l'écran restent : " + m2.surCarte + "/" + m2.total +
         " (dont " + m2.dansEcran + " dans l'écran strict)");
    else pb("viewportCull sans effet sur les tracés du plan : " + m2.surCarte + "/" + m2.total);
    if (m2.manquants === 0) ok("aucun tracé visible dans l'écran n'a été retiré");
    else pb(m2.manquants + " tracé(s) de l'écran retiré(s) à tort");
    // Se poser sur un tracé RÉEL, loin de la première vue (une zone vide ne
    // prouverait rien : 0 tracé attendu, 0 trouvé).
    await page.evaluate(async function () {
      const H = window.APP_CONFIG.imageHeight;
      const c0 = window.map.getCenter();
      let loin = null, dMax = -1;
      window._ktaDataPolylines.forEach(function (e) {
        if (!e || !Array.isArray(e.points) || !e.points.length) return;
        const p = e.points[Math.floor(e.points.length / 2)];
        const d = Math.hypot(p.x - c0.lng, (H - p.y) - c0.lat);
        if (d > dMax) { dMax = d; loin = p; }
      });
      window.map.setView([H - loin.y, loin.x], 0, { animate: false });
      await new Promise(function (r) { setTimeout(r, 700); });
    });
    const m2b = await mesurer();
    inf(JSON.stringify(m2b));
    if (m2b.dansEcran > 0 && m2b.manquants === 0 && m2b.surCarte < m2b.total)
      ok("après déplacement, les tracés du nouvel écran sont là (" + m2b.dansEcran + ") et le reste retiré");
    else pb("après déplacement : " + JSON.stringify(m2b));

    console.log("— 3 : un calque décoché reste décoché —");
    const c = await page.evaluate(async function () {
      const e = window._ktaDataPolylines.find(function (x) { return x && x.groupe && Array.isArray(x.points); });
      const g = e.groupe;
      window.map.removeLayer(g);
      window.map.setView(window.map.getCenter(), window.map.getZoom() - 1, { animate: false });
      await new Promise(function (r) { setTimeout(r, 700); });
      const dessines = window._ktaDataPolylines.filter(function (x) { return x.groupe === g && x.polyline._map; }).length;
      window.map.addLayer(g);
      return dessines;
    });
    if (c === 0) ok("calque décoché : aucun de ses tracés ne revient sur la carte");
    else pb("calque décoché : " + c + " tracé(s) ramené(s) sur la carte par le réglage");

    console.log("— 4 : decim au dézoom —");
    await regler("viewportCull", false);
    await regler("decim", true);
    await vue(0.5, 0.5, -3);
    const m4 = await mesurer();
    inf(JSON.stringify(m4));
    if (m4.sommetsDessines < m4.sommetsSource)
      ok("dézoomé : " + m4.sommetsDessines + " sommets dessinés pour " + m4.sommetsSource + " dans la source");
    else pb("decim sans effet : " + m4.sommetsDessines + " / " + m4.sommetsSource);
    await vue(0.5, 0.5, 0);
    const m4b = await mesurer();
    if (m4b.sommetsDessines === m4b.sommetsSource && m4b.sommetsSource === m4.sommetsSource)
      ok("rezoomé : géométrie complète revenue, source intacte (" + m4b.sommetsSource + ")");
    else pb("rezoomé : " + m4b.sommetsDessines + " / " + m4b.sommetsSource + " (avant : " + m4.sommetsSource + ")");

    console.log("— 5 : tout recoupé —");
    await regler("decim", false);
    await vue(0.2, 0.2, -3);
    const m5 = await mesurer();
    if (m5.surCarte === m5.total && m5.sommetsDessines === m5.sommetsSource)
      ok("réglages coupés : tous les tracés, géométrie complète");
    else pb("après coupure : " + JSON.stringify(m5));

    if (erreurs.length === 0) ok("aucune erreur JS");
    else pb("erreurs JS : " + erreurs.join(" | "));
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }

  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — les réglages ULTRA agissent sur les tracés du plan, et se défont proprement.");
  process.exit(0);
})();
