#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-map-listeners.js — BLOQUANT (pré-commit) : refuse un listener posé sur la MAP Leaflet dont la
// garde anti-doublon vit ailleurs que sur la map (convention : `map._monHookBound`).
// 🩸 `window.map` est REMPLACÉE à chaque plan chargé. Un drapeau global (`window._ktaXxxBound`) survit :
//    il dit « déjà branché », le branchement est sauté et le listener ne se pose plus de la session.
//    Symptôme trompeur : un re-rendu manuel (masquer/réafficher un niveau) recalcule à la volée, le
//    mécanisme a l'air vivant, seul son déclencheur a disparu.
// Portée étroite : seul le cas franc (drapeau `*Bound`/`*Bind*` dans le MÊME BLOC qu'un `<map>.on(...)`,
// non porté par la map). Un `map.on()` sans garde, ou une garde globale sur `window` ou un module (jamais
// remplacés), est légitime.
// =====================================================================

const fs = require("fs");
const path = require("path");

const DIR = "js";

let fichiers;
try {
  fichiers = fs.readdirSync(DIR).filter(function (n) { return n.endsWith(".js"); });
} catch (e) {
  console.error("❌ [check-map-listeners] " + DIR + " illisible : " + e.message);
  process.exit(2);
}

// Receveur = la map (`window.map`, `_mapInstance`, `this._map`…) : nom finissant par « map », pour ne pas
// ramasser `document.on` ni un layerGroup.
const RE_ON   = /(^|[^\w.])((?:window\.|this\.)?[\w$]*[mM]ap(?:Instance)?)\.on\s*\(/;
// Pose d'un drapeau de branchement : `X = true`.
const RE_POSE = /^\s*([\w$.\[\]"']*(?:Bound|Bind(?:ed)?))\s*=\s*true\s*;/;
// Drapeau porté par la map (`map._x`, `window.map._x`, `map["_x"]`) → conforme.
const RE_SUR_MAP = /[mM]ap(?:Instance)?\s*(?:\.|\[)/;

// 🩸 La proximité ne suffit pas (une garde de module dans un bloc voisin déjà refermé n'a aucun rapport),
// et une seule direction non plus (le drapeau se pose avant OU après le `map.on(`). D'où : ancrage sur le
// `map.on(`, recherche des DEUX côtés, arrêt dès que la profondeur d'accolades sort du bloc.
const PORTEE = 12;   // lignes examinées de chaque côté du branchement

function profondeur(l) {
  const nu = l.replace(/\/\/.*$/, "");
  return (nu.split("{").length - 1) - (nu.split("}").length - 1);
}
function estCommentaire(l) {
  const t = l.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

const fautes = [];
fichiers.forEach(function (nom) {
  const lignes = fs.readFileSync(path.join(DIR, nom), "utf8").split(/\r?\n/);

  lignes.forEach(function (ligne, idx) {
    if (estCommentaire(ligne)) return;
    if (!RE_ON.test(ligne) || /\.off\s*\(/.test(ligne)) return;

    // `dedans` = profondeur relative au bloc du branchement : 0 = même bloc (seul cas où la garde se lit),
    // > 0 = bloc frère, < 0 = sorti du bloc courant, on s'arrête.
    // 🩸 Le SIGNE : en REMONTANT, un `}` fait ENTRER dans le bloc qu'il ferme (d'où `-net`). Et l'ordre :
    // la ligne s'évalue à la profondeur courante, la mise à jour ne vaut que pour la SUIVANTE.
    const trouve = function (pas) {
      let dedans = 0;
      for (let n = 1; n <= PORTEE; n++) {
        const k = idx + n * pas;
        if (k < 0 || k >= lignes.length) return null;
        const l = lignes[k];
        if (estCommentaire(l)) continue;
        if (dedans === 0) {
          const m = RE_POSE.exec(l);
          if (m) return { flag: m[1], ligne: k + 1 };
        }
        dedans += (pas > 0 ? 1 : -1) * profondeur(l);
        if (dedans < 0) return null;
      }
      return null;
    };

    const g = trouve(-1) || trouve(1);
    if (!g) return;                          // aucune garde : pas un défaut
    if (RE_SUR_MAP.test(g.flag)) return;     // portée par la map : conforme
    fautes.push({ fichier: nom, ligne: g.ligne, flag: g.flag, onLigne: idx + 1 });
  });
});

if (!fautes.length) {
  console.log("✅ listeners de map : toute garde anti-doublon est portée par la map");
  console.log("\n🎉 " + fichiers.length + " fichiers inspectés");
  process.exit(0);
}

console.log("============================================================");
console.log("🛑 COMMIT REFUSÉ — garde de listener non portée par la map");
console.log("============================================================");
fautes.forEach(function (f) {
  console.log("\n   • " + f.fichier + ":" + f.ligne + "  →  " + f.flag);
  console.log("     (listener posé ligne " + f.onLigne + ")");
});
console.log("");
console.log("   `window.map` est REMPLACÉE à chaque plan chargé. Un drapeau qui");
console.log("   ne vit pas sur l'instance survit au remplacement : il annonce");
console.log("   « déjà branché » alors que la nouvelle map ne l'est pas, et le");
console.log("   listener ne se pose plus jamais.");
console.log("");
console.log("   Porte-le sur la map — la convention du dépôt depuis v1.30.0 :");
console.log("       if (!window.map._monHookBound) {");
console.log("         window.map.on(\"zoomend\", monHandler);");
console.log("         window.map._monHookBound = true;");
console.log("       }");
console.log("");
console.log("   Si la garde protège un listener `window` ou un abonnement à un");
console.log("   module (jamais remplacés), sors-la du voisinage du `map.on(`.");
console.log("");
process.exit(1);
