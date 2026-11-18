#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-epaisseur-traits.js — checkup (Playwright) : réglage « Épaisseur des traits » sur la carte du plan
// =====================================================================
// Objets FICTIFS (relevé fictif, sinon le premier plan de l'index), échelle forcée à 2 px/m en mémoire : en session
// un tracé, un front, un mur en ligne, un arc et un pilier ; un tracé de calque factice. Par l'interface (curseur de
// Configuration de l'accueil), puis par KtaEpaisseurTraits :
//   1. ×2 double aussitôt (sans zoom) tracés de session et de calque, fronts, murs en ligne et arcs ; le contour du
//      pilier ne change pas ; la loi au zoom continue de s'appliquer, doublée ;
//   2. exports intacts : image PNG/PDF (MyKTAMapExporterGenererCanvas, même pipeline) et KML identiques à ×1 et ×2 ;
//      dans l'image, un tracé de session aussi épais qu'un tracé de calque (même loi) ;
//   3. le réglage vit dans localStorage, retrouvé au rechargement, borné à ×0,75 / ×2.
// Les deux cartes OSM : scripts/smoke/checkup-largeur-osm-home.js (phase ×2).
// Usage : node scripts/smoke/checkup-epaisseur-traits.js (SMOKE_PORT pour une autre copie) · code :
// js/structures.js > KtaEpaisseurTraits · doc : docs/architecture/ui.md § Épaisseur des traits
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
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function ouvrirPlan(page) {
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.evaluate(function () {
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.PLAN_CONFIG && typeof window.majLargeurFronts === "function";
  }, 40000);
  await page.waitForTimeout(1500);
}

// Épaisseurs rendues : session reconnue par le point de départ semé, calque par son registre ; loi du zoom courant.
function lire(page) {
  return page.evaluate(function () {
    const m = window.map, z = m.getZoom(), r = Math.pow(2, z);
    const out = { zoom: z, loi: { front: window.ktaLargeurFrontPourRatio(r), trace: window.ktaLargeurTracePourRatio(r),
      raye: window.ktaLargeurRayePourRatio(r) }, session: {}, calque: window.__cet.calque.polyline.options.weight };
    const s = window.__cet.semis;
    m.eachLayer(function (l) {
      if (!l.options || !l._latlngs || !l.getLatLngs || l.options.opacity === 0) return;
      const flat = [].concat.apply([], [].concat(l.getLatLngs()));
      const q = flat[0];
      if (!q) return;
      const x = Math.round(q.lng), y = Math.round(window.PLAN_CONFIG.plan.imageHeight - q.lat);
      const cle = Object.keys(s).find(function (k) { return Math.abs(s[k].x - x) <= 1 && Math.abs(s[k].y - y) <= 1; });
      if (cle && out.session[cle] === undefined) out.session[cle] = l.options.weight;
    });
    return out;
  });
}

const ep = function (w, f) { return Math.round(w * f * 10) / 10; };

