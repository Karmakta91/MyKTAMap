#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-secours-une-intervention.js — une seule intervention Secours à la fois sur un plan
// =====================================================================
// 🩸 Une intervention jamais arrêtée (exercice de la veille) reste active : une vraie lancée à côté n'était ni
// surveillée (veille des retards), ni dans la pastille, ni sur la carte — js/secoursMode.js > _scenarioEnCours
// n'en suit qu'une. Vérifie les deux chemins de lancement :
//   1. rejoindre (installation reliée, appelant synchrone) : l'autre est arrêtée, un toast le dit ;
//   2. bouton « Lancer » : question « encore en cours » ; Annuler ne change rien, accepter arrête l'autre
//      (gardée dans l'historique, endedAt) et lance celle-ci.
// Ouvre le relevé fictif s'il est là, sinon le premier plan de l'index (rien de lui n'est imprimé). Les scénarios
// de test sont supprimés à la fin.
// Usage : cd scripts/smoke && node checkup-secours-une-intervention.js (SMOKE_PORT, KTA_MOTEURS=webkit)
// Doc : docs/architecture/secours.md (une intervention à la fois)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");

const PORT = parseInt(process.env.SMOKE_PORT, 10) || 8123;
const BASE = "http://127.0.0.1:" + PORT;
const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function verifier(c, m, detail) { if (c) ok(m); else pb(m + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
const NOMS = ["Intervention A (test)", "Intervention B (test)", "Intervention C (test)"];

(async function main() {
  const server = require("./server.js");
  let nav = null;
  try {
    nav = await lancerNavigateur(chromium);
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(function () {
      localStorage.setItem("myktamap_unlock_v1", "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae");
      localStorage.setItem("myktamap_terms_accepted_v1", "2");
      localStorage.setItem("myktamap_tutorial_seen_v1", "1");
    });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on("pageerror", function (e) { erreurs.push(String(e).slice(0, 200)); });

    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () {
      return !!window.PlanRegistry && window.PlanRegistry.getAll().length > 0 && typeof window.chargerPlanDuRegistre === "function";
    }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.evaluate(function () {
      const tous = window.PlanRegistry.getAll();
      const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
      return window.chargerPlanDuRegistre(p.id);
    });
    await attendre(page, function () { return window.ktaPlanAffiche() && !!window.SecoursMode; }, 30000);
    await page.waitForTimeout(3000);

    const actives = function () {
      return page.evaluate(function () {
        return window.SecoursMode.list().filter(function (s) { return s.execution && s.execution.active; })
          .map(function (s) { return s.nom; });
      });
    };

    // ── 1. rejoindre : l'autre est arrêtée et on le dit ──
    const ids = await page.evaluate(function (noms) {
      const S = window.SecoursMode;
      const a = S.create(noms[0]), b = S.create(noms[1]), c = S.create(noms[2]);
      S.addGroupe(c.id, "Équipe 1");   // le bandeau « Lancer » demande au moins une équipe
      S.rejoindre(a.id, { role: "operateur" });
      S.rejoindre(b.id, { role: "operateur" });
      S.fermer();
      return { a: a.id, b: b.id, c: c.id };
    }, NOMS);
    const apres1 = await actives();
    const toast = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll(".kta-toast"), function (t) { return t.textContent; }).join(" | ");
    });
    verifier(apres1.length === 1 && apres1[0] === NOMS[1], "rejoindre B pendant A : une seule active (B)", apres1);
    verifier(/A \(test\)/.test(toast), "rejoindre : un toast dit que A est arrêtée");

    // ── 2. « Lancer » C pendant que B tourne : question, Annuler puis accepter ──
    const lancerC = async function () {
      await page.evaluate(function (id) { window.SecoursMode.ouvrir(id); }, ids.c);
      await page.waitForTimeout(600);
      await page.evaluate(function () { const b = document.querySelector('[data-action="ouvrir-lancer-modale"]'); if (b) b.click(); });
      await page.waitForTimeout(400);
      await page.evaluate(function () { const b = document.querySelector('[data-action="confirm-lancer"]'); if (b) b.click(); });
      await page.waitForTimeout(500);
      return page.evaluate(function () {
        const o = document.getElementById("kta-confirm-oui");
        let e = o;
        for (let i = 0; e && i < 4; i++) e = e.parentElement;
        return e ? e.textContent : null;
      });
    };
    const question = await lancerC();
    verifier(!!question && question.indexOf(NOMS[1]) >= 0, "« Lancer » C : la question nomme l'intervention en cours (B)");
    await page.evaluate(function () { const b = document.getElementById("kta-confirm-non"); if (b) b.click(); });
    await page.waitForTimeout(400);
    const apres2 = await actives();
    verifier(apres2.length === 1 && apres2[0] === NOMS[1], "Annuler : rien ne change, B tourne toujours", apres2);
    await page.evaluate(function () { window.SecoursMode.fermer(); });
    await lancerC();
    await page.evaluate(function () { const b = document.getElementById("kta-confirm-oui"); if (b) b.click(); });
    await page.waitForTimeout(800);
    const apres3 = await actives();
    const bGardee = await page.evaluate(function (id) {
      const s = window.SecoursMode.get(id);
      return !!(s && s.execution && s.execution.endedAt);
    }, ids.b);
    verifier(apres3.length === 1 && apres3[0] === NOMS[2], "accepter : C seule active", apres3);
    verifier(bGardee, "accepter : B arrêtée, gardée dans l'historique (fin datée)");
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs);

    // Ménage : les scénarios de test ne restent pas sur le plan.
    await page.evaluate(function (noms) {
      const S = window.SecoursMode;
      if (S.isOpen && S.isOpen()) S.fermer();
      S.list().filter(function (s) { return noms.indexOf(s.nom) >= 0; }).forEach(function (s) { S.delete(s.id); });
    }, NOMS);
    await ctx.close();
  } catch (e) {
    pb("exception : " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
  } finally {
    if (nav) await nav.close();
    if (server && server.close) server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP SECOURS VERT — une seule intervention à la fois, par les deux chemins de lancement.");
})();
