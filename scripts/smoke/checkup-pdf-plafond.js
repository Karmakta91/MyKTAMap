#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-pdf-plafond.js — checkup (Playwright) : PDF dont la qualité dépasse la limite de canvas de l'appareil
// =====================================================================
// Parcours : relevé fictif ouvert avec un navigateur qui se présente comme un iPhone (ktaEstIos vrai, plafond
// 16,7 Mpx), modale 📄 PDF, qualité « Haute définition ». Le relevé fictif est petit : si × 2 tient sous le
// plafond, la valeur de la case est montée (× 8) pour que le plafond agisse. Attendu : PDF téléchargé, toast
// d'avertissement qui donne la résolution réellement produite ; en « Brouillon » (sous le plafond), aucun toast.
// Usage : node scripts/smoke/checkup-pdf-plafond.js (SMOKE_PORT pour une autre copie) · doc : exports.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IOS_MAX = 16777216;
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 850 }, userAgent: UA_IPHONE, acceptDownloads: true });
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
    verifier(await page.evaluate(function () { return window.ktaEstIos(); }), "le navigateur passe pour un iPhone");

    // Toasts déjà affichés (ouverture du plan) : seuls les nouveaux comptent.
    const toasts = function () {
      return Array.from(document.querySelectorAll("#kta-toasts .kta-toast-msg")).map(function (e) { return e.textContent; });
    };
    async function exporter(valeur, forcer) {
      const avant = (await page.evaluate(toasts)).length;
      await page.evaluate(function () { window.MyKTAMapPdfExport.afficherModale(); });
      await attendre(page, function () { return !!document.getElementById("kta-pdf-generer"); }, 5000);
      const facteur = await page.evaluate(function (a) {
        const pc = window.PLAN_CONFIG.plan;
        const el = document.querySelector('input[name="pdf_scale"][value="' + a.valeur + '"]');
        let f = parseFloat(a.valeur);
        if (a.forcer) while (pc.imageWidth * pc.imageHeight * f * f <= a.max) f *= 2;
        el.value = String(f);
        el.checked = true;
        return f;
      }, { valeur: valeur, forcer: forcer, max: IOS_MAX });
      const tel = page.waitForEvent("download", { timeout: 120000 });
      await page.click("#kta-pdf-generer");
      const fichier = await tel;
      await attendre(page, function () { return !document.getElementById("kta-pdf-modal"); }, 30000);
      await page.waitForTimeout(800);
      return { facteur: facteur, nom: fichier.suggestedFilename(), nouveaux: (await page.evaluate(toasts)).slice(avant) };
    }

    const hd = await exporter("2", true);
    const msg = hd.nouveaux.find(function (t) { return /réduite/.test(t); });
    verifier(/\.pdf$/.test(hd.nom), "PDF « HD » téléchargé (qualité demandée × " + hd.facteur + ")", hd.nom);
    verifier(!!msg, "toast : la résolution a été réduite", hd.nouveaux);
    const m = msg && msg.match(/(\d+) × (\d+) px/);
    verifier(!!m && Number(m[1]) * Number(m[2]) <= IOS_MAX, "le toast donne la taille produite, sous 16,7 Mpx", msg);
    verifier(!!msg && msg.indexOf("× " + hd.facteur) >= 0, "le toast rappelle la qualité demandée", msg);
    const toastType = await page.evaluate(function () {
      const t = document.getElementById("kta-toast"); return t ? t.className : null;
    });
    verifier(/warn/.test(toastType || ""), "toast d'avertissement (warn)", toastType);

    const brouillon = await exporter("0.5", false);
    verifier(/\.pdf$/.test(brouillon.nom), "PDF « Brouillon » téléchargé");
    verifier(!brouillon.nouveaux.some(function (t) { return /réduite/.test(t); }), "sous le plafond : aucun toast de réduction",
      brouillon.nouveaux);
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
  console.log("🎉 CHECKUP VERT — un PDF réduit par la limite de l'appareil le dit, avec la taille produite.");
  process.exit(0);
})();
