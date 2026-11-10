#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-osm-rotation.js — checkup de release : rotation manuelle des cartes OSM (Vue OSM, widget de l'accueil)
// =====================================================================
// Widget de l'accueil, contexte téléphone (390 × 844, tactile) : relevé fictif calé en mer, aperçu tuilé prêté par
// interception réseau (plan-config + tuiles magenta), fond OSM servi en local.
// H1 widget droit, bouton nord caché, `touch-action: none` · H2 un doigt vertical déplace la carte, la page ne défile
// pas (contre-essai : le même doigt hors du widget fait défiler la page) · H3 geste CDP : 8° = rien, 50° = la vue
// suit, bouton nord dans le coin bas gauche du widget, page ni défilée ni zoomée · H4 à 45° : tuiles OSM sous les
// 4 coins (contre-essai grilles) et tuiles du plan au pixel (contre-essai pane masqué) · H5 toucher d'un POI → SA
// bulle, droite · H6 Maj + molette sans zoom · H7 bouton nord · H8 changer de plan garde l'angle, carte recréée
// (refresh) droite et encore tournable.
// Vue OSM, contexte tactile 1280 × 820 :
// Le relevé fictif reçoit, comme checkup-osm-empilement.js, un tuilage V2 prêté (tuiles magenta en data:) et un
// calage fictif en mer, puis la Vue OSM s'ouvre dans un contexte tactile (1280 × 820) :
// O1 ouverture droite, bouton nord caché · O2 vrai geste CDP (`Input.dispatchTouchEvent`) : 8° de torsion = rien,
//   50° = la vue suit (sans rattraper le seuil), bouton nord dans le coin bas gauche de la FENÊTRE · O3 à 45° : chaque
//   coin de l'écran a sa tuile OSM demandée (contre-essai : patch des grilles coupé → coins manquants) et, au pixel,
//   des tuiles du plan (contre-essai : pane masqué → plus de magenta) · O4 sous rotation : le toucher d'un POI ouvre
//   SA bulle, droite ; la mesure pose ses points là où l'écran les montre (positions lues sur le rendu du
//   navigateur, pas recalculées) et son libellé reste droit · O5 Maj + molette tourne sans zoomer · O6 bouton nord
//   redresse · O7 fermeture / réouverture : vue droite, carte manipulable · O8 carte du plan et minicartes jamais
//   tournées · O9 aucune erreur de page.
// 🩸 `synthesizeScrollGesture` ne produit pas de geste à deux doigts ici : les doigts passent par dispatchTouchEvent.
// Usage : node scripts/smoke/checkup-osm-rotation.js   (SMOKE_PORT pour une copie de travail, OSM_ROT_SHOTS=dossier
// pour les captures)
// Doc : docs/architecture/vue-osm.md §rotation
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1"
};
const PNG_TUILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4xrAFAANqAZsvHqYeAAAAAElFTkSuQmCC";
const SEUIL = 15;
// Fond OSM du widget servi en local : gris uni (aucune requête vers le serveur de tuiles).
const GRIS = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOYNWsWAAOgAc+4dJWtAAAAAElFTkSuQmCC", "base64");

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
function verifier(cond, msg, detail) {
  if (cond) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
}
// Angle réellement appliqué après un geste en n pas : la vue part du pas qui franchit le seuil.
function franchi(total, n, seuil) {
  for (let i = 1; i <= n; i++) { if (total * i / n >= seuil + 1e-6) return total * i / n; }
  return total;
}

// Doigts CDP (dispatchTouchEvent) : un point par doigt.
function doigts(cdp, type, ps) {
  return cdp.send("Input.dispatchTouchEvent", { type: type, touchPoints: ps.map(function (p, i) {
    return { x: p[0], y: p[1], id: i, radiusX: 12, radiusY: 12, force: 1 };
  }) });
}

// Torsion à deux doigts de a1 degrés en 12 pas, doigts à d px l'un de l'autre.
async function tordreCdp(cdp, page, cx, cy, d, a1) {
  const pts = function (a) {
    const r = a * Math.PI / 180, ux = Math.cos(r) * d / 2, uy = Math.sin(r) * d / 2;
    return [[cx - ux, cy - uy], [cx + ux, cy + uy]];
  };
  await doigts(cdp, "touchStart", pts(0));
  for (let i = 1; i <= 12; i++) { await doigts(cdp, "touchMove", pts(a1 * i / 12)); await page.waitForTimeout(30); }
  await doigts(cdp, "touchEnd", []);
  await page.waitForTimeout(700);
}

// Un doigt qui glisse verticalement de dy px.
async function glisserCdp(cdp, page, x, y, dy) {
  await doigts(cdp, "touchStart", [[x, y]]);
  for (let i = 1; i <= 10; i++) { await doigts(cdp, "touchMove", [[x, y + dy * i / 10]]); await page.waitForTimeout(20); }
  await doigts(cdp, "touchEnd", []);
  await page.waitForTimeout(800);
}

// Angle d'une matrice CSS calculée (null sans transform).
function angleMatrice(t) {
  const mm = /matrix\(([^)]+)\)/.exec(t || "");
  if (!mm) return null;
  const v = mm[1].split(",").map(Number);
  return Math.atan2(v[1], v[0]) * 180 / Math.PI;
}

