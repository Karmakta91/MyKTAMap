#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-fond-osm.js — checkup de release : fond OpenStreetMap SOUS le plan (js/fondOsmPlan.js)
// =====================================================================
// Le relevé fictif n'est pas géoréférencé : le checkup lui prête un calage fictif EN MÉMOIRE (en mer, près de 0°/0°),
// jamais dans data/. Les tuiles OSM sont fabriquées ici (PNG synthétiques) : aucune requête ne sort vers le vrai
// serveur. 🩸 Service worker bloqué : sinon il fait la requête à la place de la page et page.route ne la voit pas.
// F1 bouton grisé sans géoréf, raison au survol, aucun panneau · F2 panneau ancré, interrupteur (icône rond à gauche
//   éteint, à droite allumé), attribution, fond
//   dessiné au dézoom (zoom négatif), panneau fermé sans éteindre, la fenêtre Vue OSM ne s'ouvre pas ·
// F3 transparence sur l'image du plan, fond opaque ·
// F4 calage : un point du plan tombe sur son pixel OSM à moins de 1 px au zoom max (contre-essai : pixel voisin
//   détecté) · F5 plan orienté : pane dans la rotation, point toujours juste, coins couverts · F6 éteint : canvas et
//   images libérés, opacité rendue · F7 hors ligne : tuiles enregistrées seulement, aucune requête, phrase d'état qui suit online / offline · F8 OSM refusé
//   et incognito : fond refusé, aucune requête · F9 « Ma position » : hors emprise refusée, dedans au bon endroit,
//   jamais watchPosition · F10 plan rouvert : fond éteint, transparence retenue · F11 transparence par plan (second
//   plan d'essai servi par l'index, en mémoire), purge à la suppression ; réglages par plan purgés et transférés sans écraser · F12 « Enregistrer hors ligne » : emprise
//   du plan seulement, progression et fin visibles ; grisée hors ligne, OSM refusé et incognito, sans requête.
// ⚠️ Sous WebKit (KTA_MOTEURS=webkit), deux contrôles ne se jouent pas, et le harnais le dit : le contexte éphémère
// refuse un Blob dans IndexedDB (F7 : tuiles enregistrées) et rend le fix précédent malgré setGeolocation (F9 dedans).
// Usage : node scripts/smoke/checkup-fond-osm.js   (SMOKE_PORT pour une copie de travail)
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1"
};
const PLAN_B = "Plan d'essai B";
const RE_OSM = /^https:\/\/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/;

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

// ── PNG synthétique (RGB 8 bits, sans dépendance) ──────────
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
function png(couleur) {
  const w = 256, h = 256, brut = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = couleur(x, y), o = y * (w * 3 + 1) + 1 + x * 3;
    brut[o] = c[0]; brut[o + 1] = c[1]; brut[o + 2] = c[2];
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc("IHDR", ih),
    bloc("IDAT", zlib.deflateSync(brut)), bloc("IEND", Buffer.alloc(0))]);
}
const PNG_DAMIER = [png(function () { return [150, 200, 150]; }), png(function () { return [160, 190, 230]; })];
const PNG_NOIR = png(function () { return [0, 0, 0]; });

// Une page sur le relevé fictif, calage prêté. opts : { ls, incognito, geoloc, horsLigneAvant }.
async function ouvrir(nav, nom, opts) {
  const o = opts || {};
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
  if (o.geoloc) {
    await ctx.grantPermissions(["geolocation"], { origin: BASE });
    await ctx.setGeolocation(o.geoloc);
  }
  const page = await ctx.newPage();
  const etat = { requetes: [], erreurs: [], cible: null };
  page.on("pageerror", function (e) { etat.erreurs.push(String(e)); });
  page.on("request", function (r) { if (RE_OSM.test(r.url())) etat.requetes.push(r.url()); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { if (ls[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, ls[k]); } catch (e) {} }
    // « Ma position » ne doit jamais suivre : tout appel à watchPosition est compté
    window.__watchAppels = 0;
    try {
      if (navigator.geolocation) {
        navigator.geolocation.watchPosition = function () { window.__watchAppels++; return 0; };
      }
    } catch (e) {}
  }, Object.assign({}, LS_PREGATES, o.ls || {}));
  // Second plan d'essai (F11) : l'index servi gagne une entrée qui pointe sur les fichiers du relevé fictif, avec
  // son propre id et son propre nom. Rien n'est écrit dans data/.
  if (o.planB) {
    await page.route(/\/data\/index\.json/, async function (route) {
      const res = await route.fetch();
      const j = await res.json();
      const a = (j.plans || []).find(function (p) { return /fictif/i.test(p.name || ""); });
      if (a) j.plans.push(Object.assign({}, a, { id: a.id + "-essai-b", name: PLAN_B }));
      route.fulfill({ response: res, json: j });
    });
  }
  // Tuiles OSM synthétiques : damier, ou noir avec UN pixel blanc (etat.cible = { z, x, y, px, py })
  await page.route(RE_OSM, function (route) {
    const m = RE_OSM.exec(route.request().url());
    const z = +m[1], x = +m[2], y = +m[3];
    const c = etat.cible;
    let corps;
    if (c && c.mode === "pixel") {
      corps = (z === c.z && x === c.x && y === c.y)
        ? png(function (u, v) { return (u === c.px && v === c.py) ? [255, 255, 255] : [0, 0, 0]; })
        : PNG_NOIR;
    } else corps = PNG_DAMIER[(x + y) & 1];
    route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: corps });
  });
  await page.goto(BASE + "/index.html" + (o.incognito ? "?incognito=1" : ""), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(nom, { exact: false }).first().click();
  await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
  await page.waitForTimeout(2000);
  return { ctx: ctx, page: page, etat: etat };
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
  return { W: W, H: H };
}

