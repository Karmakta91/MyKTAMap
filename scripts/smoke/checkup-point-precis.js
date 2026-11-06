#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-point-precis.js — checkup (Playwright) : point précis d'un POI (js/poiPrecis.js)
// =====================================================================
// POI FICTIFS de session posés au centre de la vue du relevé fictif (sinon le premier plan de l'index). Joué sous
// chaque moteur (KTA_MOTEURS, Chromium et WebKit par défaut), à la souris puis au doigt.
// Vérifie : « 🎯 Augmenter la précision » dans la fiche (pas pour un passage peo, ni en lecture seule, ni pour un POI
// de calque) ; le bouton arme le bandeau sans rien poser, un tap pose le point (uid gardé, updatedAt changé, une
// entrée d'historique) ; chatière en deux taps (début, fin) ; Échap et ✕ annulent ; Ctrl+Z retire ; « Retirer la
// précision » ; pointillé et carré au bon endroit à zoom moyen, carte droite puis tournée, cachés de loin et
// montrés de loin fiche ouverte ; POI de calque (getAllEmbeddedPoints porte `precis`, son pointillé est dessiné) ;
// sauvegarde puis rechargement ; export de session (ZIP) et réimport ; anonymisé ; KMZ, GeoJSON et GPX à la place
// de l'icône ; « Y aller » et ➕ visent le point précis, l'itinéraire y finit.
// 🩸 Le doigt : Chromium par CDP (vrais touch), WebKit par PointerEvent synthétiques (logique de l'app seulement).
// Usage : node scripts/smoke/checkup-point-precis.js (SMOKE_PORT pour une autre copie ; KTA_MODES=souris ou doigt ;
// KTA_PP_CAPTURES=<dossier> pour des captures) · code : js/poiPrecis.js · doc : docs/architecture/ui.md § Point précis
// =====================================================================
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");
const JSZip = require("../../lib/jszip.min.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const CAPTURES = process.env.KTA_PP_CAPTURES || "";
const SORTIE = fs.mkdtempSync(path.join(os.tmpdir(), "kta-pp-"));
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
let _prefixe = "";
function pb(msg) { problemes.push(_prefixe + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) {
  if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : ""));
}
async function capture(page, nom) {
  if (!CAPTURES) return;
  fs.mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURES, _prefixe.replace(/[^\w]+/g, "-") + nom + ".png") });
}

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.evaluate(function () {
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaPoiPrecis && !!window.HistoryManager;
  }, 60000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    const cfg = window.APP_CONFIG;
    if (cfg.multiLevel === true) {
      cfg.activeLevel = 0;
      if (cfg.visibleLevels.indexOf(0) < 0) cfg.visibleLevels.push(0);
    }
  });
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    window.map.setView(window.map.getCenter(), window.map.getMaxZoom() - 1, { animate: false });
  });
  await page.waitForTimeout(800);
}

// Repère : px d'écran (× k) autour du centre de la fenêtre ; outils dans window.__pp.
function outils(page) {
  return page.evaluate(function () {
    const m = window.map, H = window.APP_CONFIG.imageHeight;
    const cr0 = m.getContainer().getBoundingClientRect();
    const c = m.containerPointToLatLng([innerWidth / 2 - cr0.left, innerHeight / 2 - 40 - cr0.top]);
    const k = 1 / m.options.crs.scale(m.getZoom());
    const bx = c.lng, by = H - c.lat;
    window.__pp = {
      k: k, bx: bx, by: by, vue: [c, m.getZoom()],
      P: function (u, v) { return { x: Math.round((bx + u * k) * 100) / 100, y: Math.round((by + v * k) * 100) / 100 }; },
      ecran: function (x, y) {
        const p = m.latLngToContainerPoint(window.convertCoord(x, y));
        const cr = m.getContainer().getBoundingClientRect();
        const a = (window.MapBearing ? window.MapBearing.getBearing() : 0) * Math.PI / 180;
        const cx = cr.width / 2, cy = cr.height / 2, dx = p.x - cx, dy = p.y - cy;
        return [cr.left + cx + dx * Math.cos(a) - dy * Math.sin(a), cr.top + cy + dx * Math.sin(a) + dy * Math.cos(a)];
      }
    };
    return { k: k, zoom: m.getZoom(), echelle: window.APP_CONFIG.scale };
  });
}

