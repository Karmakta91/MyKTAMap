#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-splash.js — checkup ciblé (marche 3 du RELEASE_GATE), non branché au pre-commit
// =====================================================================
// Splash de démarrage (js/ktaSplash.js, js/ktaSplashWorker.js, main.js > _splashEnd), téléphone 390×844 (densité
// 3) et PC 1280×800 :
//   1. première ouverture : galeries dessinées par le worker (canvas), le SVG des galeries masqué (pas de double
//      trait), tracé en cours 1 s après le démarrage de la scène, image finale complète (pixels du canvas comparés
//      à l'image finale du SVG, 6 pictos, rose, titre), canvas en pleine densité, fondu à la fin de l'animation ;
//   2. replis : sans OffscreenCanvas, worker introuvable, worker muet (300 ms), worker tombé en route : SVG animé,
//      pas de canvas, image finale complète ;
//   3. tâche longue de 500 ms sur le fil principal pendant le tracé (normal et processeur ×4) : le worker continue
//      de produire des images (instants envoyés par le worker) ;
//   4. rotation du téléphone après le tracé : le canvas se redessine au nouveau format ;
//   5. accueil lent : le splash attend que #planLoaderOverlay soit affiché ;
//   6. clic pendant l'animation, accueil prêt : fondu aussitôt ; accueil pas prêt (et Échap) : image finale,
//      puis attente de l'accueil ;
//   7. deux ouvertures de suite : la seconde rejoue l'animation complète, la clé d'une ancienne version courte
//      est retirée ; 8. plafond à 12 s ; 9. mouvement réduit : image finale directe (SVG) ;
//   10. coût au démarrage, processeur ralenti ×4 : affichage de l'accueil et tâches longues (informatif).
// 🩸 Les instants viennent d'une sonde posée AVANT le chargement (addInitScript, performance.now() = depuis
//    le début de la navigation) : mesurer depuis le harnais ajouterait le temps du protocole.
// 🩸 Un canvas transféré au worker ne se relit pas depuis la page : on compare des captures d'écran de la scène
//    (pixels gris des galeries) à l'image finale du SVG (mouvement réduit), dans une page d'analyse à part.
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
// Image finale : part des pixels gris de la référence retrouvés (à 1 px près) et part de gris en trop.
const COUVERTURE_MIN = 0.95;
const SURPLUS_MAX = 0.05;

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function info(m) { console.log("  ℹ️  " + m); }
function pc(x) { return Math.round(x * 1000) / 10 + " %"; }

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

// État visible du splash : mode des galeries, chemins SVG tracés / en cours, pictos, rose, titre.
function etatSplash() {
  const sp = document.getElementById("splashOverlay");
  if (!sp) return null;
  const op = function (el) { return el ? parseFloat(getComputedStyle(el).opacity) : -1; };
  const chemins = Array.from(sp.querySelectorAll(".kta-splash-galeries path"));
  const offs = chemins.map(function (p) { return Math.abs(parseFloat(getComputedStyle(p).strokeDashoffset)); });
  const pictos = Array.from(sp.querySelectorAll(".kta-splash-pictos image"));
  const r = sp.getBoundingClientRect();
  const dedans = Array.from(sp.querySelectorAll("#splashReseau, .kta-splash-rose, #splashBox, #splashLicense"))
    .every(function (el) {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.left >= -1 && b.top >= -1 && b.right <= r.width + 1 && b.bottom <= r.height + 1;
    });
  const tr = window.KtaSplash && window.KtaSplash.trace ? window.KtaSplash.trace() : {};
  const cv = document.getElementById("splashReseauCanvas");
  return {
    version: window.KtaSplash ? window.KtaSplash.version : "?",
    mode: tr.mode,
    motif: tr.motif,
    canvas: !!cv,
    canvasCss: cv ? [cv.getBoundingClientRect().width, cv.getBoundingClientRect().height] : null,
    galeriesSvg: getComputedStyle(sp.querySelector(".kta-splash-galeries")).display !== "none",
    chemins: chemins.length,
    traces: offs.filter(function (o) { return o < 0.001; }).length,
    enCours: offs.filter(function (o) { return o >= 0.001 && o < 1; }).length,
    pictos: pictos.length,
    pictosVisibles: pictos.filter(function (i) { return op(i) > 0.99; }).length,
    rose: op(sp.querySelector(".kta-splash-rose")),
    titre: op(document.getElementById("splashBox")),
    licence: op(document.getElementById("splashLicense")),
    titreTexte: (document.getElementById("splashTitle") || {}).textContent,
    ethos: !!sp.querySelector('[data-i18n="home.splash.ethos"]'),
    fond: getComputedStyle(sp).backgroundColor,
    dedans: dedans
  };
}

