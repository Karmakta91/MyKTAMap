#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-export-point-precis.js — checkup (Playwright) : le point précis d'un POI dessiné par l'export image et le PDF
// =====================================================================
// Relevé fictif (sinon le premier plan de l'index), deux POI FICTIFS de session décalés du centre de la vue : une
// plaque à point précis (pointillé de l'icône au point, carré au point) et une chatière relevée en deux points
// (segment début → fin, un carré à chaque bout, pointillé de l'icône au milieu). Calques de données décochés :
// seule la session sort. Joué sous chaque moteur (KTA_MOTEURS, Chromium et WebKit par défaut).
// Vérifie, par les fenêtres (pas d'appel direct) :
//   • export image avancé : case « Points précis » (id ann_precis) cochée par défaut, icône SVG au trait ; image
//     téléchargée (canvas saisi avant l'encodage) : pixels de la couleur du jeton --kta-accent sur le pointillé, au
//     carré, sur le segment et aux bouts de la chatière ; légende : une ligne « Point précis » (texte dessiné) ;
//   • case décochée : rien de doré à ces endroits, pas de ligne de légende ;
//   • PDF : case pdf_inc_precis cochée, icône SVG ; plan posé dans le PDF (canvas de MyKTAMapExporterGenererCanvas)
//     doré aux mêmes endroits ; légende du PDF avec la ligne ; case décochée : rien, pas de ligne.
// Rien n'est téléchargé (toBlob, clic du lien et jsPDF.save neutralisés) ; la session est vidée à la fin.
// Usage : node scripts/smoke/checkup-export-point-precis.js (SMOKE_PORT pour une autre copie) · code :
// poiPrecis.js > peindre, exporter.js > _genererCanvasExport, pdfExport.js · doc : exports.md § Point précis
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

const problemes = [];
let _prefixe = "";
function pb(msg) { problemes.push(_prefixe + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

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
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaPoiPrecis && !!window.MyKTAMapPdfExport;
  }, 60000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) window.ktaSetActiveLevel(0);
    if (window.getTrackingActif && window.getTrackingActif()) window.stopTracking();
  });
}

// Dans la page : outils de mesure et espions (posés par page.evaluate : la CSP refuse `new Function`).
function installer() {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--kta-accent").trim();
  const h = accent.replace("#", "");
  const cible = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  // Pixels dorés (jeton --kta-accent, ±50 par canal) dans un carré de 2r + 1 px autour de (x, y) px du plan.
  window.__ckDores = function (cv, x, y, r) {
    const sx = cv.width / window.PLAN_CONFIG.plan.imageWidth;
    const px = Math.round(x * sx), py = Math.round(y * sx), rr = Math.max(1, Math.round(r * sx));
    const d = cv.getContext("2d").getImageData(px - rr, py - rr, 2 * rr + 1, 2 * rr + 1).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200 && Math.abs(d[i] - cible[0]) <= 50 && Math.abs(d[i + 1] - cible[1]) <= 50 &&
          Math.abs(d[i + 2] - cible[2]) <= 50) n++;
    }
    return n;
  };
  // Textes dessinés sur un canvas (légende) : espion de fillText.
  window.__ckTextes = [];
  const fill0 = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t) {
    window.__ckTextes.push(String(t));
    return fill0.apply(this, arguments);
  };
  // Téléchargements neutralisés ; le canvas encodé est gardé.
  window.__ckSaisi = null;
  HTMLCanvasElement.prototype.toBlob = function (cb) { window.__ckSaisi = this; cb(new Blob(["x"])); };
  HTMLAnchorElement.prototype.click = function () {};
  // PDF : plan rendu par l'export (canvas), save neutralisé.
  const gen0 = window.MyKTAMapExporterGenererCanvas;
  window.__ckPlanPdf = null;
  window.MyKTAMapExporterGenererCanvas = async function () {
    const cv = await gen0.apply(this, arguments);
    window.__ckPlanPdf = cv;
    return cv;
  };
  window.jspdf.jsPDF.API.save = function () { window.__ckPdfFini = true; return this; };
  return { accent: accent };
}

