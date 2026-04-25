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
// PANNEAU ANCRÉ AUX BOUTONS
// Remplace les L.popup() pour les contrôles de la barre latérale.
// Usage : ouvrirPanneauAncre(btnElement, htmlContenu, titreOptionnel)
// =========================
(function () {
  let _panneauActif = null;
  let _closeOnOutside = null;

  function fermerPanneau() {
    if (_panneauActif) {
      _panneauActif.remove();
      _panneauActif = null;
    }
    if (_closeOnOutside) {
      document.removeEventListener("mousedown", _closeOnOutside);
      _closeOnOutside = null;
    }
  }

  window.fermerPanneau = fermerPanneau;

  window.ouvrirPanneauAncre = function (btnEl, html, titre) {
    // Fermer un éventuel panneau déjà ouvert
    fermerPanneau();

    const panneau = document.createElement("div");
    panneau.className = "kta-panneau";

    // Flèche
    const fleche = document.createElement("div");
    fleche.className = "kta-panneau-fleche";
    panneau.appendChild(fleche);

    // En-tête avec titre + bouton fermer
    if (titre) {
      const header = document.createElement("div");
      header.className = "kta-panneau-header";
      header.innerHTML = `<span class="kta-panneau-titre">${titre}</span>`;

      const btnClose = document.createElement("button");
      btnClose.className = "kta-panneau-close";
      btnClose.innerHTML = "✕";
      btnClose.addEventListener("click", fermerPanneau);
      header.appendChild(btnClose);

      panneau.appendChild(header);
    }

    // Corps
    const corps = document.createElement("div");
    corps.className = "kta-panneau-corps";
    corps.innerHTML = html;
    panneau.appendChild(corps);

    document.body.appendChild(panneau);
    _panneauActif = panneau;

    // Positionner à gauche du bouton
    const rect = btnEl.getBoundingClientRect();
    const panH = panneau.offsetHeight || 400; // estimation initiale

    // Horizontal : à gauche du bouton avec un petit gap
    const left = rect.left - panneau.offsetWidth - 10;
    // Vertical : aligné sur le centre du bouton, clampé dans la fenêtre
    let top = rect.top + rect.height / 2 - panH / 2;
    top = Math.max(10, Math.min(top, window.innerHeight - panH - 10));

    panneau.style.left = Math.max(8, left) + "px";
    panneau.style.top = top + "px";

    // Recalculer après rendu réel
    requestAnimationFrame(() => {
      const realH = panneau.offsetHeight;
      let realTop = rect.top + rect.height / 2 - realH / 2;
      realTop = Math.max(10, Math.min(realTop, window.innerHeight - realH - 10));
      panneau.style.top = realTop + "px";

      // Positionner la flèche verticalement au niveau du bouton
      const arrowTop = (rect.top + rect.height / 2) - panneau.getBoundingClientRect().top;
      fleche.style.top = Math.max(16, arrowTop) + "px";
    });

    // Fermer en cliquant dehors (délai pour éviter le clic d'ouverture)
    setTimeout(() => {
      _closeOnOutside = function (ev) {
        if (!panneau.contains(ev.target) && ev.target !== btnEl) {
          fermerPanneau();
        }
      };
      document.addEventListener("mousedown", _closeOnOutside);
    }, 150);
  };
})();

// Surcharge appliquerConfig / resetConfig pour fermer le panneau au lieu de closePopup
// (les fonctions originales appellent window.map.closePopup() — on le garde intact,
//  on ajoute juste fermerPanneau() en plus)
const _origAppliquerConfig_wrap = window.appliquerConfig;
const _origResetConfig_wrap = window.resetConfig;

// Ces surcharges seront appliquées après que les fonctions originales soient définies
// (voir bas du fichier, section "patch post-définition")

