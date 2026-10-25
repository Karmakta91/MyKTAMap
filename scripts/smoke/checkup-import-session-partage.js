#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-import-session-partage.js — checkup (Playwright, pas un hook pré-commit) : import d'un fichier de
// session, plan local et plan partagé par une extension (prise importSession simulée)
// =====================================================================
// Rejoue la vraie fenêtre d'import (ouvrirImportSession → Valider) :
//   1. plan local : aucun choix, le fichier REMPLACE la session, ses traces remplacent celles du plan ;
//   2. prise simulée { remplacer: true } : « Ajouter » fusionne (rien ne disparaît, aucune trace créée) ;
//   3. « Remplacer pour toute l'organisation » : confirmation chiffrée, une trace par objet retiré ;
//   4. prise en erreur : « Ajouter » seul.
// 🩸 check-extensions.js teste KtaUid.preparerImport dans un `vm` ; seul ce parcours voit la fenêtre, les setters
// réels et l'ordre snapshot → photos → objets.
// Usage : node scripts/smoke/checkup-import-session-partage.js · doc : docs/architecture/session-data.md §9.1
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const H = Date.now() - 3600000;   // « il y a une heure » : avant la session de départ (poserSession)
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

// Même repli que checkup-plan-oriente.js : on ouvre ce que l'index propose, en le disant.
function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) {
    return { nom: "Relevé fictif de test", fictif: true };
  }
}

const PLAN = planAOuvrir();
const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verif(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }

async function ouvrir(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.KtaUid; }, 20000);
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    const b = document.querySelector('#kta-session-modal [data-action="continue"]'); if (b) b.click();
  });
}

// Session de départ : X et Y (uid connus), une trace d'un objet D effacé.
async function poserSession(page) {
  await page.evaluate(function () {
    // Dates récentes : une trace de plus de 90 jours est purgée à la sauvegarde (KtaUid.purge).
    const t0 = Date.now() - 3600000;
    const p = function (uid, nom) { return { uid: uid, id: nom, name: nom, x: 1000, y: 1000, tag: "puits", updatedAt: t0 }; };
    window.setEditorPoints([p("pt_ckx", "Point X"), p("pt_cky", "Point Y")]);
    window.KtaUid.setTombstones([{ uid: "pt_ckd", deletedAt: t0 + 60000 }]);
    if (window.renderEditorPoints) window.renderEditorPoints();
  });
}

