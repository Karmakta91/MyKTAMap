#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-rotation-bloquee.js — checkup de RELEASE (Playwright, pas un hook pré-commit)
// =====================================================================
// Vérifie l'option « Bloquer la rotation de la carte » (js/mapBearing.js > setRotationBloquee, case de la
// Configuration de l'accueil) dans l'app réelle, sur le relevé fictif, sous chaque moteur de KTA_MOTEURS :
// B1 option coupée : deux doigts et Maj + molette tournent la carte du plan · B2 l'activer redresse la carte tenue à
//   la main (bouton nord masqué, drag de Leaflet rendu) · B3 option active : deux doigts zooment sans tourner, Maj +
//   molette ne tourne pas, setManuel refusé · B4 COÛT, option active contre coupée, pendant le même geste : écritures
//   de style du pane de rotation, surface des canvas, minuteries de surveillance (SURVEILLANCE_MS) · B5 le plan
//   orienté (cap simulé) tourne encore · B6 « Réglés depuis l'accueil » l'affiche · B7 Vue OSM : tourne coupée, ne
//   tourne plus active (redressée à l'activation) · B8 vue 3D : deux doigts tournent toujours sa caméra ·
//   A1 widget OSM de l'accueil : tourne coupé, la vraie case le redresse et le fige · A2 réglage gardé au rechargement.
// 🩸 Les doigts simulés suivent la famille d'événements de Leaflet (`L.Browser.touchNative`) : sinon le pinch-zoom ne
// voit rien et le « pas de rotation » passe à vide (le contre-essai B1 l'interdit).
// Usage : node scripts/smoke/checkup-rotation-bloquee.js (SMOKE_PORT pour une copie de travail ; ROT_BLOQ_SHOTS=dossier
// pour les captures de l'option, sombre et clair) · doc : docs/architecture/tracking.md § Rotation manuelle
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const PLAN = "Relevé fictif de test";
const SHOTS = process.env.ROT_BLOQ_SHOTS || "";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
// Fond OSM servi en local : gris uni (aucune requête vers le serveur de tuiles).
const PNG_TUILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4xrAFAANqAZsvHqYeAAAAAElFTkSuQmCC";
const GRIS = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOYNWsWAAOgAc+4dJWtAAAAAElFTkSuQmCC", "base64");

