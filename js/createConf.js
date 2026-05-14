// =========================
// PLANNER.JS
// Générateur ZIP + onglet Modifier existant + icon manager dynamique
// =========================

const PLANNER_DEFAULT_ICONS = {
  default:  "lib/leaflet/images/marker-icon.png",
  track:    "icon/iconetrack.png",
  salle:    "icon/house.png",
  pa:       "icon/pa.png",
  pc:       "icon/pc.png",
  pb:       "icon/pb.png",
  pe:       "icon/pe.png",
  peo:      "icon/peo.png",
  pef:      "icon/pef.png",
  eso:      "icon/eso.png",
  esf:      "icon/esf.png",
  cao:      "icon/cao.png",
  caf:      "icon/caf.png",
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
          </div>

          <!-- Dimensions auto-détectées depuis l'image principale -->
          <input type="hidden" id="pl_width">
          <input type="hidden" id="pl_height">
          <div class="kta-planner-dim-display" id="pl_dimensions_display">
            <span class="kta-planner-dim-icon">📐</span>
            <span class="kta-planner-dim-text">Dimensions : <em>en attente du chargement de l'image principale ci-dessous</em></span>
          </div>

          <!-- Multi-niveau (depuis v148) : opt-in pour les carrieres multi-etages.
               Si coche, ajoute plan.multiLevel:true dans plan-config.json. -->
          <label class="kta-planner-multilevel-row">
            <input type="checkbox" id="pl_multiLevel">
            <span>
              <strong>🏗️ Plan multi-niveau (avancé)</strong>
              <em>Active la gestion des étages (Niv 0, 1, 2…) + jonctions interniveau.
              Ne coche que pour des carrières/galeries avec plusieurs niveaux empilés.</em>
            </span>
          </label>

          <!-- Tiling V2 (depuis v149) : opt-in conversion en plan tuile.
               Visible UNIQUEMENT en mode "Modifier" (besoin du File source du V1)
               ET seulement si le plan source n'a PAS deja une section tiling
               (pas re-convertir un V2). Decoupe l'image en tuiles 512x512 sur
               4 niveaux de zoom (Google Maps-like). Approche runtime : N
               L.imageOverlay par niveau avec swap on zoomend (Option B).
               Reduction memoire massive vs V1 (qui charge l'image entiere
               en RAM) — utile pour les gros plans > 50 Mo. -->
          <div id="pl_v2_convert_wrap" style="display:none; margin-top:10px;">
            <label class="kta-planner-tiling-v2-row" id="pl_v2_convert_label" title="Decoupe l'image en tuiles 512x512 sur 4 niveaux de zoom. Reduction memoire massive sur les gros plans.">
              <input type="checkbox" id="pl_tilingV2">
              <span>
                <strong>🧱 Convertir en V2 tuile (performance)</strong>
                <em>Genere des tuiles 512x512 sur 4 niveaux de zoom. Reduction
                memoire massive sur les gros plans (>50 Mo). Disponible
                uniquement en mode <strong>Modifier un plan existant</strong>.</em>
              </span>
            </label>
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
            <label class="kta-cfg-label">
              Position initiale X
              <span class="kta-planner-hint">(centre auto si vide)</span>
            </label>
            <input class="kta-cfg-input" id="pl_startX" type="number" placeholder="auto = W/2">

            <label class="kta-cfg-label">
              Position initiale Y
              <span class="kta-planner-hint">(centre auto si vide)</span>
            </label>
            <input class="kta-cfg-input" id="pl_startY" type="number" placeholder="auto = H/2">

            <label class="kta-cfg-label">Échelle (px/m)</label>
            <input class="kta-cfg-input" id="pl_scale" type="number" step="0.1" value="4.9">

            <label class="kta-cfg-label">Taille d'un pas (m)</label>
            <input class="kta-cfg-input" id="pl_stepLength" type="number" step="0.1" value="0.7">

            <label class="kta-cfg-label">Seuil détection</label>
            <input class="kta-cfg-input" id="pl_stepThreshold" type="number" value="13">

            <label class="kta-cfg-label">Cooldown (ms)</label>
            <input class="kta-cfg-input" id="pl_stepCooldown" type="number" value="400">
          </div>
          <div class="kta-planner-tracking-actions">
            <button type="button" class="kta-planner-add-btn" id="pl_resetStartCenter" title="Remet la position de départ au centre du plan (W/2 × H/2)">🎯 Recentrer la position de départ</button>
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

  // Auto-détection des dimensions du plan depuis l'image principale uploadée.
  // Met à jour les champs hidden pl_width / pl_height + le display visuel
  // (avec warnings rouges si dimensions > 10000 px ou taille > 30 MB).
  document.getElementById("pl_baseImage").addEventListener("change", function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    _lireImageDimensions(file).then(function(dims) {
      _appliquerDimensions(dims.width, dims.height, file.size);
    }).catch(function(err) {
      console.warn("[Planner] Échec lecture dimensions :", err);
      _appliquerDimensions(null, null, file.size);
    });
    // 🧱 V2 : revue de la visibilite de la checkbox V2 (mode Nouveau l'expose
    // seulement apres upload d'une image source).
    _majVisibiliteCheckboxV2();
  });

  // 🧱 V2 : warning au check de la checkbox V2 — conversion lourde, PC recommande.
  // Pas de modal bloquante a la generation (overlay progress existe deja), mais
  // un avertissement au moment ou l'user "opt-in" pour qu'il puisse decocher.
  const v2CbBind = document.getElementById("pl_tilingV2");
  if (v2CbBind) {
    v2CbBind.addEventListener("change", function() {
      if (v2CbBind.checked) _afficherAvertissementV2(v2CbBind);
    });
  }

  document.getElementById("pl_addImageLayer").addEventListener("click", function() { _ajouterImageLayer(); });
  document.getElementById("pl_addDataLayer").addEventListener("click", function() { _ajouterDataLayer(); });

  document.getElementById("pl_chargerDefauts").addEventListener("click", _chargerIconesDefaut);
  document.getElementById("pl_addIconRow").addEventListener("click", function() {
    _ajouterIconRow("", "", null, false);
  });

  // Bouton 🎯 Recentrer : force la position de départ du tracker au centre
  // du plan (W/2 × H/2) en se basant sur les dimensions actuelles. Marche
  // aussi bien en mode nouveau qu'en mode modifier (si l'utilisateur veut
  // remettre au centre après avoir tâtonné).
  document.getElementById("pl_resetStartCenter").addEventListener("click", function() {
    _recentrerPositionInitiale();
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
  // 🏗️ Multi-niveau : pre-coche la case si le plan-config importé contient
  // `plan.multiLevel: true`. Sinon laisse decochee (defaut HTML). Absence
  // du champ = false implicite (retro-compat plans v147 et avant).
  const mlEl = document.getElementById("pl_multiLevel");
  if (mlEl) mlEl.checked = (plan.multiLevel === true);

  // 🧱 Tiling V2 : checkbox visible selon le contexte (cf _majVisibiliteCheckboxV2)
  //   - Source V2 (section `tiling` presente) → defaut COCHE (re-tilage)
  //   - Sinon → defaut DECOCHE (opt-in user)
  const dejaV2 = !!(config.tiling && Number.isInteger(config.tiling.version) && config.tiling.version >= 2);
  const v2CbInit = document.getElementById("pl_tilingV2");
  if (v2CbInit) v2CbInit.checked = dejaV2;
  _majVisibiliteCheckboxV2();

  if (plan.baseImage)      sn("pl_baseImage_nom", "📄 " + plan.baseImage.split("/").pop());
  if (plan.collisionImage) sn("pl_collision_nom",  "📄 " + plan.collisionImage.split("/").pop());

  // Affiche les dimensions auto-détectées + warnings éventuels.
  // En mode modifier, on a déjà les dims dans plan-config + le File d'origine
  // dans _plannerOrigAssets → on peut afficher direct sans re-décoder l'image.
  if (plan.imageWidth && plan.imageHeight) {
    let origFile = null;
    if (plan.baseImage) {
      const origName = plan.baseImage.split("/").pop();
      origFile = _plannerOrigAssets[origName] || null;
    }
    _appliquerDimensions(plan.imageWidth, plan.imageHeight, origFile ? origFile.size : null);
  }

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
// 🧱 Tiling V2 — UI helpers (v151)
// =========================
// Visibilite de la checkbox V2 :
//   - mode Modifier        → toujours visible (File source dans _plannerOrigAssets)
//   - mode Nouveau + image → visible (File source via input pl_baseImage)
//   - mode Nouveau sans img → cachee (pas de File a tuiler)
function _majVisibiliteCheckboxV2() {
  const wrap = document.getElementById("pl_v2_convert_wrap");
  if (!wrap) return;
  if (_plannerMode === "modifier") {
    wrap.style.display = "";
    return;
  }
  // Mode Nouveau : visible si baseImage est uploade
  const input = document.getElementById("pl_baseImage");
  const aImage = !!(input && input.files && input.files[0]);
  wrap.style.display = aImage ? "" : "none";
}

// Modal d'avertissement quand l'user coche la case V2 (genere des tuiles).
// Conversion lourde en CPU + RAM cote navigateur (drawImage sur 16K x 16K
// fait souvent crasher iOS Safari). Conseille PC.
// L'user peut continuer (case reste cochee) ou annuler (decoche).
function _afficherAvertissementV2(checkbox) {
  if (document.getElementById("kta-v2-warn-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "kta-v2-warn-overlay";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-v2-warn-boite">' +
      '<div class="kta-readme-modal-header kta-v2-warn-header">' +
        '<span class="kta-readme-modal-titre">🧱 Conversion V2 — ressources nécessaires</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p class="kta-v2-warn-lead">' +
          'La conversion V2 (génération des tuiles) est une opération <strong>lourde</strong> :' +
        '</p>' +
        '<ul>' +
          '<li><strong>CPU</strong> : tu décodes l\'image source à pleine résolution puis tu draw chaque tuile (jusqu\'à 1000+ tuiles selon la taille du plan).</li>' +
          '<li><strong>RAM navigateur</strong> : l\'image source décodée occupe ~ W×H×4 octets (~256 Mo pour un 8000×8000 px).</li>' +
          '<li><strong>Durée</strong> : 1 à 5 minutes selon la taille de l\'image et le matériel.</li>' +
        '</ul>' +
        '<div class="kta-v2-warn-section kta-v2-warn-section-bad">' +
          '<div class="kta-v2-warn-section-titre">📱 Sur mobile</div>' +
          '<p>iOS Safari et Android Chrome plafonnent à <strong>~500 MB de RAM</strong> pour la PWA. Image source >50 MB ou >8K px : <strong>crash quasi-garanti</strong> pendant la génération.</p>' +
        '</div>' +
        '<div class="kta-v2-warn-section kta-v2-warn-section-good">' +
          '<div class="kta-v2-warn-section-titre">💻 Sur ordinateur</div>' +
          '<p>Aucune limite particulière (mémoire abondante). C\'est la <strong>méthode recommandée</strong> pour générer ton plan V2 avant de le distribuer ou de l\'importer sur mobile.</p>' +
        '</div>' +
        '<p class="kta-v2-warn-note">' +
          '💡 Une fois le ZIP V2 généré sur PC, tu l\'importes sur ton téléphone sans aucun coût mémoire — c\'est exactement le but de V2.' +
        '</p>' +
      '</div>' +
      '<div class="kta-tracker-warn-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-v2-warn-cancel" type="button">Annuler (décocher)</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-v2-warn-ok"     type="button">J\'ai compris — Continuer</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);

  function _cleanup() {
    if (overlay.parentNode) overlay.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) { if (e.key === "Escape") _onCancel(); }
  function _onCancel() {
    if (checkbox) checkbox.checked = false;
    _cleanup();
  }
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) _onCancel();   // clic backdrop = annulation
  });
  document.addEventListener("keydown", _onKey);
  document.getElementById("kta-v2-warn-cancel").addEventListener("click", _onCancel);
  document.getElementById("kta-v2-warn-ok").addEventListener("click", _cleanup);
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

// =========================
// AUTO-DÉTECTION DIMENSIONS DU PLAN (depuis l'image principale)
// =========================
// Lit la largeur/hauteur naturelles d'une image File via blob URL + Image.
// Plus léger que decodeImage() : pas de décompression complète, juste le header.
function _lireImageDimensions(file) {
  return new Promise(function(resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function() {
      const w = img.naturalWidth, h = img.naturalHeight;
      URL.revokeObjectURL(url);
      if (w > 0 && h > 0) resolve({ width: w, height: h });
      else reject(new Error("Dimensions naturelles 0 — image invalide"));
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      reject(new Error("Image non décodable : " + file.name));
    };
    img.src = url;
  });
}

// Bouton 🎯 Recentrer : force pl_startX/Y au centre du plan en se basant sur
// les dimensions actuelles. Si dims inconnues (pas d'image chargée), affiche
// un message d'erreur dans la zone _plannerErreur.
function _recentrerPositionInitiale() {
  const wEl = document.getElementById("pl_width");
  const hEl = document.getElementById("pl_height");
  const w = wEl ? parseInt(wEl.value, 10) : NaN;
  const h = hEl ? parseInt(hEl.value, 10) : NaN;
  if (!w || !h) {
    _plannerErreur("Charge l'image principale d'abord — sans dimensions, impossible de calculer le centre.");
    setTimeout(function() { _plannerErreur(""); }, 4000);
    return;
  }
  const sxEl = document.getElementById("pl_startX");
  const syEl = document.getElementById("pl_startY");
  if (sxEl) sxEl.value = Math.round(w / 2);
  if (syEl) syEl.value = Math.round(h / 2);
  // Flash visuel léger : focus + classe brève
  [sxEl, syEl].forEach(function(el) {
    if (!el) return;
    el.classList.add("kta-planner-flash-ok");
    setTimeout(function() { el.classList.remove("kta-planner-flash-ok"); }, 600);
  });
}

// Seuils warnings (alignés sur les limites pratiques mobiles vues dans le
// reste de l'app : 8000 px de côté = bord du raisonnable, 30 Mo = encodage
// canvas en danger sur iOS Safari).
const PLANNER_DIM_WARN_PX  = 10000;
const PLANNER_FILE_WARN_MB = 30;

function _formatMB(bytes) {
  return (bytes / 1048576).toFixed(1);
}

// Met à jour les champs hidden pl_width/pl_height et le display visuel.
// Affiche des warnings rouges si dimensions ou taille dépassent les seuils.
// width/height peuvent être null (cas d'erreur de lecture).
function _appliquerDimensions(width, height, fileSizeBytes) {
  const wEl = document.getElementById("pl_width");
  const hEl = document.getElementById("pl_height");
  const disp = document.getElementById("pl_dimensions_display");
  if (!disp) return;

  if (wEl) wEl.value = width  || "";
  if (hEl) hEl.value = height || "";

  // Auto-recentrage de la position initiale tracker : on remplit pl_startX/Y
  // à W/2 × H/2 SI l'utilisateur n'a pas déjà saisi des valeurs non-nulles.
  // → mode nouveau : startX/Y sont vides → on remplit ✓
  // → mode modifier : plan-config restauré → on respecte la valeur d'origine ✓
  //   (sauf si elle était 0/0, qu'on considère "non définie" et qu'on recentre)
  if (width && height) {
    const sxEl = document.getElementById("pl_startX");
    const syEl = document.getElementById("pl_startY");
    const sxVal = sxEl ? sxEl.value.trim() : "";
    const syVal = syEl ? syEl.value.trim() : "";
    const noPos = (sxVal === "" || parseInt(sxVal, 10) === 0) &&
                  (syVal === "" || parseInt(syVal, 10) === 0);
    if (noPos) {
      if (sxEl) sxEl.value = Math.round(width  / 2);
      if (syEl) syEl.value = Math.round(height / 2);
    }
  }

  if (!width || !height) {
    disp.className = "kta-planner-dim-display kta-planner-dim-err";
    disp.innerHTML =
      '<span class="kta-planner-dim-icon">⚠️</span>' +
      '<span class="kta-planner-dim-text">Impossible de lire les dimensions de l\'image — fichier corrompu ou format non supporté.</span>';
    return;
  }

  const sizeMB = fileSizeBytes ? _formatMB(fileSizeBytes) : null;
  const dimWarn  = (width > PLANNER_DIM_WARN_PX) || (height > PLANNER_DIM_WARN_PX);
  const sizeWarn = sizeMB && parseFloat(sizeMB) > PLANNER_FILE_WARN_MB;
  const hasWarn  = dimWarn || sizeWarn;

  disp.className = "kta-planner-dim-display" + (hasWarn ? " kta-planner-dim-warn" : " kta-planner-dim-ok");

  let html =
    '<span class="kta-planner-dim-icon">' + (hasWarn ? "⚠️" : "✅") + '</span>' +
    '<span class="kta-planner-dim-text">' +
      '<strong>Dimensions auto-détectées :</strong> ' +
      '<span class="kta-planner-dim-val">' + width + ' × ' + height + ' px</span>' +
      (sizeMB ? ' · <span class="kta-planner-dim-val">' + sizeMB + ' Mo</span>' : '') +
    '</span>';

  if (hasWarn) {
    html += '<div class="kta-planner-dim-warnings">';
    if (dimWarn) {
      html += '<div class="kta-planner-dim-warn-line">' +
                '🚨 <strong>Grande dimension détectée</strong> (' +
                width + ' × ' + height + ' px, > ' + PLANNER_DIM_WARN_PX + ' px). ' +
                'Risque de crash mémoire sur mobile. Pense à choisir un mode performance bas, ou réduire l\'image avant import.' +
              '</div>';
    }
    if (sizeWarn) {
      html += '<div class="kta-planner-dim-warn-line">' +
                '🚨 <strong>Gros fichier détecté</strong> (' + sizeMB + ' Mo, > ' + PLANNER_FILE_WARN_MB + ' Mo). ' +
                'Le ZIP final sera lourd. Privilégie JPEG qualité 85 plutôt que PNG, ou recadre l\'image pour gagner en taille.' +
              '</div>';
    }
    html += '</div>';
  }

  disp.innerHTML = html;
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
// 🧱 GÉNÉRATEUR DE TUILES V2 (conversion V1 → V2) — depuis v149
// =========================
// Découpe l'image source en tuiles tileSize×tileSize sur 4 niveaux de zoom
// (z=0..z=-3), JPEG q88. Convention Y NÉGATIF (Leaflet CRS.Simple) :
//   - leafletY = -1 : tuile la plus basse (lat 0..tileSize)
//   - leafletY = -k : k-ième tuile en partant du bas
//
// ⚠️ CRITIQUE : on slice CHAQUE TUILE directement depuis l'HTMLImageElement
// source via drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh). Pas de canvas
// intermédiaire pleine résolution — pour une image > 16K×16K (= 256 MP),
// Chrome dégrade silencieusement le contenu du canvas. drawImage depuis
// l'img source fait le scaling natif au passage, hors limites canvas.
//
// Auto-crop optionnel : si l'image a beaucoup de marges blanches (cas
// typique des plans papier scannés), on détecte le bbox du contenu utile
// et on génère les tuiles depuis cette zone (les dims plan-config = dims
// croppées). Ça évite que fitBounds affiche 60-80% de blanc autour du plan.

const TILING_V2_TILE_SIZE  = 512;
const TILING_V2_FORMAT     = "jpeg";
const TILING_V2_JPEG_Q     = 0.88;
const TILING_V2_LEVELS     = 4;       // z=0, -1, -2, -3
const TILING_V2_VERSION    = 2;
const TILING_V2_AUTOCROP_RGB_THRESHOLD = 200;  // R,G,B > 200 = "blanc"
const TILING_V2_AUTOCROP_PADDING_PCT   = 0.01; // 1% de marge autour du bbox
const TILING_V2_AUTOCROP_MAX_PCT       = 0.90; // si bbox > 90% du canvas → skip

// Détecte le bounding box du contenu utile dans une image (cad: les pixels
// non-blancs). Sample à 1024px max pour la perf (1M itérations max au lieu
// de 200M). Retourne { x, y, w, h } en coords originales, OU null si pas
// pertinent (bbox > 90% du canvas dans les 2 dimensions).
function _detectContentBBox(img) {
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  // Sample à 1024px max pour la perf
  const SAMPLE_MAX = 1024;
  const sampleScale = Math.min(1, SAMPLE_MAX / Math.max(srcW, srcH));
  const sampleW = Math.round(srcW * sampleScale);
  const sampleH = Math.round(srcH * sampleScale);

  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;

  // Background = pixels où R, G, B > seuil (capte blanc pur ET cream/beige)
  const TH = TILING_V2_AUTOCROP_RGB_THRESHOLD;
  let minX = sampleW, minY = sampleH, maxX = -1, maxY = -1;
  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const i = (y * sampleW + x) * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      if (r > TH && g > TH && b > TH) continue;  // background
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  // Cleanup
  canvas.width = 0; canvas.height = 0;

  if (maxX < 0 || maxY < 0) {
    console.log("[Planner] Auto-crop : image entièrement blanche, skip");
    return null;
  }

  // Scale-back vers coords originales
  const bboxW_sample = maxX - minX + 1;
  const bboxH_sample = maxY - minY + 1;
  if (bboxW_sample / sampleW > TILING_V2_AUTOCROP_MAX_PCT &&
      bboxH_sample / sampleH > TILING_V2_AUTOCROP_MAX_PCT) {
    console.log("[Planner] Auto-crop : bbox couvre > 90% du canvas — pas pertinent, skip");
    return null;
  }

  // Padding 1% autour du bbox
  const padX_sample = Math.round(sampleW * TILING_V2_AUTOCROP_PADDING_PCT);
  const padY_sample = Math.round(sampleH * TILING_V2_AUTOCROP_PADDING_PCT);
  const bx_sample = Math.max(0, minX - padX_sample);
  const by_sample = Math.max(0, minY - padY_sample);
  const bw_sample = Math.min(sampleW, maxX + padX_sample) - bx_sample + 1;
  const bh_sample = Math.min(sampleH, maxY + padY_sample) - by_sample + 1;

  // Conversion vers coords originales (rounding)
  const bbox = {
    x: Math.round(bx_sample / sampleScale),
    y: Math.round(by_sample / sampleScale),
    w: Math.round(bw_sample / sampleScale),
    h: Math.round(bh_sample / sampleScale)
  };
  // Clip aux dims sources (par sécurité)
  bbox.x = Math.max(0, Math.min(bbox.x, srcW - 1));
  bbox.y = Math.max(0, Math.min(bbox.y, srcH - 1));
  bbox.w = Math.min(bbox.w, srcW - bbox.x);
  bbox.h = Math.min(bbox.h, srcH - bbox.y);

  const pctW = Math.round(100 * bbox.w / srcW);
  const pctH = Math.round(100 * bbox.h / srcH);
  console.log("[Planner] Auto-crop détecté : bbox content " + bbox.w + "×" + bbox.h +
              " (offset " + bbox.x + "," + bbox.y + ") = " + pctW + "%×" + pctH + "% du canvas");
  return bbox;
}

// Génère les tuiles V2 dans le ZIP fourni. Retourne { tilesCount, manifest, dims }
// où dims = { width, height, cropOffset?: {x, y} } reflète la zone effective tuilée
// (post-crop si auto-crop a été appliqué).
async function _genererTuilesV2(imageFile, zip, onProgress) {
  // Decode initial de l'image source (HTMLImageElement, pas de canvas)
  const imgUrl = URL.createObjectURL(imageFile);
  const img = await new Promise(function(resolve, reject) {
    const i = new Image();
    i.onload  = function() { resolve(i); };
    i.onerror = function() { reject(new Error("Image source non décodable")); };
    i.src = imgUrl;
  });

  // Auto-crop : si l'image a beaucoup de marges blanches, on tuile depuis la
  // zone utile uniquement. Sinon (bbox > 90% du canvas), on prend tout.
  const bbox = _detectContentBBox(img);
  const cropX = bbox ? bbox.x : 0;
  const cropY = bbox ? bbox.y : 0;
  const srcW  = bbox ? bbox.w : img.naturalWidth;
  const srcH  = bbox ? bbox.h : img.naturalHeight;

  // Comptage total de tuiles pour la progression
  let tilesTotal = 0;
  for (let L = 0; L < TILING_V2_LEVELS; L++) {
    const scale = Math.pow(2, L);
    const lvlW  = Math.ceil(srcW / scale);
    const lvlH  = Math.ceil(srcH / scale);
    const cols  = Math.ceil(lvlW / TILING_V2_TILE_SIZE);
    const rows  = Math.ceil(lvlH / TILING_V2_TILE_SIZE);
    tilesTotal += cols * rows;
  }
  let tilesDone = 0;

  // Tile canvas réutilisable (512×512 = 1 MP, safe sur tout device)
  const tileCanvas = document.createElement("canvas");
  tileCanvas.width  = TILING_V2_TILE_SIZE;
  tileCanvas.height = TILING_V2_TILE_SIZE;
  const tileCtx = tileCanvas.getContext("2d");
  tileCtx.imageSmoothingEnabled = true;
  tileCtx.imageSmoothingQuality = "high";

  const tilesFolder = zip.folder("data").folder("tiles");

  for (let L = 0; L < TILING_V2_LEVELS; L++) {
    const z = -L;                  // z=0, -1, -2, -3
    const scale = Math.pow(2, L);  // 1, 2, 4, 8
    const lvlW = Math.ceil(srcW / scale);
    const lvlH = Math.ceil(srcH / scale);
    const cols = Math.ceil(lvlW / TILING_V2_TILE_SIZE);
    const rows = Math.ceil(lvlH / TILING_V2_TILE_SIZE);

    const zFolder = tilesFolder.folder("z" + z);

    // Convention Y NÉGATIF — slice depuis le BAS de l'image (cf. CRS.Simple)
    for (let k = 1; k <= rows; k++) {
      const leafletY        = -k;
      const sourceBottomLvl = lvlH - (k - 1) * TILING_V2_TILE_SIZE;
      const sourceTopLvl    = Math.max(0, lvlH - k * TILING_V2_TILE_SIZE);
      const sliceHeightLvl  = sourceBottomLvl - sourceTopLvl;
      // destY > 0 quand la tuile haute est partielle (H % tileSize != 0)
      // → on paste au BAS du tile canvas, le haut reste noir
      const destY = TILING_V2_TILE_SIZE - sliceHeightLvl;

      for (let col = 0; col < cols; col++) {
        const sourceLeftLvl  = col * TILING_V2_TILE_SIZE;
        const sourceRightLvl = Math.min(lvlW, (col + 1) * TILING_V2_TILE_SIZE);
        const sliceWidthLvl  = sourceRightLvl - sourceLeftLvl;

        // Conversion vers les coords de l'image ORIGINALE (multiplier par scale
        // ET ajouter l'offset auto-crop, sinon on slice à mauvais endroit)
        const sourceLeftOrig   = cropX + sourceLeftLvl  * scale;
        const sourceTopOrig    = cropY + sourceTopLvl   * scale;
        const sourceWidthOrig  = sliceWidthLvl  * scale;
        const sourceHeightOrig = sliceHeightLvl * scale;

        // Fond noir pour les bordures de la tuile haute partielle
        tileCtx.clearRect(0, 0, TILING_V2_TILE_SIZE, TILING_V2_TILE_SIZE);
        tileCtx.fillStyle = "#000000";
        tileCtx.fillRect(0, 0, TILING_V2_TILE_SIZE, TILING_V2_TILE_SIZE);
        tileCtx.drawImage(
          img,
          sourceLeftOrig, sourceTopOrig, sourceWidthOrig, sourceHeightOrig,
          0,              destY,          sliceWidthLvl,   sliceHeightLvl
        );

        const blob = await new Promise(function(resolve) {
          tileCanvas.toBlob(function(b) { resolve(b); }, "image/jpeg", TILING_V2_JPEG_Q);
        });
        if (blob) {
          const arrBuf = await blob.arrayBuffer();
          zFolder.file("x" + col + "_y" + leafletY + ".jpg", arrBuf);
        }

        tilesDone++;
        if (onProgress) onProgress(tilesDone, tilesTotal, z);
      }
    }
  }

  // Cleanup
  tileCanvas.width = 0; tileCanvas.height = 0;
  URL.revokeObjectURL(imgUrl);

  return {
    tilesCount: tilesDone,
    manifest: {
      version:        TILING_V2_VERSION,
      tileSize:       TILING_V2_TILE_SIZE,
      format:         TILING_V2_FORMAT,
      minNativeZoom:  -(TILING_V2_LEVELS - 1),
      maxNativeZoom:  0
    },
    dims: { width: srcW, height: srcH, cropOffset: bbox ? { x: cropX, y: cropY } : null }
  };
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
  // 🏗️ Multi-niveau (depuis v148) : opt-in via checkbox dans le planner.
  // Si coché → on ajoute `plan.multiLevel: true` au plan-config.json généré.
  // Sinon → on n'ajoute PAS le champ (retro-compat absolue : les apps v147
  // ignorent ce champ inconnu sans broncher).
  const multiLevel = !!document.getElementById("pl_multiLevel")?.checked;
  // 🧱 Tiling V2 (depuis v149) : opt-in conversion en plan tuile. Disponible en
  // mode Modifier (File source dans _plannerOrigAssets) ET en mode Nouveau si
  // une image a été uploadée via le file input pl_baseImage (v151).
  const tilingV2On = !!document.getElementById("pl_tilingV2")?.checked;

  if (!name)             { _plannerErreur("Le nom du plan est obligatoire."); return; }
  if (!width || !height) {
    _plannerErreur("Dimensions du plan inconnues — charge ou recharge l'image principale (le décodage a échoué).");
    return;
  }
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
    dataLayers.push({ id: "editor", label: "Mes annotations", file: "data/editor.json", visible: true });

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

    // ── 🧱 Tiling V2 (conversion V1 → V2, opt-in en mode Modifier) ──
    // On lance la génération AVANT l'écriture du plan-config.json : si
    // l'auto-crop détecte des marges blanches, les dims `imageWidth/Height`
    // doivent refléter la zone effective tuilée (pas l'image entière source).
    let tilingManifest = null;
    let v2Dims = null;
    if (tilingV2On) {
      // 🧱 v151 : retrouve le File de l'image source — 2 sources possibles :
      //   - Mode Nouveau  : input upload pl_baseImage (user a choisi un fichier)
      //   - Mode Modifier : _plannerOrigAssets (extrait du ZIP source)
      // _getFile gere les 2 cas (priorite a l'upload, fallback _plannerOrigAssets
      // via le basename de baseImageName).
      const imageFile = _getFile("pl_baseImage", baseImageName);
      if (!imageFile) {
        _plannerErreur("Conversion V2 : impossible de récupérer l'image source. Choisis une image principale d'abord.");
        throw new Error("abort");
      }

      // Overlay de progression bloquant pendant la génération
      const overlay = document.createElement("div");
      overlay.className = "kta-modal-overlay";
      overlay.innerHTML =
        '<div class="kta-modal">' +
          '<div class="kta-modal-icon">🧱</div>' +
          '<div class="kta-modal-titre">Conversion en V2 tuile : génération des tuiles…</div>' +
          '<div class="kta-modal-texte">' +
            '<div id="kta-tiling-progress-text" style="margin-bottom:10px;">Initialisation…</div>' +
            '<div style="background:rgba(255,255,255,0.06); border-radius:6px; height:8px; overflow:hidden;">' +
              '<div id="kta-tiling-progress-bar" style="height:100%; width:0%; background:#b452ff; transition:width 0.2s;"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(overlay);

      try {
        const result = await _genererTuilesV2(imageFile, zip, function(done, total, currentZ) {
          const pct = Math.round((done / total) * 100);
          const txt = document.getElementById("kta-tiling-progress-text");
          const bar = document.getElementById("kta-tiling-progress-bar");
          if (txt) txt.textContent = "Niveau z=" + currentZ + " · " + done + " / " + total + " tuiles (" + pct + "%)";
          if (bar) bar.style.width = pct + "%";
        });
        tilingManifest = result.manifest;
        v2Dims = result.dims;
        console.log("[Planner] Tiling V2 généré : " + result.tilesCount + " tuiles" +
                    (v2Dims.cropOffset ? " | auto-crop offset (" + v2Dims.cropOffset.x + "," + v2Dims.cropOffset.y + ")" : ""));
      } finally {
        overlay.remove();
      }
    }

    // ── plan-config.json ──
    // 🏗️ Multi-niveau : on n'inclut `multiLevel: true` QUE si la case est
    // cochee. Sinon le champ est totalement absent → plans existants v147 et
    // anciens generateurs continuent de produire un JSON identique → retro-
    // compat parfaite (zero diff sur les plans monolayer).
    // 🧱 Tiling V2 : si on a généré les tuiles, on override imageWidth/Height
    // avec les dims post-crop (= zone effectivement tuilée) et on ajoute la
    // section `tiling` avec le manifest. Le flag `plan.tiledV2 = true`
    // permet au runtime de détecter rapidement le mode tuile.
    const planObj = {
      name, version, author,
      imageWidth:  v2Dims ? v2Dims.width  : width,
      imageHeight: v2Dims ? v2Dims.height : height,
      baseImage: baseImageName, collisionImage: collisionName
    };
    if (multiLevel)     planObj.multiLevel = true;
    if (tilingManifest) planObj.tiledV2    = true;

    const planConfigObj = {
      plan: planObj,
      imageLayers,
      dataLayers,
      tracking,
      icons
    };
    if (tilingManifest) planConfigObj.tiling = tilingManifest;

    zip.file("plan-config.json", JSON.stringify(planConfigObj, null, 2));

    // ── Génération ──
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = "plan_" + name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() +
                 (tilingV2On ? "_v2" : "") + ".zip";
    a.click();
    URL.revokeObjectURL(url);

    const m = document.getElementById("kta-planner-modal");
    if (m) m.remove();

  } catch(err) {
    if (err.message !== "abort") { console.error("[Planner]", err); _plannerErreur("❌ " + (err.message || err)); }
    btnGen.disabled = false; btnGen.textContent = "📦 Générer le ZIP";
  }
}

window.afficherPlanner = afficherPlanner;
