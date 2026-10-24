#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-rails-toucher.js — checkup (Playwright) : zone de toucher des rails latéraux de la carte
// =====================================================================
// Parcours : relevé fictif en téléphone tactile (390 × 844 et 844 × 390 paysage, pointer: coarse) puis PC 1280
// (souris). Rails = boutons `.leaflet-bar a` des coins gauche et droit, marque de 36 × 36 px (décision produit :
// la surface utile de la carte passe avant la taille des boutons).
// Attendu au doigt : marque inchangée (36 px ; 30 en paysage bas) ; zone de toucher (sondée par elementFromPoint)
// 44 px de large en portrait ; aucune zone ne déborde sur un bouton voisin (rails empilés sans interstice : pas
// d'extension verticale) ; paysage bas et souris : zone = marque. Captures dans $RAILS_SHOTS (facultatif).
// Usage : node scripts/smoke/checkup-rails-toucher.js (SMOKE_PORT pour une autre copie) · doc : ui.md
// =====================================================================
"use strict";

const path = require("path");
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const SHOTS = process.env.RAILS_SHOTS || "";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};
const FORMATS = [
  { nom: "téléphone 390", viewport: { width: 390, height: 844 }, tactile: true, marque: 36, zone: 44 },
  // Paysage bas : pilules de 30 px en ligne, à overflow: hidden ; aucune extension possible sans voisin mordu.
  { nom: "téléphone paysage 844", viewport: { width: 844, height: 390 }, tactile: true, marque: 30, zone: 30 },
  { nom: "PC 1280", viewport: { width: 1280, height: 800 }, tactile: false, marque: 36, zone: 36 }
];

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Dans la page : pour chaque bouton visible des rails, marque et étendue de la zone de toucher, sondée au pixel
// sur sa ligne médiane (horizontale) et sa colonne médiane (verticale).
function mesurer() {
  const boutons = Array.from(document.querySelectorAll(".leaflet-left .leaflet-bar a, .leaflet-right .leaflet-bar a"))
    .filter(function (a) { const r = a.getBoundingClientRect(); return a.offsetParent && r.width > 0 && r.height > 0; });
  const appartient = function (x, y, a) {
    const e = document.elementFromPoint(x, y);
    return !!e && (e === a || a.contains(e));
  };
  return boutons.map(function (a, i) {
    const r = a.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    let g = cx, d = cx, h = cy, b = cy;
    while (g > cx - 40 && appartient(g - 1, cy, a)) g--;
    while (d < cx + 40 && appartient(d + 1, cy, a)) d++;
    while (h > cy - 40 && appartient(cx, h - 1, a)) h--;
    while (b < cy + 40 && appartient(cx, b + 1, a)) b++;
    return { i: i, titre: (a.title || a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 24),
      w: Math.round(r.width), h: Math.round(r.height), zoneL: d - g + 1, zoneH: b - h + 1,
      centreAtteint: appartient(cx, cy, a) };
  });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const erreurs = [];
  try {
    for (const f of FORMATS) {
      console.log("\n▶ " + f.nom);
      const ctx = await nav.newContext({ viewport: f.viewport, hasTouch: f.tactile, isMobile: f.tactile,
        deviceScaleFactor: f.tactile ? 2 : 1 });
      const page = await ctx.newPage();
      page.on("pageerror", function (e) { erreurs.push(f.nom + " : " + String(e && e.message)); });
      await page.addInitScript(function (ls) {
        for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
      }, LS_PREGATES);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await attendre(page, function () {
        return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
          window.PlanRegistry.getAll().some(function (p) { return /fictif/i.test(p.name || ""); });
      }, 20000);
      await page.waitForTimeout(1500);
      await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
      await page.evaluate(function () {
        const p = window.PlanRegistry.getAll().find(function (x) { return /fictif/i.test(x.name || ""); });
        window.chargerPlanDuRegistre(p.id);
      });
      await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map; }, 40000);
      await page.waitForTimeout(2500);
      const coarse = await page.evaluate(function () { return matchMedia("(pointer: coarse)").matches; });
      verifier(coarse === f.tactile, "pointer: coarse = " + f.tactile);
      if (SHOTS) {
        await page.screenshot({ path: path.join(SHOTS, "rails-" + f.viewport.width + ".png") });
        // Bords des rails côté carte, en gros plan : un débord visible (bande, coin carré) s'y verrait.
        const W = f.viewport.width;
        await page.screenshot({ path: path.join(SHOTS, "rails-" + W + "-gauche.png"), clip: { x: 0, y: 40, width: 90, height: 260 } });
        await page.screenshot({ path: path.join(SHOTS, "rails-" + W + "-droite.png"), clip: { x: W - 90, y: 40, width: 90, height: 260 } });
      }

      const m = await page.evaluate(mesurer);
      verifier(m.length >= 6, m.length + " boutons de rail visibles");
      // Hauteur + 1 : le séparateur de 1 px entre deux groupes.
      const marques = m.filter(function (x) { return x.w !== f.marque || x.h < f.marque - 1 || x.h > f.marque + 1; });
      verifier(marques.length === 0, "marque inchangée : " + f.marque + " px", marques.slice(0, 3));
      verifier(m.every(function (x) { return x.centreAtteint; }), "le centre de chaque bouton le touche");
      const larges = m.filter(function (x) { return x.zoneL !== f.zone; });
      verifier(larges.length === 0, "zone de toucher " + f.zone + " px de large", larges.slice(0, 3));
      // Sans interstice entre deux boutons, une zone plus haute que la marque mordrait sur le voisin.
      const debords = m.filter(function (x) { return x.zoneH > x.h; });
      verifier(debords.length === 0, "aucune zone ne déborde sur un bouton voisin", debords.slice(0, 3));
      if (f.tactile) console.log("    zones : " + m.map(function (x) { return x.zoneL + "×" + x.zoneH; }).join(" "));
      await ctx.close();
    }
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
  console.log("🎉 CHECKUP VERT — rails à 36 px visibles, 44 px de large au doigt, sans chevauchement.");
  process.exit(0);
})();
