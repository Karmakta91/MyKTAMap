/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// STRUCTURES POLYGONALES (piliers + murs)
// =========================
// 🆕 v1.9.3-A1.a (introduit branche Karma_dev après v1.9.2).
//
// Permet de tracer des structures fermées et remplies représentant les
// éléments physiques d'une carrière :
//   - "pilier-1" : pilier de 1ère masse
//   - "pilier-2" : pilier de 2e masse
//   - "mur"      : mur en pierre / béton
// ⚠️ Les couleurs NE SONT PLUS écrites ici — elles y étaient, et À L’ENVERS
// (pilier-1 annoncé orange alors qu’il est jaune #f4c542, pilier-2 jaune
// alors qu’il est orange #ff9933). Depuis la v1.76.1 la couleur n’est plus
// une propriété du type : l’utilisateur la choisit dans ≡ Légende. La SOURCE
// est `js/styleResolver.js` (table canonique), et `scripts/check-style-canon.js`
// refuse toute réintroduction d’une table locale.
//
// Côté technique, ce module est un clone adapté de js/zones.js — la donnée
// est très similaire (polygones avec sous-type + style associé), mais on
// stocke dans un FICHIER SÉPARÉ `data/<plan>/structure.json` (parallèle à
// zone.json) pour bien découpler les 2 notions côté user et faciliter la
// rétrocompat des KMZ anciens (= sans structure.json → array vide).
//
// 🩸 Collision pathfinder : ANNONCÉE en A1.b, JAMAIS IMPLÉMENTÉE — et cette
// ligne a coûté un aller-retour de diagnostic à qui l’a crue. État RÉEL : le
// Pathfinder construit son graphe UNIQUEMENT sur les `roads` (`getRoads` +
// `getAllEmbeddedRoads`) ; les structures n’y sont NI ARÊTES NI OBSTACLES,
// contrairement aux zones "inaccessible". Conséquence pratique : un relevé
// entièrement rangé en structures n’a pas « un itinéraire médiocre », il n’en
// a AUCUN — d’où `js/convertirObjet.js`, qui reclasse un vecteur en tracé.
// Le DATA reste prêt à recevoir la logique si elle est un jour écrite.
//
// Multi-niveau : supporté de la même façon que zones (champ `level` tagé
// au tracé si APP_CONFIG.multiLevel === true).
// =========================

window.modeStructure = null; // null | "pilier-1" | "pilier-2" | "mur" | "front-1" | "front-2"

// 🆕 v1.9.3-A1.b.2 : sous-types qui sont des POLYLINES (= suite de points
// ouverte, comme une road) au lieu de polygones fermés. Les fronts de
// taille représentent les LIMITES d'exploitation d'une couche — un tracé
// épais sans contour qui longe le bord du massif. Tous les autres types
// (pilier-1 / pilier-2 / mur) restent en polygones fermés.
const STRUCTURE_TYPES_POLYLINE = ["front-1", "front-2"];
function _isPolylineType(type) {
  if (STRUCTURE_TYPES_POLYLINE.indexOf(type) >= 0) return true;
  // 🆕 v1.16.0 step2-drawable : pour les types CUSTOM, lit la géométrie
  // déclarée dans LegendCustomization (polyline = front, polygon = pilier).
  if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
    const e = window.LegendCustomization.findCustomEntry(type);
    if (e && e.category === "structures") return e.geometry === "polyline";
  }
  return false;
}

// Résolution du style d'une structure — built-in ET types CUSTOM. Pour un
// custom, la geometrie declaree tranche : polyline → gabarit « front de taille »
// (epais, sans contour), polygon → gabarit « pilier/mur » (contour noir).
// 🎨 v1.76.0 : delegue integralement a window.ktaResolveStyle, qui applique le
// gabarit de la CATEGORIE demandee. Retourne un objet NEUF a chaque appel.
let _resolverManquantSignaleS = false;
function _resolveStructureStyle(type) {
  if (typeof window.ktaResolveStyle !== "function") {
    if (!_resolverManquantSignaleS) {
      _resolverManquantSignaleS = true;
      console.error("[Structures] window.ktaResolveStyle absent — styles indisponibles. Cache SW incoherent ?");
    }
    return null;
  }
  return window.ktaResolveStyle("structures", type);
}

let structuresData = [];
let currentStructure = null;
let structureLayers = [];      // polygones fermés (remplis)
let structurePreviewLayer = null;  // polyline pointillée pendant le tracé

// Tolérance en pixels pour détecter le re-clic sur le 1er point (en coords plan)
const STRUCT_CLOSE_TOLERANCE = 5;

// =========================
// STYLES
// =========================
// Chaque structure = fill couleur charte + stroke NOIR 3px (le stroke noir
// est la signature visuelle qui distingue les structures des zones).
// Internal note KARMA : "techniquement ce sont des zones", donc style proche
// des zones mais avec stroke #000 systématique + fill plus saturé
// (les structures représentent du physique solide, pas du marquage).
//
// 🆕 v1.9.3-A1.a-fix (KARMA "j'ai inversé les couleurs 1er masse / 2e masse") :
//   - 1ère masse → JAUNE (#f4c542, couleur charte MKM)
//   - 2e masse   → ORANGE (#ff9933)
// 🎨 v1.76.0 — Les 5 types built-in ne sont plus declares ici : leurs valeurs
// viennent de la table canonique de `js/styleResolver.js`.
// Rappels de DESIGN, qui ne se lisent pas dans les valeurs :
//   • Piliers/mur : stroke NOIR systematique — c'est la signature visuelle qui
//     distingue une structure d'une zone (KARMA : « techniquement ce sont des
//     zones »), avec un fill plus sature car une structure est du solide.
//     🔵 mur en bleu fonce (KARMA « rond bleu dans le menu pour pas confondre
//     avec l'icone eau »).
//   • Fronts de taille (v1.9.3-A1.b.2) : POLYLINES epaisses (weight 10, ~2x les
//     roads) sans contour, representant les limites d'exploitation d'une couche.
//     🔧 v1.10.1-hotfix2 (KARMA « si orange = 2e masse, le front de taille
//     orange et 2e masse ») : front-1 JAUNE comme pilier-1 (1ere masse),
//     front-2 ORANGE comme pilier-2 (2e masse). Elles etaient inversees « par
//     design » — c'etait une erreur : sur le terrain la coherence couleur/masse
//     prime (un trait orange = 2e masse, un trait jaune = 1ere).

