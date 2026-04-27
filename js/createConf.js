// =========================
// PLANNER.JS
// Générateur ZIP + onglet Modifier existant + icon manager dynamique
// =========================

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

const PLANNER_EDITOR_JSON   = JSON.stringify({ type: "editor", version: 1, data: [] }, null, 2);
const PLANNER_SYSTEME_TAGS  = ["default", "track"];

let _imageLayerCount   = 0;
let _dataLayerCount    = 0;
let _iconRowCount      = 0;
let _plannerOrigAssets = {};
let _plannerMode       = "nouveau";

// =========================
// MODALE PRINCIPALE
// =========================
function afficherPlanner() {
  const existing = document.getElementById("kta-planner-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id        = "kta-planner-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:660px;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">📦 Créer / Modifier un plan</span>
        <button class="kta-panneau-close" id="kta-planner-close">✕</button>
      </div>

      <div class="kta-readme-modal-corps" id="kta-planner-corps">

        <!-- ZIP OPTIONNEL -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📂 Charger un ZIP existant <span class="kta-planner-hint">(optionnel)</span></div>
          <p class="kta-planner-info">
            Tu peux importer un ZIP existant pour pré-remplir le formulaire.
            Sinon, remplis simplement le formulaire pour créer un nouveau plan.
          </p>

          <div class="kta-conv-drop" id="kta-planner-zip-drop" style="position:relative; overflow:hidden;">
            <span style="font-size:28px;">📦</span>
            <span id="kta-planner-zip-label">Glisse un ZIP ici ou clique pour sélectionner</span>

            <input
              type="file"
              id="kta-planner-zip-input"
              accept=".zip,application/zip"
              style="
                position:absolute;
                inset:0;
                width:100%;
                height:100%;
                opacity:0;
                cursor:pointer;
                z-index:5;
              "
            >
          </div>

          <div id="kta-planner-zip-status" style="margin-top:8px;font-size:13px;min-height:18px;"></div>
        </div>

        <!-- 1. MÉTADONNÉES -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">📋 Informations du plan</div>
          <div class="kta-planner-grille">
            <label class="kta-cfg-label">Nom <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="pl_name" type="text" placeholder="ex: Carrière du Val">

            <label class="kta-cfg-label">Version</label>
            <input class="kta-cfg-input" id="pl_version" type="text" placeholder="V1">

            <label class="kta-cfg-label">Auteur</label>
            <input class="kta-cfg-input" id="pl_author" type="text" placeholder="ex: KARMA">

            <label class="kta-cfg-label">Largeur (px) <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="pl_width" type="number" placeholder="ex: 1044">

            <label class="kta-cfg-label">Hauteur (px) <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="pl_height" type="number" placeholder="ex: 610">
          </div>
        </div>

        <!-- 2. IMAGES -->
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
            🗂️ Calques image
            <button class="kta-planner-add-btn" id="pl_addImageLayer">+ Ajouter</button>
          </div>
          <div id="pl_imageLayers_list" class="kta-planner-layers-list">
            <p class="kta-planner-empty">Aucun calque image</p>
          </div>
        </div>

        <!-- 4. CALQUES DONNÉES -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">
            📊 Calques de données
            <button class="kta-planner-add-btn" id="pl_addDataLayer">+ Ajouter</button>
          </div>
          <p class="kta-planner-info">Le calque <code>editor</code> est toujours inclus automatiquement.</p>
          <div id="pl_dataLayers_list" class="kta-planner-layers-list">
            <p class="kta-planner-empty">Aucun calque de données</p>
          </div>
        </div>

        <!-- 5. TRACKING -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Tracking</div>
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

        <!-- 6. ICÔNES & TAGS -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">
            🎨 Icônes &amp; Tags
            <div style="display:inline-flex;gap:6px;margin-left:10px;">
              <button class="kta-planner-add-btn" id="pl_chargerDefauts">↺ Charger défauts</button>
              <button class="kta-planner-add-btn" id="pl_addIconRow">+ Ajouter un tag</button>
            </div>
          </div>

          <p class="kta-planner-info">
            Chaque tag définit un type de point cliquable dans le mode ajout.
            Les tags <code>default</code> et <code>track</code> sont toujours inclus.
          </p>

          <div class="kta-planner-icon-header">
            <span style="width:36px;flex-shrink:0;"></span>
            <span style="width:100px;flex-shrink:0;font-weight:600;">Tag</span>
            <span style="flex:1;font-weight:600;">Icône</span>
          </div>

          <div id="pl_icons_list" class="kta-planner-layers-list" style="max-height:260px;overflow-y:auto;">
            <p class="kta-planner-empty">Cliquez sur "↺ Charger défauts" ou "+ Ajouter un tag"</p>
          </div>
        </div>

        <div id="kta-planner-erreur" class="kta-conv-erreur" style="display:none;"></div>

        <div class="kta-conv-actions" style="margin-top:16px;">
          <button class="kta-btn kta-btn-ghost" id="kta-planner-annuler">Annuler</button>
          <button class="kta-btn kta-btn-primary" id="kta-planner-generer">📦 Générer le ZIP</button>
        </div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  _imageLayerCount   = 0;
  _dataLayerCount    = 0;
  _iconRowCount      = 0;
  _plannerOrigAssets = {};
  _plannerMode       = "nouveau";

  document.getElementById("kta-planner-close").addEventListener("click", function() { modal.remove(); });
  document.getElementById("kta-planner-annuler").addEventListener("click", function() { modal.remove(); });
  modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });

  _bindUploadLabel("pl_baseImage", "pl_baseImage_nom");
  _bindUploadLabel("pl_collision", "pl_collision_nom");

  document.getElementById("pl_addImageLayer").addEventListener("click", function() { _ajouterImageLayer(); });
  document.getElementById("pl_addDataLayer").addEventListener("click", function() { _ajouterDataLayer(); });

  document.getElementById("pl_chargerDefauts").addEventListener("click", _chargerIconesDefaut);
  document.getElementById("pl_addIconRow").addEventListener("click", function() {
    _ajouterIconRow("", "", null, false);
  });

  const zipDrop  = document.getElementById("kta-planner-zip-drop");
  const zipInput = document.getElementById("kta-planner-zip-input");

  zipInput.addEventListener("click", function() {
    zipInput.value = "";
  });

  zipInput.addEventListener("change", function() {
    const f = zipInput.files[0];
    if (!f) return;

    if (!f.name.toLowerCase().endsWith(".zip")) {
      _plannerZipStatus("❌ Le fichier doit être un .zip", true);
      return;
    }

    _plannerMode = "modifier";
    _chargerZipModifier(f);
  });

  zipDrop.addEventListener("dragover", function(e) {
    e.preventDefault();
    zipDrop.classList.add("dragover");
  });

  zipDrop.addEventListener("dragleave", function() {
    zipDrop.classList.remove("dragover");
  });

  zipDrop.addEventListener("drop", function(e) {
    e.preventDefault();
    zipDrop.classList.remove("dragover");

    const f = e.dataTransfer.files[0];

    if (!f || !f.name.toLowerCase().endsWith(".zip")) {
      _plannerZipStatus("❌ Le fichier doit être un .zip", true);
      return;
    }

    _plannerMode = "modifier";
    _chargerZipModifier(f);
  });

  document.getElementById("kta-planner-generer").addEventListener("click", _genererZip);
}
// =========================
// CHARGER ZIP POUR MODIFICATION
// =========================
async function _chargerZipModifier(file) {
  _plannerZipStatus("⏳ Extraction en cours…", false);
  try {
    if (typeof JSZip === "undefined") throw new Error("JSZip non chargé");
    const zip = await JSZip.loadAsync(file);
    let planConfigFile = null;
    _plannerOrigAssets = {};

    for (const entry of Object.values(zip.files).filter(function(f) { return !f.dir; })) {
      const name = entry.name.split("/").pop();
      if (!name) continue;
      const blob = await entry.async("blob");
      const f    = new File([blob], name, { type: _guessMime(name) });
      if (name === "plan-config.json") planConfigFile = f;
      else _plannerOrigAssets[name] = f;
    }

    if (!planConfigFile) throw new Error("plan-config.json introuvable dans le ZIP");
    const config = JSON.parse(await planConfigFile.text());
    _preRemplirFormulaire(config);
    _plannerZipStatus("✅ " + file.name + " chargé — formulaire pré-rempli", false);
  } catch(err) {
    _plannerZipStatus("❌ " + (err.message || err), true);
  }
}

