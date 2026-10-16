/* eslint-disable no-console */
// =====================================================================
// attendre.js — attendre qu'une condition évaluée dans la page soit vraie
// =====================================================================
// 🩸 REMPLACE page.waitForFunction dans tous les harnais.
// waitForFunction passe par une évaluation de chaîne que la CSP de l'app
// (script-src 'self', sans 'unsafe-eval') REFUSE : il échouait aussitôt, et
// le harnais concluait « pas chargé » (smoke rouge à l'étape 4 sans défaut
// réel de l'app). page.evaluate n'est pas concerné : on sonde en boucle.
// Ne pas contourner par `bypassCSP` : le harnais ne verrait plus une vraie
// violation de CSP.
//
// attendre(page, fn, delaiMs[, pasMs]) → Promise<true>, rejette au délai.
// =====================================================================
"use strict";

async function attendre(page, fn, delaiMs, pasMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    if (await page.evaluate(fn).catch(function () { return false; })) return true;
    await page.waitForTimeout(pasMs || 250);
  }
  throw new Error("délai dépassé (" + delaiMs + " ms)");
}

module.exports = attendre;
