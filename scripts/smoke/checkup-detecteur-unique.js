#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-detecteur-unique.js — checkup (Playwright, pas un hook pré-commit) : un seul détecteur ouvert à la fois
// (js/detectionStructures.js > ouvrir) entre « Détecter » (structures) et « Détecter les galeries »
// =====================================================================
// Relevé fictif seulement : même planche fabriquée que checkup-remplir-annuler.js. Sous chaque moteur de KTA_MOTEURS :
//   1. Structures : un remplissage validé, puis un autre en aperçu ; le bouton « Détecter les galeries » de l'outil
//      Tracés ouvre les galeries et FERME les structures (un seul bandeau, aperçu des structures retiré, le validé
//      reste, rien de plus écrit) ; un clic dans un pilier ne remplit plus rien ;
//   2. l'inverse : galeries en Remplir avec un remplissage en aperçu, puis le bouton « Détecter » de l'outil
//      Structures → galeries fermées, aucun tracé écrit, un clic dans une galerie ne remplit plus rien ;
//   3. même détecteur rouvert : la fenêtre ouverte reste (son aperçu aussi) ;
//   4. Générateur (sa propre fenêtre, image fabriquée) : structures puis galeries → la première fenêtre fermée.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8213 node scripts/smoke/checkup-detecteur-unique.js
// Doc : docs/architecture/plans-loader.md (Détecter les structures, Un seul détecteur ouvert)
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

// Planche en pixels du plan, relative au coin O. Piliers : intérieur [x, y, w, h] blanc, trait noir de 4 px autour.
// Galeries : intérieur blanc [x, y, w, h], trait noir de 3 px autour (fermées aux deux bouts), axe y + h / 2.
const PLANCHE = {
  piliers: [[20, 20, 50, 50], [110, 20, 50, 50], [200, 20, 50, 50], [290, 20, 50, 50]],
  galeries: [[23, 123, 294, 24], [23, 168, 294, 24], [23, 213, 294, 24], [23, 258, 294, 24]],
  taille: [380, 320]
};

