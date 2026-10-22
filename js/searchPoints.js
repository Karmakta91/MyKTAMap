/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// searchPoints.js — recherche dans le plan ouvert (Ctrl/Cmd+K) : points (calques + session), tracés,
//   zones, structures (session + embarqués) ; saisie « lat, lng » sur un plan géoréférencé.
//   Résultats groupés par catégorie ; un clic centre la carte, ouvre le popup et fait clignoter l'objet.
// Expose : window.ouvrirRecherche, window.SearchPoints (getAllPoints, findByQuery : points seuls).

(function() {
  "use strict";

  let _modal       = null;
  let _pointsCache = null;          // [{point, layerId, layerLabel}] — UNIQUEMENT data layers externes (cache)
  let _planSignature = null;        // pour invalider le cache au changement de plan
  let _filtreTimer = null;
  let _visibles    = [];            // liste actuellement affichée (référence pour les clics)
  let _flashLayer  = null;          // pour l'animation visuelle

  // Filtres remis à zéro à chaque ouverture. Set vide = tout.
  let _filterLayers = new Set();    // Set<layerId> — vide = tous les calques
  let _filterTags   = new Set();    // Set<tag>     — vide = tous les tags
  // Set<"point"|"road"|"zone"|"structure">
  let _filterKinds  = new Set();

  function _injecterStyles() {
    if (document.getElementById("kta-search-styles")) return;
    const s = document.createElement("style");
    s.id = "kta-search-styles";
    s.textContent = `
      #kta-search-modal .kta-readme-modal-boite {
        max-width: 560px; width: 95%; height: auto; max-height: 85vh;
        display:flex; flex-direction:column;
      }
      #kta-search-modal .kta-readme-modal-corps {
        display:flex; flex-direction:column; flex:1; min-height:0; padding-bottom:14px;
      }

      .kta-search-input-wrap {
        position: sticky; top: 0; z-index: 2;
        background: var(--bg-modal, #1a1f2e);
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .kta-search-input-wrap input {
        width: 100%; box-sizing: border-box;
        padding: 10px 14px;
        background: rgba(255,255,255,0.06);
        color: var(--kta-texte);
        border: 1px solid rgba(140,180,255,0.3);
        border-radius: 8px;
        outline: none;
        font-size: 14px;
        font-family: inherit;
      }
      .kta-search-input-wrap input:focus {
        border-color: rgba(140,180,255,0.6);
        background: rgba(255,255,255,0.08);
      }

      .kta-search-info {
        font-size: 12px; color: var(--kta-texte-3);
      }
      .kta-search-info-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px;
        padding: 8px 0;
      }
      .kta-search-clear-filters {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.10);
        color: var(--kta-texte-2);
        font-size: 11px;
        padding: 4px 10px;
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .kta-search-clear-filters:hover {
        background: rgba(255, 110, 110, 0.10);
        border-color: rgba(255, 110, 110, 0.40);
        color: #ffb3b3;
      }

      /* === FILTRES — chips calques + tags === */
      .kta-search-filters {
        padding: 8px 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .kta-search-filters:empty {
        display: none;
      }
      .kta-search-filters-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 6px;
      }
      .kta-search-filters-row:last-child {
        margin-bottom: 0;
      }
      .kta-search-filters-label {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        color: var(--kta-interaction);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding-top: 5px;
        min-width: 56px;
      }
      .kta-search-filters-chips {
        flex: 1;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .kta-search-chip {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.10);
        color: var(--kta-texte-2);
        font-size: 11px;
        padding: 3px 9px;
        border-radius: 999px;
        cursor: pointer;
        font-family: inherit;
        white-space: nowrap;
        line-height: 1.4;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
      }
      .kta-search-chip:hover:not(.active) {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.18);
        color: var(--kta-texte);
      }
      .kta-search-chip.active {
        background: #f4c542;
        border-color: #f4c542;
        color: #1a1f2e;
        font-weight: 600;
      }

      .kta-search-results {
        flex: 1; min-height: 0;
        overflow-y: auto;
        margin: 0 -4px;
      }

      .kta-search-result {
        display: flex; gap: 12px; align-items: center;
        padding: 10px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.12s;
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .kta-search-result:hover {
        background: rgba(140,180,255,0.1);
      }
      .kta-search-result:last-child { border-bottom: none; }

      .kta-search-icon {
        flex-shrink: 0;
        width: 36px; height: 36px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,0.04);
        border-radius: 4px;
      }
      .kta-search-icon img {
        width: 28px; height: 28px; object-fit: contain;
      }

      .kta-search-content {
        flex: 1; min-width: 0;
      }
      .kta-search-name {
        font-size: 14px; font-weight: 600; color: var(--kta-texte);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .kta-search-name .kta-search-id {
        color: var(--kta-interaction); font-weight: 500; margin-right: 6px;
      }
      .kta-search-meta {
        font-size: 12px; color: var(--kta-texte-3);
        margin-top: 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .kta-search-meta .layer-tag {
        display: inline-block;
        padding: 1px 6px;
        background: rgba(140,180,255,0.12);
        border: 1px solid rgba(140,180,255,0.25);
        border-radius: 8px;
        color: var(--kta-texte-2);
        margin-right: 6px;
        font-size: 11px;
      }
      .kta-search-meta .tag-chip {
        display: inline-block;
        padding: 1px 5px;
        background: rgba(255,255,255,0.06);
        border-radius: 6px;
        margin-right: 4px;
        font-size: 11px;
        color: var(--kta-texte-2);
      }
      .kta-search-coords {
        font-size: 11px; color: var(--kta-texte-3);
        font-family: 'Courier New', monospace;
      }

      .kta-search-empty {
        text-align: center;
        padding: 40px 20px;
        color: var(--kta-texte-3);
        font-size: 13px;
      }
      .kta-search-empty .empty-icon {
        font-size: 36px; opacity: 0.5;
        margin-bottom: 10px;
      }

      .kta-search-more {
        text-align: center;
        padding: 10px;
        color: var(--kta-texte-3);
        font-size: 12px;
        font-style: italic;
      }
    `;
    document.head.appendChild(s);
  }

  window.ouvrirRecherche = function() {
    _injecterStyles();
    if (_modal) { _modal.remove(); _modal = null; }
    _filterLayers = new Set();
    _filterTags   = new Set();
    _filterKinds  = new Set();
    _afficherModal();
  };

  // Ctrl/Cmd+K global, sauf dans un champ de saisie (ne pas voler le raccourci natif), et sauf pour
  // refermer la recherche déjà ouverte (bascule).
  document.addEventListener("keydown", function(e) {
    const key = (e.key || "").toLowerCase();
    const isCmdK = (e.ctrlKey || e.metaKey) && key === "k" && !e.altKey && !e.shiftKey;
    if (!isCmdK) return;
    const ae = document.activeElement;
    const isInputFocused = ae && (
      ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" ||
      (ae.getAttribute && ae.getAttribute("contenteditable") === "true")
    );
    const searchAlreadyOpen = !!document.getElementById("kta-search-modal");
    if (isInputFocused && !searchAlreadyOpen) return;
    e.preventDefault();
    e.stopPropagation();
    if (searchAlreadyOpen) {
      const existing = document.getElementById("kta-search-modal");
      if (existing) existing.remove();
      _modal = null;
    } else {
      window.ouvrirRecherche();
    }
  });

  // ⚠️ API au format POINT seul (Pathfinder, itinéraire), sans ouvrir la modale. Async : le 1er appel
  // charge le cache des calques.
  window.SearchPoints = {
    getAllPoints: async function() {
      try { await _chargerCache(); }
      catch(e) { console.warn("[SearchPoints.getAllPoints] cache load failed :", e); }
      return _tousLesPoints();
    },
    // Sous-chaîne, casse ignorée, sur nom + id + tags (autocomplétion de l'itinéraire).
    findByQuery: async function(query) {
      const q = _normalize(query || "");
      if (!q) return [];
      const all = await window.SearchPoints.getAllPoints();
      return all.filter(function(it) {
        const p = it.point;
        if (_normalize(p.nom) .indexOf(q) >= 0) return true;
        if (_normalize(p.id)  .indexOf(q) >= 0) return true;
        if (Array.isArray(p.tags) && p.tags.some(function(t) { return _normalize(t).indexOf(q) >= 0; })) return true;
        return false;
      });
    }
  };

  // ── Filtres ──────────────────────────────
  function _availableLayers() {
    const map = new Map();
    _tousLesPoints().forEach(function(it) {
      if (!map.has(it.layerId)) {
        map.set(it.layerId, { id: it.layerId, label: it.layerLabel || it.layerId });
      }
    });
    return Array.from(map.values()).sort(function(a, b) {
      return a.label.localeCompare(b.label);
    });
  }

  function _availableTags() {
    const set = new Set();
    _tousLesPoints().forEach(function(it) {
      if (Array.isArray(it.point.tags)) {
        it.point.tags.forEach(function(t) {
          if (t) set.add(String(t));
        });
      }
    });
    return Array.from(set).sort(function(a, b) {
      return a.localeCompare(b);
    });
  }


  // Catégorie pour tous ; calques et tags pour les POINTS seulement (les autres n'en ont pas).
  function _matchesFiltersUnified(it) {
    if (_filterKinds.size > 0 && !_filterKinds.has(it.kind)) return false;
    if (it.kind === "point") {
      if (_filterLayers.size > 0 && !_filterLayers.has(it.layerId)) return false;
      if (_filterTags.size > 0) {
        const tags = Array.isArray(it.item.tags) ? it.item.tags : [];
        const hasMatch = tags.some(function(t) { return _filterTags.has(t); });
        if (!hasMatch) return false;
      }
    }
    return true;
  }

  // Cache invalidé quand le plan change (signature relue à chaque ouverture).
  function _signaturePlan() {
    const c = window.PLAN_CONFIG;
    if (!c) return null;
    return (c.plan?.name || "") + "|" + (c.plan?.version || "") + "|" + (c.plan?.baseImage || "");
  }

  // ── Modale ──────────────────────────────
  function _afficherModal() {
    const modal = document.createElement("div");
    modal.id = "kta-search-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">${window.I18n.t("search.modal.titre")} <span style="font-size:11px; color:var(--kta-texte-3); font-weight:400; margin-left:8px;">Ctrl+K</span></span>
          <button class="kta-panneau-close" id="kta-search-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps">

          <div class="kta-search-input-wrap">
            <input type="text" id="kta-search-input"
              placeholder="${_escapeAttr(window.I18n.t("search.modal.placeholder"))}"
              autocomplete="off">
          </div>
          <!-- 🆕 hotfix18 — hint format GPS (visible uniquement si plan georef) -->
          <div class="kta-search-gps-hint" id="kta-search-gps-hint" style="display:none;">
            ${window.I18n.t("search.modal.gpsHint")}
          </div>

          <div class="kta-search-filters" id="kta-search-filters"></div>

          <div class="kta-search-info-row">
            <div class="kta-search-info" id="kta-search-info">${window.I18n.t("search.info.loading")}</div>
            <button class="kta-search-clear-filters" id="kta-search-clear-filters" type="button" style="display:none;">${window.I18n.t("search.filters.clear")}</button>
          </div>

          <div class="kta-search-results" id="kta-search-results"></div>

          <!-- 🌐 v1.58.0 (A1 1:c) — pont vers la recherche CROSS-PLAN : ouvre la
               modale multi-plans (js/crossPlanSearch.js) en reprenant la saisie
               en cours. Affiché seulement si le module est chargé. -->
          <button class="kta-search-crossplan" id="kta-search-crossplan" type="button" style="display:none;">
            🌐 ${window.I18n.t("search.crossPlanBridge")}
          </button>

        </div>
      </div>
    `;
    document.documentElement.appendChild(modal);
    _modal = modal;

    const input    = document.getElementById("kta-search-input");
    const infoEl   = document.getElementById("kta-search-info");
    const resEl    = document.getElementById("kta-search-results");
    const btnClose = document.getElementById("kta-search-close");

    // Indice « lat, lng » seulement sur un plan calibré (ailleurs, il tromperait).
    (function _checkGpsHint() {
      const hintEl = document.getElementById("kta-search-gps-hint");
      if (!hintEl) return;
      const planId = window._currentLoadedPlanId || "";
      if (!window.KmzExport || typeof window.KmzExport.getCalibration !== "function") return;
      const calib = window.KmzExport.getCalibration(planId);
      if (calib && calib.pointA && calib.pointB &&
          typeof calib.pointA.x === "number" && typeof calib.pointA.lat === "number" &&
          typeof calib.pointB.x === "number" && typeof calib.pointB.lat === "number") {
        hintEl.style.display = "block";
      }
    })();

    function fermer() {
      if (_modal) _modal.remove();
      _modal = null;
      if (_filtreTimer) { clearTimeout(_filtreTimer); _filtreTimer = null; }
    }
    btnClose.addEventListener("click", fermer);

    // Passerelle : ferme et ouvre la recherche multi-plans avec la saisie en cours.
    (function _wireCrossPlanBridge() {
      const bridge = document.getElementById("kta-search-crossplan");
      if (!bridge || !window.CrossPlanSearch || typeof window.CrossPlanSearch.ouvrir !== "function") return;
      bridge.style.display = "";
      bridge.addEventListener("click", function() {
        const q = input ? input.value : "";
        fermer();
        window.CrossPlanSearch.ouvrir(q);
      });
    })();
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape" && _modal) {
        fermer();
        document.removeEventListener("keydown", onEsc);
      }
    });

    _chargerCache().then(function() {
      const total = _tousLesItems().length;
      infoEl.textContent = window.I18n.t("search.info.available", { count: total });
      _renderFiltres();           // chips catégorie + calques + tags
      _renderResultats("");
      input.focus();
    }).catch(function(err) {
      infoEl.innerHTML = '<span style="color:var(--kta-erreur);">❌ ' + _escapeHtml(err.message) + '</span>';
    });

    const filtersEl = document.getElementById("kta-search-filters");
    if (filtersEl) {
      filtersEl.addEventListener("click", function(e) {
        const chip = e.target.closest(".kta-search-chip");
        if (!chip) return;
        const type  = chip.dataset.filterType;
        const value = chip.dataset.filterValue;
        if (type === "layer") {
          if (_filterLayers.has(value)) _filterLayers.delete(value);
          else _filterLayers.add(value);
        } else if (type === "tag") {
          if (_filterTags.has(value)) _filterTags.delete(value);
          else _filterTags.add(value);
        } else if (type === "kind") {
          if (_filterKinds.has(value)) _filterKinds.delete(value);
          else _filterKinds.add(value);
        }
        chip.classList.toggle("active");
        _updateClearButton();
        _renderResultats(input.value.trim());
      });
    }

    const clearBtn = document.getElementById("kta-search-clear-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", function() {
        _filterLayers = new Set();
        _filterTags   = new Set();
        _filterKinds  = new Set();
        _renderFiltres();
        _updateClearButton();
        _renderResultats(input.value.trim());
      });
    }

    input.addEventListener("input", function() {
      if (_filtreTimer) clearTimeout(_filtreTimer);
      _filtreTimer = setTimeout(function() {
        _renderResultats(input.value.trim());
      }, 200);
    });

    input.addEventListener("keydown", function(e) {
      const items = resEl.querySelectorAll(".kta-search-result");
      if (items.length === 0) return;

      let active = resEl.querySelector(".kta-search-result.active");
      let idx = active ? Array.from(items).indexOf(active) : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        idx = Math.min(idx + 1, items.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = active || items[0];
        if (target) target.click();
        return;
      } else {
        return;
      }

      if (active) active.classList.remove("active");
      items[idx].classList.add("active");
      items[idx].scrollIntoView({ block: "nearest" });
    });
  }

  // ── Collecte ──────────────────────────────
  // ⚠️ `_pointsCache` ne contient QUE les calques externes ; les points de session sont relus à chaque
  // appel (_collecterPointsEditor), sinon un ajout ou un import de session n'apparaîtrait pas.
  async function _chargerCache() {
    const sig = _signaturePlan();
    if (sig === _planSignature && _pointsCache) return;

    _pointsCache    = [];
    _planSignature  = sig;

    const config = window.PLAN_CONFIG;
    if (!config) throw new Error(window.I18n.t("search.error.noPlan"));

    if (Array.isArray(config.dataLayers)) {
      for (const lc of config.dataLayers) {
        if (lc.id === "editor") continue;       // editor traité séparément à chaque recherche
        try {
          const r = await fetch(lc.file);
          const j = await r.json();
          const pts = Array.isArray(j.data) ? j.data : [];
          pts.forEach(function(p) {
            _pointsCache.push({ point: p, layerId: lc.id, layerLabel: lc.label || lc.id });
          });
        } catch(e) {
          console.warn("[Search] Erreur chargement", lc.file, e);
        }
      }
    }
  }

  function _collecterPointsEditor() {
    const out = [];
    if (!window.getEditorPoints) return out;

    const config = window.PLAN_CONFIG;
    let label = window.I18n.t("search.layer.editor");
    if (config && Array.isArray(config.dataLayers)) {
      const lc = config.dataLayers.find(function(d) { return d.id === "editor"; });
      if (lc && lc.label) label = lc.label;
    }

    const pts = window.getEditorPoints() || [];
    pts.forEach(function(p) {
      out.push({ point: p, layerId: "editor", layerLabel: label });
    });
    return out;
  }

  function _tousLesPoints() {
    const editor = _collecterPointsEditor();
    return (_pointsCache || []).concat(editor);
  }

  // Libellé d'un type, résolu AU RENDU (jamais t() au chargement). Un type renommé dans la légende
  // (session ou plan : getSource() ≠ "default", même garde que la sidebar) prend son nom choisi ;
  // sinon le libellé i18n. Un type `cust-` passe par findCustomEntry.
  function _lcOuI18n(cat, type, cleI18n) {
    const LC = window.LegendCustomization;
    if (LC) {
      try {
        if (typeof LC.getLabel === "function" && typeof LC.getSource === "function"
            && LC.getSource(cat, type) !== "default") {
          const l = LC.getLabel(cat, type);
          if (l) return l;
        }
        if (!cleI18n && typeof LC.findCustomEntry === "function") {
          const e = LC.findCustomEntry(type);
          if (e && e.label) return "✨ " + e.label;
        }
      } catch(e) {}
    }
    return cleI18n ? window.I18n.t(cleI18n) : "";
  }
  function _roadTypeLabel(type) {
    const keys = { principal: "search.roadType.principal", secondaire: "search.roadType.secondaire", chemin: "search.roadType.chemin", jonction: "search.roadType.jonction", itinerary: "search.roadType.itinerary" };
    return _lcOuI18n("traces", type, keys[type] || null);
  }
  function _zoneTypeLabel(type) {
    const keys = { eau: "search.zoneType.eau", remblais: "search.zoneType.remblais", effondrement: "search.zoneType.effondrement", inaccessible: "search.zoneType.inaccessible" };
    return _lcOuI18n("zones", type, keys[type] || null);
  }
  function _structTypeLabel(type) {
    const keys = { "pilier-1": "search.structType.pilier1", "pilier-2": "search.structType.pilier2", "mur": "search.structType.mur", "front-1": "search.structType.front1", "front-2": "search.structType.front2" };
    return _lcOuI18n("structures", type, keys[type] || null);
  }

  // Emoji pour les catégories sans icône de tag.
  const _KIND_EMOJI = { point: "📍", road: "🛣️", zone: "⬛", structure: "🏛️" };

  // Session + embarqués → [{ kind, item, layerId, layerLabel, label, searchableText }], libellé auto si absent.
  function _collecterRoads() {
    const out = [];
    const sessionRoads = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    sessionRoads.forEach(function(r, idx) {
      if (!r) return;
      const lbl = r.label || (_roadTypeLabel(r.type) || r.type || window.I18n.t("search.kind.roadFallback")) + " " + window.I18n.t("search.origin.session") + " #" + (idx + 1);
      out.push({
        kind: "road",
        item: r,
        layerId: "session",
        layerLabel: window.I18n.t("search.layer.session"),
        label: lbl,
        searchableText: [lbl, r.type, _roadTypeLabel(r.type) || "", r.label || "", Number.isInteger(r.level) ? window.I18n.t("search.search.levelText", { n: r.level }) : ""].join(" ")
      });
    });
    const embRoads = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : [];
    embRoads.forEach(function(r, idx) {
      if (!r) return;
      const lbl = r.label || (_roadTypeLabel(r.type) || r.type || window.I18n.t("search.kind.roadFallback")) + " " + window.I18n.t("search.origin.data") + " #" + (idx + 1);
      out.push({
        kind: "road",
        item: r,
        layerId: r._layerId || "data",
        layerLabel: r._layerLabel || window.I18n.t("search.layer.data"),
        label: lbl,
        searchableText: [lbl, r.type, _roadTypeLabel(r.type) || "", r.label || "", Number.isInteger(r.level) ? window.I18n.t("search.search.levelText", { n: r.level }) : ""].join(" ")
      });
    });
    return out;
  }

  function _collecterZones() {
    const out = [];
    const sessionZones = (typeof window.getZones === "function") ? (window.getZones() || []) : [];
    sessionZones.forEach(function(z, idx) {
      if (!z) return;
      const lbl = z.label || window.I18n.t("search.kind.zonePrefix") + " " + (_zoneTypeLabel(z.type) || z.type || "") + " " + window.I18n.t("search.origin.session") + " #" + (idx + 1);
      out.push({
        kind: "zone",
        item: z,
        layerId: "session",
        layerLabel: window.I18n.t("search.layer.session"),
        label: lbl,
        searchableText: [lbl, z.type, _zoneTypeLabel(z.type) || "", z.label || "", Number.isInteger(z.level) ? window.I18n.t("search.search.levelText", { n: z.level }) : ""].join(" ")
      });
    });
    const embZones = (typeof window.getAllEmbeddedZones === "function") ? (window.getAllEmbeddedZones() || []) : [];
    embZones.forEach(function(z, idx) {
      if (!z) return;
      const lbl = z.label || window.I18n.t("search.kind.zonePrefix") + " " + (_zoneTypeLabel(z.type) || z.type || "") + " " + window.I18n.t("search.origin.data") + " #" + (idx + 1);
      out.push({
        kind: "zone",
        item: z,
        layerId: z._layerId || "data",
        layerLabel: z._layerLabel || window.I18n.t("search.layer.data"),
        label: lbl,
        searchableText: [lbl, z.type, _zoneTypeLabel(z.type) || "", z.label || "", Number.isInteger(z.level) ? window.I18n.t("search.search.levelText", { n: z.level }) : ""].join(" ")
      });
    });
    return out;
  }

  function _collecterStructures() {
    const out = [];
    const sessionStructs = (typeof window.getStructures === "function") ? (window.getStructures() || []) : [];
    sessionStructs.forEach(function(s, idx) {
      if (!s) return;
      const lbl = s.label || (_structTypeLabel(s.type) || s.type || window.I18n.t("search.kind.structFallback")) + " " + window.I18n.t("search.origin.session") + " #" + (idx + 1);
      out.push({
        kind: "structure",
        item: s,
        layerId: "session",
        layerLabel: window.I18n.t("search.layer.session"),
        label: lbl,
        searchableText: [lbl, s.type, _structTypeLabel(s.type) || "", s.label || "", Number.isInteger(s.level) ? window.I18n.t("search.search.levelText", { n: s.level }) : ""].join(" ")
      });
    });
    const embStructs = (typeof window.getAllEmbeddedStructures === "function") ? (window.getAllEmbeddedStructures() || []) : [];
    embStructs.forEach(function(s, idx) {
      if (!s) return;
      const lbl = s.label || (_structTypeLabel(s.type) || s.type || window.I18n.t("search.kind.structFallback")) + " " + window.I18n.t("search.origin.data") + " #" + (idx + 1);
      out.push({
        kind: "structure",
        item: s,
        layerId: s._layerId || "data",
        layerLabel: s._layerLabel || window.I18n.t("search.layer.data"),
        label: lbl,
        searchableText: [lbl, s.type, _structTypeLabel(s.type) || "", s.label || "", Number.isInteger(s.level) ? window.I18n.t("search.search.levelText", { n: s.level }) : ""].join(" ")
      });
    });
    return out;
  }

  // Toutes catégories, format unifié : modale seulement, JAMAIS exposé (SearchPoints reste point-only).
  function _tousLesItems() {
    const items = [];
    _tousLesPoints().forEach(function(it) {
      const p = it.point;
      const lbl = p.nom || p.id || window.I18n.t("search.point.noName");
      items.push({
        kind: "point",
        item: p,
        layerId: it.layerId,
        layerLabel: it.layerLabel,
        label: lbl,
        searchableText: [
          lbl, p.id || "", p.nom || "",
          Array.isArray(p.tags) ? p.tags.join(" ") : "",
          p.description || "", p.etat || ""
        ].join(" "),
        // _ouvrirPopupEtFlash attend item.point.
        point: p
      });
    });
    Array.prototype.push.apply(items, _collecterRoads());
    Array.prototype.push.apply(items, _collecterZones());
    Array.prototype.push.apply(items, _collecterStructures());
    return items;
  }

  function _normalize(s) {
    if (s === null || s === undefined) return "";
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function _renderFiltres() {
    const el = document.getElementById("kta-search-filters");
    if (!el) return;

    const layers = _availableLayers();
    const tags   = _availableTags();

    let html = "";

    // Chips de catégorie d'abord (elles restructurent le plus la liste), avec compteurs.
    const allItems  = _tousLesItems();
    const kindCount = { point: 0, road: 0, zone: 0, structure: 0 };
    allItems.forEach(function(it) { kindCount[it.kind] = (kindCount[it.kind] || 0) + 1; });
    const KIND_DEFS = [
      { id: "point",     label: window.I18n.t("search.kind.point")     },
      { id: "road",      label: window.I18n.t("search.kind.road")      },
      { id: "zone",      label: window.I18n.t("search.kind.zone")      },
      { id: "structure", label: window.I18n.t("search.kind.structure") }
    ];
    const kindsAvecContenu = KIND_DEFS.filter(function(k) { return kindCount[k.id] > 0; });
    if (kindsAvecContenu.length >= 2) {  // pas la peine d'afficher s'il n'y a qu'une catégorie
      html += '<div class="kta-search-filters-row">';
      html += '<span class="kta-search-filters-label">' + _escapeHtml(window.I18n.t("search.filters.category")) + '</span>';
      html += '<div class="kta-search-filters-chips">';
      kindsAvecContenu.forEach(function(k) {
        const active = _filterKinds.has(k.id);
        html += '<button type="button" class="kta-search-chip' + (active ? " active" : "") + '"'
              + ' data-filter-type="kind" data-filter-value="' + _escapeAttr(k.id) + '">'
              + _escapeHtml(k.label) + ' (' + kindCount[k.id] + ')</button>';
      });
      html += '</div></div>';
    }

    if (layers.length > 0) {
      html += '<div class="kta-search-filters-row">';
      html += '<span class="kta-search-filters-label">' + _escapeHtml(window.I18n.t("search.filters.layers")) + '</span>';
      html += '<div class="kta-search-filters-chips">';
      layers.forEach(function(l) {
        const active = _filterLayers.has(l.id);
        html += '<button type="button" class="kta-search-chip' + (active ? " active" : "") + '"'
              + ' data-filter-type="layer" data-filter-value="' + _escapeAttr(l.id) + '">'
              + _escapeHtml(l.label) + '</button>';
      });
      html += '</div></div>';
    }

    if (tags.length > 0) {
      html += '<div class="kta-search-filters-row">';
      html += '<span class="kta-search-filters-label">' + _escapeHtml(window.I18n.t("search.filters.tags")) + '</span>';
      html += '<div class="kta-search-filters-chips">';
      tags.forEach(function(t) {
        const active = _filterTags.has(t);
        html += '<button type="button" class="kta-search-chip' + (active ? " active" : "") + '"'
              + ' data-filter-type="tag" data-filter-value="' + _escapeAttr(t) + '">'
              + _escapeHtml(t) + '</button>';
      });
      html += '</div></div>';
    }

    el.innerHTML = html;
  }

  function _updateClearButton() {
    const btn = document.getElementById("kta-search-clear-filters");
    if (!btn) return;
    const hasFilters = (_filterLayers.size > 0 || _filterTags.size > 0 || _filterKinds.size > 0);
    btn.style.display = hasFilters ? "inline-block" : "none";
  }

  // ── Recherche et rendu ──────────────────────────────
  // Filtres d'abord, puis score : points sur nom, id, tags, description, état ; autres sur libellé,
  // type et niveau. Tri par score décroissant puis libellé ; le groupage se fait au rendu.
  function _filtrer(query) {
    const tousItems = _tousLesItems().filter(_matchesFiltersUnified);
    if (!query) return tousItems.slice();

    const q = _normalize(query);
    const matches = [];

    for (const it of tousItems) {
      let score = 0;

      if (it.kind === "point") {
        const p    = it.item;
        const nom  = _normalize(p.nom || "");
        const id   = _normalize(p.id || "");
        const desc = _normalize(p.description || "");
        const etat = _normalize(p.etat || "");
        const tags = (Array.isArray(p.tags) ? p.tags.map(_normalize).join(" ") : "");
        if      (nom === q)              score = 100;
        else if (nom.startsWith(q))      score = 80;
        else if (nom.includes(q))        score = 60;
        else if (id === q)               score = 50;
        else if (id.startsWith(q))       score = 40;
        else if (id.includes(q))         score = 30;
        else if (tags.includes(q))       score = 20;
        else if (desc.includes(q) || etat.includes(q)) score = 10;
      } else {
        const text = _normalize(it.searchableText || "");
        const lbl  = _normalize(it.label || "");
        if      (lbl === q)         score = 100;
        else if (lbl.startsWith(q)) score = 80;
        else if (lbl.includes(q))   score = 60;
        else if (text.includes(q))  score = 30;
      }

      if (score > 0) matches.push({ item: it, score: score });
    }

    matches.sort(function(a, b) {
      if (a.score !== b.score) return b.score - a.score;
      return _normalize(a.item.label).localeCompare(_normalize(b.item.label));
    });

    return matches.map(function(m) { return m.item; });
  }

  // Groupé par catégorie avec compteurs ; 50 résultats au plus, toutes catégories confondues.
  function _renderResultats(query) {
    const resEl  = document.getElementById("kta-search-results");
    const infoEl = document.getElementById("kta-search-info");
    if (!resEl) return;

    // Saisie au format strict « lat, lng » (plages valides, window.parseGpsCoords) → rendu GPS.
    if (typeof window.parseGpsCoords === "function") {
      const gpsCoords = window.parseGpsCoords(query);
      if (gpsCoords) {
        _renderResultatsGps(query, gpsCoords);
        return;
      }
    }

    const filtered = _filtrer(query);
    const LIMITE = 50;
    const visibles = filtered.slice(0, LIMITE);
    const surplus  = filtered.length - visibles.length;

    if (query) {
      infoEl.textContent = filtered.length === 0
        ? window.I18n.t("search.info.noResult")
        : window.I18n.t("search.info.results", { count: filtered.length });
    } else {
      const total = _tousLesItems().length;
      const filtersActive = (_filterLayers.size > 0 || _filterTags.size > 0 || _filterKinds.size > 0);
      if (filtersActive) {
        infoEl.textContent = window.I18n.t("search.info.filtered", { count: filtered.length, total: total });
      } else {
        infoEl.textContent = window.I18n.t("search.info.available", { count: total });
      }
    }

    if (filtered.length === 0) {
      const filtersActive = (_filterLayers.size > 0 || _filterTags.size > 0 || _filterKinds.size > 0);
      let msg;
      if (query) {
        msg = window.I18n.t("search.empty.noMatch", { query: '<strong>' + _escapeHtml(query) + '</strong>' });
      } else if (filtersActive) {
        msg = window.I18n.t("search.empty.noFilterMatch");
      } else {
        msg = window.I18n.t("search.empty.prompt");
      }
      resEl.innerHTML = `
        <div class="kta-search-empty">
          <div class="empty-icon">🔍</div>
          ${msg}
        </div>
      `;
      return;
    }

    const groups = { point: [], road: [], zone: [], structure: [] };
    visibles.forEach(function(it) {
      if (groups[it.kind]) groups[it.kind].push(it);
    });
    const KIND_HEADERS = {
      point:     window.I18n.t("search.kind.point"),
      road:      window.I18n.t("search.kind.road"),
      zone:      window.I18n.t("search.kind.zone"),
      structure: window.I18n.t("search.kind.structure")
    };
    const KIND_ORDER = ["point", "road", "zone", "structure"];

    _visibles = visibles;  // mémoriser pour les listeners (les clics se fient à l'index local)

    let html = "";
    let visIdx = 0;
    let firstResultMarked = false;

    KIND_ORDER.forEach(function(kind) {
      const items = groups[kind];
      if (!items || items.length === 0) return;
      html += '<div class="kta-search-group-header" style="padding:8px 6px 4px; font-size:11px; color:var(--kta-interaction); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; border-top:1px solid rgba(255,255,255,0.04); margin-top:4px;">';
      html += _escapeHtml(KIND_HEADERS[kind]) + ' <span style="color:var(--kta-texte-3); font-weight:400;">(' + items.length + ')</span>';
      html += '</div>';
      items.forEach(function(it) {
        const isFirst = !firstResultMarked && query;
        firstResultMarked = true;
        html += _renderResultRow(it, visIdx, isFirst);
        visIdx++;
      });
    });

    if (surplus > 0) {
      html += '<div class="kta-search-more">' + _escapeHtml(window.I18n.t("search.results.more", { count: surplus })) + '</div>';
    }

    resEl.innerHTML = html;

    resEl.querySelectorAll(".kta-search-result").forEach(function(el) {
      el.addEventListener("click", function() {
        const idx = parseInt(el.dataset.visibleIdx);
        const it = _visibles[idx];
        if (it) _aller(it);
      });
    });
    // 📌 Assigner : stopPropagation (pas de déplacement de carte). La Recherche se ferme AVANT
    // d'ouvrir Assigner, sinon Échap dans Assigner la laisse orpheline à l'écran.
    resEl.querySelectorAll(".kta-search-result-assign").forEach(function(btn) {
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        e.preventDefault();
        const idx = parseInt(btn.dataset.visibleIdx);
        const it = _visibles[idx];
        if (!it || it.kind !== "point") return;
        if (window.SecoursMode && typeof window.SecoursMode.ouvrirAssignerModale === "function") {
          // Point et libellé lus AVANT la fermeture, qui peut vider _visibles.
          const point = it.item;
          const layerLabel = it.layerLabel || it.layerId || null;
          if (_modal) { _modal.remove(); _modal = null; }
          window.SecoursMode.ouvrirAssignerModale(point, layerLabel);
        }
      });
    });
  }

  function _renderResultRow(it, visIdx, isFirst) {
    const activeClass = isFirst ? " active" : "";
    let html = '<div class="kta-search-result' + activeClass + '" data-visible-idx="' + visIdx + '">';

    html += '<div class="kta-search-icon">';
    if (it.kind === "point") {
      const iconUrl = _getIconUrl(it.item);
      if (iconUrl) html += '<img src="' + _escapeAttr(iconUrl) + '" alt="">';
      else         html += '<span style="font-size:18px; opacity:0.4;">📍</span>';
    } else {
      html += '<span style="font-size:22px;">' + _escapeHtml(_KIND_EMOJI[it.kind] || "?") + '</span>';
    }
    html += '</div>';

    html += '<div class="kta-search-content">';

    if (it.kind === "point") {
      const p = it.item;
      html += '<div class="kta-search-name">';
      if (p.id) html += '<span class="kta-search-id">' + _escapeHtml(p.id) + '</span>';
      html += _escapeHtml(p.nom || window.I18n.t("search.row.unnamed"));
      html += '</div>';
    } else {
      html += '<div class="kta-search-name">' + _escapeHtml(it.label) + '</div>';
    }

    html += '<div class="kta-search-meta">';
    html += '<span class="layer-tag">' + _escapeHtml(it.layerLabel) + '</span>';
    if (it.kind === "point") {
      const p = it.item;
      const tags = Array.isArray(p.tags) ? p.tags : [];
      tags.slice(0, 4).forEach(function(t) {
        html += '<span class="tag-chip">' + _escapeHtml(t) + '</span>';
      });
      if (tags.length > 4) html += '<span class="tag-chip">+' + (tags.length - 4) + '</span>';
      if (typeof p.x === "number" && typeof p.y === "number") {
        html += ' <span class="kta-search-coords">x:' + p.x + ' y:' + p.y + '</span>';
      }
    } else {
      const r = it.item;
      const typeLabel = (it.kind === "road"      ? (_roadTypeLabel(r.type)   || r.type)
                        : it.kind === "zone"     ? (_zoneTypeLabel(r.type)   || r.type)
                        : it.kind === "structure"? (_structTypeLabel(r.type) || r.type)
                        : (r.type || ""));
      if (typeLabel) html += '<span class="tag-chip">' + _escapeHtml(typeLabel) + '</span>';
      if (Number.isInteger(r.level)) {
        html += '<span class="tag-chip">' + _escapeHtml(window.I18n.t("search.row.level", { n: r.level })) + '</span>';
      } else if (r.type === "jonction" && (Number.isInteger(r.fromLevel) || Number.isInteger(r.toLevel))) {
        html += '<span class="tag-chip">' + _escapeHtml(window.I18n.t("search.row.levelRange", { from: (r.fromLevel != null ? r.fromLevel : "?"), to: (r.toLevel != null ? r.toLevel : "?") })) + '</span>';
      }
      if (Array.isArray(r.points)) {
        html += ' <span class="kta-search-coords">' + _escapeHtml(window.I18n.t("search.row.pointCount", { count: r.points.length })) + '</span>';
      }
    }
    html += '</div>';

    html += '</div>';  // end content

    // 📌 Assigner à une équipe : POINT seulement, et Mode Secours ouvert avec un scénario actif.
    if (it.kind === "point" && window.SecoursMode
        && typeof window.SecoursMode.isOpen === "function" && window.SecoursMode.isOpen()
        && typeof window.SecoursMode.getCurrentScenarioId === "function"
        && window.SecoursMode.getCurrentScenarioId()) {
      html += '<button class="kta-search-result-assign" data-visible-idx="' + visIdx +
              '" title="' + _escapeAttr(window.I18n.t("search.row.assignTitle")) + '">📌</button>';
    }

    html += '</div>';  // end result
    return html;
  }

  // Icône : plan-config.icons[tag] → _iconMap[tag] → défaut.
  function _getIconUrl(p) {
    if (typeof window.getIconUrlForPoint === "function") {
      return window.getIconUrlForPoint(p);
    }
    // Repli si utils.js n'est pas chargé.
    const config = window.PLAN_CONFIG;
    if (!config || !config.icons) return null;
    if (Array.isArray(p.tags)) {
      for (const t of p.tags) {
        if (config.icons[t]) return config.icons[t];
      }
    }
    return config.icons.default || null;
  }

  // ── Recherche par coordonnées GPS ──────────────────────────────
  // « lat, lng » collé depuis une carte → plan (KmzExport.buildTransform + gpsToPlan). Quatre issues :
  // plan non géoréférencé (lien Paramètres), hors plan, POI à ≤ 50 px (fiche), sinon « Créer un point ici ».

  const _GPS_RADIUS_PX = 50;

  function _renderResultatsGps(query, gps) {
    const resEl  = document.getElementById("kta-search-results");
    const infoEl = document.getElementById("kta-search-info");
    if (!resEl) return;

    infoEl.textContent = window.I18n.t("search.gps.info", { lat: gps.lat.toFixed(6), lng: gps.lng.toFixed(6) });

    const planId = window._currentLoadedPlanId || "";
    if (!window.KmzExport || typeof window.KmzExport.getCalibration !== "function") {
      _renderGpsCardNoCalib(resEl, gps);
      return;
    }
    const calib = window.KmzExport.getCalibration(planId);
    if (!calib || !calib.pointA || !calib.pointB ||
        typeof calib.pointA.x   !== "number" || typeof calib.pointA.y   !== "number" ||
        typeof calib.pointA.lat !== "number" || typeof calib.pointA.lng !== "number" ||
        typeof calib.pointB.x   !== "number" || typeof calib.pointB.y   !== "number" ||
        typeof calib.pointB.lat !== "number" || typeof calib.pointB.lng !== "number") {
      _renderGpsCardNoCalib(resEl, gps);
      return;
    }

    // Transformation reconstruite à la demande.
    let transform, planCoords;
    try {
      transform = window.KmzExport.buildTransformCalib(calib);   // pointC optionnel propagé (affine)
      planCoords = window.KmzExport.gpsToPlan(transform, gps.lat, gps.lng);
    } catch (e) {
      _renderGpsCardErreur(resEl, gps, window.I18n.t("search.gps.errInvalidCalib", { msg: (e && e.message) || "" }));
      return;
    }
    if (!planCoords || typeof planCoords.x !== "number" || typeof planCoords.y !== "number") {
      _renderGpsCardErreur(resEl, gps, window.I18n.t("search.gps.errConvertFailed"));
      return;
    }

    const pc = window.PLAN_CONFIG;
    const imgW = (pc && pc.plan && pc.plan.imageWidth)  || 0;
    const imgH = (pc && pc.plan && pc.plan.imageHeight) || 0;
    if (planCoords.x < 0 || planCoords.x > imgW || planCoords.y < 0 || planCoords.y > imgH) {
      _renderGpsCardHorsPlan(resEl, gps, planCoords, imgW, imgH);
      return;
    }

    const pointsItems = _tousLesItems().filter(function(it) { return it.kind === "point"; });
    let closest = null;
    let minDist = Infinity;
    pointsItems.forEach(function(it) {
      const p = it.item;
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
      const dx = p.x - planCoords.x;
      const dy = p.y - planCoords.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) {
        minDist = d;
        closest = it;
      }
    });

    if (closest && minDist <= _GPS_RADIUS_PX) {
      _renderGpsCardPoiProche(resEl, gps, planCoords, closest, minDist);
    } else {
      _renderGpsCardSansPoi(resEl, gps, planCoords);
    }
  }

  function _renderGpsCardNoCalib(resEl, gps) {
    resEl.innerHTML =
      '<div class="kta-search-gps-card kta-search-gps-card-warn">' +
        '<div class="kta-search-gps-card-icon">🌐</div>' +
        '<div class="kta-search-gps-card-content">' +
          '<div class="kta-search-gps-card-titre">' + _escapeHtml(window.I18n.t("search.gps.noCalib.titre")) + '</div>' +
          '<div class="kta-search-gps-card-subtitle">' + gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6) + '</div>' +
          '<div class="kta-search-gps-card-msg">' +
            window.I18n.t("search.gps.noCalib.msg") +
          '</div>' +
          '<div class="kta-search-gps-card-action">' +
            '<button class="kta-btn kta-btn-secondary kta-btn-sm" id="kta-search-gps-go-config">' +
              _escapeHtml(window.I18n.t("search.gps.noCalib.btn")) +
            '</button>' +
            '<span class="kta-search-gps-card-hint">' + _escapeHtml(window.I18n.t("search.gps.noCalib.hint")) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    const cfgBtn = resEl.querySelector("#kta-search-gps-go-config");
    if (cfgBtn) {
      cfgBtn.addEventListener("click", function() {
        if (_modal) _modal.remove();
        if (typeof window.afficherConfig === "function") {
          window.afficherConfig();
        } else if (window.OOMGuard) {
          window.OOMGuard.showToast(window.I18n.t("search.gps.noCalib.toast"), "info");
        }
      });
    }
  }

  function _renderGpsCardErreur(resEl, gps, msg) {
    resEl.innerHTML =
      '<div class="kta-search-gps-card kta-search-gps-card-error">' +
        '<div class="kta-search-gps-card-icon">⚠️</div>' +
        '<div class="kta-search-gps-card-content">' +
          '<div class="kta-search-gps-card-titre">' + _escapeHtml(window.I18n.t("search.gps.err.titre")) + '</div>' +
          '<div class="kta-search-gps-card-subtitle">' + gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6) + '</div>' +
          '<div class="kta-search-gps-card-msg">' + _escapeHtml(msg || window.I18n.t("search.gps.err.unknown")) + '</div>' +
        '</div>' +
      '</div>';
  }

  function _renderGpsCardHorsPlan(resEl, gps, planCoords, imgW, imgH) {
    resEl.innerHTML =
      '<div class="kta-search-gps-card kta-search-gps-card-error">' +
        '<div class="kta-search-gps-card-icon">🚫</div>' +
        '<div class="kta-search-gps-card-content">' +
          '<div class="kta-search-gps-card-titre">' + _escapeHtml(window.I18n.t("search.gps.outOfPlan.titre")) + '</div>' +
          '<div class="kta-search-gps-card-subtitle">' + gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6) + '</div>' +
          '<div class="kta-search-gps-card-msg">' +
            window.I18n.t("search.gps.outOfPlan.msg", { x: Math.round(planCoords.x), y: Math.round(planCoords.y), w: imgW, h: imgH }) +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function _renderGpsCardPoiProche(resEl, gps, planCoords, item, distPx) {
    const p = item.item;
    const nom = p.nom || p.id || window.I18n.t("search.gps.poi.defaultName");
    const tags = (p.tags && p.tags.length) ? p.tags.join(", ") : "";
    resEl.innerHTML =
      '<div class="kta-search-gps-card kta-search-gps-card-ok">' +
        '<div class="kta-search-gps-card-icon">📍</div>' +
        '<div class="kta-search-gps-card-content">' +
          '<div class="kta-search-gps-card-titre">' + _escapeHtml(window.I18n.t("search.gps.poi.titre")) + '</div>' +
          '<div class="kta-search-gps-card-subtitle">' + gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6) +
            ' ' + window.I18n.t("search.gps.toPlan", { x: Math.round(planCoords.x), y: Math.round(planCoords.y) }) +
          '</div>' +
          '<div class="kta-search-gps-poi-info">' +
            '<strong>' + _escapeHtml(nom) + '</strong>' +
            (tags ? '<span class="kta-search-gps-poi-tags"> · ' + _escapeHtml(tags) + '</span>' : '') +
            '<div class="kta-search-gps-poi-dist">' + _escapeHtml(window.I18n.t("search.gps.poi.dist", { dist: Math.round(distPx) })) + '</div>' +
          '</div>' +
          '<div class="kta-search-gps-card-action">' +
            '<button class="kta-btn kta-btn-primary kta-btn-sm" id="kta-search-gps-go-poi">' +
              _escapeHtml(window.I18n.t("search.gps.poi.goBtn")) +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    const goBtn = resEl.querySelector("#kta-search-gps-go-poi");
    if (goBtn) {
      goBtn.addEventListener("click", function() { _aller(item); });
    }
  }

  function _renderGpsCardSansPoi(resEl, gps, planCoords) {
    resEl.innerHTML =
      '<div class="kta-search-gps-card kta-search-gps-card-create">' +
        '<div class="kta-search-gps-card-icon">📍</div>' +
        '<div class="kta-search-gps-card-content">' +
          '<div class="kta-search-gps-card-titre">' + _escapeHtml(window.I18n.t("search.gps.noPoi.titre")) + '</div>' +
          '<div class="kta-search-gps-card-subtitle">' + gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6) +
            ' ' + window.I18n.t("search.gps.toPlan", { x: Math.round(planCoords.x), y: Math.round(planCoords.y) }) +
          '</div>' +
          '<div class="kta-search-gps-card-msg">' +
            window.I18n.t("search.gps.noPoi.msg", { radius: _GPS_RADIUS_PX }) +
          '</div>' +
          '<div class="kta-search-gps-card-action">' +
            '<button class="kta-btn kta-btn-primary kta-btn-sm" id="kta-search-gps-create-point">' +
              _escapeHtml(window.I18n.t("search.gps.noPoi.createBtn")) +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    const createBtn = resEl.querySelector("#kta-search-gps-create-point");
    if (createBtn) {
      createBtn.addEventListener("click", function() {
        if (_modal) _modal.remove();
        if (window.map && window.APP_CONFIG) {
          const latlng = [window.APP_CONFIG.imageHeight - planCoords.y, planCoords.x];
          try {
            window.map.setView(latlng, Math.max(0, window.map.getZoom()), { animate: true });
          } catch (e) {}
        }
        if (typeof window.afficherFormulaire === "function") {
          window.afficherFormulaire(planCoords.x, planCoords.y);
        } else if (window.OOMGuard) {
          window.OOMGuard.showToast(window.I18n.t("search.gps.noPoi.editorUnavailable"), "error");
        }
      });
    }
  }

  // ── Aller au résultat ──────────────────────────────
  // Point : popup du marqueur ; tracé, zone, structure : centroïde + surbrillance (_allerVersAnnotation).
  function _aller(item) {
    if (!window.map || !window.APP_CONFIG) return;

    if (_modal) _modal.remove();
    _modal = null;
    if (_filtreTimer) { clearTimeout(_filtreTimer); _filtreTimer = null; }

    if (item.kind === "point") {
      _allerVersPoint(item);
    } else {
      _allerVersAnnotation(item);
    }
  }

  function _allerVersPoint(item) {
    const p = item.item || item.point;  // compat ancien format (point) + nouveau (item)
    if (typeof p.x !== "number" || typeof p.y !== "number") {
      window.ktaAlerte(window.I18n.t("search.go.pointNoCoords"));
      return;
    }
    const latlng = convertCoord(p.x, p.y);
    window.map.setView(latlng, window.map.getZoom(), { animate: false });
    window.map.invalidateSize();
    const compatItem = { point: p, layerId: item.layerId, layerLabel: item.layerLabel };
    _ouvrirPopupEtFlash(compatItem, latlng);
  }

  function _allerVersAnnotation(item) {
    const ann = item.item;
    if (!ann || !Array.isArray(ann.points) || ann.points.length === 0) {
      window.ktaAlerte(window.I18n.t("search.go.annotationNoPoints"));
      return;
    }

    // Centroïde = moyenne des sommets.
    let sumX = 0, sumY = 0;
    ann.points.forEach(function(pt) { sumX += pt.x; sumY += pt.y; });
    const cx = sumX / ann.points.length;
    const cy = sumY / ann.points.length;
    const center = convertCoord(cx, cy);
    window.map.setView(center, window.map.getZoom(), { animate: false });
    window.map.invalidateSize();

    if (_flashLayer) {
      try { window.map.removeLayer(_flashLayer); } catch(e) {}
      _flashLayer = null;
    }

    const latlngs = ann.points.map(function(pt) { return convertCoord(pt.x, pt.y); });

    const isPolyline = (item.kind === "road" || (item.kind === "structure" && (ann.type === "front-1" || ann.type === "front-2")));
    if (isPolyline) {
      _flashLayer = L.polyline(latlngs, {
        color: "#ffaa00",
        weight: 10,
        opacity: 0.85,
        dashArray: "8 6",
        interactive: false,
        pane: "overlayPane"
      }).addTo(window.map);
    } else {
      _flashLayer = L.polygon(latlngs, {
        color: "#ffaa00",
        weight: 4,
        opacity: 0.9,
        fillColor: "#ffcc44",
        fillOpacity: 0.30,
        interactive: false,
        pane: "overlayPane"
      }).addTo(window.map);
    }

    let popupHtml = "<b>" + _escapeHtml(item.label) + "</b>";
    const typeLabel = (item.kind === "road"      ? (_roadTypeLabel(ann.type)   || ann.type)
                      : item.kind === "zone"     ? (_zoneTypeLabel(ann.type)   || ann.type)
                      : item.kind === "structure"? (_structTypeLabel(ann.type) || ann.type)
                      : ann.type);
    if (typeLabel) popupHtml += "<br>" + _escapeHtml(window.I18n.t("search.popup.type", { type: typeLabel }));
    if (Number.isInteger(ann.level)) popupHtml += "<br>" + _escapeHtml(window.I18n.t("search.popup.level", { n: ann.level }));
    if (ann.type === "jonction" && Number.isInteger(ann.fromLevel) && Number.isInteger(ann.toLevel)) {
      popupHtml += "<br>" + _escapeHtml(window.I18n.t("search.popup.junction", { from: ann.fromLevel, to: ann.toLevel }));
    }
    if (Array.isArray(ann.points)) popupHtml += '<br><small style="opacity:0.6;">' + _escapeHtml(window.I18n.t("search.popup.pointsLayer", { count: ann.points.length, layer: item.layerLabel })) + "</small>";

    L.popup({ autoClose: true, closeOnClick: true })
      .setLatLng(center)
      .setContent(popupHtml)
      .openOn(window.map);

    setTimeout(function() {
      if (_flashLayer) {
        try { window.map.removeLayer(_flashLayer); } catch(e) {}
        _flashLayer = null;
      }
    }, 4000);
  }

  function _ouvrirPopupEtFlash(item, latlng) {
    const p = item.point;

    if (_flashLayer) {
      try { window.map.removeLayer(_flashLayer); } catch(e) {}
      _flashLayer = null;
    }

    // Marqueur existant retrouvé par x/y plan EXACTS (pas par latlng dérivé).
    const targetLayer = window.dataLayerGroups && window.dataLayerGroups[item.layerId];
    let foundMarker = null;
    if (targetLayer && targetLayer.eachLayer) {
      targetLayer.eachLayer(function(m) {
        if (foundMarker) return;
        if (m.getLatLng) {
          const ll = m.getLatLng();
          const mx = ll.lng;
          const my = APP_CONFIG.imageHeight - ll.lat;
          if (Math.abs(mx - p.x) < 0.5 && Math.abs(my - p.y) < 0.5) {
            foundMarker = m;
          }
        }
      });
    }

    if (foundMarker && foundMarker.openPopup) {
      foundMarker.openPopup();
    } else {
      // Pas de marqueur (calque masqué) : popup temporaire.
      L.popup({ autoClose: true, closeOnClick: true })
        .setLatLng(latlng)
        .setContent(
          "<b>" + _escapeHtml(p.nom || p.id || "?") + "</b>" +
          (p.description ? "<br>" + _escapeHtml(p.description) : "") +
          '<br><small style="opacity:0.6;">' + _escapeHtml(item.layerLabel) +
          (Array.isArray(p.tags) && p.tags.length ? " — " + _escapeHtml(p.tags.join(", ")) : "") +
          '</small>'
        )
        .openOn(window.map);
    }

    _flashLayer = L.circleMarker(latlng, {
      radius: 24,
      color: "#ffaa00",
      fillColor: "#ffcc44",
      fillOpacity: 0,
      weight: 3,
      opacity: 0.9,
      interactive: false
    }).addTo(window.map);

    setTimeout(function() {
      if (_flashLayer) {
        try { window.map.removeLayer(_flashLayer); } catch(e) {}
        _flashLayer = null;
      }
    }, 3000);
  }

  function _escapeHtml(s) { return window.ktaEsc(s); }
  function _escapeAttr(s) { return window.ktaEsc(s); }


})();
