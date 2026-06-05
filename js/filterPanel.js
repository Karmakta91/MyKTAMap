/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 */

// =========================
// FILTERPANEL.JS — Modale de filtres custom (depuis v1.21.5)
// =========================
// Remplace le control Leaflet natif `≡` (qui ne togglait que les image
// layers) par une modale unifiée qui filtre :
//   • 🖼️ Image layers      (déjà géré par Leaflet)
//   • 📊 Data layers        (sync via dataLayerGroups)
//   • 🏗️ Niveaux M-LVL      (sync bidirectionnel avec _ouvrirSelecteurNiveau)
//   • 🏷️ Tags points        (filtre runtime AJOUTÉ — nouveau pattern)
//   • 🛣️ Types tracés       (filtre runtime AJOUTÉ)
//   • ⬛ Types zones        (filtre runtime AJOUTÉ)
//   • 🏛️ Types structures   (filtre runtime AJOUTÉ)
//
// État stocké dans `window._ktaRuntimeFilters` :
//   {
//     tags:        Set<string> | null,  // null = pas de filtre (tout visible)
//     roadTypes:   Set<string> | null,
//     zoneTypes:   Set<string> | null,
//     structTypes: Set<string> | null
//   }
// Les niveaux M-LVL restent dans APP_CONFIG.visibleLevels (sync avec
// _ouvrirSelecteurNiveau via le callback `appliquerFiltreNiveau`).
//
// API publique :
//   window.FilterPanel = {
//     ouvrir, fermer, getState, setFilters,
//     onChange, applyFilters, isVisible
//   }
//
// Cascade d'application : `window.appliquerFiltreRuntime()` (exposé)
// notifie les modules de rendu (road.js, zones.js, structures.js,
// utils.js > _applyTagFilterToDataPoints, editor.js > renderEditorPoints).
// =========================

