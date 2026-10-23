#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-export-sig.js — checkup (Playwright, pas un hook pré-commit) : exports GeoTIFF et GeoJSON
// =====================================================================
// Relevé fictif rendu LOCAL (ZIP construit dans la page) avec un calque fabriqué (types intégrés,
// personnalisés et bruts), calé par 3 points de test (A, B, C : calage tourné, affine). Puis, par l'interface :
//   • ⬆️ Exporter : tuile GeoTIFF dans la section Image, tuile GeoJSON dans Export externe ;
//   • GeoTIFF scan seul en Lambert 93, puis scan + dessins en WGS84 : relus par js/tiffGeoref.js
//     (dimensions annoncées, tuiles, Deflate, EPSG), 3 coins et A / B / C à < 1 m ; le scan seul n'a pas la
//     couleur d'une structure personnalisée, le scan + dessins l'a ; le GeoTIFF Lambert 93 tourné se
//     RÉIMPORTE (TiffGeoref.lire : A, B, C posés, 4 coins à < 1 m) ;
//   • plan non calé : bouton Télécharger désactivé, explication visible ;
//   • GeoJSON (Export externe) : image et légende du KMZ masquées, nombre d'objets par famille = nombre de
//     Placemarks du KMZ exporté avec les mêmes cases ; Lambert 93 avec `crs`, WGS84 sans.
// SIG_PLAN_ZIP=<archive> : en plus, mesure sur ce plan (taille, durée, mémoire du navigateur, en pleine
//   résolution et plafonnée « téléphone ») ; SEULS des chiffres sortent, jamais un nom ni une coordonnée.
// SIG_SORTIE=<dossier> : y écrit les fichiers produits (pour gdalinfo).
// Usage : node scripts/smoke/checkup-export-sig.js (SMOKE_PORT pour une autre copie) · doc : exports.md
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};
const COUL_PIL = "#3344ee";   // structure personnalisée, loin de la charte : reconnue au pixel

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Mémoire (Mo) de l'arbre de processus du navigateur (Windows) ; null ailleurs.
function memoireArbre(pidRacine) {
  if (process.platform !== "win32" || !pidRacine) return null;
  try {
    const sortie = execFileSync("powershell.exe", ["-NoProfile", "-Command",
      "$p=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize;" +
      "$ids=@(" + pidRacine + ");$n=0;while($n -ne $ids.Count){$n=$ids.Count;" +
      "$ids=@($ids + ($p | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object ProcessId)) | Sort-Object -Unique};" +
      "($p | Where-Object { $ids -contains $_.ProcessId } | Measure-Object WorkingSetSize -Sum).Sum"],
      { encoding: "utf8", timeout: 15000 });
    return Math.round(Number(sortie.trim()) / 1048576);
  } catch (e) { return null; }
}

async function capturerBlob(page, declencher, motif, delai) {
  await page.evaluate(function (m) {
    window.__sigBlob = null;
    if (!window.__sigOrigUrl) {
      window.__sigOrigUrl = URL.createObjectURL;
      window.__sigOrigClic = HTMLAnchorElement.prototype.click;
    }
    URL.createObjectURL = function (b) {
      if (b && new RegExp(m).test(b.type || "")) window.__sigBlob = b;
      return window.__sigOrigUrl.call(URL, b);
    };
    HTMLAnchorElement.prototype.click = function () { window.__sigNom = this.download; };
  }, motif);
  await declencher();
  await attendre(page, function () { return !!window.__sigBlob; }, delai || 120000);
  return page.evaluate(function () {
    URL.createObjectURL = window.__sigOrigUrl;
    HTMLAnchorElement.prototype.click = window.__sigOrigClic;
    return { taille: window.__sigBlob.size, nom: window.__sigNom || "" };
  });
}

