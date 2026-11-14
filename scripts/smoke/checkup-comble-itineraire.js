#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-comble-itineraire.js — checkup (Playwright) : Comblé et effondrement ne bloquent jamais l'itinéraire
// =====================================================================
// Objets FICTIFS posés au centre de la vue (relevé fictif, sinon le premier plan de l'index) ; les tracés, points,
// zones des calques du plan sont masqués le temps du test (réseau maîtrisé), puis rendus.
// Vérifie, pour Comblé (`remblais`) puis effondrement : évité quand un détour existe ; traversé et dit sans détour
// (résultat, toast de « Y aller ») ; même chose en sortie d'urgence (sortie à travers la zone classée après une
// sortie libre, alerte dans la fenêtre quand c'est la seule) et aux options brancard (zone absente des cases, jamais
// bloquante) ; `inaccessible` toujours dure ; « Vérifier le plan » range le tracé en « À revoir » (C12).
// 🩸 check-zones-cout.js teste la règle dans un `vm` ; seul ce parcours voit les vrais registres, les fenêtres et
// les textes de l'app. Usage : node scripts/smoke/checkup-comble-itineraire.js (SMOKE_PORT pour une autre copie) ·
// code : pathfinder.js > TYPES_ZONES_COUT · doc : docs/architecture/multilevel-pathfinding.md
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

// Réseau : O au centre. Est : galerie droite O → E (200 px, en 4 segments). Ouest : O → W (300 px).
// Détour de l'est : O → (0,100) → (200,100) → E (400 px). Zone sur la galerie droite, de x+80 à x+120.
function semer(page, opts) {
  return page.evaluate(function (opts) {
    const c = window.map.getCenter();
    const x = Math.round(c.lng), y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat);
    window.__cci = { x: x, y: y };
    const rd = function (uid, pts) {
      return { uid: uid, type: "principal", level: 0, points: pts.map(function (p) { return { x: x + p[0], y: y + p[1] }; }) };
    };
    const roads = [rd("rd_cci_est", [[0, 0], [50, 0], [100, 0], [150, 0], [200, 0]])];
    if (opts.detour) roads.push(rd("rd_cci_detour", [[0, 0], [0, 100], [200, 100], [200, 0]]));
    if (opts.ouest) roads.push(rd("rd_cci_ouest", [[0, 0], [-300, 0]]));
    window.setRoads(roads);
    window.setZones(opts.zone ? [{ uid: "zn_cci", type: opts.zone, level: 0,
      points: [[80, -20], [120, -20], [120, 20], [80, 20]].map(function (p) { return { x: x + p[0], y: y + p[1] }; }) }]
      : []);
    // Sorties FICTIVES (session simulée) : est, et ouest si demandé.
    const sorties = [{ uid: "pt_cci_e", id: "pt_cci_e", nom: "Sortie Est", tags: ["cao"], x: x + 200, y: y, level: 0 }];
    if (opts.ouest) sorties.push({ uid: "pt_cci_w", id: "pt_cci_w", nom: "Sortie Ouest", tags: ["cao"], x: x - 300, y: y,
      level: 0 });
    window.__cciSorties = sorties;
    if (typeof window.renderRoads === "function") window.renderRoads();
    if (typeof window.renderZones === "function") window.renderZones();
  }, opts);
}

function itineraire(page) {
  return page.evaluate(async function () {
    const o = window.__cci;
    try {
      const r = await window.Pathfinder.computeRoute([{ x: o.x, y: o.y, level: 0 }, { x: o.x + 200, y: o.y, level: 0 }],
        { allowedTypes: ["principal"] });
      return { d: Math.round(r.totalDistance), n: r.zonesTraversees.length,
        txt: window.Pathfinder.texteZonesTraversees(r.zonesTraversees) };
    } catch (e) { return { err: e.code || String(e && e.message) }; }
  });
}

