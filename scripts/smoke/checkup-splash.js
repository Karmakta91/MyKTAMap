#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-splash.js — checkup ciblé (marche 3 du RELEASE_GATE), non branché au pre-commit
// =====================================================================
// Splash de démarrage (js/ktaSplash.js, main.js > _splashEnd) en téléphone 390×844 et PC 1280×800 :
//   1. première ouverture : animation en cours à 1 s, image finale complète (38 galeries tracées, 6 pictos,
//      rose, titre), fondu seulement à la fin de l'animation (≥ 4 s) quand l'accueil est déjà là ;
//   2. accueil lent (main.js retardé) : le splash attend que #planLoaderOverlay soit affiché ;
//   3. clic pendant l'animation, accueil prêt : fondu aussitôt ; accueil pas prêt (et Échap) : image finale,
//      puis attente de l'accueil ;
//   4. deux ouvertures de suite : la seconde rejoue l'animation complète (pas de version raccourcie), et la clé
//      d'une ancienne version courte est retirée ;
//   5. plafond de sécurité : fondu à 12 s même si l'accueil n'arrive pas ;
//   6. mouvement réduit : image finale directe ;
//   7. coût au démarrage, processeur ralenti ×4 : affichage de l'accueil et tâches longues (informatif).
// 🩸 Les instants viennent d'une sonde posée AVANT le chargement (addInitScript, performance.now() = depuis
//    le début de la navigation) : mesurer depuis le harnais ajouterait le temps du protocole.
// Usage : cd scripts/smoke && node checkup-splash.js (SPLASH_SHOTS=<dossier> : captures de l'image finale)
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const LS = {
  myktamap_unlock_v1: "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  myktamap_terms_accepted_v1: "1",
  myktamap_pin_proposal_done_v1: "1",
  myktamap_tutorial_seen_v1: "1"
};
const BRUIT_TOLERE = [/Licence-pro\.json/i, /version\.json/i, /ping\.html/i, /live-config/i, /favicon/i];

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function info(m) { console.log("  ℹ️  " + m); }

// Sonde : instant du fondu, de l'accueil affiché, du retrait ; tâches longues.
function sonde(ls) {
  for (const k in ls) localStorage.setItem(k, ls[k]);
  const s = window.__sonde = { fondu: null, accueil: null, retire: null, longues: 0, longuesMs: 0 };
  let vu = false;
  const tic = function () {
    const sp = document.getElementById("splashOverlay");
    const lo = document.getElementById("planLoaderOverlay");
    const t = Math.round(performance.now());
    if (sp) vu = true;
    if (sp && s.fondu === null && sp.classList.contains("fading")) s.fondu = t;
    if (vu && !sp && s.retire === null) s.retire = t;
    if (lo && s.accueil === null && lo.style.display === "flex") s.accueil = t;
    if (s.retire === null || s.accueil === null) setTimeout(tic, 15);
  };
  tic();
  try {
    new PerformanceObserver(function (l) {
      l.getEntries().forEach(function (e) { s.longues++; s.longuesMs += e.duration; });
    }).observe({ type: "longtask", buffered: true });
  } catch (e) { /* navigateur sans longtask */ }
}

// État visible du splash : chemins tracés, pictos, rose, titre.
function etatSplash() {
  const sp = document.getElementById("splashOverlay");
  if (!sp) return null;
  const op = function (el) { return el ? parseFloat(getComputedStyle(el).opacity) : -1; };
  const chemins = Array.from(sp.querySelectorAll(".kta-splash-galeries path"));
  const traces = chemins.filter(function (p) {
    return Math.abs(parseFloat(getComputedStyle(p).strokeDashoffset)) < 0.001;
  }).length;
  const pictos = Array.from(sp.querySelectorAll(".kta-splash-pictos image"));
  const r = sp.getBoundingClientRect();
  const dedans = Array.from(sp.querySelectorAll("#splashReseau, .kta-splash-rose, #splashBox, #splashLicense"))
    .every(function (el) {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.left >= -1 && b.top >= -1 && b.right <= r.width + 1 && b.bottom <= r.height + 1;
    });
  return {
    version: window.KtaSplash ? window.KtaSplash.version : "?",
    chemins: chemins.length,
    traces: traces,
    pictos: pictos.length,
    pictosVisibles: pictos.filter(function (i) { return op(i) > 0.99; }).length,
    rose: op(sp.querySelector(".kta-splash-rose")),
    titre: op(document.getElementById("splashBox")),
    titreTexte: (document.getElementById("splashTitle") || {}).textContent,
    ethos: !!sp.querySelector('[data-i18n="home.splash.ethos"]'),
    fond: getComputedStyle(sp).backgroundColor,
    dedans: dedans
  };
}

