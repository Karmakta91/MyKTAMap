// =========================
// INTERFACE LEAFLET
// =========================

// Sécurité : éviter double init
window.interfaceInitialized = false;

// =========================
// TITRE
// =========================
L.control.titleControl = function () {
  let control = L.control({ position: "topleft" });

  control.onAdd = function () {
    let div = L.DomUtil.create("div", "map-title leaflet-control");

    const planName = window.PLAN_CONFIG?.plan?.name || "DEVMAP";
    const planVersion = window.PLAN_CONFIG?.plan?.version || "";

    div.innerHTML = `
      <div class="map-title-text">
        ${planName}<br>
        <span style="font-size:12px; opacity:0.7;">
          ${planVersion}
        </span>
      </div>
    `;

    return div;
  };

  return control;
};

// =========================
// EXPORT GLOBAL
// =========================
function telechargerSessionJSON() {
  const data = {
    type: "devmap-session",
    version: 1,
    editorPoints: window.getEditorPoints ? window.getEditorPoints() : [],
    measure: {
      points: window.getMeasurePoints ? window.getMeasurePoints() : []
    },
    roads: window.getRoads ? window.getRoads() : []
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "devmap-session.json";
  a.click();

  URL.revokeObjectURL(url);
}

// =========================
// IMPORT GLOBAL
// =========================
function importerSessionJSON(file) {
  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);

      if (data.type !== "devmap-session") {
        alert("Fichier invalide");
        return;
      }

      // POINTS EDITEUR
      if (window.setEditorPoints) {
        window.setEditorPoints(data.editorPoints || []);
      }

      if (window.renderEditorPoints) {
        window.renderEditorPoints();
      }

      // MESURE
      if (window.resetMesure) {
        window.resetMesure();
      }

      if (window.setMeasurePoints) {
        const measurePoints =
          data.measure && data.measure.points ? data.measure.points : [];
        window.setMeasurePoints(measurePoints);
      }

      // ROUTES
      if (window.resetRoads) {
        window.resetRoads();
      }

      if (window.setRoads) {
        window.setRoads(data.roads || []);
      }

      alert("Import terminé");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'import");
    }
  };

  reader.readAsText(file);
}

// =========================
// SELECTEUR IMPORT
// =========================
function ouvrirImportSession() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.onchange = function (e) {
    const file = e.target.files[0];
    if (file) {
      importerSessionJSON(file);
    }
  };

  input.click();
}

// =========================
// AIDE
// =========================
function afficherAide() {
  const contenu = `
    <div style="font-size:16px; line-height:1.5;">
      <b>Aide - Interface</b><br><br>

      ▶️ : Démarrer / arrêter le tracking<br>
      📍 : Recalage de position<br><br>

      📏 : Mesurer une distance<br>
      ❌ : Réinitialiser la mesure<br><br>

      🖼️ : Télécharger le plan<br><br>

      ✏️ : Ajouter un point<br><br>

      🟩 : Route principale<br>
      🟪 : Route secondaire<br>
      🟨 : Chemin<br>
      🧹 : Réinitialiser les tracés routes<br><br>

      📂 : Importer une session<br>
      💾 : Exporter la session<br><br>

      ❓ : Afficher cette aide<br>
      ⚙️ : Configuration
    </div>
  `;

  L.popup()
    .setLatLng(window.map.getCenter())
    .setContent(contenu)
    .openOn(window.map);
}

// =========================
// CONFIG
// =========================
function afficherConfig() {
  const c = APP_CONFIG;

  const contenu = `
    <div style="font-size:16px; width:240px;">
      <b>Réglages</b><br><br>

      Échelle :<br>
      <input id="cfg_scale" type="number" step="0.1" value="${c.scale}" style="font-size:16px;"><br>

      Taille d'un pas (m) :<br>
      <input id="cfg_stepLength" type="number" step="0.1" value="${c.stepLength}" style="font-size:16px;"><br>

      Hauteur image :<br>
      <input id="cfg_imageHeight" type="number" value="${c.imageHeight}" style="font-size:16px;"><br>

      Largeur image :<br>
      <input id="cfg_imageWidth" type="number" value="${c.imageWidth}" style="font-size:16px;"><br>

      Position initiale X :<br>
      <input id="cfg_startX" type="number" value="${c.startX}" style="font-size:16px;"><br>

      Position initiale Y :<br>
      <input id="cfg_startY" type="number" value="${c.startY}" style="font-size:16px;"><br>

      Seuil de détection pas :<br>
      <input id="cfg_stepThreshold" type="number" step="0.1" value="${c.stepThreshold}" style="font-size:16px;"><br>

      Cooldown pas (ms) :<br>
      <input id="cfg_stepCooldown" type="number" value="${c.stepCooldown}" style="font-size:16px;"><br>

      Debug mouvement :<br>
      <select id="cfg_motionDebug" style="font-size:16px;">
        <option value="true" ${c.motionDebug ? "selected" : ""}>Oui</option>
        <option value="false" ${!c.motionDebug ? "selected" : ""}>Non</option>
      </select><br><br>

      <button onclick="appliquerConfig()">Appliquer</button>
      <button onclick="resetConfig()">Reset</button>
    </div>
  `;

  L.popup()
    .setLatLng(window.map.getCenter())
    .setContent(contenu)
    .openOn(window.map);
}