// ── Pixels : page d'analyse sans CSP, captures de la scène décodées dans un canvas ──
let _analyse = null;
async function analyser(png, refPng) {
  return _analyse.evaluate(async function (a) {
    async function lire(b64) {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, c.width, c.height);
    }
    // Gris clair des galeries (#c8d0e0 à 0,8 sur #0a0d18) : canaux proches et hauts ; ni eau, ni pictos, ni rose.
    function masque(d) {
      const m = new Uint8Array(d.width * d.height);
      let n = 0;
      for (let i = 0; i < m.length; i++) {
        const r = d.data[4 * i], g = d.data[4 * i + 1], b = d.data[4 * i + 2];
        const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
        if (mn > 110 && mx - mn < 40) { m[i] = 1; n++; }
      }
      return { m: m, n: n, w: d.width, h: d.height };
    }
    function voisin(M, x, y) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < M.w && yy < M.h && M.m[yy * M.w + xx]) return true;
      }
      return false;
    }
    const A = masque(await lire(a.img));
    if (!a.ref) return { gris: A.n };
    const B = masque(await lire(a.ref));
    if (A.w !== B.w || A.h !== B.h) return { gris: A.n, grisRef: B.n, erreur: "tailles " + A.w + "×" + A.h + " / " + B.w + "×" + B.h };
    let couverts = 0, surplus = 0;
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
      if (B.m[y * B.w + x] && voisin(A, x, y)) couverts++;
      if (A.m[y * A.w + x] && !voisin(B, x, y)) surplus++;
    }
    return { gris: A.n, grisRef: B.n, couverture: B.n ? couverts / B.n : 0, surplus: A.n ? surplus / A.n : 1 };
  }, { img: png.toString("base64"), ref: refPng ? refPng.toString("base64") : null });
}
async function captureScene(p) {
  const b = await p.evaluate(function () {
    const s = document.querySelector(".kta-splash-scene");
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  return b ? p.screenshot({ clip: b }) : null;
}

// Référence : image finale du SVG (mouvement réduit, aucun worker), par format et densité.
const _refs = {};
async function reference(nav, w, h, dpr) {
  const cle = w + "x" + h + "@" + dpr;
  if (_refs[cle]) return _refs[cle];
  const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: w, height: h },
    deviceScaleFactor: dpr, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  // Accueil retenu : en mouvement réduit le splash se fermerait dès l'accueil prêt, avant la capture. 🩸 main.js
  //    est synchrone : on n'attend pas domcontentloaded, qui attendrait la fin du retard.
  await p.route("**/js/main.js*", async function (route) {
    await new Promise(function (r) { setTimeout(r, 6000); });
    await route.continue();
  });
  await p.addInitScript(sonde, LS);
  await p.goto(BASE + "/index.html", { waitUntil: "commit" });
  await p.waitForFunction(function () {
    return window.KtaSplash && Array.from(document.querySelectorAll("#splashReperes image"))
      .every(function (i) { return i.getBBox().width > 0; });
  });
  await p.waitForTimeout(500);
  _refs[cle] = await captureScene(p);
  await ctx.close();
  return _refs[cle];
}

// Image finale complète des galeries : pixels comparés à la référence, quel que soit le mode.
async function verifierFinale(nav, p, w, h, dpr, quoi) {
  const img = await captureScene(p);
  if (!img) { pb(quoi + " : splash absent"); return; }
  const a = await analyser(img, await reference(nav, w, h, dpr));
  if (a.erreur) { pb(quoi + " : " + a.erreur); return; }
  if (a.couverture >= COUVERTURE_MIN && a.surplus <= SURPLUS_MAX) {
    ok(quoi + " : image finale des galeries complète (couverture " + pc(a.couverture) + ", surplus " +
       pc(a.surplus) + ", " + a.gris + " px)");
  } else pb(quoi + " : galeries incomplètes (couverture " + pc(a.couverture) + ", surplus " + pc(a.surplus) + ")");
}

function verifierMode(e, attendu, quoi) {
  if (!e) { pb(quoi + " : splash absent"); return; }
  const motif = e.motif ? " (" + e.motif + ")" : "";
  if (e.mode !== attendu) { pb(quoi + " : galeries en " + e.mode + motif + ", attendu " + attendu); return; }
  if (attendu === "canvas" && e.canvas && !e.galeriesSvg) ok(quoi + " : galeries dans le canvas du worker, SVG masqué");
  else if (attendu === "svg" && !e.canvas && e.galeriesSvg) ok(quoi + " : galeries en SVG" + motif + ", pas de canvas");
  else pb(quoi + " : affichage en double ou vide (canvas " + e.canvas + ", SVG " + e.galeriesSvg + ")");
}

async function ouvrir(nav, opts) {
  const ctx = opts.ctx || await nav.newContext({
    serviceWorkers: "block",
    viewport: { width: opts.w || 390, height: opts.h || 844 },
    deviceScaleFactor: opts.dpr || 1,
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
  if (opts.worker) {
    await p.route("**/js/ktaSplashWorker.js*", function (route) {
      if (opts.worker === "404") return route.fulfill({ status: 404, body: "absent" });
      return route.fulfill({ status: 200, contentType: "text/javascript", body: opts.worker });
    });
  }
  if (opts.sansOffscreen) {
    await p.addInitScript(function () { delete HTMLCanvasElement.prototype.transferControlToOffscreen; });
  }
  if (opts.ancienneCle) {
    await p.addInitScript(function () { localStorage.setItem("myktamap_splash_jour_v1", "2026-1-1"); });
  }
  if (opts.cpu) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: opts.cpu });
  }
  await p.addInitScript(sonde, LS);
  // 🩸 main.js retardé : domcontentloaded attendrait la fin du retard (script synchrone), le geste « avant
  //    l'accueil » partirait accueil prêt.
  await p.goto(BASE + "/index.html", { waitUntil: opts.retardMain ? "commit" : "domcontentloaded" });
  if (opts.retardMain) await p.waitForFunction(function () { return !!window.KtaSplash; });
  return { ctx: ctx, p: p };
}