// Un gros fichier n'est écrit que tronqué (`max` octets) : l'IFD est en tête, gdalinfo en lit le calage.
async function sauver(page, nom, max) {
  const dossier = process.env.SIG_SORTIE;
  if (!dossier) return;
  const b64 = await page.evaluate(async function (m) {
    const b = window.__sigBlob;
    const u = new Uint8Array(await (m ? b.slice(0, Math.min(b.size, m)) : b).arrayBuffer());
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }, max || 0);
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, nom), Buffer.from(b64, "base64"));
}

// Relecture d'un GeoTIFF par le lecteur de l'app : en-tête, calage (coins et points du calage), pixels.
async function relireTiff(page, decoder) {
  return page.evaluate(async function (dec) {
    const TG = window.TiffGeoref._interne, KE = window.KmzExport;
    const buf = await window.__sigBlob.arrayBuffer();
    const ifd = TG.lireIfd0(buf), t = ifd.tags;
    const epsg = TG.epsgDeGeoKeys(t[34735]);
    const monde = TG.mondeDePixel(t, true);
    const versLl = epsg === 4326 ? function (X, Y) { return { lat: Y, lng: X }; }
                                 : function (X, Y) { return window.SigImport.L93.versWgs84(X, Y); };
    const w = t[256][0], h = t[257][0];
    const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight, r = w / W;
    const tr = KE.buildTransformCalib(KE.getCalibration(window._currentLoadedPlanId));
    function dist(a, b) {
      const lat = (a.lat + b.lat) / 2;
      return Math.hypot((a.lat - b.lat) * 110540, (a.lng - b.lng) * 111320 * Math.cos(lat * Math.PI / 180));
    }
    function lu(x, y) { const q = monde(x * r, y * r); return versLl(q.X, q.Y); }
    const coins = [[0, 0], [W, 0], [0, H]].map(function (c) { return dist(lu(c[0], c[1]), KE.planToGps(tr, c[0], c[1])); });
    const cal = KE.getCalibration(window._currentLoadedPlanId);
    const pts = ["pointA", "pointB", "pointC"].filter(function (k) { return cal[k]; })
      .map(function (k) { return dist(lu(cal[k].x, cal[k].y), cal[k]); });
    const res = { w: w, h: h, epsg: epsg, compression: t[259][0], tuile: [t[322][0], t[323][0]],
                  nTuiles: t[324].length, attenduTuiles: Math.ceil(w / 256) * Math.ceil(h / 256),
                  modele: t[34264] ? "matrice" : "tiepoint", coins: coins, pointsCalage: pts };
    if (dec) {
      const img = await TG.decoderPixels(buf, ifd);
      res.decode = img.width === w && img.height === h;
      const s = (window.getAllEmbeddedStructures() || []).find(function (o) { return o.type === "cust-ckpil"; });
      if (s) {
        const x = s.points.reduce(function (a, p) { return a + p.x; }, 0) / s.points.length;
        const y = s.points.reduce(function (a, p) { return a + p.y; }, 0) / s.points.length;
        const i = (Math.round(y * r) * w + Math.round(x * r)) * 4;
        res.pixelPilier = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]];
      }
    }
    return res;
  }, decoder);
}

function ecart(p, hex) {
  if (!p) return Infinity;
  const c = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
  return Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]);
}
function proche(p, hex) { return ecart(p, hex) < 60; }

