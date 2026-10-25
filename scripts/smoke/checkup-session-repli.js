#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-session-repli.js — checkup (Playwright, pas un hook pré-commit) : sections repliables de la modale
// « Détails de la session »
// =====================================================================
// Parcours : plan du relevé fictif ouvert, session simulée (1000 points, 3 types de tracés, 2 de zones, 1 de
// structures), modale ouverte par window.ktaOuvrirDetailsSession. Attendu : Points repliée (badge 1000, liste
// pleine une fois dépliée au clic sur le titre), Tracés / Zones / Structures ouvertes, Photos ouverte (0 photo),
// flèche visible, titre replié sans marge ; téléphone et PC, thème sombre et clair.
// Usage : node scripts/smoke/checkup-session-repli.js · code : refonteInterface.js > _afficherModaleSessionDetail
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
const FORMATS = [
  { nom: "téléphone", viewport: { width: 390, height: 844 }, mobile: true },
  { nom: "PC", viewport: { width: 1280, height: 800 }, mobile: false }
];
const THEMES = ["dark", "light"];

function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return (fictif || plans[0] || {}).name || "Relevé fictif de test";
  } catch (e) {
    return "Relevé fictif de test";
  }
}

const PLAN = planAOuvrir();
const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail ? " " + JSON.stringify(detail) : "")); }

async function ouvrir(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN, { exact: false }).first().click();
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.ktaOuvrirDetailsSession; },
    20000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

// Session simulée : seuls les getters lus par la modale sont remplacés (rien n'est écrit dans la session).
function simulerSession(page) {
  return page.evaluate(function () {
    const pts = [];
    for (let i = 0; i < 1000; i++) pts.push({ id: "p" + i, nom: "Point " + i, x: i, y: i, tags: ["chatiere"], level: 0 });
    const seg = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const roads = ["principal", "secondaire", "chemin"].map(function (t) { return { type: t, points: seg }; });
    const zones = [{ type: "eau" }, { type: "eau" }, { type: "remblais" }];
    window.getEditorPoints = function () { return pts; };
    window.getRoads = function () { return roads; };
    window.getZones = function () { return zones; };
    window.getStructures = function () { return [{ type: "mur" }]; };
  });
}

function etat(page) {
  return page.evaluate(function () {
    const m = document.getElementById("kta-refonte-session-modal");
    if (!m) return null;
    const secs = Array.from(m.querySelectorAll("details.kta-session-repli")).map(function (d) {
      const s = d.querySelector(":scope > summary");
      const fl = getComputedStyle(s, "::after");
      return {
        titre: s.textContent.replace(/\s+/g, " ").trim(),
        ouvert: d.open,
        badge: (s.querySelector(".kta-refonte-session-badge") || {}).textContent,
        lignes: d.querySelectorAll("li").length,
        fleche: fl.content,
        margeTitre: getComputedStyle(s).marginBottom,
        haut: d.getBoundingClientRect().height
      };
    });
    return { secs: secs, clair: document.documentElement.classList.contains("kta-theme-light") };
  });
}

async function scenario(page, tag, theme) {
  await ouvrir(page);
  await simulerSession(page);
  await page.evaluate(function () { window.ktaOuvrirDetailsSession(); });
  await attendre(page, function () { return !!document.getElementById("kta-refonte-session-modal"); }, 5000);
  await page.waitForTimeout(800);   // hydratation des photos
  const e = await etat(page);
  if (!e) { pb(tag + " : modale absente"); return; }
  verifier(e.clair === (theme === "light"), tag + " : thème " + theme + " appliqué");
  const par = function (mot) { return e.secs.find(function (s) { return s.titre.indexOf(mot) !== -1; }); };
  const P = par("📍"), T = par("🛣"), Z = par("⬛"), S = par("🏛"), F = par("📸");
  verifier(e.secs.length === 5, tag + " : 5 sections repliables", e.secs.map(function (s) { return s.titre; }));
  verifier(P && !P.ouvert && P.badge === "1000", tag + " : Points repliée, badge 1000", P);
  verifier(P && P.margeTitre === "0px" && P.haut < 80, tag + " : Points repliée tient sur une ligne", P);
  verifier(T && T.ouvert && T.lignes === 3, tag + " : Tracés ouverte (3 types)", T);
  verifier(Z && Z.ouvert && Z.lignes === 2, tag + " : Zones ouverte (2 types)", Z);
  verifier(S && S.ouvert && S.lignes === 1, tag + " : Structures ouverte", S);
  verifier(F && F.ouvert, tag + " : Photos ouverte (aucune photo)", F);
  verifier(e.secs.every(function (s) { return /▾/.test(s.fleche); }), tag + " : flèche sur chaque titre");
  // Déplier au clic sur le titre, puis replier.
  await page.locator("#kta-refonte-session-modal details.kta-session-repli > summary").first().click();
  const e2 = await etat(page);
  verifier(e2.secs[0].ouvert && e2.secs[0].lignes === 1000, tag + " : un clic sur le titre déplie les 1000 points");
  await page.locator("#kta-refonte-session-modal details.kta-session-repli > summary").first().click();
  verifier(!(await etat(page)).secs[0].ouvert, tag + " : un second clic replie");
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  try {
    for (const format of FORMATS) {
      for (const theme of THEMES) {
        const tag = format.nom + " / " + theme;
        console.log("\n── " + tag + " ──");
        const ctx = await nav.newContext({ viewport: format.viewport, isMobile: format.mobile, hasTouch: format.mobile });
        const page = await ctx.newPage();
        await page.addInitScript(function (l) {
          for (const k in l) { try { localStorage.setItem(k, l[k]); } catch (e) {} }
        }, Object.assign({}, LS_PREGATES, { "myktamap_theme_v1": theme }));
        page.on("pageerror", function (e) { erreursConsole.push(tag + " pageerror : " + e.message); });
        try {
          await scenario(page, tag, theme);
        } catch (e) {
          pb(tag + " : exception du harnais : " + (e && e.message));
        }
        await ctx.close();
      }
    }
  } finally {
    await nav.close();
    server.close();
  }
  erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — les longues listes de la modale de session arrivent repliées.");
  process.exit(0);
})();
