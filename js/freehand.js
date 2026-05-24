/*!
 * MyKTAMap — Mode dessin libre (freehand)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// FREEHAND.JS — Mode crayon à main levée (depuis v1.21.0)
// =========================
// Nouveau type d'annotation `freehand` qui s'ajoute aux Tracés existants
// (principal / secondaire / chemin / itinerary / jonction). Différence
// fondamentale : capture continue mousemove/touchmove au lieu de clics
// successifs. Use case : entourer une zone d'intérêt, fléchage rapide,
// annotation graphique libre.
//
// Stockage : objet road comme les autres, mais avec :
//   { type: "freehand", points: [{x,y}, ...], level,
//     freehandColor: "#xxxxxx", freehandWidth: N }
//
// Cela permet de réutiliser TOUTE l'infra existante (rendu via renderRoads,
// persistance SessionPersist, exports KMZ/GPX, undo/redo HistoryManager,
// filtre niveau-aware, etc.) sans ré-implémenter.
//
// ⚠️ Exclu du Pathfinder : `allowedTypes` par défaut = ['principal',
// 'secondaire', 'chemin'] dans `js/pathfinder.js`, donc le type `freehand`
// est auto-exclu du graphe de calcul d'itinéraire. C'est l'effet voulu :
// un dessin libre n'est PAS un chemin praticable.
//
// API :
//   window.Freehand = { activer, desactiver, isActive, toggle, getPrefs, setPrefs }
//
// Préférences (couleur + épaisseur) : persistées en
// localStorage["myktamap_freehand_prefs_v1"]. Par défaut : rouge #ff5252,
// width 4. Pas de UI personnalisation en v1.21.0 — les préférences sont
// modifiables via la console (`window.Freehand.setPrefs({color, width})`)
// pour les power-users. Une UI plus riche pourra arriver en v1.22.0.
// =========================

(function() {
  "use strict";

  const LS_KEY = "myktamap_freehand_prefs_v1";
  const TICK_MS = 16;           // throttle capture (≈60Hz)
  const MIN_POINT_DIST_PX = 3;  // distance min entre 2 points consécutifs (anti-spam)

  // ───────── PRÉFÉRENCES ─────────
  function _loadPrefs() {
    let p = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) p = JSON.parse(raw);
    } catch(e) {}
    return {
      color: (p && p.color) || "#ff5252",   // rouge vif par défaut
      width: (p && typeof p.width === "number" && p.width >= 1 && p.width <= 20) ? p.width : 4
    };
  }

  function _savePrefs(prefs) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch(e) {}
  }

  let _prefs = _loadPrefs();

  // ───────── STATE ─────────
  let _active = false;
  let _drawing = false;          // true entre mousedown et mouseup
  let _currentRoad = null;       // road en cours de capture
  let _lastTickAt = 0;
  let _lastPoint = null;         // dernier point ajouté (pour dist check)
  let _historySnapshotBefore = null;  // snapshot HistoryManager au mousedown

  // ───────── RDP (Ramer-Douglas-Peucker) ─────────
  // Lissage post-capture pour réduire le nombre de points sans perdre la forme.
  // Itératif (pas récursif) pour éviter stack overflow sur très longs traits.
  function _perpDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag < 1e-9) {
      const ddx = p.x - a.x;
      const ddy = p.y - a.y;
      return Math.sqrt(ddx * ddx + ddy * ddy);
    }
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / mag;
  }
  function _rdpItera(points, epsilon) {
    if (!Array.isArray(points) || points.length < 3) return points.slice();
    const n = points.length;
    const keep = new Uint8Array(n);
    keep[0] = 1; keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let maxD = 0, maxI = -1;
      for (let i = s + 1; i < e; i++) {
        const d = _perpDist(points[i], points[s], points[e]);
        if (d > maxD) { maxD = d; maxI = i; }
      }
      if (maxD > epsilon && maxI > -1) {
        keep[maxI] = 1;
        stack.push([s, maxI]);
        stack.push([maxI, e]);
      }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
    return out;
  }

  // Epsilon dynamique selon zoom (+ paramétrable). Plus l'user dezoom,
  // plus on simplifie agressivement (les détails fins ne se voient plus).
  function _epsilonForZoom() {
    if (!window.map || typeof window.map.getZoom !== "function") return 1.5;
    const z = window.map.getZoom();
    // À z=0 (default), epsilon = 1.5 px. Au-delà, plus de précision.
    return Math.max(0.5, 1.5 - z * 0.3);
  }

  // ───────── HELPERS MAP ─────────
  function _getMap() { return window.map; }
  function _eventToPlanXY(e) {
    // Convert Leaflet LatLng → coord plan (cohérent avec road.js & zones.js)
    // CRS.Simple : lat = imageH - y, lng = x
    if (!e || !e.latlng) return null;
    const imageH = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
    return {
      x: e.latlng.lng,
      y: imageH - e.latlng.lat
    };
  }

  function _distPx(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function _currentActiveLevel() {
    return (window.APP_CONFIG && typeof window.APP_CONFIG.activeLevel === "number")
            ? window.APP_CONFIG.activeLevel : 0;
  }

  // ───────── EVENTS ─────────
  function _onDown(e) {
    if (!_active) return;
    const map = _getMap(); if (!map) return;
    const pt = _eventToPlanXY(e); if (!pt) return;

    _drawing = true;
    _lastTickAt = Date.now();
    _lastPoint = pt;

    // Snapshot HistoryManager AVANT mutation (pour Ctrl+Z atomique)
    if (window.HistoryManager && typeof window.HistoryManager.captureState === "function") {
      try { _historySnapshotBefore = window.HistoryManager.captureState(); } catch(err) {}
    }

    // Créer la nouvelle road freehand et l'ajouter à la liste
    _currentRoad = {
      type:          "freehand",
      level:         _currentActiveLevel(),
      points:        [{ x: pt.x, y: pt.y }],
      freehandColor: _prefs.color,
      freehandWidth: _prefs.width
    };

    if (window.getRoads && window.setRoads) {
      const all = window.getRoads() || [];
      all.push(_currentRoad);
      window.setRoads(all);
    }

    if (typeof window.renderRoads === "function") {
      try { window.renderRoads(); } catch(err) {}
    }

    // Empêcher le drag map pendant le dessin (sinon la carte se déplace
    // sous nos pieds → freehand bizarre). On désactive temporairement.
    if (map.dragging && map.dragging.disable) map.dragging.disable();
  }

  function _onMove(e) {
    if (!_active || !_drawing || !_currentRoad) return;
    const now = Date.now();
    if (now - _lastTickAt < TICK_MS) return;  // throttle ≈60Hz
    _lastTickAt = now;

    const pt = _eventToPlanXY(e); if (!pt) return;
    // Anti-spam : skip si trop proche du dernier
    if (_lastPoint && _distPx(_lastPoint, pt) < MIN_POINT_DIST_PX) return;

    _currentRoad.points.push({ x: pt.x, y: pt.y });
    _lastPoint = pt;

    // Re-render léger (la road est déjà dans la liste, on re-trace juste)
    if (typeof window.renderRoads === "function") {
      try { window.renderRoads(); } catch(err) {}
    }
  }

  function _onUp(e) {
    if (!_active) return;
    const map = _getMap();
    if (map && map.dragging && map.dragging.enable) map.dragging.enable();

    if (!_drawing || !_currentRoad) { _drawing = false; return; }

    // Si le trait est trop court (< 2 points utilisables), on annule
    if (!_currentRoad.points || _currentRoad.points.length < 2) {
      if (window.getRoads && window.setRoads) {
        const all = (window.getRoads() || []).filter(function(r) { return r !== _currentRoad; });
        window.setRoads(all);
      }
      if (typeof window.renderRoads === "function") {
        try { window.renderRoads(); } catch(err) {}
      }
      _drawing = false;
      _currentRoad = null;
      _historySnapshotBefore = null;
      return;
    }

    // RDP smoothing post-capture pour réduire le nombre de points
    const before = _currentRoad.points.length;
    const eps = _epsilonForZoom();
    _currentRoad.points = _rdpItera(_currentRoad.points, eps);
    const after = _currentRoad.points.length;
    if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
      console.log("[Freehand] RDP eps=" + eps.toFixed(2) + " " + before + " → " + after + " pts");
    }

    // Re-render après simplification
    if (typeof window.renderRoads === "function") {
      try { window.renderRoads(); } catch(err) {}
    }

    // HistoryManager.record pour Ctrl+Z atomique
    if (window.HistoryManager && typeof window.HistoryManager.record === "function" && _historySnapshotBefore) {
      try { window.HistoryManager.record("Dessin libre (" + after + " pts)", _historySnapshotBefore); } catch(err) {}
    }

    // Force save SessionPersist pour ne pas attendre le polling 1.5s
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch(err) {}
    }

    _drawing = false;
    _currentRoad = null;
    _historySnapshotBefore = null;
    _lastPoint = null;
  }

  // Touch events : translate vers Leaflet event format minimal pour _eventToPlanXY
  function _touchToLeafletEvent(touchEvt) {
    const map = _getMap(); if (!map) return null;
    const t = touchEvt.touches && touchEvt.touches[0];
    if (!t) return null;
    const rect = map.getContainer().getBoundingClientRect();
    const px = t.clientX - rect.left;
    const py = t.clientY - rect.top;
    const latlng = map.containerPointToLatLng([px, py]);
    return { latlng: latlng };
  }
  function _onTouchStart(e) { if (_active) { e.preventDefault(); _onDown(_touchToLeafletEvent(e)); } }
  function _onTouchMove(e)  { if (_active && _drawing) { e.preventDefault(); _onMove(_touchToLeafletEvent(e)); } }
  function _onTouchEnd(e)   { if (_active) { _onUp(e); } }

  // ───────── API ─────────
  function activer() {
    if (_active) return;
    const map = _getMap();
    if (!map) {
      console.warn("[Freehand] window.map indispo — impossible d'activer");
      return;
    }
    _active = true;
    map.on("mousedown", _onDown);
    map.on("mousemove", _onMove);
    map.on("mouseup",   _onUp);
    // Touch sur le container DOM (Leaflet event ne fire pas mousedown sur touch)
    const cont = map.getContainer();
    if (cont) {
      cont.addEventListener("touchstart", _onTouchStart, { passive: false });
      cont.addEventListener("touchmove",  _onTouchMove,  { passive: false });
      cont.addEventListener("touchend",   _onTouchEnd,   { passive: false });
    }
    // Curseur crayon
    if (cont) cont.style.cursor = "crosshair";
    // Désactive la sélection text accidentelle sur drag
    if (cont) cont.style.userSelect = "none";
  }

  function desactiver() {
    if (!_active) return;
    const map = _getMap();
    if (map) {
      map.off("mousedown", _onDown);
      map.off("mousemove", _onMove);
      map.off("mouseup",   _onUp);
      const cont = map.getContainer();
      if (cont) {
        cont.removeEventListener("touchstart", _onTouchStart);
        cont.removeEventListener("touchmove",  _onTouchMove);
        cont.removeEventListener("touchend",   _onTouchEnd);
        cont.style.cursor = "";
        cont.style.userSelect = "";
      }
      // Réactiver le drag si on l'avait coupé en cours de dessin
      if (map.dragging && map.dragging.enable) map.dragging.enable();
    }
    _active = false;
    _drawing = false;
    _currentRoad = null;
    _historySnapshotBefore = null;
    _lastPoint = null;
  }

  function isActive() { return _active; }

  function toggle() {
    if (_active) desactiver(); else activer();
    return _active;
  }

  function getPrefs() { return { color: _prefs.color, width: _prefs.width }; }

  function setPrefs(newPrefs) {
    if (!newPrefs) return;
    if (newPrefs.color) _prefs.color = String(newPrefs.color);
    if (typeof newPrefs.width === "number" && newPrefs.width >= 1 && newPrefs.width <= 20) {
      _prefs.width = newPrefs.width;
    }
    _savePrefs(_prefs);
  }

  window.Freehand = {
    activer:    activer,
    desactiver: desactiver,
    isActive:   isActive,
    toggle:     toggle,
    getPrefs:   getPrefs,
    setPrefs:   setPrefs,
    // Debug
    _LS_KEY:    LS_KEY
  };
})();
