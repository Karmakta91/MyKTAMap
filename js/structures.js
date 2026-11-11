/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// structures.js — structures de session : piliers (1re / 2e masse) et murs en polygones remplis, fronts de
// taille, murs en ligne et arcs de soutènement en polylignes ; types custom de la légende. Clone adapté de
// zones.js, stocké à part (`structure.json`). Multi-niveau : champ `level` posé au tracé.
// Expose : initStructures, toggleStructureMode, fermerStructureEnCours, renderStructures, resetStructures,
//   removeLastStructure(Point), get/setStructures, getCurrentStructure(Index), setCurrentStructureByIndex,
//   isStructurePolylineType, KTA_STRUCTURE_TYPES_BUILTIN, ktaPolylineStructure, ktaPeindreRayures, ktaArcsAuDessus,
//   ktaLargeurRayePourRatio, majLargeurFronts, brancherLargeurFronts,
//   ktaLargeur{FrontPourRatio,FrontPourPxParMetre,TracePourRatio}, ktaPxParMetreOsm, ktaStructuresAuDessus,
//   ktaMursSousPiliers / ktaOrdonnerMursCarte (un mur sous les piliers et fronts de son niveau, carte et exports).
// ⚠️ Aucune couleur ici : la source est js/styleResolver.js (l'utilisateur choisit dans ≡ Légende).
// 🩸 Le Pathfinder ne fait aucune arête d'une structure (graphe sur les `roads` seulement) : un relevé tout en
// structures n'a AUCUN itinéraire → js/convertirObjet.js reclasse un vecteur en tracé. Seul `mur-ligne` y
// joue un rôle, d'obstacle (pathfinder.js > _collecterMursLigne) ; piliers, mur polygone, fronts et arcs, aucun.
// Garde-fou : scripts/check-style-canon.js, scripts/check-api-surface.js, scripts/check-filets-donnees.js

window.modeStructure = null; // null | "pilier-1" | "pilier-2" | "mur" | "mur-ligne" | "front-1" | "front-2" | "arc"

// Fronts de taille (limites d'exploitation d'une couche), mur en ligne (mur levé en trait, cas d'un import SIG)
// et arc de soutènement (posé d'une paroi à l'autre, en travers de la galerie) = POLYLINES ouvertes ; les autres =
// polygones fermés.
const STRUCTURE_TYPES_POLYLINE = ["mur-ligne", "front-1", "front-2", "arc"];
// Types intégrés, dans l'ordre des listes (légende, exports, filtres).
const STRUCTURE_TYPES_BUILTIN = ["pilier-1", "pilier-2", "mur", "mur-ligne", "front-1", "front-2", "arc"];
window.KTA_STRUCTURE_TYPES_BUILTIN = STRUCTURE_TYPES_BUILTIN;
function _isPolylineType(type) {
  if (STRUCTURE_TYPES_POLYLINE.indexOf(type) >= 0) return true;
  // Type custom : géométrie déclarée dans LegendCustomization.
  if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
    const e = window.LegendCustomization.findCustomEntry(type);
    if (e && e.category === "structures") return e.geometry === "polyline";
  }
  return false;
}

// Style d'une structure (built-in ou custom) délégué à window.ktaResolveStyle : la géométrie choisit le
// gabarit (polyline → front épais sans contour, polygon → pilier/mur à contour noir). Objet NEUF à chaque appel.
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

// Re-clic sur le 1er point pour fermer : utils.js > ktaToleranceFermeture (mètres du plan, plancher en px d'écran).

// ── Styles (décisions produit, valeurs dans styleResolver.js) ──────────────
//   • Piliers / mur : contour NOIR systématique (ce qui distingue une structure d'une zone), remplissage plus
//     saturé (du solide). Mur bleu foncé, pour ne pas le confondre avec l'icône eau.
//   • Fronts : polylignes épaisses sans contour. front-1 jaune comme pilier-1, front-2 orange comme
//     pilier-2 : sur le terrain, la cohérence couleur / masse prime. Mur en ligne : le bleu du mur.

// ── Largeur des fronts : une largeur RÉELLE, pas un nombre de pixels ──────────────
// 🩸 Des paliers fixes par zoom ignorent l'ÉCHELLE du plan : un front mesure 1 à 2 m, donc 2 px à 1,4 px/m ;
// à 10 px, des milliers de galeries espacées de quelques mètres font un aplat.
//     pixels écran = largeur réelle (m) × échelle (px/m) × 2^zoom   (exact en CRS.Simple)
const FRONT_LARGEUR_M = 0.8;    // largeur affichée d'un front (trait de plan), pas son épaisseur au sol
const FRONT_MIN_PX    = 1;      // plancher : un front invisible serait pire
const FRONT_MAX_PX    = 14;     // plafond : au-delà c'est un pâté, pas un trait