async function preterPlanche(page) {
  return page.evaluate(async function (S) {
    const pc = window.PLAN_CONFIG, p = pc.plan, C = window.APP_CONFIG;
    const W = p.imageWidth || C.imageWidth, H = p.imageHeight || C.imageHeight;
    p.imageWidth = W; p.imageHeight = H;
    p.tiledV2 = true;
    pc.tiling = { minNativeZoom: -3, maxNativeZoom: 0, tileSize: 256, format: "png" };
    const routes = (window.getRoads() || []).concat(window.getAllEmbeddedRoads ? window.getAllEmbeddedRoads() : []);
    const occupes = (window.getStructures() || []).concat(window._ktaDataStructurePolygons || [], routes)
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
    if (!O) return null;
    const cerne = function (k, q, ep) {
      k.fillStyle = "#141414";
      k.fillRect(O.x + q[0] - ep, O.y + q[1] - ep, q[2] + 2 * ep, q[3] + 2 * ep);
      k.fillStyle = "#ffffff";
      k.fillRect(O.x + q[0], O.y + q[1], q[2], q[3]);
    };
    const dessiner = function (k) {
      S.piliers.forEach(function (q) { cerne(k, q, 4); });
      S.galeries.forEach(function (q) { cerne(k, q, 3); });
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
    window.map.fitBounds(L.latLngBounds([window.convertCoord(O.x - 20, O.y - 20),
      window.convertCoord(O.x + S.taille[0] + 20, O.y + S.taille[1] + 20)]),
      { animate: false, paddingBottomRight: [0, 280] });   // le bandeau du bas ne couvre aucune forme
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
    return !e || !((e.remplir && e.remplir.enCours) || (e.galeries && e.galeries.enCours));
  }, 60000);
  await page.waitForTimeout(150);
}
function etat(page) { return page.evaluate(function () { return window.KtaDetectionUI.etat(); }); }
function nombre(e, galeries) {
  if (!e) return -1;
  return galeries ? (e.galeries ? e.galeries.remplis : -1) : (e.remplir ? e.remplir.n : -1);
}
// Bouton d'un panneau d'outils (groupe de la barre de droite) dont le libellé contient le texte de `cle`.
function boutonOutil(page, groupe, cle) {
  return page.evaluate(function (a) {
    window.ktaOuvrirOutils(a.groupe);
    const fly = document.querySelector(".kta-group-flyout");
    const lib = window.I18n.t(a.cle);
    const btn = fly && Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (b) {
      return b.textContent.indexOf(lib) >= 0;
    })[0];
    if (!btn) { if (window.ktaFermerOutils) window.ktaFermerOutils(); return "bouton absent : " + lib; }
    btn.click();
    if (window.ktaOutilsOuverts && window.ktaOutilsOuverts()) window.ktaFermerOutils();
    return "ok";
  }, { groupe: groupe, cle: cle });
}
function compte(page) {
  return page.evaluate(function () {
    return { structures: window.getStructures().length, traces: window.getRoads().length,
      bandeaux: document.querySelectorAll("#kta-detect-bandeau").length,
      remplis: document.querySelectorAll(".leaflet-ktaDetection-pane path.kta-detect-rempli").length,
      galeries: document.querySelectorAll(".leaflet-ktaDetection-pane path.kta-detect-galerie").length };
  });
}
async function cliquerBandeau(page, act) {
  const fait = await page.evaluate(function (a) {
    const b = document.querySelector('#kta-detect-bandeau [data-detect="' + a + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, act);
  await page.waitForTimeout(200);
  return fait;
}

async function parcours(page, O) {
  const milieu = function (formes, i) {
    const q = formes[i];
    return { x: O.x + q[0] + q[2] / 2, y: O.y + q[1] + q[3] / 2 };
  };
  const pilier = function (i) { return milieu(PLANCHE.piliers, i); };
  const galerie = function (i) { return milieu(PLANCHE.galeries, i); };
  const BTN_S = ["structures", "detect.bouton"], BTN_G = ["traces", "detect.galeries.bouton"];

  // ── 1. Structures (un validé, un en aperçu) → galeries ──
  let r = await boutonOutil(page, BTN_S[0], BTN_S[1]);
  let e = await etat(page);
  verifier(r === "ok" && !!e && e.cible === "structures", "bouton « Détecter » de Structures → fenêtre des structures",
    { r: r, cible: e && e.cible });
  await cliquerBandeau(page, "remplir");
  await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "mur");
  let p = pilier(0);
  await toucher(page, p.x, p.y);
  await cliquerBandeau(page, "valider-remplir");
  await page.waitForTimeout(400);
  const c0 = await compte(page);
  await boutonOutil(page, BTN_S[0], BTN_S[1]);
  await cliquerBandeau(page, "remplir");
  p = pilier(1);
  await toucher(page, p.x, p.y);
  e = await etat(page);
  verifier(nombre(e, false) === 1, "structures : un remplissage en aperçu", nombre(e, false));
  r = await boutonOutil(page, BTN_G[0], BTN_G[1]);
  await page.waitForTimeout(200);
  e = await etat(page);
  let c = await compte(page);
  verifier(r === "ok" && !!e && e.cible === "traces" && c.bandeaux === 1,
    "« Détecter les galeries » ouvert depuis Tracés : les structures fermées, un seul bandeau",
    { r: r, cible: e && e.cible, bandeaux: c.bandeaux });
  verifier(c.remplis === 0 && c.structures === c0.structures,
    "aperçu des structures retiré, rien écrit, le remplissage validé reste", { c0: c0, c: c });
  // galeries en exemples, pipette lâchée : plus rien ne vise ; un clic dans un pilier ne remplit rien
  await page.evaluate(function () {
    const e = window.KtaDetectionUI.etat();
    if (e.pipette) document.querySelector('#kta-detect-bandeau [data-detect="pipette-' + e.pipette + '"]').click();
  });
  p = pilier(2);
  await toucher(page, p.x, p.y);
  c = await compte(page); e = await etat(page);
  verifier(c.remplis === 0 && c.structures === c0.structures && e.cible === "traces" && !e.remplir,
    "structures fermées : un clic dans un pilier ne remplit plus rien", { c: c, cible: e.cible });

  // ── 2. Galeries (un en aperçu) → structures ──
  await cliquerBandeau(page, "remplir");
  const g = galerie(0);
  await toucher(page, g.x, g.y);
  e = await etat(page);
  verifier(nombre(e, true) === 1, "galeries : un remplissage en aperçu", nombre(e, true));
  const t0 = (await compte(page)).traces;
  r = await boutonOutil(page, BTN_S[0], BTN_S[1]);
  await page.waitForTimeout(200);
  e = await etat(page); c = await compte(page);
  verifier(r === "ok" && !!e && e.cible === "structures" && c.bandeaux === 1 && c.galeries === 0 && c.traces === t0,
    "« Détecter » ouvert depuis Structures : les galeries fermées, aperçu retiré, aucun tracé écrit",
    { r: r, cible: e && e.cible, c: c });
  await cliquerBandeau(page, "remplir");
  const g1 = galerie(1);
  await toucher(page, g1.x, g1.y);
  c = await compte(page); e = await etat(page);
  verifier(c.galeries === 0 && c.traces === t0 && e.cible === "structures" && !e.galeries,
    "galeries fermées : un clic dans une galerie ne la remplit plus", { c: c, cible: e.cible });

  // ── 3. Même détecteur rouvert : il reste, son aperçu aussi ──
  p = pilier(3);
  await toucher(page, p.x, p.y);
  const n = nombre(await etat(page), false);
  await boutonOutil(page, BTN_S[0], BTN_S[1]);
  e = await etat(page);
  verifier(n >= 1 && !!e && e.etape === "remplir" && nombre(e, false) === n,
    "« Détecter » rouvert : la même fenêtre reste, aperçu gardé", { avant: n, apres: nombre(e, false) });
  await page.evaluate(function () { if (window.KtaDetectionUI.etat()) window.KtaDetectionUI.fermer(); });

  // ── 4. Générateur : structures puis galeries ──
  const gen = await page.evaluate(async function () {
    const cv = document.createElement("canvas"); cv.width = 400; cv.height = 300;
    const k = cv.getContext("2d"); k.fillStyle = "#ffffff"; k.fillRect(0, 0, 400, 300);
    k.fillStyle = "#141414"; k.fillRect(40, 40, 60, 60); k.fillStyle = "#ffffff"; k.fillRect(44, 44, 52, 52);
    const blob = await new Promise(function (res) { cv.toBlob(res, "image/png"); });
    const G = window.KtaDetectionGenerateur;
    const fin = { s: null, g: null };
    const opts = function (cible) {
      return { image: blob, cle: "checkup-unique", existantes: function () { return []; },
        poser: function () {}, cible: cible, existantesTraces: function () { return []; }, poserTraces: function () {} };
    };
    const pS = G.ouvrir(opts(undefined)).then(function (v) { fin.s = v; });
    for (let i = 0; i < 50 && !document.querySelector(".kta-detect-gen"); i++) {
      await new Promise(function (r) { setTimeout(r, 100); });
    }
    const avant = { fen: document.querySelectorAll(".kta-detect-gen").length,
      cible: window.KtaDetectionUI.etat() && window.KtaDetectionUI.etat().cible };
    const pG = G.ouvrir(opts("traces")).then(function (v) { fin.g = v; });
    for (let i = 0; i < 50 && fin.s === null; i++) await new Promise(function (r) { setTimeout(r, 100); });
    await new Promise(function (r) { setTimeout(r, 300); });
    const apres = { fen: document.querySelectorAll(".kta-detect-gen").length,
      bandeaux: document.querySelectorAll("#kta-detect-bandeau").length,
      cible: window.KtaDetectionUI.etat() && window.KtaDetectionUI.etat().cible, premiereRendue: fin.s };
    window.KtaDetectionUI.fermer();
    await Promise.race([Promise.all([pS, pG]), new Promise(function (r) { setTimeout(r, 2000); })]);
    return { avant: avant, apres: apres, restantes: document.querySelectorAll(".kta-detect-gen").length };
  });
  verifier(gen.avant.fen === 1 && gen.avant.cible === "structures", "Générateur : fenêtre des structures ouverte",
    gen.avant);
  verifier(gen.apres.fen === 1 && gen.apres.bandeaux === 1 && gen.apres.cible === "traces" &&
    gen.apres.premiereRendue === true && gen.restantes === 0,
    "Générateur : galeries ouvertes, la fenêtre des structures fermée (une seule fenêtre, un seul bandeau)", gen);
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
    pb("aucune zone libre de structures et de tracés dans le relevé fictif pour poser la planche");
    await ctx.close();
    return;
  }
  await page.waitForTimeout(800);
  try { await parcours(page, O); }
  catch (err) { pb("exception du harnais : " + (err && err.message)); }
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
  console.log("🎉 CHECKUP VERT — un seul détecteur ouvert : ouvrir l'un ferme l'autre, " +
    "aperçu jeté comme à la fermeture, validé gardé.");
  process.exit(0);
})();
