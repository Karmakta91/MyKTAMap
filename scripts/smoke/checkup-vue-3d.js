#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-vue-3d.js — checkup (Playwright) : vue 3D (js/vue3d.js) sur le relevé fictif
// =====================================================================
// Rien de la 3D n'est demandé au démarrage ni au chargement du plan. Tuile 🧊 du menu Tracker grisée sans échelle
// (rien chargé, message), puis ouverte depuis la tuile : scène non vide, textes du dictionnaire, mur plus bas que
// le pilier qu'il traverse, avancer, buter contre le pilier (règle du pas du tracker), clavier, vue plongeante,
// niveau ; perte du contexte WebGL simulée (WEBGL_lose_context) puis reprise ; « Je suis ici ? » à la fermeture
// (Non = rien, Oui = tracker recalé) ; perte sans reprise = fermeture avec message ; WebGL absent = refus avec
// message ; 20 ouvertures de suite sans « Too many active WebGL contexts » ; aucune erreur de page ni de console.
// Aussi : pas rapide (appui long ▲, Maj) ; collisions sur 6 obstacles fictifs (pilier, pilier fin, mur, mur en
// ligne, front, pilier perso) sous 12 angles, pas rapides et grand pas, départ collé à une face, jugées par une
// géométrie propre au checkup ; inclinaison de la vue plongeante ; rose des vents (nord calibré ou non).
// Mesures (facultatives, objets FICTIFS générés en mémoire, jamais écrits) :
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
const PERF = process.env.KTA_V3D_PERF === "1";
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
    } else {
      // ── 1. Tuile 🧊 grisée sans échelle : rien n'est chargé, le toucher explique ────────────────────
      const grise = await page.evaluate(function () {
        const sc = window.APP_CONFIG.scale;
        window.APP_CONFIG.scale = 0;
        window.ouvrirMenuTracker();
        const tuile = tuileVue3D();
        const r = { existe: !!tuile, inactif: !!tuile && tuile.classList.contains("kta-inactif"),
          aide: tuile ? (tuile.querySelector(".kta-tracker-modal-tile-aide") || {}).textContent : null,
          attendu: window.I18n.t("vue3d.sansEchelle") };
        if (tuile) tuile.click();
        const ok = document.getElementById("kta-confirm-oui");
        r.alerte = ok ? ok.closest(".kta-readme-modal-boite").textContent : null;
        if (ok) ok.click();
        window.APP_CONFIG.scale = sc;
        return r;
        function tuileVue3D() {
          return Array.prototype.slice.call(document.querySelectorAll(".kta-tracker-modal-tile")).find(function (t) {
            return t.textContent.indexOf("🧊") >= 0;
          });
        }
      });
      verifier(grise.existe && grise.inactif && grise.aide === grise.attendu,
        "sans échelle : tuile 🧊 grisée, sa ligne d'aide dit pourquoi", grise);
      verifier(!!grise.alerte && grise.alerte.indexOf(grise.attendu) >= 0, "toucher la tuile grisée : message, pas de 3D",
        grise);
      await page.waitForTimeout(300);
      verifier(requetes3d.length === 0 && await page.evaluate(function () { return !window.KtaVue3D; }),
        "tuile grisée : rien de la 3D chargé", requetes3d);

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
        // Tracker en suivi, posé au départ : la tuile ouvre la vue là.
        window.recalerTrackerSurPoint(x, y, 0);
        if (!window.getTrackingActif()) window.startTracking();
        return { x: x, y: y, sc: sc, multi: window.APP_CONFIG.multiLevel === true };
      });

      // ── 2. Ouverture depuis la tuile du menu Tracker ─────────────────────────────────────────────
      const tuileOk = await page.evaluate(function () {
        window.ouvrirMenuTracker();
        const t = Array.prototype.slice.call(document.querySelectorAll(".kta-tracker-modal-tile")).find(function (x) {
          return x.textContent.indexOf("🧊") >= 0;
        });
        return { inactif: t.classList.contains("kta-inactif"),
          libelle: t.querySelector(".kta-tracker-modal-tile-label").textContent,
          aide: (t.querySelector(".kta-tracker-modal-tile-aide") || {}).textContent,
          attenduLibelle: window.I18n.t("tracker.menu.vue3d"), attenduAide: window.I18n.t("tracker.menu.vue3dAide") };
      });
      verifier(!tuileOk.inactif && tuileOk.libelle === tuileOk.attenduLibelle && tuileOk.aide === tuileOk.attenduAide,
        "tuile « " + tuileOk.libelle + " » active, ligne d'aide « " + tuileOk.aide + " »", tuileOk);
      ouvert = true;
      await page.locator(".kta-tracker-modal-tile", { hasText: "🧊" }).click();
      await attendre(page, function () {
        return !!window.KtaVue3D && window.KtaVue3D.etat().ouvert === true;
      }, 20000);
      const depuisTuile = await page.evaluate(function () { return window.KtaVue3D.etat(); });
      verifier(depuisTuile.mode === "suivi" && Math.abs(depuisTuile.pos.x - prep.x) < 1 &&
        Math.abs(depuisTuile.pos.y - prep.y) < 1, "ouverte depuis la tuile, à la position du tracker, en suivi",
        { mode: depuisTuile.mode, pos: depuisTuile.pos });
      await page.evaluate(function (p) { window.KtaVue3D.placer(p.x, p.y, 0); }, prep);
      await page.waitForTimeout(600);
      const e0 = await page.evaluate(function () {
        const m = window.KtaVue3D.mesurer({ images: 4 });
        return { etat: window.KtaVue3D.etat(), tri: m.trianglesMax, canvas: !!document.querySelector("#kta-vue3d canvas"),
          css: !!document.getElementById("kta-vue3d-css"),
          titres: Array.prototype.map.call(document.querySelectorAll("#kta-vue3d [data-v3d]"), function (b) { return b.title; }),
          attendus: ["suivre", "plongee", "fermer", "tournerGauche", "avancer", "tournerDroite", "pasGauche", "reculer",
            "pasDroite", "inclinaisonPlus", "inclinaisonMoins"].map(function (k) { return window.I18n.t("vue3d." + k); }) };
      });
      verifier(e0.canvas && e0.css, "fenêtre, scène et feuille montées");
      verifier(JSON.stringify(e0.titres) === JSON.stringify(e0.attendus), "boutons titrés par le dictionnaire", e0.titres);
      verifier(e0.etat.compte.structures >= 2 && e0.tri > 100, "scène non vide (" + e0.etat.compte.structures +
        " structure(s), " + e0.tri + " triangles, hauteur " + e0.etat.hauteur + " m)", e0.etat);
      verifier(e0.etat.yMax.murs > 0 && e0.etat.yMax.murs < e0.etat.yMax.opaque && e0.etat.murDecale,
        "mur qui traverse le pilier : plus bas (" + e0.etat.yMax.murs.toFixed(2) + " m < " +
        e0.etat.yMax.opaque.toFixed(2) + " m) et reculé en profondeur", e0.etat.yMax);
      await capture(page, "fictif-yeux");

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
              a.texte = document.querySelector("#kta-vue3d .kta-v3d-rose-mention").textContent;
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
      verifier(!sansCalib || (bous.sans.calibre === false && bous.sans.mention && bous.sans.texte === bous.sans.attendu &&
        deg(bous.sans.transform) === -90), "boussole sans nord calibré : haut du plan, mention affichée", bous.sans);
      verifier(bous.avec.calibre === true && !bous.avec.mention && deg(bous.avec.transform) === -60 &&
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

      // ── 5. Rouvrir depuis la tuile, 1 m au sud, ✕ → « Oui » recale le tracker là ─────────────────
      await page.evaluate(function () { window.ouvrirMenuTracker(); });
      await page.locator(".kta-tracker-modal-tile", { hasText: "🧊" }).click();
      await attendre(page, function () { return window.KtaVue3D.etat().ouvert === true; }, 10000);
      const cible = await page.evaluate(function () {
        window.KtaVue3D.placer(window.getTrackingPosition().x, window.getTrackingPosition().y, 180);
        window.KtaVue3D.avancer(1);
        return window.KtaVue3D.etat().pos;
      });
      await page.locator('#kta-vue3d [data-v3d="fermer"]').click();
      await page.waitForTimeout(200);
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
      await page.evaluate(function () { window.setStructures([]); });
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
