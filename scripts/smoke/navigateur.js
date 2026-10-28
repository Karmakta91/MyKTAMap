/* eslint-disable no-console */
// =====================================================================
// navigateur.js — lancer le navigateur des harnais, avec replis
// =====================================================================
// Ordre : headless shell Playwright → Chromium complet Playwright → Microsoft Edge (présent sur tout
// Windows) : sans ce repli, un poste sans navigateur Playwright ne lance aucun checkup de la porte.
// Seule l'absence du navigateur déclenche un repli ; toute autre erreur remonte.
// lancerNavigateur(chromium[, opts]) → Promise<Browser>
// Moteurs : moteurs() lit KTA_MOTEURS (« chromium,webkit » par défaut) ; lancerMoteur(nom[, opts]) → Promise<Browser|null>.
// WebKit = le moteur de Safari, donc de tout navigateur iPhone : deux bugs iPhone sont passés sous Chromium seul.
// WebKit absent (pas téléchargé) : null, le harnais le dit et joue le reste — jamais un faux vert silencieux.
// =====================================================================
"use strict";

function _absent(e) { return /Executable doesn't exist/i.test(String((e && e.message) || "")); }

async function lancerNavigateur(chromium, opts) {
  const base = opts || {};
  // KTA_MOTEURS=webkit : tout checkup se joue sous WebKit sans être modifié (balayage Safari). Un checkup qui
  // ouvre une session CDP (Chromium seul) échouera là : c'est attendu, pas un bug de l'app.
  if (moteurs().length === 1 && moteurs()[0] === "webkit") {
    const wk = await lancerMoteur("webkit", base);
    if (wk) return wk;
    throw new Error("KTA_MOTEURS=webkit mais WebKit absent (npx playwright install webkit)");
  }
  const essais = [base, Object.assign({}, base, { channel: "chromium" }), Object.assign({}, base, { channel: "msedge" })];
  for (let i = 0; i < essais.length; i++) {
    try {
      return await chromium.launch(essais[i]);
    } catch (e) {
      if (!_absent(e) || i === essais.length - 1) throw e;
      console.log("[harnais] navigateur absent → repli sur « " + essais[i + 1].channel + " »");
    }
  }
}

function moteurs() {
  const v = String(process.env.KTA_MOTEURS || "chromium,webkit").toLowerCase();
  return v.split(",").map(function (m) { return m.trim(); }).filter(function (m) { return m === "chromium" || m === "webkit"; });
}

async function lancerMoteur(nom, opts) {
  const pw = require("playwright");
  if (nom !== "webkit") return lancerNavigateur(pw.chromium, opts);
  try {
    return await pw.webkit.launch(opts || {});
  } catch (e) {
    if (!_absent(e)) throw e;
    console.log("[harnais] ⚠️ WebKit absent : moteur SAUTÉ (installer : npx playwright install webkit)");
    return null;
  }
}

module.exports = lancerNavigateur;
module.exports.moteurs = moteurs;
module.exports.lancerMoteur = lancerMoteur;
