#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-zip-partage.js — checkup : un plan ZIP tuilé ouvert ne garde son archive qu'UNE fois en mémoire
// =====================================================================
// JSZip lit tout le fichier en mémoire (loadAsync d'un Blob). L'aperçu de l'accueil (osmHomePreview.js) gardait sa
// propre copie du ZIP pour les tuiles détaillées, en plus de celle du plan ouvert (window._lazyZipRef) : deux
// tampons de la taille de l'archive. Plan ZIP FICTIF tuilé (fabriqué ici, jamais dans data/), gardé sur l'appareil :
//   1. page rechargée, aperçu calé : le ZIP lu UNE fois par l'aperçu (lectures simultanées partagées) ;
//   2. accueil zoomé : tuiles détaillées affichées ;
//   3. plan rouvert : son ZIP marqué (_ktaPlanId), aucun calque n'y garde son JSON (RUNTIME_ASSETS[…].json) ;
//      Chromium : après ramasse-miettes, UN seul JSZip vivant (WeakRef sur chaque lecture) ;
//   4. retour à l'accueil par 🏠 (plan libéré, son ZIP avec lui) : l'aperçu relit le sien à la demande, tuiles
//      détaillées toujours là ; Chromium : un seul JSZip vivant.
// Contre-épreuve : sur le code d'avant, le 3 voit 2 JSZip vivants.
// WebKit de test sous Windows : IndexedDB y refuse les Blob, le plan n'est pas gardé → déroulé dit SAUTÉ.
// Usage : node scripts/smoke/checkup-zip-partage.js   (SMOKE_PORT, KTA_MOTEURS=chromium|webkit)
"use strict";

const path = require("path");
const { lancerMoteur, moteurs, fermerTout } = require("./navigateur.js");
const attendre = require("./attendre.js");
const { pngUni } = require("./planV2Fictif.js");
const JSZip = require(path.join(__dirname, "..", "..", "lib", "jszip.min.js"));
require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1"
};
// 16384 × 12288 px, niveaux 0 à -3 : l'aperçu prend le -3 (48 tuiles, le plus fin sous 80) et le zoom 18 demande plus fin.
const TUILE = 256, NBX = 64, NBY = 48;
const NOM = "Plan ZIP partagé du checkup";
// Calage fictif en mer (golfe de Guinée) : 1 px = 2e-6 degré.
const CALAGE = { pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 }, pointB: { x: 1000, y: 1000, lat: 0.002, lng: 0.003 } };

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function verifier(c, m, d) { if (c) ok(m); else pb(m + (d !== undefined ? " — " + JSON.stringify(d) : "")); }

async function zipFictif() {
  const z = new JSZip();
  z.file("plan-config.json", JSON.stringify({
    plan: { name: NOM, version: "1", author: "checkup", imageWidth: TUILE * NBX, imageHeight: TUILE * NBY,
      baseImage: "data/fond.png", tiledV2: true },
    imageLayers: [], tracking: { scale: 4 }, icons: {}, iconsEmbarquees: [],
    dataLayers: [{ id: "points", label: "Points", file: "data/points.json", visible: true }],
    tiling: { version: 2, tileSize: TUILE, format: "png", alpha: false, minNativeZoom: -3, maxNativeZoom: 0 }
  }));
  z.file("data/fond.png", pngUni(64, 100, 100, 100));
  z.file("data/points.json", JSON.stringify({ data: [{ id: "Point A", x: 300, y: 300, level: 0, tags: [] }] }));
  for (let n = 0; n >= -3; n--) {
    const png = pngUni(TUILE, 90 + 20 * -n, 110, 140), f = Math.pow(2, n);
    const cols = Math.ceil(NBX * f), rows = Math.ceil(NBY * f);
    for (let c = 0; c < cols; c++) for (let k = 1; k <= rows; k++) z.file("data/tiles/z" + n + "/x" + c + "_y" + (-k) + ".png", png);
  }
  return z.generateAsync({ type: "nodebuffer", compression: "STORE" });
}

// Avant tout script de l'app : chaque lecture JSZip notée (module appelant + WeakRef) ; carte de l'accueil retenue.
function instrumenter(ls) {
  for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) { /* stockage refusé */ } }
  let J;
  window.__zips = [];
  Object.defineProperty(window, "JSZip", { configurable: true, get: function () { return J; }, set: function (v) {
    J = v;
    if (!v || v.__ktaSonde) return;
    const la = v.loadAsync;
    v.__ktaSonde = true;
    v.loadAsync = function () {
      const pile = String(new Error().stack || "");
      const mod = (/js\/(\w+)\.js/.exec(pile.split("\n").slice(2).join("\n")) || [])[1] || "?";
      return la.apply(this, arguments).then(function (z) { window.__zips.push({ mod: mod, ref: new WeakRef(z) }); return z; });
    };
  } });
  const iv = setInterval(function () {
    if (!window.L || !L.Map) return;
    clearInterval(iv);
    L.Map.addInitHook(function () { if (this.getContainer().id === "ktaOsmHomeMap") window.__acc = this; });
  }, 5);
}

