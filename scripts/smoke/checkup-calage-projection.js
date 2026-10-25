#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-calage-projection.js — checkup (Playwright, pas un hook pré-commit) : calage en vraie projection
// =====================================================================
// Relevé fictif rendu LOCAL, « vérité terrain » fictive : le plan est une similitude du sol (0,25 m/px, tourné de
// 17°), posée par le plan tangent du moteur. Par l'interface et les modules réels :
//   • calage HISTORIQUE (sans `modele`, comme un plan déjà calé) : écart mesuré aux coins, réenregistré sans
//     changement → il reste historique ; Réglages > Géoréférencement annonce « approchée, ± X » et le bouton ;
//   • « Recaler en projection exacte » : la confirmation annonce le déplacement, le calage passe en "local",
//     l'écran annonce « exacte » ; coins sous 5 cm de la vérité ;
//   • main.js > _accorderModeleCalage : le modèle "local" gagne dans les deux sens (localStorage ⇄ PLAN_CONFIG) ;
//   • Vue OSM (emprise), KMZ, GPX, GeoJSON, GeoTIFF WGS84 et Lambert 93 : points et coins au sol, avant / après.
// Usage : node scripts/smoke/checkup-calage-projection.js (SMOKE_PORT pour une autre copie) ·
//   doc : docs/ETUDE_CALAGE_PROJECTION.md
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
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
const m = (v) => (v == null ? "?" : v.toFixed(3)) + " m";

async function ouvrirFictif(page) {
  return page.evaluate(async function () {
    const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
    if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
    const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
    const zip = new JSZip();
    const chemins = [cfg.plan.baseImage, cfg.plan.collisionImage]
      .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
      .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
    for (const p of Array.from(new Set(chemins))) {
      const r = await fetch(window.resolveServerPath(p, srv.path));
      if (r.ok) zip.file(p, await r.blob());
    }
    delete cfg.plan.georef;   // le checkup pose son propre calage
    zip.file("plan-config.json", JSON.stringify(cfg));
    const blob = await zip.generateAsync({ type: "blob" });
    await window.chargerZipFichier(new File([blob], "fictif-calage.zip", { type: "application/zip" }), "auto", { storeBlob: true });
    return { ok: true };
  });
}

// Vérité et mesures, dans la page (fonctions posées sur window.__ck).
async function poserOutils(page) {
  await page.evaluate(function () {
    const KE = window.KmzExport, k = 0.25, rot = 17 * Math.PI / 180, lat0 = 46.2, lng0 = 4.1;
    const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
    function vrai(x, y) {
      const u = (x - W / 2) * k, v = -(y - H / 2) * k;
      return KE.decalerGps(lat0, lng0, u * Math.cos(rot) - v * Math.sin(rot), u * Math.sin(rot) + v * Math.cos(rot));
    }
    function pt(x, y) { return Object.assign({ x: x, y: y }, vrai(x, y)); }
    const coins = [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]];
    window.__ck = {
      W: W, H: H, vrai: vrai,
      historique: { pointA: pt(W * 0.1, H * 0.9), pointB: pt(W * 0.9, H * 0.1) },
      // Écart au sol, max aux 4 coins et au centre, du calage enregistré.
      ecartCoins: function () {
        const t = KE.buildTransformCalib(KE.getCalibration(window._currentLoadedPlanId));
        return coins.reduce(function (mx, c) {
          return Math.max(mx, KE.distanceM(KE.planToGps(t, c[0], c[1]), vrai(c[0], c[1])));
        }, 0);
      },
      // Pour chaque position lue dans un export, distance à la vérité du point du plan le plus proche.
      ecartPoints: function (lus, pts) {
        let mx = 0;
        lus.forEach(function (ll) {
          let best = Infinity;
          pts.forEach(function (p) { best = Math.min(best, KE.distanceM(ll, vrai(p.x, p.y))); });
          mx = Math.max(mx, best);
        });
        return mx;
      }
    };
  });
}

