#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-niveaux-verticaux.js — checkup (Playwright, pas un hook pré-commit) : sol, hauteur et écart par niveau
// =====================================================================
// Plan multi-niveau FABRIQUÉ dans la page (image et ZIP en mémoire, rien lu ni écrit dans data/) : sols 1 / 0 / −1,
// −2 « sans profondeur », hauteurs 3 m au 0 et 2,5 m au −1. Puis :
// A. Générateur (ZIP déposé, mode Modifier) : table reprise telle quelle (sans profondeur coché, hauteurs, écarts
//    calculés), écart saisi → sols du niveau et du dessous déplacés ; ZIP généré relu : niveauxProfondeur (null
//    gardé) et niveauxHauteur écrits ; case multi-niveau décochée → une seule ligne (hauteur).
// B. Plan ouvert : getNiveauVertical (sol, hauteur, plafond, écart) lu du plan-config.
// C. ⚙️ Réglages du plan : lanceur « Niveaux : profondeur et hauteur » et son état ; fenêtre au-dessus des
//    Réglages, écart −1,5 saisi au 0 et hauteur du −1 corrigée → prefs (seule la hauteur qui diffère du plan),
//    écart relu −1,5 ; « ↺ Valeurs du plan » rend les valeurs du ZIP. Largeur téléphone (390) sans débordement.
// Usage : node scripts/smoke/checkup-niveaux-verticaux.js (SMOKE_PORT pour une autre copie ; NV_SHOTS=<dossier>
// pour des captures) · garde-fou logique : scripts/check-niveaux-verticaux.js · doc : multilevel-pathfinding.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const NOM_PLAN = "Plan fictif niveaux en hauteur";

const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
async function capture(page, nom) {
  if (!process.env.NV_SHOTS) return;
  await page.screenshot({ path: path.join(process.env.NV_SHOTS, nom + ".png") });
}

