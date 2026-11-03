#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-calque-modif-source.js — checkup (Playwright, pas un hook pré-commit) : un calque en « 🔄 Modifier » est
// REMPLACÉ par sa copie de session dans toutes les lectures du plan (itinéraire, graphe, obstacles, comptes, 3D)
// =====================================================================
// Sur le relevé fictif (multi-niveau), un calque de données FABRIQUÉ au lancement (blob, rien d'écrit sur disque) :
// tracé niveau 0 → tracé `jonction` 0 ↔ −1 → tracé niveau −1, plus une zone `inaccessible` et un mur en ligne à
// l'écart. Rapatrié (CalqueSession.rapatrier) : chaque objet n'est lu qu'une fois (copie). Jonction, zone et mur
// supprimés de la copie : absents de getAllEmbeddedRoads, du graphe (RoadGraph), des obstacles durs, de
// l'itinéraire 0 → −1 et des volumes de passage de la vue 3D. Restitué : l'original revient partout.
// 🩸 Le verrou ne fait que MASQUER le groupe du calque : sans exclusion dans utils.js > getAllEmbedded* /
// road.js > getAllEmbeddedRoads, l'original masqué restait lu à côté de sa copie (doublons, objets supprimés qui
// ressuscitent dans l'itinéraire et la 3D).
// Usage : node scripts/smoke/checkup-calque-modif-source.js (SMOKE_PORT pour une autre copie)
// Doc : docs/architecture/session-data.md (calque en modification)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

// Même repli que checkup-jonction-calque-niveau.js : on ouvre ce que l'index propose, en le disant.
function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) {
    return { nom: "Relevé fictif de test", fictif: true };
  }
}

const PLAN = planAOuvrir();
const CALQUE = "kta_test_calque_modif";
const UID_J = "rd_kta_modif_jonction";
const problemes = [];
const erreursPage = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail ? " " + JSON.stringify(detail) : "")); }

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.CalqueSession && !!window.Pathfinder &&
      !!window.RoadGraph && typeof window.ajouterPointsDepuisJSON === "function";
  }, 60000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

