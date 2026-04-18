// =========================
// ETAT
// =========================
window.modeEdition = false;
let listePoints = [];

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
  window.map.on('click', function(e) {
    if (!window.modeEdition) return;

    let lat = e.latlng.lat;
    let lng = e.latlng.lng;

    let x = Math.round(lng);
    let y = Math.round(APP_CONFIG.imageHeight - lat);

    afficherFormulaire(e.latlng, x, y);
  });

  window.map.on('popupclose', function() {
    resetZoomIOS();
  });
}

// =========================
// FORMULAIRE
// =========================
function afficherFormulaire(latlng, x, y) {
  let contenu = `
    <div style="width:200px; font-size:16px;">
      <b>Ajouter un point</b><br><br>

      Nom :<br>
      <input type="text" id="poi_nom" style="font-size:16px;"><br>

      Type :<br>
      <select id="poi_type" style="font-size:16px;">
        <option value="salle">Salle</option>
        <option value="pa">Puits Aération</option>
        <option value="pc">Puits comblé</option>
        <option value="pb">Puits Bouché</option>
        <option value="pe">Puits au sol/bassin</option>
        <option value="passage">Passage</option>
        <option value="chatiere">Chatiére</option>
        <option value="vehicule">Véhicule</option>
        <option value="danger">Danger</option>
        <option value="info">Info</option>
        <option value="epure">Epure</option>
      </select><br>

      Description :<br>
      <textarea id="poi_desc" style="font-size:16px;"></textarea><br><br>

      <button onclick="validerPoint(${x}, ${y})">Ajouter</button>
    </div>
  `;

  L.popup()
    .setLatLng(latlng)
    .setContent(contenu)
    .openOn(window.map);
}

// =========================
// VALIDATION
// =========================
function validerPoint(x, y) {
  let nom = document.getElementById("poi_nom").value;
  let type = document.getElementById("poi_type").value;
  let desc = document.getElementById("poi_desc").value;

 let point = {
  id: nom,
  nom: nom,
  x: x,
  y: y,
  tags: [type],
  etat: "Non inspectée",
  description: desc,
  profondeur: null,
  date_update: new Date().toISOString().split("T")[0],
  source: "editor"
};

  listePoints.push(point);

  console.log("Points :", listePoints);

  // on privilégie le layer carry s’il existe, sinon premier layer dispo
  let targetLayer = window.layerEditor;

let marker = L.marker(convertCoord(x, y), {
  icon: choisirIcone(point)
}).addTo(window.layerEditor);

  marker.bindPopup("<b>" + nom + "</b><br>" + desc);

  window.map.closePopup();
}

// =========================
// DOWNLOAD JSON
// =========================
function telechargerJSON() {
  let data = { data: listePoints };

  let json = JSON.stringify(data, null, 2);

  let blob = new Blob([json], { type: "application/json" });
  let url = URL.createObjectURL(blob);

  let a = document.createElement("a");
  a.href = url;
  a.download = "points.json";
  a.click();

  URL.revokeObjectURL(url);
}

// =========================
// FIX ZOOM iOS
// =========================
function resetZoomIOS() {
  window.scrollTo(0, 0);

  setTimeout(() => {
    window.map.invalidateSize();
  }, 200);
}

// =========================
// EXPORT GLOBAL
// =========================
window.toggleEdition = toggleEdition;
window.initEditor = initEditor;
window.telechargerJSON = telechargerJSON;