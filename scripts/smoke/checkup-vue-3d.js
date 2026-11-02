#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-vue-3d.js — checkup (Playwright) : vue 3D (js/vue3d.js) sur le relevé fictif
// =====================================================================
// Rien de la 3D n'est demandé au démarrage ni au chargement du plan. Bouton cube de la barre de droite (sous ≡) grisé
// sans échelle (rien chargé, message), plus de tuile au menu Tracker ; ouverte par ce bouton derrière un indicateur de
// chargement, focus dans la vue (aria-modal) puis rendu au bouton : scène non vide, textes du dictionnaire,
// mur plus bas que le pilier qu'il traverse, avancer, buter contre le pilier (règle du pas du tracker), clavier, vue plongeante,
// niveau ; perte du contexte WebGL simulée (WEBGL_lose_context) puis reprise ; « Je suis ici ? » à la fermeture
// (Non = rien, Oui = tracker recalé) ; perte sans reprise = fermeture avec message ; WebGL absent = refus avec
// message ; 20 ouvertures de suite sans « Too many active WebGL contexts » ; aucune erreur de page ni de console.
// Aussi : pas rapide (appui long ▲, Maj) ; collisions sur 6 obstacles fictifs (pilier, pilier fin, mur, mur en
// ligne, front, pilier perso) sous 12 angles, pas rapides et grand pas, départ collé à une face, jugées par une
// géométrie propre au checkup ; inclinaison de la vue plongeante ; rose des vents (nord calibré ou non) ; bascule
// suivi / libre avec un cap d'appareil simulé, 🧭 grisé tracker arrêté ; POI au centre d'un pilier visible depuis
// la galerie, collé à la face vue. Mode galerie sur des tracés fictifs (T, X, coudes droit et aigu, cul-de-sac, presque
// parallèles) : aucune paroi à travers une autre, butées, carrefours, zones coupées au tube, POI à 2 / 5 / 25 m,
// interrupteur retenu par plan ; passages 🪜 par POI et tracé jonction ; carte 2D placée à la sortie. Intégration :
// ≡ ouvre le ≡ Filtres de la carte (état partagé dans les deux sens : zone, structure, calque, type de tracé), pastille ;
// 🚨 = Sortie d'urgence ; toasts sous la rangée ; ✕ au coin haut droit au téléphone ; ❓ ouvre l'aide de la 3D ;
// Échap ferme le réglage puis la vue ; panneau de POI sombre en thème clair, borné de près ; rendu en pause.
// Mesures (facultatives, objets FICTIFS générés en mémoire, jamais écrits) :
//   KTA_V3D_PERF=galerie → réseau de 3 120 tronçons en mode galerie seulement (=1 : tout) ;
//   KTA_V3D_PERF=mixte → ce réseau sur le plan dense, piliers gardés sur la moitié est seulement (tubes à l'ouest,
//   chambres à l'est), en mode mixte ;
//   KTA_V3D_PERF=1 → plan dense synthétique (9 000 piliers, 3 000 murs, 1 000 murs en ligne, 700 fronts,
//   zones, tracés, POI) : temps d'ouverture, triangles, appels, ms par image à 20 / 30 / 50 m et sans tuiles ;
//   KTA_V3D_TEL=1 → fenêtre et densité d'un iPhone (393 × 852, x3), processeur ralenti x4 (Chromium seul) ;
//   KTA_V3D_CAPTURES=<dossier> → captures (hors dépôt).
// Usage : node scripts/smoke/checkup-vue-3d.js (SMOKE_PORT pour une autre copie) · doc : docs/ETUDE_VUE_3D.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const path = require("path");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
// KTA_V3D_PERF=1 : toutes les mesures ; =galerie ou =mixte : celles de ce rendu seulement.
const PERF = ["1", "galerie", "mixte"].indexOf(process.env.KTA_V3D_PERF) >= 0;
const PERF_STRUCTURES = process.env.KTA_V3D_PERF === "1";
const PERF_GALERIE = process.env.KTA_V3D_PERF === "1" || process.env.KTA_V3D_PERF === "galerie";
const PERF_MIXTE = process.env.KTA_V3D_PERF === "1" || process.env.KTA_V3D_PERF === "mixte";
const TEL = process.env.KTA_V3D_TEL === "1";
const CAPTURES = process.env.KTA_V3D_CAPTURES || "";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const RX_3D = /\/lib\/three\/|\/js\/vue3d\.js|\/css\/vue3d\.css/;

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function capture(page, nom) {
  if (!CAPTURES) return;
  await page.screenshot({ path: path.join(CAPTURES, nom + ".png") });
}

// Plan dense synthétique, dans le registre des structures embarquées (mémoire seule, aucune session écrite).
// Maille de 7 m : piliers irréguliers de 6 à 12 sommets, murs polygones allongés, murs en ligne et fronts dans
// les galeries ; quelques zones, tracés et POI.
function semerPlanDense() {
  const sc = window.APP_CONFIG.scale, H = window.PLAN_CONFIG.plan.imageHeight, W = window.PLAN_CONFIG.plan.imageWidth;
  let graine = 42;
  const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  const maille = 7 * sc, cotes = 115;
  const x0 = Math.max(0, W / 2 - (cotes / 2) * maille), y0 = Math.max(0, H / 2 - (cotes / 2) * maille);
  const liste = [], zones = [], points = [];
  let piliers = 0, murs = 0, lignes = 0, fronts = 0;
  for (let j = 0; j < cotes; j++) {
    for (let i = 0; i < cotes; i++) {
      const cx = x0 + (i + 0.5) * maille, cy = y0 + (j + 0.5) * maille;
      if (piliers < 9000 && (murs >= 3000 || alea() < 0.75)) {
        const n = 6 + Math.floor(alea() * 7), r = (1.6 + alea() * 0.8) * sc, pts = [];
        for (let k = 0; k < n; k++) {
          const a = k / n * Math.PI * 2, rr = r * (0.8 + alea() * 0.35);
          pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
        }
        liste.push({ type: alea() < 0.85 ? "pilier-1" : "pilier-2", level: 0, points: pts });
        piliers++;
      } else if (murs < 3000) {
        const l = 2.6 * sc, e = 0.5 * sc, pts = [];
        for (let k = 0; k <= 4; k++) pts.push({ x: cx - l + k * l / 2, y: cy - e + (alea() - 0.5) * sc * 0.2 });
        for (let k = 4; k >= 0; k--) pts.push({ x: cx - l + k * l / 2, y: cy + e + (alea() - 0.5) * sc * 0.2 });
        liste.push({ type: "mur", level: 0, points: pts });
        murs++;
      }
      // Murs en ligne et fronts : dans la galerie au sud-est de la case.
      if (lignes < 1000 && alea() < 0.08) {
        const gx = cx + maille / 2, gy = cy + maille / 2, pts = [];
        for (let k = 0; k < 4; k++) pts.push({ x: gx + (k - 1.5) * sc * 1.5, y: gy + (alea() - 0.5) * sc });
        liste.push({ type: "mur-ligne", level: 0, points: pts });
        lignes++;
      } else if (fronts < 700 && alea() < 0.06) {
        const gx = cx + maille / 2, gy = cy, pts = [];
        for (let k = 0; k < 8; k++) pts.push({ x: gx + (alea() - 0.5) * sc * 0.6, y: gy + (k - 3.5) * sc * 0.8 });
        liste.push({ type: "front-1", level: 0, points: pts });
        fronts++;
      }
      if (alea() < 0.01) {
        const t = ["eau", "remblais", "effondrement", "inaccessible"][Math.floor(alea() * 4)];
        const gx = cx + maille / 2, gy = cy + maille / 2, r = 1.2 * sc;
        zones.push({ type: t, level: 0, points: [{ x: gx - r, y: gy - r }, { x: gx + r, y: gy - r },
          { x: gx + r, y: gy + r }, { x: gx - r, y: gy + r }] });
      }
      if (alea() < 0.04) points.push({ id: "POI " + points.length, x: cx + maille / 2, y: cy + maille / 2, level: 0,
        tags: ["danger"] });
    }
  }
  window.__v3dAvant = (window._ktaDataStructurePolygons || []).slice();
  window._ktaDataStructurePolygons = (window._ktaDataStructurePolygons || []).concat(liste);
  window.setZones(zones);
  window.setEditorPoints(points);
  return { piliers: piliers, murs: murs, lignes: lignes, fronts: fronts, zones: zones.length, poi: points.length,
    depart: { x: x0 + maille * cotes / 2, y: y0 + maille * cotes / 2 + maille / 2, cap: 90 } };
}

async function mesures(page, depart) {
  const out = {};
  const cas_ = [{ nom: "20 m", d: 20 }, { nom: "30 m", d: 30 }, { nom: "50 m", d: 50 },
    { nom: "30 m sans tuiles", d: 30, sansTuiles: true }];
  for (const cas of cas_) {
    const r = await page.evaluate(function (c) {
      return window.KtaVue3D.ouvrir({ depart: c.depart, distanceVue: c.d, tuiles: !c.sansTuiles }).then(function () {
        const e0 = window.KtaVue3D.etat();
        const m = window.KtaVue3D.mesurer({ images: 90 });
        const e1 = window.KtaVue3D.etat();
        window.KtaVue3D.fermer();
        const tas = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        return { ouverture: e0.msOuverture, index: e0.msIndex, tuiles: e1.tuiles, construites: e1.construites,
          geometries: m.memoire.geometries, premierTour: m.msPremierTour, msMed: m.msMed, msP95: m.msP95,
          msMax: m.msMax, triangles: m.trianglesMax, appels: m.appelsMax, tasMo: tas };
      });
    }, { depart: depart, d: cas.d, sansTuiles: !!cas.sansTuiles });
    out[cas.nom] = r;
    console.log("  📏 " + cas.nom + " : " + JSON.stringify(r));
  }
  return out;
}

// Réseau synthétique pour le mode galerie (mémoire seule) : 26 tracés est-ouest et 26 nord-sud tous les 12 m sur
// 300 m, un sommet tous les 5 m un peu décalé (≈ 3 100 tronçons, 676 carrefours), quatre types dont un perso ; zones
// et POI aux carrefours.
function semerGalerie() {
  const sc = window.APP_CONFIG.scale, W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
  if (window.__v3dAvant) window._ktaDataStructurePolygons = window.__v3dAvant;
  let graine = 11;
  const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  const cote = 300, pas = 12, x0 = W / 2 / sc - cote / 2, z0 = H / 2 / sc - cote / 2;
  const types = ["principal", "secondaire", "chemin", "cust-v3d-galerie"], roads = [], zones = [], points = [];
  let troncons = 0;
  for (let k = 0; k <= 25; k++) {
    for (let sens = 0; sens < 2; sens++) {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const a = i * 5, b = k * pas + (alea() - 0.5) * 1.2;
        pts.push(sens ? { x: (x0 + b) * sc, y: (z0 + a) * sc } : { x: (x0 + a) * sc, y: (z0 + b) * sc });
      }
      troncons += pts.length - 1;
      roads.push({ type: types[(k + sens) % 4], level: 0, points: pts });
    }
  }
  for (let k = 0; k < 120; k++) {
    const cx = x0 + Math.floor(alea() * 25) * pas + 6, cz = z0 + Math.floor(alea() * 26) * pas, r = 2;
    zones.push({ type: ["eau", "remblais", "inaccessible", "effondrement"][k % 4], level: 0,
      points: [{ x: (cx - r) * sc, y: (cz - r) * sc }, { x: (cx + r) * sc, y: (cz - r) * sc },
        { x: (cx + r) * sc, y: (cz + r) * sc }, { x: (cx - r) * sc, y: (cz + r) * sc }] });
  }
  for (let k = 0; k < 300; k++) {
    points.push({ id: "POI " + k, level: 0, tags: ["danger"], x: (x0 + alea() * cote) * sc, y: (z0 + alea() * cote) * sc });
  }
  window.setRoads(roads);
  window.setZones(zones);
  window.setEditorPoints(points);
  window.setPlanRenduVue3D(null, "galerie");
  window.KtaGalerie.invalider();
  const t0 = performance.now(), m = window.KtaGalerie.modele(0), ms = performance.now() - t0;
  return { troncons: troncons, aretes: m.aretes.length, pieces: m.pieces.length, dalles: m.dalles, coudes: m.coudes,
    msModele: Math.round(ms), zones: zones.length, poi: points.length,
    depart: { x: (x0 + 150) * sc, y: (z0 + 12 * 12) * sc, cap: 90 } };
}

// Mixte : réseau de semerGalerie posé, puis le plan dense (semerPlanDense) gardé sur la moitié est : la marche de
// 120 m passe des tubes aux chambres. Appelé après les deux semis.
function semerMixte() {
  const sc = window.APP_CONFIG.scale, W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
  const garde = (window.__v3dAvant || []).length;
  window._ktaDataStructurePolygons = window._ktaDataStructurePolygons.filter(function (s, i) {
    return i < garde || s.points[0].x > W / 2;
  });
  window.setPlanRenduVue3D(null, "mixte");
  window.KtaGalerie.invalider();
  const t0 = performance.now(), m = window.KtaGalerie.modele(0, true), ms = performance.now() - t0;
  return { structures: window._ktaDataStructurePolygons.length - garde, aretes: m.aretes.length,
    pieces: m.pieces.length, chambres: m.chambres, ouverts: m.ouverts, msModele: Math.round(ms),
    depart: { x: W / 2, y: H / 2 - 6 * sc, cap: 90 } };
}

// nom : "galerie" (réseau seul, rendu galerie) ou "mixte" (semis déjà posé par semerMixte).
async function mesuresGalerie(page, nom, semisDonne) {
  const semis = semisDonne || await page.evaluate(semerGalerie);
  console.log("  ℹ️ réseau " + nom + " synthétique : " + JSON.stringify(semis));
  for (const d of [30, 50]) {
    const r = await page.evaluate(function (c) {
      return window.KtaVue3D.ouvrir({ depart: c.depart, distanceVue: c.d }).then(function () {
        const e0 = window.KtaVue3D.etat(), m = window.KtaVue3D.mesurer({ images: 90 }), e1 = window.KtaVue3D.etat();
        const parois = window.KtaVue3D.parois().length;
        window.KtaVue3D.fermer();
        const tas = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        return { rendu: e1.rendu, ouverture: e0.msOuverture, index: e0.msIndex, construites: e1.construites,
          parois: parois, premierTour: m.msPremierTour, msMed: m.msMed, msP95: m.msP95,
          msMax: m.msMax, triangles: m.trianglesMax, appels: m.appelsMax, tasMo: tas };
      });
    }, { depart: semis.depart, d: d });
    console.log("  📏 " + nom + " " + d + " m : " + JSON.stringify(r));
  }
  const marche = await page.evaluate(function (d) {
    return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30 }).then(function () {
      const sc = window.APP_CONFIG.scale, durees = [];
      return new Promise(function (r) {
        let i = 0, t = 0;
        function pas(ts) {
          if (t && i > 3) durees.push(ts - t);
          t = ts;
          if (i++ >= 600) {
            window.KtaVue3D.fermer();
            durees.sort(function (a, b) { return a - b; });
            r({ images: durees.length, msMed: +durees[durees.length >> 1].toFixed(1),
              msP95: +durees[Math.floor(durees.length * 0.95)].toFixed(1), msMax: +durees[durees.length - 1].toFixed(1),
              plus33ms: durees.filter(function (v) { return v > 33.4; }).length });
            return;
          }
          window.KtaVue3D.placer(d.x + (i * 0.2 - 60) * sc, d.y, 90);
          requestAnimationFrame(pas);
        }
        requestAnimationFrame(pas);
      });
    });
  }, semis.depart);
  console.log("  📏 " + nom + ", marche 120 m (intervalle entre images) : " + JSON.stringify(marche));
  const coutPas = await page.evaluate(function (d) {
    return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30 }).then(function () {
      const libres = [], refuses = [];
      for (let i = 0; i < 600; i++) {
        const t0 = performance.now(), ok = window.KtaVue3D.avancer(0.08);
        (ok ? libres : refuses).push(performance.now() - t0);
        if (!ok) window.KtaVue3D.tourner(90);
      }
      window.KtaVue3D.fermer();
      const st = function (t) {
        if (!t.length) return null;
        t.sort(function (a, b) { return a - b; });
        return { n: t.length, msMed: +t[t.length >> 1].toFixed(3), msP95: +t[Math.floor(t.length * 0.95)].toFixed(3) };
      };
      return { libres: st(libres), refuses: st(refuses) };
    });
  }, semis.depart);
  console.log("  📏 " + nom + ", pas balayé (avancer 8 cm) : " + JSON.stringify(coutPas));
  await page.evaluate(function (d) { return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30, stats: true }); },
    semis.depart);
  await page.waitForTimeout(800);
  await capture(page, nom + "-dense");
  await page.evaluate(function () { window.__v3dImg0 = window.KtaVue3D.etat().images; });
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(3000);
  await page.keyboard.up("ArrowLeft");
  const n = await page.evaluate(function () {
    const k = window.KtaVue3D.etat().images - window.__v3dImg0;
    window.KtaVue3D.fermer();
    return k;
  });
  console.log("  📏 " + nom + ", rotation continue 3 s : " + Math.round(n / 3) + " images/s");
}

