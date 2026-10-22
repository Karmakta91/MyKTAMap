#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-icone-defaut.js — checkup (Playwright, pas un hook pré-commit) : icône d'un point sans tag
// =====================================================================
// Parcours réel : le relevé fictif devient un plan LOCAL (ZIP construit dans la page) dont le plan-config déclare
// encore `icons.default` = l'ancien pin Leaflet (ce qu'écrivaient les Générateurs d'avant). Attendu : un point
// sans tag et un point au tag inconnu s'affichent avec `icon/default.png` (window._ktaIconeDefaut), chargée,
// jamais avec le pin Leaflet ; aucune erreur de page.
// Usage : node scripts/smoke/checkup-icone-defaut.js (SMOKE_PORT pour une autre copie) · doc : rendering-leaflet.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
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
  const erreurs = [];
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
      cfg.icons = Object.assign({}, cfg.icons || {}, { default: "lib/leaflet/images/marker-icon.png" });
      const zip = new JSZip();
      zip.file("plan-config.json", JSON.stringify(cfg));
      const chemins = [cfg.plan.baseImage, cfg.plan.collisionImage]
        .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
        .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
      for (const p of Array.from(new Set(chemins))) {
        const r = await fetch(window.resolveServerPath(p, srv.path));
        if (r.ok) zip.file(p, await r.blob());
      }
      const blob = await zip.generateAsync({ type: "blob" });
      await window.chargerZipFichier(new File([blob], "fictif-defaut.zip", { type: "application/zip" }), "auto", { storeBlob: true });
      return { ok: true };
    });
    if (!ouvert.ok) throw new Error(ouvert.raison);
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window._iconMap; }, 30000);
    await page.waitForTimeout(2000);

    const etat = await page.evaluate(async function () {
      const c = window.map.getCenter();
      const pts = (window.getEditorPoints() || []).slice();
      const base = { x: Math.round(c.lng), y: Math.round(window.APP_CONFIG.imageHeight - c.lat), level: 0 };
      pts.push(Object.assign({ id: "Checkup sans tag", nom: "Checkup sans tag", tags: [] }, base));
      pts.push(Object.assign({ id: "Checkup tag inconnu", nom: "Checkup tag inconnu", tags: ["inconnu_checkup"] }, base,
        { x: base.x + 40 }));
      window.setEditorPoints(pts);
      if (window.renderEditorPoints) window.renderEditorPoints();
      await new Promise(function (r) { setTimeout(r, 1500); });
      const imgs = Array.from(document.querySelectorAll("img.kta-marker-img"))
        .filter(function (i) { return /default\.png$/.test(i.getAttribute("src") || ""); });
      return {
        defaut: window._ktaIconeDefaut, urlCarte: window._iconMap.default && window._iconMap.default._kta_iconUrl,
        imgs: imgs.length, charge: imgs.filter(function (i) { return i.complete && i.naturalWidth > 0; }).length,
        pinsLeaflet: document.querySelectorAll("img.leaflet-marker-icon[src*='marker-icon']").length +
          Array.from(document.querySelectorAll("img.kta-marker-img"))
            .filter(function (i) { return /marker-icon\.png$/.test(i.getAttribute("src") || ""); }).length
      };
    });
    verifier(etat.defaut === "icon/default.png", "window._ktaIconeDefaut = icon/default.png", etat);
    verifier(/default\.png$/.test(etat.urlCarte || ""), "l'icône `default` de la carte ignore l'ancien pin Leaflet", etat);
    verifier(etat.imgs >= 2 && etat.charge === etat.imgs, "point sans tag et tag inconnu : icon/default.png, chargée", etat);
    verifier(etat.pinsLeaflet === 0, "aucun pin Leaflet sur la carte", etat);
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
  console.log("🎉 CHECKUP VERT — un point sans tag (ou au tag inconnu) prend icon/default.png, jamais le pin Leaflet.");
  process.exit(0);
})();
