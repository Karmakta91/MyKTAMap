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
const concatPrefixes = new Set();  // 🆕 v1.79.2 — littéraux suivis d'un « + » (préfixes, pas des clés)
const textOnlyKeys = new Set();    // 🆕 v1.85.4 — cles rendues en textContent (voir §5)
const literalsInCode = new Set();  // 🆕 v1.79.2 — tout littéral à-point du source (canal orphelines seul)
function stripComments(src) {
  // Retire commentaires bloc /* */, HTML <!-- -->, et ligne // (évite les
  // faux positifs sur les exemples en commentaire, ex. `I18n.t("cle")`).
  //
  // 🐛 v1.79.2 (chantier scanner) — LE MANGEUR DE BLOCS : l'ancienne regex
  // bloc /\/\*[\s\S]*?\*\//g matchait le « /* » de `accept="image/*"` dans
  // les templates HTML et avalait TOUT jusqu'au prochain « */ » réel —
  // 149 065 caractères de createConf.js (67 % du fichier) invisibles au
  // scanner, idem homeProfile (−42 %) : ~150 clés faussement « orphelines »
  // et surtout AUCUN filet sur ces zones (une clé inexistante y passait le
  // CI en vert). Fix : ne traiter comme commentaires que ceux qui OUVRENT
  // la ligne (indentation tolérée) — la convention du repo pour tout
  // commentaire contenant des exemples. Un « /* » ou « // » en fin de ligne
  // de code n'est plus strippé : au pire un exemple en marge est SCANNÉ
  // (sur-couverture bénigne), plus jamais de code avalé (sous-couverture
  // dangereuse).
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
  // 🆕 v1.79.2 : couvre aussi `I18n.t(cond ? "a" : "b")` et `_t(...)` — le
  // lookbehind de l'ancienne forme refusait le point de `I18n.t(` (24 clés
  // heatmap/createConf hors filet).
  const reTern = /(?:I18n\.t|(?<![\w.$])_t|(?<![\w.$])[tT])\(\s*[^()"'`]*\?\s*["'`]([\w.]+\.[\w.]+)["'`]\s*:\s*["'`]([\w.]+\.[\w.]+)["'`]/g;
  while ((m = reTern.exec(src)) !== null) { called.add(m[1]); called.add(m[2]); }
  // 🆕 v1.76.1 — CLÉ EN VARIABLE : `const xKey = "prefixe." + …` puis
  // t(xKey) (legendCustomization, profileGamification). Le préfixe littéral
  // devient un préfixe dynamique (même traitement que t("prefixe." + v)).
  // v1.79.2 : TOUTE variable (plus seulement *key*) — `const _k = "home.perf.
  // desc." + preset` (index.html) échappait au filtre de nom. Sans risque :
  // le préfixe finit par un point → il ne nourrit que les préfixes
  // dynamiques, jamais le canal bloquant.
  const reVarKey = /(?:const|let|var)\s+[\w$]+\s*=\s*["'`]([\w.]+\.)["'`]\s*\+/g;
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
  // 🆕 v1.79.2 (chantier scanner) — ALIAS DÉCLARÉS PAR FONCTION, NON
  // PRÉFIXANTS : `function t(key, params) { … I18n.t(key …` (sessionExporter,
  // sessionReport, proLicense) et `function _t(key, params) { … }` (lostMode,
  // journalUi). Les gardes existantes exigeaient une AFFECTATION (`const t =
  // … I18n.t`) ou une déclaration PRÉFIXANTE — ~300 clés de ces modules
  // étaient hors filet. Garde : le 1er PARAMÈTRE doit être repassé TEL QUEL
  // à I18n.t (sinon ce n'est pas un alias direct) ; seuls les littéraux « à
  // point » sont captés (forme d'une clé).
  // Détection GÉNÉRIQUE des noms d'alias du fichier : toute fonction locale
  // dont le 1er paramètre est repassé TEL QUEL à I18n.t (avec ou sans
  // fallback 2e arg : _homeT, _tNL, t, _t…). v1.79.2 : plus de liste en dur.
  const aliasNoms = new Set();
  const reDeclFn = /function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*\{[\s\S]{0,260}?I18n\.t\(\s*\2\b/g;
  while ((m = reDeclFn.exec(src)) !== null) aliasNoms.add(m[1]);
  aliasNoms.forEach(function(alias) {
    const reCall = new RegExp("(?<![\\w.$])" + alias.replace(/\$/g, "\\$") + "\\(\\s*[\"'`]([\\w.]+\\.[\\w.]+)[\"'`]", "g");
    while ((m = reCall.exec(src)) !== null) called.add(m[1]);
  });
  // 🆕 v1.79.2 — CLÉS EN PROPRIÉTÉ `labelKey: "voice.cmd.zoomIn"` (tables de
  // config consommées plus tard via t(entry.labelKey) — voiceCommand). Noms
  // de propriété RESTREINTS (labelKey, titleKey…) : un `apiKey: "x.y"`
  // quelconque ne doit pas devenir un ❌ bloquant à tort.
  const reProp = /(?:label|title|hint|text|msg|desc|name|status)Key\s*:\s*["'`]([\w.]+\.[\w.]+)["'`]/g;
  while ((m = reProp.exec(src)) !== null) called.add(m[1]);
  // v1.79.2 : + data-i18n-placeholder (home.search.placeholder & co étaient
  // hors filet — l'attribut existe depuis v1.69 mais le scanner l'ignorait).
  const reAttr = /data-i18n(?:-html|-title|-placeholder)?\s*=\s*"([^"]+)"/g;
  while ((m = reAttr.exec(src)) !== null) called.add(m[1]);
  // 🆕 v1.85.4 — MÊME BALAYAGE, CANAL SÉPARÉ : les attributs qui posent du
  // TEXTE (textContent / valeur d'attribut), par opposition au seul
  // `data-i18n-html` qui pose du HTML. La regex exige le `=` juste après le
  // suffixe optionnel, donc `data-i18n-html="…"` ne peut pas matcher ici.
  const reAttrTexte = /data-i18n(?:-title|-placeholder)?\s*=\s*"([^"]+)"/g;
  while ((m = reAttrTexte.exec(src)) !== null) textOnlyKeys.add(m[1]);
  // 🆕 v1.79.2 — CANAL ORPHELINES UNIQUEMENT : tout littéral « à point »
  // présent dans le source (tables de clés `_SIG_CAT_I18N = {...}`, mappings
  // `"fn:boussole": "cheatsheet.tool.boussole"`, clés stockées puis
  // consommées ailleurs). JAMAIS utilisé pour le canal bloquant (« appelée
  // manquante ») : un littéral quelconque ("image/png"…) ne doit pas casser
  // le CI — il ne fait que retirer de FAUSSES orphelines.
  const reLit = /["'`]([\w]+(?:\.[\w-]+)+)["'`]/g;
  while ((m = reLit.exec(src)) !== null) literalsInCode.add(m[1]);
  // 🆕 v1.79.2 — LITTÉRAL SUIVI D'UNE CONCATÉNATION : `_t("lost.report.
  // reach.full" + (fc > 1 ? ".plural" : ".one"))` — le littéral n'est PAS
  // une clé complète mais un PRÉFIXE (sans point final, contrairement à
  // `t("prefix." + v)` déjà géré). Sans ce set, l'extension « alias
  // fonction » le prenait pour une clé → ❌ bloquant à tort ; et les clés
  // réelles (.one/.plural) restaient « orphelines ». Collecté À PART :
  // exclu des clés exigées, ajouté aux préfixes qui couvrent les orphelines.
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

// Ignore les clés à construction DYNAMIQUE : I18n.t("prefix." + var) capture le
// littéral "prefix." (terminé par un point) → ce n'est pas une vraie clé.
// 🆕 v1.79.2 : idem pour les littéraux SANS point final suivis d'un « + »
// (concatPrefixes) — exclus des clés exigées, ajoutés aux préfixes couvrants.
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
// Exclut les clés couvertes par un préfixe dynamique (ex. "legendui.label."
// → "legendui.label.salle" est utilisée via concat, pas orpheline).
const orphans = [...frKeys].filter(k =>
  !k.startsWith("_meta") &&
  !called.has(k) &&
  !literalsInCode.has(k) &&                      // 🆕 v1.79.2 : présent textuellement ≠ orphelin
  !dynamicPrefixes.some(p => k.startsWith(p))
);
if (orphans.length) {
  console.log("ℹ️  Clés dico jamais appelées (" + orphans.length + ") — info, pas bloquant" +
              (orphans.length <= 40 ? " :\n   " + orphans.join("\n   ") : " (liste tronquée)."));
  // 🆕 v1.79.2 — audit : CHECK_I18N_DUMP=1 écrit la liste complète (une clé
  // par ligne) dans scripts/i18n-orphelines.txt pour le tri périodique.
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

// ══════════ 5. 🩸 PAS DE HTML DANS UNE CLÉ RENDUE EN TEXTE ══════════
// VÉCU (introduit en v1.85.3, corrigé en v1.85.4) : la mention « (s'applique à
// tous tes plans) » avait été écrite DANS LA VALEUR DU DICO de trois libellés
// de capteurs. Côté mode plan ces clés partent dans un template innerHTML —
// rendu correct, donc invisible en relecture. Côté accueil elles sont posées
// par `data-i18n`, donc en textContent : l'utilisateur a vu en clair
// « 🔋 Niveau de batterie <em>(s'applique à tous tes plans)</em> », balises
// comprises. Une même clé, deux canaux de rendu, un seul qui pardonne.
//
// LA RÈGLE : dès qu'une clé est atteinte par `data-i18n`, `data-i18n-title` ou
// `data-i18n-placeholder` NE SERAIT-CE QU'UNE FOIS, sa valeur doit être du
// texte nu — même si elle est aussi consommée en innerHTML ailleurs. Le
// balisage se met dans le GABARIT, jamais dans le dictionnaire.
// `data-i18n-html` est le seul canal qui autorise du HTML : il est exclu ici.
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
