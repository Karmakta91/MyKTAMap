#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-fonds-carte.js — checkup de release : fonds de carte de la Vue OSM (OSM, IGN aérien, IGN plan)
// =====================================================================
// Le relevé fictif reçoit, comme checkup-osm-legende.js, un tuilage V2 prêté (tuiles en data:) et un calage fictif
// générique en France (centre du pays, aucun lieu visé), en mémoire, jamais dans data/. Tuiles OSM et IGN fabriquées
// ici (routes sur tile.openstreetmap.org et data.geopf.fr) : aucune requête ne sort vers les vrais serveurs.
// 🩸 Service worker bloqué : sinon il fait la requête à la place de la page et page.route ne la voit pas (son refus
// d'intercepter data.geopf.fr est prouvé à part, dans un vm : scripts/check-plan-offline.js §9).
// V1 Vue OSM ouverte sur OSM : sélecteur du fond dans le bandeau (3 fonds, OSM par défaut), aucune requête IGN,
//   attribution OpenStreetMap · V2 IGN aérien : couche ORTHOPHOTOS, zoom ≤ 19, attribution IGN seule, « Sauvegarder
//   hors-ligne » grisé avec sa raison, rien d'enregistré · V3 hors couverture (IGN en 404) : tuile OSM à la place,
//   attribution OSM ajoutée · V4 choix partagé avec le fond sous le plan, dans les deux sens · V5 retour OSM : plus de
//   requête IGN, sauvegarde permise · V6 rechargement : choix retrouvé · V7 Vue OSM refusée (fond IGN choisi) : aucune
//   requête IGN · V8 incognito : idem · V9 aucune erreur de page.
// Usage : node scripts/smoke/checkup-fonds-carte.js   (SMOKE_PORT pour une copie de travail)
// Doc : docs/architecture/vue-osm.md (Fonds de carte)
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1"
};
const CLE_FOND = "myktamap_fond_carte_v1";
const PNG_TUILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4xrAFAANqAZsvHqYeAAAAAElFTkSuQmCC";
const RE_OSM = /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png/;
const RE_IGN = /^https:\/\/data\.geopf\.fr\//;

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
function verif(lib, cond, detail) { if (cond) ok(lib); else pb(lib + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }

// ── PNG synthétique 256 × 256 d'une couleur (RGB 8 bits, sans dépendance) ──────────
const TABLE_CRC = (function () {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let r = 0xffffffff; for (const x of b) r = TABLE_CRC[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; }
function bloc(type, d) {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(type), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([l, td, c]);
}
function png(rgb) {
  const w = 256, h = 256, brut = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3; brut[o] = rgb[0]; brut[o + 1] = rgb[1]; brut[o + 2] = rgb[2];
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc("IHDR", ih),
    bloc("IDAT", zlib.deflateSync(brut)), bloc("IEND", Buffer.alloc(0))]);
}
const PNG_OSM = png([150, 200, 150]);
const PNG_IGN = { "ORTHOIMAGERY.ORTHOPHOTOS": png([200, 40, 40]), "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2": png([40, 40, 200]) };

async function ouvrirPage(nav, nom, opts) {
  const o = opts || {};
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const etat = { osm: [], ign: [], erreurs: [], ignHors: false };
  page.on("pageerror", function (e) { etat.erreurs.push(String(e)); });
  page.on("request", function (r) {
    if (RE_OSM.test(r.url())) etat.osm.push(r.url());
    else if (RE_IGN.test(r.url())) etat.ign.push(r.url());
  });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { if (localStorage.getItem(k) === null) localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, Object.assign({}, LS_PREGATES, o.ls || {}));
  await page.route(RE_OSM, function (route) {
    route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PNG_OSM });
  });
  await page.route(RE_IGN, function (route) {
    const corps = PNG_IGN[new URL(route.request().url()).searchParams.get("LAYER")];
    if (etat.ignHors || !corps) { route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, body: "" }); return; }
    route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: corps });
  });
  await page.goto(BASE + "/index.html" + (o.incognito ? "?incognito=1" : ""), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await ouvrirPlan(page, nom);
  return { ctx: ctx, page: page, etat: etat };
}

