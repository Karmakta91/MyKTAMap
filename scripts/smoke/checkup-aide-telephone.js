#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-aide-telephone.js — checkup (Playwright, pas un hook pré-commit) : fiche d'Aide sur téléphone
// =====================================================================
// js/interfaceDocs.js > _aideOuvrirSousModal. Téléphone 390 (portrait) et 844×390 tactile (paysage) : la fiche
// REMPLACE le contenu du hub (aucune sous-fenêtre, un seul voile, une seule croix), « ← Retour » en tête ramène
// le hub à la même position de défilement, Échap revient au hub puis ferme l'Aide. PC 1280 : sous-fenêtre au-dessus
// du hub, inchangée. Thèmes sombre et clair ; contraste du « ← Retour » (≥ 4,5:1).
// Mouvement réduit (css/style.css, bloc « prefers-reduced-motion ») : l'arc de chargement pulse au lieu de tourner,
// une animation ordinaire reste coupée.
// Usage : node scripts/smoke/checkup-aide-telephone.js (SMOKE_PORT pour une autre copie de travail).
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};
const FORMATS = [
  { nom: "téléphone 390", viewport: { width: 390, height: 844 }, mobile: true, enPlace: true },
  { nom: "téléphone paysage 844×390", viewport: { width: 844, height: 390 }, mobile: true, enPlace: true },
  { nom: "PC 1280", viewport: { width: 1280, height: 800 }, enPlace: false }
];

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

function etat(page) {
  return page.evaluate(function () {
    function rgb(s) {
      const m = String(s).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map(function (x) { return parseFloat(x); });
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function lum(c) {
      const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function fond(el) {
      const pile = [];
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const c = rgb(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0) pile.push(c);
        if (c && c.a >= 1) break;
      }
      let b = { r: 255, g: 255, b: 255 };
      for (let i = pile.length - 1; i >= 0; i--) {
        const a = pile[i].a;
        b = { r: pile[i].r * a + b.r * (1 - a), g: pile[i].g * a + b.g * (1 - a), b: pile[i].b * a + b.b * (1 - a) };
      }
      return b;
    }
    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    }
    const hub = document.getElementById("kta-aide-modal");
    const corps = document.getElementById("kta-aide-corps");
    const back = document.getElementById("kta-aide-back");
    let ratio = null;
    if (back && visible(back)) {
      const x = lum(rgb(getComputedStyle(back).color)), y = lum(fond(back));
      ratio = Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100;
    }
    const croix = Array.prototype.filter.call(document.querySelectorAll(".kta-panneau-close"), visible).length;
    const voiles = Array.prototype.filter.call(document.querySelectorAll(".kta-readme-modal-overlay"), visible).length;
    return {
      hub: !!hub,
      sous: !!document.getElementById("kta-aide-submodal"),
      enFiche: !!(hub && hub.classList.contains("kta-aide-en-fiche")),
      fiche: visible(document.querySelector("#kta-aide-modal .kta-aide-fiche-vue .kta-aide-section")),
      lignesVisibles: Array.prototype.filter.call(document.querySelectorAll("#kta-aide-modal .kta-aide-row"), visible).length,
      back: visible(back),
      ratio: ratio,
      croix: croix,
      voiles: voiles,
      scroll: corps ? Math.round(corps.scrollTop) : null
    };
  });
}

