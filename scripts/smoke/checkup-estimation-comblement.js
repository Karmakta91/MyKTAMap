#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-estimation-comblement.js — checkup (Playwright) : estimation de comblement de la fenêtre ⛏️ Volume exploité
// =====================================================================
// Relevé fictif vidé de ses objets (session et calques remplacés le temps du test), échelle forcée à 2 px/m en
// mémoire : secteur carré 100×100 px tracé au ♦️ = 2 500 m², rien dedans, hauteur 2 m → vide 5 000 m³.
// Attendu, à la main (défauts) : béton + 20 % = 6 000 m³ × 130 € = 780 000 € ; forages 2 500 / 25 = 100 → 150 000 € ;
// 100 / 4 = 25 jours ouvrés ; total 930 000 € ; 750 toupies (6 000 / 8), 2,4 piscines, 14 400 t, CO₂ 1 500 t.
// Puis : blocs repliés par défaut et état retenu ; prix modifié (100 €) retenu à la réouverture ; prix propre à chaque
// matériau ; « Valeurs par défaut » ; capture (EC_SHOTS=<dossier>).
// Usage : node scripts/smoke/checkup-estimation-comblement.js · code : js/volumeExploite.js > estimerComblement
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const path = require("path");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const CAPTURES = process.env.EC_SHOTS || null;
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function verifier(c, m, d) { if (c) ok(m); else pb(m + (d !== undefined ? " " + JSON.stringify(d) : "")); }

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const b = document.getElementById("kta-alert-ok"); if (b) b.click();
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () { return window.__pret && !!window.map && !!window.KtaVolumeExploite; }, 60000);
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal"); if (m) m.remove();
    const c = window.map.getCenter(), H = window.PLAN_CONFIG.plan.imageHeight;
    const x = Math.round(c.lng) - 50, y = Math.round(H - c.lat) - 50;
    window.APP_CONFIG.scale = 2;   // en mémoire seulement
    if (window.APP_CONFIG.multiLevel === true) window.APP_CONFIG.activeLevel = 0;
    window.setStructures([]);
    window.setZones([]);
    window._ktaDataStructurePolygons.splice(0);
    window._ktaDataPolygons.splice(0);
    window.setMeasurePointsSurface([{ x: x, y: y }, { x: x + 100, y: y }, { x: x + 100, y: y + 100 },
      { x: x, y: y + 100 }]);
  });
}

async function ouvrirFenetre(page) {
  await page.evaluate(function () {
    const x = document.querySelector("#kta-volume-modal .kta-panneau-close"); if (x) x.click();
    window.KtaVolumeExploite.ouvrir();
  });
  await page.waitForSelector("#kta-volume-modal");
  await page.waitForTimeout(200);
}

