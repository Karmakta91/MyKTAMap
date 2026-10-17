#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// check-csp-inline.js — garde-fou pre-commit BLOQUANT : aucun script inline
// =====================================================================
// 🔒 La CSP est `script-src 'self'` SANS 'unsafe-inline' : tout script écrit dans la page est bloqué par le
// navigateur — un bouton à onclick ne fait plus rien, sans un mot pour l'utilisateur.
// Règles, sur js/*.js, les *.html de la racine et de docs/applications/, et lang/*.json :
//   1. aucun attribut gestionnaire (onclick=, onerror=…) dans du HTML écrit ou généré → un écouteur
//      (addEventListener / délégation + data-*) ;
//   2. aucun lien `javascript:` (href ou .href) → "#" + preventDefault ;
//   3. aucun <script> sans src dans une page → un fichier js/ ;
//   4. aucune config nginx du dépôt ne rouvre 'unsafe-inline' aux scripts ni ne revient en Report-Only.
// Exception unique : killsw.html (page de secours quand le Service Worker est cassé — son script reste
// DANS la page ; nginx lui donne sa propre CSP).
// Usage : node scripts/check-csp-inline.js (appelé par .githooks/pre-commit)
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
  // Pages servies : racine + docs/applications/ (pages d'audit, dont le script de pied est un piège classique).
  fichiers = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "js/*.js", "*.html", "lang/*.json"],
    { encoding: "utf8" }).split("\n").filter(Boolean)
    .filter((f) => !f.includes("/") || /^(js|lang)\//.test(f) || /^docs\/applications\/[^/]+\.html$/.test(f));
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
// 4. Configs nginx : CSP en vigueur stricte, hors du bloc `location = /killsw.html` ; plus de Report-Only.
const CONFS_NGINX = ["docker/nginx-docker.conf", "docs/nginx-csp-config.conf", "docs/nginx-myktamap.conf"];
const fautesConf = [];
CONFS_NGINX.forEach(function (f) {
  if (!fs.existsSync(f)) return;
  let dansKillsw = 0;
  fs.readFileSync(f, "utf8").split(/\r?\n/).forEach(function (l, i) {
    if (/^\s*#/.test(l)) return;
    if (/location\s*=\s*\/killsw\.html/.test(l)) dansKillsw = 1;
    else if (dansKillsw && /^\s*\}/.test(l)) dansKillsw = 0;
    if (/add_header\s+Content-Security-Policy-Report-Only/.test(l)) fautesConf.push(f + ":" + (i + 1) + " Report-Only (bascule faite)");
    const m = /add_header\s+Content-Security-Policy\s+"([^"]+)"/.exec(l);
    if (m && !dansKillsw && /script-src[^;]*'unsafe-inline'/.test(m[1])) fautesConf.push(f + ":" + (i + 1) + " script-src 'unsafe-inline'");
  });
});
if (fautesConf.length) {
  console.error("❌ [check-csp-inline] la CSP en vigueur rouvre les scripts inline :");
  fautesConf.forEach((x) => console.error("   - " + x));
  process.exit(1);
}
console.log("✅ [check-csp-inline] " + fichiers.length + " fichiers sans script inline ; CSP en vigueur stricte " +
  "(script-src 'self', hors killsw.html).");
