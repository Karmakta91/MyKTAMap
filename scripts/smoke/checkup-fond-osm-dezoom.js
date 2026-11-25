#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-fond-osm-dezoom.js — garde-fou : délai d'affichage du fond sous le plan au dézoom sur PC (js/fondOsmPlan.js)
// =====================================================================
// Écran PC 1920 × 1080, relevé fictif, calage fictif prêté EN MÉMOIRE (en mer, près de 0°/0°, comme checkup-fond-osm).
// Réseau OSM simulé : aucune requête ne sort, le harnais sert un PNG fabriqué après un délai variable et déterministe
// (graine KTA_GRAINE) : 80 à 400 ms la première fois qu'une URL est servie, 5 à 25 ms ensuite (cache disque du
// navigateur, que page.route coupe). Passes : dézoom 0 → −2, rezoom −2 → 0, dézoom 0 → −2.
// Mesuré dans la page (crochets posés par le harnais, rien dans le produit) : drawImage des canvas du fond, tileload de
// la couche, durée des OsmTilesCache.getCachedTile ; temps comptés depuis la fin de l'animation de zoom.
// D1 aucune tuile ne garde du contenu dessiné en restant invisible (canvas posé avant la plus lente de ses images) ·
// D2 délai moyen avant contenu visible, par tuile · D3 rezoom puis dézoom : les images déjà vues sont reprises en
//   mémoire, presque aucune requête, affichage complet rapide · D4 cache plafonné à 200 images sur PC, à 48 au téléphone
//   émulé (pointeur grossier, écran 390 × 844, quatre zooms parcourus), jamais dépassé · D5 réseau permis et rien
//   d'enregistré : aucune lecture IndexedDB ; contre-essai, une tuile enregistrée et les lectures reprennent.
// Usage : node scripts/smoke/checkup-fond-osm-dezoom.js   (SMOKE_PORT pour une copie de travail ;
//   KTA_DEZOOM_JSON=<fichier> : chiffres bruts écrits dans ce fichier)
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const GRAINE = parseInt(process.env.KTA_GRAINE, 10) || 20261125;
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1",
  "myktamap_fond_carte_v1": "osm"
};
const RE_OSM = /^https:\/\/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/;
const ZOOM_HAUT = 0, ZOOM_BAS = -2;

// Seuils : écartés des valeurs mesurées des deux côtés (avant / après). 🩸 Les temps absolus suivent la charge du
// poste (affichage complet de 425 à 573 ms d'une passe à l'autre, même graine) : D2 et D3 sont des RAPPORTS au temps
// d'affichage complet de la passe 1, qui encaissent cette charge. Mesuré : D2 0,87 avant, 0,41 à 0,51 après ;
// D3 0,23 avant, 0,03 après ; D1 300 ms avant, 0 après.
const SEUIL_INVISIBLE_MS = 60;      // D1 : contenu dessiné mais tuile cachée, au pire
const SEUIL_VISIBLE_RAPPORT = 0.7;  // D2 : délai moyen avant contenu visible / affichage complet, passe 1
const SEUIL_REQUETES_P3 = 0.15;     // D3 : images hors cache RAM de la passe 3 / de la passe 1
const SEUIL_COMPLET_P3 = 0.12;      // D3 : affichage complet de la passe 3 / de la passe 1

