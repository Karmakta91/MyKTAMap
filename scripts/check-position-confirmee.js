// =====================================================================
// check-position-confirmee.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// La règle « instant T » (docs/architecture/tracking.md § Position confirmée) :
// `tracking.js > position` vaut le départ du plan tant que l'utilisateur ne
// s'est pas situé (drapeau `_positionConfirmee`). Sortie d'urgence et « Y aller »
// partent du tracker sans question si suivi actif OU position confirmée, sinon
// ouvrent le picker partagé « Où es-tu ? ». `requestPermission()` rend une
// Promise<boolean> que le démarrage du tracker ATTEND.
// 🩸 Régressions silencieuses refusées :
//   1. écriture de `position` sur décision utilisateur sans poser le drapeau
//      (le picker s'ouvre alors qu'on vient de se situer), ou remise à zéro
//      sans le retomber (l'urgence part du départ présenté comme confirmé) ;
//   2. `_tracerIndex` qui ne passe plus l'origine → « Position du tracker
//      indisponible » ;
//   3. permission avalée → tracker « ON » et inerte sur refus iOS ;
//   4. picker sans `.kta-iti-floater` → le tap sur un marqueur ouvre sa popup.
// Usage : node scripts/check-position-confirmee.js [racine]  (une autre racine
// sert à falsifier le script sur une copie).
"use strict";
const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

let echecs = 0;
function ok(msg)  { console.log("✅ " + msg); }
function ko(msg)  { console.log("❌ " + msg); echecs++; }
function verif(cond, msg) { (cond ? ok : ko)(msg); }
function bloc(src, debut, fin) {
  const i = src.indexOf(debut);
  if (i < 0) return "";
  const j = fin ? src.indexOf(fin, i + debut.length) : -1;
  return src.slice(i, j < 0 ? undefined : j);
}

const tracking  = lire("js/tracking.js");
const sortie    = lire("js/sortieUrgence.js");
const iti       = lire("js/interfaceItineraire.js");
const interf    = lire("js/interface.js");
const utils     = lire("js/utils.js");
const emergency = lire("js/emergencyMode.js");

