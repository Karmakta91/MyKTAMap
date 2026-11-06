#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-distance-totale.js — checkup (Playwright) : 📏 Distance totale des tracés et niveau compté
// =====================================================================
// Tracés FICTIFS de session (relevé fictif, sinon le premier plan de l'index), calques vidés en mémoire : au 0 un
// principal de 30 m ; au −1 un principal de 20 m et un secondaire de 8 m. Plan rendu multi-niveau en mémoire.
// Attendu : carte au 0 → 30 m, ligne « Niveau 0 affiché », case « Tous les niveaux » décochée, surlignage d'un seul
// tronçon ; niveau actif passé au −1 (ktaSetActiveLevel) → 28 m, 2 tronçons, fenêtre ouverte ou fermée ; case cochée
// → 58 m, 3 tronçons, ligne « Tous les niveaux du plan » ; case retenue au rechargement (pref du plan) ; plan à un
// niveau → ni case ni ligne, 58 m ; vue 3D au −1 case cochée → 58 m, ruban au sol du −1 seul (2 tronçons) et note
// qui le dit ; décochée en 3D → « Niveau −1 de la vue 3D », 28 m. Chromium puis WebKit (KTA_MOTEURS).
// Usage : node scripts/smoke/checkup-distance-totale.js (SMOKE_PORT pour une autre copie) · code :
// js/interfaceDistanceTotale.js · doc : docs/architecture/multilevel-pathfinding.md (§ 15)
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
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
let moteur = "";
function pb(msg) { problemes.push("[" + moteur + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const b = document.getElementById("kta-alert-ok"); if (b) b.click();
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () { return window.__pret && !!window.map && !!window.PLAN_CONFIG; }, 40000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    if (window.getTrackingActif && window.getTrackingActif()) window.stopTracking();
  });
}

// Plan multi-niveau en mémoire (-1, 0), carte au 0, calques vidés, 3 tracés fictifs de session.
function semer(page, multi) {
  return page.evaluate(function (multi) {
    const C = window.APP_CONFIG, sc = C.scale;
    const W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
    const ox = W / 2 / sc, oz = H / 2 / sc;
    const P = function (x, z) { return { x: (ox + x) * sc, y: (oz + z) * sc }; };
    window.__dtP = P;
    window.getAllEmbeddedRoads = function () { return []; };
    C.multiLevel = multi; C.availableLevels = [-1, 0]; C.visibleLevels = [-1, 0]; C.activeLevel = 0;
    if (window._rdEffacerHighlight) window._rdEffacerHighlight();
    window.setRoads([
      { uid: "rd_dt_p1", type: "principal", level: -1, points: [P(-10, 6), P(10, 6)] },
      { uid: "rd_dt_s1", type: "secondaire", level: -1, points: [P(-4, 9), P(4, 9)] },
      { uid: "rd_dt_p0", type: "principal", level: 0, points: [P(-15, -6), P(15, -6)] }
    ]);
  }, multi);
}

// État de la fenêtre et du surlignage : total, ligne du niveau, case, note, sous-tracés du chemin magenta.
function lire(page) {
  return page.evaluate(function () {
    const m = document.getElementById("kta-rd-modal");
    const lig = m && m.querySelector(".kta-rd-niveau"), chk = m && m.querySelector("#kta-rd-tous");
    const note = m && m.querySelector(".kta-rd-note3d");
    // Sous-tracés de la polyline magenta lus sur Leaflet : le <path> SVG ne garde que ce qui est à l'écran.
    const lignes = [];
    window.map.eachLayer(function (l) {
      if (l.options && l.options.className === "kta-rd-highlight-polyline" && l.getLatLngs) lignes.push(l);
    });
    const s = window.getDistanceTotaleStatus();
    return {
      modale: !!m, total: m ? document.getElementById("kta-rd-total").textContent : null,
      niveau: lig ? lig.textContent : null, caseTous: chk ? chk.checked : null,
      note: note && !note.hidden ? note.textContent : null,
      totalM: s ? +s.totalM.toFixed(6) : null, chemins: lignes.length,
      troncons: lignes.length ? lignes[0].getLatLngs().length : 0
    };
  });
}

