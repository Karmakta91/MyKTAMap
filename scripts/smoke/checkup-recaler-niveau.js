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
// Annuler laisse le picker armé, choix −1 → recalé à −1 et `niveau: -1` rendu ; ancres de timeline (picker,
// « Je suis ici » d'un POI du −1) au niveau d'arrivée ; « Y aller » et sortie d'urgence depuis le picker avec le
// choix −1 → la route part du −1 (tracés superposés 0 / −1, jonction) ; « Je suis ici » d'un POI du −1 pendant
// que le 0 est affiché → tracker au −1 (POI jonction : niveau affiché s'il le dessert) ; tracker au −1 : « Y aller »,
// « Recalculer d'ici » et sortie d'urgence partent du −1 ; « Tracer » vers une sortie du −1 finit sur le −1 ;
// « Y aller » de la fiche d'un POI du −1, depuis le 0, finit sur le −1 (POI jonction : même niveau que « Je suis
// ici ») ; « Je suis ici » d'un POI à côté de la galerie (§ 16, galerie de la vue 3D) : à 2 m → tracker sur le
// tracé de son niveau, à 8 m d'un tracé perso → dans sa galerie, déjà dans l'emprise → ne bouge pas, entre deux
// galeries → celle dont la paroi est la plus proche, à 30 m → sur le POI ; clic de recalage et picker à côté d'un
// tracé → dans la galerie, image de collision sans tracé → point accessible, et de même pour un POI d'un niveau sans
// tracé quand d'autres niveaux en ont (§ 16 bis) ; « Y aller » tracker arrêté (§ 17) : « D'où pars-tu ? » à chaque
// fois (« Ma dernière position (il y a …) » part de là, « Me repositionner » arme le picker, Annuler ne fait rien),
// picker direct si la position n'a jamais été confirmée ; mono-niveau → jamais de fenêtre.
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

// Sortie d'urgence lancée : attend le classement, « Tracer » la meilleure, attend l'itinéraire.
async function attendreSortie(page) {
  await attendre(page, function () {
    return !!document.querySelector(".kta-sortie-urgence-corps") &&
      !document.querySelector(".kta-sortie-urgence-corps .kta-sortie-loader");
  }, 20000).catch(function () {});
  await page.evaluate(function () { window.SortieUrgence._tracerMeilleure(); });
  await attendre(page, function () {
    return (window.getRoads() || []).some(function (x) { return x && x.type === "itinerary"; });
  }, 15000).catch(function () {});
}

const proche = function (a, b) { return a && b && Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6; };

// Fenêtre « D'où pars-tu ? » de « Y aller » (interfaceItineraire.js > _demanderDepart) : choix proposés et textes.
function questionDepart(page) {
  return page.evaluate(function () {
    const ov = document.getElementById("kta-iti-depart");
    if (!ov) return null;
    const choix = Array.from(ov.querySelectorAll("[data-kta-confirm-choix]"));
    return { choix: choix.map(function (r) { return r.value; }),
      coche: (choix.find(function (r) { return r.checked; }) || {}).value,
      textes: choix.map(function (r) { return r.parentNode.textContent; }),
      attenduDate: window.ktaDateRelative(window.getTrackingPositionEtat().ts) };
  });
}