// 🩸 Une seule loi, jamais recopiée, en PIXELS RENDUS PAR MÈTRE de terrain :
//   • écran (mode plan) : px/m = APP_CONFIG.scale × 2^zoom
//   • export PNG/PDF    : px/m = APP_CONFIG.scale × résolution  (via window.ktaLargeurFrontPourRatio)
//   • Vue OSM           : px/m = 1 / résolution Web Mercator à cette latitude (pas d'échelle de plan)
function _largeurFrontPourPxParMetre(pxParM) {
  if (!Number.isFinite(pxParM) || pxParM <= 0) return null;
  const px = FRONT_LARGEUR_M * pxParM;
  return Math.max(FRONT_MIN_PX, Math.min(FRONT_MAX_PX, Math.round(px * 10) / 10));
}
window.ktaLargeurFrontPourPxParMetre = _largeurFrontPourPxParMetre;

// Pixels par mètre en Web Mercator (Vue OSM) : dépend de la LATITUDE autant que du zoom.
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
  // Plan sans calibrage : paliers fixes par zoom, faute de mieux.
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

// Tracé de galerie : même loi, plus fin ; facteur unique, écran comme export.
const FRONT_FACTEUR_TRACE = 0.6;
// Trait rayé (arc de soutènement) : plus fin que le front et le mur en ligne, qu'on ne doit pas confondre avec lui.
const FACTEUR_RAYE = 0.6;
// Plancher de 2 px (décision produit) : à 1 px les rayures ne se voient plus ; l'arc peut alors paraître plus épais
// que le mur en ligne au dézoom.
window.ktaLargeurRayePourRatio = function (ratio) {
  return Math.max(2, Math.round(_largeurFrontPourRatio(ratio) * FACTEUR_RAYE * 10) / 10);
};

// ── Trait rayé (style à `rayures`, styleResolver.js) ──────────────
// Une SEULE couche Leaflet : après son trait, la polyligne repeint le même chemin en segments courts de la couleur
// des rayures. Une seconde couche doublerait tout ce qui manipule la couche d'une structure (filtres de niveau et de
// type par setStyle, registre, ULTRA, ordre des murs, clic).
// 🩸 Canvas seulement (la carte est en preferCanvas) : le chemin construit par `_updatePoly` reste le chemin courant
// du contexte après son `stroke`, on le repeint tel quel. Sous un renderer SVG, le trait reste uni.
// Segments proportionnels à l'épaisseur (lue à chaque dessin : majLargeurFronts la change au zoom), opacité de la
// couche (un filtre qui la passe à 0 cache aussi les rayures).
function _peindreRayures(couche) {
  const r = couche._renderer, op = couche.options || {};
  if (!op.ktaRayures || !r || !r._ctx || !r._drawing || !couche._parts || !couche._parts.length) return;
  if (!op.stroke) return;
  window.ktaPeindreRayures(r._ctx, op.ktaRayures, op.weight, op.opacity);
}
// Rayures sur le chemin COURANT d'un contexte 2D déjà tracé (carte, exports PNG/PDF) : une seule loi de dessin.
window.ktaPeindreRayures = function (ctx, couleur, largeur, opacite) {
  const w = Number(largeur), a = (opacite === undefined || opacite === null) ? 1 : Number(opacite);
  if (!ctx || !couleur || !(w > 0) || !(a > 0)) return;
  ctx.save();
  // Tirets d'au moins 3 px, vides d'au moins 3 px : sur un trait de 2 px, un tiret plus court se fond dans le bleu.
  if (ctx.setLineDash) ctx.setLineDash([Math.max(3, w * 0.8), Math.max(3, w * 1.4)]);
  ctx.globalAlpha = a;
  ctx.lineWidth = w;
  ctx.strokeStyle = couleur;
  ctx.lineCap = "butt";
  ctx.stroke();
  ctx.restore();
};
let _ClassePolylineRayee = null;
// Polyligne d'une structure : `style` résolu (ktaResolveStyle) ; `opts` = options Leaflet ajoutées. Un style à
// `rayures` donne la polyligne rayée, sinon un L.polyline ordinaire.
window.ktaPolylineStructure = function (latlngs, style, opts) {
  const o = Object.assign({}, opts || {});
  if (style && style.rayures && style.rayures.color) {
    if (!_ClassePolylineRayee) {
      _ClassePolylineRayee = L.Polyline.extend({
        _updatePath: function () {
          L.Polyline.prototype._updatePath.call(this);
          _peindreRayures(this);
        }
      });
    }
    o.ktaRayures = style.rayures.color;
    return new _ClassePolylineRayee(latlngs, o);
  }
  return L.polyline(latlngs, o);
};
window.ktaLargeurTracePourRatio = function (ratio) {
  return Math.max(1, Math.round(_largeurFrontPourRatio(ratio) * FRONT_FACTEUR_TRACE * 10) / 10);
};

function _largeurFrontPourZoom(z) {
  if (!Number.isFinite(z)) z = 0;
  return _largeurFrontPourRatio(Math.pow(2, z));
}

