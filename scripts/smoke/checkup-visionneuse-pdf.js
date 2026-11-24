#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-visionneuse-pdf.js — checkup (Playwright) : la visionneuse PDF du Mode Histoire et du Carnet
// =====================================================================
// Parcours réel : le relevé fictif devient un plan LOCAL (ZIP construit dans la page) qui embarque un PDF de
// 12 pages produit par jsPDF (rien de réel). Attendu :
//   1. Mode Histoire : visionneuse (pas d'iframe), 12 pages annoncées, une page peinte (canvas non blanc), rendu
//      paresseux (pas 12 canvas d'emblée ; la dernière page peinte en fin de défilement, la première libérée) ;
//   2. zoom (bouton, Ctrl + molette) : pages plus larges, rendu refait ; plein écran aller-retour ;
//   3. fermeture : aucune visionneuse ouverte, aucun canvas, document et worker libérés ;
//   4. Carnet > Récits : même visionneuse, même nombre de pages, libérée à la fermeture de la fiche ;
//   5. appareil sans les API du build moderne (Math.sumPrecise retiré) : pas de visionneuse, PDF.js jamais
//      importé ; agent iPhone : bouton « Ouvrir / Enregistrer » ou lien ; PC : iframe ;
//   6. hors ligne (Chromium) : précache complet, réseau coupé (context.setOffline), page rechargée, Carnet :
//      la visionneuse s'ouvre, fichiers de lib/pdfjs/ servis par le Service Worker et présents dans le cache.
// ⚠️ WebKit sous Windows (Playwright) refuse tout Blob dans IndexedDB et la plupart des écritures du précache :
// Carnet (4) et hors ligne (6) n'y sont pas mesurables, le harnais le dit ; le reste y est vérifié.
// Usage : node scripts/smoke/checkup-visionneuse-pdf.js (SMOKE_PORT, KTA_MOTEURS) · doc : session-data.md § Mode Histoire
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1";
const PAGES = 12;
const NOM = "recit-fictif.pdf";

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }
function verifier(c, m, detail) { if (c) ok(m); else pb(m + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// ── Dans la page ──
function etatVisionneuse(sel) {
  const hote = document.querySelector(sel);
  const v = hote && hote.querySelector(".kta-vpdf");
  const etat = window.KtaVisionneusePdf ? window.KtaVisionneusePdf._etat() : null;
  if (!v) return { present: false, iframe: !!(hote && hote.querySelector("iframe")), etat: etat };
  const canvas = Array.from(v.querySelectorAll("canvas"));
  const feuilles = Array.from(v.querySelectorAll(".kta-vpdf-feuille"));
  // Pixels sombres du premier canvas : une page vraiment peinte (texte et pavé noir de jsPDF), pas un fond blanc.
  let sombres = 0;
  if (canvas[0] && canvas[0].width) {
    const d = canvas[0].getContext("2d").getImageData(0, 0, canvas[0].width, canvas[0].height).data;
    for (let i = 0; i < d.length; i += 16) if (d[i] < 80 && d[i + 1] < 80 && d[i + 2] < 80 && d[i + 3] > 200) sombres++;
  }
  return {
    present: true, pages: v.getAttribute("data-pages"), zoom: v.getAttribute("data-zoom"), plein: v.getAttribute("data-plein"),
    feuilles: feuilles.length, canvas: canvas.length, sombres: sombres,
    largeur1: feuilles[0] ? feuilles[0].getBoundingClientRect().width : 0,
    canvas1: canvas[0] ? canvas[0].width : 0,
    pagesPeintes: feuilles.filter(function (f) { return !!f.querySelector("canvas"); })
      .map(function (f) { return parseInt(f.getAttribute("data-page"), 10); }),
    iframe: !!hote.querySelector("iframe"), etat: etat
  };
}

function actionPdf(sel) {
  const box = document.querySelector(sel);
  if (!box) return { absent: true };
  const lien = box.querySelector("a[download]");
  return { bouton: !!box.querySelector("[data-kta-pdf-partager]"), lien: !!(lien && /^blob:/.test(lien.getAttribute("href") || "")) };
}

// Ouvre l'app, dépose le relevé fictif en plan ZIP avec un PDF jsPDF de `pages` pages.
async function ouvrirPlanAvecPdf(page, pages, nom) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerZipFichier === "function" && !!window.jspdf;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  const r = await page.evaluate(async function (a) {
    const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
    if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
    const doc = new window.jspdf.jsPDF();
    for (let i = 1; i <= a.pages; i++) {
      if (i > 1) doc.addPage();
      doc.setFontSize(28);
      doc.text("Page " + i + " / " + a.pages, 20, 30);
      doc.setFillColor(0, 0, 0);
      doc.rect(20, 45, 120, 60, "F");
    }
    const pdf = doc.output("blob");
    const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
    const zip = new JSZip();
    zip.file("data/" + a.nom, pdf);
    cfg.plan.histoirePdf = "data/" + a.nom;
    cfg.plan.histoirePdfs = ["data/" + a.nom];
    zip.file("plan-config.json", JSON.stringify(cfg));
    const autres = [cfg.plan.baseImage]
      .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
      .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
    for (const p of Array.from(new Set(autres))) {
      const rp = await fetch(window.resolveServerPath(p, srv.path));
      if (rp.ok) zip.file(p, await rp.blob());
    }
    const blob = await zip.generateAsync({ type: "blob" });
    await window.chargerZipFichier(new File([blob], "fictif-visionneuse.zip", { type: "application/zip" }), "auto", { storeBlob: true });
    return { ok: true };
  }, { pages: pages, nom: nom });
  if (!r.ok) throw new Error(r.raison);
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map; }, 60000);
  await page.waitForTimeout(4000);   // syncDocsEmbarques part 1,2 s après la fin du chargement
}

