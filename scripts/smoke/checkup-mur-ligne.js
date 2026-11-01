#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-mur-ligne.js — checkup (Playwright) : le mur en ligne coupe l'itinéraire
// =====================================================================
// Objets FICTIFS posés au centre de la vue (relevé fictif, sinon le premier plan de l'index) : une galerie droite
// A → B, un détour par le bas, un front de taille en travers de la galerie droite.
// Vérifie : le front ne coupe rien ; sa fiche propose « mur (ligne) » et le convertit ; l'itinéraire contourne
// alors le mur, échoue quand le mur ferme tout, puis passe en levant la case (libellé « … et les murs ») ; un mur
// dessiné à l'outil 🟦 coupe aussi ; renommé dans la légende, la fiche suit le nom et le mur coupe toujours.
// 🩸 check-mur-ligne.js teste la règle dans un `vm` ; seul ce parcours voit la fiche, l'outil de dessin, la
// légende et le pathfinder sur les vrais registres de l'app.
// Usage : node scripts/smoke/checkup-mur-ligne.js (SMOKE_PORT pour une autre copie) · code :
// pathfinder.js > _collecterMursLigne · doc : docs/architecture/multilevel-pathfinding.md §31.1 bis
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

// Galerie droite (0,0) → (200,0), détour par y = +100, front vertical en x = 100 (y −40 → +40), autour du centre.
function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    const x = Math.round(c.lng) - 100, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 50;
    window.__cml = { x: x, y: y };
    window.setRoads([
      { uid: "rd_cml_droit", type: "principal", level: 0,
        points: [{ x: x, y: y }, { x: x + 100, y: y }, { x: x + 200, y: y }] },
      { uid: "rd_cml_detour", type: "principal", level: 0,
        points: [{ x: x, y: y }, { x: x, y: y + 100 }, { x: x + 200, y: y + 100 }, { x: x + 200, y: y }] }
    ]);
    window.setZones([]);
    window.setStructures([
      { uid: "st_cml_front", type: "front-1", level: 0, points: [{ x: x + 100, y: y - 40 }, { x: x + 100, y: y + 40 }] }
    ]);
    if (typeof window.renderRoads === "function") window.renderRoads();
    if (typeof window.renderStructures === "function") window.renderStructures();
  });
}

// Distance (px plan) de A à B, ou le code d'erreur.
function itineraire(page, opts) {
  return page.evaluate(async function (opts) {
    const o = window.__cml;
    try {
      const r = await window.Pathfinder.computeRoute([{ x: o.x, y: o.y }, { x: o.x + 200, y: o.y }],
        Object.assign({ allowedTypes: ["principal"] }, opts || {}));
      return Math.round(r.totalDistance);
    } catch (e) { return e.code || String(e && e.message); }
  }, opts || {});
}