// 🩸 La largeur se pilote par `options.weight`, PAS par le CSS : la carte est en CANVAS (map.js >
// preferCanvas), où `className` ne fait rien ; le renderer relit `options.weight` à chaque frame. Muter le
// nombre en place suffit : des milliers d'affectations coûtent moins d'1 ms, là où `setStyle()` serait
// intenable à ce volume.
function majLargeurFronts() {
  let z = 0;
  try {
    if (window.map && typeof window.map.getZoom === "function") z = window.map.getZoom();
  } catch (e) { return; }

  const wFront = _largeurFrontPourZoom(z);
  const wTrace = window.ktaLargeurTracePourRatio(Math.pow(2, z));
  const wRaye = window.ktaLargeurRayePourRatio(Math.pow(2, z));
  // Contour d'une surface (pilier, mur) : le quart d'un front, jamais plus que son épaisseur d'origine, plancher
  // 0,5 px. Un contour fixe de 3 px recouvre tout le pilier au dézoom ; trop fin, il disparaîtrait.
  const bord = function (wOrig) {
    const w0 = Number.isFinite(wOrig) ? wOrig : 3;
    return Math.max(0.5, Math.min(w0, wFront / 4));
  };

  // ⚠️ Les registres rangent aussi les polylignes sous la clé `polygon` (lue par _filtreNiveauSurPolygonData).
  const appliquer = function (arr, largeur) {
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i]; if (!e) continue;
      const lay = e.polygon || e.polyline || e.layer;
      if (!lay || !lay.options) continue;
      if (e._wOrig === undefined) e._wOrig = lay.options.weight;
      // Une surface (pilier, mur) garde son remplissage ; seul son contour s'affine au dézoom.
      if (lay.options.fill === true || lay._latlngs && Array.isArray(lay._latlngs[0])) {
        lay.options.weight = bord(e._wOrig);
      } else {
        lay.options.weight = lay.options.ktaRayures ? wRaye : largeur;
      }
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
        if (!l || !l.options) return;
        if (l.options.fill !== true) { l.options.weight = l.options.ktaRayures ? wRaye : wFront; return; }
        if (l._ktaWOrig === undefined) l._ktaWOrig = l.options.weight;
        l.options.weight = bord(l._ktaWOrig);
      });
    }
  } catch (e) {}

  // Hors zoom/pan, le canvas ne se redessine pas seul : une repeinture forcée.
  try {
    const r = window.map && window.map._renderer;
    if (r && typeof r._redraw === "function") {
      // 🩸 `_redrawBounds` à null D'ABORD : `_redraw` clippe sur ces bornes (posées par un `_requestRedraw` en
      // attente) et le reste de la carte garderait l'ancienne largeur. À null, tout le canvas est repeint.
      r._redrawBounds = null;
      r._redraw();
    }
  } catch (e) {}
}
window.majLargeurFronts = majLargeurFronts;

// Point d'entrée unique et idempotent du recalcul au zoom.
// 🩸 Pas seulement depuis renderStructures : un plan importé rend ses fronts par un datalayer
// (utils.js > ajouterPointsDepuisJSON), où renderStructures n'est jamais appelé.
// 🩸 Le drapeau vit sur la MAP, pas sur window : la map est recréée au changement de plan, un drapeau global
// sauterait le branchement (largeur figée au dézoom). Même convention que map._mkmMarkerHookBound.
window.brancherLargeurFronts = function () {
  if (!window.map) { majLargeurFronts(); return; }
  if (!window.map._ktaFrontZoomBound) {
    window.map.on("zoomend", majLargeurFronts);
    window.map._ktaFrontZoomBound = true;
  }
  // Mêmes points d'entrée (session et calques) : la règle des murs se branche ici, avant toute couche.
  _brancherOrdreMurs();
  majLargeurFronts();
};

// ── Règle « mur sous pilier et front » (décision produit) ──────────────
// Un mur (polygone `mur`, trait `mur-ligne`) se dessine SOUS les piliers et fronts de SON niveau, quelle que soit
// son origine (session, calque) et l'ordre de chargement des calques. Rien d'autre ne bouge : un mur arrivé trop
// tard descend juste sous le premier pilier ou front de son niveau, pas sous les zones ni les tracés.
// ⚠️ Un type personnalisé n'a pas de rôle : sa légende ne dit pas qu'il est un mur, il garde sa place.
// Écran : l'ordre du renderer canvas (unique, `map._renderer`) ; exports : la même fonction sur leur liste.
const ROLE_STRUCTURE = {
  "mur": "mur", "mur-ligne": "mur",
  "pilier-1": "dessus", "pilier-2": "dessus", "front-1": "dessus", "front-2": "dessus"
};

