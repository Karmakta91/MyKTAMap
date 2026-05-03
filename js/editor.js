// =========================
// EDITOR.JS — modale plein écran avec gestion des tags
// =========================

window.modeEdition = false;
let listePoints = [];

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
// ACTIVER / DÉSACTIVER
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
    if (document.getElementById("kta-poi-modal")) return; // évite double clic

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const x   = Math.round(lng);
    const y   = Math.round(APP_CONFIG.imageHeight - lat);

    afficherFormulaire(x, y);
  });
}

// =========================
// OPTIONS DYNAMIQUES (tags existants)
// =========================
function _buildTypeOptionsHTML(selectedTag) {
  const icons = window.PLAN_CONFIG?.icons || {};
  const tags  = Object.keys(icons).filter(function(k) { return !EDITOR_EXCLURE.includes(k); });

  let html = '<option value="">— Aucun tag (défaut) —</option>';

  if (tags.length === 0) {
    html += Object.entries(EDITOR_TAG_LABELS)
      .map(function(e) {
        const sel = e[0] === selectedTag ? ' selected' : '';
        return `<option value="${e[0]}"${sel}>${e[1]}</option>`;
      }).join("");
  } else {
    html += tags.map(function(tag) {
      const label = EDITOR_TAG_LABELS[tag] || tag;
      const sel   = tag === selectedTag ? ' selected' : '';
      return `<option value="${tag}"${sel}>${label}</option>`;
    }).join("");
  }

  html += '<option value="__new__">➕ Créer un nouveau tag…</option>';
  return html;
}