function planFictif() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const p = ((idx && idx.plans) || []).find(function (x) { return /fictif/i.test(x.name || ""); });
    return p ? p.name : null;
  } catch (e) { return null; }
}

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }
function verifier(c, m, detail) {
  if (c) ok(m); else pb(m + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
}

// ── PNG fabriqué (RGB 8 bits, sans dépendance) ──────────
const TABLE_CRC = (function () {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let r = 0xffffffff; for (const x of b) r = TABLE_CRC[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; }
function bloc(type, d) {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(type), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([l, td, c]);
}
function png(rgb) {
  const w = 256, h = 256, brut = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3;
    brut[o] = rgb[0]; brut[o + 1] = rgb[1]; brut[o + 2] = rgb[2];
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc("IHDR", ih),
    bloc("IDAT", zlib.deflateSync(brut)), bloc("IEND", Buffer.alloc(0))]);
}
const PNG_DAMIER = [png([150, 200, 150]), png([160, 190, 230])];

// Délai déterministe d'une URL : hash FNV-1a de (graine, url, rang du service) → [0, 1).
function alea(url, rang) {
  let h = 2166136261 ^ GRAINE;
  const s = url + "#" + rang;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Réseau OSM simulé, compté par passe.
function reseauSimule(page) {
  const vus = new Map();   // url → nombre de fois servie
  const r = { enVol: 0, servies: 0, premieres: 0, delais: [] };
  page.route(RE_OSM, function (route) {
    const url = route.request().url();
    const m = RE_OSM.exec(url);
    const rang = vus.get(url) || 0;
    vus.set(url, rang + 1);
    const delai = rang === 0 ? 80 + Math.round(320 * alea(url, 0)) : 5 + Math.round(20 * alea(url, rang));
    r.enVol++; r.servies++; if (rang === 0) r.premieres++;
    r.delais.push(delai);
    setTimeout(function () {
      route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" },
                      body: PNG_DAMIER[(+m[2] + +m[3]) & 1] })
        .catch(function () {}).then(function () { r.enVol--; });
    }, delai);
  });
  r.remettre = function () { r.servies = 0; r.premieres = 0; r.delais = []; };
  return r;
}

// Page sur le relevé fictif, pré-gates passées. opts : { mobile }.
async function ouvrir(nav, nom, opts) {
  const o = opts || {};
  const ctx = await nav.newContext(o.mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: "block" }
    : { viewport: { width: 1920, height: 1080 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e)); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const reseau = reseauSimule(page);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(nom, { exact: false }).first().click();
  await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
  await page.waitForTimeout(2000);
  return { ctx: ctx, page: page, reseau: reseau, erreurs: erreurs };
}

// Calage fictif prêté en mémoire (modèle local, similitude 2 points), en mer.
function preterCalage() {
  const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
  window.PLAN_CONFIG.plan.georef = {
    pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
    pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2.4e-6 },
    modele: "local"
  };
  if (window.FondOsmPlan) window.FondOsmPlan.majBouton();
}

// Crochets de mesure (dans la page, posés par le harnais) : dessins par canvas, tuiles de la couche, lectures IDB.
function poserCrochets() {
  const M = window.__mesure = { dessins: new WeakMap(), tuiles: [], idb: [], t0: 0, zoomFin: 0 };
  performance.setResourceTimingBufferSize(5000);
  const proto = CanvasRenderingContext2D.prototype, orig = proto.drawImage;
  proto.drawImage = function () {
    const c = this.canvas, t = performance.now();
    const d = M.dessins.get(c);
    if (d) { d.dernier = t; d.n++; } else M.dessins.set(c, { premier: t, dernier: t, n: 1 });
    return orig.apply(this, arguments);
  };
  const cache = window.OsmTilesCache, lire = cache.getCachedTile;
  cache.getCachedTile = function () {
    const t = performance.now();
    return lire.apply(cache, arguments).then(function (b) { M.idb.push({ debut: t, fin: performance.now(), trouve: !!b }); return b; });
  };
  window.map.on("zoomend", function () { M.zoomFin = performance.now(); });
}
function brancherCouche() {
  const M = window.__mesure;
  let couche = null;
  window.map.eachLayer(function (l) { if (l.options && l.options.pane === "ktaFondOsm" && l.createTile) couche = l; });
  if (!couche) return false;
  if (couche.__mesure) return true;
  couche.__mesure = true;
  couche.on("tileloadstart", function (e) {
    M.tuiles.push({ el: e.tile, z: e.coords.z, debut: performance.now(), charge: null });
  });
  couche.on("tileload", function (e) {
    for (let i = M.tuiles.length - 1; i >= 0; i--) if (M.tuiles[i].el === e.tile) { M.tuiles[i].charge = performance.now(); break; }
  });
  return true;
}

// Toutes les tuiles du zoom courant dans l'écran sont chargées, rien n'est dessiné depuis `calme` ms.
function etatPasse(calme) {
  const M = window.__mesure, c = window.map.getContainer().getBoundingClientRect();
  const z = Math.round(window.map.getZoom());
  const dansEcran = M.tuiles.filter(function (t) {
    if (t.z !== z || !t.el.isConnected || t.debut < M.t0) return false;
    const r = t.el.getBoundingClientRect();
    return r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom;
  });
  let dernier = 0;
  dansEcran.forEach(function (t) { const d = M.dessins.get(t.el); if (d) dernier = Math.max(dernier, d.dernier); });
  return {
    n: dansEcran.length, charges: dansEcran.filter(function (t) { return t.charge != null; }).length,
    calme: dernier > 0 && performance.now() - dernier > calme
  };
}