// 🔍 v1.82.0 — LARGEUR DES FRONTS : UNE LARGEUR RÉELLE, PAS UN NOMBRE DE PIXELS.
//
// 🩸 Première version : des paliers fixes par zoom (10 / 7 / 5 / 3 / 2 px).
// Ils marchaient sur le plan de test et n'ont RIEN changé sur un vrai relevé —
// parce qu'ils ignoraient l'ÉCHELLE du plan. Or c'est elle qui décide de tout :
// un front de taille mesure 1 à 2 m sur le terrain, donc sur un plan à
// 1,4 px/m il doit faire 2 px, pas 10. Avec 17 000 galeries espacées de
// quelques mètres, un trait de 10 px comble tout l'intervalle : la carte
// devient un aplat, et aucun palier fixe ne peut le corriger.
//
// La largeur se calcule donc physiquement :
//     pixels écran = largeur réelle (m) × échelle (px/m) × 2^zoom
// En CRS.Simple, une unité plan vaut 2^zoom pixels écran — le facteur de zoom
// est donc exact, pas approché.
const FRONT_LARGEUR_M = 1.5;    // largeur physique typique d'un front de taille
const FRONT_MIN_PX    = 1;      // plancher : un front invisible serait pire
const FRONT_MAX_PX    = 14;     // plafond : au-delà c'est un pâté, pas un trait

// 🩸 v1.82.0 — LA LOI EST PARTAGÉE AVEC L'EXPORT, ELLE NE PEUT PAS ÊTRE
// RECOPIÉE. À l'écran le facteur d'agrandissement vaut 2^zoom ; à l'export
// PNG/PDF il vaut la résolution choisie (1 = natif, 2 = HD). C'est le MÊME
// nombre — des pixels rendus par pixel de plan — donc la même formule.
// L'export appelle ceci via `window.ktaLargeurFrontPourRatio`.
// 🩸 v1.83.0 — LE CŒUR DE LA LOI, en PIXELS PAR MÈTRE. Trois consommateurs,
// une seule formule :
//   • l'écran (mode plan) : px/m = APP_CONFIG.scale × 2^zoom
//   • l'export PNG/PDF    : px/m = APP_CONFIG.scale × résolution
//   • la Vue OSM          : px/m = 1 / résolution Web Mercator à cette latitude
//
// Les deux premiers passent par une échelle de PLAN ; la Vue OSM n'en a pas —
// elle travaille en lat/lng. C'est pourquoi la loi se formule ici sur la seule
// grandeur qu'ils partagent tous les trois : des pixels rendus par mètre de
// terrain. Chaque contexte sait calculer la sienne, aucun ne recopie la règle.
function _largeurFrontPourPxParMetre(pxParM) {
  if (!Number.isFinite(pxParM) || pxParM <= 0) return null;
  const px = FRONT_LARGEUR_M * pxParM;
  return Math.max(FRONT_MIN_PX, Math.min(FRONT_MAX_PX, Math.round(px * 10) / 10));
}
window.ktaLargeurFrontPourPxParMetre = _largeurFrontPourPxParMetre;

// Pixels par mètre d'une carte Leaflet en Web Mercator (la Vue OSM). La
// résolution y dépend de la LATITUDE autant que du zoom — un même zoom
// couvre 40 % de moins au nord de la France qu'à l'équateur. La calculer
// plutôt que de tabler sur des paliers de zoom est ce qui rend la largeur
// juste partout, et pas seulement là où on a réglé.
window.ktaPxParMetreOsm = function (map) {
  try {
    if (!map || typeof map.getZoom !== "function") return null;
    const lat = map.getCenter().lat;
    const mpp = 156543.03392804097 * Math.cos(lat * Math.PI / 180) /
                Math.pow(2, map.getZoom());
    return (mpp > 0) ? (1 / mpp) : null;
  } catch (e) { return null; }
};

function _largeurFrontPourRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) ratio = 1;
  // `APP_CONFIG.scale` est en px/m (cf. tracking.scale du plan-config).
  const scale = (window.APP_CONFIG && Number(window.APP_CONFIG.scale) > 0)
    ? Number(window.APP_CONFIG.scale) : null;
  // Pas d'échelle connue (plan sans calibrage) : on retombe sur les paliers
  // d'avant, qui valaient mieux que rien.
  if (!scale) {
    const z = Math.log(ratio) / Math.LN2;
    if (z >= 0)  return 10;
    if (z >= -1) return 7;
    if (z >= -2) return 5;
    if (z >= -3) return 3;
    return 2;
  }
  return _largeurFrontPourPxParMetre(scale * ratio);
}
window.ktaLargeurFrontPourRatio = _largeurFrontPourRatio;

