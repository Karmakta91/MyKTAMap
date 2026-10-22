#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-pastille-horsligne.js — checkup (Playwright) : pastille « hors-ligne » de l'accueil, coût et états
// =====================================================================
// Parcours : accueil en téléphone 390 × 844, service worker contrôleur, cache complet.
//   1. Coût de SwInspector.etat() (comparaison SW ↔ Cache API), OFF_N appels (défaut 15) au processeur normal
//      puis ralenti ×4 et ×6 (CDP Emulation.setCPUThrottlingRate) : médiane, p90, max, tâches longues (> 50 ms).
//   2. États, thème sombre puis clair : vert (cache complet), rouge (3 fichiers retirés du cache : 📥 dans
//      l'en-tête), orange hors réseau (mêmes manquants, navigateur hors ligne), orange « récupération en cours ».
//      Contraste du point sur le fond qui le porte ≥ 3:1 (composant d'interface, WCAG 1.4.11), couleur pleine.
// Captures dans $OFF_SHOTS (facultatif) : pied de page en gros plan pour chaque état et thème.
// Usage : node scripts/smoke/checkup-pastille-horsligne.js (SMOKE_PORT pour une autre copie) · doc : perf-memory.md
// =====================================================================
"use strict";

const path = require("path");
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const SHOTS = process.env.OFF_SHOTS || "";
const N = parseInt(process.env.OFF_N, 10) || 15;
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Dans la page : classe, couleur du point, fond effectif et contraste.
function lireDot() {
  const dot = document.getElementById("loaderOfflineDot");
  const hdr = document.getElementById("loaderOfflineHdrBtn");
  if (!dot) return null;
  const rgb = function (s) { const m = String(s).match(/[\d.]+/g) || []; return m.map(Number); };
  const lum = function (c) {
    const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  let fond = null, e = dot;
  while (e && !fond) {
    const c = rgb(getComputedStyle(e).backgroundColor);
    if (c.length >= 3 && (c.length < 4 || c[3] > 0.9)) fond = c;
    e = e.parentElement;
  }
  fond = fond || [255, 255, 255];
  const point = rgb(getComputedStyle(dot, "::before").backgroundColor);
  const l1 = lum(point), l2 = lum(fond);
  const r = dot.getBoundingClientRect();
  return { cls: dot.className, hidden: dot.hidden, titre: dot.title, point: point, fond: fond,
    contraste: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100,
    hdrVisible: !!hdr && !hdr.hidden && !!hdr.offsetParent, zone: [Math.round(r.width), Math.round(r.height)],
    clair: document.documentElement.classList.contains("kta-theme-light") };
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    // Fin de l'auto-réparation (~5 s après l'accueil) : avant, un fichier retiré du cache serait aussitôt remis.
    window.__ktaAutoHealFin = 0;
    window.addEventListener("kta-sw-autoheal", function (e) {
      if (!e.detail || e.detail.phase !== "debut") window.__ktaAutoHealFin++;
    });
  }, LS_PREGATES);
  const cdp = await ctx.newCDPSession(page);
  async function capture(nom) {
    if (!SHOTS) return;
    const box = await page.evaluate(function () {
      const d = document.getElementById("loaderOfflineDot");
      if (!d) return null;
      d.scrollIntoView({ block: "center" });
      const r = d.getBoundingClientRect();
      const x = Math.min(Math.max(0, r.left - 150), innerWidth - 300);
      return { x: Math.max(0, x), y: Math.max(0, r.top - 30), width: Math.min(300, innerWidth), height: 60 };
    });
    if (box) await page.screenshot({ path: path.join(SHOTS, "pastille-" + nom + ".png"), clip: box });
  }
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!window.SwInspector && !!navigator.serviceWorker; }, 20000);
    // Premier chargement : le SW s'installe et précache ; il ne contrôle la page qu'après un rechargement.
    try {
      await attendre(page, function () { return !!navigator.serviceWorker.controller; }, 30000);
    } catch (e) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await attendre(page, function () { return !!navigator.serviceWorker.controller; }, 30000);
    }
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await attendre(page, function () {
      const d = document.getElementById("loaderOfflineDot");
      return !!d && !d.hidden && d.classList.contains("kta-offline-ok");
    }, 90000, 500);
    await attendre(page, function () { return window.__ktaAutoHealFin > 0; }, 30000);
    ok("accueil : service worker contrôleur, auto-réparation passée, pastille verte");

    // ── 1. Coût de etat() ──
    const mesures = {};
    for (const taux of [1, 4, 6]) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: taux });
      const m = await page.evaluate(async function (n) {
        const longues = [];
        let obs = null;
        try {
          obs = new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { longues.push(e.duration); }); });
          obs.observe({ type: "longtask", buffered: false });
        } catch (e) {}
        const t = [];
        let attendus = 0;
        await window.SwInspector.etat();   // chauffe
        for (let i = 0; i < n; i++) {
          const t0 = performance.now();
          const r = await window.SwInspector.etat();
          t.push(performance.now() - t0);
          attendus = r.attendus;
        }
        await new Promise(function (r) { setTimeout(r, 200); });
        if (obs) obs.disconnect();
        t.sort(function (a, b) { return a - b; });
        const q = function (p) { return Math.round(t[Math.min(t.length - 1, Math.floor(p * t.length))] * 10) / 10; };
        return { mediane: q(0.5), p90: q(0.9), max: Math.round(t[t.length - 1] * 10) / 10, attendus: attendus,
          longues: longues.length, longueMax: longues.length ? Math.round(Math.max.apply(null, longues)) : 0 };
      }, N);
      mesures[taux] = m;
      console.log("    CPU ×" + taux + " : etat() médiane " + m.mediane + " ms · p90 " + m.p90 + " · max " + m.max +
        " · " + m.attendus + " fichiers comparés · tâches longues " + m.longues + (m.longues ? " (max " + m.longueMax + " ms)" : ""));
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    verifier(mesures[6].attendus > 0, "etat() compare bien le précache (" + mesures[6].attendus + " fichiers)");
    verifier(mesures[6].p90 < 200, "CPU ×6 : etat() sous 200 ms au p90", mesures[6]);

    // ── 2. États, sombre puis clair ──
    const verifier_ = async function (theme, nom, classe, hdr) {
      const d = await page.evaluate(lireDot);
      verifier(d && !d.hidden && d.cls.indexOf(classe) >= 0, theme + " · " + nom + " : " + classe, d);
      verifier(d && d.contraste >= 3, theme + " · " + nom + " : point lisible sur son fond (" + (d && d.contraste) + ":1)",
        d && { point: d.point, fond: d.fond });
      verifier(!!d && d.hdrVisible === hdr, theme + " · " + nom + " : 📥 de l'en-tête " + (hdr ? "affiché" : "masqué"));
      await capture(theme + "-" + nom);
      return d;
    };
    const repeindre = function () {
      return page.evaluate(function () {
        window.dispatchEvent(new CustomEvent("kta-sw-autoheal", { detail: { phase: "fin" } }));
      });
    };
    const attendreClasse = function (c) {
      return page.evaluate(async function (k) {
        for (let i = 0; i < 40; i++) {
          const d = document.getElementById("loaderOfflineDot");
          if (d && d.classList.contains(k)) return true;
          await new Promise(function (r) { setTimeout(r, 250); });
        }
        return false;
      }, c);
    };
    const lus = {};
    const themes = ["sombre", "clair"];
    for (const th of themes) {
      await page.evaluate(function (clair) { window.ThemeManager.setTheme(clair ? "light" : "dark"); }, th === "clair");
      await page.waitForTimeout(800);
      verifier((await page.evaluate(lireDot)).clair === (th === "clair"), "thème " + th + " appliqué à l'accueil");
      lus[th + "-vert"] = await verifier_(th, "vert", "kta-offline-ok", false);
    }
    // Trois fichiers retirés du cache : des manquants que l'auto-réparation n'a pas encore vus.
    const retires = await page.evaluate(async function () {
      // Mêmes trois fichiers retirés de TOUS les caches : celui que compare etat() est le précache du SW actif.
      const noms = await caches.keys();
      let cibles = null;
      for (const n of noms) {
        const c = await caches.open(n);
        if (!cibles) {
          cibles = (await c.keys()).map(function (r) { return new URL(r.url).pathname; })
            .filter(function (p) { return /^\/js\/[^/]+\.js$/.test(p); }).slice(0, 3);
        }
        for (const p of cibles) await c.delete(p, { ignoreSearch: true });
      }
      return cibles || [];
    });
    verifier(retires.length === 3, "3 fichiers retirés du cache", retires);
    for (const th of themes) {
      await page.evaluate(function (clair) { window.ThemeManager.setTheme(clair ? "light" : "dark"); }, th === "clair");
      await page.waitForTimeout(800);   // transitions de couleur du changement de thème
      await repeindre();
      await attendreClasse("kta-offline-ko");
      lus[th + "-rouge"] = await verifier_(th, "rouge", "kta-offline-ko", true);
    }
    await ctx.setOffline(true);
    for (const th of themes) {
      await page.evaluate(function (clair) { window.ThemeManager.setTheme(clair ? "light" : "dark"); }, th === "clair");
      await page.waitForTimeout(800);   // transitions de couleur du changement de thème
      await repeindre();
      await attendreClasse("kta-offline-wait");
      await page.waitForTimeout(800);
      lus[th + "-orange-horsReseau"] = await verifier_(th, "orange hors réseau", "kta-offline-wait", false);
      const titre = lus[th + "-orange-horsReseau"] && lus[th + "-orange-horsReseau"].titre;
      verifier(/3/.test(titre || ""), th + " · orange hors réseau : le titre compte les 3 manquants", titre);
    }
    await ctx.setOffline(false);
    for (const th of themes) {
      await page.evaluate(function (clair) {
        window.ThemeManager.setTheme(clair ? "light" : "dark");
        window.dispatchEvent(new CustomEvent("kta-sw-autoheal", { detail: { phase: "debut" } }));
      }, th === "clair");
      await page.waitForTimeout(800);
      lus[th + "-orange-encours"] = await verifier_(th, "orange récupération", "kta-offline-wait", false);
    }
    await repeindre();
    console.log("    couleurs (point / fond / contraste) : " + Object.keys(lus).map(function (k) {
      const d = lus[k]; return d ? k + " " + d.point.slice(0, 3).join(",") + " / " + d.fond.slice(0, 3).join(",") + " / " + d.contraste : k;
    }).join(" · "));
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  } catch (e) {
    pb("exception du harnais : " + String(e && e.message).split("\n")[0]);
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — pastille hors-ligne : coût mesuré, états vert / rouge / orange lisibles dans les deux thèmes.");
  process.exit(0);
})();