async function ouvrirFictif(page) {
  return page.evaluate(async function (C) {
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
    const img = new Image();
    img.src = window.resolveServerPath(cfg.plan.baseImage, srv.path);
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const pas = Math.floor(Math.min(W, H) / 20), x0 = Math.floor(W / 2 - 4 * pas), y0 = Math.floor(H / 2 - 4 * pas);
    function carre(i, j) {
      const x = x0 + i * pas, y = y0 + j * pas, d = Math.floor(pas * 0.7);
      return [{ x: x, y: y }, { x: x + d, y: y }, { x: x + d, y: y + d }, { x: x, y: y + d }];
    }
    function trait(i, j) { const x = x0 + i * pas, y = y0 + j * pas; return [{ x: x, y: y }, { x: x + Math.floor(pas * 0.8), y: y }]; }
    const structures = [
      { type: "pilier-1", points: carre(0, 0) }, { type: "front-1", points: trait(3, 0) },
      { type: "cust-ckpil", points: carre(0, 1) }, { type: "ckbrut", points: trait(3, 1).concat([{ x: x0 + 3 * pas + Math.floor(pas * 0.8), y: y0 + pas + Math.floor(pas * 0.5) }]) }
    ].map(function (s) { s.level = 0; return s; });
    const roads = [{ type: "principal", points: trait(0, 3) }, { type: "ckbrut", points: trait(2, 3) }]
      .map(function (s) { s.level = 0; return s; });
    const zones = [{ type: "eau", points: carre(0, 4) }, { type: "ckbrut", points: carre(2, 4) }]
      .map(function (s) { s.level = 0; return s; });
    const data = [{ id: "ck-1", nom: "ck 1", tags: ["puits"], x: x0, y: y0 + 6 * pas, level: 0, description: "note ck" },
                  { id: "ck-2", nom: "ck 2", tags: [], x: x0 + 20, y: y0 + 7 * pas, level: 0 }];
    zip.file("checkup/calque.json", JSON.stringify({ data: data, roads: roads, zones: zones, structures: structures }));
    cfg.dataLayers = (cfg.dataLayers || []).concat([{ id: "ck-calque", label: "Calque checkup", file: "checkup/calque.json", visible: true }]);
    cfg.plan.customLegend = { customEntries: [
      { id: "cust-ckpil", category: "structures", label: "Pilier checkup", geometry: "polygon", fillColor: C, borderColor: C }
    ] };
    zip.file("plan-config.json", JSON.stringify(cfg));
    const blob = await zip.generateAsync({ type: "blob" });
    await window.chargerZipFichier(new File([blob], "fictif-sig.zip", { type: "application/zip" }), "auto", { storeBlob: true });
    return { ok: true };
  }, COUL_PIL);
}

// Calage de TEST (près de l'origine du Lambert 93) : tourné, 3 points → affine.
async function caler(page) {
  await page.evaluate(function () {
    const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight, k = 0.25;   // ≈ 0,25 m/px
    const lat0 = 46.5, lng0 = 3.0, kLng = 111320 * Math.cos(lat0 * Math.PI / 180), kLat = 110540;
    const rot = 17 * Math.PI / 180;
    function gps(x, y) {
      const e = (x * Math.cos(rot) + y * Math.sin(rot)) * k, n = (x * Math.sin(rot) - y * Math.cos(rot)) * k;
      return { x: x, y: y, lat: lat0 + n / kLat, lng: lng0 + e / kLng };
    }
    window.KmzExport.setCalibration(window._currentLoadedPlanId,
      { pointA: gps(W * 0.1, H * 0.9), pointB: gps(W * 0.9, H * 0.1), pointC: gps(W * 0.85, H * 0.8) });
  });
}

