/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.is-underground.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}

function choisirIcone(p) {
  // Map dynamique : essayer les tags d'abord
  if (p.tags && p.tags.length && window._iconMap) {
    for (const tag of p.tags) {
      if (window._iconMap[tag]) return window._iconMap[tag];
    }
  }

  // Fallback 1 : icône default du _iconMap
  if (window._iconMap && window._iconMap.default) return window._iconMap.default;

  // Fallback 2 : variable globale iconeDefault
  if (window.iconeDefault) return window.iconeDefault;

  // Fallback 3 : pin Leaflet natif
  console.warn("[choisirIcone] Aucune icône disponible — pin Leaflet natif");
  return new L.Icon.Default();
}

// Récupère l'URL réelle de l'icône à utiliser pour un point donné, avec cascade complète :
//   1. PLAN_CONFIG.icons[tag] (déclaré dans le plan-config)
//   2. _iconMap[tag].options.iconUrl  (fallback built-in défini dans map.js > TAGS_BUILTIN)
//   3. PLAN_CONFIG.icons.default
//   4. _iconMap.default.options.iconUrl
//   5. null (l'appelant fera son propre fallback ex: pin Leaflet)
//
// Utilisé par : recherche, export PNG, et tout endroit qui a besoin d'une URL et pas d'un L.icon
function getIconUrlForPoint(point) {
  const planIcons = (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) || {};
  const map       = window._iconMap || {};

  function urlFromMapEntry(entry) {
    if (entry && entry.options && entry.options.iconUrl) return entry.options.iconUrl;
    return null;
  }

  if (point && Array.isArray(point.tags)) {
    for (const tag of point.tags) {
      if (planIcons[tag]) return planIcons[tag];
      const u = urlFromMapEntry(map[tag]);
      if (u) return u;
    }
  }

  if (planIcons.default) return planIcons.default;
  return urlFromMapEntry(map.default);
}
window.getIconUrlForPoint = getIconUrlForPoint;

// =========================
// FORMAT DE DISTANCE — m / km adaptatif
// =========================
// Reçoit une distance en mètres et retourne une string formatée :
// - < 1000 m → "X.X m" (decimalsM décimales, défaut 1)
// - ≥ 1000 m → "X.XX km" (toujours 2 décimales, soit ~10 m de précision)
// Utilisé par les 3 outils de mesure (📐 Mesure simple, 📏 Distance totale,
// 🗺️ Itinéraire) pour un affichage cohérent et lisible.
function formatDistance(distM, decimalsM) {
  if (typeof distM !== "number" || isNaN(distM)) return "—";
  if (distM >= 1000) {
    return (distM / 1000).toFixed(2) + " km";
  }
  const dec = (typeof decimalsM === "number") ? decimalsM : 1;
  return distM.toFixed(dec) + " m";
}
window.formatDistance = formatDistance;

// =========================
// HTML POPUP D'UN POINT — helper commun (editor + embedded)
// =========================
// Construit le HTML d'une popup Leaflet pour un point, avec 2 boutons :
//   🧭 Y aller — calcule l'itineraire depuis la position tracker vers ce point
//   ➕ Itinéraire — ajoute ce point comme waypoint de l'itineraire
// Wire-up via onclick inline (window.itineraireYAller / window.itineraireAjouterWaypoint
// dans interface.js). Echappement HTML/string strict pour eviter les injections
// si un point a un nom avec apostrophe ou guillemet.
function buildPointPopupHtml(point, isEditorSession) {
  const nom  = String(point.nom || "(sans nom)");
  const desc = String(point.description || "");
  // Echappement HTML pour le contenu affiche
  const safeName = nom.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeDesc = desc.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Echappement string JS pour le 'nom' passe en argument inline (entre apostrophes)
  const jsName = nom.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " ");
  const id     = String(point.id || "");
  const jsId   = id.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " ");
  const x = Number(point.x) || 0;
  const y = Number(point.y) || 0;

  // Bouton Supprimer : visible UNIQUEMENT pour les points de la session
  // utilisateur en cours (listePoints). Detection via le 2eme argument
  // isEditorSession passe explicitement par le caller :
  //   - editor.js > _ajouterMarker     → true  (point session, supprimable)
  //   - utils.js > ajouterPointsDepuisJSON → false (data layer, lecture seule)
  // ⚠️ NE PAS se baser sur point.source === "editor" : un point converti
  // session → data via Conversion garde "source: editor" dans le JSON, le
  // test serait trompeur → bouton affiche mais supprimerPointEditor ne
  // trouve rien dans listePoints → erreur silencieuse.
  const showDelete = isEditorSession === true;
  const deleteRow = showDelete
    ? '<div class="kta-popup-actions kta-popup-actions-danger">' +
        '<button class="kta-popup-btn kta-popup-btn-delete" type="button" ' +
          'onclick="window.supprimerPointEditor(\'' + jsId + "'," + x + ',' + y + '); return false;" ' +
          'title="Supprimer définitivement ce point de ta session">' +
          '🗑️ Supprimer ce point' +
        '</button>' +
      '</div>'
    : '';

  return '<div class="kta-popup-point">' +
           '<b>' + safeName + '</b>' +
           (safeDesc ? '<br><span class="kta-popup-desc">' + safeDesc + '</span>' : '') +
           '<div class="kta-popup-actions">' +
             '<button class="kta-popup-btn kta-popup-btn-here" type="button" ' +
               'onclick="window.recalerTrackerSurPoint(' + x + ',' + y + '); return false;" ' +
               'title="Recale ta position tracker sur ce point (équivalent du mode recalage)">' +
               '📍 Je suis ici' +
             '</button>' +
             '<button class="kta-popup-btn kta-popup-btn-aller" type="button" ' +
               'onclick="window.itineraireYAller(' + x + ',' + y + ",'" + jsName + "'); return false;\" " +
               'title="Calcule un itinéraire depuis ta position tracker vers ce point">' +
               '🧭 Y aller' +
             '</button>' +
             '<button class="kta-popup-btn kta-popup-btn-add" type="button" ' +
               'onclick="window.itineraireAjouterWaypoint(' + x + ',' + y + ",'" + jsName + "'); return false;\" " +
               'title="Ajoute ce point comme waypoint d\'un itinéraire">' +
               '➕ Itinéraire' +
             '</button>' +
           '</div>' +
           deleteRow +
         '</div>';
}
window.buildPointPopupHtml = buildPointPopupHtml;

