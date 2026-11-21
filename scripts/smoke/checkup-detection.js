#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-detection.js — « Détecter les piliers » dans l'app réelle (js/detectionStructures.js)
// =====================================================================
// Relevé fictif seulement. Le checkup FABRIQUE une scène connue (12 piliers orange dont un à pastille, 4 gris, 2 fronts
// orange de la couleur des piliers, une bande grise soudée à deux piliers gris, plus un point trop petit et un contour
// creux gris qui ne doivent pas sortir) et la
// prête au plan en tuiles V2 (Blob dans RUNTIME_ASSETS, comme un ZIP), puis, sous chaque moteur de KTA_MOTEURS :
//   1. entrée outil Structures : pipette (Masse A, Masse B, Front) en touchant la carte, cadre par deux coins ;
//   2. aperçu : 16 piliers et 2 fronts, RIEN d'écrit avant « Valider » ; un toucher en retire un ; curseur de
//      tolérance = valeur appliquée aux masses, le front hors curseur ;
//   3. « Valider » : 17 structures (11 pilier-1, 4 pilier-2, 2 front-1), uid + updatedAt, contour au pixel près,
//      fronts aux bons bouts ; UNE étape ⏪ les retire toutes ;
//   4. entrée 📊 Éditeur de données : couleurs retenues pour le plan, même parcours ; multi-niveau : pilier-2 au
//      niveau −1, signalé masqué ; relancer sur la même zone → 0 nouveau, 18 déjà présents ;
//   5. couleurs jamais exportées avec le profil ; Échap ferme et rend la rotation ; lecture seule : refusé ;
//   6. plan au trait (piliers blancs cernés) : petit pilier touché près du bord = son intérieur, 17 piliers.
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
  fronts: [[[20, 400], [600, 400]], [[455, 160], [455, 380]]], epaisseur: 4,
  bande: [470, 56, 145, 8],   // bande de galerie grise soudée aux deux piliers gris du haut : jamais un pilier
  petitBlanc: [24, 320, 9, 9],   // plan au trait seulement : petit pilier blanc cerné de 1 px, touché près du bord
  cadre: [5, 5, 620, 430]
};
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) SCENE.orange.push([20 + c * 110, 20 + r * 90, 50, 40]);
for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) SCENE.gris.push([480 + c * 80, 20 + r * 80, 40, 40]);

