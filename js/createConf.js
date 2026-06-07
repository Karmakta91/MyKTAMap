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
  danger:   "icon/danger.png",
  plaque:   "icon/plaque.png"
};

const PLANNER_EDITOR_JSON   = JSON.stringify({ type: "editor", version: 1, data: [] }, null, 2);
const PLANNER_SYSTEME_TAGS  = ["default", "track"];

let _imageLayerCount   = 0;
let _dataLayerCount    = 0;
let _iconRowCount      = 0;
let _plannerOrigAssets = {};
// 🆕 v1.9.3-B1d.γ.2 : photos extraites d'un datalayer ZIP importé via le
// bouton "📦 Importer ZIP" (mode Nouveau ou Modifier). Format identique à
// ce qu'on trouve dans _convUploadedPhotos de sessionExporter.js :
// [{id, pointId, mime, size, blob}]. Lu au moment du _genererZip pour
// embed dans data/photos/. Reset à chaque ouverture de modale.
let _plannerPhotosFromZip = [];
let _plannerMode       = "nouveau";

// 🆕 v1.17.0 — État de la légende plan-level (= source de vérité pour
// `plan.customLegend` du plan-config.json généré). null = pas de
// personnalisation (cascade défaut MKM). Sinon : objet sérialisable au
// format `LegendCustomization.getSessionState()` :
//   { schemaVersion, labels, hidden, customEntries }
// Modifié par l'éditeur ouvert depuis la section "🏷️ Légende du plan"
// (mode Avancé uniquement). Embed dans le ZIP final via _genererZip.
// Reset à chaque ouverture de modale, pre-rempli en mode Modifier depuis
// `config.plan.customLegend` du ZIP source.
let _plannerPlanLegend = null;

// 🆕 v1.17.0 — Clé localStorage pour la persistance sticky du mode Simple/
// Avancé du Générateur. Valeurs : "simple" (default) | "avance". Lu au boot
// de la modale via _lirePlannerMode. Forcé à "avance" en mode Modifier
// (impossible de simplifier l'édition d'un plan existant sans risquer de
// perdre customs / dataLayers / imageLayers / icons custom).
const PLANNER_MODE_LS_KEY = "myktamap_planner_mode";

function _lirePlannerMode() {
  try {
    const v = localStorage.getItem(PLANNER_MODE_LS_KEY);
    if (v === "avance" || v === "simple") return v;
  } catch(e) {}
  return "simple";  // default au tout premier launch
}

function _ecrirePlannerMode(mode) {
  try { localStorage.setItem(PLANNER_MODE_LS_KEY, mode); } catch(e) {}
}

