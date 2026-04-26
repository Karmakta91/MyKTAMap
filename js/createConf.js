// =========================
// PLANNER.JS
// Générateur de ZIP plan complet (plan-config.json + assets)
// Dépendance : JSZip (déjà chargé dans import.html)
// =========================

// Icônes par défaut embarquées dans le set du projet
const PLANNER_DEFAULT_ICONS = {
  default:  "icon/iconetrack.png",
  track:    "icon/iconetrack.png",
  salle:    "icon/house.png",
  pa:       "icon/pa.png",
  pc:       "icon/pc.png",
  pb:       "icon/pb.png",
  pe:       "icon/pe.png",
  vehicule: "icon/vehicule.png",
  elec:     "icon/elec.png",
  epure:    "icon/epure.png",
  ps:       "icon/ps.png",
  info:     "icon/info.png",
  chatiere: "icon/chatiere.png",
  passage:  "icon/passage.png",
  danger:   "icon/danger.png"
};

// Editor JSON vide (calque ajouts manuels)
const PLANNER_EDITOR_JSON = JSON.stringify({ type: "editor", version: 1, data: [] }, null, 2);

// Compteurs pour les IDs de layers
let _imageLayerCount = 0;
let _dataLayerCount  = 0;

// =========================
// MODALE PRINCIPALE
// =========================
function afficherPlanner() {
  const existing = document.getElementById("kta-planner-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id = "kta-planner-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:640px;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">📦 Créer un nouveau plan</span>
        <button class="kta-panneau-close" id="kta-planner-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps" id="kta-planner-corps">

        <!-- 1. MÉTADONNÉES -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📋 Informations du plan</div>
          <div class="kta-planner-grille">

            <label class="kta-cfg-label">Nom du plan <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="pl_name" type="text" placeholder="ex: Carrière du Val">

            <label class="kta-cfg-label">Version</label>
            <input class="kta-cfg-input" id="pl_version" type="text" placeholder="V1">

            <label class="kta-cfg-label">Auteur</label>
            <input class="kta-cfg-input" id="pl_author" type="text" placeholder="ex: KARMA">

            <label class="kta-cfg-label">Largeur image (px) <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="pl_width" type="number" placeholder="ex: 1044">

            <label class="kta-cfg-label">Hauteur image (px) <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="pl_height" type="number" placeholder="ex: 610">

          </div>
        </div>

        <!-- 2. IMAGES PRINCIPALES -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🖼️ Images principales</div>

          <div class="kta-planner-upload-ligne">
            <span class="kta-cfg-label">Image du plan <span class="kta-planner-req">*</span></span>
            <label class="kta-planner-upload-btn" for="pl_baseImage">📂 Choisir</label>
            <input type="file" id="pl_baseImage" accept="image/*" style="display:none">
            <span class="kta-planner-upload-nom" id="pl_baseImage_nom">Aucun fichier</span>
          </div>

          <div class="kta-planner-upload-ligne">
            <span class="kta-cfg-label">Carte de collision <span class="kta-planner-hint">(optionnel)</span></span>
            <label class="kta-planner-upload-btn" for="pl_collision">📂 Choisir</label>
            <input type="file" id="pl_collision" accept="image/*" style="display:none">
            <span class="kta-planner-upload-nom" id="pl_collision_nom">Aucun fichier</span>
          </div>
        </div>

        <!-- 3. CALQUES IMAGE -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">
            🗂️ Calques image supplémentaires
            <button class="kta-planner-add-btn" id="pl_addImageLayer" title="Ajouter un calque image">+ Ajouter</button>
          </div>
          <div id="pl_imageLayers_list" class="kta-planner-layers-list">
            <p class="kta-planner-empty">Aucun calque image — cliquez sur + Ajouter</p>
          </div>
        </div>

        <!-- 4. CALQUES DONNÉES -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">
            📊 Calques de données JSON
            <button class="kta-planner-add-btn" id="pl_addDataLayer" title="Ajouter un calque de données">+ Ajouter</button>
          </div>
          <p class="kta-planner-info">Le calque <code>editor</code> (ajouts manuels) est toujours inclus automatiquement.</p>
          <div id="pl_dataLayers_list" class="kta-planner-layers-list">
            <p class="kta-planner-empty">Aucun calque de données — cliquez sur + Ajouter</p>
          </div>
        </div>

        <!-- 5. TRACKING -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Paramètres de tracking</div>
          <div class="kta-planner-grille">

            <label class="kta-cfg-label">Position initiale X</label>
            <input class="kta-cfg-input" id="pl_startX" type="number" value="0">

            <label class="kta-cfg-label">Position initiale Y</label>
            <input class="kta-cfg-input" id="pl_startY" type="number" value="0">

            <label class="kta-cfg-label">Échelle (px/m)</label>
            <input class="kta-cfg-input" id="pl_scale" type="number" step="0.1" value="4.9">

            <label class="kta-cfg-label">Taille d'un pas (m)</label>
            <input class="kta-cfg-input" id="pl_stepLength" type="number" step="0.1" value="0.7">

            <label class="kta-cfg-label">Seuil détection</label>
            <input class="kta-cfg-input" id="pl_stepThreshold" type="number" value="13">

            <label class="kta-cfg-label">Cooldown (ms)</label>
            <input class="kta-cfg-input" id="pl_stepCooldown" type="number" value="400">

          </div>
        </div>

        <!-- 6. ICÔNES -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🎨 Icônes</div>
          <p class="kta-planner-info">
            Les icônes utilisent le set par défaut du projet (<code>icon/*.png</code>).
            Assurez-vous que les icônes sont présentes sur votre serveur.
          </p>
          <div class="kta-planner-icons-preview" id="pl_icons_preview">
            ${Object.entries(PLANNER_DEFAULT_ICONS).map(function(e) {
              return `<div class="kta-planner-icon-item" title="${e[0]}">
                <img src="${e[1]}" onerror="this.style.opacity='0.2'" alt="${e[0]}">
                <span>${e[0]}</span>
              </div>`;
            }).join("")}
          </div>
        </div>

        <!-- ERREUR -->
        <div id="kta-planner-erreur" class="kta-conv-erreur" style="display:none;"></div>

        <!-- ACTIONS -->
        <div class="kta-conv-actions" style="margin-top:16px;">
          <button class="kta-btn kta-btn-ghost" id="kta-planner-annuler">Annuler</button>
          <button class="kta-btn kta-btn-primary" id="kta-planner-generer">📦 Générer le ZIP</button>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);
  _imageLayerCount = 0;
  _dataLayerCount  = 0;

  // Fermeture
  document.getElementById("kta-planner-close").addEventListener("click",   function () { modal.remove(); });
  document.getElementById("kta-planner-annuler").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });

  // Upload image principale
  _bindUploadLabel("pl_baseImage",  "pl_baseImage_nom");
  _bindUploadLabel("pl_collision",  "pl_collision_nom");

  // Ajout de calques
  document.getElementById("pl_addImageLayer").addEventListener("click", function () { _ajouterImageLayer(); });
  document.getElementById("pl_addDataLayer").addEventListener("click",  function () { _ajouterDataLayer(); });

  // Génération
  document.getElementById("kta-planner-generer").addEventListener("click", _genererZip);
}

// =========================
// BIND LABEL UPLOAD
// =========================
function _bindUploadLabel(inputId, nomId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener("change", function () {
    const nom = document.getElementById(nomId);
    if (nom) nom.textContent = input.files[0] ? "✅ " + input.files[0].name : "Aucun fichier";
  });
}

// =========================
// AJOUT CALQUE IMAGE
// =========================
function _ajouterImageLayer() {
  const list = document.getElementById("pl_imageLayers_list");
  if (!list) return;

  const items = list.querySelectorAll(".kta-planner-layer-item");
  if (items.length >= 10) {
    _plannerErreur("Maximum 10 calques image.");
    return;
  }

  // Vider le message "aucun calque"
  const empty = list.querySelector(".kta-planner-empty");
  if (empty) empty.remove();

  _imageLayerCount++;
  const id = "il_" + _imageLayerCount;

  const item = document.createElement("div");
  item.className = "kta-planner-layer-item";
  item.dataset.layerId = id;
  item.innerHTML = `
    <div class="kta-planner-layer-header">
      <span class="kta-planner-layer-num">Calque image #${_imageLayerCount}</span>
      <button class="kta-planner-remove-btn" data-remove="${id}">✕</button>
    </div>
    <div class="kta-planner-grille">
      <label class="kta-cfg-label">Identifiant <span class="kta-planner-req">*</span></label>
      <input class="kta-cfg-input" id="${id}_id" type="text" placeholder="ex: legende">

      <label class="kta-cfg-label">Label affiché</label>
      <input class="kta-cfg-input" id="${id}_label" type="text" placeholder="ex: Légende">

      <label class="kta-cfg-label">Visible au chargement</label>
      <select class="kta-cfg-input" id="${id}_visible">
        <option value="true">Oui</option>
        <option value="false">Non</option>
      </select>

      <label class="kta-cfg-label">Ordre (z-index)</label>
      <input class="kta-cfg-input" id="${id}_order" type="number" value="${_imageLayerCount * 10}">
    </div>
    <div class="kta-planner-upload-ligne">
      <span class="kta-cfg-label">Fichier image <span class="kta-planner-req">*</span></span>
      <label class="kta-planner-upload-btn" for="${id}_file">📂 Choisir</label>
      <input type="file" id="${id}_file" accept="image/*" style="display:none">
      <span class="kta-planner-upload-nom" id="${id}_file_nom">Aucun fichier</span>
    </div>
  `;

  list.appendChild(item);
  _bindUploadLabel(id + "_file", id + "_file_nom");

  item.querySelector("[data-remove]").addEventListener("click", function () {
    item.remove();
    if (!list.querySelector(".kta-planner-layer-item")) {
      list.innerHTML = '<p class="kta-planner-empty">Aucun calque image — cliquez sur + Ajouter</p>';
    }
  });
}

// =========================
// AJOUT CALQUE DONNÉES
// =========================
function _ajouterDataLayer() {
  const list = document.getElementById("pl_dataLayers_list");
  if (!list) return;

  const items = list.querySelectorAll(".kta-planner-layer-item");
  if (items.length >= 10) {
    _plannerErreur("Maximum 10 calques de données.");
    return;
  }

  const empty = list.querySelector(".kta-planner-empty");
  if (empty) empty.remove();

  _dataLayerCount++;
  const id = "dl_" + _dataLayerCount;

  const item = document.createElement("div");
  item.className = "kta-planner-layer-item";
  item.dataset.layerId = id;
  item.innerHTML = `
    <div class="kta-planner-layer-header">
      <span class="kta-planner-layer-num">Calque données #${_dataLayerCount}</span>
      <button class="kta-planner-remove-btn" data-remove="${id}">✕</button>
    </div>
    <div class="kta-planner-grille">
      <label class="kta-cfg-label">Identifiant <span class="kta-planner-req">*</span></label>
      <input class="kta-cfg-input" id="${id}_id" type="text" placeholder="ex: puits">

      <label class="kta-cfg-label">Label affiché</label>
      <input class="kta-cfg-input" id="${id}_label" type="text" placeholder="ex: Puits">

      <label class="kta-cfg-label">Visible au chargement</label>
      <select class="kta-cfg-input" id="${id}_visible">
        <option value="true">Oui</option>
        <option value="false">Non</option>
      </select>
    </div>
    <div class="kta-planner-upload-ligne">
      <span class="kta-cfg-label">Fichier JSON <span class="kta-planner-hint">(optionnel — créé vide sinon)</span></span>
      <label class="kta-planner-upload-btn" for="${id}_file">📂 Choisir</label>
      <input type="file" id="${id}_file" accept=".json" style="display:none">
      <span class="kta-planner-upload-nom" id="${id}_file_nom">Aucun fichier</span>
    </div>
  `;

  list.appendChild(item);
  _bindUploadLabel(id + "_file", id + "_file_nom");

  item.querySelector("[data-remove]").addEventListener("click", function () {
    item.remove();
    if (!list.querySelector(".kta-planner-layer-item")) {
      list.innerHTML = '<p class="kta-planner-empty">Aucun calque de données — cliquez sur + Ajouter</p>';
    }
  });
}

// =========================
// ERREUR / RESET ERREUR
// =========================
function _plannerErreur(msg) {
  const el = document.getElementById("kta-planner-erreur");
  if (!el) return;
  el.textContent = msg || "";
  el.style.display = msg ? "block" : "none";
}

// =========================
// LECTURE FICHIER → ArrayBuffer
// =========================
function _lireFichier(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload  = function (e) { resolve(e.target.result); };
    reader.onerror = function ()  { reject(new Error("Impossible de lire : " + file.name)); };
    reader.readAsArrayBuffer(file);
  });
}

// =========================
// GÉNÉRATION DU ZIP
// =========================
async function _genererZip() {
  _plannerErreur("");

  // ── Validation des champs obligatoires ───────────────────
  const name    = document.getElementById("pl_name").value.trim();
  const version = document.getElementById("pl_version").value.trim() || "V1";
  const author  = document.getElementById("pl_author").value.trim();
  const width   = parseInt(document.getElementById("pl_width").value,  10);
  const height  = parseInt(document.getElementById("pl_height").value, 10);

  const baseImageFile    = document.getElementById("pl_baseImage").files[0];
  const collisionFile    = document.getElementById("pl_collision").files[0];

  if (!name)          { _plannerErreur("Le nom du plan est obligatoire."); return; }
  if (!width || !height) { _plannerErreur("Les dimensions du plan sont obligatoires."); return; }
  if (!baseImageFile) { _plannerErreur("L'image principale est obligatoire."); return; }

  if (typeof JSZip === "undefined") {
    _plannerErreur("JSZip n'est pas chargé. Vérifiez votre connexion Internet.");
    return;
  }

  // Feedback
  const btnGen = document.getElementById("kta-planner-generer");
  btnGen.disabled = true;
  btnGen.textContent = "⏳ Génération…";

  try {
    const zip = new JSZip();
    const dataFolder = zip.folder("data");
    const iconFolder = zip.folder("icon");

    // ── Constantes de chemins dans le ZIP ────────────────────
    const baseImageName    = "data/" + baseImageFile.name;
    const collisionName    = collisionFile ? "data/" + collisionFile.name : null;

    // ── Image principale ─────────────────────────────────────
    dataFolder.file(baseImageFile.name, await _lireFichier(baseImageFile));

    // ── Carte de collision ───────────────────────────────────
    if (collisionFile) {
      dataFolder.file(collisionFile.name, await _lireFichier(collisionFile));
    }

    // ── Calques image ────────────────────────────────────────
    const imageLayers = [];
    const ilItems = document.querySelectorAll("#pl_imageLayers_list .kta-planner-layer-item");

    for (const item of ilItems) {
      const lid     = item.dataset.layerId;
      const ilId    = document.getElementById(lid + "_id").value.trim();
      const ilLabel = document.getElementById(lid + "_label").value.trim() || ilId;
      const ilVis   = document.getElementById(lid + "_visible").value === "true";
      const ilOrder = parseInt(document.getElementById(lid + "_order").value, 10) || 10;
      const ilFile  = document.getElementById(lid + "_file").files[0];

      if (!ilId)   { _plannerErreur("L'identifiant du calque image #" + lid + " est obligatoire."); btnGen.disabled = false; btnGen.textContent = "📦 Générer le ZIP"; return; }
      if (!ilFile) { _plannerErreur("Le fichier du calque image \"" + ilId + "\" est obligatoire."); btnGen.disabled = false; btnGen.textContent = "📦 Générer le ZIP"; return; }

      const filePath = "data/" + ilFile.name;
      dataFolder.file(ilFile.name, await _lireFichier(ilFile));

      imageLayers.push({
        id: ilId,
        label: ilLabel,
        file: filePath,
        visible: ilVis,
        order: ilOrder
      });
    }

    // ── Calques données ──────────────────────────────────────
    const dataLayers = [];
    const dlItems = document.querySelectorAll("#pl_dataLayers_list .kta-planner-layer-item");

    for (const item of dlItems) {
      const lid     = item.dataset.layerId;
      const dlId    = document.getElementById(lid + "_id").value.trim();
      const dlLabel = document.getElementById(lid + "_label").value.trim() || dlId;
      const dlVis   = document.getElementById(lid + "_visible").value === "true";
      const dlFile  = document.getElementById(lid + "_file").files[0];

      if (!dlId) { _plannerErreur("L'identifiant du calque données #" + lid + " est obligatoire."); btnGen.disabled = false; btnGen.textContent = "📦 Générer le ZIP"; return; }

      const fileName = dlId + ".json";
      const filePath = "data/" + fileName;

      if (dlFile) {
        // Fichier fourni par l'utilisateur
        dataFolder.file(fileName, await _lireFichier(dlFile));
      } else {
        // Créer un fichier JSON vide au bon format
        const emptyJson = JSON.stringify({ type: dlId, version: 1, data: [] }, null, 2);
        dataFolder.file(fileName, emptyJson);
      }

      dataLayers.push({
        id: dlId,
        label: dlLabel,
        file: filePath,
        visible: dlVis
      });
    }

    // ── Calque editor (toujours présent) ─────────────────────
    dataFolder.file("editor.json", PLANNER_EDITOR_JSON);
    dataLayers.push({
      id: "editor",
      label: "Ajouts",
      file: "data/editor.json",
      visible: true
    });

    // ── Tracking ─────────────────────────────────────────────
    const tracking = {
      startX:        parseInt(document.getElementById("pl_startX").value, 10) || 0,
      startY:        parseInt(document.getElementById("pl_startY").value, 10) || 0,
      scale:         parseFloat(document.getElementById("pl_scale").value) || 4.9,
      stepLength:    parseFloat(document.getElementById("pl_stepLength").value) || 0.7,
      stepThreshold: parseFloat(document.getElementById("pl_stepThreshold").value) || 13,
      stepCooldown:  parseInt(document.getElementById("pl_stepCooldown").value, 10) || 400
    };

    // ── plan-config.json ─────────────────────────────────────
    const planConfig = {
      plan: {
        name:           name,
        version:        version,
        author:         author,
        imageWidth:     width,
        imageHeight:    height,
        baseImage:      baseImageName,
        collisionImage: collisionName || ""
      },
      imageLayers: imageLayers,
      dataLayers:  dataLayers,
      tracking:    tracking,
      icons:       PLANNER_DEFAULT_ICONS
    };

    zip.file("plan-config.json", JSON.stringify(planConfig, null, 2));

    // ── Génération et téléchargement ─────────────────────────
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = "plan_" + safeName + ".zip";
    a.click();
    URL.revokeObjectURL(url);

    // Fermer la modale après succès
    const modal = document.getElementById("kta-planner-modal");
    if (modal) modal.remove();

  } catch (err) {
    console.error("[Planner] Erreur :", err);
    _plannerErreur("❌ Erreur : " + (err.message || err));
    btnGen.disabled = false;
    btnGen.textContent = "📦 Générer le ZIP";
  }
}

// =========================
// EXPORT GLOBAL
// =========================
window.afficherPlanner = afficherPlanner;
