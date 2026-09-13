// =========================
// ZONES POLYGONALES REMPLIES
// =========================
// Permet de tracer des zones fermées et remplies (remblais, effondrements)
// — fermeture par re-clic sur le 1er point OU par bouton "Fermer la zone"
// =========================

window.modeZone = null; // null | "remblais" | "effondrement" | "eau" | "inaccessible"

let zonesData = [];
let currentZone = null;
let zoneLayers = [];      // polygones fermés (remplis)
let previewLayer = null;  // polyline pointillée pendant le tracé

// Tolérance en pixels pour détecter le re-clic sur le 1er point (en coords plan)
const CLOSE_TOLERANCE = 5;

// =========================
// STYLES
// =========================
// 🎨 v1.76.0 — Les 4 types built-in ne sont plus declares ici : leurs valeurs
// viennent de la table canonique de `js/styleResolver.js`.
// Rappel qui ne se lit pas dans les valeurs : la zone INACCESSIBLE (v169)
// bloque le pathfinder (tout segment qui traverse le polygone est retire du
// graphe) et se peint en hachures 45° via le pattern SVG declare dans
// index.html (id="kta-pattern-inaccessible"). Ce `url(#...)` EXIGE un renderer
// L.svg() — un renderer canvas l'ignorerait et afficherait un aplat. D'ou le
// renderer dedie ci-dessous.

// Singleton SVG renderer dedie aux zones inaccessibles. Force pour que le
// pattern url(#kta-pattern-inaccessible) s'applique correctement. Les autres
// zones (eau/remblais/effondrement) utilisent le renderer par defaut Leaflet
// (canvas si preferCanvas:true, sinon SVG) — pas concernees par ce renderer.
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

// Résolution du style d'une zone — built-in ET types CUSTOM (LegendCustomization).
// 🎨 v1.76.0 : delegue integralement a window.ktaResolveStyle. Retourne un objet
// NEUF a chaque appel (avant : l'objet partage de la table), donc un appelant
// qui mute son style ne contamine plus les autres zones.
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

// =========================
// CIBLE DE RENDU — calque "Mes annotations"
// =========================
// Les zones de session sont rendues dans window.layerEditor (= calque
// "Mes annotations"), comme les points editor et les roads de session.
// Toggle unique pour masquer/afficher toutes les annotations utilisateur.
// Fallback window.map si layerEditor pas encore créé (cas d'init précoce).
function _zoneTarget() {
  return window.layerEditor || window.map;
}

// =========================
// INIT
// =========================
function initZones() {
  // Reset complet (changement de plan)
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

    // 🆕 v1.11.0 Undo/Redo : snapshot avant toute mutation (création de
    // currentZone, ajout d'un sommet, fermeture par retour au 1er point).
    const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("zones") : null;
    const _isNewZone = !currentZone;
    // 🐛 v1.16.0 step2-drawable-fix2 : label custom = user-defined
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
      // 🏗️ Multi-niveau (v148) : tag la zone avec le niveau actif si la
      // feature est ON pour ce plan. Sinon → aucun champ level (retro-compat).
      if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
        currentZone.level = window.APP_CONFIG.activeLevel || 0;
      }
      zonesData.push(currentZone);
    }

    // Si le clic est proche du 1er point ET qu'on a au moins 3 points → fermer
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
        // 🐛 fix : fermeture au clic = on éteint aussi l'outil (sinon le bouton
        // reste actif + window.modeZone armé → le clic suivant relance une zone
        // dans un état incohérent). _fermerModeZone gère désactivation + UI.
        if (typeof window._fermerModeZone === "function") window._fermerModeZone();
        return;
      }
    }

    currentZone.points.push({ x: x, y: y });
    renderZones();
    if (window.HistoryManager && _historyBefore) {
      const lbl = _isNewZone
        ? window.I18n.t("history.action.newZone", { type: _typeLabel })
        : window.I18n.t("history.action.zoneVertex", { type: _typeLabel });
      window.HistoryManager.record(lbl, _historyBefore, "zones");
    }
  });
}