async function ouvrirGeoref(page) {
  await page.evaluate(async function () {
    const s = document.getElementById("kta-cfg-georef-modal"); if (s && s._ktaFermer) s._ktaFermer();
    if (!document.getElementById("kta-cfg-modal")) window.afficherConfig();
    await new Promise(function (r) { setTimeout(r, 500); });
    document.getElementById("cfg_georef_open").click();
    await new Promise(function (r) { setTimeout(r, 400); });
  });
  return page.evaluate(function () {
    const bloc = document.getElementById("cfg_kmz_precision_bloc"), btn = document.getElementById("cfg_kmz_recaler");
    return { visible: !!bloc && bloc.offsetHeight > 0, texte: (document.getElementById("cfg_kmz_precision") || {}).textContent || "",
             bouton: !!btn && btn.offsetHeight > 0,
             approche: window.I18n.t("config.georef.precisionHistorique", { d: "§" }).split("§")[0],
             exacte: window.I18n.t("config.georef.precisionLocal", { d: "§" }).split("§")[0] };
  });
}

// Exports par les modules réels : positions WGS84 lues dans chaque fichier, comparées à la vérité.
async function mesurerExports(page) {
  return page.evaluate(async function () {
    const KE = window.KmzExport, ck = window.__ck;
    const t = KE.buildTransformCalib(KE.getCalibration(window._currentLoadedPlanId));
    const pts = (window.getAllEmbeddedPoints() || []).filter(function (p) { return Number.isFinite(p.x) && Number.isFinite(p.y); });
    const r = { nPoints: pts.length };
    // KMZ (doc.kml)
    const kml = KE.genererKml({ planName: "ck", planVersion: "v", planAuthor: "", imageW: ck.W, imageH: ck.H, transform: t,
      include: { image: false, points: true, roads: false, zones: false, structures: false }, imageBaseUrl: null,
      data: { editorPoints: pts } });
    const llKml = Array.from(kml.matchAll(/<Point>[\s\S]*?<coordinates>([-\d.]+),([-\d.]+)/g))
      .map(function (q) { return { lat: +q[2], lng: +q[1] }; });
    r.kml = { n: llKml.length, ecart: ck.ecartPoints(llKml, pts) };
    // GPX (téléchargement intercepté)
    const orig = URL.createObjectURL, clic = HTMLAnchorElement.prototype.click;
    let gpxBlob = null;
    URL.createObjectURL = function (b) { if (b && /gpx/.test(b.type || "")) gpxBlob = b; return orig.call(URL, b); };
    HTMLAnchorElement.prototype.click = function () {};
    try { window.GpxIO.exporter({ incPoints: false, incEmbedded: true, incRoads: false }); }
    finally { URL.createObjectURL = orig; HTMLAnchorElement.prototype.click = clic; }
    const gpx = gpxBlob ? await gpxBlob.text() : "";
    const llGpx = Array.from(gpx.matchAll(/<wpt lat="([-\d.]+)" lon="([-\d.]+)"/g)).map(function (q) { return { lat: +q[1], lng: +q[2] }; });
    r.gpx = { n: llGpx.length, ecart: ck.ecartPoints(llGpx, pts) };
    // GeoJSON WGS84
    const fc = window.GeojsonExport.generer({ transform: t, epsg: 4326, include: { points: true },
                                              data: { editorPoints: pts } });
    const llGj = (fc.features || []).filter(function (f) { return f.geometry && f.geometry.type === "Point"; })
      .map(function (f) { return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }; });
    r.geojson = { n: llGj.length, ecart: ck.ecartPoints(llGj, pts) };
    // GeoTIFF : coins du fichier relu par l'import de l'app
    for (const epsg of [4326, 2154]) {
      const g = await window.GeotiffExport.generer({ contenu: "scan", epsg: epsg, facteur: 0.25 });
      const ifd = window.TiffGeoref._interne.lireIfd0(await g.blob.arrayBuffer());
      const monde = window.TiffGeoref._interne.mondeDePixel(ifd.tags, true);
      const versLl = epsg === 4326 ? function (X, Y) { return { lat: Y, lng: X }; }
                                   : function (X, Y) { return window.SigImport.L93.versWgs84(X, Y); };
      const w = ifd.tags[256][0], h = ifd.tags[257][0], s = w / ck.W;
      let mx = 0;
      [[0, 0], [ck.W, 0], [0, ck.H], [ck.W, ck.H]].forEach(function (c) {
        const q = monde(c[0] * s, c[1] * s);
        mx = Math.max(mx, KE.distanceM(versLl(q.X, q.Y), ck.vrai(c[0], c[1])));
      });
      r["tiff" + epsg] = { ecart: mx, residu: g.residuM };
    }
    // Vue OSM : emprise du plan (4 coins) contre celle de la vérité
    const bb = window.OsmView.getPlanGpsBbox();
    let lat = [], lng = [];
    [[0, 0], [ck.W, 0], [0, ck.H], [ck.W, ck.H]].forEach(function (c) { const v = ck.vrai(c[0], c[1]); lat.push(v.lat); lng.push(v.lng); });
    r.osm = bb ? Math.max(
      KE.distanceM(bb.getSouthWest(), { lat: Math.min.apply(null, lat), lng: Math.min.apply(null, lng) }),
      KE.distanceM(bb.getNorthEast(), { lat: Math.max.apply(null, lat), lng: Math.max.apply(null, lng) })) : null;
    return r;
  });
}

