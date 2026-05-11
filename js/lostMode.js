/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.is-underground.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// ⛑️ LOST MODE — mode urgence "Je suis perdu"
// =========================
// Aide à zoner la position probable d'un utilisateur perdu, en croisant :
//   - Dernière position connue (point existant / clic carte / tracker actif)
//   - Temps écoulé depuis cette position
//   - Indices visuels observés (texte libre, recherche dans nom + description + tags + id)
//
// Calculs :
//   - Rayon = vitesse × temps × facteur d'incertitude (modèle simple v1)
//   - "Dans la zone" = distance euclidienne ≤ rayon depuis dernière position connue
//   - Localisation probable affinée = barycentre des matchs in-zone (si ≥ 1)
//
// Couleurs (anti-collision avec les zones Effondrement rouge / Eau bleu / Roads rouge-orange-jaune
// et Itinéraire cyan / Distance highlight magenta) :
//   - Zone de recherche : orange foncé #ff6b35 (alerte mais distinct du rouge)
//   - Dernière position : marker vert #6ce28a pulse
//   - Match in-zone     : pulse violet  #b452ff
//   - Match hors zone   : statique gris #8892a4
//   - Loc probable      : cercle interne violet pulse rapide
//
// API exposée :
//   - window.LostMode.open()       — ouvre la modale
//   - window.LostMode.close()      — ferme + cleanup carte
//   - window.LostMode.isActive()   — bool
// =========================

