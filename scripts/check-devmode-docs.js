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

// (2) chaque .md d'architecture est dans le manifest
const surDisque = fs.readdirSync("docs/architecture").filter(f => f.endsWith(".md")).map(f => "docs/architecture/" + f);
const oublies = surDisque.filter(p => paths.indexOf(p) === -1);
t("aucun .md d'architecture oublié du manifest" + (oublies.length ? " — OUBLIÉS : " + oublies.join(", ") : ""), oublies.length === 0);

// (3) hash mdp au format SHA-256
const h = /DEV_HASH\s*=\s*"([0-9a-f]*)"/.exec(src);
t("hash du mdp au format SHA-256 (64 hex)", !!h && h[1].length === 64);

console.log(ko === 0 ? "\n🎉 bibliothèque devMode : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
