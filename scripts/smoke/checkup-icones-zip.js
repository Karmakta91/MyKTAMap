#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-icones-zip.js — checkup (Playwright, pas un hook pré-commit) : icônes personnalisées d'un plan ZIP
// =====================================================================
// Parcours réel : le relevé fictif de l'index devient un plan LOCAL (ZIP construit dans la page) qui embarque une
// icône personnalisée `icon/perso-checkup.png` pour le tag `pa` (déclarée dans `icons` et `iconsEmbarquees`).
// Attendu en mode plan : PLAN_CONFIG.icons.pa et l'icône de la carte pointent vers le ZIP (blob:), un point `pa`
// s'affiche avec ce fichier, AUCUN repli « icône introuvable » ; une icône de l'app (non embarquée) garde son chemin.
// 🩸 Le bug d'origine : config.js > cloneAndResolvePlanConfig ne résolvait pas `icons` → 404 → repli de map.js.
// Usage : node scripts/smoke/checkup-icones-zip.js (SMOKE_PORT pour une autre copie) · doc : rendering-leaflet.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const replis = [], erreurs = [];
  page.on("console", function (m) { if (/introuvable — repli/.test(m.text())) replis.push(m.text().slice(0, 120)); });
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

    const ouvert = await page.evaluate(async function () {
      const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
      if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
      const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
      // Icône personnalisée : un carré magenta, impossible à confondre avec le catalogue.
      const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
      const cx = cv.getContext("2d"); cx.fillStyle = "#ff00ff"; cx.fillRect(0, 0, 32, 32);
      const png = await new Promise(function (r) { cv.toBlob(r, "image/png"); });
      cfg.icons = Object.assign({}, cfg.icons || {}, { pa: "icon/perso-checkup.png", pc: "icon/pc.png" });
      cfg.iconsEmbarquees = ["icon/perso-checkup.png"];
      const zip = new JSZip();
      zip.file("plan-config.json", JSON.stringify(cfg));
      zip.file("icon/perso-checkup.png", png);
      const chemins = [cfg.plan.baseImage, cfg.plan.collisionImage]
        .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
        .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
      for (const p of Array.from(new Set(chemins))) {
        const r = await fetch(window.resolveServerPath(p, srv.path));
        if (r.ok) zip.file(p, await r.blob());
      }
      const blob = await zip.generateAsync({ type: "blob" });
      await window.chargerZipFichier(new File([blob], "fictif-icones.zip", { type: "application/zip" }), "auto", { storeBlob: true });
      return { ok: true };
    });
    if (!ouvert.ok) throw new Error(ouvert.raison);
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window._iconMap; }, 30000);
    await page.waitForTimeout(2000);

    const etat = await page.evaluate(async function () {
      const ic = window.PLAN_CONFIG.icons || {};
      const urlCarte = window._iconMap.pa && window._iconMap.pa._kta_iconUrl;
      // Un point `pa` posé au centre de la vue, puis l'<img> de son marqueur.
      const c = window.map.getCenter();
      const pts = (window.getEditorPoints() || []).slice();
      pts.push({ id: "Checkup icône", nom: "Checkup icône", x: Math.round(c.lng), y: Math.round(window.APP_CONFIG.imageHeight - c.lat),
                 tags: ["pa"], level: 0 });
      window.setEditorPoints(pts);
      if (window.renderEditorPoints) window.renderEditorPoints();
      await new Promise(function (r) { setTimeout(r, 1500); });
      const imgs = Array.from(document.querySelectorAll("img.kta-marker-img[data-kta-tag='pa']"));
      return {
        configPa: String(ic.pa || "").slice(0, 5), configPc: ic.pc,
        carte: String(urlCarte || "").slice(0, 5),
        imgs: imgs.length, imgBlob: imgs.filter(function (i) { return /^blob:/.test(i.getAttribute("src") || ""); }).length,
        charge: imgs.filter(function (i) { return i.complete && i.naturalWidth > 0; }).length
      };
    });
    verifier(etat.configPa === "blob:", "PLAN_CONFIG.icons.pa pointe vers le ZIP (blob:)", etat);
    verifier(etat.configPc === "icon/pc.png", "une icône de l'app non embarquée garde son chemin", etat);
    verifier(etat.carte === "blob:", "l'icône de la carte pour `pa` vient du ZIP", etat);
    verifier(etat.imgs > 0 && etat.imgBlob === etat.imgs && etat.charge === etat.imgs,
      "le point `pa` s'affiche avec l'icône personnalisée, chargée", etat);
    verifier(replis.length === 0, "aucun repli « icône introuvable »", replis.slice(0, 3));
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — les icônes personnalisées d'un ZIP s'affichent en mode plan.");
  process.exit(0);
})();
