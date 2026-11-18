/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ktaDetectionWorker.js — worker de la détection des structures : calcule un bloc d'image hors du fil principal.
// Lancé par js/ktaDetection.js > executeurWorker ; le calcul est celui de la page (même fichier, importScripts).
// Message reçu : { id, bloc } (bloc = arguments de KtaDetection.detecterBloc, tampon d'image transféré).
// Message envoyé : { id, resultat } ou { id, erreur }.
// Garde-fou : scripts/check-detection.js · Doc : docs/architecture/plans-loader.md (Détecter les structures).
"use strict";

importScripts("ktaDetection.js");

self.onmessage = function (ev) {
  const m = ev.data || {};
  try {
    self.postMessage({ id: m.id, resultat: self.KtaDetection.detecterBloc(m.bloc) });
  } catch (err) {
    self.postMessage({ id: m.id, erreur: (err && err.message) || String(err) });
  }
};
