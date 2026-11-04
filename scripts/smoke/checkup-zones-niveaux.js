#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-zones-niveaux.js — checkup (Playwright, pas un hook pré-commit) : zone reliée à plusieurs niveaux
// =====================================================================
// Plan multi-niveau FABRIQUÉ dans la page (image dessinée sur un canvas, ZIP construit en mémoire, rien lu ni
// écrit dans data/), galeries de session au −2 (droite + détour), puis :
// A. Zone inaccessible tracée au −1 par de vrais clics de carte (outil de zone), fiche : cases « Aussi aux
//    niveaux » (niveaux du plan hors −1), −2 coché puis appliqué → `niveaux` [−2, −1], `level` −1.
// B. Filtre : visible au −1 et au −2, absente au 0. Zone d'un calque de données portant `niveaux` : même règle.
// C. Itinéraire au −2 (Pathfinder de l'app, zones de la session) : la zone est contournée ; sans elle, direct.
// D. Annulation (HistoryManager.undo = ⏪) puis rétablissement ; KMZ relu par l'import de l'app (une zone, ses
//    niveaux, la copie sautée) ; rechargement de la page : `niveaux` restauré par la session.
// Usage : node scripts/smoke/checkup-zones-niveaux.js (SMOKE_PORT pour une autre copie de travail)
// Garde-fou logique associé : scripts/check-zones-niveaux.js · doc : docs/architecture/multilevel-pathfinding.md
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
const NOM_PLAN = "Plan fictif zones multi";

const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function accueil(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

async function apresOuverture(page) {
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.KtaConvertir && !!window.HistoryManager && !!window.Pathfinder;
  }, 30000);
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) k.click(); else m.remove(); }
  });
  await page.waitForTimeout(300);
}

// Plan fictif : image unie 1200 × 900, multi-niveau, un calque de données avec une zone 0 / +1.
async function chargerPlanFictif(page) {
  await page.evaluate(async function (nom) {
    const W = 1200, H = 900;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#cfcfcf"; g.fillRect(0, 0, W, H);
    const png = await new Promise(function (r) { c.toBlob(r, "image/png"); });
    const carre = function (cx, cy, r) {
      return [{ x: cx - r, y: cy - r }, { x: cx + r, y: cy - r }, { x: cx + r, y: cy + r }, { x: cx - r, y: cy + r }];
    };
    const zip = new JSZip();
    zip.file("fond.png", png);
    zip.file("calque.json", JSON.stringify({ data: [], roads: [], structures: [],
      zones: [{ uid: "zn_calque", type: "eau", level: 0, niveaux: [0, 1], points: carre(900, 200, 40),
                description: "zone de calque" }] }));
    zip.file("plan-config.json", JSON.stringify({
      plan: { name: nom, version: "T1", imageWidth: W, imageHeight: H, baseImage: "fond.png", multiLevel: true },
      dataLayers: [{ id: "calque", label: "Calque", file: "calque.json", visible: true }],
      tracking: { startX: 600, startY: 450, scale: 4 },
      iconsEmbarquees: []
    }));
    const blob = await zip.generateAsync({ type: "blob" });
    await window.chargerZipFichier(new File([blob], "fictif-zones.zip", { type: "application/zip" }), "auto",
      { storeBlob: true });
  }, NOM_PLAN);
  await apresOuverture(page);
}

function niveaux(page, visibles, actif) {
  return page.evaluate(function (a) {
    window.APP_CONFIG.availableLevels = [-2, -1, 0, 1];
    window.APP_CONFIG.visibleLevels = a.v;
    if (a.actif !== undefined) window.APP_CONFIG.activeLevel = a.actif;
    window.appliquerFiltreNiveau();
  }, { v: visibles, actif: actif });
}

// Polygone de la zone sur la carte (layer porteur de sa fiche) et opacité de la zone de calque.
function surCarte(page, uid) {
  return page.evaluate(function (uid) {
    let session = false, calque = null;
    window.map.eachLayer(function (l) {
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (typeof c === "string" && c.indexOf('data-kta-uid="' + uid + '"') >= 0) session = true;
    });
    const e = (window._ktaDataPolygons || []).find(function (x) { return x.uid === "zn_calque"; });
    if (e) calque = e.polygon.options.fillOpacity;
    return { session: session, calqueVisible: calque !== null && calque > 0 };
  }, uid);
}

