#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-langues.js — checkup ciblé (marche 3 du RELEASE_GATE), non branché au pre-commit
// =====================================================================
// Le smoke boote en français et ne dit rien des langues. 🩸 Ajouter une langue à la Documentation peut
// faire basculer l'AIDE dans une autre langue pour ses lecteurs, sans qu'aucun autre harnais ne le voie.
// Rejoue le parcours d'un utilisateur espagnol :
//   Documentation → espagnol (README_USER.es.md), menu à 3 langues + bouton Aide IA ;
//   Aide intégrée → espagnol (clés `aide.sec.*` des dicos), AUCUN drapeau : elle suit la langue globale.
// ⚠️ Faire évoluer les attentes avec le produit : un test figé finit par défendre l'ancien comportement.
// Usage : cd scripts/smoke && node checkup-langues.js (lance un navigateur ; à passer avant le merge main).
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge

const PORT = parseInt(process.env.SMOKE_PORT, 10) || 8123;   // server.js : argv[2], puis SMOKE_PORT,
const BASE = "http://127.0.0.1:" + PORT;   // puis 8123

const LS = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_app_lang": "es"
};

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }

// Mots-témoins propres à une langue, pris dans des phrases de structure (stables)
const TEMOIN_ES = /Gu[ií]a de usuario|Esta gu[ií]a est[aá] destinada/i;
const TEMOIN_FR = /Guide Utilisateur|Ce guide est destin/i;
const TEMOIN_EN = /User Guide|This guide is intended/i;

