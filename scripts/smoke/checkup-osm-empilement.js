#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-osm-empilement.js — checkup de release : dans la Vue OSM, les POI restent AU-DESSUS des tuiles du plan
// =====================================================================
// Le relevé fictif n'est ni tuilé ni géoréférencé : le checkup lui prête un tuilage V2 (chaque tuile déclarée
// dans RUNTIME_ASSETS, image opaque en data:) et un calage fictif en mer, puis ouvre la Vue OSM.
// 🩸 Pas de page.route pour servir les tuiles : le service worker de l'app fait la requête à sa place et
// l'interception ne la voit pas (tuiles en 404, cachées : le contrôle de pixels passait à vide).
// À chaque cran de molette, à chaque bascule 🖼️ Plan et après réouverture :
//   1. toutes les tuiles sont dans le pane `ktaOsmTuiles`, sous le `markerPane` ;
//   2. un seul niveau de tuiles à l'écran, autant d'images que de tuiles suivies par le module ;
//   3. pixels, à chaque échelle d'affichage (1, 1,25, 1,5, 2) : les pixels opaques de chaque icône visible
//      sont identiques avec et sans les tuiles (une tuile peinte par-dessus un POI change ces pixels —
//      contrôle négatif : pane remonté à 650, tout échoue).
// Usage : node scripts/smoke/checkup-osm-empilement.js   (SMOKE_PORT pour une copie de travail)
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1"
};
// PNG 1×1 opaque (magenta) : chaque tuile du plan ; le fragment `#z<n>` (ignoré au décodage) porte son niveau.
const PNG_TUILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4xrAFAANqAZsvHqYeAAAAAElFTkSuQmCC";

// Échelles d'affichage parcourues : écran standard, Windows à 125 % / 150 %, écran haute densité.
// OSM_ECHELLES=1,1.25 pour n'en jouer qu'une partie.
const ECHELLES = (process.env.OSM_ECHELLES || "1,1.25,1.5,2").split(",").map(Number)
  .filter(function (n) { return n > 0; });

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

