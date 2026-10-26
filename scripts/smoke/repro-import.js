#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// repro-import.js — reproduction manuelle : l'import d'un profil complet ne doit pas rester bloqué
// sur « Import en cours ». Flux : seed d'un plan + blob IDB → buildProfileArchive → registre vidé
// (appareil neuf) → ouvrirImportModale(File) → Importer → progression du bouton, timeout 30 s.
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const PORT = 8124;
const BASE = "http://127.0.0.1:" + PORT;

const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

(async function main() {
  process.env.SMOKE_PORT = String(PORT);
  const http = require("http");
  const fs = require("fs");
  const path = require("path");
  const RACINE = path.resolve(__dirname, "..", "..");
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
                 ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };
  const server = http.createServer(function (req, res) {
    const url = decodeURIComponent(req.url.split("?")[0]);
    let fp = path.join(RACINE, url === "/" ? "index.html" : url);
    if (!fp.startsWith(RACINE) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    fs.createReadStream(fp).pipe(res);
  }).listen(PORT);

  const nav = await chromium.launch();
  const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", function (m) { console.log("  [console:" + m.type() + "] " + m.text().slice(0, 200)); });
  page.on("pageerror", function (e) { console.log("  [PAGEERROR] " + e.message); });

  await page.addInitScript(function (pregates) {
    Object.keys(pregates).forEach(function (k) { localStorage.setItem(k, pregates[k]); });
  }, LS_PREGATES);

  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  console.log("— app bootée, seed du plan + blob…");

  const resultat = await page.evaluate(async function () {
    const log = [];
    try {
      // 1. Seed : un plan local storedBlob + son blob en IDB
      window.PlanRegistry.addOrUpdate({ id: "repro_plan", type: "local", name: "Plan Repro",
        storedBlob: true, fileSize: 3000, originalFilename: "repro.zip" });
      const contenu = new Uint8Array(3000).fill(65);
      const r1 = await window.PlanRegistry.saveBlob("repro_plan", new Blob([contenu], { type: "application/zip" }));
      log.push("saveBlob seed: " + JSON.stringify(r1));

      // 2. Export conteneur
      const arch = await window.ProfileExportImport.buildProfileArchive({ include: {}, planIds: ["repro_plan"] });
      log.push("buildProfileArchive: nb=" + arch.nb + " sautes=" + arch.sautes.length + " taille=" + arch.blob.size);

      // 3. Plan ET blob retirés : scénario « appareil neuf »
      window.PlanRegistry.remove("repro_plan");
      log.push("plan + blob purgés");

      // 4. Import : ouvrirImportModale avec un File reconstruit
      const fichier = new File([arch.blob], "myktamap_profil_complet_test.zip", { type: "application/zip" });
      await window.ProfileExportImport.ouvrirImportModale(fichier);
      log.push("modale import ouverte");
      return { ok: true, log: log };
    } catch (e) {
      log.push("EXCEPTION: " + (e && e.message));
      return { ok: false, log: log };
    }
  });
  resultat.log.forEach(function (l) { console.log("  • " + l); });
  if (!resultat.ok) { console.log("❌ échec avant la modale"); process.exit(1); }

  const ligneArch = await page.locator("#kta-profile-import-archives").count();
  console.log("— case archives présente : " + (ligneArch ? "OUI" : "NON ← problème"));

  await page.click("#kta-profile-import-go");
  console.log("— clic Importer, observation…");
  const debut = Date.now();
  let dernier = "";
  while (Date.now() - debut < 30000) {
    const btn = await page.locator("#kta-profile-import-go").count();
    const texte = btn ? await page.locator("#kta-profile-import-go").textContent() : "(bouton disparu)";
    if (texte !== dernier) { console.log("  [" + Math.round((Date.now() - debut) / 100) / 10 + "s] bouton = " + texte.trim()); dernier = texte; }
    const done = await page.locator("#kta-profile-import-done-modal").count();
    if (done) { console.log("✅ modale de FIN affichée à " + Math.round((Date.now() - debut) / 100) / 10 + "s"); break; }
    await page.waitForTimeout(250);
  }
  if (Date.now() - debut >= 30000) console.log("❌ TIMEOUT 30 s — le blocage est reproduit");

  const verif = await page.evaluate(async function () {
    const p = window.PlanRegistry.findById("repro_plan");
    const b = await window.PlanRegistry.getBlob("repro_plan");
    return { entree: !!p, storedBlob: !!(p && p.storedBlob), blobOctets: b ? b.size : 0 };
  });
  console.log("— vérif : entrée=" + verif.entree + " storedBlob=" + verif.storedBlob + " blob=" + verif.blobOctets + " octets");

  await nav.close();
  server.close();
})().catch(function (e) { console.error("ERREUR HARNAIS:", e); process.exit(1); });
