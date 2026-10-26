#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-osm-taille-icones.js — « 📐 Adapter la taille des icônes au zoom » sur les deux cartes OSM
// =====================================================================
// Le relevé fictif n'est ni tuilé ni calé : le checkup lui prête un tuilage V2 et un calage fictif en mer
// (comme checkup-osm-empilement.js), plus 1 500 POI synthétiques pour mesurer le coût du zoom.
//   1. Vue OSM, réglage actif : taille de l'icône = base × clamp(px écran par px de plan, 0,5, 2), mesurée à
//      deux zooms (différente) et au plancher ; réglage coupé : taille de base à tous les zooms ; bascule à
//      chaud par window.ktaMajTailleIconesOsm (sans rouvrir).
//   2. Temps de zoom (animé et sans animation) de la Vue OSM, réglage actif puis coupé, 1 500+ marqueurs.
//   3. Carte OSM de l'accueil : mêmes contrôles sur le pane du plan principal.
// Usage : node scripts/smoke/checkup-osm-taille-icones.js   (SMOKE_PORT pour une copie de travail)
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1"
};
const PNG_TUILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4xrAFAANqAZsvHqYeAAAAAElFTkSuQmCC";
// Calage fictif : 2e-6 degré par pixel de plan (≈ 0,22 m à l'équateur) ; l'échelle 1 tombe vers le zoom 19,4.
const DEG_PAR_PX = 2e-6;
const N_POI_SYNTH = 1500;
// Plancher des cartes OSM (map.js > KTA_ECHELLE_PLANCHER_OSM) ; le mode plan garde 0,25.
const PLANCHER_OSM = 0.5;
// Allers-retours de zoom mesurés (4 crans chacun) ; OSM_PAS=6 pour une mesure moins bruitée.
const N_PAS = parseInt(process.env.OSM_PAS, 10) || 2;

function planFictif() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const p = ((idx && idx.plans) || []).find(function (x) { return /fictif/i.test(x.name || ""); });
    return p ? p.name : null;
  } catch (e) { return null; }
}

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }

// Dans la page : taille rendue (px CSS) des icônes POI d'un conteneur, et l'échelle attendue par la loi.
function mesurer(arg) {
  const m = window[arg.carte];
  const racine = arg.pane ? m.getPane(arg.pane) : m.getPane("markerPane");
  if (!racine) return null;
  const r = m.getContainer().getBoundingClientRect();
  const tailles = [];
  racine.querySelectorAll(".leaflet-marker-icon").forEach(function (mk) {
    const img = mk.tagName === "IMG" ? mk : mk.querySelector("img");
    if (!img) return;
    const bb = img.getBoundingClientRect();
    if (bb.right < r.left || bb.left > r.right || bb.bottom < r.top || bb.top > r.bottom) return;
    tailles.push(Math.round(bb.width * 10) / 10);
  });
  tailles.sort(function (a, b) { return a - b; });
  // loi attendue : pixels écran par pixel de plan, calage fictif (1 px de plan = DEG_PAR_PX en lat et lng)
  const c = m.getCenter(), z = m.getZoom();
  const p0 = m.project(c, z), p1 = m.project(L.latLng(c.lat, c.lng + arg.deg), z);
  const pxParPxPlan = p0.distanceTo(p1);
  return { zoom: z, n: tailles.length, mediane: tailles.length ? tailles[tailles.length >> 1] : null,
           min: tailles[0], max: tailles[tailles.length - 1], pxParPxPlan: pxParPxPlan };
}

// Zoom sans animation ; `pane` : recentré sur un POI de ce pane (le widget de l'accueil est petit).
async function zoomer(page, carte, z, pane) {
  await page.evaluate(function (a) {
    const m = window[a.carte];
    let ll = null;
    if (a.pane) m.eachLayer(function (l) { if (!ll && l instanceof L.Marker && l.options.pane === a.pane) ll = l.getLatLng(); });
    if (ll) m.setView(ll, a.z, { animate: false }); else m.setZoom(a.z, { animate: false });
  }, { carte: carte, z: z, pane: pane || null });
  await page.waitForTimeout(400);
}

