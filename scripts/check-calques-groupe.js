#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-calques-groupe.js — BLOQUANT (pré-commit, CI) : refuse `calque.remove()` sur un calque Leaflet ajouté à un
// GROUPE (layerEditor, sous-groupe d'un calque, groupe d'une vue) ; il se retire par `window.ktaRetirerCalque(calque,
// groupe)` (utils.js) ou `groupe.removeLayer(calque)`.
// 🩸 `calque.remove()` = `map.removeLayer` : le calque quitte la carte mais reste dans le `_layers` du groupe. Chaque
//    rendu de session y gardait une copie de tous ses objets (onglet tué sur un gros plan) et décocher puis recocher
//    le groupe dans ≡ remettait tous ces calques morts sur la carte.
// Motif suivi, fichier par fichier dans js/ (commentaires et chaînes ignorés) :
//   - calque suivi = receveur d'un `.addTo(G)` (variable, `X = L.xxx(…).addTo(G)` sur plusieurs lignes compris) ou
//     argument d'un `G.addLayer(X)`, quand G n'est pas une carte (nom `map`, `m`, `carte`, `…Map`, `…MapInstance`) ;
//   - tableau suivi = `T.push(X)` d'un calque suivi ;
//   - faute = `X.remove()` d'un calque suivi, ou `T.forEach(function (l) { … l.remove() … })` / `T.forEach(l => …)`.
// Suivi par NOM dans le fichier : un homonyme (élément du DOM) peut sortir en faux positif ; l'écarter par l'ancre
// `// 🏷️ ancre:calque-hors-groupe <raison>` sur la ligne ou celle du dessus. Lit les fichiers du dépôt (pas l'index) :
// même résultat en CI. Doc : docs/architecture/gotchas.md (piège layer.remove()).
// Usage : node scripts/check-calques-groupe.js [fichier.js …] (défaut : js/*.js)
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const ANCRE = "🏷️ ancre:calque-hors-groupe";
const RE_CARTE = /^(?:m|carte|_carte|[\w$]*[mM]ap(?:Instance)?)$/;

