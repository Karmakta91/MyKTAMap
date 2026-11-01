#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-vue-3d.js — checkup (Playwright) : vue 3D (js/vue3d.js) sur le relevé fictif
// =====================================================================
// Rien de la 3D n'est demandé au démarrage ni au chargement du plan ; script injecté puis KtaVue3D.ouvrir() :
// scène non vide, avancer, buter contre un pilier de session posé devant (règle du pas du tracker), clavier,
// bascule de vue plongeante, changement de niveau, fermeture qui libère le contexte WebGL (20 ouvertures de
// suite sans « Too many active WebGL contexts »), aucune erreur de page ni de console.
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
  let ouvert = false;
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  page.on("console", function (m) {
    const t = m.text();
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

    ouvert = true;
    await page.addScriptTag({ url: BASE + "/js/vue3d.js" });
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    });

    if (PERF) {
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
      // Pilier de session à 3 m au nord du départ (objets fictifs), départ dans une zone dégagée.
      const prep = await page.evaluate(function () {
        const sc = window.APP_CONFIG.scale;
        if (window.APP_CONFIG.multiLevel === true) window.APP_CONFIG.activeLevel = 0;
        const c = window.map.getCenter();
        const x = Math.round(c.lng), y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat);
        const d = 3 * sc, l = 1.5 * sc;
        window.setStructures([{ uid: "st_v3d_pilier", type: "pilier-1", level: 0,
          points: [{ x: x - l, y: y - d - 2 * l }, { x: x + l, y: y - d - 2 * l }, { x: x + l, y: y - d }, { x: x - l, y: y - d }] }]);
        return { x: x, y: y, sc: sc, multi: window.APP_CONFIG.multiLevel === true,
          niveaux: (window.PLAN_CONFIG.levels || window.PLAN_CONFIG.niveaux || []).length };
      });
      const ouv = await page.evaluate(function (p) {
        return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y, cap: 0 } });
      }, prep);
      verifier(ouv === true, "KtaVue3D.ouvrir() → true");
      await page.waitForTimeout(600);
      const e0 = await page.evaluate(function () {
        const m = window.KtaVue3D.mesurer({ images: 4 });
        return { etat: window.KtaVue3D.etat(), tri: m.trianglesMax, canvas: !!document.querySelector("#kta-vue3d canvas"),
          css: !!document.getElementById("kta-vue3d-css") };
      });
      verifier(e0.canvas && e0.css, "fenêtre, scène et feuille montées");
      verifier(e0.etat.compte.structures >= 1 && e0.tri > 100, "scène non vide (" + e0.etat.compte.structures +
        " structure(s), " + e0.tri + " triangles, hauteur " + e0.etat.hauteur + " m)", e0);
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

      await page.locator('#kta-vue3d [data-v3d="vue"]').click();
      await page.waitForTimeout(300);
      const vue = await page.evaluate(function () { return window.KtaVue3D.etat().vue; });
      verifier(vue === "plongee", "bascule en vue plongeante", vue);
      await capture(page, "fictif-plongee");
      await page.keyboard.press("KeyV");
      verifier(await page.evaluate(function () { return window.KtaVue3D.etat().vue; }) === "yeux", "touche V : retour à hauteur d'yeux");

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
      } else {
        console.log("  ℹ️ plan à un niveau : changement de niveau non joué");
      }

      await page.keyboard.press("Escape");
      const ferme = await page.evaluate(function () {
        return { dom: !!document.getElementById("kta-vue3d"), etat: window.KtaVue3D.etat() };
      });
      verifier(!ferme.dom && ferme.etat.contexteLibere === true, "Échap ferme et libère le contexte WebGL", ferme);

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
