/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// EDITOR.JS — Points de session : formulaire plein écran (tags, photos), édition, repositionnement, suppression
// =========================
// Expose : initEditor, afficherFormulaire, renderEditorPoints, setEditorPoints, supprimerPointEditor,
// repositionnerPointEditor, _applyLevelFilterToEditorPoints, _refreshEditorMarkersViewport.
// 🩸 layerEditor contient AUSSI les roads et zones de session : jamais layerEditor.clearLayers(), on retire
// seulement nos marqueurs (_markersEditor).
// Coordonnées : convertCoord(x, y) = [imageHeight - y, x]. Garde-fous : check-repositionner.js, check-uid.js,
// check-icon-catalog.js. Doc : docs/architecture/session-data.md.

window.modeEdition = false;
let listePoints = [];

// Marqueurs Leaflet créés par _ajouterMarker, pour les retirer SÉLECTIVEMENT au re-rendu (layerEditor contient
// aussi les roads et zones de session : clearLayers les ferait disparaître à la suppression d'UN point).
let _markersEditor = [];
let _editorClickHandler = null;  // ref stable pour un off idempotent (cf. initEditor / measure.js)

const EDITOR_TAG_LABELS = {
  salle:    "Salle",
  pa:       "Puits Aération",
  pc:       "Puits Comblé",
  pb:       "Puits Bouché",
  pe:       "Puits au sol / Bassin",
  ps:       "Puits extraction",
  psf:      "Puits d'extraction comblé",
  peo:      "Puits à échelon ouvert",
  pef:      "Puits à échelon fermé",
  eso:      "Escalier service ouvert",
  esf:      "Escalier service fermé",
  cao:      "Cavage ouvert",
  caf:      "Cavage fermé",
  jes:      "Escalier entre niveaux",
  jpe:      "Puits à échelons entre niveaux",
  jps:      "Puits sans échelon entre niveaux",
  passage:  "Passage",
  chatiere: "Chatière",
  vehicule: "Véhicule",
  danger:   "Danger",
  info:     "Information",
  elec:     "Électricité",
  epure:    "Épure",
  plaque:   "Plaque indication",
  portail:  "Portail (liaison inter-plan)",
  // Point d'entrée du plan (Vue OSM × Mode Secours).
  entree_plan: "🚪 Point d'entrée du plan"
};

const EDITOR_EXCLURE = ["default", "track"];

// Le mode édition s'arme par le bouton ✏️ (interface.js), qui porte la garde lecture seule.

// ── Init ──────────
function initEditor() {
  // Reset complet (comme initZones / initMeasure) : sinon listePoints survit au changement de plan et le
  // polling SessionPersist réenregistre les points de l'ancien plan sous l'ID du nouveau.
  listePoints = [];
  // Nos marqueurs seulement (cf. _markersEditor).
  _markersEditor.forEach(function(m) { try { m.remove(); } catch(e) {} });
  _markersEditor = [];

  // Binding du clic idempotent (cf. measure.js) : l'ancien handler est retiré de la carte avant d'en poser un,
  // sinon les map.on('click') s'EMPILENT (1 clic = N formulaires POI).
  if (window.map && _editorClickHandler) {
    try { window.map.off("click", _editorClickHandler); } catch (e) {}
  }
  _editorClickHandler = function(e) {
    if (!window.modeEdition) return;
    if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) { window.modeEdition = false; return; }   // 🔒 lecture seule
    if (document.getElementById("kta-poi-modal")) return; // évite double clic

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const x   = Math.round(lng);
    const y   = Math.round(APP_CONFIG.imageHeight - lat);

    afficherFormulaire(x, y);
  };
  window.map.on("click", _editorClickHandler);
}

// ── Options dynamiques (tags connus + tags du plan-config) ──────────
function _buildTypeOptionsHTML(selectedTag) {
  const icons = window.PLAN_CONFIG?.icons || {};

  // Tags = EDITOR_TAG_LABELS + tags du plan-config (customs d'un plan) : un type reste TOUJOURS sélectionnable,
  // même sans icône déclarée (_iconMap[tag] ou icône par défaut).
  const tagsSet = new Set(Object.keys(EDITOR_TAG_LABELS));
  Object.keys(icons).forEach(function(k) {
    if (!EDITOR_EXCLURE.includes(k)) tagsSet.add(k);
  });
  EDITOR_EXCLURE.forEach(function(k) { tagsSet.delete(k); });

  // Les ICÔNES CUSTOM de la légende sont des tags sélectionnables (icône résolue par _iconMap[id], enregistrée
  // par map.js et mise à jour par onCustomEntriesChange).
  const customIconLabels = {};
  if (window.LegendCustomization && typeof window.LegendCustomization.listCustomEntries === "function") {
    try {
      window.LegendCustomization.listCustomEntries("icones").forEach(function(e) {
        if (e && e.id && e.iconUrl) {
          tagsSet.add(e.id);
          customIconLabels[e.id] = "✨ " + (e.label || e.id);
        }
      });
    } catch(e) {}
  }

  // Tri : tags labellisés (ordre d'EDITOR_TAG_LABELS), puis customs non labellisés.
  const known   = Object.keys(EDITOR_TAG_LABELS).filter(function(k) { return tagsSet.has(k); });
  const custom  = [...tagsSet].filter(function(k) { return !EDITOR_TAG_LABELS[k]; });
  const orderedTags = known.concat(custom);

  let html = '<option value="">' + window.I18n.t("editor.options.none") + '</option>';
  html += orderedTags.map(function(tag) {
    // Libellé intégré par i18n ("editor.tag.<tag>"), icône custom par son libellé de légende, sinon tag brut.
    const label = EDITOR_TAG_LABELS[tag] ? window.I18n.t("editor.tag." + tag)
                : (customIconLabels[tag] || tag);
    const sel   = tag === selectedTag ? ' selected' : '';
    return `<option value="${tag}"${sel}>${label}</option>`;
  }).join("");

  html += '<option value="__new__">' + window.I18n.t("editor.options.newTag") + '</option>';
  return html;
}