(function() {
  "use strict";

  // 🆕 v1.31.5 (P2 progressive lazy CSS) — préchargement du chunk CSS dédié.
  // Cf perf-memory §87 (helper window._loadCssOnce posé par js/cssLazy.js).
  if (typeof window._loadCssOnce === "function") {
    window._loadCssOnce("css/style-filtres.css", "kta-css-style-filtres");
  }

  // ============================================================
  // STATE RUNTIME GLOBAL
  // ============================================================
  if (!window._ktaRuntimeFilters) {
    window._ktaRuntimeFilters = {
      tags:        null,
      roadTypes:   null,
      zoneTypes:   null,
      structTypes: null
    };
  }

  let _modal = null;
  const _listeners = [];
  // Debounce 200ms pour les changements live (évite freeze sur plans denses)
  let _applyTimer = null;

  // ============================================================
  // API
  // ============================================================
  function getState() { return window._ktaRuntimeFilters; }

  function setFilters(partial) {
    if (!partial || typeof partial !== "object") return;
    const f = window._ktaRuntimeFilters;
    if ("tags"        in partial) f.tags        = partial.tags;
    if ("roadTypes"   in partial) f.roadTypes   = partial.roadTypes;
    if ("zoneTypes"   in partial) f.zoneTypes   = partial.zoneTypes;
    if ("structTypes" in partial) f.structTypes = partial.structTypes;
    _scheduleApply();
    _notify();
  }

  function onChange(cb) {
    if (typeof cb !== "function") return function() {};
    _listeners.push(cb);
    return function() {
      const i = _listeners.indexOf(cb);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  function _notify() {
    _listeners.forEach(function(cb) {
      try { cb(window._ktaRuntimeFilters); } catch(e) {}
    });
  }

  function _scheduleApply() {
    if (_applyTimer) clearTimeout(_applyTimer);
    _applyTimer = setTimeout(function() {
      _applyTimer = null;
      applyFilters();
    }, 200);
  }

  function applyFilters() {
    // Appelle la cascade globale qui re-rend tous les modules concernés.
    // Définie dans interface.js > initInterface (cascade vers road / zones /
    // structures / editor.js + utils.js > _applyTagFilterToDataPoints).
    if (typeof window.appliquerFiltreRuntime === "function") {
      try { window.appliquerFiltreRuntime(); } catch(e) {
        console.warn("[FilterPanel] applyFilters erreur :", e);
      }
    }
  }

  function isVisible() { return !!_modal; }

  // 🆕 v1.21.5 (sync M-LVL bidirectionnel) : appelé par appliquerFiltreNiveau
  // quand visibleLevels / activeLevel changent ailleurs (modale Niveaux,
  // pastille). Re-render seulement la section M-LVL si la modale est ouverte.
  function onLevelChange() {
    if (!_modal) return;
    const sec = document.getElementById("kta-fp-sec-lvl");
    if (!sec) return;
    const body = sec.querySelector(".kta-fp-section-body");
    if (!body) return;
    body.innerHTML = _renderLevelsSection();
    // Re-bind handlers de la section seule
    _bindLevelHandlers(sec);
  }

  // Re-bind seulement les handlers de la section M-LVL (appelé après
  // onLevelChange qui régénère le HTML). Évite de tout re-binder.
  function _bindLevelHandlers(scope) {
    scope.querySelectorAll('[data-lvl-active]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const lvl = parseInt(btn.getAttribute("data-lvl-active"), 10);
        if (isNaN(lvl) || !window.APP_CONFIG) return;
        window.APP_CONFIG.activeLevel = lvl;
        scope.querySelectorAll('[data-lvl-active]').forEach(function(b) {
          b.classList.toggle("kta-fp-lvl-btn-active", b === btn);
        });
        if (typeof window._onLevelChange === "function") {
          try { window._onLevelChange("active", lvl); } catch(e) {}
        }
      });
    });
    scope.querySelectorAll('[data-lvl-visible]').forEach(function(cb) {
      cb.addEventListener("change", function() {
        _updateVisibleLevelsFromUI(_modal);
      });
    });
    scope.querySelectorAll('[data-action="lvl-all"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const avail = window.APP_CONFIG && Array.isArray(window.APP_CONFIG.availableLevels)
                      ? window.APP_CONFIG.availableLevels : [];
        scope.querySelectorAll('[data-lvl-visible]').forEach(function(cb) { cb.checked = true; });
        if (window.APP_CONFIG) window.APP_CONFIG.visibleLevels = avail.slice();
        if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
        if (typeof window._onLevelChange === "function") window._onLevelChange("visible", avail);
        _refreshChipsState(_modal);
      });
    });
    scope.querySelectorAll('[data-action="lvl-active-only"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const active = window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number"
                       ? window.APP_CONFIG.activeLevel : 0;
        scope.querySelectorAll('[data-lvl-visible]').forEach(function(cb) {
          cb.checked = (parseInt(cb.getAttribute("data-lvl-visible"), 10) === active);
        });
        if (window.APP_CONFIG) window.APP_CONFIG.visibleLevels = [active];
        if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
        if (typeof window._onLevelChange === "function") window._onLevelChange("visible", [active]);
        _refreshChipsState(_modal);
      });
    });
  }

  // ============================================================
  // COLLECTE DE DONNÉES POUR LA MODALE
  // ============================================================

  // Énumère les tags effectivement présents dans la session + data layers
  // courants. Retourne [{tag, count, iconUrl?}, ...] trié desc par count.
  function _enumerateTags() {
    const counts = {};
    function _addPt(p) {
      const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
      counts[t] = (counts[t] || 0) + 1;
    }
    // Session
    if (typeof window.getEditorPoints === "function") {
      (window.getEditorPoints() || []).forEach(_addPt);
    }
    // Data layers (points embedded) — _ktaDataMarkers a _ktaTags
    if (Array.isArray(window._ktaDataMarkers)) {
      window._ktaDataMarkers.forEach(function(m) {
        if (!m) return;
        const t = (Array.isArray(m._ktaTags) && m._ktaTags[0]) || "default";
        counts[t] = (counts[t] || 0) + 1;
      });
    }
    // Tri desc + helper iconUrl si dispo
    return Object.keys(counts).sort(function(a, b) {
      return (counts[b] || 0) - (counts[a] || 0);
    }).map(function(t) {
      let iconUrl = null;
      try {
        if (window._iconMap && window._iconMap[t]) {
          const entry = window._iconMap[t];
          iconUrl = entry._kta_iconUrl
                 || (entry.options && entry.options.iconUrl)
                 || null;
        }
      } catch(e) {}
      return { tag: t, count: counts[t], iconUrl: iconUrl };
    });
  }

  // Liste les types runtime utilisés par catégorie (= apparition au moins 1×)
  function _enumerateTypes(category) {
    const counts = {};
    function _add(items) {
      if (!Array.isArray(items)) return;
      items.forEach(function(it) {
        if (!it || !it.type) return;
        // 🐛 v1.21.5-fix1 (KARMA "itinerary1") : exclure le type "itinerary" du
        // filtre runtime. C'est un dérivé Pathfinder (= chemin calculé), pas un
        // type user-chooseable. Cohérent avec les hooks runtime qui bypass
        // déjà road.type === "itinerary" dans renderRoads.
        if (category === "roads" && it.type === "itinerary") return;
        counts[it.type] = (counts[it.type] || 0) + 1;
      });
    }
    if (category === "roads") {
      if (typeof window.getRoads === "function") _add(window.getRoads());
      if (typeof window.getAllEmbeddedRoads === "function") _add(window.getAllEmbeddedRoads());
    } else if (category === "zones") {
      if (typeof window.getZones === "function") _add(window.getZones());
      if (typeof window.getAllEmbeddedZones === "function") _add(window.getAllEmbeddedZones());
    } else if (category === "structures") {
      if (typeof window.getStructures === "function") _add(window.getStructures());
      if (typeof window.getAllEmbeddedStructures === "function") _add(window.getAllEmbeddedStructures());
    }
    return counts;  // { type: count }
  }

  // Label LegendCustomization-aware
  function _lcLabel(category, type, fallback) {
    if (window.LegendCustomization && typeof window.LegendCustomization.getLabel === "function") {
      try {
        const lbl = window.LegendCustomization.getLabel(category, type);
        if (lbl) return lbl;
      } catch(e) {}
    }
    return fallback || type;
  }

  // ============================================================
  // RENDER MODALE
  // ============================================================

  function _isHidden(setName, type) {
    const set = window._ktaRuntimeFilters[setName];
    if (!set) return false;  // null = tout visible
    return !set.has(type);   // dans le set = visible, hors set = masqué
  }

  function _toggle(setName, type, checked) {
    // Si null (= tout visible), on initialise le set avec TOUS les types
    // courants moins celui qu'on décoche (pour préserver le reste visible).
    const f = window._ktaRuntimeFilters;
    let set = f[setName];
    if (set === null) {
      // Initialise avec tout l'univers courant
      const universe = _getUniverse(setName);
      set = new Set(universe);
    }
    if (checked) set.add(type);
    else         set.delete(type);
    // Si on a tout coché → revient à null (= filtre désactivé)
    const universe = _getUniverse(setName);
    if (set.size === universe.length && universe.every(function(t) { return set.has(t); })) {
      f[setName] = null;
    } else {
      f[setName] = set;
    }
    _scheduleApply();
    _notify();
  }

  function _getUniverse(setName) {
    if (setName === "tags")        return _enumerateTags().map(function(t) { return t.tag; });
    if (setName === "roadTypes")   return Object.keys(_enumerateTypes("roads"));
    if (setName === "zoneTypes")   return Object.keys(_enumerateTypes("zones"));
    if (setName === "structTypes") return Object.keys(_enumerateTypes("structures"));
    return [];
  }

  function _toggleAll(setName, value) {
    const f = window._ktaRuntimeFilters;
    if (value) {
      // Tout afficher = null (filtre désactivé)
      f[setName] = null;
    } else {
      // Tout masquer = Set vide
      f[setName] = new Set();
    }
    _scheduleApply();
    _notify();
  }

  function _renderTagsSection() {
    const tags = _enumerateTags();
    if (tags.length === 0) {
      return '<div class="kta-fp-section-empty">Aucun point dans cette session.</div>';
    }
    let html = '<div class="kta-fp-row-actions">' +
                 '<button class="kta-fp-mini-btn" data-action="show-all" data-set="tags">👁️ Tout</button>' +
                 '<button class="kta-fp-mini-btn" data-action="hide-all" data-set="tags">🚫 Aucun</button>' +
               '</div>';
    html += '<div class="kta-fp-chips-grid">';
    tags.forEach(function(t) {
      const id = "kta-fp-tag-" + t.tag.replace(/[^a-z0-9_-]/gi, "_");
      const visible = !_isHidden("tags", t.tag);
      const lbl = _lcLabel("icones", t.tag, t.tag);
      const ico = t.iconUrl
                  ? '<img class="kta-fp-chip-ico" src="' + t.iconUrl + '" alt="">'
                  : '<span class="kta-fp-chip-ico-emoji">🏷️</span>';
      html += '<label class="kta-fp-chip ' + (visible ? "" : "kta-fp-chip-off") + '">' +
                '<input type="checkbox" id="' + id + '" data-set="tags" data-type="' + _escAttr(t.tag) + '"' + (visible ? " checked" : "") + '>' +
                ico +
                '<span class="kta-fp-chip-label">' + _escHtml(lbl) + '</span>' +
                '<span class="kta-fp-chip-count">' + t.count + '</span>' +
              '</label>';
    });
    html += '</div>';
    return html;
  }

  function _renderTypesSection(category, setName, builtinOrder) {
    const counts = _enumerateTypes(category);
    const universe = Object.keys(counts);
    if (universe.length === 0) {
      return '<div class="kta-fp-section-empty">Aucun élément dans cette session.</div>';
    }
    // Tri : builtin en premier dans l'ordre déclaré, puis customs alphabétique
    const sortedKeys = [];
    (builtinOrder || []).forEach(function(t) { if (counts[t] != null) sortedKeys.push(t); });
    universe.filter(function(t) { return !(builtinOrder || []).includes(t); })
            .sort()
            .forEach(function(t) { sortedKeys.push(t); });

    let html = '<div class="kta-fp-row-actions">' +
                 '<button class="kta-fp-mini-btn" data-action="show-all" data-set="' + setName + '">👁️ Tout</button>' +
                 '<button class="kta-fp-mini-btn" data-action="hide-all" data-set="' + setName + '">🚫 Aucun</button>' +
               '</div>';
    html += '<div class="kta-fp-chips-grid">';
    const lcCat = (category === "roads") ? "traces" : category;
    sortedKeys.forEach(function(t) {
      const visible = !_isHidden(setName, t);
      const lbl = _lcLabel(lcCat, t, t);
      const emoji = _emojiForType(category, t);
      html += '<label class="kta-fp-chip ' + (visible ? "" : "kta-fp-chip-off") + '">' +
                '<input type="checkbox" data-set="' + setName + '" data-type="' + _escAttr(t) + '"' + (visible ? " checked" : "") + '>' +
                '<span class="kta-fp-chip-ico-emoji">' + emoji + '</span>' +
                '<span class="kta-fp-chip-label">' + _escHtml(lbl) + '</span>' +
                '<span class="kta-fp-chip-count">' + counts[t] + '</span>' +
              '</label>';
    });
    html += '</div>';
    return html;
  }

  function _emojiForType(category, type) {
    if (category === "roads") {
      return ({ principal: "🟩", secondaire: "🟪", chemin: "🟨",
                jonction: "🪜", itinerary: "🗺️" })[type] || "✨";
    }
    if (category === "zones") {
      return ({ eau: "💧", remblais: "⬛", effondrement: "🟥",
                inaccessible: "⛔" })[type] || "✨";
    }
    if (category === "structures") {
      return ({ "pilier-1": "🟡", "pilier-2": "🟠", "mur": "🔵",
                "front-1": "🟨", "front-2": "🟧" })[type] || "✨";
    }
    return "🏷️";
  }

  function _renderImageLayersSection() {
    const pc = window.PLAN_CONFIG;
    if (!pc || !Array.isArray(pc.imageLayers) || pc.imageLayers.length === 0) {
      return '<div class="kta-fp-section-empty">Aucun calque image.</div>';
    }
    let html = '<div class="kta-fp-list">';
    pc.imageLayers.forEach(function(lc, idx) {
      // 🩹 v1.34.5 — KARMA bug prod v1.34.3 : check imageLayer → close →
      // reopen → unchecked. Cause : mismatch d'id. Le rendu utilisait
      // `lc.id` tel quel pour `data-img-layer`, mais map.js pushait
      // `id: layerConfig.id || layerConfig.label` (fallback label si pas
      // d'id). Si plan-config sans `id`, le data-img-layer devenait
      // "undefined" mais l'entrée _ktaImageOverlays portait le label →
      // `e.id === id` échouait silencieusement → handler retournait early
      // sans toggler la couche → reopen rendait unchecked (hasLayer false).
      // Fix : appliquer le MÊME fallback ici (lc.id || lc.label) pour que
      // l'id rendu matche celui pushed par map.js.
      const layerId = lc.id || lc.label;
      const entry   = window._ktaImageOverlays && Array.isArray(window._ktaImageOverlays)
                       ? window._ktaImageOverlays.find(function(e) { return e.id === layerId; })
                       : null;
      const onMap   = entry && entry.overlay && window.map && window.map.hasLayer(entry.overlay);
      const visible = (window._ktaImageOverlays && Array.isArray(window._ktaImageOverlays))
                       ? onMap
                       : (lc.visible !== false);
      // 🐛 v1.34.6-debug — logs ciblés pour comprendre pourquoi le checkbox
      // ne reflète pas l'état de la couche / pourquoi cocher ne fait rien.
      // À retirer après diagnostic.
      try {
        console.log("[FilterPanel v1.34.6-debug] render imageLayer", {
          idx,
          lc_id: lc.id, lc_label: lc.label, lc_visible: lc.visible,
          layerId,
          registry_ids: (window._ktaImageOverlays || []).map(function(e) { return e.id; }),
          entry_found: !!entry,
          entry_has_overlay: !!(entry && entry.overlay),
          map_ready: !!window.map,
          hasLayer: !!onMap,
          will_render_checked: !!visible
        });
      } catch(e) {}
      const label = lc.label || lc.id || ("Calque " + idx);
      html += '<label class="kta-fp-row-cb">' +
                '<input type="checkbox" data-img-layer="' + _escAttr(layerId) + '"' + (visible ? " checked" : "") + '>' +
                '<span>🖼️ ' + _escHtml(label) + '</span>' +
              '</label>';
    });
    html += '</div>';
    return html;
  }

  function _renderDataLayersSection() {
    const groups = window.dataLayerGroups || {};
    const ids = Object.keys(groups);
    if (ids.length === 0) {
      return '<div class="kta-fp-section-empty">Aucun calque de données.</div>';
    }
    const pc = window.PLAN_CONFIG;
    const cfg = (pc && Array.isArray(pc.dataLayers)) ? pc.dataLayers : [];
    let html = '<div class="kta-fp-list">';
    ids.forEach(function(id) {
      const visible = window.map && window.map.hasLayer(groups[id]);
      const lc = cfg.find(function(d) { return d.id === id; });
      const label = (lc && lc.label) || (id === "editor" ? "Mes annotations" : id);
      html += '<label class="kta-fp-row-cb">' +
                '<input type="checkbox" data-data-layer="' + _escAttr(id) + '"' + (visible ? " checked" : "") + '>' +
                '<span>📊 ' + _escHtml(label) + '</span>' +
              '</label>';
    });
    html += '</div>';
    return html;
  }

  function _renderLevelsSection() {
    const isML = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    if (!isML) {
      return '<div class="kta-fp-section-empty">Plan mono-niveau — ce filtre est désactivé.</div>';
    }
    const avail = Array.isArray(window.APP_CONFIG.availableLevels)
                  ? window.APP_CONFIG.availableLevels.slice().sort(function(a, b) { return a - b; })
                  : [-2, -1, 0, 1, 2];
    const visible = Array.isArray(window.APP_CONFIG.visibleLevels) ? window.APP_CONFIG.visibleLevels : [0];
    const active  = (typeof window.APP_CONFIG.activeLevel === "number") ? window.APP_CONFIG.activeLevel : 0;
    let html = '<div class="kta-fp-lvl-active">';
    html += '<span class="kta-fp-sublabel">Niveau actif (dessin)</span>';
    html += '<div class="kta-fp-lvl-segmented">';
    avail.forEach(function(lvl) {
      const lblTxt = (lvl === 0) ? "RDC" : (lvl > 0 ? "+" + lvl : String(lvl));
      const isActive = (lvl === active);
      html += '<button type="button" class="kta-fp-lvl-btn ' + (isActive ? "kta-fp-lvl-btn-active" : "") +
              '" data-lvl-active="' + lvl + '">' + lblTxt + '</button>';
    });
    html += '</div></div>';

    html += '<div class="kta-fp-lvl-visible">';
    html += '<span class="kta-fp-sublabel">Niveaux visibles</span>';
    html += '<div class="kta-fp-row-actions">' +
              '<button class="kta-fp-mini-btn" data-action="lvl-all">👁️ Tous</button>' +
              '<button class="kta-fp-mini-btn" data-action="lvl-active-only">🎯 Actif seul</button>' +
            '</div>';
    html += '<div class="kta-fp-chips-grid">';
    avail.forEach(function(lvl) {
      const lblTxt = (lvl === 0) ? "RDC" : (lvl > 0 ? "+" + lvl : String(lvl));
      const isVis = visible.indexOf(lvl) >= 0;
      html += '<label class="kta-fp-chip ' + (isVis ? "" : "kta-fp-chip-off") + '">' +
                '<input type="checkbox" data-lvl-visible="' + lvl + '"' + (isVis ? " checked" : "") + '>' +
                '<span class="kta-fp-chip-label">Niv ' + lblTxt + '</span>' +
              '</label>';
    });
    html += '</div></div>';
    return html;
  }

  // ============================================================
  // MODALE
  // ============================================================

  function ouvrir() {
    if (_modal) { fermer(); }
    _modal = document.createElement("div");
    _modal.id = "kta-fp-modal";
    _modal.className = "kta-readme-modal-overlay";
    _modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-fp-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">≡ Filtres d\'affichage</span>' +
          '<button class="kta-panneau-close" id="kta-fp-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-fp-corps">' +
          _renderAllSections() +
        '</div>' +
        '<div class="kta-fp-footer">' +
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-fp-reset-all">🔄 Tout afficher</button>' +
          '<span class="kta-fp-status" id="kta-fp-status"></span>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(_modal);
    _bindModalHandlers();
    _updateStatus();
  }

  function _renderAllSections() {
    return _section("🖼️ Calques d'image",       "img",     _renderImageLayersSection()) +
           _section("📊 Calques de données",     "data",    _renderDataLayersSection()) +
           _section("🏗️ Niveaux M-LVL",          "lvl",     _renderLevelsSection()) +
           _section("🏷️ Tags des points",         "tags",    _renderTagsSection()) +
           _section("🛣️ Types de tracés",         "roads",   _renderTypesSection("roads",      "roadTypes",   ["principal", "secondaire", "chemin", "jonction"])) +
           _section("⬛ Types de zones",          "zones",   _renderTypesSection("zones",      "zoneTypes",   ["eau", "remblais", "effondrement", "inaccessible"])) +
           _section("🏛️ Types de structures",    "structs", _renderTypesSection("structures", "structTypes", ["pilier-1", "pilier-2", "mur", "front-1", "front-2"]));
  }

  function _section(title, id, contentHtml) {
    // Section ouverte par défaut. L'user peut replier via le header.
    return '<details class="kta-fp-section" id="kta-fp-sec-' + id + '" open>' +
             '<summary class="kta-fp-section-titre">' + _escHtml(title) + '</summary>' +
             '<div class="kta-fp-section-body">' + contentHtml + '</div>' +
           '</details>';
  }

  function _bindModalHandlers() {
    const overlay = _modal;
    const closeBtn = document.getElementById("kta-fp-close");
    function _close() { fermer(); }
    if (closeBtn) closeBtn.addEventListener("click", _close);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _close(); });
    document.addEventListener("keydown", _onKey);

    // === Image layers ===
    overlay.querySelectorAll('[data-img-layer]').forEach(function(cb) {
      cb.addEventListener("change", function() {
        const id = cb.getAttribute("data-img-layer");
        // 🐛 v1.34.6-debug — log avant toute condition pour confirmer que
        // l'event change fire bien sur les checkboxes imageLayer.
        try {
          console.log("[FilterPanel v1.34.6-debug] change imageLayer", {
            id,
            cb_checked: cb.checked,
            registry_present: Array.isArray(window._ktaImageOverlays),
            registry_len: (window._ktaImageOverlays || []).length,
            registry_ids: (window._ktaImageOverlays || []).map(function(e) { return e.id; }),
            map_ready: !!window.map
          });
        } catch(e) {}
        if (!Array.isArray(window._ktaImageOverlays) || !window.map) {
          try { console.warn("[FilterPanel v1.34.6-debug] EARLY RETURN — pas de registry ou map"); } catch(e) {}
          return;
        }
        const entry = window._ktaImageOverlays.find(function(e) { return e.id === id; });
        if (!entry || !entry.overlay) {
          try { console.warn("[FilterPanel v1.34.6-debug] EARLY RETURN — entry/overlay introuvable", { id, entry: !!entry }); } catch(e) {}
          return;
        }
        try {
          console.log("[FilterPanel v1.34.6-debug] toggling imageLayer", {
            id,
            checked: cb.checked,
            hasLayerBefore: window.map.hasLayer(entry.overlay)
          });
        } catch(e) {}
        if (cb.checked) { try { window.map.addLayer(entry.overlay); } catch(e) { try { console.error("[FilterPanel] addLayer threw", e); } catch(_) {} } }
        else            { try { window.map.removeLayer(entry.overlay); } catch(e) { try { console.error("[FilterPanel] removeLayer threw", e); } catch(_) {} } }
        try { console.log("[FilterPanel v1.34.6-debug] toggled — hasLayerAfter:", window.map.hasLayer(entry.overlay)); } catch(e) {}
      });
    });

    // === Data layers ===
    overlay.querySelectorAll('[data-data-layer]').forEach(function(cb) {
      cb.addEventListener("change", function() {
        const id = cb.getAttribute("data-data-layer");
        const grp = (window.dataLayerGroups || {})[id];
        if (!grp || !window.map) return;
        if (cb.checked) { try { window.map.addLayer(grp); } catch(e) {} }
        else            { try { window.map.removeLayer(grp); } catch(e) {} }
      });
    });

    // === Niveaux : actif (segmented) ===
    overlay.querySelectorAll('[data-lvl-active]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const lvl = parseInt(btn.getAttribute("data-lvl-active"), 10);
        if (isNaN(lvl) || !window.APP_CONFIG) return;
        window.APP_CONFIG.activeLevel = lvl;
        // Update UI segmented
        overlay.querySelectorAll('[data-lvl-active]').forEach(function(b) {
          b.classList.toggle("kta-fp-lvl-btn-active", b === btn);
        });
        // Notify l'ancienne modale via le callback existant
        if (typeof window._onLevelChange === "function") {
          try { window._onLevelChange("active", lvl); } catch(e) {}
        }
      });
    });

    // === Niveaux : visibles (chips multi) ===
    overlay.querySelectorAll('[data-lvl-visible]').forEach(function(cb) {
      cb.addEventListener("change", function() {
        _updateVisibleLevelsFromUI(overlay);
      });
    });

    // === Quick actions niveaux ===
    overlay.querySelectorAll('[data-action="lvl-all"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const avail = window.APP_CONFIG && Array.isArray(window.APP_CONFIG.availableLevels)
                      ? window.APP_CONFIG.availableLevels : [];
        overlay.querySelectorAll('[data-lvl-visible]').forEach(function(cb) { cb.checked = true; });
        if (window.APP_CONFIG) window.APP_CONFIG.visibleLevels = avail.slice();
        if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
        if (typeof window._onLevelChange === "function") window._onLevelChange("visible", avail);
        _refreshChipsState(overlay);
      });
    });
    overlay.querySelectorAll('[data-action="lvl-active-only"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const active = window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number"
                       ? window.APP_CONFIG.activeLevel : 0;
        overlay.querySelectorAll('[data-lvl-visible]').forEach(function(cb) {
          cb.checked = (parseInt(cb.getAttribute("data-lvl-visible"), 10) === active);
        });
        if (window.APP_CONFIG) window.APP_CONFIG.visibleLevels = [active];
        if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
        if (typeof window._onLevelChange === "function") window._onLevelChange("visible", [active]);
        _refreshChipsState(overlay);
      });
    });

    // === Tags + Types (set-based) ===
    overlay.querySelectorAll('[data-set][data-type]').forEach(function(cb) {
      cb.addEventListener("change", function() {
        const setName = cb.getAttribute("data-set");
        const type    = cb.getAttribute("data-type");
        _toggle(setName, type, cb.checked);
        _refreshChipsState(overlay);
        _updateStatus();
      });
    });

    // === Mini actions "Tout / Aucun" par section ===
    overlay.querySelectorAll('[data-action="show-all"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _toggleAll(btn.getAttribute("data-set"), true);
        // Refresh UI : check toutes les boxes de cette section
        const setName = btn.getAttribute("data-set");
        overlay.querySelectorAll('[data-set="' + setName + '"][data-type]').forEach(function(cb) { cb.checked = true; });
        _refreshChipsState(overlay);
        _updateStatus();
      });
    });
    overlay.querySelectorAll('[data-action="hide-all"]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        _toggleAll(btn.getAttribute("data-set"), false);
        const setName = btn.getAttribute("data-set");
        overlay.querySelectorAll('[data-set="' + setName + '"][data-type]').forEach(function(cb) { cb.checked = false; });
        _refreshChipsState(overlay);
        _updateStatus();
      });
    });

    // === Reset all ===
    const resetBtn = document.getElementById("kta-fp-reset-all");
    if (resetBtn) {
      resetBtn.addEventListener("click", function() {
        const f = window._ktaRuntimeFilters;
        f.tags = null; f.roadTypes = null; f.zoneTypes = null; f.structTypes = null;
        _scheduleApply();
        _notify();
        // Recoche toutes les checkboxes runtime
        overlay.querySelectorAll('[data-set][data-type]').forEach(function(cb) { cb.checked = true; });
        // 🐛 v1.34.6 — Fix bug confirmé : "Tout afficher" ne touchait PAS les
        // image layers ni les data layers. L'utilisateur attendait un reset
        // complet (toutes les couches re-visibles) — uniquement les chips
        // tags/types étaient remises à zéro. Maintenant on dispatch un event
        // `change` synthétique sur chaque checkbox imageLayer/dataLayer pour
        // déclencher le handler existant (qui appelle map.addLayer).
        overlay.querySelectorAll('[data-img-layer]').forEach(function(cb) {
          if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); }
        });
        overlay.querySelectorAll('[data-data-layer]').forEach(function(cb) {
          if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); }
        });
        _refreshChipsState(overlay);
        _updateStatus();
      });
    }
  }

  function _updateVisibleLevelsFromUI(overlay) {
    const arr = [];
    overlay.querySelectorAll('[data-lvl-visible]').forEach(function(cb) {
      if (cb.checked) {
        const lvl = parseInt(cb.getAttribute("data-lvl-visible"), 10);
        if (!isNaN(lvl)) arr.push(lvl);
      }
    });
    if (window.APP_CONFIG) window.APP_CONFIG.visibleLevels = arr;
    if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    if (typeof window._onLevelChange === "function") {
      try { window._onLevelChange("visible", arr); } catch(e) {}
    }
  }

  function _refreshChipsState(overlay) {
    overlay.querySelectorAll(".kta-fp-chip").forEach(function(lbl) {
      const cb = lbl.querySelector("input[type=checkbox]");
      if (!cb) return;
      lbl.classList.toggle("kta-fp-chip-off", !cb.checked);
    });
  }

  function _updateStatus() {
    const el = document.getElementById("kta-fp-status");
    if (!el) return;
    const f = window._ktaRuntimeFilters;
    const active = [];
    if (f.tags        !== null) active.push("tags");
    if (f.roadTypes   !== null) active.push("tracés");
    if (f.zoneTypes   !== null) active.push("zones");
    if (f.structTypes !== null) active.push("structures");
    if (active.length === 0) {
      el.textContent = "Aucun filtre actif";
      el.style.color = "#8892a4";
    } else {
      el.textContent = "Filtres actifs : " + active.join(", ");
      el.style.color = "#f4c542";
    }
  }

  function _onKey(e) {
    if (e.key === "Escape") fermer();
  }

  function fermer() {
    document.removeEventListener("keydown", _onKey);
    if (_modal && _modal.parentNode) _modal.parentNode.removeChild(_modal);
    _modal = null;
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function _escHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function _escAttr(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  // ============================================================
  // EXPORT
  // ============================================================
  window.FilterPanel = {
    ouvrir:        ouvrir,
    fermer:        fermer,
    getState:      getState,
    setFilters:    setFilters,
    onChange:      onChange,
    applyFilters:  applyFilters,
    isVisible:     isVisible,
    onLevelChange: onLevelChange
  };

  console.log("[FilterPanel] Module chargé.");
})();
