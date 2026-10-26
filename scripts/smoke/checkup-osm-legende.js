#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-osm-legende.js — la légende du plan, en lecture seule, depuis les deux cartes OSM
// =====================================================================
// Relevé fictif seulement, calage fictif en mer (comme checkup-osm-empilement.js). Une couleur choisie (tracé
// principal), une zone et une icône personnalisées (`cust-…`) sont posées en mode plan, puis la ≡ Légende du
// mode plan sert de référence :
//   1. Vue OSM : bouton 🗺️ Légende, même légende, aucun contrôle de modification, au premier plan, Échap la
//      ferme sans fermer la carte ;
//   2. accueil, plan chargé derrière : bouton 🗺️, même légende ; deux plans sur la carte → avertissement qui
//      nomme le plan ; plein écran : légende au-dessus, Échap ne quitte pas le plein écran ;
//   3. accueil après redémarrage (aucun plan chargé), autre plan en principal : légende du plan ouvert le
//      plus récemment, relue par plan (slot de session), identique à la référence ;
//   4. largeur 390 px : pas de débordement horizontal.
// CAPTURES=<dossier> : captures sombre / clair / mobile (à regarder, jamais à commiter).
// Usage : node scripts/smoke/checkup-osm-legende.js   (SMOKE_PORT pour une copie de travail)
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
// PNG 1×1 opaque : chaque tuile du tuilage prêté
const PNG_TUILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4xrAFAANqAZsvHqYeAAAAAElFTkSuQmCC";
const ID_B = "essai-legende-b";
const COULEUR = "#123456";
const ZONE = "Zone essai légende", ICONE = "Icône essai légende";

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

// Dans la page : la légende ouverte, section par section (libellé, icône par tag, style de la pastille).
// L'URL d'une icône n'est pas comparée : un plan non chargé a ses propres blob URLs.
function lireLegende() {
  const m = document.getElementById("kta-legende-modal");
  if (!m) return null;
  const sections = Array.from(m.querySelectorAll(".kta-legende-corps .kta-aide-section")).map(function (s) {
    const t = s.querySelector(".kta-aide-section-titre");
    return (t ? t.textContent.trim() : "") + " :: " + Array.from(s.querySelectorAll(".kta-legende-ligne")).map(function (l) {
      const lab = l.querySelector(".kta-legende-label"), img = l.querySelector("img"), sw = l.querySelector(".kta-legende-trait");
      return (lab ? lab.textContent.trim() : "") + "|" + (img ? "img:" + (img.getAttribute("data-kta-tag") || "custom") : "") +
             "|" + (sw ? sw.getAttribute("style").replace(/\s+/g, " ").trim() : "");
    }).join(" ; ");
  });
  const boite = m.querySelector(".kta-readme-modal-boite").getBoundingClientRect();
  const dessus = document.elementFromPoint(boite.left + boite.width / 2, boite.top + Math.min(40, boite.height / 2));
  const controles = Array.from(m.querySelectorAll("button, input, select, textarea, [contenteditable]"))
    // ✕ et ❓ (aide contextuelle, interfaceDocs.js) ne modifient rien
    .filter(function (c) { return c.id !== "kta-legende-close" && !c.classList.contains("kta-aide-ctx-btn"); })
    .map(function (c) { return c.id || c.className || c.tagName; });
  const av = document.getElementById("kta-legende-avertissement");
  return {
    sections: sections,
    controles: controles,
    lectureSeule: m.classList.contains("kta-legende-lecture-seule"),
    zIndex: getComputedStyle(m).zIndex,
    auDessus: !!(dessus && m.contains(dessus)),
    avertissement: (av && !av.hidden) ? av.textContent : "",
    deborde: document.documentElement.scrollWidth > window.innerWidth + 1 || boite.right > window.innerWidth + 1 || boite.left < -1
  };
}

async function capture(page, nom) {
  if (!CAPTURES) return;
  fs.mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURES, nom + ".png") });
}

async function ouvrirLegende(page, selecteur) {
  await page.click(selecteur);
  await attendre(page, function () { return !!document.getElementById("kta-legende-modal"); }, 10000);
  await page.waitForTimeout(400);
  return page.evaluate(lireLegende);
}
async function fermerLegende(page) {
  await page.evaluate(function () { const b = document.getElementById("kta-legende-close"); if (b) b.click(); });
  await page.waitForTimeout(200);
}

function comparer(lib, ref, vu) {
  const a = JSON.stringify(ref.sections), b = JSON.stringify(vu.sections);
  if (a === b) { ok(lib + " : légende identique au mode plan (" + ref.sections.length + " sections)"); return; }
  const diff = [];
  const n = Math.max(ref.sections.length, vu.sections.length);
  for (let i = 0; i < n; i++) {
    if (ref.sections[i] !== vu.sections[i]) diff.push("attendu « " + ref.sections[i] + " » vu « " + vu.sections[i] + " »");
  }
  pb(lib + " : légende différente — " + diff.slice(0, 2).join(" || "));
}

