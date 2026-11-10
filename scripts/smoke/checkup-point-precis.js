#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-point-precis.js — checkup (Playwright) : point précis d'un POI (js/poiPrecis.js)
// =====================================================================
// POI FICTIFS de session posés au centre de la vue du relevé fictif (sinon le premier plan de l'index). Joué sous
// chaque moteur (KTA_MOTEURS, Chromium et WebKit par défaut), à la souris puis au doigt.
// Vérifie : « 🎯 Augmenter la précision » dans la fiche (pas pour un passage peo, ni en lecture seule, ni pour un POI
// de calque) ; le bouton arme le bandeau sans rien poser, un tap pose le point (uid gardé, updatedAt changé, une
// entrée d'historique) ; chatière en trois taps puis « Terminer » / Entrée (une entrée d'historique ; Échap avec des
// points posés n'écrit rien) ; ancienne chatière { x, y, x2, y2 } lue sans migration ; Échap et ✕ annulent ; Ctrl+Z
// retire ; « Retirer la
// précision » ; pointillé et carré au bon endroit à zoom moyen, carte droite puis tournée, cachés de loin et
// montrés de loin fiche ouverte ; POI de calque (getAllEmbeddedPoints porte `precis`, son pointillé est dessiné) ;
// sauvegarde puis rechargement ; export de session (ZIP) et réimport ; anonymisé ; KMZ, GeoJSON et GPX à la place
// de l'icône ; « Y aller » et ➕ visent le point précis, l'itinéraire y finit ; « 📍 Je suis ici » y recale le
// tracker (chatière : le milieu de son tracé en longueur ; sans point précis ou passage : l'icône) et valide l'étape.
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
      // Sommets de chaque polyligne (commandes M / L du chemin SVG de Leaflet).
      sommets: Array.from(document.querySelectorAll("path.kta-precis-segment")).map(function (el) {
        return (String(el.getAttribute("d") || "").match(/[ML]/g) || []).length;
      }),
      interactif: Array.from(document.querySelectorAll(".kta-precis-trait, .kta-precis-segment, .kta-precis-carre"))
        .some(function (el) { return getComputedStyle(el).pointerEvents !== "none"; })
    };
  });
}
// Point d'une polyligne à mi-longueur (règle attendue de poiPrecis.js > milieu, recalculée ici).
function milieuNode(pts) {
  let tot = 0;
  for (let i = 1; i < pts.length; i++) tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let r = tot / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > 0 && r <= l) return { x: a.x + (b.x - a.x) * r / l, y: a.y + (b.y - a.y) * r / l };
    r -= l;
  }
  return { x: pts[0].x, y: pts[0].y };
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
      // Icône SVG de la précision (ktaIcones.js) devant le libellé.
      const b = document.querySelector(".leaflet-popup [data-kta-act=\"precis\"]");
      return b ? (b.querySelector("svg.kta-ico-crosshair") ? "[crosshair] " : "") + b.textContent.trim() : null;
    });
    verifier(!!btnTxt && btnTxt.indexOf("[crosshair] ") === 0, "fiche : bouton « 🎯 Augmenter la précision » (icône crosshair)", btnTxt);
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

    // ── 6. Chatière : un tap par point, « Terminer » (ou Entrée) à partir de 2 ──
    await viderToasts(page);
    const bandeauCh = function () {
      return page.evaluate(function () {
        const f = document.getElementById("kta-precis-floater");
        if (!f) return null;
        const b = document.getElementById("kta-precis-terminer");
        return { texte: f.querySelector(".kta-iti-floater-msg").textContent, fin: b ? !b.disabled : null,
          ico: !!f.querySelector(".kta-iti-floater-icon svg"), icoFin: !!(b && b.querySelector("svg.kta-ico-check")),
          mode: window.KtaPoiPrecis.enCours() };
      });
    };
    const armerCh = async function () {
      await ouvrirFiche(page, ptr, "pt_pp_ch");
      await ptr.tap(await centreDe(page, ".leaflet-popup [data-kta-act=\"precis\"]"));
      await page.waitForTimeout(300);
    };
    const A = await planU(page, 100, -60), B = await planU(page, 180, -10), C = await planU(page, 260, -50);
    // Échap avec deux points posés : rien n'est écrit.
    await armerCh();
    await ptr.tap(await ecran(page, A));
    await page.waitForTimeout(250);
    await ptr.tap(await ecran(page, B));
    await page.waitForTimeout(250);
    const avEsc = await bandeauCh();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    verifier(avEsc && avEsc.fin === true && !(await bandeauCh()) && !(await lirePoint(page, "pt_pp_ch")).precis,
      "chatière : Échap avec deux points posés annule, rien d'écrit", avEsc);
    const und0 = await page.evaluate(function () { return window.__pp.undo; });
    await armerCh();
    const t1 = await bandeauCh();
    await ptr.tap(await ecran(page, A));
    await page.waitForTimeout(300);
    const t2 = await bandeauCh();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    const t2b = await bandeauCh();
    await ptr.tap(await ecran(page, B));
    await page.waitForTimeout(300);
    const t3 = await bandeauCh();
    await ptr.tap(await ecran(page, C));
    await page.waitForTimeout(300);
    const t4 = await bandeauCh();
    const gTemp = await guides(page);
    verifier(t1 && /début/.test(t1.texte) && t1.fin === false && t1.ico && t1.icoFin && t2 && /suivant/.test(t2.texte) &&
      t2.fin === false && t2b && t2b.mode.points === 1 && t3 && /2 points/.test(t3.texte) && t3.fin === true &&
      t4 && /3 points/.test(t4.texte) && gTemp.carres.length >= 4,
    "chatière : bandeau « début », « suivant », puis « n points … Terminer » ; Terminer actif à partir de 2 points, " +
      "Entrée sans effet à 1 point, carrés provisoires", { t1: t1, t2: t2, t2b: t2b, t3: t3, t4: t4 });
    // Terminer : Entrée à la souris, le bouton au doigt.
    if (mode === "souris") await page.keyboard.press("Enter");
    else await ptr.tap(await centreDe(page, "#kta-precis-terminer"));
    await page.waitForTimeout(500);
    const ch = await lirePoint(page, "pt_pp_ch");
    const q = ch.precis || {}, qp = Array.isArray(q.pts) ? q.pts : [];
    const pres2 = function (a, b) { return !!a && Math.abs(a.x - b.x) < 2 * o.k && Math.abs(a.y - b.y) < 2 * o.k; };
    verifier(!(await bandeauCh()) && qp.length === 3 && pres2(qp[0], A) && pres2(qp[1], B) && pres2(qp[2], C) &&
      q.x2 === undefined, "chatière : trois points posés puis " + (mode === "souris" ? "Entrée" : "« Terminer »") +
      " → precis.pts dans l'ordre", { A: A, B: B, C: C, lu: q });
    const und = await page.evaluate(function () { return window.__pp.undo; });
    verifier(und === und0 + 1, "chatière : une seule entrée d'historique pour les trois points", [und0, und]);
    g = await guides(page);
    const eP = [];
    for (const a of qp) eP.push(await ecran(page, a));
    const mil = milieuNode(qp), eMil = await ecran(page, mil), eChIc = await ecran(page, ch);
    verifier(g.carres.length === 4 && g.segments.length === 1 && boiteRelie(g.segments[0], eP[0], eP[2], tol) &&
      g.sommets[0] === 3 && eP.every(function (e) { return g.carres.some(function (c) { return proche(c, e, tol); }); }),
    "chatière : un carré à chacun des trois points, reliés par une polyligne à trois sommets", g);
    verifier(g.traits.some(function (t) { return boiteRelie(t, eChIc, eMil, tol); }),
      "chatière : pointillé de l'icône au milieu du tracé (mi-longueur)", { traits: g.traits, eChIc: eChIc, eMil: eMil });
    const cen = await page.evaluate(function () {
      const p = window.getEditorPoints().find(function (o) { return o.uid === "pt_pp_ch"; });
      return { centre: window.KtaPoiPrecis.centre(p), cible: window.KtaPoiPrecis.cible(p) };
    });
    verifier(Math.abs(cen.centre.x - mil.x) < 1e-6 && Math.abs(cen.centre.y - mil.y) < 1e-6 &&
      cen.cible.x === cen.centre.x && cen.cible.y === cen.centre.y,
    "chatière : centre et cible = le point à mi-longueur du tracé (pas la moyenne des points)", { cen: cen, mil: mil });
    await capture(page, "4-chatiere");

    // ── 6 bis. Ancienne chatière { x, y, x2, y2 } : lue telle quelle, sans migration ──
    const vieille = await page.evaluate(function () {
      const P = window.__pp.P, a = P(-260, 120), b = P(-180, 160);
      const o = Object.assign({ id: "pt_pp_old", nom: "POI pt_pp_old", uid: "pt_pp_old", level: 0, tags: ["chatiere"],
        etat: "Non inspectée", description: "", source: "editor", updatedAt: 1000,
        precis: { x: a.x, y: a.y, x2: b.x, y2: b.y } }, P(-220, 60));
      window.setEditorPoints(window.getEditorPoints().concat([o]));
      window.renderEditorPoints();
      const p = window.getEditorPoints().find(function (x) { return x.uid === "pt_pp_old"; });
      return { brut: JSON.parse(JSON.stringify(p.precis)), lu: window.KtaPoiPrecis.lire(p),
        centre: window.KtaPoiPrecis.centre(p), a: a, b: b };
    });
    await page.waitForTimeout(400);
    g = await guides(page);
    const eOa = await ecran(page, vieille.a), eOb = await ecran(page, vieille.b);
    verifier(vieille.lu && vieille.lu.pts && vieille.lu.pts.length === 2 && vieille.lu.pts[1].x === vieille.b.x &&
      Math.abs(vieille.centre.x - (vieille.a.x + vieille.b.x) / 2) < 1e-6 && vieille.brut.x2 === vieille.b.x &&
      !vieille.brut.pts, "ancienne chatière (x, y, x2, y2) : lue en deux points, milieu au centre, champ non réécrit",
    vieille);
    verifier(g.segments.some(function (s) { return boiteRelie(s, eOa, eOb, tol); }) &&
      g.carres.some(function (c) { return proche(c, eOa, tol); }) && g.carres.some(function (c) { return proche(c, eOb, tol); }),
    "ancienne chatière : deux carrés reliés à l'écran", g);
    await page.evaluate(function () {
      window.setEditorPoints(window.getEditorPoints().filter(function (x) { return x.uid !== "pt_pp_old"; }));
      window.renderEditorPoints();
    });
    await page.waitForTimeout(300);

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

    // ── 7 bis. « 📍 Je suis ici » : le tracker va au point précis (chatière : son milieu), étape validée ──
    // Attendu = la règle de la galerie (tracking.js > _positionDansGalerie) jouée depuis le point précis ; sans point
    // précis (POI ordinaire, passage peo dont le champ est ignoré) : depuis l'icône.
    await page.evaluate(function () {
      const pe = window.getEditorPoints().find(function (o) { return o.uid === "pt_pp_peo"; });
      pe.precis = window.__pp.P(-100, 260);
      window.renderEditorPoints();
      window.__ppAttendu = function (x, y) {
        const C = window.APP_CONFIG, G = window.KtaGalerie;
        const r = G.versGalerie(x, y, C.multiLevel === true ? 0 : null);
        return { x: r.x, y: r.y, etat: r.etat };
      };
    });
    const ici = async function (uid) {
      if (!(await ouvrirFiche(page, ptr, uid))) return { fiche: false };
      const b = await centreDe(page, ".leaflet-popup [data-kta-act=\"ici\"]");
      if (!b) return { bouton: false };
      await ptr.tap(b);
      await page.waitForTimeout(700);
      return page.evaluate(function (u) {
        const p = window.getEditorPoints().find(function (o) { return o.uid === u; });
        const c = window.KtaPoiPrecis.centre(p);
        const t = window.getTrackingPosition();
        const a = c ? window.__ppAttendu(c.x, c.y) : null, ai = window.__ppAttendu(p.x, p.y);
        return { tracker: { x: t.x, y: t.y }, attendu: a, depuisIcone: ai, centre: c,
          ecartIcone: Math.hypot((a ? a.x : ai.x) - ai.x, (a ? a.y : ai.y) - ai.y) };
      }, uid);
    };
    const pres = function (a, b) { return !!a && !!b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01; };
    let r = await ici("pt_pp_pl");
    verifier(r.centre && pres(r.tracker, r.attendu) && r.ecartIcone > 1,
      "« Je suis ici » d'une plaque à point précis : tracker au point précis (règle de la galerie depuis lui)", r);
    r = await ici("pt_pp_ch");
    const ch7 = await lirePoint(page, "pt_pp_ch");
    const mil7 = milieuNode(ch7.precis.pts);
    verifier(r.centre && Math.abs(r.centre.x - mil7.x) < 0.01 && Math.abs(r.centre.y - mil7.y) < 0.01 &&
      pres(r.tracker, r.attendu) && r.ecartIcone > 1,
    "« Je suis ici » d'une chatière à trois points : tracker au milieu du tracé (mi-longueur)", r);
    r = await ici("pt_pp_info");
    verifier(!r.centre && pres(r.tracker, r.depuisIcone), "« Je suis ici » d'un POI sans point précis : à son icône",
      r);
    r = await ici("pt_pp_peo");
    verifier(!r.centre && pres(r.tracker, r.depuisIcone),
      "« Je suis ici » d'un passage (peo, champ précis ignoré) : à son icône", r);
    // Validation d'étape : une étape au point précis (« ➕ ») et une étape sur l'icône de la chatière (posée avant son
    // point précis) se valident par « Je suis ici » sur leur POI.
    const etape = async function (uid, surIcone) {
      await page.evaluate(function (a) {
        const P = window.__pp.P, pts = window.getEditorPoints();
        const p = pts.find(function (o) { return o.uid === a.uid; });
        const c = a.surIcone ? { x: p.x, y: p.y } : window.KtaPoiPrecis.cible(p);
        const fin = pts.find(function (o) { return o.uid === "pt_pp_info"; });
        const o = P(-300, 70);
        const road = { type: "itinerary", points: [o, c, { x: fin.x, y: fin.y }],
          waypoints: [{ x: o.x, y: o.y, source: "tracker", label: "départ" },
            { x: c.x, y: c.y, source: "poi", label: "étape" }, { x: fin.x, y: fin.y, source: "poi", label: "fin" }] };
        window.setRoads(window.getRoads().filter(function (q) { return q.type !== "itinerary"; }).concat([road]));
        window.__ppEtape = c;
      }, { uid: uid, surIcone: surIcone });
      await ici(uid);
      return page.evaluate(function () {
        const road = window.getRoads().find(function (q) { return q.type === "itinerary"; });
        const c = window.__ppEtape;
        const w = road && road.waypoints.find(function (q) {
          return q.source !== "tracker" && Math.round(q.x) === Math.round(c.x) && Math.round(q.y) === Math.round(c.y);
        });
        const confirme = !!document.getElementById("kta-confirm-oui");
        if (confirme) document.getElementById("kta-confirm-non").click();
        return { etape: w ? !!w.done : null, confirme: confirme };
      });
    };
    r = await etape("pt_pp_pl", false);
    verifier(r.etape === true, "« Je suis ici » valide l'étape posée au point précis", r);
    r = await etape("pt_pp_ch", true);
    verifier(r.etape === true, "« Je suis ici » valide aussi une étape posée sur l'icône du POI", r);
    await page.evaluate(function () {
      window.setRoads(window.getRoads().filter(function (q) { return q.type !== "itinerary"; }));
      const pe = window.getEditorPoints().find(function (o) { return o.uid === "pt_pp_peo"; });
      delete pe.precis;
      window.renderEditorPoints();
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
    verifier(!!zpl && !!zpl.precis && !!zch && zch.precis && Array.isArray(zch.precis.pts) && zch.precis.pts.length === 3,
      "export de session : precis des deux POI (chatière : ses trois points)", { pl: zpl && zpl.precis, ch: zch && zch.precis });
    // Tableur : colonne precis en lecture (coordonnées, chatière : tous ses points), cellule non éditable ; une
    // ancienne chatière (x2, y2) ajoutée au fichier y est lue aussi.
    const sTab = JSON.parse(JSON.stringify(z1.s));
    sTab.editorPoints.push(Object.assign({}, zch, { id: "pt_pp_old", uid: "pt_pp_old", nom: "POI pt_pp_old",
      precis: { x: 10, y: 20, x2: 30, y2: 40 } }));
    await page.evaluate(function () { window.ouvrirTableEditor(); });
    await page.click("#kta-tbl-src-json");
    await page.setInputFiles("#kta-tbl-file", { name: "session-pp.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(sTab), "utf8") });
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
      tb.textes.some(function (t) { return /^[\d.]+, [\d.]+( → [\d.]+, [\d.]+){2}$/.test(t); }) &&
      tb.textes.indexOf("10, 20 → 30, 40") >= 0,
    "Tableur : colonne precis en lecture (chatière : ses trois points ; ancienne chatière : début → fin)", tb);
    const z2 = await zip(true);
    const anCh = (z2.s.editorPoints || []).filter(function (p) {
      return p.precis && Array.isArray(p.precis.pts);
    })[0];
    verifier((z2.s.editorPoints || []).filter(function (p) { return p.precis; }).length === 2 && !!anCh &&
      anCh.precis.pts.length === 3 && JSON.stringify(anCh.precis.pts) === JSON.stringify(zch.precis.pts),
    "export anonymisé : precis gardé (géométrie seule ; chatière : ses trois points)", anCh && anCh.precis);
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
    verifier(!!recharge && Array.isArray(recharge.pts) && recharge.pts.length === 3,
      "rechargement : les trois points de la chatière sont relus", recharge);
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
  console.log("🎉 CHECKUP VERT — le point précis se pose depuis la fiche (chatière en plusieurs points), s'annule, se " +
    "dessine au bon endroit, voyage avec la session et sert l'itinéraire ; les exports gardent l'icône.");
  process.exit(0);
})();