async function ouvrir(nav, opts) {
  const ctx = opts.ctx || await nav.newContext({
    serviceWorkers: "block",
    viewport: { width: opts.w || 390, height: opts.h || 844 },
    reducedMotion: opts.reduit ? "reduce" : "no-preference"
  });
  const p = await ctx.newPage();
  p.on("pageerror", function (e) { pb(opts.nom + " : pageerror " + String(e).slice(0, 160)); });
  p.on("console", function (m) {
    if (m.type() === "error" && !BRUIT_TOLERE.some(function (re) { return re.test(m.text()); }) &&
        !/Failed to load resource/.test(m.text())) pb(opts.nom + " : console " + m.text().slice(0, 160));
  });
  if (opts.retardMain) {
    await p.route("**/js/main.js*", async function (route) {
      await new Promise(function (r) { setTimeout(r, opts.retardMain); });
      await route.continue();
    });
  }
  if (opts.ancienneCle) {
    await p.addInitScript(function () { localStorage.setItem("myktamap_splash_jour_v1", "2026-1-1"); });
  }
  if (opts.cpu) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: opts.cpu });
  }
  await p.addInitScript(sonde, LS);
  await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  return { ctx: ctx, p: p };
}

async function attendreA(p, tMs) {
  const t = await p.evaluate(function () { return performance.now(); });
  if (tMs > t) await p.waitForTimeout(tMs - t);
}
async function attendreRetrait(p, delaiMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const s = await p.evaluate(function () { return window.__sonde; });
    if (s && s.retire !== null && s.accueil !== null) return s;
    await p.waitForTimeout(150);
  }
  return p.evaluate(function () { return window.__sonde; });
}

async function premiereOuverture(nav, nom, w, h) {
  console.log("— " + nom + " : première ouverture —");
  const { ctx, p } = await ouvrir(nav, { nom: nom, w: w, h: h });
  await attendreA(p, 1000);
  const a1 = await p.evaluate(etatSplash);
  if (a1 && a1.version === "longue") ok("version longue à la première ouverture");
  else pb("version attendue « longue », obtenue " + (a1 && a1.version));
  if (a1 && a1.traces < a1.chemins) ok("à 1 s, le réseau se dessine (" + a1.traces + "/" + a1.chemins + " tracés)");
  else pb("à 1 s, aucune animation en cours (" + JSON.stringify(a1) + ")");
  await attendreA(p, 3700);
  const fin = await p.evaluate(etatSplash);
  if (!fin) { pb("splash déjà retiré à 3,7 s (animation coupée)"); return ctx; }
  if (fin.chemins === 38 && fin.traces === 38) ok("image finale : 38/38 galeries tracées");
  else pb("image finale incomplète : " + fin.traces + "/" + fin.chemins + " galeries");
  if (fin.pictos === 6 && fin.pictosVisibles === 6) ok("6 pictos visibles"); else pb("pictos : " + fin.pictosVisibles + "/" + fin.pictos);
  if (fin.rose > 0.99) ok("rose visible"); else pb("rose opacité " + fin.rose);
  if (fin.titre > 0.99 && fin.titreTexte === "MyKTAMap") ok("titre « MyKTAMap » visible, sans suffixe");
  else pb("titre : opacité " + fin.titre + ", texte « " + fin.titreTexte + " »");
  if (!fin.ethos) ok("ligne « pas de revente… » absente"); else pb("la ligne ethos est encore dans le splash");
  if (fin.fond === "rgb(10, 13, 24)") ok("fond sombre #0a0d18"); else pb("fond " + fin.fond);
  if (fin.dedans) ok("dessin, rose, titre et licence dans l'écran"); else pb("un élément du splash sort de l'écran");
  if (process.env.SPLASH_SHOTS) await p.screenshot({ path: require("path").join(process.env.SPLASH_SHOTS, "splash-" + w + ".png") });
  const s = await attendreRetrait(p, 9000);
  if (s.accueil !== null && s.fondu !== null && s.fondu >= 3950 && s.accueil <= s.fondu) {
    ok("accueil rapide (" + s.accueil + " ms) : fondu à la fin de l'animation (" + s.fondu + " ms)");
  } else pb("accueil rapide : accueil " + s.accueil + " ms, fondu " + s.fondu + " ms (attendu ≥ 4000 et après l'accueil)");
  return ctx;
}

