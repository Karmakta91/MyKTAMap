#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-remplir-front.js — checkup (Playwright, pas un hook pré-commit) : « Remplir au clic » sur un front de
// taille (fenêtre Détecter, js/detectionStructures.js > _suivreEn, moteur js/ktaDetection.js > suivreTrait)
// =====================================================================
// Relevé fictif seulement. Le checkup FABRIQUE une planche (traits noirs de 4 px : un front droit, un carrefour en X ;
// un pilier blanc cerné de noir) et la prête au plan en tuiles V2 (Blob dans RUNTIME_ASSETS), puis, sous chaque
// moteur de KTA_MOTEURS (Chromium et WebKit par défaut) :
//   1. outil Structures → Détecter → « Remplir au clic » : la liste des types propose les types fermés ET les types
//      en ligne (front), jamais le pilier à bras ; type « Front 1re masse » choisi, aide du mode « suivre » ;
//   2. un toucher sur le front droit → un front en aperçu (polyligne de 2 sommets sur l'axe), rien d'écrit ;
//   3. un toucher sur un bras du X → le suivi s'arrête au carrefour ;
//   4. un toucher sur le bras opposé → prolongé, son bout tombe EXACTEMENT sur le bout posé au carrefour (rond de
//      raccord affiché) ;
//   5. retirer : toucher sur un front, Ctrl+Z, « Retirer le dernier » ;
//   6. « Valider » → fronts posés au niveau du type, uid, raccord exact gardé ; front déjà posé retouché → refusé ;
//   7. le type pilier ne change pas : « Pilier 1re masse » choisi, un toucher dans le contour fermé → une zone.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8226 node scripts/smoke/checkup-remplir-front.js
// Doc : docs/architecture/plans-loader.md (Remplir au clic)
// =====================================================================
"use strict";