function lireBouton() {
  const b = document.getElementById("kta-refonte-counter-osm");
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { visible: r.width > 0 && getComputedStyle(b).display !== "none", indispo: b.classList.contains("kta-fond-osm-indispo"),
           actif: b.classList.contains("kta-fond-osm-actif"), titre: b.title, x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function lireFond() {
  const p = window.map.getPane("ktaFondOsm");
  const tp = window.map.getPane("tilePane");
  const base = (window._ktaBaseLayers || [])[0];
  const img = base && base._image;
  return {
    pane: !!p, canvas: p ? p.querySelectorAll("canvas").length : 0,
    zPane: p ? +getComputedStyle(p).zIndex : null, zTiles: +getComputedStyle(tp).zIndex,
    dansRotation: !!(p && p.closest(".kta-rotate-pane")),
    opaciteImage: img ? +getComputedStyle(img).opacity : null,
    opaciteTilePane: +getComputedStyle(tp).opacity,
    opacitePane: p ? +getComputedStyle(p).opacity : null,
    attribution: !!document.querySelector(".kta-fond-osm-attrib"),
    panneau: !!document.querySelector(".kta-fond-osm-panneau"),
    fenetreOsm: !!document.getElementById("kta-osm-map"),
    etat: window.FondOsmPlan.etat()
  };
}
// Commande « Enregistrer hors ligne » du panneau : { desactivee, texte }.
function lireHorsLigne() {
  const b = document.querySelector("[data-fond-osm='hors-ligne']");
  if (!b) return null;
  return { desactivee: b.disabled, texte: (b.querySelector("[data-fond-osm='hors-ligne-etat']") || {}).textContent || "" };
}
// Icône de l'interrupteur : { rond: "gauche" | "droite", couleur, couleurLibelleEtat } (Lucide toggle-left / -right).
function lireIconeInterrupteur() {
  const ico = document.querySelector("[data-fond-osm='interrupteur-ico']");
  const c = ico && ico.querySelector("svg circle");
  if (!c) return null;
  const etat = document.querySelector("[data-fond-osm='etat']");
  const btn = document.querySelector("[data-fond-osm='interrupteur']");
  return { rond: +c.getAttribute("cx") < 12 ? "gauche" : "droite", couleur: getComputedStyle(ico).color,
           couleurLibelleEtat: getComputedStyle(btn.classList.contains("kta-actif") ? etat : btn).color };
}
// Phrase d'état hors ligne du panneau : { visible, texte }.
function lirePhraseHorsLigne() {
  const m = document.querySelector("[data-fond-osm='hors-ligne-msg']");
  if (!m) return null;
  return { visible: !m.hidden && m.getBoundingClientRect().height > 0, texte: m.textContent };
}
// Rouvre un plan depuis l'accueil par l'id de sa ligne (le fond y est repris de zéro), calage prêté.
// 🩸 Pas par son nom : une fois ouvert, un plan s'affiche sous le nom de son plan-config, le même pour les deux.
async function rouvrir(page, id) {
  await page.evaluate(function () { if (typeof window.afficherLoader === "function") window.afficherLoader(); });
  await page.waitForTimeout(1500);
  await page.locator('.plan-row[data-id="' + id + '"] .plan-row-name-text').first().click();
  await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
  await page.waitForTimeout(2500);
  await page.evaluate(preterCalage);
}
// Pose des tuiles magenta dans le cache « Save Offline » (même base, même clé).
async function poserMagenta(page, liste) {
  await page.evaluate(async function (cles) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const x = c.getContext("2d"); x.fillStyle = "rgb(255,0,255)"; x.fillRect(0, 0, 256, 256);
    const blob = await new Promise(function (r) { c.toBlob(r, "image/png"); });
    const db = await new Promise(function (res, rej) {
      const q = indexedDB.open("myktamap_osm_tiles");
      q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
    });
    await new Promise(function (res, rej) {
      const tx = db.transaction("tiles", "readwrite");
      cles.forEach(function (k) { tx.objectStore("tiles").put({ key: k, blob: blob, addedAt: new Date().toISOString() }); });
      tx.oncomplete = res; tx.onerror = rej;
    });
  }, liste);
}
// Pixel du fond au centre de la carte : magenta = tuile enregistrée.
function pixelCentre() {
  const p = window.map.getPane("ktaFondOsm"), c = window.map.getContainer().getBoundingClientRect();
  // 🩸 elementsFromPoint ignore les éléments sans pointer-events (tuiles Leaflet) : recherche par géométrie
  const hit = Array.from(p.querySelectorAll("canvas")).find(function (e) {
    const b = e.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    return b.left <= cx && cx < b.right && b.top <= cy && cy < b.bottom;
  });
  if (!hit) return { magenta: false };
  const r = hit.getBoundingClientRect(), k = hit.width / r.width;
  const d = hit.getContext("2d").getImageData(Math.floor((c.left + c.width / 2 - r.left) * k),
    Math.floor((c.top + c.height / 2 - r.top) * k), 1, 1).data;
  return { magenta: d[0] > 200 && d[1] < 60 && d[2] > 200, px: Array.from(d) };
}

async function texteVisible(page, texte) {
  return page.evaluate(function (t) { return document.documentElement.innerText.indexOf(t) >= 0; }, texte);
}
async function cle(page, k) { return page.evaluate(function (c) { return window.I18n.t(c); }, k); }
async function tuilesChargees(page) {
  await attendre(page, function () {
    const p = window.map.getPane("ktaFondOsm");
    return !!p && p.querySelectorAll("canvas.leaflet-tile-loaded").length > 0 &&
      p.querySelectorAll("canvas:not(.leaflet-tile-loaded)").length === 0;
  }, 20000).catch(function () {});
  await page.waitForTimeout(400);
}

// Centre lumineux (pixels blancs du fond) autour du point attendu, en pixels CSS de la page.
async function centreLumineux(page, attendu) {
  const R = 40;
  const clip = { x: Math.max(0, attendu.x - R), y: Math.max(0, attendu.y - R), width: 2 * R, height: 2 * R };
  const buf = await page.screenshot({ clip: clip });
  return page.evaluate(async function (d) {
    const img = new Image();
    await new Promise(function (res) { img.onload = res; img.src = "data:image/png;base64," + d.b; });
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const px = x.getImageData(0, 0, c.width, c.height).data;
    const ech = img.width / d.clip.width;
    let s = 0, sx = 0, sy = 0;
    for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
      const k = (j * c.width + i) * 4, l = (px[k] + px[k + 1] + px[k + 2]) / 3;
      if (l < 40) continue;
      s += l; sx += l * (i + 0.5); sy += l * (j + 0.5);
    }
    if (!s) return null;
    return { x: d.clip.x + sx / s / ech, y: d.clip.y + sy / s / ech, poids: s };
  }, { b: buf.toString("base64"), clip: clip });
}

