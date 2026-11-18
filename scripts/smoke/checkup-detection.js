#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-detection.js — « Détecter les piliers » dans l'app réelle (js/detectionStructures.js)
// =====================================================================
// Relevé fictif seulement. Le checkup FABRIQUE une scène de piliers connus (12 orange dont un à pastille, 4 gris,
// plus un point trop petit et un contour creux qui ne doivent pas sortir) et la prête au plan en tuiles V2 (Blob dans
// RUNTIME_ASSETS, comme un ZIP), puis, sous chaque moteur de KTA_MOTEURS :
//   1. entrée outil Structures : pipette (Masse A puis Masse B) en touchant la carte, cadre par deux coins ;
//   2. aperçu : 16 piliers, RIEN d'écrit avant « Valider » ; un toucher en retire un ;
//   3. « Valider » : 15 structures (11 pilier-1, 4 pilier-2), uid + updatedAt, contour au pixel près ; UNE étape ⏪
//      les retire toutes ;
//   4. entrée 📊 Éditeur de données : couleurs retenues pour le plan, même parcours ; multi-niveau : pilier-2 au
//      niveau −1, signalé masqué ; relancer sur la même zone → 0 nouveau, 16 déjà présents ;
//   5. couleurs jamais exportées avec le profil ; Échap ferme et rend la rotation ; lecture seule : refusé.
// Usage : node scripts/smoke/checkup-detection.js   (SMOKE_PORT pour une copie de travail, KTA_MOTEURS)
// Doc : docs/architecture/plans-loader.md (Détecter les structures)
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
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

// Scène en pixels du plan, relative au coin O (posé au centre du plan dans la page).
const SCENE = {
  orange: [], gris: [],
  pastille: { c: 0, r: 0 }, petit: [20, 300, 6, 6], creux: [120, 300, 80, 80, 3],
  cadre: [5, 5, 620, 430]
};
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) SCENE.orange.push([20 + c * 110, 20 + r * 90, 50, 40]);
for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) SCENE.gris.push([480 + c * 80, 20 + r * 80, 40, 40]);

