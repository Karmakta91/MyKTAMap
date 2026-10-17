/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// zones.js — tracé des zones polygonales remplies (eau, remblais, effondrement, inaccessible, cust-…).
// Fermeture : re-clic sur le 1er sommet (≥ 3 sommets) ou bouton « Fermer la zone ».
// Expose : window.initZones, toggleZoneMode, getZones/setZones, getCurrentZone(Index), …
// 🩸 La zone INACCESSIBLE bloque le pathfinder (segment qui traverse le polygone retiré du graphe)
//   et se peint avec le motif SVG d'index.html : renderer L.svg() dédié (le canvas l'ignore).
// Styles : window.ktaResolveStyle (styleResolver.js), jamais de table locale.
// Garde-fou : scripts/check-filets-donnees.js, scripts/check-uid.js, scripts/check-style-canon.js

window.modeZone = null; // null | "remblais" | "effondrement" | "eau" | "inaccessible"

let zonesData = [];
let currentZone = null;
let zoneLayers = [];      // polygones fermés (remplis)
let previewLayer = null;  // polyline pointillée pendant le tracé

// Tolérance du re-clic sur le 1er sommet (px, coordonnées plan).
const CLOSE_TOLERANCE = 5;

// ── Styles ──────────────────────────────
// Renderer SVG dédié à l'inaccessible (motif url(#kta-pattern-inaccessible)) ; les autres types
// gardent le renderer par défaut de Leaflet.
let _inaccessibleRenderer = null;
function _getInaccessibleRenderer() {
  if (!_inaccessibleRenderer) {
    _inaccessibleRenderer = L.svg({ padding: 0.5 });
  }
  return _inaccessibleRenderer;
}

const ZONE_STYLE_PREVIEW = {
  weight:    3,
  opacity:   1,
  dashArray: "8 5"
};

// Built-in et custom via ktaResolveStyle : objet NEUF à chaque appel (le muter ne contamine rien).
let _resolverManquantSignaleZ = false;
function _resolveZoneStyle(type) {
  if (typeof window.ktaResolveStyle !== "function") {
    if (!_resolverManquantSignaleZ) {
      _resolverManquantSignaleZ = true;
      console.error("[Zones] window.ktaResolveStyle absent — styles indisponibles. Cache SW incoherent ?");
    }
    return null;
  }
  return window.ktaResolveStyle("zones", type);
}

// Cible de rendu : calque « Mes annotations » (window.layerEditor), comme points et tracés de
// session ; window.map tant qu'il n'existe pas.
function _zoneTarget() {
  return window.layerEditor || window.map;
}

// ── Init ──────────────────────────────
function initZones() {
  // Changement de plan : remise à zéro complète.
  zonesData = [];
  currentZone = null;

  if (zoneLayers && zoneLayers.length) {
    zoneLayers.forEach(function(l) {
      try { l.remove(); } catch(e) {}
    });
  }
  zoneLayers = [];

  if (previewLayer) {
    try { previewLayer.remove(); } catch(e) {}
    previewLayer = null;
  }

  window.modeZone = null;

  if (window.zonesInitialized) return;
  window.zonesInitialized = true;

  console.log("[Zones] init OK");

  window.map.on("click", function(e) {
    if (!window.modeZone) return;

    const x = e.latlng.lng;
    const y = APP_CONFIG.imageHeight - e.latlng.lat;

    // Undo : capture AVANT toute mutation (création, sommet, fermeture).
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("zones") : null;
    const _isNewZone = !currentZone;
    let _typeLabel;
    if (window.LegendCustomization && String(window.modeZone).startsWith("cust-")) {
      const e = window.LegendCustomization.findCustomEntry(window.modeZone);
      _typeLabel = e ? e.label : window.modeZone;
    } else {
      _typeLabel = (window.modeZone === "eau" ? "Eau"
                  : window.modeZone === "remblais" ? "Remblais"
                  : window.modeZone === "effondrement" ? "Effondrement"
                  : window.modeZone === "inaccessible" ? "Inaccessible"
                  : window.modeZone);
    }

    if (!currentZone) {
      currentZone = {
        type: window.modeZone,
        points: []
      };
      // Multi-niveau actif : la zone prend le niveau actif ; sinon aucun champ level.
      if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
        currentZone.level = window.APP_CONFIG.activeLevel || 0;
      }
      if (window.KtaUid) window.KtaUid.ensure(currentZone, "zn");
      zonesData.push(currentZone);
    }

    if (currentZone.points.length >= 3) {
      const p0 = currentZone.points[0];
      const dx = x - p0.x;
      const dy = y - p0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= CLOSE_TOLERANCE) {
        fermerZoneEnCours();
        if (window.HistoryManager && _historyBefore) {
          window.HistoryManager.record(window.I18n.t("history.action.closeZone", { type: _typeLabel }), _historyBefore, "zones");
        }
        // 🩸 Fermer éteint aussi l'outil : sinon modeZone reste armé et le clic suivant
        // relance une zone dans un état incohérent.
        if (typeof window._fermerModeZone === "function") window._fermerModeZone();
        return;
      }
    }

    currentZone.points.push({ x: x, y: y });
    if (window.KtaUid) window.KtaUid.touch(currentZone);
    renderZones();
    if (window.HistoryManager && _historyBefore) {
      const lbl = _isNewZone
        ? window.I18n.t("history.action.newZone", { type: _typeLabel })
        : window.I18n.t("history.action.zoneVertex", { type: _typeLabel });
      window.HistoryManager.record(lbl, _historyBefore, "zones");
    }
  });
}