async function scenarioFictif(page) {
  const ouvert = await ouvrirFictif(page);
  if (!ouvert.ok) throw new Error(ouvert.raison);
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map &&
      (window.getAllEmbeddedStructures() || []).some(function (e) { return e.type === "cust-ckpil"; });
  }, 60000);
  await page.waitForTimeout(2000);
  await caler(page);

  // ── Lanceur ⬆️ Exporter ──
  const lanceur = await page.evaluate(async function () {
    const titre = window.I18n.t("ui.group.save");
    const bouton = Array.from(document.querySelectorAll("a[role='button'], a")).find(function (a) {
      return (a.getAttribute("title") || "") === titre || (a.getAttribute("aria-label") || "") === titre;
    });
    if (!bouton) return { ok: false };
    bouton.click();
    await new Promise(function (r) { setTimeout(r, 600); });
    const m = document.getElementById("kta-export-lanceur");
    if (!m) return { ok: false, raison: "modale absente" };
    const texte = m.textContent;   // pas innerText : les titres de section sont transformés en capitales
    const pos = function (cle) { return texte.indexOf(window.I18n.t(cle)); };
    const res = { ok: true, image: pos("export.lanceur.sectionImage"), session: pos("export.lanceur.sectionSession"),
      externe: pos("export.lanceur.sectionExterne"), geotiff: pos("export.lanceur.geotiff"),
      geojson: pos("export.lanceur.geojson"), kmz: pos("export.lanceur.kmz") };
    const tuile = Array.from(m.querySelectorAll(".kta-tracker-modal-tile, button, a")).find(function (b) {
      return b.textContent.indexOf(window.I18n.t("export.lanceur.geotiff")) >= 0;
    });
    if (tuile) tuile.click();
    await new Promise(function (r) { setTimeout(r, 600); });
    res.modaleGeotiff = !!document.getElementById("kta-geotiff-modal");
    return res;
  });
  verifier(lanceur.ok && lanceur.image >= 0 && lanceur.geotiff > lanceur.image && lanceur.geotiff < lanceur.session,
    "⬆️ Exporter : tuile GeoTIFF dans la section Image", lanceur);
  verifier(lanceur.ok && lanceur.geojson > lanceur.externe && lanceur.geojson > lanceur.kmz,
    "⬆️ Exporter : tuile GeoJSON dans Export externe, après le KMZ", lanceur);
  verifier(lanceur.modaleGeotiff, "la tuile GeoTIFF ouvre sa fenêtre");

  // ── GeoTIFF scan seul, Lambert 93 (défauts de la fenêtre) ──
  const info = await page.evaluate(function () {
    const el = document.getElementById("kta-geotiff-info");
    const go = document.getElementById("kta-geotiff-go");
    const v = function (n) { const e = document.querySelector('input[name="' + n + '"]:checked'); return e && e.value; };
    return { info: el && el.textContent, goActif: go && !go.disabled, contenu: v("geotiff_contenu"), proj: v("geotiff_proj"),
             resol: v("geotiff_resol"), nonCale: !!document.getElementById("kta-geotiff-noncale") };
  });
  verifier(info.goActif && !info.nonCale && info.contenu === "scan" && info.proj === "2154",
    "fenêtre GeoTIFF : plan calé, défauts scan seul + Lambert 93, résolution annoncée", info);
  const t1 = Date.now();
  const f1 = await capturerBlob(page, function () {
    return page.evaluate(function () { document.getElementById("kta-geotiff-go").click(); });
  }, "tiff");
  const d1 = Date.now() - t1;
  await sauver(page, "fictif_scan_L93.tif");
  const r1 = await relireTiff(page, true);
  const annonce = /(\d+) × (\d+)/.exec(info.info || "");
  verifier(!!annonce && r1.w === +annonce[1] && r1.h === +annonce[2], "scan L93 : dimensions = celles annoncées (" + r1.w + " × " + r1.h + ")", { annonce: info.info, lu: [r1.w, r1.h] });
  verifier(r1.epsg === 2154 && r1.compression === 8 && r1.tuile[0] === 256 && r1.nTuiles === r1.attenduTuiles && r1.decode,
    "scan L93 : relu par tiffGeoref.js (EPSG 2154, Deflate, " + r1.nTuiles + " tuiles 256, pixels décodés)", r1);
  verifier(r1.coins.every(function (d) { return d < 1; }), "scan L93 : 3 coins à < 1 m (" + r1.coins.map(function (d) { return d.toFixed(3); }).join(" / ") + " m)", r1.coins);
  verifier(r1.pointsCalage.length === 3 && r1.pointsCalage.every(function (d) { return d < 1; }),
    "scan L93 : points A, B, C du calage à < 1 m (" + r1.pointsCalage.map(function (d) { return d.toFixed(3); }).join(" / ") + " m)", r1.pointsCalage);
  verifier(r1.modele === "matrice", "scan L93 : plan tourné → ModelTransformation", r1.modele);
  verifier(!proche(r1.pixelPilier, COUL_PIL), "scan seul : la structure personnalisée n'y est PAS", r1.pixelPilier);
  verifier(/_L93\.tif$/.test(f1.nom), "nom du fichier : suffixe _L93", f1.nom);
  console.log("     ↳ " + r1.w + " × " + r1.h + " px, " + (f1.taille / 1048576).toFixed(2) + " Mo, " + d1 + " ms");

  // ── Réimport du GeoTIFF tourné (chemin de l'import : TiffGeoref.lire, comme le Générateur) ──
  const ri = await page.evaluate(async function () {
    const KE = window.KmzExport;
    try {
      const res = await window.TiffGeoref.lire(new File([window.__sigBlob], "reimport.tif", { type: "image/tiff" }));
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight, r = res.width / W;
      const trLu = KE.buildTransformCalib(res.georef);
      const tr = KE.buildTransformCalib(KE.getCalibration(window._currentLoadedPlanId));
      function dist(a, b) {
        const lat = (a.lat + b.lat) / 2;
        return Math.hypot((a.lat - b.lat) * 110540, (a.lng - b.lng) * 111320 * Math.cos(lat * Math.PI / 180));
      }
      const coins = [[0, 0], [W, 0], [0, H], [W, H]].map(function (c) {
        return dist(KE.planToGps(trLu, c[0] * r, c[1] * r), KE.planToGps(tr, c[0], c[1]));
      });
      return { ok: true, c: !!res.georef.pointC, coins: coins, png: !!(res.blob && res.blob.size) };
    } catch (e) { return { ok: false, err: e.message }; }
  });
  verifier(ri.ok && ri.c && ri.png && ri.coins.every(function (d) { return d < 1; }),
    "réimport du GeoTIFF Lambert 93 tourné : accepté, A / B / C posés, 4 coins à < 1 m (" +
    (ri.coins ? ri.coins.map(function (d) { return d.toFixed(3); }).join(" / ") : "?") + " m)", ri);

  // ── GeoTIFF scan + dessins, WGS84 ──
  await page.evaluate(function () {
    window.GeotiffExport.afficherModale();
    document.querySelector('input[name="geotiff_contenu"][value="dessins"]').click();
    document.querySelector('input[name="geotiff_proj"][value="4326"]').click();
  });
  const f2 = await capturerBlob(page, function () {
    return page.evaluate(function () { document.getElementById("kta-geotiff-go").click(); });
  }, "tiff");
  await sauver(page, "fictif_dessins_WGS84.tif");
  const r2 = await relireTiff(page, true);
  verifier(r2.epsg === 4326 && r2.decode && r2.nTuiles === r2.attenduTuiles, "scan + dessins WGS84 : relu (EPSG 4326, " + r2.w + " × " + r2.h + ")", r2);
  verifier(r2.coins.every(function (d) { return d < 1; }) && r2.pointsCalage.every(function (d) { return d < 1; }),
    "scan + dessins WGS84 : coins et A / B / C à < 1 m", { coins: r2.coins, calage: r2.pointsCalage });
  // Remplissage semi-opaque posé sur le scan : le pixel doit s'être nettement rapproché de la couleur.
  verifier(ecart(r2.pixelPilier, COUL_PIL) < ecart(r1.pixelPilier, COUL_PIL) - 60,
    "scan + dessins : la structure personnalisée est dessinée à sa couleur", { scan: r1.pixelPilier, dessins: r2.pixelPilier });
  verifier(/_WGS84\.tif$/.test(f2.nom), "nom du fichier : suffixe _WGS84", f2.nom);

  // ── Plan non calé ──
  const nc = await page.evaluate(function () {
    const id = window._currentLoadedPlanId, sauv = window.KmzExport.getCalibration(id);
    window.KmzExport.setCalibration(id, null);
    window.GeotiffExport.afficherModale();
    const go = document.getElementById("kta-geotiff-go"), msg = document.getElementById("kta-geotiff-noncale");
    const res = { desactive: !!go && go.disabled, message: !!msg && msg.offsetHeight > 0 && msg.textContent.length > 20 };
    document.getElementById("kta-geotiff-close").click();
    window.KmzExport.setCalibration(id, sauv);
    return res;
  });
  verifier(nc.desactive && nc.message, "plan non calé : Télécharger désactivé, explication visible", nc);

  // ── GeoJSON et KMZ avec les mêmes cases ──
  async function exporterExterne(fmt, proj) {
    await page.evaluate(function (a) {
      window.ouvrirExportSessionModal("extern", false, { format: a.fmt });
    }, { fmt: fmt });
    await page.waitForTimeout(1500);
    const vue = await page.evaluate(function (p) {
      const img = document.getElementById("kmz_inc_image"), leg = document.getElementById("kmz_inc_legend");
      if (img && img.checked && img.offsetParent) img.click();
      if (p) { const r = document.querySelector('input[name="geojson_proj"][value="' + p + '"]'); if (r) r.click(); }
      return { imageVisible: !!(img && img.offsetParent), legendeVisible: !!(leg && leg.offsetParent),
               projVisible: !!document.querySelector('input[name="geojson_proj"]') &&
                            !!document.querySelector('input[name="geojson_proj"]').offsetParent };
    }, proj);
    const f = await capturerBlob(page, function () {
      return page.evaluate(function () { document.getElementById("kta-ses-download").click(); });
    }, fmt === "kmz" ? "kmz|zip" : "geo\\+json");
    return { vue: vue, f: f };
  }
  const gL = await exporterExterne("geojson", "2154");
  verifier(!gL.vue.imageVisible && !gL.vue.legendeVisible && gL.vue.projVisible,
    "GeoJSON : cases du KMZ sans l'image ni la légende, choix de projection visible", gL.vue);
  await sauver(page, "fictif_L93.geojson");
  const jL = await page.evaluate(async function () { return JSON.parse(await window.__sigBlob.text()); });
  const fam = function (fc) { const o = {}; fc.features.forEach(function (x) { o[x.properties.famille] = (o[x.properties.famille] || 0) + 1; }); return o; };
  const famL = fam(jL);
  const k = await exporterExterne("kmz", null);
  const kmz = await page.evaluate(async function () {
    const zip = await JSZip.loadAsync(window.__sigBlob);
    const doc = new DOMParser().parseFromString(await zip.file("doc.kml").async("string"), "application/xml");
    const o = {};
    Array.from(doc.getElementsByTagName("Folder")).forEach(function (f) {
      const nom = f.getElementsByTagName("name")[0].textContent;
      const fam = /Structures/.test(nom) ? "structure" : /Tracés/.test(nom) ? "trace" : /Zones/.test(nom) ? "zone"
                : /Points/.test(nom) ? "point" : /Jonctions/.test(nom) ? "jonction" : /Itinéraire/.test(nom) ? "itineraire" : null;
      if (!fam) return;
      o[fam] = (o[fam] || 0) + Array.from(f.children).filter(function (c) { return c.tagName === "Placemark"; }).length;
    });
    return o;
  });
  const familles = ["point", "trace", "zone", "structure", "jonction", "itineraire"];
  verifier(k.f.taille > 0 && familles.every(function (x) { return (famL[x] || 0) === (kmz[x] || 0); }) && (famL.structure || 0) >= 4,
    "GeoJSON = KMZ, famille par famille (" + familles.map(function (x) { return x + " " + (famL[x] || 0); }).join(", ") + ")",
    { geojson: famL, kmz: kmz });
  const pil = jL.features.find(function (x) { return x.properties.type === "cust-ckpil"; });
  verifier(!!pil && pil.properties.libelle === "Pilier checkup" && pil.geometry.type === "Polygon" &&
    (pil.properties.remplissage || "").toLowerCase() === COUL_PIL,
    "GeoJSON : type personnalisé avec son libellé de légende et sa couleur", pil && pil.properties);
  const brut = jL.features.filter(function (x) { return x.properties.type === "ckbrut"; }).map(function (x) { return x.properties.famille; }).sort();
  verifier(brut.join(",") === "structure,trace,zone", "GeoJSON : types bruts d'un calque exportés (tracé, zone, structure)", brut);
  const note = jL.features.find(function (x) { return x.properties.nom === "ck 1"; });
  verifier(!!note && note.properties.note === "note ck" && note.properties.type === "puits", "GeoJSON : point de calque avec type, nom et note", note && note.properties);
  verifier(!!jL.crs && /2154/.test(jL.crs.properties.name) && /_L93\.geojson$/.test(gL.f.nom) &&
    jL.features.every(function (x) { const c = JSON.stringify(x.geometry.coordinates).match(/-?\d+(\.\d+)?/g).map(Number); return c.every(function (v) { return Math.abs(v) > 1000; }); }),
    "GeoJSON Lambert 93 : `crs` EPSG:2154, suffixe _L93, coordonnées en mètres", { crs: jL.crs, nom: gL.f.nom });
  const gW = await exporterExterne("geojson", "4326");
  await sauver(page, "fictif_WGS84.geojson");
  const jW = await page.evaluate(async function () { return JSON.parse(await window.__sigBlob.text()); });
  const p0 = jW.features.find(function (x) { return x.geometry.type === "Point"; });
  verifier(!("crs" in jW) && /_WGS84\.geojson$/.test(gW.f.nom) && !!p0 &&
    Math.abs(p0.geometry.coordinates[0] - 3) < 1 && Math.abs(p0.geometry.coordinates[1] - 46.5) < 1 &&
    jW.features.length === jL.features.length,
    "GeoJSON WGS84 : sans `crs` (RFC 7946), [longitude, latitude], mêmes objets", { nom: gW.f.nom, p0: p0 && p0.geometry });
}