function semer(page) {
  return page.evaluate(function () {
    const P = window.__pp.P;
    const pt = function (uid, tag, u, v) {
      return Object.assign({ id: uid, nom: "POI " + uid, uid: uid, level: 0, tags: [tag], etat: "Non inspectée",
        description: "", source: "editor", updatedAt: 1000 }, P(u, v));
    };
    window.setEditorPoints([pt("pt_pp_pl", "plaque", -150, 0), pt("pt_pp_ch", "chatiere", 150, 0),
      pt("pt_pp_peo", "peo", -150, 200), pt("pt_pp_info", "info", 150, 200)]);
    // Galerie fictive pour l'itinéraire : de part et d'autre du centre.
    window.setRoads([{ uid: "rd_pp", type: "principal", level: 0, points: [P(-400, -120), P(400, -120)] }]);
    window.HistoryManager.onChange(function (s) { window.__pp.undo = s.undoSize; });
    window.HistoryManager.reset();
    window.__pp.undo = 0;
  });
}

function lirePoint(page, uid) {
  return page.evaluate(function (u) {
    const p = window.getEditorPoints().find(function (o) { return o.uid === u; });
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }, uid);
}

// ── Pointeurs : souris (Playwright), doigt (CDP sous Chromium, PointerEvent synthétiques sous WebKit) ──
function Pointeur(page, mode, moteur) {
  let cdp = null;
  const synth = function (type, x, y, clic) {
    return page.evaluate(function (a) {
      window.__ppCible = (a.type === "pointerdown" || !window.__ppCible) ?
        (document.elementFromPoint(a.x, a.y) || document.body) : window.__ppCible;
      const el = a.type === "pointerdown" ? window.__ppCible : (document.elementFromPoint(a.x, a.y) || document.body);
      const o = { bubbles: true, cancelable: true, composed: true, clientX: a.x, clientY: a.y, pointerId: 41,
        pointerType: "touch", isPrimary: true, button: 0, buttons: a.type === "pointerup" ? 0 : 1 };
      el.dispatchEvent(new PointerEvent(a.type, o));
      const tt = { pointerdown: "touchstart", pointerup: "touchend" }[a.type];
      if (tt) {
        const t = { identifier: 41, target: window.__ppCible, clientX: a.x, clientY: a.y, screenX: a.x,
          screenY: a.y, pageX: a.x, pageY: a.y };
        const ev = new Event(tt, { bubbles: true, cancelable: true, composed: true });
        const liste = tt === "touchend" ? [] : [t];
        Object.defineProperty(ev, "touches", { value: liste });
        Object.defineProperty(ev, "targetTouches", { value: liste });
        Object.defineProperty(ev, "changedTouches", { value: [t] });
        window.__ppCible.dispatchEvent(ev);
      }
      if (a.type === "pointerup" && a.clic) el.dispatchEvent(new MouseEvent("click", o));
    }, { type: type, x: x, y: y, clic: clic === true });
  };
  return {
    async init() { if (mode === "doigt" && moteur === "chromium") cdp = await page.context().newCDPSession(page); },
    async tap(p) {
      if (mode === "souris") { await page.mouse.click(p[0], p[1]); return; }
      if (cdp) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p[0], y: p[1] }] });
        await page.waitForTimeout(60);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        return;
      }
      await synth("pointerdown", p[0], p[1]);
      await page.waitForTimeout(60);
      await synth("pointerup", p[0], p[1], true);
    }
  };
}

function ecran(page, pt) { return page.evaluate(function (p) { return window.__pp.ecran(p.x, p.y); }, pt); }
function planU(page, u, v) { return page.evaluate(function (a) { return window.__pp.P(a[0], a[1]); }, [u, v]); }
async function centreDe(page, sel) {
  const b = await page.$(sel);
  if (!b) return null;
  const r = await b.boundingBox();
  return r ? [r.x + r.width / 2, r.y + r.height / 2] : null;
}
function viderToasts(page) {
  return page.evaluate(function () { const t = document.getElementById("kta-toasts"); if (t) t.innerHTML = ""; });
}

// Fiche d'un POI de session ouverte par son marqueur (tap réel sur l'icône).
async function ouvrirFiche(page, ptr, uid) {
  await page.evaluate(function () { window.map.closePopup(); });
  await page.waitForTimeout(400);   // l'autoPan de la fiche précédente a pu déplacer la carte
  const p = await lirePoint(page, uid);
  await ptr.tap(await ecran(page, p));
  await page.waitForTimeout(600);
  return page.evaluate(function () { return !!document.querySelector(".leaflet-popup .kta-popup-point"); });
}

