/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// LOST MODE — mode urgence « Je suis perdu »
// =========================
// Zone la position probable d'une personne perdue : dernière position connue (point, clic carte, tracker)
// + temps écoulé + indices observés (recherche dans nom, description, tags, id).
// Rayon = vitesse × temps (sans marge) ; « dans la zone » = distance euclidienne ≤ rayon ; localisation
// affinée = barycentre des indices dans la zone ; portée réelle sur le réseau (Pathfinder.computeReachable).
// ⚠️ Couleurs choisies pour ne pas se confondre avec zones, routes, itinéraire et distance : zone #ff6b35,
// dernière position #6ce28a, indice dans la zone #b452ff, hors zone #8892a4, portée réseau #ff8080.
// Expose window.LostMode : open(), close({ keepLayers }), isActive(), getState() (Mode Secours), _onPlanSwitch.
// Doc : docs/architecture/secours.md
// =========================

(function() {
  "use strict";

  const DEFAULT_ELAPSED_MIN  = 30;
  const MAX_ELAPSED_MIN      = 90;  // 1h30 — au-delà, mode urgence non pertinent (zone immense)
  const MAX_MATCHES_SHOWN    = 20;

  // Presets alignés sur ceux de l'itinéraire (mêmes km/h, mêmes libellés) ; libellés résolus AU RENDU
  // (_presetLabel/_presetHint → lost.preset.<key>.*).
  const LOST_MODE_PRESETS = {
    blesse:  { kmh: 2, icon: "🤕" },
    lente:   { kmh: 3, icon: "🐌" },
    normale: { kmh: 5, icon: "🚶" },
    rapide:  { kmh: 7, icon: "🏃" }
  };
  const DEFAULT_LOST_PRESET     = "normale";
  const LOST_PRESET_STORAGE_KEY = "myktamap_lost_preset";

  const _initialPreset = (function() {
    try {
      let v = localStorage.getItem(LOST_PRESET_STORAGE_KEY);
      // Ancien preset « bourre » renommé « blesse » : réécrit pour garder le réglage.
      if (v === "bourre") {
        v = "blesse";
        try { localStorage.setItem(LOST_PRESET_STORAGE_KEY, v); } catch(e) {}
      }
      if (v && LOST_MODE_PRESETS[v]) return v;
    } catch(e) {}
    return DEFAULT_LOST_PRESET;
  })();
  const DEFAULT_SPEED_KMH = LOST_MODE_PRESETS[_initialPreset].kmh;

  const COLOR_ZONE      = "#ff6b35";
  const COLOR_MATCH_IN  = "#b452ff";
  // Portée max sur le réseau de routes (rouge clair).
  const COLOR_REACH     = "#ff8080";

  let _active           = false;
  let _lastKnownPos     = null;   // {x, y, level, label}
  let _elapsedMinutes   = DEFAULT_ELAPSED_MIN;
  let _speedKmH         = DEFAULT_SPEED_KMH;
  let _radiusPx         = 0;
  let _radiusMeters     = 0;
  let _matches          = [];     // [{point, layer, hits, distancePx, inZone, label}]
  let _refinedLoc       = null;   // {x, y}
  let _zoneOverflow     = false;  // true si le rayon dépasse la taille du plan
  let _lastClues        = "";     // texte des indices saisis (pour restauration)
  let _currentPreset    = _initialPreset;  // clé du preset actif (blesse/lente/normale/rapide)
  // Débounce de la recherche au scope module : vidé au close, sinon il écrit dans un élément retiré du DOM.
  let _searchTimeout    = null;
  // Pilote ModalLifecycle de la modale.
  let _lc               = null;


  function _setLostPreset(presetKey) {
    if (!LOST_MODE_PRESETS[presetKey]) return false;
    _currentPreset = presetKey;
    _speedKmH      = LOST_MODE_PRESETS[presetKey].kmh;
    try { localStorage.setItem(LOST_PRESET_STORAGE_KEY, presetKey); } catch(e) {}
    return true;
  }

  let _zoneLayer        = null;
  let _lastKnownMarker  = null;
  let _matchMarkers     = [];
  // 🩸 UN seul L.svg() au scope module, retiré dans _clearLayers : en recréer un à chaque _renderOnMap
  // les accumule dans map._layers (fuite mémoire, rendu ralenti à chaque ajustement des critères).
  let _svgRenderer      = null;
  let _refinedCircle    = null;
  let _reachPolyFull    = null;   // polyline multi-segments rouge (segments complets atteints)
  let _reachPolyPartial = null;   // polyline multi-segments rouge (segments tronqués)
  let _reachLeadLine    = null;   // ligne pointillée du point au snap road (cas départ éloigné)
  let _reachStats       = null;   // { fullCount, partialCount, totalReachableDistance, snapDistance, exceedsBudget }

  let _clickModeActive  = false;
  let _clickHandler     = null;

  // ── Helpers ──
  // i18n au RENDU (jamais au load), repli FR.
  function _t(key, params) {
    if (window.I18n && typeof window.I18n.t === "function") {
      return window.I18n.t(key, params);
    }
    return key;
  }
  function _presetLabel(key) { return _t("lost.preset." + key + ".label"); }
  function _presetHint(key)  { return _t("lost.preset." + key + ".hint"); }

  function _scale() {
    return (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
  }

  function _toLatLng(x, y) {
    if (typeof window.convertCoord === "function") {
      return window.convertCoord(x, y);
    }
    const h = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
    return [h - y, x];
  }

  function _euclidean(p1, p2) {
    const dx = p1.x - p2.x, dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Polygone approximant un cercle plutôt que L.circle : en CRS.Simple le rayon de L.circle s'interprète
  // différemment selon la version de Leaflet, et avec preferCanvas les animations CSS ne s'appliquent pas
  // aux paths canvas — un polygone forcé en SVG garde les pulsations.
  function _circleAsPolygon(centerLatLng, radiusInCrsUnits, numPoints) {
    const cy = centerLatLng[0];
    const cx = centerLatLng[1];
    const n = numPoints || 96;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      out.push([cy + Math.sin(a) * radiusInCrsUnits, cx + Math.cos(a) * radiusInCrsUnits]);
    }
    return out;
  }

  function _formatDist(distPx) {
    const distM = distPx / _scale();
    if (typeof window.formatDistance === "function") {
      return window.formatDistance(distM, 0);
    }
    return distM < 1000 ? distM.toFixed(0) + " m" : (distM / 1000).toFixed(2) + " km";
  }

  // ── Rayon de recherche ──
  function _calculerRayon() {
    // distance (m) = km/h × 1000 × min / 60, sans marge : ce que la personne a pu parcourir.
    const distMeters = _speedKmH * 1000 * _elapsedMinutes / 60;
    _radiusMeters = distMeters;
    _radiusPx     = distMeters * _scale();
    return _radiusPx;
  }

  // ── Recherche des indices ──
  // Insensible à la casse et aux accents : NFD sépare les accents (U+0300..U+036F), retirés ensuite.
  function _normalizeStr(s) {
    if (s === null || s === undefined) return "";
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  async function _chercherIndices(queryText) {
    if (!queryText || !queryText.trim()) return [];
    if (!window.SearchPoints || typeof window.SearchPoints.getAllPoints !== "function") {
      console.warn("[LostMode] SearchPoints non disponible");
      return [];
    }

    const tokens = _normalizeStr(queryText)
                    .split(/[\s,;/]+/)
                    .map(function(t) { return t.trim(); })
                    .filter(function(t) { return t.length >= 2; });

    if (tokens.length === 0) return [];

    const all = await window.SearchPoints.getAllPoints();
    const matches = [];

    for (const item of all) {
      const p = item.point || item;
      const layerLabel = item.layerLabel || item.layerId || item.layer || "—";
      const haystack = _normalizeStr([
        p.nom || "", p.id || "",
        p.description || p.desc || "",
        Array.isArray(p.tags) ? p.tags.join(" ") : "",
        layerLabel
      ].join(" "));

      const matchedTokens = tokens.filter(function(t) {
        return haystack.indexOf(t) >= 0;
      });

      if (matchedTokens.length > 0) {
        matches.push({
          point: p,
          layer: layerLabel,
          hits: matchedTokens.length,
          matched: matchedTokens
        });
      }
    }

    // Plus de jetons trouvés d'abord.
    matches.sort(function(a, b) { return b.hits - a.hits; });

    return matches.slice(0, MAX_MATCHES_SHOWN);
  }

  function _annoterMatches(matches) {
    if (!_lastKnownPos) {
      return matches.map(function(m) {
        return Object.assign({}, m, { distancePx: null, inZone: false });
      });
    }
    return matches.map(function(m) {
      const p = m.point;
      const distPx = _euclidean(_lastKnownPos, { x: p.x, y: p.y });
      const inZone = distPx <= _radiusPx;
      return Object.assign({}, m, { distancePx: distPx, inZone: inZone });
    });
  }

  // Barycentre des indices dans la zone.
  function _calculerLocAffinee(matches) {
    const inZone = matches.filter(function(m) { return m.inZone; });
    if (inZone.length === 0) return null;
    let sx = 0, sy = 0;
    inZone.forEach(function(m) { sx += m.point.x; sy += m.point.y; });
    return { x: sx / inZone.length, y: sy / inZone.length, count: inZone.length };
  }

  // ── Rendu carte ──
  function _clearLayers() {
    if (!window.map) return;
    if (_zoneLayer)         { window.map.removeLayer(_zoneLayer);         _zoneLayer = null; }
    if (_lastKnownMarker)   { window.map.removeLayer(_lastKnownMarker);   _lastKnownMarker = null; }
    if (_refinedCircle)     { window.map.removeLayer(_refinedCircle);     _refinedCircle = null; }
    if (_reachPolyFull)     { window.map.removeLayer(_reachPolyFull);     _reachPolyFull = null; }
    if (_reachPolyPartial)  { window.map.removeLayer(_reachPolyPartial);  _reachPolyPartial = null; }
    if (_reachLeadLine)     { window.map.removeLayer(_reachLeadLine);     _reachLeadLine = null; }
    _reachStats = null;
    _matchMarkers.forEach(function(m) { window.map.removeLayer(m); });
    _matchMarkers = [];
    if (_svgRenderer)       { window.map.removeLayer(_svgRenderer);       _svgRenderer = null; }
  }

  function _renderOnMap() {
    if (!window.map || !_lastKnownPos) return;
    _clearLayers();

    const ll = _toLatLng(_lastKnownPos.x, _lastKnownPos.y);

    console.log("[LostMode] === Rendu carte ===");
    console.log("[LostMode] APP_CONFIG.scale =", _scale(), "px/m");
    console.log("[LostMode] APP_CONFIG.imageHeight =",
                (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || "?");
    console.log("[LostMode] Dernière position (plan x,y) =",
                _lastKnownPos.x, _lastKnownPos.y);
    console.log("[LostMode] Center Leaflet (lat,lng) =", ll[0], ll[1]);
    console.log("[LostMode] Rayon mètres =", _radiusMeters,
                "→ rayon px (CRS units) =", _radiusPx);

    if (!isFinite(_radiusPx) || _radiusPx <= 0) {
      console.error("[LostMode] ❌ Rayon invalide :", _radiusPx, "— polygone non créé");
    }

    const polyPoints = _circleAsPolygon(ll, _radiusPx, 96);
    console.log("[LostMode] Polygone : 1er point", polyPoints[0],
                "/ 25e point", polyPoints[24],
                "/ 49e point", polyPoints[48]);

    // Zone en SVG explicite malgré preferCanvas : un polygone canvas ajouté après l'init, hors LayerGroup
    // déclaré, peut ne pas être redessiné. Renderer module-level réutilisé (cf _clearLayers).
    _svgRenderer = L.svg({ padding: 0.5 });
    _svgRenderer.addTo(window.map);
    const svgRenderer = _svgRenderer;  // alias pour rétro-compat des lignes suivantes

    _zoneLayer = L.polygon(polyPoints, {
      color: COLOR_ZONE,
      weight: 6,
      opacity: 0.95,
      fillColor: COLOR_ZONE,
      fillOpacity: 0.22,
      interactive: false,
      renderer: svgRenderer
    });
    try {
      _zoneLayer.addTo(window.map);
      console.log("[LostMode] ✓ Zone polygon addTo(map) OK,",
                  "layer in map?", window.map.hasLayer(_zoneLayer));
      if (_zoneLayer.bringToFront) _zoneLayer.bringToFront();
      if (_zoneLayer._renderer && _zoneLayer._renderer._update) {
        _zoneLayer._renderer._update();
      }
      // Vérification post-attache : la couche existe-t-elle dans le DOM ?
      setTimeout(function() { // lint-ok-modal-lifecycle (diagnostic post-render leaflet, hors lifecycle modale)
        const path = _zoneLayer._path;
        const bbox = path && path.getBoundingClientRect ? path.getBoundingClientRect() : null;
        console.log("[LostMode] Post-render check : _path =", !!path,
                    "bbox =", bbox ? (Math.round(bbox.width) + "×" + Math.round(bbox.height) + " @ " + Math.round(bbox.left) + "," + Math.round(bbox.top)) : "null");
      }, 100);
    } catch(e) {
      console.error("[LostMode] ❌ addTo(map) a throw :", e);
    }

    // Rayon plus grand que le plan : la zone couvre tout l'écran et semble absente → avertissement.
    const W = (window.APP_CONFIG && window.APP_CONFIG.imageWidth)  || 1;
    const H = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 1;
    const planMaxDim = Math.max(W, H);
    _zoneOverflow = (_radiusPx * 2 > planMaxDim);
    console.log("[LostMode] Plan max dim :", planMaxDim, "px → zone overflow ?", _zoneOverflow);

    function _esc(s) { return window.ktaEsc(s); }

    const lastIcon = L.divIcon({
      className: "kta-lost-marker-last",
      html: '<div class="kta-lost-marker-last-inner">📍</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    const lastPopupHtml =
      '<div class="kta-popup-point kta-lost-popup">' +
        '<b>' + _t("lost.popup.lastPos") + '</b>' +
        '<span class="kta-popup-desc">' + _esc(_lastKnownPos.label || "?") + '</span>' +
        '<span class="kta-popup-desc kta-lost-popup-coord">' +
          _t("lost.popup.coords", { x: Math.round(_lastKnownPos.x), y: Math.round(_lastKnownPos.y) }) +
        '</span>' +
      '</div>';
    _lastKnownMarker = L.marker(ll, { icon: lastIcon, zIndexOffset: 1000 })
      .addTo(window.map)
      .bindPopup(lastPopupHtml, { className: "kta-lost-popup-wrapper", autoPan: true });

    // Portée max sur le réseau (Pathfinder.computeReachable), toujours affichée si Pathfinder est là :
    // restreint la zone aux galeries physiquement accessibles, en complément du cercle théorique.
    try {
      if (window.Pathfinder && typeof window.Pathfinder.computeReachable === "function") {
        const reach = window.Pathfinder.computeReachable(_lastKnownPos, _radiusPx);
        _reachStats = {
          fullCount:              reach.fullSegments.length,
          partialCount:           reach.partialSegments.length,
          totalReachableDistance: reach.totalReachableDistance,
          snapDistance:           reach.snapDistance,
          exceedsBudget:          reach.exceedsBudget,
          reason:                 reach.reason || null
        };
        console.log("[LostMode] Reach :", _reachStats);

        // Départ dans le budget : au moins quelques segments.
        if (!reach.exceedsBudget && (reach.fullSegments.length || reach.partialSegments.length)) {
          // Pointillé du départ vers le point de calage s'il est à plus de 5 px (décrochage visible).
          if (reach.snapPoint && reach.snapDistance > 5) {
            _reachLeadLine = L.polyline([
              ll,
              _toLatLng(reach.snapPoint.x, reach.snapPoint.y)
            ], {
              color: COLOR_REACH,
              weight: 2,
              opacity: 0.7,
              dashArray: "4 4",
              interactive: false,
              renderer: svgRenderer,
              className: "kta-lost-reach-lead"
            }).addTo(window.map);
          }

          // UNE polyline multi-segments : N polylines avec drop-shadow font exploser le compositing GPU sur
          // mobile.
          if (reach.fullSegments.length > 0) {
            const fullLatLngs = reach.fullSegments.map(function(seg) {
              return [_toLatLng(seg[0].x, seg[0].y), _toLatLng(seg[1].x, seg[1].y)];
            });
            _reachPolyFull = L.polyline(fullLatLngs, {
              color: COLOR_REACH,
              weight: 5,
              opacity: 0.85,
              interactive: false,
              renderer: svgRenderer,
              className: "kta-lost-reach-polyline"
            }).addTo(window.map);
          }

          if (reach.partialSegments.length > 0) {
            const partLatLngs = reach.partialSegments.map(function(seg) {
              return [_toLatLng(seg[0].x, seg[0].y), _toLatLng(seg[1].x, seg[1].y)];
            });
            _reachPolyPartial = L.polyline(partLatLngs, {
              color: COLOR_REACH,
              weight: 5,
              opacity: 0.85,
              interactive: false,
              renderer: svgRenderer,
              className: "kta-lost-reach-polyline"
            }).addTo(window.map);
          }
        }
        // Départ loin de toute route : cercle seul (le rapport dit « Aucune route accessible »).
      }
    } catch(e) {
      console.warn("[LostMode] Pathfinder.computeReachable échec :", e);
      _reachStats = null;
    }

    _matches.forEach(function(m) {
      const cls = m.inZone ? "kta-lost-marker-match-in" : "kta-lost-marker-match-out";
      const sym = m.inZone ? "🔮" : "·";
      const ic = L.divIcon({
        className: cls,
        html: '<div class="' + cls + '-inner">' + sym + '</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const statusBadge = m.inZone
        ? '<span class="kta-lost-popup-badge kta-lost-popup-badge-in">' + _t("lost.popup.inZone") + '</span>'
        : '<span class="kta-lost-popup-badge kta-lost-popup-badge-out">' + _t("lost.popup.outZone") + '</span>';

      const matchPopupHtml =
        '<div class="kta-popup-point kta-lost-popup">' +
          '<b>' + _esc(m.point.nom || m.point.id || "?") + '</b>' +
          '<span class="kta-popup-desc">' + _t("lost.popup.calque", { layer: _esc(m.layer || "—") }) + '</span>' +
          (m.point.description ? '<span class="kta-popup-desc">' + _esc(m.point.description) + '</span>' : '') +
          '<div class="kta-lost-popup-meta">' +
            statusBadge +
            '<span class="kta-lost-popup-dist">' + _formatDist(m.distancePx) + '</span>' +
          '</div>' +
          (m.matched && m.matched.length
            ? '<span class="kta-popup-desc kta-lost-popup-match">' + _t("lost.popup.match", { match: _esc(m.matched.join(", ")) }) + '</span>'
            : '') +
        '</div>';

      const mk = L.marker(_toLatLng(m.point.x, m.point.y), { icon: ic, zIndexOffset: 900 })
        .addTo(window.map)
        .bindPopup(matchPopupHtml, { className: "kta-lost-popup-wrapper", autoPan: true });
      _matchMarkers.push(mk);
    });

    if (_refinedLoc) {
      const refinedRadius = Math.max(60, _radiusPx * 0.15);
      _refinedCircle = L.polygon(
        _circleAsPolygon(_toLatLng(_refinedLoc.x, _refinedLoc.y), refinedRadius, 64),
        {
          color: COLOR_MATCH_IN,
          weight: 4,
          fillColor: COLOR_MATCH_IN,
          fillOpacity: 0.30,
          interactive: false,
          renderer: svgRenderer
        }
      ).addTo(window.map);
    }

    try {
      const bounds = _zoneLayer.getBounds();
      if (bounds && bounds.isValid()) {
        window.map.fitBounds(bounds, { padding: [40, 40] });
      }
    } catch(e) {
      console.warn("[LostMode] fitBounds échec :", e);
    }
  }

  // ── Clic carte pour la dernière position ──
  // Niveau affiché (clic carte, tracker) : là où la personne a été vue.
  function _niveauAffiche() {
    return (window.APP_CONFIG && Number.isInteger(window.APP_CONFIG.activeLevel)) ? window.APP_CONFIG.activeLevel : 0;
  }

  function _activerClicCarte(callback) {
    if (!window.map) return;
    _desactiverClicCarte();
    _clickModeActive = true;
    document.body.classList.add("kta-lost-click-mode");
    // Curseur géré par la CSS (body.kta-lost-click-mode → réticule) : pas de crosshair inline.
    window.map.getContainer().style.cursor = "";
    _clickHandler = function(e) {
      const x = Math.round(e.latlng.lng);
      const y = Math.round((window.APP_CONFIG.imageHeight || 0) - e.latlng.lat);
      _desactiverClicCarte();
      callback({ x: x, y: y, level: _niveauAffiche(), label: _t("lost.pos.clickLabel", { x: x, y: y }) });
    };
    window.map.on("click", _clickHandler);
  }

  function _desactiverClicCarte() {
    if (!_clickModeActive) return;
    _clickModeActive = false;
    document.body.classList.remove("kta-lost-click-mode");
    if (window.map) {
      window.map.getContainer().style.cursor = "";
      if (_clickHandler) {
        window.map.off("click", _clickHandler);
        _clickHandler = null;
      }
    }
  }

  // ── Rapport texte ──
  function _genererRapport() {
    const config = window.PLAN_CONFIG && window.PLAN_CONFIG.plan ? window.PLAN_CONFIG.plan : {};
    const now = new Date();
    const lines = [];

    const _rLang = (window.I18n && typeof window.I18n.getLang === "function") ? window.I18n.getLang() : "fr";
    const _rLocale = _rLang === "en" ? "en-US" : "fr-FR";

    lines.push(_t("lost.report.titre"));
    lines.push("=========================================");
    lines.push(_t("lost.report.plan", {
      name: (config.name || "?") + (config.version ? " (" + config.version + ")" : "")
    }));
    lines.push(_t("lost.report.genere", { date: now.toLocaleString(_rLocale) }));
    lines.push("");

    lines.push(_t("lost.report.position.titre"));
    if (_lastKnownPos) {
      lines.push("   " + (_lastKnownPos.label || "?"));
      lines.push("   " + _t("lost.report.position.coords", {
        x: Math.round(_lastKnownPos.x), y: Math.round(_lastKnownPos.y)
      }));
    } else {
      lines.push("   " + _t("lost.report.position.none"));
    }
    lines.push("");

    lines.push(_t("lost.report.temps", { m: _elapsedMinutes }));
    const presetInfo = LOST_MODE_PRESETS[_currentPreset] || { icon: "?" };
    lines.push(_t("lost.report.vitesse", {
      icon: presetInfo.icon, label: _presetLabel(_currentPreset), speed: _speedKmH
    }));
    lines.push(_t("lost.report.rayon", { radius: _formatDist(_radiusPx) }));

    // Portée réseau : une info concrète pour les secours plutôt qu'un cercle théorique.
    if (_reachStats) {
      if (_reachStats.exceedsBudget) {
        const r = _reachStats.reason;
        if (r === "no-roads" || r === "empty-graph") {
          lines.push(_t("lost.report.reach.none"));
        } else if (r === "snap-too-far") {
          lines.push(_t("lost.report.reach.tooFar", { dist: _formatDist(_reachStats.snapDistance) }));
        } else {
          lines.push(_t("lost.report.reach.unknown", { reason: r || _t("lost.report.reach.reasonUnknown") }));
        }
      } else {
        // Pluriel construit ici (FR ajoute « s », EN passe par la clé).
        const fc = _reachStats.fullCount;
        const pc = _reachStats.partialCount;
        const fullStr = _t("lost.report.reach.full" + (fc > 1 ? ".plural" : ".one"), { n: fc });
        const partStr = pc > 0
          ? " + " + _t("lost.report.reach.partial" + (pc > 1 ? ".plural" : ".one"), { n: pc })
          : "";
        lines.push(_t("lost.report.reach.ok", {
          dist:    _formatDist(_reachStats.totalReachableDistance),
          segments: fullStr + partStr,
          radius:  _formatDist(_radiusPx)
        }));
        if (_reachStats.snapDistance > 5) {
          lines.push("   " + _t("lost.report.reach.snapDist", { dist: _formatDist(_reachStats.snapDistance) }));
        }
      }
    }
    lines.push("");

    const inZone  = _matches.filter(function(m) { return m.inZone; });
    const outZone = _matches.filter(function(m) { return !m.inZone; });

    lines.push(_t("lost.report.indices.inZone", { n: inZone.length }));
    inZone.forEach(function(m) {
      lines.push("   - " + _t("lost.report.indices.item", {
        name:  (m.point.nom || m.point.id || "?"),
        layer: (m.layer || "—"),
        dist:  _formatDist(m.distancePx),
        match: m.matched.join(", ")
      }));
    });
    if (inZone.length === 0) lines.push("   " + _t("lost.report.indices.empty"));
    lines.push("");

    if (outZone.length > 0) {
      lines.push(_t("lost.report.indices.outZone", { n: outZone.length }));
      outZone.slice(0, 5).forEach(function(m) {
        lines.push("   - " + _t("lost.report.indices.itemOut", {
          name: (m.point.nom || m.point.id || "?"),
          dist: _formatDist(m.distancePx)
        }));
      });
      if (outZone.length > 5) lines.push("   " + _t("lost.report.indices.more", { n: outZone.length - 5 }));
      lines.push("");
    }

    if (_refinedLoc) {
      lines.push(_t("lost.report.loc.titre"));
      lines.push("   " + _t("lost.report.loc.coords", {
        x: Math.round(_refinedLoc.x),
        y: Math.round(_refinedLoc.y),
        n: _refinedLoc.count
      }));
      lines.push("");
    }

    lines.push(_t("lost.report.disclaimer"));
    return lines.join("\n");
  }

  function _validerEtCalculer(queryIndices) {
    if (!_lastKnownPos) {
      throw new Error(_t("lost.err.noPos"));
    }
    if (!(_elapsedMinutes > 0)) {
      throw new Error(_t("lost.err.badTime"));
    }
    _calculerRayon();

    return _chercherIndices(queryIndices || "").then(function(matches) {
      _matches = _annoterMatches(matches);
      _refinedLoc = _calculerLocAffinee(_matches);
      _renderOnMap();
      return {
        radiusMeters: _radiusMeters,
        matches: _matches,
        refinedLoc: _refinedLoc
      };
    });
  }

  // ── Confirmer : la localisation devient un point éditeur de session ──
  function _confirmerLocalisation() {
    if (!_refinedLoc && !_lastKnownPos) return false;
    const target = _refinedLoc || _lastKnownPos;
    const pt = {
      id: "lost_" + Date.now(),
      nom: _t("lost.point.nom"),
      x: Math.round(target.x),
      y: Math.round(target.y),
      // Tag danger : marque visuellement une position incertaine issue d'une urgence.
      tags: ["danger"],
      description: _t("lost.point.desc", {
        radius: _formatDist(_radiusPx),
        m:      _elapsedMinutes,
        speed:  _speedKmH.toFixed(1),
        indices: (_refinedLoc ? _t("lost.point.descIndices", { n: _refinedLoc.count }) : _t("lost.point.descNoBary"))
      })
    };
    if (window.ajouterPointEditor && typeof window.ajouterPointEditor === "function") {
      window.ajouterPointEditor(pt);
      return true;
    }
    if (window.setEditorPoints && window.getEditorPoints) {
      const list = window.getEditorPoints().slice();
      list.push(pt);
      window.setEditorPoints(list);
      return true;
    }
    return false;
  }

  // ── Ouverture / fermeture ──
  // open() : si une zone est encore sur la carte, l'état est restauré dans la modale.
  // close({ keepLayers: true }) (défaut : ✕, fond, Fermer) garde zone et marqueurs sur la carte ;
  // close({ keepLayers: false }) les purge (Effacer la zone, Confirmer). Même logique que « 📏 Distance totale ».
  function open() {
    _desactiverClicCarte();

    const orphan = document.getElementById("kta-lost-modal");
    if (orphan) orphan.remove();

    _active = true;
    const restoreMode = (_zoneLayer !== null) && (_lastKnownPos !== null);
    _afficherModale();

    if (restoreMode) {
      _restaurerEtatModale();
    }
  }

  function close(opts) {
    opts = opts || {};
    const keepLayers = opts.keepLayers !== false; // défaut: keepLayers = true

    console.log("[LostMode] close() — keepLayers =", keepLayers,
                "| layers actuellement sur map ?",
                _zoneLayer ? "oui" : "non");

    _desactiverClicCarte();

    if (!keepLayers) {
      console.log("[LostMode] close() → purge des layers");
      _clearLayers();
      _lastKnownPos = null;
      _matches      = [];
      _refinedLoc   = null;
      _zoneOverflow = false;
    } else {
      console.log("[LostMode] close() → layers CONSERVÉS sur la carte");
    }

    _active = false;
    // Débounce annulé : un setTimeout en attente écrirait dans un élément retiré.
    if (_searchTimeout) { clearTimeout(_searchTimeout); _searchTimeout = null; }
    if (_lc) { _lc.close(); _lc = null; }
    const m = document.getElementById("kta-lost-modal");
    if (m) m.remove();

    if (keepLayers) {
      setTimeout(function() { // lint-ok-modal-lifecycle (diagnostic post-close, modale déjà détruite)
        console.log("[LostMode] Post-close : _zoneLayer =", !!_zoneLayer,
                    "| in map ?", _zoneLayer && window.map && window.map.hasLayer(_zoneLayer),
                    "| _path =", _zoneLayer && _zoneLayer._path ? "présent" : "absent");
      }, 50);
    }
  }

  // Rouverte alors qu'une zone est active : champs et résultats restaurés depuis la mémoire.
  function _restaurerEtatModale() {
    if (_lastKnownPos) {
      _selectionnerPosition(_lastKnownPos);
    }
    const elapsedRange = document.getElementById("kta-lost-elapsed");
    const elapsedNum   = document.getElementById("kta-lost-elapsed-num");
    if (elapsedRange) elapsedRange.value = _elapsedMinutes;
    if (elapsedNum)   elapsedNum.value   = _elapsedMinutes;

    const segWrap = document.getElementById("kta-lost-preset-segmented");
    if (segWrap) {
      segWrap.querySelectorAll(".kta-lost-preset-btn").forEach(function(b) {
        b.classList.toggle("kta-lost-preset-active",
                           b.getAttribute("data-preset") === _currentPreset);
      });
    }

    const cluesEl = document.getElementById("kta-lost-clues");
    if (cluesEl && typeof _lastClues === "string") cluesEl.value = _lastClues;

    // Zone encore visible (avec ou sans indices) : la section résultats revient, elle porte le bouton
    // 🗑️ Effacer — sinon impossible de retirer la zone sans recalculer.
    if (_zoneLayer !== null) {
      _afficherResultats();
      const calc = document.getElementById("kta-lost-calc");
      if (calc) calc.textContent = _t("lost.btn.recalc");
    }
  }

  // ── Modale ──
  function _afficherModale() {
    const existing = document.getElementById("kta-lost-modal");
    if (existing) { existing.remove(); }

    const modal = document.createElement("div");
    modal.id = "kta-lost-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-lost-modal-boite">' +
        '<div class="kta-readme-modal-header kta-lost-header">' +
          '<span class="kta-readme-modal-titre">' + _t("lost.modal.titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-lost-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +

          '<details class="kta-lost-pratiques">' +
            '<summary class="kta-lost-pratiques-titre">' + _t("lost.tips.summary") + '</summary>' +
            '<div class="kta-lost-pratiques-corps">' +
              '<div class="kta-lost-pratique-cat">' +
                '<div class="kta-lost-pratique-cat-titre">' + _t("lost.tips.calme.titre") + '</div>' +
                '<ul>' +
                  '<li>' + _t("lost.tips.calme.1") + '</li>' +
                  '<li>' + _t("lost.tips.calme.2") + '</li>' +
                  '<li>' + _t("lost.tips.calme.3") + '</li>' +
                '</ul>' +
              '</div>' +
              '<div class="kta-lost-pratique-cat">' +
                '<div class="kta-lost-pratique-cat-titre">' + _t("lost.tips.orient.titre") + '</div>' +
                '<ul>' +
                  '<li>' + _t("lost.tips.orient.1") + '</li>' +
                  '<li>' + _t("lost.tips.orient.2") + '</li>' +
                  '<li>' + _t("lost.tips.orient.3") + '</li>' +
                  '<li>' + _t("lost.tips.orient.4") + '</li>' +
                '</ul>' +
              '</div>' +
              '<div class="kta-lost-pratique-cat">' +
                '<div class="kta-lost-pratique-cat-titre">' + _t("lost.tips.lumiere.titre") + '</div>' +
                '<ul>' +
                  '<li>' + _t("lost.tips.lumiere.1") + '</li>' +
                  '<li>' + _t("lost.tips.lumiere.2") + '</li>' +
                  '<li>' + _t("lost.tips.lumiere.3") + '</li>' +
                '</ul>' +
              '</div>' +
              '<div class="kta-lost-pratique-cat">' +
                '<div class="kta-lost-pratique-cat-titre">' + _t("lost.tips.comm.titre") + '</div>' +
                '<ul>' +
                  '<li>' + _t("lost.tips.comm.1") + '</li>' +
                  '<li>' + _t("lost.tips.comm.2") + '</li>' +
                '</ul>' +
              '</div>' +
              '<div class="kta-lost-pratique-cat">' +
                '<div class="kta-lost-pratique-cat-titre">' + _t("lost.tips.attendre.titre") + '</div>' +
                '<ul>' +
                  '<li>' + _t("lost.tips.attendre.1") + '</li>' +
                  '<li>' + _t("lost.tips.attendre.2") + '</li>' +
                  '<li>' + _t("lost.tips.attendre.3") + '</li>' +
                '</ul>' +
              '</div>' +
              '<div class="kta-lost-pratique-cat kta-lost-pratique-warn">' +
                '<div class="kta-lost-pratique-cat-titre">' + _t("lost.tips.nepas.titre") + '</div>' +
                '<ul>' +
                  '<li>' + _t("lost.tips.nepas.1") + '</li>' +
                  '<li>' + _t("lost.tips.nepas.2") + '</li>' +
                  '<li>' + _t("lost.tips.nepas.3") + '</li>' +
                '</ul>' +
              '</div>' +
            '</div>' +
          '</details>' +

          '<div class="kta-lost-section">' +
            '<div class="kta-lost-section-titre">' + _t("lost.section.position") + '</div>' +
            '<div class="kta-lost-pos-tabs">' +
              '<input id="kta-lost-search" class="kta-lost-search" type="text" placeholder="' + _t("lost.search.placeholder") + '" autocomplete="off">' +
              '<button class="kta-btn kta-btn-ghost" id="kta-lost-click-mode" type="button">' + _t("lost.btn.clickMap") + '</button>' +
              '<button class="kta-btn kta-btn-ghost" id="kta-lost-use-tracker" type="button">' + _t("lost.btn.tracker") + '</button>' +
            '</div>' +
            '<div class="kta-lost-search-results" id="kta-lost-search-results"></div>' +
            '<div class="kta-lost-pos-display" id="kta-lost-pos-display">' + _t("lost.pos.none") + '</div>' +
          '</div>' +

          '<div class="kta-lost-section">' +
            '<div class="kta-lost-section-titre">' + _t("lost.section.temps") + '</div>' +
            '<div class="kta-lost-slider-row">' +
              '<input id="kta-lost-elapsed" type="range" min="1" max="' + MAX_ELAPSED_MIN + '" value="' + DEFAULT_ELAPSED_MIN + '" class="kta-lost-slider">' +
              '<input id="kta-lost-elapsed-num" type="number" min="1" max="' + MAX_ELAPSED_MIN + '" value="' + DEFAULT_ELAPSED_MIN + '" class="kta-lost-num"> ' + _t("lost.unit.min") +
            '</div>' +
          '</div>' +

          '<div class="kta-lost-section">' +
            '<div class="kta-lost-section-titre">' + _t("lost.section.vitesse") + '</div>' +
            (function() {
              // 4 presets, mêmes valeurs que l'itinéraire ; rayon = vitesse × temps.
              let html = '<div class="kta-lost-preset-segmented" id="kta-lost-preset-segmented">';
              Object.keys(LOST_MODE_PRESETS).forEach(function(key) {
                const p = LOST_MODE_PRESETS[key];
                const active = (key === _currentPreset);
                const lbl = _presetLabel(key);
                html +=
                  '<button type="button" class="kta-lost-preset-btn' + (active ? " kta-lost-preset-active" : "") + '" ' +
                    'data-preset="' + key + '" ' +
                    'title="' + lbl + ' — ' + p.kmh + ' km/h. ' + _presetHint(key) + '">' +
                    '<span class="kta-lost-preset-icon">' + p.icon + '</span>' +
                    '<span class="kta-lost-preset-label">' + lbl + '</span>' +
                    '<span class="kta-lost-preset-meta">' + p.kmh + ' km/h</span>' +
                  '</button>';
              });
              html += '</div>';
              return html;
            })() +
            '<p style="font-size:11.5px; color:var(--kta-texte-3); margin:8px 0 0; line-height:1.45; font-style:italic;">' +
              _t("lost.vitesse.hint") +
            '</p>' +
          '</div>' +

          '<div class="kta-lost-section">' +
            '<div class="kta-lost-section-titre">' + _t("lost.section.indices") + '</div>' +
            '<textarea id="kta-lost-clues" class="kta-lost-clues" placeholder="' + _t("lost.indices.placeholder") + '"></textarea>' +
          '</div>' +

          '<div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">' +
            '<button class="kta-btn kta-btn-ghost"   id="kta-lost-fermer"   type="button" style="flex:1 1 130px;" title="' + _t("lost.btn.fermerTitle") + '">' + _t("lost.btn.fermer") + '</button>' +
            '<button class="kta-btn kta-btn-primary" id="kta-lost-calc"     type="button" style="flex:2 1 200px;">' + _t("lost.btn.calc") + '</button>' +
          '</div>' +
          '<p style="font-size:11.5px; color:var(--kta-texte-3); margin:8px 0 0; line-height:1.45; font-style:italic;">' +
            _t("lost.fermer.hint") +
          '</p>' +

          '<div id="kta-lost-results" class="kta-lost-results" style="display:none;"></div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);

    // ModalLifecycle : listeners et timers nettoyés au close.
    if (window.ModalLifecycle) {
      _lc = window.ModalLifecycle.attach(modal, { label: "LostMode" });
    }

    _bindModalEvents();
  }

  function _bindModalEvents() {
    // ✕, « 👁️ Fermer » et fond ferment la modale en gardant la zone (« 🗑️ Effacer » est bindé après le
    // rendu des résultats, cf _afficherResultats).
    document.getElementById("kta-lost-close").addEventListener("click", function() {
      close({ keepLayers: true });
    });
    document.getElementById("kta-lost-fermer").addEventListener("click", function() {
      close({ keepLayers: true });
    });

    const elapsedRange = document.getElementById("kta-lost-elapsed");
    const elapsedNum   = document.getElementById("kta-lost-elapsed-num");
    elapsedRange.addEventListener("input", function() { elapsedNum.value = elapsedRange.value; _elapsedMinutes = parseInt(elapsedRange.value, 10); });
    elapsedNum.addEventListener("input",   function() { elapsedRange.value = elapsedNum.value;  _elapsedMinutes = parseInt(elapsedNum.value, 10); });

    // Clic sur un preset : vitesse persistée, zone recalculée si elle est visible.
    const segWrap = document.getElementById("kta-lost-preset-segmented");
    if (segWrap) {
      segWrap.querySelectorAll(".kta-lost-preset-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const key = btn.getAttribute("data-preset");
          if (!_setLostPreset(key)) return;
          segWrap.querySelectorAll(".kta-lost-preset-btn").forEach(function(b) {
            b.classList.toggle("kta-lost-preset-active", b === btn);
          });
          if (_zoneLayer && _lastKnownPos) {
            _calculerRayon();
            _matches    = _annoterMatches(_matches);  // recompute inZone selon nouveau rayon
            _refinedLoc = _calculerLocAffinee(_matches);
            _renderOnMap();
            _afficherResultats();
          }
        });
      });
    }

    const searchInput   = document.getElementById("kta-lost-search");
    const searchResults = document.getElementById("kta-lost-search-results");
    searchInput.addEventListener("input", function() {
      clearTimeout(_searchTimeout);
      const q = searchInput.value.trim();
      if (q.length < 2) { searchResults.innerHTML = ""; return; }
      _searchTimeout = setTimeout(async function() {
        try {
          const found = await window.SearchPoints.findByQuery(q);
          // La modale a pu être fermée pendant l'await (100-500 ms sur une grosse base) : sinon écriture dans
          // un élément détaché et listeners zombies.
          if (!searchResults.isConnected) return;
          searchResults.innerHTML = "";
          found.slice(0, 8).forEach(function(item) {
            const p = item.point;
            const div = document.createElement("div");
            div.className = "kta-lost-search-result";
            div.innerHTML = '<strong>' + _esc(p.nom || p.id || "?") + '</strong>' +
                            ' <span class="kta-lost-search-layer">(' +
                            _esc(item.layerLabel || item.layer || "—") + ')</span>';
            div.addEventListener("click", function() {
              _selectionnerPosition({
                x: p.x, y: p.y,
                // Niveau du POI, pas celui affiché ; POI sans niveau → null (« sans niveau » n'active pas le
                // calage au niveau 0).
                level: Number.isInteger(p.level) ? p.level : null,
                label: (p.nom || p.id || "?") + " — " + (item.layerLabel || item.layer || "")
              });
              searchInput.value = "";
              searchResults.innerHTML = "";
            });
            searchResults.appendChild(div);
          });
          if (found.length === 0) {
            searchResults.innerHTML = '<div class="kta-lost-search-empty">' + _t("lost.search.empty") + '</div>';
          }
        } catch(e) {
          console.warn("[LostMode] search error :", e);
        }
      }, 200);
    });

    document.getElementById("kta-lost-click-mode").addEventListener("click", function() {
      const modalEl = document.getElementById("kta-lost-modal");
      if (modalEl) modalEl.style.display = "none";
      _activerClicCarte(function(pos) {
        if (modalEl) modalEl.style.display = "";
        _selectionnerPosition(pos);
      });
    });

    document.getElementById("kta-lost-use-tracker").addEventListener("click", function() {
      let pos = null;
      if (window.getTrackingPosition && typeof window.getTrackingPosition === "function") {
        pos = window.getTrackingPosition();
      }
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        _selectionnerPosition({ x: pos.x, y: pos.y, level: _niveauAffiche(), label: _t("lost.pos.trackerLabel") });
      } else if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(_t("lost.err.noTracker"), "warn");
      } else {
        window.ktaAlerte(_t("lost.err.noTracker"));
      }
    });

    document.getElementById("kta-lost-calc").addEventListener("click", async function() {
      const btn = this;
      btn.disabled = true;
      btn.textContent = _t("lost.btn.calcLoading");
      try {
        _lastClues = document.getElementById("kta-lost-clues").value || "";
        // Overlay « calcul en cours » : computeReachable est SYNCHRONE, sans yield-to-paint l'écran fige.
        const _msg = _t("lost.compute.loading");
        if (window.ComputeLoader && window.ComputeLoader.wrap) {
          await window.ComputeLoader.wrap(function() { return _validerEtCalculer(_lastClues); }, _msg);
        } else {
          await _validerEtCalculer(_lastClues);
        }
        _afficherResultats();
      } catch(e) {
        window.ktaAlerte(e.message || e, { type: "erreur" });
      } finally {
        btn.disabled = false;
        btn.textContent = _t("lost.btn.recalc");
      }
    });

    // Fond : comme ✕ (garde les couches).
    const modal = document.getElementById("kta-lost-modal");
    modal.addEventListener("click", function(e) {
      if (e.target === modal) close({ keepLayers: true });
    });
  }

  function _selectionnerPosition(pos) {
    _lastKnownPos = pos;
    const disp = document.getElementById("kta-lost-pos-display");
    if (disp) {
      disp.innerHTML = '<span class="kta-lost-pos-label">✓ ' + _esc(pos.label) +
                       '</span><span class="kta-lost-pos-coord"> ' +
                       _t("lost.pos.coordSuffix", { x: Math.round(pos.x), y: Math.round(pos.y) }) +
                       '</span>';
      disp.classList.add("kta-lost-pos-set");
    }
  }

  function _afficherResultats() {
    const box = document.getElementById("kta-lost-results");
    if (!box) return;
    box.style.display = "";

    let html = '<div class="kta-lost-section">';
    html += '<div class="kta-lost-section-titre">' + _t("lost.results.zone.titre") + '</div>';
    const pres = LOST_MODE_PRESETS[_currentPreset] || { icon: "?" };
    html += '<div class="kta-lost-stat">' +
            _t("lost.results.zone.rayon", { radius: _formatDist(_radiusPx) }) + ' ' +
            '<span class="kta-lost-stat-detail">' +
              '<span class="kta-lost-stat-preset">' + pres.icon + ' ' + _presetLabel(_currentPreset) + '</span> ' +
              '· ' + _t("lost.results.zone.detail", { speed: _speedKmH, m: _elapsedMinutes }) +
            '</span></div>';
    if (_zoneOverflow) {
      // Classe CSS (pas de style inline, illisible en thème clair : override dans style.css).
      html += '<div class="kta-lost-stat kta-lost-warn-overflow">' +
              _t("lost.results.overflow") +
              '</div>';
    }
    html += '</div>';

    html += '<div class="kta-lost-section">';
    html += '<div class="kta-lost-section-titre">' + _t("lost.results.indices.titre", { n: _matches.length }) + '</div>';
    if (_matches.length === 0) {
      const aucunIndiceSaisi = !_lastClues || _lastClues.trim().length === 0;
      if (aucunIndiceSaisi) {
        html += '<p class="kta-lost-empty">' + _t("lost.results.indices.emptyNone") + '</p>';
      } else {
        html += '<p class="kta-lost-empty">' + _t("lost.results.indices.emptyNoMatch") + '</p>';
      }
    } else {
      html += '<div class="kta-lost-match-list">';
      _matches.forEach(function(m) {
        const cls = m.inZone ? "kta-lost-match-in" : "kta-lost-match-out";
        const ico = m.inZone ? "🔮" : "·";
        const detail = m.inZone
          ? _t("lost.results.match.inZone", { dist: _formatDist(m.distancePx) })
          : _t("lost.results.match.outZone", { dist: _formatDist(m.distancePx) });
        html += '<div class="kta-lost-match ' + cls + '">' +
                '<span class="kta-lost-match-ico">' + ico + '</span>' +
                '<div class="kta-lost-match-body">' +
                  '<strong>' + (m.point.nom || m.point.id || "?") + '</strong>' +
                  ' <span class="kta-lost-match-layer">(' + (m.layer || "—") + ')</span>' +
                  '<div class="kta-lost-match-detail">' +
                    detail + _t("lost.results.match.matchSuffix", { match: m.matched.join(", ") }) +
                  '</div>' +
                '</div>' +
                '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    if (_refinedLoc) {
      html += '<div class="kta-lost-section kta-lost-refined-box">';
      html += '<div class="kta-lost-section-titre">' + _t("lost.results.refined.titre") + '</div>';
      html += '<div class="kta-lost-stat">' +
              _t("lost.results.refined.bary", {
                n: _refinedLoc.count,
                x: Math.round(_refinedLoc.x),
                y: Math.round(_refinedLoc.y)
              }) + '</div>';
      html += '</div>';
    }

    html += '<div class="kta-lost-actions">' +
              '<button class="kta-btn kta-btn-ghost"   id="kta-lost-copy"    type="button">' + _t("lost.btn.copyReport") + '</button>' +
              '<button class="kta-btn kta-btn-primary" id="kta-lost-confirm" type="button">' + _t("lost.btn.confirm") + '</button>' +
            '</div>' +
            // Lancer un plan de secours pré-rempli (dernier point, zone, temps écoulé).
            '<div style="text-align:center; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,140,140,0.20);">' +
              '<button class="kta-btn kta-btn-danger" id="kta-lost-launch-secours" type="button" ' +
                'style="background:rgba(255,68,68,0.85); color:#fff; border:1px solid #ff4444;" ' +
                'title="' + _t("lost.btn.secoursTitle") + '">' +
                _t("lost.btn.secours") +
              '</button>' +
            '</div>' +
            '<div style="text-align:center; margin-top:8px;">' +
              '<button class="kta-btn-link kta-update-link-danger" id="kta-lost-wipe" type="button" title="' + _t("lost.btn.wipeTitle") + '">' + _t("lost.btn.wipe") + '</button>' +
            '</div>';

    box.innerHTML = html;

    document.getElementById("kta-lost-copy").addEventListener("click", async function() {
      const btn = this;
      const txt = _genererRapport();
      try {
        // utils.js : clipboard puis repli execCommand (HTTP local).
        if (!(await window.ktaCopierTexte(txt))) throw new Error("clipboard + execCommand KO");
        const original = btn.textContent;
        btn.textContent = _t("lost.btn.copied");
        // setTimeout suivi : annulé si la modale ferme avant 1,5 s.
        const restoreFn = function() { if (btn.isConnected) btn.textContent = original; };
        if (_lc) _lc.setTimeout(restoreFn, 1500);
        else     setTimeout(restoreFn, 1500); // lint-ok-modal-lifecycle (fallback si _lc null)
      } catch(e) {
        btn.textContent = _t("lost.btn.copyFail");
        console.warn("[LostMode] copy failed :", e);
      }
    });

    document.getElementById("kta-lost-confirm").addEventListener("click", async function() {
      const ok = _confirmerLocalisation();
      if (ok) {
        await window.ktaAlerte(_t("lost.alert.confirmOk"));
        // Point figé en session : la zone n'a plus d'utilité.
        close({ keepLayers: false });
      } else {
        window.ktaAlerte(_t("lost.alert.confirmFail"), { type: "erreur" });
      }
    });

    const launchSecoursBtn = document.getElementById("kta-lost-launch-secours");
    if (launchSecoursBtn) {
      launchSecoursBtn.addEventListener("click", function() {
        if (!window.SecoursMode || typeof window.SecoursMode.creerDepuisLostMode !== "function") {
          window.ktaAlerte(_t("lost.alert.secoursUnavail"), { type: "erreur" });
          return;
        }
        const lostState = getState();
        if (!lostState.lastKnownPos) {
          window.ktaAlerte(_t("lost.alert.secoursNoPos"));
          return;
        }
        // La modale ferme mais les couches restent (contexte pendant l'édition du scénario).
        close({ keepLayers: true });
        window.SecoursMode.creerDepuisLostMode(lostState);
      });
    }

    const wipeBtn = document.getElementById("kta-lost-wipe");
    if (wipeBtn) {
      wipeBtn.addEventListener("click", function() {
        close({ keepLayers: false });
      });
    }
  }

  // ── Changement de plan (main.js > _libererRessourcesPlanPrecedent) : purge complète ──
  function _onPlanSwitch() {
    close({ keepLayers: false });
  }

  // État pour SecoursMode.creerDepuisLostMode : copie défensive (pas de mutation croisée).
  function getState() {
    return {
      active:         _active,
      lastKnownPos:   _lastKnownPos ? {
        x:     _lastKnownPos.x,
        y:     _lastKnownPos.y,
        // 🩸 Le niveau voyage avec la position : le niveau AFFICHÉ au lancement est faux si on a changé
        // d'étage entre-temps.
        level: Number.isInteger(_lastKnownPos.level) ? _lastKnownPos.level : null,
        label: _lastKnownPos.label || null
      } : null,
      elapsedMinutes: _elapsedMinutes,
      speedKmH:       _speedKmH,
      radiusPx:       _radiusPx,
      radiusMeters:   _radiusMeters,
      presetKey:      _currentPreset,
      clues:          _lastClues || ""
    };
  }

  // ── Export global ──
  window.LostMode = {
    open: open,
    close: close,
    isActive: function() { return _active; },
    getState: getState,
    _onPlanSwitch: _onPlanSwitch
  };
})();