// ── Formulaire (modale plein écran) ──────────
//   afficherFormulaire(x, y)                → AJOUT
//   afficherFormulaire(x, y, existingPoint) → ÉDITION, directement sur la référence du point dans listePoints
//                                             (mutation en place) ; le marqueur est re-rendu au save.
// Photos en IDB, écrites immédiatement et nettoyées à l'annulation.
function afficherFormulaire(x, y, existingPoint) {
  const existing = document.getElementById("kta-poi-modal");
  if (existing) existing.remove();

  const isEdit = !!(existingPoint && typeof existingPoint === "object");
  const _majOuverture = isEdit ? existingPoint.updatedAt : null;   // conflit : modifié ailleurs pendant l'édition ?
  const titreModale  = isEdit ? window.I18n.t("editor.modal.titleEdit") : window.I18n.t("editor.modal.titleAdd");
  const labelBouton  = isEdit ? window.I18n.t("editor.modal.btnSave")   : window.I18n.t("editor.modal.btnAdd");
  const tagInitial   = isEdit && existingPoint.tags && existingPoint.tags.length > 0
                       ? existingPoint.tags[0]
                       : "";
  const nomInitial   = isEdit ? (existingPoint.nom || "") : "";
  // Liste « Niveau » : ÉDITION seulement (à l'ajout, le point prend le niveau actif), "" hors multi-niveau.
  const niveauInitial = (isEdit && Number.isInteger(existingPoint.level)) ? existingPoint.level : 0;
  const optionsNiveau = (isEdit && typeof window.ktaOptionsNiveauHtml === "function")
    ? window.ktaOptionsNiveauHtml(niveauInitial) : "";
  const descInitial  = isEdit ? (existingPoint.description || "") : "";

  // Échappement du préremplissage (une apostrophe casserait l'attribut value).
  function _esc(s) { return window.ktaEsc(s); }

  // Plan courant pour MyKTAMapPhotos (repli "default" comme sessionExporter.js).
  const planId = window._currentLoadedPlanId || "default";

  // Clé des photos = UID du point :
  //   - édition : l'uid du point (son nom en repli s'il n'en a pas) ; les photos encore rangées sous le nom
  //     restent lues (double lecture) ;
  //   - ajout : l'uid du FUTUR point, tiré ici et posé à la validation : les photos prises avant le nom sont
  //     déjà sous leur clé définitive.
  let _photoPointId;
  let _uidAjout = null;
  if (isEdit) {
    _photoPointId = String(existingPoint.uid || existingPoint.id || existingPoint.nom || "");
  } else if (window.KtaUid) {
    _uidAjout = window.KtaUid.genUid("pt");
    _photoPointId = _uidAjout;
  } else {
    _photoPointId = "_temp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  // PhotoIds manipulés dans CETTE ouverture : ajoutées (supprimées si Annuler) / à supprimer (commit au Save,
  // ignorées si Annuler).
  const _photosAddedThisSession = new Set();
  const _photosPendingDelete    = new Set();

  // Métadonnées des photos en mémoire ([{id, blob, mime, size, ...}]) : pas de relecture IDB à chaque rendu.
  let _photosCacheMeta = [];
  // objectURL révoquées à la fermeture (fuite mémoire sinon).
  const _photoObjectUrls = new Set();

  const modal = document.createElement("div");
  modal.id = "kta-poi-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:90vh;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">${titreModale}</span>
        <button class="kta-panneau-close" id="kta-poi-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("editor.section.position")}</div>
          <div style="font-size:13px; color:var(--kta-texte-3); padding:4px 0;">
            X : <strong style="color:var(--kta-texte);">${x}</strong> — Y : <strong style="color:var(--kta-texte);">${y}</strong>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("editor.section.infos")}</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">${window.I18n.t("editor.field.name")} <span style="color:var(--kta-erreur);">*</span></label>
            <input class="kta-cfg-input" id="kta-poi-nom" type="text" value="${_esc(nomInitial)}" placeholder="${window.I18n.t("editor.field.namePlaceholder")}" autocomplete="off">

            <label class="kta-cfg-label">${window.I18n.t("editor.field.type")}</label>
            <select class="kta-cfg-input" id="kta-poi-type">${_buildTypeOptionsHTML(tagInitial)}</select>
            ${optionsNiveau ? `
            <label class="kta-cfg-label" for="kta-poi-niveau">${_esc(window.I18n.t("niveauObjet.label"))}</label>
            <select class="kta-cfg-input" id="kta-poi-niveau">${optionsNiveau}</select>` : ""}
          </div>
          ${window.KtaPoiJonction ? window.KtaPoiJonction.htmlFormulaire(tagInitial) : ""}

          <div id="kta-poi-newtag-wrap" style="display:none; margin-top:8px;">
            <label class="kta-cfg-label" style="display:block; margin-bottom:4px;">${window.I18n.t("editor.field.newTag")}</label>
            <input class="kta-cfg-input" id="kta-poi-newtag" type="text" placeholder="${window.I18n.t("editor.field.newTagPlaceholder")}" autocomplete="off">
            <p style="font-size:11px; color:var(--kta-texte-3); margin:4px 0 0;">
              ${window.I18n.t("editor.field.newTagHint")}
            </p>
          </div>

          <div style="margin-top:10px;">
            <label class="kta-cfg-label" style="display:block; margin-bottom:4px;">${window.I18n.t("editor.field.description")}</label>
            <textarea class="kta-cfg-input" id="kta-poi-desc"
              style="min-height:70px; resize:vertical; font-family:inherit;"
              placeholder="${window.I18n.t("editor.field.descPlaceholder")}">${_esc(descInitial)}</textarea>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">
            ${window.I18n.t("editor.section.photos")}
            <span id="kta-poi-photos-counter" class="kta-poi-photos-counter">${window.I18n.t("editor.photos.counter", { n: 0, max: 5 })}</span>
          </div>
          <div id="kta-poi-photos-grid" class="kta-poi-photos-grid"></div>
          <div id="kta-poi-photos-actions" class="kta-poi-photos-actions">
            <button class="kta-btn kta-btn-ghost kta-poi-photos-btn" id="kta-poi-photos-camera" type="button">
              ${window.I18n.t("editor.photos.btnCamera")}
            </button>
            <button class="kta-btn kta-btn-ghost kta-poi-photos-btn" id="kta-poi-photos-galerie" type="button">
              ${window.I18n.t("editor.photos.btnGallery")}
            </button>
          </div>
          <input type="file" accept="image/*" capture="environment" id="kta-poi-photos-input-camera"  style="display:none;">
          <input type="file" accept="image/*" multiple                id="kta-poi-photos-input-galerie" style="display:none;">
          <p id="kta-poi-photos-hint" class="kta-poi-photos-hint">
            ${window.I18n.t("editor.photos.hint")}
          </p>
        </div>

        <div id="kta-poi-erreur" class="kta-conv-erreur" style="display:none;"></div>

        <div class="kta-conv-actions" style="margin-top:14px;">
          <button class="kta-btn kta-btn-ghost"   id="kta-poi-annuler">${window.I18n.t("editor.btn.cancel")}</button>
          <button class="kta-btn kta-btn-primary" id="kta-poi-valider">${labelBouton}</button>
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

  const photoGrid       = document.getElementById("kta-poi-photos-grid");
  const photoCounter    = document.getElementById("kta-poi-photos-counter");
  const photoBtnCamera  = document.getElementById("kta-poi-photos-camera");
  const photoBtnGalerie = document.getElementById("kta-poi-photos-galerie");
  const photoInputCam   = document.getElementById("kta-poi-photos-input-camera");
  const photoInputGal   = document.getElementById("kta-poi-photos-input-galerie");

  // Fiche du point portée par chaque photo (retrouver le point s'il est supprimé, cf. js/photos.js) : l'état du
  // formulaire à l'ajout, remis à jour à l'enregistrement (majFichesPoints).
  function _ficheCourante() {
    const tagForm = (selectType.value && selectType.value !== "__new__") ? selectType.value : (tagInitial || null);
    let niveau = null;
    if (isEdit) niveau = Number.isInteger(existingPoint.level) ? existingPoint.level : null;
    else if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) niveau = window.APP_CONFIG.activeLevel || 0;
    return { nom: inputNom.value.trim() || nomInitial, x: x, y: y, niveau: niveau, type: tagForm, maj: Date.now() };
  }

  function setErr(msg) {
    erreurEl.textContent  = msg || "";
    erreurEl.style.display = msg ? "block" : "none";
  }

  // Nettoyage commun aux fermetures (le save a le sien) : révoque les objectURL.
  function _cleanupObjectUrls() {
    _photoObjectUrls.forEach(function(u) {
      try { URL.revokeObjectURL(u); } catch(e) {}
    });
    _photoObjectUrls.clear();
  }

  function fermer() { _cleanupObjectUrls(); modal.remove(); }

  // Annuler : supprime les photos ajoutées pendant cette ouverture ; les suppressions en attente ne sont PAS
  // appliquées (rien n'a été supprimé en IDB).
  function annuler() {
    if (!window.MyKTAMapPhotos || _photosAddedThisSession.size === 0) {
      // 🩸 Garde STRICTE : seulement en AJOUT et sur la clé tirée pour ce point qui n'existe pas encore. Jamais
      // sur un point existant : ses photos seraient supprimées pour de bon.
      if (!isEdit && window.MyKTAMapPhotos &&
          (_photoPointId === _uidAjout || _photoPointId.indexOf("_temp_") === 0)) {
        window.MyKTAMapPhotos.deletePhotosForPoint(planId, _photoPointId)
          .catch(function(e) { console.warn("[Editor] cleanup _temp_ photos :", e); });
      }
      fermer();
      return;
    }
    // Édition : suppression précise des photos ajoutées pendant cette ouverture.
    const promises = [];
    _photosAddedThisSession.forEach(function(photoId) {
      promises.push(window.MyKTAMapPhotos.deletePhoto(photoId));
    });
    Promise.all(promises).catch(function(e) {
      console.warn("[Editor] cleanup photos session :", e);
    }).finally(fermer);
  }

  // Niveaux desservis d'un passage (poiJonction.js) : bloc affiché selon le tag, niveau du point toujours coché.
  const selNiveauForm = document.getElementById("kta-poi-niveau");
  const _jonction = window.KtaPoiJonction ? window.KtaPoiJonction.brancherFormulaire(modal, {
    x: x, y: y, point: isEdit ? existingPoint : null,
    tag: function() { return (selectType.value && selectType.value !== "__new__") ? selectType.value : ""; },
    level: function() {
      if (selNiveauForm) { const n = Number.parseInt(selNiveauForm.value, 10); if (Number.isInteger(n)) return n; }
      if (isEdit) return niveauInitial;
      return (window.APP_CONFIG && Number.isInteger(window.APP_CONFIG.activeLevel)) ? window.APP_CONFIG.activeLevel : 0;
    }
  }) : null;
  if (_jonction && selNiveauForm) selNiveauForm.addEventListener("change", _jonction.rafraichir);

  selectType.addEventListener("change", function() {
    if (selectType.value === "__new__") {
      newTagWrap.style.display = "block";
      setTimeout(function() { inputNewTag.focus(); }, 30);
    } else {
      newTagWrap.style.display = "none";
    }
    if (_jonction) _jonction.rafraichir();
  });

  btnClose.addEventListener("click", annuler);
  btnAnnuler.addEventListener("click", annuler);
  modal.addEventListener("click", function(e) { if (e.target === modal) annuler(); });

  // Leaflet ne capture pas les événements tactiles de la modale.
  L.DomEvent.disableClickPropagation(modal);

  // ── Photos : handlers ──────────
  // Compteur « N / 5 » (cache - suppressions en attente), boutons d'ajout désactivés à saturation.
  function _refreshCounterAndButtons() {
    const visible = _photosCacheMeta.filter(function(p) {
      return !_photosPendingDelete.has(p.id);
    }).length;
    const max  = window.MyKTAMapPhotos ? window.MyKTAMapPhotos.MAX_PHOTOS_PER_POINT : 5;
    photoCounter.textContent = window.I18n.t("editor.photos.counter", { n: visible, max: max });
    const full = visible >= max;
    photoBtnCamera.disabled  = full;
    photoBtnGalerie.disabled = full;
    if (full) {
      photoBtnCamera.title  = window.I18n.t("editor.photos.maxReached", { max: max });
      photoBtnGalerie.title = window.I18n.t("editor.photos.maxReached", { max: max });
    } else {
      photoBtnCamera.title  = "";
      photoBtnGalerie.title = "";
    }
  }

  // Grille re-rendue depuis _photosCacheMeta ; vignettes en attente de suppression grisées.
  function _renderPhotoGrid() {
    photoGrid.innerHTML = "";
    if (_photosCacheMeta.length === 0) {
      photoGrid.innerHTML = '<div class="kta-poi-photos-empty">' + window.I18n.t("editor.photos.empty") + '</div>';
      return;
    }
    _photosCacheMeta.forEach(function(p) {
      const isPending = _photosPendingDelete.has(p.id);
      const isPlaceholder = !p._objectUrl;  // compression en cours
      const thumb = document.createElement("div");
      thumb.className = "kta-poi-photo-thumb" + (isPending ? " kta-poi-photo-thumb-pending" : "");
      thumb.dataset.photoId = p.id;
      if (p._objectUrl) {
        const img = document.createElement("img");
        img.src = p._objectUrl;
        img.alt = "photo";
        img.loading = "lazy";
        thumb.appendChild(img);
        // Toucher une miniature ouvre la visionneuse, sauf placeholder (compression) ou suppression en attente.
        // ⚠️ La visionneuse reçoit la liste FILTRÉE des photos visibles, sinon l'index ne correspond pas.
        if (!isPending && !isPlaceholder) {
          thumb.style.cursor = "zoom-in";
          thumb.addEventListener("click", function(ev) {
            // Le ✕ n'ouvre pas la visionneuse.
            if (ev.target && ev.target.classList.contains("kta-poi-photo-del")) return;
            if (!window.MyKTAMapPhotoViewer) {
              console.warn("[Editor] MyKTAMapPhotoViewer indisponible");
              return;
            }
            const visible = _photosCacheMeta.filter(function(q) {
              return q._objectUrl && !_photosPendingDelete.has(q.id);
            });
            const idx = visible.findIndex(function(q) { return q.id === p.id; });
            window.MyKTAMapPhotoViewer.open(visible, Math.max(0, idx));
          });
        }
      } else {
        // Placeholder (compression en cours, cf. _ajouterPhotoBlob).
        thumb.innerHTML = '<div class="kta-poi-photo-spinner">⏳</div>';
      }
        // ✕ : suppression en attente, appliquée au save.
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "kta-poi-photo-del";
      btnDel.title = isPending ? window.I18n.t("editor.photos.restoreTitle") : window.I18n.t("editor.photos.removeTitle");
      btnDel.textContent = isPending ? "↺" : "✕";
      btnDel.addEventListener("click", function(ev) {
        ev.stopPropagation();
        if (isPending) {
          _photosPendingDelete.delete(p.id);
        } else {
          _photosPendingDelete.add(p.id);
        }
        _renderPhotoGrid();
        _refreshCounterAndButtons();
      });
      thumb.appendChild(btnDel);
      photoGrid.appendChild(thumb);
    });
  }

  // Photos existantes en mémoire (édition seulement ; en ajout la clé est neuve, rien à charger).
  function _loadExistingPhotos() {
    if (!isEdit || !window.MyKTAMapPhotos) {
      _renderPhotoGrid();
      _refreshCounterAndButtons();
      return;
    }
    // Double lecture : sous l'uid du point et sous son nom (photos pas encore migrées).
    const _lecture = (window.MyKTAMapPhotos.getPhotosForPointRef && existingPoint.uid)
      ? window.MyKTAMapPhotos.getPhotosForPointRef(planId, { uid: existingPoint.uid, id: existingPoint.id })
      : window.MyKTAMapPhotos.getPhotosForPoint(planId, _photoPointId);
    _lecture.then(function(arr) {
      _photosCacheMeta = arr.map(function(rec) {
        const url = URL.createObjectURL(rec.blob);
        _photoObjectUrls.add(url);
        return {
          id:        rec.id,
          mime:      rec.mime,
          size:      rec.size,
          createdAt: rec.createdAt,
          _objectUrl: url
        };
      });
      _renderPhotoGrid();
      _refreshCounterAndButtons();
      _completerParExtension();
    }).catch(function(e) {
      console.warn("[Editor] _loadExistingPhotos erreur :", e);
      _renderPhotoGrid();
      _refreshCounterAndButtons();
    });
  }

  // Installation reliée : l'extension dépose les photos manquantes de ce point (prise `photos`, 8 s max) ; si
  // elle en dépose, la grille est relue en gardant les ajouts et retraits en cours. Une fois par ouverture.
  let _completeFait = false;
  function _completerParExtension() {
    const K = window.KtaExtensions;
    if (_completeFait || !isEdit || !K || typeof K.aPrise !== "function" || !K.aPrise("photos")) return;
    _completeFait = true;
    K.photosCompleterPoint(planId, _photoPointId).then(function(n) {
      if (!n || !modal.isConnected) return;
      const lecture = (window.MyKTAMapPhotos.getPhotosForPointRef && existingPoint.uid)
        ? window.MyKTAMapPhotos.getPhotosForPointRef(planId, { uid: existingPoint.uid, id: existingPoint.id })
        : window.MyKTAMapPhotos.getPhotosForPoint(planId, _photoPointId);
      return lecture.then(function(arr) {
        const connus = new Set(_photosCacheMeta.map(function(p) { return p.id; }));
        arr.forEach(function(rec) {
          if (connus.has(rec.id)) return;
          const url = URL.createObjectURL(rec.blob);
          _photoObjectUrls.add(url);
          _photosCacheMeta.push({ id: rec.id, mime: rec.mime, size: rec.size, createdAt: rec.createdAt, _objectUrl: url });
        });
        _renderPhotoGrid();
        _refreshCounterAndButtons();
      });
    }).catch(function(e) { console.warn("[Editor] photos de l'extension :", e); });
  }

  // Upload d'une photo : placeholder immédiat, compression + écriture IDB en arrière-plan, puis vraie
  // miniature. Erreur → toast + placeholder retiré.
  function _ajouterPhotoBlob(blob) {
    if (!window.MyKTAMapPhotos) {
      setErr(window.I18n.t("editor.err.photoModule"));
      return;
    }
    const placeholderLocalId = "_pending_" + Math.random().toString(36).slice(2, 10);
    _photosCacheMeta.push({
      id:        placeholderLocalId,
      _pending:  true,
      _objectUrl: null
    });
    _renderPhotoGrid();
    _refreshCounterAndButtons();

    window.MyKTAMapPhotos.addPhoto(planId, _photoPointId, blob, { fiche: _ficheCourante() }).then(function(photoId) {
      return window.MyKTAMapPhotos.getPhoto(photoId).then(function(rec) {
        if (!rec) throw new Error("photo introuvable après addPhoto");
        const idx = _photosCacheMeta.findIndex(function(p) { return p.id === placeholderLocalId; });
        if (idx === -1) return; // user a fermé entre-temps
        const url = URL.createObjectURL(rec.blob);
        _photoObjectUrls.add(url);
        _photosCacheMeta[idx] = {
          id:         rec.id,
          mime:       rec.mime,
          size:       rec.size,
          createdAt:  rec.createdAt,
          _objectUrl: url
        };
        _photosAddedThisSession.add(rec.id);
        _renderPhotoGrid();
        _refreshCounterAndButtons();
      });
    }).catch(function(err) {
      console.warn("[Editor] ajout photo erreur :", err);
      const idx = _photosCacheMeta.findIndex(function(p) { return p.id === placeholderLocalId; });
      if (idx !== -1) _photosCacheMeta.splice(idx, 1);
      _renderPhotoGrid();
      _refreshCounterAndButtons();
      const msg = (err && err.code === "QUOTA_PER_POINT")
        ? window.I18n.t("editor.err.photoQuotaPoint")
        : (err && err.code === "QUOTA_EXCEEDED")
          ? window.I18n.t("editor.err.photoQuotaDisk")
          : (err && err.code === "QUOTA_DEVICE")
            ? window.I18n.t("editor.err.photoQuotaDevice")
            : (err && err.code === "PHOTO_ILLISIBLE")
              ? window.I18n.t("editor.err.photoIllisible")
              : window.I18n.t("editor.err.photoAdd", { msg: (err && err.message ? err.message : err) });
      setErr(msg);
      setTimeout(function() { setErr(""); }, 5000);
    });
  }

  function _onFileChange(ev) {
    const files = ev.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      _ajouterPhotoBlob(files[i]);
    }
    // Réinitialisé pour pouvoir resélectionner le même fichier.
    ev.target.value = "";
  }

  photoBtnCamera.addEventListener("click",  function() { photoInputCam.click(); });
  photoBtnGalerie.addEventListener("click", function() { photoInputGal.click(); });
  photoInputCam.addEventListener("change",  _onFileChange);
  photoInputGal.addEventListener("change",  _onFileChange);

  _loadExistingPhotos();

  // ── Validation : save ──────────
  btnValider.addEventListener("click", async function() {
    const nom = inputNom.value.trim();
    if (!nom) { setErr(window.I18n.t("editor.err.nameRequired")); inputNom.focus(); return; }
    // Installation reliée : le point a été remplacé (modifié ou supprimé par un autre compte) pendant l'édition ;
    // sans ce test, l'enregistrement partirait dans un objet hors de la liste, perdu en silence.
    if (isEdit && existingPoint.uid && window.KtaExtensions && typeof window.KtaExtensions.recuADistance === "function" &&
        window.KtaExtensions.recuADistance(existingPoint.uid)) {
      const courant = listePoints.find(function(p) { return p && p.uid === existingPoint.uid; });
      if (courant !== existingPoint || (courant && courant.updatedAt !== _majOuverture)) {
        const ok = (typeof window.ktaConfirm === "function")
          ? await window.ktaConfirm(window.I18n.t(courant ? "editor.conflit.modifie" : "editor.conflit.supprime"),
              { okLabel: window.I18n.t("editor.conflit.garder"), cancelLabel: window.I18n.t("editor.conflit.abandonner") })
          : (console.warn("[Editor] ktaConfirm indisponible : conflit de synchro, modification abandonnée"), false);
        if (!ok) { fermer(); return; }
        if (courant) existingPoint = courant;
        else { listePoints.push(existingPoint); if (window.KtaUid) window.KtaUid.touch(existingPoint); }
      }
    }

    let tag = selectType.value;

    // Nouveau tag créé à la volée.
    if (tag === "__new__") {
      const nouveau = inputNewTag.value.trim().toLowerCase().replace(/\s+/g, "_");
      if (!nouveau) { setErr(window.I18n.t("editor.err.tagInvalid")); inputNewTag.focus(); return; }
      if (!/^[a-z0-9_-]+$/.test(nouveau)) {
        setErr(window.I18n.t("editor.err.tagChars"));
        inputNewTag.focus();
        return;
      }
      tag = nouveau;

      // Tag ajouté à PLAN_CONFIG.icons (icône par défaut). ⚠️ Jamais pour un id `cust-…` : PLAN_CONFIG.icons est
      // lu EN PREMIER par getIconUrlForPoint et masquerait l'icône custom de la légende dans tous les exports.
      if (window.PLAN_CONFIG && window.PLAN_CONFIG.icons && tag.indexOf("cust-") !== 0) {
        if (!window.PLAN_CONFIG.icons[tag]) {
          window.PLAN_CONFIG.icons[tag] = window.PLAN_CONFIG.icons.default || "icon/iconetrack.png";
        }
      }
      if (window._iconMap && !window._iconMap[tag]) {
        window._iconMap[tag] = window._iconMap.default || window.iconeDefault;
      }
    }

    const desc = inputDesc.value.trim();

    // 1. Photos : suppressions en attente + rattachement de clé.
    const photoOps = [];
    if (window.MyKTAMapPhotos) {
      _photosPendingDelete.forEach(function(photoId) {
        photoOps.push(window.MyKTAMapPhotos.deletePhoto(photoId));
      });
      // Photos rangées sous l'UID : renommer le point ne les touche pas. Restes du rangement par nom :
      //   - point sans uid : renommage de clé nom → nouveau nom ;
      //   - point avec uid dont des photos sont encore sous son nom : rattachées à l'uid SEULEMENT si aucun
      //     autre point ne porte ce nom (sinon on prendrait les photos d'un homonyme).
      if (isEdit && !existingPoint.uid) {
        if (_photoPointId !== nom) photoOps.push(window.MyKTAMapPhotos.renamePointId(planId, _photoPointId, nom));
      } else if (isEdit && existingPoint.uid) {
        const ancienNom = String(existingPoint.id || "");
        const homonymes = listePoints.filter(function(p) { return p !== existingPoint && String(p.id || "") === ancienNom; }).length +
          ((typeof window.getAllEmbeddedPoints === "function")
            ? window.getAllEmbeddedPoints().filter(function(p) { return String(p.id || "") === ancienNom; }).length : 0);
        if (ancienNom && homonymes === 0) {
          photoOps.push(window.MyKTAMapPhotos.renamePointId(planId, ancienNom, existingPoint.uid));
        }
      } else if (!_uidAjout && _photoPointId !== nom) {
        // Repli sans KtaUid : _temp_ → nom.
        photoOps.push(window.MyKTAMapPhotos.renamePointId(planId, _photoPointId, nom));
      }
    }

    Promise.all(photoOps).catch(function(e) {
      console.warn("[Editor] photoOps erreur :", e);
    }).finally(function() {
      // Undo/Redo : état capturé AVANT la mutation. ⚠️ Les photos sont HORS du périmètre undo
      // (historyManager.js) : un undo après save ne défait pas les suppressions ni les renommages IDB.
      const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("editorPoints") : null;

      // 2. Le point : création ou mise à jour.
      if (isEdit) {
        // Mise à jour EN PLACE de l'objet de listePoints.
        existingPoint.nom         = nom;
        existingPoint.id          = nom;  // garde id === nom (rétro-compat)
        existingPoint.tags        = tag ? [tag] : [];
        existingPoint.description = desc;
        // Multi-niveau : le level ne change QUE par la liste « Niveau » (jamais re-tagué sur le niveau actif,
        // surprenant si l'utilisateur a changé de niveau entre-temps). Inchangé → aucun champ écrit (un point
        // sans `level` reste sans `level`).
        const selNiveau = document.getElementById("kta-poi-niveau");
        const niveauChoisi = selNiveau ? Number.parseInt(selNiveau.value, 10) : Number.NaN;
        const niveauChange = Number.isInteger(niveauChoisi) && niveauChoisi !== niveauInitial;
        const jonctionChange = !!(_jonction && window.KtaPoiJonction.appliquer(existingPoint, _jonction.lire()));
        if (niveauChange) existingPoint.level = niveauChoisi;
        // touch : updatedAt (ms) + date_update (jour), en un seul geste.
        if (window.KtaUid) window.KtaUid.touch(existingPoint);
        else existingPoint.date_update = new Date().toISOString().split("T")[0];
        // Re-rendu complet (icône, nom, popup, marker._ktaLevel et filtre de niveau).
        if (window.renderEditorPoints) window.renderEditorPoints();
        if (niveauChange && window.InterPlanLinks && typeof window.InterPlanLinks.onPointLevelChanged === "function") {
          try { window.InterPlanLinks.onPointLevelChanged(planId, existingPoint); }
          catch(err) { console.warn("[Editor] niveau des liaisons inter-plan :", err); }
        }
        console.log("[Editor] Point modifié :", nom, "à", x, y);
        // Fiche des photos du point remise à jour (nom, type…).
        if (window.MyKTAMapPhotos && window.MyKTAMapPhotos.majFichesPoints) {
          window.MyKTAMapPhotos.majFichesPoints(planId, [existingPoint]);
        }
        if (window.HistoryManager && _historyBefore) {
          window.HistoryManager.record(window.I18n.t("editor.undo.editPoint", { nom: nom }), _historyBefore, "editorPoints");
        }
        // Niveaux ou raccords d'un passage changés : le graphe de navigation se reconstruit au prochain calcul.
        if (jonctionChange && window.RoadGraph && typeof window.RoadGraph.invalidate === "function") {
          window.RoadGraph.invalidate();
        }
        if ((niveauChange || jonctionChange) && window.SessionPersist && window.SessionPersist.save) {
          window.SessionPersist.save();
        }
        if (niveauChange && typeof window.ktaSignalerNiveauObjet === "function") {
          window.ktaSignalerNiveauObjet(niveauChoisi);
        }
      } else {
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

        // Multi-niveau actif : le point prend le niveau actif ; sinon aucun champ `level`.
        if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
          point.level = window.APP_CONFIG.activeLevel || 0;
        }
        if (_jonction) window.KtaPoiJonction.appliquer(point, _jonction.lire());
        // Identité stable dès la création : l'uid tiré à l'ouverture, sous lequel ses photos sont déjà rangées.
        if (_uidAjout) point.uid = _uidAjout;
        if (window.KtaUid) window.KtaUid.touch(window.KtaUid.ensure(point, "pt"));

        listePoints.push(point);
        _ajouterMarker(point);
        // Les photos prises avant le nom reçoivent la fiche définitive.
        if (window.MyKTAMapPhotos && window.MyKTAMapPhotos.majFichesPoints && _photosAddedThisSession.size) {
          window.MyKTAMapPhotos.majFichesPoints(planId, [point]);
        }
        if (window.HistoryManager && _historyBefore) {
          window.HistoryManager.record(window.I18n.t("editor.undo.addPoint", { nom: nom }), _historyBefore, "editorPoints");
        }
      }
      fermer();
    });
  });

  setTimeout(function() { inputNom.focus(); }, 50);
}

