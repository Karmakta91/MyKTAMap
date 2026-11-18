#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-largeur-traces-session.js — checkup (Playwright) : tracés de session et de calque, même trait au zoom
// =====================================================================
// Objets FICTIFS (relevé fictif, sinon le premier plan de l'index), échelle forcée à 2 px/m en mémoire : un tracé
// principal, une jonction et un itinéraire de session, un tracé principal et une jonction de calque factices. Au
// zoom minimal, intermédiaire et maximal, puis après un re-rendu de la session (ce que fait chaque modification) et
// avec la décimation PerfUltra (re-rendu complet au zoom), le tracé et la jonction de session ont l'épaisseur des
// mêmes types de calque (loi structures.js > ktaLargeurTracePourRatio), leur zone tactile = trait + 14 px (18 au
// moins), l'itinéraire garde son trait fixe ; même égalité sur un plan sans échelle (paliers). Avant, la session
// gardait les 5 px du style, plus épais que le calque au dézoom.
// Usage : node scripts/smoke/checkup-largeur-traces-session.js (SMOKE_PORT pour une autre copie) · code :
// js/road.js > ktaMajLargeurTracesSession, js/structures.js > majLargeurFronts · doc : docs/architecture/exports.md
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

// Zoom posé par Leaflet (zoomend → la loi se recalcule seule), ou « rendu » : re-rendu de la session sans zoom.
async function poser(page, cible) {
  await page.evaluate(function (c) {
    const m = window.map;
    if (c === "rendu") { window.renderRoads(); return; }
    const z = c === "min" ? m.getMinZoom() : (c === "max" ? m.getMaxZoom()
      : Math.round((m.getMinZoom() + m.getMaxZoom()) / 2));
    // Un zoom identique n'émet pas zoomend : on passe par un autre niveau.
    if (m.getZoom() === z) m.setZoom(z === m.getMaxZoom() ? z - 1 : z + 1, { animate: false });
    m.setZoom(z, { animate: false });
  }, cible);
  // Décimation : le re-rendu complet part 250 ms après le zoom (road.js > _renderRoadsThrottled).
  await page.waitForTimeout(450);
}

// Épaisseurs lues sur les couches rendues : session par son état de rendu (polyligne = 1re couche, zone tactile =
// couche transparente), calque par son registre.
function lire(page) {
  return page.evaluate(function () {
    const m = window.map;
    const out = { zoom: m.getZoom(), loi: window.ktaLargeurTracePourRatio(Math.pow(2, m.getZoom())), session: {}, calque: {} };
    (typeof _roadRenderState !== "undefined" ? _roadRenderState : []).forEach(function (e) {
      if (!e || !e.road || !/^rd_clt_/.test(e.road.uid || "")) return;
      const trait = e.layers[0];
      const fantome = e.layers.find(function (l) { return l.options && l.options.opacity === 0; });
      out.session[e.road.type] = {
        w: trait && trait.options.weight,
        fantome: fantome ? fantome.options.weight : null,
        surCarte: !!(trait && trait._map)
      };
    });
    window.__clt.calque.forEach(function (e) { out.calque[e.type] = e.polyline.options.weight; });
    return out;
  });
}

