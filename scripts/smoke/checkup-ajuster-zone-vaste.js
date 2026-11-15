#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-ajuster-zone-vaste.js — checkup (Playwright, Chromium) : ajuster les sommets d'une grande forme
// =====================================================================
// Mode « ajuster les sommets » (js/ajusterSommets.js) sur des objets FICTIFS posés au centre de la vue du relevé
// fictif : masse au sol petite et vaste (avec et sans rampe), zone eau petite et très vaste (côtés longs, bouts hors
// de l'écran), pilier. À deux zooms (de près, et assez loin pour voir la vaste en entier), à la souris puis au doigt
// (CDP) : appui long sur un sommet visible → il se déplace ; appui long sur le contour à 30 % d'un côté (loin de son
// milieu) → un sommet y naît. 🩸 La recherche visait le MILIEU des côtés : sur un côté long, toucher le contour loin du
// milieu ne trouvait rien (un pilier, aux côtés courts, répondait partout).
// Usage : node scripts/smoke/checkup-ajuster-zone-vaste.js (SMOKE_PORT pour une autre copie)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }
function verifier(c, m, d) { if (c) ok(m); else pb(m + (d !== undefined ? " " + JSON.stringify(d) : "")); }

async function ouvrir(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const b = document.getElementById("kta-alert-ok"); if (b) b.click();
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.KtaAjusterSommets && !!window.HistoryManager;
  }, 60000);
  await page.waitForTimeout(4000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    const cfg = window.APP_CONFIG;
    if (cfg.multiLevel === true) { cfg.activeLevel = 0; if (cfg.visibleLevels.indexOf(0) < 0) cfg.visibleLevels.push(0); }
    window.map.setView(window.map.getCenter(), window.map.getMaxZoom() - 1, { animate: false });
  });
  await page.waitForTimeout(800);
}

// Objets autour du centre de la fenêtre (unités : px d'écran au zoom de départ, convertis en plan).
function semer(page) {
  return page.evaluate(function () {
    const m = window.map, H = window.APP_CONFIG.imageHeight;
    const cr = m.getContainer().getBoundingClientRect();
    const c = m.containerPointToLatLng([innerWidth / 2 - cr.left, innerHeight / 2 - 40 - cr.top]);
    const k = 1 / m.options.crs.scale(m.getZoom());
    const bx = c.lng, by = H - c.lat;
    const P = function (u, v) { return { x: bx + u * k, y: by + v * k }; };
    window.__az = {
      ecran: function (x, y) {
        const p = m.latLngToContainerPoint(window.convertCoord(x, y));
        const r = m.getContainer().getBoundingClientRect();
        return [r.left + p.x, r.top + p.y];
      },
      lire: function (uid) {
        const o = window.getZones().concat(window.getStructures()).find(function (z) { return z.uid === uid; });
        return o ? JSON.parse(JSON.stringify(o.points)) : null;
      },
      centre: [bx, by], k: k
    };
    window.setZones([
      { uid: "zn_az_ms", type: "masse-sol", comble: 0.5, level: 0, points: [P(-260, -200), P(-140, -200), P(-140, -90), P(-260, -90)] },
      { uid: "zn_az_msr", type: "masse-sol", comble: 0.5, level: 0, rampes: [{ bord: 3 }],
        points: [P(-100, -200), P(20, -200), P(20, -90), P(-100, -90)] },
      { uid: "zn_az_eau", type: "eau", level: 0, points: [P(60, -200), P(180, -200), P(180, -90), P(60, -90)] },
      // Vastes : côtés de ~2 400 px d'écran au zoom de départ, bouts hors de l'écran
      { uid: "zn_az_msv", type: "masse-sol", comble: 0.5, level: 0, points: [P(-1200, 40), P(1200, 40), P(1200, 2400), P(-1200, 2400)] },
      { uid: "zn_az_eauv", type: "eau", level: 0, points: [P(-1200, -2600), P(1200, -2600), P(1200, -250), P(-1200, -250)] }
    ]);
    window.setStructures([
      { uid: "st_az_p", type: "pilier-1", level: 0, points: [P(220, -200), P(300, -200), P(300, -120), P(220, -120)] }
    ]);
    window.HistoryManager.reset();
    return { k: k, zoom: m.getZoom() };
  });
}

function pointeur(page, cdp, mode) {
  if (mode === "doigt") {
    return {
      down: p => cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p[0], y: p[1] }] }),
      move: p => cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p[0], y: p[1] }] }),
      up: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    };
  }
  return {
    down: async p => { await page.mouse.move(p[0], p[1]); await page.mouse.down(); },
    move: p => page.mouse.move(p[0], p[1]),
    up: () => page.mouse.up()
  };
}

// Appui long en `a` (écran), glissé de 30 px, lâcher.
async function geste(page, ptr, a) {
  await ptr.down(a);
  await page.waitForTimeout(650);
  for (let i = 1; i <= 6; i++) { await ptr.move([a[0] + 5 * i, a[1] + 4 * i]); await page.waitForTimeout(25); }
  await ptr.up([a[0] + 30, a[1] + 24]);
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape").catch(function () {});
}