// Sortie d'urgence depuis O → { nom de la 1re sortie, alerte « zone » affichée ? }.
async function sortie(page, contraintes) {
  await page.evaluate(function (c) {
    const o = window.__cci;
    window.SortieUrgence.declencherDepuis(o.x, o.y, 0, c ? { origine: "victime", contraintes: c } : undefined);
  }, contraintes || null);
  await attendre(page, function () {
    const m = document.getElementById("kta-sortie-urgence-modal");
    return !!m && !m.querySelector(".kta-sortie-loader");
  }, 15000);
  const r = await page.evaluate(function () {
    const m = document.getElementById("kta-sortie-urgence-modal");
    const nom = m.querySelector(".kta-sortie-nom");
    const z = m.querySelector(".kta-sortie-zones-cout");
    return { nom: nom ? nom.textContent : null, alerte: z ? z.textContent : null };
  });
  await page.evaluate(function () { const b = document.getElementById("kta-sortie-close"); if (b) b.click(); });
  return r;
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
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.Pathfinder && !!window.SortieUrgence &&
        !!window.KtaVerifierPlan;
    }, 40000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
      if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) window.APP_CONFIG.activeLevel = 0;
      // Réseau maîtrisé : les calques du plan (tracés, points, zones, structures) sont masqués pendant le test.
      window.__cciOrig = { r: window.getAllEmbeddedRoads, p: window.getAllEmbeddedPoints, e: window.getEditorPoints,
        z: window._ktaDataPolygons, s: window._ktaDataStructurePolygons, toast: window.OOMGuard.showToast };
      window.getAllEmbeddedRoads = function () { return []; };
      window.getAllEmbeddedPoints = function () { return []; };
      window.getEditorPoints = function () { return window.__cciSorties || []; };
      window._ktaDataPolygons = [];
      window._ktaDataStructurePolygons = [];
      window.__toasts = [];
      window.OOMGuard.showToast = function (msg, type) {
        window.__toasts.push({ msg: String(msg), type: type });
        return window.__cciOrig.toast.apply(this, arguments);
      };
      if (typeof window.setStructures === "function") window.setStructures([]);
    });

    const libelles = await page.evaluate(function () {
      return { fr: window.LegendCustomization.getLabel("zones", "remblais") };
    });
    verifier(libelles.fr === "Comblé", "légende : le type remblais s'affiche « Comblé »", libelles);

    for (const type of ["remblais", "effondrement"]) {
      console.log("— " + type);
      // ── Itinéraire ──
      await semer(page, { zone: type, detour: true });
      let r = await itineraire(page);
      verifier(r.d === 400 && r.n === 0 && !r.txt, type + " + détour : évité (400 px), rien à dire", r);
      await semer(page, { zone: type });
      r = await itineraire(page);
      verifier(r.d === 200 && r.n === 1, type + " seul chemin : traversé, distance vraie (200 px)", r);
      verifier(!!r.txt && /Passe par une zone .+ sur /.test(r.txt), type + " seul chemin : le résultat le dit", r.txt);
      // « Y aller » : le toast le dit.
      await page.evaluate(function () {
        window.__toasts = [];
        const o = window.__cci;
        window.itineraireYAller(o.x + 200, o.y, "Arrivée", { origine: { x: o.x, y: o.y, level: 0 } });
      });
      await page.waitForTimeout(1500);
      const toast = await page.evaluate(function () {
        return window.__toasts.filter(function (t) { return /Passe par une zone/.test(t.msg); })[0] || null;
      });
      verifier(!!toast && toast.type === "warn", type + " : « Y aller » avertit (toast warn)", toast);
      await page.evaluate(function () {
        window.setRoads((window.getRoads() || []).filter(function (x) { return x.type !== "itinerary"; }));
      });

      // ── Sortie d'urgence ──
      await semer(page, { zone: type, ouest: true });
      let s = await sortie(page);
      verifier(s.nom && s.nom.indexOf("Sortie Ouest") >= 0 && !s.alerte,
        type + " : sortie d'urgence — la sortie libre (300 px) passe devant celle à travers la zone (200 px)", s);
      await semer(page, { zone: type });
      s = await sortie(page);
      verifier(s.nom && s.nom.indexOf("Sortie Est") >= 0 && !!s.alerte,
        type + " : sortie d'urgence — seule sortie à travers la zone : proposée, et l'alerte le dit", s);
      // Brancard : la zone n'est pas une case, et ne bloque pas.
      const cases = await page.evaluate(function () {
        return window.getAvoidableZoneTypes().map(function (z) { return z.type; });
      });
      verifier(cases.indexOf(type) < 0, type + " : absent des cases du brancard et des « Zones à éviter »", cases);
      s = await sortie(page, { avoidZones: ["eau"], respecterInaccessibles: true });
      verifier(s.nom && s.nom.indexOf("Sortie Est") >= 0 && !!s.alerte,
        type + " : brancard — évité d'office mais jamais bloquant (sortie trouvée, alerte)", s);
    }

    // ── Inaccessible : toujours dure ──
    await semer(page, { zone: "inaccessible" });
    const ri = await itineraire(page);
    verifier(!!ri.err, "inaccessible seul chemin : aucun chemin (dure)", ri);
    await semer(page, { zone: "inaccessible", ouest: true });
    const si = await sortie(page);
    verifier(si.nom && si.nom.indexOf("Sortie Ouest") >= 0, "inaccessible : la sortie d'urgence passe par l'ouest", si);

    // ── Vérifier le plan : C12 en « À revoir » ──
    await semer(page, { zone: "remblais", detour: true });
    const v = await page.evaluate(function () {
      window.KtaVerifierPlan.ouvrir();
      const m = document.getElementById("kta-verif-modal");
      const res = window.KtaVerifierPlan.analyser();
      const c12 = res.liste.filter(function (c) { return c.controle === "C12"; });
      const revoir = m && m.querySelector(".kta-verif-g-revoir");
      const bloquant = m && m.querySelector(".kta-verif-g-bloquant");
      const titres = m ? Array.from(m.querySelectorAll(".kta-verif-controle")).map(function (e) { return e.textContent; }) : [];
      const out = { c12: c12.map(function (c) { return c.gravite + ":" + c.cle; }),
        c1: res.liste.filter(function (c) { return c.controle === "C1"; }).length,
        revoir: revoir ? revoir.textContent : null, bloquant: !!bloquant, titres: titres };
      window.KtaVerifierPlan.fermer();
      return out;
    });
    verifier(v.c12.length === 1 && v.c12[0] === "revoir:C12|rd_cci_est|zn_cci", "Vérifier le plan : C12 sur le tracé, gravité « revoir »", v.c12);
    verifier(v.c1 === 0 && !v.bloquant, "Vérifier le plan : rien en bloquant pour un Comblé", v);
    verifier(!!v.revoir && /revoir/i.test(v.revoir) && v.titres.some(function (t) { return /Comblé ou effondrée/.test(t); }),
      "Vérifier le plan : la fenêtre range le contrôle sous « À revoir »", v);

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.message));
  } finally {
    await page.evaluate(function () {
      const o = window.__cciOrig;
      if (!o) return;
      window.getAllEmbeddedRoads = o.r; window.getAllEmbeddedPoints = o.p; window.getEditorPoints = o.e;
      window._ktaDataPolygons = o.z; window._ktaDataStructurePolygons = o.s; window.OOMGuard.showToast = o.toast;
    }).catch(function () {});
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — Comblé et effondrement évités, jamais bloquants, traversés et dits ; inaccessible dure ; C12 à revoir.");
  process.exit(0);
})();