// Liste de dessin (de l'arrière à l'avant) → liste où chaque mur venu APRÈS le premier pilier ou front de son
// niveau passe juste avant lui, dans son ordre relatif. `structDe(item)` rend { type, level } ou null (objet qui
// n'est pas une structure). `parNiveau` : défaut = plan multi-niveau ; hors multi-niveau, un seul groupe.
// ⚠️ Rend la MÊME liste si rien ne bouge : les appelants testent l'identité pour éviter un redessin.
function ktaMursSousPiliers(liste, structDe, parNiveau) {
  if (!Array.isArray(liste) || liste.length < 2) return liste;
  if (parNiveau === undefined) parNiveau = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const roles = new Array(liste.length);
  const niveaux = new Array(liste.length);
  const premier = new Map();   // niveau → index du premier pilier ou front
  for (let i = 0; i < liste.length; i++) {
    const s = structDe(liste[i]);
    const role = s ? ROLE_STRUCTURE[s.type] : undefined;
    if (!role) continue;
    const niv = (parNiveau && Number.isInteger(s.level)) ? s.level : 0;
    roles[i] = role; niveaux[i] = niv;
    if (role === "dessus" && !premier.has(niv)) premier.set(niv, i);
  }
  const avant = new Map();     // index d'un premier pilier/front → murs à poser juste avant lui
  for (let i = 0; i < liste.length; i++) {
    if (roles[i] !== "mur" || !premier.has(niveaux[i])) continue;
    const p = premier.get(niveaux[i]);
    if (p > i) continue;
    if (!avant.has(p)) avant.set(p, []);
    avant.get(p).push(i);
  }
  if (avant.size === 0) return liste;
  const deplaces = new Set();
  avant.forEach(function (idx) { idx.forEach(function (i) { deplaces.add(i); }); });
  const out = [];
  for (let i = 0; i < liste.length; i++) {
    if (avant.has(i)) avant.get(i).forEach(function (j) { out.push(liste[j]); });
    if (!deplaces.has(i)) out.push(liste[i]);
  }
  return out;
}
window.ktaMursSousPiliers = ktaMursSousPiliers;

// Applique la règle à l'ordre du renderer canvas de la carte. Chaque couche de structure porte
// `options.ktaStructType` / `options.ktaStructNiveau` (posés à la création, AVANT l'ajout : `layeradd` les lit).
// 🩸 L'ordre du canvas Leaflet est une liste chaînée (`_drawFirst` … `_drawLast`) ; réafficher un calque remet
// ses couches au BOUT : l'écoute de `layeradd` rattrape aussi les bascules de calque, pas seulement le 1er rendu.
function _ordonnerMursCarte() {
  _ordreMursPrevu = false;
  const r = window.map && window.map._renderer;
  if (!r || !r._map || !r._drawFirst) return;
  const ordres = [];
  for (let o = r._drawFirst; o; o = o.next) ordres.push(o);
  const tries = ktaArcsAuDessus(ktaMursSousPiliers(ordres, function (o) {
    const op = o.layer && o.layer.options;
    return (op && op.ktaStructType) ? { type: op.ktaStructType, level: op.ktaStructNiveau } : null;
  }), function (o) { return _estCoucheArc(o.layer); });
  _arcsSurCarte = tries.some(function (o) { return _estCoucheArc(o.layer); });
  if (tries === ordres) return;
  for (let i = 0; i < tries.length; i++) {
    tries[i].prev = i > 0 ? tries[i - 1] : null;
    tries[i].next = i < tries.length - 1 ? tries[i + 1] : null;
  }
  r._drawFirst = tries[0];
  r._drawLast = tries[tries.length - 1];
  // Repeinture complète tout de suite : un redessin en attente ne couvrirait que les bornes des couches ajoutées.
  if (r._redrawRequest) { L.Util.cancelAnimFrame(r._redrawRequest); r._redrawRequest = null; }
  r._redrawBounds = null;
  try { r._redraw(); } catch (e) { console.warn("[Structures] ordre des murs :", e); }
}
window.ktaOrdonnerMursCarte = _ordonnerMursCarte;

// ── Règle « arc au-dessus » (décision produit) ──────────────
// Un arc de soutènement, posé EN TRAVERS de la galerie, se peint au-dessus de tout le canvas des vecteurs (tracés
// compris), sa zone de clic (ghost) avec lui, sinon la couche rayée avalerait le clic de sa fiche. Rien d'autre ne
// bouge. Carte : en queue de la liste du renderer, à chaque passe de _ordonnerMursCarte ; exports : la même fonction
// sur leur file. `estArc(item)` → bool. ⚠️ Rend la MÊME liste si rien ne bouge (test d'identité des appelants).
function ktaArcsAuDessus(liste, estArc) {
  if (!Array.isArray(liste) || liste.length < 2) return liste;
  const autres = [], arcs = [];
  let vuArc = false, desordre = false;
  for (let i = 0; i < liste.length; i++) {
    if (estArc(liste[i])) { arcs.push(liste[i]); vuArc = true; }
    else { autres.push(liste[i]); if (vuArc) desordre = true; }
  }
  return desordre ? autres.concat(arcs) : liste;
}
window.ktaArcsAuDessus = ktaArcsAuDessus;
function _estCoucheArc(l) {
  const op = l && l.options;
  return !!(op && (op.ktaRayures || op.ktaArcDessus));
}
// 🩸 Un tracé (re)dessiné APRÈS un arc (renderRoads, calque rebasculé, routes rendues par ULTRA au glissé, filtre de
// niveau) va au bout de la liste et repasserait dessus : tant qu'un arc est sur la carte, tout ajout de vecteur sur le
// canvas commun prévoit une passe.
let _arcsSurCarte = false;

