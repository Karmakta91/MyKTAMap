// =====================================================================
// check-audit-domaine.js — garde-fou pré-commit BLOQUANT : périmètre de garantie de l'audit réseau figé
// =====================================================================
// Le bloc « Périmètre de garantie : myktamap.fr » vit à DEUX endroits : la modale « Que fait l'app sur le
// réseau ? » (clés `home.netdoc.scope*`, injectées par main.js via data-i18n-html) et la page
// docs/applications/NETWORK_AUDIT.html (+ son jumeau .md).
// 🔒 Il dit « si l'URL ne commence pas par https://myktamap.fr, rien de cette page ne te concerne ».
// « Factoriser » le domaine en `location.origin` / `location.host` ferait qu'une copie servie ailleurs
// se garantirait elle-même : l'audit doit se DÉSAVOUER hors du domaine officiel, donc citer myktamap.fr
// en dur, dans les trois langues. Le domaine de développement n'est pas annoncé publiquement (décision
// produit) : le citer est refusé.
// Usage : node scripts/check-audit-domaine.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function ok(m)  { console.log("✅ " + m); }
function ko(m)  { console.log("❌ " + m); echecs++; }
function verif(c, m) { (c ? ok : ko)(m); }
const RE_PROD = /(^|[^.\w])myktamap\.fr/;           // myktamap.fr hors « dev.myktamap.fr »
const RE_DEV  = /dev\.myktamap\.fr/;
const RE_LOC  = /location\.(origin|host|hostname|href)|\$\{[^}]*origin[^}]*\}|\{origin\}|\{host\}/;

// ── 1. La modale (dictionnaires + index.html) ──────────
for (const lang of ["fr", "en", "es"]) {
  const d = JSON.parse(lire("lang/" + lang + ".json"));
  const t = (k) => (typeof d[k] === "string" ? d[k] : "");
  verif(RE_PROD.test(t("home.netdoc.scopeTitle")), "🌍 " + lang + " : le titre du bloc cite myktamap.fr en dur");
  verif(RE_PROD.test(t("home.netdoc.scope1")), "🌍 " + lang + " : scope1 cite myktamap.fr en dur");
  verif(/https:\/\/myktamap\.fr/.test(t("home.netdoc.scope3")),
        "🩸 " + lang + " : la consigne « vérifie l'URL » cite l'URL officielle en dur");
  const tout = ["scopeTitle", "scope1", "scope2", "scope3"].map(k => t("home.netdoc." + k)).join("\n");
  verif(!RE_LOC.test(tout), "🩸 " + lang + " : aucune origine calculée dans le bloc");
  verif(!RE_DEV.test(tout), "🔒 " + lang + " : le domaine de développement n'est pas cité");
}
{
  const idx = lire("index.html");
  ["scopeTitle", "scope1", "scope2", "scope3"].forEach(function(k) {
    verif(idx.includes('data-i18n-html="home.netdoc.' + k + '"'), "index.html : le bloc rend la clé home.netdoc." + k + " telle quelle (data-i18n-html)");
  });
  const rendu = lire("js/main.js");
  const inj = rendu.slice(rendu.indexOf('querySelectorAll("[data-i18n-html]")'), rendu.indexOf('querySelectorAll("[data-i18n-html]")') + 300);
  verif(inj.includes("el.innerHTML = window.I18n.t(el.getAttribute(\"data-i18n-html\"))") && !RE_LOC.test(inj),
        "🩸 main.js : l'injection data-i18n-html copie le dictionnaire, sans variable d'origine");
}

// ── 2. La page d'audit (html + md) ──────────
{
  const html = lire("docs/applications/NETWORK_AUDIT.html");
  const i = html.indexOf("Périmètre de cette garantie");
  const j = html.indexOf("Le modèle technique", i);
  const sec = (i >= 0 && j > i) ? html.slice(i, j) : "";
  verif(sec.length > 0, "NETWORK_AUDIT.html : section « Périmètre de cette garantie » présente");
  verif(/<code>myktamap\.fr<\/code>/.test(sec) && /https:\/\/myktamap\.fr/.test(sec),
        "🩸 NETWORK_AUDIT.html : le domaine officiel est écrit en dur dans la section");
  verif(!RE_DEV.test(html), "🔒 NETWORK_AUDIT.html : le domaine de développement n'est pas cité");
  verif(!RE_LOC.test(sec) && !/<script/i.test(sec), "🩸 NETWORK_AUDIT.html : la section n'a ni script ni origine calculée");
  const md = lire("docs/applications/NETWORK_AUDIT.md");
  const mi = md.indexOf("Périmètre de cette garantie");
  const mj = md.indexOf("Le modèle technique", mi);
  const msec = (mi >= 0 && mj > mi) ? md.slice(mi, mj) : "";
  verif(/`myktamap\.fr`/.test(msec) && /https:\/\/myktamap\.fr/.test(msec) && !RE_LOC.test(msec) && !RE_DEV.test(md),
        "🩸 NETWORK_AUDIT.md : idem, domaines en dur, aucune origine calculée");
}

// ── 3. Aucun JS ne réécrit ces blocs avec l'origine ──────────
{
  const files = fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js"));
  const suspects = [];
  files.forEach(function(f) {
    lire("js/" + f).split("\n").forEach(function(line, n) {
      if (/netdoc|kta-net-doc|NETWORK_AUDIT/.test(line) && RE_LOC.test(line) && !/^\s*\/\//.test(line)) suspects.push(f + ":" + (n + 1));
    });
  });
  verif(suspects.length === 0, "🩸 aucun module ne mêle le bloc de garantie et location.*" + (suspects.length ? " — " + suspects.join(", ") : ""));
  const hc = lire("js/homeConfig.js");
  verif(/window\.open\("docs\/applications\/NETWORK_AUDIT\.html"/.test(hc), "la page d'audit s'ouvre par un chemin relatif fixe (pas d'URL construite)");
}

console.log("");
if (echecs) { console.log("💥 périmètre de garantie : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 périmètre de garantie : figé sur myktamap.fr aux deux endroits, il se désavoue hors du domaine officiel");