// Accueil : aperçu calé sur le plan, zoomé au centre → nombre d'images dans le sous-calque de ses tuiles.
async function tuilesAccueil(page, id) {
  await page.evaluate(function (a) {
    window.KmzExport.setCalibration(a.id, a.calage);
    window.__pt = "ktaOsmPlan_" + String(a.id).replace(/[^a-zA-Z0-9_-]/g, "_") + "_tuiles";
    window.__acc = null;
    window.OsmHomePreview.refresh();
    window.OsmHomePreview.selectPlan(a.id);
  }, { id: id, calage: CALAGE });
  await attendre(page, function () {
    const m = window.__acc, p = m && m._loaded && m.getPane(window.__pt);
    return !!p && p.querySelectorAll("img").length > 0;
  }, 30000);
  const vue = await page.evaluate(function () {
    return (window.__socle = window.__acc.getPane(window.__pt).querySelectorAll("img").length);
  });
  await page.evaluate(function (a) {
    const lat = a.calage.pointA.lat - (a.h / 2) * 2e-6, lng = a.calage.pointA.lng + (a.w / 2) * 2e-6;
    window.__acc.setView([lat, lng], 18, { animate: false });
  }, { calage: CALAGE, w: TUILE * NBX, h: TUILE * NBY });
  // 🩸 Comparer au socle (déjà des dizaines d'images) : les tuiles détaillées arrivent après le débounce du déplacement.
  await attendre(page, function () {
    return window.__acc.getPane(window.__pt).querySelectorAll("img").length > window.__socle;
  }, 20000).catch(function () { /* constaté plus bas */ });
  const zoome = await page.evaluate(function () { return window.__acc.getPane(window.__pt).querySelectorAll("img").length; });
  return { vue: vue, zoome: zoome };
}

function lecturesApercu(page) {
  return page.evaluate(function () { return window.__zips.filter(function (z) { return z.mod === "osmHomePreview"; }).length; });
}

