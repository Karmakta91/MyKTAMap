#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-largeur-osm-home.js — fronts et contours à la loi de largeur sur la carte OSM de l'accueil
// =====================================================================
// Relevé fictif seulement, calage fictif en mer. Le checkup pose en session un relevé DENSE fabriqué (piliers en
// grille et fronts en peigne), le même relevé sous un second id empilé, puis lit la largeur RENDUE (attribut
// `stroke-width` du SVG, pas `options.weight`) :
//   1. très dézoomé : fronts au plancher de la loi, contours des piliers et murs à leur plancher (comme en mode
//      plan, structures.js > ktaBordSurfacePourLargeur), sur le plan principal ET le plan empilé ;
//   2. de près : fronts à la loi (lisibles), contours jamais plus épais que leur trait d'origine ;
//   3. après un re-rendu (filtre basculé) : la loi s'applique encore aux deux plans ;
//   4. Vue OSM (modale) : même loi pour les contours ;
//   5. Vue OSM fermée dans la même image qu'un zoom, redessin en attente : aucune erreur de page ;
//   6. réglage « Épaisseur des traits » à ×2 (structures.js > KtaEpaisseurTraits) : fronts, tracés et arcs doublés
//      sur les deux cartes, contours inchangés, puis retour à ×1.
// CAPTURES=<dossier> : captures très dézoomé / de près (à regarder, jamais à commiter).
// Usage : node scripts/smoke/checkup-largeur-osm-home.js   (SMOKE_PORT pour une copie de travail)
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
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
const PNG_TUILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4xrAFAANqAZsvHqYeAAAAAElFTkSuQmCC";
const ID_B = "essai-largeur-b";
const N_PILIERS = 1300, N_FRONTS = 80, N_ARCS = 4;

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
function verif(lib, cond, detail) { if (cond) ok(lib); else pb(lib + (detail ? " — " + detail : "")); }

async function capture(page, nom) {
  if (!CAPTURES) return;
  fs.mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURES, nom + ".png") });
}

