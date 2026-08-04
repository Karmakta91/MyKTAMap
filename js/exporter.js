// =========================
// EXPORTER.JS — Modale d'export plan avancée
// =========================
// Permet d'exporter le plan en PNG/JPEG avec contrôle fin sur :
//  - les calques d'image inclus
//  - les calques de données inclus
//  - les annotations de session (points / tracés / zones / mesure / tracker)
//  - une légende intégrée positionnable et stylisable
//  - le format et la résolution
// =========================

(function() {
  "use strict";

  // ÉTAT global de la modale courante
  let _currentModal = null;
  let _previewTimer = null;
  let _previewBusy  = false;

  // =========================
  // 🎨 v1.76.0 — STYLES : plus aucune table locale
  // =========================
  // Toutes les couleurs viennent de `js/styleResolver.js` (table canonique).
  // Ce fichier en portait 5 copies : c'est comme ca qu'une zone INACCESSIBLE
  // venant d'un calque de donnees sortait en GRIS REMBLAIS dans l'export PNG
  // avance — `ZS_EMBED` avait simplement oublie l'entree, et le repli
  // `|| ZS_EMBED.remblais` rendait l'oubli invisible.
  //
  // { flat: true } : cette pipe est un CANVAS, il ne sait pas peindre un
  // `url(#pattern)` SVG. Le resolveur substitue l'aplat de repli declare pour
  // le type (rouge fonce semi-transparent pour `inaccessible`).
  //
  // `repli` est le type utilise quand `type` est introuvable — un custom
  // supprime de la legende, par exemple. Passer `null` pour ne rien dessiner.
  function _styleCanvas(categorie, type, repli) {
    const R = window.ktaResolveStyle;
    if (typeof R !== "function") {
      console.error("[Export] window.ktaResolveStyle absent — styles indisponibles.");
      return null;
    }
    return R(categorie, type, { flat: true }) ||
           (repli ? R(categorie, repli, { flat: true }) : null);
  }

  // =========================
  // INJECTION DES STYLES (au premier appel)
  // =========================
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

  // =========================
  // ENTRÉE PUBLIQUE
  // =========================
  window.ouvrirExportModal = function() {
    _injecterStyles();
    if (_currentModal) { _currentModal.remove(); _currentModal = null; }
    if (typeof _resetLayerPointsCache === "function") _resetLayerPointsCache();
    _afficherModal("rapide");
  };

  // =========================
  // CONSTRUIRE ET AFFICHER LA MODALE
  // =========================
  function _afficherModal(modeInitial, etatPrecedent) {
    const T = window.I18n.t;
    const config = window.PLAN_CONFIG;
    if (!config || !config.plan) {
      alert(T("imgexport.alert.noConfig"));
      return;
    }

    // Compter les éléments de session
    const nbPoints  = window.getEditorPoints  ? window.getEditorPoints().length  : 0;
    const nbRoads   = window.getRoads         ? window.getRoads().length         : 0;
    const nbZones   = window.getZones         ? window.getZones().length         : 0;
    const nbMesure  = window.getMeasurePoints        ? window.getMeasurePoints().length        : 0;
    // 🆕 v1.12.0-fix : surface comptée séparément pour l'affichage de la modale export
    const nbMesureSurf = window.getMeasurePointsSurface ? window.getMeasurePointsSurface().length : 0;
    const nbTrackerPath = window.getTrackingPath ? window.getTrackingPath().length : 0;
    const trackerOk = window.getTrackingPosition && window.getTrackingPosition() !== null;

    // Visibilité courante des calques (pour pré-cocher)
    const imageLayersVisibles = _getVisibleImageLayerIds(config);
    const dataLayersVisibles  = _getVisibleDataLayerIds(config);

    // 🏗️ Multi-niveau : pour afficher dans la description du mode rapide
    // quels niveaux seront exportés (le rapide est WYSIWYG = suit le filtre
    // actuel `visibleLevels`). Si multiLevel OFF → pas d'info de niveau.
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
              <p style="font-size:11.5px; color:#8892a4; margin:4px 0 8px 0; line-height:1.5;">
                ${T("imgexport.fond.intro")}
              </p>
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
              <p style="font-size:11.5px; color:#8892a4; margin:0 0 8px 0; line-height:1.5;">
                ${T("imgexport.niveaux.intro")}
              </p>
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

    // Construire les checkboxes calques dynamiquement
    _peuplerCalquesImage(config, imageLayersVisibles);
    _peuplerCalquesData(config, dataLayersVisibles);
    _peuplerAnnotations(nbPoints, nbRoads, nbZones, nbMesure, trackerOk, nbTrackerPath);
    _peuplerNiveaux();
    // 🆕 v1.16.0 step 2 : peupler le panneau « Personnaliser les libellés »
    _peuplerLegendCustom();

    // Restaurer un état précédent (utilisé quand on revient d'une sélection 🎯)
    if (etatPrecedent) _restaurerEtat(etatPrecedent);

    _attacherListeners(modal, modeInitial);

    // Premier rendu de l'aperçu (en mode avancé)
    if (modeInitial === "avance") {
      _planifierApercu();
    }
  }

  // =========================
  // CONSTRUIRE LES CHECKBOXES
  // =========================
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

    // Rendu initial avec un placeholder par calque (la liste de tags arrive en async)
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

    // Charger les infos (tags + types roads/zones) de chaque calque en async
    layers.forEach(function(l) {
      _chargerInfosCalque(l).then(function(infos) {
        _renderInfosCalque(l, infos);
      }).catch(function(e) {
        console.warn("[Export] Infos " + l.id + " :", e);
      });
    });
  }

  // Identifiant CSS-safe pour un calque
  function _slugLayerId(id) {
    return String(id).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Identifiant CSS-safe pour un tag
  function _slugTagId(tag) {
    return String(tag).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Liste les tags présents dans les points d'un calque
  // Retourne [{ tag, count, isUntagged }] trié alphabétiquement
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
    const list = Object.keys(tagCounts).sort().map(function(t) {
      return { tag: t, count: tagCounts[t], isUntagged: false };
    });
    if (untaggedCount > 0) {
      list.push({ tag: "__untagged__", count: untaggedCount, isUntagged: true });
    }
    return list;
  }

  // Liste les types présents dans un tableau d'objets ayant un champ .type
  // Retourne { type: count } uniquement pour les types qui apparaissent
  function _compterTypes(arr, allTypes) {
    const out = {};
    allTypes.forEach(function(t) { out[t] = 0; });
    (arr || []).forEach(function(item) {
      if (out.hasOwnProperty(item.type)) out[item.type]++;
    });
    return out;
  }

  // Charge le contenu d'un calque (points + roads + zones) pour pré-construire les filtres
  // Cache local à la modale pour ne pas refetch à chaque rendu
  const _layerPointsCache = {};
  async function _chargerInfosCalque(layerCfg) {
    if (_layerPointsCache[layerCfg.id]) return _layerPointsCache[layerCfg.id];

    let points = [];
    let roads = [];
    let zones = [];

    if (layerCfg.id === "editor") {
      points = window.getEditorPoints ? window.getEditorPoints() : [];
      // Le calque éditeur n'a pas de roads/zones embarquées (gérées via session côté annotations)
    } else {
      try {
        const r = await fetch(layerCfg.file);
        const j = await r.json();
        points = j.data || [];
        roads  = Array.isArray(j.roads) ? j.roads : [];
        zones  = Array.isArray(j.zones) ? j.zones : [];
      } catch(e) {
        const empty = { tags: [], roadTypes: {}, zoneTypes: {} };
        _layerPointsCache[layerCfg.id] = empty;
        return empty;
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

  // Compatibilité : ancienne fonction _chargerTagsCalque qui ne retournait que les tags
  async function _chargerTagsCalque(layerCfg) {
    const infos = await _chargerInfosCalque(layerCfg);
    return infos.tags;
  }

  // Récupère le chemin de l'icône pour un tag, avec cascade :
  //   1. PLAN_CONFIG.icons[tag]  2. _iconMap[tag] (built-in fallback)
  function _iconePourTag(tag) {
    const planIcons = (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) || {};
    if (planIcons[tag]) return planIcons[tag];
    const entry = window._iconMap && window._iconMap[tag];
    if (!entry) return null;
    // v174 : entry peut être un L.divIcon (scaledMarkers ON) → options.iconUrl
    // undefined. _kta_iconUrl est posé en backup par creerIcones.
    return entry._kta_iconUrl || (entry.options && entry.options.iconUrl) || null;
  }

  function _escapeHtmlExport(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  // Affiche les sous-cases tags pour un calque + branche la synchro parent/enfants
  function _renderTagsCalque(layerCfg, tagsList) {
    // Wrapper de compatibilité — appelle la nouvelle version sans roads/zones
    _renderInfosCalque(layerCfg, { tags: tagsList || [], roadTypes: {}, zoneTypes: {} });
  }

  // Affiche les sous-cases (tags + types roads + types zones) pour un calque + branche les synchros
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

    // Tags des points
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

    // Sous-cases types de routes embarquées
    if (hasRoads) {
      const roadLabels = {
        principal:  window.I18n.t("imgexport.roadType.principal"),
        secondaire: window.I18n.t("imgexport.roadType.secondaire"),
        chemin:     window.I18n.t("imgexport.roadType.chemin")
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

    // Sous-cases types de zones embarquées
    if (hasZones) {
      const zoneLabels = {
        eau:          window.I18n.t("imgexport.zoneType.eau"),
        remblais:     window.I18n.t("imgexport.zoneType.remblais"),
        effondrement: window.I18n.t("imgexport.zoneType.effondrement"),
        inaccessible: window.I18n.t("imgexport.zoneType.inaccessible")
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

    // Synchronisation parent ↔ TOUS les enfants (tags + roads + zones)
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


  // Lit les tags cochés pour un calque donné. Retourne { tagsCoches: Set, untaggedCoche: bool, tousActifs: bool }
  // tousActifs = true si AUCUNE sous-case tag n'est présente (= calque sans tags identifiables)
  // → dans ce cas, on inclut tous les points sans filtrage.
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
    // Préfixe complet (ancré au début) — empêche la collision quand l'id du layer
    // contient lui-même "_tag_" ou ressemble au mot. Les tags peuvent contenir des `_`
    // (cf. _slugTagId), donc on ne peut pas utiliser `[^_]+$` ici.
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

  // Lit les types de routes cochés pour un calque
  // tousActifs = true si aucune sous-case road n'est présente (calque sans routes embarquées)
  // ⚠️ Regex `[^_]+$` (et non `.+$`) pour éviter une fausse capture quand l'id du layer
  //    contient lui-même "road" (ex: layer id="road" → checkbox id="export_layer_road_road_principal",
  //    le 1er `_road_` est greedy gauche-droite et capturerait "road_principal" au lieu de "principal").
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

  // Lit les types de zones cochés pour un calque
  // ⚠️ Regex `[^_]+$` : voir explication identique sur `_lireRoadTypesCochesCalque`.
  //    Bug observé sur layer id="zone" : id checkbox = "export_layer_zone_zone_eau",
  //    le `.+$` capturait "zone_eau" au lieu de "eau" → toutes les zones filtrées.
  function _lireZoneTypesCochesCalque(layerId) {
    const cont = document.getElementById("export_layer_tags_" + _slugLayerId(layerId));
    const inputs = cont ? cont.querySelectorAll('input[data-layer-zonetype-of]') : [];
    if (inputs.length === 0) return { types: new Set(), tousActifs: true };
    const types = new Set();
    inputs.forEach(function(cb) {
      if (!cb.checked) return;
      const m = cb.id.match(/_zone_([^_]+)$/);
      if (m) types.add(m[1]);
    });
    return { types: types, tousActifs: false };
  }

  // Filtre une liste de points selon les tags cochés d'un calque
  function _filtrerPointsParTagsCalque(points, layerId) {
    const sel = _lireTagsCochesCalque(layerId);
    if (sel.tousActifs) return points; // calque sans tags identifiables → tout inclure
    return (points || []).filter(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
      if (tags.length === 0) return sel.untaggedCoche;
      return tags.some(function(t) { return sel.tagsCoches.has(String(t)); });
    });
  }

  // Réinitialiser le cache (à appeler à chaque ouverture de modale)
  function _resetLayerPointsCache() {
    Object.keys(_layerPointsCache).forEach(function(k) { delete _layerPointsCache[k]; });
  }

  // 🏗️ Multi-niveau (v148) : peuplement de la section "Niveaux a exporter".
  // Section cachee si multiLevel = false pour ce plan (retro-compat strict).
  // Sinon : 1 checkbox par niveau dans availableLevels, pre-cochee si le niveau
  // est dans visibleLevels (= ce que le user voit actuellement).
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
    // v154 : tri croissant (cf. modale Niveaux)
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

    // Compter les routes et zones par type
    const roads = (window.getRoads ? window.getRoads() : []) || [];
    const zones = (window.getZones ? window.getZones() : []) || [];
    // 🆕 v1.9.3-A1.b.2 : structures session (piliers + murs)
    const structures = (window.getStructures ? window.getStructures() : []) || [];
    const nbStructures = structures.length;
    const roadsByType = {
      principal:  roads.filter(function(r) { return r.type === "principal";  }).length,
      secondaire: roads.filter(function(r) { return r.type === "secondaire"; }).length,
      chemin:     roads.filter(function(r) { return r.type === "chemin";     }).length
    };
    // 🆕 v1.9.3-A1.b.2-fix : ajout du compteur `inaccessible` qui manquait
    // (causait "⛔ Inaccessible (undefined)" dans la modale annotations
    // session — bug remonté KARMA après A1.b.1).
    const zonesByType = {
      eau:          zones.filter(function(z) { return z.type === "eau";          }).length,
      remblais:     zones.filter(function(z) { return z.type === "remblais";     }).length,
      effondrement: zones.filter(function(z) { return z.type === "effondrement"; }).length,
      inaccessible: zones.filter(function(z) { return z.type === "inaccessible"; }).length
    };
    // 🆕 v1.9.3-A1.b.2 : compteur sous-types structures pour la modale
    // annotations session (parallèle à zonesByType). Inclut les fronts.
    const structuresByType = {
      "pilier-1": structures.filter(function(s) { return s.type === "pilier-1"; }).length,
      "pilier-2": structures.filter(function(s) { return s.type === "pilier-2"; }).length,
      "mur":      structures.filter(function(s) { return s.type === "mur";      }).length,
      "front-1":  structures.filter(function(s) { return s.type === "front-1";  }).length,
      "front-2":  structures.filter(function(s) { return s.type === "front-2";  }).length
    };

    // Position du tracker : toujours active (la position courante existe au minimum)
    // Inclut le tracé parcouru si > 1 point
    const trackerLabel = (nbTrackerPath && nbTrackerPath > 1)
      ? window.I18n.t("imgexport.ann.trackerPath", { count: nbTrackerPath })
      : window.I18n.t("imgexport.ann.tracker");

    // Lister les tags présents dans les points de session
    const sessionPoints = window.getEditorPoints ? window.getEditorPoints() : [];
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
      rowSub("roads_principal",  Ti("imgexport.roadType.principal"),  roadsByType.principal,  true) +
      rowSub("roads_secondaire", Ti("imgexport.roadType.secondaire"), roadsByType.secondaire, true) +
      rowSub("roads_chemin",     Ti("imgexport.roadType.chemin"),     roadsByType.chemin,     true) +

      row("zones",   Ti("imgexport.ann.zones"),           nbZones,   true) +
      rowSub("zones_eau",          Ti("imgexport.zoneType.eau"),          zonesByType.eau,          true) +
      rowSub("zones_remblais",     Ti("imgexport.zoneType.remblais"),     zonesByType.remblais,     true) +
      rowSub("zones_effondrement", Ti("imgexport.zoneType.effondrement"), zonesByType.effondrement, true) +
      rowSub("zones_inaccessible", Ti("imgexport.zoneType.inaccessible"), zonesByType.inaccessible, true) +

      // 🆕 v1.9.3-A1.b.2 : structures (piliers + murs + fronts) dans les
      // annotations session de l'export image. Calqué sur le bloc zones.
      row("structures", Ti("imgexport.ann.structures"), nbStructures, true) +
      rowSub("structures_pilier-1", Ti("imgexport.structType.pilier1"), structuresByType["pilier-1"], true) +
      rowSub("structures_pilier-2", Ti("imgexport.structType.pilier2"), structuresByType["pilier-2"], true) +
      rowSub("structures_mur",      Ti("imgexport.structType.mur"),     structuresByType["mur"],      true) +
      rowSub("structures_front-1",  Ti("imgexport.structType.front1"),  structuresByType["front-1"], true) +
      rowSub("structures_front-2",  Ti("imgexport.structType.front2"),  structuresByType["front-2"], true) +

      row("mesure",  Ti("imgexport.ann.mesure"),          nbMesure,  false) +
      `<label class="kta-export-cb-row" style="${trackerOk ? '' : 'opacity:0.4;'}">
        <input type="checkbox" id="ann_tracker" ${trackerOk ? '' : 'disabled'}>
        <span>${trackerLabel}</span>
      </label>`;

    // Stocker les tags session pour la lecture à l'export
    _sessionPointsTags = sessionTags;

    // Synchronisation parent ↔ enfants
    setTimeout(function() {
      _syncAnnotParent("ann_roads", ["ann_roads_principal", "ann_roads_secondaire", "ann_roads_chemin"]);
      _syncAnnotParent("ann_zones", ["ann_zones_eau", "ann_zones_remblais", "ann_zones_effondrement", "ann_zones_inaccessible"]);
      // 🆕 v1.9.3-A1.b.2 : sync parent↔enfants pour les structures (5 sous-types)
      _syncAnnotParent("ann_structures", ["ann_structures_pilier-1", "ann_structures_pilier-2", "ann_structures_mur", "ann_structures_front-1", "ann_structures_front-2"]);

      // Sync parent Points ↔ tags
      const pointsTagIds = sessionTags.map(function(item) { return "ann_points_tag_" + _slugTagId(item.tag); });
      if (pointsTagIds.length > 0) {
        _syncAnnotParent("ann_points", pointsTagIds);
      }
    }, 0);
  }

  // Cache des tags de points session (pour réutilisation dans la lecture des opts)
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

  // =========================
  // 🏷️ v1.16.0 step 2 : peupler le panneau « Personnaliser les libellés »
  // =========================
  //
  // Pour chaque catégorie (icones, traces, zones, structures), liste les
  // entrées résolues via LegendCustomization.listEntries + listCustomEntries.
  // Chaque ligne expose :
  //   - checkbox visibilité (cochée = visible)
  //   - input texte libellé (placeholder = label défaut)
  //   - badge source (📋 plan / ✏️ moi / défaut)
  //   - bouton 🗑️ pour supprimer une entrée custom (session uniquement)
  //
  // Pour les ICÔNES (~21 entrées), liste pliée dans un sous-<details> pour
  // ne pas étouffer la modale. Les 3 autres catégories (4-5 entrées chacune)
  // sont toujours dépliées.
  function _peuplerLegendCustom() {
    const cont = document.getElementById("kta-legend-custom-body");
    if (!cont) return;
    const LC = window.LegendCustomization;
    if (!LC) {
      cont.innerHTML = '<p style="font-size:12px; color:#8892a4; margin:0;">' +
        window.I18n.t("imgexport.legende.custom.moduleKo") + '</p>';
      return;
    }

    function _esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function _sourceBadge(source) {
      if (source === "session") return '<span class="kta-legend-src kta-legend-src-session" title="' + window.I18n.t("imgexport.legende.custom.srcSession") + '">✏️</span>';
      if (source === "plan")    return '<span class="kta-legend-src kta-legend-src-plan"    title="' + window.I18n.t("imgexport.legende.custom.srcPlan") + '">📋</span>';
      return                          '<span class="kta-legend-src kta-legend-src-default" title="' + window.I18n.t("imgexport.legende.custom.srcDefaut") + '">·</span>';
    }

    function _renderEntryRow(e, isCustomEntry) {
      // Pour les icones standard (non-custom), pas d'iconUrl dans la définition
      // par défaut → on essaie de la résoudre via _iconePourTag pour afficher
      // un swatch image.
      let iconUrl = e.iconUrl;
      if (!iconUrl && e.category === "icones" && typeof _iconePourTag === "function") {
        try { iconUrl = _iconePourTag(e.key); } catch(err) { iconUrl = null; }
      }
      // Visual cue (swatch couleur / icône à gauche du libellé pour repérage)
      // 🐛 v1.16.0 step2-drawable-fix : geometry first (cf legendCustomization.js)
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

      // Bouton 🗑️ uniquement pour les custom entries (suppression session)
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

      // Icones : section collapsible (~21 entrées). Les 3 autres dépliées.
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

  // Ouvre une mini-modale pour ajouter une entrée custom à la légende.
  // 4 champs : catégorie / libellé / couleur trait (optionnel) / couleur
  // fill (optionnel). L'utilisateur peut faire :
  //   - Catégorie "icones" + iconUrl       → entry icône (mais pas d'UI
  //     pour uploader une icône en step 2 — placé pour step 2c suivant)
  //   - Catégorie "traces"     + lineColor → ligne dans Tracés
  //   - Catégorie "zones"      + fillColor → polygone dans Zones
  //   - Catégorie "structures" + lineColor OU fillColor → idem
  function _ouvrirAddCustomEntryDialog() {
    // Mini-modale charte MKM. On utilise .kta-readme-modal-overlay
    // (z-index 99999) mais bumpé à 100100 inline pour passer AU-DESSUS
    // de la modale Export PNG parente (qui occupe la même classe).
    const wrap = document.createElement("div");
    wrap.className = "kta-readme-modal-overlay kta-legend-add-overlay";
    wrap.style.zIndex = "100100";
    const Ta = window.I18n.t;
    wrap.innerHTML =
      '<div class="kta-readme-modal-boite" style="width:auto; max-width:420px; height:auto; max-height:90vh; padding:20px; overflow-y:auto;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:8px;">' +
          '<h3 style="margin:0; font-size:16px; color:#e8eaf0;">' + Ta("imgexport.addEntry.titre") + '</h3>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" type="button" id="kta-legend-add-close" style="padding:2px 8px;">✕</button>' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
          '<label class="kta-cfg-label">' + Ta("imgexport.addEntry.categorie") + '</label>' +
          '<select class="kta-cfg-input" id="kta-legend-add-cat">' +
            '<option value="traces">' + Ta("imgexport.addEntry.cat.traces") + '</option>' +
            '<option value="zones">' + Ta("imgexport.addEntry.cat.zones") + '</option>' +
            '<option value="structures">' + Ta("imgexport.addEntry.cat.structures") + '</option>' +
            '<option value="icones">' + Ta("imgexport.addEntry.cat.icones") + '</option>' +
          '</select>' +
        '</div>' +
        // 🆕 v1.16.0 step2-drawable : choix géométrie pour STRUCTURES.
        '<div style="margin-bottom:10px; display:none;" id="kta-legend-add-geom-wrap">' +
          '<label class="kta-cfg-label">' + Ta("imgexport.addEntry.typeStructure") + '</label>' +
          '<div style="display:flex; gap:6px;">' +
            '<label class="kta-export-radio-row" style="flex:1;">' +
              '<input type="radio" name="kta-legend-add-geom" value="polygon" checked>' +
              '<span>' + Ta("imgexport.addEntry.geom.polygon") + ' <span style="color:#8892a4; font-size:11px;">' + Ta("imgexport.addEntry.geom.polygonNote") + '</span></span>' +
            '</label>' +
            '<label class="kta-export-radio-row" style="flex:1;">' +
              '<input type="radio" name="kta-legend-add-geom" value="polyline">' +
              '<span>' + Ta("imgexport.addEntry.geom.polyline") + ' <span style="color:#8892a4; font-size:11px;">' + Ta("imgexport.addEntry.geom.polylineNote") + '</span></span>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
          '<label class="kta-cfg-label">' + Ta("imgexport.addEntry.libelle") + '</label>' +
          '<input class="kta-cfg-input" id="kta-legend-add-label" type="text" placeholder="' + Ta("imgexport.addEntry.libellePlaceholder") + '">' +
        '</div>' +
        '<div style="margin-bottom:10px;" id="kta-legend-add-line-wrap">' +
          '<label class="kta-cfg-label">' + Ta("imgexport.addEntry.couleurTrait") + '</label>' +
          '<input class="kta-cfg-input" id="kta-legend-add-line" type="color" value="#00ff00" style="height:32px; padding:2px;">' +
          '<label class="kta-export-cb-row" style="margin-top:4px;">' +
            '<input type="checkbox" id="kta-legend-add-line-on" checked>' +
            '<span>' + Ta("imgexport.addEntry.activerTrait") + '</span>' +
          '</label>' +
        '</div>' +
        '<div style="margin-bottom:10px;" id="kta-legend-add-fill-wrap">' +
          '<label class="kta-cfg-label">' + Ta("imgexport.addEntry.couleurFill") + '</label>' +
          '<input class="kta-cfg-input" id="kta-legend-add-fill" type="color" value="#3aa9e8" style="height:32px; padding:2px;">' +
          '<label class="kta-export-cb-row" style="margin-top:4px;">' +
            '<input type="checkbox" id="kta-legend-add-fill-on">' +
            '<span>' + Ta("imgexport.addEntry.activerFill") + '</span>' +
          '</label>' +
        '</div>' +
        '<div style="margin-bottom:10px; display:none;" id="kta-legend-add-icon-wrap">' +
          '<label class="kta-cfg-label">' + Ta("imgexport.addEntry.urlIcone") + '</label>' +
          '<input class="kta-cfg-input" id="kta-legend-add-icon" type="text" placeholder="https://... ou data:image/...">' +
          '<p style="font-size:11px; color:#8892a4; margin:4px 0 0 0;">' +
            Ta("imgexport.addEntry.urlIconeNote") +
          '</p>' +
        '</div>' +
        '<div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">' +
          '<button class="kta-btn kta-btn-ghost"   type="button" id="kta-legend-add-cancel">' + Ta("imgexport.addEntry.annuler") + '</button>' +
          '<button class="kta-btn kta-btn-primary" type="button" id="kta-legend-add-ok">' + Ta("imgexport.addEntry.ajouter") + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);

    function fermerAdd() { try { wrap.remove(); } catch(e) {} }

    document.getElementById("kta-legend-add-close").addEventListener("click", fermerAdd);
    document.getElementById("kta-legend-add-cancel").addEventListener("click", fermerAdd);
    wrap.addEventListener("click", function(e) { if (e.target === wrap) fermerAdd(); });

    const catSel = document.getElementById("kta-legend-add-cat");
    const geomWrap = document.getElementById("kta-legend-add-geom-wrap");
    const lineWrap = document.getElementById("kta-legend-add-line-wrap");
    const fillWrap = document.getElementById("kta-legend-add-fill-wrap");
    const iconWrap = document.getElementById("kta-legend-add-icon-wrap");

    function _getStructGeom() {
      const r = wrap.querySelector('input[name="kta-legend-add-geom"]:checked');
      return r ? r.value : "polygon";
    }

    function _majChamps() {
      const cat = catSel.value;
      // Icônes → uniquement iconUrl. Autres → couleurs trait/fill selon le type.
      if (cat === "icones") {
        geomWrap.style.display = "none";
        lineWrap.style.display = "none";
        fillWrap.style.display = "none";
        iconWrap.style.display = "block";
      } else {
        iconWrap.style.display = "none";
        // Tracés : trait obligatoire, fill caché.
        // Zones : fill obligatoire, trait optionnel pour bordure.
        // Structures : géométrie au choix → trait OU fill selon ce choix.
        if (cat === "traces") {
          geomWrap.style.display = "none";
          lineWrap.style.display = "block";
          fillWrap.style.display = "none";
        } else if (cat === "zones") {
          geomWrap.style.display = "none";
          lineWrap.style.display = "none";
          fillWrap.style.display = "block";
          document.getElementById("kta-legend-add-fill-on").checked = true;
          // 🐛 v1.76.0 — décocher le trait, pas seulement le masquer (sinon
          // contour vert fluo #00ff00 sur toute zone custom). Correctif
          // identique dans legendCustomization.js — cette dialog en est un
          // clone intégral, cf. la dette notée dans docs/BACKLOG.md.
          document.getElementById("kta-legend-add-line-on").checked = false;
        } else {
          // structures
          // 🐛 v1.16.0 step2-drawable-fix : pour polygone, on cache le
          // sélecteur "trait" (cf legendCustomization.js).
          geomWrap.style.display = "block";
          const g = _getStructGeom();
          if (g === "polyline") {
            lineWrap.style.display = "block";
            fillWrap.style.display = "none";
            document.getElementById("kta-legend-add-line-on").checked = true;
          } else {
            lineWrap.style.display = "none";
            fillWrap.style.display = "block";
            document.getElementById("kta-legend-add-fill-on").checked = true;
            // 🐛 v1.76.0 — idem : sans ce décochage, un pilier/mur custom
            // naissait avec une bordure verte au lieu du noir des built-in.
            document.getElementById("kta-legend-add-line-on").checked = false;
          }
        }
      }
    }
    catSel.addEventListener("change", _majChamps);
    wrap.querySelectorAll('input[name="kta-legend-add-geom"]').forEach(function(r) {
      r.addEventListener("change", _majChamps);
    });
    _majChamps();

    document.getElementById("kta-legend-add-ok").addEventListener("click", function() {
      const cat   = catSel.value;
      const label = (document.getElementById("kta-legend-add-label").value || "").trim();
      if (!label) {
        alert(window.I18n.t("imgexport.addEntry.alert.labelRequis"));
        return;
      }
      const entry = { category: cat, label: label };

      // 🆕 v1.16.0 step2-drawable : géométrie
      if (cat === "structures") {
        entry.geometry = _getStructGeom();
      } else if (cat === "traces") {
        entry.geometry = "polyline";
      } else if (cat === "zones") {
        entry.geometry = "polygon";
      } else {
        entry.geometry = "marker";
      }

      if (cat === "icones") {
        const url = (document.getElementById("kta-legend-add-icon").value || "").trim();
        if (!url) { alert(window.I18n.t("imgexport.addEntry.alert.urlRequise")); return; }
        entry.iconUrl = url;
      } else {
        const lineOn = document.getElementById("kta-legend-add-line-on").checked;
        const fillOn = document.getElementById("kta-legend-add-fill-on").checked;
        if (lineOn) entry.lineColor = document.getElementById("kta-legend-add-line").value;
        if (fillOn) {
          entry.fillColor = document.getElementById("kta-legend-add-fill").value;
          // Pour zones/structures polygones : bordure par défaut = même couleur que fill
          if ((cat === "zones" || (cat === "structures" && entry.geometry === "polygon")) && !lineOn) {
            entry.borderColor = entry.fillColor;
          }
        }
        if (entry.geometry === "polyline" && !entry.lineColor) {
          alert(window.I18n.t("imgexport.addEntry.alert.traitRequis"));
          return;
        }
        if (entry.geometry === "polygon" && !entry.fillColor) {
          alert(window.I18n.t("imgexport.addEntry.alert.fillRequis"));
          return;
        }
        if (!entry.lineColor && !entry.fillColor) {
          alert(window.I18n.t("imgexport.addEntry.alert.couleurRequise"));
          return;
        }
      }
      if (window.LegendCustomization) {
        window.LegendCustomization.addCustomEntry(entry);
        _peuplerLegendCustom();
        _planifierApercu();
      }
      fermerAdd();
    });
  }

  // Lit les valeurs courantes du panneau Légende Custom et appelle les
  // setters de LegendCustomization pour persister les overrides session.
  // Appelé sur tout change/input du panneau (debounce léger via apercu).
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

  // =========================
  // ATTACHER LES LISTENERS
  // =========================
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

    // Toggle légende
    const legOn = document.getElementById("kta-export-legende-on");
    const legOpts = document.getElementById("kta-export-legende-options");
    legOn.addEventListener("change", function() {
      legOpts.style.display = legOn.checked ? "block" : "none";
      _planifierApercu();
    });

    // Position légende
    const radiosPos = modal.querySelectorAll('input[name="leg_pos"]');
    const customWrap = document.getElementById("kta-export-leg-custom");
    radiosPos.forEach(function(r) {
      r.addEventListener("change", function() {
        customWrap.style.display = (r.value === "custom" && r.checked) ? "block" : "none";
        _planifierApercu();
      });
    });

    // Bouton 🎯 Sélectionner sur la carte
    const btnPick = document.getElementById("kta-export-leg-pick");
    btnPick.addEventListener("click", function() {
      const etat = _capturerEtat();
      _activerSelectionPosition(etat);
    });

    // Champs X / Y manuels
    const xInput = document.getElementById("kta-export-leg-x");
    const yInput = document.getElementById("kta-export-leg-y");
    xInput.addEventListener("input", _planifierApercu);
    yInput.addEventListener("input", _planifierApercu);

    // 🆕 v1.16.0 step 2 : listeners du panneau « Personnaliser les libellés ».
    // Délégation sur le conteneur pour gérer les rows ajoutées dynamiquement
    // (entrées custom ajoutées via ➕). Tout change/input recalcule l'aperçu.
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
      btnLegReset.addEventListener("click", function() {
        if (!window.LegendCustomization) return;
        // Confirmation simple via window.confirm — pas de modale custom pour
        // garder le code léger (action peu fréquente).
        const ok = window.confirm(window.I18n.t("imgexport.legende.custom.resetConfirm"));
        if (!ok) return;
        window.LegendCustomization.resetSession();
        _peuplerLegendCustom();
        _planifierApercu();
      });
    }

    // 🆕 v1.9.3-A1.b.3 : sélecteur fond — toggle banner info + grise
    // visuellement la section "Calques d'image" quand fond custom.
    function _majBgState() {
      const bgVal = _radioVal("export_bg") || "image";
      const isCustom = (bgVal !== "image");
      const infoEl = document.getElementById("kta-export-bg-info");
      if (infoEl) infoEl.style.display = isCustom ? "block" : "none";
      // Grise la section Calques d'image quand fond custom (pour signaler
      // visuellement qu'elle n'aura pas d'effet sur le PNG sortant).
      const imgLayersWrap = document.getElementById("kta-export-image-layers");
      const imgSectionParent = imgLayersWrap?.parentElement;  // .kta-aide-section
      if (imgSectionParent) {
        imgSectionParent.style.opacity = isCustom ? "0.4" : "1";
        imgSectionParent.style.pointerEvents = isCustom ? "none" : "";
      }
      // Si fond = transparent, force le format PNG (JPEG ne supporte pas
      // l'alpha). Pratique : on coche PNG et on disable JPEG/WebP.
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

    // Tous les autres inputs déclenchent l'aperçu
    modal.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(function(el) {
      el.addEventListener("change", _planifierApercu);
    });

    // Action Télécharger
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

  // =========================
  // CAPTURE / RESTAURATION D'ÉTAT
  // (utilisé quand on ouvre la sélection 🎯 sur la carte
  //  pour rouvrir la modale dans son état précédent)
  // =========================
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
      // 🆕 v1.9.3-A1.b.3 : choix de fond sauvegardé pour restauration
      // d'état (cas du Sélectionner sur la carte → réouverture modale).
      bg:          _radioVal("export_bg") || "image"
    };
    document.querySelectorAll('[data-layer-type="image"]').forEach(function(cb) {
      etat.imageLayers[cb.dataset.layerId] = cb.checked;
    });
    document.querySelectorAll('[data-layer-type="data"]').forEach(function(cb) {
      etat.dataLayers[cb.dataset.layerId] = cb.checked;
    });
    // 🆕 v1.9.3-A1.b.2 : structures dans les annotations exportables
    ["points","roads","zones","structures","mesure","tracker"].forEach(function(k) {
      const cb = document.getElementById("ann_" + k);
      etat.ann[k] = cb ? cb.checked : false;
    });
    // Sauver les sous-types
    ["principal","secondaire","chemin"].forEach(function(t) {
      const cb = document.getElementById("ann_roads_" + t);
      etat.ann["roads_" + t] = cb ? cb.checked : true;
    });
    ["eau","remblais","effondrement","inaccessible"].forEach(function(t) {
      const cb = document.getElementById("ann_zones_" + t);
      etat.ann["zones_" + t] = cb ? cb.checked : true;
    });
    // 🆕 v1.9.3-A1.b.2 : sous-types structures sauvegardés dans l'état
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
    // 🆕 v1.9.3-A1.b.3 : restauration du choix de fond
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
  function _setRadio(name, val) {
    const el = document.querySelector('input[name="' + name + '"][value="' + val + '"]');
    if (el) el.checked = true;
  }

  // =========================
  // SÉLECTION DE LA POSITION 🎯 SUR LA CARTE
  // =========================
  function _activerSelectionPosition(etatPrecedent) {
    // Fermer la modale temporairement
    if (_currentModal) { _currentModal.remove(); _currentModal = null; }

    // Banner d'instruction
    const banner = document.createElement("div");
    banner.id = "kta-export-pick-banner";
    banner.style.cssText = "position:fixed; top:60px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.9); color:#fff; padding:10px 18px; border-radius:8px; font-size:14px; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.4); border:1px solid rgba(140,180,255,0.5);";
    banner.innerHTML = window.I18n.t("imgexport.pick.banner");
    document.body.appendChild(banner);

    // Mode crosshair
    const mapEl = document.getElementById("map");
    const oldCursor = mapEl.style.cursor;
    mapEl.style.cursor = "crosshair";

    function nettoyer() {
      banner.remove();
      mapEl.style.cursor = oldCursor;
      window.map.off("click", onClic);
      document.removeEventListener("keydown", onEchap);
    }

    function onClic(e) {
      const x = Math.round(e.latlng.lng);
      const y = Math.round(APP_CONFIG.imageHeight - e.latlng.lat);
      nettoyer();

      // Rouvrir la modale avec position custom + coords remplies
      etatPrecedent.legende = etatPrecedent.legende || {};
      etatPrecedent.legende.position = "custom";
      etatPrecedent.legende.customX = x;
      etatPrecedent.legende.customY = y;
      _afficherModal("avance", etatPrecedent);
    }

    function onEchap(e) {
      if (e.key === "Escape") {
        nettoyer();
        _afficherModal("avance", etatPrecedent);
      }
    }

    window.map.on("click", onClic);
    document.addEventListener("keydown", onEchap);
  }

  // =========================
  // PLANIFICATION DE L'APERÇU (debounced)
  // =========================
  function _planifierApercu() {
    if (_previewTimer) clearTimeout(_previewTimer);
    _previewTimer = setTimeout(_genererApercu, 300);
  }

  // =========================
  // GÉNÉRATION DE L'APERÇU MINI-CANVAS
  // =========================
  async function _genererApercu() {
    if (_previewBusy) return;
    const canvas = document.getElementById("kta-export-preview");
    if (!canvas) return;
    _previewBusy = true;

    try {
      const opts = _lireOptions();
      const tmpCanvas = await _genererCanvasExport(opts, true);

      // Dessiner le tmpCanvas dans le mini-canvas (320×200)
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#1a1f2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const ratio = Math.min(canvas.width / tmpCanvas.width, canvas.height / tmpCanvas.height);
      const w = tmpCanvas.width  * ratio;
      const h = tmpCanvas.height * ratio;
      const dx = (canvas.width  - w) / 2;
      const dy = (canvas.height - h) / 2;
      ctx.drawImage(tmpCanvas, dx, dy, w, h);

      // Info textuelle
      const info = document.getElementById("kta-export-preview-info");
      if (info) {
        const config = window.PLAN_CONFIG;
        const finalW = Math.round(config.plan.imageWidth  * opts.resol);
        const finalH = Math.round(config.plan.imageHeight * opts.resol);
        info.textContent = opts.format.toUpperCase() + " — " + finalW + "×" + finalH + " px";
      }
    } catch(err) {
      console.warn("[Export] Aperçu erreur :", err);
    } finally {
      _previewBusy = false;
    }
  }

  // =========================
  // LECTURE DES OPTIONS DEPUIS LA MODALE
  // =========================
  function _lireOptions() {
    const opts = {
      imageLayers: {},
      dataLayers:  {},
      ann:         {},
      legende:     null,
      format:      _radioVal("format") || "png",
      resol:       parseFloat(_radioVal("resol") || "1"),
      // 🆕 v1.9.3-A1.b.3 (KARMA "fond transparent / blanc / noir / image") :
      // sélecteur de fond. Valeurs : "image" (défaut), "white", "black",
      // "transparent". Pour les 3 valeurs non-image, les calques d'image
      // sont automatiquement ignorés au render canvas.
      bg:          _radioVal("export_bg") || "image"
    };
    document.querySelectorAll('[data-layer-type="image"]').forEach(function(cb) {
      opts.imageLayers[cb.dataset.layerId] = cb.checked;
    });
    document.querySelectorAll('[data-layer-type="data"]').forEach(function(cb) {
      opts.dataLayers[cb.dataset.layerId] = cb.checked;
    });
    // 🆕 v1.9.3-A1.b.2 : ajout de "structures" dans la liste des
    // catégories d'annotations exportables.
    ["points","roads","zones","structures","mesure","tracker"].forEach(function(k) {
      const cb = document.getElementById("ann_" + k);
      opts.ann[k] = cb ? cb.checked : false;
    });
    // Sous-types pour roads et zones (filtrage fin)
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
    // 🆕 v1.9.3-A1.b.2 : sous-types structures (5 sous-cases incl. fronts)
    opts.ann.structuresTypes = {
      "pilier-1": document.getElementById("ann_structures_pilier-1")?.checked ?? true,
      "pilier-2": document.getElementById("ann_structures_pilier-2")?.checked ?? true,
      "mur":      document.getElementById("ann_structures_mur")?.checked      ?? true,
      "front-1":  document.getElementById("ann_structures_front-1")?.checked  ?? true,
      "front-2":  document.getElementById("ann_structures_front-2")?.checked  ?? true
    };
    // 🏗️ Multi-niveau (v148) : Set des niveaux coches dans la section dediee.
    // - null → multiLevel OFF pour ce plan → pas de filtrage niveau
    // - Set → filtre actif : on n'exporte que les items dont level ∈ Set
    //                         (jonction si fromLevel OU toLevel ∈ Set)
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

    // Tags des points de session (filtrage fin)
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

  // =========================
  // EXPORT AVANCÉ — GÉNÉRATION + DOWNLOAD
  // =========================
  async function _exporterAvance() {
    const opts = _lireOptions();
    const canvas = await _genererCanvasExport(opts, false);

    const config = window.PLAN_CONFIG;
    const ext = opts.format === "jpeg" ? "jpg" : "png";
    const mime = opts.format === "jpeg" ? "image/jpeg" : "image/png";
    const quality = opts.format === "jpeg" ? 0.9 : undefined;

    // Helper qui tente un encodage et résout {ok, fallbackUsed}
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

    // Tente le format demandé, puis fallback JPEG si c'était PNG, sinon downsample.
    // Cf. utils.js — l'encodage PNG d'un gros canvas (plans JPG haute résolution)
    // crame la mémoire mobile et retourne null. JPEG est plus tolérant.
    try {
      await _tryEncode(mime, ext, quality);
    } catch(errPrimary) {
      console.warn("[Export avancé] encodage " + mime + " échoué — fallback :", errPrimary.message);
      // Si PNG a échoué, on tente JPEG. Si JPEG a déjà échoué, on remonte.
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

  // =========================
  // GÉNÉRATION DU CANVAS — cœur de l'export
  // =========================
  async function _genererCanvasExport(opts, isApercu) {
    const config = window.PLAN_CONFIG;
    const baseW = config.plan.imageWidth;
    const baseH = config.plan.imageHeight;

    // Pour l'aperçu : taille modeste pour rapidité
    const scale = isApercu ? Math.min(800 / baseW, 1) : opts.resol;
    const W = Math.round(baseW * scale);
    const H = Math.round(baseH * scale);

    // Set des tags effectivement utilisés sur le plan exporté
    // (rempli au fil de la boucle data + editor, puis passé à la légende)
    const tagsUtilises = new Set();

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    // 🆕 v1.9.3-A1.b.3 : pour le fond transparent, on doit créer le
    // context avec alpha: true (= default, mais on l'explicite). Le PNG
    // sortant contiendra alors un canal alpha exploitable.
    const ctx = canvas.getContext("2d", { alpha: true });

    // 🆕 v1.9.3-A1.b.3 : fond d'export selon opts.bg
    //   - "image"       → fillRect blanc (sera couvert par l'image plan
    //                     juste après, mais utile si baseImage échoue à
    //                     charger pour avoir un fond propre au lieu de
    //                     transparent par défaut).
    //   - "white"       → fillRect blanc, baseImage + image layers SKIP
    //   - "black"       → fillRect noir, baseImage + image layers SKIP
    //   - "transparent" → pas de fillRect, baseImage + image layers SKIP
    //                     → PNG avec canal alpha (les zones non peintes
    //                     par les annotations restent transparentes).
    const bg = opts.bg || "image";
    const skipBaseImage = (bg !== "image");
    if (bg === "image" || bg === "white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
    } else if (bg === "black") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);
    }
    // bg === "transparent" : on ne fait rien, le canvas reste vide → alpha

    // Toutes les coords plan sont multipliées par "scale" pour matcher le canvas
    const sc = function(v) { return v * scale; };

    // 🏗️ Multi-niveau (v148) : helper local de filtrage selon les niveaux
    // CHOISIS dans la modale Avancé (opts.ann.levels = Set<number> ou null).
    // Cela découple l'export du filtre runtime (visibleLevels) : l'utilisateur
    // peut filtrer la map sur Niv 0 mais exporter Niv 0+1+2 cochés dans la modale.
    //   - opts.ann.levels === null → pas de filtre (multiLevel OFF) → tout passe
    //   - opts.ann.levels = Set    → on filtre. Jonction visible si fromLevel
    //     OU toLevel ∈ Set. Item sans level (rétro-compat) = niveau 0.
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

    // ---------- helpers ----------
    function loadImage(src) {
      return new Promise(function(res, rej) {
        const img = new Image();
        img.onload = function() { res(img); };
        img.onerror = function() { rej(new Error(window.I18n.t("imgexport.err.imageLoad", { src: src }))); };
        img.src = src;
      });
    }

    // ---------- image principale ----------
    // 🆕 v1.9.3-A1.b.3 : skip si fond custom (white/black/transparent).
    // L'utilisateur a explicitement demandé à NE PAS afficher l'image
    // du plan — on respecte ça en sautant le baseImage drawImage.
    if (!skipBaseImage) {
      try {
        const baseImg = await loadImage(config.plan.baseImage);
        ctx.drawImage(baseImg, 0, 0, W, H);
      } catch(e) { console.warn("[Export] base image :", e); }
    }

    // ---------- calques d'image cochés ----------
    // 🆕 v1.9.3-A1.b.3 : idem pour les image layers (calques tuiles V2,
    // overlays multi-niveau, etc.). Skip global si fond custom — l'user
    // veut UNIQUEMENT ses annotations sur le fond choisi.
    if (!skipBaseImage) {
      const layers = (config.imageLayers || []).slice().sort(function(a, b) {
        return (a.order || 0) - (b.order || 0);
      });
      for (const layerCfg of layers) {
        if (!opts.imageLayers[layerCfg.id]) continue;
        try {
          const img = await loadImage(layerCfg.file);
          // 🆕 v1.38.3 — Si l'image layer a une calibration 2 ancres (embed
          // plan-config.json depuis v1.38.1), on la dessine avec la transform
          // affine équivalente (rotation + scale + translation) via canvas
          // ctx.transform → l'export reflète exactement ce que l'user voit
          // sur la map. Sinon : drawImage stretching plan principal (v1.37.x).
          const calibrated = (layerCfg.calibration && window.ImageLayerCalibration
                              && typeof window.ImageLayerCalibration.drawCalibratedImageLayer === "function")
            ? window.ImageLayerCalibration.drawCalibratedImageLayer(ctx, img, layerCfg.calibration, W, H)
            : false;
          if (!calibrated) {
            ctx.drawImage(img, 0, 0, W, H);
          }
        } catch(e) { console.warn("[Export] calque image :", layerCfg.file, e); }
      }
    }

    // ---------- icônes (cache) ----------
    const iconCache = {};
    async function getIconUrl(p) {
      // Cascade complète : plan-config.icons[tag] → _iconMap[tag] → default
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

    // ---------- zones (avant les tracés) ----------
    if (opts.ann.zones && window.getZones) {
      const zones = window.getZones();
      const ordre = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
      const filtreZ = opts.ann.zonesTypes || { eau: true, remblais: true, effondrement: true, inaccessible: true };
      // v169 : `inaccessible` sort en rouge fonce uni semi-transparent — les
      // hachures SVG du runtime ne sont pas portables au canvas. C'est le repli
      // d'aplat que { flat: true } applique (cf. _styleCanvas).
      function _styleZoneExp(type) { return _styleCanvas("zones", type, "remblais"); }
      const triees = [...zones]
        .filter(function(z) {
          // Custom zones toujours OK (pas dans filtreZ qui ne liste que built-in)
          if (String(z.type).startsWith("cust-")) return true;
          return filtreZ[z.type] !== false;
        })
        // 🏗️ Multi-niveau : filtre sur les niveaux coches dans la modale Avancé
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

    // ---------- 🆕 v1.9.3-A1.b.2 : structures (piliers + murs + fronts) ----------
    // Calqué sur le bloc zones ci-dessus. Styles cohérents avec
    // structures.js > STRUCTURE_STYLES. Différenciation polygon (piliers,
    // mur) vs polyline (fronts) au rendu canvas.
    if (opts.ann.structures && window.getStructures) {
      const structures = window.getStructures();
      // Fronts : polylines épaisses sans contour. Le `weight` (px Leaflet) est
      // converti via `scale` au canvas final.
      // 🆕 v1.10.0-hotfix1 : nouvel ordre Z mur < pilier-2 < pilier-1 <
      // front-2 < front-1 (fronts en avant-plan) + tri par level en M-LVL.
      // Cohérent avec structures.js > renderStructures et utils.js.
      const ordreS = { "mur": 0, "pilier-2": 1, "pilier-1": 2, "front-2": 3, "front-1": 4 };
      const filtreS = opts.ann.structuresTypes || {
        "pilier-1": true, "pilier-2": true, "mur": true,
        "front-1":  true, "front-2": true
      };
      // Custom : la géométrie déclarée tranche — polyline (front) → trait épais,
      // polygon (pilier/mur) → contour noir. C'est le résolveur qui applique le
      // gabarit de la catégorie « structures ».
      function _styleStructExp(type) { return _styleCanvas("structures", type, "mur"); }
      const _multiLevelOnExp = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
      const triees = [...structures]
        .filter(function(s) {
          // Custom structures toujours OK
          if (String(s.type).startsWith("cust-")) return true;
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
        // Minimum 2 points pour polyline, 3 pour polygon
        const minPts = isPolyline ? 2 : 3;
        if (!st.points || st.points.length < minPts) continue;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sc(st.points[0].x), sc(st.points[0].y));
        for (let i = 1; i < st.points.length; i++) {
          ctx.lineTo(sc(st.points[i].x), sc(st.points[i].y));
        }
        if (isPolyline) {
          // Front : polyline solide épaisse colorée, pas de fill ni
          // de stroke noir contour. Round cap/join pour douceur visuelle.
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.weight * scale;
          ctx.globalAlpha = s.opacity;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
        } else {
          // Pilier / mur : polygon fermé + fill + stroke noir
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

    // ---------- helpers polygones / polylignes ----------
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
    function _drawPolyline(points, style) {
      if (!points || points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = (style.weight || 5) * scale;
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

    // 🐛 v1.76.0 — CORRECTION DU BUG HISTORIQUE. Ces deux tables etaient
    // ecrites a la main et INCOMPLETES : `ZS_EMBED` n'avait pas `inaccessible`,
    // donc le repli `|| ZS_EMBED.remblais` faisait sortir une zone DANGEREUSE
    // en gris remblais. Exactement le meme oubli avait deja frappe `jonction`
    // ici meme (corrige en v1.7.1) — deux fois le meme defaut, parce que la
    // table etait recopiee. Elle ne l'est plus : le resolveur connait TOUS les
    // types, built-in comme custom, et il n'y a plus rien a oublier.

    // Collecte des routes (embedded + editable) pour dessiner les cercles d'intersection à la fin
    const allRoadsForIntersect = [];
    // Markers DIFFÉRÉS : on les collecte pendant la boucle des calques mais on les dessine
    // APRÈS toutes les routes + cercles, pour respecter l'ordre ZONE → TRAIT → CERCLE → ICÔNE
    const deferredMarkers = []; // [{p, layerId}]

    // ---------- couches data (markers + roads/zones embarqués) ----------
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
      // 🆕 v1.10.3-structures-embed-fix (KARMA "structures bien incluses ?") :
      // les piliers/murs/fronts définis dans un data layer (data/<plan>/structure.json
      // ou même inline dans un autre .json) étaient lus pour le runtime
      // Leaflet (utils.js > ajouterPointsDepuisJSON ligne 645) mais PAS
      // pour l'export canvas. Bug oublié à l'ajout des structures v1.9.3.
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

      // Filtrer les points selon les tags cochés du calque (si la modale est ouverte)
      // Si la fonction n'existe pas (mode rapide), on prend tout.
      if (typeof _filtrerPointsParTagsCalque === "function") {
        pts = _filtrerPointsParTagsCalque(pts, layerCfg.id);
      }

      // Pour le calque "editor", appliquer en plus le filtre des tags Annotations (intersection)
      if (layerCfg.id === "editor" && opts.ann.pointsTags && !opts.ann.pointsTags.tousActifs) {
        const sel = opts.ann.pointsTags;
        pts = pts.filter(function(p) {
          const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
          if (tags.length === 0) return sel.untaggedCoche;
          return tags.some(function(t) { return sel.tagsCoches.has(String(t)); });
        });
      }

      // Filtrer les routes embarquées par type (modale ouverte uniquement)
      let drawnRoads = embeddedRoads;
      if (typeof _lireRoadTypesCochesCalque === "function") {
        const rs = _lireRoadTypesCochesCalque(layerCfg.id);
        if (!rs.tousActifs) {
          drawnRoads = embeddedRoads.filter(function(r) { return rs.types.has(r.type); });
        }
      }

      // Filtrer les zones embarquées par type (modale ouverte uniquement)
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
          drawnZones = embeddedZones.filter(function(z) { return zs.types.has(z.type); });
        }
      }

      // Zones embarquées (arrière-plan, triées eau → remblais → effondrement → inaccessible)
      // 🏗️ Multi-niveau : filtre WYSIWYG (visibleLevels) sur les zones embarquees.
      const ordreZ = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
      [...drawnZones].sort(function(a, b) {
        return (ordreZ[a.type] ?? 99) - (ordreZ[b.type] ?? 99);
      }).forEach(function(z) {
        if (!_itemPasseLevels(z)) return;
        _drawPolygon(z.points || [], _styleCanvas("zones", z.type, "remblais"));
        _diagAdv.embZones++;
      });

      // 🆕 v1.10.3-structures-embed-fix : structures embarquées (piliers,
      // mur, fronts). Couleurs + tri Z cohérents avec le bloc structures
      // SESSION (ligne ~1574 dans ce fichier) + utils.js > telechargerPlan
      // futur. Ordre Z : mur < pilier-2 < pilier-1 < front-2 < front-1
      // (fronts au-dessus, hotfix v1.10.0-hotfix1).
      // Filtre par opts.ann.structures + opts.ann.structuresTypes (les
      // mêmes que pour les structures session — cohérent avec la modale
      // Avancé qui n'a qu'un seul groupe de checkbox pour les structures).
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
            _drawPolyline(st.points, s);
          } else {
            _drawPolygon(st.points, s);
          }
          if (typeof _diagAdv.embStructs !== "number") _diagAdv.embStructs = 0;
          _diagAdv.embStructs++;
        }
      }

      // Routes embarquées
      // 🏗️ Multi-niveau : filtre sur les niveaux choisis dans la modale.
      // 🏗️ v169 (Karma_dev) : tri Z-index ascending par level si multiLevel ON.
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
        _drawPolyline(r.points || [], _styleCanvas("traces", r.type) || { color: "#ffffff", weight: 5, opacity: 1 });
        if (r.points && r.points.length >= 2) allRoadsForIntersect.push(r);
        _diagAdv.embRoads++;
      });

      // Markers (filtrés par tags si modale) — DIFFÉRÉS au dessin final pour passer
      // au-dessus des routes + cercles d'intersection.
      // Les tags sont collectés ici (pour la légende exportée) sans attendre.
      // 🏗️ Multi-niveau : filtre sur les niveaux choisis dans la modale.
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

    // ---------- routes ----------
    // ⚠️ Exclusion du type "itinerary" — c'est un overlay calculé par Pathfinder,
    // pas une route à exporter. Sans ce filtre, le fallback "white" effaçait les
    // segments du réseau sous-jacent par-dessus lesquels passait l'itinéraire.
    if (opts.ann.roads && window.getRoads) {
      const roads = window.getRoads().filter(function(r) { return r.type !== "itinerary"; });
      // 🏗️ v169 (Karma_dev) : tri Z-index ascending par level si multiLevel ON.
      // Cohérent avec road.js > renderRoads. Niveau bas en arrière, haut au-dessus.
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
      // 🏗️ Multi-niveau (v148) : la jonction sort en magenta PLEIN — cette pipe
      // canvas ne gere pas le dashArray. Ses extremites sont marquees en ronds
      // blanc+magenta plus bas, pour la parite avec l'affichage carte.
      // Repli "white" pour un type totalement inconnu (custom supprime de la
      // legende) : mieux vaut un trait visible qu'un trait absent.
      function _styleRoadExp(type) {
        return _styleCanvas("traces", type) || { color: "white", weight: 5 };
      }
      const filtreR = opts.ann.roadsTypes || { principal: true, secondaire: true, chemin: true };
      for (const r of roads) {
        if (!r.points || r.points.length === 0) continue;
        // Jonctions toujours autorisees si multiLevel ON (pas dans le filtreR
        // qui ne liste que principal/secondaire/chemin). Sinon respect filtreR.
        // 🆕 v1.16.0 step2-drawable : les customs (cust-XXX) sont toujours
        // exportés (pas filtrés par roadsTypes qui ne liste que les
        // built-in). KARMA peut les masquer via le toggle visibilité.
        if (r.type !== "jonction" && !String(r.type).startsWith("cust-") && filtreR[r.type] === false) continue;
        // 🏗️ Multi-niveau : filtre sur les niveaux choisis dans la modale.
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
        // 🏗️ Multi-niveau : ronds aux extremites pour les jonctions.
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
          // Jonctions exclues du calcul des intersections (bridges interniveau).
          continue;
        }
        if (r.points.length >= 2) allRoadsForIntersect.push(r);
      }
    }

    // ---------- cercles d'intersection (dessinés APRÈS toutes les routes, AVANT les icônes) ----------
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

    // ---------- markers DIFFÉRÉS (icônes) — dessinés EN DERNIER (au-dessus des traits + cercles)
    // → respecte l'ordre demandé : ZONE (en bas) → TRAIT → CERCLE → ICÔNE (en haut)
    for (const p of deferredMarkers) {
      const img = await getIconUrl(p);
      drawMarker(img, p.x, p.y, 50 * scale);
    }

    // ---------- mesure (distance + surface) ----------
    if (opts.ann.mesure && window.getMeasurePoints) {
      // 📐 Polyline distance (rouge plein, comme avant)
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
      // ⬛ Polygone surface (v1.12.0-fix) — même couleur que distance
      // mais fill semi-transparent (cohérent avec le rendu Leaflet on-screen).
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

    // ---------- tracker (chemin parcouru + position courante) ----------
    if (opts.ann.tracker) {
      // 1) Tracé parcouru (polyline bleu Leaflet par défaut)
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
      // 2) Position courante (icône tracker)
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

    // ---------- légende intégrée ----------
    if (opts.legende) {
      await _dessinerLegende(ctx, opts.legende, W, H, scale, iconCache, tagsUtilises);
    }

    return canvas;
  }

  // =========================
  // DESSIN DE LA LÉGENDE INTÉGRÉE
  // =========================
  async function _dessinerLegende(ctx, leg, canvasW, canvasH, scale, iconCache, tagsUtilises) {
    const config = window.PLAN_CONFIG;

    // Tailles selon mode — titre plus modeste, plus proche des libellés
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

    // Dark theme — cohérent avec les modales de l'application
    // Fond sombre, accent bleu vif, texte clair
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
      // 🆕 v1.10.3-pdf-v3 (KARMA "pas en theme sombre, un truc plus pro
      // mais même principe") : style print/impression — fond blanc opaque,
      // texte foncé, accent bleu saturé. Adapté aux PDF/print, lisible à
      // l'œil sur papier sans inverser la palette dark-on-screen.
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

    // Construire la liste des entrées
    const entrees = [];

    // Métadonnées — rendues à part (pas de section "Plan", juste les infos)
    let metaLignes = [];
    if (leg.contenu.meta && config.plan) {
      const titre  = (config.plan.name || window.I18n.t("imgexport.legende.metaPlanDefaut"));
      const ver    = config.plan.version ? " " + config.plan.version : "";
      const auteur = config.plan.author  ? " — " + config.plan.author : "";
      // Date au format FR : jj/mm/aaaa
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const aaaa = d.getFullYear();
      metaLignes = [titre + ver + auteur, dd + "/" + mm + "/" + aaaa];
    }

    // 🆕 v1.16.0 step 2 : pour les 4 catégories (icones, traces, zones,
    // structures), on délègue à window.LegendCustomization qui applique la
    // cascade session > plan > default. Les libellés peuvent être renommés
    // et certaines entrées peuvent être cachées par l'utilisateur (UI
    // dans la modale Export PNG). Fallback gracieux si le module n'est
    // pas dispo (legacy hardcodés conservés en commentaire ci-dessous).
    const LC = window.LegendCustomization;

    // Icônes — découpées en 3 sous-groupes (cohérent avec la légende d'aide)
    if (leg.contenu.icones && config.icons) {
      const exclu = ["default"];
      if (!leg.contenu.track) exclu.push("track");

      // 3 sous-groupes ordonnés (les autres tags inconnus iront en "Signalétique")
      const GROUPES_ICONES = [
        { titre: window.I18n.t("imgexport.legGroupe.puits"),        cles: ["pa", "pb", "pc", "pe", "ps"] },
        { titre: window.I18n.t("imgexport.legGroupe.acces"),        cles: ["peo", "pef", "eso", "esf", "cao", "caf"] },
        { titre: window.I18n.t("imgexport.legGroupe.signaletique"), cles: ["salle", "chatiere", "passage", "danger", "info", "elec", "epure", "vehicule", "plaque", "portail"] },
        // 🆕 v1.41.0 D — Catégorie Secours (Vue OSM × Mode Secours).
        { titre: window.I18n.t("imgexport.legGroupe.secours"),      cles: ["entree_plan"] }
      ];
      const clesGroupees = new Set(GROUPES_ICONES.flatMap(function(g) { return g.cles; }));

      // Cumul : tags du plan-config + tags built-in (_iconMap) pour ne rien manquer
      const tagsConnus = new Set();
      Object.keys(config.icons || {}).forEach(function(t) { tagsConnus.add(t); });
      Object.keys(window._iconMap || {}).forEach(function(t) { tagsConnus.add(t); });

      // FILTRE PAR USAGE RÉEL : si on a la liste des tags utilisés, on ne garde
      // que ceux qui sont effectivement présents sur le plan exporté.
      // (tagsUtilises peut être null/undefined en mode preview rapide → pas de filtre)
      const filtreUsage = tagsUtilises && tagsUtilises.size >= 0;

      // Libellé résolu (cascade LegendCustomization si dispo, sinon fallback).
      function _iconLabel(tag) {
        if (LC) return LC.getLabel("icones", tag);
        // Fallback : si le module n'est pas chargé, on retombe sur le tag brut.
        return tag;
      }
      function _iconVisible(tag) {
        if (LC) return LC.isVisible("icones", tag);
        return true;
      }

      // Construire chaque sous-groupe
      GROUPES_ICONES.forEach(function(groupe) {
        const lignes = [];
        groupe.cles.forEach(function(tag) {
          if (exclu.includes(tag)) return;
          if (!tagsConnus.has(tag)) return;
          if (filtreUsage && !tagsUtilises.has(tag)) return;  // ← filtre par usage réel
          if (!_iconVisible(tag)) return;                      // ← v1.16.0 step 2 : show/hide
          const url = _iconePourTag(tag);
          if (!url) return;
          lignes.push({ label: _iconLabel(tag), iconUrl: url });
        });
        if (lignes.length > 0) entrees.push({ section: groupe.titre, lignes: lignes });
      });

      // Tags custom non répertoriés dans les 3 groupes → "Autres"
      // Option 5:a : on les affiche AVEC leur icône (custom ou défaut) si utilisés
      const lignesAutres = [];
      // Source des tags candidats : tagsConnus + tagsUtilises (pour capter les tags
      // créés dans la session qui ne sont ni dans plan-config ni dans _iconMap)
      const candidatsAutres = new Set(tagsConnus);
      if (tagsUtilises) tagsUtilises.forEach(function(t) { candidatsAutres.add(t); });

      candidatsAutres.forEach(function(tag) {
        if (exclu.includes(tag)) return;
        if (clesGroupees.has(tag)) return;
        if (filtreUsage && !tagsUtilises.has(tag)) return;  // ← filtre par usage réel
        if (!_iconVisible(tag)) return;
        // Récupérer l'URL : plan-config → _iconMap → default
        let url = _iconePourTag(tag);
        if (!url) {
          // Tag custom sans icône dédiée → utiliser l'icône par défaut (5:a).
          // v174 : default peut être divIcon → check _kta_iconUrl avant options.iconUrl.
          const def = window._iconMap && window._iconMap.default;
          url = (config.icons && config.icons.default)
             || (def && (def._kta_iconUrl || (def.options && def.options.iconUrl)))
             || null;
        }
        if (!url) return;
        lignesAutres.push({ label: _iconLabel(tag), iconUrl: url });
      });
      if (lignesAutres.length > 0) entrees.push({ section: window.I18n.t("imgexport.legGroupe.autres"), lignes: lignesAutres });

      // 🆕 v1.16.0 step 2 : entrées custom catégorie "icones" ajoutées par
      // l'user (cascade plan + session). Visible si isVisible et si iconUrl.
      if (LC) {
        const customsIcones = LC.listCustomEntries("icones")
          .filter(function(e) { return e.visible && e.iconUrl; })
          .map(function(e) { return { label: e.label, iconUrl: e.iconUrl }; });
        if (customsIcones.length > 0) {
          entrees.push({ section: window.I18n.t("imgexport.legGroupe.customIcones"), lignes: customsIcones });
        }
      }
    }

    // Tracés
    // 🪜 v169 (Karma_dev) : ajout de "Jonction interniveau" (magenta) — type
    // de tracé spécifique au mode multi-niveau, bridge entre 2 niveaux pour
    // le pathfinder. Visible dans la légende sans condition (si l'export ne
    // contient pas de jonction, la ligne reste mais inerte — minor).
    if (leg.contenu.traces) {
      const lignes = LC
        ? LC.listEntries("traces")
            .filter(function(e) { return e.visible; })
            .map(function(e) { return { label: e.label, lineColor: e.lineColor }; })
        : [
            { label: window.I18n.t("imgexport.legLabel.routePrincipale"), lineColor: "#00ff00" },
            { label: window.I18n.t("imgexport.legLabel.routeSecondaire"), lineColor: "#b000ff" },
            { label: window.I18n.t("imgexport.legLabel.chemin"),          lineColor: "#ffff00" },
            { label: window.I18n.t("imgexport.legLabel.jonction"),        lineColor: "#ff4ecb" }
          ];
      // Ajout des customs traces
      if (LC) {
        LC.listCustomEntries("traces")
          .filter(function(e) { return e.visible && (e.lineColor || e.fillColor); })
          .forEach(function(e) {
            lignes.push({ label: e.label, lineColor: e.lineColor || e.fillColor });
          });
      }
      if (lignes.length > 0) entrees.push({ section: window.I18n.t("imgexport.legSection.traces"), lignes: lignes });
    }

    // Zones
    // 🚫 v169 (Karma_dev) : ajout de "Inaccessible" (rouge foncé) — zone
    // bloquante pour le pathfinder (contrainte dure). Couleur uni rouge
    // foncé (pas de hachures dans cette pipe canvas — voir ZONE_STYLES_EXPORT).
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

    // 🏛️ v1.10.3 (KARMA "structures pas dans la légende") : section
    // Structures. Polygones (piliers + mur) avec stroke noir + fill couleur ;
    // polylines (fronts) avec lineColor uni. Couleurs cohérentes avec
    // STRUCTURE_STYLES (structures.js) et les helpers d'export PNG/KMZ
    // (front-1 jaune = pilier-1, front-2 orange = pilier-2 — hotfix v1.10.1-2).
    if (leg.contenu.structures) {
      const lignes = LC
        ? LC.listEntries("structures")
            .filter(function(e) { return e.visible; })
            .map(function(e) {
              // Distingue polylines (front-X : lineColor) des polygones
              // (pilier-X / mur : fillColor + borderColor). LegendCustomization
              // expose les 3 champs, on prend ceux qui sont set.
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
        // 🐛 v1.16.0 step2-drawable-fix : geometry first comme discriminator
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

    // ─────────────────────────────────────────────────
    // RÉPARTITION INTELLIGENTE EN 2 COLONNES
    // Algorithme : on parcourt les groupes dans l'ordre d'ajout et on les place
    // dans la colonne la moins remplie (en hauteur cumulée).
    // → équilibre automatique quel que soit le nombre d'icônes.
    // ─────────────────────────────────────────────────
    function _hauteurEstimee(section) {
      // Approximation : 1 unité pour le titre + 1 par ligne
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

    // Si une seule colonne est utilisée (cas extrême), équilibre forcé
    if (colDroite.length === 0 && colGauche.length > 1) {
      colDroite.push(colGauche.pop());
    }

    // Calculer la largeur max d'une colonne (mesurer libellés + titres de section)
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

    // Largeur de chaque colonne (libellé + icône + padding interne)
    const colInnerW_g = _largeurColonne(colGauche);
    const colInnerW_d = _largeurColonne(colDroite);
    const colW_g = colInnerW_g + ic + pad;   // icône + label
    const colW_d = colInnerW_d + ic + pad;

    // Largeur titre principal et méta (ils s'étalent en pleine largeur)
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

    // Espace entre les 2 colonnes
    const colGap = pad * 1.5;

    // Largeur de la boîte = max entre (titre/méta) et (col gauche + gap + col droite)
    const colsW = colDroite.length > 0
      ? colW_g + colGap + colW_d
      : colW_g;
    const contentW = Math.max(titreMetaW, colsW);
    const boiteW = contentW + pad * 2;

    // Hauteur :
    let totalH = pad;
    totalH += tfs * 1.2;                  // titre "Légende"
    totalH += pad * 0.8;                  // espace après titre
    if (metaLignes.length > 0) {
      totalH += metaLignes.length * lh * 0.8;
      totalH += pad * 0.6;
    }
    // Hauteur des colonnes (max des 2)
    const hCol_g = _hauteurColonne(colGauche);
    const hCol_d = _hauteurColonne(colDroite);
    totalH += Math.max(hCol_g, hCol_d);
    totalH += pad;
    const boiteH = totalH;

    // Position
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

    // Fond avec coins légèrement arrondis (cohérent avec les modales)
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

    // Titre principal "Légende"
    let cy = by + pad;
    ctx.save();
    ctx.fillStyle = S.titrePrincipal;
    ctx.font = "italic 600 " + tfs + "px Georgia, 'Times New Roman', serif";
    ctx.textBaseline = "top";
    ctx.fillText(window.I18n.t("imgexport.legende.titreImg"), bx + pad, cy);
    cy += tfs * 1.2;
    ctx.restore();

    // Trait fin sous le titre
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

    // Métadonnées en pleine largeur (style discret, Georgia)
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

    // ─────────────────────────────────────────────────
    // RENDU DES 2 COLONNES
    // ─────────────────────────────────────────────────
    const cyColStart = cy;
    const xColGauche = bx + pad;
    const xColDroite = bx + pad + colW_g + colGap;

    async function _dessinerSections(sections, xCol, yStart) {
      let cyLocal = yStart;

      for (const sec of sections) {
        // Titre de section
        ctx.save();
        ctx.fillStyle = S.titreSection;
        ctx.font = "bold " + fs + "px sans-serif";
        ctx.textBaseline = "top";
        ctx.fillText(sec.section, xCol, cyLocal);
        cyLocal += lh;
        ctx.restore();

        // Lignes
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

    // 🆕 v1.10.3-pdf-v3 (KARMA "générer une image de la légende") :
    // retourne les dimensions effectivement dessinées pour permettre à
    // pdfExport.js d'extraire la boîte légende et la coller dans le PDF.
    return { boiteW: boiteW, boiteH: boiteH, bx: bx, by: by };
  }

  // =========================
  // 🆕 v1.10.3 (PDF) : API PUBLIQUE — exposé pour pdfExport.js
  // =========================
  // Wrapper qui prend les opts simplifiées de pdfExport.js et construit le
  // dict complet attendu par _genererCanvasExport. Évite de réimplémenter
  // tout le pipeline de rendu canvas (icônes, zones, tracés, structures…).
  //
  // Forme attendue (toutes les clés sont optionnelles sauf ann) :
  //   {
  //     ann:               { points, roads, zones, structures, pointsTags,
  //                          roadsTypes, zonesTypes, structuresTypes, levels },
  //     scale:             1     // resol (1=natif, 0.5=½, 2=HD)
  //     bg:                "image"|"white"|"black"|"transparent"
  //     imageLayers:       { id: bool, ... } ← OBLIGATOIRE depuis v2 (PDF v2)
  //     dataLayers:        { id: bool, ... } ← OBLIGATOIRE depuis v2 (PDF v2)
  //   }
  //
  // Fallback rétrocompat v1 (booléens globaux) :
  //   {
  //     includeBaseImage:  bool   (= bg blanc si false)
  //     includeImgLayers:  bool   (auto-coche TOUS les calques image)
  //     includeDataLayers: bool   (auto-coche TOUS les calques data)
  //   }
  //
  // Retourne : Promise<HTMLCanvasElement>
  async function _publicGenererCanvas(userOpts) {
    const config = window.PLAN_CONFIG;
    const fullOpts = {
      ann:         userOpts.ann || {},
      legende:     null,
      format:      "png",
      resol:       userOpts.scale || 1,
      bg:          userOpts.bg    || "image",
      imageLayers: {},
      dataLayers:  {}
    };

    // 🆕 v2 (PDF v2) : si userOpts.imageLayers est un objet non-vide, on
    // l'utilise tel quel. Sinon, fallback v1 = auto-list booléen global.
    if (userOpts.imageLayers && typeof userOpts.imageLayers === "object"
        && Object.keys(userOpts.imageLayers).length > 0) {
      fullOpts.imageLayers = userOpts.imageLayers;
    } else if (userOpts.includeImgLayers !== false && userOpts.bg !== "white"
        && userOpts.bg !== "black" && userOpts.bg !== "transparent") {
      (config && config.imageLayers || []).forEach(function(l) {
        fullOpts.imageLayers[l.id] = true;
      });
    }

    // 🆕 v2 (PDF v2) : idem pour les data layers — control fin via dict.
    if (userOpts.dataLayers && typeof userOpts.dataLayers === "object"
        && Object.keys(userOpts.dataLayers).length > 0) {
      fullOpts.dataLayers = userOpts.dataLayers;
    } else if (userOpts.includeDataLayers !== false) {
      (config && config.dataLayers || []).forEach(function(l) {
        fullOpts.dataLayers[l.id] = true;
      });
    }

    // pointsTags : si absent, on autorise tout (tousActifs:true)
    if (!fullOpts.ann.pointsTags) {
      fullOpts.ann.pointsTags = { tagsCoches: new Set(), untaggedCoche: false, tousActifs: true };
    }

    return await _genererCanvasExport(fullOpts, false);
  }
  window.MyKTAMapExporterGenererCanvas = _publicGenererCanvas;

  // =========================
  // 🆕 v1.10.3-pdf-v3 : Génère un canvas standalone de la LÉGENDE seule
  // =========================
  // Approche KARMA "comme l'export PNG, on génère une image de la légende
  // que l'on colle dans le PDF". Évite tous les problèmes de font/emoji de
  // jsPDF Helvetica latin1, car la légende est une vraie image raster avec
  // ses icônes PNG, ses traits, ses polygones, ses emojis de sections.
  //
  // Pipeline :
  //   1. Crée un canvas temporaire grand (3000×3000 — large pour les
  //      légendes les plus chargées avec multi-niveau + icônes nombreuses)
  //   2. Appelle _dessinerLegende dessus, position forcée "haut-gauche"
  //      avec une petite marge interne (pour le shadow/border).
  //   3. _dessinerLegende retourne {boiteW, boiteH, bx, by} = la zone
  //      effectivement dessinée.
  //   4. Crée un canvas final aux dimensions exactes, drawImage le crop.
  //
  // legContenu : { icones, traces, zones, structures, track, meta }
  // bg : "transparent" (défaut) ou "opaque" (= la légende sur fond plein,
  //      utile si le footer PDF a un fond pâle qui s'accommode mal du
  //      semi-transparent natif de la boîte légende).
  //
  // Retourne : Promise<HTMLCanvasElement | null>
  //            (null si aucun contenu — pas d'icônes connues, pas de
  //             tracé, etc. — le caller doit gérer ce cas)
  async function _publicGenererCanvasLegende(userOpts) {
    userOpts = userOpts || {};
    const legContenu = userOpts.contenu || {
      icones: true, traces: true, zones: true, structures: true, track: false, meta: false
    };
    const legSize  = userOpts.size  || "standard";
    const legStyle = userOpts.style || "opaque";
    const scale    = userOpts.scale || 1;

    // Collecte des tagsUtilises pour ne montrer que les tags présents dans
    // les annotations actuelles + data layers — cohérent avec l'export PNG
    // avancé (filtre par usage réel).
    const tagsUtilises = userOpts.tagsUtilises || new Set();
    if (!userOpts.tagsUtilises) {
      // Auto-collecte session + embedded data layers (via helpers globaux)
      const pushTags = function(p) {
        if (p && Array.isArray(p.tags)) p.tags.forEach(function(t) {
          if (t && String(t).trim()) tagsUtilises.add(String(t));
        });
      };
      if (typeof window.getEditorPoints === "function") window.getEditorPoints().forEach(pushTags);
      // Data layers : fetch tous les points connus du dataLayerGroups Leaflet,
      // sinon scan _ktaDataMarkers (mais pas toujours rempli avec les tags).
      // Simplification : on fetch chaque dataLayer du plan-config.
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

    // Canvas temporaire suffisamment grand pour les légendes les plus
    // chargées. On garde un petit padding pour les ombres/bordures.
    const TMP_W = 3000, TMP_H = 3000;
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width  = TMP_W;
    tmpCanvas.height = TMP_H;
    const tmpCtx = tmpCanvas.getContext("2d", { alpha: true });

    // Options de légende : position forcée haut-gauche pour simplifier le
    // crop. customX/Y = 0 pour coller au bord (marges gérées par caller).
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
      // _dessinerLegende retourne early si entrees.length === 0 — pas de
      // contenu cochable. Caller doit gérer.
      return null;
    }

    // Canvas final aux dimensions exactes (+ petit padding pour bordure)
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

  // =========================
  // HELPERS — visibilité actuelle des calques
  // =========================
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