// ── Édition d'un point existant ──────────
// Bouton « Modifier » de la popup d'un point de session (utils.js > buildPointPopupHtml).
// Index d'un point de session par id + coords, repli sur les coords seules : l'id SUIT LE NOM (`id = nom` au
// save) et a pu changer depuis la construction de la popup. -1 si absent. Partagé par modifier, repositionner
// et supprimer.
function _indexPointSession(id, x, y) {
  for (let i = 0; i < listePoints.length; i++) {
    const p = listePoints[i];
    if (String(p.id || "") === String(id) && p.x === x && p.y === y) return i;
  }
  for (let i = 0; i < listePoints.length; i++) {
    if (listePoints[i].x === x && listePoints[i].y === y) return i;
  }
  return -1;
}

// ── Repositionner un point de session (picker « clic carte ») ──────────
// Même moule que les pickers du géoréf, du départ tracker, de l'itinéraire, de l'évitement et du KMZ.
// 🩸 On réutilise la classe `.kta-iti-floater`, pas un floater maison : `_modeClicCarteActif()` (utils.js) la
// reconnaît, donc (a) aucune popup d'annotation ne s'ouvre pendant le mode (elle mangerait le clic) et (b) le
// clic est réémis en phase CAPTURE (map.js), il porte même sur un autre marqueur, un tracé ou une zone.
// 🩸 PAS de glisser-déposer : un `touchmove` sur un marqueur deviendrait un drag au lieu d'un pan (POI déplacés
// par accident, en silence). Ici rien ne bouge tant que le mode n'est pas armé, et le doigt ne cache pas la cible.
let _repoActif   = false;
let _repoHandler = null;

