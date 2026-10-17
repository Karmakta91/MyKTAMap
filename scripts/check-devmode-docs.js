#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-devmode-docs.js — garde-fou pré-commit BLOQUANT (rejoué en CI)
// =====================================================================
// 🔒 Le Mode Développeur (js/devMode.js) ne lit aucune doc technique : pour la
// lire, il faudrait déployer docs/ et README.md, donc les publier (le mot de
// passe ne cache que la liste, pas les fichiers). Les sites ne reçoivent que
// docs/applications/.
// Vérifie : (1) aucun manifest ni lecture de docs/ ou README.md dans le mode ;
// (2) hash du mot de passe au format SHA-256 ; (3) ConfAdmin et l'inspecteur
// Service Worker rendus QUE mode actif.
// =====================================================================

const fs = require("fs");
const src = fs.readFileSync("js/devMode.js", "utf8");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// ── 1. Pas de bibliothèque de docs ───────────────────────────────────
{
  // Code seulement : un commentaire peut citer ces mots.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  t("🩸 aucun manifest de docs (`{ path: … }`) dans devMode.js", !/\{\s*path:\s*"/.test(code));
  t("🩸 aucune lecture de docs/ hors docs/applications/",
    !/["'`]\.?\/?docs\/(?!applications\/)/.test(code));
  t("🩸 aucune lecture du README.md racine", !/["'`]\.?\/?README\.md/.test(code));
  t("🩸 plus de bouton ni de fonction « bibliothèque »",
    code.indexOf("kta-devmode-docs") === -1 && !/ouvrirBibliotheque/.test(code));
}

// ── 2. Hash du mot de passe ──────────────────────────────────────────
const h = /DEV_HASH\s*=\s*"([0-9a-f]*)"/.exec(src);
t("hash du mdp au format SHA-256 (64 hex)", !!h && h[1].length === 64);


// ── 3. Bouton ConfAdmin (mode dev uniquement) ────────────────────────
// ConfAdmin génère le data/index.json d'un serveur kiosque ; seul ce bouton y mène.
{
  t("🏗️ la page ConfAdmin existe bien dans le repo", fs.existsSync("confadmin.html"));
  t("🏗️ un bouton ConfAdmin est rendu", src.indexOf('id="kta-devmode-confadmin"') >= 0);
  t("🏗️ il ouvre confadmin.html", /window\.open\("confadmin\.html"/.test(src));
  // 🩸 Bouton et handler DANS la branche `actif ?` : hors mode dev, ils
  // exposeraient l'outil (et getElementById planterait sur un bouton absent).
  const iActif = src.indexOf("(actif ? (");
  const iSinon = src.indexOf("        ) : (", iActif);
  t("🩸 le bouton n'est rendu QUE si le mode dev est actif",
    iActif > 0 && iSinon > iActif &&
    src.indexOf('id="kta-devmode-confadmin"') > iActif &&
    src.indexOf('id="kta-devmode-confadmin"') < iSinon);
}

// ── 4. Inspecteur Service Worker (mode dev uniquement) ───────────────
// La pastille « hors-ligne » de l'accueil montre l'état du cache à tous ;
// l'inspecteur détaillé vit derrière le mot de passe, hors ⚙️ Configuration.
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
  // 🩸 Écouteur dans `if (actif) {`, sinon getElementById plante mode éteint.
  const iIf = src.indexOf("if (actif) {");
  const iEcoute = src.indexOf('getElementById("loaderSwInspectorBtn")');
  t("🩸 son écouteur n'est posé que si le mode dev est actif", iIf > 0 && iEcoute > iIf);
  t("🩸 le bouton n'est plus dans le gabarit de ⚙️ Configuration (index.html)", html.indexOf(ID) === -1);
}

console.log(ko === 0 ? "\n🎉 mode Développeur : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
