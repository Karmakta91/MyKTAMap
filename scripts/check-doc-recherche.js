#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔎 check-doc-recherche.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// La recherche plein texte de la modale 📖 Documentation et du hub ❓ Aide
// (audit ergonomie D27, 14/09/2026), plus les deux oublis de doc comblés le
// même jour (D18 bulle d'un point, D19 modale Détails de la session).
//
// 🩸 CE QUI RÉGRESSE SANS BRUIT :
//   1. La normalisation qui change de longueur. `ktaDocNormaliser` doit rendre
//      une chaîne de MÊME longueur (unités UTF-16) que l'entrée : le surlignage
//      découpe le texte d'origine aux indices trouvés dans la version
//      normalisée. Un « é » décomposé en deux unités décalerait chaque
//      surlignage d'un cran — visible seulement sur les mots accentués.
//   2. La recherche qui recommence à ne voir que les titres (hub), ou le champ
//      qui reste mais n'est plus câblé après le rendu (modale).
//   3. Les libellés de la bulle qui reviennent en dur en français.
//
// ON EXÉCUTE les helpers extraits du fichier réel (leçon v1.90.15).
// Usage : node scripts/check-doc-recherche.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }

const DOCS = lire("js/interfaceDocs.js");

// ---------- 1. Les helpers, exécutés ----------
{
  const i = DOCS.indexOf("window.ktaDocNormaliser = function");
  const j = DOCS.indexOf("function afficherReadme(", i);
  const src = (i >= 0 && j > i) ? DOCS.slice(i, j) : "";
  t("les helpers ktaDocNormaliser / ktaDocTrouver sont extractibles", src.length > 0);
  if (src) {
    const sb = { window: {} };
    let err = null;
    try { vm.runInNewContext(src, sb, { filename: "docs.helpers.js" }); } catch (e) { err = e.message; }
    t("🩸 …et s'exécutent sans erreur" + (err ? " — " + err : ""), !err);
    const N = sb.window.ktaDocNormaliser, F = sb.window.ktaDocTrouver;
    if (typeof N === "function" && typeof F === "function") {
      t("🩸 accents et casse : « Réglages ÉCHELLE » → « reglages echelle »", N("Réglages ÉCHELLE") === "reglages echelle");
      // Sur l'alphabet latin, même un NFD naïf reste 1:1 — ce qui casse la
      // longueur, c'est un « œ → oe » bien intentionné (pour que « coeur »
      // trouve « cœur ») appliqué à la SORTIE, ou une décomposition dont la
      // base n'est pas 1 unité (hangul « 한 » → 3 jamo, İ minuscule → 2
      // unités hors NFD). La doc est FR/EN/ES aujourd'hui ; l'invariant, lui,
      // vaut pour tout texte et toute requête.
      const e1 = "🚨 Écran d'Urgence — manœuvre à l'instant T, İstanbul 한";
      t("🩸 longueur PRÉSERVÉE (emoji, accents, œ, İ, hangul) : les indices restent ceux du texte d'origine", N(e1).length === e1.length);
      t("🩸 « œ » reste UNE unité (jamais « oe »), « İ » devient « i » en une unité", N("œ").length === 1 && N("İ") === "i");
      const hits = F("Les Réglages du plan, puis les réglages du pas", "réglages");
      t("🩸 « réglages » trouvé 2× aux bonnes positions ([4,12] et [31,39])", JSON.stringify(hits) === "[[4,12],[31,39]]");
      t("la requête sans accent trouve le mot accentué", JSON.stringify(F("Réglages", "reglages")) === "[[0,8]]");
      t("moins de 2 caractères → aucune occurrence (pas de surlignage lettre à lettre)", F("aaaa", "a").length === 0);
      t("occurrences non chevauchantes : « aaaa » / « aa » → 2", F("aaaa", "aa").length === 2);
      t("texte vide / requête vide → rien, sans erreur", F("", "x").length === 0 && F("abc", "").length === 0);
    }
  }
}

