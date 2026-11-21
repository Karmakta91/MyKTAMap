#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-detection-emprise.js — checkup (Playwright, pas un hook pré-commit) : emprise lue par « Détecter » quand le
// calque image du niveau actif déborde de l'image du plan (js/detectionStructures.js > contextePlan, emprise ;
// js/ktaDetection.js > detecter, limites { x0, y0, x1, y1 })
// =====================================================================
// Le relevé fictif est rechargé en ZIP fabriqué en mémoire (jamais dans data/), multi-niveau, avec UN calque image
// « de-m1 » au niveau −1, calé, plus grand que l'image du plan : il déborde de MARGE px plan à gauche, en haut, à
// droite et en bas. Le calque, dessiné dans la page, est blanc avec sept piliers rouges cernés de noir : un dans
// chaque coin du débord (hors de l'image du plan), un au centre, un à cheval sur le bord bas de l'image (y = hauteur)
// et un à cheval sur son bord droit (x = largeur). Par moteur :
//   E1 niveau −1, « Remplir au clic » sur le pilier du débord haut-gauche puis bas-droite : zones acceptées ;
//      « Valider » → 2 structures « mur » au niveau −1, contour posé sur le pilier (coordonnées négatives et au-delà
//      de l'image comprises) ;
//   E2 niveau −1, « Tout le plan » : région = emprise du calque entier, 7 piliers trouvés (dont les 4 du débord) ;
//      « Valider » : les deux piliers à cheval sur le bord de l'image sortent ENTIERS (aucun côté rogné sur la ligne
//      y = hauteur ni x = largeur : le bord de l'image n'est pas le bord du plan au niveau −1) ;
//   E3 niveau 0 inchangé : « Remplir » hors de l'image refusé (« hors image »), « Tout le plan » = l'image du plan ;
//      aucune erreur de page.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8171 node scripts/smoke/checkup-detection-emprise.js
// Doc : docs/architecture/plans-loader.md (Détecter les structures)
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const ROUGE = [220, 40, 40];
// Géométrie en px plan : débord du calque autour de l'image, pilier (intérieur) et épaisseur du trait noir.
const GEO = { marge: 300, pw: 60, ph: 40, ep: 6, retrait: 80 };

