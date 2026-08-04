/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// STYLERESOLVER.JS — Source de vérité UNIQUE des styles built-in (v1.75.2)
// =====================================================================
// POURQUOI CE MODULE EXISTE
// Avant lui, les couleurs des 13 types built-in étaient recopiées à la main
// dans ~25 tables réparties sur 12 fichiers (`utils.js` en portait 3 copies,
// `exporter.js` 2 à 4). Conséquences MESURÉES, pas supposées :
//   • `exporter.js > ZS_EMBED` avait oublié `inaccessible` → une zone
//     DANGEREUSE venant d'un calque de données sortait en GRIS REMBLAIS dans
//     l'export PNG avancé. Et ce n'était pas un oubli isolé : le même défaut
//     sur `jonction` avait déjà été corrigé en v1.7.1, `inaccessible` (v169)
//     l'a reproduit à l'identique.
//   • `legendCustomization.js > DEFAULT_RENDERS` (les pastilles de la légende)
//     était INDÉPENDANTE de `road.js > ROAD_STYLES` (la carte). Elles
//     coïncidaient par chance ; le jour où elles divergeaient, la légende
//     aurait menti sur la carte sans qu'aucun test ne le voie.
//
// Tout consommateur doit désormais demander son style ICI.
//
// ⚠️ VARIANTES DÉLIBÉRÉES — NE PAS LES « CORRIGER »
// Un relevé exhaustif (03/08/2026) a comparé les 25 tables. Deux jeux de
// valeurs divergent, et les DEUX sont intentionnels, commentés dans leur
// fichier d'origine :
//   1. `emergencyMode.js` — palette entière plus vive/contrastée pour la
//      mini-carte d'urgence (vert #27c97e au lieu de #00ff00, etc.).
//      « couleurs vives […] le rouge plein dit déjà danger ».
//   2. `osmView.js` / `osmHomePreview.js` — `inaccessible` en orange uni
//      #b8743c : sur fond OSM le motif hachuré SVG n'est pas rendu, ils
//      retombent volontairement sur un aplat lisible.
// Ces deux-là GARDENT leur table. Les unifier aurait changé le rendu de deux
// écrans sans que personne ne l'ait demandé. C'est précisément ce que la
// comparaison préalable a permis d'éviter.
//
// API : window.ktaResolveStyle(categorie, cle) → objet de style | null
//   categorie ∈ "traces" | "zones" | "structures"
//   Retourne toujours un OBJET NEUF (jamais la table interne) : un
//   consommateur qui mute son style ne doit pas contaminer les autres.
//   Les types CUSTOM (`cust-*`) sont résolus via LegendCustomization.
//
// window.ktaStyleBuiltins(categorie) → string[]  (clés built-in de la catégorie)
// =====================================================================

(function() {
  "use strict";

  // ───────── TABLE CANONIQUE ─────────
  // Valeurs relevées sur les tables existantes et vérifiées identiques dans
  // les ~25 emplacements (hors variantes délibérées ci-dessus). Toute
  // modification ici se propage partout — c'est le but.
  const CANON = {
    traces: {
      principal:  { color: "#00ff00", weight: 5, opacity: 1, smoothFactor: 2.5 },
      secondaire: { color: "#b000ff", weight: 5, opacity: 1, smoothFactor: 2.5 },
      chemin:     { color: "#ffff00", weight: 5, opacity: 1, smoothFactor: 2.5 },
      jonction:   { color: "#ff4ecb", weight: 5, opacity: 1, dashArray: "10 6", smoothFactor: 2.0 },
      itinerary:  { color: "#00d4ff", weight: 7, opacity: 0.9, dashArray: "12 6", smoothFactor: 1.5 }
    },
    zones: {
      eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      inaccessible: { color: "#5a0a0a", fillColor: "#7a0000", fillOpacity: 0.65, weight: 3, opacity: 1 }
    },
    structures: {
      "pilier-1": { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.85, weight: 2, opacity: 1 },
      "pilier-2": { color: "#000000", fillColor: "#ff9933", fillOpacity: 0.85, weight: 2, opacity: 1 },
      "mur":      { color: "#000000", fillColor: "#1e3a8a", fillOpacity: 0.85, weight: 2, opacity: 1 },
      "front-1":  { color: "#f4c542", weight: 5, opacity: 1 },
      "front-2":  { color: "#ff9933", weight: 5, opacity: 1 }
    }
  };

  // Géométrie attendue par catégorie — sert à construire un style cohérent
  // pour une entrée CUSTOM, dont on ne connaît que les couleurs choisies.
  const GEOM = { traces: "polyline", zones: "polygon", structures: "polygon" };

  function _copie(o) {
    const c = {};
    for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
    return c;
  }

  // Style d'une entrée CUSTOM (créée par l'utilisateur via la légende
  // personnalisable). On respecte la normalisation faite à la création :
  // polyline → lineColor seul ; polygon → fillColor + borderColor.
  function _styleCustom(entry, categorie) {
    if (!entry) return null;
    const geom = (entry.geometry || GEOM[categorie] || "polyline");
    if (geom === "polygon") {
      return {
        color:       entry.borderColor || entry.lineColor || "#888888",
        fillColor:   entry.fillColor   || "#888888",
        fillOpacity: 0.7,
        weight:      3,
        opacity:     1
      };
    }
    return {
      color:        entry.lineColor || entry.borderColor || "#ffffff",
      weight:       5,
      opacity:      1,
      smoothFactor: 2.5
    };
  }

  // ───────── API ─────────
  // Retourne null si la clé est inconnue ET n'est pas un custom résolvable :
  // le consommateur garde ainsi la main sur son propre repli, on ne lui impose
  // pas une couleur arbitraire qui masquerait un type non géré.
  function ktaResolveStyle(categorie, cle) {
    if (!categorie || !cle) return null;
    const table = CANON[categorie];
    if (table && Object.prototype.hasOwnProperty.call(table, cle)) {
      return _copie(table[cle]);
    }
    // Type custom (`cust-…`) → LegendCustomization
    if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
      try {
        const e = window.LegendCustomization.findCustomEntry(cle);
        if (e) return _styleCustom(e, e.category || categorie);
      } catch(err) { /* module absent ou entrée illisible : repli au caller */ }
    }
    return null;
  }

  function ktaStyleBuiltins(categorie) {
    const t = CANON[categorie];
    return t ? Object.keys(t) : [];
  }

  window.ktaResolveStyle  = ktaResolveStyle;
  window.ktaStyleBuiltins = ktaStyleBuiltins;
  // Exposée pour les harnais de test et les outils de diagnostic UNIQUEMENT.
  // Aucun module applicatif ne doit lire cette table en direct : passer par
  // ktaResolveStyle(), sinon on recrée exactement le problème qu'on corrige.
  window.__ktaStyleCanon  = CANON;

  console.log("[StyleResolver] Module chargé — window.ktaResolveStyle prêt");
})();