const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const PLAN = "Relevé fictif de test";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
let moteurCourant = "";
function pb(msg) { problemes.push("[" + moteurCourant + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) {
  if (cond) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
}

// Planche en pixels du plan, relative au coin O : rectangles noirs [x, y, w, h] ; pilier cerné [x, y, w, h] (intérieur).
const PLANCHE = {
  traits: [[20, 30, 120, 4],                        // front droit : axe y = 32, x 20 → 140
           [200, 150, 140, 4], [268, 120, 4, 70]],  // X : centre (270, 152)
  pilier: [40, 200, 60, 40], ep: 4, taille: [380, 280]
};

async function preterPlanche(page) {
  return page.evaluate(async function (S) {
    const pc = window.PLAN_CONFIG, p = pc.plan;
    const W = p.imageWidth || window.APP_CONFIG.imageWidth, H = p.imageHeight || window.APP_CONFIG.imageHeight;
    p.imageWidth = W; p.imageHeight = H;
    p.tiledV2 = true;
    pc.tiling = { minNativeZoom: -3, maxNativeZoom: 0, tileSize: 256, format: "png" };
    const occupes = (window.getStructures() || []).concat(window._ktaDataStructurePolygons || [])
      .filter(function (q) { return q && Array.isArray(q.points) && q.points.length; });
    const libre = function (o) {
      return !occupes.some(function (q) {
        return q.points.some(function (pt) {
          return pt.x > o.x - 40 && pt.x < o.x + S.taille[0] + 40 && pt.y > o.y - 40 && pt.y < o.y + S.taille[1] + 40;
        });
      });
    };
    let O = null;
    for (let y = 60; y + S.taille[1] + 60 < H && !O; y += 60) {
      for (let x = 60; x + S.taille[0] + 60 < W && !O; x += 60) if (libre({ x: x, y: y })) O = { x: x, y: y };
    }
    if (!O) return null;
    const dessiner = function (k) {
      k.fillStyle = "#141414";
      S.traits.forEach(function (q) { k.fillRect(O.x + q[0], O.y + q[1], q[2], q[3]); });
      const c = S.pilier;
      k.fillRect(O.x + c[0] - S.ep, O.y + c[1] - S.ep, c[2] + 2 * S.ep, c[3] + 2 * S.ep);
      k.fillStyle = "#ffffff";
      k.fillRect(O.x + c[0], O.y + c[1], c[2], c[3]);
    };
    const T = 256, cols = Math.ceil(W / T), rows = Math.ceil(H / T);
    const blob = function (cv) { return new Promise(function (r) { cv.toBlob(r, "image/png"); }); };
    const cvB = document.createElement("canvas"); cvB.width = cvB.height = T;
    const kB = cvB.getContext("2d"); kB.fillStyle = "#ffffff"; kB.fillRect(0, 0, T, T);
    const blanc = await blob(cvB);
    window.RUNTIME_ASSETS = window.RUNTIME_ASSETS || {};
    for (let col = 0; col < cols; col++) for (let k = 1; k <= rows; k++) {
      const x0 = col * T, y0 = H - k * T;
      let f = blanc;
      if (x0 + T > O.x && x0 < O.x + S.taille[0] && y0 + T > O.y && y0 < O.y + S.taille[1]) {
        const cv = document.createElement("canvas"); cv.width = cv.height = T;
        const kk = cv.getContext("2d"); kk.fillStyle = "#ffffff"; kk.fillRect(0, 0, T, T);
        kk.translate(-x0, -y0); dessiner(kk);
        f = await blob(cv);
      }
      window.RUNTIME_ASSETS["data/tiles/z0/x" + col + "_y" + (-k) + ".png"] = { file: f };
    }
    window.APP_CONFIG.multiLevel = true; window.APP_CONFIG.activeLevel = 0; window.APP_CONFIG.visibleLevels = [0];
    window.map.fitBounds(L.latLngBounds([window.convertCoord(O.x - 20, O.y - 20),
      window.convertCoord(O.x + S.taille[0] + 20, O.y + S.taille[1] + 20)]), { animate: false });
    if (window.HistoryManager && typeof window.HistoryManager.reset === "function") window.HistoryManager.reset();
    return O;
  }, PLANCHE);
}

async function toucher(page, x, y) {
  const pt = await page.evaluate(function (a) {
    const r = window.map.getContainer().getBoundingClientRect();
    const c = window.map.latLngToContainerPoint(window.convertCoord(a.x, a.y));
    return { x: r.left + c.x, y: r.top + c.y };
  }, { x: x, y: y });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(150);
  await attendre(page, function () {
    const e = window.KtaDetectionUI.etat();
    return !e || !e.remplir || !e.remplir.enCours;
  }, 30000);
  await page.waitForTimeout(100);
}
function etat(page) { return page.evaluate(function () { return window.KtaDetectionUI.etat(); }); }
function toasts(page) {
  return page.evaluate(function () {
    return Array.prototype.slice.call(document.querySelectorAll(".oom-toast, [class*='toast']")).map(function (t) {
      return t.textContent;
    }).join(" | ");
  });
}
function texte(page, cle) { return page.evaluate(function (k) { return window.I18n.t(k); }, cle); }
function structures(page, type) {
  return page.evaluate(function (t) {
    return window.getStructures().filter(function (s) { return s.type === t; })
      .map(function (s) { return { uid: s.uid, level: s.level, points: s.points }; });
  }, type);
}
function traitsAffiches(page) {
  return page.evaluate(function () {
    return {
      traits: document.querySelectorAll(".leaflet-ktaDetection-pane path.kta-detect-rempli.kta-detect-trait").length,
      zones: document.querySelectorAll(".leaflet-ktaDetection-pane path.kta-detect-rempli:not(.kta-detect-trait)")
        .length,
      accroches: document.querySelectorAll(".leaflet-ktaDetection-pane path.kta-detect-accroche").length
    };
  });
}
async function ouvrirRemplir(page) {
  return page.evaluate(function () {
    const g = Array.prototype.slice.call(document.querySelectorAll("a.kta-group-toggle")).filter(function (a) {
      return a.title === window.I18n.t("ui.group.structures");
    })[0];
    if (!g) return "groupe introuvable";
    g.click();
    const fly = document.querySelector(".kta-group-flyout"), lib = window.I18n.t("detect.bouton");
    const btn = fly && Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (x) {
      return (x.textContent || "").indexOf(lib) >= 0 || x.title === lib;
    })[0];
    if (!btn) return "bouton Détecter introuvable";
    btn.click();
    const r = document.querySelector('#kta-detect-bandeau [data-detect="remplir"]');
    if (!r) return "bouton Remplir au clic absent";
    r.click();
    return "ok";
  });
}
const bouts = function (f) { return [f.points[0], f.points[f.points.length - 1]]; };
const pres = function (p, x, y, tol) { return Math.hypot(p.x - x, p.y - y) <= tol; };

