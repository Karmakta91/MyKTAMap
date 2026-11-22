#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-remplir-annuler.js — checkup (Playwright, pas un hook pré-commit) : retirer UN remplissage dans « Remplir
// au clic » (js/detectionStructures.js), fenêtre des structures puis fenêtre des galeries
// =====================================================================
// Relevé fictif seulement. Le checkup FABRIQUE une planche (quatre piliers blancs cernés de noir, quatre galeries
// blanches fermées entre deux traits noirs) et la prête au plan en tuiles V2 (Blob dans RUNTIME_ASSETS), puis, sous
// chaque moteur de KTA_MOTEURS (Chromium et WebKit par défaut), pour les structures puis pour les galeries :
//   1. un remplissage validé (UNE étape ⏪ dans l'historique global) ;
//   2. fenêtre rouverte en Remplir : ligne d'aide, bouton « Retirer le dernier » (icône SVG) désactivé à vide ;
//      Ctrl+Z ne défait PAS le Valider précédent (HistoryManager intact) ; le bouton retire le dernier remplissage ;
//   3. trois remplissages ; un toucher sur le 2e le retire (il quitte l'aperçu, aucun remplissage relancé) ;
//      Ctrl+Z retire le 3e ; « Valider » n'écrit que le 1er ;
//   4. fenêtre fermée : Ctrl+Z revient à l'historique global (il retire le dernier Valider).
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8200 node scripts/smoke/checkup-remplir-annuler.js
// Doc : docs/architecture/plans-loader.md (Détecter les structures, Remplir au clic)
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
function texte(page, cle) { return page.evaluate(function (k) { return window.I18n.t(k); }, cle); }
function objets(page, galeries) {
  return page.evaluate(function (g) {
    return (g ? window.getRoads() : window.getStructures()).map(function (s) { return { uid: s.uid, points: s.points }; });
  }, galeries);
}
function historique(page) {
  return page.evaluate(function () { return window.HistoryManager._peek().undo.length; });
}
// Bouton « Retirer le dernier » : null si absent, sinon { svg, actif }.
function boutonRetirer(page) {
  return page.evaluate(function () {
    const b = document.querySelector('#kta-detect-bandeau [data-detect="retirer-dernier"]');
    return b ? { svg: !!b.querySelector("svg"), actif: !b.disabled } : null;
  });
}
function nombre(e, galeries) {
  if (!e) return -1;
  return galeries ? (e.galeries ? e.galeries.n : -1) : (e.remplir ? e.remplir.n : -1);
}
function centre(pts) {
  const xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
  return { x: (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2,
           y: (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 };
}
async function ouvrirRemplir(page, galeries) {
  const r = await page.evaluate(function (g) {
    const ui = window.KtaDetectionUI;
    if (g) ui.ouvrir(ui.contextePlan(), { cible: "traces" }); else ui.ouvrir();
    const b = document.querySelector('#kta-detect-bandeau [data-detect="remplir"]');
    if (!b) return "bouton Remplir au clic absent";
    b.click();
    return "ok";
  }, galeries);
  await page.waitForTimeout(200);
  if (!galeries && r === "ok") await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "mur");
  // focus hors du bandeau : Ctrl+Z part du document, comme sur la carte
  await page.evaluate(function () { if (document.activeElement) document.activeElement.blur(); });
  return r;
}

async function parcours(page, O, galeries) {
  const nom = galeries ? "galeries" : "structures";
  const formes = galeries ? PLANCHE.galeries : PLANCHE.piliers;
  const milieu = function (i) { const q = formes[i]; return { x: O.x + q[0] + q[2] / 2, y: O.y + q[1] + q[3] / 2 }; };
  const remplir = async function (i) { const m = milieu(i); await toucher(page, m.x, m.y); };
  const avant = await objets(page, galeries);
  const h0 = await historique(page);

  // ── 1. Un remplissage validé ──
  let r = await ouvrirRemplir(page, galeries);
  verifier(r === "ok", nom + " : fenêtre Détecter → Remplir au clic", r);
  if (r !== "ok") return;
  await remplir(3);
  await page.click('#kta-detect-bandeau [data-detect="' + (galeries ? "valider-galeries" : "valider-remplir") + '"]');
  await page.waitForTimeout(600);
  const valides = (await objets(page, galeries)).length;
  verifier(valides === avant.length + 1 && (await historique(page)) === h0 + 1 && !(await etat(page)),
    nom + " : un remplissage validé, UNE étape dans l'historique", { n: valides - avant.length });

  // ── 2. Fenêtre rouverte : aide, bouton, Ctrl+Z sans toucher à l'historique global ──
  r = await ouvrirRemplir(page, galeries);
  const aide = await page.evaluate(function () {
    const el = document.querySelector("#kta-detect-bandeau .kta-detect-aide-retirer");
    return el ? el.textContent : "";
  });
  const aideAttendue = await texte(page, galeries ? "detect.galeries.remplir.retirer" : "detect.remplir.retirer");
  verifier(aide && aide.indexOf(aideAttendue) === 0, nom + " : ligne d'aide « " + aideAttendue + " … »", aide);
  let bt = await boutonRetirer(page);
  verifier(bt && bt.svg && !bt.actif, nom + " : bouton « Retirer le dernier » (icône SVG), désactivé à vide", bt);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  verifier((await objets(page, galeries)).length === valides && (await historique(page)) === h0 + 1,
    nom + " : Ctrl+Z dans la fenêtre ne défait pas le Valider précédent", {
      objets: (await objets(page, galeries)).length - avant.length, hist: (await historique(page)) - h0 });
  verifier(!!(await etat(page)), nom + " : Ctrl+Z ne ferme pas la fenêtre");
  await remplir(0);
  bt = await boutonRetirer(page);
  verifier(nombre(await etat(page), galeries) === 1 && bt && bt.actif, nom + " : un remplissage, bouton actif", bt);
  if (bt) await page.click('#kta-detect-bandeau [data-detect="retirer-dernier"]');
  await page.waitForTimeout(200);
  bt = await boutonRetirer(page);
  verifier(nombre(await etat(page), galeries) === 0 && bt && !bt.actif,
    nom + " : le bouton retire le dernier remplissage, puis se désactive", { n: nombre(await etat(page), galeries) });

  // ── 3. Trois remplissages, le 2e retiré au toucher, Ctrl+Z retire le 3e ──
  for (let i = 0; i < 3; i++) await remplir(i);
  let e = await etat(page);
  verifier(nombre(e, galeries) === 3, nom + " : 3 remplissages en aperçu", nombre(e, galeries));
  await viderToasts(page);
  await remplir(1);
  e = await etat(page);
  const msgDeja = await texte(page, "detect.remplir.dejaListe");
  const ts = await toasts(page);
  const dom = await page.evaluate(function (g) {
    return document.querySelectorAll(".leaflet-ktaDetection-pane path." +
      (g ? "kta-detect-galerie" : "kta-detect-rempli")).length;
  }, galeries);
  verifier(nombre(e, galeries) === 2 && ts.indexOf(msgDeja) < 0 && dom === 2,
    nom + " : toucher la 2e forme la retire (aperçu : 2 formes, aucun remplissage relancé)",
    { n: nombre(e, galeries), dom: dom, toast: ts.indexOf(msgDeja) >= 0 });
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  e = await etat(page);
  verifier(nombre(e, galeries) === 1 && (await historique(page)) === h0 + 1,
    nom + " : Ctrl+Z retire le 3e (pile), historique global intact", { n: nombre(e, galeries) });
  await page.click('#kta-detect-bandeau [data-detect="' + (galeries ? "valider-galeries" : "valider-remplir") + '"]');
  await page.waitForTimeout(600);
  const apres = await objets(page, galeries), neufs = apres.slice(valides);
  const m0 = milieu(0);
  verifier(neufs.length === 1 && Math.abs(centre(neufs[0].points).y - m0.y) <= 3 &&
    Math.abs(centre(neufs[0].points).x - m0.x) <= (galeries ? 40 : 3),
    nom + " : « Valider » n'écrit que le 1er remplissage", neufs.map(function (s) { return centre(s.points); }));

  // ── 4. Fenêtre fermée : Ctrl+Z revient à l'historique global ──
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  verifier((await objets(page, galeries)).length === valides,
    nom + " : fenêtre fermée, Ctrl+Z défait le dernier Valider (historique global)",
    (await objets(page, galeries)).length - valides);
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
  for (const g of [false, true]) {
    try { await parcours(page, O, g); }
    catch (err) { pb((g ? "galeries" : "structures") + " : exception du harnais : " + (err && err.message)); }
    await page.evaluate(function () { if (window.KtaDetectionUI.etat()) window.KtaDetectionUI.fermer(); });
  }
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
  console.log("🎉 CHECKUP VERT — remplir : retirer au toucher, Ctrl+Z et « Retirer le dernier » en pile, " +
    "historique global intact.");
  process.exit(0);
})();
