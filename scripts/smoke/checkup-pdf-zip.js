#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-pdf-zip.js — checkup (Playwright) : les PDF livrés dans le ZIP d'un plan, tous utilisables
// =====================================================================
// Parcours réel : le relevé fictif devient un plan LOCAL (ZIP construit dans la page) qui embarque trois PDF
// (`plan.histoirePdfs`). Attendu, sous un agent iPhone :
//   1. les trois fichiers ont une adresse blob: de type application/pdf (pas le chemin brut du ZIP) ;
//   2. trois copies dans l'IndexedDB du Mode Histoire, sous leur vrai nom, en application/pdf, octets %PDF ;
//   3. Mode Histoire et Carnet > Récits : chaque document a son bouton « Ouvrir / Enregistrer » (partage) ou son
//      lien de téléchargement (blob:, nom en .pdf), et AUCUN lien vers un chemin non résolu ;
//   4. un document introuvable est dit introuvable, jamais servi en lien (sinon : page 404 ou index.html
//      téléchargée à la place du PDF, en « .html » sur iPhone).
// 🩸 Le bug d'origine : main.js > startImportedPlan n'enregistrait que `histoirePdf` (le premier) ; les autres
// retombaient sur `data/<nom>.pdf` à la racine du site, et ne se copiaient jamais dans le Carnet.
// ⚠️ WebKit sous Windows (Playwright) refuse tout Blob dans IndexedDB : sous ce moteur, les copies (2) et le
// Carnet ne sont pas mesurables, le harnais le dit ; le reste est vérifié.
// Usage : node scripts/smoke/checkup-pdf-zip.js (SMOKE_PORT, KTA_MOTEURS) · doc : session-data.md § Mode Histoire
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
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const NOMS = ["doc-1.pdf", "doc-2.pdf", "doc-3.pdf"];

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }
function verifier(c, m, detail) { if (c) ok(m); else pb(m + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Dans la page : l'action proposée pour le document affiché par un conteneur (Mode Histoire ou Carnet).
function _actionDansPage(selConteneur) {
  const box = document.querySelector(selConteneur);
  if (!box) return { absent: true };
  const bouton = box.querySelector("[data-kta-pdf-partager]");
  const lien = box.querySelector("a[download]");
  const liensNonResolus = Array.from(box.querySelectorAll("a[href]"))
    .map(function (a) { return a.getAttribute("href") || ""; })
    .filter(function (h) { return !/^blob:/.test(h); });
  return {
    bouton: !!bouton,
    lien: lien ? { href: (lien.getAttribute("href") || "").slice(0, 5), download: lien.getAttribute("download") } : null,
    liensNonResolus: liensNonResolus,
    introuvable: !!box.querySelector(".kta-histoire-pdf-introuvable")
  };
}

function actionValide(a) {
  if (!a || a.absent) return false;
  if (a.liensNonResolus.length) return false;
  if (a.bouton) return true;
  return !!(a.lien && a.lien.href === "blob:" && /\.pdf$/i.test(a.lien.download || ""));
}

async function passe(nav, nom) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA_IPHONE, hasTouch: true });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  let blobRefuse = false;
  page.on("console", function (m) { if (/Error preparing Blob\/File data/.test(m.text())) blobRefuse = true; });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

  const ouvert = await page.evaluate(async function (noms) {
    const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
    if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
    const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
    const zip = new JSZip();
    const chemins = noms.map(function (n) { return "data/" + n; });
    chemins.forEach(function (p, i) {
      zip.file(p, "%PDF-1.4\n% doc " + (i + 1) + "\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
    });
    cfg.plan.histoirePdf = chemins[0];
    cfg.plan.histoirePdfs = chemins;
    zip.file("plan-config.json", JSON.stringify(cfg));
    const autres = [cfg.plan.baseImage]
      .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
      .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
    for (const p of Array.from(new Set(autres))) {
      const r = await fetch(window.resolveServerPath(p, srv.path));
      if (r.ok) zip.file(p, await r.blob());
    }
    const blob = await zip.generateAsync({ type: "blob" });
    await window.chargerZipFichier(new File([blob], "fictif-pdf.zip", { type: "application/zip" }), "auto", { storeBlob: true });
    return { ok: true };
  }, NOMS);
  if (!ouvert.ok) throw new Error(ouvert.raison);
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map; }, 60000);
  await page.waitForTimeout(5000);   // syncDocsEmbarques part 1,2 s après la fin du chargement

  console.log("— [" + nom + "] 1. adresses des PDF du ZIP —");
  const etat = await page.evaluate(async function () {
    const ra = Object.keys(window.RUNTIME_ASSETS || {}).filter(function (k) { return /\.pdf$/i.test(k); })
      .map(function (k) { const e = window.RUNTIME_ASSETS[k]; return { k: k, type: e.file && e.file.type, url: String(e.url || "").slice(0, 5) }; });
    const resolus = (window.PLAN_CONFIG.plan.histoirePdfs || []).map(function (u) { return String(u).slice(0, 5); });
    const recs = await new Promise(function (res) {
      const rq = indexedDB.open("myktamap_histoire_pdfs");
      rq.onsuccess = function () {
        const db = rq.result;
        if (!db.objectStoreNames.contains("pdfs")) { db.close(); res([]); return; }
        const g = db.transaction("pdfs", "readonly").objectStore("pdfs").getAll();
        g.onsuccess = function () { db.close(); res(g.result || []); };
        g.onerror = function () { db.close(); res([]); };
      };
      rq.onerror = function () { res([]); };
    });
    const copies = [];
    for (const r of recs) {
      copies.push({ name: r.name, type: r.blob && r.blob.type, debut: r.blob ? await r.blob.slice(0, 4).text() : "" });
    }
    return { ra: ra, resolus: resolus, copies: copies };
  });
  verifier(etat.ra.length === 3 && etat.ra.every(function (e) { return e.url === "blob:" && e.type === "application/pdf"; }),
    "les trois PDF du ZIP sont enregistrés (blob:, application/pdf)", etat.ra);
  verifier(etat.resolus.length === 3 && etat.resolus.every(function (u) { return u === "blob:"; }),
    "PLAN_CONFIG.plan.histoirePdfs : trois adresses blob:, aucun chemin brut", etat.resolus);
  // Plan serveur en dossier (sans ZIP) : `data/…` du plan-config est relatif au dossier du plan.
  const dossier = await page.evaluate(function () {
    const c = window.resolveServerPaths({ plan: { histoirePdf: "data/a.pdf", histoirePdfs: ["data/a.pdf", "data/b.pdf"] } },
                                        "data/plan-x");
    return [c.plan.histoirePdf].concat(c.plan.histoirePdfs);
  });
  verifier(JSON.stringify(dossier) === JSON.stringify(["data/plan-x/data/a.pdf", "data/plan-x/data/a.pdf", "data/plan-x/data/b.pdf"]),
    "plan serveur en dossier : les PDF sont cherchés dans le dossier du plan", dossier);

  console.log("— [" + nom + "] 2. copies pour le Carnet —");
  const mesurable = !blobRefuse;
  if (mesurable) {
    const noms = etat.copies.map(function (c) { return c.name; }).sort();
    verifier(etat.copies.length === 3, "trois copies dans l'IndexedDB du Mode Histoire", etat.copies);
    verifier(JSON.stringify(noms) === JSON.stringify(NOMS), "les copies portent le vrai nom des fichiers", noms);
    verifier(etat.copies.every(function (c) { return c.type === "application/pdf" && c.debut === "%PDF"; }),
      "les copies sont des PDF typés application/pdf", etat.copies);
  } else {
    inf("⚠️ limite du banc : ce WebKit refuse tout Blob dans IndexedDB — copies et Carnet non mesurés");
  }

  console.log("— [" + nom + "] 3. Mode Histoire (agent iPhone) —");
  await page.evaluate(function () { window.ModeHistoire.openTab("pdf"); });
  await page.waitForTimeout(1500);
  const entrees = await page.evaluate(function () {
    return Array.from(document.querySelectorAll(".kta-histoire-doc")).map(function (b) { return b.textContent.trim(); });
  });
  verifier(entrees.length === 3 && NOMS.every(function (n) { return entrees.some(function (t) { return t.indexOf(n) >= 0; }); }),
    "la liste montre les trois documents sous leur vrai nom", entrees);
  for (let i = 0; i < entrees.length; i++) {
    await page.evaluate(function (i) { document.querySelectorAll(".kta-histoire-doc")[i].click(); }, i);
    await page.waitForTimeout(900);
    const a = await page.evaluate(_actionDansPage, "#kta-histoire-pdf-wrap");
    verifier(actionValide(a), "document " + (i + 1) + " : bouton Ouvrir / Enregistrer ou lien blob: en .pdf, rien d'autre", a);
  }
  await page.evaluate(function () { window.ModeHistoire.close(); });

  if (mesurable) {
    console.log("— [" + nom + "] 4. Carnet > Récits —");
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
    });
    const docsCarnet = await page.evaluate(function () {
      return Array.from(document.querySelectorAll("#kta-jrn-recit-docs .kta-jrn-doc-open")).map(function (b) { return b.textContent.trim(); });
    });
    verifier(docsCarnet.length === 3, "le Carnet liste les trois documents du plan", docsCarnet);
    for (let i = 0; i < docsCarnet.length; i++) {
      await page.evaluate(function (i) { document.querySelectorAll("#kta-jrn-recit-docs .kta-jrn-doc-open")[i].click(); }, i);
      await page.waitForTimeout(700);
      const a = await page.evaluate(_actionDansPage, "#kta-jrn-recit-pdfbox");
      verifier(actionValide(a), "Carnet, document " + (i + 1) + " : bouton Ouvrir / Enregistrer ou lien blob: en .pdf", a);
    }
    await page.evaluate(function () { const c = document.getElementById("kta-jrn-recit-close"); if (c) c.click(); });
  }

  console.log("— [" + nom + "] 5. partage (navigator.share simulé, annulé par l'utilisateur) —");
  const partage = await page.evaluate(async function () {
    const appels = [];
    Object.defineProperty(navigator, "canShare", { configurable: true, value: function (d) { return !!(d && d.files && d.files.length); } });
    Object.defineProperty(navigator, "share", { configurable: true, value: function (d) {
      appels.push({ nom: d.files[0].name, type: d.files[0].type, octets: d.files[0].size });
      const e = new Error("annulé"); e.name = "AbortError"; return Promise.reject(e);
    } });
    const toastsAvant = document.querySelectorAll(".kta-toast").length;
    window.ModeHistoire.openTab("pdf");
    await new Promise(function (r) { setTimeout(r, 1500); });
    const b = document.querySelector("#kta-histoire-pdf-wrap [data-kta-pdf-partager]");
    if (b) b.click();
    await new Promise(function (r) { setTimeout(r, 800); });
    const res = { bouton: !!b, appels: appels, toasts: document.querySelectorAll(".kta-toast").length - toastsAvant,
                  alerte: !!document.querySelector("#kta-confirm-ok, [id^=\"kta-confirm\"]") };
    window.ModeHistoire.close();
    delete navigator.canShare; delete navigator.share;
    return res;
  });
  verifier(partage.bouton && partage.appels.length === 1 && partage.appels[0].type === "application/pdf" &&
    NOMS.indexOf(partage.appels[0].nom) >= 0 && partage.appels[0].octets > 0,
    "le bouton Ouvrir / Enregistrer partage un File application/pdf sous son vrai nom", partage);
  verifier(partage.toasts === 0 && !partage.alerte, "partage annulé (AbortError) : ni toast ni alerte", partage);

  console.log("— [" + nom + "] 6. document introuvable —");
  await page.evaluate(async function () {
    // Copies retirées, puis un chemin que rien ne résout : l'entrée embarquée est seule en jeu.
    await new Promise(function (res) {
      const rq = indexedDB.open("myktamap_histoire_pdfs");
      rq.onsuccess = function () {
        const db = rq.result;
        if (!db.objectStoreNames.contains("pdfs")) { db.close(); res(); return; }
        const t = db.transaction("pdfs", "readwrite"); t.objectStore("pdfs").clear();
        t.oncomplete = t.onerror = function () { db.close(); res(); };
      };
      rq.onerror = function () { res(); };
    });
    window.PLAN_CONFIG.plan.histoirePdfs = ["data/absent.pdf"];
    window.PLAN_CONFIG.plan.histoirePdf = "data/absent.pdf";
    window.ModeHistoire.openTab("pdf");
  });
  await page.waitForTimeout(1500);
  const intr = await page.evaluate(_actionDansPage, "#kta-histoire-pdf-wrap");
  verifier(intr.introuvable && intr.liensNonResolus.length === 0 && !intr.bouton && !intr.lien,
    "un document introuvable est dit introuvable, sans lien ni bouton", intr);
  await page.evaluate(function () { window.ModeHistoire.close(); });

  verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  await ctx.close();
}

(async function main() {
  try {
    for (const nom of moteurs()) {
      const nav = await lancerMoteur(nom);
      if (!nav) { inf("moteur " + nom + " absent : sauté"); continue; }
      try { await passe(nav, nom); }
      catch (e) { pb("[" + nom + "] exception du harnais : " + (e && e.message)); }
      finally { await nav.close(); }
    }
  } finally { server.close(); }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — les PDF d'un ZIP sont tous résolus, copiés, et ouvrables ou enregistrables.");
  process.exit(0);
})();
