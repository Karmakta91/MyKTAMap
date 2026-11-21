#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-pilier-bras-3d.js — checkup (Playwright) : le pilier à bras a son modèle en assises dans la vue 3D
// =====================================================================
// Objets FICTIFS sur le relevé fictif SEULEMENT (absent : rouge, aucune capture), niveau 0, rendu « structures ».
// Une grille de 300 piliers à bras (20 × 15, tous les 3 m) autour du centre de la vue. Vérifie :
//   • relevé `KtaVue3D.etat().piliersBras` : un modèle par pilier, 6 à 10 assises, un ou deux blocs par assise,
//     aucun bloc hors de l'emprise du carré, triangles par pilier bornés (PLAFOND_TRIS) et rendus ;
//   • rayons horizontaux sur la face d'un pilier, du sol au plafond : joints en creux lisibles (au moins 5), le bloc
//     le plus avancé à 1 m, la roche des piliers (matériau `roche`) ;
//   • même pilier à chaque ouverture (fermer, rouvrir : mêmes assises, mêmes blocs) ; deux piliers voisins diffèrent ;
//   • 🧱 coupé : le bloc simple d'origine (aucun modèle, face à 1 m pile) ;
//   • obstacle au pas inchangé : la marche 3D s'arrête devant le carré de 1 m ;
//   • temps de rendu (KtaVue3D.mesurer) des 300 piliers à bras, comparé aux 300 mêmes carrés en pilier 1re masse
//     (le rendu d'avant : un prisme de roche) ; écart borné (PLAFOND_MS).
// Capture : la face d'un pilier en plein jour, dans KTA_CAPTURES (défaut : dossier temporaire du système).
// Usage : node scripts/smoke/checkup-pilier-bras-3d.js (SMOKE_PORT pour une autre copie) · code :
// vue3d.js > _pilierBras, PILIER_BRAS · doc : tracking.md § Vue 3D (textures des structures)
// =====================================================================
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const CAPTURES = process.env.KTA_CAPTURES || path.join(os.tmpdir(), "checkup-pilier-bras-3d");
const NOM_CAPTURE = process.env.KTA_CAPTURE_NOM || "pilier-bras-3d";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_v3d_textures_v1": "1"
};
const COLS = 20, RANGS = 15, PAS_M = 3;
const PLAFOND_TRIS = 320;      // triangles par pilier à bras, au plus
// Temps par image ajouté au plus par les 300 modèles (médiane, part du temps d'avant). 🩸 Sans carte graphique (rendu
// logiciel du navigateur headless), le temps suit le nombre de triangles bien plus que sur un appareil réel.
const PLAFOND_PART = 0.3;

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function info(msg) { console.log("  ℹ️  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
// Une section qui lève ne coupe pas les suivantes : le rouge dit tout ce qui manque.
async function section(nom, fn) {
  try { await fn(); } catch (e) { pb(nom + " : exception " + (e && e.message)); }
}

// Grille de COLS × RANGS carrés de 1 m (type `type`), le premier (st_pb3d_0) en (x0, y0) px ; aucun tracé ni zone.
function semer(page, type) {
  return page.evaluate(function (a) {
    const c = window.map.getCenter(), sc = window.APP_CONFIG.scale, H = window.PLAN_CONFIG.plan.imageHeight;
    const x0 = Math.round(c.lng - (a.cols - 1) * a.pas * sc / 2), y0 = Math.round(H - c.lat - (a.rangs - 1) * a.pas * sc / 2);
    const l = [];
    for (let j = 0; j < a.rangs; j++) {
      for (let i = 0; i < a.cols; i++) {
        const cx = x0 + i * a.pas * sc, cy = y0 + j * a.pas * sc, d = sc / 2;
        l.push({ uid: "st_pb3d_" + (j * a.cols + i), type: a.type, level: 0,
          points: [{ x: cx - d, y: cy - d }, { x: cx + d, y: cy - d }, { x: cx + d, y: cy + d }, { x: cx - d, y: cy + d }] });
      }
    }
    window.__pb3d = { x0: x0, y0: y0, sc: sc };
    window.setRoads([]);
    window.setZones([]);
    window.setStructures(l);
    if (typeof window.renderStructures === "function") window.renderStructures();
    return { n: l.length, sc: sc };
  }, { type: type, cols: COLS, rangs: RANGS, pas: PAS_M });
}

// Vue 3D ouverte 2,5 m devant (côté −x) le pilier st_pb3d_<k>, tournée vers lui, toutes tuiles construites.
function ouvrir(page, k) {
  return page.evaluate(async function (a) {
    if (!window.KtaVue3D) await window.ktaChargerVue3D();
    const K = window.KtaVue3D, o = window.__pb3d, sc = o.sc;
    const cx = o.x0 + (a.k % a.cols) * a.pas * sc, cy = o.y0 + Math.floor(a.k / a.cols) * a.pas * sc;
    window.setPlanRenduVue3D(null, "structures");
    if (window.KtaGalerie && window.KtaGalerie.invalider) window.KtaGalerie.invalider();
    if (K.etat().ouvert) await K.fermer();
    if (K.gesteAnime) K.gesteAnime(false);
    await K.ouvrir({ depart: { x: cx - 2.5 * sc, y: cy, cap: 90 }, tuiles: false, commandes: "pave", distanceVue: 100 });
    return { cx: cx, cy: cy };
  }, { k: k, cols: COLS, pas: PAS_M });
}

function releve(page) {
  return page.evaluate(function () {
    const e = window.KtaVue3D.etat();
    return { piliers: e.piliersBras || null, hauteur: e.hauteur };
  });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () {
      return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
        window.PlanRegistry.getAll().length > 0;
    }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    // ⚠️ contrat : le relevé fictif, jamais un autre plan (captures).
    const fictif = await page.evaluate(function () {
      const p = window.PlanRegistry.getAll().find(function (x) { return /fictif/i.test(x.name || ""); });
      if (!p) return false;
      window.__pret = false;
      Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
      return true;
    });
    if (!fictif) throw new Error("relevé fictif absent de l'index : checkup refusé sur un autre plan");
    await attendre(page, function () {
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.Pathfinder;
    }, 40000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
      if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) window.ktaSetActiveLevel(0);
      if (window.getTrackingActif && window.getTrackingActif()) window.stopTracking();
    });

    // ── 0. Avant : les mêmes 300 carrés en pilier 1re masse (le rendu d'un pilier à bras jusqu'ici) ──
    // Une ouverture à blanc d'abord : textures dessinées, shaders compilés, interface montée (sinon la 1re mesure
    // paie seule ces coûts et ne compte pas les mêmes appels de dessin).
    let perfAvant = null;
    await section("mesure avant", async function () {
      await semer(page, "pilier-bras");
      await ouvrir(page, 0);
      await page.evaluate(function () { return window.KtaVue3D.fermer(); });
      await semer(page, "pilier-1");
      await ouvrir(page, 0);
      perfAvant = await page.evaluate(function () {
        const K = window.KtaVue3D, e = K.etat();
        return Object.assign({ reindexTuiles: e.reindex ? e.reindex.tuiles : null }, K.mesurer({ images: 90 }));
      });
      info("300 piliers 1re masse : " + JSON.stringify(perfAvant));
      await page.evaluate(function () { return window.KtaVue3D.fermer(); });
    });

    const n = await semer(page, "pilier-bras");
    verifier(n.n === COLS * RANGS, "relevé fictif : " + n.n + " piliers à bras semés (échelle " + n.sc + " px/m)", n);
    const place = await ouvrir(page, 0);

    // ── 1. Temps de rendu des 300 modèles, mesuré comme avant (juste après l'ouverture) ──
    await section("mesure après", async function () {
      const apres = await page.evaluate(function () {
        const K = window.KtaVue3D, e = K.etat();
        return Object.assign({ reindexTuiles: e.reindex ? e.reindex.tuiles : null }, K.mesurer({ images: 90 }));
      });
      info("300 piliers à bras : " + JSON.stringify(apres));
      if (perfAvant) {
        info("écart : médiane " + (apres.msMed - perfAvant.msMed).toFixed(2) + " ms, triangles +" +
          (apres.trianglesMax - perfAvant.trianglesMax) + ", appels " + perfAvant.appelsMax + " → " + apres.appelsMax);
        const part = (apres.msMed - perfAvant.msMed) / perfAvant.msMed;
        verifier(part <= PLAFOND_PART, "rendu : médiane par image " + perfAvant.msMed + " → " + apres.msMed + " ms (" +
          (part >= 0 ? "+" : "") + Math.round(part * 100) + " %, au plus +" + Math.round(PLAFOND_PART * 100) + " %)");
        verifier(apres.appelsMax <= perfAvant.appelsMax + 1, "aucun appel de dessin par pilier (géométrie fusionnée par tuile)",
          { avant: perfAvant.appelsMax, apres: apres.appelsMax });
      }
    });

    // ── 2. Un modèle par pilier, assises et blocs ──
    let r1 = null;
    await section("modèle", async function () {
      r1 = await releve(page);
      const P = r1.piliers || {};
      const l = Object.keys(P).map(function (k) { return P[k]; });
      verifier(l.length === COLS * RANGS, "un modèle en assises par pilier à bras (" + l.length + ")", { n: l.length });
      if (!l.length) return;
      const assises = l.map(function (p) { return p.assises; }), blocs = l.map(function (p) { return p.blocs; });
      const tris = l.map(function (p) { return p.tris; }), debord = Math.max.apply(null, l.map(function (p) { return p.debord; }));
      const min = function (a) { return Math.min.apply(null, a); }, max = function (a) { return Math.max.apply(null, a); };
      const moy = function (a) { return +(a.reduce(function (s, v) { return s + v; }, 0) / a.length).toFixed(1); };
      verifier(min(assises) >= 6 && max(assises) <= 10, "6 à 10 assises du sol au plafond (h = " + r1.hauteur + " m)",
        { min: min(assises), max: max(assises) });
      verifier(l.every(function (p) { return p.blocs >= p.assises && p.blocs <= 2 * p.assises; }),
        "un ou deux blocs par assise", { min: min(blocs), max: max(blocs), moy: moy(blocs) });
      verifier(l.some(function (p) { return p.blocs > p.assises; }) && l.some(function (p) { return p.blocs < 2 * p.assises; }),
        "des assises d'un bloc et des assises de deux, mêlées");
      verifier(debord <= 0.001, "aucun bloc hors de l'emprise du carré (débord max " + debord + " m)", { debord: debord });
      verifier(max(tris) <= PLAFOND_TRIS, "triangles par pilier bornés : min " + min(tris) + ", moy " + moy(tris) +
        ", max " + max(tris) + " (≤ " + PLAFOND_TRIS + ")", { max: max(tris) });
      const formes = new Set(l.map(function (p) { return p.forme; }));
      verifier(formes.size >= l.length * 0.9, "chaque pilier a sa forme (" + formes.size + " formes / " + l.length + ")");
    });

    // ── 3. Joints lisibles sur la face vue, roche ──
    await section("joints", async function () {
      const r = await page.evaluate(function (pl) {
        const K = window.KtaVue3D, e = K.etat(), sc = window.__pb3d.sc, out = [];
        for (let y = 0.01; y < e.hauteur - 0.01; y += 0.004) {
          const v = K.rayon(pl.cx - 1.5 * sc, pl.cy + 0.25 * sc, y, [1, 0, 0]).vu;
          out.push(v ? { y: +y.toFixed(3), d: v.dist, mat: v.mat } : { y: +y.toFixed(3), d: null });
        }
        return out;
      }, place);
      const ds = r.filter(function (q) { return q.d !== null; });
      const dMin = Math.min.apply(null, ds.map(function (q) { return q.d; }));
      // Un joint : une plage où la face recule d'au moins 1,5 cm derrière les deux blocs qui l'entourent.
      let joints = 0, dans = false;
      for (let i = 0; i < r.length; i++) {
        const d = r[i].d, creux = d !== null && (d - dMin) > 0.03;
        let profond = false;
        if (creux) {
          const avant = r.slice(Math.max(0, i - 8), i).map(function (q) { return q.d; });
          const apres = r.slice(i + 1, i + 9).map(function (q) { return q.d; });
          profond = Math.min.apply(null, avant) < d - 0.015 && Math.min.apply(null, apres) < d - 0.015;
        }
        if (profond && !dans) joints++;
        dans = profond;
      }
      const mats = new Set(ds.map(function (q) { return q.mat; }));
      verifier(ds.length === r.length, "la face du pilier est vue du sol au plafond", { trous: r.length - ds.length });
      verifier(Math.abs(dMin - 1) < 0.02, "le bloc le plus avancé à 1 m (bord du carré)", { dMin: dMin });
      verifier(joints >= 5, "joints en creux lisibles sur la hauteur (" + joints + ")", { joints: joints });
      verifier(mats.size === 1 && mats.has("roche"), "la roche des piliers", Array.from(mats));
    });

    // ── 4. Captures (plein jour) ──
    await section("capture", async function () {
      fs.mkdirSync(CAPTURES, { recursive: true });
      // À hauteur d'yeux dans l'allée entre deux rangs, puis en vue d'édition rasante (20°) au plus près du pilier.
      await page.evaluate(function (pl) {
        const K = window.KtaVue3D, sc = window.__pb3d.sc;
        K.reglerPleinJour(true);
        K.placer(pl.cx - 2 * sc, pl.cy + 1.5 * sc, 80);
      }, place);
      await page.waitForTimeout(600);
      const f1 = path.join(CAPTURES, NOM_CAPTURE + "-yeux.png");
      await page.screenshot({ path: f1 });
      await page.evaluate(function (pl) {
        const K = window.KtaVue3D, sc = window.__pb3d.sc;
        K.placer(pl.cx - 1.5 * sc, pl.cy, 60);
        K.basculerVue();
        K.incliner(-40);
        K.zoomer(0.3);
      }, place);
      await page.waitForTimeout(600);
      const f2 = path.join(CAPTURES, NOM_CAPTURE + "-edition.png");
      await page.screenshot({ path: f2 });
      ok("captures : " + f1 + " · " + f2);
      await page.evaluate(function () {
        const K = window.KtaVue3D;
        K.basculerVue();
        K.reglerPleinJour(false);
      });
    });

    // ── 5. Même pilier à chaque ouverture ; deux piliers voisins diffèrent ──
    await section("déterminisme", async function () {
      await page.evaluate(function () { return window.KtaVue3D.fermer(); });
      await ouvrir(page, 0);
      const r2 = await releve(page);
      const a = (r1 && r1.piliers) || {}, b = r2.piliers || {};
      const k = Object.keys(a);
      const memes = k.filter(function (u) { return b[u] && b[u].forme === a[u].forme && b[u].blocs === a[u].blocs; });
      verifier(k.length > 0 && memes.length === k.length, "rouvert : mêmes assises, mêmes blocs (" + memes.length + "/" +
        k.length + ")");
      const p0 = a.st_pb3d_0, p1 = a.st_pb3d_1;
      verifier(!!p0 && !!p1 && p0.forme !== p1.forme, "deux piliers voisins ne sortent pas du même moule");
    });

    // ── 6. Obstacle au pas inchangé : le carré de 1 m ──
    await section("obstacle", async function () {
      const m = await page.evaluate(function (pl) {
        const K = window.KtaVue3D, sc = window.__pb3d.sc;
        K.placer(pl.cx - 1.5 * sc, pl.cy, 90);
        let refus = 0;
        for (let i = 0; i < 12; i++) { if (!K.avancer(0.25)) refus++; }
        return { refus: refus, x1: +(K.etat().pos.x / sc).toFixed(2), xBord: +((pl.cx - sc / 2) / sc).toFixed(2),
          tracker: window.ktaPasBloqueParStructure(pl.cx - sc, pl.cy, pl.cx + sc, pl.cy, 0) };
      }, place);
      verifier(m.refus > 0 && m.x1 < m.xBord && m.tracker === true, "la marche s'arrête devant le carré de 1 m", m);
    });

    // ── 7. 🧱 coupé : le bloc simple d'origine ──
    await section("textures coupées", async function () {
      const r = await page.evaluate(function (pl) {
        const K = window.KtaVue3D, sc = window.__pb3d.sc;
        K.basculerTextures();
        const e = K.etat(), P = e.piliersBras || {};
        const v = K.rayon(pl.cx - 1.5 * sc, pl.cy + 0.25 * sc, 1.0, [1, 0, 0]).vu;
        const v2 = K.rayon(pl.cx - 1.5 * sc, pl.cy + 0.25 * sc, 0.5, [1, 0, 0]).vu;
        K.basculerTextures();
        return { modeles: Object.keys(P).length, d: v && v.dist, d2: v2 && v2.dist };
      }, place);
      verifier(r.modeles === 0 && Math.abs(r.d - 1) < 0.002 && Math.abs(r.d2 - 1) < 0.002,
        "🧱 coupé : le bloc simple (couleur de la légende), sans assises", r);
    });

    await page.evaluate(function () { return window.KtaVue3D.fermer(); });
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — le pilier à bras est une colonne de blocs en assises, la même à chaque ouverture, " +
    "dans son carré, au prix borné, et le bloc simple 🧱 coupé.");
  process.exit(0);
})();
