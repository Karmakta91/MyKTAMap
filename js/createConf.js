/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// CREATECONF.JS — Générateur de plans (ZIP MyKTAMap)
// =========================
// Modale du Générateur (nouveau plan, mode Modifier d'un ZIP, assistant pas à pas, icônes, calques,
// tuilage V2) et convertisseurs KMZ / GPX / SIG / GeoTIFF / image vers un ZIP de plan.
// Expose : window.afficherPlanner, ktaGenerateurMaj (mise à jour d'un plan, prérempli par js/majPlan.js),
// afficherImporterKmz/Gpx/Sig/GeoTiff/Image, MyKTAMapTilingV2,
// ktaLireDimensionsEntete.
// 🩸 Le chemin d'une icône vit dans `dataset.ktaPath`, jamais dans un libellé affiché (cf. _ajouterIconRow).
// 🩸 Tuilage V2 : chaque tuile est découpée depuis l'image source, sans canvas pleine résolution.
// Garde-fous : check-icon-catalog.js, check-tiling.js, check-geotiff.js, check-image-header-dims.js.
// Doc : docs/architecture/plans-loader.md, docs/TILING.md.

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
  plaque:   "icon/plaque.png",
  portail:  "icon/portail.png",   // liaison inter-plan
  // Point d'entrée du plan (Vue OSM × Mode Secours), cf. map.js > TAGS_BUILTIN.
  entree_plan: "icon/entree_plan.png"
};

const PLANNER_EDITOR_JSON   = JSON.stringify({ type: "editor", version: 1, data: [] }, null, 2);
const PLANNER_SYSTEME_TAGS  = ["default", "track"];

let _imageLayerCount   = 0;
let _dataLayerCount    = 0;
let _iconRowCount      = 0;
let _plannerOrigAssets = {};
// PDF Histoire multiples du générateur.
let _plannerHistPdfs = [];

