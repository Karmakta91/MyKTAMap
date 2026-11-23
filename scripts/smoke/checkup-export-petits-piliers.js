#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-export-petits-piliers.js — checkup (Playwright) : un pilier de 1 m reste lisible dans les exports image
// =====================================================================
// Relevé fictif (sinon le premier plan de l'index), échelle du plan forcée EN MÉMOIRE à 3 px/m (celle d'un relevé
// réel dézoomé) : un pilier de 1 m fait 3 px de plan. Structures FICTIVES de 1 m posées au centre de la vue, en
// session (pilier 1re et 2e masse, pilier à bras, mur) et dans un calque fabriqué servi par page.route (pilier 1re
// masse, mur). Joué sous chaque moteur (KTA_MOTEURS, Chromium et WebKit par défaut).
// Vérifie, pour l'export avancé / PDF (MyKTAMapExporterGenererCanvas, résolutions 1 et 2) et pour « Télécharger le
// plan » (utils.js > telechargerPlan, canvas saisi avant l'encodage) : des pixels de la couleur de remplissage du
// canon à l'intérieur de chaque carré (avant : contour de weight × résolution, carré entièrement noir), et un
// contour encore présent (pixels sombres). Un front et un mur en ligne gardent leur trait (couleur du canon).
// Pilier à bras : contrôlé à la résolution 2 seulement (à 3 px, sa croix couvre le centre, voulu ;
// checkup-pilier-bras.js le suit à sa taille).
// Usage : node scripts/smoke/checkup-export-petits-piliers.js (SMOKE_PORT pour une autre copie) · code :
// exporter.js > _contourSurfaceExp, utils.js > telechargerPlan > drawPolygon, structures.js >
// ktaBordSurfacePourLargeur · doc : exports.md §69.1
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const PX_PAR_M = 3;
const CALQUE = "__ck_petits_piliers.json";

const problemes = [];
let _prefixe = "";
function pb(msg) { problemes.push(_prefixe + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Carrés de 1 m (session puis calque) et deux lignes, autour du centre de la vue ; écart de 8 m entre objets.
function objets(cx, cy, m) {
  const carre = function (i, j) {
    const x = cx + i * 8 * m, y = cy + j * 8 * m;
    return [{ x: x, y: y }, { x: x + m, y: y }, { x: x + m, y: y + m }, { x: x, y: y + m }];
  };
  return {
    session: [
      { uid: "ck_pp_p1", type: "pilier-1", level: 0, points: carre(0, 0) },
      { uid: "ck_pp_p2", type: "pilier-2", level: 0, points: carre(1, 0) },
      { uid: "ck_pp_pb", type: "pilier-bras", level: 0, points: carre(2, 0) },
      { uid: "ck_pp_mur", type: "mur", level: 0, points: carre(3, 0) },
      { uid: "ck_pp_f1", type: "front-1", level: 0, points: [{ x: cx, y: cy + 16 * m }, { x: cx + 6 * m, y: cy + 16 * m }] },
      { uid: "ck_pp_ml", type: "mur-ligne", level: 0,
        points: [{ x: cx + 16 * m, y: cy + 16 * m }, { x: cx + 22 * m, y: cy + 16 * m }] }
    ],
    calque: [
      { uid: "ck_pp_cp1", type: "pilier-1", level: 0, points: carre(0, 1) },
      { uid: "ck_pp_cmur", type: "mur", level: 0, points: carre(1, 1) }
    ]
  };
}

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.evaluate(function () {
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () { return window.__pret && !!window.map && !!window.PLAN_CONFIG; }, 60000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) window.ktaSetActiveLevel(0);
    if (window.getTrackingActif && window.getTrackingActif()) window.stopTracking();
  });
}

