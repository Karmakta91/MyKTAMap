#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-remplir-plafond.js — checkup (Playwright, pas un hook pré-commit) : plafond de « Remplir au clic » en mode
// structures (js/ktaDetection.js > plafondRemplir, js/detectionStructures.js > _remplirEn)
// =====================================================================
// Relevé fictif seulement. Le checkup FABRIQUE une planche (massifs blancs cernés de noir, une galerie ouverte entre
// deux traits) prêtée au plan en tuiles V2, puis, sous chaque moteur de KTA_MOTEURS :
//   1. plan à échelle connue (10 px/m, écrite pour le test) : massif de 60 m rempli ; massif de 79 m (au plafond de
//      80 m) rempli, temps mesuré ; massif de 90 m refusé « trop grande » ;
//   2. plan sans échelle : massif de 900 px rempli (plafond relatif à l'image, 1 024 px de côté au moins) ;
//   3. galerie ouverte : toujours refusée « contour ouvert », avec et sans échelle ; jamais une zone partielle.
// Temps : chaque remplissage est chronométré (du toucher à la fin de la lecture) ; sous Chromium, le massif au plafond
// est rejoué avec le processeur ralenti × 4 (CDP), ordre de grandeur d'un téléphone.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8214 node scripts/smoke/checkup-remplir-plafond.js
// Doc : docs/architecture/plans-loader.md (Détecter les structures, Remplir au clic, Plafond)
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
const PX_PAR_M = 10;
const LIMITE_MS = 20000;   // au-delà, le remplissage au plafond est jugé trop lent (même processeur ralenti)

