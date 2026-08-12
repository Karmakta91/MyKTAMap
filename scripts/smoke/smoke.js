#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔥 smoke.js — SMOKE NAVIGATEUR (Playwright) — le garde-fou qui CLIQUE
// =====================================================================
// Né après 3 erreurs runtime en une semaine (ReferenceError `saved` des
// Réglages, modale invisible par classe CSS fantôme, `tilesOverlay` hors
// portée) que les 14 garde-fous logiques ne pouvaient pas voir : aucun
// n'exécute l'app. Celui-ci boote l'app dans un vrai Chromium, ouvre les
// écrans, clique, et ÉCHOUE sur : toute erreur console, toute pageerror,
// tout warn « [I18n] Clé manquante », toute modale invisible.
//
// Usage : cd scripts/smoke && npm install && npm run smoke
// (premier install : télécharge Chromium ~130 Mo, une fois)
// Marche du RELEASE_GATE — lancé à la main avant release, pas en pre-commit
// (trop lent pour chaque commit).
// =====================================================================
"use strict";

const path = require("path");
const { chromium } = require("playwright");

const PORT = 8123;
const BASE = "http://127.0.0.1:" + PORT;

// Clés localStorage pré-posées pour passer les gates (valeurs lues dans le
// code : unlockGate.HASH_VALIDE, legalGate, tutorial).
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(cat, msg) { problemes.push("[" + cat + "] " + msg); console.log("  ❌ " + cat + " : " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }

// Bruit console toléré (réseau absent en local, live-config…) — liste COURTE
// et justifiée : tout ajout doit expliquer pourquoi ce n'est pas un bug.
const BRUIT_TOLERE = [
  /Failed to load resource.*(version\.json|ping\.html|live-config)/i,  // update-checker offline : dégradation prévue
  /favicon/i,
  /Licence-pro.json/i   // sonde proLicense au boot : 404 = instance community, comportement NOMINAL
];
function estBruit(txt) { return BRUIT_TOLERE.some(function (re) { return re.test(txt); }); }

(async function main() {
  const server = require("./server.js");
  const navigateur = await chromium.launch();
  const contexte = await navigateur.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } });
  const page = await contexte.newPage();

  page.on("response", function (r) {
    if (r.status() === 404 && !estBruit(r.url())) pb("404", r.url().replace(BASE, ""));
  });
  page.on("console", function (m) {
    const txt = m.text();
    if (/Failed to load resource/.test(txt)) return;   // doublon sans URL du handler response
    if (m.type() === "error" && !estBruit(txt)) pb("console.error", txt.slice(0, 200));
    if (m.type() === "warning" && /Clé manquante/.test(txt)) pb("i18n", txt.slice(0, 160));
  });
  page.on("pageerror", function (e) { pb("pageerror", String(e).slice(0, 220)); });

  await page.addInitScript(function (pregates) {
    for (const k in pregates) localStorage.setItem(k, pregates[k]);
  }, LS_PREGATES);

  async function modaleVisible(nom, selecteur) {
    // Une modale « présente mais invisible » (classe fantôme, display:none)
    // est EXACTEMENT le bug qu'on chasse : on exige des dimensions réelles.
    const el = page.locator(selecteur).last();
    try {
      await el.waitFor({ state: "visible", timeout: 4000 });
      const box = await el.boundingBox();
      if (!box || box.width < 40 || box.height < 40) { pb("modale", nom + " : présente mais dimensions nulles (" + JSON.stringify(box) + ")"); return false; }
      ok(nom + " visible (" + Math.round(box.width) + "×" + Math.round(box.height) + ")");
      return true;
    } catch (e) {
      pb("modale", nom + " : jamais visible (" + selecteur + ")");
      return false;
    }
  }
  async function fermerModales() {
    await page.keyboard.press("Escape").catch(function () {});
    // les modales de l'app ferment aussi au clic sur ✕ — on tente les visibles
    const boutons = await page.locator(".kta-panneau-close:visible").all();
    for (const b of boutons.reverse()) { await b.click({ timeout: 1000 }).catch(function () {}); }
    await page.waitForTimeout(250);
  }

  try {
    // ───────────────────────── 1. BOOT HOME ─────────────────────────
    console.log("— 1. Boot HOME —");
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);   // i18n + homeLoader async
    const titreVisible = await page.locator("#loaderTitle, .loader-title, .loader-header").first().isVisible().catch(function () { return false; });
    if (titreVisible) ok("HOME affiché"); else pb("boot", "HOME : aucun en-tête visible");
    // 🚨 La modale Alertes peut s'ouvrir au boot (annonce non lue) et
    // recouvrir le HOME — on la ferme comme un utilisateur (« J'ai compris »).
    const alerteOuverte = await page.locator("#kta-alert-modal").isVisible().catch(function () { return false; });
    if (alerteOuverte) {
      await page.evaluate(function () {
        const b = document.getElementById("kta-alert-ok") || document.querySelector("#kta-alert-modal .kta-panneau-close");
        if (b) b.click();
      });
      await page.waitForTimeout(400);
      const encore = await page.locator("#kta-alert-modal").isVisible().catch(function () { return false; });
      if (encore) pb("boot", "la modale Alertes ne se ferme pas"); else ok("modale Alertes fermée (annonce au boot)");
    }
    const planListe = await page.getByText("Relevé fictif de test", { exact: false }).first().isVisible().catch(function () { return false; });
    if (planListe) ok("liste des plans peuplée (Relevé fictif de test)"); else pb("boot", "plan de test absent de la liste");

    // ─────────────────── 2. ⚙️ CONFIGURATION (HOME) ──────────────────
    console.log("— 2. ⚙️ Configuration HOME —");
    await page.locator("#loaderConfigBtn").click();
    await page.waitForTimeout(600);
    const modeDev = await page.locator("#kta-devmode-wrap").isVisible().catch(function () { return false; });
    if (modeDev) ok("section Mode Développeur présente"); else pb("config", "section Mode Développeur absente/invisible");
    await page.evaluate(function () { const b = document.getElementById("loaderConfigClose"); if (b) b.click(); });
    await page.waitForTimeout(300);
    const configFermee = await page.locator("#loaderConfigModal").isVisible().catch(function () { return false; });
    if (configFermee) pb("config", "la modale Configuration ne se ferme pas"); else ok("Configuration fermée");

    // ───────────── 3. 📊 ÉDITEUR DE DONNÉES + modale résolution ─────────────
    console.log("— 3. Éditeur de données —");
    const edOk = await page.evaluate(function () {
      if (typeof window.ouvrirTableEditor === "function") { window.ouvrirTableEditor(); return true; }
      return false;
    });
    if (!edOk) pb("editeur", "window.ouvrirTableEditor indisponible");
    await page.waitForTimeout(500);
    await modaleVisible("accueil éditeur", "#kta-tbl-modal");
    await page.locator("#kta-tbl-src-resol").click();
    // LA modale qui fut invisible (classe CSS fantôme) : dimensions exigées
    await modaleVisible("convertisseur de résolution", ".kta-readme-modal-overlay:has(#kta-tbl-resol-go)");
    await fermerModales();   // convertisseur
    await page.evaluate(function () { const b = document.getElementById("kta-tbl-close-accueil"); if (b) b.click(); });
    await page.waitForTimeout(300);
    const overlayRestant = await page.locator(".kta-readme-modal-overlay:visible").count();
    if (overlayRestant > 0) {
      const ids = await page.locator(".kta-readme-modal-overlay:visible").evaluateAll(function (els) { return els.map(function (e) { return e.id || e.className; }); });
      pb("editeur", overlayRestant + " overlay(s) encore visible(s) : " + ids.join(" | "));
    }
    else ok("tous les overlays fermés");

    // ───────────────────── 4. CHARGER LE PLAN DE TEST ─────────────────────
    console.log("— 4. Chargement du plan Relevé fictif de test —");
    await page.getByText("Relevé fictif de test", { exact: false }).first().click();
    await page.waitForFunction(function () { return !!window.PLAN_CONFIG && !!document.getElementById("map"); }, null, { timeout: 15000 })
      .then(function () { ok("plan chargé (PLAN_CONFIG posé, #map présent)"); })
      .catch(function () { pb("plan", "le plan ne s'est pas chargé en 15 s"); });
    await page.waitForTimeout(2500);   // rendu calques + restore session

    // ───────────────── 5. ⚙️ RÉGLAGES (le ReferenceError `saved`) ─────────────────
    console.log("— 5. ⚙️ Réglages carte —");
    const ouvert = await page.evaluate(function () {
      if (typeof window.afficherConfig === "function") { window.afficherConfig(); return true; }
      return false;
    });
    if (ouvert) {
      await modaleVisible("⚙️ Réglages", "#kta-cfg-modal");
      // le bouton du bug `saved` : présent = la section géoref s'est construite
      const estimer = await page.locator("#cfg_kmz_B_estimer").count();
      if (estimer > 0) ok("section géoref construite (bouton Estimer B présent)");
      else pb("reglages", "bouton Estimer B absent — section géoref cassée ?");
      await fermerModales();
    } else pb("reglages", "afficherConfig indisponible");

    // ───────────────────── 6. ≡ LÉGENDE ─────────────────────
    console.log("— 6. ≡ Légende —");
    const legendeOuverte = await page.evaluate(function () {
      if (typeof window.afficherLegende === "function") { window.afficherLegende(); return true; }
      return false;
    });
    if (legendeOuverte) { await modaleVisible("≡ Légende", ".kta-legende-modal, #kta-legende-modal, .kta-readme-modal-overlay"); await fermerModales(); }
    else console.log("  ℹ️ afficherLegende non exposée — étape sautée (non bloquant)");

    await page.waitForTimeout(800);   // laisser sortir les erreurs asynchrones
  } catch (e) {
    pb("smoke", "exception du scénario : " + String(e).slice(0, 300));
  } finally {
    await navigateur.close();
    server.close();
  }

  console.log("");
  if (problemes.length) {
    console.log("⚠️ SMOKE ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 SMOKE VERT — boot, modales, plan, Réglages, Légende : zéro erreur runtime.");
  process.exit(0);
})();
