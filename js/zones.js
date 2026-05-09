// =========================
// ZONES POLYGONALES REMPLIES
// =========================
// Permet de tracer des zones fermées et remplies (remblais, effondrements)
// — fermeture par re-clic sur le 1er point OU par bouton "Fermer la zone"
// =========================

window.modeZone = null; // null | "remblais" | "effondrement"

let zonesData = [];
let currentZone = null;
let zoneLayers = [];      // polygones fermés (remplis)
let previewLayer = null;  // polyline pointillée pendant le tracé

// Tolérance en pixels pour détecter le re-clic sur le 1er point (en coords plan)
const CLOSE_TOLERANCE = 5;

// =========================
// STYLES
// =========================
const ZONE_STYLES = {
  eau:          {
    color:       "#0066aa",
    fillColor:   "#3aa9e8",
    fillOpacity: 0.7,
    weight:      3,
    opacity:     1
  },
  remblais:     {
    color:       "#3a3a44",
    fillColor:   "#5a5a68",
    fillOpacity: 0.7,
    weight:      3,
    opacity:     1
  },
  effondrement: {
    color:       "#cc0000",
    fillColor:   "#ff3333",
    fillOpacity: 0.7,
    weight:      3,
    opacity:     1
  }
};

const ZONE_STYLE_PREVIEW = {
  weight:    3,
  opacity:   1,
  dashArray: "8 5"
};

// =========================
// INIT
// =========================
function initZones() {
  // Reset complet (changement de plan)
  zonesData = [];
  currentZone = null;

  if (zoneLayers && zoneLayers.length) {
    zoneLayers.forEach(function(l) {
      try { window.map.removeLayer(l); } catch(e) {}
    });
  }
  zoneLayers = [];

  if (previewLayer) {
    try { window.map.removeLayer(previewLayer); } catch(e) {}
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

    if (!currentZone) {
      currentZone = {
        type: window.modeZone,
        points: []
      };
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
        return;
      }
    }

    currentZone.points.push({ x: x, y: y });
    renderZones();
  });
}

// =========================
// ACTIVER / DÉSACTIVER UN TYPE
// =========================
function toggleZoneMode(type) {
  // Si on change de type alors qu'une zone est en cours, on la perd
  // (l'utilisateur doit explicitement fermer ou annuler)
  if (currentZone && window.modeZone !== type) {
    // Retirer la zone non fermée
    const idx = zonesData.indexOf(currentZone);
    if (idx >= 0) zonesData.splice(idx, 1);
    currentZone = null;
  }

  if (window.modeZone === type) {
    // Désactivation du même type → annule la zone en cours si pas fermée
    if (currentZone) {
      const idx = zonesData.indexOf(currentZone);
      if (idx >= 0) zonesData.splice(idx, 1);
      currentZone = null;
    }
    window.modeZone = null;
  } else {
    window.modeZone = type;
    currentZone = null;
  }

  renderZones();
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
  // Vider les layers existants
  zoneLayers.forEach(function(l) { window.map.removeLayer(l); });
  zoneLayers = [];

  if (previewLayer) {
    window.map.removeLayer(previewLayer);
    previewLayer = null;
  }

  // Trier l'affichage : eau d'abord (en arrière), puis remblais, puis effondrements (au-dessus)
  // — la zone en cours reste à sa position pour éviter qu'elle saute pendant le tracé
  const ordreType = { eau: 0, remblais: 1, effondrement: 2 };
  const zonesAffichage = [...zonesData].sort(function(a, b) {
    // currentZone garde sa priorité naturelle de tracé (en dernier dans le tableau)
    const oa = ordreType[a.type] !== undefined ? ordreType[a.type] : 99;
    const ob = ordreType[b.type] !== undefined ? ordreType[b.type] : 99;
    return oa - ob;
  });

  // Pour chaque zone, déterminer si elle est fermée (= pas la zone courante)
  zonesAffichage.forEach(function(zone) {
    if (!zone.points || zone.points.length === 0) return;

    const latlngs = zone.points.map(function(p) { return convertCoord(p.x, p.y); });
    const style = ZONE_STYLES[zone.type] || ZONE_STYLES.remblais;

    if (zone === currentZone) {
      // Zone en cours de tracé → polyline pointillée (aperçu)
      if (zone.points.length >= 1) {
        const previewStyle = Object.assign({}, ZONE_STYLE_PREVIEW, {
          color: style.color
        });
        previewLayer = L.polyline(latlngs, previewStyle).addTo(window.map);

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
          }).addTo(window.map);
          zoneLayers.push(marker);
        }
      }
    } else {
      // Zone fermée → polygone rempli
      const polygon = L.polygon(latlngs, style).addTo(window.map);
      zoneLayers.push(polygon);
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

  zoneLayers.forEach(function(l) { window.map.removeLayer(l); });
  zoneLayers = [];

  if (previewLayer) {
    window.map.removeLayer(previewLayer);
    previewLayer = null;
  }
}

// =========================
// SUPPRIMER LA DERNIÈRE ZONE FERMÉE
// =========================
function removeLastZone() {
  // Trouver la dernière zone fermée (différente de currentZone)
  for (let i = zonesData.length - 1; i >= 0; i--) {
    if (zonesData[i] !== currentZone) {
      zonesData.splice(i, 1);
      renderZones();
      return true;
    }
  }
  return false;
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