async function attendreA(p, tMs) {
  const t = await p.evaluate(function () { return performance.now(); });
  if (tMs > t) await p.waitForTimeout(tMs - t);
}
// La scène démarre une fois les scripts exécutés (KtaSplash.debut()) : les instants du tracé se comptent de là.
async function attendreApresDebut(p, ms) {
  const fin = Date.now() + 5000;
  let d = null;
  while (d === null && Date.now() < fin) {
    d = await p.evaluate(function () { return window.KtaSplash && window.KtaSplash.debut ? window.KtaSplash.debut() : null; });
    if (d === null) await p.waitForTimeout(50);
  }
  await attendreA(p, (d || 0) + ms);
  return d;
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
async function attendreBilan(p, delaiMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const b = await p.evaluate(function () { return window.KtaSplash.trace().bilan; });
    if (b) return b;
    await p.waitForTimeout(100);
  }
  return null;
}

// Tracé en cours 1 s après le démarrage : canvas = moins de gris que l'image finale ; SVG = chemins animés.
async function verifierEnCours(nav, p, w, h, dpr, e, quoi) {
  if (e.mode === "canvas") {
    const a = await analyser(await captureScene(p), null);
    const ref = await analyser(await reference(nav, w, h, dpr), null);
    if (a.gris > 0 && a.gris < 0.8 * ref.gris) ok(quoi + " : 1 s après le démarrage, le réseau se dessine (" + a.gris + " / " + ref.gris + " px)");
    else pb(quoi + " : 1 s après le démarrage, " + a.gris + " px de galeries pour " + ref.gris + " à la fin");
  } else if (e.enCours > 0) ok(quoi + " : 1 s après le démarrage, " + e.enCours + " chemins SVG en cours de tracé");
  else pb(quoi + " : 1 s après le démarrage, aucun chemin SVG en cours (" + e.traces + " tracés)");
}