(async function main() {
  const lancement = { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] };
  const nav = await lancerNavigateur(chromium, lancement);
  const contexte = await nav.newContext(TEL
    ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: "block" }
    : { viewport: { width: 1200, height: 800 }, serviceWorkers: "block" });
  const page = await contexte.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [], consoleErr = [], requetes3d = [];
  let ouvert = false, perteSimulee = false;
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  page.on("console", function (m) {
    const t = m.text();
    // Pertes de contexte et WebGL coupé PROVOQUÉS par le checkup : leurs avis sont attendus.
    if (perteSimulee && /CONTEXT_LOST|loseContext|restoreContext|Error creating WebGL context|WebGL indisponible/i.test(t)) return;
    if (/Too many active WebGL contexts|CONTEXT_LOST|WebGL: INVALID/i.test(t)) consoleErr.push(t.slice(0, 160));
    if (m.type() === "error" && /vue3d|three|WebGL/i.test(t)) consoleErr.push(t.slice(0, 160));
  });
  page.on("request", function (r) { if (RX_3D.test(r.url()) && !ouvert) requetes3d.push(r.url().replace(BASE, "")); });
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
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && typeof window.ktaPasBloqueParStructure === "function";
    }, 40000);
    await page.waitForTimeout(1500);
    verifier(requetes3d.length === 0, "rien de la 3D chargé au démarrage ni avec le plan", requetes3d);
    verifier(await page.evaluate(function () { return !window.KtaVue3D && !document.getElementById("kta-vue3d-css"); }),
      "KtaVue3D absent tant qu'on ne l'a pas demandé");

    const gpu = await page.evaluate(function () {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return "sans WebGL2";
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const perte = gl.getExtension("WEBGL_lose_context");
      if (perte) perte.loseContext();
      return r;
    });
    console.log("  ℹ️ rendu WebGL : " + gpu);

    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    });

    if (PERF) {
      ouvert = true;
      await page.addScriptTag({ url: BASE + "/js/vue3d.js" });
      if (TEL) {
        try {
          const cdp = await contexte.newCDPSession(page);
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
          console.log("  ℹ️ processeur ralenti x4");
        } catch (e) { console.log("  ℹ️ ralentissement processeur indisponible : " + e.message); }
      }
      if (PERF_STRUCTURES) {
      await page.evaluate(function () { window.setPlanRenduVue3D(null, "structures"); });
      const semis = await page.evaluate(semerPlanDense);
      console.log("  ℹ️ plan dense synthétique : " + JSON.stringify(semis));
      await mesures(page, semis.depart);
      // Marche de 120 m en ligne droite (0,2 m par image) : durée de chaque image, constructions de tuiles comprises.
      const marche = await page.evaluate(function (d) {
        return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30 }).then(function () {
          const sc = window.APP_CONFIG.scale, durees = [];
          return new Promise(function (r) {
            let i = 0, t = 0;
            function pas(ts) {
              if (t && i > 3) durees.push(ts - t);   // les premières images compilent les shaders
              t = ts;
              if (i++ >= 600) {
                window.KtaVue3D.fermer();
                durees.sort(function (a, b) { return a - b; });
                r({ images: durees.length, msMed: +durees[durees.length >> 1].toFixed(1),
                  msP95: +durees[Math.floor(durees.length * 0.95)].toFixed(1), msMax: +durees[durees.length - 1].toFixed(1),
                  plus33ms: durees.filter(function (v) { return v > 33.4; }).length });
                return;
              }
              window.KtaVue3D.placer(d.x + i * 0.2 * sc, d.y, 90);
              requestAnimationFrame(pas);
            }
            requestAnimationFrame(pas);
          });
        });
      }, semis.depart);
      console.log("  📏 marche 120 m, 30 m de vue (intervalle entre images) : " + JSON.stringify(marche));
      // Coût d'un pas balayé (corps de 0,8 m : 3 couloirs + 12 rayons) dans le plan dense, buttées comprises.
      const coutPas = await page.evaluate(function (d) {
        // Image de collision du plan fictif mise de côté : seules les structures synthétiques sont jugées.
        const acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        // Départ DANS l'image du plan (le semis la déborde : un pas hors du plan est refusé), dans une galerie.
        const sc = window.APP_CONFIG.scale, m = 7 * sc, W = window.PLAN_CONFIG.plan.imageWidth;
        const H = window.PLAN_CONFIG.plan.imageHeight, x0 = Math.max(0, W / 2 - 57.5 * m), y0 = Math.max(0, H / 2 - 57.5 * m);
        const dep = { x: x0 + (Math.floor((W / 2 - x0) / m) + 0.5) * m, y: y0 + Math.floor((H / 2 - y0) / m) * m, cap: 90 };
        return window.KtaVue3D.ouvrir({ depart: dep, distanceVue: 30 }).then(function () {
          const libres = [], refuses = [];
          for (let i = 0; i < 600; i++) {
            const t0 = performance.now();
            const ok = window.KtaVue3D.avancer(0.08);
            (ok ? libres : refuses).push(performance.now() - t0);
            if (!ok) window.KtaVue3D.tourner(23);
          }
          window.KtaVue3D.fermer();
          window.ktaEstAccessible = acc;
          const st = function (t) {
            if (!t.length) return null;
            t.sort(function (a, b) { return a - b; });
            return { n: t.length, msMed: +t[t.length >> 1].toFixed(3), msP95: +t[Math.floor(t.length * 0.95)].toFixed(3),
              msMax: +t[t.length - 1].toFixed(3) };
          };
          return { libres: st(libres), refuses: st(refuses) };
        });
      }, semis.depart);
      console.log("  📏 pas balayé (avancer 8 cm, plan dense) : " + JSON.stringify(coutPas));
      await page.evaluate(function (d) {
        return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30, stats: true });
      }, semis.depart);
      await page.waitForTimeout(800);
      await capture(page, "dense-yeux");
      await page.evaluate(function () { window.KtaVue3D.basculerVue(); });
      await page.waitForTimeout(500);
      await capture(page, "dense-plongee");
      // Fréquence réelle (requestAnimationFrame) en marchant 3 s au clavier.
      await page.evaluate(function () { window.__v3dImg0 = window.KtaVue3D.etat().images; window.KtaVue3D.basculerVue(); });
      await page.keyboard.down("ArrowLeft");
      await page.waitForTimeout(3000);
      await page.keyboard.up("ArrowLeft");
      const n = await page.evaluate(function () { return window.KtaVue3D.etat().images - window.__v3dImg0; });
      console.log("  📏 rotation continue 3 s : " + Math.round(n / 3) + " images/s (affichage limité à l'écran)");
      await page.evaluate(function () { window.KtaVue3D.fermer(); });
      await page.evaluate(function (d) {
        return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30, densiteMax: 1 });
      }, semis.depart);
      await page.evaluate(function () { window.__v3dImg0 = window.KtaVue3D.etat().images; });
      await page.keyboard.down("ArrowLeft");
      await page.waitForTimeout(3000);
      await page.keyboard.up("ArrowLeft");
      const n1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        window.KtaVue3D.fermer();
        return e.images - window.__v3dImg0;
      });
      console.log("  📏 rotation continue 3 s, densité 1 : " + Math.round(n1 / 3) + " images/s");
      }
      if (PERF_GALERIE) await mesuresGalerie(page, "galerie");
      if (PERF_MIXTE) {
        await page.evaluate(semerGalerie);
        await page.evaluate(semerPlanDense);
        await mesuresGalerie(page, "mixte", await page.evaluate(semerMixte));
      }
    } else {
      // ── 1. Bouton cube grisé sans échelle : rien n'est chargé, le toucher explique ; plus de tuile au Tracker ──
      const grise = await page.evaluate(function () {
        const sc = window.APP_CONFIG.scale;
        window.APP_CONFIG.scale = 0;
        window.ktaMajBoutonVue3D();
        const a = document.querySelector(".kta-vue3d-ctrl a"), droite = document.querySelector(".leaflet-top.leaflet-right");
        const ctrls = droite ? Array.prototype.slice.call(droite.children) : [];
        const iFiltres = ctrls.findIndex(function (c) { return c.classList.contains("kta-filter-ctrl"); });
        const r = { existe: !!a, inactif: !!a && a.classList.contains("kta-inactif"), titre: a ? a.title : null,
          attendu: window.I18n.t("vue3d.sansEchelle"), sousFiltres: iFiltres >= 0 && ctrls[iFiltres + 1] &&
            ctrls[iFiltres + 1].classList.contains("kta-vue3d-ctrl"),
          picto: !!(a && a.querySelector("svg.kta-vue3d-ctrl-picto path")),
          couleur: a ? getComputedStyle(a).color : null, texte3: getComputedStyle(document.body).getPropertyValue("--kta-texte-3").trim(),
          opacite: a ? getComputedStyle(a).opacity : null, filtre: a ? getComputedStyle(a).filter : null };
        if (a) a.click();
        const ok = document.getElementById("kta-confirm-oui");
        r.alerte = ok ? ok.closest(".kta-readme-modal-boite").textContent : null;
        if (ok) ok.click();
        window.APP_CONFIG.scale = sc;
        window.ktaMajBoutonVue3D();
        r.actifApres = !a.classList.contains("kta-inactif");
        window.ouvrirMenuTracker();
        r.tuile = Array.prototype.slice.call(document.querySelectorAll(".kta-tracker-modal-tile")).some(function (t) {
          return t.textContent.indexOf("🧊") >= 0 || /3D/.test(t.textContent);
        });
        r.tuiles = document.querySelectorAll(".kta-tracker-modal-tile").length;
        const croix = document.querySelector(".kta-tracker-modal-close");
        if (croix) croix.click();
        return r;
      });
      verifier(grise.existe && grise.sousFiltres && grise.picto, "bouton cube (picto de l'écran Bienvenue) juste sous ≡ Filtres", grise);
      verifier(grise.inactif && grise.titre === grise.attendu && grise.opacite === "1" && /grayscale/.test(grise.filtre),
        "sans échelle : bouton grisé (texte-3, désaturé, sans opacité), son titre dit pourquoi", grise);
      verifier(!!grise.alerte && grise.alerte.indexOf(grise.attendu) >= 0 && grise.actifApres,
        "toucher le bouton grisé : message, pas de 3D ; échelle revenue : bouton actif", grise);
      verifier(!grise.tuile && grise.tuiles > 0, "menu Tracker : plus de tuile Vue 3D (" + grise.tuiles + " tuiles)", grise);
      await page.waitForTimeout(300);
      verifier(requetes3d.length === 0 && await page.evaluate(function () { return !window.KtaVue3D; }),
        "bouton grisé : rien de la 3D chargé", requetes3d);

      // Pilier de session à 3 m au nord du départ, et un mur qui le traverse d'est en ouest (objets fictifs).
      const prep = await page.evaluate(function () {
        const sc = window.APP_CONFIG.scale;
        if (window.APP_CONFIG.multiLevel === true) window.APP_CONFIG.activeLevel = 0;
        // Départ : le point le plus proche du centre dont la bande nord-sud de -4 m à +2 m est accessible selon
        // l'image de collision du plan (le pilier est posé dedans).
        const c = window.map.getCenter();
        const W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
        const cx = Math.round(c.lng), cy = Math.round(H - c.lat);
        const acc = window.ktaEstAccessible;
        const libre = function (px, py) {
          for (let k = -40; k <= 20; k++) { if (!acc(px, py + k * sc / 10)) return false; }
          return px > 5 * sc && px < W - 5 * sc && py > 6 * sc && py < H - 4 * sc;
        };
        let x = cx, y = cy;
        chercher: for (let r = 0; r < 400; r++) {
          for (let a = 0; a < 16; a++) {
            const px = Math.round(cx + Math.cos(a * Math.PI / 8) * r * sc);
            const py = Math.round(cy + Math.sin(a * Math.PI / 8) * r * sc);
            if (libre(px, py)) { x = px; y = py; break chercher; }
          }
        }
        const d = 3 * sc, l = 1.5 * sc, m = 0.25 * sc, ym = y - d - l;
        window.setStructures([
          { uid: "st_v3d_pilier", type: "pilier-1", level: 0,
            points: [{ x: x - l, y: y - d - 2 * l }, { x: x + l, y: y - d - 2 * l }, { x: x + l, y: y - d }, { x: x - l, y: y - d }] },
          { uid: "st_v3d_mur", type: "mur", level: 0,
            points: [{ x: x - 4 * sc, y: ym - m }, { x: x + 4 * sc, y: ym - m }, { x: x + 4 * sc, y: ym + m }, { x: x - 4 * sc, y: ym + m }] }
        ]);
        // Un POI fictif au centre du pilier : son panneau doit rester visible depuis la galerie.
        window.__v3dPoints = (window.getEditorPoints() || []).slice();
        window.setEditorPoints(window.__v3dPoints.concat([{ id: "POI v3d", x: x, y: ym, level: 0, tags: ["danger"] }]));
        // Tracker en suivi, posé au départ : la tuile ouvre la vue là.
        window.recalerTrackerSurPoint(x, y, 0);
        if (!window.getTrackingActif()) window.startTracking();
        return { x: x, y: y, sc: sc, multi: window.APP_CONFIG.multiLevel === true };
      });

      // ── 2. Ouverture par le bouton cube : indicateur de chargement, focus dans la vue ─────────────────────
      await page.evaluate(function () {
        window.__v3dLoader = [];
        window.__v3dObs = new MutationObserver(function () {
          const ov = document.getElementById("kta-compute-overlay");
          if (ov && ov.style.display !== "none") {
            const m = ov.querySelector(".kta-compute-msg");
            const t = m ? m.textContent : "";
            if (window.__v3dLoader.indexOf(t) < 0) window.__v3dLoader.push(t);
          }
        });
        window.__v3dObs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      });
      ouvert = true;
      await page.locator(".kta-vue3d-ctrl a").click();
      await attendre(page, function () {
        return !!window.KtaVue3D && window.KtaVue3D.etat().ouvert === true;
      }, 20000);
      await page.waitForTimeout(200);
      const charge = await page.evaluate(function () {
        window.__v3dObs.disconnect();
        const ov = document.getElementById("kta-vue3d");
        return { messages: window.__v3dLoader, attendu: window.I18n.t("vue3d.chargementPremier"),
          reste: !!document.getElementById("kta-compute-overlay"), modal: ov.getAttribute("aria-modal"),
          role: ov.getAttribute("role"), focus: ov.contains(document.activeElement) };
      });
      verifier(charge.messages.indexOf(charge.attendu) >= 0 && !charge.reste,
        "toucher → indicateur « premier chargement » jusqu'à la scène, puis retiré", charge);
      verifier(charge.role === "dialog" && charge.modal === "true" && charge.focus,
        "vue ouverte : dialog aria-modal, focus clavier dedans", charge);
      await page.keyboard.press("Tab");
      const tab = await page.evaluate(function () {
        return { dans: document.getElementById("kta-vue3d").contains(document.activeElement),
          v3d: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.v3d : null };
      });
      verifier(tab.dans, "Tab : le focus reste dans la vue", tab);
      const depuisTuile = await page.evaluate(function () { return window.KtaVue3D.etat(); });
      verifier(depuisTuile.mode === "suivi" && Math.abs(depuisTuile.pos.x - prep.x) < 1 &&
        Math.abs(depuisTuile.pos.y - prep.y) < 1, "ouverte par le bouton, à la position du tracker, en suivi",
        { mode: depuisTuile.mode, pos: depuisTuile.pos });
      // ── Mode « suivi » / « libre » : cap simulé à la source du mode plan orienté (getPlanRelHeading) ────────
      const capVrai = await page.evaluate(function () {
        window.__v3dCapVrai = window.getPlanRelHeading;
        window.getPlanRelHeading = function () { return 120; };
        return true;
      });
      await page.waitForTimeout(700);
      const s1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat(), b = document.querySelector('#kta-vue3d [data-v3d="suivre"]');
        return { mode: e.mode, cap: e.cap, dispo: e.suiviDispo, presse: b.getAttribute("aria-pressed"), titre: b.title,
          attendu: window.I18n.t("vue3d.passerLibre") };
      });
      verifier(capVrai && s1.mode === "suivi" && Math.abs(s1.cap - 120) < 2 && s1.dispo && s1.presse === "true" &&
        s1.titre === s1.attendu, "suivi : la vue prend le cap de l'appareil (120° simulés)", s1);
      await page.locator('#kta-vue3d [data-v3d="suivre"]').click();
      await page.evaluate(function () { window.getPlanRelHeading = function () { return 200; }; });
      await page.waitForTimeout(500);
      const s2 = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { mode: e.mode, cap: e.cap }; });
      verifier(s2.mode === "libre" && Math.abs(s2.cap - 120) < 2, "🧭 → libre : le cap de l'appareil n'agit plus", s2);
      const etiq = await page.evaluate(function () {
        return { texte: document.querySelector('#kta-vue3d [data-v3d="suivre"]').textContent,
          libre: window.I18n.t("vue3d.etatLibre"), suivi: window.I18n.t("vue3d.etatSuivi") };
      });
      verifier(etiq.texte.indexOf(etiq.libre) >= 0 && etiq.texte.indexOf(etiq.suivi) < 0,
        "le bouton de mode dit « Libre » en mode libre", etiq);
      await page.locator('#kta-vue3d [data-v3d="suivre"]').click();
      await page.waitForTimeout(800);
      const s3 = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { mode: e.mode, cap: e.cap }; });
      verifier(s3.mode === "suivi" && Math.abs(s3.cap - 200) < 2, "🧭 → suivi : la vue tourne avec l'appareil (200°)", s3);
      verifier(await page.evaluate(function () {
        return document.querySelector('#kta-vue3d [data-v3d="suivre"]').textContent.indexOf(window.I18n.t("vue3d.etatSuivi")) >= 0;
      }), "le bouton de mode dit « Suivi » en suivi");
      // Toucher et glisser l'écran en suivi : le suivi reste (le cap est celui de l'appareil).
      const cv = await page.locator("#kta-vue3d canvas").boundingBox();
      await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
      await page.mouse.down();
      await page.mouse.move(cv.x + cv.width / 2 + 40, cv.y + cv.height / 2 + 10, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const sTouche = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { mode: e.mode, cap: e.cap }; });
      verifier(sTouche.mode === "suivi" && Math.abs(sTouche.cap - 200) < 2, "suivi : toucher et glisser l'écran ne quitte pas le suivi", sTouche);
      await page.evaluate(function () { window.stopTracking(); });
      await page.waitForTimeout(300);
      await page.locator('#kta-vue3d [data-v3d="suivre"]').click();
      await page.waitForTimeout(200);
      const s4 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat(), b = document.querySelector('#kta-vue3d [data-v3d="suivre"]');
        const pile = document.getElementById("kta-toasts");
        return { mode: e.mode, dispo: e.suiviDispo, grise: b.classList.contains("kta-v3d-inactif"), titre: b.title,
          toast: pile ? pile.textContent : "", attendu: window.I18n.t("vue3d.suiviIndispo") };
      });
      verifier(s4.mode === "libre" && !s4.dispo && s4.grise && s4.titre === s4.attendu && s4.toast.indexOf(s4.attendu) >= 0,
        "tracker arrêté : retour en libre, 🧭 grisé, son toucher explique", s4);
      await page.evaluate(function () {
        window.getPlanRelHeading = window.__v3dCapVrai;
        window.startTracking();
      });
      await page.waitForTimeout(200);
      verifier(await page.evaluate(function () { return window.KtaVue3D.etat().suiviDispo; }) === true,
        "tracker relancé : 🧭 de nouveau disponible");

      await page.evaluate(function (p) { window.KtaVue3D.placer(p.x, p.y, 0); }, prep);
      await page.waitForTimeout(600);
      const e0 = await page.evaluate(function () {
        const m = window.KtaVue3D.mesurer({ images: 4 });
        return { etat: window.KtaVue3D.etat(), tri: m.trianglesMax, canvas: !!document.querySelector("#kta-vue3d canvas"),
          css: !!document.getElementById("kta-vue3d-css"),
          titres: Array.prototype.map.call(document.querySelectorAll("#kta-vue3d [data-v3d]"), function (b) { return b.title; }),
          attendus: ["vue3d.fermer", window.FilterPanel.nbActifs() > 0 ? "filter.badge.actifs" : "filter.badge.aucun",
            "ui.refonte.counter_sortie_title", "vue3d.plongee",
            "vue3d.hauteur", "vue3d.passerStructures", "vue3d.suivre", "vue3d.hauteurMoins", "vue3d.hauteurPlus",

            "vue3d.tournerGauche", "vue3d.avancer", "vue3d.tournerDroite", "vue3d.pasGauche", "vue3d.reculer",
            "vue3d.pasDroite", "vue3d.inclinaisonPlus", "vue3d.inclinaisonMoins"].map(function (k) {
            return window.I18n.t(k, { n: window.FilterPanel.nbActifs() });
          }) };
      });
      verifier(e0.canvas && e0.css, "fenêtre, scène et feuille montées");
      verifier(JSON.stringify(e0.titres) === JSON.stringify(e0.attendus), "boutons titrés par le dictionnaire", e0.titres);
      verifier(e0.etat.compte.structures >= 2 && e0.tri > 100, "scène non vide (" + e0.etat.compte.structures +
        " structure(s), " + e0.tri + " triangles, hauteur " + e0.etat.hauteur + " m)", e0.etat);
      verifier(e0.etat.yMax.murs > 0 && e0.etat.yMax.murs < e0.etat.yMax.opaque && e0.etat.murDecale,
        "mur qui traverse le pilier : plus bas (" + e0.etat.yMax.murs.toFixed(2) + " m < " +
        e0.etat.yMax.opaque.toFixed(2) + " m) et reculé en profondeur", e0.etat.yMax);
      const pan = e0.etat.panneaux.filter(function (q) { return q.dansVolume; });
      const zFace = prep.y / prep.sc - 3;
      verifier(pan.length === 1 && pan[0].visible && pan[0].depthTest === false && pan[0].ordre >= 10 &&
        pan[0].z > zFace && pan[0].z < zFace + 0.2 && Math.abs(pan[0].x - prep.x / prep.sc) < 0.05,
        "POI au centre du pilier : panneau visible, sans test de profondeur, collé à la face vue de la galerie", pan);
      await capture(page, "fictif-yeux");

      // ── Intégration : 🚨, toasts, ❓, ✕ au téléphone, Échap, panneau de POI sombre et borné, rendu en pause ──────
      const urg = await page.evaluate(function () {
        const S = window.SortieUrgence, d = S.declencher, c = S.demandeLaCarte;
        window.__v3dSortie = 0;
        S.declencher = function () { window.__v3dSortie++; };
        S.demandeLaCarte = function () { return false; };
        document.querySelector('#kta-vue3d [data-v3d="urgence"]').click();
        const r = { appels: window.__v3dSortie, ouvert: window.KtaVue3D.etat().ouvert };
        S.declencher = d; S.demandeLaCarte = c;
        return r;
      });
      verifier(urg.appels === 1 && urg.ouvert, "🚨 de la vue : Sortie d'urgence déclenchée (même action que l'en-tête)", urg);
      const toast = await page.evaluate(function () {
        window.OOMGuard.showToast("Toast de test (vue 3D)", "warn");
        const t = Array.prototype.slice.call(document.querySelectorAll(".kta-toast")).pop();
        const bas = Math.max.apply(null, Array.prototype.map.call(
          document.querySelectorAll("#kta-vue3d .kta-v3d-haut > button"), function (b) { return b.getBoundingClientRect().bottom; }));
        return { haut: t ? t.getBoundingClientRect().top : -1, rangee: bas };
      });
      verifier(toast.haut >= toast.rangee, "toast sous la rangée du haut (" + Math.round(toast.haut) + " px ≥ " +
        Math.round(toast.rangee) + " px)", toast);
      await capture(page, "integration-toast");
      await page.evaluate(function () {
        document.querySelectorAll(".kta-toast").forEach(function (t) { t.remove(); });
      });
      // ❓ : l'aide de la vue 3D, par-dessus ; Échap ferme l'aide, la vue reste.
      await page.locator("#kta-vue3d .kta-v3d-haut .kta-aide-ctx-btn").click();
      await page.waitForTimeout(300);
      const aide = await page.evaluate(function () {
        const sm = document.getElementById("kta-aide-submodal");
        return { ouverte: !!sm, texte: sm ? sm.textContent.slice(0, 300) : "", recouverte: window.KtaVue3D.etat().recouverte,
          attendu: window.I18n.t("aide.sec.vue-3d.titre") };
      });
      verifier(aide.ouverte && aide.recouverte && aide.texte.indexOf(aide.attendu) >= 0,
        "❓ ouvre l'aide « Vue 3D » au-dessus de la vue", aide);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const aideFermee = await page.evaluate(function () {
        return { aide: !!document.getElementById("kta-aide-submodal"), vue: window.KtaVue3D.etat().ouvert };
      });
      verifier(!aideFermee.aide && aideFermee.vue, "Échap avec l'aide ouverte : l'aide se ferme, la vue reste", aideFermee);
      // Échap : d'abord le réglage de hauteur ouvert, puis (plus loin, § 4) la vue.
      await page.locator('#kta-vue3d [data-v3d="hauteur"]').click();
      await page.keyboard.press("Escape");
      const echap = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        return { ouvert: e.ouvert, reglage: e.reglageHauteur.visible };
      });
      verifier(echap.ouvert && !echap.reglage, "Échap ferme d'abord le réglage ouvert, la vue reste", echap);
      // ≡ juste à gauche de ✕, côte à côte en haut à droite (rangée en row-reverse, `order`), au PC puis au téléphone.
      const filtresAColle = function () {
        const x = document.querySelector('#kta-vue3d [data-v3d="fermer"]').getBoundingClientRect();
        const f = document.querySelector('#kta-vue3d [data-v3d="filtres"]').getBoundingClientRect();
        const autres = Array.prototype.slice.call(document.querySelectorAll("#kta-vue3d .kta-v3d-haut > *"))
          .filter(function (b) { return b.offsetParent !== null && !b.hidden && b.getAttribute("data-v3d") !== "fermer" &&
            b.getAttribute("data-v3d") !== "filtres"; })
          .map(function (b) { return b.getBoundingClientRect(); });
        // Rien entre ≡ et ✕ sur la même ligne.
        const entre = autres.filter(function (r) {
          return Math.abs(r.top - x.top) < 2 && r.left >= f.right - 1 && r.right <= x.left + 1;
        }).length;
        return { memeLigne: Math.abs(f.top - x.top) < 1, ecart: Math.round(x.left - f.right), entre: entre,
          largeur: window.innerWidth };
      };
      const filtresPc = await page.evaluate(filtresAColle);
      verifier(filtresPc.memeLigne && filtresPc.ecart >= 0 && filtresPc.ecart <= 12 && filtresPc.entre === 0,
        "PC : ≡ immédiatement à gauche de ✕", filtresPc);
      // Téléphone : ✕ au coin haut droit, sur la première ligne de boutons.
      await page.setViewportSize({ width: 393, height: 852 });
      await page.waitForTimeout(400);
      const filtresTel = await page.evaluate(filtresAColle);
      verifier(filtresTel.memeLigne && filtresTel.ecart >= 0 && filtresTel.ecart <= 12 && filtresTel.entre === 0 &&
        filtresTel.largeur === 393, "téléphone (393 px) : ≡ immédiatement à gauche de ✕", filtresTel);
      const tel = await page.evaluate(function () {
        const bs = Array.prototype.slice.call(document.querySelectorAll("#kta-vue3d .kta-v3d-haut > button"));
        const rs = bs.map(function (b) { return b.getBoundingClientRect(); });
        const x = document.querySelector('#kta-vue3d [data-v3d="fermer"]').getBoundingClientRect();
        const lignes = {};
        rs.forEach(function (r) { lignes[Math.round(r.top)] = true; });
        return { xTop: x.top, xRight: x.right, top: Math.min.apply(null, rs.map(function (r) { return r.top; })),
          right: Math.max.apply(null, rs.map(function (r) { return r.right; })), lignes: Object.keys(lignes).length,
          largeur: window.innerWidth };
      });
      verifier(Math.abs(tel.xTop - tel.top) < 1 && Math.abs(tel.xRight - tel.right) < 1 && tel.largeur === 393,
        "téléphone (393 px) : ✕ en haut à droite, première ligne (" + tel.lignes + " ligne(s) de boutons)", tel);
      await capture(page, "integration-telephone");
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(300);
      // Rendu en pause : immobile en libre, aucune image ; en suivi, le bruit de la boussole (± 0,9°) non plus.
      const pause = await page.evaluate(function () {
        return new Promise(function (r) {
          setTimeout(function () {
            const i0 = window.KtaVue3D.etat().images;
            setTimeout(function () { r({ libre: window.KtaVue3D.etat().images - i0 }); }, 1000);
          }, 300);
        });
      });
      const pauseSuivi = await page.evaluate(function (p) {
        window.__v3dCap = window.getPlanRelHeading;
        let k = 0;
        window.getPlanRelHeading = function () { k++; return 90 + (k % 2 ? 0.9 : -0.9); };
        window.recalerTrackerSurPoint(p.x, p.y, 0);
        if (!window.getTrackingActif()) window.startTracking();
        window.KtaVue3D.suivre();
        return new Promise(function (r) {
          setTimeout(function () {
            const i0 = window.KtaVue3D.etat().images;
            setTimeout(function () {
              const e = window.KtaVue3D.etat();
              window.getPlanRelHeading = window.__v3dCap;
              window.KtaVue3D.placer(p.x, p.y, 0);
              r({ suivi: e.images - i0, mode: e.mode, cap: e.cap });
            }, 1000);
          }, 1500);
        });
      }, prep);
      verifier(pause.libre <= 1 && pauseSuivi.mode === "suivi" && pauseSuivi.suivi <= 2,
        "rendu en pause : " + pause.libre + " image(s) en 1 s immobile, " + pauseSuivi.suivi +
        " en suivi avec une boussole qui tremble de ± 0,9°", { pause: pause, suivi: pauseSuivi });
      // Panneau de POI : couleurs du thème sombre en thème clair ; de près, borné à l'écran, fondu puis masqué.
      const prox = await page.evaluate(function (p) {
        const K = window.KtaVue3D, clair = window.ThemeManager.isLight(), r = {};
        // Tracker arrêté le temps de ces réouvertures (pas de « Je suis ici ? »), relancé au départ ensuite.
        window.stopTracking();
        return K.fermer().then(function () {
          if (clair) window.ThemeManager.setTheme("dark");
          r.surfaceSombre = getComputedStyle(document.body).getPropertyValue("--kta-surface").trim();
          window.ThemeManager.setTheme("light");
          r.surfaceClaire = getComputedStyle(document.body).getPropertyValue("--kta-surface").trim();
          return K.ouvrir({ depart: { x: p.x, y: p.y - 1.4 * p.sc, cap: 0 } });
        }).then(function () {
          return new Promise(function (res) { setTimeout(res, 300); });
        }).then(function () {
          const pan = K.etat().panneaux.filter(function (q) { return q.dansVolume; })[0];
          r.fond = pan.fond; r.loin = pan;
          K.placer(p.x, p.y - 2.4 * p.sc, 0);
          return new Promise(function (res) { setTimeout(res, 300); });
        }).then(function () {
          r.pres = K.etat().panneaux.filter(function (q) { return q.dansVolume; })[0];
          return K.fermer();
        }).then(function () {
          window.ThemeManager.setTheme(clair ? "light" : "dark");
          window.recalerTrackerSurPoint(p.x, p.y, 0);
          window.startTracking();
          return K.ouvrir({ depart: { x: p.x, y: p.y, cap: 0 } });
        }).then(function () { return r; });
      }, prep);
      verifier(prox.fond === prox.surfaceSombre && prox.surfaceClaire !== prox.surfaceSombre,
        "thème clair : panneau de POI aux couleurs du thème sombre (" + prox.fond + ")", prox);
      verifier(prox.loin.visible && prox.loin.largeurEcran <= 0.46 && prox.loin.opacite < 1 && !prox.pres.visible,
        "de près : panneau à " + Math.round(prox.loin.largeurEcran * 100) + " % de l'écran au plus, fondu (" +
        prox.loin.opacite + "), masqué sous 1 m", { loin: prox.loin, pres: prox.pres });
      await page.waitForTimeout(300);

      // Avancer vers le sud (dégagé), puis buter contre le pilier au nord.
      const sud = await page.evaluate(function (p) {
        window.KtaVue3D.tourner(180);
        const r = window.KtaVue3D.avancer(1);
        const e = window.KtaVue3D.etat();
        return { ok: r, dy: (e.pos.y - p.y) / p.sc };
      }, prep);
      verifier(sud.ok && Math.abs(sud.dy - 1) < 0.01, "avancer d'un mètre (vers le sud)", sud);
      const butee = await page.evaluate(function (p) {
        window.KtaVue3D.tourner(180);
        let pas = 0;
        for (let i = 0; i < 100; i++) { if (window.KtaVue3D.avancer(0.1)) pas++; }
        const e = window.KtaVue3D.etat();
        return { pas: pas, butees: e.butees, distM: (e.pos.y - (p.y - 3 * p.sc)) / p.sc };
      }, prep);
      verifier(butee.butees > 0 && butee.distM > 0.05 && butee.distM < 0.6,
        "bute contre le pilier : arrêt à " + butee.distM.toFixed(2) + " m de sa face", butee);
      await capture(page, "fictif-butee");

      // Clavier : flèche bas maintenue → recule.
      const yAvant = await page.evaluate(function () { return window.KtaVue3D.etat().pos.y; });
      await page.keyboard.down("ArrowDown");
      await page.waitForTimeout(600);
      await page.keyboard.up("ArrowDown");
      const yApres = await page.evaluate(function () { return window.KtaVue3D.etat().pos.y; });
      verifier(yApres > yAvant, "clavier : flèche bas maintenue recule", { yAvant: yAvant, yApres: yApres });

      // Bouton à l'écran : ▲ maintenu → avance.
      const boite = await page.locator('#kta-vue3d [data-v3d="av"]').boundingBox();
      await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
      const y1 = await page.evaluate(function () { return window.KtaVue3D.etat().pos.y; });
      await page.mouse.down();
      await page.waitForTimeout(300);
      await page.mouse.up();
      const y2 = await page.evaluate(function () { return window.KtaVue3D.etat().pos.y; });
      verifier(y2 < y1, "bouton ▲ maintenu : avance", { y1: y1, y2: y2 });
      verifier(await page.evaluate(function () { return window.KtaVue3D.etat().rapide; }) === false,
        "appui court sur ▲ : pas normal");
      // Appui long sur ▲ (vers le sud, dégagé) : pas rapide ; relâché : retour au pas normal.
      await page.evaluate(function () { window.KtaVue3D.tourner(180); });
      await page.mouse.down();
      await page.waitForTimeout(900);
      const long = await page.evaluate(function () { return window.KtaVue3D.etat().rapide; });
      await page.mouse.up();
      await page.waitForTimeout(100);
      const relache = await page.evaluate(function () { return window.KtaVue3D.etat().rapide; });
      verifier(long === true && relache === false, "appui long sur ▲ : pas rapide, puis normal au relâché",
        { long: long, relache: relache });
      await page.keyboard.down("Shift");
      await page.keyboard.down("ArrowDown");
      await page.waitForTimeout(150);
      const maj = await page.evaluate(function () { return window.KtaVue3D.etat().rapide; });
      await page.keyboard.up("ArrowDown");
      await page.keyboard.up("Shift");
      verifier(maj === true, "Maj maintenue au clavier : pas rapide");
      await page.evaluate(function () { window.KtaVue3D.tourner(180); });

      await page.locator('#kta-vue3d [data-v3d="vue"]').click();
      await page.waitForTimeout(300);
      const vue = await page.evaluate(function () { return window.KtaVue3D.etat().vue; });
      verifier(vue === "plongee", "bascule en vue plongeante", vue);
      await capture(page, "fictif-plongee");
      await page.keyboard.press("KeyV");
      verifier(await page.evaluate(function () { return window.KtaVue3D.etat().vue; }) === "yeux", "touche V : retour à hauteur d'yeux");

      // ── Inclinaison de la vue plongeante : PageUp/PageDown, molette, boutons, deux doigts ; bornée et retenue ──
      const i0 = await page.evaluate(function () {
        window.KtaVue3D.basculerVue();
        return window.KtaVue3D.etat();
      });
      verifier(i0.vue === "plongee" && i0.inclinaison === 60 && i0.boussole.inclinaisonVisible,
        "vue plongeante : inclinaison 60°, boutons d'inclinaison montrés", { incl: i0.inclinaison });
      await page.keyboard.press("PageUp");
      const iUp = await page.evaluate(function () { return window.KtaVue3D.etat().inclinaison; });
      await page.keyboard.press("PageDown");
      await page.keyboard.press("PageDown");
      const iDown = await page.evaluate(function () { return window.KtaVue3D.etat().inclinaison; });
      const cvBoite = await page.locator("#kta-vue3d canvas").boundingBox();
      await page.mouse.move(cvBoite.x + cvBoite.width / 2, cvBoite.y + cvBoite.height / 3);
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(100);
      const iMolette = await page.evaluate(function () { return window.KtaVue3D.etat().inclinaison; });
      await page.locator('#kta-vue3d [data-v3d="inclMoins"]').click();
      const iBouton = await page.evaluate(function () { return window.KtaVue3D.etat().inclinaison; });
      verifier(iUp === 65 && iDown === 55 && iMolette === 60 && iBouton === 50,
        "PageUp / PageDown, molette et bouton ▼ changent l'inclinaison",
        { pageUp: iUp, pageDown: iDown, molette: iMolette, bouton: iBouton });
      // Deux doigts glissés vers le bas (pointeurs tactiles synthétiques) : plus verticale.
      const iDoigts = await page.evaluate(function () {
        const cv = document.querySelector("#kta-vue3d canvas"), r = cv.getBoundingClientRect();
        const ev = function (type, id, y) {
          cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 11,
            clientX: r.left + r.width / 2 + (id === 11 ? -40 : 40), clientY: y, bubbles: true }));
        };
        const y0 = r.top + r.height / 3;
        ev("pointerdown", 11, y0); ev("pointerdown", 12, y0);
        for (let k = 1; k <= 10; k++) { ev("pointermove", 11, y0 + k * 8); ev("pointermove", 12, y0 + k * 8); }
        ev("pointerup", 11, y0 + 80); ev("pointerup", 12, y0 + 80);
        return window.KtaVue3D.etat();
      });
      verifier(iDoigts.inclinaison > iBouton && iDoigts.mode === "libre" && Math.abs(iDoigts.cap - i0.cap) < 0.01,
        "deux doigts glissés à la verticale : inclinaison changée, cap inchangé",
        { avant: iBouton, apres: iDoigts.inclinaison, cap: iDoigts.cap });
      const bornes = await page.evaluate(function () {
        window.KtaVue3D.incliner(500);
        const haut = window.KtaVue3D.etat().inclinaison;
        window.KtaVue3D.incliner(-500);
        const bas = window.KtaVue3D.etat().inclinaison;
        window.KtaVue3D.incliner(40);
        window.KtaVue3D.basculerVue();
        const yeux = window.KtaVue3D.etat();
        window.KtaVue3D.basculerVue();
        const retour = window.KtaVue3D.etat().inclinaison;
        window.KtaVue3D.basculerVue();
        return { haut: haut, bas: bas, cachesEnYeux: !yeux.boussole.inclinaisonVisible, retour: retour };
      });
      verifier(bornes.haut === 85 && bornes.bas === 15 && bornes.cachesEnYeux && bornes.retour === 55,
        "inclinaison bornée (15° à 85°), retenue d'une vue à l'autre, boutons cachés à hauteur d'yeux", bornes);
      await capture(page, "fictif-yeux-boussole");

      // ── Boussole : N vers le nord réel (cap plan − calibration Nord du plan), sinon haut du plan + mention ──
      const bous = await page.evaluate(function () {
        window.resetPlanNorthOffset();
        const brut = window.PLAN_CONFIG.plan.northOffsetDeg;
        window.KtaVue3D.placer(window.KtaVue3D.etat().pos.x, window.KtaVue3D.etat().pos.y, 90);
        return new Promise(function (r) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              const a = window.KtaVue3D.etat().boussole;
              const rose = document.querySelector("#kta-vue3d .kta-v3d-rose");
              a.transform = rose.style.transform;
              a.planConfig = brut;
              a.texte = document.querySelector("#kta-vue3d .kta-v3d-rose-mention") ? "visible" : "";
              a.attendu = window.I18n.t("vue3d.nordNonCalibre");
              window.setPlanNorthOffset(null, 30);
              requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                  const b = window.KtaVue3D.etat().boussole;
                  b.transform = rose.style.transform;
                  window.KtaVue3D.tourner(45);
                  requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                      const c = window.KtaVue3D.etat().boussole;
                      c.transform = rose.style.transform;
                      window.resetPlanNorthOffset();
                      r({ sans: a, avec: b, tourne: c });
                    });
                  });
                });
              });
            });
          });
        });
      });
      const deg = function (t) { const m = /rotate\((-?[\d.]+)deg\)/.exec(t || ""); return m ? Number(m[1]) : NaN; };
      const sansCalib = bous.sans.planConfig === undefined || bous.sans.planConfig === null;
      verifier(!sansCalib || (bous.sans.calibre === false && bous.sans.texte === "" &&
        bous.sans.libelle.indexOf(bous.sans.attendu) >= 0 && deg(bous.sans.transform) === -90),
        "boussole sans nord calibré : haut du plan, aucun texte à l'écran, dit au libellé accessible", bous.sans);
      verifier(bous.avec.calibre === true && bous.avec.libelle.indexOf(bous.sans.attendu) < 0 && deg(bous.avec.transform) === -60 &&
        deg(bous.tourne.transform) === -105, "boussole calibrée (30°) : N au nord réel, tourne avec la vue",
        { avec: bous.avec, tourne: bous.tourne });

      if (prep.multi) {
        const niv = await page.evaluate(function () {
          const avant = window.KtaVue3D.etat().niveau;
          window.APP_CONFIG.activeLevel = avant === 0 ? 1 : 0;
          return new Promise(function (r) {
            setTimeout(function () {
              const e = window.KtaVue3D.etat();
              window.APP_CONFIG.activeLevel = 0;
              r({ avant: avant, apres: e.niveau, structures: e.compte.structures });
            }, 300);
          });
        });
        verifier(niv.apres !== niv.avant && niv.structures === 0,
          "changement de niveau : scène refaite (le pilier du niveau 0 n'y est plus)", niv);
        await page.waitForTimeout(300);
      } else {
        console.log("  ℹ️ plan à un niveau : changement de niveau non joué");
      }

      // ── Collisions : jamais à travers un pilier, un mur, un mur en ligne, un front ou un pilier perso ──────
      // Obstacles fictifs posés loin du départ (image de collision du plan mise de côté le temps du test : seule
      // la règle des structures est jugée). Chaque pas est vérifié par une géométrie propre au checkup (pas celle
      // de l'app) : le segment parcouru ne coupe aucune arête, l'arrivée n'est dans aucun polygone, et le corps
      // garde au moins 0,2 m du bord.
      const coll = await page.evaluate(function (p) {
        const sc = p.sc, ox = p.x, oy = p.y + 30 * sc;
        const carre = function (cx, cy, dx, dy) {
          return [{ x: cx - dx, y: cy - dy }, { x: cx + dx, y: cy - dy }, { x: cx + dx, y: cy + dy }, { x: cx - dx, y: cy + dy }];
        };
        const obstacles = [
          { nom: "pilier", s: { uid: "st_v3d_c1", type: "pilier-1", level: 0, points: carre(ox, oy, 1.5 * sc, 1.5 * sc) } },
          { nom: "pilier fin (0,4 m)", s: { uid: "st_v3d_c2", type: "pilier-2", level: 0, points: carre(ox + 20 * sc, oy, 0.2 * sc, 1.5 * sc) } },
          { nom: "mur", s: { uid: "st_v3d_c3", type: "mur", level: 0, points: carre(ox + 40 * sc, oy, 2 * sc, 0.3 * sc) } },
          { nom: "mur en ligne", s: { uid: "st_v3d_c4", type: "mur-ligne", level: 0,
            points: [{ x: ox + 60 * sc, y: oy - 2 * sc }, { x: ox + 60 * sc, y: oy + 2 * sc }] } },
          { nom: "front", s: { uid: "st_v3d_c5", type: "front-1", level: 0,
            points: [{ x: ox + 80 * sc - 2 * sc, y: oy }, { x: ox + 80 * sc, y: oy + 0.5 * sc }, { x: ox + 80 * sc + 2 * sc, y: oy }] } },
          { nom: "pilier perso", s: { uid: "st_v3d_c6", type: "cust-v3d-test", level: 0, points: carre(ox + 100 * sc, oy, 1 * sc, 1 * sc) } }
        ];
        const avant = window.getStructures().slice();
        window.setStructures(avant.concat(obstacles.map(function (o) { return o.s; })));
        const accVrai = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        const coupe = function (ax, ay, bx, by, cx, cy, dx, dy) {
          const o = function (px, py, qx, qy, rx, ry) { return (qx - px) * (ry - py) - (qy - py) * (rx - px); };
          const d1 = o(cx, cy, dx, dy, ax, ay), d2 = o(cx, cy, dx, dy, bx, by);
          const d3 = o(ax, ay, bx, by, cx, cy), d4 = o(ax, ay, bx, by, dx, dy);
          return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
        };
        const dedans = function (pts, x, y) {
          let r = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const a = pts[i], b = pts[j];
            if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) r = !r;
          }
          return r;
        };
        const distBord = function (pts, ferme, x, y) {
          let d = Infinity;
          const n = ferme ? pts.length : pts.length - 1;
          for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
            const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2)) : 0;
            d = Math.min(d, Math.hypot(x - a.x - t * vx, y - a.y - t * vy));
          }
          return d / sc;
        };
        const echecs = [];
        let pas = 0, butees = 0, distMin = Infinity;
        const juger = function (o, a, b, cas) {
          const pts = o.s.points, ferme = o.s.type !== "mur-ligne" && o.s.type !== "front-1";
          const n = ferme ? pts.length : pts.length - 1;
          for (let i = 0; i < n; i++) {
            const q = pts[i], r = pts[(i + 1) % pts.length];
            if (coupe(a.x, a.y, b.x, b.y, q.x, q.y, r.x, r.y)) { echecs.push(o.nom + " traversé (" + cas + ")"); return false; }
          }
          if (ferme && dedans(pts, b.x, b.y)) { echecs.push(o.nom + " : arrivée dedans (" + cas + ")"); return false; }
          const d = distBord(pts, ferme, b.x, b.y);
          distMin = Math.min(distMin, d);
          if (d < 0.2) echecs.push(o.nom + " : corps à " + d.toFixed(2) + " m du bord (" + cas + ")");
          return true;
        };
        const centre = function (o) {
          let x = 0, y = 0;
          o.s.points.forEach(function (q) { x += q.x; y += q.y; });
          return { x: x / o.s.points.length, y: y / o.s.points.length };
        };
        obstacles.forEach(function (o) {
          const c = centre(o);
          // Droit dessus sous 12 angles, pas « rapide » (0,7 m = 7 m/s sur une image de 0,1 s), puis un grand pas.
          for (let k = 0; k < 12; k++) {
            const cap = k * 30, a = cap * Math.PI / 180;
            const fx = Math.sin(a), fy = -Math.cos(a);
            window.KtaVue3D.placer(c.x - fx * 4 * sc, c.y - fy * 4 * sc, cap);
            let ok = true;
            for (let i = 0; i < 16 && ok; i++) {
              const p0 = window.KtaVue3D.etat().pos;
              const r = window.KtaVue3D.avancer(i === 15 ? 6 : 0.7);
              pas++; if (!r) butees++;
              ok = juger(o, p0, window.KtaVue3D.etat().pos, "cap " + cap + "°, pas " + i);
            }
          }
        });
        // Départ à 0,1 m d'une face, face à elle : aucun pas ne passe.
        const P = obstacles[0], cP = centre(P);
        window.KtaVue3D.placer(cP.x, cP.y + 1.6 * sc, 0);
        const p0 = window.KtaVue3D.etat().pos;
        const presFace = window.KtaVue3D.avancer(0.05) === false && window.KtaVue3D.avancer(1) === false;
        const p1 = window.KtaVue3D.etat().pos;
        if (!presFace || p1.y !== p0.y) echecs.push("départ à 0,1 m de la face : un pas est passé");
        // … mais on n'y reste pas collé : reculer et longer la face passent.
        window.KtaVue3D.tourner(90);
        const longe = window.KtaVue3D.avancer(0.05);
        window.KtaVue3D.tourner(90);
        const recule = window.KtaVue3D.avancer(0.05);
        if (!longe || !recule) echecs.push("départ à 0,1 m de la face : figé (longer " + longe + ", reculer " + recule + ")");
        // Pas plus long que l'épaisseur du pilier fin, depuis 0,5 m.
        const T = obstacles[1], cT = centre(T);
        window.KtaVue3D.placer(cT.x - 0.7 * sc, cT.y, 90);
        const t0 = window.KtaVue3D.etat().pos;
        window.KtaVue3D.avancer(3);
        juger(T, t0, window.KtaVue3D.etat().pos, "pas de 3 m sur un pilier de 0,4 m");
        window.ktaEstAccessible = accVrai;
        window.setStructures(avant);
        window.KtaVue3D.placer(p.x, p.y - 1 * sc, 0);   // à 2 m du pilier du départ, écarté du tracker
        return { echecs: echecs.slice(0, 6), nEchecs: echecs.length, pas: pas, butees: butees,
          distMin: +distMin.toFixed(2) };
      }, prep);
      verifier(coll.nEchecs === 0 && coll.butees > 0, "collisions : " + coll.pas + " pas sur 6 obstacles (12 angles, " +
        "pas rapide et grand pas), aucun traversé, corps à " + coll.distMin + " m du bord au plus près", coll);

      // ── 3. Perte du contexte WebGL simulée, puis reprise ───────────────────────────────────────────
      perteSimulee = true;
      const perte = await page.evaluate(function () {
        const gl = document.querySelector("#kta-vue3d canvas").getContext("webgl2");
        window.__v3dPerte = gl.getExtension("WEBGL_lose_context");
        window.__v3dPerte.loseContext();
        return new Promise(function (r) { setTimeout(function () { r(window.KtaVue3D.etat()); }, 400); });
      });
      verifier(perte.ouvert && perte.perdu && !perte.contexteVivant, "contexte perdu : la vue reste ouverte et attend",
        { ouvert: perte.ouvert, perdu: perte.perdu, vivant: perte.contexteVivant });
      const reprise = await page.evaluate(function () {
        const i0 = window.KtaVue3D.etat().images;
        window.__v3dPerte.restoreContext();
        return new Promise(function (r) {
          setTimeout(function () {
            window.KtaVue3D.tourner(5);
            setTimeout(function () {
              const e = window.KtaVue3D.etat(), m = window.KtaVue3D.mesurer({ images: 4 });
              window.KtaVue3D.tourner(-5);
              r({ ouvert: e.ouvert, perdu: e.perdu, vivant: e.contexteVivant, reprises: e.reprises,
                images: e.images - i0, tri: m.trianglesMax });
            }, 400);
          }, 400);
        });
      });
      verifier(reprise.ouvert && !reprise.perdu && reprise.vivant && reprise.reprises === 1 && reprise.images > 0 &&
        reprise.tri > 100, "contexte repris : la scène se redessine (" + reprise.tri + " triangles)", reprise);
      await page.waitForTimeout(300);
      perteSimulee = false;

      // ── 4. Échap après un déplacement, suivi actif : « Je suis ici ? » → Non ne change rien ─────────
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const question = await page.evaluate(function () {
        const ok = document.getElementById("kta-confirm-oui");
        return { dom: !!document.getElementById("kta-vue3d"), etat: window.KtaVue3D.etat(),
          oui: ok ? ok.textContent : null, attendu: window.I18n.t("vue3d.jeSuisIci.oui") };
      });
      verifier(!question.dom && question.etat.contexteLibere === true && question.etat.fermeture === "utilisateur",
        "Échap ferme et libère le contexte WebGL", question.etat);
      verifier(question.oui === question.attendu, "fermeture après un déplacement : « Je suis ici ? » posée", question);
      await page.locator("#kta-confirm-non").click();
      await page.waitForTimeout(200);
      const apresNon = await page.evaluate(function () { return window.getTrackingPosition(); });
      verifier(apresNon.x === prep.x && apresNon.y === prep.y, "« Non » : le tracker n'a pas bougé", apresNon);

      // ── 5. Rouvrir par le bouton cube, 1 m au sud, ✕ → « Oui » recale le tracker là ─────────────────
      await page.locator(".kta-vue3d-ctrl a").click();
      await attendre(page, function () { return window.KtaVue3D.etat().ouvert === true; }, 10000);
      const cible = await page.evaluate(function () {
        window.KtaVue3D.placer(window.getTrackingPosition().x, window.getTrackingPosition().y, 180);
        window.KtaVue3D.avancer(1);
        return window.KtaVue3D.etat().pos;
      });
      // ✕ : rien au simple appui (pointerdown) ; le clic ferme, et rien ne part vers ce qui est dessous.
      const appui = await page.evaluate(function () {
        const x = document.querySelector('#kta-vue3d [data-v3d="fermer"]');
        x.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
        return window.KtaVue3D.etat().ouvert;
      });
      verifier(appui === true, "✕ : le simple appui ne ferme pas (seul le clic ferme)");
      await page.evaluate(function () {
        window.__v3dSortie = 0;
        const S = window.SortieUrgence;
        if (S) { window.__v3dDecl = S.declencher; S.declencher = function () { window.__v3dSortie++; }; }
      });
      await page.locator('#kta-vue3d [data-v3d="fermer"]').click();
      await page.waitForTimeout(200);
      const sortie = await page.evaluate(function () {
        if (window.__v3dDecl) window.SortieUrgence.declencher = window.__v3dDecl;
        return window.__v3dSortie;
      });
      verifier(sortie === 0, "✕ : la Sortie d'urgence n'est pas déclenchée", sortie);
      const q2 = await page.evaluate(function () { return !!document.getElementById("kta-confirm-oui"); });
      verifier(q2, "✕ après un déplacement : « Je suis ici ? » posée");
      await page.locator("#kta-confirm-oui").click();
      await page.waitForTimeout(300);
      const apresOui = await page.evaluate(function () { return window.getTrackingPosition(); });
      verifier(Math.abs(apresOui.x - cible.x) < 0.01 && Math.abs(apresOui.y - cible.y) < 0.01 &&
        Math.abs((apresOui.y - prep.y) / prep.sc - 1) < 0.01, "« Oui » : le tracker est recalé là où la vue s'est arrêtée",
        { apresOui: apresOui, cible: cible });
      await page.evaluate(function () { window.stopTracking(); });

      // ── 6. Perte sans reprise : la vue se ferme avec un message ─────────────────────────────────────
      perteSimulee = true;
      const echec = await page.evaluate(function (p) {
        return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 }, attenteReprise: 600 }).then(function () {
          const gl = document.querySelector("#kta-vue3d canvas").getContext("webgl2");
          gl.getExtension("WEBGL_lose_context").loseContext();
          return new Promise(function (r) {
            setTimeout(function () {
              const pile = document.getElementById("kta-toasts");
              r({ etat: window.KtaVue3D.etat(), dom: !!document.getElementById("kta-vue3d"),
                toast: pile ? pile.textContent : "", attendu: window.I18n.t("vue3d.contextePerdu") });
            }, 1800);
          });
        });
      }, prep);
      verifier(!echec.dom && echec.etat.ouvert === false && echec.etat.fermeture === "contexte" &&
        echec.toast.indexOf(echec.attendu) >= 0, "contexte non repris : vue fermée avec un message", echec);
      await page.waitForTimeout(300);
      perteSimulee = false;

      // ── 7. WebGL absent : refus avec un message ─────────────────────────────────────────────────────
      perteSimulee = true;
      const sansGl = await page.evaluate(function (p) {
        const proto = HTMLCanvasElement.prototype, orig = proto.getContext;
        proto.getContext = function (t, o) { return /webgl/i.test(String(t)) ? null : orig.call(this, t, o); };
        return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } }).then(function (ok) {
          proto.getContext = orig;
          const b = document.getElementById("kta-confirm-oui");
          const txt = b ? b.closest(".kta-readme-modal-boite").textContent : "";
          if (b) b.click();
          return { ok: ok, txt: txt, dom: !!document.getElementById("kta-vue3d"), attendu: window.I18n.t("vue3d.indisponible") };
        }, function (err) { proto.getContext = orig; return { erreur: String(err && err.message) }; });
      }, prep);
      verifier(sansGl.ok === false && !sansGl.dom && sansGl.txt.indexOf(sansGl.attendu) >= 0,
        "WebGL absent : ouverture refusée avec un message", sansGl);
      await page.waitForTimeout(300);
      perteSimulee = false;

      const cycles = await page.evaluate(function (p) {
        let chaine = Promise.resolve(), perdus = 0;
        for (let i = 0; i < 20; i++) {
          chaine = chaine.then(function () { return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } }); })
            .then(function () { window.KtaVue3D.fermer(); if (window.KtaVue3D.etat().contexteLibere) perdus++; });
        }
        return chaine.then(function () { return { perdus: perdus, restes: document.querySelectorAll("#kta-vue3d").length }; });
      }, prep);
      verifier(cycles.perdus === 20 && cycles.restes === 0, "20 ouvertures / fermetures : contexte libéré à chaque fois", cycles);
      const apres = await page.evaluate(function (p) {
        return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } }).then(function () {
          const e = window.KtaVue3D.etat();
          window.KtaVue3D.fermer();
          return e.contexteVivant;
        });
      }, prep);
      verifier(apres === true, "21e ouverture : la vue a un contexte vivant");

      // ── Hauteur ⛏️ (structures) : le chiffre de ⛏️ Volume exploité, scène refaite, relu à la réouverture ──
      await page.evaluate(function (p) {
        return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } });
      }, prep);
      const h0 = await page.evaluate(function () { return window.KtaVue3D.etat(); });
      await page.locator('#kta-vue3d [data-v3d="hauteur"]').click();
      await page.locator('#kta-vue3d [data-v3d="hauteurPlus"]').click();
      const h1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        return { hauteur: e.hauteur, pref: window.getPlanHauteurGalerie(), reglage: e.reglageHauteur,
          attendu: window.formatDistance(e.hauteur, 1) };
      });
      verifier(h0.hauteur === 2 && h1.hauteur === 2.1 && h1.pref === 2.1 && h1.reglage.visible &&
        h1.reglage.valeur === h1.attendu && h1.reglage.bouton === "⛏️ " + h1.attendu,
        "⛏️ puis + : 2 m → 2,1 m, écrit pour le plan, montré sur le bouton et dans le réglage", { h0: h0.hauteur, h1: h1 });
      await capture(page, "hauteur-reglage");
      const h3 = await page.evaluate(function () {
        const K = window.KtaVue3D, r = {};
        r.haut = K.reglerHauteur(10); r.bas = K.reglerHauteur(1);
        r.v = K.reglerHauteur(3);
        const e = K.etat();
        r.hauteur = e.hauteur; r.pref = window.getPlanHauteurGalerie(); r.yMax = e.yMax; r.oeil = e.oeil;
        r.pos = e.pos; r.cap = e.cap; r.rendu = e.rendu; r.construites = e.construites;
        r.plus = document.querySelector('#kta-vue3d [data-v3d="hauteurPlus"]').disabled;
        return r;
      });
      verifier(h3.haut === 4 && h3.bas === 1.5 && h3.v === 3 && h3.hauteur === 3 && h3.pref === 3 && !h3.plus,
        "réglage borné de 1,5 à 4 m ; à 3 m, getPlanHauteurGalerie() vaut 3", h3);
      verifier(Math.abs(h3.yMax.opaque - 3) < 1e-6 && Math.abs(h3.yMax.murs - 3 * 0.98) < 1e-6 && h3.oeil === 1.6 &&
        h3.construites > 0 && h3.rendu === "mixte" &&
        h3.pos.x === h0.pos.x && h3.pos.y === h0.pos.y && h3.cap === h0.cap,
        "mixte (défaut) : scène refaite à 3 m (piliers 3 m, murs 98 %), position et cap gardés", h3);
      const h4 = await page.evaluate(function (p) {
        const K = window.KtaVue3D, r = {};
        return K.fermer().then(function () {
          return K.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } });
        }).then(function () {
          r.rouvert = K.etat().hauteur; r.bouton = K.etat().reglageHauteur.bouton;
          return K.fermer();
        }).then(function () {
          // ⛏️ Volume exploité lit le même chiffre, et ce qu'il écrit, la vue le relit.
          const surf = window.getMeasurePointsSurface;
          window.getMeasurePointsSurface = function () {
            const d = 5 * p.sc;
            return [{ x: p.x - d, y: p.y - d }, { x: p.x + d, y: p.y - d }, { x: p.x + d, y: p.y + d }, { x: p.x - d, y: p.y + d }];
          };
          window.KtaVolumeExploite.ouvrir();
          const champ = document.getElementById("kta-volume-h");
          r.volume = champ ? champ.value : null;
          if (champ) { champ.value = "2.5"; champ.dispatchEvent(new Event("input", { bubbles: true })); }
          const x = document.querySelector("#kta-volume-modal .kta-panneau-close");
          if (x) x.click();
          window.getMeasurePointsSurface = surf;
          return K.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } });
        }).then(function () {
          r.depuisVolume = K.etat().hauteur;
          return K.fermer();
        }).then(function () {
          const k = "myktamap_plan_prefs_" + (window._currentLoadedPlanId || "default");
          const pr = JSON.parse(localStorage.getItem(k) || "{}");
          delete pr.hauteurGalerieM;
          localStorage.setItem(k, JSON.stringify(pr));
          return r;
        });
      }, prep);
      verifier(h4.rouvert === 3 && h4.bouton.indexOf("3.0") >= 0 && h4.volume === "3" && h4.depuisVolume === 2.5,
        "3 m relus à la réouverture et par ⛏️ Volume exploité ; 2,5 m saisis dans ⛏️ relus par la vue", h4);
      await page.evaluate(function () {
        window.setStructures([]);
        window.setEditorPoints(window.__v3dPoints || []);
      });

      // ── 8. Mode galerie : formes fictives (T, X, coude droit, coude aigu, cul-de-sac, presque parallèles) ───
      // Calques du plan mis de côté pendant la partie galerie : seules les formes du checkup comptent. Plan courant
      // remplacé par un identifiant de test (le rendu est retenu PAR PLAN : rien n'est écrit pour le relevé fictif).
      const G = await page.evaluate(function () {
        const sc = window.APP_CONFIG.scale, W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
        window.__v3dEmb = { r: window.getAllEmbeddedRoads, z: window.getAllEmbeddedZones, p: window.getAllEmbeddedPoints,
          s: window.getAllEmbeddedStructures, id: window._currentLoadedPlanId };
        const vide = function () { return []; };
        window.getAllEmbeddedRoads = window.getAllEmbeddedZones = window.getAllEmbeddedPoints = vide;
        window.getAllEmbeddedStructures = vide;
        window._currentLoadedPlanId = "v3d-checkup-galerie";
        if (window.getTrackingActif()) window.stopTracking();
        window.ktaSetActiveLevel(0);
        const ox = W / 2 / sc - 125, oz = H / 2 / sc;   // mètres
        const P = function (cx, x, z) { return { x: (ox + cx + x) * sc, y: (oz + z) * sc }; };
        let n = 0;
        const R = function (type, cx, pts, lvl) {
          return { uid: "rd_v3d_" + (n++), type: type, level: lvl || 0,
            points: pts.map(function (q) { return P(cx, q[0], q[1]); }) };
        };
        window.setRoads([
          R("principal", 0, [[-12, 0], [12, 0]]), R("secondaire", 0, [[0, 0], [0, 12]]),        // T
          R("principal", 50, [[-12, 0], [12, 0]]), R("principal", 50, [[0, -12], [0, 12]]),     // X
          R("chemin", 100, [[0, -12], [0, 0], [12, 0]]),                                       // coude droit
          R("chemin", 150, [[-12, 0], [0, 0], [-12, 4]]),                                      // coude aigu (19°)
          R("principal", 200, [[0, 0], [14, 0]]),                                               // cul-de-sac
          R("principal", 250, [[-12, 0], [12, 0]]), R("principal", 250, [[-12, 1.6], [12, 2.4]]), // presque parallèles
          R("principal", 0, [[-12, -6], [12, -6]], 1), R("principal", 50, [[-12, -6], [12, -6]], 1),
          { uid: "rd_v3d_j", type: "jonction", level: 0, fromLevel: 0, toLevel: 1, points: [P(50, 8, 0), P(50, 8, -6)] }
        ]);
        const carre = function (cx, x0, x1, z0, z1) {
          return [P(cx, x0, z0), P(cx, x1, z0), P(cx, x1, z1), P(cx, x0, z1)];
        };
        window.setZones([
          { uid: "zn_v3d_e", type: "eau", level: 0, points: carre(200, 2, 4, -3, 3) },
          { uid: "zn_v3d_r", type: "remblais", level: 0, points: carre(200, 6, 8, -3, 3) },
          { uid: "zn_v3d_i", type: "inaccessible", level: 0, points: carre(200, 10, 11, -3, 3) }
        ]);
        const pj = P(0, -8, 0), acc = P(0, -8, -6);
        window.setEditorPoints([
          Object.assign({ id: "POI 2 m v3d", level: 0, tags: ["danger"] }, P(200, 5, 2)),
          Object.assign({ id: "POI 5 m v3d", level: 0, tags: ["danger"] }, P(200, 5, 5)),
          Object.assign({ id: "POI 25 m v3d", level: 0, tags: ["danger"] }, P(200, 5, 25)),
          { id: "POI jonction v3d", x: pj.x, y: pj.y, level: 0, tags: ["jes"], niveaux: [0, 1],
            accroches: [{ level: 1, x: acc.x, y: acc.y }] }
        ]);
        window.KtaGalerie.invalider();
        const m = window.KtaGalerie.modele(0);
        return { sc: sc, ox: ox, oz: oz, H: H, multi: window.APP_CONFIG.multiLevel === true, planReel: window.__v3dEmb.id,
          modele: { pieces: m.pieces.length, aretes: m.aretes.length, dalles: m.dalles, coudes: m.coudes, bouts: m.bouts,
            ms: +m.msConstruction.toFixed(1) } };
      });
      // Point (mètres, relatif à une forme) → coordonnées plan (px).
      const pt = function (cx, x, z, cap) {
        return { x: (G.ox + cx + x) * G.sc, y: (G.oz + z) * G.sc, cap: cap === undefined ? 0 : cap };
      };
      verifier(G.modele.dalles >= 2 && G.modele.coudes >= 2 && G.modele.bouts >= 6,
        "galerie : graphe des formes (dalles aux carrefours T et X, coudes, bouts libres)", G.modele);

      // Interrupteur à trois états : mixte par défaut (avec ou sans structure), bouton mixte → structures → galerie,
      // retenu par plan. Un pilier posé sur le T : dessiné et bloquant en mixte et en structures, absent en galerie.
      // La suite de la partie 8 se joue en galerie (choix retenu pour le plan de test).
      const inter = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, r = {}, acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };   // image du plan : seule la structure juge
        const traverser = function () {
          K.placer(a.avant.x, a.avant.y, 90);
          for (let i = 0; i < 30; i++) K.avancer(0.2);
          return (K.etat().pos.x - a.avant.x) / a.sc;
        };
        const clic = function () {
          document.querySelector('#kta-vue3d [data-v3d="rendu"]').dispatchEvent(new PointerEvent("pointerdown",
            { bubbles: true }));
          const e = K.etat();
          return { rendu: e.rendu, bouton: e.boutonRendu, pref: window.getPlanRenduVue3D(), parois: K.parois().length,
            yMax: e.yMax.opaque };
        };
        await K.ouvrir({ depart: a.dep });
        r.sans = K.etat().rendu; r.paroisSans = K.parois().length;
        await K.fermer();
        window.setStructures([{ uid: "st_v3d_g", type: "pilier-1", level: 0, points: a.pilier }]);
        await K.ouvrir({ depart: a.dep });
        const e = K.etat();
        r.avec = e.rendu; r.bouton = e.boutonRendu; r.prefAvant = window.getPlanRenduVue3D();
        r.paroisMixte = K.parois().length; r.yMaxMixte = e.yMax.opaque;
        r.traverseMixte = traverser();
        r.c1 = clic();
        r.traverseStructures = traverser();
        r.c2 = clic();
        r.traverseGalerie = traverser();   // le pilier posé sur le tube n'arrête rien en galerie
        await K.fermer();
        await K.ouvrir({ depart: a.dep });
        r.rouvert = K.etat().rendu;
        r.autrePlan = window.getPlanRenduVue3D("v3d-autre-plan");
        r.c3 = clic(); r.c4 = clic(); r.c5 = clic();
        await K.fermer();
        window.setStructures([]);
        window.ktaEstAccessible = acc;
        r.libelles = { m: window.I18n.t("vue3d.modeMixte"), s: window.I18n.t("vue3d.modeStructures"),
          g: window.I18n.t("vue3d.modeGalerie") };
        return r;
      }, { dep: pt(0, -8, 0, 90), avant: pt(0, -8, 0), sc: G.sc,
        pilier: [pt(0, -4.5, -0.5), pt(0, -3.5, -0.5), pt(0, -3.5, 0.5), pt(0, -4.5, 0.5)] });
      verifier(inter.sans === "mixte" && inter.avec === "mixte" && inter.prefAvant === null && inter.paroisSans > 0 &&
        inter.bouton.indexOf("🏛️🛣️ " + inter.libelles.m) === 0,
        "défaut : mixte, avec ou sans structure au niveau (sans structure : tout en tubes), bouton 🏛️🛣️ Mixte", inter);
      verifier(inter.paroisMixte > 0 && Math.abs(inter.yMaxMixte - 2) < 1e-6 && inter.traverseMixte < 3.5,
        "mixte : pilier posé sur le tube dessiné et bloquant, parois des tubes ailleurs", inter);
      verifier(inter.c1.rendu === "structures" && inter.c1.bouton.indexOf("🏛️ " + inter.libelles.s) === 0 &&
        inter.c1.pref === "structures" && inter.c1.parois === 0 && inter.traverseStructures < 3.5,
        "bouton : mixte → 🏛️ Structures (retenu pour le plan) : aucune paroi, le pilier arrête", inter.c1);
      verifier(inter.c2.rendu === "galerie" && inter.c2.bouton.indexOf("🛣️ " + inter.libelles.g) === 0 &&
        inter.c2.pref === "galerie" && inter.c2.parois > 0 && inter.c2.yMax < 0.1 && inter.traverseGalerie > 5,
        "→ 🛣️ Galerie (retenu) : tubes, ni pilier dessiné ni butée contre lui", { c2: inter.c2, t: inter.traverseGalerie });
      verifier(inter.rouvert === "galerie" && inter.autrePlan === null && inter.c3.rendu === "mixte" &&
        inter.c3.pref === "mixte" && inter.c4.rendu === "structures" && inter.c5.rendu === "galerie",
        "rouvert : rendu retenu (galerie), autre plan sans choix ; → mixte → structures → galerie, en boucle", inter);

      // Formes : toutes les parois construites (une seule tuile), aucune ne traverse une autre ; axes libres.
      const formes = await page.evaluate(function (a) {
        return window.KtaVue3D.ouvrir({ depart: a.dep, tuiles: false }).then(function () {
          const ps = window.KtaVue3D.parois();
          const coupe = function (s, t) {
            const dx = s[2] - s[0], dz = s[3] - s[1], ex = t[2] - t[0], ez = t[3] - t[1], d = dx * ez - dz * ex;
            if (Math.abs(d) < 1e-12) return false;
            const rx = t[0] - s[0], rz = t[1] - s[1], u = (rx * ez - rz * ex) / d, v = (rx * dz - rz * dx) / d;
            return u > 1e-4 && u < 1 - 1e-4 && v > 1e-4 && v < 1 - 1e-4;
          };
          let croisements = 0;
          const exemples = [];
          for (let i = 0; i < ps.length; i++) {
            for (let j = i + 1; j < ps.length; j++) {
              if (coupe(ps[i], ps[j])) { croisements++; if (exemples.length < 3) exemples.push([ps[i], ps[j]]); }
            }
          }
          const M = function (cx, x0, z0, x1, z1) { return [a.ox + cx + x0, a.oz + z0, a.ox + cx + x1, a.oz + z1]; };
          const murs = function (s) { return ps.filter(function (p) { return coupe(s, p); }).length; };
          const axes = {
            T: murs(M(0, -11.5, 0, 11.5, 0)) + murs(M(0, 0, 0.1, 0, 11.5)),
            X: murs(M(50, -11.5, 0, 11.5, 0)) + murs(M(50, 0, -11.5, 0, 11.5)),
            coude: murs(M(100, 0, -11.5, 0, 0)) + murs(M(100, 0, 0, 11.5, 0)),
            aigu: murs(M(150, -11.5, 0, 0, 0)) + murs(M(150, 0, 0, -11.5, 3.83)),
            paralleles: murs(M(250, -11.5, 0, 11.5, 0)) + murs(M(250, -11.5, 1.63, 11.5, 2.38)) +
              murs(M(250, 0, 0, 0, 2)),
            culDeSac: murs(M(200, -1, 0, 15, 0)),
            coteT: murs(M(0, -6, -2, -6, 2)),
            fondT: murs(M(0, 6, 0.5, 6, -2))
          };
          window.KtaVue3D.fermer();
          return { parois: ps.length, croisements: croisements, exemples: exemples, axes: axes };
        });
      }, { dep: pt(0, -8, 0, 90), ox: G.ox, oz: G.oz });
      verifier(formes.parois > 20 && formes.croisements === 0,
        "galerie : " + formes.parois + " parois (T, X, coudes droit et aigu, cul-de-sac, presque parallèles), " +
        "aucune ne traverse une autre", { croisements: formes.croisements, exemples: formes.exemples });
      const ax = formes.axes;
      verifier(ax.T === 0 && ax.X === 0 && ax.coude === 0 && ax.aigu === 0 && ax.paralleles === 0,
        "axes libres : carrefours ouverts (T, X), coudes passants, tracés presque parallèles fondus en une galerie", ax);
      verifier(ax.culDeSac === 2 && ax.coteT === 2 && ax.fondT === 1,
        "bouts libres fermés par une paroi ; T : deux parois en travers d'une branche, une en face du départ", ax);
      await capture(page, "galerie-formes");

      // Collisions contre les parois : butée, carrefour passé, coude, remblais qui bouche, eau qui ne bouche pas.
      const coll3 = await page.evaluate(function (a) {
        const K = window.KtaVue3D, rel = function (cx) {
          const p = K.etat().pos;
          return { x: +(p.x / a.sc - a.ox - cx).toFixed(2), z: +(p.y / a.sc - a.oz).toFixed(2) };
        };
        const marcher = function (n, pas) { for (let i = 0; i < n; i++) K.avancer(pas || 0.2); };
        return K.ouvrir({ depart: a.t }).then(function () {
          const r = {};
          K.placer(a.t.x, a.t.y, 0); marcher(30); r.paroiNord = rel(0).z;
          K.placer(a.t.x - 2 * a.sc, a.t.y, 90); marcher(120); r.carrefourEst = rel(0).x;
          K.placer((a.ox + 0) * a.sc, a.oz * a.sc, 180); marcher(70); r.branche = rel(0).z;
          K.placer((a.ox + 100) * a.sc, (a.oz - 10) * a.sc, 180); marcher(70); r.coudeSud = rel(100).z;
          K.tourner(-90); marcher(70); r.coudeEst = rel(100).x;
          K.placer((a.ox + 200.8) * a.sc, a.oz * a.sc, 90); marcher(70, 0.1); r.remblais = rel(200).x;
          r.butees = K.etat().butees;
          K.fermer();
          return r;
        });
      }, { t: pt(0, -8, 0, 90), sc: G.sc, ox: G.ox, oz: G.oz });
      verifier(coll3.paroiNord > -0.9 && coll3.paroiNord < -0.6 && coll3.carrefourEst > 10.5 && coll3.branche > 10.5 &&
        coll3.coudeSud > 0.2 && coll3.coudeSud < 0.5 && coll3.coudeEst > 10.5,
        "galerie : on bute contre la paroi (" + coll3.paroiNord + " m de l'axe), on passe le carrefour et le coude",
        coll3);
      verifier(coll3.remblais > 5.3 && coll3.remblais < 5.65,
        "galerie : l'eau ne bouche pas, le remblais découpé arrête (" + coll3.remblais + " m, remblais à 6 m)", coll3);

      // Zones coupées au tube, rideau en travers ; POI à 2 m et 5 m ramenés dans le tube, à 25 m masqué.
      const zp = await page.evaluate(function (a) {
        return window.KtaVue3D.ouvrir({ depart: a.dep }).then(function () {
          const e = window.KtaVue3D.etat();
          window.KtaVue3D.fermer();
          const b = e.boites, rel = function (bb) {
            return bb ? { x0: +(bb.x0 - a.ox - 200).toFixed(2), x1: +(bb.x1 - a.ox - 200).toFixed(2),
              z0: +(bb.z0 - a.oz).toFixed(2), z1: +(bb.z1 - a.oz).toFixed(2), y1: +bb.y1.toFixed(2) } : null;
          };
          return { eau: rel(b.eau), remblais: rel(b.remblais), sol: rel(b.inaccessible), rideau: rel(b.rideau),
            rideaux: e.rideaux.map(function (q) { return +(q[0] - a.ox - 200).toFixed(2); }),
            faces: e.facesRemblais, hauteur: e.hauteur, masques: e.poiMasques,
            poi: e.panneaux.filter(function (q) { return /v3d/.test(q.nom); }).map(function (q) {
              return { nom: q.nom, visible: q.visible, z: +(q.z - a.oz).toFixed(2), depthTest: q.depthTest };
            }) };
        });
      }, { dep: pt(200, 5, 0, 90), ox: G.ox, oz: G.oz });
      const dans = function (bb, x0, x1) {
        return !!bb && bb.z0 >= -1.26 && bb.z1 <= 1.26 && bb.x0 >= x0 - 0.01 && bb.x1 <= x1 + 0.01;
      };
      verifier(dans(zp.eau, 2, 4) && dans(zp.remblais, 6, 8) && dans(zp.sol, 10, 11) &&
        Math.abs(zp.remblais.y1 - zp.hauteur * 0.6) < 0.01 && zp.faces === 2,
        "zones coupées au tube (2,5 m) : eau, remblais à 60 % (faces vers la galerie seulement), inaccessible", zp);
      verifier(zp.rideaux.length === 2 && zp.rideaux.indexOf(10) >= 0 && zp.rideaux.indexOf(11) >= 0 &&
        dans(zp.rideau, 10, 11), "inaccessible : un rideau en travers du tube à chaque bord qui coupe l'axe", zp.rideaux);
      const p2 = zp.poi.filter(function (q) { return q.nom === "POI 2 m v3d"; })[0];
      const p5 = zp.poi.filter(function (q) { return q.nom === "POI 5 m v3d"; })[0];
      verifier(!!p2 && p2.visible && Math.abs(p2.z - 1.17) < 0.02 && p2.depthTest === false &&
        !!p5 && p5.visible && Math.abs(p5.z - 1.17) < 0.02 &&
        !zp.poi.some(function (q) { return q.nom === "POI 25 m v3d"; }) && zp.masques >= 1,
        "POI à 2 et 5 m de l'axe : visibles, ramenés contre la paroi ; POI à 25 m : masqué", zp.poi);
      await capture(page, "galerie-zones");

      // Hauteur ⛏️ en mode galerie : tubes, plafond, remblais à 60 % et rideaux refaits à 3 m ; relue à la réouverture.
      const hg = await page.evaluate(function (a) {
        const K = window.KtaVue3D, r = {};
        return K.ouvrir({ depart: a.dep }).then(function () {
          const e0 = K.etat();
          r.v = K.reglerHauteur(3);
          const e = K.etat(), b = e.boites;
          r.rendu = e.rendu; r.hauteur = e.hauteur; r.pref = window.getPlanHauteurGalerie();
          r.y = { parois: b.parois && b.parois.y1, plafond: b.plafond && b.plafond.y1,
            remblais: b.remblais && b.remblais.y1, rideau: b.rideau && b.rideau.y1 };
          r.rideaux = e.rideaux.length; r.faces = e.facesRemblais;
          r.garde = e.pos.x === e0.pos.x && e.pos.y === e0.pos.y && e.cap === e0.cap;
          return K.fermer();
        }).then(function () { return K.ouvrir({ depart: a.dep }); }).then(function () {
          r.rouvert = K.etat().hauteur;
          return K.fermer();
        }).then(function () {
          const k = "myktamap_plan_prefs_" + window._currentLoadedPlanId;
          const pr = JSON.parse(localStorage.getItem(k) || "{}");
          delete pr.hauteurGalerieM;
          localStorage.setItem(k, JSON.stringify(pr));
          return r;
        });
      }, { dep: pt(200, 5, 0, 90) });
      const pres = function (v, att) { return typeof v === "number" && Math.abs(v - att) < 1e-6; };
      verifier(hg.v === 3 && hg.rendu === "galerie" && hg.pref === 3 && hg.garde && pres(hg.y.parois, 3) &&
        pres(hg.y.plafond, 3) && pres(hg.y.remblais, 1.8) && pres(hg.y.rideau, 3) && hg.rideaux === 2 && hg.faces === 2,
        "galerie : réglé à 3 m, parois, plafond et rideaux à 3 m, remblais à 1,8 m, position et cap gardés", hg);
      verifier(hg.rouvert === 3, "galerie : 3 m relus à la réouverture", hg.rouvert);

      // ── Filtres partagés : ≡ ouvre le ≡ Filtres de la carte ; masquer d'un côté masque de l'autre ──────────────
      // Calque de données fictif (une zone d'effondrement au bout du cul-de-sac), itinéraire, et un pilier pour le
      // rendu structures. Collisions et itinéraire ne suivent aucun filtre.
      await page.evaluate(function (a) {
        window.__v3dRoutes = window.getRoads();
        window.setRoads(window.__v3dRoutes.concat([{ uid: "rd_v3d_iti", type: "itinerary", level: 0,
          points: [a.it0, a.it1] }]));
        const g = L.layerGroup().addTo(window.map);
        window.dataLayerGroups.v3d_calque = g;
        window.__v3dZonesEmb = window.getAllEmbeddedZones;
        window.getAllEmbeddedZones = function () {
          return [{ type: "effondrement", level: 0, layerId: "v3d_calque", points: a.calque }];
        };
        window.setStructures([{ uid: "st_v3d_f", type: "pilier-1", level: 0, points: a.pilier }]);
        window.KtaGalerie.invalider();
        return window.KtaVue3D.ouvrir({ depart: a.dep }).then(function () { window.KtaVue3D.basculerRendu("galerie"); });
      }, { dep: pt(200, 5, 0, 90), it0: pt(200, 1, 0), it1: pt(200, 12, 0),
        calque: [pt(200, 12, -3), pt(200, 13, -3), pt(200, 13, 3), pt(200, 12, 3)],
        pilier: [pt(200, 6, -5), pt(200, 7, -5), pt(200, 7, -4), pt(200, 6, -4)] });
      const f0 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        return { rendu: e.rendu, zones: e.zonesDecoupees, liseres: e.liseres, rubans: e.rubans,
          panneaux: e.panneaux.length, pastille: e.filtres.pastille };
      });
      await page.locator('#kta-vue3d [data-v3d="filtres"]').click();
      await page.waitForTimeout(200);
      const f1 = await page.evaluate(function () {
        const fp = document.getElementById("kta-fp-modal"), e = window.KtaVue3D.etat();
        return { panneau: !!fp, ouvert: e.filtres.panneauOuvert, dessus: e.recouverte, vue: e.ouvert,
          ancien: !!document.querySelector("#kta-vue3d [data-v3d-aff], #kta-vue3d .kta-v3d-affichage"),
          calque: !!(fp && fp.querySelector('[data-data-layer="v3d_calque"]')) };
      });
      verifier(f0.rendu === "galerie" && f0.zones.eau > 0 && f0.zones.effondrement > 0 && f0.liseres.principal > 0 &&
        f0.rubans.itinerary > 0 && f0.panneaux > 0 && !f0.pastille, "galerie : zones (calque compris), liserés, " +
        "itinéraire et POI dessinés, ≡ sans pastille", f0);
      verifier(f1.panneau && f1.ouvert && f1.dessus && f1.vue && !f1.ancien && f1.calque,
        "≡ de la vue : le panneau ≡ Filtres de la carte, au-dessus de la 3D (plus de panneau propre à la 3D)", f1);
      await capture(page, "filtres-dans-la-3d");
      await page.evaluate(function () {
        ['[data-set="zoneTypes"][data-type="eau"]', '[data-set="roadTypes"][data-type="principal"]',
          '[data-set="tags"][data-type="danger"]', '[data-data-layer="v3d_calque"]'].forEach(function (q) {
          document.querySelector("#kta-fp-modal " + q).click();
        });
      });
      await page.waitForTimeout(400);
      const f2 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat(), f = window._ktaRuntimeFilters;
        return { zones: e.zonesDecoupees, liseres: e.liseres, rubans: e.rubans,
          danger: e.panneaux.some(function (q) { return /POI [25] m v3d/.test(q.nom); }),
          eau2D: f.zoneTypes instanceof Set && !f.zoneTypes.has("eau"),
          principal2D: f.roadTypes instanceof Set && !f.roadTypes.has("principal"),
          danger2D: f.tags instanceof Set && !f.tags.has("danger"),
          calque2D: window.map.hasLayer(window.dataLayerGroups.v3d_calque),
          pastille: e.filtres.pastille, pastille2D: document.querySelector(".kta-filter-ctrl a").classList.contains(
            "kta-filter-ctrl-actif") };
      });
      verifier(!f2.zones.eau && !f2.zones.effondrement && f2.eau2D && !f2.calque2D,
        "zone « eau » et calque décochés dans ≡ : retirés de la 3D ET de la carte", f2);
      verifier(!f2.liseres.principal && f2.principal2D && f2.rubans.itinerary > 0,
        "type de tracé décoché : liseré retiré en 3D et en 2D ; l'itinéraire reste (son propre interrupteur)", f2);
      verifier(!f2.danger && f2.danger2D, "tag « danger » décoché : panneaux retirés en 3D et en 2D", f2);
      verifier(f2.pastille && f2.pastille2D, "pastille de filtre actif sur le ≡ de la vue comme sur celui de la carte", f2);
      // Échap : le panneau ≡ se ferme, la vue reste.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const f3 = await page.evaluate(function (a) {
        const K = window.KtaVue3D, r = { panneau: !!document.getElementById("kta-fp-modal"), vue: K.etat().ouvert };
        // Collision : le bout du cul-de-sac (tracé principal masqué) arrête toujours.
        K.placer(a.bout.x, a.bout.y, 90);
        for (let i = 0; i < 20; i++) K.avancer(1);
        r.avance = (K.etat().pos.x - a.bout.x) / a.sc;
        return r;
      }, { bout: pt(0, 5, 0, 90), sc: G.sc });
      verifier(!f3.panneau && f3.vue, "Échap avec ≡ ouvert : le panneau se ferme, la vue reste", f3);
      verifier(f3.avance > 4 && f3.avance < 8, "tracé masqué : le bout du tube arrête toujours (" +
        f3.avance.toFixed(2) + " m sur 20)", f3.avance);
      // Inversement : filtres remis depuis la carte (« Tout afficher » du ≡ Filtres) → la 3D les suit.
      await page.evaluate(function (d) { window.KtaVue3D.placer(d.x, d.y, 90); window.FilterPanel.ouvrir(); },
        pt(200, 5, 0, 90));
      await page.locator("#kta-fp-reset-all").click();
      await page.waitForTimeout(400);
      await page.evaluate(function () { window.FilterPanel.fermer(); });
      const f4 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        return { zones: e.zonesDecoupees, liseres: e.liseres, pastille: e.filtres.pastille,
          danger: e.panneaux.some(function (q) { return /POI [25] m v3d/.test(q.nom); }) };
      });
      verifier(f4.zones.eau > 0 && f4.zones.effondrement > 0 && f4.liseres.principal > 0 && f4.danger && !f4.pastille,
        "« Tout afficher » sur la carte : zone, calque, liseré et POI reviennent en 3D, pastille éteinte", f4);
      // Structures : un type masqué depuis la carte (FilterPanel.setFilters) disparaît de la 3D, la butée reste.
      const f5 = await page.evaluate(function (a) {
        const K = window.KtaVue3D, r = {}, acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };   // image de collision du plan hors jeu ici
        K.basculerRendu("structures");
        r.rendu = K.etat().rendu;
        r.avant = K.etat().compte.structures;
        window.FilterPanel.setFilters({ structTypes: new Set(["mur"]) });
        return new Promise(function (res) { setTimeout(res, 300); }).then(function () {
          r.apres = K.etat().compte.structures;
          K.placer(a.dep.x, a.dep.y, 0);
          for (let i = 0; i < 20; i++) K.avancer(0.25);
          r.nord = (a.dep.y - K.etat().pos.y) / a.sc;
          window.FilterPanel.setFilters({ structTypes: null });
          return new Promise(function (res) { setTimeout(res, 300); });
        }).then(function () {
          r.retour = K.etat().compte.structures;
          K.basculerRendu("galerie");
          window.ktaEstAccessible = acc;
          return r;
        });
      }, { dep: pt(200, 6.5, -2.5), sc: G.sc });
      verifier(f5.rendu === "structures" && f5.avant === 1 && f5.apres === 0 && f5.retour === 1,
        "structures : pilier masqué par les filtres de la carte → retiré de la 3D, puis rendu", f5);
      verifier(f5.nord > 0.3 && f5.nord < 1.5, "pilier masqué : la butée reste (arrêt à " + f5.nord.toFixed(2) +
        " m du départ, face à 1,5 m)", f5);
      // Niveaux visibles (plan multi-niveau) : le niveau de la vue décoché sur la carte → plus rien dessiné.
      const f6 = await page.evaluate(function () {
        const c = window.APP_CONFIG;
        if (c.multiLevel !== true) return null;
        const avant = c.visibleLevels.slice(), K = window.KtaVue3D;
        c.visibleLevels = c.availableLevels.filter(function (l) { return l !== 0; });
        window.appliquerFiltreNiveau();
        return new Promise(function (res) { setTimeout(res, 300); }).then(function () {
          const e = K.etat(), r = { zones: e.compte.zones, pastille: e.filtres.pastille };
          c.visibleLevels = avant;
          window.appliquerFiltreNiveau();
          return new Promise(function (res) { setTimeout(res, 300); }).then(function () {
            r.retour = K.etat().compte.zones;
            return r;
          });
        });
      });
      if (f6) {
        verifier(f6.zones === 0 && f6.pastille && f6.retour > 0,
          "niveau 0 masqué sur la carte : rien de dessiné en 3D, pastille ; remis : la 3D le redessine", f6);
      } else {
        console.log("  ℹ️ plan à un niveau : filtre de niveaux non joué");
      }
      await page.evaluate(function () {
        window.map.removeLayer(window.dataLayerGroups.v3d_calque);
        delete window.dataLayerGroups.v3d_calque;
        window.getAllEmbeddedZones = window.__v3dZonesEmb;
        window.setStructures([]);
        window.setRoads(window.__v3dRoutes);
        window.KtaGalerie.invalider();
        return window.KtaVue3D.fermer();
      });

      // ── 9. Passage de niveau 🪜 (POI jonction, tracé jonction) ; carte placée à la sortie ─────────────────
      if (G.multi) {
        const j1 = await page.evaluate(function (a) {
          window.startTracking();
          window.recalerTrackerSurPoint(a.tracker.x, a.tracker.y, 0);
          return window.KtaVue3D.ouvrir({ depart: a.pres }).then(function () {
            return new Promise(function (r) { setTimeout(function () { r(window.KtaVue3D.etat()); }, 200); });
          });
        }, { tracker: pt(0, -10, 0), pres: pt(0, -7, 0, 90) });
        verifier(j1.mode === "libre" && j1.passage.visible && j1.passage.haut === 1 && j1.passage.bas === null,
          "à 1 m d'un POI jonction (niveaux 0 et +1) : 🪜 ▲ montré", j1.passage);
        await capture(page, "galerie-passage");
        await page.locator('#kta-vue3d [data-v3d="niveauHaut"]').click();
        const j2 = await page.evaluate(function (a) {
          const e = window.KtaVue3D.etat(), tr = window.getTrackingPosition();
          return { niveau: e.niveau, cap: e.cap, pos: e.pos, aretes: e.compte.aretes, bas: e.passage.bas,
            actif: window.APP_CONFIG.activeLevel, trNiveau: window.getTrackerLevel(),
            trBouge: Math.hypot(tr.x - a.tracker.x, tr.y - a.tracker.y), acc: a.acc };
        }, { tracker: pt(0, -10, 0), acc: pt(0, -8, -6) });
        verifier(j2.niveau === 1 && Math.abs(j2.cap - 90) < 0.01 && Math.hypot(j2.pos.x - j2.acc.x, j2.pos.y - j2.acc.y) < 0.01 &&
          j2.aretes === 2 && j2.bas === 0, "▲ : niveau +1, à l'accroche validée, cap gardé, scène refaite", j2);
        verifier(j2.actif === 0 && j2.trNiveau === 0 && j2.trBouge < 0.01,
          "passage : le tracker et le niveau de la carte 2D ne bougent pas", j2);
        const j3 = await page.evaluate(function (a) {
          const K = window.KtaVue3D, r = {};
          r.bas = K.changerNiveau("bas"); r.n0 = K.etat().niveau; r.pos0 = K.etat().pos;
          K.placer(a.A.x, a.A.y, 0);
          r.hautTrace = K.changerNiveau("haut"); r.n1 = K.etat().niveau; r.pos1 = K.etat().pos;
          r.basTrace = K.changerNiveau("bas"); r.n2 = K.etat().niveau; r.pos2 = K.etat().pos;
          window.__v3dCap2 = window.getPlanRelHeading;
          window.getPlanRelHeading = function () { return 90; };
          K.suivre();
          return new Promise(function (res) {
            setTimeout(function () {
              const e = K.etat();
              r.suivi = { mode: e.mode, niveau: e.niveau, boite: e.passage.visible };
              K.basculerSuivi();
              window.getPlanRelHeading = window.__v3dCap2;
              res(r);
            }, 300);
          });
        }, { A: pt(50, 8, 0), B: pt(50, 8, -6) });
        const B = pt(50, 8, -6), A = pt(50, 8, 0);
        verifier(j3.bas && j3.n0 === 0 && j3.hautTrace && j3.n1 === 1 && Math.hypot(j3.pos1.x - B.x, j3.pos1.y - B.y) < 0.01 &&
          j3.basTrace && j3.n2 === 0 && Math.hypot(j3.pos2.x - A.x, j3.pos2.y - A.y) < 0.01,
          "▼ revient ; tracé jonction pris dans les deux sens, d'un bout à l'autre", j3);
        verifier(j3.suivi.mode === "suivi" && j3.suivi.niveau === 0 && !j3.suivi.boite,
          "en suivi : niveau du tracker, pas de 🪜", j3.suivi);
        // Toucher le panneau du POI jonction, à 3,5 m (hors de portée du bouton) : passage direct.
        await page.evaluate(function (a) { window.KtaVue3D.placer(a.x, a.y, 90); }, pt(0, -11.5, 0));
        await page.waitForTimeout(300);
        const vise = await page.evaluate(function () {
          const q = window.KtaVue3D.etat().panneaux.filter(function (p) { return p.jonction && p.visible; })[0];
          return q ? q.ecran : null;
        });
        if (vise) await page.mouse.click(vise.x, vise.y);
        await page.waitForTimeout(200);
        const j4 = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { niveau: e.niveau, pos: e.pos }; });
        const acc = pt(0, -8, -6);
        verifier(!!vise && j4.niveau === 1 && Math.hypot(j4.pos.x - acc.x, j4.pos.y - acc.y) < 0.01,
          "toucher le panneau du POI jonction : passage au niveau +1", { vise: vise, j4: j4 });
        // Fermer : « Je suis ici ? » parle du niveau ; Non → tracker inchangé, carte au niveau et à la place de la 3D.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        const q1 = await page.evaluate(function () {
          const b = document.getElementById("kta-confirm-oui");
          return { texte: b ? b.closest(".kta-readme-modal-boite").textContent : "",
            attendu: window.I18n.t("vue3d.jeSuisIci.texteNiveau", { n: window.ktaFormatNiveau(1) }) };
        });
        verifier(q1.texte.indexOf(q1.attendu) >= 0, "fermeture sur un autre niveau : « Je suis ici ? » le dit", q1);
        await page.locator("#kta-confirm-non").click();
        await page.waitForTimeout(200);
        const carte1 = await page.evaluate(function (a) {
          const c = window.map.getCenter(), tr = window.getTrackingPosition();
          return { actif: window.APP_CONFIG.activeLevel, lat: c.lat, lng: c.lng, attendu: window.convertCoord(a.acc.x, a.acc.y),
            trNiveau: window.getTrackerLevel(), trBouge: Math.hypot(tr.x - a.tracker.x, tr.y - a.tracker.y) };
        }, { acc: acc, tracker: pt(0, -10, 0) });
        verifier(carte1.actif === 1 && Math.abs(carte1.lat - carte1.attendu[0]) < 1 && Math.abs(carte1.lng - carte1.attendu[1]) < 1 &&
          carte1.trNiveau === 0 && carte1.trBouge < 0.01,
          "« Non » : tracker inchangé, la carte 2D passe au niveau +1 et se centre sur la position 3D", carte1);
        // « Oui » : le tracker est recalé là ET sur ce niveau.
        await page.evaluate(function (a) {
          window.ktaSetActiveLevel(0);
          return window.KtaVue3D.ouvrir({ depart: a }).then(function () { window.KtaVue3D.changerNiveau("haut"); });
        }, pt(0, -7, 0, 90));
        await page.locator('#kta-vue3d [data-v3d="fermer"]').click();
        await page.waitForTimeout(200);
        await page.locator("#kta-confirm-oui").click();
        await page.waitForTimeout(300);
        const oui = await page.evaluate(function (a) {
          const tr = window.getTrackingPosition();
          return { trNiveau: window.getTrackerLevel(), d: Math.hypot(tr.x - a.x, tr.y - a.y), actif: window.APP_CONFIG.activeLevel };
        }, acc);
        verifier(oui.trNiveau === 1 && oui.d < 0.01 && oui.actif === 1,
          "« Oui » : tracker recalé à l'accroche et au niveau +1, carte au niveau +1", oui);
        // Suivi sans déplacement : la carte se centre sur le tracker.
        const suiviCarte = await page.evaluate(function () {
          return window.KtaVue3D.ouvrir().then(function () {
            const e = window.KtaVue3D.etat();
            return window.KtaVue3D.fermer().then(function () {
              const c = window.map.getCenter(), tr = window.getTrackingPosition(), att = window.convertCoord(tr.x, tr.y);
              return { mode: e.mode, dLat: Math.abs(c.lat - att[0]), dLng: Math.abs(c.lng - att[1]) };
            });
          });
        });
        verifier(suiviCarte.mode === "suivi" && suiviCarte.dLat < 1 && suiviCarte.dLng < 1,
          "fermeture en suivi sans déplacement : la carte se centre sur le tracker", suiviCarte);
        await page.evaluate(function () { window.stopTracking(); window.ktaSetActiveLevel(0); });
      } else {
        console.log("  ℹ️ plan à un niveau : passages 🪜 non joués");
      }
      // Libre, quelques mètres, fermer (sans tracker, pas de question) : la carte se centre sur la position 3D.
      const carte2 = await page.evaluate(function (a) {
        return window.KtaVue3D.ouvrir({ depart: a }).then(function () {
          window.KtaVue3D.avancer(1); window.KtaVue3D.avancer(1); window.KtaVue3D.avancer(1);
          const p = window.KtaVue3D.etat().pos;
          return window.KtaVue3D.fermer().then(function () {
            const c = window.map.getCenter(), att = window.convertCoord(p.x, p.y);
            return { avance: Math.hypot(p.x - a.x, p.y - a.y) / window.APP_CONFIG.scale,
              dLat: Math.abs(c.lat - att[0]), dLng: Math.abs(c.lng - att[1]) };
          });
        });
      }, pt(0, -8, 0, 90));
      verifier(carte2.avance > 2.9 && carte2.dLat < 1 && carte2.dLng < 1,
        "libre, 3 m puis fermer : la carte 2D est centrée sur la position 3D", carte2);

      // ── 10. Guidage en 3D, fiche d'un POI, « Y aller » depuis la 3D (QCM du 02/11/2026) ─────────────────
      // Sur le T fictif (principal est-ouest, secondaire vers le sud depuis son milieu). Itinéraire tracé PENDANT la
      // vue, comme depuis 🚨 : la scène le montre ; bandeau (aperçu en libre, consigne réelle en suivi) ; chevrons.
      const POIS_V3D = [
        Object.assign({ id: "Salle v3d", nom: "Salle v3d", uid: "pt_v3d_salle", level: 0, tags: ["salle"] }, pt(0, 7, 0.6)),
        Object.assign({ id: "Salle haut v3d", nom: "Salle haut v3d", uid: "pt_v3d_haut", level: 1, tags: ["salle"] },
          pt(0, 4, -5.4))
      ];
      await page.evaluate(function (pois) {
        window.__v3dPointsAvant = window.getEditorPoints().slice();
        window.setEditorPoints(window.__v3dPointsAvant.concat(pois));
        window.setRoads(window.getRoads().filter(function (r) { return r.type !== "itinerary"; }));
        if (window.getTrackingActif()) window.stopTracking();
        window.ktaSetActiveLevel(0);
        try { localStorage.removeItem("myktamap_guidage_v1"); } catch (err) { /* réglage « Auto » par défaut */ }
      }, POIS_V3D);
      // Attend un itinéraire différent de `avant` (référence des points), puis une image de la vue.
      const attendreIti = async function () {
        await attendre(page, function () {
          const r = (window.getRoads() || []).find(function (x) { return x && x.type === "itinerary"; });
          return !!r && r.points !== window.__v3dItiAvant;
        }, 15000).catch(function () {});
        await page.waitForTimeout(500);
      };
      const noterIti = function () {
        return page.evaluate(function () {
          const r = (window.getRoads() || []).find(function (x) { return x && x.type === "itinerary"; });
          window.__v3dItiAvant = r ? r.points : null;
        });
      };
      const ga0 = await page.evaluate(function (a) {
        return window.KtaVue3D.ouvrir({ depart: a }).then(function () {
          const e = window.KtaVue3D.etat();
          return { rubans: e.rubans.itinerary || 0, bandeau: e.bandeau.affiche, chevrons: e.chevrons, mode: e.mode };
        });
      }, pt(0, -10, 0, 90));
      verifier(ga0.mode === "libre" && !ga0.rubans && !ga0.bandeau && !ga0.chevrons,
        "sans itinéraire : ni ruban, ni bandeau, ni chevrons", ga0);
      await noterIti();
      await page.evaluate(function (a) {
        window.itineraireYAller(a.c.x, a.c.y, "Cible v3d", { origine: { x: a.o.x, y: a.o.y, level: 0 } });
      }, { c: pt(0, 0, 10), o: pt(0, -10, 0) });
      await attendreIti();
      const ga1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat(), b = document.querySelector("#kta-vue3d .kta-v3d-bandeau");
        const ap = window.ItiGuidage.apercu(e.pos, { cap: e.cap });
        return { rubans: e.rubans.itinerary || 0, bandeau: e.bandeau, chevrons: e.chevrons, visibles: e.chevronsVisibles,
          marque: !!(b && b.querySelector(".kta-v3d-guid-apercu")), attendu: ap.principal,
          texte: b ? b.textContent : "", marqueTexte: window.I18n.t("vue3d.apercu"),
          haut: document.querySelector("#kta-vue3d .kta-v3d-haut").getBoundingClientRect().bottom,
          bTop: b ? b.getBoundingClientRect().top : 0 };
      });
      verifier(ga1.rubans > 0, "itinéraire tracé pendant la vue : la scène le montre (kta:itineraireChange)", ga1.rubans);
      verifier(ga1.bandeau.affiche && ga1.bandeau.apercu && ga1.marque && ga1.bandeau.principal === ga1.attendu &&
        ga1.attendu && ga1.texte.indexOf(ga1.marqueTexte) >= 0 && ga1.bTop >= ga1.haut,
        "libre : bandeau sous la rangée du haut, consigne d'aperçu marquée « " + ga1.marqueTexte + " »", ga1);
      verifier(ga1.chevrons > 0 && ga1.visibles, "chevrons au sol sur le ruban (" + ga1.chevrons + ")", ga1);
      await capture(page, "guidage-apercu");
      // Le bandeau ne descend pas à chaque relecture (il se cale sous la rangée seule).
      const stableB = await page.evaluate(function () {
        const b = document.querySelector("#kta-vue3d .kta-v3d-bandeau"), t0 = b.getBoundingClientRect().top;
        window.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("resize"));
        return Math.abs(b.getBoundingClientRect().top - t0);
      });
      verifier(stableB < 1, "bandeau à la même place après deux redimensionnements", stableB);
      // Suivi : la consigne réelle du tracker (celle du bandeau 2D, ItiGuidage.etat()), sans la marque.
      const ga2 = await page.evaluate(function (a) {
        window.startTracking();
        window.recalerTrackerSurPoint(a.x, a.y, 0);
        window.__v3dCapG = window.getPlanRelHeading;
        window.getPlanRelHeading = function () { return 90; };
        window.KtaVue3D.suivre();
        window.ItiGuidage.rafraichir();
        return new Promise(function (r) {
          setTimeout(function () {
            const e = window.KtaVue3D.etat(), st = window.ItiGuidage.etat();
            r({ mode: e.mode, bandeau: e.bandeau, reel: st.visible ? st.principal : null, chevrons: e.chevrons });
          }, 1300);
        });
      }, pt(0, -10, 0));
      verifier(ga2.mode === "suivi" && ga2.bandeau.affiche && !ga2.bandeau.apercu && ga2.reel &&
        ga2.bandeau.principal === ga2.reel && ga2.chevrons > 0, "suivi : la consigne réelle du guidage, sans « Aperçu »", ga2);
      // Toucher un panneau de POI → sa fiche de la carte (sans ✏️ / 🗑️ : la carte est dessous). Le POI jonction
      // reste derrière (le toucher d'un POI jonction garde son passage 🪜).
      await page.evaluate(function (a) {
        window.KtaVue3D.basculerSuivi();
        window.KtaVue3D.placer(a.x, a.y, 90);
      }, pt(0, 1, 0, 90));
      await page.waitForTimeout(400);
      const visePoi = async function (nom) {
        return page.evaluate(function (n) {
          const q = window.KtaVue3D.etat().panneaux.filter(function (p) { return p.nom === n && p.visible; })[0];
          return q ? q.ecran : null;
        }, nom);
      };
      let viseP = await visePoi("Salle v3d");
      if (viseP) await page.mouse.click(viseP.x, viseP.y);
      await page.waitForTimeout(300);
      const fi1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat(), f = document.querySelector("#kta-vue3d .kta-v3d-fiche");
        return { fiche: e.fiche, aller: !!(f && f.querySelector(".kta-popup-point .kta-popup-btn-aller")),
          ici: !!(f && f.querySelector(".kta-popup-btn-here")), etape: !!(f && f.querySelector(".kta-popup-btn-add")),
          favori: !!(f && f.querySelector(".kta-popup-btn-fav")), edition: !!(f && f.querySelector(".kta-popup-btn-edit, .kta-popup-btn-delete")),
          niveau: e.niveau };
      });
      verifier(!!viseP && fi1.fiche && fi1.fiche.nom === "Salle v3d" && fi1.aller && fi1.ici && fi1.etape && fi1.favori &&
        !fi1.edition, "toucher le panneau d'un POI : sa fiche de la carte (Y aller, Je suis ici, étape, favori)", fi1);
      await capture(page, "fiche-poi");
      await page.keyboard.press("Escape");
      const fi2 = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { ouvert: e.ouvert, fiche: e.fiche }; });
      verifier(fi2.ouvert && !fi2.fiche, "Échap ferme d'abord la fiche, la vue reste", fi2);
      // « Y aller » de la fiche, mode libre, tracker actif : départ de la position 3D (niveau compris), tracker non
      // recalé. Sur un plan multi-niveau, on passe au niveau 1 par le POI jonction avant.
      const hautN = G.multi;
      const BB = hautN ? pt(0, -2, -6, 90) : pt(0, 1, 0, 90);
      await page.evaluate(function (a) {
        const K = window.KtaVue3D;
        if (a.hautN) { K.placer(a.pres.x, a.pres.y, 90); K.changerNiveau("haut"); }
        K.placer(a.BB.x, a.BB.y, 90);
      }, { hautN: hautN, pres: pt(0, -7, 0, 90), BB: BB });
      await page.waitForTimeout(400);
      viseP = await visePoi(hautN ? "Salle haut v3d" : "Salle v3d");
      if (viseP) await page.mouse.click(viseP.x, viseP.y);
      await page.waitForTimeout(300);
      await noterIti();
      const trAvant = await page.evaluate(function () { return { p: window.getTrackingPosition(), n: window.getTrackerLevel() }; });
      await page.locator("#kta-vue3d .kta-v3d-fiche .kta-popup-btn-aller").click();
      await page.waitForTimeout(300);
      if (await page.locator("#kta-iti-confirm-ok").count()) await page.locator("#kta-iti-confirm-ok").click();
      await attendreIti();
      const ya1 = await page.evaluate(function () {
        const r = window.getRoads().find(function (x) { return x && x.type === "itinerary"; });
        const e = window.KtaVue3D.etat();
        return { wp0: r && r.waypoints[0], p0: r && r.points[0], pos: e.pos, niveau: e.niveau, fiche: e.fiche,
          tr: window.getTrackingPosition(), trN: window.getTrackerLevel(), rubans: e.rubans.itinerary || 0 };
      });
      verifier(ya1.wp0 && Math.hypot(ya1.wp0.x - BB.x, ya1.wp0.y - BB.y) < 0.5 && (hautN ? ya1.wp0.level === 1 : true) &&
        (hautN ? ya1.p0 && ya1.p0.level === 1 : true) && !ya1.fiche,
        "« Y aller » en libre : départ de la position 3D" + (hautN ? ", niveau 1 compris" : "") + ", fiche refermée", ya1);
      verifier(Math.hypot(ya1.tr.x - trAvant.p.x, ya1.tr.y - trAvant.p.y) < 0.01 && ya1.trN === trAvant.n,
        "le tracker n'est pas recalé", { avant: trAvant, apres: { p: ya1.tr, n: ya1.trN } });
      verifier(ya1.rubans > 0, "le nouvel itinéraire est dans la scène", ya1.rubans);
      // Tracker arrêté : « D'où pars-tu ? » avec « Ici » en premier ; « Ici » recale le tracker à la position 3D
      // (niveau compris) et l'itinéraire en part.
      await page.evaluate(function () { window.stopTracking(); window.getPlanRelHeading = window.__v3dCapG; });
      await page.waitForTimeout(200);
      viseP = await visePoi(hautN ? "Salle haut v3d" : "Salle v3d");
      if (viseP) await page.mouse.click(viseP.x, viseP.y);
      await page.waitForTimeout(300);
      await noterIti();
      await page.locator("#kta-vue3d .kta-v3d-fiche .kta-popup-btn-aller").click();
      await page.waitForTimeout(300);
      const qa3 = await page.evaluate(function () {
        const ov = document.getElementById("kta-iti-depart");
        return ov ? Array.from(ov.querySelectorAll("[data-kta-confirm-choix]")).map(function (r) { return r.value; }) : null;
      });
      verifier(qa3 && qa3[0] === "ici" && qa3.indexOf("derniere") > 0 && qa3.indexOf("repositionner") > 0,
        "tracker arrêté : « D'où pars-tu ? », « Ici » en premier", qa3);
      if (qa3) {
        await page.locator('#kta-iti-depart [data-kta-confirm-choix="ici"]').check();
        await page.locator("#kta-iti-depart #kta-confirm-oui").click();
        await page.waitForTimeout(300);
        if (await page.locator("#kta-iti-confirm-ok").count()) await page.locator("#kta-iti-confirm-ok").click();
        await attendreIti();
      }
      const ya2 = await page.evaluate(function () {
        const r = window.getRoads().find(function (x) { return x && x.type === "itinerary"; });
        return { wp0: r && r.waypoints[0], tr: window.getTrackingPosition(), trN: window.getTrackerLevel(),
          confirmee: window.getTrackingPositionEtat().confirmee };
      });
      verifier(ya2.wp0 && Math.hypot(ya2.wp0.x - BB.x, ya2.wp0.y - BB.y) < 0.5 && Math.hypot(ya2.tr.x - BB.x, ya2.tr.y - BB.y) < 0.01 &&
        (hautN ? ya2.trN === 1 && ya2.wp0.level === 1 : true) && ya2.confirmee,
        "« Ici » : tracker recalé à la position 3D" + (hautN ? " et au niveau 1" : "") + ", l'itinéraire en part", ya2);
      await page.evaluate(function () {
        return window.KtaVue3D.fermer().then(function () {
          window.setRoads(window.getRoads().filter(function (r) { return r.type !== "itinerary"; }));
          window.setEditorPoints(window.__v3dPointsAvant);
          window.ktaSetActiveLevel(0);
        });
      });
      // Itinéraire multi-niveau (niveau porté par chaque point) : au −1, seul son morceau du −1 est dessiné.
      const iti = await page.evaluate(function (a) {
        const C = window.APP_CONFIG, av = { m: C.multiLevel, l: C.activeLevel }, sc = C.scale;
        C.multiLevel = true; C.activeLevel = -1;
        window.setRoads([{ type: "itinerary", points: [
          { x: a.x, y: a.y, level: 0 }, { x: a.x + 2 * sc, y: a.y, level: 0 },
          { x: a.x + 2 * sc, y: a.y + 1, level: -1 }, { x: a.x + 6 * sc, y: a.y, level: -1 },
          { x: a.x + 9 * sc, y: a.y, level: -1 }] }]);
        return window.KtaVue3D.ouvrir({ depart: a }).then(function () {
          const e = window.KtaVue3D.etat();
          const r = { niveau: e.niveau, roads: e.compte.roads };
          return window.KtaVue3D.fermer().then(function () {
            C.multiLevel = av.m; C.activeLevel = av.l; window.setRoads([]);
            return r;
          });
        });
      }, pt(0, -8, 0, 90));
      verifier(iti.niveau === -1 && iti.roads === 1,
        "itinéraire multi-niveau : au −1, son morceau du −1 est dessiné (plus d'itinéraire disparu)", iti);
      // ── 11. Mode mixte : une galerie qui débouche sur une chambre (fronts de taille et piliers), fictive ─────────
      // Galerie principale d'ouest en est (x de -30 à 22 m), branche secondaire en T à x = -15 ; chambre de x = 0 à
      // 24 m, z de -10 à 10, bordée de fronts (ouverture de 3 m à l'ouest pour la galerie), six piliers de 2 × 2 m à
      // z = ±3,5. Rendu par défaut (plan de test sans choix) : mixte.
      const MX = await page.evaluate(function () {
        const sc = window.APP_CONFIG.scale, W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
        window._currentLoadedPlanId = "v3d-checkup-mixte";
        const ox = W / 2 / sc, oz = H / 2 / sc, P = function (x, z) { return { x: (ox + x) * sc, y: (oz + z) * sc }; };
        window.setRoads([
          { uid: "rd_mx_p", type: "principal", level: 0, points: [P(-30, 0), P(22, 0)] },
          { uid: "rd_mx_s", type: "secondaire", level: 0, points: [P(-15, 0), P(-15, -20)] }
        ]);
        const carre = function (cx, cz, r) { return [P(cx - r, cz - r), P(cx + r, cz - r), P(cx + r, cz + r), P(cx - r, cz + r)]; };
        const st = [{ uid: "st_mx_f", type: "front-1", level: 0,
          points: [P(0, -1.5), P(0, -10), P(24, -10), P(24, 10), P(0, 10), P(0, 1.5)] }];
        [6, 12, 18].forEach(function (x) {
          [-3.5, 3.5].forEach(function (z) {
            st.push({ uid: "st_mx_" + x + "_" + z, type: "pilier-1", level: 0, points: carre(x, z, 1) });
          });
        });
        window.setStructures(st);
        window.setZones([
          { uid: "zn_mx_t", type: "eau", level: 0, points: [P(-25, -3), P(-23, -3), P(-23, 3), P(-25, 3)] },
          { uid: "zn_mx_c", type: "eau", level: 0, points: [P(14, -1), P(16, -1), P(16, 1), P(14, 1)] }
        ]);
        window.setEditorPoints([
          Object.assign({ id: "POI danger chambre v3d", level: 0, tags: ["danger"] }, P(3, 1.5)),
          Object.assign({ id: "POI danger tube v3d", level: 0, tags: ["danger"] }, P(-20, 5)),
          Object.assign({ id: "POI favori v3d", level: 0, tags: ["info"] }, P(-6, -0.5))
        ]);
        window.Favoris.add({ pointId: "POI favori v3d", nom: "POI favori v3d", x: P(-6, -0.5).x, y: P(-6, -0.5).y });
        window.KtaGalerie.invalider();
        const m = window.KtaGalerie.modele(0, true);
        return { sc: sc, ox: ox, oz: oz, pref: window.getPlanRenduVue3D(), seuil: window.KtaGalerie.SEUIL_CHAMBRE_M,
          modele: { pieces: m.pieces.length, chambres: m.chambres, ouverts: m.ouverts, dalles: m.dalles,
            ms: +m.msConstruction.toFixed(1) },
          structures: st.map(function (s) {
            return { ligne: s.type === "front-1", pts: s.points.map(function (q) { return [q.x / sc - ox, q.y / sc - oz]; }) };
          }) };
      });
      const mq = function (x, z, cap) {
        return { x: (MX.ox + x) * MX.sc, y: (MX.oz + z) * MX.sc, cap: cap === undefined ? 0 : cap };
      };
      verifier(MX.pref === null && MX.seuil === 3 && MX.modele.ouverts >= 1 && MX.modele.chambres >= 1 &&
        MX.modele.dalles === 1, "mixte : modèle (dalle du T en tube, nœuds en chambre, bout ouvert) en " + MX.modele.ms +
        " ms", MX.modele);
      const sc1 = await page.evaluate(function (a) {
        return window.KtaVue3D.ouvrir({ depart: a.dep, tuiles: false }).then(function () {
          const e = window.KtaVue3D.etat(), ps = window.KtaVue3D.parois();
          const rel = ps.map(function (s) { return [s[0] - a.ox, s[1] - a.oz, s[2] - a.ox, s[3] - a.oz]; });
          return { rendu: e.rendu, bouton: e.boutonRendu, parois: rel, yMax: e.yMax, zonesTube: e.zonesTube,
            eau: e.zonesDecoupees.eau || 0, poiTube: e.poiTube, halos: e.halos,
            panneaux: e.panneaux.map(function (q) {
              return { nom: q.nom, x: +(q.x - a.ox).toFixed(2), z: +(q.z - a.oz).toFixed(2), danger: q.danger,
                favori: q.favori, bord: q.bord, halo: q.halo,
                haloXZ: q.haloXZ ? [+(q.haloXZ[0] - a.ox).toFixed(2), +(q.haloXZ[1] - a.oz).toFixed(2)] : null };
            }) };
        });
      }, { dep: mq(-12, 0, 90), ox: MX.ox, oz: MX.oz });
      // Géométrie des parois (m, relatives) : où elles sont, et jamais à travers une structure.
      const coupe = function (s, t) {
        const dx = s[2] - s[0], dz = s[3] - s[1], ex = t[2] - t[0], ez = t[3] - t[1], d = dx * ez - dz * ex;
        if (Math.abs(d) < 1e-12) return false;
        const rx = t[0] - s[0], rz = t[1] - s[1], u = (rx * ez - rz * ex) / d, v = (rx * dz - rz * dx) / d;
        return u >= 0 && u <= 1 && v >= 0 && v <= 1;
      };
      const bords = [];
      MX.structures.forEach(function (s) {
        const n = s.pts.length, fin = s.ligne ? n - 1 : n;
        for (let i = 0; i < fin; i++) {
          const p = s.pts[i], q = s.pts[(i + 1) % n];
          bords.push([p[0], p[1], q[0], q[1]]);
        }
      });
      const distSeg = function (x, z, s) {
        const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz;
        const t = l2 ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / l2)) : 0;
        return Math.hypot(x - s[0] - t * dx, z - s[1] - t * dz);
      };
      const xMax = Math.max.apply(null, sc1.parois.map(function (s) { return Math.max(s[0], s[2]); }));
      const traversent = sc1.parois.filter(function (s) { return bords.some(function (b) { return coupe(s, b); }); });
      const procheStruct = Math.min.apply(null, sc1.parois.map(function (s) {
        return Math.min.apply(null, bords.map(function (b) {
          return Math.min(distSeg(s[0], s[1], b), distSeg(s[2], s[3], b), distSeg(b[0], b[1], s), distSeg(b[2], b[3], s));
        }));
      }));
      const enTravers = sc1.parois.filter(function (s) { return coupe(s, [-3.5, 0, 23, 0]); });
      verifier(sc1.rendu === "mixte" && sc1.parois.length >= 4 && xMax < -2.4 && xMax > -3.6,
        "mixte : tube avant la chambre, aucune paroi dans la chambre (paroi la plus à l'est à x = " + xMax.toFixed(2) +
        " m, entrée à 0)", { parois: sc1.parois.length, xMax: xMax });
      verifier(traversent.length === 0 && procheStruct > 1.5,
        "mixte : aucune paroi à travers un pilier ou un front (la plus proche à " + procheStruct.toFixed(2) + " m)",
        traversent.slice(0, 3));
      verifier(enTravers.length === 0 && MX.modele.ouverts >= 1,
        "mixte : le tube débouche OUVERT dans la chambre (aucune paroi en travers de l'axe, bout sans fond)", enTravers);
      verifier(Math.abs(sc1.yMax.opaque - 2) < 1e-6 && sc1.zonesTube === 1 && sc1.eau >= 1,
        "mixte : piliers et fronts dressés ; eau du tube découpée (règle galerie), eau de la chambre entière", sc1);
      const panMx = function (n) { return sc1.panneaux.filter(function (q) { return q.nom === n; })[0] || null; };
      const dCh = panMx("POI danger chambre v3d"), dTu = panMx("POI danger tube v3d"), fav = panMx("POI favori v3d");
      verifier(!!dCh && dCh.x === 3 && dCh.z === 1.5 && !!dTu && dTu.x === -20 && Math.abs(dTu.z - 1.17) < 0.02 &&
        sc1.poiTube >= 1, "mixte : POI de la chambre à sa place (règle structures), POI à 5 m du tube ramené contre la " +
        "paroi (règle galerie)", { dCh: dCh, dTu: dTu });
      const rouge = await page.evaluate(function () {
        return getComputedStyle(document.documentElement).getPropertyValue("--kta-erreur").trim();
      });
      verifier(!!dCh && dCh.danger && dCh.halo && dCh.haloXZ[0] === 3 && dCh.haloXZ[1] === 1.5 && dTu.halo &&
        dTu.haloXZ[1] === dTu.z && sc1.halos === 2 && /^#ff8c8c$/i.test(dCh.bord) && !fav.danger && !fav.halo,
        "danger : liseré et halo au sol rouges de la charte (--kta-erreur sombre), sous le panneau ; pas sur un autre POI",
        { dCh: dCh, dTu: dTu, rouge: rouge });
      verifier(!!fav && fav.favori && !dCh.favori, "favori : ⭐ sur son panneau, pas sur les autres", fav);
      if (CAPTURES) {
        await page.evaluate(function (d) { return window.KtaVue3D.fermer().then(function () {
          return window.KtaVue3D.ouvrir({ depart: d });
        }); }, mq(-11, 0, 90));
        await page.waitForTimeout(800);
        await capture(page, "mixte-galerie-chambre");
        await page.evaluate(function () { window.KtaVue3D.basculerVue(); });
        await page.waitForTimeout(500);
        await capture(page, "mixte-galerie-chambre-plongee");
      }
      // Collisions : paroi du tube, entrée dans la chambre, pilier ; dans la chambre, aucune paroi n'arrête.
      const mc = await page.evaluate(function (a) {
        const K = window.KtaVue3D, acc = window.ktaEstAccessible, r = {};
        window.ktaEstAccessible = function () { return true; };   // image de collision du plan hors jeu ici
        const rel = function () { const p = K.etat().pos; return [+(p.x / a.sc - a.ox).toFixed(2), +(p.y / a.sc - a.oz).toFixed(2)]; };
        const marcher = function (n) { for (let i = 0; i < n; i++) K.avancer(0.2); };
        return K.fermer().then(function () { return K.ouvrir({ depart: a.t }); }).then(function () {
          K.placer(a.t.x, a.t.y, 0); marcher(20); r.paroi = rel();
          K.placer(a.t.x, a.t.y, 90); marcher(70); r.entree = rel();
          K.placer(a.c.x, a.c.y, 0); marcher(25); r.pilier = rel();
          K.placer(a.l.x, a.l.y, 0); marcher(30); r.libre = rel();
          r.butees = K.etat().butees;
          window.ktaEstAccessible = acc;
          return K.fermer();
        }).then(function () { return r; });
      }, { t: mq(-10, 0), c: mq(6, 0), l: mq(2, 0), sc: MX.sc, ox: MX.ox, oz: MX.oz });
      verifier(mc.paroi[1] > -0.9 && mc.paroi[1] < -0.75, "mixte : on bute contre la paroi du tube (" + mc.paroi[1] +
        " m de l'axe, paroi à 1,25 m)", mc);
      verifier(mc.entree[0] > 3.5, "mixte : on entre dans la chambre par le bout ouvert (x = " + mc.entree[0] + " m)", mc);
      verifier(mc.pilier[1] > -2.2 && mc.pilier[1] < -1.9, "mixte : dans la chambre, on bute contre un pilier (" +
        mc.pilier[1] + " m, face à 2,5 m)", mc);
      verifier(mc.libre[1] < -5.5, "mixte : dans la chambre, aucune paroi n'arrête (6 m vers le nord entre front et " +
        "piliers)", mc);
      // Trois états retenus PAR PLAN : un choix sur ce plan ne touche pas un autre.
      const tri = await page.evaluate(function (d) {
        const K = window.KtaVue3D, r = [];
        return K.ouvrir({ depart: d }).then(function () {
          for (let i = 0; i < 3; i++) {
            document.querySelector('#kta-vue3d [data-v3d="rendu"]').dispatchEvent(new PointerEvent("pointerdown",
              { bubbles: true }));
            r.push([K.etat().rendu, window.getPlanRenduVue3D(), K.parois().length]);
          }
          K.basculerRendu("structures");
          return K.fermer();
        }).then(function () { return K.ouvrir({ depart: d }); }).then(function () {
          const out = { suite: r, rouvert: K.etat().rendu, autre: window.getPlanRenduVue3D("v3d-checkup-galerie") };
          K.basculerRendu("mixte");
          return K.fermer().then(function () { return out; });
        });
      }, mq(-12, 0, 90));
      verifier(JSON.stringify(tri.suite.map(function (q) { return q[0] + "/" + q[1]; })) ===
        JSON.stringify(["structures/structures", "galerie/galerie", "mixte/mixte"]) && tri.suite[0][2] === 0 &&
        tri.suite[1][2] > tri.suite[2][2] && tri.rouvert === "structures" && tri.autre === "galerie",
        "trois états : mixte → structures → galerie → mixte, retenus pour ce plan (l'autre plan garde le sien)", tri);

      // ── 12. Membres, repères et itinéraires d'une extension (prise neutre, extension FACTICE) ─────────────────
      const eq0 = await page.evaluate(function (d) {
        return window.KtaVue3D.ouvrir({ depart: d }).then(function () {
          const e = window.KtaVue3D.etat();
          return { equipe: e.equipe, membres: e.membres.length, version: typeof window.KtaPresences.version };
        });
      }, mq(-12, 0, 90));
      verifier(eq0.version === "function" && eq0.equipe.membres === 0 && eq0.equipe.reperes === 0 &&
        eq0.equipe.itineraires === 0 && eq0.membres === 0, "sans extension : ni membre, ni repère, ni itinéraire en 3D",
        eq0);
      const eq1 = await page.evaluate(function (a) {
        const X = window.KtaExtensions, P = function (x, z) { return [(a.ox + x) * a.sc, (a.oz + z) * a.sc]; };
        // presence.vue3d capte la place libre remise par la 3D (§ 12 bis) ; le partage suit __v3dPartage.
        window.__v3dPub = [];
        X.register({ nom: "v3d-factice", apiVersion: 1, presence: { actif: function () { return window.__v3dPartage === true; },
          basculer: function () {}, vue3d: function (p) { window.__v3dPub.push(p); } } });
        const m0 = P(-8, 0.5), m1 = P(-6, 0);
        X.afficherPresences([
          { id: "membre-a", pseudo: "Membre A", x: m0[0], y: m0[1], niveau: 0 },
          { id: "membre-b", pseudo: "Membre B", x: m1[0], y: m1[1], niveau: 1 }
        ]);
        // afficherReperes exige le plan prêt : le plan du relevé fictif, le temps de l'appel.
        const id = window._currentLoadedPlanId;
        window._currentLoadedPlanId = a.planReel;
        const r = P(-9, -0.5);
        const nr = X.afficherReperes("v3dtest", [{ id: "rep-1", x: r[0], y: r[1], niveaux: [0], teinte: "ok",
          symbole: "✓", titre: "Repère test" }]);
        window._currentLoadedPlanId = id;
        const i0 = P(-14, 0.4), i1 = P(-4, 0.4);
        X.afficherItineraires([{ id: "iti-1", pseudo: "Membre A", points: [[i0[0], i0[1], 0], [i1[0], i1[1], 0]] }]);
        return new Promise(function (res) { setTimeout(res, 200); }).then(function () {
          const e = window.KtaVue3D.etat();
          return { nr: nr, equipe: e.equipe, membres: e.membres.map(function (q) {
            return [+(q.x - a.ox).toFixed(2), +(q.z - a.oz).toFixed(2)];
          }), multi: window.APP_CONFIG.multiLevel === true, noms: e.panneaux.filter(function (q) {
            return q.genre !== "poi";
          }).map(function (q) { return q.genre + ":" + q.nom; }) };
        });
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc, planReel: G.planReel });
      await capture(page, "mixte-equipe");
      verifier(eq1.equipe.membres === (eq1.multi ? 1 : 2) && eq1.membres.length === eq1.equipe.membres &&
        eq1.membres[0][0] === -8 && eq1.membres[0][1] === 0.5 && eq1.noms.indexOf("membre:Membre A") >= 0 &&
        (!eq1.multi || eq1.noms.indexOf("membre:Membre B") < 0),
        "extension factice : membre au niveau affiché en silhouette nommée à sa place ; celui d'un autre niveau absent",
        eq1);
      verifier(eq1.nr === 1 && eq1.equipe.reperes === 1 && eq1.noms.indexOf("repere:✓ Repère test") >= 0 &&
        eq1.equipe.itineraires === 1, "extension factice : repère et itinéraire partagé dessinés en 3D", eq1);
      // Toucher le panneau d'un membre ou d'un repère : rien (ce ne sont pas des POI, pas de fiche de la carte).
      const eqT = [];
      for (const nom of ["Membre A", "✓ Repère test"]) {
        const vise = await page.evaluate(function (n) {
          const q = window.KtaVue3D.etat().panneaux.filter(function (p) { return p.nom === n && p.visible; })[0];
          return q ? q.ecran : null;
        }, nom);
        if (vise) await page.mouse.click(vise.x, vise.y);
        await page.waitForTimeout(250);
        eqT.push({ nom: nom, vise: !!vise, fiche: await page.evaluate(function () {
          return !!window.KtaVue3D.etat().fiche || !!document.querySelector("#kta-vue3d .kta-v3d-fiche");
        }) });
      }
      verifier(eqT.every(function (q) { return q.vise && !q.fiche; }),
        "toucher le panneau d'un membre ou d'un repère n'ouvre aucune fiche", eqT);
      const eq2 = await page.evaluate(function (a) {
        const X = window.KtaExtensions;
        X.afficherPresences([]);
        const id = window._currentLoadedPlanId;
        window._currentLoadedPlanId = a.planReel;
        X.afficherReperes("v3dtest", []);
        window._currentLoadedPlanId = id;
        X.afficherItineraires([]);
        return new Promise(function (res) { setTimeout(res, 200); }).then(function () {
          const e = window.KtaVue3D.etat();
          return window.KtaVue3D.fermer().then(function () { return e.equipe; });
        });
      }, { planReel: G.planReel });
      verifier(eq2.membres === 0 && eq2.reperes === 0 && eq2.itineraires === 0,
        "listes vidées par l'extension : la 3D les retire", eq2);
      await page.evaluate(function () {
        window.Favoris.remove("POI favori v3d");
        window.setStructures([]);
      });

      // ── 12 bis. Place libre montrée à l'équipe (prise presence.vue3d de l'extension FACTICE) ────────────────
      // Rien sans partage ; libre et déplacé à la main → appels espacés (0,5 m ou 10°), jamais un par image ; suivi
      // → null ; fermeture → null ; le tracker n'est jamais déplacé. Et la place d'un autre « en 3D » est marquée.
      const pub = await page.evaluate(async function (d) {
        const K = window.KtaVue3D, r = {}, pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const n = function () { return window.__v3dPub.length; };
        const trackerAvant = window.getTrackingActif();
        if (!trackerAvant) window.startTracking();
        window.recalerTrackerSurPoint(d.x, d.y, window.APP_CONFIG.activeLevel);
        const tr0 = Object.assign({}, window.getTrackingPosition());
        window.__v3dPartage = false; window.__v3dPub = [];
        await K.ouvrir({ depart: d });
        await pause(200);
        r.avantPas = n();
        K.avancer(1);
        await pause(250);
        r.sansPartage = { n: n(), etat: K.etat().presence.publications };
        window.__v3dPartage = true;
        await pause(250);
        r.premier = { n: n(), p: window.__v3dPub[0] || null };
        await pause(600);
        r.immobile = n();
        const e0 = K.etat(), x0 = e0.pos.x, y0 = e0.pos.y, i0 = e0.images;
        for (let i = 0; i < 40; i++) { K.avancer(0.05); await pause(16); }
        await pause(150);
        const e1 = K.etat();
        r.marche = { appels: n() - r.premier.n, images: e1.images - i0, m: Math.hypot(e1.pos.x - x0, e1.pos.y - y0) / d.sc };
        const n1 = n();
        K.tourner(6); await pause(150);
        r.tourne6 = n() - n1;
        K.tourner(6); await pause(150);
        r.tourne12 = n() - n1;
        r.dernier = window.__v3dPub[n() - 1];
        r.capVue = Math.round(K.etat().cap) % 360;
        K.suivre();
        await pause(250);
        r.suivi = { mode: K.etat().mode, dernier: window.__v3dPub[n() - 1], n: n() };
        K.basculerSuivi();
        await pause(250);
        r.libreSansPas = n() - r.suivi.n;
        K.avancer(0.6);
        await pause(250);
        r.relibre = window.__v3dPub[n() - 1];
        const tr1 = window.getTrackingPosition();
        r.trackerBouge = Math.hypot(tr1.x - tr0.x, tr1.y - tr0.y);
        window.stopTracking();
        await K.fermer();
        r.ferme = { dernier: window.__v3dPub[n() - 1], n: n() };
        // Un autre membre « en 3D » : silhouette marquée, son pseudo suivi de « 3D ».
        window.KtaExtensions.afficherPresences([{ id: "membre-3d", pseudo: "Membre C", x: d.x + 3 * d.sc, y: d.y,
          niveau: window.APP_CONFIG.activeLevel, source: "vue3d", cap: 45 }]);
        await K.ouvrir({ depart: d });
        await pause(250);
        const e3 = K.etat();
        r.autre = { equipe: e3.equipe, membres: e3.membres, noms: e3.panneaux.filter(function (q) { return q.genre === "membre"; })
          .map(function (q) { return q.nom; }), marque: window.I18n.t("presence.vue3d.marque") };
        window.KtaExtensions.afficherPresences([]);
        await K.fermer();
        window.__v3dPartage = false;
        if (trackerAvant) window.startTracking();
        return r;
      }, Object.assign({ sc: MX.sc }, mq(-12, 0, 90)));
      verifier(pub.avantPas === 0 && pub.sansPartage.n === 0 && pub.sansPartage.etat === 0,
        "🔒 place libre : rien remis sans partage de position, ni avant un déplacement à la main", pub);
      verifier(pub.premier.n === 1 && pub.premier.p && pub.premier.p.source === "vue3d" && pub.immobile === 1,
        "partage allumé en libre : une place remise (source vue3d), puis rien tant qu'on ne bouge pas", pub.premier);
      verifier(pub.marche.images >= 10 && pub.marche.m > 1 && pub.marche.appels >= 1 &&
        pub.marche.appels <= Math.ceil(pub.marche.m / 0.5) + 1,
        "en marchant : une remise tous les 0,5 m environ, jamais une par image", pub.marche);
      verifier(pub.tourne6 === 0 && pub.tourne12 === 1 && pub.dernier && pub.dernier.cap === pub.capVue,
        "en tournant : rien sous 10°, une remise au-delà, cap arrondi au degré", pub);
      verifier(pub.dernier && Math.round(pub.dernier.x * 10) === pub.dernier.x * 10 &&
        Math.round(pub.dernier.y * 10) === pub.dernier.y * 10, "place arrondie (0,1 px)", pub.dernier);
      verifier(pub.suivi.mode === "suivi" && pub.suivi.dernier === null && pub.libreSansPas === 0,
        "suivi → null (retour au tracker) ; repasser en libre sans bouger ne remet rien", pub.suivi);
      verifier(pub.relibre && pub.relibre.source === "vue3d" && pub.ferme.dernier === null,
        "libre à nouveau → place remise ; fermeture → null", pub);
      verifier(pub.trackerBouge < 0.01, "le tracker n'est pas déplacé par la place libre", pub.trackerBouge);
      verifier(pub.autre.equipe.membres === 1 && pub.autre.equipe.membres3d === 1 && pub.autre.membres[0].vue3d === true &&
        pub.autre.noms[0] === "Membre C · " + pub.autre.marque,
        "membre « en 3D » d'une extension : silhouette marquée, pseudo suivi de « 3D »", pub.autre);

      // ── 13. Jamais coincé : accroche d'un POI jonction posée à 3 m d'un tube (dans la roche) ─────────────────
      // Après le passage, la place est ramenée dans le tube et l'on avance, en galerie et en mixte ; partie d'un
      // pilier (aucun pas possible), un pas qui rapproche de la galerie passe.
      if (G.multi) {
        const nc = await page.evaluate(async function (a) {
          const K = window.KtaVue3D, acc = window.ktaEstAccessible, P = function (x, z) {
            return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc };
          };
          window.ktaEstAccessible = function () { return true; };
          window.ktaSetActiveLevel(0);
          window.setRoads([
            { uid: "rd_nc_0", type: "principal", level: 0, points: [P(-20, 0), P(0, 0)] },
            { uid: "rd_nc_1", type: "principal", level: 1, points: [P(-20, -6), P(0, -6)] }
          ]);
          const ac = P(-8, -9);
          window.setEditorPoints([Object.assign({ id: "POI jonction nc v3d", level: 0, tags: ["jes"], niveaux: [0, 1],
            accroches: [{ level: 1, x: ac.x, y: ac.y }] }, P(-10, 0))]);
          window.setStructures([{ uid: "st_nc", type: "pilier-1", level: 1,
            points: [P(-15, -13), P(-13, -13), P(-13, -11), P(-15, -11)] }]);
          window.KtaGalerie.invalider();
          const r = {};
          for (const rendu of ["galerie", "mixte"]) {
            window.setPlanRenduVue3D(null, rendu);
            window.ktaSetActiveLevel(0);   // la fermeture précédente a mis la carte au niveau de la 3D
            const d = P(-9.5, 0);
            await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
            const ok = K.changerNiveau("haut"), e = K.etat();
            const z0 = e.pos.y / a.sc - a.oz, x0 = e.pos.x / a.sc - a.ox;
            for (let i = 0; i < 10; i++) K.avancer(0.2);
            const x1 = K.etat().pos.x / a.sc - a.ox;
            r[rendu] = { passe: ok, niveau: e.niveau, z: +z0.toFixed(2), degage: e.degagements, avance: +(x1 - x0).toFixed(2) };
            if (rendu === "mixte") {
              const c = P(-14, -12);
              K.placer(c.x, c.y, 180);   // au centre du pilier : vers le sud, on s'approche de la galerie
              const yA = K.etat().pos.y;
              for (let i = 0; i < 5; i++) K.avancer(0.2);
              r.pilier = +((K.etat().pos.y - yA) / a.sc).toFixed(2);
            }
            await K.fermer();
          }
          window.setPlanRenduVue3D(null, "mixte");
          window.ktaEstAccessible = acc;
          window.setStructures([]); window.setEditorPoints([]);
          return r;
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        verifier(nc.galerie.passe && nc.galerie.niveau === 1 && Math.abs(nc.galerie.z + 6) < 0.05 &&
          nc.galerie.degage === 1 && nc.galerie.avance > 1.5,
          "galerie : accroche à 3 m du tube → ramené dans le tube (axe), on avance", nc.galerie);
        verifier(nc.mixte.passe && nc.mixte.niveau === 1 && nc.mixte.avance > 1.5,
          "mixte : après le passage (accroche hors du tube), on avance", nc.mixte);
        verifier(nc.pilier > 0.5, "mixte : parti du centre d'un pilier, un pas qui rapproche de la galerie passe (" +
          nc.pilier + " m)", nc);
      } else {
        console.log("  ℹ️ plan à un niveau : passage vers une accroche hors du tube non joué");
      }

      await page.evaluate(function () {
        const s = window.__v3dEmb;
        window.getAllEmbeddedRoads = s.r; window.getAllEmbeddedZones = s.z; window.getAllEmbeddedPoints = s.p;
        window.getAllEmbeddedStructures = s.s; window._currentLoadedPlanId = s.id;
        window.setRoads([]); window.setZones([]); window.setEditorPoints(window.__v3dPoints || []);
        window.KtaGalerie.invalider();
      });
    }
    // 🩸 WebKit ne rend la place d'un contexte perdu qu'au passage du ramasse-miettes : après ~16 ouvertures
    // rapprochées il annonce « too many active WebGL contexts » et perd le plus ancien (déjà fermé). Toléré sous
    // WebKit seulement, et seulement ce message : la 21e ouverture ci-dessus prouve que la vue courante vit.
    const webkit = nav.browserType().name() === "webkit";
    const vraies = consoleErr.filter(function (t) {
      return !(webkit && /too many active WebGL contexts|loseContext: context already lost/i.test(t));
    });
    if (vraies.length !== consoleErr.length) {
      console.log("  ℹ️ WebKit : " + (consoleErr.length - vraies.length) +
        " avis de contexte en trop (ramasse-miettes différé), tolérés");
    }
    verifier(vraies.length === 0, "console : aucune erreur WebGL ni contexte en trop", vraies.slice(0, 4));
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
  console.log("🎉 CHECKUP VERT — vue 3D : chargée à la demande, scène, déplacement, butée, vues, fermeture propre.");
  process.exit(0);
})();