// =========================
// EXPORT SESSION JSON
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
// IMPORT SESSION JSON
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

      if (window.setEditorPoints) {
        window.setEditorPoints(data.editorPoints || []);
      }

      if (window.renderEditorPoints) {
        window.renderEditorPoints();
      }

      if (window.resetMesure) {
        window.resetMesure();
      }

      if (window.setMeasurePoints) {
        const measurePoints =
          data.measure && data.measure.points ? data.measure.points : [];
        window.setMeasurePoints(measurePoints);
      }

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
// SÉLECTEUR IMPORT
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
// AIDE — panneau ancré
// =========================
function afficherAide(btnEl) {
  const html = `
    <div class="kta-aide-grille">
      <span class="kta-aide-icone">▶️ / ⏹️</span><span>Démarrer / arrêter le tracking</span>
      <span class="kta-aide-icone">📍</span><span>Recalage de position</span>
      <span class="kta-aide-icone">📏</span><span>Mesurer une distance</span>
      <span class="kta-aide-icone">❌</span><span>Réinitialiser la mesure</span>
      <span class="kta-aide-icone">🖼️</span><span>Télécharger le plan</span>
      <span class="kta-aide-icone">✏️</span><span>Ajouter un point</span>
      <span class="kta-aide-icone">🟩</span><span>Route principale</span>
      <span class="kta-aide-icone">🟪</span><span>Route secondaire</span>
      <span class="kta-aide-icone">🟨</span><span>Chemin</span>
      <span class="kta-aide-icone">🧹</span><span>Réinitialiser les tracés</span>
      <span class="kta-aide-icone">📂</span><span>Importer une session</span>
      <span class="kta-aide-icone">💾</span><span>Exporter la session</span>
      <span class="kta-aide-icone">❓</span><span>Cette aide</span>
      <span class="kta-aide-icone">🗂️</span><span>Changer de plan</span>
      <span class="kta-aide-icone">⚙️</span><span>Configuration</span>
    </div>
  `;
  ouvrirPanneauAncre(btnEl, html, "Aide");
}

// =========================
// CHANGER DE PLAN — overlay modal (inchangé)
// =========================
function afficherPopupChangerPlan() {
  const existing = document.getElementById("popupChangerPlan");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "popupChangerPlan";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(10, 15, 25, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
  `;

  overlay.innerHTML = `
    <div style="
      background: #fff;
      color: #111;
      border-radius: 14px;
      padding: 24px;
      max-width: 380px;
      width: 100%;
      font-family: Arial, sans-serif;
      box-shadow: 0 10px 35px rgba(0,0,0,0.35);
    ">
      <h2 style="margin: 0 0 10px; font-size: 18px;">Changer de plan</h2>
      <p style="margin: 0 0 20px; font-size: 14px; color: #555;">
        Tu vas quitter la session en cours. Les données non exportées seront perdues.
      </p>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="popupResterIci" style="
          padding: 10px 16px;
          border-radius: 8px;
          border: 1px solid #ccc;
          background: #f5f5f5;
          color: #333;
          font-size: 14px;
          cursor: pointer;
        ">Rester ici</button>
        <button id="popupChargerPlan" style="
          padding: 10px 16px;
          border-radius: 8px;
          border: 0;
          background: #1f6feb;
          color: #fff;
          font-size: 14px;
          cursor: pointer;
        ">Charger un plan</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("popupResterIci").addEventListener("click", function () {
    overlay.remove();
  });

  document.getElementById("popupChargerPlan").addEventListener("click", function () {
    window.location.href = "import.html";
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });
}

// =========================
// CONFIG — panneau ancré
// =========================
function afficherConfig(btnEl) {
  const c = APP_CONFIG;

  const html = `
    <div class="kta-cfg-grille">

      <label class="kta-cfg-label">Échelle</label>
      <input class="kta-cfg-input" id="cfg_scale" type="number" step="0.1" value="${c.scale}">

      <label class="kta-cfg-label">Taille d'un pas (m)</label>
      <input class="kta-cfg-input" id="cfg_stepLength" type="number" step="0.1" value="${c.stepLength}">

      <label class="kta-cfg-label">Hauteur image (px)</label>
      <input class="kta-cfg-input" id="cfg_imageHeight" type="number" value="${c.imageHeight}">

      <label class="kta-cfg-label">Largeur image (px)</label>
      <input class="kta-cfg-input" id="cfg_imageWidth" type="number" value="${c.imageWidth}">

      <label class="kta-cfg-label">Position initiale X</label>
      <input class="kta-cfg-input" id="cfg_startX" type="number" value="${c.startX}">

      <label class="kta-cfg-label">Position initiale Y</label>
      <input class="kta-cfg-input" id="cfg_startY" type="number" value="${c.startY}">

      <label class="kta-cfg-label">Seuil détection pas</label>
      <input class="kta-cfg-input" id="cfg_stepThreshold" type="number" step="0.1" value="${c.stepThreshold}">

      <label class="kta-cfg-label">Cooldown pas (ms)</label>
      <input class="kta-cfg-input" id="cfg_stepCooldown" type="number" value="${c.stepCooldown}">

      <label class="kta-cfg-label">Debug mouvement</label>
      <select class="kta-cfg-input" id="cfg_motionDebug">
        <option value="true"  ${c.motionDebug ? "selected" : ""}>Oui</option>
        <option value="false" ${!c.motionDebug ? "selected" : ""}>Non</option>
      </select>

    </div>

    <div class="kta-cfg-actions">
      <button class="kta-btn kta-btn-ghost" onclick="resetConfig()">Reset</button>
      <button class="kta-btn kta-btn-primary" onclick="appliquerConfig()">Appliquer</button>
    </div>
  `;

  ouvrirPanneauAncre(btnEl, html, "Réglages");
}