const problemes = [];
let moteurCourant = "";
function pb(msg) { problemes.push("[" + moteurCourant + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg)  { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) {
  if (cond) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
}

async function nouveauContexte(nav, opts, ls) {
  const ctx = await nav.newContext(Object.assign({ viewport: { width: 1100, height: 800 }, serviceWorkers: "block" }, opts || {}));
  await ctx.route("https://tile.openstreetmap.org/**", function (r) {
    r.fulfill({ status: 200, contentType: "image/png", body: GRIS });
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(e.message); });
  await page.addInitScript(function (l) {
    // Une fois par contexte : un rechargement garde ce que l'app a écrit (A2).
    if (!sessionStorage.getItem("__rbInit")) {
      for (const k in l) { try { localStorage.setItem(k, l[k]); } catch (e) {} }
      sessionStorage.setItem("__rbInit", "1");
    }
    const iv = setInterval(function () {
      if (!window.L || !L.Map) return;
      clearInterval(iv);
      L.Map.addInitHook(function () {
        const id = this.getContainer().id;
        if (id === "kta-osm-map") window.__osmCarte = this;
        if (id === "ktaOsmHomeMap") window.__accCarte = this;
      });
    }, 5);
  }, Object.assign({}, LS_PREGATES, ls || {}));
  return { ctx: ctx, page: page, erreurs: erreurs };
}

// Outils posés dans la page : doigts simulés sur n'importe quel conteneur, mesures du coût d'un geste.
async function outils(page) {
  await page.evaluate(function () {
    const attente = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    const centre = function (cont) {
      const r = cont.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    window.__rb = {
      attente: attente,
      centre: centre,
      // Geste à deux doigts sur `cont` : écart d0 → d1 px, angle 0 → a1 degrés, en n pas ; o.pendant() à chaque pas.
      geste: async function (cont, o) {
        const tactile = o.pointeurs ? false : !!(L.Browser && L.Browser.touchNative);
        const c = centre(cont), n = o.n || 12;
        const pos = function (k) {
          const d = o.d0 + (o.d1 - o.d0) * k, a = o.a1 * k * Math.PI / 180;
          const ux = Math.cos(a) * d / 2, uy = Math.sin(a) * d / 2;
          return [{ x: c.x - ux, y: c.y - uy }, { x: c.x + ux, y: c.y + uy }];
        };
        const envoyer = function (type, pts, fin) {
          if (tactile) {
            let ev;
            try {
              const touches = pts.map(function (p, i) {
                return new Touch({ identifier: 61 + i, target: cont, clientX: p.x, clientY: p.y,
                                   radiusX: 10, radiusY: 10, force: 1 });
              });
              ev = new TouchEvent(type, { bubbles: true, cancelable: true, composed: true,
                touches: fin ? [] : touches, targetTouches: fin ? [] : touches, changedTouches: touches });
            } catch (e) {
              // WebKit expose TouchEvent mais refuse `new Touch()` : événement simple portant des listes de points.
              const faux = pts.map(function (p, i) {
                return { identifier: 61 + i, target: cont, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y };
              });
              ev = new Event(type, { bubbles: true, cancelable: true, composed: true });
              Object.defineProperty(ev, "touches", { value: fin ? [] : faux });
              Object.defineProperty(ev, "targetTouches", { value: fin ? [] : faux });
              Object.defineProperty(ev, "changedTouches", { value: faux });
            }
            cont.dispatchEvent(ev);
          } else {
            const nom = { touchstart: "pointerdown", touchmove: "pointermove", touchend: "pointerup" }[type];
            pts.forEach(function (p, i) {
              cont.dispatchEvent(new PointerEvent(nom, { bubbles: true, cancelable: true, composed: true,
                pointerId: 61 + i, pointerType: "touch", isPrimary: i === 0, clientX: p.x, clientY: p.y,
                buttons: nom === "pointerup" ? 0 : 1 }));
            });
          }
        };
        envoyer("touchstart", pos(0));
        if (!tactile) envoyer("touchmove", pos(0));
        for (let i = 1; i <= n; i++) {
          await attente(30);
          envoyer("touchmove", pos(i / n));
          if (o.pendant) o.pendant();
        }
        await attente(40);
        envoyer("touchend", pos(1), true);
        await attente(o.apres || 600);
      },
      molette: async function (cont, px) {
        const c = centre(cont);
        for (let i = 0; i < 6; i++) {
          cont.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, shiftKey: true,
            deltaY: px / 6, deltaMode: 0, clientX: c.x, clientY: c.y }));
          await attente(20);
        }
        await attente(600);
      },
      norm: function (b) { return ((b % 360) + 540) % 360 - 180; },
      // Coût d'un geste sur la carte `map` : écritures de style du pane de rotation, surface maximale des canvas,
      // minuteries de SURVEILLANCE_MS armées.
      mesurer: async function (map, faire) {
        const pane = map._ktaRotatePane || map.getContainer().querySelector(".kta-rotate-pane");
        let ecritures = 0;
        const obs = pane ? new MutationObserver(function (l) { ecritures += l.length; }) : null;
        if (obs) obs.observe(pane, { attributes: true, attributeFilter: ["style"] });
        // Surface des conteneurs de renderer (canvas ou svg) : c'est elle que l'élargissement du padding fait grossir.
        const surface = function () {
          const vus = [];
          if (map._renderer) vus.push(map._renderer);
          map.eachLayer(function (l) { if (l instanceof L.Renderer && vus.indexOf(l) < 0) vus.push(l); });
          let s = 0;
          vus.forEach(function (r) {
            const c = r._container;
            if (!c) return;
            const w = c.width && c.width.baseVal ? c.width.baseVal.value : c.width;
            const h = c.height && c.height.baseVal ? c.height.baseVal.value : c.height;
            s += (Number(w) || 0) * (Number(h) || 0);
          });
          return Math.round(s);
        };
        const avant = surface();
        let maxi = avant;
        const origine = window.setInterval;
        let surveillances = 0;
        window.setInterval = function (f, ms) {
          if (ms === 250) surveillances++;
          return origine.apply(window, arguments);
        };
        try { await faire(function () { maxi = Math.max(maxi, surface()); }); }
        finally { window.setInterval = origine; if (obs) obs.disconnect(); }
        return { ecritures: ecritures, surfaceAvant: avant, surfaceMax: maxi, surveillances: surveillances };
      }
    };
  });
}

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN, { exact: false }).first().click();
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.MapBearing; }, 30000);
  await page.waitForTimeout(2500);
  await outils(page);
}