// Un tracé de galerie est plus fin qu'un front de taille, mais il suit la
// même loi physique. Facteur unique, appliqué à l'écran comme à l'export.
const FRONT_FACTEUR_TRACE = 0.6;
window.ktaLargeurTracePourRatio = function (ratio) {
  return Math.max(1, Math.round(_largeurFrontPourRatio(ratio) * FRONT_FACTEUR_TRACE * 10) / 10);
};

function _largeurFrontPourZoom(z) {
  if (!Number.isFinite(z)) z = 0;
  return _largeurFrontPourRatio(Math.pow(2, z));
}

// 🩸 v1.82.0 — LA LARGEUR SE PILOTE PAR `options.weight`, PAS PAR LE CSS.
//
// La première version posait une classe et une variable CSS. Elle n'a jamais
// rien fait : la carte est rendue en CANVAS (`preferCanvas: true`, map.js:382),
// et l'option `className` de Leaflet est documentée « Only for SVG renderer ».
// Sur un canvas il n'y a aucun élément DOM à styler — le renderer peint avec
// `ctx.lineWidth = options.weight`, RELU À CHAQUE FRAME.
//
// C'est justement ce qui rend la correction bon marché : il suffit de muter
// `layer.options.weight` en place. Le redraw que le canvas déclenche déjà
// seul au zoom reprend la nouvelle valeur — aucun `setStyle()`, aucun redraw
// supplémentaire. 17 000 affectations de nombre coûtent moins d'une
// milliseconde ; ce qui aurait été intenable, c'était `setStyle()`, pas
// l'écriture.
//
// L'ORDRE DE GRANDEUR DU PROBLÈME, mesuré sur un relevé réel : à l'ouverture
// (zoom -2), un trait de 10 px couvre 28,9 m AU SOL, pour des galeries dont le
// segment médian fait 0,75 m. Chaque segment était peint comme un disque de
// 29 m de diamètre — d'où l'aplat en « chapelet », le cap arrondi dépassant la
// longueur du segment d'un facteur ~19.
function majLargeurFronts() {
  let z = 0;
  try {
    if (window.map && typeof window.map.getZoom === "function") z = window.map.getZoom();
  } catch (e) { return; }

  const wFront = _largeurFrontPourZoom(z);
  const wTrace = window.ktaLargeurTracePourRatio(Math.pow(2, z));

  // Les registres portent le layer sous la clé `polygon` — nom historique
  // conservé pour `_filtreNiveauSurPolygonData`, les polylignes y sont aussi
  // (cf. utils.js, commentaire du push).
  const appliquer = function (arr, largeur) {
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i]; if (!e) continue;
      const lay = e.polygon || e.polyline || e.layer;
      if (!lay || !lay.options) continue;
      // Les surfaces gardent leur trait : un pilier est lu par son
      // remplissage, pas par l'épaisseur de son contour.
      if (lay.options.fill === true || lay._latlngs && Array.isArray(lay._latlngs[0])) continue;
      if (e._wOrig === undefined) e._wOrig = lay.options.weight;
      lay.options.weight = largeur;
      n++;
    }
    return n;
  };

  appliquer(window._ktaDataStructurePolygons, wFront);
  appliquer(window._ktaDataPolylines, wTrace);

  // Structures de SESSION : pas de registre, on parcourt les layers rendus.
  try {
    if (Array.isArray(structureLayers)) {
      structureLayers.forEach(function (l) {
        if (l && l.options && l.options.fill !== true) l.options.weight = wFront;
      });
    }
  } catch (e) {}

  // Le canvas ne redessine pas de lui-même hors zoom/pan : on le force une
  // fois, sinon le changement n'apparaît qu'au prochain mouvement.
  try {
    const r = window.map && window.map._renderer;
    if (r && typeof r._redraw === "function") {
      // 🩸 v1.82.0 (bis) — `_redrawBounds` DOIT ÊTRE NEUTRALISÉ D'ABORD.
      // Lu dans `lib/leaflet/leaflet.js` (1.1.1) : `_redraw` clippe `_draw`
      // sur ces bornes et saute tout layer qui ne les croise pas. Si une
      // demande de redraw par layer est en attente (`_requestRedraw` les a
      // posées), notre repeinture ne couvre que ce petit rectangle et le
      // reste de la carte garde l'ancienne largeur. À null, `_clear` efface
      // tout le canvas et `_draw` repeint sans clip.
      r._redrawBounds = null;
      r._redraw();
    }
  } catch (e) {}
}
window.majLargeurFronts = majLargeurFronts;

// 🩸 v1.82.0 — LE BRANCHEMENT NE PEUT PAS DÉPENDRE DE `renderStructures`.
// Il y était posé au départ, et ça ne marchait que pour les structures de
// SESSION : un plan importé porte les siennes dans un DATALAYER, rendu par
// `utils.js > ajouterPointsDepuisJSON`. Sur ces plans — précisément ceux qui
// ont des milliers de fronts — `renderStructures` n'est jamais appelé, rien ne
// branche le recalcul, et la largeur reste au défaut de 10 px.
// D'où : un point d'entrée unique, appelable de partout et idempotent.
// 🩸 v1.82.0 (bis) — LE DRAPEAU ÉTAIT GLOBAL, IL DOIT ÊTRE SUR LA MAP.
// `window._ktaFrontZoomBound` survivait au changement de plan : la map est
// recréée, la nouvelle n'a donc PLUS de listener `zoomend`, mais le drapeau
// dit le contraire et le branchement est sauté. Résultat : la largeur ne se
// recalcule plus au dézoom, seulement quand un re-rendu passe par ici.
//
// C'est exactement le symptôme décrit par KARMA : « je dois masquer tous les
// niveaux, dézoomer, les réactiver, sinon ça ne prend pas ». Réactiver les
// niveaux déclenche `renderStructures`, qui rappelle cette fonction, qui
// recalcule à la volée — d'où un contournement qui marche et un dézoom seul
// qui ne fait rien.
//
// Le dépôt avait DÉJÀ payé cette leçon : `_bindMarkerViewportHook` porte son
// drapeau sur `map._mkmMarkerHookBound`, avec le commentaire « au plan switch
// → nouvelle map → nouveau bind ». Même convention ici.
window.brancherLargeurFronts = function () {
  if (!window.map) { majLargeurFronts(); return; }
  if (!window.map._ktaFrontZoomBound) {
    window.map.on("zoomend", majLargeurFronts);
    window.map._ktaFrontZoomBound = true;
  }
  majLargeurFronts();
};