function _repoDesactiver() {
  if (!_repoActif) return;
  _repoActif = false;
  if (window.map && _repoHandler) { try { window.map.off("click", _repoHandler); } catch(e) {} }
  _repoHandler = null;
  const fl = document.getElementById("kta-repo-floater");
  if (fl) fl.remove();
}
window.repositionnerAnnuler = _repoDesactiver;

// Bouton « Repositionner » de la popup d'un point de session (utils.js > buildPointPopupHtml).
window.repositionnerPointEditor = function(id, x, y) {
  if (typeof x !== "number" || typeof y !== "number") return;
  if (!window.map) return;
  if (_indexPointSession(id, x, y) === -1) {
    console.warn("[Editor] Point a repositionner introuvable :", id, x, y);
    return;
  }
  _repoDesactiver();   // annule un repositionnement deja arme

  // 🩸 LES AUTRES MODES « CLIC CARTE » DOIVENT TOMBER AVANT D'ARMER, sinon le même clic est consommé DEUX FOIS.
  // `_modeClicCarteActif()` ne suffit pas :
  //   1. il EXCLUT volontairement `modeEdition` (une popup de nommage y est légitime) : en mode ajout, le clic
  //      repositionnerait le point ET ouvrirait la fiche d'un point neuf ;
  //   2. il n'empêche que les POPUPS : `modeRoad` / `modeZone` / `modeStructure` posent leur sommet, `modeMesure`
  //      son jalon.
  // D'abord le registre des modes (lui seul retire la surbrillance du bouton, sinon la sidebar ment), puis les
  // drapeaux en filet (mode jamais enregistré, état incohérent).
  try { _desactiverTousLesModes(); } catch(e) {}
  window.modeEdition   = false;
  window.modeMesure    = false;
  window.modeRecalage  = false;
  window.modeRoad      = false;
  window.modeZone      = false;
  window.modeStructure = false;

  try { window.map.closePopup(); } catch(e) {}

  const nom = String(listePoints[_indexPointSession(id, x, y)].nom || id || "");
  _repoActif = true;

  _repoHandler = function(e) {
    if (!e || !e.latlng) return;
    // Chemin INVERSE de convertCoord(x, y) = [imageHeight - y, x].
    const nx = e.latlng.lng;
    const ny = (window.APP_CONFIG && window.APP_CONFIG.imageHeight)
                 ? (window.APP_CONFIG.imageHeight - e.latlng.lat)
                 : e.latlng.lat;
    // 🩸 On RECHERCHE le point au clic : entre l'armement et le clic, un autre point a pu être supprimé, la
    // session vidée ou le plan rechargé ; un index capturé à l'armement déplacerait le mauvais.
    const i = _indexPointSession(id, x, y);
    if (i === -1) {
      console.warn("[Editor] Point disparu pendant le repositionnement :", id);
      _repoDesactiver();
      return;
    }
    const pt = listePoints[i];
    const avant = window.HistoryManager ? window.HistoryManager.captureState("editorPoints") : null;
    const ancX = pt.x, ancY = pt.y;

    // Mutation EN PLACE : le point garde son `level` (jamais réattribué au niveau affiché : pas de téléportation
    // d'étage en douce), ses photos, ses tags et `_srcCalque` s'il vient d'un calque ouvert à la modification.
    pt.x = Math.round(nx * 100) / 100;
    pt.y = Math.round(ny * 100) / 100;
    if (window.KtaUid) window.KtaUid.touch(pt);

    // Les liaisons inter-plan stockent les coords du point : sans recalage, le lien partirait de l'ancienne
    // position à l'export KMZ.
    if (window.InterPlanLinks && typeof window.InterPlanLinks.onPointMoved === "function"
        && window._currentLoadedPlanId) {
      try { window.InterPlanLinks.onPointMoved(window._currentLoadedPlanId, pt, ancX, ancY); }
      catch(err) { console.warn("[Editor] recalage liaisons inter-plan :", err); }
    }

    if (window.renderEditorPoints) window.renderEditorPoints();
    if (window.HistoryManager && avant) {
      window.HistoryManager.record(
        window.I18n.t("editor.undo.movePoint", { nom: nom }), avant, "editorPoints");
    }
    _repoDesactiver();
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(window.I18n.t("editor.repo.done", { nom: nom }), "info");
    }
  };
  window.map.on("click", _repoHandler);

  const fl = document.createElement("div");
  fl.id = "kta-repo-floater";
  fl.className = "kta-iti-floater";
  fl.innerHTML =
    '<span class="kta-iti-floater-icon">📌</span>' +
    '<span class="kta-iti-floater-msg"></span>' +
    '<button class="kta-btn kta-btn-ghost" id="kta-repo-cancel" type="button"></button>';
  // Le nom vient de l'utilisateur : injecté en TEXTE, jamais en HTML.
  fl.querySelector(".kta-iti-floater-msg").textContent =
    window.I18n.t("editor.repo.floater", { nom: nom });
  const btnAnn = fl.querySelector("#kta-repo-cancel");
  btnAnn.textContent = window.I18n.t("editor.repo.cancel");
  document.body.appendChild(fl);
  btnAnn.addEventListener("click", _repoDesactiver);
};
window.modifierPointEditor = function(id, x, y) {
  if (typeof x !== "number" || typeof y !== "number") return;

  const _idx = _indexPointSession(id, x, y);
  const target = (_idx === -1) ? null : listePoints[_idx];
  if (!target) {
    console.warn("[Editor] Point à modifier introuvable :", id, x, y);
    return;
  }

  // Popup fermée avant la modale (sinon elle reste accrochée au marqueur et masque le clic sur le fond).
  if (window.map) try { window.map.closePopup(); } catch(e) {}

  afficherFormulaire(target.x, target.y, target);
};