(function() {
  "use strict";

  // ===== Constantes =====
  const DEFAULT_SPEED_KMH    = 1.5;
  const DEFAULT_UNCERTAINTY  = 1.0;
  const DEFAULT_ELAPSED_MIN  = 30;
  const MAX_ELAPSED_MIN      = 90;  // 1h30 — au-delà, mode urgence non pertinent (zone immense)
  const MAX_MATCHES_SHOWN    = 20;

  const COLOR_ZONE      = "#ff6b35";
  const COLOR_LAST_POS  = "#6ce28a";
  const COLOR_MATCH_IN  = "#b452ff";
  const COLOR_MATCH_OUT = "#8892a4";

  // ===== État interne =====
  let _active           = false;
  let _lastKnownPos     = null;   // {x, y, label}
  let _elapsedMinutes   = DEFAULT_ELAPSED_MIN;
  let _speedKmH         = DEFAULT_SPEED_KMH;
  let _uncertainty      = DEFAULT_UNCERTAINTY;
  let _radiusPx         = 0;
  let _radiusMeters     = 0;
  let _matches          = [];     // [{point, layer, hits, distancePx, inZone, label}]
  let _refinedLoc       = null;   // {x, y}
  let _zoneOverflow     = false;  // true si le rayon dépasse la taille du plan
  let _lastClues        = "";     // texte des indices saisis (pour restauration)

  // Layers Leaflet (cleanup au close)
  let _zoneLayer        = null;
  let _lastKnownMarker  = null;
  let _matchMarkers     = [];
  let _refinedCircle    = null;

  // Mode click-carte pour saisir la position
  let _clickModeActive  = false;
  let _clickHandler     = null;

  // ===== Helpers =====
  function _scale() {
    return (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
  }

  function _toLatLng(x, y) {
    if (typeof window.convertCoord === "function") {
      return window.convertCoord(x, y);
    }
    // Fallback : suppose APP_CONFIG.imageHeight dispo
    const h = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
    return [h - y, x];
  }

  function _euclidean(p1, p2) {
    const dx = p1.x - p2.x, dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Génère un polygone qui approxime un cercle autour d'un centre Leaflet [lat, lng].
  // On utilise un polygone plutôt que L.circle parce que :
  //   1. Avec L.CRS.Simple, L.circle a une interprétation du rayon (CRS units vs
  //      mètres) variable selon la version Leaflet — sources de surprises.
  //   2. Avec preferCanvas: true (notre map), les CSS animations ne s'appliquent
  //      pas sur les paths canvas. Un polygone forcé en SVG (renderer: L.svg())
  //      garde les pulsations CSS opérationnelles.
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

  // ===== Calcul du rayon de recherche =====
  function _calculerRayon() {
    // distance (m) = vitesse_km_h × 1000 × temps_min / 60 × facteur_incertitude
    const distMeters = (_speedKmH * 1000 * _elapsedMinutes / 60) * _uncertainty;
    _radiusMeters = distMeters;
    _radiusPx     = distMeters * _scale();
    return _radiusPx;
  }

  // ===== Recherche des indices =====
  //
  // Normalisation pour insensibilité casse + accents :
  //   "Tanière", "Taniere", "TANIÈRE", "taniére" → "taniere"
  // NFD décompose les caractères accentués en base + combining mark,
  // puis on retire la classe U+0300..U+036F (combining diacritical marks).
  function _normalizeStr(s) {
    if (s === null || s === undefined) return "";
    // ̀-ͯ = "combining diacritical marks" (les accents que NFD a séparés)
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  async function _chercherIndices(queryText) {
    if (!queryText || !queryText.trim()) return [];
    if (!window.SearchPoints || typeof window.SearchPoints.getAllPoints !== "function") {
      console.warn("[LostMode] SearchPoints non disponible");
      return [];
    }

    // Tokens normalisés (sans accents, minuscules)
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
      // Haystack également normalisé pour matcher
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

    // Tri : plus de matched tokens en premier, puis ordre arbitraire
    matches.sort(function(a, b) { return b.hits - a.hits; });

    return matches.slice(0, MAX_MATCHES_SHOWN);
  }

  // ===== Enrichissement matches avec distance/zone =====
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

  // ===== Barycentre des matchs in-zone =====
  function _calculerLocAffinee(matches) {
    const inZone = matches.filter(function(m) { return m.inZone; });
    if (inZone.length === 0) return null;
    let sx = 0, sy = 0;
    inZone.forEach(function(m) { sx += m.point.x; sy += m.point.y; });
    return { x: sx / inZone.length, y: sy / inZone.length, count: inZone.length };
  }

  // ===== Rendu carte =====
  function _clearLayers() {
    if (!window.map) return;
    if (_zoneLayer)       { window.map.removeLayer(_zoneLayer);       _zoneLayer = null; }
    if (_lastKnownMarker) { window.map.removeLayer(_lastKnownMarker); _lastKnownMarker = null; }
    if (_refinedCircle)   { window.map.removeLayer(_refinedCircle);   _refinedCircle = null; }
    _matchMarkers.forEach(function(m) { window.map.removeLayer(m); });
    _matchMarkers = [];
  }

  function _renderOnMap() {
    if (!window.map || !_lastKnownPos) return;
    _clearLayers();

    const ll = _toLatLng(_lastKnownPos.x, _lastKnownPos.y);

    // Diag complet — pour qu'on voie tout de suite si la chaîne se casse
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

    // Zone de recherche — polygone échantillonné rendu en SVG explicite.
    // Pourquoi SVG malgré preferCanvas:true ? Quand on ajoute un polygone canvas
    // après l'init de la map, le canvas commun de Leaflet peut ne pas redessiner
    // automatiquement la nouvelle layer si elle n'est pas attachée à un
    // LayerGroup déclaré comme layer Leaflet. SVG est plus fiable pour les
    // ajouts ad-hoc en cours de session.
    const svgRenderer = L.svg({ padding: 0.5 });
    svgRenderer.addTo(window.map);

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
      // Force redraw pour s'assurer que le SVG est dessiné immédiatement
      if (_zoneLayer.bringToFront) _zoneLayer.bringToFront();
      if (_zoneLayer._renderer && _zoneLayer._renderer._update) {
        _zoneLayer._renderer._update();
      }
      // Vérif post-attache : la layer existe-t-elle vraiment dans le DOM ?
      setTimeout(function() {
        const path = _zoneLayer._path;
        const bbox = path && path.getBoundingClientRect ? path.getBoundingClientRect() : null;
        console.log("[LostMode] Post-render check : _path =", !!path,
                    "bbox =", bbox ? (Math.round(bbox.width) + "×" + Math.round(bbox.height) + " @ " + Math.round(bbox.left) + "," + Math.round(bbox.top)) : "null");
      }, 100);
    } catch(e) {
      console.error("[LostMode] ❌ addTo(map) a throw :", e);
    }

    // Détection "rayon trop grand vs plan" — la zone couvre tout le viewport
    // et l'utilisateur peut croire qu'il n'y a pas de zone. On enregistre le
    // ratio pour afficher un warning dans la modale après le calcul.
    const W = (window.APP_CONFIG && window.APP_CONFIG.imageWidth)  || 1;
    const H = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 1;
    const planMaxDim = Math.max(W, H);
    _zoneOverflow = (_radiusPx * 2 > planMaxDim);
    console.log("[LostMode] Plan max dim :", planMaxDim, "px → zone overflow ?", _zoneOverflow);

    // Helper d'échappement HTML (sécurité + cohérence visuelle)
    function _esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Marker dernière position connue (avec popup charte dark au clic)
    const lastIcon = L.divIcon({
      className: "kta-lost-marker-last",
      html: '<div class="kta-lost-marker-last-inner">📍</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    const lastPopupHtml =
      '<div class="kta-popup-point kta-lost-popup">' +
        '<b>📍 Dernière position connue</b>' +
        '<span class="kta-popup-desc">' + _esc(_lastKnownPos.label || "?") + '</span>' +
        '<span class="kta-popup-desc kta-lost-popup-coord">Coordonnées : X = ' +
          Math.round(_lastKnownPos.x) + ', Y = ' + Math.round(_lastKnownPos.y) + '</span>' +
      '</div>';
    _lastKnownMarker = L.marker(ll, { icon: lastIcon, zIndexOffset: 1000 })
      .addTo(window.map)
      .bindPopup(lastPopupHtml, { className: "kta-lost-popup-wrapper", autoPan: true });

    // Markers matches (in-zone violet, hors zone gris) — popups charte aussi
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
        ? '<span class="kta-lost-popup-badge kta-lost-popup-badge-in">🔮 Dans la zone</span>'
        : '<span class="kta-lost-popup-badge kta-lost-popup-badge-out">❌ Hors zone</span>';

      const matchPopupHtml =
        '<div class="kta-popup-point kta-lost-popup">' +
          '<b>' + _esc(m.point.nom || m.point.id || "?") + '</b>' +
          '<span class="kta-popup-desc">Calque : ' + _esc(m.layer || "—") + '</span>' +
          (m.point.description ? '<span class="kta-popup-desc">' + _esc(m.point.description) + '</span>' : '') +
          '<div class="kta-lost-popup-meta">' +
            statusBadge +
            '<span class="kta-lost-popup-dist">' + _formatDist(m.distancePx) + '</span>' +
          '</div>' +
          (m.matched && m.matched.length
            ? '<span class="kta-popup-desc kta-lost-popup-match">Match : ' + _esc(m.matched.join(", ")) + '</span>'
            : '') +
        '</div>';

      const mk = L.marker(_toLatLng(m.point.x, m.point.y), { icon: ic, zIndexOffset: 900 })
        .addTo(window.map)
        .bindPopup(matchPopupHtml, { className: "kta-lost-popup-wrapper", autoPan: true });
      _matchMarkers.push(mk);
    });

    // Cercle "localisation probable affinée" — polygone SVG aussi
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

    // Recadre la vue sur la zone (avec padding pour voir le pourtour + indices)
    try {
      const bounds = _zoneLayer.getBounds();
      if (bounds && bounds.isValid()) {
        window.map.fitBounds(bounds, { padding: [40, 40] });
      }
    } catch(e) {
      console.warn("[LostMode] fitBounds échec :", e);
    }
  }

  // ===== Mode "clic carte" pour saisir la dernière position =====
  function _activerClicCarte(callback) {
    if (!window.map) return;
    _desactiverClicCarte();
    _clickModeActive = true;
    document.body.classList.add("kta-lost-click-mode");
    window.map.getContainer().style.cursor = "crosshair";
    _clickHandler = function(e) {
      const x = Math.round(e.latlng.lng);
      const y = Math.round((window.APP_CONFIG.imageHeight || 0) - e.latlng.lat);
      _desactiverClicCarte();
      callback({ x: x, y: y, label: "Clic carte (" + x + ", " + y + ")" });
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

  // ===== Génération du rapport texte =====
  function _genererRapport() {
    const config = window.PLAN_CONFIG && window.PLAN_CONFIG.plan ? window.PLAN_CONFIG.plan : {};
    const now = new Date();
    const lines = [];

    lines.push("⛑️ ALERTE — Personne potentiellement perdue");
    lines.push("=========================================");
    lines.push("Plan : " + (config.name || "?") + (config.version ? " (" + config.version + ")" : ""));
    lines.push("Généré le : " + now.toLocaleString("fr-FR"));
    lines.push("");

    lines.push("📍 Dernière position connue :");
    if (_lastKnownPos) {
      lines.push("   " + (_lastKnownPos.label || "?"));
      lines.push("   Coordonnées plan : X=" + Math.round(_lastKnownPos.x) + ", Y=" + Math.round(_lastKnownPos.y));
    } else {
      lines.push("   (non définie)");
    }
    lines.push("");

    lines.push("⏱️ Temps écoulé : " + _elapsedMinutes + " min");
    lines.push("🏃 Vitesse présumée : " + _speedKmH.toFixed(1) + " km/h");
    lines.push("📊 Marge de sécurité : ×" + _uncertainty.toFixed(1));
    lines.push("📐 Rayon de la zone de recherche : ~" + _formatDist(_radiusPx));
    lines.push("");

    const inZone  = _matches.filter(function(m) { return m.inZone; });
    const outZone = _matches.filter(function(m) { return !m.inZone; });

    lines.push("🔮 Indices matchés DANS la zone : " + inZone.length);
    inZone.forEach(function(m) {
      lines.push("   - " + (m.point.nom || m.point.id || "?") +
                 " (" + (m.layer || "—") + ")" +
                 " à " + _formatDist(m.distancePx) +
                 " — match: " + m.matched.join(", "));
    });
    if (inZone.length === 0) lines.push("   (aucun)");
    lines.push("");

    if (outZone.length > 0) {
      lines.push("⚠️ Indices matchés HORS zone (exclus) : " + outZone.length);
      outZone.slice(0, 5).forEach(function(m) {
        lines.push("   - " + (m.point.nom || m.point.id || "?") +
                   " à " + _formatDist(m.distancePx));
      });
      if (outZone.length > 5) lines.push("   ... et " + (outZone.length - 5) + " autres");
      lines.push("");
    }

    if (_refinedLoc) {
      lines.push("🎯 Localisation probable affinée (barycentre des matchs in-zone) :");
      lines.push("   X=" + Math.round(_refinedLoc.x) + ", Y=" + Math.round(_refinedLoc.y) +
                 " (basée sur " + _refinedLoc.count + " match" +
                 (_refinedLoc.count > 1 ? "s" : "") + ")");
      lines.push("");
    }

    lines.push("⚠️ Cette estimation est purement géométrique (vitesse moyenne × temps). " +
               "Elle ne remplace PAS une opération de secours réelle.");
    return lines.join("\n");
  }

  // ===== Validation des entrées =====
  function _validerEtCalculer(queryIndices) {
    if (!_lastKnownPos) {
      throw new Error("Position de dernière connaissance requise");
    }
    if (!(_elapsedMinutes > 0)) {
      throw new Error("Temps écoulé invalide");
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

  // ===== Ajouter localisation comme point éditeur de session =====
  function _confirmerLocalisation() {
    if (!_refinedLoc && !_lastKnownPos) return false;
    const target = _refinedLoc || _lastKnownPos;
    const pt = {
      id: "lost_" + Date.now(),
      nom: "⛑️ Position probable (mode urgence)",
      x: Math.round(target.x),
      y: Math.round(target.y),
      // Tag danger → icône ⚠️ panneau, justifié pour marquer une position incertaine
      // issue d'une situation d'urgence (rappel visuel fort sur la carte).
      tags: ["danger"],
      description: "Estimation mode urgence — rayon " + _formatDist(_radiusPx) +
                   " · " + _elapsedMinutes + " min · " + _speedKmH.toFixed(1) + " km/h" +
                   " · " + (_refinedLoc ? _refinedLoc.count + " indices" : "barycentre indisponible")
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

  // ===== Open/Close =====
  // Sémantique de persistance (alignée sur "📏 Distance totale") :
  //   - open()             : ouvre la modale. Si une session précédente est
  //                          encore visible sur la carte (_zoneLayer existe),
  //                          on restaure l'état dans la modale (pre-fill).
  //   - close(keepLayers=true)  : ferme juste la modale. Garde zone + markers
  //                                visibles sur la carte. C'est le défaut pour
  //                                ✕ / clic backdrop / Fermer.
  //   - close(keepLayers=false) : ferme la modale ET purge les layers de la
  //                                carte. Pour "❌ Effacer la zone" et "✅ Confirmer".
  function open() {
    _desactiverClicCarte();

    const orphan = document.getElementById("kta-lost-modal");
    if (orphan) orphan.remove();

    _active = true;
    const restoreMode = (_zoneLayer !== null) && (_lastKnownPos !== null);
    _afficherModale();

    // Si une zone est déjà sur la carte, pré-remplir les champs avec l'état mémoire
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
    const m = document.getElementById("kta-lost-modal");
    if (m) m.remove();

    // Vérification post-close après reflow
    if (keepLayers) {
      setTimeout(function() {
        console.log("[LostMode] Post-close : _zoneLayer =", !!_zoneLayer,
                    "| in map ?", _zoneLayer && window.map && window.map.hasLayer(_zoneLayer),
                    "| _path =", _zoneLayer && _zoneLayer._path ? "présent" : "absent");
      }, 50);
    }
  }

  // Restaure les valeurs des inputs/résultats à partir de l'état en mémoire
  // (appelé quand on rouvre la modale alors qu'une zone est déjà active)
  function _restaurerEtatModale() {
    // Position
    if (_lastKnownPos) {
      _selectionnerPosition(_lastKnownPos);
    }
    // Sliders
    const elapsedRange = document.getElementById("kta-lost-elapsed");
    const elapsedNum   = document.getElementById("kta-lost-elapsed-num");
    if (elapsedRange) elapsedRange.value = _elapsedMinutes;
    if (elapsedNum)   elapsedNum.value   = _elapsedMinutes;

    const speedRange = document.getElementById("kta-lost-speed");
    const speedVal   = document.getElementById("kta-lost-speed-val");
    if (speedRange) speedRange.value = _speedKmH;
    if (speedVal)   speedVal.textContent = _speedKmH.toFixed(1) + " km/h";

    const uncertRange = document.getElementById("kta-lost-uncert");
    const uncertVal   = document.getElementById("kta-lost-uncert-val");
    if (uncertRange) uncertRange.value = _uncertainty;
    if (uncertVal)   uncertVal.textContent = "×" + _uncertainty.toFixed(1);

    // Indices (restauré tel quel)
    const cluesEl = document.getElementById("kta-lost-clues");
    if (cluesEl && typeof _lastClues === "string") cluesEl.value = _lastClues;

    // Si une zone est encore visible sur la carte (peu importe qu'il y ait des
    // indices matchés ou non), on ré-affiche la section résultats — c'est elle
    // qui contient le bouton 🗑️ Effacer, indispensable pour que l'utilisateur
    // puisse retirer la zone sans avoir à re-cliquer Calculer.
    if (_zoneLayer !== null) {
      _afficherResultats();
      // Le bouton Calculer devient "🔄 Recalculer"
      const calc = document.getElementById("kta-lost-calc");
      if (calc) calc.textContent = "🔄 Recalculer";
    }
  }

  // ===== Modale UI =====
  function _afficherModale() {
    const existing = document.getElementById("kta-lost-modal");
    if (existing) { existing.remove(); }

    const modal = document.createElement("div");
    modal.id = "kta-lost-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-lost-modal-boite">' +
        '<div class="kta-readme-modal-header kta-lost-header">' +
          '<span class="kta-readme-modal-titre">⛑️ Mode urgence — Je suis perdu</span>' +
          '<button class="kta-panneau-close" id="kta-lost-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +

          '<details class="kta-lost-pratiques">' +
            '<summary class="kta-lost-pratiques-titre">📚 Bonnes pratiques — clique pour lire (recommandé si tu es vraiment perdu)</summary>' +
            '<div class="kta-lost-pratiques-corps">' +
              '<div class="kta-lost-pratique-cat">' +
                '<div class="kta-lost-pratique-cat-titre">🧘 Garde ton calme (d\'abord)</div>' +
                '<ul>' +
                  '<li><strong>Stop.</strong> Inspire. Pose-toi quelques secondes.</li>' +
                  '<li>La panique fait perdre les repères et gaspille lumière + énergie.</li>' +
                  '<li>Mange/bois un peu si tu as quelque chose. Reprends ton souffle.</li>' +
                '</ul>' +
              '</div>' +
              '<div class="kta-lost-pratique-cat">' +
                '<div class="kta-lost-pratique-cat-titre">🗺️ Orientation</div>' +
                '<ul>' +
                  '<li><strong>Reviens sur tes pas</strong> plutôt que chercher à atteindre ta destination — statistiquement plus fiable.</li>' +
                  '<li>Cherche les <strong>axes principaux</strong> (roulages, galeries droites, voies ferrées). Ils mènent presque toujours à un repère connu.</li>' +
                  '<li><strong>Utilise une boussole physique</strong> — pas celle du téléphone, faussée par le sol et les armatures. Recadre-toi à chaque carrefour.</li>' +
                  '<li><strong>Écoute les bruits</strong> : circulation, métro, train, eau qui coule = indice de direction utile.</li>' +
                '</ul>' +
              '</div>' +
              '<div class="kta-lost-pratique-cat">' +
                '<div class="kta-lost-pratique-cat-titre">🔦 Lumière & ressources</div>' +
                '<ul>' +
                  '<li>Passe ta lampe en <strong>mode économie</strong>. Lampe morte = situation grave.</li>' +
                  '<li>Garde une <strong>lampe de secours</strong> si tu en as une (frontale + lampe stylo, l\'idéal).</li>' +
                  '<li>Hydrate-toi un peu mais économise — le stress déshydrate vite.</li>' +
                '</ul>' +
              '</div>' +
              '<div class="kta-lost-pratique-cat">' +
                '<div class="kta-lost-pratique-cat-titre">📡 Communication</div>' +
                '<ul>' +
                  '<li>Si tu <strong>captes du réseau</strong> (souvent près des puits / sous certains regards) → préviens quelqu\'un en surface <strong>AVANT</strong> que ta batterie meure.</li>' +
                  '<li>Le bouton <strong>📋 Copier le rapport</strong> ci-dessous prépare un message tout fait avec ta dernière position + le temps écoulé.</li>' +
                '</ul>' +
              '</div>' +
              '<div class="kta-lost-pratique-cat">' +
                '<div class="kta-lost-pratique-cat-titre">📍 Si tu décides d\'attendre</div>' +
                '<ul>' +
                  '<li>Pose-toi à un endroit <strong>identifiable</strong> (puits numéroté, salle nommée, épure visible).</li>' +
                  '<li>Reste où tu es si <strong>personne ne sait que tu es là</strong> — bouger empire la situation.</li>' +
                  '<li>Marque ton emplacement (peinture, chatterton, sac voyant) pour qu\'on te trouve.</li>' +
                '</ul>' +
              '</div>' +
              '<div class="kta-lost-pratique-cat kta-lost-pratique-warn">' +
                '<div class="kta-lost-pratique-cat-titre">⚠️ À ne pas faire</div>' +
                '<ul>' +
                  '<li><strong>Ne suis pas l\'eau</strong> — les diaclases mènent souvent à des passages étroits dangereux.</li>' +
                  '<li><strong>Ne tente pas un passage inconnu</strong> juste parce qu\'il a l\'air de monter / d\'aller "vers l\'extérieur".</li>' +
                  '<li>Ne te fie pas au tracker téléphone — il dérive, surtout sous stress (mouvements erratiques).</li>' +
                '</ul>' +
              '</div>' +
            '</div>' +
          '</details>' +

          '<div class="kta-lost-section">' +
            '<div class="kta-lost-section-titre">📍 Dernière position connue</div>' +
            '<div class="kta-lost-pos-tabs">' +
              '<input id="kta-lost-search" class="kta-lost-search" type="text" placeholder="🔎 Chercher un point (PA1, salle, etc.)" autocomplete="off">' +
              '<button class="kta-btn kta-btn-ghost" id="kta-lost-click-mode" type="button">📍 Clic carte</button>' +
              '<button class="kta-btn kta-btn-ghost" id="kta-lost-use-tracker" type="button">🧭 Position tracker</button>' +
            '</div>' +
            '<div class="kta-lost-search-results" id="kta-lost-search-results"></div>' +
            '<div class="kta-lost-pos-display" id="kta-lost-pos-display">Aucune position sélectionnée</div>' +
          '</div>' +

          '<div class="kta-lost-section">' +
            '<div class="kta-lost-section-titre">⏱️ Temps écoulé</div>' +
            '<div class="kta-lost-slider-row">' +
              '<input id="kta-lost-elapsed" type="range" min="1" max="' + MAX_ELAPSED_MIN + '" value="' + DEFAULT_ELAPSED_MIN + '" class="kta-lost-slider">' +
              '<input id="kta-lost-elapsed-num" type="number" min="1" max="' + MAX_ELAPSED_MIN + '" value="' + DEFAULT_ELAPSED_MIN + '" class="kta-lost-num"> min' +
            '</div>' +
          '</div>' +

          '<div class="kta-lost-section">' +
            '<div class="kta-lost-section-titre">⚙️ Paramètres avancés</div>' +
            '<div class="kta-lost-slider-row" title="Vitesse moyenne de marche en milieu cataphile (lent, courbé, prudent : 1.0–1.5 km/h ; bonne progression : 2–3 km/h).">' +
              '<span class="kta-lost-param-label">Vitesse</span>' +
              '<input id="kta-lost-speed" type="range" min="0.3" max="5" step="0.1" value="' + DEFAULT_SPEED_KMH + '" class="kta-lost-slider">' +
              '<span class="kta-lost-param-val" id="kta-lost-speed-val">' + DEFAULT_SPEED_KMH.toFixed(1) + ' km/h</span>' +
            '</div>' +
            '<div class="kta-lost-slider-row" title="Marge de sécurité — élargit la zone de recherche pour compenser les détours, demi-tours et erreurs d\'estimation du temps.">' +
              '<span class="kta-lost-param-label">Marge de sécurité</span>' +
              '<input id="kta-lost-uncert" type="range" min="1" max="3" step="0.1" value="' + DEFAULT_UNCERTAINTY + '" class="kta-lost-slider">' +
              '<span class="kta-lost-param-val" id="kta-lost-uncert-val">×' + DEFAULT_UNCERTAINTY.toFixed(1) + '</span>' +
            '</div>' +
            '<p style="font-size:11.5px; color:#8892a4; margin:6px 0 0; line-height:1.45; font-style:italic;">' +
              '💡 La <strong>marge de sécurité</strong> agrandit le rayon : la personne n\'a probablement pas marché en ligne droite (couloirs, demi-tours, exploration). Plus la marge est haute, plus la zone est large mais moins précise. <strong>×1.0</strong> = défaut, exactement <em>vitesse × temps</em>. <strong>×1.5</strong> = prudent. <strong>×2+</strong> = très incertain (temps écoulé approximatif).' +
            '</p>' +
          '</div>' +

          '<div class="kta-lost-section">' +
            '<div class="kta-lost-section-titre">🔮 Indices visuels (optionnel)</div>' +
            '<textarea id="kta-lost-clues" class="kta-lost-clues" placeholder="Indices observés, séparés par virgule ou retour ligne. Ex: bidon eau, épure bélier, puits cassé..."></textarea>' +
          '</div>' +

          '<div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">' +
            '<button class="kta-btn kta-btn-ghost"   id="kta-lost-fermer"   type="button" style="flex:1 1 130px;" title="Ferme la modale, garde la zone sur la carte">👁️ Fermer</button>' +
            '<button class="kta-btn kta-btn-primary" id="kta-lost-calc"     type="button" style="flex:2 1 200px;">🎯 Calculer la zone</button>' +
          '</div>' +
          '<p style="font-size:11.5px; color:#8892a4; margin:8px 0 0; line-height:1.45; font-style:italic;">' +
            '💡 <strong>Fermer</strong> ferme juste la modale — la zone reste sur la carte pour que tu puisses explorer. Tu pourras rouvrir le mode pour ajuster, ou cliquer <strong>🗑️ Effacer la zone</strong> dans les résultats (après Calculer) pour tout retirer.' +
          '</p>' +

          '<div id="kta-lost-results" class="kta-lost-results" style="display:none;"></div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(modal);

    _bindModalEvents();
  }

  function _bindModalEvents() {
    // ✕ en haut à droite + bouton "👁️ Fermer" + backdrop
    // → ferment juste la modale, gardent la zone visible sur la carte.
    // (Le bouton "🗑️ Effacer la zone et fermer" est dans la section résultats
    //  et est bindé après le rendu des résultats, voir _afficherResultats.)
    document.getElementById("kta-lost-close").addEventListener("click", function() {
      close({ keepLayers: true });
    });
    document.getElementById("kta-lost-fermer").addEventListener("click", function() {
      close({ keepLayers: true });
    });

    // Sliders bidirectionnels (range <-> num)
    const elapsedRange = document.getElementById("kta-lost-elapsed");
    const elapsedNum   = document.getElementById("kta-lost-elapsed-num");
    elapsedRange.addEventListener("input", function() { elapsedNum.value = elapsedRange.value; _elapsedMinutes = parseInt(elapsedRange.value, 10); });
    elapsedNum.addEventListener("input",   function() { elapsedRange.value = elapsedNum.value;  _elapsedMinutes = parseInt(elapsedNum.value, 10); });

    const speedRange = document.getElementById("kta-lost-speed");
    const speedVal   = document.getElementById("kta-lost-speed-val");
    speedRange.addEventListener("input", function() {
      _speedKmH = parseFloat(speedRange.value);
      speedVal.textContent = _speedKmH.toFixed(1) + " km/h";
    });

    const uncertRange = document.getElementById("kta-lost-uncert");
    const uncertVal   = document.getElementById("kta-lost-uncert-val");
    uncertRange.addEventListener("input", function() {
      _uncertainty = parseFloat(uncertRange.value);
      uncertVal.textContent = "×" + _uncertainty.toFixed(1);
    });

    // Recherche autocomplete position
    const searchInput   = document.getElementById("kta-lost-search");
    const searchResults = document.getElementById("kta-lost-search-results");
    let searchTimeout   = null;
    searchInput.addEventListener("input", function() {
      clearTimeout(searchTimeout);
      const q = searchInput.value.trim();
      if (q.length < 2) { searchResults.innerHTML = ""; return; }
      searchTimeout = setTimeout(async function() {
        try {
          const found = await window.SearchPoints.findByQuery(q);
          searchResults.innerHTML = "";
          found.slice(0, 8).forEach(function(item) {
            const p = item.point;
            const div = document.createElement("div");
            div.className = "kta-lost-search-result";
            div.innerHTML = '<strong>' + (p.nom || p.id || "?") + '</strong>' +
                            ' <span class="kta-lost-search-layer">(' +
                            (item.layerLabel || item.layer || "—") + ')</span>';
            div.addEventListener("click", function() {
              _selectionnerPosition({
                x: p.x, y: p.y,
                label: (p.nom || p.id || "?") + " — " + (item.layerLabel || item.layer || "")
              });
              searchInput.value = "";
              searchResults.innerHTML = "";
            });
            searchResults.appendChild(div);
          });
          if (found.length === 0) {
            searchResults.innerHTML = '<div class="kta-lost-search-empty">Aucun résultat</div>';
          }
        } catch(e) {
          console.warn("[LostMode] search error :", e);
        }
      }, 200);
    });

    // Clic carte
    document.getElementById("kta-lost-click-mode").addEventListener("click", function() {
      const modalEl = document.getElementById("kta-lost-modal");
      if (modalEl) modalEl.style.display = "none";
      _activerClicCarte(function(pos) {
        if (modalEl) modalEl.style.display = "";
        _selectionnerPosition(pos);
      });
    });

    // Position tracker
    document.getElementById("kta-lost-use-tracker").addEventListener("click", function() {
      let pos = null;
      if (window.getTrackingPosition && typeof window.getTrackingPosition === "function") {
        pos = window.getTrackingPosition();
      }
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        _selectionnerPosition({ x: pos.x, y: pos.y, label: "Position tracker actuelle" });
      } else {
        alert("Aucune position tracker active.\nDémarre le tracker (▶️) ou utilise la recherche / le clic carte.");
      }
    });

    // Bouton Calculer
    document.getElementById("kta-lost-calc").addEventListener("click", async function() {
      const btn = this;
      btn.disabled = true;
      btn.textContent = "⏳ Calcul…";
      try {
        _lastClues = document.getElementById("kta-lost-clues").value || "";
        await _validerEtCalculer(_lastClues);
        _afficherResultats();
      } catch(e) {
        alert(e.message || e);
      } finally {
        btn.disabled = false;
        btn.textContent = "🔄 Recalculer";
      }
    });

    // Fermeture backdrop — comportement identique au ✕ (garde les layers)
    const modal = document.getElementById("kta-lost-modal");
    modal.addEventListener("click", function(e) {
      if (e.target === modal) close({ keepLayers: true });
    });
  }

  function _selectionnerPosition(pos) {
    _lastKnownPos = pos;
    const disp = document.getElementById("kta-lost-pos-display");
    if (disp) {
      disp.innerHTML = '<span class="kta-lost-pos-label">✓ ' + pos.label +
                       '</span><span class="kta-lost-pos-coord"> (X=' +
                       Math.round(pos.x) + ', Y=' + Math.round(pos.y) + ')</span>';
      disp.classList.add("kta-lost-pos-set");
    }
  }

  function _afficherResultats() {
    const box = document.getElementById("kta-lost-results");
    if (!box) return;
    box.style.display = "";

    const inZone  = _matches.filter(function(m) { return m.inZone; });
    const outZone = _matches.filter(function(m) { return !m.inZone; });

    let html = '<div class="kta-lost-section">';
    html += '<div class="kta-lost-section-titre">📐 Zone de recherche</div>';
    html += '<div class="kta-lost-stat">Rayon estimé : <strong>' +
            _formatDist(_radiusPx) + '</strong> ' +
            '(' + _speedKmH.toFixed(1) + ' km/h × ' + _elapsedMinutes + ' min × ' + _uncertainty.toFixed(1) + ')</div>';
    if (_zoneOverflow) {
      html += '<div class="kta-lost-stat" style="margin-top:6px; background:rgba(255,107,53,0.14); border:1px solid rgba(255,107,53,0.45); color:#ffb088;">' +
              '⚠️ Le rayon dépasse la taille du plan — tu pourrais être <strong>n\'importe où</strong> sur le plan. ' +
              'Réduis le temps écoulé ou la vitesse présumée si tu sais que ta progression a été plus lente, ou affine avec des indices visuels ci-dessous.' +
              '</div>';
    }
    html += '</div>';

    html += '<div class="kta-lost-section">';
    html += '<div class="kta-lost-section-titre">🔮 Indices matchés (' + _matches.length + ')</div>';
    if (_matches.length === 0) {
      const aucunIndiceSaisi = !_lastClues || _lastClues.trim().length === 0;
      if (aucunIndiceSaisi) {
        html += '<p class="kta-lost-empty">Aucun indice saisi — tu peux ajouter du texte dans la section 🔮 ci-dessus puis cliquer 🔄 Recalculer pour affiner la zone.</p>';
      } else {
        html += '<p class="kta-lost-empty">Aucun indice ne correspond aux mots saisis. Élargis la marge de sécurité ou modifie tes mots-clés.</p>';
      }
    } else {
      html += '<div class="kta-lost-match-list">';
      _matches.forEach(function(m) {
        const cls = m.inZone ? "kta-lost-match-in" : "kta-lost-match-out";
        const ico = m.inZone ? "🔮" : "·";
        html += '<div class="kta-lost-match ' + cls + '">' +
                '<span class="kta-lost-match-ico">' + ico + '</span>' +
                '<div class="kta-lost-match-body">' +
                  '<strong>' + (m.point.nom || m.point.id || "?") + '</strong>' +
                  ' <span class="kta-lost-match-layer">(' + (m.layer || "—") + ')</span>' +
                  '<div class="kta-lost-match-detail">' +
                    (m.inZone ? "✅ Dans la zone, à " : "❌ Hors zone, à ") + _formatDist(m.distancePx) +
                    ' · match: ' + m.matched.join(", ") +
                  '</div>' +
                '</div>' +
                '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    if (_refinedLoc) {
      html += '<div class="kta-lost-section kta-lost-refined-box">';
      html += '<div class="kta-lost-section-titre">🎯 Localisation probable affinée</div>';
      html += '<div class="kta-lost-stat">Barycentre de <strong>' + _refinedLoc.count +
              '</strong> indice' + (_refinedLoc.count > 1 ? "s" : "") + ' in-zone : ' +
              'X=' + Math.round(_refinedLoc.x) + ', Y=' + Math.round(_refinedLoc.y) + '</div>';
      html += '</div>';
    }

    html += '<div class="kta-lost-actions">' +
              '<button class="kta-btn kta-btn-ghost"   id="kta-lost-copy"    type="button">📋 Copier le rapport</button>' +
              '<button class="kta-btn kta-btn-primary" id="kta-lost-confirm" type="button">✅ Supprimer la zone et sauvegarder ma position supposée</button>' +
            '</div>' +
            '<div style="text-align:center; margin-top:8px;">' +
              '<button class="kta-btn-link kta-update-link-danger" id="kta-lost-wipe" type="button" title="Retire la zone et les markers de la carte">🗑️ Effacer la zone et fermer</button>' +
            '</div>';

    box.innerHTML = html;

    document.getElementById("kta-lost-copy").addEventListener("click", async function() {
      const btn = this;
      const txt = _genererRapport();
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(txt);
        } else {
          const ta = document.createElement("textarea");
          ta.value = txt; document.body.appendChild(ta);
          ta.select(); document.execCommand("copy");
          document.body.removeChild(ta);
        }
        const original = btn.textContent;
        btn.textContent = "✓ Copié !";
        setTimeout(function() { btn.textContent = original; }, 1500);
      } catch(e) {
        btn.textContent = "❌ Échec";
        console.warn("[LostMode] copy failed :", e);
      }
    });

    document.getElementById("kta-lost-confirm").addEventListener("click", function() {
      const ok = _confirmerLocalisation();
      if (ok) {
        alert("✅ Position supposée sauvegardée comme point « ⛑️ Position probable » (icône ⚠️ danger).\n" +
              "La zone de recherche est retirée de la carte. Tu pourras exporter ou convertir le point comme un point classique.");
        // Une fois le point figé en session, la zone d'exploration n'a plus d'utilité
        close({ keepLayers: false });
      } else {
        alert("Impossible de sauvegarder le point — fonction d'édition indisponible.\n" +
              "Tu peux quand même copier le rapport (📋) pour partager les coordonnées.");
      }
    });

    // 🗑️ Effacer la zone et fermer — petit lien dans la section résultats
    const wipeBtn = document.getElementById("kta-lost-wipe");
    if (wipeBtn) {
      wipeBtn.addEventListener("click", function() {
        close({ keepLayers: false });
      });
    }
  }

  // ===== Cleanup au plan switch (appelé par main.js > _libererRessourcesPlanPrecedent) =====
  // Plan switch = on perd tout : la carte sera détruite et reconstruite,
  // donc on purge à fond (layers + état + modale éventuellement ouverte).
  function _onPlanSwitch() {
    close({ keepLayers: false });
  }

  // ===== Export global =====
  window.LostMode = {
    open: open,
    close: close,
    isActive: function() { return _active; },
    _onPlanSwitch: _onPlanSwitch
  };
})();