// Prépare la cible pixel : un point du plan posé EXACTEMENT au centre d'un pixel OSM 19 (blanc dans sa tuile) ; le
// repère est posé `decalage` pixels OSM plus à l'est (contre-essai). 🩸 La tuile garde la même URL : le navigateur la
// rend depuis son cache d'images, c'est donc le repère qu'on décale, pas le pixel blanc.
function preparerCible(decalage) {
  const g = window.OsmView.getGeorefEffectif();
  const t = window.KmzExport.buildTransformCalib(g);
  const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
  const s = 256 * Math.pow(2, 19);
  const g0 = window.KmzExport.planToGps(t, W * 0.3, H * 0.6);
  const phi = g0.lat * Math.PI / 180;
  const mx = Math.floor((g0.lng + 180) / 360 * s) + 0.5;
  const my = Math.floor((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * s) + 0.5;
  const lng = mx / s * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * my / s))) * 180 / Math.PI;
  const lngRepere = (mx + (decalage || 0)) / s * 360 - 180;
  const p = window.KmzExport.gpsToPlan(t, lat, lngRepere);
  const pixX = Math.floor(mx), pixY = Math.floor(my);
  const ll = L.latLng(H - p.y, p.x);
  if (window.__repere) window.map.removeLayer(window.__repere);
  window.__repere = L.marker(ll, { icon: L.divIcon({ className: "kta-repere-test", iconSize: [10, 10], iconAnchor: [5, 5] }),
                                   interactive: false }).addTo(window.map);
  return { mode: "pixel", z: 19, x: Math.floor(pixX / 256), y: Math.floor(pixY / 256), px: pixX % 256, py: pixY % 256,
           lat: ll.lat, lng: ll.lng };
}
// Position écran du repère (centre de sa boîte : juste sous rotation), puis tout masqué sauf le fond.
function repereEtMasquer(masquer) {
  const r = window.__repere ? window.__repere._icon.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
  ["tilePane", "overlayPane", "shadowPane", "markerPane", "tooltipPane", "popupPane"].forEach(function (n) {
    const p = window.map.getPane(n); if (p) p.style.visibility = masquer ? "hidden" : "";
  });
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

async function mesurerCalage(page, etat, decalage, lib) {
  etat.cible = await page.evaluate(preparerCible, decalage || 0);
  await page.evaluate(function (c) {
    window.FondOsmPlan.eteindre();
    window.map.setView([c.lat, c.lng], window.map.getMaxZoom(), { animate: false });
  }, etat.cible);
  await page.waitForTimeout(400);
  await page.evaluate(function () { window.FondOsmPlan.allumer(); window.FondOsmPlan.regler(100); });
  await tuilesChargees(page);
  const attendu = await page.evaluate(repereEtMasquer, true);
  await page.waitForTimeout(250);
  const vu = await centreLumineux(page, attendu);
  await page.evaluate(repereEtMasquer, false);
  if (!vu) { pb(lib + " : aucun pixel blanc du fond autour du point attendu"); return null; }
  const ecart = Math.hypot(vu.x - attendu.x, vu.y - attendu.y);
  inf(lib + " : écart " + ecart.toFixed(2) + " px (zoom " + (await page.evaluate(function () { return window.map.getZoom(); })) + ")");
  return ecart;
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const webkit = nav.browserType().name() === "webkit";
  const toutesErreurs = [];
  try {
    const nom = planFictif();
    if (!nom) { pb("relevé fictif absent de data/index.json"); return; }

    // ═══ Session principale ═══
    let s = await ouvrir(nav, nom, { geoloc: { latitude: 10, longitude: 10 } });
    let page = s.page;

    console.log("— F1 : sans géoréf —");
    const b0 = await page.evaluate(lireBouton);
    verifier(b0 && b0.visible && b0.indispo, "bouton visible et grisé sans géoréf", b0);
    verifier(b0 && b0.titre === await cle(page, "fondosm.indispo.georef"), "raison au survol (title)", b0 && b0.titre);
    await page.mouse.click(b0.x, b0.y);
    await page.waitForTimeout(400);
    const f0 = await page.evaluate(lireFond);
    verifier(!f0.panneau && !f0.fenetreOsm && !f0.pane, "clic sur le bouton grisé : ni panneau, ni fenêtre, ni fond", f0);

    console.log("— F2 : panneau et interrupteur —");
    const dims = await page.evaluate(preterCalage);
    inf("plan " + dims.W + "×" + dims.H + " px, calage fictif prêté en mémoire");
    const b1 = await page.evaluate(lireBouton);
    verifier(b1 && !b1.indispo && !b1.actif, "bouton dégrisé dès le géoréf", b1);
    await page.mouse.click(b1.x, b1.y);
    await page.waitForTimeout(400);
    const geo = await page.evaluate(function () {
      const p = document.querySelector(".kta-fond-osm-panneau"), b = document.getElementById("kta-refonte-counter-osm");
      if (!p) return null;
      const r = p.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return { haut: r.top - rb.bottom, droite: Math.abs(r.right - rb.right), largeur: r.width, hauteur: r.height,
               fenetre: !!document.getElementById("kta-osm-map") };
    });
    verifier(geo && geo.haut >= 0 && geo.haut < 16 && geo.largeur <= 300 && geo.hauteur < 300 && !geo.fenetre,
      "petit panneau ancré sous le bouton, la fenêtre Vue OSM ne s'ouvre pas", geo);
    const avant = s.etat.requetes.length;
    verifier(avant === 0, "aucune tuile OSM demandée fond éteint", avant);
    const capturer = async function (nomFichier) {
      if (!process.env.KTA_CAPTURE_DIR) return;
      await (await page.$(".kta-fond-osm-panneau")).screenshot({ path: path.join(process.env.KTA_CAPTURE_DIR, nomFichier) });
    };
    const i0 = await page.evaluate(lireIconeInterrupteur);
    verifier(i0 && i0.rond === "gauche", "éteint : icône de l'interrupteur, rond à gauche", i0);
    await capturer("interrupteur-eteint.png");
    await page.click("[data-fond-osm='interrupteur']");
    await tuilesChargees(page);
    const f1 = await page.evaluate(lireFond);
    const b2 = await page.evaluate(lireBouton);
    verifier(f1.etat.allume && f1.canvas > 0 && f1.attribution && b2.actif,
      "allumé : canvas dans le pane, attribution visible, bouton actif", { canvas: f1.canvas, attrib: f1.attribution, actif: b2.actif });
    const i1 = await page.evaluate(lireIconeInterrupteur);
    verifier(i1 && i1.rond === "droite" && i1.couleur === i1.couleurLibelleEtat,
      "allumé : rond à droite, à la couleur de l'état actif", i1);
    await capturer("interrupteur-allume.png");
    await page.click("[data-fond-osm='interrupteur']");
    await page.waitForTimeout(200);
    const i2 = await page.evaluate(lireIconeInterrupteur);
    await page.click("[data-fond-osm='interrupteur']");
    await tuilesChargees(page);
    const i3 = await page.evaluate(lireIconeInterrupteur);
    verifier(i2 && i2.rond === "gauche" && i3 && i3.rond === "droite", "bascule : rond à gauche puis à droite",
      { eteint: i2 && i2.rond, rallume: i3 && i3.rond });
    verifier(f1.zPane < f1.zTiles, "pane du fond sous l'image du plan", { zPane: f1.zPane, zTiles: f1.zTiles });
    verifier(s.etat.requetes.length > 0 && s.etat.requetes.every(function (u) { return RE_OSM.test(u); }),
      "requêtes vers tile.openstreetmap.org seulement", s.etat.requetes.length);
    const zMax = s.etat.requetes.reduce(function (m, u) { return Math.max(m, +RE_OSM.exec(u)[1]); }, 0);
    verifier(zMax <= 19, "aucune tuile demandée au-delà du zoom 19", zMax);
    // la carte du plan descend sous le zoom 0 (dézoom) : une GridLayer n'y pose rien sans minZoom négatif
    const dezoom = await page.evaluate(async function () {
      window.map.setZoom(window.map.getMinZoom(), { animate: false });
      await new Promise(function (r) { setTimeout(r, 1500); });
      const n = window.map.getPane("ktaFondOsm").querySelectorAll("canvas").length, z = window.map.getZoom();
      window.map.setZoom(0, { animate: false });
      return { zoom: z, canvas: n };
    });
    verifier(dezoom.zoom < 0 && dezoom.canvas > 0, "dézoom au minimum : le fond est dessiné", dezoom);
    await page.click("[data-fond-osm='fermer']");
    await page.waitForTimeout(300);
    const f2 = await page.evaluate(lireFond);
    verifier(!f2.panneau && f2.etat.allume && f2.canvas > 0, "panneau fermé : le fond reste allumé", f2.etat);
    await page.mouse.click(b2.x, b2.y);
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    verifier(!(await page.evaluate(lireFond)).panneau, "Échap ferme le panneau", null);

    console.log("— F3 : transparence —");
    await page.mouse.click(b2.x, b2.y);
    await page.waitForTimeout(300);
    await page.evaluate(function () {
      const c = document.querySelector("[data-fond-osm='transparence']");
      c.value = "70"; c.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const f3 = await page.evaluate(lireFond);
    verifier(Math.abs(f3.opaciteImage - 0.3) < 0.01 && Math.abs(f3.opaciteTilePane - 0.3) < 0.01,
      "transparence 70 % : image du plan et tuiles du plan à 0,3", { image: f3.opaciteImage, tilePane: f3.opaciteTilePane });
    verifier(f3.opacitePane === 1, "fond OSM opaque", f3.opacitePane);
    const valeur = await page.evaluate(function () { return document.querySelector("[data-fond-osm='valeur']").textContent; });
    verifier(/70/.test(valeur), "valeur affichée", valeur);
    await page.keyboard.press("Escape");

    // coins de l'écran : sous rotation, une tuile du fond doit les couvrir (sinon coins vides)
    console.log("— F5a : plan orienté, coins —");
    await page.evaluate(function () { window.MapBearing.setManuel(35); });
    await page.waitForTimeout(1200);
    await page.evaluate(function () {
      window.FondOsmPlan.eteindre();
      window.map.setZoom(0, { animate: false });
      window.FondOsmPlan.allumer();
      window.FondOsmPlan.regler(100);
    });
    await tuilesChargees(page);
    await page.evaluate(repereEtMasquer, true).catch(function () {});
    await page.waitForTimeout(250);
    const capture = await page.screenshot();
    await page.evaluate(repereEtMasquer, false).catch(function () {});
    const coins = await page.evaluate(async function (b) {
      const img = new Image();
      await new Promise(function (res) { img.onload = res; img.src = "data:image/png;base64," + b; });
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      const r = window.map.getContainer().getBoundingClientRect();
      const haut = r.top + 20, bas = Math.min(r.bottom, window.innerHeight - 70) - 20;
      // à côté des barres de gauche et de droite, et de l'ombre du bouton nord (bas gauche)
      return [[60, haut], [r.right - 60, haut], [120, bas], [r.right - 60, bas]].map(function (p) {
        const d = x.getImageData(Math.round(p[0]), Math.round(p[1]), 1, 1).data;
        const proche = function (r, g, b) { return Math.abs(d[0] - r) + Math.abs(d[1] - g) + Math.abs(d[2] - b) < 30; };
        return { ok: proche(150, 200, 150) || proche(160, 190, 230), px: Array.from(d).slice(0, 3), x: p[0], y: p[1] };
      });
    }, capture.toString("base64"));
    verifier(coins.every(function (c) { return c.ok; }), "carte tournée : les 4 coins couverts par le fond", coins);
    await page.evaluate(function () { window.MapBearing.remettreNord(); });
    await page.waitForTimeout(800);

    console.log("— F6 : extinction —");
    await page.evaluate(function () { window.FondOsmPlan.eteindre(); });
    await page.waitForTimeout(300);
    const f6 = await page.evaluate(lireFond);
    const b6 = await page.evaluate(lireBouton);
    verifier(f6.canvas === 0 && f6.etat.imagesEnMemoire === 0 && !f6.attribution && !b6.actif,
      "éteint : canvas retirés, images libérées, attribution et état actif retirés", f6);
    verifier(f6.opaciteImage === 1 && f6.opaciteTilePane === 1, "opacité de l'image du plan rendue", f6);

    console.log("— F9 : « Ma position » —");
    await page.mouse.click(b6.x, b6.y);
    await page.waitForTimeout(300);
    await page.click("[data-fond-osm='moi']");
    await page.waitForTimeout(1500);
    const hors = await page.evaluate(function () { return window.FondOsmPlan.etat().position; });
    const msgHors = (await cle(page, "osm.gps.outOfBounds")).split("{")[0].slice(0, 20);
    verifier(hors === null && await texteVisible(page, msgHors), "position hors emprise : refusée, message affiché", hors);
    const dedans = await page.evaluate(function () {
      const g = window.OsmView.getGeorefEffectif(), t = window.KmzExport.buildTransformCalib(g);
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      const gps = window.KmzExport.planToGps(t, W * 0.5, H * 0.5);
      return { gps: gps, attendu: { lat: H - H * 0.5, lng: W * 0.5 } };
    });
    await s.ctx.setGeolocation({ latitude: dedans.gps.lat, longitude: dedans.gps.lng, accuracy: 8 });
    await page.waitForTimeout(10500);   // le module accepte un fix de moins de 10 s : laisser expirer le précédent
    await page.click("[data-fond-osm='moi']");
    await page.waitForTimeout(1500);
    const pos = await page.evaluate(function () { return window.FondOsmPlan.etat().position; });
    if (webkit && !pos) inf("WebKit : fix « dans l'emprise » non rendu par le harnais (non vérifié ici)");
    else verifier(pos && Math.hypot(pos.lat - dedans.attendu.lat, pos.lng - dedans.attendu.lng) < 0.5,
      "position dans l'emprise : point posé au bon endroit du plan (< 0,5 px)", { pos: pos, attendu: dedans.attendu });
    const watch = await page.evaluate(function () { return window.__watchAppels; });
    verifier(watch === 0, "jamais de watchPosition", watch);
    const persiste = await page.evaluate(function (lat) {
      const marque = String(lat).slice(0, 9);
      return JSON.stringify(Object.assign({}, localStorage)).indexOf(marque) >= 0 ||
        JSON.stringify(Object.assign({}, sessionStorage)).indexOf(marque) >= 0;
    }, dedans.gps.lat);
    verifier(!persiste, "position écrite ni dans le localStorage ni dans le sessionStorage", persiste);
    await page.keyboard.press("Escape");

    console.log("— F10 : plan rouvert —");
    await page.evaluate(function () { window.FondOsmPlan.allumer(); window.FondOsmPlan.regler(80); });
    await page.waitForTimeout(500);
    await page.evaluate(function () { if (window.FondOsmPlan.etat().allume !== true) throw new Error("fond pas allumé"); });
    await page.evaluate(function () { if (typeof window.afficherLoader === "function") window.afficherLoader(); });
    await page.waitForTimeout(1500);
    await page.getByText(nom, { exact: false }).first().click();
    await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
    await page.waitForTimeout(2500);
    await page.evaluate(preterCalage);
    const f10 = await page.evaluate(lireFond);
    const b10 = await page.evaluate(lireBouton);
    verifier(!f10.etat.allume && f10.canvas === 0 && !f10.attribution && !b10.actif && f10.etat.position === null,
      "plan rouvert : interrupteur éteint, aucun point", { etat: f10.etat, canvas: f10.canvas });
    verifier(f10.etat.transparence === 80, "plan rouvert : transparence retenue (80 %)", f10.etat.transparence);
    toutesErreurs.push.apply(toutesErreurs, s.etat.erreurs);
    await s.ctx.close();

    console.log("— F4 : calage au pixel, zoom max (page neuve : la tuile au pixel blanc n'a jamais été vue) —");
    s = await ouvrir(nav, nom);
    page = s.page;
    await page.evaluate(preterCalage);
    const e1 = await mesurerCalage(page, s.etat, 0, "pixel du point");
    if (e1 != null) verifier(e1 < 1, "un point connu du plan tombe sur son pixel OSM à moins de 1 px", e1);
    const e2 = await mesurerCalage(page, s.etat, 1, "contre-essai, repère au pixel OSM voisin");
    if (e2 != null) verifier(e2 > 2, "contre-essai : un écart d'un pixel OSM est vu (le test n'est pas aveugle)", e2);

    console.log("— F5b : plan orienté, calage —");
    await page.evaluate(function () { window.MapBearing.setManuel(35); });
    await page.waitForTimeout(1200);
    const e3 = await mesurerCalage(page, s.etat, 0, "pixel du point, carte tournée de 35°");
    const angle = await page.evaluate(function () { return window.map._ktaRotation.angle(); });
    verifier(Math.abs(angle - 35) < 0.5, "carte tournée", angle);
    if (e3 != null) verifier(e3 < 1, "fond pris dans la rotation : le point reste sur son pixel OSM", e3);
    const f5 = await page.evaluate(lireFond);
    verifier(f5.dansRotation, "pane du fond dans le pane de rotation", f5.dansRotation);
    toutesErreurs.push.apply(toutesErreurs, s.etat.erreurs);
    await s.ctx.close();

    console.log("— F7 : hors ligne —");
    s = await ouvrir(nav, nom);
    page = s.page;
    await page.evaluate(preterCalage);
    await page.evaluate(function () { window.FondOsmPlan.allumer(); window.FondOsmPlan.regler(100); });
    await tuilesChargees(page);
    const cles = Array.from(new Set(s.etat.requetes.map(function (u) { const m = RE_OSM.exec(u); return m[1] + "/" + m[2] + "/" + m[3]; })));
    inf(cles.length + " tuile(s) OSM pour la vue");
    if (webkit) {
      inf("WebKit : contexte éphémère sans Blob dans IndexedDB, F7 non vérifié ici");
      toutesErreurs.push.apply(toutesErreurs, s.etat.erreurs);
      await s.ctx.close();
    } else {
    // Enregistrées comme « Save Offline » (même base, même clé), en magenta
    await page.evaluate(async function (liste) {
      window.FondOsmPlan.eteindre();
      const c = document.createElement("canvas"); c.width = 256; c.height = 256;
      const x = c.getContext("2d"); x.fillStyle = "rgb(255,0,255)"; x.fillRect(0, 0, 256, 256);
      const blob = await new Promise(function (r) { c.toBlob(r, "image/png"); });
      const db = await new Promise(function (res, rej) {
        const q = indexedDB.open("myktamap_osm_tiles");
        q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
      });
      await new Promise(function (res, rej) {
        const tx = db.transaction("tiles", "readwrite");
        liste.forEach(function (k) { tx.objectStore("tiles").put({ key: k, blob: blob, addedAt: new Date().toISOString() }); });
        tx.oncomplete = res; tx.onerror = rej;
      });
    }, cles);
    await s.ctx.setOffline(true);
    const n7 = s.etat.requetes.length;
    await page.evaluate(function () { window.FondOsmPlan.basculerPanneau(document.getElementById("kta-refonte-counter-osm")); });
    await page.waitForTimeout(300);
    const hl7 = await page.evaluate(lireHorsLigne);
    const raisonHL = await cle(page, "fondosm.cache.indispo.horsLigne");
    verifier(hl7 && hl7.desactivee && hl7.texte === raisonHL, "hors ligne : « Enregistrer hors ligne » grisée, raison affichée", hl7);
    // Phrase d'état hors ligne : suit online / offline sans rouvrir le panneau
    const phraseHL = await cle(page, "fondosm.horsLigne");
    const m7a = await page.evaluate(lirePhraseHorsLigne);
    verifier(m7a && m7a.visible && m7a.texte === phraseHL, "hors ligne : phrase d'état visible dans le panneau", m7a);
    await s.ctx.setOffline(false);
    await page.waitForTimeout(300);
    const m7b = await page.evaluate(lirePhraseHorsLigne);
    verifier(m7b && !m7b.visible, "réseau revenu, panneau ouvert : phrase retirée sans rouvrir", m7b);
    await s.ctx.setOffline(true);
    await page.waitForTimeout(300);
    const m7c = await page.evaluate(lirePhraseHorsLigne);
    verifier(m7c && m7c.visible && m7c.texte === phraseHL, "réseau recoupé : phrase de retour sans rouvrir", m7c);
    if (process.env.KTA_CAPTURE_DIR) {
      await (await page.$(".kta-fond-osm-panneau")).screenshot({ path: path.join(process.env.KTA_CAPTURE_DIR, "panneau-hors-ligne.png") });
    }
    await page.click("[data-fond-osm='hors-ligne']", { force: true }).catch(function () {});
    await page.keyboard.press("Escape");
    await page.evaluate(function () { window.FondOsmPlan.allumer(); window.FondOsmPlan.regler(100); });
    await tuilesChargees(page);
    const f7 = await page.evaluate(function () {
      const p = window.map.getPane("ktaFondOsm"), c = window.map.getContainer().getBoundingClientRect();
      // 🩸 elementsFromPoint ignore les éléments sans pointer-events (tuiles Leaflet) : recherche par géométrie
      const hit = Array.from(p.querySelectorAll("canvas")).find(function (e) {
        const b = e.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
        return b.left <= cx && cx < b.right && b.top <= cy && cy < b.bottom;
      });
      if (!hit) return { magenta: false };
      const r = hit.getBoundingClientRect(), k = hit.width / r.width;
      const d = hit.getContext("2d").getImageData(Math.floor((c.left + c.width / 2 - r.left) * k), Math.floor((c.top + c.height / 2 - r.top) * k), 1, 1).data;
      return { magenta: d[0] > 200 && d[1] < 60 && d[2] > 200, px: Array.from(d), reseau: window.FondOsmPlan.etat().requetesReseau };
    });
    verifier(s.etat.requetes.length === n7, "hors ligne : aucune requête OSM", s.etat.requetes.length - n7);
    verifier(f7.magenta, "hors ligne : les tuiles enregistrées s'affichent", f7);
    const msgHL = await cle(page, "fondosm.horsLigne");
    verifier(await texteVisible(page, msgHL), "hors ligne : message affiché à l'allumage", msgHL);
    // Tuile absente à son zoom : la tuile enregistrée deux zooms plus large est agrandie
    await page.evaluate(async function () { window.FondOsmPlan.eteindre(); await window.OsmTilesCache.clear(); });
    const parents = Array.from(new Set(cles.map(function (k) {
      const t = k.split("/").map(Number);
      return (t[0] - 2) + "/" + (t[1] >> 2) + "/" + (t[2] >> 2);
    })));
    await poserMagenta(page, parents);
    const n7b = s.etat.requetes.length;
    await page.evaluate(function () { window.FondOsmPlan.allumer(); window.FondOsmPlan.regler(100); });
    await tuilesChargees(page);
    const f7b = await page.evaluate(pixelCentre);
    verifier(f7b.magenta && s.etat.requetes.length === n7b,
      "hors ligne : sans la tuile de son zoom, la tuile enregistrée plus large est agrandie, aucune requête", f7b);
    await page.evaluate(async function () { window.FondOsmPlan.eteindre(); await window.OsmTilesCache.clear(); });
    toutesErreurs.push.apply(toutesErreurs, s.etat.erreurs);
    await s.ctx.close();
    }

    console.log("— F8 : OSM refusé, incognito —");
    s = await ouvrir(nav, nom, { ls: { "myktamap_osm_view_opt_in": "0" } });
    page = s.page;
    await page.evaluate(preterCalage);
    const b8 = await page.evaluate(lireBouton);
    verifier(b8 && b8.visible && !b8.indispo, "OSM refusé : bouton présent (le géoréf suffit)", b8);
    await page.mouse.click(b8.x, b8.y);
    await page.waitForTimeout(300);
    await page.click("[data-fond-osm='interrupteur']");
    await page.waitForTimeout(1500);
    const f8 = await page.evaluate(lireFond);
    const msgOpt = (await cle(page, "fondosm.refus.optin")).slice(0, 30);
    verifier(!f8.etat.allume && f8.canvas === 0 && s.etat.requetes.length === 0 && await texteVisible(page, msgOpt),
      "OSM refusé : fond refusé avec un message, aucune requête", { allume: f8.etat.allume, requetes: s.etat.requetes.length });
    const i8 = await page.evaluate(lireIconeInterrupteur);
    verifier(i8 && i8.rond === "gauche", "OSM refusé : l'icône reste rond à gauche", i8);
    const hl8 = await page.evaluate(lireHorsLigne);
    await page.click("[data-fond-osm='hors-ligne']", { force: true }).catch(function () {});
    await page.waitForTimeout(800);
    verifier(hl8 && hl8.desactivee && hl8.texte === await cle(page, "fondosm.cache.indispo.optin") && s.etat.requetes.length === 0,
      "OSM refusé : « Enregistrer hors ligne » grisée avec sa raison, aucune requête", { hl8: hl8, requetes: s.etat.requetes.length });
    toutesErreurs.push.apply(toutesErreurs, s.etat.erreurs);
    await s.ctx.close();

    s = await ouvrir(nav, nom, { incognito: true });
    page = s.page;
    const inco = await page.evaluate(function () { return !!(window.IncognitoMode && window.IncognitoMode.isActive()); });
    if (!inco) pb("incognito non actif avec ?incognito=1 : contrôle impossible");
    else {
      await page.evaluate(preterCalage);
      const b9 = await page.evaluate(lireBouton);
      await page.mouse.click(b9.x, b9.y);
      await page.waitForTimeout(300);
      await page.click("[data-fond-osm='interrupteur']");
      await page.waitForTimeout(1500);
      const f9 = await page.evaluate(lireFond);
      const moiBloque = await page.evaluate(function () { return document.querySelector("[data-fond-osm='moi']").disabled; });
      const msgInc = await cle(page, "fondosm.refus.incognito");
      verifier(!f9.etat.allume && f9.canvas === 0 && s.etat.requetes.length === 0 && await texteVisible(page, msgInc),
        "incognito : fond refusé avec un message, aucune requête", { allume: f9.etat.allume, requetes: s.etat.requetes.length });
      verifier(moiBloque, "incognito : « Ma position » désactivée", moiBloque);
      const hl9 = await page.evaluate(lireHorsLigne);
      await page.click("[data-fond-osm='hors-ligne']", { force: true }).catch(function () {});
      await page.waitForTimeout(800);
      verifier(hl9 && hl9.desactivee && hl9.texte === await cle(page, "fondosm.cache.indispo.incognito") && s.etat.requetes.length === 0,
        "incognito : « Enregistrer hors ligne » grisée avec sa raison, aucune requête", { hl9: hl9, requetes: s.etat.requetes.length });
    }
    toutesErreurs.push.apply(toutesErreurs, s.etat.erreurs);
    await s.ctx.close();

    console.log("— F11 : transparence retenue par plan (second plan d'essai) —");
    s = await ouvrir(nav, nom, { planB: true });
    page = s.page;
    await page.evaluate(preterCalage);
    const idA = await page.evaluate(function () { return window._currentLoadedPlanId; });
    await page.evaluate(function () { window.FondOsmPlan.allumer(); window.FondOsmPlan.regler(30); });
    const idB = idA + "-essai-b";
    await rouvrir(page, idB);
    const b11 = await page.evaluate(function () {
      return { id: window._currentLoadedPlanId, etat: window.FondOsmPlan.etat() };
    });
    verifier(b11.id && b11.id !== idA, "second plan d'essai ouvert (autre id)", { idA: idA, idB: b11.id });
    verifier(b11.etat.transparence === 50 && !b11.etat.allume, "plan B au premier usage : 50 %, éteint", b11.etat);
    await page.evaluate(function () { window.FondOsmPlan.allumer(); window.FondOsmPlan.regler(70); });
    await rouvrir(page, idA);
    const a11 = await page.evaluate(function () {
      window.FondOsmPlan.basculerPanneau(document.getElementById("kta-refonte-counter-osm"));
      const v = document.querySelector("[data-fond-osm='valeur']").textContent;
      window.FondOsmPlan.fermerPanneau();
      return { id: window._currentLoadedPlanId, etat: window.FondOsmPlan.etat(), affiche: v };
    });
    verifier(a11.id === idA && a11.etat.transparence === 30 && /30/.test(a11.affiche) && !a11.etat.allume,
      "retour sur A : 30 % retenus (panneau compris), interrupteur éteint", a11);
    await page.evaluate(function () { window.FondOsmPlan.allumer(); });
    const opA = await page.evaluate(lireFond);
    verifier(Math.abs(opA.opaciteImage - 0.7) < 0.01, "retour sur A, fond allumé : image du plan à 0,7", opA.opaciteImage);
    await rouvrir(page, idB);
    const b11b = await page.evaluate(function () { return window.FondOsmPlan.etat(); });
    verifier(b11b.transparence === 70 && !b11b.allume, "retour sur B : 70 % retenus, interrupteur éteint", b11b);
    // suppression d'un plan : sa clé part avec ses données
    const purge = await page.evaluate(async function (id) {
      const avant = localStorage.getItem(window.FondOsmPlan.PREFIXE + id);
      await window.PlanRegistry.purgeAssociatedData(id);
      return { avant: avant, apres: localStorage.getItem(window.FondOsmPlan.PREFIXE + id) };
    }, idA);
    verifier(purge.avant === "30" && purge.apres === null, "plan purgé : sa transparence retenue est effacée", purge);
    // Réglages par plan (myktamap_plan_prefs_) : purgés avec le plan, transférés sans écraser la cible
    const prefs = await page.evaluate(async function () {
      const P = "myktamap_plan_prefs_", lire = function (id) { return localStorage.getItem(P + id); };
      const R = window.PlanRegistry;
      localStorage.setItem(P + "essai-prefs-a", '{"northOffsetDeg":12}');
      await R.transferAssociatedData("essai-prefs-a", "essai-prefs-b");
      const transfert = { a: lire("essai-prefs-a"), b: lire("essai-prefs-b") };
      localStorage.setItem(P + "essai-prefs-c", '{"northOffsetDeg":40}');
      await R.transferAssociatedData("essai-prefs-c", "essai-prefs-b");
      const cibleGardee = { c: lire("essai-prefs-c"), b: lire("essai-prefs-b") };
      await R.purgeAssociatedData("essai-prefs-b");
      await R.purgeAssociatedData("essai-prefs-c");
      return { transfert: transfert, cibleGardee: cibleGardee, purge: [lire("essai-prefs-b"), lire("essai-prefs-c")] };
    });
    verifier(prefs.transfert.a === null && prefs.transfert.b === '{"northOffsetDeg":12}',
      "réglages par plan transférés à la version serveur (ancienne clé retirée)", prefs.transfert);
    verifier(prefs.cibleGardee.b === '{"northOffsetDeg":12}' && prefs.cibleGardee.c === '{"northOffsetDeg":40}',
      "transfert vers une cible qui a déjà ses réglages : rien d'écrasé", prefs.cibleGardee);
    verifier(prefs.purge[0] === null && prefs.purge[1] === null, "plan purgé : ses réglages par plan effacés", prefs.purge);

    console.log("— F12 : « Enregistrer hors ligne » —");
    await page.evaluate(function () { window.FondOsmPlan.basculerPanneau(document.getElementById("kta-refonte-counter-osm")); });
    await page.waitForTimeout(300);
    const hl12 = await page.evaluate(lireHorsLigne);
    verifier(hl12 && !hl12.desactivee && hl12.texte === "", "en ligne : commande active", hl12);
    const m12 = await page.evaluate(lirePhraseHorsLigne);
    verifier(m12 && !m12.visible, "en ligne : pas de phrase d'état hors ligne", m12);
    const n12 = s.etat.requetes.length;
    await page.click("[data-fond-osm='hors-ligne']");
    let progression = null;
    for (let i = 0; i < 40 && !progression; i++) {
      progression = await page.evaluate(function () {
        const h = document.querySelector("[data-fond-osm='hors-ligne']");
        return h && h.disabled && /\d+ \/ \d+/.test(h.textContent) ? h.textContent.trim() : null;
      });
      if (!progression) await page.waitForTimeout(50);
    }
    verifier(!!progression, "progression visible dans la commande", progression);
    await attendre(page, function () { return !!window.FondOsmPlan.etat().dernierEnregistrement; }, 60000);
    const r12 = await page.evaluate(async function () {
      const e = window.FondOsmPlan.etat().dernierEnregistrement, bbox = window.OsmView.getPlanGpsBbox();
      const attendues = {};
      [e.zoom - 1, e.zoom, e.zoom + 1].forEach(function (z) {
        window.OsmTilesCache.enumerateTilesForBbox(bbox, z).forEach(function (t) { attendues[t.z + "/" + t.x + "/" + t.y] = 1; });
      });
      const st = await window.OsmTilesCache.getStats();
      return { res: e, attendues: Object.keys(attendues), stockees: st.count };
    });
    const demandees = s.etat.requetes.slice(n12).map(function (u) { const m = RE_OSM.exec(u); return m[1] + "/" + m[2] + "/" + m[3]; });
    const horsEmprise = demandees.filter(function (k) { return r12.attendues.indexOf(k) < 0; });
    verifier(r12.res.cached > 0 && r12.stockees >= r12.res.cached && horsEmprise.length === 0,
      "tuiles de l'emprise du plan enregistrées (zoom " + r12.res.zoom + " ± 1), aucune hors emprise",
      { res: r12.res, stockees: r12.stockees, horsEmprise: horsEmprise.length });
    const fin = (await cle(page, "osm_home.cache.cached")).split("{")[1].split("}")[1].trim();
    verifier(await texteVisible(page, fin), "fin annoncée par un toast", fin);
    const hl12b = await page.evaluate(lireHorsLigne);
    verifier(hl12b && !hl12b.desactivee, "commande rendue après l'enregistrement", hl12b);
    await page.evaluate(async function () { await window.OsmTilesCache.clear(); });
    toutesErreurs.push.apply(toutesErreurs, s.etat.erreurs);
    await s.ctx.close();

    const utiles = toutesErreurs.filter(function (e) { return !/swRegister|serviceWorker/i.test(e); });
    verifier(utiles.length === 0, "aucune erreur de page", utiles.slice(0, 3));
  } catch (e) {
    pb("exception : " + (e && e.stack || e));
  } finally {
    await nav.close();
    server.close();
    console.log(problemes.length ? "\n❌ " + problemes.length + " problème(s)" : "\n✅ Fond OSM sous le plan");
    process.exit(problemes.length ? 1 : 0);
  }
})();
