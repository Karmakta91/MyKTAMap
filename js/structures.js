/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.is-underground.fr
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
//   - "pilier-1" : pilier de 1ère masse (orange entouré de noir)
//   - "pilier-2" : pilier de 2e masse (jaune entouré de noir)
//   - "mur"      : mur en pierre / béton (bleu foncé entouré de noir)
//
// Côté technique, ce module est un clone adapté de js/zones.js — la donnée
// est très similaire (polygones avec sous-type + style associé), mais on
// stocke dans un FICHIER SÉPARÉ `data/<plan>/structure.json` (parallèle à
// zone.json) pour bien découpler les 2 notions côté user et faciliter la
// rétrocompat des KMZ anciens (= sans structure.json → array vide).
//
// Collision pathfinder : sera ajoutée en A1.b (les structures bloquent le
// calcul d'itinéraire comme les zones "inaccessible"). Le DATA est déjà
// prêt à recevoir cette logique.
//
// Multi-niveau : supporté de la même façon que zones (champ `level` tagé
// au tracé si APP_CONFIG.multiLevel === true).
// =========================

window.modeStructure = null; // null | "pilier-1" | "pilier-2" | "mur"

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
// de ZONE_STYLES mais avec stroke #000 systématique + fill plus saturé
// (les structures représentent du physique solide, pas du marquage).
//
// 🆕 v1.9.3-A1.a-fix (KARMA "j'ai inversé les couleurs 1er masse / 2e masse") :
//   - 1ère masse → JAUNE (#f4c542, couleur charte MKM)
//   - 2e masse   → ORANGE (#ff9933)
const STRUCTURE_STYLES = {
  // 🟡 Pilier de 1ère masse : jaune accent (= couleur charte MyKTAMap)
  "pilier-1": {
    color:       "#000000",
    fillColor:   "#f4c542",
    fillOpacity: 0.85,
    weight:      3,
    opacity:     1
  },
  // 🟠 Pilier de 2e masse : orange visible
  "pilier-2": {
    color:       "#000000",
    fillColor:   "#ff9933",
    fillOpacity: 0.85,
    weight:      3,
    opacity:     1
  },
  // 🔵 Mur en pierre / béton : bleu foncé (KARMA "rond bleu dans le menu
  // pour pas confondre avec icône eau")
  "mur": {
    color:       "#000000",
    fillColor:   "#1e3a8a",
    fillOpacity: 0.85,
    weight:      3,
    opacity:     1
  }
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
        if (currentStructure.type === "pilier-2") {
          currentStructure.level = _activeLvl - 1;
        } else {
          currentStructure.level = _activeLvl;
        }
      }
      structuresData.push(currentStructure);
    }

    // Si le clic est proche du 1er point ET qu'on a au moins 3 points → fermer
    if (currentStructure.points.length >= 3) {
      const p0 = currentStructure.points[0];
      const dx = x - p0.x;
      const dy = y - p0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= STRUCT_CLOSE_TOLERANCE) {
        fermerStructureEnCours();
        return;
      }
    }

    currentStructure.points.push({ x: x, y: y });
    renderStructures();
  });
}

// =========================
// ACTIVER / DÉSACTIVER UN TYPE
// =========================
function toggleStructureMode(type) {
  // Si on change de type alors qu'une structure est en cours, on la perd
  // (l'utilisateur doit explicitement fermer ou annuler)
  if (currentStructure && window.modeStructure !== type) {
    const idx = structuresData.indexOf(currentStructure);
    if (idx >= 0) structuresData.splice(idx, 1);
    currentStructure = null;
  }

  if (window.modeStructure === type) {
    // Désactivation du même type → annule la structure en cours si pas fermée
    if (currentStructure) {
      const idx = structuresData.indexOf(currentStructure);
      if (idx >= 0) structuresData.splice(idx, 1);
      currentStructure = null;
    }
    window.modeStructure = null;
  } else {
    window.modeStructure = type;
    currentStructure = null;
  }

  renderStructures();
  console.log("[Structures] Mode :", window.modeStructure);
}