// 🧹 v1.29.0-fix3 (KARMA "doublon") — Feature flag KTA_KMZ_IMPORT_UI_ENABLED
// retiré. Les boutons « Importer KMZ » / « Importer GPX » du planner
// faisaient doublon avec la drop zone ZIP qui accepte déjà ces extensions
// via _routerFichierImport. Les modales sous-jacentes (_afficherImporterKmz
// / _afficherImporterGpx) restent exposées via window.afficherImporterKmz
// et window.afficherImporterGpx pour usage programmatique.

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
    <div class="kta-readme-modal-boite kta-planner-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">📦 Créer / Modifier un plan</span>
        <button class="kta-panneau-close" id="kta-planner-close">✕</button>
      </div>

      <div class="kta-readme-modal-corps" id="kta-planner-corps">

        <!-- 🆕 v1.17.0 — SWITCHER SIMPLE / AVANCÉ
             Mode Simple = strict minimum (image + nom + version + auteur +
             V2 + M-LVL). Mode Avancé = formulaire complet (= comportement
             v1.16.x et antérieur). Default = Simple, persisté en localStorage.
             En mode Modifier (chargement d'un ZIP existant), on force
             Avancé + on masque le switcher pour éviter de perdre les
             customs / dataLayers / imageLayers / icons custom du plan source. -->
        <div class="kta-planner-mode-switcher" id="kta-planner-mode-switcher" role="tablist" aria-label="Mode du générateur">
          <button type="button" class="kta-planner-mode-btn" data-mode="simple" role="tab">🚀 Simple</button>
          <button type="button" class="kta-planner-mode-btn" data-mode="avance" role="tab">⚙️ Avancé</button>
        </div>
        <p class="kta-planner-mode-hint" id="kta-planner-mode-hint"></p>

        <!-- 🧹 v1.29.0-fix3 (KARMA "doublon") — Boutons "Importer depuis KMZ"
             et "Importer depuis GPX" RETIRÉS. La drop zone ZIP ci-dessous
             accepte déjà les .kmz et .gpx via _routerFichierImport (ligne
             ~730) qui ouvre automatiquement la bonne modale (_afficherImporterKmz
             ou _afficherImporterGpx) selon l'extension. Les fonctions restent
             exposées (window.afficherImporterKmz / window.afficherImporterGpx)
             pour usage programmatique ou futur rebranchement. -->

        <!-- ZIP OPTIONNEL -->
        <div class="kta-aide-section kta-pl-col-full">
          <div class="kta-aide-section-titre" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <span>📂 Charger un ZIP <span class="kta-planner-hint">ou un KMZ / GPX MyKTAMap (optionnel)</span></span>
            <!-- 📥 Bouton Conf exemple — déplacé ici depuis la home loader en v1.7.3.
                 Permet de télécharger le ZIP d'exemple myktamap.zip pour avoir un
                 plan de référence à modifier (workflow recommandé pour débutants). -->
            <button type="button" id="kta-planner-conf-exemple-btn" class="kta-btn kta-btn-ghost kta-btn-small"
                    title="Télécharger un ZIP d'exemple à modifier"
                    style="font-size:12px; padding:4px 10px;">
              📥 ZIP d'exemple
            </button>
          </div>
          <p class="kta-planner-info">
            3 formats acceptés :
            <strong>ZIP MyKTAMap</strong> (modifier un plan existant),
            <strong>KMZ MyKTAMap</strong> (export Export externe → reconverti automatiquement
            avec image plan + icônes + annotations) ou
            <strong>GPX MyKTAMap</strong> (waypoints + tracks → canvas vierge auto-calibré
            sur les bounds GPS + annotations). Sinon, remplis simplement le formulaire pour
            créer un nouveau plan from scratch.
          </p>

          <div class="kta-conv-drop" id="kta-planner-zip-drop" style="position:relative; overflow:hidden;">
            <span style="font-size:28px;">📦</span>
            <span id="kta-planner-zip-label">Glisse un ZIP, KMZ ou GPX ici ou clique pour sélectionner</span>

            <input
              type="file"
              id="kta-planner-zip-input"
              accept=".zip,.kmz,.gpx,application/zip,application/vnd.google-earth.kmz,application/gpx+xml"
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
        <div class="kta-aide-section kta-pl-col-left">
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

          <!-- 🆕 v1.9.3-B1d.γ : inclure les photos attachées (IDB) dans le ZIP
               plan. Visible uniquement en mode "Modifier" (les photos sont
               attachées aux points du plan actuel via window._currentLoadedPlanId).
               Compteur "N · X Mo" peuplé en async par _majCompteurPhotosPlanner. -->
          <div id="pl_photos_wrap" style="display:none; margin-top:10px;">
            <label class="kta-planner-photos-row" title="Embarque les photos attachées aux points dans le ZIP plan généré (data/photos/). Permet de partager le plan avec ses photos vers un autre appareil.">
              <input type="checkbox" id="pl_photos" checked>
              <span>
                <strong>📸 Inclure les photos attachées <span class="kta-ses-count" id="pl_photos_count" style="margin-left:6px;">(chargement…)</span></strong>
                <em>Embarque les photos IDB du plan courant dans <code>data/photos/</code> du ZIP généré.
                Visible uniquement en mode <strong>Modifier</strong> (les photos sont liées au plan actuellement chargé).</em>
              </span>
            </label>
          </div>
        </div>

        <!-- 2. IMAGES -->
        <div class="kta-aide-section kta-pl-col-left">
          <div class="kta-aide-section-titre">🖼️ Images principales</div>

          <!-- 🆕 v1.9.3-A2 (KARMA "mode vierge dans le générateur, on peut
               générer une image vide de X/Ypx avec une limite") : sélecteur
               mode upload vs vierge. Avec vierge, l'utilisateur choisit
               dimensions + couleur de fond, l'app génère un canvas et
               l'utilise comme baseImage (= File injecté dans pl_baseImage). -->
          <div class="kta-planner-image-mode-grid">
            <label class="kta-planner-image-mode-row">
              <input type="radio" name="pl_image_mode" value="upload" checked>
              <span>📷 <strong>Depuis une image</strong> <span class="kta-planner-hint">(upload PNG / JPG)</span></span>
            </label>
            <label class="kta-planner-image-mode-row">
              <input type="radio" name="pl_image_mode" value="vierge">
              <span>🎨 <strong>Image vierge</strong> <span class="kta-planner-hint">(canvas généré)</span></span>
            </label>
          </div>

          <!-- BLOC UPLOAD (existant, visible par défaut) -->
          <div id="pl_image_upload_block">
            <div class="kta-planner-upload-ligne">
              <span class="kta-cfg-label">Image du plan <span class="kta-planner-req">*</span></span>
              <label class="kta-planner-upload-btn" for="pl_baseImage">📂 Choisir</label>
              <input type="file" id="pl_baseImage" accept="image/*" style="display:none">
              <span class="kta-planner-upload-nom" id="pl_baseImage_nom">Aucun fichier</span>
            </div>

            <div class="kta-planner-upload-ligne" data-planner-advanced="1">
              <span class="kta-cfg-label">Carte de collision <span class="kta-planner-hint">(optionnel)</span></span>
              <label class="kta-planner-upload-btn" for="pl_collision">📂 Choisir</label>
              <input type="file" id="pl_collision" accept="image/*" style="display:none">
              <span class="kta-planner-upload-nom" id="pl_collision_nom">Aucun fichier</span>
            </div>
          </div>

          <!-- 🆕 BLOC VIERGE (caché par défaut, généré dynamiquement) -->
          <div id="pl_image_vierge_block" style="display:none;">
            <p class="kta-planner-info">
              L'app génère un canvas PNG vide aux dimensions choisies, avec la couleur de fond sélectionnée.
              Utile pour <strong>dessiner un plan from scratch</strong> (piliers, fronts de taille, tracés) sans image source.
            </p>
            <div class="kta-planner-grille">
              <label class="kta-cfg-label">Largeur (px) <span class="kta-planner-req">*</span></label>
              <input class="kta-cfg-input" id="pl_vierge_w" type="number" min="500" max="12000" step="100" value="4000">

              <label class="kta-cfg-label">Hauteur (px) <span class="kta-planner-req">*</span></label>
              <input class="kta-cfg-input" id="pl_vierge_h" type="number" min="500" max="12000" step="100" value="4000">
            </div>
            <p class="kta-planner-hint" style="margin:6px 0 10px 0; font-size:11.5px; color:#8892a4;">
              Limites : 500 px min, 12000 px max (anti-crash mémoire mobile).
            </p>

            <div class="kta-cfg-label" style="margin-top:6px;">Couleur de fond</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:4px;">
              <label class="kta-export-radio-row">
                <input type="radio" name="pl_vierge_color" value="white" checked>
                <span>⬜ Blanc <span style="color:#8892a4; font-size:11px;">(papier)</span></span>
              </label>
              <label class="kta-export-radio-row">
                <input type="radio" name="pl_vierge_color" value="gray">
                <span>▫️ Gris clair <span style="color:#8892a4; font-size:11px;">(neutre)</span></span>
              </label>
              <label class="kta-export-radio-row">
                <input type="radio" name="pl_vierge_color" value="black">
                <span>⬛ Noir <span style="color:#8892a4; font-size:11px;">(contraste)</span></span>
              </label>
              <label class="kta-export-radio-row">
                <input type="radio" name="pl_vierge_color" value="sepia">
                <span>📜 Sépia <span style="color:#8892a4; font-size:11px;">(carte ancienne)</span></span>
              </label>
            </div>

            <button id="pl_vierge_generate" class="kta-btn kta-btn-primary" type="button"
                    style="margin-top:14px; width:100%; padding:10px;">
              🎨 Générer l'image vide
            </button>
            <div id="pl_vierge_status" style="margin-top:8px; font-size:12px; color:#8892a4; min-height:18px;"></div>
          </div>
        </div>

        <!-- v1.14.20-hotfix11 (KARMA capture : « dans générateur, met
             calque image, juste après image principal — enlève cette
             espace inutile ») : ordre Image → Calques image → Calques
             de données rétabli (annule l'inversion de hotfix3). Plus
             logique aussi : calques image (surimpressions / légendes)
             sont liés directement à l'image principale juste au-dessus,
             tandis que les calques de données (annotations) sont plus
             autonomes. L'espace vide en bas à droite de la col-left
             v1.14.20-hotfix3 disparaît avec ce nouvel ordre. -->

        <!-- 3. CALQUES IMAGE -->
        <div class="kta-aide-section kta-pl-col-left" data-planner-advanced="1">
          <div class="kta-aide-section-titre">
            🗂️ Calques image
            <button class="kta-planner-add-btn" id="pl_addImageLayer">+ Ajouter</button>
          </div>
          <div id="pl_imageLayers_list" class="kta-planner-layers-list">
            <p class="kta-planner-empty">Aucun calque image</p>
          </div>
        </div>

        <!-- 4. CALQUES DONNÉES -->
        <div class="kta-aide-section kta-pl-col-left" data-planner-advanced="1">
          <div class="kta-aide-section-titre">
            📊 Calques de données
            <button class="kta-planner-add-btn" id="pl_addDataLayer" type="button">+ Ajouter</button>
          </div>
          <p class="kta-planner-info">Le calque <code>editor</code> est toujours inclus automatiquement.</p>

          <!-- 🆕 v1.9.3-B1d.γ.2 (KARMA "pas très clair, il faut cliquer sur importer un zip dans data layer") :
               Encadré dédié et visible pour l'import ZIP datalayer, sorti du titre
               où il était masqué. Bouton large + texte explicite. -->
          <div class="kta-planner-import-zip-box">
            <div class="kta-planner-import-zip-titre">📦 Importer un datalayer ZIP en un clic</div>
            <p class="kta-planner-import-zip-hint">
              Tu peux récupérer en un coup les calques (points / tracés / zones / structures) + photos
              d'un <strong>ZIP datalayer</strong> exporté depuis l'app via
              <strong>💾 Enregistrer session → 🔄 Conversion → ✏️→🗂️ Session vers data layer</strong>.
            </p>
            <button class="kta-btn kta-btn-primary kta-planner-import-zip-btn" id="pl_importDataZip" type="button">
              📦 Choisir un ZIP datalayer…
            </button>
            <!-- Input file caché pour le pl_importDataZip handler -->
            <input type="file" id="pl_importDataZip_file" accept=".zip,application/zip" style="display:none">
            <!-- Feedback de l'import ZIP (succès / erreur) -->
            <div id="pl_importDataZip_status" style="display:none; margin-top:8px; font-size:12px;"></div>
          </div>

          <div id="pl_dataLayers_list" class="kta-planner-layers-list">
            <p class="kta-planner-empty">Aucun calque de données</p>
          </div>
        </div>

        <!-- 5. TRACKING -->
        <div class="kta-aide-section kta-pl-col-right" data-planner-advanced="1">
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

            <!-- 🧭 v1.37.0 — Calibration Nord du plan. Embed dans
                 plan-config.json > plan.northOffsetDeg UNIQUEMENT si ≠ 0
                 (rétrocompat stricte : plans Nord-haut → champ absent →
                 lecteurs v1.36.x continuent de marcher à l'identique). -->
            <label class="kta-cfg-label">
              🧭 Orientation Nord (°)
              <span class="kta-planner-hint">(0 = haut = Nord, sens horaire)</span>
            </label>
            <input class="kta-cfg-input" id="pl_northOffset" type="number" min="0" max="359" step="1" value="0">
          </div>
          <div class="kta-planner-tracking-actions">
            <button type="button" class="kta-planner-add-btn" id="pl_resetStartCenter" title="Remet la position de départ au centre du plan (W/2 × H/2)">🎯 Recentrer la position de départ</button>
          </div>
          <p class="kta-planner-hint" style="margin:8px 0 0; font-size:11.5px; color:#8892a4;">
            🧭 <strong>Nord</strong> : laisse 0 si le haut du plan = Nord vrai (cas standard).
            Pour les plans dont le Nord est ailleurs (photo aérienne décalée, plan cataphile
            sans rosace alignée), indique l'angle CW entre le haut du plan et le Nord vrai.
            <strong>Effet</strong> : tracker (rotation + sens de marche) + boussole.
            L'utilisateur final pourra surcharger ce réglage per-plan via ⚙️ Réglages.
          </p>
        </div>

        <!-- 6. ICÔNES & TAGS -->
        <div class="kta-aide-section kta-pl-col-right" data-planner-advanced="1">
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

        <!-- 🆕 v1.17.0 — 6 bis. LÉGENDE DU PLAN (plan-level)
             Personnalisation cascade NIVEAU PLAN : appliquée à TOUS les
             utilisateurs qui chargeront ce plan (l'user peut toujours
             surcharger sa session par-dessus). Stocké dans
             plan-config.json > plan.customLegend. Format identique à
             LegendCustomization.getSessionState() : { schemaVersion,
             labels, hidden, customEntries }.

             Pattern : l'éditeur LegendCustomization.ouvrirEditeur écrit
             dans la session courante. Donc au click "✏️ Modifier", on
             swap temporairement la session avec _plannerPlanLegend, on
             ouvre l'éditeur, et au close on capture le state édité puis
             on restore la session. Subtil mais évite de modifier le
             module legendCustomization.js pour cette release. -->
        <div class="kta-aide-section kta-pl-col-right" data-planner-advanced="1">
          <div class="kta-aide-section-titre">🏷️ Légende du plan <span class="kta-planner-hint">(plan-level)</span></div>
          <p class="kta-planner-info">
            Personnalisation appliquée à <strong>TOUS les utilisateurs</strong> qui chargeront ce plan
            (renommages, masquages, entrées custom dessinables). L'utilisateur peut toujours
            <strong>surcharger sa propre session</strong> par-dessus (cascade <code>session &gt; plan &gt; défaut</code>).
          </p>
          <div id="pl_legend_status" class="kta-planner-legend-status">Aucune personnalisation</div>
          <div class="kta-planner-legend-actions">
            <button type="button" class="kta-btn kta-btn-primary" id="pl_legend_edit">✏️ Modifier la légende du plan</button>
            <button type="button" class="kta-btn kta-btn-ghost"   id="pl_legend_reset">🔄 Reset</button>
          </div>
        </div>

        <!-- 7. Georeferencement GPS (optionnel, v1.14.20) -->
        <!-- Embarque un calibrage 2 points (plan x/y vs GPS lat/lng)
             directement dans le plan-config.json sous plan.georef.
             Retro-compat absolue : champ optionnel, ignore par les
             anciennes versions. Si present et qu aucun calibrage local
             n existe pour ce plan au chargement, main.js le propage vers
             KmzExport.setCalibration => auto-rempli dans Export externe
             ET dans Reglages > Georeferencement (mode map). -->
        <div class="kta-aide-section kta-pl-col-right" data-planner-advanced="1">
          <div class="kta-aide-section-titre">🌐 Géoréférencement GPS <span class="kta-planner-hint">(optionnel)</span></div>
          <p class="kta-planner-info">
            Embarque un <strong>calibrage 2 points</strong> dans le plan généré.
            L'app pourra ensuite exporter en <strong>KMZ / GPX géolocalisé</strong>
            (Google Earth, OsmAnd, Strava…) ou ré-importer un GPX externe sans
            re-saisie. <strong>Laisse vide</strong> si tu n'as pas les coordonnées
            GPS — pleinement rétro-compatible.
          </p>
          <div class="kta-kmz-section" style="margin:8px 0;">
            <div class="kta-kmz-section-titre">📍 Point A</div>
            <div class="kta-kmz-pt-grille">
              <label class="kta-kmz-lbl">Plan x :</label>
              <input class="kta-cfg-input kta-kmz-input" id="pl_geo_A_x"   type="number" step="any">
              <label class="kta-kmz-lbl">Plan y :</label>
              <input class="kta-cfg-input kta-kmz-input" id="pl_geo_A_y"   type="number" step="any">
              <label class="kta-kmz-lbl">GPS (lat, lng) :</label>
              <input class="kta-cfg-input kta-kmz-input kta-gps-coords-input" id="pl_geo_A_coords" type="text" inputmode="decimal" autocomplete="off" placeholder="48.8580, 2.2945">
            </div>
            <div class="kta-gps-coords-error" id="pl_geo_A_err" style="display:none;"></div>
          </div>
          <div class="kta-kmz-section" style="margin:8px 0;">
            <div class="kta-kmz-section-titre">📍 Point B</div>
            <div class="kta-kmz-pt-grille">
              <label class="kta-kmz-lbl">Plan x :</label>
              <input class="kta-cfg-input kta-kmz-input" id="pl_geo_B_x"   type="number" step="any">
              <label class="kta-kmz-lbl">Plan y :</label>
              <input class="kta-cfg-input kta-kmz-input" id="pl_geo_B_y"   type="number" step="any">
              <label class="kta-kmz-lbl">GPS (lat, lng) :</label>
              <input class="kta-cfg-input kta-kmz-input kta-gps-coords-input" id="pl_geo_B_coords" type="text" inputmode="decimal" autocomplete="off" placeholder="48.8520, 2.3050">
            </div>
            <div class="kta-gps-coords-error" id="pl_geo_B_err" style="display:none;"></div>
          </div>
          <div id="pl_geo_status" style="font-size:12px; color:#8892a4; margin:6px 2px 0; min-height:18px;"></div>
        </div>

        <!-- 📖 v1.37.0 — PDF Histoire (optionnel, avancé). Embed dans le ZIP
             sous data/histoire.pdf + écrit plan-config.json > plan.histoirePdf
             = "data/histoire.pdf". Lu au runtime par js/modeHistoire.js (modale
             Mode Histoire avec iframe PDF). Si absent : modale Histoire propose
             import session via IDB (compat v1.34.20 inchangée). -->
        <div class="kta-aide-section kta-pl-col-right" data-planner-advanced="1">
          <div class="kta-aide-section-titre">📖 PDF Histoire <span class="kta-planner-hint">(optionnel)</span></div>
          <p class="kta-planner-info">
            PDF qui raconte l'histoire du site (genèse, plans d'archive, anecdotes…).
            Embarqué dans le ZIP du plan, lu par le <strong>Mode Histoire</strong> (modale
            📖 dans le status bar). Lecture <strong>100% offline</strong>, jamais transmis
            au serveur.
          </p>
          <div class="kta-planner-upload-ligne">
            <span class="kta-cfg-label">Fichier PDF</span>
            <label class="kta-planner-upload-btn" for="pl_histoirePdf">📂 Choisir</label>
            <input type="file" id="pl_histoirePdf" accept="application/pdf" style="display:none">
            <span class="kta-planner-upload-nom" id="pl_histoirePdf_nom">Aucun fichier</span>
            <button type="button" class="kta-planner-add-btn" id="pl_histoirePdf_retirer" style="display:none;">🗑 Retirer</button>
          </div>
          <p class="kta-planner-hint" style="margin:6px 0 0; font-size:11.5px; color:#8892a4;">
            En <strong>mode Modifier</strong>, l'éventuel PDF existant est conservé sauf
            si tu choisis un nouveau fichier OU cliques 🗑 Retirer.
          </p>
        </div>

        <div id="kta-planner-erreur" class="kta-conv-erreur kta-pl-col-full" style="display:none;"></div>

        <div class="kta-conv-actions kta-pl-col-full" style="margin-top:16px;">
          <button class="kta-btn kta-btn-ghost" id="kta-planner-annuler">Annuler</button>
          <button class="kta-btn kta-btn-primary" id="kta-planner-generer">📦 Générer le ZIP</button>
        </div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  // 🆕 hotfix21 — Inputs GPS combinés "lat, lng" (Google Maps natif). Le
  // helper est idempotent → ré-appelé dans _preRemplirFormulaire pour mode
  // modifier sans bug. On stocke les retours sur la modale via dataset pour
  // les récupérer au submit (cf. _readGeo).
  if (typeof window.attacherGpsValidationCombo === "function") {
    window.attacherGpsValidationCombo(
      document.getElementById("pl_geo_A_coords"),
      { errorEl: document.getElementById("pl_geo_A_err") }
    );
    window.attacherGpsValidationCombo(
      document.getElementById("pl_geo_B_coords"),
      { errorEl: document.getElementById("pl_geo_B_err") }
    );
  }

  _imageLayerCount   = 0;
  _dataLayerCount    = 0;
  _iconRowCount      = 0;
  _plannerOrigAssets = {};
  _plannerPhotosFromZip = [];  // 🆕 v1.9.3-B1d.γ.2 : reset buffer photos ZIP
  _plannerMode       = "nouveau";
  _plannerPlanLegend = null;   // 🆕 v1.17.0 : reset état légende plan-level

  // 🆕 v1.17.0 — Initialisation du mode Simple/Avancé. Lecture sticky
  // localStorage, default "simple" au tout premier launch. _appliquerPlannerMode
  // fait la mise à jour DOM (toggle bouton actif + attribut data sur corps).
  _appliquerPlannerMode(_lirePlannerMode());

  document.querySelectorAll("#kta-planner-mode-switcher .kta-planner-mode-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      _appliquerPlannerMode(btn.dataset.mode);
      _ecrirePlannerMode(btn.dataset.mode);
    });
  });

  document.getElementById("kta-planner-close").addEventListener("click", function() { modal.remove(); });
  document.getElementById("kta-planner-annuler").addEventListener("click", function() { modal.remove(); });
  modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });

  // 🧹 v1.29.0-fix3 (KARMA "doublon") — Handlers des boutons KMZ/GPX
  // import RETIRÉS. La drop zone ZIP ouvre automatiquement la modale
  // appropriée via _routerFichierImport (extensions .kmz / .gpx).

  // 📥 v1.7.3 : bouton "Conf exemple" déplacé depuis la home loader.
  // Télécharge `data/myktamap.zip` (ZIP d'exemple inclus dans le repo)
  // pour servir de base de travail à un nouveau plan.
  const btnConfEx = document.getElementById("kta-planner-conf-exemple-btn");
  if (btnConfEx) {
    btnConfEx.addEventListener("click", function() {
      const a = document.createElement("a");
      a.href = "data/myktamap.zip";
      a.download = "myktamap.zip";
      a.click();
    });
  }

  _bindUploadLabel("pl_baseImage", "pl_baseImage_nom");
  _bindUploadLabel("pl_collision", "pl_collision_nom");
  // 📖 v1.37.0 — PDF Histoire (générateur avancé). Sync nom uploaded +
  // bouton "🗑 Retirer" qui marque l'intention de retirer (data-retire=1)
  // pour signaler à _genererZip de NE PAS conserver le PDF du ZIP source
  // (mode Modifier). Choisir un nouveau fichier réinitialise le flag retire.
  _bindUploadLabel("pl_histoirePdf", "pl_histoirePdf_nom");
  (function _bindHistoirePdfControls() {
    const inp     = document.getElementById("pl_histoirePdf");
    const nom     = document.getElementById("pl_histoirePdf_nom");
    const btnDel  = document.getElementById("pl_histoirePdf_retirer");
    if (!inp || !nom || !btnDel) return;
    inp.addEventListener("change", function() {
      // Reset le flag "retirer" si l'user choisit un nouveau fichier
      btnDel.dataset.retire = "";
      btnDel.style.display = "";
    });
    btnDel.addEventListener("click", function() {
      // Marque l'intention de retirer (lecture dans _genererZip)
      btnDel.dataset.retire = "1";
      try { inp.value = ""; } catch(e) {}
      nom.textContent = "Aucun fichier (retiré)";
      nom.dataset.existing = "";
      btnDel.style.display = "none";
    });
  })();

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

  // 🏗️ v162 : toggle visible/hidden des champs Niveau (image layers) selon
  // l'etat de la case pl_multiLevel. Cache si plan single-level (pas pertinent),
  // affiche si plan multi-niveau (l'user peut tagger chaque image layer).
  const mlCbBind = document.getElementById("pl_multiLevel");
  if (mlCbBind) {
    mlCbBind.addEventListener("change", function() {
      const show = mlCbBind.checked;
      document.querySelectorAll("#pl_imageLayers_list .kta-planner-niveau-row").forEach(function(el) {
        el.style.display = show ? "" : "none";
      });
    });
  }

  // 🧱 V2 : warning au check de la checkbox V2 — conversion lourde, PC recommande.
  // Pas de modal bloquante a la generation (overlay progress existe deja), mais
  // un avertissement au moment ou l'user "opt-in" pour qu'il puisse decocher.
  const v2CbBind = document.getElementById("pl_tilingV2");
  if (v2CbBind) {
    v2CbBind.addEventListener("change", function() {
      if (v2CbBind.checked) _afficherAvertissementV2(v2CbBind);
    });
  }

  // 🆕 v1.9.3-B1d.γ : visibilité section "📸 Inclure les photos" + compteur
  // async. Section visible UNIQUEMENT en mode Modifier (sinon pas de plan
  // courant chargé, donc pas de photos IDB à embarquer). Le compteur est
  // peuplé après render avec lecture IDB.
  _majVisibiliteCheckboxPhotos();
  _majCompteurPhotosPlanner();

  // 🆕 v1.9.3-A2 : toggle mode image (upload / vierge) + handler de
  // génération du canvas vide. Cf. handlers _onImageModeChange et
  // _genererImageVierge plus bas dans le fichier.
  document.querySelectorAll('input[name="pl_image_mode"]').forEach(function(r) {
    r.addEventListener("change", _onImageModeChange);
  });
  const btnVierge = document.getElementById("pl_vierge_generate");
  if (btnVierge) btnVierge.addEventListener("click", _genererImageVierge);

  document.getElementById("pl_addImageLayer").addEventListener("click", function() { _ajouterImageLayer(); });
  document.getElementById("pl_addDataLayer").addEventListener("click", function() { _ajouterDataLayer(); });

  // 🆕 v1.9.3-B1d.γ.2 (KARMA 4:b "un datalayer en zip") : bouton pour
  // importer un datalayer ZIP (data + photos) exporté depuis l'app via
  // Conversion session→data avec case "📸 Inclure les photos" cochée.
  // Permet de pré-remplir les data layers + embed les photos en 1 clic.
  const importZipBtn = document.getElementById("pl_importDataZip");
  const importZipInput = document.getElementById("pl_importDataZip_file");
  if (importZipBtn && importZipInput) {
    importZipBtn.addEventListener("click", function() { importZipInput.click(); });
    importZipInput.addEventListener("change", function(e) {
      const f = e.target.files && e.target.files[0];
      if (f) _importerDatalayerZip(f);
      // Reset l'input pour permettre re-sélection du même fichier
      e.target.value = "";
    });
  }

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

  // v1.14.20-hotfix4 / v1.15.0 — route 3 extensions vers leur pipeline :
  //   .zip → _chargerZipModifier (flow classique modification)
  //   .kmz → _afficherImporterKmz (parse + reconstruction ZIP avec icônes)
  //   .gpx → _afficherImporterGpx (canvas vierge auto-calibré + annotations)
  // Un seul drop zone visuellement pour l'user, 3 pipelines internes.
  function _routerFichierImport(f) {
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      _plannerMode = "modifier";
      _chargerZipModifier(f);
    } else if (lower.endsWith(".kmz")) {
      if (typeof _afficherImporterKmz === "function") {
        _afficherImporterKmz(f);
      } else {
        _plannerZipStatus("❌ Module d'import KMZ indisponible", true);
      }
    } else if (lower.endsWith(".gpx")) {
      if (typeof _afficherImporterGpx === "function") {
        _afficherImporterGpx(f);
      } else {
        _plannerZipStatus("❌ Module d'import GPX indisponible", true);
      }
    } else {
      _plannerZipStatus("❌ Le fichier doit être un .zip, un .kmz ou un .gpx", true);
    }
  }

  zipInput.addEventListener("change", function() {
    _routerFichierImport(zipInput.files[0]);
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
    _routerFichierImport(e.dataTransfer.files[0]);
  });

  // 🆕 v1.17.0 — Légende plan-level : 2 boutons (✏️ Modifier + 🔄 Reset).
  // L'éditeur LegendCustomization.ouvrirEditeur écrit dans la session.
  // On swap temporairement session ↔ _plannerPlanLegend pour permettre
  // l'édition, et on restore la session vraie au close.
  const btnLegEdit  = document.getElementById("pl_legend_edit");
  const btnLegReset = document.getElementById("pl_legend_reset");
  if (btnLegEdit) {
    btnLegEdit.addEventListener("click", function() {
      _ouvrirEditeurLegendePlan();
    });
  }
  if (btnLegReset) {
    btnLegReset.addEventListener("click", function() {
      if (!_plannerPlanLegend) {
        _plannerLegendStatus();
        return;
      }
      if (confirm("Effacer la personnalisation de légende du plan ?\n\nLa cascade reviendra à la valeur par défaut MKM.")) {
        _plannerPlanLegend = null;
        _plannerLegendStatus();
      }
    });
  }
  _plannerLegendStatus();  // état initial (= "Aucune personnalisation" au boot)

  document.getElementById("kta-planner-generer").addEventListener("click", _genererZip);
}

// =========================
// 🆕 v1.17.0 — MODE SIMPLE / AVANCÉ
// =========================
// Applique le mode au DOM : data-planner-mode sur le corps + toggle des
// boutons actifs + hint texte. Auto-charge les icônes built-in en mode
// Simple (sinon le ZIP serait généré sans icônes → markers data layer
// cassés). En mode Modifier, on force "avance" et on masque le switcher
// pour éviter de perdre les customs / dataLayers / imageLayers / icons
// custom du plan source (passer en Simple les écraserait au _genererZip).
function _appliquerPlannerMode(mode) {
  if (mode !== "simple" && mode !== "avance") mode = "simple";

  // Mode Modifier → force Avancé (override toute préférence sticky)
  if (_plannerMode === "modifier") mode = "avance";

  const corps = document.getElementById("kta-planner-corps");
  if (corps) corps.setAttribute("data-planner-mode", mode);

  // Toggle bouton actif
  document.querySelectorAll("#kta-planner-mode-switcher .kta-planner-mode-btn").forEach(function(btn) {
    btn.classList.toggle("kta-actif", btn.dataset.mode === mode);
  });

  // Hint texte sous le switcher
  const hint = document.getElementById("kta-planner-mode-hint");
  if (hint) {
    if (mode === "simple") {
      hint.textContent = "🚀 Mode Simple : juste le minimum vital (image + nom + version + V2/M-LVL). Les icônes par défaut sont chargées automatiquement.";
    } else {
      hint.textContent = "⚙️ Mode Avancé : toutes les options (calques image + données, tracking, icônes custom, géoréférencement GPS, légende plan-level).";
    }
  }

  // Masquer le switcher en mode Modifier (forcé en Avancé)
  const sw = document.getElementById("kta-planner-mode-switcher");
  if (sw) sw.style.display = (_plannerMode === "modifier") ? "none" : "";

  // 🆕 Auto-load icônes built-in en mode Simple si la liste est vide.
  // Sinon en Simple, l'user qui n'a pas cliqué "↺ Charger défauts" générerait
  // un ZIP sans icônes (markers data layer cassés au load). En mode Avancé,
  // on laisse l'user gérer (il peut vouloir partir de zéro).
  if (mode === "simple") {
    const list = document.getElementById("pl_icons_list");
    const hasIcons = list && list.querySelectorAll(".kta-planner-icon-row").length > 0;
    if (!hasIcons && typeof _chargerIconesDefaut === "function") {
      try { _chargerIconesDefaut(); } catch(e) {
        console.warn("[Planner] Auto-load icônes built-in (Simple mode) :", e);
      }
    }
  }
}

