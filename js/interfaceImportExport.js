/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE IMPORT / EXPORT SESSION — JSON + GPX
// =========================
// 🆕 v1.31.0 (P3 Lot 5 — découpe interface.js) : module extrait de
// js/interface.js (lignes 515-1184 avant extraction) pour réduire le
// volume du fichier principal.
//
// Aucun changement de comportement runtime. Les 4 fonctions exposées
// via `window.*` sont strictement identiques à v1.30.1.
//
// 📋 API publique :
//   - window.telechargerSessionJSON()
//        → Export de la session courante (editor, roads, zones, structures,
//          measure, etc.) en fichier JSON téléchargeable.
//   - window.importerSessionJSON(file)
//        → Import depuis un fichier JSON. Validation du format + restore
//          via les setters globaux.
//   - window.ouvrirImportChoix()
//        → Ouvre directement le sélecteur de fichier (.json/.zip/.gpx) ;
//          window.ouvrirImportFichier(file) route selon l'extension.
//   - window.ouvrirImportSession([file]) / window.ouvrirImportGpx([file])
//        → Modales d'import (aperçu + validation), fichier pré-chargé
//          si fourni.
//
// 🔌 Dépendances externes (toutes via window.* / global declarations) :
//   - window.getRoads / setRoads / resetRoads
//   - window.getZones / setZones / resetZones
//   - window.getEditorPoints / setEditorPoints
//   - window.getStructures / setStructures / resetStructures
//   - window.getMeasurePoints / setMeasurePoints
//   - window.getMeasurePointsSurface / setMeasurePointsSurface
//   - window.getTrackingPath / setTrackingPath
//   - window.GpxIO                       [gpxIO.js]
//   - window.KmzImport                   [kmzImport.js]
//   - window.MyKTAMapPhotos              [photos.js]
//
// 📍 Ordre de chargement (cf index.html) :
//   - Doit charger APRÈS interface.js (cohérence ordre découpe).
//     L'ordre est cosmétique car les fonctions sont appelées au runtime
//     (clic user via sidebar).

// =========================
// EXPORT SESSION JSON
// =========================
// 🆔 v2.2.0 — Import par REMPLACEMENT d'une session (ETUDE_UID décision 7) :
// les objets d'un fichier ancien reçoivent un uid (repli updatedAt = date
// d'export du fichier), un uid en double dans le fichier est régénéré, et les
// traces de suppression du fichier REMPLACENT celles du plan (c'est un
// remplacement : l'état importé devient l'état du plan).
function _preparerIdentitesImport(d) {
  if (!window.KtaUid || !d || typeof d !== "object") return;
  const repli = Date.parse(d.date_export || d.exported_at) || Date.now();
  const vus = new Set();
  window.KtaUid.ensureAll(d.editorPoints, "pt", repli, vus);
  window.KtaUid.ensureAll(d.roads, "rd", repli, vus);
  window.KtaUid.ensureAll(d.zones, "zn", repli, vus);
  window.KtaUid.ensureAll(d.structures, "st", repli, vus);
  window.KtaUid.setTombstones(d.tombstones);
}

