#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-pilier-bras.js — checkup (Playwright) : le pilier à bras, posé d'un clic, vu partout, jamais bloquant
// =====================================================================
// Objets FICTIFS posés au centre de la vue (relevé fictif, sinon le premier plan de l'index), niveau 0 actif.
// Vérifie :
//   • outil 🏛️ → Pilier à bras : UN clic pose un polygone fermé de type `pilier-bras`, carré de 1 m de côté
//     (APP_CONFIG.scale px), centré sur le clic, côtés parallèles aux axes de l'image, au niveau actif ; l'outil
//     reste armé (un 2e clic, un 2e carré) ; ⏪ retire le 2e ;
//   • carte : carré plein barré d'une croix (pixel du centre sombre, pixel sur un axe de la couleur des piliers) ;
//   • ≡ Légende (ligne, pastille barrée), ≡ Filtres (case `pilier-bras` cochée), fenêtre d'export image (case),
//     image exportée (pipeline commun PNG / PDF : plein jaune, centre barré) ;
//   • Volume exploité : 1 m² retranché du secteur, comme un pilier ;
//   • itinéraire : une galerie qui le traverse reste prise ;
//   • tracker et vue 3D : un bloc (pas refusé, la vue 3D s'arrête devant, un rayon à 1 m du sol bute sur sa face).
// Usage : node scripts/smoke/checkup-pilier-bras.js (SMOKE_PORT pour une autre copie) · code :
// styleResolver.js > CANON.structures["pilier-bras"], structures.js > ktaCarrePilierBras / ktaPeindreCroix · doc :
// data-formats.md (structures), rendering-leaflet.md
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
// Une section qui lève ne coupe pas les suivantes : le rouge dit tout ce qui manque.
async function section(nom, fn) {
  try { await fn(); } catch (e) { pb(nom + " : exception " + (e && e.message)); }
}