function appliquerConfig() {
  APP_CONFIG.scale = parseFloat(document.getElementById("cfg_scale").value);
  APP_CONFIG.stepLength = parseFloat(document.getElementById("cfg_stepLength").value);
  APP_CONFIG.imageHeight = parseInt(document.getElementById("cfg_imageHeight").value, 10);
  APP_CONFIG.imageWidth = parseInt(document.getElementById("cfg_imageWidth").value, 10);
  APP_CONFIG.startX = parseInt(document.getElementById("cfg_startX").value, 10);
  APP_CONFIG.startY = parseInt(document.getElementById("cfg_startY").value, 10);
  APP_CONFIG.stepThreshold = parseFloat(document.getElementById("cfg_stepThreshold").value);
  APP_CONFIG.stepCooldown = parseInt(document.getElementById("cfg_stepCooldown").value, 10);
  APP_CONFIG.motionDebug = document.getElementById("cfg_motionDebug").value === "true";

  localStorage.setItem("app_config", JSON.stringify(APP_CONFIG));

  if (window.resetTrackingPosition) {
    window.resetTrackingPosition();
  }

  window.map.closePopup();
}

function resetConfig() {
  Object.assign(APP_CONFIG, DEFAULT_CONFIG);

  localStorage.setItem("app_config", JSON.stringify(APP_CONFIG));

  if (window.resetTrackingPosition) {
    window.resetTrackingPosition();
  }

  window.map.closePopup();
}

