/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 📸 PHOTO VIEWER — v1.9.3-B1c
// =========================
// Viewer plein écran pour visualiser les photos attachées à un point.
// Lecture pure (pas d'action delete ni download — ces actions passent par
// la modale d'édition du point, cf. CLAUDE.md §41+ pattern "une seule
// source d'édition").
//
// Features :
//   - Pinch-to-zoom maison (2 doigts, scale 1-4, center-based)
//   - Pan (1 doigt si zoom > 1, mouse drag PC si zoom > 1)
//   - Swipe horizontal pour photo précédente/suivante (1 doigt si zoom === 1)
//   - Flèches ◂ / ▸ overlay (PC + mobile)
//   - Compteur "N/M" + bouton ✕
//   - Échap, click backdrop, ✕ → close
//   - Auto-reset scale/translate à chaque changement de photo
//
// Pas de dep externe. ~280 lignes vanilla.
//
// API publique :
//   window.MyKTAMapPhotoViewer.open(photos, startIndex)
//     - photos : Array<{ _objectUrl: string, ... }>  (au minimum _objectUrl)
//     - startIndex : index de départ (0 par défaut)
//   window.MyKTAMapPhotoViewer.close()
//     - ferme le viewer (no-op si déjà fermé)
// =========================

(function() {
  "use strict";

  // ============================================================
  // STATE MODULE
  // ============================================================
  let _overlay     = null;
  let _img         = null;
  let _counter     = null;
  let _photos      = [];
  let _currentIdx  = 0;

  // Transform
  let _scale       = 1;
  let _translateX  = 0;
  let _translateY  = 0;
  const MIN_SCALE  = 1;
  const MAX_SCALE  = 4;

  // Touch state
  let _touchMode      = null;  // null | "pan" | "pinch" | "swipe"
  let _touchStartX    = 0;
  let _touchStartY    = 0;
  let _touchStartTX   = 0;
  let _touchStartTY   = 0;
  let _pinchStartDist = 0;
  let _pinchStartScale = 1;

  // Swipe state (horizontal)
  const SWIPE_THRESHOLD = 50;  // px de déplacement avant de déclencher prev/next

  // Mouse drag state (PC)
  let _mouseDragging = false;
  let _mouseStartX   = 0;
  let _mouseStartY   = 0;

  // ============================================================
  // UTILS
  // ============================================================
  function _applyTransform() {
    if (!_img) return;
    _img.style.transform = "translate(" + _translateX + "px, " + _translateY + "px) scale(" + _scale + ")";
  }

  function _resetTransform() {
    _scale = 1;
    _translateX = 0;
    _translateY = 0;
    _applyTransform();
  }

  function _distance(t1, t2) {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Clamp scale et translate pour pas perdre l'image hors viewport.
  // On limite translate à scale*viewport/2 pour qu'au moins 50% reste visible.
  function _clampTransform() {
    _scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, _scale));
    if (_scale === 1) {
      _translateX = 0;
      _translateY = 0;
      return;
    }
    // Marge tolérée = (scale - 1) * dimension / 2 (= image qui dépasse)
    if (_img) {
      const vw = _overlay.clientWidth;
      const vh = _overlay.clientHeight;
      const maxTX = vw * (_scale - 1) / 2;
      const maxTY = vh * (_scale - 1) / 2;
      _translateX = Math.max(-maxTX, Math.min(maxTX, _translateX));
      _translateY = Math.max(-maxTY, Math.min(maxTY, _translateY));
    }
  }

  function _updateCounter() {
    if (_counter) {
      _counter.textContent = (_currentIdx + 1) + " / " + _photos.length;
    }
  }

  function _updateImage() {
    if (!_img || !_photos[_currentIdx]) return;
    const src = _photos[_currentIdx]._objectUrl || _photos[_currentIdx].url || "";
    _img.src = src;
    _resetTransform();
    _updateCounter();
  }

  function _next() {
    if (_photos.length <= 1) return;
    _currentIdx = (_currentIdx + 1) % _photos.length;
    _updateImage();
  }

  function _prev() {
    if (_photos.length <= 1) return;
    _currentIdx = (_currentIdx - 1 + _photos.length) % _photos.length;
    _updateImage();
  }

  // ============================================================
  // TOUCH HANDLERS
  // ============================================================
  function _onTouchStart(ev) {
    if (!ev.touches) return;
    if (ev.touches.length === 1) {
      // 1 doigt : panning (si zoom > 1) ou swipe (si zoom === 1)
      _touchMode = (_scale > 1) ? "pan" : "swipe";
      _touchStartX  = ev.touches[0].clientX;
      _touchStartY  = ev.touches[0].clientY;
      _touchStartTX = _translateX;
      _touchStartTY = _translateY;
    } else if (ev.touches.length === 2) {
      // 2 doigts : pinch zoom
      _touchMode = "pinch";
      _pinchStartDist  = _distance(ev.touches[0], ev.touches[1]);
      _pinchStartScale = _scale;
    }
  }

  function _onTouchMove(ev) {
    if (!ev.touches || !_touchMode) return;
    ev.preventDefault();  // empêcher le scroll natif derrière le viewer
    if (_touchMode === "pinch" && ev.touches.length === 2) {
      const d = _distance(ev.touches[0], ev.touches[1]);
      if (_pinchStartDist > 0) {
        _scale = _pinchStartScale * (d / _pinchStartDist);
        _clampTransform();
        _applyTransform();
      }
    } else if (_touchMode === "pan" && ev.touches.length === 1) {
      const dx = ev.touches[0].clientX - _touchStartX;
      const dy = ev.touches[0].clientY - _touchStartY;
      _translateX = _touchStartTX + dx;
      _translateY = _touchStartTY + dy;
      _clampTransform();
      _applyTransform();
    } else if (_touchMode === "swipe" && ev.touches.length === 1) {
      // Swipe horizontal : on suit le doigt visuellement (translateX live)
      // mais on ne déclenche prev/next qu'au touchend.
      const dx = ev.touches[0].clientX - _touchStartX;
      _img.style.transform = "translate(" + dx + "px, 0) scale(1)";
    }
  }

  function _onTouchEnd(ev) {
    if (_touchMode === "swipe") {
      // Calcule le dx final via la dernière position du touchmove
      // (ev.changedTouches[0] référence le doigt qui vient de lever)
      let dx = 0;
      if (ev.changedTouches && ev.changedTouches[0]) {
        dx = ev.changedTouches[0].clientX - _touchStartX;
      }
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx > 0) _prev();
        else        _next();
      } else {
        // Snap back
        _applyTransform();
      }
    }
    _touchMode = null;
  }

  // ============================================================
  // MOUSE HANDLERS (PC drag pan quand zoomé)
  // ============================================================
  function _onMouseDown(ev) {
    if (_scale <= 1) return;  // pas de drag si pas zoomé
    _mouseDragging = true;
    _mouseStartX = ev.clientX - _translateX;
    _mouseStartY = ev.clientY - _translateY;
    if (_img) _img.style.cursor = "grabbing";
    ev.preventDefault();
  }

  function _onMouseMove(ev) {
    if (!_mouseDragging) return;
    _translateX = ev.clientX - _mouseStartX;
    _translateY = ev.clientY - _mouseStartY;
    _clampTransform();
    _applyTransform();
  }

  function _onMouseUp() {
    if (_mouseDragging) {
      _mouseDragging = false;
      if (_img) _img.style.cursor = _scale > 1 ? "grab" : "default";
    }
  }

  // Wheel : zoom in/out PC (alternative au pinch tactile)
  function _onWheel(ev) {
    if (!_img) return;
    ev.preventDefault();
    const delta = ev.deltaY > 0 ? -0.15 : 0.15;
    _scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, _scale + delta));
    if (_scale === 1) { _translateX = 0; _translateY = 0; }
    _clampTransform();
    _applyTransform();
    if (_img) _img.style.cursor = _scale > 1 ? "grab" : "default";
  }

  // ============================================================
  // KEYBOARD
  // ============================================================
  function _onKeyDown(ev) {
    if (!_overlay) return;
    switch (ev.key) {
      case "Escape":     close(); break;
      case "ArrowLeft":  _prev(); break;
      case "ArrowRight": _next(); break;
      case "+": case "=":
        _scale = Math.min(MAX_SCALE, _scale + 0.25);
        _clampTransform(); _applyTransform();
        break;
      case "-": case "_":
        _scale = Math.max(MIN_SCALE, _scale - 0.25);
        if (_scale === 1) { _translateX = 0; _translateY = 0; }
        _clampTransform(); _applyTransform();
        break;
      case "0":
        _resetTransform();
        break;
    }
  }

  // ============================================================
  // OPEN / CLOSE
  // ============================================================
  function open(photos, startIndex) {
    if (!Array.isArray(photos) || photos.length === 0) {
      console.warn("[PhotoViewer] open : photos vide");
      return;
    }
    if (_overlay) close();  // cleanup d'une instance précédente

    _photos = photos;
    _currentIdx = Math.max(0, Math.min(photos.length - 1, startIndex || 0));
    _scale = 1; _translateX = 0; _translateY = 0;

    _overlay = document.createElement("div");
    _overlay.className = "kta-photo-viewer-overlay";
    _overlay.innerHTML =
      '<div class="kta-photo-viewer-header">' +
        '<span class="kta-photo-viewer-counter">1 / 1</span>' +
        '<button type="button" class="kta-photo-viewer-close" title="' + window.I18n.t("photoviewer.close") + '">✕</button>' +
      '</div>' +
      '<div class="kta-photo-viewer-viewport">' +
        '<img class="kta-photo-viewer-img" alt="photo">' +
      '</div>' +
      '<button type="button" class="kta-photo-viewer-nav kta-photo-viewer-nav-prev" title="' + window.I18n.t("photoviewer.prev") + '">◂</button>' +
      '<button type="button" class="kta-photo-viewer-nav kta-photo-viewer-nav-next" title="' + window.I18n.t("photoviewer.next") + '">▸</button>';
      // 🆕 v1.9.3-B1d-fix4 (KARMA "enlève la note qui explique comment
      // zoomer") : retrait du hint en bas. Les gestures sont devenus
      // évidentes pour l'user après une utilisation, et le hint masquait
      // une partie de l'image en landscape mobile.

    document.documentElement.appendChild(_overlay);

    _img     = _overlay.querySelector(".kta-photo-viewer-img");
    _counter = _overlay.querySelector(".kta-photo-viewer-counter");

    // Cache la nav si 1 seule photo
    if (_photos.length <= 1) {
      const prevBtn = _overlay.querySelector(".kta-photo-viewer-nav-prev");
      const nextBtn = _overlay.querySelector(".kta-photo-viewer-nav-next");
      if (prevBtn) prevBtn.style.display = "none";
      if (nextBtn) nextBtn.style.display = "none";
    }

    // Listeners
    _overlay.querySelector(".kta-photo-viewer-close").addEventListener("click", close);
    const prev = _overlay.querySelector(".kta-photo-viewer-nav-prev");
    const next = _overlay.querySelector(".kta-photo-viewer-nav-next");
    if (prev) prev.addEventListener("click", _prev);
    if (next) next.addEventListener("click", _next);

    // Click backdrop = close (mais pas clic sur l'image ou les boutons)
    _overlay.addEventListener("click", function(ev) {
      if (ev.target === _overlay || ev.target.classList.contains("kta-photo-viewer-viewport")) {
        close();
      }
    });

    // Touch (passive false pour pouvoir preventDefault le scroll natif)
    _img.addEventListener("touchstart", _onTouchStart, { passive: false });
    _img.addEventListener("touchmove",  _onTouchMove,  { passive: false });
    _img.addEventListener("touchend",   _onTouchEnd);
    _img.addEventListener("touchcancel", _onTouchEnd);

    // Mouse drag PC
    _img.addEventListener("mousedown", _onMouseDown);
    window.addEventListener("mousemove", _onMouseMove);
    window.addEventListener("mouseup",   _onMouseUp);

    // Wheel zoom PC
    _img.addEventListener("wheel", _onWheel, { passive: false });

    // Empêche le drag natif du navigateur (icône fantôme image)
    _img.addEventListener("dragstart", function(ev) { ev.preventDefault(); });

    // Keyboard
    document.addEventListener("keydown", _onKeyDown);

    // Empêcher Leaflet de capturer les events
    if (typeof L !== "undefined" && L.DomEvent) {
      L.DomEvent.disableClickPropagation(_overlay);
    }

    _updateImage();
    console.log("[PhotoViewer] Ouvert (" + _photos.length + " photos, index " + _currentIdx + ")");
  }

  function close() {
    if (!_overlay) return;
    // Cleanup listeners window (les listeners sur _overlay/_img sont
    // remove automatiquement avec le remove du DOM)
    window.removeEventListener("mousemove", _onMouseMove);
    window.removeEventListener("mouseup",   _onMouseUp);
    document.removeEventListener("keydown", _onKeyDown);

    _overlay.remove();
    _overlay = null;
    _img = null;
    _counter = null;
    _photos = [];
    _currentIdx = 0;
    _touchMode = null;
    _mouseDragging = false;
    console.log("[PhotoViewer] Fermé");
  }

  // ============================================================
  // EXPORT GLOBAL
  // ============================================================
  window.MyKTAMapPhotoViewer = {
    open:    open,
    close:   close,
    isOpen:  function() { return _overlay !== null; }
  };

  console.log("[PhotoViewer] Module chargé");
})();