async function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter(), H = window.PLAN_CONFIG.plan.imageHeight;
    const cx = Math.round(c.lng) + 80, cy = Math.round(H - c.lat) - 120;
    const pt = function (uid, tag, x, y, precis) {
      return { id: uid, nom: "POI " + uid, uid: uid, level: 0, tags: [tag], etat: "Non inspectée", description: "",
        source: "editor", updatedAt: 1000, x: x, y: y, precis: precis };
    };
    window.setRoads([]); window.setZones([]); window.setStructures([]);
    window.setEditorPoints([
      pt("ck_epp_pl", "plaque", cx, cy, { x: cx + 110, y: cy }),
      pt("ck_epp_ch", "chatiere", cx, cy + 160, { pts: [{ x: cx + 90, y: cy + 110 }, { x: cx + 90, y: cy + 210 }] })
    ]);
    if (typeof window.renderEditorPoints === "function") window.renderEditorPoints();
    const editeur = (window.PLAN_CONFIG.dataLayers || []).some(function (l) { return l.id === "editor"; });
    return { cx: cx, cy: cy, editeur: editeur };
  });
}

// Endroits mesurés (px du plan) : pointillé hors de l'icône (50 px), carré, segment et bouts de la chatière.
function endroits(o) {
  return {
    pointille: [o.cx + 60, o.cy, 18],          // hors de l'icône (25 px de rayon), tirets compris
    carre: [o.cx + 110, o.cy, 3],
    segment: [o.cx + 90, o.cy + 135, 3],
    bout1: [o.cx + 90, o.cy + 110, 3],
    bout2: [o.cx + 90, o.cy + 210, 3]
  };
}

async function mesurer(page, canvasExpr, E) {
  return page.evaluate(function (a) {
    const cv = a.pdf ? window.__ckPlanPdf : window.__ckSaisi;
    if (!cv) return { erreur: "canvas non saisi" };
    const r = {};
    Object.keys(a.E).forEach(function (k) { const e = a.E[k]; r[k] = window.__ckDores(cv, e[0], e[1], e[2]); });
    r.legende = window.__ckTextes.indexOf(window.I18n.t("imgexport.legLabel.precis")) >= 0;
    return r;
  }, { pdf: canvasExpr === "pdf", E: E });
}

async function exportImage(page, coche) {
  return page.evaluate(async function (coche) {
    window.__ckSaisi = null; window.__ckTextes = [];
    window.ouvrirExportModal();
    await new Promise(function (r) { setTimeout(r, 600); });
    document.getElementById("kta-export-mode-avance").click();
    await new Promise(function (r) { setTimeout(r, 600); });
    const cb = document.getElementById("ann_precis");
    const etat = { existe: !!cb, cocheDefaut: !!(cb && cb.checked),
      svg: !!(cb && cb.closest("label") && cb.closest("label").querySelector("svg")) };
    document.querySelectorAll('[data-layer-type="data"]').forEach(function (el) {
      el.checked = el.dataset.layerId === "editor";
    });
    document.querySelectorAll('[data-layer-type="image"]').forEach(function (el) { el.checked = false; });
    const bg = document.querySelector('input[name="export_bg"][value="white"]'); if (bg) bg.checked = true;
    const r1 = document.querySelector('input[name="resol"][value="1"]'); if (r1) r1.checked = true;
    if (cb) cb.checked = coche;
    const leg = document.getElementById("kta-export-legende-on");
    if (leg && !leg.checked) leg.click();
    const ic = document.getElementById("leg_c_icones"); if (ic) ic.checked = true;
    document.getElementById("kta-export-go").click();
    const t0 = Date.now();
    while (!window.__ckSaisi && Date.now() - t0 < 30000) await new Promise(function (r) { setTimeout(r, 200); });
    const x = document.getElementById("kta-export-close"); if (x) x.click();
    return etat;
  }, coche);
}

