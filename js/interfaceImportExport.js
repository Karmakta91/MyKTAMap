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
//        → Modale "choix d'import" (refonte from-scratch v1.14.17) : 3
//          options proposées (JSON session, KMZ, GPX). Délègue au bon
//          importeur selon le choix.
//   - window.ouvrirImportSession()
//        → Modale plein écran d'import session (UI complète avec
//          preview + boutons).
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
    structures:   window.getStructures   ? window.getStructures()   : []
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
  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);

      if (data.type !== "devmap-session") {
        alert("Fichier invalide");
        return;
      }

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

      alert("Import terminé");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'import");
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
window.ouvrirImportGpx = function() {
  const existing = document.getElementById("kta-import-gpx-modal");
  if (existing) { existing.remove(); return; }

  if (!window.GpxIO) {
    alert("Module GPX IO indisponible — rechargement nécessaire");
    return;
  }
  const calibre = window.GpxIO.verifierCalibrage();

  const overlay = document.createElement("div");
  overlay.id = "kta-import-gpx-modal";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:560px; height:auto !important; max-height:90vh !important;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">📤 Importer un fichier GPX</span>' +
        '<button class="kta-panneau-close" id="kta-import-gpx-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        (!calibre ?
          '<div class="kta-aide-section" style="background:rgba(220,50,50,0.10); border-color:rgba(220,50,50,0.30);">' +
            '<p style="color:#b02020; font-weight:600;">⚠️ Ce plan n\'est pas calibré GPS.</p>' +
            '<p>Pour importer un GPX, l\'app a besoin de savoir comment transformer les coordonnées WGS84 (lat/lng) en coordonnées plan locales. Cette transformation est définie par 2 points de calibrage (plan ↔ GPS).</p>' +
            '<p><strong>Comment calibrer</strong> : ferme cette fenêtre → 💾 Enregistrer session → onglet 📡 Export externe → saisis 2 points (x/y plan + GPS lat/lng). Une fois fait, reviens ici pour importer ton GPX.</p>' +
          '</div>'
        :
          '<div class="kta-aide-section">' +
            '<p>L\'import GPX ajoute les <strong>waypoints</strong> (points) et <strong>tracks</strong> (tracés) du fichier aux annotations de session du plan courant.</p>' +
            '<p><strong>Compatibilité</strong> : GPX 1.1 standard (TopoDroid, OsmAnd, Avenza, GPSies, Strava, Garmin, etc.). Les commentaires <code>MyKTAMap level=N</code> sont reconnus pour restaurer le niveau M-LVL si le GPX vient de MyKTAMap.</p>' +
            '<p><strong>Annulable</strong> : si l\'import ne te convient pas après preview, tu peux faire Ctrl+Z (Undo) pour revenir en arrière.</p>' +
          '</div>' +
          '<div class="kta-aide-section">' +
            '<label class="kta-net-paranoia-toggle" style="cursor:pointer;">' +
              '<input type="file" accept=".gpx,application/gpx+xml" id="kta-import-gpx-file" style="display:none;">' +
              '<span style="display:flex; align-items:center; gap:8px;">' +
                '<span style="font-size:22px;">📁</span>' +
                '<span><strong>Sélectionner un fichier .gpx</strong></span>' +
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
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    previewEl.innerHTML = '<p style="color:#8892a4;">⏳ Lecture en cours…</p>';

    window.GpxIO.importer(file, { confirmAdd: false }).then(function(r) {
      if (!r.ok) {
        previewEl.innerHTML = '<div style="background:rgba(220,50,50,0.10); border:1px solid rgba(220,50,50,0.30); padding:10px 14px; border-radius:6px; color:#b02020;"><strong>❌ Erreur :</strong> ' + r.msg + '</div>';
        return;
      }
      _pendingPreview = r;
      let warnHtml = '';
      if (r.preview.outOfBoundsWpt > 0) {
        warnHtml += '<div style="color:#8b4a0c; font-size:12px; margin-top:6px;">⚠️ ' + r.preview.outOfBoundsWpt + ' waypoint(s) sont hors du plan et seront ignorés (peut-être un mauvais calibrage ?)</div>';
      }
      if (r.preview.outOfBoundsTrk > 0) {
        warnHtml += '<div style="color:#8b4a0c; font-size:12px; margin-top:6px;">⚠️ ' + r.preview.outOfBoundsTrk + ' tracé(s) sont hors du plan et seront ignorés</div>';
      }
      previewEl.innerHTML =
        '<div style="background:rgba(244,197,66,0.12); border:1px solid rgba(244,197,66,0.40); padding:12px 14px; border-radius:6px;">' +
          '<div style="font-weight:700; margin-bottom:8px;">📊 Aperçu de l\'import</div>' +
          '<div>📍 <strong>' + r.preview.wpts + '</strong> waypoint(s) à ajouter</div>' +
          '<div>🛣️ <strong>' + r.preview.trks + '</strong> tracé(s) à ajouter</div>' +
          (r.preview.metadata && r.preview.metadata.name ? '<div style="margin-top:6px; font-size:12px; color:#6b6354;">Source : ' + r.preview.metadata.name + '</div>' : '') +
          warnHtml +
        '</div>' +
        '<div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-import-gpx-cancel" type="button">Annuler</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-import-gpx-confirm" type="button" ' +
                  (r.preview.wpts === 0 && r.preview.trks === 0 ? "disabled" : "") + '>Confirmer l\'import</button>' +
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
            "📤 Import GPX OK : " + _pendingPreview._toApply.points.length + " point(s) + " +
            _pendingPreview._toApply.tracks.length + " tracé(s) ajoutés. Ctrl+Z pour annuler.",
            "info"
          );
        }
        overlay.remove();
      });
    });
  });
};