// Dans la page : structure des panes et tuiles de la Vue OSM.
function structure() {
  const m = window.__ktaOsmCarte;
  const cont = document.getElementById("kta-osm-map");
  if (!m || !cont) return null;
  const imgs = Array.from(cont.querySelectorAll("img.leaflet-image-layer"));
  const pane = m.getPane("ktaOsmTuiles");
  const horsPane = imgs.filter(function (i) { return i.parentElement !== pane; }).length;
  const niveaux = {};
  imgs.forEach(function (i) { const z = (/#z(-?\d+)$/.exec(i.src) || [])[1]; niveaux[z] = (niveaux[z] || 0) + 1; });
  const cachees = imgs.filter(function (i) { return !i.complete || !i.naturalWidth || i.style.display === "none"; }).length;
  return {
    zoom: m.getZoom(), imgs: imgs.length, horsPane: horsPane, niveaux: Object.keys(niveaux).length,
    detailNiveaux: niveaux, cachees: cachees,
    zTuiles: pane ? +getComputedStyle(pane).zIndex : null,
    zMarqueurs: +getComputedStyle(m.getPane("markerPane")).zIndex
  };
}

// 🩸 Attendre que chaque marqueur soit à sa position calculée : après un cran de molette, un navigateur lent
// (WebKit) laisse les marqueurs plusieurs secondes à leur position d'animation ; deux captures prises avant
// et après leur dernier déplacement diffèrent partout et passent pour des icônes « recouvertes ».
async function marqueursPoses(page) {
  let stables = 0;
  const fin = Date.now() + 20000;
  while (stables < 3 && Date.now() < fin) {
    const ok = await page.evaluate(function () {
      const m = window.__ktaOsmCarte;
      if (!m || m._animatingZoom) return false;
      const c = m.getContainer().getBoundingClientRect();
      let ecart = 0;
      m.eachLayer(function (l) {
        if (!(l instanceof L.Marker) || !l._icon) return;
        const p = m.latLngToContainerPoint(l.getLatLng()), r = l._icon.getBoundingClientRect();
        ecart = Math.max(ecart, Math.hypot(r.left + r.width / 2 - c.left - p.x, r.top + r.height / 2 - c.top - p.y));
      });
      return ecart < 1;
    });
    stables = ok ? stables + 1 : 0;
    await page.waitForTimeout(150);
  }
}

// Pixels opaques (alpha ≥ 250) de chaque icône entièrement visible : capture avec tuiles (a) / sans (b).
async function pixelsIcones(page) {
  const masquer = function (v) {
    return page.evaluate(function (vis) { window.__ktaOsmCarte.getPane("ktaOsmTuiles").style.visibility = vis; }, v);
  };
  const a = await page.screenshot();
  await masquer("hidden"); await page.waitForTimeout(300);
  const b = await page.screenshot();
  await masquer(""); await page.waitForTimeout(200);
  return page.evaluate(async function (d) {
    function charger(src) {
      return new Promise(function (res, rej) { const i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; });
    }
    function pix(img) {
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height);
    }
    const A = pix(await charger("data:image/png;base64," + d.a)), B = pix(await charger("data:image/png;base64," + d.b));
    const m = window.__ktaOsmCarte;
    const r = document.getElementById("kta-osm-map").getBoundingClientRect();
    // capture en pixels physiques : échelle d'affichage (devicePixelRatio) appliquée aux positions CSS
    const ech = A.width / window.innerWidth, R = Math.ceil(ech);
    const tmp = document.createElement("canvas");
    const tx = tmp.getContext("2d", { willReadFrequently: true });
    let testes = 0, couverts = 0;
    m.getPane("markerPane").querySelectorAll(".leaflet-marker-icon").forEach(function (div) {
      // icône = <img> du divIcon, à la taille que lui donne le réglage 📐 (variable --kta-marker-scale)
      const mk = div.tagName === "IMG" ? div : div.querySelector("img");
      if (!mk) return;
      const bb = mk.getBoundingClientRect();
      if (bb.left < r.left + 2 || bb.top < r.top + 2 || bb.right > r.right - 2 || bb.bottom > r.bottom - 2) return;
      if (!mk.complete || !mk.naturalWidth) return;
      const S = Math.round(bb.width * ech);
      if (S < 4) return;
      tmp.width = S; tmp.height = S;
      tx.clearRect(0, 0, S, S);
      try { tx.drawImage(mk, 0, 0, S, S); } catch (e) { return; }
      const al = tx.getImageData(0, 0, S, S).data;
      const x0 = Math.round(bb.left * ech), y0 = Math.round(bb.top * ech);
      // 🩸 seulement les pixels opaques dont tout le voisinage l'est : à une échelle fractionnaire, le bord
      // d'une icône tombe entre deux pixels physiques et prend la couleur du fond (faux « recouvert »)
      const plein = function (x, y) {
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= S || yy >= S || al[(yy * S + xx) * 4 + 3] < 250) return false;
        }
        return true;
      };
      let opaques = 0, diff = 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (!plein(x, y)) continue;
        opaques++;
        const k = ((y0 + y) * A.width + (x0 + x)) * 4;
        if (Math.abs(A.data[k] - B.data[k]) > 14 || Math.abs(A.data[k + 1] - B.data[k + 1]) > 14
            || Math.abs(A.data[k + 2] - B.data[k + 2]) > 14) diff++;
      }
      if (opaques < 8) return;
      testes++;
      if (diff / opaques > 0.25) couverts++;
    });
    return { testes: testes, couverts: couverts };
  }, { a: a.toString("base64"), b: b.toString("base64") });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const erreurs = [];
  let pixelsTestes = 0;
  try {
    const nom = planFictif();
    if (!nom) { pb("relevé fictif absent de data/index.json"); return; }
    for (const echelle of ECHELLES) {
      console.log("\n══ échelle d'affichage " + echelle + " (devicePixelRatio) ══");
      const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: echelle });
      const page = await ctx.newPage();
      page.on("pageerror", function (e) { erreurs.push(String(e)); });
      await page.addInitScript(function (ls) {
        for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
        // la carte de la Vue OSM est privée au module : on la capte à sa création
        const iv = setInterval(function () {
          if (!window.L || !L.Map) return;
          clearInterval(iv);
          L.Map.addInitHook(function () { if (this.getContainer().id === "kta-osm-map") window.__ktaOsmCarte = this; });
        }, 5);
      }, LS_PREGATES);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
      await page.getByText(nom, { exact: false }).first().click();
      await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
      await page.waitForTimeout(2000);

      // Tuilage V2 et calage prêtés au relevé fictif (coordonnées fictives, en mer)
      const prep = await page.evaluate(function (png) {
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
            window.RUNTIME_ASSETS["data/tiles/z" + z + "/x" + c + "_y" + (-k) + "." + ext] = { url: png + "#z" + z };
          }
        }
        p.georef = { pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 }, pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2e-6 } };
        const nPoi = (typeof window.getAllEmbeddedPoints === "function") ? (window.getAllEmbeddedPoints() || []).length : 0;
        return { W: W, H: H, nPoi: nPoi };
      }, PNG_TUILE);
      inf("plan " + prep.W + "×" + prep.H + " px, " + prep.nPoi + " POI");

      await page.evaluate(function () { window.OsmView.open(); });
      await attendre(page, function () {
        return !!window.__ktaOsmCarte && document.querySelectorAll("#kta-osm-map img.leaflet-image-layer").length > 0;
      }, 30000);
      await page.waitForTimeout(1500);
      const centre = await page.evaluate(function () {
        const r = document.getElementById("kta-osm-map").getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });

      const controler = async function (lib, avecPixels) {
        await page.waitForTimeout(900);
        await marqueursPoses(page);
        const s = await page.evaluate(structure);
        let msg = lib + " (zoom " + s.zoom + ") : " + s.imgs + " tuile(s), niveaux " + JSON.stringify(s.detailNiveaux);
        const fautes = [];
        if (s.horsPane) fautes.push(s.horsPane + " tuile(s) hors du pane");
        if (!(s.zTuiles < s.zMarqueurs)) fautes.push("pane des tuiles (" + s.zTuiles + ") pas sous les marqueurs (" + s.zMarqueurs + ")");
        if (s.niveaux > 1) fautes.push(s.niveaux + " niveaux de tuiles superposés");
        // une tuile non peinte rendrait le contrôle de pixels muet
        if (s.cachees) fautes.push(s.cachees + " tuile(s) non chargée(s) ou cachée(s)");
        if (avecPixels) {
          const px = await pixelsIcones(page);
          pixelsTestes += px.testes;
          msg += ", " + px.testes + " icône(s) testée(s)";
          if (px.couverts) fautes.push(px.couverts + " icône(s) recouverte(s) par une tuile");
        }
        if (fautes.length) pb(msg + " — " + fautes.join(" ; "));
        else ok(msg);
        return s;
      };
      const roue = async function (k) {
        await page.mouse.move(centre.x, centre.y);
        for (let i = 0; i < Math.abs(k); i++) { await page.mouse.wheel(0, k > 0 ? -120 : 120); await page.waitForTimeout(600); }
      };
      const basculerPlan = async function () { await page.click("#kta-osm-plan-toggle"); await page.waitForTimeout(500); };

      console.log("— 1 : crans de molette —");
      await controler("ouverture", true);
      for (let i = 1; i <= 4; i++) { await roue(1); await controler("molette +" + i, true); }
      for (let i = 1; i <= 3; i++) { await roue(-1); await controler("molette −" + i, true); }

      console.log("— 2 : 🖼️ Plan décoché pendant les zooms, puis recoché —");
      await basculerPlan();
      await roue(2);
      await roue(-1);
      await basculerPlan();
      await controler("Plan recoché", true);
      await basculerPlan(); await basculerPlan();
      await roue(1);
      await controler("Plan décoché-recoché puis zoom", true);

      console.log("— 3 : réouverture —");
      await page.click("#kta-osm-close"); await page.waitForTimeout(600);
      await page.evaluate(function () { window.OsmView.open(); });
      await attendre(page, function () {
        return document.querySelectorAll("#kta-osm-map img.leaflet-image-layer").length > 0;
      }, 30000);
      await controler("réouverture", true);
      await roue(2);
      await controler("réouverture, molette +2", true);

      console.log("— 4 : réouverture case 🖼️ Plan décochée —");
      await basculerPlan();
      await page.click("#kta-osm-close"); await page.waitForTimeout(600);
      await page.evaluate(function () { window.OsmView.open(); });
      await attendre(page, function () { return !!document.getElementById("kta-osm-plan-toggle") && !!window.__ktaOsmCarte; }, 30000);
      await page.waitForTimeout(2000);
      const decoche = await page.evaluate(function () {
        return { coche: document.getElementById("kta-osm-plan-toggle").checked,
                 imgs: document.querySelectorAll("#kta-osm-map img.leaflet-image-layer").length };
      });
      if (!decoche.coche && decoche.imgs === 0) ok("case décochée, aucune tuile affichée");
      else pb("réouverture : case " + (decoche.coche ? "cochée" : "décochée") + ", " + decoche.imgs + " tuile(s) affichée(s)");
      await basculerPlan();
      await controler("Plan recoché après réouverture", true);
      await ctx.close();
    }

    if (pixelsTestes > 0) ok(pixelsTestes + " contrôles d'icône au total");
    else pb("aucune icône opaque testée : le contrôle de pixels n'a rien vu");
    if (erreurs.length) pb("erreurs de page : " + erreurs.slice(0, 3).join(" | "));
  } catch (e) {
    pb("exception : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
    console.log(problemes.length ? "\n❌ " + problemes.length + " problème(s)" : "\n✅ Vue OSM : POI au-dessus des tuiles");
    process.exit(problemes.length ? 1 : 0);
  }
})();