async function parcours(nav, f, theme) {
  const ctx = await nav.newContext({ viewport: f.viewport, isMobile: !!f.mobile, hasTouch: !!f.mobile, serviceWorkers: "block" });
  const page = await ctx.newPage();
  page.on("pageerror", function (e) { pb(f.nom + " / " + theme + " : erreur de page " + String(e).slice(0, 200)); });
  await page.addInitScript(function (ls) { for (const k in ls) localStorage.setItem(k, ls[k]); },
    Object.assign({}, LS_PREGATES, { "myktamap_theme_v1": theme }));
  const tag = f.nom + " / " + theme;
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return typeof window.afficherAide === "function" && !document.getElementById("splashOverlay"); }, 25000);
    await page.evaluate(function () { window.afficherAide(); });
    await attendre(page, function () { return document.querySelectorAll("#kta-aide-modal .kta-aide-row").length > 10; }, 5000);
    // Défiler le hub, puis ouvrir la fiche d'une ligne visible plus bas. 🩸 Playwright fait défiler la cible
    // avant de cliquer : on la met en vue d'abord, sinon la position relevée n'est pas celle du clic.
    await page.evaluate(function () { const c = document.getElementById("kta-aide-corps"); c.scrollTop = 300; });
    const lignes = page.locator("#kta-aide-modal .kta-aide-row");
    const n = await lignes.count();
    let cible = null;
    for (let i = 1; i < n && !cible; i++) {
      if (!(await lignes.nth(i).isVisible())) continue;
      const b = await lignes.nth(i).boundingBox();
      if (b && b.y > 120) cible = lignes.nth(i);
    }
    if (!cible) { pb(tag + " : aucune ligne visible à ouvrir"); return; }
    await cible.scrollIntoViewIfNeeded();
    const scrollAvant = (await etat(page)).scroll;
    await cible.click();
    await page.waitForTimeout(300);
    const e1 = await etat(page);
    if (f.enPlace) {
      verifier(!e1.sous && e1.enFiche && e1.fiche, tag + " : la fiche remplace le hub (pas de sous-fenêtre)", e1);
      verifier(e1.lignesVisibles === 0, tag + " : le hub est masqué pendant la fiche", e1.lignesVisibles);
      verifier(e1.voiles === 1 && e1.croix === 1, tag + " : un voile, une croix", { voiles: e1.voiles, croix: e1.croix });
      verifier(e1.back && e1.ratio >= 4.5, tag + " : « ← Retour » visible et lisible (" + e1.ratio + ":1)", e1.ratio);
      verifier(e1.scroll === 0, tag + " : la fiche s'ouvre en haut", e1.scroll);
      await page.locator("#kta-aide-back").click();
      await page.waitForTimeout(200);
      const e2 = await etat(page);
      verifier(e2.hub && !e2.enFiche && e2.lignesVisibles > 5, tag + " : Retour rend le hub", e2);
      verifier(Math.abs(e2.scroll - scrollAvant) <= 2, tag + " : même position de défilement (" + scrollAvant + " → " + e2.scroll + ")");
      await cible.click();
      await page.waitForTimeout(200);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const e3 = await etat(page);
      verifier(e3.hub && !e3.enFiche, tag + " : Échap sur la fiche revient au hub", e3);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      verifier(!(await etat(page)).hub, tag + " : Échap sur le hub ferme l'Aide");
    } else {
      verifier(e1.sous && !e1.enFiche, tag + " : sous-fenêtre au-dessus du hub (PC inchangé)", e1);
      verifier(e1.back && e1.ratio >= 4.5, tag + " : « ← Retour » visible et lisible (" + e1.ratio + ":1)", e1.ratio);
      await page.locator("#kta-aide-back").hover();
      await page.waitForTimeout(150);
      const survol = (await etat(page)).ratio;
      verifier(survol >= 4.5, tag + " : « ← Retour » survolé lisible (" + survol + ":1)", survol);
      await page.locator("#kta-aide-back").click();
      await page.waitForTimeout(200);
      const e2 = await etat(page);
      verifier(e2.hub && !e2.sous && e2.lignesVisibles > 5, tag + " : Retour ferme la sous-fenêtre, le hub reste", e2);
    }
  } catch (e) {
    pb(tag + " : exception du harnais : " + (e && e.message));
  } finally {
    await ctx.close();
  }
}

async function mouvementReduit(nav) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) { for (const k in ls) localStorage.setItem(k, ls[k]); }, LS_PREGATES);
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!window.OOMGuard && !document.getElementById("splashOverlay"); }, 25000);
    const a = await page.evaluate(function () {
      const out = {};
      ["kta-load-spinner", "kta-sortie-spinner", "kta-poi-photo-spinner", "kta-charge-tourne", "kta-readme-modal-overlay"].forEach(function (c) {
        const d = document.createElement("div");
        d.className = c;
        document.body.appendChild(d);
        const cs = getComputedStyle(d);
        out[c] = { nom: cs.animationName, duree: cs.animationDuration, fois: cs.animationIterationCount };
        d.remove();
      });
      return out;
    });
    ["kta-load-spinner", "kta-sortie-spinner", "kta-poi-photo-spinner", "kta-charge-tourne"].forEach(function (c) {
      const x = a[c];
      verifier(x.nom === "kta-charge-pulse" && x.fois === "infinite" && parseFloat(x.duree) >= 1,
        "mouvement réduit : ." + c + " pulse (" + x.nom + " " + x.duree + ")", x);
    });
    const o = a["kta-readme-modal-overlay"];
    verifier(parseFloat(o.duree) < 0.01, "mouvement réduit : l'ouverture d'une fenêtre reste coupée (" + o.duree + ")", o);
  } catch (e) {
    pb("mouvement réduit : exception du harnais : " + (e && e.message));
  } finally {
    await ctx.close();
  }
}

(async function () {
  const nav = await lancerNavigateur(chromium);
  try {
    for (const f of FORMATS) {
      for (const theme of ["dark", "light"]) {
        console.log("\n── " + f.nom + " · thème " + (theme === "dark" ? "sombre" : "clair") + " ──");
        await parcours(nav, f, theme);
      }
    }
    console.log("\n── Mouvement réduit ──");
    await mouvementReduit(nav);
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("⚠️ CHECKUP AIDE TÉLÉPHONE ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("✅ CHECKUP AIDE TÉLÉPHONE VERT");
})().catch(function (e) { console.error(e); process.exit(1); });
