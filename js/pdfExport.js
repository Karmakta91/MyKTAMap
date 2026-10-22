/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// EXPORT PDF IMPRIMABLE — A0 à A4, portrait / paysage, calques au choix
// =========================
// Réutilise le canvas de l'export PNG avancé (window.MyKTAMapExporterGenererCanvas, exporter.js) puis le pose
// dans un jsPDF (lib/jspdf.umd.min.js) : en-tête (titre, plan, version, auteur, date, échelle), image
// réduite à la page, légende en OVERLAY dans un coin, ligne de crédit dans la marge basse.
// Expose window.MyKTAMapPdfExport : afficherModale, genererPdf.
// Garde-fou : scripts/check-pdf-texte.js · Doc : docs/architecture/exports.md
// =========================

(function() {
  "use strict";

  const PDF_MARGIN_MM     = 12;
  // 🩸 UTILISÉE plus bas (en-tête) : un nettoyage de code mort qui la retire casse toute génération PDF avec
  // en-tête (« HEADER_HEIGHT_MM is not defined »). Un symbole qui n'apparaît qu'une fois n'est pas forcément mort.
  const HEADER_HEIGHT_MM  = 18;
  // Compromis taille / qualité de l'image dans le PDF.
  const JPEG_QUALITY      = 0.88;

  // Formats (jsPDF accepte un nom ou [w, h] mm). A0/A1 : tirages muraux / traceur.
  // ⚠️ A0 + échelle ×2 = canvas ~30 Mpx → JPEG ~25 Mo, 30-60 s d'encodage sur mobile : ×1 par défaut en A0.
  // `size`/`dims` = données pures ; l'orientation est résolue au rendu (pdfexport.orient.*).
  const FORMATS = {
    "a0-portrait":  { format: "a0", orientation: "portrait",  size: "A0", dims: "841×1189 mm" },
    "a0-landscape": { format: "a0", orientation: "landscape", size: "A0", dims: "1189×841 mm" },
    "a1-portrait":  { format: "a1", orientation: "portrait",  size: "A1", dims: "594×841 mm"  },
    "a1-landscape": { format: "a1", orientation: "landscape", size: "A1", dims: "841×594 mm"  },
    "a2-portrait":  { format: "a2", orientation: "portrait",  size: "A2", dims: "420×594 mm"  },
    "a2-landscape": { format: "a2", orientation: "landscape", size: "A2", dims: "594×420 mm"  },
    "a3-portrait":  { format: "a3", orientation: "portrait",  size: "A3", dims: "297×420 mm"  },
    "a3-landscape": { format: "a3", orientation: "landscape", size: "A3", dims: "420×297 mm"  },
    "a4-portrait":  { format: "a4", orientation: "portrait",  size: "A4", dims: "210×297 mm"  },
    "a4-landscape": { format: "a4", orientation: "landscape", size: "A4", dims: "297×210 mm"  }
  };

  // Tailles et orientations des deux rangées de radios ; libellés résolus au rendu, nom brut ("A0".."A4") en repli.
  const PDF_SIZES = [
    { key: "a0", label: "A0" },
    { key: "a1", label: "A1" },
    { key: "a2", label: "A2" },
    { key: "a3", label: "A3" },
    { key: "a4", label: "A4" }
  ];

  // ── Disponibilité ──
  function _checkJsPDF() {
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      return false;
    }
    return true;
  }


  // ── Styles ──
  // Les `.kta-ses-*` sont injectés par sessionExporter.js à l'ouverture de SA modale : sous-ensemble minimal
  // injecté ici (idempotent) pour une modale PDF ouverte d'abord.
  function _injecterStylesPdf() {
    if (document.getElementById("kta-pdf-styles")) return;
    const style = document.createElement("style");
    style.id = "kta-pdf-styles";
    style.textContent = `
      .kta-pdf-modal-boite .kta-readme-modal-corps { color: var(--kta-texte-2); padding: 18px; overflow-y: auto; }
      .kta-pdf-modal-boite .kta-ses-intro { font-size: 13px; color: var(--kta-texte-2); margin-bottom: 16px; line-height: 1.5; }
      .kta-pdf-modal-boite .kta-ses-section { margin-bottom: 18px; }
      .kta-pdf-modal-boite .kta-ses-section-title { font-size: 12px; font-weight: 600; color: var(--kta-interaction); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
      .kta-pdf-modal-boite .kta-ses-cb-row,
      .kta-pdf-modal-boite .kta-ses-radio-row { display: flex; align-items: center; gap: 10px; padding: 6px 4px; font-size: 13px; color: var(--kta-texte); cursor: pointer; border-radius: 4px; }
      .kta-pdf-modal-boite .kta-ses-cb-row:hover,
      .kta-pdf-modal-boite .kta-ses-radio-row:hover { background: rgba(140,180,255,0.06); }
      .kta-pdf-modal-boite .kta-ses-cb-row input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: #8cb4ff; }
      .kta-pdf-modal-boite .kta-ses-radio-row input[type="radio"] { accent-color: #8cb4ff; }
      .kta-pdf-modal-boite .kta-ses-count { color: var(--kta-texte-3); font-size: 12px; }
      .kta-pdf-modal-boite .kta-conv-erreur { background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.4); border-radius: 6px; padding: 10px; color: var(--kta-erreur); font-size: 13px; margin-top: 10px; }
      .kta-pdf-modal-boite .kta-conv-actions { display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.06); }
      /* Radios compacts en grille (taille + orientation) */
      .kta-pdf-radios-inline { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
      @media (min-width: 700px) { .kta-pdf-radios-inline { grid-template-columns: 1fr 1fr 1fr; } }
      .kta-pdf-radio-inline { margin: 0; }
      .kta-pdf-radio-inline .kta-ses-radio-hint { color: var(--kta-texte-3); font-size: 11px; margin-left: 6px; font-style: italic; }
      /* Sous-blocs calques (image + data layers auto-listés) */
      .kta-pdf-layer-block { margin: 4px 0 0 28px; padding: 6px 10px; background: rgba(140,180,255,0.04); border: 1px solid rgba(140,180,255,0.15); border-radius: 6px; }
      .kta-pdf-cb-sub { margin-left: 0; padding: 4px 0; font-size: 12.5px; }
    `;
    document.head.appendChild(style);
  }

  // ── Modale d'options ──
  function afficherModale() {
    _injecterStylesPdf();

    const existing = document.getElementById("kta-pdf-modal");
    if (existing) { existing.remove(); return; }

    if (!_checkJsPDF()) {
      window.ktaAlerte(window.I18n.t("pdfexport.alert.indispo"), { type: "erreur" });
      return;
    }

    // 🩸 Ces compteurs DÉSACTIVENT la case à zéro (`_cbRow`) : comptés sur la seule session, un plan importé
    // (relevé entièrement dans un calque) ne pourrait exporter aucune annotation.
    const C = window.ktaAnnotationsCompletes || function () { return []; };
    const points     = C("points");
    const roads      = C("roads");
    const zones      = C("zones");
    const structures = C("structures");

    // Calques du plan, listés comme dans l'export PNG avancé.
    const cfg          = window.PLAN_CONFIG || {};
    const imageLayers  = (cfg.imageLayers || []);
    const dataLayers   = (cfg.dataLayers  || []);
    const visibleImg   = _getVisibleImageLayerIds(cfg);
    const visibleData  = _getVisibleDataLayerIds(cfg);

    const modal = document.createElement("div");
    modal.id = "kta-pdf-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";

    const T = window.I18n.t;
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-pdf-modal-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + T("pdfexport.modal.titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-pdf-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +

          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.taille.titre") + '</div>' +
            '<div class="kta-pdf-radios-inline">' +
              PDF_SIZES.map(function(s, i) {
                return _radioRowInline("pdf_size", s.key, s.label, T("pdfexport.taille.hint." + s.key), i === 4 /* A4 par défaut */);
              }).join("") +
            '</div>' +
          '</div>' +

          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.orientation.titre") + '</div>' +
            '<div class="kta-pdf-radios-inline">' +
              _radioRowInline("pdf_orient", "portrait",  T("pdfexport.orientation.portrait"),  "",  false) +
              _radioRowInline("pdf_orient", "landscape", T("pdfexport.orientation.paysage"),   "",  true)  +
            '</div>' +
          '</div>' +

          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.annotations.titre") + '</div>' +
            _cbRow("pdf_inc_points",     T("pdfexport.annotations.points"),     points.length,     true) +
            _cbRow("pdf_inc_roads",      T("pdfexport.annotations.roads"),      roads.length,      true) +
            _cbRow("pdf_inc_zones",      T("pdfexport.annotations.zones"),      zones.length,      true) +
            _cbRow("pdf_inc_structures", T("pdfexport.annotations.structures"), structures.length, true) +
          '</div>' +

          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.image.titre") + '</div>' +
            _cbRow("pdf_inc_baseimage", T("pdfexport.image.base"), null, true) +
            (imageLayers.length === 0
              ? '<p style="font-size:12px; color:var(--kta-texte-3); margin:6px 0 0 28px;">' + T("pdfexport.image.aucun") + '</p>'
              : '<div class="kta-pdf-layer-block">' +
                  imageLayers.map(function(l) {
                    const checked = visibleImg.indexOf(l.id) >= 0;
                    return _cbRowSub("pdf_img_layer_" + _slug(l.id), "🗂️ " + (l.label || l.id), null, checked, l.id);
                  }).join("") +
                '</div>'
            ) +
          '</div>' +

          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.data.titre") + '</div>' +
            (dataLayers.length === 0
              ? '<p style="font-size:12px; color:var(--kta-texte-3); margin:0;">' + T("pdfexport.data.aucun") + '</p>'
              : '<div class="kta-pdf-layer-block">' +
                  dataLayers.map(function(l) {
                    const checked = visibleData.indexOf(l.id) >= 0;
                    const isEditor = l.id === "editor";
                    const label = isEditor
                      ? "✏️ " + (l.label || T("pdfexport.data.mesAnnotations")) + " " + T("pdfexport.data.calqueSessionSuffixe")
                      : "📁 " + (l.label || l.id);
                    return _cbRowSub("pdf_data_layer_" + _slug(l.id), label, null, checked, l.id);
                  }).join("") +
                '</div>'
            ) +
          '</div>' +

          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.miseEnPage.titre") + '</div>' +
            _cbRow("pdf_inc_header", T("pdfexport.miseEnPage.header"), null, true) +
          '</div>' +

          // Légende en overlay dans un coin (comme l'export PNG avancé).
          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.legende.titre") + '</div>' +
            _cbRow("pdf_inc_legende", T("pdfexport.legende.inclure"), null, true) +
            '<div id="pdf_leg_options" style="margin-left:28px; margin-top:6px;">' +
              '<div style="font-size:11px; color:var(--kta-texte-3); margin-bottom:6px;">' + T("pdfexport.legende.position") + '</div>' +
              '<div class="kta-pdf-radios-inline">' +
                _radioRowInline("pdf_leg_pos", "haut-gauche",  T("pdfexport.legende.pos.hg"),   "", false) +
                _radioRowInline("pdf_leg_pos", "haut-droit",   T("pdfexport.legende.pos.hd"),   "", false) +
                _radioRowInline("pdf_leg_pos", "bas-gauche",   T("pdfexport.legende.pos.bg"),   "", true)  +
                _radioRowInline("pdf_leg_pos", "bas-droit",    T("pdfexport.legende.pos.bd"),   "", false) +
              '</div>' +
              '<div style="font-size:11px; color:var(--kta-texte-3); margin:8px 0 6px;">' + T("pdfexport.legende.taille") + '</div>' +
              '<div class="kta-pdf-radios-inline">' +
                _radioRowInline("pdf_leg_size", "compact",  T("pdfexport.legende.taille.compact"),  T("pdfexport.legende.taille.compactHint"), false) +
                _radioRowInline("pdf_leg_size", "standard", T("pdfexport.legende.taille.standard"), T("pdfexport.legende.taille.standardHint"), true)  +
                _radioRowInline("pdf_leg_size", "large",    T("pdfexport.legende.taille.large"),    T("pdfexport.legende.taille.largeHint"), false) +
              '</div>' +
              '<div style="font-size:11px; color:var(--kta-texte-3); margin:8px 0 6px;">' + T("pdfexport.legende.style") + '</div>' +
              '<div class="kta-pdf-radios-inline">' +
                _radioRowInline("pdf_leg_style", "print",     T("pdfexport.legende.style.print"),     "", true) +
                _radioRowInline("pdf_leg_style", "opaque",    T("pdfexport.legende.style.opaque"),    "", false) +
                _radioRowInline("pdf_leg_style", "semi",      T("pdfexport.legende.style.semi"),      "", false) +
                _radioRowInline("pdf_leg_style", "filigrane", T("pdfexport.legende.style.filigrane"), "", false) +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.qualite.titre") + '</div>' +
            _radioRow("pdf_scale", "1",   T("pdfexport.qualite.standard"), true) +
            _radioRow("pdf_scale", "2",   T("pdfexport.qualite.hd"), false) +
            _radioRow("pdf_scale", "0.5", T("pdfexport.qualite.brouillon"), false) +
            '<p style="font-size:11px; color:var(--kta-texte-3); margin:6px 0 0 4px; font-style:italic;">' +
              T("pdfexport.qualite.avertissement") +
            '</p>' +
          '</div>' +

          '<div id="pdf_err" class="kta-conv-erreur" style="display:none;"></div>' +

        '</div>' +
        '<div class="kta-conv-actions" style="padding:14px 24px 18px;">' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-pdf-annuler" type="button">' + T("pdfexport.btn.annuler") + '</button>' +
          '<button class="kta-btn kta-btn-primary" id="kta-pdf-generer" type="button">' + T("pdfexport.btn.generer") + '</button>' +
        '</div>' +
      '</div>';

    document.documentElement.appendChild(modal);

    function _close() {
      try { modal.remove(); } catch(e) {}
      document.removeEventListener("keydown", _onKey);
    }
    function _onKey(e) { if (e.key === "Escape") _close(); }
    document.addEventListener("keydown", _onKey);

    document.getElementById("kta-pdf-close").addEventListener("click", _close);
    document.getElementById("kta-pdf-annuler").addEventListener("click", _close);
    modal.addEventListener("click", function(e) { if (e.target === modal) _close(); });

    document.getElementById("kta-pdf-generer").addEventListener("click", function() {
      const opts = _lireOptionsModale();
      _afficherProgression(modal, window.I18n.t("pdfexport.progression.canvas"));
      // setTimeout : laisser le navigateur peindre la progression.
      setTimeout(async function() {
        try {
          await genererPdf(opts);
          _close();
        } catch (err) {
          console.error("[PdfExport] échec :", err);
          _afficherErreur(modal, err.message || String(err));
        }
      }, 50);
    });
  }

  function _radioRow(name, value, label, checked) {
    return '<label class="kta-ses-radio-row">' +
             '<input type="radio" name="' + name + '" value="' + value + '"' + (checked ? " checked" : "") + '>' +
             '<span>' + label + '</span>' +
           '</label>';
  }

  function _radioRowInline(name, value, label, hint, checked) {
    return '<label class="kta-ses-radio-row kta-pdf-radio-inline">' +
             '<input type="radio" name="' + name + '" value="' + value + '"' + (checked ? " checked" : "") + '>' +
             '<span>' + label +
               (hint ? ' <span class="kta-ses-radio-hint">' + hint + '</span>' : "") +
             '</span>' +
           '</label>';
  }

  function _cbRow(id, label, count, defaultChecked) {
    const dim = (count === 0) ? ' style="opacity:0.5;"' : "";
    const dis = (count === 0) ? " disabled" : "";
    const checked = (count !== 0 && defaultChecked) ? " checked" : "";
    const cnt = (typeof count === "number") ? ' <span class="kta-ses-count">(' + count + ')</span>' : "";
    return '<label class="kta-ses-cb-row"' + dim + '>' +
             '<input type="checkbox" id="' + id + '"' + checked + dis + '>' +
             '<span>' + label + cnt + '</span>' +
           '</label>';
  }

  // Ligne de sous-élément (calque) avec data-layer-id, relue par _lireOptionsModale.
  function _cbRowSub(id, label, count, defaultChecked, layerId) {
    const dim = (count === 0) ? ' style="opacity:0.5;"' : "";
    const dis = (count === 0) ? " disabled" : "";
    const checked = defaultChecked ? " checked" : "";
    const cnt = (typeof count === "number") ? ' <span class="kta-ses-count">(' + count + ')</span>' : "";
    const dataAttr = layerId ? ' data-layer-id="' + _escAttr(layerId) + '"' : "";
    return '<label class="kta-ses-cb-row kta-pdf-cb-sub"' + dim + '>' +
             '<input type="checkbox" id="' + id + '"' + dataAttr + checked + dis + '>' +
             '<span>' + label + cnt + '</span>' +
           '</label>';
  }

  function _escAttr(s) { return window.ktaEsc(s); }

  // id DOM sûr (cohérent avec exporter.js > _slugLayerId).
  function _slug(id) {
    return String(id).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Calques image visibles (comme exporter.js > _getVisibleImageLayerIds, copié pour éviter une dépendance).
  function _getVisibleImageLayerIds(config) {
    const ids = [];
    (config.imageLayers || []).forEach(function(l) {
      if (window.map) {
        let visible = false;
        window.map.eachLayer(function(layer) {
          if (window.L && layer instanceof window.L.ImageOverlay && layer._url === l.file) visible = true;
        });
        if (visible) ids.push(l.id);
      } else if (l.visible) {
        ids.push(l.id);
      }
    });
    return ids;
  }

  function _getVisibleDataLayerIds(config) {
    const ids = [];
    (config.dataLayers || []).forEach(function(l) {
      const lg = window.dataLayerGroups && window.dataLayerGroups[l.id];
      if (lg && window.map && window.map.hasLayer(lg)) ids.push(l.id);
      else if (!lg && l.visible) ids.push(l.id);
    });
    return ids;
  }

  function _lireOptionsModale() {
    const sizeKey   = (document.querySelector('input[name="pdf_size"]:checked')   || {}).value || "a4";
    const orientKey = (document.querySelector('input[name="pdf_orient"]:checked') || {}).value || "landscape";
    const fmtKey    = sizeKey + "-" + orientKey;
    const scaleVal  = parseFloat((document.querySelector('input[name="pdf_scale"]:checked') || {}).value || "1") || 1;

    const imageLayers = {};
    document.querySelectorAll('input[id^="pdf_img_layer_"]').forEach(function(cb) {
      const id = cb.getAttribute("data-layer-id");
      if (id) imageLayers[id] = cb.checked;
    });
    const dataLayers = {};
    document.querySelectorAll('input[id^="pdf_data_layer_"]').forEach(function(cb) {
      const id = cb.getAttribute("data-layer-id");
      if (id) dataLayers[id] = cb.checked;
    });

    const legPosition = (document.querySelector('input[name="pdf_leg_pos"]:checked')   || {}).value || "bas-gauche";
    const legSize     = (document.querySelector('input[name="pdf_leg_size"]:checked')  || {}).value || "standard";
    const legStyle    = (document.querySelector('input[name="pdf_leg_style"]:checked') || {}).value || "print";

    return {
      formatKey:     fmtKey,
      formatDef:     FORMATS[fmtKey] || FORMATS["a4-landscape"],
      scale:         scaleVal,
      incPoints:     _cbVal("pdf_inc_points"),
      incRoads:      _cbVal("pdf_inc_roads"),
      incZones:      _cbVal("pdf_inc_zones"),
      incStructures: _cbVal("pdf_inc_structures"),
      incBaseImage:  _cbVal("pdf_inc_baseimage"),
      imageLayers:   imageLayers,
      dataLayers:    dataLayers,
      incHeader:     _cbVal("pdf_inc_header"),
      incLegende:    _cbVal("pdf_inc_legende"),
      legPosition:   legPosition,   // "haut-gauche"|"haut-droit"|"bas-gauche"|"bas-droit"
      legSize:       legSize,       // "compact"|"standard"|"large"
      legStyle:      legStyle       // "print"|"opaque"|"semi"|"filigrane"
    };
  }

  function _cbVal(id) {
    const el = document.getElementById(id);
    return !!(el && el.checked);
  }

  // Au moins un calque de données (hors editor) coché → la légende montre la section « Icônes ».
  function _aDataLayerCoche(opts, kind) {
    if (!opts.dataLayers) return false;
    const ids = Object.keys(opts.dataLayers);
    return ids.some(function(id) {
      return id !== "editor" && opts.dataLayers[id] === true;
    });
  }

  function _afficherProgression(modal, msg) {
    const corps = modal.querySelector(".kta-readme-modal-corps");
    if (!corps) return;
    corps.innerHTML =
      '<div style="text-align:center; padding:40px 20px;">' +
        '<div style="font-size:42px; margin-bottom:14px;">⏳</div>' +
        '<div style="font-size:15px; color:var(--kta-texte); font-weight:600;">' + msg + '</div>' +
        '<div style="font-size:12.5px; color:var(--kta-texte-3); margin-top:10px;">' + window.I18n.t("pdfexport.progression.patience") + '</div>' +
      '</div>';
  }

  function _afficherErreur(modal, msg) {
    const corps = modal.querySelector(".kta-readme-modal-corps");
    if (!corps) return;
    corps.innerHTML =
      '<div style="padding:20px;">' +
        '<div style="font-size:36px; text-align:center; margin-bottom:10px;">❌</div>' +
        '<div style="background:rgba(255,107,107,0.1); border:1px solid rgba(255,107,107,0.4); border-radius:6px; padding:12px; color:var(--kta-erreur); font-size:13.5px;">' +
          '<strong>' + window.I18n.t("pdfexport.erreur.titre") + '</strong><br>' + _escHtml(msg) +
        '</div>' +
      '</div>';
  }

  function _escHtml(s) { return window.ktaEsc(s); }

  // ── Génération PDF ──
  async function genererPdf(opts) {
    if (!_checkJsPDF()) {
      throw new Error(window.I18n.t("pdfexport.erreur.jspdfManquant"));
    }
    const jsPDF = window.jspdf.jsPDF;

    // 1. Canvas (async : images à charger).
    const canvas = await _genererCanvasPlan(opts);
    if (!canvas) {
      throw new Error(window.I18n.t("pdfexport.erreur.canvasEchec"));
    }
    // Qualité demandée réduite par la limite de canvas de l'appareil (iPhone : 16,7 Mpx) : on dit ce qui sort.
    if (canvas._ktaPlafonne && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(window.I18n.t("pdfexport.plafond", {
        w: canvas.width, h: canvas.height,
        demande: canvas._ktaPlafonne.demande, obtenu: canvas._ktaPlafonne.obtenu
      }), "warn", { important: true });
    }

    // 2. Document PDF
    const def = opts.formatDef;
    const pdf = new jsPDF({
      orientation: def.orientation,
      unit:        "mm",
      format:      def.format,
      compress:    true
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = PDF_MARGIN_MM;
    const headerH = opts.incHeader ? HEADER_HEIGHT_MM : 0;

    // Pas de pied de page : la légende est en overlay, seule une ligne de crédit reste dans la marge.
    const creditH = 5; // mm — hauteur réservée pour le crédit "Généré par MyKTAMap..."

    const imageZoneX = margin;
    const imageZoneY = margin + headerH;
    const imageZoneW = pageW - 2 * margin;
    const imageZoneH = pageH - 2 * margin - headerH - creditH;

    // 3. En-tête
    if (opts.incHeader) {
      _dessinerHeader(pdf, pageW, margin, headerH);
    }

    // 4. Image du plan, réduite pour tenir dans la page
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    const ratioCanvas = canvasW / canvasH;
    const ratioZone   = imageZoneW / imageZoneH;
    let imgW, imgH;
    if (ratioCanvas > ratioZone) {
      imgW = imageZoneW;
      imgH = imgW / ratioCanvas;
    } else {
      imgH = imageZoneH;
      imgW = imgH * ratioCanvas;
    }
    const imgX = imageZoneX + (imageZoneW - imgW) / 2;
    const imgY = imageZoneY + (imageZoneH - imgH) / 2;
    const imgData = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    pdf.addImage(imgData, "JPEG", imgX, imgY, imgW, imgH, undefined, "FAST");

    // 5. Légende : image PNG (helper canvas) posée sur le plan au coin demandé.
    if (opts.incLegende) {
      await _dessinerLegendeOverlay(pdf, opts, imgX, imgY, imgW, imgH);
    }

    // 6. Crédit dans la marge basse
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(7);
    pdf.setTextColor(140, 140, 140);
    const credit = window.I18n.t("pdfexport.credit");
    pdf.text(credit, pageW - margin, pageH - margin / 2, { align: "right" });

    // 7. Enregistrement
    const planName = _planNameSafe();
    const date = _dateString();
    const filename = planName + "_" + date + ".pdf";
    pdf.save(filename);
    console.log("[PdfExport] PDF généré :", filename);
  }

  // ── Canvas du plan (exporter.js) ──
  // Lève une exception explicite si l'API d'exporter.js manque.
  function _genererCanvasPlan(opts) {
    // Annotations au format de exporter.js > _exporterAvance.
    const ann = {
      points:     opts.incPoints,
      roads:      opts.incRoads,
      zones:      opts.incZones,
      structures: opts.incStructures,
      // Tous les sous-types (pas de sous-cases dans la modale PDF).
      pointsTags:      null,  // null = tous
      roadsTypes:      { principal: true, secondaire: true, chemin: true, jonction: true, itinerary: true },
      zonesTypes:      { eau: true, remblais: true, effondrement: true, inaccessible: true },
      structuresTypes: { "pilier-1": true, "pilier-2": true, "mur": true, "front-1": true, "front-2": true },
      levels:          null
    };

    if (typeof window.MyKTAMapExporterGenererCanvas !== "function") {
      throw new Error("exporter.js > MyKTAMapExporterGenererCanvas non disponible. " +
                      "Le module exporter.js doit exposer son canvas pour le PDF.");
    }
    // « Image plan de base » décochée → fond blanc (papier).
    const bg = (opts.incBaseImage === false) ? "white" : "image";
    return window.MyKTAMapExporterGenererCanvas({
      ann:          ann,
      scale:        opts.scale || 1,
      bg:           bg,
      // Calques individuels (une case par calque, comme l'export PNG avancé).
      imageLayers:  opts.imageLayers || {},
      dataLayers:   opts.dataLayers  || {}
    });
  }

  // ── En-tête ──
  function _dessinerHeader(pdf, pageW, margin, headerH) {
    const T = window.I18n.t;
    const pc = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) || {};
    // Nom, version, auteur = saisie libre : ktaTextePdf (utils.js) retire ce que la police ne sait pas écrire.
    const planName = window.ktaTextePdf(pc.name || "") || T("pdfexport.header.planSansNom");
    const planVer  = window.ktaTextePdf(pc.version || "");
    const planAuth = window.ktaTextePdf(pc.author  || "");
    const scale    = (window.APP_CONFIG && window.APP_CONFIG.scale) || null;
    const date     = _dateLisible();

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(20, 20, 20);
    pdf.text(planName, margin, margin + 6);

    // Version + auteur + date + échelle
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    const parts = [];
    if (planVer)  parts.push(T("pdfexport.header.version", { version: planVer }));
    if (planAuth) parts.push(T("pdfexport.header.auteur",  { auteur: planAuth }));
    parts.push(T("pdfexport.header.dateExport", { date: date }));
    if (scale)    parts.push(T("pdfexport.header.echelle", { echelle: scale.toFixed(2) }));
    const subline = parts.join("  ·  ");
    pdf.text(subline, margin, margin + 11);

    pdf.setDrawColor(180, 180, 180);
    pdf.setLineWidth(0.3);
    pdf.line(margin, margin + headerH - 2, pageW - margin, margin + headerH - 2);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(180, 140, 30);
    pdf.text("MyKTAMap", pageW - margin, margin + 6, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 120, 120);
    // Sous-titre kiosque (index.json > config.subtitle) prioritaire sur le slogan i18n.
    const _kioskSt = (window.KIOSK_CONFIG && typeof window.KIOSK_CONFIG.subtitle === "string")
      ? window.KIOSK_CONFIG.subtitle.trim().slice(0, 80) : "";
    pdf.text(_kioskSt || T("pdfexport.header.tagline"), pageW - margin, margin + 10, { align: "right" });
  }

  // ── Légende en overlay, à l'un des 4 coins de la zone du plan ──
  async function _dessinerLegendeOverlay(pdf, opts, planX, planY, planW, planH) {
    if (typeof window.MyKTAMapExporterGenererCanvasLegende !== "function") {
      console.warn("[PdfExport] Helper légende indispo — overlay skip.");
      return;
    }
    let legCanvas;
    try {
      legCanvas = await window.MyKTAMapExporterGenererCanvasLegende({
        contenu: {
          icones:     opts.incPoints || _aDataLayerCoche(opts, "points"),
          traces:     opts.incRoads,
          zones:      opts.incZones,
          structures: opts.incStructures,
          track:      false,
          meta:       false   // déjà dans le header PDF
        },
        size:  opts.legSize  || "standard",
        style: opts.legStyle || "print",
        scale: 2
      });
    } catch(e) {
      console.warn("[PdfExport] Helper légende KO :", e);
      return;
    }
    if (!legCanvas) return; // aucun contenu cochable → silent

    // Largeur cible selon legSize (compact 22 %, standard 28 %, large 35 % du plan) : lisible sans trop masquer.
    const WIDTH_RATIO = { compact: 0.22, standard: 0.28, large: 0.35 };
    const sizeKey = opts.legSize || "standard";
    const wRatio  = WIDTH_RATIO[sizeKey] || 0.28;
    let legWmm = planW * wRatio;
    let legHmm = legWmm * (legCanvas.height / legCanvas.width);

    // Plafond à 70 % de la hauteur du plan (plan très étroit, contenu long) : largeur recalculée en proportion.
    const maxHmm = planH * 0.70;
    if (legHmm > maxHmm) {
      legHmm = maxHmm;
      legWmm = legHmm * (legCanvas.width / legCanvas.height);
    }

    const PAD = 3; // mm

    let legX, legY;
    switch (opts.legPosition) {
      case "haut-gauche":
        legX = planX + PAD;
        legY = planY + PAD;
        break;
      case "haut-droit":
        legX = planX + planW - legWmm - PAD;
        legY = planY + PAD;
        break;
      case "bas-droit":
        legX = planX + planW - legWmm - PAD;
        legY = planY + planH - legHmm - PAD;
        break;
      case "bas-gauche":
      default:
        legX = planX + PAD;
        legY = planY + planH - legHmm - PAD;
        break;
    }

    const dataUrl = legCanvas.toDataURL("image/png");
    pdf.addImage(dataUrl, "PNG", legX, legY, legWmm, legHmm, undefined, "FAST");
  }

  // ── Utilitaires ──
  function _planNameSafe() {
    const pc = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) || {};
    const raw = pc.name || "plan";
    return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function _dateString() {
    const d = new Date();
    return d.getFullYear() + "-" +
           String(d.getMonth() + 1).padStart(2, "0") + "-" +
           String(d.getDate()).padStart(2, "0");
  }

  function _dateLisible() {
    const d = new Date();
    return String(d.getDate()).padStart(2, "0") + "/" +
           String(d.getMonth() + 1).padStart(2, "0") + "/" +
           d.getFullYear() + " " +
           String(d.getHours()).padStart(2, "0") + ":" +
           String(d.getMinutes()).padStart(2, "0");
  }

  // ── Export global ──
  window.MyKTAMapPdfExport = {
    afficherModale: afficherModale,
    genererPdf:     genererPdf
  };

  console.log("[PdfExport] Module chargé (jsPDF dispo : " + _checkJsPDF() + ")");
})();