function lire(page) {
  return page.evaluate(function () {
    const m = document.getElementById("kta-volume-modal");
    const td = function (k) { const e = m.querySelector('td[data-e="' + k + '"]'); return e ? e.textContent : null; };
    const v = function (id) { const e = m.querySelector("#" + id); return e ? e.value : null; };
    const loc = window.ktaLocale ? window.ktaLocale() : "fr-FR";
    const eur = function (n) {
      const o = { style: "currency", currency: "EUR", maximumFractionDigits: n >= 1e5 ? 1 : 0 };
      if (n >= 1e5) o.notation = "compact";
      return n.toLocaleString(loc, o);
    };
    return {
      estimOuvert: m.querySelector("#kta-volume-estim").open, funOuvert: m.querySelector("#kta-volume-fun").open,
      coutMat: td("coutMat"), coutForages: td("coutForages"), total: td("total"), jours: td("jours"),
      nbForages: td("nbForages"), toupies: td("toupies"), co2: td("co2"), base: td("base"), pertes: td("pertes"),
      prix: v("kve-prix"), mat: v("kve-mat"),
      attendu: { mat780: eur(780000), forages150: eur(150000), total930: eur(930000), mat600: eur(600000),
        jours25: window.I18n.t("volume.estim.jours", { n: "25" }),
        co2: window.I18n.t("volume.fun.co2Val", { n: (1500).toLocaleString(loc) }),
        base: (5000).toLocaleString(loc, { maximumFractionDigits: 0 }) + " m³",
        pertes: (6000).toLocaleString(loc, { maximumFractionDigits: 0 }) + " m³" }
    };
  });
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.addInitScript(function (ls) {
    try { for (const k in ls) localStorage.setItem(k, ls[k]); } catch (e) { /* rien */ }
  }, LS_PREGATES);
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  await ouvrirPlan(page);

  console.log("\n══ valeurs ══");
  await ouvrirFenetre(page);
  let f = await lire(page);
  verifier(!f.estimOuvert && !f.funOuvert, "blocs « Estimation » et « Pour le fun » repliés par défaut", f);
  verifier(f.base === f.attendu.base && f.pertes === f.attendu.pertes,
    "volume à combler 5 000 m³, 6 000 m³ avec les pertes", [f.base, f.pertes]);
  verifier(f.coutMat === f.attendu.mat780 && f.coutForages === f.attendu.forages150 && f.total === f.attendu.total930,
    "béton 780 000 €, forages 150 000 €, total 930 000 € (formats de la locale)",
    [f.coutMat, f.coutForages, f.total, f.attendu]);
  verifier(f.nbForages === "100" && f.jours === f.attendu.jours25, "100 forages, 25 jours ouvrés",
    [f.nbForages, f.jours]);
  verifier(f.toupies === "750" && f.co2 === f.attendu.co2, "pour le fun : 750 toupies, CO₂ ≈ 1 500 t",
    [f.toupies, f.co2]);

  console.log("\n══ saisie retenue ══");
  await page.evaluate(function () {
    document.getElementById("kta-volume-estim").open = true;
    const i = document.getElementById("kve-prix");
    i.value = "100";
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(150);
  f = await lire(page);
  verifier(f.coutMat === f.attendu.mat600, "prix 100 €/m³ → coût du matériau 600 000 € aussitôt", f.coutMat);
  await ouvrirFenetre(page);
  f = await lire(page);
  verifier(f.estimOuvert && !f.funOuvert, "réouverture : bloc Estimation resté déplié, Fun replié", f);
  verifier(f.prix === "100" && f.coutMat === f.attendu.mat600, "réouverture : prix 100 € retrouvé (appareil)",
    [f.prix, f.coutMat]);
  await page.evaluate(function () {
    const s = document.getElementById("kve-mat");
    s.value = "coulis";
    s.dispatchEvent(new Event("change", { bubbles: true }));
  });
  f = await lire(page);
  verifier(f.prix === "80", "matériau coulis : son propre prix (80 €)", f.prix);
  await page.evaluate(function () {
    const s = document.getElementById("kve-mat");
    s.value = "beton";
    s.dispatchEvent(new Event("change", { bubbles: true }));
  });
  f = await lire(page);
  verifier(f.prix === "100", "retour au béton : le prix saisi (100 €) est gardé", f.prix);

  if (CAPTURES) {
    await page.evaluate(function () { document.getElementById("kta-volume-fun").open = true; });
    const boite = await page.$("#kta-volume-modal .kta-readme-modal-boite");
    await boite.screenshot({ path: path.join(CAPTURES, "estimation-comblement.png") });
    await page.evaluate(function () {
      const c = document.querySelector("#kta-volume-modal .kta-readme-modal-corps");
      c.scrollTop = c.scrollHeight;
    });
    await boite.screenshot({ path: path.join(CAPTURES, "estimation-comblement-bas.png") });
    console.log("  •  captures : " + CAPTURES);
  }

  console.log("\n══ valeurs par défaut ══");
  await page.click("#kve-defaut");
  f = await lire(page);
  const st = await page.evaluate(function () {
    try {
      return JSON.parse(localStorage.getItem("myktamap_volume_estimation_v1") || "null");
    } catch (e) { return null; }
  });
  verifier(f.prix === "130" && f.mat === "beton" && f.coutMat === f.attendu.mat780,
    "« Valeurs par défaut » : béton 130 €, 780 000 €", [f.prix, f.mat, f.coutMat]);
  verifier(!!st && !!st.reglages && st.reglages.prix.beton === 130 && st.ouvert && st.ouvert.estim === true,
    "stockage : défauts réécrits, état des blocs gardé", st);
  await ouvrirFenetre(page);
  f = await lire(page);
  verifier(f.prix === "130", "réouverture après défauts : 130 €", f.prix);

  console.log("\n══ sans stockage ══");
  const sans = await page.evaluate(function () {
    const orig = Storage.prototype.getItem, origSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function () { throw new Error("refusé"); };
    Storage.prototype.setItem = function () { throw new Error("refusé"); };
    try {
      window.KtaVolumeExploite.ouvrir();
      const m = document.getElementById("kta-volume-modal");
      const td = m && m.querySelector('td[data-e="total"]');
      return !!td && td.textContent !== "—";
    } finally { Storage.prototype.getItem = orig; Storage.prototype.setItem = origSet; }
  });
  verifier(sans, "stockage refusé : la fenêtre et l'estimation s'affichent quand même (défauts)");

  verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 5));
  await browser.close();
  console.log("\n" + (problemes.length ? "❌ " + problemes.length + " problème(s)" :
    "✅ Estimation de comblement : valeurs à la main, saisie retenue, défauts, sans stockage"));
  process.exit(problemes.length ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
