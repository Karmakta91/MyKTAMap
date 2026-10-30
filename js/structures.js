/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// structures.js — structures de session : piliers (1re / 2e masse) et murs en polygones remplis, fronts de
// taille en polylignes épaisses ; types custom de la légende. Clone adapté de zones.js, stocké à part
// (`structure.json`). Multi-niveau : champ `level` posé au tracé.
// Expose : initStructures, toggleStructureMode, fermerStructureEnCours, renderStructures, resetStructures,
//   removeLastStructure(Point), get/setStructures, getCurrentStructure(Index), setCurrentStructureByIndex,
//   isStructurePolylineType, majLargeurFronts, brancherLargeurFronts, ktaLargeur{FrontPourRatio,
//   FrontPourPxParMetre,TracePourRatio}, ktaPxParMetreOsm.
// ⚠️ Aucune couleur ici : la source est js/styleResolver.js (l'utilisateur choisit dans ≡ Légende).
// 🩸 Le Pathfinder ignore les structures (ni arêtes ni obstacles, graphe sur les `roads` seulement) : un
// relevé tout en structures n'a AUCUN itinéraire → js/convertirObjet.js reclasse un vecteur en tracé.
// Garde-fou : scripts/check-style-canon.js, scripts/check-api-surface.js, scripts/check-filets-donnees.js

window.modeStructure = null; // null | "pilier-1" | "pilier-2" | "mur" | "front-1" | "front-2"

// Fronts de taille = POLYLINES ouvertes (limites d'exploitation d'une couche) ; les autres = polygones fermés.
const STRUCTURE_TYPES_POLYLINE = ["front-1", "front-2"];
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

// Re-clic sur le 1er point (unités plan) pour fermer.
const STRUCT_CLOSE_TOLERANCE = 5;