// =========================
// 📥 IMPORT — modale de choix (refonte from-scratch v1.14.17)
// =========================
// KARMA : « le modal ne va pas mieux, reprend depuis 0 sans toute nos
// itérations, et génère-moi un modal qui était historiquement import
// session, à deux choix, comme enregistrer session, ou export image ».
//
// On calque le pattern de la modale « 🖼️ Exporter en PNG/JPG »
// (window.ouvrirExportModal dans js/exporter.js) qui marche parfaitement
// depuis longtemps : deux gros boutons .kta-conv-sens-btn en haut pour
// le choix de mode + 2 sections de contenu togglées par display.
//
// Pas de dépendance sur les styles dynamiques de sessionExporter.js
// (cause des bugs v1.14.5 → v1.14.16). On utilise UNIQUEMENT des classes
// CSS statiques déjà présentes dans css/style.css :
//   - .kta-readme-modal-overlay / -boite / -header / -titre / -corps
//   - .kta-panneau-close (bouton ✕)
//   - .kta-conv-sens-wrap / -btn / -label / -desc (sélecteur de mode)
//   - .kta-aide-section / -section-titre (panneaux de contenu)
//   - .kta-btn / -btn-primary / -btn-ghost (boutons d'action)
window.ouvrirImportChoix = function() {
  // Suppr d'éventuelles modales orphelines avec l'ancien id
  ["kta-import-choix-modal", "kta-import-choix-modal-v2"].forEach(function(id) {
    const old = document.getElementById(id);
    if (old) old.remove();
  });

  let _mode = "session"; // "session" | "gpx"

  const modal = document.createElement("div");
  modal.id = "kta-import-choix-modal-v2";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite" style="max-width:560px; max-height:88vh; height:auto; display:flex; flex-direction:column;">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">📥 Importer un fichier</span>' +
        '<button class="kta-panneau-close" id="kta-imp2-close" type="button" aria-label="Fermer">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps" style="overflow-y:auto;">' +

        // === SÉLECTEUR DE MODE (2 gros boutons côte-à-côte) ===
        '<div class="kta-conv-sens-wrap">' +
          '<button class="kta-conv-sens-btn active" id="kta-imp2-mode-session" type="button">' +
            '<span class="kta-conv-sens-label">📥 Session MyKTAMap</span>' +
            '<span class="kta-conv-sens-desc">.json ou .zip exporté depuis l\'app</span>' +
          '</button>' +
          '<button class="kta-conv-sens-btn" id="kta-imp2-mode-gpx" type="button">' +
            '<span class="kta-conv-sens-label">📤 Fichier GPX externe</span>' +
            '<span class="kta-conv-sens-desc">TopoDroid, OsmAnd, Strava, Garmin…</span>' +
          '</button>' +
        '</div>' +

        // === PANEL SESSION (visible par défaut) ===
        '<div id="kta-imp2-panel-session">' +
          '<div class="kta-aide-section">' +
            '<div class="kta-aide-section-titre">📋 Contenu</div>' +
            '<p style="font-size:13px; color:#c0c8d8; margin:0; line-height:1.7;">' +
              '✓ Fichier <code>session.json</code> ou <code>.zip</code> exporté depuis 💾 Enregistrer session<br>' +
              '✓ Restaure tes <strong>annotations</strong> : points, tracés, zones, structures, mesure en cours<br>' +
              '✓ Si le fichier est un <code>.zip</code> : <strong>photos</strong> rattachées aux points également restaurées<br>' +
              '✓ Choix après preview : remplacer ou fusionner avec ta session actuelle' +
            '</p>' +
          '</div>' +
        '</div>' +

        // === PANEL GPX (masqué par défaut) ===
        '<div id="kta-imp2-panel-gpx" style="display:none;">' +
          '<div class="kta-aide-section">' +
            '<div class="kta-aide-section-titre">📋 Contenu</div>' +
            '<p style="font-size:13px; color:#c0c8d8; margin:0; line-height:1.7;">' +
              '✓ Fichier <code>.gpx</code> standard GPX 1.1 depuis : ' +
              '<strong>TopoDroid, OsmAnd, Avenza, GPSies, Strava, Garmin</strong>…<br>' +
              '✓ Les <strong>waypoints</strong> deviennent des points · les <strong>tracks</strong> deviennent des tracés<br>' +
              '✓ <strong>Calibrage GPS du plan requis</strong> (sinon message d\'erreur t\'invitant à le faire via 📡 Export externe)<br>' +
              '✓ Roundtrip MyKTAMap : si le GPX vient d\'une autre instance MyKTAMap, les niveaux M-LVL sont restaurés' +
            '</p>' +
          '</div>' +
        '</div>' +

      '</div>' +

      // === ACTIONS (footer fixe) ===
      '<div style="display:flex; justify-content:flex-end; gap:10px; padding:14px 18px; border-top:1px solid rgba(255,255,255,0.06);">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-imp2-cancel" type="button">Annuler</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-imp2-ok"     type="button">📂 Choisir un fichier</button>' +
      '</div>' +
    '</div>';

  document.documentElement.appendChild(modal);

  function _setMode(nouveau) {
    _mode = nouveau;
    document.getElementById("kta-imp2-mode-session").classList.toggle("active", nouveau === "session");
    document.getElementById("kta-imp2-mode-gpx").classList.toggle("active",     nouveau === "gpx");
    document.getElementById("kta-imp2-panel-session").style.display = (nouveau === "session") ? "block" : "none";
    document.getElementById("kta-imp2-panel-gpx").style.display     = (nouveau === "gpx")     ? "block" : "none";
  }

  function _fermer() {
    modal.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) {
    if (e.key === "Escape") _fermer();
    else if (e.key === "Enter") _valider();
  }
  function _valider() {
    const choix = _mode;
    _fermer();
    if (choix === "session") {
      ouvrirImportSession();
    } else {
      if (typeof window.ouvrirImportGpx === "function") window.ouvrirImportGpx();
      else alert("Module import GPX indisponible");
    }
  }

  document.getElementById("kta-imp2-close").addEventListener("click",  _fermer);
  document.getElementById("kta-imp2-cancel").addEventListener("click", _fermer);
  document.getElementById("kta-imp2-ok").addEventListener("click",     _valider);
  document.getElementById("kta-imp2-mode-session").addEventListener("click", function() { _setMode("session"); });
  document.getElementById("kta-imp2-mode-gpx").addEventListener("click",     function() { _setMode("gpx"); });
  modal.addEventListener("click", function(e) { if (e.target === modal) _fermer(); });
  document.addEventListener("keydown", _onKey);
};

