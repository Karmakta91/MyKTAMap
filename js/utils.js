function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}

function choisirIcone(p) {
  if (!p.tags) return iconeDefault;
  if (p.tags.includes("salle")) return iconeSalle;
  if (p.tags.includes("pa")) return iconepa;
  if (p.tags.includes("pc")) return iconepc;
  if (p.tags.includes("pb")) return iconepb;
  if (p.tags.includes("vehicule")) return iconeVehicule;
  if (p.tags.includes("elec")) return iconeElec;
  if (p.tags.includes("epure")) return iconeEpure;
  if (p.tags.includes("ps")) return iconePS;
  if (p.tags.includes("info")) return iconeInfo;
  if (p.tags.includes("passage")) return iconePassage;
  if (p.tags.includes("chatiere")) return iconeChatiere;
  if (p.tags.includes("danger")) return iconeDanger;
  if (p.tags.includes("pe")) return iconepe;
  return iconeDefault;
}

function ajouterPointsDepuisJSON(url, layer) {
  fetch(url)
    .then(res => res.json())
    .then(json => {
      json.data.forEach(p => {

        var marker = L.marker(convertCoord(p.x, p.y), {
          icon: choisirIcone(p)
        });

        marker.bindPopup(
          `<b>${p.nom}</b><br>${p.description || ""}`
        );

        marker.addTo(layer);
      });
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
      const tag = point.tags && point.tags.length ? point.tags[0] : "default";
      let iconPath = config.icons.default;

      if (point.tags) {
        if (point.tags.includes("salle")) iconPath = config.icons.salle;
        else if (point.tags.includes("pa")) iconPath = config.icons.pa;
        else if (point.tags.includes("pc")) iconPath = config.icons.pc;
        else if (point.tags.includes("pb")) iconPath = config.icons.pb;
        else if (point.tags.includes("vehicule")) iconPath = config.icons.vehicule;
        else if (point.tags.includes("elec")) iconPath = config.icons.elec;
        else if (point.tags.includes("epure")) iconPath = config.icons.epure;
        else if (point.tags.includes("ps")) iconPath = config.icons.ps;
        else if (point.tags.includes("info")) iconPath = config.icons.info;
        else if (point.tags.includes("passage")) iconPath = config.icons.passage;
        else if (point.tags.includes("chatiere")) iconPath = config.icons.chatiere;
        else if (point.tags.includes("danger")) iconPath = config.icons.danger;
        else if (point.tags.includes("pe")) iconPath = config.icons.pe;
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
      const { img, path } = await getIconForPoint(point);

      let w = 50;
      let h = 50;
      let anchorX = 25;
      let anchorY = 25;

      if (path === config.icons.vehicule) {
        w = 50;
        h = 25;
        anchorX = 25;
        anchorY = 13;
      }

      drawMarkerImage(img, point.x, point.y, w, h, anchorX, anchorY);
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

window.telechargerPlanComplet = telechargerPlanComplet;