// Calque fabriqué au centre de la vue, déclaré dans PLAN_CONFIG.dataLayers (rapatrier relit son `file`) et chargé
// par le même chemin qu'un calque du plan (ajouterPointsDepuisJSON).
async function semerCalque(page) {
  return page.evaluate(function (a) {
    const c = window.map.getCenter();
    const h = window.APP_CONFIG.imageHeight;
    const x = Math.round(c.lng), y = Math.round(h - c.lat);
    window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice();
    const json = {
      roads: [
        { uid: "rd_kta_modif_n0", type: "principal", level: 0, points: [{ x: x - 200, y: y }, { x: x, y: y }] },
        { uid: a.uidJ, type: "jonction", fromLevel: 0, toLevel: -1, points: [{ x: x, y: y }, { x: x + 20, y: y }] },
        { uid: "rd_kta_modif_n1", type: "principal", level: -1,
          points: [{ x: x + 20, y: y }, { x: x + 220, y: y }] }
      ],
      zones: [{ uid: "zn_kta_modif", type: "inaccessible", level: 0,
        points: [{ x: x - 100, y: y + 300 }, { x: x - 60, y: y + 300 }, { x: x - 60, y: y + 340 }] }],
      structures: [{ uid: "st_kta_modif", type: "mur-ligne", level: 0,
        points: [{ x: x + 60, y: y + 300 }, { x: x + 100, y: y + 300 }] }]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
    window.PLAN_CONFIG.dataLayers = (window.PLAN_CONFIG.dataLayers || []).concat([
      { id: a.id, label: "Calque du checkup", file: url, visible: true }
    ]);
    const groupe = L.layerGroup().addTo(window.map);
    window.dataLayerGroups = window.dataLayerGroups || {};
    window.dataLayerGroups[a.id] = groupe;
    window._ktaTestGroupe = groupe;
    window.ajouterPointsDepuisJSON(url, groupe);
    return { A: { x: x - 200, y: y, level: 0 }, J0: { x: x, y: y }, J1: { x: x + 20, y: y },
      B: { x: x + 220, y: y, level: -1 } };
  }, { id: CALQUE, uidJ: UID_J });
}

// Toutes les lectures du plan pour les objets du calque fabriqué (uid ; la copie de session garde l'uid).
async function lire(page, g) {
  return page.evaluate(async function (g) {
    const mien = function (o) { return o && typeof o.uid === "string" && o.uid.indexOf("_kta_modif") >= 0; };
    const proche = function (p, q) { return p && q && Math.hypot(p.x - q.x, p.y - q.y) < 1.5; };
    const emb = (window.getAllEmbeddedRoads() || []).filter(mien);
    const tous = window.ktaAnnotationsCompletes("roads").filter(mien);
    const jSession = (window.getRoads() || []).filter(function (r) { return r && r.uid === g.uidJ; }).length;
    window.RoadGraph.invalidate();
    const graphe = window.RoadGraph.getGraph();
    const segJ = graphe ? graphe.segments.filter(function (s) {
      const a = graphe.nodes[s.a], b = graphe.nodes[s.b];
      return s.roadType === "jonction" && ((proche(a, g.J0) && proche(b, g.J1)) || (proche(a, g.J1) && proche(b, g.J0)));
    }).length : null;
    let route = null;
    try {
      const r = await window.Pathfinder.computeRoute([g.A, g.B]);
      const p = r.path || [];
      let via = false;
      for (let i = 0; i + 1 < p.length; i++) {
        if ((proche(p[i], g.J0) && proche(p[i + 1], g.J1)) || (proche(p[i], g.J1) && proche(p[i + 1], g.J0))) via = true;
      }
      route = { ok: true, viaJonction: via, points: p.length };
    } catch (e) {
      route = { ok: false, code: e && (e.code || e.message) };
    }
    return {
      embarquees: emb.length,
      jonctionEmbarquee: emb.filter(function (r) { return r.uid === g.uidJ; }).length,
      lecturesJonction: tous.filter(function (r) { return r.uid === g.uidJ; }).length,
      lecturesTraces: tous.length,
      jonctionSession: jSession,
      segmentsJonction: segJ,
      obstacles: window.Pathfinder.nbObstaclesDurs(),
      zones: window.ktaAnnotationsCompletes("zones").filter(mien).length,
      structures: window.ktaAnnotationsCompletes("structures").filter(mien).length,
      route: route
    };
  }, g);
}

// Volumes de passage « rampe » (tracé jonction) de la vue 3D au départ de J0, niveau 0 ; null si la 3D n'ouvre pas.
// La vue 3D se charge à la demande : le script est ajouté comme le fait checkup-vue-3d.js.
async function rampes3d(page, g) {
  if (!(await page.evaluate(function () { return !!window.KtaVue3D; }))) {
    await page.addScriptTag({ url: BASE + "/js/vue3d.js" });
  }
  return page.evaluate(function (g) {
    if (!window.KtaVue3D) return Promise.resolve(null);
    window.APP_CONFIG.activeLevel = 0;
    window.KtaVue3D.gesteAnime(false);
    return window.KtaVue3D.ouvrir({ depart: { x: g.J0.x - 30, y: g.J0.y, cap: 90 }, distanceVue: 30 }).then(function (o) {
      if (!o) return null;
      const e = window.KtaVue3D.etat();
      const n = (e.volumes || []).filter(function (v) {
        return v.genre === "rampe" && Math.hypot(v.x - g.J0.x, v.y - g.J0.y) < 1.5;
      }).length;
      return window.KtaVue3D.fermer().then(function () { return n; });
    });
  }, g);
}

(async function main() {
  // WebGL pour la vue 3D (mêmes options que checkup-vue-3d.js).
  const nav = await lancerNavigateur(chromium, { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });
  try {
    if (!PLAN.fictif) inf("⚠️ le relevé fictif n'est pas dans data/index.json — checkup sur « " + PLAN.nom + " »");
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    const page = await ctx.newPage();
    page.on("pageerror", function (e) { erreursPage.push(String(e)); });

    console.log("\n── Ouverture de « " + PLAN.nom + " » ──");
    await ouvrirPlan(page);
    const ml = await page.evaluate(function () {
      return { ml: window.APP_CONFIG.multiLevel === true, niveaux: window.APP_CONFIG.availableLevels };
    });
    if (!ml.ml || ml.niveaux.indexOf(-1) < 0) throw new Error("plan sans niveaux 0 / −1 : " + JSON.stringify(ml));
    const obst0 = await page.evaluate(function () { return window.Pathfinder.nbObstaclesDurs(); });
    const g = await semerCalque(page);
    g.uidJ = UID_J;
    await attendre(page, function () {
      return (window.getAllEmbeddedRoads() || []).filter(function (r) { return r && /_kta_modif/.test(r.uid || ""); })
        .length === 3;
    }, 15000);
    ok("calque fabriqué chargé (tracé 0 → jonction 0 ↔ −1 → tracé −1, zone inaccessible, mur en ligne)");

    console.log("\n── 1. Calque d'origine ──");
    const e0 = await lire(page, g);
    verifier(e0.jonctionEmbarquee === 1 && e0.segmentsJonction === 1 && e0.obstacles - obst0 === 2,
      "jonction lue une fois (embarquée, graphe), zone et mur comptés une fois", e0);
    verifier(e0.route.ok && e0.route.viaJonction, "itinéraire 0 → −1 par la jonction du calque", e0.route);
    const r0 = await rampes3d(page, g);
    if (r0 === null) inf("vue 3D indisponible ici (WebGL ou échelle) : passages 3D non joués");
    else verifier(r0 === 1, "vue 3D : un passage (rampe) au départ de la jonction", r0);

    console.log("\n── 2. « 🔄 Modifier » : la copie remplace l'original ──");
    const rap = await page.evaluate(function (id) { return window.CalqueSession.rapatrier(id); }, CALQUE);
    if (!rap || !rap.ok) throw new Error("rapatriement : " + JSON.stringify(rap));
    const e1 = await lire(page, g);
    verifier(e1.jonctionSession === 1, "copie de la jonction en session", e1);
    verifier(e1.embarquees === 0, "getAllEmbeddedRoads n'expose plus l'original du calque en modification", e1);
    verifier(e1.lecturesJonction === 1 && e1.lecturesTraces === 3 && e1.zones === 1 && e1.structures === 1,
      "comptes (session + calques) : chaque objet une fois, pas de doublon", e1);
    verifier(e1.segmentsJonction === 1, "graphe : un seul segment de jonction (pas de doublon)", e1);
    verifier(e1.obstacles - obst0 === 2, "obstacles durs : zone et mur comptés une fois", e1);
    verifier(e1.route.ok && e1.route.viaJonction, "itinéraire 0 → −1 par la copie de la jonction", e1.route);
    const r1 = await rampes3d(page, g);
    if (r1 !== null) verifier(r1 === 1, "vue 3D : un seul passage (la copie), pas de doublon", r1);

    console.log("\n── 3. Jonction, zone et mur supprimés de la copie ──");
    await page.evaluate(function () {
      const sauf = function (o) { return !(o && typeof o.uid === "string" && /^(rd_kta_modif_jonction|zn_kta_modif|st_kta_modif)$/.test(o.uid)); };
      window.setRoads((window.getRoads() || []).filter(sauf));
      window.setZones((window.getZones() || []).filter(sauf));
      window.setStructures((window.getStructures() || []).filter(sauf));
    });
    const e2 = await lire(page, g);
    verifier(e2.jonctionSession === 0 && e2.jonctionEmbarquee === 0 && e2.lecturesJonction === 0,
      "jonction supprimée : absente de la session et de getAllEmbeddedRoads", e2);
    verifier(e2.segmentsJonction === 0, "graphe : plus de segment de jonction", e2);
    verifier(!e2.route.ok || !e2.route.viaJonction, "itinéraire 0 → −1 : ne passe plus par la jonction supprimée",
      e2.route);
    verifier(e2.obstacles - obst0 === 0 && e2.zones === 0 && e2.structures === 0,
      "zone inaccessible et mur supprimés : plus d'obstacle, plus de compte", e2);
    const r2 = await rampes3d(page, g);
    if (r2 !== null) verifier(r2 === 0, "vue 3D : plus de passage au départ de la jonction supprimée", r2);

    console.log("\n── 4. Restitution : l'original revient ──");
    const res = await page.evaluate(function (id) { return window.CalqueSession.restituer(id); }, CALQUE);
    if (!res || !res.ok) throw new Error("restitution : " + JSON.stringify(res));
    const e3 = await lire(page, g);
    verifier(e3.jonctionSession === 0 && e3.jonctionEmbarquee === 1 && e3.segmentsJonction === 1,
      "jonction d'origine relue (embarquée, graphe)", e3);
    verifier(e3.obstacles - obst0 === 2, "zone et mur d'origine de nouveau obstacles", e3);
    verifier(e3.route.ok && e3.route.viaJonction, "itinéraire 0 → −1 de nouveau par la jonction d'origine", e3.route);
    const r3 = await rampes3d(page, g);
    if (r3 !== null) verifier(r3 === 1, "vue 3D : le passage de la jonction d'origine revient", r3);
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  erreursPage.slice(0, 10).forEach(function (m) { pb("erreur de page : " + m); });
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — un calque en modification est remplacé par sa copie dans toutes les lectures.");
  process.exit(0);
})();
