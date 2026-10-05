/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 📤 EXPORT PDF IMPRIMABLE — v1.10.3 (v2 : A0→A4 + calques granulaires)
// =========================
// Exporte le plan en PDF imprimable A0/A1/A2/A3/A4 portrait/paysage.
// Réutilise la chaîne `exporter.js > _genererCanvasExport` (= même canvas
// que l'export PNG avancé) pour cohérence visuelle, puis pose le canvas
// dans un jsPDF avec :
//   - Header : titre + nom plan + version + auteur + date + échelle
//   - Image plan downscalée pour rentrer dans la page
//   - Footer : légende compacte (catégories incluses)
//
// Lib : jsPDF v2.5+ (UMD) chargée depuis lib/jspdf.umd.min.js. Si non
// disponible, message d'erreur clair.
//
// API publique :
//   window.MyKTAMapPdfExport = {
//     afficherModale, genererPdf
//   };
// =========================

(function() {
  "use strict";

  // Marges PDF en mm
  const PDF_MARGIN_MM     = 12;
  // 🩸 RESTAUREE le 03/09/2026 — supprimee A TORT par le nettoyage de code mort
  // du 09/08 (commit 9834504) alors qu elle est UTILISEE l.517. Consequence :
  // toute generation PDF avec en-tete echouait sur
  // « HEADER_HEIGHT_MM is not defined », et ce depuis pres d un mois - le smoke
  // ne genere pas de PDF, aucun des 18 garde-fous ne lisait les identifiants.
  // C est exactement le risque que documente docs/BACKLOG.md > « Lecon du faux
  // fix » : un symbole qui n apparait qu une fois passe pour mort.
  const HEADER_HEIGHT_MM  = 18;
  // JPEG quality du canvas → image PDF (compromis taille / qualité)
  const JPEG_QUALITY      = 0.88;

  // Formats supportés (jsPDF accepte format string ou [w, h] mm).
  // Étendu A0 → A4 (v1.10.3-pdf-v2). A0/A1 = formats grand plan d'impression
  // pro / plotter, utile pour cartes murales.
  // ⚠️ A0 + scale ×2 = canvas ~30 Mpx → JPEG ~25 Mo → durée d'encodage 30-60 s
  // sur mobile. Limite raisonnable côté UI : scale ×1 par défaut pour A0.
  // `size`/`dims` = données pures (non traduisibles). L'orientation ("portrait"/
  // "paysage") est le SEUL fragment FR : on ne la fige plus dans `label`, on la
  // résout au rendu (clés pdfexport.orient.*).
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

  // Tailles disponibles (pour le 1er radio "taille") et orientations (2e radio).
  // label/hint résolus au rendu via I18n (cf. afficherModale). On conserve un
  // libellé brut (= la clé courte non traduisible "A0".."A4") en fallback.
  const PDF_SIZES = [
    { key: "a0", label: "A0" },
    { key: "a1", label: "A1" },
    { key: "a2", label: "A2" },
    { key: "a3", label: "A3" },
    { key: "a4", label: "A4" }
  ];

  // ============================================================
  // CHECK DISPONIBILITÉ
  // ============================================================
  function _checkJsPDF() {
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      return false;
    }
    return true;
  }


  // ============================================================
  // STYLES — réutilise le subset kta-ses-* de sessionExporter
  // ============================================================
  // sessionExporter.js définit les styles `.kta-ses-*` mais via injection
  // à l'ouverture de SA modale. Si l'user ouvre la modale PDF sans avoir
  // encore ouvert la modale session, les styles n'existent pas.
  // On injecte un subset minimal idempotent au premier appel.
  function _injecterStylesPdf() {
    if (document.getElementById("kta-pdf-styles")) return;
    const style = document.createElement("style");
    style.id = "kta-pdf-styles";
    style.textContent = `
      .kta-pdf-modal-boite .kta-readme-modal-corps { color: #c8d0e0; padding: 18px; overflow-y: auto; }
      .kta-pdf-modal-boite .kta-ses-intro { font-size: 13px; color: #c0c8d8; margin-bottom: 16px; line-height: 1.5; }
      .kta-pdf-modal-boite .kta-ses-section { margin-bottom: 18px; }
      .kta-pdf-modal-boite .kta-ses-section-title { font-size: 12px; font-weight: 600; color: #8cb4ff; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
      .kta-pdf-modal-boite .kta-ses-cb-row,
      .kta-pdf-modal-boite .kta-ses-radio-row { display: flex; align-items: center; gap: 10px; padding: 6px 4px; font-size: 13px; color: #e8eaf0; cursor: pointer; border-radius: 4px; }
      .kta-pdf-modal-boite .kta-ses-cb-row:hover,
      .kta-pdf-modal-boite .kta-ses-radio-row:hover { background: rgba(140,180,255,0.06); }
      .kta-pdf-modal-boite .kta-ses-cb-row input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: #8cb4ff; }
      .kta-pdf-modal-boite .kta-ses-radio-row input[type="radio"] { accent-color: #8cb4ff; }
      .kta-pdf-modal-boite .kta-ses-count { color: #8892a4; font-size: 12px; }
      .kta-pdf-modal-boite .kta-conv-erreur { background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.4); border-radius: 6px; padding: 10px; color: #ff8c8c; font-size: 13px; margin-top: 10px; }
      .kta-pdf-modal-boite .kta-conv-actions { display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.06); }
      /* Radios compacts en grille (taille + orientation) */
      .kta-pdf-radios-inline { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
      @media (min-width: 700px) { .kta-pdf-radios-inline { grid-template-columns: 1fr 1fr 1fr; } }
      .kta-pdf-radio-inline { margin: 0; }
      .kta-pdf-radio-inline .kta-ses-radio-hint { color: #8892a4; font-size: 11px; margin-left: 6px; font-style: italic; }
      /* Sous-blocs calques (image + data layers auto-listés) */
      .kta-pdf-layer-block { margin: 4px 0 0 28px; padding: 6px 10px; background: rgba(140,180,255,0.04); border: 1px solid rgba(140,180,255,0.15); border-radius: 6px; }
      .kta-pdf-cb-sub { margin-left: 0; padding: 4px 0; font-size: 12.5px; }
    `;
    document.head.appendChild(style);
  }

  // ============================================================
  // MODALE OPTIONS
  // ============================================================
  function afficherModale() {
    _injecterStylesPdf();

    const existing = document.getElementById("kta-pdf-modal");
    if (existing) { existing.remove(); return; }

    if (!_checkJsPDF()) {
      alert(window.I18n.t("pdfexport.alert.indispo"));
      return;
    }

    // 🩸 v1.82.0 — CES COMPTEURS NE SONT PAS DÉCORATIFS : `_cbRow` DÉSACTIVE
    // la case quand ils valent zéro. Comptés sur la seule session, ils mettaient
    // donc l'export PDF d'un plan importé — dont tout le relevé vit dans un
    // calque de données — dans l'impossibilité de sortir la moindre annotation.
    // « L'export PDF n'exporte rien », signalé par KARMA : diagnostic exact.
    const C = window.ktaAnnotationsCompletes || function () { return []; };
    const points     = C("points");
    const roads      = C("roads");
    const zones      = C("zones");
    const structures = C("structures");

    // Calques du plan (auto-listés comme dans l'export PNG avancé)
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

          '<p class="kta-ses-intro">' +
            T("pdfexport.intro") +
          '</p>' +

          // 📐 Format de page — 2 lignes : taille + orientation
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

          // 📦 Annotations de session (cohérent avec export PNG avancé)
          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.annotations.titre") + '</div>' +
            _cbRow("pdf_inc_points",     T("pdfexport.annotations.points"),     points.length,     true) +
            _cbRow("pdf_inc_roads",      T("pdfexport.annotations.roads"),      roads.length,      true) +
            _cbRow("pdf_inc_zones",      T("pdfexport.annotations.zones"),      zones.length,      true) +
            _cbRow("pdf_inc_structures", T("pdfexport.annotations.structures"), structures.length, true) +
          '</div>' +

          // 🖼️ Image de base + Calques image (auto-listés depuis plan-config)
          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.image.titre") + '</div>' +
            _cbRow("pdf_inc_baseimage", T("pdfexport.image.base"), null, true) +
            (imageLayers.length === 0
              ? '<p style="font-size:12px; color:#8892a4; margin:6px 0 0 28px;">' + T("pdfexport.image.aucun") + '</p>'
              : '<div class="kta-pdf-layer-block">' +
                  imageLayers.map(function(l) {
                    const checked = visibleImg.indexOf(l.id) >= 0;
                    return _cbRowSub("pdf_img_layer_" + _slug(l.id), "🗂️ " + (l.label || l.id), null, checked, l.id);
                  }).join("") +
                '</div>'
            ) +
          '</div>' +

          // 📊 Calques de données (puits, vehicules, etc. — auto-listés)
          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.data.titre") + '</div>' +
            (dataLayers.length === 0
              ? '<p style="font-size:12px; color:#8892a4; margin:0;">' + T("pdfexport.data.aucun") + '</p>'
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

          // 🎨 Mise en page
          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.miseEnPage.titre") + '</div>' +
            _cbRow("pdf_inc_header", T("pdfexport.miseEnPage.header"), null, true) +
          '</div>' +

          // 🗺️ Légende — overlay 4-coins inspiré de l'export PNG avancé
          // (KARMA v3.1 "inclus la légende différemment, trop intrusif").
          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.legende.titre") + '</div>' +
            _cbRow("pdf_inc_legende", T("pdfexport.legende.inclure"), null, true) +
            '<div id="pdf_leg_options" style="margin-left:28px; margin-top:6px;">' +
              '<div style="font-size:11px; color:#8892a4; margin-bottom:6px;">' + T("pdfexport.legende.position") + '</div>' +
              '<div class="kta-pdf-radios-inline">' +
                _radioRowInline("pdf_leg_pos", "haut-gauche",  T("pdfexport.legende.pos.hg"),   "", false) +
                _radioRowInline("pdf_leg_pos", "haut-droit",   T("pdfexport.legende.pos.hd"),   "", false) +
                _radioRowInline("pdf_leg_pos", "bas-gauche",   T("pdfexport.legende.pos.bg"),   "", true)  +
                _radioRowInline("pdf_leg_pos", "bas-droit",    T("pdfexport.legende.pos.bd"),   "", false) +
              '</div>' +
              '<div style="font-size:11px; color:#8892a4; margin:8px 0 6px;">' + T("pdfexport.legende.taille") + '</div>' +
              '<div class="kta-pdf-radios-inline">' +
                _radioRowInline("pdf_leg_size", "compact",  T("pdfexport.legende.taille.compact"),  T("pdfexport.legende.taille.compactHint"), false) +
                _radioRowInline("pdf_leg_size", "standard", T("pdfexport.legende.taille.standard"), T("pdfexport.legende.taille.standardHint"), true)  +
                _radioRowInline("pdf_leg_size", "large",    T("pdfexport.legende.taille.large"),    T("pdfexport.legende.taille.largeHint"), false) +
              '</div>' +
              '<div style="font-size:11px; color:#8892a4; margin:8px 0 6px;">' + T("pdfexport.legende.style") + '</div>' +
              '<div class="kta-pdf-radios-inline">' +
                _radioRowInline("pdf_leg_style", "print",     T("pdfexport.legende.style.print"),     "", true) +
                _radioRowInline("pdf_leg_style", "opaque",    T("pdfexport.legende.style.opaque"),    "", false) +
                _radioRowInline("pdf_leg_style", "semi",      T("pdfexport.legende.style.semi"),      "", false) +
                _radioRowInline("pdf_leg_style", "filigrane", T("pdfexport.legende.style.filigrane"), "", false) +
              '</div>' +
            '</div>' +
          '</div>' +

          // 📏 Qualité — recommandation par taille
          '<div class="kta-ses-section">' +
            '<div class="kta-ses-section-title">' + T("pdfexport.qualite.titre") + '</div>' +
            _radioRow("pdf_scale", "1",   T("pdfexport.qualite.standard"), true) +
            _radioRow("pdf_scale", "2",   T("pdfexport.qualite.hd"), false) +
            _radioRow("pdf_scale", "0.5", T("pdfexport.qualite.brouillon"), false) +
            '<p style="font-size:11px; color:#8892a4; margin:6px 0 0 4px; font-style:italic;">' +
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
      // setTimeout pour laisser le browser repeindre la modale progression
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

  // Radio compact en ligne (pour grilles taille/orientation)
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

  // Checkbox row pour un sous-élément (calque) — porte un data-layer-id
  // pour récupération en boucle dans _lireOptionsModale.
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

  function _escAttr(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  // Slugify d'un id de calque pour un id DOM safe (cohérent avec exporter.js > _slugLayerId)
  function _slug(id) {
    return String(id).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Liste des calques image visibles actuellement sur la carte (cohérent
  // avec exporter.js > _getVisibleImageLayerIds — duplique pour éviter
  // une dép cross-module).
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

    // Collecte des calques cochés (auto-listés depuis plan-config)
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

    // Légende — options regroupées (v3.1)
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
      // 🆕 v3.1 (KARMA "légende en coin comme export PNG") : nouvelles
      // options légende — désormais overlay sur le plan, plus footer dédié.
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

  // Renvoie true si au moins un data layer du plan (autre qu'editor) est
  // coché dans la modale PDF. Utilisé pour décider si la légende doit
  // afficher la section "Icônes" (un data layer = sûrement des points
  // avec leurs tags + icônes).
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
        '<div style="font-size:15px; color:#e8eaf0; font-weight:600;">' + msg + '</div>' +
        '<div style="font-size:12.5px; color:#8892a4; margin-top:10px;">' + window.I18n.t("pdfexport.progression.patience") + '</div>' +
      '</div>';
  }

  function _afficherErreur(modal, msg) {
    const corps = modal.querySelector(".kta-readme-modal-corps");
    if (!corps) return;
    corps.innerHTML =
      '<div style="padding:20px;">' +
        '<div style="font-size:36px; text-align:center; margin-bottom:10px;">❌</div>' +
        '<div style="background:rgba(255,107,107,0.1); border:1px solid rgba(255,107,107,0.4); border-radius:6px; padding:12px; color:#ff8c8c; font-size:13.5px;">' +
          '<strong>' + window.I18n.t("pdfexport.erreur.titre") + '</strong><br>' + _escHtml(msg) +
        '</div>' +
      '</div>';
  }

  function _escHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  // ============================================================
  // GÉNÉRATION PDF
  // ============================================================
  async function genererPdf(opts) {
    if (!_checkJsPDF()) {
      throw new Error(window.I18n.t("pdfexport.erreur.jspdfManquant"));
    }
    const jsPDF = window.jspdf.jsPDF;

    // Étape 1 : générer le canvas via la chaîne export PNG avancé.
    // _genererCanvasPlan retourne une Promise<Canvas> car
    // window.MyKTAMapExporterGenererCanvas est async (charge images, etc.).
    const canvas = await _genererCanvasPlan(opts);
    if (!canvas) {
      throw new Error(window.I18n.t("pdfexport.erreur.canvasEchec"));
    }

    // Étape 2 : créer le doc PDF
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

    // 🆕 v3.1 (KARMA) : plus de footer dédié — la légende devient un
    // overlay positionné dans un coin de la zone plan (comme export PNG).
    // On garde juste une mini-ligne de crédit en bas dans la marge.
    const creditH = 5; // mm — hauteur réservée pour le crédit "Généré par MyKTAMap..."

    // Zone disponible pour l'image — gagne toute la hauteur du footer
    const imageZoneX = margin;
    const imageZoneY = margin + headerH;
    const imageZoneW = pageW - 2 * margin;
    const imageZoneH = pageH - 2 * margin - headerH - creditH;

    // Étape 3 : header
    if (opts.incHeader) {
      _dessinerHeader(pdf, pageW, margin, headerH);
    }

    // Étape 4 : image plan (downscale auto pour rentrer)
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
    // Centre dans la zone
    const imgX = imageZoneX + (imageZoneW - imgW) / 2;
    const imgY = imageZoneY + (imageZoneH - imgH) / 2;
    const imgData = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    pdf.addImage(imgData, "JPEG", imgX, imgY, imgW, imgH, undefined, "FAST");

    // Étape 5 : légende — overlay 4-coins sur la zone du plan
    // 🆕 v3.1 (KARMA "ajoute l'option export PNG : choisir où, OU dans un
    // coin") : la légende n'est plus en footer dédié, elle est rendue en
    // image PNG via le helper canvas et posée par-dessus le plan au coin
    // demandé. Cohérent avec le rendu en overlay de l'export PNG.
    if (opts.incLegende) {
      await _dessinerLegendeOverlay(pdf, opts, imgX, imgY, imgW, imgH);
    }

    // Étape 6 : crédit MyKTAMap (1 ligne discrète dans la marge basse)
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(7);
    pdf.setTextColor(140, 140, 140);
    const credit = window.I18n.t("pdfexport.credit");
    pdf.text(credit, pageW - margin, pageH - margin / 2, { align: "right" });

    // Étape 7 : save
    const planName = _planNameSafe();
    const date = _dateString();
    const filename = planName + "_" + date + ".pdf";
    pdf.save(filename);
    console.log("[PdfExport] PDF généré :", filename);
  }

  // ============================================================
  // GÉNÉRER CANVAS PLAN — réutilise exporter.js
  // ============================================================
  // exporter.js expose un helper `_genererCanvasExport(opts)` via le mode
  // Avancé. On l'appelle avec les options adaptées (catégories, scale, etc.).
  // Si l'API a changé / pas exposée, on retombe sur une exception explicite.
  function _genererCanvasPlan(opts) {
    // Construit les annotations (ann) compatibles avec _genererCanvasExport
    // de exporter.js. Format inspiré de exporter.js > _exporterAvance.
    const ann = {
      points:     opts.incPoints,
      roads:      opts.incRoads,
      zones:      opts.incZones,
      structures: opts.incStructures,
      // Sous-types : on inclut tous (l'user filtre via la modale globale,
      // pas via les sous-cases ici pour simplifier la modale PDF).
      pointsTags:      null,  // null = tous
      roadsTypes:      { principal: true, secondaire: true, chemin: true, jonction: true, itinerary: true },
      zonesTypes:      { eau: true, remblais: true, effondrement: true, inaccessible: true },
      structuresTypes: { "pilier-1": true, "pilier-2": true, "mur": true, "front-1": true, "front-2": true },
      // Multi-niveau : tous les niveaux disponibles
      levels:          null
    };

    // Appelle le helper public exposé par exporter.js (sinon throw)
    if (typeof window.MyKTAMapExporterGenererCanvas !== "function") {
      throw new Error("exporter.js > MyKTAMapExporterGenererCanvas non disponible. " +
                      "Le module exporter.js doit exposer son canvas pour le PDF.");
    }
    // Si l'user décoche "Image plan de base" → bg blanc (papier).
    const bg = (opts.incBaseImage === false) ? "white" : "image";
    return window.MyKTAMapExporterGenererCanvas({
      ann:          ann,
      scale:        opts.scale || 1,
      bg:           bg,
      // ✅ NEW v2 : passe les calques individuels au lieu d'un booléen global.
      // Cohérent avec ce que produit l'export PNG avancé (checkbox par calque).
      imageLayers:  opts.imageLayers || {},
      dataLayers:   opts.dataLayers  || {}
    });
  }

  // ============================================================
  // HEADER
  // ============================================================
  function _dessinerHeader(pdf, pageW, margin, headerH) {
    const T = window.I18n.t;
    const pc = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) || {};
    const planName = pc.name    || T("pdfexport.header.planSansNom");
    const planVer  = pc.version || "";
    const planAuth = pc.author  || "";
    const scale    = (window.APP_CONFIG && window.APP_CONFIG.scale) || null;
    const date     = _dateLisible();

    // Titre principal — gros, jaune charte si support, sinon noir
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(20, 20, 20);
    pdf.text(planName, margin, margin + 6);

    // Sous-ligne : version + auteur + date + échelle
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

    // Ligne de séparation
    pdf.setDrawColor(180, 180, 180);
    pdf.setLineWidth(0.3);
    pdf.line(margin, margin + headerH - 2, pageW - margin, margin + headerH - 2);

    // MyKTAMap logo text en haut à droite
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(180, 140, 30);
    pdf.text("MyKTAMap", pageW - margin, margin + 6, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 120, 120);
    // 🛠️ v1.73.0 : sous-titre kiosque (index.json > config.subtitle) prioritaire
    // sur le tagline i18n — un kiosque « Gironde » exporte des PDF « Gironde ».
    const _kioskSt = (window.KIOSK_CONFIG && typeof window.KIOSK_CONFIG.subtitle === "string")
      ? window.KIOSK_CONFIG.subtitle.trim().slice(0, 80) : "";
    pdf.text(_kioskSt || T("pdfexport.header.tagline"), pageW - margin, margin + 10, { align: "right" });
  }

  // ============================================================
  // FOOTER — LÉGENDE COMPACTE
  // ============================================================
  // ============================================================
  // 🆕 v3.1 (KARMA "ajoute l'option export PNG, OU dans un coin") :
  // dessine la légende en OVERLAY sur la zone du plan, à un des 4 coins.
  // ============================================================
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

    // Calcul de la taille cible en mm sur la page PDF.
    // Largeur cible : ratio fixe % de la largeur du plan selon legSize :
    //   compact  → 22%   standard → 28%   large → 35%
    // → reste lisible sans masquer une trop grande partie du plan.
    const WIDTH_RATIO = { compact: 0.22, standard: 0.28, large: 0.35 };
    const sizeKey = opts.legSize || "standard";
    const wRatio  = WIDTH_RATIO[sizeKey] || 0.28;
    let legWmm = planW * wRatio;
    let legHmm = legWmm * (legCanvas.height / legCanvas.width);

    // Si la légende dépasse 70% de la hauteur du plan (cas plans très
    // étroits ou contenu très long), on recale sur la hauteur max
    // disponible et on recalcule la largeur proportionnellement.
    const maxHmm = planH * 0.70;
    if (legHmm > maxHmm) {
      legHmm = maxHmm;
      legWmm = legHmm * (legCanvas.width / legCanvas.height);
    }

    // Padding interne entre la légende et le bord de la zone plan
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

  // ============================================================
  // UTILS
  // ============================================================
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

  // ============================================================
  // EXPORT GLOBAL
  // ============================================================
  window.MyKTAMapPdfExport = {
    afficherModale: afficherModale,
    genererPdf:     genererPdf
  };

  console.log("[PdfExport] Module chargé (jsPDF dispo : " + _checkJsPDF() + ")");
})();