// =========================
// FORMULAIRE — modale plein écran style cohérent
// =========================
function afficherFormulaire(x, y) {
  const existing = document.getElementById("kta-poi-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "kta-poi-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:90vh;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">✏️ Ajouter un point</span>
        <button class="kta-panneau-close" id="kta-poi-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📍 Position</div>
          <div style="font-size:13px; color:#8892a4; padding:4px 0;">
            X : <strong style="color:#e8eaf0;">${x}</strong> — Y : <strong style="color:#e8eaf0;">${y}</strong>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📋 Informations</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">Nom <span style="color:#ff8080;">*</span></label>
            <input class="kta-cfg-input" id="kta-poi-nom" type="text" placeholder="ex: Puits du chêne" autocomplete="off">

            <label class="kta-cfg-label">Type</label>
            <select class="kta-cfg-input" id="kta-poi-type">${_buildTypeOptionsHTML("")}</select>
          </div>

          <div id="kta-poi-newtag-wrap" style="display:none; margin-top:8px;">
            <label class="kta-cfg-label" style="display:block; margin-bottom:4px;">Nouveau tag (sans espace)</label>
            <input class="kta-cfg-input" id="kta-poi-newtag" type="text" placeholder="ex: fontaine" autocomplete="off">
            <p style="font-size:11px; color:#8892a4; margin:4px 0 0;">
              L'icône par défaut sera utilisée. Pour personnaliser l'icône, modifie le plan via 📦.
            </p>
          </div>

          <div style="margin-top:10px;">
            <label class="kta-cfg-label" style="display:block; margin-bottom:4px;">Description</label>
            <textarea class="kta-cfg-input" id="kta-poi-desc"
              style="min-height:70px; resize:vertical; font-family:inherit;"
              placeholder="(optionnel)"></textarea>
          </div>
        </div>

        <div id="kta-poi-erreur" class="kta-conv-erreur" style="display:none;"></div>

        <div class="kta-conv-actions" style="margin-top:14px;">
          <button class="kta-btn kta-btn-ghost"   id="kta-poi-annuler">Annuler</button>
          <button class="kta-btn kta-btn-primary"  id="kta-poi-valider">✅ Ajouter</button>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  const inputNom    = document.getElementById("kta-poi-nom");
  const selectType  = document.getElementById("kta-poi-type");
  const newTagWrap  = document.getElementById("kta-poi-newtag-wrap");
  const inputNewTag = document.getElementById("kta-poi-newtag");
  const inputDesc   = document.getElementById("kta-poi-desc");
  const erreurEl    = document.getElementById("kta-poi-erreur");
  const btnClose    = document.getElementById("kta-poi-close");
  const btnAnnuler  = document.getElementById("kta-poi-annuler");
  const btnValider  = document.getElementById("kta-poi-valider");

  function setErr(msg) {
    erreurEl.textContent  = msg || "";
    erreurEl.style.display = msg ? "block" : "none";
  }

  function fermer() { modal.remove(); }

  selectType.addEventListener("change", function() {
    if (selectType.value === "__new__") {
      newTagWrap.style.display = "block";
      setTimeout(function() { inputNewTag.focus(); }, 30);
    } else {
      newTagWrap.style.display = "none";
    }
  });

  btnClose.addEventListener("click", fermer);
  btnAnnuler.addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  // Empêcher Leaflet de capturer les events tactiles dans la modale
  L.DomEvent.disableClickPropagation(modal);

  btnValider.addEventListener("click", function() {
    const nom = inputNom.value.trim();
    if (!nom) { setErr("Le nom est obligatoire"); inputNom.focus(); return; }

    let tag = selectType.value;

    // Création d'un nouveau tag à la volée
    if (tag === "__new__") {
      const nouveau = inputNewTag.value.trim().toLowerCase().replace(/\s+/g, "_");
      if (!nouveau) { setErr("Saisis un nom de tag valide"); inputNewTag.focus(); return; }
      if (!/^[a-z0-9_-]+$/.test(nouveau)) {
        setErr("Le tag doit contenir uniquement lettres, chiffres, _ ou -");
        inputNewTag.focus();
        return;
      }
      tag = nouveau;

      // Enregistrer le tag dans PLAN_CONFIG.icons s'il n'existe pas (icône par défaut)
      if (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) {
        if (!window.PLAN_CONFIG.icons[tag]) {
          window.PLAN_CONFIG.icons[tag] = window.PLAN_CONFIG.icons.default || "icon/iconetrack.png";
        }
      }
      // S'assurer que le _iconMap a une entrée pour ce nouveau tag
      if (window._iconMap && !window._iconMap[tag]) {
        window._iconMap[tag] = window._iconMap.default || window.iconeDefault;
      }
    }

    const desc = inputDesc.value.trim();
    const point = {
      id:          nom,
      nom:         nom,
      x:           x,
      y:           y,
      tags:        tag ? [tag] : [],
      etat:        "Non inspectée",
      description: desc,
      profondeur:  null,
      date_update: new Date().toISOString().split("T")[0],
      source:      "editor"
    };

    listePoints.push(point);
    _ajouterMarker(point);
    fermer();
  });

  // Focus auto sur le nom
  setTimeout(function() { inputNom.focus(); }, 50);
}

// =========================
// AJOUTER UN MARKER À LA CARTE
// =========================
function _ajouterMarker(point) {
  if (!window.layerEditor) {
    console.error("layerEditor non défini");
    return;
  }

  let icone = choisirIcone(point);

  // Validation : si l'icône est invalide, utiliser le pin Leaflet natif
  if (!icone || !icone.options || !icone.options.iconUrl) {
    console.warn("[Editor] Icône invalide pour", point.nom, "— pin Leaflet par défaut");
    icone = new L.Icon.Default();
  }

  const marker = L.marker(convertCoord(point.x, point.y), { icon: icone }).addTo(window.layerEditor);
  marker.bindPopup("<b>" + point.nom + "</b><br>" + (point.description || ""));
}

// =========================
// SUPPRIMER LE DERNIER POINT AJOUTÉ
// =========================
function removeLastEditorPoint() {
  if (listePoints.length === 0) return false;
  listePoints.pop();
  if (window.renderEditorPoints) window.renderEditorPoints();
  return true;
}

// =========================
// RENDU DES POINTS
// =========================
window.renderEditorPoints = function() {
  if (!window.layerEditor) return;
  window.layerEditor.clearLayers();
  listePoints.forEach(_ajouterMarker);
};

// =========================
// EXPORT GLOBAL
// =========================
window.toggleEdition          = toggleEdition;
window.initEditor             = initEditor;
window.removeLastEditorPoint  = removeLastEditorPoint;
window.getEditorPoints        = function() { return listePoints; };
window.setEditorPoints        = function(points) { listePoints = points || []; };