function _renderHistPdfListe() {
  const liste = document.getElementById("pl_histoirePdf_liste");
  const nom   = document.getElementById("pl_histoirePdf_nom");
  if (!liste) return;
  if (nom) {
    nom.textContent = _plannerHistPdfs.length
      ? window.I18n.t("gen.histoire.nFichiers", { n: _plannerHistPdfs.length })
      : window.I18n.t("gen.upload.aucunFichier");
  }
  liste.innerHTML = _plannerHistPdfs.map(function(e, i) {
    return '<div class="kta-planner-hist-row">' +
             '<span class="kta-planner-hist-nom">📄 ' + e.name.replace(/[&<>"]/g, "") +
               (e.fromZip ? ' <em>' + window.I18n.t("gen.upload.depuisZip") + '</em>' : '') + '</span>' +
             '<button type="button" class="kta-planner-add-btn" data-hist-del="' + i + '">' +
               window.I18n.t("gen.histoire.retirerBtn") + '</button>' +
           '</div>';
  }).join("");
  liste.querySelectorAll("[data-hist-del]").forEach(function(b) {
    b.addEventListener("click", function() {
      _plannerHistPdfs.splice(parseInt(b.getAttribute("data-hist-del"), 10), 1);
      _renderHistPdfListe();
    });
  });
}
// Photos extraites d'un calque de données ZIP importé (bouton « Importer ZIP »), format
// [{id, pointId, mime, size, blob}] comme sessionExporter.js > _convUploadedPhotos. Embarquées dans
// data/photos/ par _genererZip. Remises à zéro à chaque ouverture de la modale.
let _plannerPhotosFromZip = [];
let _plannerMode       = "nouveau";
// Mise à jour d'un plan (js/majPlan.js > window.ktaGenerateurMaj) : { calques: [{ id, label, payload }], legende,
// onZip(blob, nomFichier, infos) }. Appliquée au formulaire une fois le ZIP du plan chargé ; présente, elle remplace
// le téléchargement et la proposition « Publier » de fin de génération (l'assistant choisit la suite). Remise à
// null à chaque ouverture de la modale.
let _plannerMaj = null;
// Empreinte du ZIP chargé en mode Modifier { sha256, taille, nom } : sert à reconnaître un plan d'extension
// (cf. _planExtensionDuZip). null en mode Nouveau ; remise à null à chaque ouverture de la modale.
let _plannerSourceZip = null;

// Légende du plan (source de `plan.customLegend`). null = pas de personnalisation, sinon l'état de
// `LegendCustomization.getSessionState()` : { schemaVersion, labels, hidden, customEntries }.
// Éditée depuis « Légende du plan » (mode Avancé). Remise à zéro à chaque ouverture, préremplie en mode
// Modifier depuis `config.plan.customLegend`.
let _plannerPlanLegend = null;

// Légende propre à l'écran « Convertir depuis SIG ». Séparée de `_plannerPlanLegend` : mélanger les deux
// ferait fuiter les entrées d'un écran dans le plan de l'autre.
let _sigPlanLegend = null;
// Invalidation de légende à signaler jusqu'à la prochaine édition. Un booléen plutôt qu'un texte dans le
// DOM : `_sigImpMajEtatLegende` est rappelée par plusieurs chemins (niveau, colonne, routage) et écraserait
// le message aussitôt affiché.
let _sigLegendeReset = false;

// Clé localStorage du mode Simple/Avancé (« simple » par défaut), lue par _lirePlannerMode. Forcé à
// « avance » en mode Modifier : simplifier l'édition d'un plan existant perdrait customs, calques et icônes.
// Lit un champ d'étiquettes (virgules) et le normalise par `PlanRegistry.normaliserTags` (trim,
// dédoublonnage sans casse, 12 max, 24 caractères). Seul chemin du Générateur et des convertisseurs.
function _lireTagsChamp(idChamp) {
  const el = document.getElementById(idChamp);
  const brut = String((el && el.value) || "").split(",");
  if (window.PlanRegistry && typeof window.PlanRegistry.normaliserTags === "function") {
    return window.PlanRegistry.normaliserTags(brut);
  }
  return brut.map(function(s) { return s.trim().slice(0, 24); }).filter(Boolean).slice(0, 12);
}

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

// Pas de boutons « Importer KMZ / GPX » : la zone de dépôt ZIP route déjà ces extensions
// (_routerFichierImport). window.afficherImporterKmz / afficherImporterGpx restent pour usage programmatique.

// ── Modale principale ──────────
function afficherPlanner() {
  const existing = document.getElementById("kta-planner-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id        = "kta-planner-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-planner-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">${window.I18n.t("gen.modal.titre")}</span>
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
        <div class="kta-planner-mode-switcher" id="kta-planner-mode-switcher" role="tablist" aria-label="${window.I18n.t("gen.mode.aria")}">
          <button type="button" class="kta-planner-mode-btn" data-mode="simple" role="tab">${window.I18n.t("gen.mode.simple")}</button>
          <button type="button" class="kta-planner-mode-btn" data-mode="avance" role="tab">${window.I18n.t("gen.mode.avance")}</button>
        </div>
        <!-- Vide depuis l'allègement des textes : garde sa rangée pleine largeur
             (cf. style.css « LE TROU ») et sert d'ancre à la barre d'étapes. -->
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
            <span>${window.I18n.t("gen.zip.titre")}</span>
            <!-- 📥 Bouton Conf exemple — déplacé ici depuis la home loader en v1.7.3.
                 Permet de télécharger le ZIP d'exemple myktamap.zip pour avoir un
                 plan de référence à modifier (workflow recommandé pour débutants). -->
            <button type="button" id="kta-planner-conf-exemple-btn" class="kta-btn kta-btn-ghost kta-btn-small"
                    title="${window.I18n.t("gen.zip.exempleTitle")}"
                    style="font-size:12px; padding:4px 10px;">
              ${window.I18n.t("gen.zip.exempleBtn")}
            </button>
          </div>
          <div class="kta-conv-drop" id="kta-planner-zip-drop" style="position:relative; overflow:hidden;">
            <span style="font-size:28px;">📦</span>
            <span id="kta-planner-zip-label">${window.I18n.t("gen.zip.dropLabel")}</span>

            <input
              type="file"
              id="kta-planner-zip-input"
              accept=".zip,.kmz,.gpx,.geojson,.json,.kml,.tif,.tiff,application/zip,application/vnd.google-earth.kmz,application/gpx+xml,application/geo+json,application/vnd.google-earth.kml+xml,image/tiff"
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
          <div class="kta-aide-section-titre">${window.I18n.t("gen.infos.titre")}</div>
          <div class="kta-planner-grille">
            <label class="kta-cfg-label">${window.I18n.t("gen.infos.nom")} <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="pl_name" type="text" placeholder="${window.I18n.t("gen.infos.nomPlaceholder")}">

            <label class="kta-cfg-label">${window.I18n.t("gen.infos.version")}</label>
            <input class="kta-cfg-input" id="pl_version" type="text" placeholder="V1">

            <label class="kta-cfg-label">${window.I18n.t("gen.infos.auteur")}</label>
            <input class="kta-cfg-input" id="pl_author" type="text" placeholder="${window.I18n.t("gen.infos.auteurPlaceholder")}">

            <!-- 🏷️ 16/09/2026 (KARMA : « affecter des tags directement à la
                 génération ») — même saisie que ConfAdmin : virgules, 12 max,
                 24 caractères. Écrit plan.tags dans plan-config.json ; le
                 fichier PROPOSE, l'utilisateur qui l'ouvre DISPOSE. Absent =
                 JSON identique à avant (rétro-compat). -->
            <label class="kta-cfg-label">${window.I18n.t("gen.infos.tags")}</label>
            <input class="kta-cfg-input" id="pl_tags" type="text" placeholder="${window.I18n.t("gen.infos.tagsPlaceholder")}" title="${window.I18n.t("gen.infos.tagsHint")}">
          </div>

          <!-- Dimensions auto-détectées : les inputs hidden restent ici (lus
               partout), mais le DISPLAY visuel 📐 a déménagé dans la section
               « Image principale » (v1.76.1, retour KARMA) : en mode assistant,
               il vivait sur la page « Informations » alors que l'upload est
               sur la page « Images » — l'utilisateur ne voyait jamais les
               dimensions ni leurs warnings au moment du chargement. -->
          <input type="hidden" id="pl_width">
          <input type="hidden" id="pl_height">

          <!-- Multi-niveau (depuis v148) : opt-in pour les carrieres multi-etages.
               Si coche, ajoute plan.multiLevel:true dans plan-config.json. -->
          <label class="kta-planner-multilevel-row">
            <input type="checkbox" id="pl_multiLevel">
            <span>
              <strong>${window.I18n.t("gen.mlvl.label")}</strong>
            </span>
          </label>

          <!-- 📉 v1.83.0 (demande KARMA) : profondeur des niveaux, saisie a la
               generation. Le plan-config porte alors une valeur d'ORIGINE qui
               voyage avec le ZIP ; l'utilisateur peut la reprendre par plan
               dans le menu M-LVL (la preference per-plan prime).
               Visible seulement si multi-niveau est coche : sur un plan a un
               seul etage, il n'y a rien a echelonner. -->
          <div class="kta-planner-prof-row" id="pl_prof_row" style="display:none;">
            <label class="kta-cfg-label">${window.I18n.t("gen.prof.niveau0")}</label>
            <input class="kta-cfg-input" id="pl_prof0" type="number" step="0.5" value="-25">
            <label class="kta-cfg-label">${window.I18n.t("gen.prof.pas")}</label>
            <input class="kta-cfg-input" id="pl_profPas" type="number" step="0.5" min="0.5" value="5">
          </div>

          <!-- Tiling V2 (depuis v149) : opt-in conversion en plan tuile.
               Visible UNIQUEMENT en mode "Modifier" (besoin du File source du V1)
               ET seulement si le plan source n'a PAS deja une section tiling
               (pas re-convertir un V2). Decoupe l'image en tuiles 512x512 sur
               4 niveaux de zoom (Google Maps-like). Approche runtime : N
               L.imageOverlay par niveau avec swap on zoomend (Option B).
               Reduction memoire massive vs V1 (qui charge l'image entiere
               en RAM) — utile pour les gros plans > 50 Mo. -->
          <!-- 🧱 Le bloc V2 (pl_v2_convert_wrap) a déménagé dans la section
               « Image principale » (v1.76.1, même logique que le display 📐 :
               l'option concerne l'image, elle vit à côté de l'image). -->

          <!-- 🆕 v1.9.3-B1d.γ : inclure les photos attachées (IDB) dans le ZIP
               plan. Visible uniquement en mode "Modifier" (les photos sont
               attachées aux points du plan actuel via window._currentLoadedPlanId).
               Compteur "N · X Mo" peuplé en async par _majCompteurPhotosPlanner. -->
          <div id="pl_photos_wrap" style="display:none; margin-top:10px;">
            <label class="kta-planner-photos-row" title="${window.I18n.t("gen.photos.rowTitle")}">
              <input type="checkbox" id="pl_photos" checked>
              <span>
                <strong>${window.I18n.t("gen.photos.label")} <span class="kta-ses-count" id="pl_photos_count" style="margin-left:6px;">${window.I18n.t("gen.photos.loading")}</span></strong>
              </span>
            </label>
          </div>
        </div>

        <!-- 2. IMAGES -->
        <div class="kta-aide-section kta-pl-col-left">
          <div class="kta-aide-section-titre">${window.I18n.t("gen.images.titre")}</div>

          <!-- 🆕 v1.9.3-A2 (KARMA "mode vierge dans le générateur, on peut
               générer une image vide de X/Ypx avec une limite") : sélecteur
               mode upload vs vierge. Avec vierge, l'utilisateur choisit
               dimensions + couleur de fond, l'app génère un canvas et
               l'utilise comme baseImage (= File injecté dans pl_baseImage). -->
          <div class="kta-planner-image-mode-grid">
            <label class="kta-planner-image-mode-row">
              <input type="radio" name="pl_image_mode" value="upload" checked>
              <span>📷 <strong>${window.I18n.t("gen.images.modeUpload")}</strong> <span class="kta-planner-hint">${window.I18n.t("gen.images.modeUploadHint")}</span></span>
            </label>
            <label class="kta-planner-image-mode-row">
              <input type="radio" name="pl_image_mode" value="vierge">
              <span>🎨 <strong>${window.I18n.t("gen.images.modeVierge")}</strong></span>
            </label>
          </div>

          <!-- BLOC UPLOAD (existant, visible par défaut) -->
          <div id="pl_image_upload_block">
            <div class="kta-planner-upload-ligne">
              <span class="kta-cfg-label">${window.I18n.t("gen.images.imagePlan")} <span class="kta-planner-req">*</span></span>
              <label class="kta-planner-upload-btn" for="pl_baseImage">${window.I18n.t("gen.btn.choisir")}</label>
              <!-- 🗺️ .tif/.tiff explicites : le type image/* seul ne les
                   propose pas de façon fiable selon l'OS, et un GeoTIFF calé
                   est justement ce qu'on veut voir arriver ici. -->
              <input type="file" id="pl_baseImage" accept="image/*,.tif,.tiff" style="display:none">
              <span class="kta-planner-upload-nom" id="pl_baseImage_nom">${window.I18n.t("gen.upload.aucunFichier")}</span>
            </div>

            <div class="kta-planner-upload-ligne" data-planner-advanced="1">
              <span class="kta-cfg-label">${window.I18n.t("gen.images.collision")} <span class="kta-planner-hint">${window.I18n.t("gen.commun.optionnel")}</span></span>
              <label class="kta-planner-upload-btn" for="pl_collision">${window.I18n.t("gen.btn.choisir")}</label>
              <input type="file" id="pl_collision" accept="image/*" style="display:none">
              <span class="kta-planner-upload-nom" id="pl_collision_nom">${window.I18n.t("gen.upload.aucunFichier")}</span>
            </div>
          </div>

          <!-- 📐 v1.76.1 (retour KARMA) : le display des dimensions vivait
               dans « Informations du plan » — en mode assistant, c'est une
               AUTRE page que l'upload : on chargeait l'image sans jamais voir
               les dimensions ni leurs warnings (>10 000 px, >30 Mo, refus
               32 767). Désormais il vit ici, sous l'upload, hors du bloc
               conditionnel upload/vierge pour rester visible dans les deux
               modes image. -->
          <div class="kta-planner-dim-display" id="pl_dimensions_display">
            <span class="kta-planner-dim-icon">📐</span>
            <span class="kta-planner-dim-text">${window.I18n.t("gen.infos.dimAttente")}</span>
          </div>

          <!-- 🧱 v1.76.1 : le bloc V2 déménage aussi (même logique — l'option
               concerne l'image principale). 🧙 v1.72.1 (KARMA « piège ! ») :
               wrap TOUJOURS visible pour que l'assistant le montre même avant
               le chargement de l'image. -->
          <div id="pl_v2_convert_wrap" style="margin-top:10px;">
            <label class="kta-planner-tiling-v2-row" id="pl_v2_convert_label" title="${window.I18n.t("gen.v2.rowTitle")}">
              <input type="checkbox" id="pl_tilingV2">
              <span>
                <strong>${window.I18n.t("gen.v2.label")}</strong>
                <em>${window.I18n.t("gen.v2.hint")}</em>
              </span>
            </label>
          </div>

          <!-- 🆕 BLOC VIERGE (caché par défaut, généré dynamiquement) -->
          <div id="pl_image_vierge_block" style="display:none;">
            <div class="kta-planner-grille">
              <label class="kta-cfg-label">${window.I18n.t("gen.vierge.largeur")} <span class="kta-planner-req">*</span></label>
              <input class="kta-cfg-input" id="pl_vierge_w" type="number" min="500" max="12000" step="100" value="4000">

              <label class="kta-cfg-label">${window.I18n.t("gen.vierge.hauteur")} <span class="kta-planner-req">*</span></label>
              <input class="kta-cfg-input" id="pl_vierge_h" type="number" min="500" max="12000" step="100" value="4000">
            </div>
            <p class="kta-planner-hint" style="margin:6px 0 10px 0; font-size:11.5px; color:var(--kta-texte-3);">${window.I18n.t("gen.vierge.limites")}</p>

            <div class="kta-cfg-label" style="margin-top:6px;">${window.I18n.t("gen.vierge.couleurFond")}</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:4px;">
              <label class="kta-export-radio-row">
                <input type="radio" name="pl_vierge_color" value="white" checked>
                <span>⬜ ${window.I18n.t("gen.couleur.blanc")}</span>
              </label>
              <label class="kta-export-radio-row">
                <input type="radio" name="pl_vierge_color" value="gray">
                <span>▫️ ${window.I18n.t("gen.couleur.gris")}</span>
              </label>
              <label class="kta-export-radio-row">
                <input type="radio" name="pl_vierge_color" value="black">
                <span>⬛ ${window.I18n.t("gen.couleur.noir")}</span>
              </label>
              <label class="kta-export-radio-row">
                <input type="radio" name="pl_vierge_color" value="sepia">
                <span>📜 ${window.I18n.t("gen.couleur.sepia")}</span>
              </label>
              <!-- 🫥 07/10/2026 (KARMA) : fond transparent — le plan prend le fond de la Vue OSM, ou celui choisi en mode carte. -->
              <label class="kta-export-radio-row" style="grid-column:1 / -1;">
                <input type="radio" name="pl_vierge_color" value="transparent">
                <span>🫥 ${window.I18n.t("gen.couleur.transparent")}</span>
              </label>
            </div>

            <button id="pl_vierge_generate" class="kta-btn kta-btn-primary" type="button"
                    style="margin-top:14px; width:100%; padding:10px;">
              ${window.I18n.t("gen.vierge.genererBtn")}
            </button>
            <div id="pl_vierge_status" style="margin-top:8px; font-size:12px; color:var(--kta-texte-3); min-height:18px;"></div>
          </div>

          <!-- 🎨 07/10/2026 — Fond conseillé (plan.fondConseille) : vu dans l'app sous les parties transparentes du
               plan ; l'utilisateur garde la main (⚙️ Réglages › Affichage). Absent = JSON identique à avant. -->
          <div class="kta-planner-grille" style="margin-top:12px;">
            <label class="kta-cfg-label" for="pl_fond">${window.I18n.t("gen.fond.label")}</label>
            <select class="kta-cfg-input" id="pl_fond">
              <option value="">${window.I18n.t("gen.fond.aucun")}</option>
              <option value="noir">${window.I18n.t("config.fond.noir")}</option>
              <option value="blanc">${window.I18n.t("config.fond.blanc")}</option>
              <option value="gris">${window.I18n.t("config.fond.gris")}</option>
            </select>
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
            ${window.I18n.t("gen.imgLayers.titre")}
            <button class="kta-planner-add-btn" id="pl_addImageLayer">${window.I18n.t("gen.btn.ajouter")}</button>
          </div>
          <div id="pl_imageLayers_list" class="kta-planner-layers-list">
            <p class="kta-planner-empty">${window.I18n.t("gen.imgLayers.vide")}</p>
          </div>
        </div>

        <!-- 4. CALQUES DONNÉES -->
        <div class="kta-aide-section kta-pl-col-left" data-planner-advanced="1">
          <div class="kta-aide-section-titre">
            ${window.I18n.t("gen.dataLayers.titre")}
            <button class="kta-planner-add-btn" id="pl_addDataLayer" type="button">${window.I18n.t("gen.btn.ajouter")}</button>
          </div>

          <!-- 🆕 v1.9.3-B1d.γ.2 (KARMA "pas très clair, il faut cliquer sur importer un zip dans data layer") :
               Encadré dédié et visible pour l'import ZIP datalayer, sorti du titre
               où il était masqué. Bouton large + texte explicite. -->
          <div class="kta-planner-import-zip-box">
            <div class="kta-planner-import-zip-titre">${window.I18n.t("gen.dataLayers.importTitre")}</div>
            <button class="kta-btn kta-btn-primary kta-planner-import-zip-btn" id="pl_importDataZip" type="button">
              ${window.I18n.t("gen.dataLayers.importBtn")}
            </button>
            <!-- Input file caché pour le pl_importDataZip handler -->
            <input type="file" id="pl_importDataZip_file" accept=".zip,application/zip" style="display:none">
            <!-- Feedback de l'import ZIP (succès / erreur) -->
            <div id="pl_importDataZip_status" style="display:none; margin-top:8px; font-size:12px;"></div>
          </div>

          <div id="pl_dataLayers_list" class="kta-planner-layers-list">
            <p class="kta-planner-empty">${window.I18n.t("gen.dataLayers.vide")}</p>
          </div>
        </div>

        <!-- 5. TRACKING -->
        <div class="kta-aide-section kta-pl-col-right" data-planner-advanced="1">
          <div class="kta-aide-section-titre">${window.I18n.t("gen.tracking.titre")}</div>
          <div class="kta-planner-grille">
            <label class="kta-cfg-label">
              ${window.I18n.t("gen.tracking.posX")}
            </label>
            <input class="kta-cfg-input" id="pl_startX" type="number" placeholder="auto = W/2">

            <label class="kta-cfg-label">
              ${window.I18n.t("gen.tracking.posY")}
            </label>
            <input class="kta-cfg-input" id="pl_startY" type="number" placeholder="auto = H/2">

            <label class="kta-cfg-label">${window.I18n.t("gen.tracking.echelle")}</label>
            <input class="kta-cfg-input" id="pl_scale" type="number" step="0.1" value="4.9">

            <!-- 👣 v1.96.0 (KARMA : « ces réglages n'ont rien à faire là ») — taille
                 de pas, seuil et cooldown ne sont PLUS des champs du plan : ils
                 sont ceux de la personne et de son téléphone, réglés une fois
                 dans ⚙️ Réglages pour tous les plans. Le plan-config ne les
                 porte plus ; s'il en porte (anciens plans), l'app les ignore. -->

            <!-- 🧭 v1.37.0 — Calibration Nord du plan. Embed dans
                 plan-config.json > plan.northOffsetDeg UNIQUEMENT si ≠ 0
                 (rétrocompat stricte : plans Nord-haut → champ absent →
                 lecteurs v1.36.x continuent de marcher à l'identique). -->
            <label class="kta-cfg-label">
              ${window.I18n.t("gen.tracking.nord")}
              <span class="kta-planner-hint">${window.I18n.t("gen.tracking.nordHint")}</span>
            </label>
            <input class="kta-cfg-input" id="pl_northOffset" type="number" min="0" max="359" step="1" value="0">
          </div>
          <div class="kta-planner-tracking-actions">
            <button type="button" class="kta-planner-add-btn" id="pl_resetStartCenter" title="${window.I18n.t("gen.tracking.recentrerTitle")}">${window.I18n.t("gen.tracking.recentrerBtn")}</button>
          </div>
        </div>

        <!-- 6. ICÔNES & TAGS -->
        <div class="kta-aide-section kta-pl-col-right" data-planner-advanced="1">
          <div class="kta-aide-section-titre">
            ${window.I18n.t("gen.icons.titre")}
            <div style="display:inline-flex;gap:6px;margin-left:10px;">
              <button class="kta-planner-add-btn" id="pl_chargerDefauts">${window.I18n.t("gen.icons.chargerDefauts")}</button>
              <button class="kta-planner-add-btn" id="pl_addIconRow">${window.I18n.t("gen.icons.ajouterTag")}</button>
            </div>
          </div>

          <div class="kta-planner-icon-header">
            <span style="width:36px;flex-shrink:0;"></span>
            <span style="width:100px;flex-shrink:0;font-weight:600;">${window.I18n.t("gen.icons.colTag")}</span>
            <span style="flex:1;font-weight:600;">${window.I18n.t("gen.icons.colIcone")}</span>
          </div>

          <div id="pl_icons_list" class="kta-planner-layers-list" style="max-height:260px;overflow-y:auto;">
            <p class="kta-planner-empty">${window.I18n.t("gen.icons.videHint")}</p>
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
          <div class="kta-aide-section-titre">${window.I18n.t("gen.legende.titre")}</div>
          <p class="kta-planner-info">${window.I18n.t("gen.legende.info")}</p>
          <div id="pl_legend_status" class="kta-planner-legend-status">${window.I18n.t("gen.legende.aucune")}</div>
          <div class="kta-planner-legend-actions">
            <button type="button" class="kta-btn kta-btn-primary" id="pl_legend_edit">${window.I18n.t("gen.legende.editBtn")}</button>
            <button type="button" class="kta-btn kta-btn-ghost"   id="pl_legend_reset">${window.I18n.t("gen.legende.resetBtn")}</button>
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
          <div class="kta-aide-section-titre">${window.I18n.t("gen.georef.titre")} <span class="kta-planner-hint">${window.I18n.t("gen.commun.optionnel")}</span></div>
          <div class="kta-kmz-section" style="margin:8px 0;">
            <div class="kta-kmz-section-titre">${window.I18n.t("gen.georef.pointA")}</div>
            <div class="kta-kmz-pt-grille">
              <label class="kta-kmz-lbl">${window.I18n.t("gen.georef.planX")}</label>
              <input class="kta-cfg-input kta-kmz-input" id="pl_geo_A_x"   type="number" step="any">
              <label class="kta-kmz-lbl">${window.I18n.t("gen.georef.planY")}</label>
              <input class="kta-cfg-input kta-kmz-input" id="pl_geo_A_y"   type="number" step="any">
              <label class="kta-kmz-lbl">${window.I18n.t("gen.georef.gpsLatLng")}</label>
              <input class="kta-cfg-input kta-kmz-input kta-gps-coords-input" id="pl_geo_A_coords" type="text" inputmode="decimal" autocomplete="off" placeholder="48.8580, 2.2945">
            </div>
            <div class="kta-gps-coords-error" id="pl_geo_A_err" style="display:none;"></div>
          </div>
          <div class="kta-kmz-section" style="margin:8px 0;">
            <div class="kta-kmz-section-titre">${window.I18n.t("gen.georef.pointB")}</div>
            <div class="kta-kmz-pt-grille">
              <label class="kta-kmz-lbl">${window.I18n.t("gen.georef.planX")}</label>
              <input class="kta-cfg-input kta-kmz-input" id="pl_geo_B_x"   type="number" step="any">
              <label class="kta-kmz-lbl">${window.I18n.t("gen.georef.planY")}</label>
              <input class="kta-cfg-input kta-kmz-input" id="pl_geo_B_y"   type="number" step="any">
              <label class="kta-kmz-lbl">${window.I18n.t("gen.georef.gpsLatLng")}</label>
              <input class="kta-cfg-input kta-kmz-input kta-gps-coords-input" id="pl_geo_B_coords" type="text" inputmode="decimal" autocomplete="off" placeholder="48.8520, 2.3050">
            </div>
            <div class="kta-gps-coords-error" id="pl_geo_B_err" style="display:none;"></div>
            <!-- 🧭 v1.76.1 : B estimé depuis A + échelle (#pl_scale) + Nord (#pl_northOffset) -->
            <div class="kta-kmz-pt-actions">
              <button class="kta-btn kta-btn-ghost kta-btn-small" id="pl_geo_B_estimer" type="button" title="${window.I18n.t("config.georef.estimerTitle")}">🧭 ${window.I18n.t("config.georef.estimerBtn")}</button>
            </div>
            <div id="pl_geo_B_estime_badge" class="kta-planner-info" style="display:none; color:var(--kta-accent-texte); margin:4px 0 0;">≈ ${window.I18n.t("config.georef.estimeBadge")}</div>
          </div>
          <!-- 📐 v1.73.0 : Point C OPTIONNEL — affine anti-déformation (assemblages) -->
          <div class="kta-kmz-section" style="margin:8px 0;">
            <div class="kta-kmz-section-titre">${window.I18n.t("gen.georef.pointC")}</div>
            <p class="kta-planner-info" style="margin:2px 0 6px;">${window.I18n.t("gen.georef.pointCHint")}</p>
            <div class="kta-kmz-pt-grille">
              <label class="kta-kmz-lbl">${window.I18n.t("gen.georef.planX")}</label>
              <input class="kta-cfg-input kta-kmz-input" id="pl_geo_C_x"   type="number" step="any">
              <label class="kta-kmz-lbl">${window.I18n.t("gen.georef.planY")}</label>
              <input class="kta-cfg-input kta-kmz-input" id="pl_geo_C_y"   type="number" step="any">
              <label class="kta-kmz-lbl">${window.I18n.t("gen.georef.gpsLatLng")}</label>
              <input class="kta-cfg-input kta-kmz-input kta-gps-coords-input" id="pl_geo_C_coords" type="text" inputmode="decimal" autocomplete="off" placeholder="48.8600, 2.2900">
            </div>
            <div class="kta-gps-coords-error" id="pl_geo_C_err" style="display:none;"></div>
          </div>
          <div id="pl_geo_status" style="font-size:12px; color:var(--kta-texte-3); margin:6px 2px 0; min-height:18px;"></div>
        </div>

        <!-- 📖 v1.37.0 — PDF Histoire (optionnel, avancé). Embed dans le ZIP
             sous data/histoire.pdf + écrit plan-config.json > plan.histoirePdf
             = "data/histoire.pdf". Lu au runtime par js/modeHistoire.js (modale
             Mode Histoire avec iframe PDF). Si absent : modale Histoire propose
             import session via IDB (compat v1.34.20 inchangée). -->
        <div class="kta-aide-section kta-pl-col-right" data-planner-advanced="1">
          <div class="kta-aide-section-titre">${window.I18n.t("gen.histoire.titre")} <span class="kta-planner-hint">${window.I18n.t("gen.commun.optionnel")}</span></div>
          <!-- 📄 v1.71.0 (KARMA « on peut mettre juste un PDF ? ») — MULTI :
               input multiple + liste de fichiers, chacun retirable. Le ZIP
               embarque data/<nom>.pdf par document ; plan-config écrit
               histoirePdfs[] + histoirePdf (1er) pour rétrocompat. -->
          <div class="kta-planner-upload-ligne">
            <span class="kta-cfg-label">${window.I18n.t("gen.histoire.fichier")}</span>
            <label class="kta-planner-upload-btn" for="pl_histoirePdf">${window.I18n.t("gen.btn.choisir")}</label>
            <input type="file" id="pl_histoirePdf" accept="application/pdf" multiple style="display:none">
            <span class="kta-planner-upload-nom" id="pl_histoirePdf_nom">${window.I18n.t("gen.upload.aucunFichier")}</span>
          </div>
          <div id="pl_histoirePdf_liste" class="kta-planner-hist-liste"></div>
        </div>

        <div id="kta-planner-erreur" class="kta-conv-erreur kta-pl-col-full" style="display:none;"></div>

        <div class="kta-conv-actions kta-pl-col-full" style="margin-top:16px;">
          <button class="kta-btn kta-btn-ghost" id="kta-planner-annuler">${window.I18n.t("gen.btn.annuler")}</button>
          <button class="kta-btn kta-btn-primary" id="kta-planner-generer">${window.I18n.t("gen.btn.genererZip")}</button>
        </div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  // Champs GPS combinés « lat, lng ». Helper idempotent (rappelé par _preRemplirFormulaire) ; les retours
  // sont gardés sur la modale (dataset) pour le submit (cf. _readGeo).
  if (typeof window.attacherGpsValidationCombo === "function") {
    window.attacherGpsValidationCombo(
      document.getElementById("pl_geo_A_coords"),
      { errorEl: document.getElementById("pl_geo_A_err") }
    );
    window.attacherGpsValidationCombo(
      document.getElementById("pl_geo_B_coords"),
      { errorEl: document.getElementById("pl_geo_B_err") }
    );
    window.attacherGpsValidationCombo(
      document.getElementById("pl_geo_C_coords"),
      { errorEl: document.getElementById("pl_geo_C_err") }
    );
  }

  // B estimé : A + échelle (#pl_scale) + Nord (#pl_northOffset) + dimensions de l'image. Mêmes règles que
  // ⚙️ Réglages (refus explicites, récap, badge « estimé »). Le champ `estimated` n'est pas écrit dans
  // plan.georef (dette : docs/IDEES.md).
  const _btnEstimerGen = document.getElementById("pl_geo_B_estimer");
  if (_btnEstimerGen) _btnEstimerGen.addEventListener("click", async function() {
    const ax = parseFloat(document.getElementById("pl_geo_A_x").value);
    const ay = parseFloat(document.getElementById("pl_geo_A_y").value);
    const rawCoords = (document.getElementById("pl_geo_A_coords").value || "").trim();
    const coordsA = (typeof window.parseGpsCoords === "function") ? window.parseGpsCoords(rawCoords) : null;
    const scale = parseFloat(document.getElementById("pl_scale").value);
    const w = parseInt(document.getElementById("pl_width").value, 10);
    const h = parseInt(document.getElementById("pl_height").value, 10);
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !coordsA) {
      window.ktaAlerte(window.I18n.t("config.georef.estimerErrA"), { type: "erreur" }); return;
    }
    if (!Number.isFinite(scale) || scale <= 0) {
      window.ktaAlerte(window.I18n.t("config.georef.estimerErrScale"), { type: "erreur" }); return;
    }
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      window.ktaAlerte(window.I18n.t("config.georef.estimerErrDims"), { type: "erreur" }); return;
    }
    const north = parseFloat(document.getElementById("pl_northOffset")?.value) || 0;
    const coin = window.ktaCoinLePlusLoin({ x: ax, y: ay }, w, h);
    const b = coin && window.ktaEstimerPointB({ x: ax, y: ay, lat: coordsA.lat, lng: coordsA.lng }, coin, scale, north);
    if (!b) { window.ktaAlerte(window.I18n.t("config.georef.estimerErrCalc"), { type: "erreur" }); return; }
    const distM = Math.round(Math.hypot(b.x - ax, b.y - ay) / scale);
    if (!(await window.ktaConfirm(window.I18n.t("config.georef.estimerConfirm", { dist: distM, scale: scale, north: north })))) return;
    document.getElementById("pl_geo_B_x").value = b.x;
    document.getElementById("pl_geo_B_y").value = b.y;
    document.getElementById("pl_geo_B_coords").value =
      (typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(b.lat, b.lng) : (b.lat + ", " + b.lng);
    const badge = document.getElementById("pl_geo_B_estime_badge");
    if (badge) badge.style.display = "";
  });
  ["pl_geo_B_x", "pl_geo_B_y", "pl_geo_B_coords"].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", function() {
      const badge = document.getElementById("pl_geo_B_estime_badge");
      if (badge) badge.style.display = "none";
    });
  });

  _imageLayerCount   = 0;
  _dataLayerCount    = 0;
  _iconRowCount      = 0;
  _plannerOrigAssets = {};
  _plannerHistPdfs = [];
  setTimeout(_renderHistPdfListe, 0);
  _plannerPhotosFromZip = [];  // reset buffer photos ZIP
  _plannerMode       = "nouveau";
  _plannerMaj        = null;
  _plannerSourceZip  = null;
  _plannerPlanLegend = null;   // reset état légende plan-level

  // Mode Simple/Avancé mémorisé (« simple » au premier lancement).
  _appliquerPlannerMode(_lirePlannerMode());

  document.querySelectorAll("#kta-planner-mode-switcher .kta-planner-mode-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      _appliquerPlannerMode(btn.dataset.mode);
      _ecrirePlannerMode(btn.dataset.mode);
      // Le jeu de pages dépend du mode : on reconstruit, en restant sur la page courante si elle existe encore.
      if (_wizActif) {
        const courante = _wizPages[_wizIdx] ? _wizPages[_wizIdx].def.id : "accueil";
        _wizConstruirePages(); _wizSkip = {};
        const i = Math.max(0, _wizPages.findIndex(function(p) { return p.def.id === courante; }));
        _wizIdx = i; _wizMaxVisite = i; _wizAfficherPage(i);
      }
    });
  });

  // Assistant : injecté APRÈS tous les binds du formulaire.
  _wizInit();

  // L'assistant peut compter 11 pages : le fond ne ferme pas (geste accidentel à une main) ; ✕ et Annuler
  // demandent confirmation dès qu'un champ a bougé.
  const _valeursInitiales = new Map();
  try {
    modal.querySelectorAll("input, textarea, select").forEach(function(el) {
      _valeursInitiales.set(el, (el.type === "checkbox" || el.type === "radio") ? el.checked : el.value);
    });
  } catch(e) {}
  const _formTouche = function() {
    try {
      return Array.prototype.some.call(modal.querySelectorAll("input, textarea, select"), function(el) {
        if (el.type === "file") return !!(el.files && el.files.length);
        const actuel = (el.type === "checkbox" || el.type === "radio") ? el.checked : el.value;
        if (_valeursInitiales.has(el)) return actuel !== _valeursInitiales.get(el);
        // Champ ajouté après l'ouverture (pages construites à la demande)
        if (el.type === "checkbox" || el.type === "radio") return el.checked !== el.defaultChecked;
        if (el.tagName === "SELECT") return false;
        return !!el.value;
      });
    } catch(e) { return true; }
  };
  const _fermerPlanner = function() {
    if (!_formTouche() || typeof window.ktaConfirm !== "function") { modal.remove(); return; }
    window.ktaConfirm(window.I18n.t("gen.confirm.abandon"), {
      titre:       window.I18n.t("gen.confirm.abandonTitre"),
      okLabel:     window.I18n.t("gen.confirm.abandonOk"),
      cancelLabel: window.I18n.t("gen.confirm.abandonNon")
    }).then(function(ok) { if (ok) modal.remove(); });
  };
  document.getElementById("kta-planner-close").addEventListener("click", _fermerPlanner);
  document.getElementById("kta-planner-annuler").addEventListener("click", _fermerPlanner);
  // Clic sur le fond : inerte.

  // 🏷️ ancre:fin-fermer-planner

  // Bouton « Conf exemple » : télécharge `data/myktamap.zip`, base de travail d'un nouveau plan.
  const btnConfEx = document.getElementById("kta-planner-conf-exemple-btn");
  if (btnConfEx) {
    btnConfEx.addEventListener("click", function() {
      const a = document.createElement("a");
      a.href = "data/myktamap.zip";
      a.download = "myktamap.zip";
      a.click();
    });
  }

  // ── GeoTIFF : déposer un .tif calé, sans ressaisir le géoréf ──────────
  // Un plan calé dans QGIS ressort en GeoTIFF (image + calage) ; aucun navigateur de bureau ne décode le TIFF.
  // ⚠️ CE HANDLER DOIT ÊTRE ENREGISTRÉ EN PREMIER : les écouteurs d'une cible s'exécutent dans l'ordre
  // d'enregistrement. Placé avant `_bindUploadLabel` et l'auto-détection des dimensions, il coupe la
  // propagation (`stopImmediatePropagation`) pour que les handlers standards ne voient JAMAIS le .tif
  // (`_lireImageDimensions` échouerait avec une erreur trompeuse).
  // Le PNG converti est RÉ-INJECTÉ dans le même input et l'événement relancé (comme `_genererImageVierge`) :
  // dimensions, tuilage V2 et ZIP suivent sans rien savoir du TIFF.
  (function _bindGeoTiff() {
    const input = document.getElementById("pl_baseImage");
    if (!input) return;

    input.addEventListener("change", function(ev) {
      const f = ev.target.files && ev.target.files[0];
      if (!f || !window.TiffGeoref || !window.TiffGeoref.estTiff(f)) return;
      ev.stopImmediatePropagation();

      const nomEl = document.getElementById("pl_baseImage_nom");
      const setNom = function(txt) { if (nomEl) nomEl.textContent = txt; };
      setNom(window.I18n.t("gen.tiff.lecture", { nom: f.name }));
      _plannerErreur("");

      window.TiffGeoref.lire(f).then(function(res) {
        // L'image : PNG ré-injecté comme un upload normal.
        const png = new File([res.blob], res.nomPng, { type: "image/png" });
        try {
          const dt = new DataTransfer();
          dt.items.add(png);
          input.files = dt.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } catch(e) {
          console.warn("[Planner GeoTIFF] DataTransfer a échoué :", e);
          _plannerErreur(window.I18n.t("gen.tiff.errInjection", { err: (e.message || e) }));
          return;
        }

        // Le calage : les 6 champs du géoréf.
        const fmt = (typeof window.formatGpsCoords === "function")
                    ? window.formatGpsCoords
                    : function(a, b) { return a + ", " + b; };
        const g = res.georef;
        let taillePlus = "";
        const put = function(id, v) { const el = document.getElementById(id); if (el) el.value = v; };
        put("pl_geo_A_x", g.pointA.x); put("pl_geo_A_y", g.pointA.y);
        put("pl_geo_B_x", g.pointB.x); put("pl_geo_B_y", g.pointB.y);
        put("pl_geo_A_coords", fmt(g.pointA.lat, g.pointA.lng));
        put("pl_geo_B_coords", fmt(g.pointB.lat, g.pointB.lng));

        // L'échelle aussi : elle est dans le fichier. Sans elle, le plan sort au défaut d'usine (4,9 px/m) et
        // `calculerCoherenceEchelleGeoref` signale une incohérence sur un plan parfaitement calé.
        // ⚠️ `scale` est en PIXELS PAR MÈTRE (utils.js > scaleGps = 1 / metresParPixel), d'où l'inverse.
        // En EPSG:4326 l'unité est le degré : `metresParPixel` vaut null et on ne touche PAS au champ.
        if (res.metresParPixel > 0) {
          const pxParM = 1 / res.metresParPixel;
          // 3 décimales : au-delà, bruit de virgule flottante.
          put("pl_scale", Math.round(pxParM * 1000) / 1000);
        }
        // Calage GeoTIFF = nord en haut, sans rotation : 2 points le décrivent exactement. Un point C hérité
        // d'un plan précédent introduirait une déformation : on le vide.
        ["pl_geo_C_x", "pl_geo_C_y", "pl_geo_C_coords"].forEach(function(id) { put(id, ""); });

        // 🩸 Géoréf et échelle vivent dans des blocs `data-planner-advanced="1"`, masqués par le CSS tant que
        // le corps porte `data-planner-mode="simple"` (mode par défaut) : remplis mais invisibles. On bascule
        // donc en Avancé, et on le dit. Bascule ponctuelle : `_appliquerPlannerMode` n'écrit pas la
        // préférence (seul le switcher l'écrit), le prochain plan rouvre en Simple.
        let bascule = "";
        const corpsPl = document.getElementById("kta-planner-corps");
        if (corpsPl && corpsPl.getAttribute("data-planner-mode") === "simple") {
          _appliquerPlannerMode("avance");
          bascule = window.I18n.t("gen.tiff.modeAvance");
        }

        const taille = (res.largeurM && res.hauteurM)
          ? window.I18n.t("gen.tiff.emprise", {
              l: Math.round(res.largeurM), h: Math.round(res.hauteurM) })
          : "";
        if (res.metresParPixel > 0) {
          taillePlus = window.I18n.t("gen.tiff.echelle",
            { px: (Math.round((1 / res.metresParPixel) * 1000) / 1000) });
        }
        setNom(window.I18n.t("gen.tiff.ok", {
          nom: res.nomPng, epsg: res.epsg || "?", emprise: taille + taillePlus }) + bascule);
        console.log("[Planner GeoTIFF]", f.name, res.width + "×" + res.height,
                    "EPSG:" + res.epsg, res.compression, g);
      }).catch(function(err) {
        const cle = (err && err.message) || "tiff.err.inconnue";
        // Les erreurs du module sont des clés i18n ; `detail` porte le fait concret (« JPEG », « EPSG:32631 »)
        // qui dit quoi changer dans QGIS.
        const txt = (window.I18n && /^tiff\.err\./.test(cle))
                    ? window.I18n.t(cle) : String(cle);
        _plannerErreur(window.I18n.t("gen.tiff.refus", {
          nom: f.name, raison: txt + (err && err.detail ? " (" + err.detail + ")" : "") }));
        setNom(window.I18n.t("gen.upload.aucunFichier"));
        try { input.value = ""; } catch(e2) {}
        console.warn("[Planner GeoTIFF] refus :", cle, err && err.detail);
      });
    });
  })();

  _bindUploadLabel("pl_baseImage", "pl_baseImage_nom");
  _bindUploadLabel("pl_collision", "pl_collision_nom");
  // PDF Histoire multiples : liste {name, file|null, fromZip}. file = upload ; fromZip = ré-embarqué depuis
  // _plannerOrigAssets[name] (mode Modifier). Retirer une ligne = ne pas l'embarquer.
  _bindUploadLabel("pl_histoirePdf", "pl_histoirePdf_nom");
  (function _bindHistoirePdfControls() {
    const inp = document.getElementById("pl_histoirePdf");
    if (!inp) return;
    inp.addEventListener("change", function() {
      const fichiers = Array.prototype.slice.call(inp.files || []);
      fichiers.forEach(function(f) {
        if (!/\.pdf$/i.test(f.name || "")) return;
        // Re-choisir un fichier du même nom le remplace.
        _plannerHistPdfs = _plannerHistPdfs.filter(function(e) { return e.name !== f.name; });
        _plannerHistPdfs.push({ name: f.name, file: f, fromZip: false });
      });
      try { inp.value = ""; } catch(e) {}
      _renderHistPdfListe();
    });
  })();

  // Dimensions du plan lues sur l'image principale : champs cachés pl_width/pl_height + affichage
  // (avertissements au-delà de 10 000 px ou 30 Mo).
  document.getElementById("pl_baseImage").addEventListener("change", function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    _lireImageDimensions(file).then(function(dims) {
      // Refus franc au-delà de la limite physique des décodeurs (Chrome/Skia : 32 767 px par côté), sinon
      // échec cryptique plus loin (PC) ou crash mémoire (mobile).
      if (dims.width > MAX_COTE_IMAGE_PX || dims.height > MAX_COTE_IMAGE_PX) {
        _plannerErreur(window.I18n.t("gen.err.imageTropGrande",
          { nom: file.name, w: dims.width, h: dims.height, max: MAX_COTE_IMAGE_PX }));
        try { e.target.value = ""; } catch(err2) {}
        _appliquerDimensions(null, null, file.size);
        return;
      }
      _appliquerDimensions(dims.width, dims.height, file.size);
    }).catch(function(err) {
      console.warn("[Planner] Échec lecture dimensions :", err);
      _appliquerDimensions(null, null, file.size);
    });
    // Le mode Nouveau n'expose la case V2 qu'après l'upload d'une image source.
    _majVisibiliteCheckboxV2();
  });

  // Champs Niveau des calques image : visibles seulement si le plan est multi-niveau.
  const mlCbBind = document.getElementById("pl_multiLevel");
  // Les champs de profondeur suivent la case multi-niveau.
  const _majProfRow = function () {
    const row = document.getElementById("pl_prof_row");
    if (row) row.style.display = (mlCbBind && mlCbBind.checked) ? "" : "none";
  };
  if (mlCbBind) mlCbBind.addEventListener("change", _majProfRow);
  _majProfRow();
  if (mlCbBind) {
    mlCbBind.addEventListener("change", function() {
      const show = mlCbBind.checked;
      document.querySelectorAll("#pl_imageLayers_list .kta-planner-niveau-row").forEach(function(el) {
        el.style.display = show ? "" : "none";
      });
    });
  }

  // V2 : avertissement quand l'utilisateur coche (conversion lourde, PC recommandé), pour qu'il puisse décocher.
  const v2CbBind = document.getElementById("pl_tilingV2");
  if (v2CbBind) {
    v2CbBind.addEventListener("change", function() {
      if (v2CbBind.checked) _afficherAvertissementV2(v2CbBind);
    });
  }

  // Section « Inclure les photos » : mode Modifier seulement (il faut un plan courant en IDB). Compteur
  // rempli en asynchrone.
  _majVisibiliteCheckboxPhotos();
  _majCompteurPhotosPlanner();

  // Mode image (upload / vierge) : cf. _onImageModeChange et _genererImageVierge.
  document.querySelectorAll('input[name="pl_image_mode"]').forEach(function(r) {
    r.addEventListener("change", _onImageModeChange);
  });
  const btnVierge = document.getElementById("pl_vierge_generate");
  if (btnVierge) btnVierge.addEventListener("click", _genererImageVierge);

  document.getElementById("pl_addImageLayer").addEventListener("click", function() { _ajouterImageLayer(); });
  document.getElementById("pl_addDataLayer").addEventListener("click", function() { _ajouterDataLayer(); });

  // Importer un calque de données ZIP (données + photos) exporté par la conversion session→data.
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

  // Recentrer : position de départ du tracker au centre du plan (W/2 × H/2), dans les deux modes.
  document.getElementById("pl_resetStartCenter").addEventListener("click", function() {
    _recentrerPositionInitiale();
  });

  const zipDrop  = document.getElementById("kta-planner-zip-drop");
  const zipInput = document.getElementById("kta-planner-zip-input");

  zipInput.addEventListener("click", function() {
    zipInput.value = "";
  });

  // Une seule zone de dépôt, routée par extension : .zip → _chargerZipModifier, .kmz → _afficherImporterKmz,
  // .gpx → _afficherImporterGpx.
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
        _plannerZipStatus(window.I18n.t("gen.router.kmzIndispo"), true);
      }
    } else if (lower.endsWith(".gpx")) {
      if (typeof _afficherImporterGpx === "function") {
        _afficherImporterGpx(f);
      } else {
        _plannerZipStatus(window.I18n.t("gen.router.gpxIndispo"), true);
      }
    } else if (lower.endsWith(".geojson") || lower.endsWith(".json") || lower.endsWith(".kml")) {
      // Import SIG. ⚠️ `.json` est ambigu (config, session, calque…) : le parser tranche au contenu et refuse
      // proprement si ce n'est pas du GeoJSON (`sig.err.pasDuGeojson`).
      if (typeof _afficherImporterSig === "function") {
        _afficherImporterSig(f);
      } else {
        _plannerZipStatus(window.I18n.t("gen.router.sigIndispo"), true);
      }
    } else if (window.TiffGeoref && window.TiffGeoref.estTiff(f)) {
      // GeoTIFF déposé sur la zone habituelle. Un .tif n'ouvre pas de panneau d'import : c'est une IMAGE DE
      // FOND déjà calée. On l'injecte dans `pl_baseImage` et l'écouteur GeoTIFF fait le reste (un seul chemin).
      // ⚠️ On ne force PAS `_plannerMode` : remplacer le fond d'un plan existant en mode Modifier est légitime.
      try {
        const dt = new DataTransfer();
        dt.items.add(f);
        const base = document.getElementById("pl_baseImage");
        base.files = dt.files;
        base.dispatchEvent(new Event("change", { bubbles: true }));
        _plannerZipStatus(window.I18n.t("gen.router.tiffRoute", { nom: f.name }), false);
      } catch (e) {
        console.warn("[Planner GeoTIFF] dépôt non routable :", e);
        _plannerZipStatus(window.I18n.t("gen.tiff.errInjection", { err: (e.message || e) }), true);
      }
    } else {
      _plannerZipStatus(window.I18n.t("gen.router.badExt"), true);
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

  // Légende du plan : l'éditeur LegendCustomization écrit dans la session ; on échange session ↔
  // _plannerPlanLegend le temps de l'édition (cf. _ouvrirEditeurLegendePlan).
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
      window.ktaConfirm(window.I18n.t("gen.legende.resetConfirm")).then(function(ok) {
        if (!ok) return;
        _plannerPlanLegend = null;
        _plannerLegendStatus();
      });
    });
  }
  _plannerLegendStatus();  // état initial (= "Aucune personnalisation" au boot)

  document.getElementById("kta-planner-generer").addEventListener("click", _genererZip);
}

// ── Mode Simple / Avancé ──────────
// Applique le mode au DOM. En Simple, charge les icônes intégrées si la liste est vide (sinon ZIP sans
// icônes, marqueurs cassés). En mode Modifier : Avancé forcé et switcher masqué (passer en Simple
// écraserait customs, calques et icônes du plan source au _genererZip).
function _appliquerPlannerMode(mode) {
  if (mode !== "simple" && mode !== "avance") mode = "simple";

  if (_plannerMode === "modifier") mode = "avance";

  const corps = document.getElementById("kta-planner-corps");
  if (corps) corps.setAttribute("data-planner-mode", mode);

  document.querySelectorAll("#kta-planner-mode-switcher .kta-planner-mode-btn").forEach(function(btn) {
    btn.classList.toggle("kta-actif", btn.dataset.mode === mode);
  });

  const sw = document.getElementById("kta-planner-mode-switcher");
  if (sw) sw.style.display = (_plannerMode === "modifier") ? "none" : "";

  // En Simple, icônes intégrées chargées si la liste est vide. En Avancé, l'utilisateur gère.
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

// ── Assistant de création (wizard) ──────────
// Couche de présentation pure au-dessus du formulaire : les `.kta-aide-section` deviennent les pages (mêmes
// IDs, même _genererZip, même préremplissage). L'assistant montre/masque, valide à chaque « Suivant » et
// construit le résumé en lisant les champs. « Tout afficher » = une seule page, mémorisé en localStorage.
const WIZ_LS_KEY = "myktamap_planner_wizard_v1";   // "0" = tout afficher
let _wizActif = true;
let _wizSections = [];   // les .kta-aide-section du corps, dans l'ordre DOM
let _wizPages = [];      // pages actives selon le mode
let _wizIdx = 0;
let _wizMaxVisite = 0;
let _wizSkip = {};       // pageId → true (marquage « passé »)

// Métadonnées par section (ordre DOM). `simple` = présente en mode Simple.
// Page d'arrivée hors accueil (image déposée sur « Charger un plan » → « Nom ») : le choix Simple/Avancé
// y est montré aussi, sinon il n'apparaît jamais.
let _wizPageEntree = "accueil";
const WIZ_DEFS = [
  { id: "accueil",  simple: true,  skip: false },
  { id: "identite", simple: true,  skip: false, valider: function() {
      const nom = document.getElementById("pl_name");
      if (!nom || !nom.value.trim()) return window.I18n.t("gen.wiz.errNom");
      return null;
    } },
  { id: "image",    simple: true,  skip: false, valider: function() {
      if (_plannerMode === "modifier") return null;   // image conservée du ZIP
      const vierge = document.querySelector('input[name="pl_image_mode"][value="vierge"]');
      if (vierge && vierge.checked) return null;      // canvas généré
      const f = document.getElementById("pl_baseImage");
      if (f && f.files && f.files.length > 0) return null;
      const w = parseInt(document.getElementById("pl_width")?.value, 10);
      if (Number.isFinite(w) && w > 0) return null;   // image déjà chargée (ZIP)
      return window.I18n.t("gen.wiz.errImage");
    } },
  { id: "imgLayers", simple: false, skip: true },
  { id: "data",      simple: false, skip: true },
  { id: "tracking",  simple: false, skip: true },
  { id: "icones",    simple: false, skip: true },
  { id: "legende",   simple: false, skip: true },
  { id: "georef",    simple: false, skip: true },
  { id: "histoire",  simple: false, skip: true }
];

function _wizEstActifLs() {
  try { return localStorage.getItem(WIZ_LS_KEY) !== "0"; } catch(e) { return true; }
}

function _wizTitreDe(i) {
  const t = _wizSections[i] && _wizSections[i].querySelector(".kta-aide-section-titre");
  if (!t) return "?";
  // 1er nœud texte utile (le titre peut contenir des boutons « Ajouter »).
  for (const n of t.childNodes) {
    if (n.nodeType === 3 && n.textContent.trim()) return n.textContent.trim();
    if (n.nodeType === 1 && !n.classList.contains("kta-planner-add-btn") && n.textContent.trim())
      return n.textContent.trim();
  }
  return t.textContent.trim();
}

// Reconstruit la liste des pages actives (mode simple/avancé).
function _wizConstruirePages() {
  const corps = document.getElementById("kta-planner-corps");
  if (!corps) return;
  _wizSections = Array.prototype.slice.call(corps.querySelectorAll(":scope > .kta-aide-section"))
    .filter(function(sec) { return sec.id !== "kta-wiz-resume"; });
  const mode = corps.getAttribute("data-planner-mode") || "simple";
  const avance = (mode === "avance");
  _wizPages = [];
  WIZ_DEFS.forEach(function(def, i) {
    if (i >= _wizSections.length) return;
    if (!avance && !def.simple) return;
    _wizPages.push({ def: def, section: i });
  });
  _wizPages.push({ def: { id: "resume", simple: true, skip: false }, section: -1 });
}

function _wizAfficherPage(idx) {
  const corps = document.getElementById("kta-planner-corps");
  if (!corps || !_wizActif) return;
  idx = Math.max(0, Math.min(idx, _wizPages.length - 1));
  _wizIdx = idx;
  if (idx > _wizMaxVisite) _wizMaxVisite = idx;
  const page = _wizPages[idx];

  _wizSections.forEach(function(sec, i) {
    sec.style.display = (page.section === i) ? "" : "none";
  });
  const resume = document.getElementById("kta-wiz-resume");
  if (resume) resume.style.display = (page.def.id === "resume") ? "" : "none";
  if (page.def.id === "resume") _wizConstruireResume();

  // Le switcher Simple/Avancé n'a de sens que sur l'accueil
  const sw = document.getElementById("kta-planner-mode-switcher");
  const hint = document.getElementById("kta-planner-mode-hint");
  const surAccueil = (page.def.id === "accueil" || page.def.id === _wizPageEntree);
  if (sw && _plannerMode !== "modifier") sw.style.display = surAccueil ? "" : "none";
  if (hint) hint.style.display = surAccueil ? "" : "none";

  _wizRenderSteps();

  const prev = document.getElementById("kta-wiz-prev");
  const skip = document.getElementById("kta-wiz-skip");
  const next = document.getElementById("kta-wiz-next");
  if (prev) prev.style.display = (idx === 0) ? "none" : "";
  if (skip) skip.style.display = page.def.skip ? "" : "none";
  if (next) {
    next.textContent = (idx === _wizPages.length - 2)
      ? window.I18n.t("gen.wiz.versResume")
      : window.I18n.t("gen.wiz.suivant");
    next.style.display = (page.def.id === "resume") ? "none" : "";
  }
  const btnGen = document.getElementById("kta-planner-generer");
  if (btnGen) btnGen.style.display = (page.def.id === "resume") ? "" : "none";
  const err = document.getElementById("kta-planner-erreur");
  if (err) err.style.display = "none";

  try { corps.scrollTop = 0; } catch(e) {}
}

function _wizRenderSteps() {
  const bar = document.getElementById("kta-wiz-steps");
  if (!bar) return;
  bar.innerHTML = _wizPages.map(function(p, i) {
    const titre = (p.def.id === "resume") ? window.I18n.t("gen.wiz.resume") : _wizTitreDe(p.section);
    let cls = "kta-wiz-step";
    if (i === _wizIdx) cls += " kta-wiz-actuel";
    else if (_wizSkip[p.def.id]) cls += " kta-wiz-passe";
    else if (i <= _wizMaxVisite) cls += " kta-wiz-fait";
    const clicable = (i <= _wizMaxVisite);
    return '<button type="button" class="' + cls + '"' + (clicable ? '' : ' disabled') +
           ' data-wiz-go="' + i + '" title="' + titre.replace(/"/g, "&quot;") + '">' +
           (i + 1) + '</button>';
  }).join('<span class="kta-wiz-lien"></span>');
  bar.querySelectorAll("[data-wiz-go]").forEach(function(b) {
    b.addEventListener("click", function() {
      _wizAfficherPage(parseInt(b.getAttribute("data-wiz-go"), 10));
    });
  });
}

function _wizSuivant() {
  const page = _wizPages[_wizIdx];
  if (page.def.valider) {
    const msg = page.def.valider();
    if (msg) {
      const el = document.getElementById("kta-planner-erreur");
      if (el) { el.textContent = msg; el.style.display = ""; }
      return;
    }
  }
  delete _wizSkip[page.def.id];
  _wizAfficherPage(_wizIdx + 1);
}

function _wizPasser() {
  _wizSkip[_wizPages[_wizIdx].def.id] = true;
  _wizAfficherPage(_wizIdx + 1);
}

// ── Résumé : l'anti-oubli. État lu dans les champs, pas dans la navigation ──────────
function _wizEtatDe(pageId) {
  function nbLignes(id) {
    const l = document.getElementById(id);
    return l ? l.querySelectorAll(":scope > *:not(.kta-planner-empty)").length : 0;
  }
  switch (pageId) {
    case "identite": {
      const nom = document.getElementById("pl_name");
      return (nom && nom.value.trim()) ? "ok" : "manquant";
    }
    case "image": {
      if (_plannerMode === "modifier") return "ok";
      const vierge = document.querySelector('input[name="pl_image_mode"][value="vierge"]');
      if (vierge && vierge.checked) return "ok";
      const f = document.getElementById("pl_baseImage");
      if (f && f.files && f.files.length > 0) return "ok";
      const w = parseInt(document.getElementById("pl_width")?.value, 10);
      return (Number.isFinite(w) && w > 0) ? "ok" : "manquant";
    }
    case "imgLayers": return nbLignes("pl_imageLayers_list") ? "ok" : "vide";
    case "data":      return nbLignes("pl_dataLayers_list") ? "ok" : "vide";
    case "icones":    return nbLignes("pl_icons_list") ? "ok" : "vide";
    case "tracking": {
      const sx = document.getElementById("pl_startX");
      return (sx && sx.value !== "") ? "ok" : "vide";
    }
    case "legende":   return _plannerPlanLegend ? "ok" : "vide";
    case "georef": {
      const a = document.getElementById("pl_geo_A_x");
      const b = document.getElementById("pl_geo_B_x");
      return (a && a.value !== "" && b && b.value !== "") ? "ok" : "vide";
    }
    case "histoire":  return _plannerHistPdfs.length ? "ok" : "vide";
  }
  return "vide";
}

function _wizConstruireResume() {
  const resume = document.getElementById("kta-wiz-resume");
  if (!resume) return;
  const ETATS = {
    ok:       { ico: "✅", cls: "ok",       lbl: window.I18n.t("gen.wiz.etatRempli") },
    vide:     { ico: "➖", cls: "vide",     lbl: window.I18n.t("gen.wiz.etatVide") },
    passe:    { ico: "⏭️", cls: "vide",     lbl: window.I18n.t("gen.wiz.etatPasse") },
    manquant: { ico: "❌", cls: "manquant", lbl: window.I18n.t("gen.wiz.etatManquant") }
  };
  let html = '<div class="kta-aide-section-titre">' + window.I18n.t("gen.wiz.resumeTitre") + '</div>';
  html += '<div class="kta-wiz-resume-liste">';
  _wizPages.forEach(function(p, i) {
    if (p.def.id === "resume" || p.def.id === "accueil") return;
    let etat = _wizEtatDe(p.def.id);
    if (etat === "vide" && _wizSkip[p.def.id]) etat = "passe";
    const E = ETATS[etat];
    html += '<div class="kta-wiz-resume-row kta-wiz-' + E.cls + '">' +
      '<span class="kta-wiz-resume-ico">' + E.ico + '</span>' +
      '<span class="kta-wiz-resume-nom">' + _wizTitreDe(p.section) + '</span>' +
      '<span class="kta-wiz-resume-etat">' + E.lbl + '</span>' +
      '<button type="button" class="kta-planner-add-btn" data-wiz-edit="' + i + '">' +
        window.I18n.t("gen.wiz.modifier") + '</button>' +
    '</div>';
  });
  html += '</div>';
  // Avertissements : informer, jamais brider.
  const avert = [];
  if (_wizEtatDe("georef") !== "ok") avert.push(window.I18n.t("gen.wiz.warnGeoref"));
  if (_wizEtatDe("data") !== "ok" && _plannerMode !== "modifier")
    avert.push(window.I18n.t("gen.wiz.warnData"));
  if (avert.length) {
    html += '<div class="kta-wiz-resume-warns">' + avert.map(function(w) {
      return '<div>⚠️ ' + w + '</div>';
    }).join("") + '</div>';
  }
  resume.innerHTML = html;
  resume.querySelectorAll("[data-wiz-edit]").forEach(function(b) {
    b.addEventListener("click", function() {
      _wizAfficherPage(parseInt(b.getAttribute("data-wiz-edit"), 10));
    });
  });
}

// Assistant ↔ tout afficher : les deux modes coexistent.
function _wizAppliquerAffichage() {
  const corps = document.getElementById("kta-planner-corps");
  if (!corps) return;
  const toggle = document.getElementById("kta-wiz-toggle");
  const steps = document.getElementById("kta-wiz-steps");
  const nav = document.getElementById("kta-wiz-nav");
  const btnGen = document.getElementById("kta-planner-generer");
  const resume = document.getElementById("kta-wiz-resume");
  corps.classList.toggle("kta-wiz-actif", _wizActif);
  if (toggle) toggle.textContent = _wizActif
    ? window.I18n.t("gen.wiz.toggleTout") : window.I18n.t("gen.wiz.toggleWiz");
  if (_wizActif) {
    if (steps) steps.style.display = "";
    if (nav) nav.style.display = "";
    _wizConstruirePages();
    _wizIdx = 0; _wizMaxVisite = 0; _wizSkip = {}; _wizPageEntree = "accueil";
    _wizAfficherPage(0);
  } else {
    if (steps) steps.style.display = "none";
    if (nav) nav.style.display = "none";
    if (resume) resume.style.display = "none";
    if (btnGen) btnGen.style.display = "";
    _wizSections.forEach(function(sec) { sec.style.display = ""; });
    const sw = document.getElementById("kta-planner-mode-switcher");
    const hint = document.getElementById("kta-planner-mode-hint");
    if (sw && _plannerMode !== "modifier") sw.style.display = "";
    if (hint) hint.style.display = "";
  }
}

// Init : injecte barre d'étapes, navigation, résumé et bascule, puis applique.
function _wizInit() {
  const corps = document.getElementById("kta-planner-corps");
  if (!corps) return;
  _wizActif = _wizEstActifLs();

  const hint = document.getElementById("kta-planner-mode-hint");
  const steps = document.createElement("div");
  steps.id = "kta-wiz-steps";
  if (hint && hint.parentNode) hint.parentNode.insertBefore(steps, hint.nextSibling);

  const err = document.getElementById("kta-planner-erreur");
  const resume = document.createElement("div");
  resume.id = "kta-wiz-resume";
  resume.className = "kta-aide-section kta-pl-col-full";
  resume.style.display = "none";
  if (err && err.parentNode) err.parentNode.insertBefore(resume, err);

  const actions = corps.querySelector(".kta-conv-actions");
  const nav = document.createElement("div");
  nav.id = "kta-wiz-nav";
  nav.innerHTML =
    '<button type="button" class="kta-btn kta-btn-ghost" id="kta-wiz-prev">' + window.I18n.t("gen.wiz.precedent") + '</button>' +
    '<button type="button" class="kta-btn kta-btn-ghost" id="kta-wiz-skip">' + window.I18n.t("gen.wiz.passer") + '</button>' +
    '<button type="button" class="kta-btn kta-btn-primary" id="kta-wiz-next">' + window.I18n.t("gen.wiz.suivant") + '</button>';
  if (actions) actions.insertBefore(nav, actions.firstChild);
  document.getElementById("kta-wiz-prev").addEventListener("click", function() { _wizAfficherPage(_wizIdx - 1); });
  document.getElementById("kta-wiz-skip").addEventListener("click", _wizPasser);
  document.getElementById("kta-wiz-next").addEventListener("click", _wizSuivant);

  const sw = document.getElementById("kta-planner-mode-switcher");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "kta-wiz-toggle";
  toggle.className = "kta-btn kta-btn-ghost kta-btn-small";
  toggle.addEventListener("click", function() {
    _wizActif = !_wizActif;
    try { localStorage.setItem(WIZ_LS_KEY, _wizActif ? "1" : "0"); } catch(e) {}
    _wizAppliquerAffichage();
  });
  if (sw && sw.parentNode) sw.parentNode.insertBefore(toggle, sw.nextSibling);

  _wizConstruirePages();
  _wizAppliquerAffichage();
}

// ── Légende du plan ──────────
// Ouvre l'éditeur LegendCustomization sur la légende du plan par échange session ↔ plan : sauver la
// session, charger l'état du plan, ouvrir l'éditeur, capturer à la fermeture, restaurer la session.
// `etat` optionnel { get, set } : sans lui, opère sur `_plannerPlanLegend` ; avec, sur l'état de l'appelant
// (l'écran SIG rouvre CE MÊME éditeur sur ses entrées — pas de second éditeur pour le même geste).
function _ouvrirEditeurLegendePlan(etat) {
  const _lire  = (etat && etat.get) ? etat.get : function () { return _plannerPlanLegend; };
  const _ecrire = (etat && etat.set) ? etat.set : function (v) { _plannerPlanLegend = v; };
  if (!window.LegendCustomization || typeof window.LegendCustomization.ouvrirEditeur !== "function") {
    window.ktaAlerte(window.I18n.t("gen.legende.moduleIndispo"), { type: "erreur" });
    return;
  }
  const LC = window.LegendCustomization;
  let savedSession = null;
  if (typeof LC.getSessionState === "function") {
    try { savedSession = LC.getSessionState(); } catch(e) { savedSession = null; }
  }
  // 🩸 Persistance SUSPENDUE pendant l'échange : sinon chaque mutation de l'éditeur écrit la légende du PLAN
  // dans la session du plan chargé (entrées cust-… fantômes).
  if (typeof LC.suspendPersist === "function") LC.suspendPersist(true);
  if (typeof LC.loadSessionState === "function") {
    try { LC.loadSessionState(_lire() || null); } catch(e) {
      console.warn("[Planner] loadSessionState échec :", e);
    }
  }
  // L'état édité est capturé à la fermeture, puis la vraie session restaurée.
  LC.ouvrirEditeur({
    onChange: function() {
      // Rien ici : capture à la fermeture seulement (sinon re-rendu à chaque retouche).
    },
    onClose: function() {
      let editedState = null;
      if (typeof LC.getSessionState === "function") {
        try { editedState = LC.getSessionState(); } catch(e) {}
      }
      _ecrire(_plannerLegendStateNormalize(editedState));
      if (typeof LC.loadSessionState === "function") {
        try { LC.loadSessionState(savedSession || null); } catch(e) {
          console.warn("[Planner] Restore session échec :", e);
        }
      }
      // Persistance réactivée APRÈS la restauration de la vraie session (ce onClose est la seule sortie).
      if (typeof LC.suspendPersist === "function") LC.suspendPersist(false);
      _plannerLegendStatus();
    }
  });
}

// Absorbe la légende embarquée dans un calque de données importé.
// Règle de conflit : l'existant GAGNE. On n'ajoute que ce qui manque : réimporter est sans effet et un
// calque ne repeint pas en silence la légende de l'auteur. Ce qui est écarté est journalisé.
function _absorberLegendeCalque(legende) {
  if (!legende || typeof legende !== "object") return;
  const cible = _plannerPlanLegend && typeof _plannerPlanLegend === "object"
                  ? _plannerPlanLegend
                  : { labels: {}, hidden: {}, colors: {}, borders: {}, customEntries: [] };
  ["labels", "hidden", "colors", "borders"].forEach(function(champ) {
    if (!cible[champ] || typeof cible[champ] !== "object" || Array.isArray(cible[champ])) cible[champ] = {};
  });
  if (!Array.isArray(cible.customEntries)) cible.customEntries = [];

  let ajoutes = 0, ignores = 0;
  ["labels", "hidden", "colors", "borders"].forEach(function(champ) {
    const src = legende[champ];
    if (!src || typeof src !== "object" || Array.isArray(src)) return;
    Object.keys(src).forEach(function(k) {
      if (Object.prototype.hasOwnProperty.call(cible[champ], k)) { ignores++; return; }
      cible[champ][k] = src[k];
      ajoutes++;
    });
  });

  const idsPresents = new Set(cible.customEntries.map(function(e) { return e && e.id; }));
  (Array.isArray(legende.customEntries) ? legende.customEntries : []).forEach(function(e) {
    if (!e || !e.id) return;
    if (idsPresents.has(e.id)) { ignores++; return; }
    idsPresents.add(e.id);
    cible.customEntries.push(e);
    ajoutes++;
  });

  if (ajoutes > 0 || ignores > 0) {
    console.log("[Planner Import ZIP] légende du calque : " + ajoutes + " élément(s) repris, " +
                ignores + " ignoré(s) (déjà définis dans le plan — l'existant prime).");
  }
  if (ajoutes > 0) {
    _plannerPlanLegend = _plannerLegendStateNormalize(cible);
    // La section « Légende du plan » doit montrer tout de suite qu'elle n'est plus vide.
    if (typeof _plannerLegendStatus === "function") {
      try { _plannerLegendStatus(); } catch(e) {}
    }
  }
}

function _plannerLegendStateNormalize(state) {
  if (!state || typeof state !== "object") return null;
  const labels  = state.labels        || {};
  const hidden  = state.hidden        || {};
  const customs = state.customEntries || [];
  // `colors` compte comme une personnalisation : sinon un plan dont la seule personnalisation est des
  // couleurs serait normalisé à null et n'emporterait rien.
  const colors  = state.colors        || {};
  const hasLabels  = Object.keys(labels).length  > 0;
  const hasHidden  = (Array.isArray(hidden) ? hidden.length : Object.keys(hidden).length) > 0;
  const hasColors  = Object.keys(colors).length  > 0;
  const hasBorders = Object.keys(state.borders || {}).length > 0;
  const hasCustoms = Array.isArray(customs) && customs.length > 0;
  if (!hasLabels && !hasHidden && !hasColors && !hasBorders && !hasCustoms) return null;
  return state;
}

function _plannerLegendStatus() {
  const el = document.getElementById("pl_legend_status");
  if (!el) return;
  if (!_plannerPlanLegend) {
    el.textContent = window.I18n.t("gen.legende.statusAucune");
    el.classList.remove("kta-planner-legend-status-actif");
    return;
  }
  const labels  = Object.keys(_plannerPlanLegend.labels        || {}).length;
  const hiddenC = (Array.isArray(_plannerPlanLegend.hidden)
                    ? _plannerPlanLegend.hidden.length
                    : Object.keys(_plannerPlanLegend.hidden || {}).length);
  const customs = (_plannerPlanLegend.customEntries || []).length;
  const parts = [];
  if (labels  > 0) parts.push(labels  + " " + window.I18n.t(labels  > 1 ? "gen.legende.renommesP" : "gen.legende.renomme"));
  if (hiddenC > 0) parts.push(hiddenC + " " + window.I18n.t(hiddenC > 1 ? "gen.legende.masquesP"  : "gen.legende.masque"));
  if (customs > 0) parts.push(customs + " " + window.I18n.t(customs > 1 ? "gen.legende.customsP"   : "gen.legende.custom"));
  el.textContent = window.I18n.t("gen.legende.statusPerso", { parts: parts.join(" · ") });
  el.classList.add("kta-planner-legend-status-actif");
}
// ── Charger un ZIP pour modification ──────────
async function _chargerZipModifier(file) {
  _plannerZipStatus(window.I18n.t("gen.zipModif.extraction"), false);
  try {
    if (typeof JSZip === "undefined") throw new Error(window.I18n.t("gen.err.jszipManquant"));

    // 🔒 Kill-switch anti-fuite côté générateur aussi : un ZIP révoqué ne peut pas être modifié puis
    // ré-exporté en version dérivée.
    let shaZip = null;
    if (window.PlanDenylist && typeof window.PlanDenylist.isPlanDenied === "function") {
      try {
        const denyCheck = await window.PlanDenylist.isPlanDenied(file);
        shaZip = (denyCheck && denyCheck.sha256) ? String(denyCheck.sha256).toLowerCase() : null;
        if (denyCheck && denyCheck.denied) {
          console.warn("[Planner] ZIP refusé (denylist) :", denyCheck.sha256, "- raison :", denyCheck.reason);
          _plannerZipStatus(window.I18n.t("gen.zipModif.revoque"), true);
          window.PlanDenylist.showDeniedModal(denyCheck, null);
          return;  // STOP : pas d'extraction, formulaire intact
        }
      } catch(eDeny) {
        // Fail-safe : on journalise sans bloquer.
        console.warn("[Planner] Check denylist échec — modification autorisée :", eDeny.message);
      }
    }

    const zip = await JSZip.loadAsync(file);
    let planConfigFile = null;
    _plannerSourceZip = null;
    _plannerOrigAssets = {};
    _plannerPhotosFromZip = [];  // reset buffer photos ZIP au reload (modifier)

    for (const entry of Object.values(zip.files).filter(function(f) { return !f.dir; })) {
      // Tuiles V2 jamais relues : la génération les refait depuis l'image de base. Les extraire toutes en Blob
      // coûterait la taille du plan en mémoire pour rien.
      if (/^data\/tiles\/z-?\d+\//.test(entry.name)) continue;
      const name = entry.name.split("/").pop();
      if (!name) continue;
      const blob = await entry.async("blob");
      const f    = new File([blob], name, { type: _guessMime(name) });
      if (name === "plan-config.json") planConfigFile = f;
      else _plannerOrigAssets[name] = f;
    }

    if (!planConfigFile) throw new Error(window.I18n.t("gen.zipModif.noPlanConfig"));
    const config = JSON.parse(await planConfigFile.text());
    _plannerSourceZip = { sha256: shaZip, taille: file.size, nom: (config.plan && config.plan.name) || "" };
    _preRemplirFormulaire(config);
    _plannerZipStatus(window.I18n.t("gen.zipModif.charge", { name: file.name }), false);
    if (_plannerMaj) _appliquerMaj();
  } catch(err) {
    _plannerZipStatus("❌ " + (err.message || err), true);
  }
}

// ── Mise à jour d'un plan : formulaire prérempli par l'assistant ──────────
// Chaque calque de `_plannerMaj.calques` remplace le fichier de SA ligne (même id) ou devient une ligne nouvelle.
// Le fichier est posé sur la ligne (`item._ktaFichierMaj`), pas dans _plannerOrigAssets : deux calques ne se le
// disputent pas par leur nom de fichier. Un fichier choisi ensuite à la main sur la ligne gagne.
function _appliquerMaj() {
  const maj = _plannerMaj;
  if (!maj || maj.applique) return;
  maj.applique = true;
  const list = document.getElementById("pl_dataLayers_list");
  const lignes = function() { return list ? list.querySelectorAll(".kta-planner-layer-item") : []; };
  let remplaces = 0, nouveaux = 0;
  const refuses = [];
  (maj.calques || []).forEach(function(c) {
    let item = null;
    lignes().forEach(function(it) {
      const inp = document.getElementById(it.dataset.layerId + "_id");
      if (inp && inp.value.trim() === c.id) item = it;
    });
    if (item) remplaces++;
    else {
      const avant = lignes().length;
      _ajouterDataLayer({ id: c.id, label: c.label || c.id, visible: true, file: "data/" + c.id + ".json" });
      if (lignes().length === avant) { refuses.push(c.id); return; }   // 10 calques au plus
      item = lignes()[lignes().length - 1];
      nouveaux++;
    }
    item._ktaFichierMaj = _fichierJsonMaj(c.id + ".json", c.payload);
    item.classList.add("kta-planner-layer-maj");
    const nom = document.getElementById(item.dataset.layerId + "_file_nom");
    if (nom) nom.textContent = window.I18n.t("gen.maj.fichierLigne", { fichier: c.id + ".json" });
  });
  if (maj.legende) _absorberLegendeCalque(maj.legende);
  const cb = document.getElementById("pl_photos");
  if (cb) cb.checked = true;
  _majVisibiliteCheckboxPhotos();
  _majCompteurPhotosPlanner();
  _plannerZipStatus(window.I18n.t("gen.maj.statut", { remplaces: remplaces, nouveaux: nouveaux }), false);
  if (refuses.length) _plannerErreur(window.I18n.t("gen.maj.tropDeCalques", { ids: refuses.join(", ") }));
}

function _fichierJsonMaj(nom, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  try { return new File([blob], nom, { type: "application/json" }); }
  catch (e) { blob.name = nom; return blob; }   // vieux Safari sans constructeur File
}

// Ouvre le Générateur en mode Modifier sur `opts.zip` (le ZIP actuel du plan), puis applique les calques de
// l'assistant. Sans ZIP (plan sans archive sur l'appareil) : le Générateur attend qu'on dépose le ZIP, et
// l'application se fait à ce dépôt. → Promise<bool> (ZIP chargé et formulaire prérempli).
window.ktaGenerateurMaj = async function(opts) {
  const ancien = document.getElementById("kta-planner-modal");
  if (ancien) ancien.remove();
  afficherPlanner();
  _plannerMaj = Object.assign({}, opts || {}, { applique: false });
  if (!opts || !opts.zip) {
    _plannerZipStatus(window.I18n.t("gen.maj.deposerZip"), true);
    return false;
  }
  _plannerMode = "modifier";
  await _chargerZipModifier(opts.zip);
  return !!(_plannerMaj && _plannerMaj.applique);
};

function _plannerZipStatus(msg, isErr) {
  const el = document.getElementById("kta-planner-zip-status");
  if (el) { el.textContent = msg; el.style.color = isErr ? "#ff8080" : "#8cb4ff"; }
}

function _guessMime(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return ({json:"application/json",png:"image/png",jpg:"image/jpeg",
           jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp"})[ext] || "application/octet-stream";
}

// ── Préremplir le formulaire ──────────
function _preRemplirFormulaire(config) {
  const plan = config.plan || {}, t = config.tracking || {};

  function sv(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
  function sn(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

  sv("pl_name",    plan.name        || "");
  sv("pl_version", plan.version     || "");
  sv("pl_author",  plan.author      || "");
  sv("pl_tags",    Array.isArray(plan.tags) ? plan.tags.join(", ") : "");
  sv("pl_fond",    ["noir", "blanc", "gris"].indexOf(plan.fondConseille) >= 0 ? plan.fondConseille : "");
  sv("pl_width",   plan.imageWidth  || "");
  sv("pl_height",  plan.imageHeight || "");
  // Un ZIP rechargé donne ses dimensions au plan vierge (sinon 4000 × 4000 et tout se décale).
  if (plan.imageWidth)  sv("pl_vierge_w", plan.imageWidth);
  if (plan.imageHeight) sv("pl_vierge_h", plan.imageHeight);
  sv("pl_startX",  t.startX        ?? 0);
  sv("pl_startY",  t.startY        ?? 0);
  sv("pl_scale",   t.scale         ?? 4.9);
  // Nord : 0 si le champ est absent.
  sv("pl_northOffset", (plan.northOffsetDeg != null && Number.isFinite(Number(plan.northOffsetDeg))) ? plan.northOffsetDeg : 0);

  // PDF Histoire : plan.histoirePdfs (tableau), repli sur plan.histoirePdf (chaîne, plans anciens). Chaque
  // entrée est ré-embarquée depuis _plannerOrigAssets sauf si retirée.
  _plannerHistPdfs = [];
  const _histSources = Array.isArray(plan.histoirePdfs) && plan.histoirePdfs.length
    ? plan.histoirePdfs
    : (plan.histoirePdf ? [plan.histoirePdf] : []);
  _histSources.forEach(function(chemin) {
    const base = String(chemin).split("/").pop();
    if (base) _plannerHistPdfs.push({ name: base, file: null, fromZip: true });
  });
  _renderHistPdfListe();

  // Multi-niveau : coché si `plan.multiLevel: true` (absent = false).
  const mlEl = document.getElementById("pl_multiLevel");
  if (mlEl) mlEl.checked = (plan.multiLevel === true);
  // Profondeurs d'un plan rouvert : niveau 0 et pas déduits de la table, sinon les défauts écraseraient la saisie.
  const _tblProf = plan.niveauxProfondeur;
  if (_tblProf && typeof _tblProf === "object") {
    const z0 = Number(_tblProf["0"]);
    const zm1 = Number(_tblProf["-1"]);
    if (Number.isFinite(z0)) {
      const e0 = document.getElementById("pl_prof0");
      if (e0) e0.value = z0;
      if (Number.isFinite(zm1)) {
        const ep = document.getElementById("pl_profPas");
        if (ep) ep.value = Math.abs(z0 - zm1);
      }
    }
  }

  // Légende du plan reprise de plan.customLegend (sinon null = défaut). _appliquerPlannerMode synchronise
  // l'UI et masque le switcher.
  _plannerPlanLegend = (plan.customLegend && typeof plan.customLegend === "object")
                        ? _plannerLegendStateNormalize(plan.customLegend)
                        : null;
  if (typeof _plannerLegendStatus === "function") _plannerLegendStatus();
  if (typeof _appliquerPlannerMode === "function") _appliquerPlannerMode("avance");
  // ZIP importé : assistant reconstruit en Avancé, arrivée sur l'Identité (l'utilisateur ne fait que réviser).
  if (_wizActif) {
    _wizConstruirePages();
    _wizIdx = 0; _wizSkip = {};
    _wizMaxVisite = _wizPages.length - 1;   // tout est visitable (prérempli)
    _wizAfficherPage(1);
  }

  // Géoréf : préremplissage si `plan.georef = { pointA, pointB }`. Stockage à plat {x, y, lat, lng},
  // affichage combiné « lat, lng » dans pl_geo_A_coords.
  if (plan.georef && plan.georef.pointA && plan.georef.pointB) {
    const gA = plan.georef.pointA;
    const gB = plan.georef.pointB;
    sv("pl_geo_A_x", gA.x ?? "");
    sv("pl_geo_A_y", gA.y ?? "");
    sv("pl_geo_B_x", gB.x ?? "");
    sv("pl_geo_B_y", gB.y ?? "");
    // formatGpsCoords rend "" si l'une des deux valeurs n'est pas un nombre fini.
    const fmt = (typeof window.formatGpsCoords === "function")
                ? window.formatGpsCoords
                : function(a, b) { return (Number.isFinite(a) && Number.isFinite(b)) ? (a + ", " + b) : ""; };
    sv("pl_geo_A_coords", fmt(gA.lat, gA.lng));
    sv("pl_geo_B_coords", fmt(gB.lat, gB.lng));
    const gC = plan.georef.pointC || null;
    sv("pl_geo_C_x", gC && gC.x != null ? gC.x : "");
    sv("pl_geo_C_y", gC && gC.y != null ? gC.y : "");
    sv("pl_geo_C_coords", gC ? fmt(gC.lat, gC.lng) : "");
  }

  // Validation live des champs GPS combinés (idempotent), rattachée au cas où le DOM a été reconstruit.
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

  // Case V2 : cochée par défaut si la source est déjà V2 (re-tuilage), sinon opt-in.
  const dejaV2 = !!(config.tiling && Number.isInteger(config.tiling.version) && config.tiling.version >= 2);
  const v2CbInit = document.getElementById("pl_tilingV2");
  if (v2CbInit) v2CbInit.checked = dejaV2;
  _majVisibiliteCheckboxV2();

  if (plan.baseImage)      sn("pl_baseImage_nom", "📄 " + plan.baseImage.split("/").pop());
  if (plan.collisionImage) sn("pl_collision_nom",  "📄 " + plan.collisionImage.split("/").pop());

  // Dimensions : en mode Modifier, déjà dans plan-config, pas besoin de redécoder l'image.
  if (plan.imageWidth && plan.imageHeight) {
    let origFile = null;
    if (plan.baseImage) {
      const origName = plan.baseImage.split("/").pop();
      origFile = _plannerOrigAssets[origName] || null;
    }
    _appliquerDimensions(plan.imageWidth, plan.imageHeight, origFile ? origFile.size : null);
  }

  const ilList = document.getElementById("pl_imageLayers_list");
  if (ilList) { ilList.innerHTML = ""; _imageLayerCount = 0; }
  (config.imageLayers || []).forEach(function(l) { _ajouterImageLayer(l); });
  if (ilList && !ilList.querySelector(".kta-planner-layer-item"))
    ilList.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.imgLayers.vide") + '</p>';

  const dlList = document.getElementById("pl_dataLayers_list");
  if (dlList) { dlList.innerHTML = ""; _dataLayerCount = 0; }
  (config.dataLayers || []).filter(function(l) { return l.id !== "editor"; })
    .forEach(function(l) { _ajouterDataLayer(l); });
  if (dlList && !dlList.querySelector(".kta-planner-layer-item"))
    dlList.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.dataLayers.vide") + '</p>';

  const icList = document.getElementById("pl_icons_list");
  if (icList) { icList.innerHTML = ""; _iconRowCount = 0; }
  Object.entries(config.icons || {}).forEach(function(e) {
    _ajouterIconRow(e[0], e[1], null, PLANNER_SYSTEME_TAGS.includes(e[0]));
  });
  // Tags du catalogue venus APRÈS la création du plan (ex. `portail`, `entree_plan`) : proposés avec l'icône de
  // l'app, pour pouvoir les personnaliser. Une icône déjà déclarée par le plan n'est jamais remplacée.
  const _dejaDeclares = config.icons || {};
  Object.entries(PLANNER_DEFAULT_ICONS).forEach(function(e) {
    if (Object.prototype.hasOwnProperty.call(_dejaDeclares, e[0])) return;
    _ajouterIconRow(e[0], e[1], null, PLANNER_SYSTEME_TAGS.includes(e[0]));
  });
  if (icList && !icList.querySelector(".kta-planner-icon-row"))
    icList.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.icons.videDefinie") + '</p>';
}

// ── Bind upload ──────────
function _bindUploadLabel(inputId, nomId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener("change", function() {
    const nom = document.getElementById(nomId);
    if (nom) nom.textContent = input.files[0] ? "✅ " + input.files[0].name : window.I18n.t("gen.upload.aucunFichier");
  });
}

// ── Mode image vierge ──────────
// Radio « Depuis une image » / « Image vierge » : affiche le bloc et remet à zéro l'autre (une image
// uploadée ne doit pas rester active en mode vierge).
function _onImageModeChange() {
  const mode = (document.querySelector('input[name="pl_image_mode"]:checked') || {}).value || "upload";
  const blocUpload = document.getElementById("pl_image_upload_block");
  const blocVierge = document.getElementById("pl_image_vierge_block");
  if (blocUpload) blocUpload.style.display = (mode === "upload") ? "" : "none";
  if (blocVierge) blocVierge.style.display = (mode === "vierge") ? "" : "none";

  if (mode === "upload") {
    const statusEl = document.getElementById("pl_vierge_status");
    if (statusEl) statusEl.textContent = "";
  }
  if (mode === "vierge") {
    const input = document.getElementById("pl_baseImage");
    if (input && input.files && input.files.length > 0) {
      try { input.value = ""; } catch(e) {}
      const nom = document.getElementById("pl_baseImage_nom");
      if (nom) nom.textContent = window.I18n.t("gen.upload.aucunFichier");
    }
  }
}

// Génère un canvas vide (dimensions + fond), le convertit en PNG et l'injecte dans pl_baseImage via
// DataTransfer, puis déclenche « change » : le flux standard (_lireImageDimensions…) suit.
function _genererImageVierge() {
  const statusEl = document.getElementById("pl_vierge_status");
  const setStatus = function(msg, color) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = color || "var(--kta-texte-3)";
    }
  };

  let w = parseInt(document.getElementById("pl_vierge_w").value, 10);
  let h = parseInt(document.getElementById("pl_vierge_h").value, 10);
  if (!Number.isFinite(w) || w < 500)  w = 500;
  if (!Number.isFinite(h) || h < 500)  h = 500;
  if (w > 12000) w = 12000;
  if (h > 12000) h = 12000;
  // Valeur bornée réécrite dans le champ : l'utilisateur voit la limite.
  document.getElementById("pl_vierge_w").value = w;
  document.getElementById("pl_vierge_h").value = h;

  // 🩸 Safari iOS refuse tout canvas de plus de 16 777 216 px (≈ 4096 × 4096) : toBlob rend null sans autre
  // signe. Un ZIP rechargé (import SIG/KML : 8 000 à 12 000 px) y arrive vite : on le dit AVANT d'essayer,
  // avec la voie qui marche (un ordinateur va jusqu'à 12 000 × 12 000).
  const IOS_MAX_PX = 16777216;
  const _ios = /iP(hone|ad|od)/.test(navigator.userAgent) ||
               (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (_ios && w * h > IOS_MAX_PX) {
    setStatus(window.I18n.t("gen.viergeGen.tropGrandIos", { w: w, h: h, mpx: Math.round(w * h / 1e6) }), "#ff8c8c");
    return;
  }

  const colorChoice = (document.querySelector('input[name="pl_vierge_color"]:checked') || {}).value || "white";
  const PALETTE = {
    white: "#ffffff",
    gray:  "#e8e8e8",
    black: "#000000",
    sepia: "#f4e4bc",
    transparent: null      // aucun remplissage — PNG entièrement transparent
  };
  const fillColor = (colorChoice in PALETTE) ? PALETTE[colorChoice] : PALETTE.white;
  // Plan vierge transparent sans fond conseillé : on propose le blanc (lisible en mode carte).
  if (colorChoice === "transparent") {
    const pf = document.getElementById("pl_fond");
    if (pf && !pf.value) pf.value = "blanc";
  }

  setStatus(window.I18n.t("gen.viergeGen.encours", { w: w, h: h }), "#8cb4ff");

  // requestAnimationFrame : ne pas figer l'UI sur un gros canvas (12000×12000 = 144 Mpx).
  requestAnimationFrame(function() {
    try {
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fillRect(0, 0, w, h);
      }

      canvas.toBlob(function(blob) {
        if (!blob) {
          // Au-delà de ~16,7 Mpx : limite de surface du navigateur (téléphone), pas la mémoire.
          setStatus(window.I18n.t(w * h > IOS_MAX_PX ? "gen.viergeGen.tropGrand" : "gen.viergeGen.echecCanvas",
            { w: w, h: h, mpx: Math.round(w * h / 1e6) }), "#ff8c8c");
          return;
        }

        // Nom descriptif, pour s'y retrouver dans le ZIP.
        const fileName = "plan_vierge_" + w + "x" + h + "_" + colorChoice + ".png";
        const file = new File([blob], fileName, { type: "image/png" });

        // DataTransfer : seule façon propre d'assigner `input.files` (en lecture seule).
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          const input = document.getElementById("pl_baseImage");
          input.files = dt.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } catch(e) {
          console.warn("[Planner vierge] DataTransfer failed :", e);
          setStatus(window.I18n.t("gen.viergeGen.erreurInjection", { err: (e.message || e) }), "#ff8c8c");
          return;
        }

        const nomEl = document.getElementById("pl_baseImage_nom");
        if (nomEl) nomEl.textContent = "🎨 " + fileName;
        setStatus(window.I18n.t("gen.viergeGen.ok", { file: fileName, ko: Math.round(blob.size / 1024) }), "#6ce28a");
      }, "image/png");
    } catch(e) {
      console.error("[Planner vierge] erreur :", e);
      setStatus(window.I18n.t("gen.viergeGen.erreur", { err: (e.message || e) }), "#ff8c8c");
    }
  });
}

// ── Gestion des icônes ──────────
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
  // 🩸 LE CHEMIN NE VOYAGE JAMAIS DANS UN LIBELLÉ D'AFFICHAGE. Le `title` du pathSpan vaut, pour une icône
  // SVG intégrée, « Icône SVG intégrée à l'application » : relu comme chemin, il part dans plan-config.json
  // à la place du data-URI et casse `entree_plan` (et le mode Modifier le reposait à l'identique).
  // Le chemin vit dans un attribut de données que rien n'affiche. Une valeur qui n'est pas un chemin (plan
  // déjà corrompu relu en mode Modifier) n'est PAS reprise : la ligne repart du catalogue, ce qui répare
  // le plan à la régénération.
  const _pathPlausible = (typeof window.ktaCheminIconePlausible === "function")
    ? window.ktaCheminIconePlausible(defaultPath)
    : (typeof defaultPath === "string" && /^(data:|blob:)|\.(png|jpe?g|svg|webp|gif|bmp|ico|avif)$/i.test(defaultPath));
  const _pathReel = _pathPlausible ? defaultPath : (PLANNER_DEFAULT_ICONS[tag] || "");
  if (_pathReel) row.dataset.ktaPath = _pathReel;
  if (defaultPath && !_pathPlausible) {
    console.warn("[Generateur] 🎨 icône « " + tag + " » : valeur illisible dans le plan-config (" +
                 JSON.stringify(defaultPath) + ") — la ligne repart du catalogue de l'app.");
  }

  // Icône SVG intégrée (ex. entree_plan) : `defaultPath` = data-URI de plusieurs centaines de caractères qui
  // déborderait et élargirait la modale. On affiche un libellé court ; le <img src> garde la data-URL.
  const _isDataUrl = typeof _pathReel === "string" && _pathReel.indexOf("data:") === 0;
  const _pathLabel = file ? file.name
                    : (_isDataUrl ? window.I18n.t("gen.icons.svgLabel") : (_pathReel || "—"));
  const _pathTitle = _isDataUrl ? window.I18n.t("gen.icons.svgTitle") : (_pathReel || "");

  row.innerHTML = `
    <div class="kta-planner-icon-thumb" id="${id}_thumb">
      <img src="${_pathReel || ''}" alt="${tag}"
        style="width:28px;height:28px;object-fit:contain;display:block;"
        data-kta-echec="0.2">
    </div>
    <input class="kta-cfg-input kta-planner-icon-tag" id="${id}_tag"
      type="text" value="${tag}" placeholder="${window.I18n.t("gen.icons.tagPlaceholder")}"
      style="width:100px;flex-shrink:0;min-width:0;"
      ${sys ? "readonly title='" + window.I18n.t("gen.icons.tagSystemeTitle") + "'" : ""}>
    <label class="kta-planner-upload-btn" for="${id}_file" style="flex-shrink:0;white-space:nowrap;">
      ${file ? "✅ " + file.name : window.I18n.t("gen.icons.iconeBtn")}
    </label>
    <input type="file" id="${id}_file" accept="image/*" style="display:none">
    <span class="kta-planner-icon-path" id="${id}_path"
      title="${_pathTitle}"
      style="font-size:11px;color:var(--kta-texte-3);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:6px;">
      ${_pathLabel}
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
    row.dataset.ktaPath = "icon/" + f.name;   // la source de vérité
    label.textContent = "✅ " + f.name;
    pathSpan.textContent = f.name;
    pathSpan.title = f.name;
    const url = URL.createObjectURL(f);
    // Révocation aussi sur onerror (image corrompue), sinon fuite de Blob URL.
    img.onload  = function() { URL.revokeObjectURL(url); };
    img.onerror = function() { URL.revokeObjectURL(url); };
    img.src = url;
  });

  if (!sys) {
    row.querySelector("[data-remove]").addEventListener("click", function() {
      row.remove();
      if (!list.querySelector(".kta-planner-icon-row"))
        list.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.icons.videApresSuppr") + '</p>';
    });
  }
}

// ── Calque image ──────────
function _ajouterImageLayer(prefill) {
  const list = document.getElementById("pl_imageLayers_list");
  if (!list) return;
  if (list.querySelectorAll(".kta-planner-layer-item").length >= 10) {
    _plannerErreur(window.I18n.t("gen.imgLayers.max")); return;
  }
  const empty = list.querySelector(".kta-planner-empty");
  if (empty) empty.remove();

  _imageLayerCount++;
  const id = "il_" + _imageLayerCount;
  const p  = prefill || {};

  // Niveau optionnel (calques image seulement), 0 par défaut = niveau de référence. Visible seulement si
  // la case pl_multiLevel est cochée (classe .kta-planner-niveau-row).
  const levelVal   = Number.isInteger(p.level) ? p.level : 0;
  const mlIsActive = !!(document.getElementById("pl_multiLevel") &&
                        document.getElementById("pl_multiLevel").checked);
  const niveauStyle = mlIsActive ? "" : "display:none;";

  const item = document.createElement("div");
  item.className = "kta-planner-layer-item";
  item.dataset.layerId = id;
  item.innerHTML = `
    <div class="kta-planner-layer-header">
      <span class="kta-planner-layer-num">${window.I18n.t("gen.imgLayers.num", { n: _imageLayerCount })}</span>
      <button class="kta-planner-remove-btn" data-remove="${id}">✕</button>
    </div>
    <div class="kta-planner-grille">
      <label class="kta-cfg-label">${window.I18n.t("gen.layer.identifiant")} <span class="kta-planner-req">*</span></label>
      <input class="kta-cfg-input" id="${id}_id"      type="text"   value="${p.id    || ''}" placeholder="${window.I18n.t("gen.imgLayers.idPlaceholder")}">
      <label class="kta-cfg-label">${window.I18n.t("gen.layer.label")}</label>
      <input class="kta-cfg-input" id="${id}_label"   type="text"   value="${p.label || ''}" placeholder="${window.I18n.t("gen.imgLayers.labelPlaceholder")}">
      <label class="kta-cfg-label">${window.I18n.t("gen.layer.visible")}</label>
      <select class="kta-cfg-input" id="${id}_visible">
        <option value="true"  ${p.visible !== false ? "selected" : ""}>${window.I18n.t("gen.layer.oui")}</option>
        <option value="false" ${p.visible === false ? "selected" : ""}>${window.I18n.t("gen.layer.non")}</option>
      </select>
      <label class="kta-cfg-label">${window.I18n.t("gen.imgLayers.ordre")}</label>
      <input class="kta-cfg-input" id="${id}_order"   type="number" value="${p.order || _imageLayerCount * 10}">
      <label class="kta-cfg-label kta-planner-niveau-row" style="${niveauStyle}">${window.I18n.t("gen.imgLayers.niveau")}</label>
      <input class="kta-cfg-input kta-planner-niveau-row" id="${id}_level" type="number" value="${levelVal}" style="${niveauStyle}">
    </div>
    <div class="kta-planner-upload-ligne">
      <span class="kta-cfg-label">${window.I18n.t("gen.layer.image")} <span class="kta-planner-req">*</span></span>
      <label class="kta-planner-upload-btn" for="${id}_file">${window.I18n.t("gen.btn.choisir")}</label>
      <input type="file" id="${id}_file" accept="image/*" style="display:none">
      <span class="kta-planner-upload-nom" id="${id}_file_nom">
        ${p.file ? "📄 " + p.file.split("/").pop() : window.I18n.t("gen.upload.aucunFichier")}
      </span>
    </div>
    <!-- 🆕 v1.38.1 — Section calibration 2 ancres (embarquée durablement dans plan-config.json).
         Hint auto-affiché : dims layer vs dims plan → ✅ inutile / ⚠️ utile. Stocké dans item._calibration. -->
    <div class="kta-planner-calib-section" style="margin-top:8px; padding:6px 8px; background:rgba(255,255,255,0.02); border-radius:6px; border:1px dashed rgba(255,255,255,0.1);">
      <div style="font-size:11.5px; color:var(--kta-texte-3); margin-bottom:4px;">
        📐 <strong>${window.I18n.t("gen.calib.titre")}</strong>
      </div>
      <div id="${id}_calib_hint" style="font-size:11px; color:var(--kta-texte-3); margin-bottom:4px; min-height:14px;">${window.I18n.t("gen.calib.hintChoisir")}</div>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <button type="button" class="kta-planner-add-btn" id="${id}_calib_btn" disabled>${window.I18n.t("gen.calib.calibrerBtn")}</button>
        <button type="button" class="kta-planner-add-btn" id="${id}_calib_reset_btn" style="display:none;">${window.I18n.t("gen.calib.resetBtn")}</button>
        <span id="${id}_calib_status" style="font-size:11.5px; color:#7dd87d; flex:1 1 100%;"></span>
      </div>
    </div>
  `;

  list.appendChild(item);
  _bindUploadLabel(id + "_file", id + "_file_nom");
  item.querySelector("[data-remove]").addEventListener("click", function() {
    item.remove();
    if (!list.querySelector(".kta-planner-layer-item"))
      list.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.imgLayers.vide") + '</p>';
  });

  // Calibration portée par l'élément DOM.
  item._calibration = p.calibration || null;

  const hintEl   = item.querySelector("#" + id + "_calib_hint");
  const calibBtn = item.querySelector("#" + id + "_calib_btn");
  const resetBtn = item.querySelector("#" + id + "_calib_reset_btn");
  const statusEl = item.querySelector("#" + id + "_calib_status");

  function _refreshCalibUI() {
    if (item._calibration) {
      statusEl.innerHTML = window.I18n.t("gen.calib.enregistree");
      resetBtn.style.display = "";
    } else {
      statusEl.innerHTML = "";
      resetBtn.style.display = "none";
    }
  }
  _refreshCalibUI();

  // URL et dimensions de l'image du calque : File de l'input (Nouveau) ou de _plannerOrigAssets (Modifier).
  function _getLayerSourceInfo() {
    return new Promise(function(resolve) {
      const fileInput = document.getElementById(id + "_file");
      const file = (fileInput && fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;
      let url = null, fileForDims = null;
      if (file) {
        url = URL.createObjectURL(file);
        fileForDims = file;
      } else {
        const nomTxt = (document.getElementById(id + "_file_nom")?.textContent || "").replace(/^[✅📄]\s/u, "").trim();
        if (nomTxt && _plannerOrigAssets[nomTxt]) {
          fileForDims = _plannerOrigAssets[nomTxt];
          url = URL.createObjectURL(fileForDims);
        }
      }
      if (!url) { resolve(null); return; }
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
      hintEl.innerHTML = '<span style="color:var(--kta-texte-3);">' + window.I18n.t("gen.calib.hintPlanPasCharge") + '</span>';
      calibBtn.disabled = true;
      return;
    }
    _getLayerSourceInfo().then(function(info) {
      if (!info) {
        hintEl.innerHTML = '<span style="color:var(--kta-texte-3);">' + window.I18n.t("gen.calib.hintChoisir") + '</span>';
        calibBtn.disabled = true;
        return;
      }
      const sameDims = Math.abs(info.width - planW) <= 2 && Math.abs(info.height - planH) <= 2;
      if (sameDims) {
        hintEl.innerHTML = '<span style="color:#7dd87d;">' + window.I18n.t("gen.calib.hintMeme", { w: info.width, h: info.height }) + '</span>';
        calibBtn.disabled = false;  // on autorise quand même au cas où
      } else {
        hintEl.innerHTML = '<span style="color:var(--kta-accent-texte);">' + window.I18n.t("gen.calib.hintDiff", { w: info.width, h: info.height, pw: planW, ph: planH }) + '</span>';
        calibBtn.disabled = false;
      }
      // Blob URL libérée : le picker en recrée une.
      try { URL.revokeObjectURL(info.url); } catch(e) {}
    });
  }

  // Revérifie les dimensions au changement de l'image du calque ou du plan principal.
  const fileInputEl = document.getElementById(id + "_file");
  if (fileInputEl) fileInputEl.addEventListener("change", function() { _refreshDimsHint(); });
  const baseImgEl = document.getElementById("pl_baseImage");
  if (baseImgEl) baseImgEl.addEventListener("change", function() { _refreshDimsHint(); });
  // Init immédiat (mode Modifier : le fichier est déjà là).
  setTimeout(_refreshDimsHint, 50);

  calibBtn.addEventListener("click", function() {
    if (!window.ImageLayerCalibrationPicker) {
      window.ktaAlerte(window.I18n.t("gen.calib.pickerIndispo"), { type: "erreur" });
      return;
    }
    const planW = parseInt(document.getElementById("pl_width")?.value || "0", 10);
    const planH = parseInt(document.getElementById("pl_height")?.value || "0", 10);
    if (!planW || !planH) {
      window.ktaAlerte(window.I18n.t("gen.calib.chargeImageDabord"));
      return;
    }
    // URL du plan principal (upload ou assets d'origine), révoquée sur toutes les issues.
    let planUrl = null;
    const baseFile = (baseImgEl && baseImgEl.files && baseImgEl.files[0]) ? baseImgEl.files[0] : null;
    if (baseFile) {
      planUrl = URL.createObjectURL(baseFile);
    } else if (_plannerMode === "modifier") {
      // 1re image de _plannerOrigAssets qui n'est pas la collision.
      const collNomMod = document.getElementById("pl_collision_nom")?.textContent.replace(/^[✅📄]\s/u, "") || "";
      const imgKey = Object.keys(_plannerOrigAssets).find(function(k) {
        return /\.(png|jpg|jpeg|webp|gif)$/i.test(k) && k !== collNomMod;
      });
      if (imgKey) {
        planUrl = URL.createObjectURL(_plannerOrigAssets[imgKey]);
      }
    }
    if (!planUrl) { window.ktaAlerte(window.I18n.t("gen.calib.imagePlanIndispo"), { type: "erreur" }); return; }

    _getLayerSourceInfo().then(function(info) {
      if (!info) { window.ktaAlerte(window.I18n.t("gen.calib.imageCalqueIndispo"), { type: "erreur" }); try { URL.revokeObjectURL(planUrl); } catch(e) {} return; }
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
        window.ktaAlerte(window.I18n.t("gen.calib.pickerErreur", { err: (e && e.message ? e.message : window.I18n.t("gen.commun.erreurInconnue")) }), { type: "erreur" });
      });
    });
  });

  resetBtn.addEventListener("click", function() {
    item._calibration = null;
    _refreshCalibUI();
  });
}

// ── Calque de données ──────────
function _ajouterDataLayer(prefill) {
  const list = document.getElementById("pl_dataLayers_list");
  if (!list) return;
  if (list.querySelectorAll(".kta-planner-layer-item").length >= 10) {
    _plannerErreur(window.I18n.t("gen.dataLayers.max")); return;
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
      <span class="kta-planner-layer-num">${window.I18n.t("gen.dataLayers.num", { n: _dataLayerCount })}</span>
      <button class="kta-planner-remove-btn" data-remove="${id}">✕</button>
    </div>
    <div class="kta-planner-grille">
      <label class="kta-cfg-label">${window.I18n.t("gen.layer.identifiant")} <span class="kta-planner-req">*</span></label>
      <input class="kta-cfg-input" id="${id}_id"    type="text" value="${p.id    || ''}" placeholder="${window.I18n.t("gen.dataLayers.idPlaceholder")}">
      <label class="kta-cfg-label">${window.I18n.t("gen.layer.label")}</label>
      <input class="kta-cfg-input" id="${id}_label" type="text" value="${p.label || ''}" placeholder="${window.I18n.t("gen.dataLayers.labelPlaceholder")}">
      <label class="kta-cfg-label">${window.I18n.t("gen.layer.visible")}</label>
      <select class="kta-cfg-input" id="${id}_visible">
        <option value="true"  ${p.visible !== false ? "selected" : ""}>${window.I18n.t("gen.layer.oui")}</option>
        <option value="false" ${p.visible === false ? "selected" : ""}>${window.I18n.t("gen.layer.non")}</option>
      </select>
    </div>
    <div class="kta-planner-upload-ligne">
      <span class="kta-cfg-label">${window.I18n.t("gen.dataLayers.json")} <span class="kta-planner-hint">${window.I18n.t("gen.commun.optionnel")}</span></span>
      <label class="kta-planner-upload-btn" for="${id}_file">${window.I18n.t("gen.btn.choisir")}</label>
      <input type="file" id="${id}_file" accept=".json" style="display:none">
      <span class="kta-planner-upload-nom" id="${id}_file_nom">
        ${p.file ? "📄 " + p.file.split("/").pop() : window.I18n.t("gen.upload.aucunFichier")}
      </span>
    </div>
  `;
  // Nom du fichier d'origine dans le ZIP : il n'est pas toujours `<id>.json` (cf. _genererZip).
  if (p.file) item.dataset.ktaFichier = String(p.file).split("/").pop();

  list.appendChild(item);
  _bindUploadLabel(id + "_file", id + "_file_nom");
  item.querySelector("[data-remove]").addEventListener("click", function() {
    item.remove();
    if (!list.querySelector(".kta-planner-layer-item"))
      list.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.dataLayers.vide") + '</p>';
  });
}

// ── Import d'un calque de données ZIP ──────────
// Préremplit les calques de données et les photos d'un nouveau plan depuis un ZIP exporté par l'app
// (conversion session→data avec photos). Format attendu (= sortie de _exportConvSession2Data) :
//   points.json {data}, roads.json {roads}, zones.json {zones}, structure.json {structures}
//   OU points.json + roads_<type>.json + zones_<type>.json + structures_<type>.json (fusionnés par catégorie)
//   photos/_index.json + photos/<photoId>.<ext>
// Un calque créé par catégorie présente (max 4) ; photos gardées dans _plannerPhotosFromZip.
function _importerDatalayerZip(zipFile) {
  if (typeof JSZip === "undefined") {
    _afficherStatutImportZip("error", window.I18n.t("gen.importZip.noJSZip"));
    return;
  }
  _afficherStatutImportZip("info", window.I18n.t("gen.importZip.lecture"));

  JSZip.loadAsync(zipFile).then(function(zip) {
    // 1. Fusion des .json de la racine par catégorie.
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
      throw new Error(window.I18n.t("gen.importZip.noJson"));
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
      // Fusion PAR UID (KtaUid.fusionnerCalques, comme la fusion de sessions) : un objet présent dans deux
      // calques n'est pas doublé. La boucle ci-dessous ne sert plus qu'à la légende.
      const _fusionUid = (window.KtaUid && typeof window.KtaUid.fusionnerCalques === "function")
        ? window.KtaUid.fusionnerCalques(parsedArr) : null;
      if (_fusionUid) {
        merged.data = _fusionUid.data; merged.roads = _fusionUid.roads;
        merged.zones = _fusionUid.zones; merged.structures = _fusionUid.structures;
      }
      parsedArr.forEach(function(json) {
        if (!json || typeof json !== "object") return;
        if (_fusionUid) { if (json.customLegend) _absorberLegendeCalque(json.customLegend); return; }
        if (Array.isArray(json.data) && json.data.length > 0) {
          merged.data = merged.data.concat(json.data);
        } else if (Array.isArray(json.editorPoints) && json.editorPoints.length > 0) {
          merged.data = merged.data.concat(json.editorPoints);
        }
        if (Array.isArray(json.roads))      merged.roads      = merged.roads.concat(json.roads);
        if (Array.isArray(json.zones))      merged.zones      = merged.zones.concat(json.zones);
        if (Array.isArray(json.structures)) merged.structures = merged.structures.concat(json.structures);
        // La légende embarquée est lue, sinon les objets custom du calque deviennent des orphelins sans nom
        // ni couleur.
        if (json.customLegend) _absorberLegendeCalque(json.customLegend);
      });

      const total = merged.data.length + merged.roads.length + merged.zones.length + merged.structures.length;
      if (total === 0) {
        throw new Error(window.I18n.t("gen.importZip.vide"));
      }

      // 2. Photos (si photos/_index.json).
      const indexFile = zip.file("photos/_index.json");
      const photosPromise = !indexFile
        ? Promise.resolve([])
        : indexFile.async("string").then(function(idxText) {
            let idxObj;
            try { idxObj = JSON.parse(idxText); }
            catch(e) { throw new Error(window.I18n.t("gen.importZip.indexCorrompu", { err: e.message })); }
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
        // 3. Calques de l'UI. Nouveau : on vide la liste. Modifier : on GARDE les calques du plan source
        // et on ajoute les nouveaux avec un suffixe `_imported_<N>` (pas de collision d'id).
        const isModeNouveau = (_plannerMode === "nouveau");
        if (isModeNouveau) {
          const list = document.getElementById("pl_dataLayers_list");
          if (list) {
            list.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.dataLayers.vide") + '</p>';
            _dataLayerCount = 0;
          }
        }

        function _idsExistants() {
          const set = new Set();
          document.querySelectorAll("#pl_dataLayers_list .kta-planner-layer-item").forEach(function(item) {
            const lid = item.dataset.layerId;
            const inputId = document.getElementById(lid + "_id");
            if (inputId && inputId.value) set.add(inputId.value.trim());
          });
          return set;
        }
        // Suffixe d'unicité, utile en mode Modifier seulement (en Nouveau, la liste vient d'être vidée).
        function _idUnique(baseId, idsTaken) {
          if (isModeNouveau) return baseId;
          if (!idsTaken.has(baseId)) return baseId;
          let n = 1;
          while (idsTaken.has(baseId + "_imported_" + n)) n++;
          return baseId + "_imported_" + n;
        }

        function _makeJsonFile(name, payload) {
          const text = JSON.stringify(payload, null, 2);
          const blob = new Blob([text], { type: "application/json" });
          try {
            return new File([blob], name, { type: "application/json" });
          } catch(e) {
            // Vieux Safari sans constructeur File : Blob avec un .name forgé (_lireFichier n'appelle que
            // .text() / .arrayBuffer()).
            blob.name = name;
            return blob;
          }
        }

        const idsTaken = _idsExistants();
        const layersCrees = [];

        function _creerCalqueImport(baseId, label, payload, fileNameBase) {
          const finalId = _idUnique(baseId, idsTaken);
          idsTaken.add(finalId);
          // Nom du fichier dans le ZIP = `<id>.json` (le nom du fichier est l'id du calque).
          const fileName = finalId + ".json";
          const file = _makeJsonFile(fileName, payload);
          _plannerOrigAssets[fileName] = file;
          const finalLabel = (finalId !== baseId) ? (label + " " + window.I18n.t("gen.importZip.importeSuffix")) : label;
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
            "points", window.I18n.t("gen.importZip.labelPoints"),
            { type: "points", version: 1, data: merged.data },
            "points"
          );
          layersCrees.push(id + " (" + merged.data.length + ")");
        }
        if (merged.roads.length > 0) {
          const id = _creerCalqueImport(
            "roads", window.I18n.t("gen.importZip.labelRoads"),
            { type: "roads", version: 1, data: [], roads: merged.roads },
            "roads"
          );
          layersCrees.push(id + " (" + merged.roads.length + ")");
        }
        if (merged.zones.length > 0) {
          const id = _creerCalqueImport(
            "zones", window.I18n.t("gen.importZip.labelZones"),
            { type: "zones", version: 1, data: [], zones: merged.zones },
            "zones"
          );
          layersCrees.push(id + " (" + merged.zones.length + ")");
        }
        if (merged.structures.length > 0) {
          const id = _creerCalqueImport(
            "structure", window.I18n.t("gen.importZip.labelStructures"),
            { type: "structures", version: 1, data: [], structures: merged.structures },
            "structure"
          );
          layersCrees.push(id + " (" + merged.structures.length + ")");
        }

        _plannerPhotosFromZip = photos;

        const photosTxt = photos.length > 0
          ? " · 📸 " + photos.length + " " + window.I18n.t(photos.length > 1 ? "gen.importZip.photosP" : "gen.importZip.photo")
          : "";
        _afficherStatutImportZip(
          "success",
          window.I18n.t("gen.importZip.succes", { n: layersCrees.length, liste: layersCrees.join(", ") }) + photosTxt
        );
      });
    });
  }).catch(function(err) {
    console.error("[Planner Import ZIP]", err);
    _afficherStatutImportZip("error", "❌ " + (err.message || err));
  });
}

function _afficherStatutImportZip(kind, msg) {
  const el = document.getElementById("pl_importDataZip_status");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  const colors = { success: "#6ce28a", error: "#ff8c8c", info: "#8cb4ff" };
  el.style.color = colors[kind] || "#c8d0e0";
}

// ── Erreur ──────────
function _plannerErreur(msg) {
  const el = document.getElementById("kta-planner-erreur");
  if (!el) return;
  el.textContent = msg || "";
  el.style.display = msg ? "block" : "none";
}

// ── Photos ──────────
// Section « Inclure les photos » visible en mode Modifier seulement (pas de plan courant en mode Nouveau).
function _majVisibiliteCheckboxPhotos() {
  const wrap = document.getElementById("pl_photos_wrap");
  if (!wrap) return;
  wrap.style.display = (_plannerMode === "modifier") ? "" : "none";
}

// Compteur de photos (IDB du plan courant, « N · X Mo ») ; section masquée s'il n'y en a aucune.
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

// ── Tuilage V2 : interface ──────────
function _majVisibiliteCheckboxV2() {
  // Le bloc V2 est toujours visible : dans l'assistant, le masquer jusqu'au chargement de l'image faisait
  // rater l'option. La fonction reste pour ses appelants.
  const wrap = document.getElementById("pl_v2_convert_wrap");
  if (wrap) wrap.style.display = "";
}

// Modale d'erreur plein écran quand la génération V2 échoue (la zone d'erreur inline passe inaperçue),
// avec des conseils actionnables.
function _afficherErreurV2(titre, message) {
  const existing = document.getElementById("kta-v2-error-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "kta-v2-error-overlay";
  overlay.className = "kta-readme-modal-overlay";
  const safeMessage = window.ktaEsc(message || "").replaceAll("\n", "<br>");
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-v2-error-boite">' +
      '<div class="kta-readme-modal-header kta-v2-error-header">' +
        '<span class="kta-readme-modal-titre">❌ ' + (titre || window.I18n.t("gen.v2err.titreDefaut")) + '</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p class="kta-v2-error-message">' + safeMessage + '</p>' +
        '<div class="kta-v2-warn-section kta-v2-warn-section-good">' +
          '<div class="kta-v2-warn-section-titre">' + window.I18n.t("gen.v2err.queFaire") + '</div>' +
          '<ul style="margin:6px 0 0; padding-left:22px; font-size:13px; color:var(--kta-texte-2); line-height:1.6;">' +
            '<li>' + window.I18n.t("gen.v2err.consPC") + '</li>' +
            '<li>' + window.I18n.t("gen.v2err.consReduire") + '</li>' +
            '<li>' + window.I18n.t("gen.v2err.consJpeg") + '</li>' +
            // Limite physique des décodeurs (cf. refus au dépôt).
            '<li>' + window.I18n.t("gen.v2err.consLimite32k") + '</li>' +
          '</ul>' +
        '</div>' +
      '</div>' +
      '<div class="kta-tracker-warn-actions">' +
        '<button class="kta-btn kta-btn-primary" id="kta-v2-error-ok" type="button">' + window.I18n.t("gen.btn.jaiCompris") + '</button>' +
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

// Avertissement à la coche V2 : conversion lourde en CPU et RAM (drawImage en 16K×16K plante souvent
// Safari iOS), PC conseillé. Continuer garde la case, Annuler la décoche.
function _afficherAvertissementV2(checkbox) {
  if (document.getElementById("kta-v2-warn-overlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "kta-v2-warn-overlay";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-v2-warn-boite">' +
      '<div class="kta-readme-modal-header kta-v2-warn-header">' +
        '<span class="kta-readme-modal-titre">' + window.I18n.t("gen.v2warn.titre") + '</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p class="kta-v2-warn-lead">' + window.I18n.t("gen.v2warn.lead") + '</p>' +
        '<div class="kta-v2-warn-section kta-v2-warn-section-bad">' +
          '<div class="kta-v2-warn-section-titre">' + window.I18n.t("gen.v2warn.mobileTitre") + '</div>' +
          '<p>' + window.I18n.t("gen.v2warn.mobileTxt") + '</p>' +
        '</div>' +
        '<div class="kta-v2-warn-section kta-v2-warn-section-good">' +
          '<div class="kta-v2-warn-section-titre">' + window.I18n.t("gen.v2warn.pcTitre") + '</div>' +
          '<p>' + window.I18n.t("gen.v2warn.pcTxt") + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="kta-tracker-warn-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-v2-warn-cancel" type="button">' + window.I18n.t("gen.v2warn.cancelBtn") + '</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-v2-warn-ok"     type="button">' + window.I18n.t("gen.v2warn.okBtn") + '</button>' +
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

// ── Lecture des fichiers ──────────
// Un plan qui sort du Générateur porte un uid sur chaque objet de ses calques (ETUDE_UID décision 5) :
// uid existants gardés, manquants posés. Un fichier qui n'est pas un JSON UTF-8 exploitable part tel quel
// (jamais de calque perdu pour une identité).
// Points ({uid, id}) d'un calque écrit (texte ou buffer).
function _collecterPointsCalque(contenu, acc) {
  try {
    const texte = (typeof contenu === "string") ? contenu : new TextDecoder("utf-8").decode(contenu);
    const d = JSON.parse(texte);
    [d.data, d.editorPoints, d.points].forEach(function(arr) {
      (Array.isArray(arr) ? arr : []).forEach(function(p) {
        if (p && typeof p === "object" && !Array.isArray(p)) acc.push({ uid: p.uid, id: p.id });
      });
    });
  } catch (e) { /* calque non JSON : ses points ne comptent pas */ }
}
// Clé d'une photo dans data/photos/_index.json : l'uid du point si la photo est rangée sous un NOM porté
// par un seul point du plan ; sinon la clé telle quelle. Le chargement lit l'uid puis le nom : un index
// ancien reste valable.
function _clePhotoIndex(cle, points) {
  const c = String(cle || "");
  if (!c || !Array.isArray(points)) return c;
  if (points.some(function(p) { return p.uid === c; })) return c;
  const memes = points.filter(function(p) { return String(p.id || "") === c; });
  return (memes.length === 1 && memes[0].uid) ? String(memes[0].uid) : c;
}

function _marquerUidCalque(buffer) {
  if (!window.KtaUid || !buffer) return buffer;
  try {
    const texte = new TextDecoder("utf-8").decode(buffer);
    const neuf = window.KtaUid.marquerCalqueTexte(texte);
    return neuf === texte ? buffer : neuf;
  } catch (e) {
    console.warn("[Generateur] uid non posés sur un calque :", e);
    return buffer;
  }
}

function _lireFichier(file) {
  return new Promise(function(resolve, reject) {
    const r = new FileReader();
    r.onload  = function(e) { resolve(e.target.result); };
    r.onerror = function()  { reject(new Error("Impossible de lire : " + file.name)); };
    r.readAsArrayBuffer(file);
  });
}

// ── Dimensions du plan (image principale) ──────────
// 🩸 On ne passe PAS par Image + onload : onload exige un décodage complet, et Chrome desktop (Skia) refuse
// tout côté > 32 767 px (onerror sec, dimensions inconnues) ; le mobile passe puis plante au tuilage.
// On lit les dimensions dans les OCTETS DE L'EN-TÊTE (PNG / JPEG / WebP / GIF), sans décodage, pour pouvoir
// refuser l'infaisable avec un message honnête. Repli : décodage Image pour BMP, AVIF…

// Parse binaire des dimensions. Rend {width, height} ou null (format inconnu
// ou en-tête introuvable). Lit au plus 1 Mo (les marqueurs JPEG utiles
// peuvent être après un gros bloc EXIF).
function _lireDimensionsEntete(buf) {
  const b = new DataView(buf);
  const len = b.byteLength;
  if (len < 26) return null;
  // PNG : signature 8 octets puis chunk IHDR (w/h big-endian).
  if (b.getUint32(0) === 0x89504E47) {
    return { width: b.getUint32(16), height: b.getUint32(20) };
  }
  // GIF : "GIF8" puis w/h little-endian.
  if (b.getUint32(0) === 0x47494638) {
    return { width: b.getUint16(6, true), height: b.getUint16(8, true) };
  }
  // WebP : RIFF....WEBP puis chunk VP8 / VP8L / VP8X.
  if (b.getUint32(0) === 0x52494646 && b.getUint32(8) === 0x57454250) {
    const fourcc = b.getUint32(12);
    if (fourcc === 0x56503858) {          // VP8X : w-1 / h-1 sur 24 bits LE
      return { width:  1 + (b.getUint8(24) | (b.getUint8(25) << 8) | (b.getUint8(26) << 16)),
               height: 1 + (b.getUint8(27) | (b.getUint8(28) << 8) | (b.getUint8(29) << 16)) };
    }
    if (fourcc === 0x56503820) {          // "VP8 " lossy : dims 14 bits LE
      return { width: b.getUint16(26, true) & 0x3FFF, height: b.getUint16(28, true) & 0x3FFF };
    }
    if (fourcc === 0x5650384C) {          // VP8L lossless : dims 14 bits packés
      const bits = b.getUint32(21, true);
      return { width: 1 + (bits & 0x3FFF), height: 1 + ((bits >> 14) & 0x3FFF) };
    }
    return null;
  }
  // JPEG : marche des marqueurs jusqu'au SOF (C0-CF sauf C4/C8/CC).
  if (b.getUint16(0) === 0xFFD8) {
    let pos = 2;
    while (pos + 9 < len) {
      if (b.getUint8(pos) !== 0xFF) { pos++; continue; }   // padding toléré
      const marker = b.getUint8(pos + 1);
      if (marker === 0xFF) { pos++; continue; }
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        // SOFn : [len:2][précision:1][height:2][width:2]
        return { width: b.getUint16(pos + 7), height: b.getUint16(pos + 5) };
      }
      if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { pos += 2; continue; }  // sans payload
      pos += 2 + b.getUint16(pos + 2);    // saute le segment (longueur incluse)
    }
    return null;
  }
  return null;
}

// Exposé : recalageScan (Recaler des données sur un autre scan) lit les dimensions par le même parseur, sans décodage.
window.ktaLireDimensionsEntete = _lireDimensionsEntete;

function _lireImageDimensions(file) {
  // 1. En-tête binaire (1 Mo suffit, même avec un gros EXIF).
  return file.slice(0, 1048576).arrayBuffer().then(function(buf) {
    const dims = _lireDimensionsEntete(buf);
    if (dims && dims.width > 0 && dims.height > 0) {
      console.log("[Planner] Dimensions lues dans l'en-tête (sans décodage) :", dims.width + "×" + dims.height);
      return dims;
    }
    // 2. Repli : décodage navigateur (formats non parsés).
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
        reject(new Error(window.I18n.t("gen.err.imageNonDecodable", { nom: file.name })));
      };
      img.src = url;
    });
  });
}

