#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-sans-collision.js — checkup (Playwright) : l'image de collision n'est plus ni produite ni lue
// =====================================================================
// Sur le relevé fictif de l'index, un « ancien plan » est fabriqué dans la page : son plan-config porte
// `plan.collisionImage` et son ZIP embarque l'image, toute rouge (= tout serait refusé par le test de collision
// du traceur) et nommée pour passer avant l'image du plan dans l'ordre alphabétique. Attendu :
//   1. Générateur : plus de champ d'image de collision ; l'ancien ZIP repris en mode Modifier produit un ZIP sans
//      `collisionImage` ni image de collision, avec la bonne image de base ; ce ZIP s'ouvre ;
//   2. l'ancien ZIP s'ouvre : aucun chargement de collision (initCollisionMap ni canvas), image non résolue, et le
//      traceur n'a plus de test d'image (ktaEstAccessible absent : le pas n'est arrêté que par les structures) ;
//   3. le plan serveur dont le plan-config porte `collisionImage` s'ouvre sans aucune requête vers l'image, et le
//      manifeste hors ligne (PlanOffline.listerUrls) ne la liste pas ;
// et aucune erreur console ni JavaScript. 🩸 Le plan-config du site est modifié en vol (page.route), jamais sur disque.
// Usage : node scripts/smoke/checkup-sans-collision.js (SMOKE_PORT, KTA_MOTEURS=webkit) · doc : data-formats.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
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
const NOM_COLL = "0-collision-checkup.png";
const CHEMIN_COLL = "data/" + NOM_COLL;
// Même bruit toléré que smoke.js, plus la sonde des icônes d'un plan serveur (config.js > resoudreIconesPlanServeur).
const BRUIT = [/version\.json|ping\.html|live-config/i, /favicon/i, /Licence-pro\.json/i, /data\/reglages\.json/i,
  /\/data\/[^/]+\/icon\/[^/]+$/];

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function accueil(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  // Espion : un appel par son nom passe par la globale, donc par ce remplaçant.
  await page.evaluate(function () {
    window.__ckAppels = 0;
    const f = window.initCollisionMap;
    if (typeof f === "function") window.initCollisionMap = function () { window.__ckAppels++; return f.apply(this, arguments); };
  });
}

async function etatPlan(page) {
  return page.evaluate(function (chemin) {
    return {
      ouvert: !!window.PLAN_CONFIG && !!window.map,
      appels: window.__ckAppels,
      canvas: !!window.collisionCanvas,
      resolue: !!window.getRuntimeAssetUrl(chemin),
      sansTestImage: typeof window.ktaEstAccessible === "undefined" && typeof window.initCollisionMap === "undefined"
    };
  }, CHEMIN_COLL);
}