async function ouvrirRecitCarnet(page) {
  await page.evaluate(async function () {
    window.JournalUi.ouvrir();
    await new Promise(function (r) { setTimeout(r, 900); });
    const onglet = Array.from(document.querySelectorAll(".kta-jrn-onglet"))
      .filter(function (b) { return b.getAttribute("data-tab") === "recits"; })[0];
    if (onglet) onglet.click();
    await new Promise(function (r) { setTimeout(r, 1200); });
    const ligne = document.querySelector("#kta-jrn-recits .kta-jrn-recit-row");
    if (ligne) ligne.click();
    await new Promise(function (r) { setTimeout(r, 600); });
    const doc = document.querySelector("#kta-jrn-recit-docs .kta-jrn-doc-open");
    if (doc) doc.click();
  });
}

async function nouvellePage(nav, opts, initScript) {
  const ctx = await nav.newContext(Object.assign({ viewport: { width: 1280, height: 860 } }, opts || {}));
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message).slice(0, 200)); });
  let blobRefuse = false;
  const avisPdf = [];
  page.on("console", function (m) {
    if (/Error preparing Blob\/File data/.test(m.text())) blobRefuse = true;
    // PDF.js passé en « fake worker » (worker refusé, CSP ou type MIME) : il tournerait dans la page, à ne pas taire.
    if (/fake worker|Warning:|VisionneusePdf|ModeHistoire\] visionneuse|JournalUi\] visionneuse/i.test(m.text())) {
      avisPdf.push(m.type() + " " + m.text().slice(0, 160));
    }
    if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) erreurs.push("CSP : " + m.text().slice(0, 200));
  });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  if (initScript) await page.addInitScript(initScript);
  return { ctx: ctx, page: page, erreurs: erreurs, avisPdf: avisPdf, blobRefuse: function () { return blobRefuse; } };
}

