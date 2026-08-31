#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🌍 checkup-langues.js — CHECKUP CIBLÉ (marche 3 du RELEASE_GATE)
// =====================================================================
// Le smoke (marche 1bis) boote l'app en français et ne dit RIEN des langues.
// Or v1.80.0 livre la doc utilisateur espagnole, et l'incident qui a précédé
// ce train était précisément un problème de langue : ajouter `es` à la liste
// de la Documentation a fait basculer l'AIDE en français pour les
// hispanophones (elle tombait sur l'anglais avant) — un recul, invisible de
// bout en bout parce qu'aucun harnais n'ouvrait ces écrans en espagnol.
//
// Ce script rejoue le parcours d'un utilisateur espagnol et vérifie que les
// DEUX contenus longs sont bien dans sa langue :
//   📖 Documentation   → ESPAGNOL (fichier README_USER.es.md)
//   ❓ Aide intégrée   → ESPAGNOL (clés `aide.sec.*` des dicos, lot 2)
//   🇪🇸 drapeaux       → la Documentation en propose 3 (elle reste sur des
//      fichiers, avec sa portée de langue propre) ; l'Aide n'en a PLUS AUCUN,
//      elle suit la langue globale de l'app comme le tutoriel.
//
// ⚠️ CE FICHIER A DÉJÀ ENCODÉ UN CONTRAT PÉRIMÉ : avant le lot 2 il exigeait
// une Aide en ANGLAIS (repli assumé, faute de contenu espagnol) et exactement
// 2 drapeaux. Ces attentes-là sont devenues fausses le jour où l'Aide a été
// traduite — un test qui n'évolue pas avec le produit finit par défendre
// l'ancien comportement contre le nouveau.
//
// Usage : cd scripts/smoke && node checkup-langues.js
// Non branché au pre-commit (lance un navigateur) — c'est un contrôle de
// release, à passer avant le merge sur main.
// =====================================================================
"use strict";

const { chromium } = require("playwright");

const PORT = 8123;                       // server.js lit son port dans argv[2] :
const BASE = "http://127.0.0.1:" + PORT;   // sans argv, server.js écoute 8123

const LS = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_app_lang": "es"              // ← LE point : on est un utilisateur espagnol
};

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }

// Mots-témoins : présents dans une langue, absents des deux autres. Choisis
// dans des phrases de structure (pas dans du contenu susceptible de bouger).
const TEMOIN_ES = /Gu[ií]a de usuario|Esta gu[ií]a est[aá] destinada/i;
const TEMOIN_FR = /Guide Utilisateur|Ce guide est destin/i;
const TEMOIN_EN = /User Guide|This guide is intended/i;

(async function main() {
  const server = require("./server.js");
  let nav;
  try { nav = await chromium.launch(); }
  catch (e) {
    if (!/Executable doesn't exist/i.test(String(e && e.message))) throw e;
    nav = await chromium.launch({ channel: "chromium" });
  }
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

    // ───────── 📖 DOCUMENTATION : doit être en ESPAGNOL ─────────
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

      const drapeaux = await page.locator("#kta-readme-modal .kta-readme-lang-btn").count();
      if (drapeaux === 3) ok("Documentation : 3 drapeaux proposés (fr/en/es)");
      else pb("Documentation : " + drapeaux + " drapeau(x) au lieu de 3");

      await page.keyboard.press("Escape").catch(function () {});
      await page.waitForTimeout(400);
    }

    // ───────── ❓ AIDE : doit être en ESPAGNOL (lot 2) ─────────
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
      // ES = « ❓ Ayuda — Referencia de los botones »
      if (/Ayuda/i.test(titre)) ok("Aide servie en ESPAGNOL — « " + titre + " »");
      else if (/Help/i.test(titre)) pb("Aide en ANGLAIS — c'était le repli d'AVANT le lot 2 ; le contenu espagnol existe désormais (« " + titre + " »)");
      else if (/Aide/i.test(titre)) pb("Aide en FRANÇAIS — la résolution de langue ne prend pas 'es' (« " + titre + " »)");
      else pb("titre d'Aide non reconnu : « " + titre + " »");

      // Plus AUCUN drapeau : l'Aide suit la langue globale (comme le tutoriel).
      const drapAide = await page.locator("#kta-aide-modal .kta-readme-lang-btn").count();
      if (drapAide === 0) ok("Aide : aucun drapeau (elle suit la langue globale)");
      else pb("Aide : " + drapAide + " drapeau(x) — le toggle local a été retiré au lot 2, il piloterait une clé que l'Aide ne lit plus");

      // Les 2 sections réparées au lot 0 doivent avoir CHACUNE leur ligne,
      // et en espagnol.
      const lignes = await page.locator("#kta-aide-modal .kta-aide-row").allTextContents();
      const joint = lignes.join(" | ");
      if (/Modo perfil/i.test(joint)) ok("fiche « Modo perfil » présente et traduite (bug du conteneur oublié)");
      else pb("« Modo perfil » absente du hub — séparation des 2 sections ou traduction manquante");
      if (/Biblioteca de planos/i.test(joint)) ok("fiche « Biblioteca de planos » présente (section qui n'existait même pas en EN)");
      else pb("« Biblioteca de planos » absente");
      // Un titre resté français signalerait une clé non traduite passée au filet.
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