function controler(r, etiquette) {
  const s = r.session, c = r.calque;
  verifier(s.principal && s.principal.w === c.principal,
    etiquette + " (zoom " + r.zoom + ") : tracé de session = tracé de calque", { session: s.principal, calque: c.principal });
  verifier(s.principal && s.principal.w === r.loi,
    etiquette + " : tracé de session à la loi (" + r.loi + " px)", { session: s.principal && s.principal.w, loi: r.loi });
  verifier(s.jonction && s.jonction.w === c.jonction,
    etiquette + " : jonction de session = jonction de calque", { session: s.jonction, calque: c.jonction });
  verifier(s.principal && s.principal.fantome === Math.max(s.principal.w + 14, 18),
    etiquette + " : zone tactile du tracé = trait + 14 px (18 au moins)", s.principal);
  verifier(s.itinerary && s.itinerary.w === r.itiStyle,
    etiquette + " : l'itinéraire garde son trait fixe (" + r.itiStyle + " px)", s.itinerary);
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
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && typeof window.renderRoads === "function" &&
        typeof window.majLargeurFronts === "function";
    }, 40000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
      if (window.PerfUltra) { window.PerfUltra.set("decim", false); window.PerfUltra.set("viewportCull", false); }
      const c = window.map.getCenter();
      const x = Math.round(c.lng) - 60, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 60;
      window.APP_CONFIG.scale = 2;   // en mémoire seulement : jamais écrit dans les prefs du plan
      if (window.APP_CONFIG.multiLevel === true) window.APP_CONFIG.activeLevel = 0;
      const ligne = function (dy) {
        const pts = [];
        for (let i = 0; i < 12; i++) pts.push({ x: x + i * 10, y: y + dy + (i % 2) * 3 });
        return pts;
      };
      window.setRoads([
        { uid: "rd_clt_principal", type: "principal", level: 0, points: ligne(0) },
        { uid: "rd_clt_jonction", type: "jonction", fromLevel: 0, toLevel: 0, points: ligne(20) },
        { uid: "rd_clt_iti", type: "itinerary", points: ligne(40) }
      ]);
      // Tracés de CALQUE factices, rangés comme utils.js > ajouterPointsDepuisJSON (style 5 px du type).
      const calque = ["principal", "jonction"].map(function (type, i) {
        const st = window.ktaResolveStyle("traces", type);
        const pl = window.L.polyline(ligne(60 + i * 20).map(function (p) { return window.convertCoord(p.x, p.y); }),
          Object.assign({}, st, { interactive: false })).addTo(window.map);
        const e = { polyline: pl, type: type, level: 0, fromLevel: type === "jonction" ? 0 : undefined,
          toLevel: type === "jonction" ? 0 : undefined, origOpacity: 1 };
        window._ktaDataPolylines.push(e);
        return e;
      });
      window.__clt = { calque: calque };
    });

    const itiStyle = await page.evaluate(function () { return window.ktaResolveStyle("traces", "itinerary").weight; });
    const releves = {};
    for (const cible of ["min", "mid", "max"]) {
      await poser(page, cible);
      const r = await lire(page); r.itiStyle = itiStyle; releves[cible] = r;
      controler(r, "zoom " + cible);
    }
    verifier(releves.min.session.principal && releves.max.session.principal &&
      releves.min.session.principal.w < releves.max.session.principal.w,
      "le tracé de session s'affine au dézoom", { min: releves.min.session.principal, max: releves.max.session.principal });

    await poser(page, "min");
    await poser(page, "rendu");
    const rendu = await lire(page); rendu.itiStyle = itiStyle;
    controler(rendu, "zoom minimal, session redessinée (modification)");

    // Culling seul : au zoom, diff de l'état de rendu (road.js > _refreshRoadsViewportOnly), aucune couche recréée.
    // La bascule déclenche un re-rendu (PerfUltra.onChange) : la référence se prend après lui.
    await page.evaluate(function () { window.PerfUltra.set("viewportCull", true); });
    await page.waitForTimeout(450);
    await page.evaluate(function () {
      window.__clt.avant = _roadRenderState.filter(function (e) { return e.road.uid === "rd_clt_principal"; })[0].layers[0];
    });
    await poser(page, "max");
    const cull = await lire(page); cull.itiStyle = itiStyle;
    controler(cull, "culling PerfUltra seul, zoom max");
    verifier(await page.evaluate(function () {
      return _roadRenderState.filter(function (e) { return e.road.uid === "rd_clt_principal"; })[0].layers[0] === window.__clt.avant;
    }), "culling seul : la polyligne du tracé n'est pas recréée au zoom (trait muté en place)");
    await page.evaluate(function () { window.PerfUltra.set("decim", true); });
    for (const cible of ["max", "min"]) {
      await poser(page, cible);
      const r = await lire(page); r.itiStyle = itiStyle;
      controler(r, "décimation et culling PerfUltra, zoom " + cible);
    }
    await page.evaluate(function () { window.PerfUltra.set("decim", false); window.PerfUltra.set("viewportCull", false); });

    await page.evaluate(function () { window.APP_CONFIG.scale = 0; });
    await poser(page, "min");
    const sansEchelle = await lire(page); sansEchelle.itiStyle = itiStyle;
    controler(sansEchelle, "plan sans échelle (paliers), zoom minimal");

    await page.evaluate(function () {
      window.__clt.calque.forEach(function (e) {
        const i = window._ktaDataPolylines.indexOf(e);
        if (i >= 0) window._ktaDataPolylines.splice(i, 1);
        window.map.removeLayer(e.polyline);
      });
      window.setRoads([]);
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
  console.log("🎉 CHECKUP VERT — tracés de session et de calque : même trait à tout zoom.");
  process.exit(0);
})();
