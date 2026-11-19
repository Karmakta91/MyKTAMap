/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ktaDetectionWorker.js — worker de la détection des structures : calcule un bloc d'image hors du fil principal.
// Lancé par js/ktaDetection.js > executeurWorker ; le calcul est celui de la page (même fichier, importScripts).
// Messages reçus : { id, bloc, garder } (bloc = arguments de KtaDetection.detecterBloc, tampon d'image transféré ;
//   `garder` : le bloc reste ici pour un recalcul, dans la limite du budget) ·
//   { id, recalculer: { classes, reglages } } (les blocs gardés, sans relire l'image : curseurs de l'aperçu).
// Message envoyé : { id, resultat } (bloc : résultat + `garde` ; recalcul : liste des résultats) ou { id, erreur }.
// Garde-fou : scripts/check-detection.js · Doc : docs/architecture/plans-loader.md (Détecter les structures).
"use strict";

importScripts("ktaDetection.js");

const magasin = self.KtaDetection._magasin();

self.onmessage = function (ev) {
  const m = ev.data || {};
  try {
    if (m.recalculer) {
      self.postMessage({ id: m.id, resultat: magasin.recalculer(m.recalculer.classes, m.recalculer.reglages) });
      return;
    }
    const r = self.KtaDetection.detecterBloc(m.bloc);
    r.garde = !!m.garder && magasin.garder(m.bloc);
    self.postMessage({ id: m.id, resultat: r });
  } catch (err) {
    self.postMessage({ id: m.id, erreur: (err && err.message) || String(err) });
  }
};