function telechargerSessionJSON() {
  // Fonction conservée comme fallback si sessionExporter.js n'est pas chargé.
  // Format Full (sans mesure, sans tracker) — voir sessionExporter.js pour la modale complète.
  const data = {
    type: "devmap-session",
    version: "1.0",
    date_export: new Date().toISOString(),
    editorPoints: window.getEditorPoints ? window.getEditorPoints() : [],
    roads:        window.getRoads        ? window.getRoads()        : [],
    zones:        window.getZones        ? window.getZones()        : [],
    // 🆕 v1.9.3-A1.a : structures aussi dans le fallback JSON. Reste
    // rétro-compatible — les anciens imports sans 'structures' tomberont
    // sur l'array vide via `dataParsee.structures || []` côté import.
    structures:   window.getStructures   ? window.getStructures()   : [],
    // 🆔 v2.2.0 — traces de suppression (un réimport ne ressuscite rien)
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

// =========================
// IMPORT SESSION JSON
// =========================
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

      _preparerIdentitesImport(data);   // 🆔 v2.2.0
      if (window.setEditorPoints) window.setEditorPoints(data.editorPoints || []);
      if (window.renderEditorPoints) window.renderEditorPoints();
      if (window.resetMesure) window.resetMesure();
      if (window.setMeasurePoints) {
        window.setMeasurePoints(data.measure && data.measure.points ? data.measure.points : []);
      }
      // 🆕 v1.12.0-fix : restore aussi le polygone surface si présent dans le fichier importé
      if (window.setMeasurePointsSurface) {
        window.setMeasurePointsSurface(data.measureSurface && data.measureSurface.points ? data.measureSurface.points : []);
      }
      if (window.resetRoads) window.resetRoads();
      if (window.setRoads) window.setRoads(data.roads || []);
      // 🌀 v1.57.0 : liaisons inter-plan (fusion par id dans le registre)
      if (window.InterPlanLinks && typeof window.InterPlanLinks.importLinks === "function") {
        window.InterPlanLinks.importLinks(data.interPlanLinks || []);
      }

      // Fin d'import : rien ne le signale autrement (points hors vue) → toast warn, visible par défaut.
      const msgFin = window.I18n.t("impexp.importDone");
      if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(msgFin, "warn", { important: true });
      else window.ktaAlerte(msgFin);
    } catch (err) {
      console.error(err);
      window.ktaAlerte(window.I18n.t("impexp.importError"), { type: "erreur" });
    }
  };

  reader.readAsText(file);
}

