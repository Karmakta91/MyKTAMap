#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-remplir.js — checkup (Playwright, pas un hook pré-commit) : « Remplir au clic », mode de la fenêtre
// Détecter (js/detectionStructures.js, moteur js/ktaDetection.js > remplir)
// =====================================================================
// Relevé fictif seulement. Le checkup FABRIQUE une planche au trait (piliers blancs cernés de noir : trois fermés, un
// au trait ouvert de 6 px, un déjà dessiné en structure) et la prête au plan en tuiles V2 (Blob dans RUNTIME_ASSETS),
// puis, sous chaque moteur de KTA_MOTEURS (Chromium et WebKit par défaut) :
//   1. outil Structures → Détecter → « Remplir au clic » : mode actif, réticule, types à contour fermé (et types en
//      ligne, qui suivent le trait : checkup-remplir-front.js), jamais le pilier à bras posé d'un clic ;
//   2. type « Mur » choisi, 3 touchers → 3 zones en aperçu, RIEN d'écrit avant « Valider » ;
//   3. toucher dans le contour ouvert → refus affiché, rien ajouté ; toucher dans la structure existante → pas de
//      doublon, refus affiché ;
//   4. « Valider » → 3 structures « mur » au niveau du type (multi-niveau, niveau actif), contour au milieu du
//      trait à 1 px près, uid + updatedAt ; UNE étape ⏪ les retire toutes ;
//   5. type « Pilier 2e masse » : posé au niveau −1 (même règle que le tracé à la main).
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8170 node scripts/smoke/checkup-remplir.js
// Doc : docs/architecture/plans-loader.md (Détecter les structures)
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

