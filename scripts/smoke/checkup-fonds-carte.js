#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-fonds-carte.js — checkup de release : fonds de carte (OSM, IGN aérien, IGN plan) de la Vue OSM, du widget
// de l'accueil et de la capture du briefing Secours
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
//   requête IGN · V8 incognito : idem · A1-A5 widget de l'accueil : suit le fond en direct, pied (domaine,
//   attribution) et 💾 refusé avec sa raison en IGN, repli OSM tuile par tuile, retour OSM, aucune requête IGN sans
//   la case ni en incognito · S1-S4 briefing Secours : capture html2canvas lisible (canvas non souillé) avec les
//   tuiles IGN, par la Vue OSM et par le repli hors écran, repli OSM sur 404, aucune requête IGN sans la case ni en
//   incognito · M1-M3 téléphone (390 px) : sélecteurs du fond dans l'écran · V9 aucune erreur de page.
// Usage : node scripts/smoke/checkup-fonds-carte.js   (SMOKE_PORT pour une copie de travail ; CAPTURES=<dossier> :
//   captures à 390 px, à regarder, jamais à commiter)
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
const CAPTURES = process.env.CAPTURES || null;
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
  const ctx = await nav.newContext({ viewport: o.viewport || { width: 1280, height: 820 }, serviceWorkers: "block" });
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

// ── Accueil : le plan ouvert reçoit son calage (l'accueil lit KmzExport), puis retour à l'accueil ──────────
async function allerAccueil(page) {
  await page.evaluate(function () {
    window.KmzExport.setCalibration(window._currentLoadedPlanId, window.PLAN_CONFIG.plan.georef);
    if (!window.__hookAcc) {
      window.__hookAcc = true;
      L.Map.addInitHook(function () { if (this.getContainer().id === "ktaOsmHomeMap") window.__acc = this; });
      window.__toasts = [];
      const t0 = window.OOMGuard.showToast;
      window.OOMGuard.showToast = function (m, type) {
        window.__toasts.push({ m: m, type: type });
        return t0.apply(this, arguments);
      };
    }
    window.__acc = null;
    window.afficherLoader();
  });
  await attendre(page, function () { return !!window.__acc && !!document.getElementById("ktaOsmHomeCacheBtn"); }, 30000);
  await page.waitForTimeout(2500);
}
// Accueil sans carte attendue (case décochée, incognito) : on y va et on laisse aux tuiles le temps de partir.
async function allerAccueilSansCarte(page) {
  await page.evaluate(function () {
    window.KmzExport.setCalibration(window._currentLoadedPlanId, window.PLAN_CONFIG.plan.georef);
    window.afficherLoader();
  });
  await page.waitForTimeout(3000);
}
function lireAccueil() {
  const tuiles = Array.from(document.querySelectorAll("#ktaOsmHomeMap .leaflet-tile-pane img.leaflet-tile"));
  const charge = function (re) {
    return tuiles.filter(function (t) { return re.test(t.src) && t.classList.contains("leaflet-tile-loaded"); }).length;
  };
  const btn = document.getElementById("ktaOsmHomeCacheBtn");
  const st = document.getElementById("ktaOsmHomeCacheStats");
  const pied = document.getElementById("ktaOsmHomeTuiles"), attr = document.getElementById("ktaOsmHomeAttr");
  return {
    tuilesIgn: charge(/data\.geopf\.fr/), tuilesOsm: charge(/tile\.openstreetmap\.org/),
    pied: pied ? pied.textContent : null, attribution: attr ? attr.textContent : null,
    cacheIndispo: btn ? (btn.getAttribute("aria-disabled") === "true" && btn.classList.contains("kta-osm-home-indispo")) : null,
    cacheTitre: btn ? btn.title : null, statsTitre: st ? st.title : null
  };
}
async function attendreAccueil(page) { await page.waitForTimeout(2000); return page.evaluate(lireAccueil); }