// ---------- 2. Câblage de la modale 📖 ----------
{
  t("modale 📖 : champ de recherche présent dans le gabarit", /id="kta-readme-search"/.test(DOCS) && /id="kta-readme-search-count"/.test(DOCS) && /id="kta-readme-search-next"/.test(DOCS));
  t("🩸 _setupReadmeSearch est appelée APRÈS le rendu et la navigation", /_setupReadmeNavigation\(\);[\s\S]{0,200}_setupReadmeSearch\(\);/.test(DOCS));
  const f = DOCS.slice(DOCS.indexOf("function _setupReadmeSearch()"), DOCS.indexOf("function _chargerReadme("));
  t("recherche : TreeWalker sur les nœuds texte + surlignage <mark class=\"kta-doc-mark\">", /createTreeWalker\(corps, NodeFilter\.SHOW_TEXT/.test(f) && /m\.className = "kta-doc-mark"/.test(f));
  t("recherche : démarquage propre (replaceChild + normalize) avant chaque nouvelle recherche", /replaceChild\(document\.createTextNode\(m\.textContent\), m\);\n\s*p\.normalize\(\);/.test(f));
  t("recherche : compteur i / n, Entrée = suivant, sommaire estompé (kta-readme-toc-dim)", /docs\.search\.count/.test(f) && /e\.key === "Enter"/.test(f) && /kta-readme-toc-dim/.test(f));
  const css = lire("css/style.css");
  t("CSS : mark.kta-doc-mark + courant + sommaire estompé", /mark\.kta-doc-mark \{/.test(css) && /kta-doc-mark-current/.test(css) && /\.kta-readme-toc-link\.kta-readme-toc-dim/.test(css));
}

// ---------- 3. Hub ❓ Aide : titre ET contenu ----------
{
  t("🩸 hub : chaque ligne porte le contenu normalisé (data-aide-texte)", (DOCS.match(/r\.dataset\.aideTexte = window\.ktaDocNormaliser\(/g) || []).length >= 2);
  const filtre = DOCS.slice(DOCS.indexOf("// Filtrage par recherche (titre + contenu"), DOCS.indexOf("empty.style.display = visibles"));
  t("🩸 hub : le filtre cherche dans le titre OU le contenu, requête normalisée", /window\.ktaDocNormaliser\(search\.value/.test(filtre) && /aideTexte/.test(filtre));
  t("hub : plus aucun toLowerCase() nu sur les titres", !/aideTitre = [^;]*\.toLowerCase\(\)/.test(DOCS));
}

// ---------- 4. Libellés de la bulle (Q19) ----------
{
  // On cherche les LITTÉRAUX (entre quotes) : les commentaires citent ces
  // libellés entre « » et n'ont aucune raison de rougir.
  const u = lire("js/utils.js");
  t("🩸 bulle : « 📍 Je suis ici » n'est plus un littéral en dur", !/['"]📍 Je suis ici['"]/.test(u));
  t("🩸 bulle : « 🧭 Y aller » n'est plus un littéral en dur", !/['"]🧭 Y aller['"]/.test(u));
  t("🩸 bulle : « 🗑️ Supprimer ce point » n'est plus un littéral en dur", !/['"]🗑️ Supprimer ce point['"]/.test(u));
  t("bulle : les trois passent par le dictionnaire", /I18n\.t\("iti\.wp\.jeSuisIci"\)/.test(u) && /I18n\.t\("poi\.goThereBtn"\)/.test(u) && /I18n\.t\("poi\.deleteBtn"\)/.test(u));
}

// ---------- 5. Docs ×3 ----------
{
  const H = { fr: ["### 📍 La bulle d'un point", "### 🔎 Chercher dans la documentation", "**📦 Backups récents** de ce plan"],
              en: ["### 📍 A point's popup", "### 🔎 Searching the documentation", "**📦 Recent backups** of this map"],
              es: ["### 📍 La ventana de un punto", "### 🔎 Buscar en la documentación", "**📦 Backups recientes** de este plano"] };
  const F = { fr: "README_USER.md", en: "README_USER.en.md", es: "README_USER.es.md" };
  const AIDE = { fr: ["📍 Je suis ici", "📦 Backups récents", "🔎 Chercher."], en: ["📍 I am here", "📦 Recent backups", "🔎 Search."], es: ["📍 Estoy aquí", "📦 Backups recientes", "🔎 Buscar."] };
  for (const l of ["fr", "en", "es"]) {
    const d = lire("docs/applications/" + F[l]);
    t("📖 " + l + " : bulle d'un point, recherche et Détails documentés", H[l].every(h => d.includes(h)));
    const dico = JSON.parse(lire("lang/" + l + ".json"));
    t("❓ " + l + " : aide intégrée (edition-points / stats-session / aide-doc-legende) complétée",
      (dico["aide.sec.edition-points.html"] || "").includes(AIDE[l][0]) &&
      (dico["aide.sec.stats-session.html"] || "").includes(AIDE[l][1]) &&
      (dico["aide.sec.aide-doc-legende.html"] || "").includes(AIDE[l][2]));
    t("🌍 " + l + " : clés docs.search.* et poi.goThereBtn / poi.deleteBtn présentes",
      ["docs.search.placeholder", "docs.search.count", "docs.search.none", "docs.search.nextTitle", "poi.goThereBtn", "poi.deleteBtn"].every(k => typeof dico[k] === "string"));
  }
}

console.log("");
if (echecs) { console.log("💥 recherche doc : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 recherche doc : plein texte, accents tolérés, positions préservées — et la bulle comme les Détails sont documentés");