// =========================
// IMPORT SESSION — modale plein écran
// =========================
function ouvrirImportSession() {
  const existing = document.getElementById("kta-import-modal");
  if (existing) { existing.remove(); return; }

  const modal = document.createElement("div");
  modal.id = "kta-import-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML = `
    <div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:90vh;">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">📥 Importer une session</span>
        <button class="kta-panneau-close" id="kta-import-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps">

        <p style="font-size:13px; color:#8892a4; margin:0 0 14px; line-height:1.5;">
          Charge un fichier <code>session.json</code> exporté depuis l'application,
          ou un <code>.zip</code> de session avec photos (depuis v1.9.3).
          Contient tes points ajoutés, tes tracés, tes zones, tes structures, ta
          mesure en cours et ses photos rattachées.
        </p>

        <div class="kta-conv-champ">
          <label class="kta-conv-label">Fichier session</label>
          <div class="kta-conv-drop" id="kta-import-drop">
            <span id="kta-import-drop-label">📂 Cliquer ou glisser un fichier .json ou .zip</span>
            <input type="file" id="kta-import-file" accept=".json,.zip,application/json,application/zip" style="display:none">
          </div>
        </div>

        <div id="kta-import-apercu-wrap" class="kta-conv-champ" style="display:none;">
          <label class="kta-conv-label">Aperçu</label>
          <div id="kta-import-apercu" style="background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px; font-size:13px; color:#e8eaf0;"></div>
        </div>

        <div class="kta-aide-section" id="kta-import-warn" style="display:none; border-color:rgba(255,200,100,0.3); background:rgba(255,180,80,0.06);">
          <div style="font-size:13px; color:#ffd28a;">
            ⚠️ <strong>Attention</strong> — l'import remplacera tes points, tracés et mesure actuels.
            Pense à exporter ta session en cours avant si tu veux la conserver.
          </div>
        </div>

        <div id="kta-import-erreur" class="kta-conv-erreur" style="display:none;"></div>

        <div class="kta-conv-actions" style="margin-top:14px;">
          <button class="kta-btn kta-btn-ghost"   id="kta-import-annuler">Annuler</button>
          <button class="kta-btn kta-btn-primary"  id="kta-import-valider" disabled>Importer</button>
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
  // et la validation. Format : [{id, pointId, mime, size, blob}, ...]
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
      ? '<span><strong style="color:#f4c542;">📸 ' + nbPhotos + '</strong> photo' + (nbPhotos > 1 ? "s" : "") + '</span>'
      : '';
    // 🆕 v1.21.2 : tracker (path/timeline) si présent dans la session
    const _trk     = data.tracker || null;
    const trkPathN = _trk && Array.isArray(_trk.path) ? _trk.path.length : 0;
    const trkTimeN = _trk && Array.isArray(_trk.timeline) ? _trk.timeline.length : 0;
    const trackerBadge = (trkPathN > 0 || trkTimeN > 0)
      ? '<span><strong style="color:#7fd1a2;">📡 tracker</strong> (' + trkPathN + ' pt, ' + trkTimeN + ' évt)</span>'
      : '';

    // 🆕 v1.34.29 : Mode Histoire (note libre + PDF de session)
    const hasNoteLibre = typeof data.noteLibre === "string" && data.noteLibre.length > 0;
    const hasHistPdf   = !!(_pendingHistoirePdfToRestore && _pendingHistoirePdfToRestore.blob);
    let histoireBadge = "";
    if (hasNoteLibre || hasHistPdf) {
      const parts = [];
      if (hasNoteLibre) parts.push("note libre");
      if (hasHistPdf)   parts.push("PDF");
      histoireBadge = '<span><strong style="color:#d4a3ff;">📖 Histoire</strong> (' + parts.join(" + ") + ')</span>';
    }


    apercuEl.innerHTML = `
      <div style="display:flex; gap:14px; flex-wrap:wrap;">
        <span><strong style="color:#8cb4ff;">${nbPoints}</strong> point(s) ajouté(s)</span>
        <span><strong style="color:#8cb4ff;">${nbTraces}</strong> tracé(s)</span>
        <span><strong style="color:#8cb4ff;">${nbZones}</strong> zone(s)</span>
        <span><strong style="color:#8cb4ff;">${nbStructures}</strong> structure(s)</span>
        <span><strong style="color:#8cb4ff;">${nbMesure}</strong> point(s) de mesure</span>
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
      throw new Error("Le fichier n'est pas une session devmap-session valide.");
    }
    return data;
  }

  // Parse un ZIP de session (v1.9.3-B1d) : extrait session.json + photos/
  // Retourne Promise<data> où data est l'objet session parsé + remplit le
  // tableau _pendingPhotosToRestore en variable de fermeture.
  function _parseSessionZip(file) {
    if (typeof JSZip === "undefined") {
      return Promise.reject(new Error("JSZip non chargé (ZIP impossible)"));
    }
    return JSZip.loadAsync(file).then(function(zip) {
      const sessionFile = zip.file("session.json");
      if (!sessionFile) throw new Error("ZIP invalide : session.json manquant à la racine.");
      return sessionFile.async("string").then(function(jsonText) {
        const data = _parseSessionJson(jsonText);
        // 🆕 v1.34.29 — Extraction PDF Mode Histoire si présent. Le payload
        // session.json référence le fichier via `historeSessionPdf.file`
        // (ex. "mode-histoire/histoire.pdf"). On stocke le blob en pending
        // pour restauration au moment du clic Valider. Si le fichier référencé
        // est absent dans le ZIP → log warn, on ignore (pas d'erreur fatale).
        _pendingHistoirePdfToRestore = null;
        if (data && data.historeSessionPdf && data.historeSessionPdf.file) {
          const histFile = zip.file(data.historeSessionPdf.file);
          if (histFile) {
            // On schedule l'extraction blob en parallèle des photos.
            // (Géré comme une Promise dans le pipeline ci-dessous.)
            data._pendingHistPromise = histFile.async("blob").then(function(blob) {
              _pendingHistoirePdfToRestore = {
                blob: blob,
                name: data.historeSessionPdf.name || "histoire.pdf"
              };
            });
          } else {
            console.warn("[Import session ZIP] PDF Histoire référencé mais absent :",
                         data.historeSessionPdf.file);
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
          catch(e) { throw new Error("photos/_index.json corrompu : " + e.message); }
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
                blob:    blob
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
    dropLabel.textContent = "✅ " + file.name;
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
        setErr("❌ ZIP invalide : " + (err.message || err));
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
        setErr("❌ " + err.message);
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
    else setErr("Le fichier doit être un .json ou .zip (session)");
  });

  // Boutons
  btnClose.addEventListener("click", fermer);
  btnAnnuler.addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  btnValider.addEventListener("click", function() {
    if (!dataParsee) return;

    // 🆕 v1.9.3-B1d : restauration des photos en IDB AVANT de pousser
    // editorPoints (= avant que la grille puisse interroger IDB).
    // Stratégie : on purge TOUTES les photos du plan courant en IDB,
    // puis on injecte celles du ZIP. C'est le comportement attendu
    // (= un import est un remplacement, pas un merge — cohérent avec
    // points/roads/zones qui sont aussi reset+set).
    function _restorerPhotos() {
      if (!_pendingPhotosToRestore || _pendingPhotosToRestore.length === 0) {
        return Promise.resolve(0);
      }
      if (!window.MyKTAMapPhotos) {
        console.warn("[Import] MyKTAMapPhotos indispo — photos ignorées");
        return Promise.resolve(0);
      }
      const planId = window._currentLoadedPlanId || "default";
      return window.MyKTAMapPhotos.deletePhotosForPlan(planId).then(function() {
        const promises = _pendingPhotosToRestore.map(function(p) {
          return window.MyKTAMapPhotos.restorePhoto({
            id:      p.id,
            planId:  planId,
            pointId: String(p.pointId),
            blob:    p.blob,
            mime:    p.mime,
            size:    p.size
          });
        });
        return Promise.all(promises).then(function() {
          console.log("[Import] Photos restaurées :", _pendingPhotosToRestore.length);
          return _pendingPhotosToRestore.length;
        });
      });
    }

    _restorerPhotos().then(function() {
      try {
        if (window.setEditorPoints)    window.setEditorPoints(dataParsee.editorPoints || []);
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
        const _noteToImport = (typeof dataParsee.noteLibre === "string") ? dataParsee.noteLibre : null;
        const _pdfBlob = _pendingHistoirePdfToRestore && _pendingHistoirePdfToRestore.blob || null;
        const _pdfName = _pendingHistoirePdfToRestore && _pendingHistoirePdfToRestore.name || null;
        if ((_noteToImport && _noteToImport.length > 0) || _pdfBlob) {
          if (window.ModeHistoire && typeof window.ModeHistoire.importSessionData === "function") {
            window.ModeHistoire.importSessionData(_noteToImport, _pdfBlob, _pdfName)
              .then(function(ok) {
                console.log("[Import session] Mode Histoire restauré :",
                            { note: !!_noteToImport, pdf: !!_pdfBlob, ok: ok });
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
      } catch(err) {
        console.error(err);
        setErr("Erreur lors de l'import : " + (err.message || err));
      }
    }).catch(function(err) {
      console.error("[Import] _restorerPhotos a échoué :", err);
      setErr("Erreur lors de la restauration des photos : " + (err.message || err));
    });
  });
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