// =========================
// 📤 IMPORT GPX — v1.14.0
// =========================
// Modale d'import d'un fichier GPX externe (TopoDroid, OsmAnd, Avenza,
// etc.). Réutilise la calibration KMZ existante (window.KmzExport
// .getCalibration / gpsToPlan) pour transformer les coords WGS84 → plan.
// Flow : sélection fichier → preview (X points / Y tracés) → confirm
// → ajout aux annotations session avec snapshot HistoryManager (undo OK).
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
            '<p style="color:#b02020; font-weight:600;">' + window.I18n.t("impexp.gpx.notCalibratedTitle") + '</p>' +
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

  // File picker handler
  let _pendingPreview = null;
  const fileInput = document.getElementById("kta-import-gpx-file");
  const previewEl = document.getElementById("kta-import-gpx-preview");

  // Click sur le label déclenche le file picker
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

    previewEl.innerHTML = '<p style="color:#8892a4;">' + window.I18n.t("impexp.gpx.reading") + '</p>';

    window.GpxIO.importer(file, { confirmAdd: false }).then(function(r) {
      if (!r.ok) {
        previewEl.innerHTML = '<div style="background:rgba(220,50,50,0.10); border:1px solid rgba(220,50,50,0.30); padding:10px 14px; border-radius:6px; color:#b02020;"><strong>' + window.I18n.t("impexp.gpx.errorPrefix") + '</strong> ' + r.msg + '</div>';
        return;
      }
      _pendingPreview = r;
      let warnHtml = '';
      if (r.preview.outOfBoundsWpt > 0) {
        warnHtml += '<div style="color:#8b4a0c; font-size:12px; margin-top:6px;">' + window.I18n.t("impexp.gpx.warnWptOob", { n: r.preview.outOfBoundsWpt }) + '</div>';
      }
      if (r.preview.outOfBoundsTrk > 0) {
        warnHtml += '<div style="color:#8b4a0c; font-size:12px; margin-top:6px;">' + window.I18n.t("impexp.gpx.warnTrkOob", { n: r.preview.outOfBoundsTrk }) + '</div>';
      }
      previewEl.innerHTML =
        '<div style="background:rgba(244,197,66,0.12); border:1px solid rgba(244,197,66,0.40); padding:12px 14px; border-radius:6px;">' +
          '<div style="font-weight:700; margin-bottom:8px;">' + window.I18n.t("impexp.gpx.previewTitle") + '</div>' +
          '<div>' + window.I18n.t("impexp.gpx.previewWpts", { n: r.preview.wpts }) + '</div>' +
          '<div>' + window.I18n.t("impexp.gpx.previewTrks", { n: r.preview.trks }) + '</div>' +
          (r.preview.metadata && r.preview.metadata.name ? '<div style="margin-top:6px; font-size:12px; color:#6b6354;">' + window.I18n.t("impexp.gpx.previewSource", { name: r.preview.metadata.name }) + '</div>' : '') +
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

// =========================
// 📥 IMPORT — un seul sélecteur, l'extension choisit le parcours
// =========================
// Avant (v1.14.5 → v1.98.25) : une modale à 2 cartes (Session / GPX), puis
// une 2e modale avec son propre sélecteur — 3 clics, et rien ne disait que
// l'une REMPLACE la session quand l'autre y AJOUTE. Désormais :
//   .json / .zip → ouvrirImportSession(file) : aperçu + avertissement « remplace »
//   .gpx         → ouvrirImportGpx(file)     : aperçu + « ajoute, Ctrl+Z »
// Le nom ouvrirImportChoix est gardé (appelé par le menu ⬇️ de interface.js).
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

// =========================
// IMPORT SESSION — modale plein écran
// =========================
function ouvrirImportSession(fichierInitial) {
  if (typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee()) return;   // 🔒 lecture seule
  const existing = document.getElementById("kta-import-modal");
  if (existing) { existing.remove(); if (!fichierInitial) return; }

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

        <p style="font-size:13px; color:#8892a4; margin:0 0 14px; line-height:1.5;">
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
          <div id="kta-import-apercu" style="background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px; font-size:13px; color:#e8eaf0;"></div>
        </div>

        <div class="kta-aide-section" id="kta-import-warn" style="display:none; border-color:rgba(255,200,100,0.3); background:rgba(255,180,80,0.06);">
          <div style="font-size:13px; color:#ffd28a;">
            ${window.I18n.t("impexp.session.warn")}
          </div>
        </div>

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

  // 🆕 v1.9.3-B1d : ZIP avec photos (session.json + photos/) en plus du JSON pur.
  // _pendingPhotosToRestore stocke les photos extraites du ZIP entre la parse
  // et la validation. Format : [{id, pointId, mime, size, blob, fiche}, ...]
  let _pendingPhotosToRestore = null;
  // 🆕 v1.34.29 — PDF Mode Histoire embarqué dans le ZIP (chemin
  // `mode-histoire/<name>`). Format : { blob, name } ou null si absent.
  let _pendingHistoirePdfToRestore = null;

  function _renderApercu(data) {
    const nbPoints     = (data.editorPoints || []).length;
    const nbMesure     = (data.measure && data.measure.points) ? data.measure.points.length : 0;
    const nbTraces     = (data.roads || []).length;
    const nbZones      = (data.zones || []).length;
    // 🆕 v1.9.3-A1.a-fix5 : structures dans l'aperçu d'import session
    // (sinon KARMA voyait l'import accepté sans confirmation visuelle
    // que les structures étaient bien dans le fichier).
    const nbStructures = (data.structures || []).length;
    // 🆕 v1.9.3-B1d : photos
    const nbPhotos     = (_pendingPhotosToRestore && _pendingPhotosToRestore.length) || 0;
    const photosBadge  = nbPhotos > 0
      ? '<span>' + window.I18n.t("impexp.session.apercuPhotos", { n: nbPhotos }) + '</span>'
      : '';
    // 🆕 v1.21.2 : tracker (path/timeline) si présent dans la session
    const _trk     = data.tracker || null;
    const trkPathN = _trk && Array.isArray(_trk.path) ? _trk.path.length : 0;
    const trkTimeN = _trk && Array.isArray(_trk.timeline) ? _trk.timeline.length : 0;
    const trackerBadge = (trkPathN > 0 || trkTimeN > 0)
      ? '<span>' + window.I18n.t("impexp.session.apercuTracker", { pts: trkPathN, evts: trkTimeN }) + '</span>'
      : '';

    // 🆕 v1.34.29 : Mode Histoire (note libre + PDF de session)
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
    warnEl.style.display = "block";
    btnValider.disabled = false;
  }

  function _parseSessionJson(text) {
    const data = JSON.parse(text);
    if (data.type !== "devmap-session") {
      throw new Error(window.I18n.t("impexp.session.errNotValid"));
    }
    return data;
  }

  // Parse un ZIP de session (v1.9.3-B1d) : extrait session.json + photos/
  // Retourne Promise<data> où data est l'objet session parsé + remplit le
  // tableau _pendingPhotosToRestore en variable de fermeture.
  function _parseSessionZip(file) {
    if (typeof JSZip === "undefined") {
      return Promise.reject(new Error(window.I18n.t("impexp.session.errJszip")));
    }
    return JSZip.loadAsync(file).then(function(zip) {
      const sessionFile = zip.file("session.json");
      if (!sessionFile) throw new Error(window.I18n.t("impexp.session.errZipNoSession"));
      return sessionFile.async("string").then(function(jsonText) {
        const data = _parseSessionJson(jsonText);
        // 🆕 v1.34.29 — Extraction PDF Mode Histoire si présent. Le payload
        // session.json référence le fichier via `historeSessionPdf.file`
        // (ex. "mode-histoire/histoire.pdf"). On stocke le blob en pending
        // pour restauration au moment du clic Valider. Si le fichier référencé
        // est absent dans le ZIP → log warn, on ignore (pas d'erreur fatale).
        // 📄 v1.69.0 — le Mode Histoire accepte N documents : on lit d'abord
        // `historeSessionPdfs` (tableau), et on retombe sur l'ancien champ
        // unique `historeSessionPdf` pour les sessions exportées avant.
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
            // On schedule l'extraction des blobs en parallèle des photos.
            data._pendingHistPromise = Promise.all(_proms).then(function() {
              if (_lus.length > 0) _pendingHistoirePdfToRestore = _lus;
            });
          }
        }

        // Cherche le sous-dossier photos/ + l'index. Si absent → pas de photos.
        const indexFile = zip.file("photos/_index.json");
        if (!indexFile) {
          _pendingPhotosToRestore = [];
          // 🆕 v1.34.29 — Si l'on attend juste le PDF Histoire (pas de photos),
          // on attend sa résolution avant de retourner les données.
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
            // 🆕 v1.34.29 — Attendre le PDF Histoire si en cours (cas où
            // l'index photos existe mais vide, et il n'y a qu'un PDF Histoire).
            // 🆕 v1.34.29 — Attend la promise PDF Mode Histoire si présente
            if (data._pendingHistPromise) {
              return data._pendingHistPromise.then(function() {
                delete data._pendingHistPromise;
                return data;
              });
            }
            return data;
          }
          // Charge chaque blob photo en parallèle
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
                fiche:   info.fiche || null   // 📸 12/10/2026 — absente des anciens ZIP
              };
            });
          });
          return Promise.all(promises).then(function(arr) {
            _pendingPhotosToRestore = arr.filter(function(p) { return p !== null; });
            // 🆕 v1.34.29 — Si une promesse PDF Histoire est en cours, attend-la
            // aussi pour synchroniser le _pendingHistoirePdfToRestore avant de
            // rendre le preview.
            // 🆕 v1.34.29 — Attend la promise PDF Mode Histoire si présente
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
    _pendingHistoirePdfToRestore = null;  // 🆕 v1.34.29

    const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip"
                  || file.type === "application/x-zip-compressed";

    if (isZip) {
      // 🆕 v1.9.3-B1d : ZIP avec photos
      _parseSessionZip(file).then(function(data) {
        dataParsee = data;
        _renderApercu(data);
      }).catch(function(err) {
        console.error("[Import session ZIP] :", err);
        setErr(window.I18n.t("impexp.session.errZipPrefix", { msg: err.message || err }));
        dataParsee = null;
        _pendingPhotosToRestore = null;
        _pendingHistoirePdfToRestore = null;  // 🆕 v1.34.29
        apercuWrap.style.display = "none";
        warnEl.style.display = "none";
        btnValider.disabled = true;
      });
      return;
    }

    // JSON pur (rétrocompat)
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
        warnEl.style.display = "none";
        btnValider.disabled = true;
      }
    };
    reader.readAsText(file);
  }

  // Drop zone
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
    // 🆕 v1.9.3-B1d : accepte aussi les .zip (session avec photos)
    const okExt = f && (/\.(json|zip)$/i).test(f.name);
    if (okExt) chargerFichier(f);
    else if (f && /\.gpx$/i.test(f.name)) { fermer(); window.ouvrirImportFichier(f); }
    else setErr(window.I18n.t("impexp.session.errDropExt"));
  });

  // Boutons
  btnClose.addEventListener("click", fermer);
  btnAnnuler.addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  btnValider.addEventListener("click", function() {
    if (!dataParsee) return;

    // 🆕 v1.9.3-B1d : restauration des photos en IDB AVANT de pousser
    // editorPoints (= avant que la grille puisse interroger IDB).
    // 📸 12/10/2026 — FUSION, plus de purge. Avant : toutes les photos du plan
    // étaient effacées puis remplacées par celles du ZIP — y compris les photos
    // « sans point » gardées pour récupération, sans confirmation (règle
    // produit : une photo n'est jamais effacée sans confirmation). Désormais
    // les photos du fichier s'AJOUTENT ; une photo déjà en base (même id) est
    // gardée telle quelle (`siAbsente` : son rattachement ou sa fiche peuvent
    // être plus récents que l'export) ; rien d'existant n'est supprimé. Une
    // photo dont le point n'est plus dans la session importée apparaît « sans
    // point » dans 📸 Mes photos — exactement comme après la suppression d'un
    // point. → Promise<{ ajoutees, deja, echecs }>.
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
          fiche:   p.fiche   // 📸 fiche du point (facultative, validée par restorePhoto)
        }, { source: "import", siAbsente: true })   // 📣 restauration de l'app (≠ dépôt d'une extension)
          .then(function(id) { if (id) bilan.ajoutees++; else bilan.deja++; })
          .catch(function(e) { bilan.echecs++; console.warn("[Import] photo non restaurée :", p.id, e); });
      });
      return Promise.all(promises).then(function() {
        console.log("[Import] Photos fusionnées :", bilan);
        return bilan;
      });
    }

    // 🚨 B3 (audit ergonomie 13/09/2026) : un import REMPLACE tout (points,
    // tracés, zones, structures, photos AJOUTÉES depuis le 12/10/2026) — sans snapshot,
    // alors que sessionBackups.js listait « import qui écrase » parmi ses
    // déclencheurs et que l'UI le promettait. Snapshot ATTENDU avant tout.
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
        _preparerIdentitesImport(dataParsee);   // 🆔 v2.2.0
        if (window.setEditorPoints)    window.setEditorPoints(dataParsee.editorPoints || []);
        // 🆕 v1.48.0 (KARMA) : restaure la LÉGENDE CUSTOM de la session (labels +
        // entrées custom : zones/tracés/tags/structures inventés par l'user) AVANT
        // les re-renders → les types custom retrouvent label+couleur+icône, même
        // sur un ZIP vierge. Stratégie : REMPLACE l'état légende session (miroir
        // SessionPersist). Rétro-compat : fichiers sans customLegend → null = vide.
        if (window.LegendCustomization && typeof window.LegendCustomization.loadSessionState === "function") {
          window.LegendCustomization.loadSessionState(dataParsee.customLegend || null);
        }
        // 🌀 v1.57.0 : réinjecte les liaisons inter-plan de la session importée
        // dans le registre central (fusion par id — les liaisons déjà connues
        // localement ne sont pas dupliquées). Rétro-compat : champ absent → 0.
        if (window.InterPlanLinks && typeof window.InterPlanLinks.importLinks === "function") {
          window.InterPlanLinks.importLinks(dataParsee.interPlanLinks || []);
        }
        if (window.renderEditorPoints) window.renderEditorPoints();
        if (window.resetMesure)        window.resetMesure();
        if (window.setMeasurePoints) {
          window.setMeasurePoints(dataParsee.measure && dataParsee.measure.points ? dataParsee.measure.points : []);
        }
        // 🆕 v1.12.0-fix : restore aussi le polygone surface si présent
        if (window.setMeasurePointsSurface) {
          window.setMeasurePointsSurface(dataParsee.measureSurface && dataParsee.measureSurface.points ? dataParsee.measureSurface.points : []);
        }
        if (window.resetRoads)         window.resetRoads();
        if (window.setRoads)           window.setRoads(dataParsee.roads || []);
        if (window.resetZones)         window.resetZones();
        if (window.setZones)           window.setZones(dataParsee.zones || []);
        // 🆕 v1.9.3-A1.a : restauration des structures depuis l'import
        // session JSON. Rétrocompat : si l'import est antérieur à v1.9.3,
        // dataParsee.structures sera undefined → array vide via `|| []`.
        if (window.resetStructures)    window.resetStructures();
        if (window.setStructures)      window.setStructures(dataParsee.structures || []);

        // 🔄 Calques en modification : le fichier emporte les objets marqués,
        // pas la liste des calques verrouillés — on la déduit des marques
        // (cf. calqueSession.js > resynchroniser). Sans ça : doublon à l'écran
        // sur un autre appareil, ou calque masqué et vide si la copie manque.
        let _calquesRemis = null;
        if (window.CalqueSession && typeof window.CalqueSession.resynchroniser === "function") {
          try { _calquesRemis = window.CalqueSession.resynchroniser(); }
          catch(e) { console.warn("[Import session] resynchronisation des calques :", e); }
        }

        // 🆕 v1.21.2 : restore timeline + startTs du tracker si présent dans
        // le fichier session. Format : session.tracker = {position, path,
        // timeline, startTs}. On ne restaure QUE la timeline + startTs : le
        // path (polyline) et la position sont des artefacts runtime liés à
        // l'instance de plan courante et n'ont pas vocation à survivre à un
        // import cross-session. Mirroir de SessionPersist (mêmes 2 champs).
        // Compat : si absent → tracker non touché.
        if (dataParsee.tracker && typeof dataParsee.tracker === "object"
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

        // 🆕 v1.34.29 — Restauration Mode Histoire (note libre + PDF session).
        // - noteLibre est inline dans le payload (string) → écrit localStorage.
        // - PDF session a été extrait dans `_pendingHistoirePdfToRestore` au
        //   parse (blob). On délègue à ModeHistoire.importSessionData() pour
        //   centraliser la logique IDB et garantir la cohérence du schéma.
        // Rétrocompat : si dataParsee.noteLibre et historeSessionPdf absents
        // (anciens exports), on ne touche RIEN — la note du plan courant reste.
        // 📄 v1.69.0 : `_pendingHistoirePdfToRestore` est désormais un TABLEAU
        // de documents (il pouvait être un objet unique avant — géré ici pour
        // ne pas dépendre de l'ordre des mises à jour).
        const _noteToImport = (typeof dataParsee.noteLibre === "string") ? dataParsee.noteLibre : null;
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
        _pendingHistoirePdfToRestore = null;  // 🆕 v1.34.29
        fermer();
        if (_snapshotAvantImport && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(window.I18n.t("impexp.session.toastSnapshot"), "info");
        }
        // 📸 Bilan de la fusion des photos (rien d'existant n'a été effacé).
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
        setErr(window.I18n.t("impexp.session.errImport", { msg: err.message || err }));
      }
    }).catch(function(err) {
      console.error("[Import] _restorerPhotos a échoué :", err);
      setErr(window.I18n.t("impexp.session.errPhotos", { msg: err.message || err }));
    });
  });

  if (fichierInitial) chargerFichier(fichierInitial);
}


// ==========================================
// EXPORTS WINDOW (v1.31.0 P3 Lot 5)
// ==========================================
// telechargerSessionJSON, importerSessionJSON, ouvrirImportSession
// étaient référencés depuis interface.js via leur identifier local
// (function declarations top-level). Post-extraction : on les expose
// via window.* pour que interface.js et les autres modules puissent
// continuer à les appeler via window.X.
// ouvrirImportChoix est DÉJÀ posée comme window.ouvrirImportChoix
// dans le bloc lui-même (déclaration window.X = function()...).
window.telechargerSessionJSON = telechargerSessionJSON;
window.importerSessionJSON    = importerSessionJSON;
window.ouvrirImportSession    = ouvrirImportSession;
