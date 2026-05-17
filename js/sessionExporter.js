// =========================
// SESSION EXPORTER — Modale d'export de session avec 3 modes
// =========================
// Modes disponibles :
//   • 🚀 Full       — points + tracés + zones (sans tracker, sans mesure)
//   • 🎨 Avancé     — sélection fine + sortie 1 fichier ou ZIP multi-fichiers
//                     (peut inclure le tracker en option)
//   • 🔄 Conversion — convertit en calque de données (devmap-data) prêt à
//                     intégrer dans plan-config.json
//
// Entrée publique : window.ouvrirExportSessionModal()
// =========================

(function() {
  "use strict";

  let _modal = null;
  let _activeTab = "full"; // "full" | "advanced" | "conversion"

  // État de l'onglet Conversion (bidirectionnel depuis 08/05/2026)
  let _convDirection      = "ed2data"; // "ed2data" (session→data) | "data2ed" (data→session)
  let _convUploadedJson   = null;      // JSON parsé du fichier uploadé (mode data2ed)
  let _convUploadedName   = "";        // nom du fichier uploadé (mode data2ed)

  // ========== STYLES ==========
  function _injecterStyles() {
    if (document.getElementById("kta-session-export-styles")) return;
    const s = document.createElement("style");
    s.id = "kta-session-export-styles";
    s.textContent = `
      #kta-session-export-modal .kta-readme-modal-boite {
        max-width: 560px; width: 95%;
        display: flex; flex-direction: column;
        max-height: 90vh;
      }

      .kta-ses-tabs {
        display: flex;
        gap: 4px;
        padding: 12px 18px 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        background: var(--bg-modal, #1a1f2e);
      }
      .kta-ses-tab {
        flex: 1;
        padding: 10px 8px;
        background: transparent;
        color: #8892a4;
        border: 1px solid transparent;
        border-radius: 6px 6px 0 0;
        cursor: pointer;
        font-size: 13px;
        font-family: inherit;
        font-weight: 500;
        transition: all 0.12s;
      }
      .kta-ses-tab:hover {
        color: #c0c8d8;
        background: rgba(140,180,255,0.05);
      }
      .kta-ses-tab.active {
        color: #8cb4ff;
        background: rgba(140,180,255,0.1);
        border-color: rgba(140,180,255,0.3);
        border-bottom-color: transparent;
      }

      .kta-ses-content {
        padding: 18px;
        overflow-y: auto;
        flex: 1;
      }

      .kta-ses-intro {
        font-size: 13px;
        color: #c0c8d8;
        margin-bottom: 16px;
        line-height: 1.5;
      }

      .kta-ses-section {
        margin-bottom: 18px;
      }
      .kta-ses-section-title {
        font-size: 12px;
        font-weight: 600;
        color: #8cb4ff;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }

      .kta-ses-cb-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 4px;
        font-size: 13px;
        color: #e8eaf0;
        cursor: pointer;
        border-radius: 4px;
      }
      .kta-ses-cb-row:hover {
        background: rgba(140,180,255,0.06);
      }
      .kta-ses-cb-row input[type="checkbox"] {
        width: 16px; height: 16px;
        cursor: pointer;
        accent-color: #8cb4ff;
      }
      .kta-ses-cb-row .kta-ses-count {
        color: #8892a4;
        font-size: 12px;
      }
      .kta-ses-cb-sub {
        margin-left: 28px;
        font-size: 12px;
      }

      .kta-ses-radio-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 4px;
        font-size: 13px;
        color: #e8eaf0;
        cursor: pointer;
        border-radius: 4px;
      }
      .kta-ses-radio-row:hover {
        background: rgba(140,180,255,0.06);
      }
      .kta-ses-radio-row input[type="radio"] {
        accent-color: #8cb4ff;
      }
      .kta-ses-radio-row .kta-ses-radio-hint {
        color: #8892a4;
        font-size: 12px;
        margin-left: 4px;
      }

      .kta-ses-summary {
        background: rgba(140,180,255,0.06);
        border: 1px solid rgba(140,180,255,0.18);
        border-radius: 6px;
        padding: 12px 14px;
        font-size: 13px;
        color: #c0c8d8;
        line-height: 1.7;
      }
      .kta-ses-summary strong {
        color: #e8eaf0;
      }
      .kta-ses-summary .kta-ses-zero {
        color: #8892a4;
        font-style: italic;
      }

      .kta-ses-empty {
        text-align: center;
        padding: 20px;
        color: #ff8888;
        font-size: 13px;
      }

      .kta-ses-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        padding: 14px 18px;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .kta-ses-btn {
        padding: 10px 18px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-size: 13px;
        font-family: inherit;
        font-weight: 600;
        transition: all 0.12s;
      }
      .kta-ses-btn-primary {
        background: #8cb4ff;
        color: #1a1f2e;
      }
      .kta-ses-btn-primary:hover {
        background: #aac6ff;
      }
      .kta-ses-btn-primary:disabled {
        background: rgba(140,180,255,0.3);
        color: rgba(255,255,255,0.4);
        cursor: not-allowed;
      }
      .kta-ses-btn-secondary {
        background: rgba(255,255,255,0.06);
        color: #c0c8d8;
        border: 1px solid rgba(255,255,255,0.12);
      }
      .kta-ses-btn-secondary:hover {
        background: rgba(255,255,255,0.1);
      }

      /* 🌍 v169 (Karma_dev) : Onglet KMZ — calibrage 2 points + aperçu coins */
      .kta-kmz-section {
        margin: 14px 0;
        padding: 10px 12px;
        background: rgba(140,180,255,0.04);
        border: 1px solid rgba(140,180,255,0.18);
        border-radius: 6px;
      }
      .kta-kmz-section-titre {
        font-size: 13px;
        font-weight: 600;
        color: #8cb4ff;
        margin-bottom: 8px;
      }
      .kta-kmz-pt-grille {
        display: grid;
        grid-template-columns: auto 1fr auto 1fr;
        gap: 6px 8px;
        align-items: center;
        margin-bottom: 8px;
      }
      .kta-kmz-lbl {
        font-size: 12px;
        color: #8892a4;
        text-align: right;
      }
      .kta-kmz-input {
        font-family: monospace;
        font-size: 12.5px;
        padding: 4px 8px;
      }
      .kta-kmz-pt-actions {
        display: flex;
        gap: 6px;
        margin-bottom: 4px;
      }
      .kta-kmz-search-results {
        margin-top: 6px;
        padding: 8px;
        background: rgba(0,0,0,0.25);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 4px;
        max-height: 200px;
        overflow-y: auto;
      }
      /* Item de résultat dans le panneau de recherche (calibrage KMZ).
         Pas de classe .kta-iti-search-result en CSS (incohérence historique
         avec .kta-iti-search-item) — on isole donc avec une classe dédiée KMZ. */
      .kta-kmz-search-item {
        padding: 6px 10px;
        margin: 2px 0;
        cursor: pointer;
        border-radius: 4px;
        font-size: 12.5px;
        color: #c8d0e0;
        transition: background 0.12s;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px;
      }
      .kta-kmz-search-item:hover {
        background: rgba(140,180,255,0.14);
        color: #e8eaf0;
      }
      .kta-kmz-search-item strong {
        color: #8cb4ff;
        font-weight: 600;
      }
      .kta-kmz-search-item .kta-kmz-search-meta {
        color: #8892a4;
        font-size: 11px;
      }
      .kta-kmz-search-empty {
        padding: 8px 10px;
        color: #8892a4;
        font-style: italic;
        font-size: 12px;
        text-align: center;
      }
      .kta-kmz-apercu {
        padding: 8px 10px;
        background: rgba(0,0,0,0.20);
        border-radius: 4px;
        font-size: 12px;
        color: #c8d0e0;
      }
      .kta-kmz-coins-grille {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 12px;
      }
      .kta-kmz-coins-grille code {
        font-size: 11px;
        color: #f4c542;
      }
      .kta-kmz-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }
      .kta-kmz-chip-niveau {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        font-size: 12px;
        color: #c8d0e0;
        cursor: pointer;
      }
      .kta-kmz-chip-niveau:hover {
        background: rgba(140,180,255,0.10);
        border-color: rgba(140,180,255,0.35);
      }
      .kta-kmz-chip-niveau input[type="checkbox"] {
        accent-color: #8cb4ff;
      }
      .kta-kmz-opacity-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 4px 0 8px 28px;
        padding: 4px 6px;
        font-size: 12px;
        color: #c0c8d8;
      }
      .kta-kmz-opacity-row.disabled {
        opacity: 0.4;
        pointer-events: none;
      }
      .kta-kmz-opacity-lbl {
        color: #8892a4;
        white-space: nowrap;
      }
      .kta-kmz-opacity-slider {
        flex: 1;
        min-width: 120px;
        accent-color: #8cb4ff;
        cursor: pointer;
      }
      .kta-kmz-opacity-val {
        font-family: monospace;
        font-size: 12px;
        color: #f4c542;
        min-width: 36px;
        text-align: right;
      }
    `;
    document.head.appendChild(s);
  }

  // ========== ENTRÉE PUBLIQUE ==========
  window.ouvrirExportSessionModal = function() {
    _injecterStyles();
    if (_modal) { _modal.remove(); _modal = null; }
    _activeTab = "full";
    _afficherModal();
  };

  // ========== COMPTAGES ==========
  function _compter() {
    return {
      points:    window.getEditorPoints  ? window.getEditorPoints()  : [],
      roads:     window.getRoads         ? window.getRoads()         : [],
      zones:     window.getZones         ? window.getZones()         : [],
      trackerOk: !!(window.getTrackingPosition && window.getTrackingPosition()),
      trackerPath: window.getTrackingPath ? window.getTrackingPath() : []
    };
  }

  function _trierParType(arr, validTypes) {
    const out = {};
    validTypes.forEach(function(t) { out[t] = []; });
    out.autres = [];
    (arr || []).forEach(function(item) {
      if (validTypes.indexOf(item.type) >= 0) out[item.type].push(item);
      else out.autres.push(item);
    });
    return out;
  }

  // Liste tous les tags présents dans les points avec leur compte.
  // Un point peut avoir plusieurs tags → il sera compté dans chacun.
  // Cas spécial : points sans tag → catégorie "(sans tag)".
  // Retourne [{ tag, count, isUntagged }] trié alphabétiquement, sans tag à la fin.
  function _listerTagsPoints(points) {
    const tagCounts = {};
    let untaggedCount = 0;

    (points || []).forEach(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
      if (tags.length === 0) {
        untaggedCount++;
      } else {
        tags.forEach(function(t) {
          const k = String(t);
          tagCounts[k] = (tagCounts[k] || 0) + 1;
        });
      }
    });

    const list = Object.keys(tagCounts).sort().map(function(t) {
      return { tag: t, count: tagCounts[t], isUntagged: false };
    });
    if (untaggedCount > 0) {
      list.push({ tag: "__untagged__", count: untaggedCount, isUntagged: true });
    }
    return list;
  }

  // Filtre une liste de points selon les tags cochés.
  // - tagsCoches : Set des tags cochés
  // - untaggedCoche : si true, inclut aussi les points sans tag
  // Un point est inclus si AU MOINS UN de ses tags est coché, OU s'il n'a pas de tag et que untaggedCoche.
  function _filtrerPointsParTags(points, tagsCoches, untaggedCoche) {
    return (points || []).filter(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
      if (tags.length === 0) return untaggedCoche;
      return tags.some(function(t) { return tagsCoches.has(String(t)); });
    });
  }

  // Récupère depuis le DOM les tags cochés d'un préfixe donné (ex: "adv_points_tag_")
  function _lireTagsCoches(prefix, tagsList) {
    const tagsCoches = new Set();
    let untaggedCoche = false;
    tagsList.forEach(function(item) {
      const safe = _slugTagId(item.tag);
      const cb = document.getElementById(prefix + safe);
      if (cb && cb.checked) {
        if (item.isUntagged) untaggedCoche = true;
        else tagsCoches.add(item.tag);
      }
    });
    return { tagsCoches: tagsCoches, untaggedCoche: untaggedCoche };
  }

  // Identifiant CSS-safe pour un tag (peut contenir des caractères bizarres)
  function _slugTagId(tag) {
    return String(tag).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Récupère l'icône miniature d'un tag avec cascade :
  //   1. PLAN_CONFIG.icons[tag]  2. _iconMap[tag] (built-in fallback)
  function _iconePourTag(tag) {
    const planIcons = (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) || {};
    if (planIcons[tag]) return planIcons[tag];
    const entry = window._iconMap && window._iconMap[tag];
    if (!entry) return null;
    // v174 : entry peut être un L.divIcon (scaledMarkers ON) → check _kta_iconUrl
    return entry._kta_iconUrl || (entry.options && entry.options.iconUrl) || null;
  }

  // ========== AFFICHAGE MODALE ==========
  function _afficherModal() {
    const modal = document.createElement("div");
    modal.id = "kta-session-export-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">💾 Enregistrer la session</span>
          <button class="kta-panneau-close" id="kta-ses-close">✕</button>
        </div>

        <div class="kta-ses-tabs">
          <button class="kta-ses-tab" data-tab="full">🚀 Full</button>
          <button class="kta-ses-tab" data-tab="advanced">🎨 Avancé</button>
          <button class="kta-ses-tab" data-tab="conversion">🔄 Conversion</button>
          <button class="kta-ses-tab" data-tab="kmz">🌍 KMZ</button>
        </div>

        <div class="kta-ses-content" id="kta-ses-content"></div>

        <div class="kta-ses-actions">
          <button class="kta-ses-btn kta-ses-btn-secondary" id="kta-ses-cancel">Annuler</button>
          <button class="kta-ses-btn kta-ses-btn-primary" id="kta-ses-download">Télécharger</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(modal);
    _modal = modal;

    function fermer() {
      if (_modal) _modal.remove();
      _modal = null;
    }

    document.getElementById("kta-ses-close").addEventListener("click", fermer);
    document.getElementById("kta-ses-cancel").addEventListener("click", fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape" && _modal) {
        fermer();
        document.removeEventListener("keydown", onEsc);
      }
    });

    // Listeners onglets
    modal.querySelectorAll(".kta-ses-tab").forEach(function(tab) {
      tab.addEventListener("click", function() {
        _activeTab = tab.dataset.tab;
        _renderTab();
      });
    });

    document.getElementById("kta-ses-download").addEventListener("click", _executerExport);

    _renderTab();
  }

  // ========== RENDU DES ONGLETS ==========
  function _renderTab() {
    if (!_modal) return;

    _modal.querySelectorAll(".kta-ses-tab").forEach(function(t) {
      t.classList.toggle("active", t.dataset.tab === _activeTab);
    });

    const c = document.getElementById("kta-ses-content");
    if (!c) return;

    if (_activeTab === "full")        c.innerHTML = _renderFull();
    else if (_activeTab === "advanced")   c.innerHTML = _renderAdvanced();
    else if (_activeTab === "conversion") c.innerHTML = _renderConversion();
    else if (_activeTab === "kmz") {
      c.innerHTML = _renderKmz();
      // 🌍 v169 (Karma_dev) : binding handlers spécifique KMZ après injection
      // HTML (autocomplete + clic carte + validations + aperçu coins)
      setTimeout(_bindKmzHandlers, 0);
    }
  }

  // ---------- ONGLET FULL ----------
  function _renderFull() {
    const d = _compter();
    return `
      <div class="kta-ses-intro">
        Exporte la session complète pour pouvoir la réimporter et reprendre votre travail.
        <br><span style="color:#8892a4;">N'inclut pas la mesure de distance ni la position du tracker.</span>
      </div>
      <div class="kta-ses-summary">
        <div>✏️ <strong>${d.points.length}</strong> point${d.points.length > 1 ? "s" : ""} ajouté${d.points.length > 1 ? "s" : ""}</div>
        <div>🛣️ <strong>${d.roads.length}</strong> tracé${d.roads.length > 1 ? "s" : ""}</div>
        <div>⬛ <strong>${d.zones.length}</strong> zone${d.zones.length > 1 ? "s" : ""}</div>
      </div>
    `;
  }

  // ---------- ONGLET AVANCÉ ----------
  function _renderAdvanced() {
    const d = _compter();
    const roadsByType = _trierParType(d.roads, ["principal", "secondaire", "chemin"]);
    const zonesByType = _trierParType(d.zones, ["eau", "remblais", "effondrement", "inaccessible"]);
    const tagsList = _listerTagsPoints(d.points);

    function row(id, label, count, defaultChecked) {
      const disabled = count === 0 ? " disabled" : "";
      const checked = (count > 0 && defaultChecked) ? " checked" : "";
      const dim = count === 0 ? "opacity:0.4;" : "";
      return `<label class="kta-ses-cb-row" style="${dim}">
        <input type="checkbox" id="${id}"${checked}${disabled}>
        <span>${label} <span class="kta-ses-count">(${count})</span></span>
      </label>`;
    }

    function rowSub(id, label, count, defaultChecked) {
      const disabled = count === 0 ? " disabled" : "";
      const checked = (count > 0 && defaultChecked) ? " checked" : "";
      const dim = count === 0 ? "opacity:0.4;" : "";
      return `<label class="kta-ses-cb-row kta-ses-cb-sub" style="${dim}">
        <input type="checkbox" id="${id}"${checked}${disabled}>
        <span>${label} <span class="kta-ses-count">(${count})</span></span>
      </label>`;
    }

    function rowTagSub(prefix, item, defaultChecked) {
      const safe = _slugTagId(item.tag);
      const id = prefix + safe;
      const checked = defaultChecked ? " checked" : "";
      const iconUrl = item.isUntagged ? null : _iconePourTag(item.tag);
      const iconHtml = iconUrl
        ? '<img src="' + iconUrl + '" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:4px;">'
        : (item.isUntagged ? '<span style="opacity:0.5;margin-right:4px;">∅</span>' : '<span style="opacity:0.5;margin-right:4px;">🏷️</span>');
      const label = item.isUntagged ? "<em>(sans tag)</em>" : _escapeHtml(item.tag);
      return `<label class="kta-ses-cb-row kta-ses-cb-sub">
        <input type="checkbox" id="${id}"${checked}>
        <span>${iconHtml}${label} <span class="kta-ses-count">(${item.count})</span></span>
      </label>`;
    }

    let pointsTagsHtml = "";
    if (tagsList.length > 0) {
      pointsTagsHtml = tagsList.map(function(item) {
        return rowTagSub("adv_points_tag_", item, true);
      }).join("");
    }

    return `
      <div class="kta-ses-intro">
        Choisissez précisément ce que vous voulez exporter.
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">📦 Contenu</div>

        ${row("adv_points", "✏️ Points ajoutés", d.points.length, true)}
        ${pointsTagsHtml}

        ${row("adv_roads", "🛣️ Tracés", d.roads.length, true)}
        ${rowSub("adv_roads_principal",  "🟩 Principaux",  roadsByType.principal.length,  true)}
        ${rowSub("adv_roads_secondaire", "🟪 Secondaires", roadsByType.secondaire.length, true)}
        ${rowSub("adv_roads_chemin",     "🟨 Chemins",     roadsByType.chemin.length,     true)}

        ${row("adv_zones", "⬛ Zones", d.zones.length, true)}
        ${rowSub("adv_zones_eau",          "🟦 Eau",           zonesByType.eau.length,          true)}
        ${rowSub("adv_zones_remblais",     "⬛ Remblais",      zonesByType.remblais.length,     true)}
        ${rowSub("adv_zones_effondrement", "🟥 Effondrement",  zonesByType.effondrement.length, true)}
        ${rowSub("adv_zones_inaccessible", "⛔ Inaccessible",  zonesByType.inaccessible.length, true)}

        <label class="kta-ses-cb-row" style="${d.trackerOk ? "" : "opacity:0.4;"}">
          <input type="checkbox" id="adv_tracker" ${d.trackerOk ? "" : "disabled"}>
          <span>🧭 Position du tracker ${d.trackerPath.length > 1 ? '<span class="kta-ses-count">(+ tracé ' + d.trackerPath.length + ' pts)</span>' : ''}</span>
        </label>
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">📤 Format de sortie</div>
        <label class="kta-ses-radio-row">
          <input type="radio" name="adv_format" value="single" checked>
          <span>📄 Un seul fichier session <span class="kta-ses-radio-hint">(.json — réimportable)</span></span>
        </label>
        <label class="kta-ses-radio-row">
          <input type="radio" name="adv_format" value="zip">
          <span>📦 ZIP multi-fichiers <span class="kta-ses-radio-hint">(un fichier par catégorie)</span></span>
        </label>
      </div>
    `;
  }

  // Listeners pour la cohérence parent/sub-cases
  function _attacherListenersAdvanced() {
    if (!_modal || _activeTab !== "advanced") return;

    function syncParent(parentId, subIds) {
      const parent = document.getElementById(parentId);
      const subs = subIds.map(function(id) { return document.getElementById(id); }).filter(Boolean);
      if (!parent || subs.length === 0) return;

      // Parent → enfants : décocher parent décoche tous les enfants
      parent.addEventListener("change", function() {
        subs.forEach(function(s) {
          if (!s.disabled) s.checked = parent.checked;
        });
      });

      // Enfants → parent : si tous décochés, décocher parent ; sinon cocher
      subs.forEach(function(s) {
        s.addEventListener("change", function() {
          const anyChecked = subs.some(function(x) { return x.checked; });
          parent.checked = anyChecked;
        });
      });
    }

    syncParent("adv_roads", ["adv_roads_principal", "adv_roads_secondaire", "adv_roads_chemin"]);
    syncParent("adv_zones", ["adv_zones_eau", "adv_zones_remblais", "adv_zones_effondrement", "adv_zones_inaccessible"]);

    // Synchro parent Points ↔ tags (dynamique : la liste varie selon les points)
    const tagsList = _listerTagsPoints(_compter().points);
    const tagSubIds = tagsList.map(function(item) {
      return "adv_points_tag_" + _slugTagId(item.tag);
    });
    if (tagSubIds.length > 0) {
      syncParent("adv_points", tagSubIds);
    }
  }

  // ---------- ONGLET CONVERSION ----------
  // Wrapper : choisit l'UI selon le sens courant + ajoute le toggle de direction
  function _renderConversion() {
    return `
      <div class="kta-conv-sens-wrap">
        <button class="kta-conv-sens-btn ${_convDirection === "ed2data" ? "active" : ""}" data-conv-dir="ed2data" type="button">
          <span class="kta-conv-sens-label">✏️ → 🗂️ Session vers data layer</span>
          <span class="kta-conv-sens-desc">Convertit la session en cours en fichier(s) data layer chargeable(s) dans un plan</span>
        </button>
        <button class="kta-conv-sens-btn ${_convDirection === "data2ed" ? "active" : ""}" data-conv-dir="data2ed" type="button">
          <span class="kta-conv-sens-label">🗂️ → ✏️ Data layer vers session</span>
          <span class="kta-conv-sens-desc">Convertit un fichier data layer en session JSON ré-importable</span>
        </button>
      </div>
      ${_convDirection === "ed2data" ? _renderConvSession2Data() : _renderConvData2Session()}
    `;
  }

  // Sens 1 : session courante → fichiers data layer (logique existante)
  function _renderConvSession2Data() {
    const d = _compter();
    const tagsList = _listerTagsPoints(d.points);

    // ⚠️ Filtre les roads de type "itinerary" (calculées par Pathfinder, pas
    // de vraies roads exportables). Comptage par type pour les sous-checkboxes
    // de filtre fin (cohérent avec l'export image avancé).
    const roadsExportables = (d.roads || []).filter(function(r) { return r.type !== "itinerary"; });
    const roadCountByType = _trierParType(roadsExportables, ["principal", "secondaire", "chemin"]);
    const zoneCountByType = _trierParType(d.zones || [],    ["eau", "remblais", "effondrement", "inaccessible"]);

    function row(id, label, count, defaultChecked) {
      const disabled = count === 0 ? " disabled" : "";
      const checked = (count > 0 && defaultChecked) ? " checked" : "";
      const dim = count === 0 ? "opacity:0.4;" : "";
      return `<label class="kta-ses-cb-row" style="${dim}">
        <input type="checkbox" id="${id}"${checked}${disabled}>
        <span>${label} <span class="kta-ses-count">(${count})</span></span>
      </label>`;
    }

    function rowTypeSub(id, label, count, defaultChecked) {
      const disabled = count === 0 ? " disabled" : "";
      const checked  = (count > 0 && defaultChecked) ? " checked" : "";
      const dim      = count === 0 ? "opacity:0.4;" : "";
      return `<label class="kta-ses-cb-row kta-ses-cb-sub" style="${dim}">
        <input type="checkbox" id="${id}"${checked}${disabled}>
        <span>${label} <span class="kta-ses-count">(${count})</span></span>
      </label>`;
    }

    function rowTagSub(prefix, item, defaultChecked) {
      const safe = _slugTagId(item.tag);
      const id = prefix + safe;
      const checked = defaultChecked ? " checked" : "";
      const iconUrl = item.isUntagged ? null : _iconePourTag(item.tag);
      const iconHtml = iconUrl
        ? '<img src="' + iconUrl + '" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:4px;">'
        : (item.isUntagged ? '<span style="opacity:0.5;margin-right:4px;">∅</span>' : '<span style="opacity:0.5;margin-right:4px;">🏷️</span>');
      const label = item.isUntagged ? "<em>(sans tag)</em>" : _escapeHtml(item.tag);
      return `<label class="kta-ses-cb-row kta-ses-cb-sub">
        <input type="checkbox" id="${id}"${checked}>
        <span>${iconHtml}${label} <span class="kta-ses-count">(${item.count})</span></span>
      </label>`;
    }

    let pointsTagsHtml = "";
    if (tagsList.length > 0) {
      pointsTagsHtml = tagsList.map(function(item) {
        return rowTagSub("conv_points_tag_", item, true);
      }).join("");
    }

    // Sub-cases types route (Principal / Secondaire / Chemin)
    const roadsTypesHtml =
      rowTypeSub("conv_roads_principal",  "🟩 Principal",  roadCountByType.principal.length,  true) +
      rowTypeSub("conv_roads_secondaire", "🟪 Secondaire", roadCountByType.secondaire.length, true) +
      rowTypeSub("conv_roads_chemin",     "🟨 Chemin",     roadCountByType.chemin.length,     true);

    // Sub-cases types zone (Eau / Remblais / Effondrement / Inaccessible)
    const zonesTypesHtml =
      rowTypeSub("conv_zones_eau",          "🟦 Eau",          zoneCountByType.eau.length,          true) +
      rowTypeSub("conv_zones_remblais",     "⬛ Remblais",     zoneCountByType.remblais.length,     true) +
      rowTypeSub("conv_zones_effondrement", "🟥 Effondrement", zoneCountByType.effondrement.length, true) +
      rowTypeSub("conv_zones_inaccessible", "⛔ Inaccessible", zoneCountByType.inaccessible.length, true);

    return `
      <div class="kta-ses-intro">
        Convertit la session en <strong>calque de données</strong> prêt à intégrer dans
        un plan via <code>plan-config.json</code> → <code>dataLayers</code>.
        <br><span style="color:#8892a4;">Format <code>devmap-data</code> (lecture seule), pas de tracker.</span>
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">📦 À convertir</div>
        ${row("conv_points", "✏️ Points ajoutés",  d.points.length, true)}
        ${pointsTagsHtml}
        ${row("conv_roads",  "🛣️ Tracés",          roadsExportables.length,  true)}
        ${roadsTypesHtml}
        ${row("conv_zones",  "⬛ Zones",            d.zones.length,  true)}
        ${zonesTypesHtml}
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">🎯 Granularité</div>
        <label class="kta-ses-radio-row">
          <input type="radio" name="conv_gran" value="basic" checked>
          <span>📄 Basique <span class="kta-ses-radio-hint">(1 fichier par catégorie : points.json, roads.json, zones.json)</span></span>
        </label>
        <label class="kta-ses-radio-row">
          <input type="radio" name="conv_gran" value="fine">
          <span>🔬 Fine <span class="kta-ses-radio-hint">(1 fichier par type : zones_eau.json, roads_principal.json...)</span></span>
        </label>
      </div>
    `;
  }

  // Sens 2 : fichier data layer uploadé → fichier session JSON (téléchargement)
  function _renderConvData2Session() {
    let apercu = "";
    let stats = null;

    if (_convUploadedJson) {
      const points = Array.isArray(_convUploadedJson.data)         ? _convUploadedJson.data
                   : Array.isArray(_convUploadedJson.editorPoints) ? _convUploadedJson.editorPoints
                   : [];
      const roads  = Array.isArray(_convUploadedJson.roads) ? _convUploadedJson.roads : [];
      const zones  = Array.isArray(_convUploadedJson.zones) ? _convUploadedJson.zones : [];
      stats = { points: points.length, roads: roads.length, zones: zones.length };
      apercu = `
        <div class="kta-ses-section">
          <div class="kta-ses-section-title">📊 Aperçu du contenu détecté</div>
          <div class="kta-ses-summary">
            <div>✏️ <strong>${stats.points}</strong> point${stats.points > 1 ? "s" : ""}</div>
            <div>🛣️ <strong>${stats.roads}</strong> tracé${stats.roads > 1 ? "s" : ""}</div>
            <div>⬛ <strong>${stats.zones}</strong> zone${stats.zones > 1 ? "s" : ""}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="kta-ses-intro">
        Charge un fichier <strong>data layer</strong> (<code>data.json</code>, <code>puits.json</code>, etc.) et obtient en retour un fichier <strong>session JSON</strong> que tu peux ré-importer pour éditer ses points / tracés / zones.
        <br><span style="color:#8892a4;">Format de sortie : <code>devmap-session</code>. Le tracker n'est pas inclus.</span>
      </div>

      <div class="kta-ses-section">
        <div class="kta-ses-section-title">📂 Fichier source</div>
        <div class="kta-conv-drop" id="kta-conv-d2e-drop">
          <span id="kta-conv-d2e-drop-label">${_convUploadedName ? "✅ " + _escapeHtml(_convUploadedName) : "📂 Cliquer ou glisser un fichier .json"}</span>
          <input type="file" id="kta-conv-d2e-file" accept=".json" style="display:none">
        </div>
      </div>

      ${apercu}

      <div id="kta-conv-d2e-erreur" class="kta-conv-erreur" style="display:none;"></div>
    `;
  }

  // Listeners parent ↔ tags pour Conversion (post-DOM)
  function _attacherListenersConversion() {
    if (!_modal || _activeTab !== "conversion") return;

    // Toggle de direction (ed2data ↔ data2ed)
    _modal.querySelectorAll(".kta-conv-sens-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const dir = btn.dataset.convDir;
        if (dir && dir !== _convDirection) {
          _convDirection = dir;
          _renderTab();
        }
      });
    });

    // Mode data2ed : drop zone + file picker
    if (_convDirection === "data2ed") {
      const dropZone  = document.getElementById("kta-conv-d2e-drop");
      const fileInput = document.getElementById("kta-conv-d2e-file");
      const labelEl   = document.getElementById("kta-conv-d2e-drop-label");
      const erreurEl  = document.getElementById("kta-conv-d2e-erreur");

      if (dropZone && fileInput) {
        dropZone.addEventListener("click", function() { fileInput.click(); });
        dropZone.addEventListener("dragover",  function(e) { e.preventDefault(); dropZone.classList.add("dragover"); });
        dropZone.addEventListener("dragleave", function()  { dropZone.classList.remove("dragover"); });
        dropZone.addEventListener("drop", function(e) {
          e.preventDefault(); dropZone.classList.remove("dragover");
          const f = e.dataTransfer.files[0];
          if (f && f.name.toLowerCase().endsWith(".json")) _chargerFichierData2Ed(f);
          else if (erreurEl) { erreurEl.textContent = "❌ Le fichier doit être un .json"; erreurEl.style.display = "block"; }
        });
        fileInput.addEventListener("change", function() {
          if (fileInput.files[0]) _chargerFichierData2Ed(fileInput.files[0]);
        });
      }
      // Si aucun fichier chargé → désactive le bouton Télécharger
      const dlBtn = document.getElementById("kta-ses-download");
      if (dlBtn) dlBtn.disabled = !_convUploadedJson;
      return; // pas de syncParent à brancher dans ce mode
    }

    // Mode ed2data : réactive le bouton Télécharger
    const dlBtn = document.getElementById("kta-ses-download");
    if (dlBtn) dlBtn.disabled = false;

    function syncParent(parentId, subIds) {
      const parent = document.getElementById(parentId);
      const subs = subIds.map(function(id) { return document.getElementById(id); }).filter(Boolean);
      if (!parent || subs.length === 0) return;
      parent.addEventListener("change", function() {
        subs.forEach(function(s) { if (!s.disabled) s.checked = parent.checked; });
      });
      subs.forEach(function(s) {
        s.addEventListener("change", function() {
          parent.checked = subs.some(function(x) { return x.checked; });
        });
      });
    }

    const tagsList = _listerTagsPoints(_compter().points);
    const tagSubIds = tagsList.map(function(item) {
      return "conv_points_tag_" + _slugTagId(item.tag);
    });
    if (tagSubIds.length > 0) {
      syncParent("conv_points", tagSubIds);
    }

    // Sync parent ↔ sub-checkboxes pour types road et zone
    syncParent("conv_roads", ["conv_roads_principal", "conv_roads_secondaire", "conv_roads_chemin"]);
    syncParent("conv_zones", ["conv_zones_eau",       "conv_zones_remblais",   "conv_zones_effondrement", "conv_zones_inaccessible"]);
  }

  // Charge un fichier .json pour le sens data2ed, parse + re-render l'onglet pour afficher l'aperçu
  function _chargerFichierData2Ed(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const json = JSON.parse(e.target.result);
        if (typeof json !== "object" || json === null) throw new Error("Le fichier ne contient pas un objet JSON valide.");
        const hasPoints = Array.isArray(json.data) || Array.isArray(json.editorPoints);
        const hasRoads  = Array.isArray(json.roads);
        const hasZones  = Array.isArray(json.zones);
        if (!hasPoints && !hasRoads && !hasZones) {
          throw new Error("Aucun champ 'data', 'editorPoints', 'roads' ou 'zones' trouvé dans le fichier.");
        }
        _convUploadedJson = json;
        _convUploadedName = file.name;
        _renderTab(); // re-render pour afficher l'aperçu + activer le bouton
      } catch(err) {
        const erreurEl = document.getElementById("kta-conv-d2e-erreur");
        if (erreurEl) {
          erreurEl.textContent = "❌ " + (err.message || err);
          erreurEl.style.display = "block";
        }
        _convUploadedJson = null;
        _convUploadedName = "";
        const dlBtn = document.getElementById("kta-ses-download");
        if (dlBtn) dlBtn.disabled = true;
      }
    };
    reader.readAsText(file);
  }

  // Re-render avec listeners post-DOM
  const _origRenderTab = _renderTab;
  _renderTab = function() {
    _origRenderTab();
    setTimeout(_attacherListenersAdvanced, 0);
    setTimeout(_attacherListenersConversion, 0);
  };

  // ========== EXÉCUTION DE L'EXPORT ==========
  function _executerExport() {
    if (_activeTab === "full")              _exportFull();
    else if (_activeTab === "advanced")     _exportAdvanced();
    else if (_activeTab === "conversion")   _exportConversion();
    else if (_activeTab === "kmz")          _exportKmz();
  }

  // ---------- FULL ----------
  function _exportFull() {
    const d = _compter();
    if (d.points.length === 0 && d.roads.length === 0 && d.zones.length === 0) {
      alert("Rien à exporter — la session est vide.");
      return;
    }
    const session = {
      type: "devmap-session",
      version: "1.0",
      date_export: new Date().toISOString(),
      editorPoints: d.points,
      roads:        d.roads,
      zones:        d.zones
    };
    _telechargerJSON(session, _filename("session"));
    _fermer();
  }

  // ---------- AVANCÉ ----------
  function _exportAdvanced() {
    const d = _compter();
    const incPoints = document.getElementById("adv_points")?.checked;
    const incTracker = document.getElementById("adv_tracker")?.checked;

    const roadTypes = ["principal", "secondaire", "chemin"].filter(function(t) {
      return document.getElementById("adv_roads_" + t)?.checked;
    });
    const zoneTypes = ["eau", "remblais", "effondrement", "inaccessible"].filter(function(t) {
      return document.getElementById("adv_zones_" + t)?.checked;
    });

    // 🪜 v169 (Karma_dev) : jonctions interniveau toujours préservées dans
    // l'export Avancé (= bridges du graphe pathfinder, non négociables). Sans
    // ce bypass, le filter `roadTypes.indexOf(r.type) >= 0` les retirerait
    // silencieusement car "jonction" n'est PAS dans roadTypes (qui ne liste
    // que principal/secondaire/chemin). Idem dans Conversion plus bas.
    const filteredRoads = (d.roads || []).filter(function(r) {
      if (r.type === "jonction") return true;  // bypass : toujours inclus
      return roadTypes.indexOf(r.type) >= 0;
    });
    const filteredZones = (d.zones || []).filter(function(z) { return zoneTypes.indexOf(z.type) >= 0; });

    // Filtrer les points par tags cochés
    let filteredPoints = [];
    if (incPoints) {
      const tagsList = _listerTagsPoints(d.points);
      const sel = _lireTagsCoches("adv_points_tag_", tagsList);
      filteredPoints = _filtrerPointsParTags(d.points, sel.tagsCoches, sel.untaggedCoche);
    }

    const tracker = (incTracker && d.trackerOk) ? {
      position: window.getTrackingPosition(),
      path: d.trackerPath
    } : null;

    const total = filteredPoints.length + filteredRoads.length + filteredZones.length + (tracker ? 1 : 0);
    if (total === 0) {
      alert("Rien à exporter — sélectionnez au moins une catégorie.");
      return;
    }

    const fmt = document.querySelector('input[name="adv_format"]:checked')?.value || "single";

    if (fmt === "single") {
      // 1 seul fichier session
      const session = {
        type: "devmap-session",
        version: "1.0",
        date_export: new Date().toISOString()
      };
      if (filteredPoints.length)  session.editorPoints = filteredPoints;
      if (filteredRoads.length)   session.roads        = filteredRoads;
      if (filteredZones.length)   session.zones        = filteredZones;
      if (tracker)                session.tracker      = tracker;

      _telechargerJSON(session, _filename("session"));
      _fermer();
    } else {
      // ZIP multi-fichiers — chaque catégorie dans un fichier session séparé
      _genererZipAdvanced(filteredPoints, filteredRoads, filteredZones, tracker);
    }
  }

  function _genererZipAdvanced(points, roads, zones, tracker) {
    if (typeof JSZip === "undefined") {
      alert("JSZip n'est pas chargé — impossible de créer le ZIP.");
      return;
    }
    const zip = new JSZip();
    const now = new Date().toISOString();

    function file(name, payload) {
      const obj = Object.assign({ type: "devmap-session", version: "1.0", date_export: now }, payload);
      zip.file(name, JSON.stringify(obj, null, 2));
    }

    if (points.length) file("session_points.json", { editorPoints: points });
    if (roads.length)  file("session_roads.json",  { roads: roads });
    if (zones.length)  file("session_zones.json",  { zones: zones });
    if (tracker)       file("session_tracker.json",{ tracker: tracker });

    zip.generateAsync({ type: "blob" }).then(function(blob) {
      _telechargerBlob(blob, _filename("session", "zip"));
      _fermer();
    }).catch(function(e) {
      console.error("[SessionExport] ZIP :", e);
      alert("Erreur lors de la création du ZIP");
    });
  }

  // ---------- CONVERSION ----------
  // Dispatcher selon le sens choisi
  function _exportConversion() {
    if (_convDirection === "data2ed") return _exportConvData2Session();
    return _exportConvSession2Data();
  }

  // Sens 1 : session courante → fichiers data layer (logique existante renommée)
  function _exportConvSession2Data() {
    const d = _compter();
    const incPoints = document.getElementById("conv_points")?.checked;
    const incRoads  = document.getElementById("conv_roads")?.checked;
    const incZones  = document.getElementById("conv_zones")?.checked;
    const gran = document.querySelector('input[name="conv_gran"]:checked')?.value || "basic";

    // Filtrer les points par tags cochés
    let filteredPoints = [];
    if (incPoints) {
      const tagsList = _listerTagsPoints(d.points);
      const sel = _lireTagsCoches("conv_points_tag_", tagsList);
      filteredPoints = _filtrerPointsParTags(d.points, sel.tagsCoches, sel.untaggedCoche);
    }

    // Filtrer les roads par type coché (Principal / Secondaire / Chemin) +
    // exclure le type "itinerary" qui n'a rien à faire dans un export data layer.
    const roadTypesActifs = {
      principal:  document.getElementById("conv_roads_principal")?.checked  ?? true,
      secondaire: document.getElementById("conv_roads_secondaire")?.checked ?? true,
      chemin:     document.getElementById("conv_roads_chemin")?.checked     ?? true
    };
    const filteredRoads = incRoads
      ? (d.roads || []).filter(function(r) {
          if (r.type === "itinerary") return false;
          // 🪜 v169 (Karma_dev) : jonctions interniveau toujours préservées
          // dans la conversion → data layer (bridges essentiels du graphe
          // pathfinder, non filtrables par type principal/secondaire/chemin).
          if (r.type === "jonction") return true;
          return roadTypesActifs[r.type] !== false;
        })
      : [];

    // Filtrer les zones par type coché (Eau / Remblais / Effondrement / Inaccessible)
    const zoneTypesActifs = {
      eau:          document.getElementById("conv_zones_eau")?.checked          ?? true,
      remblais:     document.getElementById("conv_zones_remblais")?.checked     ?? true,
      effondrement: document.getElementById("conv_zones_effondrement")?.checked ?? true,
      inaccessible: document.getElementById("conv_zones_inaccessible")?.checked ?? true
    };
    const filteredZones = incZones
      ? (d.zones || []).filter(function(z) { return zoneTypesActifs[z.type] !== false; })
      : [];

    const total = filteredPoints.length + filteredRoads.length + filteredZones.length;
    if (total === 0) {
      alert("Rien à convertir — sélectionnez au moins une catégorie / un type non vide.");
      return;
    }

    if (gran === "basic") {
      // Granularité basique : 1 fichier par catégorie (max 3)
      const files = [];
      if (filteredPoints.length) {
        files.push({ name: "points.json", payload: { data: filteredPoints } });
      }
      if (filteredRoads.length) {
        files.push({ name: "roads.json", payload: { data: [], roads: filteredRoads } });
      }
      if (filteredZones.length) {
        files.push({ name: "zones.json", payload: { data: [], zones: filteredZones } });
      }
      _telechargerConversionFiles(files);
    } else {
      // Granularité fine : par type
      const files = [];

      if (filteredPoints.length) {
        // Points : un seul fichier (les tags sont multiples → séparation ambigüe)
        files.push({ name: "points.json", payload: { data: filteredPoints } });
      }

      if (filteredRoads.length) {
        // 🪜 v169 (Karma_dev) : inclure "jonction" dans la granularité fine
        // pour ne pas perdre les bridges interniveau (sans ça, _trierParType
        // les listerait dans le bucket "_ignored" et ils seraient drop).
        const byType = _trierParType(filteredRoads, ["principal", "secondaire", "chemin", "jonction"]);
        ["principal", "secondaire", "chemin", "jonction"].forEach(function(t) {
          if (byType[t].length) {
            files.push({ name: "roads_" + t + ".json", payload: { data: [], roads: byType[t] } });
          }
        });
      }

      if (filteredZones.length) {
        const byType = _trierParType(filteredZones, ["eau", "remblais", "effondrement", "inaccessible"]);
        ["eau", "remblais", "effondrement", "inaccessible"].forEach(function(t) {
          if (byType[t].length) {
            files.push({ name: "zones_" + t + ".json", payload: { data: [], zones: byType[t] } });
          }
        });
      }

      _telechargerConversionFiles(files);
    }
  }

  // Sens 2 : fichier data layer uploadé → fichier session JSON
  function _exportConvData2Session() {
    if (!_convUploadedJson) {
      alert("Aucun fichier source — glisse un fichier .json d'abord.");
      return;
    }
    const j = _convUploadedJson;
    const points = Array.isArray(j.data)         ? j.data
                 : Array.isArray(j.editorPoints) ? j.editorPoints
                 : [];
    const roads  = Array.isArray(j.roads) ? j.roads : [];
    const zones  = Array.isArray(j.zones) ? j.zones : [];

    if (points.length === 0 && roads.length === 0 && zones.length === 0) {
      alert("Le fichier source ne contient ni points, ni tracés, ni zones convertibles.");
      return;
    }

    const session = {
      type:        "devmap-session",
      version:     "1.0",
      date_export: new Date().toISOString()
    };
    if (points.length) session.editorPoints = points;
    if (roads.length)  session.roads        = roads;
    if (zones.length)  session.zones        = zones;

    // Nom du fichier de sortie : basé sur le fichier source
    const baseName = (_convUploadedName || "data").replace(/\.json$/i, "");
    _telechargerJSON(session, baseName + "_session.json");
    _fermer();
  }

  function _telechargerConversionFiles(files) {
    if (files.length === 0) {
      alert("Rien à convertir.");
      return;
    }
    const now = new Date().toISOString();

    // Wrap en format devmap-data
    files.forEach(function(f) {
      f.payload = Object.assign({ type: "devmap-data", version: "1.0", date_export: now }, f.payload);
    });

    if (files.length === 1) {
      // Fichier unique → téléchargement direct
      _telechargerJSON(files[0].payload, files[0].name);
      _fermer();
      return;
    }

    // Plusieurs fichiers → ZIP
    if (typeof JSZip === "undefined") {
      alert("JSZip n'est pas chargé — impossible de créer le ZIP.");
      return;
    }
    const zip = new JSZip();
    files.forEach(function(f) {
      zip.file(f.name, JSON.stringify(f.payload, null, 2));
    });
    zip.generateAsync({ type: "blob" }).then(function(blob) {
      _telechargerBlob(blob, _filename("data", "zip"));
      _fermer();
    }).catch(function(e) {
      console.error("[SessionExport] Conversion ZIP :", e);
      alert("Erreur lors de la création du ZIP");
    });
  }

  // ========== UTILITAIRES ==========
  function _escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  function _filename(prefix, ext) {
    ext = ext || "json";
    const planName = (window.PLAN_CONFIG?.plan?.name || "plan").replace(/[^a-z0-9_-]/gi, "_");
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return prefix + "_" + planName + "_" + yyyy + mm + dd + "." + ext;
  }

  function _telechargerJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    _telechargerBlob(blob, filename);
  }

  function _telechargerBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  function _fermer() {
    if (_modal) _modal.remove();
    _modal = null;
    // Reset de l'état de la conversion data2ed pour la prochaine ouverture
    _convUploadedJson = null;
    _convUploadedName = "";
    // 🌍 v169 (Karma_dev) : reset mode clic carte KMZ si actif
    if (_kmzClickActive) _kmzDesactiverModeClic();
  }

  // =========================================================================
  // 🌍 ONGLET KMZ (depuis v169 / Karma_dev)
  // =========================================================================
  // Export geolocalise pour Google Earth / OsmAnd / Locus / Avenza.
  // Calibrage 2 points (plan + GPS) → transformation affine 2D → KMZ.
  // Cf. js/kmzExport.js pour le moteur (math + generateur KML + zip).
  // =========================================================================

  // Etat interne onglet KMZ (mode clic carte pour saisir x/y d'un point)
  // _kmzClickTarget = "A" | "B" | null — quel point on est en train de saisir
  let _kmzClickActive = false;
  let _kmzClickHandler = null;
  let _kmzClickTarget = null;

  // Helper : récupère l'ID du plan courant (pour la clé localStorage du calibrage)
  function _kmzCurrentPlanId() {
    return window._currentLoadedPlanId || "default";
  }

  // Slug CSS-safe pour un tag (id checkbox)
  function _kmzSlugTag(tag) {
    return String(tag).replace(/[^a-z0-9_-]/gi, "_");
  }

  // Liste les tags presents dans une collection de points
  // Renvoie [{tag, count, isUntagged}] trie alpha, "__untagged__" en queue
  function _kmzListerTags(points) {
    const counts = {};
    let untagged = 0;
    (points || []).forEach(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(function(t) { return t && String(t).trim(); }) : [];
      if (tags.length === 0) untagged++;
      else tags.forEach(function(t) {
        const k = String(t);
        counts[k] = (counts[k] || 0) + 1;
      });
    });
    const list = Object.keys(counts).sort().map(function(t) {
      return { tag: t, count: counts[t], isUntagged: false };
    });
    if (untagged > 0) list.push({ tag: "__untagged__", count: untagged, isUntagged: true });
    return list;
  }

  // URL d'icone pour un tag (lookup _iconMap → resolution Leaflet)
  // v174 : check _kta_iconUrl (divIcon) avant options.iconUrl (icon classique)
  function _kmzIconePourTag(tag) {
    if (!window._iconMap || !window._iconMap[tag]) return null;
    const ic = window._iconMap[tag];
    return ic._kta_iconUrl || (ic.options && ic.options.iconUrl) || null;
  }

  // Collecte unifiee des stats KMZ (session + embedded) pour generer les
  // sous-cases avec compteurs et icones, comme l'export PNG mode avance.
  // Reutilise les memes getters que _exportKmz pour rester strictement coherent.
  function _kmzCollecterStats() {
    // === Points : session + data layers ===
    const sessionPts = (window.getEditorPoints ? window.getEditorPoints() : []) || [];
    const dataLayerPts = [];
    if (Array.isArray(window._ktaDataMarkers)) {
      window._ktaDataMarkers.forEach(function(m) {
        if (!m) return;
        dataLayerPts.push({ tags: Array.isArray(m._ktaTags) ? m._ktaTags : [] });
      });
    }
    const allPts = sessionPts.concat(dataLayerPts);
    const tagsList = _kmzListerTags(allPts);

    // === Roads : session + embedded ===
    const sessionRoads = (window.getRoads ? window.getRoads() : []) || [];
    const embeddedRoads = (typeof window.getAllEmbeddedRoads === "function")
      ? window.getAllEmbeddedRoads() : [];
    const allRoads = sessionRoads.concat(embeddedRoads);
    const roadsByType = {
      principal:  allRoads.filter(function(r) { return r.type === "principal";  }).length,
      secondaire: allRoads.filter(function(r) { return r.type === "secondaire"; }).length,
      chemin:     allRoads.filter(function(r) { return r.type === "chemin";     }).length,
      jonction:   allRoads.filter(function(r) { return r.type === "jonction";   }).length,
      itinerary:  allRoads.filter(function(r) { return r.type === "itinerary";  }).length
    };

    // === Zones : session + embedded ===
    const sessionZones = (window.getZones ? window.getZones() : []) || [];
    const embeddedZones = (typeof window.getAllEmbeddedZones === "function")
      ? window.getAllEmbeddedZones() : [];
    const allZones = sessionZones.concat(embeddedZones);
    const zonesByType = {
      eau:          allZones.filter(function(z) { return z.type === "eau";          }).length,
      remblais:     allZones.filter(function(z) { return z.type === "remblais";     }).length,
      effondrement: allZones.filter(function(z) { return z.type === "effondrement"; }).length,
      inaccessible: allZones.filter(function(z) { return z.type === "inaccessible"; }).length
    };

    return {
      pointsTotal: allPts.length,
      tagsList:    tagsList,
      roadsByType: roadsByType,
      zonesByType: zonesByType
    };
  }

  // Sync visuelle parent ↔ enfants (parent coche / decoche tous les enfants,
  // enfants au moins 1 coche le parent). Replique le pattern _syncAnnotParent
  // de exporter.js pour le mode avance PNG.
  function _kmzSyncParent(parentId, childIds) {
    const parent = document.getElementById(parentId);
    if (!parent) return;
    const children = childIds.map(function(id) { return document.getElementById(id); }).filter(Boolean);
    if (children.length === 0) return;

    parent.addEventListener("change", function() {
      children.forEach(function(c) { if (!c.disabled) c.checked = parent.checked; });
    });
    children.forEach(function(c) {
      c.addEventListener("change", function() {
        const anyChecked = children.some(function(x) { return x.checked; });
        parent.checked = anyChecked;
      });
    });
  }

  // ---------- RENDU HTML ONGLET KMZ ----------
  function _renderKmz() {
    // Restaure le calibrage sauvé pour ce plan s'il existe
    const planId = _kmzCurrentPlanId();
    const saved  = (window.KmzExport && window.KmzExport.getCalibration)
                    ? window.KmzExport.getCalibration(planId) : null;
    const pA     = (saved && saved.pointA) || { x: "", y: "", lat: "", lng: "" };
    const pB     = (saved && saved.pointB) || { x: "", y: "", lat: "", lng: "" };

    const mlOn   = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const niveauxBloc = mlOn
      ? '<div class="kta-kmz-section">' +
          '<div class="kta-kmz-section-titre">🏗️ Niveaux à inclure</div>' +
          '<p style="font-size:11.5px; color:#8892a4; margin:4px 0;">' +
            'Par défaut : tous les niveaux disponibles (1 Folder KML par niveau).' +
          '</p>' +
          '<div id="kta-kmz-levels-chips" class="kta-kmz-chips"></div>' +
        '</div>'
      : '';

    return '' +
      '<div class="kta-ses-intro">' +
        '🌍 Export <strong>geolocalise</strong> au format KMZ (Google Earth, OsmAnd, Locus, Avenza...). ' +
        'Calibrage par <strong>2 points</strong> (saisis x/y plan + coordonnées GPS réelles), ' +
        'l\'app calcule la transformation rotation+échelle+translation pour positionner ' +
        'le plan et toutes les annotations sur le globe.' +
      '</div>' +

      // ===== Calibrage Point A =====
      '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">📍 Point A — calibrage</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">Plan x :</label>' +
          '<input type="number" id="kmz_A_x" value="' + pA.x + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">Plan y :</label>' +
          '<input type="number" id="kmz_A_y" value="' + pA.y + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">GPS lat :</label>' +
          '<input type="number" id="kmz_A_lat" value="' + pA.lat + '" class="kta-cfg-input kta-kmz-input" step="any" placeholder="48.8580">' +
          '<label class="kta-kmz-lbl">GPS lng :</label>' +
          '<input type="number" id="kmz_A_lng" value="' + pA.lng + '" class="kta-cfg-input kta-kmz-input" step="any" placeholder="2.2945">' +
        '</div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kmz_A_search" type="button">🔍 Chercher un point</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kmz_A_click" type="button">📍 Cliquer carte</button>' +
        '</div>' +
        '<div id="kmz_A_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      // ===== Calibrage Point B =====
      '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">📍 Point B — calibrage</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">Plan x :</label>' +
          '<input type="number" id="kmz_B_x" value="' + pB.x + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">Plan y :</label>' +
          '<input type="number" id="kmz_B_y" value="' + pB.y + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">GPS lat :</label>' +
          '<input type="number" id="kmz_B_lat" value="' + pB.lat + '" class="kta-cfg-input kta-kmz-input" step="any" placeholder="48.8520">' +
          '<label class="kta-kmz-lbl">GPS lng :</label>' +
          '<input type="number" id="kmz_B_lng" value="' + pB.lng + '" class="kta-cfg-input kta-kmz-input" step="any" placeholder="2.3050">' +
        '</div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kmz_B_search" type="button">🔍 Chercher un point</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kmz_B_click" type="button">📍 Cliquer carte</button>' +
        '</div>' +
        '<div id="kmz_B_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      // ===== Apercu coins =====
      '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">🌐 Aperçu coins (lat/lng)</div>' +
        '<div id="kmz_apercu" class="kta-kmz-apercu">' +
          '<em style="color:#8892a4;">Renseigne les 2 points pour voir l\'aperçu...</em>' +
        '</div>' +
      '</div>' +

      // ===== Contenu à inclure (granularite fine, pattern IMAGE AVANCE) =====
      _kmzRenderContenu(mlOn) +

      niveauxBloc;
  }

  // ---------- RENDU SECTION CONTENU (sous-cases par tag/type) ----------
  function _kmzRenderContenu(mlOn) {
    const stats = _kmzCollecterStats();

    // Helper : ligne parent ou simple checkbox.
    // count = null → pas de compteur affiché, checkbox toujours enabled
    //                (cas image : pas de notion de "X items à exporter")
    // count = 0    → grisée + désactivée + dim 50% (rien à exporter pour cette
    //                catégorie, donc on bloque la coche)
    // count > 0    → normale, cochée si checked=true
    function row(id, label, count, checked) {
      const hasCount = (count !== null && count !== undefined);
      const isZero   = hasCount && count === 0;
      const disabled = isZero ? "disabled" : "";
      const dim      = isZero ? "opacity:0.5;" : "";
      // Cochée si checked=true ET (pas de compteur OU compteur > 0)
      const isChecked= (checked && !isZero) ? "checked" : "";
      const cnt      = hasCount ? ' <span style="color:#8892a4;">(' + count + ')</span>' : '';
      return '<label class="kta-ses-cb-row" style="' + dim + '">' +
               '<input type="checkbox" id="' + id + '" ' + isChecked + ' ' + disabled + '>' +
               '<span>' + label + cnt + '</span>' +
             '</label>';
    }

    // Helper : sous-case indentee (enfant d'une parent)
    function rowSub(id, label, count, checked) {
      const disabled = count === 0 ? "disabled" : "";
      const dim      = count === 0 ? "opacity:0.5;" : "";
      const isChecked= (count > 0 && checked) ? "checked" : "";
      return '<label class="kta-ses-cb-row" style="' + dim + 'margin-left:24px;font-size:12px;padding:3px 4px;">' +
               '<input type="checkbox" id="' + id + '" ' + isChecked + ' ' + disabled + '>' +
               '<span>' + label + ' <span style="color:#8892a4;">(' + count + ')</span></span>' +
             '</label>';
    }

    // Sous-cases dynamiques pour les tags de points (avec icones quand dispo)
    let pointsTagsHtml = "";
    if (stats.tagsList.length > 0) {
      pointsTagsHtml = stats.tagsList.map(function(item) {
        const safeTag = _kmzSlugTag(item.tag);
        const iconUrl = item.isUntagged ? null : _kmzIconePourTag(item.tag);
        const iconHtml = iconUrl
          ? '<img src="' + iconUrl + '" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-right:4px;">'
          : (item.isUntagged ? '<span style="opacity:0.5;margin-right:4px;">∅</span>' : '<span style="opacity:0.5;margin-right:4px;">🏷️</span>');
        const label = item.isUntagged ? "<em>(sans tag)</em>" : item.tag;
        return '<label class="kta-ses-cb-row" style="margin-left:24px;font-size:12px;padding:3px 4px;">' +
                 '<input type="checkbox" id="kmz_inc_points_tag_' + safeTag + '" data-tag="' + item.tag + '" checked>' +
                 '<span>' + iconHtml + label + ' <span style="color:#8892a4;">(' + item.count + ')</span></span>' +
               '</label>';
      }).join("");
    }

    const rByT = stats.roadsByType;
    const zByT = stats.zonesByType;
    const roadsTotal = rByT.principal + rByT.secondaire + rByT.chemin;
    const zonesTotal = zByT.eau + zByT.remblais + zByT.effondrement + zByT.inaccessible;

    return '<div class="kta-kmz-section">' +
        '<div class="kta-kmz-section-titre">📦 Contenu à inclure</div>' +

        // --- Image + opacite ---
        row("kmz_inc_image", "🖼️ Image plan (GroundOverlay)", null, true) +
        '<div class="kta-kmz-opacity-row" id="kmz_opacity_wrap" style="margin-left:24px;">' +
          '<label for="kmz_img_opacity" class="kta-kmz-opacity-lbl">Opacité :</label>' +
          '<input type="range" id="kmz_img_opacity" min="0" max="100" step="5" value="60" class="kta-kmz-opacity-slider">' +
          '<span id="kmz_img_opacity_val" class="kta-kmz-opacity-val">60%</span>' +
        '</div>' +

        // --- Points + sous-cases par tag ---
        row("kmz_inc_points", "📍 Points", stats.pointsTotal, true) +
        pointsTagsHtml +

        // --- Tracés + sous-cases par type ---
        row("kmz_inc_roads", "🛣️ Tracés", roadsTotal, true) +
        rowSub("kmz_inc_roads_principal",  "🟩 Principaux",  rByT.principal,  true) +
        rowSub("kmz_inc_roads_secondaire", "🟪 Secondaires", rByT.secondaire, true) +
        rowSub("kmz_inc_roads_chemin",     "🟨 Chemins",     rByT.chemin,     true) +

        // --- Zones + sous-cases par type ---
        row("kmz_inc_zones", "⬛ Zones", zonesTotal, true) +
        rowSub("kmz_inc_zones_eau",          "🟦 Eau",          zByT.eau,          true) +
        rowSub("kmz_inc_zones_remblais",     "⬛ Remblais",     zByT.remblais,     true) +
        rowSub("kmz_inc_zones_effondrement", "🟥 Effondrement", zByT.effondrement, true) +
        rowSub("kmz_inc_zones_inaccessible", "⛔ Inaccessible", zByT.inaccessible, true) +

        // --- Jonctions (uniquement si multi-niveau) ---
        (mlOn ? row("kmz_inc_jonctions", "🪜 Jonctions interniveau", rByT.jonction, rByT.jonction > 0) : '') +

        // --- Itineraire actif ---
        row("kmz_inc_iti", "🗺️ Itinéraire actif", rByT.itinerary, rByT.itinerary > 0) +
      '</div>';
  }

  // ---------- BIND HANDLERS ----------
  function _bindKmzHandlers() {
    // Validation + aperçu coins à chaque changement de champ
    ["x", "y", "lat", "lng"].forEach(function(field) {
      ["A", "B"].forEach(function(letter) {
        const el = document.getElementById("kmz_" + letter + "_" + field);
        if (el) el.addEventListener("input", _kmzRafraichirApercu);
      });
    });

    // Boutons "🔍 Chercher un point" → autocomplete
    ["A", "B"].forEach(function(letter) {
      const btn = document.getElementById("kmz_" + letter + "_search");
      if (btn) btn.addEventListener("click", function() { _kmzOuvrirRecherche(letter); });
    });

    // Boutons "📍 Cliquer carte" → mode clic
    ["A", "B"].forEach(function(letter) {
      const btn = document.getElementById("kmz_" + letter + "_click");
      if (btn) btn.addEventListener("click", function() { _kmzActiverModeClic(letter); });
    });

    // Slider opacité image : maj du % en live + greying out si checkbox image décochée
    const sliderOp = document.getElementById("kmz_img_opacity");
    const sliderOpVal = document.getElementById("kmz_img_opacity_val");
    if (sliderOp && sliderOpVal) {
      sliderOp.addEventListener("input", function() {
        sliderOpVal.textContent = sliderOp.value + "%";
      });
    }
    const cbImg = document.getElementById("kmz_inc_image");
    const opWrap = document.getElementById("kmz_opacity_wrap");
    if (cbImg && opWrap) {
      const _majOpState = function() {
        if (cbImg.checked) opWrap.classList.remove("disabled");
        else               opWrap.classList.add("disabled");
      };
      cbImg.addEventListener("change", _majOpState);
      _majOpState();
    }

    // Sync parent ↔ enfants (pattern IMAGE AVANCE) — defer car les enfants
    // sont rendus dans le meme HTML et tous prets a ce stade.
    setTimeout(function() {
      _kmzSyncParent("kmz_inc_roads", ["kmz_inc_roads_principal", "kmz_inc_roads_secondaire", "kmz_inc_roads_chemin"]);
      _kmzSyncParent("kmz_inc_zones", ["kmz_inc_zones_eau", "kmz_inc_zones_remblais", "kmz_inc_zones_effondrement", "kmz_inc_zones_inaccessible"]);
      // Points : sous-cases par tag, IDs = kmz_inc_points_tag_<slug>
      const tagCheckboxes = document.querySelectorAll('[id^="kmz_inc_points_tag_"]');
      const tagIds = Array.from(tagCheckboxes).map(function(cb) { return cb.id; });
      if (tagIds.length > 0) _kmzSyncParent("kmz_inc_points", tagIds);
    }, 0);

    // Premier rendu aperçu (si calibrage restauré)
    _kmzRafraichirApercu();

    // Chips niveaux si multiLevel ON
    _kmzRafraichirChipsNiveaux();
  }

  function _kmzLireCalib() {
    const get = function(id) {
      const v = document.getElementById(id);
      if (!v) return null;
      const n = parseFloat(v.value);
      return Number.isFinite(n) ? n : null;
    };
    return {
      pointA: {
        x:   get("kmz_A_x"),   y:   get("kmz_A_y"),
        lat: get("kmz_A_lat"), lng: get("kmz_A_lng")
      },
      pointB: {
        x:   get("kmz_B_x"),   y:   get("kmz_B_y"),
        lat: get("kmz_B_lat"), lng: get("kmz_B_lng")
      }
    };
  }

  function _kmzRafraichirApercu() {
    const target = document.getElementById("kmz_apercu");
    if (!target) return;
    const c = _kmzLireCalib();
    const ok = c.pointA.x != null && c.pointA.y != null &&
               c.pointA.lat != null && c.pointA.lng != null &&
               c.pointB.x != null && c.pointB.y != null &&
               c.pointB.lat != null && c.pointB.lng != null;
    if (!ok) {
      target.innerHTML = '<em style="color:#8892a4;">Renseigne les 8 champs pour voir l\'aperçu des coins du plan...</em>';
      return;
    }
    if (!window.KmzExport) {
      target.innerHTML = '<em style="color:#cc0000;">Module KmzExport non chargé.</em>';
      return;
    }
    let transform;
    try {
      transform = window.KmzExport.buildTransform(
        { x: c.pointA.x, y: c.pointA.y },
        { x: c.pointB.x, y: c.pointB.y },
        { lat: c.pointA.lat, lng: c.pointA.lng },
        { lat: c.pointB.lat, lng: c.pointB.lng }
      );
    } catch(e) {
      target.innerHTML = '<span style="color:#ff9933;">⚠️ ' + String(e.message || e) + '</span>';
      return;
    }
    const W = window.APP_CONFIG.imageWidth  || 0;
    const H = window.APP_CONFIG.imageHeight || 0;
    const cTL = window.KmzExport.planToGps(transform, 0, 0);
    const cTR = window.KmzExport.planToGps(transform, W, 0);
    const cBL = window.KmzExport.planToGps(transform, 0, H);
    const cBR = window.KmzExport.planToGps(transform, W, H);
    const cCenter = window.KmzExport.planToGps(transform, W/2, H/2);
    function fmt(ll) { return ll.lat.toFixed(6) + ", " + ll.lng.toFixed(6); }
    const gmapsUrl = "https://www.google.com/maps/@" + cCenter.lat + "," + cCenter.lng + ",17z";
    target.innerHTML =
      '<div class="kta-kmz-coins-grille">' +
        '<div>↖️ Haut-gauche : <code>' + fmt(cTL) + '</code></div>' +
        '<div>↗️ Haut-droite : <code>' + fmt(cTR) + '</code></div>' +
        '<div>↙️ Bas-gauche : <code>' + fmt(cBL) + '</code></div>' +
        '<div>↘️ Bas-droite : <code>' + fmt(cBR) + '</code></div>' +
      '</div>' +
      '<div style="margin-top:8px;">' +
        '<a href="' + gmapsUrl + '" id="kmz_apercu_gmaps_link" target="_blank" rel="noopener" style="color:#8cb4ff;">🔗 Voir le centre sur Google Maps</a>' +
      '</div>' +
      '<div style="margin-top:6px; font-size:11.5px; color:#8892a4;">' +
        'Échelle calculée : <strong>' + transform.metresParPixel.toFixed(3) + ' m/px</strong>' +
        ' · Rotation : <strong>' + (transform.rotation * 180 / Math.PI).toFixed(1) + '°</strong>' +
      '</div>';

    // Interception du clic Google Maps : ping internet avant ouverture pour
    // éviter une erreur navigateur sèche en mode offline (DNS_PROBE / ERR_NAME).
    // Le lien garde son target/rel pour le clic milieu/Ctrl+clic (ouvre direct
    // en nouvel onglet, le ping ne s'applique qu'au clic gauche standard).
    const linkGmaps = document.getElementById("kmz_apercu_gmaps_link");
    if (linkGmaps) {
      linkGmaps.addEventListener("click", function(e) {
        // Modificateurs (Ctrl/Cmd/Shift/middle-click) → laisser le navigateur ouvrir
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        const oldText = linkGmaps.textContent;
        linkGmaps.textContent = "🔗 Vérification connexion…";
        linkGmaps.style.pointerEvents = "none";
        const _restore = function() {
          linkGmaps.textContent = oldText;
          linkGmaps.style.pointerEvents = "";
        };
        const pingFn = typeof window._pingInternet === "function"
          ? window._pingInternet
          : function() { return Promise.resolve(navigator.onLine !== false); };
        pingFn().then(function(online) {
          _restore();
          if (online) {
            window.open(gmapsUrl, "_blank", "noopener");
          } else {
            const msg = "🚫 Hors-ligne — Google Maps inaccessible. Reconnecte-toi pour vérifier le calibrage visuellement.";
            if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
              window.OOMGuard.showToast(msg, "warn");
            } else {
              alert(msg);
            }
          }
        });
      });
    }
  }

  function _kmzRafraichirChipsNiveaux() {
    const el = document.getElementById("kta-kmz-levels-chips");
    if (!el) return;
    const avail = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.availableLevels))
                   ? window.APP_CONFIG.availableLevels.slice() : [0];
    avail.sort(function(a, b) { return a - b; });
    el.innerHTML = avail.map(function(lvl) {
      return '<label class="kta-kmz-chip-niveau"><input type="checkbox" data-level="' + lvl + '" checked> Niv ' + lvl + '</label>';
    }).join("");
  }

  // ---------- AUTOCOMPLETE RECHERCHE ----------
  function _kmzOuvrirRecherche(letter) {
    const res = document.getElementById("kmz_" + letter + "_search_results");
    if (!res) return;
    res.style.display = "block";
    res.innerHTML = '<input type="text" id="kmz_' + letter + '_search_q" class="kta-cfg-input" placeholder="Tape un nom / id / tag..." style="width:100%; margin-bottom:6px;"><div id="kmz_' + letter + '_search_list"></div>';
    const input = document.getElementById("kmz_" + letter + "_search_q");
    const list  = document.getElementById("kmz_" + letter + "_search_list");
    input.focus();
    let debTimer = null;
    input.addEventListener("input", function() {
      const q = input.value.trim();
      if (debTimer) clearTimeout(debTimer);
      if (!q || !window.SearchPoints || typeof window.SearchPoints.findByQuery !== "function") {
        list.innerHTML = "";
        return;
      }
      debTimer = setTimeout(async function() {
        let results = [];
        try { results = await window.SearchPoints.findByQuery(q) || []; } catch(e) {}
        if (input.value.trim() !== q) return;
        if (results.length === 0) {
          list.innerHTML = '<div class="kta-kmz-search-empty">Aucun résultat pour « ' + q + ' »</div>';
          return;
        }
        list.innerHTML = results.slice(0, 10).map(function(it, i) {
          const p = it.point;
          const nom = p.nom || p.id || "(point)";
          // Méta : ID (s'il diffère du nom) + coord plan en plus petit
          const metaParts = [];
          if (p.id && p.id !== nom) metaParts.push(p.id);
          if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
            metaParts.push("x=" + p.x + ", y=" + p.y);
          }
          const meta = metaParts.length > 0
            ? '<span class="kta-kmz-search-meta">(' + metaParts.join(" · ") + ')</span>'
            : '';
          return '<div class="kta-kmz-search-item" data-idx="' + i + '">' +
                   '<strong>' + nom + '</strong>' + meta +
                 '</div>';
        }).join("");
        list.querySelectorAll(".kta-kmz-search-item").forEach(function(row, i) {
          row.addEventListener("click", function() {
            const p = results[i].point;
            document.getElementById("kmz_" + letter + "_x").value = p.x;
            document.getElementById("kmz_" + letter + "_y").value = p.y;
            res.style.display = "none";
            _kmzRafraichirApercu();
          });
        });
      }, 150);
    });
  }

  // ---------- MODE CLIC CARTE ----------
  function _kmzActiverModeClic(letter) {
    if (!window.map) return;
    _kmzDesactiverModeClic();  // si un autre était actif
    _kmzClickActive = true;
    _kmzClickTarget = letter;
    _kmzClickHandler = function(e) {
      const x = e.latlng.lng;
      const y = APP_CONFIG.imageHeight - e.latlng.lat;
      document.getElementById("kmz_" + letter + "_x").value = Math.round(x * 100) / 100;
      document.getElementById("kmz_" + letter + "_y").value = Math.round(y * 100) / 100;
      _kmzDesactiverModeClic();
      if (_modal) _modal.style.display = "";
      _kmzRafraichirApercu();
    };
    window.map.on("click", _kmzClickHandler);
    if (_modal) _modal.style.display = "none";
    // Floater minimal pour indiquer le mode actif
    const fl = document.createElement("div");
    fl.id = "kta-kmz-click-floater";
    fl.className = "kta-iti-floater";
    fl.innerHTML = '<span class="kta-iti-floater-icon">📍</span><span class="kta-iti-floater-msg">Clique sur la carte pour saisir le Point ' + letter + '</span><button class="kta-btn kta-btn-ghost" id="kmz_click_cancel" type="button">Annuler</button>';
    document.body.appendChild(fl);
    document.getElementById("kmz_click_cancel").addEventListener("click", function() {
      _kmzDesactiverModeClic();
      if (_modal) _modal.style.display = "";
    });
  }

  function _kmzDesactiverModeClic() {
    if (!_kmzClickActive) return;
    _kmzClickActive = false;
    _kmzClickTarget = null;
    if (window.map && _kmzClickHandler) window.map.off("click", _kmzClickHandler);
    _kmzClickHandler = null;
    const fl = document.getElementById("kta-kmz-click-floater");
    if (fl) fl.remove();
  }

  // ---------- EXPORT KMZ ----------
  async function _exportKmz() {
    if (!window.KmzExport) {
      alert("Module KmzExport non chargé.");
      return;
    }
    const c = _kmzLireCalib();
    if (c.pointA.x == null || c.pointA.y == null || c.pointA.lat == null || c.pointA.lng == null ||
        c.pointB.x == null || c.pointB.y == null || c.pointB.lat == null || c.pointB.lng == null) {
      alert("Les 8 champs de calibrage sont obligatoires (4 par point).");
      return;
    }
    // Build transform (avec validations bloquantes)
    let transform;
    try {
      transform = window.KmzExport.buildTransform(
        { x: c.pointA.x, y: c.pointA.y },
        { x: c.pointB.x, y: c.pointB.y },
        { lat: c.pointA.lat, lng: c.pointA.lng },
        { lat: c.pointB.lat, lng: c.pointB.lng }
      );
    } catch(e) {
      alert("Calibrage invalide : " + e.message);
      return;
    }
    // Persistance
    window.KmzExport.setCalibration(_kmzCurrentPlanId(), c);

    // Collecte des données session
    const d = _compter();

    // Filtre niveaux (chips si multiLevel ON, sinon null = tous)
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    let levels = null;
    if (mlOn) {
      levels = new Set();
      document.querySelectorAll('#kta-kmz-levels-chips input[type="checkbox"]:checked').forEach(function(cb) {
        const lvl = parseInt(cb.dataset.level, 10);
        if (Number.isInteger(lvl)) levels.add(lvl);
      });
      if (levels.size === 0) levels = null;
    }

    // Image plan (Blob) + nom de fichier — résolu via RUNTIME_ASSETS si dispo
    let imageBlob = null;
    let imageFilename = null;
    const inclImage = document.getElementById("kmz_inc_image")?.checked;
    if (inclImage && window.PLAN_CONFIG?.plan?.baseImage) {
      const baseImagePath = window.PLAN_CONFIG.plan.baseImage;
      const fullPath = baseImagePath.indexOf("/") >= 0 ? baseImagePath : ("data/" + baseImagePath);
      imageFilename = baseImagePath;
      // Tentative 1 : RUNTIME_ASSETS (cas ZIP local)
      if (window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[fullPath]) {
        const asset = window.RUNTIME_ASSETS[fullPath];
        if (asset.file instanceof Blob) imageBlob = asset.file;
        else if (asset.url) {
          try { const r = await fetch(asset.url); if (r.ok) imageBlob = await r.blob(); } catch(e) {}
        }
      }
      // Tentative 2 : fetch direct (cas plan serveur)
      if (!imageBlob) {
        try { const r = await fetch(fullPath); if (r.ok) imageBlob = await r.blob(); } catch(e) {}
      }
      if (!imageBlob) {
        console.warn("[KMZ] Image plan introuvable → KMZ généré sans GroundOverlay");
        imageFilename = null;
      }
    }

    // Icônes embedded : 1 PNG par tag rencontré dans les points.
    // v174 : check _kta_iconUrl (divIcon scaledMarkers) avant options.iconUrl
    const iconsToEmbed = {};
    if (window._iconMap) {
      // On embed TOUTES les icônes connues — c'est ~30 Ko au total et plus simple
      Object.keys(window._iconMap).forEach(function(tag) {
        const icObj = window._iconMap[tag];
        if (!icObj) return;
        const url = icObj._kta_iconUrl || (icObj.options && icObj.options.iconUrl);
        if (url) iconsToEmbed[tag] = url;
      });
    }
    if (window.iconeDefault) {
      const defUrl = window.iconeDefault._kta_iconUrl ||
                     (window.iconeDefault.options && window.iconeDefault.options.iconUrl);
      if (defUrl) iconsToEmbed["default"] = defUrl;
    }

    // Génération KMZ
    const btnDl = document.getElementById("kta-ses-download");
    if (btnDl) { btnDl.disabled = true; btnDl.textContent = "Génération KMZ..."; }
    try {
      // Collecte des points editor + data layers
      const editorPoints = d.points || [];
      // Data layer points : on lit _ktaDataMarkers et on reconstruit {x, y, nom, tags, level}
      const dataLayerPoints = [];
      if (Array.isArray(window._ktaDataMarkers)) {
        window._ktaDataMarkers.forEach(function(m) {
          if (!m || !m.getLatLng) return;
          const ll = m.getLatLng();
          dataLayerPoints.push({
            x:     ll.lng,
            y:     APP_CONFIG.imageHeight - ll.lat,
            nom:   m._ktaNom || "",
            tags:  Array.isArray(m._ktaTags) ? m._ktaTags : [],
            level: Number.isInteger(m._ktaLevel) ? m._ktaLevel : 0
          });
        });
      }
      const allPoints = editorPoints.concat(dataLayerPoints);

      // 🛣️ Roads : session + embedded data layers
      // Sans ça, un plan dont les tracés sont définis dans les JSON data layers
      // (chemin.json, puits.json, etc.) ne sortait qu'avec ses tracés session.
      // getAllEmbeddedRoads = TOUTES les roads embedded (visibles ET masquées),
      // cohérent avec Pathfinder + Distance totale (cf. CLAUDE.md §15).
      const sessionRoads = d.roads || [];
      const embeddedRoads = (typeof window.getAllEmbeddedRoads === "function")
        ? window.getAllEmbeddedRoads()
        : [];
      const allRoads = sessionRoads.concat(embeddedRoads);

      // ⬛ Zones : session + embedded data layers (symétrique aux roads)
      // Nouveau getter window.getAllEmbeddedZones (v169 Karma_dev) qui mappe
      // _ktaDataPolygons vers le format {type, points, level} de getZones().
      const sessionZones = d.zones || [];
      const embeddedZones = (typeof window.getAllEmbeddedZones === "function")
        ? window.getAllEmbeddedZones()
        : [];
      const allZones = sessionZones.concat(embeddedZones);

      // Opacité image : slider 0-100% → passé en pourcent au générateur
      const opSlider = document.getElementById("kmz_img_opacity");
      const imageOpacity = opSlider ? Math.max(0, Math.min(100, parseInt(opSlider.value, 10) || 60)) : 60;

      // === Lecture des sous-cases granulaires (pattern IMAGE AVANCE) ===
      // Sets de filtrage par type/tag : si la Set est non-null, le generateur
      // ne garde QUE les items du Set. Si null = parent decoche = drop total.
      // Si Set vide = parent coche mais aucun enfant = drop total (cas degenere).

      // Tags points : on lit toutes les sous-cases [id^="kmz_inc_points_tag_"]
      let pointTagsSet = null;
      const pointsParent = document.getElementById("kmz_inc_points");
      if (pointsParent && pointsParent.checked) {
        pointTagsSet = new Set();
        document.querySelectorAll('[id^="kmz_inc_points_tag_"]').forEach(function(cb) {
          if (cb.checked && cb.dataset && cb.dataset.tag) pointTagsSet.add(cb.dataset.tag);
        });
      }

      // Types roads : 3 sous-cases (principal/secondaire/chemin)
      let roadTypesSet = null;
      const roadsParent = document.getElementById("kmz_inc_roads");
      if (roadsParent && roadsParent.checked) {
        roadTypesSet = new Set();
        ["principal", "secondaire", "chemin"].forEach(function(t) {
          const cb = document.getElementById("kmz_inc_roads_" + t);
          if (cb && cb.checked) roadTypesSet.add(t);
        });
      }

      // Types zones : 4 sous-cases (eau/remblais/effondrement/inaccessible)
      let zoneTypesSet = null;
      const zonesParent = document.getElementById("kmz_inc_zones");
      if (zonesParent && zonesParent.checked) {
        zoneTypesSet = new Set();
        ["eau", "remblais", "effondrement", "inaccessible"].forEach(function(t) {
          const cb = document.getElementById("kmz_inc_zones_" + t);
          if (cb && cb.checked) zoneTypesSet.add(t);
        });
      }

      console.log("[KMZ] Contenu :",
        allPoints.length, "points,",
        allRoads.length, "roads (" + sessionRoads.length + " session +", embeddedRoads.length, "embedded),",
        allZones.length, "zones (" + sessionZones.length + " session +", embeddedZones.length, "embedded)");
      console.log("[KMZ] Filtres :",
        "pointTags=", pointTagsSet ? Array.from(pointTagsSet) : "null",
        "roadTypes=", roadTypesSet ? Array.from(roadTypesSet) : "null",
        "zoneTypes=", zoneTypesSet ? Array.from(zoneTypesSet) : "null");

      const kmzBlob = await window.KmzExport.genererKmz({
        planName:    (window.PLAN_CONFIG?.plan?.name)    || "Plan MyKTAMap",
        planVersion: (window.PLAN_CONFIG?.plan?.version) || "",
        planAuthor:  (window.PLAN_CONFIG?.plan?.author)  || "KARMA",
        imageW:      window.APP_CONFIG.imageWidth,
        imageH:      window.APP_CONFIG.imageHeight,
        transform:   transform,
        imageOpacity: imageOpacity,    // 0-100 (% d'opacité du GroundOverlay)
        include: {
          image:      inclImage,
          points:     !!pointTagsSet,       // true si parent coche
          roads:      !!roadTypesSet,
          zones:      !!zoneTypesSet,
          jonctions:  mlOn && document.getElementById("kmz_inc_jonctions")?.checked,
          itineraire: document.getElementById("kmz_inc_iti")?.checked,
          dataLayers: true,
          // Sets de filtrage granulaire (null = pas de filtre, Set = whitelist)
          pointTagsSet: pointTagsSet,
          roadTypesSet: roadTypesSet,
          zoneTypesSet: zoneTypesSet
        },
        levels:        levels,
        data: {
          editorPoints: allPoints,
          roads:        allRoads,
          zones:        allZones
        },
        imageBlob:     imageBlob,
        imageFilename: imageFilename,
        iconsToEmbed:  iconsToEmbed
      });

      // Téléchargement
      const url = URL.createObjectURL(kmzBlob);
      const a = document.createElement("a");
      const planName = (window.PLAN_CONFIG?.plan?.name) || "plan";
      a.href = url;
      a.download = "MyKTAMap_" + planName.replace(/[^a-z0-9]+/gi, "_") + "_" + new Date().toISOString().slice(0, 10) + ".kmz";
      a.click();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

      _fermer();
    } catch(e) {
      console.error("[KMZ] Erreur génération :", e);
      alert("Erreur lors de la génération du KMZ : " + (e.message || e));
    } finally {
      if (btnDl) { btnDl.disabled = false; btnDl.textContent = "Télécharger"; }
    }
  }

})();
