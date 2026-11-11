/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// styleResolver.js — source de vérité UNIQUE des styles des types built-in (tracés, zones, structures).
// Expose : window.ktaResolveStyle(categorie, cle [, opts]) → objet de style NEUF | null
//   categorie ∈ "traces" | "zones" | "structures" ; types `cust-*` résolus via LegendCustomization.
//   Sans opts : style de la carte, `inaccessible` hachurée par un CanvasPattern (même canvas que les
//   autres vecteurs : l'ordre d'empilement zones < structures tient). opts.flat = true → aplat de repli
//   (export bitmap, KMZ, fond OSM, pastilles).
// · ktaStyleBuiltins(cat) → clés built-in · ktaSwatchColor · ktaTypeSwatchHtml · ktaLabelAvecPastille
// · Couleur liée : zones.pente (zone jonction) prend le trait de traces.jonction (`_couleurDe`).
// · ktaAppliquerCouleurChoisie(cat, cle, style) : applique la couleur choisie par l'utilisateur
//   (Légende → Modifier) à un style déjà construit — réservé aux deux palettes délibérées ci-dessous.
// 🩸 Aucun consommateur ne recopie une couleur de type : une table locale finit par diverger (zone
//   dangereuse exportée en gris, légende qui ment sur la carte).
// ⚠️ Variantes délibérées, à NE PAS « corriger » (décision produit) : `emergencyMode.js` (palette vive
//   de la mini-carte d'urgence) et `osmView.js`/`osmHomePreview.js` (`inaccessible` en aplat orange
//   sur fond OSM). Elles passent par ktaAppliquerCouleurChoisie.
// Garde-fou : scripts/check-style-canon.js (bloquant), scripts/check-style-resolver.js
// Doc : docs/architecture/rendering-leaflet.md

