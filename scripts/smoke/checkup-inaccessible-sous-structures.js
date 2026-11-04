#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-inaccessible-sous-structures.js — checkup (Playwright, pas un hook pré-commit) : empilement des zones
// sous les structures, hachures de l'inaccessible sur le canvas commun
// =====================================================================
// Plan FABRIQUÉ dans la page (image unie, ZIP en mémoire, rien dans data/), un calque de données et la session
// portant chacun une zone inaccessible, une zone eau et un pilier posé dessus. Lecture du PIXEL au centre de
// chaque pilier, sur le canvas des vecteurs : jaune du pilier = structure au-dessus, rouge sombre = zone dessus.
// Après le chargement, après une édition de zone (setZones), un rendu de zones seul, un ⏪, un changement de
// filtre. Hachures : deux pixels de la zone diffèrent (rayure / fond). Clic réel de souris sur l'inaccessible :
// sa fiche s'ouvre.
// Usage : node scripts/smoke/checkup-inaccessible-sous-structures.js (SMOKE_PORT pour une autre copie)
// Doc : docs/architecture/rendering-leaflet.md · multilevel-pathfinding.md §31.1
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Centres (coordonnées du plan) : inaccessible + pilier, eau + pilier, côté calque (gauche) et session (droite).
const SITES = {
  calqueInacc: [250, 250], calqueEau: [250, 550],
  sessionInacc: [750, 250], sessionEau: [750, 550]
};

async function chargerPlan(page) {
  await page.evaluate(async function (S) {
    const W = 1000, H = 800;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
    const png = await new Promise(function (r) { c.toBlob(r, "image/png"); });
    const carre = function (p, r) {
      return [{ x: p[0] - r, y: p[1] - r }, { x: p[0] + r, y: p[1] - r }, { x: p[0] + r, y: p[1] + r }, { x: p[0] - r, y: p[1] + r }];
    };
    const zip = new JSZip();
    zip.file("fond.png", png);
    zip.file("calque.json", JSON.stringify({ data: [], roads: [],
      structures: [{ uid: "st_c1", type: "pilier-1", points: carre(S.calqueInacc, 25) },
                   { uid: "st_c2", type: "pilier-1", points: carre(S.calqueEau, 25) }],
      zones: [{ uid: "zn_ci", type: "inaccessible", points: carre(S.calqueInacc, 110), description: "calque" },
              { uid: "zn_ce", type: "eau", points: carre(S.calqueEau, 110) }] }));
    zip.file("plan-config.json", JSON.stringify({
      plan: { name: "Plan fictif empilement", version: "T1", imageWidth: W, imageHeight: H, baseImage: "fond.png" },
      dataLayers: [{ id: "calque", label: "Calque", file: "calque.json", visible: true }],
      tracking: { startX: 500, startY: 400, scale: 4 }, iconsEmbarquees: []
    }));
    const blob = await zip.generateAsync({ type: "blob" });
    await window.chargerZipFichier(new File([blob], "fictif-empilement.zip", { type: "application/zip" }), "auto",
      { storeBlob: false });
  }, SITES);
  await attendre(page, function () {
    return !!window.map && !!window.setZones && !!window.setStructures && (window._ktaDataPolygons || []).length === 2;
  }, 30000);
  await page.waitForTimeout(2000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) k.click(); else m.remove(); }
  });
}

function semerSession(page) {
  return page.evaluate(function (S) {
    const carre = function (p, r) {
      return [{ x: p[0] - r, y: p[1] - r }, { x: p[0] + r, y: p[1] - r }, { x: p[0] + r, y: p[1] + r }, { x: p[0] - r, y: p[1] + r }];
    };
    window.setZones([{ uid: "zn_si", type: "inaccessible", points: carre(S.sessionInacc, 110) },
                     { uid: "zn_se", type: "eau", points: carre(S.sessionEau, 110) }]);
    window.setStructures([{ uid: "st_s1", type: "pilier-1", points: carre(S.sessionInacc, 25) },
                          { uid: "st_s2", type: "pilier-1", points: carre(S.sessionEau, 25) }]);
    window.HistoryManager.reset();
    window.map.fitBounds([[0, 0], [800, 1000]]);
  }, SITES);
}