// Limite PHYSIQUE : Chrome desktop (Skia) refuse un côté > 32 767 px ; au-delà rien ne marche (aperçu,
// tuilage), chez l'auteur comme chez le lecteur. Refus franc, pas de redimensionnement (décision produit).
const MAX_COTE_IMAGE_PX = 32767;

// Recentrer : pl_startX/Y au centre du plan ; sans dimensions connues, message dans _plannerErreur.
function _recentrerPositionInitiale() {
  const wEl = document.getElementById("pl_width");
  const hEl = document.getElementById("pl_height");
  const w = wEl ? parseInt(wEl.value, 10) : NaN;
  const h = hEl ? parseInt(hEl.value, 10) : NaN;
  if (!w || !h) {
    _plannerErreur(window.I18n.t("gen.tracking.recentrerErr"));
    setTimeout(function() { _plannerErreur(""); }, 4000);
    return;
  }
  const sxEl = document.getElementById("pl_startX");
  const syEl = document.getElementById("pl_startY");
  if (sxEl) sxEl.value = Math.round(w / 2);
  if (syEl) syEl.value = Math.round(h / 2);
  [sxEl, syEl].forEach(function(el) {
    if (!el) return;
    el.classList.add("kta-planner-flash-ok");
    setTimeout(function() { el.classList.remove("kta-planner-flash-ok"); }, 600);
  });
}

