#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-arc.js — checkup (Playwright) : l'arc de soutènement ne bloque rien, nulle part
// =====================================================================
// Objets FICTIFS posés au centre de la vue (relevé fictif, sinon le premier plan de l'index) : une galerie droite
// A → B, un détour par le bas, un arc en travers de la galerie droite. Vérifie :
//   • itinéraire : la galerie droite reste prise avec l'arc (un mur en ligne au même endroit, témoin, la coupe) ;
//   • outil 🏛️ → Arc : un arc dessiné en deux touches d'une paroi à l'autre, polyligne de type `arc`, trait rayé
//     (couleur des rayures = canon) plus fin que le mur en ligne ; l'itinéraire passe toujours ;
//   • tracker et vue 3D : la règle du pas (ktaPasBloqueParStructure, lot avecPerso de la 3D) laisse passer l'arc et
//     arrête le mur témoin ; la vue 3D avance à travers l'arc, le mur témoin l'arrête ;
//   • ≡ Légende (pastille rayée), ≡ Filtres (case `arc`), fenêtre d'export image (case `ann_structures_arc`),
//     image exportée (pipeline commun PNG / PDF : bleu ET rouge sur le trait), légende de l'export.
// 🩸 La règle est d'abord une ABSENCE (clé `arc` inconnue du pathfinder et de tracking.js > _OBST_TYPES) : seul ce
// parcours la prouve sur les vrais registres, l'outil de dessin et la vue 3D.
// Usage : node scripts/smoke/checkup-arc.js (SMOKE_PORT pour une autre copie ; KTA_MOTEURS=webkit) · code :
// styleResolver.js > CANON.structures.arc, structures.js > ktaPolylineStructure · doc : data-formats.md (structures)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Galerie droite (0,0) → (200,0), détour par y = +100, arc vertical en x = 100 (y −40 → +40), autour du centre.
// `murTemoin` : un mur en ligne au même endroit (contrôle que le parcours sait voir un obstacle).
function semer(page, murTemoin) {
  return page.evaluate(function (murTemoin) {
    const c = window.map.getCenter();
    const x = Math.round(c.lng) - 100, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 50;
    window.__arc = { x: x, y: y };
    window.setRoads([
      { uid: "rd_arc_droit", type: "principal", level: 0,
        points: [{ x: x, y: y }, { x: x + 100, y: y }, { x: x + 200, y: y }] },
      { uid: "rd_arc_detour", type: "principal", level: 0,
        points: [{ x: x, y: y }, { x: x, y: y + 100 }, { x: x + 200, y: y + 100 }, { x: x + 200, y: y }] }
    ]);
    window.setZones([]);
    window.setStructures([{ uid: "st_arc_1", type: murTemoin ? "mur-ligne" : "arc", level: 0,
      points: [{ x: x + 100, y: y - 40 }, { x: x + 100, y: y + 40 }] }]);
    if (typeof window.renderRoads === "function") window.renderRoads();
    if (typeof window.renderStructures === "function") window.renderStructures();
  }, !!murTemoin);
}

function itineraire(page) {
  return page.evaluate(async function () {
    const o = window.__arc;
    try {
      const r = await window.Pathfinder.computeRoute([{ x: o.x, y: o.y }, { x: o.x + 200, y: o.y }],
        { allowedTypes: ["principal"] });
      return Math.round(r.totalDistance);
    } catch (e) { return e.code || String(e && e.message); }
  });
}

// Règle du pas en 2D (tracker) et en lot avecPerso (vue 3D), sur un pas qui traverse x = 100.
function pas(page) {
  return page.evaluate(function () {
    const o = window.__arc;
    return {
      tracker: window.ktaPasBloqueParStructure(o.x + 90, o.y, o.x + 110, o.y, 0),
      vue3d: window.ktaSegmentsBloquesParStructure([[o.x + 90, o.y, o.x + 110, o.y]], 0, true)[0]
    };
  });
}

