#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-pdf-legende.js — checkup (Playwright) : taille de la légende posée sur un PDF de plan dense
// =====================================================================
// Parcours : relevé fictif gonflé EN MÉMOIRE au volume d'un plan dense réel (≈ 13 600 structures des 6 types,
// 884 zones, 97 tracés, 198 POI sur tous les tags du catalogue, un type personnalisé par catégorie), puis
// `MyKTAMapPdfExport.genererPdf` en A4 paysage / portrait, A3 et A0, tailles compacte, standard, grande. jsPDF
// est espionné (`addImage`, `save` neutralisé : rien n'est téléchargé) : la légende = l'image PNG posée sur le
// plan (JPEG). Attendu : la légende compacte tient dans un coin (≤ 30 % de la largeur et ≤ 40 % de la hauteur
// du plan), son texte reste entre 5 et 14 pt quel que soit le papier, compacte < standard < grande en surface.
// Rien n'est écrit dans data/ ni gardé : la session gonflée vit dans la page jetable.
// Usage : node scripts/smoke/checkup-pdf-legende.js (SMOKE_PORT pour une autre copie) · doc : exports.md §44.4
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
  "myktamap_tutorial_seen_v1": "1"
};
// Police du texte de la légende dans le canvas (exporter.js > _dessinerLegende > TAILLES, × scale 2).
const POLICE_PX = { compact: 22, standard: 28, large: 36 };
const MM_PAR_PT = 25.4 / 72;

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 850 } });
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
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
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.MyKTAMapPdfExport; }, 40000);
    await page.waitForTimeout(2500);

    // ── Gonflage en mémoire ──
    const volumes = await page.evaluate(function () {
      const pc = window.PLAN_CONFIG.plan;
      const W = pc.imageWidth || 4000, H = pc.imageHeight || 3000;
      let graine = 7;
      function alea() { graine = (graine * 16807) % 2147483647; return graine / 2147483647; }
      function carre(t) {
        const x = alea() * (W - 20), y = alea() * (H - 20), c = 4 + alea() * 8;
        return { type: t, points: [{ x: x, y: y }, { x: x + c, y: y }, { x: x + c, y: y + c }, { x: x, y: y + c }] };
      }
      function ligne(t) {
        const x = alea() * (W - 60), y = alea() * (H - 60);
        return { type: t, points: [{ x: x, y: y }, { x: x + 30, y: y + 10 }, { x: x + 50, y: y + 40 }] };
      }
      const LC = window.LegendCustomization;
      const cs = LC.addCustomEntry({ category: "structures", label: "Pilier maçonné", geometry: "polygon", fillColor: "#a0522d" });
      const cz = LC.addCustomEntry({ category: "zones", label: "Zone humide", fillColor: "#2e8b57" });
      const ct = LC.addCustomEntry({ category: "traces", label: "Galerie basse", lineColor: "#ff8800" });
      const st = [];
      for (let i = 0; i < 9040; i++) st.push(carre(i % 2 ? "pilier-1" : "pilier-2"));
      for (let i = 0; i < 3950; i++) st.push(i % 3 ? carre("mur") : ligne("mur-ligne"));
      for (let i = 0; i < 650; i++) st.push(ligne(i % 2 ? "front-1" : "front-2"));
      for (let i = 0; i < 40; i++) st.push(carre(cs));
      const zn = [];
      const tz = ["eau", "remblais", "effondrement", "inaccessible", cz];
      for (let i = 0; i < 884; i++) zn.push(carre(tz[i % tz.length]));
      const rd = [];
      const tr = ["principal", "secondaire", "chemin", ct];
      for (let i = 0; i < 97; i++) rd.push(ligne(tr[i % tr.length]));
      const tags = Object.keys(window._ktaBuiltinIconUrls || {}).filter(function (t) { return t !== "default"; });
      const pts = [];
      for (let i = 0; i < 198; i++) {
        pts.push({ name: "P" + i, x: alea() * W, y: alea() * H, tags: [tags[i % tags.length]] });
      }
      window.setStructures(st); window.setZones(zn); window.setRoads(rd); window.setEditorPoints(pts);
      return { structures: st.length, zones: zn.length, traces: rd.length, poi: pts.length, tags: tags.length };
    });
    ok("relevé fictif gonflé en mémoire : " + JSON.stringify(volumes));

    // ── Espion jsPDF : chaque PDF rend { page, plan (JPEG), legende (PNG + dimensions du canvas) } ──
    await page.evaluate(function () {
      const API = window.jspdf.jsPDF.API;
      const addImage0 = API.addImage;
      window.__pdfPoses = [];
      API.addImage = function (data, fmt, x, y, w, h) {
        window.__pdfPoses.push({ fmt: fmt, data: fmt === "PNG" ? data : null, x: x, y: y, w: w, h: h,
          pageW: this.internal.pageSize.getWidth(), pageH: this.internal.pageSize.getHeight() });
        return addImage0.apply(this, arguments);
      };
      API.save = function () { return this; };
    });

    async function mesurer(format, taille) {
      return page.evaluate(async function (a) {
        window.__pdfPoses = [];
        const parts = a.format.split("-");
        const def = { format: parts[0], orientation: parts[1] };
        await window.MyKTAMapPdfExport.genererPdf({
          formatKey: a.format, formatDef: def, scale: 0.25,
          incPoints: true, incRoads: true, incZones: true, incStructures: true, incBaseImage: true,
          imageLayers: {}, dataLayers: {}, incHeader: true, incLegende: true,
          legPosition: "bas-gauche", legSize: a.taille, legStyle: "print"
        });
        const plan = window.__pdfPoses.find(function (p) { return p.fmt === "JPEG"; });
        const leg = window.__pdfPoses.find(function (p) { return p.fmt === "PNG"; });
        if (!plan || !leg) return { manque: true };
        const im = new Image();
        await new Promise(function (r) { im.onload = r; im.onerror = r; im.src = leg.data; });
        return { planW: plan.w, planH: plan.h, legW: leg.w, legH: leg.h, pxW: im.naturalWidth, pxH: im.naturalHeight,
          dedans: leg.x >= plan.x - 0.01 && leg.y >= plan.y - 0.01 &&
            leg.x + leg.w <= plan.x + plan.w + 0.01 && leg.y + leg.h <= plan.y + plan.h + 0.01 };
      }, { format: format, taille: taille });
    }

    const surfaces = {};
    const cas = [
      ["a4-landscape", "compact"], ["a4-landscape", "standard"], ["a4-landscape", "large"],
      ["a4-portrait", "compact"], ["a3-landscape", "compact"], ["a0-landscape", "compact"]
    ];
    for (const c of cas) {
      const m = await mesurer(c[0], c[1]);
      const nom = c[0] + " " + c[1];
      if (m.manque) { pb(nom + " : légende ou plan absent du PDF"); continue; }
      const partW = m.legW / m.planW, partH = m.legH / m.planH;
      const pt = POLICE_PX[c[1]] * (m.legW / m.pxW) / MM_PAR_PT;
      surfaces[nom] = partW * partH;
      console.log("  · " + nom + " : légende " + m.legW.toFixed(0) + " × " + m.legH.toFixed(0) + " mm = " +
        Math.round(partW * 100) + " % × " + Math.round(partH * 100) + " % du plan (" +
        Math.round(partW * partH * 100) + " % de sa surface), texte " + pt.toFixed(1) + " pt");
      verifier(m.dedans, nom + " : légende entièrement sur le plan");
      verifier(pt >= 4.95 && pt <= 14, nom + " : texte lisible sans enfler avec le papier (5 à 14 pt)", pt.toFixed(1));
      // Hors bornes seulement au plancher de lisibilité (plan petit sur sa page).
      if (c[1] === "compact" && pt > 5.05) {
        verifier(partW <= 0.30 + 1e-6 && partH <= 0.40 + 1e-6,
          nom + " : légende compacte dans un coin (≤ 30 % de large, ≤ 40 % de haut)",
          { partW: partW.toFixed(2), partH: partH.toFixed(2) });
      }
    }
    verifier(surfaces["a4-landscape compact"] < surfaces["a4-landscape standard"] &&
      surfaces["a4-landscape standard"] < surfaces["a4-landscape large"],
      "compacte < standard < grande en surface (A4 paysage)");
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
  console.log("🎉 CHECKUP VERT — la légende d'un PDF de plan dense tient dans un coin, lisible à toute taille de papier.");
  process.exit(0);
})();