// Seuils d'avertissement : 10 000 px de côté, 30 Mo (encodage canvas en danger sur Safari iOS).
const PLANNER_DIM_WARN_PX  = 10000;
const PLANNER_FILE_WARN_MB = 30;

function _formatMB(bytes) {
  return (bytes / 1048576).toFixed(1);
}

// Met à jour pl_width/pl_height et l'affichage, avec avertissements. width/height null = erreur de lecture.
function _appliquerDimensions(width, height, fileSizeBytes) {
  const wEl = document.getElementById("pl_width");
  const hEl = document.getElementById("pl_height");
  const disp = document.getElementById("pl_dimensions_display");
  if (!disp) return;

  if (wEl) wEl.value = width  || "";
  if (hEl) hEl.value = height || "";

  // Position initiale du tracker recentrée à W/2 × H/2 si aucune valeur non nulle n'est saisie (0/0 compte
  // comme « non définie » ; une valeur d'origine en mode Modifier est respectée).
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
      '<span class="kta-planner-dim-text">' + window.I18n.t("gen.dim.illisible") + '</span>';
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
      '<strong>' + window.I18n.t("gen.dim.autoDetectees") + '</strong> ' +
      '<span class="kta-planner-dim-val">' + width + ' × ' + height + ' px</span>' +
      (sizeMB ? ' · <span class="kta-planner-dim-val">' + sizeMB + ' Mo</span>' : '') +
    '</span>';

  if (hasWarn) {
    html += '<div class="kta-planner-dim-warnings">';
    if (dimWarn) {
      html += '<div class="kta-planner-dim-warn-line">' +
                window.I18n.t("gen.dim.warnGrande", { w: width, h: height, lim: PLANNER_DIM_WARN_PX }) +
              '</div>';
    }
    if (sizeWarn) {
      html += '<div class="kta-planner-dim-warn-line">' +
                window.I18n.t("gen.dim.warnGros", { mo: sizeMB, lim: PLANNER_FILE_WARN_MB }) +
              '</div>';
    }
    html += '</div>';
  }

  disp.innerHTML = html;
}

