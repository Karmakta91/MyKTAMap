#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-suppression-plan-docs.js — checkup de release : supprimer un plan et ses documents d'histoire
// =====================================================================
// `PlanRegistry.purgeAssociatedData` ne touche pas la base `myktamap_histoire_pdfs` : sans la case de la
// confirmation (décochée par défaut, décision produit), les PDF d'un plan supprimé restent orphelins dans
// Mon carnet → Récits. Mesure par le vrai clic Infos → Supprimer :
//   1. la case apparaît, décochée, avec le bon nombre de documents et leur poids ;
//   2. cochée → les documents du plan partent, ceux d'un AUTRE plan restent ;
//   3. laissée décochée → rien ne part (falsification du 2 : sans elle, une suppression qui viderait
//      toute la base passerait pour un succès) ;
//   4. plan sans document → pas de case.
// Usage : node scripts/smoke/checkup-suppression-plan-docs.js
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }

// Un passage : page neuve, deux plans fictifs, documents semés, puis vraie suppression du plan A
async function passe(nav, docsA, cocher) {
  const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!(window.PlanRegistry && window.JournalUi && window.JournalUi.histoire && window.refreshPlansList);
  }, 30000);
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

  const ids = await page.evaluate(async function (n) {
    const idA = "local_checkup_suppr_a", idB = "local_checkup_suppr_b";
    window.PlanRegistry.addOrUpdate({ id: idA, type: "zip", name: "Checkup suppr A", fileName: "a.zip" });
    window.PlanRegistry.addOrUpdate({ id: idB, type: "zip", name: "Checkup suppr B", fileName: "b.zip" });
    // ⚠️ même schéma (version 2, index by_plan) que modeHistoire.js
    await new Promise(function (res, rej) {
      const r = indexedDB.open("myktamap_histoire_pdfs", 2);
      r.onupgradeneeded = function () {
        const st = r.result.createObjectStore("pdfs", { keyPath: "id" });
        st.createIndex("by_plan", "planId", { unique: false });
      };
      r.onsuccess = function () { r.result.close(); res(); };
      r.onerror = function () { rej(r.error); };
    });
    const H = window.JournalUi.histoire;
    const blob = new Blob([new Uint8Array(300 * 1024)], { type: "application/pdf" });
    for (let i = 0; i < n; i++) {
      await H.restaurer({ id: "docA" + i, planId: idA, blob: blob, name: "a" + i + ".pdf", addedAt: 1 });
    }
    await H.restaurer({ id: "docB", planId: idB, blob: blob, name: "b.pdf", addedAt: 1 });
    window.refreshPlansList();
    return { idA: idA, idB: idB };
  }, docsA);
  await page.waitForTimeout(600);

  await page.locator('[data-id="' + ids.idA + '"] .plan-row-info-btn').first().click();
  await page.locator("#kta-plan-infos-remove").click();
  await page.waitForSelector("#kta-confirm-oui", { timeout: 5000 });
  const vu = await page.evaluate(function () {
    const c = document.getElementById("kta-confirm-case");
    return {
      caseLa: !!c,
      cochee: !!(c && c.checked),
      libelle: c ? c.nextElementSibling.textContent : ""
    };
  });
  if (cocher && vu.caseLa) await page.locator("#kta-confirm-case").check();
  await page.locator("#kta-confirm-oui").click();
  await page.waitForTimeout(800);

  const reste = await page.evaluate(async function (ids) {
    const docs = await window.JournalUi.histoire.lister();
    return {
      a: docs.filter(function (d) { return d.planId === String(ids.idA); }).length,
      b: docs.filter(function (d) { return d.planId === String(ids.idB); }).length,
      planA: !!window.PlanRegistry.findById(ids.idA)
    };
  }, ids);
  await page.close();
  return { vu: vu, reste: reste };
}

(async function main() {
  let nav;
  nav = await lancerNavigateur(chromium);

  try {
    console.log("— 1-2 : case cochée → les documents du plan partent, pas ceux du voisin —");
    const c = await passe(nav, 2, true);
    if (c.vu.caseLa && !c.vu.cochee) ok("la case est proposée, décochée par défaut");
    else pb("case absente ou pré-cochée (" + JSON.stringify(c.vu) + ")");
    if (/\b2\b/.test(c.vu.libelle) && /0[,.]6/.test(c.vu.libelle))
      ok("le libellé compte 2 documents et leur poids réel (« " + c.vu.libelle + " »)");
    else pb("libellé faux : « " + c.vu.libelle + " » (attendu 2 documents, 0,6 Mo)");
    if (!c.reste.planA) ok("le plan est retiré de la liste");
    else pb("le plan est toujours au registre");
    if (c.reste.a === 0) ok("ses 2 documents sont supprimés");
    else pb("il reste " + c.reste.a + " document(s) du plan supprimé");
    if (c.reste.b === 1) ok("le document de l'AUTRE plan est intact");
    else pb("le document de l'autre plan a disparu (" + c.reste.b + ")");

    console.log("— 3 : falsification — case laissée décochée → rien ne part —");
    const d = await passe(nav, 2, false);
    if (!d.reste.planA && d.reste.a === 2 && d.reste.b === 1)
      ok("plan retiré, ses 2 documents conservés — le passage 1-2 prouve donc quelque chose");
    else pb("case décochée mais base modifiée (" + JSON.stringify(d.reste) + ")");

    console.log("— 4 : plan sans document → pas de case —");
    const s = await passe(nav, 0, false);
    if (!s.vu.caseLa) ok("aucune case quand il n'y a rien à supprimer");
    else pb("case affichée pour un plan sans document");
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
  console.log("🎉 CHECKUP VERT — supprimer un plan propose d'emporter ses documents, et ne touche qu'aux siens.");
  process.exit(0);
})();