// Pixel du canvas des vecteurs au point (x, y) du plan : { r, g, b, a }.
function pixels(page, points) {
  return page.evaluate(function (pts) {
    const rd = window.map._renderer;
    const ctx = rd._ctx, dpr = window.devicePixelRatio || 1, min = rd._bounds.min;
    const out = {};
    Object.keys(pts).forEach(function (k) {
      const lp = window.map.latLngToLayerPoint(window.convertCoord(pts[k][0], pts[k][1]));
      const d = ctx.getImageData(Math.round((lp.x - min.x) * dpr), Math.round((lp.y - min.y) * dpr), 1, 1).data;
      out[k] = { r: d[0], g: d[1], b: d[2], a: d[3] };
    });
    return out;
  }, points);
}
// Jaune du pilier (#f4c542 à 0,85) : rouge et vert hauts, bleu bas.
const estPilier = (p) => p && p.r > 190 && p.g > 150 && p.b < 120;

async function verifierEmpilement(page, quand) {
  await page.waitForTimeout(400);
  const px = await pixels(page, SITES);
  verifier(Object.keys(SITES).every(function (k) { return estPilier(px[k]); }),
    quand + " : les quatre piliers (calque et session, sur l'inaccessible et sur l'eau) se peignent au-dessus", px);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1100, height: 850 } });
  await page.route(/tile\.openstreetmap\.org/, function (r) { return r.abort(); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("pageerror", function (e) { erreursConsole.push("pageerror : " + e.message); });
  page.on("console", function (m) {
    if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|Licence-pro\.json|404/i.test(m.text())) {
      erreursConsole.push(m.text());
    }
  });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await chargerPlan(page);
    await semerSession(page);

    const surCanvas = await page.evaluate(function () {
      const svg = document.querySelectorAll(".leaflet-overlay-pane svg path").length;
      const pat = window.ktaResolveStyle("zones", "inaccessible").fillColor;
      return { svg: svg, motif: typeof CanvasPattern !== "undefined" && pat instanceof CanvasPattern };
    });
    verifier(surCanvas.motif && surCanvas.svg === 0,
      "inaccessible : hachures en CanvasPattern, plus aucun chemin SVG dans le pane des vecteurs", surCanvas);

    await verifierEmpilement(page, "chargement");

    // Hachures : deux points de la zone, hors pilier, ne sont pas tous de la même couleur (rayure / fond).
    const echantillons = {};
    for (let i = 0; i < 12; i++) echantillons["p" + i] = [SITES.sessionInacc[0] + 40 + i * 2, SITES.sessionInacc[1] + 60];
    const ech = await pixels(page, echantillons);
    const teintes = new Set(Object.keys(ech).map(function (k) { return ech[k].r + "," + ech[k].g + "," + ech[k].b; }));
    verifier(teintes.size >= 2, "hachures visibles : " + teintes.size + " teintes sur 12 pixels alignés de l'inaccessible");

    await page.evaluate(function () {
      const z = window.getZones().slice();
      z[0] = Object.assign({}, z[0], { description: "édition" });
      window.setZones(z);
    });
    await verifierEmpilement(page, "après une édition de zone (setZones)");
    await page.evaluate(function () { window.renderZones(); });
    await verifierEmpilement(page, "après un rendu de zones seul");
    await page.evaluate(function () {
      const before = window.HistoryManager.captureState("zones");
      window.setZones(window.getZones().slice(0, 1));
      window.HistoryManager.record("test", before, "zones");
      window.HistoryManager.undo();
    });
    await verifierEmpilement(page, "après ⏪");
    await page.evaluate(function () {
      if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
      if (typeof window._kta_syncAllNoteUiForModeChange === "function") window._kta_syncAllNoteUiForModeChange();
    });
    await verifierEmpilement(page, "après filtre et changement de mode");

    // Clic réel de souris sur l'inaccessible de session (hors pilier) : sa fiche s'ouvre.
    const ecran = await page.evaluate(function (p) {
      const cp = window.map.latLngToContainerPoint(window.convertCoord(p[0] + 70, p[1] + 70));
      const r = window.map.getContainer().getBoundingClientRect();
      return { x: r.left + cp.x, y: r.top + cp.y };
    }, SITES.sessionInacc);
    await page.mouse.click(ecran.x, ecran.y);
    await page.waitForTimeout(500);
    const fiche = await page.evaluate(function () {
      const el = document.querySelector(".leaflet-popup-content .kta-note-popup");
      return el ? el.getAttribute("data-kta-uid") : null;
    });
    verifier(fiche === "zn_si", "clic sur l'inaccessible : sa fiche s'ouvre", fiche);
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  if (erreursConsole.length) erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — zones sous les structures (calque et session), hachures sur le canvas, fiche au clic.");
  process.exit(0);
})();
