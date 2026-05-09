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

function normaliserPoints(json) {
  if (Array.isArray(json.data))          return json.data;
  if (Array.isArray(json.editorPoints))  return json.editorPoints;
  return [];
}

const ROAD_STYLES_DATA = {
  principal:  { color: "#00ff00", weight: 5, opacity: 1 },
  secondaire: { color: "#b000ff", weight: 5, opacity: 1 },
  chemin:     { color: "#ffff00", weight: 5, opacity: 1 }
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
          marker.bindPopup(`<b>${p.nom}</b><br>${p.description || ""}`, window.KTA_POPUP_OPTS);
          marker.addTo(layer);
        }
        index = fin;
        if (index < points.length) {
          requestAnimationFrame(ajouterBatch);
        }
      }

      requestAnimationFrame(ajouterBatch);

      // Routes embarquées en lecture seule dans le même layer
      if (Array.isArray(json.roads) && json.roads.length > 0) {
        json.roads.forEach(function(road) {
          if (!road.points || road.points.length < 2) return;
          const style = ROAD_STYLES_DATA[road.type] || { color: "#ffffff", weight: 5, opacity: 1 };
          const latlngs = road.points.map(function(p) { return convertCoord(p.x, p.y); });
          L.polyline(latlngs, { ...style, interactive: false }).addTo(layer);
          // Enregistrer dans road.js pour que le calcul d'intersection (cercles aux croisements)
          // tienne compte de cette route, comme s'il s'agissait d'une route éditable
          if (typeof window.registerEmbeddedRoad === "function") {
            window.registerEmbeddedRoad(road);
          }
        });
      }

      // Zones embarquées en lecture seule dans le même layer
      // Tri : eau (arrière) → remblais → effondrement (avant)
      if (Array.isArray(json.zones) && json.zones.length > 0) {
        const ZONE_STYLES_DATA = {
          eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7, weight: 3, opacity: 1 },
          remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7, weight: 3, opacity: 1 },
          effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7, weight: 3, opacity: 1 }
        };
        const zonesTriees = [...json.zones].sort(function(a, b) {
          const ordre = { eau: 0, remblais: 1, effondrement: 2 };
          return (ordre[a.type] ?? 99) - (ordre[b.type] ?? 99);
        });
        zonesTriees.forEach(function(zone) {
          if (!zone.points || zone.points.length < 3) return;
          const style = ZONE_STYLES_DATA[zone.type] || ZONE_STYLES_DATA.remblais;
          const latlngs = zone.points.map(function(p) { return convertCoord(p.x, p.y); });
          L.polygon(latlngs, { ...style, interactive: false }).addTo(layer);
        });
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
      eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7, weight: 3, opacity: 1 },
      remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7, weight: 3, opacity: 1 },
      effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7, weight: 3, opacity: 1 }
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

          // Zones embarquées (arrière-plan) — triées eau → remblais → effondrement
          if (Array.isArray(json.zones) && json.zones.length > 0) {
            const ordreZ = { eau: 0, remblais: 1, effondrement: 2 };
            [...json.zones].sort(function(a, b) {
              return (ordreZ[a.type] ?? 99) - (ordreZ[b.type] ?? 99);
            }).forEach(function(z) {
              drawPolygon(z.points || [], ZONE_STYLES_EMBED[z.type] || ZONE_STYLES_EMBED.remblais);
              _diag.embZones++;
            });
          }

          // Routes embarquées
          if (Array.isArray(json.roads) && json.roads.length > 0) {
            json.roads.forEach(function(r) {
              if (!r.points || r.points.length < 2) return;
              drawPolyline(r.points, ROAD_STYLES_EMBED[r.type] || { color: "#ffffff", weight: 5, opacity: 1 });
              allRoadsForIntersect.push(r);
              _diag.embRoads++;
            });
          }

          // Markers DIFFÉRÉS (au lieu de drawPoint immédiat)
          const points = json.data || [];
          for (const point of points) {
            deferredMarkers.push(point);
            _diag.embPoints++;
          }
        }
      }
    }
    if (_debug) console.log("[Export rapide] résumé layer loop :", _diag);

    // ---------- zones (avant les tracés pour qu'elles soient en arrière-plan) ----------
    const zones = window.getZones ? window.getZones() : [];
    const ZONE_STYLES_EXPORT = {
      remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7, weight: 3, opacity: 1 },
      effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7, weight: 3, opacity: 1 }
    };
    for (const zone of [...zones].sort(function(a, b) {
      const ordre = { remblais: 0, effondrement: 1 };
      return (ordre[a.type] ?? 99) - (ordre[b.type] ?? 99);
    })) {
      const style = ZONE_STYLES_EXPORT[zone.type] || ZONE_STYLES_EXPORT.remblais;
      drawPolygon(zone.points || [], style);
    }

    // ---------- routes ----------
    const roads = window.getRoads ? window.getRoads() : [];
    const ROAD_STYLES = {
      principal:   { color: "#00ff00", weight: 5, opacity: 1 },
      secondaire:  { color: "#b000ff", weight: 5, opacity: 1 },
      chemin:      { color: "#ffff00", weight: 5, opacity: 1 }
    };

    for (const road of roads) {
      drawPolyline(road.points || [], ROAD_STYLES[road.type] || { color: "white", weight: 5, opacity: 1 });
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
    // Promesse autour de toBlob pour que l'appelant (modale Export) puisse await
    // proprement et voir le succès ou l'échec — sinon le download ratait silencieusement.
    await new Promise(function(resolve, reject) {
      canvas.toBlob(function(blob) {
        if (!blob) {
          reject(new Error("canvas.toBlob a retourné null (image trop grande ?)"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = (config.plan.name || "plan") + "_complet.png";
        link.click();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        resolve();
      }, "image/png");
    });

  } catch (err) {
    // Re-throw pour que l'appelant (modale Export) affiche l'erreur dans son zone
    // dédiée plutôt qu'un alert qui peut être masqué par la fermeture de la modale.
    console.error("[Export rapide] ERREUR :", err);
    throw err;
  }
}

window.telechargerPlan = telechargerPlan;