async function suite(nav) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e)); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { if (localStorage.getItem(k) === null) localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN, { exact: false }).first().click();
  await attendre(page, function () {
    return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan && !!window.KtaDetectionUI;
  }, 90000);
  await page.waitForTimeout(2000);
  const O = await preterPlanche(page);
  if (!O) {
    pb("aucune zone libre de structures dans le relevé fictif pour poser la planche");
    await ctx.close();
    return;
  }
  await page.waitForTimeout(500);
  const avantF = await structures(page, "front-1"), avantP = await structures(page, "pilier-1");

  // ── 1. Entrée, types proposés ──
  const ouvert = await ouvrirRemplir(page);
  verifier(ouvert === "ok", "outil Structures → Détecter → « Remplir au clic » ouvre le mode", ouvert);
  if (ouvert !== "ok") { await ctx.close(); return; }
  await page.waitForTimeout(200);
  const options = await page.evaluate(function () {
    const s = document.querySelector("#kta-detect-bandeau [data-detect-remplir-type]");
    return s ? Array.prototype.map.call(s.options, function (o) { return o.value; }) : null;
  });
  verifier(options && ["pilier-1", "mur", "front-1", "front-2"].every(function (t) { return options.indexOf(t) >= 0; })
    && options.indexOf("pilier-bras") < 0,
    "types proposés : fermés ET en ligne (front), jamais le pilier à bras", options);
  if (!options || options.indexOf("front-1") < 0) { await ctx.close(); return; }
  await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "front-1");
  let e = await etat(page);
  const aideTrait = await texte(page, "detect.remplir.aideTrait");
  const info = await page.evaluate(function () {
    const el = document.querySelector("#kta-detect-bandeau .kta-racc-info");
    return el ? el.textContent : "";
  });
  verifier(e.remplir.type === "front-1" && info.indexOf(aideTrait.slice(0, 20)) === 0,
    "type « front-1 » choisi, aide du suivi de trait affichée", { type: e.remplir.type, info: info });

  // ── 2. Front droit ──
  await toucher(page, O.x + 80, O.y + 32);
  e = await etat(page);
  let f = e.remplir.fronts;
  verifier(e.remplir.n === 1 && f.length === 1 && f[0].points.length === 2 &&
    f[0].points.every(function (p) { return Math.abs(p.y - O.y - 32) <= 1.5; }) &&
    Math.abs(Math.min(f[0].points[0].x, f[0].points[1].x) - O.x - 21) <= 3 &&
    Math.abs(Math.max(f[0].points[0].x, f[0].points[1].x) - O.x - 139) <= 3,
    "un toucher pose un front : 2 sommets sur l'axe, bouts à 3 px des bouts dessinés", f);
  let aff = await traitsAffiches(page);
  verifier(aff.traits === 1, "le front est dessiné en aperçu (polyligne)", aff);
  verifier((await structures(page, "front-1")).length === avantF.length, "rien n'est écrit avant « Valider »");

  // ── 3. Carrefour en X : arrêt au carrefour ──
  await toucher(page, O.x + 220, O.y + 152);
  e = await etat(page);
  f = e.remplir.fronts;
  const gauche = f[1];
  verifier(e.remplir.n === 2 && gauche && bouts(gauche).some(function (p) { return pres(p, O.x + 270, O.y + 152, 3); }) &&
    gauche.points.every(function (p) { return p.x <= O.x + 273; }) &&
    (e.remplir.bouts[1] || []).indexOf("carrefour") >= 0,
    "le suivi s'arrête au carrefour (bout à 3 px du centre du X, rien au-delà)", { front: gauche, bouts: e.remplir.bouts });

  // ── 4. Deuxième toucher : prolongé, raccord exact ──
  await toucher(page, O.x + 320, O.y + 152);
  e = await etat(page);
  f = e.remplir.fronts;
  const droite = f[2];
  const exact = function (a, b) {
    return !!a && !!b && bouts(a).some(function (p) {
      return b.points.some(function (q) { return q.x === p.x && q.y === p.y; });
    });
  };
  verifier(e.remplir.n === 3 && exact(droite, gauche) && droite.points.some(function (p) { return p.x >= O.x + 335; }),
    "2e toucher au-delà du carrefour : prolongé, bout EXACTEMENT sur le bout posé", { gauche: gauche, droite: droite });
  aff = await traitsAffiches(page);
  verifier(aff.traits === 3 && aff.accroches >= 1, "3 fronts dessinés, rond de raccord affiché", aff);

  // ── 5. Retirer : toucher, Ctrl+Z, « Retirer le dernier » ──
  await toucher(page, O.x + 80, O.y + 32);
  e = await etat(page);
  verifier(e.remplir.n === 2 && e.remplir.fronts.every(function (q) { return q.points[0].y > O.y + 100; }),
    "toucher sur un front de l'aperçu le retire (le droit)", e.remplir.n);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  e = await etat(page);
  verifier(e.remplir.n === 1, "Ctrl+Z retire le dernier front", e.remplir.n);
  await page.click('#kta-detect-bandeau [data-detect="retirer-dernier"]');
  await page.waitForTimeout(300);
  e = await etat(page);
  aff = await traitsAffiches(page);
  verifier(e.remplir.n === 0 && aff.traits === 0, "« Retirer le dernier » vide l'aperçu", { n: e.remplir.n, aff: aff });

  // ── 6. Refaire les deux bras, Valider ──
  await toucher(page, O.x + 220, O.y + 152);
  await toucher(page, O.x + 320, O.y + 152);
  e = await etat(page);
  verifier(e.remplir.n === 2 && exact(e.remplir.fronts[1], e.remplir.fronts[0]),
    "les deux bras retouchés : raccord exact de nouveau", e.remplir.fronts);
  await page.click('#kta-detect-bandeau [data-detect="valider-remplir"]');
  await page.waitForTimeout(600);
  const poses = (await structures(page, "front-1")).slice(avantF.length);
  const niv = await page.evaluate(function () { return window.ktaNiveauNouvelleStructure("front-1"); });
  verifier(poses.length === 2 && !(await etat(page)) &&
    poses.every(function (s) { return s.level === niv && /^st_/.test(s.uid || "") && s.points.length >= 2; }),
    "« Valider » : 2 fronts posés au niveau du type (" + niv + "), uid, parcours fermé", poses);
  verifier(poses.length === 2 && exact(poses[1], poses[0]), "raccord exact gardé dans les structures posées");
  // front déjà posé retouché : refusé
  await ouvrirRemplir(page);
  await page.waitForTimeout(200);
  await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "front-1");
  await toucher(page, O.x + 222, O.y + 153);
  e = await etat(page);
  const msgDeja = await texte(page, "detect.remplir.frontDeja");
  verifier(e.remplir.n === 0 && (await toasts(page)).indexOf(msgDeja) >= 0,
    "front déjà posé retouché : refusé (« " + msgDeja + " »)", e.remplir.n);

  // ── 7. Le type pilier ne change pas ──
  await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "pilier-1");
  const c = PLANCHE.pilier;
  await toucher(page, O.x + c[0] + c[2] / 2, O.y + c[1] + c[3] / 2);
  e = await etat(page);
  aff = await traitsAffiches(page);
  verifier(e.remplir.n === 1 && e.remplir.fronts.length === 0 && aff.zones === 1 && aff.traits === 0,
    "type pilier : un toucher dans le contour remplit une zone (pas un trait)", { n: e.remplir.n, aff: aff });
  await page.click('#kta-detect-bandeau [data-detect="valider-remplir"]');
  await page.waitForTimeout(600);
  const pil = (await structures(page, "pilier-1")).slice(avantP.length);
  verifier(pil.length === 1 && pil[0].points.length >= 4 &&
    Math.abs(Math.min.apply(null, pil[0].points.map(function (p) { return p.x; })) - (O.x + c[0] - 2)) <= 1,
    "pilier posé au milieu de son trait, comme avant", pil);

  verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  await ctx.close();
}

(async function main() {
  const liste = lancerNavigateur.moteurs();
  try {
    for (const nom of liste) {
      moteurCourant = nom;
      console.log("\n══ Moteur : " + nom + " ══");
      const nav = await lancerNavigateur.lancerMoteur(nom);
      if (!nav) { pb("moteur absent : rien n'a été vérifié"); continue; }
      try { await suite(nav); }
      catch (err) { pb("exception du harnais : " + (err && err.message)); }
      finally { await nav.close(); }
    }
  } finally {
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — remplir au clic sur un front : suivi, arrêt au carrefour, raccord exact, retirer, " +
    "Valider, type pilier inchangé.");
  process.exit(0);
})();