// =========================
// ACTIVER / DÉSACTIVER UN TYPE
// =========================
// 🚨 Q24 (audit ergonomie 13/09/2026) : retaper la pastille ou changer de
// type DÉTRUISAIT la zone en cours sans un mot ni historique, alors que le
// même geste VALIDE un tracé. Désormais : ≥ 3 sommets → la zone est FERMÉE
// (validée, historisée, comme le re-clic sur le 1er sommet) ; sinon elle est
// abandonnée avec un toast et une entrée d'historique (⏪ la rend).
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
  // Changement de type ou désactivation du même type : la zone en cours est
  // fermée si elle est valide, abandonnée sinon (cf _resoudreZoneEnCours).
  if (currentZone && window.modeZone !== type) _resoudreZoneEnCours();

  if (window.modeZone === type) {
    if (currentZone) _resoudreZoneEnCours();
    window.modeZone = null;
  } else {
    window.modeZone = type;
    currentZone = null;
  }

  // v1.16.0 step 1d : re-render TOUS les layers session + sync data layer
  // KMZ. Cf utils.js > _kta_syncAllNoteUiForModeChange.
  if (typeof window._kta_syncAllNoteUiForModeChange === "function") {
    window._kta_syncAllNoteUiForModeChange();
  } else {
    renderZones();  // fallback si utils.js pas chargé
  }
  console.log("[Zones] Mode :", window.modeZone);
}

// =========================
// FERMER LA ZONE EN COURS
// =========================
function fermerZoneEnCours() {
  if (!currentZone || currentZone.points.length < 3) {
    return false;
  }
  // La fermeture est implicite : on ne stocke pas le point répété
  currentZone = null;
  renderZones();
  return true;
}

// =========================
// RENDU
// =========================
function renderZones() {
  // Vider les layers existants — .remove() détache où qu'ils soient (map ou layerEditor)
  zoneLayers.forEach(function(l) { try { l.remove(); } catch(e) {} });
  zoneLayers = [];

  if (previewLayer) {
    try { previewLayer.remove(); } catch(e) {}
    previewLayer = null;
  }

  // Trier l'affichage : eau d'abord (en arrière), puis remblais, puis effondrements, puis inaccessible (au-dessus)
  // — la zone en cours reste à sa position pour éviter qu'elle saute pendant le tracé
  // L'inaccessible est en haut car elle a une fonction "bloquante" (pathfinder) que
  // l'utilisateur doit voir clairement.
  const ordreType = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
  const zonesAffichage = [...zonesData].sort(function(a, b) {
    // currentZone garde sa priorité naturelle de tracé (en dernier dans le tableau)
    const oa = ordreType[a.type] !== undefined ? ordreType[a.type] : 99;
    const ob = ordreType[b.type] !== undefined ? ordreType[b.type] : 99;
    return oa - ob;
  });

  const target = _zoneTarget();

  // 🏗️ Multi-niveau (v148) : pre-calcul du filtre. Si la feature est OFF →
  // toutes les zones visibles (retro-compat). Si ON → seul level ∈ visibleLevels.
  // Les zones sans level (pre-v148) sont traitees comme level 0.
  const _multiLevelOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const _visibleLevels = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
                          ? window.APP_CONFIG.visibleLevels : [0];
  function _zonePasseFiltre(zone) {
    if (!_multiLevelOn) return true;
    // Zone EN COURS DE TRACÉ : toujours visible peu importe le filtre (sinon
    // l'utilisateur ne voit pas la zone qu'il dessine si son niveau actuel
    // n'est pas dans visibleLevels). Cf bug report user v148.test, fix
    // symétrique avec road.js > _passeFiltreNiveau.
    if (zone === currentZone) return true;
    const lvl = Number.isInteger(zone.level) ? zone.level : 0;
    return _visibleLevels.indexOf(lvl) >= 0;
  }

  // Pour chaque zone, déterminer si elle est fermée (= pas la zone courante)
  zonesAffichage.forEach(function(zone) {
    if (!zone.points || zone.points.length === 0) return;
    if (!_zonePasseFiltre(zone)) return;

    // 🆕 v1.21.5 (KARMA "filtre par type de zone") : runtime type filter
    // via FilterPanel. currentZone bypass (zone en cours de dessin doit
    // rester visible peu importe le filtre).
    if (window._ktaRuntimeFilters && window._ktaRuntimeFilters.zoneTypes
        && zone !== currentZone) {
      if (!window._ktaRuntimeFilters.zoneTypes.has(zone.type)) return;
    }

    const latlngs = zone.points.map(function(p) { return convertCoord(p.x, p.y); });
    // 🆕 v1.16.0 step2-drawable : résolution dynamique (custom support)
    const style = _resolveZoneStyle(zone.type) || _resolveZoneStyle("remblais");

    if (zone === currentZone) {
      // Zone en cours de tracé → polyline pointillée (aperçu)
      if (zone.points.length >= 1) {
        const previewStyle = Object.assign({}, ZONE_STYLE_PREVIEW, {
          color: style.color
        });
        previewLayer = L.polyline(latlngs, previewStyle).addTo(target);

        // Afficher un petit cercle sur le 1er point pour indiquer la fermeture possible
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
      // Zone fermée → polygone rempli.
      // 🚫 Cas spécial inaccessible : force le SVG renderer pour que le pattern
      // url(#kta-pattern-inaccessible) s'affiche (canvas l'ignorerait).
      const polygonOpts = (zone.type === "inaccessible")
        ? Object.assign({}, style, { renderer: _getInaccessibleRenderer() })
        : style;
      const polygon = L.polygon(latlngs, polygonOpts).addTo(target);
      zoneLayers.push(polygon);

      // 📝 v1.16.0 step 1 — popup au clic pour éditer la note (description)
      // Capture l'index de la zone dans la closure pour pouvoir lire/écrire
      // la dernière valeur même si zonesData change (renderZones).
      //
      // 🐛 v1.16.0 step 1d : on ne binde le popup que si aucun mode édition
      // n'est actif (sinon le clic sur un polygone zone ouvre la popup ET
      // ajoute un point au tracé en cours — UX cassée). Re-render au toggle
      // mode → re-bind du popup. Idem pattern road.js / structures.js.
      if (typeof window.attacherNotePopup === "function" &&
          window._aucunModeEditionActif()) {
        const _zoneRef = zone;  // référence directe à l'objet
        // 🐛 v1.16.0 step2-drawable-fix2 : titre popup résolu via LC
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
          function(v) { _zoneRef.description = v; },
          _zonePopupTitle(zone.type),
          // 🔄 v1.82.0 — reclassement depuis la popup (cf. convertirObjet.js).
          { convertir: { famille: "zones", obj: _zoneRef } }
        );
      }
    }
  });
}

