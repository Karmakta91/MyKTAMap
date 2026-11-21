#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-maxbounds.js — checkup (Playwright, pas un hook pré-commit) : limites de la carte et calques de niveau calés
// =====================================================================
// Le relevé fictif est rechargé en ZIP fabriqué en mémoire (jamais dans data/), avec trois calques image
// fabriqués : niveau 1 calé DÉCALÉ et agrandi (1,5 largeur d'image, vers le bas à droite), −1 calé tourné de 25°
// (haut gauche, 4e coin extrême), 2 sans calage. Par moteur (Chromium puis WebKit) :
//   L1 limites = image ∪ emprise des 4 coins de chaque calque (tous niveaux) + 30 % du plus petit côté de l'image ;
//   L2 chaque coin des calques calés : vue centrée dessus au zoom max, elle y reste ;
//   L3 vrai glissé à la souris depuis le centre de l'image jusqu'au coin éloigné : il finit à l'écran ;
//   L4 même chose fond OSM sous le plan allumé (calage fictif prêté en mémoire, tuiles OSM fabriquées ici) ;
//   L5 plan orienté (cap 40°) : glissé au doigt simulé jusqu'au coin, bornage continu de mapBearing ;
//   L6 molette jusqu'au zoom max sur un point du calque hors de l'image : il reste sous le pointeur ;
//   L7 calque repositionné en place (reposition du plugin) : les limites suivent ;
//   L8 calques sans calage : limites = bornes de l'image + marge, au pixel près ;
//   L9 calques calés encore en chargement, puis un plan SANS calque ouvert : rien de l'ancien plan ne s'enregistre,
//      limites = image seule + marge ;
//   L10 contexte tactile (téléphone) : pincement (TouchEvent, simulés sous WebKit) au zoom max sur le même point.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8159 node scripts/smoke/checkup-maxbounds.js
// Doc : docs/architecture/rendering-leaflet.md (Limites de la carte)
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1"
};
const RE_OSM = /tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/;
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