// ── Activer / désactiver un type ──────────────────────────────
// 🩸 Retaper la pastille ou changer de type ne détruit jamais la zone en cours en silence :
// ≥ 3 sommets → FERMÉE et historisée ; sinon abandonnée avec toast et entrée d'historique.
function _labelTypeZone(type) {
  if (window.LegendCustomization && String(type).startsWith("cust-")) {
    const e = window.LegendCustomization.findCustomEntry(type);
    return e ? e.label : type;
  }
  return (type === "eau" ? "Eau"
        : type === "remblais" ? "Remblais"
        : type === "effondrement" ? "Effondrement"
        : type === "inaccessible" ? "Inaccessible"
        : type);
}
function _resoudreZoneEnCours() {
  if (!currentZone) return;
  const avant = window.HistoryManager ? window.HistoryManager.captureState("zones") : null;
  const label = _labelTypeZone(currentZone.type);
  const toast = function(k, type) {
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(window.I18n.t(k, { type: label }), type);
    }
  };
  if (currentZone.points.length >= 3) {
    currentZone = null;
    if (window.HistoryManager && avant) {
      window.HistoryManager.record(window.I18n.t("history.action.closeZone", { type: label }), avant, "zones");
    }
    toast("zones.toast.fermee", "info");
  } else {
    const idx = zonesData.indexOf(currentZone);
    if (idx >= 0) zonesData.splice(idx, 1);
    currentZone = null;
    if (window.HistoryManager && avant) {
      window.HistoryManager.record(window.I18n.t("history.action.abandonZone", { type: label }), avant, "zones");
    }
    toast("zones.toast.abandon", "warn");
  }
}
function toggleZoneMode(type) {
  if (window.modeZone !== type && typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;
  if (currentZone && window.modeZone !== type) _resoudreZoneEnCours();

  if (window.modeZone === type) {
    if (currentZone) _resoudreZoneEnCours();
    window.modeZone = null;
  } else {
    window.modeZone = type;
    currentZone = null;
  }

  // Re-rendu de tous les calques de session + calques de données (utils.js).
  if (typeof window._kta_syncAllNoteUiForModeChange === "function") {
    window._kta_syncAllNoteUiForModeChange();
  } else {
    renderZones();
  }
  console.log("[Zones] Mode :", window.modeZone);
}

// ── Fermer la zone en cours ──────────────────────────────
function fermerZoneEnCours() {
  if (!currentZone || currentZone.points.length < 3) {
    return false;
  }
  // Fermeture implicite : le 1er point n'est pas répété.
  currentZone = null;
  renderZones();
  return true;
}

// ── Rendu ──────────────────────────────
function renderZones() {
  zoneLayers.forEach(function(l) { try { l.remove(); } catch(e) {} });
  zoneLayers = [];

  if (previewLayer) {
    try { previewLayer.remove(); } catch(e) {}
    previewLayer = null;
  }

  // Ordre d'empilement : eau, remblais, effondrement, inaccessible au-dessus (elle bloque le
  // pathfinder, elle doit se voir).
  const ordreType = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
  const zonesAffichage = [...zonesData].sort(function(a, b) {
    const oa = ordreType[a.type] !== undefined ? ordreType[a.type] : 99;
    const ob = ordreType[b.type] !== undefined ? ordreType[b.type] : 99;
    return oa - ob;
  });

  const target = _zoneTarget();

  // Multi-niveau : seules les zones de visibleLevels ; sans champ level = niveau 0.
  const _multiLevelOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const _visibleLevels = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
                          ? window.APP_CONFIG.visibleLevels : [0];
  function _zonePasseFiltre(zone) {
    if (!_multiLevelOn) return true;
    // 🩸 La zone en cours de tracé reste visible quel que soit le filtre (comme
    // road.js > _passeFiltreNiveau).
    if (zone === currentZone) return true;
    const lvl = Number.isInteger(zone.level) ? zone.level : 0;
    return _visibleLevels.indexOf(lvl) >= 0;
  }

  zonesAffichage.forEach(function(zone) {
    if (!zone.points || zone.points.length === 0) return;
    if (!_zonePasseFiltre(zone)) return;

    // Filtre par type (FilterPanel), sauf pour la zone en cours.
    if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.zoneTypes
        && zone !== currentZone) {
      if (!window._ktaRuntimeFilters.zoneTypes.has(zone.type)) return;
    }

    const latlngs = zone.points.map(function(p) { return convertCoord(p.x, p.y); });
    const style = _resolveZoneStyle(zone.type) || _resolveZoneStyle("remblais");

    if (zone === currentZone) {
      // En cours de tracé : aperçu en pointillés.
      if (zone.points.length >= 1) {
        const previewStyle = Object.assign({}, ZONE_STYLE_PREVIEW, {
          color: style.color
        });
        previewLayer = L.polyline(latlngs, previewStyle).addTo(target);

        // Cercle sur le 1er sommet : la fermeture est possible.
        if (zone.points.length >= 3) {
          const p0 = zone.points[0];
          const marker = L.circleMarker(convertCoord(p0.x, p0.y), {
            radius:      6,
            color:       style.color,
            fillColor:   style.color,
            fillOpacity: 0.4,
            weight:      2,
            interactive: false
          }).addTo(target);
          zoneLayers.push(marker);
        }
      }
    } else {
      const polygonOpts = (zone.type === "inaccessible")
        ? Object.assign({}, style, { renderer: _getInaccessibleRenderer() })
        : style;
      const polygon = L.polygon(latlngs, polygonOpts).addTo(target);
      zoneLayers.push(polygon);

      // Popup de note seulement hors mode édition : sinon le clic ouvre la popup ET ajoute un
      // sommet au tracé en cours (même règle que road.js / structures.js).
      if (typeof window.attacherNotePopup === "function" &&
          window._aucunModeEditionActif()) {
        const _zoneRef = zone;
        const _zoneEmojis = {
          eau:          "💧",
          remblais:     "⬛",
          effondrement: "🟥",
          inaccessible: "⛔"
        };
        function _zonePopupTitle(t) {
          if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
            if (String(t).startsWith("cust-")) {
              const e = window.LegendCustomization.findCustomEntry(t);
              if (e) return "✨ " + e.label;
            }
            if (_zoneEmojis[t]) {
              return _zoneEmojis[t] + " " + window.LegendCustomization.getLabel("zones", t);
            }
          }
          const LBL = {
            eau:          "💧 Zone Eau",
            remblais:     "⬛ Zone Remblais",
            effondrement: "🟥 Zone Effondrement",
            inaccessible: "⛔ Zone Inaccessible"
          };
          return LBL[t] || ("Zone " + t);
        }
        window.attacherNotePopup(
          polygon,
          function() { return _zoneRef.description; },
          function(v) { _zoneRef.description = v; if (window.KtaUid) window.KtaUid.touch(_zoneRef); },
          _zonePopupTitle(zone.type),
          // Reclassement depuis la popup (convertirObjet.js).
          { convertir: { famille: "zones", obj: _zoneRef } }
        );
      }
    }
  });
}

