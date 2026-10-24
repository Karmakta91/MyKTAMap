/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE IMPORT / EXPORT SESSION — JSON, ZIP, GPX
// =========================
// Expose : telechargerSessionJSON() (repli si sessionExporter.js manque) · importerSessionJSON(file) ·
//   ouvrirImportChoix() (sélecteur unique .json/.zip/.gpx, routé par ouvrirImportFichier(file) selon
//   l'extension) · ouvrirImportSession([file]) / ouvrirImportGpx([file]) (aperçu + validation).
// Dépend de : get/set/reset des familles (Roads, Zones, EditorPoints, Structures, Measure, Tracking), GpxIO,
//   KmzImport, KmzExport (calage), MyKTAMapPhotos, LegendCustomization, InterPlanLinks, ModeHistoire, KtaUid.
// ⚠️ Un import de SESSION REMPLACE la session du plan (snapshot sessionBackups avant) ; un import GPX AJOUTE.
// ⚠️ Plan PARTAGÉ par une extension (KtaExtensions.importPartage) : choix « Ajouter au plan » (fusion par uid, rien
//   ne disparaît) ou « Remplacer pour tous » (si permis, confirmé, une trace de suppression par objet retiré) —
//   KtaUid.preparerImport. Sans trace, la synchro ne voit aucune suppression et les objets reviennent du serveur.
// Doc : docs/architecture/session-data.md · docs/ETUDE_UID.md

// ── Export session JSON ──────────
// Les objets d'un ancien fichier reçoivent un uid (updatedAt de repli = date d'export), un uid en double est
// régénéré. Import par REMPLACEMENT local : les traces de suppression du fichier REMPLACENT celles du plan ;
// `sansTraces` (plan partagé) : les traces restent à KtaUid.preparerImport.
function _preparerIdentitesImport(d, sansTraces) {
  if (!window.KtaUid || !d || typeof d !== "object") return;
  const repli = Date.parse(d.date_export || d.exported_at) || Date.now();
  const vus = new Set();
  window.KtaUid.ensureAll(d.editorPoints, "pt", repli, vus);
  window.KtaUid.ensureAll(d.roads, "rd", repli, vus);
  window.KtaUid.ensureAll(d.zones, "zn", repli, vus);
  window.KtaUid.ensureAll(d.structures, "st", repli, vus);
  if (!sansTraces) window.KtaUid.setTombstones(d.tombstones);
}

// Plan affiché partagé par une extension (KtaExtensions.importPartage) → { remplacer } ; sinon null (plan local :
// remplacement historique).
function _importPartage() {
  if (typeof window.ktaPlanAffiche === "function" && !window.ktaPlanAffiche()) return null;
  const K = window.KtaExtensions;
  return (K && typeof K.importPartage === "function") ? K.importPartage(window._currentLoadedPlanId) : null;
}

// Plan partagé : objets d'ici et du fichier au format de KtaUid.preparerImport.
function _etatImportLocal() {
  return {
    data: (window.getEditorPoints && window.getEditorPoints()) || [],
    roads: (window.getRoads && window.getRoads()) || [],
    zones: (window.getZones && window.getZones()) || [],
    structures: (window.getStructures && window.getStructures()) || [],
    tombstones: window.KtaUid ? window.KtaUid.getTombstones() : []
  };
}
function _etatImportFichier(d) {
  return { data: d.editorPoints || [], roads: d.roads || [], zones: d.zones || [], structures: d.structures || [],
    tombstones: d.tombstones || [] };
}

// « Ajouter au plan » : la légende d'ici garde ses réglages, celle du fichier complète ce qui manque.
function _fusionnerLegende(ici, fichier) {
  if (!fichier || typeof fichier !== "object") return ici;
  const a = ici || {};
  const dico = function (k) { return Object.assign({}, fichier[k] || {}, a[k] || {}); };
  const ids = new Set((a.customEntries || []).map(function (e) { return e && e.id; }));
  return Object.assign({}, a, { labels: dico("labels"), hidden: dico("hidden"), colors: dico("colors"),
    borders: dico("borders"), removedPlan: (a.removedPlan || []).slice(),
    customEntries: (a.customEntries || []).concat((fichier.customEntries || []).filter(function (e) {
      return e && !ids.has(e.id);
    })) });
}

