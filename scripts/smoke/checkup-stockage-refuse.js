#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-stockage-refuse.js — checkup (Playwright, pas un hook pré-commit) : stockage du site refusé
// =====================================================================
// Premier lancement sur myktamap.fr (stockage vierge, téléphone émulé), trois navigateurs :
//   • écriture refusée (localStorage.setItem lève QuotaExceededError) ;
//   • accès refusé (window.localStorage lève SecurityError : Chrome, « Cookies et données des sites » bloqués) ;
//   • normal.
// Le harnais clique ce qui se présente (Entrer, case, J'accepte, OK) pendant 30 s. Attendu, stockage refusé :
// message « Données non enregistrées » UNE fois, conditions UNE seule fois (plus de boucle derrière la descente de
// l'écran Bienvenue), accueil atteint ; normal : aucun message, conditions une fois, puis plus jamais à la relance.
// Usage : node scripts/smoke/checkup-stockage-refuse.js (SMOKE_PORT pour une autre copie) ·
//   doc : docs/architecture/security-legal.md
// =====================================================================
"use strict";

const { chromium, devices } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

const SCENARIOS = {
  ecriture: function () {
    Storage.prototype.setItem = function () { throw new DOMException("quota", "QuotaExceededError"); };
  },
  acces: function () {
    Object.defineProperty(window, "localStorage", { configurable: true,
      // Erreur nommée comme celle du navigateur, mais avec une pile (une DOMException n'en a pas) : l'appel fautif
      // est nommé dans le rapport.
      get: function () { const e = new Error("accès au stockage refusé"); e.name = "SecurityError"; throw e; } });
  },
  normal: null
};

// Parcours : clique ce qui se présente ; compte conditions acceptées et messages « stockage ».
async function parcourir(page, dureeMs) {
  const n = { cgu: 0, message: 0, entrer: 0 };
  const fin = Date.now() + dureeMs;
  while (Date.now() < fin) {
    const fait = await page.evaluate(function () {
      const vis = function (el) { return !!el && el.getBoundingClientRect().width > 0; };
      const titreStockage = window.I18n ? window.I18n.t("stockage.refuse.titre") : "";
      const oui = document.getElementById("kta-confirm-oui");
      if (vis(oui)) {
        const boite = oui.closest(".kta-readme-modal-boite");
        const estStockage = !!boite && boite.textContent.indexOf(titreStockage) >= 0;
        oui.click();
        return estStockage ? "message" : "autre-confirm";
      }
      const cb = document.getElementById("kta-legal-cb"), ac = document.getElementById("kta-legal-accept");
      if (vis(cb) && !cb.checked) { cb.click(); return null; }
      if (vis(ac) && !ac.disabled) { ac.click(); return "cgu"; }
      const b = Array.from(document.querySelectorAll("button")).find(function (x) {
        return vis(x) && !x.disabled && /^(Entrer|Enter)$/i.test(x.textContent.trim());
      });
      if (b) { b.click(); return "entrer"; }
      const al = document.getElementById("kta-alert-ok"); if (vis(al)) { al.click(); return null; }
      return null;
    }).catch(function () { return null; });
    if (fait && n[fait] !== undefined) n[fait]++;
    await page.waitForTimeout(600);
  }
  const etat = await page.evaluate(function () {
    return { accueil: document.body.classList.contains("kta-loader-active"),
             gates: !!document.querySelector("#kta-legal-gate-overlay, #kta-unlock-overlay, .kta-bv-ecran"),
             indispo: window.ktaStockageIndispo };
  }).catch(function (e) { return { erreur: String(e) }; });
  return Object.assign(n, etat);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  try {
    for (const nom of Object.keys(SCENARIOS)) {
      console.log("— Stockage : " + nom + " —");
      const ctx = await nav.newContext(Object.assign({}, devices["Pixel 7"], { serviceWorkers: "block" }));
      const page = await ctx.newPage();
      const erreurs = [];
      page.on("pageerror", function (e) {
        erreurs.push(((e && e.stack) || String(e)).split("\n").slice(0, 3).join(" | ").slice(0, 300));
      });
      if (SCENARIOS[nom]) await page.addInitScript(SCENARIOS[nom]);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      const r = await parcourir(page, 30000);
      if (nom === "normal") {
        verifier(r.indispo === null, "stockage détecté comme disponible", r.indispo);
        verifier(r.message === 0, "aucun message « Données non enregistrées »", r);
        verifier(r.cgu === 1 && r.accueil && !r.gates, "conditions acceptées une fois, accueil atteint", r);
        await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
        const r2 = await parcourir(page, 15000);
        verifier(r2.cgu === 0 && r2.message === 0 && r2.accueil, "relance : ni conditions ni message", r2);
      } else {
        verifier(!!r.indispo, "stockage détecté comme refusé (" + r.indispo + ")", r.indispo);
        verifier(r.message === 1, "message « Données non enregistrées » montré une seule fois", r);
        verifier(r.cgu === 1, "conditions acceptées une seule fois (pas de boucle)", r);
        verifier(r.accueil && !r.gates, "accueil atteint, plus aucune barrière", r);
      }
      verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
      await ctx.close();
    }
  } catch (e) {
    pb("exception : " + (e && e.stack || e));
  } finally {
    await nav.close();
    console.log("");
    console.log(problemes.length ? "❌ Stockage refusé : " + problemes.length + " problème(s)" : "✅ Stockage refusé : aucune boucle");
    process.exit(problemes.length ? 1 : 0);
  }
})();
