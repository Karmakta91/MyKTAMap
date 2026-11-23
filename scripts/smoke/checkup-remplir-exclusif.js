#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-remplir-exclusif.js — checkup (Playwright, pas un hook pré-commit) : un seul mode de clic à la fois entre
// la fenêtre Détecter (pipette, cadre, « Remplir au clic » : js/detectionStructures.js) et les outils de la carte
// =====================================================================
// Relevé fictif seulement : même planche fabriquée que checkup-remplir-annuler.js (quatre piliers, quatre galeries).
// Sous chaque moteur de KTA_MOTEURS, pour la fenêtre des structures puis celle des galeries :
//   1. Remplir, un remplissage ; un outil de dessin armé (front, ou tracé pour les galeries) met la visée en pause :
//      plus de body.kta-detect-pick-mode, fenêtre ouverte, remplissage gardé ; deux clics DANS deux formes posent deux
//      sommets de l'outil et ne remplissent rien ;
//   2. « Remplir au clic » (bouton de reprise du bandeau) désarme l'outil et rend la visée ; le clic suivant remplit ;
//   3. tracé, zone, mesure et ajout de point mettent aussi Remplir en pause, et la reprise les désarme ;
//   4. cadre (deux coins) : même pause, bouton « Reprendre le cadre » ;
//   5. sens inverse : outil armé, puis « Remplir au clic » → l'outil tombe ;
//   6. outil armé, puis la pipette → l'outil tombe ; pipette armée, puis un outil → pipette lâchée.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8210 node scripts/smoke/checkup-remplir-exclusif.js
// Doc : docs/architecture/plans-loader.md (Détecter les structures, Un seul mode de clic)
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
function texte(page, cle) { return page.evaluate(function (k) { return window.I18n.t(k); }, cle); }
function nombre(e, galeries) {
  if (!e) return -1;
  // galeries : remplissages (un remplissage peut donner plusieurs tracés en aperçu)
  return galeries ? (e.galeries ? e.galeries.remplis : -1) : (e.remplir ? e.remplir.n : -1);
}
// Outils armés par leur panneau (groupe de la barre de droite, libellé) ; « point » = crayon de l'édition (solo).
const OUTILS = {
  front: { groupe: "structures", cle: "ui.struct.front1" },
  trace: { groupe: "traces", cle: "ui.trace.principal" },
  zone: { groupe: "zones", cle: "ui.zone.eau" },
  mesure: { groupe: "mesure", cle: "ui.subaction.mesureDistance" },
  point: { solo: "edition" }
};
function armer(page, nom) {
  return page.evaluate(function (o) {
    if (o.solo) {
      if (!window.modeEdition) window._groupes[o.solo].btnPrincipal.click();
      return window.modeEdition ? "ok" : "point non armé";
    }
    window.ktaOuvrirOutils(o.groupe);
    const fly = document.querySelector(".kta-group-flyout");
    const lib = window.I18n.t(o.cle);
    const btn = fly && Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (b) {
      return b.textContent.indexOf(lib) >= 0;
    })[0];
    if (!btn) { if (window.ktaFermerOutils) window.ktaFermerOutils(); return "bouton absent : " + lib; }
    btn.click();
    if (window.ktaOutilsOuverts && window.ktaOutilsOuverts()) window.ktaFermerOutils();
    return "ok";
  }, OUTILS[nom]);
}
function modes(page) {
  return page.evaluate(function () {
    return { road: window.modeRoad || null, zone: window.modeZone || null, structure: window.modeStructure || null,
      mesure: !!window.modeMesure, edition: !!window.modeEdition,
      vise: document.body.classList.contains("kta-detect-pick-mode") };
  });
}
function outilArme(m) { return !!(m.road || m.zone || m.structure || m.mesure || m.edition); }
async function cliquerBandeau(page, act) {
  const fait = await page.evaluate(function (a) {
    const b = document.querySelector('#kta-detect-bandeau [data-detect="' + a + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, act);
  await page.waitForTimeout(150);
  return fait;
}
function sommetsEnCours(page) {
  return page.evaluate(function () {
    const o = window.modeStructure ? window.getCurrentStructure() : window.modeRoad ? window.getCurrentRoad() : null;
    return o && Array.isArray(o.points) ? o.points.length : 0;
  });
}
function texteReprendre(page) {
  return page.evaluate(function () {
    const b = document.querySelector('#kta-detect-bandeau [data-detect="reprendre"]');
    return b ? { svg: !!b.querySelector("svg"), texte: b.textContent.trim() } : null;
  });
}
async function ouvrir(page, galeries) {
  await page.evaluate(function (g) {
    const ui = window.KtaDetectionUI;
    if (ui.etat()) ui.fermer();
    if (g) ui.ouvrir(ui.contextePlan(), { cible: "traces" }); else ui.ouvrir();
  }, galeries);
  await page.waitForTimeout(200);
}
function court(e, galeries) { return e && { etape: e.etape, pause: e.pause, pipette: e.pipette, n: nombre(e, galeries) }; }

async function parcours(page, O, galeries) {
  const nom = galeries ? "galeries" : "structures";
  const formes = galeries ? PLANCHE.galeries : PLANCHE.piliers;
  const milieu = function (i) { const q = formes[i]; return { x: O.x + q[0] + q[2] / 2, y: O.y + q[1] + q[3] / 2 }; };
  const outil = galeries ? "trace" : "front";

  // ── 1. Remplir, un remplissage, puis un outil de dessin ──
  await ouvrir(page, galeries);
  verifier(await cliquerBandeau(page, "remplir"), nom + " : fenêtre Détecter → Remplir au clic");
  if (!galeries) await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "mur");
  const m0 = milieu(0);
  await toucher(page, m0.x, m0.y);
  verifier(nombre(await etat(page), galeries) === 1, nom + " : un remplissage en aperçu",
    nombre(await etat(page), galeries));
  let r = await armer(page, outil);
  let m = await modes(page), e = await etat(page);
  verifier(r === "ok" && (galeries ? m.road === "principal" : m.structure === "front-1"),
    nom + " : outil « " + outil + " » armé pendant Remplir", { r: r, m: m });
  verifier(!m.vise, nom + " : outil armé → body.kta-detect-pick-mode retiré", m);
  verifier(!!e && e.etape === "remplir" && e.pause === true && nombre(e, galeries) === 1,
    nom + " : fenêtre ouverte, Remplir en pause, remplissage gardé", court(e, galeries));
  const bouton = await texteReprendre(page);
  verifier(!!bouton && bouton.svg && bouton.texte === await texte(page, "detect.remplir.bouton"),
    nom + " : bouton « Remplir au clic » (icône SVG) pour reprendre", bouton);
  // deux formes différentes : retoucher la même retirerait le remplissage (aucun écart visible)
  const m1 = milieu(1), m3 = milieu(3);
  await toucher(page, m1.x, m1.y);
  await toucher(page, m3.x, m3.y);
  e = await etat(page);
  const sommets = await sommetsEnCours(page);
  verifier(nombre(e, galeries) === 1 && sommets === 2,
    nom + " : deux clics dans deux formes = deux sommets de l'outil, aucun remplissage",
    { n: nombre(e, galeries), sommets: sommets });

  // ── 2. Reprendre : l'outil tombe, la visée revient ──
  verifier(await cliquerBandeau(page, "reprendre"), nom + " : clic sur « Reprendre »");
  m = await modes(page); e = await etat(page);
  verifier(!outilArme(m) && m.vise && !!e && e.pause === false && nombre(e, galeries) === 1,
    nom + " : Reprendre désarme l'outil, visée rendue, remplissage gardé", { m: m, e: court(e, galeries) });
  const m2 = milieu(2);
  await toucher(page, m2.x, m2.y);
  verifier(nombre(await etat(page), galeries) === 2, nom + " : le clic suivant remplit (2 en aperçu)",
    nombre(await etat(page), galeries));

  // ── 3. Les autres outils de la carte ──
  for (const o of ["trace", "zone", "mesure", "point"]) {
    r = await armer(page, o);
    m = await modes(page); e = await etat(page);
    verifier(r === "ok" && outilArme(m) && !m.vise && !!e && e.pause === true && nombre(e, galeries) === 2,
      nom + " : outil « " + o + " » → Remplir en pause, remplissages gardés", { r: r, m: m, e: court(e, galeries) });
    await cliquerBandeau(page, "reprendre");
    m = await modes(page);
    verifier(!outilArme(m) && m.vise, nom + " : « Reprendre » désarme « " + o + " »", m);
  }

  // ── 4. Cadre : même pause, même reprise (exemples retenus par les remplissages ? sinon un exemple posé) ──
  await cliquerBandeau(page, "exemples");
  await page.evaluate(function (g) {
    const ui = window.KtaDetectionUI, e = ui.etat();
    const c = g ? ["g"] : ["a"];
    if (c.some(function (k) { return e.exemples[k] > 0; })) return;
    const b = document.querySelector('#kta-detect-bandeau [data-detect="pipette-' + c[0] + '"]');
    if (b && !e.pipette) b.click();
  }, galeries);
  if ((await etat(page)).pipette) {
    const p = milieu(3);
    await toucher(page, p.x, p.y);
    await page.waitForTimeout(400);
  }
  if (await cliquerBandeau(page, "zone") && (await etat(page)).etape === "zone") {
    await armer(page, outil);
    m = await modes(page); e = await etat(page);
    const cadre = await texteReprendre(page);
    verifier(outilArme(m) && !m.vise && e.pause === true && !!cadre &&
      cadre.texte === await texte(page, "detect.pause.cadre"),
      nom + " : cadre → outil armé, visée en pause, bouton « Reprendre le cadre »", { m: m, e: court(e, galeries) });
    await cliquerBandeau(page, "reprendre");
    m = await modes(page);
    verifier(!outilArme(m) && m.vise && (await etat(page)).etape === "zone", nom + " : cadre repris, outil désarmé", m);
  } else {
    pb(nom + " : étape du cadre inaccessible (aucun exemple de couleur)");
  }

  // ── 5. Sens inverse : outil armé, puis Remplir ──
  await cliquerBandeau(page, "exemples");
  await page.evaluate(function () {   // pipette lâchée : en exemples sans pipette, rien ne vise
    const e = window.KtaDetectionUI.etat();
    if (e.pipette) document.querySelector('#kta-detect-bandeau [data-detect="pipette-' + e.pipette + '"]').click();
  });
  await armer(page, outil);
  m = await modes(page);
  verifier(outilArme(m) && !m.vise, nom + " : en exemples sans pipette, l'outil s'arme seul", m);
  await cliquerBandeau(page, "remplir");
  m = await modes(page); e = await etat(page);
  verifier(!outilArme(m) && m.vise && e.etape === "remplir" && !e.pause,
    nom + " : « Remplir au clic » désarme l'outil en cours", { m: m, e: court(e, galeries) });

  // ── 6. Pipette ──
  await cliquerBandeau(page, "exemples");
  const pip = galeries ? "pipette-g" : "pipette-a";
  await armer(page, outil);
  await cliquerBandeau(page, pip);
  m = await modes(page); e = await etat(page);
  verifier(!outilArme(m) && m.vise && !!e.pipette, nom + " : la pipette désarme l'outil en cours",
    { m: m, e: court(e, galeries) });
  await armer(page, outil);
  m = await modes(page); e = await etat(page);
  verifier(outilArme(m) && !m.vise && !e.pipette && !e.pause, nom + " : un outil armé lâche la pipette",
    { m: m, e: court(e, galeries) });
  await page.evaluate(function () {
    if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
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
  console.log("🎉 CHECKUP VERT — un seul mode de clic : un outil armé met la visée de Détecter en pause, " +
    "viser de nouveau désarme l'outil.");
  process.exit(0);
})();