function telechargerSessionJSON() {
  // Repli si sessionExporter.js n'est pas chargé : format Full sans mesure ni tracker.
  const data = {
    type: "devmap-session",
    version: "1.0",
    date_export: new Date().toISOString(),
    editorPoints: window.getEditorPoints ? window.getEditorPoints() : [],
    roads:        window.getRoads        ? window.getRoads()        : [],
    zones:        window.getZones        ? window.getZones()        : [],
    // Fichiers sans 'structures' → `|| []` à l'import.
    structures:   window.getStructures   ? window.getStructures()   : [],
    // Traces de suppression : un réimport ne ressuscite rien.
    tombstones:   window.KtaUid ? window.KtaUid.getTombstones() : []
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "devmap-session.json";
  a.click();

  URL.revokeObjectURL(url);
}

// ── Import session JSON ──────────
function importerSessionJSON(file) {
  if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;   // 🔒 lecture seule
  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);

      if (data.type !== "devmap-session") {
        window.ktaAlerte(window.I18n.t("impexp.fileInvalid"), { type: "erreur" });
        return;
      }
      // Plan partagé : jamais de remplacement silencieux, la fenêtre propose Ajouter / Remplacer pour tous.
      if (_importPartage()) { ouvrirImportSession(file); return; }

      _preparerIdentitesImport(data);
      if (window.setEditorPoints) window.setEditorPoints(data.editorPoints || []);
      if (window.renderEditorPoints) window.renderEditorPoints();
      if (window.resetMesure) window.resetMesure();
      if (window.setMeasurePoints) {
        window.setMeasurePoints(data.measure && data.measure.points ? data.measure.points : []);
      }
      if (window.setMeasurePointsSurface) {
        window.setMeasurePointsSurface(data.measureSurface && data.measureSurface.points ? data.measureSurface.points : []);
      }
      if (window.resetRoads) window.resetRoads();
      if (window.setRoads) window.setRoads(data.roads || []);
      // Liaisons inter-plan (fusion par id dans le registre).
      if (window.InterPlanLinks && typeof window.InterPlanLinks.importLinks === "function") {
        window.InterPlanLinks.importLinks(data.interPlanLinks || []);
      }

      // Rien d'autre ne signale la fin (points hors vue) : toast succès, important (visible même en Silence).
      const msgFin = window.I18n.t("impexp.importDone");
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(msgFin, "success", { important: true });
      } else window.ktaAlerte(msgFin);
    } catch (err) {
      console.error(err);
      window.ktaAlerte(window.I18n.t("impexp.importError"), { type: "erreur" });
    }
  };

  reader.readAsText(file);
}

// ── Import GPX ──────────
// Fichier GPX externe (TopoDroid, OsmAnd, Avenza…) converti WGS84 → plan par le calage KMZ
// (KmzExport.getCalibration / gpsToPlan). Aperçu (X points / Y tracés) → ajout aux annotations de session
// avec snapshot HistoryManager (Ctrl+Z possible).
window.ouvrirImportGpx = function(fichierInitial) {
  if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;   // 🔒 lecture seule
  const existing = document.getElementById("kta-import-gpx-modal");
  if (existing) { existing.remove(); if (!fichierInitial) return; }

  if (!window.GpxIO) {
    window.ktaAlerte(window.I18n.t("impexp.gpxIoUnavailable"), { type: "erreur" });
    return;
  }
  const calibre = window.GpxIO.verifierCalibrage();

  const overlay = document.createElement("div");
  overlay.id = "kta-import-gpx-modal";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:560px; height:auto !important; max-height:90vh !important;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">' + window.I18n.t("impexp.gpx.modalTitle") + '</span>' +
        '<button class="kta-panneau-close" id="kta-import-gpx-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        (!calibre ?
          '<div class="kta-aide-section" style="background:rgba(220,50,50,0.10); border-color:rgba(220,50,50,0.30);">' +
            '<p style="color:var(--kta-erreur); font-weight:600;">' + window.I18n.t("impexp.gpx.notCalibratedTitle") + '</p>' +
            '<p>' + window.I18n.t("impexp.gpx.notCalibratedBody") + '</p>' +
            '<p>' + window.I18n.t("impexp.gpx.howToCalibrate") + '</p>' +
          '</div>'
        :
          '<div class="kta-aide-section">' +
            '<p>' + window.I18n.t("impexp.gpx.intro") + '</p>' +
            '<p>' + window.I18n.t("impexp.gpx.undoable") + '</p>' +
          '</div>' +
          '<div class="kta-aide-section">' +
            '<label class="kta-net-paranoia-toggle" style="cursor:pointer;">' +
              '<input type="file" accept=".gpx,application/gpx+xml" id="kta-import-gpx-file" style="display:none;">' +
              '<span style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:22px;">📁</span>' +
                '<span><strong>' + window.I18n.t("impexp.gpx.selectFile") + '</strong></span>' +
              '</span>' +
            '</label>' +
            '<div id="kta-import-gpx-preview" style="margin-top:12px;"></div>' +
          '</div>'
        ) +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(overlay);

  document.getElementById("kta-import-gpx-close").addEventListener("click", function() {
    overlay.remove();
  });

  if (!calibre) return;

  let _pendingPreview = null;
  const fileInput = document.getElementById("kta-import-gpx-file");
  const previewEl = document.getElementById("kta-import-gpx-preview");

  const labelEl = fileInput.closest("label");
  if (labelEl) {
    labelEl.addEventListener("click", function(e) {
      if (e.target !== fileInput) {
        e.preventDefault();
        fileInput.click();
      }
    });
  }

  fileInput.addEventListener("change", function(e) {
    _traiterFichier(e.target.files && e.target.files[0]);
  });
  if (fichierInitial) _traiterFichier(fichierInitial);

  function _traiterFichier(file) {
    if (!file) return;

    previewEl.innerHTML = '<p style="color:var(--kta-texte-3);">' + window.I18n.t("impexp.gpx.reading") + '</p>';

    window.GpxIO.importer(file, { confirmAdd: false }).then(function(r) {
      if (!r.ok) {
        previewEl.innerHTML = '<div style="background:rgba(220,50,50,0.10); border:1px solid rgba(220,50,50,0.30); padding:10px 14px; border-radius:6px; color:var(--kta-erreur);"><strong>' + window.I18n.t("impexp.gpx.errorPrefix") + '</strong> ' + r.msg + '</div>';
        return;
      }
      _pendingPreview = r;
      let warnHtml = '';
      if (r.preview.outOfBoundsWpt > 0) {
        warnHtml += '<div style="color:var(--kta-avert); font-size:12px; margin-top:6px;">' + window.I18n.t("impexp.gpx.warnWptOob", { n: r.preview.outOfBoundsWpt }) + '</div>';
      }
      if (r.preview.outOfBoundsTrk > 0) {
        warnHtml += '<div style="color:var(--kta-avert); font-size:12px; margin-top:6px;">' + window.I18n.t("impexp.gpx.warnTrkOob", { n: r.preview.outOfBoundsTrk }) + '</div>';
      }
      previewEl.innerHTML =
        '<div style="background:rgba(244,197,66,0.12); border:1px solid rgba(244,197,66,0.40); padding:12px 14px; border-radius:6px;">' +
          '<div style="font-weight:700; margin-bottom:8px;">' + window.I18n.t("impexp.gpx.previewTitle") + '</div>' +
          '<div>' + window.I18n.t("impexp.gpx.previewWpts", { n: r.preview.wpts }) + '</div>' +
          '<div>' + window.I18n.t("impexp.gpx.previewTrks", { n: r.preview.trks }) + '</div>' +
          (r.preview.metadata && r.preview.metadata.name ? '<div style="margin-top:6px; font-size:12px; color:var(--kta-texte-3);">' + window.I18n.t("impexp.gpx.previewSource", { name: r.preview.metadata.name }) + '</div>' : '') +
          warnHtml +
        '</div>' +
        '<div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-import-gpx-cancel" type="button">' + window.I18n.t("impexp.gpx.cancel") + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-import-gpx-confirm" type="button" ' +
                  (r.preview.wpts === 0 && r.preview.trks === 0 ? "disabled" : "") + '>' + window.I18n.t("impexp.gpx.confirm") + '</button>' +
        '</div>';

      document.getElementById("kta-import-gpx-cancel").addEventListener("click", function() {
        _pendingPreview = null;
        previewEl.innerHTML = '';
        fileInput.value = '';
      });
      document.getElementById("kta-import-gpx-confirm").addEventListener("click", function() {
        if (!_pendingPreview || !_pendingPreview._toApply) return;
        window.GpxIO._appliquerImport(_pendingPreview._toApply.points, _pendingPreview._toApply.tracks);
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(
            window.I18n.t("impexp.gpx.toastOk", {
              wpts: _pendingPreview._toApply.points.length,
              trks: _pendingPreview._toApply.tracks.length
            }),
            "info"
          );
        }
        overlay.remove();
      });
    });
  }
};

