#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-tag-nouveau.js — checkup (Playwright, pas un hook pré-commit) : tag créé à la volée gardé au rechargement
// =====================================================================
// Relevé fictif : POI ajouté par le formulaire avec « Nouveau tag », page rechargée, plan rouvert. Le point garde
// son tag, et le formulaire « Modifier » le présente sélectionné (avant : « Aucun tag », Enregistrer l'effaçait,
// car PLAN_CONFIG.icons ne garde pas un tag créé à la volée — editor.js > _buildTypeOptionsHTML). Enregistrer sans
// rien changer garde le tag.
// Usage : node scripts/smoke/checkup-tag-nouveau.js (SMOKE_PORT pour une autre copie)
// =====================================================================
"use strict";
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");
require("./server.js");
const problemes = [];
function verifier(c, msg, d) { if (c) console.log("  ✅ " + msg); else { problemes.push(msg); console.log("  ❌ " + msg + " " + JSON.stringify(d)); } }
const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS = { "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2", "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1" };
async function ouvrir(page, garder) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText("Relevé fictif", { exact: false }).first().click();
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.HistoryManager; }, 30000);
  await page.waitForTimeout(3000);
  const modal = await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) { k.click(); return "keep"; } m.remove(); return "removed"; }
    return "none";
  });
  await page.waitForTimeout(1500);
}
(async function () {
  const nav = await lancerNavigateur(chromium);
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e)); });
  await page.addInitScript(function (ls) { if (!sessionStorage.getItem("x")) { for (const k in ls) localStorage.setItem(k, ls[k]); sessionStorage.setItem("x", "1"); } }, LS);
  await ouvrir(page);
  await page.evaluate(function () { window.setEditorPoints([]); window.renderEditorPoints && window.renderEditorPoints(); });
  const r = await page.evaluate(async function () {
    const c = window.map.getCenter();
    window.afficherFormulaire(Math.round(c.lng), Math.round(window.APP_CONFIG.imageHeight - c.lat));
    document.getElementById("kta-poi-nom").value = "PointTest";
    const s = document.getElementById("kta-poi-type"); s.value = "__new__"; s.dispatchEvent(new Event("change"));
    document.getElementById("kta-poi-newtag").value = "montag";
    document.getElementById("kta-poi-valider").click();
    await new Promise(function (r) { setTimeout(r, 1500); });
    return window.getEditorPoints ? window.getEditorPoints().map(function (p) { return { nom: p.nom, tags: p.tags }; }) : "n/a";
  });
  verifier(JSON.stringify(r) === JSON.stringify([{ nom: "PointTest", tags: ["montag"] }]), "point ajouté avec le nouveau tag", r);
  await page.waitForTimeout(3000);
  await ouvrir(page);
  const r2 = await page.evaluate(function () {
    return window.getEditorPoints().map(function (p) { return { nom: p.nom, tags: p.tags }; });
  });
  verifier(JSON.stringify(r2) === JSON.stringify(r), "rechargé : le point garde son tag", r2);
  const r3 = await page.evaluate(async function () {
    const p = window.getEditorPoints()[0];
    window.afficherFormulaire(p.x, p.y, p);
    const sel = document.getElementById("kta-poi-type");
    const avant = { selectValue: sel.value, option: !!sel.querySelector('option[value="montag"]') };
    document.getElementById("kta-poi-valider").click();
    await new Promise(function (r) { setTimeout(r, 1500); });
    return Object.assign(avant, { apres: window.getEditorPoints()[0].tags });
  });
  verifier(r3.option && r3.selectValue === "montag", "formulaire « Modifier » : le tag est proposé et sélectionné", r3);
  verifier(JSON.stringify(r3.apres) === JSON.stringify(["montag"]), "Enregistrer sans rien changer garde le tag", r3);
  verifier(erreurs.length === 0, "aucune erreur de page", erreurs);
  await nav.close();
  console.log(problemes.length ? "\n❌ CHECKUP ROUGE — " + problemes.length + " problème(s)" : "\n🎉 CHECKUP VERT — un tag créé à la volée survit au rechargement et à la modification.");
  process.exit(problemes.length ? 1 : 0);
})();