const STRUCTURE_STYLE_PREVIEW = {
  weight:    3,
  opacity:   1,
  dashArray: "8 5"
};

// =========================
// CIBLE DE RENDU — calque "Mes annotations"
// =========================
// Les structures de session sont rendues dans window.layerEditor (= calque
// "Mes annotations"), comme les zones / points editor / roads de session.
// Toggle unique pour masquer/afficher toutes les annotations utilisateur.
function _structureTarget() {
  return window.layerEditor || window.map;
}

// =========================
// INIT
// =========================
function initStructures() {
  // Reset complet (changement de plan)
  structuresData = [];
  currentStructure = null;

  if (structureLayers && structureLayers.length) {
    structureLayers.forEach(function(l) {
      try { l.remove(); } catch(e) {}
    });
  }
  structureLayers = [];

  if (structurePreviewLayer) {
    try { structurePreviewLayer.remove(); } catch(e) {}
    structurePreviewLayer = null;
  }

  window.modeStructure = null;

  if (window.structuresInitialized) return;
  window.structuresInitialized = true;

  console.log("[Structures] init OK");

  window.map.on("click", function(e) {
    if (!window.modeStructure) return;

    const x = e.latlng.lng;
    const y = APP_CONFIG.imageHeight - e.latlng.lat;

    // 🆕 v1.11.0 Undo/Redo : snapshot before. Le label se construit
    // ensuite selon que c'est une nouvelle structure, un sommet de plus
    // ou une fermeture (cas polygon).
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("structures") : null;
    const _isNewStruct = !currentStructure;
    const _typeKey = window.modeStructure;
    // 🆕 v1.16.0 step2-drawable : pour les types CUSTOM, le label vient de
    // LegendCustomization (le libellé que l'utilisateur a saisi).
    function _resolveTypeLabel(k) {
      const _builtin = ["pilier-1", "pilier-2", "mur", "front-1", "front-2"];
      if (_builtin.indexOf(k) >= 0) return window.I18n.t("struct.label." + k);
      if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
        const e = window.LegendCustomization.findCustomEntry(k);
        if (e) return e.label || k;
      }
      return k;
    }
    const _typeLabel = _resolveTypeLabel(_typeKey);

    if (!currentStructure) {
      currentStructure = {
        type: window.modeStructure,
        points: []
      };
      // 🏗️ Multi-niveau : tag avec le niveau actif si la feature est ON
      // pour ce plan. Sinon → aucun champ level (rétrocompat).
      //
      // 🆕 v1.9.3-A1.a-fix (KARMA insight cataphile) : un pilier de 2e
      // masse représente structurellement la couche INFÉRIEURE visible
      // depuis la couche courante (la masse "en dessous"). Donc en mode
      // multi-niveau, on l'auto-tagge à `activeLevel - 1` au lieu de
      // `activeLevel`. Logique : KARMA dessine un pilier 2e masse depuis
      // le niveau 0 → la donnée pointe vers le niveau -1 (= la masse
      // inférieure réelle dans la carrière).
      // Les piliers 1ère masse et les murs restent au niveau actif (=
      // ce que l'utilisateur voit / dessine est aussi à ce niveau).
      if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
        const _activeLvl = window.APP_CONFIG.activeLevel || 0;
        // 🆕 v1.9.3-A1.b.2 : front-2 suit la même règle que pilier-2
        // (= niveau de la 2e masse = activeLevel - 1). Front-1 et autres
        // restent au niveau actif.
        if (currentStructure.type === "pilier-2" || currentStructure.type === "front-2") {
          currentStructure.level = _activeLvl - 1;
        } else {
          currentStructure.level = _activeLvl;
        }
      }
      if (window.KtaUid) window.KtaUid.ensure(currentStructure, "st");   // 🆔 v2.1.0
      structuresData.push(currentStructure);
    }

    // 🆕 v1.9.3-A1.b.2 : pour les types POLYLINE (fronts de taille), pas
    // de fermeture par re-clic — c'est une ligne ouverte. L'utilisateur
    // ferme via le bouton ✅ "Fermer la structure en cours" dans le menu.
    // Les types POLYGON (piliers + mur) gardent le comportement re-clic
    // proche du 1er point pour fermer.
    if (_isPolylineType(currentStructure.type)) {
      currentStructure.points.push({ x: x, y: y });
      if (window.KtaUid) window.KtaUid.touch(currentStructure);   // 🆔 v2.1.0
      renderStructures();
      if (window.HistoryManager && _historyBefore) {
        const lbl = _isNewStruct
          ? window.I18n.t("struct.undo.new", { type: _typeLabel })
          : window.I18n.t("struct.undo.vertex", { type: _typeLabel });
        window.HistoryManager.record(lbl, _historyBefore, "structures");
      }
      return;
    }

    // Si le clic est proche du 1er point ET qu'on a au moins 3 points → fermer
    if (currentStructure.points.length >= 3) {
      const p0 = currentStructure.points[0];
      const dx = x - p0.x;
      const dy = y - p0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= STRUCT_CLOSE_TOLERANCE) {
        fermerStructureEnCours();
        if (window.HistoryManager && _historyBefore) {
          window.HistoryManager.record(window.I18n.t("struct.undo.close", { type: _typeLabel }), _historyBefore, "structures");
        }
        // 🐛 fix : idem zones — fermeture au clic éteint l'outil (sinon bouton
        // reste actif + window.modeStructure armé → clic suivant incohérent).
        if (typeof window._fermerModeStructure === "function") window._fermerModeStructure();
        return;
      }
    }

    currentStructure.points.push({ x: x, y: y });
    if (window.KtaUid) window.KtaUid.touch(currentStructure);   // 🆔 v2.1.0
    renderStructures();
    if (window.HistoryManager && _historyBefore) {
      const lbl = _isNewStruct
        ? window.I18n.t("struct.undo.new", { type: _typeLabel })
        : window.I18n.t("struct.undo.vertex", { type: _typeLabel });
      window.HistoryManager.record(lbl, _historyBefore, "structures");
    }
  });
}