// ── Import : un seul sélecteur, l'extension choisit le parcours ──────────
//   .json / .zip → ouvrirImportSession(file) : aperçu + avertissement « remplace »
//   .gpx         → ouvrirImportGpx(file)     : aperçu + « ajoute, Ctrl+Z »
// Nom ouvrirImportChoix gardé : appelé par le menu ⬇️ d'interface.js.
window.ouvrirImportChoix = function() {
  if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;   // 🔒 lecture seule
  const ancien = document.getElementById("kta-import-fichier");
  if (ancien) ancien.remove();  // sélecteur précédent annulé par l'user
  const input = document.createElement("input");
  input.type = "file";
  input.id = "kta-import-fichier";
  input.accept = ".json,.zip,.gpx,application/json,application/zip,application/gpx+xml";
  input.style.display = "none";
  input.addEventListener("change", function() {
    const f = input.files && input.files[0];
    input.remove();
    if (f) window.ouvrirImportFichier(f);
  });
  document.documentElement.appendChild(input);
  input.click();
};

window.ouvrirImportFichier = function(file) {
  if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;   // 🔒 lecture seule
  if (/\.gpx$/i.test(file.name)) {
    if (typeof window.ouvrirImportGpx === "function") window.ouvrirImportGpx(file);
    else window.ktaAlerte(window.I18n.t("impexp.gpxModuleUnavailable"), { type: "erreur" });
  } else if (/\.(json|zip)$/i.test(file.name)) {
    ouvrirImportSession(file);
  } else {
    window.ktaAlerte(window.I18n.t("impexp.extInconnue", { name: file.name }));
  }
};