async function accueil(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

// ZIP fictif fabriqué dans la page, rendu en base64 (déposé au Générateur, puis ouvert dans l'app).
function fabriquerZip(page) {
  return page.evaluate(async function (nom) {
    const W = 1000, H = 800;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#cfcfcf"; g.fillRect(0, 0, W, H);
    const png = await new Promise(function (r) { c.toBlob(r, "image/png"); });
    const zip = new JSZip();
    zip.file("fond.png", png);
    zip.file("plan-config.json", JSON.stringify({
      plan: { name: nom, version: "T1", imageWidth: W, imageHeight: H, baseImage: "fond.png", multiLevel: true,
        niveauxProfondeur: { "1": -20, "0": -25, "-1": -30, "-2": null },
        niveauxHauteur: { "0": 3, "-1": 2.5 } },
      dataLayers: [],
      tracking: { startX: 500, startY: 400, scale: 4 },
      iconsEmbarquees: []
    }));
    const blob = await zip.generateAsync({ type: "base64" });
    return blob;
  }, NOM_PLAN);
}

function lireTable(page, sel) {
  return page.evaluate(function (sel) {
    const r = document.querySelector(sel);
    if (!r) return null;
    const out = {};
    r.querySelectorAll(".kta-prof-ligne[data-ligne]").forEach(function (l) {
      const k = l.getAttribute("data-ligne");
      const v = function (c) { const e = l.querySelector(c); return e ? { v: e.value, off: e.disabled } : null; };
      out[k] = { sol: v(".kta-prof-val"), h: v(".kta-prof-h"), ecart: v(".kta-prof-ecart"),
        sans: !!(l.querySelector("[data-sans]") || {}).checked,
        solVisible: !!(l.querySelector(".kta-prof-val") || {}).offsetParent };
    });
    return out;
  }, sel);
}

function saisir(page, sel, valeur) {
  return page.evaluate(function (a) {
    const e = document.querySelector(a.sel);
    e.value = a.v;
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, { sel: sel, v: valeur });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 }, acceptDownloads: true });
  await page.route(/tile\.openstreetmap\.org/, function (r) { return r.abort(); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("pageerror", function (e) { erreursConsole.push("pageerror : " + e.message); });
  page.on("console", function (m) {
    if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|Licence-pro\.json|404/i.test(m.text())) {
      erreursConsole.push(m.text());
    }
  });
  const dossier = fs.mkdtempSync(path.join(require("os").tmpdir(), "kta-nv-"));
  try {
    await accueil(page);
    const b64 = await fabriquerZip(page);
    const fichierZip = path.join(dossier, "fictif-niveaux.zip");
    fs.writeFileSync(fichierZip, Buffer.from(b64, "base64"));

    // ── A. Générateur ──
    await page.evaluate(function () { window.afficherPlanner(); });
    await attendre(page, function () { return !!document.getElementById("kta-planner-zip-input"); }, 10000);
    const vierge = await lireTable(page, "#pl_niveaux_table");
    verifier(!!vierge && Object.keys(vierge).length === 1 && vierge["0"] && vierge["0"].h.v === "2" && !vierge["0"].solVisible,
      "Générateur neuf (un niveau) : une ligne, hauteur 2 m proposée, ni sol ni écart", vierge);
    const bascule = await page.evaluate(function () {
      const cb = document.getElementById("pl_multiLevel"), n = function () {
        return document.querySelectorAll("#pl_niveaux_table .kta-prof-ligne[data-ligne]").length;
      };
      cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true }));
      const r = { multi: n(), sol0: document.querySelector('#pl_niveaux_table .kta-prof-val[data-niv="0"]').value,
        ecart0: document.querySelector('#pl_niveaux_table .kta-prof-ecart[data-ecart="0"]').value };
      cb.checked = false; cb.dispatchEvent(new Event("change", { bubbles: true }));
      r.mono = n();
      cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector('#pl_niveaux_table .kta-prof-val[data-niv="1"]').value = "-20";
      cb.checked = false; cb.dispatchEvent(new Event("change", { bubbles: true }));
      cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true }));
      r.retour = document.querySelector('#pl_niveaux_table .kta-prof-val[data-niv="1"]').value;
      cb.checked = false; cb.dispatchEvent(new Event("change", { bubbles: true }));
      return r;
    });
    verifier(bascule.multi === 5 && bascule.sol0 === "-25" && bascule.ecart0 === "3" && bascule.mono === 1 &&
      bascule.retour === "-20",
      "case multi-niveau : 5 niveaux proposés (0 à −25 m, écart 3 m), décochée : une ligne, recochée : sols gardés",
      bascule);
    await page.setInputFiles("#kta-planner-zip-input", fichierZip);
    await attendre(page, function () {
      return !!document.querySelector('#pl_niveaux_table .kta-prof-ligne[data-ligne="-2"]');
    }, 15000);
    await page.waitForTimeout(500);
    let tb = await lireTable(page, "#pl_niveaux_table");
    verifier(tb && tb["1"].sol.v === "-20" && tb["0"].sol.v === "-25" && tb["-1"].sol.v === "-30" && tb["-2"].sans &&
      tb["-2"].sol.off && tb["0"].h.v === "3" && tb["-1"].h.v === "2.5" && tb["1"].h.v === "2",
      "ZIP rouvert : sols, « sans profondeur » et hauteurs repris tels quels", tb);
    verifier(tb && tb["0"].ecart.v === "2" && tb["-1"].ecart.v === "2.5" && tb["2"].ecart.off && tb["-2"].ecart.off,
      "écarts calculés (0 : 2 m, −1 : 2,5 m), sans appui au-dessus ou sans profondeur : grisés", tb);
    await saisir(page, '#pl_niveaux_table .kta-prof-ecart[data-ecart="0"]', "-1.5");
    tb = await lireTable(page, "#pl_niveaux_table");
    verifier(tb && tb["0"].sol.v === "-21.5" && tb["-1"].sol.v === "-26.5" && tb["1"].sol.v === "-20" &&
      tb["-1"].ecart.v === "2.5",
      "écart −1,5 au 0 : sol du 0 à −21,5, le −1 suit (−26,5, son écart gardé), le +1 ne bouge pas", tb);
    await saisir(page, '#pl_niveaux_table .kta-prof-h[data-h="1"]', "2.4");
    await capture(page, "generateur");
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      page.evaluate(function () { document.getElementById("kta-planner-generer").click(); })
    ]);
    const zb64 = fs.readFileSync(await dl.path()).toString("base64");
    const cfg = await page.evaluate(async function (b) {
      const z = await JSZip.loadAsync(b, { base64: true });
      return JSON.parse(await z.file("plan-config.json").async("string")).plan;
    }, zb64);
    verifier(JSON.stringify(cfg.niveauxProfondeur) === JSON.stringify({ "1": -20, "0": -21.5, "-1": -26.5, "-2": null }),
      "ZIP généré : niveauxProfondeur saisis (« sans profondeur » gardé en null, +2 non renseigné absent)",
      cfg.niveauxProfondeur);
    verifier(JSON.stringify(cfg.niveauxHauteur) === JSON.stringify({ "2": 2, "1": 2.4, "0": 3, "-1": 2.5, "-2": 2 }),
      "ZIP généré : niveauxHauteur de chaque niveau, écart jamais écrit", cfg.niveauxHauteur);
    verifier(!JSON.stringify(cfg).match(/ecart/i), "aucun champ d'écart dans le plan-config");
    await page.evaluate(function () { const m = document.getElementById("kta-planner-modal"); if (m) m.remove(); });

    // ── B. Plan ouvert : l'accès ──
    await page.evaluate(async function (b) {
      const z = Uint8Array.from(atob(b), function (c) { return c.charCodeAt(0); });
      await window.chargerZipFichier(new File([z], "fictif-niveaux.zip", { type: "application/zip" }), "auto",
        { storeBlob: true });
    }, b64);
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window._currentLoadedPlanId; }, 30000);
    await page.waitForTimeout(2500);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) k.click(); else m.remove(); }
    });
    const acces = await page.evaluate(function () {
      return { n0: window.getNiveauVertical(0), m1: window.getNiveauVertical(-1), m2: window.getNiveauVertical(-2) };
    });
    verifier(acces.n0.solM === -25 && acces.n0.hauteurM === 3 && acces.n0.plafondM === -22 && acces.n0.ecartM === 2 &&
      acces.n0.sourceHauteur === "plan" && acces.m1.plafondM === -27.5 && acces.m1.ecartM === 2.5 &&
      acces.m2.solM === null && acces.m2.hauteurM === 2,
      "getNiveauVertical : sol, hauteur, plafond et écart lus du plan-config", acces);

    // ── C. ⚙️ Réglages du plan ──
    await page.evaluate(function () { window.afficherConfig(); });
    await attendre(page, function () { return !!document.getElementById("cfg_niveaux_open"); }, 10000);
    const etat0 = await page.evaluate(function () { return document.getElementById("cfg_niveaux_etat").textContent; });
    verifier(/·/.test(etat0) && etat0.length > 5,
      "lanceur des niveaux dans ⚙️ avec son état (« " + etat0 + " »)");
    await page.evaluate(function () {
      const g = document.getElementById("cfg_niveaux_open").closest(".kta-cfg-group");
      if (g && !g.classList.contains("kta-cfg-group-ouvert")) { const t = g.querySelector(".kta-cfg-group-titre"); if (t) t.click(); }
      document.getElementById("cfg_niveaux_open").click();
    });
    await attendre(page, function () { return !!document.getElementById("kta-prof-modal"); }, 5000);
    const dessus = await page.evaluate(function () {
      const b = document.querySelector("#kta-prof-modal .kta-readme-modal-boite").getBoundingClientRect();
      const el = document.elementFromPoint(b.left + b.width / 2, b.top + 20);
      return !!(el && el.closest("#kta-prof-modal"));
    });
    verifier(dessus, "fenêtre des niveaux au-dessus des Réglages");
    tb = await lireTable(page, "#kta-prof-table");
    verifier(tb && tb["0"].ecart.v === "2" && tb["0"].h.v === "3" && tb["-2"].sans, "fenêtre ⚙️ : la même table, valeurs du plan", tb);
    await saisir(page, '#kta-prof-table .kta-prof-ecart[data-ecart="0"]', "-1.5");
    await saisir(page, '#kta-prof-table .kta-prof-h[data-h="-1"]', "2.2");
    await capture(page, "reglages-pc");
    await page.evaluate(function () { document.getElementById("kta-prof-ok").click(); });
    const apres = await page.evaluate(function () {
      const pr = JSON.parse(localStorage.getItem("myktamap_plan_prefs_" + window._currentLoadedPlanId) || "{}");
      return { n0: window.getNiveauVertical(0), m1: window.getNiveauVertical(-1), haut: pr.niveauxHauteur,
        etat: document.getElementById("cfg_niveaux_etat").textContent, modale: !!document.getElementById("kta-prof-modal") };
    });
    verifier(!apres.modale && apres.n0.solM === -21.5 && apres.n0.ecartM === -1.5 && apres.m1.solM === -26.5 &&
      apres.m1.hauteurM === 2.2 && apres.m1.sourceHauteur === "pref" && apres.n0.sourceHauteur === "plan" &&
      JSON.stringify(apres.haut) === JSON.stringify({ "-1": 2.2 }),
      "validé : écart −1,5 relu (entremêlé), sols déplacés, seule la hauteur corrigée en pref", apres);
    await page.evaluate(function () { document.getElementById("cfg_niveaux_open").click(); });
    await attendre(page, function () { return !!document.getElementById("kta-prof-plan"); }, 5000);
    await page.evaluate(function () { document.getElementById("kta-prof-plan").click(); });
    const retour = await page.evaluate(function () {
      return { n0: window.getNiveauVertical(0), m1: window.getNiveauVertical(-1) };
    });
    verifier(retour.n0.solM === -25 && retour.n0.ecartM === 2 && retour.m1.hauteurM === 2.5 && retour.m1.sourceHauteur === "plan",
      "« ↺ Valeurs du plan » : sols et hauteurs du ZIP revenus", retour);

    // Téléphone : la table tient dans la fenêtre.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(function () { document.getElementById("cfg_niveaux_open").click(); });
    await attendre(page, function () { return !!document.getElementById("kta-prof-table"); }, 5000);
    await page.waitForTimeout(300);
    const tel = await page.evaluate(function () {
      const t = document.getElementById("kta-prof-table");
      const champs = Array.prototype.slice.call(t.querySelectorAll("input[type=number]"));
      return { deborde: t.scrollWidth > t.clientWidth + 1, page: document.documentElement.scrollWidth > window.innerWidth + 1,
        minLarg: Math.min.apply(null, champs.map(function (c) { return c.getBoundingClientRect().width; })) };
    });
    verifier(!tel.deborde && !tel.page && tel.minLarg >= 44, "390 px : table sans débordement, champs ≥ 44 px", tel);
    await capture(page, "reglages-telephone");
    await page.evaluate(function () { document.getElementById("kta-prof-close").click(); });
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
    try { fs.rmSync(dossier, { recursive: true, force: true }); } catch (e) { /* dossier temporaire */ }
  }
  if (erreursConsole.length) erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — niveaux en hauteur : Générateur, accès, ⚙️ Réglages du plan.");
})();
