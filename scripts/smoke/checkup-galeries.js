#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-galeries.js — checkup (Playwright, pas un hook pré-commit) : fenêtre « Détecter les galeries »
// (js/detectionStructures.js, cible "traces" ; moteur js/ktaDetection.js > reseauGaleries, remplirGalerie)
// =====================================================================
// Relevé fictif seulement. La planche FABRIQUÉE de scripts/smoke/scene-galeries.js (galeries grises entre murs noirs,
// galeries blanches entre deux traits, texte et traits de rappel en travers, pilier posé, tracé existant à compléter)
// est prêtée au plan en tuiles V2 (Blob dans RUNTIME_ASSETS), là où le relevé n'a ni structure ni tracé. Sous chaque
// moteur de KTA_MOTEURS (Chromium et WebKit par défaut) :
//   1. outil Structures → Détecter : aucune galerie proposée ;
//   2. outil Tracés → « Détecter les galeries » : fenêtre à elle (titre, galerie seule, Remplir, aucun pilier/front) ;
//   3. pipette sur une galerie grise, cadre → aperçu : réseau connexe avec l'existant, zéro étoile, zéro doublon,
//      pilier contourné, bouts EXACTEMENT sur le sommet existant du carrefour, rien d'écrit avant « Valider » ;
//   4. réglage « Branche minimale » au maximum → moins de tracés, sans relire l'image ; type « secondaire » ;
//   5. « Valider » → tracés de session (type, uid, niveau), existant intact ; UNE étape ⏪ les retire tous ;
//   6. 📊 Éditeur de données → carte « Détecter les galeries » → Remplir au clic dans la galerie blanche : 2 tracés
//      en T, le trait de rappel franchi, rien hors des murs ; la galerie remplie, touchée, quitte l'aperçu puis
//      revient au toucher suivant ; toucher sur le fond ouvert → refus affiché.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8190 node scripts/smoke/checkup-galeries.js
// Doc : docs/architecture/plans-loader.md (Détecter les structures, galeries)
// =====================================================================
"use strict";

