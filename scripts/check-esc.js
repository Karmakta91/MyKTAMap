#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🧹 check-esc.js — garde-fou pré-commit BLOQUANT (rejoué en CI) — 14/10/2026
// =====================================================================
// UN SEUL échappeur HTML : window.ktaEsc (js/langManager.js, 2e script chargé, sans defer). Il y avait ~75
// copies locales, dont des variantes qui oubliaient les guillemets (un nom piégé sortait d'un attribut
// value="…") et des replis qui n'échappaient RIEN quand ktaEsc manquait (`function(x){return x;}`).
// Ce contrôle, sur tous les js/*.js (pas l'index : tout l'arbre, donc rien à passer en CI) :
//   1. ktaEsc défini une seule fois, dans langManager.js, et il échappe vraiment (exécuté contre des charges) ;
//   2. langManager.js chargé juste après copyright.js dans index.html, avant tout module qui s'en sert ;
//   3. aucune nouvelle copie locale : une ligne qui produit « &amp; » ou « &lt; » (littéral entre guillemets)
//      hors des exceptions motivées ci-dessous ; un module garde au plus un alias
//      (`function _esc(s) { return window.ktaEsc(s); }`) ;
//   4. aucun repli « ktaEsc || function… » (ktaEsc est toujours là : un repli ne sert qu'à mal échapper).
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c, detail) => {
  console.log((c ? "✅" : "❌") + " " + n + (c || detail === undefined ? "" : " — " + detail));
  if (!c) ko++;
};
const lire = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

// Exceptions : fichier → nombre de lignes tolérées, avec la raison.
const EXCEPTIONS = {
  "langManager.js": 1,   // l'échappeur canonique lui-même
  "confadmin.js": 1,     // page confadmin.html : ne charge pas langManager.js
  "gpxIO.js": 2,         // _xmlEsc : XML (GPX), « &apos; » et non une entité HTML
  "kmzExport.js": 2,     // _xmlEsc : XML (KML), idem
  "ktaExtensions.js": 1, // assainisseur HTML des extensions : une balise inconnue est rendue en texte
  // Chargés SEULS dans une VM par scripts/check-guidage.js (sans langManager.js) : à migrer quand ce contrôle
  // posera window.ktaEsc dans son contexte. Leurs copies échappent déjà & < > (itiGuidage : les 5).
  "itiGuidage.js": 1,
  "sortieUrgence.js": 3
};
const LITTERAL = /["'`]&(?:amp|lt);["'`]/;
const fichiers = fs.readdirSync("js").filter((f) => f.endsWith(".js"));

// ═════════ 1. Une définition, qui échappe ═════════
{
  const defs = fichiers.filter((f) => /window\.ktaEsc\s*=(?!=)/.test(lire("js/" + f)));
  t("window.ktaEsc défini une seule fois, dans js/langManager.js", defs.length === 1 && defs[0] === "langManager.js",
    defs.join(", "));
  const ctx = {};
  ctx.window = ctx;
  let ok = true;
  try {
    const src = lire("js/langManager.js");
    vm.runInNewContext(src.slice(src.indexOf("window.ktaEsc = ")), ctx);
  } catch (e) { ok = false; console.log(e.message); }
  const E = ctx.ktaEsc;
  t("ktaEsc exécutable seul", ok && typeof E === "function");
  if (typeof E === "function") {
    t("🩸 ktaEsc : & < > \" ' échappés", E(`<img src=x onerror="a('1')">&`) ===
      "&lt;img src=x onerror=&quot;a(&#39;1&#39;)&quot;&gt;&amp;", E(`<img src=x onerror="a('1')">&`));
    t("ktaEsc : null / undefined → \"\", nombre → texte", E(null) === "" && E(undefined) === "" && E(0) === "0");
  }
}

// ═════════ 2. Chargé avant ses utilisateurs ═════════
{
  const html = lire("index.html");
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  t("index.html : langManager.js est le 2e script (après copyright.js), sans defer",
    scripts[0] === "js/copyright.js" && scripts[1] === "js/langManager.js" &&
    /<script src="js\/langManager\.js"><\/script>/.test(html), scripts.slice(0, 3).join(", "));
}

// ═════════ 3. Aucune copie locale ═════════
{
  const fautes = [];
  for (const f of fichiers) {
    const lignes = lire("js/" + f).split("\n");
    const hits = [];
    lignes.forEach((l, i) => { if (!/^\s*\/\//.test(l) && LITTERAL.test(l)) hits.push(i + 1); });
    const tol = EXCEPTIONS[f] || 0;
    if (hits.length > tol) fautes.push("js/" + f + ":" + hits.join(",") + (tol ? " (toléré : " + tol + ")" : ""));
  }
  // Auto-test : le motif voit les formes recensées (table, chaîne de replace) et pas une entité de gabarit.
  const vus = ['return { "&":"&amp;", "<":"&lt;" }[c];', '.replace(/&/g, "&amp;").replace(/</g, "&lt;")',
    "s.replaceAll('<', '&lt;')"].every((l) => LITTERAL.test(l));
  t("motif de copie : voit table, chaîne de replace, replaceAll (auto-test)", vus);
  t("motif de copie : ignore une entité dans un gabarit (auto-test)", !LITTERAL.test("'\">&lt;/&gt;</button>'"));
  t("🩸 aucune copie locale d'échappement HTML — window.ktaEsc (exceptions motivées dans ce script)",
    fautes.length === 0, fautes.join(" | "));
}

// ═════════ 4. Aucun repli « ktaEsc || … » ═════════
{
  const REPLI = /ktaEsc\s*\|\||typeof\s+window\.ktaEsc\s*===?\s*["']function["']\s*\)?\s*\?/;
  const fautes = fichiers.filter((f) => REPLI.test(lire("js/" + f)));
  t("🩸 aucun repli autour de ktaEsc (un repli ne sert qu'à mal échapper)", fautes.length === 0, fautes.join(", "));
}

console.log(ko ? "\n❌ check-esc : " + ko + " échec(s)"
  : "\n🎉 Échappement HTML : un seul window.ktaEsc, chargé avant ses utilisateurs");
process.exit(ko ? 1 : 0);
