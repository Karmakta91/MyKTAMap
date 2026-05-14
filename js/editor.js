// =========================
// EDITOR.JS — modale plein écran avec gestion des tags
// =========================

window.modeEdition = false;
let listePoints = [];

// Tracking des markers Leaflet créés par _ajouterMarker, pour pouvoir les
// retirer SÉLECTIVEMENT lors d'un re-render. Avant suite 13, layerEditor
// ne contenait que des markers — on pouvait faire layerEditor.clearLayers()
// sans risque. Mais depuis suite 13, layerEditor contient AUSSI les roads
// et zones session (regroupement dans le calque "Mes annotations") →
// clearLayers les supprime tous, ce qui faisait disparaitre roads + zones
// quand on supprimait UN seul point.
// On track donc nos propres markers pour pouvoir faire un cleanup cible.
let _markersEditor = [];

const EDITOR_TAG_LABELS = {
  salle:    "Salle",
  pa:       "Puits Aération",
  pc:       "Puits Comblé",
  pb:       "Puits Bouché",
  pe:       "Puits au sol / Bassin",
  ps:       "Puits extraction",
  peo:      "Puits à échelon ouvert",
  pef:      "Puits à échelon fermé",
  eso:      "Escalier service ouvert",
  esf:      "Escalier service fermé",
  cao:      "Cavage ouvert",
  caf:      "Cavage fermé",
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
  console.log("[Editor] Mode édition :", window.modeEdition);
}

// =========================
// INIT
// =========================
function initEditor() {
  // Reset complet (cohérence avec initZones / initMeasure) — sans ce reset,
  // listePoints survit au switch de plan via le plan switcher et le polling
  // SessionPersist ré-enregistre les points de l'ancien plan sous l'ID du
  // nouveau plan (cross-pollination entre plans).
  listePoints = [];
  // Cleanup des markers tracking (pas clearLayers du group entier — voir
  // commentaire sur _markersEditor en haut du fichier).
  _markersEditor.forEach(function(m) { try { m.remove(); } catch(e) {} });
  _markersEditor = [];

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
// OPTIONS DYNAMIQUES (fusion des tags connus + tags du plan-config)
// =========================
function _buildTypeOptionsHTML(selectedTag) {
  const icons = window.PLAN_CONFIG?.icons || {};

  // Set des tags : on cumule
  //   1. tous les tags définis dans EDITOR_TAG_LABELS (y compris les nouveaux : peo, pef, etc.)
  //   2. + les tags du plan-config (pour les tags custom ajoutés à un plan particulier)
  // → l'utilisateur peut TOUJOURS sélectionner un type, même si le plan-config
  //   ne déclare pas son icône (l'app utilisera _iconMap[tag] ou l'icône par défaut)
  const tagsSet = new Set(Object.keys(EDITOR_TAG_LABELS));
  Object.keys(icons).forEach(function(k) {
    if (!EDITOR_EXCLURE.includes(k)) tagsSet.add(k);
  });
  // Retirer les tags système
  EDITOR_EXCLURE.forEach(function(k) { tagsSet.delete(k); });

  // Trier : d'abord les tags labellisés (ordre de EDITOR_TAG_LABELS),
  // puis les tags custom non labellisés en fin
  const known   = Object.keys(EDITOR_TAG_LABELS).filter(function(k) { return tagsSet.has(k); });
  const custom  = [...tagsSet].filter(function(k) { return !EDITOR_TAG_LABELS[k]; });
  const orderedTags = known.concat(custom);

  let html = '<option value="">— Aucun tag (défaut) —</option>';
  html += orderedTags.map(function(tag) {
    const label = EDITOR_TAG_LABELS[tag] || tag;
    const sel   = tag === selectedTag ? ' selected' : '';
    return `<option value="${tag}"${sel}>${label}</option>`;
  }).join("");

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

    // 🏗️ Multi-niveau (v148) : tag le point avec le niveau actif si la feature
    // est ON pour ce plan. Si OFF → aucun champ `level` → retro-compat absolue.
    if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
      point.level = window.APP_CONFIG.activeLevel || 0;
    }

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
  // Popup avec boutons "Y aller" / "Itinéraire" / "Supprimer" — helper commun.
  // 2e argument true → c'est un point de la session courante (listePoints) →
  // bouton "🗑️ Supprimer" affiche dans la popup.
  const popupHtml = (typeof window.buildPointPopupHtml === "function")
    ? window.buildPointPopupHtml(point, true)
    : ("<b>" + point.nom + "</b><br>" + (point.description || ""));
  marker.bindPopup(popupHtml, window.KTA_POPUP_OPTS);

  // 🏗️ Multi-niveau (v148) : stocke le level sur le marker pour le filtre runtime.
  // (Le point.level est aussi conserve dans listePoints, mais on duplique sur
  // l'objet marker pour eviter une lookup au moment du filter visuel.)
  marker._ktaLevel = Number.isInteger(point.level) ? point.level : 0;

  // Tracking pour permettre une suppression ciblée plus tard (sans clearLayers
  // qui efface aussi roads/zones partageant le meme layerEditor).
  _markersEditor.push(marker);

  // Applique le filtre niveau immediat sur ce nouveau marker (utile quand le
  // user ajoute un point sur un niveau qui n'est pas dans visibleLevels —
  // ex: il a filtre Niv 1 mais ajoute via le mode edition sans changer le
  // niveau actif). Le marker se cache si pas visible.
  _appliquerFiltreNiveauSurMarker(marker);
}

