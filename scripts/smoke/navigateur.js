/* eslint-disable no-console */
// =====================================================================
// navigateur.js — lancer le navigateur des harnais, avec replis
// =====================================================================
// Ordre : headless shell Playwright → Chromium complet Playwright → Microsoft Edge (présent sur tout
// Windows) : sans ce repli, un poste sans navigateur Playwright ne lance aucun checkup de la porte.
// Seule l'absence du navigateur déclenche un repli ; toute autre erreur remonte.
// lancerNavigateur(chromium[, opts]) → Promise<Browser>
// =====================================================================
"use strict";

function _absent(e) { return /Executable doesn't exist/i.test(String((e && e.message) || "")); }

async function lancerNavigateur(chromium, opts) {
  const base = opts || {};
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

module.exports = lancerNavigateur;