// ── Ajouter un marqueur à la carte ──────────
function _ajouterMarker(point) {
  if (!window.layerEditor) {
    console.error("layerEditor non défini");
    return;
  }

  let icone = choisirIcone(point);

  // Icône invalide → icône par défaut de l'app (pin Leaflet natif tant que la carte n'a pas ses icônes). Avec
  // scaledMarkers, l'icône est un L.divIcon sans options.iconUrl :
  // on teste _kta_iconUrl (posé par creerIcones).
  const hasUrl = icone && (icone._kta_iconUrl || (icone.options && icone.options.iconUrl));
  if (!icone || !hasUrl) {
    console.warn("[Editor] Icône invalide pour", point.nom, "— icône par défaut");
    icone = window.iconeDefault || new L.Icon.Default();
  }

  // addTo détaché du constructeur (comme les calques, utils.js > ajouterPointsDepuisJSON).
  const marker = L.marker(convertCoord(point.x, point.y), { icon: icone });
  // Popup commune (Y aller / Itinéraire / Supprimer, ⭐ Favori avec layerInfo). ⚠️ bindPopup reçoit une
  // FONCTION (contenu régénéré à CHAQUE ouverture) : un HTML figé montrerait des liaisons et un état Favori
  // périmés. Bonus : rien n'est construit pour les popups jamais ouvertes.
  marker.bindPopup(function() {
    return (typeof window.buildPointPopupHtml === "function")
      ? window.buildPointPopupHtml(point, true, { layerId: "editor", layerLabel: window.I18n.t("editor.popup.myAdds") })
      : ("<b>" + point.nom + "</b><br>" + (point.description || ""));
  }, window.KTA_POPUP_OPTS);

  // Double-clic sur le marqueur → zoom flyTo.
  if (typeof window.attachMarkerDblClickZoom === "function") {
    window.attachMarkerDblClickZoom(marker);
  }

  // Miniatures photos de la popup hydratées à l'ouverture (slot vide rempli en async via popupopen).
  if (typeof window.attachPopupPhotos === "function") {
    window.attachPopupPhotos(marker, String(point.id || ""), point.uid);   // uid + nom
  }

  // Multi-niveau : level copié sur le marqueur pour le filtre visuel (pas de recherche dans listePoints).
  marker._ktaLevel = Number.isInteger(point.level) ? point.level : 0;
  // Passage entre niveaux : visible sur chacun de ses niveaux ; raccords dessinés pendant que sa fiche est ouverte.
  const _pj = window.KtaPoiJonction;
  marker._ktaNiveaux = (_pj && _pj.estJonction(point)) ? _pj.niveaux(point) : null;
  if (_pj) _pj.brancherMarqueur(marker, point);
  // Tags copiés aussi : le 1er détermine l'icône, c'est le tag de filtrage (comme les marqueurs de calque).
  marker._ktaTags = Array.isArray(point.tags) ? point.tags.slice() : [];

  // Suivi pour une suppression ciblée (pas de clearLayers, cf. _markersEditor).
  _markersEditor.push(marker);

  // Les points de SESSION ne sont JAMAIS soumis au viewport culling (décision produit) : précieux et rares, les
  // masquer déroute (« mon POI a disparu ») pour un gain négligeable. Le culling reste sur les marqueurs de
  // calque (utils.js). _ktaLayer/_ktaVpHidden restent pour _refreshEditorMarkersViewport.
  marker._ktaLayer = window.layerEditor;
  marker._ktaVpHidden = false;
  marker.addTo(window.layerEditor);

  // Filtre de niveau appliqué tout de suite : un point ajouté sur un niveau hors visibleLevels est caché.
  _appliquerFiltreNiveauSurMarker(marker);
}

