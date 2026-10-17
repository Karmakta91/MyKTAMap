#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-lambert93.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Vérifie la projection Lambert 93 (EPSG:2154) de `js/sigImport.js` (import
// d'un export QGIS sans reprojection manuelle). Aucune table de référence
// recopiée (elle validerait son propre chiffre faux) : tout découle des
// propriétés définitoires de la projection :
//   A. origine (3°E, 46,5°N) → exactement (700000, 6600000) ;
//   B. X = 700000 sur le méridien central à toute latitude ;
//   C. échelle = 1 sur les deux parallèles standard (44°, 49°) ;
//   D. échelle < 1 entre eux, > 1 au-delà (sécante, pas tangente) ;
//   E. même échelle le long du méridien et du parallèle (conformité) ;
//   F. aller-retour WGS84 → L93 → WGS84 sous le micromètre.
// ⚠️ F seul ne prouve rien (deux fonctions fausses mais inverses passent) :
// A à E ancrent la projection.
// Détection (G/H) : l'enveloppe ne happe jamais des degrés WGS84, et un fichier
// mixte n'est pas reprojeté à moitié (erreur invisible, pire qu'un refus).
// =====================================================================

const fs = require("fs");

const SRC = "js/sigImport.js";
let src;
try { src = fs.readFileSync(SRC, "utf8"); }
catch (e) {
  console.error("❌ [check-lambert93] " + SRC + " illisible : " + e.message);
  process.exit(2);
}

// ── extraction de l'IIFE L93 ──────────────────────────────────────────
const m = /const L93 = \(function \(\) \{[\s\S]*?\n {2}\}\)\(\);/.exec(src);
if (!m) {
  console.error("❌ [check-lambert93] bloc `const L93 = (function () { … })();` introuvable dans " + SRC +
                " — la projection a été renommée ou déplacée. Ce garde-fou ne peut plus rien vérifier : " +
                "mets-le à jour AVANT de committer.");
  process.exit(2);
}
let L93;
try { L93 = eval(m[0].replace("const L93 = ", "").replace(/;$/, "")); }
catch (e) {
  console.error("❌ [check-lambert93] bloc L93 non évaluable : " + e.message);
  process.exit(2);
}
if (typeof L93.versL93 !== "function" || typeof L93.versWgs84 !== "function") {
  console.error("❌ [check-lambert93] L93 doit exposer `versL93` et `versWgs84`.");
  process.exit(2);
}

const echecs = [];
function verif(nom, ok, aide) {
  console.log((ok ? "✅ " : "❌ ") + nom);
  if (!ok) echecs.push(aide);
}

// ── A. origine exacte ─────────────────────────────────────────────────
const o = L93.versL93(46.5, 3);
verif(
  "A. l'origine (3°E, 46,5°N) tombe sur (700000, 6600000)",
  Math.abs(o.x - 700000) < 1e-6 && Math.abs(o.y - 6600000) < 1e-6,
  "Le point d'origine doit donner EXACTEMENT le false easting/northing. Obtenu : x=" +
  o.x.toFixed(6) + " y=" + o.y.toFixed(6) + " au lieu de 700000 / 6600000. " +
  "C'est le contrôle le plus fondamental : s'il casse, un paramètre (lat_0, lon_0, x_0, y_0) est faux."
);
const oi = L93.versWgs84(700000, 6600000);
verif(
  "A'. l'inverse de (700000, 6600000) rend (3°E, 46,5°N)",
  Math.abs(oi.lat - 46.5) < 1e-9 && Math.abs(oi.lng - 3) < 1e-9,
  "L'inverse du point d'origine doit rendre la latitude/longitude d'origine. Obtenu : lat=" +
  oi.lat + " lng=" + oi.lng + "."
);

// ── B. méridien central ───────────────────────────────────────────────
let pireX = 0;
for (let lat = 41; lat <= 52; lat += 0.25) pireX = Math.max(pireX, Math.abs(L93.versL93(lat, 3).x - 700000));
verif(
  "B. sur le méridien central, X vaut 700000 à toute latitude",
  pireX < 1e-6,
  "Sur lon_0 = 3°, l'abscisse doit rester 700000 quelle que soit la latitude. Écart max observé : " +
  pireX.toExponential(3) + " m. Un écart ici trahit un mauvais méridien central."
);

