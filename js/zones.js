/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// zones.js — tracé des zones polygonales remplies (eau, remblais, effondrement, inaccessible, pente, cust-…).
// Fermeture : re-clic sur le 1er sommet (≥ 3 sommets) ou bouton « Fermer la zone ».
// Expose : window.initZones, toggleZoneMode, getZones/setZones, getCurrentZone(Index), …
// 🩸 La zone INACCESSIBLE bloque le pathfinder (segment qui traverse le polygone retiré du graphe) ; ses
//   hachures sont un CanvasPattern (styleResolver.js) sur le canvas commun : elle passe sous les structures.
// ⚠️ Empilement : eau < remblais < effondrement < inaccessible < structures (structures.js >
//   ktaStructuresAuDessus, rappelé après chaque rendu).
// ⚠️ Plusieurs niveaux : `niveaux` (⊇ level, poiJonction.js > ktaNiveauxObjet), saisis dans la fiche de la zone
//   (utils.js > attacherNotePopup) ; un seul polygone, affiché si l'un de ses niveaux est visible.
// ⚠️ Zone jonction (type `pente`, multi-niveau) : créée « du niveau … au niveau … » (interfaceConfig.js >
//   _ouvrirCreationJonction, `window._zonePenteMeta`) : `level` = départ, `niveaux` = [départ, arrivée]. L'ancien
//   marqueur `jonction: true` est converti en type `pente` à l'entrée (ktaZoneJonctionEnType).
// Styles : window.ktaResolveStyle (styleResolver.js), jamais de table locale.
// Garde-fou : scripts/check-filets-donnees.js, check-uid.js, check-style-canon.js, check-zones-niveaux.js

window.modeZone = null; // null | "remblais" | "effondrement" | "eau" | "inaccessible" | "pente" | "cust-…"

let zonesData = [];
let currentZone = null;
let zoneLayers = [];      // polygones fermés (remplis)
let previewLayer = null;  // polyline pointillée pendant le tracé

// Tolérance du re-clic sur le 1er sommet : utils.js > ktaToleranceFermeture (mètres du plan, plancher en px d'écran).

// ── Styles ──────────────────────────────
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

