#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-enchainer-traces.js — checkup (Playwright) : enchaîner les tracés et les lignes sans éteindre l'outil
// =====================================================================
// Vrais clics de souris au centre de la carte (relevé fictif, sinon le premier plan de l'index), niveau 0 actif ;
// outils armés par leur panneau (🛣️, 🏛️, ⬛). Vérifie :
//   • tracés : retoucher le DERNIER point termine le tracé, l'outil reste armé (bouton allumé), le toucher suivant
//     commence un nouveau tracé du même type : 3 tracés enchaînés sans toucher au menu ;
//   • retoucher le PREMIER point reste un point (boucle de galerie) ; un tracé d'un seul point retouché disparaît ;
//   • double clic rapide sur le dernier point : tracé terminé, la carte ne zoome pas ;
//   • ✅ du panneau Tracés : termine le tracé en cours, l'outil reste armé ;
//   • ⏪ après la fin : le tracé est rouvert, le toucher suivant le prolonge (aucun tracé neuf) ;
//   • Structures : 3 fronts puis un mur en ligne enchaînés, ⏪ rouvre un front ;
//   • ⏪ du PREMIER point d'un tracé, d'une ligne, d'une zone, d'un pilier : rien en données, outil armé sur le même
//     type, le toucher suivant commence un nouvel objet ; ⏩ rend le point ; un tracé terminé avant reste terminé ;
//   • inchangés : zone fermée sur son 1er sommet (outil armé), pilier (polygone) que le dernier point ne termine pas,
//     pilier à bras d'un clic, jonction (multi-niveau) que le dernier point ne termine pas et que ✅ éteint.
// Usage : node scripts/smoke/checkup-enchainer-traces.js (SMOKE_PORT pour une autre copie) · code :
// road.js / structures.js (mousedown, click), utils.js > ktaRetoucheDernierSommet, interface.js (✅ des Tracés) ·
// doc : docs/architecture/ui.md § Enchaîner les tracés
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
// Au-delà du délai de double clic du navigateur : deux clics au même endroit restent deux clics.
const PAUSE = 650;

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
async function section(nom, fn) {
  try { await fn(); } catch (e) { pb(nom + " : exception " + (e && e.message)); }
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });

  // Point écran (page) à (dx, dy) px du centre de la carte.
  let C = null;
  const pt = function (dx, dy) { return { x: C.x + dx, y: C.y + dy }; };
  const clic = async function (p) { await page.mouse.click(p.x, p.y); await page.waitForTimeout(PAUSE); };
  const etat = function () {
    return page.evaluate(function () {
      const copie = function (a) { return (a || []).map(function (o) { return { type: o.type, n: o.points.length }; }); };
      return {
        roads: copie(window.getRoads()), structures: copie(window.getStructures()), zones: copie(window.getZones()),
        road: window.getCurrentRoadIndex(), structure: window.getCurrentStructureIndex(),
        zone: window.getCurrentZoneIndex ? window.getCurrentZoneIndex() : null,
        modeRoad: window.modeRoad, modeStructure: window.modeStructure, modeZone: window.modeZone,
        arme: window.ktaOutilArme(), zoom: window.map.getZoom()
      };
    });
  };
  // Arme un type par le panneau de son groupe (bouton dont le texte contient le libellé).
  const armer = function (groupe, cle) {
    return page.evaluate(function (a) {
      window.ktaOuvrirOutils(a.groupe);
      const fly = document.querySelector(".kta-group-flyout");
      const lib = window.I18n.t(a.cle);
      const b = fly && Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (x) {
        return (x.textContent || "").indexOf(lib) >= 0 || (x.title || "").indexOf(lib) >= 0;
      })[0];
      if (b) b.click();
      if (window.ktaOutilsOuverts && window.ktaOutilsOuverts()) window.ktaFermerOutils();
      return !!b;
    }, { groupe: groupe, cle: cle });
  };
  const desarmer = function () {
    return page.evaluate(function () {
      if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
      document.querySelectorAll("#kta-alert-charte, .kta-readme-modal-overlay").forEach(function (o) { o.remove(); });
    });
  };
  const vider = function () {
    return page.evaluate(function () {
      window.setRoads([]); window.setStructures([]); window.setZones([]);
      if (window.HistoryManager && typeof window.HistoryManager.reset === "function") window.HistoryManager.reset();
    });
  };
  // Ligne de `n` points sur la rangée `dy`, puis retouche du dernier.
  const ligne = async function (dy, n, retoucher) {
    for (let i = 0; i < n; i++) await clic(pt(-200 + i * 80, dy));
    if (retoucher) await clic(pt(-200 + (n - 1) * 80, dy));
  };

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
    await attendre(page, function () { return window.__pret && !!window.map && !!window.PLAN_CONFIG; }, 40000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
      if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) window.ktaSetActiveLevel(0);
      if (window.getTrackingActif && window.getTrackingActif()) window.stopTracking();
      // Calques de données du plan retirés : seuls les objets du parcours sont sous la souris. 🩸 Sauf le calque des
      // annotations (window.layerEditor) : il porte les objets de session.
      const g = window.dataLayerGroups || {};
      Object.keys(g).forEach(function (k) {
        if (g[k] === window.layerEditor) return;
        try { window.map.removeLayer(g[k]); } catch (e) { /* déjà retiré */ }
      });
    });
    C = await page.evaluate(function () {
      const r = window.map.getContainer().getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    await vider();
    // 🩸 Un clic dans les toutes premières secondes après le chargement du plan n'arrive pas aux outils (mesuré avant
    // comme après le code testé ici) : la carte finit de s'installer d'abord.
    await page.waitForTimeout(3000);

    // ── 1. Trois tracés enchaînés, sans toucher au menu ──
    await section("tracés enchaînés", async function () {
      verifier(await armer("traces", "ui.trace.principal"), "outil Route principale armé par le panneau");
      await ligne(-150, 3, true);
      const e1 = await etat();
      verifier(e1.roads.length === 1 && e1.roads[0].n === 3 && e1.road === -1 && e1.modeRoad === "principal" && e1.arme,
        "retoucher le dernier point termine le tracé (3 points), l'outil reste armé", e1);
      await ligne(-100, 3, true);
      await ligne(-50, 2, true);
      const e = await etat();
      verifier(e.roads.length === 3 && e.roads.every(function (r) { return r.type === "principal"; }) &&
        e.roads[1].n === 3 && e.roads[2].n === 2 && e.road === -1 && e.modeRoad === "principal" && e.arme,
        "3 tracés du même type enchaînés, rien en cours, outil armé", e);
    });

    // ── 2. Boucle sur le 1er point ; tracé d'un seul point ──
    await section("boucle", async function () {
      await clic(pt(-200, 0)); await clic(pt(-120, 0)); await clic(pt(-120, 60));
      await clic(pt(-200, 0));
      const e = await etat();
      const dernier = e.roads[e.roads.length - 1];
      verifier(e.roads.length === 4 && dernier.n === 4 && e.road === 3,
        "retoucher le 1er point reste un point (boucle), le tracé continue", e);
      await clic(pt(-200, 0));
      const e2 = await etat();
      verifier(e2.roads.length === 4 && e2.roads[3].n === 4 && e2.road === -1 && e2.modeRoad === "principal",
        "puis retoucher ce dernier point (le 1er) termine la boucle", e2);
      await clic(pt(100, 0)); await clic(pt(100, 0));
      const e3 = await etat();
      verifier(e3.roads.length === 4 && e3.road === -1 && e3.modeRoad === "principal",
        "un tracé d'un seul point retouché ne reste pas en données, outil armé", e3);
    });

    // ── 3. Double clic rapide sur le dernier point : terminé, pas de zoom ──
    await section("double clic", async function () {
      const z0 = (await etat()).zoom;
      await clic(pt(-200, 100)); await clic(pt(-120, 100));
      await page.mouse.dblclick(C.x - 40, C.y + 100);
      await page.waitForTimeout(PAUSE);
      const e = await etat();
      verifier(e.roads.length === 5 && e.roads[4].n === 3 && e.road === -1 && e.zoom === z0 && e.modeRoad === "principal",
        "double clic : un point puis la fin, la carte ne zoome pas", { e: e, z0: z0 });
    });

    // ── 4. ✅ du panneau : termine, garde l'outil armé ──
    await section("valider", async function () {
      await clic(pt(-200, 150)); await clic(pt(-120, 150));
      const r = await page.evaluate(function () {
        window.ktaOuvrirOutils("traces");
        const fly = document.querySelector(".kta-group-flyout");
        const lib = window.I18n.t("ui.trace.valider");
        const b = fly && Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (x) {
          return (x.textContent || "").indexOf(lib) >= 0 || (x.title || "").indexOf(lib) >= 0;
        })[0];
        if (b) b.click();
        if (window.ktaOutilsOuverts && window.ktaOutilsOuverts()) window.ktaFermerOutils();
        return !!b;
      });
      const e = await etat();
      verifier(r && e.roads.length === 6 && e.roads[5].n === 2 && e.road === -1 && e.modeRoad === "principal" && e.arme,
        "✅ termine le tracé, l'outil reste armé", { r: r, e: e });
      await clic(pt(100, 150)); await clic(pt(180, 150));
      const e2 = await etat();
      verifier(e2.roads.length === 7 && e2.road === 6, "le toucher suivant commence un nouveau tracé", e2);
      await clic(pt(180, 150));
    });

    // ── 5. ⏪ rouvre le tracé terminé ──
    await section("annuler la fin", async function () {
      await clic(pt(-200, 200)); await clic(pt(-120, 200)); await clic(pt(-120, 200));
      const avant = await etat();
      await page.evaluate(function () { window.HistoryManager.undo(); });
      await page.waitForTimeout(200);
      const e = await etat();
      verifier(avant.road === -1 && e.road === avant.roads.length - 1 && e.modeRoad === "principal" && e.arme,
        "⏪ rouvre le tracé, l'outil reste armé", { avant: avant, e: e });
      await clic(pt(-40, 200));
      const e2 = await etat();
      verifier(e2.roads.length === avant.roads.length && e2.roads[e2.roads.length - 1].n === 3 &&
        e2.road === avant.roads.length - 1, "le toucher suivant prolonge ce tracé (aucun tracé neuf)", e2);
      await clic(pt(-40, 200));
    });
    await desarmer();
    await vider();

    // ── 6. Structures : 3 fronts puis un mur en ligne ──
    await section("lignes de structures", async function () {
      verifier(await armer("structures", "ui.struct.front1"), "outil Front de taille armé par le panneau");
      await ligne(-150, 3, true);
      await ligne(-100, 2, true);
      await ligne(-50, 3, true);
      const e = await etat();
      verifier(e.structures.length === 3 && e.structures.every(function (s) { return s.type === "front-1"; }) &&
        e.structure === -1 && e.modeStructure === "front-1" && e.arme,
        "3 fronts enchaînés en retouchant le dernier point, outil armé", e);
      verifier(await armer("structures", "ui.struct.murLigne"), "outil Mur (ligne) armé par le panneau");
      await ligne(0, 3, true);
      const e2 = await etat();
      verifier(e2.structures.length === 4 && e2.structures[3].type === "mur-ligne" && e2.structures[3].n === 3 &&
        e2.structure === -1 && e2.modeStructure === "mur-ligne", "puis un mur en ligne terminé de même", e2);
      await page.evaluate(function () { window.HistoryManager.undo(); });
      const e3 = await etat();
      verifier(e3.structure === 3 && e3.modeStructure === "mur-ligne", "⏪ rouvre le mur en ligne", e3);
      await clic(pt(100, 0));
      const e4 = await etat();
      verifier(e4.structures.length === 4 && e4.structures[3].n === 4, "le toucher suivant le prolonge", e4);
      await clic(pt(100, 0));
      await clic(pt(100, 100)); await clic(pt(100, 100));
      const e5 = await etat();
      verifier(e5.structures.length === 4 && e5.structure === -1, "une ligne d'un seul point retouché disparaît", e5);
    });
    await desarmer();
    await vider();

    // ── 7. Inchangés : zone, pilier, pilier à bras ──
    await section("polygones inchangés", async function () {
      verifier(await armer("zones", "ui.zone.eau"), "outil Eau armé par le panneau");
      await clic(pt(-200, -150)); await clic(pt(-100, -150)); await clic(pt(-100, -60));
      await clic(pt(-200, -150));
      const z = await etat();
      verifier(z.zones.length === 1 && z.zones[0].n === 3 && z.zone === -1 && z.modeZone === "eau",
        "zone fermée sur son 1er sommet, outil armé", z);
      await desarmer();
      verifier(await armer("structures", "ui.struct.pilier1"), "outil Pilier armé par le panneau");
      await clic(pt(0, -150)); await clic(pt(80, -150)); await clic(pt(80, -60));
      await clic(pt(80, -60));
      const p = await etat();
      verifier(p.structure === 0 && p.modeStructure === "pilier-1",
        "pilier : retoucher le dernier point ne le termine pas", p);
      await clic(pt(0, -150));
      const p2 = await etat();
      verifier(p2.structure === -1 && p2.structures.length === 1, "pilier fermé sur son 1er sommet", p2);
      const aBras = await page.evaluate(function () { return typeof window.ktaPoseUnClic === "function" && window.ktaPoseUnClic("pilier-bras"); });
      if (aBras) {
        verifier(await armer("structures", "ui.struct.pilierBras"), "outil Pilier à bras armé par le panneau");
        await clic(pt(200, -100)); await clic(pt(200, 0));
        const b = await etat();
        verifier(b.structures.length === 3 && b.structure === -1 && b.modeStructure === "pilier-bras",
          "pilier à bras : un clic, un carré, outil armé", b);
      } else {
        console.log("  ⚪ pilier à bras absent de cette base : non joué");
      }
    });
    await desarmer();
    await vider();

    // ── 8. ⏪ du PREMIER point : le point disparaît, l'outil reste armé sur le même type ──
    const annulerPremier = async function (nom, o) {
      await section(nom, async function () {
        verifier(await armer(o.groupe, o.armer), nom + " : outil armé par le panneau");
        await clic(pt(150, o.dy));
        const a = await etat();
        verifier(a[o.cat].length === 1 && a[o.idx] === 0, nom + " : premier point posé", a);
        await page.evaluate(function () { window.HistoryManager.undo(); });
        await page.waitForTimeout(200);
        const e = await etat();
        verifier(e[o.cat].length === 0 && e[o.idx] === -1 && e[o.cle] === o.mode && e.arme,
          nom + " : ⏪ du premier point, rien en données, outil armé sur le même type", e);
        await clic(pt(150, o.dy + 40));
        const e2 = await etat();
        verifier(e2[o.cat].length === 1 && e2[o.cat][0].type === o.mode && e2[o.cat][0].n === 1 && e2[o.idx] === 0,
          nom + " : le toucher suivant commence un nouvel objet du même type", e2);
        await page.evaluate(function () { window.HistoryManager.undo(); window.HistoryManager.redo(); });
        const e3 = await etat();
        verifier(e3[o.cat].length === 1 && e3[o.idx] === 0 && e3[o.cle] === o.mode && e3.arme,
          nom + " : ⏪ puis ⏩ rend le point, objet en cours, outil armé", e3);
      });
      await desarmer();
      await vider();
    };
    await annulerPremier("tracé", { cat: "roads", idx: "road", cle: "modeRoad", mode: "principal",
      groupe: "traces", armer: "ui.trace.principal", dy: -100 });
    await annulerPremier("ligne de structure", { cat: "structures", idx: "structure", cle: "modeStructure",
      mode: "front-1", groupe: "structures", armer: "ui.struct.front1", dy: -50 });
    await annulerPremier("zone", { cat: "zones", idx: "zone", cle: "modeZone", mode: "eau",
      groupe: "zones", armer: "ui.zone.eau", dy: 0 });
    await annulerPremier("pilier (polygone)", { cat: "structures", idx: "structure", cle: "modeStructure",
      mode: "pilier-1", groupe: "structures", armer: "ui.struct.pilier1", dy: 50 });
    // Après un tracé terminé : ⏪ du premier point du suivant ne rouvre pas le précédent.
    await section("tracé après un tracé terminé", async function () {
      verifier(await armer("traces", "ui.trace.principal"), "outil Route principale armé par le panneau");
      await ligne(-150, 2, true);
      await clic(pt(150, 100));
      await page.evaluate(function () { window.HistoryManager.undo(); });
      await page.waitForTimeout(200);
      const e = await etat();
      verifier(e.roads.length === 1 && e.roads[0].n === 2 && e.road === -1 && e.modeRoad === "principal" && e.arme,
        "⏪ du premier point du tracé suivant : le tracé terminé reste terminé, outil armé", e);
    });
    await desarmer();
    await vider();

    // ── 9. Jonction (multi-niveau) inchangée ──
    await section("jonction", async function () {
      const ml = await page.evaluate(function () {
        return !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) &&
          typeof window.ktaTracerJonction === "function" && window.ktaTracerJonction(0, 1);
      });
      if (!ml) { console.log("  ⚪ plan sans multi-niveau : jonction non jouée"); return; }
      await clic(pt(-200, 50)); await clic(pt(-120, 50)); await clic(pt(-120, 50));
      const j = await etat();
      verifier(j.road === 0 && j.modeRoad === "jonction" && j.roads[0].n === 3,
        "jonction : retoucher le dernier point reste un point", j);
      await page.evaluate(function () {
        window.ktaOuvrirOutils("traces");
        const fly = document.querySelector(".kta-group-flyout");
        const lib = window.I18n.t("ui.trace.valider");
        const b = fly && Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (x) {
          return (x.textContent || "").indexOf(lib) >= 0 || (x.title || "").indexOf(lib) >= 0;
        })[0];
        if (b) b.click();
        if (window.ktaOutilsOuverts && window.ktaOutilsOuverts()) window.ktaFermerOutils();
      });
      const j2 = await etat();
      verifier(j2.modeRoad === null && !j2.arme && j2.roads.length === 1, "jonction : ✅ éteint l'outil", j2);
    });
    await desarmer();
    await vider();

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
  console.log("🎉 CHECKUP VERT — les tracés et les lignes s'enchaînent en retouchant le dernier point, ✅ garde " +
    "l'outil armé, ⏪ rouvre le tracé ; zones, piliers et jonction inchangés.");
  process.exit(0);
})();