// ── 1 à 4 : visionneuse, zoom, plein écran, fermeture, Carnet ──
async function passeVisionneuse(nav, nom) {
  const p = await nouvellePage(nav);
  const page = p.page;
  await ouvrirPlanAvecPdf(page, PAGES, NOM);
  const dispo = await page.evaluate(function () {
    return window.KtaVisionneusePdf ? { ok: window.KtaVisionneusePdf.disponible(), manque: window.KtaVisionneusePdf.apiManquantes() } : null;
  });
  verifier(dispo && dispo.ok, "[" + nom + "] KtaVisionneusePdf présent et disponible (API du build moderne là)", dispo);

  const avantOuverture = await page.evaluate(function () {
    return { lib: window.KtaVisionneusePdf._etat().libChargee,
      requetes: performance.getEntriesByType("resource").filter(function (r) { return /\/lib\/pdfjs\//.test(r.name); }).length };
  });
  verifier(!avantOuverture.lib && avantOuverture.requetes === 0, "PDF.js ni importé ni demandé avant la première ouverture", avantOuverture);

  console.log("— [" + nom + "] 1. Mode Histoire —");
  const SEL = "#kta-histoire-pdf-wrap";
  await page.evaluate(function () { window.ModeHistoire.openTab("pdf"); });
  await attendre(page, function () {
    const v = document.querySelector("#kta-histoire-pdf-wrap .kta-vpdf");
    return !!(v && v.querySelector("canvas"));
  }, 20000).catch(function () {});
  await page.waitForTimeout(800);
  let e = await page.evaluate(etatVisionneuse, SEL);
  verifier(e.present && !e.iframe, "visionneuse affichée à la place de l'iframe", e);
  verifier(e.pages === String(PAGES) && e.feuilles === PAGES, PAGES + " pages annoncées et posées", { pages: e.pages, feuilles: e.feuilles });
  verifier(e.canvas >= 1 && e.sombres > 50, "une page vraiment peinte (canvas non blanc)", { canvas: e.canvas, sombres: e.sombres });
  verifier(e.canvas < PAGES, "rendu paresseux : pas toutes les pages d'emblée", e.pagesPeintes);
  const action = await page.evaluate(actionPdf, SEL);
  verifier(action.bouton || action.lien, "« Ouvrir / Enregistrer » ou « Télécharger » toujours proposé", action);

  await page.evaluate(function () {
    const d = document.querySelector("#kta-histoire-pdf-wrap .kta-vpdf-defil");
    d.scrollTop = d.scrollHeight;
  });
  await page.waitForTimeout(2500);
  e = await page.evaluate(etatVisionneuse, SEL);
  verifier(e.pagesPeintes.indexOf(PAGES) >= 0 && e.pagesPeintes.indexOf(1) < 0,
    "fin du document : dernière page peinte, première libérée", e.pagesPeintes);
  await page.evaluate(function () { document.querySelector("#kta-histoire-pdf-wrap .kta-vpdf-defil").scrollTop = 0; });
  await page.waitForTimeout(1500);

  console.log("— [" + nom + "] 2. zoom et plein écran —");
  const avant = await page.evaluate(etatVisionneuse, SEL);
  await page.click('#kta-histoire-pdf-wrap [data-vpdf="plus"]');
  await page.waitForTimeout(1500);
  const plus = await page.evaluate(etatVisionneuse, SEL);
  verifier(plus.zoom === "125" && plus.largeur1 > avant.largeur1 * 1.2, "bouton + : zoom 125 %, page plus large",
    { avant: avant.largeur1, apres: plus.largeur1, zoom: plus.zoom });
  verifier(plus.canvas1 > avant.canvas1, "rendu refait à la nouvelle échelle (canvas plus grand)", { avant: avant.canvas1, apres: plus.canvas1 });
  await page.evaluate(function () {
    const d = document.querySelector("#kta-histoire-pdf-wrap .kta-vpdf-defil");
    const r = d.getBoundingClientRect();
    d.dispatchEvent(new WheelEvent("wheel", { deltaY: -60, ctrlKey: true, clientX: r.left + 50, clientY: r.top + 50,
      bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(800);
  const molette = await page.evaluate(etatVisionneuse, SEL);
  verifier(parseInt(molette.zoom, 10) > 125, "Ctrl + molette (pincement du pavé) : zoom augmenté", molette.zoom);
  await page.click('#kta-histoire-pdf-wrap [data-vpdf="ajuster"]');
  await page.waitForTimeout(600);
  verifier((await page.evaluate(etatVisionneuse, SEL)).zoom === "100", "Ajuster : retour à la largeur (100 %)");
  await page.click('.kta-vpdf [data-vpdf="plein"]');
  await page.waitForTimeout(800);
  const plein = await page.evaluate(function () {
    const v = document.querySelector(".kta-vpdf");
    return v ? v.getAttribute("data-plein") : "absente";
  });
  verifier(plein === "natif" || plein === "page", "plein écran ouvert (" + plein + ")", plein);
  await page.click('.kta-vpdf [data-vpdf="plein"]');
  await page.waitForTimeout(800);
  const sorti = await page.evaluate(function () {
    const v = document.querySelector("#kta-histoire-pdf-wrap .kta-vpdf");
    return v ? (v.getAttribute("data-plein") || "non") : "absente";
  });
  verifier(sorti === "non", "plein écran refermé, visionneuse revenue à sa place", sorti);
  // Sans API plein écran (iPhone) : la visionneuse couvre la page ; Échap la remet en place sans fermer la fenêtre.
  await page.evaluate(function () {
    ["fullscreenEnabled", "webkitFullscreenEnabled"].forEach(function (k) {
      Object.defineProperty(document, k, { configurable: true, value: false });
    });
  });
  await page.click('#kta-histoire-pdf-wrap [data-vpdf="plein"]');
  await page.waitForTimeout(800);
  const pp = await page.evaluate(function () {
    const v = document.querySelector(".kta-vpdf");
    return v ? { plein: v.getAttribute("data-plein"), sousBody: v.parentNode === document.body,
      fixe: getComputedStyle(v).position, z: getComputedStyle(v).zIndex } : null;
  });
  verifier(pp && pp.plein === "page" && pp.sousBody && pp.fixe === "fixed" && pp.z === "100002",
    "sans API plein écran : la visionneuse couvre la page", pp);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const pe = await page.evaluate(function () {
    const v = document.querySelector("#kta-histoire-pdf-wrap .kta-vpdf");
    return { revenue: !!v && !v.getAttribute("data-plein"), modeHistoire: window.ModeHistoire.isOpen(),
      canvas: v ? v.querySelectorAll("canvas").length : 0 };
  });
  verifier(pe.revenue && pe.modeHistoire && pe.canvas >= 1, "Échap : visionneuse revenue, Mode Histoire toujours ouvert", pe);
  await page.evaluate(function () { delete document.fullscreenEnabled; delete document.webkitFullscreenEnabled; });

  console.log("— [" + nom + "] 3. fermeture —");
  await page.evaluate(function () { window.ModeHistoire.close(); });
  await page.waitForTimeout(500);
  const ferme = await page.evaluate(function () {
    return { etat: window.KtaVisionneusePdf._etat(), dom: document.querySelectorAll(".kta-vpdf, .kta-vpdf-canvas").length };
  });
  verifier(ferme.etat.ouvertes === 0 && ferme.etat.canvas === 0 && ferme.dom === 0,
    "Mode Histoire fermé : aucune visionneuse, aucun canvas", ferme);

  console.log("— [" + nom + "] 4. Carnet > Récits —");
  if (p.blobRefuse()) {
    inf("⚠️ limite du banc : ce WebKit refuse tout Blob dans IndexedDB — Carnet non mesuré");
  } else {
    await ouvrirRecitCarnet(page);
    await attendre(page, function () {
      const v = document.querySelector("#kta-jrn-recit-pdfbox .kta-vpdf");
      return !!(v && v.querySelector("canvas"));
    }, 20000).catch(function () {});
    await page.waitForTimeout(800);
    const c = await page.evaluate(etatVisionneuse, "#kta-jrn-recit-pdfbox");
    verifier(c.present && !c.iframe && c.pages === String(PAGES), "Carnet : visionneuse, " + PAGES + " pages", c);
    verifier(c.canvas >= 1 && c.sombres > 50, "Carnet : une page vraiment peinte", { canvas: c.canvas, sombres: c.sombres });
    await page.evaluate(function () { const b = document.getElementById("kta-jrn-recit-close"); if (b) b.click(); });
    await page.waitForTimeout(500);
    const cf = await page.evaluate(function () { return window.KtaVisionneusePdf._etat(); });
    verifier(cf.ouvertes === 0 && cf.canvas === 0, "fiche du récit fermée : visionneuse libérée", cf);
  }
  verifier(p.erreurs.length === 0, "[" + nom + "] aucune erreur de page ni de CSP", p.erreurs.slice(0, 3));
  verifier(!p.avisPdf.some(function (a) { return /fake worker|repli/i.test(a); }),
    "[" + nom + "] PDF.js dans son worker, aucun repli de la visionneuse", p.avisPdf.slice(0, 5));
  p.avisPdf.forEach(function (a) { inf("console : " + a); });
  await p.ctx.close();
}

// ── 5 : appareil sans les API du build moderne ──
async function passeSansApi(nav, nom) {
  console.log("— [" + nom + "] 5. appareil sans les API du build moderne —");
  const retirer = function () { try { delete Math.sumPrecise; } catch (e) { /* non configurable */ } };
  const IPHONE = { viewport: { width: 390, height: 844 }, userAgent: UA_IPHONE, hasTouch: true };
  // Témoin : même agent iPhone AVEC les API — visionneuse, action, et pas de lien d'onglet (blob: hors de la PWA).
  {
    const p = await nouvellePage(nav, IPHONE);
    await ouvrirPlanAvecPdf(p.page, 2, "court.pdf");
    await p.page.evaluate(function () { window.ModeHistoire.openTab("pdf"); });
    await attendre(p.page, function () {
      const v = document.querySelector("#kta-histoire-pdf-wrap .kta-vpdf");
      return !!(v && v.querySelector("canvas"));
    }, 20000).catch(function () {});
    const e = await p.page.evaluate(etatVisionneuse, "#kta-histoire-pdf-wrap");
    const a = await p.page.evaluate(actionPdf, "#kta-histoire-pdf-wrap");
    const onglet = await p.page.evaluate(function () { return !!document.querySelector(".kta-histoire-pdf-action-open"); });
    verifier(e.present && e.pages === "2" && e.canvas >= 1, "agent iPhone avec les API : visionneuse, 2 pages peintes", e);
    verifier((a.bouton || a.lien) && !onglet, "agent iPhone : « Ouvrir / Enregistrer » sans lien d'onglet", { a: a, onglet: onglet });
    await p.page.evaluate(function () { window.ModeHistoire.close(); });
    verifier(p.erreurs.length === 0, "agent iPhone avec les API : aucune erreur de page", p.erreurs.slice(0, 3));
    await p.ctx.close();
  }
  for (const cas of [{ libelle: "agent iPhone", opts: IPHONE }, { libelle: "PC", opts: {} }]) {
    const p = await nouvellePage(nav, cas.opts, retirer);
    const page = p.page;
    await ouvrirPlanAvecPdf(page, 2, "court.pdf");
    const d = await page.evaluate(function () {
      return { manque: window.KtaVisionneusePdf ? window.KtaVisionneusePdf.apiManquantes() : ["module absent"] };
    });
    verifier(d.manque.indexOf("Math.sumPrecise") >= 0, cas.libelle + " : Math.sumPrecise détectée absente", d);
    await page.evaluate(function () { window.ModeHistoire.openTab("pdf"); });
    await page.waitForTimeout(2000);
    const e = await page.evaluate(etatVisionneuse, "#kta-histoire-pdf-wrap");
    const a = await page.evaluate(actionPdf, "#kta-histoire-pdf-wrap");
    verifier(!e.present, cas.libelle + " : pas de visionneuse", e);
    verifier(e.etat && !e.etat.libChargee, cas.libelle + " : PDF.js jamais importé", e.etat);
    if (cas.libelle === "PC") verifier(e.iframe, "PC : iframe en repli", e);
    else verifier(a.bouton || a.lien, "agent iPhone : « Ouvrir / Enregistrer » ou lien présent", a);
    await page.evaluate(function () { window.ModeHistoire.close(); });
    // 🩸 WebKit refuse l'iframe d'un blob: (le document hérite de frame-ancestors 'none') : limite de l'iframe de
    // repli, antérieure à la visionneuse, dite ici sans faire rougir le checkup.
    const iframeRefusee = p.erreurs.filter(function (m) { return /frame-ancestors/.test(m); });
    if (iframeRefusee.length) inf("⚠️ " + nom + " : iframe de repli refusée par la CSP (frame-ancestors) — limite existante");
    const autres = p.erreurs.filter(function (m) { return !/frame-ancestors/.test(m); });
    verifier(autres.length === 0, cas.libelle + " : aucune erreur de page", autres.slice(0, 3));
    await p.ctx.close();
  }
}

// ── 6 : hors ligne, par le précache ──
async function passeHorsLigne(nav, nom) {
  console.log("— [" + nom + "] 6. hors ligne (précache) —");
  const p = await nouvellePage(nav);
  const page = p.page;
  await ouvrirPlanAvecPdf(page, 3, "hors-ligne.pdf");
  let complet = true;
  await attendre(page, function () {
    return (async function () {
      if (!window.SwInspector || !navigator.serviceWorker || !navigator.serviceWorker.controller) return false;
      const r = await window.SwInspector.etat();
      return r && r.etat === "ok";
    })();
  }, 180000, 1000).catch(function () { complet = false; });
  verifier(complet, "Service Worker actif, précache complet");
  const fichiers = await page.evaluate(async function () {
    const urls = ["lib/pdfjs/pdf.min.js", "lib/pdfjs/pdf.worker.min.js", "lib/pdfjs/wasm/openjpeg_nowasm_fallback.js",
      "lib/pdfjs/wasm/jbig2_nowasm_fallback.js", "lib/pdfjs/standard_fonts/LiberationSans-Regular.ttf",
      "lib/pdfjs/standard_fonts/FoxitSymbol.pfb", "js/visionneusePdf.js", "css/style-visionneuse-pdf.css"];
    const res = {};
    for (const u of urls) res[u] = !!(await caches.match(new URL(u, document.baseURI).href));
    return res;
  });
  verifier(Object.values(fichiers).every(Boolean), "fichiers de la visionneuse présents dans le cache", fichiers);

  await p.ctx.setOffline(true);
  const servis = [];
  page.on("response", function (r) {
    if (/\/lib\/pdfjs\//.test(r.url())) servis.push({ u: r.url().replace(/^.*\/lib\/pdfjs\//, ""), sw: r.fromServiceWorker() });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.JournalUi && !!window.KtaVisionneusePdf; }, 30000);
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  const horsLigne = await page.evaluate(function () { return navigator.onLine === false; });
  verifier(horsLigne, "réseau coupé (navigator.onLine faux)");
  await ouvrirRecitCarnet(page);
  await attendre(page, function () {
    const v = document.querySelector("#kta-jrn-recit-pdfbox .kta-vpdf");
    return !!(v && v.querySelector("canvas"));
  }, 25000).catch(function () {});
  await page.waitForTimeout(800);
  const e = await page.evaluate(etatVisionneuse, "#kta-jrn-recit-pdfbox");
  verifier(e.present && e.pages === "3" && e.canvas >= 1 && e.sombres > 50, "hors ligne : la visionneuse s'ouvre et peint", e);
  const lib = servis.filter(function (s) { return s.u === "pdf.min.js"; });
  verifier(lib.length >= 1 && lib.every(function (s) { return s.sw; }), "hors ligne : pdf.min.js servi par le Service Worker", servis);
  verifier(servis.every(function (s) { return s.sw; }), "hors ligne : tout lib/pdfjs/ vient du Service Worker", servis);
  inf("fichiers de lib/pdfjs/ vus hors ligne : " + servis.map(function (s) { return s.u; }).join(", "));
  await p.ctx.close();
}

(async function main() {
  try {
    for (const nom of moteurs()) {
      const nav = await lancerMoteur(nom);
      if (!nav) { inf("moteur " + nom + " absent : sauté"); continue; }
      try {
        await passeVisionneuse(nav, nom);
        await passeSansApi(nav, nom);
        if (nom === "chromium") await passeHorsLigne(nav, nom);
        else inf("⚠️ limite du banc : hors ligne non mesuré sous WebKit (écritures du précache refusées sous Windows)");
      } catch (e) {
        pb("[" + nom + "] exception du harnais : " + (e && e.message));
      } finally { await nav.close(); }
    }
  } finally { server.close(); }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — visionneuse PDF : rendu, zoom, plein écran, libération, repli et hors ligne.");
  process.exit(0);
})();
