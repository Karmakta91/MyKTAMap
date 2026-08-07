#!/usr/bin/env node
/*!
 * MyKTAMap — check-i18n.js
 * Filet de la migration multilingue (chantier v1.45.x).
 *
 * Vérifie :
 *   1. Parité des dicos : toute clé de fr.json existe en en.json et inversement.
 *   2. Clés appelées mais absentes : tout I18n.t("clé") / data-i18n[-html|-title]="clé"
 *      dans js/*.js + index.html doit exister dans fr.json ET en.json.
 *   3. (Info) Clés orphelines : présentes dans le dico mais jamais appelées.
 *   4. Langues WIP (es, …) : contrôle SOUPLE — couverture partielle tolérée
 *      (clés manquantes → fallback fr), mais clé fantôme + {param} divergent = bloquants.
 *
 * Exit 1 si problème BLOQUANT (parité KO OU clé appelée manquante). Les
 * orphelines sont seulement informatives (exit 0).
 *
 * Usage : node scripts/check-i18n.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LANG_DIR = path.join(ROOT, "lang");
const JS_DIR = path.join(ROOT, "js");

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { console.error("❌ JSON illisible : " + p + " — " + e.message); process.exit(2); }
}

const fr = loadJson(path.join(LANG_DIR, "fr.json"));
const en = loadJson(path.join(LANG_DIR, "en.json"));
const frKeys = new Set(Object.keys(fr));
const enKeys = new Set(Object.keys(en));

let blocking = 0;

// ---- 1. Parité ----
const missingInEn = [...frKeys].filter(k => !enKeys.has(k) && !k.startsWith("_meta"));
const missingInFr = [...enKeys].filter(k => !frKeys.has(k) && !k.startsWith("_meta"));
if (missingInEn.length) { blocking++; console.error("❌ Clés en fr.json absentes de en.json (" + missingInEn.length + ") :\n   " + missingInEn.join("\n   ")); }
if (missingInFr.length) { blocking++; console.error("❌ Clés en en.json absentes de fr.json (" + missingInFr.length + ") :\n   " + missingInFr.join("\n   ")); }
if (!missingInEn.length && !missingInFr.length) console.log("✅ Parité fr/en OK (" + frKeys.size + " clés)");

// ---- 2. Clés appelées ----
const called = new Set();
function stripComments(src) {
  // Retire commentaires bloc /* */, HTML <!-- -->, et ligne // (évite les
  // faux positifs sur les exemples en commentaire, ex. `I18n.t("cle")`).
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}
function scanFile(file) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  let m;
  const reT = /I18n\.t\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = reT.exec(src)) !== null) called.add(m[1]);
  // 🆕 v1.46.4 (audit M4) — On capte aussi les alias `_t("…")`, MAIS uniquement
  // dans les fichiers où `_t` est explicitement aliasé à I18n.t (helper inline
  // d'index.html : `const _t = (window.I18n && window.I18n.t) ? window.I18n.t : …`).
  // C'est l'angle mort qui a masqué le bug PIN (`_t("pin.setup.changeBtn")` dans
  // index.html jamais validé). Les modules avec un `_t` LOCAL non-i18n
  // (tutorial.js → UI_STRINGS) n'ont PAS cet alias → ils sont exclus, donc pas
  // de faux positifs. Le lookbehind évite `xxx_t(` / `._t(`.
  if (/_t\s*=\s*[^\n;]*I18n\.t/.test(src)) {
    const reAlias = /(?<![\w.$])_t\(\s*["'`]([^"'`]+)["'`]/g;
    while ((m = reAlias.exec(src)) !== null) called.add(m[1]);
  }
  // 🆕 v1.76.1 (audit i18n) — ALIAS PRÉFIXANTS : `function _t(key, p) {
  // return I18n.t("meminsp." + key, p); }` (memInspector, swInspector).
  // L'heuristique d'affectation ci-dessus ne voit pas une DÉCLARATION de
  // fonction → 161 clés meminsp./swinsp. étaient hors filet : un
  // `_t("nouvelle.cle")` inexistant passait le CI en vert.
  const reFnAlias = /function\s+_t\s*\([^)]*\)\s*\{[^}]*I18n\.t\(\s*["']([\w.]+\.)["']\s*\+/;
  const fnAlias = reFnAlias.exec(src);
  if (fnAlias) {
    const prefix = fnAlias[1];
    const reCall = /(?<![\w.$])_t\(\s*["'`]([^"'`]+)["'`]/g;
    while ((m = reCall.exec(src)) !== null) called.add(prefix + m[1]);
  }
  // 🆕 v1.76.1 — TERNAIRES : t(cond ? "a.b" : "c.d") — 64 clés sur 13
  // fichiers étaient invisibles (la regex principale exige la chaîne collée
  // à la parenthèse). Contexte d'appel `t(`/`T(` exigé : sans lui, un
  // `cond ? "a.png" : "b.png"` quelconque deviendrait un ❌ bloquant à tort.
  // Les conditions contenant parenthèses/quotes ne matchent pas — couverture
  // partielle assumée, préférable à un faux positif bloquant.
  const reTern = /(?<![\w.$])[tT]\(\s*[^()"'`]*\?\s*["'`]([\w.]+\.[\w.]+)["'`]\s*:\s*["'`]([\w.]+\.[\w.]+)["'`]/g;
  while ((m = reTern.exec(src)) !== null) { called.add(m[1]); called.add(m[2]); }
  // 🆕 v1.76.1 — CLÉ EN VARIABLE : `const xKey = "prefixe." + …` puis
  // t(xKey) (legendCustomization, profileGamification). Le préfixe littéral
  // devient un préfixe dynamique (même traitement que t("prefixe." + v)).
  const reVarKey = /(?:const|let|var)\s+\w*[Kk]ey\w*\s*=\s*["'`]([\w.]+\.)["'`]\s*\+/g;
  while ((m = reVarKey.exec(src)) !== null) called.add(m[1]);
  // 🆕 v1.76.1 — ALIAS LOCAUX NON PRÉFIXANTS `t` et `T` (batteryGuard,
  // compass, exporter, pdfExport, createConf, homeLoader…) : capté UNIQUEMENT
  // si le fichier déclare l'alias vers I18n.t (const/let/var t = … I18n.t…,
  // bind inclus), et seulement les littéraux à point (forme d'une clé).
  // Réduit massivement le bruit « orphelines » et met ces appels sous filet.
  ["t", "T"].forEach(function(alias) {
    const decl = new RegExp("(?:const|let|var)\\s+" + alias + "\\s*=\\s*[^\\n;]*I18n(?:\\.t|\\))");
    if (!decl.test(src)) return;
    const reCall = new RegExp("(?<![\\w.$])" + alias + "\\(\\s*[\"'`]([\\w.]+\\.[\\w.]+)[\"'`]", "g");
    while ((m = reCall.exec(src)) !== null) called.add(m[1]);
  });
  const reAttr = /data-i18n(?:-html|-title)?\s*=\s*"([^"]+)"/g;
  while ((m = reAttr.exec(src)) !== null) called.add(m[1]);
}
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith(".js")) scanFile(p);
  }
}
walk(JS_DIR);
scanFile(path.join(ROOT, "index.html"));

// Ignore les clés à construction DYNAMIQUE : I18n.t("prefix." + var) capture le
// littéral "prefix." (terminé par un point) → ce n'est pas une vraie clé.
const calledLiteral = [...called].filter(k => !k.endsWith("."));
const dynamicPrefixes = [...called].filter(k => k.endsWith("."));
const calledMissing = calledLiteral.filter(k => !frKeys.has(k) || !enKeys.has(k));
if (calledMissing.length) {
  blocking++;
  console.error("❌ Clés appelées mais absentes d'un dico (" + calledMissing.length + ") :\n   " + calledMissing.join("\n   "));
} else {
  console.log("✅ Toutes les clés appelées (" + called.size + ") existent dans fr + en");
}

// ---- 2bis. Parité des interpolations {param} fr vs en ----
function params(str) {
  const set = new Set();
  if (typeof str !== "string") return set;
  let m; const re = /\{(\w+)\}/g;
  while ((m = re.exec(str)) !== null) set.add(m[1]);
  return set;
}
const paramMismatch = [];
for (const k of frKeys) {
  if (k.startsWith("_meta") || !enKeys.has(k)) continue;
  const pf = params(fr[k]), pe = params(en[k]);
  const onlyFr = [...pf].filter(x => !pe.has(x));
  const onlyEn = [...pe].filter(x => !pf.has(x));
  if (onlyFr.length || onlyEn.length) {
    paramMismatch.push(k + " (fr-only: " + (onlyFr.join(",") || "-") + " | en-only: " + (onlyEn.join(",") || "-") + ")");
  }
}
if (paramMismatch.length) {
  blocking++;
  console.error("❌ Interpolations {param} divergentes fr/en (" + paramMismatch.length + ") :\n   " + paramMismatch.slice(0, 40).join("\n   "));
} else {
  console.log("✅ Interpolations {param} cohérentes fr/en");
}

// ---- 3. Orphelines (info) ----
// Exclut les clés couvertes par un préfixe dynamique (ex. "legendui.label."
// → "legendui.label.salle" est utilisée via concat, pas orpheline).
const orphans = [...frKeys].filter(k =>
  !k.startsWith("_meta") &&
  !called.has(k) &&
  !dynamicPrefixes.some(p => k.startsWith(p))
);
if (orphans.length) {
  console.log("ℹ️  Clés dico jamais appelées (" + orphans.length + ") — info, pas bloquant" +
              (orphans.length <= 40 ? " :\n   " + orphans.join("\n   ") : " (liste tronquée)."));
}

// ---- 4. Langues additionnelles WIP (ex. es) : contrôle SOUPLE ----
// fr/en = parité stricte (ci-dessus). Les autres dicos lang/<code>.json sont des
// traductions en cours : couverture partielle TOLÉRÉE (clés manquantes → fr).
// On vérifie quand même : aucune clé fantôme (absente de fr) + parité {param}.
const EXTRA_LANGS = fs.readdirSync(LANG_DIR)
  .filter(f => /^[a-z]{2}\.json$/.test(f))
  .map(f => f.slice(0, 2))
  .filter(code => code !== "fr" && code !== "en");
for (const code of EXTRA_LANGS) {
  const dict = loadJson(path.join(LANG_DIR, code + ".json"));
  const dictKeys = new Set(Object.keys(dict));
  const ghost = [...dictKeys].filter(k => !frKeys.has(k) && !k.startsWith("_meta"));
  if (ghost.length) {
    blocking++;
    console.error("❌ Clés en " + code + ".json absentes de fr.json (" + ghost.length + ") :\n   " + ghost.slice(0, 40).join("\n   "));
  }
  const pm = [];
  for (const k of dictKeys) {
    if (k.startsWith("_meta") || !frKeys.has(k)) continue;
    const pf = params(fr[k]), px = params(dict[k]);
    const onlyFr = [...pf].filter(x => !px.has(x));
    const onlyX  = [...px].filter(x => !pf.has(x));
    if (onlyFr.length || onlyX.length) pm.push(k + " (fr-only: " + (onlyFr.join(",") || "-") + " | " + code + "-only: " + (onlyX.join(",") || "-") + ")");
  }
  if (pm.length) {
    blocking++;
    console.error("❌ Interpolations {param} divergentes fr/" + code + " (" + pm.length + ") :\n   " + pm.slice(0, 40).join("\n   "));
  }
  const translatable = [...frKeys].filter(k => !k.startsWith("_meta")).length;
  const done = [...dictKeys].filter(k => !k.startsWith("_meta") && frKeys.has(k)).length;
  const pct = translatable ? Math.round((done / translatable) * 1000) / 10 : 0;
  // 🆕 v1.76.1 (audit i18n) — PARITÉ STRICTE pour les langues PROMUES (liste
  // en dur : un test « pct >= 100 » s'auto-désactiverait précisément quand
  // une clé manque). es est à 100 % depuis v1.68 : le mode « WIP souple »
  // ne protégeait plus rien, il masquait les régressions futures. Une
  // nouvelle langue se promeut ICI une fois sa traduction complète.
  const STRICT_LANGS = ["es"];
  if (STRICT_LANGS.indexOf(code) >= 0) {
    const missing = [...frKeys].filter(k => !k.startsWith("_meta") && !dictKeys.has(k));
    if (missing.length) {
      blocking++;
      console.error("❌ " + code + ".json était à 100% : clés fr manquantes (" + missing.length + ") :\n   " + missing.slice(0, 40).join("\n   "));
    } else {
      console.log("✅ " + code + ".json : parité STRICTE " + done + "/" + translatable + " (promue, plus de mode souple)");
    }
  } else {
    console.log("ℹ️  " + code + ".json (WIP) : " + done + "/" + translatable + " clés traduites (" + pct + "%)" +
                (ghost.length || pm.length ? "" : " — structure OK"));
  }
}

if (blocking) { console.error("\n❌ check-i18n : " + blocking + " problème(s) bloquant(s)."); process.exit(1); }
console.log("\n✅ check-i18n : tout est cohérent.");
process.exit(0);