// Chiffres d'une passe, temps depuis la fin de l'animation de zoom (zoomend).
function chiffresPasse() {
  const M = window.__mesure, c = window.map.getContainer().getBoundingClientRect();
  const z = Math.round(window.map.getZoom()), ref = M.zoomFin || M.t0;
  const tuiles = M.tuiles.filter(function (t) {
    if (t.z !== z || !t.el.isConnected || t.debut < M.t0) return false;
    const r = t.el.getBoundingClientRect();
    return r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom;
  });
  const visibles = [], complets = [], invisibles = [], etalements = [];
  let vides = 0;
  tuiles.forEach(function (t) {
    const d = M.dessins.get(t.el);
    if (!d || t.charge == null) { vides++; return; }
    visibles.push(Math.max(d.premier, t.charge) - ref);
    complets.push(Math.max(d.dernier, t.charge) - ref);
    invisibles.push(Math.max(0, t.charge - d.premier));
    etalements.push(d.dernier - d.premier);
  });
  const moy = function (a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null; };
  const max = function (a) { return a.length ? Math.max.apply(null, a) : null; };
  const min = function (a) { return a.length ? Math.min.apply(null, a) : null; };
  const idb = M.idb.filter(function (e) { return e.debut >= M.t0; });
  const durIdb = idb.map(function (e) { return e.fin - e.debut; });
  const res = performance.getEntriesByType("resource").filter(function (e) {
    return /tile\.openstreetmap\.org/.test(e.name) && e.startTime >= M.t0;
  });
  const et = window.FondOsmPlan.etat();
  return {
    zoom: z, animationMs: Math.round(ref - M.t0), tuiles: tuiles.length, vides: vides,
    premierMs: min(visibles), visibleMoyenMs: moy(visibles), completMs: max(complets),
    invisibleMaxMs: max(invisibles), invisibleMoyenMs: moy(invisibles), etalementMoyenMs: moy(etalements),
    idb: { n: idb.length, totalMs: durIdb.reduce(function (s, v) { return s + v; }, 0), maxMs: max(durIdb),
           moyenMs: moy(durIdb), trouvees: idb.filter(function (e) { return e.trouve; }).length },
    reseauPage: { n: res.length, moyenMs: moy(res.map(function (e) { return e.duration; })),
                  maxMs: max(res.map(function (e) { return e.duration; })) },
    imagesEnMemoire: et.imagesEnMemoire, cacheRam: et.cacheRam, requetesModule: et.requetesReseau
  };
}

// zoom null : pas de changement de zoom, attente de l'affichage en cours (départ, compté depuis l'allumage).
async function passe(page, reseau, zoom, nom) {
  reseau.remettre();
  const avant = await page.evaluate(function (z) {
    const M = window.__mesure;
    M.zoomFin = 0;
    const n = window.FondOsmPlan.etat().requetesReseau;
    if (z == null) return n;
    M.t0 = performance.now();
    performance.clearResourceTimings();
    window.map.setZoom(z);   // animé, comme un cran de molette
    return n;
  }, zoom);
  const fin = Date.now() + 20000;
  let e = null;
  while (Date.now() < fin) {
    await page.waitForTimeout(100);
    e = await page.evaluate(etatPasse, 600);
    if (e.n > 0 && e.charges === e.n && e.calme && reseau.enVol === 0) break;
  }
  const c = await page.evaluate(chiffresPasse);
  // images redemandées par le module (hors cache RAM) : le cache mémoire du navigateur peut servir l'URL sans que le
  // harnais la voie, le compteur du module, lui, compte chaque image hors cache RAM
  c.horsCacheRam = c.requetesModule - avant;
  c.reseau = { servies: reseau.servies, premieres: reseau.premieres,
               delaiMoyenMs: reseau.delais.length ? reseau.delais.reduce(function (s, v) { return s + v; }, 0) / reseau.delais.length : null };
  const r = function (v) { return v == null ? "—" : Math.round(v); };
  inf(nom + " (zoom " + c.zoom + ", " + c.tuiles + " tuiles à l'écran, animation " + c.animationMs + " ms) : " +
      "premier contenu " + r(c.premierMs) + " ms, visible moyen " + r(c.visibleMoyenMs) + " ms, complet " + r(c.completMs) +
      " ms ; contenu caché max " + r(c.invisibleMaxMs) + " ms (moyen " + r(c.invisibleMoyenMs) + ")");
  inf("   réseau : " + c.reseau.servies + " requêtes (" + c.reseau.premieres + " neuves, délai moyen " + r(c.reseau.delaiMoyenMs) +
      " ms, " + c.horsCacheRam + " images hors cache RAM) ; IDB : " + c.idb.n + " lectures, " + r(c.idb.moyenMs) + " ms en moyenne, max " + r(c.idb.maxMs) +
      " ; écart première → dernière image d'une tuile " + r(c.etalementMoyenMs) + " ms ; images en mémoire " +
      c.imagesEnMemoire + " / " + c.cacheRam);
  return c;
}