// Récupérer un fichier : upload prioritaire, puis asset du ZIP d'origine.
// Le libellé « aucun fichier » est traduit (gen.upload.aucunFichier) : on le compare dans la langue active,
// sinon « No file » passe pour un nom de fichier (« introuvable » au lieu de « manquant »).
function _estAucunFichier(txt) {
  if (txt === "Aucun fichier") return true;
  return !!(window.I18n && txt === window.I18n.t("gen.upload.aucunFichier"));
}

function _getFile(inputId, logicalPath) {
  const input = document.getElementById(inputId);
  if (input && input.files && input.files[0]) return input.files[0];
  if (logicalPath) {
    const name = logicalPath.split("/").pop();
    if (_plannerOrigAssets[name]) return _plannerOrigAssets[name];
  }
  return null;
}

// ── Générateur de tuiles V2 ──────────
// Tuiles tileSize×tileSize sur 4 niveaux de zoom (z=0..z=-3). Convention Y NÉGATIF (CRS.Simple) :
// leafletY = -1 est la tuile la plus basse, -k la k-ième en partant du bas.
// ⚠️ Chaque tuile est découpée directement depuis l'HTMLImageElement source (drawImage à 9 arguments), sans
// canvas intermédiaire pleine résolution : au-delà de 16K×16K, Chrome dégrade le canvas en silence.
// Auto-crop optionnel des marges blanches (plans papier scannés) : dims plan-config = dims rognées.

const TILING_V2_TILE_SIZE  = 512;
const TILING_V2_FORMAT     = "jpeg";
const TILING_V2_JPEG_Q     = 0.88;
// Source avec alpha : tuiles AVEC transparence (WebP si encodable, sinon PNG — cf. utils.js >
// ktaProbeAlphaTileFormat). WebP 0.90 (alpha sans perte, RVB avec perte).
const TILING_V2_WEBP_Q     = 0.90;
const TILING_V2_LEVELS     = 4;       // z=0, -1, -2, -3
const TILING_V2_VERSION    = 2;
const TILING_V2_AUTOCROP_RGB_THRESHOLD = 200;  // R,G,B > 200 = "blanc"
const TILING_V2_AUTOCROP_PADDING_PCT   = 0.01; // 1% de marge autour du bbox
const TILING_V2_AUTOCROP_MAX_PCT       = 0.90; // si bbox > 90% du canvas → skip

// Boîte englobante du contenu utile (pixels non blancs), échantillonnée à 1024 px. Rend { x, y, w, h } en
// coordonnées d'origine, ou null si elle couvre plus de 90 % dans les deux dimensions.
function _detectContentBBox(img) {
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
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
    // Canvas « tainted » (rare : l'image vient de l'upload) ou OOM au sous-échantillonnage : on tuile
    // l'image entière, sans crop. Pas fatal.
    console.warn("[Planner] _detectContentBBox : échec lecture pixels (CORS ? OOM ?), skip auto-crop —", e.message);
    canvas.width = 0; canvas.height = 0;
    return null;
  }

  // Fond = pixels où R, G, B > seuil (blanc pur et crème/beige).
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
  canvas.width = 0; canvas.height = 0;

  if (maxX < 0 || maxY < 0) {
    console.log("[Planner] Auto-crop : image entièrement blanche, skip");
    return null;
  }

  const bboxW_sample = maxX - minX + 1;
  const bboxH_sample = maxY - minY + 1;
  if (bboxW_sample / sampleW > TILING_V2_AUTOCROP_MAX_PCT &&
      bboxH_sample / sampleH > TILING_V2_AUTOCROP_MAX_PCT) {
    console.log("[Planner] Auto-crop : bbox couvre > 90% du canvas — pas pertinent, skip");
    return null;
  }

  // Marge de 1 % autour de la boîte.
  const padX_sample = Math.round(sampleW * TILING_V2_AUTOCROP_PADDING_PCT);
  const padY_sample = Math.round(sampleH * TILING_V2_AUTOCROP_PADDING_PCT);
  const bx_sample = Math.max(0, minX - padX_sample);
  const by_sample = Math.max(0, minY - padY_sample);
  const bw_sample = Math.min(sampleW, maxX + padX_sample) - bx_sample + 1;
  const bh_sample = Math.min(sampleH, maxY + padY_sample) - by_sample + 1;

  const bbox = {
    x: Math.round(bx_sample / sampleScale),
    y: Math.round(by_sample / sampleScale),
    w: Math.round(bw_sample / sampleScale),
    h: Math.round(bh_sample / sampleScale)
  };
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

