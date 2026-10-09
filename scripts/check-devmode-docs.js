#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🛠️ check-devmode-docs.js — garde-fou pré-commit BLOQUANT (rejoué en CI)
// =====================================================================
// Le Mode Développeur (js/devMode.js) n'a PLUS de bibliothèque de docs
// (retirée le 09/10/2026, audit CD F1). Elle lisait README.md et docs/ sur
// le serveur : pour fonctionner, il fallait les DÉPLOYER, donc les publier —
// le mot de passe de ce mode ne cachait que la liste, pas les fichiers, et
// dev.myktamap.fr servait toute la doc interne d'un dépôt privé. Les sites
// ne reçoivent plus que docs/applications/ (scripts de déploiement).
//
// Ce script vérifie que : (1) aucune lecture de doc technique ne revient
// dans le mode (manifest, fetch de docs/ ou de README.md) ; (2) le hash du
// mot de passe a la forme d'un SHA-256 ; (3) ConfAdmin et l'inspecteur
// Service Worker ne sont rendus QUE mode actif.
// =====================================================================

const fs = require("fs");
const src = fs.readFileSync("js/devMode.js", "utf8");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// (1) pas de retour de la bibliothèque — sans elle, docs/ n'a plus à être servi
{
  // Code seulement : l'en-tête explique le retrait et cite donc ces mots.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  t("🩸 aucun manifest de docs (`{ path: … }`) dans devMode.js", !/\{\s*path:\s*"/.test(code));
  t("🩸 aucune lecture de docs/ hors docs/applications/",
    !/["'`]\.?\/?docs\/(?!applications\/)/.test(code));
  t("🩸 aucune lecture du README.md racine", !/["'`]\.?\/?README\.md/.test(code));
  t("🩸 plus de bouton ni de fonction « bibliothèque »",
    code.indexOf("kta-devmode-docs") === -1 && !/ouvrirBibliotheque/.test(code));
}

// (2) hash mdp au format SHA-256
const h = /DEV_HASH\s*=\s*"([0-9a-f]*)"/.exec(src);
t("hash du mdp au format SHA-256 (64 hex)", !!h && h[1].length === 64);


// ───────── 🏗️ v1.86.0 — bouton ConfAdmin (mode dev uniquement) ─────────
// 🩸 confadmin.html n'était linké NULLE PART : il fallait taper l'URL à la
// main. C'est l'outil qui génère le data/index.json d'un serveur kiosque.
// Il vit derrière le mot de passe développeur — donc dans le bloc `actif`,
// jamais dans la branche « mode dev éteint ».
{
  t("🏗️ la page ConfAdmin existe bien dans le repo", fs.existsSync("confadmin.html"));
  t("🏗️ un bouton ConfAdmin est rendu", src.indexOf('id="kta-devmode-confadmin"') >= 0);
  t("🏗️ il ouvre confadmin.html", /window\.open\("confadmin\.html"/.test(src));
  // Le bouton et son handler doivent être DANS la branche `actif ?` : rendus
  // hors mode dev, ils exposeraient l'outil à tout le monde (et le
  // getElementById du handler planterait sur un bouton absent).
  const iActif = src.indexOf("(actif ? (");
  const iSinon = src.indexOf("        ) : (", iActif);
  t("🩸 le bouton n'est rendu QUE si le mode dev est actif",
    iActif > 0 && iSinon > iActif &&
    src.indexOf('id="kta-devmode-confadmin"') > iActif &&
    src.indexOf('id="kta-devmode-confadmin"') < iSinon);
}

// ───────── 🔧 lot C (03/10/2026) — inspecteur Service Worker (mode dev uniquement) ─────────
// Retiré de ⚙️ Configuration › Système & maintenance : la pastille « hors-ligne »
// de l'accueil montre l'état du cache à tous. L'inspecteur détaillé vit derrière
// le mot de passe développeur — même règle que ConfAdmin.
{
  const ID = 'id="loaderSwInspectorBtn"';
  const html = fs.readFileSync("index.html", "utf8");
  t("🔧 un bouton inspecteur SW est rendu par devMode.js", src.indexOf(ID) >= 0);
  t("🔧 il ouvre SwInspector.ouvrir()",
    /getElementById\("loaderSwInspectorBtn"\)[\s\S]{0,200}SwInspector\.ouvrir\(\)/.test(src));
  const iActif = src.indexOf("(actif ? (");
  const iSinon = src.indexOf("        ) : (", iActif);
  t("🩸 le bouton inspecteur SW n'est rendu QUE si le mode dev est actif",
    iActif > 0 && iSinon > iActif && src.indexOf(ID) > iActif && src.indexOf(ID) < iSinon);
  // Son écouteur aussi : dans le bloc `if (actif) {`, sinon getElementById
  // plante sur un bouton absent quand le mode est éteint.
  const iIf = src.indexOf("if (actif) {");
  const iEcoute = src.indexOf('getElementById("loaderSwInspectorBtn")');
  t("🩸 son écouteur n'est posé que si le mode dev est actif", iIf > 0 && iEcoute > iIf);
  t("🩸 le bouton n'est plus dans le gabarit de ⚙️ Configuration (index.html)", html.indexOf(ID) === -1);
}

console.log(ko === 0 ? "\n🎉 mode Développeur : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
