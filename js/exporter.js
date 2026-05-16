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
    const config = window.PLAN_CONFIG;
    if (!config || !config.plan) {
      alert("Configuration du plan introuvable");
      return;
    }

    // Compter les éléments de session
    const nbPoints  = window.getEditorPoints  ? window.getEditorPoints().length  : 0;
    const nbRoads   = window.getRoads         ? window.getRoads().length         : 0;
    const nbZones   = window.getZones         ? window.getZones().length         : 0;
    const nbMesure  = window.getMeasurePoints ? window.getMeasurePoints().length : 0;
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
          ? "AUCUN niveau coché — l'export sera vide"
          : "niveau" + (_visibleLevelsForExport.length > 1 ? "x" : "") + " " +
            _visibleLevelsForExport.map(function(l){return "Niv " + l;}).join(", "))
      : null;

    const modal = document.createElement("div");
    modal.id = "kta-export-modal";
    modal.className = "kta-readme-modal-overlay";

    modal.innerHTML = `
      <div class="kta-readme-modal-boite" style="max-width:580px; height:auto; max-height:92vh;">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">🖼️ Exporter le plan</span>
          <button class="kta-panneau-close" id="kta-export-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps">

          <!-- TOGGLE MODE -->
          <div class="kta-conv-sens-wrap">
            <button class="kta-conv-sens-btn ${modeInitial === 'rapide' ? 'active' : ''}" id="kta-export-mode-rapide">
              <span class="kta-conv-sens-label">⚡ Mode rapide</span>
              <span class="kta-conv-sens-desc">
                ${_mlOn
                  ? "Ce qui est visible sur la carte (filtre niveau actuel), PNG résolution originale"
                  : "Ce qui est visible sur la carte, PNG résolution originale"}
              </span>
            </button>
            <button class="kta-conv-sens-btn ${modeInitial === 'avance' ? 'active' : ''}" id="kta-export-mode-avance">
              <span class="kta-conv-sens-label">🎨 Mode avancé</span>
              <span class="kta-conv-sens-desc">Choix des calques, niveaux, légende intégrée, format personnalisable</span>
            </button>
          </div>

          <!-- MODE RAPIDE -->
          <div id="kta-export-rapide" style="display:${modeInitial === 'rapide' ? 'block' : 'none'};">
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">📋 Contenu</div>
              <p style="font-size:13px; color:#c0c8d8; margin:0; line-height:1.7;">
                ✓ Image du plan + calques actuellement <strong>visibles</strong> sur la carte<br>
                ✓ Annotations de la session (${nbPoints} point(s), ${nbRoads} tracé(s), ${nbZones} zone(s))<br>
                ${_niveauxRapideTxt
                  ? '<span style="color:#f4c542;">🏗️ ' + _niveauxRapideTxt + '</span> — change le filtre via le bouton niveau pour exporter autre chose, ou passe en <strong>🎨 Mode avancé</strong> pour choisir explicitement<br>'
                  : ''}
                ✓ Format PNG, résolution originale<br>
                ${nbMesure > 0 ? '✓ Mesure de distance (' + nbMesure + ' points)<br>' : ''}
              </p>
            </div>
          </div>

          <!-- MODE AVANCÉ -->
          <div id="kta-export-avance" style="display:${modeInitial === 'avance' ? 'block' : 'none'};">

            <!-- Calques d'image -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">🖼️ Calques d'image</div>
              <div id="kta-export-image-layers"></div>
            </div>

            <!-- Calques de données -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">🗂️ Calques de données</div>
              <div id="kta-export-data-layers"></div>
            </div>

            <!-- Annotations -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">✏️ Annotations de session</div>
              <div id="kta-export-annotations"></div>
            </div>

            <!-- 🏗️ Niveaux (depuis v148, conditionnel sur multiLevel ON) -->
            <div class="kta-aide-section" id="kta-export-levels-section" style="display:none;">
              <div class="kta-aide-section-titre">🏗️ Niveaux à exporter</div>
              <p style="font-size:11.5px; color:#8892a4; margin:0 0 8px 0; line-height:1.5;">
                Sélectionne les niveaux à inclure dans l'export. Pré-coché sur les niveaux
                actuellement visibles. Les jonctions sont incluses si au moins un de leurs
                endpoints touche un niveau coché.
              </p>
              <div id="kta-export-levels" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
            </div>

            <!-- Légende intégrée -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">📋 Légende intégrée</div>
              <label class="kta-export-cb-row" style="font-weight:600;">
                <input type="checkbox" id="kta-export-legende-on">
                <span>Inclure la légende sur le plan</span>
              </label>
              <div id="kta-export-legende-options" style="display:none; margin-top:10px;">

                <div style="margin-top:8px;">
                  <div class="kta-cfg-label" style="margin-bottom:4px;">Position</div>
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                    <label class="kta-export-radio-row"><input type="radio" name="leg_pos" value="haut-gauche" checked><span>Coin haut-gauche</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_pos" value="haut-droit"><span>Coin haut-droit</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_pos" value="bas-gauche"><span>Coin bas-gauche</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_pos" value="bas-droit"><span>Coin bas-droit</span></label>
                    <label class="kta-export-radio-row" style="grid-column: span 2;"><input type="radio" name="leg_pos" value="custom"><span>Position personnalisée</span></label>
                  </div>

                  <div id="kta-export-leg-custom" style="display:none; margin-top:8px;">
                    <button class="kta-btn kta-btn-ghost" id="kta-export-leg-pick" style="width:100%; margin-bottom:6px;">
                      🎯 Sélectionner sur la carte
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
                  <div class="kta-cfg-label" style="margin-bottom:4px;">Style</div>
                  <div style="display:flex; gap:6px;">
                    <label class="kta-export-radio-row"><input type="radio" name="leg_style" value="opaque" checked><span>Opaque</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_style" value="semi"><span>Semi-transparent</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_style" value="filigrane"><span>Filigrane</span></label>
                  </div>
                </div>

                <div style="margin-top:12px;">
                  <div class="kta-cfg-label" style="margin-bottom:4px;">Taille</div>
                  <div style="display:flex; gap:6px;">
                    <label class="kta-export-radio-row"><input type="radio" name="leg_size" value="compact"><span>Compact</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_size" value="standard" checked><span>Standard</span></label>
                    <label class="kta-export-radio-row"><input type="radio" name="leg_size" value="large"><span>Large</span></label>
                  </div>
                </div>

                <div style="margin-top:12px;">
                  <div class="kta-cfg-label" style="margin-bottom:4px;">Contenu de la légende</div>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_icones" checked><span>Icônes (puits, signalétique, etc.)</span></label>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_traces" checked><span>Tracés (routes / chemins)</span></label>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_zones" checked><span>Zones (remblais / effondrements)</span></label>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_track"><span>Tag du tracker</span></label>
                  <label class="kta-export-cb-row"><input type="checkbox" id="leg_c_meta" checked><span>Métadonnées du plan (nom, version, auteur, date)</span></label>
                </div>

              </div>
            </div>

            <!-- Format & qualité -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">⚙️ Format &amp; qualité</div>
              <div style="display:flex; gap:14px; flex-wrap:wrap;">
                <div>
                  <div class="kta-cfg-label" style="margin-bottom:4px;">Format</div>
                  <label class="kta-export-radio-row"><input type="radio" name="format" value="png" checked><span>PNG</span></label>
                  <label class="kta-export-radio-row"><input type="radio" name="format" value="jpeg"><span>JPEG (qualité 90%)</span></label>
                </div>
                <div>
                  <div class="kta-cfg-label" style="margin-bottom:4px;">Résolution</div>
                  <label class="kta-export-radio-row"><input type="radio" name="resol" value="1" checked><span>Originale</span></label>
                  <label class="kta-export-radio-row"><input type="radio" name="resol" value="0.5"><span>½</span></label>
                  <label class="kta-export-radio-row"><input type="radio" name="resol" value="0.25"><span>¼</span></label>
                </div>
              </div>
            </div>

            <!-- Aperçu -->
            <div class="kta-aide-section">
              <div class="kta-aide-section-titre">👁️ Aperçu</div>
              <div style="display:flex; justify-content:center; background:rgba(255,255,255,0.04); border-radius:6px; padding:8px;">
                <canvas id="kta-export-preview" width="320" height="200" style="max-width:100%; border:1px solid rgba(255,255,255,0.1); border-radius:4px;"></canvas>
              </div>
              <p id="kta-export-preview-info" style="font-size:11px; color:#8892a4; margin:6px 0 0; text-align:center;"></p>
            </div>

          </div>

          <!-- ACTIONS -->
          <div class="kta-conv-actions" style="margin-top:14px;">
            <button class="kta-btn kta-btn-ghost"   id="kta-export-annuler">Annuler</button>
            <button class="kta-btn kta-btn-primary" id="kta-export-go">⬇️ Télécharger</button>
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
      cont.innerHTML = '<p style="font-size:12px; color:#8892a4; margin:0;">Aucun calque image</p>';
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
      cont.innerHTML = '<p style="font-size:12px; color:#8892a4; margin:0;">Aucun calque de données</p>';
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
    if (entry && entry.options && entry.options.iconUrl) return entry.options.iconUrl;
    return null;
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
        const label = item.isUntagged ? "<em>(sans tag)</em>" : _escapeHtmlExport(item.tag);
        return `<label class="kta-export-cb-row" style="margin-left:24px; font-size:12px;">
          <input type="checkbox" id="${id}" data-layer-tag-of="${layerCfg.id}" checked>
          <span>${iconHtml}${label} <span style="color:#8892a4;">(${item.count})</span></span>
        </label>`;
      }).join("");
    }

    // Sous-cases types de routes embarquées
    if (hasRoads) {
      const roadLabels = { principal: "🟩 Principaux", secondaire: "🟪 Secondaires", chemin: "🟨 Chemins" };
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
      const zoneLabels = { eau: "🟦 Eau", remblais: "⬛ Remblais", effondrement: "🟥 Effondrement", inaccessible: "⛔ Inaccessible" };
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
             '<span style="font-family:monospace; font-weight:600; color:#f4c542; margin-left:6px;">Niv ' + lvl + '</span>' +
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
    const roadsByType = {
      principal:  roads.filter(function(r) { return r.type === "principal";  }).length,
      secondaire: roads.filter(function(r) { return r.type === "secondaire"; }).length,
      chemin:     roads.filter(function(r) { return r.type === "chemin";     }).length
    };
    const zonesByType = {
      eau:          zones.filter(function(z) { return z.type === "eau";          }).length,
      remblais:     zones.filter(function(z) { return z.type === "remblais";     }).length,
      effondrement: zones.filter(function(z) { return z.type === "effondrement"; }).length
    };

    // Position du tracker : toujours active (la position courante existe au minimum)
    // Inclut le tracé parcouru si > 1 point
    const trackerLabel = (nbTrackerPath && nbTrackerPath > 1)
      ? 'Position du tracker <span style="color:#8892a4;">(+ tracé ' + nbTrackerPath + ' pts)</span>'
      : 'Position du tracker';

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
        const label = item.isUntagged ? "<em>(sans tag)</em>" : _escapeHtmlExport(item.tag);
        return `<label class="kta-export-cb-row" style="margin-left:24px; font-size:12px;">
          <input type="checkbox" id="${id}" data-session-tag="1" checked>
          <span>${iconHtml}${label} <span style="color:#8892a4;">(${item.count})</span></span>
        </label>`;
      }).join("");
    }

    cont.innerHTML =
      row("points",  "Points ajoutés",          nbPoints,  true) +
      pointsTagsHtml +

      row("roads",   "Tracés / routes",         nbRoads,   true) +
      rowSub("roads_principal",  "🟩 Principaux",  roadsByType.principal,  true) +
      rowSub("roads_secondaire", "🟪 Secondaires", roadsByType.secondaire, true) +
      rowSub("roads_chemin",     "🟨 Chemins",     roadsByType.chemin,     true) +

      row("zones",   "Zones",                   nbZones,   true) +
      rowSub("zones_eau",          "🟦 Eau",           zonesByType.eau,          true) +
      rowSub("zones_remblais",     "⬛ Remblais",      zonesByType.remblais,     true) +
      rowSub("zones_effondrement", "🟥 Effondrement",  zonesByType.effondrement, true) +
      rowSub("zones_inaccessible", "⛔ Inaccessible",  zonesByType.inaccessible, true) +

      row("mesure",  "Mesure de distance",      nbMesure,  false) +
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

    // Tous les autres inputs déclenchent l'aperçu
    modal.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(function(el) {
      el.addEventListener("change", _planifierApercu);
    });

    // Action Télécharger
    btnGo.addEventListener("click", async function() {
      const modeRapideActif = btnRapide.classList.contains("active");
      btnGo.disabled = true;
      btnGo.textContent = "⏳ Génération…";
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
          erreurEl.textContent = "Erreur : " + (err.message || err);
          erreurEl.style.display = "block";
        }
        btnGo.disabled = false;
        btnGo.textContent = "⬇️ Télécharger";
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
      resol:       _radioVal("resol")
    };
    document.querySelectorAll('[data-layer-type="image"]').forEach(function(cb) {
      etat.imageLayers[cb.dataset.layerId] = cb.checked;
    });
    document.querySelectorAll('[data-layer-type="data"]').forEach(function(cb) {
      etat.dataLayers[cb.dataset.layerId] = cb.checked;
    });
    ["points","roads","zones","mesure","tracker"].forEach(function(k) {
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
    const legOn = document.getElementById("kta-export-legende-on");
    if (legOn && legOn.checked) {
      etat.legende = {
        position: _radioVal("leg_pos"),
        customX: parseFloat(document.getElementById("kta-export-leg-x").value) || 0,
        customY: parseFloat(document.getElementById("kta-export-leg-y").value) || 0,
        style:   _radioVal("leg_style"),
        size:    _radioVal("leg_size"),
        contenu: {
          icones: document.getElementById("leg_c_icones").checked,
          traces: document.getElementById("leg_c_traces").checked,
          zones:  document.getElementById("leg_c_zones").checked,
          track:  document.getElementById("leg_c_track").checked,
          meta:   document.getElementById("leg_c_meta").checked
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
    banner.innerHTML = "🎯 Cliquez sur le plan pour placer la légende (coin haut-gauche). Échap pour annuler.";
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
      resol:       parseFloat(_radioVal("resol") || "1")
    };
    document.querySelectorAll('[data-layer-type="image"]').forEach(function(cb) {
      opts.imageLayers[cb.dataset.layerId] = cb.checked;
    });
    document.querySelectorAll('[data-layer-type="data"]').forEach(function(cb) {
      opts.dataLayers[cb.dataset.layerId] = cb.checked;
    });
    ["points","roads","zones","mesure","tracker"].forEach(function(k) {
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
          icones: document.getElementById("leg_c_icones").checked,
          traces: document.getElementById("leg_c_traces").checked,
          zones:  document.getElementById("leg_c_zones").checked,
          track:  document.getElementById("leg_c_track").checked,
          meta:   document.getElementById("leg_c_meta").checked
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
          throw new Error(
            "Export impossible : le plan est trop grand pour être encodé par le navigateur " +
            "(PNG et JPEG ont tous deux échoué). Réduis la résolution (½ ou ¼) dans les " +
            "options d'export pour contourner la limite mémoire."
          );
        }
      } else {
        throw new Error(
          "Export JPEG impossible : le plan est trop grand pour être encodé. " +
          "Réduis la résolution (½ ou ¼) dans les options d'export."
        );
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
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

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
        img.onerror = function() { rej(new Error("Image non chargée : " + src)); };
        img.src = src;
      });
    }

    // ---------- image principale ----------
    try {
      const baseImg = await loadImage(config.plan.baseImage);
      ctx.drawImage(baseImg, 0, 0, W, H);
    } catch(e) { console.warn("[Export] base image :", e); }

    // ---------- calques d'image cochés ----------
    const layers = (config.imageLayers || []).slice().sort(function(a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    for (const layerCfg of layers) {
      if (!opts.imageLayers[layerCfg.id]) continue;
      try {
        const img = await loadImage(layerCfg.file);
        ctx.drawImage(img, 0, 0, W, H);
      } catch(e) { console.warn("[Export] calque image :", layerCfg.file, e); }
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
      const ZS = {
        eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7,  weight: 3, opacity: 1 },
        remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7,  weight: 3, opacity: 1 },
        effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7,  weight: 3, opacity: 1 },
        // v169 : Zone inaccessible. Pour l'export canvas PNG, on utilise un
        // rouge fonce uni semi-transparent (les hachures SVG runtime ne sont
        // pas portables tel quel au canvas — perte acceptable pour l'export).
        inaccessible: { color: "#5a0a0a", fillColor: "#7a0000", fillOpacity: 0.65, weight: 3, opacity: 1 }
      };
      const ordre = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
      const filtreZ = opts.ann.zonesTypes || { eau: true, remblais: true, effondrement: true, inaccessible: true };
      const triees = [...zones]
        .filter(function(z) { return filtreZ[z.type] !== false; })
        // 🏗️ Multi-niveau : filtre sur les niveaux coches dans la modale Avancé
        .filter(_itemPasseLevels)
        .sort(function(a, b) {
          return (ordre[a.type] ?? 99) - (ordre[b.type] ?? 99);
        });
      for (const z of triees) {
        if (!z.points || z.points.length < 3) continue;
        const s = ZS[z.type] || ZS.remblais;
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

    const ZS_EMBED = {
      eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7, weight: 3, opacity: 1 },
      remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7, weight: 3, opacity: 1 },
      effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7, weight: 3, opacity: 1 }
    };
    const RS_EMBED = {
      principal:   { color: "#00ff00", weight: 5, opacity: 1 },
      secondaire:  { color: "#b000ff", weight: 5, opacity: 1 },
      chemin:      { color: "#ffff00", weight: 5, opacity: 1 }
    };

    // Collecte des routes (embedded + editable) pour dessiner les cercles d'intersection à la fin
    const allRoadsForIntersect = [];
    // Markers DIFFÉRÉS : on les collecte pendant la boucle des calques mais on les dessine
    // APRÈS toutes les routes + cercles, pour respecter l'ordre ZONE → TRAIT → CERCLE → ICÔNE
    const deferredMarkers = []; // [{p, layerId}]

    // ---------- couches data (markers + roads/zones embarqués) ----------
    const _diagAdv = { layersVisited: 0, layersSkipped: 0, embZones: 0, embRoads: 0, embPoints: 0, fetchFails: 0 };
    const _debugAdv = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);
    for (const layerCfg of (config.dataLayers || [])) {
      const cocheModale = !!opts.dataLayers[layerCfg.id];
      if (_debugAdv) console.log("[Export avancé] layer", layerCfg.id, "→ coche modale:", cocheModale);
      if (!cocheModale) { _diagAdv.layersSkipped++; continue; }
      _diagAdv.layersVisited++;

      let pts = [];
      let embeddedRoads = [];
      let embeddedZones = [];

      if (layerCfg.id === "editor") {
        if (opts.ann.points && window.getEditorPoints) pts = window.getEditorPoints();
      } else {
        try {
          const r = await fetch(layerCfg.file);
          const j = await r.json();
          pts = j.data || [];
          embeddedRoads = Array.isArray(j.roads) ? j.roads : [];
          embeddedZones = Array.isArray(j.zones) ? j.zones : [];
          if (_debugAdv) console.log("[Export avancé] fetch", layerCfg.id, "→ pts:", pts.length, "roads:", embeddedRoads.length, "zones:", embeddedZones.length);
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
        _drawPolygon(z.points || [], ZS_EMBED[z.type] || ZS_EMBED.remblais);
        _diagAdv.embZones++;
      });

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
        _drawPolyline(r.points || [], RS_EMBED[r.type] || { color: "#ffffff", weight: 5, opacity: 1 });
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
      const RS = {
        principal:   { color: "#00ff00", weight: 5 },
        secondaire:  { color: "#b000ff", weight: 5 },
        chemin:      { color: "#ffff00", weight: 5 },
        // 🏗️ Multi-niveau (v148) : jonction = magenta plein (canvas n'a
        // pas de dashArray natif dans cette pipe). Endpoints marques en
        // ronds blanc+magenta plus bas pour parite avec l'on-map.
        jonction:    { color: "#ff4ecb", weight: 5 }
      };
      const filtreR = opts.ann.roadsTypes || { principal: true, secondaire: true, chemin: true };
      for (const r of roads) {
        if (!r.points || r.points.length === 0) continue;
        // Jonctions toujours autorisees si multiLevel ON (pas dans le filtreR
        // qui ne liste que principal/secondaire/chemin). Sinon respect filtreR.
        if (r.type !== "jonction" && filtreR[r.type] === false) continue;
        // 🏗️ Multi-niveau : filtre sur les niveaux choisis dans la modale.
        if (!_itemPasseLevels(r)) continue;
        const s = RS[r.type] || { color: "white", weight: 5 };
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

    // ---------- mesure ----------
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
      }
    };
    const S = STYLES[leg.style] || STYLES.opaque;

    // Construire la liste des entrées
    const entrees = [];

    // Métadonnées — rendues à part (pas de section "Plan", juste les infos)
    let metaLignes = [];
    if (leg.contenu.meta && config.plan) {
      const titre  = (config.plan.name || "Plan");
      const ver    = config.plan.version ? " " + config.plan.version : "";
      const auteur = config.plan.author  ? " — " + config.plan.author : "";
      // Date au format FR : jj/mm/aaaa
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const aaaa = d.getFullYear();
      metaLignes = [titre + ver + auteur, dd + "/" + mm + "/" + aaaa];
    }

    // Icônes — découpées en 3 sous-groupes (cohérent avec la légende d'aide)
    if (leg.contenu.icones && config.icons) {
      const LBL = {
        salle: "Salle", pa: "Puits Aération", pc: "Puits Comblé",
        pb: "Puits Bouché", pe: "Puits au sol / Bassin", ps: "Puits extraction",
        peo: "Puits à échelon ouvert", pef: "Puits à échelon fermé",
        eso: "Escalier service ouvert", esf: "Escalier service fermé",
        cao: "Cavage ouvert", caf: "Cavage fermé",
        passage: "Passage", chatiere: "Chatière", vehicule: "Véhicule",
        danger: "Danger", info: "Information", elec: "Électricité", epure: "Épure",
        plaque: "Plaque indication"
      };

      const exclu = ["default"];
      if (!leg.contenu.track) exclu.push("track");

      // 3 sous-groupes ordonnés (les autres tags inconnus iront en "Signalétique")
      const GROUPES_ICONES = [
        { titre: "🕳️ Puits",        cles: ["pa", "pb", "pc", "pe", "ps"] },
        { titre: "🪜 Accès",         cles: ["peo", "pef", "eso", "esf", "cao", "caf"] },
        { titre: "⚠️ Signalétique", cles: ["salle", "chatiere", "passage", "danger", "info", "elec", "epure", "vehicule", "plaque"] }
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

      // Construire chaque sous-groupe
      GROUPES_ICONES.forEach(function(groupe) {
        const lignes = [];
        groupe.cles.forEach(function(tag) {
          if (exclu.includes(tag)) return;
          if (!tagsConnus.has(tag)) return;
          if (filtreUsage && !tagsUtilises.has(tag)) return;  // ← filtre par usage réel
          const url = _iconePourTag(tag);
          if (!url) return;
          lignes.push({ label: LBL[tag] || tag, iconUrl: url });
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
        // Récupérer l'URL : plan-config → _iconMap → default
        let url = _iconePourTag(tag);
        if (!url) {
          // Tag custom sans icône dédiée → utiliser l'icône par défaut (5:a)
          url = (config.icons && config.icons.default)
             || (window._iconMap && window._iconMap.default && window._iconMap.default.options && window._iconMap.default.options.iconUrl)
             || null;
        }
        if (!url) return;
        lignesAutres.push({ label: LBL[tag] || tag, iconUrl: url });
      });
      if (lignesAutres.length > 0) entrees.push({ section: "🏷️ Autres", lignes: lignesAutres });
    }

    // Tracés
    // 🪜 v169 (Karma_dev) : ajout de "Jonction interniveau" (magenta) — type
    // de tracé spécifique au mode multi-niveau, bridge entre 2 niveaux pour
    // le pathfinder. Visible dans la légende sans condition (si l'export ne
    // contient pas de jonction, la ligne reste mais inerte — minor).
    if (leg.contenu.traces) {
      entrees.push({ section: "🛣️ Tracés", lignes: [
        { label: "Route principale",      lineColor: "#00ff00" },
        { label: "Route secondaire",      lineColor: "#b000ff" },
        { label: "Chemin",                lineColor: "#ffff00" },
        { label: "Jonction interniveau",  lineColor: "#ff4ecb" }
      ]});
    }

    // Zones
    // 🚫 v169 (Karma_dev) : ajout de "Inaccessible" (rouge foncé) — zone
    // bloquante pour le pathfinder (contrainte dure). Couleur uni rouge
    // foncé (pas de hachures dans cette pipe canvas — voir ZONE_STYLES_EXPORT).
    if (leg.contenu.zones) {
      entrees.push({ section: "⬛ Zones", lignes: [
        { label: "Eau",          fillColor: "#3aa9e8", borderColor: "#0066aa" },
        { label: "Remblais",     fillColor: "#5a5a68", borderColor: "#3a3a44" },
        { label: "Effondrement", fillColor: "#ff3333", borderColor: "#cc0000" },
        { label: "Inaccessible", fillColor: "#7a0000", borderColor: "#5a0a0a" }
      ]});
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
    const wTitre = ctx.measureText("Légende").width;
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
    ctx.fillText("Légende", bx + pad, cy);
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
  }

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