// =========================
// ACTIVER / DÉSACTIVER UN TYPE
// =========================
// 🚨 Q24 (audit ergonomie 13/09/2026) : retaper la pastille ou changer de
// type DÉTRUISAIT un pilier / mur en cours (≥ 3 sommets compris) sans un mot,
// alors que le même geste VALIDE un front. Désormais, pour toutes les
// structures : assez de points (front ≥ 2, polygone ≥ 3) → validée et
// historisée ; sinon abandonnée avec toast + entrée d'historique (⏪ la rend).
function _labelTypeStruct(k) {
  if (["pilier-1", "pilier-2", "mur", "front-1", "front-2"].indexOf(k) >= 0) {
    return window.I18n.t("struct.label." + k);
  }
  if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
    const e = window.LegendCustomization.findCustomEntry(k);
    if (e) return e.label || k;
  }
  return k;
}
function _resoudreStructureEnCours() {
  if (!currentStructure) return;
  const avant = window.HistoryManager ? window.HistoryManager.captureState("structures") : null;
  const label = _labelTypeStruct(currentStructure.type);
  const toast = function(k, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(window.I18n.t(k, { type: label }), type);
    }
  };
  const minPts = _isPolylineType(currentStructure.type) ? 2 : 3;
  if (currentStructure.points.length >= minPts) {
    // Assez de points → on la garde (= validation), on déréférence juste
    // currentStructure pour qu'elle devienne « fermée » au prochain rendu.
    currentStructure = null;
    if (window.HistoryManager && avant) {
      window.HistoryManager.record(window.I18n.t("struct.undo.close", { type: label }), avant, "structures");
    }
    toast("struct.toast.fermee", "info");
  } else {
    const idx = structuresData.indexOf(currentStructure);
    if (idx >= 0) structuresData.splice(idx, 1);
    currentStructure = null;
    if (window.HistoryManager && avant) {
      window.HistoryManager.record(window.I18n.t("struct.undo.abandon", { type: label }), avant, "structures");
    }
    toast("struct.toast.abandon", "warn");
  }
}
function toggleStructureMode(type) {
  if (window.modeStructure !== type && typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;
  // Changement de type ou désactivation du même type : la structure en cours
  // est validée si elle a assez de points, abandonnée sinon.
  if (currentStructure && window.modeStructure !== type) _resoudreStructureEnCours();

  if (window.modeStructure === type) {
    if (currentStructure) _resoudreStructureEnCours();
    window.modeStructure = null;
  } else {
    window.modeStructure = type;
    currentStructure = null;
  }

  // v1.16.0 step 1d : re-render TOUS les layers session + sync data layer
  // KMZ. Pourquoi tous : un mode actif doit retirer ghosts/popups des 3
  // types d'éléments pour ne pas intercepter les clics du tracé en cours.
  // Cf utils.js > _kta_syncAllNoteUiForModeChange.
  if (typeof window._kta_syncAllNoteUiForModeChange === "function") {
    window._kta_syncAllNoteUiForModeChange();
  } else {
    renderStructures();  // fallback si utils.js pas chargé
  }
  console.log("[Structures] Mode :", window.modeStructure);
}

// =========================
// FERMER LA STRUCTURE EN COURS
// =========================
function fermerStructureEnCours() {
  if (!currentStructure) return false;
  // 🆕 v1.9.3-A1.b.2 : minimum 2 points pour polyline (front), 3 pour
  // polygon (pilier / mur). Sans ça, KARMA n'aurait pas pu fermer un
  // front avec seulement 2 points (= ligne minimale valide).
  const minPoints = _isPolylineType(currentStructure.type) ? 2 : 3;
  if (currentStructure.points.length < minPoints) {
    return false;
  }
  // La fermeture est implicite : on ne stocke pas le point répété
  currentStructure = null;
  renderStructures();
  return true;
}

// =========================
// RENDU
// =========================
function renderStructures() {
  // 🔍 v1.82.0 — largeur des fronts recalculee au zoom. Le binding est pose
  // ICI, une seule fois, et non a chaque rendu : Leaflet dedoublonne les
  // handlers identiques, mais une closure fraiche a chaque appel empilerait.
  window.brancherLargeurFronts();
  // Vider les layers existants — .remove() détache où qu'ils soient
  structureLayers.forEach(function(l) { try { l.remove(); } catch(e) {} });
  structureLayers = [];

  if (structurePreviewLayer) {
    try { structurePreviewLayer.remove(); } catch(e) {}
    structurePreviewLayer = null;
  }

  // 🆕 v1.10.0-hotfix1 (KARMA "les fronts de taille doivent être au-dessus
  // des piliers, et respecter la logique de niveau") :
  //
  // Ordre Z FINAL (du plus en arrière au plus en avant-plan) :
  //   mur < pilier-2 < pilier-1 < front-2 < front-1
  //
  // Rationnel :
  //   - Mur en arrière (architecture statique de soutènement, fond)
  //   - Piliers de 2e masse au-dessus du mur (couche basse stratigraphie)
  //   - Piliers de 1ère masse au-dessus des 2e masse (couche haute, masquent
  //     les 2e masse là où ils se chevauchent dans la projection 2D vue du
  //     dessus — cohérent avec la stratigraphie cataphile)
  //   - Fronts de taille EN AVANT-PLAN (limites d'exploitation, plus
  //     visibles que l'architecture statique) — front-2 puis front-1 pour
  //     respecter la même logique stratigraphique (1ère masse devant la 2e)
  //
  // Avant ce hotfix : les fronts étaient EN ARRIÈRE des piliers, ce qui les
  // masquait visuellement → l'user ne voyait plus son avancement d'exploitation.
  //
  // 🏗️ Logique de NIVEAU : en mode multi-niveau (APP_CONFIG.multiLevel === true),
  // tri primaire par `level` ascendant (= niveau bas en arrière, niveau haut
  // au-dessus de la pile visuelle) avant le tri par type. Cohérent avec le
  // pattern des roads (cf. CLAUDE.md §31.5). En single-level, ce tri est
  // sans effet (tous level = 0).
  const ordreType = { "mur": 0, "pilier-2": 1, "pilier-1": 2, "front-2": 3, "front-1": 4 };
  const _multiLevelOnSort = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const structuresAffichage = [...structuresData].sort(function(a, b) {
    // Tri primaire : level ascendant (uniquement en M-LVL)
    if (_multiLevelOnSort) {
      const la = Number.isInteger(a.level) ? a.level : 0;
      const lb = Number.isInteger(b.level) ? b.level : 0;
      if (la !== lb) return la - lb;
    }
    // Tri secondaire : type (mur < pilier-2 < pilier-1 < front-2 < front-1)
    const oa = ordreType[a.type] !== undefined ? ordreType[a.type] : 99;
    const ob = ordreType[b.type] !== undefined ? ordreType[b.type] : 99;
    return oa - ob;
  });

  const target = _structureTarget();

  // 🏗️ Multi-niveau : pre-calcul du filtre. Si la feature est OFF →
  // toutes les structures visibles (rétrocompat). Si ON → seul
  // level ∈ visibleLevels. Les structures sans level sont traitées comme
  // level 0.
  const _multiLevelOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const _visibleLevels = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
                          ? window.APP_CONFIG.visibleLevels : [0];
  function _structurePasseFiltre(s) {
    if (!_multiLevelOn) return true;
    // Structure EN COURS DE TRACÉ : toujours visible peu importe le filtre
    // (sinon l'utilisateur ne voit pas la structure qu'il dessine si son
    // niveau actuel n'est pas dans visibleLevels). Symétrique avec zones.
    if (s === currentStructure) return true;
    const lvl = Number.isInteger(s.level) ? s.level : 0;
    return _visibleLevels.indexOf(lvl) >= 0;
  }

  // Pour chaque structure, déterminer si elle est fermée (= pas la structure en cours)
  structuresAffichage.forEach(function(s) {
    if (!s.points || s.points.length === 0) return;
    if (!_structurePasseFiltre(s)) return;

    // 🆕 v1.21.5 (KARMA "filtre par type de structure") : runtime type
    // filter via FilterPanel. currentStructure bypass (en cours de dessin).
    if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.structTypes
        && s !== currentStructure) {
      if (!window._ktaRuntimeFilters.structTypes.has(s.type)) return;
    }

    const latlngs = s.points.map(function(p) { return convertCoord(p.x, p.y); });
    // 🆕 v1.16.0 step2-drawable : résolution dynamique (custom support)
    const style = _resolveStructureStyle(s.type) || _resolveStructureStyle("mur");

    // 🆕 v1.9.3-A1.b.2 : différenciation polyline (fronts) vs polygon
    // (piliers + mur). Les fronts sont des lignes ouvertes épaisses
    // sans contour (= juste color, pas de stroke noir comme les piliers).
    const isPolyline = !!style.isPolyline;

    if (s === currentStructure) {
      // 🆕 v1.9.3-A1.b.2.5-fix (KARMA "si ce sont bien des tracés, ils
      // ne doivent pas être en pointillé pendant le dessin, on garde le
      // même comportement écran que une road") :
      // - Polyline (front) en cours : ligne CONTINUE déjà au style final
      //   (color, weight, opacity resolus par le styleResolver), pas de dashArray.
      //   Comportement calqué sur road.js qui rend directement la road
      //   en cours dans son style final.
      // - Polygon (pilier/mur) en cours : preview pointillé (dashArray
      //   "8 5") pour bien signaler que ce n'est pas encore fermé.
      //
      // 🐛 v1.16.0 step 1d (KARMA "je ne peux plus tracer aucune structure ;
      // popup s'ouvre au bout du trait pendant le tracé") : la structure
      // EN COURS DE TRACÉ doit RESTER SANS ghost ni popup, sinon (a) la
      // ghost intercepte le clic suivant pour fermer/continuer le tracé
      // (bubblingMouseEvents:false), et (b) le popup s'ouvre au point
      // qu'on vient juste de poser. Le popup note s'éditera APRÈS
      // validation (= fermeture) du tracé, quand `s !== currentStructure`.
      // Bug introduit en step1 par une fusion ratée de `} else if` qui
      // avait collé le rendu "fermé" + ghost + popup dans la branche
      // currentStructure au lieu de la branche else.
      if (s.points.length >= 1) {
        if (isPolyline) {
          // Front en cours : style final solide, pas de pointillé
          structurePreviewLayer = L.polyline(latlngs, {
            color:    style.color,
            weight:   style.weight,
            opacity:  style.opacity,
            lineCap:  "round",
            lineJoin: "round",
            interactive: false
          }).addTo(target);
        } else {
          // Polygon en cours : preview pointillé classique
          const previewStyle = Object.assign({}, STRUCTURE_STYLE_PREVIEW, {
            color: style.fillColor
          });
          structurePreviewLayer = L.polyline(latlngs, previewStyle).addTo(target);

          // Petit cercle sur le 1er point pour indiquer la fermeture possible.
          // À partir de 3 points (= polygone fermable par re-clic sur p0).
          if (s.points.length >= 3) {
            const p0 = s.points[0];
            const marker = L.circleMarker(convertCoord(p0.x, p0.y), {
              radius:      6,
              color:       style.color,         // noir, comme stroke
              fillColor:   style.fillColor,
              fillOpacity: 0.6,
              weight:      2,
              interactive: false
            }).addTo(target);
            structureLayers.push(marker);
          }
        }
      }
    } else {
      // Structure FERMÉE (≠ currentStructure) → rendu final + popup note.
      let layer;
      if (isPolyline) {
        // Front fermé → polyline solide épaisse colorée, pas de stroke
        // contour (style.color = la couleur du polyline lui-même).
        // Cohérent avec la demande KARMA "épais orange/jaune sans contour".
        layer = L.polyline(latlngs, {
          color:     style.color,
          weight:    style.weight,
          opacity:   style.opacity,
          lineCap:   "round",
          lineJoin:  "round",
          // 🔍 v1.82.0 — LARGEUR ADAPTÉE AU ZOOM (retour KARMA : « vu que nos
          // vecteurs sont des fronts de taille, quand on dézoome la largeur
          // des traits fait qu'on voit une grosse tache »).
          // `weight` est en pixels ÉCRAN : il reste à 10 px quel que soit le
          // zoom, donc en dézoomant les traits se rapprochent sans maigrir et
          // finissent par fusionner. Sur un plan importé qui porte 10 000
          // fronts, ça devient un aplat.
          // La largeur est donc recalculée au zoomend et écrite dans
          // `options.weight`, que le renderer canvas relit à chaque frame :
          // une affectation de nombre par objet, au lieu d'un `setStyle` —
          // ce qui serait intenable à ce volume.
        }).addTo(target);
      } else {
        // Structure fermée → polygone rempli avec stroke noir.
        layer = L.polygon(latlngs, style).addTo(target);
      }
      structureLayers.push(layer);

      // 📝 v1.16.0 step 1 — popup note au clic sur toutes les structures
      //
      // v1.16.0 step 1c — pour les fronts (polylines), on ajoute une ghost
      // transparente plus épaisse (idem pattern road.js) pour ergonomie au
      // clic. Pour les polygones (piliers/murs), l'aire du polygone capte
      // déjà bien les clics donc pas de ghost nécessaire.
      //
      // 🆕 v1.16.0 step 1d : on n'installe ghost + popup QUE si aucun mode
      // tracé/zone/structure n'est actif. Sinon la ghost intercepterait
      // les clics map destinés à ajouter des points au tracé en cours.
      // À la désactivation du mode, toggleStructureMode → renderStructures
      // → ghosts ré-installés. Idem pattern road.js / zones.js (cf utils.js).
      if (typeof window.attacherNotePopup === "function" &&
          window._aucunModeEditionActif()) {
        const _structRef = s;
        // 🐛 v1.16.0 step2-drawable-fix2 (KARMA "le nom des structure est
        // un cust-mpj... pas le nom que j'ai donné") : le titre de la popup
        // doit être le libellé défini par l'utilisateur (LC.findCustomEntry
        // pour les customs, LC.getLabel pour les built-in — ce qui permet
        // aussi de respecter un éventuel rename via ✏️ Modifier sur un
        // built-in). Fallback hardcodé si LC indisponible.
        const _structEmojis = {
          "pilier-1": "🟡", "pilier-2": "🟠", "mur": "🔵",
          "front-1":  "🟨", "front-2":  "🟧"
        };
        function _structPopupTitle(t) {
          if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
            // Custom : ✨ + label utilisateur
            if (String(t).startsWith("cust-")) {
              const e = window.LegendCustomization.findCustomEntry(t);
              if (e) return "✨ " + e.label;
            }
            // Built-in : emoji + label (possiblement renommé via LC)
            if (_structEmojis[t]) {
              return _structEmojis[t] + " " + window.LegendCustomization.getLabel("structures", t);
            }
          }
          // Fallback legacy
          if (_structEmojis[t]) return window.I18n.t("struct.popup." + t);
          return window.I18n.t("struct.popup.fallback", { type: t });
        }
        let cibleClic = layer;
        if (isPolyline) {
          // Ghost transparente épaisse par-dessus le front visible
          const ghostStruct = L.polyline(latlngs, {
            weight:               Math.max((style.weight || 10) + 12, 22),
            opacity:              0,
            interactive:          true,
            bubblingMouseEvents:  false
          }).addTo(target);
          structureLayers.push(ghostStruct);
          cibleClic = ghostStruct;
        }
        window.attacherNotePopup(
          cibleClic,
          function() { return _structRef.description; },
          function(v) { _structRef.description = v; if (window.KtaUid) window.KtaUid.touch(_structRef); },
          _structPopupTitle(s.type),
          // 🔄 v1.82.0 — reclassement depuis la popup (cf. convertirObjet.js).
          { convertir: { famille: "structures", obj: _structRef } }
        );
      }
    }
  });
}