// Une passe par lot d'ajouts : la micro-tâche passe après les ajouts synchrones et AVANT le prochain dessin.
let _ordreMursPrevu = false;
function _prevoirOrdreMurs(e) {
  const l = e && e.layer, op = l && l.options;
  if (!op || _ordreMursPrevu) return;
  if (_estCoucheArc(l)) _arcsSurCarte = true;
  const vecteurCommun = _arcsSurCarte && l._renderer && window.map && l._renderer === window.map._renderer;
  if (!ROLE_STRUCTURE[op.ktaStructType] && !_estCoucheArc(l) && !vecteurCommun) return;
  _ordreMursPrevu = true;
  Promise.resolve().then(_ordonnerMursCarte);
}
// Drapeau sur la MAP (recréée à chaque plan), comme `_ktaFrontZoomBound`.
function _brancherOrdreMurs() {
  if (!window.map || window.map._ktaOrdreMursBound) return;
  window.map.on("layeradd", _prevoirOrdreMurs);
  window.map._ktaOrdreMursBound = true;
}

const STRUCTURE_STYLE_PREVIEW = {
  weight:    3,
  opacity:   1,
  dashArray: "8 5"
};

// Cible de rendu : calque « Mes annotations » (window.layerEditor), comme le reste de la session.
function _structureTarget() {
  return window.layerEditor || window.map;
}

// ── Init ──────────────
function initStructures() {
  // Remise à zéro (changement de plan) ; l'écouteur de clic n'est posé qu'une fois.
  structuresData = [];
  currentStructure = null;

  structureLayers.forEach(function(l) { window.ktaRetirerCalque(l); });
  structureLayers = [];

  window.ktaRetirerCalque(structurePreviewLayer);
  structurePreviewLayer = null;

  window.modeStructure = null;

  if (window.structuresInitialized) return;
  window.structuresInitialized = true;

  console.log("[Structures] init OK");

  window.map.on("click", function(e) {
    if (!window.modeStructure) return;

    const x = e.latlng.lng;
    const y = APP_CONFIG.imageHeight - e.latlng.lat;

    // Historique : état avant, libellé selon nouvelle structure / sommet / fermeture.
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("structures") : null;
    const _isNewStruct = !currentStructure;
    const _typeKey = window.modeStructure;
    // Type custom : libellé saisi dans LegendCustomization.
    function _resolveTypeLabel(k) {
      if (STRUCTURE_TYPES_BUILTIN.indexOf(k) >= 0) return window.I18n.t("struct.label." + k);
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
      // Multi-niveau seulement (sinon aucun champ level). pilier-2 et front-2 sont la 2e masse, un banc FIXE du
      // terrain sous la 1re (niveau 0) : toujours au niveau −1, quel que soit le niveau actif (décision produit ;
      // « niveau actif − 1 » rangeait au −2 un pilier dessiné depuis le −1). Le reste : niveau actif. La fiche
      // (liste Niveau) change ensuite la valeur telle quelle.
      if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
        const _activeLvl = window.APP_CONFIG.activeLevel || 0;
        if (currentStructure.type === "pilier-2" || currentStructure.type === "front-2") {
          currentStructure.level = -1;
        } else {
          currentStructure.level = _activeLvl;
        }
      }
      if (window.KtaUid) window.KtaUid.ensure(currentStructure, "st");
      structuresData.push(currentStructure);
    }

    // Polyline (front) : pas de fermeture par re-clic, on valide par le bouton ✅. Polygone : re-clic sur p0.
    if (_isPolylineType(currentStructure.type)) {
      currentStructure.points.push({ x: x, y: y });
      if (window.KtaUid) window.KtaUid.touch(currentStructure);
      renderStructures();
      if (window.HistoryManager && _historyBefore) {
        const lbl = _isNewStruct
          ? window.I18n.t("struct.undo.new", { type: _typeLabel })
          : window.I18n.t("struct.undo.vertex", { type: _typeLabel });
        window.HistoryManager.record(lbl, _historyBefore, "structures");
      }
      return;
    }

    if (currentStructure.points.length >= 3) {
      const p0 = currentStructure.points[0];
      const dx = x - p0.x;
      const dy = y - p0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const tol = typeof window.ktaToleranceFermeture === "function" ? window.ktaToleranceFermeture(e) : 5;
      if (dist <= tol) {
        fermerStructureEnCours();
        if (window.HistoryManager && _historyBefore) {
          window.HistoryManager.record(window.I18n.t("struct.undo.close", { type: _typeLabel }), _historyBefore, "structures");
        }
        // Comme les zones : l'outil reste armé (décision produit), le clic suivant commence une nouvelle
        // structure du même type ; retoucher l'icône l'éteint.
        return;
      }
    }

    currentStructure.points.push({ x: x, y: y });
    if (window.KtaUid) window.KtaUid.touch(currentStructure);
    renderStructures();
    if (window.HistoryManager && _historyBefore) {
      const lbl = _isNewStruct
        ? window.I18n.t("struct.undo.new", { type: _typeLabel })
        : window.I18n.t("struct.undo.vertex", { type: _typeLabel });
      window.HistoryManager.record(lbl, _historyBefore, "structures");
    }
  });
}