// Appelé par utils.js > _refreshDataMarkersViewport au moveend/zoomend. Les points de session étant exemptés
// du culling (cf. _ajouterMarker), cette fonction ne fait plus que réintégrer d'éventuels marqueurs cachés
// résiduels.
window._refreshEditorMarkersViewport = function() {
  if (!Array.isArray(_markersEditor) || _markersEditor.length === 0) return;
  _markersEditor.forEach(function(m) {
    if (m && m._ktaVpHidden && m._ktaLayer) {
      try { m.addTo(m._ktaLayer); } catch(e) {}
      m._ktaVpHidden = false;
    }
  });
};

// Filtre d'un marqueur selon APP_CONFIG.visibleLevels et le filtre de tags : utils.js > ktaMasquerMarqueur
// (opacité + icône inerte, tenue quand Leaflet recrée l'icône) plutôt que remove/addLayer, pour rester dans
// layerEditor.
function _appliquerFiltreNiveauSurMarker(marker) {
  if (!marker) return;
  let visible = true;
  // Multi-niveau inactif → tout visible.
  const multi = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  if (multi) {
    const visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
      ? window.APP_CONFIG.visibleLevels : [0];
    const niv = Array.isArray(marker._ktaNiveaux) ? marker._ktaNiveaux
      : [Number.isInteger(marker._ktaLevel) ? marker._ktaLevel : 0];
    if (!niv.some(function(n) { return visibles.indexOf(n) >= 0; })) visible = false;
  }
  // Filtre de tags runtime (FilterPanel) sur le 1er tag du marqueur.
  if (visible && window._ktaRuntimeFilters && window._ktaRuntimeFilters.tags) {
    const tag = (Array.isArray(marker._ktaTags) && marker._ktaTags[0])
                || (marker._ktaTag)
                || "default";
    if (!window._ktaRuntimeFilters.tags.has(tag)) visible = false;
  }
  window.ktaMasquerMarqueur(marker, !visible);
}