// =========================
// FERMER LA STRUCTURE EN COURS
// =========================
function fermerStructureEnCours() {
  if (!currentStructure || currentStructure.points.length < 3) {
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
  // Vider les layers existants — .remove() détache où qu'ils soient
  structureLayers.forEach(function(l) { try { l.remove(); } catch(e) {} });
  structureLayers = [];

  if (structurePreviewLayer) {
    try { structurePreviewLayer.remove(); } catch(e) {}
    structurePreviewLayer = null;
  }

  // 🆕 v1.9.3-A1.a-fix3 (KARMA "un pilier de 2nd masse, et forcement en
  // dessous d'un 1er, en mode non M-LVL il se met au dessus") :
  // Ordre d'affichage en vue 2D (= projection verticale du dessus) :
  //   1. Murs en arrière (Z bas)
  //   2. Piliers de 2e masse au milieu (couche basse de la carrière)
  //   3. Piliers de 1ère masse devant (couche haute, masquent les 2e
  //      masse là où ils se chevauchent dans la projection)
  // Cohérent avec la stratigraphie cataphile : la 1ère masse est au-dessus
  // de la 2e masse, donc en projection 2D du dessus, elle masque la 2e.
  // En mode M-LVL ON, le filtre niveau gère déjà la séparation visuelle
  // (pilier-2 est à level activeLevel-1, ne s'affiche qu'au bon niveau),
  // mais l'ordre Z reste cohérent dans tous les cas.
  const ordreType = { "mur": 0, "pilier-2": 1, "pilier-1": 2 };
  const structuresAffichage = [...structuresData].sort(function(a, b) {
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

    const latlngs = s.points.map(function(p) { return convertCoord(p.x, p.y); });
    const style = STRUCTURE_STYLES[s.type] || STRUCTURE_STYLES["mur"];

    if (s === currentStructure) {
      // Structure en cours de tracé → polyline pointillée (aperçu) en
      // couleur fill de la structure pour que l'utilisateur voie ce
      // qu'il dessine.
      if (s.points.length >= 1) {
        const previewStyle = Object.assign({}, STRUCTURE_STYLE_PREVIEW, {
          color: style.fillColor
        });
        structurePreviewLayer = L.polyline(latlngs, previewStyle).addTo(target);

        // Petit cercle sur le 1er point pour indiquer la fermeture possible
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
    } else {
      // Structure fermée → polygone rempli avec stroke noir.
      const polygon = L.polygon(latlngs, style).addTo(target);
      structureLayers.push(polygon);
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
  // Trouver la dernière structure fermée (différente de currentStructure)
  for (let i = structuresData.length - 1; i >= 0; i--) {
    if (structuresData[i] !== currentStructure) {
      structuresData.splice(i, 1);
      renderStructures();
      return true;
    }
  }
  return false;
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
    if (last.points.length < 3) {
      // Plus assez de points → supprimer la structure entière
      structuresData.pop();
    }
    renderStructures();
    return true;
  }

  currentStructure.points.pop();
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
  currentStructure = null;
  renderStructures();
};

// Lecture seule : retourne la structure en cours de tracé (ou null).
// Utilisé par interface.js pour fermer le mode quand une suppression vient
// d'effacer la structure en cours (cohérent avec getCurrentZone).
window.getCurrentStructure = function() {
  return currentStructure || null;
};

// =========================
// EXPORT GLOBAL
// =========================
window.initStructures                = initStructures;
window.toggleStructureMode           = toggleStructureMode;
window.fermerStructureEnCours        = fermerStructureEnCours;
window.resetStructures               = resetStructures;
window.removeLastStructure           = removeLastStructure;
window.removeLastStructurePoint      = removeLastStructurePoint;
window.renderStructures              = renderStructures;