// Mesures sur un plan fourni (SIG_PLAN_ZIP) : chiffres seulement.
async function scenarioMesure(nav, page, zip) {
  console.log("\n📏 Mesures sur le plan fourni (chiffres seulement)");
  await page.evaluate(function () {
    const i = document.createElement("input"); i.type = "file"; i.id = "__sigZip"; i.style.display = "none";
    document.body.appendChild(i);
  });
  await page.setInputFiles("#__sigZip", zip);
  await page.evaluate(function () {
    const f = document.getElementById("__sigZip").files[0];
    window.chargerZipFichier(f, "auto", { storeBlob: true });
  });
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.APP_CONFIG.imageWidth; }, 300000);
  await page.waitForTimeout(5000);
  const plan = await page.evaluate(function () {
    return { W: window.APP_CONFIG.imageWidth, H: window.APP_CONFIG.imageHeight, v2: !!(window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.tiledV2),
             cale: !!window.GeotiffExport.calageDisponible() };
  });
  console.log("     plan : " + plan.W + " × " + plan.H + " px (" + Math.round(plan.W * plan.H / 1e6) + " Mpx), V2 " + plan.v2 +
              ", calé " + plan.cale + (plan.cale ? "" : " → calage de test posé"));
  if (!plan.cale) await caler(page);
  // pid du processus « browser » (CDP) : la mémoire mesurée est celle de tout son arbre (rendu, GPU…).
  let pid = null;
  try {
    const cdp = await nav.newBrowserCDPSession();
    const info = await cdp.send("SystemInfo.getProcessInfo");
    const b = (info.processInfo || []).find(function (p) { return p.type === "browser"; });
    pid = b ? b.id : null;
  } catch (e) { pid = null; }
  const cas = [
    { nom: "scan, pleine résolution, Lambert 93", contenu: "scan", telephone: false },
    { nom: "scan, plafonné téléphone (64 Mpx), Lambert 93", contenu: "scan", telephone: true },
    { nom: "scan + dessins, pleine résolution, Lambert 93", contenu: "dessins", telephone: false }
  ];
  for (const c of cas) {
    const base = memoireArbre(pid);
    let pic = base || 0, fini = false;
    const sonde = (async function () {
      while (!fini) { const m = memoireArbre(pid); if (m && m > pic) pic = m; await new Promise(function (r) { setTimeout(r, 1500); }); }
    })();
    let res;
    try {
      res = await page.evaluate(async function (a) {
        const ios = window.ktaEstIos;
        if (a.telephone) window.ktaEstIos = function () { return true; };
        const tasAvant = performance.memory ? performance.memory.usedJSHeapSize : 0;
        let tas = tasAvant;
        const t = setInterval(function () { if (performance.memory) tas = Math.max(tas, performance.memory.usedJSHeapSize); }, 250);
        try {
          const r = await window.GeotiffExport.generer({ contenu: a.contenu, epsg: 2154, facteur: 1 });
          window.__sigBlob = r.blob;
          const tete = await r.blob.slice(0, Math.min(r.blob.size, 64 * 1048576)).arrayBuffer();
          const ifd = window.TiffGeoref._interne.lireIfd0(tete);
          const cnt = ifd.tags[325].reduce(function (s, v) { return s + v; }, 0);
          return { w: r.w, h: r.h, facteur: r.facteur, octets: r.octets, dureeMs: r.dureeMs, mode: r.mode,
                   residuM: r.residuM, plafonne: r.plafonne, tasMo: Math.round(tas / 1048576),
                   tasAvantMo: Math.round(tasAvant / 1048576),
                   coherent: ifd.tags[256][0] === r.w && cnt + ifd.tags[324].reduce(function (m, v) { return Math.min(m, v); }, Infinity) === r.octets };
        } finally { clearInterval(t); window.ktaEstIos = ios; }
      }, c);
    } catch (e) { res = { erreur: e.message }; }
    fini = true; await sonde;
    if (res.erreur) { pb("mesure « " + c.nom + " » : " + res.erreur); continue; }
    console.log("     " + c.nom + " : " + res.w + " × " + res.h + " px (facteur " + res.facteur + (res.plafonne ? ", plafonné" : "") +
                "), " + (res.octets / 1048576).toFixed(1) + " Mo, " + (res.dureeMs / 1000).toFixed(1) + " s, " +
                "tas JS " + res.tasAvantMo + " → max " + res.tasMo + " Mo, navigateur " + (base || "?") + " → " + (pic || "?") + " Mo, calage " + res.mode +
                " (écart affine " + res.residuM.toFixed(3) + " m)");
    verifier(res.coherent, "mesure « " + c.nom + " » : en-tête cohérent (largeur, tuiles jointives jusqu'à la fin du fichier)", res);
    if (c.telephone) verifier(res.w * res.h <= 64 * 1024 * 1024, "plafond téléphone respecté", [res.w, res.h]);
    await sauver(page, "mesure_" + (c.telephone ? "tel" : "plein") + "_" + c.contenu + "_entete.tif", 16 * 1048576);
    await page.evaluate(function () { window.__sigBlob = null; });
  }
}

(async function main() {
  const nav = await lancerNavigateur(chromium, { args: ["--enable-precise-memory-info"] });
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 }, acceptDownloads: false });
  page.setDefaultTimeout(900000);
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
    await scenarioFictif(page);
    if (process.env.SIG_PLAN_ZIP) await scenarioMesure(nav, page, process.env.SIG_PLAN_ZIP);
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
  console.log("🎉 CHECKUP VERT — GeoTIFF relu et calé à < 1 m, GeoJSON = KMZ famille par famille.");
  process.exit(0);
})();