// Filtre tous les marqueurs editor (appelé par window.appliquerFiltreNiveau).
window._applyLevelFilterToEditorPoints = function() {
  _markersEditor.forEach(_appliquerFiltreNiveauSurMarker);
};

// ── Supprimer le dernier point ajouté ──────────
function removeLastEditorPoint() {
  if (listePoints.length === 0) return false;
  // Undo/Redo : instantané avant mutation.
  const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("editorPoints") : null;
  const removed = listePoints[listePoints.length - 1];
  listePoints.pop();
  if (window.renderEditorPoints) window.renderEditorPoints();
  if (window.HistoryManager && _historyBefore) {
    const label = (removed && removed.nom)
      ? window.I18n.t("editor.undo.removeLastNamed", { nom: removed.nom })
      : window.I18n.t("editor.undo.removeLast");
    window.HistoryManager.record(label, _historyBefore, "editorPoints");
  }
  return true;
}

// ── Rendu des points ──────────
// ⚠️ Jamais layerEditor.clearLayers() ici (il contient aussi roads et zones de session) : on retire seulement
// les marqueurs de _markersEditor.
window.renderEditorPoints = function() {
  if (!window.layerEditor) return;
  _markersEditor.forEach(function(m) { try { m.remove(); } catch(e) {} });
  _markersEditor = [];
  listePoints.forEach(_ajouterMarker);
};