// Coins d'un rectangle (retrait de 6 px) magenta sur une capture.
async function coinsMagentaDe(page, rect) {
  const shot = await page.screenshot();
  return page.evaluate(async function (d) {
    const img = await new Promise(function (res, rej) { const i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = "data:image/png;base64," + d.b64; });
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
    const x = cv.getContext("2d"); x.drawImage(img, 0, 0);
    const ech = img.width / window.innerWidth, r = d.rect, res = [];
    [[r.l + 6, r.t + 6], [r.l + r.w - 7, r.t + 6], [r.l + r.w - 7, r.t + r.h - 7], [r.l + 6, r.t + r.h - 7]].forEach(function (p) {
      const px = x.getImageData(Math.round(p[0] * ech), Math.round(p[1] * ech), 1, 1).data;
      res.push(px[0] > 180 && px[1] < 60 && px[2] > 130);
    });
    return res;
  }, { b64: shot.toString("base64"), rect: rect });
}

// Dans la page : tuiles OSM manquantes sous les 4 coins de l'écran tourné de la carte du widget.
function coinsOsmManquantsWidget() {
  const m = window.__acc, s = m.getSize(), c = s.divideBy(2);
  const deg = m._ktaRotation ? m._ktaRotation.angle() : 0, a = -deg * Math.PI / 180;
  let grille = null;
  m.eachLayer(function (l) { if (l instanceof L.TileLayer) grille = l; });
  if (!grille) return null;
  const z = grille._tileZoom, ts = grille.getTileSize();
  const plage = grille._pxBoundsToTileRange(grille._getTiledPixelBounds(m.getCenter()));
  let manquants = 0;
  [[2, 2], [s.x - 2, 2], [s.x - 2, s.y - 2], [2, s.y - 2]].forEach(function (p) {
    const dx = p[0] - c.x, dy = p[1] - c.y;
    const q = L.point(dx * Math.cos(a) - dy * Math.sin(a) + c.x, dx * Math.sin(a) + dy * Math.cos(a) + c.y);
    const t = m.project(m.containerPointToLatLng(q), z).unscaleBy(ts).floor();
    t.z = z;
    if (!plage.contains(t) || !grille._tiles[grille._tileCoordsToKey(t)]) manquants++;
  });
  return { manquants: manquants, tuiles: Object.keys(grille._tiles).length };
}

