/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// EXPORTER.JS — Modale d'export image avancée (PNG / JPEG / WebP)
// =========================
// Contrôle fin des calques image et données, des annotations de session (points, tracés, zones, structures,
// mesure, tracker), d'une légende intégrée, du fond, du format et de la résolution. Aussi le moteur de rendu
// canvas du PDF (pdfExport.js).
// Expose : window.ouvrirExportModal, MyKTAMapExporterGenererCanvas, MyKTAMapExporterGenererCanvasLegende.
// 🩸 Aucune table de couleurs locale : tout passe par window.ktaResolveStyle(cat, type, { flat: true })
// (garde-fou check-style-canon.js). Doc : docs/architecture/exports.md.

(function() {
  "use strict";

  let _currentModal = null;
  let _previewTimer = null;
  let _previewBusy  = false;

  // ── Styles : plus aucune table locale ──────────
  // Toutes les couleurs viennent de `js/styleResolver.js`. 🩸 Une table recopiée oublie un type en silence
  // (une zone INACCESSIBLE sortait en gris remblais via le repli `|| ZS_EMBED.remblais`).
  // { flat: true } : cette pipe est un CANVAS, sans `url(#pattern)` SVG ; le résolveur substitue l'aplat de
  // repli du type (rouge foncé semi-transparent pour `inaccessible`).
  // `repli` = type utilisé quand `type` est introuvable (custom supprimé de la légende) ; `null` = ne rien dessiner.
  // Libellé de formulaire avec pastille RÉSOLUE : les libellés i18n portent leur émoji en dur (« 🟩 Principaux »)
  // et montreraient l'ancienne couleur après un override.
  function _lp(cat, key, label) {
    return (typeof window.ktaLabelAvecPastille === "function")
             ? window.ktaLabelAvecPastille(cat, key, label) : label;
  }

  function _styleCanvas(categorie, type, repli) {
    const R = window.ktaResolveStyle;
    if (typeof R !== "function") {
      console.error("[Export] window.ktaResolveStyle absent — styles indisponibles.");
      return null;
    }
    return R(categorie, type, { flat: true }) ||
           (repli ? R(categorie, repli, { flat: true }) : null);
  }

  // ── Injection des styles (au premier appel) ──────────
  function _injecterStyles() {
    if (document.getElementById("kta-export-styles")) return;
    const style = document.createElement("style");
    style.id = "kta-export-styles";
    style.textContent = `
      .kta-export-cb-row,
      .kta-export-radio-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #c0c8d8;
        padding: 4px 6px;
        border-radius: 4px;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s;
      }
      .kta-export-cb-row:hover,
      .kta-export-radio-row:hover {
        background: rgba(255,255,255,0.04);
      }
      .kta-export-cb-row input[type="checkbox"],
      .kta-export-radio-row input[type="radio"] {
        margin: 0;
        cursor: pointer;
      }
      .kta-export-cb-row input:disabled {
        cursor: not-allowed;
      }
      .kta-export-cb-row input:disabled + span {
        color: #666;
      }
      #kta-export-modal .kta-aide-section {
        margin-bottom: 12px;
      }
      #kta-export-modal .kta-aide-section-titre {
        margin-bottom: 8px;
      }

      /* 🆕 v1.9.2-fix15 (KARMA "lister les layer horizontalement, 4 max,
         on passe à la ligne") : sur PC ≥ 1024px, les blocs de calques
         (Puits, Carrière, Chemin, etc.) s'organisent en grille 4 cols
         max. Chaque cellule contient le titre du calque + ses sous-tags
         empilés verticalement. Wrap automatique à la ligne suivante
         quand > 4 calques. */
      @media (min-width: 1024px) {
        #kta-export-data-layers,
        #kta-export-image-layers {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          align-items: start;
        }
        /* Chaque bloc de calque devient une "carte" visuelle */
        #kta-export-data-layers .kta-export-data-layer-block {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 8px 10px;
        }
      }
      /* Petit écran PC (1024-1279) : 3 cols pour respirer */
      @media (min-width: 1024px) and (max-width: 1279px) {
        #kta-export-data-layers,
        #kta-export-image-layers {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Entrée publique ──────────
  window.ouvrirExportModal = function() {
    _injecterStyles();
    if (_currentModal) { _currentModal.remove(); _currentModal = null; }
    if (typeof _resetLayerPointsCache === "function") _resetLayerPointsCache();
    _afficherModal("rapide");
  };

  // ── Construire et afficher la modale ──────────
  function _afficherModal(modeInitial, etatPrecedent) {
    const T = window.I18n.t;
    const config = window.PLAN_CONFIG;
    if (!config || !config.plan) {
      window.ktaAlerte(T("imgexport.alert.noConfig"), { type: "erreur" });
      return;
    }

    // 🩸 `row()` désactive la case quand le compteur est nul : compter la session SEULE rend inexportables
    // points, tracés et zones d'un plan importé (case grisée sans explication).
    const nbPoints  = _sessionEtEmbarques("points").length;
    const nbRoads   = _sessionEtEmbarques("roads").length;
    const nbZones   = _sessionEtEmbarques("zones").length;
    const nbMesure  = window.getMeasurePoints        ? window.getMeasurePoints().length        : 0;
    // Surface comptée à part pour l'affichage.
    const nbMesureSurf = window.getMeasurePointsSurface ? window.getMeasurePointsSurface().length : 0;
    const nbTrackerPath = window.getTrackingPath ? window.getTrackingPath().length : 0;
    const trackerOk = window.getTrackingPosition && window.getTrackingPosition() !== null;

    const imageLayersVisibles = _getVisibleImageLayerIds(config);
    const dataLayersVisibles  = _getVisibleDataLayerIds(config);

    // Multi-niveau : niveaux exportés par le mode rapide (WYSIWYG = filtre `visibleLevels`) ; rien si OFF.
    const _mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const _visibleLevelsForExport = (_mlOn && Array.isArray(window.APP_CONFIG.visibleLevels))
      ? window.APP_CONFIG.visibleLevels.slice().sort(function(a,b){return a-b;})
      : null;
    const _niveauxRapideTxt = _visibleLevelsForExport
      ? (_visibleLevelsForExport.length === 0
          ? T("imgexport.rapide.niveauxVide")
          : T(_visibleLevelsForExport.length > 1 ? "imgexport.rapide.niveauxPluriel" : "imgexport.rapide.niveauxSing", {
              liste: _visibleLevelsForExport.map(function(l){return T("imgexport.niveau.court", { lvl: l });}).join(", ")
            }))
      : null;

    const modal = document.createElement("div");
    modal.id = "kta-export-modal";
    modal.className = "kta-readme-modal-overlay";

    modal.innerHTML = `
      <!-- 🆕 v1.9.2-fix14 (KARMA "même concept pour Export images") :
           retrait du style inline max-width:580px qui bloquait
           l'agrandissement PC. La modale utilise désormais les tailles
           standard de .kta-readme-modal-boite + classe spécifique
           kta-export-modal-boite pour ajustements ciblés (cf. CSS). -->
      <div class="kta-readme-modal-boite kta-export-modal-boite">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${T("imgexport.modal.titre")}</span>
          <button class="kta-panneau-close" id="kta-export-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps">

          <!-- TOGGLE MODE -->
          <div class="kta-conv-sens-wrap">
            <button class="kta-conv-sens-btn ${modeInitial === 'rapide' ? 'active' : ''}" id="kta-export-mode-rapide">
              <span class="kta-conv-sens-label">${T("imgexport.mode.rapide.label")}</span>
              <span class="kta-conv-sens-desc">
                ${_mlOn
                  ? T("imgexport.mode.rapide.descMl")
                  : T("imgexport.mode.rapide.desc")}
              </span>
            </button>
            <button class="kta-conv-sens-btn ${modeInitial === 'avance' ? 'active' : ''}" id="kta-export-mode-avance">
              <span class="kta-conv-sens-label">${T("imgexport.mode.avance.label")}</span>
              <span class="kta-conv-sens-desc">${T("imgexport.mode.avance.desc")}</span>
            </button>
          </div>

          <!-- MODE RAPIDE -->
          <div id="kta-export-rapide" style="display:${modeInitial === 'rapide' ? 'block' : 'none'};">
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">${T("imgexport.rapide.contenu.titre")}</div>
              <p style="font-size:13px; color:#c0c8d8; margin:0; line-height:1.7;">
                ${T("imgexport.rapide.contenu.image")}<br>
                ${T("imgexport.rapide.contenu.annotations", {
                  points: nbPoints, roads: nbRoads, zones: nbZones,
                  structures: (window.getStructures && window.getStructures().length > 0)
                    ? T("imgexport.rapide.contenu.structuresSuffixe", { count: window.getStructures().length })
                    : ''
                })}<br>
                ${_niveauxRapideTxt
                  ? '<span style="color:#f4c542;">🏗️ ' + _niveauxRapideTxt + '</span>' + T("imgexport.rapide.contenu.niveauxAstuce") + '<br>'
                  : ''}
                ${T("imgexport.rapide.contenu.format")}<br>
                ${nbMesure > 0 ? T("imgexport.rapide.contenu.mesureDist", { count: nbMesure }) + '<br>' : ''}
                ${nbMesureSurf >= 3 ? T("imgexport.rapide.contenu.mesureSurf", { count: nbMesureSurf }) + '<br>' : ''}
              </p>
            </div>
          </div>

          <!-- MODE AVANCÉ -->
          <div id="kta-export-avance" style="display:${modeInitial === 'avance' ? 'block' : 'none'};">

            <!-- 🆕 v1.9.3-A1.b.3 (KARMA "on doit avoir la possibilité de
                 remplacer l'image principal par un fond transparent, blanc,
                 ou noir, pour afficher uniquement ce que on a calqué dessus") :
                 sélecteur du fond d'export. 4 options radio :
                 - image : comportement classique (calques image visibles)
                 - blanc : fillRect blanc pour impression
                 - noir : fillRect noir pour vue contraste
                 - transparent : pas de fillRect (canvas alpha) -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">${T("imgexport.fond.titre")}</div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                <label class="kta-export-radio-row">
                  <input type="radio" name="export_bg" value="image" checked>
                  <span>${T("imgexport.fond.image")} <span style="color:#8892a4; font-size:11px;">${T("imgexport.fond.imageNote")}</span></span>
                </label>
                <label class="kta-export-radio-row">
                  <input type="radio" name="export_bg" value="white">
                  <span>${T("imgexport.fond.blanc")} <span style="color:#8892a4; font-size:11px;">${T("imgexport.fond.blancNote")}</span></span>
                </label>
                <label class="kta-export-radio-row">
                  <input type="radio" name="export_bg" value="black">
                  <span>${T("imgexport.fond.noir")} <span style="color:#8892a4; font-size:11px;">${T("imgexport.fond.noirNote")}</span></span>
                </label>
                <label class="kta-export-radio-row">
                  <input type="radio" name="export_bg" value="transparent">
                  <span>${T("imgexport.fond.transparent")} <span style="color:#8892a4; font-size:11px;">${T("imgexport.fond.transparentNote")}</span></span>
                </label>
              </div>
              <div id="kta-export-bg-info" style="display:none; margin-top:8px; padding:8px 12px; background:rgba(244,197,66,0.08); border:1px solid rgba(244,197,66,0.25); border-radius:6px; font-size:11.5px; color:#c8d0e0; line-height:1.5;">
                ${T("imgexport.fond.info")}
              </div>
            </div>

            <!-- Calques d'image -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">${T("imgexport.calquesImage.titre")}</div>
              <div id="kta-export-image-layers"></div>
            </div>

            <!-- Calques de données -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">${T("imgexport.calquesData.titre")}</div>
              <div id="kta-export-data-layers"></div>
            </div>

            <!-- Annotations -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">${T("imgexport.annotations.titre")}</div>
              <div id="kta-export-annotations"></div>
            </div>

            <!-- 🏗️ Niveaux (depuis v148, conditionnel sur multiLevel ON) -->
            <div class="kta-aide-section" id="kta-export-levels-section" style="display:none;">
              <div class="kta-aide-section-titre">${T("imgexport.niveaux.titre")}</div>
              <div id="kta-export-levels" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
            </div>

            <!-- Légende intégrée -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">${T("imgexport.legende.titre")}</div>
              <label class="kta-export-cb-row" style="font-weight:600;">
                <input type="checkbox" id="kta-export-legende-on">
                <span>${T("imgexport.legende.inclure")}</span>
              </label>
              <div id="kta-export-legende-options" style="display:none; margin-top:10px;">

                <div style="margin-top:8px;">
                  <div class="kta-cfg-label" style="margin-bottom:4px;">${T("imgexport.legende.position")}</div>
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                    <label class="kta-export-radio-row"><input type="radio" name="leg_pos" value="haut-gauche" checked><span>${T("imgexport.legende.pos.hg")}</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_pos" value="haut-droit"><span>${T("imgexport.legende.pos.hd")}</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_pos" value="bas-gauche"><span>${T("imgexport.legende.pos.bg")}</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_pos" value="bas-droit"><span>${T("imgexport.legende.pos.bd")}</span></label>
                    <label class="kta-export-radio-row" style="grid-column: span 2;"><input type="radio" name="leg_pos" value="custom"><span>${T("imgexport.legende.pos.custom")}</span></label>
                  </div>

                  <div id="kta-export-leg-custom" style="display:none; margin-top:8px;">
                    <button class="kta-btn kta-btn-ghost" id="kta-export-leg-pick" style="width:100%; margin-bottom:6px;">
                      ${T("imgexport.legende.selectCarte")}
                    </button>
                    <div style="display:grid; grid-template-columns:auto 1fr auto 1fr; gap:6px; align-items:center;">
                      <label class="kta-cfg-label" style="margin:0;">X</label>
                      <input class="kta-cfg-input" type="number" id="kta-export-leg-x" placeholder="0">
                      <label class="kta-cfg-label" style="margin:0;">Y</label>
                      <input class="kta-cfg-input" type="number" id="kta-export-leg-y" placeholder="0">
                    </div>
                  </div>
                </div>

                <div style="margin-top:12px;">
                  <div class="kta-cfg-label" style="margin-bottom:4px;">${T("imgexport.legende.style")}</div>
                  <div style="display:flex; gap:6px;">
                    <label class="kta-export-radio-row"><input type="radio" name="leg_style" value="opaque" checked><span>${T("imgexport.legende.style.opaque")}</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_style" value="semi"><span>${T("imgexport.legende.style.semi")}</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_style" value="filigrane"><span>${T("imgexport.legende.style.filigrane")}</span></label>
                  </div>
                </div>

                <div style="margin-top:12px;">
                  <div class="kta-cfg-label" style="margin-bottom:4px;">${T("imgexport.legende.taille")}</div>
                  <div style="display:flex; gap:6px;">
                    <label class="kta-export-radio-row"><input type="radio" name="leg_size" value="compact"><span>${T("imgexport.legende.taille.compact")}</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_size" value="standard" checked><span>${T("imgexport.legende.taille.standard")}</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_size" value="large"><span>${T("imgexport.legende.taille.large")}</span></label>
                  </div>
                </div>

                <div style="margin-top:12px;">
                  <div class="kta-cfg-label" style="margin-bottom:4px;">${T("imgexport.legende.contenu")}</div>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_icones" checked><span>${T("imgexport.legende.contenu.icones")}</span></label>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_traces" checked><span>${T("imgexport.legende.contenu.traces")}</span></label>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_zones" checked><span>${T("imgexport.legende.contenu.zones")}</span></label>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_structures" checked><span>${T("imgexport.legende.contenu.structures")}</span></label>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_track"><span>${T("imgexport.legende.contenu.track")}</span></label>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_meta" checked><span>${T("imgexport.legende.contenu.meta")}</span></label>
                </div>

                <!-- 🆕 v1.16.0 step 2 : panneau « Personnaliser les libellés »
                     (rename + show/hide par entrée + entrées custom). Section
                     collapsible pour pas alourdir la modale au défaut. -->
                <details class="kta-legend-custom-details" style="margin-top:14px; border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:8px;">
                  <summary style="cursor:pointer; font-weight:600; color:#e8eaf0; padding:4px; user-select:none;">
                    ${T("imgexport.legende.custom.titre")}
                  </summary>
                  <div id="kta-legend-custom-body" style="margin-top:10px;">
                    <!-- Peuplé dynamiquement par _peuplerLegendCustom() au moment de l'ouverture du modal -->
                  </div>
                  <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                    <button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-legend-custom-add">
                      ${T("imgexport.legende.custom.ajouter")}
                    </button>
                    <button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-legend-custom-reset" title="${T("imgexport.legende.custom.resetTitre")}">
                      ${T("imgexport.legende.custom.reset")}
                    </button>
                  </div>
                </details>

              </div>
            </div>

            <!-- Format & qualité -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">${T("imgexport.format.titre")}</div>
              <div style="display:flex; gap:14px; flex-wrap:wrap;">
                <div>
                  <div class="kta-cfg-label" style="margin-bottom:4px;">${T("imgexport.format.format")}</div>
                  <label class="kta-export-radio-row"><input type="radio" name="format" value="png" checked><span>${T("imgexport.format.png")}</span></label>
                  <label class="kta-export-radio-row"><input type="radio" name="format" value="jpeg"><span>${T("imgexport.format.jpeg")}</span></label>
                </div>
                <div>
                  <div class="kta-cfg-label" style="margin-bottom:4px;">${T("imgexport.format.resolution")}</div>
                  <label class="kta-export-radio-row"><input type="radio" name="resol" value="1" checked><span>${T("imgexport.format.resol.originale")}</span></label>
                  <label class="kta-export-radio-row"><input type="radio" name="resol" value="0.5"><span>½</span></label>
                  <label class="kta-export-radio-row"><input type="radio" name="resol" value="0.25"><span>¼</span></label>
                </div>
              </div>
              <p id="kta-export-resol-info" style="font-size:11.5px; color:#8892a4; margin:8px 0 0; line-height:1.45;"></p>
            </div>

            <!-- Aperçu -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">${T("imgexport.apercu.titre")}</div>
              <div style="display:flex; justify-content:center; background:rgba(255,255,255,0.04); border-radius:6px; padding:8px;">
                <canvas id="kta-export-preview" width="320" height="200" style="max-width:100%; border:1px solid rgba(255,255,255,0.1); border-radius:4px;"></canvas>
              </div>
              <p id="kta-export-preview-info" style="font-size:11px; color:#8892a4; margin:6px 0 0; text-align:center;"></p>
            </div>

          </div>

          <!-- ACTIONS -->
          <div class="kta-conv-actions" style="margin-top:14px;">
            <button class="kta-btn kta-btn-ghost"   id="kta-export-annuler">${T("imgexport.btn.annuler")}</button>
            <button class="kta-btn kta-btn-primary" id="kta-export-go">${T("imgexport.btn.telecharger")}</button>
          </div>

          <div id="kta-export-erreur" class="kta-conv-erreur" style="display:none;"></div>

        </div>
      </div>
    `;

    document.documentElement.appendChild(modal);
    _currentModal = modal;

    _peuplerCalquesImage(config, imageLayersVisibles);
    _peuplerCalquesData(config, dataLayersVisibles);
    _peuplerAnnotations(nbPoints, nbRoads, nbZones, nbMesure, trackerOk, nbTrackerPath);
    _peuplerNiveaux();
    _peuplerLegendCustom();
    // Résolution pré-cochée choisie AVANT la restauration (un choix déjà fait par l'utilisateur gagne).
    _preparerResolutions(config);

    // État précédent restauré (retour d'une sélection 🎯 sur la carte).
    if (etatPrecedent) _restaurerEtat(etatPrecedent);

    _attacherListeners(modal, modeInitial);

    if (modeInitial === "avance") {
      _planifierApercu();
    }
  }

  // ── Cases à cocher des calques ──────────
  function _peuplerCalquesImage(config, visibles) {
    const cont = document.getElementById("kta-export-image-layers");
    if (!cont) return;
    const layers = config.imageLayers || [];
    if (layers.length === 0) {
      cont.innerHTML = '<p style="font-size:12px; color:#8892a4; margin:0;">' + window.I18n.t("imgexport.calquesImage.aucun") + '</p>';
      return;
    }
    cont.innerHTML = layers.map(function(l) {
      const checked = visibles.includes(l.id) ? "checked" : "";
      return `<label class="kta-export-cb-row">
        <input type="checkbox" data-layer-id="${l.id}" data-layer-type="image" ${checked}>
        <span>${l.label || l.id}</span>
      </label>`;
    }).join("");
  }

  function _peuplerCalquesData(config, visibles) {
    const cont = document.getElementById("kta-export-data-layers");
    if (!cont) return;
    const layers = config.dataLayers || [];
    if (layers.length === 0) {
      cont.innerHTML = '<p style="font-size:12px; color:#8892a4; margin:0;">' + window.I18n.t("imgexport.calquesData.aucun") + '</p>';
      return;
    }

    // Placeholder par calque (la liste de tags arrive en async).
    cont.innerHTML = layers.map(function(l) {
      const checked = visibles.includes(l.id) ? "checked" : "";
      const safeId = _slugLayerId(l.id);
      return `<div class="kta-export-data-layer-block" data-layer-id="${l.id}">
        <label class="kta-export-cb-row">
          <input type="checkbox" id="export_layer_${safeId}" data-layer-id="${l.id}" data-layer-type="data" ${checked}>
          <span>${l.label || l.id}</span>
        </label>
        <div class="kta-export-layer-tags" id="export_layer_tags_${safeId}"></div>
      </div>`;
    }).join("");

    layers.forEach(function(l) {
      _chargerInfosCalque(l).then(function(infos) {
        _renderInfosCalque(l, infos);
      }).catch(function(e) {
        console.warn("[Export] Infos " + l.id + " :", e);
      });
    });
  }

  function _slugLayerId(id) {
    return String(id).replace(/[^a-z0-9_-]/gi, "_");
  }

  function _slugTagId(tag) {
    return String(tag).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Tags des points d'un calque : [{ tag, count, isUntagged }] trié alphabétiquement.
  function _listerTagsPoints(points) {
    const tagCounts = {};
    let untaggedCount = 0;
    (points || []).forEach(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
      if (tags.length === 0) untaggedCount++;
      else tags.forEach(function(t) {
        const k = String(t);
        tagCounts[k] = (tagCounts[k] || 0) + 1;
      });
    });
    const list = Object.keys(tagCounts).sort(function(a, b) { return a.localeCompare(b); }).map(function(t) {
      return { tag: t, count: tagCounts[t], isUntagged: false };
    });
    if (untaggedCount > 0) {
      list.push({ tag: "__untagged__", count: untaggedCount, isUntagged: true });
    }
    return list;
  }

  // { type: count } des types présents dans un tableau d'objets à champ .type.
  function _compterTypes(arr, allTypes) {
    const out = {};
    allTypes.forEach(function(t) { out[t] = 0; });
    (arr || []).forEach(function(item) {
      if (out.hasOwnProperty(item.type)) out[item.type]++;
    });
    return out;
  }

  // Contenu d'un calque (points + roads + zones) pour les filtres, en cache local à la modale.
  const _layerPointsCache = {};
  async function _chargerInfosCalque(layerCfg) {
    if (_layerPointsCache[layerCfg.id]) return _layerPointsCache[layerCfg.id];

    let points = [];
    let roads = [];
    let zones = [];

    if (layerCfg.id === "editor") {
      points = window.getEditorPoints ? window.getEditorPoints() : [];
      // Le calque éditeur n'a pas de roads/zones embarquées (gérées par la session).
    } else {
      try {
        const r = await fetch(layerCfg.file);
        const j = await r.json();
        points = j.data || [];
        roads  = Array.isArray(j.roads) ? j.roads : [];
        zones  = Array.isArray(j.zones) ? j.zones : [];
      } catch(e) {
        // 🩸 Un plan importé n'a pas de fichier servi par le site : ses données vivent en mémoire (même repli
        // que plus bas). Sans lui, aucun sous-filtre pour ce calque.
        const duCalque = function (arr) {
          return (arr || []).filter(function (o) { return !o.layerId || o.layerId === layerCfg.id; });
        };
        points = duCalque(typeof window.getAllEmbeddedPoints === "function" ? window.getAllEmbeddedPoints() : []);
        roads  = duCalque(typeof window.getAllEmbeddedRoads  === "function" ? window.getAllEmbeddedRoads()  : []);
        zones  = duCalque(typeof window.getAllEmbeddedZones  === "function" ? window.getAllEmbeddedZones()  : []);
      }
    }

    const infos = {
      tags:      _listerTagsPoints(points),
      roadTypes: _compterTypes(roads, ["principal", "secondaire", "chemin"]),
      zoneTypes: _compterTypes(zones, ["eau", "remblais", "effondrement", "inaccessible"])
    };
    _layerPointsCache[layerCfg.id] = infos;
    return infos;
  }

  // Icône d'un tag : PLAN_CONFIG.icons[tag], puis _iconMap[tag].
  function _iconePourTag(tag) {
    const planIcons = (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) || {};
    if (planIcons[tag]) return planIcons[tag];
    const entry = window._iconMap && window._iconMap[tag];
    if (!entry) return null;
    // Une entrée L.divIcon (scaledMarkers) n'a pas options.iconUrl : _kta_iconUrl est posé en secours par
    // creerIcones.
    return entry._kta_iconUrl || (entry.options && entry.options.iconUrl) || null;
  }

  function _escapeHtmlExport(s) { return window.ktaEsc(s); }

  // Sous-cases (tags + types roads + types zones) d'un calque, avec synchro parent ↔ enfants.
  function _renderInfosCalque(layerCfg, infos) {
    const safeId = _slugLayerId(layerCfg.id);
    const cont = document.getElementById("export_layer_tags_" + safeId);
    if (!cont) return;

    const tagsList   = (infos && infos.tags)      || [];
    const roadTypes  = (infos && infos.roadTypes) || {};
    const zoneTypes  = (infos && infos.zoneTypes) || {};

    const hasTags  = tagsList.length > 0;
    const hasRoads = ["principal","secondaire","chemin"].some(function(t) { return roadTypes[t] > 0; });
    const hasZones = ["eau","remblais","effondrement","inaccessible"].some(function(t) { return zoneTypes[t] > 0; });

    if (!hasTags && !hasRoads && !hasZones) {
      cont.innerHTML = "";
      return;
    }

    let html = "";

    if (hasTags) {
      html += tagsList.map(function(item) {
        const safeTag = _slugTagId(item.tag);
        const id = "export_layer_" + safeId + "_tag_" + safeTag;
        const iconUrl = item.isUntagged ? null : _iconePourTag(item.tag);
        const iconHtml = iconUrl
          ? '<img src="' + iconUrl + '" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:4px;">'
          : (item.isUntagged ? '<span style="opacity:0.5;margin-right:4px;">∅</span>' : '<span style="opacity:0.5;margin-right:4px;">🏷️</span>');
        const label = item.isUntagged ? "<em>" + window.I18n.t("imgexport.tag.sansTag") + "</em>" : _escapeHtmlExport(item.tag);
        return `<label class="kta-export-cb-row" style="margin-left:24px; font-size:12px;">
          <input type="checkbox" id="${id}" data-layer-tag-of="${layerCfg.id}" checked>
          <span>${iconHtml}${label} <span style="color:#8892a4;">(${item.count})</span></span>
        </label>`;
      }).join("");
    }

    if (hasRoads) {
      const roadLabels = {
        principal:  _lp("traces", "principal", window.I18n.t("imgexport.roadType.principal")),
        secondaire: _lp("traces", "secondaire", window.I18n.t("imgexport.roadType.secondaire")),
        chemin:     _lp("traces", "chemin", window.I18n.t("imgexport.roadType.chemin"))
      };
      ["principal","secondaire","chemin"].forEach(function(t) {
        if (!roadTypes[t]) return;
        const id = "export_layer_" + safeId + "_road_" + t;
        html += `<label class="kta-export-cb-row" style="margin-left:24px; font-size:12px;">
          <input type="checkbox" id="${id}" data-layer-roadtype-of="${layerCfg.id}" checked>
          <span>${roadLabels[t]} <span style="color:#8892a4;">(${roadTypes[t]})</span></span>
        </label>`;
      });
    }

    if (hasZones) {
      const zoneLabels = {
        eau:          _lp("zones", "eau", window.I18n.t("imgexport.zoneType.eau")),
        remblais:     _lp("zones", "remblais", window.I18n.t("imgexport.zoneType.remblais")),
        effondrement: _lp("zones", "effondrement", window.I18n.t("imgexport.zoneType.effondrement")),
        inaccessible: _lp("zones", "inaccessible", window.I18n.t("imgexport.zoneType.inaccessible"))
      };
      ["eau","remblais","effondrement","inaccessible"].forEach(function(t) {
        if (!zoneTypes[t]) return;
        const id = "export_layer_" + safeId + "_zone_" + t;
        html += `<label class="kta-export-cb-row" style="margin-left:24px; font-size:12px;">
          <input type="checkbox" id="${id}" data-layer-zonetype-of="${layerCfg.id}" checked>
          <span>${zoneLabels[t]} <span style="color:#8892a4;">(${zoneTypes[t]})</span></span>
        </label>`;
      });
    }

    cont.innerHTML = html;

    const parent = document.getElementById("export_layer_" + safeId);
    const subs = Array.from(cont.querySelectorAll('input[type="checkbox"]'));

    if (parent && subs.length > 0) {
      parent.addEventListener("change", function() {
        subs.forEach(function(s) { if (!s.disabled) s.checked = parent.checked; });
        if (typeof _planifierApercu === "function") _planifierApercu();
      });
      subs.forEach(function(s) {
        s.addEventListener("change", function() {
          parent.checked = subs.some(function(x) { return x.checked; });
          if (typeof _planifierApercu === "function") _planifierApercu();
        });
      });
    }
  }


  // Tags cochés d'un calque : { tagsCoches: Set, untaggedCoche: bool, tousActifs: bool }.
  // tousActifs = aucune sous-case tag (calque sans tags identifiables) → tous les points, sans filtre.
  function _lireTagsCochesCalque(layerId) {
    const safeId = _slugLayerId(layerId);
    const cont = document.getElementById("export_layer_tags_" + safeId);
    const inputs = cont ? cont.querySelectorAll('input[data-layer-tag-of]') : [];
    if (inputs.length === 0) {
      return { tagsCoches: new Set(), untaggedCoche: false, tousActifs: true };
    }
    const tagsCoches = new Set();
    let untaggedCoche = false;
    const cache = _layerPointsCache[layerId];
    const tagsCache = cache && cache.tags ? cache.tags : [];
    // Préfixe complet ancré : l'id du calque peut contenir "_tag_", et les tags des `_` (cf. _slugTagId),
    // donc pas de `[^_]+$` ici.
    const prefix = "export_layer_" + safeId + "_tag_";
    inputs.forEach(function(cb) {
      if (!cb.checked) return;
      if (!cb.id.startsWith(prefix)) return;
      const slug = cb.id.slice(prefix.length);
      const item = tagsCache.find(function(it) { return _slugTagId(it.tag) === slug; });
      if (!item) return;
      if (item.isUntagged) untaggedCoche = true;
      else tagsCoches.add(item.tag);
    });
    return { tagsCoches: tagsCoches, untaggedCoche: untaggedCoche, tousActifs: false };
  }

  // Types de routes cochés d'un calque ; tousActifs = aucune sous-case road.
  // ⚠️ Regex `[^_]+$` (pas `.+$`) : un calque d'id "road" donne "export_layer_road_road_principal", et `.+$`
  // capturerait "road_principal" au lieu de "principal".
  function _lireRoadTypesCochesCalque(layerId) {
    const cont = document.getElementById("export_layer_tags_" + _slugLayerId(layerId));
    const inputs = cont ? cont.querySelectorAll('input[data-layer-roadtype-of]') : [];
    if (inputs.length === 0) return { types: new Set(), tousActifs: true };
    const types = new Set();
    inputs.forEach(function(cb) {
      if (!cb.checked) return;
      const m = cb.id.match(/_road_([^_]+)$/);
      if (m) types.add(m[1]);
    });
    return { types: types, tousActifs: false };
  }

  // Types de zones cochés. ⚠️ Même regex `[^_]+$` (calque d'id "zone" : "export_layer_zone_zone_eau").
  // Rend aussi `connus` = les types qui ONT une case. 🩸 Un type sans case n'a pas été refusé, il n'a jamais été
  // proposé : les cases ne couvrent que les 4 types intégrés, et filtrer sur `types` seul supprimerait de
  // l'export un type personnalisé (import SIG) sans que personne l'ait demandé.
  function _lireZoneTypesCochesCalque(layerId) {
    const cont = document.getElementById("export_layer_tags_" + _slugLayerId(layerId));
    const inputs = cont ? cont.querySelectorAll('input[data-layer-zonetype-of]') : [];
    if (inputs.length === 0) return { types: new Set(), connus: new Set(), tousActifs: true };
    const types = new Set();
    const connus = new Set();
    inputs.forEach(function(cb) {
      const m = cb.id.match(/_zone_([^_]+)$/);
      if (!m) return;
      connus.add(m[1]);
      if (cb.checked) types.add(m[1]);
    });
    return { types: types, connus: connus, tousActifs: false };
  }

  function _filtrerPointsParTagsCalque(points, layerId) {
    const sel = _lireTagsCochesCalque(layerId);
    if (sel.tousActifs) return points; // calque sans tags identifiables → tout inclure
    return (points || []).filter(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
      if (tags.length === 0) return sel.untaggedCoche;
      return tags.some(function(t) { return sel.tagsCoches.has(String(t)); });
    });
  }

  // Remise à zéro du cache (à chaque ouverture).
  function _resetLayerPointsCache() {
    Object.keys(_layerPointsCache).forEach(function(k) { delete _layerPointsCache[k]; });
  }

  // Section « Niveaux à exporter » : masquée si le plan n'est pas multi-niveau ; sinon une case par niveau
  // d'availableLevels, pré-cochée s'il est dans visibleLevels.
  function _peuplerNiveaux() {
    const section = document.getElementById("kta-export-levels-section");
    const cont    = document.getElementById("kta-export-levels");
    if (!section || !cont) return;

    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    if (!mlOn) {
      section.style.display = "none";
      cont.innerHTML = "";
      return;
    }

    section.style.display = "";
    const levels = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.availableLevels))
      ? window.APP_CONFIG.availableLevels.slice()
      : [-2, -1, 0, 1, 2];
    // Tri croissant (comme la modale Niveaux).
    levels.sort(function(a, b) { return a - b; });
    const visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
      ? window.APP_CONFIG.visibleLevels
      : [0];

    cont.innerHTML = levels.map(function(lvl) {
      const checked = visibles.indexOf(lvl) >= 0 ? "checked" : "";
      return '<label class="kta-export-cb-row" style="margin:0; padding:4px 10px;' +
             ' background:rgba(244,197,66,0.06); border:1px solid rgba(244,197,66,0.20);' +
             ' border-radius:6px; cursor:pointer;">' +
             '<input type="checkbox" data-level="' + lvl + '" id="ann_level_' + lvl + '" ' + checked + '>' +
             '<span style="font-family:monospace; font-weight:600; color:#f4c542; margin-left:6px;">' + window.I18n.t("imgexport.niveau.court", { lvl: lvl }) + '</span>' +
             '</label>';
    }).join("");
  }

  function _peuplerAnnotations(nbPoints, nbRoads, nbZones, nbMesure, trackerOk, nbTrackerPath) {
    const cont = document.getElementById("kta-export-annotations");
    if (!cont) return;

    function row(id, label, count, defaultChecked) {
      const disabled = count === 0 ? "disabled" : "";
      const checked = (count > 0 && defaultChecked) ? "checked" : "";
      const dim = count === 0 ? "opacity:0.4;" : "";
      return `<label class="kta-export-cb-row" style="${dim}">
        <input type="checkbox" id="ann_${id}" ${checked} ${disabled}>
        <span>${label} ${count !== null ? '<span style="color:#8892a4;">(' + count + ')</span>' : ''}</span>
      </label>`;
    }

    function rowSub(id, label, count, defaultChecked) {
      const disabled = count === 0 ? "disabled" : "";
      const checked = (count > 0 && defaultChecked) ? "checked" : "";
      const dim = count === 0 ? "opacity:0.4;" : "";
      return `<label class="kta-export-cb-row" style="${dim}margin-left:24px;font-size:12px;">
        <input type="checkbox" id="ann_${id}" ${checked} ${disabled}>
        <span>${label} <span style="color:#8892a4;">(${count})</span></span>
      </label>`;
    }

    const roads = _sessionEtEmbarques("roads");
    const zones = _sessionEtEmbarques("zones");
    const structures = _sessionEtEmbarques("structures");
    const nbStructures = structures.length;
    const roadsByType = {
      principal:  roads.filter(function(r) { return r.type === "principal";  }).length,
      secondaire: roads.filter(function(r) { return r.type === "secondaire"; }).length,
      chemin:     roads.filter(function(r) { return r.type === "chemin";     }).length
    };
    const zonesByType = {
      eau:          zones.filter(function(z) { return z.type === "eau";          }).length,
      remblais:     zones.filter(function(z) { return z.type === "remblais";     }).length,
      effondrement: zones.filter(function(z) { return z.type === "effondrement"; }).length,
      inaccessible: zones.filter(function(z) { return z.type === "inaccessible"; }).length
    };
    // Sous-types de structures (fronts compris). Types RÉELLEMENT présents ; les personnalisés affichent le
    // libellé de la légende plutôt que leur nom brut (`cust-sig-…`).
    function _compterEtCustom(items, builtins) {
      const par = {};
      (items || []).forEach(function (o) {
        if (!o || !o.type) return;
        par[o.type] = (par[o.type] || 0) + 1;
      });
      // Les intégrés restent listés même à zéro : les voir disparaître ferait croire à un filtre.
      builtins.forEach(function (t) { if (par[t] === undefined) par[t] = 0; });
      const custom = Object.keys(par)
        .filter(function (t) { return String(t).indexOf("cust-") === 0; })
        .map(function (t) {
          let lib = t;
          try {
            const LC = window.LegendCustomization;
            const e = (LC && typeof LC.findCustomEntry === "function") ? LC.findCustomEntry(t) : null;
            if (e && e.label) lib = e.label;
          } catch (err) {}
          return { type: t, label: lib, n: par[t] };
        })
        .sort(function (a, b) { return b.n - a.n; });
      return { par: par, custom: custom };
    }

    // 🩸 Les sous-types ne sont PAS listés en dur : un plan importé (types tous personnalisés) aurait son total
    // juste et tous ses sous-types à zéro.
    const _sS = _compterEtCustom(structures, ["pilier-1", "pilier-2", "mur", "front-1", "front-2"]);
    const structuresByType   = _sS.par;
    const structTypesCustom  = _sS.custom;
    const _sR = _compterEtCustom(roads, ["principal", "secondaire", "chemin"]);
    const roadTypesCustom    = _sR.custom;
    const _sZ = _compterEtCustom(zones, ["eau", "remblais", "effondrement", "inaccessible"]);
    const zoneTypesCustom    = _sZ.custom;

    // Tracker : toujours actif (la position courante existe au minimum), tracé inclus si > 1 point.
    const trackerLabel = (nbTrackerPath && nbTrackerPath > 1)
      ? window.I18n.t("imgexport.ann.trackerPath", { count: nbTrackerPath })
      : window.I18n.t("imgexport.ann.tracker");

    // Tags présents, calques compris (sinon pas de sous-filtre par tag pour un plan importé).
    const sessionPoints = _sessionEtEmbarques("points");
    const sessionTags = _listerTagsPoints(sessionPoints);

    let pointsTagsHtml = "";
    if (sessionTags.length > 0) {
      pointsTagsHtml = sessionTags.map(function(item) {
        const safeTag = _slugTagId(item.tag);
        const id = "ann_points_tag_" + safeTag;
        const iconUrl = item.isUntagged ? null : _iconePourTag(item.tag);
        const iconHtml = iconUrl
          ? '<img src="' + iconUrl + '" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:4px;">'
          : (item.isUntagged ? '<span style="opacity:0.5;margin-right:4px;">∅</span>' : '<span style="opacity:0.5;margin-right:4px;">🏷️</span>');
        const label = item.isUntagged ? "<em>" + window.I18n.t("imgexport.tag.sansTag") + "</em>" : _escapeHtmlExport(item.tag);
        return `<label class="kta-export-cb-row" style="margin-left:24px; font-size:12px;">
          <input type="checkbox" id="${id}" data-session-tag="1" checked>
          <span>${iconHtml}${label} <span style="color:#8892a4;">(${item.count})</span></span>
        </label>`;
      }).join("");
    }

    const Ti = window.I18n.t;
    cont.innerHTML =
      row("points",  Ti("imgexport.ann.points"),          nbPoints,  true) +
      pointsTagsHtml +

      row("roads",   Ti("imgexport.ann.roads"),           nbRoads,   true) +
      rowSub("roads_principal",  _lp("traces", "principal", Ti("imgexport.roadType.principal")),  roadsByType.principal,  true) +
      rowSub("roads_secondaire", _lp("traces", "secondaire", Ti("imgexport.roadType.secondaire")), roadsByType.secondaire, true) +
      rowSub("roads_chemin",     _lp("traces", "chemin", Ti("imgexport.roadType.chemin")),     roadsByType.chemin,     true) +
      roadTypesCustom.map(function (c) {
        return rowSub("roads_" + c.type, c.label, c.n, true);
      }).join("") +

      row("zones",   Ti("imgexport.ann.zones"),           nbZones,   true) +
      rowSub("zones_eau",          _lp("zones", "eau", Ti("imgexport.zoneType.eau")),          zonesByType.eau,          true) +
      rowSub("zones_remblais",     _lp("zones", "remblais", Ti("imgexport.zoneType.remblais")),     zonesByType.remblais,     true) +
      rowSub("zones_effondrement", _lp("zones", "effondrement", Ti("imgexport.zoneType.effondrement")), zonesByType.effondrement, true) +
      rowSub("zones_inaccessible", _lp("zones", "inaccessible", Ti("imgexport.zoneType.inaccessible")), zonesByType.inaccessible, true) +
      zoneTypesCustom.map(function (c) {
        return rowSub("zones_" + c.type, c.label, c.n, true);
      }).join("") +

      // Structures (piliers, murs, fronts), calqué sur le bloc zones.
      row("structures", Ti("imgexport.ann.structures"), nbStructures, true) +
      rowSub("structures_pilier-1", _lp("structures", "pilier-1", Ti("imgexport.structType.pilier1")), structuresByType["pilier-1"], true) +
      rowSub("structures_pilier-2", _lp("structures", "pilier-2", Ti("imgexport.structType.pilier2")), structuresByType["pilier-2"], true) +
      rowSub("structures_mur",      _lp("structures", "mur", Ti("imgexport.structType.mur")),     structuresByType["mur"],      true) +
      rowSub("structures_front-1",  _lp("structures", "front-1", Ti("imgexport.structType.front1")),  structuresByType["front-1"], true) +
      rowSub("structures_front-2",  _lp("structures", "front-2", Ti("imgexport.structType.front2")),  structuresByType["front-2"], true) +
      structTypesCustom.map(function (c) {
        return rowSub("structures_" + c.type, c.label, c.n, true);
      }).join("") +

      row("mesure",  Ti("imgexport.ann.mesure"),          nbMesure,  false) +
      `<label class="kta-export-cb-row" style="${trackerOk ? '' : 'opacity:0.4;'}">
        <input type="checkbox" id="ann_tracker" ${trackerOk ? '' : 'disabled'}>
        <span>${trackerLabel}</span>
      </label>`;

    _sessionPointsTags = sessionTags;

    setTimeout(function() {
      _syncAnnotParent("ann_roads", ["ann_roads_principal", "ann_roads_secondaire", "ann_roads_chemin"]
        .concat(roadTypesCustom.map(function (c) { return "ann_roads_" + c.type; })));
      _syncAnnotParent("ann_zones", ["ann_zones_eau", "ann_zones_remblais", "ann_zones_effondrement", "ann_zones_inaccessible"]
        .concat(zoneTypesCustom.map(function (c) { return "ann_zones_" + c.type; })));
      // Synchro parent ↔ enfants des structures. Les sous-types custom sont ajoutés à la volée : liste non écrite
      // en dur, sinon décocher « Structures » ne les décoche pas.
      _syncAnnotParent("ann_structures",
        ["ann_structures_pilier-1", "ann_structures_pilier-2", "ann_structures_mur",
         "ann_structures_front-1", "ann_structures_front-2"]
        .concat(structTypesCustom.map(function (c) { return "ann_structures_" + c.type; })));

      const pointsTagIds = sessionTags.map(function(item) { return "ann_points_tag_" + _slugTagId(item.tag); });
      if (pointsTagIds.length > 0) {
        _syncAnnotParent("ann_points", pointsTagIds);
      }
    }, 0);
  }

  let _sessionPointsTags = [];

  function _syncAnnotParent(parentId, subIds) {
    const parent = document.getElementById(parentId);
    const subs = subIds.map(function(id) { return document.getElementById(id); }).filter(Boolean);
    if (!parent || subs.length === 0) return;

    parent.addEventListener("change", function() {
      subs.forEach(function(s) { if (!s.disabled) s.checked = parent.checked; });
      if (typeof _planifierApercu === "function") _planifierApercu();
    });
    subs.forEach(function(s) {
      s.addEventListener("change", function() {
        const anyChecked = subs.some(function(x) { return x.checked; });
        parent.checked = anyChecked;
        if (typeof _planifierApercu === "function") _planifierApercu();
      });
    });
  }

  // ── Panneau « Personnaliser les libellés » ──────────
  // Par catégorie (icones, traces, zones, structures), les entrées résolues par LegendCustomization
  // (listEntries + listCustomEntries) : case de visibilité, libellé (placeholder = défaut), badge de source
  // (plan / moi / défaut), 🗑️ pour une entrée custom de session. Les icônes (~21) sont repliées dans un <details>.
  function _peuplerLegendCustom() {
    const cont = document.getElementById("kta-legend-custom-body");
    if (!cont) return;
    const LC = window.LegendCustomization;
    if (!LC) {
      cont.innerHTML = '<p style="font-size:12px; color:#8892a4; margin:0;">' +
        window.I18n.t("imgexport.legende.custom.moduleKo") + '</p>';
      return;
    }

    function _esc(s) { return window.ktaEsc(s); }

    function _sourceBadge(source) {
      if (source === "session") return '<span class="kta-legend-src kta-legend-src-session" title="' + window.I18n.t("imgexport.legende.custom.srcSession") + '">✏️</span>';
      if (source === "plan")    return '<span class="kta-legend-src kta-legend-src-plan"    title="' + window.I18n.t("imgexport.legende.custom.srcPlan") + '">📋</span>';
      return                          '<span class="kta-legend-src kta-legend-src-default" title="' + window.I18n.t("imgexport.legende.custom.srcDefaut") + '">·</span>';
    }

    function _renderEntryRow(e, isCustomEntry) {
      // Icône standard : pas d'iconUrl dans la définition, résolue par _iconePourTag pour la pastille.
      let iconUrl = e.iconUrl;
      if (!iconUrl && e.category === "icones" && typeof _iconePourTag === "function") {
        try { iconUrl = _iconePourTag(e.key); } catch(err) { iconUrl = null; }
      }
      // Pastille couleur / icône (geometry d'abord, cf. legendCustomization.js).
      let swatch = '';
      if (iconUrl) {
        swatch = '<img src="' + _esc(iconUrl) + '" alt="" style="width:16px;height:16px;object-fit:contain;flex:0 0 16px;">';
      } else if (e.geometry === "polyline" || (!e.geometry && e.lineColor && !e.fillColor)) {
        const col = e.lineColor || e.fillColor || "#888";
        swatch = '<span style="display:inline-block;width:16px;height:3px;background:' + _esc(col) + ';flex:0 0 16px;border-radius:1px;"></span>';
      } else if (e.geometry === "polygon" || e.fillColor) {
        const fill   = e.fillColor || e.lineColor || "#888";
        const border = e.borderColor || e.lineColor || fill;
        swatch = '<span style="display:inline-block;width:14px;height:14px;background:' + _esc(fill) + ';border:1px solid ' + _esc(border) + ';flex:0 0 14px;border-radius:2px;"></span>';
      } else {
        swatch = '<span style="display:inline-block;width:14px;height:14px;flex:0 0 14px;"></span>';
      }

      const dataAttrs = isCustomEntry
        ? 'data-custom-id="' + _esc(e.id) + '"'
        : 'data-cat="' + _esc(e.category) + '" data-key="' + _esc(e.key) + '"';

      const placeholder = isCustomEntry ? _esc(e.label) : _esc(e.defaultLabel);
      const value = (e.label === e.defaultLabel && !isCustomEntry) ? "" : _esc(e.label);

      const btnRm = isCustomEntry
        ? '<button type="button" class="kta-legend-rm" title="' + window.I18n.t("imgexport.legende.custom.supprimerEntree") + '" ' + dataAttrs + '>🗑️</button>'
        : '';

      return '<div class="kta-legend-row" ' + dataAttrs + '>' +
               '<label class="kta-legend-vis" title="' + window.I18n.t("imgexport.legende.custom.afficherEntree") + '">' +
                 '<input type="checkbox" class="kta-legend-vis-cb" ' +
                   (e.visible ? "checked" : "") + ' ' + dataAttrs + '>' +
               '</label>' +
               swatch +
               '<input type="text" class="kta-legend-label" placeholder="' + placeholder + '" ' +
                 'value="' + value + '" ' + dataAttrs + '>' +
               _sourceBadge(e.source) +
               btnRm +
             '</div>';
    }

    let html = "";
    LC.listCategories().forEach(function(cat) {
      const title = LC.categoryTitle(cat);
      const entries = LC.listEntries(cat);
      const customs = LC.listCustomEntries(cat);

      const isIcones = (cat === "icones");
      const sectionOpen = isIcones ? "" : "open";

      html += '<details class="kta-legend-cat" ' + sectionOpen + '>' +
                '<summary>' + _esc(title) +
                  ' <span class="kta-legend-count">(' + (entries.length + customs.length) + ')</span>' +
                '</summary>' +
                '<div class="kta-legend-cat-body">';

      entries.forEach(function(e) { html += _renderEntryRow(e, false); });
      customs.forEach(function(e) { html += _renderEntryRow(e, true); });

      html += '</div></details>';
    });

    cont.innerHTML = html;
  }

  // Dialogue « ajouter une entrée custom » : délégué à legendCustomization.js (pas de clone à corriger deux
  // fois) ; son z-index (100100) passe au-dessus de la modale Export (99999).
  function _ouvrirAddCustomEntryDialog() {
    if (window.LegendCustomization && typeof window.LegendCustomization.ouvrirAddDialog === "function") {
      window.LegendCustomization.ouvrirAddDialog(function() {
        _peuplerLegendCustom();
        _planifierApercu();
      });
    }
  }

  // Lit le panneau et persiste les overrides de session (setters LegendCustomization), à chaque change/input.
  function _appliquerLegendCustomFromUI(target) {
    const LC = window.LegendCustomization;
    if (!LC || !target) return;
    const cat = target.getAttribute("data-cat");
    const key = target.getAttribute("data-key");
    const customId = target.getAttribute("data-custom-id");

    if (target.classList.contains("kta-legend-vis-cb")) {
      if (customId) {
        LC.setCustomEntryVisibility(customId, target.checked);
      } else if (cat && key) {
        LC.setSessionVisibility(cat, key, target.checked);
      }
    } else if (target.classList.contains("kta-legend-label")) {
      if (customId) {
        LC.updateCustomEntry(customId, { label: target.value });
      } else if (cat && key) {
        LC.setSessionLabel(cat, key, target.value);
      }
    }
  }

  // ── Listeners ──────────
  function _attacherListeners(modal, modeInitial) {
    const btnRapide = document.getElementById("kta-export-mode-rapide");
    const btnAvance = document.getElementById("kta-export-mode-avance");
    const panRapide = document.getElementById("kta-export-rapide");
    const panAvance = document.getElementById("kta-export-avance");
    const btnClose  = document.getElementById("kta-export-close");
    const btnAnnul  = document.getElementById("kta-export-annuler");
    const btnGo     = document.getElementById("kta-export-go");

    function fermer() {
      if (_currentModal) _currentModal.remove();
      _currentModal = null;
      if (_previewTimer) { clearTimeout(_previewTimer); _previewTimer = null; }
    }

    btnClose.addEventListener("click", fermer);
    btnAnnul.addEventListener("click", fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

    btnRapide.addEventListener("click", function() {
      btnRapide.classList.add("active"); btnAvance.classList.remove("active");
      panRapide.style.display = "block"; panAvance.style.display = "none";
    });
    btnAvance.addEventListener("click", function() {
      btnAvance.classList.add("active"); btnRapide.classList.remove("active");
      panAvance.style.display = "block"; panRapide.style.display = "none";
      _planifierApercu();
    });

    const legOn = document.getElementById("kta-export-legende-on");
    const legOpts = document.getElementById("kta-export-legende-options");
    legOn.addEventListener("change", function() {
      legOpts.style.display = legOn.checked ? "block" : "none";
      _planifierApercu();
    });

    const radiosPos = modal.querySelectorAll('input[name="leg_pos"]');
    const customWrap = document.getElementById("kta-export-leg-custom");
    radiosPos.forEach(function(r) {
      r.addEventListener("change", function() {
        customWrap.style.display = (r.value === "custom" && r.checked) ? "block" : "none";
        _planifierApercu();
      });
    });

    const btnPick = document.getElementById("kta-export-leg-pick");
    btnPick.addEventListener("click", function() {
      const etat = _capturerEtat();
      _activerSelectionPosition(etat);
    });

    const xInput = document.getElementById("kta-export-leg-x");
    const yInput = document.getElementById("kta-export-leg-y");
    xInput.addEventListener("input", _planifierApercu);
    yInput.addEventListener("input", _planifierApercu);

    // Panneau des libellés : délégation sur le conteneur (lignes ajoutées par ➕) ; tout change recalcule l'aperçu.
    const legendCustomBody = document.getElementById("kta-legend-custom-body");
    if (legendCustomBody) {
      legendCustomBody.addEventListener("change", function(e) {
        if (e.target.matches(".kta-legend-vis-cb")) {
          _appliquerLegendCustomFromUI(e.target);
          _planifierApercu();
        }
      });
      legendCustomBody.addEventListener("input", function(e) {
        if (e.target.matches(".kta-legend-label")) {
          _appliquerLegendCustomFromUI(e.target);
          _planifierApercu();
        }
      });
      legendCustomBody.addEventListener("click", function(e) {
        if (e.target.matches(".kta-legend-rm")) {
          const id = e.target.getAttribute("data-custom-id");
          if (id && window.LegendCustomization) {
            window.LegendCustomization.removeCustomEntry(id);
            _peuplerLegendCustom();
            _planifierApercu();
          }
        }
      });
    }

    const btnLegAdd = document.getElementById("kta-legend-custom-add");
    if (btnLegAdd) {
      btnLegAdd.addEventListener("click", function() {
        _ouvrirAddCustomEntryDialog();
      });
    }

    const btnLegReset = document.getElementById("kta-legend-custom-reset");
    if (btnLegReset) {
      btnLegReset.addEventListener("click", async function() {
        if (!window.LegendCustomization) return;
        const ok = await window.ktaConfirm(window.I18n.t("imgexport.legende.custom.resetConfirm"));
        if (!ok) return;
        window.LegendCustomization.resetSession();
        _peuplerLegendCustom();
        _planifierApercu();
      });
    }

    // Fond personnalisé : bannière d'info + section « Calques d'image » grisée (sans effet sur le PNG).
    function _majBgState() {
      const bgVal = _radioVal("export_bg") || "image";
      const isCustom = (bgVal !== "image");
      const infoEl = document.getElementById("kta-export-bg-info");
      if (infoEl) infoEl.style.display = isCustom ? "block" : "none";
      const imgLayersWrap = document.getElementById("kta-export-image-layers");
      const imgSectionParent = imgLayersWrap?.parentElement;  // .kta-aide-section
      if (imgSectionParent) {
        imgSectionParent.style.opacity = isCustom ? "0.4" : "1";
        imgSectionParent.style.pointerEvents = isCustom ? "none" : "";
      }
      // Fond transparent → PNG forcé (JPEG sans alpha), JPEG/WebP désactivés.
      if (bgVal === "transparent") {
        const pngRadio = modal.querySelector('input[name="format"][value="png"]');
        if (pngRadio && !pngRadio.checked) {
          pngRadio.checked = true;
          pngRadio.dispatchEvent(new Event("change", { bubbles: true }));
        }
        modal.querySelectorAll('input[name="format"]').forEach(function(r) {
          if (r.value !== "png") {
            r.disabled = true;
            r.parentElement?.classList.add("kta-disabled");
          }
        });
      } else {
        modal.querySelectorAll('input[name="format"]').forEach(function(r) {
          r.disabled = false;
          r.parentElement?.classList.remove("kta-disabled");
        });
      }
    }
    modal.querySelectorAll('input[name="export_bg"]').forEach(function(r) {
      r.addEventListener("change", _majBgState);
    });
    _majBgState();  // état initial (en cas de restauration d'état)

    modal.querySelectorAll('input[name="resol"]').forEach(function(r) {
      r.addEventListener("change", _majInfoResolution);
    });
    _majInfoResolution();   // état initial (pré-sélection ou restauration)

    modal.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(function(el) {
      el.addEventListener("change", _planifierApercu);
    });

    btnGo.addEventListener("click", async function() {
      const modeRapideActif = btnRapide.classList.contains("active");
      btnGo.disabled = true;
      btnGo.textContent = window.I18n.t("imgexport.btn.generation");
      try {
        if (modeRapideActif) {
          if (window.telechargerPlan) {
            await window.telechargerPlan();
          } else {
            throw new Error("window.telechargerPlan introuvable (utils.js manquant ?)");
          }
        } else {
          await _exporterAvance();
        }
        fermer();
      } catch(err) {
        console.error("[Export] Erreur :", err);
        const erreurEl = document.getElementById("kta-export-erreur");
        if (erreurEl) {
          erreurEl.textContent = window.I18n.t("imgexport.erreur.prefixe", { msg: (err.message || err) });
          erreurEl.style.display = "block";
        }
        btnGo.disabled = false;
        btnGo.textContent = window.I18n.t("imgexport.btn.telecharger");
      }
    });
  }

  // ── Capture / restauration d'état (sélection 🎯 sur la carte puis réouverture) ──────────
  function _capturerEtat() {
    if (!_currentModal) return null;
    const etat = {
      mode: document.getElementById("kta-export-mode-avance").classList.contains("active") ? "avance" : "rapide",
      imageLayers: {},
      dataLayers:  {},
      ann:         {},
      legende:     null,
      format:      _radioVal("format"),
      resol:       _radioVal("resol"),
      bg:          _radioVal("export_bg") || "image"
    };
    document.querySelectorAll('[data-layer-type="image"]').forEach(function(cb) {
      etat.imageLayers[cb.dataset.layerId] = cb.checked;
    });
    document.querySelectorAll('[data-layer-type="data"]').forEach(function(cb) {
      etat.dataLayers[cb.dataset.layerId] = cb.checked;
    });
    ["points","roads","zones","structures","mesure","tracker"].forEach(function(k) {
      const cb = document.getElementById("ann_" + k);
      etat.ann[k] = cb ? cb.checked : false;
    });
    ["principal","secondaire","chemin"].forEach(function(t) {
      const cb = document.getElementById("ann_roads_" + t);
      etat.ann["roads_" + t] = cb ? cb.checked : true;
    });
    ["eau","remblais","effondrement","inaccessible"].forEach(function(t) {
      const cb = document.getElementById("ann_zones_" + t);
      etat.ann["zones_" + t] = cb ? cb.checked : true;
    });
    ["pilier-1","pilier-2","mur","front-1","front-2"].forEach(function(t) {
      const cb = document.getElementById("ann_structures_" + t);
      etat.ann["structures_" + t] = cb ? cb.checked : true;
    });
    const legOn = document.getElementById("kta-export-legende-on");
    if (legOn && legOn.checked) {
      etat.legende = {
        position: _radioVal("leg_pos"),
        customX: parseFloat(document.getElementById("kta-export-leg-x").value) || 0,
        customY: parseFloat(document.getElementById("kta-export-leg-y").value) || 0,
        style:   _radioVal("leg_style"),
        size:    _radioVal("leg_size"),
        contenu: {
          icones:     document.getElementById("leg_c_icones").checked,
          traces:     document.getElementById("leg_c_traces").checked,
          zones:      document.getElementById("leg_c_zones").checked,
          structures: (document.getElementById("leg_c_structures") || {}).checked === true,
          track:      document.getElementById("leg_c_track").checked,
          meta:       document.getElementById("leg_c_meta").checked
        }
      };
    }
    return etat;
  }

  // ── Résolution : garde-fou mémoire ──────────
  // Le canvas coûte 4 octets par pixel quel que soit le format : « Originale » sur un grand relevé alloue
  // des centaines de Mo sans rien dire.
  //   • Pré-sélection : la plus grande résolution sous SEUIL_PX_EXPORT.
  //   • Au-delà : possible, mais annoncé (mémoire estimée).
  //   • iPhone/iPad : Safari refuse tout canvas au-delà de IOS_MAX_PX_CANVAS (toBlob rend null) → options
  //     désactivées.
  //   • Si même ¼ dépasse le plafond, option « Max » (plus grand facteur sous le plafond, même formule que le
  //     PDF), cochée d'office. ⚠️ Jamais une option désactivée cochée : rien ne serait exportable.
  const SEUIL_PX_EXPORT   = 64 * 1024 * 1024;   // ≈ 256 Mo de canvas
  const IOS_MAX_PX_CANVAS = 16777216;           // 4096², limite WebKit iOS
  const RESOLS_EXPORT     = [1, 0.5, 0.25];

  function _pixelsExport(config, r) {
    return Math.round(config.plan.imageWidth * r) * Math.round(config.plan.imageHeight * r);
  }

  function _tailleExport(config, r) {
    return { w: Math.round(config.plan.imageWidth * r), h: Math.round(config.plan.imageHeight * r) };
  }

  // Plus grand facteur (au millième) dont le canvas tient sous `budget` pixels.
  function _facteurMaxSous(config, budget) {
    const W = config.plan.imageWidth, H = config.plan.imageHeight;
    let r = Math.floor(Math.sqrt(budget / (W * H)) * 1000) / 1000;
    while (r > 0.001 && _pixelsExport(config, r) > budget) r = Math.round((r - 0.001) * 1000) / 1000;
    return r;
  }

  function _preparerResolutions(config) {
    if (!config || !config.plan || !config.plan.imageWidth) return;
    const ios = (typeof window.ktaEstIos === "function") && window.ktaEstIos();
    const plafond = ios ? IOS_MAX_PX_CANVAS : SEUIL_PX_EXPORT;
    let choix = null;
    RESOLS_EXPORT.forEach(function(r) {
      const px = _pixelsExport(config, r);
      const el = document.querySelector('input[name="resol"][value="' + r + '"]');
      if (ios && px > IOS_MAX_PX_CANVAS && el) {
        el.disabled = true;
        el.checked = false;
        el.parentElement?.classList.add("kta-disabled");
      }
      if (px <= plafond && (choix === null || r > choix)) choix = r;
    });
    if (choix === null) {
      const r = _facteurMaxSous(config, plafond);
      const plusPetite = RESOLS_EXPORT[RESOLS_EXPORT.length - 1];
      const ancre = document.querySelector('input[name="resol"][value="' + plusPetite + '"]');
      const ligne = ancre && ancre.parentElement;
      if (ligne && r > 0) {
        const label = document.createElement("label");
        label.className = "kta-export-radio-row";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "resol";
        input.value = String(r);
        const span = document.createElement("span");
        span.textContent = window.I18n.t(ios ? "imgexport.format.resol.maxIos" : "imgexport.format.resol.max");
        label.appendChild(input);
        label.appendChild(span);
        ligne.parentNode.insertBefore(label, ligne.nextSibling);
        choix = r;
      }
    }
    if (choix !== null) _setRadio("resol", String(choix));
  }

  function _majInfoResolution() {
    const el = document.getElementById("kta-export-resol-info");
    if (!window.I18n || !window.I18n.t) return;
    const config = window.PLAN_CONFIG;
    if (!el || !config || !config.plan || !config.plan.imageWidth) return;
    const r  = parseFloat(_radioVal("resol") || "1");
    const taille = _tailleExport(config, r), w = taille.w, h = taille.h;
    const mo = Math.round(w * h * 4 / 1048576);
    let txt = window.I18n.t("imgexport.format.resol.info", { w: w, h: h, mo: mo.toLocaleString() });
    if (w * h > SEUIL_PX_EXPORT) txt += " " + window.I18n.t("imgexport.format.resol.lourd");
    const ios = (typeof window.ktaEstIos === "function") && window.ktaEstIos();
    if (ios && document.querySelector('input[name="resol"]:disabled')) {
      txt += " " + window.I18n.t("imgexport.format.resol.iosMax");
    }
    el.textContent = txt;
    el.style.color = (w * h > SEUIL_PX_EXPORT) ? "#f4c542" : "#8892a4";
  }

  function _restaurerEtat(etat) {
    if (!etat) return;
    Object.keys(etat.imageLayers || {}).forEach(function(id) {
      const cb = document.querySelector('[data-layer-id="' + id + '"][data-layer-type="image"]');
      if (cb) cb.checked = etat.imageLayers[id];
    });
    Object.keys(etat.dataLayers || {}).forEach(function(id) {
      const cb = document.querySelector('[data-layer-id="' + id + '"][data-layer-type="data"]');
      if (cb) cb.checked = etat.dataLayers[id];
    });
    Object.keys(etat.ann || {}).forEach(function(k) {
      const cb = document.getElementById("ann_" + k);
      if (cb && !cb.disabled) cb.checked = etat.ann[k];
    });
    if (etat.format) _setRadio("format", etat.format);
    if (etat.resol)  _setRadio("resol",  etat.resol);
    if (etat.bg)     _setRadio("export_bg", etat.bg);

    if (etat.legende) {
      document.getElementById("kta-export-legende-on").checked = true;
      document.getElementById("kta-export-legende-options").style.display = "block";
      _setRadio("leg_pos",   etat.legende.position);
      _setRadio("leg_style", etat.legende.style);
      _setRadio("leg_size",  etat.legende.size);
      document.getElementById("kta-export-leg-x").value = etat.legende.customX || "";
      document.getElementById("kta-export-leg-y").value = etat.legende.customY || "";
      if (etat.legende.position === "custom") {
        document.getElementById("kta-export-leg-custom").style.display = "block";
      }
      Object.keys(etat.legende.contenu || {}).forEach(function(k) {
        const cb = document.getElementById("leg_c_" + k);
        if (cb) cb.checked = etat.legende.contenu[k];
      });
    }
  }

  function _radioVal(name) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }
  // Une option désactivée n'est jamais cochée (restauration d'état comprise) : le choix en place est gardé.
  function _setRadio(name, val) {
    const el = document.querySelector('input[name="' + name + '"][value="' + val + '"]');
    if (el && !el.disabled) el.checked = true;
  }

  // ── Sélection de la position 🎯 sur la carte ──────────
  function _activerSelectionPosition(etatPrecedent) {
    if (_currentModal) { _currentModal.remove(); _currentModal = null; }

    // Floater comme le calibrage KMZ/GPX : Annuler (au doigt) = Échap, le choix est abandonné et la modale revient.
    const banner = document.createElement("div");
    banner.id = "kta-export-pick-banner";   // repéré par window._modeClicCarteActif (utils.js)
    banner.className = "kta-iti-floater";
    const icone = document.createElement("span");
    icone.className = "kta-iti-floater-icon";
    icone.textContent = "🎯";
    const msg = document.createElement("span");
    msg.className = "kta-iti-floater-msg";
    msg.textContent = window.I18n.t("imgexport.pick.floaterMsg");
    const btnAnnuler = document.createElement("button");
    btnAnnuler.type = "button";
    btnAnnuler.className = "kta-btn kta-btn-ghost";
    btnAnnuler.textContent = window.I18n.t("imgexport.btn.annuler");
    banner.appendChild(icone);
    banner.appendChild(msg);
    banner.appendChild(btnAnnuler);
    document.body.appendChild(banner);

    const mapEl = document.getElementById("map");
    const oldCursor = mapEl.style.cursor;
    mapEl.style.cursor = "crosshair";

    function nettoyer() {
      banner.remove();
      mapEl.style.cursor = oldCursor;
      window.map.off("click", onClic);
      document.removeEventListener("keydown", onEchap);
    }

    // 🩸 Le floater peut être retiré par un autre chemin (retour accueil, _ktaAnnulerModesClicCarte) : ses
    // écouteurs ne font alors plus rien, sinon Échap rouvrirait la modale d'export sur l'accueil.
    function orphelin() {
      if (banner.isConnected) return false;
      nettoyer();
      return true;
    }

    function onClic(e) {
      if (orphelin()) return;
      const x = Math.round(e.latlng.lng);
      const y = Math.round(APP_CONFIG.imageHeight - e.latlng.lat);
      nettoyer();

      etatPrecedent.legende = etatPrecedent.legende || {};
      etatPrecedent.legende.position = "custom";
      etatPrecedent.legende.customX = x;
      etatPrecedent.legende.customY = y;
      _afficherModal("avance", etatPrecedent);
    }

    function annuler() {
      nettoyer();
      _afficherModal("avance", etatPrecedent);
    }

    function onEchap(e) {
      if (e.key !== "Escape" || orphelin()) return;
      annuler();
    }

    btnAnnuler.addEventListener("click", annuler);

    window.map.on("click", onClic);
    document.addEventListener("keydown", onEchap);
  }

  // ── Aperçu (debounce) ──────────
  function _planifierApercu() {
    if (_previewTimer) clearTimeout(_previewTimer);
    _previewTimer = setTimeout(_genererApercu, 300);
  }

  async function _genererApercu() {
    if (_previewBusy) return;
    const canvas = document.getElementById("kta-export-preview");
    if (!canvas) return;
    _previewBusy = true;

    try {
      const opts = _lireOptions();
      const tmpCanvas = await _genererCanvasExport(opts, true);

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#1a1f2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const ratio = Math.min(canvas.width / tmpCanvas.width, canvas.height / tmpCanvas.height);
      const w = tmpCanvas.width  * ratio;
      const h = tmpCanvas.height * ratio;
      const dx = (canvas.width  - w) / 2;
      const dy = (canvas.height - h) / 2;
      ctx.drawImage(tmpCanvas, dx, dy, w, h);

      const info = document.getElementById("kta-export-preview-info");
      if (info) {
        const taille = _tailleExport(window.PLAN_CONFIG, opts.resol);
        info.textContent = opts.format.toUpperCase() + " — " + taille.w + "×" + taille.h + " px";
      }
    } catch(err) {
      console.warn("[Export] Aperçu erreur :", err);
    } finally {
      _previewBusy = false;
    }
  }

  // ── Lecture des options de la modale ──────────
  function _lireOptions() {
    const opts = {
      imageLayers: {},
      dataLayers:  {},
      ann:         {},
      legende:     null,
      format:      _radioVal("format") || "png",
      resol:       parseFloat(_radioVal("resol") || "1"),
      // Fond : "image" (défaut), "white", "black", "transparent" ; hors "image", calques d'image ignorés.
      bg:          _radioVal("export_bg") || "image"
    };
    document.querySelectorAll('[data-layer-type="image"]').forEach(function(cb) {
      opts.imageLayers[cb.dataset.layerId] = cb.checked;
    });
    document.querySelectorAll('[data-layer-type="data"]').forEach(function(cb) {
      opts.dataLayers[cb.dataset.layerId] = cb.checked;
    });
    ["points","roads","zones","structures","mesure","tracker"].forEach(function(k) {
      const cb = document.getElementById("ann_" + k);
      opts.ann[k] = cb ? cb.checked : false;
    });
    opts.ann.roadsTypes = {
      principal:  document.getElementById("ann_roads_principal")?.checked  ?? true,
      secondaire: document.getElementById("ann_roads_secondaire")?.checked ?? true,
      chemin:     document.getElementById("ann_roads_chemin")?.checked     ?? true
    };
    opts.ann.zonesTypes = {
      eau:          document.getElementById("ann_zones_eau")?.checked          ?? true,
      remblais:     document.getElementById("ann_zones_remblais")?.checked     ?? true,
      effondrement: document.getElementById("ann_zones_effondrement")?.checked ?? true,
      inaccessible: document.getElementById("ann_zones_inaccessible")?.checked ?? true
    };
    opts.ann.structuresTypes = {
      "pilier-1": document.getElementById("ann_structures_pilier-1")?.checked ?? true,
      "pilier-2": document.getElementById("ann_structures_pilier-2")?.checked ?? true,
      "mur":      document.getElementById("ann_structures_mur")?.checked      ?? true,
      "front-1":  document.getElementById("ann_structures_front-1")?.checked  ?? true,
      "front-2":  document.getElementById("ann_structures_front-2")?.checked  ?? true
    };
    // 🩸 Les sous-cases PERSONNALISÉES comptent aussi (sinon décocher un niveau importé n'a aucun effet). On
    // balaie le DOM : les listes sont construites à la volée.
    [["roads", opts.ann.roadsTypes], ["zones", opts.ann.zonesTypes],
     ["structures", opts.ann.structuresTypes]].forEach(function (p) {
      const prefixe = "ann_" + p[0] + "_cust-";
      document.querySelectorAll('[id^="' + prefixe + '"]').forEach(function (el) {
        p[1][el.id.replace("ann_" + p[0] + "_", "")] = !!el.checked;
      });
    });
    // Niveaux cochés : null = plan non multi-niveau (pas de filtre) ; Set = on n'exporte que level ∈ Set
    // (jonction si fromLevel OU toLevel ∈ Set).
    opts.ann.levels = null;
    if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
      const levelsCoches = new Set();
      document.querySelectorAll('#kta-export-levels input[type="checkbox"]').forEach(function(cb) {
        if (cb.checked) {
          const lvl = parseInt(cb.dataset.level, 10);
          if (Number.isInteger(lvl)) levelsCoches.add(lvl);
        }
      });
      opts.ann.levels = levelsCoches;
    }

    opts.ann.pointsTags = { tagsCoches: new Set(), untaggedCoche: false, tousActifs: true };
    if (_sessionPointsTags && _sessionPointsTags.length > 0) {
      const tagsCoches = new Set();
      let untaggedCoche = false;
      _sessionPointsTags.forEach(function(item) {
        const cb = document.getElementById("ann_points_tag_" + _slugTagId(item.tag));
        if (cb && cb.checked) {
          if (item.isUntagged) untaggedCoche = true;
          else tagsCoches.add(item.tag);
        }
      });
      opts.ann.pointsTags = { tagsCoches: tagsCoches, untaggedCoche: untaggedCoche, tousActifs: false };
    }
    const legOn = document.getElementById("kta-export-legende-on");
    if (legOn && legOn.checked) {
      opts.legende = {
        position: _radioVal("leg_pos") || "haut-gauche",
        customX:  parseFloat(document.getElementById("kta-export-leg-x").value) || 0,
        customY:  parseFloat(document.getElementById("kta-export-leg-y").value) || 0,
        style:    _radioVal("leg_style") || "opaque",
        size:     _radioVal("leg_size")  || "standard",
        contenu: {
          icones:     document.getElementById("leg_c_icones").checked,
          traces:     document.getElementById("leg_c_traces").checked,
          zones:      document.getElementById("leg_c_zones").checked,
          structures: (document.getElementById("leg_c_structures") || {}).checked === true,
          track:      document.getElementById("leg_c_track").checked,
          meta:       document.getElementById("leg_c_meta").checked
        }
      };
    }
    return opts;
  }

  // ── Export avancé : génération + téléchargement ──────────
  async function _exporterAvance() {
    const opts = _lireOptions();
    const canvas = await _genererCanvasExport(opts, false);

    const config = window.PLAN_CONFIG;
    const ext = opts.format === "jpeg" ? "jpg" : "png";
    const mime = opts.format === "jpeg" ? "image/jpeg" : "image/png";
    const quality = opts.format === "jpeg" ? 0.9 : undefined;

    function _tryEncode(targetMime, targetExt, targetQuality) {
      return new Promise(function(resolve, reject) {
        canvas.toBlob(function(blob) {
          if (!blob) { reject(new Error("toBlob null pour " + targetMime)); return; }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = (config.plan.name || "plan") + "_export." + targetExt;
          link.click();
          setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
          resolve();
        }, targetMime, targetQuality);
      });
    }

    // Format demandé, puis repli JPEG si c'était PNG, sinon sous-échantillonnage : l'encodage PNG d'un gros canvas
    // épuise la mémoire mobile et rend null (JPEG est plus tolérant).
    try {
      await _tryEncode(mime, ext, quality);
    } catch(errPrimary) {
      console.warn("[Export avancé] encodage " + mime + " échoué — fallback :", errPrimary.message);
      if (mime === "image/png") {
        try {
          await _tryEncode("image/jpeg", "jpg", 0.92);
          console.info("[Export avancé] fallback JPEG OK (plan trop grand pour PNG)");
        } catch(errJpg) {
          throw new Error(window.I18n.t("imgexport.erreur.tropGrand"));
        }
      } else {
        throw new Error(window.I18n.t("imgexport.erreur.tropGrandJpeg"));
      }
    }
  }

  // 🩸 getRoads() / getZones() / getStructures() ne rendent que les objets DESSINÉS À LA MAIN : sur un plan
  // IMPORTÉ (tout le relevé dans un calque), les compteurs seraient à 0 et les cases désactivées.
  // ⚠️ RÉSERVÉ AUX COMPTEURS. Le DESSIN ne cumule pas : la boucle des calques data peint déjà le contenu
  // embarqué calque par calque ; s'en servir des deux côtés dessinerait tout en double.
  function _sessionEtEmbarques(famille) {
    return (typeof window.ktaAnnotationsCompletes === "function")
      ? window.ktaAnnotationsCompletes(famille) : [];
  }

  // ── Génération du canvas : cœur de l'export ──────────
  async function _genererCanvasExport(opts, isApercu) {
    const config = window.PLAN_CONFIG;
    const baseW = config.plan.imageWidth;
    const baseH = config.plan.imageHeight;

    // Aperçu : petite taille.
    const scale = isApercu ? Math.min(800 / baseW, 1) : opts.resol;
    // `opts.region` ({ x, y, w, h }, unités plan) : seul ce rectangle est rendu, à l'échelle `scale` (cartes PDF
    // du Mode Secours). Fond depuis les tuiles V2 si le plan en a (ktaDessinerRegionTuiles), sinon sous-rectangle
    // de l'image de base ; le reste en coordonnées plan décalées par une translation.
    const region = (!isApercu && opts.region && opts.region.w > 0 && opts.region.h > 0) ? opts.region : null;
    const Wplan = Math.round(baseW * scale);
    const Hplan = Math.round(baseH * scale);
    const W = region ? Math.max(1, Math.round(region.w * scale)) : Wplan;
    const H = region ? Math.max(1, Math.round(region.h * scale)) : Hplan;

    // Tags réellement utilisés (boucles data + editor), passés à la légende.
    const tagsUtilises = new Set();

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    // alpha: true explicite : le PNG d'un fond transparent garde un canal alpha.
    const ctx = canvas.getContext("2d", { alpha: true });

    // Fond selon opts.bg :
    //   "image"       → aplat (couvert par l'image du plan ; fond propre si elle échoue)
    //   "white"/"black" → aplat, image de base et calques d'image ignorés
    //   "transparent" → rien, image de base et calques ignorés → PNG alpha
    const bg = opts.bg || "image";
    const skipBaseImage = (bg !== "image");
    if (bg === "image" || bg === "white") {
      // Fond « image » : sous un plan transparent, le fond choisi pour le plan, sinon blanc.
      ctx.fillStyle = (bg === "image" && typeof window.ktaCouleurFondPlan === "function" && window.ktaCouleurFondPlan()) || "#ffffff";
      ctx.fillRect(0, 0, W, H);
    } else if (bg === "black") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);
    }

    // Coordonnées plan × scale.
    const sc = function(v) { return v * scale; };

    // 🩸 Largeur des fronts selon le TERRAIN, pas `style.weight × scale` : sur un relevé dense, 10 px de plan
    // valent quelques mètres, les traits se touchent et la carte devient un aplat — quelle que soit la
    // résolution. Même loi et même fonction qu'à l'écran (structures.js) : `scale` joue le rôle de 2^zoom.
    // Repli sur `weight × scale` si structures.js n'est pas chargé, et sur un plan NON CALIBRÉ (sans px/m,
    // aucune largeur réelle n'est calculable).
    const _planCalibre = !!(window.APP_CONFIG && Number(window.APP_CONFIG.scale) > 0);
    function _largeurFrontExp(style) {
      if (!_planCalibre) return ((style && style.weight) || 5) * scale;
      return (typeof window.ktaLargeurFrontPourRatio === "function")
        ? window.ktaLargeurFrontPourRatio(scale)
        : ((style && style.weight) || 5) * scale;
    }
    // Tracés de galerie : même loi, minorée (cf. `wTrace` dans structures.js), pour les tracés EMBARQUÉS
    // seulement, comme à l'écran.
    function _largeurTraceExp(style) {
      if (!_planCalibre) return ((style && style.weight) || 5) * scale;
      return (typeof window.ktaLargeurTracePourRatio === "function")
        ? window.ktaLargeurTracePourRatio(scale)
        : ((style && style.weight) || 5) * scale;
    }

    // Filtre par niveaux CHOISIS dans la modale (opts.ann.levels), indépendant du filtre de la carte
    // (visibleLevels). null → tout passe ; Set → jonction visible si fromLevel OU toLevel ∈ Set ; objet sans
    // level = niveau 0.
    function _itemPasseLevels(item) {
      if (!opts.ann.levels) return true;
      if (item && item.type === "jonction") {
        const fromL = Number.isInteger(item.fromLevel) ? item.fromLevel : 0;
        const toL   = Number.isInteger(item.toLevel)   ? item.toLevel   : 0;
        return opts.ann.levels.has(fromL) || opts.ann.levels.has(toL);
      }
      const lvl = Number.isInteger(item && item.level) ? item.level : 0;
      return opts.ann.levels.has(lvl);
    }

    // ── Helpers ──
    function loadImage(src) {
      return new Promise(function(res, rej) {
        const img = new Image();
        img.onload = function() { res(img); };
        img.onerror = function() { rej(new Error(window.I18n.t("imgexport.err.imageLoad", { src: src }))); };
        img.src = src;
      });
    }

    // ── Image principale ── (ignorée si fond personnalisé)
    if (!skipBaseImage) {
      let fondFait = false;
      if (region && typeof window.ktaDessinerRegionTuiles === "function") {
        try { fondFait = !!(await window.ktaDessinerRegionTuiles(ctx, config, region, scale)).ok; }
        catch(e) { console.warn("[Export] région depuis les tuiles :", e); }
      }
      // Plan ENTIER d'un plan tuilé V2 : si TOUTES les tuiles du niveau utile sont sur l'appareil (archive du
      // plan, ou Cache Storage d'un plan serveur), le fond est composé depuis elles (pas de retéléchargement de
      // l'image de base). Même détail (z = 0 dès l'échelle 0,5, sans plafond de tuiles), bords calés au pixel.
      // Une tuile absente ou illisible → image de base peinte par-dessus.
      const _plein = { x: 0, y: 0, w: baseW, h: baseH };
      if (!region && config.plan && config.plan.tiledV2 && typeof window.ktaTuilesSurAppareil === "function"
          && typeof window.ktaDessinerRegionTuiles === "function") {
        try {
          const _o = { plafond: Infinity, aligner: true };
          if (await window.ktaTuilesSurAppareil(config, _plein, scale, _o)) {
            const r = await window.ktaDessinerRegionTuiles(ctx, config, _plein, scale, _o);
            fondFait = !!(r && r.ok && !r.manquantes);
            console.log("[Export] fond depuis les tuiles de l'appareil :", fondFait ? "oui" : "non", r);
          }
        } catch(e) { console.warn("[Export] fond depuis les tuiles :", e); }
      }
      if (!fondFait) {
        try {
          const baseImg = await loadImage(config.plan.baseImage);
          if (region) {
      // L'image de base peut être réduite (plan tuilé V1) : ratio mesuré.
            const rx = (baseImg.naturalWidth || baseW) / baseW, ry = (baseImg.naturalHeight || baseH) / baseH;
            ctx.drawImage(baseImg, region.x * rx, region.y * ry, region.w * rx, region.h * ry, 0, 0, W, H);
          } else {
            ctx.drawImage(baseImg, 0, 0, W, H);
          }
        } catch(e) { console.warn("[Export] base image :", e); }
      }
    }
    if (region) { ctx.save(); ctx.translate(-region.x * scale, -region.y * scale); }

    // ── Calques d'image cochés ── (ignorés si fond personnalisé)
    if (!skipBaseImage) {
      const layers = (config.imageLayers || []).slice().sort(function(a, b) {
        return (a.order || 0) - (b.order || 0);
      });
      for (const layerCfg of layers) {
        if (!opts.imageLayers[layerCfg.id]) continue;
        try {
          const img = await loadImage(layerCfg.file);
          // Calque calibré (2 ancres) : dessiné avec la transformation affine équivalente (ctx.transform), comme
          // sur la carte ; sinon étiré sur le plan principal.
          const calibrated = (layerCfg.calibration && window.ImageLayerCalibration
                              && typeof window.ImageLayerCalibration.drawCalibratedImageLayer === "function")
            ? window.ImageLayerCalibration.drawCalibratedImageLayer(ctx, img, layerCfg.calibration, Wplan, Hplan)
            : false;
          if (!calibrated) {
            ctx.drawImage(img, 0, 0, Wplan, Hplan);
          }
        } catch(e) { console.warn("[Export] calque image :", layerCfg.file, e); }
      }
    }

    // ── Icônes (cache) ──
    const iconCache = {};
    async function getIconUrl(p) {
      // Cascade : plan-config.icons[tag] → _iconMap[tag] → default.
      let url = (typeof window.getIconUrlForPoint === "function")
        ? window.getIconUrlForPoint(p)
        : (config.icons && config.icons.default) || null;
      if (!url) return null;
      if (!iconCache[url]) iconCache[url] = await loadImage(url);
      return iconCache[url];
    }

    function drawMarker(img, x, y, size) {
      if (!img) return;
      const half = size / 2;
      ctx.drawImage(img, sc(x) - half, sc(y) - half, size, size);
    }

    // ── Zones (avant les tracés) ──
    if (opts.ann.zones && window.getZones) {
      const zones = window.getZones();
      const ordre = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
      const filtreZ = opts.ann.zonesTypes || { eau: true, remblais: true, effondrement: true, inaccessible: true };
      // `inaccessible` en aplat rouge foncé (hachures SVG non portables au canvas) : repli de { flat: true }.
      function _styleZoneExp(type) { return _styleCanvas("zones", type, "remblais"); }
      const triees = [...zones]
        .filter(function(z) {
          // 🩸 Un type personnalisé a sa case : elle doit compter. `!== false` : une clé absente reste permissive.
          return filtreZ[z.type] !== false;
        })
        .filter(_itemPasseLevels)
        .sort(function(a, b) {
          return (ordre[a.type] ?? 99) - (ordre[b.type] ?? 99);
        });
      for (const z of triees) {
        if (!z.points || z.points.length < 3) continue;
        const s = _styleZoneExp(z.type);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sc(z.points[0].x), sc(z.points[0].y));
        for (let i = 1; i < z.points.length; i++) {
          ctx.lineTo(sc(z.points[i].x), sc(z.points[i].y));
        }
        ctx.closePath();
        ctx.fillStyle = s.fillColor;
        ctx.globalAlpha = s.fillOpacity;
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.weight * scale;
        ctx.globalAlpha = s.opacity;
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Structures (piliers, murs, fronts) ── calquées sur les zones, styles de structures.js >
    // STRUCTURE_STYLES ; polygone (piliers, mur) ou polyligne (fronts).
    if (opts.ann.structures && window.getStructures) {
      const structures = window.getStructures();
      // Fronts : polylignes épaisses sans contour (`weight` converti par `scale`).
      // Ordre Z : mur < pilier-2 < pilier-1 < front-2 < front-1, + tri par level en multi-niveau (comme
      // structures.js > renderStructures).
      const ordreS = { "mur": 0, "pilier-2": 1, "pilier-1": 2, "front-2": 3, "front-1": 4 };
      const filtreS = opts.ann.structuresTypes || {
        "pilier-1": true, "pilier-2": true, "mur": true,
        "front-1":  true, "front-2": true
      };
      // Custom : la géométrie déclarée tranche (polyligne → trait épais, polygone → contour noir), via le gabarit
      // « structures » du résolveur.
      function _styleStructExp(type) { return _styleCanvas("structures", type, "mur"); }
      const _multiLevelOnExp = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
      const triees = [...structures]
        .filter(function(s) {
          return filtreS[s.type] !== false;
        })
        .filter(_itemPasseLevels)
        .sort(function(a, b) {
          if (_multiLevelOnExp) {
            const la = Number.isInteger(a.level) ? a.level : 0;
            const lb = Number.isInteger(b.level) ? b.level : 0;
            if (la !== lb) return la - lb;
          }
          return (ordreS[a.type] ?? 99) - (ordreS[b.type] ?? 99);
        });
      for (const st of triees) {
        const s = _styleStructExp(st.type);
        const isPolyline = !!s.isPolyline;
        const minPts = isPolyline ? 2 : 3;
        if (!st.points || st.points.length < minPts) continue;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sc(st.points[0].x), sc(st.points[0].y));
        for (let i = 1; i < st.points.length; i++) {
          ctx.lineTo(sc(st.points[i].x), sc(st.points[i].y));
        }
        if (isPolyline) {
          // Front : polyligne pleine colorée, bouts arrondis, sans fond ni contour.
          ctx.strokeStyle = s.color;
          ctx.lineWidth = _largeurFrontExp(s);
          ctx.globalAlpha = s.opacity;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
        } else {
          // Pilier / mur : polygone fermé, fond + contour noir.
          ctx.closePath();
          ctx.fillStyle = s.fillColor;
          ctx.globalAlpha = s.fillOpacity;
          ctx.fill();
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.weight * scale;
          ctx.globalAlpha = s.opacity;
          ctx.lineJoin = "round";
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ── Helpers polygones / polylignes ──
    function _drawPolygon(points, style) {
      if (!points || points.length < 3) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sc(points[0].x), sc(points[0].y));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(sc(points[i].x), sc(points[i].y));
      }
      ctx.closePath();
      ctx.fillStyle = style.fillColor;
      ctx.globalAlpha = style.fillOpacity;
      ctx.fill();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.weight * scale;
      ctx.globalAlpha = style.opacity;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();
    }
    function _drawPolyline(points, style, largeurPx) {
      if (!points || points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = (largeurPx > 0) ? largeurPx : (style.weight || 5) * scale;
      ctx.globalAlpha = style.opacity ?? 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sc(points[0].x), sc(points[0].y));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(sc(points[i].x), sc(points[i].y));
      }
      ctx.stroke();
      ctx.restore();
    }

    // Pas de table ZS_EMBED / RS_EMBED recopiée : le résolveur connaît TOUS les types (intégrés et custom).

    // Routes (embarquées + éditables) collectées pour les cercles d'intersection, dessinés à la fin.
    const allRoadsForIntersect = [];
    // Marqueurs DIFFÉRÉS : collectés pendant la boucle des calques, dessinés APRÈS routes et cercles
    // (ordre ZONE → TRAIT → CERCLE → ICÔNE).
    const deferredMarkers = []; // [{p, layerId}]

    // ── Calques data (marqueurs + roads/zones embarqués) ──
    const _diagAdv = { layersVisited: 0, layersSkipped: 0, embZones: 0, embRoads: 0, embStructs: 0, embPoints: 0, fetchFails: 0 };
    const _debugAdv = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);
    for (const layerCfg of (config.dataLayers || [])) {
      const cocheModale = !!opts.dataLayers[layerCfg.id];
      if (_debugAdv) console.log("[Export avancé] layer", layerCfg.id, "→ coche modale:", cocheModale);
      if (!cocheModale) { _diagAdv.layersSkipped++; continue; }
      _diagAdv.layersVisited++;

      let pts = [];
      let embeddedRoads = [];
      let embeddedZones = [];
      // Structures d'un calque de données (structure.json ou inline) : lues aussi pour l'export canvas.
      let embeddedStructures = [];

      if (layerCfg.id === "editor") {
        if (opts.ann.points && window.getEditorPoints) pts = window.getEditorPoints();
      } else {
        try {
          const r = await fetch(layerCfg.file);
          const j = await r.json();
          pts = j.data || [];
          embeddedRoads = Array.isArray(j.roads) ? j.roads : [];
          embeddedZones = Array.isArray(j.zones) ? j.zones : [];
          embeddedStructures = Array.isArray(j.structures) ? j.structures : [];
          if (_debugAdv) console.log("[Export avancé] fetch", layerCfg.id, "→ pts:", pts.length, "roads:", embeddedRoads.length, "zones:", embeddedZones.length, "structures:", embeddedStructures.length);
        } catch(e) {
          _diagAdv.fetchFails++;
          console.warn("[Export avancé] fetch échoué pour", layerCfg.id, "→", layerCfg.file, e);
        }
      }

      // 🩸 UN PLAN IMPORTÉ N'A PAS DE FICHIER À ALLER CHERCHER : le fetch suppose que `layerCfg.file` est servi
      // par le site, faux pour un plan d'import SIG (son `sig.json` vit en IndexedDB). Le 404 silencieux faisait
      // sortir le fond de plan SEUL. Le contenu est en mémoire (`ajouterPointsDepuisJSON` l'a rangé dans les
      // registres) : on le relit, filtré sur l'id du calque. Repli seulement : un fichier existant fait foi.
      if (layerCfg.id !== "editor"
          && !embeddedRoads.length && !embeddedZones.length && !embeddedStructures.length) {
        const duCalque = function (arr) {
          return (arr || []).filter(function (o) {
            // `layerId` null (registre ancien, plan à calque unique) : gardé plutôt que tout perdre.
            return !o.layerId || o.layerId === layerCfg.id;
          });
        };
        embeddedRoads = duCalque(typeof window.getAllEmbeddedRoads === "function"
          ? window.getAllEmbeddedRoads() : []);
        embeddedZones = duCalque(typeof window.getAllEmbeddedZones === "function"
          ? window.getAllEmbeddedZones() : []);
        embeddedStructures = duCalque(typeof window.getAllEmbeddedStructures === "function"
          ? window.getAllEmbeddedStructures() : []);
        if (!pts.length) {
          pts = duCalque(typeof window.getAllEmbeddedPoints === "function"
            ? window.getAllEmbeddedPoints() : []);
        }
        if (_debugAdv) console.log("[Export avancé] repli registre", layerCfg.id,
          "→ roads:", embeddedRoads.length, "zones:", embeddedZones.length,
          "structures:", embeddedStructures.length);
      }

      // Points filtrés par les tags cochés du calque (mode rapide : tout).
      if (typeof _filtrerPointsParTagsCalque === "function") {
        pts = _filtrerPointsParTagsCalque(pts, layerCfg.id);
      }

      // Calque "editor" : intersection avec le filtre des tags d'annotations.
      if (layerCfg.id === "editor" && opts.ann.pointsTags && !opts.ann.pointsTags.tousActifs) {
        const sel = opts.ann.pointsTags;
        pts = pts.filter(function(p) {
          const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
          if (tags.length === 0) return sel.untaggedCoche;
          return tags.some(function(t) { return sel.tagsCoches.has(String(t)); });
        });
      }

      let drawnRoads = embeddedRoads;
      if (typeof _lireRoadTypesCochesCalque === "function") {
        const rs = _lireRoadTypesCochesCalque(layerCfg.id);
        if (!rs.tousActifs) {
          drawnRoads = embeddedRoads.filter(function(r) { return rs.types.has(r.type); });
        }
      }

      let drawnZones = embeddedZones;
      if (typeof _lireZoneTypesCochesCalque === "function") {
        const zs = _lireZoneTypesCochesCalque(layerCfg.id);
        if (_debugAdv && embeddedZones.length > 0) {
          console.log("[Export avancé] zones filter for", layerCfg.id,
            "→ embedded:", embeddedZones.length,
            "tousActifs:", zs.tousActifs,
            "types:", Array.from(zs.types));
        }
        if (!zs.tousActifs) {
          drawnZones = embeddedZones.filter(function(z) {
            return !zs.connus.has(z.type) || zs.types.has(z.type);
          });
        }
      }

      // Zones embarquées en arrière-plan (eau → remblais → effondrement → inaccessible), filtre de niveaux.
      const ordreZ = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
      [...drawnZones].sort(function(a, b) {
        return (ordreZ[a.type] ?? 99) - (ordreZ[b.type] ?? 99);
      }).forEach(function(z) {
        if (!_itemPasseLevels(z)) return;
        _drawPolygon(z.points || [], _styleCanvas("zones", z.type, "remblais"));
        _diagAdv.embZones++;
      });

      // Structures embarquées : couleurs et ordre Z comme les structures de session (mur < pilier-2 < pilier-1 <
      // front-2 < front-1). Mêmes filtres (opts.ann.structures + structuresTypes) : la modale n'a qu'un groupe.
      if (opts.ann.structures && embeddedStructures.length > 0) {
        const ordreS_E = { "mur": 0, "pilier-2": 1, "pilier-1": 2, "front-2": 3, "front-1": 4 };
        const filtreS_E = opts.ann.structuresTypes || {
          "pilier-1": true, "pilier-2": true, "mur": true,
          "front-1":  true, "front-2": true
        };
        const _mlOnEmbS = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
        const trieesEmb = [...embeddedStructures]
          .filter(function(s) { return filtreS_E[s.type] !== false; })
          .filter(_itemPasseLevels)
          .sort(function(a, b) {
            if (_mlOnEmbS) {
              const la = Number.isInteger(a.level) ? a.level : 0;
              const lb = Number.isInteger(b.level) ? b.level : 0;
              if (la !== lb) return la - lb;
            }
            return (ordreS_E[a.type] ?? 99) - (ordreS_E[b.type] ?? 99);
          });
        for (const st of trieesEmb) {
          const s = _styleCanvas("structures", st.type, "mur");
          const isPolyline = !!s.isPolyline;
          const minPts = isPolyline ? 2 : 3;
          if (!st.points || st.points.length < minPts) continue;
          if (isPolyline) {
            _drawPolyline(st.points, s, _largeurFrontExp(s));
          } else {
            _drawPolygon(st.points, s);
          }
          if (typeof _diagAdv.embStructs !== "number") _diagAdv.embStructs = 0;
          _diagAdv.embStructs++;
        }
      }

      // Routes embarquées : filtre de niveaux, tri Z par level ascendant en multi-niveau.
      let drawnRoadsSorted = drawnRoads;
      const _mlOnExpAdv = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
      if (_mlOnExpAdv) {
        const T_ORDER = { chemin: 0, secondaire: 1, principal: 2 };
        drawnRoadsSorted = [...drawnRoads].sort(function(a, b) {
          const la = Number.isInteger(a.level) ? a.level : 0;
          const lb = Number.isInteger(b.level) ? b.level : 0;
          if (la !== lb) return la - lb;
          return (T_ORDER[a.type] != null ? T_ORDER[a.type] : 99) -
                 (T_ORDER[b.type] != null ? T_ORDER[b.type] : 99);
        });
      }
      drawnRoadsSorted.forEach(function(r) {
        if (!_itemPasseLevels(r)) return;
        const _sr = _styleCanvas("traces", r.type) || { color: "#ffffff", weight: 5, opacity: 1 };
        _drawPolyline(r.points || [], _sr, _largeurTraceExp(_sr));
        if (r.points && r.points.length >= 2) allRoadsForIntersect.push(r);
        _diagAdv.embRoads++;
      });

      // Marqueurs DIFFÉRÉS (filtrés par tags et niveaux), au-dessus des routes et cercles ; tags collectés ici
      // pour la légende.
      for (const p of pts) {
        if (!_itemPasseLevels(p)) continue;
        deferredMarkers.push(p);
        _diagAdv.embPoints++;
        if (Array.isArray(p.tags) && p.tags.length > 0) {
          p.tags.forEach(function(t) {
            if (t && String(t).trim()) tagsUtilises.add(String(t));
          });
        } else {
          tagsUtilises.add("default");
        }
      }
    }
    if (_debugAdv) console.log("[Export avancé] résumé layer loop :", _diagAdv);

    // ── Routes ──
    // ⚠️ Type "itinerary" exclu : c'est un overlay calculé par Pathfinder. Sinon son repli "white" effacerait
    // les segments du réseau sous l'itinéraire.
    if (opts.ann.roads && window.getRoads) {
      const roads = window.getRoads().filter(function(r) { return r.type !== "itinerary"; });
      // Tri Z par level ascendant en multi-niveau (comme road.js > renderRoads).
      const _mlOnExp = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
      if (_mlOnExp) {
        const T_ORDER = { chemin: 0, secondaire: 1, principal: 2, jonction: 3 };
        roads.sort(function(a, b) {
          const la = (a.type === "jonction")
            ? Math.max(Number.isInteger(a.fromLevel) ? a.fromLevel : 0,
                       Number.isInteger(a.toLevel)   ? a.toLevel   : 0)
            : (Number.isInteger(a.level) ? a.level : 0);
          const lb = (b.type === "jonction")
            ? Math.max(Number.isInteger(b.fromLevel) ? b.fromLevel : 0,
                       Number.isInteger(b.toLevel)   ? b.toLevel   : 0)
            : (Number.isInteger(b.level) ? b.level : 0);
          if (la !== lb) return la - lb;
          return (T_ORDER[a.type] != null ? T_ORDER[a.type] : 99) -
                 (T_ORDER[b.type] != null ? T_ORDER[b.type] : 99);
        });
      }
      // Jonction en magenta PLEIN (pas de dashArray en canvas), extrémités en ronds blanc+magenta plus bas comme
      // sur la carte. Repli "white" pour un type inconnu (custom supprimé) : un trait visible plutôt qu'absent.
      function _styleRoadExp(type) {
        return _styleCanvas("traces", type) || { color: "white", weight: 5 };
      }
      const filtreR = opts.ann.roadsTypes || { principal: true, secondaire: true, chemin: true };
      for (const r of roads) {
        if (!r.points || r.points.length === 0) continue;
        // Le filtre s'applique aussi aux types personnalisés (ils ont leur case). Les jonctions restent hors
        // filtre (non listées dans la modale).
        if (r.type !== "jonction" && filtreR[r.type] === false) continue;
        if (!_itemPasseLevels(r)) continue;
        const s = _styleRoadExp(r.type);
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.weight * scale;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sc(r.points[0].x), sc(r.points[0].y));
        for (let i = 1; i < r.points.length; i++) {
          ctx.lineTo(sc(r.points[i].x), sc(r.points[i].y));
        }
        ctx.stroke();
        ctx.restore();
        // Ronds aux extrémités des jonctions.
        if (r.type === "jonction" && r.points.length >= 2) {
          const endpts = [r.points[0], r.points[r.points.length - 1]];
          endpts.forEach(function(pt) {
            ctx.save();
            ctx.fillStyle   = "#ffffff";
            ctx.strokeStyle = RS.jonction.color;
            ctx.lineWidth   = 3 * scale;
            ctx.beginPath();
            ctx.arc(sc(pt.x), sc(pt.y), 7 * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          });
          // Jonctions exclues des intersections (ponts entre niveaux).
          continue;
        }
        if (r.points.length >= 2) allRoadsForIntersect.push(r);
      }
    }

    // ── Cercles d'intersection (après les routes, avant les icônes) ──
    if (typeof window.computeRoadIntersections === "function" && allRoadsForIntersect.length >= 2) {
      const baseRadius = window.ROAD_INTERSECTION_RADIUS || 8;
      const intersections = window.computeRoadIntersections(allRoadsForIntersect);
      intersections.forEach(function(it) {
        ctx.save();
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(sc(it.point.x), sc(it.point.y), baseRadius * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // ── Marqueurs différés (icônes), en dernier : ZONE → TRAIT → CERCLE → ICÔNE ──
    for (const p of deferredMarkers) {
      const img = await getIconUrl(p);
      drawMarker(img, p.x, p.y, 50 * scale);
    }

    // ── Mesure (distance + surface) ──
    if (opts.ann.mesure && window.getMeasurePoints) {
      const m = window.getMeasurePoints();
      if (m && m.length > 0) {
        ctx.save();
        ctx.strokeStyle = "red";
        ctx.lineWidth = 3 * scale;
        ctx.beginPath();
        ctx.moveTo(sc(m[0].x), sc(m[0].y));
        for (let i = 1; i < m.length; i++) {
          ctx.lineTo(sc(m[i].x), sc(m[i].y));
        }
        ctx.stroke();
        ctx.restore();
      }
      // Polygone de surface : même couleur que la distance, fond semi-transparent (comme à l'écran).
      if (window.getMeasurePointsSurface) {
        const ms = window.getMeasurePointsSurface();
        if (ms && ms.length >= 3) {
          ctx.save();
          ctx.strokeStyle = "red";
          ctx.fillStyle   = "rgba(255, 0, 0, 0.18)";
          ctx.lineWidth   = 3 * scale;
          ctx.beginPath();
          ctx.moveTo(sc(ms[0].x), sc(ms[0].y));
          for (let i = 1; i < ms.length; i++) {
            ctx.lineTo(sc(ms[i].x), sc(ms[i].y));
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // ── Tracker (chemin parcouru + position) ──
    if (opts.ann.tracker) {
      if (window.getTrackingPath) {
        const path = window.getTrackingPath();
        if (path && path.length > 1) {
          ctx.save();
          ctx.strokeStyle = "#3388ff";
          ctx.lineWidth = 3 * scale;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(sc(path[0].x), sc(path[0].y));
          for (let i = 1; i < path.length; i++) {
            ctx.lineTo(sc(path[i].x), sc(path[i].y));
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      if (window.getTrackingPosition) {
        const t = window.getTrackingPosition();
        if (t && typeof t.x === "number" && typeof t.y === "number") {
          try {
            const img = await loadImage(config.icons.track);
            drawMarker(img, t.x, t.y, 50 * scale);
          } catch(e) {}
        }
      }
    }

    // ── Légende intégrée ──
    if (region) ctx.restore();
    if (opts.legende) {
      await _dessinerLegende(ctx, opts.legende, W, H, scale, iconCache, tagsUtilises);
    }

    return canvas;
  }

  // ── Dessin de la légende intégrée ──────────
  async function _dessinerLegende(ctx, leg, canvasW, canvasH, scale, iconCache, tagsUtilises) {
    const config = window.PLAN_CONFIG;

    const TAILLES = {
      compact:  { font: 11, line: 18, icon: 16, padding: 6,  titleFont: 13 },
      standard: { font: 14, line: 24, icon: 22, padding: 10, titleFont: 17 },
      large:    { font: 18, line: 32, icon: 30, padding: 14, titleFont: 22 }
    };
    const T = TAILLES[leg.size] || TAILLES.standard;
    const fs = T.font * scale;
    const lh = T.line * scale;
    const ic = T.icon * scale;
    const pad = T.padding * scale;
    const tfs = T.titleFont * scale;

    // Thème sombre, cohérent avec les modales.
    const STYLES = {
      opaque:    {
        bg:           "rgba(26,31,46,1)",         // #1a1f2e (fond modale)
        border:       "rgba(140,180,255,0.5)",    // bleu vif
        borderW:      2,
        text:         "#e8eaf0",                  // texte clair
        titreSection: "#8cb4ff",                  // bleu vif
        titrePrincipal: "#e8eaf0",
        meta:         "#8892a4"                   // gris bleuté discret
      },
      semi:      {
        bg:           "rgba(26,31,46,0.78)",
        border:       "rgba(140,180,255,0.4)",
        borderW:      1,
        text:         "#e8eaf0",
        titreSection: "#8cb4ff",
        titrePrincipal: "#e8eaf0",
        meta:         "#8892a4"
      },
      filigrane: {
        bg:           "rgba(26,31,46,0.45)",
        border:       "rgba(140,180,255,0.25)",
        borderW:      1,
        text:         "#c0c8d8",
        titreSection: "#8cb4ff",
        titrePrincipal: "#c0c8d8",
        meta:         "#7a8298"
      },
      // Style impression : fond blanc opaque, texte foncé, accent bleu saturé (PDF, papier).
      print:     {
        bg:           "rgba(255,255,255,1)",      // blanc pur
        border:       "rgba(30,58,138,0.55)",     // bleu marine #1e3a8a opacité
        borderW:      1.5,
        text:         "#1a1f2e",                  // quasi-noir charte
        titreSection: "#1e3a8a",                  // bleu marine saturé
        titrePrincipal: "#0a0d18",                // noir profond
        meta:         "#555c6e"                   // gris foncé pour les métas
      }
    };
    const S = STYLES[leg.style] || STYLES.opaque;

    const entrees = [];

    // Métadonnées rendues à part (pas de section « Plan »).
    let metaLignes = [];
    if (leg.contenu.meta && config.plan) {
      const titre  = (config.plan.name || window.I18n.t("imgexport.legende.metaPlanDefaut"));
      const ver    = config.plan.version ? " " + config.plan.version : "";
      const auteur = config.plan.author  ? " — " + config.plan.author : "";
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const aaaa = d.getFullYear();
      metaLignes = [titre + ver + auteur, dd + "/" + mm + "/" + aaaa];
    }

    // Libellés des 4 catégories par window.LegendCustomization (cascade session > plan > défaut, entrées
    // renommées ou masquées dans la modale), avec repli si le module manque.
    const LC = window.LegendCustomization;

    // Icônes en 3 sous-groupes (comme la légende d'aide).
    if (leg.contenu.icones && config.icons) {
      const exclu = ["default"];
      if (!leg.contenu.track) exclu.push("track");

      const GROUPES_ICONES = [
        { titre: window.I18n.t("imgexport.legGroupe.puits"),        cles: ["pa", "pb", "pc", "pe", "ps"] },
        { titre: window.I18n.t("imgexport.legGroupe.acces"),        cles: ["peo", "pef", "eso", "esf", "cao", "caf"] },
        { titre: window.I18n.t("imgexport.legGroupe.signaletique"), cles: ["salle", "chatiere", "passage", "danger", "info", "elec", "epure", "vehicule", "plaque", "portail"] },
        // Catégorie Secours (Vue OSM × Mode Secours).
        { titre: window.I18n.t("imgexport.legGroupe.secours"),      cles: ["entree_plan"] }
      ];
      const clesGroupees = new Set(GROUPES_ICONES.flatMap(function(g) { return g.cles; }));

    // Tags du plan-config + tags intégrés (_iconMap), pour ne rien manquer.
      const tagsConnus = new Set();
      Object.keys(config.icons || {}).forEach(function(t) { tagsConnus.add(t); });
      Object.keys(window._iconMap || {}).forEach(function(t) { tagsConnus.add(t); });

      // Filtre par usage réel : seulement les tags présents sur le plan exporté (tagsUtilises absent en aperçu
      // rapide → pas de filtre).
      const filtreUsage = tagsUtilises && tagsUtilises.size >= 0;

      function _iconLabel(tag) {
        if (LC) return LC.getLabel("icones", tag);
        return tag;
      }
      function _iconVisible(tag) {
        if (LC) return LC.isVisible("icones", tag);
        return true;
      }

      GROUPES_ICONES.forEach(function(groupe) {
        const lignes = [];
        groupe.cles.forEach(function(tag) {
          if (exclu.includes(tag)) return;
          if (!tagsConnus.has(tag)) return;
          if (filtreUsage && !tagsUtilises.has(tag)) return;  // ← filtre par usage réel
          if (!_iconVisible(tag)) return;                      // show/hide
          const url = _iconePourTag(tag);
          if (!url) return;
          lignes.push({ label: _iconLabel(tag), iconUrl: url });
        });
        if (lignes.length > 0) entrees.push({ section: groupe.titre, lignes: lignes });
      });

      // Tags custom hors des 3 groupes → « Autres », AVEC leur icône (custom ou défaut) s'ils sont utilisés.
      const lignesAutres = [];
      // Candidats : tagsConnus + tagsUtilises (tags créés en session, absents de plan-config et de _iconMap).
      const candidatsAutres = new Set(tagsConnus);
      if (tagsUtilises) tagsUtilises.forEach(function(t) { candidatsAutres.add(t); });

      candidatsAutres.forEach(function(tag) {
        if (exclu.includes(tag)) return;
        if (clesGroupees.has(tag)) return;
        if (filtreUsage && !tagsUtilises.has(tag)) return;  // ← filtre par usage réel
        if (!_iconVisible(tag)) return;
        let url = _iconePourTag(tag);
        if (!url) {
          // Tag custom sans icône : icône par défaut (divIcon possible → _kta_iconUrl avant options.iconUrl).
          const def = window._iconMap && window._iconMap.default;
          url = (config.icons && config.icons.default)
             || (def && (def._kta_iconUrl || (def.options && def.options.iconUrl)))
             || null;
        }
        if (!url) return;
        lignesAutres.push({ label: _iconLabel(tag), iconUrl: url });
      });
      if (lignesAutres.length > 0) entrees.push({ section: window.I18n.t("imgexport.legGroupe.autres"), lignes: lignesAutres });

      // Entrées custom « icones » (plan + session), si visibles et pourvues d'une iconUrl.
      if (LC) {
        const customsIcones = LC.listCustomEntries("icones")
          .filter(function(e) { return e.visible && e.iconUrl; })
          .map(function(e) { return { label: e.label, iconUrl: e.iconUrl }; });
        if (customsIcones.length > 0) {
          entrees.push({ section: window.I18n.t("imgexport.legGroupe.customIcones"), lignes: customsIcones });
        }
      }
    }

    // Tracés. « Jonction interniveau » (magenta) seulement sur un plan multi-niveau.
    if (leg.contenu.traces) {
      const mlvl = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
      const lignes = LC
        ? LC.listEntries("traces")
            .filter(function(e) { return e.visible && (mlvl || e.key !== "jonction"); })
            .map(function(e) { return { label: e.label, lineColor: e.lineColor }; })
        : [
            { label: window.I18n.t("imgexport.legLabel.routePrincipale"), lineColor: "#00ff00" },
            { label: window.I18n.t("imgexport.legLabel.routeSecondaire"), lineColor: "#b000ff" },
            { label: window.I18n.t("imgexport.legLabel.chemin"),          lineColor: "#ffff00" },
            { label: window.I18n.t("imgexport.legLabel.jonction"),        lineColor: "#ff4ecb" }
          ].filter(function(e, i) { return mlvl || i !== 3; });
      if (LC) {
        LC.listCustomEntries("traces")
          .filter(function(e) { return e.visible && (e.lineColor || e.fillColor); })
          .forEach(function(e) {
            lignes.push({ label: e.label, lineColor: e.lineColor || e.fillColor });
          });
      }
      if (lignes.length > 0) entrees.push({ section: window.I18n.t("imgexport.legSection.traces"), lignes: lignes });
    }

    // Zones, dont « Inaccessible » (aplat rouge foncé, pas de hachures en canvas).
    if (leg.contenu.zones) {
      const lignes = LC
        ? LC.listEntries("zones")
            .filter(function(e) { return e.visible; })
            .map(function(e) { return { label: e.label, fillColor: e.fillColor, borderColor: e.borderColor }; })
        : [
            { label: window.I18n.t("imgexport.legLabel.eau"),          fillColor: "#3aa9e8", borderColor: "#0066aa" },
            { label: window.I18n.t("imgexport.legLabel.remblais"),     fillColor: "#5a5a68", borderColor: "#3a3a44" },
            { label: window.I18n.t("imgexport.legLabel.effondrement"), fillColor: "#ff3333", borderColor: "#cc0000" },
            { label: window.I18n.t("imgexport.legLabel.inaccessible"), fillColor: "#7a0000", borderColor: "#5a0a0a" }
          ];
      if (LC) {
        LC.listCustomEntries("zones")
          .filter(function(e) { return e.visible && e.fillColor; })
          .forEach(function(e) {
            lignes.push({ label: e.label, fillColor: e.fillColor, borderColor: e.borderColor || e.fillColor });
          });
      }
      if (lignes.length > 0) entrees.push({ section: window.I18n.t("imgexport.legSection.zones"), lignes: lignes });
    }

    // Structures : polygones (piliers, mur) fond + contour noir ; polylignes (fronts) en lineColor. Front-1 =
    // couleur du pilier-1, front-2 = pilier-2.
    if (leg.contenu.structures) {
      const lignes = LC
        ? LC.listEntries("structures")
            .filter(function(e) { return e.visible; })
            .map(function(e) {
              // Polyligne (front-X : lineColor) ou polygone (pilier-X / mur : fillColor + borderColor).
              if (e.lineColor) return { label: e.label, lineColor: e.lineColor };
              return { label: e.label, fillColor: e.fillColor, borderColor: e.borderColor };
            })
        : [
            { label: window.I18n.t("imgexport.legLabel.pilier1"), fillColor: "#f4c542", borderColor: "#000000" },
            { label: window.I18n.t("imgexport.legLabel.pilier2"), fillColor: "#ff9933", borderColor: "#000000" },
            { label: window.I18n.t("imgexport.legLabel.mur"),     fillColor: "#1e3a8a", borderColor: "#000000" },
            { label: window.I18n.t("imgexport.legLabel.front1"),  lineColor:  "#f4c542" },
            { label: window.I18n.t("imgexport.legLabel.front2"),  lineColor:  "#ff9933" }
          ];
      if (LC) {
        LC.listCustomEntries("structures")
          .filter(function(e) { return e.visible && (e.lineColor || e.fillColor); })
          .forEach(function(e) {
            const isLine = (e.geometry === "polyline") || (!e.geometry && e.lineColor && !e.fillColor);
            if (isLine) {
              lignes.push({ label: e.label, lineColor: e.lineColor || e.fillColor });
            } else {
              lignes.push({
                label:       e.label,
                fillColor:   e.fillColor || e.lineColor,
                borderColor: e.borderColor || e.lineColor || e.fillColor
              });
            }
          });
      }
      if (lignes.length > 0) entrees.push({ section: window.I18n.t("imgexport.legSection.structures"), lignes: lignes });
    }

    if (entrees.length === 0 && metaLignes.length === 0) return;

    // ── Répartition en 2 colonnes : chaque groupe va dans la colonne la moins haute ──
    function _hauteurEstimee(section) {
      return 1 + (section.lignes ? section.lignes.length : 0);
    }
    const colGauche = [];
    const colDroite = [];
    let hG = 0, hD = 0;
    entrees.forEach(function(sec) {
      const h = _hauteurEstimee(sec);
      if (hG <= hD) { colGauche.push(sec); hG += h; }
      else          { colDroite.push(sec); hD += h; }
    });

    if (colDroite.length === 0 && colGauche.length > 1) {
      colDroite.push(colGauche.pop());
    }

    function _largeurColonne(sections) {
      let maxW = 0;
      ctx.save();
      sections.forEach(function(sec) {
        ctx.font = fs + "px sans-serif";
        sec.lignes.forEach(function(l) {
          const w = ctx.measureText(l.label).width;
          if (w > maxW) maxW = w;
        });
        ctx.font = "bold " + fs + "px sans-serif";
        const wt = ctx.measureText(sec.section).width;
        if (wt > maxW) maxW = wt;
      });
      ctx.restore();
      return maxW;
    }

    function _hauteurColonne(sections) {
      let h = 0;
      sections.forEach(function(sec) {
        h += lh;                            // titre section
        h += sec.lignes.length * lh;        // lignes
        h += pad * 0.5;                     // espace inter-section
      });
      return h;
    }

    const colInnerW_g = _largeurColonne(colGauche);
    const colInnerW_d = _largeurColonne(colDroite);
    const colW_g = colInnerW_g + ic + pad;   // icône + label
    const colW_d = colInnerW_d + ic + pad;

    ctx.save();
    let titreMetaW = 0;
    ctx.font = "italic 600 " + tfs + "px Georgia, 'Times New Roman', serif";
    const wTitre = ctx.measureText(window.I18n.t("imgexport.legende.titreImg")).width;
    if (wTitre > titreMetaW) titreMetaW = wTitre;
    ctx.font = "italic " + (fs * 0.92) + "px Georgia, 'Times New Roman', serif";
    metaLignes.forEach(function(l) {
      const w = ctx.measureText(l).width;
      if (w > titreMetaW) titreMetaW = w;
    });
    ctx.restore();

    const colGap = pad * 1.5;

    const colsW = colDroite.length > 0
      ? colW_g + colGap + colW_d
      : colW_g;
    const contentW = Math.max(titreMetaW, colsW);
    const boiteW = contentW + pad * 2;

    let totalH = pad;
    totalH += tfs * 1.2;                  // titre "Légende"
    totalH += pad * 0.8;                  // espace après titre
    if (metaLignes.length > 0) {
      totalH += metaLignes.length * lh * 0.8;
      totalH += pad * 0.6;
    }
    const hCol_g = _hauteurColonne(colGauche);
    const hCol_d = _hauteurColonne(colDroite);
    totalH += Math.max(hCol_g, hCol_d);
    totalH += pad;
    const boiteH = totalH;

    let bx, by;
    const margin = 20 * scale;
    switch (leg.position) {
      case "haut-gauche":  bx = margin;                  by = margin;                   break;
      case "haut-droit":   bx = canvasW - boiteW - margin; by = margin;                 break;
      case "bas-gauche":   bx = margin;                  by = canvasH - boiteH - margin; break;
      case "bas-droit":    bx = canvasW - boiteW - margin; by = canvasH - boiteH - margin; break;
      case "custom":       bx = leg.customX * scale;     by = leg.customY * scale;       break;
      default:             bx = margin;                  by = margin;
    }
    bx = Math.max(0, Math.min(bx, canvasW - boiteW));
    by = Math.max(0, Math.min(by, canvasH - boiteH));

    const radius = 6 * scale;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx + radius, by);
    ctx.lineTo(bx + boiteW - radius, by);
    ctx.quadraticCurveTo(bx + boiteW, by, bx + boiteW, by + radius);
    ctx.lineTo(bx + boiteW, by + boiteH - radius);
    ctx.quadraticCurveTo(bx + boiteW, by + boiteH, bx + boiteW - radius, by + boiteH);
    ctx.lineTo(bx + radius, by + boiteH);
    ctx.quadraticCurveTo(bx, by + boiteH, bx, by + boiteH - radius);
    ctx.lineTo(bx, by + radius);
    ctx.quadraticCurveTo(bx, by, bx + radius, by);
    ctx.closePath();
    ctx.fillStyle = S.bg;
    ctx.fill();
    ctx.strokeStyle = S.border;
    ctx.lineWidth = S.borderW;
    ctx.stroke();
    ctx.restore();

    let cy = by + pad;
    ctx.save();
    ctx.fillStyle = S.titrePrincipal;
    ctx.font = "italic 600 " + tfs + "px Georgia, 'Times New Roman', serif";
    ctx.textBaseline = "top";
    ctx.fillText(window.I18n.t("imgexport.legende.titreImg"), bx + pad, cy);
    cy += tfs * 1.2;
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = S.titreSection;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + pad, cy);
    ctx.lineTo(bx + boiteW - pad, cy);
    ctx.stroke();
    ctx.restore();
    cy += pad * 0.4;

    if (metaLignes.length > 0) {
      ctx.save();
      ctx.fillStyle = S.meta;
      ctx.font = "italic " + (fs * 0.92) + "px Georgia, 'Times New Roman', serif";
      ctx.textBaseline = "top";
      metaLignes.forEach(function(l) {
        ctx.fillText(l, bx + pad, cy);
        cy += lh * 0.8;
      });
      ctx.restore();
      cy += pad * 0.4;
    }

    // ── Rendu des 2 colonnes ──
    const cyColStart = cy;
    const xColGauche = bx + pad;
    const xColDroite = bx + pad + colW_g + colGap;

    async function _dessinerSections(sections, xCol, yStart) {
      let cyLocal = yStart;

      for (const sec of sections) {
        ctx.save();
        ctx.fillStyle = S.titreSection;
        ctx.font = "bold " + fs + "px sans-serif";
        ctx.textBaseline = "top";
        ctx.fillText(sec.section, xCol, cyLocal);
        cyLocal += lh;
        ctx.restore();

        for (const l of sec.lignes) {
          const yLine = cyLocal + (lh - ic) / 2;

          if (l.iconUrl) {
            if (!iconCache[l.iconUrl]) {
              try {
                iconCache[l.iconUrl] = await new Promise(function(res, rej) {
                  const im = new Image();
                  im.onload = function() { res(im); };
                  im.onerror = rej;
                  im.src = l.iconUrl;
                });
              } catch(e) { iconCache[l.iconUrl] = null; }
            }
            if (iconCache[l.iconUrl]) {
              ctx.drawImage(iconCache[l.iconUrl], xCol, yLine, ic, ic);
            }
          } else if (l.lineColor) {
            ctx.save();
            ctx.strokeStyle = l.lineColor;
            ctx.lineWidth = Math.max(3, ic / 5);
            ctx.beginPath();
            ctx.moveTo(xCol, cyLocal + lh / 2);
            ctx.lineTo(xCol + ic, cyLocal + lh / 2);
            ctx.stroke();
            ctx.restore();
          } else if (l.fillColor) {
            ctx.save();
            ctx.fillStyle = l.fillColor;
            ctx.globalAlpha = 0.7;
            ctx.fillRect(xCol, yLine, ic, ic);
            ctx.globalAlpha = 1;
            if (l.borderColor) {
              ctx.strokeStyle = l.borderColor;
              ctx.lineWidth = 2;
              ctx.strokeRect(xCol, yLine, ic, ic);
            }
            ctx.restore();
          }

          ctx.save();
          ctx.fillStyle = S.text;
          ctx.font = fs + "px sans-serif";
          ctx.textBaseline = "middle";
          ctx.fillText(l.label, xCol + ic + pad, cyLocal + lh / 2);
          ctx.restore();

          cyLocal += lh;
        }

        cyLocal += pad * 0.5;
      }
    }

    await _dessinerSections(colGauche, xColGauche, cyColStart);
    if (colDroite.length > 0) {
      await _dessinerSections(colDroite, xColDroite, cyColStart);
    }

    // Dimensions dessinées : pdfExport.js en extrait la boîte légende.
    return { boiteW: boiteW, boiteH: boiteH, bx: bx, by: by };
  }

  // ── API publique pour pdfExport.js ──────────
  // Construit les options complètes de _genererCanvasExport depuis des options simplifiées (pas de second
  // pipeline de rendu). Forme (tout optionnel sauf ann) :
  //   {
  //     ann:         { points, roads, zones, structures, pointsTags, roadsTypes, zonesTypes, structuresTypes, levels },
  //     scale:       1     // 1 = natif, 0.5 = ½, 2 = HD
  //     bg:          "image"|"white"|"black"|"transparent"
  //     imageLayers: { id: bool, ... }
  //     dataLayers:  { id: bool, ... }
  //   }
  // Repli ancienne forme (booléens globaux) : includeBaseImage (false = fond blanc), includeImgLayers,
  // includeDataLayers (cochent TOUS les calques).
  // Rend Promise<HTMLCanvasElement>.
  async function _publicGenererCanvas(userOpts) {
    const config = window.PLAN_CONFIG;
    const fullOpts = {
      ann:         userOpts.ann || {},
      legende:     null,
      format:      "png",
      resol:       userOpts.scale || 1,
      bg:          userOpts.bg    || "image",
      region:      userOpts.region || null,   // { x, y, w, h } unités plan : ne rendre que ce rectangle
      imageLayers: {},
      dataLayers:  {}
    };

    // imageLayers objet non vide → utilisé tel quel ; sinon repli booléen global.
    if (userOpts.imageLayers && typeof userOpts.imageLayers === "object"
        && Object.keys(userOpts.imageLayers).length > 0) {
      fullOpts.imageLayers = userOpts.imageLayers;
    } else if (userOpts.includeImgLayers !== false && userOpts.bg !== "white"
        && userOpts.bg !== "black" && userOpts.bg !== "transparent") {
      (config && config.imageLayers || []).forEach(function(l) {
        fullOpts.imageLayers[l.id] = true;
      });
    }

    // Idem pour les calques de données.
    if (userOpts.dataLayers && typeof userOpts.dataLayers === "object"
        && Object.keys(userOpts.dataLayers).length > 0) {
      fullOpts.dataLayers = userOpts.dataLayers;
    } else if (userOpts.includeDataLayers !== false) {
      (config && config.dataLayers || []).forEach(function(l) {
        fullOpts.dataLayers[l.id] = true;
      });
    }

    // pointsTags absent → tout autorisé.
    if (!fullOpts.ann.pointsTags) {
      fullOpts.ann.pointsTags = { tagsCoches: new Set(), untaggedCoche: false, tousActifs: true };
    }

    // 🩸 Résolution native d'un très grand plan (centaines de Mpx) : le navigateur refuse le canvas et le PDF
    // partirait avec une image 0 × 0 sans message. Même plafond que l'export image (SEUIL_PX_EXPORT ; iPhone :
    // IOS_MAX_PX_CANVAS). A0 à 300 dpi ≈ 140 Mpx suffit.
    const pc = config && config.plan;
    const W = fullOpts.region ? fullOpts.region.w : (pc && pc.imageWidth);
    const H = fullOpts.region ? fullOpts.region.h : (pc && pc.imageHeight);
    if (W > 0 && H > 0) {
      const ios = (typeof window.ktaEstIos === "function") && window.ktaEstIos();
      const budget = ios ? IOS_MAX_PX_CANVAS : SEUIL_PX_EXPORT;
      const px = W * H * fullOpts.resol * fullOpts.resol;
      if (px > budget) {
        const avant = fullOpts.resol;
        fullOpts.resol = Math.floor(Math.sqrt(budget / (W * H)) * 1000) / 1000;
        console.log("[Exporter] Canvas plafonné : résolution " + avant + " → " + fullOpts.resol +
                    " (" + Math.round(W * fullOpts.resol) + "×" + Math.round(H * fullOpts.resol) + ")");
      }
    }

    return await _genererCanvasExport(fullOpts, false);
  }
  window.MyKTAMapExporterGenererCanvas = _publicGenererCanvas;

  // ── Canvas de la LÉGENDE seule ──────────
  // Une image raster collée dans le PDF : évite les limites de jsPDF (Helvetica latin1, emojis) pour icônes,
  // traits, polygones et emojis de sections.
  //   1. canvas temporaire 3000×3000 ;
  //   2. _dessinerLegende en haut-gauche, petite marge (ombre, bordure) ;
  //   3. elle rend {boiteW, boiteH, bx, by} ;
  //   4. canvas final aux dimensions exactes (crop).
  // legContenu : { icones, traces, zones, structures, track, meta }
  // bg : "transparent" (défaut) ou "opaque" (fond plein, si le footer PDF est pâle).
  // Rend Promise<HTMLCanvasElement | null> (null si aucun contenu : l'appelant gère).
  async function _publicGenererCanvasLegende(userOpts) {
    userOpts = userOpts || {};
    const legContenu = userOpts.contenu || {
      icones: true, traces: true, zones: true, structures: true, track: false, meta: false
    };
    const legSize  = userOpts.size  || "standard";
    const legStyle = userOpts.style || "opaque";
    const scale    = userOpts.scale || 1;

    // Tags utilisés (annotations + calques), pour filtrer comme l'export PNG.
    const tagsUtilises = userOpts.tagsUtilises || new Set();
    if (!userOpts.tagsUtilises) {
      const pushTags = function(p) {
        if (p && Array.isArray(p.tags)) p.tags.forEach(function(t) {
          if (t && String(t).trim()) tagsUtilises.add(String(t));
        });
      };
      if (typeof window.getEditorPoints === "function") window.getEditorPoints().forEach(pushTags);
      // Calques de données : chaque dataLayer du plan-config est relu (les registres n'ont pas toujours les tags).
      const cfg = window.PLAN_CONFIG;
      if (cfg && Array.isArray(cfg.dataLayers)) {
        for (const l of cfg.dataLayers) {
          if (l.id === "editor") continue;
          try {
            const r = await fetch(l.file);
            const j = await r.json();
            (j.data || []).forEach(pushTags);
          } catch(e) { /* silent — un calque peut être indisponible */ }
        }
      }
    }

    const TMP_W = 3000, TMP_H = 3000;
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width  = TMP_W;
    tmpCanvas.height = TMP_H;
    const tmpCtx = tmpCanvas.getContext("2d", { alpha: true });

    // Position forcée haut-gauche pour simplifier le crop (marges gérées par l'appelant).
    const leg = {
      position: "haut-gauche",
      customX:  0,
      customY:  0,
      style:    legStyle,
      size:     legSize,
      contenu:  legContenu
    };

    const iconCache = {};
    let dims;
    try {
      dims = await _dessinerLegende(tmpCtx, leg, TMP_W, TMP_H, scale, iconCache, tagsUtilises);
    } catch(e) {
      console.warn("[Export legende] échec dessin :", e);
      return null;
    }
    if (!dims || dims.boiteW <= 0 || dims.boiteH <= 0) {
      // _dessinerLegende sort tôt sans entrée : l'appelant gère le null.
      return null;
    }

    const PAD = 2;
    const W = Math.ceil(dims.boiteW + 2 * PAD);
    const H = Math.ceil(dims.boiteH + 2 * PAD);
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width  = W;
    finalCanvas.height = H;
    const fctx = finalCanvas.getContext("2d", { alpha: true });
    fctx.drawImage(
      tmpCanvas,
      dims.bx - PAD, dims.by - PAD, W, H,
      0, 0, W, H
    );
    return finalCanvas;
  }
  window.MyKTAMapExporterGenererCanvasLegende = _publicGenererCanvasLegende;

  // ── Helpers : visibilité actuelle des calques ──────────
  function _getVisibleImageLayerIds(config) {
    const ids = [];
    (config.imageLayers || []).forEach(function(l) {
      if (window.map) {
        let visible = false;
        window.map.eachLayer(function(layer) {
          if (layer instanceof L.ImageOverlay && layer._url === l.file) visible = true;
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
      const lg = window.dataLayerGroups?.[l.id];
      if (lg && window.map && window.map.hasLayer(lg)) ids.push(l.id);
      else if (!lg && l.visible) ids.push(l.id);
    });
    return ids;
  }

})();
