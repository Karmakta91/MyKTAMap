#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-rendu-3d-defaut.js — checkup (Playwright, pas un hook pré-commit) : rendu 3D par défaut d'un plan
// =====================================================================
// Plans FABRIQUÉS dans la page (image et ZIP en mémoire, rien lu ni écrit dans data/). Puis :
// A. Générateur : champ « Rendu 3D par défaut », Mixte présélectionné ; ZIP sans le champ déposé → Mixte ; Galerie
//    choisie → ZIP généré relu : plan.vue3dRendu = "galerie" ; ce ZIP redéposé → Galerie reprise ; Mixte → champ absent.
// B. Plan généré « Galerie » ouvert dans l'app : la vue 3D s'ouvre en Galerie (bouton compris).
// C. Interrupteur Rendu touché (→ Mixte) : le choix retenu l'emporte sur le plan-config, y compris après rechargement
//    de la page et réouverture du plan depuis la liste.
// D. Plan sans le champ → Mixte ; valeur inconnue (« plafond », « Galerie ») → Mixte ; Structures lu tel quel.
// 🩸 Sans KtaGalerie (structures seules, vue3d.js > _renduVoulu) : pas éprouvé ici — retirer le module d'une page
//    ouverte fait planter l'onglet (d'autres appels ne le gardent pas) ; il est toujours chargé par index.html.
// Usage : node scripts/smoke/checkup-rendu-3d-defaut.js (SMOKE_PORT pour une autre copie ; R3D_SHOTS=<dossier> pour
// des captures) · doc : data-formats.md § plan.vue3dRendu, tracking.md § Rendus
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
async function capture(page, nom) {
  if (!process.env.R3D_SHOTS) return;
  await page.screenshot({ path: path.join(process.env.R3D_SHOTS, nom + ".png") });
}

async function accueil(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

// ZIP fictif (base64) : un fond gris, une galerie, `rendu` dans plan.vue3dRendu (undefined = champ absent).
function fabriquerZip(page, nom, rendu) {
  return page.evaluate(async function (a) {
    const W = 1000, H = 800;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#cfcfcf"; g.fillRect(0, 0, W, H);
    const png = await new Promise(function (r) { c.toBlob(r, "image/png"); });
    const plan = { name: a.nom, version: "T1", imageWidth: W, imageHeight: H, baseImage: "fond.png" };
    if (a.rendu !== undefined) plan.vue3dRendu = a.rendu;
    const zip = new JSZip();
    zip.file("fond.png", png);
    zip.file("plan-config.json", JSON.stringify({ plan: plan, dataLayers: [],
      tracking: { startX: 500, startY: 400, scale: 4 }, iconsEmbarquees: [] }));
    return zip.generateAsync({ type: "base64" });
  }, { nom: nom, rendu: rendu });
}

function ecrireZip(dossier, nom, b64) {
  const f = path.join(dossier, nom + ".zip");
  fs.writeFileSync(f, Buffer.from(b64, "base64"));
  return f;
}

// Générateur ouvert, ZIP déposé (mode Modifier) → valeur du champ de rendu.
async function deposerAuGenerateur(page, fichier) {
  await page.evaluate(function () { const m = document.getElementById("kta-planner-modal"); if (m) m.remove(); });
  await page.evaluate(function () { window.afficherPlanner(); });
  await attendre(page, function () { return !!document.getElementById("kta-planner-zip-input"); }, 10000);
  await page.evaluate(function () { document.getElementById("pl_name").value = ""; });
  await page.setInputFiles("#kta-planner-zip-input", fichier);
  await attendre(page, function () { return document.getElementById("pl_name").value !== ""; }, 15000);
  await page.waitForTimeout(500);
  return page.evaluate(function () { return document.getElementById("pl_rendu3d").value; });
}

async function generer(page) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.evaluate(function () { document.getElementById("kta-planner-generer").click(); })
  ]);
  const b64 = fs.readFileSync(await dl.path()).toString("base64");
  const plan = await page.evaluate(async function (b) {
    const z = await JSZip.loadAsync(b, { base64: true });
    return JSON.parse(await z.file("plan-config.json").async("string")).plan;
  }, b64);
  await page.evaluate(function () { const m = document.getElementById("kta-planner-modal"); if (m) m.remove(); });
  return { b64: b64, plan: plan };
}