function zone(page) {
  return page.evaluate(function () {
    const z = window.getZones().find(function (o) { return o.type === "inaccessible"; });
    return z ? { uid: z.uid, level: z.level, niveaux: z.niveaux === undefined ? null : z.niveaux } : null;
  });
}

function longueurAuMoins2(page) {
  return page.evaluate(async function () {
    try {
      const r = await window.Pathfinder.computeRoute([{ x: 520, y: 450, level: -2 }, { x: 880, y: 450, level: -2 }], {});
      return Math.round(r.totalDistance);
    } catch (e) { return e.code || e.message; }
  });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
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
    await accueil(page);
    await chargerPlanFictif(page);
    verifier(await page.evaluate(function () { return window.APP_CONFIG.multiLevel === true; }),
      "plan fictif fabriqué dans la page, multi-niveau");

    // Galeries du −2 : droite y = 450 (x 500 → 900) et détour par y = 650.
    await page.evaluate(function () {
      const R = function (pts) { return { type: "principal", level: -2, points: pts.map(function (p) { return { x: p[0], y: p[1] }; }) }; };
      window.setRoads([R([[500, 450], [700, 450], [900, 450]]), R([[500, 450], [500, 650], [900, 650], [900, 450]])]);
      window.setZones([]);
      window.HistoryManager.reset();
      window.map.setView(window.convertCoord(700, 450), window.map.getZoom());
    });
    const direct = await longueurAuMoins2(page);
    verifier(direct === 360, "itinéraire au −2 sans zone : direct (360 px)", direct);

    // ── A. Tracé au −1 par l'outil de zone (vrais événements de clic de carte) ──
    console.log("A. Tracé et fiche");
    await niveaux(page, [-1], -1);
    await page.evaluate(function () {
      window.toggleZoneMode("inaccessible");
      const H = window.APP_CONFIG.imageHeight;
      [[680, 430], [720, 430], [720, 470], [680, 470], [680, 430]].forEach(function (p) {
        window.map.fire("click", { latlng: L.latLng(H - p[1], p[0]) });
      });
      window.toggleZoneMode("inaccessible");
    });
    await page.waitForTimeout(400);
    let z = await zone(page);
    verifier(!!z && z.level === -1 && z.niveaux === null, "zone tracée au −1, sans `niveaux` (zone simple)", z);
    const fiche = await page.evaluate(function (uid) {
      let cible = null;
      window.map.eachLayer(function (l) {
        const p = l.getPopup && l.getPopup();
        const c = p && p.getContent && p.getContent();
        if (!cible && typeof c === "string" && c.indexOf('data-kta-uid="' + uid + '"') >= 0) cible = l;
      });
      if (!cible) return null;
      cible.openPopup(cible.getBounds().getCenter());
      return true;
    }, z && z.uid);
    await page.waitForTimeout(400);
    const cases = await page.evaluate(function () {
      return Array.from(document.querySelectorAll(".leaflet-popup-content .kta-note-popup-niveaux-zone-cases input"))
        .map(function (c) { return { n: Number(c.value), coche: c.checked }; });
    });
    verifier(fiche && JSON.stringify(cases.map(function (c) { return c.n; })) === "[-2,0,1]" &&
      cases.every(function (c) { return !c.coche; }),
      "fiche : cases « Aussi aux niveaux » = niveaux du plan hors −1, aucune cochée", cases);
    await page.check('.leaflet-popup-content .kta-note-popup-niveaux-zone-cases input[value="-2"]');
    await page.click(".leaflet-popup-content .kta-note-popup-niveaux-zone-appliquer");
    await page.waitForTimeout(500);
    z = await zone(page);
    verifier(!!z && z.level === -1 && JSON.stringify(z.niveaux) === "[-2,-1]",
      "appliqué : niveaux [−2, −1], niveau d'origine −1 gardé", z);
    const toast = await page.evaluate(function () { return (document.getElementById("kta-toast") || document.body).textContent; });
    verifier(/-2, -1/.test(toast), "toast de confirmation avec la liste des niveaux");

    // ── B. Filtre ──
    console.log("B. Filtre de niveau");
    await niveaux(page, [-1]);
    let v = await surCarte(page, z.uid);
    verifier(v.session, "visible au −1", v);
    await niveaux(page, [-2]);
    v = await surCarte(page, z.uid);
    verifier(v.session, "visible au −2", v);
    await niveaux(page, [0]);
    v = await surCarte(page, z.uid);
    verifier(!v.session && v.calqueVisible, "absente au 0 ; la zone de calque 0 / +1 y est", v);
    await niveaux(page, [1]);
    v = await surCarte(page, z.uid);
    verifier(!v.session && v.calqueVisible, "zone de calque `niveaux` [0, +1] : visible au +1 aussi", v);
    await niveaux(page, [-2]);
    v = await surCarte(page, z.uid);
    verifier(!v.calqueVisible, "zone de calque : masquée au −2", v);

    // ── C. Itinéraire ──
    console.log("C. Itinéraire au −2");
    const contourne = await longueurAuMoins2(page);
    verifier(typeof contourne === "number" && contourne > 700, "itinéraire au −2 : la zone est contournée (" + contourne + " px)", contourne);

    // ── D. Annulation, KMZ, rechargement ──
    console.log("D. Annulation, KMZ, rechargement");
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(300);
    z = await zone(page);
    const apresUndo = await longueurAuMoins2(page);
    verifier(!!z && z.niveaux === null && apresUndo === 360, "⏪ : la zone redevient simple, le −2 n'est plus bloqué", { z: z, d: apresUndo });
    await page.evaluate(function () { window.HistoryManager.redo(); });
    await page.waitForTimeout(300);
    z = await zone(page);
    verifier(!!z && JSON.stringify(z.niveaux) === "[-2,-1]", "⏩ : niveaux [−2, −1] rétablis", z);

    const k = await page.evaluate(function () {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      const tr = window.KmzExport.buildTransformCalib({
        pointA: { x: 0, y: H, lat: 46.5, lng: 3.0 },
        pointB: { x: W, y: 0, lat: 46.51, lng: 3.02 },
        pointC: { x: W, y: H, lat: 46.5, lng: 3.02 }
      });
      const kml = window.KmzExport.genererKml({ transform: tr, planName: "Test", include: { zones: true },
        levels: new Set([-2, -1, 0]), data: { editorPoints: [], roads: [], zones: window.getZones(), structures: [] } });
      const doc = new DOMParser().parseFromString(kml, "application/xml");
      const trImp = window.KmzImport.buildTransform({ nw: { lat: 46.51, lng: 3.0 }, ne: { lat: 46.51, lng: 3.02 } }, W, H);
      const lu = window.KmzImport.ingestPlacemarks(doc, trImp, { pointTag: "info", roadType: "chemin", zoneType: "eau" });
      return { placemarks: (kml.match(/<Placemark>/g) || []).length, zones: lu.zones.length,
               type: lu.zones[0] && lu.zones[0].type, level: lu.zones[0] && lu.zones[0].level,
               niveaux: lu.zones[0] && lu.zones[0].niveaux };
    });
    verifier(k.placemarks === 2 && k.zones === 1 && k.type === "inaccessible" && k.level === -1 &&
      JSON.stringify(k.niveaux) === "[-2,-1]",
      "KMZ : la zone dans les dossiers −1 et −2, relue UNE fois avec ses niveaux", k);

    await page.evaluate(function () { return window.SessionPersist.save({ force: true }); });
    await page.waitForTimeout(1500);
    await accueil(page);
    await page.getByText(NOM_PLAN, { exact: false }).first().click();
    await apresOuverture(page);
    z = await zone(page);
    verifier(!!z && z.level === -1 && JSON.stringify(z.niveaux) === "[-2,-1]", "rechargé : `niveaux` restauré par la session", z);
    await niveaux(page, [-2]);
    v = await surCarte(page, z && z.uid);
    verifier(v.session, "rechargé : visible au −2", v);
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
  console.log("🎉 CHECKUP VERT — zone sur plusieurs niveaux : fiche, filtre, itinéraire, annulation, KMZ, rechargement.");
  process.exit(0);
})();