// Dans la page : scène fabriquée → tuiles V2 en Blob (RUNTIME_ASSETS), coin O rendu.
async function preterScene(page) {
  return page.evaluate(async function (S) {
    const pc = window.PLAN_CONFIG, p = pc.plan;
    const W = p.imageWidth || window.APP_CONFIG.imageWidth, H = p.imageHeight || window.APP_CONFIG.imageHeight;
    p.imageWidth = W; p.imageHeight = H;
    p.tiledV2 = true;
    pc.tiling = { minNativeZoom: -3, maxNativeZoom: 0, tileSize: 256, format: "png" };
    // Coin O : une zone du plan sans aucune structure (session et calques), sinon le dédoublonnage les écarterait.
    const occupes = (window.getStructures() || []).concat((window._ktaDataStructurePolygons || []).map(function (e) {
      return { points: e.points };
    })).filter(function (q) { return q && Array.isArray(q.points) && q.points.length; });
    const libre = function (o) {
      return !occupes.some(function (q) {
        return q.points.some(function (p) {
          return p.x > o.x - 40 && p.x < o.x + 680 && p.y > o.y - 40 && p.y < o.y + 490;
        });
      });
    };
    let O = null;
    for (let y = 40; y + 500 < H && !O; y += 60) for (let x = 40; x + 700 < W && !O; x += 60) {
      if (libre({ x: x, y: y })) O = { x: x, y: y };
    }
    if (!O) return null;
    const dessiner = function (k) {
      k.fillStyle = "#ff9933";
      S.orange.forEach(function (q) { k.fillRect(O.x + q[0], O.y + q[1], q[2], q[3]); });
      const q0 = S.orange[0];
      k.fillStyle = "#ffffff"; k.beginPath();
      k.arc(O.x + q0[0] + q0[2] / 2, O.y + q0[1] + q0[3] / 2, 6, 0, 7); k.fill();
      k.fillStyle = "#969696";
      S.gris.forEach(function (q) { k.fillRect(O.x + q[0], O.y + q[1], q[2], q[3]); });
      k.fillStyle = "#ff9933";
      k.fillRect(O.x + S.petit[0], O.y + S.petit[1], S.petit[2], S.petit[3]);
      const c = S.creux;
      k.fillRect(O.x + c[0], O.y + c[1], c[2], c[4]); k.fillRect(O.x + c[0], O.y + c[1] + c[3] - c[4], c[2], c[4]);
      k.fillRect(O.x + c[0], O.y + c[1], c[4], c[3]); k.fillRect(O.x + c[0] + c[2] - c[4], O.y + c[1], c[4], c[3]);
    };
    const T = 256, cols = Math.ceil(W / T), rows = Math.ceil(H / T);
    const blob = function (cv) { return new Promise(function (ok) { cv.toBlob(ok, "image/png"); }); };
    const cvB = document.createElement("canvas"); cvB.width = cvB.height = T;
    const kB = cvB.getContext("2d"); kB.fillStyle = "#ffffff"; kB.fillRect(0, 0, T, T);
    const blanc = await blob(cvB);
    window.RUNTIME_ASSETS = window.RUNTIME_ASSETS || {};
    for (let col = 0; col < cols; col++) for (let k = 1; k <= rows; k++) {
      const x0 = col * T, y0 = H - k * T;
      let f = blanc;
      if (x0 + T > O.x && x0 < O.x + 640 && y0 + T > O.y && y0 < O.y + 450) {
        const cv = document.createElement("canvas"); cv.width = cv.height = T;
        const kk = cv.getContext("2d"); kk.fillStyle = "#ffffff"; kk.fillRect(0, 0, T, T);
        kk.translate(-x0, -y0); dessiner(kk);
        f = await blob(cv);
      }
      window.RUNTIME_ASSETS["data/tiles/z0/x" + col + "_y" + (-k) + ".png"] = { file: f };
    }
    window.map.fitBounds(L.latLngBounds([window.convertCoord(O.x - 20, O.y - 20),
      window.convertCoord(O.x + 660, O.y + 470)]), { animate: false });
    try { localStorage.removeItem("myktamap_detect_couleurs_v1_" + window._currentLoadedPlanId); } catch (e) {}
    if (window.HistoryManager && typeof window.HistoryManager.reset === "function") window.HistoryManager.reset();
    return O;
  }, SCENE);
}