// Répond à « D'où pars-tu ? » : `valeur` cochée puis OK, ou null = Annuler.
async function repondreDepart(page, valeur) {
  await attendre(page, function () { return !!document.getElementById("kta-iti-depart"); }, 3000).catch(function () {});
  // Pas de fenêtre : l'échec est déjà dit par la vérification qui précède (ou par la suite du cas).
  if (!(await page.locator("#kta-iti-depart").count())) { pb("« D'où pars-tu ? » absente"); return; }
  if (valeur === null) await page.locator("#kta-iti-depart #kta-confirm-non").click();
  else {
    await page.locator('#kta-iti-depart [data-kta-confirm-choix="' + valeur + '"]').check();
    await page.locator("#kta-iti-depart #kta-confirm-oui").click();
  }
  await page.waitForTimeout(300);
}

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
    // Un tap hors de l'emprise d'un tracé est-ouest (axe à dyAxe m de P) est recalé sur l'axe, au droit du tap.
    const surAxe = function (xy, dyAxe) { return { x: xy.x, y: P.y + dyAxe * P.sc }; };

    console.log("\n── 1. Rien d'un autre niveau à proximité ──");
    await poserCas(page, P, { roads: [{ type: "principal", level: 0, pts: [[-20, 3], [20, 3]] }] });
    await armerRecalage(page);
    let xy = await cliquerCarte(page, P, 0, 0);
    let e = await etat(page);
    verifier(!e.fenetre, "pas de fenêtre (seul le niveau actif est là)", e);
    // Le tap tombe à 3 m du tracé, hors de son emprise : le tracker va sur l'axe (même règle que « Je suis ici »).
    verifier(e.tracker === 0 && proche(e.pos, surAxe(xy, 3)) && !e.mode,
      "recalé au niveau actif 0, dans la galerie (tap à 3 m de l'axe), mode refermé", e);
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
    verifier(proche(e.pos, surAxe(xy, 5)) && !e.mode, "position dans la galerie du −1 (tracé à 5 m), mode refermé", e);
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
    // Tap à 5 m du tracé du −1 : tracker dans la galerie ; l'appelant reçoit la position du tracker.
    const ga7 = surAxe(xy, 5);
    verifier(!e.picker && recu2 && proche(recu2, ga7), "position rendue à l'appelant = celle du tracker (galerie)", recu2);
    verifier(recu2 && recu2.niveau === -1, "niveau choisi rendu à l'appelant (niveau: −1)", recu2);
    verifier(e.tracker === -1 && e.actif === -1 && proche(e.pos, ga7), "tracker dans la galerie et niveau affiché à −1", e);
    verifier(e.dernier && e.dernier.type === "recalage" && e.dernier.src === "point" && proche(e.dernier, ga7) &&
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
    verifier(recu3 && recu3.niveau === e.actif, "niveau rendu = niveau actif (" + e.actif + ")", recu3);

    // Réseau du cas : deux tracés superposés (0 et −1), une jonction à l'ouest, une antenne du 0 vers la cible.
    // Sans niveau, le départ se cale sur le tracé du 0 (premier à égalité de distance) : l'itinéraire n'a
    // pas besoin de la jonction.
    const RESEAU = { roads: [
      { type: "principal", level: 0, pts: [[-20, 5], [20, 5]] },
      { type: "principal", level: -1, pts: [[-20, 5], [20, 5]] },
      { type: "jonction", fromLevel: 0, toLevel: -1, pts: [[-20, 5], [-24, 5], [-20, 5]] },
      { type: "principal", level: 0, pts: [[15, 5], [15, 20]] }
    ] };
    const itineraire = function () {
      return page.evaluate(function () {
        const r = (window.getRoads() || []).find(function (x) { return x && x.type === "itinerary"; });
        if (!r) return null;
        return { wp0: r.waypoints && r.waypoints[0], p0: r.points[0],
          niveaux: r.points.map(function (q) { return q.level; }), dernier: r.points[r.points.length - 1] };
      });
    };
    const effacerItineraire = function () {
      return page.evaluate(function () {
        window.setRoads((window.getRoads() || []).filter(function (x) { return x.type !== "itinerary"; }));
      });
    };

    console.log("\n── 10. « Y aller » depuis « Où es-tu ? » avec le choix −1 ──");
    await page.evaluate(function () {
      window.resetTrackingPosition();
      window.ktaSetActiveLevel(0, { source: "checkup" });
    });
    await poserCas(page, P, RESEAU);
    const temoin = await page.evaluate(async function (P) {
      const s = P.sc;
      const r = await window.Pathfinder.computeRoute([{ x: P.x - 2 * s, y: P.y }, { x: P.x + 15 * s, y: P.y + 20 * s }],
        { avoidPoints: [], avoidTags: [], avoidZones: [], avoidRadius: 0 });
      return r.path[0].level;
    }, P);
    inf("témoin sans niveau : départ calé au niveau " + temoin);
    const cible = await page.evaluate(function (P) {
      const c = { x: P.x + 15 * P.sc, y: P.y + 20 * P.sc };
      window.itineraireYAller(c.x, c.y, "CibleTest");
      return c;
    }, P);
    e = await etat(page);
    verifier(e.picker, "position non confirmée : « Où es-tu ? » armé", e);
    xy = await cliquerCarte(page, P, -2, 0);
    e = await etat(page);
    verifier(e.fenetre && JSON.stringify(e.proposes) === "[0,-1]", "fenêtre avec 0 et −1", e.proposes);
    await choisir(page, -1);
    await attendre(page, function () {
      return (window.getRoads() || []).some(function (x) { return x && x.type === "itinerary"; });
    }, 15000).catch(function () {});
    let it = await itineraire();
    verifier(it && it.wp0 && it.wp0.level === -1, "waypoint de départ au niveau −1", it && it.wp0);
    verifier(it && it.p0 && it.p0.level === -1, "la route commence sur un tracé du −1", it && it.p0);
    verifier(it && it.niveaux.indexOf(0) >= 0 && proche(it.dernier, cible),
      "elle passe par la jonction et rejoint la cible au niveau 0", it && it.niveaux);
    await effacerItineraire();

    console.log("\n── 11. Sortie d'urgence depuis « Où es-tu ? » avec le choix −1, puis « Tracer » ──");
    await page.evaluate(function () {
      window.resetTrackingPosition();
      window.ktaSetActiveLevel(0, { source: "checkup" });
    });
    await poserCas(page, P, Object.assign({}, RESEAU, { points: [
      { id: "SortieTest", nom: "SortieTest", uid: "pt_sortietest", tags: ["cao"], level: 0, d: [15, 20] }
    ] }));
    await page.evaluate(function () { window.SortieUrgence.declencher(); });
    await page.waitForTimeout(400);
    e = await etat(page);
    verifier(e.picker, "position non confirmée : « Où es-tu ? » armé", e);
    await cliquerCarte(page, P, -2, 0);
    await choisir(page, -1);
    await attendre(page, function () {
      return !!document.querySelector(".kta-sortie-urgence-corps") &&
        !document.querySelector(".kta-sortie-urgence-corps .kta-sortie-loader");
    }, 20000).catch(function () {});
    await page.evaluate(function () { window.SortieUrgence._tracerMeilleure(); });
    await attendre(page, function () {
      return (window.getRoads() || []).some(function (x) { return x && x.type === "itinerary"; });
    }, 15000).catch(function () {});
    it = await itineraire();
    verifier(it && it.wp0 && it.wp0.level === -1, "« Tracer » : waypoint de départ au niveau −1", it && it.wp0);
    verifier(it && it.p0 && it.p0.level === -1 && it.niveaux.indexOf(0) >= 0,
      "la route d'évacuation part du −1 et passe par la jonction", it && it.niveaux);
    await effacerItineraire();
    await page.evaluate(function () { if (window.SortieUrgence.isActive()) window.SortieUrgence._fermer(); });

    console.log("\n── 12. « 📍 Je suis ici » sur un POI du −1 pendant que le 0 est affiché ──");
    await poserCas(page, P, { points: [
      { id: "SalleIci2", nom: "SalleIci2", uid: "pt_salleici2", tags: ["salle"], level: -1, d: [6, 0] }
    ] });
    await page.evaluate(function (P) {
      window.recalerTrackerSurPoint(P.x, P.y, 0);
      window.ktaSetActiveLevel(-1, { source: "checkup" });   // union : −1 et 0 affichés, 0 actif ensuite
      window.ktaSetActiveLevel(0, { source: "checkup" });
    }, P);
    await page.waitForTimeout(400);
    e = await etat(page);
    verifier(e.actif === 0 && e.visibles.indexOf(-1) >= 0 && e.tracker === 0,
      "niveau affiché 0, −1 visible, tracker au 0", e);
    const xyPoi2 = await cliquerCarte(page, P, 6, 0);
    const ici2 = page.locator(".kta-popup-point .kta-popup-btn-here").first();
    if (await ici2.count()) {
      await ici2.click();
      await page.waitForTimeout(500);
      e = await etat(page);
      verifier(e.tracker === -1 && proche(e.pos, xyPoi2), "tracker recalé sur le POI au niveau du POI (−1)", e);
      verifier(e.dernier && e.dernier.src === "point" && e.dernier.level === -1, "ancre au niveau −1", e.dernier);
    } else {
      pb("fiche du POI du −1 non ouverte par le clic : cas 12 non testé");
    }
    await page.evaluate(function () { try { window.map.closePopup(); } catch (err) {} });
    // POI jonction (jpe 0, dessert −2) : niveau affiché s'il en fait partie, sinon son niveau propre.
    const niveauxJpe = await page.evaluate(function () {
      const pt = { id: "J", nom: "J", tags: ["jpe"], level: 0, niveaux: [-2], x: 10, y: 10 };
      return [-2, 0, -1].map(function (n) {
        window.APP_CONFIG.activeLevel = n;
        const h = window.buildPointPopupHtml(pt, false);
        const m = /kta-popup-btn-here[^>]*data-kta-niveau="(-?\d+)"/.exec(h);
        const a = /kta-popup-btn-aller[^>]*data-kta-niveau="(-?\d+)"/.exec(h);
        return [m ? Number(m[1]) : null, a ? Number(a[1]) : null];
      });
    });
    await page.evaluate(function () { window.ktaSetActiveLevel(0, { source: "checkup" }); });
    verifier(JSON.stringify(niveauxJpe) === "[[-2,-2],[0,0],[0,0]]",
      "jonction (« Je suis ici » et « Y aller ») : affiché −2 → −2, affiché 0 → 0, affiché −1 (non desservi) → " +
      "son niveau 0", niveauxJpe);

    console.log("\n── 13. Tracker au −1, « Y aller » vers une cible du 0 (niveau affiché 0) ──");
    await poserCas(page, P, RESEAU);
    await page.evaluate(function (P) {
      window.recalerTrackerSurPoint(P.x - 2 * P.sc, P.y, -1);
      window.ktaSetActiveLevel(0, { source: "checkup" });
    }, P);
    e = await etat(page);
    verifier(e.tracker === -1 && e.actif === 0, "tracker au −1, niveau affiché 0", e);
    const cible13 = await page.evaluate(function (P) {
      const c = { x: P.x + 15 * P.sc, y: P.y + 20 * P.sc };
      window.itineraireYAller(c.x, c.y, "CibleTest");
      return c;
    }, P);
    // Tracker arrêté, position confirmée : la question se pose ; « Ma dernière position » part du tracker.
    await page.waitForTimeout(200);
    const q13 = await questionDepart(page);
    verifier(q13 && JSON.stringify(q13.choix) === '["derniere","repositionner"]' && q13.coche === "derniere" &&
      q13.textes[0].indexOf(q13.attenduDate) >= 0,
      "tracker arrêté : « D'où pars-tu ? » (dernière position datée, me repositionner)", q13);
    await repondreDepart(page, "derniere");
    await attendre(page, function () {
      return (window.getRoads() || []).some(function (x) { return x && x.type === "itinerary"; });
    }, 15000).catch(function () {});
    it = await itineraire();
    verifier(it && it.wp0 && it.wp0.level === -1, "waypoint de départ au niveau du tracker (−1)", it && it.wp0);
    verifier(it && it.p0 && it.p0.level === -1 && it.niveaux.indexOf(0) >= 0 && proche(it.dernier, cible13),
      "la route commence sur le tracé du −1 et rejoint la cible au 0", it && it.niveaux);
    // « Recalculer d'ici » (guidage) : itineraireReplanifierDepuis depuis la position du tracker.
    await page.evaluate(function () {
      window._ktaReplanFait = false;
      const p = window.getTrackingPosition();
      Promise.resolve(window.itineraireReplanifierDepuis(p.x, p.y)).then(function () { window._ktaReplanFait = true; });
    });
    await attendre(page, function () { return window._ktaReplanFait === true; }, 15000).catch(function () {});
    it = await itineraire();
    verifier(it && it.wp0 && it.wp0.level === -1 && it.p0 && it.p0.level === -1,
      "« Recalculer d'ici » : départ au niveau du tracker (−1)", it && { wp0: it.wp0, p0: it.p0 });
    await effacerItineraire();

    console.log("\n── 14. Sortie d'urgence depuis le tracker au −1 (position confirmée), puis « Tracer » ──");
    await poserCas(page, P, Object.assign({}, RESEAU, { points: [
      { id: "SortieTest", nom: "SortieTest", uid: "pt_sortietest", tags: ["cao"], level: 0, d: [15, 20] }
    ] }));
    await page.evaluate(function (P) {
      window.recalerTrackerSurPoint(P.x - 2 * P.sc, P.y, -1);
      window.ktaSetActiveLevel(0, { source: "checkup" });
      window.SortieUrgence.declencher();
    }, P);
    await attendreSortie(page);
    it = await itineraire();
    verifier(it && it.wp0 && it.wp0.level === -1 && it.p0 && it.p0.level === -1,
      "sortie d'urgence sans picker : départ au niveau du tracker (−1)", it && { wp0: it.wp0, p0: it.p0 });
    await effacerItineraire();
    await page.evaluate(function () { if (window.SortieUrgence.isActive()) window.SortieUrgence._fermer(); });

    console.log("\n── 15. « Tracer » vers une sortie du −1, depuis le 0 ──");
    // Sortie posée sur les tracés superposés : sans son niveau, l'arrivée se cale sur le tracé du 0.
    await poserCas(page, P, Object.assign({}, RESEAU, { points: [
      { id: "SortieBas", nom: "SortieBas", uid: "pt_sortiebas", tags: ["cao"], level: -1, d: [10, 5] }
    ] }));
    await page.evaluate(function (P) {
      window.recalerTrackerSurPoint(P.x - 2 * P.sc, P.y, 0);
      window.SortieUrgence.declencher();
    }, P);
    await attendreSortie(page);
    it = await itineraire();
    verifier(it && it.p0 && it.p0.level === 0, "départ au niveau du tracker (0)", it && it.p0);
    verifier(it && it.dernier && it.dernier.level === -1,
      "la route finit sur le tracé du −1 (niveau de la sortie)", it && { dernier: it.dernier, niveaux: it.niveaux });
    await effacerItineraire();
    await page.evaluate(function () { if (window.SortieUrgence.isActive()) window.SortieUrgence._fermer(); });

    console.log("\n── 15 bis. « Y aller » de la fiche d'un POI du −1, depuis le 0 ──");
    // POI posé sur les tracés superposés : sans son niveau, l'arrivée se cale sur le tracé du 0.
    await poserCas(page, P, Object.assign({}, RESEAU, { points: [
      { id: "SalleBas", nom: "SalleBas", uid: "pt_sallebas", tags: ["salle"], level: -1, d: [10, 5] }
    ] }));
    await page.evaluate(function (P) {
      window.recalerTrackerSurPoint(P.x - 2 * P.sc, P.y, 0);
      window.ktaSetActiveLevel(-1, { source: "checkup" });   // union : −1 et 0 affichés, 0 actif ensuite
      window.ktaSetActiveLevel(0, { source: "checkup" });
    }, P);
    await page.waitForTimeout(400);
    const xyBas = await cliquerCarte(page, P, 10, 5);
    const aller = page.locator(".kta-popup-point .kta-popup-btn-aller").first();
    if (await aller.count()) {
      const nivBtn = await aller.getAttribute("data-kta-niveau");
      await aller.click();
      await repondreDepart(page, "derniere");
      await attendre(page, function () {
        return (window.getRoads() || []).some(function (x) { return x && x.type === "itinerary"; });
      }, 15000).catch(function () {});
      it = await itineraire();
      verifier(nivBtn === "-1", "bouton « Y aller » au niveau du POI (−1), 0 affiché", nivBtn);
      verifier(it && it.p0 && it.p0.level === 0, "départ au niveau du tracker (0)", it && it.p0);
      verifier(it && it.dernier && it.dernier.level === -1 && proche(it.dernier, xyBas),
        "la route finit sur le tracé du −1 (niveau du POI)", it && { dernier: it.dernier, niveaux: it.niveaux });
    } else {
      pb("fiche du POI du −1 non ouverte par le clic : cas 15 bis non testé");
    }
    await effacerItineraire();
    await page.evaluate(function () { try { window.map.closePopup(); } catch (err) {} });

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

    // « Je suis ici » d'un POI posé à côté du tracé (tracking.js > _positionDansGalerie, galerie de la vue 3D :
    // KtaGalerie.versGalerie) : hors emprise, le tracker va sur l'axe de la galerie DU NIVEAU du POI dont l'emprise
    // est la plus proche, à moins de 10 m d'un axe ; dans l'emprise, il reste sur le POI ; le POI ne bouge pas.
    // Tracé du 0 sur y = 0, tracé du −1 sur y = 5 (en m depuis P).
    console.log("\n── 16. « 📍 Je suis ici » d'un POI à côté de la galerie ──");
    const GALERIES = [
      { type: "principal", level: 0, pts: [[-20, 0], [20, 0]] },
      { type: "principal", level: -1, pts: [[-20, 5], [20, 5]] }
    ];
    const iciSurPoi = async function (poi, affiche, roads) {
      await poserCas(page, P, { roads: roads || GALERIES, points: [poi] });
      await page.evaluate(function (a) {
        window.recalerTrackerSurPoint(a.P.x, a.P.y - 40 * a.P.sc, 0);
        window.ktaSetActiveLevel(-1, { source: "checkup" });   // union : −1 et 0 affichés
        window.ktaSetActiveLevel(a.affiche, { source: "checkup" });
      }, { P: P, affiche: affiche });
      await page.waitForTimeout(400);
      const xy = await cliquerCarte(page, P, poi.d[0], poi.d[1]);
      const bouton = page.locator(".kta-popup-point .kta-popup-btn-here").first();
      if (!(await bouton.count())) { pb("fiche de " + poi.nom + " non ouverte par le clic"); return null; }
      await bouton.click();
      await page.waitForTimeout(500);
      const e = await etat(page);
      const poiApres = await page.evaluate(function (id) {
        const q = (window.getEditorPoints() || []).find(function (x) { return x && x.id === id; });
        return q ? { x: q.x, y: q.y } : null;
      }, poi.id);
      await page.evaluate(function () { try { window.map.closePopup(); } catch (err) {} });
      const m = function (q) { return q ? { dx: (q.x - P.x) / P.sc, dy: (q.y - P.y) / P.sc } : null; };
      return { e: e, poi: xy, poiApres: poiApres, pos: m(e.pos), ancre: m(e.dernier) };
    };

    let r16 = await iciSurPoi({ id: "Bord", nom: "Bord", uid: "pt_bord", tags: ["salle"], level: 0, d: [3, 2] }, 0);
    if (r16) {
      verifier(r16.pos && Math.abs(r16.pos.dy) < 0.1 && Math.abs(r16.pos.dx - 3) < 0.1 && r16.e.tracker === 0,
        "POI du 0 à 2 m du tracé : tracker sur le tracé (écart < 0,1 m), niveau 0", r16.pos);
      verifier(r16.ancre && Math.abs(r16.ancre.dy) < 0.1 && r16.e.dernier.src === "point" &&
        r16.e.dernier.level === 0, "ancre de timeline à la position ajustée", r16.e.dernier);
      verifier(proche(r16.poiApres, r16.poi), "le POI n'a pas bougé", r16.poiApres);
    }
    r16 = await iciSurPoi({ id: "Loin", nom: "Loin", uid: "pt_loin", tags: ["salle"], level: 0, d: [3, -30] }, 0);
    if (r16) {
      verifier(proche(r16.e.pos, r16.poi) && r16.e.tracker === 0, "POI à 30 m du tracé : tracker sur le POI", r16.pos);
    }
    r16 = await iciSurPoi({ id: "Bas", nom: "Bas", uid: "pt_bas", tags: ["salle"], level: -1, d: [-3, 2] }, 0);
    if (r16) {
      verifier(r16.pos && Math.abs(r16.pos.dy - 5) < 0.1 && Math.abs(r16.pos.dx + 3) < 0.1 && r16.e.tracker === -1,
        "POI du −1 (tracé du 0 à 2 m, du −1 à 3 m) : tracker sur le tracé du −1, niveau −1", r16.pos);
    }
    // Tracé d'un type perso (tube de 2 m en 3D) à 8 m : au-delà de l'ancien rayon (6 m, types du graphe seulement).
    r16 = await iciSurPoi({ id: "Perso", nom: "Perso", uid: "pt_perso", tags: ["salle"], level: 0, d: [3, 8] }, 0,
      [{ type: "cust-checkup", level: 0, pts: [[-20, 0], [20, 0]] }]);
    if (r16) {
      const dd = await page.evaluate(function () {
        const p = window.getTrackingPosition();
        return window.KtaGalerie.dedans(p.x, p.y, 0);
      });
      verifier(r16.pos && Math.abs(r16.pos.dy) < 0.1 && Math.abs(r16.pos.dx - 3) < 0.1 && dd && r16.e.tracker === 0,
        "POI à 8 m d'un tracé perso : tracker recalé dans sa galerie (sur l'axe)", { pos: r16.pos, dedans: dd });
    }
    // Déjà dans l'emprise (1 m de l'axe d'un principal de 2,5 m) : le tracker reste sur le POI.
    r16 = await iciSurPoi({ id: "Dedans", nom: "Dedans", uid: "pt_dedans", tags: ["salle"], level: 0, d: [3, 1] }, 0);
    if (r16) {
      verifier(proche(r16.e.pos, r16.poi) && r16.e.tracker === 0, "POI déjà dans la galerie : le tracker ne bouge pas",
        r16.pos);
    }
    // Entre deux galeries séparées par la roche : principal (2,5 m) sur y = 0, chemin (1,7 m) sur y = 7, POI à
    // y = 3,6. L'axe le plus proche est celui du chemin (3,4 m) ; la paroi la plus proche, celle du principal
    // (2,35 m contre 2,55 m) : c'est elle qu'il faut rejoindre, avec le moins de roche à franchir.
    r16 = await iciSurPoi({ id: "Entre", nom: "Entre", uid: "pt_entre", tags: ["salle"], level: 0, d: [3, 3.6] }, 0,
      [{ type: "principal", level: 0, pts: [[-20, 0], [20, 0]] }, { type: "chemin", level: 0, pts: [[-20, 7], [20, 7]] }]);
    if (r16) {
      verifier(r16.pos && Math.abs(r16.pos.dy) < 0.1 && Math.abs(r16.pos.dx - 3) < 0.1,
        "POI entre deux galeries : tracker dans celle dont la paroi est la plus proche (principal), pas l'axe le plus " +
        "proche (chemin)", r16.pos);
    }
    // Les autres recalages (portail, Secours, vue 3D) passent sans `dansGalerie` : point exact.
    const exact = await page.evaluate(function (P) {
      const x = P.x + 3 * P.sc, y = P.y + 2 * P.sc;
      window.recalerTrackerSurPoint(x, y, 0);
      const pos = window.getTrackingPosition();
      return { ok: Math.abs(pos.x - x) < 0.01 && Math.abs(pos.y - y) < 0.01, pos: pos };
    }, P);
    verifier(exact.ok, "recalage sans « dansGalerie » (portail, Secours) : coordonnées exactes", exact.pos);
    // Plan sans tracé (simulé : Pathfinder.aDesTraces rend false, session et calques vides) : point accessible le plus proche
    // de l'image de collision. Cherche un point refusé qui a un point accessible à moins de 3 m.
    const coll = await page.evaluate(function () {
      const c = window.APP_CONFIG, sc = c.scale, acc = window.ktaEstAccessible;
      let cas = null;
      for (let y = 80; y < c.imageHeight - 80 && !cas; y += 37) {
        for (let x = 80; x < c.imageWidth - 80 && !cas; x += 37) {
          if (acc(x, y)) continue;
          for (let a = 0; a < 16 && !cas; a++) {
            const qx = x + 2 * sc * Math.cos(a * Math.PI / 8), qy = y + 2 * sc * Math.sin(a * Math.PI / 8);
            if (acc(qx, qy)) cas = { x: x, y: y };
          }
        }
      }
      if (!cas) return null;
      const pf = window.Pathfinder, orig = pf.aDesTraces, emb = window.getAllEmbeddedRoads;
      const roads = window.getRoads().slice();
      try {
        pf.aDesTraces = function () { return false; };
        window.getAllEmbeddedRoads = function () { return []; };
        window.setRoads([]);
        window.recalerTrackerSurPoint(cas.x, cas.y, 0, { dansGalerie: true });
      } finally {
        pf.aDesTraces = orig;
        window.getAllEmbeddedRoads = emb;
        window.setRoads(roads);
      }
      const pos = window.getTrackingPosition();
      return { accessible: acc(pos.x, pos.y), dM: Math.hypot(pos.x - cas.x, pos.y - cas.y) / sc };
    });
    if (coll) {
      verifier(coll.accessible && coll.dM <= 3.1, "plan sans tracé : tracker sur le point accessible le plus proche",
        coll);
    } else inf("pas d'image de collision exploitable : repli sur l'image non testé");

    // § 16 bis. POI d'un niveau sans aucun tracé, alors que d'autres niveaux en ont : même repli sur l'image de
    // collision (avant : on restait sur l'icône dès que le plan avait un tracé quelque part).
    console.log("\n── 16 bis. « 📍 Je suis ici » d'un POI d'un niveau sans tracé (d'autres niveaux en ont) ──");
    const coll2 = await page.evaluate(function () {
      const c = window.APP_CONFIG, sc = c.scale, acc = window.ktaEstAccessible;
      let cas = null;
      for (let y = 80; y < c.imageHeight - 80 && !cas; y += 37) {
        for (let x = 80; x < c.imageWidth - 80 && !cas; x += 37) {
          if (acc(x, y)) continue;
          for (let a = 0; a < 16 && !cas; a++) {
            const qx = x + 2 * sc * Math.cos(a * Math.PI / 8), qy = y + 2 * sc * Math.sin(a * Math.PI / 8);
            if (acc(qx, qy)) cas = { x: x, y: y };
          }
        }
      }
      if (!cas) return null;
      const roads = window.getRoads().slice(), emb = window.getAllEmbeddedRoads;
      const out = {};
      try {
        // Tracés au niveau 0 seulement (loin du POI) ; aucun calque ; le POI est au −2.
        window.getAllEmbeddedRoads = function () { return []; };
        window.setRoads([{ type: "principal", level: 0, points: [{ x: cas.x + 40 * sc, y: cas.y },
          { x: cas.x + 80 * sc, y: cas.y }] }]);
        out.aDesTraces = window.Pathfinder.aDesTraces();
        window.recalerTrackerSurPoint(cas.x, cas.y, -2, { dansGalerie: true });
        const p = window.getTrackingPosition();
        out.bas = { accessible: acc(p.x, p.y), dM: Math.hypot(p.x - cas.x, p.y - cas.y) / sc, niveau: window.getTrackerLevel() };
        // Contre-cas : au niveau 0 (qui a un tracé, à 40 m, plus de 10 m), on reste sur le POI.
        window.recalerTrackerSurPoint(cas.x, cas.y, 0, { dansGalerie: true });
        const q = window.getTrackingPosition();
        out.zero = { dM: Math.hypot(q.x - cas.x, q.y - cas.y) / sc };
      } finally {
        window.getAllEmbeddedRoads = emb;
        window.setRoads(roads);
      }
      return out;
    });
    if (coll2) {
      verifier(coll2.aDesTraces && coll2.bas.accessible && coll2.bas.dM > 0 && coll2.bas.dM <= 3.1 &&
        coll2.bas.niveau === -2, "POI du −2 sans tracé à ce niveau (le 0 en a) : point accessible le plus proche",
        coll2.bas);
      verifier(coll2.zero.dM < 0.01, "POI du 0, tracé du 0 à 40 m (plus de 10 m) : tracker sur le POI", coll2.zero);
    } else inf("pas d'image de collision exploitable : § 16 bis non testé");

    // § 17. « Y aller », tracker arrêté : la question se pose chaque fois ; Annuler ne fait rien ; « Me
    // repositionner » arme le picker ; jamais confirmée → picker direct, sans question.
    console.log("\n── 17. « Y aller », tracker arrêté : « D'où pars-tu ? » ──");
    await poserCas(page, P, RESEAU);
    await effacerItineraire();
    await page.evaluate(function (P) {
      if (window.getTrackingActif()) window.stopTracking();
      window.recalerTrackerSurPoint(P.x - 2 * P.sc, P.y, 0);
      window.ktaSetActiveLevel(0, { source: "checkup" });
      window.itineraireYAller(P.x + 15 * P.sc, P.y + 20 * P.sc, "CibleTest");
    }, P);
    await page.waitForTimeout(200);
    const q17 = await questionDepart(page);
    verifier(!!q17 && q17.choix.indexOf("ici") < 0, "question posée (pas de « Ici » hors vue 3D)", q17);
    await repondreDepart(page, null);
    const ann = await page.evaluate(function () {
      return { iti: (window.getRoads() || []).some(function (x) { return x && x.type === "itinerary"; }),
        picker: window.ktaDemanderPositionCarte.estActif(), fenetre: !!document.getElementById("kta-iti-depart") };
    });
    verifier(!ann.iti && !ann.picker && !ann.fenetre, "Annuler : ni itinéraire, ni picker", ann);
    await page.evaluate(function (P) { window.itineraireYAller(P.x + 15 * P.sc, P.y + 20 * P.sc, "CibleTest"); }, P);
    await repondreDepart(page, "repositionner");
    e = await etat(page);
    verifier(e.picker, "« Me repositionner » : le picker « Où es-tu ? » est armé", e.picker);
    await page.evaluate(function () { window.ktaDemanderPositionCarte.annuler(); });
    await page.evaluate(function (P) {
      window.resetTrackingPosition();
      window.itineraireYAller(P.x + 15 * P.sc, P.y + 20 * P.sc, "CibleTest");
    }, P);
    await page.waitForTimeout(200);
    const direct = await page.evaluate(function () {
      return { fenetre: !!document.getElementById("kta-iti-depart"), picker: window.ktaDemanderPositionCarte.estActif() };
    });
    verifier(!direct.fenetre && direct.picker, "jamais confirmée : picker direct, sans question", direct);
    await page.evaluate(function () { window.ktaDemanderPositionCarte.annuler(); });
    await effacerItineraire();

    console.log("\n── 9. Plan mono-niveau ──");
    await page.evaluate(function () { window.APP_CONFIG.multiLevel = false; });
    await poserCas(page, P, { roads: [{ type: "principal", level: -1, pts: [[-20, 5], [20, 5]] },
      { type: "jonction", fromLevel: 0, toLevel: -1, pts: [[-4, -6], [4, -6]] }] });
    await armerRecalage(page);
    xy = await cliquerCarte(page, P, 0, 0);
    e = await etat(page);
    verifier(!e.fenetre && proche(e.pos, surAxe(xy, 5)) && !e.mode,
      "clic de recalage : pas de fenêtre, recalé dans la galerie (tous niveaux : plan mono-niveau)", e);
    await page.evaluate(function () {
      window._ktaPickRecu = null;
      window.ktaDemanderPositionCarte(function (p) { window._ktaPickRecu = p; }, { texte: "test" });
    });
    xy = await cliquerCarte(page, P, 1, 0);
    e = await etat(page);
    verifier(!e.fenetre && proche(e.pos, surAxe(xy, 5)) && !e.picker, "picker : pas de fenêtre, recalé dans la galerie", e);
    const recu4 = await page.evaluate(function () { return window._ktaPickRecu; });
    verifier(recu4 && recu4.niveau === undefined, "picker : pas de niveau rendu", recu4);

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
