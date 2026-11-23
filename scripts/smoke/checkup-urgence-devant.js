#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-urgence-devant.js — checkup (Playwright, pas un hook pré-commit) : une alerte d'urgence passe devant
// =====================================================================
// js/alertChecker.js > _aOuvrirDOffice / _recouvrir, js/interfaceAlerts.js > _ktaRecouvrir. Sans serveur : une
// extension d'essai déclare la prise « alertes » (liste en mémoire) et annonce ses changements par
// mktm:alertes-changees, comme le ferait une extension réelle. Vérifie :
// - information affichée puis urgence : l'urgence s'ouvre aussitôt, l'information n'est pas acquittée et revient
//   après la fermeture de l'urgence ;
// - information et urgence arrivées ensemble : l'urgence seule d'abord ; aucun signal « à l'écran »
//   (mktm:alerte-affichee, mktm:alertes-listees) pour l'information avant qu'elle soit affichée ;
// - information affichée + information en attente, puis urgence : les deux reviennent après, ensemble ;
// - urgence affichée : une information comme une autre urgence attendent leur tour (rien n'est recouvert).
// Captures : $URGENCE_SHOTS (défaut : dossier temporaire). Usage : node scripts/smoke/checkup-urgence-devant.js
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const os = require("os");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const SHOTS = process.env.URGENCE_SHOTS || path.join(os.tmpdir(), "kta-checkup-urgence-devant");
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail ? " " + JSON.stringify(detail) : "")); }

function alerte(id, level) {
  return { id: id, level: level, title: "Essai " + id, message: "Message " + id, released: "2026-11-23T10:00:00Z" };
}

// Ce qui est à l'écran : détail (id + niveau), liste (ids), signaux reçus, acquittements de l'appareil.
function etat(page) {
  return page.evaluate(function () {
    const d = document.getElementById("kta-alert-modal");
    const s = document.getElementById("kta-alert-selector-modal");
    const titre = d && d.querySelector(".kta-alert-title-text");
    return {
      detail: titre ? titre.textContent.replace("Essai ", "") : null,
      urgence: !!(d && d.classList.contains("kta-alert-level-emergency")),
      liste: s ? Array.prototype.map.call(s.querySelectorAll(".kta-alert-selector-row"), function (b) {
        return b.getAttribute("data-alert-id"); }) : null,
      affichees: window.__essaiAffichees.slice(),
      listees: window.__essaiListees.slice(),
      vues: Object.keys(localStorage).filter(function (k) { return k.indexOf("myktamap_alert_seen_ext_") === 0; })
        .map(function (k) { return k.replace("myktamap_alert_seen_ext_", ""); })
    };
  });
}

async function publier(page, liste) {
  await page.evaluate(function (l) {
    window.__essaiListe = l;
    window.dispatchEvent(new CustomEvent("mktm:alertes-changees"));
  }, liste);
  await page.waitForTimeout(700);
}
async function compris(page) {
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.waitForTimeout(700);   // dismiss relance la file après 300 ms de fondu
}
async function fermerListe(page) {
  await page.evaluate(function () { const b = document.getElementById("kta-alert-selector-close"); if (b) b.click(); });
  await page.waitForTimeout(700);
}
async function remiseAZero(page) {
  await page.evaluate(function () { window.__essaiAffichees.length = 0; window.__essaiListees.length = 0; });
}