async function ouvrirPlan(page, nom) {
  await page.getByText(nom, { exact: false }).first().click();
  await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
  await page.waitForTimeout(2000);
  await page.evaluate(function (png) {
    // la Vue OSM n'ouvre qu'un plan tuilé V2 : tuilage prêté (tuiles = PNG en data:, RUNTIME_ASSETS)
    const pc = window.PLAN_CONFIG, p = pc.plan;
    const W = p.imageWidth || window.APP_CONFIG.imageWidth, H = p.imageHeight || window.APP_CONFIG.imageHeight;
    p.imageWidth = W; p.imageHeight = H;
    p.tiledV2 = true;
    pc.tiling = { minNativeZoom: -3, maxNativeZoom: 0, tileSize: 256, format: "png" };
    const ext = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(pc.tiling) : "jpg";
    window.RUNTIME_ASSETS = window.RUNTIME_ASSETS || {};
    for (let z = -3; z <= 0; z++) {
      const sc = Math.pow(2, -z);
      const cols = Math.ceil(Math.ceil(W / sc) / 256), rows = Math.ceil(Math.ceil(H / sc) / 256);
      for (let c = 0; c < cols; c++) for (let k = 1; k <= rows; k++) {
        window.RUNTIME_ASSETS["data/tiles/z" + z + "/x" + c + "_y" + (-k) + "." + ext] = { url: png };
      }
    }
    // calage fictif générique, centre de la France (couverture IGN réelle)
    p.georef = { pointA: { x: 0, y: 0, lat: 46.5, lng: 2.5 },
                 pointB: { x: W, y: H, lat: 46.5 - H * 2e-6, lng: 2.5 + W * 2.9e-6 }, modele: "local" };
    if (window.FondOsmPlan) window.FondOsmPlan.majBouton();
  }, PNG_TUILE);
}