// Vue 3D ouverte 1 m avant l'arc, face à lui (cap 90 = +x) : pas de 0,25 m sur 2 m → { refus, x0, x1, xArc } (m).
function marche3D(page) {
  return page.evaluate(async function () {
    if (!window.KtaVue3D) await window.ktaChargerVue3D();
    const K = window.KtaVue3D, sc = window.APP_CONFIG.scale, o = window.__arc;
    window.setPlanRenduVue3D(null, "structures");
    if (window.KtaGalerie && window.KtaGalerie.invalider) window.KtaGalerie.invalider();
    if (K.etat().ouvert) await K.fermer();
    await K.ouvrir({ depart: { x: o.x + 100 - sc, y: o.y, cap: 90 }, tuiles: false, commandes: "pave" });
    const x0 = K.etat().pos.x;
    let refus = 0;
    for (let i = 0; i < 8; i++) { if (!K.avancer(0.25)) refus++; }
    const x1 = K.etat().pos.x;
    await K.fermer();
    return { refus: refus, x0: +(x0 / sc).toFixed(2), x1: +(x1 / sc).toFixed(2), xArc: +((o.x + 100) / sc).toFixed(2) };
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
    await page.evaluate(function () {
      const tous = window.PlanRegistry.getAll();
      const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
      window.__pret = false;
      Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
    });
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

    // ── 1. Témoin : un mur en ligne au même endroit coupe la galerie droite, le pas et la vue 3D ──
    await semer(page, true);
    await page.waitForTimeout(400);
    verifier(await itineraire(page) === 400, "témoin mur (ligne) : l'itinéraire prend le détour (400)");
    const pMur = await pas(page);
    verifier(pMur.tracker === true && pMur.vue3d === true, "témoin mur (ligne) : le pas est refusé (tracker et 3D)", pMur);
    const mMur = await marche3D(page);
    verifier(mMur.refus > 0 && mMur.x1 < mMur.xArc, "témoin mur (ligne) : la vue 3D s'arrête devant", mMur);

    // ── 2. L'arc en travers : rien ne bloque ──
    await semer(page, false);
    await page.waitForTimeout(400);
    const dArc = await itineraire(page);
    verifier(Math.abs(dArc - 200) <= 2, "arc en travers : l'itinéraire garde la galerie droite (200)", dArc);
    const pArc = await pas(page);
    verifier(pArc.tracker === false && pArc.vue3d === false, "arc : le pas du tracker et de la 3D passe", pArc);
    const mArc = await marche3D(page);
    verifier(mArc.refus === 0 && mArc.x1 > mArc.xArc + 0.5, "arc : la vue 3D avance à travers (2 m, aucun refus)", mArc);

    // ── 3. Outil 🏛️ → Arc : deux touches d'une paroi à l'autre ──
    const dessin = await page.evaluate(function () {
      const o = window.__arc, H = window.PLAN_CONFIG.plan.imageHeight;
      window.toggleStructureMode("arc");
      [[o.x + 150, o.y - 30], [o.x + 150, o.y + 30]].forEach(function (p) {
        window.map.fire("click", { latlng: window.L.latLng(H - p[1], p[0]) });
      });
      const okFerme = window.fermerStructureEnCours();
      window.toggleStructureMode("arc");
      const arcs = window.getStructures().filter(function (s) { return s.type === "arc"; });
      // Couches de session rendues : trait rayé pour l'arc, plus fin qu'un mur en ligne au même zoom.
      let couche = null;
      window.map.eachLayer(function (l) {
        if (l.options && l.options.ktaStructType === "arc" && !couche) couche = l;
      });
      const canon = window.ktaResolveStyle("structures", "arc");
      return { okFerme: okFerme, n: arcs.length, pts: arcs.map(function (a) { return a.points.length; }),
        poly: window.isStructurePolylineType("arc"), rayures: couche ? couche.options.ktaRayures : null,
        attendu: canon && canon.rayures && canon.rayures.color, poids: couche ? couche.options.weight : null,
        poidsMur: window.ktaLargeurFrontPourRatio(Math.pow(2, window.map.getZoom())) };
    });
    verifier(dessin.okFerme && dessin.n === 2 && dessin.pts[1] === 2 && dessin.poly,
      "outil Arc : un 2e arc dessiné en deux touches, polyligne validée", dessin);
    verifier(!!dessin.rayures && dessin.rayures === dessin.attendu, "carte : l'arc est un trait rayé (couleur du canon)", dessin);
    verifier(dessin.poids > 0 && dessin.poids <= dessin.poidsMur, "carte : trait de l'arc pas plus épais que le mur en ligne", dessin);
    const d2 = await itineraire(page);
    verifier(Math.abs(d2 - 200) <= 2, "deux arcs : l'itinéraire passe toujours (200)", d2);

    // ── 4. ≡ Légende, ≡ Filtres, fenêtre d'export ──
    const leg = await page.evaluate(async function () {
      window.afficherLegende();
      await new Promise(function (r) { setTimeout(r, 500); });
      const lib = window.I18n.t("legend.label.structures.arc");
      const ligne = Array.from(document.querySelectorAll(".kta-legende-ligne")).find(function (l) {
        const t = l.querySelector(".kta-legende-label");
        return t && t.textContent.trim() === lib;
      });
      const trait = ligne && ligne.querySelector(".kta-legende-trait");
      const res = { trouvee: !!ligne, fond: trait ? trait.getAttribute("style") : null };
      const b = document.getElementById("kta-legende-close"); if (b) b.click();
      return res;
    });
    verifier(leg.trouvee && /repeating-linear-gradient/.test(leg.fond || ""), "≡ Légende : ligne de l'arc, pastille rayée", leg);
    const filt = await page.evaluate(async function () {
      window.FilterPanel.ouvrir();
      await new Promise(function (r) { setTimeout(r, 500); });
      const i = document.querySelector('#kta-fp-sec-structs input[data-type="arc"]');
      const res = { case: !!i, coche: !!(i && i.checked) };
      if (window.FilterPanel.fermer) window.FilterPanel.fermer();
      return res;
    });
    verifier(filt.case && filt.coche, "≡ Filtres : une case « arc » (cochée)", filt);

    // ── 5. Image exportée (pipeline commun PNG / PDF) et sa légende ──
    const im = await page.evaluate(async function () {
      const cv = await window.MyKTAMapExporterGenererCanvas({ ann: { points: false, roads: true, zones: false, structures: true },
        scale: 1, bg: "white", includeImgLayers: false, dataLayers: {} });
      const ctx = cv.getContext("2d"), sx = cv.width / window.APP_CONFIG.imageWidth, o = window.__arc;
      const near = function (p, c) { return Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < 60; };
      let bleu = 0, rouge = 0;
      // Bande de 7 px autour du trait (un trait fin tombe à cheval sur deux colonnes) : teinte dominante.
      const bx = Math.round((o.x + 100) * sx) - 3, by = Math.round((o.y - 35) * sx), bh = Math.round(70 * sx);
      const d = ctx.getImageData(bx, by, 7, bh).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 2] > d[i] + 50 && d[i + 2] > d[i + 1] + 30) bleu++;
        if (d[i] > 120 && d[i] > d[i + 2] + 60 && d[i] > d[i + 1] + 60) rouge++;
      }
      const lg = await window.MyKTAMapExporterGenererCanvasLegende({ contenu: { icones: false, traces: false, zones: false,
        structures: true, track: false, meta: false } });
      let rougeLeg = 0;
      if (lg) {
        const d = lg.getContext("2d").getImageData(0, 0, lg.width, lg.height).data;
        for (let i = 0; i < d.length; i += 4) { if (near([d[i], d[i + 1], d[i + 2]], [0xcc, 0x00, 0x00])) rougeLeg++; }
      }
      return { bleu: bleu, rouge: rouge, rougeLeg: rougeLeg, w: cv.width, h: cv.height, sx: +sx.toFixed(3) };
    });
    verifier(im.bleu > 0 && im.rouge > 0, "image exportée : l'arc est bleu rayé de rouge", im);
    verifier(im.rougeLeg > 0, "légende de l'export : la pastille de l'arc porte ses rayures", im);
    const exp = await page.evaluate(async function () {
      window.ouvrirExportModal();
      await new Promise(function (r) { setTimeout(r, 800); });
      const cb = document.getElementById("ann_structures_arc");
      const res = { case: !!cb, coche: !!(cb && cb.checked) };
      const x = document.getElementById("kta-export-close"); if (x) x.click();
      return res;
    });
    verifier(exp.case, "fenêtre d'export image : une case « Arc de soutènement »", exp);

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
  console.log("🎉 CHECKUP VERT — l'arc se dessine, se voit (légende, filtres, export) et ne bloque ni itinéraire, ni tracker, ni vue 3D.");
  process.exit(0);
})();
