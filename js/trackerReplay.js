/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// trackerReplay.js — rejoue le parcours du tracker depuis sa timeline datée
// (tracking.js > getTrackingTimeline : recalages + points PDR, t = Date.now(), deltaMs depuis le
// départ ; en RAM seulement) : trail entier + marqueur mobile, vitesse 0.5× à 10×, export CSV.
// Au play, la modale passe en panneau compact pour laisser voir et toucher la carte.
// Expose : window.MyKTAMapTrackerReplay { ouvrirModale (rien si timeline vide), fermer (changement
//   de plan) }
// Doc : docs/architecture/tracking.md

(function() {
  "use strict";

  let _modal       = null;
  let _trailLayer  = null;
  let _markerLayer = null;
  let _playTimer   = null;
  let _currentIdx  = 0;
  let _speed       = 1;     // 0.5 / 1 / 2 / 5 / 10
  let _timeline    = [];    // copie prise à l'ouverture

  // ── Styles injectés (idempotent) ──────────────────────────────
  function _injecterStyles() {
    if (document.getElementById("kta-trkrepl-styles")) return;
    const s = document.createElement("style");
    s.id = "kta-trkrepl-styles";
    s.textContent = `
      .kta-trkrepl-modal-boite {
        max-width: 720px !important;
        height: auto !important;
        max-height: 90vh !important;
      }
      .kta-trkrepl-controls {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        margin-bottom: 12px;
      }
      .kta-trkrepl-btn {
        padding: 8px 14px;
        border: 1px solid rgba(140, 180, 255, 0.3);
        background: rgba(140, 180, 255, 0.08);
        color: #c8d0e0;
        border-radius: 6px;
        cursor: pointer;
        font-family: inherit;
        font-size: 14px;
        transition: background 0.12s;
      }
      .kta-trkrepl-btn:hover { background: rgba(140, 180, 255, 0.18); }
      .kta-trkrepl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .kta-trkrepl-btn.kta-trkrepl-btn-primary {
        background: #f4c542;
        color: #1a1f2e;
        border-color: #f4c542;
        font-weight: 700;
      }
      .kta-trkrepl-btn.kta-trkrepl-btn-primary:hover { background: #ffd860; }
      .kta-trkrepl-speed {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .kta-trkrepl-speed-label {
        font-size: 12px;
        color: #8892a4;
      }
      .kta-trkrepl-speed select {
        padding: 6px 10px;
        background: rgba(255,255,255,0.06);
        color: #e8eaf0;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 5px;
        font-family: inherit;
      }
      .kta-trkrepl-timeline {
        width: 100%;
        height: 36px;
        accent-color: #f4c542;
        cursor: pointer;
      }
      .kta-trkrepl-info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        padding: 12px;
        background: rgba(244, 197, 66, 0.06);
        border: 1px solid rgba(244, 197, 66, 0.22);
        border-radius: 8px;
        margin-bottom: 12px;
      }
      .kta-trkrepl-info-bloc {
        text-align: center;
      }
      .kta-trkrepl-info-label {
        font-size: 11px;
        color: #8892a4;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 4px;
      }
      .kta-trkrepl-info-value {
        font-size: 18px;
        font-weight: 700;
        color: #f4c542;
        font-variant-numeric: tabular-nums;
      }
      .kta-trkrepl-info-sub {
        font-size: 12px;
        color: #c8d0e0;
        margin-top: 2px;
      }
      .kta-trkrepl-export {
        margin-top: 12px;
        padding: 10px 12px;
        background: rgba(140, 180, 255, 0.06);
        border: 1px solid rgba(140, 180, 255, 0.2);
        border-radius: 6px;
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
      }
      .kta-trkrepl-export-info {
        font-size: 12.5px;
        color: #c8d0e0;
      }

      /* Trail + marker mobile sur la carte principale (overlays Leaflet) */
      .kta-trkrepl-trail-pane svg path {
        stroke: #ffaa00;
        stroke-width: 4;
        fill: none;
        opacity: 0.6;
      }

      /* 🆕 v1.11.3-fix (KARMA "modal reste ouvert, tout se passe derrière") :
         mode COMPACT activé au Play → la modale se transforme en panneau
         flottant bas-centre, overlay backdrop pass-through, l'user voit la
         carte avec le marker mobile + trail. Bouton ⛶ pour revenir normal. */
      #kta-trkrepl-modal.kta-trkrepl-modal-compact {
        align-items: flex-end !important;
        justify-content: center !important;
        background: transparent !important;  /* backdrop transparent = carte cliquable */
        pointer-events: none !important;     /* PARENT pass-through */
        padding: 0 !important;
      }
      #kta-trkrepl-modal.kta-trkrepl-modal-compact .kta-trkrepl-modal-boite {
        pointer-events: auto !important;     /* enfant interactif (le panneau) */
        max-width: 720px !important;
        width: min(720px, 96vw) !important;
        max-height: none !important;
        margin-bottom: 16px;
        box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.5);
        border-radius: 12px 12px 0 0 !important;
      }
      #kta-trkrepl-modal.kta-trkrepl-modal-compact .kta-readme-modal-corps {
        padding: 10px 14px !important;
        max-height: 280px;
        overflow-y: auto;
      }
      /* En compact, on garde info + slider + contrôles, on réduit padding
         pour gain place. Bloc info passe en 2 colonnes serrées. */
      #kta-trkrepl-modal.kta-trkrepl-modal-compact .kta-trkrepl-info {
        padding: 8px;
        margin-bottom: 8px;
      }
      #kta-trkrepl-modal.kta-trkrepl-modal-compact .kta-trkrepl-info-value {
        font-size: 15px;
      }
      #kta-trkrepl-modal.kta-trkrepl-modal-compact .kta-trkrepl-info-sub {
        font-size: 11px;
      }
      #kta-trkrepl-modal.kta-trkrepl-modal-compact .kta-trkrepl-controls {
        padding: 8px;
        margin-bottom: 6px;
      }
      /* En compact, on cache le bloc export pour laisser la carte respirer.
         Si l'user veut exporter il revient en mode normal via ⛶. */
      #kta-trkrepl-modal.kta-trkrepl-modal-compact .kta-trkrepl-export {
        display: none;
      }

      /* Bouton icône style (pour le ⛶ dans le header) */
      .kta-trkrepl-btn-icon {
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.14);
        color: #c8d0e0;
        width: 32px;
        height: 32px;
        padding: 0;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        font-family: inherit;
        transition: background 0.12s;
      }
      .kta-trkrepl-btn-icon:hover { background: rgba(255,255,255,0.12); }
    `;
    document.head.appendChild(s);
  }

  // ── Format du temps ──────────────────────────────
  function _formatHHMMSS(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return hh + ":" + mm + ":" + ss;
  }
  function _formatDelta(ms) {
    if (typeof ms !== "number" || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    if (m < 1) return "+" + s + "s";
    if (m < 60) return "+" + m + "min " + (s % 60) + "s";
    const h = Math.floor(m / 60);
    return "+" + h + "h " + (m % 60) + "min";
  }
  function _formatTypeIcon(type) {
    if (type === "start")    return "🟢";
    if (type === "recalage") return "📍";
    if (type === "pdr")      return "🚶";
    return "•";
  }

  // ── Ouverture / fermeture ──────────────────────────────
  function ouvrirModale() {
    _injecterStyles();
    if (_modal) { _modal.remove(); _modal = null; }

    _timeline = (typeof window.getTrackingTimeline === "function")
      ? window.getTrackingTimeline()
      : [];

    if (_timeline.length < 2) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("replay.empty.toast"), "warn");
      } else {
        window.ktaAlerte(window.I18n.t("replay.empty.alert"));
      }
      return;
    }

    _currentIdx = 0;
    _speed = 1;

    const _distStr = (typeof window.getTrackingDistanceM === "function")
      ? ((typeof window.formatDistance === "function" ? window.formatDistance(window.getTrackingDistanceM(), 1) : window.getTrackingDistanceM().toFixed(1) + " m"))
      : "—";
    const _exportInfo = window.I18n.t("replay.export.info", {
      n: _timeline.length,
      duree: _formatDelta(_timeline[_timeline.length - 1].deltaMs),
      dist: _distStr
    });

    const modal = document.createElement("div");
    modal.id = "kta-trkrepl-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-trkrepl-modal-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + window.I18n.t("replay.modal.titre") + '</span>' +
          '<button class="kta-trkrepl-btn-icon" id="kta-trkrepl-fullscreen" type="button" title="' + window.I18n.t("replay.compact.reduce") + '" style="margin-right:8px;">▭</button>' +
          '<button class="kta-panneau-close" id="kta-trkrepl-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +

          '<div class="kta-trkrepl-info">' +
            '<div class="kta-trkrepl-info-bloc">' +
              '<div class="kta-trkrepl-info-label">' + window.I18n.t("replay.info.heure") + '</div>' +
              '<div class="kta-trkrepl-info-value" id="kta-trkrepl-time">—</div>' +
              '<div class="kta-trkrepl-info-sub" id="kta-trkrepl-delta">—</div>' +
            '</div>' +
            '<div class="kta-trkrepl-info-bloc">' +
              '<div class="kta-trkrepl-info-label">' + window.I18n.t("replay.info.point") + '</div>' +
              '<div class="kta-trkrepl-info-value" id="kta-trkrepl-idx">— / —</div>' +
              '<div class="kta-trkrepl-info-sub" id="kta-trkrepl-type">—</div>' +
            '</div>' +
          '</div>' +

          '<input type="range" class="kta-trkrepl-timeline" id="kta-trkrepl-slider" min="0" max="' + (_timeline.length - 1) + '" value="0" step="1">' +

          '<div class="kta-trkrepl-controls">' +
            '<button class="kta-trkrepl-btn" id="kta-trkrepl-restart" title="' + window.I18n.t("replay.btn.restart") + '">⏮️</button>' +
            '<button class="kta-trkrepl-btn kta-trkrepl-btn-primary" id="kta-trkrepl-playpause" title="' + window.I18n.t("replay.btn.playpause") + '">▶️</button>' +
            '<button class="kta-trkrepl-btn" id="kta-trkrepl-end" title="' + window.I18n.t("replay.btn.end") + '">⏭️</button>' +
            '<div class="kta-trkrepl-speed">' +
              '<span class="kta-trkrepl-speed-label">' + window.I18n.t("replay.speed.label") + '</span>' +
              '<select id="kta-trkrepl-speed-sel">' +
                '<option value="0.5">0.5×</option>' +
                '<option value="1" selected>1×</option>' +
                '<option value="2">2×</option>' +
                '<option value="5">5×</option>' +
                '<option value="10">10×</option>' +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div class="kta-trkrepl-export">' +
            '<div class="kta-trkrepl-export-info">' + _exportInfo + '</div>' +
            '<button class="kta-trkrepl-btn" id="kta-trkrepl-export-csv">' + window.I18n.t("replay.export.btn") + '</button>' +
          '</div>' +

        '</div>' +
      '</div>';

    document.documentElement.appendChild(modal);
    _modal = modal;

    _renderTrailOnMap();
    _renderMarkerAtIdx(0);
    _updateInfoUI();

    document.getElementById("kta-trkrepl-close").addEventListener("click", fermer);
    // ⚠️ Le fond ne ferme qu'en mode normal : en compact il est transparent et laisse passer les
    // clics vers la carte.
    modal.addEventListener("click", function(e) {
      if (e.target === modal && !modal.classList.contains("kta-trkrepl-modal-compact")) {
        fermer();
      }
    });
    document.addEventListener("keydown", _onKey);

    const btnFs = document.getElementById("kta-trkrepl-fullscreen");
    if (btnFs) {
      btnFs.addEventListener("click", function() {
        const isCompact = modal.classList.contains("kta-trkrepl-modal-compact");
        _setCompactMode(!isCompact);
      });
    }

    const slider = document.getElementById("kta-trkrepl-slider");
    slider.addEventListener("input", function() {
      _stopPlay();
      _currentIdx = parseInt(slider.value);
      _renderMarkerAtIdx(_currentIdx);
      _updateInfoUI();
    });

    document.getElementById("kta-trkrepl-restart").addEventListener("click", function() {
      _stopPlay();
      _currentIdx = 0;
      slider.value = "0";
      _renderMarkerAtIdx(0);
      _updateInfoUI();
    });
    document.getElementById("kta-trkrepl-end").addEventListener("click", function() {
      _stopPlay();
      _currentIdx = _timeline.length - 1;
      slider.value = String(_currentIdx);
      _renderMarkerAtIdx(_currentIdx);
      _updateInfoUI();
    });
    document.getElementById("kta-trkrepl-playpause").addEventListener("click", _togglePlay);
    document.getElementById("kta-trkrepl-speed-sel").addEventListener("change", function(e) {
      _speed = parseFloat(e.target.value) || 1;
      if (_playTimer) { _stopPlay(); _startPlay(); }
    });
    document.getElementById("kta-trkrepl-export-csv").addEventListener("click", _exportCSV);
  }

  function _onKey(e) {
    if (!_modal) return;
    if (e.key === "Escape") fermer();
    else if (e.key === " ")  { e.preventDefault(); _togglePlay(); }
    else if (e.key === "ArrowLeft")  _seekRelative(-1);
    else if (e.key === "ArrowRight") _seekRelative(+1);
  }

  function fermer() {
    _stopPlay();
    if (_modal) { try { _modal.remove(); } catch(e) {} _modal = null; }
    if (_trailLayer)  { try { window.map.removeLayer(_trailLayer); } catch(e) {} _trailLayer  = null; }
    if (_markerLayer) { try { window.map.removeLayer(_markerLayer); } catch(e) {} _markerLayer = null; }
    document.removeEventListener("keydown", _onKey);
  }

  // ── Rendu carte : trail + marqueur mobile ──────────────────────────────
  function _renderTrailOnMap() {
    if (!window.map || !window.L) return;
    if (_trailLayer) try { window.map.removeLayer(_trailLayer); } catch(e) {}

    // Un recalage est une téléportation : il coupe le trail en segments.
    const segments = [];
    let current = [];
    for (let i = 0; i < _timeline.length; i++) {
      const p = _timeline[i];
      if (p.type === "recalage" || p.type === "start") {
        if (current.length > 1) segments.push(current);
        current = [];
      }
      current.push(convertCoord(p.x, p.y));
    }
    if (current.length > 1) segments.push(current);

    // Une seule polyline multi-segments (moins de compositing).
    _trailLayer = L.polyline(segments, {
      color: "#ffaa00",
      weight: 4,
      opacity: 0.55,
      interactive: false
    }).addTo(window.map);
  }

  function _renderMarkerAtIdx(idx) {
    if (!window.map || !window.L) return;
    if (idx < 0 || idx >= _timeline.length) return;
    const p = _timeline[idx];
    const latlng = convertCoord(p.x, p.y);
    if (!_markerLayer) {
      _markerLayer = L.circleMarker(latlng, {
        radius: 10,
        color: "#1a1f2e",
        weight: 3,
        fillColor: "#f4c542",
        fillOpacity: 1,
        interactive: false
      }).addTo(window.map);
    } else {
      _markerLayer.setLatLng(latlng);
    }
    // Recentrage sans animation (replay rapide).
    try {
      const bounds = window.map.getBounds();
      if (!bounds.contains(latlng)) {
        window.map.panTo(latlng, { animate: false });
      }
    } catch(e) {}
  }

  function _updateInfoUI() {
    const p = _timeline[_currentIdx];
    if (!p) return;
    const timeEl  = document.getElementById("kta-trkrepl-time");
    const deltaEl = document.getElementById("kta-trkrepl-delta");
    const idxEl   = document.getElementById("kta-trkrepl-idx");
    const typeEl  = document.getElementById("kta-trkrepl-type");
    if (timeEl)  timeEl.textContent  = _formatHHMMSS(p.t);
    if (deltaEl) deltaEl.textContent = _formatDelta(p.deltaMs);
    if (idxEl)   idxEl.textContent   = (_currentIdx + 1) + " / " + _timeline.length;
    if (typeEl)  typeEl.textContent  = _formatTypeIcon(p.type) + " " + p.type +
                                       (Number.isInteger(p.level) ? window.I18n.t("replay.info.levelSuffix", { lvl: p.level }) : "");
  }

  // ── Play / pause ──────────────────────────────
  function _togglePlay() {
    if (_playTimer) _stopPlay(); else _startPlay();
  }

  function _startPlay() {
    if (_playTimer) return;
    if (_currentIdx >= _timeline.length - 1) {
      _currentIdx = 0;
    }
    const btn = document.getElementById("kta-trkrepl-playpause");
    if (btn) btn.textContent = "⏸️";
    // Au play : panneau compact en bas, la carte reste visible (bouton ⛶ pour revenir).
    _setCompactMode(true);
    _tickPlay();
  }

  function _stopPlay() {
    if (_playTimer) { clearTimeout(_playTimer); _playTimer = null; }
    const btn = document.getElementById("kta-trkrepl-playpause");
    if (btn) btn.textContent = "▶️";
  }

  function _setCompactMode(compact) {
    if (!_modal) return;
    const box = _modal.querySelector(".kta-trkrepl-modal-boite");
    if (!box) return;
    if (compact) {
      _modal.classList.add("kta-trkrepl-modal-compact");
    } else {
      _modal.classList.remove("kta-trkrepl-modal-compact");
    }
    const btnFs = document.getElementById("kta-trkrepl-fullscreen");
    if (btnFs) btnFs.textContent = compact ? "⛶" : "▭";
    if (btnFs) btnFs.title = compact ? window.I18n.t("replay.compact.enlarge") : window.I18n.t("replay.compact.reduce");
  }

  function _tickPlay() {
    if (_currentIdx >= _timeline.length - 1) {
      _stopPlay();
      return;
    }
    const curr = _timeline[_currentIdx];
    const next = _timeline[_currentIdx + 1];
    let interval = next.deltaMs - curr.deltaMs;
    // Bornes : 50 ms (≤ 20 images/s) à 5 s (long arrêt).
    interval = Math.max(50, Math.min(5000, interval / _speed));

    _playTimer = setTimeout(function() {
      _currentIdx++;
      const slider = document.getElementById("kta-trkrepl-slider");
      if (slider) slider.value = String(_currentIdx);
      _renderMarkerAtIdx(_currentIdx);
      _updateInfoUI();
      _tickPlay();
    }, interval);
  }

  function _seekRelative(delta) {
    _stopPlay();
    const newIdx = Math.max(0, Math.min(_timeline.length - 1, _currentIdx + delta));
    _currentIdx = newIdx;
    const slider = document.getElementById("kta-trkrepl-slider");
    if (slider) slider.value = String(_currentIdx);
    _renderMarkerAtIdx(_currentIdx);
    _updateInfoUI();
  }

  // ── Export CSV ──────────────────────────────
  function _exportCSV() {
    // Une ligne par point ; colonne level seulement en multi-niveau.
    const mlvl = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel);
    const lines = [];
    const headers = ["timestamp_ms_epoch", "delta_ms_since_start", "x_plan", "y_plan", "type"];
    if (mlvl) headers.push("level");
    lines.push(headers.join(","));

    _timeline.forEach(function(p) {
      const cols = [
        String(p.t),
        String(p.deltaMs),
        p.x.toFixed(2),
        p.y.toFixed(2),
        p.type
      ];
      if (mlvl) cols.push(Number.isInteger(p.level) ? String(p.level) : "");
      lines.push(cols.join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "Plan";
    const safePlan = String(planName).replace(/[^a-zA-Z0-9_-]/g, "_");
    const date = new Date();
    const dateStr = date.getFullYear() + "-" +
                    String(date.getMonth() + 1).padStart(2, "0") + "-" +
                    String(date.getDate()).padStart(2, "0") + "_" +
                    String(date.getHours()).padStart(2, "0") + "h" +
                    String(date.getMinutes()).padStart(2, "0");
    const a = document.createElement("a");
    a.href = url;
    a.download = safePlan + "_tracker_" + dateStr + ".csv";
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    if (window.OOMGuard && window.OOMGuard.showToast) {
      window.OOMGuard.showToast(window.I18n.t("replay.export.toast", { n: _timeline.length }), "info");
    }
  }

  // ── API ──────────────────────────────
  window.MyKTAMapTrackerReplay = {
    ouvrirModale: ouvrirModale,
    fermer:       fermer
  };

  console.log("[TrackerReplay] Module chargé.");
})();