// Ouvre la fenêtre avec le fichier ; `mode` cliqué s'il est proposé ; la confirmation est acceptée.
async function importer(page, pts, traces, mode) {
  const data = { type: "devmap-session", version: "1.0", date_export: "2026-01-01T00:00:00Z",
    editorPoints: pts, roads: [], zones: [], structures: [], tombstones: traces || [] };
  await page.evaluate(function (txt) {
    window.ouvrirImportSession(new File([txt], "session.json", { type: "application/json" }));
  }, JSON.stringify(data));
  await attendre(page, function () { const b = document.getElementById("kta-import-valider"); return !!b && !b.disabled; }, 10000);
  const vue = await page.evaluate(function () {
    const w = document.getElementById("kta-import-warn"), m = document.getElementById("kta-import-modes");
    return { modes: [].map.call(document.querySelectorAll("[data-kta-import-mode]"), function (b) { return b.dataset.ktaImportMode; }),
      avertissement: !!w && w.style.display !== "none", choix: !!m && m.style.display !== "none" };
  });
  await page.evaluate(function (m) {
    const b = document.querySelector('[data-kta-import-mode="' + m + '"]'); if (b) b.click();
    document.getElementById("kta-import-valider").click();
  }, mode || "");
  await page.waitForTimeout(800);
  vue.confirmation = await page.evaluate(function () {
    const o = document.getElementById("kta-confirm-oui");
    return o ? (o.closest(".kta-readme-modal-overlay") || document.body).textContent : null;
  });
  if (vue.confirmation) {
    await page.waitForTimeout(400);   // garde anti-double-clic de ktaConfirm
    await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
  }
  await attendre(page, function () { return !document.getElementById("kta-import-modal"); }, 10000);
  await page.waitForTimeout(500);
  vue.apres = await page.evaluate(function () {
    return { pts: window.getEditorPoints().map(function (p) { return p.uid + ":" + p.name; }).sort(),
      traces: window.KtaUid.getTombstones().map(function (t) { return t.uid; }).sort() };
  });
  return vue;
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("pageerror", function (e) { pb("erreur de page : " + e.message); });
  try {
    await ouvrir(page);
    if (!PLAN.fictif) inf("⚠️ relevé fictif absent de data/index.json : le checkup tourne sur un autre plan de l'index");

    // 1. Plan local : remplacement inchangé.
    await poserSession(page);
    const v1 = await importer(page, [{ uid: "pt_ckz", id: "Point Z", name: "Point Z", x: 1, y: 1, updatedAt: H - 120000 }],
      [{ uid: "pt_ckq", deletedAt: H - 60000 }], "");
    verif(!v1.modes.length && v1.avertissement && !v1.choix, "plan local : aucun choix, avertissement « remplace »", v1);
    verif(!v1.confirmation, "plan local : pas de confirmation de suppression", v1.confirmation);
    verif(JSON.stringify(v1.apres) === JSON.stringify({ pts: ["pt_ckz:Point Z"], traces: ["pt_ckq"] }),
      "plan local : le fichier remplace la session, ses traces remplacent celles du plan (aucune trace créée)", v1.apres);

    // Prise simulée : le plan affiché passe pour un plan d'extension partagé.
    await page.evaluate(function () {
      const id = window._currentLoadedPlanId, orig = window.PlanRegistry.findById.bind(window.PlanRegistry);
      window.PlanRegistry.findById = function (x) { return x === id ? { type: "ext", extId: "simule" } : orig(x); };
      window.__reponsePrise = { remplacer: true };
      window.KtaExtensions.register({ nom: "checkup-import", apiVersion: 1, importSession: function () {
        if (window.__reponsePrise === "panne") throw new Error("panne simulée");
        return window.__reponsePrise;
      } });
    });

    // 2. Ajouter.
    await poserSession(page);
    const v2 = await importer(page, [{ uid: "pt_ckz", id: "Point Z", name: "Point Z", x: 1, y: 1, updatedAt: H - 120000 },
      { uid: "pt_ckx", id: "X du fichier", name: "X du fichier", x: 1, y: 1, updatedAt: H + 120000 },
      { uid: "pt_ckd", id: "D", name: "D", x: 1, y: 1, updatedAt: H - 120000 }], [{ uid: "pt_ckq", deletedAt: H - 60000 }], "ajouter");
    verif(v2.modes.join() === "ajouter,remplacer" && v2.choix && !v2.avertissement, "prise { remplacer: true } : deux choix", v2);
    verif(!v2.confirmation, "Ajouter : aucune confirmation", v2.confirmation);
    verif(JSON.stringify(v2.apres.pts) === JSON.stringify(["pt_ckx:X du fichier", "pt_cky:Point Y", "pt_ckz:Point Z"]),
      "Ajouter : Y reste, Z s'ajoute, X prend la version plus récente, D (effacé ici) ne revient pas", v2.apres.pts);
    verif(JSON.stringify(v2.apres.traces) === JSON.stringify(["pt_ckd"]),
      "Ajouter : traces d'ici inchangées, aucune trace créée, celles du fichier ignorées", v2.apres.traces);

    // 3. Remplacer pour toute l'organisation.
    await poserSession(page);
    const v3 = await importer(page, [{ uid: "pt_ckz", id: "Point Z", name: "Point Z", x: 1, y: 1, updatedAt: H - 120000 }], [], "remplacer");
    verif(!!v3.confirmation && /(^|\D)2 objet/.test(v3.confirmation), "Remplacer : confirmation qui annonce 2 objets supprimés",
      v3.confirmation && v3.confirmation.slice(0, 160));
    verif(JSON.stringify(v3.apres) === JSON.stringify({ pts: ["pt_ckz:Point Z"], traces: ["pt_ckd", "pt_ckx", "pt_cky"] }),
      "Remplacer : contenu du fichier, une trace par objet retiré (X, Y), trace d'ici gardée", v3.apres);

    // 4. Prise en erreur : ajout seul.
    await page.evaluate(function () { window.__reponsePrise = "panne"; });
    await poserSession(page);
    const v4 = await importer(page, [{ uid: "pt_ckz", id: "Point Z", name: "Point Z", x: 1, y: 1, updatedAt: H - 120000 }], [], "remplacer");
    verif(v4.modes.join() === "ajouter", "prise en erreur : « Ajouter » seul proposé", v4.modes);
    verif(JSON.stringify(v4.apres.pts) === JSON.stringify(["pt_ckx:Point X", "pt_cky:Point Y", "pt_ckz:Point Z"]) &&
      JSON.stringify(v4.apres.traces) === JSON.stringify(["pt_ckd"]), "prise en erreur : rien ne disparaît", v4.apres);
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
  console.log("✅ CHECKUP VERT — import de session : plan local inchangé, plan partagé en deux modes");
})();