// =========================
// 🆕 v1.17.0 — LÉGENDE PLAN-LEVEL
// =========================
// Ouvre l'éditeur LegendCustomization en mode "édition plan-level" via le
// pattern de swap session ↔ plan. Étapes :
//   1. Sauvegarde de l'état session courant
//   2. Charge _plannerPlanLegend (ou état vide) dans la session
//   3. Ouvre l'éditeur (qui mute la session)
//   4. Au close : capture session courante → _plannerPlanLegend
//   5. Restore la session originelle
//   6. Refresh le status display
function _ouvrirEditeurLegendePlan() {
  if (!window.LegendCustomization || typeof window.LegendCustomization.ouvrirEditeur !== "function") {
    alert("Module LegendCustomization indisponible.");
    return;
  }
  const LC = window.LegendCustomization;
  // Étape 1 : capture de la session courante (pour la restaurer après édition)
  let savedSession = null;
  if (typeof LC.getSessionState === "function") {
    try { savedSession = LC.getSessionState(); } catch(e) { savedSession = null; }
  }
  // Étape 2 : charge le state du plan en cours d'édition dans la session
  if (typeof LC.loadSessionState === "function") {
    try { LC.loadSessionState(_plannerPlanLegend || null); } catch(e) {
      console.warn("[Planner] loadSessionState échec :", e);
    }
  }
  // Étape 3 : ouverture de l'éditeur normal. Au onClose, on capture
  // le state édité puis on restore la session vraie.
  LC.ouvrirEditeur({
    onChange: function() {
      // Aucun side-effect ici — on capture uniquement au close (sinon
      // re-render permanent à chaque tweak de l'éditeur).
    },
    onClose: function() {
      // Étape 4 : capture du state édité
      let editedState = null;
      if (typeof LC.getSessionState === "function") {
        try { editedState = LC.getSessionState(); } catch(e) {}
      }
      _plannerPlanLegend = _plannerLegendStateNormalize(editedState);
      // Étape 5 : restore de la session originelle
      if (typeof LC.loadSessionState === "function") {
        try { LC.loadSessionState(savedSession || null); } catch(e) {
          console.warn("[Planner] Restore session échec :", e);
        }
      }
      // Étape 6 : refresh status display
      _plannerLegendStatus();
    }
  });
}

// Normalise un state : retourne null si vide (zéro override), sinon objet
// sérialisable propre. Évite d'écrire un customLegend tout vide dans le
// plan-config.json (pollution inutile + cache PWA bumpé pour rien).
function _plannerLegendStateNormalize(state) {
  if (!state || typeof state !== "object") return null;
  const labels  = state.labels        || {};
  const hidden  = state.hidden        || {};
  const customs = state.customEntries || [];
  const hasLabels  = Object.keys(labels).length  > 0;
  const hasHidden  = (Array.isArray(hidden) ? hidden.length : Object.keys(hidden).length) > 0;
  const hasCustoms = Array.isArray(customs) && customs.length > 0;
  if (!hasLabels && !hasHidden && !hasCustoms) return null;
  return state;
}