// =========================
// RESET COMPLET
// =========================
function resetStructures() {
  structuresData = [];
  currentStructure = null;
  window.modeStructure = null;

  structureLayers.forEach(function(l) { try { l.remove(); } catch(e) {} });
  structureLayers = [];

  if (structurePreviewLayer) {
    try { structurePreviewLayer.remove(); } catch(e) {}
    structurePreviewLayer = null;
  }
}

// =========================
// SUPPRIMER LA DERNIÈRE STRUCTURE FERMÉE
// =========================
function removeLastStructure() {
  // 🆕 v1.9.4 (KARMA "supprimer d'un coup la structure en cours") :
  // priorité à la structure EN COURS si elle existe, sinon la dernière
  // fermée. Cohérent avec removeLastRoad et removeLastZone (depuis v1.9.4).
  // 🆕 v1.11.0 Undo/Redo : snapshot before (couvre les 2 branches).
  const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("structures") : null;
  if (currentStructure) {
    const idx = structuresData.indexOf(currentStructure);
    if (idx >= 0) structuresData.splice(idx, 1);
    currentStructure = null;
    renderStructures();
    if (window.HistoryManager && _historyBefore) {
      window.HistoryManager.record(window.I18n.t("struct.undo.removeCurrent"), _historyBefore, "structures");
    }
    return true;
  }
  // Pas de structure en cours → supprime la dernière fermée
  if (structuresData.length === 0) return false;
  const removed = structuresData.pop();
  renderStructures();
  if (window.HistoryManager && _historyBefore) {
    const typeLabel = removed && removed.type ? removed.type : window.I18n.t("struct.undo.fallback");
    window.HistoryManager.record(window.I18n.t("struct.undo.removeLast", { type: typeLabel }), _historyBefore, "structures");
  }
  return true;
}