function normaliserPoints(json) {
  if (Array.isArray(json.data))          return json.data;
  if (Array.isArray(json.editorPoints))  return json.editorPoints;
  return [];
}

// smoothFactor 2.5 : Leaflet simplifie en interne via Douglas-Peucker.
// Reduit le nombre de points dessines au pan/zoom (gain perf significatif
// sur les plans avec beaucoup de routes embedded), perte visuelle quasi
// imperceptible aux niveaux de zoom usuels. Cf. ROAD_STYLES de road.js.
const ROAD_STYLES_DATA = {
  principal:  { color: "#00ff00", weight: 5, opacity: 1, smoothFactor: 2.5 },
  secondaire: { color: "#b000ff", weight: 5, opacity: 1, smoothFactor: 2.5 },
  chemin:     { color: "#ffff00", weight: 5, opacity: 1, smoothFactor: 2.5 }
};

// 🏗️ Multi-niveau (v148) : registres globaux de TOUS les objets Leaflet des
// data layers pour appliquer le filtre runtime sans refetch. Vides a chaque
// initDataFromConfig (reset cote main.js au plan switch).
//   _ktaDataMarkers   : markers (L.marker)        — setOpacity + pointer-events
//   _ktaDataPolylines : roads embarques (polyline) — setStyle({opacity})
//   _ktaDataPolygons  : zones embarques (polygon)  — setStyle({opacity, fillOpacity})
window._ktaDataMarkers   = window._ktaDataMarkers   || [];
window._ktaDataPolylines = window._ktaDataPolylines || [];
window._ktaDataPolygons  = window._ktaDataPolygons  || [];

// Helper commun : retourne true si le level passe le filtre courant.
// MultiLevel OFF → tout visible. ON → visible ssi level ∈ visibleLevels.
function _passeFiltreDataLevel(lvl) {
  const multi = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  if (!multi) return true;
  const visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
    ? window.APP_CONFIG.visibleLevels : [0];
  return visibles.indexOf(Number.isInteger(lvl) ? lvl : 0) >= 0;
}

// === MARKERS data layers ===
function _filtreNiveauSurMarkerData(marker) {
  if (!marker) return;
  const visible = _passeFiltreDataLevel(marker._ktaLevel);
  try { marker.setOpacity(visible ? 1 : 0); } catch(e) {}
  if (marker._icon) marker._icon.style.pointerEvents = visible ? "" : "none";
}
window._applyLevelFilterToDataPoints = function() {
  if (!Array.isArray(window._ktaDataMarkers)) return;
  window._ktaDataMarkers.forEach(_filtreNiveauSurMarkerData);
};