(function() {
  "use strict";

  // ── Table canonique (toute modification se propage partout) ──────────────
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
      // Hachures = `_motif` peint en CanvasPattern (_motifCanvas) sur le fond `fillColor` : rayures
      // `raie` à 45°, espacées de `pas` px, sur un voile `voile`. Sans motif : { flat: true }.
      inaccessible: {
        color: "#5a0a0a", fillColor: "#5a0a0a",
        fillOpacity: 1, weight: 3, opacity: 1,
        _flatFill: "#7a0000", _flatFillOpacity: 0.65,
        _motif: { voile: "#cc0000", voileOpacite: 0.45, raie: "#1a1f2e", largeur: 4, pas: 14 }
      },
      // Zone jonction (salle dont le sol monte d'un niveau à l'autre). ⚠️ contrat (décision produit) : sa couleur
      // EST celle du tracé jonction (`_couleurDe`, couleur choisie comprise) : changer l'une change l'autre. Les
      // valeurs écrites ici ne servent qu'aux garde-fous qui lisent la table sans l'exécuter.
      pente: {
        color: "#ff4ecb", fillColor: "#ff4ecb", fillOpacity: 0.3, weight: 3, opacity: 1, dashArray: "10 6",
        _couleurDe: ["traces", "jonction"]
      }
    },
    structures: {
      "pilier-1": { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.85, weight: 3, opacity: 1 },
      "pilier-2": { color: "#000000", fillColor: "#ff9933", fillOpacity: 0.85, weight: 3, opacity: 1 },
      "mur":      { color: "#000000", fillColor: "#1e3a8a", fillOpacity: 0.85, weight: 3, opacity: 1 },
      // Fronts de taille = polylines épaisses. `fillColor` reste égal à `color` (des consommateurs
      // lisent l'un ou l'autre) ; `isPolyline` est lu par les adaptateurs de rendu.
      "front-1":  { color: "#f4c542", fillColor: "#f4c542", fillOpacity: 1, weight: 10, opacity: 1, isPolyline: true },
      "front-2":  { color: "#ff9933", fillColor: "#ff9933", fillOpacity: 1, weight: 10, opacity: 1, isPolyline: true },
      // Mur en ligne : le bleu du mur, en trait. Seule structure qui coupe l'itinéraire (pathfinder.js >
      // _collecterMursLigne) — rôle lié à la CLÉ, pas au libellé ni à la couleur choisis en légende.
      "mur-ligne": { color: "#1e3a8a", fillColor: "#1e3a8a", fillOpacity: 1, weight: 10, opacity: 1, isPolyline: true },
      // Arc de soutènement (arc isolé en travers de la galerie, on passe dessous) : le bleu de la maçonnerie, plus
      // fin que le mur en ligne, rayé de rouge (convention des légendes de carrière). `rayures`, gardées en aplat
      // aussi : couleur des segments peints par-dessus le trait (structures.js > ktaPolylineStructure, exports
      // canvas) ; un contexte qui ne sait pas les peindre (KMZ, Vue OSM) garde le trait bleu seul. Rouge = contour
      // de la zone effondrement, le seul rouge de la table à ≥ 3:1 sur fond blanc, crème et noir.
      // ⚠️ Aucun rôle d'obstacle : ni itinéraire, ni tracker, ni vue 3D (clé absente de leurs tables).
      "arc": { color: "#1e3a8a", fillColor: "#1e3a8a", fillOpacity: 1, weight: 6, opacity: 1, isPolyline: true,
               rayures: { color: "#cc0000" } }
    }
  };

  // Géométrie par catégorie, pour styler une entrée CUSTOM (on n'en connaît que les couleurs).
  const GEOM = { traces: "polyline", zones: "polygon", structures: "polygon" };

  // ── Couleur choisie par l'utilisateur pour un type built-in ──────────────
  // Une couleur par type ; c'est ici qu'on décide ce qu'elle repeint, selon la géométrie, pour
  // atteindre carte, exports, KMZ, légende, camemberts et rapport. Les CUSTOM n'y passent pas.
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
      // Bordure indépendante (zones, piliers/mur) ; absente → dérivée ou noire.
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
      // Pilier / mur : contour noir par défaut, mais modifiable (décision produit).
      if (c) s.fillColor = c;
      if (b) s.color = b;
      return s;
    }
    // Zones : remplissage = couleur choisie ; bordure explicite si choisie,
    // sinon dérivée par assombrissement — la relation du canon (#3aa9e8 → #0066aa).
    if (c) {
      s.fillColor = c;
      s.color     = b || _assombrir(c, 0.62);
      // 🩸 Un type à motif repeint devient un aplat : le motif garde ses couleurs canon.
      if (s._flatFillOpacity !== undefined) s.fillOpacity = s._flatFillOpacity;
    } else {
      s.color = b;                         // bordure seule : le fond reste canon
    }
    return s;
  }

  // ── Motif de hachures en CanvasPattern (un par type, construit une fois) ───
  // ⚠️ Accepté tel quel en `fillColor` par le renderer canvas de Leaflet (ctx.fillStyle = …) ; ancré à
  // l'origine des points de calque : il suit la carte au glissé et garde sa taille à l'écran au zoom.
  // null (pas de canvas : Node, contexte refusé) → l'appelant retombe sur l'aplat.
  const _motifs = {};
  function _motifCanvas(cle, fond, m) {
    if (Object.prototype.hasOwnProperty.call(_motifs, cle)) return _motifs[cle];
    let motif = null;
    try {
      if (typeof document !== "undefined" && document && typeof document.createElement === "function") {
        // Tuile carrée de côté pas·√2 : des rayures à 45° espacées de `pas` s'y raccordent bord à bord.
        const T = Math.round(m.pas * Math.SQRT2);
        const c = document.createElement("canvas");
        c.width = T; c.height = T;
        const g = c.getContext && c.getContext("2d");
        if (g && typeof g.createPattern === "function") {
          g.fillStyle = fond;
          g.fillRect(0, 0, T, T);
          g.globalAlpha = m.voileOpacite;
          g.fillStyle = m.voile;
          g.fillRect(0, 0, T, T);
          g.globalAlpha = 1;
          g.strokeStyle = m.raie;
          g.lineWidth = m.largeur;
          for (let k = 0; k <= 2; k++) {      // droites x + y = k·T (coins compris), tracées au-delà de la tuile
            g.beginPath();
            g.moveTo(k * T + T, -T);
            g.lineTo(k * T - 2 * T, 2 * T);
            g.stroke();
          }
          motif = g.createPattern(c, "repeat");
        }
      }
    } catch (e) { motif = null; }
    _motifs[cle] = motif;
    return motif;
  }

  // Objets imbriqués (`rayures`, `_motif`) copiés aussi : l'appelant peut muter le style sans toucher la table.
  function _copie(o) {
    const c = {};
    for (const k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      c[k] = (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) ? _copie(o[k]) : o[k];
    }
    return c;
  }

  // Style d'une entrée CUSTOM : polyline → lineColor ; polygon → fillColor + borderColor.
  // ⚠️ Un custom ressemble aux built-in de SA catégorie (structure : contour noir, 0.85 ;
  // front : épaisseur 10) — pas un gabarit générique unique.
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

  // ── API ──────────────────────────────────────────────────────────────────
  // null si clé inconnue et non custom : le consommateur garde son propre repli (pas de couleur
  // arbitraire qui masquerait un type non géré).
  function ktaResolveStyle(categorie, cle, opts) {
    if (!categorie || !cle) return null;
    const table = CANON[categorie];
    if (table && Object.prototype.hasOwnProperty.call(table, cle)) {
      const s = _copie(table[cle]);
      const plat = !!(opts && opts.flat);
      if (s._couleurDe) {
        // Couleur liée (zone jonction) : le trait résolu de la source, override de la source compris ; aucun
        // override propre (legendCustomization.js > COULEUR_LIEE écrit sur la source).
        const src = ktaResolveStyle(s._couleurDe[0], s._couleurDe[1], opts);
        if (src && src.color) { s.color = src.color; s.fillColor = src.color; }
        delete s._couleurDe;
        return s;
      }
      if (plat && s._flatFill) {
        s.fillColor   = s._flatFill;
        s.fillOpacity = (s._flatFillOpacity !== undefined) ? s._flatFillOpacity : s.fillOpacity;
      }
      // ⚠️ APRÈS l'aplat : la couleur choisie prime sur tout, motif compris.
      const fondCanon = s.fillColor;
      _appliquerOverride(categorie, cle, s);
      if (!plat && s._motif && s.fillColor === fondCanon) {
        const motif = _motifCanvas(cle, fondCanon, s._motif);
        if (motif) {
          s.fillColor = motif;
        } else {
          s.fillColor   = s._flatFill;
          s.fillOpacity = s._flatFillOpacity;
        }
      }
      delete s._flatFill; delete s._flatFillOpacity; delete s._motif;
      return s;
    }
    if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
      try {
        const e = window.LegendCustomization.findCustomEntry(cle);
        // Une entrée d'une AUTRE catégorie n'est pas un repli (zone custom rendue en tracé).
        if (e && (!e.category || e.category === categorie)) return _styleCustom(e, categorie);
      } catch(err) { /* module absent ou entrée illisible : repli au caller */ }
    }
    return null;
  }

  function ktaStyleBuiltins(categorie) {
    const t = CANON[categorie];
    return t ? Object.keys(t) : [];
  }

  // Couleur représentative unique (pastille, barre de stats, camembert, rapport) :
  // polygone → remplissage, ligne → trait ; toujours en aplat.
  function ktaSwatchColor(categorie, cle) {
    const s = ktaResolveStyle(categorie, cle, { flat: true });
    if (!s) return null;
    if (s.fillColor && !s.isPolyline) return s.fillColor;
    return s.color || null;
  }

  // Pastille HTML résolue en direct (trait ou carré bordé), à la place d'un émoji de couleur
  // qui ne suit pas la couleur choisie. `repli` rendu si le type est introuvable.
  // ⚠️ HTML : seulement dans un conteneur innerHTML. Les titres de popup échappent leur texte
  // (anti-XSS) : l'émoji y reste, limite connue.
  function ktaTypeSwatchHtml(categorie, cle, repli) {
    const s = ktaResolveStyle(categorie, cle, { flat: true });
    if (!s) return repli || "";
    const estLigne = (categorie === "traces") || !!s.isPolyline;
    if (estLigne && s.rayures && s.rayures.color) {
      return '<span style="display:inline-block;width:18px;height:4px;vertical-align:middle;border-radius:1px;' +
             'background:repeating-linear-gradient(90deg,' + s.color + ' 0 3px,' + s.rayures.color + ' 3px 6px);">' +
             '</span>';
    }
    if (estLigne) {
      return '<span style="display:inline-block;width:18px;height:4px;background:' + s.color +
             ';vertical-align:middle;border-radius:1px;"></span>';
    }
    return '<span style="display:inline-block;width:13px;height:13px;background:' + (s.fillColor || s.color) +
           ';border:2px solid ' + s.color + ';vertical-align:middle;border-radius:3px;"></span>';
  }

  // Libellé de formulaire (« 🟩 Principaux », émoji en dur dans le dico) : l'émoji de COULEUR de
  // tête devient la pastille résolue. Les symboles sémantiques (⛔, 🪜) restent ; sans émoji de
  // couleur en tête, le libellé est rendu tel quel.
  const _EMOJIS_COULEUR = ["🟩", "🟪", "🟨", "🟦", "🟥", "⬛", "🟡", "🟠", "🔵", "🟧"];
  function ktaLabelAvecPastille(categorie, cle, label) {
    const l = String(label == null ? "" : label);
    // Trait rayé (arc) : aucun émoji de couleur ne le dit, son libellé n'en porte pas ; la pastille est posée.
    const st = ktaResolveStyle(categorie, cle, { flat: true });
    if (st && st.rayures) return ktaTypeSwatchHtml(categorie, cle, "") + " " + l;
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
  // Pour les palettes délibérées : la règle « ce qu'une couleur repeint » n'est pas recopiée.
  window.ktaAppliquerCouleurChoisie = function(categorie, cle, style) {
    if (!style) return style;
    try { return _appliquerOverride(categorie, cle, style); }
    catch(e) { return style; }
  };
  // Pour le widget OSM du HOME, qui résout les couleurs choisies PAR PLAN hors état live.
  window.ktaAssombrir       = _assombrir;
  window.ktaSwatchColor       = ktaSwatchColor;
  window.ktaTypeSwatchHtml    = ktaTypeSwatchHtml;
  window.ktaLabelAvecPastille = ktaLabelAvecPastille;
  // ⚠️ Tests et diagnostic UNIQUEMENT : un module applicatif passe par ktaResolveStyle().
  window.__ktaStyleCanon  = CANON;

  console.log("[StyleResolver] Module chargé — window.ktaResolveStyle prêt");
})();