let MOTEUR = "";
const problemes = [];
function pb(msg) { problemes.push("[" + MOTEUR + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Outils posés dans la page (lus au moment de l'appel : l'app est chargée).
function outilsPage() {
  window.__de = {
    fabriquer: async function (o) {
      const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
      if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
      const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
      const W = cfg.plan.imageWidth, H = cfg.plan.imageHeight, M = o.geo.marge, G = o.geo;
      // Emprise du calque en px plan : [-M, W + M] × [-M, H + M] ; k px plan par px de calque (≤ 2 048 px de côté).
      const k = Math.max(1, Math.ceil((Math.max(W, H) + 2 * M) / 2048));
      const cw = Math.round((W + 2 * M) / k), ch = Math.round((H + 2 * M) / k);
      const piliers = [
        { nom: "haut-gauche", x: -M + G.retrait, y: -M + G.retrait },
        { nom: "haut-droite", x: W + M - G.retrait - G.pw, y: -M + G.retrait },
        { nom: "bas-gauche", x: -M + G.retrait, y: H + M - G.retrait - G.ph },
        { nom: "bas-droite", x: W + M - G.retrait - G.pw, y: H + M - G.retrait - G.ph },
        { nom: "centre", x: Math.round(W / 2), y: Math.round(H / 2) },
        { nom: "bord-bas", x: Math.round(W * 0.3), y: H - G.ph / 2 },
        { nom: "bord-droit", x: W - G.pw / 2, y: Math.round(H * 0.3) }
      ];
      const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
      const g = cv.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, cw, ch);
      const u = function (x) { return (x + M) / k; };
      piliers.forEach(function (p) {
        g.fillStyle = "#141414";
        g.fillRect(u(p.x - G.ep), u(p.y - G.ep), (G.pw + 2 * G.ep) / k, (G.ph + 2 * G.ep) / k);
        g.fillStyle = "rgb(" + o.rouge.join(",") + ")";
        g.fillRect(u(p.x), u(p.y), G.pw / k, G.ph / k);
      });
      const png = await new Promise(function (r) { cv.toBlob(r, "image/png"); });
      cfg.imageLayers = [{ id: "de-m1", label: "Calque essai emprise", file: "calques/de-m1.png", level: -1,
        visible: true, order: 1,
        calibration: { sourceA: { sx: 0, sy: 0 }, targetA: { x: -M, y: -M },
                       sourceB: { sx: 100, sy: 0 }, targetB: { x: -M + 100 * k, y: -M } } }];
      cfg.plan.multiLevel = true;
      cfg.plan.name = "Essai detection emprise";
      const zip = new JSZip();
      zip.file("calques/de-m1.png", png);
      const chemins = [cfg.plan.baseImage]
        .concat((cfg.dataLayers || []).map(function (l) { return l.file; }))
        .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
      for (const p of Array.from(new Set(chemins))) {
        const r = await fetch(window.resolveServerPath(p, srv.path));
        if (r.ok) zip.file(p, await r.blob());
      }
      zip.file("plan-config.json", JSON.stringify(cfg));
      const blob = await zip.generateAsync({ type: "blob" });
      window.__deInfo = { W: W, H: H, k: k, piliers: piliers };
      window.__deFini = false;
      window.chargerZipFichier(new File([blob], "detection-emprise.zip", { type: "application/zip" }), "auto",
        { storeBlob: true }).then(function () { window.__deFini = true; }, function () { window.__deFini = true; });
      return { ok: true, info: window.__deInfo };
    },
    // Toasts émis et appels à KtaDetection.detecter (région, limites).
    espions: function () {
      window.__deToasts = [];
      window.__deAppels = [];
      const G = window.OOMGuard, orig = G.showToast;
      G.showToast = function (msg, type) { window.__deToasts.push({ msg: String(msg), type: type }); return orig.apply(G, arguments); };
      const D = window.KtaDetection, det = D.detecter;
      D.detecter = function (opts) {
        window.__deAppels.push({ region: Object.assign({}, opts.region), limites: Object.assign({}, opts.limites || {}),
                                 echelle: opts.echelle });
        return det.apply(D, arguments);
      };
      window.ktaConfirm = function () { return Promise.resolve(true); };   // « Tout le plan » d'une grande image
    }
  };
}

async function demarrer(page) {
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerZipFichier === "function" && typeof JSZip !== "undefined";
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

async function attendreCalque(page) {
  await attendre(page, function () {
    return window.__deFini !== false && !!window.map && !!window.PLAN_CONFIG && !!window.KtaDetectionUI &&
      Array.isArray(window._ktaImageOverlays) && window._ktaImageOverlays.length === 1 &&
      window._ktaImageOverlays.every(function (e) { return e.overlay && (e.overlay._image || e.overlay._rawImage); });
  }, 90000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

// Centre la carte sur le point plan (x, y) puis le touche.
async function toucher(page, x, y) {
  const pt = await page.evaluate(function (a) {
    window.map.setView(window.convertCoord(a.x, a.y), 0, { animate: false });
    const r = window.map.getContainer().getBoundingClientRect();
    const c = window.map.latLngToContainerPoint(window.convertCoord(a.x, a.y));
    return { x: r.left + c.x, y: r.top + c.y };
  }, { x: x, y: y });
  await page.waitForTimeout(200);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(150);
  await attendre(page, function () {
    const e = window.KtaDetectionUI.etat();
    return !e || !e.remplir || !e.remplir.enCours;
  }, 30000);
  await page.waitForTimeout(100);
}
async function bouton(page, act) {
  await page.click('#kta-detect-bandeau [data-detect="' + act + '"]');
  await page.waitForTimeout(200);
}
function etat(page) { return page.evaluate(function () { return window.KtaDetectionUI.etat(); }); }
function centre(p) { return { x: p.x + GEO.pw / 2, y: p.y + GEO.ph / 2 }; }
function boite(pts) {
  const xs = pts.map(function (q) { return q.x; }), ys = pts.map(function (q) { return q.y; });
  return { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs),
           y1: Math.max.apply(null, ys) };
}
// Contour posé sur le pilier : chaque côté entre l'intérieur et le milieu du trait, à `tol` px près (le calque est
// agrandi k fois et lissé : le trait n'y a pas de milieu net ; c'est la position qui est vérifiée, pas le moteur).
function surLePilier(b, p, tol) {
  const d = GEO.ep / 2, entre = function (v, a, z) { return v >= Math.min(a, z) - tol && v <= Math.max(a, z) + tol; };
  return entre(b.x0, p.x, p.x - d) && entre(b.y0, p.y, p.y - d) &&
    entre(b.x1, p.x + GEO.pw, p.x + GEO.pw + d) && entre(b.y1, p.y + GEO.ph, p.y + GEO.ph + d);
}

// « Tout le plan » avec l'exemple rouge retenu ; rend l'état et le dernier appel à detecter.
async function toutLePlan(page) {
  await page.evaluate(function (rouge) {
    localStorage.setItem(window.KtaDetectionUI.PREFIXE + window._currentLoadedPlanId,
      JSON.stringify({ a: [{ rgb: rouge }], b: [], f: [] }));
    window.__deToasts.length = 0;
    window.__deAppels.length = 0;
    window.KtaDetectionUI.ouvrir();
  }, ROUGE);
  await page.waitForTimeout(300);
  await bouton(page, "zone");
  await bouton(page, "tout");
  try {
    await attendre(page, function () {
      const e = window.KtaDetectionUI.etat();
      return !e || e.etape === "zone" || e.etape === "apercu";
    }, 240000);
  } catch (e) { /* état rendu tel quel */ }
  return page.evaluate(function () {
    return { etat: window.KtaDetectionUI.etat(), toasts: window.__deToasts.slice(),
             appel: window.__deAppels[window.__deAppels.length - 1] || null };
  });
}

async function scenario(nav) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  if (process.env.KTA_DEBUG) page.on("console", function (m) { console.log("     [page] " + m.text().slice(0, 200)); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  await page.addInitScript(outilsPage);
  await page.route(/tile\.openstreetmap\.org\//, function (route) { route.abort(); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await demarrer(page);
    const r = await page.evaluate(function (o) { return window.__de.fabriquer(o); }, { geo: GEO, rouge: ROUGE });
    if (!r.ok) throw new Error(r.raison);
    await attendreCalque(page);
    const I = r.info, P = {};
    I.piliers.forEach(function (p) { P[p.nom] = p; });
    await page.evaluate(function () { window.__de.espions(); window.ktaSetActiveLevel(-1); });
    await page.waitForTimeout(800);
    const base = await page.evaluate(function () {
      const e = window._ktaImageOverlays[0], b = e.overlay.getBounds(), H = window.APP_CONFIG.imageHeight;
      return { multi: window.APP_CONFIG.multiLevel === true, actif: window.APP_CONFIG.activeLevel,
               affiche: window.map.hasLayer(e.overlay),
               calque: { x0: b.getWest(), y0: H - b.getNorth(), x1: b.getEast(), y1: H - b.getSouth() } };
    });
    inf("image " + I.W + " × " + I.H + ", calque niveau −1 (" + I.k + " px plan par px de calque), emprise " +
      JSON.stringify(base.calque));
    verifier(base.multi && base.actif === -1 && base.affiche, "plan multi-niveau, niveau −1 actif, calque affiché", base);
    const M = GEO.marge, tolB = 2;
    verifier(Math.abs(base.calque.x0 + M) <= tolB && Math.abs(base.calque.y0 + M) <= tolB &&
      Math.abs(base.calque.x1 - I.W - M) <= tolB + I.k && Math.abs(base.calque.y1 - I.H - M) <= tolB + I.k,
      "calque calé : déborde de " + M + " px de chaque côté de l'image", base.calque);

    // ── E1 : Remplir au clic hors de l'image, niveau −1 ───────────────
    console.log("— E1 : Remplir au clic sur le débord du calque (niveau −1) —");
    const avant = await page.evaluate(function () { return window.getStructures().length; });
    await page.evaluate(function () { window.__deToasts.length = 0; window.KtaDetectionUI.ouvrir(); });
    await page.waitForTimeout(300);
    await bouton(page, "remplir");
    await page.selectOption("#kta-detect-bandeau [data-detect-remplir-type]", "mur");
    const hg = centre(P["haut-gauche"]), bd = centre(P["bas-droite"]);
    await toucher(page, hg.x, hg.y);
    let e = await etat(page);
    const t1 = await page.evaluate(function () { return window.__deToasts.slice(); });
    verifier(e && e.remplir && e.remplir.n === 1, "pilier du débord haut-gauche (x, y < 0) : zone acceptée",
      { remplir: e && e.remplir, toasts: t1 });
    await toucher(page, bd.x, bd.y);
    e = await etat(page);
    const t1b = await page.evaluate(function () { return window.__deToasts.slice(); });
    verifier(e && e.remplir && e.remplir.n === 2, "pilier du débord bas-droite (x > largeur, y > hauteur) : zone acceptée",
      { remplir: e && e.remplir, toasts: t1b });
    if (e && e.remplir && e.remplir.n > 0) await bouton(page, "valider-remplir");
    await page.waitForTimeout(500);
    const poses = await page.evaluate(function (n) {
      return window.getStructures().slice(n).map(function (s) { return { type: s.type, level: s.level, points: s.points }; });
    }, avant);
    const tolM = 1.5 + I.k;
    const bHG = poses[0] ? boite(poses[0].points) : null, bBD = poses[1] ? boite(poses[1].points) : null;
    verifier(poses.length === 2 && poses.every(function (s) { return s.type === "mur" && s.level === -1; }),
      "« Valider » : 2 structures « mur » au niveau −1", poses.map(function (s) { return { type: s.type, level: s.level }; }));
    verifier(!!bHG && surLePilier(bHG, P["haut-gauche"], tolM),
      "haut-gauche : contour posé sur le pilier, en coordonnées négatives (à " + tolM + " px)", { boite: bHG, pilier: P["haut-gauche"] });
    verifier(!!bBD && surLePilier(bBD, P["bas-droite"], tolM),
      "bas-droite : contour posé sur le pilier, au-delà de l'image (à " + tolM + " px)", { boite: bBD, pilier: P["bas-droite"] });
    await page.evaluate(function () { if (window.KtaDetectionUI.etat()) window.KtaDetectionUI.fermer(); });

    // ── E2 : Tout le plan au niveau −1 ────────────────────────────────
    console.log("— E2 : « Tout le plan » au niveau −1 —");
    const t2 = await toutLePlan(page);
    const reg = t2.appel && t2.appel.region;
    verifier(!!reg && reg.x <= -M + 1 && reg.y <= -M + 1 && reg.x + reg.w >= I.W + M - 1 - I.k &&
      reg.y + reg.h >= I.H + M - 1 - I.k, "région = emprise du calque entier (débord compris)", t2.appel);
    const ap = t2.etat && t2.etat.apercu;
    // les 2 piliers déjà remplis en E1 sont « déjà dessinés » : 5 nouveaux + 2 déjà là = les 7
    verifier(!!ap && ap.n + ap.deja === 7 && ap.n === 5,
      "7 piliers trouvés sur le calque entier (5 nouveaux, 2 déjà posés en E1)", { apercu: ap, toasts: t2.toasts });
    const avant2 = await page.evaluate(function () { return window.getStructures().length; });
    if (ap && ap.n > 0) await bouton(page, "valider");
    await page.waitForTimeout(500);
    const det = await page.evaluate(function (n) {
      return window.getStructures().slice(n).map(function (s) { return { type: s.type, level: s.level, points: s.points }; });
    }, avant2);
    // Pilier détecté : contour de l'intérieur rouge (bords des pixels), à `tolP` px près.
    const tolP = 2 + I.k;
    const trouve = function (p) {
      const c = centre(p);
      const s = det.filter(function (q) {
        const b = boite(q.points);
        return c.x > b.x0 && c.x < b.x1 && c.y > b.y0 && c.y < b.y1;
      })[0];
      return s ? boite(s.points) : null;
    };
    const entier = function (b, p) {
      return !!b && Math.abs(b.x0 - p.x) <= tolP && Math.abs(b.y0 - p.y) <= tolP &&
        Math.abs(b.x1 - (p.x + GEO.pw)) <= tolP && Math.abs(b.y1 - (p.y + GEO.ph)) <= tolP;
    };
    const bBas = trouve(P["bord-bas"]), bDroit = trouve(P["bord-droit"]);
    verifier(det.length === 5 && det.every(function (s) { return s.level === -1; }),
      "« Valider » : 5 structures posées au niveau −1", det.map(function (s) { return { type: s.type, level: s.level }; }));
    verifier(entier(bBas, P["bord-bas"]) && bBas.y1 > I.H + 1,
      "pilier à cheval sur le bord bas de l'image : ENTIER, pas rogné sur y = " + I.H, { boite: bBas, pilier: P["bord-bas"] });
    verifier(entier(bDroit, P["bord-droit"]) && bDroit.x1 > I.W + 1,
      "pilier à cheval sur le bord droit de l'image : ENTIER, pas rogné sur x = " + I.W,
      { boite: bDroit, pilier: P["bord-droit"] });
    await page.evaluate(function () { if (window.KtaDetectionUI.etat()) window.KtaDetectionUI.fermer(); });

    // ── E3 : niveau 0 inchangé ─────────────────────────────────────────
    console.log("— E3 : niveau 0 inchangé —");
    await page.evaluate(function () { window.ktaSetActiveLevel(0); });
    await page.waitForTimeout(600);
    const msgHors = await page.evaluate(function () { return window.I18n.t("detect.toast.horsImage"); });
    await page.evaluate(function () { window.__deToasts.length = 0; window.KtaDetectionUI.ouvrir(); });
    await page.waitForTimeout(300);
    await bouton(page, "remplir");
    const hd = centre(P["haut-droite"]);
    await toucher(page, hd.x, hd.y);
    e = await etat(page);
    const t3 = await page.evaluate(function () { return window.__deToasts.slice(); });
    verifier(e && e.remplir && e.remplir.n === 0 && t3.some(function (t) { return t.msg === msgHors; }),
      "niveau 0, toucher hors de l'image : refusé (« " + msgHors + " »)", { remplir: e && e.remplir, toasts: t3 });
    await page.evaluate(function () { if (window.KtaDetectionUI.etat()) window.KtaDetectionUI.fermer(); });
    const t4 = await toutLePlan(page);
    const r0 = t4.appel && t4.appel.region;
    verifier(!!r0 && r0.x === 0 && r0.y === 0 && r0.w === I.W && r0.h === I.H,
      "niveau 0, « Tout le plan » : région = l'image du plan", t4.appel);
    await page.evaluate(function () { if (window.KtaDetectionUI.etat()) window.KtaDetectionUI.fermer(); });

    const utiles = erreurs.filter(function (x) { return !/swRegister|serviceWorker/i.test(x); });
    verifier(utiles.length === 0, "aucune erreur de page", utiles.slice(0, 3));
  } finally {
    await ctx.close();
  }
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
  console.log("🎉 CHECKUP VERT — emprise du calque lue par Détecter (" + joues.join(", ") + ")");
  process.exit(0);
})();