// Génère les tuiles V2 dans le ZIP. Rend { tilesCount, manifest, dims } ; dims = { width, height,
// cropOffset?: {x, y} } décrit la zone effectivement tuilée (après auto-crop).
// `uniformSource` : l'appelant GARANTIT une source d'une seule couleur (fond vierge des imports GPX et SIG,
// cf. GpxImport.genererCanvasVierge). Toute tuile intérieure pleine y est identique à tous les zooms et le
// JPEG est déterministe : on l'encode UNE fois (70 à 90 % des tuiles d'un relevé réel).
// ⚠️ À NE JAMAIS activer pour un vrai scan : aucune tuile identique, le cache produirait un plan gris uni.
async function _genererTuilesV2(imageFile, zip, onProgress, uniformSource) {
  // Octets de la tuile pleine, encodés au plus une fois.
  let _tuileUnieBuf = null;
  const imgUrl = URL.createObjectURL(imageFile);
  // try/finally : le blob URL est TOUJOURS révoqué, même si le tuilage lève (canvas tainted, toBlob null,
  // OOM à l'ajout ZIP).
  let img;
  try {
    img = await new Promise(function(resolve, reject) {
      const i = new Image();
      i.onload  = function() { resolve(i); };
      i.onerror = function() { reject(new Error(window.I18n.t("gen.err.imageSourceNonDecodable"))); };
      i.src = imgUrl;
    });
  } catch(e) {
    URL.revokeObjectURL(imgUrl);
    throw e;
  }

  try {

  // Source transparente → tuiles AVEC alpha (WebP ou PNG selon le navigateur) ; source opaque → JPEG.
  const hasAlpha = (typeof window.ktaDetecterAlpha === "function")
    ? window.ktaDetecterAlpha(img, imageFile && imageFile.type)
    : false;
  const fmt = hasAlpha
    ? await window.ktaProbeAlphaTileFormat()
    : { mime: "image/jpeg", ext: "jpg", name: TILING_V2_FORMAT };
  const fmtQuality = (fmt.mime === "image/webp") ? TILING_V2_WEBP_Q
                   : (fmt.mime === "image/jpeg") ? TILING_V2_JPEG_Q
                   : undefined;   // PNG : sans perte, pas de qualité
  console.log("[Planner] Tiling V2 — source " + (hasAlpha ? "TRANSPARENTE → tuiles " + fmt.name + " (alpha conservé)" : "opaque → tuiles jpeg"));

  // Auto-crop des marges blanches (sinon, si la boîte dépasse 90 %, on prend tout).
  // 🩸 JAMAIS d'auto-crop sur une source TRANSPARENTE : le crop change imageWidth/Height et l'origine, alors
  // que calques, géoréf et calibrations restent en coordonnées d'origine → tout se décale (deux fois en Y
  // via imageHeight - y). Les marges transparentes sont invisibles et ne pèsent rien en WebP/PNG.
  // Pas non plus sur une source UNIE : un aplat n'a pas de marge, l'analyse serait toujours jetée.
  const bbox = (hasAlpha || uniformSource) ? null : _detectContentBBox(img);
  if (hasAlpha) console.log("[Planner] Auto-crop : skip (source transparente — coords préservées)");
  const cropX = bbox ? bbox.x : 0;
  const cropY = bbox ? bbox.y : 0;
  const srcW  = bbox ? bbox.w : img.naturalWidth;
  const srcH  = bbox ? bbox.h : img.naturalHeight;

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

  // Canvas de tuile réutilisé (512×512 = 1 Mpx, sûr sur tout appareil).
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

    // Convention Y NÉGATIF : découpe depuis le BAS de l'image (CRS.Simple).
    for (let k = 1; k <= rows; k++) {
      const leafletY        = -k;
      const sourceBottomLvl = lvlH - (k - 1) * TILING_V2_TILE_SIZE;
      const sourceTopLvl    = Math.max(0, lvlH - k * TILING_V2_TILE_SIZE);
      const sliceHeightLvl  = sourceBottomLvl - sourceTopLvl;
      // destY > 0 quand la tuile haute est partielle (H % tileSize != 0) : collée en BAS, le haut reste noir.
      const destY = TILING_V2_TILE_SIZE - sliceHeightLvl;

      for (let col = 0; col < cols; col++) {
        const sourceLeftLvl  = col * TILING_V2_TILE_SIZE;
        const sourceRightLvl = Math.min(lvlW, (col + 1) * TILING_V2_TILE_SIZE);
        const sliceWidthLvl  = sourceRightLvl - sourceLeftLvl;

        // Coordonnées de l'image ORIGINALE : × scale ET + décalage d'auto-crop, sinon mauvaise découpe.
        const sourceLeftOrig   = cropX + sourceLeftLvl  * scale;
        const sourceTopOrig    = cropY + sourceTopLvl   * scale;
        const sourceWidthOrig  = sliceWidthLvl  * scale;
        const sourceHeightOrig = sliceHeightLvl * scale;

        // Fond noir pour les bordures d'une tuile partielle ; source transparente : clearRect seul.
        try {
          tileCtx.clearRect(0, 0, TILING_V2_TILE_SIZE, TILING_V2_TILE_SIZE);
          if (!hasAlpha) {
            tileCtx.fillStyle = "#000000";
            tileCtx.fillRect(0, 0, TILING_V2_TILE_SIZE, TILING_V2_TILE_SIZE);
          }
          tileCtx.drawImage(
            img,
            sourceLeftOrig, sourceTopOrig, sourceWidthOrig, sourceHeightOrig,
            0,              destY,          sliceWidthLvl,   sliceHeightLvl
          );
        } catch(drawErr) {
          // drawImage peut lever (canvas tainted, OOM mobile) : message clair.
          throw new Error(window.I18n.t("gen.err.tuileDrawImage", {
            z: z, col: col, k: k,
            detail: (drawErr && drawErr.message ? drawErr.message : window.I18n.t("gen.err.detailInconnu"))
          }));
        }

        // Tuile PLEINE d'une source unie : octets déjà encodés réutilisés. Une tuile de bord garde son propre
        // encodage (transparence ou fond).
        const estPleine = (sliceWidthLvl === TILING_V2_TILE_SIZE &&
                           sliceHeightLvl === TILING_V2_TILE_SIZE && destY === 0);
        if (uniformSource && estPleine && _tuileUnieBuf) {
          zFolder.file("x" + col + "_y" + leafletY + "." + fmt.ext, _tuileUnieBuf);
          tilesDone++;
          if (onProgress) onProgress(tilesDone, tilesTotal, z);
          continue;
        }

        // toBlob peut rendre null en silence (OOM, contexte perdu) : la Promise lève dans ce cas.
        let blob;
        try {
          blob = await new Promise(function(resolve, reject) {
            tileCanvas.toBlob(function(b) {
              if (!b) reject(new Error("toBlob a retourné null"));
              else    resolve(b);
            }, fmt.mime, fmtQuality);
          });
        } catch(blobErr) {
          throw new Error(window.I18n.t("gen.err.tuileJpeg", {
            z: z, col: col, k: k,
            detail: (blobErr && blobErr.message ? blobErr.message : window.I18n.t("gen.err.detailInconnu"))
          }));
        }

        try {
          const arrBuf = await blob.arrayBuffer();
          // Première tuile pleine d'une source unie : octets gardés. `slice()` détache du buffer d'origine
          // (JSZip garde la référence ; un buffer transféré casserait les N entrées).
          if (uniformSource && estPleine && !_tuileUnieBuf) _tuileUnieBuf = arrBuf.slice(0);
          zFolder.file("x" + col + "_y" + leafletY + "." + fmt.ext, arrBuf);
        } catch(zipErr) {
          throw new Error(window.I18n.t("gen.err.tuileZip", {
            z: z, col: col, k: k,
            detail: (zipErr && zipErr.message ? zipErr.message : window.I18n.t("gen.err.detailInconnu"))
          }));
        }

        tilesDone++;
        if (onProgress) onProgress(tilesDone, tilesTotal, z);
      }
    }
  }

  tileCanvas.width = 0; tileCanvas.height = 0;

  return {
    tilesCount: tilesDone,
    manifest: {
      version:        TILING_V2_VERSION,
      tileSize:       TILING_V2_TILE_SIZE,
      // Format réel des tuiles ("jpeg" | "webp" | "png"), lu par window.ktaTileExt pour l'extension.
      format:         fmt.name,
      alpha:          hasAlpha,
      minNativeZoom:  -(TILING_V2_LEVELS - 1),
      maxNativeZoom:  0
    },
    dims: { width: srcW, height: srcH, cropOffset: bbox ? { x: cropX, y: cropY } : null }
  };

  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

// ── Génération du ZIP ──────────
async function _genererZip() {
  _plannerErreur("");

  const name    = document.getElementById("pl_name").value.trim();
  const version = document.getElementById("pl_version").value.trim() || "V1";
  const author  = document.getElementById("pl_author").value.trim();
  const tags    = _lireTagsChamp("pl_tags");
  const width   = parseInt(document.getElementById("pl_width").value,  10);
  const height  = parseInt(document.getElementById("pl_height").value, 10);
  // Multi-niveau opt-in : `plan.multiLevel: true` écrit seulement si coché (absent sinon, ignoré par les
  // anciennes versions).
  const multiLevel = !!document.getElementById("pl_multiLevel")?.checked;
  // Tuilage V2 opt-in : mode Modifier (source dans _plannerOrigAssets) ou Nouveau avec image uploadée.
  const tilingV2On = !!document.getElementById("pl_tilingV2")?.checked;

  if (!name)             { _plannerErreur(window.I18n.t("gen.gen.nomObligatoire")); return; }
  if (!width || !height) {
    _plannerErreur(window.I18n.t("gen.gen.dimInconnues"));
    return;
  }
  if (typeof JSZip === "undefined") { _plannerErreur(window.I18n.t("gen.gen.noJSZip")); return; }

  const btnGen = document.getElementById("kta-planner-generer");
  btnGen.disabled = true; btnGen.textContent = window.I18n.t("gen.btn.generation");

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
      // Assets d'origine : première image qui n'est pas la collision.
      const collNom = document.getElementById("pl_collision_nom")?.textContent.replace(/^[✅📄]\s/u, "") || "";
      const imgKey  = Object.keys(_plannerOrigAssets).find(function(k) {
        return /\.(png|jpg|jpeg|webp|gif)$/i.test(k) && k !== collNom;
      });
      if (imgKey) {
        baseImageName = "data/" + imgKey;
        dataFolder.file(imgKey, await _lireFichier(_plannerOrigAssets[imgKey]));
      } else {
        _plannerErreur(window.I18n.t("gen.gen.imageIntrouvable")); throw new Error("abort");
      }
    } else {
      _plannerErreur(window.I18n.t("gen.gen.imageObligatoire")); throw new Error("abort");
    }

    // ── Collision ──
    let collisionName = "";
    const collFile = _getFile("pl_collision", null);
    if (collFile) {
      collisionName = "data/" + collFile.name;
      dataFolder.file(collFile.name, await _lireFichier(collFile));
    } else if (_plannerMode === "modifier") {
      const collNom = document.getElementById("pl_collision_nom")?.textContent.replace(/^[✅📄]\s/u, "") || "";
      if (collNom && !_estAucunFichier(collNom) && _plannerOrigAssets[collNom]) {
        collisionName = "data/" + collNom;
        dataFolder.file(collNom, await _lireFichier(_plannerOrigAssets[collNom]));
      }
    }

    // ── Calques image ──
    const imageLayers = [];
    const _alphaWarnChecks = [];   // calques de niveau à vérifier (alpha)
    for (const item of document.querySelectorAll("#pl_imageLayers_list .kta-planner-layer-item")) {
      const lid     = item.dataset.layerId;
      const ilId    = document.getElementById(lid + "_id").value.trim();
      const ilLabel = document.getElementById(lid + "_label").value.trim() || ilId;
      const ilVis   = document.getElementById(lid + "_visible").value === "true";
      const ilOrder = parseInt(document.getElementById(lid + "_order").value, 10) || 10;
      // Niveau (0 si vide, invalide ou plan non multi-niveau), toujours écrit : on le voit et le modifie
      // à la réédition.
      const ilLevelStr = document.getElementById(lid + "_level")
                          ? document.getElementById(lid + "_level").value : "";
      const ilLevel = (ilLevelStr === "" || isNaN(parseInt(ilLevelStr, 10)))
                       ? 0 : parseInt(ilLevelStr, 10);
      const nomTxt  = (document.getElementById(lid + "_file_nom")?.textContent || "").replace(/^[✅📄]\s/u, "");
      const ilFile  = _getFile(lid + "_file", nomTxt);

      if (!ilId) { _plannerErreur(window.I18n.t("gen.gen.idManquantImg")); throw new Error("abort"); }

      let filePath;
      if (ilFile) {
        filePath = "data/" + ilFile.name;
        dataFolder.file(ilFile.name, await _lireFichier(ilFile));
      } else if (nomTxt && !_estAucunFichier(nomTxt)) {
        filePath = "data/" + nomTxt;
        // 🩸 Le fichier du calque doit être recopié depuis _plannerOrigAssets : sinon plan-config référence
        // "data/legende.png" absent du ZIP (404 silencieux au chargement). Introuvable → erreur claire.
        if (_plannerOrigAssets[nomTxt]) {
          dataFolder.file(nomTxt, await _lireFichier(_plannerOrigAssets[nomTxt]));
        } else {
          _plannerErreur(window.I18n.t("gen.gen.fichierImgIntrouvable", { fichier: nomTxt, id: ilId }));
          throw new Error("abort");
        }
      } else {
        _plannerErreur(window.I18n.t("gen.gen.fichierManquant", { id: ilId })); throw new Error("abort");
      }

      const imageLayerObj = { id: ilId, label: ilLabel, file: filePath, visible: ilVis, order: ilOrder, level: ilLevel };
      // Calibration 2 ancres (item._calibration, saisie au picker) écrite seulement si présente.
      if (item._calibration && item._calibration.sourceA && item._calibration.targetA
          && item._calibration.sourceB && item._calibration.targetB) {
        imageLayerObj.calibration = item._calibration;
      }
      imageLayers.push(imageLayerObj);
      // Candidat au garde-fou transparence (calques de NIVEAU seulement : un calque niveau 0 opaque, type
      // légende, est légitime).
      if (ilLevel !== 0) {
        _alphaWarnChecks.push({ label: ilLabel, file: ilFile || _plannerOrigAssets[nomTxt] || null });
      }
    }

    // Garde-fou TRANSPARENCE : un calque de niveau (≠ 0) sans alpha est un rectangle opaque qui masque tout
    // dessous. Détection par CONTENU (ktaDetecterAlpha : un PNG au fond aplati est vu opaque). Avertissement
    // NON bloquant (toast + statut).
    const calquesOpaques = [];
    for (const c of _alphaWarnChecks) {
      if (!c.file) continue;
      const mime = c.file.type || "";
      if (/^image\/jpe?g/i.test(mime)) { calquesOpaques.push(c.label); continue; }   // JPEG : jamais d'alpha
      if (!/^image\//i.test(mime)) continue;
      try {
        const url = URL.createObjectURL(c.file);
        const img = await new Promise(function(res, rej) {
          const i = new Image();
          i.onload = function() { res(i); };
          i.onerror = rej;
          i.src = url;
        });
        URL.revokeObjectURL(url);
        if (typeof window.ktaDetecterAlpha === "function" && !window.ktaDetecterAlpha(img, mime)) {
          calquesOpaques.push(c.label);
        }
      } catch(e) { /* image illisible → pas de verdict, pas de warning */ }
    }
    if (calquesOpaques.length > 0) {
      const msg = window.I18n.t("gen.warn.layerOpaque", { layers: calquesOpaques.join(", ") });
      if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(msg, "warn");
      setStatus(msg, "#ff9933");
      console.warn("[Planner] Calques de niveau SANS transparence :", calquesOpaques.join(", "));
    }

    // ── Calques de données ──
    const dataLayers = [];
    // Points des calques écrits : l'index des photos désigne chaque point par son uid.
    const _pointsGeneres = [];
    for (const item of document.querySelectorAll("#pl_dataLayers_list .kta-planner-layer-item")) {
      const lid     = item.dataset.layerId;
      const dlId    = document.getElementById(lid + "_id").value.trim();
      const dlLabel = document.getElementById(lid + "_label").value.trim() || dlId;
      const dlVis   = document.getElementById(lid + "_visible").value === "true";
      // Ordre : fichier choisi sur la ligne, fichier de l'assistant de mise à jour, fichier d'origine de la ligne,
      // puis `<id>.json`. 🩸 Sans le fichier d'origine, un calque dont le fichier ne porte pas son id ressortait
      // VIDE du mode Modifier.
      const dlFile  = _getFile(lid + "_file", null) || item._ktaFichierMaj ||
                      (item.dataset.ktaFichier ? _getFile(null, item.dataset.ktaFichier) : null) ||
                      _getFile(null, dlId + ".json");

      if (!dlId) { _plannerErreur(window.I18n.t("gen.gen.idManquantData")); throw new Error("abort"); }

      const fileName = dlId + ".json";
      if (dlFile) {
        const _marque = _marquerUidCalque(await _lireFichier(dlFile));
        dataFolder.file(fileName, _marque);
        _collecterPointsCalque(_marque, _pointsGeneres);
      } else {
        dataFolder.file(fileName, JSON.stringify({ type: dlId, version: 1, data: [] }, null, 2));
      }
      dataLayers.push({ id: dlId, label: dlLabel, file: "data/" + fileName, visible: dlVis });
    }

    dataFolder.file("editor.json", PLANNER_EDITOR_JSON);
    dataLayers.push({ id: "editor", label: window.I18n.t("gen.gen.editorLabel"), file: "data/editor.json", visible: true });

    // Photos dans data/photos/<photoId>.<ext> + data/photos/_index.json. Deux sources FUSIONNÉES :
    //   - mode Modifier + « Inclure les photos » → photos IDB du plan courant ;
    //   - tout mode + calque ZIP importé → _plannerPhotosFromZip.
    // 🩸 Prendre une seule source perdrait les photos IDB du plan source. Dédoublonnage par photoId, l'IDB
    // gagne (potentiellement modifiée depuis le ZIP).
    // Au chargement, main.js > startImportedPlan restaure data/photos/_index.json en IDB.
    // Sans photo d'aucune source : pas de dossier photos/.
    function _ext(mime) {
      if (!mime) return "jpg";
      if (mime.indexOf("png")  >= 0) return "png";
      if (mime.indexOf("webp") >= 0) return "webp";
      if (mime.indexOf("gif")  >= 0) return "gif";
      return "jpg";
    }

    let photosArr = [];
    const seenIds = new Set();

    // 1. Photos IDB du plan courant (mode Modifier).
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

    // 2. Photos du ZIP importé (en plus des IDB en Modifier, seule source en Nouveau).
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
            pointId: _clePhotoIndex(rec.pointId, _pointsGeneres),   // l'uid si le nom est sans ambiguïté
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
        // Non bloquant : le ZIP se génère sans les photos.
      }
    }

    // ── Tracking ──
    const tracking = {
      startX:        parseInt(document.getElementById("pl_startX").value,        10) || 0,
      startY:        parseInt(document.getElementById("pl_startY").value,        10) || 0,
      scale:         parseFloat(document.getElementById("pl_scale").value)           || 4.9
      // Ni stepLength, ni stepThreshold, ni stepCooldown : le plan ne dit pas la foulée (réglage global).
    };

    // ── Icônes ──
    // Chemin lu dans `row.dataset.ktaPath`, pas dans le `title` affiché (cf. _ajouterIconRow). On TIENT LA
    // LISTE de ce qui entre dans le ZIP (`iconsEmbarquees`) : sans elle, l'app sonde le serveur pour chaque
    // icône à chaque ouverture (21 × 404 mesurées).
    const icons = {};
    const iconsEmbarquees = [];
    for (const row of document.querySelectorAll(".kta-planner-icon-row")) {
      const tagEl = row.querySelector("[id$='_tag']");
      if (!tagEl) continue;
      const tag = tagEl.value.trim();
      if (!tag) continue;

      let iconPath;
      if (row._customFile) {
        iconPath = "icon/" + row._customFile.name;
        iconFolder.file(row._customFile.name, await _lireFichier(row._customFile));
        iconsEmbarquees.push(iconPath);
      } else {
        const p = row.dataset.ktaPath || "";
        if (p && p !== "—") {
          iconPath = p;
          // Asset du ZIP d'origine (mode Modifier) effectivement recopié : il est EMBARQUÉ, on le déclare.
          const nom = p.split("/").pop();
          if (_plannerOrigAssets[nom]) {
            iconFolder.file(nom, await _lireFichier(_plannerOrigAssets[nom]));
            if (p.indexOf("icon/") === 0) iconsEmbarquees.push(p);
          }
        } else {
          iconPath = PLANNER_DEFAULT_ICONS[tag] || ("icon/" + tag + ".png");
        }
      }
      icons[tag] = iconPath;
    }

    if (!icons.default) icons.default = PLANNER_DEFAULT_ICONS.default;
    if (!icons.track)   icons.track   = PLANNER_DEFAULT_ICONS.track;

    // ── Tuilage V2 ──
    // Généré AVANT l'écriture de plan-config.json : après auto-crop, imageWidth/Height doivent décrire la
    // zone effectivement tuilée.
    let tilingManifest = null;
    let v2Dims = null;
    if (tilingV2On) {
      // File source : input pl_baseImage (Nouveau) ou _plannerOrigAssets (Modifier).
      const imageFile = _getFile("pl_baseImage", baseImageName);
      if (!imageFile) {
        _afficherErreurV2(window.I18n.t("gen.gen.v2ImageIntrouvableTitre"),
          window.I18n.t("gen.gen.v2ImageIntrouvableMsg"));
        throw new Error("abort");
      }

      // Drapeau de crash mémoire : si le navigateur tue la page (OOM Safari iOS) pendant drawImage/toBlob,
      // rien ne lève. Posé AVANT, retiré APRÈS : au rechargement, un drapeau resté signale une génération
      // interrompue (modale au démarrage, cf. hook OOMGuard + _detecterCrashV2GenerationAuBoot).
      try {
        localStorage.setItem("myktamap_v2_gen_in_progress", JSON.stringify({
          planName: name,
          imageSize: imageFile.size,
          startedAt: Date.now()
        }));
      } catch(e) { /* localStorage saturé : pas bloquant */ }

      const overlay = document.createElement("div");
      overlay.className = "kta-modal-overlay";
      overlay.innerHTML =
        '<div class="kta-modal">' +
          '<div class="kta-modal-icon">🧱</div>' +
          '<div class="kta-modal-titre">' + window.I18n.t("gen.v2prog.titre") + '</div>' +
          '<div class="kta-modal-texte">' +
            '<div id="kta-tiling-progress-text" style="margin-bottom:10px;">' + window.I18n.t("gen.v2prog.init") + '</div>' +
            '<div style="background:rgba(255,255,255,0.06); border-radius:6px; height:8px; overflow:hidden;">' +
              '<div id="kta-tiling-progress-bar" style="height:100%; width:0%; background:#b452ff; transition:width 0.2s;"></div>' +
            '</div>' +
            '<p style="font-size:11.5px; color:var(--kta-texte-3); margin:14px 0 0; line-height:1.5;">' +
              window.I18n.t("gen.v2prog.warn") +
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
          if (txt) txt.textContent = window.I18n.t("gen.v2prog.niveau", { z: currentZ, done: done, total: total, pct: pct });
          if (bar) bar.style.width = pct + "%";
        });
      } catch(err) {
        v2Error = err;
      } finally {
        overlay.remove();
        // Drapeau retiré (succès ou échec attrapé). Un kill OOM ne passe jamais ici : le drapeau reste.
        try { localStorage.removeItem("myktamap_v2_gen_in_progress"); } catch(e) {}
      }

      if (v2Error) {
        const isOOM = /m[ée]moire|drawImage|toBlob|saturation/i.test(v2Error.message || "");
        _afficherErreurV2(
          isOOM ? window.I18n.t("gen.gen.v2EchecOOM") : window.I18n.t("gen.gen.v2Echec"),
          (v2Error.message || window.I18n.t("gen.gen.v2ErreurInconnue")) +
          (isOOM ? window.I18n.t("gen.gen.v2OOMSuffix") : "")
        );
        throw new Error("abort");
      }

      tilingManifest = v2Result.manifest;
      v2Dims = v2Result.dims;
      console.log("[Planner] Tiling V2 généré : " + v2Result.tilesCount + " tuiles" +
                  (v2Dims.cropOffset ? " | auto-crop offset (" + v2Dims.cropOffset.x + "," + v2Dims.cropOffset.y + ")" : ""));
    }

    // ── plan-config.json ──
    // `multiLevel: true` seulement si coché : sinon champ absent, JSON identique pour les plans à un niveau.
    // Tuilage V2 : imageWidth/Height = dims après crop, section `tiling` (manifeste) et `plan.tiledV2 = true`.
    const planObj = {
      name, version, author,
      imageWidth:  v2Dims ? v2Dims.width  : width,
      imageHeight: v2Dims ? v2Dims.height : height,
      baseImage: baseImageName, collisionImage: collisionName
    };
    if (multiLevel)     planObj.multiLevel = true;
    // Étiquettes et fond conseillé écrits SEULEMENT s'ils sont saisis (sinon JSON inchangé).
    if (tags.length)    planObj.tags = tags;
    const _fond = (document.getElementById("pl_fond") || {}).value || "";
    if (["noir", "blanc", "gris"].indexOf(_fond) >= 0) planObj.fondConseille = _fond;
    // Table des profondeurs (niveau 0 + pas), écrite seulement en multi-niveau.
    if (multiLevel && typeof window.proposerProfondeurs === "function") {
      const _z0 = parseFloat((document.getElementById("pl_prof0") || {}).value);
      const _pas = parseFloat((document.getElementById("pl_profPas") || {}).value);
      if (Number.isFinite(_z0) && Number.isFinite(_pas) && _pas > 0) {
        // Même plage par défaut que le runtime (config.js > availableLevels).
        planObj.niveauxProfondeur = window.proposerProfondeurs([-2, -1, 0, 1, 2], _z0, _pas);
      }
    }
    if (tilingManifest) planObj.tiledV2    = true;

    // Nord écrit seulement si ≠ 0, normalisé dans [0, 360[ (NaN → ignoré).
    const _northRaw = parseFloat(document.getElementById("pl_northOffset")?.value || "0");
    if (Number.isFinite(_northRaw) && _northRaw !== 0) {
      const _northNorm = ((_northRaw % 360) + 360) % 360;
      if (_northNorm !== 0) planObj.northOffsetDeg = _northNorm;
    }

    // PDF Histoire multiples : chaque entrée de _plannerHistPdfs sous data/<nom-sûr> (dédoublonné), depuis
    // l'upload ou _plannerOrigAssets[name]. plan-config : histoirePdfs[] + histoirePdf = le 1er (une app
    // ancienne lit au moins celui-là). Aucun PDF : les deux champs absents.
    const _histChemins = [];
    for (const _e of _plannerHistPdfs) {
      const _src = _e.file || _plannerOrigAssets[_e.name];
      if (!_src) { console.warn("[Planner] PDF Histoire introuvable, ignoré :", _e.name); continue; }
      let _safe = String(_e.name).replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!/\.pdf$/i.test(_safe)) _safe += ".pdf";
      let _final = _safe, _n = 2;
      while (_histChemins.indexOf("data/" + _final) !== -1) {
        _final = _safe.replace(/\.pdf$/i, "") + "-" + (_n++) + ".pdf";
      }
      dataFolder.file(_final, await _lireFichier(_src));
      _histChemins.push("data/" + _final);
      console.log("[Planner] PDF Histoire embarqué :", _final);
    }
    if (_histChemins.length) {
      planObj.histoirePdf  = _histChemins[0];
      planObj.histoirePdfs = _histChemins;
    }

    // Légende du plan : `planObj.customLegend` seulement si personnalisée (_plannerLegendStateNormalize rend
    // null pour un état vide, même si l'éditeur a été ouvert puis fermé).
    if (_plannerPlanLegend) planObj.customLegend = _plannerPlanLegend;

    // Géoréf optionnel : `plan.georef = { pointA, pointB }` seulement si TOUS les champs sont remplis et le
    // calage valide, sinon absent. Lat/lng lus par parseGpsCoords ; format invalide → abandon avec message.
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
      // Marque d'erreur précédente retirée, sinon elle reste après correction de la saisie.
      el.classList.remove("kta-gps-invalid");
      const errEl0 = errId ? document.getElementById(errId) : null;
      if (errEl0) errEl0.style.display = "none";
      const v = String(el.value || "").trim();
      if (v === "") return { empty: true, lat: null, lng: null };
      const parsed = (typeof window.parseGpsCoords === "function")
                      ? window.parseGpsCoords(v) : null;
      if (!parsed) {
        el.classList.add("kta-gps-invalid");
        const errEl = errId ? document.getElementById(errId) : null;
        if (errEl) {
          errEl.textContent = window.I18n.t("gen.geo.formatAttendu");
          errEl.style.display = "";
        }
        _plannerErreur(window.I18n.t("gen.geo.formatInvalide", { label: label }));
        throw new Error("abort");
      }
      return { empty: false, lat: parsed.lat, lng: parsed.lng };
    }
    const _coordsA = _readGeoCoords("pl_geo_A_coords", "pl_geo_A_err", window.I18n.t("gen.geo.labelA"));
    const _coordsB = _readGeoCoords("pl_geo_B_coords", "pl_geo_B_err", window.I18n.t("gen.geo.labelB"));
    const _coordsC = _readGeoCoords("pl_geo_C_coords", "pl_geo_C_err", window.I18n.t("gen.geo.labelC"));
    const _geoA = { x: _readGeo("pl_geo_A_x"), y: _readGeo("pl_geo_A_y"),
                    lat: _coordsA.lat, lng: _coordsA.lng };
    const _geoB = { x: _readGeo("pl_geo_B_x"), y: _readGeo("pl_geo_B_y"),
                    lat: _coordsB.lat, lng: _coordsB.lng };
    const _allGeoFilled =
      _geoA.x != null && _geoA.y != null && _geoA.lat != null && _geoA.lng != null &&
      _geoB.x != null && _geoB.y != null && _geoB.lat != null && _geoB.lng != null;
    if (_allGeoFilled) {
      // Point C optionnel mais tout ou rien (C partiel = oubli).
      const _geoC = { x: _readGeo("pl_geo_C_x"), y: _readGeo("pl_geo_C_y"),
                      lat: _coordsC.lat, lng: _coordsC.lng };
      const _cRempli = _geoC.x != null || _geoC.y != null || _geoC.lat != null;
      const _cComplet = _geoC.x != null && _geoC.y != null && _geoC.lat != null && _geoC.lng != null;
      if (_cRempli && !_cComplet) {
        _plannerErreur(window.I18n.t("gen.geo.pointCIncomplet"));
        throw new Error("abort");
      }
      // Refus si points colinéaires ou distance nulle ; C colinéaire refusé à la saisie, même si le moteur
      // sait replier.
      try {
        const _g = { pointA: _geoA, pointB: _geoB };
        if (_cComplet) _g.pointC = _geoC;
        if (window.KmzExport && typeof window.KmzExport.buildTransformCalib === "function") {
          const _t = window.KmzExport.buildTransformCalib(_g);
          if (_g.pointC && _t.degenereC) {
            _plannerErreur(window.I18n.t("gen.geo.pointCColineaire"));
            throw new Error("abort");
          }
        }
        planObj.georef = _g;
      } catch(e) {
        if (e.message === "abort") throw e;
        _plannerErreur(window.I18n.t("gen.geo.calibrageInvalide", { err: e.message }));
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
    // CE QUE CE ZIP EMBARQUE VRAIMENT sous `icon/`. ⚠️ Écrit même vide : sa PRÉSENCE dit à l'app de ne pas
    // sonder le serveur (sinon 21 requêtes 404 par ouverture pour un plan sans icône propre).
    planConfigObj.iconsEmbarquees = Array.from(new Set(iconsEmbarquees));
    if (tilingManifest) planConfigObj.tiling = tilingManifest;

    zip.file("plan-config.json", JSON.stringify(planConfigObj, null, 2));

    // ── Génération ──
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const nomZip = "plan_" + name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() + (tilingV2On ? "_v2" : "") + ".zip";

    // Mise à jour d'un plan : l'assistant propose la suite (télécharger, remplacer, nouvelle version).
    if (_plannerMaj && typeof _plannerMaj.onZip === "function") {
      const maj = _plannerMaj;
      _plannerMaj = null;
      const mm = document.getElementById("kta-planner-modal");
      if (mm) mm.remove();
      try { maj.onZip(blob, nomZip, { nom: name, version: version }); }
      catch (eMaj) { console.warn("[Planner] suite de la mise à jour :", eMaj); }
      return;
    }

    const url  = URL.createObjectURL(blob);
    // try/finally : blob URL toujours révoqué, même si a.click() lève (navigateur strict, sandbox).
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = nomZip;
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }

    // Publication par l'extension (prises « publierPlan » / « publierVersion »). Sans extension, rien ne change.
    const X = window.KtaExtensions;
    const peutNouveau = !!(X && X.aPrise("publierPlan"));
    if (X && (peutNouveau || X.aPrise("publierVersion")) && typeof window.ktaConfirm === "function") {
      // Nom échappé (ktaConfirm rend du HTML), avancement visible pendant l'envoi (un gros plan prend des
      // minutes), fin annoncée par un toast.
      const dire = function(m, ty) {
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(m, ty || "info");
      };
      let minuteur = null;
      const envoyer = async function(fn) {
        const mo = (blob.size / 1048576).toFixed(blob.size < 10485760 ? 1 : 0);
        const t0 = Date.now();
        const tic = function() {
          const sec = Math.round((Date.now() - t0) / 1000);
          btnGen.disabled = true;
          btnGen.textContent = "☁️ " + window.I18n.t("home.plans.info.publishEnCours",
            { mo: mo, duree: Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") });
        };
        tic();
        minuteur = setInterval(tic, 1000);
        await fn();
      };
      try {
        // ⚠️ Un ZIP d'un plan de l'extension rouvert ici devient une NOUVELLE VERSION de ce plan, jamais un
        // second plan ; une copie se publie seulement par le choix explicite « Publier comme nouveau plan ».
        const cible = await _planExtensionDuZip();
        const autre = peutNouveau ? { label: window.I18n.t("ext.publier.commeNouveau"), valeur: "nouveau" } : null;
        let choix = false;
        if (cible) {
          const nomCible = window.ktaEsc(cible.name || cible.id);
          const intro = window.I18n.t(cible.exact ? "ext.publier.versionReconnu" : "ext.publier.versionMemeNom",
                                      { nom: nomCible });
          if (X.versionAutorisee(cible.id)) {
            choix = await window.ktaConfirm(intro + "\n\n" + window.I18n.t("ext.publier.versionQuestion"),
              { okLabel: window.I18n.t("ext.publier.versionOk"), autre: autre });
            if (choix === true) {
              await envoyer(function() {
                return X.publierVersion({ planId: cible.id, blob: blob, nom: name });
              });
              dire(window.I18n.t("ext.publier.versionFait"), "success");
            }
          } else {
            choix = await window.ktaConfirm(intro + "\n\n" + window.I18n.t("ext.publier.versionReservee"),
              { okLabel: window.I18n.t("ui.confirm.ok"), sansAnnuler: true, autre: autre });
          }
        } else {
          // ZIP non reconnu (ou plusieurs homonymes) : l'utilisateur désigne lui-même le plan à mettre à jour
          // parmi ceux qu'il gère, avant toute proposition de plan neuf.
          const aGerer = _plannerMode === "modifier" ? _plansExtAGerer(X) : [];
          if (aGerer.length) {
            const idChoisi = await _choisirPlanExtAMettreAJour(aGerer, (_plannerSourceZip && _plannerSourceZip.nom) || name);
            if (idChoisi) {
              await envoyer(function() {
                return X.publierVersion({ planId: idChoisi, blob: blob, nom: name });
              });
              dire(window.I18n.t("ext.publier.versionFait"), "success");
            } else if (idChoisi === "" && peutNouveau) {
              choix = "nouveau";
            }
          } else if (peutNouveau) {
            choix = (await window.ktaConfirm(window.I18n.t("ext.publier.question", { nom: window.ktaEsc(name) }),
                                             { okLabel: window.I18n.t("ext.publier.ok") })) ? "nouveau" : false;
          }
        }
        if (choix === "nouveau") {
          await envoyer(function() { return X.publierPlan({ blob: blob, nom: name }); });
          dire(window.I18n.t("ext.publier.fait"), "info");
        }
      } catch (e) {
        console.warn("[Planner] publication :", e);
        dire(window.I18n.t("ext.publier.echec"), "warn");
      } finally {
        if (minuteur) clearInterval(minuteur);
      }
    }

    const m = document.getElementById("kta-planner-modal");
    if (m) m.remove();

  } catch(err) {
    if (err.message !== "abort") { console.error("[Planner]", err); _plannerErreur("❌ " + (err.message || err)); }
    btnGen.disabled = false; btnGen.textContent = window.I18n.t("gen.btn.genererZip");
  }
}

// Plan d'extension (☁️) dont vient le ZIP chargé en mode Modifier → { id, name, exact } | null.
// 1. Même empreinte SHA-256 que l'archive gardée sur l'appareil (le ZIP de sa fiche ℹ️, ou celui qu'on avait
//    publié) : exact. Empreinte du registre d'abord (posée à l'ouverture), sinon archive gardée de même taille.
// 2. Sinon, UN SEUL plan d'extension porte le nom écrit dans le ZIP : probable (ancienne version, ZIP retouché).
// Plusieurs homonymes ou rien : null (publication d'un nouveau plan, comme un plan neuf).
async function _planExtensionDuZip() {
  const src = _plannerSourceZip;
  const PR = window.PlanRegistry;
  if (_plannerMode !== "modifier" || !src || !PR || typeof PR.getAll !== "function") return null;
  const ext = (PR.getAll() || []).filter(function(e) { return e && e.type === "ext"; });
  if (!ext.length) return null;
  if (src.sha256) {
    const direct = ext.find(function(e) { return e.sha256 && String(e.sha256).toLowerCase() === src.sha256; });
    if (direct) return { id: direct.id, name: direct.name, exact: true };
    const D = window.PlanDenylist;
    if (D && typeof D.computeSha256 === "function" && typeof PR.getBlob === "function") {
      for (const e of ext) {
        if (!e.storedBlob) continue;
        try {
          const b = await PR.getBlob(e.id);
          if (!b || b.size !== src.taille) continue;
          if (String(await D.computeSha256(b)).toLowerCase() === src.sha256) return { id: e.id, name: e.name, exact: true };
        } catch (eSha) { console.warn("[Planner] empreinte de l'archive gardée :", eSha && eSha.message); }
      }
    }
  }
  const nom = String(src.nom || "").trim().toLowerCase();
  if (!nom) return null;
  const memes = ext.filter(function(e) { return String(e.name || "").trim().toLowerCase() === nom; });
  return memes.length === 1 ? { id: memes[0].id, name: memes[0].name, exact: false } : null;
}

// Plans d'extension que l'utilisateur peut mettre à jour (permission `versionAutorisee`), triés par nom.
function _plansExtAGerer(X) {
  const PR = window.PlanRegistry;
  if (!PR || typeof PR.getAll !== "function" || typeof X.versionAutorisee !== "function") return [];
  return (PR.getAll() || []).filter(function(e) {
    return e && e.type === "ext" && X.versionAutorisee(e.id);
  }).sort(function(a, b) { return String(a.name || "").localeCompare(String(b.name || "")); });
}

// « Mettre à jour quel plan ☁️ ? » → id registre choisi, "" (« Aucun : publier comme nouveau plan ») ou null
// (annulé). Présélection : le plan du même nom que le ZIP s'il est seul, sinon « Aucun ». 🩸 Plusieurs plans du
// même nom : RIEN n'est présélectionné et la validation reste inactive jusqu'au choix (présélectionner l'un des
// homonymes enverrait la version au hasard) ; chaque homonyme est distingué par ce que le registre sait déjà
// (dossier, version, dernière ouverture, début de l'id), sans requête. ⚠️ Le choix ne fait que désigner le plan :
// la prise revérifie la permission et le serveur de l'extension le droit à l'envoi. Liste posée par le DOM (noms
// bruts en textContent) ; sa valeur est relue à chaque changement, la fenêtre étant retirée avant la résolution.
async function _choisirPlanExtAMettreAJour(plans, nomZip) {
  const cle = function(e) { return String(e.name || "").trim().toLowerCase(); };
  const nom = String(nomZip || "").trim().toLowerCase();
  const memeNom = plans.filter(function(e) { return cle(e) === nom; });
  const ambigu = memeNom.length > 1;
  let valeur = ambigu ? null : (memeNom.length ? memeNom[0].id : "");
  const promesse = window.ktaConfirm(window.I18n.t("ext.publier.choixQuestion") +
    '<br><select id="kta-gen-cible" style="width:100%; margin-top:10px;"></select>',
    { titre: window.I18n.t("ext.publier.choixTitre"), okLabel: window.I18n.t("ext.publier.choixOk") });
  const liste = document.getElementById("kta-gen-cible");
  const ok = document.getElementById("kta-confirm-oui");
  if (!liste || !ok) return (await promesse) ? valeur : null;
  const compte = {};
  plans.forEach(function(e) { compte[cle(e)] = (compte[cle(e)] || 0) + 1; });
  const PR = window.PlanRegistry;
  const loc = window.ktaLocale ? window.ktaLocale() : "fr-FR";
  const detail = function(e) {
    const d = [];
    const dossier = (e.folderId && PR && typeof PR.findFolder === "function") ? PR.findFolder(e.folderId) : null;
    if (dossier && dossier.name) d.push(window.I18n.t("ext.publier.choixDossier", { nom: dossier.name }));
    if (e.version) d.push(window.I18n.t("ext.publier.choixVersion", { n: e.version }));
    if (e.lastOpened) {
      const dt = new Date(e.lastOpened);
      if (!Number.isNaN(dt.getTime())) d.push(window.I18n.t("ext.publier.choixOuvert", { date: dt.toLocaleDateString(loc) }));
    }
    d.push("#" + String(e.extId || e.id).replace(/^ext_/, "").slice(0, 8));
    return d.join(" · ");
  };
  if (ambigu) {
    const invite = document.createElement("option");
    invite.value = "";
    invite.disabled = true;
    invite.textContent = window.I18n.t("ext.publier.choixInvite");
    invite.setAttribute("data-invite", "1");
    liste.appendChild(invite);
  }
  const aucun = document.createElement("option");
  aucun.value = "";
  aucun.textContent = window.I18n.t("ext.publier.choixAucun");
  liste.appendChild(aucun);
  plans.forEach(function(e) {
    const o = document.createElement("option");
    o.value = e.id;
    o.textContent = "☁️ " + (e.name || e.id) + (compte[cle(e)] > 1 ? " — " + detail(e) : "");
    liste.appendChild(o);
  });
  if (ambigu) {
    liste.selectedIndex = 0;
    ok.disabled = true;
  } else {
    liste.value = valeur;
  }
  liste.addEventListener("change", function() {
    const opt = liste.options[liste.selectedIndex];
    if (!opt || opt.getAttribute("data-invite")) return;
    valeur = liste.value;
    ok.disabled = false;
  });
  const r = await promesse;
  return (r && valeur !== null) ? valeur : null;
}

window.afficherPlanner = afficherPlanner;
// Import KMZ exposé pour l'accueil (un .kmz déposé va droit à la conversion KMZ → ZIP) ; un fichier fourni
// lance l'analyse directement.
window.afficherImporterKmz = _afficherImporterKmz;
// Tuilage V2 exposé pour kmzImport.js > genererZipMyktamap (re-tuilage de l'image plate du KMZ). Le
// multi-niveau n'est qu'un drapeau de plan-config, sans API.
window.MyKTAMapTilingV2 = _genererTuilesV2;

// ── Modale import KMZ → ZIP MyKTAMap ──────────
// Upload .kmz → analyse (kmzImport.js : GroundOverlay + comptage des Placemarks) → résumé → types par défaut
// des points / lignes / polygones → « Générer le ZIP ». Sans GroundOverlay : modale d'erreur, pas d'import.

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
        <span class="kta-readme-modal-titre">${window.I18n.t("gen.kmz.titre")}</span>
        <button class="kta-panneau-close" id="kta-kmz-imp-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps" id="kta-kmz-imp-corps">

        <div style="padding:8px 12px; background:rgba(255,179,128,0.06); border:1px solid rgba(255,179,128,0.22); border-radius:6px; font-size:12px; color:var(--kta-texte-2); margin-bottom:14px;">${window.I18n.t("gen.kmz.phase1")}</div>

        <!-- 1. UPLOAD -->
        <div class="kta-aide-section" id="kta-kmz-imp-step-upload">
          <div class="kta-aide-section-titre">${window.I18n.t("gen.kmz.fichierTitre")}</div>
          <div class="kta-conv-drop" id="kta-kmz-imp-drop" style="position:relative; overflow:hidden;">
            <span style="font-size:28px;">🌍</span>
            <span id="kta-kmz-imp-label">${window.I18n.t("gen.kmz.dropLabel")}</span>
            <input type="file" id="kta-kmz-imp-input" accept=".kmz,application/vnd.google-earth.kmz"
              style="position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; z-index:5;">
          </div>
          <div id="kta-kmz-imp-status" style="margin-top:8px;font-size:13px;min-height:18px;"></div>
        </div>

        <!-- 2. RÉSUMÉ (caché tant qu'aucun KMZ analysé) -->
        <div class="kta-aide-section" id="kta-kmz-imp-step-resume" style="display:none;">
          <div class="kta-aide-section-titre">${window.I18n.t("gen.imp.apercu")}</div>
          <div id="kta-kmz-imp-resume" class="kta-conv-stats"></div>
        </div>

        <!-- 3. CONFIG IMPORT -->
        <div class="kta-aide-section" id="kta-kmz-imp-step-config" style="display:none;">
          <div class="kta-aide-section-titre">${window.I18n.t("gen.imp.configTitre")}</div>

          <div class="kta-planner-grille">
            <label class="kta-cfg-label">${window.I18n.t("gen.imp.nomPlan")} <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="kta-kmz-imp-name" type="text" placeholder="${window.I18n.t("gen.infos.nomPlaceholder")}">

            <label class="kta-cfg-label">${window.I18n.t("gen.infos.version")}</label>
            <input class="kta-cfg-input" id="kta-kmz-imp-version" type="text" placeholder="v1" value="v1">

            <label class="kta-cfg-label">${window.I18n.t("gen.infos.auteur")}</label>
            <input class="kta-cfg-input" id="kta-kmz-imp-author" type="text" placeholder="${window.I18n.t("gen.kmz.auteurPlaceholder")}">
            <label class="kta-cfg-label">${window.I18n.t("gen.infos.tags")}</label>
            <input class="kta-cfg-input" id="kta-kmz-imp-tags" type="text" placeholder="${window.I18n.t("gen.infos.tagsPlaceholder")}" title="${window.I18n.t("gen.infos.tagsHint")}">
          </div>

          <p class="kta-planner-info" style="margin-top:12px; margin-bottom:4px;">${window.I18n.t("gen.imp.typesInfo")}</p>

          <div class="kta-planner-grille">
            <label class="kta-cfg-label">${window.I18n.t("gen.imp.pointsTag")}</label>
            <select class="kta-cfg-input" id="kta-kmz-imp-point-tag">
              <option value="default">${window.I18n.t("gen.imp.tagDefault")}</option>
              <option value="pa">${window.I18n.t("gen.imp.tagPa")}</option>
              <option value="pb">${window.I18n.t("gen.imp.tagPb")}</option>
              <option value="pc">${window.I18n.t("gen.imp.tagPc")}</option>
              <option value="pe">${window.I18n.t("gen.imp.tagPe")}</option>
              <option value="ps">${window.I18n.t("gen.imp.tagPs")}</option>
              <option value="salle">${window.I18n.t("gen.imp.tagSalle")}</option>
              <option value="chatiere">${window.I18n.t("gen.imp.tagChatiere")}</option>
              <option value="passage">${window.I18n.t("gen.imp.tagPassage")}</option>
              <option value="danger">${window.I18n.t("gen.imp.tagDanger")}</option>
              <option value="info">${window.I18n.t("gen.imp.tagInfo")}</option>
            </select>

            <label class="kta-cfg-label">${window.I18n.t("gen.kmz.lineStringType")}</label>
            <select class="kta-cfg-input" id="kta-kmz-imp-road-type">
              <option value="chemin" selected>${window.I18n.t("gen.imp.roadChemin")}</option>
              <option value="secondaire">${window.I18n.t("gen.imp.roadSecondaire")}</option>
              <option value="principal">${window.I18n.t("gen.imp.roadPrincipal")}</option>
            </select>

            <label class="kta-cfg-label">${window.I18n.t("gen.kmz.polygonType")}</label>
            <select class="kta-cfg-input" id="kta-kmz-imp-zone-type">
              <option value="remblais" selected>${window.I18n.t("gen.imp.zoneRemblais")}</option>
              <option value="eau">${window.I18n.t("gen.imp.zoneEau")}</option>
              <option value="effondrement">${window.I18n.t("gen.imp.zoneEffondrement")}</option>
              <option value="inaccessible">${window.I18n.t("gen.imp.zoneInaccessible")}</option>
            </select>
          </div>

          <!-- v1.14.20-hotfix12 (KARMA « depuis import KMZ on doit pouvoir
               cocher un mode V2 pour regénérer les tuiles, pareil M-LVL »).
               Options optionnelles appliquées au ZIP MyKTAMap généré : V2
               re-tile l'image plate du KMZ en tuiles 512×512 (utile pour
               une utilisation mobile sans saturer la mémoire), M-LVL active
               le multi-niveau dans le plan-config.json. -->
          <div style="margin-top:14px;">
            <label class="kta-planner-tiling-v2-row" title="${window.I18n.t("gen.v2.rowTitle")}">
              <input type="checkbox" id="kta-kmz-imp-v2">
              <span>
                <strong>${window.I18n.t("gen.v2.label")}</strong>
                <em>${window.I18n.t("gen.v2.hint")}</em>
              </span>
            </label>
            <label class="kta-planner-multilevel-row" style="margin-top:8px;">
              <input type="checkbox" id="kta-kmz-imp-mlvl">
              <span>
                <strong>${window.I18n.t("gen.mlvl.label")}</strong>
              </span>
            </label>
          </div>
        </div>

      </div>

      <div class="kta-aide-actions" style="padding:14px 18px; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:10px; justify-content:flex-end;">
        <button class="kta-btn kta-btn-ghost" id="kta-kmz-imp-annuler">${window.I18n.t("gen.btn.annuler")}</button>
        <button class="kta-btn kta-btn-primary" id="kta-kmz-imp-generer" disabled>${window.I18n.t("gen.imp.genererBtn")}</button>
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

  const input = document.getElementById("kta-kmz-imp-input");
  const labelEl = document.getElementById("kta-kmz-imp-label");
  input.addEventListener("change", async function() {
    const file = input.files && input.files[0];
    if (!file) return;
    labelEl.textContent = "📦 " + file.name;
    await _kmzImpAnalyserFichier(file);
  });

  // KMZ déjà fourni (déposé sur la zone du générateur) : analyse directe.
  if (prefilledFile) {
    if (labelEl) labelEl.textContent = "📦 " + prefilledFile.name;
    // Asynchrone : la modale est déjà dans le DOM.
    setTimeout(function() { _kmzImpAnalyserFichier(prefilledFile); }, 0);
  }

  document.getElementById("kta-kmz-imp-generer").addEventListener("click", async function() {
    // Bouton désactivé pendant la génération (lourde) : un double clic lancerait N générations parallèles.
    const btn = this;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = window.I18n.t("gen.btn.generation");
    try {
      await _kmzImpGenerer();
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

// Analyse un KMZ (extraction, parsing, GroundOverlay, comptage) ; résumé ou modale d'erreur.
async function _kmzImpAnalyserFichier(file) {
  const status = document.getElementById("kta-kmz-imp-status");
  const btnGen = document.getElementById("kta-kmz-imp-generer");
  const stepResume = document.getElementById("kta-kmz-imp-step-resume");
  const stepConfig = document.getElementById("kta-kmz-imp-step-config");
  status.textContent = window.I18n.t("gen.kmz.extraction");
  status.style.color = "#8cb4ff";
  btnGen.disabled = true;
  stepResume.style.display = "none";
  stepConfig.style.display = "none";

  if (!window.KmzImport) {
    status.textContent = window.I18n.t("gen.kmz.moduleNonCharge");
    status.style.color = "#ff8c8c";
    return;
  }

  try {
    const { kmlDoc, assets } = await window.KmzImport.extraireKmz(file);

    // 🔒 Seuls les KMZ exportés par MyKTAMap sont acceptés : signature « Export MyKTAMap » dans
    // <Document><description> (kmzExport.js > genererKml) + replis (name, styles). KMZ tiers → refus net.
    if (!window.KmzImport.estKmzMyktamap(kmlDoc)) {
      status.textContent = window.I18n.t("gen.kmz.nonCompatible");
      status.style.color = "#ff8c8c";
      _kmzImpAfficherModaleNonCompatible(file);   // propose la conversion SIG
      return;
    }

    const overlays = window.KmzImport.extraireGroundOverlays(kmlDoc, assets);

    // KMZ MyKTAMap sans GroundOverlay (exporté sans l'image du plan) : pas de repère pixel, pas d'import.
    if (overlays.length === 0) {
      status.textContent = window.I18n.t("gen.kmz.sansImage");
      status.style.color = "#ff8c8c";
      _kmzImpAfficherModaleErrSansImage();
      return;
    }

    const base = overlays[0];
    const dims = await window.KmzImport.lireDimensionsImage(base.hrefBlob);

    let transform;
    try {
      transform = window.KmzImport.buildTransform(base.corners, dims.width, dims.height);
    } catch (e) {
      status.textContent = window.I18n.t("gen.kmz.calibrageInvalide", { err: (e.message || e) });
      status.style.color = "#ff8c8c";
      return;
    }

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

    const docName = (kmlDoc.querySelector("Document > name")?.textContent || "").trim() || window.I18n.t("gen.kmz.sansNom");
    const overlaysExtra = overlays.length > 1
      ? `<div style="color:var(--kta-avert); font-size:12px; margin-top:4px;">${window.I18n.t("gen.kmz.overlaysExtra", { n: overlays.length - 1 })}</div>` : "";
    const mgWarn = mgCount > 0
      ? `<div style="color:var(--kta-avert); font-size:12px; margin-top:4px;">${window.I18n.t("gen.kmz.mgWarn", { n: mgCount })}</div>` : "";

    // Légende du plan embarquée (`myktamap-extras.json` > customLegend) : une ligne de résumé le dit.
    // Absente (KMZ tiers ou ancien) : rien.
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
                if (renamed > 0) parts.push(renamed + " " + window.I18n.t(renamed > 1 ? "gen.legende.renommesP" : "gen.legende.renomme"));
                if (hiddenN > 0) parts.push(hiddenN + " " + window.I18n.t(hiddenN > 1 ? "gen.legende.masquesP"  : "gen.legende.masque"));
                if (customN > 0) parts.push(customN + " " + window.I18n.t(customN > 1 ? "gen.legende.customsP"   : "gen.legende.custom"));
                legendInfo = `<div style="color:var(--kta-ok); font-size:12px; margin-top:6px;">
                  ${window.I18n.t("gen.imp.legendeDetectee", { parts: parts.join(" · ") })}
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
      <div>📄 <strong>${window.I18n.t("gen.kmz.docKml")}</strong> : ${_escHtml(docName)}</div>
      <div>🖼️ <strong>${window.I18n.t("gen.kmz.imagePlan")}</strong> : ${dims.width} × ${dims.height} px
        <span style="color:var(--kta-texte-3);">(${_escHtml(base.name || base.hrefBlob.type || "image")})</span></div>
      <div>📐 <strong>${window.I18n.t("gen.kmz.echelleCalibrage")}</strong> : ${transform.metresParPixel.toFixed(3)} m/px
        · ${window.I18n.t("gen.kmz.rotation")} ${(transform.rotation * 180 / Math.PI).toFixed(1)}°</div>
      <div style="margin-top:8px;">
        📍 <strong>${ptCount}</strong> ${window.I18n.t("gen.kmz.points")}
        · 🛣️ <strong>${lsCount}</strong> ${window.I18n.t("gen.kmz.lignes")}
        · ⬛ <strong>${pgCount}</strong> ${window.I18n.t("gen.kmz.polygones")}
        <span style="color:var(--kta-texte-3);">${window.I18n.t("gen.kmz.placemarkTotal", { n: pmCount })}</span>
      </div>
      ${legendInfo}${overlaysExtra}${mgWarn}
    `;

    const nameInput = document.getElementById("kta-kmz-imp-name");
    if (nameInput && !nameInput.value) nameInput.value = docName !== window.I18n.t("gen.kmz.sansNom") ? docName : "";

    stepResume.style.display = "";
    stepConfig.style.display = "";
    btnGen.disabled = false;
    status.textContent = window.I18n.t("gen.kmz.pret");
    status.style.color = "#6ce28a";

  } catch (e) {
    console.error("[KmzImport] Erreur analyse :", e);
    status.textContent = window.I18n.t("gen.commun.erreur", { err: (e.message || e) });
    status.style.color = "#ff8c8c";
  }
}

// Modale « KMZ non compatible » (KMZ tiers). Avec `fichier`, propose la CONVERSION SIG au lieu d'un
// cul-de-sac : un export QGIS en .kmz est un KMZ vectoriel sans signature MyKTAMap, que `sigImport` sait lire.
function _kmzImpAfficherModaleNonCompatible(fichier) {
  const existing = document.getElementById("kta-kmz-imp-incompat-modal");
  if (existing) existing.remove();
  const T = function(k, p) { return window.I18n.t(k, p); };
  const peutBasculer = !!(fichier && typeof _afficherImporterSig === "function");
  const DELAI = 3;

  const m = document.createElement("div");
  m.id = "kta-kmz-imp-incompat-modal";
  m.className = "kta-readme-modal-overlay";
  m.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:80vh; border:1px solid rgba(255,140,140,0.35);">' +
      '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,140,140,0.20);">' +
        '<span class="kta-readme-modal-titre" style="color:var(--kta-erreur);">' + T("gen.kmzIncompat.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-kmz-imp-incompat-close">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="font-size:13.5px; color:var(--kta-texte-2); line-height:1.6; margin:0 0 12px;">' + T("gen.kmzIncompat.txt") + '</p>' +
        (peutBasculer
          ? '<div style="padding:10px 12px; background:rgba(108,226,138,0.08); border:1px solid rgba(108,226,138,0.30); border-radius:6px; margin-bottom:14px; font-size:12.5px; color:var(--kta-texte-2); line-height:1.55;">' +
              T("gen.kmzIncompat.sigTxt") +
              '<div style="margin-top:8px; color:var(--kta-ok); font-weight:600;" id="kta-kmz-sig-compte">' +
                T("gen.kmzIncompat.sigCompte", { s: DELAI }) +
              '</div>' +
            '</div>'
          : '<div style="padding:10px 12px; background:rgba(140,180,255,0.06); border:1px solid rgba(140,180,255,0.22); border-radius:6px; margin-bottom:14px; font-size:12.5px; color:var(--kta-texte-2);">' + T("gen.kmzIncompat.aide") + '</div>') +
        '<div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">' +
          (peutBasculer
            ? '<button class="kta-btn kta-btn-ghost" id="kta-kmz-imp-incompat-rester">' + T("gen.kmzIncompat.rester") + '</button>' +
              '<button class="kta-btn kta-btn-primary" id="kta-kmz-imp-incompat-sig">' + T("gen.kmzIncompat.sigBtn") + '</button>'
            : '<button class="kta-btn kta-btn-primary" id="kta-kmz-imp-incompat-ok">' + T("gen.btn.jaiCompris") + '</button>') +
        '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(m);

  // ⚠️ Le compte à rebours DOIT être annulé par TOUTES les sorties (✕, fond, Échap, « Rester ici ») : sinon
  // la conversion s'ouvre 2 s plus tard sur le dos de l'utilisateur qui vient d'annuler.
  let _tick = null;
  const _stop = function() { if (_tick) { clearInterval(_tick); _tick = null; } };
  const _c = function() { _stop(); m.remove(); document.removeEventListener("keydown", _esc); };
  const _esc = function(e) { if (e.key === "Escape" || e.key === "Esc") _c(); };
  document.addEventListener("keydown", _esc);

  document.getElementById("kta-kmz-imp-incompat-close").addEventListener("click", _c);
  m.addEventListener("click", function(e) { if (e.target === m) _c(); });
  const btnOk = document.getElementById("kta-kmz-imp-incompat-ok");
  if (btnOk) btnOk.addEventListener("click", _c);

  if (peutBasculer) {
    const _basculer = function() { _c(); _afficherImporterSig(fichier); };
    document.getElementById("kta-kmz-imp-incompat-sig").addEventListener("click", _basculer);
    document.getElementById("kta-kmz-imp-incompat-rester").addEventListener("click", _c);
    let reste = DELAI;
    const el = document.getElementById("kta-kmz-sig-compte");
    _tick = setInterval(function() {
      reste--;
      if (reste <= 0) { _basculer(); return; }
      if (el) el.textContent = T("gen.kmzIncompat.sigCompte", { s: reste });
    }, 1000);
  }
}

// Modale d'erreur du KMZ sans GroundOverlay : refus définitif, expliqué.
function _kmzImpAfficherModaleErrSansImage() {
  const existing = document.getElementById("kta-kmz-imp-noimg-modal");
  if (existing) existing.remove();
  const m = document.createElement("div");
  m.id = "kta-kmz-imp-noimg-modal";
  m.className = "kta-readme-modal-overlay";
  m.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:80vh; border:1px solid rgba(255,140,140,0.35);">' +
      '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,140,140,0.20);">' +
        '<span class="kta-readme-modal-titre" style="color:var(--kta-erreur);">' + window.I18n.t("gen.kmzNoImg.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-kmz-imp-noimg-close">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="font-size:13.5px; color:var(--kta-texte-2); line-height:1.6; margin:0 0 12px;">' + window.I18n.t("gen.kmzNoImg.txt1") + '</p>' +
        '<p style="font-size:13px; color:var(--kta-texte-2); line-height:1.6; margin:0 0 14px;">' + window.I18n.t("gen.kmzNoImg.txt2") + '</p>' +
        '<div style="padding:10px 12px; background:rgba(255,179,128,0.06); border:1px solid rgba(255,179,128,0.22); border-radius:6px; margin-bottom:14px; font-size:12.5px; color:var(--kta-texte-2);">' + window.I18n.t("gen.kmzNoImg.solutions") + '</div>' +
        '<div style="display:flex; justify-content:flex-end;">' +
          '<button class="kta-btn kta-btn-primary" id="kta-kmz-imp-noimg-ok">' + window.I18n.t("gen.btn.jaiCompris") + '</button>' +
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
  const author  = (document.getElementById("kta-kmz-imp-author")?.value || "").trim() || window.I18n.t("gen.kmz.auteurDefaut");
  const pointTag = document.getElementById("kta-kmz-imp-point-tag").value;
  const roadType = document.getElementById("kta-kmz-imp-road-type").value;
  const zoneType = document.getElementById("kta-kmz-imp-zone-type").value;
  const tilingV2On = !!document.getElementById("kta-kmz-imp-v2")?.checked;
  const multiLevelOn = !!document.getElementById("kta-kmz-imp-mlvl")?.checked;

  if (!name) {
    status.textContent = window.I18n.t("gen.imp.nomObligatoire");
    status.style.color = "#ffb380";
    return;
  }

  btnGen.disabled = true;
  btnGen.textContent = window.I18n.t("gen.btn.generation");
  status.textContent = window.I18n.t("gen.imp.conversion");
  status.style.color = "#8cb4ff";

  try {
    const ingested = window.KmzImport.ingestPlacemarks(state.kmlDoc, state.transform, {
      pointTag: pointTag,
      roadType: roadType,
      zoneType: zoneType
    });

    const mime = state.overlay.hrefBlob.type || "image/png";
    let ext = "png";
    if (/jpeg|jpg/i.test(mime)) ext = "jpg";
    else if (/webp/i.test(mime)) ext = "webp";
    const baseImageFilename = "baseImage." + ext;

    // Overlay de progression V2 (même modèle que le générateur), seulement si tilingV2On.
    let v2Overlay = null;
    if (tilingV2On) {
      v2Overlay = document.createElement("div");
      v2Overlay.id = "kta-kmz-imp-v2-progress";
      v2Overlay.className = "kta-modal-overlay";
      v2Overlay.style.zIndex = "100000";
      v2Overlay.innerHTML =
        '<div class="kta-modal">' +
          '<div class="kta-modal-icon">🧱</div>' +
          '<div class="kta-modal-titre">' + window.I18n.t("gen.v2prog.titreImp") + '</div>' +
          '<div class="kta-modal-texte">' +
            '<div id="kta-kmz-v2-progress-text" style="margin-bottom:10px;">' + window.I18n.t("gen.v2prog.init") + '</div>' +
            '<div style="background:rgba(255,255,255,0.06); border-radius:6px; height:8px; overflow:hidden;">' +
              '<div id="kta-kmz-v2-progress-bar" style="height:100%; width:0%; background:#b452ff; transition:width 0.2s;"></div>' +
            '</div>' +
            '<p style="font-size:11.5px; color:var(--kta-texte-3); margin:14px 0 0; line-height:1.5;">' +
              window.I18n.t("gen.v2prog.warn") +
            '</p>' +
          '</div>' +
        '</div>';
      document.documentElement.appendChild(v2Overlay);
    }

    const onTilingProgress = tilingV2On ? function(done, total, currentZ) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const txt = document.getElementById("kta-kmz-v2-progress-text");
      const bar = document.getElementById("kta-kmz-v2-progress-bar");
      if (txt) txt.textContent = window.I18n.t("gen.v2prog.niveau", { z: currentZ, done: done, total: total, pct: pct });
      if (bar) bar.style.width = pct + "%";
    } : null;

    let blob;
    try {
      blob = await window.KmzImport.genererZipMyktamap({
        planName:          name,
        planVersion:       version,
        planAuthor:        author,
        tags:              _lireTagsChamp("kta-kmz-imp-tags"),
        baseImage:         state.overlay.hrefBlob,
        baseImageFilename: baseImageFilename,
        imageW:            state.imageW,
        imageH:            state.imageH,
        // Les 4 coins GPS du GroundOverlay : genererZipMyktamap en tire `plan.georef` (SW↔NE), sinon le KMZ
        // réimporté perd son calage.
        overlayCorners:    state.overlay.corners,
        // Tous les assets du KMZ : genererZipMyktamap y reprend les icônes (files/icons/<tag>.png) et les
        // remet sous icon/<tag>.png avec planConfig.icons.
        assets:            state.assets,
        // V2 re-tuile l'image plate ; M-LVL ajoute plan.multiLevel=true.
        tilingV2:          tilingV2On,
        multiLevel:        multiLevelOn,
        onTilingProgress:  onTilingProgress,
        imported: {
          points:     ingested.points,
          roads:      ingested.roads,
          zones:      ingested.zones,
          // Structures détectées par styleUrl="#structure_*" ([] pour un KMZ sans structures).
          structures: ingested.structures || []
        }
      });
    } finally {
      if (v2Overlay && v2Overlay.parentNode) v2Overlay.remove();
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plan_" + name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() + "_from_kmz.zip";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    const s = ingested.stats;
    status.innerHTML = window.I18n.t("gen.kmz.zipGenere") + " " +
      "<span style='color:var(--kta-texte-2);'>" + window.I18n.t("gen.kmz.statsGardes", { n: s.kept }) + " · " +
      window.I18n.t("gen.kmz.statsSautes", { n: s.skipped }) +
      (s.outOfBounds > 0 ? " · " + window.I18n.t("gen.kmz.statsHorsBounds", { n: s.outOfBounds }) : "") +
      (s.multiGeometry > 0 ? " · " + window.I18n.t("gen.kmz.statsMultiGeo", { n: s.multiGeometry }) : "") +
      "</span>";
    status.style.color = "#6ce28a";
    btnGen.textContent = window.I18n.t("gen.imp.telechargeRegenerer");
    btnGen.disabled = false;
    console.log("[KmzImport] Stats :", s);
  } catch (e) {
    console.error("[KmzImport] Erreur génération :", e);
    status.textContent = window.I18n.t("gen.commun.erreur", { err: (e.message || e) });
    status.style.color = "#ff8c8c";
    btnGen.textContent = window.I18n.t("gen.imp.genererBtn");
    btnGen.disabled = false;
  }
}

function _escHtml(s) { return window.ktaEsc(s); }

// ── Modale import GPX → ZIP MyKTAMap ──────────
// Même déroulé que le KMZ (upload, analyse gpxImport.js > extraireGpx, résumé, options, « Générer »). Un GPX
// n'a pas d'image : on GÉNÈRE un canvas vierge calé automatiquement sur l'emprise GPS du fichier.

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
        <span class="kta-readme-modal-titre">${window.I18n.t("gen.gpx.titre")}</span>
        <button class="kta-panneau-close" id="kta-gpx-imp-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps" id="kta-kmz-imp-corps">


        <!-- 1. UPLOAD -->
        <div class="kta-aide-section" id="kta-gpx-imp-step-upload">
          <div class="kta-aide-section-titre">${window.I18n.t("gen.gpx.fichierTitre")}</div>
          <div class="kta-conv-drop" id="kta-gpx-imp-drop" style="position:relative; overflow:hidden;">
            <span style="font-size:28px;">📤</span>
            <span id="kta-gpx-imp-label">${window.I18n.t("gen.gpx.dropLabel")}</span>
            <input type="file" id="kta-gpx-imp-input" accept=".gpx,application/gpx+xml"
              style="position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; z-index:5;">
          </div>
          <div id="kta-gpx-imp-status" style="margin-top:8px;font-size:13px;min-height:18px;"></div>
        </div>

        <!-- 2. RÉSUMÉ -->
        <div class="kta-aide-section" id="kta-gpx-imp-step-resume" style="display:none;">
          <div class="kta-aide-section-titre">${window.I18n.t("gen.imp.apercu")}</div>
          <div id="kta-gpx-imp-resume" class="kta-conv-stats"></div>
        </div>

        <!-- 3. CONFIG IMPORT -->
        <div class="kta-aide-section" id="kta-gpx-imp-step-config" style="display:none;">
          <div class="kta-aide-section-titre">${window.I18n.t("gen.imp.configTitre")}</div>

          <div class="kta-planner-grille">
            <label class="kta-cfg-label">${window.I18n.t("gen.imp.nomPlan")} <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="kta-gpx-imp-name" type="text" placeholder="${window.I18n.t("gen.gpx.nomPlaceholder")}">

            <label class="kta-cfg-label">${window.I18n.t("gen.infos.version")}</label>
            <input class="kta-cfg-input" id="kta-gpx-imp-version" type="text" placeholder="v1" value="v1">

            <label class="kta-cfg-label">${window.I18n.t("gen.infos.auteur")}</label>
            <input class="kta-cfg-input" id="kta-gpx-imp-author" type="text" placeholder="${window.I18n.t("gen.gpx.auteurPlaceholder")}">
            <label class="kta-cfg-label">${window.I18n.t("gen.infos.tags")}</label>
            <input class="kta-cfg-input" id="kta-gpx-imp-tags" type="text" placeholder="${window.I18n.t("gen.infos.tagsPlaceholder")}" title="${window.I18n.t("gen.infos.tagsHint")}">
          </div>


          <div class="kta-planner-grille">
            <label class="kta-cfg-label">${window.I18n.t("gen.vierge.largeur")}</label>
            <input class="kta-cfg-input" id="kta-gpx-imp-w" type="number" min="500" max="12000" step="100" value="4000">

            <label class="kta-cfg-label">${window.I18n.t("gen.vierge.hauteur")}</label>
            <input class="kta-cfg-input" id="kta-gpx-imp-h" type="number" min="500" max="12000" step="100" value="4000">
          </div>

          <div class="kta-cfg-label" style="margin-top:8px;">${window.I18n.t("gen.gpx.couleurCanvas")}</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:4px;">
            <label class="kta-export-radio-row">
              <input type="radio" name="gpx_imp_color" value="white">
              <span>⬜ ${window.I18n.t("gen.couleur.blanc")}</span>
            </label>
            <label class="kta-export-radio-row">
              <input type="radio" name="gpx_imp_color" value="gray">
              <span>▫️ ${window.I18n.t("gen.couleur.gris")}</span>
            </label>
            <label class="kta-export-radio-row">
              <input type="radio" name="gpx_imp_color" value="black">
              <span>⬛ ${window.I18n.t("gen.couleur.noir")}</span>
            </label>
            <label class="kta-export-radio-row">
              <input type="radio" name="gpx_imp_color" value="sepia" checked>
              <span>📜 ${window.I18n.t("gen.couleur.sepia")}</span>
            </label>
          </div>

          <p class="kta-planner-info" style="margin-top:12px; margin-bottom:4px;">${window.I18n.t("gen.imp.typesInfo")}</p>

          <div class="kta-planner-grille">
            <label class="kta-cfg-label">${window.I18n.t("gen.imp.pointsTag")}</label>
            <select class="kta-cfg-input" id="kta-gpx-imp-point-tag">
              <option value="default" selected>${window.I18n.t("gen.imp.tagDefault")}</option>
              <option value="pa">${window.I18n.t("gen.imp.tagPa")}</option>
              <option value="pb">${window.I18n.t("gen.imp.tagPb")}</option>
              <option value="pc">${window.I18n.t("gen.imp.tagPc")}</option>
              <option value="pe">${window.I18n.t("gen.imp.tagPe")}</option>
              <option value="ps">${window.I18n.t("gen.imp.tagPs")}</option>
              <option value="salle">${window.I18n.t("gen.imp.tagSalle")}</option>
              <option value="chatiere">${window.I18n.t("gen.imp.tagChatiere")}</option>
              <option value="passage">${window.I18n.t("gen.imp.tagPassage")}</option>
              <option value="danger">${window.I18n.t("gen.imp.tagDanger")}</option>
              <option value="info">${window.I18n.t("gen.imp.tagInfo")}</option>
            </select>

            <label class="kta-cfg-label">${window.I18n.t("gen.gpx.tracksType")}</label>
            <select class="kta-cfg-input" id="kta-gpx-imp-road-type">
              <option value="chemin" selected>${window.I18n.t("gen.imp.roadChemin")}</option>
              <option value="secondaire">${window.I18n.t("gen.imp.roadSecondaire")}</option>
              <option value="principal">${window.I18n.t("gen.imp.roadPrincipal")}</option>
            </select>
          </div>

          <!-- Options V2 + M-LVL (cohérent avec _afficherImporterKmz hotfix12) -->
          <div style="margin-top:14px;">
            <label class="kta-planner-tiling-v2-row" title="${window.I18n.t("gen.v2.rowTitle")}">
              <input type="checkbox" id="kta-gpx-imp-v2">
              <span>
                <strong>${window.I18n.t("gen.v2.label")}</strong>
                <em>${window.I18n.t("gen.gpx.v2Hint")}</em>
              </span>
            </label>
            <label class="kta-planner-multilevel-row" style="margin-top:8px;">
              <input type="checkbox" id="kta-gpx-imp-mlvl">
              <span>
                <strong>${window.I18n.t("gen.mlvl.label")}</strong>
              </span>
            </label>
          </div>
        </div>

      </div>

      <div class="kta-aide-actions" style="padding:14px 18px; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:10px; justify-content:flex-end;">
        <button class="kta-btn kta-btn-ghost" id="kta-gpx-imp-annuler">${window.I18n.t("gen.btn.annuler")}</button>
        <button class="kta-btn kta-btn-primary" id="kta-gpx-imp-generer" disabled>${window.I18n.t("gen.imp.genererBtn")}</button>
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

  // Fichier déjà fourni (dépôt accueil ou générateur) : analyse directe.
  if (prefilledFile) {
    if (labelEl) labelEl.textContent = "📦 " + prefilledFile.name;
    setTimeout(function() { _gpxImpAnalyserFichier(prefilledFile); }, 0);
  }
}

async function _gpxImpAnalyserFichier(file) {
  const status = document.getElementById("kta-gpx-imp-status");
  status.textContent = window.I18n.t("gen.gpx.analyse");
  status.style.color = "#8cb4ff";

  if (!window.GpxImport || !window.GpxIO) {
    status.textContent = window.I18n.t("gen.gpx.moduleNonCharge");
    status.style.color = "#ff8c8c";
    return;
  }
  try {
    const { gpxDoc, parsed } = await window.GpxImport.extraireGpx(file);

    // GPX non MyKTAMap : avertissement, pas de blocage.
    const isMkm = window.GpxImport.estGpxMyktamap(gpxDoc);

    const bounds = window.GpxImport.extraireBoundsGps(parsed);
    if (!bounds || bounds.count === 0) {
      status.textContent = window.I18n.t("gen.gpx.noCoords");
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

    const sourceLine = isMkm
      ? '<div style="color:var(--kta-ok);">' + window.I18n.t("gen.gpx.sourceMkm") + '</div>'
      : '<div style="color:var(--kta-avert);">' + window.I18n.t("gen.gpx.sourceTiers") + '</div>';
    const dLat = bounds.latMax - bounds.latMin;
    const dLng = bounds.lngMax - bounds.lngMin;

    // Légende du plan embarquée (<metadata><extensions><myktamap:customLegend>, cf. gpxIO.js) : une ligne de
    // résumé le dit. Absente : rien.
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
        if (renamed > 0) parts.push(renamed + " " + window.I18n.t(renamed > 1 ? "gen.legende.renommesP" : "gen.legende.renomme"));
        if (hiddenN > 0) parts.push(hiddenN + " " + window.I18n.t(hiddenN > 1 ? "gen.legende.masquesP"  : "gen.legende.masque"));
        if (customN > 0) parts.push(customN + " " + window.I18n.t(customN > 1 ? "gen.legende.customsP"   : "gen.legende.custom"));
        legendInfo = `<div style="color:var(--kta-ok); font-size:12px; margin-top:6px;">
          ${window.I18n.t("gen.imp.legendeDetectee", { parts: parts.join(" · ") })}
        </div>`;
      }
    }

    document.getElementById("kta-gpx-imp-resume").innerHTML = `
      ${sourceLine}
      <div>📍 <strong>${window.I18n.t("gen.gpx.waypoints")}</strong> : ${parsed.waypoints.length}</div>
      <div>🛣️ <strong>${window.I18n.t("gen.gpx.tracks")}</strong> : ${parsed.tracks.length}</div>
      <div>🌐 <strong>${window.I18n.t("gen.gpx.boundsGps")}</strong> : lat ${bounds.latMin.toFixed(5)} → ${bounds.latMax.toFixed(5)} (Δ ${dLat.toFixed(5)}°), lng ${bounds.lngMin.toFixed(5)} → ${bounds.lngMax.toFixed(5)} (Δ ${dLng.toFixed(5)}°)</div>
      <div>📐 <strong>${window.I18n.t("gen.gpx.calibrageAuto")}</strong> : ${window.I18n.t("gen.gpx.calibrageAutoVal")}</div>
      ${legendInfo}
    `;

    document.getElementById("kta-gpx-imp-step-resume").style.display = "";
    document.getElementById("kta-gpx-imp-step-config").style.display = "";

    const nameInput = document.getElementById("kta-gpx-imp-name");
    if (nameInput && !nameInput.value && parsed.metadata && parsed.metadata.name) {
      nameInput.value = parsed.metadata.name + " " + window.I18n.t("gen.gpx.depuisSuffix");
    }

    document.getElementById("kta-gpx-imp-generer").disabled = false;

    status.textContent = window.I18n.t("gen.gpx.analyseOk");
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
  const author  = (document.getElementById("kta-gpx-imp-author")?.value || "").trim() || window.I18n.t("gen.gpx.auteurDefaut");
  const w       = parseInt(document.getElementById("kta-gpx-imp-w").value, 10) || 4000;
  const h       = parseInt(document.getElementById("kta-gpx-imp-h").value, 10) || 4000;
  const colorEl = document.querySelector('input[name="gpx_imp_color"]:checked');
  const color   = colorEl ? colorEl.value : "sepia";
  const pointTag = document.getElementById("kta-gpx-imp-point-tag").value;
  const roadType = document.getElementById("kta-gpx-imp-road-type").value;
  const tilingV2On   = !!document.getElementById("kta-gpx-imp-v2")?.checked;
  const multiLevelOn = !!document.getElementById("kta-gpx-imp-mlvl")?.checked;

  if (!name) {
    status.textContent = window.I18n.t("gen.imp.nomObligatoire");
    status.style.color = "#ffb380";
    return;
  }

  btnGen.disabled = true;
  btnGen.textContent = window.I18n.t("gen.btn.generation");
  status.textContent = window.I18n.t("gen.imp.conversion");
  status.style.color = "#8cb4ff";

  let v2Overlay = null;
  if (tilingV2On) {
    v2Overlay = document.createElement("div");
    v2Overlay.id = "kta-gpx-imp-v2-progress";
    v2Overlay.className = "kta-modal-overlay";
    v2Overlay.style.zIndex = "100000";
    v2Overlay.innerHTML =
      '<div class="kta-modal">' +
        '<div class="kta-modal-icon">🧱</div>' +
        '<div class="kta-modal-titre">' + window.I18n.t("gen.v2prog.titreImp") + '</div>' +
        '<div class="kta-modal-texte">' +
          '<div id="kta-gpx-v2-progress-text" style="margin-bottom:10px;">' + window.I18n.t("gen.v2prog.init") + '</div>' +
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
    if (txt) txt.textContent = window.I18n.t("gen.v2prog.niveau", { z: currentZ, done: done, total: total, pct: pct });
    if (bar) bar.style.width = pct + "%";
  } : null;

  try {
    const result = await window.GpxImport.genererZipMyktamap({
      planName:         name,
      planVersion:      version,
      planAuthor:       author,
      tags:             _lireTagsChamp("kta-gpx-imp-tags"),
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

    const url = URL.createObjectURL(result.blob);
    const a   = document.createElement("a");
    a.href = url;
    a.download = "plan_" + name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() + "_from_gpx.zip";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    const s = result.stats;
    status.innerHTML = window.I18n.t("gen.gpx.zipGenere", {
      kept: (s.kept || 0),
      oob:  (s.outOfBounds || 0),
      skipped: (s.skipped || 0)
    });
    status.style.color = "#6ce28a";
  } catch(err) {
    status.textContent = window.I18n.t("gen.gpx.erreurGeneration", { err: (err.message || err) });
    status.style.color = "#ff8c8c";
  } finally {
    if (v2Overlay && v2Overlay.parentNode) v2Overlay.remove();
    btnGen.textContent = window.I18n.t("gen.imp.genererBtn");
    btnGen.disabled = false;
  }
}

window.afficherImporterGpx = _afficherImporterGpx;

// ── Import SIG (QGIS) ──────────
// Même squelette que l'import GPX + l'ÉCRAN DE CORRESPONDANCE : un fichier SIG porte ses propres
// nomenclatures ; deviner se tromperait en silence. On préremplit par synonymes, l'utilisateur tranche.
// ⚠️ Valeurs ventilées PAR FAMILLE de géométrie (SigImport.valeursParFamille) : une valeur trouvée sur des
// polygones propose des types de ZONE, pas de tracé.
let _sigImportState = null;

function _afficherImporterSig(prefilledFile) {
  const existing = document.getElementById("kta-sig-import-modal");
  if (existing) { existing.remove(); return; }

  const T = function(k, p) { return window.I18n.t(k, p); };
  const modal = document.createElement("div");
  modal.id        = "kta-sig-import-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-kmz-imp-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">${T("gen.sig.titre")}</span>
        <button class="kta-panneau-close" id="kta-sig-imp-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <div style="padding:8px 12px; background:rgba(140,180,255,0.06); border:1px solid rgba(140,180,255,0.22); border-radius:6px; font-size:12px; color:var(--kta-texte-2); margin-bottom:14px;">${T("gen.sig.crsInfo")}</div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${T("gen.sig.fichierTitre")}</div>
          <div class="kta-conv-drop" id="kta-sig-imp-drop" style="position:relative; overflow:hidden;">
            <span style="font-size:28px;">🗺️</span>
            <span id="kta-sig-imp-label">${T("gen.sig.dropLabel")}</span>
            <input type="file" id="kta-sig-imp-input" accept=".geojson,.json,.kml,.kmz"
              style="position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; z-index:5;">
          </div>
          <div id="kta-sig-imp-status" style="margin-top:8px;font-size:13px;min-height:18px;"></div>
        </div>

        <div class="kta-aide-section" id="kta-sig-imp-step-resume" style="display:none;">
          <div class="kta-aide-section-titre">${T("gen.imp.apercu")}</div>
          <div id="kta-sig-imp-resume" class="kta-conv-stats"></div>
        </div>

        <!-- ÉCRAN DE CORRESPONDANCE -->
        <div class="kta-aide-section" id="kta-sig-imp-step-map" style="display:none;">
          <div class="kta-aide-section-titre">${T("gen.sig.mapTitre")}</div>
          <p class="kta-planner-info" style="margin-bottom:8px;">${T("gen.sig.mapInfo")}</p>
          <div class="kta-planner-grille">
            <label class="kta-cfg-label">${T("gen.sig.colonneType")}</label>
            <select class="kta-cfg-input" id="kta-sig-imp-colonne"></select>
          </div>
          <!-- 🏔️ v1.82.0 — COLONNE DU NIVEAU. Sans elle, un releve multi-etages
               arrivait entierement a plat : ingest n avait qu un level unique pour
               tout l import, et la case Plan multi-niveau ne faisait que poser un
               drapeau dans le plan-config. -->
          <div class="kta-planner-grille" style="margin-top:8px;">
            <label class="kta-cfg-label">${T("gen.sig.colonneNiveau")}</label>
            <select class="kta-cfg-input" id="kta-sig-imp-niveau"></select>
          </div>
          <div id="kta-sig-imp-niveau-apercu" style="margin-top:6px;"></div>
          <!-- 🎨 v1.82.0 — une couleur par etage. Sans elle, six niveaux
               superposes sortaient tous de la meme teinte : illisible, et le
               multi-niveau perdait l essentiel de son interet. -->
          <label class="kta-planner-check" style="margin-top:8px; display:flex; align-items:flex-start; gap:8px;">
            <input type="checkbox" id="kta-sig-imp-couleurs-niveau" checked style="margin-top:3px;">
            <span><strong>🎨 ${T("gen.sig.couleursNiveauTitre")}</strong><br>
            <span style="color:var(--kta-texte-3); font-size:11.5px;">${T("gen.sig.couleursNiveauHint")}</span></span>
          </label>
          <!-- 🏷️ v1.82.0 — renommer/recolorer SANS repasser par le générateur.
               KARMA : « obligé de repasser ensuite en génération normale pour
               renommer les entrées custom ». Le bouton ouvre LE MEME éditeur
               que le générateur de plans, sur les entrées de cet import. -->
          <button type="button" class="kta-planner-btn" id="kta-sig-imp-legende"
                  style="margin-top:8px; display:none;">🏷️ ${T("gen.sig.legendeBtn")}</button>
          <div id="kta-sig-imp-legende-etat" style="font-size:11.5px; color:var(--kta-texte-3); margin-top:4px;"></div>
          <div id="kta-sig-imp-map-tables" style="margin-top:10px;"></div>
        </div>

        <div class="kta-aide-section" id="kta-sig-imp-step-config" style="display:none;">
          <div class="kta-aide-section-titre">${T("gen.imp.configTitre")}</div>
          <div class="kta-planner-grille">
            <label class="kta-cfg-label">${T("gen.imp.nomPlan")} <span class="kta-planner-req">*</span></label>
            <input class="kta-cfg-input" id="kta-sig-imp-name" type="text" placeholder="${T("gen.sig.nomPlaceholder")}">
            <label class="kta-cfg-label">${T("gen.infos.version")}</label>
            <input class="kta-cfg-input" id="kta-sig-imp-version" type="text" placeholder="v1" value="v1">
            <label class="kta-cfg-label">${T("gen.infos.auteur")}</label>
            <input class="kta-cfg-input" id="kta-sig-imp-author" type="text" placeholder="${T("gen.gpx.auteurPlaceholder")}">
            <label class="kta-cfg-label">${T("gen.infos.tags")}</label>
            <input class="kta-cfg-input" id="kta-sig-imp-tags" type="text" placeholder="${T("gen.infos.tagsPlaceholder")}" title="${T("gen.infos.tagsHint")}">
          </div>

          <p class="kta-planner-info" style="margin-top:12px; margin-bottom:4px;">${T("gen.sig.canvasInfo")}</p>
          <div class="kta-planner-grille">
            <label class="kta-cfg-label">${T("gen.vierge.largeur")}</label>
            <input class="kta-cfg-input" id="kta-sig-imp-w" type="number" min="500" max="12000" step="100" value="4000">
            <label class="kta-cfg-label">${T("gen.vierge.hauteur")}</label>
            <input class="kta-cfg-input" id="kta-sig-imp-h" readonly title="${T('gen.sig.hAuto')}" type="number" min="500" max="12000" step="100" value="4000">
          </div>
          <div id="kta-sig-imp-canvas-alerte"></div>

          <div class="kta-cfg-label" style="margin-top:8px;">${T("gen.gpx.couleurCanvas")}</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:4px;">
            <label class="kta-export-radio-row"><input type="radio" name="sig_imp_color" value="white"><span>⬜ ${T("gen.couleur.blanc")}</span></label>
            <label class="kta-export-radio-row"><input type="radio" name="sig_imp_color" value="gray"><span>▫️ ${T("gen.couleur.gris")}</span></label>
            <label class="kta-export-radio-row"><input type="radio" name="sig_imp_color" value="black"><span>⬛ ${T("gen.couleur.noir")}</span></label>
            <label class="kta-export-radio-row"><input type="radio" name="sig_imp_color" value="sepia" checked><span>📜 ${T("gen.couleur.sepia")}</span></label>
          </div>

          <div style="margin-top:14px;">
            <label class="kta-planner-multilevel-row">
              <input type="checkbox" id="kta-sig-imp-mlvl">
              <span><strong>${T("gen.mlvl.label")}</strong></span>
            </label>
          </div>
        </div>

      </div>
      <div class="kta-aide-actions" style="padding:14px 18px; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
        <!-- 🏷️ v1.83.1 — L ETAT DE LA LEGENDE, REPETE AU RAS DU BOUTON.
             Toucher un select de correspondance apres avoir renomme les entrees
             efface la legende (_sigImpInvaliderLegende) ; le seul signal etait
             une ligne grise de 11 px, a un ecran de distance du bouton. On
             generait alors un plan aux libelles d usine en croyant garder les
             siens (bug KARMA, 04/09). -->
        <div id="kta-sig-imp-legende-recap" style="flex:1 1 220px; min-width:0; text-align:left; font-size:11.5px; line-height:1.35;"></div>
        <button class="kta-btn kta-btn-ghost" id="kta-sig-imp-annuler">${T("gen.btn.annuler")}</button>
        <button class="kta-btn kta-btn-primary" id="kta-sig-imp-generer" disabled>${T("gen.imp.genererBtn")}</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(modal);
  _sigImportState = null;
  _sigPlanLegend  = null;   // un nouvel import repart d'une légende vierge
  _sigLegendeReset = false;

  const _close = function() { modal.remove(); _sigImportState = null; };
  document.getElementById("kta-sig-imp-close").addEventListener("click", _close);
  document.getElementById("kta-sig-imp-annuler").addEventListener("click", _close);
  modal.addEventListener("click", function(e) { if (e.target === modal) _close(); });

  const input   = document.getElementById("kta-sig-imp-input");
  const labelEl = document.getElementById("kta-sig-imp-label");
  input.addEventListener("change", async function() {
    const file = input.files && input.files[0];
    if (!file) return;
    labelEl.textContent = "📦 " + file.name;
    await _sigImpAnalyserFichier(file);
  });
  document.getElementById("kta-sig-imp-colonne").addEventListener("change", _sigImpRendreTables);
  // Changer la colonne des types rebâtit le routage, donc les catégories des entrées. Le listener des selects
  // ne suffit pas : `_sigImpRendreTables` les recrée sans qu'aucun n'ait « changé ».
  document.getElementById("kta-sig-imp-colonne")
    .addEventListener("change", function () { _sigImpInvaliderLegende(true); });
  document.getElementById("kta-sig-imp-generer").addEventListener("click", _sigImpGenerer);

  if (prefilledFile) {
    if (labelEl) labelEl.textContent = "📦 " + prefilledFile.name;
    setTimeout(function() { _sigImpAnalyserFichier(prefilledFile); }, 0);
  }
}

// 🩸 LES ENTRÉES DE LÉGENDE SONT LIÉES AU FICHIER *ET* AU MAPPING : leur id encode catégorie et niveau
// (`_idNiveau`). Tout changement de fichier, de routage ou de colonne de niveau les périme — sinon un second
// fichier montre les niveaux du précédent. Une seule fonction pour les quatre points d'invalidation.
// ⚠️ Ne PAS invalider après une génération réussie : régénérer le même fichier (autre largeur, autre fond)
// garde les noms saisis.
function _sigImpInvaliderLegende(avecMessage) {
  if (_sigPlanLegend) {
    _sigPlanLegend = null;
    if (avecMessage) _sigLegendeReset = true;
  }
  // Nouveau fichier = écran neuf : le signal précédent est effacé aussi.
  if (!avecMessage) _sigLegendeReset = false;
  _sigImpMajEtatLegende();
}

// L'état de la légende, dit en couleur et à deux endroits. On ne remappe PAS les entrées sur les nouveaux
// ids après un changement de routage : ce serait leur inventer un sens. On rend l'effacement impossible à
// rater.
function _sigImpMajEtatLegende() {
  const btn   = document.getElementById("kta-sig-imp-legende");
  const eta   = document.getElementById("kta-sig-imp-legende-etat");
  const recap = document.getElementById("kta-sig-imp-legende-recap");
  if (btn) {
    const cleN  = (document.getElementById("kta-sig-imp-niveau") || {}).value || null;
    const cases = document.getElementById("kta-sig-imp-couleurs-niveau");
    btn.style.display = (_sigImportState && cleN && cases && cases.checked) ? "" : "none";
  }
  // Le message ne dépend PAS de la visibilité du bouton : libellés et couleurs des types intégrés partent
  // dans le plan même si la couleur par niveau a été décochée.
  let txt = "", couleur = "var(--kta-texte-3)";
  if (_sigLegendeReset) {
    txt = "⚠️ " + window.I18n.t("gen.sig.legendeReset");
    couleur = "var(--kta-avert)";
  } else {
    const n = _sigImpCompterLegende(_sigPlanLegend);
    if (n) { txt = "🏷️ " + window.I18n.t("gen.sig.legendeEdite", { n: n }); couleur = "var(--kta-interaction)"; }
  }
  [eta, recap].forEach(function (el) {
    if (!el) return;
    el.textContent = txt;
    el.style.color = couleur;
  });
}

// Compte TOUT ce qui est personnalisé (entrées, libellés, masquages, couleurs — cf. sigImport.js >
// assemblerLegendePlan), pas seulement les entrées.
function _sigImpCompterLegende(st) {
  if (!st || typeof st !== "object") return 0;
  const n = function (o) {
    return (o && typeof o === "object" && !Array.isArray(o)) ? Object.keys(o).length : 0;
  };
  return (Array.isArray(st.customEntries) ? st.customEntries.length : 0)
       + n(st.labels) + n(st.hidden) + n(st.colors) + n(st.borders);
}

async function _sigImpAnalyserFichier(file) {
  const T      = function(k, p) { return window.I18n.t(k, p); };
  const status = document.getElementById("kta-sig-imp-status");
  const btnGen = document.getElementById("kta-sig-imp-generer");
  status.style.color = "#8cb4ff";
  status.textContent = T("gen.sig.analyse");
  btnGen.disabled = true;
  // Nouveau fichier : réinitialisation SILENCIEUSE (tout l'écran est neuf).
  _sigImpInvaliderLegende(false);

  if (!window.SigImport) {
    status.textContent = T("gen.sig.moduleNonCharge");
    status.style.color = "#ff8c8c";
    return;
  }

  try {
    const { format, data } = await window.SigImport.parseFichier(file);

    // ── Refus CRS : message actionnable ──
    const crs = window.SigImport.validerCrs(data);

    // Lambert 93 : converti plutôt que renvoyé à QGIS. Conversion ANNONCÉE, compte de coordonnées
    // reprojetées affiché dans le résumé (une reprojection déplace tout le fichier).
    let _sigReproj = 0;
    if (!crs.ok && crs.code === "lambert93" && crs.convertible) {
      _sigReproj = window.SigImport.reprojeterLambert93(data);
      data.avertissements = data.avertissements || [];
      // Marqueur lu par le résumé plutôt qu'une clé i18n figée : le compte doit apparaître dans le message.
      crs.ok = true; crs.code = "lambert93-converti";
    }
    if (!crs.ok) {
      _sigImportState = null;
      document.getElementById("kta-sig-imp-step-resume").style.display = "none";
      document.getElementById("kta-sig-imp-step-map").style.display    = "none";
      document.getElementById("kta-sig-imp-step-config").style.display = "none";
      status.style.color = "#ff8c8c";
      status.innerHTML = (crs.code === "vide")
        ? T("gen.sig.err.vide")
        : T("gen.sig.err.crsProjete", {
            n:   crs.horsBornes,
            tot: crs.total,
            max: Math.round(Math.max(crs.maxAbsLat, crs.maxAbsLng))
          });
      return;
    }

    const bounds = window.SigImport.calculerBounds(data);
    const cols   = window.SigImport.analyserAttributs(data);
    _sigImportState = { file: file, format: format, data: data, bounds: bounds, colonnes: cols };

    const dLat = bounds.latMax - bounds.latMin;
    const dLng = bounds.lngMax - bounds.lngMin;
    let html = '<div><strong>' + format.toUpperCase() + '</strong> — '
             + T("gen.sig.resume", {
                 p: data.points.length, l: data.lignes.length, z: data.polygones.length
               }) + '</div>'
             + '<div style="color:var(--kta-texte-3); font-size:12px; margin-top:4px;">'
             + '📍 ' + bounds.latMin.toFixed(5) + ', ' + bounds.lngMin.toFixed(5)
             + ' → ' + bounds.latMax.toFixed(5) + ', ' + bounds.lngMax.toFixed(5)
             + ' (Δ ' + dLat.toFixed(5) + '° × ' + dLng.toFixed(5) + '°)</div>';
    // ⚠️ Au-delà du seuil d'alerte, on PRÉVIENT au lieu de refuser (le rendu reste non mesuré : on le dit,
    // sans décider à la place de l'utilisateur).
    const _nSig = (data.points||[]).length + (data.lignes||[]).length + (data.polygones||[]).length;
    if (window.SigImport.WARN_FEATURES && _nSig > window.SigImport.WARN_FEATURES) {
      html += '<div style="color:var(--kta-avert); font-size:12px; margin-top:6px; padding:6px 8px;'
            + ' background:rgba(255,179,128,0.08); border-left:3px solid rgba(255,179,128,0.55);'
            + ' border-radius:3px;">⚠️ ' + T("gen.sig.beaucoupFeatures", { n: _nSig }) + '</div>';
    }
    if (_sigReproj > 0) {
      html += '<div style="color:var(--kta-interaction); font-size:12px; margin-top:6px; padding:6px 8px;'
            + ' background:rgba(140,180,255,0.08); border-left:3px solid rgba(140,180,255,0.5);'
            + ' border-radius:3px;">📐 ' + T("gen.sig.l93Converti", { n: _sigReproj }) + '</div>';
    }
    (data.avertissements || []).forEach(function(a) {
      html += '<div style="color:var(--kta-avert); font-size:12px; margin-top:4px;">⚠️ ' + T(a) + '</div>';
    });
    document.getElementById("kta-sig-imp-resume").innerHTML = html;
    document.getElementById("kta-sig-imp-step-resume").style.display = "";

    const sel = document.getElementById("kta-sig-imp-colonne");
    sel.innerHTML = '<option value="">' + T("gen.sig.colonneAucune") + '</option>'
      + cols.map(function(c) {
          return '<option value="' + _escAttrSig(c.cle) + '">' + _escHtmlSig(c.cle)
               + ' (' + c.nbDistinctes + ')' + (c.probableType ? ' ⭐' : '') + '</option>';
        }).join("");
    if (cols.length > 0 && cols[0].probableType) sel.value = cols[0].cle;

    // Colonne du niveau présélectionnée si une colonne s'appelle sans ambiguïté « niveau » / « level » /
    // « etage » (fichiers d'un atlas découpé) : l'oubli met tout l'import sur un seul niveau sans le signaler.
    const selN = document.getElementById("kta-sig-imp-niveau");
    selN.innerHTML = '<option value="">' + T("gen.sig.niveauAucun") + '</option>'
      + cols.map(function(c) {
          return '<option value="' + _escAttrSig(c.cle) + '">' + _escHtmlSig(c.cle)
               + ' (' + c.nbDistinctes + ')</option>';
        }).join("");
    const devine = cols.find(function(c) { return /^(niveau|level|etage|étage|lvl)$/i.test(c.cle); });
    if (devine) selN.value = devine.cle;
    selN.addEventListener("change", _sigImpApercuNiveaux);
    _sigImpApercuNiveaux();

    // Le bouton n'a de sens que si des entrées seront créées (colonne de niveau ET couleurs par niveau).
    // L'affichage de l'état vit dans `_sigImpMajEtatLegende` (rafraîchie par `_sigImpInvaliderLegende`).
    const majBtnLegende = _sigImpMajEtatLegende;
    const selNiv = document.getElementById("kta-sig-imp-niveau");
    const caseCol = document.getElementById("kta-sig-imp-couleurs-niveau");
    if (caseCol) caseCol.addEventListener("change", majBtnLegende);
    // Le niveau fait partie de l'id des entrées : changer de colonne les périme (l'invalidation rafraîchit
    // l'affichage elle-même).
    if (selNiv) selNiv.addEventListener("change", function () { _sigImpInvaliderLegende(true); });
    const btnLeg = document.getElementById("kta-sig-imp-legende");
    if (btnLeg) btnLeg.addEventListener("click", function () {
      const cleN = (document.getElementById("kta-sig-imp-niveau") || {}).value || null;
      // L'utilisateur reprend la main : le signal d'invalidation n'a plus lieu d'être.
      _sigLegendeReset = false;
      // 1re ouverture préremplie avec ce qui SERA généré, sinon l'éditeur est vide.
      if (!_sigPlanLegend) {
        // Le MÊME mapping que la génération, sinon l'aperçu retombe sur la famille naturelle des géométries.
        const mp = _sigImpLireMapping();
        const entrees = window.SigImport.previsualiserEntreesNiveaux(_sigImportState.data, {
          cleNiveau: cleN, couleurParNiveau: true,
          cleType: mp.cle, mapTraces: mp.mapTraces, mapZones: mp.mapZones
        });
        _sigPlanLegend = { schemaVersion: 1, labels: {}, hidden: {}, customEntries: entrees };
      }
      _ouvrirEditeurLegendePlan({
        get: function () { return _sigPlanLegend; },
        set: function (v) { _sigPlanLegend = v; majBtnLegende(); }
      });
    });
    majBtnLegende();

    // Hauteur du canvas déduite des proportions du terrain, affichée et recalculée à chaque largeur.
    const majH = function () {
      const eW = document.getElementById("kta-sig-imp-w");
      const eH = document.getElementById("kta-sig-imp-h");
      if (!eW || !eH || !_sigImportState) return;
      const LW = parseInt(eW.value, 10) || 4000;
      // Dimensions RÉELLES, plafond de surface compris.
      const d = window.SigImport.dimensionsCanvas(_sigImportState.bounds, LW);
      eH.value = d.h;
      // On PRÉVIENT, on ne bloque pas (décision produit) : la largeur n'est pas rognée.
      const boite = document.getElementById("kta-sig-imp-canvas-alerte");
      if (boite) {
        if (!d.alerte) { boite.innerHTML = ""; }
        else {
          const grave = (d.alerte === "ram");
          const cle = grave ? "gen.sig.canvasAlerteRam" : "gen.sig.canvasAlerteIos";
          const col = grave ? "#ff8c8c" : "#ffb380";
          boite.innerHTML = '<div style="color:' + col + '; font-size:12px; margin-top:6px;'
            + ' padding:6px 8px; background:rgba(255,179,128,0.08);'
            + ' border-left:3px solid ' + col + '; border-radius:3px;">'
            + (grave ? "🛑 " : "⚠️ ")
            + T(cle, { mpx: d.mpx.toFixed(1), conseil: Math.floor(Math.sqrt(
                (window.SigImport.ALERTE_CANVAS_MPX_IOS * 1e6) * (LW / d.h))) })
            + '</div>';
        }
      }
    };
    const eWl = document.getElementById("kta-sig-imp-w");
    if (eWl) { eWl.addEventListener("input", majH); eWl.addEventListener("change", majH); }
    majH();
    document.getElementById("kta-sig-imp-step-map").style.display = "";
    _sigImpRendreTables();

    document.getElementById("kta-sig-imp-step-config").style.display = "";
    const nameEl = document.getElementById("kta-sig-imp-name");
    if (!nameEl.value) nameEl.value = file.name.replace(/\.(geojson|json|kml|kmz)$/i, "");
    btnGen.disabled = false;
    status.textContent = "";
  } catch(err) {
    _sigImportState = null;
    status.style.color = "#ff8c8c";
    const cle = String(err && err.message || "");
    status.textContent = cle.indexOf("sig.err.") === 0
      ? T(cle) + (err.crsNom ? " (" + err.crsNom + ")" : "") + (err.n ? " (" + err.n + ")" : "")
      : T("gen.sig.err.generique", { err: cle });
  }
}

// Un polygone SIG n'est pas forcément une zone (souvent un PILIER, donc une STRUCTURE) : les deux familles
// sont proposées dans le même select, en deux groupes ; le préfixe `struct:` dit à `SigImport.ingest` où
// ranger l'objet. Idem pour les tracés (front de taille = structure en polyligne).
const _SIG_TYPES = {
  points:    ["default", "pa", "pb", "pc", "pe", "ps", "salle", "chatiere", "passage", "danger", "info"],
  lignes:    ["chemin", "secondaire", "principal"],
  polygones: ["remblais", "eau", "effondrement", "inaccessible"]
};
// Structures proposées EN PLUS, par famille. Chaque géométrie peut viser toutes les familles : un polygone
// peut être une zone, un pilier, un mur ou un front de taille dessiné fermé ; une polyligne peut porter le
// contour d'une zone. Préfixe (`struct:`, `zone:`, `trace:`) = famille de rangement ; sans préfixe, famille
// naturelle de la géométrie.
const _SIG_TYPES_SUP = {
  points:    [],
  lignes:    ["struct:front-1", "struct:front-2", "struct:mur",
              "zone:remblais", "zone:eau", "zone:effondrement", "zone:inaccessible"],
  polygones: ["struct:pilier-1", "struct:pilier-2", "struct:mur",
              "struct:front-1", "struct:front-2",
              "trace:chemin", "trace:secondaire", "trace:principal"]
};
const _SIG_CAT_I18N = { points: "gen.sig.famPoints", lignes: "gen.sig.famLignes", polygones: "gen.sig.famZones" };

// Répartition par étage AVANT de générer, dès le choix de la colonne. La case « Plan multi-niveau » se coche
// toute seule : colonne choisie + case oubliée donnerait un plan à plat.
function _sigImpApercuNiveaux() {
  const box = document.getElementById("kta-sig-imp-niveau-apercu");
  const selN = document.getElementById("kta-sig-imp-niveau");
  if (!box || !selN || !_sigImportState) return;
  const cle = selN.value;
  if (!cle) { box.innerHTML = ""; return; }
  const T = function(k, p) { return window.I18n.t(k, p); };
  const compte = {};
  const scan = function(items) {
    (items || []).forEach(function(it) {
      const p = it.props || {};
      let v = null;
      for (const k in p) { if (k.toLowerCase() === cle.toLowerCase()) { v = p[k]; break; } }
      const m = (v == null) ? null : /-?\d+/.exec(String(v));
      const n = m ? parseInt(m[0], 10) : "?";
      compte[n] = (compte[n] || 0) + 1;
    });
  };
  const d = _sigImportState.data;
  scan(d.points); scan(d.lignes); scan(d.polygones);
  const cles = Object.keys(compte).sort(function(a, b) { return Number(b) - Number(a); });
  if (!cles.length) { box.innerHTML = ""; return; }
  box.innerHTML = '<div style="font-size:12px; color:var(--kta-texte-2); padding:6px 8px;'
    + ' background:rgba(140,180,255,0.08); border-left:3px solid rgba(140,180,255,0.5);'
    + ' border-radius:3px;">🏔️ ' + T("gen.sig.niveauApercu", { n: cles.length }) + ' — '
    + cles.map(function(k) { return k + ' : ' + compte[k]; }).join(' · ') + '</div>';
  // Sans multi-niveau, plan-config ne déclare pas les niveaux.
  const mlvl = document.getElementById("kta-sig-imp-mlvl");
  if (mlvl && cles.length > 1) mlvl.checked = true;
}

function _sigImpRendreTables() {
  const T   = function(k, p) { return window.I18n.t(k, p); };
  const box = document.getElementById("kta-sig-imp-map-tables");
  if (!box || !_sigImportState) return;
  const cle = document.getElementById("kta-sig-imp-colonne").value;
  if (!cle) { box.innerHTML = '<div style="color:var(--kta-texte-3); font-size:12px;">' + T("gen.sig.mapAucune") + '</div>'; return; }

  const parFam = window.SigImport.valeursParFamille(_sigImportState.data, cle);
  const catPour = { points: null, lignes: "traces", polygones: "zones" };
  let html = "";
  ["points", "lignes", "polygones"].forEach(function(fam) {
    const vals = parFam[fam] || [];
    if (vals.length === 0) return;
    const propose = catPour[fam] ? window.SigImport.proposerMapping(vals, catPour[fam]) : {};
    // Le préremplissage regarde AUSSI les structures (« pilier » → pilier-1).
    if ((_SIG_TYPES_SUP[fam] || []).length) {
      const ps = window.SigImport.proposerMapping(vals, "structures");
      Object.keys(ps).forEach(function(v) { if (!propose[v] && ps[v]) propose[v] = ps[v]; });
    }
    html += '<div style="margin-top:10px;"><div class="kta-cfg-label">' + T(_SIG_CAT_I18N[fam]) + '</div>';
    vals.forEach(function(v) {
      const sugg = propose[v] || "";
      html += '<div style="display:flex; align-items:center; gap:8px; margin-top:4px;">'
           +  '<span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:var(--kta-texte-2);" title="' + _escAttrSig(v) + '">' + _escHtmlSig(v) + '</span>'
           +  '<select class="kta-cfg-input" data-sig-fam="' + fam + '" data-sig-val="' + _escAttrSig(v) + '" style="flex:0 0 46%;">'
           +  (function() {
                const opt = function(t) {
                  const lib = t.replace(/^(struct|zone|trace):/, "");
                  return '<option value="' + t + '"' + (t === sugg ? " selected" : "") + '>' + lib + '</option>';
                };
                const zonesHtml = _SIG_TYPES[fam].map(opt).join("");
                const st = _SIG_TYPES_SUP[fam] || [];
                if (!st.length) return zonesHtml;
                // Deux groupes nommés : sinon « pilier-1 » et « remblais » se mêlent sans dire qu'ils ne
                // produisent pas le même genre d'objet.
                return '<optgroup label="' + T("gen.sig.grpZones") + '">' + zonesHtml + '</optgroup>'
                     + '<optgroup label="' + T("gen.sig.grpStructures") + '">' + st.map(opt).join("") + '</optgroup>';
              })()
           +  '</select></div>';
    });
    html += '</div>';
  });
  box.innerHTML = html || '<div style="color:var(--kta-texte-3); font-size:12px;">' + T("gen.sig.mapVide") + '</div>';

  // 🩸 Changer le routage change les id des entrées de légende : celles déjà éditées seraient perdues sans
  // explication. On repart d'une légende vierge et le bouton le dit.
  box.querySelectorAll("select[data-sig-fam]").forEach(function (s) {
    s.addEventListener("change", function () {
      _sigImpInvaliderLegende(true);
    });
  });
}

function _escHtmlSig(s) { return window.ktaEsc(s); }
function _escAttrSig(s) { return window.ktaEsc(s); }

// Lecture du mapping, partagée : l'aperçu des entrées de légende doit rejouer EXACTEMENT le routage de la
// génération, sinon il annonce des tracés et des zones là où l'utilisateur a demandé des structures.
function _sigImpLireMapping() {
  const cle = (document.getElementById("kta-sig-imp-colonne") || {}).value || null;
  const mapTags = {}, mapTraces = {}, mapZones = {};
  document.querySelectorAll("#kta-sig-imp-map-tables select[data-sig-fam]").forEach(function(s) {
    const fam = s.getAttribute("data-sig-fam");
    const val = s.getAttribute("data-sig-val");
    if (fam === "points")         mapTags[val]   = s.value;
    else if (fam === "lignes")    mapTraces[val] = s.value;
    else if (fam === "polygones") mapZones[val]  = s.value;
  });
  return { cle: cle, mapTags: mapTags, mapTraces: mapTraces, mapZones: mapZones };
}

async function _sigImpGenerer() {
  const T      = function(k, p) { return window.I18n.t(k, p); };
  const status = document.getElementById("kta-sig-imp-status");
  const btnGen = document.getElementById("kta-sig-imp-generer");
  if (!_sigImportState) return;

  const name = (document.getElementById("kta-sig-imp-name").value || "").trim();
  if (!name) {
    status.style.color = "#ff8c8c";
    status.textContent = T("gen.sig.err.nomRequis");
    return;
  }

  const _m = _sigImpLireMapping();
  const cle = _m.cle, mapTags = _m.mapTags, mapTraces = _m.mapTraces, mapZones = _m.mapZones;

  btnGen.disabled = true;
  btnGen.textContent = T("gen.sig.generation");
  status.style.color = "#8cb4ff";
  status.textContent = T("gen.sig.generation");

  // Déclaré AVANT le try : le finally doit pouvoir le retirer, même en cas d'échec.
  let v2Overlay = null;
  try {
    // Barre de progression du tuilage (même overlay et clés que l'import GPX).
    v2Overlay = document.createElement("div");
    v2Overlay.id = "kta-sig-imp-v2-progress";
    v2Overlay.className = "kta-modal-overlay";
    v2Overlay.style.zIndex = "100000";
    v2Overlay.innerHTML =
      '<div class="kta-modal">' +
        '<div class="kta-modal-icon">🧱</div>' +
        '<div class="kta-modal-titre">' + T("gen.v2prog.titreImp") + '</div>' +
        '<div class="kta-modal-texte">' +
          '<div id="kta-sig-v2-progress-text" style="margin-bottom:10px;">' + T("gen.v2prog.init") + '</div>' +
          '<div style="background:rgba(255,255,255,0.06); border-radius:6px; height:8px; overflow:hidden;">' +
            '<div id="kta-sig-v2-progress-bar" style="height:100%; width:0%; background:#8cb4ff; transition:width 0.2s;"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(v2Overlay);
    const onTilingProgress = function(done, total, currentZ) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const txt = document.getElementById("kta-sig-v2-progress-text");
      const bar = document.getElementById("kta-sig-v2-progress-bar");
      if (txt) txt.textContent = T("gen.v2prog.niveau", { z: currentZ, done: done, total: total, pct: pct });
      if (bar) bar.style.width = pct + "%";
    };

    const result = await window.SigImport.genererZipMyktamap({
      normalise:    _sigImportState.data,
      bounds:       _sigImportState.bounds,
      planName:     name,
      planVersion:  (document.getElementById("kta-sig-imp-version").value || "v1").trim(),
      planAuthor:   (document.getElementById("kta-sig-imp-author").value || "").trim(),
      tags:         _lireTagsChamp("kta-sig-imp-tags"),
      canvasWidth:  parseInt(document.getElementById("kta-sig-imp-w").value, 10) || 4000,
      // Pas de `canvasHeight` : genererZipMyktamap déduit la hauteur du terrain.
      onProgress:   onTilingProgress,
      canvasColor:  (document.querySelector('input[name="sig_imp_color"]:checked') || {}).value || "sepia",
      multiLevel:   document.getElementById("kta-sig-imp-mlvl").checked,
      layerLabel:   name,
      mapping: { cleType: cle, mapTags: mapTags, mapTraces: mapTraces, mapZones: mapZones,
                 // La colonne du niveau voyage avec le mapping.
                 cleNiveau: (document.getElementById("kta-sig-imp-niveau") || {}).value || null,
                 // Types de légende par étage (case cochée par défaut).
                 couleurParNiveau: !!(document.getElementById("kta-sig-imp-couleurs-niveau") || {}).checked,
                 // Entrées renommées/recolorées dans l'éditeur ; sinon `ingest` les fabrique.
                 customEntries: (_sigPlanLegend && _sigPlanLegend.customEntries) || null,
                 // État COMPLET pour ce qu'`ingest` ne regarde pas (libellés des types intégrés, masquages,
                 // couleurs, entrées manuelles). `customEntries` reste : `ingest` y retrouve le libellé
                 // édité d'une entrée par niveau au moment où il la fabrique.
                 planLegend: _sigPlanLegend || null }
    });

    const url = URL.createObjectURL(result.blob);
    const a   = document.createElement("a");
    a.href = url;
    a.download = "plan_" + name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() + "_from_sig.zip";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    status.style.color = "#6ce28a";
    status.textContent = T("gen.sig.zipGenere", {
      p: result.stats.points, l: result.stats.roads, z: result.stats.zones
    });
  } catch(err) {
    status.style.color = "#ff8c8c";
    const cleErr = String(err && err.message || "");
    status.textContent = cleErr.indexOf("sig.err.") === 0
      ? T(cleErr)
      : T("gen.sig.err.generique", { err: cleErr });
  } finally {
    // 🩸 Overlay de progression retiré dans le finally, donc aussi en cas d'échec : sinon la popup « tuiles
    // V2 en cours » reste figée après le téléchargement.
    if (v2Overlay && v2Overlay.parentNode) v2Overlay.remove();
    btnGen.disabled = false;
    btnGen.textContent = T("gen.imp.genererBtn");
  }
}

window.afficherImporterSig = _afficherImporterSig;

// GeoTIFF déposé depuis l'accueil, jumelle de `afficherImporterSig`.
// ⚠️ Ce n'est PAS une modale d'import : KMZ, GPX et SIG produisent un plan entier ; un GeoTIFF est une
// image de fond déjà calée. On ouvre le Générateur avec l'image, le géoréf et l'échelle remplis.
// Sans cette route, un .tif déposé sur l'accueil serait refusé (« archive .zip attendue », homeLoader.js).
function _afficherImporterGeoTiff(fichier) {
  if (!fichier) return false;
  // Le Générateur est un toggle (appelé ouvert, il se FERME) : on ne l'ouvre que s'il est absent.
  if (!document.getElementById("kta-planner-modal") && typeof afficherPlanner === "function") {
    afficherPlanner();
  }
  const base = document.getElementById("pl_baseImage");
  if (!base) return false;
  try {
    const dt = new DataTransfer();
    dt.items.add(fichier);
    base.files = dt.files;
    base.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (e) {
    console.warn("[Planner GeoTIFF] injection depuis l'accueil impossible :", e);
    return false;
  }
}
window.afficherImporterGeoTiff = _afficherImporterGeoTiff;

// Image déposée sur « Charger un plan » : c'est l'IMAGE DE FOND d'un plan à créer. Même injection que le
// GeoTIFF (sans géoréf), puis arrivée sur l'étape « Nom », préremplie avec le nom du fichier et sélectionnée.
// Un nom déjà saisi n'est jamais écrasé.
function _afficherImporterImage(fichier) {
  if (!_afficherImporterGeoTiff(fichier)) return false;
  const nom = document.getElementById("pl_name");
  if (nom && !nom.value.trim()) {
    const point = fichier.name.lastIndexOf(".");
    nom.value = (point > 0 ? fichier.name.slice(0, point) : fichier.name).slice(0, 80);
  }
  if (_wizActif) {
    const i = _wizPages.findIndex(function(p) { return p.def.id === "identite"; });
    if (i >= 0) { _wizPageEntree = "identite"; _wizAfficherPage(i); }
  }
  if (nom) { try { nom.focus(); nom.select(); } catch (e) { /* champ masqué : pas de focus */ } }
  return true;
}
window.afficherImporterImage = _afficherImporterImage;