let MOTEUR = "";
const problemes = [];
function pb(msg) { problemes.push("[" + MOTEUR + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Outils posés dans la page (lus au moment de l'appel : l'app est chargée).
function outilsPage() {
  window.__mb = {
    // ZIP du relevé fictif, modifié : "cale" | "sans-calage" | "sans-calque".
    fabriquer: async function (mode, nomZip) {
      const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
      if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
      const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
      const W = cfg.plan.imageWidth, H = cfg.plan.imageHeight;
      // Le relevé fictif n'a pas de calque image : trois calques fabriqués (PNG 512 × 512 dessiné ici), niveaux 1,
      // −1 et 2. Mode "cale" : le niveau 1 décalé et agrandi (1,5 largeur d'image, coin haut gauche à 60 % / 50 %),
      // le −1 tourné de 25° (1 largeur, posé en haut à gauche hors de l'image), le 2 sans calage (bornes du plan).
      const S = 512;
      const cv = document.createElement("canvas"); cv.width = S; cv.height = S;
      const g = cv.getContext("2d"); g.fillStyle = "rgba(40, 120, 220, 0.5)"; g.fillRect(0, 0, S, S);
      const png = await new Promise(function (r) { cv.toBlob(r, "image/png"); });
      const calques = [
        { id: "mb-n1", label: "Niveau 1 essai", file: "calques/mb-n1.png", level: 1, visible: true, order: 1 },
        { id: "mb-nm1", label: "Niveau -1 essai", file: "calques/mb-nm1.png", level: -1, visible: true, order: 2 },
        { id: "mb-n2", label: "Niveau 2 essai", file: "calques/mb-n2.png", level: 2, visible: true, order: 3 }
      ];
      const info = { W: W, H: H, nCalques: calques.length, cales: [] };
      if (mode === "cale") {
        const k1 = 1.5 * W / S, x1 = Math.round(W * 0.6), y1 = Math.round(H * 0.5);
        calques[0].calibration = { sourceA: { sx: 0, sy: 0 }, targetA: { x: x1, y: y1 },
                                   sourceB: { sx: 100, sy: 0 }, targetB: { x: x1 + 100 * k1, y: y1 } };
        const a = 25 * Math.PI / 180, k2 = W / S, x2 = -Math.round(W * 0.4), y2 = -Math.round(H * 0.3);
        calques[1].calibration = { sourceA: { sx: 0, sy: 0 }, targetA: { x: x2, y: y2 },
                                   sourceB: { sx: 100, sy: 0 }, targetB: { x: x2 + 100 * k2 * Math.cos(a), y: y2 + 100 * k2 * Math.sin(a) } };
        info.cales = ["mb-n1", "mb-nm1"];
      }
      cfg.imageLayers = mode === "sans-calque" ? [] : calques;
      // Nom propre à chaque ZIP : sinon « Ce plan existe déjà » attend une réponse (homeLoader.js > _chercherPlanExistant).
      cfg.plan.name = "Essai limites " + nomZip.replace(/\.zip$/, "");
      info.nAttendus = (cfg.imageLayers || []).length;
      const zip = new JSZip();
      calques.forEach(function (l) { zip.file(l.file, png); });
      const chemins = [cfg.plan.baseImage]
        .concat((cfg.dataLayers || []).map(function (l) { return l.file; }))
        .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
      for (const p of Array.from(new Set(chemins))) {
        const r = await fetch(window.resolveServerPath(p, srv.path));
        if (r.ok) zip.file(p, await r.blob());
      }
      zip.file("plan-config.json", JSON.stringify(cfg));
      const blob = await zip.generateAsync({ type: "blob" });
      window.__mbInfo = info;
      window.__mbFini = false;
      // Pas d'await : le plan se charge pendant que le harnais attend sa condition (L8 retient des calques).
      window.__mbCharge = window.chargerZipFichier(new File([blob], nomZip, { type: "application/zip" }), "auto",
        { storeBlob: true }).then(function () { window.__mbFini = true; return true; },
        function (e) { window.__mbFini = true; return String(e && e.message || e); });
      return { ok: true, info: info };
    },
    // 4 coins (tl, tr, bl, br = tr + bl − tl) d'un calque calé, en latlng.
    coins: function (ov) {
      const tl = ov._topLeft, tr = ov._topRight, bl = ov._bottomLeft;
      return [[tl.lat, tl.lng], [tr.lat, tr.lng], [bl.lat, bl.lng],
              [tr.lat + bl.lat - tl.lat, tr.lng + bl.lng - tl.lng]];
    },
    // Limites attendues, calculées ici indépendamment du moteur.
    attendues: function (avecCalques) {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      const m = Math.round(Math.min(W, H) * 0.3);
      let s = 0, w = 0, n = H, e = W;
      if (avecCalques) {
        (window._ktaImageOverlays || []).forEach(function (c) {
          const pts = c.overlay._ktaCalibrated ? window.__mb.coins(c.overlay) : [[0, 0], [H, W]];
          pts.forEach(function (p) { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
        });
      }
      return [[s - m, w - m], [n + m, e + m]];
    },
    limites: function () {
      const b = window.map.options.maxBounds;
      if (!b) return null;
      const lb = L.latLngBounds(b);
      return [[lb.getSouth(), lb.getWest()], [lb.getNorth(), lb.getEast()]];
    },
    egales: function (a, b, tol) {
      if (!a || !b) return false;
      return [0, 1].every(function (i) { return [0, 1].every(function (j) { return Math.abs(a[i][j] - b[i][j]) <= (tol || 0); }); });
    },
    // Position ÉCRAN d'un latlng, rotation du plan orienté comprise (même formule que checkup-plan-oriente.js).
    ecran: function (ll) {
      const p = window.map.latLngToContainerPoint(L.latLng(ll[0], ll[1]));
      const cr = window.map.getContainer().getBoundingClientRect();
      const a = (window.MapBearing && window.MapBearing.isEnabled() ? window.MapBearing.getBearing() : 0) * Math.PI / 180;
      const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
      const dx = cr.left + p.x - cx, dy = cr.top + p.y - cy;
      return { x: dx * Math.cos(a) - dy * Math.sin(a) + cx, y: dx * Math.sin(a) + dy * Math.cos(a) + cy,
               l: cr.left, t: cr.top, r: cr.right, b: cr.bottom, cx: cx, cy: cy };
    },
    // Point dans le calque du niveau 1, hors de l'image du plan (x = 1,6 largeur, y = 0,9 hauteur) : vue posée
    // dessus au zoom z, position écran rendue.
    viserHorsImage: function (z) {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      window.__mbP = [H - 0.9 * H, 1.6 * W];
      window.map.setView(L.latLng(window.__mbP[0], window.__mbP[1]), z, { animate: false });
      const e = window.__mb.ecran(window.__mbP);
      return { x: e.x, y: e.y, horsImage: window.__mbP[1] > W };
    },
    calesEntrees: function () {
      return (window._ktaImageOverlays || []).filter(function (c) { return c.overlay && c.overlay._ktaCalibrated; });
    }
  };
}

async function ouvrir(page, mode, nomZip) {
  const r = await page.evaluate(function (a) { return window.__mb.fabriquer(a[0], a[1]); }, [mode, nomZip]);
  if (!r.ok) throw new Error(r.raison);
  try {
    await attendre(page, function () {
      return window.__mbFini && !!window.map && !!window.PLAN_CONFIG && window.__mbInfo &&
        Array.isArray(window._ktaImageOverlays) && window._ktaImageOverlays.length === window.__mbInfo.nAttendus &&
        window.APP_CONFIG && window.APP_CONFIG.imageWidth === window.__mbInfo.W;
    }, 90000);
  } catch (e) {
    const etat = await page.evaluate(async function () {
      const modales = Array.from(document.querySelectorAll("[role=dialog], .kta-modal, [id*=modal]"))
        .filter(function (m) { return m.offsetParent !== null; })
        .map(function (m) { return (m.id || m.className) + " : " + (m.textContent || "").trim().slice(0, 120); });
      return { fini: window.__mbFini, charge: window.__mbFini ? await window.__mbCharge : null, carte: !!window.map,
               calques: (window._ktaImageOverlays || []).length, attendus: window.__mbInfo && window.__mbInfo.nAttendus,
               modales: modales.slice(0, 4) };
    });
    throw new Error("plan " + nomZip + " pas ouvert : " + JSON.stringify(etat));
  }
  await page.waitForTimeout(1200);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
  return r.info;
}

// Vue centrée sur chaque coin des calques calés, zoom max : elle y reste (≤ 1 unité plan).
async function coinsAtteignables(page, titre) {
  const r = await page.evaluate(async function () {
    const res = [];
    for (const c of window.__mb.calesEntrees()) {
      for (const p of window.__mb.coins(c.overlay)) {
        window.map.setView(L.latLng(p[0], p[1]), 2, { animate: false });
        await new Promise(function (ok) { setTimeout(ok, 120); });
        window.map.fire("moveend");
        await new Promise(function (ok) { setTimeout(ok, 120); });
        const ctr = window.map.getCenter();
        res.push({ id: c.id, ecart: Math.round(Math.hypot(ctr.lat - p[0], ctr.lng - p[1]) * 10) / 10 });
      }
    }
    return res;
  });
  const rates = r.filter(function (x) { return x.ecart > 1; });
  verifier(r.length > 0 && rates.length === 0, titre + " : " + (r.length - rates.length) + "/" + r.length +
    " coins de calque calé atteints au zoom max", rates.slice(0, 4));
}

// Glissés réels (souris → événements pointeur) depuis le centre de l'image vers le coin éloigné, jusqu'à ce qu'il
// soit à l'écran ou que la vue ne bouge plus.
async function glisserJusquAuCoin(page, titre) {
  await page.evaluate(function () {
    const H = window.APP_CONFIG.imageHeight, W = window.APP_CONFIG.imageWidth;
    window.map.setView(L.latLng(H / 2, W / 2), 0, { animate: false });
    const c = window.__mb.calesEntrees()[0];
    window.__mbCible = window.__mb.coins(c.overlay)[3];   // br : le plus loin de l'image
  });
  let vu = false, immobile = 0, pas = 0, dernier = null;
  for (pas = 0; pas < 60 && !vu && immobile < 3; pas++) {
    const e = await page.evaluate(function () { return window.__mb.ecran(window.__mbCible); });
    vu = e.x >= e.l + 2 && e.x <= e.r - 2 && e.y >= e.t + 2 && e.y <= e.b - 2;
    if (vu) break;
    const vx = e.x - e.cx, vy = e.y - e.cy, n = Math.hypot(vx, vy) || 1, d = Math.min(300, n);
    await page.mouse.move(e.cx, e.cy);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(e.cx - vx / n * d * i / 6, e.cy - vy / n * d * i / 6);
    await page.mouse.up();
    await page.waitForTimeout(350);
    const ctr = await page.evaluate(function () { const c = window.map.getCenter(); return [c.lat, c.lng]; });
    if (dernier && Math.hypot(ctr[0] - dernier[0], ctr[1] - dernier[1]) < 1) immobile++; else immobile = 0;
    dernier = ctr;
  }
  const fin = await page.evaluate(function () { return window.__mb.ecran(window.__mbCible); });
  verifier(vu, titre + " : coin éloigné du calque calé amené à l'écran par glissé (" + pas + " glissés)",
    { ecranX: Math.round(fin.x), ecranY: Math.round(fin.y), cadre: [fin.l, fin.t, fin.r, fin.b] });
}

// Zoom à la molette centré sur le point hors image, jusqu'au zoom max : le point reste sous le pointeur.
async function zoomMolette(page, titre) {
  const depart = await page.evaluate(function () { return window.__mb.viserHorsImage(0); });
  const cadre = await page.evaluate(function () { const r = window.map.getContainer().getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  if (!(depart.x > cadre[0] && depart.x < cadre[2] && depart.y > cadre[1] && depart.y < cadre[3])) {
    pb(titre + " : point hors de l'image impossible à afficher au zoom 0 (vue ramenée dans les limites)");
    return;
  }
  await page.mouse.move(depart.x, depart.y);
  for (let i = 0; i < 12; i++) {
    const z = await page.evaluate(function () { return window.map.getZoom(); });
    if (z >= 2) break;
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(900);
  const fin = await page.evaluate(function () {
    const e = window.__mb.ecran(window.__mbP);
    return { z: window.map.getZoom(), x: e.x, y: e.y };
  });
  const ecart = Math.round(Math.hypot(fin.x - depart.x, fin.y - depart.y));
  verifier(fin.z >= 2 && ecart <= 30, titre + " : molette au zoom max sur un point hors de l'image, il reste sous le " +
    "pointeur (écart " + ecart + " px, zoom " + fin.z + ")", fin);
}

// Pincement simulé (deux doigts sur la carte, contexte tactile) centré sur le point hors image, jusqu'au
// zoom max : le point reste sous les doigts.
async function zoomPincement(page, titre) {
  const depart = await page.evaluate(function () { return window.__mb.viserHorsImage(-1); });
  const cadre = await page.evaluate(function () { const r = window.map.getContainer().getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  if (!(depart.x > cadre[0] && depart.x < cadre[2] && depart.y > cadre[1] && depart.y < cadre[3])) {
    pb(titre + " : point hors de l'image impossible à afficher (vue ramenée dans les limites)");
    return;
  }
  const r = await page.evaluate(async function (d) {
    const el = window.map.getContainer();
    const attendre = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    // 🩸 WebKit refuse `new Touch()` (Illegal constructor) : repli sur un Event « touch* » qui porte des listes
    // d'objets simples (Leaflet > TouchZoom ne lit que touches[i].clientX / clientY).
    let natif = true;
    try { new Touch({ identifier: 0, target: el, clientX: 0, clientY: 0 }); } catch (e) { natif = false; }
    function doigt(id, x, y) {
      return natif ? new Touch({ identifier: id, target: el, clientX: x, clientY: y })
                   : { identifier: id, target: el, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y };
    }
    function doigts(ecart) { return [doigt(1, d.x - ecart / 2, d.y), doigt(2, d.x + ecart / 2, d.y)]; }
    function envoyer(type, t) {
      const liste = type === "touchend" ? [] : t;
      let ev;
      if (natif) {
        ev = new TouchEvent(type, { touches: liste, targetTouches: liste, changedTouches: t, bubbles: true, cancelable: true });
      } else {
        ev = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, "touches", { value: liste });
        Object.defineProperty(ev, "targetTouches", { value: liste });
        Object.defineProperty(ev, "changedTouches", { value: t });
      }
      el.dispatchEvent(ev);
    }
    for (let essai = 0; essai < 4 && window.map.getZoom() < 2; essai++) {
      envoyer("touchstart", doigts(80));
      for (let i = 1; i <= 8; i++) { await attendre(30); envoyer("touchmove", doigts(80 + i * 30)); }
      await attendre(30);
      envoyer("touchend", doigts(320));
      await attendre(600);
    }
    await attendre(800);
    const e = window.__mb.ecran(window.__mbP);
    return { z: window.map.getZoom(), x: e.x, y: e.y, natif: natif };
  }, depart);
  inf(titre + " : pincement par " + (r.natif ? "TouchEvent natifs" : "événements touch* simulés (Touch refusé par le moteur)"));
  const ecart = Math.round(Math.hypot(r.x - depart.x, r.y - depart.y));
  verifier(r.z >= 2 && ecart <= 30, titre + " : pincement au zoom max sur un point hors de l'image, il reste sous les " +
    "doigts (écart " + ecart + " px, zoom " + r.z + ")", r);
}

async function scenarioTactile(nav) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
                                     deviceScaleFactor: 2, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  await page.addInitScript(outilsPage);
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () {
      return !!window.PlanRegistry && typeof window.chargerZipFichier === "function" && typeof JSZip !== "undefined";
    }, 30000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await ouvrir(page, "cale", "maxbounds-tactile.zip");
    await zoomPincement(page, "téléphone");
  } finally {
    await ctx.close();
  }
}

async function scenario(nav) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  await page.addInitScript(outilsPage);
  await page.route(RE_OSM, function (route) {
    route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PNG_1PX });
  });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () {
      return !!window.PlanRegistry && typeof window.chargerZipFichier === "function" && typeof JSZip !== "undefined";
    }, 30000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

    // ── L1 → L7 : calques calés hors de l'image ─────────────────────────
    console.log("— L1 : limites avec calques calés —");
    const info = await ouvrir(page, "cale", "maxbounds-cale.zip");
    inf("image " + info.W + " × " + info.H + ", " + info.nCalques + " calque(s), calés par le harnais : " + info.cales.length);
    const l1 = await page.evaluate(function () {
      const cales = window.__mb.calesEntrees();
      const sans = window.__mb.attendues(false);
      let dehors = 0;
      cales.forEach(function (c) {
        window.__mb.coins(c.overlay).forEach(function (p) {
          if (p[0] < sans[0][0] || p[0] > sans[1][0] || p[1] < sans[0][1] || p[1] > sans[1][1]) dehors++;
        });
      });
      return { cales: cales.length, niveaux: cales.map(function (c) { return c.level; }),
               visibles: cales.map(function (c) { return window.map.hasLayer(c.overlay); }),
               dehors: dehors, limites: window.__mb.limites(), attendues: window.__mb.attendues(true) };
    });
    verifier(l1.cales === info.cales.length, "calques calés enregistrés : " + l1.cales + " (niveaux " +
      l1.niveaux.join(", ") + ", affichés : " + l1.visibles.join(", ") + ")");
    verifier(l1.dehors > 0, "contre-essai : " + l1.dehors + " coin(s) de calque hors de l'ancienne emprise (image + marge)");
    verifier(window_egales(l1.limites, l1.attendues, 1e-6), "limites = image ∪ 4 coins de chaque calque + 30 %",
      { limites: l1.limites, attendues: l1.attendues });

    console.log("— L2 : coins atteignables —");
    await coinsAtteignables(page, "carte droite");

    console.log("— L3 : glissé à la souris —");
    await glisserJusquAuCoin(page, "carte droite");

    console.log("— L4 : fond OSM sous le plan —");
    const osm = await page.evaluate(function () {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      window.PLAN_CONFIG.plan.georef = {
        pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
        pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2.4e-6 },
        modele: "local"
      };
      if (!window.FondOsmPlan) return { allume: false };
      window.FondOsmPlan.majBouton();
      window.FondOsmPlan.allumer();
      return { allume: !!document.querySelector(".leaflet-pane.leaflet-ktaFondOsm-pane, [class*='ktaFondOsm']") };
    });
    await page.waitForTimeout(800);
    verifier(osm.allume, "fond OSM allumé (pane présent)");
    const l4 = await page.evaluate(function () { return window.__mb.egales(window.__mb.limites(), window.__mb.attendues(true), 1e-6); });
    verifier(l4, "fond OSM : limites inchangées (image ∪ calques)");
    await coinsAtteignables(page, "fond OSM");
    await glisserJusquAuCoin(page, "fond OSM");
    await page.evaluate(function () { window.FondOsmPlan.eteindre(); });

    console.log("— L5 : plan orienté —");
    const cap = await page.evaluate(async function () {
      window.MapBearing.setEnabled(true);
      window.startTracking();
      for (let i = 0; i < 40; i++) {
        window.MapBearing.onStep(window.map.getCenter());
        window.MapBearing.onHeading(40);
        await new Promise(function (r) { setTimeout(r, 50); });
        if (Math.abs(window.MapBearing.getBearing() - 320) < 1) break;
      }
      return window.MapBearing.getBearing();
    });
    verifier(Math.abs(cap - 320) < 1, "plan orienté : carte tournée (" + Math.round(cap) + "°)");
    await glisserJusquAuCoin(page, "plan orienté");
    const l5 = await page.evaluate(function () {
      // Pan hors limites puis bornage continu de mapBearing : le centre reste dans les limites élargies.
      window.map.panBy([4000, 4000], { animate: false });
      window.map.panInsideBounds(window.map.options.maxBounds, { animate: false });
      const c = window.map.getCenter(), b = window.__mb.limites();
      return { dedans: c.lat >= b[0][0] - 1e-6 && c.lat <= b[1][0] + 1e-6 && c.lng >= b[0][1] - 1e-6 && c.lng <= b[1][1] + 1e-6 };
    });
    verifier(l5.dedans, "plan orienté : un pan hors limites est ramené dans les limites élargies");
    await page.evaluate(function () {
      try { window.stopTracking(); } catch (e) {}
      window.MapBearing.setEnabled(false);
    });

    console.log("— L6 : zoom molette hors de l'image —");
    await zoomMolette(page, "ordinateur");

    console.log("— L7 : calque repositionné en place —");
    const l6 = await page.evaluate(async function () {
      const c = window.__mb.calesEntrees()[0];
      const W = window.APP_CONFIG.imageWidth;
      const [tl, tr, bl] = window.__mb.coins(c.overlay);
      c.overlay.reposition([tl[0], tl[1] + W], [tr[0], tr[1] + W], [bl[0], bl[1] + W]);
      await new Promise(function (r) { setTimeout(r, 100); });
      return { egales: window.__mb.egales(window.__mb.limites(), window.__mb.attendues(true), 1e-6),
               limites: window.__mb.limites(), attendues: window.__mb.attendues(true) };
    });
    verifier(l6.egales, "limites suivies après reposition du calque (+1 largeur d'image)", l6);
    await coinsAtteignables(page, "après reposition");

    // ── L8 : calques sans calage ────────────────────────────────────────
    console.log("— L8 : calques sans calage —");
    await ouvrir(page, "sans-calage", "maxbounds-sans-calage.zip");
    const l7 = await page.evaluate(function () {
      return { limites: window.__mb.limites(), attendues: window.__mb.attendues(false), n: window._ktaImageOverlays.length,
               cales: window.__mb.calesEntrees().length };
    });
    verifier(l7.cales === 0 && window_egales(l7.limites, l7.attendues, 0),
      "sans calage (" + l7.n + " calque(s)) : limites = image + marge, au pixel près", l7);

    // ── L9 : chargement tardif de l'ancien plan, puis plan sans calque ──
    console.log("— L9 : plan suivant ouvert pendant le chargement des calques calés —");
    await page.evaluate(function () {
      const ILC = window.ImageLayerCalibration;
      window.__mbRetenus = [];
      window.__mbOrigDims = ILC.loadImageDimensions;
      ILC.loadImageDimensions = function () {
        return new Promise(function (res) { window.__mbRetenus.push(function () { res({ width: 1000, height: 1000 }); }); });
      };
    });
    await page.evaluate(function (n) { return window.__mb.fabriquer("cale", n); }, "maxbounds-tardif.zip");
    await attendre(page, function () { return !!window.map && window.__mbRetenus && window.__mbRetenus.length > 0; }, 90000);
    await page.evaluate(function () { return window.__mbCharge; });
    const nRetenus = await page.evaluate(function () { return window.__mbRetenus.length; });
    inf(nRetenus + " calque(s) calé(s) retenu(s) en chargement");
    await ouvrir(page, "sans-calque", "maxbounds-sans-calque.zip");
    const l8 = await page.evaluate(async function () {
      window.__mbRetenus.forEach(function (f) { f(); });
      await new Promise(function (r) { setTimeout(r, 800); });
      window.ImageLayerCalibration.loadImageDimensions = window.__mbOrigDims;
      let calesSurCarte = 0;
      window.map.eachLayer(function (l) { if (l._ktaCalibrated) calesSurCarte++; });
      return { n: window._ktaImageOverlays.length, calesSurCarte: calesSurCarte,
               limites: window.__mb.limites(), attendues: window.__mb.attendues(false) };
    });
    verifier(nRetenus > 0, "contre-essai : des calques calés de l'ancien plan étaient en chargement");
    verifier(l8.n === 0, "plan sans calque : registre vide après la fin tardive des calques de l'ancien plan", l8);
    verifier(l8.calesSurCarte === 0, "aucun calque de l'ancien plan posé sur la nouvelle carte", l8);
    verifier(window_egales(l8.limites, l8.attendues, 0), "plan sans calque : limites = image seule + marge", l8);

    const utiles = erreurs.filter(function (e) { return !/swRegister|serviceWorker/i.test(e); });
    verifier(utiles.length === 0, "aucune erreur de page", utiles.slice(0, 3));
  } finally {
    await ctx.close();
  }
}

// Même comparaison que __mb.egales, côté Node.
function window_egales(a, b, tol) {
  if (!a || !b) return false;
  return [0, 1].every(function (i) { return [0, 1].every(function (j) { return Math.abs(a[i][j] - b[i][j]) <= tol; }); });
}

(async function main() {
  const server = require("./server.js");
  const joues = [];
  for (const nom of moteurs()) {
    let nav = null;
    try {
      nav = await lancerMoteur(nom);
      if (!nav) { inf("moteur " + nom + " absent : non joué"); continue; }
      MOTEUR = nom;
      console.log("\n══ moteur " + nom + " (" + nav.version() + ") ══");
      await scenario(nav);
      console.log("— L10 : pincement au téléphone (contexte tactile) —");
      await scenarioTactile(nav);
      joues.push(nom);
    } catch (e) {
      MOTEUR = nom;
      pb("exception : " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
    } finally {
      if (nav) await nav.close();
    }
  }
  if (server && server.close) server.close();
  if (!joues.length && !problemes.length) pb("aucun moteur lancé (KTA_MOTEURS=" + (process.env.KTA_MOTEURS || "") + ")");
  console.log("");
  if (problemes.length) {
    console.log("⚠️ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — limites = image ∪ calques calés (" + joues.join(", ") + ")");
  process.exit(0);
})();