// ── Reset complet ──────────────────────────────
function resetZones() {
  zonesData = [];
  currentZone = null;
  window.modeZone = null;

  zoneLayers.forEach(function(l) { try { l.remove(); } catch(e) {} });
  zoneLayers = [];

  if (previewLayer) {
    try { previewLayer.remove(); } catch(e) {}
    previewLayer = null;
  }
}

// ── Supprimer la zone en cours ou la dernière fermée ──────────────────────────────
function removeLastZone() {
  // Priorité à la zone EN COURS, sinon la dernière fermée ; capture undo pour les deux.
  const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("zones") : null;
  if (currentZone) {
    const idx = zonesData.indexOf(currentZone);
    if (idx >= 0) zonesData.splice(idx, 1);
    currentZone = null;
    renderZones();
    if (window.HistoryManager && _historyBefore) {
      window.HistoryManager.record(window.I18n.t("history.action.deleteCurrentZone"), _historyBefore, "zones");
    }
    return true;
  }
  if (zonesData.length === 0) return false;
  const removed = zonesData.pop();
  renderZones();
  if (window.HistoryManager && _historyBefore) {
    const typeLabel = removed && removed.type ? removed.type : "zone";
    window.HistoryManager.record(window.I18n.t("history.action.deleteLastZone", { type: typeLabel }), _historyBefore, "zones");
  }
  return true;
}