// Met à jour le status display de la section légende plan-level.
function _plannerLegendStatus() {
  const el = document.getElementById("pl_legend_status");
  if (!el) return;
  if (!_plannerPlanLegend) {
    el.textContent = "✏️ Aucune personnalisation (cascade défaut MKM)";
    el.classList.remove("kta-planner-legend-status-actif");
    return;
  }
  const labels  = Object.keys(_plannerPlanLegend.labels        || {}).length;
  const hiddenC = (Array.isArray(_plannerPlanLegend.hidden)
                    ? _plannerPlanLegend.hidden.length
                    : Object.keys(_plannerPlanLegend.hidden || {}).length);
  const customs = (_plannerPlanLegend.customEntries || []).length;
  const parts = [];
  if (labels  > 0) parts.push(labels  + " renommé" + (labels  > 1 ? "s" : ""));
  if (hiddenC > 0) parts.push(hiddenC + " masqué"  + (hiddenC > 1 ? "s" : ""));
  if (customs > 0) parts.push(customs + " custom"  + (customs > 1 ? "s" : ""));
  el.textContent = "✏️ Personnalisée : " + parts.join(" · ");
  el.classList.add("kta-planner-legend-status-actif");
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
    _plannerPhotosFromZip = [];  // reset buffer photos ZIP au reload (modifier)

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
  // 🧭 v1.37.0 — Pré-remplissage Nord depuis plan.northOffsetDeg (default 0
  // si champ absent → rétrocompat stricte plans v1.36.x).
  sv("pl_northOffset", (plan.northOffsetDeg != null && Number.isFinite(Number(plan.northOffsetDeg))) ? plan.northOffsetDeg : 0);

  // 📖 v1.37.0 — Pré-remplissage PDF Histoire depuis plan.histoirePdf
  // (chemin relatif ZIP, type "data/<nom>.pdf"). Sauvegarde le nom dans
  // dataset.existing pour que _genererZip puisse le ré-embarquer depuis
  // _plannerOrigAssets si l'user n'a pas changé/retiré le PDF.
  const histNomEl = document.getElementById("pl_histoirePdf_nom");
  const histBtnDel = document.getElementById("pl_histoirePdf_retirer");
  if (histNomEl) {
    if (plan.histoirePdf) {
      const _histBase = String(plan.histoirePdf).split("/").pop();
      histNomEl.textContent = "📄 " + _histBase + " (depuis ZIP)";
      histNomEl.dataset.existing = _histBase;
      if (histBtnDel) {
        histBtnDel.style.display = "";
        histBtnDel.dataset.retire = "";
      }
    } else {
      histNomEl.textContent = "Aucun fichier";
      histNomEl.dataset.existing = "";
      if (histBtnDel) {
        histBtnDel.style.display = "none";
        histBtnDel.dataset.retire = "";
      }
    }
  }
  // 🏗️ Multi-niveau : pre-coche la case si le plan-config importé contient
  // `plan.multiLevel: true`. Sinon laisse decochee (defaut HTML). Absence
  // du champ = false implicite (retro-compat plans v147 et avant).
  const mlEl = document.getElementById("pl_multiLevel");
  if (mlEl) mlEl.checked = (plan.multiLevel === true);

  // 🆕 v1.17.0 — Légende plan-level : pre-fill depuis plan.customLegend si
  // présent dans le ZIP source. Sinon null (= cascade défaut MKM). Refresh
  // status display + bascule en Avancé (mode Modifier le force déjà mais
  // on appelle _appliquerPlannerMode pour sync l'UI + masquer le switcher).
  _plannerPlanLegend = (plan.customLegend && typeof plan.customLegend === "object")
                        ? _plannerLegendStateNormalize(plan.customLegend)
                        : null;
  if (typeof _plannerLegendStatus === "function") _plannerLegendStatus();
  if (typeof _appliquerPlannerMode === "function") _appliquerPlannerMode("avance");

  // 🌐 v1.14.20 — Géoréférencement GPS : si le plan-config.json importé
  // contient `plan.georef = { pointA, pointB }`, on pré-remplit les inputs.
  // Sinon les inputs restent vides (le champ est optionnel).
  // 🆕 hotfix21 — Stockage interne reste FLAT {x, y, lat, lng} mais affichage
  // unifié dans pl_geo_A_coords (lat + lng concaténés). Rétrocompat : si une
  // ancienne conf n'a que lat/lng → on les recompose pour affichage.
  if (plan.georef && plan.georef.pointA && plan.georef.pointB) {
    const gA = plan.georef.pointA;
    const gB = plan.georef.pointB;
    sv("pl_geo_A_x", gA.x ?? "");
    sv("pl_geo_A_y", gA.y ?? "");
    sv("pl_geo_B_x", gB.x ?? "");
    sv("pl_geo_B_y", gB.y ?? "");
    // Recomposition lat/lng → "lat, lng" pour affichage dans input combiné.
    // formatGpsCoords retourne "" si l'un des deux n'est pas un nombre fini.
    const fmt = (typeof window.formatGpsCoords === "function")
                ? window.formatGpsCoords
                : function(a, b) { return (Number.isFinite(a) && Number.isFinite(b)) ? (a + ", " + b) : ""; };
    sv("pl_geo_A_coords", fmt(gA.lat, gA.lng));
    sv("pl_geo_B_coords", fmt(gB.lat, gB.lng));
  }

  // 🆕 hotfix21 — Validation live des inputs GPS combinés (idempotent).
  // Ré-attache le helper après pré-remplissage (au cas où le DOM a été
  // reconstruit — sécurité, _afficherPlanner l'attache déjà au boot).
  if (typeof window.attacherGpsValidationCombo === "function") {
    window.attacherGpsValidationCombo(
      document.getElementById("pl_geo_A_coords"),
      { errorEl: document.getElementById("pl_geo_A_err") }
    );
    window.attacherGpsValidationCombo(
      document.getElementById("pl_geo_B_coords"),
      { errorEl: document.getElementById("pl_geo_B_err") }
    );
  }

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
// 🆕 v1.9.3-A2 : MODE IMAGE VIERGE (créateur de plan)
// =========================
// Handler du sélecteur radio "Depuis une image" / "Image vierge".
// Affiche le bloc correspondant et reset l'état de l'autre pour éviter
// les confusions (ex: une image uploadée précédemment qui reste pendant
// qu'on est en mode vierge).
function _onImageModeChange() {
  const mode = (document.querySelector('input[name="pl_image_mode"]:checked') || {}).value || "upload";
  const blocUpload = document.getElementById("pl_image_upload_block");
  const blocVierge = document.getElementById("pl_image_vierge_block");
  if (blocUpload) blocUpload.style.display = (mode === "upload") ? "" : "none";
  if (blocVierge) blocVierge.style.display = (mode === "vierge") ? "" : "none";

  // Reset visuel du status vierge quand on bascule vers upload
  if (mode === "upload") {
    const statusEl = document.getElementById("pl_vierge_status");
    if (statusEl) statusEl.textContent = "";
  }
  // Si on bascule vers vierge ET qu'un file est déjà dans pl_baseImage
  // depuis un upload précédent, on le clear pour éviter ambiguïté.
  // (Le user verra "Aucun fichier" dans le bloc upload qui est caché.)
  if (mode === "vierge") {
    const input = document.getElementById("pl_baseImage");
    if (input && input.files && input.files.length > 0) {
      try { input.value = ""; } catch(e) {}
      const nom = document.getElementById("pl_baseImage_nom");
      if (nom) nom.textContent = "Aucun fichier";
    }
  }
}

// Génère un canvas vide aux dimensions choisies + couleur de fond,
// le convertit en File PNG et l'injecte dans pl_baseImage (= via
// DataTransfer pour que le file input le voie comme un upload normal).
// Trigger l'event "change" pour enchaîner le flow standard
// (_lireImageDimensions + _appliquerDimensions).
function _genererImageVierge() {
  const statusEl = document.getElementById("pl_vierge_status");
  const setStatus = function(msg, color) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = color || "#8892a4";
    }
  };

  // ───── Lecture des dimensions avec clamping ─────
  let w = parseInt(document.getElementById("pl_vierge_w").value, 10);
  let h = parseInt(document.getElementById("pl_vierge_h").value, 10);
  if (!Number.isFinite(w) || w < 500)  w = 500;
  if (!Number.isFinite(h) || h < 500)  h = 500;
  if (w > 12000) w = 12000;
  if (h > 12000) h = 12000;
  // Re-écrit la valeur clampée dans l'input pour que l'user voie la limite
  document.getElementById("pl_vierge_w").value = w;
  document.getElementById("pl_vierge_h").value = h;

  // ───── Couleur de fond ─────
  const colorChoice = (document.querySelector('input[name="pl_vierge_color"]:checked') || {}).value || "white";
  const PALETTE = {
    white: "#ffffff",
    gray:  "#e8e8e8",
    black: "#000000",
    sepia: "#f4e4bc"
  };
  const fillColor = PALETTE[colorChoice] || PALETTE.white;

  setStatus("⏳ Génération du canvas " + w + "×" + h + " px…", "#8cb4ff");

  // ───── Canvas off-screen + remplissage ─────
  // Async via requestAnimationFrame pour ne pas freezer l'UI sur les
  // gros canvas (12000×12000 = 144 MP allocations).
  requestAnimationFrame(function() {
    try {
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, 0, w, h);

      // ───── Conversion en Blob PNG ─────
      canvas.toBlob(function(blob) {
        if (!blob) {
          setStatus("❌ Échec génération canvas (mémoire ?)", "#ff8c8c");
          return;
        }

        // Nom de fichier descriptif pour que l'utilisateur retrouve
        // dans le ZIP final ce que c'est (= image vierge K×K couleur).
        const fileName = "plan_vierge_" + w + "x" + h + "_" + colorChoice + ".png";
        const file = new File([blob], fileName, { type: "image/png" });

        // ───── Injection dans le file input pl_baseImage ─────
        // Utilise DataTransfer API : c'est la seule façon propre de set
        // `input.files` programmatiquement (input.files est read-only mais
        // peut être assigné via FileList depuis DataTransfer).
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          const input = document.getElementById("pl_baseImage");
          input.files = dt.files;
          // Trigger "change" event pour que le code existant
          // (_lireImageDimensions, _appliquerDimensions) s'exécute.
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } catch(e) {
          console.warn("[Planner vierge] DataTransfer failed :", e);
          setStatus("❌ Erreur d'injection : " + (e.message || e), "#ff8c8c");
          return;
        }

        // UX feedback
        const nomEl = document.getElementById("pl_baseImage_nom");
        if (nomEl) nomEl.textContent = "🎨 " + fileName;
        setStatus("✅ Canvas généré : " + fileName + " (" + Math.round(blob.size / 1024) + " Ko)", "#6ce28a");
      }, "image/png");
    } catch(e) {
      console.error("[Planner vierge] erreur :", e);
      setStatus("❌ Erreur : " + (e.message || e), "#ff8c8c");
    }
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

  // 🏗️ v162 : champ Niveau optionnel (image layers uniquement, pas data layers).
  // Default 0 = niveau de reference, conserve la retro-compat avec les ZIP
  // d'avant v162 ou avec multiLevel: false. Affiche le champ seulement si la
  // case pl_multiLevel est cochee (cache sinon via class .kta-planner-niveau-row).
  const levelVal   = Number.isInteger(p.level) ? p.level : 0;
  const mlIsActive = !!(document.getElementById("pl_multiLevel") &&
                        document.getElementById("pl_multiLevel").checked);
  const niveauStyle = mlIsActive ? "" : "display:none;";

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
      <label class="kta-cfg-label kta-planner-niveau-row" style="${niveauStyle}">🏗️ Niveau</label>
      <input class="kta-cfg-input kta-planner-niveau-row" id="${id}_level" type="number" value="${levelVal}" style="${niveauStyle}">
    </div>
    <div class="kta-planner-upload-ligne">
      <span class="kta-cfg-label">Image <span class="kta-planner-req">*</span></span>
      <label class="kta-planner-upload-btn" for="${id}_file">📂 Choisir</label>
      <input type="file" id="${id}_file" accept="image/*" style="display:none">
      <span class="kta-planner-upload-nom" id="${id}_file_nom">
        ${p.file ? "📄 " + p.file.split("/").pop() : "Aucun fichier"}
      </span>
    </div>
    <!-- 🆕 v1.38.1 — Section calibration 2 ancres (embarquée durablement dans plan-config.json).
         Hint auto-affiché : dims layer vs dims plan → ✅ inutile / ⚠️ utile. Stocké dans item._calibration. -->
    <div class="kta-planner-calib-section" style="margin-top:8px; padding:6px 8px; background:rgba(255,255,255,0.02); border-radius:6px; border:1px dashed rgba(255,255,255,0.1);">
      <div style="font-size:11.5px; color:#8892a4; margin-bottom:4px;">
        📐 <strong>Calibration 2 ancres</strong>
        <span style="color:#f4c542;">⚠️ Calibre UNIQUEMENT si les dimensions du calque diffèrent du plan principal — sinon tu fausserais l'alignement.</span>
      </div>
      <div id="${id}_calib_hint" style="font-size:11px; color:#8892a4; margin-bottom:4px; min-height:14px;">⏳ Choisis un fichier image pour analyser les dimensions…</div>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <button type="button" class="kta-planner-add-btn" id="${id}_calib_btn" disabled>📐 Calibrer (2 ancres)</button>
        <button type="button" class="kta-planner-add-btn" id="${id}_calib_reset_btn" style="display:none;">↺ Reset</button>
        <span id="${id}_calib_status" style="font-size:11.5px; color:#7dd87d; flex:1 1 100%;"></span>
      </div>
    </div>
  `;

  list.appendChild(item);
  _bindUploadLabel(id + "_file", id + "_file_nom");
  item.querySelector("[data-remove]").addEventListener("click", function() {
    item.remove();
    if (!list.querySelector(".kta-planner-layer-item"))
      list.innerHTML = '<p class="kta-planner-empty">Aucun calque image</p>';
  });

  // 🆕 v1.38.1 — Calibration state stocké sur l'item DOM
  item._calibration = p.calibration || null;

  const hintEl   = item.querySelector("#" + id + "_calib_hint");
  const calibBtn = item.querySelector("#" + id + "_calib_btn");
  const resetBtn = item.querySelector("#" + id + "_calib_reset_btn");
  const statusEl = item.querySelector("#" + id + "_calib_status");

  function _refreshCalibUI() {
    if (item._calibration) {
      statusEl.innerHTML = "✅ Calibration enregistrée (sera embedée dans le ZIP)";
      resetBtn.style.display = "";
    } else {
      statusEl.innerHTML = "";
      resetBtn.style.display = "none";
    }
  }
  _refreshCalibUI();

  // Helpers pour récupérer l'URL et les dims de l'image layer (mode Nouveau =
  // File via input ; mode Modifier = File depuis _plannerOrigAssets via nom).
  function _getLayerSourceInfo() {
    return new Promise(function(resolve) {
      const fileInput = document.getElementById(id + "_file");
      const file = (fileInput && fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;
      let url = null, fileForDims = null;
      if (file) {
        url = URL.createObjectURL(file);
        fileForDims = file;
      } else {
        // Mode Modifier : chercher le nom existant dans _plannerOrigAssets
        const nomTxt = (document.getElementById(id + "_file_nom")?.textContent || "").replace(/^[✅📄]\s/u, "").trim();
        if (nomTxt && _plannerOrigAssets[nomTxt]) {
          fileForDims = _plannerOrigAssets[nomTxt];
          url = URL.createObjectURL(fileForDims);
        }
      }
      if (!url) { resolve(null); return; }
      // Charger l'image pour récupérer les dims naturelles
      const tmpImg = new Image();
      tmpImg.onload = function() {
        resolve({ url: url, width: tmpImg.naturalWidth, height: tmpImg.naturalHeight, blobUrl: url });
      };
      tmpImg.onerror = function() {
        try { URL.revokeObjectURL(url); } catch(e) {}
        resolve(null);
      };
      tmpImg.src = url;
    });
  }

  function _refreshDimsHint() {
    const planW = parseInt(document.getElementById("pl_width")?.value || "0", 10);
    const planH = parseInt(document.getElementById("pl_height")?.value || "0", 10);
    if (!planW || !planH) {
      hintEl.innerHTML = '<span style="color:#8892a4;">⏳ Plan principal pas encore chargé (charge d\'abord l\'image principale).</span>';
      calibBtn.disabled = true;
      return;
    }
    _getLayerSourceInfo().then(function(info) {
      if (!info) {
        hintEl.innerHTML = '<span style="color:#8892a4;">⏳ Choisis un fichier image pour analyser les dimensions…</span>';
        calibBtn.disabled = true;
        return;
      }
      const sameDims = Math.abs(info.width - planW) <= 2 && Math.abs(info.height - planH) <= 2;
      if (sameDims) {
        hintEl.innerHTML = '<span style="color:#7dd87d;">✅ <strong>' + info.width + '×' + info.height + ' = plan principal</strong> — calibration <strong>inutile</strong>, laisse vide.</span>';
        calibBtn.disabled = false;  // on autorise quand même au cas où
      } else {
        hintEl.innerHTML = '<span style="color:#f4c542;">⚠️ <strong>' + info.width + '×' + info.height + ' ≠ plan ' + planW + '×' + planH + '</strong> — calibration <strong>recommandée</strong>.</span>';
        calibBtn.disabled = false;
      }
      // Libère le blob URL après usage (pas besoin de le garder, on en recréera un au picker)
      try { URL.revokeObjectURL(info.url); } catch(e) {}
    });
  }

  // Re-check dims quand l'user change l'image OU au boot si déjà uploadée
  const fileInputEl = document.getElementById(id + "_file");
  if (fileInputEl) fileInputEl.addEventListener("change", function() { _refreshDimsHint(); });
  // Re-check aussi quand l'user change le plan principal (input pl_baseImage)
  const baseImgEl = document.getElementById("pl_baseImage");
  if (baseImgEl) baseImgEl.addEventListener("change", function() { _refreshDimsHint(); });
  // Init immédiat (mode Modifier : on a déjà un fichier)
  setTimeout(_refreshDimsHint, 50);

  // Bouton "📐 Calibrer (2 ancres)" → ouvre le picker
  calibBtn.addEventListener("click", function() {
    if (!window.ImageLayerCalibrationPicker) {
      alert("Module Picker indisponible.");
      return;
    }
    const planW = parseInt(document.getElementById("pl_width")?.value || "0", 10);
    const planH = parseInt(document.getElementById("pl_height")?.value || "0", 10);
    if (!planW || !planH) {
      alert("Charge d'abord une image principale (pour avoir les dimensions du plan).");
      return;
    }
    // URL du plan principal (file uploadé OU mode Modifier via assets originaux)
    let planUrl = null, planBlob = null;
    const baseFile = (baseImgEl && baseImgEl.files && baseImgEl.files[0]) ? baseImgEl.files[0] : null;
    if (baseFile) {
      planUrl = URL.createObjectURL(baseFile);
      planBlob = planUrl;
    } else if (_plannerMode === "modifier") {
      // Cherche la 1ère image dans _plannerOrigAssets qui n'est pas la collision
      const collNomMod = document.getElementById("pl_collision_nom")?.textContent.replace(/^[✅📄]\s/u, "") || "";
      const imgKey = Object.keys(_plannerOrigAssets).find(function(k) {
        return /\.(png|jpg|jpeg|webp|gif)$/i.test(k) && k !== collNomMod;
      });
      if (imgKey) {
        planUrl = URL.createObjectURL(_plannerOrigAssets[imgKey]);
        planBlob = planUrl;
      }
    }
    if (!planUrl) { alert("Image du plan principal indisponible."); return; }

    _getLayerSourceInfo().then(function(info) {
      if (!info) { alert("Image du calque indisponible."); try { URL.revokeObjectURL(planUrl); } catch(e) {} return; }
      window.ImageLayerCalibrationPicker.open({
        sourceUrl: info.url,
        planUrl: planUrl,
        planWidth: planW,
        planHeight: planH,
        existing: item._calibration
      }).then(function(calib) {
        try { URL.revokeObjectURL(info.url); } catch(e) {}
        try { URL.revokeObjectURL(planUrl); } catch(e) {}
        if (!calib) return;
        item._calibration = calib;
        _refreshCalibUI();
      }).catch(function(e) {
        try { URL.revokeObjectURL(info.url); } catch(e) {}
        try { URL.revokeObjectURL(planUrl); } catch(e) {}
        console.warn("[Planner calib] échec :", e);
        alert("Picker indisponible : " + (e && e.message ? e.message : "erreur inconnue"));
      });
    });
  });

  resetBtn.addEventListener("click", function() {
    item._calibration = null;
    _refreshCalibUI();
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
// 📦 IMPORT DATALAYER ZIP (v1.9.3-B1d.γ.2 — KARMA 4:b)
// =========================
// Permet d'importer en 1 clic un ZIP datalayer (= exporté depuis l'app via
// Conversion session→data avec photos cochées) pour pré-remplir les calques
// data + photos du nouveau plan.
//
// Format ZIP attendu (= output de _exportConvSession2Data) :
//   ├── points.json           (granularité basic, contient {data: [...]})
//   ├── roads.json            (contient {roads: [...]})
//   ├── zones.json            (contient {zones: [...]})
//   ├── structure.json        (contient {structures: [...]})
//   OU
//   ├── points.json + roads_<type>.json + zones_<type>.json + structures_<type>.json
//   │     (granularité fine — on fusionne par catégorie au moment de l'import)
//   └── photos/
//        ├── _index.json
//        └── <photoId>.<ext>
//
// Comportement :
//   - Mode "remplace" : on vide les data layers existants avant d'ajouter
//     les nouveaux (cohérent avec syncModeFlags / wipe+restore B1d.γ.3)
//   - 1 calque créé par catégorie présente (max 4 : points, roads, zones, structure)
//   - Photos stockées dans _plannerPhotosFromZip → embed au _genererZip
function _importerDatalayerZip(zipFile) {
  if (typeof JSZip === "undefined") {
    _afficherStatutImportZip("error", "JSZip non chargé — impossible de lire un ZIP.");
    return;
  }
  _afficherStatutImportZip("info", "⏳ Lecture du ZIP datalayer…");

  JSZip.loadAsync(zipFile).then(function(zip) {
    // Étape 1 : merge des .json à la racine par catégorie
    const merged = {
      data:       [],
      roads:      [],
      zones:      [],
      structures: []
    };
    const jsonFiles = [];
    zip.forEach(function(relPath, entry) {
      if (entry.dir) return;
      if (relPath.indexOf("/") >= 0) return;  // skip sous-dossiers (photos/)
      if (!/\.json$/i.test(relPath)) return;
      jsonFiles.push(entry);
    });

    if (jsonFiles.length === 0) {
      throw new Error("ZIP invalide : aucun fichier .json data layer trouvé à la racine.");
    }

    return Promise.all(jsonFiles.map(function(entry) {
      return entry.async("string").then(function(txt) {
        try {
          return JSON.parse(txt);
        } catch(e) {
          console.warn("[Planner Import ZIP] " + entry.name + " : JSON invalide, ignoré :", e);
          return null;
        }
      });
    })).then(function(parsedArr) {
      parsedArr.forEach(function(json) {
        if (!json || typeof json !== "object") return;
        // Points : .data ou .editorPoints
        if (Array.isArray(json.data) && json.data.length > 0) {
          merged.data = merged.data.concat(json.data);
        } else if (Array.isArray(json.editorPoints) && json.editorPoints.length > 0) {
          merged.data = merged.data.concat(json.editorPoints);
        }
        if (Array.isArray(json.roads))      merged.roads      = merged.roads.concat(json.roads);
        if (Array.isArray(json.zones))      merged.zones      = merged.zones.concat(json.zones);
        if (Array.isArray(json.structures)) merged.structures = merged.structures.concat(json.structures);
      });

      const total = merged.data.length + merged.roads.length + merged.zones.length + merged.structures.length;
      if (total === 0) {
        throw new Error("ZIP datalayer vide : aucun point/tracé/zone/structure trouvé.");
      }

      // Étape 2 : extraire les photos (si dossier photos/_index.json)
      const indexFile = zip.file("photos/_index.json");
      const photosPromise = !indexFile
        ? Promise.resolve([])
        : indexFile.async("string").then(function(idxText) {
            let idxObj;
            try { idxObj = JSON.parse(idxText); }
            catch(e) { throw new Error("photos/_index.json corrompu : " + e.message); }
            const idxMap = (idxObj && idxObj.photos) || {};
            const photoIds = Object.keys(idxMap);
            if (photoIds.length === 0) return [];
            const blobPromises = photoIds.map(function(pid) {
              const info = idxMap[pid] || {};
              const filename = "photos/" + (info.file || (pid + ".jpg"));
              const f = zip.file(filename);
              if (!f) {
                console.warn("[Planner Import ZIP] Photo manquante :", filename);
                return null;
              }
              return f.async("blob").then(function(blob) {
                return {
                  id:      pid,
                  pointId: String(info.pointId || ""),
                  mime:    info.mime || blob.type || "image/jpeg",
                  size:    info.size || blob.size,
                  blob:    blob
                };
              });
            });
            return Promise.all(blobPromises).then(function(arr) {
              return arr.filter(function(p) { return p !== null; });
            });
          });

      return photosPromise.then(function(photos) {
        // Étape 3 : créer les data layers UI
        // 🔧 v1.9.4 (KARMA "si on modifie un plan, importe un zip alors que
        // d'autre datalayer était chargé il nous les supprime") :
        //   - Mode NOUVEAU → on wipe la liste (vide au départ de toute façon)
        //   - Mode MODIFIER → on PRÉSERVE les calques existants du plan source,
        //     on AJOUTE les nouveaux avec suffixe `_imported_<N>` pour éviter
        //     les collisions d'id (ex: `points` existant + `points` du ZIP).
        //     L'user peut renommer après si besoin.
        const isModeNouveau = (_plannerMode === "nouveau");
        if (isModeNouveau) {
          const list = document.getElementById("pl_dataLayers_list");
          if (list) {
            list.innerHTML = '<p class="kta-planner-empty">Aucun calque de données</p>';
            _dataLayerCount = 0;
          }
        }

        // Set des ids déjà utilisés en UI (pour éviter les collisions au
        // moment d'importer en mode Modifier)
        function _idsExistants() {
          const set = new Set();
          document.querySelectorAll("#pl_dataLayers_list .kta-planner-layer-item").forEach(function(item) {
            const lid = item.dataset.layerId;
            const inputId = document.getElementById(lid + "_id");
            if (inputId && inputId.value) set.add(inputId.value.trim());
          });
          return set;
        }
        // Suffixe d'unicité — applique uniquement en mode Modifier (en
        // Nouveau, le wipe ci-dessus garantit déjà aucune collision).
        function _idUnique(baseId, idsTaken) {
          if (isModeNouveau) return baseId;
          if (!idsTaken.has(baseId)) return baseId;
          let n = 1;
          while (idsTaken.has(baseId + "_imported_" + n)) n++;
          return baseId + "_imported_" + n;
        }

        // Helper : crée un File JSON synthétique à partir d'un objet payload
        function _makeJsonFile(name, payload) {
          const text = JSON.stringify(payload, null, 2);
          const blob = new Blob([text], { type: "application/json" });
          // File est dispo dans tous les navigateurs modernes ; fallback Blob
          // assigné directement à _plannerOrigAssets si File constructor échoue.
          try {
            return new File([blob], name, { type: "application/json" });
          } catch(e) {
            // Vieux Safari : pas de File constructor. On utilise le Blob direct
            // avec un .name forgé (canard typing : _lireFichier appelle juste
            // .text() ou .arrayBuffer() qui sont dispos sur Blob).
            blob.name = name;
            return blob;
          }
        }

        const idsTaken = _idsExistants();
        const layersCrees = [];

        function _creerCalqueImport(baseId, label, payload, fileNameBase) {
          const finalId = _idUnique(baseId, idsTaken);
          idsTaken.add(finalId);
          // Nom du fichier dans le ZIP plan = `<id>.json` (cohérent avec
          // l'init existante du générateur — le nom du fichier = id du calque).
          const fileName = finalId + ".json";
          const file = _makeJsonFile(fileName, payload);
          _plannerOrigAssets[fileName] = file;
          const finalLabel = (finalId !== baseId) ? (label + " (importé)") : label;
          _ajouterDataLayer({
            id: finalId,
            label: finalLabel,
            visible: true,
            file: "data/" + fileName
          });
          return finalId;
        }

        if (merged.data.length > 0) {
          const id = _creerCalqueImport(
            "points", "Points importés",
            { type: "points", version: 1, data: merged.data },
            "points"
          );
          layersCrees.push(id + " (" + merged.data.length + ")");
        }
        if (merged.roads.length > 0) {
          const id = _creerCalqueImport(
            "roads", "Tracés importés",
            { type: "roads", version: 1, data: [], roads: merged.roads },
            "roads"
          );
          layersCrees.push(id + " (" + merged.roads.length + ")");
        }
        if (merged.zones.length > 0) {
          const id = _creerCalqueImport(
            "zones", "Zones importées",
            { type: "zones", version: 1, data: [], zones: merged.zones },
            "zones"
          );
          layersCrees.push(id + " (" + merged.zones.length + ")");
        }
        if (merged.structures.length > 0) {
          const id = _creerCalqueImport(
            "structure", "Structures importées",
            { type: "structures", version: 1, data: [], structures: merged.structures },
            "structure"
          );
          layersCrees.push(id + " (" + merged.structures.length + ")");
        }

        // Étape 4 : stocker les photos pour embed au _genererZip
        _plannerPhotosFromZip = photos;

        // Étape 5 : feedback UI
        const photosTxt = photos.length > 0
          ? " · 📸 " + photos.length + " photo" + (photos.length > 1 ? "s" : "")
          : "";
        _afficherStatutImportZip(
          "success",
          "✅ " + layersCrees.length + " calque(s) créé(s) : " + layersCrees.join(", ") + photosTxt
        );
      });
    });
  }).catch(function(err) {
    console.error("[Planner Import ZIP]", err);
    _afficherStatutImportZip("error", "❌ " + (err.message || err));
  });
}

// Helper : affiche le statut de l'import ZIP (success vert / error rouge / info gris)
function _afficherStatutImportZip(kind, msg) {
  const el = document.getElementById("pl_importDataZip_status");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  const colors = { success: "#6ce28a", error: "#ff8c8c", info: "#8cb4ff" };
  el.style.color = colors[kind] || "#c8d0e0";
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
// 📸 Photos — UI helpers (v1.9.3-B1d.γ)
// =========================
// Visibilite de la section "Inclure les photos" :
//   - mode Modifier → visible (un plan est chargé, photos potentielles en IDB)
//   - mode Nouveau  → cachée (pas de plan courant, pas de photos à embarquer)
function _majVisibiliteCheckboxPhotos() {
  const wrap = document.getElementById("pl_photos_wrap");
  if (!wrap) return;
  wrap.style.display = (_plannerMode === "modifier") ? "" : "none";
}

// Compteur photos async : lit IDB pour le plan courant + affiche "N · X Mo".
// Section auto-cachée si 0 photo (l'user n'a pas besoin de voir la case quand
// rien à embarquer).
function _majCompteurPhotosPlanner() {
  const wrap    = document.getElementById("pl_photos_wrap");
  const counter = document.getElementById("pl_photos_count");
  const cb      = document.getElementById("pl_photos");
  if (!wrap || !counter) return;
  if (_plannerMode !== "modifier") {
    wrap.style.display = "none";
    return;
  }
  if (!window.MyKTAMapPhotos || typeof window.MyKTAMapPhotos.getAllPhotosForPlan !== "function") {
    wrap.style.display = "none";
    return;
  }
  const planId = window._currentLoadedPlanId || null;
  if (!planId) {
    wrap.style.display = "none";
    return;
  }
  window.MyKTAMapPhotos.getAllPhotosForPlan(planId).then(function(arr) {
    if (!arr || arr.length === 0) {
      wrap.style.display = "none";
      if (cb) cb.checked = false;
      return;
    }
    const totalSize = arr.reduce(function(s, r) { return s + (r.size || (r.blob && r.blob.size) || 0); }, 0);
    const fmt = window._kta_formatBytes || function(n) {
      if (n < 1024 * 1024) return Math.round(n / 1024) + " Ko";
      return (n / (1024 * 1024)).toFixed(1) + " Mo";
    };
    wrap.style.display = "";
    counter.textContent = "(" + arr.length + " · " + fmt(totalSize) + ")";
  }).catch(function(e) {
    console.warn("[Planner] _majCompteurPhotosPlanner :", e);
    wrap.style.display = "none";
  });
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

// 🧱 v152 : Modal d'erreur VISIBLE (full-screen) quand la generation V2 echoue.
// Remplace l'usage de _plannerErreur (zone inline en bas de la modale planner,
// peu visible) pour les erreurs critiques de generation. Inclut des conseils
// actionnables (réduire image, faire sur PC).
function _afficherErreurV2(titre, message) {
  // Si une modale precedente existe, on la remplace pour eviter le stacking
  const existing = document.getElementById("kta-v2-error-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "kta-v2-error-overlay";
  overlay.className = "kta-readme-modal-overlay";
  const safeMessage = String(message || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g, "<br>");
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-v2-error-boite">' +
      '<div class="kta-readme-modal-header kta-v2-error-header">' +
        '<span class="kta-readme-modal-titre">❌ ' + (titre || "Erreur de génération V2") + '</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p class="kta-v2-error-message">' + safeMessage + '</p>' +
        '<div class="kta-v2-warn-section kta-v2-warn-section-good">' +
          '<div class="kta-v2-warn-section-titre">💡 Que faire ?</div>' +
          '<ul style="margin:6px 0 0; padding-left:22px; font-size:13px; color:#c8d0e0; line-height:1.6;">' +
            '<li><strong>Génère sur PC plutôt que mobile</strong> — pas de plafond mémoire en pratique, le ZIP V2 généré s\'importera ensuite sans coût sur ton téléphone.</li>' +
            '<li><strong>Réduis l\'image source</strong> avant de réessayer : redimensionne à 6000-8000 px max via GIMP / Photoshop / <a href="https://squoosh.app" target="_blank" rel="noopener" style="color:#8cb4ff;">Squoosh</a>. Tu perds un peu de détail au zoom max mais la conversion passe.</li>' +
            '<li><strong>Convertis en JPEG qualité 85</strong> si ton source est en PNG : div / 5 à 10 sur le poids sans perte visuelle.</li>' +
          '</ul>' +
        '</div>' +
      '</div>' +
      '<div class="kta-tracker-warn-actions">' +
        '<button class="kta-btn kta-btn-primary" id="kta-v2-error-ok" type="button">J\'ai compris</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);

  function _cleanup() {
    if (overlay.parentNode) overlay.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) { if (e.key === "Escape") _cleanup(); }
  overlay.addEventListener("click", function(e) { if (e.target === overlay) _cleanup(); });
  document.addEventListener("keydown", _onKey);
  document.getElementById("kta-v2-error-ok").addEventListener("click", _cleanup);
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
  let data;
  try {
    ctx.drawImage(img, 0, 0, sampleW, sampleH);
    data = ctx.getImageData(0, 0, sampleW, sampleH).data;
  } catch(e) {
    // CORS-tainted canvas (rare en usage normal — l'image vient de l'upload
    // user donc same-origin), ou OOM lors du downsample. On skip l'auto-crop
    // et on tuile l'image entière sans crop. Pas une vraie erreur fatale.
    console.warn("[Planner] _detectContentBBox : échec lecture pixels (CORS ? OOM ?), skip auto-crop —", e.message);
    canvas.width = 0; canvas.height = 0;
    return null;
  }

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
        try {
          tileCtx.clearRect(0, 0, TILING_V2_TILE_SIZE, TILING_V2_TILE_SIZE);
          tileCtx.fillStyle = "#000000";
          tileCtx.fillRect(0, 0, TILING_V2_TILE_SIZE, TILING_V2_TILE_SIZE);
          tileCtx.drawImage(
            img,
            sourceLeftOrig, sourceTopOrig, sourceWidthOrig, sourceHeightOrig,
            0,              destY,          sliceWidthLvl,   sliceHeightLvl
          );
        } catch(drawErr) {
          // drawImage peut throw sur "tainted canvas" (image cross-origin) ou
          // sur OOM (rare mais possible sur mobile). On veut un message clair.
          throw new Error("Échec drawImage à z=" + z + " col=" + col + " k=" + k +
                          " — probable saturation mémoire (image source trop grande pour ce device). " +
                          "Détail interne : " + (drawErr && drawErr.message ? drawErr.message : "inconnu"));
        }

        // toBlob peut renvoyer null silencieusement si le canvas est dans un
        // état dégradé (OOM, contexte perdu). On wrap dans une Promise qui
        // throw si blob === null.
        let blob;
        try {
          blob = await new Promise(function(resolve, reject) {
            tileCanvas.toBlob(function(b) {
              if (!b) reject(new Error("toBlob a retourné null"));
              else    resolve(b);
            }, "image/jpeg", TILING_V2_JPEG_Q);
          });
        } catch(blobErr) {
          throw new Error("Échec encodage JPEG de la tuile z=" + z + " col=" + col + " k=" + k +
                          " — saturation mémoire navigateur. " +
                          "Détail interne : " + (blobErr && blobErr.message ? blobErr.message : "inconnu"));
        }

        try {
          const arrBuf = await blob.arrayBuffer();
          zFolder.file("x" + col + "_y" + leafletY + ".jpg", arrBuf);
        } catch(zipErr) {
          throw new Error("Échec ajout tuile au ZIP à z=" + z + " col=" + col + " k=" + k +
                          ". Détail : " + (zipErr && zipErr.message ? zipErr.message : "inconnu"));
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
      const collNom = document.getElementById("pl_collision_nom")?.textContent.replace(/^[✅📄]\s/u, "") || "";
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
      const collNom = document.getElementById("pl_collision_nom")?.textContent.replace(/^[✅📄]\s/u, "") || "";
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
      // 🏗️ v162 : niveau (defaut 0 si vide / invalide / non-multiLevel). On
      // ecrit TOUJOURS le champ dans le JSON pour tracabilite et facilite la
      // re-edition (l'user voit 0 et peut le modifier au lieu de "level absent").
      const ilLevelStr = document.getElementById(lid + "_level")
                          ? document.getElementById(lid + "_level").value : "";
      const ilLevel = (ilLevelStr === "" || isNaN(parseInt(ilLevelStr, 10)))
                       ? 0 : parseInt(ilLevelStr, 10);
      const nomTxt  = (document.getElementById(lid + "_file_nom")?.textContent || "").replace(/^[✅📄]\s/u, "");
      const ilFile  = _getFile(lid + "_file", nomTxt);

      if (!ilId) { _plannerErreur("Identifiant manquant sur calque image."); throw new Error("abort"); }

      let filePath;
      if (ilFile) {
        filePath = "data/" + ilFile.name;
        dataFolder.file(ilFile.name, await _lireFichier(ilFile));
      } else if (nomTxt && nomTxt !== "Aucun fichier") {
        filePath = "data/" + nomTxt;
        // 🆕 Fix bug ZIP regen : sans ce bloc, le plan-config.json référencait
        // "data/legende.png" mais le fichier n'était PAS ajouté au nouveau
        // ZIP → image layer cassée au load (404 silencieux). Récupère le
        // File depuis _plannerOrigAssets (peuplé par _chargerZipModifier) et
        // l'écrit dans le ZIP. Si introuvable → erreur claire (au lieu de
        // générer un ZIP corrompu silencieusement).
        if (_plannerOrigAssets[nomTxt]) {
          dataFolder.file(nomTxt, await _lireFichier(_plannerOrigAssets[nomTxt]));
        } else {
          _plannerErreur(
            "Fichier image \"" + nomTxt + "\" introuvable dans le ZIP source. " +
            "Re-uploade le fichier via le bouton 📂 Choisir du calque \"" + ilId + "\"."
          );
          throw new Error("abort");
        }
      } else {
        _plannerErreur("Fichier manquant pour le calque \"" + ilId + "\"."); throw new Error("abort");
      }

      const imageLayerObj = { id: ilId, label: ilLabel, file: filePath, visible: ilVis, order: ilOrder, level: ilLevel };
      // 🆕 v1.38.1 — Embed la calibration 2 ancres dans plan-config.json si présente.
      // Stockée sur le DOM element par _ajouterImageLayer (item._calibration), saisie via picker.
      // Rétro-compat absolue : champ absent si pas calibré → comportement v1.37.x.
      if (item._calibration && item._calibration.sourceA && item._calibration.targetA
          && item._calibration.sourceB && item._calibration.targetB) {
        imageLayerObj.calibration = item._calibration;
      }
      imageLayers.push(imageLayerObj);
    }

    // ── Calques données ──
    const dataLayers = [];
    for (const item of document.querySelectorAll("#pl_dataLayers_list .kta-planner-layer-item")) {
      const lid     = item.dataset.layerId;
      const dlId    = document.getElementById(lid + "_id").value.trim();
      const dlLabel = document.getElementById(lid + "_label").value.trim() || dlId;
      const dlVis   = document.getElementById(lid + "_visible").value === "true";
      const nomTxt  = (document.getElementById(lid + "_file_nom")?.textContent || "").replace(/^[✅📄]\s/u, "");
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

    // 🆕 v1.9.3-B1d.γ : embed des photos dans data/photos/<photoId>.<ext>
    // + data/photos/_index.json. Source : combinaison de
    //
    //   - Mode Modifier + case "Inclure les photos" cochée → photos IDB du
    //     plan courant (cf. B1.d.γ.1).
    //   - Tout mode + import d'un datalayer ZIP → photos extraites de ce
    //     ZIP via le bouton "📦 Importer ZIP" (cf. B1.d.γ.2, stockées
    //     dans _plannerPhotosFromZip).
    //
    // 🔧 v1.9.4 (KARMA "ca casse tout") : MERGE des 2 sources en mode
    // Modifier. Avant on prenait juste le ZIP importé en priorité → les
    // photos IDB du plan source disparaissaient. Maintenant on combine :
    //   - Toutes les photos IDB (si checkbox cochée + mode Modifier)
    //   - + Toutes les photos du ZIP datalayer importé
    //   - Dédupliqué par photoId (UUID v4 → conflit négligeable mais on
    //     préfère le record IDB pour la dédup car potentiellement modifié
    //     depuis le ZIP).
    //
    // Au load du plan importé, main.js > startImportedPlan détecte
    // data/photos/_index.json et restore en IDB (cf. B1.d.γ.3).
    //
    // Comportement strictement opt-in (rétrocompat absolue) : sans photos
    // IDB ET sans ZIP datalayer importé, le ZIP plan reste identique à
    // v1.9.2 (pas de dossier photos/).
    function _ext(mime) {
      if (!mime) return "jpg";
      if (mime.indexOf("png")  >= 0) return "png";
      if (mime.indexOf("webp") >= 0) return "webp";
      if (mime.indexOf("gif")  >= 0) return "gif";
      return "jpg";
    }

    // Merge des 2 sources avec déduplication par photoId
    let photosArr = [];
    const seenIds = new Set();

    // 1. Photos IDB du plan courant (mode Modifier uniquement)
    const inclurePhotosCb = document.getElementById("pl_photos");
    const inclurePhotos = !!(inclurePhotosCb && inclurePhotosCb.checked
                             && _plannerMode === "modifier"
                             && window.MyKTAMapPhotos);
    if (inclurePhotos) {
      const planId = window._currentLoadedPlanId || null;
      if (planId) {
        try {
          const idbPhotos = await window.MyKTAMapPhotos.getAllPhotosForPlan(planId);
          if (idbPhotos && idbPhotos.length > 0) {
            idbPhotos.forEach(function(p) {
              if (!seenIds.has(p.id)) {
                seenIds.add(p.id);
                photosArr.push(p);
              }
            });
            console.log("[Planner] Source photos : IDB plan courant (" + idbPhotos.length + ")");
          }
        } catch(e) {
          console.warn("[Planner] Échec lecture photos IDB :", e);
        }
      }
    }

    // 2. Photos du ZIP datalayer importé (s'ajoute aux IDB en mode Modifier,
    //    seule source en mode Nouveau)
    if (Array.isArray(_plannerPhotosFromZip) && _plannerPhotosFromZip.length > 0) {
      let addedFromZip = 0;
      _plannerPhotosFromZip.forEach(function(p) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          photosArr.push({
            id:      p.id,
            blob:    p.blob,
            mime:    p.mime,
            pointId: p.pointId,
            size:    p.size
          });
          addedFromZip++;
        }
      });
      console.log("[Planner] Source photos : ZIP datalayer (+" + addedFromZip + " ajoutées au merge)");
    }

    if (photosArr && photosArr.length > 0) {
      try {
        const photosFolder = dataFolder.folder("photos");
        const idx = {};
        photosArr.forEach(function(rec) {
          const ext  = _ext(rec.mime);
          const name = rec.id + "." + ext;
          photosFolder.file(name, rec.blob);
          idx[rec.id] = {
            pointId: rec.pointId,
            mime:    rec.mime || "image/jpeg",
            size:    rec.size || (rec.blob && rec.blob.size) || 0,
            file:    name
          };
        });
        photosFolder.file("_index.json", JSON.stringify({
          version: 1,
          photos:  idx
        }, null, 2));
        console.log("[Planner] " + photosArr.length + " photo(s) embarquée(s) dans data/photos/");
      } catch(e) {
        console.warn("[Planner] Échec embed photos :", e);
        // Pas bloquant : on continue la génération du ZIP sans les photos
      }
    }

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
      const imageFile = _getFile("pl_baseImage", baseImageName);
      if (!imageFile) {
        _afficherErreurV2("Image source introuvable",
          "Choisis une image principale d'abord (section 🖼️ Images principales).");
        throw new Error("abort");
      }

      // 🧱 v152 : flag de détection de crash mémoire pendant la génération.
      // Si le navigateur kill la page (OOM iOS Safari) au milieu de drawImage
      // ou toBlob, l'execution s'arrete sans aucun throw — utilisateur perdu.
      // En posant ce flag AVANT et en le supprimant APRES, on peut detecter
      // au reload qu'une generation V2 etait en cours et n'a pas fini
      // proprement → modale specifique au boot (cf OOMGuard hook + index.html
      // _detecterCrashV2GenerationAuBoot).
      try {
        localStorage.setItem("myktamap_v2_gen_in_progress", JSON.stringify({
          planName: name,
          imageSize: imageFile.size,
          startedAt: Date.now()
        }));
      } catch(e) { /* localStorage saturé : pas bloquant */ }

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
            '<p style="font-size:11.5px; color:#8892a4; margin:14px 0 0; line-height:1.5;">' +
              '⚠️ Ne ferme pas l\'onglet pendant la conversion. Sur mobile, le navigateur peut killer la page si la mémoire sature.' +
            '</p>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(overlay);

      let v2Result = null;
      let v2Error  = null;
      try {
        v2Result = await _genererTuilesV2(imageFile, zip, function(done, total, currentZ) {
          const pct = Math.round((done / total) * 100);
          const txt = document.getElementById("kta-tiling-progress-text");
          const bar = document.getElementById("kta-tiling-progress-bar");
          if (txt) txt.textContent = "Niveau z=" + currentZ + " · " + done + " / " + total + " tuiles (" + pct + "%)";
          if (bar) bar.style.width = pct + "%";
        });
      } catch(err) {
        v2Error = err;
      } finally {
        overlay.remove();
        // Cleanup du flag in-progress (succes OU echec catché). Si OOM kill
        // brutal, ce code ne tourne JAMAIS → le flag reste en localStorage
        // → détecté au prochain boot.
        try { localStorage.removeItem("myktamap_v2_gen_in_progress"); } catch(e) {}
      }

      if (v2Error) {
        const isOOM = /m[ée]moire|drawImage|toBlob|saturation/i.test(v2Error.message || "");
        _afficherErreurV2(
          isOOM ? "Échec de génération — saturation mémoire" : "Échec de génération",
          (v2Error.message || "Erreur inconnue pendant la génération V2.") +
          (isOOM ? "\n\nC'est typique sur mobile pour des images > 50 Mo ou > 8K px. Solutions : générer sur PC, ou réduire l'image source." : "")
        );
        throw new Error("abort");
      }

      tilingManifest = v2Result.manifest;
      v2Dims = v2Result.dims;
      console.log("[Planner] Tiling V2 généré : " + v2Result.tilesCount + " tuiles" +
                  (v2Dims.cropOffset ? " | auto-crop offset (" + v2Dims.cropOffset.x + "," + v2Dims.cropOffset.y + ")" : ""));
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

    // 🧭 v1.37.0 — Calibration Nord. Embed UNIQUEMENT si ≠ 0 (rétrocompat
    // stricte : plans v1.36.x sans champ continuent de produire un JSON
    // équivalent). Normalisation [0, 360[ + parse robust (NaN → skip).
    const _northRaw = parseFloat(document.getElementById("pl_northOffset")?.value || "0");
    if (Number.isFinite(_northRaw) && _northRaw !== 0) {
      const _northNorm = ((_northRaw % 360) + 360) % 360;
      if (_northNorm !== 0) planObj.northOffsetDeg = _northNorm;
    }

    // 📖 v1.37.0 — PDF Histoire. 3 cas :
    //  1. User a uploadé un nouveau PDF → embed dans data/histoire.pdf
    //     + planObj.histoirePdf = "data/histoire.pdf"
    //  2. Mode Modifier + PDF existant pas retiré + pas remplacé → on
    //     conserve le nom & on re-embarque depuis _plannerOrigAssets
    //  3. Sinon → champ absent (rétrocompat stricte)
    const _histRetire     = (document.getElementById("pl_histoirePdf_retirer")?.dataset.retire === "1");
    const _histNewFile    = _getFile("pl_histoirePdf", null);
    const _histExistNom   = document.getElementById("pl_histoirePdf_nom")?.dataset.existing || "";
    if (_histNewFile) {
      // Cas 1 : nouveau PDF uploadé
      const _histName = "histoire.pdf";  // nom normalisé pour le runtime
      dataFolder.file(_histName, await _lireFichier(_histNewFile));
      planObj.histoirePdf = "data/" + _histName;
      console.log("[Planner] PDF Histoire embarqué :", _histName, "(taille " + _histNewFile.size + " bytes)");
    } else if (!_histRetire && _histExistNom && _plannerOrigAssets[_histExistNom]) {
      // Cas 2 : conservation du PDF existant (mode Modifier sans changement)
      dataFolder.file(_histExistNom, await _lireFichier(_plannerOrigAssets[_histExistNom]));
      planObj.histoirePdf = "data/" + _histExistNom;
      console.log("[Planner] PDF Histoire conservé depuis ZIP source :", _histExistNom);
    }
    // Cas 3 : pas de PDF → planObj.histoirePdf absent (rétrocompat).

    // 🆕 v1.17.0 — Légende plan-level : si l'utilisateur a personnalisé
    // la légende dans le Générateur (section "🏷️ Légende du plan" en mode
    // Avancé), embed l'état dans `planObj.customLegend`. Rétro-compat
    // absolue : champ totalement absent si rien à personnaliser (les
    // versions ≤ v1.16.x ignorent un champ inconnu sans broncher, et
    // `_plannerLegendStateNormalize` retourne null pour un état vide,
    // donc pas de pollution du JSON même si l'user a ouvert/fermé
    // l'éditeur sans rien modifier).
    if (_plannerPlanLegend) planObj.customLegend = _plannerPlanLegend;

    // 🌐 v1.14.20 — Géoréférencement GPS optionnel. Si TOUS les champs sont
    // remplis ET que le calibrage est valide (transform construisible), on
    // embarque `plan.georef = { pointA, pointB }`. Sinon : champ totalement
    // absent → rétro-compat absolue (les vieilles versions ignorent un champ
    // inconnu sans broncher, cf. pattern multiLevel).
    // 🆕 hotfix21 — Lat/lng lus depuis l'input combiné via parseGpsCoords.
    // Si saisi mais format invalide → abort avec message d'erreur explicite.
    function _readGeo(id) {
      const el = document.getElementById(id);
      if (!el) return null;
      const v = el.value;
      if (v === "" || v == null) return null;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }
    function _readGeoCoords(id, errId, label) {
      const el = document.getElementById(id);
      if (!el) return { empty: true, lat: null, lng: null };
      const v = String(el.value || "").trim();
      if (v === "") return { empty: true, lat: null, lng: null };
      const parsed = (typeof window.parseGpsCoords === "function")
                      ? window.parseGpsCoords(v) : null;
      if (!parsed) {
        // Format invalide → marque l'input en erreur + abort.
        el.classList.add("kta-gps-invalid");
        const errEl = errId ? document.getElementById(errId) : null;
        if (errEl) {
          errEl.textContent = "Format attendu : 48.6808, 2.1588";
          errEl.style.display = "";
        }
        _plannerErreur("Coordonnées GPS " + label + " : format invalide (attendu « lat, lng » entre [-90,90] et [-180,180])");
        throw new Error("abort");
      }
      return { empty: false, lat: parsed.lat, lng: parsed.lng };
    }
    const _coordsA = _readGeoCoords("pl_geo_A_coords", "pl_geo_A_err", "Point A");
    const _coordsB = _readGeoCoords("pl_geo_B_coords", "pl_geo_B_err", "Point B");
    const _geoA = { x: _readGeo("pl_geo_A_x"), y: _readGeo("pl_geo_A_y"),
                    lat: _coordsA.lat, lng: _coordsA.lng };
    const _geoB = { x: _readGeo("pl_geo_B_x"), y: _readGeo("pl_geo_B_y"),
                    lat: _coordsB.lat, lng: _coordsB.lng };
    const _allGeoFilled =
      _geoA.x != null && _geoA.y != null && _geoA.lat != null && _geoA.lng != null &&
      _geoB.x != null && _geoB.y != null && _geoB.lat != null && _geoB.lng != null;
    if (_allGeoFilled) {
      // Validation transform (refus si points colinéaires / distance nulle)
      try {
        if (window.KmzExport && typeof window.KmzExport.buildTransform === "function") {
          window.KmzExport.buildTransform(
            { x: _geoA.x, y: _geoA.y }, { x: _geoB.x, y: _geoB.y },
            { lat: _geoA.lat, lng: _geoA.lng }, { lat: _geoB.lat, lng: _geoB.lng }
          );
        }
        planObj.georef = { pointA: _geoA, pointB: _geoB };
      } catch(e) {
        _plannerErreur("Calibrage GPS invalide : " + e.message);
        throw new Error("abort");
      }
    }

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
// v1.14.20-hotfix6 : expose la modale Import KMZ pour qu'elle soit
// utilisable depuis index.html (drop zone home qui route un KMZ direct
// vers la conversion KMZ → ZIP MyKTAMap, sans passer par la modale
// Planner). Accepte un fichier pré-fourni qui déclenche directement
// l'analyse.
window.afficherImporterKmz = _afficherImporterKmz;
// v1.14.20-hotfix12 (KARMA « depuis import KMZ, on doit pouvoir cocher
// un mode V2 pour regénérer les tuiles. Pareil M-LVL ») : expose la
// fonction de tuilage V2 pour qu'elle soit utilisable depuis kmzImport
// .js > genererZipMyktamap (re-tilage de l'image plate du KMZ vers un
// plan V2 utilisable même sur mobile). Le M-LVL est juste un flag dans
// le plan-config.json, pas besoin d'API.
window.MyKTAMapTilingV2 = _genererTuilesV2;

// =====================================================================
// 🌍 MODALE IMPORT KMZ → ZIP MyKTAMap (Phase 1 MVP, depuis v173)
// =====================================================================
// Pipeline complet en 1 modale :
//   1. Upload d'un fichier .kmz
//   2. Parsing automatique (kmzImport.js) — détection GroundOverlay +
//      comptage des Placemarks par type
//   3. Affichage du résumé : taille image, nb annotations détectées
//   4. Choix des types par défaut pour points / lignes / polygones
//      (choix 4=B validé KARMA — configurables avant import)
//   5. Bouton "Générer le ZIP" qui télécharge le ZIP MyKTAMap
//
// Mode A (GroundOverlay présent) : pipeline complet.
// Mode C (pas de GroundOverlay) : modale d'erreur claire, pas d'import.
// =====================================================================

let _kmzImportState = null;  // { kmlDoc, assets, overlay, transform, imageW, imageH, stats }

function _afficherImporterKmz(prefilledFile) {
  const existing = document.getElementById("kta-kmz-import-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id        = "kta-kmz-import-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-kmz-imp-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">🌍 Importer un KMZ → ZIP MyKTAMap</span>
        <button class="kta-panneau-close" id="kta-kmz-imp-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps" id="kta-kmz-imp-corps">

        <p class="kta-planner-info" style="margin-bottom:14px;">
          Sélectionne un fichier <strong>.kmz</strong> précédemment exporté par MyKTAMap
          (onglet 🌍 KMZ de l'export session). L'app le ré-importe en ZIP MyKTAMap utilisable.
        </p>
        <div style="padding:8px 12px; background:rgba(255,179,128,0.06); border:1px solid rgba(255,179,128,0.22); border-radius:6px; font-size:12px; color:#c0c8d8; margin-bottom:14px;">
          <strong style="color:#ffb380;">⚠️ Phase 1 (depuis v173)</strong> — seuls les KMZ
          exportés depuis MyKTAMap sont supportés pour le moment. Les KMZ tiers
          (Google Earth, OsmAnd, IGN scan…) afficheront un message d'incompatibilité.
        </div>

        <!-- 1. UPLOAD -->
        <div class="kta-aide-section" id="kta-kmz-imp-step-upload">
          <div class="kta-aide-section-titre">📂 Fichier KMZ</div>
          <div class="kta-conv-drop" id="kta-kmz-imp-drop" style="position:relative; overflow:hidden;">
            <span style="font-size:28px;">🌍</span>
            <span id="kta-kmz-imp-label">Glisse un .kmz ici ou clique pour sélectionner</span>
            <input type="file" id="kta-kmz-imp-input" accept=".kmz,application/vnd.google-earth.kmz"
              style="position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; z-index:5;">
          </div>
          <div id="kta-kmz-imp-status" style="margin-top:8px;font-size:13px;min-height:18px;"></div>
        </div>

        <!-- 2. RÉSUMÉ (caché tant qu'aucun KMZ analysé) -->
        <div class="kta-aide-section" id="kta-kmz-imp-step-resume" style="display:none;">
          <div class="kta-aide-section-titre">📊 Aperçu du contenu détecté</div>
          <div id="kta-kmz-imp-resume" class="kta-conv-stats"></div>
        </div>

        <!-- 3. CONFIG IMPORT -->
        <div class="kta-aide-section" id="kta-kmz-imp-step-config" style="display:none;">
          <div class="kta-aide-section-titre">⚙️ Configuration de l'import</div>

          <div class="kta-planner-grille">
            <label class="kta-cfg-label">Nom du plan <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="kta-kmz-imp-name" type="text" placeholder="ex: Carrière du Val">

            <label class="kta-cfg-label">Version</label>
            <input class="kta-cfg-input" id="kta-kmz-imp-version" type="text" placeholder="v1" value="v1">

            <label class="kta-cfg-label">Auteur</label>
            <input class="kta-cfg-input" id="kta-kmz-imp-author" type="text" placeholder="ex: KARMA — Import KMZ">
          </div>

          <p class="kta-planner-info" style="margin-top:12px; margin-bottom:4px;">
            <strong>Types par défaut</strong> — fallback pour les Placemarks <em>sans</em>
            styleUrl reconnu. Les KMZ exportés depuis MyKTAMap encodent le tag/type
            directement (<code>#point_&lt;tag&gt;</code>, <code>#road_&lt;type&gt;</code>,
            <code>#zone_&lt;type&gt;</code>, <code>#structure_&lt;sous-type&gt;</code>) et
            sont restaurés tels quels — ces choix ci-dessous ne s'appliquent qu'aux
            Placemarks orphelins (ex: KMZ tiers Google Earth / OsmAnd / IGN scan).
          </p>

          <div class="kta-planner-grille">
            <label class="kta-cfg-label">📍 Points → tag</label>
            <select class="kta-cfg-input" id="kta-kmz-imp-point-tag">
              <option value="default">Par défaut (icône générique)</option>
              <option value="pa">Puits Aération (pa)</option>
              <option value="pb">Puits Bouchon (pb)</option>
              <option value="pc">Puits Communication (pc)</option>
              <option value="pe">Puits Égout (pe)</option>
              <option value="ps">Puits Spéléo (ps)</option>
              <option value="salle">Salle (salle)</option>
              <option value="chatiere">Chatière (chatiere)</option>
              <option value="passage">Passage (passage)</option>
              <option value="danger">Danger (danger)</option>
              <option value="info">Info (info)</option>
            </select>

            <label class="kta-cfg-label">🛣️ LineString → type</label>
            <select class="kta-cfg-input" id="kta-kmz-imp-road-type">
              <option value="chemin" selected>Chemin (jaune fin)</option>
              <option value="secondaire">Secondaire (violet)</option>
              <option value="principal">Principal (vert épais)</option>
            </select>

            <label class="kta-cfg-label">⬛ Polygon → type</label>
            <select class="kta-cfg-input" id="kta-kmz-imp-zone-type">
              <option value="remblais" selected>Remblais (gris)</option>
              <option value="eau">Eau (bleu)</option>
              <option value="effondrement">Effondrement (rouge)</option>
              <option value="inaccessible">Inaccessible (hachures rouge)</option>
            </select>
          </div>

          <!-- v1.14.20-hotfix12 (KARMA « depuis import KMZ on doit pouvoir
               cocher un mode V2 pour regénérer les tuiles, pareil M-LVL »).
               Options optionnelles appliquées au ZIP MyKTAMap généré : V2
               re-tile l'image plate du KMZ en tuiles 512×512 (utile pour
               une utilisation mobile sans saturer la mémoire), M-LVL active
               le multi-niveau dans le plan-config.json. -->
          <div style="margin-top:14px;">
            <label class="kta-planner-tiling-v2-row" title="Decoupe l'image plate du KMZ en tuiles 512x512 sur 4 niveaux de zoom. Reduction memoire massive sur les gros plans (>50 Mo).">
              <input type="checkbox" id="kta-kmz-imp-v2">
              <span>
                <strong>🧱 Convertir en V2 tuile (performance)</strong>
                <em>Re-génère les tuiles à partir de l'image plate du KMZ — utile si le plan d'origine était en V2 et qu'on veut retrouver le rendu fluide sur mobile. Génération lourde (1-5 minutes selon la taille). Recommandé sur PC.</em>
              </span>
            </label>
            <label class="kta-planner-multilevel-row" style="margin-top:8px;">
              <input type="checkbox" id="kta-kmz-imp-mlvl">
              <span>
                <strong>🏗️ Plan multi-niveau (avancé)</strong>
                <em>Active la gestion des étages (Niv 0, 1, 2…) + jonctions interniveau dans le plan-config.json généré. Ne coche que si le plan d'origine était multi-niveau et que tu vas re-saisir / re-importer les niveaux ensuite.</em>
              </span>
            </label>
          </div>
        </div>

      </div>

      <div class="kta-aide-actions" style="padding:14px 18px; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:10px; justify-content:flex-end;">
        <button class="kta-btn kta-btn-ghost" id="kta-kmz-imp-annuler">Annuler</button>
        <button class="kta-btn kta-btn-primary" id="kta-kmz-imp-generer" disabled>📦 Générer le ZIP MyKTAMap</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(modal);
  _kmzImportState = null;

  const _close = function() {
    modal.remove();
    _kmzImportState = null;
  };
  document.getElementById("kta-kmz-imp-close").addEventListener("click", _close);
  document.getElementById("kta-kmz-imp-annuler").addEventListener("click", _close);
  modal.addEventListener("click", function(e) { if (e.target === modal) _close(); });

  // Upload handler
  const input = document.getElementById("kta-kmz-imp-input");
  const labelEl = document.getElementById("kta-kmz-imp-label");
  input.addEventListener("change", async function() {
    const file = input.files && input.files[0];
    if (!file) return;
    labelEl.textContent = "📦 " + file.name;
    await _kmzImpAnalyserFichier(file);
  });

  // v1.14.20-hotfix4 — si un fichier KMZ a été pré-fourni (cas où l'user
  // a glissé un .kmz dans le drop zone principal du générateur), on
  // lance directement l'analyse sans demander de re-sélectionner.
  if (prefilledFile) {
    if (labelEl) labelEl.textContent = "📦 " + prefilledFile.name;
    // Lance l'analyse de manière asynchrone (la modale est déjà attachée
    // au DOM donc tous les getElementById fonctionneront).
    setTimeout(function() { _kmzImpAnalyserFichier(prefilledFile); }, 0);
  }

  // Generate button
  document.getElementById("kta-kmz-imp-generer").addEventListener("click", async function() {
    await _kmzImpGenerer();
  });
}

// Analyse un fichier KMZ : extraction + parsing + détection GroundOverlay
// + comptage. Affiche le résumé ou la modale d'erreur (Mode C).
async function _kmzImpAnalyserFichier(file) {
  const status = document.getElementById("kta-kmz-imp-status");
  const btnGen = document.getElementById("kta-kmz-imp-generer");
  const stepResume = document.getElementById("kta-kmz-imp-step-resume");
  const stepConfig = document.getElementById("kta-kmz-imp-step-config");
  status.textContent = "⏳ Extraction du KMZ…";
  status.style.color = "#8cb4ff";
  btnGen.disabled = true;
  stepResume.style.display = "none";
  stepConfig.style.display = "none";

  if (!window.KmzImport) {
    status.textContent = "❌ Module KmzImport non chargé";
    status.style.color = "#ff8c8c";
    return;
  }

  try {
    const { kmlDoc, assets } = await window.KmzImport.extraireKmz(file);

    // 🔒 v173 simplifié : on ne supporte QUE les KMZ exportés par MyKTAMap.
    // Détection via la signature "Export MyKTAMap" dans <Document><description>
    // (posée par kmzExport.js ligne 485) + fallbacks (name, styles).
    // Si le KMZ est tiers (Google Earth, OsmAnd, IGN scan…) → refus net.
    if (!window.KmzImport.estKmzMyktamap(kmlDoc)) {
      status.textContent = "❌ KMZ non compatible (pas un export MyKTAMap)";
      status.style.color = "#ff8c8c";
      _kmzImpAfficherModaleNonCompatible();
      return;
    }

    const overlays = window.KmzImport.extraireGroundOverlays(kmlDoc, assets);

    // Cas dégénéré : KMZ MyKTAMap reconnu mais sans GroundOverlay
    // (= exporté avec décoche "🖼️ Image plan" → théoriquement impossible
    // d'importer car pas de système coord pixel)
    if (overlays.length === 0) {
      status.textContent = "❌ KMZ MyKTAMap sans image plan (export sans GroundOverlay)";
      status.style.color = "#ff8c8c";
      _kmzImpAfficherModaleErrSansImage();
      return;
    }

    // Mode A : 1er overlay = image base
    const base = overlays[0];
    const dims = await window.KmzImport.lireDimensionsImage(base.hrefBlob);

    // Construction transformation GPS → pixel
    let transform;
    try {
      transform = window.KmzImport.buildTransform(base.corners, dims.width, dims.height);
    } catch (e) {
      status.textContent = "❌ Calibrage GPS invalide : " + (e.message || e);
      status.style.color = "#ff8c8c";
      return;
    }

    // Comptage des Placemarks (sans encore ingérer)
    const pmCount = kmlDoc.getElementsByTagName("Placemark").length;
    const ptCount = kmlDoc.querySelectorAll("Placemark > Point").length;
    const lsCount = kmlDoc.querySelectorAll("Placemark > LineString").length;
    const pgCount = kmlDoc.querySelectorAll("Placemark > Polygon").length;
    const mgCount = kmlDoc.querySelectorAll("Placemark > MultiGeometry").length;

    _kmzImportState = {
      file:      file,
      kmlDoc:    kmlDoc,
      assets:    assets,
      overlay:   base,
      transform: transform,
      imageW:    dims.width,
      imageH:    dims.height
    };

    // Résumé HTML
    const docName = (kmlDoc.querySelector("Document > name")?.textContent || "").trim() || "(sans nom)";
    const overlaysExtra = overlays.length > 1
      ? `<div style="color:#ffb380; font-size:12px; margin-top:4px;">⚠️ ${overlays.length - 1} autre(s) GroundOverlay ignorés en MVP (1er pris comme baseImage).</div>` : "";
    const mgWarn = mgCount > 0
      ? `<div style="color:#ffb380; font-size:12px; margin-top:4px;">⚠️ ${mgCount} MultiGeometry détecté(s) — sauté(s) en Phase 1 MVP (Phase 2 les éclatera).</div>` : "";

    // 🆕 v1.18.1 — Détection de la légende plan-level embarquée dans le KMZ
    // (cf §59 CLAUDE.md). Cherche `myktamap-extras.json` dans les assets,
    // parse son champ `customLegend` et affiche un résumé dans le preview
    // pour rassurer l'user : « ✅ Légende personnalisée détectée — sera
    // restaurée au boot du plan reconstruit ». Si le fichier est absent
    // (KMZ tiers ou MyKTAMap < v1.18.0), aucune ligne ajoutée (= silence
    // strictement équivalent à v1.18.0 minus l'info de transparence).
    let legendInfo = "";
    if (assets && typeof assets === "object") {
      const extrasKey = Object.keys(assets).find(function(p) {
        return /(?:^|\/)myktamap-extras\.json$/i.test(p);
      });
      if (extrasKey) {
        try {
          const blob   = assets[extrasKey];
          if (blob && typeof blob.text === "function") {
            const txt    = await blob.text();
            const extras = JSON.parse(txt);
            const cl     = extras && extras.customLegend;
            if (cl && typeof cl === "object") {
              const renamed = Object.keys(cl.labels || {}).length;
              const hiddenN = Array.isArray(cl.hidden)
                              ? cl.hidden.length
                              : Object.keys(cl.hidden || {}).length;
              const customN = Array.isArray(cl.customEntries) ? cl.customEntries.length : 0;
              if (renamed > 0 || hiddenN > 0 || customN > 0) {
                const parts = [];
                if (renamed > 0) parts.push(renamed + " renommé"  + (renamed > 1 ? "s" : ""));
                if (hiddenN > 0) parts.push(hiddenN + " masqué"   + (hiddenN > 1 ? "s" : ""));
                if (customN > 0) parts.push(customN + " custom"   + (customN > 1 ? "s" : ""));
                legendInfo = `<div style="color:#6ce28a; font-size:12px; margin-top:6px;">
                  ✅ <strong>Légende personnalisée du plan détectée</strong> :
                  ${parts.join(" · ")}
                  <span style="color:#8892a4;">(restaurée au boot du plan reconstruit)</span>
                </div>`;
              }
            }
          }
        } catch(e) {
          console.warn("[KmzImport-UI] ⚠️ Échec parse myktamap-extras.json (preview) :", e);
        }
      }
    }

    document.getElementById("kta-kmz-imp-resume").innerHTML = `
      <div>📄 <strong>Document KML</strong> : ${_escHtml(docName)}</div>
      <div>🖼️ <strong>Image plan</strong> : ${dims.width} × ${dims.height} px
        <span style="color:#8892a4;">(${_escHtml(base.name || base.hrefBlob.type || "image")})</span></div>
      <div>📐 <strong>Échelle calibrage</strong> : ${transform.metresParPixel.toFixed(3)} m/px
        · rotation ${(transform.rotation * 180 / Math.PI).toFixed(1)}°</div>
      <div style="margin-top:8px;">
        📍 <strong>${ptCount}</strong> points
        · 🛣️ <strong>${lsCount}</strong> lignes
        · ⬛ <strong>${pgCount}</strong> polygones
        <span style="color:#8892a4;">(${pmCount} Placemark total)</span>
      </div>
      ${legendInfo}${overlaysExtra}${mgWarn}
    `;

    // Pré-remplir le nom à partir du Document KML
    const nameInput = document.getElementById("kta-kmz-imp-name");
    if (nameInput && !nameInput.value) nameInput.value = docName !== "(sans nom)" ? docName : "";

    stepResume.style.display = "";
    stepConfig.style.display = "";
    btnGen.disabled = false;
    status.textContent = "✅ Prêt pour l'import — choisis les types par défaut puis génère.";
    status.style.color = "#6ce28a";

  } catch (e) {
    console.error("[KmzImport] Erreur analyse :", e);
    status.textContent = "❌ Erreur : " + (e.message || e);
    status.style.color = "#ff8c8c";
  }
}

// Modale d'erreur "KMZ non compatible" (v173 simplifié — round-trip MyKTAMap only).
// Affichée quand `estKmzMyktamap` retourne false (KMZ tiers).
function _kmzImpAfficherModaleNonCompatible() {
  const existing = document.getElementById("kta-kmz-imp-incompat-modal");
  if (existing) existing.remove();
  const m = document.createElement("div");
  m.id = "kta-kmz-imp-incompat-modal";
  m.className = "kta-readme-modal-overlay";
  m.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:80vh; border:1px solid rgba(255,140,140,0.35);">' +
      '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,140,140,0.20);">' +
        '<span class="kta-readme-modal-titre" style="color:#ff8c8c;">🚫 Ce fichier KMZ n\'est pas compatible pour le moment</span>' +
        '<button class="kta-panneau-close" id="kta-kmz-imp-incompat-close">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="font-size:13.5px; color:#c0c8d8; line-height:1.6; margin:0 0 12px;">' +
          'Ce KMZ ne contient pas la signature MyKTAMap qui permet l\'import dans cette ' +
          'version (Phase 1 MVP). Il a probablement été créé par un autre outil ' +
          '(<em>Google Earth, OsmAnd, Locus, Avenza, scan IGN, etc.</em>).' +
        '</p>' +
        '<div style="padding:10px 12px; background:rgba(140,180,255,0.06); border:1px solid rgba(140,180,255,0.22); border-radius:6px; margin-bottom:14px; font-size:12.5px; color:#c0c8d8;">' +
          '<strong style="color:#8cb4ff;">💡 Pour utiliser cette feature :</strong><br>' +
          '· Exporte un plan MyKTAMap au format KMZ via 💾 Export session → 🌍 KMZ<br>' +
          '· Le KMZ généré contient la signature qui permet de le ré-importer ici<br>' +
          '· Le support des KMZ tiers (Google Earth, OsmAnd…) est prévu pour une version future' +
        '</div>' +
        '<div style="display:flex; justify-content:flex-end;">' +
          '<button class="kta-btn kta-btn-primary" id="kta-kmz-imp-incompat-ok">J\'ai compris</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(m);
  const _c = function() { m.remove(); };
  document.getElementById("kta-kmz-imp-incompat-close").addEventListener("click", _c);
  document.getElementById("kta-kmz-imp-incompat-ok").addEventListener("click", _c);
  m.addEventListener("click", function(e) { if (e.target === m) _c(); });
}

// Modale d'erreur dédiée pour le Mode C (KMZ sans GroundOverlay).
// Refus définitif avec explication claire (choix 2=A validé KARMA).
function _kmzImpAfficherModaleErrSansImage() {
  const existing = document.getElementById("kta-kmz-imp-noimg-modal");
  if (existing) existing.remove();
  const m = document.createElement("div");
  m.id = "kta-kmz-imp-noimg-modal";
  m.className = "kta-readme-modal-overlay";
  m.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:80vh; border:1px solid rgba(255,140,140,0.35);">' +
      '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,140,140,0.20);">' +
        '<span class="kta-readme-modal-titre" style="color:#ff8c8c;">🚫 KMZ sans image plan</span>' +
        '<button class="kta-panneau-close" id="kta-kmz-imp-noimg-close">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="font-size:13.5px; color:#c0c8d8; line-height:1.6; margin:0 0 12px;">' +
          'Ce fichier KMZ ne contient pas de <code>GroundOverlay</code> (image plan géoréférencée). ' +
          'Il a probablement été créé pour de la cartographie OSM/satellite (waypoints, traces GPS) ' +
          'sans image de fond personnalisée.' +
        '</p>' +
        '<p style="font-size:13px; color:#c0c8d8; line-height:1.6; margin:0 0 14px;">' +
          'MyKTAMap a besoin d\'une <strong>image de plan</strong> (PNG/JPEG) pour positionner les annotations. ' +
          'Sans image, il n\'y a pas de système de coordonnées pixel à utiliser.' +
        '</p>' +
        '<div style="padding:10px 12px; background:rgba(255,179,128,0.06); border:1px solid rgba(255,179,128,0.22); border-radius:6px; margin-bottom:14px; font-size:12.5px; color:#c0c8d8;">' +
          '<strong style="color:#ffb380;">💡 Solutions :</strong><br>' +
          '· Si tu as une image scannée du plan, crée d\'abord le plan via 🏗️ Créer un plan, puis tu pourras ajouter les annotations à la main<br>' +
          '· Si le KMZ vient de MyKTAMap, vérifie qu\'il a bien été exporté avec l\'option 🖼️ Image plan cochée<br>' +
          '· Une future version pourra permettre un calibrage manuel (fournir image + 4 coins GPS) pour ce cas' +
        '</div>' +
        '<div style="display:flex; justify-content:flex-end;">' +
          '<button class="kta-btn kta-btn-primary" id="kta-kmz-imp-noimg-ok">J\'ai compris</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(m);
  const _c = function() { m.remove(); };
  document.getElementById("kta-kmz-imp-noimg-close").addEventListener("click", _c);
  document.getElementById("kta-kmz-imp-noimg-ok").addEventListener("click", _c);
  m.addEventListener("click", function(e) { if (e.target === m) _c(); });
}

async function _kmzImpGenerer() {
  if (!_kmzImportState) return;
  const state = _kmzImportState;
  const btnGen = document.getElementById("kta-kmz-imp-generer");
  const status = document.getElementById("kta-kmz-imp-status");

  const name    = (document.getElementById("kta-kmz-imp-name")?.value || "").trim();
  const version = (document.getElementById("kta-kmz-imp-version")?.value || "").trim() || "v1";
  const author  = (document.getElementById("kta-kmz-imp-author")?.value || "").trim() || "Import KMZ";
  const pointTag = document.getElementById("kta-kmz-imp-point-tag").value;
  const roadType = document.getElementById("kta-kmz-imp-road-type").value;
  const zoneType = document.getElementById("kta-kmz-imp-zone-type").value;
  // v1.14.20-hotfix12 — options optionnelles du flow KMZ
  const tilingV2On = !!document.getElementById("kta-kmz-imp-v2")?.checked;
  const multiLevelOn = !!document.getElementById("kta-kmz-imp-mlvl")?.checked;

  if (!name) {
    status.textContent = "⚠️ Le nom du plan est obligatoire";
    status.style.color = "#ffb380";
    return;
  }

  btnGen.disabled = true;
  btnGen.textContent = "⏳ Génération…";
  status.textContent = "⏳ Conversion en cours…";
  status.style.color = "#8cb4ff";

  try {
    // Ingestion des Placemarks
    const ingested = window.KmzImport.ingestPlacemarks(state.kmlDoc, state.transform, {
      pointTag: pointTag,
      roadType: roadType,
      zoneType: zoneType
    });

    // Préserver l'extension de l'image source
    const mime = state.overlay.hrefBlob.type || "image/png";
    let ext = "png";
    if (/jpeg|jpg/i.test(mime)) ext = "jpg";
    else if (/webp/i.test(mime)) ext = "webp";
    const baseImageFilename = "baseImage." + ext;

    // v1.14.20-hotfix12 — overlay de progression V2 (réutilise le pattern
    // du générateur classique). Affiché uniquement si tilingV2On.
    let v2Overlay = null;
    if (tilingV2On) {
      v2Overlay = document.createElement("div");
      v2Overlay.id = "kta-kmz-imp-v2-progress";
      v2Overlay.className = "kta-modal-overlay";
      v2Overlay.style.zIndex = "100000";
      v2Overlay.innerHTML =
        '<div class="kta-modal">' +
          '<div class="kta-modal-icon">🧱</div>' +
          '<div class="kta-modal-titre">Conversion V2 tuile : génération des tuiles…</div>' +
          '<div class="kta-modal-texte">' +
            '<div id="kta-kmz-v2-progress-text" style="margin-bottom:10px;">Initialisation…</div>' +
            '<div style="background:rgba(255,255,255,0.06); border-radius:6px; height:8px; overflow:hidden;">' +
              '<div id="kta-kmz-v2-progress-bar" style="height:100%; width:0%; background:#b452ff; transition:width 0.2s;"></div>' +
            '</div>' +
            '<p style="font-size:11.5px; color:#8892a4; margin:14px 0 0; line-height:1.5;">' +
              '⚠️ Ne ferme pas l\'onglet pendant la conversion. Sur mobile, le navigateur peut killer la page si la mémoire sature.' +
            '</p>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(v2Overlay);
    }

    const onTilingProgress = tilingV2On ? function(done, total, currentZ) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const txt = document.getElementById("kta-kmz-v2-progress-text");
      const bar = document.getElementById("kta-kmz-v2-progress-bar");
      if (txt) txt.textContent = "Niveau z=" + currentZ + " · " + done + " / " + total + " tuiles (" + pct + "%)";
      if (bar) bar.style.width = pct + "%";
    } : null;

    let blob;
    try {
      blob = await window.KmzImport.genererZipMyktamap({
        planName:          name,
        planVersion:       version,
        planAuthor:        author,
        baseImage:         state.overlay.hrefBlob,
        baseImageFilename: baseImageFilename,
        imageW:            state.imageW,
        imageH:            state.imageH,
        // 🆕 v1.21.0-fix6 : pass des 4 coins GPS du GroundOverlay KMZ pour
        // que genererZipMyktamap puisse embed `plan.georef` (calibrage 2
        // points SW↔NE). Sans ça, le KMZ ré-importé perdait son calibrage
        // GPS et l'user devait re-saisir les 8 champs dans Réglages.
        overlayCorners:    state.overlay.corners,
        // v1.14.20-hotfix4 — on passe TOUS les assets extraits du KMZ pour que
        // genererZipMyktamap puisse récupérer les icônes embarquées (files/
        // icons/<tag>.png posé par kmzExport.js) et les remettre dans le ZIP
        // MyKTAMap sous icon/<tag>.png avec mapping planConfig.icons.
        assets:            state.assets,
        // v1.14.20-hotfix12 — options optionnelles : V2 re-tile l'image
        // plate du KMZ, M-LVL ajoute plan.multiLevel=true au plan-config.
        tilingV2:          tilingV2On,
        multiLevel:        multiLevelOn,
        onTilingProgress:  onTilingProgress,
        imported: {
          points:     ingested.points,
          roads:      ingested.roads,
          zones:      ingested.zones,
          // 🆕 v1.9.3-A1.b.1 : passage des structures détectées via
          // styleUrl="#structure_*" dans le KMZ. Si KMZ legacy sans
          // structures → ingested.structures = [] → no-op silencieux.
          structures: ingested.structures || []
        }
      });
    } finally {
      if (v2Overlay && v2Overlay.parentNode) v2Overlay.remove();
    }

    // Téléchargement
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plan_" + name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() + "_from_kmz.zip";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    const s = ingested.stats;
    status.innerHTML = "✅ ZIP généré ! " +
      "<span style='color:#c0c8d8;'>" + s.kept + " gardé(s) · " +
      s.skipped + " sauté(s)" +
      (s.outOfBounds > 0 ? " · " + s.outOfBounds + " hors-bounds" : "") +
      (s.multiGeometry > 0 ? " · " + s.multiGeometry + " MultiGeometry sautés (Phase 2)" : "") +
      "</span>";
    status.style.color = "#6ce28a";
    btnGen.textContent = "✅ Téléchargé — Re-générer";
    btnGen.disabled = false;
    console.log("[KmzImport] Stats :", s);
  } catch (e) {
    console.error("[KmzImport] Erreur génération :", e);
    status.textContent = "❌ Erreur : " + (e.message || e);
    status.style.color = "#ff8c8c";
    btnGen.textContent = "📦 Générer le ZIP MyKTAMap";
    btnGen.disabled = false;
  }
}

function _escHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
  });
}

// =====================================================================
// 📤 MODALE IMPORT GPX → ZIP MyKTAMap (depuis v1.15.0)
// =====================================================================
// Pipeline complet en 1 modale (mirroir de _afficherImporterKmz) :
//   1. Upload d'un fichier .gpx (MyKTAMap export, signature creator)
//   2. Parsing automatique (gpxImport.js > extraireGpx)
//   3. Affichage du résumé : nb waypoints, nb tracks, bounds GPS
//   4. Choix dimensions canvas + couleur + tag/type par défaut + V2 + M-LVL
//   5. Bouton "Générer le ZIP" qui télécharge le ZIP MyKTAMap utilisable
//
// Différence majeure vs KMZ : un GPX n'a pas d'image plan. On GÉNÈRE un
// canvas vierge (mode « image vierge » du générateur classique) calibré
// automatiquement sur les bounds GPS du GPX.
// =====================================================================

let _gpxImportState = null;  // { gpxDoc, parsed, bounds, file }

function _afficherImporterGpx(prefilledFile) {
  const existing = document.getElementById("kta-gpx-import-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id        = "kta-gpx-import-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-kmz-imp-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">📤 Importer un GPX → ZIP MyKTAMap</span>
        <button class="kta-panneau-close" id="kta-gpx-imp-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps" id="kta-kmz-imp-corps">

        <p class="kta-planner-info" style="margin-bottom:14px;">
          Sélectionne un fichier <strong>.gpx</strong> précédemment exporté par MyKTAMap
          (📡 Export externe → onglet GPX). L'app génère un ZIP MyKTAMap utilisable
          avec un <strong>canvas vierge calibré automatiquement</strong> sur les bounds GPS du GPX
          — tu pourras remplacer le canvas par une vraie image plan ensuite en mode
          « Modifier le plan ».
        </p>
        <div style="padding:8px 12px; background:rgba(140,180,255,0.06); border:1px solid rgba(140,180,255,0.22); border-radius:6px; font-size:12px; color:#c0c8d8; margin-bottom:14px;">
          <strong style="color:#8cb4ff;">ℹ️ Round-trip MyKTAMap</strong> — un GPX exporté depuis
          MyKTAMap conserve les tags points (via <code>&lt;sym&gt;</code>),
          les types de tracé (<code>&lt;type&gt;</code>) et les niveaux M-LVL
          (<code>&lt;cmt&gt;MyKTAMap level=N&lt;/cmt&gt;</code>) — tous restaurés au ré-import.
        </div>

        <!-- 1. UPLOAD -->
        <div class="kta-aide-section" id="kta-gpx-imp-step-upload">
          <div class="kta-aide-section-titre">📂 Fichier GPX</div>
          <div class="kta-conv-drop" id="kta-gpx-imp-drop" style="position:relative; overflow:hidden;">
            <span style="font-size:28px;">📤</span>
            <span id="kta-gpx-imp-label">Glisse un .gpx ici ou clique pour sélectionner</span>
            <input type="file" id="kta-gpx-imp-input" accept=".gpx,application/gpx+xml"
              style="position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; z-index:5;">
          </div>
          <div id="kta-gpx-imp-status" style="margin-top:8px;font-size:13px;min-height:18px;"></div>
        </div>

        <!-- 2. RÉSUMÉ -->
        <div class="kta-aide-section" id="kta-gpx-imp-step-resume" style="display:none;">
          <div class="kta-aide-section-titre">📊 Aperçu du contenu détecté</div>
          <div id="kta-gpx-imp-resume" class="kta-conv-stats"></div>
        </div>

        <!-- 3. CONFIG IMPORT -->
        <div class="kta-aide-section" id="kta-gpx-imp-step-config" style="display:none;">
          <div class="kta-aide-section-titre">⚙️ Configuration de l'import</div>

          <div class="kta-planner-grille">
            <label class="kta-cfg-label">Nom du plan <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="kta-gpx-imp-name" type="text" placeholder="ex: Plan GPX importé">

            <label class="kta-cfg-label">Version</label>
            <input class="kta-cfg-input" id="kta-gpx-imp-version" type="text" placeholder="v1" value="v1">

            <label class="kta-cfg-label">Auteur</label>
            <input class="kta-cfg-input" id="kta-gpx-imp-author" type="text" placeholder="ex: KARMA — Import GPX">
          </div>

          <p class="kta-planner-info" style="margin-top:12px; margin-bottom:4px;">
            <strong>Canvas vierge</strong> — un fond uni est généré aux dimensions choisies. La calibration
            GPS est automatique (bounds du GPX). Tu pourras remplacer ce canvas par une vraie image plan
            ensuite via 🏗️ Générer un plan → Modifier.
          </p>

          <div class="kta-planner-grille">
            <label class="kta-cfg-label">Largeur (px)</label>
            <input class="kta-cfg-input" id="kta-gpx-imp-w" type="number" min="500" max="12000" step="100" value="4000">

            <label class="kta-cfg-label">Hauteur (px)</label>
            <input class="kta-cfg-input" id="kta-gpx-imp-h" type="number" min="500" max="12000" step="100" value="4000">
          </div>

          <div class="kta-cfg-label" style="margin-top:8px;">Couleur du canvas</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:4px;">
            <label class="kta-export-radio-row">
              <input type="radio" name="gpx_imp_color" value="white">
              <span>⬜ Blanc <span style="color:#8892a4; font-size:11px;">(papier)</span></span>
            </label>
            <label class="kta-export-radio-row">
              <input type="radio" name="gpx_imp_color" value="gray">
              <span>▫️ Gris clair <span style="color:#8892a4; font-size:11px;">(neutre)</span></span>
            </label>
            <label class="kta-export-radio-row">
              <input type="radio" name="gpx_imp_color" value="black">
              <span>⬛ Noir <span style="color:#8892a4; font-size:11px;">(contraste)</span></span>
            </label>
            <label class="kta-export-radio-row">
              <input type="radio" name="gpx_imp_color" value="sepia" checked>
              <span>📜 Sépia <span style="color:#8892a4; font-size:11px;">(carte ancienne)</span></span>
            </label>
          </div>

          <p class="kta-planner-info" style="margin-top:12px; margin-bottom:4px;">
            <strong>Types par défaut</strong> — fallback pour les waypoints / tracks <em>sans</em>
            <code>&lt;sym&gt;</code> / <code>&lt;type&gt;</code> reconnu. Les GPX MyKTAMap encodent
            le tag/type directement et sont restaurés tels quels.
          </p>

          <div class="kta-planner-grille">
            <label class="kta-cfg-label">📍 Points → tag</label>
            <select class="kta-cfg-input" id="kta-gpx-imp-point-tag">
              <option value="default" selected>Par défaut (icône générique)</option>
              <option value="pa">Puits Aération (pa)</option>
              <option value="pb">Puits Bouchon (pb)</option>
              <option value="pc">Puits Communication (pc)</option>
              <option value="pe">Puits Égout (pe)</option>
              <option value="ps">Puits Spéléo (ps)</option>
              <option value="salle">Salle (salle)</option>
              <option value="chatiere">Chatière (chatiere)</option>
              <option value="passage">Passage (passage)</option>
              <option value="danger">Danger (danger)</option>
              <option value="info">Info (info)</option>
            </select>

            <label class="kta-cfg-label">🛣️ Tracks → type</label>
            <select class="kta-cfg-input" id="kta-gpx-imp-road-type">
              <option value="chemin" selected>Chemin (jaune fin)</option>
              <option value="secondaire">Secondaire (violet)</option>
              <option value="principal">Principal (vert épais)</option>
            </select>
          </div>

          <!-- Options V2 + M-LVL (cohérent avec _afficherImporterKmz hotfix12) -->
          <div style="margin-top:14px;">
            <label class="kta-planner-tiling-v2-row" title="Decoupe le canvas en tuiles 512x512 sur 4 niveaux de zoom. Reduction memoire massive sur les gros plans.">
              <input type="checkbox" id="kta-gpx-imp-v2">
              <span>
                <strong>🧱 Convertir en V2 tuile (performance)</strong>
                <em>Re-tile le canvas vierge en tuiles 512×512. Utile uniquement si tu prévois de remplacer le canvas par une grande image ensuite. Pour un canvas vide, V1 suffit largement.</em>
              </span>
            </label>
            <label class="kta-planner-multilevel-row" style="margin-top:8px;">
              <input type="checkbox" id="kta-gpx-imp-mlvl">
              <span>
                <strong>🏗️ Plan multi-niveau (avancé)</strong>
                <em>Active la gestion des étages dans le plan-config.json généré. Coche si ton GPX MyKTAMap contenait des annotations multi-niveau (préservées via <code>&lt;cmt&gt;MyKTAMap level=N&lt;/cmt&gt;</code>).</em>
              </span>
            </label>
          </div>
        </div>

      </div>

      <div class="kta-aide-actions" style="padding:14px 18px; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:10px; justify-content:flex-end;">
        <button class="kta-btn kta-btn-ghost" id="kta-gpx-imp-annuler">Annuler</button>
        <button class="kta-btn kta-btn-primary" id="kta-gpx-imp-generer" disabled>📦 Générer le ZIP MyKTAMap</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(modal);
  _gpxImportState = null;

  const _close = function() {
    modal.remove();
    _gpxImportState = null;
  };
  document.getElementById("kta-gpx-imp-close").addEventListener("click", _close);
  document.getElementById("kta-gpx-imp-annuler").addEventListener("click", _close);
  modal.addEventListener("click", function(e) { if (e.target === modal) _close(); });

  const input   = document.getElementById("kta-gpx-imp-input");
  const labelEl = document.getElementById("kta-gpx-imp-label");
  input.addEventListener("change", async function() {
    const file = input.files && input.files[0];
    if (!file) return;
    labelEl.textContent = "📦 " + file.name;
    await _gpxImpAnalyserFichier(file);
  });

  document.getElementById("kta-gpx-imp-generer").addEventListener("click", _gpxImpGenerer);

  // Si fichier pré-fourni (drop zone home avec .gpx ou drop dans générateur),
  // lance directement l'analyse.
  if (prefilledFile) {
    if (labelEl) labelEl.textContent = "📦 " + prefilledFile.name;
    setTimeout(function() { _gpxImpAnalyserFichier(prefilledFile); }, 0);
  }
}

async function _gpxImpAnalyserFichier(file) {
  const status = document.getElementById("kta-gpx-imp-status");
  status.textContent = "⏳ Analyse du GPX en cours…";
  status.style.color = "#8cb4ff";

  if (!window.GpxImport || !window.GpxIO) {
    status.textContent = "❌ Module GpxImport / GpxIO non chargé";
    status.style.color = "#ff8c8c";
    return;
  }
  try {
    const { gpxDoc, parsed } = await window.GpxImport.extraireGpx(file);

    // Détection MyKTAMap (warn si non-MyKTAMap mais pas blocking)
    const isMkm = window.GpxImport.estGpxMyktamap(gpxDoc);

    // Bounds GPS
    const bounds = window.GpxImport.extraireBoundsGps(parsed);
    if (!bounds || bounds.count === 0) {
      status.textContent = "❌ Aucune coordonnée GPS valide dans ce GPX";
      status.style.color = "#ff8c8c";
      return;
    }

    _gpxImportState = {
      file: file,
      gpxDoc: gpxDoc,
      parsed: parsed,
      bounds: bounds,
      isMyktamap: isMkm
    };

    // Résumé HTML
    const sourceLine = isMkm
      ? '<div style="color:#6ce28a;">✅ GPX MyKTAMap détecté — round-trip complet (tags, niveaux M-LVL préservés)</div>'
      : '<div style="color:#ffb380;">⚠️ GPX tiers (TopoDroid / OsmAnd / Strava…) — types par défaut appliqués aux waypoints/tracks sans <code>&lt;sym&gt;</code> ou <code>&lt;type&gt;</code> reconnu</div>';
    const dLat = bounds.latMax - bounds.latMin;
    const dLng = bounds.lngMax - bounds.lngMin;

    // 🆕 v1.18.1 — Détection légende plan-level embarquée via
    // <extensions><myktamap:customLegend>...</myktamap:customLegend></extensions>
    // sous <metadata> (cf §59 CLAUDE.md + gpxIO.js > parser). Affiche un
    // résumé dans le preview pour rassurer l'user : « ✅ Légende personnalisée
    // détectée — sera restaurée au boot du plan reconstruit ». Skip silencieux
    // si absente (= GPX tiers ou MyKTAMap < v1.18.1).
    let legendInfo = "";
    const cl = parsed.metadata && parsed.metadata.customLegend;
    if (cl && typeof cl === "object") {
      const renamed = Object.keys(cl.labels || {}).length;
      const hiddenN = Array.isArray(cl.hidden)
                      ? cl.hidden.length
                      : Object.keys(cl.hidden || {}).length;
      const customN = Array.isArray(cl.customEntries) ? cl.customEntries.length : 0;
      if (renamed > 0 || hiddenN > 0 || customN > 0) {
        const parts = [];
        if (renamed > 0) parts.push(renamed + " renommé"  + (renamed > 1 ? "s" : ""));
        if (hiddenN > 0) parts.push(hiddenN + " masqué"   + (hiddenN > 1 ? "s" : ""));
        if (customN > 0) parts.push(customN + " custom"   + (customN > 1 ? "s" : ""));
        legendInfo = `<div style="color:#6ce28a; font-size:12px; margin-top:6px;">
          ✅ <strong>Légende personnalisée du plan détectée</strong> :
          ${parts.join(" · ")}
          <span style="color:#8892a4;">(restaurée au boot du plan reconstruit)</span>
        </div>`;
      }
    }

    document.getElementById("kta-gpx-imp-resume").innerHTML = `
      ${sourceLine}
      <div>📍 <strong>Waypoints</strong> : ${parsed.waypoints.length}</div>
      <div>🛣️ <strong>Tracks</strong> : ${parsed.tracks.length}</div>
      <div>🌐 <strong>Bounds GPS</strong> : lat ${bounds.latMin.toFixed(5)} → ${bounds.latMax.toFixed(5)} (Δ ${dLat.toFixed(5)}°), lng ${bounds.lngMin.toFixed(5)} → ${bounds.lngMax.toFixed(5)} (Δ ${dLng.toFixed(5)}°)</div>
      <div>📐 <strong>Calibrage auto</strong> : coin BL = (lat_min, lng_min), coin TR = (lat_max, lng_max)</div>
      ${legendInfo}
    `;

    document.getElementById("kta-gpx-imp-step-resume").style.display = "";
    document.getElementById("kta-gpx-imp-step-config").style.display = "";

    // Pré-remplit le nom du plan depuis metadata.name si dispo
    const nameInput = document.getElementById("kta-gpx-imp-name");
    if (nameInput && !nameInput.value && parsed.metadata && parsed.metadata.name) {
      nameInput.value = parsed.metadata.name + " (depuis GPX)";
    }

    document.getElementById("kta-gpx-imp-generer").disabled = false;

    status.textContent = "✅ GPX analysé — configure ci-dessous puis Générer le ZIP";
    status.style.color = "#6ce28a";
  } catch(err) {
    status.textContent = "❌ " + (err.message || err);
    status.style.color = "#ff8c8c";
  }
}

async function _gpxImpGenerer() {
  if (!_gpxImportState) return;
  const state = _gpxImportState;
  const btnGen = document.getElementById("kta-gpx-imp-generer");
  const status = document.getElementById("kta-gpx-imp-status");

  const name    = (document.getElementById("kta-gpx-imp-name")?.value || "").trim();
  const version = (document.getElementById("kta-gpx-imp-version")?.value || "").trim() || "v1";
  const author  = (document.getElementById("kta-gpx-imp-author")?.value || "").trim() || "Import GPX";
  const w       = parseInt(document.getElementById("kta-gpx-imp-w").value, 10) || 4000;
  const h       = parseInt(document.getElementById("kta-gpx-imp-h").value, 10) || 4000;
  const colorEl = document.querySelector('input[name="gpx_imp_color"]:checked');
  const color   = colorEl ? colorEl.value : "sepia";
  const pointTag = document.getElementById("kta-gpx-imp-point-tag").value;
  const roadType = document.getElementById("kta-gpx-imp-road-type").value;
  const tilingV2On   = !!document.getElementById("kta-gpx-imp-v2")?.checked;
  const multiLevelOn = !!document.getElementById("kta-gpx-imp-mlvl")?.checked;

  if (!name) {
    status.textContent = "⚠️ Le nom du plan est obligatoire";
    status.style.color = "#ffb380";
    return;
  }

  btnGen.disabled = true;
  btnGen.textContent = "⏳ Génération…";
  status.textContent = "⏳ Conversion en cours…";
  status.style.color = "#8cb4ff";

  // Overlay V2 progress si demandé (réutilise pattern KMZ)
  let v2Overlay = null;
  if (tilingV2On) {
    v2Overlay = document.createElement("div");
    v2Overlay.id = "kta-gpx-imp-v2-progress";
    v2Overlay.className = "kta-modal-overlay";
    v2Overlay.style.zIndex = "100000";
    v2Overlay.innerHTML =
      '<div class="kta-modal">' +
        '<div class="kta-modal-icon">🧱</div>' +
        '<div class="kta-modal-titre">Conversion V2 tuile : génération des tuiles…</div>' +
        '<div class="kta-modal-texte">' +
          '<div id="kta-gpx-v2-progress-text" style="margin-bottom:10px;">Initialisation…</div>' +
          '<div style="background:rgba(255,255,255,0.06); border-radius:6px; height:8px; overflow:hidden;">' +
            '<div id="kta-gpx-v2-progress-bar" style="height:100%; width:0%; background:#b452ff; transition:width 0.2s;"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(v2Overlay);
  }
  const onTilingProgress = tilingV2On ? function(done, total, currentZ) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const txt = document.getElementById("kta-gpx-v2-progress-text");
    const bar = document.getElementById("kta-gpx-v2-progress-bar");
    if (txt) txt.textContent = "Niveau z=" + currentZ + " · " + done + " / " + total + " tuiles (" + pct + "%)";
    if (bar) bar.style.width = pct + "%";
  } : null;

  try {
    const result = await window.GpxImport.genererZipMyktamap({
      planName:         name,
      planVersion:      version,
      planAuthor:       author,
      parsed:           state.parsed,
      bounds:           state.bounds,
      canvasWidth:      w,
      canvasHeight:     h,
      canvasColor:      color,
      pointTag:         pointTag,
      roadType:         roadType,
      tilingV2:         tilingV2On,
      multiLevel:       multiLevelOn,
      onTilingProgress: onTilingProgress
    });

    // Téléchargement
    const url = URL.createObjectURL(result.blob);
    const a   = document.createElement("a");
    a.href = url;
    a.download = "plan_" + name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() + "_from_gpx.zip";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    const s = result.stats;
    status.innerHTML = "✅ ZIP généré ! " +
      (s.kept || 0) + " annotations importées, " +
      (s.outOfBounds || 0) + " hors-bounds ignorée(s), " +
      (s.skipped || 0) + " skippée(s).";
    status.style.color = "#6ce28a";
  } catch(err) {
    status.textContent = "❌ Erreur génération : " + (err.message || err);
    status.style.color = "#ff8c8c";
  } finally {
    if (v2Overlay && v2Overlay.parentNode) v2Overlay.remove();
    btnGen.textContent = "📦 Générer le ZIP MyKTAMap";
    btnGen.disabled = false;
  }
}

window.afficherImporterGpx = _afficherImporterGpx;