// Dans la page : pour chaque carré attendu, pixels de la couleur de remplissage du canon et pixels assombris (le
// contour noir, fin : nettement plus sombres que le plein, pas forcément noirs) ; pour
// chaque ligne, pixels de la couleur de son trait. `sx` = pixels du canvas par pixel de plan.
// 🩸 Posé par page.evaluate (pas de `new Function` dans la page : la CSP de l'app refuse l'évaluation de texte).
function installerMesure() {
  window.__ckMesurer = function (cv, sx, attendus) {
  const ctx = cv.getContext("2d");
  const rgb = function (hex) {
    const h = String(hex).replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  return attendus.map(function (a) {
    const st = window.ktaResolveStyle("structures", a.type, { flat: true });
    const cible = rgb(a.ligne ? st.color : st.fillColor);
    const xs = a.points.map(function (p) { return p.x; }), ys = a.points.map(function (p) { return p.y; });
    // Boîte du carré élargie d'1 px (moitié extérieure du contour) ; d'une ligne, de 2 px en hauteur.
    const mx = a.ligne ? 0 : 1, my = a.ligne ? 2 : 1;
    const x0 = Math.floor(Math.min.apply(null, xs) * sx) - mx, x1 = Math.ceil(Math.max.apply(null, xs) * sx) + mx;
    const y0 = Math.floor(Math.min.apply(null, ys) * sx) - my, y1 = Math.ceil(Math.max.apply(null, ys) * sx) + my;
    const seuilSombre = 0.75 * (cible[0] + cible[1] + cible[2]);
    const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
    let plein = 0, sombre = 0, total = 0;
    for (let i = 0; i < d.length; i += 4) {
      total++;
      if (Math.abs(d[i] - cible[0]) <= 60 && Math.abs(d[i + 1] - cible[1]) <= 60 && Math.abs(d[i + 2] - cible[2]) <= 60) {
        plein++;
      }
      if (d[i] + d[i + 1] + d[i + 2] < seuilSombre) sombre++;   // assombri par le contour noir
    }
    return { uid: a.uid, type: a.type, ligne: !!a.ligne, plein: plein, sombre: sombre, total: total };
  });
  };
}

async function jouer(nav, moteur) {
  _prefixe = "[" + moteur + "] ";
  console.log("\n── " + moteur + " ──");
  // 🩸 Service Worker bloqué : une requête servie par lui échappe à page.route (calque fabriqué introuvable).
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 850 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  let calque = { structures: [] };
  await page.route("**/" + CALQUE, function (route) {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(calque) });
  });
  try {
    await ouvrirPlan(page);
    await page.evaluate(installerMesure);
    const pose = await page.evaluate(function (a) {
      const c = window.map.getCenter(), H = window.PLAN_CONFIG.plan.imageHeight;
      window.__ckScaleAvant = window.APP_CONFIG.scale;
      window.APP_CONFIG.scale = a.pxm;
      // Décalé du centre de la vue : l'icône de position (50 px) peut y être dessinée par-dessus.
      const cx = Math.round(c.lng) + 60, cy = Math.round(H - c.lat) + 60;
      window.setRoads([]); window.setZones([]); window.setEditorPoints([]);
      return { cx: cx, cy: cy };
    }, { pxm: PX_PAR_M });
    const O = objets(pose.cx, pose.cy, PX_PAR_M);
    calque = { data: [], roads: [], zones: [], structures: O.calque };
    await page.evaluate(function (a) {
      window.setStructures(a.O.session);
      if (typeof window.renderStructures === "function") window.renderStructures();
      // Calque fabriqué : déclaré au plan-config, groupe visible (l'export rapide ne lit que les calques affichés).
      window.PLAN_CONFIG.dataLayers = (window.PLAN_CONFIG.dataLayers || []).concat([
        { id: "ck-pp", label: "Calque checkup", file: a.fichier, visible: true }]);
      window.dataLayerGroups["ck-pp"] = window.L.layerGroup().addTo(window.map);
    }, { O: O, fichier: CALQUE });
    const attendus = O.session.map(function (s) {
      return Object.assign({}, s, { ligne: s.type === "front-1" || s.type === "mur-ligne" });
    }).concat(O.calque);

    // ── Export avancé / PDF : résolutions 1 et 2 ──
    for (const resol of [1, 2]) {
      const r = await page.evaluate(async function (a) {
        const cv = await window.MyKTAMapExporterGenererCanvas({
          ann: { points: false, roads: false, zones: false, structures: true },
          scale: a.resol, bg: "white", imageLayers: {}, dataLayers: { "ck-pp": true }
        });
        const sx = cv.width / window.PLAN_CONFIG.plan.imageWidth;
        return { sx: sx, m: window.__ckMesurer(cv, sx, a.attendus) };
      }, { resol: resol, attendus: attendus });
      r.m.forEach(function (e) {
        if (e.type === "pilier-bras" && resol < 2) return;   // 3 px : sa croix couvre le centre (voulu)
        if (e.ligne) {
          verifier(e.plein > 0, "export avancé ×" + resol + " : " + e.type + " garde son trait (couleur du canon)", e);
        } else {
          verifier(e.plein > 0 && e.sombre > 0, "export avancé ×" + resol + " : " + e.type + " (" + e.uid +
            ") de 1 m lisible, plein à l'intérieur et contour présent", e);
        }
      });
    }

    // ── Télécharger le plan (export rapide) : calques du plan masqués sauf le calque fabriqué ──
    const rap = await page.evaluate(async function (a) {
      const caches = [];
      Object.keys(window.dataLayerGroups).forEach(function (id) {
        const g = window.dataLayerGroups[id];
        if (id !== "ck-pp" && g && window.map.hasLayer(g)) { window.map.removeLayer(g); caches.push(g); }
      });
      const orig = HTMLCanvasElement.prototype.toBlob;
      let saisi = null;
      HTMLCanvasElement.prototype.toBlob = function (cb) { saisi = this; cb(new Blob(["x"])); };
      const clic = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      try { await window.telechargerPlan(); } finally {
        HTMLCanvasElement.prototype.toBlob = orig;
        HTMLAnchorElement.prototype.click = clic;
        caches.forEach(function (g) { window.map.addLayer(g); });
      }
      if (!saisi) return { erreur: "canvas non saisi" };
      return { m: window.__ckMesurer(saisi, 1, a.attendus) };
    }, { attendus: attendus.filter(function (a) { return !a.ligne && a.type !== "pilier-bras"; }) });
    if (rap.erreur) pb("Télécharger le plan : " + rap.erreur);
    else {
      rap.m.forEach(function (e) {
        verifier(e.plein > 0 && e.sombre > 0, "Télécharger le plan : " + e.type + " (" + e.uid +
          ") de 1 m lisible, plein à l'intérieur et contour présent", e);
      });
    }

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
    await page.evaluate(function () {
      window.APP_CONFIG.scale = window.__ckScaleAvant;
      window.setStructures([]);
      if (window.SessionPersist) window.SessionPersist.save({ force: true });
    });
  } catch (err) {
    pb("exception du harnais : " + (err && err.stack || err));
  } finally {
    await ctx.close();
  }
}

(async function main() {
  try {
    for (const m of moteurs()) {
      const nav = await lancerMoteur(m);
      if (!nav) { inf(m + " absent : moteur sauté"); continue; }
      try { await jouer(nav, m); } finally { await nav.close(); }
    }
  } finally {
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — un pilier de 1 m reste lisible dans l'export avancé / PDF et « Télécharger le plan » : " +
    "plein à l'intérieur, contour fin ; les lignes gardent leur trait.");
  process.exit(0);
})();
