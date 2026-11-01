#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-mur-dessous.js — checkup (Playwright) : un mur est dessiné SOUS les piliers et fronts de son niveau
// =====================================================================
// Objets FICTIFS posés près du centre du relevé fictif (sinon du premier plan de l'index), multi-niveau forcé en
// mémoire. Un calque de données factice (JSON servi par une URL blob:) et la session se croisent :
//   A mur de session × pilier de calque · B mur de calque × pilier de session · C1 mur en ligne de session ×
//   front de calque · C2 mur en ligne de calque × front de session · D mur de session au niveau 1 × pilier de
//   calque niveau 0 (le mur reste DESSUS : autre niveau) et × pilier de calque niveau 1 (le mur passe dessous).
// Preuves : index dans la liste de dessin du renderer canvas et couleur du pixel au croisement, après le 1er
// rendu, après un re-rendu de session, après une bascule du calque ; largeur des fronts et filtre de niveau
// toujours actifs ; puis la couleur du pixel dans l'export image (PNG / PDF) et dans l'export rapide.
// Usage : node scripts/smoke/checkup-mur-dessous.js (SMOKE_PORT pour une autre copie) · code :
// js/structures.js > ktaMursSousPiliers · doc : docs/architecture/rendering-leaflet.md
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

// Croisements : [nom, type du mur, type du dessus, point (relatif à l'origine), le mur doit-il être dessous ?]
// null = autre niveau : la règle ne s'en mêle pas, l'ordre reste celui d'arrivée (session ou calque en dernier).
// Vérifié seulement aux étapes où cet ordre met le mur dessus : la règle ne doit pas l'avoir descendu.
const CROISEMENTS = [
  ["A mur de session × pilier de calque",           "mur",       "pilier-1", [50, 50],   true],
  ["B mur de calque × pilier de session",           "mur",       "pilier-1", [150, 50],  true],
  ["C1 mur en ligne de session × front de calque",  "mur-ligne", "front-1",  [250, 50],  true],
  ["C2 mur en ligne de calque × front de session",  "mur-ligne", "front-2",  [350, 50],  true],
  ["D mur niveau 1 × pilier de calque niveau 0",    "mur",       "pilier-1", [450, 50],  null],
  ["D mur niveau 1 × pilier de calque niveau 1",    "mur",       "pilier-2", [450, 150], true]
];

function rect(o, x1, y1, x2, y2) {
  return [{ x: o.x + x1, y: o.y + y1 }, { x: o.x + x2, y: o.y + y1 }, { x: o.x + x2, y: o.y + y2 }, { x: o.x + x1, y: o.y + y2 }];
}
function ligne(o, x1, y1, x2, y2) { return [{ x: o.x + x1, y: o.y + y1 }, { x: o.x + x2, y: o.y + y2 }]; }

function objets(o) {
  const session = [
    { uid: "st_ckm_a_mur", type: "mur", level: 0, points: rect(o, 0, 40, 100, 60) },
    { uid: "st_ckm_b_pil", type: "pilier-1", level: 0, points: rect(o, 120, 20, 180, 80) },
    { uid: "st_ckm_c1_ml", type: "mur-ligne", level: 0, points: ligne(o, 200, 50, 300, 50) },
    { uid: "st_ckm_c2_fr", type: "front-2", level: 0, points: ligne(o, 350, 0, 350, 100) },
    { uid: "st_ckm_d_mur", type: "mur", level: 1, points: rect(o, 440, 0, 460, 200) }
  ];
  const calque = [
    { uid: "st_ckm_a_pil", type: "pilier-1", level: 0, points: rect(o, 20, 20, 80, 80) },
    { uid: "st_ckm_b_mur", type: "mur", level: 0, points: rect(o, 100, 40, 200, 60) },
    { uid: "st_ckm_c1_fr", type: "front-1", level: 0, points: ligne(o, 250, 0, 250, 100) },
    { uid: "st_ckm_c2_ml", type: "mur-ligne", level: 0, points: ligne(o, 300, 50, 400, 50) },
    { uid: "st_ckm_d_p0", type: "pilier-1", level: 0, points: rect(o, 420, 20, 480, 80) },
    { uid: "st_ckm_d_p1", type: "pilier-2", level: 1, points: rect(o, 420, 120, 480, 180) }
  ];
  return { session: session, calque: calque };
}