// ── Widget de l'accueil ──
async function testerWidget(nav) {
  const erreurs = [];
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
                                     deviceScaleFactor: 2, serviceWorkers: "block" });
  const page = await ctx.newPage();
  let etape = "accueil";
  page.on("pageerror", function (e) { erreurs.push("[" + etape + "] " + String(e)); });
  const magenta = Buffer.from(PNG_TUILE.split(",")[1], "base64");
  await ctx.route("https://tile.openstreetmap.org/**", function (r) {
    r.fulfill({ status: 200, contentType: "image/png", body: GRIS });
  });
  await ctx.route(/\/tiles\/z-?\d+\/x\d+_y-\d+\.png$/, function (r) {
    r.fulfill({ status: 200, contentType: "image/png", body: magenta });
  });
  // Aperçu tuilé prêté au relevé fictif (plan serveur lu en HTTP par le widget).
  await ctx.route(/plan-config\.json$/, async function (r) {
    const rep = await r.fetch();
    let cfg;
    try { cfg = await rep.json(); } catch (e) { r.fulfill({ response: rep }); return; }
    cfg.plan = cfg.plan || {};
    cfg.plan.imageWidth = cfg.plan.imageWidth || 2048;
    cfg.plan.imageHeight = cfg.plan.imageHeight || 2048;
    cfg.plan.tiledV2 = true;
    cfg.tiling = { minNativeZoom: -3, maxNativeZoom: 0, tileSize: 256, format: "png" };
    r.fulfill({ response: rep, body: JSON.stringify(cfg), contentType: "application/json" });
  });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    const iv = setInterval(function () {
      if (!window.L || !L.Map) return;
      clearInterval(iv);
      L.Map.addInitHook(function () { if (this.getContainer().id === "ktaOsmHomeMap") window.__acc = this; });
    }, 5);
  }, LS_PREGATES);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  // 🩸 Le splash couvre l'accueil ~4 s puis quitte le DOM : un doigt posé avant tomberait sur lui (faux rouge en H2).
  await page.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  const id = await page.evaluate(function () {
    const p = (window.PlanRegistry.getAll() || []).find(function (x) {
      return /fictif/i.test((x.name || "") + " " + (window.PlanRegistry.displayName ? window.PlanRegistry.displayName(x) : ""));
    });
    if (!p) return null;
    window.KmzExport.setCalibration(p.id, { pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
                                            pointB: { x: 1000, y: 1000, lat: 0.002, lng: 0.003 } });
    window.__pt = "ktaOsmPlan_" + String(p.id).replace(/[^a-zA-Z0-9_-]/g, "_") + "_tuiles";
    window.__acc = null;
    window.OsmHomePreview.refresh();
    return p.id;
  });
  if (!id) { pb("accueil : relevé fictif absent du registre"); await ctx.close(); return; }
  try {
    await attendre(page, function () {
      const m = window.__acc, p = m && m._loaded && m.getPane(window.__pt);
      return !!p && p.querySelectorAll("img").length > 0;
    }, 30000);
  } catch (e) { pb("accueil : aperçu tuilé du widget jamais rendu (" + e.message + ")"); await ctx.close(); return; }
  const cadrer = async function () {
    await page.evaluate(function () { document.getElementById("ktaOsmHomeMap").scrollIntoView({ block: "center" }); });
    await page.waitForTimeout(600);
    return page.evaluate(function () {
      const r = document.getElementById("ktaOsmHomeMap").getBoundingClientRect();
      return { l: r.left, t: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
  };
  let rect = await cadrer();
  inf("widget " + Math.round(rect.w) + "×" + Math.round(rect.h) + " px");
  // Garde anti-faux-rouge : rien ne couvre le widget là où les doigts se posent.
  const dessus = await page.evaluate(function (r) {
    const e = document.elementFromPoint(r.cx, r.cy);
    return e && e.closest("#ktaOsmHomeMap") ? null : (e ? (e.id || e.className || e.tagName) : "rien");
  }, rect);
  if (dessus) { pb("accueil : le widget est couvert (" + dessus + "), gestes non joués"); await ctx.close(); return; }
  const etat = function () {
    return page.evaluate(function () {
      const m = window.__acc, r = window.OsmHomePreview.getRotation(), el = m.getContainer();
      const nord = el.querySelector(".kta-nord-ctrl");
      let defil = window.scrollY, n = el.parentElement;
      while (n) { defil += n.scrollTop; n = n.parentElement; }
      const c = m.getCenter();
      return { b: r ? r.getBearing() : null, zoom: m.getZoom(), on: el.classList.contains("kta-bearing-on"),
               nord: !!(nord && nord.classList.contains("kta-nord-visible") && nord.getBoundingClientRect().width > 0),
               ta: getComputedStyle(el).touchAction, defil: defil, lat: c.lat,
               echelle: window.visualViewport ? window.visualViewport.scale : 1,
               drag: !!(m.dragging && m.dragging.enabled()) };
    });
  };
  const cdp = await ctx.newCDPSession(page);

  etape = "H1";
  console.log("— H1 : widget de l'accueil droit —");
  const h1 = await etat();
  verifier(h1.b === 0 && !h1.nord && !h1.on && h1.ta === "none", "widget droit, bouton nord caché, touch-action: none", h1);

  etape = "H2";
  console.log("— H2 : un doigt (comportement inchangé) —");
  await glisserCdp(cdp, page, rect.cx, rect.cy, -80);
  const h2 = await etat();
  verifier(Math.abs(h2.lat - h1.lat) > 1e-6 && h2.defil === h1.defil && h2.b === 0,
    "un doigt vertical sur le widget : la carte se déplace, la page ne défile pas", { avant: h1, apres: h2 });
  const hors = await page.evaluate(function () {
    const r = document.getElementById("ktaOsmHomeBox").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: Math.max(60, r.top - 80) };
  });
  await glisserCdp(cdp, page, hors.x, hors.y, 150);
  const h2b = await etat();
  verifier(h2b.defil !== h2.defil, "contre-essai : le même doigt hors du widget fait défiler la page (la mesure le voit)",
    { avant: h2.defil, apres: h2b.defil });
  rect = await cadrer();

  etape = "H3";
  console.log("— H3 : deux doigts (CDP) —");
  const h3a0 = await etat();
  await tordreCdp(cdp, page, rect.cx, rect.cy, 160, 8);
  const h3a = await etat();
  verifier(Math.abs(h3a.b) < 0.01, "8° de torsion : pas de rotation", h3a);
  await tordreCdp(cdp, page, rect.cx, rect.cy, 160, 50);
  const h3b = await etat();
  const attendu = 50 - franchi(50, 12, SEUIL);
  verifier(Math.abs(h3b.b - attendu) < 2 && h3b.nord && h3b.on,
    "50° de torsion : vue à " + (h3b.b || 0).toFixed(1) + "° (attendu " + attendu.toFixed(1) + "°), bouton nord visible", h3b);
  verifier(h3b.defil === h3a0.defil && h3b.echelle === 1 && h3b.ta === "none",
    "pendant la rotation : page ni défilée ni zoomée, touch-action: none", { avant: h3a0, apres: h3b });
  const nordPos = await page.evaluate(function () {
    const c = document.getElementById("ktaOsmHomeMap").getBoundingClientRect();
    const b = document.querySelector("#ktaOsmHomeMap .kta-nord-btn").getBoundingClientRect();
    return { dedans: b.left >= c.left && b.right <= c.right && b.top >= c.top && b.bottom <= c.bottom,
             basGauche: b.left - c.left < 60 && c.bottom - b.bottom < 60, w: b.width };
  });
  verifier(nordPos.dedans && nordPos.basGauche && nordPos.w >= 40, "bouton nord dans le coin bas gauche du widget", nordPos);

  etape = "H4";
  console.log("— H4 : coins couverts à 45° —");
  // Centre du plan, premier zoom où le widget tourné tombe ENTIER dans le plan (un coin hors plan ne prouve rien).
  const cadre = await page.evaluate(function () {
    const m = window.__acc, r = window.OsmHomePreview.getRotation();
    let bb = null;
    m.eachLayer(function (l) {
      if (!(l instanceof L.ImageOverlay) || l.options.pane !== window.__pt) return;
      const b = l.getBounds();
      bb = bb ? bb.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
    });
    if (!bb) return null;
    r.setManuel(45);
    for (let z = 12; z <= 19; z++) {
      m.setView(bb.getCenter(), z, { animate: false });
      const vue = r.zoneVisible(0);
      if (vue && bb.contains(vue)) return { zoom: z };
    }
    return { zoom: m.getZoom(), horsPlan: true };
  });
  inf("cadre du contrôle des coins : " + JSON.stringify(cadre));
  // Bords de l'écran droit calés sur la grille de tuiles : un coin qui déborde tombe forcément dans une tuile que la
  // vue droite ne demande pas (sinon, sur un petit widget, le contre-essai peut passer par chance).
  await page.evaluate(function () {
    const m = window.__acc, b = m.getPixelBounds(), ts = 256;
    window.__centrePlan = m.getCenter();
    m.panBy([-(((b.min.x % ts) + ts) % ts), -(((b.min.y % ts) + ts) % ts)], { animate: false });
  });
  await page.waitForTimeout(1500);
  const cv = await page.evaluate(coinsOsmManquantsWidget);
  verifier(cv && cv.manquants === 0, "tuiles OSM demandées sous les 4 coins du widget tourné", cv);
  await page.evaluate(function () { window.__acc._ktaRotation.grilles = false; });
  const temoin = await page.evaluate(coinsOsmManquantsWidget);
  verifier(temoin && temoin.manquants > 0, "contre-essai : sans l'élargissement des grilles, des coins manquent", temoin);
  await page.evaluate(function () {
    const m = window.__acc;
    m._ktaRotation.grilles = true;
    // retour au centre du plan : le calage sur la grille a pu pousser un coin hors du plan
    m.setView(window.__centrePlan, m.getZoom(), { animate: false });
  });
  await page.waitForTimeout(800);
  // Pixels : seules les tuiles du plan restent visibles, opaques ; contrôles masqués (bouton nord dans un coin).
  const masquer = function (oui) {
    return page.evaluate(function (o) {
      const m = window.__acc, tu = m.getPane(window.__pt), plan = tu.parentNode;
      ["tilePane", "overlayPane", "markerPane", "shadowPane"].forEach(function (n) {
        const p = m.getPane(n); if (p) p.style.visibility = o ? "hidden" : "";
      });
      Array.from(plan.children).forEach(function (c) { if (c !== tu) c.style.visibility = o ? "hidden" : ""; });
      const cc = m.getContainer().querySelector(".leaflet-control-container");
      if (cc) cc.style.visibility = o ? "hidden" : "";
      if (tu.dataset.op === undefined) tu.dataset.op = tu.style.opacity;
      tu.style.opacity = o ? "1" : tu.dataset.op;
    }, oui);
  };
  await masquer(true);
  await page.waitForTimeout(300);
  if (process.env.OSM_ROT_SHOTS) await page.screenshot({ path: path.join(process.env.OSM_ROT_SHOTS, "h4-widget-45.png") });
  const px = await coinsMagentaDe(page, rect);
  verifier(px.every(Boolean), "tuiles du plan peintes dans les 4 coins du widget tourné", px);
  await page.evaluate(function () { window.__acc.getPane(window.__pt).style.visibility = "hidden"; });
  await page.waitForTimeout(200);
  const px0 = await coinsMagentaDe(page, rect);
  verifier(px0.every(function (v) { return !v; }), "contre-essai : pane du plan masqué, aucun coin magenta", px0);
  await page.evaluate(function () { window.__acc.getPane(window.__pt).style.visibility = ""; });
  await masquer(false);

  etape = "H5";
  console.log("— H5 : toucher d'un POI sous rotation —");
  await page.evaluate(function () { window.__acc.setZoom(window.__acc.getZoom() - 1, { animate: false }); });
  await page.waitForTimeout(900);
  const poi = await page.evaluate(function () {
    const m = window.__acc, c = m.getContainer().getBoundingClientRect();
    let vu = null;
    m.eachLayer(function (l) {
      if (vu || !(l instanceof L.Marker) || !l._icon || !l.getPopup || !l.getPopup()) return;
      const r = l._icon.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x > c.left + 40 && x < c.right - 40 && y > c.top + 40 && y < c.bottom - 40) vu = { x: x, y: y, id: L.stamp(l) };
    });
    return vu;
  });
  if (!poi) pb("accueil : aucun POI visible pour le toucher sous rotation");
  else {
    await page.touchscreen.tap(poi.x, poi.y);
    await page.waitForTimeout(700);
    const bulle = await page.evaluate(function (pid) {
      const m = window.__acc;
      let ouverte = null;
      m.eachLayer(function (l) { if (l instanceof L.Marker && l.isPopupOpen && l.isPopupOpen()) ouverte = L.stamp(l); });
      const w = m.getContainer().querySelector(".leaflet-popup-content-wrapper");
      return { ouverte: ouverte, attendu: pid, t: w ? getComputedStyle(w).transform : null,
               b: window.OsmHomePreview.getRotation().getBearing() };
    }, poi.id);
    bulle.angle = angleMatrice(bulle.t);
    verifier(bulle.ouverte === bulle.attendu, "toucher d'un POI sous rotation : SA bulle s'ouvre", bulle);
    verifier(bulle.angle !== null && Math.abs(bulle.angle + bulle.b) < 1, "bulle contre-tournée (droite à l'écran)", bulle);
    await page.evaluate(function () { window.__acc.closePopup(); });
  }

  etape = "H6";
  console.log("— H6 : Maj + molette —");
  await page.evaluate(function () { window.OsmHomePreview.getRotation().reset(); });
  const z6 = (await etat()).zoom;
  // Deltas réellement reçus (le contexte téléphone à densité 2 ne rend pas les 200 px demandés) : relevés avant
  // mapBearing, qui avale l'événement.
  await page.evaluate(function () {
    window.__molette = 0;
    window.addEventListener("wheel", function (e) {
      if (!e.shiftKey) return;
      const brut = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      window.__molette += brut * (e.deltaMode === 1 ? 33 : (e.deltaMode === 2 ? 400 : 1));
    }, { capture: true, passive: true });
  });
  await page.mouse.move(rect.cx, rect.cy);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(100);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(600);
  const h6 = await etat();
  const recu = await page.evaluate(function () { return window.__molette; });
  const vise = Math.abs(recu) * 0.15;
  h6.recu = recu;
  verifier(vise > 5 && Math.abs(Math.abs(h6.b > 180 ? h6.b - 360 : h6.b) - vise) < 1.5 && h6.zoom === z6,
    "Maj + molette (" + recu + " px reçus) : vue à " + h6.b.toFixed(1) + "° (attendu " + vise.toFixed(1) + "°), zoom inchangé", h6);

  etape = "H7";
  console.log("— H7 : bouton nord —");
  const nb = await page.evaluate(function () {
    const r = document.querySelector("#ktaOsmHomeMap .kta-nord-btn").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.touchscreen.tap(nb.x, nb.y);
  await page.waitForTimeout(700);
  const h7 = await etat();
  verifier(h7.b === 0 && !h7.nord && !h7.on && h7.drag, "bouton nord (touché) : widget droit, bouton caché, carte de nouveau glissable", h7);

  etape = "H8";
  console.log("— H8 : changement de plan, carte recréée —");
  await page.evaluate(function (pid) {
    window.OsmHomePreview.getRotation().setManuel(30);
    window.OsmHomePreview.selectPlan(pid);
  }, id);
  await page.waitForTimeout(800);
  const h8a = await etat();
  verifier(Math.abs(h8a.b - 30) < 0.01 && h8a.nord, "plan choisi dans la liste : même carte, l'angle reste", h8a);
  await page.evaluate(function () { window.__acc = null; window.OsmHomePreview.refresh(); });
  await attendre(page, function () { return !!window.__acc && window.__acc._loaded; }, 20000);
  await page.waitForTimeout(1500);
  const h8b = await etat();
  verifier(h8b.b === 0 && !h8b.on && !h8b.nord && h8b.drag, "carte recréée (retour à l'accueil, refresh) : nord en haut, glissable", h8b);
  rect = await cadrer();
  await tordreCdp(cdp, page, rect.cx, rect.cy, 160, -40);
  const h8c = await etat();
  verifier(Math.abs(h8c.b) > 5 && h8c.nord, "le geste tourne la nouvelle carte", h8c);

  verifier(erreurs.length === 0, "accueil : aucune erreur de page", erreurs.slice(0, 3));
  await ctx.close();
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const erreurs = [];
  try {
    const nom = planFictif();
    if (!nom) { pb("relevé fictif absent de data/index.json"); return; }
    await testerWidget(nav);
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, hasTouch: true });
    const page = await ctx.newPage();
    let etape = "démarrage";
    page.on("pageerror", function (e) { erreurs.push("[" + etape + "] " + String(e) + " " + String(e.stack || "").split(String.fromCharCode(10)).slice(1, 4).join(" | ")); });
    await page.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
      // cartes privées aux modules : captées à leur création
      window.__cartes = [];
      const iv = setInterval(function () {
        if (!window.L || !L.Map) return;
        clearInterval(iv);
        L.Map.addInitHook(function () {
          window.__cartes.push(this);
          if (this.getContainer().id === "kta-osm-map") window.__ktaOsmCarte = this;
        });
      }, 5);
    }, LS_PREGATES);
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.getByText(nom, { exact: false }).first().click();
    await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
    await page.waitForTimeout(2000);

    const prep = await page.evaluate(function (png) {
      const pc = window.PLAN_CONFIG, p = pc.plan;
      const W = p.imageWidth || (window.APP_CONFIG && window.APP_CONFIG.imageWidth);
      const H = p.imageHeight || (window.APP_CONFIG && window.APP_CONFIG.imageHeight);
      p.imageWidth = W; p.imageHeight = H;
      p.tiledV2 = true;
      pc.tiling = { minNativeZoom: -3, maxNativeZoom: 0, tileSize: 256, format: "png" };
      const ext = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(pc.tiling) : "jpg";
      window.RUNTIME_ASSETS = window.RUNTIME_ASSETS || {};
      for (let z = -3; z <= 0; z++) {
        const sc = Math.pow(2, -z);
        const cols = Math.ceil(Math.ceil(W / sc) / 256), rows = Math.ceil(Math.ceil(H / sc) / 256);
        for (let c = 0; c < cols; c++) for (let k = 1; k <= rows; k++) {
          window.RUNTIME_ASSETS["data/tiles/z" + z + "/x" + c + "_y" + (-k) + "." + ext] = { url: png + "#z" + z };
        }
      }
      p.georef = { pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
                   pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2e-6 } };
      return { W: W, H: H, tactile: !!(L.Browser && L.Browser.touchNative) };
    }, PNG_TUILE);
    inf("plan " + prep.W + "×" + prep.H + " px, famille d'événements : " + (prep.tactile ? "touch" : "pointeurs"));

    const ouvrir = async function () {
      await page.evaluate(function () { window.__ktaOsmCarte = null; window.OsmView.open(); });
      await attendre(page, function () {
        return !!window.__ktaOsmCarte && document.querySelectorAll("#kta-osm-map img.leaflet-image-layer").length > 0;
      }, 30000);
      await page.waitForTimeout(1200);
    };
    const etat = function () {
      return page.evaluate(function () {
        const r = window.OsmView.getRotation(), m = window.__ktaOsmCarte;
        const nord = m.getContainer().querySelector(".kta-nord-ctrl");
        const vis = !!(nord && nord.classList.contains("kta-nord-visible") && nord.getBoundingClientRect().width > 0);
        return { b: r ? r.getBearing() : null, nord: vis, zoom: m.getZoom(),
                 on: m.getContainer().classList.contains("kta-bearing-on"),
                 drag: !!(m.dragging && m.dragging.enabled()) };
      });
    };
    const rect = await (async function () { await ouvrir(); return page.evaluate(function () {
      const r = document.getElementById("kta-osm-map").getBoundingClientRect();
      return { l: r.left, t: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }); })();

    etape = "O1";
    console.log("— O1 : ouverture —");
    const e1 = await etat();
    verifier(e1.b === 0 && !e1.nord && !e1.on, "Vue OSM ouverte droite, bouton nord caché", e1);

    etape = "O2";
    console.log("— O2 : vrai geste à deux doigts (CDP) —");
    const cdp = await ctx.newCDPSession(page);
    const tordre = async function (cx, cy, d, a1) {
      const pts = function (a) {
        const r = a * Math.PI / 180, ux = Math.cos(r) * d / 2, uy = Math.sin(r) * d / 2;
        return [[cx - ux, cy - uy], [cx + ux, cy + uy]];
      };
      const env = function (type, ps) {
        return cdp.send("Input.dispatchTouchEvent", { type: type, touchPoints: ps.map(function (p, i) {
          return { x: p[0], y: p[1], id: i, radiusX: 12, radiusY: 12, force: 1 };
        }) });
      };
      await env("touchStart", pts(0));
      for (let i = 1; i <= 12; i++) { await env("touchMove", pts(a1 * i / 12)); await page.waitForTimeout(30); }
      await env("touchEnd", []);
      await page.waitForTimeout(700);
    };
    await tordre(rect.cx, rect.cy, 220, 8);
    const e2a = await etat();
    verifier(Math.abs(e2a.b) < 0.01, "8° de torsion (sous le seuil) : pas de rotation", e2a);
    await tordre(rect.cx, rect.cy, 220, 50);
    const e2b = await etat();
    const attendu = 50 - franchi(50, 12, SEUIL);
    verifier(Math.abs(e2b.b - attendu) < 2 && e2b.nord && e2b.on,
      "50° de torsion : vue à " + (e2b.b || 0).toFixed(1) + "° (attendu " + attendu.toFixed(1) + "°), bouton nord visible", e2b);
    const nordPos = await page.evaluate(function () {
      const c = document.getElementById("kta-osm-map").getBoundingClientRect();
      const b = document.querySelector("#kta-osm-map .kta-nord-btn").getBoundingClientRect();
      return { dedans: b.left >= c.left && b.right <= c.right && b.top >= c.top && b.bottom <= c.bottom,
               basGauche: b.left - c.left < 60 && c.bottom - b.bottom < 60, w: b.width, h: b.height };
    });
    verifier(nordPos.dedans && nordPos.basGauche && nordPos.w >= 40, "bouton nord dans le coin bas gauche de la fenêtre OSM", nordPos);

    etape = "O3";
    console.log("— O3 : coins couverts à 45° —");
    // Centre du plan, premier zoom où l'écran tourné à 45° tombe ENTIER dans le plan : chaque coin doit montrer ses
    // pixels (un coin hors du plan ne prouverait rien).
    const cadre = await page.evaluate(function () {
      const m = window.__ktaOsmCarte, r = window.OsmView.getRotation(), bb = window.OsmView.getPlanGpsBbox();
      if (!bb) return null;
      r.setManuel(45);
      for (let z = m.getZoom(); z <= m.getZoom() + 6; z++) {
        m.setView(bb.getCenter(), z, { animate: false });
        const vue = r.zoneVisible(0);
        if (vue && bb.contains(vue)) return { zoom: z };
      }
      return { zoom: m.getZoom(), horsPlan: true };
    });
    inf("cadre du contrôle des coins : " + JSON.stringify(cadre));
    await page.waitForTimeout(2500);
    const couverture = function () {
      return page.evaluate(function () {
        const m = window.__ktaOsmCarte, s = m.getSize(), c = s.divideBy(2);
        const deg = window.OsmView.getRotation().getBearing(), a = -deg * Math.PI / 180;
        let grille = null;
        m.eachLayer(function (l) { if (l instanceof L.TileLayer) grille = l; });
        if (!grille) return null;
        const z = grille._tileZoom, ts = grille.getTileSize();
        // tuile demandée = dans la plage que la grille calcule pour cet écran ET présente
        const plage = grille._pxBoundsToTileRange(grille._getTiledPixelBounds(m.getCenter()));
        const manquants = [];
        [[2, 2], [s.x - 2, 2], [s.x - 2, s.y - 2], [2, s.y - 2]].forEach(function (p) {
          const dx = p[0] - c.x, dy = p[1] - c.y;
          const q = L.point(dx * Math.cos(a) - dy * Math.sin(a) + c.x, dx * Math.sin(a) + dy * Math.cos(a) + c.y);
          const ll = m.containerPointToLatLng(q);
          const t = m.project(ll, z).unscaleBy(ts).floor();
          t.z = z;
          if (!plage.contains(t) || !grille._tiles[grille._tileCoordsToKey(t)]) manquants.push(p);
        });
        return { manquants: manquants.length, tuiles: Object.keys(grille._tiles).length };
      });
    };
    const cv = await couverture();
    verifier(cv && cv.manquants === 0, "tuiles OSM demandées sous les 4 coins de l'écran tourné", cv);
    const temoin = await page.evaluate(function () { window.__ktaOsmCarte._ktaRotation.grilles = false; })
      .then(couverture);
    verifier(temoin && temoin.manquants > 0, "contre-essai : sans l'élargissement des grilles, des coins manquent (le test voit le défaut)", temoin);
    await page.evaluate(function () {
      const m = window.__ktaOsmCarte;
      m._ktaRotation.grilles = true;
      m.eachLayer(function (l) { if (l instanceof L.TileLayer) l._update(); });
    });
    await page.waitForTimeout(400);
    const cv2 = await couverture();
    verifier(cv2 && cv2.manquants === 0, "élargissement rétabli : coins de nouveau couverts", cv2);

    // Pixels : seules les tuiles du plan restent visibles, opaques.
    const coinsMagenta = async function () {
      const shot = await page.screenshot();
      return page.evaluate(async function (d) {
        const img = await new Promise(function (res, rej) { const i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = "data:image/png;base64," + d.b64; });
        const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
        const x = cv.getContext("2d"); x.drawImage(img, 0, 0);
        const ech = img.width / window.innerWidth, r = d.rect, res = [];
        [[r.l + 6, r.t + 6], [r.l + r.w - 7, r.t + 6], [r.l + r.w - 7, r.t + r.h - 7], [r.l + 6, r.t + r.h - 7]].forEach(function (p) {
          const px = x.getImageData(Math.round(p[0] * ech), Math.round(p[1] * ech), 1, 1).data;
          res.push(px[0] > 180 && px[1] < 60 && px[2] > 130);   // magenta des tuiles prêtées
        });
        return res;
      }, { b64: shot.toString("base64"), rect: rect });
    };
    const masquerSauf = function (montrer) {
      return page.evaluate(function (mt) {
        const m = window.__ktaOsmCarte;
        ["tilePane", "overlayPane", "markerPane", "shadowPane"].forEach(function (n) {
          const p = m.getPane(n); if (p) p.style.visibility = mt ? "hidden" : "";
        });
        const t = m.getPane("ktaOsmTuiles");
        t.dataset.op = t.dataset.op || t.style.opacity;
        t.style.opacity = mt ? "1" : t.dataset.op;
      }, montrer);
    };
    await masquerSauf(true);
    await page.waitForTimeout(300);
    if (process.env.OSM_ROT_SHOTS) await page.screenshot({ path: path.join(process.env.OSM_ROT_SHOTS, "o3-plan-45.png") });
    const px = await coinsMagenta();
    verifier(px.every(Boolean), "tuiles du plan peintes dans les 4 coins de l'écran tourné", px);
    await page.evaluate(function () { window.__ktaOsmCarte.getPane("ktaOsmTuiles").style.visibility = "hidden"; });
    await page.waitForTimeout(200);
    const px0 = await coinsMagenta();
    verifier(px0.every(function (v) { return !v; }), "contre-essai : pane du plan masqué, aucun coin magenta (le test lit bien les pixels)", px0);
    await page.evaluate(function () { window.__ktaOsmCarte.getPane("ktaOsmTuiles").style.visibility = ""; });
    await masquerSauf(false);

    etape = "O4";
    console.log("— O4 : toucher et mesure sous rotation —");
    await page.evaluate(function () { window.__ktaOsmCarte.setZoom(window.__ktaOsmCarte.getZoom() - 2, { animate: false }); });
    await page.waitForTimeout(1200);
    // Un POI visible : centre de son icône LU sur le rendu (rotation comprise).
    const poi = await page.evaluate(function () {
      const m = window.__ktaOsmCarte, c = m.getContainer().getBoundingClientRect();
      let vu = null;
      m.eachLayer(function (l) {
        if (vu || !(l instanceof L.Marker) || !l._icon || !l.getPopup || !l.getPopup()) return;
        const r = l._icon.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (x > c.left + 80 && x < c.right - 80 && y > c.top + 80 && y < c.bottom - 80) vu = { x: x, y: y, id: L.stamp(l) };
      });
      return vu;
    });
    if (!poi) pb("aucun POI visible pour le toucher sous rotation");
    else {
      await page.mouse.click(poi.x, poi.y);
      await page.waitForTimeout(600);
      const bulle = await page.evaluate(function (id) {
        const m = window.__ktaOsmCarte;
        let ouverte = null;
        m.eachLayer(function (l) { if (l instanceof L.Marker && l.isPopupOpen && l.isPopupOpen()) ouverte = L.stamp(l); });
        const w = m.getContainer().querySelector(".leaflet-popup-content-wrapper");
        let angle = null;
        if (w) {
          const t = getComputedStyle(w).transform, mm = /matrix\(([^)]+)\)/.exec(t);
          if (mm) { const v = mm[1].split(",").map(Number); angle = Math.atan2(v[1], v[0]) * 180 / Math.PI; }
        }
        return { ouverte: ouverte, attendu: id, angle: angle, b: window.OsmView.getRotation().getBearing() };
      }, poi.id);
      verifier(bulle.ouverte === bulle.attendu, "toucher d'un POI sous rotation : SA bulle s'ouvre", bulle);
      verifier(bulle.angle !== null && Math.abs(bulle.angle + bulle.b) < 1, "bulle contre-tournée (droite à l'écran)", bulle);
      await page.evaluate(function () { window.__ktaOsmCarte.closePopup(); });
    }
    // Mesure : deux repères posés sur la carte, cliqués là où le navigateur les dessine.
    const reperes = await page.evaluate(function () {
      const m = window.__ktaOsmCarte, s = m.getSize();
      const l0 = m.containerPointToLatLng([s.x * 0.35, s.y * 0.4]), l1 = m.containerPointToLatLng([s.x * 0.62, s.y * 0.66]);
      window.__reperes = [l0, l1].map(function (ll) {
        return L.marker(ll, { interactive: false, icon: L.divIcon({ className: "", iconSize: [2, 2] }) }).addTo(m);
      });
      return window.__reperes.map(function (mk) {
        const r = mk._icon.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, lat: mk.getLatLng().lat, lng: mk.getLatLng().lng };
      });
    });
    await page.evaluate(function () { window.__reperes.forEach(function (mk) { mk.remove(); }); window.OsmMesure.activer(window.__ktaOsmCarte); });
    await page.mouse.click(reperes[0].x, reperes[0].y); await page.waitForTimeout(350);
    await page.mouse.click(reperes[1].x, reperes[1].y); await page.waitForTimeout(500);
    const mes = await page.evaluate(function (rp) {
      const a = L.latLng(rp[0].lat, rp[0].lng), b = L.latLng(rp[1].lat, rp[1].lng);
      const info = document.querySelector("#kta-osm-mes-floater .kta-osm-mes-info");
      const span = document.querySelector("#kta-osm-map .kta-osm-mes-seg span");
      let angle = null;
      if (span) {
        const mm = /matrix\(([^)]+)\)/.exec(getComputedStyle(span).transform);
        if (mm) { const v = mm[1].split(",").map(Number); angle = Math.atan2(v[1], v[0]) * 180 / Math.PI; }
      }
      // 1 px d'écran à ce zoom, en mètres : tolérance du clic
      const m = window.__ktaOsmCarte, c = m.getSize().divideBy(2);
      const pxM = m.containerPointToLatLng(c).distanceTo(m.containerPointToLatLng(c.add([1, 0])));
      return { lu: info ? info.textContent.trim() : null, attendu: window.formatDistance(a.distanceTo(b), 1),
               d: a.distanceTo(b), pxM: pxM, angle: angle, b: window.OsmView.getRotation().getBearing() };
    }, reperes);
    const lu = parseFloat(String(mes.lu || "").replace(/\s/g, "").replace(",", "."));
    const attenduNb = parseFloat(String(mes.attendu).replace(/\s/g, "").replace(",", "."));
    verifier(Number.isFinite(lu) && Math.abs(lu - attenduNb) <= Math.max(0.2, attenduNb * 0.01),
      "mesure sous rotation : " + mes.lu + " (attendu " + mes.attendu + ")", mes);
    verifier(mes.angle !== null && Math.abs(mes.angle + mes.b) < 1, "libellé de segment droit à l'écran", mes);
    await page.evaluate(function () { window.OsmMesure.desactiver(); });

    etape = "O5";
    console.log("— O5 : Maj + molette —");
    await page.evaluate(function () { window.OsmView.getRotation().reset(); });
    const z0 = (await etat()).zoom;
    await page.mouse.move(rect.cx, rect.cy);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(100);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(600);
    const e5 = await etat();
    verifier(Math.abs(Math.abs(e5.b > 180 ? e5.b - 360 : e5.b) - 30) < 1.5 && e5.zoom === z0,
      "Maj + molette (200 px) : vue à " + e5.b.toFixed(1) + "°, zoom inchangé", e5);

    etape = "O6";
    console.log("— O6 : bouton nord —");
    await page.click("#kta-osm-map .kta-nord-btn");
    await page.waitForTimeout(700);
    const e6 = await etat();
    verifier(e6.b === 0 && !e6.nord && !e6.on && e6.drag, "bouton nord : vue droite, bouton caché, carte de nouveau glissable", e6);

    etape = "O7";
    console.log("— O7 : fermeture / réouverture —");
    await page.evaluate(function () { window.OsmView.getRotation().setManuel(30); });
    await page.click("#kta-osm-close"); await page.waitForTimeout(600);
    await ouvrir();
    const e7 = await etat();
    verifier(e7.b === 0 && !e7.on && e7.drag && !e7.nord, "réouverture : vue droite et manipulable", e7);
    await tordre(rect.cx, rect.cy, 220, -40);
    const e7b = await etat();
    verifier(Math.abs(e7b.b) > 5 && e7b.nord, "le geste tourne encore la carte rouverte", e7b);

    etape = "O8";
    console.log("— O8 : autres cartes —");
    const autres = await page.evaluate(function () {
      const osm = window.__ktaOsmCarte;
      // cartes vivantes seulement : une Vue OSM fermée garde sa marque, sans conteneur dans la page
      // le widget de l'accueil a sa propre rotation (contrôlée en H) : hors du compte
      const tournees = window.__cartes.filter(function (m) {
        if (m === osm || m === window.map || !document.body.contains(m.getContainer())) return false;
        if (m.getContainer().id === "ktaOsmHomeMap") return false;
        return !!m._ktaRotation || !!m._ktaRotatePane;
      }).length;
      return { cartes: window.__cartes.length, tournees: tournees, plan: window.MapBearing.getBearing(),
               planOn: window.map.getContainer().classList.contains("kta-bearing-on") };
    });
    verifier(autres.tournees === 0, "aucune autre carte (minicartes) ne porte de rotation", autres);
    verifier(autres.plan === 0 && !autres.planOn, "carte du plan restée droite pendant la Vue OSM", autres);
    await page.click("#kta-osm-close"); await page.waitForTimeout(400);

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
    await ctx.close();
  } catch (e) {
    pb("exception : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
    console.log(problemes.length ? "\n❌ " + problemes.length + " problème(s)" : "\n✅ cartes OSM (widget de l'accueil, Vue OSM) : rotation manuelle");
    process.exit(problemes.length ? 1 : 0);
  }
})();