// Guides 2D du point précis : squares et segments en px d'écran.
function guides(page) {
  return page.evaluate(function () {
    // Bouts d'un trait en px d'écran : premier et dernier point du chemin, par sa matrice d'écran (rotation du pane
    // comprise ; la boîte d'un élément tourné n'est pas celle du trait).
    const rc = function (el) {
      const m = el.getScreenCTM(), L0 = el.getTotalLength();
      const a = el.getPointAtLength(0), b = el.getPointAtLength(L0);
      const A = new DOMPoint(a.x, a.y).matrixTransform(m), B = new DOMPoint(b.x, b.y).matrixTransform(m);
      return [[A.x, A.y], [B.x, B.y]];
    };
    return {
      etat: window.KtaPoiPrecis.etat(),
      carres: Array.from(document.querySelectorAll(".kta-precis-carre")).map(function (el) {
        const r = el.getBoundingClientRect(); return [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
      }),
      traits: Array.from(document.querySelectorAll("path.kta-precis-trait")).map(rc),
      segments: Array.from(document.querySelectorAll("path.kta-precis-segment")).map(rc),
      interactif: Array.from(document.querySelectorAll(".kta-precis-trait, .kta-precis-segment, .kta-precis-carre"))
        .some(function (el) { return getComputedStyle(el).pointerEvents !== "none"; })
    };
  });
}
function proche(a, b, tol) { return !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol; }
// Un trait (ses deux bouts à l'écran) relie p et q, dans un sens ou dans l'autre.
function boiteRelie(b, p, q, tol) {
  if (!b) return false;
  return (proche(b[0], p, tol) && proche(b[1], q, tol)) || (proche(b[0], q, tol) && proche(b[1], p, tol));
}

async function poserPlaque(page, ptr, u, v) {
  const fiche = await ouvrirFiche(page, ptr, "pt_pp_pl");
  const b = await centreDe(page, ".leaflet-popup [data-kta-act=\"precis\"]");
  if (!fiche || !b) return false;
  await ptr.tap(b);
  await page.waitForTimeout(400);
  await ptr.tap(await ecran(page, await planU(page, u, v)));
  await page.waitForTimeout(500);
  return true;
}

async function jouer(nav, moteur, mode) {
  _prefixe = "[" + moteur + " · " + mode + "] ";
  console.log("\n══ " + moteur + " · " + mode + " ══");
  const opts = { viewport: { width: 1200, height: 850 } };
  if (mode === "doigt") Object.assign(opts, { hasTouch: true });
  const ctx = await nav.newContext(Object.assign({ acceptDownloads: true }, opts));
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  const ptr = Pointeur(page, mode, moteur);
  try {
    await ouvrirPlan(page);
    await ptr.init();
    const o = await outils(page);
    await semer(page);
    await page.waitForTimeout(500);
    inf("zoom " + o.zoom + ", échelle " + o.echelle + " px/m, seuil " +
      (await page.evaluate(function () { return window.KtaPoiPrecis.SEUIL_PX_PAR_M; })) + " px d'écran par mètre");
    const tol = 3;

    // ── 1. Fiche : bouton, droits ──
    verifier(await ouvrirFiche(page, ptr, "pt_pp_peo") &&
      !(await page.$(".leaflet-popup [data-kta-act=\"precis\"]")),
      "passage entre niveaux (peo) : pas de « 🎯 Augmenter la précision » (ses raccords jouent ce rôle)");
    verifier(await ouvrirFiche(page, ptr, "pt_pp_pl"), "fiche de la plaque ouverte par un tap sur son icône");
    const btnTxt = await page.evaluate(function () {
      const b = document.querySelector(".leaflet-popup [data-kta-act=\"precis\"]"); return b ? b.textContent : null;
    });
    verifier(!!btnTxt && /🎯/.test(btnTxt), "fiche : bouton « 🎯 Augmenter la précision »", btnTxt);
    const ro = await page.evaluate(function () {
      window.map.closePopup();
      window.__ppRefus = window.ktaEditionRefusee;
      window.ktaEditionRefusee = function () { return true; };
      const html = window.buildPointPopupHtml(window.getEditorPoints()[0], true, {});
      window.ktaEditionRefusee = window.__ppRefus;
      return html.indexOf("data-kta-act=\"precis\"") >= 0;
    });
    verifier(!ro, "lecture seule : pas de bouton (même règle que ✏️ Modifier)");

    // ── 2. Pose : le bouton arme sans poser, le tap pose ──
    const p0 = await lirePoint(page, "pt_pp_pl");
    await ouvrirFiche(page, ptr, "pt_pp_pl");
    await ptr.tap(await centreDe(page, ".leaflet-popup [data-kta-act=\"precis\"]"));
    await page.waitForTimeout(400);
    let s = await page.evaluate(function () {
      const f = document.getElementById("kta-precis-floater");
      return { bandeau: f ? f.textContent : null, fiche: !!document.querySelector(".leaflet-popup"),
        mode: window.KtaPoiPrecis.enCours() };
    });
    let p1 = await lirePoint(page, "pt_pp_pl");
    verifier(!!s.bandeau && /point exact/.test(s.bandeau) && !s.fiche && !p1.precis,
      "bouton : bandeau « touchez le point exact », fiche fermée, rien de posé par ce clic", s);
    await capture(page, "1-bandeau");
    const cibleP = await planU(page, -100, 70);
    await ptr.tap(await ecran(page, cibleP));
    await page.waitForTimeout(500);
    p1 = await lirePoint(page, "pt_pp_pl");
    const und1 = await page.evaluate(function () { return window.__pp.undo; });
    verifier(!!p1.precis && Math.abs(p1.precis.x - cibleP.x) < 2 * o.k && Math.abs(p1.precis.y - cibleP.y) < 2 * o.k &&
      p1.precis.x2 === undefined, "tap : point précis posé au point touché", { voulu: cibleP, lu: p1.precis });
    verifier(p1.x === p0.x && p1.y === p0.y, "l'icône ne bouge pas (x, y du POI inchangés)");
    verifier(p1.uid === p0.uid && p1.updatedAt > p0.updatedAt, "uid gardé, updatedAt changé",
      { uid: p1.uid, avant: p0.updatedAt, apres: p1.updatedAt });
    verifier(und1 === 1, "une entrée d'historique", und1);
    s = await page.evaluate(function () { return !!document.getElementById("kta-precis-floater"); });
    verifier(!s, "mode terminé après le tap");

    // ── 3. Affichage : pointillé + carré, zoom moyen ──
    let g = await guides(page);
    const eIc = await ecran(page, p1), ePr = await ecran(page, p1.precis);
    verifier(g.carres.length === 1 && proche(g.carres[0], ePr, tol), "carré au point précis", { g: g.carres, ePr: ePr });
    verifier(g.traits.length === 1 && boiteRelie(g.traits[0], eIc, ePr, tol),
      "pointillé de l'icône au point précis", { trait: g.traits[0], eIc: eIc, ePr: ePr });
    verifier(!g.interactif, "pointillé et carré ne captent pas les clics (pointer-events: none)");
    await capture(page, "2-pose");
    // Vue de loin : caché ; fiche ouverte : montré.
    await page.evaluate(function () { window.map.setZoom(window.map.getMinZoom(), { animate: false }); });
    await page.waitForTimeout(500);
    g = await guides(page);
    const loin = await page.evaluate(function () { return window.KtaPoiPrecis.zoomSuffit(); });
    verifier(!loin && g.carres.length === 0 && g.traits.length === 0, "vue de loin : caché", { loin: loin, g: g.etat });
    await page.evaluate(function () {
      window.map.eachLayer(function (l) { if (l._ktaPrecisPoint && l._ktaPrecisPoint.uid === "pt_pp_pl") l.openPopup(); });
    });
    await page.waitForTimeout(500);
    g = await guides(page);
    verifier(g.carres.length === 1 && g.traits.length === 1, "vue de loin, fiche ouverte : montré", g.etat);
    await page.evaluate(function () { window.map.closePopup(); });
    await page.waitForTimeout(300);
    g = await guides(page);
    verifier(g.carres.length === 0, "fiche refermée de loin : caché", g.etat);
    await page.evaluate(function () {
      window.map.setView(window.__pp.vue[0], window.__pp.vue[1], { animate: false });
    });
    await page.waitForTimeout(500);

    // ── 4. Carte tournée : rien ne tourne faux ──
    const tourne = await page.evaluate(function () {
      return window.MapBearing && typeof window.MapBearing.setManuel === "function" && window.MapBearing.setManuel(40);
    });
    await page.waitForTimeout(600);
    if (tourne) {
      g = await guides(page);
      const a = await ecran(page, p1), b = await ecran(page, p1.precis);
      const marq = await page.evaluate(function () {
        let c = null;
        window.map.eachLayer(function (l) {
          if (l._ktaPrecisPoint && l._ktaPrecisPoint.uid === "pt_pp_pl" && l._icon) {
            const r = l._icon.getBoundingClientRect(); c = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
          }
        });
        return c;
      });
      verifier(proche(g.carres[0], b, tol) && boiteRelie(g.traits[0], a, b, tol),
        "carte tournée de 40° : carré au point précis, pointillé de l'icône au point", { g: g, a: a, b: b });
      verifier(proche(marq, a, 25), "carte tournée : le pointillé part bien de l'icône affichée", { marq: marq, a: a });
      await capture(page, "3-tournee");
      await page.evaluate(function () { window.MapBearing.remettreNord(); window.MapBearing.reset(); });
      await page.waitForTimeout(800);
    } else {
      inf("rotation manuelle refusée ici : partie « carte tournée » sautée");
      pb("carte tournée non vérifiée (MapBearing.setManuel refusé)");
    }

    // ── 5. Échap, ✕, Ctrl+Z, Retirer ──
    const avantEsc = JSON.stringify((await lirePoint(page, "pt_pp_pl")).precis);
    await ouvrirFiche(page, ptr, "pt_pp_pl");
    const refaire = await page.evaluate(function () {
      const b = document.querySelector(".leaflet-popup [data-kta-act=\"precis\"]"); return b ? b.textContent : "";
    });
    verifier(/Refaire/.test(refaire) && !!(await page.$(".leaflet-popup [data-kta-act=\"precis-retirer\"]")),
      "POI qui en a un : « 🎯 Refaire le point précis » et « Retirer la précision »", refaire);
    await ptr.tap(await centreDe(page, ".leaflet-popup [data-kta-act=\"precis\"]"));
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await ptr.tap(await ecran(page, await planU(page, -200, -60)));
    await page.waitForTimeout(400);
    s = await page.evaluate(function () { return !!document.getElementById("kta-precis-floater"); });
    verifier(!s && JSON.stringify((await lirePoint(page, "pt_pp_pl")).precis) === avantEsc,
      "Échap annule : bandeau retiré, le tap suivant ne pose rien");
    await page.evaluate(function () { window.map.closePopup(); });
    await ouvrirFiche(page, ptr, "pt_pp_pl");
    await ptr.tap(await centreDe(page, ".leaflet-popup [data-kta-act=\"precis\"]"));
    await page.waitForTimeout(300);
    await ptr.tap(await centreDe(page, "#kta-precis-cancel"));
    await page.waitForTimeout(300);
    s = await page.evaluate(function () { return !!document.getElementById("kta-precis-floater"); });
    verifier(!s && JSON.stringify((await lirePoint(page, "pt_pp_pl")).precis) === avantEsc, "✕ Annuler : rien de posé");
    await page.evaluate(function () { window.map.closePopup(); if (document.activeElement) document.activeElement.blur(); });
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(500);
    verifier(!(await lirePoint(page, "pt_pp_pl")).precis, "Ctrl+Z : le point précis est retiré");
    verifier(await poserPlaque(page, ptr, -100, 70), "reposé depuis la fiche");
    await ouvrirFiche(page, ptr, "pt_pp_pl");
    await ptr.tap(await centreDe(page, ".leaflet-popup [data-kta-act=\"precis-retirer\"]"));
    await page.waitForTimeout(400);
    g = await guides(page);
    verifier(!(await lirePoint(page, "pt_pp_pl")).precis && g.carres.length === 0,
      "« Retirer la précision » : champ retiré, pointillé effacé");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(500);
    verifier(!!(await lirePoint(page, "pt_pp_pl")).precis, "Ctrl+Z après « Retirer » : le point revient");

    // ── 6. Chatière : début puis fin ──
    await viderToasts(page);
    await ouvrirFiche(page, ptr, "pt_pp_ch");
    await ptr.tap(await centreDe(page, ".leaflet-popup [data-kta-act=\"precis\"]"));
    await page.waitForTimeout(300);
    const t1 = await page.evaluate(function () { return document.getElementById("kta-precis-floater").textContent; });
    const A = await planU(page, 100, -60), B = await planU(page, 220, -40);
    await ptr.tap(await ecran(page, A));
    await page.waitForTimeout(300);
    const t2 = await page.evaluate(function () {
      const f = document.getElementById("kta-precis-floater"); return f ? f.textContent : null;
    });
    verifier(/début/.test(t1) && /fin/.test(t2 || ""), "chatière : bandeau « début » puis « fin »", [t1, t2]);
    await ptr.tap(await ecran(page, B));
    await page.waitForTimeout(500);
    const ch = await lirePoint(page, "pt_pp_ch");
    const q = ch.precis || {};
    verifier(Math.abs(q.x - A.x) < 2 * o.k && Math.abs(q.y - A.y) < 2 * o.k && Math.abs(q.x2 - B.x) < 2 * o.k &&
      Math.abs(q.y2 - B.y) < 2 * o.k, "chatière : début et fin posés en deux taps", { A: A, B: B, lu: q });
    g = await guides(page);
    const eA = await ecran(page, { x: q.x, y: q.y }), eB = await ecran(page, { x: q.x2, y: q.y2 });
    verifier(g.carres.length === 3 && g.segments.length === 1 && boiteRelie(g.segments[0], eA, eB, tol) &&
      g.carres.some(function (c) { return proche(c, eA, tol); }) && g.carres.some(function (c) { return proche(c, eB, tol); }),
    "chatière : un carré au début, un à la fin, reliés", g);
    const und = await page.evaluate(function () { return window.__pp.undo; });
    inf("historique : " + und + " entrée(s)");
    await capture(page, "4-chatiere");

    // ── 7. Itinéraire : « Y aller » et ➕ visent le point précis ──
    const it = await page.evaluate(async function () {
      const pl = window.getEditorPoints().find(function (o) { return o.uid === "pt_pp_pl"; });
      const html = window.buildPointPopupHtml(pl, true, {});
      const d = document.createElement("div"); d.innerHTML = html;
      const aller = d.querySelector("[data-kta-act=\"aller\"]"), etape = d.querySelector("[data-kta-act=\"etape\"]");
      const orig = window.itineraireYAller;
      let recu = null;
      window.itineraireYAller = function (x, y) { recu = { x: x, y: y }; };
      document.body.appendChild(d);
      d.querySelector("[data-kta-act=\"aller\"]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      window.itineraireYAller = orig;
      d.remove();
      // Itinéraire réel depuis une origine imposée : la route finit au point précis (raccord compris).
      orig(recu.x, recu.y, "plaque", { origine: window.__pp.P(-380, -120) });
      await new Promise(function (r) { setTimeout(r, 1500); });
      const road = window.getRoads().find(function (r) { return r.type === "itinerary"; });
      const w = road && road.waypoints && road.waypoints[road.waypoints.length - 1];
      return { precis: pl.precis, cx: Number(aller.dataset.ktaCx), cy: Number(aller.dataset.ktaCy),
        ex: Number(etape.dataset.ktaCx), recu: recu, fin: w ? { x: w.x, y: w.y } : null, x: pl.x };
    });
    verifier(it.recu && it.recu.x === it.precis.x && it.recu.y === it.precis.y && it.ex === it.precis.x,
      "« Y aller » et ➕ de la fiche visent le point précis", it);
    verifier(it.fin && it.fin.x === it.precis.x && it.fin.y === it.precis.y, "itinéraire : arrivée au point précis",
      it.fin);
    await page.evaluate(function () {
      window.setRoads(window.getRoads().filter(function (r) { return r.type !== "itinerary"; }));
    });

    // ── 8. Exports KMZ, GeoJSON, GPX : la place de l'icône ──
    const ex = await page.evaluate(function () {
      const W = window.APP_CONFIG.imageWidth || 4000, H = window.APP_CONFIG.imageHeight || 3000;
      const calib = { pointA: { x: 0, y: H, lat: 46.5, lng: 3.0 }, pointB: { x: W, y: 0, lat: 46.51, lng: 3.02 },
        pointC: { x: W, y: H, lat: 46.5, lng: 3.02 } };
      const tr = window.KmzExport.buildTransformCalib(calib);
      const pts = window.getEditorPoints().filter(function (p) { return p.uid === "pt_pp_pl"; });
      const niv = new Set((window.APP_CONFIG.availableLevels || [0]).concat([0]));
      const data = { editorPoints: pts, roads: [], zones: [], structures: [] };
      const gj = window.GeojsonExport.generer({ transform: tr, epsg: 4326, include: { points: true }, levels: niv,
        data: data });
      const kml = window.KmzExport.genererKml({ transform: tr, planName: "Test", include: { points: true }, levels: niv,
        data: data });
      const doc = new DOMParser().parseFromString(kml, "application/xml");
      const c = doc.querySelector("Placemark Point coordinates");
      const ll = window.KmzExport.planToGps(tr, pts[0].x, pts[0].y);
      const kc = c ? c.textContent.trim().split(",").map(Number) : null;
      const gc = gj.features[0].geometry.coordinates;
      return { calib: calib, icone: ll, kml: kc, geo: gc, precisDansKml: /precis/.test(kml),
        precisDansGeo: JSON.stringify(gj).indexOf("precis") >= 0 };
    });
    const egal = function (a, lng, lat) { return !!a && Math.abs(a[0] - lng) < 1e-6 && Math.abs(a[1] - lat) < 1e-6; };
    verifier(egal(ex.kml, ex.icone.lng, ex.icone.lat) && !ex.precisDansKml, "KMZ : position de l'icône, pas de champ précis", ex);
    verifier(egal(ex.geo, ex.icone.lng, ex.icone.lat) && !ex.precisDansGeo, "GeoJSON : position de l'icône", ex.geo);
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 10000 }),
      page.evaluate(function (calib) {
        window.__ppCalib = window.KmzExport.getCalibration;
        window.KmzExport.getCalibration = function () { return calib; };
        window.GpxIO.exporter({ incEmbedded: false, incRoads: false });
      }, ex.calib)
    ]);
    const gpxF = path.join(SORTIE, "export.gpx");
    await dl.saveAs(gpxF);
    const gx = await page.evaluate(async function (txt) {
      const res = await window.GpxIO.importer(new File([txt], "x.gpx", { type: "application/gpx+xml" }),
        { confirmAdd: false });
      window.KmzExport.getCalibration = window.__ppCalib;
      const pts = (res && res._toApply && res._toApply.points) || [];
      const pl = window.getEditorPoints().find(function (o) { return o.uid === "pt_pp_pl"; });
      const d = pts.find(function (p) { return p.nom === pl.nom; });
      return { lu: d ? { x: d.x, y: d.y } : null, icone: { x: pl.x, y: pl.y } };
    }, fs.readFileSync(gpxF, "utf8"));
    verifier(!!gx.lu && Math.abs(gx.lu.x - gx.icone.x) < 1 && Math.abs(gx.lu.y - gx.icone.y) < 1,
      "GPX : waypoint à la place de l'icône (relu par l'import)", gx);

    // ── 9. POI de calque : precis lu, pointillé dessiné, pas de bouton ──
    const calque = await page.evaluate(async function () {
      const P = window.__pp.P, a = P(0, 300), b = P(40, 330);
      const json = { data: [{ id: "cq1", nom: "Plaque de calque", uid: "pt_pp_cq", x: a.x, y: a.y, level: 0,
        tags: ["plaque"], precis: { x: b.x, y: b.y } }] };
      const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
      const grp = L.layerGroup().addTo(window.map);
      window.ajouterPointsDepuisJSON(url, grp);
      await new Promise(function (r) { setTimeout(r, 1200); });
      const e = window.getAllEmbeddedPoints().find(function (p) { return p.uid === "pt_pp_cq"; });
      let mk = null;
      grp.eachLayer(function (l) { mk = l; });
      const html = mk ? window.buildPointPopupHtml(json.data[0], false, { layerId: "x" }) : "";
      const r = { precis: e && e.precis, guide: !!(mk && mk._ktaPrecisGuide), bouton: html.indexOf("precis") >= 0 &&
        html.indexOf("data-kta-act=\"precis\"") >= 0 };
      window.map.removeLayer(grp);
      window._ktaDataMarkers = (window._ktaDataMarkers || []).filter(function (m) { return m !== mk; });
      return r;
    });
    verifier(!!calque.precis && calque.guide && !calque.bouton,
      "POI de calque : getAllEmbeddedPoints porte precis, pointillé dessiné, aucun bouton (lecture)", calque);

    // ── 10. Session : export ZIP, anonymisé, réimport ──
    const zip = async function (anon) {
      await page.evaluate(function () { window.ouvrirExportSessionModal("full"); });
      await attendre(page, function () { return !!document.getElementById("kta-ses-download"); }, 10000);
      await page.evaluate(function (an) {
        const a = document.getElementById("full_anonymize");
        if (a && a.checked !== an) a.click();
      }, !!anon);
      await page.waitForTimeout(300);
      const [d] = await Promise.all([
        page.waitForEvent("download", { timeout: 20000 }),
        page.evaluate(function () { document.getElementById("kta-ses-download").click(); })
      ]);
      const f = path.join(SORTIE, anon ? "anon.bin" : "session.bin");
      await d.saveAs(f);
      await page.evaluate(function () { const b = document.getElementById("kta-ses-close"); if (b) b.click(); });
      await page.waitForTimeout(300);
      const buf = fs.readFileSync(f);
      if (buf[0] === 0x50 && buf[1] === 0x4b) {
        const z = await JSZip.loadAsync(buf);
        return { brut: buf, nom: "session.zip", s: JSON.parse(await z.file("session.json").async("string")) };
      }
      return { brut: buf, nom: "session.json", s: JSON.parse(buf.toString("utf8")) };
    };
    const z1 = await zip(false);
    const zpl = (z1.s.editorPoints || []).find(function (p) { return p.uid === "pt_pp_pl"; });
    const zch = (z1.s.editorPoints || []).find(function (p) { return p.uid === "pt_pp_ch"; });
    verifier(!!zpl && !!zpl.precis && !!zch && zch.precis && zch.precis.x2 !== undefined,
      "export de session : precis des deux POI (chatière à deux points)", { pl: zpl && zpl.precis, ch: zch && zch.precis });
    // Tableur : colonne precis en lecture (coordonnées, chatière début → fin), cellule non éditable.
    await page.evaluate(function () { window.ouvrirTableEditor(); });
    await page.click("#kta-tbl-src-json");
    await page.setInputFiles("#kta-tbl-file", { name: "session-pp.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(z1.s), "utf8") });
    await page.waitForSelector(".kta-tbl-entry");
    const iT = await page.evaluate(function () {
      const lib = window.I18n.t("tabledit.kind.editorPoints");
      return Array.prototype.slice.call(document.querySelectorAll(".kta-tbl-entry")).findIndex(function (b) {
        const n = b.querySelector(".kta-tbl-entry-count"); return !!n && n.textContent.trim().endsWith(" " + lib);
      });
    });
    await page.click('.kta-tbl-entry[data-i="' + iT + '"]');
    await page.waitForSelector("#kta-tbl-table thead th");
    const tb = await page.evaluate(function () {
      const tds = Array.prototype.slice.call(document.querySelectorAll('#kta-tbl-table td[data-col="precis"]'));
      return { textes: tds.map(function (t) { return t.textContent.trim(); }),
        lecture: tds.length > 0 && tds.every(function (t) { return t.classList.contains("col-readonly"); }) };
    });
    await page.click("#kta-tbl-close");
    await page.waitForTimeout(300);
    verifier(tb.lecture && tb.textes.some(function (t) { return /^[\d.]+, [\d.]+$/.test(t); }) &&
      tb.textes.some(function (t) { return /→/.test(t); }), "Tableur : colonne precis en lecture (chatière : début → fin)", tb);
    const z2 = await zip(true);
    verifier((z2.s.editorPoints || []).filter(function (p) { return p.precis; }).length === 2,
      "export anonymisé : precis gardé (géométrie seule)");
    const avantImp = await page.evaluate(function () {
      return window.getEditorPoints().map(function (p) { return p.uid + ":" + JSON.stringify(p.precis || null); }).sort();
    });
    await page.evaluate(function () { window.setEditorPoints([]); });
    await page.evaluate(function (a) {
      const s = atob(a.b); const u8 = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      window.ouvrirImportSession(new File([u8], a.nom, { type: a.nom.endsWith(".zip") ? "application/zip" : "application/json" }));
    }, { b: z1.brut.toString("base64"), nom: z1.nom });
    await attendre(page, function () { const b = document.getElementById("kta-import-valider"); return !!b && !b.disabled; }, 15000);
    await page.evaluate(function () { document.getElementById("kta-import-valider").click(); });
    await page.waitForTimeout(800);
    if (await page.evaluate(function () { return !!document.getElementById("kta-confirm-oui"); })) {
      await page.waitForTimeout(400);
      await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
    }
    await attendre(page, function () { return !document.getElementById("kta-import-modal"); }, 15000);
    await page.waitForTimeout(1000);
    const apresImp = await page.evaluate(function () {
      return window.getEditorPoints().map(function (p) { return p.uid + ":" + JSON.stringify(p.precis || null); }).sort();
    });
    verifier(JSON.stringify(apresImp) === JSON.stringify(avantImp), "réimport de la session : points précis identiques",
      { avant: avantImp, apres: apresImp });

    // ── 11. Sauvegarde, rechargement ──
    await page.evaluate(function () { window.SessionPersist.save({ force: true }); });
    await page.waitForTimeout(500);
    await ouvrirPlan(page);
    const recharge = await page.evaluate(function () {
      const p = window.getEditorPoints().find(function (o) { return o.uid === "pt_pp_ch"; });
      return p ? p.precis : null;
    });
    verifier(!!recharge && recharge.x2 !== undefined, "rechargement : le point précis de la chatière est relu", recharge);
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
    // Nettoyage de la session du plan fictif (rien ne reste pour le run suivant).
    await page.evaluate(function () {
      window.setEditorPoints([]); window.setRoads([]); window.SessionPersist.save({ force: true });
    });
  } catch (err) {
    pb("exception du harnais : " + (err && err.stack || err));
  } finally {
    await ctx.close();
  }
}

(async function main() {
  const liste = moteurs();
  try {
    for (const m of liste) {
      const nav = await lancerMoteur(m);
      if (!nav) { inf(m + " absent : moteur sauté"); continue; }
      try {
        for (const mode of (process.env.KTA_MODES || "souris,doigt").split(",")) await jouer(nav, m, mode);
      } finally {
        await nav.close();
      }
    }
  } finally {
    server.close();
    try { fs.rmSync(SORTIE, { recursive: true, force: true }); } catch (e) { /* dossier temporaire */ }
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — le point précis se pose depuis la fiche (chatière en deux points), s'annule, se " +
    "dessine au bon endroit, voyage avec la session et sert l'itinéraire ; les exports gardent l'icône.");
  process.exit(0);
})();