// =========================
// SUPPRIMER LE DERNIER POINT DE LA STRUCTURE EN COURS
// =========================
function removeLastStructurePoint() {
  if (!currentStructure || currentStructure.points.length === 0) {
    // Pas de structure en cours : retirer le dernier point de la dernière fermée
    if (structuresData.length === 0) return false;
    const last = structuresData[structuresData.length - 1];
    if (!last.points || last.points.length === 0) return false;
    last.points.pop();
    if (window.KtaUid) window.KtaUid.touch(last);   // 🆔 v2.1.0
    // 🆕 v1.9.3-A1.b.2 : minimum dépend du type (2 pour polyline, 3 pour polygon)
    const minPoints = _isPolylineType(last.type) ? 2 : 3;
    if (last.points.length < minPoints) {
      // Plus assez de points → supprimer la structure entière
      structuresData.pop();
    }
    renderStructures();
    return true;
  }

  currentStructure.points.pop();
  if (window.KtaUid) window.KtaUid.touch(currentStructure);   // 🆔 v2.1.0
  if (currentStructure.points.length === 0) {
    const idx = structuresData.indexOf(currentStructure);
    if (idx >= 0) structuresData.splice(idx, 1);
    currentStructure = null;
  }
  renderStructures();
  return true;
}

// =========================
// EXPORT / IMPORT
// =========================
window.getStructures = function() {
  return structuresData;
};

