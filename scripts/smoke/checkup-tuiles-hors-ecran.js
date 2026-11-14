#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-tuiles-hors-ecran.js — checkup de release : le tuilage V2 ne pose que les tuiles proches de l'écran
// =====================================================================
// Une image d'overlay n'est demandée qu'au moment où il est posé : poser tout le niveau coûte des centaines
// de requêtes et des dizaines de Mo sur un grand plan. Seules les tuiles proches de l'écran sont posées
// (tiling.js > ktaCullerTuilesV2). Mesure sur le vrai plan, au niveau le plus fin :
//   1. peu de tuiles posées et peu de REQUÊTES de tuiles parties (échoue si tout le niveau est posé) ;
//   2. aucun trou : chaque point de l'écran dans le plan est couvert, au départ ET après déplacement ;
//   3. filtre multi-niveau : niveau 0 masqué → aucune tuile ; ré-affiché → seulement les proches.
// Plan V2 FICTIF fabriqué par le checkup (aucun fichier : ni dans data/ ni ailleurs) : une entrée ajoutée à la
// volée à data/index.json, un plan-config V2 et des tuiles PNG unies générées en mémoire, servis par page.route
// (Service Worker bloqué : toutes les requêtes passent par l'interception). Grille de 32 × 20 tuiles au niveau
// le plus fin : assez grand pour que « tout le niveau posé » se voie.
// Usage : node scripts/smoke/checkup-tuiles-hors-ecran.js
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const zlib = require("zlib");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

// ── Plan V2 fictif ──
const TUILE = 512, NB_X = 32, NB_Y = 20;
const PLAN = { id: "checkup_v2_fictif", dossier: "data/checkup-v2-fictif", nom: "Plan V2 fictif du checkup" };
const PLAN_CONFIG = {
  plan: { name: PLAN.nom, version: "V2", author: "checkup", imageWidth: TUILE * NB_X, imageHeight: TUILE * NB_Y,
    baseImage: "data/fond.png", tiledV2: true },
  imageLayers: [], dataLayers: [], tracking: {}, icons: {}, iconsEmbarquees: [],
  tiling: { version: 2, tileSize: TUILE, format: "png", alpha: false, minNativeZoom: -3, maxNativeZoom: 0 }
};

// PNG uni (RVB 8 bits) de cote × cote : signature, IHDR, IDAT (zlib), IEND.
function pngUni(cote, r, v, b) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const crc = function (buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const bloc = function (type, data) {
    const t = Buffer.from(type, "ascii"), lg = Buffer.alloc(4), cs = Buffer.alloc(4);
    lg.writeUInt32BE(data.length);
    cs.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([lg, t, data, cs]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cote, 0); ihdr.writeUInt32BE(cote, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const ligne = Buffer.alloc(1 + cote * 3);
  for (let x = 0; x < cote; x++) { ligne[1 + x * 3] = r; ligne[2 + x * 3] = v; ligne[3 + x * 3] = b; }
  const brut = Buffer.alloc(ligne.length * cote);
  for (let y = 0; y < cote; y++) ligne.copy(brut, y * ligne.length);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), bloc("IHDR", ihdr),
    bloc("IDAT", zlib.deflateSync(brut)), bloc("IEND", Buffer.alloc(0))]);
}
// Une tuile par niveau (teinte distincte), le fond de repli en petit.
const TUILES = { "0": pngUni(TUILE, 90, 110, 140), "-1": pngUni(TUILE, 110, 130, 90),
  "-2": pngUni(TUILE, 140, 100, 90), "-3": pngUni(TUILE, 120, 120, 120) };
const FOND = pngUni(64, 100, 100, 100);

async function servirPlanFictif(page) {
  await page.route(/\/data\/index\.json(\?.*)?$/, async function (route) {
    const rep = await route.fetch();
    let idx;
    try { idx = await rep.json(); } catch (e) { idx = { plans: [] }; }
    idx.plans = (idx.plans || []).concat([{ id: PLAN.id, path: PLAN.dossier, name: PLAN.nom }]);
    await route.fulfill({ response: rep, contentType: "application/json", body: JSON.stringify(idx) });
  });
  const echap = PLAN.dossier.replace(/[/-]/g, "\\$&");
  await page.route(new RegExp("/" + echap + "/(.*)$"), function (route) {
    const p = new URL(route.request().url()).pathname.split("/" + PLAN.dossier + "/")[1] || "";
    const m = /tiles\/z(-?\d)\/x\d+_y-?\d+\.png$/.exec(p);
    if (p === "plan-config.json") {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(PLAN_CONFIG) });
    }
    if (m && TUILES[m[1]]) return route.fulfill({ contentType: "image/png", body: TUILES[m[1]] });
    if (/fond\.png$/.test(p)) return route.fulfill({ contentType: "image/png", body: FOND });
    return route.fulfill({ status: 404, body: "" });
  });
}

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }

(async function main() {
  let nav;
  nav = await lancerNavigateur(chromium);
  const erreurs = [];
  try {
    const ctx = await nav.newContext({ viewport: { width: 1200, height: 850 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    await servirPlanFictif(page);
    page.on("pageerror", function (e) { erreurs.push(String(e)); });
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

    // Tuiles du niveau, tuiles posées, points de l'écran (dans le plan) sans tuile posée
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