// =========================
// RESET COMPLET
// =========================
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

// =========================
// SUPPRIMER LA DERNIÈRE ZONE FERMÉE
// =========================
function removeLastZone() {
  // 🆕 v1.9.4 (KARMA "on doit pouvoir supprimer d'un coup le tracé en cours,
  // que last zone fermé actuellement") : priorité à la zone EN COURS si elle
  // existe, sinon la dernière zone fermée.
  // 🆕 v1.11.0 Undo/Redo : snapshot before (couvre les 2 branches).
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
  // Pas de zone en cours → supprime la dernière zone fermée
  if (zonesData.length === 0) return false;
  const removed = zonesData.pop();
  renderZones();
  if (window.HistoryManager && _historyBefore) {
    const typeLabel = removed && removed.type ? removed.type : "zone";
    window.HistoryManager.record(window.I18n.t("history.action.deleteLastZone", { type: typeLabel }), _historyBefore, "zones");
  }
  return true;
}

// =========================
// SUPPRIMER LE DERNIER POINT DE LA ZONE EN COURS
// =========================
function removeLastZonePoint() {
  if (!currentZone || currentZone.points.length === 0) {
    // Pas de zone en cours : retirer le dernier point de la dernière zone fermée
    if (zonesData.length === 0) return false;
    const last = zonesData[zonesData.length - 1];
    if (!last.points || last.points.length === 0) return false;
    last.points.pop();
    if (last.points.length < 3) {
      // Plus assez de points → supprimer la zone entière
      zonesData.pop();
    }
    renderZones();
    return true;
  }

  currentZone.points.pop();
  if (currentZone.points.length === 0) {
    const idx = zonesData.indexOf(currentZone);
    if (idx >= 0) zonesData.splice(idx, 1);
    currentZone = null;
  }
  renderZones();
  return true;
}

// =========================
// EXPORT / IMPORT
// =========================
window.getZones = function() {
  return zonesData;
};

window.setZones = function(zones) {
  zonesData = zones || [];
  currentZone = null;
  renderZones();
};

// Lecture seule : retourne la zone en cours de tracé (ou null si aucune
// zone active). Utilisé par interface.js pour fermer le mode quand une
// suppression vient d'effacer la zone en cours (cohérent avec getCurrentRoad).
window.getCurrentZone = function() {
  return currentZone || null;
};

// 🆕 v1.90.17 — Parité avec le tracé : préservation de currentZone à travers
// undo/redo (cf road.js getCurrentRoadIndex/setCurrentRoadByIndex). Sans ça,
// _applyState remettait modeZone à null au moindre Ctrl+Z (resetZones le wipe,
// setZones remet currentZone = null) → outil mort dès le 1er undo, continuation
// cassée, et pastille bloquée « allumée mais morte ». HistoryManager capture
// désormais l'index de la zone en cours et le restaure après _applyState.
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

// =========================
// EXPORT GLOBAL
// =========================
window.initZones             = initZones;
window.toggleZoneMode        = toggleZoneMode;
window.fermerZoneEnCours     = fermerZoneEnCours;
window.resetZones            = resetZones;
window.removeLastZone        = removeLastZone;
window.removeLastZonePoint   = removeLastZonePoint;
window.renderZones           = renderZones;