async function ouvrirFiche(page, uid) {
  const trouvee = await page.evaluate(function (uid) {
    let cible = null;
    window.map.eachLayer(function (l) {
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (!cible && typeof c === "string" && c.indexOf('data-kta-uid="' + uid + '"') >= 0) cible = l;
    });
    if (!cible) return false;
    window.__cmlFiche = cible;
    cible.openPopup();
    return true;
  }, uid);
  await page.waitForTimeout(300);
  return trouvee;
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
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaConvertir && !!window.Pathfinder;
    }, 40000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
      // Un plan multi-niveau peut tagger ses objets : tout le test vit au niveau 0.
      if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) window.APP_CONFIG.activeLevel = 0;
    });

    // ── 1. Un front ne coupe rien ──
    await semer(page);
    await page.waitForTimeout(500);
    verifier(await itineraire(page) === 200, "front en travers : la galerie droite reste prise (200)");

    // ── 2. Fiche du front : « mur (ligne) » proposé, conversion ──
    verifier(await ouvrirFiche(page, "st_cml_front"), "fiche du front ouverte");
    const choix = await page.evaluate(function () {
      const el = window.__cmlFiche.getPopup().getElement();
      const b = el && el.querySelector(".kta-note-popup-convertir");
      if (!b) return null;
      b.click();
      const m = document.getElementById("kta-convert-modal");
      return m ? Array.from(m.querySelectorAll(".kta-convert-choix")).map(function (x) {
        return x.getAttribute("data-famille") + ":" + x.getAttribute("data-type");
      }) : null;
    });
    verifier(!!choix && choix.indexOf("structures:mur-ligne") >= 0, "fiche du front : « mur (ligne) » proposé", choix);
    verifier(!!choix && choix.indexOf("structures:pilier-1") < 0, "fiche du front : pas de pilier (forme fermée)");
    const clic = await page.evaluate(function () {
      const b = document.querySelector('#kta-convert-modal .kta-convert-choix[data-famille="structures"][data-type="mur-ligne"]');
      if (!b) return false;
      b.click();
      return true;
    });
    verifier(clic, "fiche du front : clic sur « mur (ligne) »");
    await page.waitForTimeout(600);
    const conv = await page.evaluate(function () {
      const s = window.getStructures().find(function (o) { return o.uid === "st_cml_front"; });
      return s ? { type: s.type, n: s.points.length } : null;
    });
    verifier(!!conv && conv.type === "mur-ligne" && conv.n === 2, "le front est devenu un mur (ligne), uid gardé", conv);

    // ── 3. Itinéraire : contourne, puis passe en levant la case ──
    verifier(await itineraire(page) === 400, "mur (ligne) en travers : l'itinéraire prend le détour (400)");
    verifier(await itineraire(page, { respecterInaccessibles: false }) === 200,
      "case « respecter » décochée : la galerie droite repasse (200)");
    const libelle = await page.evaluate(function () { return window.I18n.t("iti.inacc.label"); });
    verifier(/mur/i.test(libelle), "la case dit qu'elle lève aussi les murs", libelle);

    // ── 4. Mur dessiné à l'outil 🟦 : il ferme le détour, plus aucun chemin ──
    const dessin = await page.evaluate(function () {
      const o = window.__cml, H = window.PLAN_CONFIG.plan.imageHeight;
      window.toggleStructureMode("mur-ligne");
      [[o.x + 150, o.y + 60], [o.x + 150, o.y + 140]].forEach(function (p) {
        window.map.fire("click", { latlng: window.L.latLng(H - p[1], p[0]) });
      });
      const okFerme = window.fermerStructureEnCours();
      window.toggleStructureMode("mur-ligne");
      const murs = window.getStructures().filter(function (s) { return s.type === "mur-ligne"; });
      return { okFerme: okFerme, n: murs.length, pts: murs.map(function (m) { return m.points.length; }) };
    });
    verifier(dessin.okFerme && dessin.n === 2, "outil 🟦 : un 2e mur (ligne) dessiné et validé", dessin);
    verifier(await itineraire(page) === "NO_PATH", "deux murs : plus aucun chemin, l'itinéraire échoue en le disant");
    verifier(await itineraire(page, { respecterInaccessibles: false }) === 200, "… et passe en levant la case (200)");

    // ── 5. Légende : renommé, la fiche suit et le mur coupe toujours ──
    await page.evaluate(function () {
      window.LegendCustomization.setSessionLabel("structures", "mur-ligne", "Muret fictif");
      window.renderStructures();
    });
    await page.waitForTimeout(400);
    verifier(await ouvrirFiche(page, "st_cml_front"), "fiche du mur renommé ouverte");
    const titre = await page.evaluate(function () {
      const el = window.__cmlFiche.getPopup().getElement();
      const b = el && el.querySelector(".kta-note-popup > b");
      return b ? b.textContent : null;
    });
    verifier(!!titre && titre.indexOf("Muret fictif") >= 0, "la fiche porte le nom de la légende", titre);
    verifier(await itineraire(page) === "NO_PATH", "renommé, il coupe toujours (le rôle tient à la clé)");

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
  console.log("🎉 CHECKUP VERT — le mur (ligne) se convertit depuis un front, se dessine, coupe l'itinéraire et se lève avec la case.");
  process.exit(0);
})();
