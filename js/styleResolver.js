/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// STYLERESOLVER.JS — Source de vérité UNIQUE des styles built-in (v1.76.0)
// =====================================================================
// ÉTAT DE LA MIGRATION (une vague = un lot de consommateurs)
//   ✅ vague 1 — CARTE : road.js · zones.js · structures.js
//   ✅ vague 2 — EXPORTS IMAGE : exporter.js · utils.js
//   ✅ vague 3 — KMZ : kmzExport.js
//   ✅ vague 4 — RESTE : legendCustomization.js · interfaceLegende.js ·
//                statsGlobales.js · interfaceDistanceTotale.js ·
//                refonteInterface.js · sessionReport.js
// 🎉 MIGRATION TERMINÉE — `scripts/check-style-canon.js` confronte désormais
//    ZÉRO table : il ne reste plus une seule couleur de type écrite à la main
//    hors des exceptions ci-dessous. Le script reste BLOQUANT : il mordra si
//    quelqu'un réintroduit une table.
//
// ⚠️ Deux fichiers n'avaient RIEN à migrer, contrairement à ce qu'affirmaient
//    les inventaires précédents :
//    • `secoursMode.js` — ses tracés sont coloriés par COULEUR D'ÉQUIPE, pas
//      par type. Aucune table de style par type.
//    • `gpxIO.js` — le GPX n'a aucune notion de style.
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
// API : window.ktaResolveStyle(categorie, cle [, opts]) → objet de style | null
//   categorie ∈ "traces" | "zones" | "structures"
//   opts.flat = true → remplace un remplissage à MOTIF SVG par son aplat de
//     repli. À utiliser dans tout contexte qui ne sait pas peindre un
//     `url(#pattern)` : export bitmap, KMZ, rendu sur fond OSM.
//   Retourne toujours un OBJET NEUF (jamais la table interne) : un
//   consommateur qui mute son style ne doit pas contaminer les autres.
//   Les types CUSTOM (`cust-*`) sont résolus via LegendCustomization.
//
// window.ktaStyleBuiltins(categorie) → string[]  (clés built-in de la catégorie)
//
// window.ktaAppliquerCouleurChoisie(categorie, cle, style) → style
//   Applique à un style DÉJÀ CONSTRUIT la couleur que l'utilisateur a choisie
//   pour ce type (≡ Légende → ✏️ Modifier), selon la géométrie de la
//   catégorie. Réservé aux deux écrans à palette délibérément différente
//   ci-dessus : ils gardent leur base vive, mais un choix de l'utilisateur
//   doit les atteindre comme il atteint la carte.
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
      eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7, weight: 3, opacity: 1 },
      remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7, weight: 3, opacity: 1 },
      effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7, weight: 3, opacity: 1 },
      // Hachures rouge sombre 45° via le pattern SVG declare dans index.html.
      // Exige un renderer L.svg() (le canvas ignore le url(#...)) — c'est
      // pourquoi zones.js/utils.js forcent un renderer dedie pour ce seul type.
      // Les contextes SANS motif (export bitmap, KMZ, fond OSM) demandent le
      // style avec { flat: true } et recoivent l'aplat ci-dessous.
      inaccessible: {
        color: "#5a0a0a", fillColor: "url(#kta-pattern-inaccessible)",
        fillOpacity: 1, weight: 3, opacity: 1,
        _flatFill: "#7a0000", _flatFillOpacity: 0.65
      }
    },
    structures: {
      "pilier-1": { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.85, weight: 3, opacity: 1 },
      "pilier-2": { color: "#000000", fillColor: "#ff9933", fillOpacity: 0.85, weight: 3, opacity: 1 },
      "mur":      { color: "#000000", fillColor: "#1e3a8a", fillOpacity: 0.85, weight: 3, opacity: 1 },
      // Fronts de taille : POLYLINES epaisses (weight 10, ~2x les roads) sans
      // contour. `fillColor` est conserve identique a `color` (sans objet pour
      // une polyline) car plusieurs consommateurs lisent l'un ou l'autre.
      // `isPolyline` est lu par les adaptateurs de rendu — ne pas le retirer.
      "front-1":  { color: "#f4c542", fillColor: "#f4c542", fillOpacity: 1, weight: 10, opacity: 1, isPolyline: true },
      "front-2":  { color: "#ff9933", fillColor: "#ff9933", fillOpacity: 1, weight: 10, opacity: 1, isPolyline: true }
    }
  };

  // Géométrie attendue par catégorie — sert à construire un style cohérent
  // pour une entrée CUSTOM, dont on ne connaît que les couleurs choisies.
  const GEOM = { traces: "polyline", zones: "polygon", structures: "polygon" };

  // ───────── OVERRIDE DE COULEUR (v1.76.0) ─────────
  // L'utilisateur peut choisir la couleur d'un type BUILT-IN depuis
  // ≡ Légende → ✏️ Modifier. UNE seule couleur par type : c'est ici qu'on
  // décide de ce qu'elle repeint, selon la géométrie. Branché à cet endroit
  // précis, l'override atteint TOUT le monde — carte, exports PNG/PDF, KMZ,
  // pastilles de légende, camemberts, rapport de session — sans qu'aucun
  // consommateur n'ait à le savoir. C'était la raison d'être de ce module.
  //
  // Les types CUSTOM ne passent pas par là : leur couleur vit déjà dans leur
  // entrée, éditable directement.

  // Assombrit une couleur (bordure dérivée d'un remplissage choisi).
  function _assombrir(hex, k) {
    if (typeof hex !== "string" || hex[0] !== "#" || hex.length !== 7) return hex;
    const v = [1, 3, 5].map(function(i) {
      return Math.max(0, Math.min(255, Math.round(parseInt(hex.substr(i, 2), 16) * k)));
    });
    return "#" + v.map(function(n) { return n.toString(16).padStart(2, "0"); }).join("");
  }

  function _appliquerOverride(categorie, cle, s) {
    const LC = window.LegendCustomization;
    if (!LC || typeof LC.getColor !== "function") return s;
    let c = null, b = null;
    try {
      c = LC.getColor(categorie, cle);
      // 🎨 v1.76.1 — bordure INDÉPENDANTE (zones + piliers/mur). Sans elle :
      // comportement v1.76.0 inchangé (dérivée / noire).
      if (typeof LC.getBorderColor === "function") b = LC.getBorderColor(categorie, cle);
    } catch(e) { return s; }
    if (!c && !b) return s;

    if (categorie === "traces") {          // un tracé, c'est son trait
      if (c) s.color = c;
      return s;
    }
    if (categorie === "structures") {
      if (s.isPolyline) {                  // front de taille : trait épais
        if (c) { s.color = c; s.fillColor = c; }   // le canon garde les deux alignés
        return s;
      }
      // Pilier / mur : remplissage = couleur choisie ; contour NOIR par
      // DÉFAUT (signature visuelle des structures) — mais depuis v1.76.1 la
      // bordure est un choix, plus un verrou (décision KARMA).
      if (c) s.fillColor = c;
      if (b) s.color = b;
      return s;
    }
    // Zones : remplissage = couleur choisie ; bordure explicite si choisie,
    // sinon dérivée par assombrissement — la relation du canon (#3aa9e8 → #0066aa).
    if (c) {
      s.fillColor = c;
      s.color     = b || _assombrir(c, 0.62);
      // Un type à MOTIF (inaccessible) perd ses hachures quand il est repeint :
      // le pattern SVG est statique dans index.html, il ne peut pas prendre une
      // couleur choisie à l'exécution. On retombe donc sur un aplat, à l'opacité
      // prévue pour son repli.
      if (s._flatFillOpacity !== undefined) s.fillOpacity = s._flatFillOpacity;
    } else {
      s.color = b;                         // bordure seule : le fond reste canon
    }
    return s;
  }

  function _copie(o) {
    const c = {};
    for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
    return c;
  }

  // Style d'une entrée CUSTOM (créée par l'utilisateur via la légende
  // personnalisable). On respecte la normalisation faite à la création :
  // polyline → lineColor seul ; polygon → fillColor + borderColor.
  // Un custom doit RESSEMBLER aux built-in de SA catégorie : une structure
  // custom porte le contour noir et l'opacite 0.85 des piliers, un front custom
  // l'epaisseur 10 des fronts. Un repli generique unique les aurait tous
  // ramenes au gabarit des zones — c'est-a-dire un changement de rendu.
  function _styleCustom(entry, categorie) {
    if (!entry) return null;
    const geom = (entry.geometry || GEOM[categorie] || "polyline");

    if (categorie === "structures") {
      if (geom === "polyline") {                       // front de taille custom
        const col = entry.lineColor || entry.borderColor || "#888888";
        return { color: col, fillColor: col, fillOpacity: 1, weight: 10, opacity: 1, isPolyline: true };
      }
      return {                                          // pilier / mur custom
        color:       entry.borderColor || "#000000",
        fillColor:   entry.fillColor   || "#888888",
        fillOpacity: 0.85,
        weight:      3,
        opacity:     1
      };
    }

    if (geom === "polygon") {                           // zone custom
      return {
        color:       entry.borderColor || entry.fillColor || "#888888",
        fillColor:   entry.fillColor   || "#888888",
        fillOpacity: 0.7,
        weight:      3,
        opacity:     1
      };
    }

    return {                                            // trace custom
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
  function ktaResolveStyle(categorie, cle, opts) {
    if (!categorie || !cle) return null;
    const table = CANON[categorie];
    if (table && Object.prototype.hasOwnProperty.call(table, cle)) {
      const s = _copie(table[cle]);
      // Contexte sans motif SVG (bitmap, KMZ, fond OSM) : on substitue l'aplat
      // de repli AVANT de rendre le style, pour qu'aucun consommateur ne se
      // retrouve avec un `url(#...)` qu'il ne sait pas peindre.
      if (opts && opts.flat && s._flatFill) {
        s.fillColor   = s._flatFill;
        s.fillOpacity = (s._flatFillOpacity !== undefined) ? s._flatFillOpacity : s.fillOpacity;
      }
      // APRÈS le repli d'aplat : une couleur choisie par l'utilisateur prime
      // sur tout, motif SVG compris.
      _appliquerOverride(categorie, cle, s);
      delete s._flatFill; delete s._flatFillOpacity;
      return s;
    }
    // Type custom (`cust-…`) → LegendCustomization
    if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
      try {
        const e = window.LegendCustomization.findCustomEntry(cle);
        // Même garde que les trois consommateurs historiques : une entrée
        // d'une AUTRE catégorie n'est pas un repli acceptable — une zone
        // custom ne doit pas se retrouver rendue comme un tracé.
        if (e && (!e.category || e.category === categorie)) return _styleCustom(e, categorie);
      } catch(err) { /* module absent ou entrée illisible : repli au caller */ }
    }
    return null;
  }

  function ktaStyleBuiltins(categorie) {
    const t = CANON[categorie];
    return t ? Object.keys(t) : [];
  }

  // Couleur REPRÉSENTATIVE d'un type — une seule, pour les surfaces qui ne
  // peuvent en montrer qu'une : pastille de légende, barre de statistiques,
  // part de camembert, aplat de rapport.
  // Convention : un polygone est représenté par son REMPLISSAGE (c'est ce
  // qu'on voit de loin), une ligne par son TRAIT. `{ flat: true }` parce
  // qu'aucune de ces surfaces ne sait peindre un motif SVG.
  // Sans ce helper, chaque module se refaisait sa propre palette « à peu
  // près » — d'où des camemberts colorés par hash, sans aucun rapport avec
  // la carte. Passer par ici garantit qu'un futur override de couleur les
  // atteindra tous, par construction.
  function ktaSwatchColor(categorie, cle) {
    const s = ktaResolveStyle(categorie, cle, { flat: true });
    if (!s) return null;
    if (s.fillColor && !s.isPolyline) return s.fillColor;
    return s.color || null;
  }

  // Pastille HTML d'un type — pour les surfaces qui affichaient un ÉMOJI
  // (🟩 🟥 🟡…) en guise de couleur. Un émoji est un caractère : il garde sa
  // couleur d'origine quoi qu'on fasse, donc après un override l'icône
  // mentait sur la carte (bug remonté par KARMA le 05/08). Ici : un trait
  // pour les lignes, un carré rempli+bordé pour les polygones, résolus LIVE.
  // `repli` (l'émoji historique) est rendu si le type est introuvable.
  // ⚠️ HTML — à n'injecter QUE dans des conteneurs innerHTML (boutons de
  // sidebar, reflets de mode). Les titres de POPUP échappent leur texte
  // (anti-XSS voulu) : l'émoji y reste, c'est une limite documentée.
  function ktaTypeSwatchHtml(categorie, cle, repli) {
    const s = ktaResolveStyle(categorie, cle, { flat: true });
    if (!s) return repli || "";
    const estLigne = (categorie === "traces") || !!s.isPolyline;
    if (estLigne) {
      return '<span style="display:inline-block;width:18px;height:4px;background:' + s.color +
             ';vertical-align:middle;border-radius:1px;"></span>';
    }
    return '<span style="display:inline-block;width:13px;height:13px;background:' + (s.fillColor || s.color) +
           ';border:2px solid ' + s.color + ';vertical-align:middle;border-radius:3px;"></span>';
  }

  // Variante pour les LIBELLÉS de formulaire (« 🟩 Principaux ») : l'émoji de
  // tête est remplacé par la pastille résolue. Les libellés i18n des modales
  // d'export portent leur émoji EN DUR dans la chaîne traduite — après un
  // override de couleur, le formulaire montrait l'ancienne couleur alors que
  // l'export sortait la nouvelle (bug remonté par KARMA le 05/08, suite de N2).
  // Seuls les émojis DE COULEUR sont remplacés ; les symboles sémantiques
  // (⛔ inaccessible, 🪜 jonction) restent — même règle que la sidebar.
  // Si le libellé ne commence pas par un émoji de couleur (traduction sans
  // émoji, libellé déjà nettoyé), il est rendu tel quel.
  const _EMOJIS_COULEUR = ["🟩", "🟪", "🟨", "🟦", "🟥", "⬛", "🟡", "🟠", "🔵", "🟧"];
  function ktaLabelAvecPastille(categorie, cle, label) {
    const l = String(label == null ? "" : label);
    for (let i = 0; i < _EMOJIS_COULEUR.length; i++) {
      const e = _EMOJIS_COULEUR[i];
      if (l.indexOf(e) === 0) {
        const pastille = ktaTypeSwatchHtml(categorie, cle, e);
        return pastille + " " + l.slice(e.length).replace(/^\s+/, "");
      }
    }
    return l;
  }

  window.ktaResolveStyle    = ktaResolveStyle;
  window.ktaStyleBuiltins   = ktaStyleBuiltins;
  // 🎨 26/09/2026 — exposee pour les DEUX écrans qui gardent délibérément
  // leur propre palette (`emergencyMode.js`, `osmView.js`) : sans ça, une
  // couleur choisie par l'utilisateur ne les atteignait pas, et la seule
  // façon de la respecter aurait été de RECOPIER ici la règle « ce qu'une
  // couleur repeint selon la géométrie » — soit exactement la duplication
  // que ce module existe pour éliminer.
  window.ktaAppliquerCouleurChoisie = function(categorie, cle, style) {
    if (!style) return style;
    try { return _appliquerOverride(categorie, cle, style); }
    catch(e) { return style; }
  };
  // 🎨 v1.77.0 — dérivation bordure↔remplissage du canon, exposée pour que
  // le widget OSM HOME (qui résout ses overrides PAR PLAN depuis les slots
  // SessionPersist, hors état live) garde la même relation visuelle.
  window.ktaAssombrir       = _assombrir;
  window.ktaSwatchColor       = ktaSwatchColor;
  window.ktaTypeSwatchHtml    = ktaTypeSwatchHtml;
  window.ktaLabelAvecPastille = ktaLabelAvecPastille;
  // Exposée pour les harnais de test et les outils de diagnostic UNIQUEMENT.
  // Aucun module applicatif ne doit lire cette table en direct : passer par
  // ktaResolveStyle(), sinon on recrée exactement le problème qu'on corrige.
  window.__ktaStyleCanon  = CANON;

  console.log("[StyleResolver] Module chargé — window.ktaResolveStyle prêt");
})();