// Sur l'écran, avec une marge (barre d'état, bords) ?
function surEcran(page, p) {
  return page.evaluate(function (p) {
    return p[0] > 60 && p[0] < innerWidth - 80 && p[1] > 80 && p[1] < innerHeight - 90;
  }, p);
}

async function essais(page, ptr, quoi) {
  const uids = ["zn_az_ms", "zn_az_msr", "zn_az_eau", "st_az_p", "zn_az_msv", "zn_az_eauv"];
  for (const uid of uids) {
    // Sommet visible : le premier sur l'écran
    let pts = await page.evaluate(function (u) { return window.__az.lire(u); }, uid);
    let fait = false;
    for (let i = 0; i < pts.length && !fait; i++) {
      const a = await page.evaluate(function (p) { return window.__az.ecran(p.x, p.y); }, pts[i]);
      if (!(await surEcran(page, a))) continue;
      fait = true;
      const vise = await page.evaluate(function (a) { return window.KtaAjusterSommets.viser(a[0], a[1]); }, a);
      await geste(page, ptr, a);
      const apres = await page.evaluate(function (u) { return window.__az.lire(u); }, uid);
      const bouge = apres.length === pts.length && Math.hypot(apres[i].x - pts[i].x, apres[i].y - pts[i].y) > 1e-6;
      verifier(bouge, quoi + " · " + uid + " : appui long sur un sommet → il se déplace", { vise: vise });
      await page.evaluate(function () { window.HistoryManager.undo(); });
      await page.waitForTimeout(150);
    }
    if (!fait) inf(quoi + " · " + uid + " : aucun sommet à l'écran (normal pour une forme vaste de près)");
    // Contour à 30 % d'un côté, sur l'écran
    pts = await page.evaluate(function (u) { return window.__az.lire(u); }, uid);
    fait = false;
    for (let i = 0; i < pts.length && !fait; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      for (const t of [0.3, 0.7, 0.45]) {
        const pt = { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
        const a = await page.evaluate(function (p) { return window.__az.ecran(p.x, p.y); }, pt);
        if (!(await surEcran(page, a))) continue;
        const mil = await page.evaluate(function (pq) {
          return window.__az.ecran((pq[0].x + pq[1].x) / 2, (pq[0].y + pq[1].y) / 2);
        }, [p, q]);
        if (Math.hypot(mil[0] - a[0], mil[1] - a[1]) < 40) continue;   // trop près du milieu : pas probant
        fait = true;
        const vise = await page.evaluate(function (a) { return window.KtaAjusterSommets.viser(a[0], a[1]); }, a);
        await geste(page, ptr, a);
        const apres = await page.evaluate(function (u) { return window.__az.lire(u); }, uid);
        verifier(apres.length === pts.length + 1,
          quoi + " · " + uid + " : appui long sur le contour loin du milieu du côté → un sommet y naît",
          { vise: vise, avant: pts.length, apres: apres.length, distMilieuPx: Math.round(Math.hypot(mil[0] - a[0], mil[1] - a[1])) });
        await page.evaluate(function () { window.HistoryManager.undo(); });
        await page.waitForTimeout(150);
        break;
      }
    }
    if (!fait) inf(quoi + " · " + uid + " : aucun point de contour probant à l'écran");
  }
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  try {
    for (const mode of ["souris", "doigt"]) {
      const ctx = await nav.newContext(mode === "doigt"
        ? { viewport: { width: 900, height: 820 }, hasTouch: true, isMobile: false, serviceWorkers: "block" }
        : { viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on("pageerror", function (e) { erreurs.push(String(e).slice(0, 160)); });
      await page.addInitScript(function (ls) { for (const k in ls) localStorage.setItem(k, ls[k]); }, LS_PREGATES);
      const cdp = mode === "doigt" ? await ctx.newCDPSession(page) : null;
      await ouvrir(page);
      const s = await semer(page);
      const ptr = pointeur(page, cdp, mode);
      console.log("— " + mode + ", de près (zoom " + s.zoom + ")");
      await essais(page, ptr, mode + " de près");
      // Assez loin pour voir la vaste en entier
      await page.evaluate(function () {
        const b = L.latLngBounds(window.getZones().filter(function (z) { return /v$/.test(z.uid); })
          .reduce(function (acc, z) { return acc.concat(z.points.map(function (p) { return window.convertCoord(p.x, p.y); })); }, []));
        window.map.fitBounds(b, { animate: false, padding: [40, 40] });
      });
      await page.waitForTimeout(800);
      console.log("— " + mode + ", de loin (zoom " + (await page.evaluate(function () { return window.map.getZoom(); })) + ")");
      await essais(page, ptr, mode + " de loin");
      verifier(erreurs.length === 0, mode + " : aucune erreur de page", erreurs.slice(0, 3));
      await ctx.close();
    }
  } catch (e) {
    pb("exception : " + (e && e.stack || e));
  } finally {
    await nav.close();
    console.log("");
    console.log(problemes.length ? "❌ Ajuster une grande forme : " + problemes.length + " problème(s)"
      : "✅ Ajuster une grande forme : sommets et contour répondent");
    process.exit(problemes.length ? 1 : 0);
  }
})();
