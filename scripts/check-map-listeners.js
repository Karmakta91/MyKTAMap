#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🗺️ check-map-listeners.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Refuse un listener posé sur la MAP LEAFLET dont la garde anti-doublon vit
// AILLEURS QUE SUR LA MAP.
//
// LE PIÈGE, PROPRE À CE DÉPÔT : `window.map` est REMPLACÉE à chaque plan
// chargé — nouvelle instance, aucun listener. Un drapeau global du genre
// `window._ktaXxxBound` survit à ce remplacement : il dit « déjà branché »
// alors que la nouvelle map ne l'est pas. Le branchement est sauté, et le
// listener ne se pose plus JAMAIS pour le reste de la session.
//
// IL A DÉJÀ MORDU DEUX FOIS :
//   • v1.30.0 — le hook de culling des markers. Corrigé en portant le drapeau
//     sur `map._mkmMarkerHookBound` (« au plan switch → nouvelle map →
//     nouveau bind », commentaire encore en place dans utils.js).
//   • v1.82.0 — `window._ktaFrontZoomBound`, la largeur des fronts au zoom.
//     La leçon de v1.30.0 était écrite dans le dépôt ; elle n'a pas empêché
//     de la refaire deux versions plus tard. D'où ce script.
//
// SYMPTÔME TYPIQUE, ET POURQUOI IL ÉGARE : le contournement de l'utilisateur
// marche. KARMA : « je dois masquer tous les niveaux, dézoomer, les
// réactiver, sinon ça ne prend pas » — parce que réactiver déclenche un
// re-rendu, lequel rappelle la fonction, laquelle recalcule à la volée. Le
// mécanisme a l'air vivant : seul son déclencheur a disparu.
//
// PORTÉE ÉTROITE, ASSUMÉE : on ne signale QUE le cas franc — un drapeau
// nommé `*Bound` / `*Bind*`, posé dans le MÊME BLOC qu'un `<map>.on(...)`,
// et non porté par la map. Un `map.on()` sans garde n'est pas un défaut (le
// code peut tourner une fois par map). Et une garde globale sur un listener
// `window` ou sur un abonnement à un module est LÉGITIME — `window` n'est
// jamais remplacée. Un garde-fou qui crie à tort finit ignoré.
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

// Receveur = la map Leaflet. `window.map`, `map`, `_mapInstance`, `this._map`…
// Le nom doit finir par « map » (insensible à la casse) pour ne pas ramasser
// `document.on` ni un layerGroup.
const RE_ON   = /(^|[^\w.])((?:window\.|this\.)?[\w$]*[mM]ap(?:Instance)?)\.on\s*\(/;
// Pose d'un drapeau de branchement : `X = true`.
const RE_POSE = /^\s*([\w$.\[\]"']*(?:Bound|Bind(?:ed)?))\s*=\s*true\s*;/;
// Drapeau porté par la map (`map._x`, `window.map._x`, `map["_x"]`) → conforme.
const RE_SUR_MAP = /[mM]ap(?:Instance)?\s*(?:\.|\[)/;

// 🩸 DEUX VERSIONS DE CE SCRIPT ONT ÉTÉ REFUSÉES PAR LEUR PROPRE DÉPÔT.
//
// 1. LA PROXIMITÉ NE SUFFIT PAS. La première remontait du `map.on(` au premier
//    `if` porteur d'un drapeau, et accusait `road.js > _perfUltraSubBound` :
//    une garde d'abonnement à PerfUltra (un MODULE, jamais remplacé, donc
//    parfaitement légitime) qui se trouvait neuf lignes au-dessus d'un
//    `map.on("mousedown")` sans aucun rapport. Le bloc de la garde était déjà
//    refermé entre les deux.
//
// 2. UNE SEULE DIRECTION NE SUFFIT PAS. La deuxième s'ancrait sur la pose du
//    drapeau et ne regardait que vers l'AVAL. Elle laissait donc passer la
//    forme même du correctif de v1.82.0 — `map.on(...)` puis le drapeau juste
//    après — et n'aurait rien dit si ce drapeau avait été global.
//
// D'où : ancrage sur le `map.on(`, recherche des DEUX CÔTÉS, et arrêt dès que
// la profondeur d'accolades montre qu'on a quitté le bloc. Un bloc frère se
// reconnaît, en remontant, à son `}` rencontré avant son `{`.
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

    // Le drapeau peut être posé avant OU après le branchement — les deux
    // formes existent dans ce dépôt.
    // `dedans` = profondeur relative au bloc du branchement. 0 = même bloc,
    // donc seule valeur où la garde peut se lire ; > 0 = dans un bloc frère ;
    // < 0 = on a franchi les accolades du bloc courant, on s'arrête.
    //
    // 🩸 Le SIGNE est le piège, et il a fait passer le faux positif de
    // `road.js` deux fois. En REMONTANT, un `}` fait ENTRER dans le bloc qu'il
    // ferme (d'où `-net`), et l'ordre compte : la ligne s'évalue à la
    // profondeur courante, la mise à jour ne vaut que pour la SUIVANTE — un
    // `}` est écrit au niveau du bloc parent, pas du bloc qu'il referme.
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