// ── C/D/E. facteur d'échelle ──────────────────────────────────────────
const A = 6378137, F = 1 / 298.257222101, E2 = 2 * F - F * F, D = Math.PI / 180;
function echelleParallele(lat) {
  const d = 1e-6, r = lat * D;
  const p = L93.versL93(lat, 3), q = L93.versL93(lat, 3 + d);
  const N = A / Math.sqrt(1 - E2 * Math.sin(r) * Math.sin(r));
  return Math.hypot(q.x - p.x, q.y - p.y) / (N * Math.cos(r) * d * D);
}
function echelleMeridien(lat) {
  const d = 1e-6, r = lat * D;
  const p = L93.versL93(lat, 3), q = L93.versL93(lat + d, 3);
  const M = A * (1 - E2) / Math.pow(1 - E2 * Math.sin(r) * Math.sin(r), 1.5);
  return Math.hypot(q.x - p.x, q.y - p.y) / (M * d * D);
}
const e44 = echelleParallele(44), e49 = echelleParallele(49);
verif(
  "C. facteur d'échelle = 1 sur les parallèles standard 44° et 49°",
  Math.abs(e44 - 1) < 1e-7 && Math.abs(e49 - 1) < 1e-7,
  "Sur une conique sécante, l'échelle vaut exactement 1 sur les deux parallèles standard. " +
  "Obtenu : 44° → " + e44.toFixed(12) + ", 49° → " + e49.toFixed(12) + ". " +
  "Un écart signifie que lat_1/lat_2 sont faux ou inversés."
);
const eMid = echelleParallele(46.5), eHors = echelleParallele(51.5);
verif(
  "D. échelle < 1 entre les parallèles, > 1 au-delà (sécante)",
  eMid < 1 && eHors > 1,
  "Entre 44° et 49° la projection contracte (échelle < 1), au-delà elle dilate. Obtenu : " +
  "46,5° → " + eMid.toFixed(9) + " · 51,5° → " + eHors.toFixed(9) + ". " +
  "Si les deux sont du même côté de 1, la projection est tangente, pas sécante."
);
let pireConf = 0;
[42, 44, 46.5, 49, 51].forEach(function (l) {
  pireConf = Math.max(pireConf, Math.abs(echelleParallele(l) - echelleMeridien(l)));
});
verif(
  "E. conformité : même échelle selon le méridien et le parallèle",
  pireConf < 1e-6,
  "Une projection CONFORME déforme identiquement dans toutes les directions. Écart max " +
  "méridien/parallèle : " + pireConf.toExponential(3) + ". Un écart réel trahit une erreur " +
  "d'ellipsoïde (GRS80 attendu) ou de formule."
);

// ── F. aller-retour ───────────────────────────────────────────────────
let pireAR = 0, ou = "";
for (let lat = 41; lat <= 51.5; lat += 0.5) {
  for (let lng = -5.5; lng <= 10; lng += 0.5) {
    const p = L93.versL93(lat, lng), q = L93.versWgs84(p.x, p.y);
    const d = Math.hypot((q.lat - lat) * 111320, (q.lng - lng) * 111320 * Math.cos(lat * D));
    if (d > pireAR) { pireAR = d; ou = lat + "°N " + lng + "°E"; }
  }
}
verif(
  "F. aller-retour WGS84 → L93 → WGS84 sous le micromètre",
  pireAR < 1e-6,
  "L'aller-retour doit revenir au point de départ. Écart max : " + (pireAR * 1000).toFixed(6) +
  " mm au point " + ou + ". Au-delà du micromètre, la boucle de convergence de la latitude " +
  "isométrique sort trop tôt."
);

// ── G/H. détection (bbox lue dans le source, pas recopiée) ────────────
const mb = /const L93_BBOX = \{[^}]*\}/.exec(src);
if (!mb) {
  echecs.push("`L93_BBOX` introuvable dans " + SRC + " — l'enveloppe de détection a disparu.");
} else {
  const BB = eval("(" + mb[0].replace("const L93_BBOX = ", "") + ")");
  const dans = function (lng, lat) {
    return lng >= BB.xMin && lng <= BB.xMax && lat >= BB.yMin && lat <= BB.yMax;
  };
  const wgs = [[2.3522, 48.8566], [4.8357, 45.764], [5.3698, 43.2965], [-1.55, 47.21], [7.75, 48.58]];
  verif(
    "G. l'enveloppe ne confond pas des degrés WGS84 avec du Lambert 93",
    wgs.every(function (c) { return !dans(c[0], c[1]); }),
    "Des coordonnées en degrés tombent dans l'enveloppe L93 : la détection reprojetterait un " +
    "fichier WGS84 parfaitement valide et l'enverrait à l'autre bout du monde."
  );
  const enL93 = wgs.map(function (c) { return L93.versL93(c[1], c[0]); });
  verif(
    "G'. de vraies coordonnées Lambert 93 tombent bien dans l'enveloppe",
    enL93.every(function (p) { return dans(p.x, p.y); }),
    "Des points français projetés en L93 sortent de l'enveloppe de détection : des fichiers " +
    "légitimes seraient refusés. Bornes actuelles : " + JSON.stringify(BB)
  );
}

verif(
  "H. la détection exige que TOUTES les coordonnées soient en Lambert 93",
  /for \(let i = 0; i < tous\.length; i\+\+\) \{\s*\n\s*if \(!_dansEnveloppeL93\(tous\[i\]\)\) return false;/.test(src),
  "`detecterLambert93` doit renvoyer false dès qu'UNE coordonnée sort de l'enveloppe. " +
  "Un fichier mixte reprojeté à moitié produit une carte où l'erreur ne se voit pas — " +
  "bien pire qu'un refus franc."
);

if (!echecs.length) {
  console.log("\n🎉 Lambert 93 : projection conforme à ses propriétés définitoires, détection sûre");
  process.exit(0);
}
console.log("\n============================================================");
console.log("🛑 COMMIT REFUSÉ — la projection Lambert 93 est fausse");
console.log("============================================================");
echecs.forEach(function (a) { console.log("\n   • " + a); });
console.log("");
process.exit(1);