// Dans la page : largeurs RENDUES des structures de la carte de l'accueil, par pane de plan (fronts / surfaces),
// et la loi attendue au zoom courant.
// `f` : réglage « Épaisseur des traits » attendu (×1 par défaut) ; les contours gardent la loi seule.
function lireLargeursHome(a) {
  const idB = a.idB, f = a.f || 1;
  const ep = function (w) { return Math.round(w * f * 10) / 10; };
  const m = window.__acc;
  const pxm = m ? window.ktaPxParMetreOsm(m) : null;
  const loiBrute = pxm ? window.ktaLargeurFrontPourPxParMetre(pxm) : null;
  const loi = loiBrute ? ep(loiBrute) : null;
  const wTrace = loiBrute ? ep(Math.max(1, Math.round(loiBrute * 0.6 * 10) / 10)) : null;
  const wRaye = loiBrute ? ep(Math.max(2, Math.round(loiBrute * 0.6 * 10) / 10)) : null;
  const parPlan = {};
  document.querySelectorAll("[class*='leaflet-ktaOsmPlan_'][class*='-pane']").forEach(function (pane) {
    const cls = Array.from(pane.classList).find(function (c) { return /^leaflet-ktaOsmPlan_/.test(c); });
    const id = cls.replace(/^leaflet-ktaOsmPlan_/, "").replace(/-pane$/, "");
    const fronts = [], traces = [], bords = [];
    const arcs = [], rayures = [];
    pane.querySelectorAll("path").forEach(function (p) {
      const w = parseFloat(p.getAttribute("stroke-width"));
      if (!Number.isFinite(w)) return;
      if (p.classList.contains("kta-osm-arc")) {
        if (p.classList.contains("kta-osm-arc-rayures")) {
          rayures.push({ w: w, c: String(p.getAttribute("stroke") || "").toLowerCase(),
                         tirets: !!p.getAttribute("stroke-dasharray") });
        } else arcs.push(w);
        return;
      }
      const c = String(p.getAttribute("stroke") || "").toLowerCase();
      // fronts : trait jaune ou orange ; piliers / murs : contour noir ; tracés : autre trait sans remplissage
      // (les zones gardent leur trait, comme en mode plan)
      if (p.getAttribute("fill") === "none") (c === "#f4c542" || c === "#ff9933" ? fronts : traces).push(w);
      else if (c === "#000000") bords.push(w);
    });
    parPlan[id === idB ? "B" : "A"] = {
      fronts: fronts.length, frontsMax: fronts.length ? Math.max.apply(null, fronts) : null,
      frontsMin: fronts.length ? Math.min.apply(null, fronts) : null,
      traces: traces.length, tracesKo: traces.filter(function (w) { return w !== wTrace; }).length,
      surfaces: bords.length, bordMax: bords.length ? Math.max.apply(null, bords) : null,
      arcs: arcs.length, arcsKo: arcs.filter(function (w) { return w !== wRaye; }).length,
      rayures: rayures.length,
      rayuresKo: rayures.filter(function (r) { return r.w !== wRaye || r.c !== "#cc0000" || !r.tirets; }).length
    };
  });
  return { zoom: m ? m.getZoom() : null, pxm: pxm, loi: loi,
           wTrace: wTrace, bordLoi: loiBrute ? Math.max(0.5, Math.min(1, loiBrute / 4)) : null, parPlan: parPlan };
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const erreurs = [];
  try {
    const nom = planFictif();
    if (!nom) { pb("relevé fictif absent de data/index.json"); return; }
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 } });
    const page = await ctx.newPage();
    page.on("pageerror", function (e) { erreurs.push(String(e)); });
    await page.addInitScript(function (ls) {
      for (const k in ls) { try { if (localStorage.getItem(k) === null) localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.getByText(nom, { exact: false }).first().click();
    await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
    await page.waitForTimeout(2000);
    // poignées des deux cartes OSM (aucune n'est exposée par les modules)
    await page.evaluate(function () {
      L.Map.addInitHook(function () {
        const id = this.getContainer().id;
        if (id === "ktaOsmHomeMap") window.__acc = this;
        if (id === "kta-osm-map") window.__ktaOsmCarte = this;
      });
    });

    // Calage fictif + relevé dense fabriqué en session (piliers de 2 m en grille, fronts en peigne)
    const idA = await page.evaluate(function (a) {
      const id = window._currentLoadedPlanId;
      const pc = window.PLAN_CONFIG, p = pc.plan;
      const W = p.imageWidth || window.APP_CONFIG.imageWidth, H = p.imageHeight || window.APP_CONFIG.imageHeight;
      p.imageWidth = W; p.imageHeight = H;
      // la modale OSM n'ouvre qu'un plan tuilé V2 : tuilage prêté (tuiles = PNG en data:)
      p.tiledV2 = true;
      pc.tiling = { minNativeZoom: -3, maxNativeZoom: 0, tileSize: 256, format: "png" };
      const ext = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(pc.tiling) : "jpg";
      window.RUNTIME_ASSETS = window.RUNTIME_ASSETS || {};
      for (let z = -3; z <= 0; z++) {
        const sc = Math.pow(2, -z);
        const cols = Math.ceil(Math.ceil(W / sc) / 256), rows = Math.ceil(Math.ceil(H / sc) / 256);
        for (let c = 0; c < cols; c++) for (let k = 1; k <= rows; k++) {
          window.RUNTIME_ASSETS["data/tiles/z" + z + "/x" + c + "_y" + (-k) + "." + ext] = { url: a.png };
        }
      }
      const g = { pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 }, pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2e-6 } };
      window.KmzExport.setCalibration(id, g);
      p.georef = g;
      const sc = Number(window.APP_CONFIG.scale) > 0 ? Number(window.APP_CONFIG.scale) : 2;
      const cote = 2 * sc;
      const structs = [];
      const cols = Math.ceil(Math.sqrt(a.nPiliers * W / H));
      const pas = W / (cols + 1);
      for (let i = 0; i < a.nPiliers; i++) {
        const x = pas * (1 + (i % cols)), y = pas * (1 + Math.floor(i / cols));
        if (y + cote > H) break;
        structs.push({ type: i % 7 === 0 ? "mur" : (i % 2 ? "pilier-1" : "pilier-2"), level: 0,
          points: [{ x: x, y: y }, { x: x + cote, y: y }, { x: x + cote, y: y + cote }, { x: x, y: y + cote }] });
      }
      for (let f = 0; f < a.nFronts; f++) {
        const y = H * (f + 0.5) / a.nFronts;
        structs.push({ type: f % 2 ? "front-1" : "front-2", level: 0,
          points: [{ x: W * 0.05, y: y }, { x: W * 0.5, y: y + pas / 2 }, { x: W * 0.95, y: y }] });
      }
      // arcs de soutènement : rayés de rouge sur les deux cartes (sinon confondus avec le mur en ligne)
      for (let k = 0; k < a.nArcs; k++) {
        const x = W * (k + 1) / (a.nArcs + 1);
        structs.push({ type: "arc", level: 0, points: [{ x: x, y: H * 0.2 }, { x: x, y: H * 0.8 }] });
      }
      window.setStructures(structs);
      window.SessionPersist.save();
      return id;
    }, { png: PNG_TUILE, nPiliers: N_PILIERS, nFronts: N_FRONTS, nArcs: N_ARCS });
    await page.waitForTimeout(2000);

    // ── Vue OSM (modale) : plan chargé, même loi ──
    console.log("— Vue OSM (modale) —");
    await page.evaluate(function () { window.__ktaOsmCarte = null; window.OsmView.open(); });
    await attendre(page, function () { return !!document.getElementById("kta-osm-view-overlay") && !!window.__ktaOsmCarte; }, 30000);
    await page.waitForTimeout(2000);
    const modale = await page.evaluate(function () {
      const m = window.__ktaOsmCarte;
      if (!m) return null;
      const res = [];
      [15, 19].forEach(function (z) {
        m.setZoom(z, { animate: false });
        m.fire("zoomend");
        const loi = window.ktaLargeurFrontPourPxParMetre(window.ktaPxParMetreOsm(m));
        let fronts = 0, frontsKo = 0, surf = 0, bordMax = 0, arcs = 0, arcsKo = 0;
        const wRaye = Math.max(2, Math.round(loi * 0.6 * 10) / 10);
        m.eachLayer(function (l) {
          if (!(l instanceof L.Polyline) || !l.options) return;
          const c = String(l.options.color || "").toLowerCase();
          // piliers / murs : contour noir ; fronts : trait jaune ou orange (couleurs du canon)
          if (l.options.ktaRayures) {
            arcs++; if (String(l.options.ktaRayures).toLowerCase() !== "#cc0000" || l.options.weight !== wRaye) arcsKo++;
            return;
          }
          if (l.options.fill === true && c === "#000000") { surf++; bordMax = Math.max(bordMax, l.options.weight); }
          else if (l.options.fill !== true && (c === "#f4c542" || c === "#ff9933")) {
            fronts++; if (l.options.weight !== loi) frontsKo++;
          }
        });
        res.push({ zoom: m.getZoom(), loi: loi, bordLoi: Math.max(0.5, Math.min(2, loi / 4)),
                   fronts: fronts, frontsKo: frontsKo, surfaces: surf, bordMax: bordMax, arcs: arcs, arcsKo: arcsKo });
      });
      return res;
    });
    if (!modale) pb("Vue OSM : carte introuvable");
    else {
      modale.forEach(function (r) {
        if (!r.fronts || !r.surfaces) { pb("Vue OSM zoom " + r.zoom + " : structures absentes " + JSON.stringify(r)); return; }
        verif("Vue OSM zoom " + r.zoom + " : " + r.fronts + " fronts à la loi (" + r.loi + " px)", r.frontsKo === 0,
              r.frontsKo + " hors loi");
        verif("Vue OSM zoom " + r.zoom + " : " + r.arcs + " arcs rayés de rouge, à la loi des arcs",
              r.arcs === N_ARCS && r.arcsKo === 0, JSON.stringify({ arcs: r.arcs, arcsKo: r.arcsKo }));
        verif("Vue OSM zoom " + r.zoom + " : contours des " + r.surfaces + " surfaces ≤ " + r.bordLoi + " px",
              r.bordMax <= r.bordLoi, "vu " + r.bordMax);
      });
    }

    // Vue OSM, réglage « Épaisseur des traits » à ×2 : fronts et arcs doublés aussitôt, contours inchangés.
    const modale2 = await page.evaluate(function () {
      const m = window.__ktaOsmCarte;
      if (!m) return null;
      window.KtaEpaisseurTraits.poser(2);
      const loi = window.ktaLargeurFrontPourPxParMetre(window.ktaPxParMetreOsm(m));
      const wRaye = Math.max(2, Math.round(loi * 0.6 * 10) / 10);
      let fronts = 0, frontsKo = 0, surf = 0, bordMax = 0, arcs = 0, arcsKo = 0;
      m.eachLayer(function (l) {
        if (!(l instanceof L.Polyline) || !l.options) return;
        const c = String(l.options.color || "").toLowerCase();
        if (l.options.ktaRayures) { arcs++; if (l.options.weight !== Math.round(wRaye * 20) / 10) arcsKo++; return; }
        if (l.options.fill === true && c === "#000000") { surf++; bordMax = Math.max(bordMax, l.options.weight); }
        else if (l.options.fill !== true && (c === "#f4c542" || c === "#ff9933")) {
          fronts++; if (l.options.weight !== Math.round(loi * 20) / 10) frontsKo++;
        }
      });
      window.KtaEpaisseurTraits.poser(1);
      return { zoom: m.getZoom(), loi: loi, bordLoi: Math.max(0.5, Math.min(2, loi / 4)), fronts: fronts,
               frontsKo: frontsKo, surfaces: surf, bordMax: bordMax, arcs: arcs, arcsKo: arcsKo };
    });
    if (!modale2) pb("Vue OSM ×2 : carte introuvable");
    else {
      verif("Vue OSM ×2 (zoom " + modale2.zoom + ") : " + modale2.fronts + " fronts au double de la loi (" +
            (modale2.loi * 2) + " px)", modale2.fronts > 0 && modale2.frontsKo === 0, modale2.frontsKo + " hors");
      verif("Vue OSM ×2 : " + modale2.arcs + " arcs au double de leur loi", modale2.arcs === N_ARCS && modale2.arcsKo === 0,
            JSON.stringify(modale2));
      verif("Vue OSM ×2 : contours des " + modale2.surfaces + " surfaces inchangés (≤ " + modale2.bordLoi + " px)",
            modale2.surfaces > 0 && modale2.bordMax <= modale2.bordLoi, "vu " + modale2.bordMax);
    }

    // 🩸 Modale fermée dans la même image qu'un zoom, un redessin déjà en attente : la repeinture de la loi ne doit
    // pas laisser partir l'image programmée sur un renderer démonté (TypeError sur le contexte supprimé).
    const avantFermeture = erreurs.length;
    const fermeture = await page.evaluate(function () {
      const m = window.__ktaOsmCarte;
      let lay = null;
      m.eachLayer(function (l) { if (!lay && l instanceof L.Polyline && l.options && l.options.fill === true) lay = l; });
      if (!lay) return "aucune couche";
      lay.setStyle({ fillOpacity: lay.options.fillOpacity });   // pose un redessin en attente
      const enAttente = !!(m._renderer && m._renderer._redrawRequest);
      m.fire("zoomend");
      const b = document.getElementById("kta-osm-close");
      if (b) b.click();
      return enAttente ? "ok" : "pas de redessin en attente";
    });
    await page.waitForTimeout(500);
    verif("Vue OSM fermée juste après un zoom : aucune erreur de page", fermeture === "ok" &&
          erreurs.length === avantFermeture, fermeture + " · " + erreurs.slice(avantFermeture).join(" | "));

    // Accueil, plan chargé derrière, puis le même relevé sous un second id empilé
    await page.evaluate(function () { window.afficherLoader(); });
    await attendre(page, function () { return !!document.getElementById("ktaOsmHomeFiltersBtn") && !!window.__acc; }, 30000);
    await page.waitForTimeout(2500);
    await page.evaluate(function (a) {
      const R = window.PlanRegistry;
      const b = Object.assign({}, R.findById(a.idA), { id: a.idB, name: "Relevé fictif B" });
      delete b.lastOpened;
      R.addOrUpdate(b);
      window.KmzExport.setCalibration(a.idB, window.KmzExport.getCalibration
        ? window.KmzExport.getCalibration(a.idA) : window.PLAN_CONFIG.plan.georef);
      // la session de A sert aussi à B : même relevé dense
      const s = window.SessionPersist.getSaved(a.idA);
      const orig = window.SessionPersist.getSaved;
      window.SessionPersist.getSaved = function (id) { return id === a.idB ? s : orig.apply(this, arguments); };
      window.OsmHomePreview.refresh();
    }, { idA: idA, idB: ID_B });
    await page.waitForTimeout(2000);
    await page.click("#ktaOsmHomeFiltersBtn");
    await attendre(page, function () { return !!document.getElementById("ktaOsmMultiAdd"); }, 10000);
    await page.selectOption("#ktaOsmMultiAdd", ID_B);
    await page.waitForTimeout(2500);
    await page.click("#kta-osm-filters-close");
    await page.evaluate(function () { window.OsmHomePreview.openFullScreen(); });
    await page.waitForTimeout(1500);

    const zoomer = async function (z) {
      await page.evaluate(function (zz) { window.__acc.setZoom(zz, { animate: false }); }, z);
      await page.waitForTimeout(1200);
      return page.evaluate(lireLargeursHome, { idB: ID_B });
    };
    const controler = function (lib, r, deLoin) {
      ["A", "B"].forEach(function (k) {
        const e = r.parPlan[k];
        if (!e || !e.fronts || !e.surfaces) { pb(lib + " plan " + k + " : structures absentes " + JSON.stringify(e)); return; }
        verif(lib + " plan " + k + " : " + e.fronts + " fronts à la loi (" + r.loi + " px, vu " + e.frontsMin + "–" +
              e.frontsMax + ")", e.frontsMax === r.loi && e.frontsMin === r.loi);
        if (e.traces) verif(lib + " plan " + k + " : " + e.traces + " tracés à la loi des tracés (" + r.wTrace + " px)",
                            e.tracesKo === 0, e.tracesKo + " hors loi");
        verif(lib + " plan " + k + " : " + e.arcs + " arcs, chacun rayé de rouge en tirets, à la loi des arcs",
              e.arcs === N_ARCS && e.rayures === N_ARCS && e.arcsKo === 0 && e.rayuresKo === 0,
              JSON.stringify({ arcs: e.arcs, rayures: e.rayures, arcsKo: e.arcsKo, rayuresKo: e.rayuresKo }));
        if (deLoin) {
          verif(lib + " plan " + k + " : contours de " + e.surfaces + " surfaces au plancher (" + r.bordLoi +
                " px, vu ≤ " + e.bordMax + ")", e.bordMax <= r.bordLoi);
        } else {
          verif(lib + " plan " + k + " : contours jamais plus épais que leur trait d'origine (vu ≤ " + e.bordMax + ")",
                e.bordMax <= 1);
        }
      });
    };

    console.log("— très dézoomé —");
    const loin = await zoomer(15);
    console.log("    zoom " + loin.zoom + ", " + (loin.pxm ? loin.pxm.toFixed(3) : "?") + " px/m, loi " + loin.loi + " px");
    controler("très dézoomé :", loin, true);
    await capture(page, "accueil-tres-dezoome");

    console.log("— de près —");
    const pres = await zoomer(19);
    console.log("    zoom " + pres.zoom + ", " + (pres.pxm ? pres.pxm.toFixed(2) : "?") + " px/m, loi " + pres.loi + " px");
    verif("de près : fronts plus épais que de loin (" + pres.loi + " px)", pres.loi > loin.loi, String(pres.loi));
    controler("de près :", pres, false);
    await capture(page, "accueil-de-pres");

    console.log("— re-rendu (filtre basculé) —");
    await zoomer(15);
    await page.evaluate(function () { window.dispatchEvent(new CustomEvent("kta:tailleIconesChange")); });
    await page.waitForTimeout(1500);
    const rerendu = await page.evaluate(lireLargeursHome, { idB: ID_B });
    controler("après re-rendu :", rerendu, true);

    // Réglage « Épaisseur des traits » à ×2 (structures.js > KtaEpaisseurTraits) : fronts, tracés et arcs doublés
    // aussitôt (événement, sans zoom), contours des piliers inchangés ; puis retour à ×1.
    console.log("— épaisseur des traits ×2 —");
    await page.evaluate(function () { window.KtaEpaisseurTraits.poser(2); });
    await page.waitForTimeout(800);
    const double = await page.evaluate(lireLargeursHome, { idB: ID_B, f: 2 });
    verif("×2 : fronts au double de ×1 (" + rerendu.loi + " → " + double.loi + " px)", double.loi === rerendu.loi * 2);
    controler("×2 :", double, true);
    const doublePres = await zoomer(19).then(function () { return page.evaluate(lireLargeursHome, { idB: ID_B, f: 2 }); });
    controler("×2 de près :", doublePres, false);
    await page.evaluate(function () { window.KtaEpaisseurTraits.poser(1); });
    await page.waitForTimeout(800);
    controler("retour à ×1 :", await page.evaluate(lireLargeursHome, { idB: ID_B }), false);

    if (erreurs.length) pb("erreurs de page : " + erreurs.slice(0, 3).join(" | "));
    await ctx.close();
  } catch (e) {
    pb("exception : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
    console.log(problemes.length ? "\n❌ " + problemes.length + " problème(s)"
      : "\n✅ Fronts, contours et arcs rayés à la loi de largeur sur les cartes OSM");
    process.exit(problemes.length ? 1 : 0);
  }
})();