// ── Export global ──────────
window.initEditor             = initEditor;
window.removeLastEditorPoint  = removeLastEditorPoint;
window.getEditorPoints        = function() { return listePoints; };
// ⚠️ Rendu automatique, comme setRoads/setZones : sans lui, un appelant qui oublie renderEditorPoints() laisse
// des points en mémoire hors du layerEditor (le calque « Ajout » du contrôle des couches ne les masque pas).
window.setEditorPoints        = function(points) {
  listePoints = points || [];
  // Filet : tout point qui entre (restauration, import, annulation, tableur, Secours…) ressort avec un uid.
  // N'écrase jamais un uid existant.
  if (window.KtaUid) window.KtaUid.ensureAll(listePoints, "pt");
  if (window.renderEditorPoints) window.renderEditorPoints();
};

// Supprime un point de session par id + coords (bouton 🗑️ de la popup, utils.js > buildPointPopupHtml), repli
// sur les coords seules (cf. _indexPointSession).
window.supprimerPointEditor = function(id, x, y) {
  if (typeof x !== "number" || typeof y !== "number") return;

  const idx = _indexPointSession(id, x, y);
  if (idx === -1) {
    console.warn("[Editor] Point a supprimer introuvable :", id, x, y);
    return;
  }

  // Liaisons inter-plan du point purgées (des deux côtés, cf. interPlanLinks.js), AVANT le splice (il faut
  // l'objet point pour le croisement).
  if (window.InterPlanLinks && typeof window.InterPlanLinks.onPointDeleted === "function"
      && window._currentLoadedPlanId) {
    try {
      window.InterPlanLinks.onPointDeleted(window._currentLoadedPlanId, listePoints[idx]);
    } catch(e) { console.warn("[Editor] purge liaisons inter-plan :", e); }
  }

  // 🩸 La suppression ÉCRIT dans l'historique (instantané avant + entrée) : sinon un ⏪ appliquerait
  // l'instantané précédent et pourrait ressusciter le point en annulant autre chose. Le toast dit comment
  // annuler (⏪, pas Ctrl+Z : un téléphone n'a pas de Ctrl).
  const _avantSuppr = window.HistoryManager ? window.HistoryManager.captureState("editorPoints") : null;
  const _nomSuppr   = String(listePoints[idx].nom || id || "");
  // Ses photos ne sont PAS supprimées : elles deviennent « sans point » (Outils > Mes photos), où on les
  // rattache ou recrée le point. Leur fiche est figée ici, à l'état exact du point.
  if (window.MyKTAMapPhotos && window.MyKTAMapPhotos.majFichesPoints && window._currentLoadedPlanId) {
    window.MyKTAMapPhotos.majFichesPoints(window._currentLoadedPlanId, [listePoints[idx]]);
  }

  listePoints.splice(idx, 1);
  if (window.renderEditorPoints) window.renderEditorPoints();

  if (window.HistoryManager && _avantSuppr) {
    window.HistoryManager.record(window.I18n.t("editor.undo.deletePoint", { nom: _nomSuppr }), _avantSuppr, "editorPoints");
  }
  if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    window.OOMGuard.showToast(window.I18n.t("editor.toast.pointSupprime", { nom: _nomSuppr }), "info");
  }

  // Popup fermée (sinon elle reste à l'emplacement d'un marqueur disparu).
  if (window.map) try { window.map.closePopup(); } catch(e) {}

  console.log("[Editor] Point supprimé :", id, "à", x, y, "— restant :", listePoints.length);
};