// === POLYLINES data layers (routes embarquees) ===
// On stocke l'opacite originale du tracé pour pouvoir la restaurer quand le
// filtre redevient visible (sinon on perdrait l'opacite si elle est < 1).
function _filtreNiveauSurPolylineData(entry) {
  if (!entry || !entry.polyline) return;
  const visible = _passeFiltreDataLevel(entry.level);
  try {
    entry.polyline.setStyle({ opacity: visible ? entry.origOpacity : 0 });
  } catch(e) {}
}
window._applyLevelFilterToDataRoads = function() {
  if (!Array.isArray(window._ktaDataPolylines)) return;
  window._ktaDataPolylines.forEach(_filtreNiveauSurPolylineData);
};

// === POLYGONS data layers (zones embarquees) ===
function _filtreNiveauSurPolygonData(entry) {
  if (!entry || !entry.polygon) return;
  const visible = _passeFiltreDataLevel(entry.level);
  try {
    entry.polygon.setStyle({
      opacity:     visible ? entry.origOpacity     : 0,
      fillOpacity: visible ? entry.origFillOpacity : 0
    });
  } catch(e) {}
}
window._applyLevelFilterToDataZones = function() {
  if (!Array.isArray(window._ktaDataPolygons)) return;
  window._ktaDataPolygons.forEach(_filtreNiveauSurPolygonData);
};

// =========================
// 🌍 GETTERS PUBLICS — embedded zones (data layers)
// =========================
// Symetrique de window.getAllEmbeddedRoads (road.js) : expose les zones
// embarquees dans les data layers (puits.json, etc.) sous forme reutilisable
// par les exports (notamment KMZ qui doit inclure TOUT le contenu visible
// du plan, pas uniquement la session).
// Renvoie [{type, points, level}, ...] — meme format que window.getZones()
// (zones session) pour permettre une concatenation directe sans transformation.
window.getAllEmbeddedZones = function() {
  if (!Array.isArray(window._ktaDataPolygons)) return [];
  return window._ktaDataPolygons
    .filter(function(e) {
      return e && e.type && Array.isArray(e.points) && e.points.length >= 3;
    })
    .map(function(e) {
      return { type: e.type, points: e.points, level: e.level || 0 };
    });
};