function appliquerConfig() {
  APP_CONFIG.scale          = parseFloat(document.getElementById("cfg_scale").value);
  APP_CONFIG.stepLength     = parseFloat(document.getElementById("cfg_stepLength").value);
  APP_CONFIG.imageHeight    = parseInt(document.getElementById("cfg_imageHeight").value, 10);
  APP_CONFIG.imageWidth     = parseInt(document.getElementById("cfg_imageWidth").value, 10);
  APP_CONFIG.startX         = parseInt(document.getElementById("cfg_startX").value, 10);
  APP_CONFIG.startY         = parseInt(document.getElementById("cfg_startY").value, 10);
  APP_CONFIG.stepThreshold  = parseFloat(document.getElementById("cfg_stepThreshold").value);
  APP_CONFIG.stepCooldown   = parseInt(document.getElementById("cfg_stepCooldown").value, 10);
  APP_CONFIG.motionDebug    = document.getElementById("cfg_motionDebug").value === "true";

  localStorage.setItem("app_config", JSON.stringify(APP_CONFIG));

  if (window.resetTrackingPosition) {
    window.resetTrackingPosition();
  }

  // Ferme le panneau ancré (+ closePopup pour compatibilité)
  if (window.fermerPanneau) window.fermerPanneau();
  if (window.map) window.map.closePopup();
}

function resetConfig() {
  Object.assign(APP_CONFIG, DEFAULT_CONFIG);

  localStorage.setItem("app_config", JSON.stringify(APP_CONFIG));

  if (window.resetTrackingPosition) {
    window.resetTrackingPosition();
  }

  if (window.fermerPanneau) window.fermerPanneau();
  if (window.map) window.map.closePopup();
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
      afficherAide(btnHelp);          // ← ancré au bouton
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  helpControl.addTo(window.map);

  // ---------- BLOC CHANGER DE PLAN ----------
  const changePlanControl = L.control({ position: "topright" });

  changePlanControl.onAdd = function () {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");

    const btnChangePlan = L.DomUtil.create("a", "", div);
    btnChangePlan.innerHTML = "🗂️";
    btnChangePlan.href = "javascript:void(0)";
    btnChangePlan.title = "Changer de plan";

    L.DomEvent.on(btnChangePlan, "click", function (e) {
      L.DomEvent.stop(e);
      L.DomEvent.preventDefault(e);
      afficherPopupChangerPlan();     // reste modal (inchangé)
    });

    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  changePlanControl.addTo(window.map);

  // ---------- BLOC RÉGLAGES ----------
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
      afficherConfig(btnSettings);   // ← ancré au bouton
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
      btnPrincipal.style.backgroundColor  = window.modeRoad === "principal"  ? "#4CAF50" : "";
      btnSecondaire.style.backgroundColor = window.modeRoad === "secondaire" ? "#4CAF50" : "";
      btnChemin.style.backgroundColor     = window.modeRoad === "chemin"     ? "#4CAF50" : "";
    }

    L.DomEvent.on(btnPrincipal, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      toggleRoadMode("principal"); refreshRoadButtons();
    });

    L.DomEvent.on(btnSecondaire, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      toggleRoadMode("secondaire"); refreshRoadButtons();
    });

    L.DomEvent.on(btnChemin, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      toggleRoadMode("chemin"); refreshRoadButtons();
    });

    L.DomEvent.on(btnResetRoads, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      resetRoads(); refreshRoadButtons();
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
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
      ouvrirImportSession();
    });

    L.DomEvent.on(btnExport, "click", function (e) {
      L.DomEvent.stop(e); L.DomEvent.preventDefault(e);
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
window.afficherConfig    = afficherConfig;
window.appliquerConfig   = appliquerConfig;
window.resetConfig       = resetConfig;
window.initInterface     = initInterface;