// ── Styles (décisions produit, valeurs dans styleResolver.js) ──────────────
//   • Piliers / mur : contour NOIR systématique (ce qui distingue une structure d'une zone), remplissage plus
//     saturé (du solide). Mur bleu foncé, pour ne pas le confondre avec l'icône eau.
//   • Fronts : polylignes épaisses sans contour. front-1 jaune comme pilier-1, front-2 orange comme
//     pilier-2 : sur le terrain, la cohérence couleur / masse prime.

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

  // ⚠️ Les registres rangent aussi les polylignes sous la clé `polygon` (lue par _filtreNiveauSurPolygonData).
  const appliquer = function (arr, largeur) {
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i]; if (!e) continue;
      const lay = e.polygon || e.polyline || e.layer;
      if (!lay || !lay.options) continue;
      // Les surfaces gardent leur contour : un pilier se lit par son remplissage.
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
  majLargeurFronts();
};

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

    // Historique : état avant, libellé selon nouvelle structure / sommet / fermeture.
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("structures") : null;
    const _isNewStruct = !currentStructure;
    const _typeKey = window.modeStructure;
    // Type custom : libellé saisi dans LegendCustomization.
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
      // Multi-niveau seulement (sinon aucun champ level). pilier-2 et front-2 appartiennent à la 2e masse,
      // la couche INFÉRIEURE vue depuis la courante : niveau actif - 1 (décision produit). Le reste : niveau actif.
      if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
        const _activeLvl = window.APP_CONFIG.activeLevel || 0;
        if (currentStructure.type === "pilier-2" || currentStructure.type === "front-2") {
          currentStructure.level = _activeLvl - 1;
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
      if (dist <= STRUCT_CLOSE_TOLERANCE) {
        fermerStructureEnCours();
        if (window.HistoryManager && _historyBefore) {
          window.HistoryManager.record(window.I18n.t("struct.undo.close", { type: _typeLabel }), _historyBefore, "structures");
        }
        // Comme les zones : fermer éteint l'outil (sinon le clic suivant part dans un mode resté armé).
        if (typeof window._fermerModeStructure === "function") window._fermerModeStructure();
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
function renderStructures() {
  // Idempotent (drapeau sur la map) : une closure fraîche par rendu empilerait les écouteurs.
  window.brancherLargeurFronts();
  structureLayers.forEach(function(l) { try { l.remove(); } catch(e) {} });
  structureLayers = [];

  if (structurePreviewLayer) {
    try { structurePreviewLayer.remove(); } catch(e) {}
    structurePreviewLayer = null;
  }

  // Ordre Z (décision produit), de l'arrière à l'avant : mur < pilier-2 < pilier-1 < front-2 < front-1.
  // Stratigraphie : la 1re masse devant la 2e ; les fronts devant les piliers, sinon l'avancement
  // d'exploitation est masqué. En multi-niveau, tri primaire par `level` croissant (comme les tracés).
  const ordreType = { "mur": 0, "pilier-2": 1, "pilier-1": 2, "front-2": 3, "front-1": 4 };
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

  // Multi-niveau : seul level ∈ visibleLevels passe (sans level = 0) ; hors multi-niveau, tout passe.
  const _multiLevelOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const _visibleLevels = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
                          ? window.APP_CONFIG.visibleLevels : [0];
  function _structurePasseFiltre(s) {
    if (!_multiLevelOn) return true;
    // La structure en cours de tracé reste toujours visible (comme les zones).
    if (s === currentStructure) return true;
    const lvl = Number.isInteger(s.level) ? s.level : 0;
    return _visibleLevels.indexOf(lvl) >= 0;
  }

  structuresAffichage.forEach(function(s) {
    if (!s.points || s.points.length === 0) return;
    if (!_structurePasseFiltre(s)) return;
    // Filtre « objets marqués seulement » d'une extension (ktaExtensions.js > filtrerEtats) ; éteint sans elle.
    if (s !== currentStructure && window.KtaExtensions && typeof window.KtaExtensions.passeFiltreEtat === "function" &&
        !window.KtaExtensions.passeFiltreEtat(s)) return;

    // Filtre de types du FilterPanel ; la structure en cours y échappe.
    if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.structTypes
        && s !== currentStructure) {
      if (!window._ktaRuntimeFilters.structTypes.has(s.type)) return;
    }

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
          structurePreviewLayer = L.polyline(latlngs, {
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
        // Front : trait épais sans contour. `weight` est réécrit au zoom par majLargeurFronts.
        layer = L.polyline(latlngs, {
          color:     style.color,
          weight:    style.weight,
          opacity:   style.opacity,
          lineCap:   "round",
          lineJoin:  "round",
        }).addTo(target);
      } else {
        layer = L.polygon(latlngs, style).addTo(target);
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
        const _structEmojis = {
          "pilier-1": "🟡", "pilier-2": "🟠", "mur": "🔵",
          "front-1":  "🟨", "front-2":  "🟧"
        };
        function _structPopupTitle(t) {
          if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
            if (String(t).startsWith("cust-")) {
              const e = window.LegendCustomization.findCustomEntry(t);
              if (e) return "✨ " + e.label;
            }
            if (_structEmojis[t]) {
              return _structEmojis[t] + " " + window.LegendCustomization.getLabel("structures", t);
            }
          }
          if (_structEmojis[t]) return window.I18n.t("struct.popup." + t);
          return window.I18n.t("struct.popup.fallback", { type: t });
        }
        let cibleClic = layer;
        if (isPolyline) {
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
          // Reclassement depuis la popup (convertirObjet.js).
          { convertir: { famille: "structures", obj: _structRef } }
        );
      }
    }
  });
}

// ── Remise à zéro, suppressions ──────────────
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

// interface.js > activerModeSuppressionStructureClic y lit la géométrie à tester.
window.isStructurePolylineType       = _isPolylineType;
window.initStructures                = initStructures;
window.toggleStructureMode           = toggleStructureMode;
window.fermerStructureEnCours        = fermerStructureEnCours;
window.resetStructures               = resetStructures;
window.removeLastStructure           = removeLastStructure;
window.removeLastStructurePoint      = removeLastStructurePoint;
window.renderStructures              = renderStructures;