// ── 1. Le drapeau et ses points d'écriture ───────────────────────────
verif(/let _positionConfirmee\s*=\s*false/.test(tracking), "tracking.js : le drapeau `_positionConfirmee` existe, faux par défaut");
verif(/function _marquerPositionConfirmee\(/.test(tracking), "tracking.js : `_marquerPositionConfirmee()` existe");
verif(/window\.getTrackingPositionEtat\s*=\s*function/.test(tracking) &&
      /confirmee:\s*_positionConfirmee/.test(tracking) && /suiviActif:\s*tracking\s*===\s*true/.test(tracking),
      "tracking.js : `getTrackingPositionEtat()` expose {confirmee, ts, suiviActif}");

const clicRecalage = bloc(tracking, "if (!window.modeRecalage) return;", "_notifierRecalage(x, y, \"click\")");
verif(clicRecalage.includes("_marquerPositionConfirmee()"), "🩸 clic carte en mode recalage → pose le drapeau");

const surPoint = bloc(tracking, "window.recalerTrackerSurPoint = function", "_notifierRecalage(x, y, \"point\")");
verif(surPoint.includes("_marquerPositionConfirmee()"), "🩸 recalerTrackerSurPoint (« Je suis ici », portail, picker) → pose le drapeau");

const init = bloc(tracking, "function initTracking() {", "initCollisionCache();");
verif(/_positionConfirmee\s*=\s*false/.test(init), "🩸 initTracking (nouveau plan) → retombe le drapeau");

const reset = bloc(tracking, "function resetTrackingPosition() {", "updateMap();");
verif(/_positionConfirmee\s*=\s*false/.test(reset), "🩸 resetTrackingPosition (Reset des Réglages) → retombe le drapeau");

const rebuild = bloc(tracking, "function _rebuildTrailFromTimeline() {", "try {");
verif(/type === "recalage"/.test(rebuild) && rebuild.includes("_marquerPositionConfirmee("),
      "session restaurée : confirmée SEULEMENT si la timeline contient un recalage");

// ── 2. Les consommateurs appliquent la règle ─────────────────────────
const declencher = bloc(sortie, "function declencher() {", "SU._modePickerCarte();");
verif(declencher.includes("getTrackingPositionEtat"), "sortieUrgence.declencher lit l'état de la position");
verif(/etat\.suiviActif \|\| etat\.confirmee/.test(declencher), "🩸 règle « instant T » : suivi actif OU confirmée → calcul direct, sans question");
verif(sortie.includes("window.ktaDemanderPositionCarte("), "sortieUrgence : le cas « jamais confirmée » passe par le picker partagé");

const tracer = bloc(sortie, "SU._tracerIndex = function", "SU._toggleAlternatives");
verif(/itineraireYAller\([\s\S]*origine:\s*_lastResultats\.origine/.test(tracer), "🩸 « Tracer » passe l'origine du calcul à itineraireYAller (fin du cul-de-sac)");

verif(/window\.itineraireYAller\s*=\s*function\s*\(x,\s*y,\s*nom,\s*opts\)/.test(iti), "itineraireYAller accepte `opts`");
const yAller = bloc(iti, "window.itineraireYAller = function", "const labelPoint");
verif(/opts\.origine/.test(yAller) && /getTrackingPositionEtat/.test(yAller) && /ktaDemanderPositionCarte\(/.test(yAller),
      "🩸 « Y aller » : origine imposée, sinon même règle (picker si jamais confirmée)");
verif(/origineForcee \|\|/.test(yAller), "« Y aller » : l'origine imposée prime sur la position du tracker");

verif(emergency.includes("emergency.status.positionDefaut") && emergency.includes("getTrackingPositionEtat"),
      "écran Urgence XL : « position par défaut — jamais confirmée » au lieu de « dernière position »");

// ── 3. Le picker partagé ─────────────────────────────────────────────
const picker = bloc(utils, "window.ktaDemanderPositionCarte = function", "window.ktaDemanderPositionCarte.annuler");
verif(picker.length > 0, "utils.js : `ktaDemanderPositionCarte` existe");
// 🩸 L'affectation de className exacte : `kta-iti-floater-icon` matcherait
// un floater sans la classe commune.
verif(/fl\.className\s*=\s*"kta-iti-floater(?:\s|")/.test(picker), "🩸 le floater porte `.kta-iti-floater` (tap capturé même sur un marqueur)");
verif(/recalerTrackerSurPoint\(x, y\)/.test(picker), "🩸 le tap RECALE le tracker (= confirme la position)");
verif(/_desactiverTousLesModes/.test(picker) && /window\._desactiverTousLesModes\s*=\s*_desactiverTousLesModes/.test(interf),
      "les autres modes clic-carte tombent avant d'armer (registre exposé par interface.js)");
verif(/APP_CONFIG\.imageHeight - e\.latlng\.lat/.test(picker), "conversion inverse de convertCoord : y = imageHeight − lat");

// ── 4. Permission capteurs ───────────────────────────────────────────
const perm = bloc(tracking, "function requestPermission() {", "\n}\n");
verif(/return Promise\.resolve\(true\)/.test(perm) && /return true;/.test(perm) && /return false;/.test(perm) && /\.catch\(/.test(perm),
      "🩸 requestPermission rend une Promise<boolean> avec branche refus ET catch");
const doStart = bloc(interf, "const _doStart = function() {", "const _doStartSuite = function() {");
verif(/Promise\.resolve\(perm\)\.then/.test(doStart) && /ok === false/.test(doStart) && /_alertCharte\(/.test(doStart),
      "🩸 _doStart ATTEND la permission ; sur refus : modale chartée, rien n'est activé");
verif(!/startTracking\(\)/.test(doStart), "🩸 _doStart ne démarre pas le suivi avant la réponse");

// ── 5. Textes ────────────────────────────────────────────────────────
for (const lang of ["fr", "en", "es"]) {
  const dico = JSON.parse(lire("lang/" + lang + ".json"));
  const manquantes = ["sortie.origine.suivi", "sortie.origine.confirmee", "sortie.origine.confirmeeRecent",
    "sortie.origine.clic", "sortie.pick.floater", "pospick.floater", "pospick.annuler", "iti.pick.ouEsTu",
    "ui.trackerWarn.refusTitre", "ui.trackerWarn.refusTexte", "emergency.status.positionDefaut",
    "sortie.fallback.label", "sortie.fallback.bandeau", "sortie.fallback.sep", "sortie.fallback.court"]
    .filter(k => typeof dico[k] !== "string");
  verif(manquantes.length === 0, "🌍 " + lang + " : les clés de la règle existent" + (manquantes.length ? " — manquantes : " + manquantes.join(", ") : ""));
}

console.log("");
if (echecs) {
  console.log("💥 position confirmée : " + echecs + " contrôle(s) en échec");
  process.exit(1);
}
console.log("🎉 position confirmée : « à l'instant T » quand on la connaît, « où es-tu ? » seulement sinon");
