#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-devmode-docs.js — garde-fou pré-commit BLOQUANT (rejoué en CI)
// =====================================================================
// 🔒 Le Mode Développeur (js/devMode.js) ne lit aucune doc technique : pour la
// lire, il faudrait déployer docs/ et README.md, donc les publier. Les sites ne
// reçoivent que docs/applications/. Le mode s'active sans mot de passe
// (décision produit) : il ne doit rien contenir de secret.
// Vérifie : (1) aucun manifest ni lecture de docs/ ou README.md dans le mode ;
// (2) activation par la confirmation chartée, sans porte à mot de passe ;
// (3) ConfAdmin et l'inspecteur Service Worker rendus QUE mode actif.
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

// ── 2. Activation : confirmation chartée, pas de mot de passe ────────
// Un hash en dur dans un dépôt public ne protège rien : son retour ferait
// croire le contenu du mode protégé.
{
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  t("🔒 aucun hash ni champ de mot de passe dans devMode.js",
    !/DEV_HASH|type="password"|crypto\.subtle/.test(code));
  t("l'activation passe par window.ktaConfirm (ce que fait le mode)",
    /window\.ktaConfirm\(t\("devmode\.activer\.avertissement"\)/.test(code) &&
    /await _confirmerActivation\(\)/.test(code));
  t("les clés de l'ancienne porte sont effacées au chargement",
    /"myktamap_devmode_unlock_v1"/.test(code) && /"myktamap_devmode_tries_v1"/.test(code) &&
    /localStorage\.removeItem\(k\)/.test(code));
}


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
// l'inspecteur détaillé vit dans le mode Développeur, hors ⚙️ Configuration.
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
