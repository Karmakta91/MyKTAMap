#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-jonction-calque-niveau.js — checkup (Playwright, pas un hook pré-commit) : une jonction rangée dans un
// CALQUE DE DONNÉES s'affiche sur chacun des niveaux qu'elle relie
// =====================================================================
// Sur le relevé fictif (multi-niveau), un calque de données FABRIQUÉ au lancement (blob, rien d'écrit sur disque) :
// tracé `jonction` 0 ↔ −1 (avec ses deux ronds d'extrémité), POI `jpe` niveau 0 desservant −1, tracé ordinaire
// au niveau 0. Plus une jonction de SESSION 0 ↔ −1 (règle de référence).
// Filtre ≡ par vrais clics (seul −1 affiché), puis 0 seul, puis −2 seul : la jonction du calque (tracé + ronds)
// et le POI suivent la règle de la session (visible si un de ses niveaux l'est), le tracé ordinaire reste à son
// niveau. Itinéraire : getAllEmbeddedRoads garde fromLevel / toLevel ; niveaux occupés : −1 compté, y compris
// pour un POI jpe (calque ou session) seul objet de −1 ; un point ordinaire ne compte pas son champ `niveaux`.
// 🩸 Le registre d'affichage du calque (_ktaDataPolylines) ne lisait que `level` : une jonction n'en a pas
// (fromLevel / toLevel), elle tombait au niveau 0.
// Usage : node scripts/smoke/checkup-jonction-calque-niveau.js (SMOKE_PORT pour une autre copie)
// Doc : docs/architecture/multilevel-pathfinding.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

// Même repli que checkup-filtres-niveaux.js : on ouvre ce que l'index propose, en le disant.
function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) {
    return { nom: "Relevé fictif de test", fictif: true };
  }
}

const PLAN = planAOuvrir();
const CALQUE = "kta_test_jonction_calque";
const problemes = [];
const erreursPage = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail ? " " + JSON.stringify(detail) : "")); }

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.FilterPanel && !!window.ktaSetActiveLevel
      && typeof window.ajouterPointsDepuisJSON === "function";
  }, 60000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

