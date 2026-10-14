/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

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
  plaque:   "icon/plaque.png",
  portail:  "icon/portail.png",   // 🆕 v1.59.0 — liaison inter-plan
  // 🆕 v1.41.0 D — Point d'entrée du plan (Vue OSM × Mode Secours).
  //    SVG inline → pas de fichier PNG nécessaire (cf js/map.js TAGS_BUILTIN).
  entree_plan: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' +
      '<circle cx="25" cy="25" r="23" fill="#f4c542" stroke="#1a1f2e" stroke-width="2.5"/>' +
      '<rect x="17" y="13" width="16" height="26" fill="#1a1f2e" rx="1"/>' +
      '<rect x="19" y="15" width="12" height="22" fill="#f4c542" rx="0.5"/>' +
      '<circle cx="28.5" cy="26" r="1.5" fill="#1a1f2e"/>' +
    '</svg>'
  )
};

const PLANNER_EDITOR_JSON   = JSON.stringify({ type: "editor", version: 1, data: [] }, null, 2);
const PLANNER_SYSTEME_TAGS  = ["default", "track"];

let _imageLayerCount   = 0;
let _dataLayerCount    = 0;
let _iconRowCount      = 0;
let _plannerOrigAssets = {};
// 📄 v1.71.0 — PDF Histoire MULTIPLES du générateur (cf section 📖 du form)
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

// 🏷️ v1.82.0 — état de légende propre à l'écran « Convertir depuis SIG ».
// Séparé de `_plannerPlanLegend` : les deux écrans peuvent être utilisés dans
// la même session, mélanger leurs états ferait fuiter les entrées de l'un
// dans le plan de l'autre.
let _sigPlanLegend = null;
// 🏷️ v1.83.1 — une invalidation de légende à signaler jusqu'à la prochaine
// édition. Un booléen plutôt qu'un texte posé dans le DOM : `_sigImpMajEtat
// Legende` est rappelée par plusieurs chemins (changement de niveau, de
// colonne, de routage) et écrasait le message aussitôt affiché — d'où l'ordre
// d'attachement des listeners dont dépendait l'ancienne version.
let _sigLegendeReset = false;

// 🆕 v1.17.0 — Clé localStorage pour la persistance sticky du mode Simple/
// Avancé du Générateur. Valeurs : "simple" (default) | "avance". Lu au boot
// de la modale via _lirePlannerMode. Forcé à "avance" en mode Modifier
// (impossible de simplifier l'édition d'un plan existant sans risquer de
// perdre customs / dataLayers / imageLayers / icons custom).
// 🏷️ 16/09/2026 — lit un champ d'étiquettes (virgules) et le normalise par
// LA fonction de l'app (`PlanRegistry.normaliserTags` : trim, dédoublonnage
// insensible à la casse, 12 max, 24 caractères). Utilisé par le Générateur
// et ses trois convertisseurs KMZ / GPX / SIG : un seul chemin de sortie.
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
            <p class="kta-planner-hint" style="margin:6px 0 10px 0; font-size:11.5px; color:#8892a4;">${window.I18n.t("gen.vierge.limites")}</p>

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
            <div id="pl_vierge_status" style="margin-top:8px; font-size:12px; color:#8892a4; min-height:18px;"></div>
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
            <div id="pl_geo_B_estime_badge" class="kta-planner-info" style="display:none; color:#f4c542; margin:4px 0 0;">≈ ${window.I18n.t("config.georef.estimeBadge")}</div>
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
          <div id="pl_geo_status" style="font-size:12px; color:#8892a4; margin:6px 2px 0; min-height:18px;"></div>
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
    window.attacherGpsValidationCombo(
      document.getElementById("pl_geo_C_coords"),
      { errorEl: document.getElementById("pl_geo_C_err") }
    );
  }

  // 🧭 v1.76.1 — B ESTIMÉ au Générateur : A + échelle (#pl_scale) + Nord
  // (#pl_northOffset, 0 par défaut) + dimensions de l'image chargée
  // (#pl_width/#pl_height). Mêmes règles que côté ⚙️ Réglages : refus
  // explicites, récap de confirmation, badge « estimé » informatif.
  // (Pas de flag persisté ici : le Générateur écrit plan.georef au ZIP via
  // _geoB — le champ `estimated` n'y est pas conservé, dette notée BACKLOG.)
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
      // 🧙 v1.72.1 : le jeu de pages dépend du mode → reconstruire
      // On reste sur la page courante si le nouveau mode l'a aussi (arrivée directe sur « Nom »).
      if (_wizActif) {
        const courante = _wizPages[_wizIdx] ? _wizPages[_wizIdx].def.id : "accueil";
        _wizConstruirePages(); _wizSkip = {};
        const i = Math.max(0, _wizPages.findIndex(function(p) { return p.def.id === courante; }));
        _wizIdx = i; _wizMaxVisite = i; _wizAfficherPage(i);
      }
    });
  });

  // 🧙 v1.72.1 — Assistant (wizard) : injecté APRÈS tous les binds du form
  _wizInit();

  // 🚨 Q59 (audit ergonomie 13/09/2026) : un assistant qui peut compter 11
  // pages se fermait d'un clic sur le fond — le geste le plus facile à faire
  // par accident à une main — sans confirmation ni brouillon. Le fond ne
  // ferme plus ; ✕ et Annuler demandent confirmation dès qu'un champ a bougé.
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
  // Clic sur le fond : inerte (avant : fermeture immédiate, tout perdu).

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

  // ═══════════════════════════════════════════════════════════════════════
  // 🗺️ GEOTIFF — déposer un .tif calé, ne PAS ressaisir le géoréf
  // ═══════════════════════════════════════════════════════════════════════
  // Un plan scanné puis calé dans QGIS ressort en GeoTIFF : l'image ET son
  // calage dans le même fichier. Avant, l'utilisateur re-saisissait à la main
  // les deux points GPS qu'il venait de poser dans QGIS — et aucun navigateur
  // de bureau ne décodant le TIFF, l'image elle-même n'arrivait pas.
  //
  // ⚠️ CE HANDLER DOIT ÊTRE ENREGISTRÉ EN PREMIER. Au niveau de la cible, les
  // écouteurs s'exécutent dans leur ordre d'enregistrement : en se plaçant
  // avant `_bindUploadLabel` et avant l'auto-détection des dimensions, celui-ci
  // peut couper la propagation (`stopImmediatePropagation`) pour que les
  // handlers standards ne voient JAMAIS le .tif — `_lireImageDimensions`
  // échouerait dessus et afficherait une erreur trompeuse.
  //
  // Une fois le TIFF converti en PNG, on le RÉ-INJECTE dans le même input et on
  // relance l'événement (même technique que `_genererImageVierge`) : le flux
  // existant — dimensions, tuilage V2, ZIP — reprend sans rien savoir du TIFF.
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
        // ─── L'image : PNG ré-injecté comme un upload normal ───
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

        // ─── Le calage : les 6 champs du géoréf, remplis pour de bon ───
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

        // 📏 L'ÉCHELLE AUSSI — elle est DANS le fichier, ne pas la poser
        // laissait le plan sortir avec le défaut d'usine (4,9 px/m) alors que
        // son géoréf, lui, était juste. `calculerCoherenceEchelleGeoref`
        // compare précisément les deux et affichait « Incohérence échelle
        // critique, +73,6 % d'écart » sur un plan pourtant parfaitement calé :
        // l'app dénonçait sa propre omission, et l'utilisateur ne pouvait pas
        // savoir lequel des deux chiffres croire.
        // `scale` est en PIXELS PAR MÈTRE (cf. `utils.js > scaleGps = 1 /
        // metresParPixel`), d'où l'inverse. L'écart tombe à 0 % par construction.
        // ⚠️ En EPSG:4326 l'unité est le degré : `metresParPixel` vaut alors
        // `null` et on ne touche PAS au champ — écrire une échelle en degrés
        // par pixel serait pire que le défaut.
        if (res.metresParPixel > 0) {
          const pxParM = 1 / res.metresParPixel;
          // 3 décimales : au-delà, on affiche du bruit de virgule flottante
          // dans un champ que l'utilisateur relit.
          put("pl_scale", Math.round(pxParM * 1000) / 1000);
        }
        // 📐 Le calage d'un GeoTIFF est nord en haut, sans rotation : la
        // similitude 2 points le décrit EXACTEMENT. Un point C hérité d'un
        // plan précédent ne ferait qu'introduire une déformation — on le vide.
        ["pl_geo_C_x", "pl_geo_C_y", "pl_geo_C_coords"].forEach(function(id) { put(id, ""); });

        // 🐛 14/09/2026 (KARMA : « ça m'ouvre juste le générateur, sans
        // préremplir ») — TOUT ÉTAIT REMPLI, RIEN N'ÉTAIT VISIBLE. Les six
        // champs du géoréf ET l'échelle vivent dans des blocs
        // `data-planner-advanced="1"`, que le CSS masque tant que le corps
        // porte `data-planner-mode="simple"` — le mode par défaut au premier
        // lancement, et le mode mémorisé de qui n'a jamais basculé. On écrivait
        // donc dans des champs que personne ne pouvait voir.
        //
        // On bascule en Avancé, et ON LE DIT : changer l'écran sous les yeux de
        // l'utilisateur sans un mot est le défaut qu'on corrige ailleurs.
        // Bascule PONCTUELLE : `_appliquerPlannerMode` ne touche pas la
        // préférence mémorisée (seul un clic sur le switcher l'écrit), donc le
        // prochain plan sans GeoTIFF rouvrira en Simple comme avant.
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
        // Les erreurs du module sont des CLÉS i18n. `detail` porte le fait
        // concret (« JPEG », « EPSG:32631 ») — c'est lui qui rend le refus
        // actionnable : l'utilisateur sait quoi changer dans QGIS.
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
  // 📖 v1.37.0 — PDF Histoire (générateur avancé). Sync nom uploaded +
  // bouton "🗑 Retirer" qui marque l'intention de retirer (data-retire=1)
  // 📄 v1.71.0 — MULTI-PDF Histoire : liste vivante {name, file|null, fromZip}.
  // file = File uploadé ; fromZip = ré-embarqué depuis _plannerOrigAssets[name]
  // (mode Modifier). Retirer une ligne = ne pas l'embarquer, simplement.
  _bindUploadLabel("pl_histoirePdf", "pl_histoirePdf_nom");
  (function _bindHistoirePdfControls() {
    const inp = document.getElementById("pl_histoirePdf");
    if (!inp) return;
    inp.addEventListener("change", function() {
      const fichiers = Array.prototype.slice.call(inp.files || []);
      fichiers.forEach(function(f) {
        if (!/\.pdf$/i.test(f.name || "")) return;
        // dédoublonnage par nom : re-choisir un fichier le REMPLACE
        _plannerHistPdfs = _plannerHistPdfs.filter(function(e) { return e.name !== f.name; });
        _plannerHistPdfs.push({ name: f.name, file: f, fromZip: false });
      });
      try { inp.value = ""; } catch(e) {}
      _renderHistPdfListe();
    });
  })();

  // Auto-détection des dimensions du plan depuis l'image principale uploadée.
  // Met à jour les champs hidden pl_width / pl_height + le display visuel
  // (avec warnings rouges si dimensions > 10000 px ou taille > 30 MB).
  document.getElementById("pl_baseImage").addEventListener("change", function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    _lireImageDimensions(file).then(function(dims) {
      // 🐛 v1.76.1 — refus FRANC au-delà de la limite physique des décodeurs
      // (Chrome/Skia : 32 767 px par côté). Avant, on échouait plus loin avec
      // un « non décodable » cryptique (PC) ou un crash mémoire (mobile).
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
    // 🧱 V2 : revue de la visibilite de la checkbox V2 (mode Nouveau l'expose
    // seulement apres upload d'une image source).
    _majVisibiliteCheckboxV2();
  });

  // 🏗️ v162 : toggle visible/hidden des champs Niveau (image layers) selon
  // l'etat de la case pl_multiLevel. Cache si plan single-level (pas pertinent),
  // affiche si plan multi-niveau (l'user peut tagger chaque image layer).
  const mlCbBind = document.getElementById("pl_multiLevel");
  // 📉 v1.83.0 — les champs de profondeur suivent la case multi-niveau.
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
        _plannerZipStatus(window.I18n.t("gen.router.kmzIndispo"), true);
      }
    } else if (lower.endsWith(".gpx")) {
      if (typeof _afficherImporterGpx === "function") {
        _afficherImporterGpx(f);
      } else {
        _plannerZipStatus(window.I18n.t("gen.router.gpxIndispo"), true);
      }
    } else if (lower.endsWith(".geojson") || lower.endsWith(".json") || lower.endsWith(".kml")) {
      // 🗺️ v1.74.0 — Import SIG. ⚠️ `.json` est AMBIGU (config, session,
      // calque de données…) : on route quand même vers le panneau SIG, c'est
      // le parser qui tranchera au contenu et refusera proprement si ce n'est
      // pas du GeoJSON (message `sig.err.pasDuGeojson`).
      if (typeof _afficherImporterSig === "function") {
        _afficherImporterSig(f);
      } else {
        _plannerZipStatus(window.I18n.t("gen.router.sigIndispo"), true);
      }
    } else if (window.TiffGeoref && window.TiffGeoref.estTiff(f)) {
      // 🗺️ GEOTIFF DEPOSE SUR LA ZONE HABITUELLE. C'est le geste naturel —
      // et sans cette branche il tombait dans le `else` ci-dessous, donc un
      // « mauvaise extension » alors que la fonction existe deux champs plus bas.
      //
      // Un .tif n'ouvre PAS de panneau d'import (contrairement au KMZ/GPX/SIG,
      // qui produisent un plan entier) : c'est une IMAGE DE FOND, qui plus est
      // déjà calée. On l'injecte donc dans `pl_baseImage` et l'écouteur GeoTIFF
      // fait le reste — décodage, PNG, remplissage du géoréf. Aucune logique
      // dupliquée : un second chemin dériverait du premier.
      //
      // ⚠️ On ne force PAS `_plannerMode` : déposer un GeoTIFF en mode
      // « Modifier » est légitime (remplacer le fond d'un plan existant).
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
// 🧙 v1.72.1 — ASSISTANT DE CRÉATION (wizard, topo KARMA « installeur
// style Windows » — décisions 1:a 2:a 3:a)
// =========================
// COUCHE DE PRÉSENTATION pure au-dessus du formulaire existant : les
// `.kta-aide-section` du corps deviennent les PAGES (mêmes IDs de champs,
// même _genererZip, même préremplissage ZIP). L'assistant ne fait que
// montrer/masquer, valider à chaque « Suivant », et construire le RÉSUMÉ
// en lisant les champs. Toggle « 🗒️ Tout afficher » = comportement
// historique (une page), persisté LS.
const WIZ_LS_KEY = "myktamap_planner_wizard_v1";   // "0" = tout afficher
let _wizActif = true;
let _wizSections = [];   // les .kta-aide-section du corps, dans l'ordre DOM
let _wizPages = [];      // pages actives selon le mode
let _wizIdx = 0;
let _wizMaxVisite = 0;
let _wizSkip = {};       // pageId → true (marquage « passé »)

// Métadonnées par section (ordre DOM). `simple` = présente en mode Simple.
// Page d'arrivée quand l'assistant ne s'ouvre pas sur l'accueil (image déposée sur « Charger un plan » → « Nom ») :
// le choix Simple/Avancé y est montré aussi, sinon il n'apparaît jamais (13/10/2026, retour KARMA).
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
  // 1er nœud texte utile (le titre peut contenir des boutons « Ajouter »)
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

  // Sections : seule celle de la page courante est visible
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

// ── RÉSUMÉ : l'anti-oubli. État lu dans les CHAMPS, pas dans la navigation. ──
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
  // Avertissements — informer, jamais brider
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

// Bascule assistant ↔ tout afficher (décision 2:a — les deux vivent)
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
    // Tout afficher = comportement historique intégral
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

// Init : injecte la chrome (steps + nav + résumé + toggle) puis applique.
function _wizInit() {
  const corps = document.getElementById("kta-planner-corps");
  if (!corps) return;
  _wizActif = _wizEstActifLs();

  // Barre d'étapes — sous le hint du mode
  const hint = document.getElementById("kta-planner-mode-hint");
  const steps = document.createElement("div");
  steps.id = "kta-wiz-steps";
  if (hint && hint.parentNode) hint.parentNode.insertBefore(steps, hint.nextSibling);

  // Page résumé — avant le bloc erreur
  const err = document.getElementById("kta-planner-erreur");
  const resume = document.createElement("div");
  resume.id = "kta-wiz-resume";
  resume.className = "kta-aide-section kta-pl-col-full";
  resume.style.display = "none";
  if (err && err.parentNode) err.parentNode.insertBefore(resume, err);

  // Nav — dans la rangée d'actions existante (avant Annuler)
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

  // Toggle 🗒️/🧙 — à côté du switcher de mode
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

// =========================
// \U0001F195 v1.17.0 \u2014 L\u00c9GENDE PLAN-LEVEL
// =========================
// Ouvre l'éditeur LegendCustomization en mode "édition plan-level" via le
// pattern de swap session ↔ plan. Étapes :
//   1. Sauvegarde de l'état session courant
//   2. Charge _plannerPlanLegend (ou état vide) dans la session
//   3. Ouvre l'éditeur (qui mute la session)
//   4. Au close : capture session courante → _plannerPlanLegend
//   5. Restore la session originelle
//   6. Refresh le status display
// 🏷️ v1.82.0 — `etat` optionnel : { get, set }. Sans lui, la fonction opère
// sur `_plannerPlanLegend` comme avant (générateur de plans). Avec, elle
// travaille sur l'état de l'appelant — c'est ce qui permet à l'écran
// « Convertir depuis SIG » de rouvrir CE MÊME éditeur sur SES entrées.
// KARMA : « légende custom via SIG, obligé de repasser ensuite en génération
// normale pour renommer les entrées custom ». Écrire un second éditeur pour
// ça aurait été la dette classique : deux UI pour le même geste.
function _ouvrirEditeurLegendePlan(etat) {
  const _lire  = (etat && etat.get) ? etat.get : function () { return _plannerPlanLegend; };
  const _ecrire = (etat && etat.set) ? etat.set : function (v) { _plannerPlanLegend = v; };
  if (!window.LegendCustomization || typeof window.LegendCustomization.ouvrirEditeur !== "function") {
    window.ktaAlerte(window.I18n.t("gen.legende.moduleIndispo"), { type: "erreur" });
    return;
  }
  const LC = window.LegendCustomization;
  // Étape 1 : capture de la session courante (pour la restaurer après édition)
  let savedSession = null;
  if (typeof LC.getSessionState === "function") {
    try { savedSession = LC.getSessionState(); } catch(e) { savedSession = null; }
  }
  // 🐛 v1.76.1 (annexe 6, audit 06/08) — SUSPENDRE la persistance pendant le
  // swap : sans ça, chaque mutation dans l'éditeur écrivait la légende du
  // PLAN dans le slot de SESSION du plan couramment chargé (entrées cust-…
  // fantômes retrouvées en session par KARMA).
  if (typeof LC.suspendPersist === "function") LC.suspendPersist(true);
  // Étape 2 : charge le state du plan en cours d'édition dans la session
  if (typeof LC.loadSessionState === "function") {
    try { LC.loadSessionState(_lire() || null); } catch(e) {
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
      _ecrire(_plannerLegendStateNormalize(editedState));
      // Étape 5 : restore de la session originelle
      if (typeof LC.loadSessionState === "function") {
        try { LC.loadSessionState(savedSession || null); } catch(e) {
          console.warn("[Planner] Restore session échec :", e);
        }
      }
      // 🐛 v1.76.1 (annexe 6) — réactive la persistance APRÈS le restore de
      // la vraie session (dans un finally implicite : ce onClose est le seul
      // chemin de sortie de l'éditeur).
      if (typeof LC.suspendPersist === "function") LC.suspendPersist(false);
      // Étape 6 : refresh status display
      _plannerLegendStatus();
    }
  });
}

// Normalise un state : retourne null si vide (zéro override), sinon objet
// sérialisable propre. Évite d'écrire un customLegend tout vide dans le
// plan-config.json (pollution inutile + cache PWA bumpé pour rien).
// 🐛 v1.76.0 (F3) — Absorbe la légende embarquée dans un calque de données
// importé, dans la légende du plan en cours de génération.
//
// RÈGLE DE CONFLIT : l'existant GAGNE, toujours. Une entrée déjà définie dans
// le plan n'est jamais écrasée par celle d'un calque importé ; on ajoute
// seulement ce qui manque. C'est le choix non destructif : réimporter deux
// fois le même calque est sans effet, et un calque ne peut pas repeindre en
// silence la légende que l'auteur du plan a construite. Ce qui est écarté est
// journalisé — un conflit doit être visible, pas deviné.
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
    // La section « 🏷️ Légende du plan » doit refléter tout de suite qu'elle
    // n'est plus vide, sinon l'utilisateur croit que rien n'a été repris.
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
  // 🎨 v1.76.0 — `colors` (override de couleur des types built-in) compte
  // comme une personnalisation à part entière. Sans cette ligne, un plan dont
  // la SEULE personnalisation serait des couleurs choisies se ferait
  // normaliser à `null` et n'emporterait rien dans son plan-config.
  const colors  = state.colors        || {};
  const hasLabels  = Object.keys(labels).length  > 0;
  const hasHidden  = (Array.isArray(hidden) ? hidden.length : Object.keys(hidden).length) > 0;
  const hasColors  = Object.keys(colors).length  > 0;
  const hasBorders = Object.keys(state.borders || {}).length > 0;   // 🎨 v1.76.1
  const hasCustoms = Array.isArray(customs) && customs.length > 0;
  if (!hasLabels && !hasHidden && !hasColors && !hasBorders && !hasCustoms) return null;
  return state;
}