// Galerie droite (0,0) → (200,0) et détour par y = +100, autour du centre ; aucune structure.
function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    const x = Math.round(c.lng) - 100, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 50;
    window.__pb = { x: x, y: y };
    window.setRoads([
      { uid: "rd_pb_droit", type: "principal", level: 0,
        points: [{ x: x, y: y }, { x: x + 100, y: y }, { x: x + 200, y: y }] },
      { uid: "rd_pb_detour", type: "principal", level: 0,
        points: [{ x: x, y: y }, { x: x, y: y + 100 }, { x: x + 200, y: y + 100 }, { x: x + 200, y: y }] }
    ]);
    window.setZones([]);
    window.setStructures([]);
    if (typeof window.renderRoads === "function") window.renderRoads();
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
    await semer(page);
    await page.waitForTimeout(400);

    // ── 1. Un clic = un carré de 1 m ; outil armé ; ⏪ ──
    await section("pose", async function () {
      const r = await page.evaluate(function () {
        const o = window.__pb, H = window.PLAN_CONFIG.plan.imageHeight, sc = window.APP_CONFIG.scale;
        const clic = function (x, y) { window.map.fire("click", { latlng: window.L.latLng(H - y, x) }); };
        window.toggleStructureMode("pilier-bras");
        const arme = window.modeStructure;
        clic(o.x + 100, o.y);
        const apres1 = window.getStructures().map(function (s) { return JSON.parse(JSON.stringify(s)); });
        const enCours = window.getCurrentStructure();
        clic(o.x + 160, o.y + 60);
        const n2 = window.getStructures().length;
        window.HistoryManager.undo();
        const n3 = window.getStructures().length;
        window.toggleStructureMode("pilier-bras");
        return { arme: arme, apres1: apres1, enCours: !!enCours, n2: n2, n3: n3, sc: sc, cx: o.x + 100, cy: o.y,
          niveauAttendu: window.ktaNiveauNouvelleStructure("pilier-bras"), modeApres: window.modeStructure,
          poly: window.isStructurePolylineType("pilier-bras") };
      });
      const s = r.apres1[0] || {};
      const pts = Array.isArray(s.points) ? s.points : [];
      const xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
      const cote = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      const haut = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      const cx = (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2;
      const cy = (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2;
      // Axé : chaque côté est horizontal ou vertical (deux coordonnées égales à 0,01 px près).
      const axe = pts.length === 4 && pts.every(function (p, i) {
        const q = pts[(i + 1) % 4];
        return Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01;
      });
      verifier(r.arme === "pilier-bras" && r.apres1.length === 1 && s.type === "pilier-bras" && !r.enCours && !r.poly,
        "un clic : une structure fermée `pilier-bras`, rien en cours", r);
      verifier(pts.length === 4 && Math.abs(cote - r.sc) < 0.02 && Math.abs(haut - r.sc) < 0.02,
        "carré de 1 m de côté (" + r.sc + " px)", { cote: cote, haut: haut });
      verifier(Math.abs(cx - r.cx) < 0.02 && Math.abs(cy - r.cy) < 0.02 && axe, "centré sur le clic, axé sur le plan",
        { cx: cx, cy: cy, pts: pts });
      verifier((r.niveauAttendu === null ? s.level === undefined : s.level === r.niveauAttendu) && !!s.uid,
        "niveau du niveau actif (ktaNiveauNouvelleStructure), uid posé", { level: s.level, attendu: r.niveauAttendu });
      verifier(r.n2 === 2 && r.n3 === 1 && r.modeApres === null, "outil armé : 2e clic = 2e carré ; ⏪ le retire", r);
    });

    // ── 2. Carte : plein barré d'une croix ──
    await section("carte", async function () {
      const c = await page.evaluate(async function () {
        const o = window.__pb, H = window.PLAN_CONFIG.plan.imageHeight, m = window.map, r = m._renderer;
        const sc = window.APP_CONFIG.scale;
        const attendreImage = function () {
          return new Promise(function (ok) { requestAnimationFrame(function () { setTimeout(ok, 150); }); });
        };
        m.setView([H - o.y, o.x + 100], m.getMaxZoom(), { animate: false });
        await attendreImage();
        let couche = null;
        m.eachLayer(function (l) { if (l.options && l.options.ktaStructType === "pilier-bras" && !couche) couche = l; });
        const pixel = function (px, py) {
          const lp = m.latLngToLayerPoint([H - py, px]), d = window.devicePixelRatio || 1;
          const x = Math.round((lp.x - r._bounds.min.x) * d), y = Math.round((lp.y - r._bounds.min.y) * d);
          return Array.from(r._ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
        };
        return { couche: !!couche, croix: couche ? !!couche.options.ktaCroix : false,
          centre: pixel(o.x + 100, o.y), axe: pixel(o.x + 100 + sc * 0.3, o.y + 0.5),
          cotePx: couche ? m.latLngToLayerPoint([H - o.y, o.x + 100 + sc]).x - m.latLngToLayerPoint([H - o.y, o.x + 100]).x : 0 };
      });
      const sombre = function (p) { return p[0] + p[1] + p[2] < 240; };
      const jaune = function (p) { return p[0] > 150 && p[1] > 110 && p[2] < 130; };
      verifier(c.couche && c.croix, "carte : une couche `pilier-bras` barrée (ktaCroix)", c);
      verifier(sombre(c.centre) && jaune(c.axe), "carte : centre sombre (croix), plein jaune sur un axe", c);
    });

    // ── 3. ≡ Légende, ≡ Filtres, fenêtre d'export ──
    await section("légende", async function () {
      const leg = await page.evaluate(async function () {
        window.afficherLegende();
        await new Promise(function (r) { setTimeout(r, 500); });
        const lib = window.I18n.t("legend.label.structures.pilier-bras");
        const ligne = Array.from(document.querySelectorAll(".kta-legende-ligne")).find(function (l) {
          const t = l.querySelector(".kta-legende-label");
          return t && t.textContent.trim() === lib;
        });
        const res = { lib: lib, trouvee: !!ligne, html: ligne ? ligne.innerHTML.slice(0, 400) : null };
        const b = document.getElementById("kta-legende-close"); if (b) b.click();
        return res;
      });
      verifier(leg.trouvee && /linear-gradient\(45deg/.test(leg.html || ""), "≡ Légende : ligne du pilier à bras, pastille barrée", leg);
    });
    await section("filtres", async function () {
      const filt = await page.evaluate(async function () {
        window.FilterPanel.ouvrir();
        await new Promise(function (r) { setTimeout(r, 500); });
        const i = document.querySelector('#kta-fp-sec-structs input[data-type="pilier-bras"]');
        const res = { case: !!i, coche: !!(i && i.checked) };
        if (window.FilterPanel.fermer) window.FilterPanel.fermer();
        return res;
      });
      verifier(filt.case && filt.coche, "≡ Filtres : une case « pilier-bras » (cochée)", filt);
    });
    await section("fenêtre d'export", async function () {
      const exp = await page.evaluate(async function () {
        window.ouvrirExportModal();
        await new Promise(function (r) { setTimeout(r, 800); });
        const cb = document.getElementById("ann_structures_pilier-bras");
        const res = { case: !!cb, coche: !!(cb && cb.checked) };
        const x = document.getElementById("kta-export-close"); if (x) x.click();
        return res;
      });
      verifier(exp.case && exp.coche, "fenêtre d'export image : une case « Pilier à bras » (cochée)", exp);
    });

    // ── 4. Image exportée (pipeline commun PNG / PDF) ──
    await section("export PNG", async function () {
      const im = await page.evaluate(async function () {
        const cv = await window.MyKTAMapExporterGenererCanvas({ ann: { points: false, roads: false, zones: false, structures: true },
          scale: 2, bg: "white", includeImgLayers: false, dataLayers: {} });
        const ctx = cv.getContext("2d"), sx = cv.width / window.APP_CONFIG.imageWidth, o = window.__pb;
        const sc = window.APP_CONFIG.scale;
        // Moitié droite du carré, sur son axe horizontal, entre les deux branches de la croix (à gauche, un tracé
        // du relevé fictif passe par-dessus) : pixels jaunes (plein) ; 3 × 3 px au centre : pixels sombres (croix).
        const d = ctx.getImageData(Math.round((o.x + 100 + sc * 0.2) * sx), Math.round(o.y * sx) - 1,
          Math.max(2, Math.round(sc * 0.15 * sx)), 3).data;
        let jaunes = 0, total = 0;
        for (let i = 0; i < d.length; i += 4) {
          total++;
          if (d[i + 3] > 200 && d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 140) jaunes++;
        }
        const c = ctx.getImageData(Math.round((o.x + 100) * sx) - 1, Math.round(o.y * sx) - 1, 3, 3).data;
        let sombres = 0;
        for (let i = 0; i < c.length; i += 4) { if (c[i + 3] > 200 && c[i] + c[i + 1] + c[i + 2] < 300) sombres++; }
        return { jaunes: jaunes, total: total, sombres: sombres, w: cv.width, h: cv.height, sx: +sx.toFixed(3) };
      });
      verifier(im.jaunes >= im.total / 2 && im.sombres > 0, "image exportée : plein jaune, centre barré", im);
    });

    // ── 5. Volume exploité : 1 m² retranché ──
    await section("volume", async function () {
      const v = await page.evaluate(function () {
        const o = window.__pb, sc = window.APP_CONFIG.scale, h = 5 * sc;
        const cx = o.x + 100, cy = o.y;
        const secteur = [{ x: cx - h, y: cy - h }, { x: cx + h, y: cy - h }, { x: cx + h, y: cy + h }, { x: cx - h, y: cy + h }];
        const r = window.KtaVolumeExploite.calculer({ secteur: secteur, structures: window.getStructures(), zones: [],
          niveau: window.APP_CONFIG.multiLevel === true ? 0 : null, scale: sc, hauteur: 2,
          estLigne: window.isStructurePolylineType });
        return { ok: r.ok, secteur: r.secteurM2, piliers: r.piliersM2, exploite: r.exploiteM2 };
      });
      verifier(v.ok && Math.abs(v.secteur - 100) < 0.05 && Math.abs(v.piliers - 1) < 0.02 && Math.abs(v.exploite - 99) < 0.05,
        "Volume exploité : 1 m² retranché d'un secteur de 100 m²", v);
    });

    // ── 6. Itinéraire : la galerie droite reste prise ──
    await section("itinéraire", async function () {
      const d = await page.evaluate(async function () {
        const o = window.__pb;
        try {
          const r = await window.Pathfinder.computeRoute([{ x: o.x, y: o.y }, { x: o.x + 200, y: o.y }],
            { allowedTypes: ["principal"] });
          return Math.round(r.totalDistance);
        } catch (e) { return e.code || String(e && e.message); }
      });
      const n = await page.evaluate(function () {
        return window.getStructures().filter(function (s) { return s.type === "pilier-bras"; }).length;
      });
      verifier(n === 1 && Math.abs(d - 200) <= 2, "itinéraire : la galerie qui traverse le pilier à bras reste prise (200)",
        { d: d, n: n });
    });

    // ── 7. Tracker et vue 3D : un bloc ──
    await section("tracker / 3D", async function () {
      const p = await page.evaluate(function () {
        const o = window.__pb, sc = window.APP_CONFIG.scale;
        return {
          tracker: window.ktaPasBloqueParStructure(o.x + 100 - sc, o.y, o.x + 100 + sc, o.y, 0),
          vue3d: window.ktaSegmentsBloquesParStructure([[o.x + 100 - sc, o.y, o.x + 100 + sc, o.y]], 0, true)[0]
        };
      });
      verifier(p.tracker === true && p.vue3d === true, "tracker et 3D : le pas à travers le pilier à bras est refusé", p);
      const m3 = await page.evaluate(async function () {
        if (!window.KtaVue3D) await window.ktaChargerVue3D();
        const K = window.KtaVue3D, sc = window.APP_CONFIG.scale, o = window.__pb;
        window.setPlanRenduVue3D(null, "structures");
        if (window.KtaGalerie && window.KtaGalerie.invalider) window.KtaGalerie.invalider();
        if (K.etat().ouvert) await K.fermer();
        await K.ouvrir({ depart: { x: o.x + 100 - 1.5 * sc, y: o.y, cap: 90 }, tuiles: false, commandes: "pave" });
        // Rayon horizontal à 1 m du sol, de la position de départ vers le pilier : la face vue est à 1 m.
        const r = K.rayon(o.x + 100 - 1.5 * sc, o.y, 1.0, [1, 0, 0]);
        const x0 = K.etat().pos.x;
        let refus = 0;
        for (let i = 0; i < 12; i++) { if (!K.avancer(0.25)) refus++; }
        const x1 = K.etat().pos.x;
        await K.fermer();
        return { refus: refus, x0: +(x0 / sc).toFixed(2), x1: +(x1 / sc).toFixed(2), xBord: +((o.x + 100 - sc / 2) / sc).toFixed(2),
          vu: r && r.vu ? { dist: +r.vu.dist.toFixed(2), mat: r.vu.mat } : null };
      });
      verifier(m3.refus > 0 && m3.x1 < m3.xBord, "vue 3D : la marche s'arrête devant le pilier à bras", m3);
      verifier(!!m3.vu && Math.abs(m3.vu.dist - 1) < 0.1, "vue 3D : un bloc dressé, sa face vue à 1 m du départ", m3);
    });

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
  console.log("🎉 CHECKUP VERT — le pilier à bras se pose d'un clic, se voit (carte, légende, filtres, export), compte au " +
    "volume, bloque le pas comme un pilier et laisse passer l'itinéraire.");
  process.exit(0);
})();
