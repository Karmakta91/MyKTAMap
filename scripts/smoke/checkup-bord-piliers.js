#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-bord-piliers.js — checkup (Playwright) : contour des piliers et murs selon le zoom
// =====================================================================
// Objets FICTIFS (relevé fictif, sinon le premier plan de l'index), échelle forcée à 2 px/m en mémoire : un
// pilier et un front de session, un pilier de calque factice. Au zoom minimal, le contour d'une surface (session et calque) tombe entre
// 0,5 et 1 px, son remplissage ne bouge pas ; au zoom maximal, il revient à son épaisseur d'origine (3 px) ;
// le front garde sa propre loi. Un contour fixe de 3 px recouvrait tout le pilier au dézoom.
// Usage : node scripts/smoke/checkup-bord-piliers.js (SMOKE_PORT pour une autre copie) · code :
// js/structures.js > majLargeurFronts · doc : docs/architecture/rendering-leaflet.md
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

// Zoom posé, largeurs recalculées, puis épaisseurs lues sur les couches rendues.
function lireAuZoom(page, extreme) {
  return page.evaluate(function (ext) {
    const m = window.map;
    m.setZoom(ext === "min" ? m.getMinZoom() : m.getMaxZoom(), { animate: false });
    window.majLargeurFronts();
    // Structures de session : pas de registre exposé ; reconnues par leur style (pilier-1 = remplissage doré
    // à 0,85, front-1 = trait doré sans remplissage) et par leur point de départ semé.
    const session = { pilier: null, front: null, fillOpacity: null };
    const semis = window.__cbp;
    m.eachLayer(function (l) {
      if (!l.options || !l._latlngs || !l.getLatLngs) return;
      const flat = [].concat.apply([], [].concat(l.getLatLngs()));
      const pres = flat.some(function (q) { return q && Math.abs(q.lng - semis.x) < 120 && Math.abs(window.PLAN_CONFIG.plan.imageHeight - q.lat - semis.y) < 120; });
      if (!pres) return;
      if (l.options.fill === true && session.pilier === null) { session.pilier = l.options.weight; session.fillOpacity = l.options.fillOpacity; }
      else if (l.options.fill !== true && session.front === null) session.front = l.options.weight;
    });
    const calque = [];
    (window._ktaDataStructurePolygons || []).forEach(function (e) {
      const lay = e && (e.polygon || e.polyline || e.layer);
      if (lay && lay.options && (lay.options.fill === true || Array.isArray(lay._latlngs && lay._latlngs[0]))) {
        calque.push(lay.options.weight);
      }
    });
    return { session: session, calque: calque.slice(0, 50), front: window.ktaLargeurFrontPourRatio(Math.pow(2, m.getZoom())) };
  }, extreme);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
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
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
      const c = window.map.getCenter();
      const x = Math.round(c.lng) - 50, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 50;
      window.__cbp = { x: x, y: y };
      window.APP_CONFIG.scale = 2;   // en mémoire seulement : jamais écrit dans les prefs du plan
      if (window.APP_CONFIG.multiLevel === true) window.APP_CONFIG.activeLevel = 0;
      window.setStructures([
        { uid: "st_cbp_pilier", type: "pilier-1", level: 0,
          points: [{ x: x + 40, y: y + 40 }, { x: x + 60, y: y + 40 }, { x: x + 60, y: y + 60 }, { x: x + 40, y: y + 60 }] },
        { uid: "st_cbp_front", type: "front-1", level: 0, points: [{ x: x + 10, y: y + 30 }, { x: x + 90, y: y + 30 }] }
      ]);
      if (typeof window.renderStructures === "function") window.renderStructures();
      // Pilier de CALQUE factice : une surface de 3 px rangée dans le registre des calques.
      const lay = window.L.polygon([window.convertCoord(x + 70, y + 70), window.convertCoord(x + 90, y + 70),
        window.convertCoord(x + 90, y + 90)], { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.85, weight: 3 })
        .addTo(window.map);
      window.__cbpCalque = { type: "pilier-1", level: 0, polygon: lay };
      window._ktaDataStructurePolygons.push(window.__cbpCalque);
    });
    await page.waitForTimeout(500);

    const bas = await lireAuZoom(page, "min");
    verifier(bas.session.pilier !== null && bas.session.pilier >= 0.5 && bas.session.pilier <= 1,
      "zoom minimal : contour du pilier de session entre 0,5 et 1 px", bas.session);
    verifier(bas.session.fillOpacity === 0.85, "zoom minimal : remplissage du pilier inchangé", bas.session);
    verifier(bas.session.front === bas.front, "zoom minimal : le front garde sa loi", { front: bas.session.front, loi: bas.front });
    verifier(bas.calque.length > 0 && bas.calque.every(function (w) { return w >= 0.5 && w <= 1; }),
      "zoom minimal : contour des surfaces de calque entre 0,5 et 1 px (" + bas.calque.length + " vue(s))", bas.calque.slice(0, 6));

    const haut = await lireAuZoom(page, "max");
    verifier(haut.session.pilier === Math.min(3, Math.max(0.5, haut.front / 4)),
      "zoom maximal : contour du pilier = le quart d'un front, plafonné à 3 px", { pilier: haut.session.pilier, front: haut.front });
    verifier(haut.session.pilier > bas.session.pilier, "le contour s'épaissit en zoomant", { bas: bas.session.pilier, haut: haut.session.pilier });

    await page.evaluate(function () {
      const i = window._ktaDataStructurePolygons.indexOf(window.__cbpCalque);
      if (i >= 0) window._ktaDataStructurePolygons.splice(i, 1);
      window.map.removeLayer(window.__cbpCalque.polygon);
      window.setStructures([]);
      if (typeof window.renderStructures === "function") window.renderStructures();
    });
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
  console.log("🎉 CHECKUP VERT — contour des piliers et murs : fin au dézoom, épaisseur d'origine au zoom.");
  process.exit(0);
})();
