#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-calque-effacer.js — checkup (Playwright, pas un hook pré-commit) : « Effacer la session » rend
// les calques ouverts à la modification
// =====================================================================
// Rejoue le parcours réel sur un plan LOCAL : deux calques rapatriés en session, sauvegarde, rechargement
// (verrous rétablis, fenêtre « session restaurée »), « Effacer la session » confirmé. Attendu : copies
// retirées, verrous levés, originaux affichés, plus de boutons Exporter / Restituer dans le panneau de
// filtres, et rien ne revient au rechargement suivant.
// 🩸 check-calque-session.js vérifie clear() dans un `vm` ; seul ce parcours voit l'ordre réel (vidage,
// restitution, verrous différés de la restauration, panneau de filtres).
// Usage : node scripts/smoke/checkup-calque-effacer.js · doc : docs/architecture/session-data.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
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

async function ouvrir(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.CalqueSession; }, 20000);
  await page.waitForTimeout(2500);
}

// Copies en session, calques en modification, originaux sur la carte, boutons du panneau de filtres.
function etat(page, ids) {
  return page.evaluate(function (ids) {
    const fams = ["getEditorPoints", "getRoads", "getZones", "getStructures"];
    const copies = fams.reduce(function (s, g) {
      return s + (window[g]() || []).filter(function (o) { return o && ids.indexOf(o._srcCalque) >= 0; }).length;
    }, 0);
    let boutons = null;
    if (window.FilterPanel && typeof window.FilterPanel.ouvrir === "function") {
      window.FilterPanel.ouvrir();
      const q = function (a) {
        return ids.filter(function (id) { return !!document.querySelector("[" + a + "=" + JSON.stringify(id) + "]"); }).length;
      };
      boutons = { exporter: q("data-calque-exporter"), restituer: q("data-calque-restituer"),
                  rapatrier: q("data-calque-rapatrier") };
      window.FilterPanel.fermer();
    }
    return {
      copies: copies,
      rapatries: ids.filter(function (id) { return window.CalqueSession.estRapatrie(id); }).length,
      affiches: ids.filter(function (id) { return window.map.hasLayer(window.dataLayerGroups[id]); }).length,
      boutons: boutons
    };
  }, ids);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  try {
    await ouvrir(page);
    if (!PLAN.fictif) inf("⚠️ relevé fictif absent de data/index.json : le checkup tourne sur « " + PLAN.nom + " »");
    const ids = await page.evaluate(function () {
      return (window.PLAN_CONFIG.dataLayers || []).filter(function (d) {
        return d && d.file && d.id !== "editor" && window.dataLayerGroups && window.dataLayerGroups[d.id];
      }).map(function (d) { return d.id; }).slice(0, 2);
    });
    if (ids.length < 2) throw new Error("le plan n'a pas deux calques de données");
    for (const id of ids) {
      const r = await page.evaluate(function (id) { return window.CalqueSession.rapatrier(id); }, id);
      if (!r || !r.ok) throw new Error("rapatriement de " + id + " : " + JSON.stringify(r));
    }
    await page.evaluate(function () { return window.SessionPersist.save({ force: true }); });
    await page.waitForTimeout(1500);
    ok("deux calques en modification (" + ids.join(", ") + "), session sauvegardée");

    await ouvrir(page);
    await attendre(page, function () {
      return !!document.querySelector('#kta-session-modal [data-action="clear"]');
    }, 10000);
    const avant = await etat(page, ids);
    if (avant.rapatries === 2 && avant.affiches === 0 && avant.copies > 0) ok("rechargé : verrous rétablis, originaux masqués");
    else pb("rechargé : verrous non rétablis " + JSON.stringify(avant));

    await page.evaluate(function () { document.querySelector('#kta-session-modal [data-action="clear"]').click(); });
    await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 10000);
    await page.waitForTimeout(500);   // garde anti-double-clic de ktaConfirm
    // Plan local : la restitution ne se partage pas, la confirmation garde ses deux boutons.
    if (await page.evaluate(function () { return !document.getElementById("kta-confirm-autre"); })) {
      ok("plan local : confirmation à deux boutons (pas de choix « équipe »)");
    } else pb("plan local : un choix « rendre à l'équipe » est proposé");
    await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
    await page.waitForTimeout(1500);
    const rendu = JSON.stringify({ copies: 0, rapatries: 0, affiches: 2,
      boutons: { exporter: 0, restituer: 0, rapatrier: 2 } });
    const apres = await etat(page, ids);
    if (JSON.stringify(apres) === rendu) ok("effacé : copies retirées, verrous levés, originaux affichés, panneau à jour");
    else pb("effacé : calques pas rendus " + JSON.stringify(apres));
    await page.waitForTimeout(2000);
    const plusTard = await etat(page, ids);
    if (JSON.stringify(plusTard) === rendu) ok("2 s plus tard : toujours rendus");
    else pb("2 s plus tard : " + JSON.stringify(plusTard));

    await ouvrir(page);
    const rouvert = await etat(page, ids);
    if (JSON.stringify(rouvert) === rendu) ok("rouvert : rien ne revient");
    else pb("rouvert : " + JSON.stringify(rouvert));
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
  console.log("🎉 CHECKUP VERT — « Effacer la session » rend les calques ouverts à la modification.");
  process.exit(0);
})();
