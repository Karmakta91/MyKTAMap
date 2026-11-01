#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-recaler-niveau.js — checkup (Playwright, pas un hook pré-commit) : « Dans quel niveau es-tu ? » au
// recalage par clic sur la carte d'un plan multi-niveau
// =====================================================================
// Sur le relevé fictif (multi-niveau), objets de SESSION fabriqués au lancement autour d'un point P où rien
// n'existe à 30 m (cherché sur le plan) ; vrais clics : menu Tracker › « Mode recalage », puis clic sur la carte.
// Cas : rien d'un autre niveau près du clic → pas de fenêtre, niveau actif ; tracé du −1 à 5 m → fenêtre 0 et −1,
// choix −1 → tracker et niveau affiché à −1, timeline `recalage` src "click" ; pilier du niveau 1 à 15 m → pas de
// fenêtre ; Annuler → position inchangée, mode recalage toujours armé ; jonction 0 ↔ −1 → 0 et −1 proposés ; POI
// jonction (jpe 0 + −2) → 0 et −2 ; picker « Où es-tu ? » (utils.js > ktaDemanderPositionCarte) : même fenêtre,
// Annuler laisse le picker armé, choix −1 → recalé à −1 ; plan forcé mono-niveau → jamais de fenêtre.
// Usage : node scripts/smoke/checkup-recaler-niveau.js (SMOKE_PORT pour une autre copie)
// Doc : docs/architecture/tracking.md
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

// Même repli que checkup-filtres-niveaux.js : on ouvre ce que l'index propose, en le disant.
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
    return !!window.PLAN_CONFIG && !!window.map && !!window.ktaSetActiveLevel && !!window.ouvrirMenuTracker
      && typeof window.ktaNiveauxRecalage === "function";
  }, 60000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

// Point P sans RIEN à 30 m (échelle triplée et niveau actif inexistant le temps du test), parcouru en spirale
// depuis le centre de l'image.
async function trouverPointLibre(page) {
  return page.evaluate(function () {
    const c = window.APP_CONFIG;
    const sc = c.scale, act = c.activeLevel;
    const W = c.imageWidth, H = c.imageHeight;
    let res = null;
    try {
      c.scale = sc * 3;
      c.activeLevel = 999;
      const pas = Math.max(20, Math.round(sc * 20));
      for (let k = 0; k < 4000 && !res; k++) {
        const a = k * 0.7, r = pas * Math.sqrt(k);
        const x = Math.round(W / 2 + r * Math.cos(a)), y = Math.round(H / 2 + r * Math.sin(a));
        if (x < 60 || y < 60 || x > W - 60 || y > H - 60) continue;
        if (window.ktaNiveauxRecalage(x, y) === null) res = { x: x, y: y };
      }
    } finally {
      c.scale = sc;
      c.activeLevel = act;
    }
    return res ? { x: res.x, y: res.y, sc: sc } : null;
  });
}

// Session remplacée par les objets du cas (tracés, structures, points), vue centrée sur P, niveau actif 0.
async function poserCas(page, P, objets) {
  await page.evaluate(function (a) {
    const P = a.P, s = a.P.sc;
    const pt = function (dx, dy) { return { x: P.x + dx * s, y: P.y + dy * s }; };
    const o = a.objets;
    window.setRoads((o.roads || []).map(function (r) {
      return Object.assign({}, r, { points: r.pts.map(function (q) { return pt(q[0], q[1]); }) });
    }));
    window.setStructures((o.structures || []).map(function (r) {
      return Object.assign({}, r, { points: r.pts.map(function (q) { return pt(q[0], q[1]); }) });
    }));
    window.setEditorPoints((o.points || []).map(function (r) {
      const q = pt(r.d[0], r.d[1]);
      return Object.assign({}, r, { x: q.x, y: q.y });
    }));
    window.ktaSetActiveLevel(0, { source: "checkup" });
    window.map.setView(convertCoord(P.x, P.y), 0, { animate: false });
  }, { P: P, objets: objets });
  await page.waitForTimeout(400);
}