// ── Activer / désactiver un type ──────────────
// 🩸 Retaper la pastille ou changer de type ne DÉTRUIT jamais en silence la structure en cours : assez de
// points (front ≥ 2, polygone ≥ 3) → validée et historisée ; sinon abandonnée avec toast + historique (⏪).
function _labelTypeStruct(k) {
  if (STRUCTURE_TYPES_BUILTIN.indexOf(k) >= 0) {
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
    // Validée : déréférencée, elle se rend « fermée » au prochain rendu.
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
  if (currentStructure && window.modeStructure !== type) _resoudreStructureEnCours();

  if (window.modeStructure === type) {
    if (currentStructure) _resoudreStructureEnCours();
    window.modeStructure = null;
  } else {
    window.modeStructure = type;
    currentStructure = null;
  }

  // 🏷️ ancre:fin-toggle-structure
  // Re-rendu de TOUTES les couches de session + datalayer : un mode actif retire ghosts et popups des 3
  // familles, sinon ils interceptent les clics du tracé (utils.js > _kta_syncAllNoteUiForModeChange).
  if (typeof window._kta_syncAllNoteUiForModeChange === "function") {
    window._kta_syncAllNoteUiForModeChange();
  } else {
    renderStructures();  // utils.js absent
  }
  console.log("[Structures] Mode :", window.modeStructure);
}

// ── Fermer la structure en cours ──────────────
function fermerStructureEnCours() {
  if (!currentStructure) return false;
  // Minimum : 2 points pour un front, 3 pour un polygone.
  const minPoints = _isPolylineType(currentStructure.type) ? 2 : 3;
  if (currentStructure.points.length < minPoints) {
    return false;
  }
  // Fermeture implicite : le point de départ n'est pas répété.
  currentStructure = null;
  renderStructures();
  return true;
}

// ── Rendu ──────────────
// Filtres d'affichage d'une structure, lus par renderStructures et par l'ajustement des sommets
// (ktaFormesAjustables) : niveaux visibles (`level` absent = 0), état d'une extension (ktaExtensions.js >
// filtrerEtats), types du FilterPanel. La structure en cours de tracé passe toujours (comme les zones).
function _structurePasseFiltres(s) {
  if (s === currentStructure) return true;
  const cfg = window.APP_CONFIG || {};
  if (cfg.multiLevel === true) {
    const vis = Array.isArray(cfg.visibleLevels) ? cfg.visibleLevels : [0];
    if (vis.indexOf(Number.isInteger(s.level) ? s.level : 0) < 0) return false;
  }
  if (window.KtaExtensions && typeof window.KtaExtensions.passeFiltreEtat === "function" &&
      !window.KtaExtensions.passeFiltreEtat(s)) return false;
  const f = window._ktaRuntimeFilters;
  return !(f && f.structTypes && !f.structTypes.has(s.type));
}

function renderStructures() {
  if (typeof window.ktaSignalerDonneesPlan === "function") window.ktaSignalerDonneesPlan("structures");
  // Idempotent (drapeau sur la map) : une closure fraîche par rendu empilerait les écouteurs.
  window.brancherLargeurFronts();
  // 🩸 Retrait par le GROUPE (utils.js > ktaRetirerCalque), jamais l.remove() : chaque rendu laissait dans
  // layerEditor une copie entière des structures (onglet tué au-delà de quelques milliers après N modifications).
  structureLayers.forEach(function(l) { window.ktaRetirerCalque(l); });
  structureLayers = [];

  window.ktaRetirerCalque(structurePreviewLayer);
  structurePreviewLayer = null;

  // Ordre Z (décision produit), de l'arrière à l'avant : mur < mur-ligne < pilier-2 < pilier-1 < front-2 <
  // front-1 < arc. Stratigraphie : la 1re masse devant la 2e ; les fronts devant les piliers, sinon l'avancement
  // d'exploitation est masqué ; l'arc, trait fin posé en travers, devant tout. En multi-niveau, tri primaire par
  // `level` croissant (comme les tracés).
  const ordreType = { "mur": 0, "mur-ligne": 1, "pilier-2": 2, "pilier-1": 3, "front-2": 4, "front-1": 5, "arc": 6 };
  const _multiLevelOnSort = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const structuresAffichage = [...structuresData].sort(function(a, b) {
    if (_multiLevelOnSort) {
      const la = Number.isInteger(a.level) ? a.level : 0;
      const lb = Number.isInteger(b.level) ? b.level : 0;
      if (la !== lb) return la - lb;
    }
    const oa = ordreType[a.type] !== undefined ? ordreType[a.type] : 99;
    const ob = ordreType[b.type] !== undefined ? ordreType[b.type] : 99;
    return oa - ob;
  });

  const target = _structureTarget();

  structuresAffichage.forEach(function(s) {
    if (!s.points || s.points.length === 0) return;
    if (!_structurePasseFiltres(s)) return;

    const latlngs = s.points.map(function(p) { return convertCoord(p.x, p.y); });
    const style = _resolveStructureStyle(s.type) || _resolveStructureStyle("mur");

    const isPolyline = !!style.isPolyline;

    if (s === currentStructure) {
      // En cours : un front s'affiche déjà au style final, continu (comme un tracé) ; un polygone en
      // pointillé, pas encore fermé.
      // 🩸 JAMAIS de ghost ni de popup sur la structure en cours : la ghost (bubblingMouseEvents:false)
      // avalerait le clic suivant, et la popup s'ouvrirait sur le point qu'on vient de poser.
      if (s.points.length >= 1) {
        if (isPolyline) {
          structurePreviewLayer = window.ktaPolylineStructure(latlngs, style, {
            color:    style.color,
            weight:   style.weight,
            opacity:  style.opacity,
            lineCap:  "round",
            lineJoin: "round",
            interactive: false
          }).addTo(target);
        } else {
          const previewStyle = Object.assign({}, STRUCTURE_STYLE_PREVIEW, {
            color: style.fillColor
          });
          structurePreviewLayer = L.polyline(latlngs, previewStyle).addTo(target);

          // Dès 3 points, un cercle sur p0 signale la fermeture par re-clic.
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
      // Fermée : rendu final + popup note.
      let layer;
      if (isPolyline) {
        // Front : trait épais sans contour (arc : trait rayé). `weight` est réécrit au zoom par majLargeurFronts.
        layer = window.ktaPolylineStructure(latlngs, style, {
          color:     style.color,
          weight:    style.weight,
          opacity:   style.opacity,
          lineCap:   "round",
          lineJoin:  "round",
          ktaStructType:   s.type,
          ktaStructNiveau: s.level
        }).addTo(target);
      } else {
        layer = L.polygon(latlngs, Object.assign(style, { ktaStructType: s.type, ktaStructNiveau: s.level }))
          .addTo(target);
      }
      structureLayers.push(layer);
      // État donné par une extension (prise etatObjet) : pointillé ; sans prise, uid noté seulement.
      if (window.KtaExtensions && typeof window.KtaExtensions.marquerCouche === "function") {
        window.KtaExtensions.marquerCouche(layer, s.uid, isPolyline ? null : style.dashArray);
      }

      // Popup note. Un front reçoit une ghost transparente plus épaisse pour le clic (comme road.js) ; un
      // polygone capte le clic par son aire.
      // 🩸 Ghost + popup seulement si AUCUN mode d'édition n'est actif, sinon la ghost avale les clics du tracé ;
      // ils reviennent quand le mode s'éteint (toggleStructureMode → re-rendu).
      if (typeof window.attacherNotePopup === "function" &&
          window._aucunModeEditionActif()) {
        const _structRef = s;
        // Titre = libellé de l'utilisateur (custom : findCustomEntry ; built-in : getLabel, renommage compris),
        // jamais l'id brut `cust-…`.
        function _structPopupTitle(t) {
          const integre = STRUCTURE_TYPES_BUILTIN.indexOf(t) >= 0;
          if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
            if (String(t).startsWith("cust-")) {
              const e = window.LegendCustomization.findCustomEntry(t);
              if (e) return e.label;
            }
            if (integre) return window.LegendCustomization.getLabel("structures", t);
          }
          if (integre) return window.I18n.t("struct.popup." + t);
          return window.I18n.t("struct.popup.fallback", { type: t });
        }
        let cibleClic = layer;
        if (isPolyline) {
          const ghostStruct = L.polyline(latlngs, {
            weight:               Math.max((style.weight || 10) + 12, 22),
            opacity:              0,
            interactive:          true,
            bubblingMouseEvents:  false,
            ktaArcDessus:         !!style.rayures
          }).addTo(target);
          structureLayers.push(ghostStruct);
          cibleClic = ghostStruct;
        }
        window.attacherNotePopup(
          cibleClic,
          function() { return _structRef.description; },
          function(v) { _structRef.description = v; if (window.KtaUid) window.KtaUid.touch(_structRef); },
          function() { return _structPopupTitle(_structRef.type); },
          // Reclassement depuis la popup (convertirObjet.js).
          { convertir: { famille: "structures", obj: _structRef }, pastille: { cat: "structures", cle: s.type } }
        );
      }
    }
  });
  // 🩸 Largeurs au zoom APRÈS la création des couches : brancherLargeurFronts (en tête) passe avant elles, et
  // une structure de session gardait 10 px (front, mur en ligne) ou 3 px de contour jusqu'au zoom suivant.
  majLargeurFronts();
}

// ── Remise à zéro, suppressions ──────────────
function resetStructures() {
  structuresData = [];
  currentStructure = null;
  window.modeStructure = null;

  structureLayers.forEach(function(l) { window.ktaRetirerCalque(l); });
  structureLayers = [];

  window.ktaRetirerCalque(structurePreviewLayer);
  structurePreviewLayer = null;
}

// Supprime la structure EN COURS si elle existe, sinon la dernière fermée (comme removeLastRoad / removeLastZone).
function removeLastStructure() {
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
  if (structuresData.length === 0) return false;
  const removed = structuresData.pop();
  renderStructures();
  if (window.HistoryManager && _historyBefore) {
    const typeLabel = removed && removed.type ? removed.type : window.I18n.t("struct.undo.fallback");
    window.HistoryManager.record(window.I18n.t("struct.undo.removeLast", { type: typeLabel }), _historyBefore, "structures");
  }
  return true;
}

// Retire le dernier point de la structure en cours, sinon de la dernière fermée.
function removeLastStructurePoint() {
  if (!currentStructure || currentStructure.points.length === 0) {
    if (structuresData.length === 0) return false;
    const last = structuresData[structuresData.length - 1];
    if (!last.points || last.points.length === 0) return false;
    last.points.pop();
    if (window.KtaUid) window.KtaUid.touch(last);
    // Sous le minimum (2 front, 3 polygone), la structure entière part.
    const minPoints = _isPolylineType(last.type) ? 2 : 3;
    if (last.points.length < minPoints) {
      structuresData.pop();
    }
    renderStructures();
    return true;
  }

  currentStructure.points.pop();
  if (window.KtaUid) window.KtaUid.touch(currentStructure);
  if (currentStructure.points.length === 0) {
    const idx = structuresData.indexOf(currentStructure);
    if (idx >= 0) structuresData.splice(idx, 1);
    currentStructure = null;
  }
  renderStructures();
  return true;
}

// ── Lecture / écriture ──────────────
window.getStructures = function() {
  return structuresData;
};

window.setStructures = function(structures) {
  structuresData = structures || [];
  // Filet : toute structure qui entre ressort avec un uid (ktaUid.js).
  if (window.KtaUid) window.KtaUid.ensureAll(structuresData, "st");
  currentStructure = null;
  renderStructures();
};

// Structure en cours (ou null) : interface.js ferme le mode quand une suppression l'a effacée.
window.getCurrentStructure = function() {
  return currentStructure || null;
};

// 🩸 HistoryManager capture et restaure l'INDEX de la structure en cours (comme road.js) : sinon
// resetStructures + setStructures la perdent à chaque Ctrl+Z et l'outil meurt dès le 1er undo.
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

// ⚠️ Ordre d'empilement : les structures (calques puis session) se peignent AU-DESSUS des zones. Tout est sur le
// même canvas, peint dans l'ordre d'ajout : une zone (re)dessinée après une structure la recouvrirait. Appelé
// après chaque rendu de zones (zones.js > renderZones, utils.js > zones d'un calque) ; l'ordre entre structures,
// et celui des zones entre elles et sous les tracés, est gardé.
window.ktaStructuresAuDessus = function() {
  const monter = function(l) { if (l && typeof l.bringToFront === "function") l.bringToFront(); };
  (window._ktaDataStructurePolygons || []).forEach(function(e) { monter(e && e.polygon); });
  structureLayers.forEach(monter);
  // 🩸 bringToFront ne déclenche pas `layeradd` : sans cette passe, un mur remonté repasserait sur un pilier.
  _ordonnerMursCarte();
};

// interface.js > activerModeSuppressionStructureClic y lit la géométrie à tester.
window.isStructurePolylineType       = _isPolylineType;
window.initStructures                = initStructures;
window.toggleStructureMode           = toggleStructureMode;
window.fermerStructureEnCours        = fermerStructureEnCours;
window.resetStructures               = resetStructures;
window.removeLastStructure           = removeLastStructure;
window.removeLastStructurePoint      = removeLastStructurePoint;
window.renderStructures              = renderStructures;

// ── Ajustement des sommets (js/ajusterSommets.js) ──────────────
// ⚠️ contrat : même forme que road.js > ktaFormesAjustables.roads. Structures de session visibles, hors structure en
// cours ; une ligne (front, mur en ligne, arc) reste ouverte, minimum 2 ; un polygone, minimum 3.
window.ktaFormesAjustables = window.ktaFormesAjustables || {};
window.ktaFormesAjustables.structures = {
  cat: "structures",
  objets: function() {
    return structuresData.filter(function(s) {
      return s && s !== currentStructure && Array.isArray(s.points) && _structurePasseFiltres(s);
    });
  },
  ferme: function(s) { return !_isPolylineType(s.type); },
  minimum: function(s) { return _isPolylineType(s.type) ? 2 : 3; },
  libelle: function(s) { return _labelTypeStruct(s.type); },
  rendre: function() { renderStructures(); }
};
