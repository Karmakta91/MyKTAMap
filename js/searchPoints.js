// =========================
// SEARCH POINTS — Recherche unifiée (v1.10.3-search-unified)
// =========================
// Permet à l'utilisateur de chercher dans 4 catégories d'annotations :
//   📍 Points    (data layers + session)
//   🛣️ Tracés    (roads session + getAllEmbeddedRoads)
//   ⬛ Zones     (zones session + getAllEmbeddedZones)
//   🏛️ Structures (structures session + getAllEmbeddedStructures)
//
// Workflow :
//   1. Modale ouverte par window.ouvrirRecherche() OU Ctrl/Cmd+K
//   2. Champ de recherche live debounced 200ms
//   3. Résultats groupés par catégorie (📍 Points (N) · 🛣️ Tracés (M)…)
//   4. Clic sur un résultat → carte centrée + popup + flash visuel
//
// Histoire :
//   v1.7.x → recherche points uniquement
//   v1.10.3 (KARMA "1:b · 2:b · 3:a · 5:b · 6:a+b · 7:a · 8:a+b+c") →
//   extension à roads/zones/structures + raccourci clavier + groupes.
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
  // 🆕 v1.10.3-search-unified : filtre par catégorie (kind). Set<"point"|"road"|"zone"|"structure">
  // Vide = toutes les catégories actives (comportement par défaut "tout voir").
  let _filterKinds  = new Set();

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
    _filterKinds  = new Set();
    _afficherModal();
  };

  // 🆕 v1.10.3-search-unified : raccourci clavier global Ctrl/Cmd+K
  // Ouvre la modale de recherche sauf si l'user est en train de taper
  // dans un input/textarea/contenteditable (anti-vol de focus).
  document.addEventListener("keydown", function(e) {
    const key = (e.key || "").toLowerCase();
    const isCmdK = (e.ctrlKey || e.metaKey) && key === "k" && !e.altKey && !e.shiftKey;
    if (!isCmdK) return;
    // Si on est focus sur un champ texte, ne pas voler le focus (l'user pourrait
    // vouloir le binding Ctrl+K natif de son OS = couper-ligne en bash, etc.).
    // EXCEPTION : si la modale de recherche est déjà ouverte, on autorise le
    // toggle pour fermer/rouvrir.
    const ae = document.activeElement;
    const isInputFocused = ae && (
      ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" ||
      (ae.getAttribute && ae.getAttribute("contenteditable") === "true")
    );
    const searchAlreadyOpen = !!document.getElementById("kta-search-modal");
    if (isInputFocused && !searchAlreadyOpen) return;
    e.preventDefault();
    e.stopPropagation();
    // Toggle : si déjà ouverte → fermer, sinon ouvrir
    if (searchAlreadyOpen) {
      const existing = document.getElementById("kta-search-modal");
      if (existing) existing.remove();
      _modal = null;
    } else {
      window.ouvrirRecherche();
    }
  });

  // API utilitaire exposée pour les autres modules (Pathfinder par ex.) qui
  // veulent énumérer tous les points (data layers + editor) sans ouvrir la
  // modale de recherche. Async car le 1er appel charge le cache des data
  // layers depuis fetch().
  window.SearchPoints = {
    getAllPoints: async function() {
      try { await _chargerCache(); }
      catch(e) { console.warn("[SearchPoints.getAllPoints] cache load failed :", e); }
      return _tousLesPoints();
    },
    // Recherche substring case-insensitive sur nom + id + tags. Utile pour
    // l'autocomplete dans la modale itinéraire.
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

  // Test si un point passe les filtres actifs (legacy — points uniquement)
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

  // 🆕 v1.10.3-search-unified : version unifiée pour les 4 catégories.
  // - filterKinds (Set vide = tout) : filtre par "point"|"road"|"zone"|"structure"
  // - filterLayers : pour points uniquement (tracés/zones/structures n'ont pas de "layer" au sens calque)
  // - filterTags  : pour points uniquement (les autres n'ont pas de tags)
  function _matchesFiltersUnified(it) {
    // Filtre catégorie
    if (_filterKinds.size > 0 && !_filterKinds.has(it.kind)) return false;
    // Filtre layer + tags : ne s'applique QUE aux points (les autres catégories
    // n'ont pas de structure "calque" comparable et pas de tags).
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
          <span class="kta-readme-modal-titre">🔍 Recherche unifiée <span style="font-size:11px; color:#8892a4; font-weight:400; margin-left:8px;">Ctrl+K</span></span>
          <button class="kta-panneau-close" id="kta-search-close">✕</button>
        </div>
        <div class="kta-readme-modal-corps">

          <div class="kta-search-input-wrap">
            <input type="text" id="kta-search-input"
              placeholder="🔍 Cherche un point, tracé, zone, structure..."
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
      const total = _tousLesItems().length;
      infoEl.textContent = total + " élément(s) disponible(s)";
      _renderFiltres();           // chips catégorie + calques + tags
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
        } else if (type === "kind") {
          // 🆕 v1.10.3-search-unified : filtre catégorie
          if (_filterKinds.has(value)) _filterKinds.delete(value);
          else _filterKinds.add(value);
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

  // ========== 🆕 v1.10.3-search-unified : COLLECTEURS ROADS/ZONES/STRUCTURES ==========
  // Labels lisibles par type (cohérent UI app)
  const _ROAD_TYPE_LABEL   = { principal: "Principal", secondaire: "Secondaire", chemin: "Chemin", jonction: "Jonction", itinerary: "Itinéraire" };
  const _ZONE_TYPE_LABEL   = { eau: "Eau", remblais: "Remblais", effondrement: "Effondrement", inaccessible: "Inaccessible" };
  const _STRUCT_TYPE_LABEL = { "pilier-1": "Pilier 1ère masse", "pilier-2": "Pilier 2e masse", "mur": "Mur", "front-1": "Front 1ère", "front-2": "Front 2e" };

  // Icônes emoji utilisés dans les résultats (pas d'image PNG dédiée pour
  // roads/zones/structures — emojis plus rapides et cohérents UI).
  const _KIND_EMOJI = { point: "📍", road: "🛣️", zone: "⬛", structure: "🏛️" };

  // Collecte les roads (session + embedded data layers) avec label auto si manquant.
  // Retourne format unifié [{kind:"road", item:road, layerId, layerLabel, label, searchableText}]
  function _collecterRoads() {
    const out = [];
    const sessionRoads = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    sessionRoads.forEach(function(r, idx) {
      if (!r) return;
      const lbl = r.label || (_ROAD_TYPE_LABEL[r.type] || r.type || "Tracé") + " session #" + (idx + 1);
      out.push({
        kind: "road",
        item: r,
        layerId: "session",
        layerLabel: "Session",
        label: lbl,
        searchableText: [lbl, r.type, _ROAD_TYPE_LABEL[r.type] || "", r.label || "", Number.isInteger(r.level) ? "niveau " + r.level : ""].join(" ")
      });
    });
    const embRoads = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : [];
    embRoads.forEach(function(r, idx) {
      if (!r) return;
      const lbl = r.label || (_ROAD_TYPE_LABEL[r.type] || r.type || "Tracé") + " data #" + (idx + 1);
      out.push({
        kind: "road",
        item: r,
        layerId: r._layerId || "data",
        layerLabel: r._layerLabel || "Data layer",
        label: lbl,
        searchableText: [lbl, r.type, _ROAD_TYPE_LABEL[r.type] || "", r.label || "", Number.isInteger(r.level) ? "niveau " + r.level : ""].join(" ")
      });
    });
    return out;
  }

  function _collecterZones() {
    const out = [];
    const sessionZones = (typeof window.getZones === "function") ? (window.getZones() || []) : [];
    sessionZones.forEach(function(z, idx) {
      if (!z) return;
      const lbl = z.label || "Zone " + (_ZONE_TYPE_LABEL[z.type] || z.type || "") + " session #" + (idx + 1);
      out.push({
        kind: "zone",
        item: z,
        layerId: "session",
        layerLabel: "Session",
        label: lbl,
        searchableText: [lbl, z.type, _ZONE_TYPE_LABEL[z.type] || "", z.label || "", Number.isInteger(z.level) ? "niveau " + z.level : ""].join(" ")
      });
    });
    const embZones = (typeof window.getAllEmbeddedZones === "function") ? (window.getAllEmbeddedZones() || []) : [];
    embZones.forEach(function(z, idx) {
      if (!z) return;
      const lbl = z.label || "Zone " + (_ZONE_TYPE_LABEL[z.type] || z.type || "") + " data #" + (idx + 1);
      out.push({
        kind: "zone",
        item: z,
        layerId: z._layerId || "data",
        layerLabel: z._layerLabel || "Data layer",
        label: lbl,
        searchableText: [lbl, z.type, _ZONE_TYPE_LABEL[z.type] || "", z.label || "", Number.isInteger(z.level) ? "niveau " + z.level : ""].join(" ")
      });
    });
    return out;
  }

  function _collecterStructures() {
    const out = [];
    const sessionStructs = (typeof window.getStructures === "function") ? (window.getStructures() || []) : [];
    sessionStructs.forEach(function(s, idx) {
      if (!s) return;
      const lbl = s.label || (_STRUCT_TYPE_LABEL[s.type] || s.type || "Structure") + " session #" + (idx + 1);
      out.push({
        kind: "structure",
        item: s,
        layerId: "session",
        layerLabel: "Session",
        label: lbl,
        searchableText: [lbl, s.type, _STRUCT_TYPE_LABEL[s.type] || "", s.label || "", Number.isInteger(s.level) ? "niveau " + s.level : ""].join(" ")
      });
    });
    const embStructs = (typeof window.getAllEmbeddedStructures === "function") ? (window.getAllEmbeddedStructures() || []) : [];
    embStructs.forEach(function(s, idx) {
      if (!s) return;
      const lbl = s.label || (_STRUCT_TYPE_LABEL[s.type] || s.type || "Structure") + " data #" + (idx + 1);
      out.push({
        kind: "structure",
        item: s,
        layerId: s._layerId || "data",
        layerLabel: s._layerLabel || "Data layer",
        label: lbl,
        searchableText: [lbl, s.type, _STRUCT_TYPE_LABEL[s.type] || "", s.label || "", Number.isInteger(s.level) ? "niveau " + s.level : ""].join(" ")
      });
    });
    return out;
  }

  // Retourne TOUS les items (points + roads + zones + structures) dans un
  // format unifié. Utilisé par la modale de recherche UNIQUEMENT — n'est
  // PAS exposé via SearchPoints.* pour ne pas casser Pathfinder et autres
  // modules qui consomment getAllPoints/findByQuery (format point-only).
  function _tousLesItems() {
    const items = [];
    // Points : on garde le format historique mais on l'enrichit avec kind
    _tousLesPoints().forEach(function(it) {
      const p = it.point;
      const lbl = p.nom || p.id || "Point sans nom";
      items.push({
        kind: "point",
        item: p,
        layerId: it.layerId,
        layerLabel: it.layerLabel,
        label: lbl,
        // Pour les points, on garde un searchableText riche (nom + id + tags + desc + état)
        searchableText: [
          lbl, p.id || "", p.nom || "",
          Array.isArray(p.tags) ? p.tags.join(" ") : "",
          p.description || "", p.etat || ""
        ].join(" "),
        // Compat avec _ouvrirPopupEtFlash actuel (qui attend item.point) :
        point: p
      });
    });
    Array.prototype.push.apply(items, _collecterRoads());
    Array.prototype.push.apply(items, _collecterZones());
    Array.prototype.push.apply(items, _collecterStructures());
    return items;
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

    // 🆕 v1.10.3-search-unified : filtres catégorie (4 chips)
    // Affichés en premier car ils restructurent le plus la liste de résultats.
    // Compteurs live = nombre d'items par catégorie dans la session+data layers.
    const allItems  = _tousLesItems();
    const kindCount = { point: 0, road: 0, zone: 0, structure: 0 };
    allItems.forEach(function(it) { kindCount[it.kind] = (kindCount[it.kind] || 0) + 1; });
    const KIND_DEFS = [
      { id: "point",     label: "📍 Points"     },
      { id: "road",      label: "🛣️ Tracés"     },
      { id: "zone",      label: "⬛ Zones"      },
      { id: "structure", label: "🏛️ Structures" }
    ];
    const kindsAvecContenu = KIND_DEFS.filter(function(k) { return kindCount[k.id] > 0; });
    if (kindsAvecContenu.length >= 2) {  // pas la peine d'afficher s'il n'y a qu'une catégorie
      html += '<div class="kta-search-filters-row">';
      html += '<span class="kta-search-filters-label">Catégorie</span>';
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
    const hasFilters = (_filterLayers.size > 0 || _filterTags.size > 0 || _filterKinds.size > 0);
    btn.style.display = hasFilters ? "inline-block" : "none";
  }

  // ========== RECHERCHE & TRI (v1.10.3-search-unified) ==========
  // Scoring sur les 4 catégories :
  //   - Points : nom, id, tags, description, état (comme avant)
  //   - Roads/Zones/Structures : label, type (label FR), level (niveau N)
  // Tri intra-catégorie par score décroissant, puis alphabétique sur le label.
  // Le grouping par catégorie est fait par _renderResultats (pas ici).
  function _filtrer(query) {
    // Application des filtres unifiés (kind + layers + tags) AVANT le filtrage textuel
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
        // Roads/Zones/Structures : match sur le searchableText pré-calculé
        // (label + type + label FR du type + level). Scoring plus simple
        // car moins de champs à différencier en priorité.
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

  // ========== RENDU DES RÉSULTATS (v1.10.3-search-unified) ==========
  // Rendu groupé par catégorie (📍 Points, 🛣️ Tracés, ⬛ Zones, 🏛️ Structures)
  // avec headers de section + compteurs par catégorie. Limite 50 résultats
  // au total répartis sur les 4 catégories (au prorata par défaut).
  function _renderResultats(query) {
    const resEl  = document.getElementById("kta-search-results");
    const infoEl = document.getElementById("kta-search-info");
    if (!resEl) return;

    const filtered = _filtrer(query);
    const LIMITE = 50;
    const visibles = filtered.slice(0, LIMITE);
    const surplus  = filtered.length - visibles.length;

    if (query) {
      infoEl.textContent = filtered.length === 0
        ? "Aucun résultat"
        : filtered.length + " résultat(s)";
    } else {
      const total = _tousLesItems().length;
      const filtersActive = (_filterLayers.size > 0 || _filterTags.size > 0 || _filterKinds.size > 0);
      if (filtersActive) {
        infoEl.textContent = filtered.length + " sur " + total + " élément(s) (filtré)";
      } else {
        infoEl.textContent = total + " élément(s) disponible(s)";
      }
    }

    if (filtered.length === 0) {
      const filtersActive = (_filterLayers.size > 0 || _filterTags.size > 0 || _filterKinds.size > 0);
      let msg;
      if (query) {
        msg = 'Aucun élément ne correspond à <strong>' + _escapeHtml(query) + '</strong>';
      } else if (filtersActive) {
        msg = 'Aucun élément ne correspond aux filtres actifs';
      } else {
        msg = 'Tape une recherche pour trouver un point, un tracé, une zone ou une structure';
      }
      resEl.innerHTML = `
        <div class="kta-search-empty">
          <div class="empty-icon">🔍</div>
          ${msg}
        </div>
      `;
      return;
    }

    // Groupage par catégorie (préserve l'ordre interne du score / alphabétique)
    const groups = { point: [], road: [], zone: [], structure: [] };
    visibles.forEach(function(it) {
      if (groups[it.kind]) groups[it.kind].push(it);
    });
    const KIND_HEADERS = {
      point:     "📍 Points",
      road:      "🛣️ Tracés",
      zone:      "⬛ Zones",
      structure: "🏛️ Structures"
    };
    const KIND_ORDER = ["point", "road", "zone", "structure"];

    _visibles = visibles;  // mémoriser pour les listeners (les clics se fient à l'index local)

    let html = "";
    let visIdx = 0;
    let firstResultMarked = false;

    KIND_ORDER.forEach(function(kind) {
      const items = groups[kind];
      if (!items || items.length === 0) return;
      html += '<div class="kta-search-group-header" style="padding:8px 6px 4px; font-size:11px; color:#8cb4ff; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; border-top:1px solid rgba(255,255,255,0.04); margin-top:4px;">';
      html += _escapeHtml(KIND_HEADERS[kind]) + ' <span style="color:#8892a4; font-weight:400;">(' + items.length + ')</span>';
      html += '</div>';
      items.forEach(function(it) {
        const isFirst = !firstResultMarked && query;
        firstResultMarked = true;
        html += _renderResultRow(it, visIdx, isFirst);
        visIdx++;
      });
    });

    if (surplus > 0) {
      html += '<div class="kta-search-more">+ ' + surplus + ' autre(s) résultat(s) — affine ta recherche</div>';
    }

    resEl.innerHTML = html;

    // Listeners — un seul handler par row, utilise data-visible-idx
    resEl.querySelectorAll(".kta-search-result").forEach(function(el) {
      el.addEventListener("click", function() {
        const idx = parseInt(el.dataset.visibleIdx);
        const it = _visibles[idx];
        if (it) _aller(it);
      });
    });
  }

  // Rendu d'une ligne résultat selon le kind. Visuellement homogène, mais
  // l'icône + le contenu meta varient par catégorie.
  function _renderResultRow(it, visIdx, isFirst) {
    const activeClass = isFirst ? " active" : "";
    let html = '<div class="kta-search-result' + activeClass + '" data-visible-idx="' + visIdx + '">';

    // Icône : pour les points → image PNG du tag ; pour les autres → emoji.
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

    // Nom principal — varie selon le kind
    if (it.kind === "point") {
      const p = it.item;
      html += '<div class="kta-search-name">';
      if (p.id) html += '<span class="kta-search-id">' + _escapeHtml(p.id) + '</span>';
      html += _escapeHtml(p.nom || "(sans nom)");
      html += '</div>';
    } else {
      // Roads/Zones/Structures : juste le label
      html += '<div class="kta-search-name">' + _escapeHtml(it.label) + '</div>';
    }

    // Meta — varie selon le kind
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
      // Type lisible (badge couleur)
      const typeLabel = (it.kind === "road"      ? (_ROAD_TYPE_LABEL[r.type]   || r.type)
                        : it.kind === "zone"     ? (_ZONE_TYPE_LABEL[r.type]   || r.type)
                        : it.kind === "structure"? (_STRUCT_TYPE_LABEL[r.type] || r.type)
                        : (r.type || ""));
      if (typeLabel) html += '<span class="tag-chip">' + _escapeHtml(typeLabel) + '</span>';
      // Niveau si M-LVL ou level présent
      if (Number.isInteger(r.level)) {
        html += '<span class="tag-chip">Niv ' + r.level + '</span>';
      } else if (r.type === "jonction" && (Number.isInteger(r.fromLevel) || Number.isInteger(r.toLevel))) {
        html += '<span class="tag-chip">Niv ' + (r.fromLevel != null ? r.fromLevel : "?") + ' ↔ ' + (r.toLevel != null ? r.toLevel : "?") + '</span>';
      }
      // Nombre de points (info utile pour les polygones)
      if (Array.isArray(r.points)) {
        html += ' <span class="kta-search-coords">' + r.points.length + ' pt' + (r.points.length > 1 ? "s" : "") + '</span>';
      }
    }
    html += '</div>';

    html += '</div>';  // end content
    html += '</div>';  // end result
    return html;
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

  // ========== ALLER À UN POINT/ROAD/ZONE/STRUCTURE (v1.10.3-search-unified) ==========
  // Dispatcher selon le kind de l'item — points utilisent l'ancien flow,
  // les 3 autres utilisent _allerVersAnnotation (centroïde + flash overlay).
  function _aller(item) {
    if (!window.map || !window.APP_CONFIG) return;

    // Fermer la modale
    if (_modal) _modal.remove();
    _modal = null;
    if (_filtreTimer) { clearTimeout(_filtreTimer); _filtreTimer = null; }

    if (item.kind === "point") {
      _allerVersPoint(item);
    } else {
      _allerVersAnnotation(item);
    }
  }

  // Va vers un point (comportement v1.7.x préservé pour compat)
  function _allerVersPoint(item) {
    const p = item.item || item.point;  // compat ancien format (point) + nouveau (item)
    if (typeof p.x !== "number" || typeof p.y !== "number") {
      alert("Ce point n'a pas de coordonnées valides");
      return;
    }
    const latlng = convertCoord(p.x, p.y);
    window.map.setView(latlng, window.map.getZoom(), { animate: false });
    window.map.invalidateSize();
    // _ouvrirPopupEtFlash attend item.point — on assure la rétrocompat
    const compatItem = { point: p, layerId: item.layerId, layerLabel: item.layerLabel };
    _ouvrirPopupEtFlash(compatItem, latlng);
  }

  // 🆕 v1.10.3-search-unified : va vers une road / zone / structure.
  // Calcule le centroïde, centre la carte dessus, pose un overlay flash
  // (polyline jaune ou polygon jaune) + popup info.
  function _allerVersAnnotation(item) {
    const ann = item.item;
    if (!ann || !Array.isArray(ann.points) || ann.points.length === 0) {
      alert("Élément sans points — impossible de localiser.");
      return;
    }

    // Centroïde simple = moyenne des coords plan
    let sumX = 0, sumY = 0;
    ann.points.forEach(function(pt) { sumX += pt.x; sumY += pt.y; });
    const cx = sumX / ann.points.length;
    const cy = sumY / ann.points.length;
    const center = convertCoord(cx, cy);
    window.map.setView(center, window.map.getZoom(), { animate: false });
    window.map.invalidateSize();

    // Cleanup d'un éventuel overlay flash précédent
    if (_flashLayer) {
      try { window.map.removeLayer(_flashLayer); } catch(e) {}
      _flashLayer = null;
    }

    // Construit l'overlay de flash selon le kind + type
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
      // Polygon (zone, pilier, mur)
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

    // Popup info — contenu adapté au kind
    let popupHtml = "<b>" + _escapeHtml(item.label) + "</b>";
    const typeLabel = (item.kind === "road"      ? (_ROAD_TYPE_LABEL[ann.type]   || ann.type)
                      : item.kind === "zone"     ? (_ZONE_TYPE_LABEL[ann.type]   || ann.type)
                      : item.kind === "structure"? (_STRUCT_TYPE_LABEL[ann.type] || ann.type)
                      : ann.type);
    if (typeLabel) popupHtml += "<br>Type : " + _escapeHtml(typeLabel);
    if (Number.isInteger(ann.level)) popupHtml += "<br>Niveau : " + ann.level;
    if (ann.type === "jonction" && Number.isInteger(ann.fromLevel) && Number.isInteger(ann.toLevel)) {
      popupHtml += "<br>Jonction : niv " + ann.fromLevel + " ↔ niv " + ann.toLevel;
    }
    if (Array.isArray(ann.points)) popupHtml += '<br><small style="opacity:0.6;">' + ann.points.length + " point(s) · " + _escapeHtml(item.layerLabel) + "</small>";

    L.popup({ autoClose: true, closeOnClick: true })
      .setLatLng(center)
      .setContent(popupHtml)
      .openOn(window.map);

    // Disparition automatique du flash après 4 secondes
    setTimeout(function() {
      if (_flashLayer) {
        try { window.map.removeLayer(_flashLayer); } catch(e) {}
        _flashLayer = null;
      }
    }, 4000);
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