function lectureSeule(lib, vu) {
  verif(lib + " : lecture seule (aucun contrôle hors ✕)", vu.lectureSeule && vu.controles.length === 0,
        vu.controles.join(", "));
  verif(lib + " : légende au premier plan (z-index " + vu.zIndex + ")", vu.auDessus);
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

    // Légende personnalisée + calage fictif, puis la référence : ≡ Légende du mode plan
    const idA = await page.evaluate(function (a) {
      const LC = window.LegendCustomization;
      LC.setColor("traces", "principal", a.couleur);
      LC.addCustomEntry({ category: "zones", label: a.zone, fillColor: "#aa22cc" });
      LC.addCustomEntry({ category: "icones", label: a.icone, iconUrl: "icon/info.png" });
      const id = window._currentLoadedPlanId;
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
          window.RUNTIME_ASSETS["data/tiles/z" + z + "/x" + c + "_y" + (-k) + "." + ext] = { url: a.png };
        }
      }
      const g = { pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 }, pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2e-6 } };
      window.KmzExport.setCalibration(id, g);
      p.georef = g;
      window.SessionPersist.save();
      return id;
    }, { couleur: COULEUR, zone: ZONE, icone: ICONE, png: PNG_TUILE });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { window.afficherLegende(); });
    await page.waitForTimeout(400);
    const ref = await page.evaluate(lireLegende);
    await fermerLegende(page);
    const refTxt = JSON.stringify(ref.sections);
    verif("référence : couleur choisie et zone personnalisée présentes",
          refTxt.indexOf(COULEUR) !== -1 && refTxt.indexOf(ZONE) !== -1 && refTxt.indexOf(ICONE) !== -1);
    verif("référence : aucune icône personnalisée sous son id brut", refTxt.indexOf("cust-") === -1);
    verif("référence : ✏️ Modifier présent en mode plan", ref.controles.indexOf("kta-legende-modifier") !== -1);

    // ── 1. Vue OSM ──
    console.log("— Vue OSM —");
    await page.evaluate(function () { window.OsmView.open(); });
    await attendre(page, function () { return !!document.getElementById("kta-osm-legende"); }, 30000);
    await page.waitForTimeout(1500);
    let vu = await ouvrirLegende(page, "#kta-osm-legende");
    comparer("Vue OSM", ref, vu);
    lectureSeule("Vue OSM", vu);
    verif("Vue OSM : pas d'avertissement (un seul plan)", !vu.avertissement, vu.avertissement);
    await capture(page, "vue-osm-sombre");
    await page.evaluate(function () { window.ThemeManager.setTheme("light"); });
    await page.waitForTimeout(300);
    await capture(page, "vue-osm-clair");
    await page.evaluate(function () { window.ThemeManager.setTheme("dark"); });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const apresEchap = await page.evaluate(function () {
      return { legende: !!document.getElementById("kta-legende-modal"), osm: !!document.getElementById("kta-osm-view-overlay") };
    });
    verif("Vue OSM : Échap ferme la légende et laisse la carte", !apresEchap.legende && apresEchap.osm,
          JSON.stringify(apresEchap));
    await page.evaluate(function () { const b = document.getElementById("kta-osm-close"); if (b) b.click(); });
    await page.waitForTimeout(500);

    // ── 2. Accueil, plan chargé derrière ──
    console.log("— accueil, plan chargé —");
    await page.evaluate(function () { window.afficherLoader(); });
    await attendre(page, function () { return !!document.getElementById("ktaOsmHomeLegendeBtn"); }, 30000);
    await page.waitForTimeout(1500);
    vu = await ouvrirLegende(page, "#ktaOsmHomeLegendeBtn");
    comparer("accueil (plan chargé)", ref, vu);
    lectureSeule("accueil (plan chargé)", vu);
    verif("accueil : pas d'avertissement (un seul plan)", !vu.avertissement, vu.avertissement);
    await fermerLegende(page);

    // Second plan sur la carte : le même relevé sous un autre id, calé à côté. Le registre ne le garde pas
    // au redémarrage (plan serveur absent de l'index) : réenregistré après.
    const enregistrerB = function () {
      return page.evaluate(function (a) {
        const R = window.PlanRegistry;
        const pa = R.findById(a.idA);
        const b = Object.assign({}, pa, { id: a.idB, name: "Relevé fictif B" });
        delete b.lastOpened;
        R.addOrUpdate(b);
        window.KmzExport.setCalibration(a.idB, {
          pointA: { x: 0, y: 0, lat: 0.004, lng: 0.004 }, pointB: { x: 1000, y: 1000, lat: 0.002, lng: 0.006 }
        });
        window.OsmHomePreview.refresh();
        return R.displayName ? R.displayName(pa) : pa.name;
      }, { idA: idA, idB: ID_B });
    };
    const ajouter = async function (id) {
      await page.click("#ktaOsmHomeFiltersBtn");
      await attendre(page, function () { return !!document.getElementById("ktaOsmMultiAdd"); }, 10000);
      await page.selectOption("#ktaOsmMultiAdd", id);
      await page.waitForTimeout(1500);
      const lignes = await page.evaluate(function () { return document.querySelectorAll("#ktaOsmMultiRows > *").length; });
      verif("plan ajouté à la pile (" + lignes + " ligne(s) dans Plans & filtres)", lignes >= 2);
      await page.click("#kta-osm-filters-close");
      await page.waitForTimeout(300);
    };
    const nomA = await enregistrerB();
    await page.waitForTimeout(2500);
    await ajouter(ID_B);
    vu = await ouvrirLegende(page, "#ktaOsmHomeLegendeBtn");
    comparer("accueil, deux plans", ref, vu);
    verif("accueil, deux plans : avertissement qui nomme le plan", vu.avertissement.indexOf(nomA) !== -1, vu.avertissement);
    await fermerLegende(page);

    // plein écran
    await page.evaluate(function () { window.OsmHomePreview.openFullScreen(); });
    await page.waitForTimeout(800);
    vu = await ouvrirLegende(page, "#ktaOsmHomeLegendeBtn");
    lectureSeule("accueil plein écran", vu);
    await capture(page, "accueil-plein-ecran-sombre");
    await page.evaluate(function () { window.ThemeManager.setTheme("light"); });
    await page.waitForTimeout(300);
    await capture(page, "accueil-plein-ecran-clair");
    await page.evaluate(function () { window.ThemeManager.setTheme("dark"); });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const fs1 = await page.evaluate(function () {
      const box = document.getElementById("ktaOsmHomeBox");
      return { legende: !!document.getElementById("kta-legende-modal"),
               pleinEcran: !!(box && box.classList.contains("kta-osm-home-fullscreen-active")) };
    });
    verif("plein écran : Échap ferme la légende, pas le plein écran", !fs1.legende && fs1.pleinEcran, JSON.stringify(fs1));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // ── 4. Largeur 390 px ──
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await page.evaluate(function () { const b = document.getElementById("ktaOsmHomeLegendeBtn"); if (b) b.scrollIntoView(); });
    vu = await ouvrirLegende(page, "#ktaOsmHomeLegendeBtn");
    verif("390 px : la légende tient dans l'écran", !vu.deborde);
    verif("390 px : légende au premier plan", vu.auDessus);
    await capture(page, "accueil-mobile-390");
    await fermerLegende(page);
    await page.setViewportSize({ width: 1280, height: 820 });

    // ── 3. Redémarrage : aucun plan chargé, B en principal, A ajouté ──
    console.log("— accueil après redémarrage (aucun plan chargé) —");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await attendre(page, function () { return !!document.getElementById("ktaOsmHomePlanSelect"); }, 30000);
    const charge = await page.evaluate(function () { return !!(window.L && window.map instanceof window.L.Map); });
    verif("redémarrage : aucun plan chargé", !charge);
    await enregistrerB();
    await page.waitForTimeout(2500);
    await page.selectOption("#ktaOsmHomePlanSelect", ID_B);
    await page.waitForTimeout(1500);
    vu = await ouvrirLegende(page, "#ktaOsmHomeLegendeBtn");
    const seulB = JSON.stringify(vu.sections);
    verif("B seul sur la carte : sa légende (sans les personnalisations de A)",
          seulB.indexOf(ZONE) === -1 && seulB.indexOf(COULEUR) === -1);
    await fermerLegende(page);
    await ajouter(idA);
    vu = await ouvrirLegende(page, "#ktaOsmHomeLegendeBtn");
    comparer("accueil sans plan chargé (plan ouvert le plus récemment)", ref, vu);
    lectureSeule("accueil sans plan chargé", vu);
    verif("accueil sans plan chargé : avertissement qui nomme le plan", vu.avertissement.indexOf(nomA) !== -1,
          vu.avertissement);
    await fermerLegende(page);
    const etatLive = await page.evaluate(function (z) {
      const LC = window.LegendCustomization;
      return LC.listCustomEntries("zones").some(function (e) { return e.label === z; });
    }, ZONE);
    verif("état live de la légende restauré après lecture d'un autre plan", !etatLive);

    if (erreurs.length) pb("erreurs de page : " + erreurs.slice(0, 3).join(" | "));
    await ctx.close();
  } catch (e) {
    pb("exception : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
    console.log(problemes.length ? "\n❌ " + problemes.length + " problème(s)" : "\n✅ Légende en lecture seule depuis les cartes OSM");
    process.exit(problemes.length ? 1 : 0);
  }
})();