// Lecture sur la CARTE : index de dessin et pixel du canvas pour chaque croisement.
function lireCarte(page, origine) {
  return page.evaluate(function (args) {
    const o = args.o, CR = args.CR;
    const m = window.map, r = m._renderer;
    const H = window.PLAN_CONFIG.plan.imageHeight;
    const liste = [];
    for (let n = r._drawFirst; n; n = n.next) liste.push(n.layer);
    function indexDe(type, pt) {
      for (let i = 0; i < liste.length; i++) {
        const l = liste[i];
        if (!l.options || l.options.ktaStructType !== type || !l.getLatLngs) continue;
        if (l.options.opacity === 0 && l.options.fillOpacity === 0) continue;
        // Couche de test qui couvre le croisement (boîte englobante).
        const flat = [].concat.apply([], [].concat(l.getLatLngs()));
        const xs = flat.map(function (q) { return q.lng; }), ys = flat.map(function (q) { return H - q.lat; });
        if (Math.min.apply(null, xs) <= pt[0] && Math.max.apply(null, xs) >= pt[0] &&
            Math.min.apply(null, ys) <= pt[1] && Math.max.apply(null, ys) >= pt[1]) return i;
      }
      return -1;
    }
    const ctx = r._container.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const out = [];
    CR.forEach(function (c) {
      const pt = [o.x + c[3][0], o.y + c[3][1]];
      const im = indexDe(c[1], pt), id = indexDe(c[2], pt);
      const p = m.latLngToLayerPoint(window.convertCoord(pt[0], pt[1])).subtract(r._bounds.min);
      const d = ctx.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data;
      // Autres couches peintes sur ce pixel (plan, ghosts exclus) : le pixel ne prouverait rien.
      const lp = m.latLngToLayerPoint(window.convertCoord(pt[0], pt[1]));
      const autres = liste.filter(function (l, i) {
        return i !== im && i !== id && l._pxBounds && l._pxBounds.contains(lp) && l.options && l.options.opacity > 0;
      }).length;
      out.push({ nom: c[0], mur: im, dessus: id, px: [d[0], d[1], d[2]], autres: autres });
    });
    return out;
  }, { o: origine, CR: CROISEMENTS });
}

// Couleurs attendues (résolveur) : le pixel doit être plus proche du composé « dessus sur mur » que de l'inverse.
function couleurs(page) {
  return page.evaluate(function () {
    const c = {};
    ["mur", "mur-ligne", "pilier-1", "pilier-2", "front-1", "front-2"].forEach(function (t) {
      const s = window.ktaResolveStyle("structures", t, { flat: true });
      c[t] = { c: s.isPolyline ? s.color : s.fillColor, a: s.isPolyline ? (s.opacity == null ? 1 : s.opacity) : s.fillOpacity };
    });
    return c;
  });
}
function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
function sur(haut, bas, fond) {
  const b = hex(bas.c).map(function (v, i) { return bas.a * v + (1 - bas.a) * fond[i]; });
  return hex(haut.c).map(function (v, i) { return haut.a * v + (1 - haut.a) * b[i]; });
}
function dist(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); }
// true si le pixel montre le « dessus » par-dessus le mur ; fonds possibles : transparent (noir), blanc.
function dessusGagne(px, C, typeMur, typeDessus) {
  const fonds = [[0, 0, 0], [255, 255, 255]];
  const dD = Math.min.apply(null, fonds.map(function (f) { return dist(px, sur(C[typeDessus], C[typeMur], f)); }));
  const dM = Math.min.apply(null, fonds.map(function (f) { return dist(px, sur(C[typeMur], C[typeDessus], f)); }));
  return dD < dM;
}

// `murArriveApres` : à cette étape, le mur niveau 1 arrive après le pilier niveau 0 (cas null vérifiable).
function autreNiveau(etape, r, i, murArriveApres, detail) {
  if (CROISEMENTS[i][4] !== null || murArriveApres) return false;
  console.log("  ℹ️ " + etape + " · " + r.nom + " : non vérifié (ordre d'arrivée, autre niveau) " + detail);
  return true;
}

function controlerCarte(etape, res, C, murArriveApres) {
  res.forEach(function (r, i) {
    if (autreNiveau(etape, r, i, murArriveApres, "index " + r.mur + " / " + r.dessus)) return;
    const attenduDessous = CROISEMENTS[i][4] === true;
    const ordreOk = r.mur >= 0 && r.dessus >= 0 && ((r.mur < r.dessus) === attenduDessous);
    verifier(ordreOk, etape + " · " + r.nom + " : mur " + (attenduDessous ? "dessous" : "dessus") +
      " (index " + r.mur + " / " + r.dessus + ")", r);
  });
}