// Planche en pixels du plan, relative au coin O : intérieurs [x, y, w, h], trait noir de `ep` px autour.
const PLANCHE = {
  fermes: [[30, 30, 60, 40], [140, 30, 50, 50], [240, 40, 70, 35]],
  ouvert: [30, 160, 60, 40], trou: 6,          // trou dans le trait du haut : le fond fuit dehors
  existant: [140, 160, 50, 40],                // déjà une structure : jamais doublé
  ep: 4, taille: [360, 240]   // trait de 4 px : le bord intérieur serait à 2 px du milieu attendu
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
    const cerne = function (k, q, trou) {
      k.fillStyle = "#141414";
      k.fillRect(O.x + q[0] - S.ep, O.y + q[1] - S.ep, q[2] + 2 * S.ep, q[3] + 2 * S.ep);
      k.fillStyle = "#ffffff";
      k.fillRect(O.x + q[0], O.y + q[1], q[2], q[3]);
      if (trou) k.fillRect(O.x + q[0] + 20, O.y + q[1] - S.ep, trou, S.ep);
    };
    const dessiner = function (k) {
      S.fermes.forEach(function (q) { cerne(k, q, 0); });
      cerne(k, S.ouvert, S.trou);
      cerne(k, S.existant, 0);
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
    // plan multi-niveau au niveau actif 0 : le niveau posé est celui du type (ktaNiveauNouvelleStructure)
    window.APP_CONFIG.multiLevel = true; window.APP_CONFIG.activeLevel = 0; window.APP_CONFIG.visibleLevels = [0];
    const ex = S.existant, niv = window.ktaNiveauNouvelleStructure("mur");
    const deja = { type: "mur", points: [{ x: O.x + ex[0], y: O.y + ex[1] }, { x: O.x + ex[0] + ex[2], y: O.y + ex[1] },
      { x: O.x + ex[0] + ex[2], y: O.y + ex[1] + ex[3] }, { x: O.x + ex[0], y: O.y + ex[1] + ex[3] }] };
    if (niv !== null) deja.level = niv;
    window.KtaUid.ensure(deja, "st");
    window.setStructures(window.getStructures().concat([deja]));
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
  }, 20000);
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
function murs(page) {
  return page.evaluate(function () {
    return window.getStructures().filter(function (s) { return s.type === "mur"; })
      .map(function (s) { return { uid: s.uid, maj: s.updatedAt, level: s.level, points: s.points }; });
  });
}

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
  const avant = await murs(page);

  // ── 1. Entrée : outil Structures → Détecter → Remplir au clic ──
  const ouvert = await page.evaluate(function () {
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
    if (!r.querySelector("svg")) return "bouton sans icône SVG";
    r.click();
    return "ok";
  });
  verifier(ouvert === "ok", "outil Structures → Détecter → « Remplir au clic » (icône SVG) ouvre le mode", ouvert);
  if (ouvert !== "ok") { await ctx.close(); return; }
  await page.waitForTimeout(200);
  let e = await etat(page);
  const pick = await page.evaluate(function () { return document.body.classList.contains("kta-detect-pick-mode"); });
  verifier(e && e.etape === "remplir" && e.remplir && e.remplir.n === 0 && pick,
    "mode actif : étape remplir, aperçu vide, réticule de visée", e);
  const options = await page.evaluate(function () {
    const s = document.querySelector("#kta-detect-bandeau [data-detect-remplir-type]");
    return s ? Array.prototype.map.call(s.options, function (o) { return o.value; }) : null;
  });
  verifier(options && ["pilier-1", "pilier-2", "mur"].every(function (t) { return options.indexOf(t) >= 0; }) &&
    options.indexOf("pilier-bras") < 0 && e.remplir.lignes.every(function (t) {
      return ["pilier-1", "pilier-2", "mur"].indexOf(t) < 0;
    }),
    "types proposés : contour fermé (piliers, mur) hors du groupe « suivre un trait », jamais le pilier à bras",
    { options: options, lignes: e.remplir.lignes });
  await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "mur");
  e = await etat(page);
  verifier(e.remplir.type === "mur", "type choisi : mur", e.remplir);

  // ── 2. Trois touchers → trois zones en aperçu ──
  for (const q of PLANCHE.fermes) await toucher(page, O.x + q[0] + q[2] / 2, O.y + q[1] + q[3] / 2);
  e = await etat(page);
  const zones = await page.evaluate(function () {
    return document.querySelectorAll(".leaflet-ktaDetection-pane path.kta-detect-rempli").length;
  });
  verifier(e.remplir.n === 3 && zones === 3, "3 touchers → 3 zones en aperçu", { n: e.remplir.n, zones: zones });
  verifier((await murs(page)).length === avant.length, "rien n'est écrit avant « Valider »");

  // ── 3. Contour ouvert, structure existante ──
  const ov = PLANCHE.ouvert;
  await toucher(page, O.x + ov[0] + ov[2] / 2, O.y + ov[1] + ov[3] / 2);
  e = await etat(page);
  const msgOuvert = await texte(page, "detect.remplir.refus.ouvert");
  verifier(e.remplir.n === 3 && (await toasts(page)).indexOf(msgOuvert) >= 0,
    "contour ouvert : refus affiché (« " + msgOuvert + " »), rien ajouté", { n: e.remplir.n });
  const ex = PLANCHE.existant;
  await toucher(page, O.x + ex[0] + ex[2] / 2, O.y + ex[1] + ex[3] / 2);
  e = await etat(page);
  const msgDeja = await texte(page, "detect.remplir.deja");
  verifier(e.remplir.n === 3 && (await toasts(page)).indexOf(msgDeja) >= 0,
    "structure déjà dessinée : pas de doublon, refus affiché", { n: e.remplir.n });

  // ── 4. Valider, puis ⏪ ──
  await page.click('#kta-detect-bandeau [data-detect="valider-remplir"]');
  await page.waitForTimeout(600);
  const apres = await murs(page), poses = apres.slice(avant.length);
  const nivAttendu = await page.evaluate(function () { return window.ktaNiveauNouvelleStructure("mur"); });
  verifier(poses.length === 3 && !(await etat(page)), "« Valider » : 3 structures posées, parcours fermé",
    poses.length);
  verifier(poses.every(function (s) { return s.level === nivAttendu; }) && nivAttendu === 0,
    "type mur, au niveau du type (" + nivAttendu + ")", poses.map(function (s) { return s.level; }));
  verifier(poses.every(function (s) { return /^st_/.test(s.uid || "") && Number.isFinite(s.maj); }),
    "chaque structure a son uid et son updatedAt");
  const contours = PLANCHE.fermes.map(function (q) {
    const e2 = PLANCHE.ep / 2, x = O.x + q[0] - e2, y = O.y + q[1] - e2;   // milieu du trait
    return poses.some(function (s) {
      const xs = s.points.map(function (p) { return p.x; }), ys = s.points.map(function (p) { return p.y; });
      return Math.abs(Math.min.apply(null, xs) - x) <= 1 && Math.abs(Math.min.apply(null, ys) - y) <= 1 &&
        Math.abs(Math.max.apply(null, xs) - x - q[2] - 2 * e2) <= 1 &&
        Math.abs(Math.max.apply(null, ys) - y - q[3] - 2 * e2) <= 1;
    });
  });
  verifier(contours.every(Boolean), "contour de chaque pilier au milieu de son trait, à 1 px près", contours);
  const hist = await page.evaluate(function () {
    const H = window.HistoryManager;
    return H && typeof H.undo === "function" ? H.undo() : "absent";
  });
  await page.waitForTimeout(400);
  verifier((await murs(page)).length === avant.length, "UNE étape ⏪ retire les 3 structures", { undo: hist });

  // ── 5. Niveau du type : pilier-2 rangé au −1 (règle du tracé à la main), même hors niveau actif ──
  await page.evaluate(function () {
    window.KtaDetectionUI.ouvrir();
    document.querySelector('#kta-detect-bandeau [data-detect="remplir"]').click();
  });
  await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "pilier-2");
  const q0 = PLANCHE.fermes[0];
  await toucher(page, O.x + q0[0] + q0[2] / 2, O.y + q0[1] + q0[3] / 2);
  await page.click('#kta-detect-bandeau [data-detect="valider-remplir"]');
  await page.waitForTimeout(600);
  const p2 = await page.evaluate(function () {
    return window.getStructures().filter(function (s) { return s.type === "pilier-2"; }).map(function (s) {
      return s.level;
    });
  });
  verifier(p2.length === 1 && p2[0] === -1, "pilier-2 rempli : posé au niveau −1 (ktaNiveauNouvelleStructure)", p2);

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
  console.log("🎉 CHECKUP VERT — remplir au clic : mode, types fermés, aperçu, refus, doublon, Valider, ⏪.");
  process.exit(0);
})();
