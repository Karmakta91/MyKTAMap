#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-transparence-plan-de-base.js — checkup (Playwright) : opacité de l'image principale du plan
// =====================================================================
// Curseur sous « Afficher le plan de base » (section des calques image des filtres ≡). Par moteur (Chromium puis
// WebKit), sur le relevé fictif (rendu direct) puis sur un plan V2 FICTIF servi en mémoire (planV2Fictif.js) :
//   T1 sans réglage : rien d'écrit dans les prefs, aucun style d'opacité posé, export et détection de référence ;
//   T2 curseur présent sous la case (un seul dans la fenêtre), 50 % : image à 50 %, pref retenue, autres clés gardées ;
//   T3 export PNG : moyenne = image × 0,5 + aplat du fond × 0,5 ;
//   T4 détection (tiling.js > ktaDessinerRegionPlan) : pixels identiques à ceux de l'image pleine ;
//   T5 fond OSM sous le plan (tuiles bloquées) : 50 % ici × 50 % OSM = 25 %, curseur suivi, fond éteint = curseur seul ;
//   T6 tuiles V1 (couche posée par le test) : le curseur les atteint aussi ;
//   T7 page rechargée, plan rouvert : 50 % réappliqué au chargement et curseur rouvert à 50 ;
//   T8 plan V2 : tilePane à 50 %, × OSM, export atténué, détection pleine, valeur retenue au rechargement ;
//   T9 retour à 100 % : pref retirée, témoin gardé, image de nouveau opaque ; aucune erreur de page.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8164 node scripts/smoke/checkup-transparence-plan-de-base.js
//   (KTA_MOTEURS=webkit pour WebKit seul)
// Doc : docs/architecture/rendering-leaflet.md (Opacité de l'image principale)
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const { servirPlanV2Fictif } = require("./planV2Fictif.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1"
};
const RE_OSM = /tile\.openstreetmap\.org\//;
const NOM_V2 = "Essai V2 opacite du fond";

