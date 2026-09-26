#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📖 checkup-carnet-documents.js — checkup de RELEASE
// =====================================================================
// UN PDF LIVRÉ DANS LE ZIP D'UN PLAN NE REMONTAIT PAS DANS « MON CARNET ».
//
// Signalement KARMA (26/09/2026) : « si j'ai intégré un PDF (mode histoire)
// dans un zip à la génération, il ne remonte pas dans Mon Carnet > Récits ».
// Ce n'était pas une régression mais une limite assumée et ÉCRITE dans le
// code depuis la v1.69.0 (`journalUi.js`) : l'onglet Récits ne lit que deux
// sources — les notes libres (localStorage) et les PDF importés en session
// (IndexedDB `myktamap_histoire_pdfs`). Un document livré avec le plan
// n'était dans ni l'une ni l'autre : il n'existait que le temps où son plan
// était chargé, dans `RUNTIME_ASSETS`.
//
// Décision KARMA : on en fait une COPIE, supprimable, et rouvrir le plan la
// recrée. D'où trois choses à mesurer, qu'aucun garde-fou statique ne peut
// voir (IndexedDB + DOM du Carnet) :
//   1. la copie se fait et le Carnet l'affiche, plan par plan ;
//   2. elle est IDEMPOTENTE — dix chargements ne font pas dix copies ;
//   3. supprimée, elle revient à la réouverture du plan.
//
// ⚠️ Ce harnais FALSIFIE : il joue aussi le cas sans synchro, où la ligne
// doit être ABSENTE du Carnet. Sans ce second passage, un Carnet qui
// afficherait n'importe quoi passerait pour un succès.
//
// Usage : node scripts/smoke/checkup-carnet-documents.js
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:8123";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) { return { nom: "Relevé fictif de test", fictif: true }; }
}
const PLAN = planAOuvrir();

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }

// Un PDF minimal mais VALIDE : on mesure la chaîne de copie, pas un lecteur.
const PDF_SRC = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";

async function passe(nav, avecSync) {
  const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    try { localStorage.setItem("app_user_prefs", '{"debugMode":true}'); } catch (e) {}
  }, LS_PREGATES);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await page.waitForFunction(function () { return !!window.PLAN_CONFIG && !!window.map; }, null, { timeout: 60000 });
  await page.waitForTimeout(4000);

  const r = await page.evaluate(async function (args) {
    const out = {};
    // Le plan « généré avec un PDF dans son zip » : à l'extraction, son chemin
    // est résolu en blob: URL — c'est exactement ce que produit RUNTIME_ASSETS.
    const url = URL.createObjectURL(new Blob([args.pdf], { type: "application/pdf" }));
    window.PLAN_CONFIG.plan.histoirePdfs = [url];
    out.planId = window._currentLoadedPlanId;

    const lireIdb = function () {
      return new Promise(function (res) {
        const req = indexedDB.open("myktamap_histoire_pdfs");
        req.onerror = function () { res([]); };
        req.onsuccess = function () {
          const db = req.result;
          if (!db.objectStoreNames.contains("pdfs")) { db.close(); res([]); return; }
          const rq = db.transaction("pdfs", "readonly").objectStore("pdfs").getAll();
          rq.onsuccess = function () {
            db.close();
            res((rq.result || []).map(function (d) {
              return { id: d.id, planId: d.planId, name: d.name, size: d.size,
                       embarque: !!d.embarque, embedIdx: d.embedIdx };
            }));
          };
          rq.onerror = function () { db.close(); res([]); };
        };
      });
    };

    if (args.sync) {
      out.copies1 = await window.ModeHistoire.syncDocsEmbarques();
      out.copies2 = await window.ModeHistoire.syncDocsEmbarques();
    }
    out.enBase = await lireIdb();

    // Le Carnet tel que l'utilisateur l'ouvre, onglet Récits compris.
    window.JournalUi.ouvrir();
    await new Promise(function (r) { setTimeout(r, 900); });
    const onglet = Array.prototype.slice.call(document.querySelectorAll(".kta-jrn-onglet"))
      .filter(function (b) { return b.getAttribute("data-tab") === "recits"; })[0];
    if (onglet) onglet.click();
    await new Promise(function (r) { setTimeout(r, 1200); });
    const el = document.getElementById("kta-jrn-recits");
    out.lignes = el ? el.querySelectorAll(".kta-jrn-recit-row").length : -1;
    out.texte  = el ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 160) : null;

    if (args.sync && out.enBase.length) {
      const id = out.enBase[0].id;
      await new Promise(function (res) {
        const req = indexedDB.open("myktamap_histoire_pdfs");
        req.onsuccess = function () {
          const db = req.result;
          const rq = db.transaction("pdfs", "readwrite").objectStore("pdfs").delete(id);
          rq.onsuccess = rq.onerror = function () { db.close(); res(); };
        };
        req.onerror = function () { res(); };
      });
      out.apresSuppression = (await lireIdb()).length;
      await window.ModeHistoire.syncDocsEmbarques();   // = rouvrir le plan
      out.apresReouverture = (await lireIdb()).length;
    }
    return out;
  }, { sync: avecSync, pdf: PDF_SRC });

  await page.close();
  return r;
}

(async function main() {
  let nav;
  try { nav = await chromium.launch(); }
  catch (e) {
    if (!/Executable doesn't exist/i.test(String((e && e.message) || ""))) throw e;
    nav = await chromium.launch({ channel: "chromium" });
  }

  try {
    if (!PLAN.fictif) inf("⚠️ le relevé fictif n'est pas dans data/index.json — checkup sur « " + PLAN.nom + " »");

    console.log("— D : un document livré avec le plan remonte dans le Carnet —");
    const a = await passe(nav, true);
    inf("plan « " + a.planId + " » · en base : " + JSON.stringify(a.enBase));

    const copie = (a.enBase || []).filter(function (d) { return d.embarque; })[0];
    if (copie && copie.id === "embed_" + a.planId + "_0")
      ok("le document du plan est copié sous un id déterministe (" + copie.id + ")");
    else pb("aucune copie du document du plan en base (" + JSON.stringify(a.enBase) + ")");

    if (a.copies1 === 1 && a.copies2 === 0)
      ok("la copie est idempotente : 1 au premier chargement, 0 au suivant");
    else pb("copies non idempotentes (1er=" + a.copies1 + ", 2e=" + a.copies2 + ")");

    if (a.lignes === 1) ok("le Carnet > Récits affiche le plan et son document (« " + a.texte + " »)");
    else pb("le Carnet affiche " + a.lignes + " ligne(s) : « " + a.texte + " »");

    if (a.apresSuppression === 0 && a.apresReouverture === 1)
      ok("supprimable, et la réouverture du plan la recrée (0 → 1)");
    else pb("cycle suppression/réouverture faux (après suppression=" + a.apresSuppression +
            ", après réouverture=" + a.apresReouverture + ")");

    console.log("— D' : falsification (sans la synchro, rien ne doit remonter) —");
    const b = await passe(nav, false);
    if ((b.enBase || []).length === 0 && b.lignes === 0)
      ok("sans la copie, le Carnet ne montre rien — le contrôle ci-dessus prouve donc quelque chose");
    else pb("le Carnet montre " + b.lignes + " ligne(s) SANS copie (" + JSON.stringify(b.enBase) +
            ") : ce checkup ne prouve rien");

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
  console.log("🎉 CHECKUP VERT — un document livré avec un plan vit dans le Carnet, supprimable, recréé à la réouverture.");
  process.exit(0);
})();