(async function main() {
  const server = require("./server.js");
  let nav;
  nav = await lancerNavigateur(chromium);
  const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", function (e) { pb("pageerror : " + String(e).slice(0, 180)); });
  page.on("console", function (m) {
    if (m.type() === "warning" && /Clé manquante|Cle manquante/.test(m.text())) pb("i18n : " + m.text().slice(0, 140));
  });
  await page.addInitScript(function (ls) { for (const k in ls) localStorage.setItem(k, ls[k]); }, LS);

  try {
    console.log("— Boot en ESPAGNOL (myktamap_app_lang = es) —");
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2600);

    const langue = await page.evaluate(function () {
      return (window.I18n && typeof window.I18n.getLang === "function") ? window.I18n.getLang() : "?";
    });
    if (langue === "es") ok("l'app tourne bien en espagnol (I18n.getLang = es)");
    else pb("langue de l'app = " + langue + " au lieu de es — le reste du checkup ne prouverait rien");

    // ── Documentation : en espagnol ──────────
    console.log("— 📖 Documentation —");
    const docOk = await page.evaluate(function () {
      if (typeof window.afficherReadme === "function") { window.afficherReadme(); return true; }
      return false;
    });
    if (!docOk) pb("afficherReadme non exposée — impossible de vérifier la doc");
    else {
      await page.waitForTimeout(2200);   // fetch du .md + rendu markdown
      const txt = await page.evaluate(function () {
        const m = document.querySelector("#kta-readme-modal .kta-readme-modal-corps");
        return m ? m.textContent.slice(0, 6000) : "";
      });
      if (!txt) pb("corps de la Documentation vide");
      else if (TEMOIN_ES.test(txt)) ok("Documentation servie en ESPAGNOL");
      else if (TEMOIN_FR.test(txt)) pb("Documentation en FRANÇAIS — repli silencieux : README_USER.es.md absent du serveur ou 'es' pas dans DOC_AVAILABLE_LANGS");
      else if (TEMOIN_EN.test(txt)) pb("Documentation en ANGLAIS — la résolution de langue ne prend pas 'es'");
      else pb("Documentation dans une langue non identifiée (aucun mot-témoin) — début : " + txt.slice(0, 90).replace(/\s+/g, " "));

      const drapeaux = await page.locator("#kta-readme-modal #kta-readme-lang-select option").count();
      if (drapeaux === 3) ok("Documentation : 3 langues proposées dans le menu (fr/en/es)");
      else pb("Documentation : " + drapeaux + " langue(s) dans le menu au lieu de 3");
      const btnIa = await page.locator("#kta-readme-modal #kta-readme-aiia-btn").count();
      if (btnIa === 1) ok("Documentation : bouton 🤖 Aide IA présent dans l'en-tête");
      else pb("Documentation : bouton 🤖 Aide IA absent de l'en-tête");

      await page.keyboard.press("Escape").catch(function () {});
      await page.waitForTimeout(400);
    }

    // ── Aide : en espagnol ──────────
    console.log("— ❓ Aide intégrée (attendu : espagnol) —");
    const aideOk = await page.evaluate(function () {
      if (typeof window.afficherAide === "function") { window.afficherAide(); return true; }
      return false;
    });
    if (!aideOk) pb("afficherAide non exposée");
    else {
      await page.waitForTimeout(900);
      const titre = await page.evaluate(function () {
        const t = document.querySelector("#kta-aide-modal .kta-readme-modal-titre");
        return t ? t.textContent.trim() : "";
      });
      if (/Ayuda/i.test(titre)) ok("Aide servie en ESPAGNOL — « " + titre + " »");
      else if (/Help/i.test(titre)) pb("Aide en ANGLAIS — c'était le repli d'AVANT le lot 2 ; le contenu espagnol existe désormais (« " + titre + " »)");
      else if (/Aide/i.test(titre)) pb("Aide en FRANÇAIS — la résolution de langue ne prend pas 'es' (« " + titre + " »)");
      else pb("titre d'Aide non reconnu : « " + titre + " »");

      const drapAide = await page.locator("#kta-aide-modal .kta-readme-lang-btn").count();
      if (drapAide === 0) ok("Aide : aucun drapeau (elle suit la langue globale)");
      else pb("Aide : " + drapAide + " drapeau(x) — le toggle local a été retiré au lot 2, il piloterait une clé que l'Aide ne lit plus");

      // Deux sections sujettes à disparaître : chacune sa ligne, traduite.
      const lignes = await page.locator("#kta-aide-modal .kta-aide-row").allTextContents();
      const joint = lignes.join(" | ");
      // 🩸 titres lus dans les dicos, jamais recopiés : une reformulation ferait échouer le contrôle à tort.
      const _dico = function (l) {
        return JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "..", "lang", l + ".json"), "utf8"));
      };
      const ES = _dico("es"), FR = _dico("fr");
      [["profil", "bug du conteneur oublié"], ["bibliotheque-plans", "section qui n'existait même pas en EN"]].forEach(function (c) {
        const tEs = ES["aide.sec." + c[0] + ".titre"] || "";
        const tFr = FR["aide.sec." + c[0] + ".titre"] || "";
        if (tEs && tEs !== tFr && lignes.some(function (l) { return l.indexOf(tEs) >= 0; })) ok("fiche « " + tEs + " » présente et traduite (" + c[1] + ")");
        else pb("fiche « " + c[0] + " » absente du hub ou non traduite (« " + tEs + " »)");
      });
      const residusFr = lignes.filter(function (t) { return /Réglages|Recherche unifiée|Mon carnet|Astuces/i.test(t); });
      if (!residusFr.length) ok("aucun titre de section resté en français");
      else pb("titre(s) non traduit(s) : " + residusFr.slice(0, 3).join(" / "));
      console.log("     (" + lignes.length + " lignes dans le hub)");
    }
  } catch (e) {
    pb("exception du scénario : " + String(e).slice(0, 250));
  } finally {
    await nav.close();
    if (server && server.close) server.close();
  }

  console.log("");
  if (problemes.length) {
    console.log("⚠️ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP LANGUES VERT — Documentation ET Aide en espagnol, aucun drapeau trompeur.");
  process.exit(0);
})();