function rapporterExports(etiquette, r, plafond) {
  verifier(r.kml.n > 0 && r.kml.ecart < plafond, etiquette + " KMZ : " + r.kml.n + " points, écart max " + m(r.kml.ecart), r.kml);
  verifier(r.gpx.n > 0 && r.gpx.ecart < plafond, etiquette + " GPX : " + r.gpx.n + " points, écart max " + m(r.gpx.ecart), r.gpx);
  verifier(r.geojson.n > 0 && r.geojson.ecart < plafond, etiquette + " GeoJSON : " + r.geojson.n + " points, écart max " +
    m(r.geojson.ecart), r.geojson);
  verifier(r.tiff4326.ecart < Math.max(plafond, 0.5), etiquette + " GeoTIFF WGS84 : coins à " + m(r.tiff4326.ecart) +
    " (résidu de l'affine " + m(r.tiff4326.residu) + ")", r.tiff4326);
  verifier(r.tiff2154.ecart < Math.max(plafond, 0.5), etiquette + " GeoTIFF Lambert 93 : coins à " + m(r.tiff2154.ecart) +
    " (résidu " + m(r.tiff2154.residu) + ")", r.tiff2154);
  verifier(r.osm != null && r.osm < plafond, etiquette + " Vue OSM : emprise du plan à " + m(r.osm) + " de la vérité", r.osm);
}