async function preparer(page) {
  await page.evaluate(preterCalage);
  await page.evaluate(poserCrochets);
  await page.evaluate(function (z) { window.map.setZoom(z, { animate: false }); }, ZOOM_HAUT);
  await page.evaluate(function () { window.FondOsmPlan.allumer(); window.FondOsmPlan.regler(100); });
  await attendre(page, brancherCouche, 5000);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const toutesErreurs = [];
  const brut = { graine: GRAINE };
  try {
    const nom = planFictif();
    if (!nom) { pb("relevé fictif absent de data/index.json"); return; }

    console.log("— PC 1920 × 1080 : dézoom, rezoom, dézoom (réseau OSM simulé, graine " + GRAINE + ") —");
    let s = await ouvrir(nav, nom);
    let page = s.page;
    await preparer(page);
    // état de départ : zoom 0 entièrement affiché
    await passe(page, s.reseau, null, "départ");
    const p1 = await passe(page, s.reseau, ZOOM_BAS, "P1 dézoom");
    const p2 = await passe(page, s.reseau, ZOOM_HAUT, "P2 rezoom");
    const p3 = await passe(page, s.reseau, ZOOM_BAS, "P3 dézoom");
    brut.pc = { p1: p1, p2: p2, p3: p3 };

    verifier(p1.tuiles > 0 && p1.vides === 0 && p3.vides === 0, "toutes les tuiles à l'écran finissent dessinées",
      { p1: { tuiles: p1.tuiles, vides: p1.vides }, p3: { tuiles: p3.tuiles, vides: p3.vides } });
    const invMax = Math.max(p1.invisibleMaxMs, p2.invisibleMaxMs, p3.invisibleMaxMs);
    verifier(invMax < SEUIL_INVISIBLE_MS,
      "D1 aucune tuile ne reste cachée avec du contenu dessiné (< " + SEUIL_INVISIBLE_MS + " ms)", Math.round(invMax));
    const rapportVisible = p1.visibleMoyenMs / p1.completMs;
    verifier(rapportVisible < SEUIL_VISIBLE_RAPPORT,
      "D2 dézoom réseau neuf : chaque tuile se montre bien avant la fin du chargement (délai moyen / complet < " +
      SEUIL_VISIBLE_RAPPORT + ")", { rapport: +rapportVisible.toFixed(2), visibleMoyen: Math.round(p1.visibleMoyenMs),
      complet: Math.round(p1.completMs) });
    verifier(p3.horsCacheRam <= SEUIL_REQUETES_P3 * p1.horsCacheRam,
      "D3 second dézoom : images reprises du cache RAM (redemandées ≤ " + Math.round(SEUIL_REQUETES_P3 * 100) + " % du premier)",
      { p1: p1.horsCacheRam, p3: p3.horsCacheRam });
    verifier(p3.completMs < SEUIL_COMPLET_P3 * p1.completMs,
      "D3 second dézoom : affichage complet en moins de " + Math.round(SEUIL_COMPLET_P3 * 100) + " % du premier",
      { p1: Math.round(p1.completMs), p3: Math.round(p3.completMs) });
    verifier(p1.cacheRam === 200 && Math.max(p1.imagesEnMemoire, p2.imagesEnMemoire, p3.imagesEnMemoire) <= 200,
      "D4 PC : cache de 200 images, jamais dépassé", { cache: p1.cacheRam, p3: p3.imagesEnMemoire });
    verifier(p1.idb.n === 0, "D5 réseau permis, rien d'enregistré : aucune lecture IndexedDB au dézoom", p1.idb.n);
    // contre-essai : une tuile enregistrée, la lecture IndexedDB revient (rallumage = nouveau compte)
    await page.evaluate(async function () {
      window.FondOsmPlan.eteindre();
      const c = document.createElement("canvas"); c.width = 256; c.height = 256;
      const blob = await new Promise(function (r) { c.toBlob(r, "image/png"); });
      const db = await new Promise(function (res, rej) {
        const q = indexedDB.open("myktamap_osm_tiles");
        q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
      });
      await new Promise(function (res, rej) {
        const tx = db.transaction("tiles", "readwrite");
        tx.objectStore("tiles").put({ key: "0/0/0", blob: blob, addedAt: new Date().toISOString() });
        tx.oncomplete = res; tx.onerror = rej;
      });
      window.__mesure.idb = [];
      window.FondOsmPlan.allumer();
    });
    await attendre(page, brancherCouche, 5000);
    await page.waitForTimeout(1500);
    const idbAvecTuile = await page.evaluate(async function () {
      const n = window.__mesure.idb.length;
      window.FondOsmPlan.eteindre();
      await window.OsmTilesCache.clear();
      return n;
    });
    verifier(idbAvecTuile > 0, "D5 contre-essai : une tuile enregistrée, les lectures IndexedDB reprennent", idbAvecTuile);
    toutesErreurs.push.apply(toutesErreurs, s.erreurs);
    await s.ctx.close();

    console.log("— Téléphone émulé (pointeur grossier, 390 × 844) : cache inchangé —");
    s = await ouvrir(nav, nom, { mobile: true });
    page = s.page;
    const media = await page.evaluate(function () {
      return { fin: matchMedia("(pointer: fine)").matches, grossier: matchMedia("(pointer: coarse)").matches,
               ecran: screen.width + "×" + screen.height };
    });
    inf("pointeur fin " + media.fin + ", grossier " + media.grossier + ", écran " + media.ecran);
    await preparer(page);
    await passe(page, s.reseau, null, "départ");
    // quatre zooms parcourus : plus de 48 images vues, le plafond doit servir
    const zMin = await page.evaluate(function () { return Math.max(window.map.getMinZoom(), -4); });
    const m1 = await passe(page, s.reseau, ZOOM_BAS, "M1 dézoom");
    const m2 = await passe(page, s.reseau, zMin, "M2 dézoom");
    const m3 = await passe(page, s.reseau, ZOOM_HAUT, "M3 rezoom");
    const m4 = await passe(page, s.reseau, 2, "M4 zoom");
    brut.mobile = { media: media, m1: m1, m2: m2, m3: m3, m4: m4 };
    const vues = [m1, m2, m3, m4].reduce(function (n, m) { return n + m.horsCacheRam; }, 0);
    const maxMem = Math.max(m1.imagesEnMemoire, m2.imagesEnMemoire, m3.imagesEnMemoire, m4.imagesEnMemoire);
    verifier(media.grossier && !media.fin, "émulation : pointeur grossier", media);
    verifier(m1.cacheRam === 48 && maxMem <= 48 && vues > 48,
      "D4 téléphone : cache de 48 images (inchangé), plein mais jamais dépassé après " + vues + " images chargées",
      { cache: m1.cacheRam, max: maxMem, vues: vues });
    verifier([m1, m2, m3, m4].every(function (m) { return m.vides === 0; }),
      "téléphone : toutes les tuiles à l'écran finissent dessinées", [m1.vides, m2.vides, m3.vides, m4.vides]);
    toutesErreurs.push.apply(toutesErreurs, s.erreurs);
    await s.ctx.close();

    const utiles = toutesErreurs.filter(function (e) { return !/swRegister|serviceWorker/i.test(e); });
    verifier(utiles.length === 0, "aucune erreur de page", utiles.slice(0, 3));
  } catch (e) {
    pb("exception : " + (e && e.stack || e));
  } finally {
    if (process.env.KTA_DEZOOM_JSON) {
      try { fs.writeFileSync(process.env.KTA_DEZOOM_JSON, JSON.stringify(brut, null, 2)); } catch (e) { /* diagnostic seul */ }
    }
    await nav.close();
    server.close();
    console.log(problemes.length ? "\n❌ " + problemes.length + " problème(s)" : "\n✅ Fond sous le plan : dézoom sur PC");
    process.exit(problemes.length ? 1 : 0);
  }
})();