async function scenarios(page) {
  // 1. Information affichée, puis urgence.
  console.log("\n── information affichée, puis urgence ──");
  await publier(page, [alerte("i1", "info")]);
  let e = await etat(page);
  verifier(e.detail === "i1" && !e.urgence, "l'information i1 s'ouvre seule", e);
  await publier(page, [alerte("i1", "info"), alerte("e1", "emergency")]);
  e = await etat(page);
  verifier(e.detail === "e1" && e.urgence, "l'urgence e1 s'ouvre aussitôt, par-dessus i1 retirée", e);
  verifier(e.vues.indexOf("i1") < 0, "i1 recouverte n'est pas acquittée sur l'appareil", e.vues);
  await page.screenshot({ path: path.join(SHOTS, "urgence-devant.png") });
  await compris(page);
  e = await etat(page);
  verifier(e.detail === "i1", "i1 revient après la fermeture de l'urgence", e);
  verifier(e.affichees.join(",") === "ext_i1,ext_e1,ext_i1", "signaux « à l'écran » : i1, e1, puis i1 de nouveau",
    e.affichees);
  await compris(page);
  e = await etat(page);
  verifier(!e.detail && !e.liste && e.vues.indexOf("i1") >= 0, "i1 fermée par « J'ai compris » : acquittée, file vide", e);

  // 2. Information et urgence arrivées ensemble.
  console.log("\n── information et urgence ensemble ──");
  await remiseAZero(page);
  await publier(page, [alerte("i2", "info"), alerte("e2", "emergency")]);
  e = await etat(page);
  verifier(e.detail === "e2" && !e.liste, "l'urgence e2 s'ouvre seule (pas de liste avec i2)", e);
  const signaleI2 = function (x) {
    return x.affichees.indexOf("ext_i2") >= 0 || x.listees.some(function (l) { return l.indexOf("ext_i2") >= 0; });
  };
  verifier(!signaleI2(e), "aucun signal « à l'écran » pour i2 tant qu'elle attend", e);
  await compris(page);
  e = await etat(page);
  verifier(e.detail === "i2" && signaleI2(e), "i2 s'ouvre après l'urgence, et son signal part à ce moment", e);
  await compris(page);

  // 3. Information affichée + information en attente, puis urgence.
  console.log("\n── deux informations, puis urgence ──");
  await remiseAZero(page);
  await publier(page, [alerte("i3", "info")]);
  await publier(page, [alerte("i3", "info"), alerte("w4", "warning")]);
  e = await etat(page);
  verifier(e.detail === "i3" && e.affichees.indexOf("ext_w4") < 0, "w4 attend derrière i3 (comportement d'avant)", e);
  await publier(page, [alerte("i3", "info"), alerte("w4", "warning"), alerte("e3", "emergency")]);
  e = await etat(page);
  verifier(e.detail === "e3", "l'urgence e3 passe devant i3 affichée et w4 en attente", e);
  verifier(e.affichees.indexOf("ext_w4") < 0 && !e.listees.length, "w4 toujours sans signal « à l'écran »", e);
  await compris(page);
  e = await etat(page);
  verifier(Array.isArray(e.liste) && e.liste.length === 2 && e.liste.indexOf("ext_i3") >= 0 && e.liste.indexOf("ext_w4") >= 0,
    "après l'urgence, i3 et w4 reviennent ensemble (liste)", e);
  await fermerListe(page);

  // 4. Urgence affichée : rien ne la recouvre.
  console.log("\n── urgence affichée ──");
  await remiseAZero(page);
  await publier(page, [alerte("e5", "emergency")]);
  await publier(page, [alerte("e5", "emergency"), alerte("i6", "info")]);
  e = await etat(page);
  verifier(e.detail === "e5" && e.affichees.indexOf("ext_i6") < 0, "une information attend derrière une urgence", e);
  await publier(page, [alerte("e5", "emergency"), alerte("i6", "info"), alerte("e7", "emergency")]);
  e = await etat(page);
  verifier(e.detail === "e5", "une autre urgence attend aussi (rien n'est recouvert)", e);
  await compris(page);
  e = await etat(page);
  verifier(e.detail === "e7", "e7, urgence, passe avant i6", e);
  await compris(page);
  e = await etat(page);
  verifier(e.detail === "i6", "puis i6", e);
  await compris(page);
}

(async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const nav = await lancerNavigateur(chromium);
  try {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(function (l) {
      for (const k in l) { try { localStorage.setItem(k, l[k]); } catch (e) {} }
    }, LS_PREGATES);
    page.on("pageerror", function (e) { erreursConsole.push("pageerror : " + e.message); });
    // Fichiers de contrôle absents du serveur local (404 attendus, comme dans les autres checkups).
    page.on("console", function (m) {
      if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|404/i.test(m.text())) {
        erreursConsole.push(m.text());
      }
    });
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!window.AlertChecker && !document.getElementById("splashOverlay"); }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () {
      const b = document.getElementById("kta-alert-ok"); if (b) b.click();
      window.__essaiListe = [];
      window.__essaiAffichees = [];
      window.__essaiListees = [];
      window.addEventListener("mktm:alerte-affichee", function (ev) { window.__essaiAffichees.push(ev.detail.id); });
      window.addEventListener("mktm:alertes-listees", function (ev) {
        window.__essaiListees.push(ev.detail.alertes.map(function (a) { return a.id; }).join(","));
      });
      window.KtaExtensions.register({ nom: "essai-urgence", apiVersion: 1,
        alertes: { lister: function () { return window.__essaiListe; } } });
    });
    await page.waitForTimeout(500);
    await scenarios(page);
    await ctx.close();
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — l'urgence passe devant, l'information revient après, son signal part à l'affichage.");
  process.exit(0);
})();
