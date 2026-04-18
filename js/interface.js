// =========================
// INTERFACE LEAFLET
// =========================
// Head
L.control.titleControl = function() {
  let control = L.control({ position: 'topleft' });

  control.onAdd = function() {
    let div = L.DomUtil.create('div', 'map-title leaflet-control');

    div.innerHTML = `
      <div class="map-title-text">
        ${window.PLAN_CONFIG.plan.name}<br>
        <span style="font-size:12px; opacity:0.7;">
          ${window.PLAN_CONFIG.plan.version || ""}
        </span>
      </div>
    `;

    return div;
  };

  return control;
};

// ---------- BLOC AIDE ----------

function initInterface() {
  // ---------- BLOC AIDE ----------
const helpControl = L.control({ position: 'topright' });

helpControl.onAdd = function () {
  const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');

  const btnHelp = L.DomUtil.create('a', '', div);
  btnHelp.innerHTML = "❓";
  btnHelp.href = "#";
  btnHelp.title = "Aide";

  L.DomEvent.on(btnHelp, 'click', function (e) {
    L.DomEvent.stop(e);

    afficherAide();
  });

  L.DomEvent.disableClickPropagation(div);

  return div;
};

helpControl.addTo(window.map);

  // ---------- BLOC REGLAGES ----------
  const settingsControl = L.control({ position: 'topright' });

  settingsControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');

    const btnSettings = L.DomUtil.create('a', '', div);
    btnSettings.innerHTML = "⚙️";
    btnSettings.href = "#";
    btnSettings.title = "Réglages";

    L.DomEvent.on(btnSettings, 'click', function (e) {
      L.DomEvent.stop(e);
      afficherConfig();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  settingsControl.addTo(window.map);

  // ---------- BLOC TRACKING ----------
  const trackingControl = L.control({ position: 'topright' });

  trackingControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');

    const btnTrack = L.DomUtil.create('a', '', div);
    btnTrack.innerHTML = "▶️";
    btnTrack.href = "#";
    btnTrack.title = "Démarrer / arrêter le tracking";

    const btnRecal = L.DomUtil.create('a', '', div);
    btnRecal.innerHTML = "📍";
    btnRecal.href = "#";
    btnRecal.title = "Mode recalage";

    let isTracking = false;

    L.DomEvent.on(btnTrack, 'click', function (e) {
      L.DomEvent.stop(e);

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

    L.DomEvent.on(btnRecal, 'click', function (e) {
      L.DomEvent.stop(e);

      modeRecalage = !modeRecalage;
      btnRecal.style.backgroundColor = modeRecalage ? "#4CAF50" : "";
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  trackingControl.addTo(window.map);

  // ---------- BLOC MESURE ----------
  const measureControl = L.control({ position: 'topright' });

  measureControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');

    const btnMeasure = L.DomUtil.create('a', '', div);
    btnMeasure.innerHTML = "📏";
    btnMeasure.href = "#";
    btnMeasure.title = "Activer la mesure";

    const btnResetMeasure = L.DomUtil.create('a', '', div);
    btnResetMeasure.innerHTML = "❌";
    btnResetMeasure.href = "#";
    btnResetMeasure.title = "Réinitialiser la mesure";

    L.DomEvent.on(btnMeasure, 'click', function (e) {
      L.DomEvent.stop(e);

      modeMesure = !modeMesure;
      btnMeasure.style.backgroundColor = modeMesure ? "#4CAF50" : "";
    });

    L.DomEvent.on(btnResetMeasure, 'click', function (e) {
      L.DomEvent.stop(e);
      resetMesure();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  measureControl.addTo(window.map);

  // ---------- BLOC PLAN ----------
  const imageControl = L.control({ position: 'topright' });

  imageControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');

    const btnDownloadPlan = L.DomUtil.create('a', '', div);
    btnDownloadPlan.innerHTML = "🖼️";
    btnDownloadPlan.href = "#";
    btnDownloadPlan.title = "Télécharger le plan";

    L.DomEvent.on(btnDownloadPlan, 'click', function (e) {
      L.DomEvent.stop(e);
      telechargerPlan();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  imageControl.addTo(window.map);

  // ---------- BLOC ÉDITION ----------
  const editorControl = L.control({ position: 'topright' });

  editorControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');

    const btnEdit = L.DomUtil.create('a', '', div);
    btnEdit.innerHTML = "✏️";
    btnEdit.href = "#";
    btnEdit.title = "Mode ajout de point";

    const btnSave = L.DomUtil.create('a', '', div);
    btnSave.innerHTML = "💾";
    btnSave.href = "#";
    btnSave.title = "Exporter les points ajoutés";

    L.DomEvent.on(btnEdit, 'click', function (e) {
      L.DomEvent.stop(e);

      toggleEdition();
      btnEdit.style.backgroundColor = modeEdition ? "#4CAF50" : "";
    });

    L.DomEvent.on(btnSave, 'click', function (e) {
      L.DomEvent.stop(e);
      telechargerJSON();
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  editorControl.addTo(window.map);
}

// FonctionAide

function afficherAide() {
  const contenu = `
    <div style="font-size:16px; line-height:1.5;">
      <b>Aide - Interface</b><br><br>

      ▶️ : Démarrer / arrêter le tracking<br>
      📍 : Recalage de position<br><br>

      📏 : Mesurer une distance<br>
      ❌ : Réinitialiser la mesure<br><br>

      🖼️ : Télécharger le plan<br><br>

      ✏️ : Ajouter un point<br>
      💾 : Exporter les points<br><br>

      ❓ : Afficher cette aide<br>

      ⚙️ : Configuration

    </div>
  `;

  L.popup()
    .setLatLng(window.map.getCenter())
    .setContent(contenu)
    .openOn(window.map);
}

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

  // ✅ nouveaux champs
  APP_CONFIG.stepThreshold = parseFloat(document.getElementById("cfg_stepThreshold").value);
  APP_CONFIG.stepCooldown = parseInt(document.getElementById("cfg_stepCooldown").value, 10);
  APP_CONFIG.motionDebug = document.getElementById("cfg_motionDebug").value === "true";

  localStorage.setItem("app_config", JSON.stringify(APP_CONFIG));

  if (window.resetTrackingPosition) {
    resetTrackingPosition();
  }

  window.map.closePopup();
}

function resetConfig() {
  Object.assign(APP_CONFIG, DEFAULT_CONFIG);

  localStorage.setItem("app_config", JSON.stringify(APP_CONFIG));

  if (window.resetTrackingPosition) {
    resetTrackingPosition();
  }

  window.map.closePopup();
}

window.afficherConfig = afficherConfig;
window.appliquerConfig = appliquerConfig;
window.resetConfig = resetConfig;

// export global
window.initInterface = initInterface;