const problemes = [];
let moteurCourant = "";
function pb(msg) { problemes.push("[" + moteurCourant + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) {
  if (cond) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
}

// Planche en px du plan, relative au coin O : massifs [x, y, côté] blancs cernés d'un trait noir de 4 px ;
// galerie ouverte : deux traits horizontaux de 4 px, ouverts aux deux bouts, sur le fond blanc.
const PLANCHE = {
  massifs: { m60: [40, 40, 600], m900: [700, 40, 900], m79: [1660, 40, 790] },
  galerie: { x: 40, y: 1000, long: 600, large: 50 },
  taille: [2500, 1100]
};

async function preterPlanche(page) {
  return page.evaluate(async function (S) {
    const pc = window.PLAN_CONFIG, p = pc.plan, C = window.APP_CONFIG;
    const W = p.imageWidth || C.imageWidth, H = p.imageHeight || C.imageHeight;
    p.imageWidth = W; p.imageHeight = H;
    p.tiledV2 = true;
    pc.tiling = { minNativeZoom: -3, maxNativeZoom: 0, tileSize: 256, format: "png" };
    // 🩸 La planche est grande (2 500 × 1 100 px) : aucune place libre dans le relevé fictif. Les structures des
    //   calques sont donc retirées du test (seules elles font refuser un remplissage, « déjà présente »).
    window._ktaDataStructurePolygons = [];
    const occupes = (window.getStructures() || [])
      .filter(function (q) { return q && Array.isArray(q.points) && q.points.length; });
    const libre = function (o) {
      return !occupes.some(function (q) {
        return q.points.some(function (pt) {
          return pt.x > o.x - 60 && pt.x < o.x + S.taille[0] + 60 && pt.y > o.y - 60 && pt.y < o.y + S.taille[1] + 60;
        });
      });
    };
    let O = null;
    for (let y = 80; y + S.taille[1] + 80 < H && !O; y += 40) {
      for (let x = 80; x + S.taille[0] + 80 < W && !O; x += 40) if (libre({ x: x, y: y })) O = { x: x, y: y };
    }
    if (!O) return { O: null, W: W, H: H };
    const dessiner = function (k) {
      Object.keys(S.massifs).forEach(function (n) {
        const q = S.massifs[n];
        k.fillStyle = "#141414"; k.fillRect(O.x + q[0] - 4, O.y + q[1] - 4, q[2] + 8, q[2] + 8);
        k.fillStyle = "#ffffff"; k.fillRect(O.x + q[0], O.y + q[1], q[2], q[2]);
      });
      const g = S.galerie;
      k.fillStyle = "#141414";
      k.fillRect(O.x + g.x, O.y + g.y - 4, g.long, 4);
      k.fillRect(O.x + g.x, O.y + g.y + g.large, g.long, 4);
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
      if (x0 + T > O.x - 8 && x0 < O.x + S.taille[0] + 8 && y0 + T > O.y - 8 && y0 < O.y + S.taille[1] + 8) {
        const cv = document.createElement("canvas"); cv.width = cv.height = T;
        const kk = cv.getContext("2d"); kk.fillStyle = "#ffffff"; kk.fillRect(0, 0, T, T);
        kk.translate(-x0, -y0); dessiner(kk);
        f = await blob(cv);
      }
      window.RUNTIME_ASSETS["data/tiles/z0/x" + col + "_y" + (-k) + ".png"] = { file: f };
    }
    window.map.fitBounds(L.latLngBounds([window.convertCoord(O.x - 20, O.y - 20),
      window.convertCoord(O.x + S.taille[0] + 20, O.y + S.taille[1] + 20)]),
      { animate: false, paddingBottomRight: [0, 280] });   // le bandeau du bas ne couvre aucune forme
    return { O: O, W: W, H: H };
  }, PLANCHE);
}

function echelle(page, k) {
  return page.evaluate(function (v) {
    const pc = window.PLAN_CONFIG;
    pc.tracking = pc.tracking || {};
    if (v) pc.tracking.scale = v; else delete pc.tracking.scale;
    return window.KtaDetection.plafondRemplir(v, { largeur: window.APP_CONFIG.imageWidth,
      hauteur: window.APP_CONFIG.imageHeight });
  }, k);
}
function etat(page) { return page.evaluate(function () { return window.KtaDetectionUI.etat(); }); }
function texte(page, cle) { return page.evaluate(function (k) { return window.I18n.t(k); }, cle); }
function toasts(page) {
  return page.evaluate(function () {
    return Array.prototype.slice.call(document.querySelectorAll(".oom-toast, [class*='toast']")).map(function (t) {
      return t.textContent;
    }).join(" | ");
  });
}
function viderToasts(page) {
  return page.evaluate(function () {
    document.querySelectorAll(".oom-toast, [class*='toast']").forEach(function (t) { t.remove(); });
  });
}
// Toucher (x, y) du plan en Remplir : → { n (remplissages en aperçu), ms, toasts }.
async function remplirEn(page, x, y) {
  await viderToasts(page);
  const pt = await page.evaluate(function (a) {
    const r = window.map.getContainer().getBoundingClientRect();
    const c = window.map.latLngToContainerPoint(window.convertCoord(a.x, a.y));
    return { x: r.left + c.x, y: r.top + c.y };
  }, { x: x, y: y });
  const t0 = Date.now();
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(50);
  await attendre(page, function () {
    const e = window.KtaDetectionUI.etat();
    return !e || !(e.remplir && e.remplir.enCours);
  }, 120000);
  const ms = Date.now() - t0;
  await page.waitForTimeout(150);
  const e = await etat(page);
  return { n: e && e.remplir ? e.remplir.n : -1, ms: ms, toasts: await toasts(page) };
}
// Retire le dernier remplissage (laisse la planche réutilisable pour le cas suivant).
async function retirerDernier(page) {
  await page.evaluate(function () {
    const b = document.querySelector('#kta-detect-bandeau [data-detect="retirer-dernier"]');
    if (b && !b.disabled) b.click();
  });
  await page.waitForTimeout(150);
}
async function ouvrirRemplir(page) {
  await page.evaluate(function () {
    const ui = window.KtaDetectionUI;
    if (ui.etat()) ui.fermer();
    ui.ouvrir();
    const b = document.querySelector('#kta-detect-bandeau [data-detect="remplir"]');
    if (b) b.click();
  });
  await page.waitForTimeout(200);
  await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "mur");
}