const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");
const sceneGaleries = require("./scene-galeries.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const PLAN = "Relevé fictif de test";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const SC = sceneGaleries();

const problemes = [];
let moteurCourant = "";
function pb(msg) { problemes.push("[" + moteurCourant + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) {
  if (cond) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
}

// Planche posée en O (coin libre de structures et de tracés), tuiles V2 prêtées, tracé existant et pilier posés en
// session, au niveau actif. → O, ou null.
async function preterPlanche(page) {
  // servi par le serveur du checkup (la CSP refuse un script en ligne)
  await page.addScriptTag({ url: BASE + "/scripts/smoke/scene-galeries.js" });
  return page.evaluate(async function () {
    const sc = window.sceneGaleries(), pc = window.PLAN_CONFIG, p = pc.plan, C = window.APP_CONFIG;
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
          return pt.x > o.x - 60 && pt.x < o.x + sc.W + 60 && pt.y > o.y - 60 && pt.y < o.y + sc.H + 60;
        });
      });
    };
    let O = null;
    for (let y = 80; y + sc.H + 80 < H && !O; y += 40) {
      for (let x = 80; x + sc.W + 80 < W && !O; x += 40) if (libre({ x: x, y: y })) O = { x: x, y: y };
    }
    if (!O) return null;
    const src = document.createElement("canvas");
    src.width = sc.W; src.height = sc.H;
    src.getContext("2d").putImageData(new ImageData(sc.data, sc.W, sc.H), 0, 0);
    const T = 256, cols = Math.ceil(W / T), rows = Math.ceil(H / T);
    const blob = function (cv) { return new Promise(function (r) { cv.toBlob(r, "image/png"); }); };
    const cvB = document.createElement("canvas"); cvB.width = cvB.height = T;
    const kB = cvB.getContext("2d"); kB.fillStyle = "#ffffff"; kB.fillRect(0, 0, T, T);
    const blanc = await blob(cvB);
    window.RUNTIME_ASSETS = window.RUNTIME_ASSETS || {};
    for (let col = 0; col < cols; col++) for (let k = 1; k <= rows; k++) {
      const x0 = col * T, y0 = H - k * T;
      let f = blanc;
      if (x0 + T > O.x && x0 < O.x + sc.W && y0 + T > O.y && y0 < O.y + sc.H) {
        const cv = document.createElement("canvas"); cv.width = cv.height = T;
        const kk = cv.getContext("2d"); kk.fillStyle = "#ffffff"; kk.fillRect(0, 0, T, T);
        kk.drawImage(src, O.x - x0, O.y - y0);
        f = await blob(cv);
      }
      window.RUNTIME_ASSETS["data/tiles/z0/x" + col + "_y" + (-k) + ".png"] = { file: f };
    }
    const dec = function (pts) { return pts.map(function (q) { return { x: q.x + O.x, y: q.y + O.y }; }); };
    const route = { type: sc.existant.type, points: dec(sc.existant.points) };
    if (C.multiLevel === true) route.level = C.activeLevel || 0;
    window.KtaUid.ensure(route, "rd");
    window.setRoads(window.getRoads().concat([route]));
    const pilier = { type: "pilier-1", points: dec(sc.pilier) }, niv = window.ktaNiveauNouvelleStructure("pilier-1");
    if (niv !== null) pilier.level = niv;
    window.KtaUid.ensure(pilier, "st");
    window.setStructures(window.getStructures().concat([pilier]));
    window.map.fitBounds(L.latLngBounds([window.convertCoord(O.x - 20, O.y - 20),
      window.convertCoord(O.x + sc.W + 20, O.y + sc.H + 20)]),
      { animate: false, paddingBottomRight: [0, 280] });   // le bandeau du bas ne couvre aucun point touché
    if (window.HistoryManager && typeof window.HistoryManager.reset === "function") window.HistoryManager.reset();
    return O;
  });
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
    return !e || !e.galeries || !e.galeries.enCours;
  }, 60000);
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
function routes(page) {
  return page.evaluate(function () {
    return window.getRoads().map(function (r) {
      return { uid: r.uid, maj: r.updatedAt, type: r.type, level: r.level, points: r.points };
    });
  });
}
// Tracés de l'aperçu ramenés dans le repère de la planche.
function versPlanche(traces, O) {
  return traces.map(function (pts) {
    return { points: pts.map(function (p) { return { x: p.x - O.x, y: p.y - O.y }; }) };
  });
}
async function ouvrirGroupe(page, titreCle, boutonCle) {
  return page.evaluate(function (a) {
    const g = Array.prototype.slice.call(document.querySelectorAll("a.kta-group-toggle")).filter(function (x) {
      return x.title === window.I18n.t(a.g);
    })[0];
    if (!g) return "groupe introuvable";
    g.click();
    const fly = document.querySelector(".kta-group-flyout"), lib = window.I18n.t(a.b);
    const btn = fly && Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (x) {
      return (x.textContent || "").indexOf(lib) >= 0 || x.title === lib;
    })[0];
    if (!btn) return "bouton introuvable";
    btn.click();
    return "ok";
  }, { g: titreCle, b: boutonCle });
}
async function curseur(page, nom, extreme) {
  await page.evaluate(function (a) {
    const el = document.querySelector('#kta-detect-bandeau [data-detect-galerie-curseur="' + a.nom + '"]');
    el.value = a.extreme === "max" ? el.max : a.extreme === "min" ? el.min : a.extreme;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, { nom: nom, extreme: extreme });
  await page.waitForTimeout(600);
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
  const avant = await routes(page);

  // ── 1. Structures → Détecter : pas de galerie ──
  let r = await ouvrirGroupe(page, "ui.group.structures", "detect.bouton");
  const struct = await page.evaluate(function () {
    const b = document.getElementById("kta-detect-bandeau");
    return b ? { g: !!b.querySelector('[data-detect="pipette-g"]'), a: !!b.querySelector('[data-detect="pipette-a"]'),
                 titre: !!b.querySelector(".kta-detect-titre"), cible: window.KtaDetectionUI.etat().cible } : null;
  });
  verifier(r === "ok" && struct && struct.a && !struct.g && !struct.titre && struct.cible === "structures",
    "Structures → Détecter : piliers et fronts, aucune galerie proposée", { r: r, struct: struct });
  await page.evaluate(function () { window.KtaDetectionUI.fermer(); });

  // ── 2. Tracés → Détecter les galeries : fenêtre à elle ──
  r = await ouvrirGroupe(page, "ui.group.traces", "detect.galeries.bouton");
  const fen = await page.evaluate(function () {
    const b = document.getElementById("kta-detect-bandeau");
    if (!b) return null;
    const t = b.querySelector(".kta-detect-titre");
    return { titre: t ? t.textContent.trim() : "", svg: !!(t && t.querySelector("svg")),
             g: !!b.querySelector('[data-detect="pipette-g"]'), remplir: !!b.querySelector('[data-detect="remplir"]'),
             autres: ["a", "b", "f"].filter(function (c) {
               return !!b.querySelector('[data-detect="pipette-' + c + '"]');
             }), aria: b.getAttribute("aria-label"), etat: window.KtaDetectionUI.etat() };
  });
  const titreG = await texte(page, "detect.galeries.titre");
  verifier(r === "ok" && fen && fen.titre === titreG && fen.svg && fen.aria === titreG && fen.g && fen.remplir &&
    !fen.autres.length && fen.etat.cible === "traces" && fen.etat.pipette === "g",
    "Tracés → « " + titreG + " » : titre et icône, galerie seule, Remplir, aucun pilier ni front",
    { r: r, fen: fen && Object.assign({}, fen, { etat: undefined }) });
  if (!fen) { await ctx.close(); return; }

  // ── 3. Pipette, cadre, aperçu ──
  await toucher(page, O.x + SC.clicGris.x, O.y + SC.clicGris.y);
  let e = await etat(page);
  verifier(e.exemples.g === 1, "pipette sur la galerie grise : 1 exemple", e.exemples);
  await page.click('#kta-detect-bandeau [data-detect="zone"]');
  await toucher(page, O.x + 2, O.y + 32);
  await toucher(page, O.x + 318, O.y + 378);
  await attendre(page, function () {
    const s = window.KtaDetectionUI.etat();
    return s && s.etape === "apercu";
  }, 60000);
  e = await etat(page);
  const m = sceneGaleries.mesurerReseau(versPlanche(e.galeries.traces, O), SC);
  verifier(m.n >= 4 && m.n <= 7 && !m.courts, "aperçu : 4 à 7 tracés longs, aucun sous la branche minimale", m);
  verifier(!m.coupes && m.degreMax <= 4, "zéro étoile : aucun bout au texte ni au trait de rappel", m);
  verifier(m.composantes === 1, "réseau connexe avec le tracé existant", m);
  verifier(m.doublons === 0 && e.galeries.deja >= 1, "zéro doublon (partie déjà tracée coupée)", m);
  verifier(m.pilier === 0, "pilier posé contourné", m);
  verifier(m.raccordExact >= 2 && e.galeries.accroches >= 2,
    "bouts posés EXACTEMENT sur le sommet existant du carrefour", { m: m, acc: e.galeries.accroches });
  const dom = await page.evaluate(function () {
    return { traits: document.querySelectorAll(".leaflet-ktaDetection-pane path.kta-detect-galerie").length,
             acc: document.querySelectorAll(".leaflet-ktaDetection-pane path.kta-detect-accroche").length };
  });
  verifier(dom.traits === m.n && dom.acc >= 2, "aperçu dessiné : un trait par tracé, ronds des bouts raccordés", dom);
  verifier((await routes(page)).length === avant.length, "rien n'est écrit avant « Valider »");

  // ── 4. Réglages et type ──
  const n0 = e.galeries.n, lectures = e.lectures;
  const sommets = function (s) { return s.galeries.traces.reduce(function (t, x) { return t + x.length; }, 0); };
  const s0 = sommets(e), simp0 = await page.evaluate(function () {
    return document.querySelector('#kta-detect-bandeau [data-detect-galerie-curseur="simplification"]').value;
  });
  await curseur(page, "simplification", "min");
  e = await etat(page);
  verifier(sommets(e) > s0 && e.lectures === lectures, "simplification au minimum : plus de sommets (" + sommets(e) +
    " > " + s0 + "), image non relue", { lectures: [lectures, e.lectures] });
  await curseur(page, "simplification", simp0);
  await curseur(page, "brancheMin", "max");
  e = await etat(page);
  verifier(e.galeries.n <= n0 && e.galeries.reglages.brancheMin > 0, "branche minimale au maximum : pas plus de " +
    "tracés (" + e.galeries.n + " ≤ " + n0 + ")", e.galeries.reglages);
  await curseur(page, "brancheMin", "min");
  e = await etat(page);
  verifier(e.galeries.n >= n0 && sommets(e) >= 2 * e.galeries.n, "branche minimale à 0 : les tracés sont là",
    e.galeries.n);
  await page.selectOption("#kta-detect-bandeau [data-detect-galerie-type]", "secondaire");
  e = await etat(page);
  verifier(e.galeries.type === "secondaire" && e.galeries.types.indexOf("jonction") < 0,
    "type choisi : secondaire (jamais jonction)", e.galeries);

  // ── 5. Valider, ⏪ ──
  const attendus = e.galeries.n - e.galeries.retires;
  await page.click('#kta-detect-bandeau [data-detect="valider-galeries"]');
  await page.waitForTimeout(600);
  const apres = await routes(page), poses = apres.slice(avant.length);
  const niv = await page.evaluate(function () {
    return window.APP_CONFIG.multiLevel === true ? (window.APP_CONFIG.activeLevel || 0) : null;
  });
  verifier(poses.length === attendus && !(await etat(page)),
    "« Valider » : " + attendus + " tracés posés, fenêtre fermée",
    poses.length);
  verifier(poses.every(function (p) {
    return p.type === "secondaire" && /^rd_/.test(p.uid || "") && Number.isFinite(p.maj) &&
      (niv === null ? p.level === undefined : p.level === niv);
  }), "type secondaire, uid et updatedAt, niveau actif", poses.map(function (p) { return [p.type, p.level]; }));
  const ex = apres.find(function (p) { return p.uid === avant[avant.length - 1].uid; });
  verifier(ex && ex.points.length === 2, "tracé existant intact (aucun sommet ajouté)", ex && ex.points.length);
  await page.evaluate(function () { return window.HistoryManager.undo(); });
  await page.waitForTimeout(400);
  verifier((await routes(page)).length === avant.length, "UNE étape ⏪ retire tous les tracés détectés");

  // ── 6. Éditeur de données → Remplir au clic, galerie blanche ──
  await page.evaluate(function () { window.ouvrirTableEditor(); });
  await attendre(page, function () { return !!document.getElementById("kta-tbl-src-detect-galeries"); }, 5000);
  await page.click("#kta-tbl-src-detect-galeries");
  await page.waitForTimeout(300);
  e = await etat(page);
  verifier(e && e.cible === "traces", "📊 Éditeur de données → carte « Détecter les galeries » : même fenêtre",
    e && e.cible);
  await page.click('#kta-detect-bandeau [data-detect="remplir"]');
  await toucher(page, O.x + SC.clicBlanc.x, O.y + SC.clicBlanc.y);
  e = await etat(page);
  const tb = versPlanche(e.galeries.traces, O);
  const mb = sceneGaleries.mesurerReseau(tb, Object.assign({}, SC, { existant: { points: [{ x: -99, y: -99 },
    { x: -98, y: -99 }] } }));
  verifier(e.etape === "remplir" && e.galeries.n === 2 && !mb.coupes && mb.composantes === 2,
    "Remplir au clic : 2 tracés en T, connexes, sans bout au texte ni au trait de rappel",
    { n: e.galeries.n, mb: mb });
  verifier(tb.some(function (t) { return t.points.some(function (p) { return p.y > 280; }); }) &&
    tb.every(function (t) { return t.points.every(function (p) {
      return p.x >= 330 && p.x <= 570 && p.y >= 100 && p.y <= 300;
    }); }), "le trait de rappel est franchi, rien hors des murs");
  // toucher la galerie remplie la retire (checkup-remplir-annuler.js) ; la retoucher la remplit de nouveau
  await toucher(page, O.x + SC.clicBlanc.x + 30, O.y + SC.clicBlanc.y);
  e = await etat(page);
  verifier(e.galeries.n === 0 && e.galeries.remplis === 0, "galerie déjà remplie, touchée : elle quitte l'aperçu",
    e.galeries);
  await toucher(page, O.x + SC.clicBlanc.x, O.y + SC.clicBlanc.y);
  verifier((await etat(page)).galeries.n === 2, "retouchée : remplie de nouveau (2 tracés)");
  await toucher(page, O.x + 600, O.y + 370);
  const msgOuvert = await texte(page, "detect.galeries.remplir.ouvert");
  verifier((await toasts(page)).indexOf(msgOuvert) >= 0 && (await etat(page)).galeries.n === 2,
    "toucher sur le fond ouvert : refus affiché, rien ajouté");
  await page.click('#kta-detect-bandeau [data-detect="valider-galeries"]');
  await page.waitForTimeout(600);
  const blancs = (await routes(page)).slice(avant.length);
  verifier(blancs.length === 2 && blancs.every(function (p) { return p.type === "principal"; }),
    "« Valider » : 2 tracés, type principal par défaut", blancs.map(function (p) { return p.type; }));
  await page.evaluate(function () { return window.HistoryManager.undo(); });
  await page.waitForTimeout(300);

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
  console.log("🎉 CHECKUP VERT — détecter les galeries : fenêtre dédiée, réseau, raccord exact, Valider, ⏪, Remplir.");
  process.exit(0);
})();
