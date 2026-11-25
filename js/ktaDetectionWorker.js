/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ktaDetectionWorker.js — worker de la détection des structures : calcule un bloc d'image hors du fil principal.
// Lancé par js/ktaDetection.js > executeurWorker ; le calcul est celui de la page (même fichier, importScripts).
// Messages reçus : { id, bloc, garder } (bloc = arguments de KtaDetection.detecterBloc, tampon d'image transféré ;
//   `garder` : le bloc reste ici pour un recalcul, dans la limite du budget) ·
//   { id, recalculer: { classes, reglages } } (les blocs gardés, sans relire l'image : curseurs de l'aperçu) ·
//   { id, suivreTrait: { b, px, py, o } } (Remplir au clic sur un front : arguments de KtaDetection.suivreTrait,
//   tampon transféré ; jamais gardé) · { id, remplir: { b, px, py, o } } (Remplir au clic sur une forme fermée :
//   arguments de KtaDetection.remplir, tampon transféré ; jamais gardé).
// Message envoyé : { id, resultat } (bloc : résultat + `garde` ; recalcul : liste des résultats ; suivi, remplissage :
//   résultat de suivreTrait, de remplir) ou { id, erreur }.
// Garde-fou : scripts/check-detection.js · Doc : docs/architecture/plans-loader.md (Détecter les structures).
"use strict";

importScripts("ktaDetection.js");

const magasin = self.KtaDetection._magasin();

self.onmessage = function (ev) {
  const m = ev.data || {};
  try {
    if (m.suivreTrait) {
      const a = m.suivreTrait;
      self.postMessage({ id: m.id, resultat: self.KtaDetection.suivreTrait(a.b, a.px, a.py, a.o) });
      return;
    }
    if (m.remplir) {
      const a = m.remplir;
      self.postMessage({ id: m.id, resultat: self.KtaDetection.remplir(a.b, a.px, a.py, a.o) });
      return;
    }
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
