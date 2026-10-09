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

  // 🚨 Q34/Q35 (audit ergonomie 13/09/2026) : un filtre actif n'était visible
  // QUE dans le pied de la modale, et « Tout afficher » oubliait les niveaux
  // en affirmant « Aucun filtre actif ». Sous terre, un POI masqué se lit
  // « il n'existe pas ». Le bouton ≡ porte désormais une pastille avec le
  // nombre de filtres actifs (tags / tracés / zones / structures / niveaux).
  function _niveauxFiltres() {
    const c = window.APP_CONFIG;
    if (!c || c.multiLevel !== true) return false;
    if (!Array.isArray(c.availableLevels) || !Array.isArray(c.visibleLevels)) return false;
    return c.availableLevels.some(function(l) { return c.visibleLevels.indexOf(l) < 0; });
  }
  function _nbFiltresActifs() {
    const f = window._ktaRuntimeFilters || {};
    let n = 0;
    if (f.tags        !== null && f.tags        !== undefined) n++;
    if (f.roadTypes   !== null && f.roadTypes   !== undefined) n++;
    if (f.zoneTypes   !== null && f.zoneTypes   !== undefined) n++;
    if (f.structTypes !== null && f.structTypes !== undefined) n++;
    if (_niveauxFiltres()) n++;
    return n;
  }
  function majBadge() {
    const a = document.querySelector(".kta-filter-ctrl a");
    if (!a) return;
    const n = _nbFiltresActifs();
    a.classList.toggle("kta-filter-ctrl-actif", n > 0);
    // 🔵 14/09/2026 (KARMA) — UN POINT, PAS UN CHIFFRE. `n` compte les
    // CATÉGORIES filtrées (points, tracés, zones, structures, niveaux), pas
    // les objets masqués : décocher un seul type ou vingt affichait « 1 ».
    // Un chiffre qui ne mesure pas ce qu'on croit est pire que pas de chiffre.
    // Le point dit « quelque chose est masqué », ce qui est exactement le
    // besoin ; le compte reste disponible, dans l'infobulle.
    if (n > 0) {
      a.setAttribute("data-filtre-actif", "1");
      a.setAttribute("title", window.I18n.t("filter.badge.actifs", { n: n }));
    } else {
      a.removeAttribute("data-filtre-actif");
      a.setAttribute("title", window.I18n.t("filter.badge.aucun"));
    }
    a.removeAttribute("data-count");   // legacy : le chiffre ne revient pas par la bande
  }

  function _notify() {
    _listeners.forEach(function(cb) {
      try { cb(window._ktaRuntimeFilters); } catch(e) {}
    });
    majBadge();
  }

  function _scheduleApply() {
    if (_applyTimer) clearTimeout(_applyTimer);
    _applyTimer = setTimeout(function() {
      _applyTimer = null;
      applyFilters();
    }, 200);
  }

  // 🐛 v1.44.1 — Recalcul des roads/intersections après toggle d'un calque
  // DATA. Contexte : road.js écoute `overlayadd`/`overlayremove` (événements
  // émis par le contrôle de couches Leaflet NATIF) pour recalculer les
  // cercles d'intersection quand un calque devient visible/masqué. Or depuis
  // la refonte Filtres (v1.21.5), le toggle passe par CE panel qui fait
  // `map.addLayer/removeLayer` DIRECTEMENT → aucun événement émis → les
  // cercles d'intersection des roads embarquées du calque masqué restaient
  // affichés. Fix : on déclenche explicitement renderRoads() après le toggle.
  // Coalescé à 150 ms : le bouton « Tout afficher » (reset-all) dispatch un
  // event `change` synthétique PAR checkbox → sans coalescing on ferait
  // N renderRoads d'affilée (O(N²) chacun sur plan dense).
  let _roadsRecalcTimer = null;
  function _scheduleRoadsRecalc() {
    if (_roadsRecalcTimer) return;
    _roadsRecalcTimer = setTimeout(function() {
      _roadsRecalcTimer = null;
      if (typeof window.renderRoads === "function") {
        try { window.renderRoads(); } catch(e) {
          console.warn("[FilterPanel] renderRoads post-toggle calque erreur :", e);
        }
      }
    }, 150);
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

  // 🆕 v1.43.26 — Refacto event delegation : au lieu de re-binder tous les
  // boutons à chaque onLevelChange (qui faisait un innerHTML reflow + multi
  // attaches de listeners sur les nouveaux noeuds), on attache UN SEUL
  // listener click/change sur `sec` (le conteneur de section M-LVL, jamais
  // remplacé). Comme la délégation lit `e.target.closest(...)`, ça continue
  // de marcher après chaque innerHTML rebuild du body — sans accumulation
  // de listeners.
  function _bindLevelHandlers(scope) {
    // Guard contre double-bind (sec ne change pas, donc 1 seul listener
    // suffit pour toute la vie de la modale Filtres).
    if (scope._levelHandlersBound) return;
    scope._levelHandlersBound = true;

    scope.addEventListener("click", function(e) {
      // Actif level (chips numérotés "0", "1", "2"…)
      const btnActive = e.target.closest('[data-lvl-active]');
      if (btnActive && scope.contains(btnActive)) {
        const lvl = parseInt(btnActive.getAttribute("data-lvl-active"), 10);
        if (isNaN(lvl) || !window.APP_CONFIG) return;
        // 🆕 v1.74.0 : passe par le helper unique (avant : écriture directe de
        // activeLevel + notify d'un callback _onLevelChange jamais défini →
        // ni pastille ni modules rafraîchis depuis cette modale).
        if (typeof window.ktaSetActiveLevel === "function") {
          window.ktaSetActiveLevel(lvl, { source: "modale-filtres" });
        } else {
          window.APP_CONFIG.activeLevel = lvl;   // repli si interfaceConfig absent
        }
        scope.querySelectorAll('[data-lvl-active]').forEach(function(b) {
          b.classList.toggle("kta-fp-lvl-btn-active", b === btnActive);
        });
        // Le niveau a pu s'AJOUTER aux visibles (union) → resync des cases.
        _refreshChipsState(_modal);
        return;
      }
      // Quick action "Tous"
      const btnAll = e.target.closest('[data-action="lvl-all"]');
      if (btnAll && scope.contains(btnAll)) {
        const avail = window.APP_CONFIG && Array.isArray(window.APP_CONFIG.availableLevels)
                      ? window.APP_CONFIG.availableLevels : [];
        scope.querySelectorAll('[data-lvl-visible]').forEach(function(cb) { cb.checked = true; });
        if (window.APP_CONFIG) window.APP_CONFIG.visibleLevels = avail.slice();
        if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
        if (typeof window._onLevelChange === "function") window._onLevelChange("visible", avail);
        _refreshChipsState(_modal);
        return;
      }
      // Quick action "Actif seul"
      const btnOnly = e.target.closest('[data-action="lvl-active-only"]');
      if (btnOnly && scope.contains(btnOnly)) {
        const active = window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number"
                       ? window.APP_CONFIG.activeLevel : 0;
        scope.querySelectorAll('[data-lvl-visible]').forEach(function(cb) {
          cb.checked = (parseInt(cb.getAttribute("data-lvl-visible"), 10) === active);
        });
        if (window.APP_CONFIG) window.APP_CONFIG.visibleLevels = [active];
        if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
        if (typeof window._onLevelChange === "function") window._onLevelChange("visible", [active]);
        _refreshChipsState(_modal);
        return;
      }
    });

    scope.addEventListener("change", function(e) {
      const cb = e.target.closest('[data-lvl-visible]');
      if (cb && scope.contains(cb)) {
        _updateVisibleLevelsFromUI(_modal);
      }
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
  // 🐛 v1.76.0 (F11) — `getLabel` ne consulte QUE les libellés des types
  // built-in : pour un type CUSTOM elle rendait la clé brute, et la puce du
  // filtre affichait `cust-m2k9x-3fa` au lieu du nom choisi. Il faut passer par
  // `findCustomEntry`, comme le font déjà refonteInterface.js, statsGlobales.js
  // et pathfinder.js — ce module était le seul à l'avoir oublié.
  function _lcLabel(category, type, fallback) {
    const LC = window.LegendCustomization;
    // 🧷 v1.76.1 — findCustomEntry pour TOUT type non résolu par getLabel
    // (plus seulement `cust-`) : une entrée liée à un id technique (« Bas »)
    // doit afficher son libellé ici aussi.
    if (LC && typeof LC.findCustomEntry === "function") {
      try {
        const e = LC.findCustomEntry(type);
        if (e && e.label) return "✨ " + e.label;
      } catch(err) {}
      if (String(type).indexOf("cust-") === 0) return fallback || type;
    }
    if (LC && typeof LC.getLabel === "function") {
      try {
        const lbl = LC.getLabel(category, type);
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
      return '<div class="kta-fp-section-empty">' + _escHtml(window.I18n.t("filter.empty.points")) + '</div>';
    }
    let html = '<div class="kta-fp-row-actions">' +
                 '<button class="kta-fp-mini-btn" data-action="show-all" data-set="tags">' + window.I18n.t("filter.action.showAll") + '</button>' +
                 '<button class="kta-fp-mini-btn" data-action="hide-all" data-set="tags">' + window.I18n.t("filter.action.hideAll") + '</button>' +
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
      return '<div class="kta-fp-section-empty">' + _escHtml(window.I18n.t("filter.empty.items")) + '</div>';
    }
    // Tri : builtin en premier dans l'ordre déclaré, puis customs alphabétique
    const sortedKeys = [];
    (builtinOrder || []).forEach(function(t) { if (counts[t] != null) sortedKeys.push(t); });
    universe.filter(function(t) { return !(builtinOrder || []).includes(t); })
            .sort(function(a, b) { return String(a).localeCompare(String(b)); })
            .forEach(function(t) { sortedKeys.push(t); });

    let html = '<div class="kta-fp-row-actions">' +
                 '<button class="kta-fp-mini-btn" data-action="show-all" data-set="' + setName + '">' + window.I18n.t("filter.action.showAll") + '</button>' +
                 '<button class="kta-fp-mini-btn" data-action="hide-all" data-set="' + setName + '">' + window.I18n.t("filter.action.hideAll") + '</button>' +
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
      return '<div class="kta-fp-section-empty">' + _escHtml(window.I18n.t("filter.empty.imageLayers")) + '</div>';
    }
    let html = '<div class="kta-fp-list">';
    pc.imageLayers.forEach(function(lc, idx) {
      // 🩹 v1.34.5 — KARMA bug prod v1.34.3 : check imageLayer → close →
      // reopen → unchecked. Cause initiale supposée : mismatch d'id si
      // plan-config sans `id`. Fallback `lc.id || lc.label` aligné avec
      // map.js l423. Bénéfice : couvre quand même le cas des vieux plans
      // sans champ `id` (défense en profondeur).
      // 🐛 v1.34.7 — Le vrai bug racine était ailleurs : initDataFromConfig
      // (main.js l39, ancien) vidait `_ktaImageOverlays` JUSTE APRÈS que
      // initMapFromConfig venait de le populer. Fix : retrait du reset
      // dupliqué dans main.js. Le check `hasLayer` ici fonctionne désormais.
      const layerId = lc.id || lc.label;
      const visible = window._ktaImageOverlays && Array.isArray(window._ktaImageOverlays)
                      ? (function() {
                          const entry = window._ktaImageOverlays.find(function(e) { return e.id === layerId; });
                          return entry && entry.overlay && window.map && window.map.hasLayer(entry.overlay);
                        })()
                      : (lc.visible !== false);
      const label = lc.label || lc.id || window.I18n.t("filter.layer.default", { idx: idx });
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
      return '<div class="kta-fp-section-empty">' + _escHtml(window.I18n.t("filter.empty.dataLayers")) + '</div>';
    }
    const pc = window.PLAN_CONFIG;
    const cfg = (pc && Array.isArray(pc.dataLayers)) ? pc.dataLayers : [];
    // 🔄 v1.85.0 — RAPATRIEMENT EN SESSION (cf. js/calqueSession.js).
    // Un calque de données est en LECTURE SEULE et rendu UNE seule fois : pour
    // y corriger quoi que ce soit il faut amener son contenu dans la session,
    // là où `renderRoads`/`renderZones`/`renderStructures` savent redessiner.
    // Cette section est le seul point de contrôle de la visibilité d'un calque
    // — le verrou se pose donc ICI, et nulle part ailleurs, sinon deux
    // contrôles se disputent le même état.
    const CS = window.CalqueSession;
    let html = '<div class="kta-fp-list">';
    ids.forEach(function(id) {
      const visible = window.map && window.map.hasLayer(groups[id]);
      const lc = cfg.find(function(d) { return d.id === id; });
      const label = (lc && lc.label) || (id === "editor" ? window.I18n.t("filter.dataLayer.editor") : id);
      // Le calque « editor » EST la session : le rapatrier n'aurait aucun sens.
      const rapatriable = !!(CS && lc && lc.file && id !== "editor");
      const rapatrie    = !!(CS && CS.estRapatrie(id));
      html += '<div class="kta-fp-calque-ligne">' +
                '<label class="kta-fp-row-cb">' +
                  '<input type="checkbox" data-data-layer="' + _escAttr(id) + '"' + (visible ? " checked" : "") + '>' +
                  '<span>📊 ' + _escHtml(label) +
                    (rapatrie ? ' <em class="kta-fp-calque-remplace">'
                                + _escHtml(window.I18n.t("filter.calque.remplace")) + '</em>' : '') +
                  '</span>' +
                '</label>' +
                // 💾 Exporter ne s'affiche que sur un calque rapatrié : c'est
                // ce qui ferme la boucle vers le ZIP. Un fichier, à déposer sur
                // la ligne de CE calque dans « Modifier un plan » — la ligne
                // étant le calque, aucun doublon n'est possible.
                (rapatrie
                  ? '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small kta-fp-calque-btn" ' +
                      'data-calque-exporter="' + _escAttr(id) + '" ' +
                      'title="' + _escAttr(window.I18n.t("filter.calque.exporterTitle")) + '">' +
                      _escHtml(window.I18n.t("filter.calque.exporter")) +
                    '</button>'
                  : '') +
                (rapatriable
                  ? '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small kta-fp-calque-btn" ' +
                      (rapatrie ? 'data-calque-restituer="' : 'data-calque-rapatrier="') + _escAttr(id) + '" ' +
                      'title="' + _escAttr(window.I18n.t(rapatrie ? "filter.calque.restituerTitle"
                                                                 : "filter.calque.rapatrierTitle")) + '">' +
                      _escHtml(window.I18n.t(rapatrie ? "filter.calque.restituer" : "filter.calque.rapatrier")) +
                    '</button>'
                  : '') +
              '</div>';
    });
    html += '</div>';
    return html;
  }

  // 🔄 v1.85.0 — re-rend la SEULE section des calques. Un `ouvrir()` complet
  // refermerait les `<details>` que l'utilisateur a repliés et perdrait sa
  // position de défilement : après un rapatriement, on ne redessine que ce
  // qui a changé.
  function refreshDataLayers() {
    if (!_modal) return;
    const sec = _modal.querySelector("#kta-fp-sec-data .kta-fp-section-body");
    if (!sec) return;
    sec.innerHTML = _renderDataLayersSection();
  }

  function _renderLevelsSection() {
    const isML = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    if (!isML) {
      return '<div class="kta-fp-section-empty">' + _escHtml(window.I18n.t("filter.levels.mono")) + '</div>';
    }
    const avail = Array.isArray(window.APP_CONFIG.availableLevels)
                  ? window.APP_CONFIG.availableLevels.slice().sort(function(a, b) { return a - b; })
                  : [-2, -1, 0, 1, 2];
    const visible = Array.isArray(window.APP_CONFIG.visibleLevels) ? window.APP_CONFIG.visibleLevels : [0];
    const active  = (typeof window.APP_CONFIG.activeLevel === "number") ? window.APP_CONFIG.activeLevel : 0;
    let html = '<div class="kta-fp-lvl-active">';
    html += '<span class="kta-fp-sublabel">' + _escHtml(window.I18n.t("filter.levels.activeLabel")) + '</span>';
    html += '<div class="kta-fp-lvl-segmented">';
    avail.forEach(function(lvl) {
      const lblTxt = (lvl === 0) ? window.I18n.t("filter.levels.ground") : (lvl > 0 ? "+" + lvl : String(lvl));
      const isActive = (lvl === active);
      html += '<button type="button" class="kta-fp-lvl-btn ' + (isActive ? "kta-fp-lvl-btn-active" : "") +
              '" data-lvl-active="' + lvl + '">' + lblTxt + '</button>';
    });
    html += '</div></div>';

    html += '<div class="kta-fp-lvl-visible">';
    html += '<span class="kta-fp-sublabel">' + _escHtml(window.I18n.t("filter.levels.visibleLabel")) + '</span>';
    html += '<div class="kta-fp-row-actions">' +
              '<button class="kta-fp-mini-btn" data-action="lvl-all">' + window.I18n.t("filter.levels.allBtn") + '</button>' +
              '<button class="kta-fp-mini-btn" data-action="lvl-active-only">' + window.I18n.t("filter.levels.activeOnlyBtn") + '</button>' +
            '</div>';
    html += '<div class="kta-fp-chips-grid">';
    avail.forEach(function(lvl) {
      const lblTxt = (lvl === 0) ? window.I18n.t("filter.levels.ground") : (lvl > 0 ? "+" + lvl : String(lvl));
      const isVis = visible.indexOf(lvl) >= 0;
      html += '<label class="kta-fp-chip ' + (isVis ? "" : "kta-fp-chip-off") + '">' +
                '<input type="checkbox" data-lvl-visible="' + lvl + '"' + (isVis ? " checked" : "") + '>' +
                '<span class="kta-fp-chip-label">' + window.I18n.t("filter.levels.chip", { lvl: lblTxt }) + '</span>' +
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
          '<span class="kta-readme-modal-titre">' + window.I18n.t("filter.modal.titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-fp-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-fp-corps">' +
          _renderAllSections() +
        '</div>' +
        '<div class="kta-fp-footer">' +
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-fp-reset-all">' + window.I18n.t("filter.footer.resetAll") + '</button>' +
          '<span class="kta-fp-status" id="kta-fp-status"></span>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(_modal);
    _bindModalHandlers();
    _updateStatus();
  }

  function _renderAllSections() {
    return _section(window.I18n.t("filter.section.imageLayers"),  "img",     _renderImageLayersSection()) +
           _section(window.I18n.t("filter.section.dataLayers"),   "data",    _renderDataLayersSection()) +
           _section(window.I18n.t("filter.section.levels"),       "lvl",     _renderLevelsSection()) +
           _section(window.I18n.t("filter.section.tags"),         "tags",    _renderTagsSection()) +
           _section(window.I18n.t("filter.section.roadTypes"),    "roads",   _renderTypesSection("roads",      "roadTypes",   ["principal", "secondaire", "chemin", "jonction"])) +
           _section(window.I18n.t("filter.section.zoneTypes"),    "zones",   _renderTypesSection("zones",      "zoneTypes",   ["eau", "remblais", "effondrement", "inaccessible"])) +
           _section(window.I18n.t("filter.section.structTypes"),  "structs", _renderTypesSection("structures", "structTypes", ["pilier-1", "pilier-2", "mur", "front-1", "front-2"]));
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

    // 🆕 v1.43.27 (Pattern 2 — extension du refactor M-LVL v1.43.26) :
    // event delegation sur `overlay` pour les sections Image / Data / Tags /
    // show-all / hide-all. Avant : N listeners individuels par section
    // (cb.addEventListener × ~30 checkboxes). Maintenant : 2 listeners
    // mutualisés (1 change, 1 click) qui dispatchent via e.target.dataset.
    // Bénéfice : moins de bind à chaque ouvrir() + cohérence avec le pattern
    // M-LVL déjà délégué (sec via `_bindLevelHandlers` v1.43.26).
    overlay.addEventListener("change", function(e) {
      const t = e.target;
      if (!t || !t.matches) return;
      // === Image layers ===
      if (t.matches('[data-img-layer]')) {
        const id = t.getAttribute("data-img-layer");
        if (!Array.isArray(window._ktaImageOverlays) || !window.map) return;
        const entry = window._ktaImageOverlays.find(function(e) { return e.id === id; });
        if (!entry || !entry.overlay) return;
        if (t.checked) { try { window.map.addLayer(entry.overlay); } catch(_) {} }
        else           { try { window.map.removeLayer(entry.overlay); } catch(_) {} }
        return;
      }
      // === Data layers ===
      if (t.matches('[data-data-layer]')) {
        const id = t.getAttribute("data-data-layer");
        const grp = (window.dataLayerGroups || {})[id];
        if (!grp || !window.map) return;
        if (t.checked) { try { window.map.addLayer(grp); } catch(_) {} }
        else           { try { window.map.removeLayer(grp); } catch(_) {} }
        // 🐛 v1.44.1 — recalcule roads + cercles d'intersection (les roads
        // embarquées du calque masqué doivent disparaître du calcul, cf.
        // _scheduleRoadsRecalc pour le contexte complet).
        _scheduleRoadsRecalc();
        return;
      }
      // === Tags + Types (set-based) ===
      if (t.matches('[data-set][data-type]')) {
        const setName = t.getAttribute("data-set");
        const type    = t.getAttribute("data-type");
        _toggle(setName, type, t.checked);
        _refreshChipsState(overlay);
        _updateStatus();
        return;
      }
    });

    // === Niveaux : actif (segmented) ===
    overlay.querySelectorAll('[data-lvl-active]').forEach(function(btn) {
      btn.addEventListener("click", function() {
        const lvl = parseInt(btn.getAttribute("data-lvl-active"), 10);
        if (isNaN(lvl) || !window.APP_CONFIG) return;
        // 🆕 v1.74.0 : helper unique (cf. _bindLevelHandlers, même correctif).
        if (typeof window.ktaSetActiveLevel === "function") {
          window.ktaSetActiveLevel(lvl, { source: "modale-filtres" });
        } else {
          window.APP_CONFIG.activeLevel = lvl;
        }
        // Update UI segmented
        overlay.querySelectorAll('[data-lvl-active]').forEach(function(b) {
          b.classList.toggle("kta-fp-lvl-btn-active", b === btn);
        });
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

    // 🆕 v1.43.27 — Tags+Types délégués via le listener `change` sur overlay
    // (cf. bloc plus haut). Plus de forEach individuel.

    // === Mini actions "Tout / Aucun" par section — délégation click ===
    overlay.addEventListener("click", function(e) {
      const t = e.target;
      if (!t || !t.matches) return;
      // === Calques : rapatriement en session / restitution / export (v1.85.0) ===
      // 🩸 ICI, et pas dans le listener `change` juste au-dessus : ce sont des
      // <button>, et un bouton n’emet JAMAIS `change`. Places la-bas, ils
      // etaient morts SILENCIEUSEMENT — aucune erreur console, juste rien au
      // clic. C’est KARMA qui l’a vu a l’ecran, pas la relecture.
      if (t.matches('[data-calque-rapatrier]')) {
        _rapatrierCalque(t.getAttribute("data-calque-rapatrier"));
        return;
      }
      if (t.matches('[data-calque-restituer]')) {
        _restituerCalque(t.getAttribute("data-calque-restituer"));
        return;
      }
      if (t.matches('[data-calque-exporter]')) {
        _exporterCalque(t.getAttribute("data-calque-exporter"));
        return;
      }
      if (t.matches('[data-action="show-all"]') || t.matches('[data-action="hide-all"]')) {
        const wantShow = t.matches('[data-action="show-all"]');
        const setName  = t.getAttribute("data-set");
        _toggleAll(setName, wantShow);
        overlay.querySelectorAll('[data-set="' + setName + '"][data-type]').forEach(function(cb) {
          cb.checked = wantShow;
        });
        _refreshChipsState(overlay);
        _updateStatus();
      }
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
        // 🚨 Q35 : les NIVEAUX aussi (même chemin que « 👁️ Tous »). Avant, le
        // seul bouton de réinitialisation laissait des étages masqués tout en
        // affichant « Aucun filtre actif ».
        if (_niveauxFiltres()) {
          const avail = window.APP_CONFIG && Array.isArray(window.APP_CONFIG.availableLevels)
                        ? window.APP_CONFIG.availableLevels : [];
          overlay.querySelectorAll('[data-lvl-visible]').forEach(function(cb) { cb.checked = true; });
          if (window.APP_CONFIG) window.APP_CONFIG.visibleLevels = avail.slice();
          if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
          if (typeof window._onLevelChange === "function") window._onLevelChange("visible", avail);
        }
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
    if (f.tags        !== null) active.push(window.I18n.t("filter.status.tags"));
    if (f.roadTypes   !== null) active.push(window.I18n.t("filter.status.roads"));
    if (f.zoneTypes   !== null) active.push(window.I18n.t("filter.status.zones"));
    if (f.structTypes !== null) active.push(window.I18n.t("filter.status.structs"));
    if (_niveauxFiltres())      active.push(window.I18n.t("filter.status.levels"));   // Q35
    majBadge();
    if (active.length === 0) {
      el.textContent = window.I18n.t("filter.status.none");
      el.style.color = "#8892a4";
    } else {
      el.textContent = window.I18n.t("filter.status.active", { list: active.join(", ") });
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
  // 🔄 v1.85.0 — RAPATRIEMENT D'UN CALQUE EN SESSION
  // ============================================================
  // ⚠️ ON ANNONCE LE COÛT AVANT. Mesuré le 04/09 sur les relevés Gironde :
  // 225 octets par objet, donc ~1,1 Mo pour un relevé SIG de 5 000 objets —
  // quand `localStorage` plafonne vers 5 Mo POUR TOUT LE DOMAINE et que
  // `SessionPersist` re-sérialise la session entière à chaque sauvegarde.
  // Découvrir ça au `QuotaExceededError`, c'est le découvrir une fois la
  // session perdue. D'où la pesée, et l'occupation réelle dans le message.
  function _fmtOctets(o) {
    if (!Number.isFinite(o)) return "?";
    return (o >= 1048576) ? (o / 1048576).toFixed(2) + " Mo"
                          : Math.round(o / 1024) + " ko";
  }

  function _rapatrierCalque(id) {
    const CS = window.CalqueSession;
    if (!CS || !id) return;
    CS.peser(id).then(async function(p) {
      if (!p) { window.ktaAlerte(window.I18n.t("filter.calque.errPesee"), { type: "erreur" }); return; }
      const occ = CS.occupationLocalStorage();
      const msg = window.I18n.t("filter.calque.confirm", {
        label:  window.ktaEsc(p.label),
        n:      p.objets,
        poids:  _fmtOctets(p.octets),
        occup:  (occ === null) ? "?" : _fmtOctets(occ)
      });
      if (!(await window.ktaConfirm(msg))) return;
      CS.rapatrier(id).then(function(r) {
        if (!r || !r.ok) {
          window.ktaAlerte(window.I18n.t("filter.calque.err", { code: (r && r.code) || "?" }), { type: "erreur" });
          return;
        }
        refreshDataLayers();
        _scheduleRoadsRecalc();
        _updateStatus();
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(window.I18n.t("filter.calque.okRapatrie", { n: r.total }), "info");
        }
      });
    });
  }

  // 🩸 CE QUE LA RESTITUTION DÉTRUIT, EXACTEMENT (question KARMA, 05/09) :
  // les objets qui portent la marque du calque — donc **tes corrections
  // dessus**, y compris celles faites avec 🔄 Convertir (la conversion repart
  // de l'objet d'origine, elle conserve la marque). Elle ne touche RIEN
  // d'autre : les structures et tracés que tu as dessinés, ton itinéraire, tes
  // points restent, parce qu'ils ne portent pas cette marque.
  //
  // Le travail perdu peut valoir des heures. On propose donc d'ABORD
  // l'exporter — le fichier produit EST le calque corrigé, prêt à redonner au
  // plan. Deux questions enchaînées plutôt qu'un `confirm` binaire : il faut
  // trois issues (exporter puis restituer · restituer quand même · annuler),
  // et un choix destructeur ne doit pas partager un bouton avec un choix sûr.
  function _restituerCalque(id) {
    const CS = window.CalqueSession;
    if (!CS || !id) return;
    const n = CS.compterCopie(id);
    if (n <= 0) { _restituerVraiment(id); return; }   // rien à perdre

    window.ktaConfirm(window.I18n.t("filter.calque.exportAvantMsg", { n: n }), {
      titre:       window.I18n.t("filter.calque.exportAvantTitre"),
      okLabel:     window.I18n.t("filter.calque.exportAvantOui"),
      cancelLabel: window.I18n.t("filter.calque.exportAvantNon")
    }).then(function (exporter) {
      if (exporter) {   // la consigne d'export se lit AVANT la restitution (ordre de l'alert() bloquant)
        // Restitution SEULEMENT si l'export a réussi : sinon le travail partirait sans copie.
        _exporterCalque(id).then(function (exporte) { if (exporte === true) _restituerVraiment(id); });
        return;
      }
      // Refus d'exporter → on redemande, et là le message dit ce qui se perd.
      window.ktaConfirm(window.I18n.t("filter.calque.confirmRestituer", { n: n }), {
        titre:       window.I18n.t("filter.calque.exportAvantTitre"),
        okLabel:     window.I18n.t("filter.calque.restituerOk"),
        cancelLabel: window.I18n.t("filter.calque.restituerAnnuler")
      }).then(function (ok) { if (ok) _restituerVraiment(id); });
    });
  }

  function _restituerVraiment(id) {
    const CS = window.CalqueSession;
    const r = CS.restituer(id);
    if (!r || !r.ok) {
      window.ktaAlerte(window.I18n.t("filter.calque.err", { code: (r && r.code) || "?" }), { type: "erreur" });
      return;
    }
    refreshDataLayers();
    _scheduleRoadsRecalc();
    _updateStatus();
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(window.I18n.t("filter.calque.okRestitue", { n: r.retires }), "info");
    }
  }

  // 💾 Ferme la boucle vers le ZIP. Le message dit QUOI FAIRE du fichier —
  // sans ça, l'utilisateur se retrouve avec un `.json` dans ses
  // téléchargements et aucune idée de la ligne où le déposer.
  // Rend une Promise<boolean> résolue à la fermeture du message : true = fichier produit. L'appelant
  // ne restitue QUE sur true — un export en échec suivi d'une restitution perdait les objets.
  function _exporterCalque(id) {
    const CS = window.CalqueSession;
    if (!CS || !id) return Promise.resolve(false);
    let r = null;
    try { r = CS.exporterCalque(id); } catch (e) { console.warn("[FilterPanel] export du calque :", e); }
    if (!r || !r.ok) {
      return window.ktaAlerte(window.I18n.t("filter.calque.err", { code: (r && r.code) || "?" }), { type: "erreur" })
        .then(function () { return false; });
    }
    // ⚠️ On ANNONCE les objets créés à la main qui ne sont PAS partis : ils
    // n'appartiennent pas à ce calque, et les verser d'office serait décider
    // à la place de l'utilisateur. Le taire lui ferait croire tout embarqué.
    return window.ktaAlerte(window.I18n.t(r.horsCalque > 0 ? "filter.calque.exporteAvecReste"
                                                          : "filter.calque.exporte",
                                         { nom: r.nom, n: r.total, reste: r.horsCalque, id: id }))
      .then(function () { return true; });
  }

  // ============================================================
  // EXPORT
  // ============================================================
  window.FilterPanel = {
    majBadge:      majBadge,          // 🚨 Q34 : pastille sur ≡ (appelée aussi par le polling du footer)
    nbActifs:      _nbFiltresActifs,
    refresh:       refreshDataLayers,
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
