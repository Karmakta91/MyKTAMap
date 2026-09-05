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
const surDisque = fs.readdirSync("docs/architecture").filter(f => f.endsWith(".md")).map(f => "docs/architecture/" + f)
  .concat(fs.readdirSync("docs").filter(f => f.endsWith(".md")).map(f => "docs/" + f))
  .filter(p => !HORS_BIBLIO.has(p) && !/^docs\/audits\/\d/.test(p));
const oublies = surDisque.filter(p => paths.indexOf(p) === -1);
t("aucune doc oubliée du manifest (docs/ + docs/architecture/)" + (oublies.length ? " — OUBLIÉS : " + oublies.join(", ") : ""), oublies.length === 0);

// (3) hash mdp au format SHA-256
const h = /DEV_HASH\s*=\s*"([0-9a-f]*)"/.exec(src);
t("hash du mdp au format SHA-256 (64 hex)", !!h && h[1].length === 64);

console.log(ko === 0 ? "\n🎉 bibliothèque devMode : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
