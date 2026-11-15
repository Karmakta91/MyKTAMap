#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-session-sale.js — checkup (Playwright, Chromium) : la session n'est sérialisée qu'après une modification
// =====================================================================
// js/sessionPersist.js > _tick : le polling ne sérialise la session que « sale » (rendu des données, historique,
// geste de l'utilisateur, empreinte légère changée), sinon le filet (FILET_MS) ou la fermeture. Relevé fictif :
// 1. au repos, aucun geste : les ticks sont sautés, aucune sérialisation complète ;
// 2. chaque type de donnée modifié SANS geste (page.evaluate n'émet aucun événement d'entrée) est sauvegardé au tick
//    suivant : point, tracé, zone, structure, édition en place rendue, mesure, surface, mode de mesure, légende,
//    filtres, trace de suppression, suivi (timeline), ⏪ ;
// 3. chemin douteux (édition en place sans rendu ni geste) : rattrapée par un geste (touche), par pagehide, et par
//    le filet de 30 s ;
// 4. plantage simulé (onglet tué, CDP Page.crash) : la session rouverte contient tout.
// Usage : node scripts/smoke/checkup-session-sale.js (SMOKE_PORT pour une autre copie)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const TICK_MS = 2300;   // un tick (1,5 s) et de la marge
const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }
function verifier(c, m, d) { if (c) ok(m); else pb(m + (d !== undefined ? " " + JSON.stringify(d) : "")); }

async function ouvrir(page) {
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
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.SessionPersist && !!window.HistoryManager;
  }, 60000);
  await page.waitForTimeout(4000);
  // Fenêtre « session restaurée » : retirée sans clic (un clic est un geste et salirait la session).
  await page.evaluate(function () { const m = document.getElementById("kta-session-modal"); if (m) m.remove(); });
}

// Session sauvegardée (cache du stockage : ce qui est écrit ou en cours d'écriture) → résumé lisible.
function lireSauvegarde(page) {
  return page.evaluate(function () {
    const s = window.SessionPersist.getSaved();
    if (!s) return null;
    const uids = function (a) { return (a || []).map(function (o) { return o.uid; }); };
    const z = (s.zones || []).find(function (o) { return o.uid === "zn_ss1"; });
    const r = (s.roads || []).find(function (o) { return o.uid === "rd_ss1"; });
    return {
      points: uids(s.editorPoints), roads: uids(s.roads), zones: uids(s.zones), structures: uids(s.structures),
      nomTrace: r ? r.name : null, noteZone: z ? z.description : null,
      mesure: (s.measure || []).length, surface: (s.measureSurface || []).length, mode: s.measureMode,
      legende: s.customLegend && s.customLegend.labels ? JSON.stringify(s.customLegend.labels) : "",
      filtres: s.runtimeFilters ? JSON.stringify(s.runtimeFilters) : "",
      traces: (s.tombstones || []).map(function (t) { return t.uid; }),
      timeline: (s.trackerTimeline || []).length
    };
  });
}