// ── Briefing Secours : html2canvas instrumenté (part des couleurs des tuiles fabriquées, canvas lisible ou souillé).
// `horsEcran` : Vue OSM déclarée indisponible, la capture passe par le repli hors écran (carte Leaflet à part).
async function briefing(page, horsEcran) {
  return page.evaluate(async function (horsEcran) {
    if (!window.__h2cInstrumente) {
      window.__h2cInstrumente = true;
      const orig = window.html2canvas;
      window.html2canvas = async function (el) {
        const c = await orig.apply(this, arguments);
        const r = { cible: el.id || "hors-écran", w: c.width, h: c.height, lisible: false };
        try {
          const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
          const proche = function (i, rgb) {
            return Math.abs(d[i] - rgb[0]) < 30 && Math.abs(d[i + 1] - rgb[1]) < 30 && Math.abs(d[i + 2] - rgb[2]) < 30;
          };
          let n = 0, ign = 0, osm = 0;
          for (let i = 0; i < d.length; i += 4 * 53) {
            n++;
            if (proche(i, [200, 40, 40]) || proche(i, [40, 40, 200])) ign++;
            else if (proche(i, [150, 200, 150])) osm++;
          }
          c.toDataURL("image/jpeg", 0.5);   // jette si le canvas est souillé
          r.lisible = true; r.ign = Math.round(ign / n * 100); r.osm = Math.round(osm / n * 100);
        } catch (e) { r.erreur = String((e && e.message) || e); }
        window.__captures.push(r);
        return c;
      };
    }
    window.__captures = [];
    const OV = window.OsmView, dispo = OV.isAvailable;
    if (horsEcran) OV.isAvailable = function () { return false; };
    const sc = window.SecoursMode.create("Essai fonds de carte (test)");
    try { await window.SecoursMode.genererBriefingPompiersPDF(sc.id); }
    finally { window.SecoursMode.delete(sc.id); OV.isAvailable = dispo; }
    return window.__captures;
  }, !!horsEcran);
}
// Le briefing lit le plan ouvert : on le rouvre s'il a été quitté (retour à l'accueil).
async function ouvrirPlanSiBesoin(page, nom) {
  const ouvert = await page.evaluate(function () {
    return !!(window.ktaPlanAffiche && window.ktaPlanAffiche()) && !document.getElementById("ktaOsmHomeMap");
  });
  if (!ouvert) await ouvrirPlan(page, nom);
}
// Élément entier dans la largeur de l'écran, et page sans défilement horizontal.
function dansEcran(sel) {
  const el = document.querySelector(sel);
  if (!el) return { ok: false, absent: sel };
  const r = el.getBoundingClientRect(), W = window.innerWidth;
  const deborde = document.documentElement.scrollWidth > W;
  return { ok: r.width > 0 && r.left >= 0 && r.right <= W && !deborde, gauche: Math.round(r.left),
           droite: Math.round(r.right), largeur: W, defilement: deborde };
}
async function captureMobile(page, nom) {
  if (!CAPTURES) return;
  fs.mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURES, nom + ".png") });
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

    console.log("— A1 : widget de l'accueil sur OpenStreetMap —");
    s = await ouvrirPage(nav, nom);
    page = s.page;
    await allerAccueil(page);
    const a1 = await attendreAccueil(page);
    verif("accueil OSM : tuiles OSM, aucune requête IGN, pied tile.openstreetmap.org et © OpenStreetMap, 💾 permis",
      a1.tuilesOsm > 0 && a1.tuilesIgn === 0 && s.etat.ign.length === 0 && /tile\.openstreetmap\.org/.test(a1.pied || "") &&
      /OpenStreetMap/.test(a1.attribution || "") && a1.cacheIndispo === false, a1);

    console.log("— A2 : le widget suit le fond choisi (IGN aérien) —");
    await page.evaluate(function () { window.KtaFondsCarte.choisir("ign-aerien"); });
    const a2 = await attendreAccueil(page);
    const raison = await cle(page, "fondscarte.horsLigne.osmSeul");
    verif("accueil IGN aérien : tuiles data.geopf.fr à la place des tuiles OSM, sans recharger",
      a2.tuilesIgn > 0 && a2.tuilesOsm === 0 && s.etat.ign.some(function (u) { return /ORTHOPHOTOS/.test(u); }), a2);
    verif("accueil IGN : pied data.geopf.fr, attribution IGN seule",
      /data\.geopf\.fr/.test(a2.pied || "") && !/openstreetmap/.test(a2.pied || "") && /IGN/.test(a2.attribution || "") &&
      !/OpenStreetMap/.test(a2.attribution || ""), a2);
    verif("accueil IGN : 💾 et stats du cache grisés, raison au survol",
      a2.cacheIndispo === true && a2.cacheTitre === raison && a2.statsTitre === raison, a2);
    const nCacheA = await page.evaluate(async function () { return (await window.OsmTilesCache.getStats()).count; });
    const nOsmA = s.etat.osm.length;
    await page.click("#ktaOsmHomeCacheBtn", { force: true });   // aria-disabled : Playwright le croit inactif
    await page.waitForTimeout(800);
    const a2b = await page.evaluate(async function () {
      return { cache: (await window.OsmTilesCache.getStats()).count, toasts: window.__toasts.slice() };
    });
    verif("accueil IGN : toucher 💾 affiche la raison (avertissement), rien d'enregistré, aucune tuile OSM demandée",
      a2b.cache === nCacheA && s.etat.osm.length === nOsmA &&
      a2b.toasts.some(function (t) { return t.m === raison && t.type === "warn"; }), { a2b: a2b, osm: s.etat.osm.length - nOsmA });

    console.log("— A3 : hors couverture (IGN en 404) dans le widget —");
    s.etat.ignHors = true;
    await page.evaluate(function () { window.KtaFondsCarte.choisir("ign-plan"); });
    const a3 = await attendreAccueil(page);
    verif("accueil hors couverture : tuile OSM à la place, attribution IGN et OpenStreetMap, pied avec les deux domaines",
      a3.tuilesOsm > 0 && s.etat.ign.some(function (u) { return /PLANIGNV2/.test(u); }) && /IGN/.test(a3.attribution || "") &&
      /OpenStreetMap/.test(a3.attribution || "") && /data\.geopf\.fr/.test(a3.pied || "") &&
      /tile\.openstreetmap\.org/.test(a3.pied || ""), a3);
    s.etat.ignHors = false;

    console.log("— A4 : retour OSM dans le widget —");
    await page.evaluate(function () { window.KtaFondsCarte.choisir("osm"); });
    await page.waitForTimeout(500);
    const nIgnA = s.etat.ign.length;
    await page.evaluate(function () { window.__acc.setZoom(window.__acc.getZoom() + 1, { animate: false }); });
    const a4 = await attendreAccueil(page);
    verif("accueil retour OSM : tuiles OSM, plus de requête IGN, pied et attribution OSM, 💾 permis",
      a4.tuilesOsm > 0 && a4.tuilesIgn === 0 && s.etat.ign.length === nIgnA && /tile\.openstreetmap\.org/.test(a4.pied || "") &&
      !/IGN/.test(a4.attribution || "") && a4.cacheIndispo === false && a4.cacheTitre !== raison,
      { a4: a4, ign: s.etat.ign.length - nIgnA });

    console.log("— S1 : briefing Secours en IGN, capture par la Vue OSM —");
    await page.evaluate(function () { window.KtaFondsCarte.choisir("ign-aerien"); });
    await ouvrirPlanSiBesoin(page, nom);
    const nIgnS = s.etat.ign.length;
    const s1 = await briefing(page, false);
    const c1 = s1.find(function (c) { return c.cible === "kta-osm-map"; });
    verif("briefing (Vue OSM, IGN aérien) : canvas lisible (non souillé), tuiles IGN dans l'image",
      !!c1 && c1.lisible && c1.ign >= 20 && s.etat.ign.length > nIgnS, s1);

    console.log("— S2 : briefing Secours en IGN, repli hors écran —");
    const s2 = await briefing(page, true);
    const c2 = s2.find(function (c) { return c.cible === "hors-écran"; });
    verif("briefing (hors écran, IGN aérien) : canvas lisible, tuiles IGN dans l'image",
      !!c2 && c2.lisible && c2.ign >= 20 && c2.osm === 0, s2);
    // 🩸 Autre couche, donc d'autres URL : la page garde en mémoire les images déjà décodées (IGN aérien de S2), qui
    // se chargeraient sans repasser par la route en 404.
    s.etat.ignHors = true;
    await page.evaluate(function () { window.KtaFondsCarte.choisir("ign-plan"); });
    const s2b = await briefing(page, true);
    const c2b = s2b.find(function (c) { return c.cible === "hors-écran"; });
    verif("briefing (hors écran, IGN en 404) : tuiles OSM à la place, canvas lisible",
      !!c2b && c2b.lisible && c2b.osm >= 20 && c2b.ign === 0, s2b);
    s.etat.ignHors = false;
    erreurs.push.apply(erreurs, s.etat.erreurs);
    await s.ctx.close();

    console.log("— A5 / S3 : case Vue OSM décochée, fond IGN choisi —");
    s = await ouvrirPage(nav, nom, { ls: { "myktamap_osm_view_opt_in": "0", [CLE_FOND]: "ign-aerien" } });
    page = s.page;
    const s3 = await briefing(page, false);
    await allerAccueilSansCarte(page);
    verif("sans la case : briefing et accueil sans aucune requête IGN", s.etat.ign.length === 0,
      { ign: s.etat.ign.length, captures: s3 });
    console.log("  ℹ️  repli hors écran du briefing sans la case : " + s.etat.osm.length + " requête(s) OSM");
    erreurs.push.apply(erreurs, s.etat.erreurs);
    await s.ctx.close();

    console.log("— A5 / S4 : incognito, fond IGN choisi —");
    s = await ouvrirPage(nav, nom, { incognito: true, ls: { [CLE_FOND]: "ign-plan" } });
    page = s.page;
    const s4 = await briefing(page, false);
    await allerAccueilSansCarte(page);
    verif("incognito : briefing et accueil sans aucune requête IGN", s.etat.ign.length === 0,
      { ign: s.etat.ign.length, captures: s4 });
    console.log("  ℹ️  repli hors écran du briefing en incognito : " + s.etat.osm.length + " requête(s) OSM");
    erreurs.push.apply(erreurs, s.etat.erreurs);
    await s.ctx.close();

    console.log("— M1-M3 : téléphone, 390 px —");
    s = await ouvrirPage(nav, nom, { viewport: { width: 390, height: 844 }, ls: { [CLE_FOND]: "ign-aerien" } });
    page = s.page;
    await ouvrirVueOsm(page);
    const m1 = await page.evaluate(dansEcran, "#kta-osm-fond");
    verif("Vue OSM à 390 px : sélecteur du fond entier dans l'écran, pas de défilement horizontal", m1.ok, m1);
    await captureMobile(page, "m1-vue-osm");
    await fermerVueOsm(page);
    await page.evaluate(function () { window.FondOsmPlan.basculerPanneau(document.getElementById("kta-refonte-counter-osm")); });
    await page.waitForTimeout(400);
    const m2 = await page.evaluate(dansEcran, "[data-fond-osm='fond']");
    verif("panneau du bouton carte à 390 px : sélecteur du fond entier dans l'écran", m2.ok, m2);
    await captureMobile(page, "m2-panneau-fond");
    await page.evaluate(function () { window.FondOsmPlan.fermerPanneau(); });
    await allerAccueil(page);
    await page.evaluate(function () { const b = document.getElementById("ktaOsmHomeCacheStats"); if (b) b.scrollIntoView(); });
    await page.waitForTimeout(300);
    const m3 = await page.evaluate(dansEcran, "#ktaOsmHomeCacheStats");
    verif("accueil à 390 px (IGN) : pied du widget dans l'écran", m3.ok, m3);
    await captureMobile(page, "m3-accueil-ign");
    await page.evaluate(function () { document.getElementById("ktaOsmHomeCacheBtn").scrollIntoView({ block: "center" }); });
    await captureMobile(page, "m3-accueil-bandeau");
    erreurs.push.apply(erreurs, s.etat.erreurs);
    await s.ctx.close();

    console.log("— V9 : erreurs de page —");
    verif("aucune erreur de page", erreurs.length === 0, erreurs.slice(0, 3));
  } catch (e) {
    pb("exception : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
    console.log(problemes.length ? "\n❌ " + problemes.length + " problème(s)" : "\n✅ Fonds de carte (Vue OSM, accueil, briefing Secours)");
    process.exit(problemes.length ? 1 : 0);
  }
})();