function ajouterPointsDepuisJSON(url, layer) {
  fetch(url)
    .then(res => res.json())
    .then(json => {
      const points = normaliserPoints(json);

      // Ajout par batch de 50 pour éviter de freezer le thread UI
      const BATCH = 50;
      let index = 0;

      function ajouterBatch() {
        const fin = Math.min(index + BATCH, points.length);
        for (let i = index; i < fin; i++) {
          const p = points[i];
          var marker = L.marker(convertCoord(p.x, p.y), { icon: choisirIcone(p) });
          // 🚀 PerfUltra noTooltips : skip le bindPopup sur les markers de
          // data layers (read-only). Les points de session éditeur restent
          // interactifs. Gain : event listener + popup HTML init en moins
          // par marker, multiplié par des milliers de points sur gros plans.
          // Compromis : user doit utiliser 🔍 Recherche pour interagir avec.
          const _skipPopup = !!(window.PerfUltra && window.PerfUltra.get("noTooltips"));
          if (!_skipPopup) {
            // Popup avec boutons "Y aller" / "Itinéraire" — helper commun.
            // 2e argument false → point d'un data layer (lecture seule), pas
            // de bouton "🗑️ Supprimer" affiche.
            const popupHtml = (typeof window.buildPointPopupHtml === "function")
              ? window.buildPointPopupHtml(p, false)
              : ("<b>" + (p.nom || "") + "</b><br>" + (p.description || ""));
            marker.bindPopup(popupHtml, window.KTA_POPUP_OPTS);
          }

          // 🏗️ Multi-niveau (v148) : si le point JSON contient un champ
          // `level`, on le stocke sur le marker pour le filtre runtime.
          // Absent (cas usuel sur plans v147) → traite comme level 0.
          marker._ktaLevel = Number.isInteger(p.level) ? p.level : 0;
          // 🌍 v169 (Karma_dev) : on stocke aussi nom + tags + id pour que
          // KmzExport puisse construire les Placemarks KML (label + style icone).
          // Sans ça, les data layers sortiraient anonymes dans le KMZ.
          marker._ktaNom  = p.nom || "";
          marker._ktaId   = p.id  || "";
          marker._ktaTags = Array.isArray(p.tags) ? p.tags : [];
          window._ktaDataMarkers.push(marker);
          _filtreNiveauSurMarkerData(marker);  // applique le filtre courant

          marker.addTo(layer);
        }
        index = fin;
        if (index < points.length) {
          requestAnimationFrame(ajouterBatch);
        }
      }

      requestAnimationFrame(ajouterBatch);

      // Routes embarquées en lecture seule dans le même layer.
      // 🏗️ v169 (Karma_dev) : tri Z-index ascending par level si multiLevel ON.
      // Cohérent avec le tri dans road.js > renderRoads — "galerie niveau N
      // toujours sous celles du niveau N+1". Au sein du même niveau :
      // chemin < secondaire < principal (Principal dessus). Si multiLevel OFF
      // → ordre d'origine du JSON conservé (v147 strict).
      if (Array.isArray(json.roads) && json.roads.length > 0) {
        const _mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
        let roadsToRender = json.roads;
        if (_mlOn) {
          const TYPE_ORDER = { chemin: 0, secondaire: 1, principal: 2 };
          roadsToRender = [...json.roads].sort(function(a, b) {
            const la = Number.isInteger(a.level) ? a.level : 0;
            const lb = Number.isInteger(b.level) ? b.level : 0;
            if (la !== lb) return la - lb;  // bas en-dessous, haut au-dessus
            return (TYPE_ORDER[a.type] != null ? TYPE_ORDER[a.type] : 99) -
                   (TYPE_ORDER[b.type] != null ? TYPE_ORDER[b.type] : 99);
          });
        }
        roadsToRender.forEach(function(road) {
          if (!road.points || road.points.length < 2) return;
          const style = ROAD_STYLES_DATA[road.type] || { color: "#ffffff", weight: 5, opacity: 1 };
          const latlngs = road.points.map(function(p) { return convertCoord(p.x, p.y); });
          const polyline = L.polyline(latlngs, { ...style, interactive: false }).addTo(layer);
          // 🏗️ Multi-niveau (v148) : registre pour filtre runtime. Si le JSON
          // de la route contient un champ `level`, on l'utilise. Sinon = 0.
          const entry = {
            polyline:    polyline,
            level:       Number.isInteger(road.level) ? road.level : 0,
            origOpacity: style.opacity ?? 1
          };
          window._ktaDataPolylines.push(entry);
          _filtreNiveauSurPolylineData(entry);  // applique le filtre courant
          // Enregistrer dans road.js avec la référence au layerGroup du calque,
          // pour que les intersections se filtrent par visibilité (toggle calques).
          if (typeof window.registerEmbeddedRoad === "function") {
            window.registerEmbeddedRoad(road, layer);
          }
        });
      }

      // Zones embarquées en lecture seule dans le même layer
      // Tri : eau (arrière) → remblais → effondrement (avant)
      if (Array.isArray(json.zones) && json.zones.length > 0) {
        const ZONE_STYLES_DATA = {
          eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7, weight: 3, opacity: 1 },
          remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7, weight: 3, opacity: 1 },
          effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7, weight: 3, opacity: 1 },
          // 🚫 v169 : zone inaccessible — pattern hachures rouge/noir 45° (id
          // SVG defini dans index.html). Force renderer SVG (canvas ignore).
          inaccessible: { color: "#5a0a0a", fillColor: "url(#kta-pattern-inaccessible)", fillOpacity: 1, weight: 3, opacity: 1 }
        };
        const zonesTriees = [...json.zones].sort(function(a, b) {
          const ordre = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
          return (ordre[a.type] ?? 99) - (ordre[b.type] ?? 99);
        });
        // v169 : singleton SVG renderer pour les zones inaccessibles data layer.
        // Cree une seule fois et reutilise pour tous les polygons inaccessibles
        // de tous les data layers.
        if (!window._inaccessibleDataRenderer) {
          window._inaccessibleDataRenderer = L.svg({ padding: 0.5 });
        }
        zonesTriees.forEach(function(zone) {
          if (!zone.points || zone.points.length < 3) return;
          const style = ZONE_STYLES_DATA[zone.type] || ZONE_STYLES_DATA.remblais;
          const latlngs = zone.points.map(function(p) { return convertCoord(p.x, p.y); });
          const polyOpts = (zone.type === "inaccessible")
            ? Object.assign({}, style, { interactive: false, renderer: window._inaccessibleDataRenderer })
            : Object.assign({}, style, { interactive: false });
          const polygon = L.polygon(latlngs, polyOpts).addTo(layer);
          // 🏗️ Multi-niveau (v148) : registre pour filtre runtime.
          // 🚫 v169 (Karma_dev) : on stocke aussi `type` et `points` (coords
          // plan x/y) pour que Pathfinder puisse identifier les zones
          // inaccessibles dans les data layers et les utiliser comme contrainte
          // dure (= polygon bloque les segments qui le traversent).
          const entry = {
            polygon:         polygon,
            type:            zone.type,
            points:          zone.points,
            level:           Number.isInteger(zone.level) ? zone.level : 0,
            origOpacity:     style.opacity     ?? 1,
            origFillOpacity: style.fillOpacity ?? 0.7
          };
          window._ktaDataPolygons.push(entry);
          _filtreNiveauSurPolygonData(entry);
        });
      }

      // 🏗️ v154 : auto-extension de availableLevels si le data layer contient
      // des items au-dela du range default. Les roads et zones sont deja
      // inscrites synchroniquement ; les markers le sont par batches async,
      // mais le 1er batch suffit dans 99% des cas (les niveaux extremes sont
      // rarement isoles en fin de JSON). Si vraiment necessaire, l'user peut
      // toujours etendre manuellement via les boutons +/- de la modale.
      if (typeof window._etendreAvailableLevelsSiBesoin === "function") {
        try { window._etendreAvailableLevelsSiBesoin(); } catch(e) {}
      }
    })
    .catch(function(err) {
      console.warn("[Data] Erreur chargement", url, err);
    });
}