(async function main() {
  require("./server.js");
  await new Promise(function (r) { setTimeout(r, 300); });
  const nav = await lancerNavigateur(chromium);
  try {
    // 1. Première ouverture (téléphone, puis PC) ; 4. le contexte téléphone sert à la seconde ouverture.
    const ctxTel = await premiereOuverture(nav, "téléphone 390", 390, 844);
    const ctxPc = await premiereOuverture(nav, "PC 1280", 1280, 800);
    await ctxPc.close();

    console.log("— téléphone : seconde ouverture de suite —");
    {
      const { p } = await ouvrir(nav, { nom: "seconde", ctx: ctxTel, ancienneCle: true });
      await attendreA(p, 1000);
      const a = await p.evaluate(etatSplash);
      if (a && a.version === "longue" && a.traces < a.chemins) ok("la seconde ouverture rejoue le tracé (" + a.traces + "/38 à 1 s)");
      else pb("seconde ouverture : animation complète attendue, obtenu " + JSON.stringify(a));
      const cle = await p.evaluate(function () { return localStorage.getItem("myktamap_splash_jour_v1"); });
      if (cle === null) ok("clé de l'ancienne version courte retirée"); else pb("clé myktamap_splash_jour_v1 encore là : " + cle);
      await attendreA(p, 3700);
      const b = await p.evaluate(etatSplash);
      if (b && b.traces === 38) ok("image finale complète à 3,7 s"); else pb("seconde ouverture à 3,7 s : " + JSON.stringify(b));
      const t = await attendreRetrait(p, 8000);
      if (t.fondu !== null && t.fondu >= 3950) ok("fondu à la fin de l'animation (" + t.fondu + " ms)");
      else pb("seconde ouverture : fondu " + t.fondu + " ms (attendu ≥ 4000)");
      await p.close();
    }
    await ctxTel.close();

    // 2. Accueil lent : main.js retardé de 6 s.
    console.log("— accueil lent (main.js retardé de 6 s) —");
    {
      const { ctx, p } = await ouvrir(nav, { nom: "lent", retardMain: 6000 });
      const s = await attendreRetrait(p, 14000);
      if (s.accueil !== null && s.fondu !== null && s.fondu >= s.accueil && s.fondu - s.accueil < 600) {
        ok("le splash attend l'accueil : accueil " + s.accueil + " ms, fondu " + s.fondu + " ms");
      } else pb("accueil lent : accueil " + s.accueil + " ms, fondu " + s.fondu + " ms");
      await ctx.close();
    }

    // 3a. Clic pendant l'animation, accueil prêt.
    console.log("— clic pendant l'animation —");
    {
      const { ctx, p } = await ouvrir(nav, { nom: "clic" });
      let s = null;
      for (let i = 0; i < 40; i++) {
        s = await p.evaluate(function () { return window.__sonde; });
        if (s.accueil !== null) break;
        await p.waitForTimeout(100);
      }
      await attendreA(p, Math.max(2500, (s.accueil || 0) + 300));
      const tClic = await p.evaluate(function () { return Math.round(performance.now()); });
      if (tClic < 3900) {
        await p.mouse.click(200, 300);
        s = await attendreRetrait(p, 4000);
        if (s.fondu !== null && s.fondu - tClic < 400) ok("accueil prêt : fondu " + (s.fondu - tClic) + " ms après le clic");
        else pb("clic : fondu " + s.fondu + " ms pour un clic à " + tClic + " ms");
      } else info("accueil trop tardif (" + s.accueil + " ms) pour cliquer pendant l'animation : cas non joué");
      await ctx.close();
    }
    // 3b. Clic et Échap, accueil pas prêt.
    for (const geste of ["clic", "Échap"]) {
      console.log("— " + geste + " avant l'accueil (main.js retardé de 5 s) —");
      const { ctx, p } = await ouvrir(nav, { nom: geste + "-lent", retardMain: 5000 });
      await attendreA(p, 900);
      if (geste === "clic") await p.mouse.click(200, 300); else await p.keyboard.press("Escape");
      await p.waitForTimeout(150);
      const a = await p.evaluate(etatSplash);
      if (a && a.traces === 38 && a.rose > 0.99 && a.titre > 0.99) ok("image finale aussitôt");
      else pb(geste + " : image finale attendue, obtenu " + JSON.stringify(a));
      const s = await attendreRetrait(p, 14000);
      if (s.accueil !== null && s.fondu !== null && s.fondu >= s.accueil) ok("puis attente de l'accueil (" + s.accueil + " → fondu " + s.fondu + " ms)");
      else pb(geste + " : accueil " + s.accueil + " ms, fondu " + s.fondu + " ms");
      await ctx.close();
    }

    // 5. Plafond : main.js retardé de 15 s.
    console.log("— plafond de sécurité (main.js retardé de 15 s) —");
    {
      const { ctx, p } = await ouvrir(nav, { nom: "plafond", retardMain: 15000 });
      const s = await attendreRetrait(p, 24000);
      if (s.fondu !== null && s.fondu >= 11900 && s.fondu <= 12600) ok("fondu au plafond (" + s.fondu + " ms)");
      else pb("plafond : fondu " + s.fondu + " ms");
      if (s.accueil !== null) ok("l'accueil s'affiche ensuite (" + s.accueil + " ms)"); else pb("accueil jamais affiché après le plafond");
      await ctx.close();
    }

    // 6. Mouvement réduit.
    console.log("— mouvement réduit —");
    {
      const { ctx, p } = await ouvrir(nav, { nom: "réduit", reduit: true });
      await attendreA(p, 500);
      const a = await p.evaluate(etatSplash);
      if (a && a.version === "reduite" && a.traces === 38 && a.rose > 0.99 && a.titre > 0.99) ok("image finale directe");
      else pb("mouvement réduit : " + JSON.stringify(a));
      const s = await attendreRetrait(p, 8000);
      if (s.fondu !== null && s.fondu - s.accueil < 600) ok("fondu dès l'accueil (" + s.accueil + " → " + s.fondu + " ms)");
      else pb("mouvement réduit : accueil " + s.accueil + " ms, fondu " + s.fondu + " ms");
      await ctx.close();
    }

    // 7. Coût au démarrage, processeur ×4 (informatif : comparer avant / après une modification du splash).
    console.log("— coût au démarrage, processeur ×4 (3 essais) —");
    for (let i = 0; i < 3; i++) {
      const { ctx, p } = await ouvrir(nav, { nom: "cpu4", cpu: 4 });
      const s = await attendreRetrait(p, 25000);
      info("accueil " + s.accueil + " ms · fondu " + s.fondu + " ms · tâches longues " + s.longues +
           " (" + Math.round(s.longuesMs) + " ms)");
      await ctx.close();
    }
  } catch (e) {
    pb("exception : " + (e && e.stack || e));
  }
  await nav.close();
  console.log(problemes.length ? "\n⛔ " + problemes.length + " problème(s)" : "\n✅ checkup-splash : tout est vert");
  process.exit(problemes.length ? 1 : 0);
})();