// ── Supprimer le dernier sommet ──────────────────────────────
function removeLastZonePoint() {
  if (!currentZone || currentZone.points.length === 0) {
    // Sans zone en cours : sur la dernière zone fermée.
    if (zonesData.length === 0) return false;
    const last = zonesData[zonesData.length - 1];
    if (!last.points || last.points.length === 0) return false;
    last.points.pop();
    if (window.KtaUid) window.KtaUid.touch(last);
    if (last.points.length < 3) {
      // Moins de 3 sommets : la zone entière part.
      zonesData.pop();
    }
    renderZones();
    return true;
  }

  currentZone.points.pop();
  if (window.KtaUid) window.KtaUid.touch(currentZone);
  if (currentZone.points.length === 0) {
    const idx = zonesData.indexOf(currentZone);
    if (idx >= 0) zonesData.splice(idx, 1);
    currentZone = null;
  }
  renderZones();
  return true;
}

// ── Export / import ──────────────────────────────
window.getZones = function() {
  return zonesData;
};

window.setZones = function(zones) {
  zonesData = zones || [];
  // Filet : toute zone qui entre ressort avec un uid (ktaUid.js).
  if (window.KtaUid) window.KtaUid.ensureAll(zonesData, "zn");
  currentZone = null;
  renderZones();
};

// Lecture seule (interface.js ferme le mode quand une suppression a effacé la zone en cours).
window.getCurrentZone = function() {
  return currentZone || null;
};

// 🩸 HistoryManager capture l'index de la zone en cours et le restaure après _applyState
// (comme road.js) : sinon setZones remet currentZone à null et l'outil meurt au 1er Ctrl+Z.
window.getCurrentZoneIndex = function() {
  if (!currentZone) return -1;
  return zonesData.indexOf(currentZone);
};
window.setCurrentZoneByIndex = function(idx) {
  if (typeof idx === "number" && idx >= 0 && idx < zonesData.length) {
    currentZone = zonesData[idx];
  } else {
    currentZone = null;
  }
};

// ── Exports globaux ──────────────────────────────
window.initZones             = initZones;
window.toggleZoneMode        = toggleZoneMode;
window.fermerZoneEnCours     = fermerZoneEnCours;
window.resetZones            = resetZones;
window.removeLastZone        = removeLastZone;
window.removeLastZonePoint   = removeLastZonePoint;
window.renderZones           = renderZones;