async function telechargerPlan() {
  try {
    const config = window.PLAN_CONFIG;
    if (!config || !config.plan) {
      alert("Configuration du plan introuvable");
      return;
    }

    const width = config.plan.imageWidth;
    const height = config.plan.imageHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // fond blanc optionnel
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // ---------- helpers ----------
    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Impossible de charger : " + src));
        img.src = src;
      });
    }

    function toCanvasY(y) {
      return y;
    }

    function drawMarkerImage(img, x, y, w, h, anchorX, anchorY) {
      ctx.drawImage(img, x - anchorX, toCanvasY(y) - anchorY, w, h);
    }

    function drawPolyline(points, style) {
      if (!points || points.length === 0) return;

      ctx.save();
      ctx.strokeStyle = style.color || "white";
      ctx.lineWidth = style.weight || 3;
      ctx.globalAlpha = style.opacity ?? 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.beginPath();
      ctx.moveTo(points[0].x, toCanvasY(points[0].y));

      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, toCanvasY(points[i].y));
      }

      ctx.stroke();
      ctx.restore();
    }

    function isLayerVisible(layer) {
      return window.map && layer && window.map.hasLayer(layer);
    }

    // ---------- image principale ----------
    const baseImg = await loadImage(config.plan.baseImage);
    ctx.drawImage(baseImg, 0, 0, width, height);

    // ---------- overlays image visibles ----------
    if (config.imageLayers && Array.isArray(config.imageLayers)) {
      const sortedImageLayers = [...config.imageLayers].sort((a, b) => a.order - b.order);

      for (const layerConfig of sortedImageLayers) {
        // on essaye de retrouver l'overlay Leaflet visible
        let leafletLayerVisible = false;

        if (window.map) {
          window.map.eachLayer(layer => {
            if (
              layer instanceof L.ImageOverlay &&
              layer._url === layerConfig.file &&
              window.map.hasLayer(layer)
            ) {
              leafletLayerVisible = true;
            }
          });
        }

        // si visible dans la carte on le dessine
        if (leafletLayerVisible) {
          const overlayImg = await loadImage(layerConfig.file);
          ctx.drawImage(overlayImg, 0, 0, width, height);
        }
      }
    }

    // ---------- icônes ----------
    const iconCache = {};

    async function getIconForPoint(point) {
      // Cascade complète : plan-config.icons[tag] → _iconMap[tag] → default → null
      let iconPath = getIconUrlForPoint(point);

      // Filet de sécurité ultime : icône par défaut classique
      if (!iconPath) iconPath = "lib/leaflet/images/marker-icon.png";

      if (!iconCache[iconPath]) {
        iconCache[iconPath] = await loadImage(iconPath);
      }

      return {
        img: iconCache[iconPath],
        path: iconPath
      };
    }

    async function drawPoint(point) {
      const { img } = await getIconForPoint(point);

      // Toutes les icônes sont en 50×50 avec ancrage centré
      drawMarkerImage(img, point.x, point.y, 50, 50, 25, 25);
    }

    // ---------- helpers polygones (pour zones) ----------
    function drawPolygon(points, style) {
      if (!points || points.length < 3) return;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, toCanvasY(points[0].y));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, toCanvasY(points[i].y));
      }
      ctx.closePath();

      // Remplissage
      ctx.fillStyle   = style.fillColor || style.color || "#888888";
      ctx.globalAlpha = style.fillOpacity ?? 0.35;
      ctx.fill();

      // Bordure
      ctx.strokeStyle = style.color || "#888888";
      ctx.lineWidth   = style.weight || 2;
      ctx.globalAlpha = style.opacity ?? 0.6;
      ctx.lineJoin    = "round";
      ctx.stroke();

      ctx.restore();
    }

    // ---------- couches JSON visibles ----------
    // Pour chaque calque : data[] (markers) + roads[] + zones[] embarqués
    // (cohérent avec ajouterPointsDepuisJSON qui les affiche à l'écran)
    const ZONE_STYLES_EMBED = {
      eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      // v169 : zone inaccessible — rouge fonce uni pour l'export PNG (canvas
      // ne supporte pas le pattern SVG inline ; on perd l'effet hachures mais
      // la signification "zone interdite" reste claire visuellement)
      inaccessible: { color: "#5a0a0a", fillColor: "#7a0000", fillOpacity: 0.65, weight: 3, opacity: 1 }
    };
    const ROAD_STYLES_EMBED = {
      principal:   { color: "#00ff00", weight: 5, opacity: 1 },
      secondaire:  { color: "#b000ff", weight: 5, opacity: 1 },
      chemin:      { color: "#ffff00", weight: 5, opacity: 1 }
    };

    // Collecte des routes (embedded + editable) pour dessiner les cercles d'intersection à la fin
    const allRoadsForIntersect = [];
    // Markers DIFFÉRÉS : collectés ici, dessinés APRÈS les routes + cercles
    // → respecte l'ordre ZONE → TRAIT → CERCLE → ICÔNE
    const deferredMarkers = []; // [{point, layerId}]

    // Compteurs diagnostic (activés si APP_CONFIG.debugMode)
    const _diag = { layersVisited: 0, layersSkipped: 0, embZones: 0, embRoads: 0, embPoints: 0, fetchFails: 0 };
    const _debug = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);

    if (config.dataLayers && Array.isArray(config.dataLayers)) {
      for (const layerConfig of config.dataLayers) {
        const leafletLayer = window.dataLayerGroups?.[layerConfig.id];
        const visible = !!(leafletLayer && isLayerVisible(leafletLayer));
        if (_debug) console.log("[Export rapide] layer", layerConfig.id, "→ visible:", visible, "groupExist:", !!leafletLayer);
        if (!visible) { _diag.layersSkipped++; continue; }
        _diag.layersVisited++;

        if (layerConfig.id === "editor") {
          const editorPoints = window.getEditorPoints ? window.getEditorPoints() : [];
          for (const point of editorPoints) {
            // 🏗️ Multi-niveau : WYSIWYG (filtre visibleLevels si actif)
            if (typeof window.passeFiltreNiveau === "function" && !window.passeFiltreNiveau(point)) continue;
            deferredMarkers.push(point);
          }
        } else {
          let json = null;
          try {
            const response = await fetch(layerConfig.file);
            json = await response.json();
          } catch (e) {
            _diag.fetchFails++;
            console.warn("[Export rapide] fetch échoué pour", layerConfig.id, "→", layerConfig.file, e);
            continue;
          }

          // Zones embarquées (arrière-plan) — triées eau → remblais → effondrement → inaccessible
          // 🏗️ Multi-niveau (v148) : WYSIWYG → filtre par visibleLevels si feature ON.
          if (Array.isArray(json.zones) && json.zones.length > 0) {
            const ordreZ = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
            [...json.zones].sort(function(a, b) {
              return (ordreZ[a.type] ?? 99) - (ordreZ[b.type] ?? 99);
            }).forEach(function(z) {
              if (typeof window.passeFiltreNiveau === "function" && !window.passeFiltreNiveau(z)) return;
              drawPolygon(z.points || [], ZONE_STYLES_EMBED[z.type] || ZONE_STYLES_EMBED.remblais);
              _diag.embZones++;
            });
          }

          // Routes embarquées
          // 🏗️ v169 (Karma_dev) : tri Z-index ascending par level si multiLevel ON.
          if (Array.isArray(json.roads) && json.roads.length > 0) {
            const _mlOnExp = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
            let roadsR = json.roads;
            if (_mlOnExp) {
              const T_ORDER = { chemin: 0, secondaire: 1, principal: 2 };
              roadsR = [...json.roads].sort(function(a, b) {
                const la = Number.isInteger(a.level) ? a.level : 0;
                const lb = Number.isInteger(b.level) ? b.level : 0;
                if (la !== lb) return la - lb;
                return (T_ORDER[a.type] != null ? T_ORDER[a.type] : 99) -
                       (T_ORDER[b.type] != null ? T_ORDER[b.type] : 99);
              });
            }
            roadsR.forEach(function(r) {
              if (!r.points || r.points.length < 2) return;
              if (typeof window.passeFiltreNiveau === "function" && !window.passeFiltreNiveau(r)) return;
              drawPolyline(r.points, ROAD_STYLES_EMBED[r.type] || { color: "#ffffff", weight: 5, opacity: 1 });
              allRoadsForIntersect.push(r);
              _diag.embRoads++;
            });
          }

          // Markers DIFFÉRÉS (au lieu de drawPoint immédiat)
          const points = json.data || [];
          for (const point of points) {
            if (typeof window.passeFiltreNiveau === "function" && !window.passeFiltreNiveau(point)) continue;
            deferredMarkers.push(point);
            _diag.embPoints++;
          }
        }
      }
    }
    if (_debug) console.log("[Export rapide] résumé layer loop :", _diag);

    // ---------- zones (avant les tracés pour qu'elles soient en arrière-plan) ----------
    // 🏗️ Multi-niveau : filtre par visibleLevels si actif (WYSIWYG export).
    const zones = (window.getZones ? window.getZones() : []).filter(function(z) {
      return typeof window.passeFiltreNiveau !== "function" || window.passeFiltreNiveau(z);
    });
    const ZONE_STYLES_EXPORT = {
      eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      // v169 : zone inaccessible — rouge fonce uni (canvas-only fallback, cf
      // commentaire dans ZONE_STYLES_EMBED ci-dessus pour le contexte hachures)
      inaccessible: { color: "#5a0a0a", fillColor: "#7a0000", fillOpacity: 0.65, weight: 3, opacity: 1 }
    };
    for (const zone of [...zones].sort(function(a, b) {
      const ordre = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
      return (ordre[a.type] ?? 99) - (ordre[b.type] ?? 99);
    })) {
      const style = ZONE_STYLES_EXPORT[zone.type] || ZONE_STYLES_EXPORT.remblais;
      drawPolygon(zone.points || [], style);
    }

    // ---------- routes ----------
    // ⚠️ On EXCLUT le type "itinerary" : c'est un calcul Pathfinder dérivé du
    // réseau, pas une vraie route. Sans ce filtre, le fallback "white" plus bas
    // dessinait l'itinéraire en blanc PAR-DESSUS les routes colorées sous-jacentes,
    // ce qui les "effaçait" visuellement dans l'export.
    // 🏗️ Multi-niveau : filtre WYSIWYG (jonctions visibles si fromLevel/toLevel ∈ visibles).
    // 🏗️ v169 : tri Z-index ascending par level si multiLevel ON (cohérent
    // avec road.js > renderRoads). Niveau bas en arrière, haut au-dessus.
    const roads = (window.getRoads ? window.getRoads() : [])
      .filter(function(r) { return r.type !== "itinerary"; })
      .filter(function(r) { return typeof window.passeFiltreNiveau !== "function" || window.passeFiltreNiveau(r); });
    const _mlOnExport = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    if (_mlOnExport) {
      const TYPE_ORDER = { chemin: 0, secondaire: 1, principal: 2, jonction: 3 };
      roads.sort(function(a, b) {
        const la = (a.type === "jonction")
          ? Math.max(Number.isInteger(a.fromLevel) ? a.fromLevel : 0,
                     Number.isInteger(a.toLevel)   ? a.toLevel   : 0)
          : (Number.isInteger(a.level) ? a.level : 0);
        const lb = (b.type === "jonction")
          ? Math.max(Number.isInteger(b.fromLevel) ? b.fromLevel : 0,
                     Number.isInteger(b.toLevel)   ? b.toLevel   : 0)
          : (Number.isInteger(b.level) ? b.level : 0);
        if (la !== lb) return la - lb;
        return (TYPE_ORDER[a.type] != null ? TYPE_ORDER[a.type] : 99) -
               (TYPE_ORDER[b.type] != null ? TYPE_ORDER[b.type] : 99);
      });
    }
    const ROAD_STYLES = {
      principal:   { color: "#00ff00", weight: 5, opacity: 1 },
      secondaire:  { color: "#b000ff", weight: 5, opacity: 1 },
      chemin:      { color: "#ffff00", weight: 5, opacity: 1 },
      // Jonction : magenta cohérent avec on-map render. Pas de dashArray dans
      // canvas (ctx.setLineDash requis) → plein pour l'export. Endpoints
      // marqués par des ronds blanc+magenta plus bas.
      jonction:    { color: "#ff4ecb", weight: 5, opacity: 1 }
    };

    for (const road of roads) {
      drawPolyline(road.points || [], ROAD_STYLES[road.type] || { color: "white", weight: 5, opacity: 1 });
      // 🏗️ Multi-niveau : ronds aux extremites des jonctions (parite avec on-map)
      // Convention export rapide : x direct + toCanvasY pour y.
      if (road.type === "jonction" && road.points && road.points.length >= 2) {
        const endpts = [road.points[0], road.points[road.points.length - 1]];
        endpts.forEach(function(pt) {
          ctx.save();
          ctx.fillStyle   = "#ffffff";
          ctx.strokeStyle = ROAD_STYLES.jonction.color;
          ctx.lineWidth   = 3;
          ctx.beginPath();
          ctx.arc(pt.x, toCanvasY(pt.y), 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
      }
      // Jonctions exclues du calcul d'intersection (pas de cercle de croisement
      // pour les bridges interniveau — cf. road.js logique de filtre).
      if (road.type === "jonction") continue;
      if (road.points && road.points.length >= 2) allRoadsForIntersect.push(road);
    }

    // ---------- cercles d'intersection (dessinés APRÈS toutes les routes, AVANT les icônes) ----------
    if (typeof window.computeRoadIntersections === "function" && allRoadsForIntersect.length >= 2) {
      const radius = window.ROAD_INTERSECTION_RADIUS || 8;
      const intersections = window.computeRoadIntersections(allRoadsForIntersect);
      intersections.forEach(function(it) {
        ctx.save();
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(it.point.x, toCanvasY(it.point.y), radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // ---------- markers DIFFÉRÉS (icônes) — dessinés EN DERNIER (au-dessus des traits + cercles)
    // → respecte l'ordre demandé : ZONE (en bas) → TRAIT → CERCLE → ICÔNE (en haut)
    // Chaque marker est try/catché individuellement : un icône qui rate à charger
    // ne doit PAS faire échouer l'ensemble de l'export (on perd un point, pas le plan).
    let _markerFails = 0;
    for (const point of deferredMarkers) {
      try {
        await drawPoint(point);
      } catch (e) {
        _markerFails++;
        if (_debug) console.warn("[Export rapide] drawPoint échoué pour", point.id || point.nom, e);
      }
    }
    if (_markerFails > 0) console.warn("[Export rapide]", _markerFails, "icône(s) sur", deferredMarkers.length, "n'ont pas pu être dessinées");

    // ---------- mesure ----------
    const measurePoints = window.getMeasurePoints ? window.getMeasurePoints() : [];
    drawPolyline(measurePoints, { color: "red", weight: 3, opacity: 1 });

    // ---------- tracker (chemin parcouru + position courante) ----------
    if (window.getTrackingPath) {
      const trackerPath = window.getTrackingPath();
      if (trackerPath && trackerPath.length > 1) {
        drawPolyline(trackerPath, { color: "#3388ff", weight: 3, opacity: 1 });
      }
    }
    if (window.getTrackingPosition) {
      const trackerPos = window.getTrackingPosition();
      if (trackerPos && typeof trackerPos.x === "number" && typeof trackerPos.y === "number") {
        try {
          const trackerImg = await loadImage(config.icons.track);
          drawMarkerImage(trackerImg, trackerPos.x, trackerPos.y, 50, 50, 25, 25);
        } catch (e) {
          console.warn("[Export rapide] icône tracker non chargée :", e);
        }
      }
    }

    // ---------- export ----------
    // Promesse autour de toBlob avec fallback JPEG si PNG échoue.
    //
    // POURQUOI le fallback : sur de gros plans (typiquement plans JPG en source —
    // souvent plus grands que les PNG car JPG compresse bien à l'upload),
    // l'encodage PNG du canvas final exige width × height × 4 bytes de RAM en
    // continu. Safari iOS / Chrome Android refusent au-delà de ~250-400 Mo
    // bruts (≈ 8000×8000 px) et retournent null silencieusement.
    //
    // JPEG est progressif (streamé bloc par bloc) et tolère des dimensions
    // bien plus grandes — on l'utilise comme fallback pour ne pas laisser
    // l'utilisateur avec une erreur cryptique alors qu'on peut produire un
    // fichier exploitable.
    function _exporter(mime, ext, quality) {
      return new Promise(function(resolve, reject) {
        canvas.toBlob(function(blob) {
          if (!blob) {
            reject(new Error("toBlob null pour " + mime));
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = (config.plan.name || "plan") + "_complet." + ext;
          link.click();
          setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
          resolve(mime);
        }, mime, quality);
      });
    }

    try {
      await _exporter("image/png", "png");
    } catch (errPng) {
      console.warn("[Export rapide] PNG a échoué — fallback JPEG :", errPng.message);
      try {
        await _exporter("image/jpeg", "jpg", 0.92);
        console.info("[Export rapide] fallback JPEG OK (plan trop grand pour PNG)");
      } catch (errJpg) {
        throw new Error(
          "Export impossible : le plan est trop grand pour être encodé par le navigateur " +
          "(PNG et JPEG ont tous deux échoué). Essaye le 🎨 Mode avancé avec une " +
          "résolution réduite (½ ou ¼) pour contourner la limite mémoire."
        );
      }
    }

  } catch (err) {
    // Re-throw pour que l'appelant (modale Export) affiche l'erreur dans son zone
    // dédiée plutôt qu'un alert qui peut être masqué par la fermeture de la modale.
    console.error("[Export rapide] ERREUR :", err);
    throw err;
  }
}

window.telechargerPlan = telechargerPlan;