// Commentaires et contenu des chaînes remplacés par des espaces (positions et lignes gardées).
function nettoyer(src) {
  let out = "", i = 0, etat = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (etat === null) {
      if (c === "/" && d === "/") { etat = "ligne"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { etat = "bloc"; out += "  "; i += 2; continue; }
      if (c === "'" || c === '"' || c === "`") { etat = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (etat === "ligne") { if (c === "\n") { etat = null; out += c; } else out += " "; i++; continue; }
    if (etat === "bloc") {
      if (c === "*" && d === "/") { etat = null; out += "  "; i += 2; continue; }
      out += c === "\n" ? c : " "; i++; continue;
    }
    // dans une chaîne
    if (c === "\\") { out += "  "; i += 2; continue; }
    if (c === etat) { etat = null; out += c; i++; continue; }
    out += c === "\n" ? c : " "; i++;
  }
  return out;
}

const RE_ID = /[\w$.\[\]]/;
// Chaîne d'identifiants qui finit juste avant `fin` (exclu) : `entry.layers[j]`, `window.x`, `m`.
function chaineAvant(s, fin) {
  let i = fin - 1;
  while (i >= 0 && /\s/.test(s[i])) i--;
  const b = i;
  while (i >= 0 && RE_ID.test(s[i])) i--;
  return { debut: i + 1, txt: s.slice(i + 1, b + 1) };
}
// Indice de la parenthèse ouvrante qui ferme en `ferme` (s[ferme] === ")").
function ouvrante(s, ferme) {
  let p = 0;
  for (let i = ferme; i >= 0; i--) {
    if (s[i] === ")") p++;
    else if (s[i] === "(") { p--; if (p === 0) return i; }
  }
  return -1;
}
function fermante(s, ouvre) {
  let p = 0;
  for (let i = ouvre; i < s.length; i++) {
    if (s[i] === "(") p++;
    else if (s[i] === ")") { p--; if (p === 0) return i; }
  }
  return -1;
}
function dernierSegment(chaine) { return chaine.replace(/\[[^\]]*\]$/, "").split(".").pop(); }
function estCarte(g) { return RE_CARTE.test(dernierSegment(g.trim())); }

// Receveur d'un `.addTo(` à l'indice `pos` (position du point) : la variable qui garde le calque.
function receveur(s, pos) {
  let i = pos - 1;
  while (i >= 0 && /\s/.test(s[i])) i--;
  let construit = false;
  // Remonte une chaîne d'appels : `L.polygon(…)`, `L.polyline(…, {…})\n  .bindTooltip(…)`.
  while (i >= 0 && s[i] === ")") {
    const o = ouvrante(s, i);
    if (o < 0) return null;
    const c = chaineAvant(s, o);
    if (!c.txt) return null;
    construit = true;
    i = c.debut - 1;
    while (i >= 0 && /\s/.test(s[i])) i--;
    if (c.txt[0] === ".") continue;   // maillon `.bindTooltip(…)` : l'appel d'avant suit
    break;
  }
  if (!construit) {
    const c = chaineAvant(s, i + 1);
    return c.txt || null;
  }
  // Construit : `X = <expr>.addTo(G)` → X ; `new` éventuel devant.
  let j = i;
  while (j >= 0 && /\s/.test(s[j])) j--;
  if (s.slice(j - 2, j + 1) === "new") { j -= 3; while (j >= 0 && /\s/.test(s[j])) j--; }
  if (s[j] === "(" ) { // `(cond ? A : B).addTo(G)` : rien à suivre
    return null;
  }
  if (s[j] === "=" && !/[=!<>+\-*/]/.test(s[j - 1] || "")) {
    const c = chaineAvant(s, j);
    return c.txt || null;
  }
  return null;
}

function ligneDe(s, pos) { return s.slice(0, pos).split("\n").length; }

function verifierFichier(fichier) {
  const brut = fs.readFileSync(fichier, "utf8");
  const s = nettoyer(brut);
  const lignes = brut.split(/\r?\n/);
  const calques = new Set();
  const tableaux = new Set();
  let m;

  const reAddTo = /\.addTo\s*\(/g;
  while ((m = reAddTo.exec(s))) {
    const ouvre = m.index + m[0].length - 1, ferme = fermante(s, ouvre);
    if (ferme < 0) continue;
    const g = s.slice(ouvre + 1, ferme);
    if (!g.trim() || estCarte(g)) continue;
    const x = receveur(s, m.index);
    if (x) calques.add(x);
  }
  const reAddLayer = /([\w$.\[\]]+)\s*\.addLayer\s*\(\s*([\w$.\[\]]+)\s*\)/g;
  while ((m = reAddLayer.exec(s))) {
    if (!estCarte(m[1])) calques.add(m[2]);
  }
  const rePush = /([\w$.\[\]]+)\s*\.push\s*\(\s*([\w$.\[\]]+)\s*\)/g;
  while ((m = rePush.exec(s))) {
    if (calques.has(m[2])) tableaux.add(m[1]);
  }

  const fautes = [];
  function ancree(n) {
    return (lignes[n - 1] || "").indexOf(ANCRE) >= 0 || (lignes[n - 2] || "").indexOf(ANCRE) >= 0;
  }
  const reRemove = /([\w$.\[\]]+)\s*\.remove\s*\(\s*\)/g;
  while ((m = reRemove.exec(s))) {
    if (!calques.has(m[1])) continue;
    const n = ligneDe(s, m.index);
    if (!ancree(n)) fautes.push({ ligne: n, quoi: m[1] + ".remove()" });
  }
  const reForEach = /([\w$.\[\]]+)\s*\.forEach\s*\(/g;
  while ((m = reForEach.exec(s))) {
    if (!tableaux.has(m[1])) continue;
    const ouvre = m.index + m[0].length - 1, ferme = fermante(s, ouvre);
    if (ferme < 0) continue;
    const corps = s.slice(ouvre + 1, ferme);
    const p = /^\s*(?:function\s*\(\s*([\w$]+)|\(?\s*([\w$]+)\s*\)?\s*=>)/.exec(corps);
    const v = p && (p[1] || p[2]);
    if (!v) continue;
    const r = new RegExp("(^|[^\\w$.])" + v.replace(/\$/g, "\\$") + "\\s*\\.remove\\s*\\(\\s*\\)").exec(corps);
    if (!r) continue;
    const n = ligneDe(s, ouvre + 1 + r.index);
    if (!ancree(n)) fautes.push({ ligne: n, quoi: m[1] + ".forEach(… " + v + ".remove() …)" });
  }
  return fautes;
}

const args = process.argv.slice(2);
const DIR = "js";
let fichiers = args.length ? args : fs.readdirSync(DIR).filter(function (n) { return n.endsWith(".js"); })
  .map(function (n) { return path.join(DIR, n); });
fichiers = fichiers.filter(function (f) { return fs.existsSync(f); });

let total = 0;
fichiers.forEach(function (f) {
  verifierFichier(f).forEach(function (x) {
    total++;
    console.error("❌ [check-calques-groupe] " + f.replace(/\\/g, "/") + ":" + x.ligne + " — " + x.quoi +
      " : calque ajouté à un groupe, retiré de la carte seulement");
  });
});
if (total) {
  console.error("   → window.ktaRetirerCalque(calque, groupe) (utils.js) ou groupe.removeLayer(calque) ; homonyme hors");
  console.error("     Leaflet : ancre « // " + ANCRE + " <raison> » sur la ligne.");
  process.exit(1);
}
console.log("✅ [check-calques-groupe] " + fichiers.length + " fichier(s) : aucun calque de groupe retiré par .remove()");