function controlerPixels(etape, res, C, murArriveApres) {
  res.forEach(function (r, i) {
    if (autreNiveau(etape, r, i, murArriveApres, "pixel " + JSON.stringify(r.px))) return;
    const attenduDessous = CROISEMENTS[i][4] === true;
    const gagne = dessusGagne(r.px, C, CROISEMENTS[i][1], CROISEMENTS[i][2]);
    verifier(gagne === attenduDessous, etape + " · " + r.nom + " : pixel " + JSON.stringify(r.px) +
      " = " + (gagne ? CROISEMENTS[i][2] : CROISEMENTS[i][1]) + " dessus", r);
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
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && typeof window.majLargeurFronts === "function";
    }, 40000);
    await page.waitForTimeout(1500);

    // Origine : près du centre, zoom maximal (traits larges, pixel net).
    const origine = await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
      const H = window.PLAN_CONFIG.plan.imageHeight, W = window.PLAN_CONFIG.plan.imageWidth;
      window.APP_CONFIG.multiLevel = true;          // en mémoire seulement
      window.APP_CONFIG.visibleLevels = [0, 1];
      window.APP_CONFIG.activeLevel = 0;
      const o = { x: Math.max(10, Math.round(W / 2) - 250), y: Math.max(10, Math.round(H / 2) - 100) };
      window.map.setView(window.convertCoord(o.x + 250, o.y + 100), window.map.getMaxZoom(), { animate: false });
      return o;
    });
    const ob = objets(origine);

    // Calque factice servi par une URL blob: (aucun fichier écrit), déclaré au plan-config EN MÉMOIRE pour les exports.
    await page.evaluate(function (calque) {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ data: [], structures: calque })], { type: "application/json" }));
      window.__ckmUrl = url;
      const g = window.L.layerGroup().addTo(window.map);
      window.dataLayerGroups = window.dataLayerGroups || {};
      window.dataLayerGroups["ck-mur"] = g;
      window.PLAN_CONFIG.dataLayers = (window.PLAN_CONFIG.dataLayers || []).concat([{ id: "ck-mur", file: url, label: "ck" }]);
      window.ajouterPointsDepuisJSON(url, g);
    }, ob.calque);
    await attendre(page, function () {
      return (window._ktaDataStructurePolygons || []).filter(function (e) { return /^st_ckm/.test(e.uid || ""); }).length === 6;
    }, 10000);
    // Session APRÈS le calque : ses murs arrivent au bout de la liste, au-dessus des piliers du calque.
    await page.evaluate(function (session) { window.setStructures(session); }, ob.session);
    await page.waitForTimeout(400);

    const C = await couleurs(page);
    let res = await lireCarte(page, origine);
    controlerCarte("carte, 1er rendu", res, C, true);
    const masques = res.filter(function (r) { return r.autres > 0; });
    if (masques.length) console.log("  ⚠️ des boîtes englobantes d'autres couches du plan couvrent " + masques.length + " croisement(s)");
    controlerPixels("carte, 1er rendu", res, C, true);

    // Re-rendu de session (chaque modification) : ses couches repartent au bout.
    await page.evaluate(function () { window.renderStructures(); });
    await page.waitForTimeout(300);
    res = await lireCarte(page, origine);
    controlerCarte("carte, session redessinée", res, C, true);
    controlerPixels("carte, session redessinée", res, C, true);

    // Bascule du calque (⊞ Calques) : ses couches repartent au bout, au-dessus des piliers de session.
    await page.evaluate(function () {
      const g = window.dataLayerGroups["ck-mur"];
      window.map.removeLayer(g); window.map.addLayer(g);
    });
    await page.waitForTimeout(300);
    res = await lireCarte(page, origine);
    controlerCarte("carte, calque rebasculé", res, C, false);
    controlerPixels("carte, calque rebasculé", res, C, false);

    // Largeurs au zoom : le front de session et celui du calque suivent toujours la loi.
    const larg = await page.evaluate(function () {
      const m = window.map;
      m.setZoom(m.getMaxZoom() - 1, { animate: false });
      window.majLargeurFronts();
      const loi = window.ktaLargeurFrontPourRatio(Math.pow(2, m.getZoom()));
      const w = [];
      for (let n = m._renderer._drawFirst; n; n = n.next) {
        const op = n.layer.options;
        if (op && (op.ktaStructType === "front-1" || op.ktaStructType === "front-2")) w.push(op.weight);
      }
      m.setZoom(m.getMaxZoom(), { animate: false });
      window.majLargeurFronts();
      return { loi: loi, w: w };
    });
    verifier(larg.w.length >= 2 && larg.w.every(function (v) { return v === larg.loi; }),
      "largeur des fronts au zoom : loi tenue après réordonnancement", larg);

    // Filtre de niveau : niveau 1 masqué → le mur niveau 1 disparaît (session non rendue, calque à opacité 0).
    const filtre = await page.evaluate(function () {
      window.APP_CONFIG.visibleLevels = [0];
      window.appliquerFiltreNiveau();
      let murN1 = 0, pilN1Visible = 0;
      for (let n = window.map._renderer._drawFirst; n; n = n.next) {
        const op = n.layer.options;
        if (op && op.ktaStructType === "mur" && op.ktaStructNiveau === 1) murN1++;
        if (op && op.ktaStructType === "pilier-2" && op.ktaStructNiveau === 1 && (op.fillOpacity > 0 || op.opacity > 0)) pilN1Visible++;
      }
      window.APP_CONFIG.visibleLevels = [0, 1];
      window.appliquerFiltreNiveau();
      return { murN1: murN1, pilN1Visible: pilN1Visible };
    });
    verifier(filtre.murN1 === 0 && filtre.pilN1Visible === 0, "filtre de niveau : le niveau 1 masqué disparaît", filtre);
    await page.waitForTimeout(300);
    res = await lireCarte(page, origine);
    controlerCarte("carte, après filtre de niveau (session redessinée)", res, C, true);

    // ── Export image (pipeline commun PNG / PDF) : seulement le calque factice et la session, fond blanc ──
    const exp = await page.evaluate(async function (args) {
      const o = args.o, CR = args.CR;
      const cv = await window.MyKTAMapExporterGenererCanvas({ ann: { points: false, roads: false, zones: false, structures: true },
        scale: 1, bg: "white", includeImgLayers: false, dataLayers: { "ck-mur": true } });
      const ctx = cv.getContext("2d");
      const sx = cv.width / window.PLAN_CONFIG.plan.imageWidth;
      return CR.map(function (c) {
        const d = ctx.getImageData(Math.round((o.x + c[3][0]) * sx), Math.round((o.y + c[3][1]) * sx), 1, 1).data;
        return { nom: c[0], px: [d[0], d[1], d[2]] };
      });
    }, { o: origine, CR: CROISEMENTS });
    controlerPixels("export image (PNG / PDF)", exp, C, false);   // session peinte avant les calques

    // ── Export rapide (telechargerPlan) : calques du plan masqués, canvas saisi avant l'encodage ──
    const rap = await page.evaluate(async function (args) {
      const o = args.o, CR = args.CR;
      const caches = [];
      Object.keys(window.dataLayerGroups).forEach(function (id) {
        const g = window.dataLayerGroups[id];
        if (id !== "ck-mur" && g && window.map.hasLayer(g)) { window.map.removeLayer(g); caches.push(g); }
      });
      const roads = window.getRoads ? window.getRoads().slice() : [];
      const zones = window.getZones ? window.getZones().slice() : [];
      const orig = HTMLCanvasElement.prototype.toBlob;
      let saisi = null;
      HTMLCanvasElement.prototype.toBlob = function (cb) { saisi = this; cb(new Blob(["x"])); };
      const clic = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      try { await window.telechargerPlan(); } finally {
        HTMLCanvasElement.prototype.toBlob = orig;
        HTMLAnchorElement.prototype.click = clic;
        caches.forEach(function (g) { window.map.addLayer(g); });
      }
      if (!saisi) return { erreur: "canvas non saisi" };
      const ctx = saisi.getContext("2d");
      return { roads: roads.length, zones: zones.length, px: CR.map(function (c) {
        const d = ctx.getImageData(o.x + c[3][0], o.y + c[3][1], 1, 1).data;
        return { nom: c[0], px: [d[0], d[1], d[2]] };
      }) };
    }, { o: origine, CR: CROISEMENTS });
    if (rap.erreur) pb("export rapide : " + rap.erreur);
    else controlerPixels("export rapide", rap.px, C, true);   // calques puis session

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
  console.log("🎉 CHECKUP VERT — murs sous les piliers et fronts de leur niveau, à l'écran et dans les exports.");
  process.exit(0);
})();