let MOTEUR = "";
const problemes = [];
function pb(msg) { problemes.push("[" + MOTEUR + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
function pres(a, b, tol) { return Math.abs(a - b) <= tol; }

// Outils posés dans la page (lus au moment de l'appel : l'app est chargée).
function outilsPage() {
  window.__tp = {
    prefs: function () {
      try { return JSON.parse(localStorage.getItem("myktamap_plan_prefs_" + window._currentLoadedPlanId) || "null"); }
      catch (e) { return "illisible"; }
    },
    temoin: function () {
      const k = "myktamap_plan_prefs_" + window._currentLoadedPlanId;
      const p = JSON.parse(localStorage.getItem(k) || "{}");
      p.tpTemoin = "garde";
      localStorage.setItem(k, JSON.stringify(p));
    },
    mode: function () {
      const st = window._tilingV2State;
      if (st && Array.isArray(st.activeOverlays) && st.activeOverlays.length) return "V2";
      return (window._baseTiles || []).length ? "V1" : "direct";
    },
    // Opacité de l'image principale : style du tilePane et des couches du fond, opacité calculée, produit effectif.
    opacite: function () {
      const tp = window.map.getPane("tilePane");
      const couches = (window._ktaBaseLayers || []).concat((window._baseTiles || []).map(function (t) { return t && t.overlay; }))
        .filter(Boolean);
      // Opacité vue à l'écran = produit des opacités de l'élément et de ses parents jusqu'au conteneur de la carte.
      const vue = function (el) {
        let a = 1;
        for (let n = el; n && n !== window.map.getContainer(); n = n.parentElement) a *= Number(getComputedStyle(n).opacity);
        return a;
      };
      const calc = couches.map(function (c) { return c._image ? vue(c._image) : 1; });
      const tpCalc = couches.length ? 1 : vue(tp);
      return { tpStyle: tp.style.opacity, tpCalc: tpCalc, n: couches.length,
               options: couches.map(function (c) { return c.options.opacity; }),
               styles: couches.map(function (c) { return c._image ? c._image.style.opacity : null; }),
               effectif: Math.round(tpCalc * (calc.length ? Math.min.apply(null, calc) : 1) * 1000) / 1000 };
    },
    // Couleur de l'aplat posé sous l'image par l'export (exporter.js : fond du plan, sinon blanc).
    aplat: function () {
      const cv = document.createElement("canvas"); cv.width = cv.height = 1;
      const g = cv.getContext("2d");
      g.fillStyle = (typeof window.ktaCouleurFondPlan === "function" && window.ktaCouleurFondPlan()) || "#ffffff";
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    // Moyenne RVB de l'export PNG (moteur des exports) d'une région, sans annotations ni calques.
    moyenneExport: async function (region) {
      const cv = await window.MyKTAMapExporterGenererCanvas({
        bg: "image", scale: 1, region: region, imageLayers: {}, includeImgLayers: false, includeDataLayers: false,
        ann: { points: false, roads: false, zones: false, structures: false }
      });
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      const s = [0, 0, 0]; let n = 0;
      for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; }
      return s.map(function (v) { return Math.round(v / n * 10) / 10; });
    },
    // Région de 64 × 64 (grille 7 × 7) où l'image s'écarte le plus de l'aplat (sinon l'atténuation serait invisible).
    choisirRegion: async function () {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight, a = window.__tp.aplat();
      let mieux = null;
      for (let i = 1; i <= 7; i++) for (let j = 1; j <= 7; j++) {
        const r = { x: Math.round(W * i / 8) - 32, y: Math.round(H * j / 8) - 32, w: 64, h: 64 };
        const m = await window.__tp.moyenneExport(r);
        const ecart = Math.max(Math.abs(m[0] - a[0]), Math.abs(m[1] - a[1]), Math.abs(m[2] - a[2]));
        if (!mieux || ecart > mieux.ecart) mieux = { region: r, ecart: ecart, moyenne: m };
      }
      return mieux;
    },
    detection: async function (region) {
      const cv = document.createElement("canvas"); cv.width = region.w; cv.height = region.h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const res = await window.ktaDessinerRegionPlan(ctx, region, 1, { niveau: 0 });
      const d = ctx.getImageData(0, 0, region.w, region.h).data;
      let somme = 0, h = 0;
      for (let i = 0; i < d.length; i++) { somme += d[i]; h = (h * 31 + d[i]) >>> 0; }
      return { ok: !!(res && res.ok), source: res && res.source, somme: somme, empreinte: h };
    },
    curseur: function () {
      const tous = document.querySelectorAll("#kta-fp-modal [data-plan-opacite]");
      const i = tous[0];
      if (!i) return { nombre: 0 };
      const lbl = i.closest(".kta-fp-opacite");
      const avant = lbl && lbl.previousElementSibling;
      const v = lbl && lbl.querySelector(".kta-fp-opacite-valeur");
      return { nombre: tous.length, valeur: i.value, min: i.min, max: i.max, texte: v ? v.textContent : null,
               aria: i.getAttribute("aria-label"),
               sousLaCase: !!(avant && avant.querySelector && avant.querySelector("[data-plan-de-base]")),
               visible: i.getBoundingClientRect().width > 0 };
    },
    regler: function (pct) {
      const i = document.querySelector("#kta-fp-modal [data-plan-opacite]");
      if (!i) return false;
      i.value = String(pct);
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    preterCalage: function () {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      window.PLAN_CONFIG.plan.georef = {
        pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
        pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2.4e-6 },
        modele: "local"
      };
      if (window.FondOsmPlan) window.FondOsmPlan.majBouton();
    }
  };
}

async function ouvrirPlan(page, choix) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && window.PlanRegistry.getAll().length > 0 && typeof window.MyKTAMapExporterGenererCanvas === "function";
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  const nom = await page.evaluate(function (c) {
    const p = window.PlanRegistry.getAll().find(function (x) {
      return x.type === "server" && (c === "fictif" ? /fictif/i.test(x.name || "") && !/V2/.test(x.name || "") : x.name === c);
    });
    return p ? p.name : null;
  }, choix);
  if (!nom) throw new Error("plan introuvable dans l'index : " + choix);
  await page.getByText(nom, { exact: true }).first().click();
  await attendre(page, function () {
    return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan && !!window._currentLoadedPlanId;
  }, 90000);
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
  return nom;
}

async function ouvrirFiltres(page) {
  await page.evaluate(function () { if (window.FilterPanel) window.FilterPanel.ouvrir(); });
  await page.waitForTimeout(400);
}

async function scenario(nav) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  if (process.env.KTA_DEBUG) page.on("console", function (m) { console.log("     [page] " + m.text().slice(0, 200)); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  await page.addInitScript(outilsPage);
  await page.route(RE_OSM, function (route) { route.abort(); });
  await servirPlanV2Fictif(page, { nom: NOM_V2, id: "checkup_v2_opacite_fond" });
  try {
    // ════ Relevé fictif (rendu direct) ════
    const nom = await ouvrirPlan(page, "fictif");
    const mode = await page.evaluate(function () { return window.__tp.mode(); });
    inf("relevé fictif ouvert (" + nom + "), rendu " + mode);
    await page.evaluate(function () { window.__tp.temoin(); });

    console.log("— T1 : sans réglage —");
    const t1 = await page.evaluate(async function () {
      const choix = await window.__tp.choisirRegion();
      return { prefs: window.__tp.prefs(), op: window.__tp.opacite(), choix: choix, aplat: window.__tp.aplat(),
               det: await window.__tp.detection(choix.region) };
    });
    verifier(t1.prefs && !("baseImageOpacity" in t1.prefs) && t1.prefs.tpTemoin === "garde",
      "rien d'écrit dans les prefs du plan", t1.prefs);
    verifier(t1.op.n > 0 && t1.op.tpStyle === "" && t1.op.styles.every(function (s) { return s === "" || s === null; }) &&
      t1.op.options.every(function (o) { return o === 1; }) && t1.op.effectif === 1,
      "image opaque, aucun style d'opacité posé", t1.op);
    verifier(t1.det.ok, "détection : image du plan lue (" + t1.det.source + ")", t1.det);
    inf("région d'essai : écart image / aplat " + t1.choix.ecart + " (moyenne " + t1.choix.moyenne + ", aplat " + t1.aplat + ")");
    if (t1.choix.ecart < 10) pb("région d'essai trop proche de l'aplat : l'atténuation de l'export ne se mesure pas");

    console.log("— T2 : curseur des filtres —");
    await ouvrirFiltres(page);
    const c0 = await page.evaluate(function () { return window.__tp.curseur(); });
    verifier(c0.nombre === 1 && c0.visible, "un seul curseur d'opacité du plan de base dans les filtres", c0);
    verifier(c0.sousLaCase, "curseur juste sous la case « Afficher le plan de base »", c0);
    verifier(c0.valeur === "100" && c0.min === "10" && c0.max === "100", "curseur 10–100, à 100 % au départ", c0);
    verifier(!!c0.aria, "curseur nommé pour les lecteurs d'écran", c0.aria);
    await page.evaluate(function () { window.__tp.regler(50); });
    await page.waitForTimeout(200);
    const t2 = await page.evaluate(function () {
      return { op: window.__tp.opacite(), prefs: window.__tp.prefs(), c: window.__tp.curseur() };
    });
    verifier(pres(t2.op.effectif, 0.5, 0.01), "image principale à 50 % sur la carte", t2.op);
    verifier(t2.prefs && t2.prefs.baseImageOpacity === 0.5 && t2.prefs.tpTemoin === "garde",
      "prefs : baseImageOpacity = 0.5, autres réglages gardés", t2.prefs);
    verifier(/^50\s?%$/.test((t2.c.texte || "").replace(/ /g, " ")), "valeur affichée « 50 % »", t2.c);

    console.log("— T3 : export PNG —");
    const m3 = await page.evaluate(function (r) { return window.__tp.moyenneExport(r); }, t1.choix.region);
    const att3 = [0, 1, 2].map(function (i) { return Math.round((t1.choix.moyenne[i] * 0.5 + t1.aplat[i] * 0.5) * 10) / 10; });
    verifier([0, 1, 2].every(function (i) { return pres(m3[i], att3[i], 2); }),
      "export à 50 % : " + m3 + " (attendu " + att3 + ", opaque " + t1.choix.moyenne + ")");

    console.log("— T4 : détection —");
    const t4 = await page.evaluate(function (r) { return window.__tp.detection(r); }, t1.choix.region);
    verifier(t4.empreinte === t1.det.empreinte && t4.somme === t1.det.somme,
      "détection : pixels identiques à ceux de l'image pleine", { avant: t1.det, apres: t4 });

    console.log("— T5 : fond OSM sous le plan —");
    const t5 = await page.evaluate(async function () {
      const pause = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      window.__tp.preterCalage();
      if (!window.FondOsmPlan) return null;
      window.FondOsmPlan.allumer();
      window.FondOsmPlan.regler(50);
      await pause(300);
      const a = { allume: window.FondOsmPlan.etat().allume, op: window.__tp.opacite() };
      window.__tp.regler(80);
      await pause(200);
      const b = window.__tp.opacite();
      window.FondOsmPlan.eteindre();
      await pause(200);
      const c = window.__tp.opacite();
      window.FondOsmPlan.allumer();
      await pause(200);
      const d = window.__tp.opacite();
      window.FondOsmPlan.eteindre();
      window.__tp.regler(50);
      await pause(200);
      return { a: a, b: b, c: c, d: d, e: window.__tp.opacite() };
    });
    verifier(t5 && t5.a.allume && pres(t5.a.op.effectif, 0.25, 0.01), "50 % ici × 50 % OSM = 25 %", t5 && t5.a);
    verifier(t5 && pres(t5.b.effectif, 0.4, 0.01), "curseur à 80 % avec OSM à 50 % : 40 %", t5 && t5.b);
    verifier(t5 && pres(t5.c.effectif, 0.8, 0.01), "fond OSM éteint : le curseur seul (80 %)", t5 && t5.c);
    verifier(t5 && pres(t5.d.effectif, 0.4, 0.01), "fond OSM rallumé : de nouveau 40 %", t5 && t5.d);
    verifier(t5 && pres(t5.e.effectif, 0.5, 0.01), "OSM éteint, curseur remis à 50 %", t5 && t5.e);

    console.log("— T6 : tuiles V1 —");
    const t6 = await page.evaluate(async function () {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      const cv = document.createElement("canvas"); cv.width = cv.height = 8;
      const ov = L.imageOverlay(cv.toDataURL(), [[0, 0], [H / 4, W / 4]]).addTo(window.map);
      window._baseTiles = (window._baseTiles || []).concat([{ overlay: ov }]);
      window.__tp.regler(60);
      await new Promise(function (r) { setTimeout(r, 200); });
      const v = ov.options.opacity;
      window.__tp.regler(50);
      const v2 = ov.options.opacity;
      window.map.removeLayer(ov);
      window._baseTiles = window._baseTiles.filter(function (t) { return t.overlay !== ov; });
      return { a60: v, a50: v2 };
    });
    verifier(pres(t6.a60, 0.6, 0.001) && pres(t6.a50, 0.5, 0.001), "une tuile V1 suit le curseur (60 % puis 50 %)", t6);
    await page.evaluate(function () { if (window.FilterPanel) window.FilterPanel.fermer(); });

    console.log("— T7 : page rechargée, plan rouvert —");
    await ouvrirPlan(page, "fictif");
    const t7op = await page.evaluate(function () { return window.__tp.opacite(); });
    await ouvrirFiltres(page);
    const t7c = await page.evaluate(function () { return window.__tp.curseur(); });
    verifier(pres(t7op.effectif, 0.5, 0.01) && t7op.options.every(function (o) { return o === 0.5; }),
      "50 % réappliqué au chargement du plan", t7op);
    verifier(t7c.valeur === "50", "curseur rouvert à 50", t7c);

    console.log("— T9 (fictif) : retour à 100 % —");
    const t9 = await page.evaluate(function () {
      window.__tp.regler(100);
      return { prefs: window.__tp.prefs(), op: window.__tp.opacite() };
    });
    verifier(t9.prefs && !("baseImageOpacity" in t9.prefs) && t9.prefs.tpTemoin === "garde",
      "100 % retire la pref, le témoin reste", t9.prefs);
    verifier(t9.op.effectif === 1, "image de nouveau opaque", t9.op);
    await page.evaluate(function () { window.__tp.regler(50); if (window.FilterPanel) window.FilterPanel.fermer(); });

    // ════ Plan V2 fictif ════
    console.log("— T8 : plan V2 —");
    await ouvrirPlan(page, NOM_V2);
    const v2a = await page.evaluate(async function () {
      const r = { x: 1000, y: 1000, w: 160, h: 160 };
      return { mode: window.__tp.mode(), op: window.__tp.opacite(), prefs: window.__tp.prefs(), region: r,
               aplat: window.__tp.aplat(), m: await window.__tp.moyenneExport(r), det: await window.__tp.detection(r) };
    });
    verifier(v2a.mode === "V2", "plan V2 ouvert en tuiles V2", v2a.mode);
    verifier(v2a.op.tpStyle === "" && v2a.op.effectif === 1 && !(v2a.prefs && "baseImageOpacity" in v2a.prefs),
      "V2 sans réglage : opaque (le réglage du relevé fictif ne déborde pas)", { op: v2a.op, prefs: v2a.prefs });
    await ouvrirFiltres(page);
    const v2b = await page.evaluate(async function (r) {
      const pause = function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };
      window.__tp.regler(50);
      await pause(200);
      const a = window.__tp.opacite();
      const m = await window.__tp.moyenneExport(r);
      const det = await window.__tp.detection(r);
      window.__tp.preterCalage();
      window.FondOsmPlan.allumer();
      window.FondOsmPlan.regler(50);
      await pause(300);
      const osm = window.__tp.opacite();
      window.FondOsmPlan.eteindre();
      await pause(200);
      return { a: a, m: m, det: det, osm: osm, eteint: window.__tp.opacite() };
    }, v2a.region);
    verifier(v2b.a.tpStyle === "0.5" && pres(v2b.a.effectif, 0.5, 0.01), "V2 : tilePane à 50 %", v2b.a);
    const attV2 = [0, 1, 2].map(function (i) { return Math.round((v2a.m[i] * 0.5 + v2a.aplat[i] * 0.5) * 10) / 10; });
    verifier([0, 1, 2].every(function (i) { return pres(v2b.m[i], attV2[i], 2); }),
      "V2 : export à 50 % : " + v2b.m + " (attendu " + attV2 + ", opaque " + v2a.m + ")");
    verifier(v2b.det.empreinte === v2a.det.empreinte && v2b.det.somme === v2a.det.somme,
      "V2 : détection identique à l'image pleine (" + v2b.det.source + ")", { avant: v2a.det, apres: v2b.det });
    verifier(pres(v2b.osm.effectif, 0.25, 0.01), "V2 : 50 % × OSM 50 % = 25 %", v2b.osm);
    verifier(pres(v2b.eteint.effectif, 0.5, 0.01), "V2 : OSM éteint, 50 %", v2b.eteint);
    await ouvrirPlan(page, NOM_V2);
    const v2c = await page.evaluate(function () { return window.__tp.opacite(); });
    verifier(v2c.tpStyle === "0.5", "V2 : 50 % réappliqué au rechargement", v2c);
    await ouvrirFiltres(page);
    const v2d = await page.evaluate(function () {
      window.__tp.regler(100);
      return { op: window.__tp.opacite(), prefs: window.__tp.prefs() };
    });
    verifier(v2d.op.tpStyle === "" && !(v2d.prefs && "baseImageOpacity" in v2d.prefs), "V2 : retour à 100 %, rien posé", v2d);

    const utiles = erreurs.filter(function (e) { return !/swRegister|serviceWorker/i.test(e); });
    verifier(utiles.length === 0, "aucune erreur de page", utiles.slice(0, 3));
  } finally {
    await ctx.close();
  }
}

(async function main() {
  const server = require("./server.js");
  const joues = [];
  for (const nom of moteurs()) {
    let nav = null;
    try {
      nav = await lancerMoteur(nom);
      if (!nav) { inf("moteur " + nom + " absent : non joué"); continue; }
      MOTEUR = nom;
      console.log("\n══ moteur " + nom + " (" + nav.version() + ") ══");
      await scenario(nav);
      joues.push(nom);
    } catch (e) {
      MOTEUR = nom;
      pb("exception : " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
    } finally {
      if (nav) await nav.close();
    }
  }
  if (server && server.close) server.close();
  if (!joues.length && !problemes.length) pb("aucun moteur lancé (KTA_MOTEURS=" + (process.env.KTA_MOTEURS || "") + ")");
  console.log("");
  if (problemes.length) {
    console.log("⚠️ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — opacité de l'image principale (" + joues.join(", ") + ")");
  process.exit(0);
})();