// Toucher la carte au point plan (x, y).
async function toucher(page, x, y) {
  const pt = await page.evaluate(function (a) {
    const r = window.map.getContainer().getBoundingClientRect();
    const c = window.map.latLngToContainerPoint(window.convertCoord(a.x, a.y));
    return { x: r.left + c.x, y: r.top + c.y };
  }, { x: x, y: y });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(250);
}
function etat(page) { return page.evaluate(function () { return window.KtaDetectionUI.etat(); }); }
async function bouton(page, act) {
  await page.click('#kta-detect-bandeau [data-detect="' + act + '"]');
  await page.waitForTimeout(200);
}
async function detecterCadre(page, O) {
  const c = SCENE.cadre;
  await bouton(page, "zone");
  await toucher(page, O.x + c[0], O.y + c[1]);
  await toucher(page, O.x + c[2], O.y + c[3]);
  await attendre(page, function () {
    const e = window.KtaDetectionUI.etat();
    return e && e.etape === "apercu";
  }, 60000);
}
function nosStructures(page) {
  return page.evaluate(function () {
    return window.getStructures().filter(function (s) { return s.type === "pilier-1" || s.type === "pilier-2"; })
      .map(function (s) { return { uid: s.uid, maj: s.updatedAt, type: s.type, level: s.level, points: s.points }; });
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
  const O = await preterScene(page);
  if (!O) {
    pb("aucune zone libre de structures dans le relevé fictif pour poser la scène");
    await ctx.close();
    return;
  }
  await page.waitForTimeout(500);
  const avant = (await nosStructures(page)).length;

  // ── 1. Entrée outil Structures ──
  console.log("— entrée outil Structures —");
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
    if (!btn) return "bouton introuvable";
    btn.click();
    return !!document.getElementById("kta-detect-bandeau") ? "ok" : "bandeau absent";
  });
  verifier(ouvert === "ok", "le bouton « Détecter les piliers » de l'outil Structures ouvre le parcours", ouvert);
  if (ouvert !== "ok") { await ctx.close(); return; }
  let e = await etat(page);
  verifier(e.etape === "exemples" && e.pipette === "a", "sans exemple retenu : la pipette Masse A est armée", e);
  const q0 = SCENE.orange[1], g0 = SCENE.gris[0];
  await toucher(page, O.x + q0[0] + 10, O.y + q0[1] + 10);
  await bouton(page, "pipette-b");
  await toucher(page, O.x + g0[0] + 10, O.y + g0[1] + 10);
  e = await etat(page);
  verifier(e.exemples.a === 1 && e.exemples.b === 1, "pipette : un exemple orange (A), un gris (B)", e.exemples);

  // ── 2. Aperçu ──
  await detecterCadre(page, O);
  e = await etat(page);
  verifier(e.apercu && e.apercu.n === 16 && e.apercu.deja === 0,
    "aperçu : 16 piliers (12 orange dont un à pastille, 4 gris), ni point trop petit ni contour creux", e.apercu);
  verifier((await nosStructures(page)).length === avant, "rien n'est écrit avant « Valider »");
  const cible = await page.evaluate(function () {
    const p = document.querySelector(".leaflet-ktaDetection-pane path.kta-detect-classe-a");
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (cible) { await page.mouse.click(cible.x, cible.y); await page.waitForTimeout(250); }
  e = await etat(page);
  verifier(e.apercu && e.apercu.retires === 1, "un toucher sur un objet de l'aperçu le retire", e.apercu);

  // ── 3. Valider, puis ⏪ ──
  await bouton(page, "valider");
  await page.waitForTimeout(600);
  let s = await nosStructures(page);
  const poses = s.slice(avant);
  verifier(poses.length === 15 && !(await etat(page)), "« Valider » : 15 structures posées, parcours fermé",
    poses.length);
  verifier(poses.filter(function (x) { return x.type === "pilier-1"; }).length === 11 &&
    poses.filter(function (x) { return x.type === "pilier-2"; }).length === 4,
    "types : 11 pilier-1 (A), 4 pilier-2 (B)");
  verifier(poses.every(function (x) { return /^st_/.test(x.uid || "") && Number.isFinite(x.maj); }),
    "chaque structure a son uid et son updatedAt");
  const gx = O.x + g0[0], gy = O.y + g0[1];
  const gris = poses.find(function (x) {
    const xs = x.points.map(function (p) { return p.x; }), ys = x.points.map(function (p) { return p.y; });
    return Math.abs(Math.min.apply(null, xs) - gx) < 1.5 && Math.abs(Math.min.apply(null, ys) - gy) < 1.5 &&
      Math.abs(Math.max.apply(null, xs) - gx - 40) < 1.5 && Math.abs(Math.max.apply(null, ys) - gy - 40) < 1.5;
  });
  verifier(!!gris && gris.points.length === 4, "contour au pixel près (carré gris de 40 px, 4 sommets)", gris);
  const annule = await page.evaluate(function () { return window.HistoryManager.undo(); });
  await page.waitForTimeout(400);
  s = await nosStructures(page);
  verifier(s.length === avant, "UNE étape ⏪ retire les 15 structures", { annule: annule, n: s.length });

  // ── 4. Entrée Éditeur de données, multi-niveau, doublons ──
  console.log("— entrée 📊 Éditeur de données —");
  await page.evaluate(function () {
    // plan multi-niveau qui n'affiche que son niveau actif : un pilier-2 posé au −1 y est masqué
    window.APP_CONFIG.multiLevel = true; window.APP_CONFIG.activeLevel = 0; window.APP_CONFIG.visibleLevels = [0];
    window.ouvrirTableEditor();
  });
  await attendre(page, function () { return !!document.getElementById("kta-tbl-src-detect"); }, 5000);
  await page.click("#kta-tbl-src-detect");
  await page.waitForTimeout(300);
  e = await etat(page);
  verifier(!!e && e.exemples.a === 1 && e.exemples.b === 1 && !e.pipette,
    "la carte de l'Éditeur de données ouvre le même parcours, couleurs retenues pour le plan", e);
  await detecterCadre(page, O);
  await bouton(page, "valider");
  await page.waitForTimeout(600);
  s = (await nosStructures(page)).slice(avant);
  verifier(s.length === 16 && s.every(function (x) { return x.level === (x.type === "pilier-2" ? -1 : 0); }),
    "multi-niveau : pilier-1 au niveau actif (0), pilier-2 au niveau −1 (règle du tracé à la main)",
    s.map(function (x) { return x.type + "@" + x.level; }).slice(0, 6));
  const toasts = await page.evaluate(function () {
    return Array.prototype.slice.call(document.querySelectorAll(".oom-toast, [class*='toast']")).map(function (t) {
      return t.textContent;
    }).join(" | ");
  });
  verifier(toasts.indexOf(await page.evaluate(function () {
    return window.I18n.t("detect.toast.masquees", { n: 4 });
  })) >= 0, "les 4 pilier-2 rangés au niveau −1 sont signalés masqués", { toasts: toasts.slice(0, 160),
    niveaux: await page.evaluate(function () { return window.APP_CONFIG.visibleLevels; }) });
  await page.evaluate(function () { window.KtaDetectionUI.ouvrir(); });
  await detecterCadre(page, O);
  e = await etat(page);
  verifier(e.apercu && e.apercu.n === 0 && e.apercu.deja === 16,
    "relancer sur la même zone : 0 nouveau, 16 déjà présents",
    e.apercu);

  // ── 5. Échap, rotation rendue, lecture seule ──
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const apres = await page.evaluate(function () {
    const pris = window.MapBearing.setManuel(30);
    const b = window.MapBearing.getBearing();
    window.MapBearing.remettreNord();
    return { ferme: !window.KtaDetectionUI.etat() && !document.getElementById("kta-detect-bandeau"), pris: pris, b: b };
  });
  verifier(apres.ferme && Math.abs(apres.b - 30) < 1, "Échap ferme le parcours et rend la rotation", apres);
  const refus = await page.evaluate(function () {
    const orig = window.ktaEditionRefusee;
    window.ktaEditionRefusee = function () { return true; };
    const r = window.KtaDetectionUI.ouvrir();
    window.ktaEditionRefusee = orig;
    return { r: r, bandeau: !!document.getElementById("kta-detect-bandeau") };
  });
  verifier(refus.r === false && !refus.bandeau, "lecture seule : le parcours ne s'ouvre pas", refus);

  verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  await ctx.close();
}

(async function main() {
  // Couleurs propres à l'appareil : jamais dans les préfixes exportés avec le profil.
  const exp = fs.readFileSync(path.join(__dirname, "..", "..", "js", "profileExportImport.js"), "utf8");
  const bloc = (exp.match(/const PER_PLAN_PREFIXES = \[([\s\S]*?)\];/) || [])[1] || "";
  moteurCourant = "fichiers";
  verifier(bloc && bloc.indexOf("myktamap_detect_couleurs_v1_") < 0,
    "couleurs de la détection exclues de l'export du profil");
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
  console.log("🎉 CHECKUP VERT — détecter les piliers : pipette, cadre, aperçu, Valider, ⏪, doublons, deux entrées.");
  process.exit(0);
})();
