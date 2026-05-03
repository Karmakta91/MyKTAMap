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
          marker.bindPopup(`<b>${p.nom}</b><br>${p.description || ""}`);
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
      let iconPath = config.icons.default;

      // Parcourir les tags du point et prendre la première icône définie dans config.icons
      // — supporte n'importe quel tag personnalisé défini dans plan-config.json
      if (point.tags && point.tags.length) {
        for (const tag of point.tags) {
          if (config.icons[tag]) {
            iconPath = config.icons[tag];
            break;
          }
        }
      }

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

    // ---------- couches JSON visibles ----------
    if (config.dataLayers && Array.isArray(config.dataLayers)) {
      for (const layerConfig of config.dataLayers) {
        const leafletLayer = window.dataLayerGroups?.[layerConfig.id];
        if (!leafletLayer || !isLayerVisible(leafletLayer)) continue;

        if (layerConfig.id === "editor") {
          const editorPoints = window.getEditorPoints ? window.getEditorPoints() : [];
          for (const point of editorPoints) {
            await drawPoint(point);
          }
        } else {
          const response = await fetch(layerConfig.file);
          const json = await response.json();
          const points = json.data || [];

          for (const point of points) {
            await drawPoint(point);
          }
        }
      }
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
    }

    // ---------- mesure ----------
    const measurePoints = window.getMeasurePoints ? window.getMeasurePoints() : [];
    drawPolyline(measurePoints, { color: "red", weight: 3, opacity: 1 });

    // ---------- tracker ----------
    if (window.getTrackingPosition) {
      const trackerPos = window.getTrackingPosition();
      if (trackerPos && typeof trackerPos.x === "number" && typeof trackerPos.y === "number") {
        const trackerImg = await loadImage(config.icons.track);
        drawMarkerImage(trackerImg, trackerPos.x, trackerPos.y, 50, 50, 25, 25);
      }
    }

    // ---------- export ----------
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("Impossible de générer l'image");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = (config.plan.name || "plan") + "_complet.png";
      link.click();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");

  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'export complet de l'image");
  }
}

window.telechargerPlan = telechargerPlan;