window.setStructures = function(structures) {
  structuresData = structures || [];
  // 🆔 v2.1.0 — filet : toute structure qui entre ressort avec un uid (cf ktaUid.js).
  if (window.KtaUid) window.KtaUid.ensureAll(structuresData, "st");
  currentStructure = null;
  renderStructures();
};

// Lecture seule : retourne la structure en cours de tracé (ou null).
// Utilisé par interface.js pour fermer le mode quand une suppression vient
// d'effacer la structure en cours (cohérent avec getCurrentZone).
window.getCurrentStructure = function() {
  return currentStructure || null;
};

// 🆕 v1.90.17 — Parité avec le tracé : préservation de currentStructure à
// travers undo/redo (cf road.js getCurrentRoadIndex/setCurrentRoadByIndex).
// Sans ça, _applyState remettait modeStructure à null au moindre Ctrl+Z
// (resetStructures le wipe, setStructures remet currentStructure = null) →
// outil mort dès le 1er undo, continuation cassée, pastille bloquée.
// HistoryManager capture l'index de la structure en cours et le restaure.
window.getCurrentStructureIndex = function() {
  if (!currentStructure) return -1;
  return structuresData.indexOf(currentStructure);
};
window.setCurrentStructureByIndex = function(idx) {
  if (typeof idx === "number" && idx >= 0 && idx < structuresData.length) {
    currentStructure = structuresData[idx];
  } else {
    currentStructure = null;
  }
};

// =========================
// EXPORT GLOBAL
// =========================
// 🆕 v1.9.4 : helper exposé pour que activerModeSuppressionStructureClic
// (interface.js) sache quelle géométrie tester (polyline pour fronts,
// polygon pour piliers + murs).
window.isStructurePolylineType       = _isPolylineType;
window.initStructures                = initStructures;
window.toggleStructureMode           = toggleStructureMode;
window.fermerStructureEnCours        = fermerStructureEnCours;
window.resetStructures               = resetStructures;
window.removeLastStructure           = removeLastStructure;
window.removeLastStructurePoint      = removeLastStructurePoint;
window.renderStructures              = renderStructures;
