/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// CSS LAZY LOADER — chargement à la demande des feuilles CSS par feature
// =========================
// Pattern P2 (progressive lazy CSS) : `css/style.css` ne contient plus le
// CSS exhaustif de TOUTES les features. Les chunks par feature (Mode Secours,
// Heatmap, Filtres, MemInspector, …) vivent dans des fichiers séparés
// `css/style-<feature>.css` chargés à la demande via ce helper :
//
//   window._loadCssOnce("css/style-secours.css", "kta-css-style-secours");
//
// Idempotent : un id donné garantit qu'on n'injecte qu'une seule fois le
// même fichier, même si plusieurs codepaths appellent _loadCssOnce()
// indépendamment (ex: ouverture modale ET import .mkmsec.json en //).
//
// Promise-based : si tu veux attendre que le CSS soit appliqué avant
// d'afficher la modale, `await window._loadCssOnce(...)`. Sinon on appelle
// fire-and-forget et le browser applique le style dès le parsing terminé
// (~50-100 ms hors cache, instantané hors-ligne via Service Worker).
//
// Échec gracieux : si le fetch CSS échoue (offline + cache vide cas
// marginal du premier boot sans connectivité), la Promise résout quand
// même (pas reject) pour ne pas bloquer le rendu. La feature aura juste
// un styling dégradé fallback sur les règles de `style.css` principal.
//
// Service Worker : chaque chunk doit être listé dans `sw.js > ASSETS_TO_CACHE`
// pour être servi offline au prochain boot après installation.
// =========================

(function() {
  "use strict";

  /**
   * Charge un fichier CSS via `<link rel="stylesheet">` injecté dans `<head>`.
   * Idempotent : un id donné garantit une seule injection.
   *
   * @param {string} href — chemin vers le fichier CSS (ex: "css/style-secours.css")
   * @param {string} id   — id unique pour idempotence (ex: "kta-css-style-secours")
   * @returns {Promise<void>} resolve quand le CSS est appliqué (ou en échec gracieux)
   */
  function _loadCssOnce(href, id) {
    // Idempotence : si déjà injecté, retourner immédiatement
    var existing = document.getElementById(id);
    if (existing) {
      // Si le link est encore en cours de download, attendre sa résolution
      if (existing._kta_loadPromise) return existing._kta_loadPromise;
      // Sinon il est déjà loaded → resolve direct
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
        // Échec gracieux : on log mais on ne bloque PAS le rendu de la feature.
        // Le fallback sera les règles CSS du style.css principal (dégradé acceptable).
        console.warn("[cssLazy] Échec chargement", href, "→ fallback sur styles par défaut");
        delete link._kta_loadPromise;
        resolve();  // resolve même en échec → la feature peut s'afficher
      };
    });

    // Stocke la promise sur le link pour les appels concurrents
    link._kta_loadPromise = promise;

    document.head.appendChild(link);
    return promise;
  }

  window._loadCssOnce = _loadCssOnce;
})();