// 🩸 Format téléphone : sur un écran large, le padding par défaut des renderers couvre déjà l'écran tourné et
// l'élargissement ne se voit pas (le contre-essai du coût passerait à vide).
async function suitePlan(nav) {
  const t = await nouveauContexte(nav, { viewport: { width: 400, height: 860 } });
  const page = t.page;
  try {
    await ouvrirPlan(page);
    const famille = await page.evaluate(function () { return L.Browser.touchNative ? "touch" : "pointeurs"; });
    inf("doigts simulés en " + famille);
    const depart = await page.evaluate(function () { return window.MapBearing.rotationBloquee(); });
    verifier(depart === false, "défaut : rotation permise", depart);

    // ── B1 — option coupée : la carte tourne ──
    console.log("— B1 : option coupée —");
    const b1 = await page.evaluate(async function () {
      const R = window.__rb, map = window.map, cont = map.getContainer();
      let gesteCout = null;
      gesteCout = await R.mesurer(map, async function (echantillon) {
        await R.geste(cont, { d0: 120, d1: 260, a1: 66, pendant: echantillon });
      });
      const apresGeste = R.norm(window.MapBearing.getBearing());
      window.MapBearing.reset();
      await R.molette(cont, -300);
      const apresMolette = R.norm(window.MapBearing.getBearing());
      return { geste: apresGeste, molette: apresMolette, cout: gesteCout, src: window.MapBearing.getSource() };
    });
    verifier(Math.abs(b1.geste) > 20, "deux doigts tournent la carte (" + b1.geste.toFixed(1) + "°)", b1);
    verifier(Math.abs(b1.molette) > 10, "Maj + molette tourne la carte (" + b1.molette.toFixed(1) + "°)", b1);
    inf("coût, option coupée : " + b1.cout.ecritures + " écritures de style du pane, renderers " +
      b1.cout.surfaceAvant + " → " + b1.cout.surfaceMax + " px², " + b1.cout.surveillances + " minuterie(s) de surveillance");
    verifier(b1.cout.ecritures > 0 && b1.cout.surveillances >= 1 && b1.cout.surfaceMax > b1.cout.surfaceAvant * 1.25,
      "contre-essai du coût : le geste coupé écrit le pane, agrandit les renderers et arme la surveillance", b1.cout);

    // ── B2 — activer redresse la carte ──
    console.log("— B2 : activer l'option avec la carte tournée à la main —");
    const b2 = await page.evaluate(async function () {
      window.MapBearing.setManuel(40);
      const avant = window.MapBearing.getBearing();
      window.MapBearing.setRotationBloquee(true);
      await window.__rb.attente(200);
      const nord = document.querySelector("#map .kta-nord-ctrl");
      return { avant: avant, b: window.MapBearing.getBearing(), src: window.MapBearing.getSource(),
               nord: !!(nord && nord.classList.contains("kta-nord-visible")),
               drag: !!(window.map.dragging && window.map.dragging.enabled()),
               verrou: window.map.getContainer().classList.contains("kta-bearing-lock"),
               ls: localStorage.getItem("myktamap_rotation_bloquee_v1") };
    });
    verifier(b2.avant === 40 && b2.b === 0 && b2.src === null, "la carte se remet droite à l'activation", b2);
    verifier(!b2.nord && b2.drag && !b2.verrou, "bouton nord masqué, drag de Leaflet rendu, plus de verrou", b2);
    verifier(b2.ls === "1", "réglage écrit sous myktamap_rotation_bloquee_v1", b2.ls);

    // ── B3 / B4 — option active : ni rotation ni coût ──
    console.log("— B3 : option active —");
    const b3 = await page.evaluate(async function () {
      const R = window.__rb, map = window.map, cont = map.getContainer();
      map.setZoom(map.getMinZoom ? Math.max(map.getMinZoom(), -1) : -1, { animate: false });
      await R.attente(400);
      const z0 = map.getZoom();
      const cout = await R.mesurer(map, async function (echantillon) {
        await R.geste(cont, { d0: 120, d1: 260, a1: 66, pendant: echantillon });
      });
      const z1 = map.getZoom(), apresGeste = window.MapBearing.getBearing();
      await R.molette(cont, -300);
      const apresMolette = window.MapBearing.getBearing();
      const refus = window.MapBearing.setManuel(30);
      return { z0: z0, z1: z1, geste: apresGeste, molette: apresMolette, refus: refus, cout: cout,
               src: window.MapBearing.getSource() };
    });
    verifier(b3.geste === 0 && b3.src === null, "deux doigts ne tournent plus la carte", b3);
    verifier(b3.z1 > b3.z0, "le pincement zoome toujours (" + b3.z0 + " → " + b3.z1 + ")", b3);
    verifier(b3.molette === 0, "Maj + molette ne tourne plus", b3.molette);
    verifier(b3.refus === false, "setManuel refusé", b3.refus);
    console.log("— B4 : coût du même geste, option active —");
    inf("coût, option active : " + b3.cout.ecritures + " écritures de style du pane, renderers " +
      b3.cout.surfaceAvant + " → " + b3.cout.surfaceMax + " px², " + b3.cout.surveillances + " minuterie(s) de surveillance");
    verifier(b3.cout.ecritures === 0, "aucune écriture sur le pane de rotation (coupée : " + b1.cout.ecritures + ")", b3.cout);
    verifier(b3.cout.surveillances === 0, "aucune minuterie de surveillance des outils (coupée : " + b1.cout.surveillances + ")", b3.cout);
    verifier(b3.cout.surfaceMax <= b3.cout.surfaceAvant * 1.25 + 1,
      "renderers jamais agrandis pour la rotation (max " + b3.cout.surfaceMax + " px² pour " + b3.cout.surfaceAvant +
      " ; coupée : " + b1.cout.surfaceMax + ")", b3.cout);
    const pane = await page.evaluate(function () {
      const p = window.map._ktaRotatePane;
      return p ? { transform: p.style.transform, calc: getComputedStyle(p).transform } : null;
    });
    verifier(!pane || (pane.transform === "" && pane.calc === "none"), "pane intercalaire sans transform à angle nul", pane);

    // ── B5 — le plan orienté tourne encore ──
    console.log("— B5 : plan orienté, option active —");
    const b5 = await page.evaluate(async function () {
      window.MapBearing.setEnabled(true);
      if (!window.getTrackingActif()) window.startTracking();
      for (let i = 0; i < 60; i++) {
        window.MapBearing.onStep(window.map.getCenter());
        window.MapBearing.onHeading(90);
        await window.__rb.attente(40);
        if (Math.abs(window.MapBearing.getBearing() - 270) < 1) break;
      }
      const cap = { b: window.MapBearing.getBearing(), src: window.MapBearing.getSource() };
      window.stopTracking();
      await window.__rb.attente(200);
      window.MapBearing.setEnabled(false);
      return { cap: cap, arret: window.MapBearing.getBearing() };
    });
    verifier(Math.abs(b5.cap.b - 270) < 1.5 && b5.cap.src === "cap", "le cap fait tourner la carte (" + b5.cap.b.toFixed(1) + "°)", b5);
    verifier(b5.arret === 0, "à l'arrêt du suivi, la carte revient au nord", b5);

    // ── B6 — Réglés depuis l'accueil ──
    console.log("— B6 : Réglages du plan, « Réglés depuis l'accueil » —");
    const b6 = await page.evaluate(async function () {
      window.afficherConfig();
      await window.__rb.attente(400);
      const dl = document.querySelector("#kta-cfg-modal .kta-cfg-globaux-liste");
      const lib = window.I18n.t("config.rotationBloquee.label"), on = window.I18n.t("config.globaux.on");
      let val = null;
      if (dl) dl.querySelectorAll("dt").forEach(function (dt) { if (dt.textContent === lib) val = dt.nextElementSibling.textContent; });
      const m = document.getElementById("kta-cfg-modal"); if (m) m.remove();
      return { val: val, on: on };
    });
    verifier(b6.val === b6.on, "la ligne « Bloquer la rotation » dit « " + b6.on + " »", b6);

    // ── B7 — Vue OSM ──
    console.log("— B7 : Vue OSM —");
    // Comme checkup-osm-rotation.js : tuilage V2 prêté (tuiles en data:) et calage fictif en mer.
    await page.evaluate(function (png) {
      window.MapBearing.setRotationBloquee(false);
      const pc = window.PLAN_CONFIG, p = pc.plan;
      const W = p.imageWidth || (window.APP_CONFIG && window.APP_CONFIG.imageWidth) || 2000;
      const H = p.imageHeight || (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 2000;
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
      window.__osmCarte = null;
      window.OsmView.open();
    }, PNG_TUILE);
    let osmOuverte = true;
    try { await attendre(page, function () { return !!window.__osmCarte && !!window.__osmCarte._loaded && !!window.OsmView.getRotation(); }, 30000); }
    catch (e) { osmOuverte = false; }
    if (!osmOuverte) pb("Vue OSM : la fenêtre ne s'est pas ouverte");
    else {
      await page.waitForTimeout(1200);
      const b7 = await page.evaluate(async function () {
        const R = window.__rb, rot = window.OsmView.getRotation(), cont = window.__osmCarte.getContainer();
        await R.geste(cont, { d0: 200, d1: 220, a1: 66 });
        const coupeeGeste = R.norm(rot.getBearing());
        rot.reset();
        await R.molette(cont, -300);
        const coupeeMolette = R.norm(rot.getBearing());
        rot.setManuel(30);
        const avant = rot.getBearing();
        window.MapBearing.setRotationBloquee(true);
        const redressee = rot.getBearing();
        await R.geste(cont, { d0: 200, d1: 220, a1: 66 });
        const activeGeste = rot.getBearing();
        await R.molette(cont, -300);
        const activeMolette = rot.getBearing();
        const refus = rot.setManuel(30);
        return { coupeeGeste: coupeeGeste, coupeeMolette: coupeeMolette, avant: avant, redressee: redressee,
                 activeGeste: activeGeste, activeMolette: activeMolette, refus: refus };
      });
      verifier(Math.abs(b7.coupeeGeste) > 20 && Math.abs(b7.coupeeMolette) > 10,
        "option coupée : deux doigts et Maj + molette tournent la Vue OSM", b7);
      verifier(b7.avant === 30 && b7.redressee === 0, "l'activer redresse la Vue OSM ouverte", b7);
      verifier(b7.activeGeste === 0 && b7.activeMolette === 0 && b7.refus === false,
        "option active : la Vue OSM ne tourne plus (doigts, molette, setManuel)", b7);
      await page.evaluate(function () { if (window.OsmView.close) window.OsmView.close(); });
      await page.waitForTimeout(600);
    }

    // ── B8 — vue 3D ──
    console.log("— B8 : vue 3D, option active —");
    const b8 = await page.evaluate(async function () {
      window.MapBearing.setRotationBloquee(true);
      const a = document.querySelector(".kta-vue3d-ctrl a");
      if (!a || a.classList.contains("kta-inactif")) return { skip: "bouton 3D inactif sur ce plan" };
      a.click();
      const K = function () { return window.KtaVue3D; };
      for (let i = 0; i < 80 && !(K() && K().etat && K().etat().ouvert); i++) await window.__rb.attente(250);
      if (!(K() && K().etat().ouvert)) return { skip: "vue 3D non ouverte (WebGL ?)" };
      await window.__rb.attente(800);
      if (K().etat().vue !== "plongee") K().basculerVue();
      await window.__rb.attente(800);
      const cv = document.querySelector("#kta-vue3d canvas.kta-v3d-canvas");
      const cap0 = K().origineItineraire().cap;
      await window.__rb.geste(cv, { d0: 220, d1: 220, a1: 60, pointeurs: true, n: 16 });
      const cap1 = K().origineItineraire().cap;
      const vue = K().etat().vue, mode = K().etat().mode;
      await K().fermer();
      await window.__rb.attente(600);
      return { cap0: cap0, cap1: cap1, vue: vue, mode: mode, carte: window.MapBearing.getBearing() };
    });
    if (b8.skip) inf("B8 sauté : " + b8.skip);
    else {
      const d = Math.abs(((b8.cap1 - b8.cap0) % 360 + 540) % 360 - 180);
      verifier(d > 10, "deux doigts tournent toujours la caméra 3D (cap " + Math.round(b8.cap0) + "° → " + Math.round(b8.cap1) + "°)", b8);
      verifier(b8.carte === 0, "la carte 2D reste droite au retour", b8);
    }
    verifier(t.erreurs.length === 0, "aucune erreur de page (carte)", t.erreurs.slice(0, 3));
  } finally {
    await t.ctx.close();
  }
}

async function capturer(page, fichier) {
  if (!SHOTS) return;
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    const el = await page.$("#loaderRotationBloqueeCb");
    const row = el ? await el.evaluateHandle(function (n) { return n.closest("label"); }) : null;
    if (row) {
      await row.evaluate(function (n) { n.scrollIntoView({ block: "center" }); });
      await page.waitForTimeout(300);
      const grp = await row.evaluateHandle(function (n) { return n.closest(".kta-aide-section") || n; });
      await grp.screenshot({ path: path.join(SHOTS, fichier) });
      inf("capture : " + fichier);
    }
  } catch (e) { inf("capture impossible : " + e.message); }
}