async function armerRecalage(page) {
  await page.evaluate(function () { window.ouvrirMenuTracker(); });
  await page.locator(".kta-tracker-modal-tile", { hasText: "Mode recalage" }).first().click();
  await attendre(page, function () { return window.modeRecalage === true; }, 3000);
}

// Vrai clic souris sur le point (dx, dy) mètres de P.
async function cliquerCarte(page, P, dx, dy) {
  const xy = await page.evaluate(function (a) {
    const x = a.P.x + a.dx * a.P.sc, y = a.P.y + a.dy * a.P.sc;
    const cp = window.map.latLngToContainerPoint(convertCoord(x, y));
    const r = window.map.getContainer().getBoundingClientRect();
    return { cx: r.left + cp.x, cy: r.top + cp.y, x: x, y: y };
  }, { P: P, dx: dx, dy: dy });
  await page.mouse.click(xy.cx, xy.cy);
  await page.waitForTimeout(500);
  return xy;
}

function etat(page) {
  return page.evaluate(function () {
    const choix = Array.from(document.querySelectorAll("[data-kta-confirm-choix]"));
    const tl = window.getTrackingTimeline ? window.getTrackingTimeline() : [];
    const pos = window.getTrackingPosition ? window.getTrackingPosition() : null;
    return {
      fenetre: choix.length > 0,
      proposes: choix.map(function (r) { return Number(r.value); }),
      coche: (choix.find(function (r) { return r.checked; }) || {}).value,
      titre: (document.querySelector("#kta-recal-niveau .kta-readme-modal-titre") || {}).textContent || "",
      tracker: window.getTrackerLevel(),
      actif: window.APP_CONFIG.activeLevel,
      visibles: window.APP_CONFIG.visibleLevels.slice(),
      mode: window.modeRecalage === true,
      pos: pos ? { x: pos.x, y: pos.y } : null,
      dernier: tl.length ? tl[tl.length - 1] : null,
      nTl: tl.length,
      picker: !!(window.ktaDemanderPositionCarte && window.ktaDemanderPositionCarte.estActif())
    };
  });
}

async function choisir(page, niveau) {
  await page.locator('[data-kta-confirm-choix="' + niveau + '"]').check();
  await page.locator("#kta-confirm-oui").click();
  await page.waitForTimeout(500);
}

async function annuler(page) {
  await page.locator("#kta-confirm-non").click();
  await page.waitForTimeout(400);
}

const proche = function (a, b) { return a && b && Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6; };

