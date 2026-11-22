#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-affiner-contours.js — checkup (Playwright, pas un hook pré-commit) : case « Affiner les contours » de la
// fenêtre Détecter (js/detectionStructures.js, moteur js/ktaDetection.js > _affiner)
// =====================================================================
// Relevé fictif seulement. Le checkup FABRIQUE une planche : deux piliers carrés identiques au trait noir BRUITÉ
// (± 2 px, plan de mauvaise qualité), prêtée au plan en tuiles V2 (Blob dans RUNTIME_ASSETS) ; échelle du plan mise
// à 20 px/m en mémoire (tolérance 0,25 m = 5 px). Sous chaque moteur de KTA_MOTEURS (Chromium et WebKit par défaut) :
//   1. Détecter : la case est là, COCHÉE par défaut (aucun réglage retenu) ;
//   2. Remplir au clic, case cochée : le premier carré sort en rectangle (4 sommets) ;
//   3. case décochée : le second carré sort en dent de scie (plus de 8 sommets), choix retenu (« 0 ») ;
//   4. « Valider » : rectangle aux angles droits (± 1°) posé ;
//   5. page rechargée, Détecter rouvert : la case est restée décochée ; recochée, retenue (« 1 »).
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8184 node scripts/smoke/checkup-affiner-contours.js
// Doc : docs/architecture/plans-loader.md (Détecter les structures)
// =====================================================================
"use strict";

const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const PLAN = "Relevé fictif de test";
const CLE = "myktamap_detect_affiner_v1";
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

// Planche (px relatifs au coin O) : deux carrés de 80 px (côté au milieu du trait), trait de 6 px dont chaque bord
// s'écarte de ± 2 px, tiré tous les 3 px le long du contour (graine fixe, même tirage que scripts/check-detection.js).
const PLANCHE = { carres: [[40, 40], [200, 40]], cote: 80, ep: 6, amp: 2, pas: 3, graine: 7, taille: [320, 160] };
function pixelsBruites(S) {
  const out = [];
  S.carres.forEach(function (c) {
    const poly = [[c[0], c[1]], [c[0] + S.cote, c[1]], [c[0] + S.cote, c[1] + S.cote], [c[0], c[1] + S.cote]];
    const cumul = [0, S.cote, 2 * S.cote, 3 * S.cote];
    const hasard = function (k) {
      let g = (k * 2654435761 + S.graine * 97) >>> 0;
      g = Math.imul(g ^ (g >>> 13), 1274126177) >>> 0;
      return ((g ^ (g >>> 16)) >>> 0) / 4294967296;
    };
    const bruit = function (s, k) { return Math.round((hasard(Math.floor(s / S.pas) * 2 + k) * 2 - 1) * S.amp); };
    const M = S.ep + S.amp + 2;
    for (let y = c[1] - M; y <= c[1] + S.cote + M; y++) {
      for (let x = c[0] - M; x <= c[0] + S.cote + M; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        let best = Infinity, s = 0;
        for (let i = 0; i < 4; i++) {
          const a = poly[i], b = poly[(i + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
          const u = Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cy - a[1]) * dy) / L2));
          const d = Math.hypot(cx - a[0] - u * dx, cy - a[1] - u * dy);
          if (d < best) { best = d; s = cumul[i] + u * Math.sqrt(L2); }
        }
        const dedans = cx > c[0] && cx < c[0] + S.cote && cy > c[1] && cy < c[1] + S.cote;
        const sd = dedans ? -best : best;
        if (sd >= -S.ep / 2 + bruit(s, 0) && sd <= S.ep / 2 + bruit(s, 1)) out.push([x, y]);
      }
    }
  });
  return out;
}