async function premiereOuverture(nav, nom, w, h, dpr) {
  console.log("— " + nom + " : première ouverture —");
  const { ctx, p } = await ouvrir(nav, { nom: nom, w: w, h: h, dpr: dpr });
  await attendreA(p, 400);
  const a0 = await p.evaluate(etatSplash);
  if (a0 && a0.version === "longue") ok("version longue à la première ouverture");
  else pb("version attendue « longue », obtenue " + (a0 && a0.version));
  const debut = await attendreApresDebut(p, 1000);
  if (debut !== null && debut <= 2500) ok("scène démarrée accueil prêt (" + debut + " ms, au plus tard 2,5 s)");
  else pb("démarrage de la scène : " + debut + " ms (attendu ≤ 2500)");
  const a1 = await p.evaluate(etatSplash);
  verifierMode(a1, "canvas", "à 1 s");
  // 🩸 La licence arrive avec le titre (scène), pas avec les coins : sur le pro, elle restait seule à l'écran.
  if (a1 && a1.licence < 0.05) ok("licence pas encore affichée 1 s après le démarrage (arrive avec le titre)");
  else pb("licence déjà visible 1 s après le démarrage (opacité " + (a1 && a1.licence) + ")");
  if (a1) await verifierEnCours(nav, p, w, h, dpr, a1, "worker");
  await attendreApresDebut(p, 3700);
  const fin = await p.evaluate(etatSplash);
  if (!fin) { pb("splash déjà retiré à 3,7 s (animation coupée)"); return ctx; }
  verifierMode(fin, "canvas", "image finale");
  await verifierFinale(nav, p, w, h, dpr, "worker");
  const bilan = await p.evaluate(function () { return window.KtaSplash.trace().bilan; });
  if (bilan && fin.canvasCss && Math.abs(bilan.pixels[0] - Math.round(fin.canvasCss[0] * dpr)) <= 1 &&
      Math.abs(bilan.pixels[1] - Math.round(fin.canvasCss[1] * dpr)) <= 1) {
    ok("canvas en densité " + dpr + " : " + bilan.pixels.join("×") + " px pour " +
       fin.canvasCss.map(Math.round).join("×") + " CSS · " + bilan.images.length + " images produites");
  } else pb("taille du canvas : " + JSON.stringify(bilan && bilan.pixels) + " pour " + JSON.stringify(fin.canvasCss) + " × " + dpr);
  if (fin.pictos === 6 && fin.pictosVisibles === 6) ok("6 pictos visibles"); else pb("pictos : " + fin.pictosVisibles + "/" + fin.pictos);
  if (fin.rose > 0.99) ok("rose visible"); else pb("rose opacité " + fin.rose);
  if (fin.licence > 0.99) ok("licence visible à la fin"); else pb("licence opacité " + fin.licence + " à la fin");
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

// Worker qui répond puis tombe 800 ms après le démarrage de la scène.
const WORKER_TOMBE = "self.onmessage = function (e) {" +
  " if (e.data.type === 'init') self.postMessage({ type: 'pret' });" +
  " if (e.data.type === 'go') setTimeout(function () { self.postMessage({ type: 'echec', motif: 'essai' }); }, 800); };";

async function repli(nav, nom, opts, motifAttendu) {
  console.log("— repli : " + nom + " —");
  const { ctx, p } = await ouvrir(nav, Object.assign({ nom: "repli " + nom, dpr: 2 }, opts));
  await attendreApresDebut(p, opts.worker === WORKER_TOMBE ? 1300 : 1000);
  const a = await p.evaluate(etatSplash);
  verifierMode(a, "svg", nom);
  if (a && !motifAttendu.test(a.motif || "")) pb(nom + " : motif « " + a.motif + " », attendu " + motifAttendu);
  if (a) await verifierEnCours(nav, p, 390, 844, 2, a, nom);
  if (a && opts.worker === WORKER_TOMBE) {
    // Le SVG reprend où le tracé en était : le premier chemin (1,68 s) est presque fini, pas reparti de zéro.
    const off0 = await p.evaluate(function () {
      return parseFloat(getComputedStyle(document.querySelector(".kta-splash-galeries path")).strokeDashoffset);
    });
    if (off0 < 0.3) ok(nom + " : le SVG reprend le tracé en cours (1er chemin, reste " + off0.toFixed(2) + ")");
    else pb(nom + " : le SVG a repris le tracé depuis le début (1er chemin, reste " + off0.toFixed(2) + ")");
  }
  await attendreApresDebut(p, 3700);
  await verifierFinale(nav, p, 390, 844, 2, nom);
  await ctx.close();
}

// Tâche longue de 500 ms sur le fil principal pendant le tracé : images du worker dans la fenêtre.
async function tacheLongue(nav, cpu) {
  console.log("— tâche longue de 500 ms pendant le tracé" + (cpu ? ", processeur ×" + cpu : "") + " —");
  const { ctx, p } = await ouvrir(nav, { nom: "tâche longue", dpr: 3, cpu: cpu });
  await attendreApresDebut(p, 700);
  const fen = await p.evaluate(function () {
    const t0 = performance.timeOrigin + performance.now();
    const fin = performance.now() + 500;
    let n = 0;
    while (performance.now() < fin) n++;
    return { t0: t0, t1: performance.timeOrigin + performance.now(), mode: window.KtaSplash.trace().mode };
  });
  if (fen.mode !== "canvas") { pb("tâche longue : galeries en " + fen.mode); await ctx.close(); return; }
  const b = await attendreBilan(p, 8000);
  if (!b) { pb("tâche longue : pas de bilan du worker"); await ctx.close(); return; }
  const dans = b.images.filter(function (t) { return t >= fen.t0 && t <= fen.t1; });
  const autour = b.images.filter(function (t) { return t >= fen.t0 - 100 && t <= fen.t1 + 100; });
  let ecart = 0;
  for (let i = 1; i < autour.length; i++) ecart = Math.max(ecart, autour[i] - autour[i - 1]);
  const msg = dans.length + " images du worker pendant les " + Math.round(fen.t1 - fen.t0) +
    " ms de blocage, plus grand écart " + Math.round(ecart) + " ms (" + b.images.length + " images au total)";
  if (dans.length >= 20 && ecart < 50) ok(msg); else pb(msg + " — attendu ≥ 20 images, écart < 50 ms");
  await attendreApresDebut(p, 3700);
  await verifierFinale(nav, p, 390, 844, 3, "après la tâche longue");
  await ctx.close();
}

(async function main() {
  require("./server.js");
  await new Promise(function (r) { setTimeout(r, 300); });
  const nav = await lancerNavigateur(chromium);
  _analyse = await (await nav.newContext()).newPage();
  try {
    // Références d'abord : les préparer pendant un tracé décalerait les instants mesurés.
    for (const r of [[390, 844, 3], [1280, 800, 1], [390, 844, 2], [844, 390, 3], [390, 844, 1]]) {
      await reference(nav, r[0], r[1], r[2]);
    }
    // 1. Première ouverture (téléphone densité 3, puis PC) ; le contexte téléphone sert à la seconde ouverture.
    const ctxTel = await premiereOuverture(nav, "téléphone 390", 390, 844, 3);
    const ctxPc = await premiereOuverture(nav, "PC 1280", 1280, 800, 1);
    await ctxPc.close();

    // 2. Replis.
    await repli(nav, "sans OffscreenCanvas", { sansOffscreen: true }, /indisponible/);
    await repli(nav, "worker introuvable", { worker: "404" }, /erreur/);
    await repli(nav, "worker muet", { worker: "self.onmessage = function () {};" }, /pas de réponse/);
    await repli(nav, "worker tombé en route", { worker: WORKER_TOMBE }, /essai/);

    // 3. Tâche longue, normal puis processeur ×4.
    await tacheLongue(nav, 0);
    await tacheLongue(nav, 4);

    // 4. Rotation du téléphone après le tracé.
    console.log("— rotation du téléphone après le tracé —");
    {
      // Accueil retenu : sans lui, le fondu (4 s après le démarrage) tomberait pendant la capture.
      const { ctx, p } = await ouvrir(nav, { nom: "rotation", dpr: 3, retardMain: 9000 });
      await attendreApresDebut(p, 3700);
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(400);
      const e = await p.evaluate(etatSplash);
      verifierMode(e, "canvas", "couché");
      await verifierFinale(nav, p, 844, 390, 3, "couché");
      await ctx.close();
    }

    console.log("— téléphone : seconde ouverture de suite —");
    {
      const { p } = await ouvrir(nav, { nom: "seconde", ctx: ctxTel, ancienneCle: true });
      const cle = await p.evaluate(function () { return localStorage.getItem("myktamap_splash_jour_v1"); });
      if (cle === null) ok("clé de l'ancienne version courte retirée"); else pb("clé myktamap_splash_jour_v1 encore là : " + cle);
      await attendreApresDebut(p, 1000);
      const a = await p.evaluate(etatSplash);
      if (a && a.version === "longue") await verifierEnCours(nav, p, 390, 844, 3, a, "seconde ouverture");
      else pb("seconde ouverture : version " + (a && a.version));
      await attendreApresDebut(p, 3700);
      await verifierFinale(nav, p, 390, 844, 3, "seconde ouverture");
      const t = await attendreRetrait(p, 8000);
      if (t.fondu !== null && t.fondu >= 3950) ok("fondu à la fin de l'animation (" + t.fondu + " ms)");
      else pb("seconde ouverture : fondu " + t.fondu + " ms (attendu ≥ 4000)");
      await p.close();
    }
    await ctxTel.close();

    // 5. Accueil lent : main.js retardé de 6 s.
    console.log("— accueil lent (main.js retardé de 6 s) —");
    {
      const { ctx, p } = await ouvrir(nav, { nom: "lent", retardMain: 6000 });
      const s = await attendreRetrait(p, 14000);
      if (s.accueil !== null && s.fondu !== null && s.fondu >= s.accueil && s.fondu - s.accueil < 600) {
        ok("le splash attend l'accueil : accueil " + s.accueil + " ms, fondu " + s.fondu + " ms");
      } else pb("accueil lent : accueil " + s.accueil + " ms, fondu " + s.fondu + " ms");
      await ctx.close();
    }

    // 6a. Clic pendant l'animation, accueil prêt.
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
    // 6b. Clic et Échap, accueil pas prêt.
    for (const geste of ["clic", "Échap"]) {
      console.log("— " + geste + " avant l'accueil (main.js retardé de 5 s) —");
      const { ctx, p } = await ouvrir(nav, { nom: geste + "-lent", retardMain: 5000 });
      await attendreA(p, 900);
      if (geste === "clic") await p.mouse.click(200, 300); else await p.keyboard.press("Escape");
      await p.waitForTimeout(150);
      const a = await p.evaluate(etatSplash);
      if (a && a.rose > 0.99 && a.titre > 0.99) ok("rose et titre aussitôt (galeries en " + a.mode + ")");
      else pb(geste + " : image finale attendue, obtenu " + JSON.stringify(a));
      await verifierFinale(nav, p, 390, 844, 1, geste);
      const s = await attendreRetrait(p, 14000);
      if (s.accueil !== null && s.fondu !== null && s.fondu >= s.accueil) ok("puis attente de l'accueil (" + s.accueil + " → fondu " + s.fondu + " ms)");
      else pb(geste + " : accueil " + s.accueil + " ms, fondu " + s.fondu + " ms");
      await ctx.close();
    }

    // 8. Plafond : main.js retardé de 15 s.
    console.log("— plafond de sécurité (main.js retardé de 15 s) —");
    {
      const { ctx, p } = await ouvrir(nav, { nom: "plafond", retardMain: 15000 });
      const s = await attendreRetrait(p, 24000);
      if (s.fondu !== null && s.fondu >= 11900 && s.fondu <= 12600) ok("fondu au plafond (" + s.fondu + " ms)");
      else pb("plafond : fondu " + s.fondu + " ms");
      if (s.accueil !== null) ok("l'accueil s'affiche ensuite (" + s.accueil + " ms)"); else pb("accueil jamais affiché après le plafond");
      await ctx.close();
    }

    // 9. Mouvement réduit.
    console.log("— mouvement réduit —");
    {
      const { ctx, p } = await ouvrir(nav, { nom: "réduit", reduit: true });
      await attendreA(p, 500);
      const a = await p.evaluate(etatSplash);
      if (a && a.version === "reduite" && a.traces === 38 && a.rose > 0.99 && a.titre > 0.99) ok("image finale directe");
      else pb("mouvement réduit : " + JSON.stringify(a));
      verifierMode(a, "svg", "mouvement réduit");
      const s = await attendreRetrait(p, 8000);
      if (s.fondu !== null && s.fondu - s.accueil < 600) ok("fondu dès l'accueil (" + s.accueil + " → " + s.fondu + " ms)");
      else pb("mouvement réduit : accueil " + s.accueil + " ms, fondu " + s.fondu + " ms");
      await ctx.close();
    }

    // 10. Coût au démarrage, processeur ×4 (informatif : comparer avant / après une modification du splash).
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