async function jouer(nom, zip) {
  console.log("\n▶ " + nom);
  const nav = await lancerMoteur(nom);
  if (!nav) { console.log("  ⚠️ moteur absent : sauté"); return; }
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erreurs = [];
  let etape = "chargement";
  page.on("pageerror", function (e) { erreurs.push(String(e.message || e).slice(0, 200)); });
  await ctx.route("https://tile.openstreetmap.org/**", function (r) {
    r.fulfill({ status: 200, contentType: "image/png", body: pngUni(8, 200, 200, 200) });
  });
  await ctx.route(/__zip-partage\.zip$/, function (r) { r.fulfill({ status: 200, contentType: "application/zip", body: zip }); });
  await page.addInitScript(instrumenter, LS);
  const pret = function () {
    return attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 30000);
  };
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await pret();
    await page.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(function () {});
    etape = "import du ZIP";
    const plan = await page.evaluate(async function (n) {
      const b = document.getElementById("kta-alert-ok"); if (b) b.click();
      const blob = await (await fetch("/__zip-partage.zip")).blob();
      await window.chargerZipFichier(new File([blob], "zip-partage.zip", { type: "application/zip" }), "auto", { storeBlob: true });
      const p = window.PlanRegistry.getAll().find(function (x) { return x.name === n; });
      return p ? { id: p.id, garde: !!p.storedBlob } : null;
    }, NOM);
    if (!plan) { pb("import : plan fictif absent du registre"); return; }
    // 🩸 Le WebKit de test sous Windows refuse tout Blob dans IndexedDB (UnknownError, même 1 Ko) : sans copie gardée,
    // l'aperçu n'a rien à lire. Dit et sauté, jamais un vert à vide ; Chromium joue tout.
    if (!plan.garde) {
      if (nom === "webkit") { console.log("  ⚠️ WebKit : copie du ZIP non gardée (IndexedDB refuse les Blob ici) — déroulé SAUTÉ"); return; }
      pb("import : copie du ZIP non gardée sur l'appareil"); return;
    }
    const id = plan.id;

    // 1-2. page rechargée : l'aperçu relit le ZIP gardé
    etape = "accueil après rechargement";
    await page.reload({ waitUntil: "domcontentloaded" });
    await pret();
    await page.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(function () {});
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    const a1 = await tuilesAccueil(page, id);
    const l1 = await lecturesApercu(page);
    verifier(l1 === 1, "accueil : ZIP lu une seule fois par l'aperçu (" + l1 + ")");
    verifier(a1.zoome > a1.vue, "accueil zoomé : tuiles détaillées affichées (" + a1.vue + " → " + a1.zoome + " images)", a1);

    // 3. plan rouvert depuis la liste
    etape = "plan rouvert";
    await page.evaluate(function (pid) {
      window.__pret = false;
      Promise.resolve(window.chargerPlanDuRegistre(pid)).then(function () { window.__pret = true; });
    }, id);
    await attendre(page, function () { return window.__pret === true && !!window.map && !!window.APP_CONFIG; }, 60000);
    await attendre(page, function () { return !!(window._lazyZipRef && window._lazyZipRef._ktaPlanId); }, 20000)
      .catch(function () { /* constaté plus bas */ });
    const e3 = await page.evaluate(function (pid) {
      const A = window.RUNTIME_ASSETS || {}, cles = Object.keys(A);
      return { marque: !!window._lazyZipRef && window._lazyZipRef._ktaPlanId === pid,
        json: cles.filter(function (k) { return A[k] && A[k].json; }).length, assets: cles.length,
        tuiles: document.querySelectorAll(".leaflet-tile").length };
    }, id);
    verifier(e3.marque, "plan ouvert : son ZIP (_lazyZipRef) marqué du plan", e3);
    verifier(e3.json === 0 && e3.assets > 0, "plan ouvert : aucun asset ne garde son JSON (" + e3.assets + " assets)", e3);
    verifier(e3.tuiles > 0, "plan ouvert : tuiles affichées (" + e3.tuiles + ")");
    if (nom === "chromium") {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("HeapProfiler.collectGarbage");
      await page.waitForTimeout(300);
      await cdp.send("HeapProfiler.collectGarbage");
      const vivants = await page.evaluate(function () {
        return window.__zips.filter(function (z) { return !!z.ref.deref(); }).map(function (z) { return z.mod; });
      });
      await cdp.detach();
      verifier(vivants.length === 1, "🩸 plan ouvert : UN seul JSZip vivant après ramasse-miettes (" +
        vivants.join(", ") + ") — l'aperçu a lâché sa copie", vivants);
    } else {
      console.log("  •  JSZip vivants : contrôle Chromium seul (ramasse-miettes forcé par CDP)");
    }

    // 4. retour à l'accueil par 🏠 : le plan libéré emporte son ZIP, l'aperçu relit le sien (copie lâchée au 3)
    etape = "retour à l'accueil";
    const l3 = await lecturesApercu(page);
    await page.evaluate(function () { document.getElementById("kta-refonte-home").click(); });
    // Session sans modification : accueil direct ; sinon fenêtre « Changer de plan » → « Mes plans ».
    await attendre(page, function () {
      const b = document.getElementById("popupChargerPlan");
      if (b) b.click();
      return document.body.classList.contains("kta-loader-active");
    }, 10000);
    const a4 = await tuilesAccueil(page, id);
    const l4 = await lecturesApercu(page);
    verifier(a4.zoome > a4.vue, "retour à l'accueil : tuiles détaillées affichées (" + a4.vue + " → " + a4.zoome + ")", a4);
    verifier(l4 === l3 + 1, "retour à l'accueil : copie lâchée relue une fois à la demande (" + l3 + " → " + l4 + " lecture(s))");
    if (nom === "chromium") {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("HeapProfiler.collectGarbage");
      await page.waitForTimeout(300);
      await cdp.send("HeapProfiler.collectGarbage");
      const n = await page.evaluate(function () { return window.__zips.filter(function (z) { return !!z.ref.deref(); }).length; });
      await cdp.detach();
      verifier(n === 1, "retour à l'accueil : un seul JSZip vivant (" + n + ")");
    }
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs);
  } catch (e) {
    pb("déroulé interrompu (" + etape + ") : " + String(e && e.message || e).slice(0, 200));
  } finally {
    await nav.close().catch(function () {});
  }
}

(async function () {
  const zip = await zipFictif();
  console.log("ZIP fictif : " + Math.round(zip.length / 1024) + " Ko");
  for (const m of moteurs()) await jouer(m, zip);
  console.log("\n" + (problemes.length ? "❌ " + problemes.length + " problème(s)" : "🎉 ZIP partagé : une seule copie, tuiles détaillées intactes"));
  await fermerTout();
  process.exit(problemes.length ? 1 : 0);
})().catch(async function (e) { console.error(e); await fermerTout(); process.exit(2); });