async function preterPlanche(page) {
  return page.evaluate(async function (a) {
    const S = a.S, noirs = a.noirs, pc = window.PLAN_CONFIG, p = pc.plan;
    const W = p.imageWidth || window.APP_CONFIG.imageWidth, H = p.imageHeight || window.APP_CONFIG.imageHeight;
    p.imageWidth = W; p.imageHeight = H;
    p.tiledV2 = true;
    pc.tiling = { minNativeZoom: -3, maxNativeZoom: 0, tileSize: 256, format: "png" };
    pc.tracking = Object.assign({}, pc.tracking || {}, { scale: 20 });   // en mémoire : 0,25 m = 5 px
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
        kk.fillStyle = "#141414";
        noirs.forEach(function (q) { kk.fillRect(O.x + q[0] - x0, O.y + q[1] - y0, 1, 1); });
        f = await blob(cv);
      }
      window.RUNTIME_ASSETS["data/tiles/z0/x" + col + "_y" + (-k) + ".png"] = { file: f };
    }
    window.map.fitBounds(L.latLngBounds([window.convertCoord(O.x - 20, O.y - 20),
      window.convertCoord(O.x + S.taille[0] + 20, O.y + S.taille[1] + 20)]), { animate: false });
    if (window.HistoryManager && typeof window.HistoryManager.reset === "function") window.HistoryManager.reset();
    return O;
  }, { S: PLANCHE, noirs: pixelsBruites(PLANCHE) });
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
function caseAffiner(page) {
  return page.evaluate(function () {
    const c = document.querySelector("#kta-detect-bandeau [data-detect-affiner]");
    return c ? { cochee: c.checked, libelle: (c.parentNode.textContent || "").trim() } : null;
  });
}
function retenu(page, cle) {
  return page.evaluate(function (k) { try { return localStorage.getItem(k); } catch (e) { return "illisible"; } }, cle);
}

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN, { exact: false }).first().click();
  await attendre(page, function () {
    return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan && !!window.KtaDetectionUI;
  }, 90000);
  await page.waitForTimeout(2000);
}
// Outil Structures → Détecter (même entrée que l'utilisateur)
function ouvrirDetecter(page) {
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
    return document.getElementById("kta-detect-bandeau") ? "ok" : "bandeau absent";
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
  await ouvrirPlan(page);
  await page.evaluate(function (k) { try { localStorage.removeItem(k); } catch (e) {} }, CLE);
  const O = await preterPlanche(page);
  if (!O) {
    pb("aucune zone libre de structures dans le relevé fictif pour poser la planche");
    await ctx.close();
    return;
  }
  await page.waitForTimeout(500);

  // ── 1. Case présente, cochée par défaut ──
  const ouvert = await ouvrirDetecter(page);
  verifier(ouvert === "ok", "outil Structures → Détecter ouvre la fenêtre", ouvert);
  if (ouvert !== "ok") { await ctx.close(); return; }
  const libelle = await page.evaluate(function () { return window.I18n.t("detect.affiner"); });
  let c = await caseAffiner(page);
  verifier(c && c.cochee && c.libelle.indexOf(libelle) >= 0 && (await etat(page)).affiner === true,
    "case « " + libelle + " » présente et COCHÉE par défaut (aucun réglage retenu)", c);

  // ── 2. Remplir, case cochée : rectangle ──
  await page.click('#kta-detect-bandeau [data-detect="remplir"]');
  await page.waitForTimeout(200);
  c = await caseAffiner(page);
  verifier(c && c.cochee, "mode Remplir au clic : la case y est, cochée", c);
  await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "mur");
  const cote = PLANCHE.cote, a = PLANCHE.carres[0], b = PLANCHE.carres[1];
  await toucher(page, O.x + a[0] + cote / 2, O.y + a[1] + cote / 2);
  let e = await etat(page);
  verifier(e.remplir.n === 1 && e.remplir.sommets[0] === 4,
    "case cochée : le carré au trait bruité sort en rectangle (4 sommets)", e.remplir);

  // ── 3. Case décochée : dent de scie, choix retenu ──
  await page.click("#kta-detect-bandeau [data-detect-affiner]");
  await page.waitForTimeout(150);
  c = await caseAffiner(page);
  verifier(c && !c.cochee && (await etat(page)).affiner === false && (await retenu(page, CLE)) === "0",
    "case décochée : état et choix retenu sur l'appareil (« 0 »)", { c: c, ls: await retenu(page, CLE) });
  await toucher(page, O.x + b[0] + cote / 2, O.y + b[1] + cote / 2);
  e = await etat(page);
  verifier(e.remplir.n === 2 && e.remplir.sommets[1] > 8,
    "case décochée : le même carré sort comme avant, en dent de scie (> 8 sommets)", e.remplir);

  // ── 4. Valider : le rectangle posé a des angles droits ──
  const avant = await page.evaluate(function () { return window.getStructures().length; });
  await page.click('#kta-detect-bandeau [data-detect="valider-remplir"]');
  await page.waitForTimeout(600);
  const poses = await page.evaluate(function (n) { return window.getStructures().slice(n); }, avant);
  const rect = poses.filter(function (s) { return s.points.length === 4; })[0];
  const angle = rect ? Math.max.apply(null, rect.points.map(function (p, i) {
    const q = rect.points[(i + 3) % 4], r = rect.points[(i + 1) % 4];
    const u = [q.x - p.x, q.y - p.y], v = [r.x - p.x, r.y - p.y];
    const cs = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]));
    return Math.abs(Math.acos(Math.max(-1, Math.min(1, cs))) * 180 / Math.PI - 90);
  })) : null;
  verifier(poses.length === 2 && rect && angle <= 1, "« Valider » : 2 structures, le rectangle aux angles droits (± 1°)",
    { n: poses.length, angle: angle });

  // ── 5. Retenue : page rechargée, case toujours décochée ; recochée, retenue ──
  await ouvrirPlan(page);
  const rouvert = await ouvrirDetecter(page);
  c = await caseAffiner(page);
  verifier(rouvert === "ok" && c && !c.cochee, "page rechargée : la case est restée décochée", { rouvert: rouvert, c: c });
  if (c) {
    await page.click("#kta-detect-bandeau [data-detect-affiner]");
    await page.waitForTimeout(150);
    c = await caseAffiner(page);
    verifier(c && c.cochee && (await retenu(page, CLE)) === "1", "recochée : retenue (« 1 »)",
      { c: c, ls: await retenu(page, CLE) });
  }
  await page.evaluate(function () { if (window.KtaDetectionUI.etat()) window.KtaDetectionUI.fermer(); });

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
  console.log("🎉 CHECKUP VERT — affiner les contours : case cochée par défaut, retenue, effet sur Remplir.");
  process.exit(0);
})();