async function exportPdf(page, coche) {
  return page.evaluate(async function (coche) {
    window.__ckPlanPdf = null; window.__ckPdfFini = false; window.__ckTextes = [];
    window.MyKTAMapPdfExport.afficherModale();
    await new Promise(function (r) { setTimeout(r, 600); });
    const cb = document.getElementById("pdf_inc_precis");
    const etat = { existe: !!cb, cocheDefaut: !!(cb && cb.checked),
      svg: !!(cb && cb.closest("label") && cb.closest("label").querySelector("svg")) };
    document.querySelectorAll('input[id^="pdf_data_layer_"]').forEach(function (el) {
      el.checked = el.getAttribute("data-layer-id") === "editor";
    });
    document.querySelectorAll('input[id^="pdf_img_layer_"]').forEach(function (el) { el.checked = false; });
    const base = document.getElementById("pdf_inc_baseimage"); if (base) base.checked = false;
    const s1 = document.querySelector('input[name="pdf_scale"][value="1"]'); if (s1) s1.checked = true;
    const leg = document.getElementById("pdf_inc_legende"); if (leg) leg.checked = true;
    if (cb) cb.checked = coche;
    document.getElementById("kta-pdf-generer").click();
    const t0 = Date.now();
    while (!window.__ckPdfFini && Date.now() - t0 < 60000) await new Promise(function (r) { setTimeout(r, 200); });
    const m = document.getElementById("kta-pdf-modal"); if (m) m.remove();
    return Object.assign(etat, { fini: !!window.__ckPdfFini });
  }, coche);
}

async function jouer(nav, moteur) {
  _prefixe = "[" + moteur + "] ";
  console.log("\n── " + moteur + " ──");
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 850 } });
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await ouvrirPlan(page);
    const ins = await page.evaluate(installer);
    verifier(/^#[0-9a-f]{6}$/i.test(ins.accent), "jeton --kta-accent lisible (" + ins.accent + ")", ins);
    const o = await semer(page);
    if (!o.editeur) inf("le plan-config ne déclare pas de calque « editor » : la session ne sort pas des exports");
    const E = endroits(o);

    // ── Export image avancé ──
    const f1 = await exportImage(page, true);
    verifier(f1.existe && f1.cocheDefaut && f1.svg, "export image : case « Points précis » cochée par défaut, icône SVG", f1);
    const m1 = await mesurer(page, "image", E);
    verifier(!m1.erreur && m1.pointille > 0 && m1.carre > 0, "export image : pointillé doré et carré au point précis", m1);
    verifier(!m1.erreur && m1.segment > 0 && m1.bout1 > 0 && m1.bout2 > 0,
      "export image : chatière, segment doré et carré à chaque bout", m1);
    verifier(m1.legende === true, "export image : ligne « Point précis » dans la légende", m1);
    await exportImage(page, false);
    const m0 = await mesurer(page, "image", E);
    verifier(!m0.erreur && m0.pointille === 0 && m0.carre === 0 && m0.segment === 0 && m0.bout1 === 0 && m0.bout2 === 0,
      "export image, case décochée : aucun point précis dessiné", m0);
    verifier(m0.legende === false, "export image, case décochée : pas de ligne de légende", m0);

    // ── PDF ──
    const p1 = await exportPdf(page, true);
    verifier(p1.existe && p1.cocheDefaut && p1.svg && p1.fini, "PDF : case « Points précis » cochée par défaut, icône SVG, PDF produit", p1);
    const n1 = await mesurer(page, "pdf", E);
    verifier(!n1.erreur && n1.pointille > 0 && n1.carre > 0 && n1.segment > 0 && n1.bout1 > 0 && n1.bout2 > 0,
      "PDF : pointillé, carré et chatière dorés sur le plan posé", n1);
    verifier(n1.legende === true, "PDF : ligne « Point précis » dans la légende", n1);
    const p0 = await exportPdf(page, false);
    const n0 = await mesurer(page, "pdf", E);
    verifier(p0.fini && !n0.erreur && n0.pointille === 0 && n0.carre === 0 && n0.segment === 0,
      "PDF, case décochée : aucun point précis dessiné", n0);
    verifier(n0.legende === false, "PDF, case décochée : pas de ligne de légende", n0);

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
    await page.evaluate(function () {
      window.setEditorPoints([]);
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
  console.log("🎉 CHECKUP VERT — le point précis (pointillé, carré, chatière) sort dans l'export image et le PDF, case " +
    "cochée par défaut, absent case décochée, une ligne de légende.");
  process.exit(0);
})();
