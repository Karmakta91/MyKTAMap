// =========================
// ÉTAT
// =========================
window.modeEdition = false;
let listePoints = [];

// Labels d'affichage pour les tags connus
const EDITOR_TAG_LABELS = {
  salle:    "Salle",
  pa:       "Puits Aération",
  pc:       "Puits Comblé",
  pb:       "Puits Bouché",
  pe:       "Puits au sol / Bassin",
  ps:       "Puits extraction",
  passage:  "Passage",
  chatiere: "Chatière",
  vehicule: "Véhicule",
  danger:   "Danger",
  info:     "Information",
  elec:     "Électricité",
  epure:    "Épure"
};

const EDITOR_EXCLURE = ["default", "track"];

// =========================
// ACTIVER / DESACTIVER
// =========================
function toggleEdition() {
  window.modeEdition = !window.modeEdition;
  console.log("Mode édition :", window.modeEdition);
}

// =========================
// INIT
// =========================
function initEditor() {
  window.map.on("click", function(e) {
    if (!window.modeEdition) return;

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const x   = Math.round(lng);
    const y   = Math.round(APP_CONFIG.imageHeight - lat);

    afficherFormulaire(e.latlng, x, y);
  });

  window.map.on("popupclose", function() {
    resetZoomIOS();
  });
}

// =========================
// OPTIONS DYNAMIQUES
// =========================
function _buildTypeOptions() {
  const icons = window.PLAN_CONFIG?.icons || {};
  const tags  = Object.keys(icons).filter(function(k) { return !EDITOR_EXCLURE.includes(k); });

  // Fallback si pas de config
  if (tags.length === 0) {
    return Object.entries(EDITOR_TAG_LABELS)
      .map(function(e) { return `<option value="${e[0]}">${e[1]}</option>`; })
      .join("");
  }

  return tags.map(function(tag) {
    const label = EDITOR_TAG_LABELS[tag] || tag;
    return `<option value="${tag}">${label}</option>`;
  }).join("");
}

// =========================
// FORMULAIRE
// =========================
function afficherFormulaire(latlng, x, y) {
  const options = _buildTypeOptions();

  const contenu = `
    <div style="width:220px; font-size:15px; font-family:Arial,sans-serif;">
      <b style="font-size:16px;">Ajouter un point</b>
      <div style="margin-top:10px;">
        <label style="display:block; margin-bottom:3px; font-size:13px; color:#666;">Nom *</label>
        <input type="text" id="poi_nom" style="width:100%; font-size:15px; padding:4px 6px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;">
      </div>
      <div style="margin-top:8px;">
        <label style="display:block; margin-bottom:3px; font-size:13px; color:#666;">Type</label>
        <select id="poi_type" style="width:100%; font-size:15px; padding:4px 6px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;">
          ${options}
        </select>
      </div>
      <div style="margin-top:8px;">
        <label style="display:block; margin-bottom:3px; font-size:13px; color:#666;">Description</label>
        <textarea id="poi_desc" style="width:100%; font-size:14px; padding:4px 6px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px; resize:vertical; min-height:60px;"></textarea>
      </div>
      <div style="margin-top:10px;">
        <button onclick="validerPoint(${x}, ${y})" style="width:100%; padding:8px; font-size:15px; background:#1f6feb; color:white; border:0; border-radius:6px; cursor:pointer;">
          ✅ Ajouter
        </button>
      </div>
    </div>
  `;

  L.popup({ maxWidth: 260 })
    .setLatLng(latlng)
    .setContent(contenu)
    .openOn(window.map);
}

// =========================
// VALIDATION
// =========================
function validerPoint(x, y) {
  const nom  = document.getElementById("poi_nom").value;
  const type = document.getElementById("poi_type").value;
  const desc = document.getElementById("poi_desc").value;

  if (!nom.trim()) {
    alert("Le nom est obligatoire");
    return;
  }

  if (!window.layerEditor) {
    console.error("layerEditor non défini");
    return;
  }

  const point = {
    id:          nom,
    nom:         nom,
    x:           x,
    y:           y,
    tags:        [type],
    etat:        "Non inspectée",
    description: desc,
    profondeur:  null,
    date_update: new Date().toISOString().split("T")[0],
    source:      "editor"
  };

  listePoints.push(point);

  const marker = L.marker(convertCoord(x, y), {
    icon: choisirIcone(point)
  }).addTo(window.layerEditor);

  marker.bindPopup("<b>" + nom + "</b><br>" + (desc || ""));

  window.map.closePopup();
}

// =========================
// FIX ZOOM iOS
// =========================
function resetZoomIOS() {
  window.scrollTo(0, 0);
  setTimeout(function() { window.map.invalidateSize(); }, 200);
}

// =========================
// RENDU DES POINTS IMPORTÉS
// =========================
window.renderEditorPoints = function() {
  if (!window.layerEditor) return;
  window.layerEditor.clearLayers();
  listePoints.forEach(function(point) {
    const marker = L.marker(convertCoord(point.x, point.y), {
      icon: choisirIcone(point)
    }).addTo(window.layerEditor);
    marker.bindPopup("<b>" + point.nom + "</b><br>" + (point.description || ""));
  });
};

// =========================
// EXPORT GLOBAL
// =========================
window.toggleEdition  = toggleEdition;
window.initEditor     = initEditor;
window.getEditorPoints = function() { return listePoints; };
window.setEditorPoints = function(points) { listePoints = points || []; };