function _plannerZipStatus(msg, isErr) {
  const el = document.getElementById("kta-planner-zip-status");
  if (el) { el.textContent = msg; el.style.color = isErr ? "#ff8080" : "#8cb4ff"; }
}

function _guessMime(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return ({json:"application/json",png:"image/png",jpg:"image/jpeg",
           jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp"})[ext] || "application/octet-stream";
}

// =========================
// PRÉ-REMPLIR LE FORMULAIRE
// =========================
function _preRemplirFormulaire(config) {
  const plan = config.plan || {}, t = config.tracking || {};

  function sv(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
  function sn(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

  sv("pl_name",    plan.name        || "");
  sv("pl_version", plan.version     || "");
  sv("pl_author",  plan.author      || "");
  sv("pl_width",   plan.imageWidth  || "");
  sv("pl_height",  plan.imageHeight || "");
  sv("pl_startX",  t.startX        ?? 0);
  sv("pl_startY",  t.startY        ?? 0);
  sv("pl_scale",   t.scale         ?? 4.9);
  sv("pl_stepLength",    t.stepLength    ?? 0.7);
  sv("pl_stepThreshold", t.stepThreshold ?? 13);
  sv("pl_stepCooldown",  t.stepCooldown  ?? 400);

  if (plan.baseImage)      sn("pl_baseImage_nom", "📄 " + plan.baseImage.split("/").pop());
  if (plan.collisionImage) sn("pl_collision_nom",  "📄 " + plan.collisionImage.split("/").pop());

  // Calques image
  const ilList = document.getElementById("pl_imageLayers_list");
  if (ilList) { ilList.innerHTML = ""; _imageLayerCount = 0; }
  (config.imageLayers || []).forEach(function(l) { _ajouterImageLayer(l); });
  if (ilList && !ilList.querySelector(".kta-planner-layer-item"))
    ilList.innerHTML = '<p class="kta-planner-empty">Aucun calque image</p>';

  // Calques données (sans editor)
  const dlList = document.getElementById("pl_dataLayers_list");
  if (dlList) { dlList.innerHTML = ""; _dataLayerCount = 0; }
  (config.dataLayers || []).filter(function(l) { return l.id !== "editor"; })
    .forEach(function(l) { _ajouterDataLayer(l); });
  if (dlList && !dlList.querySelector(".kta-planner-layer-item"))
    dlList.innerHTML = '<p class="kta-planner-empty">Aucun calque de données</p>';

  // Icônes
  const icList = document.getElementById("pl_icons_list");
  if (icList) { icList.innerHTML = ""; _iconRowCount = 0; }
  Object.entries(config.icons || {}).forEach(function(e) {
    _ajouterIconRow(e[0], e[1], null, PLANNER_SYSTEME_TAGS.includes(e[0]));
  });
  if (icList && !icList.querySelector(".kta-planner-icon-row"))
    icList.innerHTML = '<p class="kta-planner-empty">Aucune icône définie</p>';
}

// =========================
// BIND UPLOAD
// =========================
function _bindUploadLabel(inputId, nomId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener("change", function() {
    const nom = document.getElementById(nomId);
    if (nom) nom.textContent = input.files[0] ? "✅ " + input.files[0].name : "Aucun fichier";
  });
}

// =========================
// ICON MANAGER
// =========================
function _chargerIconesDefaut() {
  const list = document.getElementById("pl_icons_list");
  if (!list) return;
  list.innerHTML = "";
  _iconRowCount  = 0;
  Object.entries(PLANNER_DEFAULT_ICONS).forEach(function(e) {
    _ajouterIconRow(e[0], e[1], null, PLANNER_SYSTEME_TAGS.includes(e[0]));
  });
}

function _ajouterIconRow(tag, defaultPath, file, isSysteme) {
  const list = document.getElementById("pl_icons_list");
  if (!list) return;
  const empty = list.querySelector(".kta-planner-empty");
  if (empty) empty.remove();

  _iconRowCount++;
  const id   = "ir_" + _iconRowCount;
  const sys  = !!isSysteme;

  const row  = document.createElement("div");
  row.className    = "kta-planner-icon-row";
  row.dataset.rowId = id;

  row.innerHTML = `
    <div class="kta-planner-icon-thumb" id="${id}_thumb">
      <img src="${defaultPath || ''}" alt="${tag}"
        style="width:28px;height:28px;object-fit:contain;display:block;"
        onerror="this.style.opacity='0.2'">
    </div>
    <input class="kta-cfg-input kta-planner-icon-tag" id="${id}_tag"
      type="text" value="${tag}" placeholder="ex: fontaine"
      style="width:100px;flex-shrink:0;"
      ${sys ? "readonly title='Tag système — non modifiable'" : ""}>
    <label class="kta-planner-upload-btn" for="${id}_file" style="flex-shrink:0;white-space:nowrap;">
      ${file ? "✅ " + file.name : "📂 Icône"}
    </label>
    <input type="file" id="${id}_file" accept="image/*" style="display:none">
    <span class="kta-planner-icon-path" id="${id}_path"
      title="${defaultPath || ''}"
      style="font-size:11px;color:#8892a4;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:6px;">
      ${file ? file.name : (defaultPath || "—")}
    </span>
    ${sys ? "" : `<button class="kta-planner-remove-btn" data-remove="${id}">✕</button>`}
  `;

  list.appendChild(row);
  if (file) row._customFile = file;

  const fileInput = document.getElementById(id + "_file");
  const img       = row.querySelector("img");
  const label     = row.querySelector(`label[for="${id}_file"]`);
  const pathSpan  = document.getElementById(id + "_path");

  fileInput.addEventListener("change", function() {
    const f = fileInput.files[0];
    if (!f) return;
    row._customFile = f;
    label.textContent = "✅ " + f.name;
    pathSpan.textContent = f.name;
    pathSpan.title = f.name;
    const url = URL.createObjectURL(f);
    img.onload = function() { URL.revokeObjectURL(url); };
    img.src = url;
  });

  if (!sys) {
    row.querySelector("[data-remove]").addEventListener("click", function() {
      row.remove();
      if (!list.querySelector(".kta-planner-icon-row"))
        list.innerHTML = '<p class="kta-planner-empty">Aucune icône — cliquez sur + Ajouter un tag</p>';
    });
  }
}

// =========================
// CALQUE IMAGE
// =========================
function _ajouterImageLayer(prefill) {
  const list = document.getElementById("pl_imageLayers_list");
  if (!list) return;
  if (list.querySelectorAll(".kta-planner-layer-item").length >= 10) {
    _plannerErreur("Maximum 10 calques image."); return;
  }
  const empty = list.querySelector(".kta-planner-empty");
  if (empty) empty.remove();

  _imageLayerCount++;
  const id = "il_" + _imageLayerCount;
  const p  = prefill || {};

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
      <input class="kta-cfg-input" id="${id}_id"      type="text"   value="${p.id    || ''}" placeholder="ex: legende">
      <label class="kta-cfg-label">Label</label>
      <input class="kta-cfg-input" id="${id}_label"   type="text"   value="${p.label || ''}" placeholder="ex: Légende">
      <label class="kta-cfg-label">Visible</label>
      <select class="kta-cfg-input" id="${id}_visible">
        <option value="true"  ${p.visible !== false ? "selected" : ""}>Oui</option>
        <option value="false" ${p.visible === false ? "selected" : ""}>Non</option>
      </select>
      <label class="kta-cfg-label">Ordre</label>
      <input class="kta-cfg-input" id="${id}_order"   type="number" value="${p.order || _imageLayerCount * 10}">
    </div>
    <div class="kta-planner-upload-ligne">
      <span class="kta-cfg-label">Image <span class="kta-planner-req">*</span></span>
      <label class="kta-planner-upload-btn" for="${id}_file">📂 Choisir</label>
      <input type="file" id="${id}_file" accept="image/*" style="display:none">
      <span class="kta-planner-upload-nom" id="${id}_file_nom">
        ${p.file ? "📄 " + p.file.split("/").pop() : "Aucun fichier"}
      </span>
    </div>
  `;

  list.appendChild(item);
  _bindUploadLabel(id + "_file", id + "_file_nom");
  item.querySelector("[data-remove]").addEventListener("click", function() {
    item.remove();
    if (!list.querySelector(".kta-planner-layer-item"))
      list.innerHTML = '<p class="kta-planner-empty">Aucun calque image</p>';
  });
}

// =========================
// CALQUE DONNÉES
// =========================
function _ajouterDataLayer(prefill) {
  const list = document.getElementById("pl_dataLayers_list");
  if (!list) return;
  if (list.querySelectorAll(".kta-planner-layer-item").length >= 10) {
    _plannerErreur("Maximum 10 calques de données."); return;
  }
  const empty = list.querySelector(".kta-planner-empty");
  if (empty) empty.remove();

  _dataLayerCount++;
  const id = "dl_" + _dataLayerCount;
  const p  = prefill || {};

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
      <input class="kta-cfg-input" id="${id}_id"    type="text" value="${p.id    || ''}" placeholder="ex: puits">
      <label class="kta-cfg-label">Label</label>
      <input class="kta-cfg-input" id="${id}_label" type="text" value="${p.label || ''}" placeholder="ex: Puits">
      <label class="kta-cfg-label">Visible</label>
      <select class="kta-cfg-input" id="${id}_visible">
        <option value="true"  ${p.visible !== false ? "selected" : ""}>Oui</option>
        <option value="false" ${p.visible === false ? "selected" : ""}>Non</option>
      </select>
    </div>
    <div class="kta-planner-upload-ligne">
      <span class="kta-cfg-label">JSON <span class="kta-planner-hint">(optionnel)</span></span>
      <label class="kta-planner-upload-btn" for="${id}_file">📂 Choisir</label>
      <input type="file" id="${id}_file" accept=".json" style="display:none">
      <span class="kta-planner-upload-nom" id="${id}_file_nom">
        ${p.file ? "📄 " + p.file.split("/").pop() : "Aucun fichier"}
      </span>
    </div>
  `;

  list.appendChild(item);
  _bindUploadLabel(id + "_file", id + "_file_nom");
  item.querySelector("[data-remove]").addEventListener("click", function() {
    item.remove();
    if (!list.querySelector(".kta-planner-layer-item"))
      list.innerHTML = '<p class="kta-planner-empty">Aucun calque de données</p>';
  });
}

// =========================
// ERREUR
// =========================
function _plannerErreur(msg) {
  const el = document.getElementById("kta-planner-erreur");
  if (!el) return;
  el.textContent = msg || "";
  el.style.display = msg ? "block" : "none";
}

// =========================
// LECTURE FICHIER
// =========================
function _lireFichier(file) {
  return new Promise(function(resolve, reject) {
    const r = new FileReader();
    r.onload  = function(e) { resolve(e.target.result); };
    r.onerror = function()  { reject(new Error("Impossible de lire : " + file.name)); };
    r.readAsArrayBuffer(file);
  });
}

// Récupérer fichier : upload prioritaire, puis asset ZIP original
function _getFile(inputId, logicalPath) {
  const input = document.getElementById(inputId);
  if (input && input.files && input.files[0]) return input.files[0];
  if (logicalPath) {
    const name = logicalPath.split("/").pop();
    if (_plannerOrigAssets[name]) return _plannerOrigAssets[name];
  }
  return null;
}

// =========================
// GÉNÉRATION DU ZIP
// =========================
async function _genererZip() {
  _plannerErreur("");

  const name    = document.getElementById("pl_name").value.trim();
  const version = document.getElementById("pl_version").value.trim() || "V1";
  const author  = document.getElementById("pl_author").value.trim();
  const width   = parseInt(document.getElementById("pl_width").value,  10);
  const height  = parseInt(document.getElementById("pl_height").value, 10);

  if (!name)             { _plannerErreur("Le nom du plan est obligatoire."); return; }
  if (!width || !height) { _plannerErreur("Les dimensions sont obligatoires."); return; }
  if (typeof JSZip === "undefined") { _plannerErreur("JSZip non chargé."); return; }

  const btnGen = document.getElementById("kta-planner-generer");
  btnGen.disabled = true; btnGen.textContent = "⏳ Génération…";

  try {
    const zip        = new JSZip();
    const dataFolder = zip.folder("data");
    const iconFolder = zip.folder("icon");

    // ── Image principale ──
    let baseImageName;
    const baseFile = _getFile("pl_baseImage", null);
    if (baseFile) {
      baseImageName = "data/" + baseFile.name;
      dataFolder.file(baseFile.name, await _lireFichier(baseFile));
    } else if (_plannerMode === "modifier") {
      // Chercher dans les assets originaux — prendre la première image non-collision
      const collNom = document.getElementById("pl_collision_nom")?.textContent.replace(/^[✅📄] /, "") || "";
      const imgKey  = Object.keys(_plannerOrigAssets).find(function(k) {
        return /\.(png|jpg|jpeg|webp|gif)$/i.test(k) && k !== collNom;
      });
      if (imgKey) {
        baseImageName = "data/" + imgKey;
        dataFolder.file(imgKey, await _lireFichier(_plannerOrigAssets[imgKey]));
      } else {
        _plannerErreur("Image principale introuvable."); throw new Error("abort");
      }
    } else {
      _plannerErreur("L'image principale est obligatoire."); throw new Error("abort");
    }

    // ── Collision ──
    let collisionName = "";
    const collFile = _getFile("pl_collision", null);
    if (collFile) {
      collisionName = "data/" + collFile.name;
      dataFolder.file(collFile.name, await _lireFichier(collFile));
    } else if (_plannerMode === "modifier") {
      const collNom = document.getElementById("pl_collision_nom")?.textContent.replace(/^[✅📄] /, "") || "";
      if (collNom && collNom !== "Aucun fichier" && _plannerOrigAssets[collNom]) {
        collisionName = "data/" + collNom;
        dataFolder.file(collNom, await _lireFichier(_plannerOrigAssets[collNom]));
      }
    }

    // ── Calques image ──
    const imageLayers = [];
    for (const item of document.querySelectorAll("#pl_imageLayers_list .kta-planner-layer-item")) {
      const lid     = item.dataset.layerId;
      const ilId    = document.getElementById(lid + "_id").value.trim();
      const ilLabel = document.getElementById(lid + "_label").value.trim() || ilId;
      const ilVis   = document.getElementById(lid + "_visible").value === "true";
      const ilOrder = parseInt(document.getElementById(lid + "_order").value, 10) || 10;
      const nomTxt  = (document.getElementById(lid + "_file_nom")?.textContent || "").replace(/^[✅📄] /, "");
      const ilFile  = _getFile(lid + "_file", nomTxt);

      if (!ilId) { _plannerErreur("Identifiant manquant sur calque image."); throw new Error("abort"); }

      let filePath;
      if (ilFile) {
        filePath = "data/" + ilFile.name;
        dataFolder.file(ilFile.name, await _lireFichier(ilFile));
      } else if (nomTxt && nomTxt !== "Aucun fichier") {
        filePath = "data/" + nomTxt;
      } else {
        _plannerErreur("Fichier manquant pour le calque \"" + ilId + "\"."); throw new Error("abort");
      }

      imageLayers.push({ id: ilId, label: ilLabel, file: filePath, visible: ilVis, order: ilOrder });
    }

    // ── Calques données ──
    const dataLayers = [];
    for (const item of document.querySelectorAll("#pl_dataLayers_list .kta-planner-layer-item")) {
      const lid     = item.dataset.layerId;
      const dlId    = document.getElementById(lid + "_id").value.trim();
      const dlLabel = document.getElementById(lid + "_label").value.trim() || dlId;
      const dlVis   = document.getElementById(lid + "_visible").value === "true";
      const nomTxt  = (document.getElementById(lid + "_file_nom")?.textContent || "").replace(/^[✅📄] /, "");
      const dlFile  = _getFile(lid + "_file", dlId + ".json");

      if (!dlId) { _plannerErreur("Identifiant manquant sur calque données."); throw new Error("abort"); }

      const fileName = dlId + ".json";
      if (dlFile) {
        dataFolder.file(fileName, await _lireFichier(dlFile));
      } else {
        dataFolder.file(fileName, JSON.stringify({ type: dlId, version: 1, data: [] }, null, 2));
      }
      dataLayers.push({ id: dlId, label: dlLabel, file: "data/" + fileName, visible: dlVis });
    }

    // Calque editor
    dataFolder.file("editor.json", PLANNER_EDITOR_JSON);
    dataLayers.push({ id: "editor", label: "Ajouts", file: "data/editor.json", visible: true });

    // ── Tracking ──
    const tracking = {
      startX:        parseInt(document.getElementById("pl_startX").value,        10) || 0,
      startY:        parseInt(document.getElementById("pl_startY").value,        10) || 0,
      scale:         parseFloat(document.getElementById("pl_scale").value)           || 4.9,
      stepLength:    parseFloat(document.getElementById("pl_stepLength").value)      || 0.7,
      stepThreshold: parseFloat(document.getElementById("pl_stepThreshold").value)   || 13,
      stepCooldown:  parseInt(document.getElementById("pl_stepCooldown").value,  10) || 400
    };

    // ── Icônes ──
    const icons = {};
    for (const row of document.querySelectorAll(".kta-planner-icon-row")) {
      const tagEl = row.querySelector("[id$='_tag']");
      if (!tagEl) continue;
      const tag = tagEl.value.trim();
      if (!tag) continue;

      let iconPath;
      if (row._customFile) {
        iconPath = "icon/" + row._customFile.name;
        iconFolder.file(row._customFile.name, await _lireFichier(row._customFile));
      } else {
        const pathEl = row.querySelector("[id$='_path']");
        const p      = pathEl ? (pathEl.title || pathEl.textContent.trim()) : "";
        if (p && p !== "—") {
          iconPath = p;
          // Essayer de l'inclure depuis les assets originaux
          const nom = p.split("/").pop();
          if (_plannerOrigAssets[nom]) {
            iconFolder.file(nom, await _lireFichier(_plannerOrigAssets[nom]));
          }
        } else {
          iconPath = PLANNER_DEFAULT_ICONS[tag] || ("icon/" + tag + ".png");
        }
      }
      icons[tag] = iconPath;
    }

    // S'assurer que default et track existent
    if (!icons.default) icons.default = PLANNER_DEFAULT_ICONS.default;
    if (!icons.track)   icons.track   = PLANNER_DEFAULT_ICONS.track;

    // ── plan-config.json ──
    zip.file("plan-config.json", JSON.stringify({
      plan: { name, version, author, imageWidth: width, imageHeight: height,
              baseImage: baseImageName, collisionImage: collisionName },
      imageLayers,
      dataLayers,
      tracking,
      icons
    }, null, 2));

    // ── Génération ──
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "plan_" + name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() + ".zip"; a.click();
    URL.revokeObjectURL(url);

    const m = document.getElementById("kta-planner-modal");
    if (m) m.remove();

  } catch(err) {
    if (err.message !== "abort") { console.error("[Planner]", err); _plannerErreur("❌ " + (err.message || err)); }
    btnGen.disabled = false; btnGen.textContent = "📦 Générer le ZIP";
  }
}

window.afficherPlanner = afficherPlanner;