// =========================
// INIT INTERFACE
// =========================
function initInterface() {
  console.log("initInterface appelé");
  if (window.interfaceInitialized) return;
  window.interfaceInitialized = true;

  // ---------- TITRE ----------
  L.control.titleControl().addTo(window.map);

  // ---------- BLOC AIDE ----------
  const helpControl = L.control({ position: "topright" });

  helpControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnHelp = L.DomUtil.create("a", "", div);
    btnHelp.innerHTML = "❓";
    btnHelp.href = "javascript:void(0)";
    btnHelp.title = "Aide";

    L.DomEvent.on(btnHelp, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      afficherAide();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  helpControl.addTo(window.map);

  // ---------- BLOC REGLAGES ----------
  const settingsControl = L.control({ position: "topright" });

  settingsControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnSettings = L.DomUtil.create("a", "", div);
    btnSettings.innerHTML = "⚙️";
    btnSettings.href = "javascript:void(0)";
    btnSettings.title = "Réglages";

    L.DomEvent.on(btnSettings, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      afficherConfig();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  settingsControl.addTo(window.map);

  // ---------- BLOC TRACKING ----------
  const trackingControl = L.control({ position: "topright" });

  trackingControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnTrack = L.DomUtil.create("a", "", div);
    btnTrack.innerHTML = "▶️";
    btnTrack.href = "javascript:void(0)";
    btnTrack.title = "Démarrer / arrêter le tracking";

    const btnRecal = L.DomUtil.create("a", "", div);
    btnRecal.innerHTML = "📍";
    btnRecal.href = "javascript:void(0)";
    btnRecal.title = "Mode recalage";

    let isTracking = false;

    L.DomEvent.on(btnTrack, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);

      if (!isTracking) {
        requestPermission();
        startTracking();
        btnTrack.innerHTML = "⏹️";
      } else {
        stopTracking();
        btnTrack.innerHTML = "▶️";
      }

      isTracking = !isTracking;
    });

    L.DomEvent.on(btnRecal, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);

      if (typeof modeRecalage !== "undefined") {
        modeRecalage = !modeRecalage;
        btnRecal.style.backgroundColor = modeRecalage ? "#4CAF50" : "";
      }
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  trackingControl.addTo(window.map);

  // ---------- BLOC MESURE ----------
  const measureControl = L.control({ position: "topright" });

  measureControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnMeasure = L.DomUtil.create("a", "", div);
    btnMeasure.innerHTML = "📏";
    btnMeasure.href = "javascript:void(0)";
    btnMeasure.title = "Activer la mesure";

    const btnResetMeasure = L.DomUtil.create("a", "", div);
    btnResetMeasure.innerHTML = "❌";
    btnResetMeasure.href = "javascript:void(0)";
    btnResetMeasure.title = "Réinitialiser la mesure";

    L.DomEvent.on(btnMeasure, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);

      if (typeof modeMesure !== "undefined") {
        modeMesure = !modeMesure;
        btnMeasure.style.backgroundColor = modeMesure ? "#4CAF50" : "";
      } else if (typeof window.modeMesure !== "undefined") {
        window.modeMesure = !window.modeMesure;
        btnMeasure.style.backgroundColor = window.modeMesure ? "#4CAF50" : "";
      }
    });

    L.DomEvent.on(btnResetMeasure, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      resetMesure();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  measureControl.addTo(window.map);

  // ---------- BLOC PLAN ----------
  const imageControl = L.control({ position: "topright" });

  imageControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnDownloadPlan = L.DomUtil.create("a", "", div);
    btnDownloadPlan.innerHTML = "🖼️";
    btnDownloadPlan.href = "javascript:void(0)";
    btnDownloadPlan.title = "Télécharger le plan";

    L.DomEvent.on(btnDownloadPlan, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      telechargerPlan();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  imageControl.addTo(window.map);

  // ---------- BLOC ÉDITION ----------
  const editorControl = L.control({ position: "topright" });

  editorControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnEdit = L.DomUtil.create("a", "", div);
    btnEdit.innerHTML = "✏️";
    btnEdit.href = "javascript:void(0)";
    btnEdit.title = "Mode ajout de point";

    L.DomEvent.on(btnEdit, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);

      toggleEdition();
      btnEdit.style.backgroundColor = window.modeEdition ? "#4CAF50" : "";
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  editorControl.addTo(window.map);

  // ---------- BLOC ROUTES ----------
  const roadControl = L.control({ position: "topright" });

  roadControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnPrincipal = L.DomUtil.create("a", "", div);
    btnPrincipal.innerHTML = "🟩";
    btnPrincipal.href = "javascript:void(0)";
    btnPrincipal.title = "Tracer une route principale";

    const btnSecondaire = L.DomUtil.create("a", "", div);
    btnSecondaire.innerHTML = "🟪";
    btnSecondaire.href = "javascript:void(0)";
    btnSecondaire.title = "Tracer une route secondaire";

    const btnChemin = L.DomUtil.create("a", "", div);
    btnChemin.innerHTML = "🟨";
    btnChemin.href = "javascript:void(0)";
    btnChemin.title = "Tracer un chemin";

    const btnResetRoads = L.DomUtil.create("a", "", div);
    btnResetRoads.innerHTML = "🧹";
    btnResetRoads.href = "javascript:void(0)";
    btnResetRoads.title = "Réinitialiser les tracés routes";

    function refreshRoadButtons() {
      btnPrincipal.style.backgroundColor = window.modeRoad === "principal" ? "#4CAF50" : "";
      btnSecondaire.style.backgroundColor = window.modeRoad === "secondaire" ? "#4CAF50" : "";
      btnChemin.style.backgroundColor = window.modeRoad === "chemin" ? "#4CAF50" : "";
    }

    L.DomEvent.on(btnPrincipal, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      toggleRoadMode("principal");
      refreshRoadButtons();
    });

    L.DomEvent.on(btnSecondaire, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      toggleRoadMode("secondaire");
      refreshRoadButtons();
    });

    L.DomEvent.on(btnChemin, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      toggleRoadMode("chemin");
      refreshRoadButtons();
    });

    L.DomEvent.on(btnResetRoads, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      resetRoads();
      refreshRoadButtons();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  roadControl.addTo(window.map);

  // ---------- BLOC IMPORT / EXPORT ----------
  const ioControl = L.control({ position: "topright" });

  ioControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnImport = L.DomUtil.create("a", "", div);
    btnImport.innerHTML = "📂";
    btnImport.href = "javascript:void(0)";
    btnImport.title = "Importer une session";

    const btnExport = L.DomUtil.create("a", "", div);
    btnExport.innerHTML = "💾";
    btnExport.href = "javascript:void(0)";
    btnExport.title = "Exporter la session";

    L.DomEvent.on(btnImport, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      ouvrirImportSession();
    });

    L.DomEvent.on(btnExport, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      telechargerSessionJSON();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  ioControl.addTo(window.map);
}

// =========================
// EXPORT GLOBAL
// =========================
window.afficherConfig = afficherConfig;
window.appliquerConfig = appliquerConfig;
window.resetConfig = resetConfig;
window.initInterface = initInterface;