// Met à jour le status display de la section légende plan-level.
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
// =========================
// CHARGER ZIP POUR MODIFICATION
// =========================
async function _chargerZipModifier(file) {
  _plannerZipStatus(window.I18n.t("gen.zipModif.extraction"), false);
  try {
    if (typeof JSZip === "undefined") throw new Error(window.I18n.t("gen.err.jszipManquant"));

    // 🆕 v1.42.1 — Kill-switch anti-fuite aussi côté générateur. Si l'attaquant
    // tente de modifier un ZIP révoqué via le générateur (= changer 1 truc + ré-exporter
    // pour propager une version dérivée), on bloque dès l'import. L'attaquant devra
    // décompresser le ZIP manuellement + tout refaire à la main pour rester actif.
    // Friction max sans perdre en simplicité côté users légitimes (même UX que loader).
    if (window.PlanDenylist && typeof window.PlanDenylist.isPlanDenied === "function") {
      try {
        const denyCheck = await window.PlanDenylist.isPlanDenied(file);
        if (denyCheck && denyCheck.denied) {
          console.warn("[Planner] ZIP refusé (denylist) :", denyCheck.sha256, "- raison :", denyCheck.reason);
          _plannerZipStatus(window.I18n.t("gen.zipModif.revoque"), true);
          window.PlanDenylist.showDeniedModal(denyCheck, null);
          return;  // STOP : pas d'extraction, formulaire intact
        }
      } catch(eDeny) {
        // Fail-safe : log mais ne bloque pas (cf doctrine v1.42.0)
        console.warn("[Planner] Check denylist échec — modification autorisée :", eDeny.message);
      }
    }

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

    if (!planConfigFile) throw new Error(window.I18n.t("gen.zipModif.noPlanConfig"));
    const config = JSON.parse(await planConfigFile.text());
    _preRemplirFormulaire(config);
    _plannerZipStatus(window.I18n.t("gen.zipModif.charge", { name: file.name }), false);
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
  sv("pl_tags",    Array.isArray(plan.tags) ? plan.tags.join(", ") : "");   // 🏷️ 16/09/2026
  sv("pl_fond",    ["noir", "blanc", "gris"].indexOf(plan.fondConseille) >= 0 ? plan.fondConseille : "");   // 🎨 07/10/2026
  sv("pl_width",   plan.imageWidth  || "");
  sv("pl_height",  plan.imageHeight || "");
  // 07/10/2026 (KARMA) : un ZIP rechargé donne aussi ses dimensions au plan vierge (pour régénérer un fond aux mêmes
  // dimensions — sinon 4000 × 4000 par défaut et tout se décalait).
  if (plan.imageWidth)  sv("pl_vierge_w", plan.imageWidth);
  if (plan.imageHeight) sv("pl_vierge_h", plan.imageHeight);
  sv("pl_startX",  t.startX        ?? 0);
  sv("pl_startY",  t.startY        ?? 0);
  sv("pl_scale",   t.scale         ?? 4.9);
  // 🧭 v1.37.0 — Pré-remplissage Nord depuis plan.northOffsetDeg (default 0
  // si champ absent → rétrocompat stricte plans v1.36.x).
  sv("pl_northOffset", (plan.northOffsetDeg != null && Number.isFinite(Number(plan.northOffsetDeg))) ? plan.northOffsetDeg : 0);

  // 📄 v1.71.0 — Pré-remplissage MULTI depuis plan.histoirePdfs (tableau)
  // avec repli sur plan.histoirePdf (chaîne unique, plans anciens). Chaque
  // entrée = ré-embarquée depuis _plannerOrigAssets sauf si retirée.
  _plannerHistPdfs = [];
  const _histSources = Array.isArray(plan.histoirePdfs) && plan.histoirePdfs.length
    ? plan.histoirePdfs
    : (plan.histoirePdf ? [plan.histoirePdf] : []);
  _histSources.forEach(function(chemin) {
    const base = String(chemin).split("/").pop();
    if (base) _plannerHistPdfs.push({ name: base, file: null, fromZip: true });
  });
  _renderHistPdfListe();

  // 🏗️ Multi-niveau : pre-coche la case si le plan-config importé contient
  // `plan.multiLevel: true`. Sinon laisse decochee (defaut HTML). Absence
  // du champ = false implicite (retro-compat plans v147 et avant).
  const mlEl = document.getElementById("pl_multiLevel");
  if (mlEl) mlEl.checked = (plan.multiLevel === true);
  // 📉 v1.83.0 — relire les profondeurs d'un plan qu'on rouvre pour le
  // modifier : on deduit le niveau 0 et le pas de la table enregistree,
  // sinon le formulaire proposerait les defauts et ecraserait la saisie.
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

  // 🆕 v1.17.0 — Légende plan-level : pre-fill depuis plan.customLegend si
  // présent dans le ZIP source. Sinon null (= cascade défaut MKM). Refresh
  // status display + bascule en Avancé (mode Modifier le force déjà mais
  // on appelle _appliquerPlannerMode pour sync l'UI + masquer le switcher).
  _plannerPlanLegend = (plan.customLegend && typeof plan.customLegend === "object")
                        ? _plannerLegendStateNormalize(plan.customLegend)
                        : null;
  if (typeof _plannerLegendStatus === "function") _plannerLegendStatus();
  if (typeof _appliquerPlannerMode === "function") _appliquerPlannerMode("avance");
  // 🧙 v1.72.1 — ZIP importé → wizard reconstruit en Avancé (pages toutes
  // pré-remplies), atterrissage sur l'Identité : l'user ne fait que RÉVISER.
  if (_wizActif) {
    _wizConstruirePages();
    _wizIdx = 0; _wizSkip = {};
    _wizMaxVisite = _wizPages.length - 1;   // tout est visitable (prérempli)
    _wizAfficherPage(1);
  }

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
    // 📐 v1.73.0 : pointC optionnel
    const gC = plan.georef.pointC || null;
    sv("pl_geo_C_x", gC && gC.x != null ? gC.x : "");
    sv("pl_geo_C_y", gC && gC.y != null ? gC.y : "");
    sv("pl_geo_C_coords", gC ? fmt(gC.lat, gC.lng) : "");
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
    ilList.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.imgLayers.vide") + '</p>';

  // Calques données (sans editor)
  const dlList = document.getElementById("pl_dataLayers_list");
  if (dlList) { dlList.innerHTML = ""; _dataLayerCount = 0; }
  (config.dataLayers || []).filter(function(l) { return l.id !== "editor"; })
    .forEach(function(l) { _ajouterDataLayer(l); });
  if (dlList && !dlList.querySelector(".kta-planner-layer-item"))
    dlList.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.dataLayers.vide") + '</p>';

  // Icônes
  const icList = document.getElementById("pl_icons_list");
  if (icList) { icList.innerHTML = ""; _iconRowCount = 0; }
  Object.entries(config.icons || {}).forEach(function(e) {
    _ajouterIconRow(e[0], e[1], null, PLANNER_SYSTEME_TAGS.includes(e[0]));
  });
  if (icList && !icList.querySelector(".kta-planner-icon-row"))
    icList.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.icons.videDefinie") + '</p>';
}

// =========================
// BIND UPLOAD
// =========================
function _bindUploadLabel(inputId, nomId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener("change", function() {
    const nom = document.getElementById(nomId);
    if (nom) nom.textContent = input.files[0] ? "✅ " + input.files[0].name : window.I18n.t("gen.upload.aucunFichier");
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
      if (nom) nom.textContent = window.I18n.t("gen.upload.aucunFichier");
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

  // 📱 07/10/2026 — Safari iOS refuse tout canvas de plus de 16 777 216 px (≈ 4096 × 4096) : toBlob rend null, sans
  // autre signe. Avant, 4000 × 4000 par défaut passait juste ; depuis qu'un ZIP rechargé préremplit les dimensions du
  // plan (un import SIG/KML fait souvent 8 000 à 12 000 px), ça casse. On le dit AVANT d'essayer, avec la voie qui
  // marche (un ordinateur va jusqu'à 12 000 × 12 000) — plutôt que « mémoire ? » après coup.
  const IOS_MAX_PX = 16777216;
  const _ios = /iP(hone|ad|od)/.test(navigator.userAgent) ||
               (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (_ios && w * h > IOS_MAX_PX) {
    setStatus(window.I18n.t("gen.viergeGen.tropGrandIos", { w: w, h: h, mpx: Math.round(w * h / 1e6) }), "#ff8c8c");
    return;
  }

  // ───── Couleur de fond ─────
  const colorChoice = (document.querySelector('input[name="pl_vierge_color"]:checked') || {}).value || "white";
  const PALETTE = {
    white: "#ffffff",
    gray:  "#e8e8e8",
    black: "#000000",
    sepia: "#f4e4bc",
    transparent: null      // 🫥 07/10/2026 : aucun remplissage — PNG entièrement transparent
  };
  const fillColor = (colorChoice in PALETTE) ? PALETTE[colorChoice] : PALETTE.white;
  // Un plan vierge transparent sans fond conseillé : on propose le blanc (lisible en mode carte), modifiable.
  if (colorChoice === "transparent") {
    const pf = document.getElementById("pl_fond");
    if (pf && !pf.value) pf.value = "blanc";
  }

  setStatus(window.I18n.t("gen.viergeGen.encours", { w: w, h: h }), "#8cb4ff");

  // ───── Canvas off-screen + remplissage ─────
  // Async via requestAnimationFrame pour ne pas freezer l'UI sur les
  // gros canvas (12000×12000 = 144 MP allocations).
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

      // ───── Conversion en Blob PNG ─────
      canvas.toBlob(function(blob) {
        if (!blob) {
          // Au-delà de ~16,7 Mpx, c'est presque toujours la limite de surface du navigateur (téléphone), pas la mémoire.
          setStatus(window.I18n.t(w * h > IOS_MAX_PX ? "gen.viergeGen.tropGrand" : "gen.viergeGen.echecCanvas",
            { w: w, h: h, mpx: Math.round(w * h / 1e6) }), "#ff8c8c");
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
          setStatus(window.I18n.t("gen.viergeGen.erreurInjection", { err: (e.message || e) }), "#ff8c8c");
          return;
        }

        // UX feedback
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
  // 🎨 26/09/2026 (audit icônes, étage 1) — LE CHEMIN NE VOYAGE PLUS DANS
  // UN LIBELLÉ D'AFFICHAGE.
  //
  // 🚨 La génération relisait `pathSpan.title` comme chemin de l'icône. Or
  // depuis la v1.44.5 (`f7ef68b`, fix cosmétique d'une modale qui débordait)
  // ce `title` vaut, pour une icône SVG intégrée, le texte « Icône SVG
  // intégrée à l'application » — qui partait donc dans le `plan-config.json`
  // à la place du data-URI, et cassait `entree_plan` sur tout plan généré
  // depuis cette date. Régénérer ne réparait pas : le mode Modifier relisait
  // la même chaîne et la reposait à l'identique.
  //
  // Le chemin vit maintenant dans un attribut de données, que rien n'affiche
  // et que personne n'a de raison de « rendre lisible ». Une valeur qui n'est
  // pas un chemin (plan déjà corrompu relu en mode Modifier) n'est PAS reprise :
  // la ligne repart du catalogue, ce qui répare le plan à la régénération.
  const _pathPlausible = (typeof window.ktaCheminIconePlausible === "function")
    ? window.ktaCheminIconePlausible(defaultPath)
    : (typeof defaultPath === "string" && /^(data:|blob:)|\.(png|jpe?g|svg|webp|gif|bmp|ico|avif)$/i.test(defaultPath));
  const _pathReel = _pathPlausible ? defaultPath : (PLANNER_DEFAULT_ICONS[tag] || "");
  if (_pathReel) row.dataset.ktaPath = _pathReel;
  if (defaultPath && !_pathPlausible) {
    console.warn("[Generateur] 🎨 icône « " + tag + " » : valeur illisible dans le plan-config (" +
                 JSON.stringify(defaultPath) + ") — la ligne repart du catalogue de l'app.");
  }

  // 🐛 v1.44.5 — Les icônes built-in SVG inline (ex: entree_plan, cf
  // PLANNER_DEFAULT_ICONS) ont un `defaultPath` = data:image/svg+xml;...
  // de plusieurs centaines de caractères. Affichée telle quelle dans le
  // pathSpan, cette data URL (white-space:nowrap, sans min-width:0 sur le
  // flex item) débordait et élargissait toute la modale du générateur.
  // Fix : on affiche un label court "🔗 icône intégrée (SVG)" au lieu de la
  // data URL géante (le <img src> garde la data URL pour la preview).
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
      style="font-size:11px;color:#8892a4;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:6px;">
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
    row.dataset.ktaPath = "icon/" + f.name;   // 🎨 26/09/2026 : la source de vérité
    label.textContent = "✅ " + f.name;
    pathSpan.textContent = f.name;
    pathSpan.title = f.name;
    const url = URL.createObjectURL(f);
    // 🆕 v1.43.26 — revoke aussi sur onerror (image corrompue / format inconnu),
    // sinon fuite Blob URL si l'user charge un fichier non-décodable.
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

// =========================
// CALQUE IMAGE
// =========================
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
      <div style="font-size:11.5px; color:#8892a4; margin-bottom:4px;">
        📐 <strong>${window.I18n.t("gen.calib.titre")}</strong>
      </div>
      <div id="${id}_calib_hint" style="font-size:11px; color:#8892a4; margin-bottom:4px; min-height:14px;">${window.I18n.t("gen.calib.hintChoisir")}</div>
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

  // 🆕 v1.38.1 — Calibration state stocké sur l'item DOM
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
      hintEl.innerHTML = '<span style="color:#8892a4;">' + window.I18n.t("gen.calib.hintPlanPasCharge") + '</span>';
      calibBtn.disabled = true;
      return;
    }
    _getLayerSourceInfo().then(function(info) {
      if (!info) {
        hintEl.innerHTML = '<span style="color:#8892a4;">' + window.I18n.t("gen.calib.hintChoisir") + '</span>';
        calibBtn.disabled = true;
        return;
      }
      const sameDims = Math.abs(info.width - planW) <= 2 && Math.abs(info.height - planH) <= 2;
      if (sameDims) {
        hintEl.innerHTML = '<span style="color:#7dd87d;">' + window.I18n.t("gen.calib.hintMeme", { w: info.width, h: info.height }) + '</span>';
        calibBtn.disabled = false;  // on autorise quand même au cas où
      } else {
        hintEl.innerHTML = '<span style="color:#f4c542;">' + window.I18n.t("gen.calib.hintDiff", { w: info.width, h: info.height, pw: planW, ph: planH }) + '</span>';
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
      window.ktaAlerte(window.I18n.t("gen.calib.pickerIndispo"), { type: "erreur" });
      return;
    }
    const planW = parseInt(document.getElementById("pl_width")?.value || "0", 10);
    const planH = parseInt(document.getElementById("pl_height")?.value || "0", 10);
    if (!planW || !planH) {
      window.ktaAlerte(window.I18n.t("gen.calib.chargeImageDabord"));
      return;
    }
    // URL du plan principal (file uploadé OU mode Modifier via assets originaux)
    // Révoquée sur toutes les issues ci-dessous (calque indispo, picker fermé, erreur).
    let planUrl = null;
    const baseFile = (baseImgEl && baseImgEl.files && baseImgEl.files[0]) ? baseImgEl.files[0] : null;
    if (baseFile) {
      planUrl = URL.createObjectURL(baseFile);
    } else if (_plannerMode === "modifier") {
      // Cherche la 1ère image dans _plannerOrigAssets qui n'est pas la collision
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

// =========================
// CALQUE DONNÉES
// =========================
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

  list.appendChild(item);
  _bindUploadLabel(id + "_file", id + "_file_nom");
  item.querySelector("[data-remove]").addEventListener("click", function() {
    item.remove();
    if (!list.querySelector(".kta-planner-layer-item"))
      list.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.dataLayers.vide") + '</p>';
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
    _afficherStatutImportZip("error", window.I18n.t("gen.importZip.noJSZip"));
    return;
  }
  _afficherStatutImportZip("info", window.I18n.t("gen.importZip.lecture"));

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
      // 🆔 v2.2.0 — même fusion PAR UID que la fusion de sessions
      // (KtaUid.fusionnerCalques) : un objet présent dans deux calques n'est
      // plus doublé. La boucle ci-dessous ne sert alors plus qu'à la légende.
      const _fusionUid = (window.KtaUid && typeof window.KtaUid.fusionnerCalques === "function")
        ? window.KtaUid.fusionnerCalques(parsedArr) : null;
      if (_fusionUid) {
        merged.data = _fusionUid.data; merged.roads = _fusionUid.roads;
        merged.zones = _fusionUid.zones; merged.structures = _fusionUid.structures;
      }
      parsedArr.forEach(function(json) {
        if (!json || typeof json !== "object") return;
        if (_fusionUid) { if (json.customLegend) _absorberLegendeCalque(json.customLegend); return; }
        // Points : .data ou .editorPoints
        if (Array.isArray(json.data) && json.data.length > 0) {
          merged.data = merged.data.concat(json.data);
        } else if (Array.isArray(json.editorPoints) && json.editorPoints.length > 0) {
          merged.data = merged.data.concat(json.editorPoints);
        }
        if (Array.isArray(json.roads))      merged.roads      = merged.roads.concat(json.roads);
        if (Array.isArray(json.zones))      merged.zones      = merged.zones.concat(json.zones);
        if (Array.isArray(json.structures)) merged.structures = merged.structures.concat(json.structures);
        // 🐛 v1.76.0 (F3) — la légende embarquée dans le calque est ENFIN lue.
        // Sans ça, même un fichier qui la portait la voyait jetée ici, et les
        // objets custom du calque devenaient des orphelins sans nom ni couleur
        // dans le plan régénéré.
        if (json.customLegend) _absorberLegendeCalque(json.customLegend);
      });

      const total = merged.data.length + merged.roads.length + merged.zones.length + merged.structures.length;
      if (total === 0) {
        throw new Error(window.I18n.t("gen.importZip.vide"));
      }

      // Étape 2 : extraire les photos (si dossier photos/_index.json)
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
            list.innerHTML = '<p class="kta-planner-empty">' + window.I18n.t("gen.dataLayers.vide") + '</p>';
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

        // Étape 4 : stocker les photos pour embed au _genererZip
        _plannerPhotosFromZip = photos;

        // Étape 5 : feedback UI
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
  // 🧙 v1.72.1 (KARMA) : le wrap V2 est TOUJOURS visible désormais — en
  // wizard, le masquer jusqu'au chargement de l'image faisait rater l'option
  // (on pouvait passer à la page suivante avant qu'elle n'apparaisse). La
  // fonction reste (call-sites conservés) mais ne masque plus jamais.
  const wrap = document.getElementById("pl_v2_convert_wrap");
  if (wrap) wrap.style.display = "";
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
  const safeMessage = window.ktaEsc(message || "").replace(/\n/g, "<br>");
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-v2-error-boite">' +
      '<div class="kta-readme-modal-header kta-v2-error-header">' +
        '<span class="kta-readme-modal-titre">❌ ' + (titre || window.I18n.t("gen.v2err.titreDefaut")) + '</span>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p class="kta-v2-error-message">' + safeMessage + '</p>' +
        '<div class="kta-v2-warn-section kta-v2-warn-section-good">' +
          '<div class="kta-v2-warn-section-titre">' + window.I18n.t("gen.v2err.queFaire") + '</div>' +
          '<ul style="margin:6px 0 0; padding-left:22px; font-size:13px; color:#c8d0e0; line-height:1.6;">' +
            '<li>' + window.I18n.t("gen.v2err.consPC") + '</li>' +
            '<li>' + window.I18n.t("gen.v2err.consReduire") + '</li>' +
            '<li>' + window.I18n.t("gen.v2err.consJpeg") + '</li>' +
            // 🖼️ v1.76.1 — limite physique des décodeurs (cf. refus au drop)
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

// =========================
// LECTURE FICHIER
// =========================
// 🆔 v2.1.0 — Un plan qui sort du Générateur porte un uid sur chaque objet de
// ses calques de données (ETUDE_UID décision 5) : les uid existants sont
// gardés, les manquants posés. Le fichier arrive en ArrayBuffer ; s'il n'est
// pas un JSON UTF-8 exploitable, il part tel quel (jamais de calque perdu pour
// une identité).
// 🆔 v2.5.0 (lot C3) — points ({uid, id}) d'un calque écrit (texte ou buffer).
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
// Clé d'une photo dans data/photos/_index.json : l'uid du point si la photo
// est encore rangée sous un NOM porté par un seul point du plan généré ;
// sinon la clé telle quelle (déjà un uid, nom ambigu, point inconnu). Le
// chargement lit l'uid puis le nom : un index ancien reste valable.
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

// =========================
// AUTO-DÉTECTION DIMENSIONS DU PLAN (depuis l'image principale)
// =========================
// 🐛 v1.76.1 (bug KARMA : JPG 32K×32K « non décodable » sur PC) — l'ancienne
// méthode (blob URL + Image + onload) prétendait « lire juste le header » :
// FAUX. `onload` exige un décodage complet, et le décodeur de Chrome desktop
// (Skia) refuse toute image dont un côté dépasse 32 767 px → onerror sec,
// impossible de seulement CONNAÎTRE les dimensions. Mobile passait (décodeur
// différent) puis crashait au tuilage — un 32K×32K = 1 gigapixel décodé.
//
// Nouvelle stratégie : lire les dimensions dans les OCTETS DE L'EN-TÊTE
// (PNG / JPEG / WebP / GIF) — zéro décodage, aucune limite navigateur, on
// peut ensuite REFUSER l'infaisable avec un message honnête au lieu d'un
// « non décodable » cryptique. Fallback : décodage Image pour les formats
// non parsés (BMP, AVIF…).

// Parse binaire des dimensions. Rend {width, height} ou null (format inconnu
// ou en-tête introuvable). Lit au plus 1 Mo (les marqueurs JPEG utiles
// peuvent être après un gros bloc EXIF).
function _lireDimensionsEntete(buf) {
  const b = new DataView(buf);
  const len = b.byteLength;
  if (len < 26) return null;
  // ---- PNG : signature 8 octets puis chunk IHDR (w/h en big-endian) ----
  if (b.getUint32(0) === 0x89504E47) {
    return { width: b.getUint32(16), height: b.getUint32(20) };
  }
  // ---- GIF : "GIF8" puis w/h en little-endian ----
  if (b.getUint32(0) === 0x47494638) {
    return { width: b.getUint16(6, true), height: b.getUint16(8, true) };
  }
  // ---- WebP : RIFF....WEBP puis chunk VP8 / VP8L / VP8X ----
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
  // ---- JPEG : marche des marqueurs jusqu'au SOF (C0-CF sauf C4/C8/CC) ----
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

// 🔁 v1.76.2 — exposé : l'éditeur de données (tableEditor > Convertir la
// résolution) lit les dimensions des images source/destination par le même
// parseur, sans décodage (une image 32K passe).
window.ktaLireDimensionsEntete = _lireDimensionsEntete;

function _lireImageDimensions(file) {
  // Étape 1 : en-tête binaire (1 Mo suffit, même avec un gros EXIF)
  return file.slice(0, 1048576).arrayBuffer().then(function(buf) {
    const dims = _lireDimensionsEntete(buf);
    if (dims && dims.width > 0 && dims.height > 0) {
      console.log("[Planner] Dimensions lues dans l'en-tête (sans décodage) :", dims.width + "×" + dims.height);
      return dims;
    }
    // Étape 2 : fallback décodage navigateur (formats non parsés)
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

// Limite PHYSIQUE des navigateurs : le décodeur de Chrome desktop (Skia)
// refuse un côté > 32 767 px — au-delà, RIEN ne peut fonctionner (ni aperçu,
// ni tuilage), quel que soit l'appareil de l'auteur OU DU LECTEUR du plan.
// Refus franc, pas de clamp (règle KARMA).
const MAX_COTE_IMAGE_PX = 32767;

// Bouton 🎯 Recentrer : force pl_startX/Y au centre du plan en se basant sur
// les dimensions actuelles. Si dims inconnues (pas d'image chargée), affiche
// un message d'erreur dans la zone _plannerErreur.
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

// Récupérer fichier : upload prioritaire, puis asset ZIP original
// Libellé « aucun fichier » affiché à côté d'un champ d'upload : il est
// traduit (gen.upload.aucunFichier), donc on le compare dans la langue
// active — comparé au seul FR, « No file » passait pour un nom de fichier
// et donnait l'erreur « fichier introuvable » au lieu de « fichier manquant ».
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
// 🫥 v1.62.0 — Source avec canal alpha : tuiles encodées AVEC transparence
// (WebP si le navigateur sait encoder, sinon PNG — cf utils.js >
// ktaProbeAlphaTileFormat). Qualité WebP : 0.90 (alpha lossless, RGB lossy).
const TILING_V2_WEBP_Q     = 0.90;
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
// 🧱 `uniformSource` : l'appelant GARANTIT que l'image source est un aplat de
// couleur unie (c'est le cas du fond vierge généré pour les imports GPX et SIG,
// cf. GpxImport.genererCanvasVierge). Dans ce cas, toute tuile intérieure
// PLEINE est strictement identique aux autres, à tous les niveaux de zoom, et
// le JPEG est déterministe : on l'encode UNE fois et on réutilise les octets.
// Mesuré sur un relevé réel : 71 % des tuiles à 4000 px de large, 88 % à 10000,
// 90 % à 12000 — donc autant d'encodages identiques refaits pour rien.
// ⚠️ À NE JAMAIS activer pour le générateur de plans classique : un vrai scan
// n'a aucune tuile identique, et le cache y produirait un plan uniformément
// gris. Le flag est explicite pour cette raison.
async function _genererTuilesV2(imageFile, zip, onProgress, uniformSource) {
  // Octets de la tuile pleine, encodés au plus une fois.
  let _tuileUnieBuf = null;
  // Decode initial de l'image source (HTMLImageElement, pas de canvas)
  const imgUrl = URL.createObjectURL(imageFile);
  // 🆕 v1.43.26 — try/finally garantit que le blob URL est TOUJOURS revoké,
  // même si une exception saute pendant le tilage (drawImage tainted, toBlob
  // null, ajout ZIP OOM…). Avant : l'imgUrl restait référencée jusqu'à la
  // fin de vie de l'onglet → MB en RAM pour rien sur les retries.
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

  // 🫥 v1.62.0 — Détection d'alpha : source transparente → tuiles encodées
  // AVEC le canal alpha (pas de fond aplati), format WebP ou PNG selon
  // capacité d'encodage du navigateur. Source opaque → JPEG historique.
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

  // Auto-crop : si l'image a beaucoup de marges blanches, on tuile depuis la
  // zone utile uniquement. Sinon (bbox > 90% du canvas), on prend tout.
  // 🐛 v1.62.0 (KARMA « tout est décalé ») : JAMAIS d'auto-crop sur une source
  // TRANSPARENTE — le crop change imageWidth/Height et l'origine, or les
  // datalayers/georef/calibrations existants restent en coords d'origine →
  // tout se décale (double décalage en Y via le flip imageHeight - y). Les
  // marges transparentes sont invisibles au rendu et se compressent à ~0 en
  // WebP/PNG : le crop n'apporte rien ici. Inchangé pour les scans opaques
  // à marges blanches (comportement historique v149).
  // 🧱 v1.82.0 — sur une source UNIE, l auto-crop est du travail toujours jeté :
  // il downscale l image entière puis parcourt 1,4 M de pixels pour conclure
  // que « tout est du contenu » (un aplat n a pas de marge vide), et la bbox
  // est rejetée. On saute.
  const bbox = (hasAlpha || uniformSource) ? null : _detectContentBBox(img);
  if (hasAlpha) console.log("[Planner] Auto-crop : skip (source transparente — coords préservées)");
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
        // 🫥 v1.62.0 : source transparente → PAS de fond (clearRect seul,
        // bordures partielles transparentes aussi)
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
          // drawImage peut throw sur "tainted canvas" (image cross-origin) ou
          // sur OOM (rare mais possible sur mobile). On veut un message clair.
          throw new Error(window.I18n.t("gen.err.tuileDrawImage", {
            z: z, col: col, k: k,
            detail: (drawErr && drawErr.message ? drawErr.message : window.I18n.t("gen.err.detailInconnu"))
          }));
        }

        // 🧱 Tuile PLEINE d'une source unie : on réutilise les octets déjà
        // encodés. Une tuile de bord (partielle) garde son encodage propre —
        // elle contient de la transparence ou du fond, pas la même chose.
        const estPleine = (sliceWidthLvl === TILING_V2_TILE_SIZE &&
                           sliceHeightLvl === TILING_V2_TILE_SIZE && destY === 0);
        if (uniformSource && estPleine && _tuileUnieBuf) {
          zFolder.file("x" + col + "_y" + leafletY + "." + fmt.ext, _tuileUnieBuf);
          tilesDone++;
          if (onProgress) onProgress(tilesDone, tilesTotal, z);
          continue;
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
          // Première tuile pleine d'une source unie : on garde ses octets.
          // `slice()` pour détacher du buffer d'origine — JSZip conserve la
          // référence, et réutiliser le même ArrayBuffer pour N entrées est
          // sûr en lecture mais fragile si un jour il était transféré.
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

  // Cleanup canvas (le revoke imgUrl est garanti dans le finally ci-dessous)
  tileCanvas.width = 0; tileCanvas.height = 0;

  return {
    tilesCount: tilesDone,
    manifest: {
      version:        TILING_V2_VERSION,
      tileSize:       TILING_V2_TILE_SIZE,
      // 🫥 v1.62.0 : format réel des tuiles ("jpeg" | "webp" | "png") — lu au
      // runtime via window.ktaTileExt pour résoudre l'extension des fichiers.
      format:         fmt.name,
      alpha:          hasAlpha,
      minNativeZoom:  -(TILING_V2_LEVELS - 1),
      maxNativeZoom:  0
    },
    dims: { width: srcW, height: srcH, cropOffset: bbox ? { x: cropX, y: cropY } : null }
  };

  } finally {
    // 🆕 v1.43.26 — Revoke garanti même si une tuile throw au milieu du tilage.
    URL.revokeObjectURL(imgUrl);
  }
}

// =========================
// GÉNÉRATION DU ZIP
// =========================
async function _genererZip() {
  _plannerErreur("");

  const name    = document.getElementById("pl_name").value.trim();
  const version = document.getElementById("pl_version").value.trim() || "V1";
  const author  = document.getElementById("pl_author").value.trim();
  const tags    = _lireTagsChamp("pl_tags");   // 🏷️ 16/09/2026
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
      // Chercher dans les assets originaux — prendre la première image non-collision
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
    const _alphaWarnChecks = [];   // 🫥 v1.67.0 : calques de niveau à vérifier (alpha)
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

      if (!ilId) { _plannerErreur(window.I18n.t("gen.gen.idManquantImg")); throw new Error("abort"); }

      let filePath;
      if (ilFile) {
        filePath = "data/" + ilFile.name;
        dataFolder.file(ilFile.name, await _lireFichier(ilFile));
      } else if (nomTxt && !_estAucunFichier(nomTxt)) {
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
          _plannerErreur(window.I18n.t("gen.gen.fichierImgIntrouvable", { fichier: nomTxt, id: ilId }));
          throw new Error("abort");
        }
      } else {
        _plannerErreur(window.I18n.t("gen.gen.fichierManquant", { id: ilId })); throw new Error("abort");
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
      // 🫥 v1.67.0 : candidat au garde-fou transparence (calques de NIVEAU
      // uniquement — un calque niveau 0 opaque type légende est légitime)
      if (ilLevel !== 0) {
        _alphaWarnChecks.push({ label: ilLabel, file: ilFile || _plannerOrigAssets[nomTxt] || null });
      }
    }

    // 🫥 v1.67.0 (KARMA « logique de superposition », reco 3:a) — GARDE-FOU
    // TRANSPARENCE : un calque de niveau (≠ 0) sans canal alpha est un
    // rectangle opaque qui masque tout ce qui est dessous → la superposition
    // multi-niveau perd son sens. Détection par CONTENU (ktaDetecterAlpha,
    // cf v1.62.0 — un PNG au fond aplati est bien détecté opaque). Warning
    // NON-bloquant (toast + statut), la génération continue.
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

    // ── Calques données ──
    const dataLayers = [];
    // 🆔 v2.5.0 (lot C3) — points des calques écrits, pour que l'index des
    // photos désigne chaque point par son uid (cf. plus bas).
    const _pointsGeneres = [];
    for (const item of document.querySelectorAll("#pl_dataLayers_list .kta-planner-layer-item")) {
      const lid     = item.dataset.layerId;
      const dlId    = document.getElementById(lid + "_id").value.trim();
      const dlLabel = document.getElementById(lid + "_label").value.trim() || dlId;
      const dlVis   = document.getElementById(lid + "_visible").value === "true";
      const dlFile  = _getFile(lid + "_file", dlId + ".json");

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

    // Calque editor
    dataFolder.file("editor.json", PLANNER_EDITOR_JSON);
    dataLayers.push({ id: "editor", label: window.I18n.t("gen.gen.editorLabel"), file: "data/editor.json", visible: true });

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
            pointId: _clePhotoIndex(rec.pointId, _pointsGeneres),   // 🆔 v2.5.0 : l'uid si le nom est sans ambiguïté
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
      scale:         parseFloat(document.getElementById("pl_scale").value)           || 4.9
      // 👣 v1.96.0 — plus de stepLength / stepThreshold / stepCooldown : le plan
      // ne dit pas la foulée. Le JSON produit n'a plus ces trois clés.
    };

    // ── Icônes ──
    // 🎨 26/09/2026 (audit icônes, étage 1) : le chemin vient de
    // `row.dataset.ktaPath`, pas du `title` d'affichage — cf le commentaire de
    // `_ajouterIconRow`. Et on TIENT LA LISTE de ce qu'on met vraiment dans le
    // ZIP (`iconsEmbarquees`) : sans elle, l'app doit sonder le serveur pour
    // chaque icône à chaque ouverture du plan (21 x 404 mesurées).
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
          // Reprise d'un asset du ZIP d'origine (mode Modifier) : s'il est
          // effectivement recopié, il est EMBARQUÉ — il faut le dire.
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
        _afficherErreurV2(window.I18n.t("gen.gen.v2ImageIntrouvableTitre"),
          window.I18n.t("gen.gen.v2ImageIntrouvableMsg"));
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
          '<div class="kta-modal-titre">' + window.I18n.t("gen.v2prog.titre") + '</div>' +
          '<div class="kta-modal-texte">' +
            '<div id="kta-tiling-progress-text" style="margin-bottom:10px;">' + window.I18n.t("gen.v2prog.init") + '</div>' +
            '<div style="background:rgba(255,255,255,0.06); border-radius:6px; height:8px; overflow:hidden;">' +
              '<div id="kta-tiling-progress-bar" style="height:100%; width:0%; background:#b452ff; transition:width 0.2s;"></div>' +
            '</div>' +
            '<p style="font-size:11.5px; color:#8892a4; margin:14px 0 0; line-height:1.5;">' +
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
        // Cleanup du flag in-progress (succes OU echec catché). Si OOM kill
        // brutal, ce code ne tourne JAMAIS → le flag reste en localStorage
        // → détecté au prochain boot.
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
    // 🏷️ 16/09/2026 — étiquettes proposées : écrites SEULEMENT si saisies,
    // sinon le champ est absent et le JSON reste identique à avant.
    if (tags.length)    planObj.tags = tags;
    // 🎨 07/10/2026 — fond conseillé, écrit SEULEMENT s'il est choisi (absent = JSON identique à avant).
    const _fond = (document.getElementById("pl_fond") || {}).value || "";
    if (["noir", "blanc", "gris"].indexOf(_fond) >= 0) planObj.fondConseille = _fond;
    // 📉 v1.83.0 — table des profondeurs, construite depuis le niveau 0 et le
    // pas. On ne l'ecrit QUE si le multi-niveau est actif : sur un plan a un
    // seul etage elle n'aurait aucun sens, et l'absence du champ garantit un
    // JSON identique a celui des generateurs precedents.
    if (multiLevel && typeof window.proposerProfondeurs === "function") {
      const _z0 = parseFloat((document.getElementById("pl_prof0") || {}).value);
      const _pas = parseFloat((document.getElementById("pl_profPas") || {}).value);
      if (Number.isFinite(_z0) && Number.isFinite(_pas) && _pas > 0) {
        // Meme range par defaut que le runtime (config.js > availableLevels).
        planObj.niveauxProfondeur = window.proposerProfondeurs([-2, -1, 0, 1, 2], _z0, _pas);
      }
    }
    if (tilingManifest) planObj.tiledV2    = true;

    // 🧭 v1.37.0 — Calibration Nord. Embed UNIQUEMENT si ≠ 0 (rétrocompat
    // stricte : plans v1.36.x sans champ continuent de produire un JSON
    // équivalent). Normalisation [0, 360[ + parse robust (NaN → skip).
    const _northRaw = parseFloat(document.getElementById("pl_northOffset")?.value || "0");
    if (Number.isFinite(_northRaw) && _northRaw !== 0) {
      const _northNorm = ((_northRaw % 360) + 360) % 360;
      if (_northNorm !== 0) planObj.northOffsetDeg = _northNorm;
    }

    // 📄 v1.71.0 — PDF Histoire MULTIPLES (KARMA). Chaque entrée de
    // _plannerHistPdfs est embarquée sous data/<nom-safe> (dédoublonné) :
    //   - file présent  → upload neuf
    //   - fromZip       → ré-embarqué depuis _plannerOrigAssets[name]
    // plan-config : histoirePdfs[] (nouveau) + histoirePdf = 1er (RÉTROCOMPAT :
    // une app antérieure à v1.71.0 lira au moins le premier document).
    // Aucun PDF → les 2 champs absents (rétrocompat stricte inchangée).
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
      // 🆕 v1.44.0 — Clear le mark d'erreur précédent avant nouvelle validation
      // (sinon la classe reste sticky après une 1ère erreur, même si l'user a
      // corrigé sa saisie). Audit V2 quick win #4.
      el.classList.remove("kta-gps-invalid");
      const errEl0 = errId ? document.getElementById(errId) : null;
      if (errEl0) errEl0.style.display = "none";
      const v = String(el.value || "").trim();
      if (v === "") return { empty: true, lat: null, lng: null };
      const parsed = (typeof window.parseGpsCoords === "function")
                      ? window.parseGpsCoords(v) : null;
      if (!parsed) {
        // Format invalide → marque l'input en erreur + abort.
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
    const _coordsC = _readGeoCoords("pl_geo_C_coords", "pl_geo_C_err", window.I18n.t("gen.geo.labelC"));   // 📐 v1.73.0
    const _geoA = { x: _readGeo("pl_geo_A_x"), y: _readGeo("pl_geo_A_y"),
                    lat: _coordsA.lat, lng: _coordsA.lng };
    const _geoB = { x: _readGeo("pl_geo_B_x"), y: _readGeo("pl_geo_B_y"),
                    lat: _coordsB.lat, lng: _coordsB.lng };
    const _allGeoFilled =
      _geoA.x != null && _geoA.y != null && _geoA.lat != null && _geoA.lng != null &&
      _geoB.x != null && _geoB.y != null && _geoB.lat != null && _geoB.lng != null;
    if (_allGeoFilled) {
      // 📐 v1.73.0 — Point C optionnel mais TOUT-OU-RIEN (C partiel = oubli)
      const _geoC = { x: _readGeo("pl_geo_C_x"), y: _readGeo("pl_geo_C_y"),
                      lat: _coordsC.lat, lng: _coordsC.lng };
      const _cRempli = _geoC.x != null || _geoC.y != null || _geoC.lat != null;
      const _cComplet = _geoC.x != null && _geoC.y != null && _geoC.lat != null && _geoC.lng != null;
      if (_cRempli && !_cComplet) {
        _plannerErreur(window.I18n.t("gen.geo.pointCIncomplet"));
        throw new Error("abort");
      }
      // Validation transform (refus si points colinéaires / distance nulle ;
      // C colinéaire = refus franc à la saisie, même si le moteur sait replier)
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
    // 🎨 26/09/2026 — CE QUE CE ZIP EMBARQUE VRAIMENT sous `icon/`.
    // Le champ est écrit **même vide** : c'est sa PRÉSENCE qui dit à l'app
    // « inutile de sonder le serveur ». Un tableau vide = « aucune icône
    // propre au plan », ce qui est le cas de la grande majorité des plans et
    // valait 21 requêtes 404 à chaque ouverture.
    planConfigObj.iconsEmbarquees = Array.from(new Set(iconsEmbarquees));
    if (tilingManifest) planConfigObj.tiling = tilingManifest;

    zip.file("plan-config.json", JSON.stringify(planConfigObj, null, 2));

    // ── Génération ──
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const url  = URL.createObjectURL(blob);
    // 🆕 v1.44.0 — try/finally garantit que le blob URL est TOUJOURS revoké,
    // même si a.click() throw (browser strict, sandbox). Avant : si a.click()
    // crashait, l'URL restait référencée jusqu'à la fin de vie de l'onglet.
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = "plan_" + name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() +
                   (tilingV2On ? "_v2" : "") + ".zip";
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }

    // 🧩 v2.7.0 (prise « publication ») — si une extension sait publier, le
    // Créateur peut envoyer le plan généré au serveur de l'instance (brouillon
    // local → « Publier »). Sans extension : rien ne change.
    if (window.KtaExtensions && window.KtaExtensions.aPrise("publierPlan") && typeof window.ktaConfirm === "function") {
      // Audit UI du 05/10/2026 : nom échappé (ktaConfirm rend du HTML), avancement visible pendant
      // l'envoi (un gros plan prend des minutes), fin annoncée par un toast plutôt qu'un alert().
      const dire = function(m, ty) {
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(m, ty || "info");
      };
      let minuteur = null;
      try {
        const publier = await window.ktaConfirm(window.I18n.t("ext.publier.question", { nom: window.ktaEsc(name) }),
                                                { okLabel: window.I18n.t("ext.publier.ok") });
        if (publier) {
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
          await window.KtaExtensions.publierPlan({ blob: blob, nom: name });
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
        <span class="kta-readme-modal-titre">${window.I18n.t("gen.kmz.titre")}</span>
        <button class="kta-panneau-close" id="kta-kmz-imp-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps" id="kta-kmz-imp-corps">

        <div style="padding:8px 12px; background:rgba(255,179,128,0.06); border:1px solid rgba(255,179,128,0.22); border-radius:6px; font-size:12px; color:#c0c8d8; margin-bottom:14px;">${window.I18n.t("gen.kmz.phase1")}</div>

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
    // 🆕 v1.43.26 (Pattern D) — Disable bouton pendant la génération (lourd :
    // parse KMZ + extraction assets + écriture ZIP). Sans ça, l'user qui
    // double-clique nerveusement lance N générations parallèles → corruption
    // de l'état + plusieurs ZIP empilés en download.
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

// Analyse un fichier KMZ : extraction + parsing + détection GroundOverlay
// + comptage. Affiche le résumé ou la modale d'erreur (Mode C).
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

    // 🔒 v173 simplifié : on ne supporte QUE les KMZ exportés par MyKTAMap.
    // Détection via la signature "Export MyKTAMap" dans <Document><description>
    // (posée par kmzExport.js ligne 485) + fallbacks (name, styles).
    // Si le KMZ est tiers (Google Earth, OsmAnd, IGN scan…) → refus net.
    if (!window.KmzImport.estKmzMyktamap(kmlDoc)) {
      status.textContent = window.I18n.t("gen.kmz.nonCompatible");
      status.style.color = "#ff8c8c";
      _kmzImpAfficherModaleNonCompatible(file);   // 🗺️ v1.75.2 : propose la conversion SIG
      return;
    }

    const overlays = window.KmzImport.extraireGroundOverlays(kmlDoc, assets);

    // Cas dégénéré : KMZ MyKTAMap reconnu mais sans GroundOverlay
    // (= exporté avec décoche "🖼️ Image plan" → théoriquement impossible
    // d'importer car pas de système coord pixel)
    if (overlays.length === 0) {
      status.textContent = window.I18n.t("gen.kmz.sansImage");
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
      status.textContent = window.I18n.t("gen.kmz.calibrageInvalide", { err: (e.message || e) });
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
    const docName = (kmlDoc.querySelector("Document > name")?.textContent || "").trim() || window.I18n.t("gen.kmz.sansNom");
    const overlaysExtra = overlays.length > 1
      ? `<div style="color:#ffb380; font-size:12px; margin-top:4px;">${window.I18n.t("gen.kmz.overlaysExtra", { n: overlays.length - 1 })}</div>` : "";
    const mgWarn = mgCount > 0
      ? `<div style="color:#ffb380; font-size:12px; margin-top:4px;">${window.I18n.t("gen.kmz.mgWarn", { n: mgCount })}</div>` : "";

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
                if (renamed > 0) parts.push(renamed + " " + window.I18n.t(renamed > 1 ? "gen.legende.renommesP" : "gen.legende.renomme"));
                if (hiddenN > 0) parts.push(hiddenN + " " + window.I18n.t(hiddenN > 1 ? "gen.legende.masquesP"  : "gen.legende.masque"));
                if (customN > 0) parts.push(customN + " " + window.I18n.t(customN > 1 ? "gen.legende.customsP"   : "gen.legende.custom"));
                legendInfo = `<div style="color:#6ce28a; font-size:12px; margin-top:6px;">
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
        <span style="color:#8892a4;">(${_escHtml(base.name || base.hrefBlob.type || "image")})</span></div>
      <div>📐 <strong>${window.I18n.t("gen.kmz.echelleCalibrage")}</strong> : ${transform.metresParPixel.toFixed(3)} m/px
        · ${window.I18n.t("gen.kmz.rotation")} ${(transform.rotation * 180 / Math.PI).toFixed(1)}°</div>
      <div style="margin-top:8px;">
        📍 <strong>${ptCount}</strong> ${window.I18n.t("gen.kmz.points")}
        · 🛣️ <strong>${lsCount}</strong> ${window.I18n.t("gen.kmz.lignes")}
        · ⬛ <strong>${pgCount}</strong> ${window.I18n.t("gen.kmz.polygones")}
        <span style="color:#8892a4;">${window.I18n.t("gen.kmz.placemarkTotal", { n: pmCount })}</span>
      </div>
      ${legendInfo}${overlaysExtra}${mgWarn}
    `;

    // Pré-remplir le nom à partir du Document KML
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

// Modale d'erreur "KMZ non compatible" (v173 simplifié — round-trip MyKTAMap only).
// Affichée quand `estKmzMyktamap` retourne false (KMZ tiers).
// 🗺️ v1.75.2 (demande KARMA « il faut rebrancher : une erreur précise +
// redirection avec un timer de 3 s ») — `fichier` optionnel : quand il est
// fourni, on propose la CONVERSION SIG au lieu d'un cul-de-sac.
// Pourquoi ici : un export QGIS en .kmz est un KMZ *vectoriel*, il n'a pas la
// signature MyKTAMap → il atterrit sur CE refus. Or c'est précisément le
// fichier que sait traiter `sigImport`. Sans ce pont, l'utilisateur recevait
// « format non compatible » alors que l'app savait parfaitement le lire.
function _kmzImpAfficherModaleNonCompatible(fichier) {
  const existing = document.getElementById("kta-kmz-imp-incompat-modal");
  if (existing) existing.remove();
  const T = function(k, p) { return window.I18n.t(k, p); };
  // Bascule proposée seulement si on a le fichier ET le module SIG.
  const peutBasculer = !!(fichier && typeof _afficherImporterSig === "function");
  const DELAI = 3;

  const m = document.createElement("div");
  m.id = "kta-kmz-imp-incompat-modal";
  m.className = "kta-readme-modal-overlay";
  m.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:520px; height:auto; max-height:80vh; border:1px solid rgba(255,140,140,0.35);">' +
      '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(255,140,140,0.20);">' +
        '<span class="kta-readme-modal-titre" style="color:#ff8c8c;">' + T("gen.kmzIncompat.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-kmz-imp-incompat-close">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="font-size:13.5px; color:#c0c8d8; line-height:1.6; margin:0 0 12px;">' + T("gen.kmzIncompat.txt") + '</p>' +
        (peutBasculer
          ? '<div style="padding:10px 12px; background:rgba(108,226,138,0.08); border:1px solid rgba(108,226,138,0.30); border-radius:6px; margin-bottom:14px; font-size:12.5px; color:#c0c8d8; line-height:1.55;">' +
              T("gen.kmzIncompat.sigTxt") +
              '<div style="margin-top:8px; color:#6ce28a; font-weight:600;" id="kta-kmz-sig-compte">' +
                T("gen.kmzIncompat.sigCompte", { s: DELAI }) +
              '</div>' +
            '</div>'
          : '<div style="padding:10px 12px; background:rgba(140,180,255,0.06); border:1px solid rgba(140,180,255,0.22); border-radius:6px; margin-bottom:14px; font-size:12.5px; color:#c0c8d8;">' + T("gen.kmzIncompat.aide") + '</div>') +
        '<div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">' +
          (peutBasculer
            ? '<button class="kta-btn kta-btn-ghost" id="kta-kmz-imp-incompat-rester">' + T("gen.kmzIncompat.rester") + '</button>' +
              '<button class="kta-btn kta-btn-primary" id="kta-kmz-imp-incompat-sig">' + T("gen.kmzIncompat.sigBtn") + '</button>'
            : '<button class="kta-btn kta-btn-primary" id="kta-kmz-imp-incompat-ok">' + T("gen.btn.jaiCompris") + '</button>') +
        '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(m);

  // ⚠️ Le compte à rebours DOIT être annulable par TOUTES les sorties (✕,
  // clic sur le fond, Échap, bouton « Rester ici ») — sinon la modale se
  // ferme et la conversion s'ouvre quand même 2 s plus tard, sur le dos de
  // l'utilisateur qui venait d'annuler.
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
        '<span class="kta-readme-modal-titre" style="color:#ff8c8c;">' + window.I18n.t("gen.kmzNoImg.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-kmz-imp-noimg-close">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="font-size:13.5px; color:#c0c8d8; line-height:1.6; margin:0 0 12px;">' + window.I18n.t("gen.kmzNoImg.txt1") + '</p>' +
        '<p style="font-size:13px; color:#c0c8d8; line-height:1.6; margin:0 0 14px;">' + window.I18n.t("gen.kmzNoImg.txt2") + '</p>' +
        '<div style="padding:10px 12px; background:rgba(255,179,128,0.06); border:1px solid rgba(255,179,128,0.22); border-radius:6px; margin-bottom:14px; font-size:12.5px; color:#c0c8d8;">' + window.I18n.t("gen.kmzNoImg.solutions") + '</div>' +
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
  // v1.14.20-hotfix12 — options optionnelles du flow KMZ
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
          '<div class="kta-modal-titre">' + window.I18n.t("gen.v2prog.titreImp") + '</div>' +
          '<div class="kta-modal-texte">' +
            '<div id="kta-kmz-v2-progress-text" style="margin-bottom:10px;">' + window.I18n.t("gen.v2prog.init") + '</div>' +
            '<div style="background:rgba(255,255,255,0.06); border-radius:6px; height:8px; overflow:hidden;">' +
              '<div id="kta-kmz-v2-progress-bar" style="height:100%; width:0%; background:#b452ff; transition:width 0.2s;"></div>' +
            '</div>' +
            '<p style="font-size:11.5px; color:#8892a4; margin:14px 0 0; line-height:1.5;">' +
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
        tags:              _lireTagsChamp("kta-kmz-imp-tags"),   // 🏷️ 16/09/2026
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
    status.innerHTML = window.I18n.t("gen.kmz.zipGenere") + " " +
      "<span style='color:#c0c8d8;'>" + window.I18n.t("gen.kmz.statsGardes", { n: s.kept }) + " · " +
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

  // Si fichier pré-fourni (drop zone home avec .gpx ou drop dans générateur),
  // lance directement l'analyse.
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

    // Détection MyKTAMap (warn si non-MyKTAMap mais pas blocking)
    const isMkm = window.GpxImport.estGpxMyktamap(gpxDoc);

    // Bounds GPS
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

    // Résumé HTML
    const sourceLine = isMkm
      ? '<div style="color:#6ce28a;">' + window.I18n.t("gen.gpx.sourceMkm") + '</div>'
      : '<div style="color:#ffb380;">' + window.I18n.t("gen.gpx.sourceTiers") + '</div>';
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
        if (renamed > 0) parts.push(renamed + " " + window.I18n.t(renamed > 1 ? "gen.legende.renommesP" : "gen.legende.renomme"));
        if (hiddenN > 0) parts.push(hiddenN + " " + window.I18n.t(hiddenN > 1 ? "gen.legende.masquesP"  : "gen.legende.masque"));
        if (customN > 0) parts.push(customN + " " + window.I18n.t(customN > 1 ? "gen.legende.customsP"   : "gen.legende.custom"));
        legendInfo = `<div style="color:#6ce28a; font-size:12px; margin-top:6px;">
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

    // Pré-remplit le nom du plan depuis metadata.name si dispo
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
      tags:             _lireTagsChamp("kta-gpx-imp-tags"),   // 🏷️ 16/09/2026
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

// =====================================================================
// 🗺️ IMPORT SIG (QGIS) — v1.74.0
// =====================================================================
// Panneau calqué sur _afficherImporterGpx (même squelette de modale, mêmes
// classes CSS) + UNE section que le GPX n'a pas : l'ÉCRAN DE CORRESPONDANCE.
//
// Pourquoi cet écran existe : un fichier SIG porte ses propres nomenclatures
// (« CANALISATION », « galerie_tech », « ZH »…). Deviner seul se tromperait
// en silence sur des schémas qu'on ne connaît pas. On propose donc une
// correspondance pré-remplie par synonymes, et l'utilisateur tranche.
//
// ⚠️ Les valeurs sont ventilées PAR FAMILLE de géométrie
// (SigImport.valeursParFamille) : une valeur trouvée sur des polygones
// propose des types de ZONE, pas des types de tracé.
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

        <div style="padding:8px 12px; background:rgba(140,180,255,0.06); border:1px solid rgba(140,180,255,0.22); border-radius:6px; font-size:12px; color:#c0c8d8; margin-bottom:14px;">${T("gen.sig.crsInfo")}</div>

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
            <span style="color:#8892a4; font-size:11.5px;">${T("gen.sig.couleursNiveauHint")}</span></span>
          </label>
          <!-- 🏷️ v1.82.0 — renommer/recolorer SANS repasser par le générateur.
               KARMA : « obligé de repasser ensuite en génération normale pour
               renommer les entrées custom ». Le bouton ouvre LE MEME éditeur
               que le générateur de plans, sur les entrées de cet import. -->
          <button type="button" class="kta-planner-btn" id="kta-sig-imp-legende"
                  style="margin-top:8px; display:none;">🏷️ ${T("gen.sig.legendeBtn")}</button>
          <div id="kta-sig-imp-legende-etat" style="font-size:11.5px; color:#8892a4; margin-top:4px;"></div>
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
  _sigPlanLegend  = null;   // 🏷️ un nouvel import repart d'une légende vierge
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
  // Changer la colonne des types rebâtit tout le routage — donc les catégories
  // des entrées. Le listener posé sur les selects ne suffit pas : ils sont
  // recréés par `_sigImpRendreTables` sans qu'aucun n'ait « changé ».
  document.getElementById("kta-sig-imp-colonne")
    .addEventListener("change", function () { _sigImpInvaliderLegende(true); });
  document.getElementById("kta-sig-imp-generer").addEventListener("click", _sigImpGenerer);

  if (prefilledFile) {
    if (labelEl) labelEl.textContent = "📦 " + prefilledFile.name;
    setTimeout(function() { _sigImpAnalyserFichier(prefilledFile); }, 0);
  }
}

// 🩸 v1.82.0 — LES ENTRÉES DE LÉGENDE SONT LIÉES AU FICHIER *ET* AU MAPPING.
// Leur id encode la catégorie et le niveau (`_idNiveau`), donc tout ce qui
// change l'un ou l'autre les périme. Elles n'étaient remises à zéro qu'à
// l'ouverture de la modale et au changement d'un select de routage — pas au
// CHARGEMENT D'UN NOUVEAU FICHIER. Enchaîner deux carrières sans fermer la
// modale montrait donc les niveaux de la précédente : « on dirait qu'il
// récupère un cache de la précédente génération », signalé par KARMA.
//
// Une seule fonction pour les quatre points d'invalidation : le prochain
// oubli sera une ligne à ajouter, pas un raisonnement à refaire.
// ⚠️ Ne PAS invalider après une génération réussie : régénérer le même
// fichier (autre largeur de canvas, autre couleur de fond) doit conserver
// les noms saisis. C'est le changement de fichier qui périme, pas l'export.
function _sigImpInvaliderLegende(avecMessage) {
  if (_sigPlanLegend) {
    _sigPlanLegend = null;
    if (avecMessage) _sigLegendeReset = true;
  }
  // Nouveau fichier = ecran neuf : on efface aussi le signal precedent.
  if (!avecMessage) _sigLegendeReset = false;
  _sigImpMajEtatLegende();
}

// 🏷️ v1.83.1 — L ETAT DE LA LEGENDE, DIT EN COULEUR ET A DEUX ENDROITS.
//
// On ne DEVINE pas ce que l utilisateur voulait garder : remapper les entrees
// sur les nouveaux ids apres un changement de routage reviendrait a leur
// inventer un sens (un routage change la semantique d une entree, pas
// seulement son identifiant) — le genre de code qui rend un mauvais nom sans
// le dire. On rend l effacement impossible a rater, c est tout.
function _sigImpMajEtatLegende() {
  const btn   = document.getElementById("kta-sig-imp-legende");
  const eta   = document.getElementById("kta-sig-imp-legende-etat");
  const recap = document.getElementById("kta-sig-imp-legende-recap");
  if (btn) {
    const cleN  = (document.getElementById("kta-sig-imp-niveau") || {}).value || null;
    const cases = document.getElementById("kta-sig-imp-couleurs-niveau");
    btn.style.display = (_sigImportState && cleN && cases && cases.checked) ? "" : "none";
  }
  // Le MESSAGE, lui, ne depend PAS de la visibilite du bouton : les libelles et
  // les couleurs des types built-in partent dans le plan meme si la couleur par
  // niveau a ete decochee entre-temps. L annoncer seulement quand le bouton est
  // la mentirait par omission.
  let txt = "", couleur = "#8892a4";
  if (_sigLegendeReset) {
    txt = "⚠️ " + window.I18n.t("gen.sig.legendeReset");
    couleur = "#ffb380";
  } else {
    const n = _sigImpCompterLegende(_sigPlanLegend);
    if (n) { txt = "🏷️ " + window.I18n.t("gen.sig.legendeEdite", { n: n }); couleur = "#8cb4ff"; }
  }
  [eta, recap].forEach(function (el) {
    if (!el) return;
    el.textContent = txt;
    el.style.color = couleur;
  });
}

// Compte TOUT ce qui a ete personnalise, pas seulement les entrees : depuis que
// libelles, masquages et couleurs voyagent aussi (cf. sigImport.js >
// assemblerLegendePlan), n annoncer que les entrees sous-declarerait ce qui
// part reellement dans le plan.
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
  // Nouveau fichier = nouvelle carrière : réinitialisation SILENCIEUSE. Un
  // « légende réinitialisée » ici serait du bruit, tout l'écran est neuf.
  _sigImpInvaliderLegende(false);

  if (!window.SigImport) {
    status.textContent = T("gen.sig.moduleNonCharge");
    status.style.color = "#ff8c8c";
    return;
  }

  try {
    const { format, data } = await window.SigImport.parseFichier(file);

    // ── Refus CRS : message ACTIONNABLE, pas un simple « erreur ». ──
    const crs = window.SigImport.validerCrs(data);

    // 📐 v1.82.0 — LAMBERT 93 : on convertit au lieu de renvoyer l'utilisateur
    // dans QGIS. La conversion est ANNONCÉE (jamais silencieuse) et le compte
    // de coordonnées reprojetées reste affiché dans le résumé : une
    // reprojection déplace TOUT le fichier, ça ne se fait pas sans le dire.
    let _sigReproj = 0;
    if (!crs.ok && crs.code === "lambert93" && crs.convertible) {
      _sigReproj = window.SigImport.reprojeterLambert93(data);
      data.avertissements = data.avertissements || [];
      // Marqueur porté par le résumé (cf. rendu plus bas) plutôt qu'une clé
      // i18n figée : le compte doit apparaître dans le message.
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

    // Résumé
    const dLat = bounds.latMax - bounds.latMin;
    const dLng = bounds.lngMax - bounds.lngMin;
    let html = '<div><strong>' + format.toUpperCase() + '</strong> — '
             + T("gen.sig.resume", {
                 p: data.points.length, l: data.lignes.length, z: data.polygones.length
               }) + '</div>'
             + '<div style="color:#8892a4; font-size:12px; margin-top:4px;">'
             + '📍 ' + bounds.latMin.toFixed(5) + ', ' + bounds.lngMin.toFixed(5)
             + ' → ' + bounds.latMax.toFixed(5) + ', ' + bounds.lngMax.toFixed(5)
             + ' (Δ ' + dLat.toFixed(5) + '° × ' + dLng.toFixed(5) + '°)</div>';
    // ⚠️ v1.82.0 — au-dela du seuil d alerte, on PREVIENT au lieu de refuser.
    // Le refus sec a 20 000 bloquait un releve reel pour 3 % de depassement.
    // Ce qui reste non mesure, c est le RENDU du plan une fois importe : on le
    // dit franchement plutot que de decider a la place de l utilisateur.
    const _nSig = (data.points||[]).length + (data.lignes||[]).length + (data.polygones||[]).length;
    if (window.SigImport.WARN_FEATURES && _nSig > window.SigImport.WARN_FEATURES) {
      html += '<div style="color:#ffb380; font-size:12px; margin-top:6px; padding:6px 8px;'
            + ' background:rgba(255,179,128,0.08); border-left:3px solid rgba(255,179,128,0.55);'
            + ' border-radius:3px;">⚠️ ' + T("gen.sig.beaucoupFeatures", { n: _nSig }) + '</div>';
    }
    if (_sigReproj > 0) {
      html += '<div style="color:#8cb4ff; font-size:12px; margin-top:6px; padding:6px 8px;'
            + ' background:rgba(140,180,255,0.08); border-left:3px solid rgba(140,180,255,0.5);'
            + ' border-radius:3px;">📐 ' + T("gen.sig.l93Converti", { n: _sigReproj }) + '</div>';
    }
    (data.avertissements || []).forEach(function(a) {
      html += '<div style="color:#ffb380; font-size:12px; margin-top:4px;">⚠️ ' + T(a) + '</div>';
    });
    document.getElementById("kta-sig-imp-resume").innerHTML = html;
    document.getElementById("kta-sig-imp-step-resume").style.display = "";

    // Sélecteur de colonne (option vide = tout au type par défaut)
    const sel = document.getElementById("kta-sig-imp-colonne");
    sel.innerHTML = '<option value="">' + T("gen.sig.colonneAucune") + '</option>'
      + cols.map(function(c) {
          return '<option value="' + _escAttrSig(c.cle) + '">' + _escHtmlSig(c.cle)
               + ' (' + c.nbDistinctes + ')' + (c.probableType ? ' ⭐' : '') + '</option>';
        }).join("");
    if (cols.length > 0 && cols[0].probableType) sel.value = cols[0].cle;

    // Colonne du niveau. Pré-sélectionnée si une colonne s'appelle sans
    // ambiguïté « niveau » / « level » / « etage » : c'est le cas des fichiers
    // d'un atlas découpé (ancien outil decouper-atlas.js), et l'oubli coûte cher (tout
    // l'import se retrouve sur un seul niveau sans que rien ne le signale).
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

    // 🏷️ Le bouton n'a de sens que si des entrées vont réellement être créées
    // (colonne de niveau choisie ET couleurs par niveau cochées). Sinon il
    // ouvrirait un éditeur vide.
    // 🏷️ v1.83.1 — l'affichage de l'état vit maintenant dans
    // `_sigImpMajEtatLegende` (module-level) : `_sigImpInvaliderLegende` doit
    // pouvoir le rafraîchir, et le drapeau `_sigLegendeReset` a supprimé la
    // dépendance à l'ORDRE d'attachement des listeners qu'avait l'ancienne
    // version (le rafraîchissement effaçait le message qu'on venait de poser).
    const majBtnLegende = _sigImpMajEtatLegende;
    const selNiv = document.getElementById("kta-sig-imp-niveau");
    const caseCol = document.getElementById("kta-sig-imp-couleurs-niveau");
    if (caseCol) caseCol.addEventListener("change", majBtnLegende);
    // Le niveau fait partie de l'id de chaque entrée : changer de colonne les
    // périme aussi sûrement que changer le routage. (`_sigImpInvaliderLegende`
    // rafraîchit l'affichage lui-même — un seul listener suffit désormais.)
    if (selNiv) selNiv.addEventListener("change", function () { _sigImpInvaliderLegende(true); });
    const btnLeg = document.getElementById("kta-sig-imp-legende");
    if (btnLeg) btnLeg.addEventListener("click", function () {
      const cleN = (document.getElementById("kta-sig-imp-niveau") || {}).value || null;
      // L'utilisateur reprend la main sur la légende : le signal d'invalidation
      // a fait son travail, il n'a plus lieu d'être affiché.
      _sigLegendeReset = false;
      // Pré-remplir à la PREMIÈRE ouverture avec ce qui SERA généré : sans ça,
      // l'éditeur s'ouvrirait vide et il n'y aurait rien à renommer.
      if (!_sigPlanLegend) {
        // Le MÊME mapping que celui qui sera généré : sans lui, la
        // prévisualisation retombe sur la famille naturelle des géométries.
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

    // 📐 v1.82.0 — la hauteur du canvas n est plus saisie : elle decoule des
    // proportions du terrain. On l affiche pour que l utilisateur sache ce
    // qu il va obtenir, et on la recalcule des qu il change la largeur.
    const majH = function () {
      const eW = document.getElementById("kta-sig-imp-w");
      const eH = document.getElementById("kta-sig-imp-h");
      if (!eW || !eH || !_sigImportState) return;
      const LW = parseInt(eW.value, 10) || 4000;
      // Affiche les dimensions REELLES, plafond de surface compris : sinon on
      // annoncerait une taille que la generation ne produira pas.
      const d = window.SigImport.dimensionsCanvas(_sigImportState.bounds, LW);
      eH.value = d.h;
      // 🎚️ On PRÉVIENT, on ne bloque pas (arbitrage KARMA). La largeur n'est
      // plus rognée : l'utilisateur obtient ce qu'il demande, en sachant ce
      // qu'il risque.
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
    // Les erreurs du moteur SONT des clés i18n — on les traduit telles quelles.
    status.textContent = cle.indexOf("sig.err.") === 0
      ? T(cle) + (err.crsNom ? " (" + err.crsNom + ")" : "") + (err.n ? " (" + err.n + ")" : "")
      : T("gen.sig.err.generique", { err: cle });
  }
}

// 🏛️ v1.82.0 (retour KARMA sur un vrai relevé) — un polygone SIG n'est pas
// forcément une zone : dans une carrière, c'est très souvent un PILIER, donc
// une STRUCTURE. Les deux familles sont proposées dans le même select, en
// deux groupes ; le préfixe `struct:` dit à `SigImport.ingest` où ranger
// l'objet. Idem pour les tracés : un front de taille est une structure en
// polyligne (front-1 / front-2).
const _SIG_TYPES = {
  points:    ["default", "pa", "pb", "pc", "pe", "ps", "salle", "chatiere", "passage", "danger", "info"],
  lignes:    ["chemin", "secondaire", "principal"],
  polygones: ["remblais", "eau", "effondrement", "inaccessible"]
};
// Structures proposées EN PLUS, par famille de géométrie.
// 🔀 v1.82.0 — CHAQUE GÉOMÉTRIE PEUT VISER TOUTES LES FAMILLES. La géométrie
// du fichier SIG ne dit pas ce que l'objet EST : un polygone peut être une
// zone, un pilier, un mur — ou un FRONT DE TAILLE, si son auteur l'a dessiné
// fermé (cas remonté par KARMA sur un relevé réel). Réciproquement une
// polyligne peut porter le contour d'une zone.
// Le préfixe (`struct:`, `zone:`, `trace:`) dit à `SigImport.ingest` dans
// quelle famille ranger l'objet ; sans préfixe, il va dans la famille
// naturelle de sa géométrie.
const _SIG_TYPES_SUP = {
  points:    [],
  lignes:    ["struct:front-1", "struct:front-2", "struct:mur",
              "zone:remblais", "zone:eau", "zone:effondrement", "zone:inaccessible"],
  polygones: ["struct:pilier-1", "struct:pilier-2", "struct:mur",
              "struct:front-1", "struct:front-2",
              "trace:chemin", "trace:secondaire", "trace:principal"]
};
const _SIG_CAT_I18N = { points: "gen.sig.famPoints", lignes: "gen.sig.famLignes", polygones: "gen.sig.famZones" };

// 🏔️ v1.82.0 — APERÇU DE LA RÉPARTITION PAR ÉTAGE, avant de générer.
// Un import multi-niveaux qui retombe à plat ne se voyait qu'une fois le plan
// ouvert, trop tard. Ici le compte par niveau s'affiche dès le choix de la
// colonne — et la case « Plan multi-niveau » se coche toute seule, parce que
// choisir une colonne de niveau ET oublier la case donne exactement le même
// résultat qu'avant : un plan à plat.
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
  box.innerHTML = '<div style="font-size:12px; color:#c8d0e0; padding:6px 8px;'
    + ' background:rgba(140,180,255,0.08); border-left:3px solid rgba(140,180,255,0.5);'
    + ' border-radius:3px;">🏔️ ' + T("gen.sig.niveauApercu", { n: cles.length }) + ' — '
    + cles.map(function(k) { return k + ' : ' + compte[k]; }).join(' · ') + '</div>';
  // Cocher le multi-niveau : sans lui le plan-config ne déclare pas les niveaux.
  const mlvl = document.getElementById("kta-sig-imp-mlvl");
  if (mlvl && cles.length > 1) mlvl.checked = true;
}

function _sigImpRendreTables() {
  const T   = function(k, p) { return window.I18n.t(k, p); };
  const box = document.getElementById("kta-sig-imp-map-tables");
  if (!box || !_sigImportState) return;
  const cle = document.getElementById("kta-sig-imp-colonne").value;
  if (!cle) { box.innerHTML = '<div style="color:#8892a4; font-size:12px;">' + T("gen.sig.mapAucune") + '</div>'; return; }

  const parFam = window.SigImport.valeursParFamille(_sigImportState.data, cle);
  const catPour = { points: null, lignes: "traces", polygones: "zones" };
  let html = "";
  ["points", "lignes", "polygones"].forEach(function(fam) {
    const vals = parFam[fam] || [];
    if (vals.length === 0) return;
    const propose = catPour[fam] ? window.SigImport.proposerMapping(vals, catPour[fam]) : {};
    // Le pré-remplissage regarde AUSSI les structures : « pilier » doit tomber
    // sur pilier-1 tout seul, sinon la nouveauté ne sert à personne.
    if ((_SIG_TYPES_SUP[fam] || []).length) {
      const ps = window.SigImport.proposerMapping(vals, "structures");
      Object.keys(ps).forEach(function(v) { if (!propose[v] && ps[v]) propose[v] = ps[v]; });
    }
    html += '<div style="margin-top:10px;"><div class="kta-cfg-label">' + T(_SIG_CAT_I18N[fam]) + '</div>';
    vals.forEach(function(v) {
      const sugg = propose[v] || "";
      html += '<div style="display:flex; align-items:center; gap:8px; margin-top:4px;">'
           +  '<span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:#c0c8d8;" title="' + _escAttrSig(v) + '">' + _escHtmlSig(v) + '</span>'
           +  '<select class="kta-cfg-input" data-sig-fam="' + fam + '" data-sig-val="' + _escAttrSig(v) + '" style="flex:0 0 46%;">'
           +  (function() {
                const opt = function(t) {
                  // Le libellé montre le type, pas le préfixe technique.
                  const lib = t.replace(/^(struct|zone|trace):/, "");
                  return '<option value="' + t + '"' + (t === sugg ? " selected" : "") + '>' + lib + '</option>';
                };
                const zonesHtml = _SIG_TYPES[fam].map(opt).join("");
                const st = _SIG_TYPES_SUP[fam] || [];
                if (!st.length) return zonesHtml;
                // Deux groupes nommés : sans eux, « pilier-1 » et « remblais »
                // se retrouvent dans la même liste plate et rien ne dit qu'ils
                // ne produisent pas le même genre d'objet.
                return '<optgroup label="' + T("gen.sig.grpZones") + '">' + zonesHtml + '</optgroup>'
                     + '<optgroup label="' + T("gen.sig.grpStructures") + '">' + st.map(opt).join("") + '</optgroup>';
              })()
           +  '</select></div>';
    });
    html += '</div>';
  });
  box.innerHTML = html || '<div style="color:#8892a4; font-size:12px;">' + T("gen.sig.mapVide") + '</div>';

  // 🩸 Changer le routage change les ID des entrées de légende : celles déjà
  // éditées ne seraient plus retrouvées et l'utilisateur perdrait ses noms
  // sans comprendre. On repart d'une légende vierge, et le bouton se
  // réactualise pour le dire.
  box.querySelectorAll("select[data-sig-fam]").forEach(function (s) {
    s.addEventListener("change", function () {
      _sigImpInvaliderLegende(true);
    });
  });
}

function _escHtmlSig(s) { return window.ktaEsc(s); }
function _escAttrSig(s) { return window.ktaEsc(s); }

// 🏷️ v1.82.0 — LECTURE DU MAPPING, extraite pour être partagée.
// La génération n'est plus seule à en avoir besoin : la prévisualisation des
// entrées de légende doit rejouer EXACTEMENT le même routage, sinon elle
// annonce des tracés et des zones là où l'utilisateur a demandé des
// structures (bug remonté par KARMA).
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

  // Relecture de l'écran de correspondance
  const _m = _sigImpLireMapping();
  const cle = _m.cle, mapTags = _m.mapTags, mapTraces = _m.mapTraces, mapZones = _m.mapZones;

  btnGen.disabled = true;
  btnGen.textContent = T("gen.sig.generation");
  status.style.color = "#8cb4ff";
  status.textContent = T("gen.sig.generation");

  // Declare AVANT le try : le finally doit pouvoir le retirer, y compris
  // quand la generation echoue. Declare a l interieur, il etait hors de
  // portee et la popup restait a l ecran.
  let v2Overlay = null;
  try {
    // 📊 v1.82.0 — barre de progression du tuilage, calquée sur celle de
    // l'import GPX (même overlay, mêmes clés i18n). Sans elle, la génération
    // d'un gros plan est une attente muette de plusieurs secondes.
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
      tags:         _lireTagsChamp("kta-sig-imp-tags"),   // 🏷️ 16/09/2026
      canvasWidth:  parseInt(document.getElementById("kta-sig-imp-w").value, 10) || 4000,
      // 🧹 v1.82.0 — `canvasHeight` RETIRÉ : `genererZipMyktamap` ne le lit plus
      // depuis que la hauteur est déduite du terrain. Le passer entretenait
      // l'illusion qu'il servait encore.
      onProgress:   onTilingProgress,
      canvasColor:  (document.querySelector('input[name="sig_imp_color"]:checked') || {}).value || "sepia",
      multiLevel:   document.getElementById("kta-sig-imp-mlvl").checked,
      layerLabel:   name,
      mapping: { cleType: cle, mapTags: mapTags, mapTraces: mapTraces, mapZones: mapZones,
                 // 🏔️ v1.82.0 — la colonne du niveau voyage avec le reste du mapping.
                 cleNiveau: (document.getElementById("kta-sig-imp-niveau") || {}).value || null,
                 // 🎨 v1.82.0 — types de legende par etage (case cochee par defaut).
                 couleurParNiveau: !!(document.getElementById("kta-sig-imp-couleurs-niveau") || {}).checked,
                 // 🏷️ Entrées renommées/recolorées par l'utilisateur, s'il
                 // a ouvert l'éditeur. Sinon `ingest` les fabrique lui-même.
                 customEntries: (_sigPlanLegend && _sigPlanLegend.customEntries) || null,
                 // 🏷️ v1.83.1 — et l'état COMPLET, pour ce que `ingest` ne
                 // regarde pas : libellés des types built-in, masquages,
                 // couleurs, entrées ajoutées à la main. `customEntries`
                 // ci-dessus reste : c'est par lui qu'`ingest` retrouve le
                 // libellé édité d'une entrée par niveau, au moment où il la
                 // fabrique. Les deux ne font pas le même travail.
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
    // 🩸 v1.82.0 — RETRAIT DE L OVERLAY DE PROGRESSION. Il etait cree mais
    // jamais retire : le ZIP se telechargeait bien, et la popup "tuiles V2 en
    // cours" restait figee a l ecran, donnant l impression que la generation
    // n avait pas abouti. Dans le finally, donc retire aussi quand la
    // generation echoue - sinon une erreur laissait l ecran bloque.
    if (v2Overlay && v2Overlay.parentNode) v2Overlay.remove();
    btnGen.disabled = false;
    btnGen.textContent = T("gen.imp.genererBtn");
  }
}

window.afficherImporterSig = _afficherImporterSig;

// 🗺️ GEOTIFF DEPOSE DEPUIS L'ACCUEIL — jumelle de `afficherImporterSig`.
// L'accueil est l'endroit EVIDENT ou deposer un fichier (lecon v1.75.2 sur le
// SIG : il y etait refuse, et la conversion n'etait atteignable que depuis le
// Generateur). Un .tif y tombait sur « le fichier doit etre une archive .zip ».
//
// ⚠️ CE N'EST PAS UNE MODALE D'IMPORT. Le KMZ, le GPX et le SIG produisent un
// PLAN ENTIER, donc chacun ouvre son ecran de conversion. Un GeoTIFF est une
// IMAGE DE FOND deja calee : il n'y a rien a faire correspondre, rien a
// choisir. On ouvre donc directement le Generateur avec l'image posee, le
// georef et l'echelle remplis — il ne reste qu'a nommer le plan.
function _afficherImporterGeoTiff(fichier) {
  if (!fichier) return false;
  // Le Generateur est un toggle : appele modale ouverte, il la FERME. On ne
  // l'ouvre donc que s'il est absent.
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

// 🖼️ IMAGE DÉPOSÉE SUR « CHARGER UN PLAN » (12/10/2026, demande KARMA) — un .jpg/.png/.webp n'est pas un plan
// mais l'IMAGE DE FOND d'un plan à créer : même injection que le GeoTIFF (pas de géoréf ici, l'image n'en porte
// pas), puis arrivée directe sur l'étape « Nom », préremplie avec le nom du fichier et sélectionnée pour être
// retapée. Un nom déjà saisi n'est jamais écrasé.
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