// 🏗️ Multi-niveau : helper de filtrage visuel d'un marker editor selon
// APP_CONFIG.visibleLevels. Utilise setOpacity + pointer-events plutot
// que remove/addLayer pour preserver l'integration avec layerEditor.
function _appliquerFiltreNiveauSurMarker(marker) {
  if (!marker) return;
  const multi = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  if (!multi) {
    // Feature off → tout visible (retro-compat)
    try { marker.setOpacity(1); } catch(e) {}
    if (marker._icon) marker._icon.style.pointerEvents = "";
    return;
  }
  const visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
    ? window.APP_CONFIG.visibleLevels : [0];
  const lvl = Number.isInteger(marker._ktaLevel) ? marker._ktaLevel : 0;
  const visible = visibles.indexOf(lvl) >= 0;
  try { marker.setOpacity(visible ? 1 : 0); } catch(e) {}
  if (marker._icon) marker._icon.style.pointerEvents = visible ? "" : "none";
}

// Filtre TOUS les markers editor courants. Appelle par interface.js
// (window.appliquerFiltreNiveau) quand le filtre change.
window._applyLevelFilterToEditorPoints = function() {
  _markersEditor.forEach(_appliquerFiltreNiveauSurMarker);
};

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
// ⚠️ Ne PAS appeler layerEditor.clearLayers() ici : depuis suite 13, layerEditor
// contient aussi roads + zones session (regroupes dans le calque "Mes annotations").
// Un clearLayers retirerait TOUT le contenu, y compris roads et zones, ce qui
// causait un bug "supprimer un point efface aussi mes routes" rapporte par user.
// On track les markers editor dans _markersEditor et on retire UNIQUEMENT ceux-la.
window.renderEditorPoints = function() {
  if (!window.layerEditor) return;
  _markersEditor.forEach(function(m) { try { m.remove(); } catch(e) {} });
  _markersEditor = [];
  listePoints.forEach(_ajouterMarker);
};

// =========================
// EXPORT GLOBAL
// =========================
window.toggleEdition          = toggleEdition;
window.initEditor             = initEditor;
window.removeLastEditorPoint  = removeLastEditorPoint;
window.getEditorPoints        = function() { return listePoints; };
// ⚠️ Auto-render symmetric avec setRoads/setZones (qui appellent renderRoads/renderZones
// en interne). Sans ça, les callers oubliaient parfois renderEditorPoints() après set,
// et les markers restaient en mémoire (listePoints) sans être attachés au layerEditor.
// Conséquence visible : le toggle du calque "Ajout" dans le contrôle des couches
// Leaflet ne masquait pas les points restaurés par SessionPersist (les markers
// étaient bien sur la map, mais hors du layerGroup que toggle l'overlay).
window.setEditorPoints        = function(points) {
  listePoints = points || [];
  if (window.renderEditorPoints) window.renderEditorPoints();
};

// Supprime un point editor par id + coords (utilise depuis le bouton 🗑️ de la
// popup d'un point — voir utils.js > buildPointPopupHtml). Le matching par id
// + coords permet de disambiguer si plusieurs points ont meme id (peu probable
// car id == nom, qui doit etre unique, mais safety net).
// Si pas trouve par id+coords, fallback match par coords seules.
window.supprimerPointEditor = function(id, x, y) {
  if (typeof x !== "number" || typeof y !== "number") return;

  // Match exact (id + coords)
  let idx = -1;
  for (let i = 0; i < listePoints.length; i++) {
    const p = listePoints[i];
    if (String(p.id || "") === String(id) && p.x === x && p.y === y) {
      idx = i;
      break;
    }
  }
  // Fallback : match par coords seules (au cas ou l'id a ete modifie)
  if (idx === -1) {
    for (let i = 0; i < listePoints.length; i++) {
      if (listePoints[i].x === x && listePoints[i].y === y) {
        idx = i;
        break;
      }
    }
  }
  if (idx === -1) {
    console.warn("[Editor] Point a supprimer introuvable :", id, x, y);
    return;
  }

  // Retire du tableau + re-render (renderEditorPoints clear le layerEditor + re-add)
  listePoints.splice(idx, 1);
  if (window.renderEditorPoints) window.renderEditorPoints();

  // Ferme la popup ouverte (sinon elle reste affichee a l'emplacement du marker
  // qui n'existe plus)
  if (window.map) try { window.map.closePopup(); } catch(e) {}

  console.log("[Editor] Point supprimé :", id, "à", x, y, "— restant :", listePoints.length);
};