// ── Import session : modale plein écran ──────────
function ouvrirImportSession(fichierInitial) {
  if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;   // 🔒 lecture seule
  const existing = document.getElementById("kta-import-modal");
  if (existing) { existing.remove(); if (!fichierInitial) return; }
  // Plan partagé : choix Ajouter / Remplacer pour tous à la place de l'avertissement « remplace ».
  const partage = _importPartage();
  const _tp = function (k, v) { return window.I18n.t("impexp.session.partage." + k, v); };
  const _choixMode = function (val, titre, aide) {
    return '<label style="display:flex; gap:8px; align-items:flex-start; margin:8px 0 0; cursor:pointer; line-height:1.45;">' +
      '<input type="radio" name="kta-import-mode" value="' + val + '" data-kta-import-mode="' + val + '"' +
      (val === "ajouter" ? " checked" : "") + ' style="margin-top:3px;">' +
      '<span><strong>' + titre + '</strong><br><span style="color:var(--kta-texte-3);">' + aide + '</span></span></label>';
  };
  const blocModes = !partage ? "" :
    '<div class="kta-aide-section" id="kta-import-modes" style="display:none; font-size:13px; color:var(--kta-texte);">' +
      '<div>' + _tp("intro") + '</div>' +
      _choixMode("ajouter", _tp("ajouter"), _tp("ajouterAide")) +
      (partage.remplacer
        ? _choixMode("remplacer", _tp("remplacer"), _tp("remplacerAide"))
        : '<div style="margin-top:8px; color:var(--kta-texte-3);">' + _tp("remplacerIndispo") + '</div>') +
    '</div>';

  const modal = document.createElement("div");
  modal.id = "kta-import-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:90vh;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">${window.I18n.t("impexp.session.modalTitle")}</span>
        <button class="kta-panneau-close" id="kta-import-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <p style="font-size:13px; color:var(--kta-texte-3); margin:0 0 14px; line-height:1.5;">
          ${window.I18n.t("impexp.session.intro")}
        </p>

        <div class="kta-conv-champ">
          <label class="kta-conv-label">${window.I18n.t("impexp.session.fileLabel")}</label>
          <div class="kta-conv-drop" id="kta-import-drop">
            <span id="kta-import-drop-label">${window.I18n.t("impexp.session.dropLabel")}</span>
            <input type="file" id="kta-import-file" accept=".json,.zip,application/json,application/zip" style="display:none">
          </div>
        </div>

        <div id="kta-import-apercu-wrap" class="kta-conv-champ" style="display:none;">
          <label class="kta-conv-label">${window.I18n.t("impexp.session.previewLabel")}</label>
          <div id="kta-import-apercu" style="background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px; font-size:13px; color:var(--kta-texte);"></div>
        </div>

        <div class="kta-aide-section" id="kta-import-warn" style="display:none; border-color:rgba(255,200,100,0.3); background:rgba(255,180,80,0.06);">
          <div style="font-size:13px; color:var(--kta-avert);">
            ${window.I18n.t("impexp.session.warn")}
          </div>
        </div>
        ${blocModes}

        <div id="kta-import-erreur" class="kta-conv-erreur" style="display:none;"></div>

        <div class="kta-conv-actions" style="margin-top:14px;">
          <button class="kta-btn kta-btn-ghost"   id="kta-import-annuler">${window.I18n.t("impexp.session.cancel")}</button>
          <button class="kta-btn kta-btn-primary"  id="kta-import-valider" disabled>${window.I18n.t("impexp.session.import")}</button>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);

  const dropZone   = document.getElementById("kta-import-drop");
  const fileInput  = document.getElementById("kta-import-file");
  const dropLabel  = document.getElementById("kta-import-drop-label");
  const apercuWrap = document.getElementById("kta-import-apercu-wrap");
  const apercuEl   = document.getElementById("kta-import-apercu");
  const warnEl     = document.getElementById("kta-import-warn");
  const erreurEl   = document.getElementById("kta-import-erreur");
  const btnValider = document.getElementById("kta-import-valider");
  const btnAnnuler = document.getElementById("kta-import-annuler");
  const btnClose   = document.getElementById("kta-import-close");

  let fichierCharge = null;
  let dataParsee    = null;

  function fermer() { modal.remove(); }

  function setErr(msg) {
    erreurEl.textContent = msg || "";
    erreurEl.style.display = msg ? "block" : "none";
  }
  function _masquerAvertissements() {
    warnEl.style.display = "none";
    const modesEl = document.getElementById("kta-import-modes");
    if (modesEl) modesEl.style.display = "none";
  }

  // Photos extraites du ZIP entre l'analyse et la validation : [{id, pointId, mime, size, blob, fiche}].
  let _pendingPhotosToRestore = null;
  // Documents du Mode Histoire du ZIP (`mode-histoire/<name>`).
  let _pendingHistoirePdfToRestore = null;

  function _renderApercu(data) {
    const nbPoints     = (data.editorPoints || []).length;
    const nbMesure     = (data.measure && data.measure.points) ? data.measure.points.length : 0;
    const nbTraces     = (data.roads || []).length;
    const nbZones      = (data.zones || []).length;
    // Structures comptées dans l'aperçu (confirmation visible qu'elles sont dans le fichier).
    const nbStructures = (data.structures || []).length;
    const nbPhotos     = (_pendingPhotosToRestore && _pendingPhotosToRestore.length) || 0;
    const photosBadge  = nbPhotos > 0
      ? '<span>' + window.I18n.t("impexp.session.apercuPhotos", { n: nbPhotos }) + '</span>'
      : '';
    const _trk     = data.tracker || null;
    const trkPathN = _trk && Array.isArray(_trk.path) ? _trk.path.length : 0;
    const trkTimeN = _trk && Array.isArray(_trk.timeline) ? _trk.timeline.length : 0;
    const trackerBadge = (trkPathN > 0 || trkTimeN > 0)
      ? '<span>' + window.I18n.t("impexp.session.apercuTracker", { pts: trkPathN, evts: trkTimeN }) + '</span>'
      : '';

    const hasNoteLibre = typeof data.noteLibre === "string" && data.noteLibre.length > 0;
    const hasHistPdf   = !!(_pendingHistoirePdfToRestore && _pendingHistoirePdfToRestore.blob);
    let histoireBadge = "";
    if (hasNoteLibre || hasHistPdf) {
      const parts = [];
      if (hasNoteLibre) parts.push(window.I18n.t("impexp.session.histNote"));
      if (hasHistPdf)   parts.push(window.I18n.t("impexp.session.histPdf"));
      histoireBadge = '<span>' + window.I18n.t("impexp.session.apercuHistoire", { parts: parts.join(" + ") }) + '</span>';
    }


    apercuEl.innerHTML = `
      <div style="display:flex; gap:14px; flex-wrap:wrap;">
        <span>${window.I18n.t("impexp.session.apercuPoints", { n: nbPoints })}</span>
        <span>${window.I18n.t("impexp.session.apercuTraces", { n: nbTraces })}</span>
        <span>${window.I18n.t("impexp.session.apercuZones", { n: nbZones })}</span>
        <span>${window.I18n.t("impexp.session.apercuStructures", { n: nbStructures })}</span>
        <span>${window.I18n.t("impexp.session.apercuMesure", { n: nbMesure })}</span>
        ${trackerBadge}
        ${photosBadge}
        ${histoireBadge}
      </div>
    `;
    apercuWrap.style.display = "block";
    const modesEl = document.getElementById("kta-import-modes");
    if (modesEl) modesEl.style.display = "block";
    else warnEl.style.display = "block";
    btnValider.disabled = false;
  }

  function _parseSessionJson(text) {
    const data = JSON.parse(text);
    if (data.type !== "devmap-session") {
      throw new Error(window.I18n.t("impexp.session.errNotValid"));
    }
    return data;
  }

  // ZIP de session : session.json + photos/ (+ mode-histoire/). Promise<data> ; remplit _pendingPhotosToRestore.
  function _parseSessionZip(file) {
    if (typeof JSZip === "undefined") {
      return Promise.reject(new Error(window.I18n.t("impexp.session.errJszip")));
    }
    return JSZip.loadAsync(file).then(function(zip) {
      const sessionFile = zip.file("session.json");
      if (!sessionFile) throw new Error(window.I18n.t("impexp.session.errZipNoSession"));
      return sessionFile.async("string").then(function(jsonText) {
        const data = _parseSessionJson(jsonText);
        // Documents du Mode Histoire : `historeSessionPdfs` (tableau), sinon l'ancien champ unique
        // `historeSessionPdf`. Blob gardé en attente jusqu'à Valider ; fichier référencé absent → warn, ignoré.
        _pendingHistoirePdfToRestore = null;
        const _refsPdf = (data && Array.isArray(data.historeSessionPdfs) && data.historeSessionPdfs.length)
          ? data.historeSessionPdfs
          : ((data && data.historeSessionPdf && data.historeSessionPdf.file) ? [data.historeSessionPdf] : []);
        if (_refsPdf.length > 0) {
          const _lus = [];
          const _proms = [];
          _refsPdf.forEach(function(ref) {
            if (!ref || !ref.file) return;
            const histFile = zip.file(ref.file);
            if (!histFile) {
              console.warn("[Import session ZIP] PDF Histoire référencé mais absent :", ref.file);
              return;
            }
            _proms.push(histFile.async("blob").then(function(blob) {
              _lus.push({ blob: blob, name: ref.name || "histoire.pdf" });
            }));
          });
          if (_proms.length > 0) {
            data._pendingHistPromise = Promise.all(_proms).then(function() {
              if (_lus.length > 0) _pendingHistoirePdfToRestore = _lus;
            });
          }
        }

        // Pas de photos/_index.json → pas de photos.
        const indexFile = zip.file("photos/_index.json");
        if (!indexFile) {
          _pendingPhotosToRestore = [];
          // Seulement le PDF Histoire à attendre.
          if (data._pendingHistPromise) {
            return data._pendingHistPromise.then(function() {
              delete data._pendingHistPromise;
              return data;
            });
          }
          return data;
        }
        return indexFile.async("string").then(function(idxText) {
          let idxObj;
          try { idxObj = JSON.parse(idxText); }
          catch(e) { throw new Error(window.I18n.t("impexp.session.errIndexCorrupt", { msg: e.message })); }
          const idxMap = idxObj && idxObj.photos ? idxObj.photos : {};
          const photoIds = Object.keys(idxMap);
          if (photoIds.length === 0) {
            _pendingPhotosToRestore = [];
            // Index photos vide : on attend quand même le PDF Histoire.
            if (data._pendingHistPromise) {
              return data._pendingHistPromise.then(function() {
                delete data._pendingHistPromise;
                return data;
              });
            }
            return data;
          }
          const promises = photoIds.map(function(pid) {
            const info = idxMap[pid] || {};
            const filename = "photos/" + (info.file || (pid + ".jpg"));
            const f = zip.file(filename);
            if (!f) {
              console.warn("[Import] Photo manquante dans le ZIP :", filename);
              return null;
            }
            return f.async("blob").then(function(blob) {
              return {
                id:      pid,
                pointId: info.pointId,
                mime:    info.mime || blob.type || "image/jpeg",
                size:    info.size || blob.size,
                blob:    blob,
                fiche:   info.fiche || null   // absente des anciens ZIP
              };
            });
          });
          return Promise.all(promises).then(function(arr) {
            _pendingPhotosToRestore = arr.filter(function(p) { return p !== null; });
            // PDF Histoire attendu aussi avant de rendre l'aperçu.
            if (data._pendingHistPromise) {
              return data._pendingHistPromise.then(function() {
                delete data._pendingHistPromise;
                return data;
              });
            }
            return data;
          });
        });
      });
    });
  }

  function chargerFichier(file) {
    fichierCharge = file;
    dropLabel.textContent = window.I18n.t("impexp.session.fileLoaded", { name: file.name });
    setErr("");
    _pendingPhotosToRestore = null;
    _pendingHistoirePdfToRestore = null;

    const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip"
                  || file.type === "application/x-zip-compressed";

    if (isZip) {
      _parseSessionZip(file).then(function(data) {
        dataParsee = data;
        _renderApercu(data);
      }).catch(function(err) {
        console.error("[Import session ZIP] :", err);
        setErr(window.I18n.t("impexp.session.errZipPrefix", { msg: err.message || err }));
        dataParsee = null;
        _pendingPhotosToRestore = null;
        _pendingHistoirePdfToRestore = null;
        apercuWrap.style.display = "none";
        _masquerAvertissements();
        btnValider.disabled = true;
      });
      return;
    }

    // JSON pur.
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = _parseSessionJson(e.target.result);
        dataParsee = data;
        _renderApercu(data);
      } catch(err) {
        setErr(window.I18n.t("impexp.session.errPrefix", { msg: err.message }));
        dataParsee = null;
        apercuWrap.style.display = "none";
        _masquerAvertissements();
        btnValider.disabled = true;
      }
    };
    reader.readAsText(file);
  }

  dropZone.addEventListener("click", function() { fileInput.click(); });
  fileInput.addEventListener("change", function() {
    if (fileInput.files[0]) chargerFichier(fileInput.files[0]);
  });
  dropZone.addEventListener("dragover", function(e) {
    e.preventDefault(); dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", function() { dropZone.classList.remove("dragover"); });
  dropZone.addEventListener("drop", function(e) {
    e.preventDefault(); dropZone.classList.remove("dragover");
    const f = e.dataTransfer.files[0];
    // .zip aussi (session avec photos).
    const okExt = f && (/\.(json|zip)$/i).test(f.name);
    if (okExt) chargerFichier(f);
    else if (f && /\.gpx$/i.test(f.name)) { fermer(); window.ouvrirImportFichier(f); }
    else setErr(window.I18n.t("impexp.session.errDropExt"));
  });

  btnClose.addEventListener("click", fermer);
  btnAnnuler.addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  // `mode` : null (plan local : remplacement historique) | "ajouter" | "remplacer" (plan partagé, KtaUid.preparerImport).
  function _importer(mode) {
    // Photos restaurées en IDB AVANT editorPoints (la grille interroge IDB). FUSION, jamais de purge : une
    // photo n'est jamais effacée sans confirmation (règle produit), y compris les photos « sans point ».
    // Les photos du fichier s'AJOUTENT ; une photo déjà en base (même id) est gardée (`siAbsente` : son
    // rattachement ou sa fiche peuvent être plus récents). Photo dont le point n'est plus dans la session →
    // « sans point » dans 📸 Mes photos. → Promise<{ ajoutees, deja, echecs }>.
    function _restorerPhotos() {
      const bilan = { ajoutees: 0, deja: 0, echecs: 0 };
      if (!_pendingPhotosToRestore || _pendingPhotosToRestore.length === 0) {
        return Promise.resolve(bilan);
      }
      if (!window.MyKTAMapPhotos) {
        console.warn("[Import] MyKTAMapPhotos indispo — photos ignorées");
        return Promise.resolve(bilan);
      }
      const planId = window._currentLoadedPlanId || "default";
      const promises = _pendingPhotosToRestore.map(function(p) {
        return window.MyKTAMapPhotos.restorePhoto({
          id:      p.id,
          planId:  planId,
          pointId: String(p.pointId == null ? "" : p.pointId),
          blob:    p.blob,
          mime:    p.mime,
          size:    p.size,
          fiche:   p.fiche   // fiche du point (facultative, validée par restorePhoto)
        }, { source: "import", siAbsente: true })   // restauration de l'app (≠ dépôt d'une extension)
          .then(function(id) { if (id) bilan.ajoutees++; else bilan.deja++; })
          .catch(function(e) { bilan.echecs++; console.warn("[Import] photo non restaurée :", p.id, e); });
      });
      return Promise.all(promises).then(function() {
        console.log("[Import] Photos fusionnées :", bilan);
        return bilan;
      });
    }

    // Snapshot sessionBackups ATTENDU avant (un remplacement efface tout ; un ajout se défait aussi par lui).
    let _snapshotAvantImport = false;
    const _snapAvant = (window.SessionBackups && typeof window.SessionBackups.snapshot === "function")
      ? Promise.resolve().then(function() { return window.SessionBackups.snapshot("before-import-session"); })
          .catch(function(e) { console.warn("[Import] snapshot avant import échoué :", e); return null; })
      : Promise.resolve(null);
    _snapAvant.then(function(snap) {
      _snapshotAvantImport = !!snap;
      return _restorerPhotos();
    }).then(function(bilanPhotos) {
      try {
        _preparerIdentitesImport(dataParsee, !!mode);
        // Plan partagé : objets fusionnés (ajouter) ou remplacés avec une trace par objet retiré (remplacer), pour
        // que la synchro propage les suppressions et envoie les objets du fichier (horodatés maintenant).
        let bilanPartage = null;
        let objets = { data: dataParsee.editorPoints || [], roads: dataParsee.roads || [], zones: dataParsee.zones || [],
          structures: dataParsee.structures || [] };
        if (mode) {
          bilanPartage = window.KtaUid.preparerImport(_etatImportLocal(), _etatImportFichier(dataParsee), mode);
          window.KtaUid.setTombstones(bilanPartage.tombstones);
          objets = bilanPartage;
        }
        if (window.setEditorPoints)    window.setEditorPoints(objets.data);
        // Légende custom de la session (libellés, entrées custom) restaurée AVANT les rendus : les types custom
        // retrouvent libellé, couleur, icône. REMPLACE l'état légende session (absent → vide) ; « Ajouter » la
        // complète seulement.
        if (window.LegendCustomization && typeof window.LegendCustomization.loadSessionState === "function") {
          window.LegendCustomization.loadSessionState(mode === "ajouter"
            ? _fusionnerLegende(window.LegendCustomization.getSessionState(), dataParsee.customLegend)
            : (dataParsee.customLegend || null));
        }
        // Liaisons inter-plan réinjectées (fusion par id, pas de doublon) ; champ absent → 0.
        if (window.InterPlanLinks && typeof window.InterPlanLinks.importLinks === "function") {
          window.InterPlanLinks.importLinks(dataParsee.interPlanLinks || []);
        }
        if (window.renderEditorPoints) window.renderEditorPoints();
        // Mesure et suivi (propres à l'appareil) : « Ajouter » n'y touche pas.
        if (mode !== "ajouter") {
          if (window.resetMesure)      window.resetMesure();
          if (window.setMeasurePoints) {
            window.setMeasurePoints(dataParsee.measure && dataParsee.measure.points ? dataParsee.measure.points : []);
          }
          if (window.setMeasurePointsSurface) {
            window.setMeasurePointsSurface(dataParsee.measureSurface && dataParsee.measureSurface.points ? dataParsee.measureSurface.points : []);
          }
        }
        if (window.resetRoads)         window.resetRoads();
        if (window.setRoads)           window.setRoads(objets.roads);
        if (window.resetZones)         window.resetZones();
        if (window.setZones)           window.setZones(objets.zones);
        // Structures : absentes des vieux fichiers → `|| []`.
        if (window.resetStructures)    window.resetStructures();
        if (window.setStructures)      window.setStructures(objets.structures);

        // Calques en modification : le fichier porte les objets marqués, pas la liste des calques verrouillés —
        // déduite des marques (calqueSession.js > resynchroniser). Sinon doublon, ou calque masqué et vide.
        let _calquesRemis = null;
        if (window.CalqueSession && typeof window.CalqueSession.resynchroniser === "function") {
          try { _calquesRemis = window.CalqueSession.resynchroniser(); }
          catch(e) { console.warn("[Import session] resynchronisation des calques :", e); }
        }

        // Tracker : on ne restaure QUE timeline + startTs (comme SessionPersist) ; path et position sont des
        // artefacts runtime du plan courant. Absent → tracker non touché.
        if (mode !== "ajouter" && dataParsee.tracker && typeof dataParsee.tracker === "object"
            && Array.isArray(dataParsee.tracker.timeline)
            && typeof window.setTrackingTimeline === "function") {
          try {
            window.setTrackingTimeline(
              dataParsee.tracker.timeline,
              dataParsee.tracker.startTs || null
            );
          } catch(e) {
            console.warn("[Import session] setTrackingTimeline failed :", e);
          }
        }

        // Mode Histoire : noteLibre (inline) → localStorage ; documents extraits à l'analyse →
        // ModeHistoire.importSessionData() (logique IDB centralisée). Champs absents → on ne touche RIEN.
        // `_pendingHistoirePdfToRestore` : tableau (un objet unique est encore accepté). « Ajouter » n'écrase pas la
        // note libre d'ici (les documents, eux, s'ajoutent).
        const _noteToImport = (mode !== "ajouter" && typeof dataParsee.noteLibre === "string") ? dataParsee.noteLibre : null;
        const _docs = Array.isArray(_pendingHistoirePdfToRestore)
          ? _pendingHistoirePdfToRestore
          : (_pendingHistoirePdfToRestore ? [_pendingHistoirePdfToRestore] : []);
        if ((_noteToImport && _noteToImport.length > 0) || _docs.length > 0) {
          if (window.ModeHistoire && typeof window.ModeHistoire.importSessionData === "function") {
            window.ModeHistoire.importSessionData(_noteToImport, _docs)
              .then(function(ok) {
                console.log("[Import session] Mode Histoire restauré :",
                            { note: !!_noteToImport, pdfs: _docs.length, ok: ok });
              })
              .catch(function(err) {
                console.warn("[Import session] Mode Histoire restore err :", err);
              });
          } else {
            console.warn("[Import session] ModeHistoire.importSessionData indispo (module pas chargé ?)");
          }
        }

        _pendingPhotosToRestore = null;  // cleanup
        _pendingHistoirePdfToRestore = null;
        fermer();
        if (_snapshotAvantImport && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(window.I18n.t("impexp.session.toastSnapshot"), "info");
        }
        if (bilanPartage && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(_tp(mode === "ajouter" ? "toastAjout" : "toastRemplace",
            { n: bilanPartage.ajoutes, maj: bilanPartage.misAJour, sup: bilanPartage.supprimes }), "success", { important: true });
        }
        // Bilan de la fusion des photos (rien d'existant n'a été effacé).
        const _bp = bilanPhotos || { ajoutees: 0, deja: 0, echecs: 0 };
        if ((_bp.ajoutees || _bp.deja || _bp.echecs)
            && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(window.I18n.t("impexp.session.toastPhotos",
            { n: _bp.ajoutees, deja: _bp.deja }) +
            (_bp.echecs ? " " + window.I18n.t("impexp.session.toastPhotosEchecs", { n: _bp.echecs }) : ""),
            _bp.echecs ? "warn" : "info");
        }
        if (_calquesRemis && _calquesRemis.rapatries.length
            && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          const _noms = _calquesRemis.rapatries.map(function(id) {
            const lc = (window.PLAN_CONFIG && window.PLAN_CONFIG.dataLayers || [])
              .find(function(d) { return d && d.id === id; });
            return (lc && lc.label) || id;
          }).join(", ");
          window.OOMGuard.showToast(window.I18n.t("calque.import.remis",
            { n: _calquesRemis.rapatries.length, noms: _noms }), "info");
        }
      } catch(err) {
        console.error(err);
        btnValider.disabled = false;
        setErr(window.I18n.t("impexp.session.errImport", { msg: err.message || err }));
      }
    }).catch(function(err) {
      console.error("[Import] _restorerPhotos a échoué :", err);
      btnValider.disabled = false;
      setErr(window.I18n.t("impexp.session.errPhotos", { msg: err.message || err }));
    });
  }

  btnValider.addEventListener("click", function() {
    if (!dataParsee || btnValider.disabled) return;
    btnValider.disabled = true;   // un double clic lancerait deux imports
    if (!partage) { _importer(null); return; }
    const choisi = modal.querySelector('input[name="kta-import-mode"]:checked');
    const mode = choisi && choisi.value === "remplacer" ? "remplacer" : "ajouter";
    if (mode === "ajouter") { _importer("ajouter"); return; }
    // 🔒 Droit relu au moment de valider (il a pu être retiré depuis l'ouverture de la fenêtre).
    const p2 = _importPartage();
    if (!p2 || !p2.remplacer || !window.KtaUid) {
      btnValider.disabled = false;
      setErr(_tp("remplacerIndispo"));
      return;
    }
    _preparerIdentitesImport(dataParsee, true);
    const n = window.KtaUid.preparerImport(_etatImportLocal(), _etatImportFichier(dataParsee), "remplacer").supprimes;
    window.ktaConfirm(_tp("confirmRemplacer", { n: n }), { titre: _tp("confirmTitre"), okLabel: _tp("confirmOk") })
      .then(function(ok) {
        if (ok) _importer("remplacer");
        else btnValider.disabled = false;
      });
  });

  if (fichierInitial) chargerFichier(fichierInitial);
}


// ── Exports window (ouvrirImportChoix est posée dans sa propre déclaration) ──────────
window.telechargerSessionJSON = telechargerSessionJSON;
window.importerSessionJSON    = importerSessionJSON;
window.ouvrirImportSession    = ouvrirImportSession;
