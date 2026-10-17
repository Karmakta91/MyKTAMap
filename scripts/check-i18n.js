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
const concatPrefixes = new Set();  // littéraux suivis d'un « + » (préfixes, pas des clés)
const textOnlyKeys = new Set();    // cles rendues en textContent (voir §5)
const literalsInCode = new Set();  // tout littéral à-point du source (canal orphelines seul)
function stripComments(src) {
  // Retire les commentaires (évite les faux positifs sur les exemples `I18n.t("cle")`).
  // 🩸 « Le mangeur de blocs » : seuls les commentaires qui OUVRENT la ligne sont retirés. Une regex
  // `/\/\*[\s\S]*?\*\//g` libre prend le « /* » de `accept="image/*"` et avale tout jusqu'au
  // prochain « */ » (jusqu'aux deux tiers d'un fichier hors filet). En fin de ligne, un exemple est
  // au pire SCANNÉ (sur-couverture bénigne), jamais du code avalé.
  return src
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^[ \t]*(?:\*\s|\/\/)[^\n]*/gm, " ");
}
function scanFile(file) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  let m;
  const reT = /I18n\.t\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = reT.exec(src)) !== null) called.add(m[1]);
  // Alias `_t("…")`, seulement si le fichier aliase `_t` à I18n.t (sinon des clés appelées échappent
  // au filet). Un `_t` LOCAL non-i18n (tutorial.js → UI_STRINGS) est exclu ; le lookbehind évite
  // `xxx_t(` / `._t(`.
  if (/_t\s*=\s*[^\n;]*I18n\.t/.test(src)) {
    const reAlias = /(?<![\w.$])_t\(\s*["'`]([^"'`]+)["'`]/g;
    while ((m = reAlias.exec(src)) !== null) called.add(m[1]);
  }
  // Alias PRÉFIXANTS déclarés par fonction : `function _t(key, p) { return I18n.t("meminsp." + key, p); }`
  // (memInspector, swInspector) ; l'heuristique d'affectation ci-dessus ne les voit pas.
  const reFnAlias = /function\s+_t\s*\([^)]*\)\s*\{[^}]*I18n\.t\(\s*["']([\w.]+\.)["']\s*\+/;
  const fnAlias = reFnAlias.exec(src);
  if (fnAlias) {
    const prefix = fnAlias[1];
    const reCall = /(?<![\w.$])_t\(\s*["'`]([^"'`]+)["'`]/g;
    while ((m = reCall.exec(src)) !== null) called.add(prefix + m[1]);
  }
  // Ternaires `t(cond ? "a.b" : "c.d")`, `I18n.t(…)`, `_t(…)`. ⚠️ Contexte d'appel exigé : un
  // `cond ? "a.png" : "b.png"` quelconque deviendrait un ❌ bloquant à tort. Une condition avec
  // parenthèses/quotes ne matche pas (couverture partielle assumée, plutôt qu'un faux positif).
  const reTern = /(?:I18n\.t|(?<![\w.$])_t|(?<![\w.$])[tT])\(\s*[^()"'`]*\?\s*["'`]([\w.]+\.[\w.]+)["'`]\s*:\s*["'`]([\w.]+\.[\w.]+)["'`]/g;
  while ((m = reTern.exec(src)) !== null) { called.add(m[1]); called.add(m[2]); }
  // Clé en variable : `const x = "prefixe." + …` puis t(x). Toute variable : le préfixe finit par un
  // point, il ne nourrit que les préfixes dynamiques, jamais le canal bloquant.
  const reVarKey = /(?:const|let|var)\s+[\w$]+\s*=\s*["'`]([\w.]+\.)["'`]\s*\+/g;
  while ((m = reVarKey.exec(src)) !== null) called.add(m[1]);
  // Alias locaux `t` / `T` : captés seulement si le fichier les déclare vers I18n.t (bind inclus),
  // et seulement les littéraux à point (forme d'une clé).
  ["t", "T"].forEach(function(alias) {
    const decl = new RegExp("(?:const|let|var)\\s+" + alias + "\\s*=\\s*[^\\n;]*I18n(?:\\.t|\\))");
    if (!decl.test(src)) return;
    const reCall = new RegExp("(?<![\\w.$])" + alias + "\\(\\s*[\"'`]([\\w.]+\\.[\\w.]+)[\"'`]", "g");
    while ((m = reCall.exec(src)) !== null) called.add(m[1]);
  });
  // Alias déclarés par fonction, non préfixants (`function t(key, params) { … I18n.t(key …`) :
  // détection GÉNÉRIQUE, sans liste en dur. ⚠️ Garde : le 1er paramètre est repassé TEL QUEL à
  // I18n.t (avec ou sans fallback) ; seuls les littéraux à point sont captés.
  const aliasNoms = new Set();
  const reDeclFn = /function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*\{[\s\S]{0,260}?I18n\.t\(\s*\2\b/g;
  while ((m = reDeclFn.exec(src)) !== null) aliasNoms.add(m[1]);
  aliasNoms.forEach(function(alias) {
    const reCall = new RegExp("(?<![\\w.$])" + alias.replace(/\$/g, "\\$") + "\\(\\s*[\"'`]([\\w.]+\\.[\\w.]+)[\"'`]", "g");
    while ((m = reCall.exec(src)) !== null) called.add(m[1]);
  });
  // Clés en propriété `labelKey: "voice.cmd.zoomIn"` (consommées plus tard via t(entry.labelKey)).
  // ⚠️ Noms RESTREINTS (labelKey, titleKey…) : un `apiKey: "x.y"` ne doit pas bloquer à tort.
  const reProp = /(?:label|title|hint|text|msg|desc|name|status)Key\s*:\s*["'`]([\w.]+\.[\w.]+)["'`]/g;
  while ((m = reProp.exec(src)) !== null) called.add(m[1]);
  // Attributs data-i18n, -html, -title, -placeholder.
  const reAttr = /data-i18n(?:-html|-title|-placeholder)?\s*=\s*"([^"]+)"/g;
  while ((m = reAttr.exec(src)) !== null) called.add(m[1]);
  // Canal séparé (§5) : les attributs qui posent du TEXTE. Le `=` exigé après le suffixe optionnel
  // exclut `data-i18n-html="…"`.
  const reAttrTexte = /data-i18n(?:-title|-placeholder)?\s*=\s*"([^"]+)"/g;
  while ((m = reAttrTexte.exec(src)) !== null) textOnlyKeys.add(m[1]);
  // ⚠️ Canal ORPHELINES uniquement : tout littéral à point (tables de clés, mappings) retire de
  // fausses orphelines. JAMAIS le canal bloquant : un littéral quelconque ne doit pas casser la CI.
  const reLit = /["'`]([\w]+(?:\.[\w-]+)+)["'`]/g;
  while ((m = reLit.exec(src)) !== null) literalsInCode.add(m[1]);
  // Littéral suivi d'un « + » (`_t("a.b" + (n > 1 ? ".plural" : ".one"))`) : c'est un PRÉFIXE sans
  // point final. Collecté À PART : exclu des clés exigées (sinon ❌ à tort), ajouté aux préfixes.
  const reConcat = /(?<![\w.$])(?:I18n\.t|_t|t|T)\(\s*["'`]([\w.]+)["'`]\s*\+/g;
  while ((m = reConcat.exec(src)) !== null) concatPrefixes.add(m[1]);
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

// Préfixes dynamiques (`"prefix."` + var, et concatPrefixes) : pas des clés exigées.
const calledLiteral = [...called].filter(k => !k.endsWith(".") && !concatPrefixes.has(k));
const dynamicPrefixes = [...called].filter(k => k.endsWith(".")).concat([...concatPrefixes]);
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
// Une clé couverte par un préfixe dynamique n'est pas orpheline.
const orphans = [...frKeys].filter(k =>
  !k.startsWith("_meta") &&
  !called.has(k) &&
  !literalsInCode.has(k) &&                      // présent textuellement ≠ orphelin
  !dynamicPrefixes.some(p => k.startsWith(p))
);
if (orphans.length) {
  console.log("ℹ️  Clés dico jamais appelées (" + orphans.length + ") — info, pas bloquant" +
              (orphans.length <= 40 ? " :\n   " + orphans.join("\n   ") : " (liste tronquée)."));
  // CHECK_I18N_DUMP=1 : liste complète dans scripts/i18n-orphelines.txt (tri périodique).
  if (process.env.CHECK_I18N_DUMP === "1") {
    fs.writeFileSync(path.join(__dirname, "i18n-orphelines.txt"), orphans.sort().join("\n") + "\n");
    console.log("   → liste complète écrite dans scripts/i18n-orphelines.txt (CHECK_I18N_DUMP)");
  }
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
  // ⚠️ Parité STRICTE pour les langues PROMUES, en liste en dur : un test « pct >= 100 »
  // s'auto-désactiverait justement quand une clé manque. Une langue complète se promeut ICI.
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

// ── 5. 🩸 Pas de HTML dans une clé rendue en texte ───────────────────────
// Une même clé peut partir en innerHTML (rendu correct, invisible en relecture) ET en textContent
// via `data-i18n` (balises affichées en clair). Règle : une clé atteinte UNE FOIS par `data-i18n`,
// `-title` ou `-placeholder` est du texte nu ; le balisage va dans le GABARIT. Seul
// `data-i18n-html` autorise du HTML.
const SAUT = String.fromCharCode(10);
const htmlDansTexte = [];
[...textOnlyKeys].forEach(function (k) {
  [["fr", fr], ["en", en]].forEach(function (d) {
    const v = d[1][k];
    if (typeof v === "string" && /<[a-zA-Z/!]/.test(v)) htmlDansTexte.push(d[0] + " · " + k + " → " + v);
  });
});
if (htmlDansTexte.length) {
  blocking++;
  console.error("❌ HTML dans une clé rendue en TEXTE (" + htmlDansTexte.length + ") — les balises " +
                "s'afficheront en clair. Mets le balisage dans le gabarit, ou passe en data-i18n-html :" +
                SAUT + "   " + htmlDansTexte.join(SAUT + "   "));
} else {
  console.log("✅ aucune clé rendue en texte ne contient de HTML (" + textOnlyKeys.size + " clés vérifiées)");
}


if (blocking) { console.error("\n❌ check-i18n : " + blocking + " problème(s) bloquant(s)."); process.exit(1); }
console.log("\n✅ check-i18n : tout est cohérent.");
process.exit(0);
