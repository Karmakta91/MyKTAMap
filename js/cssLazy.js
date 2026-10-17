/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// CSSLAZY.JS — Chargement à la demande des feuilles CSS par fonctionnalité
// =========================
// `css/style.css` ne contient pas tout : les morceaux par fonctionnalité (Mode Secours, Heatmap, Filtres,
// MemInspector…) vivent dans `css/style-<feature>.css`, chargés par :
//   window._loadCssOnce("css/style-secours.css", "kta-css-style-secours");
// Idempotent par id (plusieurs chemins peuvent l'appeler en parallèle). Rend une Promise : `await` pour attendre
// l'application du style, sinon fire-and-forget.
// Échec gracieux : un fetch raté (premier démarrage hors ligne, cache vide) RÉSOUT quand même la Promise ; la
// fonctionnalité retombe sur les règles de `style.css`.
// ⚠️ Chaque morceau doit figurer dans `sw.js > ASSETS_TO_CACHE` pour être servi hors ligne.

(function() {
  "use strict";

  // <link rel="stylesheet"> injecté dans <head>, une fois par id. href = chemin du CSS, id = identifiant
  // d'idempotence ; rend Promise<void> résolue à l'application (ou en échec gracieux).
  function _loadCssOnce(href, id) {
    var existing = document.getElementById(id);
    if (existing) {
      // Lien encore en téléchargement : on attend sa résolution.
      if (existing._kta_loadPromise) return existing._kta_loadPromise;
      return Promise.resolve();
    }

    var link = document.createElement("link");
    link.id   = id;
    link.rel  = "stylesheet";
    link.href = href;

    var promise = new Promise(function(resolve) {
      link.onload  = function() {
        delete link._kta_loadPromise;  // libère la référence
        resolve();
      };
      link.onerror = function() {
        // Échec gracieux : on journalise sans bloquer le rendu (repli sur style.css).
        console.warn("[cssLazy] Échec chargement", href, "→ fallback sur styles par défaut");
        delete link._kta_loadPromise;
        resolve();  // resolve même en échec → la feature peut s'afficher
      };
    });

    // Promise posée sur le lien pour les appels concurrents.
    link._kta_loadPromise = promise;

    document.head.appendChild(link);
    return promise;
  }

  window._loadCssOnce = _loadCssOnce;
})();