async function scenario(page) {
  const ouvert = await ouvrirFictif(page);
  if (!ouvert.ok) throw new Error(ouvert.raison);
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.APP_CONFIG.imageWidth; }, 60000);
  await page.waitForTimeout(2000);
  await poserOutils(page);

  // ── Calage historique (plan déjà calé) ──
  const avant = await page.evaluate(function () {
    window.KmzExport.setCalibration(window._currentLoadedPlanId, window.__ck.historique);
    return { ecart: window.__ck.ecartCoins(), W: window.__ck.W, H: window.__ck.H };
  });
  console.log("     plan fictif " + avant.W + " × " + avant.H + " px = " + Math.round(avant.W * 0.25) + " × " +
              Math.round(avant.H * 0.25) + " m au sol");
  verifier(avant.ecart > 0.5, "calage historique : écart à la vérité aux coins " + m(avant.ecart) + " (le défaut est là)", avant);
  const e1 = await ouvrirGeoref(page);
  verifier(e1.visible && e1.texte.indexOf(e1.approche) === 0 && e1.bouton,
    "Réglages : « " + e1.texte + " » et bouton « Recaler » visible", e1);

  // Réenregistrer sans rien changer : le modèle ne change pas, rien ne bouge.
  const resave = await page.evaluate(async function () {
    document.getElementById("cfg_kmz_save").click();
    await new Promise(function (r) { setTimeout(r, 300); });
    return window.KmzExport.getCalibration(window._currentLoadedPlanId).modele || null;
  });
  verifier(resave === null, "Enregistrer sans modification : le calage reste historique", resave);
  rapporterExports("avant recalage —", await mesurerExports(page), Infinity);

  // ── Recalage annoncé ──
  await ouvrirGeoref(page);
  const annonce = await page.evaluate(async function () {
    const KE = window.KmzExport, ck = window.__ck;
    const attendu = window.formatDistance(KE.ecartRecalage(KE.getCalibration(window._currentLoadedPlanId), ck.W, ck.H), 1);
    document.getElementById("cfg_kmz_recaler").click();
    await new Promise(function (r) { setTimeout(r, 400); });
    const oui = document.getElementById("kta-confirm-oui");
    const texte = oui ? oui.closest(".kta-readme-modal-overlay").textContent : "";
    if (oui) oui.click();
    await new Promise(function (r) { setTimeout(r, 400); });
    return { attendu: attendu, annonce: texte.indexOf(attendu) >= 0, texte: texte.slice(0, 160),
             modele: KE.getCalibration(window._currentLoadedPlanId).modele };
  });
  verifier(annonce.annonce, "Recaler : la confirmation annonce le déplacement (" + annonce.attendu + ")", annonce);
  verifier(annonce.modele === "local", "après confirmation : calage au modèle \"local\"", annonce.modele);
  const e2 = await page.evaluate(function () {
    return { texte: document.getElementById("cfg_kmz_precision").textContent,
             bouton: document.getElementById("cfg_kmz_recaler").offsetHeight > 0,
             exacte: window.I18n.t("config.georef.precisionLocal", { d: "§" }).split("§")[0],
             ecart: window.__ck.ecartCoins() };
  });
  verifier(e2.texte.indexOf(e2.exacte) === 0 && !e2.bouton, "Réglages : « " + e2.texte + " », bouton masqué", e2);
  verifier(e2.ecart < 0.05, "calage local : écart à la vérité aux coins " + m(e2.ecart), e2.ecart);
  rapporterExports("après recalage —", await mesurerExports(page), 0.05);

  // ── Propagation : le modèle local gagne dans les deux sens ──
  const prop = await page.evaluate(function () {
    const KE = window.KmzExport, id = window._currentLoadedPlanId, ck = window.__ck;
    const plan = window.PLAN_CONFIG.plan, sauve = plan.georef;
    plan.georef = JSON.parse(JSON.stringify(ck.historique));       // ZIP au calage historique, LS recalé
    window._propagerGeorefVersKmzExport(id);
    const sens1 = plan.georef.modele || null;
    KE.setCalibration(id, ck.historique);                           // LS historique, ZIP régénéré en local
    plan.georef = Object.assign(JSON.parse(JSON.stringify(ck.historique)), { modele: KE.MODELE_LOCAL });
    window._propagerGeorefVersKmzExport(id);
    const sens2 = KE.getCalibration(id).modele || null;
    plan.georef = sauve;
    return { sens1: sens1, sens2: sens2 };
  });
  verifier(prop.sens1 === "local", "plan recalé, ZIP historique : PLAN_CONFIG suit le modèle local (Vue OSM, Secours)", prop);
  verifier(prop.sens2 === "local", "ZIP régénéré en local, localStorage historique : le localStorage suit", prop);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 }, acceptDownloads: false });
  page.setDefaultTimeout(300000);
  // 🔒 Aucune tuile OSM réelle : le checkup ne mesure que des coordonnées.
  await page.route(/tile\.openstreetmap\.org/, function (r) { return r.abort(); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await scenario(page);
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — recalage annoncé puis appliqué, exports et Vue OSM au sol à < 5 cm.");
  process.exit(0);
})();