function controler(r, f, etiquette, pilierRef) {
  const s = r.session;
  verifier(s.trace === ep(r.loi.trace, f) && r.calque === s.trace,
    etiquette + " : tracés de session et de calque à ×" + f + " de la loi (" + ep(r.loi.trace, f) + " px)",
    { session: s.trace, calque: r.calque, loi: r.loi.trace });
  verifier(s.front === ep(r.loi.front, f), etiquette + " : front à ×" + f + " (" + ep(r.loi.front, f) + " px)",
    { front: s.front, loi: r.loi.front });
  verifier(s.murLigne === ep(r.loi.front, f), etiquette + " : mur en ligne à ×" + f, { mur: s.murLigne, loi: r.loi.front });
  verifier(s.arc === ep(r.loi.raye, f), etiquette + " : arc à ×" + f + " (" + ep(r.loi.raye, f) + " px)",
    { arc: s.arc, loi: r.loi.raye });
  const bordLoi = Math.max(0.5, Math.min(3, r.loi.front / 4));
  verifier(s.pilier === bordLoi && (pilierRef === undefined || s.pilier === pilierRef),
    etiquette + " : contour du pilier à la loi seule (" + bordLoi + " px)", { pilier: s.pilier, ref: pilierRef });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 850 } });
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { if (localStorage.getItem(k) === null) localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!window.KtaEpaisseurTraits && !!document.getElementById("loaderEpaisseurTraits"); }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

    // ── Interface : curseur de Configuration de l'accueil ──
    await page.evaluate(function () { window._ouvrirLoaderConfig(); });
    await page.waitForTimeout(500);
    const ui0 = await page.evaluate(function () {
      const c = document.getElementById("loaderEpaisseurTraits");
      return { min: c.min, max: c.max, val: c.value, texte: document.getElementById("loaderEpaisseurTraitsVal").textContent };
    });
    verifier(ui0.min === "0.75" && ui0.max === "2" && ui0.val === "1" && /^×1$/.test(ui0.texte),
      "curseur ×0,75 à ×2, ×1 au départ, valeur affichée", ui0);
    const ui2 = await page.evaluate(function () {
      const c = document.getElementById("loaderEpaisseurTraits");
      c.value = "2"; c.dispatchEvent(new Event("input", { bubbles: true }));
      return { facteur: window.KtaEpaisseurTraits.facteur(), ls: localStorage.getItem("myktamap_epaisseur_traits_v1"),
        texte: document.getElementById("loaderEpaisseurTraitsVal").textContent };
    });
    verifier(ui2.facteur === 2 && ui2.ls === "2" && ui2.texte === "×2", "curseur à ×2 : réglage gardé sur l'appareil", ui2);
    await page.evaluate(function () { window.KtaEpaisseurTraits.poser(1); window._fermerLoaderConfig && window._fermerLoaderConfig(); });

    await ouvrirPlan(page);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
      if (window.PerfUltra) { window.PerfUltra.set("decim", false); window.PerfUltra.set("viewportCull", false); }
      const c = window.map.getCenter();
      const x = Math.round(c.lng) - 60, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 60;
      window.APP_CONFIG.scale = 2;   // en mémoire seulement : jamais écrit dans les prefs du plan
      if (window.APP_CONFIG.multiLevel === true) window.APP_CONFIG.activeLevel = 0;
      const semis = { trace: { x: x, y: y }, front: { x: x, y: y + 20 }, murLigne: { x: x, y: y + 40 },
        arc: { x: x, y: y + 60 }, pilier: { x: x + 40, y: y + 80 }, calque: { x: x, y: y + 120 } };
      const seg = function (p) { return [{ x: p.x, y: p.y }, { x: p.x + 100, y: p.y }]; };
      window.setRoads([{ uid: "rd_cet_trace", type: "principal", level: 0, points: seg(semis.trace) }]);
      // Tracé de CALQUE pour l'export : registre des routes embarquées d'un calque déclaré sans fichier (l'export
      // relit alors le registre, exporter.js > repli registre).
      const grp = window.L.layerGroup().addTo(window.map);
      window.dataLayerGroups = window.dataLayerGroups || {};
      window.dataLayerGroups["cet-calque"] = grp;
      window.PLAN_CONFIG.dataLayers = (window.PLAN_CONFIG.dataLayers || []).concat([
        { id: "cet-calque", label: "Calque checkup", file: "checkup/cet-absent.json", visible: true }]);
      window.registerEmbeddedRoad({ uid: "rd_cet_calque_exp", type: "principal", level: 0,
        points: seg({ x: x, y: y + 140 }) }, grp, true);
      window.setStructures([
        { uid: "st_cet_front", type: "front-1", level: 0, points: seg(semis.front) },
        { uid: "st_cet_mur", type: "mur-ligne", level: 0, points: seg(semis.murLigne) },
        { uid: "st_cet_arc", type: "arc", level: 0, points: seg(semis.arc) },
        { uid: "st_cet_pilier", type: "pilier-1", level: 0, points: [semis.pilier, { x: semis.pilier.x + 20, y: semis.pilier.y },
          { x: semis.pilier.x + 20, y: semis.pilier.y + 20 }, { x: semis.pilier.x, y: semis.pilier.y + 20 }] }
      ]);
      const st = window.ktaResolveStyle("traces", "principal");
      const pl = window.L.polyline(seg(semis.calque).map(function (p) { return window.convertCoord(p.x, p.y); }),
        Object.assign({}, st, { interactive: false })).addTo(window.map);
      const e = { polyline: pl, type: "principal", level: 0, origOpacity: 1 };
      window._ktaDataPolylines.push(e);
      delete semis.calque;
      window.__cet = { semis: semis, calque: e, region: { x: x - 20, y: y - 20, w: 160, h: 220 },
        exp: { x: x + 50, ySession: y, yCalque: y + 140 } };
      const m2 = window.map;
      m2.setZoom(Math.round((m2.getMinZoom() + m2.getMaxZoom()) / 2) + 1, { animate: false });
      window.majLargeurFronts();
    });
    await page.waitForTimeout(400);

    // Exports à ×1 : empreinte de l'image (région des objets) et du KML.
    const empreinte = function () {
      return page.evaluate(async function () {
        const cv = await window.MyKTAMapExporterGenererCanvas({ ann: { points: false, roads: true, zones: true, structures: true },
          scale: 2, bg: "white", includeImgLayers: false, region: window.__cet.region,
          dataLayers: { "cet-calque": true } });
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        // Épaisseur dessinée d'un tracé horizontal : lignes encrées dans la colonne du milieu, autour de son y.
        const R = window.__cet.region, E = window.__cet.exp;
        const epaisseur = function (yPlan) {
          const cx = Math.round((E.x - R.x) * 2), cy = Math.round((yPlan - R.y) * 2);
          let n = 0;
          for (let yy = Math.max(0, cy - 24); yy <= Math.min(cv.height - 1, cy + 24); yy++) {
            const i = (yy * cv.width + cx) * 4;
            if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) n++;
          }
          return n;
        };
        let h = 2166136261, encre = 0;
        for (let i = 0; i < d.length; i++) { h = Math.imul(h ^ d[i], 16777619) >>> 0; if ((i & 3) === 0 && d[i] < 250) encre++; }
        let kml = null;
        try {
          const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
          const t = window.KmzExport.buildTransformCalib({ pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
            pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2e-6 } });
          kml = window.KmzExport.genererKml({ transform: t, planName: "essai",
            include: { image: false, roads: true, structures: true, zones: false, points: false },
            data: { roads: window.getRoads(), structures: window.getStructures(), zones: [], points: [] } });
        } catch (e) { kml = "ERREUR " + e.message; }
        return { image: h + ":" + cv.width + "x" + cv.height, encre: encre, kml: kml,
          epSession: epaisseur(E.ySession), epCalque: epaisseur(E.yCalque) };
      });
    };
    const exp1 = await empreinte();
    verifier(exp1.encre > 0, "export : l'image de la région contient les objets (" + exp1.encre + " px)", exp1.encre);
    verifier(typeof exp1.kml === "string" && !/^ERREUR/.test(exp1.kml) && /LineString/.test(exp1.kml),
      "export : le KML se génère et porte des lignes", String(exp1.kml).slice(0, 120));
    verifier(exp1.epCalque > 0 && exp1.epSession === exp1.epCalque,
      "export : tracé de session aussi épais que le tracé de calque (" + exp1.epSession + " px / " + exp1.epCalque + " px)",
      { session: exp1.epSession, calque: exp1.epCalque });

    const r1 = await lire(page);
    controler(r1, 1, "×1 (zoom " + r1.zoom + ")");

    // ×2 sans zoom : la carte se repeint par l'événement du réglage.
    await page.evaluate(function () { window.KtaEpaisseurTraits.poser(2); });
    await page.waitForTimeout(300);
    const r2 = await lire(page);
    controler(r2, 2, "×2 sans zoom", r1.session.pilier);
    verifier(r2.session.trace === r1.session.trace * 2 && r2.session.front === r1.session.front * 2,
      "×2 double exactement le trait rendu", { avant: r1.session, apres: r2.session });

    const exp2 = await empreinte();
    verifier(exp2.image === exp1.image, "export image (PNG/PDF) identique à ×1 et ×2", { x1: exp1.image, x2: exp2.image });
    verifier(exp2.kml === exp1.kml, "export KML identique à ×1 et ×2");
    verifier(exp2.epSession === exp1.epSession && exp2.epCalque === exp1.epCalque,
      "export : épaisseurs inchangées par le réglage (" + exp2.epSession + " px)", { x1: exp1, x2: exp2 });

    // ×2 après un zoom minimal et après un re-rendu de la session.
    await page.evaluate(function () { const m = window.map; m.setZoom(m.getMinZoom(), { animate: false }); });
    await page.waitForTimeout(400);
    controler(await lire(page), 2, "×2 au zoom minimal");
    await page.evaluate(function () { window.renderRoads(); window.renderStructures(); });
    await page.waitForTimeout(300);
    controler(await lire(page), 2, "×2 après re-rendu de la session");

    // Bornes et persistance.
    const bornes = await page.evaluate(function () {
      const a = window.KtaEpaisseurTraits.poser(5), b = window.KtaEpaisseurTraits.poser(0.2);
      return { haut: a, bas: b };
    });
    verifier(bornes.haut === 2 && bornes.bas === 0.75, "réglage borné à ×0,75 / ×2", bornes);
    const r075 = await lire(page);
    controler(r075, 0.75, "×0,75");

    await page.evaluate(function () { window.KtaEpaisseurTraits.poser(1.5); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!window.KtaEpaisseurTraits; }, 20000);
    const relu = await page.evaluate(function () {
      return { f: window.KtaEpaisseurTraits.facteur(), curseur: document.getElementById("loaderEpaisseurTraits").value };
    });
    verifier(relu.f === 1.5 && relu.curseur === "1.5", "réglage retrouvé au rechargement (×1,5)", relu);
    await page.evaluate(function () { window.KtaEpaisseurTraits.poser(1); });

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — épaisseur des traits : ×2 double les traits de la carte, exports intacts.");
  process.exit(0);
})();