async function parcours(page, O, nav) {
  const centre = function (n) { const q = PLANCHE.massifs[n]; return { x: O.x + q[0] + q[2] / 2, y: O.y + q[1] + q[2] / 2 }; };
  const G = PLANCHE.galerie, gal = { x: O.x + G.x + G.long / 2, y: O.y + G.y + G.large / 2 };
  const tropGrand = await texte(page, "detect.remplir.refus.tropGrand");
  const ouvert = await texte(page, "detect.remplir.refus.ouvert");

  // ── 1. Plan à échelle connue ──
  const pl = await echelle(page, PX_PAR_M);
  verifier(pl.coteMax === 80 * PX_PAR_M, "échelle " + PX_PAR_M + " px/m : plafond de 80 m (" + pl.coteMax + " px)", pl);
  await ouvrirRemplir(page);
  let c = centre("m60"), r = await remplirEn(page, c.x, c.y);
  verifier(r.n === 1, "massif fictif de 60 m rempli (" + r.ms + " ms)", r);
  await retirerDernier(page);
  c = centre("m79"); r = await remplirEn(page, c.x, c.y);
  verifier(r.n === 1 && r.ms < LIMITE_MS, "massif fictif de 79 m (plafond 80 m) rempli en " + r.ms + " ms", r);
  await retirerDernier(page);
  if (moteurCourant === "chromium") {
    let cdp = null;
    try {
      cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      r = await remplirEn(page, c.x, c.y);
      verifier(r.n === 1 && r.ms < LIMITE_MS,
        "massif de 79 m, processeur ralenti × 4 (ordre d'un téléphone) : rempli en " + r.ms + " ms", r);
      await retirerDernier(page);
    } catch (err) {
      pb("ralenti × 4 indisponible : " + (err && err.message));
    } finally {
      if (cdp) { try { await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }); } catch (e) { /* fermé */ } }
    }
  }
  c = centre("m900"); r = await remplirEn(page, c.x, c.y);
  verifier(r.n === 0 && r.toasts.indexOf(tropGrand) >= 0,
    "massif fictif de 90 m (au-delà du plafond) refusé « trop grande » (" + r.ms + " ms)", r);
  r = await remplirEn(page, gal.x, gal.y);
  verifier(r.n === 0 && r.toasts.indexOf(ouvert) >= 0, "échelle connue : galerie ouverte refusée « contour ouvert »", r);

  // ── 2. Plan sans échelle ──
  const ps = await echelle(page, null);
  verifier(!ps.coteMax && ps.cote >= 1024 && ps.aireMax === ps.cote * ps.cote,
    "sans échelle : plafond relatif à l'image, " + ps.cote + " px de côté (au moins 1 024)", ps);
  await ouvrirRemplir(page);
  c = centre("m900"); r = await remplirEn(page, c.x, c.y);
  verifier(r.n === 1 && r.ms < LIMITE_MS, "sans échelle : massif fictif de 900 px rempli en " + r.ms + " ms", r);
  await retirerDernier(page);
  r = await remplirEn(page, gal.x, gal.y);
  verifier(r.n === 0 && r.toasts.indexOf(ouvert) >= 0, "sans échelle : galerie ouverte refusée « contour ouvert »", r);
  await page.evaluate(function () { if (window.KtaDetectionUI.etat()) window.KtaDetectionUI.fermer(); });
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
  const P = await preterPlanche(page);
  if (!P.O) {
    pb("aucune zone libre de " + PLANCHE.taille.join(" × ") + " px dans le relevé fictif (image " + P.W + " × " + P.H +
      ")");
    await ctx.close();
    return;
  }
  await page.waitForTimeout(800);
  try { await parcours(page, P.O, nav); }
  catch (err) { pb("exception du harnais : " + (err && err.message)); }
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
  console.log("🎉 CHECKUP VERT — plafond de Remplir : 80 m à échelle connue, relatif à l'image sans échelle, " +
    "galerie ouverte toujours refusée.");
  process.exit(0);
})();