async function ouvrirZip(page, b64, nom) {
  // Sans attendre la promesse : une question posée à l'import la laisserait pendante ; l'attente ci-dessous tranche.
  await page.evaluate(function (a) {
    const bin = Uint8Array.from(atob(a.b64), function (c) { return c.charCodeAt(0); });
    window.chargerZipFichier(new File([bin], a.nom, { type: "application/zip" }), "auto");
  }, { b64: b64, nom: nom });
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.APP_CONFIG; }, 30000);
  await page.waitForTimeout(2000);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  // 🩸 Service Worker bloqué : sinon il sert lui-même plan-config et images, que page.route et l'écoute des requêtes
  // ne voient pas (le plan-config modifié en vol ne serait jamais servi).
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 }, acceptDownloads: true, serviceWorkers: "block" });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  const requetesColl = [];
  page.on("pageerror", function (e) { erreurs.push("pageerror: " + String(e && e.message)); });
  page.on("console", function (m) {
    if (m.type() !== "error") return;
    const txt = m.text() + " " + ((m.location() && m.location().url) || "");
    if (!BRUIT.some(function (re) { return re.test(txt); })) erreurs.push(txt.slice(0, 200));
  });
  // Toute image de collision : la nôtre, ou celle que le plan-config du relevé fictif nommerait déjà.
  page.on("request", function (r) { if (/collision/i.test(r.url())) requetesColl.push(r.url()); });
  try {
    await accueil(page);

    // ── 0. L'« ancien plan » : ZIP du relevé fictif + collisionImage + image rouge embarquée ──
    const ancien = await page.evaluate(async function (a) {
      const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
      if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
      const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
      const zip = new JSZip();
      const chemins = [cfg.plan.baseImage]
        .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
        .concat(Object.keys(cfg.icons || {}).map(function (k) { return cfg.icons[k]; }))
        .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
      for (const p of Array.from(new Set(chemins))) {
        const r = await fetch(window.resolveServerPath(p, srv.path));
        if (r.ok) zip.file(p, await r.blob());
      }
      const cv = document.createElement("canvas");
      cv.width = 64; cv.height = 64;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 64, 64);
      zip.file(a.chemin, await new Promise(function (ok) { cv.toBlob(ok, "image/png"); }));
      cfg.plan.collisionImage = a.chemin;
      delete cfg.tiling; delete cfg.plan.tiledV2;   // rendu image seule : le ZIP n'embarque pas les tuiles
      zip.file("plan-config.json", JSON.stringify(cfg));
      const blob = await zip.generateAsync({ type: "blob" });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { ok: true, b64: btoa(s), base: String(cfg.plan.baseImage).split("/").pop(), srvId: srv.id, srvPath: srv.path };
    }, { chemin: CHEMIN_COLL });
    if (!ancien.ok) throw new Error(ancien.raison);
    ok("ancien plan fabriqué : plan-config avec collisionImage, image de collision rouge dans le ZIP");

    // ── 1. Générateur : pas de champ, l'ancien ZIP repris ne transmet pas l'image de collision ──
    await page.evaluate(function () { window.afficherPlanner(); });
    await attendre(page, function () { return !!document.getElementById("kta-planner-zip-input"); }, 10000);
    const champ = await page.evaluate(function () {
      return { input: !!document.getElementById("pl_collision"), nom: !!document.getElementById("pl_collision_nom") };
    });
    verifier(!champ.input && !champ.nom, "Générateur : aucun champ d'image de collision", champ);
    await page.setInputFiles("#kta-planner-zip-input",
      { name: "ancien.zip", mimeType: "application/zip", buffer: Buffer.from(ancien.b64, "base64") });
    await attendre(page, function () {
      const n = document.getElementById("pl_name");
      return !!n && n.value.length > 0 && /📄/.test((document.getElementById("pl_baseImage_nom") || {}).textContent || "");
    }, 30000);
    // Autre nom : le même nom qu'un plan déjà importé ferait poser la question du doublon à l'import.
    await page.evaluate(function () {
      const c = document.getElementById("pl_tilingV2"); if (c && c.checked) c.click();
      const n = document.getElementById("pl_name"); n.value = n.value + " (généré)";
      n.dispatchEvent(new Event("input", { bubbles: true })); n.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      page.evaluate(function () { document.getElementById("kta-planner-generer").click(); })
    ]);
    const b64Gen = fs.readFileSync(await dl.path()).toString("base64");
    const zipGen = await page.evaluate(async function (a) {
      const z = await JSZip.loadAsync(Uint8Array.from(atob(a.b64), function (c) { return c.charCodeAt(0); }));
      const cfg = JSON.parse(await z.file("plan-config.json").async("string"));
      const noms = Object.keys(z.files);
      return {
        champ: Object.prototype.hasOwnProperty.call(cfg.plan, "collisionImage"),
        fichier: noms.filter(function (n) { return /collision/i.test(n); }),
        base: String(cfg.plan.baseImage || "").split("/").pop(),
        baseEmbarquee: !!z.file(cfg.plan.baseImage)
      };
    }, { b64: b64Gen });
    verifier(!zipGen.champ, "ZIP généré : plan-config sans collisionImage", zipGen);
    verifier(zipGen.fichier.length === 0, "ZIP généré : aucune image de collision embarquée", zipGen.fichier);
    verifier(zipGen.base === ancien.base && zipGen.baseEmbarquee,
      "ZIP généré : l'image de base est celle du plan-config, pas l'ancienne image de collision", zipGen);
    await page.evaluate(function () { const m = document.getElementById("kta-planner-modal"); if (m) m.remove(); });
    await ouvrirZip(page, b64Gen, "genere.zip");
    const gen = await etatPlan(page);
    verifier(gen.ouvert && gen.appels === 0 && !gen.canvas, "ZIP généré : le plan s'ouvre, sans chargement de collision", gen);

    // ── 2. L'ancien ZIP s'ouvre : le champ est ignoré ──
    await accueil(page);
    await ouvrirZip(page, ancien.b64, "ancien.zip");
    const old = await etatPlan(page);
    verifier(old.ouvert, "ancien ZIP (collisionImage dans le plan-config) : le plan s'ouvre", old);
    verifier(old.appels === 0 && !old.canvas && !old.resolue,
      "ancien ZIP : initCollisionMap jamais appelé, aucun canvas, image non résolue", old);
    verifier(old.sansTestImage, "ancien ZIP : le traceur ne lit pas l'image rouge (aucun test d'image exposé)", old);

    // ── 3. Plan serveur dont le plan-config porte collisionImage (modifié en vol) ──
    await page.route("**/plan-config.json", async function (route) {
      if (route.request().url().indexOf(ancien.srvPath + "/plan-config.json") < 0) return route.continue();
      const r = await route.fetch();
      const cfg = JSON.parse(await r.text());
      cfg.plan.collisionImage = CHEMIN_COLL;
      return route.fulfill({ response: r, body: JSON.stringify(cfg), headers: Object.assign({}, r.headers(), { "content-type": "application/json" }) });
    });
    await accueil(page);
    await page.evaluate(function (id) { return window.chargerPlanDuRegistre(id); }, ancien.srvId);
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.APP_CONFIG; }, 30000);
    await page.waitForTimeout(3000);
    const srv = await page.evaluate(async function (a) {
      const plan = window.PlanRegistry.findById(a.id);
      const liste = window.PlanOffline ? await window.PlanOffline.listerUrls(plan) : null;
      const urls = liste && liste.urls;
      return {
        porte: !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.collisionImage),
        appels: window.__ckAppels, canvas: !!window.collisionCanvas,
        manifeste: Array.isArray(urls) ? urls.filter(function (u) { return /collision/i.test(String(u)); }) : "PlanOffline absent",
        nUrls: Array.isArray(urls) ? urls.length : 0,
        cfgListe: !!(liste && liste.cfg && liste.cfg.plan && String(liste.cfg.plan.collisionImage || "").indexOf(a.nom) >= 0),
        servi: !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan && String(window.PLAN_CONFIG.plan.collisionImage || "").indexOf(a.nom) >= 0)
      };
    }, { id: ancien.srvId, nom: NOM_COLL });
    verifier(srv.servi && srv.cfgListe, "plan serveur : le plan-config servi porte bien le collisionImage injecté (cas testé réel)", srv);
    verifier(srv.appels === 0 && !srv.canvas, "plan serveur : le plan s'ouvre sans chargement de collision", srv);
    verifier(Array.isArray(srv.manifeste) && srv.manifeste.length === 0 && srv.nUrls > 0 && srv.cfgListe,
      "plan serveur : le manifeste hors ligne ne liste pas l'image de collision", srv);
    verifier(requetesColl.length === 0, "aucune requête vers l'image de collision", requetesColl);
    verifier(erreurs.length === 0, "aucune erreur console ni JavaScript", erreurs.slice(0, 5));
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — image de collision : ni produite par le Générateur, ni lue au chargement");
})();