// Niveaux d'une zone : règle commune points / zones (poiJonction.js > ktaNiveauxObjet).
function _niveauxZone(zone) {
  if (typeof window.ktaNiveauxObjet === "function") return window.ktaNiveauxObjet(zone);
  return [Number.isInteger(zone && zone.level) ? zone.level : 0];
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

  zoneLayers.forEach(function(l) { window.ktaRetirerCalque(l); });
  zoneLayers = [];

  window.ktaRetirerCalque(previewLayer);
  previewLayer = null;

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
                  : window.modeZone === "pente" ? "Jonction"
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
        // Zone jonction : les deux niveaux choisis avant d'armer l'outil (gardés tant qu'il reste armé).
        const meta = window.modeZone === "pente" ? window._zonePenteMeta : null;
        if (meta && Number.isInteger(meta.fromLevel) && Number.isInteger(meta.toLevel) &&
            meta.fromLevel !== meta.toLevel) {
          currentZone.level = meta.fromLevel;
          currentZone.niveaux = [meta.fromLevel, meta.toLevel].sort(function(a, b) { return a - b; });
        }
      }
      if (window.KtaUid) window.KtaUid.ensure(currentZone, "zn");
      zonesData.push(currentZone);
    }

    if (currentZone.points.length >= 3) {
      const p0 = currentZone.points[0];
      const dx = x - p0.x;
      const dy = y - p0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const tol = typeof window.ktaToleranceFermeture === "function" ? window.ktaToleranceFermeture(e) : 5;
      if (dist <= tol) {
        fermerZoneEnCours();
        if (window.HistoryManager && _historyBefore) {
          window.HistoryManager.record(window.I18n.t("history.action.closeZone", { type: _typeLabel }), _historyBefore, "zones");
        }
        // L'outil reste armé (décision produit) : le clic suivant commence une nouvelle zone du même type,
        // pour enchaîner sans retoucher l'icône ; retoucher l'icône l'éteint.
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
        : type === "pente" ? "Jonction"
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
// Filtres d'affichage d'une zone, lus par renderZones et par l'ajustement des sommets (ktaFormesAjustables) :
// un de ses niveaux visible (_niveauxZone : `niveaux`, sinon `level`, sinon 0 ; un seul polygone pour tous), état
// d'une extension (ktaExtensions.js > filtrerEtats), types du FilterPanel.
// 🩸 La zone en cours de tracé passe toujours (comme road.js > _tracePasseFiltres).
function _zonePasseFiltres(zone) {
  if (zone === currentZone) return true;
  const cfg = window.APP_CONFIG || {};
  if (cfg.multiLevel === true) {
    const vis = Array.isArray(cfg.visibleLevels) ? cfg.visibleLevels : [0];
    if (!_niveauxZone(zone).some(function(n) { return vis.indexOf(n) >= 0; })) return false;
  }
  if (window.KtaExtensions && typeof window.KtaExtensions.passeFiltreEtat === "function" &&
      !window.KtaExtensions.passeFiltreEtat(zone)) return false;
  const f = window._ktaRuntimeFilters;
  return !(f && f.zoneTypes && !f.zoneTypes.has(zone.type));
}

function renderZones() {
  if (typeof window.ktaSignalerDonneesPlan === "function") window.ktaSignalerDonneesPlan("zones");
  // 🩸 Retrait par le GROUPE (utils.js > ktaRetirerCalque), jamais l.remove() : chaque rendu laissait dans
  // layerEditor une copie entière des zones, remises sur la carte par ≡ décoché puis recoché.
  zoneLayers.forEach(function(l) { window.ktaRetirerCalque(l); });
  zoneLayers = [];

  window.ktaRetirerCalque(previewLayer);
  previewLayer = null;

  // Ordre d'empilement : jonction (voile en dessous : une autre zone posée dedans reste lisible), eau, remblais,
  // effondrement, inaccessible au-dessus des autres zones (elle bloque le pathfinder, elle doit se voir), toutes
  // sous les structures (rappel en fin de rendu).
  const ordreType = { pente: -1, eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
  const zonesAffichage = [...zonesData].sort(function(a, b) {
    const oa = ordreType[a.type] !== undefined ? ordreType[a.type] : 99;
    const ob = ordreType[b.type] !== undefined ? ordreType[b.type] : 99;
    return oa - ob;
  });

  const target = _zoneTarget();

  zonesAffichage.forEach(function(zone) {
    if (!zone.points || zone.points.length === 0) return;
    if (!_zonePasseFiltres(zone)) return;

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
      const polygonOpts = style;
      const polygon = L.polygon(latlngs, polygonOpts).addTo(target);
      zoneLayers.push(polygon);
      // État donné par une extension (prise etatObjet) : pointillé ; sans prise, uid noté seulement.
      if (window.KtaExtensions && typeof window.KtaExtensions.marquerCouche === "function") {
        window.KtaExtensions.marquerCouche(polygon, zone.uid, polygonOpts.dashArray);
      }

      // Popup de note seulement hors mode édition : sinon le clic ouvre la popup ET ajoute un
      // sommet au tracé en cours (même règle que road.js / structures.js).
      if (typeof window.attacherNotePopup === "function" &&
          window._aucunModeEditionActif()) {
        const _zoneRef = zone;
        const _zoneEmojis = {
          eau:          "💧",
          remblais:     "⬛",
          effondrement: "🟥",
          inaccessible: "⛔",
          pente:        "🪜"
        };
        function _zonePopupTitle(t) {
          if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
            if (String(t).startsWith("cust-")) {
              const e = window.LegendCustomization.findCustomEntry(t);
              if (e) return e.label;
            }
            if (_zoneEmojis[t]) return window.LegendCustomization.getLabel("zones", t);
          }
          const LBL = {
            eau:          "💧 Eau",
            remblais:     "⬛ Remblais",
            effondrement: "🟥 Effondrement",
            inaccessible: "⛔ Inaccessible",
            pente:        "🪜 Zone Jonction"
          };
          return LBL[t] || ("Zone " + t);
        }
        window.attacherNotePopup(
          polygon,
          function() { return _zoneRef.description; },
          function(v) { _zoneRef.description = v; if (window.KtaUid) window.KtaUid.touch(_zoneRef); },
          function() { return _zonePopupTitle(_zoneRef.type); },
          // Reclassement depuis la popup (convertirObjet.js).
          { convertir: { famille: "zones", obj: _zoneRef }, pastille: { cat: "zones", cle: zone.type } }
        );
      }
    }
  });
  if (typeof window.ktaStructuresAuDessus === "function") window.ktaStructuresAuDessus();
}

// ── Reset complet ──────────────────────────────
function resetZones() {
  zonesData = [];
  currentZone = null;
  window.modeZone = null;

  zoneLayers.forEach(function(l) { window.ktaRetirerCalque(l); });
  zoneLayers = [];

  window.ktaRetirerCalque(previewLayer);
  previewLayer = null;
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

// ── Ancienne zone jonction (`jonction: true`) → type `pente` ──────────────────────────────
// Lecture tolérante d'une session, d'un plan-config, d'un calque ou d'un fichier d'avant le type dédié : une zone
// cochée « Zone jonction » sur au moins deux niveaux devient une zone `pente`, niveaux et uid gardés. Mutation en
// place, → true si l'objet a changé. Sur un seul niveau, le marqueur ne faisait rien : l'objet n'est pas touché.
// ⚠️ contrat (docs/ETUDE_UID.md) : JAMAIS de touch. C'est une relecture de la même donnée, pas une modification :
// un updatedAt remis à maintenant ferait gagner cette copie, à la fusion, sur une modification plus récente faite
// ailleurs (laquelle sera convertie à son tour en entrant).
function ktaZoneJonctionEnType(z) {
  if (!z || z.jonction !== true) return false;
  if (_niveauxZone(z).length < 2) return false;
  z.type = "pente";
  delete z.jonction;
  return true;
}
window.ktaZoneJonctionEnType = ktaZoneJonctionEnType;

// Générateur (import KMZ / SIG, type « Jonction » choisi pour des polygones) : les zones `pente` qui n'ont pas
// encore deux niveaux reçoivent « du niveau … au niveau … » saisis à l'import (`level` = de). → nombre posé.
window.ktaPoserNiveauxPente = function(zones, de, vers) {
  if (!Array.isArray(zones) || !Number.isInteger(de) || !Number.isInteger(vers) || de === vers) return 0;
  let n = 0;
  zones.forEach(function(z) {
    if (!z || z.type !== "pente" || _niveauxZone(z).length >= 2) return;
    z.level = de;
    z.niveaux = [de, vers].sort(function(a, b) { return a - b; });
    n++;
  });
  return n;
};

window.setZones = function(zones) {
  zonesData = zones || [];
  zonesData.forEach(ktaZoneJonctionEnType);
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

// ── Ajustement des sommets (js/ajusterSommets.js) ──────────────────────────────
// ⚠️ contrat : même forme que road.js > ktaFormesAjustables.roads. Zones de session visibles, hors zone en cours.
window.ktaFormesAjustables = window.ktaFormesAjustables || {};
window.ktaFormesAjustables.zones = {
  cat: "zones",
  objets: function() {
    return zonesData.filter(function(z) {
      return z && z !== currentZone && Array.isArray(z.points) && _zonePasseFiltres(z);
    });
  },
  ferme: function() { return true; },
  minimum: function() { return 3; },
  libelle: function(z) { return _labelTypeZone(z.type); },
  rendre: function() { renderZones(); }
};
