#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🛠️ check-devmode-docs.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// La 📚 bibliothèque du Mode Développeur (js/devMode.js) liste ses docs
// dans un MANIFEST en dur (un hosting statique ne liste pas un dossier).
// Ce script vérifie que : (1) chaque chemin du manifest EXISTE dans le
// repo — un .md renommé sans mettre à jour le manifest casse le commit,
// pas la modale — et (2) chaque .md d'architecture du repo est bien DANS
// le manifest (une doc ajoutée mais oubliée = invisible en silence).
// Bonus : le hash du mdp a la forme d'un SHA-256.
// =====================================================================

const fs = require("fs");
const src = fs.readFileSync("js/devMode.js", "utf8");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// Extraction du manifest
const paths = [];
const re = /\{\s*path:\s*"([^"]+)"/g;
let m;
while ((m = re.exec(src)) !== null) paths.push(m[1]);
t("manifest extrait (" + paths.length + " docs)", paths.length >= 20);

// (1) chaque chemin existe
const manquants = paths.filter(p => !fs.existsSync(p));
t("tous les chemins du manifest existent dans le repo" + (manquants.length ? " — MANQUANTS : " + manquants.join(", ") : ""), manquants.length === 0);

// (2) chaque .md d'architecture EST dans le manifest
// 🩸 06/09/2026 — ce contrôle ne scannait QUE `docs/architecture/`. Une étude
// déposée à la RACINE de `docs/` passait donc au vert tout en étant absente de
// la bibliothèque : invisible en mode Développeur, sans un mot. Constaté sur
// `ETUDE_PODOMETRE.md`, et l'audit qui a suivi en a trouvé TROIS autres,
// oubliées de longue date (DESIGN_NAV_INTELLIGENTE, INSTALLATION_SELFHOST et
// les deux audits i18n). La racine est désormais couverte au même titre.
//
// Ce qui est HORS bibliothèque est listé explicitement : une omission doit
// rester une DÉCISION, jamais un oubli. Même principe que la tolérance de
// `check-prefs-survival.js`.
const HORS_BIBLIO = new Set([
  // Servies ailleurs dans l'app, les remettre ici ferait doublon :
  "docs/applications/README_USER.md", "docs/applications/README_USER.en.md",
  "docs/applications/README_USER.es.md",   // modale 📚 Documentation
  "docs/applications/AI_CONTEXT.md",       // modale 🤖 Aide IA
  "docs/applications/NETWORK_AUDIT.md",    // modale 🔒 Audit réseau
  "docs/applications/CGU.md",              // écran légal
  "docs/applications/SELFHOST.md", "docs/applications/DOCKER_INSTALL.md",
  "docs/applications/DOCKER_INSTALL.en.md",
  // Historique daté : consultable dans Git, pas une référence courante.
  "docs/audits/INDEX.md"
]);
// 🩸 08/09/2026 — UN DOC QUE GIT IGNORE N'EST PAS UN DOC DU PROJET. KARMA a
// déposé un audit sécurité offensive (`docs/architecture/audit-serveur-*.md`)
// qui décrit comment exfiltrer des données réelles : il est `.gitignore`, donc
// il ne part ni sur GitHub, ni sur une branche, ni en prod (deploy.ps1 l'exclut
// aussi). L'inscrire dans la bibliothèque in-app serait exactement le contraire
// du but. On retire donc du scan tout ce que Git ignore — la règle « chaque doc
// est dans le manifest » ne gouverne que les docs VERSIONNÉES. Un fichier
// ignoré ne peut pas y figurer, et ne doit pas.
function _ignoresParGit(chemins) {
  if (!chemins.length) return new Set();
  const { execFileSync } = require("child_process");
  try {
    const out = execFileSync("git", ["check-ignore", "--stdin"],
      { input: chemins.join("\n"), encoding: "utf8" });
    return new Set(out.split(/\r?\n/).filter(Boolean).map(p => p.replace(/\\/g, "/")));
  } catch (e) {
    // `git check-ignore` sort en code 1 quand AUCUN chemin n'est ignoré — ce
    // n'est pas une erreur : stdout est alors vide, et le Set l'est aussi.
    const out = (e.stdout || "").toString();
    return new Set(out.split(/\r?\n/).filter(Boolean).map(p => p.replace(/\\/g, "/")));
  }
}
const _tousLesMd = fs.readdirSync("docs/architecture").filter(f => f.endsWith(".md")).map(f => "docs/architecture/" + f)
  .concat(fs.readdirSync("docs").filter(f => f.endsWith(".md")).map(f => "docs/" + f));
const _ignores = _ignoresParGit(_tousLesMd);
const surDisque = _tousLesMd
  .filter(p => !HORS_BIBLIO.has(p) && !/^docs\/audits\/\d/.test(p) && !_ignores.has(p));
const oublies = surDisque.filter(p => paths.indexOf(p) === -1);
t("aucune doc oubliée du manifest (docs/ + docs/architecture/)" + (oublies.length ? " — OUBLIÉS : " + oublies.join(", ") : ""), oublies.length === 0);

// (3) hash mdp au format SHA-256
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

console.log(ko === 0 ? "\n🎉 bibliothèque devMode : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
