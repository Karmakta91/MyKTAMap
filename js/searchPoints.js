// =========================
// SEARCH POINTS — Recherche rapide d'un point
// =========================
// Permet à l'utilisateur de chercher un point par son nom, id, tag,
// description ou état dans tous les calques de données + la session.
//
// Workflow :
//   1. Modale ouverte par window.ouvrirRecherche()
//   2. Champ de recherche live debounced 200ms
//   3. Liste de résultats avec icône + métadonnées
//   4. Clic sur un résultat → carte centrée + popup + flash visuel
// =========================

(function() {
  "use strict";

  // ========== ÉTAT ==========
  let _modal       = null;
  let _pointsCache = null;          // [{point, layerId, layerLabel}] — UNIQUEMENT data layers externes (cache)
  let _planSignature = null;        // pour invalider le cache au changement de plan
  let _filtreTimer = null;
  let _visibles    = [];            // liste actuellement affichée (référence pour les clics)
  let _flashLayer  = null;          // pour l'animation visuelle

  // Filtres actifs (réinitialisés à chaque ouverture de modale)
  let _filterLayers = new Set();    // Set<layerId> — vide = tous les calques
  let _filterTags   = new Set();    // Set<tag>     — vide = tous les tags

  // ========== STYLES INJECTÉS ==========
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
        color: #e8eaf0;
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
        font-size: 12px; color: #8892a4;
      }
      .kta-search-info-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px;
        padding: 8px 0;
      }
      .kta-search-clear-filters {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.10);
        color: #c8d0e0;
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
        color: #8cb4ff;
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
        color: #c0c8d8;
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
        color: #e8eaf0;
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
        font-size: 14px; font-weight: 600; color: #e8eaf0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .kta-search-name .kta-search-id {
        color: #8cb4ff; font-weight: 500; margin-right: 6px;
      }
      .kta-search-meta {
        font-size: 12px; color: #8892a4;
        margin-top: 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .kta-search-meta .layer-tag {
        display: inline-block;
        padding: 1px 6px;
        background: rgba(140,180,255,0.12);
        border: 1px solid rgba(140,180,255,0.25);
        border-radius: 8px;
        color: #c0c8d8;
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
        color: #c0c8d8;
      }
      .kta-search-coords {
        font-size: 11px; color: #6a7488;
        font-family: 'Courier New', monospace;
      }

      .kta-search-empty {
        text-align: center;
        padding: 40px 20px;
        color: #8892a4;
        font-size: 13px;
      }
      .kta-search-empty .empty-icon {
        font-size: 36px; opacity: 0.5;
        margin-bottom: 10px;
      }

      .kta-search-more {
        text-align: center;
        padding: 10px;
        color: #8892a4;
        font-size: 12px;
        font-style: italic;
      }
    `;
    document.head.appendChild(s);
  }

  // ========== ENTRÉE PUBLIQUE ==========
  window.ouvrirRecherche = function() {
    _injecterStyles();
    if (_modal) { _modal.remove(); _modal = null; }
    // Réinitialise les filtres à chaque ouverture (état "propre")
    _filterLayers = new Set();
    _filterTags   = new Set();
    _afficherModal();
  };

  // ========== FILTRES — DONNÉES DISPO ==========
  // Calques présents dans les points (data + editor)
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

  // Tags uniques rencontrés dans tous les points (triés alphabétique)
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

  // Test si un point passe les filtres actifs
  // Logique : AND entre catégories, OR à l'intérieur d'une catégorie
  function _matchesFilters(it) {
    if (_filterLayers.size > 0 && !_filterLayers.has(it.layerId)) return false;
    if (_filterTags.size > 0) {
      const tags = Array.isArray(it.point.tags) ? it.point.tags : [];
      const hasMatch = tags.some(function(t) { return _filterTags.has(t); });
      if (!hasMatch) return false;
    }
    return true;
  }

  // ========== INVALIDATION CACHE ==========
  function _signaturePlan() {
    const c = window.PLAN_CONFIG;
    if (!c) return null;
    return (c.plan?.name || "") + "|" + (c.plan?.version || "") + "|" + (c.plan?.baseImage || "");
  }

  // ========== AFFICHAGE MODALE ==========
  function _afficherModal() {
    const modal = document.createElement("div");
    modal.id = "kta-search-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML = `
      <div class="kta-readme-modal-boite">
        <div class="kta-readme-modal-header">
          <span class="kta-readme-modal-titre">🔍 Rechercher un point</span>
          <button class="kta-panneau-close" id="kta-search-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps">

          <div class="kta-search-input-wrap">
            <input type="text" id="kta-search-input"
              placeholder="🔍 Tape un nom, un id, un tag, une description..."
              autocomplete="off">
          </div>

          <div class="kta-search-filters" id="kta-search-filters"></div>

          <div class="kta-search-info-row">
            <div class="kta-search-info" id="kta-search-info">Chargement des points…</div>
            <button class="kta-search-clear-filters" id="kta-search-clear-filters" type="button" style="display:none;">✕ Effacer les filtres</button>
          </div>

          <div class="kta-search-results" id="kta-search-results"></div>

        </div>
      </div>
    `;
    document.documentElement.appendChild(modal);
    _modal = modal;

    const input    = document.getElementById("kta-search-input");
    const infoEl   = document.getElementById("kta-search-info");
    const resEl    = document.getElementById("kta-search-results");
    const btnClose = document.getElementById("kta-search-close");

    function fermer() {
      if (_modal) _modal.remove();
      _modal = null;
      if (_filtreTimer) { clearTimeout(_filtreTimer); _filtreTimer = null; }
    }
    btnClose.addEventListener("click", fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape" && _modal) {
        fermer();
        document.removeEventListener("keydown", onEsc);
      }
    });

    // Charger le cache au besoin
    _chargerCache().then(function() {
      infoEl.textContent = _tousLesPoints().length + " point(s) disponible(s)";
      _renderFiltres();           // chips calques + tags
      _renderResultats("");
      input.focus();
    }).catch(function(err) {
      infoEl.innerHTML = '<span style="color:#ff8888;">❌ ' + err.message + '</span>';
    });

    // Délégation : clic sur un chip de filtre → toggle + re-render
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
        }
        chip.classList.toggle("active");
        _updateClearButton();
        _renderResultats(input.value.trim());
      });
    }

    // Bouton "Effacer les filtres"
    const clearBtn = document.getElementById("kta-search-clear-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", function() {
        _filterLayers = new Set();
        _filterTags   = new Set();
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

    // Sélection au clavier (flèches haut/bas + Enter)
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

  // ========== CHARGEMENT DU CACHE DE POINTS ==========
  // Le cache `_pointsCache` ne contient QUE les points externes (data.json).
  // Les points editor sont récupérés à chaque appel via `_collecterPointsEditor()`
  // car ils peuvent changer entre 2 ouvertures de la recherche (ajout, import session, etc.)
  async function _chargerCache() {
    const sig = _signaturePlan();
    if (sig === _planSignature && _pointsCache) return;

    _pointsCache    = [];
    _planSignature  = sig;

    const config = window.PLAN_CONFIG;
    if (!config) throw new Error("Plan non chargé");

    // Calques de données externes uniquement (on saute "editor")
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

  // Récupère les points editor à jour (jamais cachés)
  // → garantit que les imports de session, ajouts/suppressions sont immédiatement
  //   visibles dans la recherche sans avoir à recharger le plan.
  function _collecterPointsEditor() {
    const out = [];
    if (!window.getEditorPoints) return out;

    const config = window.PLAN_CONFIG;
    // Trouver le label du calque editor (s'il est déclaré dans dataLayers)
    let label = "Mes ajouts";
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

  // Renvoie l'ensemble complet (cache externe + editor frais)
  function _tousLesPoints() {
    const editor = _collecterPointsEditor();
    return (_pointsCache || []).concat(editor);
  }

  // ========== NORMALISATION POUR RECHERCHE ==========
  function _normalize(s) {
    if (s === null || s === undefined) return "";
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  // ========== RENDU DES CHIPS DE FILTRE ==========
  function _renderFiltres() {
    const el = document.getElementById("kta-search-filters");
    if (!el) return;

    const layers = _availableLayers();
    const tags   = _availableTags();

    let html = "";

    if (layers.length > 0) {
      html += '<div class="kta-search-filters-row">';
      html += '<span class="kta-search-filters-label">Calques</span>';
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
      html += '<span class="kta-search-filters-label">Tags</span>';
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
    const hasFilters = (_filterLayers.size > 0 || _filterTags.size > 0);
    btn.style.display = hasFilters ? "inline-block" : "none";
  }

  // ========== RECHERCHE & TRI ==========
  function _filtrer(query) {
    // Application des filtres calques + tags AVANT le filtrage textuel
    const tousPoints = _tousLesPoints().filter(_matchesFilters);
    if (!query) return tousPoints.slice();

    const q = _normalize(query);
    const matches = [];

    for (const it of tousPoints) {
      const p = it.point;
      const nom  = _normalize(p.nom || "");
      const id   = _normalize(p.id || "");
      const desc = _normalize(p.description || "");
      const etat = _normalize(p.etat || "");
      const tags = (Array.isArray(p.tags) ? p.tags.map(_normalize).join(" ") : "");

      let score = 0;

      // Match exact dans nom → 100
      if (nom === q) score = 100;
      // Match au début du nom → 80
      else if (nom.startsWith(q)) score = 80;
      // Match dans le nom → 60
      else if (nom.includes(q)) score = 60;
      // Match exact dans id → 50
      else if (id === q) score = 50;
      // Match au début de l'id → 40
      else if (id.startsWith(q)) score = 40;
      // Match dans l'id → 30
      else if (id.includes(q)) score = 30;
      // Match dans tags → 20
      else if (tags.includes(q)) score = 20;
      // Match dans description ou état → 10
      else if (desc.includes(q) || etat.includes(q)) score = 10;

      if (score > 0) matches.push({ item: it, score: score });
    }

    matches.sort(function(a, b) {
      if (a.score !== b.score) return b.score - a.score;
      return _normalize(a.item.point.nom || a.item.point.id || "")
        .localeCompare(_normalize(b.item.point.nom || b.item.point.id || ""));
    });

    return matches.map(function(m) { return m.item; });
  }

  // ========== RENDU DES RÉSULTATS ==========
  function _renderResultats(query) {
    const resEl = document.getElementById("kta-search-results");
    const infoEl = document.getElementById("kta-search-info");
    if (!resEl) return;

    const filtered = _filtrer(query);
    const LIMITE = 50;
    const visibles = filtered.slice(0, LIMITE);
    const surplus = filtered.length - visibles.length;

    if (query) {
      infoEl.textContent = filtered.length === 0
        ? "Aucun résultat"
        : filtered.length + " résultat(s)";
    } else {
      const total           = _tousLesPoints().length;
      const filtersActive   = (_filterLayers.size > 0 || _filterTags.size > 0);
      if (filtersActive) {
        infoEl.textContent = filtered.length + " sur " + total + " point(s) (filtré)";
      } else {
        infoEl.textContent = total + " point(s) disponible(s)";
      }
    }

    if (filtered.length === 0) {
      const filtersActive = (_filterLayers.size > 0 || _filterTags.size > 0);
      let msg;
      if (query) {
        msg = 'Aucun point ne correspond à <strong>' + _escapeHtml(query) + '</strong>';
      } else if (filtersActive) {
        msg = 'Aucun point ne correspond aux filtres actifs';
      } else {
        msg = 'Tape une recherche pour trouver un point';
      }
      resEl.innerHTML = `
        <div class="kta-search-empty">
          <div class="empty-icon">🔍</div>
          ${msg}
        </div>
      `;
      return;
    }

    let html = "";
    _visibles = visibles;  // mémoriser pour les listeners (les clics se fient à l'index local)
    visibles.forEach(function(it, idx) {
      const p = it.point;
      const iconUrl = _getIconUrl(p);
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const xy = (typeof p.x === "number" && typeof p.y === "number")
        ? '<span class="kta-search-coords">x:' + p.x + ' y:' + p.y + '</span>'
        : '';

      // data-visible-idx référence l'index dans la liste actuellement affichée
      // (et non plus _pointsCache, qui ne contient que les data layers externes)
      html += '<div class="kta-search-result' + (idx === 0 && query ? " active" : "") + '" data-visible-idx="' + idx + '">';
      html += '<div class="kta-search-icon">';
      if (iconUrl) html += '<img src="' + _escapeAttr(iconUrl) + '" alt="">';
      else         html += '<span style="font-size:18px; opacity:0.4;">📍</span>';
      html += '</div>';
      html += '<div class="kta-search-content">';
      html += '<div class="kta-search-name">';
      if (p.id) html += '<span class="kta-search-id">' + _escapeHtml(p.id) + '</span>';
      html += _escapeHtml(p.nom || "(sans nom)");
      html += '</div>';
      html += '<div class="kta-search-meta">';
      html += '<span class="layer-tag">' + _escapeHtml(it.layerLabel) + '</span>';
      tags.slice(0, 4).forEach(function(t) {
        html += '<span class="tag-chip">' + _escapeHtml(t) + '</span>';
      });
      if (tags.length > 4) html += '<span class="tag-chip">+' + (tags.length - 4) + '</span>';
      if (xy) html += ' ' + xy;
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });

    if (surplus > 0) {
      html += '<div class="kta-search-more">+ ' + surplus + ' autre(s) résultat(s) — affine ta recherche</div>';
    }

    resEl.innerHTML = html;

    // Listeners
    resEl.querySelectorAll(".kta-search-result").forEach(function(el) {
      el.addEventListener("click", function() {
        const idx = parseInt(el.dataset.visibleIdx);
        const it = _visibles[idx];
        if (it) _aller(it);
      });
    });
  }

  // ========== RÉCUPÉRATION DE L'ICÔNE ==========
  // Cascade : plan-config.icons[tag] → _iconMap[tag] (built-in fallback) → default
  function _getIconUrl(p) {
    if (typeof window.getIconUrlForPoint === "function") {
      return window.getIconUrlForPoint(p);
    }
    // Fallback ancien comportement si utils.js pas chargé
    const config = window.PLAN_CONFIG;
    if (!config || !config.icons) return null;
    if (Array.isArray(p.tags)) {
      for (const t of p.tags) {
        if (config.icons[t]) return config.icons[t];
      }
    }
    return config.icons.default || null;
  }

  // ========== ALLER À UN POINT ==========
  function _aller(item) {
    const p = item.point;
    if (typeof p.x !== "number" || typeof p.y !== "number") {
      alert("Ce point n'a pas de coordonnées valides");
      return;
    }

    if (!window.map || !APP_CONFIG) return;

    // Fermer la modale
    if (_modal) _modal.remove();
    _modal = null;
    if (_filtreTimer) { clearTimeout(_filtreTimer); _filtreTimer = null; }

    const latlng = convertCoord(p.x, p.y);

    // setView (sans animation) plutôt que flyTo : évite toute dérive cumulative.
    // L'animation flyTo peut introduire des erreurs d'arrondi qui s'accumulent
    // d'une recherche à l'autre.
    window.map.setView(latlng, window.map.getZoom(), { animate: false });

    // Forcer Leaflet à recalculer ses dimensions internes (au cas où)
    window.map.invalidateSize();

    // Ouvrir popup et entourer immédiatement (pas besoin d'attendre l'animation)
    _ouvrirPopupEtFlash(item, latlng);
  }

  // ========== POPUP + ENTOURAGE STATIQUE ==========
  function _ouvrirPopupEtFlash(item, latlng) {
    const p = item.point;

    // Cleanup d'un éventuel entourage précédent
    if (_flashLayer) {
      try { window.map.removeLayer(_flashLayer); } catch(e) {}
      _flashLayer = null;
    }

    // Tenter d'ouvrir le popup du marker existant si on le trouve
    // Matching par coordonnées plan x/y exactes (pas par latlng dérivé)
    const targetLayer = window.dataLayerGroups && window.dataLayerGroups[item.layerId];
    let foundMarker = null;
    if (targetLayer && targetLayer.eachLayer) {
      targetLayer.eachLayer(function(m) {
        if (foundMarker) return;
        if (m.getLatLng) {
          const ll = m.getLatLng();
          // Reconvertir en coords plan pour comparer à p.x, p.y
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
      // Pas de marker direct (ex: layer pas visible) → popup temporaire
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

    // Cercle d'entourage statique (pas d'animation, juste pour aider à repérer)
    _flashLayer = L.circleMarker(latlng, {
      radius: 24,
      color: "#ffaa00",
      fillColor: "#ffcc44",
      fillOpacity: 0,
      weight: 3,
      opacity: 0.9,
      interactive: false
    }).addTo(window.map);

    // Le cercle disparaît après 3 secondes
    setTimeout(function() {
      if (_flashLayer) {
        try { window.map.removeLayer(_flashLayer); } catch(e) {}
        _flashLayer = null;
      }
    }, 3000);
  }

  // ========== UTILS ==========
  function _escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function _escapeAttr(s) { return _escapeHtml(s).replace(/"/g, "&quot;"); }

  // ========== INVALIDATION DU CACHE AU CHANGEMENT DE PLAN ==========
  // (le cache se réinitialise automatiquement via _signaturePlan() à chaque ouverture)

})();
