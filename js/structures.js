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

window.modeStructure = null; // null | "pilier-1" | "pilier-2" | "mur" | "front-1" | "front-2"

// 🆕 v1.9.3-A1.b.2 : sous-types qui sont des POLYLINES (= suite de points
// ouverte, comme une road) au lieu de polygones fermés. Les fronts de
// taille représentent les LIMITES d'exploitation d'une couche — un tracé
// épais sans contour qui longe le bord du massif. Tous les autres types
// (pilier-1 / pilier-2 / mur) restent en polygones fermés.
const STRUCTURE_TYPES_POLYLINE = ["front-1", "front-2"];
function _isPolylineType(type) {
  return STRUCTURE_TYPES_POLYLINE.indexOf(type) >= 0;
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
  },
  // 🆕 v1.9.3-A1.b.2 : fronts de taille — POLYLINES épaisses sans contour
  // qui représentent les limites d'exploitation d'une couche cataphile.
  // 🔧 v1.10.1-hotfix2 (KARMA "si orange = 2e masse, le front de taille
  // orange et 2e masse") : couleurs alignées sur les piliers — front-1
  // jaune comme pilier-1 (1ère masse), front-2 orange comme pilier-2
  // (2e masse). Avant : inversées par "design" mais KARMA confirme que
  // c'était une erreur — la cohérence couleur/masse est plus parlante
  // sur le terrain (un trait orange = 2e masse, un trait jaune = 1ère).
  // Pas de stroke contour (le polyline est juste de couleur unie).
  // weight: 10 = bien plus épais que les roads (5) pour distinction visuelle.
  "front-1": {
    color:       "#f4c542",   // jaune charte MKM — 1ère masse (cohérent pilier-1)
    fillColor:   "#f4c542",
    fillOpacity: 1,           // (n.a. pour polyline mais conservé)
    weight:      10,
    opacity:     1,
    isPolyline:  true         // marqueur pour render adapter
  },
  "front-2": {
    color:       "#ff9933",   // orange — 2e masse (cohérent pilier-2)
    fillColor:   "#ff9933",
    fillOpacity: 1,
    weight:      10,
    opacity:     1,
    isPolyline:  true
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

    // 🆕 v1.11.0 Undo/Redo : snapshot before. Le label se construit
    // ensuite selon que c'est une nouvelle structure, un sommet de plus
    // ou une fermeture (cas polygon).
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState() : null;
    const _isNewStruct = !currentStructure;
    const _typeKey = window.modeStructure;
    const _typeLabel = _typeKey === "pilier-1" ? "Pilier 1ère masse"
                     : _typeKey === "pilier-2" ? "Pilier 2e masse"
                     : _typeKey === "mur"      ? "Mur"
                     : _typeKey === "front-1"  ? "Front 1ère masse"
                     : _typeKey === "front-2"  ? "Front 2e masse"
                     : _typeKey;

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
      structuresData.push(currentStructure);
    }

    // 🆕 v1.9.3-A1.b.2 : pour les types POLYLINE (fronts de taille), pas
    // de fermeture par re-clic — c'est une ligne ouverte. L'utilisateur
    // ferme via le bouton ✅ "Fermer la structure en cours" dans le menu.
    // Les types POLYGON (piliers + mur) gardent le comportement re-clic
    // proche du 1er point pour fermer.
    if (_isPolylineType(currentStructure.type)) {
      currentStructure.points.push({ x: x, y: y });
      renderStructures();
      if (window.HistoryManager && _historyBefore) {
        const lbl = _isNewStruct ? "Nouveau " + _typeLabel : "Sommet sur " + _typeLabel;
        window.HistoryManager.record(lbl, _historyBefore);
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
          window.HistoryManager.record("Fermer " + _typeLabel, _historyBefore);
        }
        return;
      }
    }

    currentStructure.points.push({ x: x, y: y });
    renderStructures();
    if (window.HistoryManager && _historyBefore) {
      const lbl = _isNewStruct ? "Nouveau " + _typeLabel : "Sommet sur " + _typeLabel;
      window.HistoryManager.record(lbl, _historyBefore);
    }
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
    // 🆕 v1.9.3-A1.b.2.5-fix (KARMA "on peut valider le front de taille
    // en cliquant sur son icône, comme pour les tracés") :
    // - Polyline (front) : re-clic = VALIDATION du front si assez de
    //   points (2+). Comportement calqué sur toggleRoadMode dans road.js
    //   où re-cliquer sur le type ferme la road en cours.
    // - Polygon (pilier/mur) : re-clic = ANNULATION de la structure en
    //   cours si pas encore fermée (comportement historique préservé).
    if (currentStructure) {
      if (_isPolylineType(currentStructure.type) && currentStructure.points.length >= 2) {
        // Front avec assez de points → on le garde (= validation),
        // on déréférence juste currentStructure pour qu'il devienne
        // "fermé" (rendu en ligne continue au prochain renderStructures).
        currentStructure = null;
      } else {
        // Polygon ou polyline avec < 2 pts → annule (= comportement classique)
        const idx = structuresData.indexOf(currentStructure);
        if (idx >= 0) structuresData.splice(idx, 1);
        currentStructure = null;
      }
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

    const latlngs = s.points.map(function(p) { return convertCoord(p.x, p.y); });
    const style = STRUCTURE_STYLES[s.type] || STRUCTURE_STYLES["mur"];

    // 🆕 v1.9.3-A1.b.2 : différenciation polyline (fronts) vs polygon
    // (piliers + mur). Les fronts sont des lignes ouvertes épaisses
    // sans contour (= juste color, pas de stroke noir comme les piliers).
    const isPolyline = !!style.isPolyline;

    if (s === currentStructure) {
      // 🆕 v1.9.3-A1.b.2.5-fix (KARMA "si ce sont bien des tracés, ils
      // ne doivent pas être en pointillé pendant le dessin, on garde le
      // même comportement écran que une road") :
      // - Polyline (front) en cours : ligne CONTINUE déjà au style final
      //   (color, weight, opacity du STRUCTURE_STYLES), pas de dashArray.
      //   Comportement calqué sur road.js qui rend directement la road
      //   en cours dans son style final.
      // - Polygon (pilier/mur) en cours : preview pointillé (dashArray
      //   "8 5") pour bien signaler que ce n'est pas encore fermé.
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
        lineJoin:  "round"
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
    if (typeof window.attacherNotePopup === "function") {
      const _structRef = structure;
      const _structTypeLabels = {
        "pilier-1": "🟡 Pilier 1ère masse",
        "pilier-2": "🟠 Pilier 2e masse",
        "mur":      "🔵 Mur",
        "front-1":  "🟨 Front de taille 1ère masse",
        "front-2":  "🟧 Front de taille 2e masse"
      };
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
        function(v) { _structRef.description = v; },
        _structTypeLabels[structure.type] || ("Structure " + structure.type)
      );
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
  const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState() : null;
  if (currentStructure) {
    const idx = structuresData.indexOf(currentStructure);
    if (idx >= 0) structuresData.splice(idx, 1);
    currentStructure = null;
    renderStructures();
    if (window.HistoryManager && _historyBefore) {
      window.HistoryManager.record("Supprimer structure en cours", _historyBefore);
    }
    return true;
  }
  // Pas de structure en cours → supprime la dernière fermée
  if (structuresData.length === 0) return false;
  const removed = structuresData.pop();
  renderStructures();
  if (window.HistoryManager && _historyBefore) {
    const typeLabel = removed && removed.type ? removed.type : "structure";
    window.HistoryManager.record("Supprimer dernière structure (" + typeLabel + ")", _historyBefore);
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