function textes(page) {
  return page.evaluate(function () {
    const t = window.I18n.t.bind(window.I18n), f = function (m) { return window.formatDistance(m, 1); };
    return { bouton: t("ui.trace.distanceTotale"), n0: t("disttot.niveauCarte", { lvl: "0" }),
      nm1: t("disttot.niveauCarte", { lvl: "−1" }), tous: t("disttot.niveauTous"),
      vue: t("disttot.niveau", { lvl: "−1" }), note: t("disttot.note3d", { lvl: "−1" }),
      d30: f(30), d28: f(28), d58: f(58) };
  });
}

// Le vrai bouton 📏 du groupe 📐 Mesure (même s'il est replié).
function cliquerDistTot(page) {
  return page.evaluate(function () {
    const lib = window.I18n.t("ui.trace.distanceTotale");
    const b = Array.prototype.find.call(document.querySelectorAll("a.kta-sub"), function (x) { return x.title === lib; });
    if (!b) return false;
    b.click();
    return true;
  });
}

const fermer = function (page) {
  return page.evaluate(function () { const b = document.getElementById("kta-rd-done"); if (b) b.click(); });
};
const niveau = function (page, n) {
  return page.evaluate(function (n) { window.ktaSetActiveLevel(n, { source: "checkup" }); }, n);
};
const cocherTous = function (page) {
  return page.evaluate(function () { document.getElementById("kta-rd-tous").click(); });
};

