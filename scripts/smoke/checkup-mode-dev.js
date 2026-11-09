#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-mode-dev.js — checkup (Playwright) : Mode Développeur sans mot de passe, journal à envoyer
// =====================================================================
// Appareil neuf : ⚙️ Configuration → Mode Développeur → la confirmation chartée s'ouvre (aucun champ de mot de
// passe), Annuler laisse le mode éteint, Activer l'allume (boutons Logs détaillés, Afficher les logs, ConfAdmin,
// inspecteur SW) ; Logs détaillés passe APP_CONFIG.debugMode à vrai ; Afficher les logs ouvre la fenêtre du journal,
// non vide, et Copier met le journal au presse-papier ; un second clic éteint le mode.
// Appareil déjà déverrouillé par l'ancienne porte : le mode reste allumé sans question et les clés de la porte
// (déverrouillage, essais) sont effacées. Aucune erreur de page ni clé i18n manquante.
// Usage : node scripts/smoke/checkup-mode-dev.js (SMOKE_PORT pour une autre copie)
// Doc : infra-versioning.md § doc technique · garde-fou source : scripts/check-devmode-docs.js
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
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_readme_lang": "fr"
};
// Ancienne porte : valeur quelconque, seule la présence compte (le hash n'existe plus dans l'app).
const LS_ANCIEN = {
  "myktamap_devmode_unlock_v1": "0".repeat(64),
  "myktamap_devmode_tries_v1": "{\"n\":2}",
  "myktamap_devmode_active_v1": "1"
};

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function ouvrirPage(nav, ls) {
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 850 } });
  try { await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE }); } catch (e) {}
  const page = await ctx.newPage();
  await page.addInitScript(function (v) {
    // Une seule fois par contexte : un rechargement ne doit pas réécrire les clés que l'app vient d'effacer.
    if (sessionStorage.getItem("__ktaSeed")) return;
    sessionStorage.setItem("__ktaSeed", "1");
    for (const k in v) { try { localStorage.setItem(k, v[k]); } catch (e) {} }
  }, ls);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  page.on("console", function (m) {
    const txt = m.text();
    if (/Clé manquante/.test(txt)) erreurs.push("i18n : " + txt);
  });
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.DevMode && !!document.getElementById("loaderConfigBtn"); }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.evaluate(function () { document.getElementById("loaderConfigBtn").click(); });
  await attendre(page, function () { return !!document.getElementById("kta-devmode-toggle"); }, 8000);
  return { ctx: ctx, page: page, erreurs: erreurs };
}

const etat = function () {
  return {
    actif: window.DevMode.isActive(),
    pressed: (document.getElementById("kta-devmode-toggle") || {}).getAttribute
      ? document.getElementById("kta-devmode-toggle").getAttribute("aria-pressed") : null,
    boutons: ["kta-devmode-logs-toggle", "kta-devmode-logs-show", "kta-devmode-confadmin", "loaderSwInspectorBtn"]
      .filter(function (id) { return !!document.getElementById(id); }).length,
    confirm: !!document.getElementById("kta-devmode-confirm"),
    mdp: !!document.querySelector("input[type=password]#kta-dev-gate-input, #kta-dev-gate-input"),
    ls: {
      active: localStorage.getItem("myktamap_devmode_active_v1"),
      unlock: localStorage.getItem("myktamap_devmode_unlock_v1"),
      tries: localStorage.getItem("myktamap_devmode_tries_v1")
    }
  };
};