// Calque fabriqué au centre de la vue, chargé par le même chemin qu'un calque du plan (ajouterPointsDepuisJSON).
async function semerCalque(page) {
  await page.evaluate(function (id) {
    const c = window.map.getCenter();
    const h = window.APP_CONFIG.imageHeight;
    const x = Math.round(c.lng), y = Math.round(h - c.lat);
    window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice();
    window.APP_CONFIG.activeLevel = 0;
    const json = {
      data: [{ id: "JpeCalque", nom: "JpeCalque", uid: "pt_jpecalque", x: x + 40, y: y + 40,
               tags: ["jpe"], level: 0, niveaux: [-1], etat: "Non inspectée", description: "" }],
      roads: [
        { uid: "rd_jonccalque", type: "jonction", fromLevel: 0, toLevel: -1,
          points: [{ x: x - 30, y: y - 30 }, { x: x + 30, y: y - 30 }] },
        { uid: "rd_ordcalque", type: "principal", level: 0,
          points: [{ x: x - 30, y: y + 10 }, { x: x + 30, y: y + 10 }] }
      ]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
    const groupe = L.layerGroup().addTo(window.map);
    window.dataLayerGroups = window.dataLayerGroups || {};
    window.dataLayerGroups[id] = groupe;
    window._ktaTestGroupe = groupe;
    window.ajouterPointsDepuisJSON(url, groupe);
    // Jonction de SESSION 0 ↔ −1 : la règle de référence.
    window.setRoads([{ uid: "rd_joncsession", type: "jonction", fromLevel: 0, toLevel: -1,
      points: [{ x: x - 30, y: y - 50 }, { x: x + 30, y: y - 50 }] }]);
  }, CALQUE);
  await attendre(page, function () {
    const g = window._ktaTestGroupe;
    const tr = (window._ktaDataPolylines || []).filter(function (e) { return e && e.groupe === g; });
    const mk = (window._ktaDataMarkers || []).filter(function (m) { return m && m._ktaLayer === g; });
    return tr.length >= 4 && mk.length >= 1;
  }, 15000);
}

// Opacité affichée de chaque objet du calque fabriqué, et présence de la jonction de session sur la carte.
function lireEtat(page) {
  return page.evaluate(function () {
    const g = window._ktaTestGroupe;
    const entrees = (window._ktaDataPolylines || []).filter(function (e) { return e && e.groupe === g; });
    const op = function (e) { return e.polyline && e.polyline.options ? e.polyline.options.opacity : null; };
    const jonction = entrees.filter(function (e) { return e.type === "jonction"; });
    const ordinaire = entrees.filter(function (e) { return e.type === "principal"; });
    const mk = (window._ktaDataMarkers || []).find(function (m) { return m && m._ktaLayer === g; }) || null;
    let session = false;
    window.map.eachLayer(function (l) {
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (typeof c === "string" && c.indexOf('data-kta-uid="rd_joncsession"') >= 0) session = true;
    });
    return {
      visibles: window.APP_CONFIG.visibleLevels.slice(),
      jonction: jonction.map(op),            // tracé + 2 ronds
      ordinaire: ordinaire.map(op),
      poiMasque: mk ? mk._ktaMasque === true : null,
      session: session
    };
  });
}

async function ouvrirFiltres(page) {
  await page.evaluate(function () { window.FilterPanel.ouvrir(); });
  await attendre(page, function () { return !!document.querySelector("#kta-fp-sec-lvl [data-lvl-visible]"); }, 5000);
}

// N'affiche que le niveau `garder` par de vrais clics sur les cases « visible » de ≡ Filtres.
async function seulNiveau(page, garder) {
  await ouvrirFiltres(page);
  await page.locator('#kta-fp-sec-lvl [data-lvl-active="' + garder + '"]').click();
  await page.waitForTimeout(300);
  const lvls = await page.evaluate(function () {
    return Array.from(document.querySelectorAll("#kta-fp-sec-lvl [data-lvl-visible]")).map(function (b) {
      return parseInt(b.getAttribute("data-lvl-visible"), 10);
    });
  });
  for (const l of lvls) {
    const voulu = l === garder;
    const vu = await page.evaluate(function (n) { return window.APP_CONFIG.visibleLevels.indexOf(n) >= 0; }, l);
    if (vu !== voulu) {
      await page.locator('#kta-fp-sec-lvl [data-lvl-visible="' + l + '"]').click();
      await page.waitForTimeout(300);
    }
  }
  await page.evaluate(function () { window.FilterPanel.fermer(); });
  await page.waitForTimeout(400);
}

function tousVisibles(arr) { return arr.length > 0 && arr.every(function (o) { return o > 0; }); }
function tousMasques(arr) { return arr.length > 0 && arr.every(function (o) { return o === 0; }); }

(async function main() {
  const nav = await lancerNavigateur(chromium);
  try {
    if (!PLAN.fictif) inf("⚠️ le relevé fictif n'est pas dans data/index.json — checkup sur « " + PLAN.nom + " »");
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    const page = await ctx.newPage();
    page.on("pageerror", function (e) { erreursPage.push(String(e)); });

    console.log("\n── Ouverture de « " + PLAN.nom + " » ──");
    await ouvrirPlan(page);
    const ml = await page.evaluate(function () {
      return { ml: window.APP_CONFIG.multiLevel === true, niveaux: window.APP_CONFIG.availableLevels };
    });
    if (!ml.ml) throw new Error("le plan ouvert n'est pas multi-niveau");
    if (ml.niveaux.indexOf(-1) < 0 || ml.niveaux.indexOf(-2) < 0) throw new Error("niveaux −1 / −2 absents");
    ok("plan multi-niveau, niveaux " + JSON.stringify(ml.niveaux));

    await semerCalque(page);
    ok("calque fabriqué chargé (jonction 0 ↔ −1, POI jpe 0 + −1, tracé ordinaire au niveau 0) + jonction de session");

    console.log("\n── 1. Seul le niveau −1 affiché ──");
    await seulNiveau(page, -1);
    const e1 = await lireEtat(page);
    verifier(JSON.stringify(e1.visibles) === "[-1]", "filtre ≡ : seul −1 visible", e1.visibles);
    verifier(e1.session, "jonction de session 0 ↔ −1 affichée (règle de référence)", e1);
    verifier(tousVisibles(e1.jonction) && e1.jonction.length === 3,
      "jonction du calque 0 ↔ −1 affichée, avec ses deux ronds", e1.jonction);
    verifier(e1.poiMasque === false, "POI jpe du calque (0 + −1) affiché", e1);
    verifier(tousMasques(e1.ordinaire), "tracé ordinaire du calque (niveau 0) masqué", e1.ordinaire);

    console.log("\n── 2. Seul le niveau 0 affiché ──");
    await seulNiveau(page, 0);
    const e2 = await lireEtat(page);
    verifier(tousVisibles(e2.jonction), "jonction du calque affichée au niveau 0", e2.jonction);
    verifier(tousVisibles(e2.ordinaire), "tracé ordinaire du calque affiché au niveau 0", e2.ordinaire);
    verifier(e2.poiMasque === false && e2.session, "POI jpe et jonction de session affichés au niveau 0", e2);

    console.log("\n── 3. Seul le niveau −2 affiché ──");
    await seulNiveau(page, -2);
    const e3 = await lireEtat(page);
    verifier(tousMasques(e3.jonction), "jonction du calque masquée hors de ses niveaux (tracé et ronds)", e3.jonction);
    verifier(e3.poiMasque === true && !e3.session && tousMasques(e3.ordinaire),
      "POI jpe, jonction de session et tracé ordinaire masqués au niveau −2", e3);

    console.log("\n── 3 bis. Taille des ronds selon le zoom ──");
    // Zoom posé sans animation, puis lecture au cadre suivant (zoomend ne part pas si le zoom ne change pas).
    const rayons = async function (z) {
      await page.evaluate(function (zz) { window.map.setZoom(zz, { animate: false }); }, z);
      await page.waitForTimeout(400);
      return page.evaluate(function () {
        const g = window._ktaTestGroupe;
        return { zoom: window.map.getZoom(), r: (window._ktaDataPolylines || []).filter(function (e) {
          return e && e.groupe === g && e.type === "jonction" && e.polyline instanceof L.CircleMarker;
        }).map(function (e) { return e.polyline.options.radius; }) };
      });
    };
    const rz0 = await rayons(0), rzm3 = await rayons(-3);
    verifier(rz0.zoom === 0 && rz0.r.length === 2 && rz0.r.every(function (r) { return r === 7; }),
      "ronds au zoom 0 : rayon 7 px", rz0);
    verifier(rzm3.zoom === -3 && rzm3.r.length === 2 && rzm3.r.every(function (r) { return r > 2 && r < 3; }),
      "ronds au zoom −3 (plan dézoomé) : rayon réduit (~2,5 px)", rzm3);

    console.log("\n── 4. Itinéraire, niveaux occupés ──");
    const it = await page.evaluate(function () {
      const r = (window.getAllEmbeddedRoads() || []).find(function (x) { return x && x.uid === "rd_jonccalque"; });
      // Niveaux occupés mesurés sur la seule jonction du calque (le relevé fictif peut porter −1 ailleurs).
      const g = window._ktaTestGroupe;
      const noms = ["getRoads", "getZones", "getStructures", "getEditorPoints"];
      const tabs = ["_ktaDataMarkers", "_ktaDataPolylines", "_ktaDataPolygons", "_ktaDataStructurePolygons",
                    "_ktaImageOverlays"];
      const sauve = {};
      noms.concat(tabs).forEach(function (k) { sauve[k] = window[k]; });
      const seules = (window._ktaDataPolylines || []).filter(function (e) {
        return e && e.groupe === g && e.type === "jonction";
      });
      let occ = null;
      try {
        noms.forEach(function (k) { window[k] = function () { return []; }; });
        tabs.forEach(function (k) { window[k] = []; });
        window._ktaDataPolylines = seules;
        occ = typeof window.ktaNiveauxOccupes === "function" ? window.ktaNiveauxOccupes() : null;
      } finally {
        noms.concat(tabs).forEach(function (k) { window[k] = sauve[k]; });
      }
      return { from: r ? r.fromLevel : null, to: r ? r.toLevel : null, occupes: occ };
    });
    verifier(it.from === 0 && it.to === -1, "getAllEmbeddedRoads garde fromLevel 0 / toLevel −1 (itinéraire)", it);
    verifier(Array.isArray(it.occupes) && it.occupes.indexOf(-1) >= 0, "niveaux occupés (jonction du calque seule) : −1 compté", it.occupes);

    console.log("\n── 5. POI jonction seul objet de −1 : niveau occupé ──");
    // Niveaux occupés mesurés sur un seul POI jpe (niveau 0, dessert −1) : marqueur du calque, puis point de session.
    const occPoi = await page.evaluate(function () {
      const g = window._ktaTestGroupe;
      const noms = ["getRoads", "getZones", "getStructures", "getEditorPoints"];
      const tabs = ["_ktaDataMarkers", "_ktaDataPolylines", "_ktaDataPolygons", "_ktaDataStructurePolygons",
                    "_ktaImageOverlays"];
      const sauve = {};
      noms.concat(tabs).forEach(function (k) { sauve[k] = window[k]; });
      const mk = (window._ktaDataMarkers || []).filter(function (m) { return m && m._ktaLayer === g; });
      const out = {};
      try {
        noms.forEach(function (k) { window[k] = function () { return []; }; });
        tabs.forEach(function (k) { window[k] = []; });
        window._ktaDataMarkers = mk;
        out.calque = window.ktaNiveauxOccupes();
        window._ktaDataMarkers = [];
        window.getEditorPoints = function () {
          return [{ id: "JpeSession", nom: "JpeSession", uid: "pt_jpesession", x: 10, y: 10, tags: ["jpe"],
                    level: 0, niveaux: [-1] }];
        };
        out.session = window.ktaNiveauxOccupes();
        window.getEditorPoints = function () {
          return [{ id: "SalleSession", nom: "SalleSession", uid: "pt_sallesession", x: 10, y: 10, tags: ["salle"],
                    level: 0, niveaux: [-1] }];
        };
        out.ordinaire = window.ktaNiveauxOccupes();
      } finally {
        noms.concat(tabs).forEach(function (k) { window[k] = sauve[k]; });
      }
      return out;
    });
    verifier(Array.isArray(occPoi.calque) && occPoi.calque.indexOf(-1) >= 0,
      "POI jpe de calque (0, dessert −1) seul objet de −1 : −1 compté occupé", occPoi.calque);
    verifier(Array.isArray(occPoi.session) && occPoi.session.indexOf(-1) >= 0,
      "POI jpe de session (0, dessert −1) seul objet de −1 : −1 compté occupé", occPoi.session);
    verifier(Array.isArray(occPoi.ordinaire) && occPoi.ordinaire.indexOf(-1) < 0,
      "point ordinaire (salle) avec un champ niveaux parasite : −1 non compté", occPoi.ordinaire);

    await page.evaluate(function () {
      window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice();
      window.appliquerFiltreNiveau();
      window.setRoads([]);
    });
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  erreursPage.slice(0, 10).forEach(function (m) { pb("erreur de page : " + m); });
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — une jonction de calque s'affiche sur chacun des niveaux qu'elle relie.");
  process.exit(0);
})();
