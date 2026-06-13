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
  epure:    "Épure",
  plaque:   "Plaque indication",
  // 🆕 v1.41.0 D — Point d'entrée du plan (Vue OSM × Mode Secours).
  entree_plan: "🚪 Point d'entrée du plan"
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

  let html = '<option value="">' + window.I18n.t("editor.options.none") + '</option>';
  html += orderedTags.map(function(tag) {
    // Label built-in via i18n (clé "editor.tag.<tag>"), sinon le tag custom brut.
    const label = EDITOR_TAG_LABELS[tag] ? window.I18n.t("editor.tag." + tag) : tag;
    const sel   = tag === selectedTag ? ' selected' : '';
    return `<option value="${tag}"${sel}>${label}</option>`;
  }).join("");

  html += '<option value="__new__">' + window.I18n.t("editor.options.newTag") + '</option>';
  return html;
}

// =========================
// FORMULAIRE — modale plein écran style cohérent
// =========================
// 🆕 v1.9.3-B1b : signature étendue pour mode ajout/édition unifié.
//   - afficherFormulaire(x, y)                    → mode AJOUT (existant)
//   - afficherFormulaire(x, y, existingPoint)     → mode ÉDITION (nouveau)
//
// En mode ÉDITION, on travaille DIRECTEMENT sur la référence du point dans
// listePoints (mutation in place) pour ne pas avoir à dupliquer/réinjecter.
// Le re-render du marker est fait au save (pour propager nom, tag, level…).
//
// 📸 Photos : section IDB-backed (B1.b stratégie 5a — écriture immédiate
// avec cleanup à l'annulation). Mode AJOUT utilise un pointId temporaire
// (_pendingPointId, UUID préfixé "_temp_") qui sera migré vers le vrai id
// (= nom saisi) à la validation. Mode ÉDITION utilise existingPoint.id
// directement. Si l'user renomme un point ayant des photos, on appelle
// MyKTAMapPhotos.renamePointId au save pour migrer les enregistrements.
function afficherFormulaire(x, y, existingPoint) {
  const existing = document.getElementById("kta-poi-modal");
  if (existing) existing.remove();

  const isEdit = !!(existingPoint && typeof existingPoint === "object");
  const titreModale  = isEdit ? window.I18n.t("editor.modal.titleEdit") : window.I18n.t("editor.modal.titleAdd");
  const labelBouton  = isEdit ? window.I18n.t("editor.modal.btnSave")   : window.I18n.t("editor.modal.btnAdd");
  const tagInitial   = isEdit && existingPoint.tags && existingPoint.tags.length > 0
                       ? existingPoint.tags[0]
                       : "";
  const nomInitial   = isEdit ? (existingPoint.nom || "") : "";
  const descInitial  = isEdit ? (existingPoint.description || "") : "";

  // Echappement pour pré-remplissage (sinon une apostrophe dans le nom
  // casserait l'attribut value HTML).
  function _esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
                    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // planId courant — utilisé pour les opérations MyKTAMapPhotos.
  // Fallback "default" cohérent avec sessionExporter.js (cf. CLAUDE.md §27).
  const planId = window._currentLoadedPlanId || "default";

  // ID du point côté IDB photos :
  //   - mode ÉDITION : id figé = existingPoint.id
  //   - mode AJOUT   : id temporaire (UUID préfixé "_temp_") qu'on
  //     migrera vers le vrai nom à la validation. Permet à l'user
  //     d'attacher des photos AVANT d'avoir saisi un nom définitif.
  let _photoPointId;
  if (isEdit) {
    _photoPointId = String(existingPoint.id || existingPoint.nom || "");
  } else {
    _photoPointId = "_temp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  // Tracking des photoIds manipulés DANS cette session de modale :
  //   - _photosAddedThisSession : ajoutées (à supprimer si Annuler)
  //   - _photosPendingDelete    : marquées à supprimer (à committer au Save,
  //                                à ignorer si Annuler)
  const _photosAddedThisSession = new Set();
  const _photosPendingDelete    = new Set();

  // Cache des metadata photos chargées en mémoire pour rendre la grille
  // sans refetch IDB à chaque tick. Format : [{id, blob, mime, size, ...}]
  let _photosCacheMeta = [];
  // Cache des objectURL pour pouvoir révoquer au close (évite memory leak
  // si l'user ouvre/ferme la modale 50 fois sur des plans riches).
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
          <div style="font-size:13px; color:#8892a4; padding:4px 0;">
            X : <strong style="color:#e8eaf0;">${x}</strong> — Y : <strong style="color:#e8eaf0;">${y}</strong>
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("editor.section.infos")}</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">${window.I18n.t("editor.field.name")} <span style="color:#ff8080;">*</span></label>
            <input class="kta-cfg-input" id="kta-poi-nom" type="text" value="${_esc(nomInitial)}" placeholder="${window.I18n.t("editor.field.namePlaceholder")}" autocomplete="off">

            <label class="kta-cfg-label">${window.I18n.t("editor.field.type")}</label>
            <select class="kta-cfg-input" id="kta-poi-type">${_buildTypeOptionsHTML(tagInitial)}</select>
          </div>

          <div id="kta-poi-newtag-wrap" style="display:none; margin-top:8px;">
            <label class="kta-cfg-label" style="display:block; margin-bottom:4px;">${window.I18n.t("editor.field.newTag")}</label>
            <input class="kta-cfg-input" id="kta-poi-newtag" type="text" placeholder="${window.I18n.t("editor.field.newTagPlaceholder")}" autocomplete="off">
            <p style="font-size:11px; color:#8892a4; margin:4px 0 0;">
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

  // Section photos
  const photoGrid       = document.getElementById("kta-poi-photos-grid");
  const photoCounter    = document.getElementById("kta-poi-photos-counter");
  const photoBtnCamera  = document.getElementById("kta-poi-photos-camera");
  const photoBtnGalerie = document.getElementById("kta-poi-photos-galerie");
  const photoInputCam   = document.getElementById("kta-poi-photos-input-camera");
  const photoInputGal   = document.getElementById("kta-poi-photos-input-galerie");

  function setErr(msg) {
    erreurEl.textContent  = msg || "";
    erreurEl.style.display = msg ? "block" : "none";
  }

  // Cleanup commun à toutes les fermetures (sauf au save qui appelle son
  // propre cleanup conditionnel). Révoque les objectURL pour éviter les
  // memory leaks.
  function _cleanupObjectUrls() {
    _photoObjectUrls.forEach(function(u) {
      try { URL.revokeObjectURL(u); } catch(e) {}
    });
    _photoObjectUrls.clear();
  }

  function fermer() { _cleanupObjectUrls(); modal.remove(); }

  // 🚪 Annuler : delete les photos ajoutées dans cette session de modale
  // (sous _photoPointId, qui peut être l'id réel d'un point existant en
  // édition OU l'id temporaire en ajout). Les pending deletes ne sont
  // PAS committés (rien n'a été vraiment supprimé en IDB).
  function annuler() {
    if (!window.MyKTAMapPhotos || _photosAddedThisSession.size === 0) {
      // Si mode AJOUT sans photos uploadées → rien à nettoyer
      // Si mode AJOUT avec photos → on les delete via deletePhotosForPoint
      //   sur le _temp_ pointId (couvre aussi le cas où Set serait désynchro)
      if (!isEdit && window.MyKTAMapPhotos && _photoPointId.indexOf("_temp_") === 0) {
        window.MyKTAMapPhotos.deletePhotosForPoint(planId, _photoPointId)
          .catch(function(e) { console.warn("[Editor] cleanup _temp_ photos :", e); });
      }
      fermer();
      return;
    }
    // Mode édition avec ajouts : delete précis des photos uploadées cette session
    const promises = [];
    _photosAddedThisSession.forEach(function(photoId) {
      promises.push(window.MyKTAMapPhotos.deletePhoto(photoId));
    });
    Promise.all(promises).catch(function(e) {
      console.warn("[Editor] cleanup photos session :", e);
    }).finally(fermer);
  }

  selectType.addEventListener("change", function() {
    if (selectType.value === "__new__") {
      newTagWrap.style.display = "block";
      setTimeout(function() { inputNewTag.focus(); }, 30);
    } else {
      newTagWrap.style.display = "none";
    }
  });

  btnClose.addEventListener("click", annuler);
  btnAnnuler.addEventListener("click", annuler);
  modal.addEventListener("click", function(e) { if (e.target === modal) annuler(); });

  // Empêcher Leaflet de capturer les events tactiles dans la modale
  L.DomEvent.disableClickPropagation(modal);

  // ============================================================
  // PHOTOS — handlers
  // ============================================================
  // Recompte les photos visibles (cache - pending delete) pour afficher
  // "N / 5" et désactiver les boutons d'ajout à la saturation.
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

  // Re-render visuel de la grille à partir de _photosCacheMeta.
  // Les vignettes marquées pending delete sont stylées différemment (grisées + ✕ disabled).
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
        // 🆕 v1.9.3-B1c : tap miniature → ouvre viewer plein écran.
        // - Skip si la photo est en cours de compression (placeholder)
        //   ou marquée pending delete (l'user veut la supprimer, pas la zoomer)
        // - L'array passé au viewer = filtré pour ne montrer QUE les
        //   photos visibles (pas les placeholders ni les pendings),
        //   sinon l'index ne correspondrait pas.
        if (!isPending && !isPlaceholder) {
          thumb.style.cursor = "zoom-in";
          thumb.addEventListener("click", function(ev) {
            // Click sur le ✕ ne doit PAS ouvrir le viewer (stop propag dans le handler ✕ ci-dessous)
            if (ev.target && ev.target.classList.contains("kta-poi-photo-del")) return;
            if (!window.MyKTAMapPhotoViewer) {
              console.warn("[Editor] MyKTAMapPhotoViewer indisponible");
              return;
            }
            // Filtre : on n'envoie au viewer que les photos visibles
            // (pas les placeholders, pas les pendings). On recalcule
            // startIndex dans cette sous-liste filtrée.
            const visible = _photosCacheMeta.filter(function(q) {
              return q._objectUrl && !_photosPendingDelete.has(q.id);
            });
            const idx = visible.findIndex(function(q) { return q.id === p.id; });
            window.MyKTAMapPhotoViewer.open(visible, Math.max(0, idx));
          });
        }
      } else {
        // Placeholder (compression en cours, voir _ajouterPhotoBlob)
        thumb.innerHTML = '<div class="kta-poi-photo-spinner">⏳</div>';
      }
      // Bouton ✕ pour retirer la photo (mark pending delete, vraie suppression au save)
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

  // Charge en mémoire les photos existantes (mode édition uniquement)
  // pour pré-remplir la grille. En mode ajout, _photoPointId est temporaire
  // donc rien à charger au départ (cache vide).
  function _loadExistingPhotos() {
    if (!isEdit || !window.MyKTAMapPhotos) {
      _renderPhotoGrid();
      _refreshCounterAndButtons();
      return;
    }
    window.MyKTAMapPhotos.getPhotosForPoint(planId, _photoPointId).then(function(arr) {
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
    }).catch(function(e) {
      console.warn("[Editor] _loadExistingPhotos erreur :", e);
      _renderPhotoGrid();
      _refreshCounterAndButtons();
    });
  }

  // Upload d'1 Blob photo : crée un placeholder grille immédiat (UX
  // réactive), lance compression+IDB write en arrière-plan, swap par la
  // vraie miniature au callback. Si erreur → toast + retire le placeholder.
  function _ajouterPhotoBlob(blob) {
    if (!window.MyKTAMapPhotos) {
      setErr(window.I18n.t("editor.err.photoModule"));
      return;
    }
    // Placeholder local — id provisoire local pour pouvoir le retrouver
    const placeholderLocalId = "_pending_" + Math.random().toString(36).slice(2, 10);
    _photosCacheMeta.push({
      id:        placeholderLocalId,
      _pending:  true,
      _objectUrl: null
    });
    _renderPhotoGrid();
    _refreshCounterAndButtons();

    window.MyKTAMapPhotos.addPhoto(planId, _photoPointId, blob).then(function(photoId) {
      // Récupère le blob compressé pour générer l'objectURL d'affichage
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
      // Retire le placeholder en échec
      const idx = _photosCacheMeta.findIndex(function(p) { return p.id === placeholderLocalId; });
      if (idx !== -1) _photosCacheMeta.splice(idx, 1);
      _renderPhotoGrid();
      _refreshCounterAndButtons();
      // Message utilisateur
      const msg = (err && err.code === "QUOTA_PER_POINT")
        ? window.I18n.t("editor.err.photoQuotaPoint")
        : (err && err.code === "QUOTA_EXCEEDED")
          ? window.I18n.t("editor.err.photoQuotaDisk")
          : (err && err.code === "QUOTA_DEVICE")
            ? window.I18n.t("editor.err.photoQuotaDevice")
            : window.I18n.t("editor.err.photoAdd", { msg: (err && err.message ? err.message : err) });
      setErr(msg);
      setTimeout(function() { setErr(""); }, 5000);
    });
  }

  // File picker → addPhoto pour chaque file sélectionné
  function _onFileChange(ev) {
    const files = ev.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      _ajouterPhotoBlob(files[i]);
    }
    // Reset l'input pour permettre re-sélection du même fichier
    ev.target.value = "";
  }

  photoBtnCamera.addEventListener("click",  function() { photoInputCam.click(); });
  photoBtnGalerie.addEventListener("click", function() { photoInputGal.click(); });
  photoInputCam.addEventListener("change",  _onFileChange);
  photoInputGal.addEventListener("change",  _onFileChange);

  // Charge les photos existantes (mode édition)
  _loadExistingPhotos();

  // ============================================================
  // VALIDATION — save
  // ============================================================
  btnValider.addEventListener("click", function() {
    const nom = inputNom.value.trim();
    if (!nom) { setErr(window.I18n.t("editor.err.nameRequired")); inputNom.focus(); return; }

    let tag = selectType.value;

    // Création d'un nouveau tag à la volée
    if (tag === "__new__") {
      const nouveau = inputNewTag.value.trim().toLowerCase().replace(/\s+/g, "_");
      if (!nouveau) { setErr(window.I18n.t("editor.err.tagInvalid")); inputNewTag.focus(); return; }
      if (!/^[a-z0-9_-]+$/.test(nouveau)) {
        setErr(window.I18n.t("editor.err.tagChars"));
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

    // Phase 1 : commit photos (pendings delete + migration id si renommage)
    const photoOps = [];
    if (window.MyKTAMapPhotos) {
      // Commit pending deletes (vraie suppression IDB)
      _photosPendingDelete.forEach(function(photoId) {
        photoOps.push(window.MyKTAMapPhotos.deletePhoto(photoId));
      });
      // Migration : si mode ajout (pointId temp) OU si mode édition avec
      // renommage (oldId !== newId), on rename les photoIds vers le bon id
      const newPointId = nom;
      if (_photoPointId !== newPointId) {
        photoOps.push(window.MyKTAMapPhotos.renamePointId(planId, _photoPointId, newPointId));
      }
    }

    Promise.all(photoOps).catch(function(e) {
      console.warn("[Editor] photoOps erreur :", e);
    }).finally(function() {
      // 🆕 v1.11.0 Undo/Redo : capture l'état AVANT la mutation pour
      // l'historique. Note : les photos sont EXCLUES du périmètre undo
      // (cf. historyManager.js), donc on enregistre uniquement le state
      // points/roads/zones/structures. Si l'user undo après save, les
      // ops photos (delete IDB / rename) ne seront PAS rollback.
      const _historyBefore = window.HistoryManager ? window.HistoryManager.captureState("editorPoints") : null;

      // Phase 2 : commit du point (création ou update)
      if (isEdit) {
        // Update IN PLACE de l'objet existant dans listePoints
        existingPoint.nom         = nom;
        existingPoint.id          = nom;  // garde id === nom (rétro-compat)
        existingPoint.tags        = tag ? [tag] : [];
        existingPoint.description = desc;
        existingPoint.date_update = new Date().toISOString().split("T")[0];
        // 🏗️ Multi-niveau : on garde le level d'origine (pas de re-tag automatique
        // sur le niveau actif au save d'une édition, ce serait surprenant si l'user
        // a switché de niveau entretemps).
        // Re-render tout pour propager le changement d'icône / nom / popup.
        if (window.renderEditorPoints) window.renderEditorPoints();
        console.log("[Editor] Point modifié :", nom, "à", x, y);
        if (window.HistoryManager && _historyBefore) {
          window.HistoryManager.record(window.I18n.t("editor.undo.editPoint", { nom: nom }), _historyBefore, "editorPoints");
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

        // 🏗️ Multi-niveau (v148) : tag le point avec le niveau actif si la feature
        // est ON pour ce plan. Si OFF → aucun champ `level` → retro-compat absolue.
        if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
          point.level = window.APP_CONFIG.activeLevel || 0;
        }

        listePoints.push(point);
        _ajouterMarker(point);
        if (window.HistoryManager && _historyBefore) {
          window.HistoryManager.record(window.I18n.t("editor.undo.addPoint", { nom: nom }), _historyBefore, "editorPoints");
        }
      }
      fermer();
    });
  });

  // Focus auto sur le nom
  setTimeout(function() { inputNom.focus(); }, 50);
}

// =========================
// ÉDITION D'UN POINT EXISTANT (v1.9.3-B1b)
// =========================
// Appelé depuis le bouton "✏️ Modifier" de la popup d'un point session
// (cf. utils.js > buildPointPopupHtml). Lookup dans listePoints par id +
// coords (fallback coords seules si l'id ne matche pas), puis ouvre
// afficherFormulaire en mode édition. Si introuvable → warn console et
// no-op (pas de modale d'erreur, c'est un cas marginal).
window.modifierPointEditor = function(id, x, y) {
  if (typeof x !== "number" || typeof y !== "number") return;

  let target = null;
  // Match exact (id + coords)
  for (let i = 0; i < listePoints.length; i++) {
    const p = listePoints[i];
    if (String(p.id || "") === String(id) && p.x === x && p.y === y) {
      target = p;
      break;
    }
  }
  // Fallback : match par coords seules
  if (!target) {
    for (let i = 0; i < listePoints.length; i++) {
      if (listePoints[i].x === x && listePoints[i].y === y) {
        target = listePoints[i];
        break;
      }
    }
  }
  if (!target) {
    console.warn("[Editor] Point à modifier introuvable :", id, x, y);
    return;
  }

  // Ferme la popup ouverte avant d'ouvrir la modale (sinon la popup
  // reste accrochée au marker et masque le clic backdrop)
  if (window.map) try { window.map.closePopup(); } catch(e) {}

  afficherFormulaire(target.x, target.y, target);
};

// =========================
// AJOUTER UN MARKER À LA CARTE
// =========================
function _ajouterMarker(point) {
  if (!window.layerEditor) {
    console.error("layerEditor non défini");
    return;
  }

  let icone = choisirIcone(point);

  // Validation : si l'icône est invalide, utiliser le pin Leaflet natif.
  // v174 : avec scaledMarkers ON, icone est un L.divIcon → options.iconUrl
  // n'existe pas, on check _kta_iconUrl (backup posé par creerIcones).
  const hasUrl = icone && (icone._kta_iconUrl || (icone.options && icone.options.iconUrl));
  if (!icone || !hasUrl) {
    console.warn("[Editor] Icône invalide pour", point.nom, "— pin Leaflet par défaut");
    icone = new L.Icon.Default();
  }

  // 🚀 v1.30.0 (P5 viewport culling) : détache l'addTo du constructeur pour
  // pouvoir conditionner l'ajout selon le toggle viewportCull. Cohérent avec
  // le pattern data layers (cf utils.js > ajouterPointsDepuisJSON).
  const marker = L.marker(convertCoord(point.x, point.y), { icon: icone });
  // Popup avec boutons "Y aller" / "Itinéraire" / "Supprimer" — helper commun.
  // 2e argument true → c'est un point de la session courante (listePoints) →
  // bouton "🗑️ Supprimer" affiche dans la popup.
  // 🆕 v1.16.0 step 3 : passe layerInfo pour que le bouton ⭐ Favori
  // puisse construire le snapshot avec le bon layerId/layerLabel.
  const popupHtml = (typeof window.buildPointPopupHtml === "function")
    ? window.buildPointPopupHtml(point, true, { layerId: "editor", layerLabel: window.I18n.t("editor.popup.myAdds") })
    : ("<b>" + point.nom + "</b><br>" + (point.description || ""));
  marker.bindPopup(popupHtml, window.KTA_POPUP_OPTS);

  // 🔍 v174 : double-clic sur le marker → zoom flyTo dessus
  if (typeof window.attachMarkerDblClickZoom === "function") {
    window.attachMarkerDblClickZoom(marker);
  }

  // 📸 v1.9.3-B1d : hydrate les miniatures photos dans le popup à l'ouverture
  // (slot vide dans buildPointPopupHtml, rempli en async via popupopen).
  if (typeof window.attachPopupPhotos === "function") {
    window.attachPopupPhotos(marker, String(point.id || ""));
  }

  // 🏗️ Multi-niveau (v148) : stocke le level sur le marker pour le filtre runtime.
  // (Le point.level est aussi conserve dans listePoints, mais on duplique sur
  // l'objet marker pour eviter une lookup au moment du filter visuel.)
  marker._ktaLevel = Number.isInteger(point.level) ? point.level : 0;
  // 🆕 v1.21.5 (KARMA "filtre par tag") : stocke aussi les tags sur le
  // marker (1er tag est celui qui détermine l'icône → c'est le tag de
  // filtrage). Cohérent avec data layer markers (cf utils.js ligne 1055).
  marker._ktaTags = Array.isArray(point.tags) ? point.tags.slice() : [];

  // Tracking pour permettre une suppression ciblée plus tard (sans clearLayers
  // qui efface aussi roads/zones partageant le meme layerEditor).
  _markersEditor.push(marker);

  // 🚀 v1.30.0 (P5 viewport culling) : skip addTo si hors viewport ET toggle
  // viewportCull actif. Le marker reste dans _markersEditor pour pouvoir
  // être réintégré via _refreshEditorMarkersViewport() au moveend/zoomend.
  // _ktaLayer = window.layerEditor : tracé pour la réintégration.
  marker._ktaLayer = window.layerEditor;
  const _vpcEd = !!(window.PerfUltra && window.PerfUltra.get("viewportCull"));
  if (_vpcEd && typeof window._markerInViewportPadded === "function"
      && !window._markerInViewportPadded(marker, 0.1)) {
    marker._ktaVpHidden = true;
  } else {
    marker._ktaVpHidden = false;
    marker.addTo(window.layerEditor);
  }

  // Applique le filtre niveau immediat sur ce nouveau marker (utile quand le
  // user ajoute un point sur un niveau qui n'est pas dans visibleLevels —
  // ex: il a filtre Niv 1 mais ajoute via le mode edition sans changer le
  // niveau actif). Le marker se cache si pas visible.
  _appliquerFiltreNiveauSurMarker(marker);
}

// 🚀 v1.30.0 (P5 viewport culling) — Re-render les markers de la session
// éditeur (_markersEditor) selon le viewport courant. Appelé par utils.js
// > _refreshDataMarkersViewport au moveend/zoomend (chaînage cross-module).
// Pattern strictement identique à _refreshDataMarkersViewport (mêmes
// garanties idempotentes + toggle OFF = graceful reintegration).
window._refreshEditorMarkersViewport = function() {
  if (!Array.isArray(_markersEditor) || _markersEditor.length === 0) return;
  const _vpcOn = !!(window.PerfUltra && window.PerfUltra.get("viewportCull"));

  if (!_vpcOn) {
    // Toggle OFF → réintégrer tous les markers cachés
    _markersEditor.forEach(function(m) {
      if (m && m._ktaVpHidden && m._ktaLayer) {
        try { m.addTo(m._ktaLayer); } catch(e) {}
        m._ktaVpHidden = false;
      }
    });
    return;
  }

  // Toggle ON → check viewport pour chaque marker
  _markersEditor.forEach(function(m) {
    if (!m || !m._ktaLayer) return;
    const inside = (typeof window._markerInViewportPadded === "function")
      ? window._markerInViewportPadded(m, 0.1) : true;
    if (inside && m._ktaVpHidden) {
      try { m.addTo(m._ktaLayer); } catch(e) {}
      m._ktaVpHidden = false;
    } else if (!inside && !m._ktaVpHidden) {
      try { m.remove(); } catch(e) {}
      m._ktaVpHidden = true;
    }
  });
};

// 🏗️ Multi-niveau : helper de filtrage visuel d'un marker editor selon
// APP_CONFIG.visibleLevels. Utilise setOpacity + pointer-events plutot
// que remove/addLayer pour preserver l'integration avec layerEditor.
function _appliquerFiltreNiveauSurMarker(marker) {
  if (!marker) return;
  let visible = true;
  // 🏗️ Multi-niveau (feature off → tout visible, retro-compat)
  const multi = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  if (multi) {
    const visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
      ? window.APP_CONFIG.visibleLevels : [0];
    const lvl = Number.isInteger(marker._ktaLevel) ? marker._ktaLevel : 0;
    if (visibles.indexOf(lvl) < 0) visible = false;
  }
  // 🆕 v1.21.5 (KARMA "filtre par tag") : filtre runtime via FilterPanel.
  // Lit le 1er tag du marker (_ktaTags ou .options.icon).
  if (visible && window._ktaRuntimeFilters && window._ktaRuntimeFilters.tags) {
    const tag = (Array.isArray(marker._ktaTags) && marker._ktaTags[0])
                || (marker._ktaTag)
                || "default";
    if (!window._ktaRuntimeFilters.tags.has(tag)) visible = false;
  }
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
  // 🆕 v1.11.0 Undo/Redo : snapshot before mutation
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