async function ouvrirVueOsm(page) {
  await page.evaluate(function () { window.OsmView.open(); });
  await attendre(page, function () { return !!document.getElementById("kta-osm-fond"); }, 30000);
  await page.waitForTimeout(1500);
}
async function fermerVueOsm(page) {
  await page.evaluate(function () { const b = document.getElementById("kta-osm-close"); if (b) b.click(); });
  await page.waitForTimeout(400);
}
// Bandeau de la Vue OSM : fond choisi, attribution Leaflet, tuiles du fond, bouton de sauvegarde.
function lireVue() {
  const sel = document.getElementById("kta-osm-fond");
  const attr = document.querySelector("#kta-osm-map .leaflet-control-attribution");
  const tuiles = Array.from(document.querySelectorAll("#kta-osm-map .leaflet-tile-pane img.leaflet-tile"));
  const btn = document.getElementById("kta-osm-cache-btn");
  return {
    select: !!sel, valeur: sel ? sel.value : null,
    options: sel ? Array.from(sel.options).map(function (o) { return o.value; }) : [],
    attribution: attr ? attr.textContent : "",
    tuilesIgn: tuiles.filter(function (t) { return /data\.geopf\.fr/.test(t.src) && t.classList.contains("leaflet-tile-loaded"); }).length,
    tuilesOsm: tuiles.filter(function (t) { return /tile\.openstreetmap\.org/.test(t.src) && t.classList.contains("leaflet-tile-loaded"); }).length,
    cacheDesactive: btn ? btn.disabled : null, cacheTitre: btn ? btn.title : null,
    courant: window.KtaFondsCarte.courant().id
  };
}
async function cle(page, k) { return page.evaluate(function (c) { return window.I18n.t(c); }, k); }
async function choisirVue(page, id) {
  await page.selectOption("#kta-osm-fond", id);
  await page.waitForTimeout(1500);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const erreurs = [];
  try {
    const nom = planFictif();
    if (!nom) { pb("relevé fictif absent de data/index.json"); return; }

    let s = await ouvrirPage(nav, nom);
    let page = s.page;

    console.log("— V1 : Vue OSM sur OpenStreetMap —");
    await ouvrirVueOsm(page);
    const v1 = await page.evaluate(lireVue);
    verif("sélecteur du fond dans le bandeau : OSM, IGN aérien, IGN plan ; OSM par défaut",
      v1.select && v1.valeur === "osm" && v1.options.join(",") === "osm,ign-aerien,ign-plan", v1.options);
    verif("OSM : tuiles OSM, aucune requête IGN, attribution OpenStreetMap",
      v1.tuilesOsm > 0 && s.etat.ign.length === 0 && /OpenStreetMap/.test(v1.attribution),
      { osm: v1.tuilesOsm, ign: s.etat.ign.length, attribution: v1.attribution });
    verif("OSM : « Sauvegarder hors-ligne » permis", v1.cacheDesactive === false, v1.cacheDesactive);

    console.log("— V2 : IGN aérien —");
    const nOsm = s.etat.osm.length;
    await choisirVue(page, "ign-aerien");
    const v2 = await page.evaluate(lireVue);
    verif("IGN aérien : tuiles data.geopf.fr posées", v2.tuilesIgn > 0 && v2.tuilesOsm === 0, v2);
    verif("IGN aérien : couche ORTHOPHOTOS, zoom ≤ 19",
      s.etat.ign.length > 0 && s.etat.ign.every(function (u) {
        const m = /TILEMATRIX=(\d+)&/.exec(u);
        return /LAYER=ORTHOIMAGERY\.ORTHOPHOTOS/.test(u) && m && +m[1] <= 19;
      }), s.etat.ign.slice(0, 2));
    verif("IGN aérien : attribution IGN seule", /IGN/.test(v2.attribution) && !/OpenStreetMap/.test(v2.attribution), v2.attribution);
    verif("IGN : « Sauvegarder hors-ligne » grisé, raison au survol",
      v2.cacheDesactive === true && v2.cacheTitre === await cle(page, "fondscarte.horsLigne.osmSeul"), v2);
    const nCache = await page.evaluate(async function () { return (await window.OsmTilesCache.getStats()).count; });
    await page.click("#kta-osm-cache-btn", { force: true }).catch(function () {});
    await page.waitForTimeout(800);
    const nCache2 = await page.evaluate(async function () { return (await window.OsmTilesCache.getStats()).count; });
    verif("IGN : rien d'enregistré en silence, aucune tuile OSM demandée",
      nCache2 === nCache && s.etat.osm.length === nOsm, { cache: [nCache, nCache2], osm: s.etat.osm.length - nOsm });

    console.log("— V3 : hors couverture (IGN en 404) —");
    s.etat.ignHors = true;
    await choisirVue(page, "ign-plan");
    const v3 = await page.evaluate(lireVue);
    verif("hors couverture : la tuile OSM remplace la tuile IGN",
      v3.tuilesOsm > 0 && s.etat.ign.some(function (u) { return /PLANIGNV2/.test(u); }), v3);
    verif("hors couverture : attribution IGN et OpenStreetMap", /IGN/.test(v3.attribution) && /OpenStreetMap/.test(v3.attribution),
      v3.attribution);
    s.etat.ignHors = false;

    console.log("— V4 : choix partagé avec le fond sous le plan —");
    await fermerVueOsm(page);
    await page.evaluate(function () { window.FondOsmPlan.basculerPanneau(document.getElementById("kta-refonte-counter-osm")); });
    await page.waitForTimeout(300);
    const p4 = await page.evaluate(function () { const s = document.querySelector("[data-fond-osm='fond']"); return s ? s.value : null; });
    verif("le panneau du fond sous le plan montre le fond choisi en Vue OSM (IGN plan)", p4 === "ign-plan", p4);
    await page.selectOption("[data-fond-osm='fond']", "ign-aerien");
    await page.evaluate(function () { window.FondOsmPlan.fermerPanneau(); });
    await ouvrirVueOsm(page);
    const v4 = await page.evaluate(lireVue);
    verif("la Vue OSM rouvre sur le fond choisi sous le plan (IGN aérien)", v4.valeur === "ign-aerien" && v4.tuilesIgn > 0, v4);

    console.log("— V5 : retour OSM —");
    await choisirVue(page, "osm");
    const nIgn = s.etat.ign.length;
    await page.evaluate(function () {
      const m = document.getElementById("kta-osm-map");
      m.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, clientX: 600, clientY: 400, bubbles: true }));
    });
    await page.waitForTimeout(1500);
    const v5 = await page.evaluate(lireVue);
    verif("retour OSM : tuiles OSM, plus aucune requête IGN, attribution OpenStreetMap seule",
      v5.tuilesOsm > 0 && v5.tuilesIgn === 0 && s.etat.ign.length === nIgn && /OpenStreetMap/.test(v5.attribution) &&
      !/IGN/.test(v5.attribution), { v5: v5, ign: s.etat.ign.length - nIgn });
    verif("retour OSM : « Sauvegarder hors-ligne » permis de nouveau", v5.cacheDesactive === false, v5.cacheDesactive);

    console.log("— V6 : rechargement —");
    await choisirVue(page, "ign-plan");
    await fermerVueOsm(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await ouvrirPlan(page, nom);
    await ouvrirVueOsm(page);
    const v6 = await page.evaluate(lireVue);
    verif("rechargement : la Vue OSM rouvre sur IGN plan", v6.valeur === "ign-plan" && v6.courant === "ign-plan" && v6.tuilesIgn > 0, v6);
    erreurs.push.apply(erreurs, s.etat.erreurs);
    await s.ctx.close();

    console.log("— V7 : Vue OSM refusée, fond IGN choisi —");
    s = await ouvrirPage(nav, nom, { ls: { "myktamap_osm_view_opt_in": "0", [CLE_FOND]: "ign-aerien" } });
    page = s.page;
    await page.evaluate(function () {
      window.ktaConfirm = function () { return Promise.resolve(false); };   // l'utilisateur refuse l'autorisation
      window.OsmView.open();
    });
    await page.waitForTimeout(2500);
    const v7 = await page.evaluate(function () { return !!document.getElementById("kta-osm-map"); });
    const allume7 = await page.evaluate(function () { return window.FondOsmPlan.allumer(); }).catch(function () { return null; });
    await page.waitForTimeout(1500);
    verif("Vue OSM refusée : ni fenêtre, ni fond sous le plan, aucune requête IGN ni OSM",
      !v7 && !allume7 && s.etat.ign.length === 0 && s.etat.osm.length === 0,
      { fenetre: v7, allume: allume7, ign: s.etat.ign.length, osm: s.etat.osm.length });
    erreurs.push.apply(erreurs, s.etat.erreurs);
    await s.ctx.close();

    console.log("— V8 : incognito, fond IGN choisi —");
    s = await ouvrirPage(nav, nom, { incognito: true, ls: { [CLE_FOND]: "ign-plan" } });
    page = s.page;
    const inco = await page.evaluate(function () { return !!(window.IncognitoMode && window.IncognitoMode.isActive()); });
    if (!inco) pb("incognito non actif avec ?incognito=1 : contrôle impossible");
    else {
      await page.evaluate(function () { window.OsmView.open(); });
      await page.waitForTimeout(2500);
      const v8 = await page.evaluate(function () { return !!document.getElementById("kta-osm-map"); });
      verif("incognito : Vue OSM refusée, aucune requête IGN ni OSM", !v8 && s.etat.ign.length === 0 && s.etat.osm.length === 0,
        { fenetre: v8, ign: s.etat.ign.length, osm: s.etat.osm.length });
    }
    erreurs.push.apply(erreurs, s.etat.erreurs);
    await s.ctx.close();

    console.log("— V9 : erreurs de page —");
    verif("aucune erreur de page", erreurs.length === 0, erreurs.slice(0, 3));
  } catch (e) {
    pb("exception : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
    console.log(problemes.length ? "\n❌ " + problemes.length + " problème(s)" : "\n✅ Fonds de carte de la Vue OSM");
    process.exit(problemes.length ? 1 : 0);
  }
})();