async function etape(page, nom, fn, arg, attendu) {
  await page.evaluate(fn, arg);
  await page.waitForTimeout(TICK_MS);
  const s = await lireSauvegarde(page);
  verifier(!!s && attendu(s), nom + " : sauvegardé au tick suivant, sans geste", s);
  return s;
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(function (ls) {
    try { for (const k in ls) localStorage.setItem(k, ls[k]); } catch (e) { /* rien */ }
  }, LS_PREGATES);
  let page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  await ouvrir(page);

  // ── 1. Repos ──
  console.log("\n══ repos ══");
  await page.waitForTimeout(TICK_MS);
  const t0 = await page.evaluate(function () { return window.SessionPersist.etatTick(); });
  await page.waitForTimeout(7000);
  const t1 = await page.evaluate(function () { return window.SessionPersist.etatTick(); });
  verifier(t1.complets === t0.complets && t1.sautes - t0.sautes >= 3,
    "au repos : ticks sautés (" + (t1.sautes - t0.sautes) + "), aucune sérialisation complète", { t0: t0, t1: t1 });

  // ── 2. Chaque type de donnée, sans geste ──
  console.log("\n══ modifications sans geste ══");
  const base = await page.evaluate(function () {
    const m = window.map, H = window.APP_CONFIG.imageHeight, c = m.getCenter();
    window.__ss = { x: c.lng, y: H - c.lat };
    return window.__ss;
  });
  await etape(page, "point", function (b) {
    window.setEditorPoints(window.getEditorPoints().concat([{ uid: "pt_ss1", id: "PoiSs1", name: "PoiSs1",
      x: b.x, y: b.y, level: 0, tags: ["salle"], description: "" }]));
  }, base, function (s) { return s.points.indexOf("pt_ss1") >= 0; });
  await etape(page, "tracé", function (b) {
    window.setRoads(window.getRoads().concat([{ uid: "rd_ss1", type: "galerie", level: 0,
      points: [{ x: b.x, y: b.y }, { x: b.x + 40, y: b.y }, { x: b.x + 80, y: b.y + 20 }] }]));
  }, base, function (s) { return s.roads.indexOf("rd_ss1") >= 0; });
  await etape(page, "zone", function (b) {
    window.setZones(window.getZones().concat([{ uid: "zn_ss1", type: "eau", level: 0, description: "",
      points: [{ x: b.x, y: b.y + 50 }, { x: b.x + 40, y: b.y + 50 }, { x: b.x + 40, y: b.y + 90 }] }]));
  }, base, function (s) { return s.zones.indexOf("zn_ss1") >= 0; });
  await etape(page, "structure", function (b) {
    window.setStructures(window.getStructures().concat([{ uid: "st_ss1", type: "pilier-1", level: 0,
      points: [{ x: b.x - 60, y: b.y }, { x: b.x - 40, y: b.y }, { x: b.x - 40, y: b.y + 20 }, { x: b.x - 60, y: b.y + 20 }] }]));
  }, base, function (s) { return s.structures.indexOf("st_ss1") >= 0; });
  await etape(page, "édition en place puis rendu (renderRoads)", function () {
    window.getRoads().find(function (r) { return r.uid === "rd_ss1"; }).name = "Tracé renommé";
    window.renderRoads();
  }, null, function (s) { return s.nomTrace === "Tracé renommé"; });
  await etape(page, "mesure (distance)", function (b) {
    window.setMeasurePoints([{ x: b.x, y: b.y }, { x: b.x + 100, y: b.y }]);
  }, base, function (s) { return s.mesure === 2; });
  await etape(page, "mesure (surface)", function (b) {
    window.setMeasurePointsSurface([{ x: b.x, y: b.y }, { x: b.x + 60, y: b.y }, { x: b.x + 60, y: b.y + 60 }]);
  }, base, function (s) { return s.surface === 3; });
  await etape(page, "légende (libellé de session)", function () {
    window.LegendCustomization.setSessionLabel("roads", "galerie", "Libellé de session");
  }, null, function (s) { return s.legende.indexOf("Libellé de session") >= 0; });
  await etape(page, "filtres", function () {
    window.FilterPanel.setFilters({ zoneTypes: new Set(["eau"]) });
    if (typeof window.appliquerFiltreRuntime === "function") window.appliquerFiltreRuntime();
  }, null, function (s) { return s.filtres.indexOf("eau") >= 0; });
  await etape(page, "filtres remis", function () {
    window.FilterPanel.setFilters({ zoneTypes: null });
    if (typeof window.appliquerFiltreRuntime === "function") window.appliquerFiltreRuntime();
  }, null, function (s) { return s.filtres.indexOf("eau") < 0; });
  await etape(page, "suivi (timeline)", function () {
    window.startTracking();
    window.stopTracking();
  }, null, function (s) { return s.timeline >= 1; });
  await etape(page, "suppression (objet retiré + trace)", function () {
    window.setStructures(window.getStructures().filter(function (o) { return o.uid !== "st_ss1"; }));
    window.KtaUid.tombstone("st_ss1");
  }, null, function (s) { return s.structures.indexOf("st_ss1") < 0 && s.traces.indexOf("st_ss1") >= 0; });
  await etape(page, "édition en historique puis ⏪", function () {
    const Hm = window.HistoryManager;
    const avant = Hm.captureState("roads");
    window.getRoads().find(function (r) { return r.uid === "rd_ss1"; }).name = "Avant annulation";
    window.renderRoads();
    Hm.record("modif", avant, "roads");
    Hm.undo();
  }, null, function (s) { return s.nomTrace === "Tracé renommé"; });

  // ── 3. Chemin douteux : édition en place sans rendu ni geste ──
  console.log("\n══ chemin sans signal (filets) ══");
  const discret = function (txt) {
    window.getZones().find(function (z) { return z.uid === "zn_ss1"; }).description = txt;
  };
  await page.evaluate(discret, "note discrète 1");
  await page.waitForTimeout(TICK_MS);
  let s = await lireSauvegarde(page);
  inf("sans signal, au tick suivant : " + (s && s.noteZone === "note discrète 1" ? "déjà sauvegardé (filet échu)" :
    "pas encore (attendu : le filet le rattrape)"));
  await page.keyboard.press("Shift");
  await page.waitForTimeout(TICK_MS);
  s = await lireSauvegarde(page);
  verifier(s && s.noteZone === "note discrète 1", "rattrapé par un geste (touche du clavier) au tick suivant", s);
  await page.evaluate(discret, "note discrète 2");
  await page.evaluate(function () { window.dispatchEvent(new Event("pagehide")); });
  s = await lireSauvegarde(page);
  verifier(s && s.noteZone === "note discrète 2", "rattrapé par pagehide (onglet fermé), aussitôt", s);
  await page.waitForTimeout(5000);   // fenêtre du geste passée
  await page.evaluate(discret, "note discrète 3");
  const debut = Date.now();
  let vu = false;
  while (Date.now() - debut < 34000) {
    await page.waitForTimeout(1000);
    s = await lireSauvegarde(page);
    if (s && s.noteZone === "note discrète 3") { vu = true; break; }
  }
  verifier(vu, "rattrapé par le filet sans aucun signal (" + Math.round((Date.now() - debut) / 1000) + " s ≤ 32 s)", s);

  // ── 4. Plantage simulé ──
  console.log("\n══ plantage simulé ══");
  await page.evaluate(function (b) {
    window.setEditorPoints(window.getEditorPoints().concat([{ uid: "pt_ss2", id: "PoiSs2", name: "PoiSs2",
      x: b.x + 30, y: b.y + 30, level: 0, tags: ["salle"], description: "" }]));
  }, base);
  await page.waitForTimeout(TICK_MS + 1000);   // tick + écriture IndexedDB confirmée
  const cdp = await ctx.newCDPSession(page);
  // La page meurt pendant l'appel : il ne répond jamais, d'où la borne.
  await Promise.race([cdp.send("Page.crash").catch(function () { /* rien */ }),
    new Promise(function (r) { setTimeout(r, 2000); })]);
  await page.close().catch(function () { /* déjà morte */ });
  page = await ctx.newPage();
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  await ouvrir(page);
  s = await lireSauvegarde(page);
  verifier(s && s.points.indexOf("pt_ss1") >= 0 && s.points.indexOf("pt_ss2") >= 0 && s.roads.indexOf("rd_ss1") >= 0 &&
    s.zones.indexOf("zn_ss1") >= 0 && s.nomTrace === "Tracé renommé" && s.noteZone === "note discrète 3" &&
    s.mesure === 2 && s.surface === 3 && s.traces.indexOf("st_ss1") >= 0 && s.timeline >= 1 &&
    s.legende.indexOf("Libellé de session") >= 0,
  "après l'onglet tué : la session rouverte contient toutes les modifications", s);

  verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 5));
  await browser.close();
  console.log("\n" + (problemes.length ? "❌ " + problemes.length + " problème(s)" :
    "✅ Session : sérialisée seulement après une modification, rien de perdu"));
  process.exit(problemes.length ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
