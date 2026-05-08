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
    if (entry && entry.options && entry.options.iconUrl) return entry.options.iconUrl;
    return null;
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
    const zonesByType = _trierParType(d.zones, ["eau", "remblais", "effondrement"]);
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
    syncParent("adv_zones", ["adv_zones_eau", "adv_zones_remblais", "adv_zones_effondrement"]);

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
  function _renderConversion() {
    const d = _compter();
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
        ${row("conv_roads",  "🛣️ Tracés",          d.roads.length,  true)}
        ${row("conv_zones",  "⬛ Zones",            d.zones.length,  true)}
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

  // Listeners parent ↔ tags pour Conversion (post-DOM)
  function _attacherListenersConversion() {
    if (!_modal || _activeTab !== "conversion") return;

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
    const zoneTypes = ["eau", "remblais", "effondrement"].filter(function(t) {
      return document.getElementById("adv_zones_" + t)?.checked;
    });

    const filteredRoads = (d.roads || []).filter(function(r) { return roadTypes.indexOf(r.type) >= 0; });
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
  function _exportConversion() {
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

    const total = filteredPoints.length + (incRoads ? d.roads.length : 0) + (incZones ? d.zones.length : 0);
    if (total === 0) {
      alert("Rien à convertir — sélectionnez au moins une catégorie / un tag non vide.");
      return;
    }

    if (gran === "basic") {
      // Granularité basique : 1 fichier par catégorie (max 3)
      const files = [];
      if (filteredPoints.length) {
        files.push({ name: "points.json", payload: { data: filteredPoints } });
      }
      if (incRoads && d.roads.length) {
        files.push({ name: "roads.json", payload: { data: [], roads: d.roads } });
      }
      if (incZones && d.zones.length) {
        files.push({ name: "zones.json", payload: { data: [], zones: d.zones } });
      }
      _telechargerConversionFiles(files);
    } else {
      // Granularité fine : par type
      const files = [];

      if (filteredPoints.length) {
        // Points : un seul fichier (les tags sont multiples → séparation ambigüe)
        files.push({ name: "points.json", payload: { data: filteredPoints } });
      }

      if (incRoads) {
        const byType = _trierParType(d.roads, ["principal", "secondaire", "chemin"]);
        ["principal", "secondaire", "chemin"].forEach(function(t) {
          if (byType[t].length) {
            files.push({ name: "roads_" + t + ".json", payload: { data: [], roads: byType[t] } });
          }
        });
      }

      if (incZones) {
        const byType = _trierParType(d.zones, ["eau", "remblais", "effondrement"]);
        ["eau", "remblais", "effondrement"].forEach(function(t) {
          if (byType[t].length) {
            files.push({ name: "zones_" + t + ".json", payload: { data: [], zones: byType[t] } });
          }
        });
      }

      _telechargerConversionFiles(files);
    }
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
  }

})();
