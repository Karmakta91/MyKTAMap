#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🧱 checkup-tuiles-hors-ecran.js — checkup de RELEASE
// =====================================================================
// LE TUILAGE V2 POSAIT TOUT LE NIVEAU, MÊME HORS ÉCRAN.
//
// Mesuré le 26/09/2026 sur un relevé de 16332×13820 : 864 overlays posés au
// niveau 0 pour 6 à l'écran, 880 requêtes, ~30 Mo. Une image d'overlay n'est
// demandée qu'au moment où il est posé : depuis le 29/09, seules les tuiles
// proches de l'écran le sont (tiling.js > ktaCullerTuilesV2).
//
// Ce harnais mesure sur le vrai plan, zoomé au niveau le plus fin :
//   1. peu de tuiles posées, et peu de REQUÊTES de tuiles réellement parties ;
//   2. aucun trou : chaque point de l'écran situé dans le plan est couvert par
//      une tuile posée — au départ ET après un déplacement ;
//   3. filtre multi-niveau : niveau 0 masqué → aucune tuile ; ré-affiché →
//      seulement les tuiles proches, pas tout le niveau.
// Falsification : le point 1 échoue sur le code d'avant (tout le niveau posé).
//
// Usage : node scripts/smoke/checkup-tuiles-hors-ecran.js
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
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
    // Requêtes de TUILES réellement émises par le navigateur.
    let requetesTuiles = 0;
    page.on("request", function (r) { if (/\/tiles\/z-?\d+\//.test(r.url())) requetesTuiles++; });
    await page.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.getByText(PLAN.nom, { exact: false }).first().click();
    await attendre(page, function () {
      return !!window.map && !!window._tilingV2State && window._tilingV2State.currentLevel !== null;
    }, 90000);
    await page.waitForTimeout(3000);

    // État : tuiles du niveau, tuiles posées, part de l'écran (dans le plan)
    // qu'aucune tuile posée ne couvre.
    const etat = function () {
      return page.evaluate(function () {
        const st = window._tilingV2State, map = window.map;
        const poses = st.activeOverlays.filter(function (o) { return map.hasLayer(o); });
        const rects = poses.map(function (o) { return o.getBounds(); });
        const H = window.APP_CONFIG.imageHeight, W = window.APP_CONFIG.imageWidth;
        const plan = L.latLngBounds([[0, 0], [H, W]]);
        const s = map.getSize();
        let dansPlan = 0, trous = 0;
        for (let y = 5; y < s.y; y += 25) {
          for (let x = 5; x < s.x; x += 25) {
            const ll = map.containerPointToLatLng([x, y]);
            if (!plan.contains(ll)) continue;
            dansPlan++;
            if (!rects.some(function (b) { return b.contains(ll); })) trous++;
          }
        }
        return { niveau: st.currentLevel, total: st.activeOverlays.length, poses: poses.length,
                 dansPlan: dansPlan, trous: trous };
      });
    };
    const vue = async function (fx, fy, z) {
      await page.evaluate(function (a) {
        const H = window.APP_CONFIG.imageHeight, W = window.APP_CONFIG.imageWidth;
        window.map.setView([H - H * a.fy, W * a.fx], a.z, { animate: false });
      }, { fx: fx, fy: fy, z: z });
      await page.waitForTimeout(1500);
    };

    console.log("— 1 : zoomé au niveau le plus fin —");
    const avantReq = requetesTuiles;
    await vue(0.5, 0.5, 0);
    const e1 = await etat();
    const req1 = requetesTuiles - avantReq;
    inf(JSON.stringify(e1) + " · requêtes de tuiles : " + req1);
    if (e1.total > 50 && e1.poses < e1.total / 4)
      ok("seules les tuiles proches de l'écran sont posées : " + e1.poses + "/" + e1.total);
    else pb("tuiles posées : " + e1.poses + "/" + e1.total + " (tout le niveau ?)");
    if (req1 <= e1.poses + 5) ok("requêtes de tuiles limitées aux tuiles posées (" + req1 + ")");
    else pb(req1 + " requêtes de tuiles pour " + e1.poses + " posées");

    console.log("— 2 : aucun trou, avant et après déplacement —");
    if (e1.dansPlan > 0 && e1.trous === 0) ok("écran entièrement couvert (" + e1.dansPlan + " points testés)");
    else pb(e1.trous + " point(s) de l'écran sans tuile sur " + e1.dansPlan);
    const avantReq2 = requetesTuiles;
    await vue(0.25, 0.7, 0);
    const e2 = await etat();
    inf(JSON.stringify(e2) + " · nouvelles requêtes : " + (requetesTuiles - avantReq2));
    if (e2.dansPlan > 0 && e2.trous === 0 && e2.poses < e2.total / 4)
      ok("après déplacement : écran couvert, toujours " + e2.poses + " tuiles posées");
    else pb("après déplacement : " + JSON.stringify(e2));
    // Petit déplacement (panBy) : doit aussi compléter les bords.
    await page.evaluate(function () { window.map.panBy([300, 200], { animate: false }); });
    await page.waitForTimeout(1500);
    const e2b = await etat();
    if (e2b.trous === 0) ok("après un glissé de 300×200 px : aucun trou");
    else pb("après un glissé : " + e2b.trous + " trou(s)");

    console.log("— 3 : filtre multi-niveau —");
    const f = await page.evaluate(async function () {
      const cfg = window.APP_CONFIG, map = window.map, st = window._tilingV2State;
      const ml = cfg.multiLevel, vl = cfg.visibleLevels;
      cfg.multiLevel = true; cfg.visibleLevels = [1];
      window._applyLevelFilterToBasePlan();
      map.panBy([50, 0], { animate: false });
      await new Promise(function (r) { setTimeout(r, 800); });
      const masque = st.activeOverlays.filter(function (o) { return map.hasLayer(o); }).length;
      cfg.visibleLevels = [0];
      window._applyLevelFilterToBasePlan();
      await new Promise(function (r) { setTimeout(r, 300); });
      const affiche = st.activeOverlays.filter(function (o) { return map.hasLayer(o); }).length;
      cfg.multiLevel = ml; cfg.visibleLevels = vl;
      window._applyLevelFilterToBasePlan();
      return { masque: masque, affiche: affiche, total: st.activeOverlays.length };
    });
    inf(JSON.stringify(f));
    if (f.masque === 0) ok("niveau 0 masqué : aucune tuile posée, même après un déplacement");
    else pb("niveau 0 masqué : " + f.masque + " tuile(s) posée(s)");
    if (f.affiche > 0 && f.affiche < f.total / 4) ok("ré-affiché : seulement les tuiles proches (" + f.affiche + "/" + f.total + ")");
    else pb("ré-affiché : " + f.affiche + "/" + f.total);

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
  console.log("🎉 CHECKUP VERT — seules les tuiles proches de l'écran sont posées et demandées, sans trou.");
  process.exit(0);
})();