(async function main() {
  const nav = await lancerNavigateur(chromium);
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
    // Multi-niveau forcé : le relevé fictif l'est déjà, on le pose quand même (le cas ne dépend pas des données).
    await page.evaluate(function () {
      window.APP_CONFIG.multiLevel = true;
      [-2, -1, 0, 1].forEach(function (n) {
        if (window.APP_CONFIG.availableLevels.indexOf(n) < 0) window.APP_CONFIG.availableLevels.push(n);
      });
      window.APP_CONFIG.visibleLevels = [0];
    });
    const P = await trouverPointLibre(page);
    if (!P) throw new Error("aucun point du plan sans objet à 30 m");
    ok("point de test libre trouvé (échelle " + P.sc + " px/m)");

    console.log("\n── 1. Rien d'un autre niveau à proximité ──");
    await poserCas(page, P, { roads: [{ type: "principal", level: 0, pts: [[-20, 3], [20, 3]] }] });
    await armerRecalage(page);
    let xy = await cliquerCarte(page, P, 0, 0);
    let e = await etat(page);
    verifier(!e.fenetre, "pas de fenêtre (seul le niveau actif est là)", e);
    verifier(e.tracker === 0 && proche(e.pos, xy) && !e.mode, "recalé au niveau actif 0, mode refermé", e);
    verifier(e.dernier && e.dernier.type === "recalage" && e.dernier.src === "click", "timeline : recalage src click", e.dernier);

    console.log("\n── 2. Tracé du −1 à 5 m ──");
    await poserCas(page, P, { roads: [{ type: "principal", level: -1, pts: [[-20, 5], [20, 5]] }] });
    await armerRecalage(page);
    xy = await cliquerCarte(page, P, 0, 0);
    e = await etat(page);
    verifier(e.fenetre && JSON.stringify(e.proposes) === "[0,-1]", "fenêtre avec 0 et −1", e.proposes);
    verifier(e.coche === "0", "niveau actif 0 coché d'office", e.coche);
    verifier(/niveau/i.test(e.titre), "titre « Dans quel niveau es-tu ? »", e.titre);
    await choisir(page, -1);
    e = await etat(page);
    verifier(!e.fenetre && e.tracker === -1 && e.actif === -1 && e.visibles.indexOf(-1) >= 0,
      "choix −1 : tracker à −1, niveau affiché −1", e);
    verifier(proche(e.pos, xy) && !e.mode, "position au clic, mode refermé", e);
    verifier(e.dernier && e.dernier.type === "recalage" && e.dernier.src === "click" && e.dernier.level === -1,
      "timeline : recalage src click au niveau −1", e.dernier);

    console.log("\n── 3. Pilier du niveau 1 à 15 m ──");
    await poserCas(page, P, { structures: [{ type: "pilier-1", level: 1,
      pts: [[15, -2], [18, -2], [18, 2], [15, 2]] }] });
    await armerRecalage(page);
    xy = await cliquerCarte(page, P, 0, 0);
    e = await etat(page);
    verifier(!e.fenetre && e.tracker === 0 && proche(e.pos, xy), "pas de fenêtre, recalé au niveau 0", e);

    console.log("\n── 3 bis. Dans un pilier du niveau 1 (point dedans, contour à plus de 10 m) ──");
    await poserCas(page, P, { structures: [{ type: "pilier-1", level: 1,
      pts: [[-12, -12], [12, -12], [12, 12], [-12, 12]] }] });
    await armerRecalage(page);
    await cliquerCarte(page, P, 0, 0);
    e = await etat(page);
    verifier(e.fenetre && JSON.stringify(e.proposes) === "[1,0]", "fenêtre avec 1 et 0", e.proposes);
    await annuler(page);

    console.log("\n── 4. Annuler ──");
    await poserCas(page, P, { roads: [{ type: "principal", level: -1, pts: [[-20, 5], [20, 5]] }] });
    const avant = await etat(page);
    if (!avant.mode) await armerRecalage(page);
    await cliquerCarte(page, P, 2, 0);
    e = await etat(page);
    verifier(e.fenetre, "fenêtre ouverte", e);
    await annuler(page);
    e = await etat(page);
    verifier(!e.fenetre && proche(e.pos, avant.pos) && e.nTl === avant.nTl, "position et timeline inchangées", e);
    verifier(e.mode && e.actif === 0, "mode recalage toujours armé, niveau affiché inchangé", e);
    xy = await cliquerCarte(page, P, 2, 0);
    e = await etat(page);
    verifier(e.fenetre, "un nouveau clic repose la question", e);
    await choisir(page, 0);
    e = await etat(page);
    verifier(e.tracker === 0 && proche(e.pos, xy) && !e.mode, "choix 0 : recalé au niveau 0", e);

    console.log("\n── 5. Jonction 0 ↔ −1 à proximité ──");
    await poserCas(page, P, { roads: [{ type: "jonction", fromLevel: 0, toLevel: -1, pts: [[-4, -6], [4, -6]] }] });
    await page.evaluate(function () { window.ktaSetActiveLevel(-2, { source: "checkup" }); });
    await armerRecalage(page);
    await cliquerCarte(page, P, 0, 0);
    e = await etat(page);
    verifier(e.fenetre && JSON.stringify(e.proposes) === "[0,-1,-2]",
      "niveau actif −2 : 0 et −1 proposés, plus le niveau actif", e.proposes);
    await annuler(page);
    await page.evaluate(function () { window.ktaSetActiveLevel(0, { source: "checkup" }); });
    await cliquerCarte(page, P, 0, 0);
    e = await etat(page);
    verifier(e.fenetre && JSON.stringify(e.proposes) === "[0,-1]", "niveau actif 0 : 0 et −1 proposés", e.proposes);
    await annuler(page);
    await page.evaluate(function () { if (window._fermerModeRecalage) window._fermerModeRecalage(); });

    console.log("\n── 6. POI jonction (jpe 0, dessert −2) à 6 m ; POI ordinaire du −1 ignoré ──");
    await poserCas(page, P, { points: [
      { id: "JpeTest", nom: "JpeTest", uid: "pt_jpetest", tags: ["jpe"], level: 0, niveaux: [-2], d: [6, 0] },
      { id: "SalleTest", nom: "SalleTest", uid: "pt_salletest", tags: ["salle"], level: -1, d: [-3, 0] }
    ] });
    await armerRecalage(page);
    await cliquerCarte(page, P, 0, 2);
    e = await etat(page);
    verifier(e.fenetre && JSON.stringify(e.proposes) === "[0,-2]", "0 et −2 proposés (pas −1)", e.proposes);
    await annuler(page);
    await page.evaluate(function () { if (window._fermerModeRecalage) window._fermerModeRecalage(); });

    console.log("\n── 7. Picker « Où es-tu ? » (guidage, sortie d'urgence, « Y aller ») ──");
    await poserCas(page, P, { roads: [{ type: "principal", level: -1, pts: [[-20, 5], [20, 5]] }] });
    await page.evaluate(function () {
      window._ktaPickRecu = null;
      window.ktaDemanderPositionCarte(function (p) { window._ktaPickRecu = p; }, { icone: "📍", texte: "test" });
    });
    const avantPick = await etat(page);
    await cliquerCarte(page, P, -2, 0);
    e = await etat(page);
    verifier(e.fenetre && JSON.stringify(e.proposes) === "[0,-1]", "même fenêtre, 0 et −1", e.proposes);
    await annuler(page);
    e = await etat(page);
    const recu1 = await page.evaluate(function () { return window._ktaPickRecu; });
    verifier(e.picker && !recu1 && proche(e.pos, avantPick.pos), "Annuler : rien de recalé, picker toujours armé", e);
    xy = await cliquerCarte(page, P, -2, 0);
    await choisir(page, -1);
    e = await etat(page);
    const recu2 = await page.evaluate(function () { return window._ktaPickRecu; });
    verifier(!e.picker && recu2 && proche(recu2, xy), "position rendue à l'appelant", recu2);
    verifier(e.tracker === -1 && e.actif === -1 && proche(e.pos, xy), "tracker et niveau affiché à −1", e);
    verifier(e.dernier && e.dernier.type === "recalage" && e.dernier.src === "point" && proche(e.dernier, xy) &&
      e.dernier.level === -1, "timeline : ancre recalage src point au niveau d'arrivée −1", e.dernier);

    console.log("\n── 7 bis. « 📍 Je suis ici » sur un POI du −1 (tracker au niveau 0 avant) ──");
    await poserCas(page, P, { points: [
      { id: "SalleIci", nom: "SalleIci", uid: "pt_salleici", tags: ["salle"], level: -1, d: [6, 0] }
    ] });
    await page.evaluate(function (P) { window.recalerTrackerSurPoint(P.x, P.y, 0); }, P);
    e = await etat(page);
    verifier(e.tracker === 0 && e.dernier && e.dernier.level === 0, "tracker remis au niveau 0", e.dernier);
    await page.evaluate(function () { window.ktaSetActiveLevel(-1, { source: "checkup" }); });
    await page.waitForTimeout(400);
    const xyPoi = await cliquerCarte(page, P, 6, 0);
    const ici = page.locator(".kta-popup-point .kta-popup-btn-here").first();
    if (await ici.count()) {
      await ici.click();
      await page.waitForTimeout(500);
      e = await etat(page);
      verifier(e.tracker === -1 && proche(e.pos, xyPoi), "tracker recalé sur le POI, au niveau −1", e);
      verifier(e.dernier && e.dernier.type === "recalage" && e.dernier.src === "point" && e.dernier.level === -1,
        "timeline : ancre « Je suis ici » au niveau d'arrivée −1", e.dernier);
    } else {
      pb("fiche du POI non ouverte par le clic : « Je suis ici » non testé");
    }
    await page.evaluate(function () { try { window.map.closePopup(); } catch (err) {} });

    console.log("\n── 8. Picker sans recalage (recaler: false) : jamais de fenêtre ──");
    await page.evaluate(function () {
      window._ktaPickRecu = null;
      window.ktaDemanderPositionCarte(function (p) { window._ktaPickRecu = p; }, { recaler: false, texte: "test" });
    });
    await cliquerCarte(page, P, 0, 0);
    e = await etat(page);
    const recu3 = await page.evaluate(function () { return window._ktaPickRecu; });
    verifier(!e.fenetre && recu3, "pas de fenêtre, position rendue", e);

    console.log("\n── 8 bis. Objets des calques de données (lus, pas cliqués) ──");
    const cal = await page.evaluate(function () {
      const r = (window.getAllEmbeddedRoads() || []).find(function (x) {
        return x && x.type !== "jonction" && Array.isArray(x.points) && x.points.length >= 2;
      });
      const z = (window.getAllEmbeddedZones() || [])[0] || null;
      const out = {};
      const essai = function (o, p) {
        const lvl = Number.isInteger(o.level) ? o.level : 0;
        const act = window.APP_CONFIG.activeLevel;
        window.APP_CONFIG.activeLevel = lvl + 7;   // niveau actif forcément autre
        try { const c = window.ktaNiveauxRecalage(p.x, p.y); return { lvl: lvl, niveaux: c ? c.niveaux : null }; }
        finally { window.APP_CONFIG.activeLevel = act; }
      };
      if (r) out.trace = essai(r, r.points[0]);
      if (z) out.zone = essai(z, z.points[0]);
      return out;
    });
    if (cal.trace) {
      verifier(cal.trace.niveaux && cal.trace.niveaux.indexOf(cal.trace.lvl) >= 0,
        "tracé d'un calque : son niveau proposé", cal.trace);
    } else inf("aucun tracé de calque sur ce plan");
    if (cal.zone) {
      verifier(cal.zone.niveaux && cal.zone.niveaux.indexOf(cal.zone.lvl) >= 0,
        "zone d'un calque : son niveau proposé", cal.zone);
    } else inf("aucune zone de calque sur ce plan");

    console.log("\n── 9. Plan mono-niveau ──");
    await page.evaluate(function () { window.APP_CONFIG.multiLevel = false; });
    await poserCas(page, P, { roads: [{ type: "principal", level: -1, pts: [[-20, 5], [20, 5]] },
      { type: "jonction", fromLevel: 0, toLevel: -1, pts: [[-4, -6], [4, -6]] }] });
    await armerRecalage(page);
    xy = await cliquerCarte(page, P, 0, 0);
    e = await etat(page);
    verifier(!e.fenetre && proche(e.pos, xy) && !e.mode, "clic de recalage : pas de fenêtre, recalé", e);
    await page.evaluate(function () { window.ktaDemanderPositionCarte(function () {}, { texte: "test" }); });
    xy = await cliquerCarte(page, P, 1, 0);
    e = await etat(page);
    verifier(!e.fenetre && proche(e.pos, xy) && !e.picker, "picker : pas de fenêtre, recalé", e);

    await page.evaluate(function () {
      window.setRoads([]); window.setStructures([]); window.setEditorPoints([]);
    });
  } catch (err) {
    pb("exception du harnais : " + (err && err.message));
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
  console.log("🎉 CHECKUP VERT — le recalage sur la carte demande le niveau quand un autre passe à moins de 10 m.");
  process.exit(0);
})();
