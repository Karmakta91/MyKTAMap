#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// 🛡️ check-csp-inline.js — garde-fou pre-commit BLOQUANT
// =====================================================================
// La CSP vise `script-src 'self'` SANS 'unsafe-inline' : une fois en place, tout
// script écrit dans la page est BLOQUÉ par le navigateur — un bouton qui portait
// un onclick ne fait plus rien, sans un mot pour l'utilisateur.
//
// POURQUOI (07/10/2026) : les 11 gestionnaires inline, 2 liens javascript: et
// 3 blocs <script> qui restaient ont été retirés en une fois. Sans ce garde-fou,
// le premier `onclick="…"` vite écrit réintroduit la dépendance, et la CSP
// stricte casse l'app ou doit être rouverte.
//
// RÈGLES, sur js/*.js, les pages *.html de la racine et lang/*.json :
//   1. aucun attribut gestionnaire (onclick=, onerror=, onload=… ) dans du HTML
//      écrit ou généré → un écouteur (addEventListener / délégation, data-*) ;
//   2. aucun lien `javascript:` (href ou .href) → "#" + preventDefault ;
//   3. aucun <script> sans src dans une page → un fichier js/.
// Exception unique, assumée : killsw.html (page de secours quand le Service Worker
// est cassé — son script doit rester DANS la page ; nginx lui donne sa propre CSP).
//
// Usage : node scripts/check-csp-inline.js   (appelé par .githooks/pre-commit)
// =====================================================================
"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");

const EXCEPTIONS = new Set(["killsw.html"]);
// Attribut gestionnaire : on<mot>= suivi d'une ouverture de valeur (" ' ` ou \" dans une chaîne JS).
const RE_ON = /\son[a-z]{3,20}\s*=\s*(\\?["'`])/gi;
const RE_JS_URL = /(href\s*=\s*\\?["']|\.href\s*=\s*["'])\s*javascript:/gi;
const RE_SCRIPT_INLINE = /<script(?![^>]*\bsrc\s*=)[^>]*>/gi;

function fautes(nom, texte) {
  const out = [];
  const lignes = texte.split(/\r?\n/);
  lignes.forEach(function (l, i) {
    const t = l.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("<!--")) return;   // commentaire
    let m;
    RE_ON.lastIndex = 0;
    while ((m = RE_ON.exec(l))) out.push(nom + ":" + (i + 1) + "  gestionnaire inline « " + m[0].trim() + "… »");
    RE_JS_URL.lastIndex = 0;
    if (RE_JS_URL.test(l)) out.push(nom + ":" + (i + 1) + "  lien javascript:");
    if (/\.html$/.test(nom)) {
      RE_SCRIPT_INLINE.lastIndex = 0;
      if (RE_SCRIPT_INLINE.test(l)) out.push(nom + ":" + (i + 1) + "  <script> inline (sans src)");
    }
  });
  return out;
}

// Auto-test : chaque sabotage doit être vu, chaque cas sain laissé passer.
const SABOTAGES = [
  ["a.js", "html += '<button onclick=\"go()\">';"],
  ["a.js", "x = `<img src=\"${u}\" onerror=\"this.remove()\">`;"],
  ["a.js", "el.innerHTML = '<a href=\\\"#\\\" onclick=\\\"f()\\\">';"],
  ["a.js", "btn.href = \"javascript:void(0)\";"],
  ["p.html", "<a href=\"javascript:alert(1)\">x</a>"],
  ["p.html", "<script>alert(1)</script>"],
  ["p.html", "  <script type=\"text/javascript\">"],
];
const SAINS = [
  ["a.js", "el.addEventListener(\"click\", f);"],
  ["a.js", "img.onerror = function () {};"],                      // propriété DOM : pas du HTML
  ["a.js", "// remplace les onclick=\"…\" inline"],               // commentaire
  ["a.js", "'<button data-sortie-action=\"tracer\">'"],
  ["p.html", "<script src=\"js/a.js\"></script>"],
  ["p.html", "<script defer src=\"js/a.js\"></script>"],
  ["a.js", "if (/^javascript:/i.test(s)) return false;"],
];
const rate = SABOTAGES.filter((c) => fautes(c[0], c[1]).length === 0).map((c) => c[1]);
const faux = SAINS.filter((c) => fautes(c[0], c[1]).length > 0).map((c) => c[1]);
if (rate.length || faux.length) {
  console.error("❌ [check-csp-inline] l'auto-test échoue :");
  rate.forEach((c) => console.error("   non vu : " + c));
  faux.forEach((c) => console.error("   faux positif : " + c));
  process.exit(1);
}

let fichiers;
try {
  fichiers = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "js/*.js", "*.html", "lang/*.json"],
    { encoding: "utf8" }).split("\n").filter(Boolean)
    .filter((f) => !f.includes("/") || /^(js|lang)\//.test(f));   // *.html : racine seulement
} catch (e) {
  console.error("❌ [check-csp-inline] git ls-files impossible : " + e.message);
  process.exit(1);
}

const toutes = [];
fichiers.forEach(function (f) {
  if (EXCEPTIONS.has(f) || !fs.existsSync(f)) return;
  fautes(f, fs.readFileSync(f, "utf8")).forEach((x) => toutes.push(x));
});
if (toutes.length) {
  console.error("❌ [check-csp-inline] " + toutes.length + " script(s) inline — la CSP stricte les bloquera :");
  toutes.slice(0, 30).forEach((x) => console.error("   - " + x));
  console.error("   → un écouteur (addEventListener, délégation + data-*), \"#\" + preventDefault, ou un fichier js/.");
  process.exit(1);
}
console.log("✅ [check-csp-inline] " + fichiers.length + " fichiers sans script inline (CSP script-src 'self' possible).");