// Dans la page : scène fabriquée → tuiles V2 en Blob (RUNTIME_ASSETS), coin O rendu.
async function preterScene(page, blanc) {
  return page.evaluate(async function (S) {
    const planBlanc = S.__blanc;
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
      if (planBlanc) {   // plan au trait : piliers blancs (couleur du fond) cernés de noir (1 ou 2 px), murs de galerie
        S.orange.concat(S.gris).forEach(function (q, i) {
          const ep = i % 2 ? 1 : 2;
          k.fillStyle = "#141414"; k.fillRect(O.x + q[0] - ep, O.y + q[1] - ep, q[2] + 2 * ep, q[3] + 2 * ep);
          k.fillStyle = "#ffffff"; k.fillRect(O.x + q[0], O.y + q[1], q[2], q[3]);
        });
        k.fillStyle = "#141414"; k.fillRect(O.x + 10, O.y + 280, 600, 2);
        const pb = S.petitBlanc;
        k.fillRect(O.x + pb[0] - 1, O.y + pb[1] - 1, pb[2] + 2, pb[3] + 2);
        k.fillStyle = "#ffffff"; k.fillRect(O.x + pb[0], O.y + pb[1], pb[2], pb[3]);
        return;
      }
      k.fillStyle = "#ff9933";
      S.orange.forEach(function (q) { k.fillRect(O.x + q[0], O.y + q[1], q[2], q[3]); });
      const q0 = S.orange[0];
      k.fillStyle = "#ffffff"; k.beginPath();
      k.arc(O.x + q0[0] + q0[2] / 2, O.y + q0[1] + q0[3] / 2, 6, 0, 7); k.fill();
      k.fillStyle = "#969696";
      S.gris.forEach(function (q) { k.fillRect(O.x + q[0], O.y + q[1], q[2], q[3]); });
      k.fillStyle = "#ff9933";
      k.fillRect(O.x + S.petit[0], O.y + S.petit[1], S.petit[2], S.petit[3]);
      k.strokeStyle = "#ff9933"; k.lineWidth = S.epaisseur; k.lineCap = "butt";
      S.fronts.forEach(function (f) {
        k.beginPath(); k.moveTo(O.x + f[0][0], O.y + f[0][1]); k.lineTo(O.x + f[1][0], O.y + f[1][1]); k.stroke();
      });
      k.fillStyle = "#969696";
      k.fillRect(O.x + S.bande[0], O.y + S.bande[1], S.bande[2], S.bande[3]);
      // contour creux GRIS : masse B, jamais un trait
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
  }, Object.assign({ __blanc: !!blanc }, SCENE));
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
// Valeur affichée par le curseur de tolérance (texte à côté ET position du curseur, qui doivent concorder).
function valeurCurseur(page) {
  return page.evaluate(function () {
    const i = document.querySelector('#kta-detect-bandeau [data-detect-curseur="tolerance"]');
    const v = i && i.parentNode.querySelector(".kta-detect-valeur");
    return i && v && Number(i.value) === Number(v.textContent) ? Number(i.value) : null;
  });
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
    return window.getStructures().filter(function (s) { return /^(pilier|front)-[12]$/.test(s.type); })
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
  await bouton(page, "pipette-f");
  await toucher(page, O.x + 300, O.y + 400);
  e = await etat(page);
  verifier(e.exemples.a === 1 && e.exemples.b === 1 && e.exemples.f === 1,
    "pipette : un exemple orange (A), un gris (B), un trait de front", e.exemples);

  // ── 2. Aperçu ──
  await detecterCadre(page, O);
  e = await etat(page);
  verifier(e.apercu && e.apercu.n === 18 && e.apercu.traits === 2 && e.apercu.deja === 0,
    "aperçu : 16 piliers et 2 fronts de la couleur des piliers, ni point trop petit ni contour creux", e.apercu);
  verifier((await nosStructures(page)).length === avant, "rien n'est écrit avant « Valider »");
  // Réglages déduits des exemples touchés : taille minimale = plus petit pilier touché (gris de 40 px, orange 50 × 40).
  verifier(e.curseurs && e.curseurs.taille >= 30 && e.curseurs.taille <= 42 && e.curseurs.tolerance >= 22,
    "réglages déduits des touchers : taille minimale " + (e.curseurs && e.curseurs.taille) + " px, tolérance " +
    (e.curseurs && e.curseurs.tolerance), e.curseurs);
  // Curseur de tolérance : affiche la tolérance appliquée à la Masse A (les fronts gardent la leur, hors curseur).
  const affA = await valeurCurseur(page);
  verifier(e.tolerances && affA === e.tolerances.a && affA === e.curseurs.tolerance,
    "curseur de tolérance : valeur affichée (" + affA + ") = tolérance appliquée à la Masse A (" +
    (e.tolerances && e.tolerances.a) + "), front à part (" + (e.tolerances && e.tolerances.f) + ")", e.tolerances);
  // Curseur « Taille minimale » poussé à 80 px : recalcul sur les blocs déjà lus, sans relire l'image.
  const curseur = async function (nom, v, recalculs) {
    await page.evaluate(function (a) {
      const i = document.querySelector('#kta-detect-bandeau [data-detect-curseur="' + a.nom + '"]');
      window.__recalculsVises = a.recalculs;
      i.value = String(a.v);
      i.dispatchEvent(new Event("input", { bubbles: true }));
    }, { nom: nom, v: v, recalculs: recalculs });
    await attendre(page, function () {
      const s = window.KtaDetectionUI.etat();
      return s && s.recalculs >= window.__recalculsVises;
    }, 15000);
    return etat(page);
  };
  const tailleDeduite = e.curseurs.taille, lus = e.lectures;
  let e2 = await curseur("taille", 80, 1);
  verifier(e2.recalculable && e2.lectures === lus && e2.apercu.n < e.apercu.n && e2.apercu.traits === 2,
    "curseur Taille minimale à 80 px : piliers écartés (" + e.apercu.n + " → " + e2.apercu.n + "), fronts gardés, " +
    "sans relire l'image", { lectures: [lus, e2.lectures], n: e2.apercu.n, recalculable: e2.recalculable });
  const libAjouter = await page.evaluate(function () {
    return document.querySelector('#kta-detect-bandeau [data-detect="valider"]').textContent;
  });
  verifier(libAjouter.indexOf(String(e2.apercu.n)) >= 0, "« Ajouter » suit le nouveau compte (" + libAjouter + ")");
  e2 = await curseur("taille", tailleDeduite, 2);
  verifier(e2.apercu.n === 18 && e2.lectures === lus, "curseur remis à " + tailleDeduite + " px : 18 de nouveau, " +
    "toujours sans relecture", { n: e2.apercu.n, lectures: e2.lectures });
  const tMax = e2.curseurs.tailleMax;
  verifier(tMax >= 80 && tMax <= 256, "taille maximale déduite du plus grand exemple (× 4 en aire) : " + tMax + " px",
    tMax);
  e2 = await curseur("tailleMax", 30, 3);
  verifier(e2.apercu.n === 2 && e2.apercu.ecartees >= 16 && e2.lectures === lus,
    "curseur Taille maximale à 30 px : les 16 piliers écartés et comptés à part (" + e2.apercu.ecartees + "), fronts " +
    "gardés, sans relire l'image", { n: e2.apercu.n, ecartees: e2.apercu.ecartees, lectures: e2.lectures });
  const bilanMax = await page.evaluate(function () {
    return document.querySelector("#kta-detect-bandeau .kta-racc-info").textContent;
  });
  verifier(bilanMax.indexOf(String(e2.apercu.ecartees)) >= 0, "le bilan dit combien la taille maximale en écarte",
    bilanMax);
  e2 = await curseur("tailleMax", tMax, 4);
  verifier(e2.apercu.n === 18, "curseur Taille maximale remis : 18 de nouveau", e2.apercu.n);
  // Curseur de tolérance bougé : masses à la valeur affichée, le front garde la sienne (avant : toutes les classes
  // prenaient la valeur du curseur, qui affichait la plus haute)
  const tolA = e2.tolerances.a, tolF = e2.tolerances.f;
  e2 = await curseur("tolerance", tolA + 9, 5);
  const affBouge = await valeurCurseur(page);
  verifier(affBouge === tolA + 9 && e2.tolerances.a === tolA + 9 && e2.tolerances.b === tolA + 9 &&
    e2.tolerances.f === tolF, "curseur de tolérance à " + (tolA + 9) + " : masses A et B à la valeur affichée, front " +
    "inchangé (" + e2.tolerances.f + ")", { affiche: affBouge, tolerances: e2.tolerances });
  e2 = await curseur("tolerance", tolA, 6);
  verifier(e2.apercu.n === 18 && e2.tolerances.a === tolA, "curseur de tolérance remis : 18 de nouveau", e2.apercu);
  const garde = await page.evaluate(function () {
    const cle = "myktamap_detect_couleurs_v1_" + window._currentLoadedPlanId;
    try { return JSON.parse(localStorage.getItem(cle)).curseurs; }
    catch (err) { return null; }
  });
  verifier(garde && garde.taille === tailleDeduite, "valeurs des curseurs gardées avec les couleurs du plan", garde);
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
  verifier(poses.length === 17 && !(await etat(page)), "« Valider » : 17 structures posées, parcours fermé",
    poses.length);
  const nb = function (ty) { return poses.filter(function (x) { return x.type === ty; }).length; };
  verifier(nb("pilier-1") === 11 && nb("pilier-2") === 4 && nb("front-1") === 2,
    "types : 11 pilier-1 (A), 4 pilier-2 (B), 2 front-1",
    { p1: nb("pilier-1"), p2: nb("pilier-2"), f1: nb("front-1") });
  const fh = poses.find(function (x) {
    return x.type === "front-1" && x.points.every(function (p) { return Math.abs(p.y - O.y - 400) < 3; });
  });
  const xs = fh ? fh.points.map(function (p) { return p.x - O.x; }) : [];
  verifier(!!fh && Math.abs(Math.min.apply(null, xs) - 20) <= 4 && Math.abs(Math.max.apply(null, xs) - 600) <= 4,
    "front horizontal : un trait d'un tenant, bouts à 4 px près", fh && fh.points);
  verifier(poses.every(function (x) { return /^st_/.test(x.uid || "") && Number.isFinite(x.maj); }),
    "chaque structure a son uid et son updatedAt");
  const g2 = SCENE.gris[2], gx = O.x + g2[0], gy = O.y + g2[1];   // rangée du bas : la bande ne la touche pas
  const gris = poses.find(function (x) {
    const xs = x.points.map(function (p) { return p.x; }), ys = x.points.map(function (p) { return p.y; });
    return Math.abs(Math.min.apply(null, xs) - gx) < 1.5 && Math.abs(Math.min.apply(null, ys) - gy) < 1.5 &&
      Math.abs(Math.max.apply(null, xs) - gx - 40) < 1.5 && Math.abs(Math.max.apply(null, ys) - gy - 40) < 1.5;
  });
  verifier(!!gris && gris.points.length === 4, "contour au pixel près (carré gris de 40 px, 4 sommets)", gris);
  const annule = await page.evaluate(function () { return window.HistoryManager.undo(); });
  await page.waitForTimeout(400);
  s = await nosStructures(page);
  verifier(s.length === avant, "UNE étape ⏪ retire les 17 structures", { annule: annule, n: s.length });

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
  verifier(!!e && e.exemples.a === 1 && e.exemples.b === 1 && e.exemples.f === 1 && !e.pipette,
    "la carte de l'Éditeur de données ouvre le même parcours, couleurs retenues pour le plan", e);
  await detecterCadre(page, O);
  await bouton(page, "valider");
  await page.waitForTimeout(600);
  s = (await nosStructures(page)).slice(avant);
  verifier(s.length === 18 && s.every(function (x) { return x.level === (x.type === "pilier-2" ? -1 : 0); }),
    "multi-niveau : pilier-1 et front-1 au niveau actif (0), pilier-2 au niveau −1 (règle du tracé à la main)",
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
  verifier(e.apercu && e.apercu.n === 0 && e.apercu.deja === 18,
    "relancer sur la même zone : 0 nouveau, 18 déjà présents (piliers et fronts)",
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

  // 🩸 Pipette au PC sur un coin de pilier ou à côté d'un trait de front : la médiane du carré 5 × 5 valait le fond,
  // et la pipette disait « aucune image » alors qu'on touchait bien l'image. Réticule rouge pendant la visée.
  const reticule = function () {
    return page.evaluate(function () {
      return { classe: document.body.classList.contains("kta-detect-pick-mode"),
               curseur: getComputedStyle(window.map.getContainer()).cursor.indexOf("svg") >= 0 };
    });
  };
  // Fiche ou bulle ouverte (popup Leaflet, fenêtre de fiche, fenêtre modale affichée).
  const ficheOuverte = function () {
    return page.evaluate(function () {
      const els = document.querySelectorAll(".leaflet-popup, [aria-modal='true'], .kta-fiche-fenetre");
      return Array.prototype.some.call(els, function (el) { return el.getClientRects().length > 0; });
    });
  };
  await page.evaluate(function (o) {
    // 🩸 les 18 structures posées plus haut RESTENT sur la carte : la pipette touche un pilier déjà validé
    window.map.closePopup();
    // vue remise sur la scène (la rotation éprouvée juste avant a pu la déplacer)
    window.map.fitBounds(L.latLngBounds([window.convertCoord(o.x - 20, o.y - 20),
      window.convertCoord(o.x + 660, o.y + 470)]), { animate: false });
    window.KtaDetectionUI.ouvrir();
  }, O);
  await page.waitForTimeout(300);
  await bouton(page, "effacer");
  verifier(!(await reticule()).classe, "réticule absent tant qu'aucune pipette n'est armée");
  await bouton(page, "pipette-a");
  const visee = await reticule();
  verifier(visee.classe && visee.curseur, "pipette armée : réticule rouge de précision sur la carte", visee);
  const q2 = SCENE.orange[5];
  await toucher(page, O.x + q2[0] + 0.5, O.y + q2[1] + 0.5);       // pixel du coin du pilier
  verifier(!(await ficheOuverte()), "pipette sur un pilier déjà posé : sa fiche ne s'ouvre pas");
  await bouton(page, "pipette-f");
  await toucher(page, O.x + 300, O.y + 403);                        // 1 px sous le bord du front de 4 px
  e = await etat(page);
  verifier(e.exemples.a === 1 && e.exemples.f === 1,
    "pipette sur un coin de pilier (déjà posé) et juste à côté d'un front : un exemple chacun, pas « aucune image »",
    { exemples: e.exemples, toasts: await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll("[class*='toast']"), function (t) {
        return t.textContent;
      }).join(" | ").slice(0, 200);
    }) });
  await toucher(page, O.x + 300, O.y + 300);                        // le fond, loin de tout
  const fond = await page.evaluate(function () {
    const txt = Array.prototype.map.call(document.querySelectorAll("[class*='toast']"), function (t) {
      return t.textContent;
    }).join(" | ");
    return { f: window.KtaDetectionUI.etat().exemples.f, dit: txt.indexOf(window.I18n.t("detect.toast.surFond")) >= 0 };
  });
  verifier(fond.f === 1 && fond.dit, "pipette sur le fond : « c'est le fond », aucun exemple ajouté", fond);
  await bouton(page, "zone");
  verifier((await reticule()).classe, "tracé du cadre : réticule présent");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  verifier(!(await reticule()).classe, "après Échap : réticule retiré");
  const q3 = SCENE.orange[2];
  await toucher(page, O.x + q3[0] + q3[2] / 2, O.y + q3[1] + q3[3] / 2);
  verifier(await ficheOuverte(), "parcours fermé : toucher un pilier posé rouvre sa fiche (retour normal)");
  await page.evaluate(function () {
    window.map.closePopup();
    // structures posées plus haut retirées (une étape ⏪) avant la scène « fond blanc »
    window.HistoryManager.undo();
  });
  await page.waitForTimeout(300);

  // ── Contexte fourni (le Générateur fournira le sien) : le parcours n'écrit que par lui ──
  console.log("— contexte fourni —");
  const regle = await page.evaluate(function () {
    const N = window.ktaNiveauNouvelleStructure;
    return [N("pilier-1", { multiLevel: true, niveau: 2 }), N("pilier-2", { multiLevel: true, niveau: 2 }),
      N("front-2", { multiLevel: true, niveau: 0 }), N("pilier-1", { multiLevel: false, niveau: 2 })];
  });
  verifier(JSON.stringify(regle) === "[2,-1,-1,null]",
    "règle de niveau paramétrée : niveau donné, pilier-2 et front-2 au −1, rien hors multi-niveau", regle);
  const avantCtx = await page.evaluate(function (o) {
    // vue remise sur la scène (la fiche ouverte juste avant a fait glisser la carte : un coin sous le bandeau)
    window.map.fitBounds(L.latLngBounds([window.convertCoord(o.x - 20, o.y - 20),
      window.convertCoord(o.x + 660, o.y + 470)]), { animate: false });
    window.__poses = null;
    const c = window.KtaDetectionUI.contextePlan();
    c.poser = function (poses) { window.__poses = poses; return 0; };
    c.niveau = function (type) { return window.ktaNiveauNouvelleStructure(type, { multiLevel: true, niveau: 3 }); };
    const ouvert = window.KtaDetectionUI.ouvrir(c);
    return { ouvert: ouvert, session: window.getStructures().length,
      pas: window.HistoryManager._peek().undo.length };
  }, O);
  await detecterCadre(page, O);
  const nCtx = (await etat(page)).apercu.n;
  await bouton(page, "valider");
  await page.waitForTimeout(300);
  const apresCtx = await page.evaluate(function () {
    const p = window.__poses || [];
    return { n: p.length, session: window.getStructures().length, ferme: !window.KtaDetectionUI.etat(),
      pas: window.HistoryManager._peek().undo.length,
      niveaux: p.map(function (s) { return s.type + "@" + s.level; }).slice(0, 4),
      uid: p.every(function (s) { return /^st_/.test(s.uid || "") && Number.isFinite(s.updatedAt); }) };
  });
  verifier(avantCtx.ouvert && nCtx > 0 && apresCtx.n === nCtx && apresCtx.uid,
    "contexte fourni : ses " + nCtx + " structures validées lui sont remises (uid, updatedAt)", { avantCtx, apresCtx });
  verifier(apresCtx.session === avantCtx.session && apresCtx.pas === avantCtx.pas && apresCtx.ferme,
    "contexte fourni : rien dans la session, aucune étape ⏪, parcours fermé", { avantCtx, apresCtx });
  verifier(apresCtx.niveaux.every(function (t) { return /^pilier-2@-1$|^front-2@-1$|@3$/.test(t); }),
    "contexte fourni : niveaux par SA règle (niveau 3, 2e masse au −1)", apresCtx.niveaux);

  // ── Fond blanc : piliers blancs cernés d'un trait, fond et galeries de la même couleur ──
  console.log("— fond blanc —");
  await page.evaluate(function () {
    try { localStorage.removeItem("myktamap_detect_couleurs_v1_" + window._currentLoadedPlanId); } catch (err) {}
  });
  const O2 = await preterScene(page, true);
  await page.waitForTimeout(400);
  await page.evaluate(function () { window.KtaDetectionUI.ouvrir(); });
  const qb = SCENE.orange[1], qg = SCENE.gris[3], pbl = SCENE.petitBlanc;
  await toucher(page, O2.x + qb[0] + qb[2] / 2, O2.y + qb[1] + qb[3] / 2);   // un pilier blanc (grand)
  await toucher(page, O2.x + qg[0] + qg[2] / 2, O2.y + qg[1] + qg[3] / 2);   // un autre (40 px)
  // petit pilier (9 px) touché à 1 px de son bord : le trait est dans le carré 5 × 5 du doigt, l'exemple doit rester
  // l'intérieur du pilier (aire ~81, épaisseur ~8), jamais le trait (couleur sombre, épaisseur 1 ou 2)
  await toucher(page, O2.x + pbl[0] + 1, O2.y + pbl[1] + pbl[3] / 2);
  e = await etat(page);
  verifier(e.exemples.a === 3, "fond blanc : la pipette sur un pilier blanc cerné donne un exemple (pas « le fond »)",
    e.exemples);
  const exPetit = await page.evaluate(function () {
    try {
      const a = JSON.parse(localStorage.getItem("myktamap_detect_couleurs_v1_" + window._currentLoadedPlanId)).a;
      return a[a.length - 1];
    } catch (err) { return null; }
  });
  verifier(exPetit && exPetit.aire >= 60 && exPetit.aire <= 100 && exPetit.epaisseur >= 6 &&
    exPetit.epaisseur <= 9 && Math.min.apply(null, exPetit.rgb) > 200,
    "fond blanc : petit pilier touché près du bord → son intérieur (aire " + (exPetit && exPetit.aire) +
    ", épaisseur " + (exPetit && exPetit.epaisseur) + "), pas le trait", exPetit);
  const c2 = SCENE.cadre;
  await bouton(page, "zone");
  await toucher(page, O2.x + c2[0], O2.y + c2[1]);
  await toucher(page, O2.x + c2[2], O2.y + c2[3]);
  await attendre(page, function () {
    const s2 = window.KtaDetectionUI.etat();
    return s2 && s2.etape === "apercu";
  }, 60000);
  e = await etat(page);
  // le fond (qui déborde du cadre, sa boîte commence dans la marge) n'appartient à aucun bloc : jamais posé
  const plusGrand = await page.evaluate(function () {
    return window.KtaDetectionUI.etat().curseurs.tailleMax;
  });
  verifier(e.apercu && e.apercu.n === 17,
    "fond blanc : les 17 piliers (dont le petit), sans la masse du fond ni des galeries", e.apercu);
  const affB = await valeurCurseur(page);
  verifier(e.tolerances && affB === e.tolerances.a && e.tolerances.a >= 15,
    "fond blanc : le curseur de tolérance affiche la valeur appliquée aux masses (" + affB + " = " +
    (e.tolerances && e.tolerances.a) + "), assez haute pour garder les galeries d'un seul tenant", e.tolerances);
  verifier(plusGrand > 0 && plusGrand < 256, "fond blanc : taille maximale déduite des exemples (" + plusGrand + " px)",
    plusGrand);
  await page.keyboard.press("Escape");

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
  console.log("🎉 CHECKUP VERT — détecter piliers et fronts : pipette, cadre, aperçu, Valider, ⏪, doublons, " +
    "deux entrées.");
  process.exit(0);
})();