(async function main() {
  const nav = await lancerNavigateur(chromium);
  try {
    // ── 1. Appareil neuf ────────────────────────────────────────────
    console.log("Appareil neuf");
    const A = await ouvrirPage(nav, LS_PREGATES);
    const p = A.page;
    let e = await p.evaluate(etat);
    verifier(!e.actif && e.boutons === 0 && e.pressed === "false", "mode éteint au départ, aucun outil rendu", e);

    await p.evaluate(function () { document.getElementById("kta-devmode-toggle").click(); });
    await attendre(p, function () { return !!document.getElementById("kta-devmode-confirm"); }, 5000)
      .catch(function () {});
    e = await p.evaluate(etat);
    const texte = await p.evaluate(function () {
      const ov = document.getElementById("kta-devmode-confirm");
      const b = ov && ov.querySelector("#kta-confirm-oui");
      const r = b && b.getBoundingClientRect();
      // Au premier plan, au-dessus de la Configuration : le centre du bouton est le bouton lui-même.
      const dessus = !!r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b;
      return ov ? { dessus: dessus, corps: ov.querySelector(".kta-readme-modal-corps p").textContent,
        ok: ov.querySelector("#kta-confirm-oui").textContent, svg: !!ov.querySelector(".kta-readme-modal-titre svg") } : null;
    });
    verifier(e.confirm && !e.mdp, "clic : la confirmation chartée s'ouvre, sans champ de mot de passe", e);
    verifier(!!texte && /logs/i.test(texte.corps) && texte.ok === "Activer" && texte.svg && texte.dessus,
      "la confirmation dit ce que fait le mode (titre avec icône, bouton « Activer » au premier plan)", texte);

    await p.evaluate(function () { document.getElementById("kta-confirm-non").click(); });
    await p.waitForTimeout(300);
    e = await p.evaluate(etat);
    verifier(!e.actif && !e.confirm && e.boutons === 0, "Annuler : le mode reste éteint", e);

    await p.evaluate(function () { document.getElementById("kta-devmode-toggle").click(); });
    await attendre(p, function () { return !!document.getElementById("kta-confirm-oui"); }, 5000).catch(function () {});
    await p.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
    await attendre(p, function () { return !!document.getElementById("kta-devmode-logs-show"); }, 5000).catch(function () {});
    e = await p.evaluate(etat);
    verifier(e.actif && e.boutons === 4 && e.pressed === "true" && e.ls.active === "1",
      "Activer : mode allumé, 4 outils rendus, état mémorisé", e);

    const debugAvant = await p.evaluate(function () { return !!(window.APP_CONFIG && window.APP_CONFIG.debugMode); });
    await p.evaluate(function () { document.getElementById("kta-devmode-logs-toggle").click(); });
    const debugApres = await p.evaluate(function () { return !!(window.APP_CONFIG && window.APP_CONFIG.debugMode); });
    verifier(debugApres === !debugAvant && debugApres, "Logs détaillés : APP_CONFIG.debugMode passe à vrai",
      { avant: debugAvant, apres: debugApres });
    await p.evaluate(function () { console.log("[CheckupModeDev] ligne témoin du journal"); });

    await p.evaluate(function () { document.getElementById("kta-devmode-logs-show").click(); });
    await attendre(p, function () { return !!document.getElementById("kta-debug-modal"); }, 5000).catch(function () {});
    const journal = await p.evaluate(function () {
      const z = document.getElementById("kta-debug-logzone");
      const m = document.getElementById("kta-debug-modal");
      const r = m ? m.querySelector(".kta-readme-modal-boite").getBoundingClientRect() : null;
      return { lignes: z ? z.children.length : -1, temoin: !!z && /ligne témoin du journal/.test(z.textContent),
        copier: !!document.getElementById("kta-debug-copier"), visible: !!r && r.width > 100 && r.height > 100 };
    });
    verifier(journal.visible && journal.lignes > 0 && journal.temoin && journal.copier,
      "Afficher les logs : fenêtre visible, journal non vide (ligne témoin), bouton Copier", journal);

    await p.evaluate(function () { document.getElementById("kta-debug-copier").click(); });
    await p.waitForTimeout(600);
    const presse = await p.evaluate(function () {
      return navigator.clipboard.readText().then(function (t) { return t; }, function (er) { return "ERR " + er; });
    });
    verifier(/ligne témoin du journal/.test(presse), "Copier : le journal est au presse-papier",
      String(presse).slice(0, 80));

    // Éteindre : fenêtre du journal fermée, Configuration rouverte.
    await p.evaluate(function () {
      const m = document.getElementById("kta-debug-modal"); if (m) m.remove();
      if (!document.getElementById("kta-devmode-toggle")) document.getElementById("loaderConfigBtn").click();
    });
    await attendre(p, function () { return !!document.getElementById("kta-devmode-toggle"); }, 5000);
    await p.evaluate(function () { document.getElementById("kta-devmode-toggle").click(); });
    await p.waitForTimeout(300);
    e = await p.evaluate(etat);
    verifier(!e.actif && !e.confirm && e.boutons === 0 && e.ls.active === "0", "second clic : mode éteint, sans question", e);
    verifier(A.erreurs.length === 0, "appareil neuf : aucune erreur de page ni clé i18n manquante", A.erreurs.slice(0, 4));
    await A.ctx.close();

    // ── 2. Appareil déjà déverrouillé par l'ancienne porte ─────────
    console.log("Appareil déjà déverrouillé");
    const B = await ouvrirPage(nav, Object.assign({}, LS_PREGATES, LS_ANCIEN));
    e = await B.page.evaluate(etat);
    verifier(e.actif && e.boutons === 4 && !e.confirm, "mode toujours allumé, sans question", e);
    verifier(e.ls.unlock === null && e.ls.tries === null && e.ls.active === "1",
      "clés de l'ancienne porte effacées, état actif gardé", e.ls);
    verifier(B.erreurs.length === 0, "appareil déverrouillé : aucune erreur de page", B.erreurs.slice(0, 4));
    await B.ctx.close();
  } catch (err) {
    pb("exception du harnais : " + (err && err.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — Mode Développeur sans mot de passe, journal affiché et copié.");
  process.exit(0);
})();