async function suiteAccueil(nav, nomMoteur) {
  const t = await nouveauContexte(nav);
  const page = t.page;
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(function () {});
    await page.waitForTimeout(500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await outils(page);
    const id = await page.evaluate(function () {
      const p = (window.PlanRegistry.getAll() || []).find(function (x) {
        return /fictif/i.test((x.name || "") + " " + (window.PlanRegistry.displayName ? window.PlanRegistry.displayName(x) : ""));
      });
      if (!p) return null;
      window.KmzExport.setCalibration(p.id, { pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
                                              pointB: { x: 1000, y: 1000, lat: 0.002, lng: 0.003 } });
      window.__accCarte = null;
      window.OsmHomePreview.refresh();
      return p.id;
    });
    if (!id) { pb("accueil : relevé fictif absent du registre"); return; }
    let pret = true;
    try { await attendre(page, function () { return !!window.__accCarte && !!window.__accCarte._loaded && !!window.OsmHomePreview.getRotation(); }, 30000); }
    catch (e) { pret = false; }
    if (!pret) { pb("accueil : le widget OSM ne s'est pas monté"); return; }
    await page.waitForTimeout(1000);

    // ── A1 — widget OSM de l'accueil ──
    console.log("— A1 : widget OSM de l'accueil —");
    const a1 = await page.evaluate(async function () {
      const R = window.__rb, rot = window.OsmHomePreview.getRotation(), cont = window.__accCarte.getContainer();
      cont.scrollIntoView({ block: "center" });
      await R.attente(300);
      await R.geste(cont, { d0: 160, d1: 180, a1: 66 });
      const coupeeGeste = R.norm(rot.getBearing());
      rot.reset();
      await R.molette(cont, -300);
      const coupeeMolette = R.norm(rot.getBearing());
      rot.setManuel(30);
      const avant = rot.getBearing();
      // La vraie case de la Configuration de l'accueil.
      window._ouvrirLoaderConfig();
      await R.attente(500);
      const cb = document.getElementById("loaderRotationBloqueeCb");
      const etaitCochee = cb ? cb.checked : null;
      if (cb) cb.click();
      await R.attente(200);
      const redresse = rot.getBearing();
      if (window._fermerLoaderConfig) window._fermerLoaderConfig();
      await R.attente(300);
      await R.geste(cont, { d0: 160, d1: 180, a1: 66 });
      const activeGeste = rot.getBearing();
      await R.molette(cont, -300);
      const activeMolette = rot.getBearing();
      return { coupeeGeste: coupeeGeste, coupeeMolette: coupeeMolette, avant: avant, case: !!cb,
               etaitCochee: etaitCochee, redresse: redresse, activeGeste: activeGeste, activeMolette: activeMolette,
               bloquee: window.MapBearing.rotationBloquee() };
    });
    verifier(Math.abs(a1.coupeeGeste) > 20 && Math.abs(a1.coupeeMolette) > 10,
      "option coupée : deux doigts et Maj + molette tournent le widget", a1);
    verifier(a1.case && a1.etaitCochee === false, "la case existe, décochée par défaut", a1);
    verifier(a1.bloquee && a1.avant === 30 && a1.redresse === 0, "cocher la case redresse le widget ouvert", a1);
    verifier(a1.activeGeste === 0 && a1.activeMolette === 0, "option active : le widget ne tourne plus", a1);

    // ── A2 — rechargement ──
    console.log("— A2 : réglage gardé au rechargement —");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(function () {});
    await page.waitForTimeout(800);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    const a2 = await page.evaluate(async function () {
      window._ouvrirLoaderConfig();
      await new Promise(function (r) { setTimeout(r, 500); });
      const cb = document.getElementById("loaderRotationBloqueeCb");
      return { bloquee: window.MapBearing.rotationBloquee(), coche: cb ? cb.checked : null };
    });
    verifier(a2.bloquee === true && a2.coche === true, "rechargée : option toujours active, case cochée", a2);
    if (nomMoteur === "chromium") await capturer(page, "option-sombre.png");
    verifier(t.erreurs.length === 0, "aucune erreur de page (accueil)", t.erreurs.slice(0, 3));
  } finally {
    await t.ctx.close();
  }
  if (nomMoteur === "chromium" && SHOTS) {
    const c = await nouveauContexte(nav, {}, { "myktamap_theme_v1": "light" });
    try {
      await c.page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await c.page.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(function () {});
      await c.page.waitForTimeout(800);
      await c.page.evaluate(function () {
        const b = document.getElementById("kta-alert-ok"); if (b) b.click();
        window._ouvrirLoaderConfig();
      });
      await c.page.waitForTimeout(600);
      await capturer(c.page, "option-clair.png");
    } finally { await c.ctx.close(); }
  }
}

(async function main() {
  const liste = lancerNavigateur.moteurs();
  try {
    for (const nom of liste) {
      moteurCourant = nom;
      console.log("\n══ Moteur : " + nom + " ══");
      const nav = await lancerNavigateur.lancerMoteur(nom);
      if (!nav) { pb("moteur absent : rien n'a été vérifié"); continue; }
      try {
        await suitePlan(nav);
        await suiteAccueil(nav, nom);
      } catch (e) { pb("exception du harnais : " + (e && e.message)); }
      finally { await nav.close(); }
    }
  } finally {
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — rotation bloquée : carte du plan, Vue OSM, widget de l'accueil, plan orienté et 3D intacts, aucun coût.");
  process.exit(0);
})();