// Vérifie une mesure contre la loi (réglage actif) ou la taille de base (réglage coupé).
function controler(lib, s, base, actif) {
  if (!s || !s.n) { pb(lib + " : aucune icône visible"); return; }
  const attendu = actif ? base * Math.max(PLANCHER_OSM, Math.min(2, s.pxParPxPlan)) : base;
  const msg = lib + " (zoom " + s.zoom + ") : " + s.n + " icône(s), " + s.min + "–" + s.max + " px, attendu " +
              (Math.round(attendu * 10) / 10) + " px";
  if (Math.abs(s.min - attendu) > 1 || Math.abs(s.max - attendu) > 1) pb(msg);
  else ok(msg);
}

function mediane(t) { const s = t.slice().sort(function (a, b) { return a - b; }); return s[s.length >> 1]; }

// Temps de zoom de la Vue OSM : du setZoom au deuxième rendu après zoomend.
async function tempsZoom(page, anime) {
  return page.evaluate(async function (a) {
    const anim = a.anime, n = a.n;
    const m = window.__ktaOsmCarte;
    const out = [];
    const pas = [];
    for (let i = 0; i < n; i++) pas.push(1, 1, -1, -1);
    for (const d of pas) {
      const t = await new Promise(function (res) {
        const t0 = performance.now();
        m.once("zoomend", function () {
          requestAnimationFrame(function () { requestAnimationFrame(function () { res(performance.now() - t0); }); });
        });
        m.setZoom(m.getZoom() + d, { animate: anim });
      });
      out.push(Math.round(t * 10) / 10);
      await new Promise(function (r) { setTimeout(r, 250); });
    }
    return out;
  }, { anime: anime, n: N_PAS });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const erreurs = [];
  try {
    const nom = planFictif();
    if (!nom) { pb("relevé fictif absent de data/index.json"); return; }
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 } });
    const page = await ctx.newPage();
    page.on("pageerror", function (e) { erreurs.push(String(e)); });
    await page.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
      const iv = setInterval(function () {
        if (!window.L || !L.Map) return;
        clearInterval(iv);
        L.Map.addInitHook(function () {
          const id = this.getContainer().id;
          if (id === "kta-osm-map") window.__ktaOsmCarte = this;
          if (id === "ktaOsmHomeMap") window.__ktaOsmAccueil = this;
        });
      }, 5);
    }, LS_PREGATES);

    // ── 3 d'abord : carte de l'accueil (avant d'ouvrir un plan) ──
    console.log("— carte OSM de l'accueil —");
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    const idFictif = await page.evaluate(function (a) {
      const p = (window.PlanRegistry.getAll() || []).find(function (x) {
        return /fictif/i.test((x.name || "") + " " + (window.PlanRegistry.displayName ? window.PlanRegistry.displayName(x) : ""));
      });
      if (!p) return null;
      window.KmzExport.setCalibration(p.id, {
        pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
        pointB: { x: 1000, y: 1000, lat: 0.004 - 1000 * a.deg, lng: 0.001 + 1000 * a.deg }
      });
      window.OsmHomePreview.refresh();
      return p.id;
    }, { deg: DEG_PAR_PX });
    if (!idFictif) pb("accueil : relevé fictif absent du registre");
    else {
      const paneAccueil = "ktaOsmPlan_" + String(idFictif).replace(/[^a-zA-Z0-9_-]/g, "_");
      try {
        await attendre(page, function () {
          return !!window.__ktaOsmAccueil &&
                 document.querySelectorAll("#ktaOsmHomeMap .leaflet-marker-icon").length > 3;
        }, 30000);
      } catch (e) { pb("accueil : aucune icône POI rendue (" + e.message + ")"); }
      const argA = { carte: "__ktaOsmAccueil", pane: paneAccueil, deg: DEG_PAR_PX };
      const resultats = {};
      for (const z of [16, 17, 18, 19]) {
        await zoomer(page, "__ktaOsmAccueil", z, paneAccueil);
        resultats[z] = await page.evaluate(mesurer, argA);
        controler("accueil, réglage actif", resultats[z], 24, true);
      }
      if (resultats[18] && resultats[19] && resultats[18].mediane === resultats[19].mediane) {
        pb("accueil : même taille aux zooms 18 et 19 avec le réglage actif");
      }
      await page.evaluate(function () { window.APP_CONFIG.scaledMarkers = false; window.ktaMajTailleIconesOsm && window.ktaMajTailleIconesOsm(); });
      for (const z of [17, 19]) {
        await zoomer(page, "__ktaOsmAccueil", z, paneAccueil);
        controler("accueil, réglage coupé", await page.evaluate(mesurer, argA), 24, false);
      }
      await page.evaluate(function () { window.APP_CONFIG.scaledMarkers = true; window.ktaMajTailleIconesOsm && window.ktaMajTailleIconesOsm(); });
      controler("accueil, réglage rallumé à chaud", await page.evaluate(mesurer, argA), 24, true);
    }

    // ── 1 : Vue OSM ──
    console.log("— Vue OSM —");
    await page.getByText(nom, { exact: false }).first().click();
    await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
    await page.waitForTimeout(2000);
    const prep = await page.evaluate(function (a) {
      const pc = window.PLAN_CONFIG, p = pc.plan;
      const W = p.imageWidth || (window.APP_CONFIG && window.APP_CONFIG.imageWidth);
      const H = p.imageHeight || (window.APP_CONFIG && window.APP_CONFIG.imageHeight);
      p.imageWidth = W; p.imageHeight = H;
      p.tiledV2 = true;
      pc.tiling = { minNativeZoom: -3, maxNativeZoom: 0, tileSize: 256, format: "png" };
      const ext = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(pc.tiling) : "jpg";
      window.RUNTIME_ASSETS = window.RUNTIME_ASSETS || {};
      for (let z = -3; z <= 0; z++) {
        const sc = Math.pow(2, -z);
        const cols = Math.ceil(Math.ceil(W / sc) / 256), rows = Math.ceil(Math.ceil(H / sc) / 256);
        for (let c = 0; c < cols; c++) for (let k = 1; k <= rows; k++) {
          window.RUNTIME_ASSETS["data/tiles/z" + z + "/x" + c + "_y" + (-k) + "." + ext] = { url: a.png + "#z" + z };
        }
      }
      p.georef = { pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
                   pointB: { x: W, y: H, lat: 0.004 - H * a.deg, lng: 0.001 + W * a.deg } };
      // POI synthétiques : copies des POI du relevé (mêmes tags donc mêmes icônes), répartis sur le plan
      const orig = window.getAllEmbeddedPoints;
      const reels = (orig() || []).filter(function (q) { return q && typeof q.x === "number"; });
      const synth = [];
      for (let i = 0; i < a.n && reels.length; i++) {
        const s = reels[i % reels.length];
        synth.push(Object.assign({}, s, { x: (i * 7919) % W, y: (i * 104729) % H, nom: "synthétique " + i }));
      }
      window.getAllEmbeddedPoints = function () { return reels.concat(synth); };
      return { W: W, H: H, nPoi: reels.length + synth.length };
    }, { png: PNG_TUILE, deg: DEG_PAR_PX, n: N_POI_SYNTH });
    inf("plan " + prep.W + "×" + prep.H + " px, " + prep.nPoi + " POI (dont " + N_POI_SYNTH + " synthétiques)");

    await page.evaluate(function () { window.APP_CONFIG.scaledMarkers = true; window.OsmView.open(); });
    await attendre(page, function () {
      return !!window.__ktaOsmCarte && document.querySelectorAll("#kta-osm-map .leaflet-marker-icon").length > 100;
    }, 30000);
    await page.waitForTimeout(1500);
    const nMarq = await page.evaluate(function () { return document.querySelectorAll("#kta-osm-map .leaflet-marker-icon").length; });
    inf(nMarq + " marqueur(s) dans la Vue OSM");
    const argV = { carte: "__ktaOsmCarte", pane: null, deg: DEG_PAR_PX };
    const res = {};
    for (const z of [16, 17, 18, 19]) {
      await zoomer(page, "__ktaOsmCarte", z);
      res[z] = await page.evaluate(mesurer, argV);
      controler("Vue OSM, réglage actif", res[z], 26, true);
    }
    if (res[18] && res[19] && res[18].mediane === res[19].mediane) pb("Vue OSM : même taille aux zooms 18 et 19 avec le réglage actif");
    // le mode plan garde sa propre échelle (variable du body) : la Vue OSM ne doit pas l'écraser
    const corps = await page.evaluate(function () { return document.body.style.getPropertyValue("--kta-marker-scale"); });
    inf("échelle du mode plan pendant la Vue OSM : " + corps);

    console.log("— temps de zoom, " + nMarq + " marqueurs —");
    await zoomer(page, "__ktaOsmCarte", 17);
    const actifAnime = await tempsZoom(page, true), actifSec = await tempsZoom(page, false);
    await page.evaluate(function () { window.APP_CONFIG.scaledMarkers = false; window.ktaMajTailleIconesOsm && window.ktaMajTailleIconesOsm(); });
    const coupeAnime = await tempsZoom(page, true), coupeSec = await tempsZoom(page, false);
    const moy = function (t) { return Math.round(t.reduce(function (x, y) { return x + y; }, 0) / t.length * 10) / 10; };
    const ligne = function (lib, an, sec) {
      inf(lib + " : animé médiane " + mediane(an) + " ms (moyenne " + moy(an) + ") · sans animation médiane " +
          mediane(sec) + " ms (moyenne " + moy(sec) + "), " + an.length + " crans chacun");
    };
    ligne("réglage actif", actifAnime, actifSec);
    ligne("réglage coupé", coupeAnime, coupeSec);

    console.log("— Vue OSM, réglage coupé —");
    for (const z of [17, 19]) {
      await zoomer(page, "__ktaOsmCarte", z);
      controler("Vue OSM, réglage coupé", await page.evaluate(mesurer, argV), 26, false);
    }
    // réouverture réglage coupé : taille de base dès l'ouverture
    await page.click("#kta-osm-close"); await page.waitForTimeout(600);
    await page.evaluate(function () { window.OsmView.open(); });
    await attendre(page, function () { return document.querySelectorAll("#kta-osm-map .leaflet-marker-icon").length > 100; }, 30000);
    await page.waitForTimeout(1200);
    await zoomer(page, "__ktaOsmCarte", 18);
    controler("Vue OSM rouverte, réglage coupé", await page.evaluate(mesurer, argV), 26, false);
    await page.evaluate(function () { window.APP_CONFIG.scaledMarkers = true; window.ktaMajTailleIconesOsm && window.ktaMajTailleIconesOsm(); });
    controler("Vue OSM, réglage rallumé à chaud", await page.evaluate(mesurer, argV), 26, true);
    await page.click("#kta-osm-close"); await page.waitForTimeout(600);
    const corpsApres = await page.evaluate(function () { return document.body.style.getPropertyValue("--kta-marker-scale"); });
    if (corpsApres !== corps) pb("échelle du mode plan changée par la Vue OSM : " + corps + " → " + corpsApres);
    else ok("échelle du mode plan intacte après la Vue OSM (" + corpsApres + ")");

    await ctx.close();
    if (erreurs.length) pb("erreurs de page : " + erreurs.slice(0, 3).join(" | "));
  } catch (e) {
    pb("exception : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
    console.log(problemes.length ? "\n❌ " + problemes.length + " problème(s)" : "\n✅ OSM : taille des icônes au zoom");
    process.exit(problemes.length ? 1 : 0);
  }
})();