async function apresChargement(page) {
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window._currentLoadedPlanId; }, 30000);
  await page.waitForTimeout(2000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) k.click(); else m.remove(); }
    if (window.getTrackingActif && window.getTrackingActif()) window.stopTracking();
  });
}

// Ouvre le ZIP (base64) dans l'app, gardé dans la liste des plans.
async function ouvrirZip(page, b64, nomFichier) {
  await page.evaluate(async function (a) {
    const z = Uint8Array.from(atob(a.b), function (c) { return c.charCodeAt(0); });
    await window.chargerZipFichier(new File([z], a.n, { type: "application/zip" }), "auto", { storeBlob: true });
  }, { b: b64, n: nomFichier });
  await apresChargement(page);
}

// Vue 3D ouverte au centre du plan → { rendu, bouton, lu } puis fermée (sauf `garder`).
async function rendu3D(page, garder) {
  return page.evaluate(async function (garder) {
    if (!window.KtaVue3D) await window.ktaChargerVue3D();
    const K = window.KtaVue3D;
    if (K.etat().ouvert) await K.fermer();
    await K.ouvrir({ depart: { x: 500, y: 400, cap: 0, niveau: 0 }, commandes: "pave" });
    for (let i = 0; i < 20; i++) await new Promise(function (r) { requestAnimationFrame(r); });
    const b = document.querySelector(".kta-v3d-btn-rendu");
    const r = { ouvert: K.etat().ouvert, rendu: K.etat().rendu, bouton: b ? b.dataset.rendu : null,
      lu: window.getRenduVue3D(), choix: window.getPlanRenduVue3D() };
    if (!garder) await K.fermer();
    return r;
  }, !!garder);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 }, acceptDownloads: true });
  await page.route(/tile\.openstreetmap\.org/, function (r) { return r.abort(); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("pageerror", function (e) { erreursConsole.push("pageerror : " + e.message); });
  page.on("console", function (m) {
    if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|Licence-pro\.json|404/i.test(m.text())) {
      erreursConsole.push(m.text());
    }
  });
  const dossier = fs.mkdtempSync(path.join(require("os").tmpdir(), "kta-r3d-"));
  try {
    await accueil(page);

    // ── A. Générateur ──
    console.log("\n══ Générateur ══");
    await page.evaluate(function () { window.afficherPlanner(); });
    await attendre(page, function () { return !!document.getElementById("pl_rendu3d"); }, 10000);
    const neuf = await page.evaluate(function () {
      const s = document.getElementById("pl_rendu3d");
      return { valeur: s.value, options: Array.prototype.map.call(s.options, function (o) { return o.value; }),
        libelles: Array.prototype.map.call(s.options, function (o) { return o.textContent.trim(); }),
        etiquette: (document.querySelector('label[for="pl_rendu3d"]') || {}).textContent };
    });
    verifier(neuf.valeur === "mixte" && JSON.stringify(neuf.options) === JSON.stringify(["mixte", "structures", "galerie"]) &&
      /Rendu 3D par défaut/.test(neuf.etiquette || ""),
      "Générateur neuf : « Rendu 3D par défaut », Mixte présélectionné, 3 choix", neuf);
    const zSans = ecrireZip(dossier, "fictif-sans-rendu", await fabriquerZip(page, "Plan fictif rendu absent"));
    verifier(await deposerAuGenerateur(page, zSans) === "mixte", "ZIP sans le champ déposé : Mixte");
    await page.selectOption("#pl_rendu3d", "galerie");
    await capture(page, "generateur-galerie");
    const gen = await generer(page);
    verifier(gen.plan.vue3dRendu === "galerie", "ZIP généré avec Galerie : plan.vue3dRendu = \"galerie\"", gen.plan);
    const zGal = ecrireZip(dossier, "fictif-galerie", gen.b64);
    verifier(await deposerAuGenerateur(page, zGal) === "galerie", "ZIP « Galerie » redéposé : Galerie reprise");
    await page.selectOption("#pl_rendu3d", "mixte");
    const genMixte = await generer(page);
    verifier(!("vue3dRendu" in genMixte.plan), "Mixte au Générateur : champ absent (JSON inchangé)", genMixte.plan);
    const zInv = ecrireZip(dossier, "fictif-invalide", await fabriquerZip(page, "Plan fictif rendu invalide", "plafond"));
    verifier(await deposerAuGenerateur(page, zInv) === "mixte", "ZIP à valeur inconnue déposé : Mixte");
    await page.evaluate(function () { const m = document.getElementById("kta-planner-modal"); if (m) m.remove(); });

    // ── B. Plan « Galerie » ouvert ──
    console.log("\n══ Plan généré « Galerie » ══");
    await ouvrirZip(page, gen.b64, "fictif-galerie.zip");
    const pidGal = await page.evaluate(function () { return window._currentLoadedPlanId; });
    let r = await rendu3D(page, true);
    verifier(r.ouvert && r.rendu === "galerie" && r.bouton === "galerie" && r.choix === null,
      "vue 3D ouverte en Galerie (bouton compris), aucun choix retenu", r);
    await capture(page, "vue3d-galerie");

    // ── C. Choix à l'interrupteur, puis rechargement ──
    console.log("\n══ Choix de l'utilisateur ══");
    await page.evaluate(function () { document.querySelector(".kta-v3d-btn-rendu").click(); });
    await page.waitForTimeout(800);
    r = await page.evaluate(function () {
      return { rendu: window.KtaVue3D.etat().rendu, choix: window.getPlanRenduVue3D(),
        plan: window.PLAN_CONFIG.plan.vue3dRendu };
    });
    verifier(r.rendu === "mixte" && r.choix === "mixte" && r.plan === "galerie",
      "interrupteur touché : Mixte retenu, le plan-config dit toujours Galerie", r);
    await page.evaluate(async function () { await window.KtaVue3D.fermer(); });
    r = await rendu3D(page);
    verifier(r.rendu === "mixte", "vue 3D rouverte : le choix l'emporte (Mixte)", r);
    await accueil(page);
    await page.evaluate(function (id) { window.chargerPlanDuRegistre(id); }, pidGal);
    await apresChargement(page);
    r = await rendu3D(page);
    const planGal = await page.evaluate(function () { return window.PLAN_CONFIG.plan.vue3dRendu; });
    verifier(r.rendu === "mixte" && r.choix === "mixte" && planGal === "galerie",
      "page rechargée, plan rouvert de la liste : le choix l'emporte toujours (Mixte, plan-config Galerie)",
      { r: r, plan: planGal });

    // ── D. Plan sans le champ, valeurs inconnues ──
    console.log("\n══ Repli Mixte ══");
    await ouvrirZip(page, await fabriquerZip(page, "Plan fictif rendu absent 2"), "fictif-sans-rendu-2.zip");
    r = await rendu3D(page);
    verifier(r.rendu === "mixte" && r.lu === "mixte" && r.choix === null, "plan sans le champ : Mixte", r);
    for (const v of ["plafond", "Galerie"]) {
      await ouvrirZip(page, await fabriquerZip(page, "Plan fictif rendu " + v, v), "fictif-" + v + ".zip");
      r = await rendu3D(page);
      verifier(r.rendu === "mixte" && r.lu === "mixte", "valeur inconnue « " + v + " » : Mixte", r);
    }
    // Structures au plan-config (ce plan, sans choix) : lu tel quel.
    await ouvrirZip(page, await fabriquerZip(page, "Plan fictif rendu structures", "structures"), "fictif-structures.zip");
    r = await rendu3D(page);
    verifier(r.rendu === "structures" && r.choix === null, "plan-config Structures : vue 3D en Structures", r);

  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
    try { fs.rmSync(dossier, { recursive: true, force: true }); } catch (e) { /* dossier temporaire */ }
  }
  if (erreursConsole.length) erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — rendu 3D par défaut : Générateur, plan ouvert, choix retenu, repli Mixte.");
})();