async function jouer(nav) {
  console.log("── " + moteur + " ──");
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 850 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await ouvrirPlan(page);
    await page.evaluate(function () { window.setPlanDistTotTousNiveaux(null, false); });
    await semer(page, true);
    const T = await textes(page);

    // ── 1. Carte au 0 : niveau affiché seul ──
    verifier(await cliquerDistTot(page), "bouton 📏 présent dans le groupe 📐 Mesure");
    await page.waitForTimeout(250);
    let e = await lire(page);
    verifier(e.modale && e.total === T.d30 && e.totalM === 30 && e.niveau === T.n0 && e.caseTous === false &&
      e.note === null && e.troncons === 1,
    "carte au 0 : " + T.d30 + " (le 0 seul), « " + T.n0 + " », case Tous les niveaux décochée, 1 tronçon surligné", e);

    // ── 2. Niveau actif changé, fenêtre ouverte ──
    await niveau(page, -1);
    await page.waitForTimeout(250);
    e = await lire(page);
    verifier(e.total === T.d28 && e.totalM === 28 && e.niveau === T.nm1 && e.troncons === 2,
      "niveau actif → −1 : recalcul fenêtre ouverte (" + T.d28 + ", « " + T.nm1 + " », 2 tronçons)", e);

    // ── 3. Case Tous les niveaux ──
    await cocherTous(page);
    await page.waitForTimeout(250);
    e = await lire(page);
    const pref = await page.evaluate(function () { return window.getPlanDistTotTousNiveaux(); });
    verifier(e.total === T.d58 && e.totalM === 58 && e.niveau === T.tous && e.caseTous === true && e.troncons === 3 &&
      e.note === null && pref === true,
    "case cochée : " + T.d58 + ", « " + T.tous + " », 3 tronçons surlignés, retenue pour le plan", { e: e, pref: pref });
    await cocherTous(page);
    await fermer(page);
    await niveau(page, 0);
    await page.waitForTimeout(250);
    e = await lire(page);
    verifier(!e.modale && e.totalM === 30 && e.troncons === 1,
      "fenêtre fermée, niveau actif → 0 : le surlignage et le total suivent (30 m, 1 tronçon)", e);
    await cliquerDistTot(page);
    await page.waitForTimeout(250);
    await cocherTous(page);
    await fermer(page);
    await niveau(page, -1);
    await page.waitForTimeout(250);
    e = await lire(page);
    verifier(e.totalM === 58 && e.troncons === 3, "case cochée : changer de niveau ne change rien (58 m)", e);

    // ── 4. Rechargement : case retenue ──
    await ouvrirPlan(page);
    await semer(page, true);
    await cliquerDistTot(page);
    await page.waitForTimeout(250);
    e = await lire(page);
    verifier(e.modale && e.caseTous === true && e.totalM === 58 && e.niveau === T.tous,
      "rechargé : case Tous les niveaux relue cochée pour ce plan, 58 m", e);
    await fermer(page);

    // ── 5. Vue 3D au −1, case cochée puis décochée ──
    await page.addScriptTag({ url: BASE + "/js/vue3d.js" });
    await page.evaluate(async function () {
      const P = window.__dtP;
      window.getPlanEditionVue3D = function () { return null; };
      window.setPlanRenduVue3D(null, "structures");
      await window.KtaVue3D.ouvrir({ depart: { x: P(0, 0).x, y: P(0, 0).y, cap: 0, niveau: -1 }, commandes: "joystick" });
      await new Promise(function (r) { setTimeout(r, 400); });
      window.ouvrirRoadsDistanceFloater();
      await new Promise(function (r) { setTimeout(r, 300); });
    });
    e = await lire(page);
    let rb = await page.evaluate(function () { return window.KtaVue3D.etat().distanceTotale; });
    verifier(e.modale && e.totalM === 58 && e.niveau === T.tous && e.note === T.note && e.caseTous === true,
      "3D au −1, case cochée : 58 m, « " + T.tous + " », la note dit que le ruban ne montre que le −1", e);
    verifier(!!rb && rb.troncons === 2 && rb.segments === 2,
      "3D, case cochée : le ruban au sol reste celui du −1 (2 tronçons)", rb);
    await cocherTous(page);
    await page.waitForTimeout(300);
    e = await lire(page);
    rb = await page.evaluate(function () { return window.KtaVue3D.etat().distanceTotale; });
    verifier(e.totalM === 28 && e.total === T.d28 && e.niveau === T.vue && e.note === null && !!rb && rb.segments === 2,
      "3D, case décochée : « " + T.vue + " », " + T.d28 + ", ruban inchangé", { e: e, rb: rb });
    await cocherTous(page);
    await page.evaluate(async function () {
      await window.KtaVue3D.fermer();
      await new Promise(function (r) { setTimeout(r, 300); });
    });
    e = await lire(page);
    verifier(e.modale && e.totalM === 58 && e.niveau === T.tous && e.note === null,
      "vue fermée, case cochée : la carte compte tout le plan, plus de note de la 3D", e);
    await fermer(page);

    // ── 6. Plan à un niveau : ni case ni ligne ──
    await semer(page, false);
    await cliquerDistTot(page);
    await page.waitForTimeout(250);
    e = await lire(page);
    verifier(e.modale && e.caseTous === null && e.niveau === null && e.totalM === 58 && e.troncons === 3,
      "plan à un niveau : ni case ni ligne de niveau, tous les tracés (58 m)", e);
    await page.evaluate(function () { window._rdEffacerHighlight(); window.setPlanDistTotTousNiveaux(null, false); });

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.stack || err));
  } finally {
    await ctx.close();
  }
}

(async function main() {
  try {
    for (const m of moteurs()) {
      moteur = m;
      const nav = await lancerMoteur(m);
      if (!nav) { console.log("  ⚠️ " + m + " absent : moteur sauté"); continue; }
      try { await jouer(nav); } finally { await nav.close(); }
    }
  } finally {
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — 📏 compte le niveau affiché, « Tous les niveaux » retenu par plan, 3D et plan à un niveau.");
  process.exit(0);
})();
